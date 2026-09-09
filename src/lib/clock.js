/* Making a mockup read like a conversation that happened over time.
 *
 * Every message carrying "Today at 10:00" is the tell that gives a mockup
 * away: a real channel's timestamps climb. But they do not climb evenly — a
 * run of replies lands inside the same minute and then there is a gap — so a
 * counter that adds a minute per message looks as artificial as one that adds
 * nothing.
 *
 * So: messages come in small bursts, and the clock moves between bursts. The
 * default burst is three, which is roughly how many messages a person sends
 * before someone answers.
 */

/** How many messages share a minute before the clock moves on. */
export const BURST = 3;

const AT = " at ";

/** Split "Today at 10:03" into its day and its time, either of which may be absent. */
export function readStamp(stamp) {
  const text = (stamp ?? "").trim();
  if (!text) return null;
  const i = text.indexOf(AT);
  if (i === -1) return null;
  const day = text.slice(0, i);
  const clock = text.slice(i + AT.length).trim();
  const match = /^(\d{1,2}):(\d{2})(?:\s*(am|pm))?$/i.exec(clock);
  if (!match) return null;

  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const suffix = match[3]?.toLowerCase() ?? null;
  if (suffix === "pm" && hour < 12) hour += 12;
  if (suffix === "am" && hour === 12) hour = 0;
  if (hour > 23 || minute > 59) return null;

  return { day, hour, minute, suffix };
}

/** Put one back together in the shape it arrived in — 24-hour or am/pm. */
export function writeStamp({ day, hour, minute, suffix }) {
  const pad = (n) => String(n).padStart(2, "0");
  if (!suffix) return `${day}${AT}${pad(hour)}:${pad(minute)}`;
  const half = hour % 12 === 0 ? 12 : hour % 12;
  return `${day}${AT}${half}:${pad(minute)} ${hour < 12 ? "am" : "pm"}`;
}

/**
 * The stamp for a message added after `messages`.
 *
 * Counts back through the run to see how many messages already share the last
 * timestamp; once a burst is full the clock advances by a minute. Returns the
 * previous stamp verbatim when it cannot be read, because a timestamp somebody
 * typed by hand is theirs and guessing at it would be worse than repeating it.
 */
export function nextStamp(messages, burst = BURST) {
  const last = messages.at(-1);
  if (!last) return null;
  const parsed = readStamp(last.timestamp);
  if (!parsed) return last.timestamp ?? null;

  let shared = 0;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i].timestamp !== last.timestamp) break;
    shared += 1;
  }
  if (shared < burst) return last.timestamp;

  const minute = parsed.minute + 1;
  return writeStamp({
    ...parsed,
    minute: minute % 60,
    hour: (parsed.hour + Math.floor(minute / 60)) % 24,
  });
}

/**
 * Restamp a whole conversation from its first message, in bursts.
 *
 * For a mockup built out of order, or one where every message ended up on the
 * same minute. The first message's stamp is the anchor and is left alone.
 */
export function restamp(messages, burst = BURST) {
  const first = messages.find((m) => readStamp(m.timestamp));
  const anchor = first && readStamp(first.timestamp);
  if (!anchor) return messages;

  let { hour, minute } = anchor;
  let inBurst = 0;

  return messages.map((message, index) => {
    if (index > 0) {
      inBurst += 1;
      if (inBurst >= burst) {
        inBurst = 0;
        minute += 1;
        if (minute >= 60) {
          minute -= 60;
          hour = (hour + 1) % 24;
        }
      }
    }
    return { ...message, timestamp: writeStamp({ ...anchor, hour, minute }) };
  });
}

/* How long Discord will keep stacking messages from the same person.
 *
 * The client groups consecutive messages from one author under a single header
 * — one avatar, one name, one timestamp — and breaks the group when somebody
 * else speaks, when the day changes, or when more than seven minutes have
 * passed. Seven is the client's own number.
 */
export const GROUP_WINDOW_MINUTES = 7;

/** Minutes into the day, for two stamps that can be read. */
const minutes = (stamp) => {
  const at = readStamp(stamp);
  return at ? { day: at.day, total: at.hour * 60 + at.minute } : null;
};

/**
 * Whether `message` should be drawn under `previous` without its own header.
 *
 * A reply, a slash-command header, a system message or an author change always
 * starts a new group — the client pulls all of those out of a stack — and so
 * does a gap of more than seven minutes.
 */
export function groupsWith(previous, message) {
  if (!previous || !message) return false;
  if (previous.kind === "system" || message.kind === "system") return false;
  if (previous.user !== message.user) return false;
  if (message.reply || message.interaction || message.forwarded) return false;

  const a = minutes(previous.timestamp);
  const b = minutes(message.timestamp);
  /* A stamp somebody typed by hand may not parse. Two that cannot be read are
     treated as the same moment, which is what a mockup with one timestamp
     repeated down the column means. */
  if (!a || !b) return previous.timestamp === message.timestamp;
  if (a.day !== b.day) return false;
  return b.total - a.total >= 0 && b.total - a.total <= GROUP_WINDOW_MINUTES;
}
