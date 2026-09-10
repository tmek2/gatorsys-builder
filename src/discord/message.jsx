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
import { Attachments, Gift, Invite, LinkPreview, Poll, Sticker, VoiceNote } from "./media";
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

/* The server tag, and the way one is added.
 *
 * Discord's clan badge is a per-mockup decision — the same person is tagged in
 * one screenshot and not in another — so it belongs on the name, where you can
 * see whether it is there, rather than behind a sheet. With no tag set the
 * control is a "+" that only appears while the row is hovered; with one set it
 * is the pill itself, typed over in place. Clearing the text removes it, so
 * add and remove are the same gesture reversed. */
function ServerTag({ user, edit }) {
  const [fresh, setFresh] = useState(false);
  const has = Boolean(user.tag);

  if (!edit) return has ? <span className="dc-server-tag">{user.tag}</span> : null;

  if (has || fresh) {
    return (
      <span className="dc-server-tag dc-server-tag-live e-no-export-empty" data-empty={has ? undefined : "true"}>
        <InlineText
          value={user.tag}
          /* Only the pill that was just conjured opens typing. One that was
             already there is text you clicked on, and stealing focus from a
             re-render would fight whatever else you were doing. */
          autoFocus={fresh && !has}
          onChange={(next) => {
            const tag = next.trim().slice(0, 16);
            setFresh(Boolean(tag));
            edit.tag(user.id, tag);
          }}
          /* Pressing "+" and then clicking away leaves nothing typed, and an
             empty pill with the word "Tag" greyed inside it is a word nobody
             wrote turning up in the export. Closing with nothing in it puts
             the control back to the "+". */
          onCancel={() => setFresh(false)}
          onBlurEmpty={() => setFresh(false)}
          label="Server tag"
          placeholder="Tag"
        />
      </span>
    );
  }

  return (
    <button
      type="button"
      className="dc-tag-add e-no-export"
      title="Give this member a server tag"
      aria-label="Give this member a server tag"
      /* The canvas selects on click and drags on move. Neither is what
         pressing a button on the message means. */
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        setFresh(true);
      }}
    >
      <span aria-hidden="true">+</span>
    </button>
  );
}

function Author({ user, edit }) {
  if (!user) return null;
  return (
    <span className="dc-author">
      {/* The name is edited on the name. Everything else about a member is a
          form somewhere, but the two things you look at while judging a mockup
          — what they are called and what they look like — are changed by
          pressing them. */}
      <span className="dc-username" style={user.color ? { color: user.color } : undefined}>
        {edit ? (
          <InlineText
            value={user.name}
            onChange={(name) => edit.rename(user.id, name)}
            label="Member name"
            placeholder="Unnamed"
          />
        ) : (
          user.name
        )}
      </span>
      {user.roleIcon ? <img className="dc-role-icon" src={user.roleIcon} alt="" /> : null}
      <ServerTag user={user} edit={edit} />
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
function InteractionLine({ interaction, users, edit }) {
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
        used{" "}
        <span className="dc-mention dc-mention-command">
          /
          {edit ? (
            <InlineText
              value={interaction.command}
              onChange={(command) => edit({ ...interaction, command })}
              label="Which command"
              placeholder="command"
            />
          ) : (
            interaction.command
          )}
        </span>
      </span>
    </div>
  );
}

function ForwardCard({ forwarded, edit }) {
  if (!forwarded) return null;
  return (
    <div className="dc-forward">
      <div className="dc-forward-head">
        <Icon name="reply" size={12} className="dc-forward-icon" />
        Forwarded
      </div>
      <div className="dc-forward-body">
        {edit ? (
          <InlineText
            value={forwarded.content || ""}
            onChange={(content) => edit({ ...forwarded, content })}
            label="What was forwarded"
            placeholder="The forwarded text"
            multiline
            render={
              forwarded.content
                ? () => <Markdown text={forwarded.content} jumbo={false} />
                : undefined
            }
          />
        ) : (
          <Markdown text={forwarded.content || ""} jumbo={false} />
        )}
      </div>
      {forwarded.from || edit ? (
        <div className="dc-forward-from">
          {edit ? (
            <InlineText
              value={forwarded.from}
              onChange={(from) => edit({ ...forwarded, from })}
              label="Where it came from"
              placeholder="#channel"
            />
          ) : (
            forwarded.from
          )}
        </div>
      ) : null}
    </div>
  );
}

function ThreadTag({ thread, edit }) {
  if (!thread) return null;
  return (
    <div className="dc-thread-tag">
      <Icon name="threads" size={16} />
      <span className="dc-thread-name">
        {edit ? (
          <InlineText
            value={thread.name || "Thread"}
            onChange={(name) => edit({ ...thread, name })}
            label="Thread name"
          />
        ) : (
          thread.name || "Thread"
        )}
      </span>
      <span className="dc-thread-count">
        {edit ? (
          <InlineText
            value={String(thread.count ?? 0)}
            onChange={(v) => edit({ ...thread, count: Math.max(0, parseInt(v.replace(/[^0-9]/g, ""), 10) || 0) })}
            label="How many messages in it"
          />
        ) : (
          thread.count ?? 0
        )}{" "}
        {thread.count === 1 ? "message" : "messages"}
      </span>
      <span className="dc-thread-go">See thread ›</span>
    </div>
  );
}

function MessageRow({ message, replyTo, selected, onSelect, dragHandlers, held, landing, onMenu, grouped: stacked }) {
  const { users, roles, edit } = useContext(RenderContext);
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
  const grouped = (stacked ?? message.grouped) && !target && !message.interaction;

  return (
    <article
      className={`dc-message${grouped ? " dc-grouped" : ""}${selected ? " dc-selected" : ""}${
        message.ephemeral ? " dc-ephemeral" : ""
      }${message.pinned ? " dc-pinned" : ""}`}
      onContextMenu={onMenu}
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
              /* Only when the row itself has the keyboard.
                 Without this line the row answered every key pressed inside
                 it, and its answer to Space was `preventDefault` — so a space
                 typed into the author's name, or into the words of the
                 message, never arrived. "John Smith" came out "JohnSmith". */
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
      {/* What the left column used to be. Reordering, duplicating and deleting
          belong to a message, so they live on the message rather than in a
          list beside it that has to be kept in sync with what is selected. */}
      {edit ? (
        <div className="dc-rowtools e-no-export" aria-label="This message">
          <span
            className="dc-rowtools-grip"
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
            className="dc-rowtools-btn"
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
            className="dc-rowtools-btn"
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
            className="dc-rowtools-btn"
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
            className="dc-rowtools-btn dc-rowtools-danger"
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
      {message.interaction ? (
        <InteractionLine
          interaction={message.interaction}
          users={users}
          edit={edit ? (interaction) => edit.patch(message.id, { interaction }, "interaction") : undefined}
        />
      ) : null}

      <div className="dc-gutter">
        {grouped ? (
          <time className="dc-hover-time">{(message.timestamp || "").split(" at ").pop()}</time>
        ) : (
          <span className="dc-avatar-slot">
            {edit ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                className="dc-avatar dc-avatar-live"
                src={user?.avatar}
                alt=""
                draggable={false}
                role="button"
                tabIndex={0}
                title={`Change ${user?.name ?? "this member"}'s picture`}
                onClick={(event) => {
                  event.stopPropagation();
                  edit.avatar(user?.id);
                }}
                onKeyDown={(event) => {
                  if (event.target !== event.currentTarget) return;
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    event.stopPropagation();
                    edit.avatar(user?.id);
                  }
                }}
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="dc-avatar" src={user?.avatar} alt="" draggable={false} />
            )}
            {user?.decoration ? <img className="dc-decoration" src={user.decoration} alt="" /> : null}
          </span>
        )}
      </div>

      <div className="dc-body">
        {grouped ? null : (
          <div className="dc-meta">
            <Author user={user} edit={edit} />
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
                    if (event.target !== event.currentTarget) return;
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
                open={edit.editing === message.id}
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

        {message.forwarded ? (
          <ForwardCard
            forwarded={message.forwarded}
            edit={edit ? (forwarded) => edit.patch(message.id, { forwarded }, "forwarded") : undefined}
          />
        ) : null}

        {message.embeds?.map((embed) => (
          <Embed
            key={embed.id}
            embed={embed}
            set={
              edit
                ? (over) =>
                    edit.patch(
                      message.id,
                      { embeds: message.embeds.map((e) => (e.id === embed.id ? { ...e, ...over } : e)) },
                      `embed:${embed.id}`,
                    )
                : undefined
            }
          />
        ))}

        {message.linkPreview ? (
          <LinkPreview
            preview={message.linkPreview}
            edit={edit ? (over) => edit.patch(message.id, { linkPreview: { ...message.linkPreview, ...over } }, "preview") : undefined}
          />
        ) : null}
        {message.invite ? (
          <Invite
            invite={message.invite}
            edit={edit ? (over) => edit.patch(message.id, { invite: { ...message.invite, ...over } }, "invite") : undefined}
          />
        ) : null}

        {message.attachments?.length ? (
          <Attachments
            items={message.attachments}
            edit={edit ? (attachments) => edit.patch(message.id, { attachments }) : undefined}
          />
        ) : null}
        {message.voice ? (
          <VoiceNote
            voice={message.voice}
            edit={edit ? (voice) => edit.patch(message.id, { voice }, "voice") : undefined}
          />
        ) : null}
        {message.sticker ? (
          <Sticker
            sticker={message.sticker}
            edit={edit ? (sticker) => edit.patch(message.id, { sticker }) : undefined}
          />
        ) : null}

        {message.gift ? (
          <Gift
            gift={message.gift}
            edit={edit ? (gift) => edit.patch(message.id, { gift }) : undefined}
          />
        ) : null}

        {message.components?.length ? <Blocks blocks={message.components} /> : null}

        {message.poll ? (
          <Poll
            poll={message.poll}
            edit={edit ? (over) => edit.patch(message.id, { poll: { ...message.poll, ...over } }, "poll") : undefined}
          />
        ) : null}

        {message.profile ? (
          <ProfileCard
            profile={message.profile}
            user={user}
            roles={roles}
            set={
              edit
                ? (over) => edit.patch(message.id, { profile: { ...message.profile, ...over } }, "profile")
                : undefined
            }
            edit={edit}
          />
        ) : null}
        {message.reactions?.length ? (
          <Reactions
            reactions={message.reactions}
            edit={edit ? (reactions) => edit.patch(message.id, { reactions }, "reactions") : undefined}
          />
        ) : null}

        {message.thread ? (
          <ThreadTag
            thread={message.thread}
            edit={edit ? (thread) => edit.patch(message.id, { thread }, "thread") : undefined}
          />
        ) : null}

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
