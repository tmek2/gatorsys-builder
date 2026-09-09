"use client";

/* Editing the mockup by editing the mockup.
 *
 * A title in a document editor is not changed from a panel — you double-click
 * the words and type over them — and a mockup should behave the same way. The
 * message text, the timestamp and the channel name are all edited where they
 * are drawn, so there is no step between "that is wrong" and fixing it.
 *
 * The rule that keeps this honest: the editing state must occupy exactly the
 * space the text did. A field that is a pixel taller reflows the message under
 * it and the mockup jumps as you start typing, which is the thing that makes
 * in-place editing feel like a trick rather than a feature.
 */

import { useEffect, useLayoutEffect, useRef, useState } from "react";

/**
 * Text that becomes a field when you double-click it.
 *
 * `multiline` decides whether Enter commits or breaks the line: a message body
 * takes several lines, a channel name never does.
 */
export function InlineText({
  value,
  onChange,
  render,
  className = "",
  multiline = false,
  placeholder = "",
  label,
  autoFocus = false,
  open = false,
}) {
  /* A field that was just conjured by pressing "+" starts open. Adding a tag
     and then having to find and click the empty pill you just made is two
     gestures for one intention. */
  const [editing, setEditing] = useState(autoFocus);
  const [draft, setDraft] = useState(value ?? "");
  const field = useRef(null);
  const press = useRef(null);

  useEffect(() => {
    if (!editing) setDraft(value ?? "");
  }, [value, editing]);

  /* Somebody asked for this field from somewhere else — the right-click menu's
     "Edit this message", say. One-way: the caller raises the flag for a frame
     and lowers it, and the field keeps its own editing state from there, so
     the two cannot fight over who closes it. */
  useEffect(() => {
    if (open) setEditing(true);
  }, [open]);

  /* Grow to the text rather than scroll it, so a long message is edited in
     full instead of through a two-line window. */
  useLayoutEffect(() => {
    if (!editing || !multiline) return;
    const el = field.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${el.scrollHeight}px`;
  }, [draft, editing, multiline]);

  useEffect(() => {
    if (!editing) return;
    const el = field.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, [editing]);

  const commit = () => {
    setEditing(false);
    if (draft !== value) onChange(draft);
  };
  const cancel = () => {
    setDraft(value ?? "");
    setEditing(false);
  };

  if (editing) {
    const Tag = multiline ? "textarea" : "input";
    return (
      <Tag
        ref={field}
        className={`dc-inline-field${multiline ? " dc-inline-area" : ""} ${className}`}
        value={draft}
        rows={multiline ? 1 : undefined}
        aria-label={label}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            cancel();
          } else if (event.key === "Enter" && (!multiline || (!event.shiftKey && event.metaKey))) {
            event.preventDefault();
            commit();
          }
        }}
        /* The canvas selects a message on click and drags on pointer-move.
           Neither should happen to the field being typed into. */
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      />
    );
  }

  return (
    <span
      className={`dc-inline ${className}`}
      role="button"
      tabIndex={0}
      title={label ? `${label} — click to edit` : "Click to edit"}
      /* One click, not two. Double-click is what a title in a document editor
         takes, and it is also a gesture nobody is told about: the first report
         of this said "I can't edit message contents at all", from somebody
         looking straight at the text they wanted to change. Clicking the words
         edits the words; clicking anywhere else on the row selects it.
         A click that travelled is not a click, though — it is somebody
         selecting the text, and swapping a field in under a half-made
         selection throws it away. */
      onPointerDown={(event) => {
        press.current = { x: event.clientX, y: event.clientY };
      }}
      onClick={(event) => {
        const from = press.current;
        press.current = null;
        if (
          from &&
          Math.hypot(event.clientX - from.x, event.clientY - from.y) > 4
        ) {
          return;
        }
        /* Deliberately allowed to bubble. The row under this text selects on
           click, and editing the words of a message the composer is not aimed
           at is how you end up typing into one message while another is the
           one being sent to. Both things happen: the row is selected and the
           words become a field. */
        setEditing(true);
      }}
      onDoubleClick={() => setEditing(true)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === "F2") {
          event.preventDefault();
          event.stopPropagation();
          setEditing(true);
        }
      }}
    >
      {/* Never nothing. An empty value renders a zero-width span, which is a
          control nobody can hit — so a name somebody cleared could not be
          typed back in. */}
      {render ? render() : value || <span className="dc-inline-empty">{placeholder || "Empty"}</span>}
    </span>
  );
}
