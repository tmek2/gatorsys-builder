/* Fetching one picture on the page's behalf.
 *
 * A GIF chosen from KLIPY lives on KLIPY's CDN, and a picture the browser did
 * not fetch itself cannot be read back out of a canvas: the export rasterises
 * the mockup through a canvas, and a cross-origin image with no CORS header
 * taints it. The whole export then fails, which is how "the export failed" was
 * reported — with the reasonable follow-up that a GIF picker whose GIFs cannot
 * be exported is not a GIF picker.
 *
 * So the bytes come through here on the way in, and what lands in the mockup
 * is the picture itself rather than a link to it. That also makes the mockup
 * self-contained: it survives the CDN expiring the URL, and it travels whole
 * in a project file or a share link.
 *
 * This is a fetch-on-behalf endpoint, which is the shape of thing that becomes
 * somebody's port scanner, so it is written closed:
 *
 *   - https only, and every redirect hop re-checked rather than followed
 *     blind, because a public host may redirect to 127.0.0.1;
 *   - every address the host resolves to must be a public one;
 *   - the answer must be a picture or a video, and a small one;
 *   - and it is rate limited like the other routes that do work for a caller.
 */

import { lookup } from "node:dns/promises";
import { isPublicAddress } from "@/lib/net";
import { callerKey, limit, tooMany } from "@/lib/rate-limit";

export const runtime = "nodejs";
/* The URL is the whole of the request, so the answer is cacheable — and the
   same GIF picked twice should cost the CDN once. */
export const revalidate = 3600;

/* Past this a picture is not a picture in a mockup, it is a download somebody
   is doing through this deployment. A KLIPY gif is a few hundred kilobytes. */
const MAX_BYTES = 12 * 1024 * 1024;
const MAX_HOPS = 3;

const KIND = /^(image|video)\//i;

async function reachable(hostname) {
  /* Brackets stripped first, or an IPv6 literal is handed to the resolver as
     "[::1]", fails to resolve, and is refused for the wrong reason — while an
     IPv4 literal resolves to itself and is judged properly. Same rule for
     both. */
  const host = hostname.replace(/^\[|\]$/g, "");
  /* Every address, not the first one: a host that answers with one public and
     one private address would otherwise be a way in.
     What this does not close is DNS rebinding — the name is resolved again by
     `fetch`, and a hostile resolver can answer differently the second time.
     Closing that means dialling the address that was checked and carrying the
     name in a header, which Node's `fetch` will not do. The exposure is a
     request to an internal address whose body this route then refuses unless
     it is a picture, which is a long way short of a reply somebody can read. */
  const addresses = await lookup(host, { all: true, verbatim: true });
  return addresses.length > 0 && addresses.every((a) => isPublicAddress(a.address));
}

/** The URL to fetch, or `null` if it is not one this may fetch. */
async function allowed(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  if (!(await reachable(url.hostname).catch(() => false))) return null;
  return url;
}

export async function GET(request) {
  const asked = new URL(request.url).searchParams.get("url") ?? "";

  const gate = await limit("media", callerKey(request), { max: 120, windowSeconds: 600 });
  if (!gate.ok) return tooMany(gate.retryAfter);

  let next = await allowed(asked);
  if (!next) return Response.json({ error: "That is not a URL this can fetch." }, { status: 400 });

  let response = null;
  for (let hop = 0; hop < MAX_HOPS && next; hop += 1) {
    /* Manual, so a redirect to a private address is checked rather than
       followed. `fetch` following it itself would do so past every check
       above. */
    response = await fetch(next, { redirect: "manual", headers: { accept: "image/*,video/*" } }).catch(() => null);
    if (!response) return Response.json({ error: "That could not be fetched." }, { status: 502 });
    if (response.status < 300 || response.status > 399) break;
    const to = response.headers.get("location");
    next = to ? await allowed(new URL(to, next).href) : null;
    response = null;
  }

  if (!response || !response.ok) {
    return Response.json({ error: "That could not be fetched." }, { status: 502 });
  }

  const type = response.headers.get("content-type") ?? "";
  if (!KIND.test(type)) {
    return Response.json({ error: "That is not a picture." }, { status: 415 });
  }

  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_BYTES) {
    return Response.json({ error: "That picture is too large." }, { status: 413 });
  }

  /* Read rather than stream through: the cap has to hold even when the server
     did not declare a length, and a body is not trustworthy about its own
     size. */
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > MAX_BYTES) {
    return Response.json({ error: "That picture is too large." }, { status: 413 });
  }

  return new Response(bytes, {
    headers: {
      "content-type": type.split(";")[0].trim(),
      "content-length": String(bytes.byteLength),
      "cache-control": "public, max-age=3600, s-maxage=86400",
      /* It is a picture, and it is going into a canvas. Nothing here should
         ever be read as a document. */
      "content-disposition": "inline",
      "x-content-type-options": "nosniff",
    },
  });
}
