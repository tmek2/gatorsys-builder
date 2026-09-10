"use client";

/* The builder.
 *
 * One column, and the mockup is the editor.
 *
 * It used to be three: a list of the messages on the left, the mockup in the
 * middle, and a form describing it on the right. Both side columns were about
 * the thing between them rather than being it, and the mockup — which is the
 * whole product — got whatever width they left over.
 *
 * So the list is the canvas, where a message is selected, reordered,
 * duplicated and deleted on the message itself; the words are edited where
 * they are drawn; and the composer island at the foot of the stage is how a
 * message is written, the way a message is written in Discord. Only an embed
 * and a container still get a form, because only they are structures rather
 * than properties, and it slides in beside the canvas rather than living
 * there.
 *
 * The project is one piece of state and every change goes through `commit`,
 * which is also what pushes onto the undo stack. Nothing writes to the project
 * any other way — that is the whole reason undo can be four lines.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  IconArrowBackUp,
  IconArrowForwardUp,
  IconCheck,
  IconChevronDown,
  IconCloud,
  IconCopy,
  IconDeviceDesktop,
  IconDeviceFloppy,
  IconDeviceMobile,
  IconDots,
  IconDownload,
  IconFileText,
  IconGif,
  IconMoodSmile,
  IconPalette,
  IconPhotoDown,
  IconPlus,
  IconSettings,
  IconShare2,
  IconStack2,
  IconTrash,
  IconUsers,
  IconX,
  IconZoomIn,
  IconZoomOut,
} from "@tabler/icons-react";
import Link from "next/link";
import { SiteNav } from "@/gator/site-nav";
import { ThemeToggle } from "@/gator/theme-toggle";
import { DiscordSurface } from "@/discord/surface";
import { avatarUrl } from "@/lib/avatars";
import { PHONE_HEIGHT, PHONE_WIDTH, blankProject, newAttachment, newGift, newMessage, newRole, newUser, reid, uid } from "@/lib/model";
import { nextStamp, restamp } from "@/lib/clock";
import { TEMPLATES } from "@/lib/templates";
import { SUPPORT_URL } from "@/lib/site";
import { loadValue, saveValue } from "@/lib/storage";
import { migrate, validProject } from "@/lib/validate";
import { Hint, Pick } from "./fields";
import { Composer } from "./composer";
import { Inspector, TABS } from "./inspector";
import { CanvasPanel, EmojiPanel, UsersPanel } from "./panels";
import { BackupsPanel } from "./backups-panel";
import {
  exportGif,
  exportMessageJson,
  exportPng,
  exportProject,
  hasAnimation,
  messageJson,
  readShareLink,
  shareLink,
} from "./export";
import { forkProject } from "@/lib/fork";
import { ID } from "@/lib/ids";
import { Palette } from "./palette";
import { useCanvasGestures } from "./use-canvas";
import { Sheet } from "./sheet";
import { HoverMenu, HoverMenuItem } from "@/gator/hover-menu";
import { floatingLayerOpen } from "./use-overlay";
import "./editor.css";
import "./composer.css";
import "./phone.css";

/* A hover label, with the shortcut where there is one. Every control that is
   an icon alone needs one — an icon is a guess until something names it — and
   the shortcut belongs here rather than in a help page nobody opens. */
const STORE_KEY = "project";
const SLUG_KEY = "slug";
/* Which saved backup this working copy belongs to, if any. See the backups
   panel: a linked mockup is one where "Save" means "update that backup"
   rather than "make yet another one". */
const LINK_KEY = "backupLink";

export function Builder({ user, canSignIn = true, shared = null }) {
  const [project, setProject] = useState(blankProject);
  /* The key this mockup's cloud copy is written under, and the thing that
     makes "save" mean "update mine" rather than "update whichever one this
     came from". Minted per document, never reused across a fork. */
  const [slug, setSlug] = useState(() => ID.mockup());
  const [linkedId, setLinkedId] = useState(null);
  const [past, setPast] = useState([]);
  const [future, setFuture] = useState([]);
  /* Which overlay is open, if any: "templates" | "members" | "appearance" |
     "backups". These used to be sections that replaced the inspector, so
     opening Members hid the message you were editing. They are sheets now —
     the message and its preview stay behind them. */
  const [sheetOpen, setSheetOpen] = useState(null);
  /* Which control inside the sheet was asked for, when it was opened from
     something on the canvas rather than from the toolbar. */
  const [sheetField, setSheetField] = useState(null);
  const [tab, setTab] = useState("Content");
  const [selected, setSelected] = useState(null);
  /* Where a press on the stage started, so a drag can be told from a click. */
  const press = useRef(null);
  /* Which message has been asked to open its words for editing, from outside
     the message itself. */
  const [editingId, setEditingId] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [toast, setToast] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [savedLocally, setSavedLocally] = useState(true);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  /* How far the animated export has got, 0 to 1, or null when none is
     running. A GIF is one raster per frame and takes seconds rather than
     milliseconds, so it says so rather than looking hung. */
  const [gifProgress, setGifProgress] = useState(null);

  const stage = useRef(null);
  const importer = useRef(null);
  const scroller = useRef(null);
  const [room, setRoom] = useState(0);

  const notify = useCallback(
    (text, tone = "ok") => setToast({ text, tone, key: uid() }),
    [],
  );
  const fail = useCallback(
    (text) => setToast({ text, tone: "bad", key: uid() }),
    [],
  );

  /* ------------------------------------------------------------ loading */

  useEffect(() => {
    let alive = true;

    /* A share link wins over what is in storage: somebody who opened a link
       meant to look at that, and the draft they had is still in IndexedDB
       under the same key, untouched. */
    /* A shared mockup opens as a *fork*, not as a working copy of the
       original.
       `forkProject` replaces every id in it and strips anything that said
       where the sender's copy lived, so the two documents share no identifier
       at all. That is what makes the isolation structural rather than a
       convention: nothing the recipient does can reach the sender's backups,
       because after this there is no name in common to reach them by. The
       slug — which is the key a cloud backup is written under — is new too, so
       saving this can only ever create a row rather than land on one. */
    const incoming = shared ?? readShareLink(window.location.hash);
    if (incoming && validProject(migrate(incoming))) {
      setProject(forkProject(migrate(incoming)));
      setSlug(ID.mockup());
      setLoaded(true);
      notify(
        "Opened a shared mockup. This is your own copy — edits here reach nobody else.",
      );
      if (!shared)
        window.history.replaceState(null, "", window.location.pathname);
      return () => {
        alive = false;
      };
    }

    Promise.all([loadValue(STORE_KEY), loadValue(SLUG_KEY), loadValue(LINK_KEY)])
      .then(([saved, savedSlug, savedLink]) => {
        if (!alive) return;
        const next = migrate(saved);
        if (validProject(next)) {
          setProject(next);
          if (typeof savedSlug === "string") setSlug(savedSlug);
          if (typeof savedLink === "string") setLinkedId(savedLink);
        }
      })
      .catch(() => {
        if (alive)
          fail(
            "This browser is not letting the editor save. Download the project file to keep your work.",
          );
      })
      .finally(() => alive && setLoaded(true));

    return () => {
      alive = false;
    };
  }, [notify, fail, shared]);

  /* Open on the first message rather than on nothing.
     Nothing selected means "I am writing a new one", which is the right thing
     to mean after clicking away — but it is a strange thing to *open* on, and
     it leaves the tray and the payload with nothing to describe. Once, when
     the editor first has a document, and never again: re-running this would
     undo every deliberate click away. */
  useEffect(() => {
    if (!loaded) return;
    setSelected((current) => current ?? project.messages[0]?.id ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);

  /* Autosave. Debounced, because a keystroke is a state change and writing
     the whole project on every one of them is a transaction per character. */
  useEffect(() => {
    if (!loaded) return undefined;
    setSavedLocally(false);
    const timer = window.setTimeout(() => {
      Promise.all([saveValue(STORE_KEY, project), saveValue(SLUG_KEY, slug), saveValue(LINK_KEY, linkedId)])
        .then(() => setSavedLocally(true))
        .catch(() =>
          fail(
            "Browser storage is full. Download the project file to keep your changes.",
          ),
        );
    }, 500);
    return () => window.clearTimeout(timer);
  }, [project, slug, linkedId, loaded, fail]);

  /* No automatic snapshots.
     There was a timer taking one every ninety seconds and keeping the last
     twelve, which filled the backups list with a dozen near-identical rows
     nobody asked for and nobody could tell apart. Undo covers stepping back
     through a session; a backup is a thing you decide to keep. */

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(null), 4200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  /* A file dropped anywhere that is not a drop target.
   *
   * The browser's default for that is to leave the page and open the file, so
   * a drag that misses the dashed plate by ten pixels throws away the mockup
   * being worked on. The plates call `preventDefault` themselves, so this only
   * has to catch what none of them did: swallow it and leave the editor where
   * it is. */
  useEffect(() => {
    const swallow = (event) => {
      if (event.defaultPrevented) return;
      if (!event.dataTransfer?.types?.includes("Files")) return;
      event.preventDefault();
      /* And say so while the file is still in the air, so the cursor reads
         "not here" rather than promising a drop that does nothing. */
      if (event.type === "dragover") event.dataTransfer.dropEffect = "none";
    };
    window.addEventListener("dragover", swallow);
    window.addEventListener("drop", swallow);
    return () => {
      window.removeEventListener("dragover", swallow);
      window.removeEventListener("drop", swallow);
    };
  }, []);

  /* How much room the canvas has. A 1200px window mockup on a 390px phone has
     to be looked at somehow, and a horizontal scrollbar under a preview is the
     one thing that makes a preview useless — so the canvas is scaled down to
     fit rather than clipped. Zoom multiplies that rather than replacing it, so
     "100%" means "as large as it fits" and going above it still works. */
  useEffect(() => {
    const node = scroller.current;
    if (!node) return undefined;
    const measure = () => setRoom(node.clientWidth - 64);
    measure();
    const watch = new ResizeObserver(measure);
    watch.observe(node);
    return () => watch.disconnect();
  }, []);

  /* Put the mockup in the middle of the stage's slack.
   *
   * The stage carries a viewport's worth of empty room on every side so that
   * dragging it always does something — an editor canvas that only moves when
   * its content happens to overflow is an editor canvas that feels broken. But
   * a scroll container starts at its top-left corner, which with that much
   * slack is a screenful of nothing. So the first paint scrolls to the middle.
   *
   * Once only: after that the position is the reader's, and re-centring under
   * them every time the mockup grows a line would fight the drag they just
   * made. */
  const centred = useRef(false);
  useEffect(() => {
    const node = scroller.current;
    if (!node || centred.current || !loaded) return;
    const centre = () => {
      if (node.scrollWidth <= node.clientWidth) return false;
      node.scrollLeft = (node.scrollWidth - node.clientWidth) / 2;
      node.scrollTop = (node.scrollHeight - node.clientHeight) / 2;
      centred.current = true;
      return true;
    };
    // A frame later, so the plate has been laid out and measured.
    const id = requestAnimationFrame(() => {
      if (!centre()) requestAnimationFrame(centre);
    });
    return () => cancelAnimationFrame(id);
  }, [loaded]);

  /* -------------------------------------------------------------- state */

  /* The last thing that was edited, and when.
   *
   * Dragging a width slider from 100 to 300 fires a commit per pixel, and
   * every one of them was pushing an undo entry — so getting back to 100 meant
   * two hundred presses of ctrl+Z. A continuous edit is one thing that
   * happened, so consecutive commits carrying the same `tag` inside a short
   * window replace the previous entry rather than stacking on it.
   *
   * Untagged commits never merge: adding a message, applying JSON, restoring a
   * backup are all discrete and must each be undoable on their own. */
  const lastEdit = useRef({ tag: null, at: 0 });
  const MERGE_MS = 700;

  const commit = useCallback(
    (next, tag = null) => {
      const now = Date.now();
      const previous = lastEdit.current;
      const merge =
        tag !== null && previous.tag === tag && now - previous.at < MERGE_MS;
      lastEdit.current = { tag, at: now };

      /* The history keeps the state from *before* the run started, so the
         whole drag undoes in one press rather than to its second-to-last
         value. */
      if (!merge) setPast((p) => [...p.slice(-49), project]);
      setFuture([]);
      setProject((current) =>
        typeof next === "function" ? next(current) : next,
      );
    },
    [project],
  );

  const undo = useCallback(() => {
    setPast((p) => {
      if (!p.length) return p;
      setFuture((f) => [project, ...f].slice(0, 50));
      setProject(p[p.length - 1]);
      return p.slice(0, -1);
    });
  }, [project]);

  const redo = useCallback(() => {
    setFuture((f) => {
      if (!f.length) return f;
      setPast((p) => [...p, project]);
      setProject(f[0]);
      return f.slice(1);
    });
  }, [project]);

  /* Strictly what is selected, with no fallback to the first message.
     There was one, from when a form on the right always had to be describing
     something — and it meant nothing could ever be deselected: clicking empty
     space cleared the selection and the first message silently took its place,
     so the wash never went away and the next GIF landed on a message somebody
     had not chosen. No selection now means "I am writing a new one", which is
     what the composer beside it already meant. */
  const message = useMemo(
    () => project.messages.find((m) => m.id === selected) ?? null,
    [project.messages, selected],
  );

  /* Stable, and it matters more than it looks. Written inline this was a new
     function on every render, which reached every message on the canvas as a
     changed prop and made the memo on the row useless — so a keystroke
     re-parsed every markdown tree in the mockup. */
  const pickOnCanvas = useCallback((id) => {
    setSelected(id);
    setSheetOpen(null);
  }, []);

  /* Editing the mockup by editing the mockup: the message text, its timestamp,
     the channel name and its topic are all changed where they are drawn. The
     bundle is memoised because it reaches every message through context, and a
     new object each render would undo the memo on the row. */
  const edit = useMemo(
    () => ({
      content: (id, content) =>
        commit(
          (p) => ({ ...p, messages: p.messages.map((m) => (m.id === id ? { ...m, content } : m)) }),
          `m:${id}:content`,
        ),
      /* Any field of one message, from wherever it is drawn. This is what the
         controls painted on top of a picture use: swapping an attachment is a
         patch of `attachments`, taking an embed's image away is a patch of
         `embeds`, and neither should need a form. */
      patch: (id, over, tag) =>
        commit(
          (p) => ({ ...p, messages: p.messages.map((m) => (m.id === id ? { ...m, ...over } : m)) }),
          tag ? `m:${id}:${tag}` : undefined,
        ),
      stamp: (id, timestamp) =>
        commit(
          (p) => ({ ...p, messages: p.messages.map((m) => (m.id === id ? { ...m, timestamp } : m)) }),
          `m:${id}:timestamp`,
        ),
      /* Any one setting of the canvas, from wherever it happens to be drawn.
         The client's own furniture — the catch-up bar's count, who is typing,
         the server's name, the list of channels — is all canvas state, and all
         of it is now edited on the picture rather than in a form. Tagged per
         key so typing into one of them is one undo step and not one per
         letter. */
      canvas: (over, tag) =>
        commit(
          (p) => ({ ...p, canvas: { ...p.canvas, ...over } }),
          `canvas:${tag ?? Object.keys(over).sort().join(",")}`,
        ),
      channel: (name) =>
        commit((p) => ({ ...p, canvas: { ...p.canvas, channel: { ...p.canvas.channel, name } } }), "channel:name"),
      topic: (topic) =>
        commit((p) => ({ ...p, canvas: { ...p.canvas, channel: { ...p.canvas.channel, topic } } }), "channel:topic"),
      reorder: (from, to) =>
        commit((p) => {
          if (from === to || from < 0 || to < 0 || from >= p.messages.length || to >= p.messages.length) return p;
          const messages = [...p.messages];
          const [held] = messages.splice(from, 1);
          messages.splice(to, 0, held);
          return { ...p, messages };
        }),
      /* Renaming a member from the mockup. Tagged so a name being typed is one
         undo step rather than one per letter — and, more to the point, so the
         project is not rewritten from scratch on every keystroke. */
      rename: (id, name) =>
        commit(
          (p) => ({ ...p, users: p.users.map((u) => (u.id === id ? { ...u, name } : u)) }),
          `u:${id}:name`,
        ),
      /* The server tag beside a name. Discord's clan badge is the one piece of
         a member you set per-mockup rather than per-person, so it is on the
         name where you can see it rather than three clicks into a sheet. */
      tag: (id, tag) =>
        commit(
          (p) => ({ ...p, users: p.users.map((u) => (u.id === id ? { ...u, tag } : u)) }),
          `u:${id}:tag`,
        ),
      /* The member list is a list, so it can be rearranged like one. Discord
         orders by role and then alphabetically; a mockup orders by whatever
         the person making it wants to be true. */
      reorderMember: (fromId, toId) =>
        commit((p) => {
          const from = p.users.findIndex((u) => u.id === fromId);
          const to = p.users.findIndex((u) => u.id === toId);
          if (from === -1 || to === -1 || from === to) return p;
          const users = [...p.users];
          const [held] = users.splice(from, 1);
          users.splice(to, 0, held);
          return { ...p, users };
        }),
      addMember: () => addUser(),
      /* A member whose messages would be orphaned is reassigned rather than
         taking the messages with them: losing a message because somebody
         tidied up the member list would be a surprise. */
      removeMember: (id) =>
        commit((p) => {
          if (p.users.length <= 1) return p;
          const fallback = p.users.find((u) => u.id !== id)?.id;
          return {
            ...p,
            users: p.users.filter((u) => u.id !== id),
            messages: p.messages.map((m) => (m.user === id ? { ...m, user: fallback } : m)),
          };
        }),
      /* Roles are the server's, not a member's: recolouring one recolours
         everybody who has it. */
      role: (id, over) =>
        commit(
          (p) => ({ ...p, roles: (p.roles ?? []).map((r) => (r.id === id ? { ...r, ...over } : r)) }),
          `role:${id}:${Object.keys(over).sort().join(",")}`,
        ),
      addRole: (userId) =>
        commit((p) => {
          const role = newRole({ name: `Role ${(p.roles?.length ?? 0) + 1}` });
          return {
            ...p,
            roles: [...(p.roles ?? []), role],
            users: userId
              ? p.users.map((u) => (u.id === userId ? { ...u, roles: [...(u.roles ?? []), role.id] } : u))
              : p.users,
          };
        }),
      /* Deleting the role itself, which takes it off everybody. */
      deleteRole: (id) =>
        commit((p) => ({
          ...p,
          roles: (p.roles ?? []).filter((r) => r.id !== id),
          users: p.users.map((u) => ({ ...u, roles: (u.roles ?? []).filter((r) => r !== id) })),
        })),
      /* Taking a role off one member, which is not the same as deleting it. */
      dropRole: (userId, roleId) =>
        commit((p) => ({
          ...p,
          users: p.users.map((u) =>
            u.id === userId ? { ...u, roles: (u.roles ?? []).filter((r) => r !== roleId) } : u,
          ),
        })),
      giveRole: (userId, roleId) =>
        commit((p) => ({
          ...p,
          users: p.users.map((u) =>
            u.id === userId && !(u.roles ?? []).includes(roleId)
              ? { ...u, roles: [...(u.roles ?? []), roleId] }
              : u,
          ),
        })),
      /** The message whose words have been asked to open, if any. */
      editing: editingId,
      /* The server's own settings, opened from the server's own icon — and
         opened *at* the icon's field, not at the top of a sheet with it four
         rows down. Pressing a picture and being put somewhere else is the
         press not having been answered. */
      server: () => {
        setAvatarFor(null);
        setSheetField("server-icon");
        setSheetOpen("appearance");
      },
      member: (id) => {
        setFocusUser(id ?? null);
        setAvatarFor(null);
        setSheetOpen("members");
      },
      /* Pressing the face means the picture, so the set of faces is already
         open when the sheet arrives. */
      avatar: (id) => {
        setFocusUser(id ?? null);
        setAvatarFor(id ?? null);
        setSheetOpen("members");
      },
      /* What the right-click menu offers, which depends on what was under the
         pointer: a message, or the canvas around it. */
      menu: (id, kind = "message") => {
        /* The member list and the channel list are not the canvas. Offering
           "Add a message" to somebody who right-clicked a member is the
           browser's own context menu problem with our styling on it. */
        if (kind === "member" || kind === "members") {
          const who = project.users.find((u) => u.id === id);
          if (!who) {
            return [
              { id: "add", label: "Add a member", icon: "add-friends", run: () => addUser() },
              { id: "manage", label: "Manage members\u2026", icon: "members", run: () => { setFocusUser(null); setSheetOpen("members"); } },
            ];
          }
          const mine = (who.roles ?? []).map((r) => project.roles?.find((x) => x.id === r)).filter(Boolean);
          return [
            { id: "edit", label: `Edit ${who.name}\u2026`, icon: "edit", run: () => edit.member(who.id) },
            { id: "face", label: "Change their picture", icon: "person", run: () => edit.avatar(who.id) },
            "-",
            { id: "role", label: "Give them a new role", icon: "role-shield", run: () => edit.addRole(who.id) },
            ...mine.map((role) => ({
              id: `hoist:${role.id}`,
              label: role.hoist
                ? `Stop showing ${role.name} separately`
                : `Show ${role.name} separately`,
              icon: "members",
              run: () => edit.role(role.id, { hoist: !role.hoist }),
            })),
            "-",
            { id: "add", label: "Add a member", icon: "add-friends", run: () => addUser() },
            {
              id: "remove",
              label: `Remove ${who.name}`,
              icon: "person-remove",
              danger: true,
              disabled: project.users.length <= 1,
              run: () => edit.removeMember(who.id),
            },
          ];
        }

        if (kind === "channels") {
          const list = project.canvas.channels?.length
            ? project.canvas.channels
            : [project.canvas.channel?.name || "general"];
          return [
            {
              id: "add",
              label: "Add a channel",
              icon: "plus",
              run: () => edit.canvas({ channels: [...list, `channel-${list.length + 1}`] }),
            },
            { id: "server", label: "Server and channel\u2026", icon: "settings", run: () => setSheetOpen("appearance") },
          ];
        }

        if (!id) {
          return [
            { id: "add", label: "Add a message", icon: "plus", keys: "\u2318\u21B5", run: () => addMessage() },
            { id: "member", label: "Add a member", icon: "add-friends", run: () => addUser() },
            "-",
            { id: "appearance", label: "Appearance and chrome\u2026", icon: "settings", run: () => setSheetOpen("appearance") },
            { id: "templates", label: "Start from a template\u2026", icon: "copy-text", run: () => setSheetOpen("templates") },
            "-",
            { id: "png", label: "Export a PNG", icon: "download", run: () => doExportPng() },
            { id: "gif", label: "Export an animated GIF", icon: "gif", run: () => doExportGif() },
          ];
        }
        const at = project.messages.findIndex((m) => m.id === id);
        return [
          /* "Edit this message" edits the message. It opened the tray of
             everything a message can carry instead, which is a different
             question — and the words are edited on the words now, so this
             puts the caret in them. */
          {
            id: "edit",
            label: "Edit this message",
            icon: "edit",
            run: () => {
              setSelected(id);
              setEditingId(id);
              /* Raised for one frame. The field takes it from there and keeps
                 its own state, so lowering it again cannot close the field
                 somebody is typing into. */
              window.requestAnimationFrame(() => setEditingId(null));
            },
          },
          { id: "embeds", label: "Add an embed", icon: "external", run: () => { setSelected(id); setTab("Embeds"); setTrayOpen(false); setPanelOpen(true); } },
          { id: "components", label: "Add components", icon: "apps", run: () => { setSelected(id); setTab("Components"); setTrayOpen(false); setPanelOpen(true); } },
          /* Everything else a message can carry — reactions, a poll, a
             profile card, the payload — is one board, and this is the way to
             it from the message itself. */
          {
            id: "more",
            label: "More options\u2026",
            icon: "more",
            run: () => { setSelected(id); setPanelOpen(false); setTrayOpen(true); },
          },
          "-",
          { id: "up", label: "Move up", icon: "caret-up", disabled: at <= 0, run: () => edit.move(id, -1) },
          { id: "down", label: "Move down", icon: "caret-down", disabled: at === project.messages.length - 1, run: () => edit.move(id, 1) },
          { id: "dup", label: "Duplicate", icon: "copy-text", keys: "\u2318D", run: () => edit.duplicate(id) },
          "-",
          { id: "copy", label: "Copy the payload", icon: "copy-id", run: () => copyJson() },
          {
            id: "delete",
            label: "Delete this message",
            icon: "delete",
            danger: true,
            disabled: project.messages.length <= 1,
            run: () => edit.remove(id),
          },
        ];
      },
      move: (id, by) =>
        commit((p) => {
          const i = p.messages.findIndex((m) => m.id === id);
          const to = i + by;
          if (i === -1 || to < 0 || to >= p.messages.length) return p;
          const messages = [...p.messages];
          const [held] = messages.splice(i, 1);
          messages.splice(to, 0, held);
          return { ...p, messages };
        }),
      duplicate: (id) =>
        commit((p) => {
          const i = p.messages.findIndex((m) => m.id === id);
          if (i === -1) return p;
          const copy = reid(p.messages[i]);
          /* A copy that kept the reply would draw a second spine pointing at
             the same message, which the client never does. */
          copy.reply = "";
          return { ...p, messages: [...p.messages.slice(0, i + 1), copy, ...p.messages.slice(i + 1)] };
        }),
      remove: (id) =>
        commit((p) => {
          if (p.messages.length <= 1) return p;
          return {
            ...p,
            messages: p.messages
              .filter((m) => m.id !== id)
              .map((m) => (m.reply === id ? { ...m, reply: "" } : m)),
          };
        }),
    }),
    /* `editingId` too: it is read out of the bundle by the row that has to
       open, so a bundle memoised without it hands out a stale flag and the
       menu item does nothing. */
    [commit, editingId],
  );

  /* Whether the drawer over the canvas is showing. Picking a tool opens it on
     that tab; pressing the tool that is already showing closes it again, which
     is the behaviour of every dock somebody has used before. */
  /* Which member the members sheet should open on. */
  const [focusUser, setFocusUser] = useState(null);
  /* Which member's picture somebody asked to change by clicking their face
     on the mockup, as opposed to opening the members sheet generally. */
  const [avatarFor, setAvatarFor] = useState(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [trayOpen, setTrayOpen] = useState(false);
  const dock = useRef(null);
  const dockOpen = panelOpen || trayOpen;

  /* Press outside and they go away. The tray held its ground over the mockup
     until you found its X, which is not how any picker in the client behaves
     — or any menu on this page. The island is excepted because it is how you
     opened the thing and how you switch between them. */
  useEffect(() => {
    if (!panelOpen && !trayOpen) return undefined;
    const away = (event) => {
      const el = event.target;
      if (!(el instanceof Element)) return;
      if (el.closest(".c-tray, .c-panel, .c-island")) return;
      /* Anything a control of theirs opened on the body — a select's menu, a
         colour picker, our own right-click menu — is still inside them as far
         as somebody using it is concerned. */
      if (el.closest("[data-radix-popper-content-wrapper], .dc-menu, .e-sheet-scrim, .e-palette-scrim")) {
        return;
      }
      setTrayOpen(false);
      setPanelOpen(false);
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [panelOpen, trayOpen]);

  /* The drawer covers the bottom of the stage, and the canvas is positioned by
     scroll rather than by centring — `.e-stage-pad` is always taller than the
     stage, so no amount of padding moves what is on screen. So opening the
     drawer scrolls the mockup up by half of it, and closing scrolls back by
     exactly what was applied. Keeping the amount that was applied rather than
     recomputing it means a drawer that changed height in between cannot leave
     the canvas drifting. */
  const dockShift = useRef(0);
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const want = dockOpen && message ? Math.round((dock.current?.offsetHeight ?? 520) / 2) + 24 : 0;
    const delta = want - dockShift.current;
    if (!delta) return;
    dockShift.current = want;
    el.scrollBy({ top: delta, behavior: "smooth" });
  }, [dockOpen, message]);


  /* Adding a member from the island. It selects the new person as well as
     making them, because somebody who just pressed "add a member" wants to
     send as them — otherwise the next thing they have to do is go and find the
     pill again. */
  const addUser = useCallback(() => {
    const made = newUser({
      avatar: avatarUrl(project.users.length * 7),
      name: `Member ${project.users.length + 1}`,
    });
    commit((p) => ({ ...p, users: [...p.users, made] }));
    setSendAs(made.id);
    /* Open on the one that was just made. Without this the sheet falls back to
       "whoever is first", so pressing Add a member put you in front of a member
       you already had — and the new one was somewhere down the list. */
    setFocusUser(made.id);
    setSheetOpen("members");
  }, [commit, project.users.length]);

  /* Who the island is sending as. It follows the selected message so that
     picking one on the canvas and typing continues that person's run, and a
     deliberate switch in the pill sticks until the next one. */
  const [sendAs, setSendAs] = useState(null);
  const author =
    project.users.find((u) => u.id === (sendAs ?? message?.user)) ?? project.users[0];

  const patchMessage = useCallback(
    (over) => {
      if (!message) return;
      /* Tagged by which fields of which message are changing, so typing into
         one box is one undo step and moving to the next box starts another. */
      const tag = `m:${message.id}:${Object.keys(over).sort().join(",")}`;
      commit(
        (p) => ({
          ...p,
          messages: p.messages.map((m) =>
            m.id === message.id ? { ...m, ...over } : m,
          ),
        }),
        tag,
      );
    },
    [commit, message],
  );

  /* Enter in the island. The same thing "Add a message" does, except the text
     is already written — which is the whole point of typing into a chat rather
     than adding an empty row and then finding the box to fill in. */
  const sendMessage = useCallback(
    (content) => {
      const author = sendAs ?? message?.user ?? project.users[0].id;
      const next = newMessage(author, {
        content,
        timestamp: nextStamp(project.messages) ?? "Today at 10:00",
      });
      commit((p) => ({ ...p, messages: [...p.messages, next] }));
      setSelected(next.id);
      setSheetOpen(null);
    },
    [commit, message, project.messages, project.users, sendAs],
  );

  /* The composer's own buttons, each doing the thing it draws. They all opened
     the same panel before, which made four buttons that were one button in
     four costumes. Each adds its thing to the selected message and opens the
     tray on it, so you can see what landed and change it. */
  /* An empty message to hang something on, for the controls that add rather
     than type. Returns the one it made so a caller can carry on with it. */
  const startMessage = useCallback(() => {
    const author = sendAs ?? project.users[0].id;
    const made = newMessage(author, {
      content: "",
      timestamp: nextStamp(project.messages) ?? "Today at 10:00",
    });
    commit((p) => ({ ...p, messages: [...p.messages, made] }));
    setSelected(made.id);
    return made;
  }, [commit, project.messages, project.users, sendAs]);

  const addToMessage = useCallback(
    /* What the client's own buttons do, rather than four faces on one button.
       Each one adds the thing it is a picture of, with the file already in it
       — the picker handed it over — and nothing opens a panel to say so. The
       tray is for the things a message can carry that have no button. */
    (what, src = "") => {
      /* Nothing selected means "I am writing a new one", the same as the text
         field beside these buttons. Pressing GIF with no message picked used
         to quietly attach it to whichever message was last touched. */
      if (!message) {
        const author = sendAs ?? project.users[0].id;
        const made = newMessage(author, {
          content: "",
          timestamp: nextStamp(project.messages) ?? "Today at 10:00",
        });
        if (what === "attachment") made.attachments = [newAttachment({ kind: "image", src })];
        else if (what === "gif") made.attachments = [newAttachment({ kind: "image", name: "tenor.gif", src })];
        else if (what === "file") made.attachments = [newAttachment({ kind: "file", name: "document.pdf", src })];
        else if (what === "sticker") made.sticker = { name: "Sticker", src };
        else if (what === "gift") made.gift = newGift();
        commit((p) => ({ ...p, messages: [...p.messages, made] }));
        setSelected(made.id);
        return;
      }
      const attach = (over) =>
        patchMessage({ attachments: [...(message.attachments ?? []), newAttachment(over)] });

      if (what === "attachment") {
        attach({ kind: "image", src });
      } else if (what === "gif") {
        /* Named so the client's own GIF badge is drawn on it. A GIF in a
           mockup is an attachment that says it came from Tenor. */
        attach({ kind: "image", name: "tenor.gif", src });
      } else if (what === "sticker") {
        patchMessage({ sticker: { name: message.sticker?.name || "Sticker", src } });
      } else if (what === "gift") {
        /* The gift button opens Nitro gifting in the client, which is not a
           thing to draw — but the message it *produces* is, and that is what
           somebody making a mockup of "here, have Nitro" is after. */
        patchMessage({ gift: message.gift ?? newGift() });
      } else if (what === "file") {
        attach({ kind: "file", name: "document.pdf", src });
      }
    },
    [message, patchMessage, commit, project.messages, project.users, sendAs],
  );

  const addMessage = useCallback(() => {
    const author = message?.user ?? project.users[0].id;
    /* The clock moves the way a conversation does: a few messages inside one
       minute, then the next. Every message stamped identically is the thing
       that gives a mockup away, and a minute per message is just as wrong in
       the other direction. */
    const next = newMessage(author, {
      content: "New message",
      timestamp:
        nextStamp(project.messages) ?? message?.timestamp ?? "Today at 10:00",
    });
    commit((p) => ({ ...p, messages: [...p.messages, next] }));
    setSelected(next.id);
    setSheetOpen(null);
    setTab("Content");
  }, [commit, message, project.messages, project.users]);

  const duplicateMessage = useCallback(() => {
    if (!message) return;
    const copy = reid(message);
    copy.reply = "";
    const i = project.messages.findIndex((m) => m.id === message.id);
    commit((p) => ({
      ...p,
      messages: [
        ...p.messages.slice(0, i + 1),
        copy,
        ...p.messages.slice(i + 1),
      ],
    }));
    setSelected(copy.id);
  }, [commit, message, project.messages]);

  const removeMessage = useCallback(() => {
    if (!message || project.messages.length <= 1) {
      fail("A mockup needs at least one message.");
      return;
    }
    const id = message.id;
    const rest = project.messages.filter((m) => m.id !== id);
    commit((p) => ({
      ...p,
      // A reply pointing at a message that has gone would draw an empty spine.
      messages: p.messages
        .filter((m) => m.id !== id)
        .map((m) => (m.reply === id ? { ...m, reply: "" } : m)),
    }));
    setSelected(rest[0]?.id ?? null);
  }, [commit, fail, message, project.messages]);

  /* One move, expressed as "this one goes there". The arrow buttons are a
     one-step case of it and the drag is an any-step case, so both go through
     here rather than each having its own idea of what moving means. */
  const reorder = useCallback(
    (from, to) => {
      if (from === to) return;
      commit((p) => {
        const list = [...p.messages];
        const [held] = list.splice(from, 1);
        list.splice(to, 0, held);
        return { ...p, messages: list };
      });
    },
    [commit],
  );

  const moveMessage = useCallback(
    (delta) => {
      if (!message) return;
      const i = project.messages.findIndex((m) => m.id === message.id);
      const j = i + delta;
      if (j < 0 || j >= project.messages.length) return;
      reorder(i, j);
    },
    [message, project.messages, reorder],
  );

  /* The whole window is 72px of rail, 240 of channels and 240 of members
     before the chat gets any: at the 780px a bare message list wants, the
     conversation is squeezed into 228 and every line wraps twice. Switching to
     it widens the canvas, and only ever widens — a canvas already big enough
     is left alone. */
  const setChrome = useCallback(
    (chrome) => {
      /* A desktop client is a window, not a column. At 720 the full chrome —
         72px of server rail, 240 of channels, 240 of members — left the
         conversation about 170px wide, which reads as a tablet held sideways
         rather than as Discord on a computer. */
      const floor = chrome === "full" ? 1280 : chrome === "chat" ? 860 : 0;
      commit((p) => ({
        ...p,
        canvas: { ...p.canvas, chrome, width: Math.max(p.canvas.width, floor) },
      }));
    },
    [commit],
  );

  const load = useCallback(
    (next, nextSlug, { detach = false } = {}) => {
      const migrated = migrate(next);
      if (!validProject(migrated)) {
        fail("That is not a valid mockup file.");
        return;
      }
      /* Detaching is for anything that arrived from somewhere else — an
         imported file, a shared link. Restoring your own backup is not
         detached: it is the same document going back in time, and giving it a
         new identity every time would turn one mockup into a pile of them. */
      commit(detach ? forkProject(migrated) : migrated);
      if (nextSlug) setSlug(nextSlug);
      else if (detach) setSlug(ID.mockup());
      setSelected(migrated.messages[0]?.id ?? null);
      setSheetOpen(null);
      setTab("Content");
    },
    [commit, fail],
  );

  /* ------------------------------------------------------------ actions */

  const doExportPng = useCallback(async () => {
    if (!stage.current) return;
    setExporting(true);
    try {
      await exportPng(stage.current, project);
      notify("PNG exported.");
    } catch {
      fail(
        "The export failed. An image linked from another site can block it — upload it instead.",
      );
    } finally {
      setExporting(false);
    }
  }, [fail, notify, project]);

  /* Cheap enough to run on every edit; the real decode happens only when the
     button is pressed. */
  const animated = useMemo(() => hasAnimation(project), [project]);

  const doExportGif = useCallback(async () => {
    if (!stage.current) return;
    setExporting(true);
    setGifProgress(0);
    try {
      const result = await exportGif(stage.current, project, setGifProgress);
      if (result?.error) fail(result.error);
      else notify("GIF exported.");
    } catch {
      fail("The GIF export failed. Try it as a picture instead.");
    } finally {
      setGifProgress(null);
      setExporting(false);
    }
  }, [fail, notify, project]);

  const doShare = useCallback(async () => {
    const { url, kind, error } = await shareLink(project);
    if (error) {
      fail(error);
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      notify(
        kind === "fragment"
          ? "Link copied. It carries the whole mockup and never touches the server."
          : "Short link copied. It opens a separate copy, and it expires in 14 days.",
      );
    } catch {
      fail(`Could not reach the clipboard. The link is ${url}`);
    }
  }, [fail, notify, project]);

  const copyJson = useCallback(async () => {
    if (!message) return;
    try {
      await navigator.clipboard.writeText(messageJson(message));
      notify("Message JSON copied.");
    } catch {
      fail("Could not reach the clipboard.");
    }
  }, [fail, message, notify]);

  const importFile = useCallback(
    async (event) => {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (!file) return;
      if (file.size > 24 * 1024 * 1024) {
        fail("That file is too large to be a mockup.");
        return;
      }
      try {
        load(JSON.parse(await file.text()), null, { detach: true });
        notify("Project imported as your own copy.");
      } catch {
        fail("That file could not be read as a mockup.");
      }
    },
    [fail, load, notify],
  );

  /* ---------------------------------------------------------- gestures */

  const {
    dragging,
    zoomShown,
    handlers: canvasHandlers,
  } = useCanvasGestures({
    scrollerRef: scroller,
    zoom,
    setZoom,
  });

  const phone = project.canvas.platform === "mobile";
  const fit =
    room > 0
      ? Math.min(1, room / (phone ? PHONE_WIDTH : project.canvas.width))
      : 1;
  const shown = zoomShown * fit;

  /* The same travelling indicator the site's header has, twice: on the rail
     and on the tabs. One shape moving reads as one control; five backgrounds
     fading in and out read as five. */

  /* --------------------------------------------------------- shortcuts */

  useEffect(() => {
    const onKey = (event) => {
      const typing = ["INPUT", "TEXTAREA", "SELECT"].includes(
        document.activeElement?.tagName,
      );
      const mod = event.metaKey || event.ctrlKey;

      if (mod && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen(true);
        return;
      }
      if (event.key === "Escape") {
        /* Not while something is floating over it. A select or a colour picker
           opened from inside a sheet closes itself on Escape, and taking the
           sheet down in the same press is two dismissals for one key. */
        if (floatingLayerOpen()) return;
        setPaletteOpen(false);
        setSheetOpen(null);
        return;
      }
      /* The zoom shortcuts every canvas has. `=` because that is the key the
         `+` is printed on, and the browser's own zoom is what ctrl-plus does
         everywhere else — which is why this claims it rather than leaving the
         page to grow around a canvas that has its own zoom. */
      if (mod && (event.key === "=" || event.key === "+")) {
        event.preventDefault();
        setZoom((z) => Math.min(2, Math.round((z + 0.1) * 10) / 10));
        return;
      }
      if (mod && (event.key === "-" || event.key === "_")) {
        event.preventDefault();
        setZoom((z) => Math.max(0.4, Math.round((z - 0.1) * 10) / 10));
        return;
      }
      if (mod && event.key === "0") {
        event.preventDefault();
        setZoom(1);
        return;
      }
      if (typing) return;

      if (mod && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
      }
      if (mod && event.key.toLowerCase() === "d") {
        event.preventDefault();
        duplicateMessage();
      }
      if (mod && event.key === "Enter") {
        event.preventDefault();
        addMessage();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [addMessage, duplicateMessage, redo, setZoom, undo]);

  /* ------------------------------------------------------------- render */

  return (
    <div className="e-app">
      <SiteNav
        user={user}
        canSignIn={canSignIn}
        compact
        links={false}
        onProfile={() => setSheetOpen("backups")}
        leading={
          <div className="e-titlebar">
            <Hint label="Rename this mockup">
              <input
                className="e-project-name"
                aria-label="Mockup name"
                value={project.name}
                onChange={(e) =>
                  commit((p) => ({ ...p, name: e.target.value }))
                }
              />
            </Hint>
            <Hint
              label={
                savedLocally
                  ? "Kept in this browser and restored when you come back"
                  : "Writing to this browser"
              }
            >
              <span
                className="e-save"
                data-saved={savedLocally ? "true" : "false"}
              >
                {savedLocally ? (
                  <IconCheck size={13} />
                ) : (
                  <IconDeviceFloppy size={13} />
                )}
                {savedLocally ? "Saved" : "Saving…"}
              </span>
            </Hint>
            {/* Next to the save state rather than out in the action cluster.
                Both answer the same question — where is my work kept — and
                somebody who has just read "Saved" and wants the copies is
                already looking here. */}
            <Hint label="Saved copies of this mockup, in this browser and in the cloud">
              <button
                type="button"
                className="e-titlebar-backups"
                onClick={() => setSheetOpen("backups")}
              >
                <IconCloud size={14} /> Backups
              </button>
            </Hint>
          </div>
        }
      >
        <div className="e-topbar-actions e-no-export">
          <Hint label="Undo" keys="⌘Z">
            <button
              type="button"
              className="e-icon-btn"
              onClick={undo}
              disabled={!past.length}
              aria-label="Undo"
            >
              <IconArrowBackUp size={16} />
            </button>
          </Hint>
          <Hint label="Redo" keys="⇧⌘Z">
            <button
              type="button"
              className="e-icon-btn"
              onClick={redo}
              disabled={!future.length}
              aria-label="Redo"
            >
              <IconArrowForwardUp size={16} />
            </button>
          </Hint>
          {/* Everything that is not why anybody opened the tool. On a phone
              these step behind More: three word-buttons and an export do not
              fit across 393 points, and the one that has to survive that is
              the export. */}
          <span className="e-nav-desk">
            <Hint label="Start from a template">
              <button
                type="button"
                className="e-btn e-btn-quiet"
                onClick={() => setSheetOpen("templates")}
              >
                <IconStack2 size={15} /> Templates
              </button>
            </Hint>
            <Hint label="Copy a link that carries the whole mockup">
              <button
                type="button"
                className="e-btn e-btn-quiet"
                onClick={doShare}
              >
                <IconShare2 size={15} /> Share
              </button>
            </Hint>
          </span>
          <button
            type="button"
            className="e-icon-btn e-nav-more"
            onClick={() => setSheetOpen("more")}
            aria-label="More"
            title="More"
          >
            <IconDots size={18} />
          </button>
          {/* One Export button with the formats under it, rather than one
              button per format: there were two, and a third would have been a
              third. It opens on hover and on a press, so a finger gets the
              same menu a pointer does. */}
          <HoverMenu
            align="end"
            label="Export"
            className="e-export"
            trigger={
              <button type="button" className="e-btn e-btn-solid" disabled={exporting}>
                <IconDownload size={15} />
                {gifProgress === null ? (exporting ? "Exporting…" : "Export") : `${Math.round(gifProgress * 100)}%`}
                <IconChevronDown size={14} className="e-export-caret" />
              </button>
            }
          >
            <HoverMenuItem
              icon={<IconPhotoDown size={17} />}
              title="PNG"
              note={`A still picture, at ${project.canvas.scale}×`}
              onClick={doExportPng}
              disabled={exporting}
            />
            <HoverMenuItem
              icon={<IconGif size={17} />}
              title="Animated GIF"
              note={
                animated
                  ? "Keeps the animation moving"
                  : "Nothing in this mockup moves yet"
              }
              onClick={doExportGif}
              disabled={exporting || !animated}
            />
          </HoverMenu>
        </div>
      </SiteNav>

      {/* One column. The mockup is the editor: a message is selected, reordered,
          duplicated, deleted and edited on the canvas, and the two structures
          that need a real form — an embed and a container — get a panel that
          slides in beside it. */}
      <div className="e-body">
        <main className="e-stage" data-dock={dockOpen && message ? "true" : "false"}>
          <div className="e-stage-bar e-no-export">
            {/* One control that said "Desktop · Ash" and opened a sheet holding
                the client, the theme, the chrome, the width and eleven other
                things. Somebody looking for "switch to phone" had to guess
                that a palette icon and the word "Ash" led there. The three
                anybody actually reaches for are on the bar as themselves, and
                the rest is behind "More". */}
            <div className="e-stage-set" role="group" aria-label="Client">
              {[
                { id: "desktop", label: "Desktop", Glyph: IconDeviceDesktop },
                { id: "mobile", label: "Phone", Glyph: IconDeviceMobile },
              ].map(({ id, label, Glyph }) => (
                <Hint key={id} label={`Draw this mockup as ${label === "Phone" ? "a phone" : "a desktop window"}`}>
                  <button
                    type="button"
                    className="e-stage-seg"
                    data-on={(project.canvas.platform ?? "desktop") === id ? "true" : "false"}
                    aria-pressed={(project.canvas.platform ?? "desktop") === id}
                    onClick={() => commit((p) => ({ ...p, canvas: { ...p.canvas, platform: id } }))}
                  >
                    <Glyph size={15} stroke={1.8} />
                    <span>{label}</span>
                  </button>
                </Hint>
              ))}
            </div>

            <span className="e-stage-rule" />

            {/* Deliberately not wrapped in a Hint, unlike everything else on
                this bar. A tooltip is a dismissable layer, and hovering one
                over a Select puts it *above* the open menu in Radix's layer
                stack — so Escape closed the tooltip, the menu stayed open, and
                the scroll lock it holds left the whole editor unclickable. A
                title is a tooltip the browser owns and no layer at all. */}
            <span className="e-stage-field">
              <Pick
                value={project.canvas.theme}
                onChange={(v) => commit((p) => ({ ...p, canvas: { ...p.canvas, theme: v } }))}
                label="Discord theme"
                title="Which of Discord's four themes"
                options={[
                  { value: "light", label: "Light" },
                  { value: "ash", label: "Ash" },
                  { value: "dark", label: "Dark" },
                  { value: "onyx", label: "Onyx" },
                ]}
              />
            </span>

            <span className="e-stage-field">
              <Pick
                value={project.canvas.chrome}
                onChange={setChrome}
                label="How much of the client"
                title="How much of the client is drawn around the messages"
                options={[
                  { value: "none", label: "Messages" },
                  { value: "chat", label: "Channel" },
                  { value: "full", label: "Window" },
                ]}
              />
            </span>

            <Hint label="Background, size, density and the client's own notices">
              <button
                type="button"
                className="e-stage-appearance"
                onClick={() => setSheetOpen("appearance")}
              >
                <IconPalette size={15} stroke={1.8} />
                <span>More</span>
              </button>
            </Hint>

            <span className="e-stage-spacer" />
            <Hint label="Zoom out">
              <button
                type="button"
                className="e-icon-btn"
                onClick={() =>
                  setZoom((z) => Math.max(0.4, Math.round((z - 0.1) * 10) / 10))
                }
                aria-label="Zoom out"
              >
                <IconZoomOut size={16} />
              </button>
            </Hint>
            <Hint label="Reset to fit" keys="⌘/ctrl + scroll">
              <button
                type="button"
                className="e-zoom"
                onClick={() => setZoom(1)}
              >
                {Math.round(shown * 100)}%
              </button>
            </Hint>
            <Hint label="Zoom in">
              <button
                type="button"
                className="e-icon-btn"
                onClick={() =>
                  setZoom((z) => Math.min(2, Math.round((z + 0.1) * 10) / 10))
                }
                aria-label="Zoom in"
              >
                <IconZoomIn size={16} />
              </button>
            </Hint>
            {/* A tooltip only tells you once you already suspect there is
                something to find. The shortcut is written next to the control
                it belongs to, where somebody who has never zoomed a canvas
                before will read it. */}
            <span className="e-zoom-hint" aria-hidden="true">
              <kbd>⌘</kbd>
              <span>/</span>
              <kbd>ctrl</kbd>
              <span>+ scroll to zoom</span>
            </span>
          </div>

          <div
            className="e-stage-scroll"
            ref={scroller}
            data-grabbing={dragging ? "true" : "false"}
            {...canvasHandlers}
            /* Pressing empty space puts the message down. A selection that
               survives clicking away is a selection you have to remember, and
               everything the island adds goes to the selected message — so a
               stale one quietly attached the next GIF to the wrong row.
               After the canvas's own handlers, not before: the spread would
               otherwise replace this one and the press would never be
               recorded. Both run — the canvas pans, and a press that turns out
               to be a click puts the message down. */
            onPointerDown={(event) => {
              press.current = { x: event.clientX, y: event.clientY };
              canvasHandlers.onPointerDown?.(event);
            }}
            onClick={(event) => {
              const from = press.current;
              press.current = null;
              /* A click that travelled is a pan or a text selection, not a
                 click, and neither should change what is selected. */
              if (from && Math.hypot(event.clientX - from.x, event.clientY - from.y) > 4) return;
              /* Only when the press actually landed on the ground: the
                 scroller itself, the slack around the plate, or the plate.
                 Anything inside the mockup is the mockup's business — and a
                 rule written the other way round, as a list of things to
                 ignore, was one selector away from swallowing the click that
                 selects a message. */
              const el = event.target;
              if (!(el instanceof Element)) return;
              const ground =
                el === event.currentTarget ||
                el.classList.contains("e-stage-pad") ||
                el.classList.contains("e-frame");
              if (!ground) return;
              setSelected(null);
            }}
          >
            <div className="e-stage-pad">
              <div
                className={`e-frame${phone ? " e-frame-phone" : ""}`}
                style={{
                  /* The phone is a device, not a narrow canvas: its width is the
                   iPhone's, and the width slider does not apply to it. */
                  width: phone ? PHONE_WIDTH : project.canvas.width,
                  /* A maximum, not a height. Below it the frame hugs its
                     content, so a three-message mockup is three messages tall
                     and not a tall box with a hole in it; past it the
                     conversation scrolls inside and this is the edge the
                     export stops at. A window has a bottom. */
                  maxHeight: phone ? PHONE_HEIGHT : project.canvas.height,
                  borderRadius: phone ? 54 : project.canvas.radius,
                  /* `zoom`, not `transform: scale()`. A transform paints the
                   element smaller and leaves its box the original size, so a
                   1180px canvas shrunk to fit a phone still laid out 1180px
                   wide and the scaled picture sat off to one side of it.
                   `zoom` scales the box too, so the frame centres and the
                   scroller measures what is actually on screen. The PNG export
                   is unaffected: it rasterises the surface inside this
                   element, with its own `zoom: 1`. */
                  zoom: shown,
                }}
              >
                <DiscordSurface
                  project={project}
                  selectedId={message?.id}
                  onSelect={pickOnCanvas}
                  innerRef={stage}
                  edit={edit}
                  scroller={scroller}
                />
              </div>
            </div>
          </div>

          {/* The documents behind the tool. They went out with the left
              column, which is the one thing in that column that could not go:
              they have to be on every screen. Bottom-left of the stage, out of
              the way of the island and of everything anybody came here to
              press, but always there. */}
          <nav className="e-legal e-no-export" aria-label="About this tool">
            <Link href="/terms">Terms</Link>
            <span aria-hidden="true">·</span>
            <Link href="/privacy">Privacy</Link>
            <span aria-hidden="true">·</span>
            <a href={SUPPORT_URL} target="_blank" rel="noreferrer">
              Support
            </a>
          </nav>

          {/* The editor is a chat now: you write a message and press Enter,
              and the thing you just made is the thing in front of you. */}
          <Composer
            project={project}
            author={author}
            tool={trayOpen ? "Extras" : panelOpen ? tab : null}
            channel={project.canvas.channel?.name}
            onPickAuthor={(id) => {
              setSendAs(id);
              if (message) patchMessage({ user: id });
            }}
            onEditAuthor={(id) => {
              /* The button says "Edit Gator", so it has to open Gator — it
                 opened the members list with whoever happened to be first
                 expanded, which is how you press edit on one person and get
                 another. */
              setFocusUser(id ?? author?.id ?? null);
              setSheetOpen("members");
            }}
            onAddAuthor={addUser}
            onSend={sendMessage}
            onAdd={addToMessage}
            /* Undo and redo are in the top bar on a laptop and in the island's
               own row on a phone, where the thumb is. Handed down rather than
               duplicated: one history, one pair of buttons, two places they
               can be drawn. */
            onUndo={undo}
            onRedo={redo}
            canUndo={past.length > 0}
            canRedo={future.length > 0}
            emojis={project.emojis}
            onTool={(id) => {
              /* Same rule as the buttons in the bar: with nothing selected
                 these are about the message being written, not about
                 whichever one was last touched. */
              if (!message) startMessage();
              if (id === "Extras") {
                setPanelOpen(false);
                setTrayOpen((open) => !open);
              } else {
                setTrayOpen(false);
                setPanelOpen((open) => !(open && tab === id));
                setTab(id);
              }
                      }}
          />

          {/* ------------------------------------------------- editors */}

          {/* Two surfaces, because the two kinds of editing are not alike. An
              embed or a container is a structure with a dozen fields, so it
              gets a panel that slides in beside the mockup and stays there
              while you work through it. Everything else a message can carry is
              a thing you either have or do not, so it gets a tray of tiles
              that rises from the island, the way the client's own sticker and
              GIF pickers do. */}
          <aside
            ref={dock}
            className="c-panel e-no-export"
            data-open={panelOpen ? "true" : "false"}
            aria-hidden={!panelOpen}
            aria-label={`${tab} editor`}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.stopPropagation();
                setPanelOpen(false);
              }
            }}
          >
            <header className="c-panel-head">
              <nav className="c-dock-tabs" aria-label="Editor">
                {["Embeds", "Components"].map((t) => (
                  <button
                    key={t}
                    type="button"
                    className="c-dock-tab"
                    data-on={tab === t ? "true" : "false"}
                    onClick={() => setTab(t)}
                  >
                    {t}
                    {t === "Embeds" && message?.embeds?.length ? (
                      <span className="e-tab-count">{message.embeds.length}</span>
                    ) : null}
                    {t === "Components" && message?.components?.length ? (
                      <span className="e-tab-count">{message.components.length}</span>
                    ) : null}
                  </button>
                ))}
              </nav>
              <span className="c-dock-spacer" />
              <Hint label="Close" keys="Esc">
                <button
                  type="button"
                  className="e-icon-btn"
                  onClick={() => setPanelOpen(false)}
                  aria-label="Close the editor panel"
                  tabIndex={panelOpen ? undefined : -1}
                >
                  <IconX size={16} />
                </button>
              </Hint>
            </header>
            <div className="c-panel-body" key={tab}>
              {message ? (
                <Inspector
                  tab={tab === "Embeds" || tab === "Components" ? tab : "Embeds"}
                  message={message}
                  project={project}
                  commit={commit}
                  patch={patchMessage}
                  onManageMembers={() => setSheetOpen("members")}
                  onError={fail}
                  onNotify={notify}
                />
              ) : null}
            </div>
          </aside>

          {trayOpen && message ? (
            <section
              className="c-tray e-no-export"
              aria-label="Everything this message can carry"
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.stopPropagation();
                  setTrayOpen(false);
                }
              }}
            >
              <header className="c-tray-head">
                <h2>Add to this message</h2>
                <span className="c-dock-spacer" />
                <Hint label="Copy this message&rsquo;s payload">
                  <button type="button" className="e-btn e-btn-quiet" onClick={copyJson}>
                    <IconCopy size={14} /> Copy JSON
                  </button>
                </Hint>
                <Hint label="Close" keys="Esc">
                  <button
                    type="button"
                    className="e-icon-btn"
                    onClick={() => setTrayOpen(false)}
                    aria-label="Close the tray"
                  >
                    <IconX size={16} />
                  </button>
                </Hint>
              </header>
              {/* Everything about this message that is not its words: what it
                  is, how it is drawn, what it carries, and the payload it adds
                  up to. All of it in one board, because "where do I turn on
                  the pinned flag" and "where do I add a reaction" are the same
                  question asked twice. */}
              <div className="c-tray-body">
                {["Content", "Extras", "JSON"].map((t) => (
                  <Inspector
                    key={t}
                    tab={t}
                    message={message}
                    project={project}
                    commit={commit}
                    patch={patchMessage}
                    onManageMembers={() => setSheetOpen("members")}
                    onError={fail}
                    onNotify={notify}
                  />
                ))}
              </div>
            </section>
          ) : null}

        </main>
      </div>

      {/* The four things that are not the message you are editing. Each is a
          sheet over the editor rather than a panel that replaces it, so what
          you were working on is still there when you close it. */}
      <Sheet
        open={sheetOpen === "templates"}
        onClose={() => setSheetOpen(null)}
        title="Start from something"
        subtitle="Each one is built to show a different surface. Opening one replaces what is on the canvas."
      >
        <ul className="e-template-grid">
          {TEMPLATES.map((template) => (
            <li key={template.id}>
              <button
                type="button"
                className="e-template"
                onClick={() => {
                  load(template.build(), ID.mockup());
      setLinkedId(null);
                  setSheetOpen(null);
                  notify(`Opened \u201c${template.name}\u201d.`);
                }}
              >
                <span className="e-template-name">{template.name}</span>
                <span className="e-template-hint">{template.hint}</span>
              </button>
            </li>
          ))}
          <li>
            <button
              type="button"
              className="e-template"
              onClick={() => {
                load(blankProject(), ID.mockup());
                setLinkedId(null);
                setSheetOpen(null);
              }}
            >
              <span className="e-template-name">Empty</span>
              <span className="e-template-hint">
                One message and two members. Build it up from there.
              </span>
            </button>
          </li>
        </ul>
      </Sheet>

      <Sheet
        open={sheetOpen === "members"}
        onClose={() => setSheetOpen(null)}
        title="Members"
        subtitle="Everyone who can send a message in this mockup. Pick who sent a message on the message itself."
        wide
      >
        <UsersPanel project={project} commit={commit} onError={fail} focus={focusUser} pick={avatarFor} />
      </Sheet>

      <Sheet
        open={sheetOpen === "appearance"}
        onClose={() => {
          setSheetField(null);
          setSheetOpen(null);
        }}
        title="Appearance"
        subtitle="Which client, which of Discord’s four themes, and how much of the window is drawn around the message."
      >
        <CanvasPanel
          project={project}
          commit={commit}
          onError={fail}
          focus={sheetOpen === "appearance" ? sheetField : null}
        />
      </Sheet>

      <Sheet
        open={sheetOpen === "backups"}
        onClose={() => setSheetOpen(null)}
        title="Backups"
        subtitle="This browser keeps the working copy and your saved backups. Signing in keeps a copy that survives a cleared browser."
        wide
      >
        <BackupsPanel
          project={project}
          slug={slug}
          linkedId={linkedId}
          onLink={setLinkedId}
          user={user}
          canSignIn={canSignIn}
          savedLocally={savedLocally}
          onLoad={(next, nextSlug, action) => {
            if (action === "import") importer.current?.click();
            else if (action === "export") exportProject(project);
            else {
              load(next, nextSlug);
              setSheetOpen(null);
            }
          }}
          onError={fail}
          onNotify={notify}
        />
      </Sheet>

      {/* What the phone header could not hold.
          Not a menu of everything — the actions that were on the bar, in the
          order they were in, plus the two documents that used to sit in the
          corner of the stage where the island now is. */}
      <Sheet
        open={sheetOpen === "more"}
        onClose={() => setSheetOpen(null)}
        title="More"
        subtitle="Templates, sharing and the documents behind this tool"
      >
        <div className="e-more">
          <button
            type="button"
            className="e-more-row"
            onClick={() => setSheetOpen("templates")}
          >
            <IconStack2 size={18} />
            <span>
              <b>Templates</b>
              <small>Start from a mockup that is already built</small>
            </span>
          </button>
          <button
            type="button"
            className="e-more-row"
            onClick={() => {
              setSheetOpen(null);
              doShare();
            }}
          >
            <IconShare2 size={18} />
            <span>
              <b>Share a link</b>
              <small>A link that carries the whole mockup</small>
            </span>
          </button>
          {animated ? (
            <button
              type="button"
              className="e-more-row"
              disabled={exporting}
              onClick={() => {
                setSheetOpen(null);
                doExportGif();
              }}
            >
              <IconGif size={18} />
              <span>
                <b>Export an animated GIF</b>
                <small>Keeps the animation moving instead of freezing it</small>
              </span>
            </button>
          ) : null}
          <button
            type="button"
            className="e-more-row"
            onClick={() => setSheetOpen("backups")}
          >
            <IconCloud size={18} />
            <span>
              <b>Backups</b>
              <small>Saved copies, in this browser and in the cloud</small>
            </span>
          </button>
          <button
            type="button"
            className="e-more-row"
            onClick={() => setSheetOpen("appearance")}
          >
            <IconPalette size={18} />
            <span>
              <b>Appearance</b>
              <small>Background, size, density and the client's notices</small>
            </span>
          </button>
          {/* The site's own appearance, which is not the mockup's. It is in the
              header on a laptop and there is no room for it on a phone, so it
              is here — as itself, with a label, rather than as a moon nobody
              can find. */}
          <div className="e-more-theme">
            <span>
              <b>This tool's appearance</b>
              <small>Light or dark, separate from the mockup's theme</small>
            </span>
            <ThemeToggle />
          </div>
          <nav className="e-more-legal" aria-label="About this tool">
            <Link href="/terms">Terms</Link>
            <span aria-hidden="true">·</span>
            <Link href="/privacy">Privacy</Link>
            <span aria-hidden="true">·</span>
            <a href={SUPPORT_URL} target="_blank" rel="noreferrer">
              Support
            </a>
          </nav>
        </div>
      </Sheet>

      <Palette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        actions={[
          { label: "Add a message", run: addMessage },
          { label: "Duplicate this message", run: duplicateMessage },
          { label: "Delete this message", run: removeMessage },
          { label: "Export a PNG", run: doExportPng },
          { label: "Export an animated GIF", run: doExportGif },
          { label: "Copy a share link", run: doShare },
          { label: "Copy the message JSON", run: copyJson },
          {
            label: "Download the project file",
            run: () => exportProject(project),
          },
          { label: "Open templates", run: () => setSheetOpen("templates") },
          { label: "Undo", run: undo },
          { label: "Redo", run: redo },
          ...["light", "ash", "dark", "onyx"].map((theme) => ({
            label: `Discord theme: ${theme}`,
            run: () =>
              commit((p) => ({ ...p, canvas: { ...p.canvas, theme } })),
          })),
          {
            label: `Switch to the ${project.canvas.platform === "mobile" ? "desktop" : "phone"} client`,
            run: () =>
              commit((p) => ({
                ...p,
                canvas: {
                  ...p.canvas,
                  platform:
                    p.canvas.platform === "mobile" ? "desktop" : "mobile",
                },
              })),
          },
          { label: "Members", run: () => setSheetOpen("members") },
          { label: "Appearance", run: () => setSheetOpen("appearance") },
          { label: "Backups", run: () => setSheetOpen("backups") },
        ]}
      />

      {toast ? (
        <div
          className="e-toast e-no-export"
          data-tone={toast.tone}
          key={toast.key}
          role="status"
        >
          {toast.text}
        </div>
      ) : null}
    </div>
  );
}
