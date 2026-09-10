"use client";

/* The three panels that are about the project rather than about one message:
 * who is in it, what it looks like, and where it is saved.
 */

import { useEffect, useState } from "react";
import {
  IconPlus,
  IconTrash,
  IconX,
} from "@tabler/icons-react";
import { AVATAR_COUNT, avatarUrl } from "@/lib/avatars";
import { asChannel, newRole, newUser } from "@/lib/model";
import {
  ColorField,
  Empty,
  Field,
  Group,
  ImageField,
  Num,
  Pick,
  Row,
  Segmented,
  Slider,
  Text,
  Toggle,
} from "./fields";

/* ---------------------------------------------------------------- users */

/* The avatar grid loads 240 files. `loading="lazy"` on each one means the
   browser fetches the two rows in view rather than the whole set, which is
   the reason the collection is files rather than one inlined blob. */
export function AvatarPicker({ value, onChange, onClose, inline = false }) {
  return (
    <div className="e-avatars" data-inline={inline ? "true" : "false"}>
      {/* Inline it is already inside a field that names it, and there is
          nothing to dismiss — a "Done" that closes nothing is a dead control. */}
      {inline ? null : (
        <header className="e-avatars-head">
          <span>Pick an avatar</span>
          <button type="button" className="e-btn e-btn-quiet" onClick={onClose}>
            Done
          </button>
        </header>
      )}
      <div className="e-avatars-grid">
        {Array.from({ length: AVATAR_COUNT }, (_, i) => avatarUrl(i)).map((src) => (
          <button
            key={src}
            type="button"
            className="e-avatar-cell"
            data-on={value === src ? "true" : "false"}
            onClick={() => onChange(src)}
            aria-label="Use this avatar"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt="" loading="lazy" decoding="async" />
          </button>
        ))}
      </div>
    </div>
  );
}

export function UsersPanel({ project, commit, onError, focus = null, pick = null }) {
  const roles = project.roles ?? [];

  const setRole = (id, over) =>
    commit(
      (p) => ({ ...p, roles: (p.roles ?? []).map((r) => (r.id === id ? { ...r, ...over } : r)) }),
      `role:${id}:${Object.keys(over).sort().join(",")}`,
    );

  const addRole = (userId) =>
    commit((p) => {
      const role = newRole({ name: `Role ${(p.roles?.length ?? 0) + 1}` });
      return {
        ...p,
        roles: [...(p.roles ?? []), role],
        users: p.users.map((u) => (u.id === userId ? { ...u, roles: [...(u.roles ?? []), role.id] } : u)),
      };
    });

  /* `pick` is somebody having clicked the face on the mockup. That gesture
     means "change this picture", so the set opens with the sheet rather than
     leaving a second button to find. */
  const [picking, setPicking] = useState(pick);
  useEffect(() => {
    if (pick) setPicking(pick);
  }, [pick]);

  const patch = (id, over) =>
    commit((p) => ({ ...p, users: p.users.map((u) => (u.id === id ? { ...u, ...over } : u)) }));

  const remove = (id) => {
    if (project.users.length <= 1) {
      onError("A project needs at least one member.");
      return;
    }
    const fallback = project.users.find((u) => u.id !== id).id;
    commit((p) => ({
      ...p,
      users: p.users.filter((u) => u.id !== id),
      // A message whose author has gone is reassigned rather than deleted:
      // losing a message because a member was tidied up would be a surprise.
      messages: p.messages.map((m) => (m.user === id ? { ...m, user: fallback } : m)),
    }));
  };

  return (
    <>
      {project.users.map((user, i) => (
        <Group
          key={user.id}
          title={user.name || `Member ${i + 1}`}
          collapsible
          /* The one that was asked for, or the first when nobody was named.
             Opening on "whoever is first" is how pressing edit on one person
             showed you another. */
          open={focus ? user.id === focus : i === 0}
          action={
            <button type="button" className="e-icon-btn" onClick={() => remove(user.id)} aria-label="Remove member">
              <IconTrash size={14} />
            </button>
          }
        >
          <Row>
            <Field label="Name">
              <Text value={user.name} onChange={(v) => patch(user.id, { name: v })} />
            </Field>
          </Row>

          {/* Roles come first, because a role is what usually decides the
              colour. The override below it is for the case a role cannot
              cover: one person in a colour nobody else has. */}
          <Field label="Roles" hint="A role is the server's, not this person's — recolouring one recolours everybody who has it.">
            <div className="e-roles">
              {(user.roles ?? []).map((id) => {
                const role = roles.find((r) => r.id === id);
                if (!role) return null;
                return (
                  <span className="e-role" key={id}>
                    <ColorField
                      value={role.color}
                      onChange={(v) => setRole(role.id, { color: v === "none" ? "" : v })}
                      label={`Colour of ${role.name}`}
                    />
                    <Text
                      value={role.name}
                      onChange={(v) => setRole(role.id, { name: v })}
                      aria-label="Role name"
                    />
                    <Toggle
                      label="Show separately"
                      value={role.hoist}
                      onChange={(v) => setRole(role.id, { hoist: v })}
                    />
                    <button
                      type="button"
                      className="e-icon-btn"
                      aria-label={`Take ${role.name} off ${user.name}`}
                      onClick={() => patch(user.id, { roles: (user.roles ?? []).filter((r) => r !== id) })}
                    >
                      <IconX size={14} />
                    </button>
                  </span>
                );
              })}

              <div className="e-role-add">
                {roles.filter((r) => !(user.roles ?? []).includes(r.id)).length ? (
                  <Pick
                    value=""
                    placeholder="Give an existing role"
                    label="Give an existing role"
                    onChange={(id) => {
                      if (id) patch(user.id, { roles: [...(user.roles ?? []), id] });
                    }}
                    options={roles
                      .filter((r) => !(user.roles ?? []).includes(r.id))
                      .map((r) => ({ value: r.id, label: r.name }))}
                  />
                ) : null}
                <button type="button" className="e-btn e-btn-dashed" onClick={() => addRole(user.id)}>
                  <IconPlus size={14} /> New role
                </button>
              </div>
            </div>
          </Field>

          <Field label="Name colour" hint="Overrides the role colour for this one person. Leave empty to use their top coloured role.">
            <ColorField value={user.color} onChange={(v) => patch(user.id, { color: v === "none" ? "" : v })} allowNone />
          </Field>

          <Field label="Avatar">
            <div className="e-avatar-row">
              <span className="e-avatar-current">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={user.avatar} alt="" />
              </span>
              <button
                type="button"
                className="e-btn e-btn-quiet"
                onClick={() => setPicking(picking === user.id ? null : user.id)}
              >
                Choose from the set
              </button>
            </div>
          </Field>

          {picking === user.id ? (
            <AvatarPicker
              value={user.avatar}
              onChange={(src) => patch(user.id, { avatar: src })}
              onClose={() => setPicking(null)}
            />
          ) : null}

          <ImageField
            round
            label="Or upload one"
            hint="Cropped to a square from the centre and masked into a circle, the way the client does it."
            value={user.avatar?.startsWith("data:") ? user.avatar : ""}
            onChange={(v) => patch(user.id, { avatar: v || avatarUrl(0) })}
            onError={onError}
          />

          <Toggle
            label="Application"
            hint="Draws the APP tag beside the name."
            value={user.bot}
            onChange={(v) => patch(user.id, { bot: v })}
          />
          {user.bot ? (
            <>
              <Row>
                <Field label="Tag text">
                  <Text value={user.badge} onChange={(v) => patch(user.id, { badge: v })} placeholder="APP" />
                </Field>
              </Row>
              <Toggle
                label="Verified"
                hint="Adds the check inside the tag. A webhook has the tag without the check."
                value={user.verified}
                onChange={(v) => patch(user.id, { verified: v })}
              />
            </>
          ) : null}

          <Field label="Server tag" hint="The clan badge after the name. Leave empty for none.">
            <Text value={user.tag} onChange={(v) => patch(user.id, { tag: v })} placeholder="GATOR" />
          </Field>

          <Field label="Presence" hint="Only drawn in the member list.">
            <Pick
              value={user.status || "online"}
              onChange={(v) => patch(user.id, { status: v })}
              options={[
                { value: "online", label: "Online" },
                { value: "idle", label: "Idle" },
                { value: "dnd", label: "Do not disturb" },
                { value: "offline", label: "Offline" },
              ]}
            />
          </Field>

          <ImageField
            square
            label="Avatar decoration"
            hint="Drawn over the avatar at 1.2×, the way the client layers one."
            value={user.decoration}
            onChange={(v) => patch(user.id, { decoration: v })}
            onError={onError}
          />
          <ImageField
            square
            label="Role icon"
            value={user.roleIcon}
            onChange={(v) => patch(user.id, { roleIcon: v })}
            onError={onError}
          />
        </Group>
      ))}

      <button
        type="button"
        className="e-btn e-btn-dashed"
        onClick={() =>
          commit((p) => ({
            ...p,
            users: [...p.users, newUser({ avatar: avatarUrl(p.users.length * 7), name: `Member ${p.users.length + 1}` })],
          }))
        }
      >
        <IconPlus size={15} /> Add a member
      </button>
    </>
  );
}

/* --------------------------------------------------------------- emojis */

export function EmojiPanel({ project, commit, onError }) {
  const emojis = project.emojis ?? [];
  return (
    <>
      <div className="e-note">
        Upload a server emoji and use it anywhere as <code>:name:</code> — in a message, on a button,
        on a poll answer or as a reaction. Unicode emoji need no upload: they are drawn from the same
        set the client uses.
      </div>

      {emojis.map((emoji, i) => (
        <Group
          key={i}
          title={emoji.name ? `:${emoji.name}:` : `Emoji ${i + 1}`}
          collapsible
          open={i === emojis.length - 1}
          action={
            <button
              type="button"
              className="e-icon-btn"
              onClick={() => commit((p) => ({ ...p, emojis: p.emojis.filter((_, n) => n !== i) }))}
              aria-label="Remove emoji"
            >
              <IconTrash size={14} />
            </button>
          }
        >
          <Field label="Name" hint="Letters, numbers and underscores, the way Discord names one.">
            <Text
              value={emoji.name}
              onChange={(v) =>
                commit((p) => ({
                  ...p,
                  emojis: p.emojis.map((e, n) => (n === i ? { ...e, name: v.replace(/[^\w]/g, "") } : e)),
                }))
              }
            />
          </Field>
          <ImageField
            label="Image"
            value={emoji.src}
            onChange={(v) =>
              commit((p) => ({ ...p, emojis: p.emojis.map((e, n) => (n === i ? { ...e, src: v } : e)) }))
            }
            onError={onError}
          />
        </Group>
      ))}

      <button
        type="button"
        className="e-btn e-btn-dashed"
        onClick={() => commit((p) => ({ ...p, emojis: [...(p.emojis ?? []), { name: `emoji_${(p.emojis?.length ?? 0) + 1}`, src: "" }] }))}
      >
        <IconPlus size={15} /> Add a custom emoji
      </button>
    </>
  );
}

/* --------------------------------------------------------------- canvas */

export function CanvasPanel({ project, commit, onError, focus }) {
  const canvas = project.canvas;

  /* Land on the control that was pressed.
     Pressing the server's icon on the canvas opens this sheet, and a sheet that
     opens at the top with the icon four fields down is a sheet that has not
     answered the press. The field is scrolled to and its own input focused, one
     frame after the sheet is up so there is something to scroll. */
  useEffect(() => {
    if (!focus) return undefined;
    const id = window.setTimeout(() => {
      const node = document.querySelector(`[data-field="${focus}"]`);
      if (!node) return;
      node.scrollIntoView({ block: "center", behavior: "smooth" });
      node.querySelector("input, textarea")?.focus();
    }, 80);
    return () => window.clearTimeout(id);
  }, [focus]);
  /* Tagged per field: dragging the width slider is one undo step, not one per
     pixel, and moving to a different control starts a new one. */
  const set = (key, value) => commit((p) => ({ ...p, canvas: { ...p.canvas, [key]: value } }), `canvas:${key}`);
  const setIn = (key, over) =>
    commit(
      (p) => ({ ...p, canvas: { ...p.canvas, [key]: { ...p.canvas[key], ...over } } }),
      `canvas:${key}:${Object.keys(over).sort().join(",")}`,
    );

  return (
    <>
      {/* The client, the theme and how much chrome is drawn used to be the
          first three fields in here, behind a button labelled "Desktop · Ash".
          They are the three anybody reaches for, so they are on the stage bar
          as themselves now. This sheet is what is left: the things you set
          once and stop thinking about. */}
      <Group title="Canvas">
        {/* The phone's width is the phone's. Leaving the slider here would be
            a control that moves and changes nothing. */}
        {canvas.platform === "mobile" ? (
          <Field label="Size" hint="The phone is drawn at 393 x 852, the iPhone viewport. Only the desktop canvas is resizable.">
            <Text value="393 x 852" readOnly />
          </Field>
        ) : (
          <Field label="Width">
            <Slider value={canvas.width} min={320} max={1920} step={10} onChange={(v) => set("width", v)} suffix="px" />
          </Field>
        )}
        {/* Where the window stops growing. Below it the frame hugs the
            conversation; past it the conversation scrolls inside and this
            edge is what the export stops at — so it is the single control
            that decides how much of a long mockup ends up in the picture. */}
        {canvas.platform === "mobile" ? null : (
          <Field
            label="Window height"
            hint="A maximum, not a height. A short mockup stays short; a long one scrolls inside the window and exports at this edge."
          >
            <Slider
              value={canvas.height ?? 760}
              min={320}
              max={1600}
              step={10}
              onChange={(v) => set("height", v)}
              suffix="px"
            />
          </Field>
        )}
        {canvas.chrome === "none" ? (
          <Field label="Padding">
            <Slider value={canvas.padding} min={0} max={80} onChange={(v) => set("padding", v)} suffix="px" />
          </Field>
        ) : null}
        <Field label="Corner radius">
          <Slider value={canvas.radius} min={0} max={32} onChange={(v) => set("radius", v)} suffix="px" />
        </Field>
        <Field label="Export scale" hint="A 2× export is what a retina screenshot looks like.">
          <Segmented
            value={String(canvas.scale)}
            onChange={(v) => set("scale", Number(v))}
            label="Export scale"
            options={[
              { value: "1", label: "1×" },
              { value: "2", label: "2×" },
              { value: "3", label: "3×" },
            ]}
          />
        </Field>
        <Field label="Background">
          <Segmented
            value={canvas.background}
            onChange={(v) => set("background", v)}
            label="Background"
            options={[
              { value: "surface", label: "Chat" },
              { value: "transparent", label: "None" },
              { value: "custom", label: "Image" },
            ]}
          />
        </Field>
        {canvas.background === "custom" ? (
          <ImageField
            label="Background image"
            value={canvas.customBackground}
            onChange={(v) => set("customBackground", v)}
            onError={onError}
          />
        ) : null}
      </Group>

      {/* Only what is actually drawn.
          These were all shown at once, so choosing "Messages" left you looking
          at a server icon and a channel topic that appear nowhere, and a field
          whose own hint said it only applies to a mode you were not in. A
          setting that cannot affect anything is worse than a missing one: it
          asks you to work out why it did nothing. */}
      {canvas.chrome === "none" ? null : (
        <Group title={canvas.chrome === "full" ? "Server and channel" : "Channel"}>
          <Field label="Channel name">
            <Text value={canvas.channel?.name} onChange={(v) => setIn("channel", { name: v })} />
          </Field>
          <Field label="Topic" hint="The line beside the channel name in the header.">
            <Text value={canvas.channel?.topic} onChange={(v) => setIn("channel", { topic: v })} />
          </Field>

          {/* The server rail and the channel sidebar only exist in the whole
              window, and so do the things that fill them. */}
          {canvas.chrome === "full" ? (
            <>
              <Field label="Server name">
                <Text value={canvas.server?.name} onChange={(v) => setIn("server", { name: v })} />
              </Field>
              <ImageField
                square
                name="server-icon"
                label="Server icon"
                value={canvas.server?.icon}
                onChange={(v) => setIn("server", { icon: v })}
                onError={onError}
              />
              {/* Names, not the objects they are stored as — and what a
                  channel already is survives being renamed here: a channel
                  that keeps its name keeps its type and its category, and only
                  a name that is new starts as a text channel. Typing in this
                  box used to flatten every one of them back to a bare name. */}
              <Field
                label="Other channels"
                hint="Comma separated. They fill the sidebar. Their types and categories are set on the sidebar itself."
              >
                <Text
                  value={(canvas.channels ?? []).map((c) => asChannel(c).name).join(", ")}
                  onChange={(v) => {
                    const had = (canvas.channels ?? []).map(asChannel);
                    set(
                      "channels",
                      v
                        .split(",")
                        .map((s) => s.trim())
                        .filter(Boolean)
                        .map((name) => had.find((c) => c.name === name) ?? { name, kind: "text" }),
                    );
                  }}
                />
              </Field>
            </>
          ) : null}
        </Group>
      )}

      <Group title="Extras" collapsible>
        <Toggle label="Date divider" value={canvas.showDateDivider} onChange={(v) => set("showDateDivider", v)} />
        {canvas.showDateDivider ? (
          <Field label="Date">
            <Text value={canvas.dateLabel} onChange={(v) => set("dateLabel", v)} />
          </Field>
        ) : null}
        <Toggle
          label="New messages line"
          hint="The red rule the client leaves where you stopped reading."
          value={canvas.showNewDivider}
          onChange={(v) => set("showNewDivider", v)}
        />
        <Toggle label="Typing indicator" value={canvas.showTyping} onChange={(v) => set("showTyping", v)} />
        {/* Phone only: it is the mobile app's bar and there is nothing like it
            on the desktop client. */}
        {(canvas.platform ?? "desktop") === "mobile" ? (
          <Toggle
            label="You Bar"
            hint="Discord's floating bar at the bottom of the mobile app: your avatar, your name and your status. Edit them on the bar itself."
            value={canvas.showYouBar}
            onChange={(v) => set("showYouBar", v)}
          />
        ) : null}
        <Toggle
          label="Catch-up bar"
          hint="The blue rule the client puts under the header when a channel moved on without you."
          value={canvas.showUnreadBanner}
          onChange={(v) => set("showUnreadBanner", v)}
        />
        {canvas.showUnreadBanner ? (
          <>
            <Field label="How many missed">
              <Num value={canvas.unreadCount} min={1} max={999} onChange={(v) => set("unreadCount", v)} />
            </Field>
            <Field label="Since">
              <Text value={canvas.unreadSince} onChange={(v) => set("unreadSince", v)} placeholder="19:42" />
            </Field>
          </>
        ) : null}
        <Toggle
          label="Top of the channel"
          hint="The welcome heading a channel shows before its first message."
          value={canvas.showChannelStart}
          onChange={(v) => set("showChannelStart", v)}
        />
        {/* The channel's kind is the channel's, set on its row in the list
            beside the mockup. There used to be a second control for it here,
            which is how the sidebar could say "announcement" while the top of
            the channel drew a hash. */}

        {/* One slot, one of three things in it. Follow and read-only were two
            switches that could both be on, and the mockup then drew a follow
            bar, a read-only bar *and* a message box stacked on top of each
            other — three states of the same slot, all at once. */}
        <Field
          label="At the bottom"
          hint="What the client puts where you would type. An announcement channel you have not followed offers Follow instead of a message box; one you cannot post in says so."
        >
          <Segmented
            label="At the bottom"
            value={canvas.readOnly ? "readonly" : canvas.showFollow ? "follow" : "composer"}
            onChange={(v) =>
              commit(
                (p) => ({
                  ...p,
                  canvas: {
                    ...p.canvas,
                    readOnly: v === "readonly",
                    showFollow: v === "follow",
                  },
                }),
                "canvas:footer",
              )
            }
            options={[
              { value: "composer", label: "Message box" },
              { value: "follow", label: "Follow" },
              { value: "readonly", label: "No permission" },
            ]}
          />
        </Field>
        {canvas.readOnly ? (
          <Field label="What it says">
            <Text value={canvas.readOnlyReason} onChange={(v) => set("readOnlyReason", v)} />
          </Field>
        ) : null}
        {canvas.showTyping ? (
          <Field label="Who is typing">
            <Text value={canvas.typingNames} onChange={(v) => set("typingNames", v)} />
          </Field>
        ) : null}
        <Field label="Density" hint="Compact is Discord's setting that removes the gap between messages.">
          <Segmented
            value={canvas.density}
            onChange={(v) => set("density", v)}
            label="Density"
            options={[
              { value: "cozy", label: "Cozy" },
              { value: "compact", label: "Compact" },
            ]}
          />
        </Field>
      </Group>
    </>
  );
}
