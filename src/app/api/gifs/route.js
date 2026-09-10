/* GIFs, from Giphy.
 *
 * Discord's own picker is Tenor's, and Tenor is where this pointed until Tenor
 * stopped being an option: its v2 API needs a Google Cloud key, there is no
 * anonymous tier, and the v1 demo key everybody used is switched off. Giphy
 * gives out a key, and this deployment has one — in `GIPHY`.
 *
 * Proxied rather than called from the browser, so the key stays on the server.
 * Without one the route says so rather than returning an empty grid: a picker
 * that explains why it is empty is worth more than a search box that silently
 * finds nothing.
 */

const BASE = "https://api.giphy.com/v1/gifs";

export const revalidate = 3600;

/* Two sizes out of the dozen Giphy returns: a small still for the grid, and
   the GIF itself for the mockup. `fixed_width_small` is about 100px wide and
   `downsized_medium` is capped at 5MB, which keeps a mockup that carries a few
   of them from becoming a file nobody can send. */
function pick(item) {
  const images = item?.images ?? {};
  const preview =
    images.fixed_width_small?.url ?? images.preview_gif?.url ?? images.fixed_width?.url ?? null;
  const src =
    images.downsized_medium?.url ?? images.fixed_width?.url ?? images.original?.url ?? null;
  if (!preview || !src) return null;
  return { id: item.id, label: item.title?.trim() || "GIF", preview, src };
}

export async function GET(request) {
  const key = process.env.GIPHY;
  if (!key) return Response.json({ gifs: [], unconfigured: true }, { status: 200 });

  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  const params = new URLSearchParams({
    api_key: key,
    limit: "30",
    /* Giphy's own ratings. "g" is what a tool that draws pictures of a chat
       anybody might be shown should be asking for. */
    rating: "g",
    bundle: "messaging_non_clips",
  });
  if (query) params.set("q", query);

  try {
    const response = await fetch(`${BASE}/${query ? "search" : "trending"}?${params}`, {
      next: { revalidate: query ? 0 : revalidate },
    });
    if (!response.ok) throw new Error(String(response.status));
    const body = await response.json();
    const gifs = (body.data ?? []).map(pick).filter(Boolean);
    return Response.json({ gifs });
  } catch {
    return Response.json({ gifs: [], unavailable: true }, { status: 200 });
  }
}
