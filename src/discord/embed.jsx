"use client";

/* A rich embed.
 *
 * The layout is a two-column grid rather than a float, because the thumbnail
 * is not text-adjacent: it occupies the top-right corner and the title,
 * description and fields flow in the column beside it, then the image and the
 * footer run the full width underneath. A float gets the common case right and
 * then wraps the footer around the thumbnail, which the client never does.
 *
 * Fields are a twelve-column grid. Discord packs up to three inline fields
 * onto a row, and a row with two takes six columns each rather than four —
 * which is why the span has to be computed from the run of inline fields a
 * field belongs to rather than from the field itself.
 */

import { Markdown, MarkdownInline, formatTime } from "./markdown";
import { safeMedia, safeUrl } from "@/lib/urls";
import { ImageDrop, ImageTools } from "./image-tools";
import { Ghost } from "./ghost";

/* How wide one field sits, in twelfths.
 *
 * Walk out to the ends of the unbroken run of inline fields this one is in,
 * find which row of three it lands on, and divide twelve by how many are
 * actually on that row. A non-inline field is always the full width. */
function fieldSpan(fields, i) {
  if (!fields[i].inline) return 12;
  let start = i;
  while (start > 0 && fields[start - 1].inline) start -= 1;
  let end = i;
  while (end + 1 < fields.length && fields[end + 1].inline) end += 1;
  const rowStart = start + Math.floor((i - start) / 3) * 3;
  return 12 / Math.min(3, end - rowStart + 1);
}

function footerTime(value) {
  if (!value) return "";
  const n = Number(value);
  if (Number.isFinite(n) && String(value).trim() !== "") return formatTime(n, "f");
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : formatTime(Math.floor(date.getTime() / 1000), "f");
}

export function Embed({ embed, set }) {
  const fields = embed.fields ?? [];
  /* Every URL out of the embed is checked before it becomes an attribute. An
     embed can arrive from somebody else — a share link, an imported file, a
     pasted payload — and `url` going straight into an `href` is a
     `javascript:` URL away from running in the reader's session. */
  const title = safeUrl(embed.url);
  const author = safeUrl(embed.authorUrl);
  const thumbnail = safeMedia(embed.thumbnail);
  const image = safeMedia(embed.image);
  const video = safeMedia(embed.video);
  const authorIcon = safeMedia(embed.authorIcon);
  const footerIcon = safeMedia(embed.footerIcon);
  const hasSide = Boolean(thumbnail);

  /* An embed with nothing in it yet.
   *
   * It used to be born carrying the words "Embed title" and "Embed
   * description", which is a placeholder you have to delete before you can
   * write — and which lands in the exported picture if you forget. The client
   * draws an embed it has not filled in yet as grey bars, so that is what an
   * empty one looks like here: a shape that says "text goes here" without
   * being text. It is drawn only while editing and never exported, and the
   * first character typed anywhere in the embed takes it away. */
  const bare =
    Boolean(set) &&
    !embed.title &&
    !embed.description &&
    !embed.author &&
    !embed.provider &&
    !embed.footer &&
    !embed.timestamp &&
    !fields.length &&
    !thumbnail &&
    !image &&
    !video;

  return (
    <div className="dc-embed" style={{ borderLeftColor: embed.color || "#5865f2" }}>
      <div className={`dc-embed-grid${hasSide ? " dc-embed-has-thumb" : ""}`}>
        <div className="dc-embed-main">
          {bare ? <Ghost lines={["title", "body"]} /> : null}

          {embed.provider ? <div className="dc-embed-provider">{embed.provider}</div> : null}

          {embed.author ? (
            <div className="dc-embed-author">
              {authorIcon ? <img className="dc-embed-author-icon" src={authorIcon} alt="" /> : null}
              {author ? (
                <a className="dc-embed-author-name dc-link" href={author} target="_blank" rel="noreferrer nofollow">
                  {embed.author}
                </a>
              ) : (
                <span className="dc-embed-author-name">{embed.author}</span>
              )}
            </div>
          ) : null}

          {embed.title ? (
            <div className="dc-embed-title">
              {title ? (
                <a className="dc-link" href={title} target="_blank" rel="noreferrer nofollow">
                  <MarkdownInline text={embed.title} />
                </a>
              ) : (
                <MarkdownInline text={embed.title} />
              )}
            </div>
          ) : null}

          {embed.description ? (
            <div className="dc-embed-description">
              <Markdown text={embed.description} jumbo={false} />
            </div>
          ) : null}

          {fields.length ? (
            <div className="dc-embed-fields">
              {fields.map((field, i) => (
                <div
                  className="dc-embed-field"
                  key={field.id}
                  /* The span is the desktop's twelve-column arithmetic. The
                     phone re-columns from this flag instead, because an inline
                     style cannot be overridden by a stylesheet. */
                  data-inline={field.inline ? "true" : "false"}
                  style={{ gridColumn: `span ${fieldSpan(fields, i)}` }}
                >
                  <div className="dc-embed-field-name">
                    <MarkdownInline text={field.name} />
                  </div>
                  <div className="dc-embed-field-value">
                    <Markdown text={field.value} jumbo={false} />
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        {thumbnail ? (
          <span className="dc-embed-thumb-slot">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="dc-embed-thumb" src={thumbnail} alt="" draggable={false} />
            {set ? (
              <ImageTools
                value={embed.thumbnail}
                label="thumbnail"
                onChange={(v) => set({ thumbnail: v })}
                onRemove={() => set({ thumbnail: "" })}
              />
            ) : null}
          </span>
        ) : null}
      </div>

      {image || video ? (
        <span className="dc-embed-image-slot">
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="dc-embed-image" src={image} alt="" draggable={false} />
          ) : (
            <video className="dc-embed-image" src={video} controls playsInline />
          )}
          {set ? (
            <ImageTools
              value={image ? embed.image : embed.video}
              label={image ? "image" : "video"}
              onChange={(v) => set(image ? { image: v } : { video: v })}
              onRemove={() => set(image ? { image: "" } : { video: "" })}
            />
          ) : null}
        </span>
      ) : null}

      {set && !image && !video ? (
        <ImageDrop label="an image" onChange={(v) => set({ image: v })} />
      ) : null}

      {embed.footer || embed.timestamp ? (
        <div className="dc-embed-footer">
          {footerIcon ? <img className="dc-embed-footer-icon" src={footerIcon} alt="" /> : null}
          {embed.footer ? <span>{embed.footer}</span> : null}
          {embed.footer && embed.timestamp ? <span className="dc-embed-dot">•</span> : null}
          {embed.timestamp ? <span>{footerTime(embed.timestamp)}</span> : null}
        </div>
      ) : null}
    </div>
  );
}
