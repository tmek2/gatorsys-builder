/* GIFs, from Tenor, which is where Discord's own picker gets them.
 *
 * Tenor's v2 API needs a Google Cloud key. There is no free anonymous tier and
 * the old v1 demo key everybody used has been switched off, so this cannot
 * ship with one — the deployment supplies `TENOR_API_KEY` or the picker says
 * the tab is not set up and offers its other tabs, which is better than a
 * search box that silently returns nothing.
 *
 * Proxied rather than called from the browser so the key stays on the server.
 */

const BASE = "https://tenor.googleapis.com/v2";

export const revalidate = 3600;

export async function GET(request) {
  const key = process.env.TENOR_API_KEY;
  if (!key) return Response.json({ gifs: [], unconfigured: true }, { status: 200 });

  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  const params = new URLSearchParams({
    key,
    client_key: "gator_mockups",
    limit: "30",
    /* Two sizes only: a small still for the grid, and the GIF itself for the
       mockup. The full payload carries eight formats per result. */
    media_filter: "tinygif,gif",
    contentfilter: "high",
  });
  if (query) params.set("q", query);

  try {
    const response = await fetch(
      `${BASE}/${query ? "search" : "featured"}?${params}`,
      { next: { revalidate: query ? 0 : revalidate } },
    );
    if (!response.ok) throw new Error(String(response.status));
    const body = await response.json();

    const gifs = (body.results ?? [])
      .map((result) => ({
        id: result.id,
        label: result.content_description || "GIF",
        preview: result.media_formats?.tinygif?.url ?? null,
        src: result.media_formats?.gif?.url ?? null,
      }))
      .filter((gif) => gif.src && gif.preview);

    return Response.json({ gifs });
  } catch {
    return Response.json({ gifs: [], unavailable: true }, { status: 200 });
  }
}
