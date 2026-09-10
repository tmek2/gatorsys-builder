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
import { ImageTools } from "./image-tools";
import { asChannel, roleColor } from "@/lib/model";
import { groupsWith } from "@/lib/clock";
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

/* What kind the channel the mockup is *in* actually is.
   One answer, read by the header, by the top of the channel and by the row in
   the sidebar — there used to be a second setting for it, which is how the
   sidebar could say "announcement" while the top of the channel drew a hash
   and the header drew something else again. `channelKind` is still honoured
   as a fallback so an older project keeps the kind it was saved with. */
function channelKind(canvas) {
  const here = (canvas.channels ?? [])
    .map(asChannel)
    .find((c) => c.name === (canvas.channel?.name || "general"));
  return here?.kind ?? canvas.channelKind ?? "text";
}

/* Changing that kind, from wherever its glyph is drawn.
   The channel list is the record — the header and the top of the channel both
   read out of it — so a press on the header writes back into the list rather
   than keeping a second answer beside it. A project old enough not to have the
   channel in its list gets it added, and `channelKind` is kept in step for one
   saved before the list carried types at all. */
function cycleKind(canvas, edit) {
  const name = canvas.channel?.name || "general";
  const at = CHANNEL_KINDS.findIndex((k) => k.id === channelKind(canvas));
  const kind = CHANNEL_KINDS[(at + 1) % CHANNEL_KINDS.length].id;
  const list = (canvas.channels?.length ? canvas.channels : [name]).map(asChannel);
  const next = list.some((c) => c.name === name)
    ? list.map((c) => (c.name === name ? { ...c, kind } : c))
    : [...list, { name, kind }];
  edit.canvas({
    channels: next.map((c) => ({ name: c.name, kind: c.kind, ...(c.category ? { category: c.category } : {}) })),
    channelKind: kind,
  });
}


function ChannelList({ canvas, edit, scrollers, onMenu }) {
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
    /* The same views a message drag creeps along. It had none, so holding a
       channel against the top of a tall mockup sat there doing nothing while
       the same hold on a message scrolled — one hook, two behaviours, which is
       exactly what made this feel like a different, worse gesture. The list
       itself never scrolls: it is drawn `overflow: hidden` because a mockup
       with a scrollbar in it is a mockup of a scrollbar. */
    scrollers,
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
            <Fragment key={`c${row.at}`}>
            {/* The same mark the messages use. A drag with no indicator is a
                drag that asks you to guess where it will land. */}
            {order.lineAt === row.at ? <span className="dc-drop-line" aria-hidden="true" /> : null}
            <div
              className={`dc-sidebar-channel${row.channel.name === current ? " dc-sidebar-on" : ""}`}
              data-row
              onContextMenu={onMenu ? (event) => onMenu(event, null, "channels") : undefined}
              /* The same treatment a message gets: the row in hand is glued to
                 the pointer and lifted over its neighbours. It had only the
                 landing line, which is half a drag. */
              {...order.rowProps(row.at)}
            >
              {edit ? (
                <button
                  type="button"
                  /* Not `e-no-export`. The glyph is part of the picture — a
                     channel row without its hash is not a channel row — and
                     only the *chrome* of a control should be dropped from the
                     raster. This one has none: no border, no background, no
                     focus ring at rest, so it rasterises exactly as the plain
                     icon did. */
                  className="dc-hash dc-hash-live"
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
            </Fragment>
          ),
        )}
        {order.lineAt === channels.length ? <span className="dc-drop-line" aria-hidden="true" /> : null}
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
/* The phone's own furniture: the status bar at the top and the home bar at
 * the bottom.
 *
 * Both are the device, not the app, and both are what makes a picture read as
 * a phone rather than as a narrow window. The status bar was here already and
 * was missing the one thing a modern iPhone is recognised by — the island —
 * and the bottom had nothing at all, which is why the message box and the
 * read-only bar were sitting in the screen's rounded corners with nowhere to
 * go. iOS keeps 34pt clear down there and every app lays out above it.
 */
/* iOS's own status colours. Green while it charges, yellow in Low Power Mode,
   red when it is nearly out — the three a person recognises without being
   told which is which. */
const BATTERY_STATES = [
  { id: "normal", label: "Normal", color: "" },
  { id: "charging", label: "Charging", color: "#30d158" },
  { id: "saver", label: "Low Power Mode", color: "#ffd60a" },
  { id: "low", label: "Low battery", color: "#ff453a" },
];

/* Every one of the three is the control for itself.
 *
 * The bars, the wi-fi and the battery were three fixed pictures: a mockup of a
 * phone with no signal, or one about to die, could not be drawn at all. They
 * are pressed now — each press steps to the next state and wraps — and the
 * battery takes a drag along its length for the level, so "about a third" is
 * one gesture rather than a number typed into a form. A press that travels is
 * the drag; one that does not is the step, decided at release, which is the
 * only way one small target can carry both. */
function PhoneSignal({ canvas, edit }) {
  const bars = canvas.phoneSignal ?? 4;
  const label = bars ? `${bars} of 4 bars` : "No service";
  const glyph = (
    <svg width="17" height="12" viewBox="0 0 17.5 12" aria-hidden="true">
      {[0, 1, 2, 3].map((i) => (
        <rect
          key={i}
          x={i * 4.4}
          y={9.5 - i * 2.6}
          width="3.2"
          height={2.5 + i * 2.6}
          rx="1.2"
          fill="currentColor"
          /* A bar you do not have is drawn, not faded away: the phone leaves
             the whole ladder in place and greys the rungs above the signal. */
          opacity={i < bars ? 1 : 0.42}
        />
      ))}
    </svg>
  );
  if (!edit) return glyph;
  return (
    <button
      type="button"
      className="dc-m-radio"
      title={`${label} — press to change`}
      aria-label="Change the signal strength"
      onClick={(event) => {
        event.stopPropagation();
        edit.canvas({ phoneSignal: bars === 0 ? 4 : bars - 1 });
      }}
    >
      {glyph}
    </button>
  );
}

function PhoneWifi({ canvas, edit }) {
  const level = canvas.phoneWifi ?? 3;
  const label = ["Not connected", "Weak", "Medium", "Strong"][level] ?? "Strong";
  /* Three parts, the way iOS draws it: the dot, then two arcs over it. A
     weaker signal dims the outer ones rather than removing them, so the mark
     keeps its shape and only its weight changes. Nothing connected gets the
     line through it.

     Stroked arcs rather than filled crescents. The filled version was three
     hand-written paths whose curves did not meet their own end points, and at
     twelve pixels it came out as a smear that read as nothing at all. Two arcs
     and a dot are the same mark and they are drawable. */
  const glyph = (
    /* Concentric, around the dot. The arcs were drawn as two chords with a
       radius half again too big for them, which flattened the whole mark into
       a pair of dashes — a wi-fi symbol is mostly its curvature. These share a
       centre with the dot and rise about a third of their own width, which is
       what iOS's does. */
    <svg width="16" height="12" viewBox="0 0 17 13" fill="none" aria-hidden="true">
      <path
        d="M2.1 6.4a8 8 0 0 1 12.8 0"
        stroke="currentColor"
        strokeWidth="2.1"
        strokeLinecap="round"
        opacity={level >= 3 ? 1 : 0.42}
      />
      <path
        d="M4.7 8.3a4.8 4.8 0 0 1 7.6 0"
        stroke="currentColor"
        strokeWidth="2.1"
        strokeLinecap="round"
        opacity={level >= 2 ? 1 : 0.42}
      />
      <circle cx="8.5" cy="11.2" r="1.6" fill="currentColor" opacity={level >= 1 ? 1 : 0.42} />
      {level === 0 ? (
        <path d="M2.4 12.3 14.6 1.1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      ) : null}
    </svg>
  );
  if (!edit) return glyph;
  return (
    <button
      type="button"
      className="dc-m-radio"
      title={`Wi-Fi: ${label} — press to change`}
      aria-label="Change the wi-fi strength"
      onClick={(event) => {
        event.stopPropagation();
        edit.canvas({ phoneWifi: level === 0 ? 3 : level - 1 });
      }}
    >
      {glyph}
    </button>
  );
}

function PhoneBattery({ canvas, edit }) {
  const level = Math.max(0, Math.min(100, canvas.phoneBattery ?? 78));
  const state = BATTERY_STATES.find((b) => b.id === (canvas.phoneBatteryState || "normal")) ?? BATTERY_STATES[0];
  const shell = useRef(null);
  const press = useRef(null);

  /* The fill's track, not the whole shell: dragging to the far left should
     empty it, and the shell is 2px of border wider than the thing being set. */
  const levelAt = (clientX) => {
    const r = shell.current?.getBoundingClientRect();
    if (!r) return level;
    const track = r.width - 6;
    return Math.max(0, Math.min(100, Math.round(((clientX - r.left - 3) / track) * 100)));
  };

  const body = (
    <span
      className="dc-m-battery"
      ref={shell}
      data-state={state.id}
      style={state.color ? { "--dc-battery": state.color } : undefined}
    >
      <span className="dc-m-battery-fill" style={{ width: `${level}%` }} />
      {state.id === "charging" ? (
        <svg className="dc-m-battery-bolt" viewBox="0 0 10 14" aria-hidden="true">
          <path d="M6.2 0 1 7.6h3L3.8 14 9 6.4H6z" fill="currentColor" />
        </svg>
      ) : (
        /* The number, inside the battery, the way the phone draws it with the
           percentage turned on.
           Two copies of it, clipped to the two sides of the fill's own edge —
           dark on the filled side, light on the empty side — so a digit the
           edge happens to run through is legible in both halves. One colour
           for the whole number cannot be: centred at 28 per cent it is white
           with its left half eaten by the fill, and at 63 it is dark with its
           right half lost in the dark.
           Clipped to *complementary* halves rather than stacked. Stacking them
           put two antialiased glyphs in the same place, and every digit came
           out with a halo of whatever was underneath. */
        <>
          <span
            className="dc-m-battery-num dc-m-battery-num-on"
            style={{ clipPath: `inset(0 ${100 - level}% 0 0)` }}
          >
            {level}
          </span>
          <span
            className="dc-m-battery-num"
            style={{ clipPath: `inset(0 0 0 ${level}%)` }}
            aria-hidden="true"
          >
            {level}
          </span>
        </>
      )}
    </span>
  );
  if (!edit) return body;

  return (
    <span
      className="dc-m-radio dc-m-battery-live"
      role="button"
      tabIndex={0}
      title={`${level}% · ${state.label} — press to change, drag to set the level`}
      aria-label="Battery"
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.stopPropagation();
        press.current = { x: event.clientX, moved: false };
        event.currentTarget.setPointerCapture?.(event.pointerId);
      }}
      onPointerMove={(event) => {
        const p = press.current;
        if (!p) return;
        /* Until it has travelled this is a press, and a press is the state
           step. Five pixels is the same hysteresis the row drags use. */
        if (!p.moved && Math.abs(event.clientX - p.x) < 5) return;
        p.moved = true;
        edit.canvas({ phoneBattery: levelAt(event.clientX) }, "phone:battery");
      }}
      onPointerUp={(event) => {
        const p = press.current;
        press.current = null;
        event.currentTarget.releasePointerCapture?.(event.pointerId);
        if (p && !p.moved) {
          const at = BATTERY_STATES.findIndex((b) => b.id === state.id);
          edit.canvas({ phoneBatteryState: BATTERY_STATES[(at + 1) % BATTERY_STATES.length].id });
        }
      }}
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
          event.preventDefault();
          edit.canvas(
            { phoneBattery: Math.max(0, Math.min(100, level + (event.key === "ArrowRight" ? 5 : -5))) },
            "phone:battery",
          );
        }
      }}
    >
      {body}
    </span>
  );
}

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
      {/* Drawn, not cut out. A screenshot from one of these phones carries the
          island as a black pill, because the system masks it into the capture
          — so a mockup that leaves it out looks like a phone from 2021. */}
      <span className="dc-m-island" aria-hidden="true" />
      <span className="dc-m-status-right">
        {/* Signal, then wi-fi, then the battery: the order iOS uses. */}
        <PhoneSignal canvas={canvas} edit={edit} />
        <PhoneWifi canvas={canvas} edit={edit} />
        <PhoneBattery canvas={canvas} edit={edit} />
      </span>
    </div>
  );
}

/* Discord's You Bar.
 *
 * The floating bar at the bottom of the mobile app that replaced the row of
 * tabs, the home button and the three-line server drawer. It carries who you
 * are — a larger avatar, the display name, the status under it — and gives
 * notifications a button of its own. Its icons sit in rounded squares rather
 * than circles, which is the shape the rest of that redesign moved towards;
 * the avatar stays round.
 *
 * Drawn from the mockup's own "you", which is a person the project does not
 * otherwise have: a mockup is a picture of somebody else's conversation, and
 * the one looking at it is the reader. So the name and the status are their
 * own fields, and default to the first member who is not a bot.
 */
function YouBar({ canvas, users = [], edit }) {
  const me = users.find((u) => !u.bot) ?? users[0];
  const name = canvas.youName || me?.name || "You";
  const status = canvas.youStatus ?? "Online";
  return (
    <div className="dc-you">
      <span className="dc-you-face">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={canvas.youAvatar || me?.avatar} alt="" draggable={false} />
        <span className="dc-presence dc-presence-online" />
        {edit ? (
          <ImageTools
            value={canvas.youAvatar || me?.avatar}
            label="picture"
            align="start"
            onChange={(src) => edit.canvas({ youAvatar: src })}
            onRemove={canvas.youAvatar ? () => edit.canvas({ youAvatar: "" }) : undefined}
          />
        ) : null}
      </span>
      <span className="dc-you-who">
        <span className="dc-you-name">
          {edit ? (
            <InlineText value={name} onChange={(v) => edit.canvas({ youName: v })} label="Your name" />
          ) : (
            name
          )}
        </span>
        <span className="dc-you-status">
          {edit ? (
            <InlineText
              value={status}
              onChange={(v) => edit.canvas({ youStatus: v })}
              label="Your status"
              placeholder="Online"
            />
          ) : (
            status
          )}
        </span>
      </span>
      {/* A rounded square, not a circle: the redesign gives each destination a
          boundary with an app-icon silhouette and keeps the round shape for
          faces. */}
      <span className="dc-you-btn" aria-hidden="true">
        <Icon name="inbox" size={19} />
      </span>
    </div>
  );
}

/* The home bar. 34pt of clear space with a 139x5 indicator sitting 8pt off
   the bottom — iOS's own numbers, and the reason nothing in an iPhone app
   ever sits in the bottom two corners. */
function PhoneHome() {
  return (
    <div className="dc-m-home" aria-hidden="true">
      <span className="dc-m-home-bar" />
    </div>
  );
}

function ChannelHeader({ canvas, mobile, edit }) {
  /* The glyph is the channel's, not a hash on principle. Changing a channel's
     type in the sidebar has to change it here too — the header and the row are
     the same channel, and having them disagree is the mockup contradicting
     itself in two places a screenshot shows at once. */
  const kind = channelKind(canvas);
  const glyph = CHANNEL_KINDS.find((k) => k.id === kind)?.icon ?? "channel-text";
  /* And it is a control here too. It was one only in the sidebar, which meant
     the one place a screenshot always shows the channel's type was the one
     place you could not change it from. Not `e-no-export`: the glyph is part
     of the picture, and this button has no chrome of its own to drop. */
  const hash = edit ? (
    <button
      type="button"
      className="dc-hash dc-hash-live"
      title={`${CHANNEL_KINDS.find((k) => k.id === kind)?.label} channel — press to change`}
      aria-label="Change the channel type"
      onClick={() => cycleKind(canvas, edit)}
    >
      <Icon name={glyph} size={20} />
    </button>
  ) : (
    <Icon name={glyph} size={20} className="dc-hash" />
  );

  if (mobile) {
    return (
      <header className="dc-m-head">
        <Icon name="caret-left" size={20} className="dc-m-back" />
        {hash}
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
          <Icon name="threads" size={21} />
          <Icon name="pins" size={21} />
          <Icon name="members" size={21} />
        </span>
      </header>
    );
  }
  return (
    <header className="dc-head">
      {hash}
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
            return (
              <Fragment key={u.id}>
              {order.lineAt === i ? <span className="dc-drop-line" aria-hidden="true" /> : null}
              <div
                className="dc-member"
                data-row
                data-offline={u.status === "offline" ? "true" : undefined}
                onContextMenu={onMenu ? (event) => onMenu(event, u.id, "member") : undefined}
                {...order.rowProps(i)}
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
                  <span className="dc-member-tools e-no-export">
                    {/* Dragged from a handle, not from anywhere on the row.
                        Pressing a member and moving used to start a drag,
                        which fought the click that opens them and made typing
                        their name impossible. The same handle, in the same
                        corner, that a channel and a message have — three
                        lists, one gesture. */}
                    <span
                      className="dc-member-grip"
                      role="button"
                      tabIndex={-1}
                      aria-label="Drag to reorder"
                      title="Drag to reorder"
                      {...order.handlers(i, box)}
                    >
                      <Icon name="more-vertical" size={13} />
                    </span>
                    <button
                      type="button"
                      className="dc-member-more"
                      title={`${u.name}'s roles and profile`}
                      aria-label={`${u.name}'s roles and profile`}
                      onClick={(event) => {
                        event.stopPropagation();
                        edit.member(u.id);
                      }}
                    >
                      <Icon name="settings" size={14} />
                    </button>
                  </span>
                ) : null}
              </div>
              </Fragment>
            );
          })}
        </Fragment>
      ))}
      {order.lineAt === flat.length ? <span className="dc-drop-line" aria-hidden="true" /> : null}
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
  /* The sidebars are not inside the conversation, so creeping *it* would
     scroll the messages while the rows being dragged stayed put. Their edge
     scroll is the stage, and only the stage. */
  const stage = useMemo(() => [scroller].filter(Boolean), [scroller]);
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
        <ChannelStart name={canvas.channel?.name || "general"} kind={channelKind(canvas)} edit={edit} />
      ) : null}
      {canvas.showDateDivider ? <DateDivider label={canvas.dateLabel || "Today"} /> : null}
      {(project.messages ?? []).map((message, i) => (
        <div key={message.id} data-row {...order.rowProps(i)}>
          {/* Where it will land, drawn as a line between rows rather than as a
              wash on one of them. "This row is highlighted" is ambiguous —
              above it or below it? — and a drag that cannot say where it is
              going is a drag nobody trusts. */}
          {order.lineAt === i ? <span className="dc-drop-line" aria-hidden="true" /> : null}
          {canvas.showNewDivider && i === (project.messages.length - 1) ? <NewDivider /> : null}
          <Message
            message={message}
            /* Grouped by what is around it, not by a flag on the message.
               Discord stacks consecutive messages from one person under a
               single header and breaks the stack after seven minutes, and a
               mockup that repeats the avatar and the name on every line is the
               thing that gives it away at a glance. The flag is still honoured
               when it is set, so a mockup that asked for a stack keeps it. */
            grouped={message.grouped || groupsWith(project.messages[i - 1], message)}
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
        {canvas.chrome === "full" && !mobile ? <ChannelList canvas={canvas} edit={edit} scrollers={stage} onMenu={edit ? openMenu : undefined} /> : null}

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
          {/* One slot, and one of three things in it. The follow bar used to be
              drawn *above* whatever else was there, so an announcement channel
              you had not followed offered you Follow and a message box at the
              same time — and turning on read-only as well stacked all three.
              The client puts exactly one of them where you would type. */}
          {canvas.chrome !== "none" ? (
            canvas.readOnly ? (
              <NoAccess reason={canvas.readOnlyReason} edit={edit} />
            ) : canvas.showFollow ? (
              <FollowChannel text={canvas.followText} edit={edit} />
            ) : (
              <Composer canvas={canvas} mobile={mobile} />
            )
          ) : null}
          {mobile && canvas.chrome !== "none" && canvas.showYouBar ? (
            <YouBar canvas={canvas} users={ctx.users} edit={edit} />
          ) : null}
          {/* Last, so everything else lays out above it — which is the whole
              point of it. */}
          {mobile && canvas.chrome !== "none" && canvas.showStatusBar !== false ? <PhoneHome /> : null}
        </div>

        {canvas.chrome === "full" && !mobile ? <MemberList canvas={canvas} users={ctx.users} roles={project.roles ?? []} edit={edit} scrollers={stage} onMenu={edit ? openMenu : undefined} /> : null}
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
