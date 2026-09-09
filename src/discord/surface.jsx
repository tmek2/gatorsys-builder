"use client";

/* The chat surface, and as much of the client around it as the canvas asks for.
 *
 * Three settings, and they are a ladder rather than a set of options. "None"
 * is the messages alone on the chat ground, which is what most mockups want
 * and what exports cleanly into a document. "Chat" adds the channel header and
 * the message box, which is what makes a picture read as a conversation rather
 * than as a list. "Full" adds the server rail, the channel sidebar and the
 * member list — the whole window, for a screenshot that has to look like
 * somebody took it.
 *
 * The mobile platform is not the desktop one narrowed. Discord's phone client
 * has a different grid: no member list, no rail, a back arrow instead of a
 * hash, a rounded composer that floats, and messages inset from a 40px avatar
 * with the author line above rather than beside the first line. That is a
 * second layout, and it is drawn as one.
 */

import { useCallback, useMemo, useRef, useState } from "react";
import { useDragOrder } from "./use-drag-order";
import { ContextMenu } from "./menu";
import { RenderContext } from "./context";
import { Icon } from "./icon";
import { InlineText } from "./inline";
import { Message } from "./message";
import { ChannelStart, DateDivider, FollowChannel, NewDivider, NoAccess, UnreadBanner } from "./system";
import "./tokens.css";
import "./discord.css";
import "./chrome.css";

/* -------------------------------------------------------------- chrome */

function ServerRail({ canvas }) {
  const initial = (canvas.server?.name || "S").slice(0, 1).toUpperCase();
  return (
    <nav className="dc-rail" aria-hidden="true">
      <span className="dc-rail-home">
        <Icon name="discord" size={26} />
      </span>
      <span className="dc-rail-rule" />
      <span className="dc-rail-server dc-rail-active">
        {canvas.server?.icon ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={canvas.server.icon} alt="" />
        ) : (
          initial
        )}
      </span>
      <span className="dc-rail-server dc-rail-ghost" />
      <span className="dc-rail-server dc-rail-ghost" />
      <span className="dc-rail-server dc-rail-add">+</span>
    </nav>
  );
}

function ChannelList({ canvas }) {
  const channels = canvas.channels?.length ? canvas.channels : [canvas.channel?.name || "general"];
  return (
    <aside className="dc-sidebar" aria-hidden="true">
      <header className="dc-sidebar-head">
        {canvas.server?.name || "Community"}
        <Icon name="caret-down" size={18} />
      </header>
      <div className="dc-sidebar-body">
        <div className="dc-sidebar-category">{canvas.channel?.category || "TEXT CHANNELS"}</div>
        {channels.map((name) => (
          <div className={`dc-sidebar-channel${name === canvas.channel?.name ? " dc-sidebar-on" : ""}`} key={name}>
            <Icon name="channel-text" size={20} className="dc-hash" />
            {name}
          </div>
        ))}
      </div>
    </aside>
  );
}

function ChannelHeader({ canvas, mobile, edit }) {
  if (mobile) {
    return (
      <header className="dc-m-head">
        <Icon name="caret-left" size={22} className="dc-m-back" />
        <Icon name="channel-text" size={20} className="dc-hash" />
        <span className="dc-m-head-name">
          {edit ? (
            <InlineText
              value={canvas.channel?.name || "general"}
              onChange={edit.channel}
              label="Channel name"
            />
          ) : (
            canvas.channel?.name || "general"
          )}
        </span>
        <span className="dc-m-head-tools">
          {/* A text channel's header has threads, pins and search. The call
              button belongs to a DM and a voice channel, not to this. */}
          <Icon name="threads" size={20} />
          <Icon name="pins" size={20} />
          <Icon name="members" size={20} />
        </span>
      </header>
    );
  }
  return (
    <header className="dc-head">
      <Icon name="channel-text" size={20} className="dc-hash" />
      <span className="dc-head-name">
        {edit ? (
          <InlineText
            value={canvas.channel?.name || "general"}
            onChange={edit.channel}
            label="Channel name"
          />
        ) : (
          canvas.channel?.name || "general"
        )}
      </span>
      {canvas.channel?.topic ? (
        <>
          <span className="dc-head-rule" />
          <span className="dc-head-topic">
            {edit ? (
              <InlineText value={canvas.channel.topic} onChange={edit.topic} label="Channel topic" />
            ) : (
              canvas.channel.topic
            )}
          </span>
        </>
      ) : null}
    </header>
  );
}

function MemberList({ canvas, users }) {
  const online = users.filter((u) => u.status !== "offline");
  const offline = users.filter((u) => u.status === "offline");
  const group = (label, list) =>
    list.length ? (
      <>
        <div className="dc-members-label">
          {label} — {list.length}
        </div>
        {list.map((u) => (
          <div className="dc-member" key={u.id}>
            <span className="dc-member-face">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={u.avatar} alt="" />
              <span className={`dc-presence dc-presence-${u.status || "online"}`} />
            </span>
            <span className="dc-member-name" style={u.color ? { color: u.color } : undefined}>
              {u.name}
            </span>
            {u.bot ? <span className="dc-app-badge dc-app-badge-sm">{u.badge || "APP"}</span> : null}
          </div>
        ))}
      </>
    ) : null;

  return (
    <aside className="dc-members" aria-hidden="true">
      {group("ONLINE", online)}
      {group("OFFLINE", offline)}
    </aside>
  );
}

function Composer({ canvas, mobile }) {
  return (
    <div className={mobile ? "dc-m-composer" : "dc-composer"} aria-hidden="true">
      {/* The client's own controls, in its own order. The plus was a typed "+"
          and the gift was the 🎁 emoji, which is the sort of thing that gives
          a screenshot away at a glance. */}
      <Icon name="attach" size={22} className="dc-composer-plus" />
      <span className="dc-composer-text">Message #{canvas.channel?.name || "general"}</span>
      <span className="dc-composer-tools">
        {/* The phone does not get the desktop's row shrunk down. It has its
            own set — emoji, then the camera, the gallery and the microphone,
            which are the three things a phone can offer that a desktop
            cannot. */}
        {mobile ? (
          <>
            <Icon name="emoji" size={20} />
            <Icon name="camera" size={20} />
            <Icon name="gallery" size={20} />
            <Icon name="microphone" size={20} />
          </>
        ) : (
          <>
            <Icon name="gift" size={20} />
            <Icon name="gif" size={20} />
            <Icon name="sticker" size={20} />
            <Icon name="emoji" size={20} />
          </>
        )}
      </span>
    </div>
  );
}

function Typing({ names }) {
  return (
    <div className="dc-typing" aria-hidden="true">
      <span className="dc-typing-dots">
        <i />
        <i />
        <i />
      </span>
      <span>
        <strong>{names}</strong> is typing…
      </span>
    </div>
  );
}

/* ------------------------------------------------------------- surface */

export function DiscordSurface({ project, selectedId, onSelect, innerRef, edit, scroller }) {
  const canvas = project.canvas ?? {};
  const mobile = canvas.platform === "mobile";

  /* Context rather than props: a mention can appear at any depth of a
     container tree, and threading the user list through every renderer to
     reach it is how a component ends up with eleven props it does not use.
     The message list is deliberately not in here. It changes on every
     keystroke, and a context that changes re-renders every consumer of it —
     which would have meant re-parsing forty markdown trees per typed
     character. The one thing that needed it was resolving a reply, and the
     stream can do that once on the way past. */
  const ctx = useMemo(
    () => ({ users: project.users ?? [], emojis: project.emojis ?? [], edit }),
    [project.users, project.emojis, edit],
  );

  /* One handler for the whole stream, reading the id off the row it fired on.
     A closure per message would be a new prop on every message on every
     keystroke, which is the thing that stops `Message` being memoisable — and
     a mockup with forty messages re-rendering forty markdown trees per typed
     character is the difference between a smooth field and a laggy one. */
  const pick = useCallback(
    (event) => {
      if (!onSelect) return;
      const row = event.currentTarget.dataset.id;
      if (row) onSelect(row);
    },
    [onSelect],
  );

  /* Dragging a message into place on the preview, which is where somebody
     looking at the order wants to change it. The arrows on each row do the
     same job for a keyboard and for a short move. */
  const stream = useRef(null);

  /* Right-clicking a mockup should offer what you can do to a mockup, not
     Reload and View Page Source. */
  const [menu, setMenu] = useState(null);
  const openMenu = useCallback(
    (event, id) => {
      if (!edit) return;
      event.preventDefault();
      event.stopPropagation();
      if (id) onSelect?.(id);
      setMenu({ at: { x: event.clientX, y: event.clientY }, id });
    },
    [edit, onSelect],
  );
  const order = useDragOrder({ onMove: (from, to) => edit?.reorder(from, to), scroller });

  const byId = useMemo(
    () => new Map((project.messages ?? []).map((m) => [m.id, m])),
    [project.messages],
  );

  const rows = (
    <div className="dc-stream" ref={stream} data-dragging={order.dragging ? "true" : "false"}>
      {canvas.showChannelStart ? (
        <ChannelStart name={canvas.channel?.name || "general"} kind={canvas.channelKind} />
      ) : null}
      {canvas.showDateDivider ? <DateDivider label={canvas.dateLabel || "Today"} /> : null}
      {(project.messages ?? []).map((message, i) => (
        <div key={message.id}>
          {canvas.showNewDivider && i === (project.messages.length - 1) ? <NewDivider /> : null}
          <Message
            message={message}
            replyTo={message.reply ? byId.get(message.reply) : undefined}
            selected={selectedId === message.id}
            onSelect={onSelect ? pick : undefined}
            dragHandlers={edit ? order.handlers(i, stream) : undefined}
            onMenu={edit ? (event) => openMenu(event, message.id) : undefined}
            held={order.drag?.from === i}
            landing={order.drag && order.drag.to === i && order.drag.from !== i}
          />
        </div>
      ))}
      {canvas.showTyping ? <Typing names={canvas.typingNames || "Someone"} /> : null}
    </div>
  );

  const surfaceStyle = {
    "--dc-font": `${canvas.fontSize ?? 16}px`,
    background:
      canvas.background === "custom" && canvas.customBackground
        ? `center/cover url(${JSON.stringify(canvas.customBackground)})`
        : canvas.background === "transparent"
          ? "transparent"
          : undefined,
  };

  return (
    <RenderContext.Provider value={ctx}>
      <div
        ref={innerRef}
        className={`dc dc-${canvas.theme || "ash"} dc-chrome-${canvas.chrome || "none"} ${
          mobile ? "dc-mobile" : "dc-desktop"
        } dc-density-${canvas.density || "cozy"}${
          /* The image and the transparent option both go on this element, and
             the chat column inside it paints its own opaque ground — which is
             why choosing an image appeared to do nothing at all. The flag lets
             the stylesheet stand the column down. */
          canvas.background === "custom" && canvas.customBackground
            ? " dc-bg-image"
            : canvas.background === "transparent"
              ? " dc-bg-none"
              : ""
        }`}
        style={surfaceStyle}
        onContextMenu={edit ? (event) => openMenu(event, null) : undefined}
      >
        {canvas.chrome === "full" && !mobile ? <ServerRail canvas={canvas} /> : null}
        {canvas.chrome === "full" && !mobile ? <ChannelList canvas={canvas} /> : null}

        <div className="dc-main">
          {canvas.chrome !== "none" ? <ChannelHeader canvas={canvas} mobile={mobile} edit={edit} /> : null}
          {canvas.showUnreadBanner ? (
            <UnreadBanner count={canvas.unreadCount} since={canvas.unreadSince} />
          ) : null}
          {/* With no chrome the canvas sets its own inset — but only the
              vertical half of it goes on the scroller. The horizontal half is
              handed down as `--dc-edge` and added to each message's own
              padding instead, so a hovered or selected row washes the full
              width of the column the way the client does, rather than
              stopping short of the edge. */}
          <div
            className="dc-scroll"
            style={
              canvas.chrome === "none"
                ? { paddingBlock: canvas.padding, "--dc-edge": `${canvas.padding ?? 0}px` }
                : undefined
            }
          >
            {rows}
          </div>
          {canvas.showFollow ? <FollowChannel /> : null}
          {canvas.chrome !== "none" ? (
            canvas.readOnly ? (
              <NoAccess reason={canvas.readOnlyReason} />
            ) : (
              <Composer canvas={canvas} mobile={mobile} />
            )
          ) : null}
        </div>

        {canvas.chrome === "full" && !mobile ? <MemberList canvas={canvas} users={ctx.users} /> : null}
      </div>
      {menu ? (
        <ContextMenu
          at={menu.at}
          onClose={() => setMenu(null)}
          items={edit.menu(menu.id)}
        />
      ) : null}
    </RenderContext.Provider>
  );
}
