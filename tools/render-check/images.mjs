// Read and write PNG pictures as plain RGB pixel arrays (uses MuPDF's PNG code, no extra packages).
import * as mupdf from 'mupdf';
import { readFileSync, writeFileSync } from 'node:fs';

// -> { w, h, rgb: Uint8Array of w*h*3 }
export function readPNG(path) {
  const pix = new mupdf.Image(readFileSync(path)).toPixmap();
  const out = pixmapToRGB(pix);
  pix.destroy();
  return out;
}

export function pixmapToRGB(pix) {
  const w = pix.getWidth(), h = pix.getHeight(), n = pix.getStride() / w; // bytes per pixel, alpha included
  const stride = pix.getStride(), src = pix.getPixels(), rgb = new Uint8Array(w * h * 3);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const s = y * stride + x * n, d = (y * w + x) * 3;
    if (n >= 3) { rgb[d] = src[s]; rgb[d + 1] = src[s + 1]; rgb[d + 2] = src[s + 2]; }
    else rgb[d] = rgb[d + 1] = rgb[d + 2] = src[s];
  }
  return { w, h, rgb };
}

export function writePNG(path, { w, h, rgb }) {
  const pix = new mupdf.Pixmap(mupdf.ColorSpace.DeviceRGB, [0, 0, w, h], false);
  const dst = pix.getPixels(), stride = pix.getStride();
  for (let y = 0; y < h; y++) dst.set(rgb.subarray(y * w * 3, (y + 1) * w * 3), y * stride);
  writeFileSync(path, pix.asPNG());
  pix.destroy();
}
