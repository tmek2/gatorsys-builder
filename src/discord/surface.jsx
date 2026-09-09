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

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDragOrder } from "./use-drag-order";
import { ContextMenu } from "./menu";
import { RenderContext } from "./context";
import { Icon } from "./icon";
import { InlineText } from "./inline";
import { roleColor } from "@/lib/model";
import { Message } from "./message";
import { ChannelStart, DateDivider, FollowChannel, NewDivider, NoAccess, UnreadBanner } from "./system";
import "./tokens.css";
import "./discord.css";
import "./chrome.css";

/* -------------------------------------------------------------- chrome */

function ServerRail({ canvas, edit }) {
  const initial = (canvas.server?.name || "S").slice(0, 1).toUpperCase();
  return (
    <nav className="dc-rail" aria-label="Servers">
      <span className="dc-rail-home" aria-hidden="true">
        <Icon name="discord" size={26} />
      </span>
      <span className="dc-rail-rule" aria-hidden="true" />
      {/* The server's own icon. Pressing it is how you change it, the same
          gesture as pressing a member's face. */}
      <span
        className={`dc-rail-server dc-rail-active${edit ? " dc-rail-live" : ""}`}
        role={edit ? "button" : undefined}
        tabIndex={edit ? 0 : undefined}
        title={edit ? "Change the server icon" : undefined}
        onClick={edit ? () => edit.server() : undefined}
        onKeyDown={
          edit
            ? (event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  edit.server();
                }
              }
            : undefined
        }
      >
        {canvas.server?.icon ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={canvas.server.icon} alt="" draggable={false} />
        ) : (
          initial
        )}
      </span>
      <span className="dc-rail-server dc-rail-ghost" aria-hidden="true" />
      <span className="dc-rail-server dc-rail-ghost" aria-hidden="true" />
      <span className="dc-rail-server dc-rail-add" aria-hidden="true">+</span>
    </nav>
  );
}

/* What a channel can be, and the glyph the client draws for each. Pressing
   the glyph cycles it, which is one gesture for a choice of five — a select
   on every row would be five dropdowns in a sidebar. */
const CHANNEL_KINDS = [
  { id: "text", icon: "channel-text", label: "Text" },
  { id: "voice", icon: "channel-voice", label: "Voice" },
  { id: "announcement", icon: "channel-announcement", label: "Announcement" },
  { id: "forum", icon: "channel-forum", label: "Forum" },
  { id: "rules", icon: "channel-rules", label: "Rules" },
];

/* Channels are stored as strings, which is all a mockup needed until it
   needed categories and types. Both shapes are accepted on the way in and only
   the object shape is written back, so an older project keeps working. */
function asChannel(entry) {
  if (typeof entry === "string") return { name: entry, kind: "text" };
  return { name: entry?.name ?? "channel", kind: entry?.kind ?? "text", category: entry?.category };
}

function ChannelList({ canvas, edit, onMenu }) {
  const raw = canvas.channels?.length ? canvas.channels : [canvas.channel?.name || "general"];
  const channels = raw.map(asChannel);
  const current = canvas.channel?.name || "general";
  const box = useRef(null);

  const write = (next, over) =>
    edit.canvas({ channels: next.map((c) => ({ name: c.name, kind: c.kind, ...(c.category ? { category: c.category } : {}) })), ...over });

  const order = useDragOrder({
    onMove: (from, to) => {
      const next = [...channels];
      const [held] = next.splice(from, 1);
      next.splice(to, 0, held);
      write(next);
    },
    scrollers: [],
  });

  /* Renaming the channel the mockup is *in* has to rename it everywhere: the
     header, this row and the composer's placeholder are one name written
     three times. Renaming any other row is only that row. */
  const rename = (i, name) => {
    const next = channels.map((c, j) => (j === i ? { ...c, name } : c));
    write(next, channels[i].name === current ? { channel: { ...canvas.channel, name } } : undefined);
  };

  /* One heading per run of channels that share a category, so a category is
     created by typing one on a channel rather than by managing a second list.
     The first run takes the channel settings' own category name. */
  const rows = [];
  let heading = null;
  channels.forEach((channel, i) => {
    const label = channel.category ?? (i === 0 ? canvas.channel?.category || "TEXT CHANNELS" : heading);
    if (label !== heading) {
      heading = label;
      rows.push({ kind: "head", label, at: i });
    }
    rows.push({ kind: "channel", channel, at: i });
  });

  return (
    <aside
      className="dc-sidebar"
      aria-label="Channels"
      onContextMenu={onMenu ? (event) => onMenu(event, null, "channels") : undefined}
    >
      <header className="dc-sidebar-head">
        {edit ? (
          <InlineText
            value={canvas.server?.name || "Community"}
            onChange={(name) => edit.canvas({ server: { ...canvas.server, name } }, "server:name")}
            label="Server name"
            placeholder="Community"
          />
        ) : (
          canvas.server?.name || "Community"
        )}
        <Icon name="caret-down" size={18} aria-hidden="true" />
      </header>
      <div className="dc-sidebar-body" ref={box}>
        {rows.map((row) =>
          row.kind === "head" ? (
            <div className="dc-sidebar-category" key={`h${row.at}`}>
              {edit ? (
                <InlineText
                  value={row.label}
                  onChange={(category) => {
                    /* The heading names every channel under it, down to the
                       next heading, so renaming one moves the whole run. */
                    let touching = false;
                    const next = channels.map((c, j) => {
                      if (j === row.at) touching = true;
                      else if (touching && c.category !== undefined && j !== row.at) touching = false;
                      return touching && j >= row.at ? { ...c, category } : c;
                    });
                    write(next, row.at === 0 ? { channel: { ...canvas.channel, category } } : undefined);
                  }}
                  label="Category"
                  placeholder="CATEGORY"
                />
              ) : (
                row.label
              )}
            </div>
          ) : (
            <div
              className={`dc-sidebar-channel${row.channel.name === current ? " dc-sidebar-on" : ""}`}
              key={`c${row.at}`}
              data-row
              data-held={order.drag?.from === row.at ? "true" : undefined}
              onContextMenu={onMenu ? (event) => onMenu(event, null, "channels") : undefined}
            >
              {edit ? (
                <button
                  type="button"
                  className="dc-hash dc-hash-live e-no-export"
                  title={`${CHANNEL_KINDS.find((k) => k.id === (row.channel.kind || "text"))?.label} channel — press to change`}
                  aria-label="Change the channel type"
                  onClick={() => {
                    const at = CHANNEL_KINDS.findIndex((k) => k.id === (row.channel.kind || "text"));
                    const kind = CHANNEL_KINDS[(at + 1) % CHANNEL_KINDS.length].id;
                    write(channels.map((c, j) => (j === row.at ? { ...c, kind } : c)));
                  }}
                >
                  <Icon
                    name={CHANNEL_KINDS.find((k) => k.id === (row.channel.kind || "text"))?.icon ?? "channel-text"}
                    size={20}
                  />
                </button>
              ) : (
                <Icon
                  name={CHANNEL_KINDS.find((k) => k.id === (row.channel.kind || "text"))?.icon ?? "channel-text"}
                  size={20}
                  className="dc-hash"
                  aria-hidden="true"
                />
              )}
              {edit ? (
                <InlineText value={row.channel.name} onChange={(v) => rename(row.at, v)} label="Channel name" />
              ) : (
                row.channel.name
              )}
              {edit ? (
                <span className="dc-sidebar-tools e-no-export">
                  <span
                    className="dc-sidebar-grip"
                    role="button"
                    tabIndex={-1}
                    aria-label="Drag to reorder"
                    title="Drag to reorder"
                    {...order.handlers(row.at, box)}
                  >
                    <Icon name="more-vertical" size={13} />
                  </span>
                  {row.channel.name === current ? null : (
                    <button
                      type="button"
                      title={`Draw this mockup in #${row.channel.name}`}
                      aria-label={`Draw this mockup in ${row.channel.name}`}
                      onClick={() => edit.canvas({ channel: { ...canvas.channel, name: row.channel.name } }, "channel:name")}
                    >
                      <Icon name="check" size={13} />
                    </button>
                  )}
                  <button
                    type="button"
                    title="Remove this channel"
                    aria-label={`Remove ${row.channel.name}`}
                    disabled={channels.length <= 1}
                    onClick={() => {
                      const next = channels.filter((_, j) => j !== row.at);
                      write(
                        next,
                        row.channel.name === current
                          ? { channel: { ...canvas.channel, name: next[0].name } }
                          : undefined,
                      );
                    }}
                  >
                    <Icon name="close" size={13} />
                  </button>
                </span>
              ) : null}
            </div>
          ),
        )}
        {edit ? (
          <div className="dc-sidebar-adds e-no-export">
            <button
              type="button"
              className="dc-sidebar-add"
              onClick={() => write([...channels, { name: `channel-${channels.length + 1}`, kind: "text" }])}
            >
              <Icon name="plus" size={16} /> Add a channel
            </button>
            <button
              type="button"
              className="dc-sidebar-add"
              onClick={() =>
                write([
                  ...channels,
                  { name: `channel-${channels.length + 1}`, kind: "text", category: "NEW CATEGORY" },
                ])
              }
            >
              <Icon name="list-add" size={16} /> Add a category
            </button>
          </div>
        ) : null}
      </div>
    </aside>
  );
}

/* The phone's own status bar.
 *
 * Every screenshot taken on a phone has one, and a mockup without it is the
 * first thing that gives it away — the header starts at the very top of the
 * glass, which never happens on a real device. Drawn rather than faked with an
 * image so the clock is editable and the whole thing takes the theme.
 */
function PhoneStatus({ canvas, edit }) {
  const time = canvas.phoneTime || "9:41";
  return (
    <div className="dc-m-status">
      <span className="dc-m-status-time">
        {edit ? (
          <InlineText
            value={time}
            onChange={(v) => edit.canvas({ phoneTime: v })}
            label="The time on the phone"
          />
        ) : (
          time
        )}
      </span>
      <span className="dc-m-status-right" aria-hidden="true">
        {/* Signal, then wi-fi, then the battery: the order iOS uses. */}
        <svg width="18" height="12" viewBox="0 0 18 12">
          {[0, 1, 2, 3].map((i) => (
            <rect
              key={i}
              x={i * 4.5}
              y={9 - i * 3}
              width="3"
              height={3 + i * 3}
              rx="1"
              fill="currentColor"
            />
          ))}
        </svg>
        <svg width="16" height="12" viewBox="0 0 16 12">
          <path
            d="M8 10.6 5.8 8.3a3.2 3.2 0 0 1 4.4 0zM3.6 6.1a6.4 6.4 0 0 1 8.8 0l1.4-1.5a8.5 8.5 0 0 0-11.6 0z"
            fill="currentColor"
          />
        </svg>
        <span className="dc-m-battery">
          <span className="dc-m-battery-fill" style={{ width: `${canvas.phoneBattery ?? 78}%` }} />
        </span>
      </span>
    </div>
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

function MemberList({ canvas, users, roles = [], edit, scrollers, onMenu }) {
  /* Discord splits the list by hoisted role first and only then by presence.
     A role nobody has, or one nobody has asked to display separately, is not
     a heading — it would be an empty section in a picture of a busy server. */
  const hoisted = roles.filter((r) => r.hoist && users.some((u) => u.roles?.includes(r.id)));
  const taken = new Set();
  const sections = [];
  for (const role of hoisted) {
    const list = users.filter((u) => !taken.has(u.id) && u.roles?.includes(role.id));
    list.forEach((u) => taken.add(u.id));
    if (list.length) sections.push([role.name.toUpperCase(), list, role]);
  }
  const rest = users.filter((u) => !taken.has(u.id));
  const online = rest.filter((u) => u.status !== "offline");
  const offline = rest.filter((u) => u.status === "offline");
  if (online.length) sections.push(["ONLINE", online, null]);
  if (offline.length) sections.push(["OFFLINE", offline, null]);

  /* One flat index across every section, so dragging carries a member from
     under one heading to another and the drop lands where the eye says. */
  const flat = sections.flatMap(([, list]) => list);
  const order = useDragOrder({
    onMove: (from, to) => edit?.reorderMember(flat[from]?.id, flat[to]?.id),
    scrollers,
  });

  const box = useRef(null);
  let seen = -1;

  return (
    <aside
      className="dc-members"
      aria-label="Members"
      ref={box}
      onContextMenu={onMenu ? (event) => onMenu(event, null, "members") : undefined}
    >
      {sections.map(([label, list, role]) => (
        <Fragment key={label}>
          <div className="dc-members-label">
            {/* A heading that is a role is the role: typing here renames it
                everywhere it is drawn. ONLINE and OFFLINE are not roles and
                are not typed into. */}
            {role && edit ? (
              <InlineText
                value={role.name}
                onChange={(name) => edit.role(role.id, { name })}
                label="Role name"
                className="dc-members-role"
              />
            ) : (
              label
            )}{" "}
            — {list.length}
          </div>
          {list.map((u) => {
            seen += 1;
            const i = seen;
            const tint = roleColor(u, roles);
            const held = order.drag?.from === i;
            const landing = order.drag && order.drag.to === i && order.drag.from !== i;
            return (
              <div
                className="dc-member"
                key={u.id}
                data-row
                data-offline={u.status === "offline" ? "true" : undefined}
                data-held={held ? "true" : undefined}
                data-landing={landing ? "true" : undefined}
                onContextMenu={onMenu ? (event) => onMenu(event, u.id, "member") : undefined}
                {...(edit ? order.handlers(i, box) : {})}
              >
                <span className="dc-member-face">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={u.avatar}
                    alt=""
                    draggable={false}
                    className={edit ? "dc-avatar-live" : undefined}
                    role={edit ? "button" : undefined}
                    tabIndex={edit ? 0 : undefined}
                    title={edit ? `Change ${u.name}'s picture` : undefined}
                    onClick={
                      edit
                        ? (event) => {
                            event.stopPropagation();
                            edit.avatar(u.id);
                          }
                        : undefined
                    }
                  />
                  <span className={`dc-presence dc-presence-${u.status || "online"}`} />
                </span>
                <span className="dc-member-name" style={tint ? { color: tint } : undefined}>
                  {edit ? (
                    <InlineText value={u.name} onChange={(name) => edit.rename(u.id, name)} label="Member name" />
                  ) : (
                    u.name
                  )}
                </span>
                {u.bot ? <span className="dc-app-badge dc-app-badge-sm">{u.badge || "APP"}</span> : null}
                {edit ? (
                  <button
                    type="button"
                    className="dc-member-more e-no-export"
                    title={`${u.name}'s roles and profile`}
                    aria-label={`${u.name}'s roles and profile`}
                    onClick={(event) => {
                      event.stopPropagation();
                      edit.member(u.id);
                    }}
                  >
                    <Icon name="more-vertical" size={14} />
                  </button>
                ) : null}
              </div>
            );
          })}
        </Fragment>
      ))}
      {edit ? (
        <button type="button" className="dc-members-add e-no-export" onClick={() => edit.addMember()}>
          <Icon name="add-friends" size={16} /> Add a member
        </button>
      ) : null}
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

function Typing({ names, edit }) {
  return (
    <div className="dc-typing">
      <span className="dc-typing-dots" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      <span>
        <strong>
          {edit ? (
            <InlineText
              value={names}
              onChange={(v) => edit.canvas({ typingNames: v })}
              label="Who is typing"
              placeholder="Someone"
            />
          ) : (
            names
          )}
        </strong>{" "}
        is typing…
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
    () => ({ users: project.users ?? [], roles: project.roles ?? [], emojis: project.emojis ?? [], edit }),
    [project.users, project.roles, project.emojis, edit],
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
    /* `kind` says what was under the pointer, because the answer to "what can
       I do here" is different in the member list than it is on a message —
       and right-clicking a member and being offered "Add a message" is the
       browser's own menu problem all over again, just with our styling on it. */
    (event, id, kind = "message") => {
      if (!edit) return;
      event.preventDefault();
      event.stopPropagation();
      if (id && kind === "message") onSelect?.(id);
      setMenu({ at: { x: event.clientX, y: event.clientY }, id, kind });
    },
    [edit, onSelect],
  );
  /* And right-clicking the stage *around* the mockup should offer the same
     thing. Without this the browser's own menu comes back the moment the
     pointer leaves the picture, which is the whole complaint. Native rather
     than a React prop because the stage belongs to the editor, not to this
     component — and it fires before React's, so a right-click on a message is
     left alone and handled there. */
  useEffect(() => {
    const el = scroller?.current;
    if (!el || !edit) return undefined;
    const onMenu = (event) => {
      if (event.target instanceof Element && event.target.closest(".dc")) return;
      openMenu(event, null);
    };
    el.addEventListener("contextmenu", onMenu);
    return () => el.removeEventListener("contextmenu", onMenu);
  }, [scroller, edit, openMenu]);

  /* Innermost first: a long conversation scrolls inside its own frame, and
     only when that has nowhere left to go does the stage behind it move. */
  const conversation = useRef(null);
  const views = useMemo(() => [conversation, scroller].filter(Boolean), [scroller]);
  const order = useDragOrder({ onMove: (from, to) => edit?.reorder(from, to), scrollers: views });

  /* A chat is read from the bottom. Once the window has a height the
     conversation scrolls inside it, and the client always sits on the newest
     message — so a mockup that opened at the top showed the oldest ones and
     framed the wrong part of itself for the export.
     Only when a message arrives, though. Somebody who scrolled up to frame a
     particular exchange has said where they want to be, and yanking them back
     to the bottom would take that away. */
  const grown = useRef(0);
  useEffect(() => {
    const view = conversation.current;
    const count = project.messages?.length ?? 0;
    if (!view) return;
    if (count >= grown.current) view.scrollTop = view.scrollHeight;
    grown.current = count;
  }, [project.messages, canvas.height, canvas.chrome, canvas.platform]);


  const byId = useMemo(
    () => new Map((project.messages ?? []).map((m) => [m.id, m])),
    [project.messages],
  );

  const rows = (
    <div className="dc-stream" ref={stream} data-dragging={order.dragging ? "true" : "false"}>
      {canvas.showChannelStart ? (
        <ChannelStart name={canvas.channel?.name || "general"} kind={canvas.channelKind} edit={edit} />
      ) : null}
      {canvas.showDateDivider ? <DateDivider label={canvas.dateLabel || "Today"} /> : null}
      {(project.messages ?? []).map((message, i) => (
        <div key={message.id} {...order.rowProps(i)}>
          {/* Where it will land, drawn as a line between rows rather than as a
              wash on one of them. "This row is highlighted" is ambiguous —
              above it or below it? — and a drag that cannot say where it is
              going is a drag nobody trusts. */}
          {order.lineAt === i ? <span className="dc-drop-line" aria-hidden="true" /> : null}
          {canvas.showNewDivider && i === (project.messages.length - 1) ? <NewDivider /> : null}
          <Message
            message={message}
            replyTo={message.reply ? byId.get(message.reply) : undefined}
            selected={selectedId === message.id}
            onSelect={onSelect ? pick : undefined}
            dragHandlers={edit ? order.handlers(i, stream) : undefined}
            onMenu={edit ? (event) => openMenu(event, message.id) : undefined}
            held={order.drag?.from === i}
            landing={false}
          />
        </div>
      ))}
      {order.lineAt === (project.messages ?? []).length ? (
        <span className="dc-drop-line" aria-hidden="true" />
      ) : null}
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
        {canvas.chrome === "full" && !mobile ? <ServerRail canvas={canvas} edit={edit} /> : null}
        {canvas.chrome === "full" && !mobile ? <ChannelList canvas={canvas} edit={edit} onMenu={edit ? openMenu : undefined} /> : null}

        <div className="dc-main">
          {mobile && canvas.chrome !== "none" && canvas.showStatusBar !== false ? (
            <PhoneStatus canvas={canvas} edit={edit} />
          ) : null}
          {canvas.chrome !== "none" ? <ChannelHeader canvas={canvas} mobile={mobile} edit={edit} /> : null}
          {canvas.showUnreadBanner ? (
            <UnreadBanner count={canvas.unreadCount} since={canvas.unreadSince} edit={edit} />
          ) : null}
          {/* With no chrome the canvas sets its own inset — but only the
              vertical half of it goes on the scroller. The horizontal half is
              handed down as `--dc-edge` and added to each message's own
              padding instead, so a hovered or selected row washes the full
              width of the column the way the client does, rather than
              stopping short of the edge. */}
          <div
            ref={conversation}
            className="dc-scroll"
            /* The room above the conversation is empty space in the mockup,
               and pressing empty space puts the selection down — same rule as
               the stage around it. Only when the press lands on the column
               itself or on the stream's own padding, never on a row. */
            onClick={
              onSelect
                ? (event) => {
                    if (
                      event.target === event.currentTarget ||
                      event.target.classList?.contains("dc-stream")
                    ) {
                      onSelect(null);
                    }
                  }
                : undefined
            }
            style={
              canvas.chrome === "none"
                ? { paddingBlock: canvas.padding, "--dc-edge": `${canvas.padding ?? 0}px` }
                : undefined
            }
          >
            {rows}
          </div>
          {/* Outside the scroller. It used to be the last row inside it, which
              is wrong twice: it scrolled away with the conversation, and once
              the window had a height it was the thing the frame clipped — the
              typing line half-eaten by the composer. The client pins it to the
              bottom of the column. */}
          {canvas.showTyping ? (
            <Typing names={canvas.typingNames || "Someone"} edit={edit} />
          ) : null}
          {canvas.showFollow ? <FollowChannel text={canvas.followText} edit={edit} /> : null}
          {canvas.chrome !== "none" ? (
            canvas.readOnly ? (
              <NoAccess reason={canvas.readOnlyReason} edit={edit} />
            ) : (
              <Composer canvas={canvas} mobile={mobile} />
            )
          ) : null}
        </div>

        {canvas.chrome === "full" && !mobile ? <MemberList canvas={canvas} users={ctx.users} roles={project.roles ?? []} edit={edit} scrollers={views} onMenu={edit ? openMenu : undefined} /> : null}
      </div>
      {menu ? (
        <ContextMenu
          at={menu.at}
          onClose={() => setMenu(null)}
          items={edit.menu(menu.id, menu.kind)}
        />
      ) : null}
    </RenderContext.Provider>
  );
}
