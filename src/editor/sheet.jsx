"use client";

/* One sheet, four uses.
 *
 * Templates, members, appearance and backups are all the same shape: a thing
 * you open, do one job in, and close again. They were four different places —
 * one a real sheet, three of them panels that *replaced the inspector*, which
 * is why choosing "Members" made the message you were editing disappear.
 *
 * A sheet is the right container for all of them because none is where you
 * live: the message and its preview are, and those must stay on screen behind
 * whatever you opened.
 */

import { useEffect, useRef } from "react";
import { IconX } from "@tabler/icons-react";
import { floatingLayerOpen, useOverlay } from "./use-overlay";

export function Sheet({ open, onClose, title, subtitle, wide = false, children }) {
  const state = useOverlay(open);
  const box = useRef(null);

  /* The live handler, read through a ref. `onClose` is written inline at every
     call site, so it is a new function on every render of the editor — and an
     effect that depends on it re-runs on every keystroke. That is not
     theoretical: it took focus out of the field being typed into, forty
     milliseconds after each letter, which read as "the name field kicks me out
     every time I type". */
  const close = useRef(onClose);
  close.current = onClose;

  /* Escape closes it. Nothing here depends on the handler's identity. */
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => {
      if (event.key !== "Escape") return;
      /* Escape belongs to the innermost thing that is open. A colour picker
         floating over this sheet is its own layer, and closing the whole sheet
         out from under it takes away far more than the person asked for. */
      if (floatingLayerOpen()) return;
      event.stopPropagation();
      close.current();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  /* Focus moves inside once, on open, so a keyboard is not left behind the
     scrim tabbing through a page it cannot see — and never again, because
     moving focus is something you do to somebody. */
  useEffect(() => {
    if (!open) return undefined;
    const id = window.setTimeout(() => box.current?.focus(), 40);
    return () => window.clearTimeout(id);
  }, [open]);

  if (!state.mounted) return null;

  return (
    <div className="e-sheet-scrim e-no-export" data-state={state.state} onClick={onClose}>
      <div
        ref={box}
        className="e-sheet"
        data-state={state.state}
        data-wide={wide ? "true" : "false"}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
      >
        <header className="e-sheet-head">
          <div className="e-sheet-headings">
            <h2>{title}</h2>
            {subtitle ? <p>{subtitle}</p> : null}
          </div>
          {/* A scrim you can click is not discoverable on its own; the button
              is what most people reach for, so it is always drawn. */}
          <button type="button" className="e-icon-btn e-sheet-x" onClick={onClose} aria-label="Close">
            <IconX size={17} />
          </button>
        </header>
        <div className="e-sheet-body">{children}</div>
      </div>
    </div>
  );
}
