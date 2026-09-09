/* Discord's own sticker packs.
 *
 * The picker used to offer the emoji library as a stand-in for stickers, which
 * is not what a sticker looks like. Discord publishes its default packs at an
 * endpoint that needs no token — it is what the web client calls before you
 * have logged in — so the real artwork is available and the mockups can use
 * it.
 *
 * Fetched here rather than in the browser for two reasons: the endpoint sends
 * no CORS header, and one request per visitor to a third party is a request
 * this tool does not need to make. Cached for a day; the packs change a few
 * times a year.
 */

const SOURCE = "https://discord.com/api/v10/sticker-packs";
const CDN = "https://media.discordapp.net/stickers";

/* A day, and `stale-while-revalidate` so a slow upstream never blocks a
   picker: the last good answer is served while a new one is fetched. */
export const revalidate = 86400;

export async function GET() {
  try {
    const response = await fetch(SOURCE, {
      headers: { accept: "application/json" },
      next: { revalidate },
    });
    if (!response.ok) throw new Error(String(response.status));
    const body = await response.json();

    /* Only what a picker needs. The upstream payload carries descriptions,
       banner ids, sku ids and cover-sticker ids — kilobytes per pack that
       would be sent to every visitor for nothing. */
    const packs = (body.sticker_packs ?? []).map((pack) => ({
      id: pack.id,
      name: pack.name,
      stickers: (pack.stickers ?? []).map((sticker) => ({
        id: sticker.id,
        name: sticker.name,
        /* Format 1 is PNG and 2 is APNG; both are served as .png. Format 3 is
           Lottie, which is a JSON animation an <img> cannot draw, and 4 is
           GIF. Anything this cannot draw is left out rather than shipped as a
           broken tile. */
        src:
          sticker.format_type === 4
            ? `${CDN}/${sticker.id}.gif`
            : sticker.format_type === 3
              ? null
              : `${CDN}/${sticker.id}.png?size=320`,
      })).filter((sticker) => sticker.src),
    })).filter((pack) => pack.stickers.length);

    return Response.json({ packs });
  } catch {
    /* The picker's other tabs still work, so this is a missing option rather
       than an error worth interrupting somebody over. */
    return Response.json({ packs: [], unavailable: true }, { status: 200 });
  }
}
