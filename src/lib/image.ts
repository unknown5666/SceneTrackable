// ============================================================
// IMAGE HANDLING — client-side downscale for the URL-first media fields
// ============================================================
//
// The whole store persists to localStorage and syncs to Supabase as one blob
// (see the cloud payload constraint), so a locally-picked image can't be stored
// at anything like full size. Everything here exists to turn a picked File into
// a tiny JPEG data-URI: capped to ~200px on the long edge and hard-capped by
// byte size, dropping JPEG quality until it fits. URLs are always preferred;
// this is the fallback for "I don't have a link, just this photo".

/** Long-edge pixel cap for a downscaled upload. */
export const MAX_IMAGE_PX = 200;
/** Hard byte cap for the resulting data-URI. */
export const MAX_IMAGE_BYTES = 50 * 1024;

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not read that image."));
    img.src = dataUrl;
  });
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read that file."));
    reader.readAsDataURL(file);
  });
}

/**
 * A picked image file as a small JPEG data-URI, or a thrown error the caller
 * shows. Scales the long edge to `maxPx`, then steps quality down until the
 * encoded string is under `maxBytes` — a last resort shrinks the pixels too, so
 * even a huge photo can't blow the payload budget.
 */
export async function downscaleImage(
  file: File,
  maxPx = MAX_IMAGE_PX,
  maxBytes = MAX_IMAGE_BYTES
): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("That file isn't an image.");
  }
  const source = await loadImage(await readFileAsDataUrl(file));

  let scale = Math.min(1, maxPx / Math.max(source.width, source.height));
  for (let attempt = 0; attempt < 6; attempt++) {
    const w = Math.max(1, Math.round(source.width * scale));
    const h = Math.max(1, Math.round(source.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Image processing isn't supported here.");
    ctx.drawImage(source, 0, 0, w, h);

    // Walk quality down first — it's cheaper than dropping resolution.
    for (const quality of [0.72, 0.6, 0.48, 0.36]) {
      const dataUrl = canvas.toDataURL("image/jpeg", quality);
      if (dataUrl.length <= maxBytes) return dataUrl;
    }
    // Still too big at the smallest quality — shrink the pixels and retry.
    scale *= 0.75;
  }
  throw new Error("That image is too detailed to store — try a smaller crop or a URL instead.");
}

/** A trimmed value that is safe to store as an image reference. */
export function isDataUri(v: string | undefined | null): boolean {
  return !!v && v.startsWith("data:");
}
