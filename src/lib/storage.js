/* Local persistence.
 *
 * IndexedDB rather than localStorage, for one reason: a mockup can carry a
 * dozen pasted images as data URIs and localStorage's quota is around 5 MB of
 * UTF-16, which one screenshot can exceed on its own. IndexedDB stores the
 * object rather than a string of it, so nothing is serialised twice, and its
 * quota is measured in hundreds of megabytes.
 *
 * Every call can fail — a private window, blocked storage, a full disk — and
 * every one of those is survivable: the editor keeps working in memory and
 * says so. Nothing here throws past its caller.
 */

const DB = "gator-mockups";
const STORE = "data";
let handle;

function open() {
  return (handle ??= new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("no indexedDB"));
      return;
    }
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }));
}

export async function loadValue(key) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE).objectStore(STORE).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveValue(key, value) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

/* Read a key and write it back without letting go in between.
 *
 * Two tabs of this editor share one working copy, and `loadValue` then
 * `saveValue` is two transactions with a gap in the middle — both tabs can
 * read the same number, both can decide they are up to date, and the slower
 * one writes its older document over the newer one. That is the whole of the
 * bug this exists to close.
 *
 * `decide` is handed what is there and returns what to put, or `undefined` to
 * put nothing; either way it runs inside the transaction, so no other tab can
 * write between the read and the decision. */
export async function exchangeValue(key, decide) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    const read = store.get(key);
    let outcome = { had: undefined, wrote: false, value: undefined };
    read.onsuccess = () => {
      const had = read.result;
      const next = decide(had);
      outcome = { had, wrote: next !== undefined, value: next };
      /* Issued synchronously, inside this callback, or the transaction ends
         before the put is queued and nothing is written. */
      if (next !== undefined) store.put(next, key);
    };
    tx.oncomplete = () => resolve(outcome);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

/** Every key in the store, so the backup list can be built without keeping a
 *  separate index that could drift out of step with what is actually there. */
export async function listKeys() {
  const db = await open();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE).objectStore(STORE).getAllKeys();
    req.onsuccess = () => resolve((req.result ?? []).map(String));
    req.onerror = () => reject(req.error);
  });
}

export async function deleteValue(key) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
