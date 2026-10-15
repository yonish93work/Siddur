// Step 1b: draw every page with two independent PDF engines, for comparison with the viewer:
//   MuPDF  (by Artifex, used in SumatraPDF and many others)
//   PDFium (by Google, the engine inside Chrome's own PDF viewer)
// Neither shares code with PDF.js. Run: node render-refs.mjs [fromPage] [toPage]
import * as mupdf from 'mupdf';
import { PDFiumLibrary } from '@hyzyla/pdfium';
import { readFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { PDF_PATH, PDF_SHA256, SCALE, dirFor, pngName } from './config.mjs';
import { writePNG, pixmapToRGB } from './images.mjs';

const buf = readFileSync(PDF_PATH);
const sha = createHash('sha256').update(buf).digest('hex');
if (sha !== PDF_SHA256) throw new Error(`siddur.pdf is not the original file (SHA-256 ${sha})`);

const mu = mupdf.Document.openDocument(buf, 'application/pdf');
const pdfium = await PDFiumLibrary.init();
const pd = await pdfium.loadDocument(new Uint8Array(buf));
const count = mu.countPages();
const from = Number(process.argv[2] || 1), to = Math.min(Number(process.argv[3] || count), count);
for (const r of ['mupdf', 'pdfium']) mkdirSync(dirFor(r), { recursive: true });

console.log(`MuPDF + PDFium, scale ${SCALE}, pages ${from}-${to}`);
const t0 = Date.now();
for (let n = from; n <= to; n++) {
  // MuPDF
  const page = mu.loadPage(n - 1);
  const [x0, y0, x1, y1] = page.getBounds();
  const pix = page.toPixmap(mupdf.Matrix.scale(SCALE, SCALE), mupdf.ColorSpace.DeviceRGB, false, true);
  writePNG(join(dirFor('mupdf'), pngName(n)), pixmapToRGB(pix));
  pix.destroy(); page.destroy();

  // PDFium, at exactly the same pixel size as PDF.js (page size x scale, rounded)
  const w = Math.round((x1 - x0) * SCALE), h = Math.round((y1 - y0) * SCALE);
  const pp = pd.getPage(n - 1);
  const r = await pp.render({ width: w, height: h, colorSpace: 'RGBA' });
  const rgb = new Uint8Array(r.width * r.height * 3);
  for (let i = 0, j = 0; i < rgb.length; i += 3, j += 4) { rgb[i] = r.data[j]; rgb[i + 1] = r.data[j + 1]; rgb[i + 2] = r.data[j + 2]; }
  writePNG(join(dirFor('pdfium'), pngName(n)), { w: r.width, h: r.height, rgb });
  pp.close();

  if (n % 50 === 0) console.log(`  page ${n} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
}
pd.destroy(); pdfium.destroy();
console.log(`Done in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
