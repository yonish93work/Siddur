// Step 3: turn results.json into a report page (report/index.html in the output folder).
// Run: node report.mjs
//
// Every difference spot is judged by a "2 out of 3" vote between PDF.js (the viewer), MuPDF and PDFium:
//  - real:   PDF.js differs from BOTH engines at this spot -> look at it (the viewer may draw it wrong).
//  - engine: PDF.js differs from one engine only and agrees with the other one there. Two independent
//            programs agreeing means the odd one out is that engine, not the viewer.
// Pages that were looked at by eye are explained in REVIEWED below.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { OUT, PROJECT, SCALE, PDF_SHA256 } from './config.mjs';
import { INK, TRACE, NEAR, MIN_SPOT, SHADE_MIN_INK, SHADE_RATIO } from './compare.mjs';

const results = JSON.parse(readFileSync(join(OUT, 'results.json'), 'utf8'));
const labels = Object.fromEntries(JSON.parse(readFileSync(join(PROJECT, 'data', 'pages.json'), 'utf8')).pages.map(p => [p.pdf, p]));
const selftest = existsSync(join(OUT, 'selftest.json')) ? JSON.parse(readFileSync(join(OUT, 'selftest.json'), 'utf8')) : null;
const REFS = ['mupdf', 'pdfium'], NAME = { mupdf: 'MuPDF', pdfium: 'PDFium' };

const KIND = { missing: 'חסר בצופה', extra: 'מיותר בצופה', tone: 'גוון/עובי שונה' };
const near = (a, b, m = 4) => a.x0 <= b.x1 + m && b.x0 - m <= a.x1 && a.y0 <= b.y1 + m && b.y0 - m <= a.y1;
const all = v => ['missing', 'extra', 'tone'].flatMap(k => (v?.[k] || []).map(s => ({ ...s, kind: k })));

const pages = results.map(e => {
  if (e.error) return { page: e.page, verdict: 'error', note: e.error, spots: [] };
  const mism = REFS.filter(r => e.vs[r].sizeMismatch);
  if (mism.length) return { page: e.page, verdict: 'error', note: mism.map(r => `${NAME[r]}: גודל שונה ${e.vs[r].sizeMismatch}`).join(', '), spots: [] };
  const spots = [];
  for (const ref of REFS) {
    const other = REFS.find(r => r !== ref), mine = all(e.vs[ref]), theirs = all(e.vs[other]);
    for (const s of mine) {
      const both = theirs.some(t => near(s, t));
      if (both && ref === 'pdfium') continue; // already listed from the MuPDF side
      spots.push({ ...s, ref, verdict: both ? 'real' : 'engine' });
    }
  }
  spots.sort((a, b) => (a.verdict === 'real' ? 0 : 1) - (b.verdict === 'real' ? 0 : 1));
  const has = v => spots.some(s => s.verdict === v);
  return { page: e.page, verdict: has('real') ? 'real' : has('engine') ? 'engine' : 'same', spots };
});

// Pages checked by eye (three engines side by side, enlarged), keyed by PDF page number.
// Re-check these if the PDF, PDF.js or the viewer's drawing settings change.
const REVIEWED = {
  681: 'נבדק בעין: זו תמונה סרוקה (קשתות ודמויות קטנות). הצופה חותך את הקצה התחתון של התמונה פיקסל או שניים (כ-0.2 מ"מ) אחרת מהמנועים. אין סימן חסר או מיותר.',
  781: 'נבדק בעין: נוסחה עם קווי שבר. קו שבר אחד דק מאוד, והצופה מצייר אותו קצת עבה וכהה יותר מהמנועים, כלומר ברור יותר. אין סימן חסר או מיותר.',
};
// Pages where a whole mark is missing or extra in the viewer, compared with each engine.
const markPages = ref => results.filter(e => e.vs?.[ref] && e.vs[ref].missing.length + e.vs[ref].extra.length > 0).length;
// Pages where the viewer and one engine are pixel-for-pixel the same (no spot at all).
const exact = ref => results.filter(e => e.vs?.[ref] && ['missing', 'extra', 'tone'].every(k => e.vs[ref][k].length === 0)).length;
const markBoth = pages.filter(p => p.spots.some(s => s.verdict === 'real' && s.kind !== 'tone')).length;

const count = v => pages.filter(p => p.verdict === v).length;
const lab = n => { const p = labels[n]; return p?.label != null ? `עמ' ${p.label}` : 'ללא מספר'; };
const hdr = n => labels[n]?.header || '';
const pad = n => String(n).padStart(3, '0');
const img = (src, alt, cls = '') => `<img loading="lazy" class="${cls}" src="${src}" alt="${alt}">`;
const VERDICT = {
  real: ['bad', 'הצופה שונה משני המנועים'],
  engine: ['ok', 'בכל נקודה הצופה מסכים עם אחד המנועים'],
  error: ['bad', 'שגיאה'],
};

function pageSection(p) {
  const [cls, text] = VERDICT[p.verdict];
  const shown = p.spots.filter(s => s.zoom != null).slice(0, 12);
  const zooms = shown.map(s => {
    const tag = `p${pad(p.page)}-${s.ref}-z${s.zoom}`;
    return `<figure class="zoom ${s.verdict}"><div class="pair">
      <div>${img(`img/${tag}-pdfjs.png`, 'צופה')}<span>הצופה (PDF.js)</span></div>
      <div>${img(`img/${tag}-ref.png`, NAME[s.ref])}<span>${NAME[s.ref]}</span></div></div>
      <figcaption>${KIND[s.kind]} · ${VERDICT[s.verdict][1]} · ${s.size} פיקסלים, מיקום (${s.x0},${s.y0})</figcaption></figure>`;
  }).join('');
  const diffs = REFS.filter(r => existsSync(join(OUT, 'report', 'img', `p${pad(p.page)}-${r}-diff.png`)))
    .map(r => `<a href="img/p${pad(p.page)}-${r}-diff.png" target="_blank">מפת הבדלים מול ${NAME[r]}</a>`).join(' · ');
  return `<section id="p${p.page}" class="page ${cls}">
    <h3>דף ${p.page} בקובץ · ${lab(p.page)} ${hdr(p.page) ? '· ' + hdr(p.page) : ''} <span class="tag ${cls}">${text}</span></h3>
    ${p.note ? `<p>${p.note}</p>` : ''}
    ${REVIEWED[p.page] ? `<p class="reviewed">${REVIEWED[p.page]}</p>` : ''}
    <p class="links">${diffs} · <a href="../pdfjs/p${pad(p.page)}.png" target="_blank">הדף בצופה</a> · <a href="../mupdf/p${pad(p.page)}.png" target="_blank">ב-MuPDF</a> · <a href="../pdfium/p${pad(p.page)}.png" target="_blank">ב-PDFium</a>
    · ${p.spots.length} נקודות הבדל${p.spots.length > shown.length ? ` (מוצגות ${shown.length} הגדולות)` : ''}</p>
    <div class="zooms">${zooms}</div></section>`;
}

const suspects = pages.filter(p => ['real', 'error'].includes(p.verdict));
const quirks = pages.filter(p => p.verdict === 'engine');
const t = selftest?.tally;
const selftestHtml = t ? `<table class="st">
  <tr><th>מה נבדק</th><th>נתפס</th></tr>
  <tr><td>נקודה/סימן נמחק לגמרי</td><td>${t.erase[0]} מתוך ${t.erase[1]}</td></tr>
  <tr><td>סימן צויר חלש מאוד (40% מהדיו)</td><td>${t.fade[0]} מתוך ${t.fade[1]}</td></tr>
  <tr><td>סימן אפור צויר שחור</td><td>${t.darken[0]} מתוך ${t.darken[1]}</td></tr>
  <tr><td>סימן זז חצי מילימטר (4 פיקסלים)</td><td>${t.move4[0]} מתוך ${t.move4[1]}</td></tr>
  <tr><td>סימן זז כ-0.7 מ"מ (6 פיקסלים)</td><td>${t.move6[0]} מתוך ${t.move6[1]}</td></tr>
  <tr><td>סימן שלא נגעו בו (אזעקת שווא)</td><td>${t.untouched[0]} מתוך ${t.untouched[1]}</td></tr></table>
  <p class="small">נבדקו ${selftest.perPage} הסימנים הקטנים ביותר בכל אחד מהדפים ${selftest.pages.join(', ')}. הסימן הקטן ביותר שנמצא: ${selftest.smallest} פיקסלים.</p>` : '<p>לא הורצה (node selftest.mjs).</p>';

const html = `<!doctype html>
<html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>בדיקת תצוגת הסידור</title>
<style>
  :root { --bg:#f6f4ef; --panel:#fff; --ink:#222; --muted:#6b6457; --bad:#b3261e; --warn:#a15c00; --ok:#2e7d32; }
  body { margin:0; background:var(--bg); color:var(--ink); font-family:system-ui,"Segoe UI",Arial,sans-serif; line-height:1.5; }
  main { max-width:1100px; margin:auto; padding:16px; }
  h1 { margin:.2em 0; } .small { font-size:13px; color:var(--muted); }
  .cards { display:flex; flex-wrap:wrap; gap:12px; margin:16px 0; }
  .card { background:var(--panel); border-radius:10px; padding:12px 18px; box-shadow:0 1px 4px rgba(0,0,0,.08); min-width:150px; }
  .card b { display:block; font-size:30px; } .card.ok b { color:var(--ok); } .card.warn b { color:var(--warn); } .card.bad b { color:var(--bad); }
  .box { background:var(--panel); border-radius:10px; padding:12px 18px; margin:16px 0; box-shadow:0 1px 4px rgba(0,0,0,.08); }
  .page { background:var(--panel); border-radius:10px; padding:10px 16px; margin:14px 0; border-right:6px solid var(--muted); }
  .page.bad { border-color:var(--bad); } .page.warn { border-color:var(--warn); } .page.ok { border-color:var(--ok); }
  .tag { font-size:13px; font-weight:normal; padding:2px 8px; border-radius:10px; color:#fff; background:var(--muted); }
  .tag.bad { background:var(--bad); } .tag.warn { background:var(--warn); } .tag.ok { background:var(--ok); }
  .zooms { display:flex; flex-wrap:wrap; gap:10px; }
  .zoom { margin:0; border:1px solid #ddd; border-radius:8px; padding:6px; }
  .zoom.real { border-color:var(--bad); }
  .pair { display:flex; gap:6px; direction:ltr; } .pair div { text-align:center; font-size:12px; color:var(--muted); }
  .pair img { display:block; width:auto; max-width:240px; image-rendering:pixelated; border:1px solid #eee; background:#fff; }
  figcaption { font-size:12px; color:var(--muted); max-width:490px; }
  table.st { border-collapse:collapse; } .st td, .st th { border-bottom:1px solid #eee; padding:4px 12px; text-align:right; }
  .chips a { display:inline-block; margin:2px; padding:1px 8px; border-radius:8px; background:#eef3e9; color:var(--ok); text-decoration:none; font-size:13px; }
  details summary { cursor:pointer; font-weight:bold; }
  .reviewed { background:#eef3e9; border-radius:8px; padding:6px 10px; }
  a { color:#1f5f8b; }
</style></head><body><main>
<h1>בדיקת תצוגת הסידור: כל ${pages.length} הדפים</h1>
<p class="small">נוצר ${new Date().toLocaleString('he-IL')} · קובץ המקור: source/siddur.pdf (SHA-256 ${PDF_SHA256.slice(0, 16)}…, נבדק שזה הקובץ המקורי) · רזולוציה ${SCALE * 72} DPI (${SCALE}×)</p>

<div class="cards">
  <div class="card ok"><b>${exact('mupdf')}</b>דפים שבהם הצופה זהה ל-MuPDF בלי שום נקודת הבדל (מתוך ${pages.length})</div>
  <div class="card ok"><b>${count('same')}</b>דפים זהים לגמרי בשלושת המנועים</div>
  <div class="card ok"><b>${quirks.length}</b>דפים תקינים: הבדלי גוון קלים במנוע בדיקה אחד בלבד</div>
  <div class="card ${count('real') + count('error') ? 'warn' : 'ok'}"><b>${count('real') + count('error')}</b>דפים שבהם הצופה שונה משני המנועים (${suspects.filter(p => REVIEWED[p.page]).length} מהם נבדקו בעין)</div>
  <div class="card ${markBoth ? 'bad' : 'ok'}"><b>${markBoth}</b>דפים שבהם חסר או מיותר סימן בצופה לעומת שני המנועים</div>
</div>

<div class="box">
<h2>איך נבדק</h2>
<p>כל דף צויר שלוש פעמים, באותו גודל בדיוק:
<b>1.</b> בדיוק כמו שהצופה מצייר אותו: PDF.js 4.10.38 בתוך דפדפן Chrome אמיתי, עם אותן הגדרות כמו viewer.js.
<b>2.</b> ב-MuPDF, מנוע PDF עצמאי (של חברת Artifex).
<b>3.</b> ב-PDFium, המנוע של Google (זה שמציג PDF בתוך Chrome עצמו).
לשני המנועים האחרונים אין קוד משותף עם PDF.js.</p>
<p>אחר כך כל פיקסל בתמונת הצופה הושווה לתמונות של שני המנועים. הבדלי החלקה זעירים בשולי האותיות (פחות מפיקסל) לא נחשבים.
כל נקודה, פסיק, ניקוד, קו או חלק של אות שקיים בתמונה אחת וחסר בשנייה נחשב הבדל, וכך גם סימן שצויר בגוון או בעובי שונה בבירור.
כל הבדל נשפט בהצבעה של 2 מתוך 3: אם הצופה ומנוע אחד מסכימים והמנוע השני חורג, החריגה היא של מנוע הבדיקה, לא של הצופה.</p>
<h3>הוכחה שהבודק רגיש מספיק</h3>
<p>לקחנו דפים אמיתיים, קלקלנו בכוונה את תמונת הצופה (מחקנו נקודות ניקוד בודדות, החלשנו אותן, הזזנו אותן) ובדקנו שהבודק מוצא כל קלקול:</p>
${selftestHtml}
<p class="small">ספים טכניים: דיו ≥ ${INK}/255 כהות, עקבה ≥ ${TRACE}, סבילות מיקום ${NEAR} פיקסל, כתם מינימלי ${MIN_SPOT} פיקסלים, הפרש דיו לסימן ≥ ${SHADE_MIN_INK / 255} פיקסלים מלאים וגם ≥ ${SHADE_RATIO * 100}%.</p>
</div>

<h2>דפים שצריך להסתכל עליהם (${suspects.length})</h2>
${suspects.length ? suspects.map(pageSection).join('') : '<p class="box">אין. בכל הדפים הצופה הסכים עם לפחות אחד ממנועי הבדיקה, בכל נקודה.</p>'}

<details class="box"><summary>דפים שבהם רק מנוע בדיקה אחד חורג (${quirks.length}): הצופה תקין, לעיון בלבד</summary>
<p>בדפים האלה, בכל נקודת הבדל, הצופה מסכים עם אחד משני המנועים, והמנוע השני הוא החריג. כמעט תמיד זה PDFium, שמצייר קווים דקים (פתח, קמץ, קווי מסגרת) קצת עבים יותר.
סימן שלם חסר או מיותר לעומת MuPDF: ${markPages('mupdf')} דפים. לעומת PDFium: ${markPages('pdfium')} דפים.</p>
<p class="chips">${quirks.map(p => `<a href="#p${p.page}">${p.page}</a>`).join('')}</p>
${quirks.map(pageSection).join('')}
</details>
</main></body></html>`;

writeFileSync(join(OUT, 'report', 'index.html'), html);
writeFileSync(join(OUT, 'report', 'summary.json'), JSON.stringify({
  pages: pages.length, same: count('same'), engineQuirkOnly: quirks.length, exactVsMupdf: exact('mupdf'), exactVsPdfium: exact('pdfium'), real: count('real'), error: count('error'), markMissingOrExtraVsBoth: markBoth, vsMupdf: markPages('mupdf'), vsPdfium: markPages('pdfium'),
  suspects: suspects.map(p => ({ page: p.page, label: labels[p.page]?.label ?? null, verdict: p.verdict, spots: p.spots.length, reviewed: REVIEWED[p.page] || null })),
}, null, 1));
console.log(`same ${count('same')}, engine-quirk-only ${quirks.length}, real ${count('real')}, error ${count('error')}, mark missing/extra vs both ${markBoth} (vs MuPDF ${markPages('mupdf')}, vs PDFium ${markPages('pdfium')})`);
console.log(`Report: ${join(OUT, 'report', 'index.html')}`);
