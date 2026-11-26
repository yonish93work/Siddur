// Finds the printed area of every page, so that the phone screen is not wasted on empty margins.
// Nothing printed is ever cut: the box is measured from a drawing of the page, and a small border is added.
// Also finds the main text area without the small notes printed in the side margins (sources, word meanings),
// so that by default the page can fill the screen; the notes come back with a setting.
// Writes data/crops.json: one [left, top, right, bottom, mainLeft, mainRight] per page, in PDF points from the top left.
// Run again whenever the PDF changes:  npm run crops   (needs "npm install" in tools/render-check)
import { readFileSync, writeFileSync } from 'node:fs';
import * as mupdf from './render-check/node_modules/mupdf/dist/mupdf.js';

const doc = mupdf.Document.openDocument(readFileSync(new URL('../source/siddur.pdf', import.meta.url)), 'application/pdf');
const SCALE = 1.5, PAD = 6, GAP = 3 * SCALE, NOTE_SHARE = 0.07;
const boxes = [];
let trimmed = 0;
for (let n = 0; n < doc.countPages(); n++) {
  const page = doc.loadPage(n);
  const [, , pw, ph] = page.getBounds();
  const pix = page.toPixmap(mupdf.Matrix.scale(SCALE, SCALE), mupdf.ColorSpace.DeviceGray, false, true);
  const w = pix.getWidth(), h = pix.getHeight(), stride = pix.getStride(), px = pix.getPixels();
  let l = w, t = h, r = 0, b = 0;
  const rows = new Float64Array(h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (px[y * stride + x] < 250) {
    if (x < l) l = x; if (x > r) r = x; if (y < t) t = y; if (y > b) b = y;
    if (px[y * stride + x] < 160) rows[y]++; // dark ink only: some pages have a light grey background
  }
  // Ruled lines (almost solid rows, under footnotes and around boxes) would join the side notes to the text: leave them out of the count.
  const cols = new Float64Array(w);
  for (let y = 0; y < h; y++) if (rows[y] < 0.85 * (r - l)) for (let x = 0; x < w; x++) if (px[y * stride + x] < 160) cols[x]++; // dark ink only, not grey shading
  if (r < l) { boxes.push([0, 0, pw, ph, 0, pw]); continue; }
  // Split the page into vertical strips separated by empty gaps; side notes are thin strips with little ink.
  const strips = [];
  let start = -1, empty = 0;
  for (let x = l; x <= r + 1; x++) {
    if (x <= r && cols[x] > 0) { if (start < 0) start = x; empty = 0; }
    else if (start >= 0 && ++empty >= GAP) { strips.push([start, x - empty]); start = -1; empty = 0; }
  }
  if (start >= 0) strips.push([start, r]);
  const total = cols.reduce((a, c) => a + c, 0);
  const ink = ([a, z]) => { let s = 0; for (let x = a; x <= z; x++) s += cols[x]; return s; };
  // Side notes are narrow strips with little ink at the outer edges, outside the text column (which starts
  // around 65 points from each side). Only such strips are dropped; anything else stays.
  const main = [...strips];
  const isNote = (s, edge) => (s[1] - s[0]) / SCALE < 70 && ink(s) / total < NOTE_SHARE * 2 && main.length > 1 && edge(s);
  while (main.length && isNote(main[0], s => s[1] / SCALE < 66)) main.shift();
  while (main.length && isNote(main.at(-1), s => s[0] / SCALE > pw - 66)) main.pop();
  const ml = main.length ? main[0][0] : l, mr = main.length ? main.at(-1)[1] : r;
  if (ml > l + GAP || mr < r - GAP) trimmed++;
  const pt = (v, d) => Math.round(Math.min(Math.max(v / SCALE + d, 0), pw));
  boxes.push([pt(l, -PAD), Math.max(0, Math.round(t / SCALE - PAD)), pt(r + 1, PAD), Math.min(ph, Math.round((b + 1) / SCALE + PAD)), pt(ml, -PAD), pt(mr + 1, PAD)]);
  pix.destroy(); page.destroy();
}
writeFileSync(new URL('../data/crops.json', import.meta.url), JSON.stringify(boxes) + '\n');
const ws = boxes.map(b => b[2] - b[0]).sort((a, b) => a - b), ms = boxes.map(b => b[5] - b[4]).sort((a, b) => a - b);
console.log(`${boxes.length} pages; printed width median ${ws[ws.length >> 1]}, main text width median ${ms[ms.length >> 1]}; side notes trimmed on ${trimmed} pages`);
