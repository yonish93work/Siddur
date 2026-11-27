// Draws one PDF page to a PNG with boxes on it, to check painted areas and crops by eye.
// Run: node inspect-page.mjs <pdfPage> <out.png> [scale] ["x0,y0,x1,y1;..." boxes in PDF points from the top-left]
// Blue = printed area (crops.json), green = main text column, red = the boxes given.
import * as mupdf from 'mupdf';
import { readFileSync, writeFileSync } from 'node:fs';
import { PROJECT } from './config.mjs';
import { join } from 'node:path';

const [n, out, scaleArg = '1', boxArg = ''] = process.argv.slice(2);
const S = Number(scaleArg);
const doc = mupdf.Document.openDocument(readFileSync(join(PROJECT, 'source', 'siddur.pdf')), 'application/pdf');
const page = doc.loadPage(Number(n) - 1);
const pix = page.toPixmap(mupdf.Matrix.scale(S, S), mupdf.ColorSpace.DeviceRGB, false, true);
const W = pix.getWidth(), H = pix.getHeight(), px = pix.getPixels(), N = pix.getNumberOfComponents();
const dot = (x, y, [r, g, b]) => { x = Math.round(x); y = Math.round(y); if (x < 0 || y < 0 || x >= W || y >= H) return; const i = (y * W + x) * N; px[i] = r; px[i + 1] = g; px[i + 2] = b; };
const line = (x0, y0, x1, y1, c) => { const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)); for (let k = 0; k <= steps; k++) for (const d of [0, 1]) dot(x0 + (x1 - x0) * k / steps + d, y0 + (y1 - y0) * k / steps + d, c); };
const rect = (x0, y0, x1, y1, c) => { [x0, y0, x1, y1] = [x0, y0, x1, y1].map(v => v * S); line(x0, y0, x1, y0, c); line(x1, y0, x1, y1, c); line(x1, y1, x0, y1, c); line(x0, y1, x0, y0, c); };
const crop = JSON.parse(readFileSync(join(PROJECT, 'data', 'crops.json'), 'utf8'))[Number(n) - 1];
if (crop) {
  rect(crop[0], crop[1], crop[2], crop[3], [0, 0, 255]);
  line(crop[4] * S, 0, crop[4] * S, H - 1, [0, 170, 0]); line(crop[5] * S, 0, crop[5] * S, H - 1, [0, 170, 0]);
}
for (const b of boxArg.split(';').filter(Boolean)) { const [x0, y0, x1, y1] = b.split(',').map(Number); rect(x0, y0, x1, y1, [230, 0, 0]); }
writeFileSync(out, pix.asPNG());
console.log(`page ${n}: ${W}x${H}, crop ${JSON.stringify(crop)}`);
