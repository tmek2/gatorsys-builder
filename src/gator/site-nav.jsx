"use client";

/* One header, every page.
 *
 * The landing and the builder are the same bar; the only thing that changes is
 * what sits in the leading slot and whether the links are drawn. On the
 * builder the header is part of the tool, so it is shorter and the plate
 * beneath it starts immediately.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  IconBook2,
  IconBrandDiscord,
  IconCloud,
  IconLayoutDashboard,
  IconLifebuoy,
  IconLogout,
  IconPencilBolt,
} from "@tabler/icons-react";
import { GatorLogo } from "./gator-logo";
import { ThemeToggle } from "./theme-toggle";
import { HoverTip } from "./hover-tip";
import { HoverMenu, HoverMenuItem } from "./hover-menu";
import { DOCS_URL, GATOR_URL, SUPPORT_URL } from "@/lib/site";
import "./site-nav.css";

const LINKS = [
  { href: "/", label: "Builder", Icon: IconPencilBolt, external: false },
  { href: `${GATOR_URL}/servers`, label: "Dashboard", Icon: IconLayoutDashboard, external: true },
  { href: DOCS_URL, label: "Documentation", Icon: IconBook2, external: true },
  { href: SUPPORT_URL, label: "Support", Icon: IconLifebuoy, external: true },
];

/* `useLayoutEffect` warns when React renders on the server, and `useEffect`
   lands after the first paint — which here means the blob is drawn at the
   wrong link for a frame. Picking per environment is the usual way out. */
const useMeasure = typeof window === "undefined" ? useEffect : useLayoutEffect;

/* The account chip. It promises "your saved mockups", so on the builder — where
   that panel is already on screen behind a rail button — it opens the panel
   instead of navigating to the page it is already on. Everywhere else it is a
   link back to the tool. */
/* The avatar, or the first letter of the name when there is none. One
   component because the chip and the panel it opens draw the same face at two
   sizes, and two copies of this drifted apart once already. */
function Face({ user, className = "g-profile-face" }) {
  return user.image ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img className={className} src={user.image} alt="" />
  ) : (
    <span className={`${className} ${className}-mono`} aria-hidden="true">
      {(user.name ?? "A").slice(0, 1).toUpperCase()}
    </span>
  );
}

function ProfileChip({ user, onOpen }) {
  const [leaving, setLeaving] = useState(false);

  /* A POST, and to this app's own route: a link that signs you out is a link
     anybody else's page can make your browser follow. */
  const leave = async () => {
    setLeaving(true);
    try {
      await fetch("/api/signout", { method: "POST" });
      window.location.assign("/");
    } catch {
      setLeaving(false);
    }
  };

  return (
    <HoverMenu
      align="end"
      label="Account"
      className="g-profile-menu"
      trigger={
        <button type="button" className="g-profile">
          <Face user={user} />
          <span className="g-profile-name">{user.name ?? "Account"}</span>
        </button>
      }
    >
      <span className="g-hm-head">
        <Face user={user} className="g-hm-face" />
        <span>
          <b>{user.name ?? "Account"}</b>
          <small>Signed in with Discord</small>
        </span>
      </span>

      {/* On the builder this opens the panel that is already on screen; on the
          legal pages there is no panel, so it is a link back to the tool. */}
      <HoverMenuItem
        icon={<IconCloud size={17} />}
        title="Your saved mockups"
        note="Kept on this deployment as well as in this browser"
        {...(onOpen ? { onClick: onOpen } : { href: "/" })}
      />
      <HoverMenuItem
        icon={<IconLogout size={17} />}
        title={leaving ? "Signing out…" : "Sign out"}
        note="Your mockups stay in this browser"
        onClick={leave}
        disabled={leaving}
      />
    </HoverMenu>
  );
}

export function SiteNav({ user, canSignIn = true, compact = false, links = true, onProfile, leading, children }) {
  const here = usePathname();
  const box = useRef(null);
  const tabs = useRef(new Map());
  const [aimed, setAimed] = useState(null);
  const [moving, setMoving] = useState(false);

  // Where the blob rests when nothing is under the pointer: the link for the
  // page you are on, if one of them is.
  const onPage = LINKS.find((link) => !link.external && link.href === here)?.href ?? null;
  const lit = aimed ?? onPage;

  useMeasure(() => {
    const host = box.current;
    const target = lit ? tabs.current.get(lit) : null;
    if (!host || !target) return;
    const put = () => {
      host.style.setProperty("--nav-blob-x", `${target.offsetLeft}px`);
      host.style.setProperty("--nav-blob-y", `${target.offsetTop}px`);
      host.style.setProperty("--nav-blob-w", `${target.offsetWidth}px`);
      host.style.setProperty("--nav-blob-h", `${target.offsetHeight}px`);
    };
    put();
    // The header reflows with the viewport, and the links move with it.
    const watch = new ResizeObserver(put);
    watch.observe(host);
    return () => watch.disconnect();
  }, [lit]);

  // Squash only on a real move, never on the first paint.
  const settled = useRef(false);
  useEffect(() => {
    if (!settled.current) {
      settled.current = Boolean(lit);
      return;
    }
    setMoving(true);
    const id = window.setTimeout(() => setMoving(false), 230);
    return () => window.clearTimeout(id);
  }, [lit]);

  return (
    <header className="g-nav" data-compact={compact ? "true" : "false"}>
      <div className="g-nav-bar">
        <Link className="g-brand" href="/">
          <GatorLogo size={compact ? 24 : 30} />
          {/* The mark already says Gator. Repeating it in the word next to it
              spends the widest thing in the bar saying the same word twice. */}
          <span className="g-brand-word">Mockups</span>
        </Link>

        {links ? (
          <nav
            ref={box}
            className="g-nav-links"
            aria-label="Primary"
            data-lit={aimed || onPage ? "true" : "false"}
            data-moving={moving ? "true" : "false"}
            onPointerLeave={() => setAimed(null)}
          >
            {/* One shape moving reads as one control; four backgrounds fading
                in and out read as four. Two of these links leave the site, so
                often nothing is selected and it has nowhere to be — then it
                fades rather than springing home. */}
            <span className="g-nav-blob" aria-hidden="true">
              <span className="g-nav-blob-skin" />
            </span>

            {LINKS.map(({ href, label, Icon, external }) => {
              const shared = {
                className: "g-nav-link",
                ref: (node) => {
                  if (node) tabs.current.set(href, node);
                  else tabs.current.delete(href);
                },
                onPointerEnter: () => setAimed(href),
                onFocus: () => setAimed(href),
                onBlur: () => setAimed(null),
              };
              return external ? (
                <a key={href} {...shared} href={href} target="_blank" rel="noreferrer">
                  <Icon size={16} stroke={1.8} />
                  {label}
                </a>
              ) : (
                <Link key={href} {...shared} href={href} aria-current={here === href ? "page" : undefined}>
                  <Icon size={16} stroke={1.8} />
                  {label}
                </Link>
              );
            })}
          </nav>
        ) : null}

        {/* Anything belonging to the document rather than to the app sits
            here, before the spacer: after the mark, on the left, where a
            document editor puts the name of the thing being edited. Put after
            the spacer it drifts into the middle of the bar and moves whenever
            a control on the right changes width. */}
        {leading}

        <span className="g-nav-spacer" />

        {children}

        {/* Appearance and account, grouped: the gap inside a group has to be
            smaller than the gap around it, or the eye reads six equal items. */}
        <div className="g-nav-tools">
          <ThemeToggle />

          {/* This slot is never empty.
              Whether you can sign in is a property of the deployment, not
              something a visitor did — so a deployment without the keys used
              to render nothing at all here, leaving the corner where every
              other Gator site keeps the account bare. All three states are
              drawn; only the third is inert. */}
          {user ? (
            /* No HoverTip around this one: the menu it opens on hover says
               everything a label would have, and two things opening on the
               same hover is one of them fighting the other. */
            <ProfileChip user={user} onOpen={onProfile} />
          ) : canSignIn ? (
            <HoverTip label="Sign in with Discord to keep your mockups in the cloud" align="end">
              <a className="g-signin" href="/signin">
                <IconBrandDiscord size={16} stroke={1.9} />
                {/* In a span so a narrow screen can drop the word and keep the
                    mark: a bare text node has nothing to hide. */}
                <span>Sign in</span>
              </a>
            </HoverTip>
          ) : (
            <HoverTip
              label="Accounts are not set up on this deployment. Everything still saves in this browser."
              align="end"
            >
              {/* Still a link, not a dead label: /signin explains why there is
                  nothing to sign in to on this deployment and what still
                  works without an account. */}
              <a className="g-signin" data-inert="true" href="/signin">
                <IconBrandDiscord size={16} stroke={1.9} />
                <span>Sign in</span>
              </a>
            </HoverTip>
          )}
        </div>
      </div>
    </header>
  );
}
