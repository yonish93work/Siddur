// Proof that the checker is sharp enough: take real pages, damage the viewer's picture on purpose
// (erase a tiny mark, draw it much fainter, draw a gray mark black, move a mark a little) and make sure compare.mjs catches
// every one. Uses the smallest marks on each page - single nikud dots, commas, dagesh - since those
// are the hardest to notice. Run after render-pdfjs.mjs and render-refs.mjs:  node selftest.mjs
import { join } from 'node:path';
import { writeFileSync } from 'node:fs';
import { OUT, dirFor, pngName } from './config.mjs';
import { readPNG } from './images.mjs';
import { comparePair, INK } from './compare.mjs';

const PAGES = (process.argv[2] || '9,17,68,116,121,300,452,644,700,799').split(',').map(Number);
const PER_PAGE = 40, BOX = 120;

function components(img) {
  const { w, h, rgb } = img, seen = new Uint8Array(w * h), out = [];
  const dark = i => 255 - (0.299 * rgb[i * 3] + 0.587 * rgb[i * 3 + 1] + 0.114 * rgb[i * 3 + 2]);
  for (let i = 0; i < w * h; i++) {
    if (seen[i] || dark(i) < INK) continue;
    const px = [], stack = [i]; seen[i] = 1;
    while (stack.length) {
      const p = stack.pop(), x = p % w, y = (p - x) / w; px.push(p);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy, q = ny * w + nx;
        if (nx >= 0 && ny >= 0 && nx < w && ny < h && !seen[q] && dark(q) >= INK) { seen[q] = 1; stack.push(q); }
      }
    }
    out.push(px);
  }
  return out;
}

// Cut a BOX x BOX window centred on the mark, from both pictures (comparing windows is much faster).
function windowAround(img, cx, cy) {
  const { w, h, rgb } = img, x0 = Math.max(0, Math.min(w - BOX, cx - BOX / 2)), y0 = Math.max(0, Math.min(h - BOX, cy - BOX / 2));
  const out = new Uint8Array(BOX * BOX * 3);
  for (let y = 0; y < BOX; y++) out.set(rgb.subarray(((y0 + y) * w + x0) * 3, ((y0 + y) * w + x0 + BOX) * 3), y * BOX * 3);
  return { w: BOX, h: BOX, rgb: out, x0, y0 };
}

// Caught = some reported spot lands on (or right next to) the mark that was damaged.
const caught = (r, b) => [...r.missing, ...r.extra, ...r.tone].some(s => s.x0 <= b.x1 + 6 && b.x0 - 6 <= s.x1 && s.y0 <= b.y1 + 10 && b.y0 - 6 <= s.y1);
const tally = { erase: [0, 0], fade: [0, 0], darken: [0, 0], move4: [0, 0], move6: [0, 0], untouched: [0, 0] };
const problems = [];
let smallest = Infinity;

for (const n of PAGES) {
  const A = readPNG(join(dirFor('pdfjs'), pngName(n))), B = readPNG(join(dirFor('mupdf'), pngName(n)));
  const marks = components(B).filter(px => px.length >= 3).sort((a, b) => a.length - b.length);
  smallest = Math.min(smallest, marks[0]?.length ?? Infinity);
  for (const px of marks.slice(0, PER_PAGE)) {
    const xs = px.map(p => p % A.w), ys = px.map(p => Math.floor(p / A.w));
    const cx = Math.round((Math.min(...xs) + Math.max(...xs)) / 2), cy = Math.round((Math.min(...ys) + Math.max(...ys)) / 2);
    const wa = windowAround(A, cx, cy), wb = windowAround(B, cx, cy);
    const local = px.map(p => ((p - (p % A.w)) / A.w - wa.y0) * BOX + (p % A.w) - wa.x0);
    // Every pixel of the mark plus a 2-pixel ring (its smoothed edge)
    const ring = new Set();
    for (const p of local) { const x = p % BOX, y = (p - x) / BOX;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const nx = x + dx, ny = y + dy; if (nx >= 0 && ny >= 0 && nx < BOX && ny < BOX) ring.add(ny * BOX + nx); } }
    const lx = local.map(p => p % BOX), ly = local.map(p => Math.floor(p / BOX));
    const where = { x0: Math.min(...lx), x1: Math.max(...lx), y0: Math.min(...ly), y1: Math.max(...ly) };
    const test = (name, mutate) => {
      const copy = { ...wa, rgb: wa.rgb.slice() }; mutate(copy.rgb);
      const hit = caught(comparePair(copy, wb), where);
      tally[name][1]++; if (hit) tally[name][0]++;
      if (hit === (name === 'untouched')) problems.push({ page: n, kind: name === 'untouched' ? 'false alarm' : 'missed ' + name, x: cx, y: cy, size: px.length });
    };
    const move = d => rgb => { // the mark drawn d pixels lower
      for (const p of ring) rgb.fill(255, p * 3, p * 3 + 3);
      for (const p of ring) { const q = p + d * BOX; if (q < BOX * BOX) rgb.set(wa.rgb.subarray(p * 3, p * 3 + 3), q * 3); }
    };
    test('untouched', () => {});
    test('erase', rgb => { for (const p of ring) rgb.fill(255, p * 3, p * 3 + 3); });
    test('fade', rgb => { for (const p of ring) for (let c = 0; c < 3; c++) rgb[p * 3 + c] = 255 - (255 - rgb[p * 3 + c]) * 0.4; }); // drawn much fainter
    const darkMean = local.reduce((s, p) => s + 255 - wb.rgb[p * 3 + 1], 0) / local.length;
    if (darkMean < 150) test('darken', rgb => { for (const p of local) rgb.fill(0, p * 3, p * 3 + 3); }); // gray mark drawn black
    test('move4', move(4)); // 4 pixels = about half a millimetre on paper
    test('move6', move(6));
  }
  console.log(`page ${n}: tested ${Math.min(PER_PAGE, marks.length)} smallest marks (sizes ${marks[0]?.length}-${marks[Math.min(PER_PAGE, marks.length) - 1]?.length} px)`);
}
console.log('\nResults (caught / tested):');
for (const [k, [c, t]] of Object.entries(tally)) console.log(`  ${k.padEnd(10)} ${c} / ${t}${k === 'untouched' ? '   <- should be 0: an untouched mark must NOT be reported' : ''}`);
console.log(`Smallest real mark seen: ${smallest} px`);
if (problems.length) console.log('Problems:', JSON.stringify(problems.slice(0, 40)));
writeFileSync(join(OUT, 'selftest.json'), JSON.stringify({ pages: PAGES, perPage: PER_PAGE, tally, smallest, problems }, null, 1));
