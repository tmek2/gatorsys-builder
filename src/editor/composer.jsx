"use client";

/* The composer island.
 *
 * The editor used to be two panels with the mockup squeezed between them, and
 * making a message meant finding the right box in the right panel. This is the
 * other way round: it is Discord's own composer, floating over the canvas, and
 * you make a message by typing one and pressing Enter.
 *
 * Three zones, and the split is deliberate. Inside the bar are the client's own
 * buttons, because the bar is a picture of Discord's. Outside it, on the left,
 * is everything about who you are sending as. Outside it, on the right, is
 * everything about what the message contains. Nothing that belongs to the
 * editor is allowed inside the bar, and nothing that belongs to Discord is
 * allowed outside it — which is what keeps the island readable at a glance
 * rather than becoming a second toolbar.
 */

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  IconArrowBackUp,
  IconArrowForwardUp,
  IconChevronDown,
  IconLayoutGrid,
  IconPencil,
  IconPlus,
  IconSparkles,
  IconSquaresFilled,
} from "@tabler/icons-react";
import { Blob, useBlob } from "@/gator/blob";
import { Icon } from "@/discord/icon";
import { Hint } from "./fields";
import { EmojiInsert } from "./emoji-picker";
import { fitWithin, inlineRemote } from "@/lib/image";
import { projectImages } from "@/lib/model";
import { ALL_EMOJI } from "@/lib/emoji-data";
import { twemojiUrl } from "@/discord/emoji";
import { safeMedia } from "@/lib/urls";

/* What the right rail opens. The labels are the words somebody would use for
   the thing they want to add, not the names of our tabs. */
export const TOOLS = [
  { id: "Embeds", label: "Embeds", hint: "The cards a bot posts under a message", Glyph: IconLayoutGrid },
  { id: "Components", label: "Components", hint: "Buttons, menus, containers and galleries", Glyph: IconSquaresFilled },
  { id: "Extras", label: "Extras", hint: "Reactions, attachments, polls, the profile card and the rest", Glyph: IconSparkles },
];

/* One of the client's own composer buttons, doing the thing it is a picture
 * of. Without `what` it is a plain button — the gift takes no file. With it,
 * pressing opens a picker.
 *
 * And a picker means a picker. The first version offered a file dialog and a
 * URL field and nothing else, which is not what any of Discord's are: theirs
 * open on a grid you choose from and keep the upload for the case the grid
 * cannot answer. So this one opens on a grid too — Discord's own sticker
 * packs, or KLIPY's GIFs — and behind those the grid is
 * built from what this tool actually has — every picture already in the
 * mockup, and the emoji library at sticker size, both searchable.
 */
/* What each picker will take.
 *
 * Not `image/*` everywhere. Pressing Upload in the GIF picker and being shown
 * every JPEG on the machine is the picker asking for something it cannot use —
 * and then quietly accepting it, which is worse. Each kind names the formats
 * it can actually draw. */
const ACCEPTS = {
  gif: "image/gif,image/webp,video/mp4,video/webm",
  /* Discord's stickers are PNG, APNG and Lottie; the first two are the ones a
     picture of a chat can carry, and a webp animates the same way an APNG does. */
  sticker: "image/png,image/apng,image/webp,image/gif",
  image: "image/png,image/jpeg,image/gif,image/webp,image/avif,video/mp4,video/webm",
};

function MediaPick({ icon, label, hint, what, kind, accept, size = 20, project, onPick }) {
  const takes = accept ?? ACCEPTS[kind] ?? ACCEPTS.image;
  const [open, setOpen] = useState(false);
  /* A file being dragged over the button. The button is drawn as a dashed
     plate, which is the universal picture of "drop something here" — so it had
     better be one. */
  const [over, setOver] = useState(false);
  /* Open on the real thing when there is one — Discord's sticker packs, or
     KLIPY — and on what is already in the mockup otherwise. */
  const [tab, setTab] = useState(kind === "sticker" ? "packs" : kind === "gif" ? "gifs" : "mockup");
  /* Fetched once, when the tab that needs it is first looked at. */
  const [remote, setRemote] = useState(null);
  /* The category tiles, and how far into the results we have gone. */
  const [categories, setCategories] = useState(null);
  const [page, setPage] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [term, setTerm] = useState("");
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const box = useRef(null);
  const file = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const away = (event) => {
      if (!box.current?.contains(event.target)) setOpen(false);
    };
    const key = (event) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", key);
    };
  }, [open]);

  /* Discord's own sticker packs, and KLIPY for the GIFs, both through this
     app's own routes: the upstreams send no CORS header and a key must not
     reach the browser. Loaded when the tab is opened rather than on mount, so
     a picker somebody only wanted for an upload costs no request. */
  useEffect(() => {
    if (!open) return undefined;
    if (tab !== "packs" && tab !== "gifs") return undefined;
    let alive = true;
    const url = tab === "packs" ? "/api/stickers" : `/api/gifs?q=${encodeURIComponent(term.trim())}`;
    setRemote((r) => (r?.for === tab && tab === "packs" ? r : null));
    setPage(1);
    fetch(url)
      .then((r) => r.json())
      .then((body) => alive && setRemote({ for: tab, ...body }))
      .catch(() => alive && setRemote({ for: tab, unavailable: true }));
    return () => {
      alive = false;
    };
    /* The GIF tab re-fetches as the search changes; the sticker packs do not
       depend on it. */
  }, [open, tab, kind === "gif" ? term : ""]);

  /* The categories, which are the other half of the client's GIF picker: the
     grid you are given before you have typed anything. Fetched once per
     opening, alongside the trending grid rather than instead of it. */
  useEffect(() => {
    if (!open || tab !== "gifs" || categories) return undefined;
    let alive = true;
    fetch("/api/gifs?categories=1")
      .then((r) => r.json())
      .then((body) => alive && setCategories(body.categories ?? []))
      .catch(() => alive && setCategories([]));
    return () => {
      alive = false;
    };
  }, [open, tab, categories]);

  /* One more page of the same search, appended rather than replacing — the
     client's picker keeps going as you scroll, and a grid of twenty-four is
     three rows. */
  const more = async () => {
    if (loadingMore || !remote?.hasMore) return;
    setLoadingMore(true);
    try {
      const next = page + 1;
      const body = await fetch(
        `/api/gifs?page=${next}&q=${encodeURIComponent(term.trim())}`,
      ).then((r) => r.json());
      setRemote((r) => ({ ...r, gifs: [...(r?.gifs ?? []), ...(body.gifs ?? [])], hasMore: body.hasMore }));
      setPage(next);
    } finally {
      setLoadingMore(false);
    }
  };

  const mine = useMemo(
    () => (project ? projectImages(project) : []),
    [project],
  );
  const shownMine = useMemo(() => {
    const q = term.trim().toLowerCase();
    return q ? mine.filter((m) => (m.label || "").toLowerCase().includes(q)) : mine;
  }, [mine, term]);
  const shownEmoji = useMemo(() => {
    const q = term.trim().toLowerCase();
    /* `keywords` is a space-separated string, not a list — the picker's own
       search reads it the same way. */
    const all = q
      ? ALL_EMOJI.filter((e) => e.keywords.includes(q) || e.char === term.trim())
      : ALL_EMOJI;
    return all.slice(0, 220);
  }, [term]);

  const choose = (src) => {
    onPick(src);
    setOpen(false);
    setTerm("");
  };

  /* A picture that lives on somebody else's server — a KLIPY GIF, a pasted
     link — is fetched and kept rather than linked. A linked one taints the
     canvas the export rasterises through, and the export fails: a GIF picker
     whose GIFs cannot be exported is not a GIF picker. The popover closes on
     the press rather than waiting for the bytes, so picking still feels like
     picking; the picture arrives a moment later. */
  const chooseRemote = async (src) => {
    setBusy(true);
    try {
      choose(await inlineRemote(src));
    } finally {
      setBusy(false);
    }
  };

  /* One way in for a file, whether it was chosen, dropped or pasted. */
  const take = async (chosen) => {
    if (!chosen) return;
    setBusy(true);
    try {
      choose(await fitWithin(chosen));
    } finally {
      setBusy(false);
    }
  };

  if (!what) {
    return (
      <Hint label={hint}>
        <button type="button" className="c-bar-btn" onClick={() => onPick()} aria-label={label}>
          <Icon name={icon} size={size} />
        </button>
      </Hint>
    );
  }

  /* Sticker art is what the emoji library is good for; a still emoji is not a
     GIF and offering it as one would be a lie. */
  const tabs = [
    ...(kind === "sticker" ? [{ id: "packs", label: "Stickers" }] : []),
    ...(kind === "gif" ? [{ id: "gifs", label: "GIFs" }] : []),
    { id: "mockup", label: "In this mockup" },
    ...(kind === "sticker" ? [{ id: "emoji", label: "Emoji" }] : []),
    { id: "add", label: "Upload or link" },
  ];

  return (
    <span className="c-pick" ref={box}>
      <Hint label={hint}>
        <button
          type="button"
          className="c-bar-btn"
          data-on={open ? "true" : "false"}
          aria-label={label}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <Icon name={icon} size={size} />
        </button>
      </Hint>

      {open ? (
        <div className="c-pick-pop" role="dialog" aria-label={`Choose ${what}`}>
          <nav className="c-pick-tabs" role="tablist">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                data-on={tab === t.id ? "true" : "false"}
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </nav>

          {tab === "add" ? (
            <>
              <input
                ref={file}
                type="file"
                accept={takes}
                hidden
                onChange={(event) => {
                  const chosen = event.target.files?.[0];
                  event.target.value = "";
                  take(chosen);
                }}
              />
              {/* Dropped, pasted, or chosen. It has always been drawn as a
                  dashed plate — the picture every interface uses for "drop it
                  here" — and until now dropping a file on it did nothing at
                  all except make the browser navigate away to the file. */}
              <button
                type="button"
                className="c-pick-file"
                data-over={over ? "true" : "false"}
                disabled={busy}
                onClick={() => file.current?.click()}
                onDragOver={(event) => {
                  event.preventDefault();
                  setOver(true);
                }}
                onDragEnter={(event) => {
                  event.preventDefault();
                  setOver(true);
                }}
                onDragLeave={() => setOver(false)}
                onDrop={(event) => {
                  event.preventDefault();
                  setOver(false);
                  take(event.dataTransfer?.files?.[0]);
                }}
                onPaste={(event) => {
                  const item = [...(event.clipboardData?.items ?? [])].find((i) => i.kind === "file");
                  if (item) take(item.getAsFile());
                }}
              >
                <Icon name="upload" size={16} />
                {busy ? "Reading…" : over ? `Drop ${what} here` : `Choose ${what}`}
              </button>
              <span className="c-pick-or">or paste a link</span>
              <input
                className="c-pick-link"
                value={link}
                placeholder="https://…"
                aria-label={`Link to ${what}`}
                onChange={(event) => setLink(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== "Enter") return;
                  event.preventDefault();
                  /* Refused rather than drawn: a javascript: or data:text/html
                     source in a mockup is somebody else's script inside it. */
                  if (safeMedia(link)) {
                    chooseRemote(link);
                    setLink("");
                  }
                }}
              />
            </>
          ) : (
            <>
              <input
                className="c-pick-search"
                value={term}
                placeholder="Search"
                aria-label="Search"
                onChange={(event) => setTerm(event.target.value)}
              />
              {/* One scrolling body, and only one.
                  Every pack used to bring its own scrolling grid and the panel
                  itself had no ceiling, so ten packs made a popover thousands
                  of pixels tall that ran off the top of the window. And the
                  grid for the other tabs was drawn underneath all of it: it
                  was marked `hidden`, which a stylesheet saying `display: grid`
                  quietly overrules. Nothing is hidden here — what is not the
                  current tab is not rendered. */}
              <div className="c-pick-body">
                {tab === "packs" || tab === "gifs" ? (
                  remote?.for !== tab ? (
                    <p className="c-pick-empty">Loading…</p>
                  ) : remote.unconfigured ? (
                    <p className="c-pick-empty">
                      GIFs come from KLIPY, and this deployment has no KLIPY key set.
                      The other tabs still work.
                    </p>
                  ) : remote.unavailable ? (
                    <p className="c-pick-empty">
                      Could not reach {tab === "packs" ? "Discord" : "KLIPY"} just now.
                    </p>
                  ) : tab === "gifs" ? (
                    <>
                      {/* The categories, before you have typed anything —
                          which is what the client shows first. Pressing one
                          searches it, so they are a way in rather than a
                          decoration. */}
                      {!term.trim() && categories?.length ? (
                        <div className="c-pick-cats">
                          {categories.map((cat) => (
                            <button
                              key={cat.name}
                              type="button"
                              className="c-pick-cat"
                              onClick={() => setTerm(cat.name)}
                              title={`Search ${cat.name}`}
                            >
                              {cat.preview ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={cat.preview} alt="" loading="lazy" />
                              ) : null}
                              <span>{cat.name}</span>
                            </button>
                          ))}
                        </div>
                      ) : null}

                      {/* Columns of a fixed width, each cell as tall as its
                          picture needs — the client's own layout, and the
                          reason a grid of GIFs does not read as a grid of
                          squares with letterboxing in them. */}
                      <div className="c-pick-masonry">
                        {(remote.gifs ?? []).map((gif) => (
                          <button
                            key={gif.id}
                            type="button"
                            className="c-pick-tile"
                            style={{ aspectRatio: gif.ratio || 1 }}
                            title={gif.label}
                            aria-label={gif.label}
                            onClick={() => chooseRemote(gif.src)}
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={gif.preview} alt="" loading="lazy" />
                          </button>
                        ))}
                      </div>
                      {(remote.gifs ?? []).length ? null : (
                        <p className="c-pick-empty">Nothing matched that.</p>
                      )}
                      {remote.hasMore ? (
                        <button type="button" className="c-pick-more" onClick={more} disabled={loadingMore}>
                          {loadingMore ? "Loading…" : "Show more"}
                        </button>
                      ) : null}
                      {/* KLIPY asks for the credit, and a picture that came
                          from somewhere should say where. */}
                      <p className="c-pick-by">GIFs by KLIPY</p>
                    </>
                  ) : (
                    (() => {
                      const packs = (remote.packs ?? [])
                        .map((pack) => ({
                          ...pack,
                          stickers: term.trim()
                            ? pack.stickers.filter((x) =>
                                x.name.toLowerCase().includes(term.trim().toLowerCase()),
                              )
                            : pack.stickers,
                        }))
                        .filter((pack) => pack.stickers.length);
                      if (!packs.length) return <p className="c-pick-empty">Nothing matched that.</p>;
                      return packs.map((pack) => (
                        <section key={pack.id} className="c-pick-section">
                          <h3 className="c-pick-pack">{pack.name}</h3>
                          <div className="c-pick-grid">
                            {pack.stickers.map((sticker) => (
                              <button
                                key={sticker.id}
                                type="button"
                                className="c-pick-cell"
                                title={sticker.name}
                                aria-label={sticker.name}
                                onClick={() => choose(sticker.src)}
                              >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={sticker.src} alt="" loading="lazy" />
                              </button>
                            ))}
                          </div>
                        </section>
                      ));
                    })()
                  )
                ) : (tab === "mockup" ? shownMine : shownEmoji).length ? (
                  <div className="c-pick-grid">
                    {tab === "mockup"
                      ? shownMine.map((item) => (
                          <button
                            key={item.src}
                            type="button"
                            className="c-pick-cell"
                            title={item.label}
                            aria-label={item.label}
                            onClick={() => choose(item.src)}
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={item.src} alt="" loading="lazy" />
                          </button>
                        ))
                      : shownEmoji.map((e) => (
                          <button
                            key={e.char}
                            type="button"
                            className="c-pick-cell"
                            title={e.keywords.split(" ")[0]}
                            aria-label={e.keywords.split(" ")[0]}
                            onClick={() => choose(twemojiUrl(e.char))}
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={twemojiUrl(e.char)} alt="" loading="lazy" />
                          </button>
                        ))}
                  </div>
                ) : (
                  <p className="c-pick-empty">
                    {tab === "mockup"
                      ? "Nothing here yet. Anything you add to this mockup shows up in this list."
                      : "No emoji match that."}
                  </p>
                )}
              </div>
            </>
          )}
        </div>
      ) : null}
    </span>
  );
}

/** The pill that says who you are sending as, and the popover behind it. */
function AuthorPill({ project, author, onPick, onEdit, onAdd }) {
  const [open, setOpen] = useState(false);
  const box = useRef(null);

  /* Click-away and Escape, rather than a modal scrim: the island sits over the
     canvas and a scrim would grey out the thing being edited. */
  useEffect(() => {
    if (!open) return undefined;
    const away = (event) => {
      if (!box.current?.contains(event.target)) setOpen(false);
    };
    const key = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", key);
    };
  }, [open]);

  return (
    <div className="c-author" ref={box}>
      {open ? (
        <div className="c-author-pop" role="menu">
          <div className="c-author-pop-head">Sending as</div>
          <ul className="c-author-list">
            {project.users.map((u) => (
              <li key={u.id}>
                <button
                  type="button"
                  role="menuitemradio"
                  aria-checked={u.id === author?.id}
                  className="c-author-option"
                  data-on={u.id === author?.id ? "true" : "false"}
                  onClick={() => {
                    onPick(u.id);
                    setOpen(false);
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={u.avatar} alt="" draggable={false} />
                  <span className="c-author-option-name" style={u.color ? { color: u.color } : undefined}>
                    {u.name}
                  </span>
                  {u.bot ? <span className="c-author-option-tag">APP</span> : null}
                </button>
              </li>
            ))}
          </ul>
          <div className="c-author-pop-foot">
            <button
              type="button"
              className="c-author-act"
              onClick={() => {
                onEdit(author?.id);
                setOpen(false);
              }}
            >
              <IconPencil size={14} /> Edit {author?.name || "this member"}
            </button>
            <button
              type="button"
              className="c-author-act"
              onClick={() => {
                onAdd();
                setOpen(false);
              }}
            >
              <IconPlus size={14} /> Add a member
            </button>
          </div>
        </div>
      ) : null}

      <Hint label="Who this message is from — click to switch, edit or add">
        <button
          type="button"
          className="c-author-btn"
          data-open={open ? "true" : "false"}
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="c-author-face" src={author?.avatar} alt="" draggable={false} />
          <span className="c-author-name" style={author?.color ? { color: author.color } : undefined}>
            {author?.name ?? "Nobody"}
          </span>
          {/* Turns over when the list is open. A control that offers a menu
              and looks identical whether the menu is up or down is a control
              that makes you check. */}
          <IconChevronDown className="c-author-caret" size={13} stroke={2.2} />
        </button>
      </Hint>
    </div>
  );
}

export function Composer({
  project,
  author,
  tool,
  onPickAuthor,
  onEditAuthor,
  onAddAuthor,
  onSend,
  onTool,
  onAdd,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  channel,
  emojis,
}) {
  const [draft, setDraft] = useState("");
  const field = useRef(null);
  const island = useRef(null);
  const blob = useBlob(tool);

  /* The panel and the tray sit above the island, and the island is not a fixed
     height — the bar grows to what is being typed into it. Publishing the
     measurement means the two surfaces above it move with it instead of
     guessing a clearance that is wrong the moment somebody writes a paragraph. */
  useLayoutEffect(() => {
    const el = island.current;
    if (!el || typeof ResizeObserver === "undefined") return undefined;
    const write = () =>
      el.parentElement?.style.setProperty("--c-island-h", `${Math.round(el.offsetHeight)}px`);
    write();
    const ro = new ResizeObserver(write);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* The bar grows with what is in it, the way the client's does, and stops at
     a height that still leaves the mockup visible behind it. */
  useLayoutEffect(() => {
    const el = field.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
  }, [draft]);

  const send = () => {
    const text = draft.trim();
    if (!text) return;
    onSend(text);
    setDraft("");
  };

  return (
    <div className="c-island e-no-export" ref={island}>
      <AuthorPill
        project={project}
        author={author}
        onPick={onPickAuthor}
        onEdit={onEditAuthor}
        onAdd={onAddAuthor}
      />

      <div className="c-bar">
        {/* Discord's own controls, and only those. Drawn rather than wired,
            like everything else on a mockup — pressing one opens the editor
            panel that actually adds the thing. */}
        <MediaPick
          icon="attach"
          label="Attach"
          hint="Attach a picture or a file to this message"
          size={22}
          what="a picture"
          kind="image"
          project={project}
          onPick={(src) => onAdd("attachment", src)}
        />

        <textarea
          ref={field}
          className="c-field"
          rows={1}
          value={draft}
          placeholder={`Message #${channel || "general"}`}
          aria-label="Write a message"
          onChange={(e) => setDraft(e.target.value)}
          /* Enter sends and shift-Enter breaks the line, which is the client's
             behaviour and the reason this reads as a chat rather than a form. */
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              send();
            }
          }}
        />

        {/* Each does its own job, and the job is the thing it is a picture of.
            They all used to open the same panel — four buttons that were one
            button wearing four faces — and the gift was missing entirely,
            because Discord's gift button opens a Nitro purchase and I read
            that as "nothing to draw". What it *produces* is very much a thing
            to draw, so it makes the card. */}
        <span className="c-bar-tools">
          <MediaPick
            icon="gift"
            label="Gift"
            hint="Add a Nitro gift card to this message"
            onPick={() => onAdd("gift")}
          />
          <MediaPick
            icon="gif"
            label="GIF"
            hint="Put a GIF in this message"
            what="a GIF"
            kind="gif"
            project={project}
            onPick={(src) => onAdd("gif", src)}
          />
          <MediaPick
            icon="sticker"
            label="Sticker"
            hint="Put a sticker in this message"
            what="a sticker"
            kind="sticker"
            project={project}
            onPick={(src) => onAdd("sticker", src)}
          />
          <EmojiInsert onPick={(emoji) => setDraft((d) => d + emoji)} custom={emojis} />
        </span>

        {/* Only on a phone, where there is no Enter key to speak of: a soft
            keyboard's return is a line break as often as it is a send, and a
            composer whose only way to commit is a key somebody has to guess at
            is a composer that swallows what you wrote. */}
        <button
          type="button"
          className="c-send"
          onClick={send}
          disabled={!draft.trim()}
          aria-label="Send this message"
          title="Send"
        >
          <Icon name="send" size={18} />
        </button>
      </div>

      {/* Everything the message can carry, on the side the message is on.
          One shape moves between the three rather than three backgrounds
          fading in and out — the same indicator the site header uses, because
          the eye tracks a moving object without being asked to and has to be
          told about a fade. */}
      <div className="c-tools" role="group" aria-label="Edit this message" {...blob.boxProps}>
        <Blob />
        {/* Undo and redo, on a phone only.
            They are in the top bar everywhere else, and on a phone the top bar
            could not hold them and the name of the document at the same time.
            Here is the better place for them anyway: a phone is held at the
            bottom, and the one control somebody reaches for in a hurry should
            not be the one furthest from the thumb. */}
        <span className="c-undo">
          <button
            type="button"
            onClick={onUndo}
            disabled={!canUndo}
            aria-label="Undo"
            title="Undo"
          >
            <IconArrowBackUp size={18} stroke={1.9} />
          </button>
          <button
            type="button"
            onClick={onRedo}
            disabled={!canRedo}
            aria-label="Redo"
            title="Redo"
          >
            <IconArrowForwardUp size={18} stroke={1.9} />
          </button>
        </span>
        {TOOLS.map(({ id, label, hint, Glyph }) => (
          <Hint key={id} label={hint}>
            <button
              type="button"
              className="c-tool"
              data-on={tool === id ? "true" : "false"}
              aria-pressed={tool === id}
              onClick={() => onTool(id)}
              {...blob.register(id)}
            >
              <Glyph size={17} stroke={1.9} />
              <span>{label}</span>
            </button>
          </Hint>
        ))}
      </div>
    </div>
  );
}
