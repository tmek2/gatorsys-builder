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

import { useCallback, useEffect, useRef, useState } from "react";
import { IconX } from "@tabler/icons-react";
import { floatingLayerOpen, useOverlay } from "./use-overlay";

/* Where a flick ends up, rather than where the finger left off.
 *
 * Apple's own projection out of Designing Fluid Interfaces: exponential decay
 * at the scroll deceleration rate, not the textbook v²/2a. A short fast flick
 * and a long slow drag both mean "put it away", and only a projection tells
 * you which of the two just happened. */
const project = (velocity, deceleration = 0.998) =>
  ((velocity / 1000) * deceleration) / (1 - deceleration);

export function Sheet({ open, onClose, title, subtitle, wide = false, children }) {
  const state = useOverlay(open);
  const box = useRef(null);
  /* How far the sheet has been pulled down, in pixels, while a drag is in
     progress. Null when nothing is being dragged, which is also what puts the
     CSS transition back in charge of the way out. */
  const [pulled, setPulled] = useState(null);
  const pull = useRef(null);

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

  /* Pulling it closed.
   *
   * The bar at the top of a sheet on a phone is a handle, and a handle that
   * does not move when you pull it is a picture of a handle. It tracks the
   * finger one to one downwards and rubber-bands upwards — there is nothing
   * above the top of a sheet, and resistance says so better than a hard stop.
   * At release, a pull past a third of the sheet or a flick that projects past
   * it closes; anything else springs back. */
  const grab = useCallback((event) => {
    if (event.button !== undefined && event.button !== 0) return;
    const node = box.current;
    if (!node) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    pull.current = {
      y: event.clientY,
      at: event.timeStamp,
      last: event.clientY,
      velocity: 0,
      height: node.getBoundingClientRect().height,
    };
    setPulled(0);
  }, []);

  const drag = useCallback((event) => {
    const p = pull.current;
    if (!p) return;
    const dy = event.clientY - p.y;
    const dt = event.timeStamp - p.at;
    /* Velocity from the last move rather than from the whole gesture: what
       matters at release is how fast the finger was going *then*. */
    if (dt > 0) p.velocity = ((event.clientY - p.last) / dt) * 1000;
    p.last = event.clientY;
    p.at = event.timeStamp;
    setPulled(dy > 0 ? dy : (dy * 34) / (34 - dy));
  }, []);

  const drop = useCallback(() => {
    const p = pull.current;
    pull.current = null;
    if (!p) return;
    const travelled = p.last - p.y;
    const ends = travelled + project(p.velocity);
    setPulled(null);
    if (ends > p.height / 3) close.current();
  }, []);

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
        style={
          pulled === null
            ? undefined
            : /* No transition while a finger is on it: the sheet is being moved
                 by the hand, not animated towards where the hand is. */
              { transform: `translateY(${Math.max(0, pulled)}px)`, transition: "none" }
        }
      >
        {/* Drawn only on a phone, where the sheet is a sheet. The row is the
            target, not the five-point bar inside it. */}
        <div
          className="e-sheet-grab"
          onPointerDown={grab}
          onPointerMove={drag}
          onPointerUp={drop}
          onPointerCancel={drop}
          aria-hidden="true"
        >
          <span />
        </div>
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
