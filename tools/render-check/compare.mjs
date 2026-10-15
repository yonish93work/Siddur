// Step 2: compare the viewer's pictures (PDF.js) with MuPDF and PDFium, page by page, and write
// results.json plus close-up pictures of every place where a mark is missing or extra.
// Run: node compare.mjs [fromPage] [toPage]
//
// How a "real" difference is told apart from harmless smoothing (anti-aliasing) at letter edges:
//  - Every pixel gets a darkness value 0 (white) .. 255 (black).
//  - A pixel is "ink" if its darkness is at least INK (this includes the gray nikud in this siddur).
//  - An ink pixel in one picture is "covered" if the other picture has at least a faint trace
//    (darkness >= TRACE) within NEAR pixels of it. Edges that are a little lighter, darker or
//    half a pixel off are always covered.
//  - Uncovered ink pixels that touch each other are grouped into spots. A spot of MIN_SPOT pixels
//    or more is a real difference: a dot, line or letter piece that one picture has and the other lacks.
//  - Separately, every single mark (letter, dot, line) is weighed: the total darkness in a small box
//    around it must be about the same in both pictures. This catches a mark that is present in both
//    but drawn clearly fainter, darker or only partly (for example gray nikud drawn black).
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { OUT, dirFor, pngName } from './config.mjs';
import { readPNG, writePNG } from './images.mjs';

export const INK = 40, TRACE = 12, NEAR = 1, MIN_SPOT = 4, SHADE_MIN_INK = 2 * 255, SHADE_RATIO = 0.35;
const REFS = ['mupdf', 'pdfium'];

const darkness = ({ w, h, rgb }) => {
  const d = new Uint8Array(w * h);
  for (let i = 0, j = 0; i < d.length; i++, j += 3) d[i] = 255 - Math.round(0.299 * rgb[j] + 0.587 * rgb[j + 1] + 0.114 * rgb[j + 2]);
  return d;
};

// Grow a yes/no mask by r pixels in every direction (square neighbourhood).
function grow(mask, w, h, r) {
  const tmp = new Uint8Array(mask.length), out = new Uint8Array(mask.length);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) if (mask[row + x]) for (let k = Math.max(0, x - r), e = Math.min(w - 1, x + r); k <= e; k++) tmp[row + k] = 1;
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (tmp[y * w + x])
    for (let k = Math.max(0, y - r), e = Math.min(h - 1, y + r); k <= e; k++) out[k * w + x] = 1;
  return out;
}

// Group touching "on" pixels into spots; return the spots with at least minSize pixels.
function spots(mask, w, h, minSize) {
  const seen = new Uint8Array(mask.length), found = [], stack = [];
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i] || seen[i]) continue;
    let size = 0, x0 = w, y0 = h, x1 = 0, y1 = 0;
    stack.push(i); seen[i] = 1;
    while (stack.length) {
      const p = stack.pop(), x = p % w, y = (p - x) / w;
      size++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const q = ny * w + nx;
        if (mask[q] && !seen[q]) { seen[q] = 1; stack.push(q); }
      }
    }
    if (size >= minSize) found.push({ size, x0, y0, x1, y1 });
  }
  return found;
}

// Shade check, mark by mark: every separate mark in picture P (a letter, a dot, a line...) is
// measured as the total darkness in a small box around it, in P and in Q. If Q has clearly less or
// more ink there, the mark is drawn fainter, darker, partly, or with something added in Q.
function shadeSpots(P, Q, w, h) {
  const ink = P.map(v => v >= INK), found = [];
  for (const s of spots(ink, w, h, 1)) {
    const x0 = Math.max(0, s.x0 - NEAR), y0 = Math.max(0, s.y0 - NEAR), x1 = Math.min(w - 1, s.x1 + NEAR), y1 = Math.min(h - 1, s.y1 + NEAR);
    let sp = 0, sq = 0;
    for (let y = y0; y <= y1; y++) for (let i = y * w + x0, e = y * w + x1; i <= e; i++) { sp += P[i]; sq += Q[i]; }
    const diff = Math.abs(sp - sq);
    if (diff >= SHADE_MIN_INK && diff >= SHADE_RATIO * sp) found.push({ size: s.size, x0, y0, x1, y1, ink: Math.round(sp / 255), otherInk: Math.round(sq / 255) });
  }
  return found;
}
const paint = (mask, w, s) => { for (let y = s.y0; y <= s.y1; y++) mask.fill(1, y * w + s.x0, y * w + s.x1 + 1); };
// The shade check runs from both sides, so the same place can be reported twice.
const dedupe = list => list.filter((s, i) => !list.some((t, j) => j < i && t.x0 <= s.x1 && s.x0 <= t.x1 && t.y0 <= s.y1 && s.y0 <= t.y1));

// Compare picture A (the viewer) with B (a reference). Returns the spots and the masks for drawing.
export function comparePair(A, B) {
  const { w, h } = A;
  if (B.w !== w || B.h !== h) return { sizeMismatch: `${w}x${h} vs ${B.w}x${B.h}`, missing: [], extra: [], tone: [] };
  const da = darkness(A), db = darkness(B);
  const traceA = grow(da.map(v => v >= TRACE), w, h, NEAR), traceB = grow(db.map(v => v >= TRACE), w, h, NEAR);
  const missingMask = new Uint8Array(w * h), extraMask = new Uint8Array(w * h);
  for (let i = 0; i < da.length; i++) {
    if (db[i] >= INK && !traceA[i]) missingMask[i] = 1; // the reference has a mark here, the viewer does not
    if (da[i] >= INK && !traceB[i]) extraMask[i] = 1;   // the viewer has a mark the reference does not
  }
  const toneMask = new Uint8Array(w * h), tone = [];
  for (const [P, Q] of [[db, da], [da, db]]) for (const s of shadeSpots(P, Q, w, h)) { tone.push(s); paint(toneMask, w, s); }
  return {
    missing: spots(missingMask, w, h, MIN_SPOT),
    extra: spots(extraMask, w, h, MIN_SPOT),
    tone: dedupe(tone),
    missingMask, extraMask, toneMask, da, db,
  };
}

// Picture of the differences: the viewer's page in light gray, marks only in the reference in red,
// marks only in the viewer in blue, shade differences in orange, and a box around every spot.
function diffPicture(A, r) {
  const { w, h } = A, rgb = new Uint8Array(w * h * 3);
  for (let i = 0; i < w * h; i++) {
    const g = 255 - Math.round(Math.max(r.da[i], r.db[i]) * 0.25);
    let c = [g, g, g];
    if (r.toneMask[i]) c = [255, 150, 0];
    if (r.missingMask[i]) c = [230, 0, 0];
    if (r.extraMask[i]) c = [0, 70, 255];
    rgb.set(c, i * 3);
  }
  const box = (s, color) => {
    const m = 8, x0 = Math.max(0, s.x0 - m), y0 = Math.max(0, s.y0 - m), x1 = Math.min(w - 1, s.x1 + m), y1 = Math.min(h - 1, s.y1 + m);
    for (let t = 0; t < 3; t++) {
      for (let x = x0; x <= x1; x++) { rgb.set(color, ((y0 + t) * w + x) * 3); rgb.set(color, ((y1 - t) * w + x) * 3); }
      for (let y = y0; y <= y1; y++) { rgb.set(color, (y * w + x0 + t) * 3); rgb.set(color, (y * w + x1 - t) * 3); }
    }
  };
  r.tone.forEach(s => box(s, [255, 150, 0])); r.missing.forEach(s => box(s, [230, 0, 0])); r.extra.forEach(s => box(s, [0, 70, 255]));
  return { w, h, rgb };
}

function crop({ w, h, rgb }, s, pad = 40) {
  const x0 = Math.max(0, s.x0 - pad), y0 = Math.max(0, s.y0 - pad), x1 = Math.min(w - 1, s.x1 + pad), y1 = Math.min(h - 1, s.y1 + pad);
  const cw = x1 - x0 + 1, ch = y1 - y0 + 1, out = new Uint8Array(cw * ch * 3);
  for (let y = 0; y < ch; y++) out.set(rgb.subarray(((y0 + y) * w + x0) * 3, ((y0 + y) * w + x1 + 1) * 3), y * cw * 3);
  return { w: cw, h: ch, rgb: out, x0, y0 };
}

const strip = r => ({ sizeMismatch: r.sizeMismatch, missing: r.missing, extra: r.extra, tone: r.tone });

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
  const from = Number(process.argv[2] || 1), to = Number(process.argv[3] || 800);
  const imgDir = join(OUT, 'report', 'img');
  mkdirSync(imgDir, { recursive: true });
  const resultsPath = join(OUT, 'results.json');
  const results = [];
  const t0 = Date.now();
  for (let n = from; n <= to; n++) {
    const file = pngName(n);
    if (!existsSync(join(dirFor('pdfjs'), file))) { results.push({ page: n, error: 'no PDF.js picture' }); continue; }
    const A = readPNG(join(dirFor('pdfjs'), file));
    const pics = Object.fromEntries(REFS.map(ref => [ref, readPNG(join(dirFor(ref), file))]));
    const entry = { page: n, vs: {} };
    for (const ref of REFS) {
      const r = comparePair(A, pics[ref]);
      entry.vs[ref] = strip(r);
      const all = [...r.missing, ...r.extra, ...r.tone];
      if (all.length || r.sizeMismatch) {
        const tag = `p${String(n).padStart(3, '0')}-${ref}`;
        if (!r.sizeMismatch) {
          writePNG(join(imgDir, `${tag}-diff.png`), diffPicture(A, r));
          // Close-ups of the first spots: viewer | reference, side by side.
          all.sort((a, b) => b.size - a.size).slice(0, 12).forEach((s, k) => {
            const ca = crop(A, s), cb = crop(pics[ref], s);
            writePNG(join(imgDir, `${tag}-z${k}-pdfjs.png`), ca);
            writePNG(join(imgDir, `${tag}-z${k}-ref.png`), cb);
            s.zoom = k;
          });
        }
      }
    }
    // Control: do the two references agree with each other? (helps tell engine quirks from real problems)
    entry.control = strip(comparePair(pics.mupdf, pics.pdfium));
    results.push(entry);
    if (n % 25 === 0) console.log(`  page ${n} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
  }
  writeFileSync(resultsPath, JSON.stringify(results, null, 1));
  console.log(`Compared pages ${from}-${to} in ${((Date.now() - t0) / 1000).toFixed(0)}s -> ${resultsPath}`);
}
