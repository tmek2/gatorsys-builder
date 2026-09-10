/* Getting the mockup out.
 *
 * Four ways, and each answers a different question. A PNG is for a document or
 * a Discord message about a Discord message. The project file is for coming
 * back to it later or handing it to somebody else. The message JSON is for a
 * bot that has to send the real thing. A share link is for showing it to one
 * person without either of you saving anything.
 */

const download = (url, name) => {
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
};

const safeName = (name) =>
  (name || "mockup").toLowerCase().replace(/[^\w-]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "mockup";

export async function exportPng(node, project) {
  const { toPng } = await import("html-to-image");
  // Waiting on the fonts means the raster has the real face in it rather than
  // the fallback the browser was still showing when the click landed.
  await document.fonts.ready;

  /* Which message is picked is a fact about the editor, not about the mockup,
     so it must not be in the picture. It cannot be stripped by the filter
     below — that removes whole nodes, and the selected message is a node we
     need — so the surface is flagged and the stylesheet drops the treatment
     for the duration. */
  node.setAttribute("data-exporting", "true");
  try {
    return await withLocalPictures(node, async () => {
      const url = await toPng(node, options(project));
      download(url, `${safeName(project.name)}.png`);
    });
  } finally {
    node.removeAttribute("data-exporting");
  }
}

/* Every picture in the mockup, fetched, for the length of one export.
 *
 * A picture the browser loaded from somebody else's server taints the canvas
 * the raster goes through, and a tainted canvas cannot be read back — so one
 * linked image failed the whole export, with a message telling you to upload
 * it instead. That is a fair thing to say about a picture you pasted a link
 * to and a useless thing to say about a GIF you picked out of the GIF picker.
 *
 * The picker brings its own pictures in now, so this is the safety net: a
 * mockup that arrived from a share link, an imported payload full of CDN
 * URLs, a link typed into a field. Each one is fetched through this
 * deployment's route, which makes it same-origin, swapped in for the length
 * of the raster and put back afterwards. What is stored does not change.
 *
 * Anything that cannot be fetched is left as it was: it may well be a picture
 * that would have exported fine, and failing early over it would be the bug
 * this exists to fix.
 */
async function withLocalPictures(node, run) {
  const remote = [...node.querySelectorAll("img, video")].filter((el) =>
    /^https?:\/\//i.test(el.getAttribute("src") ?? ""),
  );

  const swapped = [];
  await Promise.all(
    remote.map(async (el) => {
      const was = el.getAttribute("src");
      const now = await fetched(was);
      if (!now) return;
      swapped.push([el, was]);
      el.setAttribute("src", now);
    }),
  );

  /* Drawn before it is rasterised. An `<img>` whose source changed a
     millisecond ago has nothing to paint yet, and html-to-image would
     photograph the gap. */
  await Promise.all(swapped.map(([el]) => el.decode?.().catch(() => {})));

  try {
    return await run();
  } finally {
    for (const [el, was] of swapped) el.setAttribute("src", was);
  }
}

async function fetched(url) {
  try {
    const response = await fetch(`/api/media?url=${encodeURIComponent(url)}`);
    if (!response.ok) return null;
    const blob = await response.blob();
    if (!blob.size) return null;
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/* The phone's outer corner radius.
 *
 * The whole device is what gets rasterised now — the bezel and the body's own
 * corners are part of what a phone mockup is, and exporting the screen alone
 * handed back a rounded rectangle of chat with no phone around it. So this is
 * the body's radius, matching the frame the editor draws, rather than the
 * glass radius inside it. */
const PHONE_BODY_RADIUS = 64;

/* How the mockup is rasterised, in one place, because the still export and the
   animated one have to agree about it exactly — a GIF whose frames are framed
   differently from the PNG is two bugs, not one feature. */
function options(project, { scale } = {}) {
  const canvas = project.canvas ?? {};
  const radius = canvas.platform === "mobile" ? PHONE_BODY_RADIUS : (canvas.radius ?? 0);
  return {
    pixelRatio: scale ?? canvas.scale ?? 2,
    cacheBust: false,
    // The stage applies a zoom transform for the editor's own benefit; the
    // export is of the message, not of how far it happens to be zoomed.
    style: {
      transform: "none",
      zoom: "1",
      boxShadow: "none",
      borderRadius: `${radius}px`,
      // Without this the children paint over the rounded corners and the
      // radius is invisible in the raster.
      overflow: "hidden",
    },
    filter: (el) => !el.classList?.contains("e-no-export"),
  };
}

/* The mockup as an animation.
 *
 * A GIF in a mockup is the reason the GIF picker exists, and a PNG export
 * throws it away — you get the first frame of the joke. This exports what is
 * actually on the screen.
 *
 * The shape of it: every animation in the mockup is read apart into its
 * frames, a common timeline is laid over all of them, and at each step every
 * animated picture is set to the frame it would be showing at that moment and
 * the whole mockup is rasterised. The browser does the layout, the clipping
 * and the rounding on every frame, so an animated export is framed exactly
 * like the still one rather than approximately like it.
 *
 * Costs: one raster per frame, which is the expensive part, so the timeline is
 * sampled rather than followed exactly — 20 frames a second, capped — and the
 * caller is handed progress to show, because a silent ten seconds reads as a
 * hang.
 */

/* One raster per frame is the whole cost of this, so there is a ceiling on how
   many frames an export will draw. Past it the timeline falls back to an even
   grid of this many. A hundred at a typical 60ms a frame is six seconds of
   animation, which is longer than any reaction GIF. */
const MAX_STEPS = 100;

/* Whether the mockup looks as though it has an animation in it.
 *
 * This decides whether to *offer* the GIF export, so it runs on every edit and
 * has to be cheap: it walks the project for strings that could be a picture
 * and stops at the first one that moves, rather than serialising a project
 * that may be several megabytes of inlined images. `findAnimations` is the
 * real answer, and it is paid for once, when the button is actually pressed.
 *
 * The webp case is why this is not a regular expression over the text. Every
 * still photograph uploaded here is re-encoded as webp, so "it is a webp" says
 * nothing — the animation flag in the file's own header is what says it, and
 * that is four bytes in. Getting this wrong would put a GIF button on almost
 * every mockup and then tell whoever pressed it that nothing moves. */
const GIF_URL = /\.gif(\?|#|$)/i;

/* A webp says whether it animates in the extended-format chunk: "VP8X" twelve
   bytes in, and bit 1 of the flags byte after its length. A still webp has no
   VP8X chunk at all. */
function webpAnimates(uri) {
  const comma = uri.indexOf(",");
  if (comma < 0 || typeof atob !== "function") return false;
  try {
    const head = atob(uri.slice(comma + 1, comma + 61));
    if (head.slice(0, 4) !== "RIFF" || head.slice(8, 12) !== "WEBP") return false;
    if (head.slice(12, 16) !== "VP8X") return false;
    return (head.charCodeAt(20) & 0x02) !== 0;
  } catch {
    return false;
  }
}

function looksAnimated(value) {
  if (typeof value !== "string" || value.length < 16) return false;
  if (value.startsWith("data:image/gif")) return true;
  if (value.startsWith("data:image/webp")) return webpAnimates(value);
  if (value.startsWith("data:")) return false;
  return /^https?:/i.test(value) && GIF_URL.test(value);
}

export function hasAnimation(project) {
  const seen = new Set();
  const walk = (value) => {
    if (looksAnimated(value)) return true;
    if (Array.isArray(value)) return value.some(walk);
    if (value && typeof value === "object") {
      /* A project is a tree, but a shared reference would otherwise be walked
         twice and a cycle would not come back at all. */
      if (seen.has(value)) return false;
      seen.add(value);
      return Object.values(value).some(walk);
    }
    return false;
  };
  return walk(project);
}

/** Whether there is anything in this node worth exporting as an animation. */
export async function findAnimations(node) {
  const { decodeAnimation } = await import("./animate");
  const pictures = [...node.querySelectorAll("img")].filter(
    (el) => !el.closest(".e-no-export"),
  );
  const found = [];
  for (const el of pictures) {
    const animation = await decodeAnimation(el.currentSrc || el.src);
    if (animation) found.push({ el, animation });
  }
  return found;
}

/**
 * Export the mockup as an animated GIF.
 *
 * @param report called with a number from 0 to 1 as the frames are drawn.
 * @returns `{ error }` when there was nothing to animate, nothing otherwise.
 */
export async function exportGif(node, project, report = () => {}) {
  const [{ toCanvas }, { GIFEncoder, quantize, applyPalette }, { bitmapToUrl, frameAt, timeline }] =
    await Promise.all([import("html-to-image"), import("gifenc"), import("./animate")]);
  await document.fonts.ready;

  node.setAttribute("data-exporting", "true");
  try {
    return await withLocalPictures(node, async () => {
      const moving = await findAnimations(node);
      if (!moving.length) {
        return { error: "Nothing in this mockup moves. Export it as a picture instead." };
      }

      /* The source's own frame boundaries, so the export plays at the speed
         the GIF was made at rather than at whatever grid was convenient. */
      const steps = timeline(moving.map((m) => m.animation), MAX_STEPS);

      /* Each source frame is turned into something an `<img>` will take once,
         here, rather than once per step: the same frame is shown at several
         steps and encoding it again each time is the whole cost of the export
         paid twice. */
      const stills = moving.map(() => new Map());

      /* What each picture was showing before any of this. The export drives
         them frame by frame through their own `src`, and without putting them
         back the mockup is left frozen on whichever frame the last step
         happened to be — a still picture where the animation was. */
      const was = moving.map(({ el }) => el.getAttribute("src"));

      /* Show the frame each animation is on at `at`, and hand back the raster. */
      const drawAt = async (at) => {
        await Promise.all(
          moving.map(async ({ el, animation }, i) => {
            const frame = frameAt(animation, at);
            let url = stills[i].get(frame);
            if (!url) {
              url = bitmapToUrl(frame.bitmap);
              stills[i].set(frame, url);
            }
            if (el.getAttribute("src") === url) return;
            el.setAttribute("src", url);
            await el.decode?.().catch(() => {});
          }),
        );
        const canvas = await toCanvas(node, options(project, { scale: gifScale(project) }));
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        return ctx.getImageData(0, 0, canvas.width, canvas.height);
      };

      const encoder = GIFEncoder();
      let size = null;
      let palette = null;
      let moved = false;
      let previous = null;

      try {
        for (let step = 0; step < steps.length; step += 1) {
          const { at, delay } = steps[step];
          const { data, width, height } = await drawAt(at);

          /* Every frame the same size, because a GIF has one canvas and a
             raster that came back a pixel taller would shear the rest of the
             file. */
          size ??= { width, height };
          if (width !== size.width || height !== size.height) continue;

          /* One palette for the whole file, built from the first frame.
             A palette per frame re-dithers the flat background every time, so
             a mockup that is mostly one colour shimmers all over while the
             one thing that is actually moving gets lost in it. */
          palette ??= quantize(data, 256, { format: "rgb565" });
          encoder.writeFrame(applyPalette(data, palette, "rgb565"), width, height, {
            palette: step === 0 ? palette : undefined,
            delay,
            transparent: false,
          });

          /* Did anything actually change? A decoder that hands back the same
             frame under different indices produces a file that is an animation
             in name only, and handing that over as though it worked is worse
             than saying it did not. */
          if (!moved && previous && !same(previous, data)) moved = true;
          previous = data;

          report((step + 1) / steps.length);
        }
      } finally {
        moving.forEach(({ el }, i) => {
          if (was[i] === null) el.removeAttribute("src");
          else el.setAttribute("src", was[i]);
        });
      }

      if (!moved) {
        return { error: "That animation came back as a single frame, so there is nothing to export but a picture." };
      }

      encoder.finish();
      const blob = new Blob([encoder.bytesView()], { type: "image/gif" });
      const url = URL.createObjectURL(blob);
      download(url, `${safeName(project.name)}.gif`);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      return {};
    });
  } finally {
    node.removeAttribute("data-exporting");
  }
}

/* Two rasters are the same picture.
 *
 * Compared over a stride rather than pixel by pixel: this only has to answer
 * "did anything move", and reading every fourth pixel of a two-megapixel frame
 * answers it just as well for a hundredth of the work. */
function same(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 16) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/* A GIF is 256 colours a frame and a hundred frames, so it grows with the
   square of the scale in a way a PNG does not. Two times a 1200px mockup is a
   file nobody can send; one is the honest default and a mockup already drawn
   small keeps the scale it was given. */
function gifScale(project) {
  return Math.min(project.canvas?.scale ?? 2, 1.5);
}

export function exportProject(project) {
  const blob = new Blob([JSON.stringify(project, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  download(url, `${safeName(project.name)}.json`);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* The message as Discord's API would take it.
 *
 * Components v2 rather than the legacy shape, with the numeric type codes the
 * API actually uses. It is a starting point and says so: a mockup has no
 * snowflakes in it, so custom ids are generated and emoji are left as the text
 * that was typed rather than guessed at as ids. */
const V2 = {
  actionRow: 1,
  button: 2,
  stringSelect: 3,
  section: 9,
  textDisplay: 10,
  thumbnail: 11,
  mediaGallery: 12,
  file: 13,
  separator: 14,
  container: 17,
};

const BUTTON_STYLE = { primary: 1, secondary: 2, success: 3, danger: 4, link: 5, premium: 6 };
const SELECT_TYPE = { string: 3, user: 5, role: 6, mentionable: 7, channel: 8 };

function toComponent(block) {
  switch (block.type) {
    case "text":
      return { type: V2.textDisplay, content: block.content ?? "" };
    case "section":
      return {
        type: V2.section,
        components: [{ type: V2.textDisplay, content: block.content ?? "" }],
        accessory:
          block.accessory?.kind === "button"
            ? toButton(block.accessory)
            : { type: V2.thumbnail, media: { url: block.accessory?.src ?? "" }, description: block.accessory?.alt || undefined },
      };
    case "gallery":
      return {
        type: V2.mediaGallery,
        items: (block.items ?? []).map((i) => ({
          media: { url: i.src },
          description: i.alt || undefined,
          spoiler: i.spoiler || undefined,
        })),
      };
    case "separator":
      return { type: V2.separator, divider: block.divider !== false, spacing: block.spacing === "large" ? 2 : 1 };
    case "buttons":
      return { type: V2.actionRow, components: (block.buttons ?? []).map(toButton) };
    case "select":
      return {
        type: V2.actionRow,
        components: [
          {
            type: SELECT_TYPE[block.kind ?? "string"] ?? 3,
            custom_id: `select_${block.id.slice(0, 8)}`,
            placeholder: block.placeholder || undefined,
            disabled: block.disabled || undefined,
            /* Only when they differ from the default of one, which is what the
               API assumes and what a payload with them in it reads as noise. */
            min_values: block.minValues !== undefined && block.minValues !== 1 ? block.minValues : undefined,
            max_values: block.maxValues !== undefined && block.maxValues !== 1 ? block.maxValues : undefined,
            options:
              (block.kind ?? "string") === "string"
                ? (block.options ?? []).map((o) => ({
                    label: o.label,
                    value: o.label.toLowerCase().replace(/\W+/g, "_").slice(0, 100) || "option",
                    description: o.description || undefined,
                    /* The same shape a button's emoji takes, a few lines
                       below — one way of saying it, not two. */
                    emoji: o.emoji ? { name: o.emoji } : undefined,
                  }))
                : undefined,
          },
        ],
      };
    case "file":
      return { type: V2.file, file: { url: `attachment://${block.name}` }, spoiler: block.spoiler || undefined };
    case "container":
      return {
        type: V2.container,
        accent_color: hexToInt(block.color),
        spoiler: block.spoiler || undefined,
        components: (block.blocks ?? []).map(toComponent).filter(Boolean),
      };
    default:
      return null;
  }
}

function toButton(button) {
  const style = BUTTON_STYLE[button.style] ?? 2;
  return {
    type: V2.button,
    style,
    label: button.label || undefined,
    disabled: button.disabled || undefined,
    ...(style === 5 ? { url: button.url || "https://example.com" } : { custom_id: `btn_${(button.id ?? "").slice(0, 8)}` }),
    ...(button.emoji ? { emoji: { name: button.emoji } } : {}),
  };
}

function hexToInt(hex) {
  if (!hex || hex === "none" || !/^#[0-9a-f]{6}$/i.test(hex)) return undefined;
  return parseInt(hex.slice(1), 16);
}

export function messageJson(message) {
  const payload = {};
  if (message.content) payload.content = message.content;

  if (message.embeds?.length) {
    payload.embeds = message.embeds.map((e) => {
      const embed = {};
      if (e.title) embed.title = e.title;
      if (e.url) embed.url = e.url;
      if (e.description) embed.description = e.description;
      const color = hexToInt(e.color);
      if (color !== undefined) embed.color = color;
      if (e.author) embed.author = { name: e.author, icon_url: e.authorIcon || undefined, url: e.authorUrl || undefined };
      if (e.footer || e.footerIcon) embed.footer = { text: e.footer || "", icon_url: e.footerIcon || undefined };
      if (e.thumbnail) embed.thumbnail = { url: e.thumbnail };
      if (e.image) embed.image = { url: e.image };
      if (e.timestamp) embed.timestamp = e.timestamp;
      if (e.fields?.length) {
        embed.fields = e.fields.map((f) => ({ name: f.name, value: f.value, inline: Boolean(f.inline) }));
      }
      return embed;
    });
  }

  if (message.components?.length) {
    payload.components = message.components.map(toComponent).filter(Boolean);
    /* IS_COMPONENTS_V2. Once a message is sent with it the flag cannot be
       removed, and without it the payload above is rejected — so it is written
       in rather than left for the reader to remember. */
    payload.flags = 32768;
  }

  if (message.ephemeral) payload.flags = (payload.flags ?? 0) | 64;
  if (message.tts) payload.tts = true;

  return JSON.stringify(payload, null, 2);
}

export function exportMessageJson(message, name) {
  const blob = new Blob([messageJson(message)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  download(url, `${safeName(name)}-message.json`);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* Two kinds of share link, and the tool tries them in the order that keeps
 * the most work private.
 *
 * The fragment link carries the whole mockup after the `#`, which browsers
 * never send to a server — so a mockup shared this way is between the two
 * people who have the link and nothing on this deployment ever sees it. It is
 * the default whenever it fits.
 *
 * It stops fitting at about 28k, because browsers cap a URL somewhere around
 * 32k and a project with a pasted screenshot in it is well past that. Then
 * the short link takes over: the mockup goes to the deployment's own store
 * under an eight-character id with an expiry, which is also the link you can
 * read out loud.
 */
export function fragmentLink(project) {
  const json = JSON.stringify(project);
  const packed = btoa(unescape(encodeURIComponent(json)));
  if (packed.length > 28000) return null;
  return `${window.location.origin}/#m=${packed}`;
}

/** A short link, when the deployment has a store for one. Falls back to the
 *  fragment, and says which one came back so the caller can be honest about
 *  whether anything left the browser. */
export async function shareLink(project, { ttl } = {}) {
  const fragment = fragmentLink(project);
  if (fragment) return { url: fragment, kind: "fragment" };

  try {
    const res = await fetch("/api/share", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ project, ttl }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        error:
          data.code === "no_backend"
            ? "This mockup is too big for a link, and short links are not set up on this deployment. Download the project file instead."
            : (data.error ?? "The link could not be made."),
      };
    }
    return { url: `${window.location.origin}/s/${data.id}`, kind: "short", expiresAt: data.expiresAt };
  } catch {
    return { error: "The link could not be made — the deployment did not answer." };
  }
}

export function readShareLink(hash) {
  const match = /[#&]m=([^&]+)/.exec(hash ?? "");
  if (!match) return null;
  try {
    return JSON.parse(decodeURIComponent(escape(atob(match[1]))));
  } catch {
    return null;
  }
}

export { safeName };

/* ------------------------------------------------------- JSON, coming in */

/* Reading a Discord message payload back into a mockup.
 *
 * The inverse of `messageJson`, and the reason it exists is that most people
 * arriving at a tool like this already have a payload: something a bot sends,
 * something out of Discohook, something a teammate pasted in chat. Making them
 * rebuild it by hand in a form is asking them to do work they have already
 * done.
 *
 * It reads both shapes. A legacy message is `content` plus `embeds` plus
 * action rows; a Components v2 message is a `components` tree with the 32768
 * flag. Neither is assumed — whatever is present is converted, and anything
 * unrecognised is skipped rather than throwing, because a payload with one
 * unknown key in it is still ninety per cent of a mockup.
 */

const INT_TO_HEX = (n) =>
  typeof n === "number" && Number.isFinite(n) ? `#${(n & 0xffffff).toString(16).padStart(6, "0")}` : undefined;

const STYLE_FROM = { 1: "primary", 2: "secondary", 3: "success", 4: "danger", 5: "link", 6: "premium" };
const SELECT_FROM = { 3: "string", 5: "user", 6: "role", 7: "mentionable", 8: "channel" };

function fromButton(c, uid) {
  return {
    id: uid(),
    label: c.label ?? "",
    style: STYLE_FROM[c.style] ?? "secondary",
    emoji: c.emoji?.name ?? "",
    url: c.url ?? "",
    disabled: Boolean(c.disabled),
  };
}

function fromComponent(c, uid) {
  switch (c.type) {
    case 10: // text display
      return { id: uid(), type: "text", content: c.content ?? "" };
    case 9: {
      // section: one to three text displays plus an accessory
      const text = (c.components ?? []).map((t) => t.content ?? "").join("\n");
      const a = c.accessory ?? {};
      return {
        id: uid(),
        type: "section",
        content: text,
        accessory:
          a.type === 2
            ? { kind: "button", ...fromButton(a, uid) }
            : { kind: "thumbnail", src: a.media?.url ?? "", alt: a.description ?? "" },
      };
    }
    case 12:
      return {
        id: uid(),
        type: "gallery",
        items: (c.items ?? []).map((i) => ({
          id: uid(),
          src: i.media?.url ?? "",
          alt: i.description ?? "",
          spoiler: Boolean(i.spoiler),
        })),
      };
    case 14:
      return {
        id: uid(),
        type: "separator",
        divider: c.divider !== false,
        spacing: c.spacing === 2 ? "large" : "small",
      };
    case 13:
      return {
        id: uid(),
        type: "file",
        name: String(c.file?.url ?? "file").replace(/^attachment:\/\//, ""),
        size: "",
        spoiler: Boolean(c.spoiler),
      };
    case 17:
      return {
        id: uid(),
        type: "container",
        color: INT_TO_HEX(c.accent_color) ?? "none",
        spoiler: Boolean(c.spoiler),
        blocks: (c.components ?? []).map((x) => fromComponent(x, uid)).filter(Boolean),
      };
    case 1: {
      // An action row is a button row or a single select; which one it is
      // depends on what is in it, not on the row.
      const kids = c.components ?? [];
      const menu = kids.find((k) => k.type in SELECT_FROM && k.type !== 2);
      if (menu) {
        return {
          id: uid(),
          type: "select",
          kind: SELECT_FROM[menu.type] ?? "string",
          placeholder: menu.placeholder ?? "",
          disabled: Boolean(menu.disabled),
          minValues: menu.min_values ?? 1,
          maxValues: menu.max_values ?? 1,
          options: (menu.options ?? []).map((o) => ({
            id: uid(),
            label: o.label ?? "",
            description: o.description ?? "",
            emoji: o.emoji?.name ?? "",
          })),
        };
      }
      return { id: uid(), type: "buttons", buttons: kids.filter((k) => k.type === 2).map((k) => fromButton(k, uid)) };
    }
    default:
      return null;
  }
}

/**
 * Turn a payload into the fields of a message.
 *
 * Returns `{ patch }` on success or `{ error }` with something worth reading.
 * The caller merges the patch into whichever message is selected, so the
 * author, the timestamp and everything else about the mockup survive.
 */
export function messageFromJson(text, uid) {
  let payload;
  try {
    payload = JSON.parse(text);
  } catch (error) {
    return { error: `That is not valid JSON — ${String(error.message).replace(/^JSON\.parse: /, "")}` };
  }
  if (Array.isArray(payload)) payload = payload[0];
  if (!payload || typeof payload !== "object") return { error: "A message payload has to be an object." };

  /* Discohook wraps a message in `{ messages: [{ data: … }] }` when you use
     its share links, and a webhook body is the bare message. Both are common
     enough to unwrap rather than reject. */
  if (Array.isArray(payload.messages)) payload = payload.messages[0]?.data ?? payload.messages[0] ?? {};
  if (payload.data && typeof payload.data === "object") payload = payload.data;

  const patch = {
    content: typeof payload.content === "string" ? payload.content : "",
    embeds: [],
    components: [],
  };

  if (Array.isArray(payload.embeds)) {
    patch.embeds = payload.embeds.slice(0, 20).map((e) => ({
      id: uid(),
      color: INT_TO_HEX(e.color) ?? "#5865f2",
      author: e.author?.name ?? "",
      authorIcon: e.author?.icon_url ?? "",
      authorUrl: e.author?.url ?? "",
      title: e.title ?? "",
      url: e.url ?? "",
      description: e.description ?? "",
      thumbnail: e.thumbnail?.url ?? "",
      image: e.image?.url ?? "",
      video: e.video?.url ?? "",
      footer: e.footer?.text ?? "",
      footerIcon: e.footer?.icon_url ?? "",
      timestamp: e.timestamp ?? "",
      provider: e.provider?.name ?? "",
      fields: (e.fields ?? []).map((f) => ({
        id: uid(),
        name: f.name ?? "",
        value: f.value ?? "",
        inline: Boolean(f.inline),
      })),
    }));
  }

  if (Array.isArray(payload.components)) {
    patch.components = payload.components.map((c) => fromComponent(c, uid)).filter(Boolean);
  }

  if (typeof payload.flags === "number") patch.ephemeral = Boolean(payload.flags & 64);
  if (payload.tts) patch.tts = true;

  if (!patch.content && !patch.embeds.length && !patch.components.length) {
    return { error: "There is no content, embed or component in that payload." };
  }
  return { patch };
}
