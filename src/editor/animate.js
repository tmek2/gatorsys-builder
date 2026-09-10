/* Reading an animation apart into its frames.
 *
 * A GIF in a mockup is the point of having a GIF picker, and a mockup that
 * exports it as its first frame has thrown the thing away. To export the
 * animation the tool has to know what the animation *is* — which frames, and
 * how long each one is held — and neither an `<img>` nor a canvas will say.
 *
 * Two ways to find out, in order:
 *
 *   `ImageDecoder`, the browser's own decoder, which reads GIF and animated
 *   WebP alike and hands back frames already composed — the partial frames and
 *   disposal rules that a GIF is actually made of are its problem, not ours.
 *
 *   gifuct-js when there is no `ImageDecoder`, which reads GIF only and hands
 *   back the raw patches, so the composing is done here.
 *
 * Everything comes back as a list of `{ bitmap, delay }` with the delay in
 * milliseconds, so the caller never has to know which path produced it.
 */

import { blobFromDataUrl } from "@/lib/image";

/* A GIF frame with no delay set means "as fast as possible", which every
   browser has agreed for twenty years means a tenth of a second. Encoding it
   as 0 would produce a file that plays differently everywhere. */
const DEFAULT_DELAY = 100;
const MIN_DELAY = 20;

/* Past this an animation is not being exported, it is being re-hosted. Long
   GIFs are truncated rather than refused: the first six seconds of a reaction
   GIF is the reaction. */
export const MAX_FRAMES = 120;

const ANIMATED_TYPE = /^(image\/gif|image\/webp|image\/apng)$/i;

/** The bytes behind a source, whatever kind of URL it is. */
async function bytesOf(src) {
  /* A data URI is unpacked rather than fetched — `connect-src` is `self` and a
     fetch to a `data:` URL is refused by it, which is every inlined picture in
     the mockup. `blobFromDataUrl` is where that trap is written down. */
  const local = /^data:/i.test(src) ? blobFromDataUrl(src) : null;
  const blob = local ?? (await fetchedBlob(src));
  return { buffer: await blob.arrayBuffer(), type: blob.type || "" };
}

async function fetchedBlob(src) {
  const response = await fetch(src);
  if (!response.ok) throw new Error("fetch");
  return response.blob();
}

async function viaImageDecoder(buffer, type) {
  if (typeof ImageDecoder === "undefined") return null;
  if (!(await ImageDecoder.isTypeSupported(type).catch(() => false))) return null;

  const decoder = new ImageDecoder({ data: buffer, type });
  try {
    await decoder.tracks.ready;
    const track = decoder.tracks.selectedTrack;
    /* One frame is a picture, not an animation. Saying so here means the
       caller never sets up an export for something that does not move. */
    if (!track || track.frameCount < 2) return null;

    const frames = [];
    const count = Math.min(track.frameCount, MAX_FRAMES);
    for (let i = 0; i < count; i += 1) {
      const { image } = await decoder.decode({ frameIndex: i });
      /* `duration` is microseconds, and is null on a frame the container did
         not time. Copied into a bitmap because the VideoFrame has to be
         closed to release the decoder's memory. */
      const delay = image.duration ? Math.round(image.duration / 1000) : DEFAULT_DELAY;
      frames.push({ bitmap: await createImageBitmap(image), delay: Math.max(MIN_DELAY, delay) });
      image.close();
    }
    return frames;
  } finally {
    decoder.close?.();
  }
}

async function viaGifuct(buffer) {
  const { decompressFrames, parseGIF } = await import("gifuct-js");
  const parsed = parseGIF(buffer);
  const raw = decompressFrames(parsed, true);
  if (raw.length < 2) return null;

  const width = parsed.lsd.width;
  const height = parsed.lsd.height;

  /* A GIF frame is a patch over what came before, and the disposal code says
     what to do with the area it covered before the next one is drawn. Two of
     the three codes matter in practice: 2 clears that area back to nothing, 3
     restores what was under it. `ImageDecoder` does all of this itself, which
     is why it is tried first. */
  const stage = document.createElement("canvas");
  stage.width = width;
  stage.height = height;
  const ctx = stage.getContext("2d", { willReadFrequently: true });

  const patch = document.createElement("canvas");
  const patchCtx = patch.getContext("2d");

  const frames = [];
  let restore = null;
  for (const frame of raw.slice(0, MAX_FRAMES)) {
    if (frame.disposalType === 3) restore = ctx.getImageData(0, 0, width, height);

    patch.width = frame.dims.width;
    patch.height = frame.dims.height;
    patchCtx.putImageData(new ImageData(frame.patch, frame.dims.width, frame.dims.height), 0, 0);
    ctx.drawImage(patch, frame.dims.left, frame.dims.top);

    frames.push({
      bitmap: await createImageBitmap(stage),
      delay: Math.max(MIN_DELAY, frame.delay || DEFAULT_DELAY),
    });

    if (frame.disposalType === 2) {
      ctx.clearRect(frame.dims.left, frame.dims.top, frame.dims.width, frame.dims.height);
    } else if (frame.disposalType === 3 && restore) {
      ctx.putImageData(restore, 0, 0);
    }
  }
  return frames;
}

/**
 * The frames of an animation, or `null` for anything that does not move.
 *
 * `null` rather than a one-frame list, so the caller can tell "this is a still
 * picture" from "this is an animation that happens to be short" and offer the
 * GIF export only when there is something to animate.
 *
 * @returns {Promise<{frames: {bitmap: ImageBitmap, delay: number}[], duration: number} | null>}
 */
export async function decodeAnimation(src) {
  if (typeof src !== "string" || !src) return null;
  /* The type first, off the header, before any bytes are unpacked. A mockup
     holds a dozen pictures and most of them are avatars; base64-decoding four
     megabytes of one to discover it is a PNG is work done for nothing, once
     per picture, every time the button is pressed. */
  const declared = /^data:([^;,]+)/i.exec(src)?.[1];
  if (declared && !ANIMATED_TYPE.test(declared)) return null;

  try {
    const { buffer, type } = await bytesOf(src);
    if (!ANIMATED_TYPE.test(type)) return null;

    const frames =
      (await viaImageDecoder(buffer, type).catch(() => null)) ??
      (/gif/i.test(type) ? await viaGifuct(buffer).catch(() => null) : null);

    if (!frames || frames.length < 2) return null;
    return { frames, duration: frames.reduce((total, f) => total + f.delay, 0) };
  } catch {
    return null;
  }
}

/** Which frame an animation is showing at `at` milliseconds into its loop. */
export function frameAt(animation, at) {
  const into = ((at % animation.duration) + animation.duration) % animation.duration;
  let elapsed = 0;
  for (const frame of animation.frames) {
    elapsed += frame.delay;
    if (into < elapsed) return frame;
  }
  return animation.frames[animation.frames.length - 1];
}

/** A bitmap as something an `<img>` will take. PNG, because a frame out of a
 *  GIF has its transparency and a JPEG would fill it in with black. */
export function bitmapToUrl(bitmap) {
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  canvas.getContext("2d").drawImage(bitmap, 0, 0);
  return canvas.toDataURL("image/png");
}
