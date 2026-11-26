// Builds the finished app into dist/ (the folder that is uploaded to the internet).  Run: npm run build
import { build } from 'esbuild';
import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DIST = join(ROOT, 'dist');
const at = (...p) => join(ROOT, ...p);
const sha = b => createHash('sha256').update(b).digest('hex');

// The page table and the crops must belong to this very PDF.
const pdfSha = sha(readFileSync(at('source', 'siddur.pdf')));
const pages = JSON.parse(readFileSync(at('data', 'pages.json'), 'utf8'));
if (pages.sha256 !== pdfSha) throw new Error('source/siddur.pdf changed: run "npm run pages" and "npm run crops" first');
if (JSON.parse(readFileSync(at('data', 'crops.json'), 'utf8')).length !== pages.pdfPages) throw new Error('data/crops.json does not match: run "npm run crops"');

rmSync(DIST, { recursive: true, force: true });
mkdirSync(join(DIST, 'vendor'), { recursive: true });
for (const f of ["index.html", "style.css", "manifest.webmanifest", "icons", "art"]) cpSync(at('app', f), join(DIST, f), { recursive: true });
mkdirSync(join(DIST, "fonts"), { recursive: true });
for (const w of [400, 700, 900]) cpSync(at("node_modules", "@fontsource", "frank-ruhl-libre", "files", `frank-ruhl-libre-hebrew-${w}-normal.woff2`), join(DIST, "fonts", `frank-ruhl-libre-hebrew-${w}-normal.woff2`));
cpSync(at("node_modules", "@fontsource", "frank-ruhl-libre", "LICENSE"), join(DIST, "fonts", "LICENSE.txt"));
cpSync(at('source', 'siddur.pdf'), join(DIST, 'siddur.pdf'));
// The "legacy" build of PDF.js also runs on older phones.
for (const f of ['pdf.min.mjs', 'pdf.worker.min.mjs']) cpSync(at('node_modules', 'pdfjs-dist', 'legacy', 'build', f), join(DIST, 'vendor', f));
cpSync(at('node_modules', 'pdfjs-dist', 'standard_fonts'), join(DIST, 'vendor', 'standard_fonts'), { recursive: true });

const walk = d => readdirSync(d).flatMap(n => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : [p]; });
const listing = () => walk(DIST).map(p => [relative(DIST, p).replaceAll('\\', '/'), sha(readFileSync(p)).slice(0, 12)]).sort((a, b) => (a[0] < b[0] ? -1 : 1));

const js = await build({
  entryPoints: [at('app', 'main.js')], bundle: true, minify: true, format: 'esm', target: ['es2020', 'safari15'], write: false,
  loader: { '.json': 'json' }, define: { __VERSION__: '"@@VERSION@@"' }, legalComments: 'linked', outfile: 'app.js',
});
const code = js.outputFiles.find(f => f.path.endsWith('app.js')).text;
for (const f of js.outputFiles) if (f.path.endsWith('.txt')) writeFileSync(join(DIST, 'app.js.LEGAL.txt'), f.text);
const swSource = readFileSync(at('app', 'sw.js'), 'utf8');
const version = sha(JSON.stringify(listing()) + code + swSource).slice(0, 8);
writeFileSync(join(DIST, 'app.js'), code.replace('@@VERSION@@', version));
writeFileSync(join(DIST, 'sw.js'), swSource.replace('__VERSION__', version).replace('__FILES__', JSON.stringify(listing())));
writeFileSync(join(DIST, '.nojekyll'), ''); // GitHub Pages: serve the files exactly as they are

const total = walk(DIST).reduce((a, p) => a + statSync(p).size, 0);
console.log(`dist/ ready: version ${version}, ${(total / 1e6).toFixed(1)}MB`);
