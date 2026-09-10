/* Preparing an uploaded image for a slot that is a fixed-size circle.
 *
 * Discord crops an avatar to a square when you upload it and the client masks
 * a circle out of that square. Reading the file straight into a data URI skips
 * the first half: a 4000×3000 photo arrives whole, `object-fit: cover` hides
 * three quarters of it behind the mask, and the four megabytes it costs are
 * spent on pixels nobody will ever see — out of the same budget the cloud
 * backup is capped at.
 *
 * So do what Discord does. Take the largest centred square the image contains,
 * scale it to a size the slot can actually use, and hand back that.
 */

/* Big enough for the largest circle drawn anywhere here — a 40px avatar with a
 * 1.2× decoration over it, exported at 4× — with room over. Past this the
 * extra pixels are invisible and cost kilobytes. */
export const AVATAR_SIZE = 256;

/* An animated avatar is a real Discord thing, and a canvas would flatten it to
 * its first frame. Better a large GIF than a still one; `object-fit: cover`
 * still masks it correctly at render. */
/* WebP is in here for the same reason: an animated one is common now — KLIPY
   serves its previews as webp — and a canvas would hand back its first frame
   with no way to tell that had happened. A still webp pays a few kilobytes for
   the safety. */
const ANIMATED = /^image\/(gif|apng|webp)$/i;

/* SVG has no intrinsic pixel size worth cropping to, and rasterising one throws
 * away the reason to use it. It is already tiny. */
const VECTOR = /^image\/svg/i;

function load(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("decode"));
    img.src = url;
  });
}

/* PNG unless the source cannot have carried transparency. A JPEG re-encoded as
 * PNG is usually *larger* than the original, and an avatar photographed rather
 * than drawn is the common case. */
function encode(canvas, type) {
  if (type === "image/jpeg" || type === "image/jpg") return canvas.toDataURL("image/jpeg", 0.92);
  /* WebP is a third the size at the same quality and every browser that can
     run this app can write it — but only trust it if the browser actually
     produced one, because a refusal comes back as a silent PNG. */
  const webp = canvas.toDataURL("image/webp", 0.92);
  return webp.startsWith("data:image/webp") ? webp : canvas.toDataURL("image/png");
}

/**
 * Centre-crop a file to a square and scale it down to at most `size` px.
 *
 * Falls back to the untouched file whenever cropping would lose something —
 * an animation, a vector — or whenever the browser refuses, because a working
 * upload of the wrong shape beats a failed one.
 *
 * @returns {Promise<string>} a data URI
 */
export async function squareCrop(file, size = AVATAR_SIZE) {
  const raw = await readAsDataUrl(file);
  if (ANIMATED.test(file.type) || VECTOR.test(file.type)) return raw;

  try {
    const img = await load(raw);
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    if (!side) return raw;

    // Never scale up: a 64px avatar stays 64px rather than being blown up to
    // 256 and losing sharpness to the interpolation.
    const out = Math.min(size, side);
    const canvas = document.createElement("canvas");
    canvas.width = out;
    canvas.height = out;

    const ctx = canvas.getContext("2d");
    if (!ctx) return raw;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(
      img,
      (img.naturalWidth - side) / 2,
      (img.naturalHeight - side) / 2,
      side,
      side,
      0,
      0,
      out,
      out,
    );

    const encoded = encode(canvas, file.type);
    // A crop that came out bigger than the original is not an improvement.
    return encoded.length < raw.length ? encoded : raw;
  } catch {
    return raw;
  }
}

export function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("read"));
    reader.readAsDataURL(file);
  });
}


/* The same idea for a picture that is not a circle.
 *
 * An attachment, an embed's image, a profile banner: none of them are cropped
 * to a square, but all of them arrive as whatever came off a camera. A 12MP
 * photo dropped into a mockup is twenty times more data than the slot can
 * show, and every byte of it goes into the project, the share link and the
 * cloud backup. Scale it to something the largest slot can actually use and
 * keep the shape it came in.
 */
export const MEDIA_SIZE = 1280;

export async function fitWithin(file, max = MEDIA_SIZE) {
  const raw = await readAsDataUrl(file);
  if (ANIMATED.test(file.type) || VECTOR.test(file.type)) return raw;

  try {
    const img = await load(raw);
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    if (!w || !h) return raw;

    // Never scale up. A 400px wide screenshot stays 400px wide.
    const scale = Math.min(1, max / Math.max(w, h));
    if (scale === 1) return raw;

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);

    const ctx = canvas.getContext("2d");
    if (!ctx) return raw;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const encoded = encode(canvas, file.type);
    return encoded.length < raw.length ? encoded : raw;
  } catch {
    return raw;
  }
}
