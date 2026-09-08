"use client";

/* Everything a message carries that is not text.
 *
 * Attachments, galleries, files, voice notes, stickers, polls, invites and
 * link previews. They live together because they share one property that
 * shapes all of them: each is a fixed card whose size the client decides, not
 * the message — so none of them takes a width from its container.
 */

import { Emoji } from "./emoji-node";
import { Icon } from "./icon";
import { Markdown } from "./markdown";
import { safeMedia, safeUrl } from "@/lib/urls";

/* ------------------------------------------------------------ galleries */

/* Discord's image grid, which is not `repeat(auto-fit)`.
 *
 * One image is drawn at its own size up to 550×350. Two or four go side by
 * side in equal columns. Three is one large and two stacked. Five and up is a
 * three-column grid with the last row stretched. Approximating all of that
 * with one flexible grid is what makes a kit's gallery look like a contact
 * sheet instead of like Discord. */
function gridClass(n) {
  if (n <= 1) return "dc-grid-1";
  if (n === 2) return "dc-grid-2";
  if (n === 3) return "dc-grid-3";
  if (n === 4) return "dc-grid-4";
  return "dc-grid-many";
}

export function GalleryGrid({ items = [] }) {
  /* Only the ones that are actually a picture. An attachment with no source
     yet is a row in the editor, not half a grid on the canvas — and the layout
     has to be decided on what will be drawn, or two items where one is empty
     lays out as a pair and paints one of them as a grey rectangle. */
  const shown = items.filter((item) => item.src);
  if (!shown.length) return null;
  return (
    <div className={`dc-gallery ${gridClass(shown.length)}`}>
      {shown.map((item, i) => (
        <figure className={`dc-gallery-cell${item.spoiler ? " dc-media-spoiler" : ""}`} key={item.id ?? i}>
          {/^data:video|\.(mp4|webm|mov)(\?|$)/i.test(item.src || "") ? (
            <video src={item.src} controls playsInline />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.src} alt={item.alt || ""} draggable={false} loading="lazy" />
          )}
          {item.spoiler ? <span className="dc-spoiler-tag">Spoiler</span> : null}
          {item.alt ? <figcaption className="dc-alt-tag">ALT</figcaption> : null}
        </figure>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------- attachments */

export function Attachments({ items = [] }) {
  const images = items.filter((a) => a.kind === "image" || a.kind === "video");
  const files = items.filter((a) => a.kind === "file");
  const audio = items.filter((a) => a.kind === "audio");

  return (
    <>
      {images.length ? <GalleryGrid items={images} /> : null}
      {audio.map((a) => (
        <AudioCard key={a.id} file={a} />
      ))}
      {files.map((a) => (
        <FileCard key={a.id} file={a} />
      ))}
    </>
  );
}

/* --------------------------------------------------------------- files */

/* The paper glyph on a file card. Discord uses a per-extension icon; this is
 * the generic one, tinted by the extension so a .pdf and a .zip are still
 * distinguishable at a glance without shipping thirty SVGs. */
const EXT_TINT = {
  pdf: "#ee6a5f",
  zip: "#f0b232",
  rar: "#f0b232",
  txt: "#b5bac1",
  json: "#4fddab",
  js: "#f0b232",
  ts: "#5865f2",
  png: "#5865f2",
  mp3: "#eb459e",
  csv: "#23a55a",
};

export function FileCard({ file }) {
  const ext = (file.name || "").split(".").pop()?.toLowerCase() ?? "";
  return (
    <div className={`dc-file${file.spoiler ? " dc-media-spoiler" : ""}`}>
      <span className="dc-file-glyph" style={{ color: EXT_TINT[ext] ?? "var(--text-muted)" }}>
        <Icon name="file" size={40} />
        <span className="dc-file-ext">{ext.slice(0, 4)}</span>
      </span>
      <span className="dc-file-meta">
        <span className="dc-file-name">{file.name || "file"}</span>
        <span className="dc-file-size">{file.size || ""}</span>
      </span>
      <Icon name="download" size={24} className="dc-file-down" title="Download" />
    </div>
  );
}

function AudioCard({ file }) {
  return (
    <div className="dc-audio">
      <div className="dc-audio-head">
        <span className="dc-file-name">{file.name || "audio.mp3"}</span>
        <span className="dc-file-size">{file.size || ""}</span>
      </div>
      <div className="dc-audio-bar">
        <span className="dc-audio-play" aria-hidden="true">
          <Icon name="play" size={18} />
        </span>
        <span className="dc-audio-track">
          <span className="dc-audio-fill" style={{ width: "34%" }} />
        </span>
        <span className="dc-audio-time">{file.duration || "0:24"}</span>
      </div>
    </div>
  );
}

/* --------------------------------------------------------- voice notes */

/* The waveform on a voice message is real data in the client — a base-64
 * blob of amplitudes on the attachment. Here it is generated from the
 * duration, deterministically, so the same note always draws the same shape
 * rather than reshuffling on every keystroke in the editor. */
function bars(seed, count = 46) {
  let x = seed || 1;
  return Array.from({ length: count }, () => {
    x = (x * 1103515245 + 12345) % 2147483648;
    return 0.2 + (x / 2147483648) * 0.8;
  });
}

export function VoiceNote({ voice }) {
  const shape = bars((voice.duration || "0:07").split("").reduce((n, c) => n + c.charCodeAt(0), 0));
  const played = Math.min(1, Math.max(0, voice.progress ?? 0.35));
  return (
    <div className="dc-voice">
      <span className="dc-voice-play" aria-hidden="true">
        <Icon name="play" size={20} />
      </span>
      <span className="dc-voice-wave" aria-hidden="true">
        {shape.map((h, i) => (
          <span
            key={i}
            className={`dc-voice-bar${i / shape.length <= played ? " dc-voice-bar-on" : ""}`}
            style={{ height: `${Math.round(h * 100)}%` }}
          />
        ))}
      </span>
      <span className="dc-voice-time">{voice.duration || "0:07"}</span>
    </div>
  );
}

/* ------------------------------------------------------------- stickers */

export function Sticker({ sticker }) {
  if (!sticker?.src) return null;
  return (
    <div className="dc-sticker">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={sticker.src} alt={sticker.name || ""} draggable={false} />
    </div>
  );
}

/* ---------------------------------------------------------------- polls */

export function Poll({ poll }) {
  const total = poll.total ?? (poll.answers ?? []).reduce((n, a) => n + (a.votes || 0), 0);
  const top = Math.max(1, ...(poll.answers ?? []).map((a) => a.votes || 0));

  return (
    <div className="dc-poll">
      <div className="dc-poll-question">{poll.question}</div>
      <div className="dc-poll-answers">
        {(poll.answers ?? []).map((answer) => {
          const share = total ? Math.round(((answer.votes || 0) / total) * 100) : 0;
          const winning = poll.finished && (answer.votes || 0) === top;
          return (
            <div className={`dc-poll-answer${winning ? " dc-poll-won" : ""}`} key={answer.id}>
              <span className="dc-poll-fill" style={{ width: `${share}%` }} aria-hidden="true" />
              <span className="dc-poll-mark" aria-hidden="true" />
              {answer.emoji ? <Emoji text={answer.emoji} className="dc-poll-emoji" /> : null}
              <span className="dc-poll-text">{answer.text}</span>
              <span className="dc-poll-share">{share}%</span>
            </div>
          );
        })}
      </div>
      <div className="dc-poll-foot">
        <span>
          {total} {total === 1 ? "vote" : "votes"}
        </span>
        <span className="dc-embed-dot">•</span>
        <span>{poll.finished ? "Final results" : poll.duration || "1 day left"}</span>
        {poll.multiple ? (
          <>
            <span className="dc-embed-dot">•</span>
            <span>Select multiple</span>
          </>
        ) : null}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------- invites */

export function Invite({ invite }) {
  return (
    <div className="dc-invite">
      <div className="dc-invite-head">You have been invited to join a server</div>
      <div className="dc-invite-body">
        {invite.icon ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="dc-invite-icon" src={invite.icon} alt="" />
        ) : (
          <span className="dc-invite-icon dc-invite-mono">{(invite.name || "S").slice(0, 1)}</span>
        )}
        <div className="dc-invite-meta">
          <div className="dc-invite-name">{invite.name || "Server"}</div>
          <div className="dc-invite-counts">
            <span className="dc-dot dc-dot-online" /> {invite.online || "0"} Online
            <span className="dc-dot dc-dot-offline" /> {invite.members || "0"} Members
          </div>
        </div>
        <button type="button" tabIndex={-1} className="dc-btn dc-btn-success dc-invite-join">
          Join
        </button>
      </div>
    </div>
  );
}

/* -------------------------------------------------- link preview embeds */

/* An unfurled link. Structurally an embed, but the client draws it with the
 * provider above the title and the thumbnail on the right at a larger size,
 * so it is its own card rather than an embed with fields left empty. */
export function LinkPreview({ preview }) {
  return (
    <div className="dc-embed dc-link-preview" style={{ borderLeftColor: preview.color || "#1e1f22" }}>
      <div className="dc-embed-grid dc-embed-has-thumb">
        <div className="dc-embed-main">
          {preview.provider ? <div className="dc-embed-provider">{preview.provider}</div> : null}
          {preview.author ? <div className="dc-embed-author-name">{preview.author}</div> : null}
          {preview.title ? (
            <div className="dc-embed-title">
              {safeUrl(preview.url) ? (
                <a className="dc-link" href={safeUrl(preview.url)} target="_blank" rel="noreferrer nofollow">
                  {preview.title}
                </a>
              ) : (
                preview.title
              )}
            </div>
          ) : null}
          {preview.description ? (
            <div className="dc-embed-description">
              <Markdown text={preview.description} jumbo={false} />
            </div>
          ) : null}
        </div>
        {preview.thumbnail ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="dc-embed-thumb dc-link-thumb" src={preview.thumbnail} alt="" />
        ) : null}
      </div>
      {preview.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="dc-embed-image" src={preview.image} alt="" />
      ) : null}
    </div>
  );
}
