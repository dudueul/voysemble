// Copyright 2026- At Day. All rights reserved.
// Thumbnails are made on the device (D34): Workers have no image codec. The longest edge becomes
// `maxEdge` pixels in the same format as the original, so the server's type check passes. Null
// when the browser cannot decode or draw (then the server accepts the original alone when it is
// small enough, and refuses otherwise with a clear message).

export const THUMBNAIL_EDGE = 320;

const TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export async function makeThumbnail(file: Blob, maxEdge = THUMBNAIL_EDGE): Promise<Blob | null> {
  if (!TYPES.has(file.type)) return null;
  if (typeof createImageBitmap !== 'function' || typeof OffscreenCanvas === 'undefined') {
    return null;
  }
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    return await canvas.convertToBlob({ type: file.type, quality: 0.85 });
  } catch {
    return null;
  }
}
