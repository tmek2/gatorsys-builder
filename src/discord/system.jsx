"use client";

/* System messages.
 *
 * The client draws these on one line with a small glyph in the avatar gutter
 * rather than an avatar, in muted text, with the actor's name in full-contrast
 * ink. They are not styled messages — they have a different grid, no author
 * line and no timestamp column — which is why they are their own component
 * rather than a flag on the ordinary one.
 */

import { Icon } from "./icon";
import { Markdown } from "./markdown";
import { InlineText } from "./inline";

/* The glyph for each kind, and the sentence the client writes. `%s` is the
 * actor's name, which is drawn in full-contrast ink inside an otherwise muted
 * line — so the sentence is split around it rather than interpolated. */
const KINDS = {
  join: {
    tint: "var(--dc-green)",
    icon: "join-arrow",
    before: "",
    after: " joined the party.",
  },
  leave: {
    tint: "var(--dc-red)",
    icon: "leave-arrow",
    before: "",
    after: " left the server.",
  },
  add: {
    tint: "var(--dc-green)",
    icon: "join-arrow",
    before: "",
    after: " added someone to the group.",
  },
  boost: {
    tint: "var(--dc-boost)",
    icon: "boost",
    before: "",
    after: " just boosted the server!",
  },
  pin: {
    tint: "var(--text-muted)",
    icon: "pins",
    before: "",
    after: " pinned a message to this channel.",
  },
  thread: {
    tint: "var(--text-muted)",
    icon: "threads",
    before: "",
    after: " started a thread.",
  },
  call: {
    tint: "var(--dc-green)",
    icon: "call",
    before: "",
    after: " started a call.",
  },
  follow: {
    tint: "var(--text-muted)",
    icon: "megaphone",
    before: "",
    after: " has added a channel to this one.",
  },
};

export function SystemMessage({ message, user, selected, onSelect }) {
  const kind = KINDS[message.systemType] ?? KINDS.join;

  return (
    <article
      className={`dc-system${selected ? " dc-selected" : ""}`}
      onClick={onSelect}
      /* Same as a real message: clickable on the canvas means reachable from
         the keyboard. */
      role={onSelect ? "button" : undefined}
      tabIndex={onSelect ? 0 : undefined}
      aria-pressed={onSelect ? Boolean(selected) : undefined}
      onKeyDown={
        onSelect
          ? (event) => {
              if (event.target !== event.currentTarget) return;
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onSelect(event);
              }
            }
          : undefined
      }
      data-id={message.id}
    >
      <span className="dc-system-glyph" style={{ color: kind.tint }} aria-hidden="true">
        <Icon name={kind.icon} size={18} />
      </span>
      <span className="dc-system-text">
        {kind.before}
        <strong className="dc-system-actor" style={user?.color ? { color: user.color } : undefined}>
          {user?.name ?? "Someone"}
        </strong>
        {/* An override is what makes a boost tier line or a custom join
            message possible without a kind for each one. */}
        {message.content ? (
          <span className="dc-system-custom">
            <Markdown text={message.content} jumbo={false} />
          </span>
        ) : (
          kind.after
        )}
        <time className="dc-system-time">{message.timestamp}</time>
      </span>
    </article>
  );
}

/* The date rule between one day's messages and the next. */
export function DateDivider({ label }) {
  return (
    <div className="dc-divider">
      <span className="dc-divider-label">{label}</span>
    </div>
  );
}

/* The red rule the client leaves at the last message you read. */
export function NewDivider() {
  return (
    <div className="dc-divider dc-divider-new">
      <span className="dc-divider-label">NEW</span>
    </div>
  );
}

/* ------------------------------------------------- the client's own notices */

/* The blue bar the mobile client puts under the header when you come back to a
   channel that moved on without you. Tapping it jumps to the mark; the X
   dismisses it. Both are drawn, like everything else on a mockup. */
export function UnreadBanner({ count = 25, since = "19:42", edit }) {
  return (
    <div className="dc-unread-banner">
      <span>
        {/* Both halves are somebody's choice, not a constant. A mockup of a
            busy channel says a different number from a mockup of a quiet one,
            and the time is the whole point of the bar. */}
        {edit ? (
          <InlineText
            value={String(count ?? 25)}
            onChange={(v) => {
              const n = parseInt(v.replace(/[^0-9]/g, ""), 10);
              edit.canvas({ unreadCount: Number.isFinite(n) && n > 0 ? Math.min(n, 9999) : 1 });
            }}
            label="How many new messages"
            placeholder="1"
          />
        ) : (
          count
        )}
        + new messages since{" "}
        {edit ? (
          <InlineText
            value={since}
            onChange={(v) => edit.canvas({ unreadSince: v })}
            label="Since when"
            placeholder="19:42"
          />
        ) : (
          since
        )}
      </span>
      <Icon name="close" size={16} />
    </div>
  );
}

/* The top of a channel, which is what a real screenshot of a quiet one is
   mostly made of. */
export function ChannelStart({ name = "general", kind = "text", edit }) {
  /* The name here is the channel's own, so editing it edits the channel —
     the header, the composer's placeholder and this heading are one thing
     said three times, and they must not be able to disagree. */
  const label = edit ? (
    <InlineText value={name} onChange={edit.channel} label="Channel name" />
  ) : (
    name
  );
  return (
    <div className="dc-channel-start">
      <span className="dc-channel-start-mark" aria-hidden="true">
        <Icon name={kind === "announcement" ? "channel-announcement" : "channel-text"} size={40} />
      </span>
      <h2>Welcome to #{label}!</h2>
      <p aria-hidden="true">This is the start of the #{name} channel.</p>
    </div>
  );
}

/* An announcement channel offers to publish itself into your own server. */
export function FollowChannel({ text, edit }) {
  const copy = text || "Follow this channel to post updates into your own server.";
  return (
    <div className="dc-follow">
      <p>
        {edit ? (
          <InlineText
            value={copy}
            onChange={(v) => edit.canvas({ followText: v })}
            label="What the follow bar says"
            multiline
          />
        ) : (
          copy
        )}
      </p>
      <span className="dc-follow-btn" aria-hidden="true">Follow</span>
    </div>
  );
}

/* The composer of a channel you are only reading. */
export function NoAccess({ reason = "You do not have permission to send messages in this channel.", edit }) {
  return (
    <div className="dc-no-access">
      {/* Drawn rather than taken from the icon library. The client puts a
          crossed-out speech balloon here and there is no such tile — the one
          that was being used was `channel-rules`, a clipboard with a tick,
          which says the opposite of what this bar means. */}
      <svg className="dc-no-access-mark" width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
        <path
          d="M17 10c0 3.3-3.1 6-7 6a8 8 0 0 1-1.8-.2L4 17l1-2.8A5.6 5.6 0 0 1 3 10c0-3.3 3.1-6 7-6s7 2.7 7 6Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
        <path d="M4.8 15.2 15.6 4.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
      <span>
        {edit ? (
          <InlineText
            value={reason}
            onChange={(v) => edit.canvas({ readOnlyReason: v })}
            label="Why you cannot post"
            multiline
          />
        ) : (
          reason
        )}
      </span>
    </div>
  );
}
