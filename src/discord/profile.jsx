"use client";

/* The profile popout.
 *
 * Where Discord actually shows a person's badges — not the member list, and
 * not beside their name in a message. So this is the surface the badge library
 * belongs to, and it is a thing mockups want in its own right: "here is the
 * person" is half of most screenshots that are trying to say something about
 * somebody.
 *
 * Drawn from the member the message belongs to, so it cannot disagree with the
 * message above it.
 */

import { useRef, useState } from "react";
import { Art, Icon } from "./icon";
import { badge, badgeList } from "./badges";
import { CanvasPop } from "./pop";
import { Markdown } from "./markdown";
import { InlineText } from "./inline";
import { ImageTools } from "./image-tools";

/* Discord's own role colours, which is what somebody reaches for first. The
   picker is not a full spectrum on purpose: a role is one of about a dozen
   colours in practice, and a hex field on a chip the size of a word is a
   worse answer than twelve swatches. */
const ROLE_COLORS = [
  "#1abc9c", "#2ecc71", "#3498db", "#9b59b6", "#e91e63", "#f1c40f",
  "#e67e22", "#e74c3c", "#95a5a6", "#607d8b", "#11806a", "#1f8b4c",
];

/* One role on the card. The name is typed on the name; everything else about
   it — its colour, whether it gets its own heading in the member list, and the
   two ways to get rid of it — is behind the dot, because a chip cannot carry
   four controls and still read as a role. */
function RoleChip({ role, user, edit }) {
  const [open, setOpen] = useState(false);
  const dot = useRef(null);

  if (!edit) {
    return (
      <span className="dc-profile-role">
        <span className="dc-profile-role-dot" style={{ background: role.color || "#949ba4" }} />
        {role.name}
      </span>
    );
  }

  return (
    <span className="dc-profile-role">
      <button
        type="button"
        ref={dot}
        /* Not `e-no-export`: the coloured dot is the role, and a role chip
           without it is not a role chip. It is a button here, but a button
           with no chrome of its own — it rasterises as the dot it draws. */
        className="dc-profile-role-dot dc-profile-role-dot-live"
        style={{ background: role.color || "#949ba4" }}
        title={`Colour and settings for ${role.name}`}
        aria-label={`Colour and settings for ${role.name}`}
        onClick={(event) => {
          event.stopPropagation();
          setOpen((v) => !v);
        }}
      />
      <InlineText value={role.name} onChange={(name) => edit.role(role.id, { name })} label="Role name" />
      <button
        type="button"
        className="dc-profile-role-drop e-no-export"
        title={`Take ${role.name} off ${user.name}`}
        aria-label={`Take ${role.name} off ${user.name}`}
        onClick={(event) => {
          event.stopPropagation();
          edit.dropRole(user.id, role.id);
        }}
      >
        <Icon name="close" size={11} />
      </button>

      {open ? (
        <CanvasPop anchor={dot} onClose={() => setOpen(false)} label={`${role.name} settings`} width={236}>
          <div className="dc-pop-head">{role.name}</div>
          <div className="dc-pop-swatches">
            {ROLE_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                className="dc-pop-swatch"
                data-on={role.color?.toLowerCase() === c ? "true" : "false"}
                style={{ background: c }}
                title={c}
                aria-label={`Use ${c}`}
                onClick={() => edit.role(role.id, { color: c })}
              />
            ))}
          </div>
          <label className="dc-pop-switch">
            <input
              type="checkbox"
              checked={Boolean(role.hoist)}
              onChange={(event) => edit.role(role.id, { hoist: event.target.checked })}
            />
            <span>Display separately from online members</span>
          </label>
          <button
            type="button"
            className="dc-pop-danger"
            onClick={() => {
              edit.deleteRole(role.id);
              setOpen(false);
            }}
          >
            <Icon name="delete" size={13} /> Delete this role
          </button>
        </CanvasPop>
      ) : null}
    </span>
  );
}

/* The badge tray's way in. Discord's badges are a fixed library, so this is a
   library picker rather than an upload — the same list the inspector offers,
   on the card where the badges are actually drawn. */
function BadgePick({ chosen, onChange }) {
  const [open, setOpen] = useState(false);
  const btn = useRef(null);
  return (
    <>
      <button
        type="button"
        ref={btn}
        className="dc-profile-badge-add e-no-export"
        title="Add a badge"
        aria-label="Add a badge"
        onClick={(event) => {
          event.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        <Icon name="plus" size={13} />
      </button>
      {open ? (
        <CanvasPop anchor={btn} onClose={() => setOpen(false)} label="Badges" width={296}>
          <div className="dc-pop-scroll">
            {badgeList().map((group) => (
              <div key={group.group}>
                <div className="dc-pop-head">{group.group}</div>
                <div className="dc-pop-grid">
                  {group.items.map((item) => {
                    const on = chosen.includes(item.id);
                    return (
                      <button
                        key={item.id}
                        type="button"
                        className="dc-pop-cell"
                        data-on={on ? "true" : "false"}
                        title={item.label}
                        aria-label={item.label}
                        aria-pressed={on}
                        onClick={() =>
                          onChange(on ? chosen.filter((id) => id !== item.id) : [...chosen, item.id])
                        }
                      >
                        <Art group="badges" name={item.id} size={24} />
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </CanvasPop>
      ) : null}
    </>
  );
}

/* `set` patches the card, `edit` is the whole bundle — the name and the face
   belong to the member, not to the card, so they go through the same two
   handlers a message header uses. Without either, this draws as a picture. */
export function ProfileCard({ profile, user, roles = [], set, edit }) {
  if (!profile || !user) return null;
  const badges = (profile.badges ?? []).map(badge).filter(Boolean);
  const accent = profile.accent || user.color || "#5865f2";
  const mine = (user.roles ?? []).map((id) => roles.find((r) => r.id === id)).filter(Boolean);

  return (
    <div className="dc-profile">
      <div
        className="dc-profile-banner"
        style={
          profile.banner
            ? { backgroundImage: `url(${JSON.stringify(profile.banner)})` }
            : { background: accent }
        }
      >
        {set ? (
          <ImageTools
            value={profile.banner}
            label="banner"
            onChange={(banner) => set({ banner })}
            onRemove={profile.banner ? () => set({ banner: "" }) : undefined}
          />
        ) : null}
      </div>

      <div className="dc-profile-avatar-slot">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className={`dc-profile-avatar${edit ? " dc-avatar-live" : ""}`}
          src={user.avatar}
          alt=""
          draggable={false}
          decoding="async"
          role={edit ? "button" : undefined}
          tabIndex={edit ? 0 : undefined}
          title={edit ? `Change ${user.name}'s picture` : undefined}
          onClick={
            edit
              ? (event) => {
                  event.stopPropagation();
                  edit.avatar(user.id);
                }
              : undefined
          }
        />
        {user.decoration ? <img className="dc-profile-decoration" src={user.decoration} alt="" decoding="async" /> : null}
        <span className={`dc-presence dc-presence-${user.status || "online"} dc-profile-presence`} />
      </div>

      <div className="dc-profile-body">
        {/* The badge tray floats top-right of the body, over the banner's
            bottom edge, exactly where the client puts it. */}
        {badges.length || set ? (
          <div className="dc-profile-badges">
            {badges.map((b) => (
              <span className="dc-profile-badge" key={b.id}>
                <Art group="badges" name={b.id} size={22} title={b.label} />
                {set ? (
                  <button
                    type="button"
                    className="dc-profile-badge-drop e-no-export"
                    title={`Remove the ${b.label} badge`}
                    aria-label={`Remove the ${b.label} badge`}
                    onClick={(event) => {
                      event.stopPropagation();
                      set({ badges: (profile.badges ?? []).filter((id) => id !== b.id) });
                    }}
                  >
                    <Icon name="close" size={10} />
                  </button>
                ) : null}
              </span>
            ))}
            {set ? (
              <BadgePick
                chosen={profile.badges ?? []}
                onChange={(next) => set({ badges: next })}
              />
            ) : null}
          </div>
        ) : null}

        <div className="dc-profile-names">
          <span className="dc-profile-display" style={user.color ? { color: user.color } : undefined}>
            {edit ? (
              <InlineText
                value={user.name}
                onChange={(name) => edit.rename(user.id, name)}
                label="Display name"
                placeholder="Unnamed"
              />
            ) : (
              user.name
            )}
          </span>
          {user.bot ? (
            <span className="dc-app-badge">
              {user.verified ? <span className="dc-app-check">✓</span> : null}
              {user.badge || "APP"}
            </span>
          ) : null}
        </div>
        {profile.handle || set ? (
          <div className="dc-profile-handle">
            {set ? (
              <InlineText
                value={profile.handle}
                onChange={(handle) => set({ handle })}
                label="Username"
                placeholder="username"
              />
            ) : (
              profile.handle
            )}
          </div>
        ) : null}

        {profile.bio || set ? (
          <div className="dc-profile-bio">
            {set ? (
              <InlineText
                value={profile.bio}
                onChange={(bio) => set({ bio })}
                label="About me"
                placeholder="About me"
                multiline
                render={profile.bio ? () => <Markdown text={profile.bio} jumbo={false} /> : undefined}
              />
            ) : (
              <Markdown text={profile.bio} jumbo={false} />
            )}
          </div>
        ) : null}

        {profile.since || set ? (
          <div className="dc-profile-since">
            <span>Member since</span>
            <strong>
              {set ? (
                <InlineText
                  value={profile.since}
                  onChange={(since) => set({ since })}
                  label="Member since"
                  placeholder="1 Jan 2024"
                />
              ) : (
                profile.since
              )}
            </strong>
          </div>
        ) : null}

        {/* The roles are the member's, resolved out of the server's list, so
            renaming one here renames it in the member list and on every other
            card that shows it. They used to be a per-card copy, which meant
            the same role could be "Moderator" on one card and "Mod" on the
            next. */}
        {mine.length || edit ? (
          <div className="dc-profile-roles">
            <span className="dc-profile-label">Roles</span>
            <div className="dc-profile-role-list">
              {mine.map((role) => (
                <RoleChip key={role.id} role={role} user={user} edit={edit} />
              ))}
              {edit ? (
                <button
                  type="button"
                  className="dc-profile-role dc-profile-role-add e-no-export"
                  onClick={(event) => {
                    event.stopPropagation();
                    edit.addRole(user.id);
                  }}
                >
                  <Icon name="plus" size={12} /> Add a role
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
