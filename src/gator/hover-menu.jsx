"use client";

/* A control that opens on hover and stays open while you reach for it.
 *
 * The failure this exists to avoid is the one every hover menu has: the panel
 * is drawn a few pixels below the button, the pointer crosses that gap on its
 * way down, the button's hover ends, and the menu closes out from under the
 * hand going for it. Three things together make that impossible here:
 *
 *   the panel is a *descendant* of the same host the pointer entered, so
 *   `pointerleave` on the host does not fire while the pointer is inside the
 *   panel — a descendant is still inside;
 *
 *   the gap is bridged by padding on the panel's wrapper rather than by
 *   margin on the panel, so the space between the two is part of the host's
 *   hit region and crossing it never leaves;
 *
 *   and leaving is on a short delay anyway, so a pointer that clips a corner
 *   on the way past has time to come back.
 *
 * It is not hover-only. Pressing opens it, which is the whole of the story on
 * a touch screen, where there is no hover to speak of; focus opens it, Escape
 * and a press outside close it, so it can be driven from the keyboard.
 */

import { useEffect, useId, useRef, useState } from "react";
import "./hover-menu.css";

export function HoverMenu({
  trigger,
  children,
  align = "end",
  label,
  className = "",
  /* Long enough that dragging the pointer across the bar does not flash every
     menu it passes; short enough that aiming at one feels immediate. */
  openDelay = 90,
  closeDelay = 220,
}) {
  const [open, setOpen] = useState(false);
  const host = useRef(null);
  const timer = useRef(null);
  const id = useId();

  const cancel = () => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
  };
  const show = (delay = openDelay) => {
    cancel();
    timer.current = window.setTimeout(() => setOpen(true), delay);
  };
  const hide = (delay = closeDelay) => {
    cancel();
    timer.current = window.setTimeout(() => setOpen(false), delay);
  };

  useEffect(() => cancel, []);

  useEffect(() => {
    if (!open) return undefined;
    const away = (event) => {
      if (!host.current?.contains(event.target)) setOpen(false);
    };
    const key = (event) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      setOpen(false);
      /* Back to the thing that opened it, or the focus ring is left nowhere. */
      host.current?.querySelector("button, a")?.focus();
    };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", key);
    };
  }, [open]);

  return (
    <span
      ref={host}
      className={`g-hm ${className}`}
      data-open={open ? "true" : "false"}
      data-align={align}
      /* A pen or a mouse hovers; a finger does not, and treating a tap as a
         hover would open the menu and then immediately take the press as a
         click on whatever is underneath. */
      onPointerEnter={(event) => event.pointerType !== "touch" && show()}
      onPointerLeave={(event) => event.pointerType !== "touch" && hide()}
      onFocusCapture={() => show(0)}
      onBlurCapture={(event) => {
        if (!host.current?.contains(event.relatedTarget)) hide(0);
      }}
    >
      <span
        className="g-hm-trigger"
        onClick={() => {
          cancel();
          setOpen((was) => !was);
        }}
      >
        {typeof trigger === "function" ? trigger({ open }) : trigger}
      </span>

      {open ? (
        <span className="g-hm-panel" id={id} role="menu" aria-label={label}>
          <span className="g-hm-card">{children}</span>
        </span>
      ) : null}
    </span>
  );
}

/** One row in the panel. */
export function HoverMenuItem({ icon, title, note, onClick, href, disabled }) {
  const inside = (
    <>
      {icon ? <span className="g-hm-icon">{icon}</span> : null}
      <span className="g-hm-text">
        <b>{title}</b>
        {note ? <small>{note}</small> : null}
      </span>
    </>
  );
  return href ? (
    <a className="g-hm-item" role="menuitem" href={href}>
      {inside}
    </a>
  ) : (
    <button type="button" className="g-hm-item" role="menuitem" onClick={onClick} disabled={disabled}>
      {inside}
    </button>
  );
}
