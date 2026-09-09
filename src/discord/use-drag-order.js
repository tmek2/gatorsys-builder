"use client";

/* Dragging a message into a new place, on the mockup itself.
 *
 * The old list had fixed-height rows, so it could work out where a drag had
 * got to by dividing the pointer's offset by a row height. Messages on the
 * canvas are whatever height their content makes them — one line, or an embed
 * with six fields — so this measures instead: every row's midpoint is read once
 * when the drag starts, and the landing slot is wherever the pointer is
 * relative to those. Measuring once rather than per frame matters, because the
 * rows shift as the preview reflows, and a midpoint read mid-drag is a midpoint
 * of the arrangement being previewed rather than the one being dragged from.
 *
 * The move and release are listened for on the window rather than through
 * `setPointerCapture` on the grip. Capture is the tidier API and it does not
 * survive this: the row re-renders on every frame of the drag, and a capture
 * held by an element React is reconciling is a capture that can be dropped
 * mid-gesture — which showed up as a drag that previewed correctly and then
 * refused to commit.
 */

import { useCallback, useEffect, useRef, useState } from "react";

/** Pixels before a press becomes a drag rather than a click. */
const SLOP = 5;

/* While a row is in hand the whole document should say so, not just the row.
   Set on <html> because the pointer leaves the row almost immediately — it is
   being dragged away from it — and a cursor set on the row itself flickers
   back to the default the moment it does. */
function grabbing(on) {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("dc-dragging", on);
}

export function useDragOrder({ onMove, scrollers = [] }) {
  const [drag, setDrag] = useState(null);
  const state = useRef(null);
  const move = useRef(onMove);
  move.current = onMove;

  useEffect(() => {
    const onMoveEvent = (event) => {
      const s = state.current;
      if (!s) return;
      const dy = event.clientY - s.y;
      s.pointer = event.clientY;
      if (!s.started) {
        if (Math.abs(dy) < SLOP) return;
        s.started = true;
        grabbing(true);
        /* Only now is this a drag rather than a press, and only now is it
           right to take the gesture off the browser. Doing it on pointerdown
           killed text selection on every message: you could not drag across a
           word without the row deciding you meant to move it. */
        window.getSelection?.()?.removeAllRanges();
        if (scrollers.length && !raf) raf = window.requestAnimationFrame(creep);
      }
      /* How many rows the pointer is now below, not counting the one in hand.
         That count IS the insertion index, because the list the row lands in
         is the list with the row already taken out of it — which is exactly
         what a splice out followed by a splice in does. Anything cleverer than
         counting gets the off-by-one wrong in one direction or the other. */
      let to = 0;
      for (let i = 0; i < s.rows.length; i += 1) {
        if (i !== s.from && event.clientY > s.rows[i].mid) to += 1;
      }
      /* `dy` is published every frame, not only when the slot changes: the
         held row is glued to the pointer, and a row that only moves when it
         crosses a boundary reads as broken rather than as dragging. */
      s.to = to;
      s.published = true;
      setDrag({ from: s.from, to, dy });
    };

    /* Held against the top or bottom edge, the view scrolls itself. Without it
       a conversation taller than its frame can only be reordered as far as the
       screen reaches, which for a long one is most of the way to useless.
       Speed ramps with how far into the edge the pointer is, so a nudge creeps
       and a firm hold moves.
     *
       Which view, though, depends on what is actually too tall. The frame has
       a maximum now, so a long mockup scrolls inside itself while the stage
       around it does not move at all — and a creep aimed at the stage sat
       there doing nothing. So the candidates are tried in order, innermost
       first, and the first one with room in the direction being asked for is
       the one that moves. */
    let raf = 0;
    const EDGE = 56;
    const creep = () => {
      raf = 0;
      const s = state.current;
      if (!s?.started) return;
      for (const ref of scrollers) {
        const view = ref?.current;
        if (!view) continue;
        const r = view.getBoundingClientRect();
        let by = 0;
        if (s.pointer < r.top + EDGE) by = -Math.ceil((r.top + EDGE - s.pointer) / 4);
        else if (s.pointer > r.bottom - EDGE) by = Math.ceil((s.pointer - (r.bottom - EDGE)) / 4);
        if (!by) continue;
        const room =
          by < 0 ? view.scrollTop > 0 : view.scrollTop < view.scrollHeight - view.clientHeight - 1;
        if (!room) continue;
        view.scrollTop += by;
        /* The rows moved under the pointer, so the midpoints measured at the
           start have to move with them or the landing slot drifts. */
        for (const row of s.rows) row.mid -= by;
        onMoveEvent({ clientY: s.pointer });
        break;
      }
      raf = window.requestAnimationFrame(creep);
    };

    const onUp = () => {
      if (raf) window.cancelAnimationFrame(raf);
      raf = 0;
      grabbing(false);
      const s = state.current;
      state.current = null;
      setDrag(null);
      if (s?.started && s.to !== s.from) move.current(s.from, s.to);
    };

    /* Escape puts it back. A gesture with no way out is a gesture people are
       afraid to start. */
    const onKey = (event) => {
      if (event.key !== "Escape" || !state.current) return;
      event.preventDefault();
      event.stopPropagation();
      if (raf) window.cancelAnimationFrame(raf);
      raf = 0;
      grabbing(false);
      state.current = null;
      setDrag(null);
    };

    window.addEventListener("pointermove", onMoveEvent);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    window.addEventListener("keydown", onKey, true);
    return () => {
      if (raf) window.cancelAnimationFrame(raf);
      grabbing(false);
      window.removeEventListener("pointermove", onMoveEvent);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      window.removeEventListener("keydown", onKey, true);
    };
    /* Deliberately not depending on `drag`.
     *
       It was in here so the first move could publish a state that equalled the
       start, and it cost the whole gesture: the effect tore down and rebuilt on
       every frame of the drag, and the rebuild cancelled the animation frame
       driving the edge scroll and never started another — so holding a row
       against the top of a long conversation sat there doing nothing. Whether
       anything has been published is a fact about the drag, so it lives on the
       drag. */
  }, [scrollers]);

  const start = useCallback((event, index, root) => {
    if (event.button !== 0) return;
    const node = root?.current ?? root;
    if (!node) return;
    /* Not `preventDefault` here. Until the pointer has travelled this is a
       press, and a press on a message is a click or the start of a text
       selection — both of which `preventDefault` on pointerdown would eat. */
    event.stopPropagation();
    const rows = [...node.children]
      .map((child) => child.querySelector("[data-id]") ?? child)
      .map((n) => {
        const r = n.getBoundingClientRect();
        return { mid: r.top + r.height / 2 };
      });
    state.current = { from: index, to: index, y: event.clientY, rows, started: false };
  }, []);

  /* Where the row would land, expressed against the list as it is *drawn* —
     which still contains the row being dragged. The hook's own `to` is an
     index into the list with that row taken out, and drawing a line at that
     index is off by one for every downward move. */
  const lineAt = drag ? (drag.to <= drag.from ? drag.to : drag.to + 1) : -1;

  return {
    drag,
    lineAt,
    dragging: Boolean(drag),
    /* Everything a row needs, so a caller cannot forget half of it: the
       press that may become a drag, and the state that says what this row is
       during one. */
    rowProps: (index) => ({
      "data-held": drag?.from === index ? "true" : undefined,
      style:
        drag?.from === index
          ? {
              transform: `translateY(${drag.dy}px)`,
              zIndex: 5,
              position: "relative",
              pointerEvents: "none",
            }
          : undefined,
    }),
    handlers: (index, root) => ({
      onPointerDown: (event) => start(event, index, root),
    }),
  };
}
