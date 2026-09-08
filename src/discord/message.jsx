"use client";

/* One message, as the client draws it.
 *
 * The whole surface is composed here: the reply line above it, the slash
 * command header, the avatar gutter, the author line with its badges, the
 * content, then everything a message can carry underneath — embeds,
 * components, attachments, a poll, a sticker, a thread, reactions.
 *
 * Order matters and is not arbitrary. Discord draws content, then embeds,
 * then attachments, then components, then the poll, then reactions. A kit
 * that puts components above attachments looks subtly wrong in a way that is
 * hard to name and impossible to unsee.
 */

import { memo, useContext, useRef, useState } from "react";
import { Markdown } from "./markdown";
import { RenderContext } from "./context";
import { Embed } from "./embed";
import { Blocks } from "./components";
import { Attachments, Invite, LinkPreview, Poll, Sticker, VoiceNote } from "./media";
import { Reactions } from "./reactions";
import { Icon } from "./icon";
import { InlineText } from "./inline";
import { StampPicker } from "./stamp-picker";
import { HoverToolbar } from "./toolbar";
import { ProfileCard } from "./profile";
import { SystemMessage } from "./system";

/** The check inside the APP tag on a verified application. */
function VerifiedMark() {
  return (
<Icon name="check" size={12} className="dc-badge-check" />
  );
}

function Author({ user }) {
  if (!user) return null;
  return (
    <span className="dc-author">
      <span className="dc-username" style={user.color ? { color: user.color } : undefined}>
        {user.name}
      </span>
      {user.roleIcon ? <img className="dc-role-icon" src={user.roleIcon} alt="" /> : null}
      {/* The server tag. A small pill after the name, with the server's icon
          in it — the client's clan badge. */}
      {user.tag ? <span className="dc-server-tag">{user.tag}</span> : null}
      {user.bot ? (
        <span className="dc-app-badge">
          {user.verified ? <VerifiedMark /> : null}
          {user.badge || "APP"}
        </span>
      ) : null}
    </span>
  );
}

/* The line above a reply. The client draws a short curved rule from the
 * avatar gutter up into the message being answered, the author at 14px, and
 * one line of their content with everything after the first line dropped. */
function ReplyLine({ target, users }) {
  if (!target) return null;
  const author = users.find((u) => u.id === target.user);
  const text = (target.content || "").split("\n")[0];
  return (
    <div className="dc-reply">
      <div className="dc-reply-spine" aria-hidden="true" />
      <img className="dc-reply-avatar" src={author?.avatar} alt="" />
      <span className="dc-reply-author" style={author?.color ? { color: author.color } : undefined}>
        {author?.bot ? <span className="dc-app-badge dc-app-badge-sm">{author.badge || "APP"}</span> : null}
        {author?.name}
      </span>
      <span className="dc-reply-content">
        {text ? (
          <Markdown text={text} jumbo={false} className="dc-reply-md" />
        ) : (
          <em className="dc-reply-empty">Click to see attachment</em>
        )}
      </span>
    </div>
  );
}

/* "Name used /command" — the header above an interaction response. */
function InteractionLine({ interaction, users }) {
  if (!interaction) return null;
  const author = users.find((u) => u.id === interaction.user);
  return (
    <div className="dc-interaction">
      <div className="dc-reply-spine" aria-hidden="true" />
      <img className="dc-reply-avatar" src={author?.avatar} alt="" />
      <span className="dc-reply-author" style={author?.color ? { color: author.color } : undefined}>
        {author?.name}
      </span>
      <span className="dc-interaction-used">
        used <span className="dc-mention dc-mention-command">/{interaction.command}</span>
      </span>
    </div>
  );
}

function ForwardCard({ forwarded }) {
  if (!forwarded) return null;
  return (
    <div className="dc-forward">
      <div className="dc-forward-head">
        <Icon name="reply" size={12} className="dc-forward-icon" />
        Forwarded
      </div>
      <div className="dc-forward-body">
        <Markdown text={forwarded.content || ""} jumbo={false} />
      </div>
      {forwarded.from ? <div className="dc-forward-from">{forwarded.from}</div> : null}
    </div>
  );
}

function ThreadTag({ thread }) {
  if (!thread) return null;
  return (
    <div className="dc-thread-tag">
      <Icon name="threads" size={16} />
      <span className="dc-thread-name">{thread.name || "Thread"}</span>
      <span className="dc-thread-count">
        {thread.count ?? 0} {thread.count === 1 ? "message" : "messages"}
      </span>
      <span className="dc-thread-go">See thread ›</span>
    </div>
  );
}

function MessageRow({ message, replyTo, selected, onSelect, dragHandlers, held, landing }) {
  const { users, edit } = useContext(RenderContext);
  const [stamping, setStamping] = useState(false);
  const clock = useRef(null);
  const user = users.find((u) => u.id === message.user) ?? users[0];

  if (message.kind === "system") {
    return <SystemMessage message={message} user={user} selected={selected} onSelect={onSelect} />;
  }

  const target = message.reply ? replyTo : null;
  /* A grouped message loses its avatar and its author line, but never its
     reply line or its command header: both of those force it out of the
     group in the client, so a grouped message that has one is drawn full. */
  const grouped = message.grouped && !target && !message.interaction;

  return (
    <article
      className={`dc-message${grouped ? " dc-grouped" : ""}${selected ? " dc-selected" : ""}${
        message.ephemeral ? " dc-ephemeral" : ""
      }${message.pinned ? " dc-pinned" : ""}`}
      data-held={held ? "true" : undefined}
      data-landing={landing ? "true" : undefined}
      onClick={onSelect}
      /* Clickable means reachable: without these the canvas is a wall a
         keyboard cannot get into, and the focus ring the stylesheet draws
         would never appear. Only when it actually does something. */
      role={onSelect ? "button" : undefined}
      tabIndex={onSelect ? 0 : undefined}
      aria-pressed={onSelect ? Boolean(selected) : undefined}
      onKeyDown={
        onSelect
          ? (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onSelect(event);
              }
            }
          : undefined
      }
      data-id={message.id}
    >
      {/* What the left column used to be. Reordering, duplicating and deleting
          belong to a message, so they live on the message rather than in a
          list beside it that has to be kept in sync with what is selected. */}
      {edit ? (
        <div className="dc-rail" aria-label="This message">
          <span
            className="dc-rail-grip"
            role="button"
            tabIndex={-1}
            aria-label="Drag to reorder"
            title="Drag to reorder"
            {...(dragHandlers ?? {})}
          >
            <Icon name="more-vertical" size={15} />
          </span>
          <button
            type="button"
            className="dc-rail-btn"
            title="Move up"
            aria-label="Move this message up"
            onClick={(event) => {
              event.stopPropagation();
              edit.move(message.id, -1);
            }}
          >
            <Icon name="caret-up" size={15} />
          </button>
          <button
            type="button"
            className="dc-rail-btn"
            title="Move down"
            aria-label="Move this message down"
            onClick={(event) => {
              event.stopPropagation();
              edit.move(message.id, 1);
            }}
          >
            <Icon name="caret-down" size={15} />
          </button>
          <button
            type="button"
            className="dc-rail-btn"
            title="Duplicate"
            aria-label="Duplicate this message"
            onClick={(event) => {
              event.stopPropagation();
              edit.duplicate(message.id);
            }}
          >
            <Icon name="copy-text" size={15} />
          </button>
          <button
            type="button"
            className="dc-rail-btn dc-rail-danger"
            title="Delete"
            aria-label="Delete this message"
            onClick={(event) => {
              event.stopPropagation();
              edit.remove(message.id);
            }}
          >
            <Icon name="delete" size={15} />
          </button>
        </div>
      ) : null}

      {message.pinned ? <div className="dc-pin-flag">Pinned</div> : null}
      {/* The bar the client floats over a message you are pointing at. Drawn
          when the mockup asks for it, because it is in most screenshots. */}
      {message.toolbar ? <HoverToolbar toolbar={message.toolbar} /> : null}
      {target ? <ReplyLine target={target} users={users} /> : null}
      {message.interaction ? <InteractionLine interaction={message.interaction} users={users} /> : null}

      <div className="dc-gutter">
        {grouped ? (
          <time className="dc-hover-time">{(message.timestamp || "").split(" at ").pop()}</time>
        ) : (
          <span className="dc-avatar-slot">
            <img className="dc-avatar" src={user?.avatar} alt="" draggable={false} />
            {user?.decoration ? <img className="dc-decoration" src={user.decoration} alt="" /> : null}
          </span>
        )}
      </div>

      <div className="dc-body">
        {grouped ? null : (
          <div className="dc-meta">
            <Author user={user} />
            {edit ? (
              <span className="dc-time-slot">
                <time
                  ref={clock}
                  className="dc-time dc-time-live"
                  role="button"
                  tabIndex={0}
                  title="Click to set the day and time"
                  onClick={(event) => {
                    event.stopPropagation();
                    setStamping((v) => !v);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      event.stopPropagation();
                      setStamping((v) => !v);
                    }
                  }}
                >
                  {message.timestamp}
                </time>
                {stamping ? (
                  <StampPicker
                    value={message.timestamp}
                    onChange={(next) => edit.stamp(message.id, next)}
                    onClose={() => setStamping(false)}
                    anchor={clock}
                  />
                ) : null}
              </span>
            ) : (
              <time className="dc-time">{message.timestamp}</time>
            )}
            {message.tts ? <span className="dc-flag">TTS</span> : null}
          </div>
        )}

        {message.content || edit ? (
          <div className="dc-content">
            {edit ? (
              /* Rendered as markdown until you double-click it, then the raw
                 text — because the thing being edited is the markdown, and
                 showing the rendered form in the field would be a lie about
                 what you are typing. */
              <InlineText
                value={message.content}
                onChange={(next) => edit.content(message.id, next)}
                multiline
                label="Message text"
                placeholder="Empty message"
                render={() => <Markdown text={message.content} />}
              />
            ) : (
              <Markdown text={message.content} />
            )}
            {message.edited ? <span className="dc-edited">(edited)</span> : null}
          </div>
        ) : message.edited ? (
          <div className="dc-content">
            <span className="dc-edited">(edited)</span>
          </div>
        ) : null}

        {message.forwarded ? <ForwardCard forwarded={message.forwarded} /> : null}

        {message.embeds?.map((embed) => (
          <Embed key={embed.id} embed={embed} />
        ))}

        {message.linkPreview ? <LinkPreview preview={message.linkPreview} /> : null}
        {message.invite ? <Invite invite={message.invite} /> : null}

        {message.attachments?.length ? <Attachments items={message.attachments} /> : null}
        {message.voice ? <VoiceNote voice={message.voice} /> : null}
        {message.sticker ? <Sticker sticker={message.sticker} /> : null}

        {message.components?.length ? <Blocks blocks={message.components} /> : null}

        {message.poll ? <Poll poll={message.poll} /> : null}

        {message.profile ? <ProfileCard profile={message.profile} user={user} /> : null}
        {message.reactions?.length ? <Reactions reactions={message.reactions} /> : null}

        {message.thread ? <ThreadTag thread={message.thread} /> : null}

        {message.ephemeral ? (
          <div className="dc-only-you">
            <Icon name="help" size={16} />
            Only you can see this ·{" "}
            <span className="dc-only-you-dismiss">Dismiss message</span>
          </div>
        ) : null}
      </div>
    </article>
  );
}

/* Memoised on purpose. Every message on the canvas re-rendered on every
   keystroke before this, because each one was handed a fresh click closure and
   a context that carried the whole message list. Neither is true now, so a row
   whose own data has not changed does no work — which is what makes a mockup
   with forty messages type as smoothly as one with two. */
export const Message = memo(MessageRow);
