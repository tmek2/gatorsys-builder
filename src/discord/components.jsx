"use client";

/* Components v2, as the client draws them.
 *
 * The tree is the message body: a container is a block like any other, so text
 * and buttons can sit beside one at the top level instead of being swept into
 * it. That is how Discord's own component tree is shaped, and getting it wrong
 * is what makes a builder box a line of text the moment you add a button to it.
 *
 * Nothing here does anything when pressed. A mockup is a picture of a message,
 * and a button that navigates or a select that opens is a button that is
 * lying about what the exported PNG shows. They take the client's hover and
 * active states and stop there.
 */

import { Markdown } from "./markdown";
import { Icon } from "./icon";
import { Emoji } from "./emoji-node";
import { FileCard, GalleryGrid } from "./media";
import { useContext } from "react";
import { RenderContext } from "./context";
import { Ghost } from "./ghost";

/* Discord's five button styles plus the premium one, which is the only button
 * whose label the client draws itself. */
const STYLE_CLASS = {
  primary: "dc-btn-primary",
  secondary: "dc-btn-secondary",
  success: "dc-btn-success",
  danger: "dc-btn-danger",
  link: "dc-btn-secondary dc-btn-link",
  premium: "dc-btn-premium",
};

export function Button({ button }) {
  return (
    <button
      type="button"
      tabIndex={-1}
      className={`dc-btn ${STYLE_CLASS[button.style] ?? STYLE_CLASS.secondary}`}
      disabled={button.disabled}
      onClick={(e) => e.preventDefault()}
    >
      {button.emoji ? <Emoji text={button.emoji} className="dc-btn-emoji" /> : null}
      <span className="dc-btn-label">{button.label || "Button"}</span>
      {button.style === "link" ? (
        <Icon name="external" size={16} className="dc-btn-out" />
      ) : null}
    </button>
  );
}

function ButtonRow({ block }) {
  return (
    <div className="dc-action-row">
      {(block.buttons ?? []).map((button) => (
        <Button key={button.id} button={button} />
      ))}
    </div>
  );
}

/* The four resolved select menus draw a fixed placeholder with an icon rather
 * than a list, because their options come from the server. The string menu is
 * the only one whose options the message carries. */
/* The glyph the client puts in front of a resolved menu's placeholder. */
const SELECT_ICON = {
  user: "person",
  role: "role-shield",
  channel: "channel-text",
  mentionable: "person",
};

function Select({ block }) {
  const resolved = block.kind && block.kind !== "string";
  return (
    <div className="dc-action-row">
      <div className={`dc-select${block.disabled ? " dc-select-disabled" : ""}`}>
        {resolved ? (
          <Icon name={SELECT_ICON[block.kind] ?? "person"} size={18} className="dc-select-kind" />
        ) : null}
        {/* A menu that takes more than one answer says so instead of showing
            its placeholder — the client replaces the line rather than adding
            to it, which is the visible difference between the two menus. */}
        <span className="dc-select-placeholder">
          {(block.maxValues ?? 1) > 1
            ? `Select up to ${Math.min(block.maxValues, (block.options ?? []).length || block.maxValues)}`
            : block.placeholder || "Make a selection"}
        </span>
        <Icon name="caret-down" size={18} className="dc-select-caret" />
      </div>
    </div>
  );
}

/* A section is one to three lines of text with an accessory pinned right: a
 * thumbnail, or a single button. */
function Section({ block }) {
  const accessory = block.accessory ?? {};
  const { edit } = useContext(RenderContext);
  const empty = Boolean(edit) && !block.content;
  return (
    <div className="dc-section">
      <div className="dc-section-text">
        {empty ? (
          <Ghost lines={["body", "short"]} />
        ) : (
          <Markdown text={block.content || ""} jumbo={false} />
        )}
      </div>
      {accessory.kind === "button" ? (
        <div className="dc-section-accessory">
          <Button button={accessory} />
        </div>
      ) : accessory.src ? (
        <span className={`dc-section-thumb-slot${accessory.spoiler ? " dc-media-spoiler" : ""}`}>
          <img className="dc-section-thumb" src={accessory.src} alt={accessory.alt || ""} draggable={false} />
          {accessory.spoiler ? <span className="dc-spoiler-tag">Spoiler</span> : null}
        </span>
      ) : null}
    </div>
  );
}

/* A separator is either a rule or blank space, at one of two heights. The
 * client's "large" is roughly double, and a separator with the divider off is
 * spacing and nothing else — which is the whole reason the flag exists. */
function Separator({ block }) {
  return (
    <div
      className={`dc-separator dc-separator-${block.spacing || "small"}${
        block.divider === false ? " dc-separator-blank" : ""
      }`}
      aria-hidden="true"
    />
  );
}

/* The accent stripe is on the left and the whole box is rounded, which is
 * what separates a container from an embed at a glance: an embed's stripe is
 * 4px against a 4px radius, a container's box is 8px and the stripe follows
 * it. A spoilered container is drawn covered, the way it arrives. */
function Container({ block }) {
  return (
    <div
      className={`dc-container${block.spoiler ? " dc-container-spoiler" : ""}`}
      style={{ borderLeftColor: block.color && block.color !== "none" ? block.color : "transparent" }}
    >
      <div className="dc-container-inner">
        <Blocks blocks={block.blocks ?? []} nested />
      </div>
      {block.spoiler ? <span className="dc-spoiler-tag">Spoiler</span> : null}
    </div>
  );
}

/* A text block with nothing in it.
 *
 * It drew nothing at all, so a container holding one looked like a container
 * with a bug in it — the block was in the panel, listed as "Empty", and the
 * canvas showed a gap. The embed already drew grey bars when it was empty;
 * this is the same thing, for the same reason, in the other layout. */
function TextDisplay({ block }) {
  const { edit } = useContext(RenderContext);
  const empty = Boolean(edit) && !block.content;
  return (
    /* The bars are drawn, and drawn into the picture: what the canvas shows is
       what the download contains, here as everywhere else. */
    <div className="dc-text-display">
      {empty ? <Ghost lines={["body", "short"]} /> : <Markdown text={block.content || ""} />}
    </div>
  );
}

const RENDERERS = {
  text: TextDisplay,
  section: Section,
  gallery: ({ block }) => <GalleryGrid items={block.items ?? []} />,
  separator: Separator,
  buttons: ButtonRow,
  select: Select,
  file: ({ block }) => <FileCard file={block} />,
  container: Container,
};

export function Blocks({ blocks = [], nested = false }) {
  return (
    <div className={`dc-blocks${nested ? " dc-blocks-nested" : ""}`}>
      {blocks.map((block) => {
        const Renderer = RENDERERS[block.type];
        if (!Renderer) return null;
        return <Renderer key={block.id} block={block} />;
      })}
    </div>
  );
}
