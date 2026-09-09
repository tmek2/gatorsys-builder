"use client";

/* Reactions.
 *
 * Two states, and the difference is not only the colour: a reaction you have
 * added takes the blurple fill and a one-pixel blurple border, which makes the
 * pill sit a hair larger than its neighbours. Burst reactions — Discord's
 * super reactions — take the pink and a sparkle, and are the one case where
 * the count is drawn in the accent rather than in muted text.
 */

import { Emoji } from "./emoji-node";
import { Icon } from "./icon";
import { InlineText } from "./inline";

export function Reactions({ reactions = [], edit }) {
  if (!reactions.length) return null;
  return (
    <div className="dc-reactions">
      {reactions.map((r) => (
        <span
          key={r.id}
          className={`dc-reaction${r.me ? " dc-reaction-me" : ""}${r.burst ? " dc-reaction-burst" : ""}`}
        >
          <Emoji text={r.src || r.emoji} className="dc-reaction-emoji" />
          <span className="dc-reaction-count">
            {/* The number is the whole point of a reaction in a screenshot.
                Typed on the pill rather than found in a list of reactions
                three panels away. */}
            {edit ? (
              <InlineText
                value={String(r.count ?? 0)}
                onChange={(v) =>
                  edit(
                    reactions.map((x) =>
                      x.id === r.id
                        ? { ...x, count: Math.max(0, parseInt(v.replace(/[^0-9]/g, ""), 10) || 0) }
                        : x,
                    ),
                  )
                }
                label="How many reacted"
              />
            ) : (
              r.count
            )}
          </span>
        </span>
      ))}
      <span className="dc-reaction dc-reaction-add" aria-hidden="true">
        <Icon name="add-reaction" size={16} />
      </span>
    </div>
  );
}
