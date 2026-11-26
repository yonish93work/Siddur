// The reading screen: one page at a time like a book (two side by side when the phone lies sideways),
// turned by a swipe, a tap on the page edge or the buttons. Today's additions are painted yellow.
const $ = id => document.getElementById(id);

let pdfjs = null, pdfPromise = null;

export function loadPdf(onProgress) {
  pdfPromise ??= (async () => {
    pdfjs = await import(new URL('vendor/pdf.min.mjs', location.href).href);
    pdfjs.GlobalWorkerOptions.workerSrc = new URL('vendor/pdf.worker.min.mjs', location.href).href;
    const task = pdfjs.getDocument({
      url: new URL('siddur.pdf', location.href).href,
      // The siddur's old Davka fonts come out broken when the browser draws them as text,
      // so PDF.js draws every letter as a shape straight from the embedded font.
      disableFontFace: true,
      // Fetch the file whole: it comes from the phone's own storage once the app is installed.
      disableRange: true, disableStream: true,
      standardFontDataUrl: new URL('vendor/standard_fonts/', location.href).href,
    });
    task.onProgress = p => onProgress?.(p.total ? p.loaded / p.total : 0);
    return task.promise;
  })().catch(e => { pdfPromise = null; throw e; });
  return pdfPromise;
}

const MARK = 'rgba(255, 214, 0, 0.42)';
const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

let state = null, wakeLock = null;

// plan: { title, sub, segments: [{ title, why, pages }], notes: Map(pdf -> [text]), marks: Map(pdf -> [[x0,y0,x1,y1]]), general: [text] }
export function openReader(plan, { idx, crops, onError, startAt }) {
  closeReader();
  const entries = [];
  plan.segments.forEach((s, k) => s.pages.forEach(n => entries.push({ n, seg: k })));
  // A reminder or a yellow box is shown where its page first appears.
  const seen = new Set();
  for (const e of entries) { e.first = !seen.has(e.n); seen.add(e.n); }

  state = { plan, idx, crops, onError, entries, at: 0, cache: new Map(), busy: false };
  $('r-title').textContent = plan.title;
  $('r-panel').hidden = true;
  fillPanel();
  $('reader').hidden = false;
  document.body.classList.add('reading');
  const start = startAt ? entries.findIndex(e => e.n === startAt) : 0;
  show(Math.max(0, start), 0);
  navigator.wakeLock?.request('screen').then(l => { wakeLock = l; }, () => {});
}

const twoUp = () => innerWidth > innerHeight && innerWidth >= 560;
// The first entry of the spread that holds entry i.
const spreadStart = i => (twoUp() ? i - (i % 2) : i);
const step = () => (twoUp() ? 2 : 1);

async function show(i, dir) {
  const s = state;
  if (!s) return;
  // A tap during the page-turn is kept and done right after it, so quick taps are not lost.
  if (s.busy) { s.pending = (s.pending ?? 0) + Math.sign(dir || i - s.at); return; }
  i = spreadStart(Math.min(Math.max(i, 0), s.entries.length - 1));
  const host = $('r-pages');
  const old = host.querySelector('.spread');
  const spread = document.createElement('div');
  spread.className = 'spread';
  const list = s.entries.slice(i, i + step());
  const sizes = fit(list);
  const boxes = list.map((e, k) => {
    const d = document.createElement('div');
    d.className = 'page';
    d.style.width = `${sizes[k].w}px`;
    d.style.height = `${sizes[k].h}px`;
    const label = s.idx.label(e.n);
    d.setAttribute('role', 'img');
    d.setAttribute('aria-label', label ? `עמוד ${label}` : `דף ${e.n} בקובץ`);
    const wait = document.createElement('span');
    wait.className = 'wait';
    wait.textContent = label ? `עמוד ${label}` : '';
    d.append(wait);
    spread.append(d);
    return d;
  });
  s.at = i;
  updateBars(list);
  s.busy = true;
  try {
    const canvases = await Promise.all(list.map((e, k) => drawPage(e, sizes[k])));
    if (state !== s) return;
    canvases.forEach((c, k) => { if (c) { boxes[k].replaceChildren(c); } });
    host.append(spread);
    if (old) {
      if (dir && !reduceMotion()) await turn(old, spread, dir);
      old.remove();
    }
  } catch (e) {
    host.append(spread);
    old?.remove();
    s.onError?.(e);
  } finally {
    s.busy = false;
  }
  if (s.pending && state === s) {
    const n = s.pending;
    s.pending = 0;
    return show(s.at + n * step(), Math.sign(n));
  }
  // Get the next pages ready, so turning is instant.
  for (const e of s.entries.slice(i + step(), i + 2 * step())) drawPage(e, fit([e])[0]).catch(() => {});
}

// The page sizes that fit the free screen area, keeping each page's shape.
function fit(list) {
  const host = $('r-pages');
  const W = host.clientWidth - 8, H = host.clientHeight - 8;
  const ratios = list.map(e => { const c = state.crops[e.n - 1]; return (c[2] - c[0]) / (c[3] - c[1]); });
  const totalRatio = ratios.reduce((a, b) => a + b, 0);
  const h = Math.min(H, W / totalRatio);
  return ratios.map(r => ({ w: Math.floor(h * r), h: Math.floor(h) }));
}

async function drawPage(e, size) {
  const s = state;
  const key = `${e.n}:${size.w}:${e.first ? 1 : 0}`;
  if (s.cache.has(key)) {
    const c = await s.cache.get(key);
    s.cache.delete(key); s.cache.set(key, Promise.resolve(c)); // most recently used goes last
    return clone(c);
  }
  const job = (async () => {
    const pdf = await loadPdf();
    const page = await pdf.getPage(e.n);
    const [l, t, r, b] = s.crops[e.n - 1];
    // Sharper than the screen, so zooming in with two fingers stays readable; capped to spare memory.
    const px = Math.min(size.w * Math.min(devicePixelRatio || 1, 3) * 1.25, 2200);
    const scale = px / (r - l);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round((r - l) * scale);
    canvas.height = Math.round((b - t) * scale);
    const ctx = canvas.getContext('2d', { alpha: false });
    await page.render({ canvasContext: ctx, viewport: page.getViewport({ scale, offsetX: -l * scale, offsetY: -t * scale }) }).promise;
    const marks = e.first ? s.plan.marks?.get(e.n) : null;
    if (marks?.length) {
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = MARK;
      for (const [x0, y0, x1, y1] of marks) ctx.fillRect((x0 - l) * scale, (y0 - t) * scale, (x1 - x0) * scale, (y1 - y0) * scale);
      ctx.globalCompositeOperation = 'source-over';
    }
    return canvas;
  })();
  s.cache.set(key, job);
  while (s.cache.size > 8) {
    const [k, v] = s.cache.entries().next().value;
    s.cache.delete(k);
    v.then(c => { c.width = c.height = 0; }, () => {}); // frees the memory right away on iPhones
  }
  try { return clone(await job); } catch (err) { s.cache.delete(key); throw err; }
}

function clone(src) {
  const c = document.createElement('canvas');
  c.width = src.width; c.height = src.height;
  c.getContext('2d').drawImage(src, 0, 0);
  return c;
}

// The page-turn: the page lifts at its free edge and folds over the spine (on the right, in a Hebrew book).
function turn(oldSpread, newSpread, dir) {
  const two = newSpread.children.length > 1;
  return new Promise(resolve => {
    let leaf;
    if (dir > 0) {
      // Forward: the old (left, or only) page folds from left to right, revealing the new pages beneath.
      leaf = (two ? oldSpread.lastElementChild : oldSpread.firstElementChild)?.cloneNode(true);
      const from = two ? oldSpread.lastElementChild : oldSpread.firstElementChild;
      if (!leaf || !from) return resolve();
      copyCanvas(from, leaf);
      leaf.classList.add('leaf', 'fwd');
      place(leaf, from);
    } else {
      // Back: the new (right, or only) page comes back over from the right side.
      const target = newSpread.firstElementChild;
      if (!target) return resolve();
      leaf = target.cloneNode(true);
      copyCanvas(target, leaf);
      leaf.classList.add('leaf', 'back');
      if (two) leaf.classList.add('two');
      place(leaf, target);
    }
    if (dir > 0) oldSpread.remove(); // the new spread is already underneath
    else newSpread.style.visibility = 'hidden'; // the old pages stay in view until the leaf lands
    document.getElementById('r-pages').append(leaf);
    const done = () => { newSpread.style.visibility = ''; leaf.remove(); resolve(); };
    leaf.addEventListener('animationend', done, { once: true });
    setTimeout(done, 900);
  });
}
function copyCanvas(from, to) {
  const a = from.querySelector('canvas'), b = to.querySelector('canvas');
  if (a && b) { b.width = a.width; b.height = a.height; b.getContext('2d').drawImage(a, 0, 0); }
}
function place(leaf, like) {
  const r = like.getBoundingClientRect(), h = document.getElementById('r-pages').getBoundingClientRect();
  Object.assign(leaf.style, { position: 'absolute', left: `${r.left - h.left}px`, top: `${r.top - h.top}px`, width: `${r.width}px`, height: `${r.height}px`, margin: 0 });
}

function updateBars(list) {
  const s = state, first = list[0], last = list.at(-1);
  const label = e => s.idx.label(e.n) ?? `דף ${e.n}`;
  $('r-where').textContent = `${s.plan.segments[first.seg].title}`;
  $('r-pos').textContent = `עמוד ${list.length > 1 ? `${label(first)}–${label(last)}` : label(first)} · ${s.entries.indexOf(last) + 1} מתוך ${s.entries.length}`;
  $('r-prev').disabled = s.at === 0;
  $('r-next').disabled = s.at + step() >= s.entries.length;
  const notes = list.filter(e => e.first).flatMap(e => s.plan.notes?.get(e.n) ?? []);
  const box = $('r-notes');
  box.replaceChildren(...notes.map(t => Object.assign(document.createElement('div'), { textContent: t })));
  box.hidden = !notes.length;
  const why = s.plan.segments[first.seg].why;
  $('r-why').textContent = why;
  $('r-why').hidden = !why || first !== s.entries.find(e => e.seg === first.seg);
}

export const next = () => state && show(state.at + step(), 1);
export const prev = () => state && show(state.at - step(), -1);

function fillPanel() {
  const { plan, idx } = state, p = $('r-panel');
  p.replaceChildren();
  const section = t => p.append(Object.assign(document.createElement('h2'), { textContent: t }));
  const rows = [...(plan.general ?? []).map(t => ({ t }))];
  for (const [n, texts] of plan.notes ?? []) for (const t of texts) rows.push({ t, n });
  if (rows.length) {
    section('היום אומרים');
    const ul = document.createElement('ul');
    ul.className = 'list card';
    for (const a of rows) {
      const li = document.createElement('li');
      li.className = 'plain';
      li.append(Object.assign(document.createElement('span'), { textContent: a.t }));
      if (a.n) li.append(Object.assign(document.createElement('span'), { className: 'pg', textContent: `עמ' ${idx.label(a.n)}` }));
      ul.append(li);
    }
    p.append(ul);
  }
  section('קטעים');
  const ul = document.createElement('ul');
  ul.className = 'list card';
  plan.segments.forEach((s, k) => {
    const li = document.createElement('li'), b = document.createElement('button');
    b.type = 'button';
    b.className = 'item';
    b.append(Object.assign(document.createElement('span'), { textContent: s.title }),
      Object.assign(document.createElement('span'), { className: 'pg', textContent: idx.label(s.pages[0]) ? `עמ' ${idx.label(s.pages[0])}` : '' }));
    b.onclick = () => { p.hidden = true; show(state.entries.findIndex(e => e.seg === k), 0); };
    li.append(b);
    ul.append(li);
  });
  p.append(ul);
}

export function closeReader() {
  if (state) for (const v of state.cache.values()) v.then(c => { c.width = c.height = 0; }, () => {});
  state = null;
  wakeLock?.release?.().catch(() => {});
  wakeLock = null;
  $('r-pages').replaceChildren();
  $('reader').hidden = true;
  document.body.classList.remove('reading');
}

// ---- turning by touch, mouse and keyboard
(() => {
  const host = $('r-pages');
  let x0 = null, y0 = null, t0 = 0, multi = false;
  host.addEventListener('touchstart', e => {
    multi = e.touches.length > 1;
    if (e.touches.length === 1) { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; t0 = Date.now(); }
  }, { passive: true });
  host.addEventListener('touchend', e => {
    if (x0 === null || multi || (visualViewport?.scale ?? 1) > 1.05) { x0 = null; return; }
    const t = e.changedTouches[0], dx = t.clientX - x0, dy = t.clientY - y0;
    x0 = null;
    if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.4 && Date.now() - t0 < 800) {
      // In a Hebrew book the next page is reached by pulling from left to right.
      dx > 0 ? next() : prev();
      e.preventDefault();
    } else if (Math.abs(dx) < 10 && Math.abs(dy) < 10) tapAt(t.clientX);
  });
  host.addEventListener('click', e => { if (e.pointerType !== 'touch' && !('ontouchstart' in window)) tapAt(e.clientX); });
  function tapAt(x) {
    if ((visualViewport?.scale ?? 1) > 1.05) return;
    const w = host.clientWidth;
    if (x < w * 0.3) next(); else if (x > w * 0.7) prev();
  }
  document.addEventListener('keydown', e => {
    if (!state || !$('r-panel').hidden) return;
    if (e.key === 'ArrowLeft' || e.key === 'PageDown' || e.key === ' ') { e.preventDefault(); next(); }
    if (e.key === 'ArrowRight' || e.key === 'PageUp') { e.preventDefault(); prev(); }
  });
  $('r-next').onclick = () => next();
  $('r-prev').onclick = () => prev();
  // Turning the phone: show the same place as one page or as a spread.
  let w = innerWidth, h = innerHeight, timer;
  addEventListener('resize', () => {
    if (innerWidth === w && Math.abs(innerHeight - h) < 120) return;
    w = innerWidth; h = innerHeight;
    clearTimeout(timer);
    timer = setTimeout(() => { if (state) { state.busy = false; show(state.at, 0); } }, 200);
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && state) navigator.wakeLock?.request('screen').then(l => { wakeLock = l; }, () => {});
  });
})();
