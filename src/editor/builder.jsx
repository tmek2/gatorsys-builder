"use client";

/* The builder.
 *
 * Three columns on a desktop: the outline of what is in the mockup, the
 * mockup itself, and the inspector for whatever is selected. On a phone the
 * same three become one column with a bar at the bottom that switches between
 * them, because a three-column tool on a 390px screen is three unusable
 * columns rather than one usable one.
 *
 * The project is one piece of state and every change goes through `commit`,
 * which is also what pushes onto the undo stack. Nothing writes to the project
 * any other way — that is the whole reason undo can be four lines.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  IconArrowBackUp,
  IconArrowDown,
  IconArrowUp,
  IconArrowForwardUp,
  IconCheck,
  IconChevronDown,
  IconCloud,
  IconCopy,
  IconDeviceFloppy,
  IconDownload,
  IconFileText,
  IconGripVertical,
  IconLayoutList,
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
import { Blob, useBlob } from "@/gator/blob";
import { DiscordSurface } from "@/discord/surface";
import { avatarUrl } from "@/lib/avatars";
import { PHONE_WIDTH, blankProject, newMessage, newUser, reid, uid } from "@/lib/model";
import { nextStamp, restamp } from "@/lib/clock";
import { TEMPLATES } from "@/lib/templates";
import { SUPPORT_URL } from "@/lib/site";
import { loadValue, saveValue } from "@/lib/storage";
import { migrate, validProject } from "@/lib/validate";
import { Hint } from "./fields";
import { Composer } from "./composer";
import { Inspector, TABS } from "./inspector";
import { CanvasPanel, EmojiPanel, UsersPanel } from "./panels";
import { BackupsPanel } from "./backups-panel";
import {
  exportMessageJson,
  exportPng,
  exportProject,
  messageJson,
  readShareLink,
  shareLink,
} from "./export";
import { AUTO_EVERY_MS, takeSnapshot } from "@/lib/backups";
import { forkProject } from "@/lib/fork";
import { ID } from "@/lib/ids";
import { Palette } from "./palette";
import { useCanvasGestures } from "./use-canvas";
import { Sheet } from "./sheet";
import { useReorder } from "./use-reorder";
import "./editor.css";
import "./composer.css";

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
  const [tab, setTab] = useState("Content");
  const [selected, setSelected] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [toast, setToast] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [savedLocally, setSavedLocally] = useState(true);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [pane, setPane] = useState("preview");
  const [exporting, setExporting] = useState(false);

  const stage = useRef(null);
  const importer = useRef(null);
  const scroller = useRef(null);
  const outline = useRef(null);
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

  /* An automatic snapshot, on a timer, and only when something has actually
     changed since the last one. A snapshot per interval regardless would fill
     the list with twelve copies of a mockup nobody touched. */
  const snapshotted = useRef("");
  useEffect(() => {
    if (!loaded) return undefined;
    const tick = window.setInterval(() => {
      const stamp = JSON.stringify(project);
      if (stamp === snapshotted.current) return;
      snapshotted.current = stamp;
      takeSnapshot(project).catch(() => {
        // A full disk should cost the snapshot, not the session.
      });
    }, AUTO_EVERY_MS);
    return () => window.clearInterval(tick);
  }, [project, loaded]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(null), 4200);
    return () => window.clearTimeout(timer);
  }, [toast]);

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

  const message = useMemo(
    () =>
      project.messages.find((m) => m.id === selected) ??
      project.messages[0] ??
      null,
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
      stamp: (id, timestamp) =>
        commit(
          (p) => ({ ...p, messages: p.messages.map((m) => (m.id === id ? { ...m, timestamp } : m)) }),
          `m:${id}:timestamp`,
        ),
      channel: (name) =>
        commit((p) => ({ ...p, canvas: { ...p.canvas, channel: { ...p.canvas.channel, name } } }), "channel:name"),
      topic: (topic) =>
        commit((p) => ({ ...p, canvas: { ...p.canvas, channel: { ...p.canvas.channel, topic } } }), "channel:topic"),
    }),
    [commit],
  );

  /* Whether the drawer over the canvas is showing. Picking a tool opens it on
     that tab; pressing the tool that is already showing closes it again, which
     is the behaviour of every dock somebody has used before. */
  const [dockOpen, setDockOpen] = useState(false);
  const dock = useRef(null);

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
    setPane("inspector");
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
      const floor = chrome === "full" ? 1180 : chrome === "chat" ? 640 : 0;
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

  const rows = useReorder({ count: project.messages.length, onMove: reorder });
  /* The same travelling indicator the site's header has, twice: on the rail
     and on the tabs. One shape moving reads as one control; five backgrounds
     fading in and out read as five. */
  const tabBlob = useBlob(tab);

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
        setPaletteOpen(false);
        setSheetOpen(null);
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
  }, [addMessage, duplicateMessage, redo, undo]);

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
          <Hint label={`Export a PNG at ${project.canvas.scale}×`}>
            <button
              type="button"
              className="e-btn e-btn-solid"
              onClick={doExportPng}
              disabled={exporting}
            >
              <IconPhotoDown size={15} /> {exporting ? "Exporting…" : "PNG"}
            </button>
          </Hint>
        </div>
      </SiteNav>

      <div className="e-body" data-pane={pane}>
        {/* ------------------------------------------------------ left */}
        <aside className="e-left">
          {/* The left column is the message list and nothing else. It used to
              carry a five-way rail whose other four entries swapped out the
              inspector, which made "edit this message" and "edit the members"
              mutually exclusive for no reason. */}
          <header className="e-left-head">
            <h2>Messages</h2>
            <span className="e-left-count">{project.messages.length}</span>
          </header>

          {true ? (
            <div className="e-outline">
              <ol className="e-outline-list" ref={outline}>
                {project.messages.map((m, i) => {
                  const author = project.users.find((u) => u.id === m.user);
                  const summary =
                    m.kind === "system"
                      ? `${m.systemType ?? "system"} notice`
                      : m.content?.split("\n")[0].slice(0, 46) ||
                        (m.embeds?.length
                          ? `${m.embeds.length} embed${m.embeds.length > 1 ? "s" : ""}`
                          : "") ||
                        (m.components?.length ? "Components" : "") ||
                        "Empty message";
                  const held = rows.drag?.index === i && rows.drag.held;
                  const landing = rows.drag?.index === i && rows.drag.landing;
                  const shift = rows.offsetFor(i, 46);
                  return (
                    <li
                      key={m.id}
                      data-row
                      className="e-outline-item"
                      data-held={held ? "true" : "false"}
                      data-landing={landing ? "true" : "false"}
                      /* The held row moves with the pointer and the rest slide
                         one slot out of its way. Both are transforms, so the
                         list never reflows while it is being rearranged. */
                      style={{
                        transform: shift ? `translateY(${shift}px)` : undefined,
                        /* Only the displaced rows ease. The held one is glued
                           to the pointer, and easing that is putting the row a
                           few pixels behind the finger on purpose. */
                        transition:
                          held || landing
                            ? "none"
                            : "transform 220ms cubic-bezier(0.16, 1, 0.3, 1)",
                        zIndex: held || landing ? 2 : undefined,
                      }}
                    >
                      <button
                        type="button"
                        className="e-outline-row"
                        data-on={message?.id === m.id ? "true" : "false"}
                        onClick={() => {
                          if (rows.drag) return;
                          setSelected(m.id);
                          setPane("inspector");
                        }}
                        {...rows.handlers(i, outline)}
                      >
                        {/* The handle. A span rather than a button, because a
                            button inside a button is invalid markup — it
                            carries pointer handlers only, and the arrow
                            buttons below are the keyboard's way to reorder.
                            On a touch screen it is the only way in, since
                            dragging the row itself is how the list scrolls. */}
                        <span
                          className="e-grip"
                          aria-hidden="true"
                          {...rows.gripHandlers(i, outline)}
                        >
                          <IconGripVertical size={14} />
                        </span>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          className="e-outline-face"
                          src={author?.avatar}
                          alt=""
                          draggable={false}
                        />
                        <span className="e-outline-copy">
                          <span className="e-outline-name">
                            {author?.name ?? "Unknown"}
                          </span>
                          <span className="e-outline-text">{summary}</span>
                        </span>
                        <span className="e-outline-index">{i + 1}</span>
                      </button>
                    </li>
                  );
                })}
              </ol>

              <div className="e-outline-actions">
                <Hint label="Add another message to the mockup" keys="⌘↵">
                  <button
                    type="button"
                    className="e-btn e-btn-dashed"
                    onClick={addMessage}
                  >
                    <IconPlus size={15} /> Add a message
                  </button>
                </Hint>
                {/* Four bare glyphs at the foot of a column do not say what
                    they act on, and one of them deletes something. Naming the
                    row costs a line and answers it. */}
                <div
                  className="e-outline-tools"
                  role="group"
                  aria-label="Selected message"
                >
                  <span className="e-outline-tools-label">Selected</span>
                  <Hint label="Move up">
                    <button
                      type="button"
                      className="e-icon-btn"
                      onClick={() => moveMessage(-1)}
                      aria-label="Move up"
                    >
                      <IconArrowUp size={15} />
                    </button>
                  </Hint>
                  <Hint label="Move down">
                    <button
                      type="button"
                      className="e-icon-btn"
                      onClick={() => moveMessage(1)}
                      aria-label="Move down"
                    >
                      <IconArrowDown size={15} />
                    </button>
                  </Hint>
                  <Hint label="Duplicate" keys="⌘D">
                    <button
                      type="button"
                      className="e-icon-btn"
                      onClick={duplicateMessage}
                      aria-label="Duplicate"
                    >
                      <IconCopy size={15} />
                    </button>
                  </Hint>
                  <Hint label="Delete this message">
                    <button
                      type="button"
                      className="e-icon-btn"
                      onClick={removeMessage}
                      aria-label="Delete"
                    >
                      <IconTrash size={15} />
                    </button>
                  </Hint>
                </div>
              </div>
            </div>
          ) : null}

          <div className="e-left-foot">
            {/* The header drops these two below 720px for room, and the
                command palette that also carries them wants a keyboard. On a
                phone this pane is where they live instead — drawn only at the
                widths where the header is not showing them. */}
            <div className="e-left-narrow">
              <button
                type="button"
                className="e-btn e-btn-quiet"
                onClick={() => setSheetOpen("templates")}
              >
                <IconStack2 size={15} /> Templates
              </button>
              <button
                type="button"
                className="e-btn e-btn-quiet"
                onClick={doShare}
              >
                <IconShare2 size={15} /> Share a link
              </button>
              <button
                type="button"
                className="e-btn e-btn-quiet"
                onClick={() => setPaletteOpen(true)}
              >
                <IconSettings size={15} /> All commands
              </button>
            </div>
            <button
              type="button"
              className="e-btn e-btn-quiet"
              onClick={() => importer.current?.click()}
            >
              <IconDownload size={15} style={{ transform: "rotate(180deg)" }} />{" "}
              Import a project
            </button>
            <button
              type="button"
              className="e-btn e-btn-quiet"
              onClick={() => exportProject(project)}
            >
              <IconFileText size={15} /> Download the project
            </button>
            <input
              ref={importer}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={importFile}
            />

            {/* The documents behind the tool. Quiet, at the bottom, out of the
                way of everything anybody came here to press — but present on
                every screen, which is the point of them. */}
            <nav className="e-legal" aria-label="About this tool">
              <Link href="/terms">Terms</Link>
              <span aria-hidden="true">·</span>
              <Link href="/privacy">Privacy</Link>
              <span aria-hidden="true">·</span>
              <a href={SUPPORT_URL} target="_blank" rel="noreferrer">
                Support
              </a>
            </nav>
          </div>
        </aside>

        {/* --------------------------------------------------- preview */}
        <main className="e-stage" data-dock={dockOpen && message ? "true" : "false"}>
          <div className="e-stage-bar e-no-export">
            {/* This said "Desktop · Ash" and did nothing, while the settings
                it described lived behind a rail item called "Canvas". It is
                the button now: the label you read is the thing you press. */}
            <Hint label="Client, appearance, background and how much of Discord is drawn">
              <button
                type="button"
                className="e-stage-appearance"
                onClick={() => setSheetOpen("appearance")}
              >
                <IconPalette size={15} stroke={1.8} />
                <span>
                  {project.canvas.platform === "mobile" ? "Phone" : "Desktop"} ·{" "}
                  {project.canvas.theme}
                </span>
                <IconChevronDown size={14} stroke={2} />
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
          >
            <div className="e-stage-pad">
              <div
                className={`e-frame${phone ? " e-frame-phone" : ""}`}
                style={{
                  /* The phone is a device, not a narrow canvas: its width is the
                   iPhone's, and the width slider does not apply to it. */
                  width: phone ? PHONE_WIDTH : project.canvas.width,
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
                />
              </div>
            </div>
          </div>

          {/* The editor is a chat now: you write a message and press Enter,
              and the thing you just made is the thing in front of you. */}
          <Composer
            project={project}
            author={author}
            tool={dockOpen ? tab : null}
            channel={project.canvas.channel?.name}
            onPickAuthor={(id) => {
              setSendAs(id);
              if (message) patchMessage({ user: id });
            }}
            onEditAuthor={() => setSheetOpen("members")}
            onAddAuthor={addUser}
            onSend={sendMessage}
            onTool={(id) => {
              setDockOpen((open) => !(open && tab === id));
              setTab(id);
              setPane("inspector");
            }}
          />

          {/* --------------------------------------------------- dock */}

          {/* What used to be a permanent 380px column on the right. It is a
              drawer over the canvas now, opened by the rail on the island and
              closed by pressing the same button again or Escape — so the
              mockup has the whole window when you are looking at it, and the
              controls are one press away when you are not. */}
          {message && dockOpen ? (
            <section
              ref={dock}
              className="c-dock e-no-export"
              aria-label={`${tab} settings`}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.stopPropagation();
                  setDockOpen(false);
                }
              }}
            >
              <header className="c-dock-head">
                <nav className="c-dock-tabs" aria-label="Message parts">
                  {TABS.map((t) => (
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
                <Hint label="Copy this message&rsquo;s payload">
                  <button type="button" className="e-btn e-btn-quiet" onClick={copyJson}>
                    <IconCopy size={14} /> Copy JSON
                  </button>
                </Hint>
                <Hint label="Close" keys="Esc">
                  <button
                    type="button"
                    className="e-icon-btn"
                    onClick={() => setDockOpen(false)}
                    aria-label="Close the editor panel"
                  >
                    <IconX size={16} />
                  </button>
                </Hint>
              </header>

              <div className="c-dock-body" key={tab}>
                <Inspector
                  tab={tab}
                  message={message}
                  project={project}
                  commit={commit}
                  patch={patchMessage}
                  onManageMembers={() => setSheetOpen("members")}
                  onError={fail}
                  onNotify={notify}
                />
              </div>

              <footer className="c-dock-foot">
                <button
                  type="button"
                  className="e-btn e-btn-quiet"
                  onClick={() => exportMessageJson(message, project.name)}
                >
                  <IconDownload size={14} /> Download the message JSON
                </button>
              </footer>
            </section>
          ) : null}
        </main>
      </div>

      {/* The phone's pane switcher. Below 1080px the three columns are one, and
          this is what moves between them. */}
      <nav className="e-panes e-no-export" aria-label="Panes">
        {[
          { id: "outline", label: "Outline", Icon: IconLayoutList },
          { id: "preview", label: "Preview", Icon: IconPhotoDown },
          { id: "inspector", label: "Edit", Icon: IconSettings },
        ].map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            className="e-pane"
            data-on={pane === id ? "true" : "false"}
            onClick={() => setPane(id)}
          >
            <Icon size={18} stroke={1.8} />
            {label}
          </button>
        ))}
      </nav>

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
        <UsersPanel project={project} commit={commit} onError={fail} />
      </Sheet>

      <Sheet
        open={sheetOpen === "appearance"}
        onClose={() => setSheetOpen(null)}
        title="Appearance"
        subtitle="Which client, which of Discord’s four themes, and how much of the window is drawn around the message."
      >
        <CanvasPanel
          project={project}
          commit={commit}
          onError={fail}
          onChrome={setChrome}
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

      <Palette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        actions={[
          { label: "Add a message", run: addMessage },
          { label: "Duplicate this message", run: duplicateMessage },
          { label: "Delete this message", run: removeMessage },
          { label: "Export a PNG", run: doExportPng },
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
