"use client";

/* Backups: everything that is a copy of this mockup, in one list.
 *
 * Three tiers, and the panel says plainly which is which rather than blurring
 * them into "saved". A person needs to know what survives what.
 *
 *   This browser   written on every change, restored when you come back, gone
 *                  if the browser is cleared.
 *   Backups        copies you made on purpose, plus automatic snapshots the
 *                  editor takes every minute or so and prunes. Same browser.
 *   Cloud          a copy on the deployment, tied to your Discord account, and
 *                  the only one that survives a new machine.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  IconCloud,
  IconCloudCheck,
  IconCloudOff,
  IconArrowBackUp,
  IconCopy,
  IconDownload,
  IconFileText,
  IconPlus,
  IconHistory,
  IconCheck,
  IconPencil,
  IconRefresh,
  IconTrash,
  IconUpload,
} from "@tabler/icons-react";
import {
  deleteBackup,
  listBackups,
  readBackup,
  renameBackup,
  saveBackup,
} from "@/lib/backups";
import { ID } from "@/lib/ids";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Input } from "@/components/ui/input";
import { Empty, Group } from "./fields";
import "./backups-panel.css";

/* Discohook caps a backup name at 100; the same number, for the same reason —
   a name is a label, not a description. */
const NAME_MAX = 100;

const when = (t) => {
  const secs = Math.round((Date.now() - t) / 1000);
  if (secs < 60) return "just now";
  if (secs < 3600) return `${Math.round(secs / 60)} min ago`;
  if (secs < 86400) return `${Math.round(secs / 3600)} h ago`;
  return new Date(t).toLocaleDateString();
};

const size = (bytes) => (bytes > 1024 * 1024 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

/* Hoisted deliberately.
 *
 * Declared inside `BackupsPanel` this is a new component *type* on every
 * render, so React throws the list away and rebuilds it whenever anything
 * above changes. The autosave flips `savedLocally` a moment after every
 * keystroke, which re-rendered the panel, which remounted every row — and a
 * row that remounts between the press and the release never sees the click.
 * That is why restoring, renaming and deleting all silently did nothing. */
function BackupRow({ row, busy, onOpen, onRename, onDuplicate, onDelete, icon }) {
  /* Renaming happens on the row.
   *
   * It used to call `window.prompt`, which is the browser's own dialog: it
   * lands at the top of the window rather than on the thing being renamed, it
   * is drawn in the browser's chrome and its language rather than this app's —
   * "Auf mockups.gatorsys.xyz wird Folgendes angezeigt" above an OK and an
   * Abbrechen — and some browsers offer to suppress it for the rest of the
   * session, which quietly breaks renaming altogether. */
  const [naming, setNaming] = useState(null);
  const field = useRef(null);

  useEffect(() => {
    if (naming !== null) field.current?.select();
  }, [naming]);

  const commit = () => {
    const next = (naming ?? "").trim();
    setNaming(null);
    if (next && next !== row.name) onRename(next);
  };

  if (naming !== null) {
    return (
      <li className="b-row" data-current={row.current ? "true" : "false"} data-naming="true">
        <span className="b-rename">
          {icon}
          <input
            ref={field}
            className="b-rename-field"
            value={naming}
            autoFocus
            maxLength={100}
            aria-label={`Name for ${row.name}`}
            onChange={(event) => setNaming(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                commit();
              } else if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                setNaming(null);
              }
            }}
            /* Leaving the field keeps what was typed. A rename that is thrown
               away because you clicked somewhere is a rename you have to do
               twice. Escape is the way out. */
            onBlur={commit}
          />
        </span>
        <Tooltip>
          <TooltipTrigger asChild>
            <button type="button" className="e-icon-btn" onClick={commit} aria-label="Save this name">
              <IconCheck size={14} />
            </button>
          </TooltipTrigger>
          <TooltipContent>Save the name</TooltipContent>
        </Tooltip>
      </li>
    );
  }

  return (
    <li className="b-row" data-current={row.current ? "true" : "false"}>
      {/* The one you are in does not open.
       *
       * It offered "Open again", which read as a way back to how it was and
       * was a way to lose an afternoon: it replaced the canvas with what had
       * been written last, and everything since went with it. Reported as "if
       * i edit a backup then reopen that backup while still editing it all
       * progress is gone, shouldn't even be able to open backups i'm already
       * on." Quite so — and now that this backup keeps itself as you type,
       * there is nothing on the other side of that press but the same mockup.
       * Undo is the way back to how it was. */}
      <button
        type="button"
        className="b-open"
        onClick={onOpen}
        disabled={busy || row.current}
        aria-current={row.current ? "true" : undefined}
      >
        <span className="b-name">
          {icon}
          {row.name}
        </span>
        <span className="b-meta">
          {row.messages} {row.messages === 1 ? "message" : "messages"}
          {row.bytes ? ` · ${size(row.bytes)}` : ""} · {when(row.savedAt ?? row.updatedAt)}
        </span>
        {/* The whole row opens the backup, which is not something anybody
            guesses from a row. It says so when you point at it. */}
        <span className="b-open-hint">
          {row.current ? (
            "You are editing this one"
          ) : (
            <>
              Open
              <IconArrowBackUp size={13} />
            </>
          )}
        </span>
      </button>
      {onRename ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="e-icon-btn"
              onClick={() => setNaming(row.name)}
              aria-label="Rename"
            >
              <IconPencil size={14} />
            </button>
          </TooltipTrigger>
          <TooltipContent>Rename</TooltipContent>
        </Tooltip>
      ) : null}
      {onDuplicate ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <button type="button" className="e-icon-btn" onClick={onDuplicate} aria-label="Duplicate">
              <IconCopy size={14} />
            </button>
          </TooltipTrigger>
          <TooltipContent>Duplicate</TooltipContent>
        </Tooltip>
      ) : null}
      <Tooltip>
        <TooltipTrigger asChild>
          <button type="button" className="e-icon-btn" onClick={onDelete} aria-label="Delete this backup">
            <IconTrash size={14} />
          </button>
        </TooltipTrigger>
        <TooltipContent>Delete</TooltipContent>
      </Tooltip>
    </li>
  );
}

export function BackupsPanel({ project, slug, user, canSignIn, linkedId, onLink, onLoad, onRenameProject, onError, onNotify, savedLocally, revision = 0 }) {
  const [rows, setRows] = useState(null);
  const [cloud, setCloud] = useState(null);
  const [busy, setBusy] = useState(false);
  /* The linked backup's name, while it is being edited on the row it names. */
  const [namingLinked, setNamingLinked] = useState(null);
  const [noCloud, setNoCloud] = useState(false);
  const [query, setQuery] = useState("");

  /* The backup this working copy belongs to, if it still exists — a backup can
     be deleted from under a link. */
  const linked = (rows ?? []).find((r) => r.id === linkedId) ?? null;

  const refreshLocal = useCallback(() => {
    listBackups()
      .then(setRows)
      .catch(() => {
        setRows([]);
        onError("This browser is not letting the editor list its backups.");
      });
  }, [onError]);

  const refreshCloud = useCallback(async () => {
    if (!user) return;
    try {
      const res = await fetch("/api/mockups", { cache: "no-store" });
      if (res.status === 503) {
        setNoCloud(true);
        setCloud([]);
        return;
      }
      if (!res.ok) throw new Error();
      setCloud((await res.json()).mockups ?? []);
      setNoCloud(false);
    } catch {
      setCloud([]);
      onError("Could not read your cloud backups.");
    }
  }, [onError, user]);

  /* `revision` counts the times the editor has written this mockup's name
     through to its backup. Without it the row keeps the old name until the
     next save happens to come round, which is a list disagreeing with the
     title bar above it for as long as nobody types. */
  useEffect(() => {
    refreshLocal();
  }, [refreshLocal, savedLocally, revision]);

  useEffect(() => {
    refreshCloud();
    // Only when the account changes; not on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  /* Nothing in here writes a backup you did not ask for.
   *
   * Opening one used to keep whatever was on the canvas first, so that no
   * click could cost you an afternoon. It also meant a list that filled with
   * rows nobody made — reported as "why does any change save to backup, only
   * if the user creates a backup is it a backup, otherwise just browser".
   * Which is right: the browser holds the working copy and writes it on every
   * change, a backup is a copy somebody decides to keep, and opening one is
   * undoable like every other change to the canvas. */
  const open = async (id) => {
    const restored = await readBackup(id).catch(() => null);
    if (!restored) {
      onError("That backup could not be read.");
      return;
    }
    onLoad(restored);
    /* Opening a named backup links to it, so the next Save updates the thing
       you just opened. An automatic snapshot is a moment in time rather than
       a document, so restoring one links to nothing. */
    onLink?.(String(id).startsWith("auto:") ? null : id);
    onNotify("Backup opened as a working copy.");
  };

  /* A backup and the mockup it holds share a name.
   *
   * They used to drift: naming a backup "welcome v3" left the document called
   * "Untitled mockup", so the title bar — the one place the name is on screen
   * the whole time — went on naming something else. Which copy am I in is the
   * question this panel exists to answer, and the answer has to be the same in
   * both places. Only the one you are editing, of course; renaming somebody
   * else's row is about the row. */
  const rename = async (id, next) => {
    await renameBackup(id, next);
    if (id === linkedId) onRenameProject?.(next);
    refreshLocal();
  };

  const remove = async (id) => {
    await deleteBackup(id).catch(() => {});
    refreshLocal();
  };

  const pushCloud = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/mockups", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ slug, project }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        onError(data.error ?? "The cloud backup did not go through.");
        return;
      }
      onNotify("Backed up to the cloud.");
      refreshCloud();
    } catch {
      onError("The cloud backup did not go through. Your work is still saved here.");
    } finally {
      setBusy(false);
    }
  };

  const openCloud = async (id) => {
    try {
      const res = await fetch(`/api/mockups/${id}`, { cache: "no-store" });
      if (!res.ok) throw new Error();
      const data = await res.json();
      onLoad(data.project, data.slug);
      onNotify(`Opened “${data.name}”.`);
    } catch {
      onError("That cloud backup could not be opened.");
    }
  };

  const removeCloud = async (id) => {
    try {
      const res = await fetch(`/api/mockups/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      refreshCloud();
    } catch {
      onError("That backup could not be deleted.");
    }
  };

  const createNamed = async () => {
    const name = wanted || project.name;
    setBusy(true);
    try {
      const id = await saveBackup(project, name);
      onLink?.(id);
      onRenameProject?.(name);
      setQuery("");
      onNotify(`\u201c${name}\u201d backed up in this browser.`);
      refreshLocal();
    } catch {
      onError("Could not write the backup. Browser storage may be full.");
    } finally {
      setBusy(false);
    }
  };

  /* Duplicating leaves you editing the duplicate.
   *
   * It used to make the copy and leave you on whatever you were editing
   * before, with nothing on screen changed to say so. So you copy a mockup,
   * make your changes, press Save — and the save lands on the original while
   * the copy sits frozen at the moment it was made. Reported as an afternoon
   * gone: “only the original before my edits were there, now it's just
   * duplicates”. A duplicate is a branch, and the reason anybody makes one is
   * to work on it. */
  const duplicate = async (row) => {
    /* Copying the mockup you are working on copies what is on screen, unsaved
       changes and all, and leaves the row you copied exactly as it stands. */
    const mine = row.id === linkedId;
    const source = mine ? project : await readBackup(row.id).catch(() => null);
    if (!source) return onError("That backup could not be read.");

    setBusy(true);
    try {
      const name = freeName(row.name);
      const id = await saveBackup(source, name);
      const copy = await readBackup(id);
      if (!copy) throw new Error("the copy could not be read back");
      refreshLocal();
      /* And a key of its own for the cloud. The slug is what a cloud backup is
         written under, so a duplicate that kept it would push over the row the
         original had pushed — two documents landing on one. */
      onLoad(copy, ID.mockup());
      onLink?.(id);
      onNotify(`Editing “${name}”. “${row.name}” is untouched.`);
    } catch {
      onError("Could not write the backup. Browser storage may be full.");
    } finally {
      setBusy(false);
    }
  };

  /* Every row is one somebody made. The `auto` ones are gone; anything left
     over from before is filtered out here rather than shown as a mystery. */
  const named = (rows ?? []).filter((r) => !r.auto);
  const hit = (r) => r.name.toLowerCase().includes(query.trim().toLowerCase());
  const shownNamed = query.trim() ? named.filter(hit) : named;

  /* The name Create backup would actually use — which is the name the
     already-exists guard has to be about.
     It used to compare the *typed* text against the list. With the field
     empty, which is the state it sits in, nothing ever matched, so the button
     stayed live and every press made one more row with the same name as the
     last. Four presses, four rows called “Untitled mockup”, no way to tell
     which was which. */
  const wanted = (query.trim() || project.name || "").trim();
  const exact = named.some((r) => r.name.toLowerCase() === wanted.toLowerCase());

  /* “Welcome copy”, then “Welcome copy 2”. Two rows with one name between them
     is a list you cannot read, and the point of duplicating is to end up with
     two things you can tell apart.
     The trailing "copy" comes off the name first, so duplicating a duplicate
     numbers it rather than stacking the word — "Welcome copy copy copy" says
     nothing about which one it is. */
  const freeName = (row) => {
    const base = row.replace(/ copy(?: \d+)?$/i, "") || row;
    const taken = new Set(named.map((r) => r.name.toLowerCase()));
    let name = `${base} copy`;
    for (let n = 2; taken.has(name.toLowerCase()); n += 1) name = `${base} copy ${n}`;
    return name.slice(0, NAME_MAX);
  };

  return (
    <div className="b-root">
      {/* The backup this mockup belongs to, if it belongs to one. Everything
          about it is here: what it is called, when it was last written, and
          the two things you can do to the relationship. */}
      {linked ? (
        <div className="b-linked">
          <span className="b-linked-icon">
            <IconFileText size={17} />
          </span>
          <span className="b-linked-copy">
            {namingLinked === null ? (
              <button type="button" className="b-linked-name" onClick={() => setNamingLinked(linked.name)}>
                {linked.name}
                <IconPencil size={13} />
              </button>
            ) : (
              <input
                className="b-rename-field b-linked-field"
                value={namingLinked}
                autoFocus
                maxLength={100}
                aria-label="Name for this backup"
                onChange={(event) => setNamingLinked(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    event.currentTarget.blur();
                  } else if (event.key === "Escape") {
                    event.preventDefault();
                    event.stopPropagation();
                    setNamingLinked(null);
                  }
                }}
                onBlur={() => {
                  const next = (namingLinked ?? "").trim();
                  setNamingLinked(null);
                  if (next && next !== linked.name) rename(linked.id, next);
                }}
              />
            )}
            {/* No Save button.
                There was one, and everything typed between presses of it sat
                in the working copy and nowhere else — a backup made once and
                then left behind by the mockup it was a backup of. Naming a
                mockup is what turns it from a scratch page into a document,
                and a document keeps itself, so this says what is true rather
                than offering to make it true. */}
            <em data-saved={savedLocally ? "true" : "false"}>
              {savedLocally ? `Kept here, saved ${when(linked.savedAt)}` : "Saving\u2026"}
            </em>
          </span>
          <span className="b-linked-actions">
            <Tooltip>
              <TooltipTrigger asChild>
                <button type="button" className="e-btn e-btn-quiet" onClick={() => onLink?.(null)}>
                  Unlink
                </button>
              </TooltipTrigger>
              <TooltipContent>Keep editing without changing that backup</TooltipContent>
            </Tooltip>
          </span>
        </div>
      ) : null}

      {/* One field for both jobs, because with a list this long they are the
          same job: you type a name to find it, and if it is not there yet the
          button beside you makes it. */}
      <div className="b-find">
        <label className="b-find-label" htmlFor="b-find-input">
          Search or name a new backup
          <span className="b-find-count">
            {query.length}/{NAME_MAX}
          </span>
        </label>
        <div className="b-find-row">
          <Input
            id="b-find-input"
            className="e-control"
            value={query}
            maxLength={NAME_MAX}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={project.name}
            spellCheck={false}
          />
          <button
            type="button"
            className="e-btn e-btn-solid"
            onClick={createNamed}
            disabled={busy || exact}
            title={
              exact
                ? `“${wanted}” is already a backup. Open it to carry on with it, or type a different name here.`
                : undefined
            }
          >
            <IconPlus size={15} /> Create backup
          </button>
        </div>
      </div>

      {/* One list. It was three boxes — this browser, the cloud, and files —
          which is a diagram of where the bytes live rather than an answer to
          "which copy do I want back". A backup is a backup; where it is kept
          is a mark on the row. */}
      <div className="b-panel">
        {rows === null ? (
          <Empty>Reading your backups…</Empty>
        ) : named.length === 0 ? (
          <Empty>
            No backups yet. Name one above and press Create backup to keep a copy you can come back
            to.
          </Empty>
        ) : shownNamed.length === 0 ? (
          <Empty>Nothing matches “{query.trim()}”. Create backup makes one with that name.</Empty>
        ) : (
          <ul className="b-list">
            {shownNamed.map((row) => (
              <BackupRow
                key={row.id}
                row={{ ...row, current: row.id === linkedId }}
                busy={busy}
                onOpen={() => open(row.id)}
                onRename={(next) => rename(row.id, next)}
                onDuplicate={() => duplicate(row)}
                onDelete={() => remove(row.id)}
              />
            ))}
          </ul>
        )}

        {/* There used to be a second list here of snapshots the editor took
            on a timer. It filled this panel with a dozen near-identical rows
            nobody asked for and nobody could tell apart. Undo covers stepping
            back through a session; a backup is a thing you decide to keep. */}
      </div>

      {/* The cloud copies join the same list when there are any, marked with a
          cloud rather than fenced off in a section that says "Cloud is
          switched off on this deployment" to somebody who never asked. */}
      {user && !noCloud && cloud?.length ? (
        <div className="b-panel">
          <p className="b-auto-head">
            Kept on your account — these survive a cleared browser
            <span className="b-panel-tools">
              <Tooltip>
                <TooltipTrigger asChild>
                  <button type="button" className="e-icon-btn" onClick={refreshCloud} aria-label="Refresh">
                    <IconRefresh size={14} />
                  </button>
                </TooltipTrigger>
                <TooltipContent>Refresh</TooltipContent>
              </Tooltip>
              <button type="button" className="e-btn e-btn-quiet" onClick={pushCloud} disabled={busy}>
                <IconCloudCheck size={14} /> Back up
              </button>
            </span>
          </p>
          <ul className="b-list">
            {cloud.map((row) => (
              <BackupRow
                key={row.id}
                row={{ ...row, current: row.slug === slug }}
                busy={busy}
                icon={<IconCloud size={13} />}
                onOpen={() => openCloud(row.id)}
                onDelete={() => removeCloud(row.id)}
              />
            ))}
          </ul>
        </div>
      ) : null}

      {/* One quiet row, not three boxes: sign in to keep a copy off this
          machine, and move the project in or out as a file. */}
      <div className="b-tools">
        {canSignIn && !user ? (
          <a className="e-btn e-btn-quiet" href="/signin">
            <IconCloudOff size={14} /> Sign in to keep a copy off this browser
          </a>
        ) : null}
        {user && !noCloud && !cloud?.length ? (
          <button type="button" className="e-btn e-btn-quiet" onClick={pushCloud} disabled={busy}>
            <IconCloudCheck size={14} /> Keep a copy on your account
          </button>
        ) : null}
        <span className="c-dock-spacer" />
        <button type="button" className="e-btn e-btn-quiet" onClick={() => onLoad(null, null, "import")}>
          <IconUpload size={14} /> Import a file
        </button>
        <button type="button" className="e-btn e-btn-quiet" onClick={() => onLoad(null, null, "export")}>
          <IconDownload size={14} /> Download
        </button>
      </div>

      <p className="e-field-hint b-foot">
        <IconHistory size={13} /> Undo goes back 50 steps within this session; backups go back
        further and survive a reload.
      </p>
    </div>
  );
}
