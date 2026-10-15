// Step 1a: draw every page the way the viewer does (PDF.js inside real Chrome) and save PNGs.
// Run: node render-pdfjs.mjs [fromPage] [toPage]
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir, stat, mkdtemp, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { join, normalize, extname, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { PROJECT, SCALE, CHROME, dirFor, pngName } from './config.mjs';

const from = Number(process.argv[2] || 1), to = Number(process.argv[3] || 9999);
const outDir = dirFor('pdfjs');
await mkdir(outDir, { recursive: true });

const TYPES = { '.html': 'text/html; charset=utf-8', '.mjs': 'text/javascript', '.js': 'text/javascript', '.pdf': 'application/pdf', '.json': 'application/json' };
const body = req => new Promise((ok, bad) => { const c = []; req.on('data', d => c.push(d)); req.on('end', () => ok(Buffer.concat(c))); req.on('error', bad); });

let chrome, finished, saved = 0;
const done = new Promise(r => (finished = r));
const t0 = Date.now();

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (req.method === 'POST') {
    const data = await body(req);
    if (url.pathname === '/save') {
      const n = Number(url.searchParams.get('page'));
      await writeFile(join(outDir, pngName(n)), data);
      if (++saved % 50 === 0) console.log(`  ${saved} pages (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
    } else if (url.pathname === '/log') console.log(data.toString());
    else if (url.pathname === '/done') finished(data.toString());
    res.end('ok');
    return;
  }
  // Serve the project folder (read-only), like serve.mjs does.
  const file = normalize(join(PROJECT, decodeURIComponent(url.pathname)));
  if (!file.startsWith(PROJECT.endsWith(sep) ? PROJECT : PROJECT + sep)) { res.writeHead(403).end(); return; }
  try {
    if (!(await stat(file)).isFile()) throw 0;
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream' }).end(await readFile(file));
  } catch { res.writeHead(404).end(); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

const profile = await mkdtemp(join(tmpdir(), 'siddur-chrome-'));
const pageUrl = `http://127.0.0.1:${port}/tools/render-check/pdfjs-render.html?scale=${SCALE}&from=${from}&to=${to}`;
console.log(`PDF.js in Chrome, scale ${SCALE}, pages ${from}-${to} -> ${outDir}`);
chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  `--user-data-dir=${profile}`, pageUrl], { stdio: 'ignore' });

const result = await done;
chrome.kill();
server.close();
await new Promise(r => setTimeout(r, 1000));
await rm(profile, { recursive: true, force: true }).catch(() => {});
console.log(result === 'error' ? 'FAILED' : `Done: ${saved} pages saved (PDF has ${result}) in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
process.exit(result === 'error' ? 1 : 0);
