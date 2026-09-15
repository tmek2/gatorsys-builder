/* Backups.
 *
 * Two kinds, and the difference matters enough to be visible in the interface.
 *
 * A **named backup** is a copy you made on purpose — "welcome message v3" —
 * that stays until you delete it. This is Discohook's model and the right one:
 * the thing you are editing is a working copy, and a backup is a point you can
 * get back to.
 *
 * An **automatic snapshot** is one the editor took for you, on a timer, and
 * throws away once there are enough newer ones. Nobody asks for these; they
 * exist so that "I closed the tab" and "I pasted over everything" are
 * recoverable rather than terminal.
 *
 * Both live in IndexedDB, so they survive a reload, a crash and being offline.
 * Signing in adds a third copy in the cloud — see `cloud.js` — which is the
 * only one that survives a cleared browser or a different machine.
 */

import { deleteValue, listKeys, loadValue, saveValue } from "./storage";
import { uid } from "./model";
import { migrate, validProject } from "./validate";

const NAMED = "backup:";
const AUTO = "auto:";

/** How many automatic snapshots to keep. Enough to step back through an
 *  afternoon; few enough that they never become the thing filling the disk. */
export const AUTO_KEEP = 12;

/** How often one is taken, when anything has actually changed. */
export const AUTO_EVERY_MS = 90_000;

const bytesOf = (project) => {
  try {
    return new Blob([JSON.stringify(project)]).size;
  } catch {
    return 0;
  }
};

function entry(id, project, over = {}) {
  return {
    id,
    name: project.name || "Untitled mockup",
    messages: project.messages?.length ?? 0,
    bytes: bytesOf(project),
    savedAt: Date.now(),
    project,
    ...over,
  };
}

/* ------------------------------------------------------------ named ---- */

export async function listBackups() {
  const keys = await listKeys();
  const rows = await Promise.all(
    keys.filter((k) => k.startsWith(NAMED)).map((k) => loadValue(k).catch(() => null)),
  );
  return rows
    .filter((r) => r && validProject(r.project))
    .map(({ project, ...meta }) => meta)
    .sort((a, b) => b.savedAt - a.savedAt);
}

export async function saveBackup(project, name) {
  const id = uid();
  await saveValue(`${NAMED}${id}`, entry(id, { ...project, name: name || project.name }, { auto: false }));
  return id;
}

/** Overwrite an existing backup in place, keeping its id and its position.
 *
 * Never creates one. It used to make a new backup when the id had gone, which
 * was harmless while this was only reached from a Save button and is not now
 * that the editor writes through to the backup it belongs to as you type: a
 * link left pointing at a deleted row would quietly put that row back, once
 * per keystroke. Missing means missing, and the caller decides what that is
 * worth. */
export async function updateBackup(id, project) {
  const key = `${NAMED}${id}`;
  const existing = await loadValue(key).catch(() => null);
  if (!existing) return null;
  await saveValue(key, entry(id, project, { auto: false, name: existing.name }));
  return id;
}

/* Renames the backup, and the mockup inside it.
 *
 * The row's label and the project's own `name` are one name wearing two hats:
 * this list draws the first and the editor's title bar reads the second. They
 * were written separately, so renaming a row relabelled it and left the mockup
 * inside still called what it was — and opening that backup handed the old
 * name straight back to the title bar. */
export async function renameBackup(id, name) {
  const key = `${NAMED}${id}`;
  const existing = await loadValue(key).catch(() => null);
  if (!existing) return;
  const next = name || "Untitled mockup";
  /* Nothing to do is nothing to write: this is reached from both ends — the
     row and the title bar — and each would otherwise answer the other. */
  if (existing.name === next && existing.project?.name === next) return;
  await saveValue(key, {
    ...existing,
    name: next,
    project: existing.project ? { ...existing.project, name: next } : existing.project,
  });
}

export async function readBackup(id) {
  const row = await loadValue(id.startsWith(AUTO) || id.startsWith(NAMED) ? id : `${NAMED}${id}`);
  const project = migrate(row?.project);
  return validProject(project) ? project : null;
}

export async function deleteBackup(id) {
  await deleteValue(id.startsWith(AUTO) || id.startsWith(NAMED) ? id : `${NAMED}${id}`);
}

/* -------------------------------------------------------- automatic ---- */

export async function listSnapshots() {
  const keys = await listKeys();
  const rows = await Promise.all(
    keys.filter((k) => k.startsWith(AUTO)).map((k) => loadValue(k).catch(() => null)),
  );
  return rows
    .filter((r) => r && validProject(r.project))
    .map(({ project, ...meta }) => meta)
    .sort((a, b) => b.savedAt - a.savedAt);
}

/* Takes one, then throws away everything past the keep count.
 *
 * The id carries the timestamp so the list sorts by key without reading every
 * record, and so two snapshots taken in the same millisecond cannot collide. */
export async function takeSnapshot(project) {
  const id = `${AUTO}${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  await saveValue(id, entry(id, project, { auto: true }));

  const keys = (await listKeys()).filter((k) => k.startsWith(AUTO)).sort();
  const stale = keys.slice(0, Math.max(0, keys.length - AUTO_KEEP));
  await Promise.all(stale.map((k) => deleteValue(k).catch(() => {})));
  return id;
}

/** Everything, newest first, for one list with two kinds in it. */
export async function listAll() {
  const [named, auto] = await Promise.all([listBackups(), listSnapshots()]);
  return [...named, ...auto].sort((a, b) => b.savedAt - a.savedAt);
}
