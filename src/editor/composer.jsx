"use client";

/* The composer island.
 *
 * The editor used to be two panels with the mockup squeezed between them, and
 * making a message meant finding the right box in the right panel. This is the
 * other way round: it is Discord's own composer, floating over the canvas, and
 * you make a message by typing one and pressing Enter.
 *
 * Three zones, and the split is deliberate. Inside the bar are the client's own
 * buttons, because the bar is a picture of Discord's. Outside it, on the left,
 * is everything about who you are sending as. Outside it, on the right, is
 * everything about what the message contains. Nothing that belongs to the
 * editor is allowed inside the bar, and nothing that belongs to Discord is
 * allowed outside it — which is what keeps the island readable at a glance
 * rather than becoming a second toolbar.
 */

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  IconChevronDown,
  IconLayoutGrid,
  IconMoodSmile,
  IconPencil,
  IconPlus,
  IconSquaresFilled,
} from "@tabler/icons-react";
import { Icon } from "@/discord/icon";
import { Hint } from "./fields";

/* What the right rail opens. The labels are the words somebody would use for
   the thing they want to add, not the names of our tabs. */
export const TOOLS = [
  { id: "Content", label: "Message", hint: "Text, author, timestamp and how it is drawn", Glyph: IconPencil },
  { id: "Embeds", label: "Embeds", hint: "The cards a bot posts under a message", Glyph: IconLayoutGrid },
  { id: "Components", label: "Components", hint: "Buttons, menus, containers and galleries", Glyph: IconSquaresFilled },
  { id: "Extras", label: "Extras", hint: "Reactions, attachments, polls, replies and the rest", Glyph: IconMoodSmile },
];

/** The pill that says who you are sending as, and the popover behind it. */
function AuthorPill({ project, author, onPick, onEdit, onAdd }) {
  const [open, setOpen] = useState(false);
  const box = useRef(null);

  /* Click-away and Escape, rather than a modal scrim: the island sits over the
     canvas and a scrim would grey out the thing being edited. */
  useEffect(() => {
    if (!open) return undefined;
    const away = (event) => {
      if (!box.current?.contains(event.target)) setOpen(false);
    };
    const key = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", key);
    };
  }, [open]);

  return (
    <div className="c-author" ref={box}>
      {open ? (
        <div className="c-author-pop" role="menu">
          <div className="c-author-pop-head">Sending as</div>
          <ul className="c-author-list">
            {project.users.map((u) => (
              <li key={u.id}>
                <button
                  type="button"
                  role="menuitemradio"
                  aria-checked={u.id === author?.id}
                  className="c-author-option"
                  data-on={u.id === author?.id ? "true" : "false"}
                  onClick={() => {
                    onPick(u.id);
                    setOpen(false);
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={u.avatar} alt="" draggable={false} />
                  <span className="c-author-option-name" style={u.color ? { color: u.color } : undefined}>
                    {u.name}
                  </span>
                  {u.bot ? <span className="c-author-option-tag">APP</span> : null}
                </button>
              </li>
            ))}
          </ul>
          <div className="c-author-pop-foot">
            <button
              type="button"
              className="c-author-act"
              onClick={() => {
                onEdit(author?.id);
                setOpen(false);
              }}
            >
              <IconPencil size={14} /> Edit {author?.name || "this member"}
            </button>
            <button
              type="button"
              className="c-author-act"
              onClick={() => {
                onAdd();
                setOpen(false);
              }}
            >
              <IconPlus size={14} /> Add a member
            </button>
          </div>
        </div>
      ) : null}

      <Hint label="Who this message is from — click to switch, edit or add">
        <button
          type="button"
          className="c-author-btn"
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="c-author-face" src={author?.avatar} alt="" draggable={false} />
          <span className="c-author-name" style={author?.color ? { color: author.color } : undefined}>
            {author?.name ?? "Nobody"}
          </span>
          <IconChevronDown size={13} stroke={2.2} />
        </button>
      </Hint>
    </div>
  );
}

export function Composer({
  project,
  author,
  tool,
  onPickAuthor,
  onEditAuthor,
  onAddAuthor,
  onSend,
  onTool,
  channel,
}) {
  const [draft, setDraft] = useState("");
  const field = useRef(null);

  /* The bar grows with what is in it, the way the client's does, and stops at
     a height that still leaves the mockup visible behind it. */
  useLayoutEffect(() => {
    const el = field.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
  }, [draft]);

  const send = () => {
    const text = draft.trim();
    if (!text) return;
    onSend(text);
    setDraft("");
  };

  return (
    <div className="c-island e-no-export">
      <AuthorPill
        project={project}
        author={author}
        onPick={onPickAuthor}
        onEdit={onEditAuthor}
        onAdd={onAddAuthor}
      />

      <div className="c-bar">
        {/* Discord's own controls, and only those. Drawn rather than wired,
            like everything else on a mockup — pressing one opens the editor
            panel that actually adds the thing. */}
        <Hint label="Add an attachment, a file or a sticker">
          <button type="button" className="c-bar-btn" onClick={() => onTool("Extras")} aria-label="Attach">
            <Icon name="attach" size={22} />
          </button>
        </Hint>

        <textarea
          ref={field}
          className="c-field"
          rows={1}
          value={draft}
          placeholder={`Message #${channel || "general"}`}
          aria-label="Write a message"
          onChange={(e) => setDraft(e.target.value)}
          /* Enter sends and shift-Enter breaks the line, which is the client's
             behaviour and the reason this reads as a chat rather than a form. */
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              send();
            }
          }}
        />

        <span className="c-bar-tools">
          <Hint label="Add a gift">
            <button type="button" className="c-bar-btn" onClick={() => onTool("Extras")} aria-label="Gift">
              <Icon name="gift" size={20} />
            </button>
          </Hint>
          <Hint label="Add a GIF">
            <button type="button" className="c-bar-btn" onClick={() => onTool("Extras")} aria-label="GIF">
              <Icon name="gif" size={20} />
            </button>
          </Hint>
          <Hint label="Add a sticker">
            <button type="button" className="c-bar-btn" onClick={() => onTool("Extras")} aria-label="Sticker">
              <Icon name="sticker" size={20} />
            </button>
          </Hint>
          <Hint label="Add an emoji">
            <button type="button" className="c-bar-btn" onClick={() => onTool("Extras")} aria-label="Emoji">
              <Icon name="emoji" size={20} />
            </button>
          </Hint>
        </span>
      </div>

      {/* Everything the message can carry, on the side the message is on. */}
      <div className="c-tools" role="group" aria-label="Edit this message">
        {TOOLS.map(({ id, label, hint, Glyph }) => (
          <Hint key={id} label={hint}>
            <button
              type="button"
              className="c-tool"
              data-on={tool === id ? "true" : "false"}
              aria-pressed={tool === id}
              onClick={() => onTool(id)}
            >
              <Glyph size={17} stroke={1.9} />
              <span>{label}</span>
            </button>
          </Hint>
        ))}
      </div>
    </div>
  );
}
