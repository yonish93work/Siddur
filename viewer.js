// Simple siddur viewer: type a printed page number, see the matching PDF page.
// The printed-page -> PDF-page mapping comes from data/pages.json (there is no fixed formula).
import * as pdfjsLib from './node_modules/pdfjs-dist/build/pdf.min.mjs';

pdfjsLib.GlobalWorkerOptions.workerSrc = './node_modules/pdfjs-dist/build/pdf.worker.min.mjs';

const PDF_URL = 'source/siddur.pdf';
const $ = id => document.getElementById(id);
const canvas = $('canvas'), info = $('info'), warn = $('warn'), input = $('page');

let pdf, pages, byLabel, current = 1, renderTask = null;

// "105", "76א", " 76 א " -> "76א"
const normalize = s => s.replace(/\s+/g, '').replace(/['"״׳]/g, '');

async function init() {
  const [data, doc] = await Promise.all([
    fetch('data/pages.json').then(r => r.json()),
    pdfjsLib.getDocument({
      url: PDF_URL,
      // The siddur's old Davka fonts come out broken when the browser draws them as text,
      // so let PDF.js draw every letter as a shape straight from the embedded font.
      disableFontFace: true,
      // Fonts that are not embedded (e.g. Times New Roman for the digits) come from these files.
      // Full URLs, because PDF.js resolves these from its worker's folder, not from this page.
      standardFontDataUrl: new URL('node_modules/pdfjs-dist/standard_fonts/', location.href).href,
      cMapUrl: new URL('node_modules/pdfjs-dist/cmaps/', location.href).href,
      cMapPacked: true,
    }).promise,
  ]);
  pdf = doc;
  pages = data.pages;
  byLabel = new Map();
  for (const p of pages) {
    if (p.label == null) continue;
    if (!byLabel.has(p.label)) byLabel.set(p.label, []);
    byLabel.get(p.label).push(p.pdf);
  }
  const fromHash = decodeURIComponent(location.hash.slice(1));
  if (!fromHash || !jumpTo(fromHash)) show(firstNumberedPage());
}

const firstNumberedPage = () => pages.find(p => p.label != null).pdf;

function jumpTo(text) {
  const label = normalize(text);
  if (!label) return false;
  const hits = byLabel.get(label);
  if (hits) { show(hits[0]); return true; }
  // Not in the siddur: say so and offer the nearest page that does exist.
  const n = parseInt(label, 10);
  if (Number.isNaN(n)) { warn.textContent = `לא הבנתי את "${text}". כתוב מספר עמוד, למשל 105 או 76א.`; return false; }
  const after = pages.find(p => p.printed != null && p.printed >= n);
  warn.textContent = `עמוד ${label} לא קיים בסידור.` + (after ? ` מציג את העמוד הקרוב: ${after.label}.` : '');
  if (after) show(after.pdf, true);
  return false;
}

async function show(pdfPage, keepWarning = false) {
  current = Math.min(Math.max(pdfPage, 1), pdf.numPages);
  const meta = pages[current - 1];
  const twins = meta.label != null ? byLabel.get(meta.label) : [];

  info.innerHTML = meta.label != null
    ? `עמוד <b>${meta.label}</b> בסידור` + (meta.header ? ` · ${meta.header}` : '') + ` · דף ${current} בקובץ`
    : `דף ${current} בקובץ (ללא מספר עמוד)`;
  if (!keepWarning) {
    const notes = [];
    if (twins.length > 1) notes.push(`למספר ${meta.label} יש ${twins.length} דפים בקובץ (זה ${twins.indexOf(current) + 1} מתוך ${twins.length}).`);
    if (meta.check) notes.push('דף זה מסומן לבדיקה בעין.');
    warn.textContent = notes.join(' ');
  }
  input.value = meta.label ?? '';
  history.replaceState(null, '', meta.label != null ? `#${encodeURIComponent(meta.label)}` : location.pathname);
  $('prev').disabled = current <= 1;
  $('next').disabled = current >= pdf.numPages;

  // Draw the page sharp for this screen, fitted to the available width.
  const page = await pdf.getPage(current);
  const base = page.getViewport({ scale: 1 });
  const cssWidth = Math.min(document.querySelector('main').clientWidth - 32, 900);
  const ratio = window.devicePixelRatio || 1;
  const viewport = page.getViewport({ scale: (cssWidth / base.width) * ratio });
  if (renderTask) renderTask.cancel();
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  canvas.style.width = `${cssWidth}px`;
  renderTask = page.render({ canvasContext: canvas.getContext('2d'), viewport });
  try { await renderTask.promise; } catch (e) { if (e?.name !== 'RenderingCancelledException') throw e; }
  window.scrollTo(0, 0);
}

$('jump').addEventListener('submit', e => { e.preventDefault(); jumpTo(input.value); });
window.addEventListener('hashchange', () => pdf && jumpTo(decodeURIComponent(location.hash.slice(1))));
$('prev').addEventListener('click', () => show(current - 1));
$('next').addEventListener('click', () => show(current + 1));
document.addEventListener('keydown', e => {
  if (e.target === input) return;
  // Hebrew book: left arrow goes forward, right arrow goes back.
  if (e.key === 'ArrowLeft') show(current + 1);
  if (e.key === 'ArrowRight') show(current - 1);
});
let resizeTimer;
window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => pdf && show(current, true), 200); });

init().catch(err => { info.textContent = 'שגיאה בטעינה: ' + err.message; console.error(err); });
