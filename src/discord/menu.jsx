"use client";

/* The right-click menu.
 *
 * Discord replaces the browser's context menu everywhere, and so does every
 * other application that treats its canvas as a document. Leaving the browser's
 * own menu on a mockup offers Reload and View Page Source to somebody who
 * right-clicked a message — an answer to a question nobody asked.
 *
 * Two menus, because there are two things under the pointer: a message, and
 * the empty canvas around it. Each offers what that thing can do, in the order
 * the client lists them, with the destructive row last and marked.
 */

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./icon";

export function ContextMenu({ at, items, onClose }) {
  const box = useRef(null);
  const [place, setPlace] = useState(at);

  /* Flipped rather than clipped: a menu opened near the bottom of the window
     opens upwards, the way every native one does. */
  useLayoutEffect(() => {
    const node = box.current;
    if (!node) return;
    const r = node.getBoundingClientRect();
    setPlace({
      x: Math.min(at.x, window.innerWidth - r.width - 8),
      y: at.y + r.height > window.innerHeight - 8 ? Math.max(8, at.y - r.height) : at.y,
    });
  }, [at]);

  useEffect(() => {
    const away = (event) => {
      if (!box.current?.contains(event.target)) onClose();
    };
    const key = (event) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", key);
    /* A second right-click somewhere else replaces this menu rather than
       leaving two open. */
    document.addEventListener("contextmenu", away);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", key);
      document.removeEventListener("contextmenu", away);
    };
  }, [onClose]);

  return createPortal(
    <div
      ref={box}
      className="dc-menu"
      role="menu"
      style={{ left: place.x, top: place.y }}
      onContextMenu={(event) => event.preventDefault()}
    >
      {items.map((item, i) =>
        item === "-" ? (
          <span className="dc-menu-rule" key={`r${i}`} />
        ) : (
          <button
            key={item.id}
            type="button"
            role="menuitem"
            className={`dc-menu-item${item.danger ? " dc-menu-danger" : ""}`}
            disabled={item.disabled}
            onClick={() => {
              item.run();
              onClose();
            }}
          >
            {item.icon ? <Icon name={item.icon} size={16} /> : <span className="dc-menu-gap" />}
            <span className="dc-menu-label">{item.label}</span>
            {item.keys ? <kbd className="dc-menu-keys">{item.keys}</kbd> : null}
          </button>
        ),
      )}
    </div>,
    document.body,
  );
}
