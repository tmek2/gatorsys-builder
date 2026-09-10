/* Signing out.
 *
 * There was no way to. The account chip signed you in and then the session sat
 * there until it expired, which is not a thing to leave without on a shared
 * machine — so the expanded account pill posts here.
 *
 * A POST rather than a link, and the origin is checked, because a GET that
 * signs somebody out can be triggered by any page that can make the browser
 * load a URL — an <img> on a forum is enough. Signing out is not the worst
 * thing that can be done to somebody, but it is still somebody else deciding
 * it, and the check costs three lines.
 *
 * Auth.js's own `/api/auth/signout` wants a CSRF token fetched from a second
 * endpoint first. This is the same protection with one round trip.
 */

import { signOut } from "@/auth";

export async function POST(request) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");

  /* Same-origin or nothing. A form post from this app always carries `origin`;
     one from anywhere else carries a different one, and the fetch API cannot
     forge it. */
  if (!origin || !host || new URL(origin).host !== host) {
    return Response.json({ error: "That request did not come from here." }, { status: 403 });
  }

  /* `redirect: false` so this returns rather than throwing the redirect Auth.js
     would otherwise use to leave the route; the caller decides where to go. */
  await signOut({ redirect: false });
  return Response.json({ ok: true });
}
