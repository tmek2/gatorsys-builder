"use client";

/* A small panel that opens from something drawn on the mockup.
 *
 * The mockup is inside a frame that clips, scales and scrolls, so a panel laid
 * out inside it gets cut off by the frame's edge and shrunk by the canvas
 * zoom. Everything that opens *from* the picture therefore goes to the body
 * and is positioned from the thing that opened it — the same trick the
 * timestamp picker and the right-click menu already use, gathered here so the
 * next one does not reinvent it.
 */

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export function CanvasPop({ anchor, onClose, children, label, width = 264 }) {
  const box = useRef(null);
  const [at, setAt] = useState(null);

  /* Measured after mount, because where it can go depends on how tall it
     turned out to be. Below the control if there is room, above it if not. */
  useLayoutEffect(() => {
    const source = anchor?.current;
    const node = box.current;
    if (!source || !node) return;
    const a = source.getBoundingClientRect();
    const r = node.getBoundingClientRect();
    const below = a.bottom + 8;
    setAt({
      x: Math.max(8, Math.min(a.left, window.innerWidth - r.width - 8)),
      y: below + r.height > window.innerHeight - 8 ? Math.max(8, a.top - r.height - 8) : below,
    });
  }, [anchor]);

  useEffect(() => {
    const away = (event) => {
      if (box.current?.contains(event.target)) return;
      if (anchor?.current?.contains(event.target)) return;
      onClose();
    };
    const key = (event) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", key, true);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", key, true);
    };
  }, [anchor, onClose]);

  return createPortal(
    <div
      ref={box}
      className="dc-pop"
      role="dialog"
      aria-label={label}
      style={{
        width,
        left: at?.x ?? -9999,
        top: at?.y ?? -9999,
        visibility: at ? "visible" : "hidden",
      }}
      /* The canvas selects on click and pans on drag, and this is drawn over
         it but is not part of it. */
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      {children}
    </div>,
    document.body,
  );
}
