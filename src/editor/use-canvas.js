"use client";

/* The canvas: grabbing it, throwing it, and zooming it.
 *
 * A preview you can only reach with a scrollbar is a picture behind glass. The
 * canvas here is grabbed and moved the way the thing it is showing would be,
 * which means three things have to be true.
 *
 * It tracks one-to-one. While the pointer is down the canvas is exactly where
 * the pointer put it, with no smoothing and no threshold once the drag has
 * started — anything else and the hand and the canvas are in different places.
 *
 * A release throws it. The scroll continues at the velocity the hand had, and
 * decays; there is no seam where the drag stops and the animation starts,
 * because the animation starts at the drag's own speed.
 *
 * A throw can be caught. Putting the pointer down during the deceleration
 * stops it dead at wherever it is on screen, which is what happens when you
 * put a hand on something sliding across a table.
 *
 * Native wheel and trackpad scrolling are left completely alone. They are
 * already good, and replacing them would be replacing something that works
 * with something that has to be maintained.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { SPRING, createSpring, createTracker, prefersReducedMotion, project } from "./motion";

export function useCanvasGestures({ scrollerRef, zoom, setZoom }) {
  const [dragging, setDragging] = useState(false);
  /* The zoom as it is right now, for gestures that start from it. Read through
     a ref so the touch listeners are bound once rather than rebound on every
     frame of a pinch — which would tear down the very listener mid-gesture. */
  const live = useRef(zoom);
  live.current = zoom;
  const glide = useRef(null);
  const tracker = useRef(createTracker());
  const from = useRef(null);

  /* The deceleration after a throw. Not a spring — a throw has no target to
     settle on, it has a speed that runs out — so this is the same exponential
     decay `project` describes, run frame by frame against the scroller. */
  const stopGlide = useCallback(() => {
    if (glide.current) cancelAnimationFrame(glide.current);
    glide.current = null;
  }, []);

  const throwTo = useCallback(
    (vx, vy) => {
      const node = scrollerRef.current;
      if (!node || prefersReducedMotion()) return;

      // Under a threshold this is a click that moved a little, not a throw.
      if (Math.hypot(vx, vy) < 60) return;

      const rate = 0.995;
      let x = vx;
      let y = vy;
      let last = performance.now();

      const step = (now) => {
        const dt = Math.min(0.064, (now - last) / 1000);
        last = now;
        const decay = rate ** (dt * 1000);
        x *= decay;
        y *= decay;

        const beforeX = node.scrollLeft;
        const beforeY = node.scrollTop;
        node.scrollLeft -= x * dt;
        node.scrollTop -= y * dt;

        /* An edge ends the throw on that axis rather than letting it keep
           counting down against a wall it is already touching. */
        if (node.scrollLeft === beforeX) x = 0;
        if (node.scrollTop === beforeY) y = 0;

        if (Math.hypot(x, y) < 8) {
          glide.current = null;
          return;
        }
        glide.current = requestAnimationFrame(step);
      };
      glide.current = requestAnimationFrame(step);
    },
    [scrollerRef],
  );

  const onPointerDown = useCallback(
    (event) => {
      const node = scrollerRef.current;
      if (!node) return;
      // Only a plain press on the background. A middle-click pans in most
      // canvases too, so it is allowed; anything with a modifier is not ours.
      if (event.button !== 0 && event.button !== 1) return;
      if (event.target.closest("button, input, textarea, select, a")) return;
      /* The mockup itself is not pannable ground. Dragging across a message
         is somebody selecting its text — the most ordinary thing to do to
         words on a screen — and answering that with a scroll is the interface
         deciding it knows better. The stage around it is the ground, and a
         middle-click pans from anywhere for when the mockup fills the view. */
      if (event.button === 0 && event.target.closest(".dc")) return;

      // Catching a throw is the first thing a press does.
      stopGlide();

      tracker.current.clear();
      tracker.current.add(event.clientX, event.clientY);
      from.current = {
        x: event.clientX,
        y: event.clientY,
        left: node.scrollLeft,
        top: node.scrollTop,
        moved: false,
        id: event.pointerId,
      };
      /* Capture is claimed when the drag starts, not here.
         While a pointer is captured the browser dispatches the trailing
         `click` at the capturing element rather than at what was under the
         pointer — so capturing on press meant a plain click on a message
         landed on the scroller and the message never heard about it. Clicking
         a message on the canvas is how you choose which one to edit, so it
         has to survive. The drag still captures; see the move handler. */
    },
    [scrollerRef, stopGlide],
  );

  const onPointerMove = useCallback(
    (event) => {
      const grab = from.current;
      const node = scrollerRef.current;
      if (!grab || !node || event.pointerId !== grab.id) return;

      const dx = event.clientX - grab.x;
      const dy = event.clientY - grab.y;

      /* Ten pixels of hysteresis before this counts as a drag, so a press that
         wobbles is still a press. Once it is a drag it stays one — no further
         thresholds, no smoothing. */
      if (!grab.moved && Math.hypot(dx, dy) < 10) return;
      if (!grab.moved) {
        grab.moved = true;
        setDragging(true);
        /* Now it is a drag, so take the pointer: the canvas has to keep
           following it out over the panels, and a drag that dies at the
           stage's edge is a drag that fights you. Nothing is expecting a
           click any more — the one that follows is swallowed on pointer-up. */
        try {
          event.currentTarget.setPointerCapture(grab.id);
        } catch {
          // Capture can be refused if the pointer has already gone; the pan
          // still works, it just stops at the stage's edge.
        }
      }

      tracker.current.add(event.clientX, event.clientY);
      node.scrollLeft = grab.left - dx;
      node.scrollTop = grab.top - dy;
    },
    [scrollerRef],
  );

  const onPointerUp = useCallback(
    (event) => {
      const grab = from.current;
      if (!grab || event.pointerId !== grab.id) return;
      from.current = null;
      setDragging(false);
      if (!grab.moved) return;
      /* The click that follows a drag is not a click on what happens to be
         under the pointer — it is the end of the drag. Swallowed once, in the
         capture phase, before it can reach the message it finished over. */
      const node = scrollerRef.current;
      node?.addEventListener(
        "click",
        (click) => {
          click.stopPropagation();
          click.preventDefault();
        },
        { capture: true, once: true },
      );

      const [vx, vy] = tracker.current.velocity();
      throwTo(vx, vy);
    },
    [scrollerRef, throwTo],
  );

  /* Zoom, on a spring.
   *
   * Stepping the zoom used to jump: the canvas was one size on one frame and
   * another on the next, which at a 10% step is a flicker rather than a
   * change. A spring means holding the button reads as one continuous
   * movement, because each press re-aims a spring that is still moving instead
   * of starting a new animation from a standstill. */
  const shown = useRef(zoom);
  const [display, setDisplay] = useState(zoom);
  const spring = useRef(null);

  useEffect(() => {
    spring.current = createSpring({
      value: zoom,
      ...SPRING.settle,
      onChange: (v) => {
        shown.current = v;
        setDisplay(v);
      },
    });
    return () => spring.current?.stop();
    // Built once; the target is pushed in below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    spring.current?.set(zoom);
  }, [zoom]);

  /* Pinch, and ⌘/ctrl + wheel, which is the trackpad pinch on a desktop.
   *
   * Non-passive because it has to prevent the browser's own page zoom, and
   * bound here rather than through React so that `passive: false` is actually
   * honoured — React attaches wheel listeners passively. */
  useEffect(() => {
    const node = scrollerRef.current;
    if (!node) return undefined;
    const onWheel = (event) => {
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
        // Exponential, so a step feels the same size at 40% as it does at 200%.
        setZoom((z) => Math.min(3, Math.max(0.25, z * Math.exp(-event.deltaY / 420))));
        return;
      }

      /* A wheel inside the mockup scrolls the mockup, full stop.
       *
       * `overscroll-behavior: contain` on the conversation covers most of it,
       * but only while that container still has somewhere to go: the moment it
       * reaches an end the wheel chains out and throws the whole canvas across
       * the editor, which is the opposite of what somebody reading to the
       * bottom of a mockup wants. Reading a mockup and moving a mockup are
       * different gestures and they should not share a wheel. */
      const inner = event.target instanceof Element ? event.target.closest(".dc-scroll") : null;
      if (!inner) return;
      event.preventDefault();
      inner.scrollTop += event.deltaY;
    };
    node.addEventListener("wheel", onWheel, { passive: false });
    return () => node.removeEventListener("wheel", onWheel);
  }, [scrollerRef, setZoom]);

  /* Two fingers, on a touch screen.
   *
   * The ⌘-wheel above is a trackpad pinch and nothing else: on a phone there
   * was no way to zoom but the two small buttons on the bar, on the one device
   * where pinching is the first thing anybody tries. This is the real gesture
   * — the zoom tracks the spread of the fingers one to one, so the canvas is
   * exactly as big as the hand has made it at every frame.
   *
   * Touch events rather than pointer events, because this needs to know about
   * both fingers at once and `preventDefault` on the first frame is what stops
   * the browser starting a two-finger scroll instead. One finger is left
   * completely alone: that is the pan, and the scroller already does it. */
  useEffect(() => {
    const node = scrollerRef.current;
    if (!node) return undefined;
    const spread = (touches) =>
      Math.hypot(
        touches[0].clientX - touches[1].clientX,
        touches[0].clientY - touches[1].clientY,
      );
    let pinch = null;
    const onStart = (event) => {
      if (event.touches.length !== 2) return;
      stopGlide();
      pinch = { from: spread(event.touches), zoom: live.current };
      event.preventDefault();
    };
    const onMove = (event) => {
      if (!pinch || event.touches.length !== 2) return;
      event.preventDefault();
      const now = spread(event.touches);
      if (!pinch.from) return;
      setZoom(Math.min(3, Math.max(0.25, pinch.zoom * (now / pinch.from))));
    };
    const onEnd = (event) => {
      if (event.touches.length < 2) pinch = null;
    };
    node.addEventListener("touchstart", onStart, { passive: false });
    node.addEventListener("touchmove", onMove, { passive: false });
    node.addEventListener("touchend", onEnd);
    node.addEventListener("touchcancel", onEnd);
    return () => {
      node.removeEventListener("touchstart", onStart);
      node.removeEventListener("touchmove", onMove);
      node.removeEventListener("touchend", onEnd);
      node.removeEventListener("touchcancel", onEnd);
    };
  }, [scrollerRef, setZoom, stopGlide]);

  useEffect(() => () => stopGlide(), [stopGlide]);

  return {
    dragging,
    /** The zoom as it is on screen this frame, which during a change is not
     *  the same as the zoom that was asked for. */
    zoomShown: display,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel: onPointerUp,
    },
  };
}
