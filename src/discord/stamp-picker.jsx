"use client";

/* Picking a timestamp instead of typing one.
 *
 * A timestamp is not free text — it is a day and a clock, and every wrong
 * mockup this tool has produced had a hand-typed one in it. Typed, you can
 * write "Yesterdya at 25:70" and the canvas will draw it. Picked, you cannot.
 *
 * Discord itself only ever writes four kinds of day line: Today, Yesterday, a
 * date, or a full date and time on an older message. So the day is a choice
 * between those rather than a free field, with a date field appearing only for
 * the one that needs it. The clock is two wheels and a meridiem, which is the
 * shape of every time control anybody has used on a phone.
 */

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { readStamp, writeStamp } from "@/lib/clock";

const DAYS = ["Today", "Yesterday"];

/* A date the client would actually print, for the "a date" option. */
const asDate = (d) =>
  `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;

function Wheel({ label, value, onChange, from, to, step = 1, pad = true, wrap = true }) {
  const items = [];
  for (let n = from; n <= to; n += step) items.push(n);
  const at = items.indexOf(value);

  const move = (by) => {
    if (!items.length) return;
    const next = at === -1 ? 0 : at + by;
    const i = wrap ? (next + items.length) % items.length : Math.min(items.length - 1, Math.max(0, next));
    onChange(items[i]);
  };

  return (
    <div className="sp-wheel">
      <span className="sp-wheel-label">{label}</span>
      <button type="button" className="sp-step" onClick={() => move(-1)} aria-label={`${label} down`}>
        −
      </button>
      <input
        className="sp-wheel-value"
        inputMode="numeric"
        aria-label={label}
        value={pad ? String(value).padStart(2, "0") : String(value)}
        onChange={(event) => {
          const n = Number(event.target.value.replace(/\D/g, ""));
          if (Number.isNaN(n)) return;
          onChange(Math.min(to, Math.max(from, n)));
        }}
        /* A wheel is a wheel: scrolling over it should turn it. */
        onWheel={(event) => {
          event.preventDefault();
          move(event.deltaY > 0 ? 1 : -1);
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowUp") {
            event.preventDefault();
            move(1);
          } else if (event.key === "ArrowDown") {
            event.preventDefault();
            move(-1);
          }
        }}
      />
      <button type="button" className="sp-step" onClick={() => move(1)} aria-label={`${label} up`}>
        +
      </button>
    </div>
  );
}

/** The whole control: a day, a clock, and the sentence it makes. */
export function StampPicker({ value, onChange, onClose, anchor }) {
  const parsed = readStamp(value) ?? { day: "Today", hour: 10, minute: 0, suffix: null };
  const [day, setDay] = useState(parsed.day);
  const [hour, setHour] = useState(parsed.hour);
  const [minute, setMinute] = useState(parsed.minute);
  const [half, setHalf] = useState(Boolean(parsed.suffix));
  const box = useRef(null);

  /* Rendered into the document rather than beside the timestamp. The mockup
     clips its own overflow — it has to, or a rounded corner would not be
     rounded — so a popover parented inside a message is a popover with its
     bottom four fifths cut off. Fixed coordinates from the anchor's rect are
     already in viewport space, which is what makes this survive the `zoom` on
     the canvas frame. */
  const [at, setAt] = useState(null);
  useLayoutEffect(() => {
    const node = anchor?.current;
    if (!node) return undefined;
    const place = () => {
      const r = node.getBoundingClientRect();
      const width = 268;
      setAt({
        top: Math.min(r.bottom + 8, window.innerHeight - 300),
        left: Math.max(8, Math.min(r.left, window.innerWidth - width - 8)),
      });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [anchor]);

  const known = DAYS.includes(day);

  /* Every change writes straight through, so the canvas behind the popover is
     the preview — there is no Apply button because there is nothing to apply. */
  useEffect(() => {
    const next = writeStamp({ day, hour, minute, suffix: half ? "am" : null });
    if (next !== value) onChange(next);
    // `value` is deliberately not a dependency: this pushes out, it does not
    // pull in, and reacting to its own write would fight the user's typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day, hour, minute, half]);

  useEffect(() => {
    const away = (event) => {
      if (!box.current?.contains(event.target)) onClose();
    };
    const key = (event) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", key);
    };
  }, [onClose]);

  if (!at) return null;

  return createPortal(
    <div
      className="sp"
      ref={box}
      role="dialog"
      aria-label="Timestamp"
      style={{ top: at.top, left: at.left }}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      <div className="sp-row">
        <span className="sp-label">Day</span>
        <div className="sp-days">
          {DAYS.map((d) => (
            <button
              key={d}
              type="button"
              className="sp-day"
              data-on={day === d ? "true" : "false"}
              onClick={() => setDay(d)}
            >
              {d}
            </button>
          ))}
          <button
            type="button"
            className="sp-day"
            data-on={known ? "false" : "true"}
            onClick={() => setDay(known ? asDate(new Date()) : day)}
          >
            A date
          </button>
        </div>
      </div>

      {known ? null : (
        <div className="sp-row">
          <span className="sp-label">Date</span>
          <input
            className="sp-date"
            value={day}
            aria-label="Date"
            onChange={(event) => setDay(event.target.value)}
          />
        </div>
      )}

      <div className="sp-row">
        <span className="sp-label">Time</span>
        <div className="sp-clock">
          <Wheel
            label="Hour"
            value={half ? (hour % 12 === 0 ? 12 : hour % 12) : hour}
            from={half ? 1 : 0}
            to={half ? 12 : 23}
            onChange={(h) => {
              if (!half) return setHour(h);
              /* Keep the meridiem the wheel is not showing: turning the hour
                 past twelve should not silently move the message to morning. */
              const pm = hour >= 12;
              const raw = h % 12;
              setHour(pm ? raw + 12 : raw);
            }}
          />
          <span className="sp-colon">:</span>
          <Wheel label="Minute" value={minute} from={0} to={59} onChange={setMinute} />
          {half ? (
            <div className="sp-meridiem">
              {["am", "pm"].map((m) => (
                <button
                  key={m}
                  type="button"
                  className="sp-day"
                  data-on={(hour < 12 ? "am" : "pm") === m ? "true" : "false"}
                  onClick={() => setHour(m === "am" ? hour % 12 : (hour % 12) + 12)}
                >
                  {m}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      <div className="sp-row">
        <span className="sp-label">Clock</span>
        <div className="sp-days">
          <button type="button" className="sp-day" data-on={half ? "false" : "true"} onClick={() => setHalf(false)}>
            24 hour
          </button>
          <button type="button" className="sp-day" data-on={half ? "true" : "false"} onClick={() => setHalf(true)}>
            am / pm
          </button>
        </div>
      </div>

      <p className="sp-preview">{writeStamp({ day, hour, minute, suffix: half ? "am" : null })}</p>
    </div>,
    document.body,
  );
}
