/* Two tabs, one working copy.
 *
 * The editor keeps what you are working on in one slot in IndexedDB and
 * restores it when you come back. That is the right model for one tab and a
 * trap for two: both write the same slot, so a tab left open on yesterday's
 * mockup will put yesterday's mockup over this morning's the moment anybody
 * types in it.
 *
 * Two things close that. The stamp — see the builder — is the safety net: a
 * counter beside the working copy that says who wrote it last, checked inside
 * the same transaction that writes it, so the slower tab cannot win a race it
 * did not know it was in. This file is the other half: a message the writing
 * tab sends to every other tab the instant it writes, so a tab that has
 * nothing of its own to lose quietly catches up instead of drifting far enough
 * to have something to argue about.
 *
 * BroadcastChannel is not everywhere, and a message can be missed. Nothing
 * here is load-bearing on its own; losing it costs a needless question, not
 * somebody's work.
 */

const NAME = "gator-mockups-working-copy";

/** This tab, for as long as the page is open. Not stored: two tabs restored
 *  from the same session must not come back as the same tab. */
export const TAB = `tab_${Math.random().toString(36).slice(2, 10)}`;

function channel() {
  try {
    return typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel(NAME);
  } catch {
    /* Blocked storage takes this with it in some browsers. */
    return null;
  }
}

/** Tell the other tabs that the working copy has moved on. */
export function announce(seq) {
  const bus = channel();
  if (!bus) return;
  try {
    bus.postMessage({ tab: TAB, seq });
  } catch {
    /* Nothing depends on this arriving. */
  } finally {
    bus.close();
  }
}

/** Listen for another tab writing. Returns the unsubscribe. */
export function onAnnounce(run) {
  const bus = channel();
  if (!bus) return () => {};
  const handle = (event) => {
    const data = event.data;
    /* Our own messages come back to us in some browsers, and a tab has
       nothing to learn from itself. */
    if (!data || data.tab === TAB || typeof data.seq !== "number") return;
    run(data.seq);
  };
  bus.addEventListener("message", handle);
  return () => {
    bus.removeEventListener("message", handle);
    bus.close();
  };
}
