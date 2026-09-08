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
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const field = useRef(null);

  useEffect(() => {
    if (!editing) setDraft(value ?? "");
  }, [value, editing]);

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
         edits the words; clicking anywhere else on the row selects it. */
      onClick={(event) => {
        event.stopPropagation();
        setEditing(true);
      }}
      onDoubleClick={(event) => {
        event.stopPropagation();
        setEditing(true);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === "F2") {
          event.preventDefault();
          event.stopPropagation();
          setEditing(true);
        }
      }}
    >
      {render ? render() : (value || placeholder)}
    </span>
  );
}
