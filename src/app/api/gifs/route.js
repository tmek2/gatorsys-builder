/* GIFs, from KLIPY.
 *
 * Discord's own picker is Tenor's, and Tenor is not an option: its v2 API needs
 * a Google Cloud key, there is no anonymous tier, and the demo key everybody
 * used is switched off. Giphy was the stop on the way. KLIPY is where this
 * deployment's key is, and it is the closer fit anyway — it serves the two
 * things Discord's picker is made of, a trending grid and a set of categories,
 * from one API.
 *
 * The v1 shape, which is KLIPY's own rather than the Tenor-compatible v2 one,
 * because v2 has no categories:
 *
 *   GET /api/v1/{key}/gifs/trending?page&per_page&customer_id&content_filter
 *   GET /api/v1/{key}/gifs/search?q&page&per_page&customer_id&content_filter
 *   GET /api/v1/{key}/gifs/categories?locale
 *
 * and the body comes back as `{ result, data: { data: [...], current_page,
 * per_page, has_next } }`.
 *
 * Proxied rather than called from the browser, so the key stays on the server.
 * Without one the route says so rather than returning an empty grid: a picker
 * that explains why it is empty is worth more than a search box that silently
 * finds nothing.
 */

const BASE = "https://api.klipy.com/api/v1";
const PER_PAGE = 24;

export const revalidate = 3600;

/* The key. `KLIPY` is the name it is set under; the longer one is accepted so
   a deployment that followed KLIPY's own docs works without being renamed. */
const key = () => process.env.KLIPY || process.env.KLIPY_API_KEY || "";

/* One picture out of an item.
 *
 * The file object is a set of sizes, each holding a set of formats, and which
 * sizes exist depends on the item. Rather than name one path and break on the
 * item that does not have it, this walks the sizes in the order it wants them
 * and takes the first format it can use. Some responses put the formats
 * straight on `file`, so that is tried last. */
function variant(file, sizes, formats) {
  for (const size of sizes) {
    const at = file?.[size];
    if (!at) continue;
    for (const format of formats) {
      if (at[format]?.url) return at[format];
    }
  }
  for (const format of formats) {
    if (file?.[format]?.url) return file[format];
  }
  return null;
}

function asGif(item) {
  const file = item?.file ?? item?.files ?? null;
  /* Small and still-ish for the grid, the real thing for the mockup. A webp
     preview is a third of the weight of the gif and every browser that can run
     this can draw one. */
  const preview = variant(file, ["xs", "sm", "md"], ["webp", "gif"]);
  const full = variant(file, ["md", "hd", "lg", "original", "sm"], ["gif", "webp"]);
  if (!preview?.url || !full?.url) return null;
  return {
    id: String(item.id ?? item.slug ?? full.url),
    label: (item.title || item.slug || "GIF").replace(/[-_]+/g, " ").trim(),
    preview: preview.url,
    src: full.url,
    /* The grid lays out in columns of a fixed width and lets each cell take the
       height its picture needs, the way the client's does. That needs the
       shape before the picture has loaded. */
    ratio: preview.width && preview.height ? preview.width / preview.height : 1,
  };
}

async function call(path, params) {
  const url = `${BASE}/${key()}/${path}?${new URLSearchParams(params)}`;
  const response = await fetch(url, { next: { revalidate: params.q ? 0 : revalidate } });
  if (!response.ok) throw new Error(String(response.status));
  const body = await response.json();
  return body?.data ?? {};
}

export async function GET(request) {
  if (!key()) return Response.json({ gifs: [], unconfigured: true }, { status: 200 });

  const asked = new URL(request.url).searchParams;
  const query = asked.get("q")?.trim() ?? "";
  const page = Math.max(1, Math.min(40, Number(asked.get("page")) || 1));
  const wantsCategories = asked.get("categories") === "1";

  /* Everything this asks for is drawn in a picture of a chat that anybody
     might be shown, so it asks for the safe end of the catalogue. */
  const common = {
    customer_id: "gator-mockups",
    content_filter: "high",
    locale: "en",
  };

  try {
    if (wantsCategories) {
      const data = await call("gifs/categories", common);
      const list = Array.isArray(data) ? data : (data.data ?? []);
      const categories = list
        .map((c) => ({
          name: String(c?.name ?? c?.title ?? c ?? "").trim(),
          preview: variant(c?.file ?? c?.image ?? null, ["xs", "sm", "md"], ["webp", "gif"])?.url ?? null,
        }))
        .filter((c) => c.name);
      return Response.json({ categories });
    }

    const data = await call(query ? "gifs/search" : "gifs/trending", {
      ...common,
      page: String(page),
      per_page: String(PER_PAGE),
      ...(query ? { q: query } : {}),
    });
    const gifs = (data.data ?? []).map(asGif).filter(Boolean);
    return Response.json({ gifs, page: data.current_page ?? page, hasMore: Boolean(data.has_next) });
  } catch {
    return Response.json({ gifs: [], unavailable: true }, { status: 200 });
  }
}
