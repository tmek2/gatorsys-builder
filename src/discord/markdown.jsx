"use client";

/* Discord's markdown, which is not CommonMark and not GFM.
 *
 * The previous version of this tool ran the text through react-markdown with
 * remark-gfm and rewrote Discord's own syntax into links first. That gets the
 * common cases right and then goes wrong in ways that matter for a picture:
 * GFM turns a bare URL into a link inside a code span, supports tables and
 * images that Discord does not, treats `_x_` and `*x*` identically where
 * Discord's underscore italics do not fire mid-word, has no idea what `-#` or
 * `||spoiler||` or `<t:…>` are, and renders a list at CommonMark's indent
 * rather than Discord's.
 *
 * So this is a parser for the actual flavour. Two passes: blocks, then inline
 * within each block. It is small because Discord's grammar is small — the
 * whole point is that it is a chat client's markdown and not a document
 * format.
 *
 * Everything renders to React elements, never to HTML strings: a mockup is
 * built out of text somebody pasted in, and the one thing that must never
 * happen is that text becoming markup.
 */

import { Fragment, createElement, useContext } from "react";
import { EMOJI_RE, jumboable } from "./emoji";
import { Twemoji } from "./emoji-node";
import { RenderContext } from "./context";
import { safeMedia, safeUrl } from "@/lib/urls";

/* --------------------------------------------------------------- inline */

/* Ordered. The first rule that matches at a position wins, so anything that
 * can contain a delimiter of another rule has to come before it: a code span
 * before emphasis, because `` `**x**` `` is literal asterisks; the three-mark
 * spoiler and bold before the one-mark italic, for the obvious reason. */
/* One custom emoji, drawn the same way whichever syntax named it. */
function customEmoji(emoji, name, big) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className={`dc-emoji${big ? " dc-emoji-jumbo" : ""}`}
      src={safeMedia(emoji.src)}
      alt={`:${name}:`}
      draggable={false}
    />
  );
}

const INLINE = [
  // Code spans first: nothing inside one is parsed.
  { name: "code", re: /^(`+)([\s\S]*?[^`])\1(?!`)/ },
  // Discord's own angle-bracket forms, before autolinking can eat them.
  { name: "emoji", re: /^<(a)?:(\w+):(\d+)>/ },
  /* The bare shortcode, which is what somebody actually types.
   *
   * `<:name:id>` is what a real message carries, because the client rewrites
   * the shortcode into it on the way out — but nobody types that, and the
   * emoji panel here says in as many words "use it anywhere as :name:". It
   * did not work: the parser only knew the angle-bracket form, so an uploaded
   * emoji came out as the literal text of its own name.
   *
   * A shortcode that names nothing in this mockup is left exactly as typed,
   * which is also what the client does — and is why `10:30:45` and `:)` are
   * safe. */
  { name: "shortcode", re: /^:([a-zA-Z0-9_]{2,32}):/ },
  { name: "time", re: /^<t:(-?\d+)(?::([tTdDfFR]))?>/ },
  { name: "user", re: /^<@!?([^>]+)>/ },
  { name: "role", re: /^<@&([^>]+)>/ },
  { name: "channel", re: /^<#([^>]+)>/ },
  { name: "slash", re: /^<\/([\w -]+):(\d+)>/ },
  // A link in angle brackets is a link with its preview suppressed.
  { name: "bare", re: /^<(https?:\/\/[^\s>]+)>/ },
  { name: "link", re: /^\[([^\]]+)\]\((<)?(https?:\/\/[^\s)]+|#[^\s)]*)(?:>)?(?:\s+"([^"]*)")?\)/ },
  { name: "url", re: /^https?:\/\/[^\s<]+[^\s<.,:;"')\]]/ },
  { name: "spoiler", re: /^\|\|([\s\S]+?)\|\|/ },
  { name: "bold", re: /^\*\*([\s\S]+?)\*\*(?!\*)/ },
  { name: "underline", re: /^__([\s\S]+?)__(?!_)/ },
  { name: "strike", re: /^~~([\s\S]+?)~~/ },
  { name: "italicStar", re: /^\*([\s\S]+?)\*(?!\*)/ },
  /* Underscore italics do not fire mid-word: `snake_case_name` is a name, not
     a word with an italic middle. The lookbehind is what separates them from
     the asterisk form, and is the single most common thing kits get wrong. */
  { name: "italicUnder", re: /^(?<![\p{L}\p{N}])_([\s\S]+?)_(?![\p{L}\p{N}])/u },
  { name: "everyone", re: /^@(everyone|here)\b/ },
  { name: "emojiChar", re: new RegExp(`^(?:${EMOJI_RE.source})`, "u") },
];

/* Discord's timestamp styles, formatted the way the client formats them.
 * `R` is relative and the rest are absolute; the locale is the reader's,
 * which is also true in the client. */
function formatTime(unix, style = "f") {
  const date = new Date(unix * 1000);
  if (Number.isNaN(date.getTime())) return "Invalid Date";
  const time = { hour: "numeric", minute: "2-digit" };
  switch (style) {
    case "t":
      return date.toLocaleTimeString([], time);
    case "T":
      return date.toLocaleTimeString([], { ...time, second: "2-digit" });
    case "d":
      return date.toLocaleDateString([], { day: "2-digit", month: "2-digit", year: "numeric" });
    case "D":
      return date.toLocaleDateString([], { day: "numeric", month: "long", year: "numeric" });
    case "F":
      return date.toLocaleDateString([], {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      }) + ` ${date.toLocaleTimeString([], time)}`;
    case "R": {
      const seconds = Math.round((date.getTime() - Date.now()) / 1000);
      const units = [
        ["year", 31536000],
        ["month", 2592000],
        ["day", 86400],
        ["hour", 3600],
        ["minute", 60],
        ["second", 1],
      ];
      const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
      for (const [unit, size] of units) {
        if (Math.abs(seconds) >= size || unit === "second") {
          return rtf.format(Math.round(seconds / size), unit);
        }
      }
      return "now";
    }
    default:
      return (
        date.toLocaleDateString([], { day: "numeric", month: "long", year: "numeric" }) +
        ` ${date.toLocaleTimeString([], time)}`
      );
  }
}

/* A mockup has no snowflakes in it. `<@Sapphire>` is what somebody actually
 * types here, and `<@u2>` is what the editor writes when a mention is inserted
 * from the user list — so a mention resolves against the project's users by id
 * first and then falls back to printing whatever was between the brackets. */
function resolveUser(users, key) {
  return users.find((u) => u.id === key) ?? users.find((u) => u.name === key) ?? null;
}

/* A plain `@Name`, resolved against the members and roles this mockup has.
 *
 * `<@123>` is what a real message carries, because the client rewrites the
 * name into an id as you pick it off the autocomplete. Nobody types that, and
 * in a mockup there are no ids to type — so "@Alex Strike 1, don't do that
 * again" came out as grey prose with no pill on it, which is not what anybody
 * writing that sentence meant.
 *
 * Longest name first, because a member called "Alex" and a member called
 * "Alex Strike 1" both match the start of the same text and only the longer
 * one is the right answer. Names may hold spaces — they are display names —
 * so this cannot be a word-boundary regex; it is a match against the list of
 * names that actually exist, which is also the only way to know where the
 * name stops.
 */
function atName(rest, ctx) {
  const named = [
    ...(ctx.users ?? []).map((u) => ({ name: u.name, role: false })),
    ...(ctx.roles ?? []).map((r) => ({ name: r.name, role: true, color: r.color })),
  ].filter((n) => n.name);

  let best = null;
  for (const one of named) {
    if (one.name.length <= (best?.name.length ?? 0)) continue;
    if (rest.slice(1, 1 + one.name.length).toLowerCase() === one.name.toLowerCase()) best = one;
  }
  if (!best) return null;

  return {
    length: 1 + best.name.length,
    node: (
      <span
        className={`dc-mention${best.role ? " dc-mention-role" : ""}`}
        style={best.role && best.color && best.color !== "none" ? { "--dc-role": best.color } : undefined}
      >
        @{best.name}
      </span>
    ),
  };
}

/* Whether a message pings somebody, which is what decides the wash down its
   row. The angle-bracket forms, the two broadcasts, and a plain name that
   resolves — the same three things the renderer draws as a mention. */
export function mentionsSomebody(text, ctx) {
  if (typeof text !== "string" || !text) return false;
  if (/<@[!&]?[^>]+>/.test(text) || /@(everyone|here)\b/.test(text)) return true;
  for (let i = text.indexOf("@"); i !== -1; i = text.indexOf("@", i + 1)) {
    if (atName(text.slice(i), ctx)) return true;
  }
  return false;
}

function inline(text, ctx, keyBase, big) {
  const out = [];
  let rest = text;
  let key = 0;
  const push = (node) => out.push(<Fragment key={`${keyBase}-${key++}`}>{node}</Fragment>);

  /* Plain text accumulates rather than being pushed a character at a time:
     otherwise a paragraph of ordinary prose becomes one React element per
     letter, which is both slow and impossible to read in the tree. */
  let buffer = "";
  const flush = () => {
    if (!buffer) return;
    push(buffer);
    buffer = "";
  };

  while (rest) {
    /* Before the rules, because no regex can know the member list and a
       display name can hold spaces. `@everyone` and `@here` fall through to
       their own rule below — nobody is called either. */
    if (rest[0] === "@") {
      const named = atName(rest, ctx);
      if (named) {
        flush();
        push(named.node);
        rest = rest.slice(named.length);
        continue;
      }
    }

    let matched = false;

    for (const rule of INLINE) {
      const m = rule.re.exec(rest);
      if (!m) continue;
      flush();
      rest = rest.slice(m[0].length);
      matched = true;

      switch (rule.name) {
        case "code":
          push(<code className="dc-code">{m[2]}</code>);
          break;
        case "emoji": {
          const custom = ctx.emojis?.find((e) => e.name === m[2]);
          push(
            safeMedia(custom?.src) ? (
              customEmoji(custom, m[2], big)
            ) : (
              /* The angle-bracket form names an emoji by id, so one this
                 mockup does not have is a picture that is missing rather than
                 text somebody typed. Say so. */
              <span className="dc-emoji-missing" title={`:${m[2]}:`}>{`:${m[2]}:`}</span>
            ),
          );
          break;
        }
        case "shortcode": {
          const custom = ctx.emojis?.find((e) => e.name === m[1]);
          if (safeMedia(custom?.src)) push(customEmoji(custom, m[1], big));
          // Not one of ours, so it was never an emoji: put the text back.
          else buffer += m[0];
          break;
        }
        case "time":
          push(
            <span className="dc-timestamp" title={new Date(Number(m[1]) * 1000).toString()}>
              {formatTime(Number(m[1]), m[2])}
            </span>,
          );
          break;
        case "user": {
          const user = resolveUser(ctx.users ?? [], m[1]);
          push(<span className="dc-mention">@{user?.name ?? m[1]}</span>);
          break;
        }
        case "role":
          push(<span className="dc-mention dc-mention-role">@{m[1]}</span>);
          break;
        case "channel":
          push(<span className="dc-mention">#{m[1]}</span>);
          break;
        case "slash":
          push(<span className="dc-mention dc-mention-command">/{m[1]}</span>);
          break;
        case "everyone":
          push(<span className="dc-mention">@{m[1]}</span>);
          break;
        case "bare":
        case "url": {
          /* The pattern already required an http(s) scheme, so this is belt
             and braces — but it is the same helper everywhere, so there is one
             answer to "is this URL allowed" rather than two that can drift. */
          const shown = rule.name === "bare" ? m[1] : m[0];
          const target = safeUrl(shown);
          push(
            target ? (
              <a className="dc-link" href={target} target="_blank" rel="noreferrer nofollow">
                {shown}
              </a>
            ) : (
              shown
            ),
          );
          break;
        }
        case "link": {
          const target = safeUrl(m[3]);
          const label = inline(m[1], ctx, `${keyBase}-l${key}`, false);
          /* A masked link whose destination is not allowed keeps its text and
             loses its link. Rendering it as a dead `#` would be a link people
             click twice; dropping the text would silently delete what somebody
             wrote. */
          push(
            target ? (
              <a className="dc-link" href={target} title={m[4]} target="_blank" rel="noreferrer nofollow">
                {label}
              </a>
            ) : (
              label
            ),
          );
          break;
        }
        /* A spoiler in a mockup is drawn covered, because that is the state
           the reader of the picture is meant to see. It still opens on a
           press, which is what makes it recognisable as one. */
        case "spoiler":
          push(
            <span className="dc-spoiler" tabIndex={0} role="button">
              <span>{inline(m[1], ctx, `${keyBase}-s${key}`, big)}</span>
            </span>,
          );
          break;
        case "bold":
          push(<strong>{inline(m[1], ctx, `${keyBase}-b${key}`, big)}</strong>);
          break;
        case "underline":
          push(<u>{inline(m[1], ctx, `${keyBase}-u${key}`, big)}</u>);
          break;
        case "strike":
          push(<s>{inline(m[1], ctx, `${keyBase}-t${key}`, big)}</s>);
          break;
        case "italicStar":
        case "italicUnder":
          push(<em>{inline(m[1], ctx, `${keyBase}-i${key}`, big)}</em>);
          break;
        case "emojiChar":
          push(<Twemoji text={m[0]} jumbo={big} />);
          break;
        default:
          buffer += m[0];
      }
      break;
    }

    if (!matched) {
      buffer += rest[0];
      rest = rest.slice(1);
    }
  }

  flush();
  return out;
}

/* ---------------------------------------------------------------- blocks */

/* Where a line stops being prose. Ordered the same way and for the same
 * reason: `-# ` has to be tested before the `- ` list item it starts with. */
const HEADING = /^(#{1,3})\s+(.*)$/;
const SUBTEXT = /^-#\s+(.*)$/;
const QUOTE = /^>\s?(.*)$/;
const BLOCK_QUOTE = /^>>>\s?/;
const BULLET = /^(\s*)([-*])\s+(.*)$/;
const ORDERED = /^(\s*)(\d+)[.)]\s+(.*)$/;
const FENCE = /^```(\w*)\s*$/;

function blocks(text, ctx, big) {
  const lines = text.split("\n");
  const out = [];
  let i = 0;
  let key = 0;
  const at = (node) => out.push(<Fragment key={`bl-${key++}`}>{node}</Fragment>);

  while (i < lines.length) {
    const line = lines[i];

    // A fence runs to the closing fence or, unclosed, to the end.
    const fence = FENCE.exec(line);
    if (fence) {
      const body = [];
      i += 1;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) {
        body.push(lines[i]);
        i += 1;
      }
      i += 1;
      at(
        <pre className="dc-codeblock" data-lang={fence[1] || undefined}>
          <code>{body.join("\n")}</code>
        </pre>,
      );
      continue;
    }

    /* `>>>` quotes everything after it, to the end of the message. `>` quotes
       only its own line, and consecutive ones are one quote. */
    if (BLOCK_QUOTE.test(line)) {
      const body = [line.replace(BLOCK_QUOTE, ""), ...lines.slice(i + 1)].join("\n");
      i = lines.length;
      at(<blockquote className="dc-quote">{blocks(body, ctx, false)}</blockquote>);
      continue;
    }
    if (QUOTE.test(line)) {
      const body = [];
      while (i < lines.length && QUOTE.test(lines[i])) {
        body.push(QUOTE.exec(lines[i])[1]);
        i += 1;
      }
      at(<blockquote className="dc-quote">{blocks(body.join("\n"), ctx, false)}</blockquote>);
      continue;
    }

    const subtext = SUBTEXT.exec(line);
    if (subtext) {
      i += 1;
      at(<div className="dc-subtext">{inline(subtext[1], ctx, `st${i}`, false)}</div>);
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      i += 1;
      at(
        createElement(
          `h${heading[1].length}`,
          { className: `dc-h${heading[1].length}` },
          inline(heading[2], ctx, `h${i}`, false),
        ),
      );
      continue;
    }

    /* Lists. Discord nests on indentation and caps the depth; the items
       themselves are inline-only, so there is no paragraph inside one. */
    if (BULLET.test(line) || ORDERED.test(line)) {
      const ordered = !BULLET.test(line);
      const items = [];
      const start = ordered ? Number(ORDERED.exec(line)[2]) : 1;
      while (i < lines.length && (BULLET.test(lines[i]) || ORDERED.test(lines[i]))) {
        const m = (BULLET.exec(lines[i]) ?? ORDERED.exec(lines[i]));
        items.push({ depth: Math.min(3, Math.floor(m[1].length / 2)), text: m[3] });
        i += 1;
      }
      at(
        createElement(
          ordered ? "ol" : "ul",
          { className: "dc-list", start: ordered && start !== 1 ? start : undefined },
          items.map((item, n) => (
            <li key={n} data-depth={item.depth}>
              {inline(item.text, ctx, `li${n}`, false)}
            </li>
          )),
        ),
      );
      continue;
    }

    // Prose. Consecutive lines stay in one paragraph, with the breaks kept —
    // a newline in Discord is a newline, not a space.
    const para = [];
    while (
      i < lines.length &&
      !FENCE.test(lines[i]) &&
      !QUOTE.test(lines[i]) &&
      !HEADING.test(lines[i]) &&
      !SUBTEXT.test(lines[i]) &&
      !BULLET.test(lines[i]) &&
      !ORDERED.test(lines[i])
    ) {
      para.push(lines[i]);
      i += 1;
    }
    const body = para.join("\n");
    if (body.trim() === "") {
      // A run of blank lines is vertical space, which Discord keeps.
      at(<div className="dc-blank" style={{ height: `${Math.max(0, para.length - 1) * 0.5}em` }} />);
      continue;
    }
    at(<p className="dc-p">{inline(body, ctx, `p${i}`, big)}</p>);
  }

  return out;
}

/* Text as Discord draws it. `jumbo` is the 48px treatment a message made of
 * nothing but emoji gets; it is off inside an embed, a button or a heading,
 * where the client does not apply it either. */
export function Markdown({ text = "", jumbo = true, className = "" }) {
  const ctx = useContext(RenderContext);
  if (!text) return null;
  const big = jumbo && jumboable(text);
  return <div className={`dc-markdown ${className}`}>{blocks(text, ctx, big)}</div>;
}

/** One line of it, for a place that cannot hold a paragraph: an embed title,
 *  a field name, an author line. */
export function MarkdownInline({ text = "", className = "" }) {
  const ctx = useContext(RenderContext);
  if (!text) return null;
  return <span className={`dc-inline ${className}`}>{inline(text, ctx, "il", false)}</span>;
}

export { formatTime };
