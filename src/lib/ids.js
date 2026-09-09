/* Identifiers.
 *
 * One scheme for everything, and every id says what it is.
 *
 *   msg_01k5f3q9r2_h7xk9p2m
 *   ├── kind          what this identifies, so an id in a log or a payload is
 *   │                 self-describing and a message id can never be mistaken
 *   │                 for a share id
 *   ├── time          the creation time in base36, which sorts lexically in
 *   │                 creation order — useful for a list, and it means two ids
 *   │                 made a millisecond apart cannot collide even if the
 *   │                 random half somehow repeated
 *   └── random        64 bits from the CSPRNG
 *
 * The random half comes from `crypto.getRandomValues`, never `Math.random`.
 * Share ids in particular are the only thing standing between a link and
 * somebody else's mockup, and `Math.random` is seeded predictably enough in
 * some engines to enumerate.
 *
 * Ids are generated in the browser as well as on the server, so this runs in
 * both. `crypto` is a global in Node 18+ and in every browser that can run
 * this app; there is no fallback, because a fallback here would be a weaker
 * one used silently.
 */

/* Lowercase base32 without the letters that look like digits. An id gets read
   off a screen and typed back in often enough — a share link most of all —
   that i/l/o/u simply not being in the alphabet is worth the two bits. */
const ALPHABET = "0123456789abcdefghjkmnpqrstvwxyz";

function randomChars(count) {
  /* Rejection sampling. The alphabet is 32 characters, which *is* a power of
     two, so `% 32` over a byte is unbiased — but the guard costs nothing and
     survives somebody changing the alphabet later, which is exactly when a
     silent modulo bias would appear. */
  const limit = 256 - (256 % ALPHABET.length);
  let out = "";
  while (out.length < count) {
    const bytes = crypto.getRandomValues(new Uint8Array(count));
    for (const byte of bytes) {
      if (byte >= limit) continue;
      out += ALPHABET[byte % ALPHABET.length];
      if (out.length === count) break;
    }
  }
  return out;
}

/** A new id of a given kind. */
export function newId(kind) {
  return `${kind}_${Date.now().toString(36)}_${randomChars(13)}`;
}

/** Whether a string is one of ours, optionally of a particular kind. */
export function isId(value, kind) {
  if (typeof value !== "string" || value.length > 64) return false;
  const match = /^([a-z]{2,8})_([0-9a-z]{6,10})_([0-9a-hjkmnp-tv-z]{13})$/.exec(value);
  return Boolean(match) && (!kind || match[1] === kind);
}

/* The kinds. Named here rather than spelled at each call site, so a typo is a
   missing export rather than a second kind of id that looks nearly right. */
export const ID = {
  message: () => newId("msg"),
  block: () => newId("blk"),
  button: () => newId("btn"),
  user: () => newId("usr"),
  role: () => newId("rol"),
  embed: () => newId("emb"),
  field: () => newId("fld"),
  item: () => newId("itm"),
  /** A saved mockup. Also the key its cloud copy is stored under. */
  mockup: () => newId("mk"),
  /** A backup in this browser. */
  backup: () => newId("bk"),
  generic: () => newId("id"),
};

/* A share id is deliberately not one of the above.
 *
 * It is the whole of the secret: anyone holding it can read the mockup. So it
 * carries no timestamp — that would say when the link was made and narrow a
 * guess — and it is sized for the job rather than for readability. Fourteen
 * characters of this alphabet is 70 bits, which at any rate a network will
 * carry is not enumerable.
 */
export const newShareId = () => randomChars(14);

/** Share ids are matched exactly, never parsed. */
export const isShareId = (value) =>
  typeof value === "string" && /^[0-9a-hjkmnp-tv-z]{14}$/.test(value);
