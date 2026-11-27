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
let trimmed = 0, notesFound = 0;

// Side notes (sources such as "זבחים ה", word meanings) are small print at the edge of the text. Some sit partly
// inside the text column, beside a short line, so cutting the column is not enough: their boxes are listed and the
// reader paints them over in the page colour. A note is a narrow group of small letters (size up to 12.5; the prayers
// are printed at about 25-29; instructions such as "בעשי"ת אומר" or "הצבור והש"ץ" at 13-14) that reaches the right edge of the text (where lines start), with an empty gap of 12 points or more
// between it and the prayer text on the same line. Footnotes are wide lines; small words inside the text ("בלחש:",
// "ש"ץ:" at the start of a line) are close to the text; so they stay. A box that would touch a large letter is dropped.
// Found by the rule but not notes (checked by eye on 2026-11-27): [PDF page, left, top] of the box.
const NOT_NOTES = [
  [11, 503.5, 91.1], [11, 503.5, 441.7], // halacha numbers "א,א" and "א,ט" opening paragraphs on p. 13
  [78, 461.8, 456.9], [78, 464.9, 560.4], [78, 461.9, 669.1], // "הצבור והש"ץ" (an instruction) in the Thirteen Attributes, p. 76
];
function sideNotes(page, pw, ph) {
  const small = [], big = [];
  page.toStructuredText().walk({
    onChar(c, origin, font, size, q) {
      if (!c.trim()) return;
      const box = [Math.min(q[0], q[4]), Math.min(q[1], q[3]), Math.max(q[2], q[6]), Math.max(q[5], q[7])];
      (size <= 12.5 ? small : big).push(box);
    },
  });
  // The nearest large letter beside the group on the same line, towards the middle of the page.
  const sameLine = (g, c) => c[1] < g[3] && c[3] > g[1];
  const gapToText = g => g[2] >= 515
    ? Math.min(...big.filter(c => sameLine(g, c) && c[2] <= g[0] + 0.5).map(c => g[0] - c[2]), 999)
    : Math.min(...big.filter(c => sameLine(g, c) && c[0] >= g[2] - 0.5).map(c => c[0] - g[2]), 999);
  // Rows of small letters, then groups within a row separated by more than 12 points.
  small.sort((a, b) => a[1] - b[1] || a[0] - b[0]);
  const groups = [];
  for (const ch of small) {
    const g = groups.find(g => Math.abs(g[1] - ch[1]) < 4 && ch[0] < g[2] + 12 && ch[2] > g[0] - 12);
    if (g) { g[0] = Math.min(g[0], ch[0]); g[1] = Math.min(g[1], ch[1]); g[2] = Math.max(g[2], ch[2]); g[3] = Math.max(g[3], ch[3]); }
    else groups.push([...ch]);
  }
  // Groups in the same note (one line under another) are joined.
  const merged = [];
  for (const g of groups.sort((a, b) => a[1] - b[1])) {
    const m = merged.find(m => g[1] - m[3] < 4 && g[0] < m[2] + 4 && g[2] > m[0] - 4);
    if (m) { m[0] = Math.min(m[0], g[0]); m[2] = Math.max(m[2], g[2]); m[3] = Math.max(m[3], g[3]); }
    else merged.push([...g]);
  }
  const touchesBig = b => big.some(c => c[0] < b[2] - 0.5 && c[2] > b[0] + 0.5 && c[1] < b[3] - 0.5 && c[3] > b[1] + 0.5);
  return merged
    .filter(g => g[2] - g[0] >= 6 && g[2] - g[0] < 80 && g[3] - g[1] < 90 && g[2] >= 515 && gapToText(g) >= 12)
    // Not part of a footnote: no other small print on the same line inside the text column.
    .filter(g => !groups.some(o => o[2] - o[0] >= 8 && o[1] < g[3] && o[3] > g[1] && (o[2] < g[0] - 0.5 || o[0] > g[2] + 0.5) && o[2] > 80 && o[0] < 515))
    .map(g => [g[0] - 1.5, g[1] - 1.5, g[2] + 1.5, g[3] + 1.5].map((v, k) => Math.round(Math.min(Math.max(v, 0), k % 2 ? ph : pw) * 10) / 10))
    .filter(b => !touchesBig(b));
}
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
  const notes = sideNotes(page, pw, ph).filter(b => !NOT_NOTES.some(([p, x, y]) => p === n + 1 && Math.abs(b[0] - x) < 3 && Math.abs(b[1] - y) < 3));
  notesFound += notes.length;
  boxes.push([pt(l, -PAD), Math.max(0, Math.round(t / SCALE - PAD)), pt(r + 1, PAD), Math.min(ph, Math.round((b + 1) / SCALE + PAD)), pt(ml, -PAD), pt(mr + 1, PAD), notes]);
  pix.destroy(); page.destroy();
}
writeFileSync(new URL('../data/crops.json', import.meta.url), JSON.stringify(boxes) + '\n');
const ws = boxes.map(b => b[2] - b[0]).sort((a, b) => a - b), ms = boxes.map(b => b[5] - b[4]).sort((a, b) => a - b);
console.log(`${boxes.length} pages; printed width median ${ws[ws.length >> 1]}, main text width median ${ms[ms.length >> 1]}; side notes trimmed on ${trimmed} pages; ${notesFound} side-note boxes`);
