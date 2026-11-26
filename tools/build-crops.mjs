// Finds the printed area of every page, so that the phone screen is not wasted on empty margins.
// Nothing printed is ever cut: the box is measured from a drawing of the page, and a small border is added.
// Writes data/crops.json: one [left, top, right, bottom] per page, in PDF points from the top left.
// Run again whenever the PDF changes:  npm run crops   (needs "npm install" in tools/render-check)
import { readFileSync, writeFileSync } from 'node:fs';
import * as mupdf from './render-check/node_modules/mupdf/dist/mupdf.js';

const doc = mupdf.Document.openDocument(readFileSync(new URL('../source/siddur.pdf', import.meta.url)), 'application/pdf');
const SCALE = 1.5, PAD = 6;
const boxes = [];
for (let n = 0; n < doc.countPages(); n++) {
  const page = doc.loadPage(n);
  const [, , pw, ph] = page.getBounds();
  const pix = page.toPixmap(mupdf.Matrix.scale(SCALE, SCALE), mupdf.ColorSpace.DeviceGray, false, true);
  const w = pix.getWidth(), h = pix.getHeight(), stride = pix.getStride(), px = pix.getPixels();
  let l = w, t = h, r = 0, b = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (px[y * stride + x] < 250) {
    if (x < l) l = x; if (x > r) r = x; if (y < t) t = y; if (y > b) b = y;
  }
  boxes.push(r < l ? [0, 0, pw, ph] : [Math.max(0, l / SCALE - PAD), Math.max(0, t / SCALE - PAD), Math.min(pw, (r + 1) / SCALE + PAD), Math.min(ph, (b + 1) / SCALE + PAD)].map(Math.round));
  pix.destroy(); page.destroy();
}
writeFileSync(new URL('../data/crops.json', import.meta.url), JSON.stringify(boxes) + '\n');
const ws = boxes.map(b => b[2] - b[0]).sort((a, b) => a - b);
console.log(`${boxes.length} pages; printed width from ${ws[0]} to ${ws.at(-1)} points, median ${ws[ws.length >> 1]}`);
