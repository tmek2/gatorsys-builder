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

import { Art, Icon } from "./icon";
import { badge } from "./badges";
import { Markdown } from "./markdown";
import { InlineText } from "./inline";
import { ImageTools } from "./image-tools";

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
        {badges.length ? (
          <div className="dc-profile-badges">
            {badges.map((b) => (
              <Art key={b.id} group="badges" name={b.id} size={22} title={b.label} />
            ))}
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
                <span className="dc-profile-role" key={role.id}>
                  <span className="dc-profile-role-dot" style={{ background: role.color || "#949ba4" }} />
                  {edit ? (
                    <InlineText
                      value={role.name}
                      onChange={(name) => edit.role(role.id, { name })}
                      label="Role name"
                    />
                  ) : (
                    role.name
                  )}
                  {edit ? (
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
                  ) : null}
                </span>
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
