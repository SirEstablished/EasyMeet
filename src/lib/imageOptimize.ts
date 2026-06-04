/**
 * Browser-side image compression using Canvas.
 * - Resizes to fit within `maxDim` (default 1200) preserving aspect ratio
 * - Encodes as JPEG (or PNG if source PNG has alpha)
 * - Iteratively lowers quality until <= maxSizeKB (default 500)
 */
export interface OptimizeOptions {
  maxDim?: number;
  maxSizeKB?: number;
}

export async function optimizeImage(
  file: File,
  opts: OptimizeOptions = {},
): Promise<File> {
  if (typeof window === "undefined") return file;
  if (!file.type.startsWith("image/")) return file;
  const maxDim = opts.maxDim ?? 1200;
  const maxBytes = (opts.maxSizeKB ?? 500) * 1024;

  const bitmap = await loadBitmap(file);
  const { width, height } = fitIn(bitmap.width, bitmap.height, maxDim);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.drawImage(bitmap as CanvasImageSource, 0, 0, width, height);

  const pngWithAlpha = file.type === "image/png" && (await hasAlpha(bitmap));
  const mime = pngWithAlpha ? "image/png" : "image/jpeg";
  const ext = pngWithAlpha ? "png" : "jpg";
  const baseName = file.name.replace(/\.[^.]+$/, "") || "image";
  const outName = `${baseName}.${ext}`;

  if (pngWithAlpha) {
    const blob = await canvasToBlob(canvas, "image/png", 1);
    return new File([blob], outName, { type: "image/png" });
  }

  let quality = 0.9;
  let blob = await canvasToBlob(canvas, mime, quality);
  while (blob.size > maxBytes && quality > 0.4) {
    quality -= 0.1;
    blob = await canvasToBlob(canvas, mime, quality);
  }
  // If still too big, shrink further
  let w = width;
  let h = height;
  while (blob.size > maxBytes && Math.min(w, h) > 400) {
    w = Math.round(w * 0.85);
    h = Math.round(h * 0.85);
    canvas.width = w;
    canvas.height = h;
    ctx.drawImage(bitmap as CanvasImageSource, 0, 0, w, h);
    blob = await canvasToBlob(canvas, mime, quality);
  }
  return new File([blob], outName, { type: mime });
}

function fitIn(w: number, h: number, max: number) {
  if (w <= max && h <= max) return { width: w, height: h };
  const r = w / h;
  if (w >= h) return { width: max, height: Math.round(max / r) };
  return { width: Math.round(max * r), height: max };
}

async function loadBitmap(file: File): Promise<HTMLImageElement | ImageBitmap> {
  if ("createImageBitmap" in window) {
    try {
      return await createImageBitmap(file);
    } catch {
      // fallthrough
    }
  }
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(e);
    };
    img.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Canvas toBlob failed"))),
      type,
      quality,
    );
  });
}

async function hasAlpha(bmp: HTMLImageElement | ImageBitmap): Promise<boolean> {
  try {
    const c = document.createElement("canvas");
    const w = Math.min(bmp.width, 64);
    const h = Math.min(bmp.height, 64);
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d");
    if (!ctx) return false;
    ctx.drawImage(bmp as CanvasImageSource, 0, 0, w, h);
    const data = ctx.getImageData(0, 0, w, h).data;
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] < 255) return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}