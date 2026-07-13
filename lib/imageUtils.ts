// Client-side image compression for recipe photos.
// The result is a small JPEG data-URL stored directly in `recipe.imageUrl`
// (localStorage in demo mode, the `recipes.image_url` text column in
// Supabase) — no storage bucket to configure, works identically in both modes.

const MAX_DIMENSION = 640;
const JPEG_QUALITY = 0.72;
// ~300KB de data-URL: bastante más de lo que produce 640px q0.72 (~40-80KB);
// si se supera es señal de una imagen rara y preferimos rechazarla.
const MAX_RESULT_LENGTH = 300_000;

async function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    try {
      // "from-image" respeta la orientación EXIF (fotos de celular giradas)
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      // algunos navegadores viejos no soportan las opciones — cae al <img>
    }
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("No se pudo leer la imagen"));
    };
    img.src = url;
  });
}

/** Comprime una foto a un JPEG chico (máx. 640px) y la devuelve como data-URL. */
export async function compressImageToDataUrl(file: File): Promise<string> {
  const bitmap = await loadBitmap(file);
  const width = "width" in bitmap ? bitmap.width : 0;
  const height = "height" in bitmap ? bitmap.height : 0;
  if (!width || !height) throw new Error("Imagen inválida");

  const scale = Math.min(1, MAX_DIMENSION / Math.max(width, height));
  const w = Math.round(width * scale);
  const h = Math.round(height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No se pudo procesar la imagen");
  // Fondo blanco para PNGs con transparencia (JPEG no tiene alpha)
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bitmap, 0, 0, w, h);

  const dataUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
  if (dataUrl.length > MAX_RESULT_LENGTH) {
    throw new Error("La imagen quedó demasiado pesada, probá con otra foto");
  }
  return dataUrl;
}
