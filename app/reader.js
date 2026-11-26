// The reading screen: one page at a time like a book (two side by side when the phone lies sideways),
// turned by a swipe, a tap on the page edge or the buttons. Today's additions are painted yellow, and what is
// printed next to them but not said today is painted grey. Double-tap zooms in; the moon button dims the pages.
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

const SAY = 'rgba(255, 214, 0, 0.42)', SKIP = 'rgba(120, 120, 120, 0.30)';
const ZOOM = 2.2;
const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

let state = null, wakeLock = null;

// plan: { title, segments: [{ title, why, pages }], notes: Map(pdf -> [text]), marks / skips: Map(pdf -> [[x0,y0,x1,y1]]),
//         general: [text], anchors: [[pdf, name]] }
// options: { idx, crops, onError, startAt, onMove(pdf), onReport(where), night, onNight(on) }
export function openReader(plan, options) {
  closeReader();
  const entries = [];
  plan.segments.forEach((s, k) => s.pages.forEach(n => entries.push({ n, seg: k })));
  // A reminder or a coloured box is shown where its page first appears.
  const seen = new Set();
  for (const e of entries) { e.first = !seen.has(e.n); seen.add(e.n); }

  state = { plan, ...options, entries, at: 0, cache: new Map(), busy: false, pending: 0, zoom: 1 };
  $('r-title').textContent = plan.title;
  $('r-panel').hidden = true;
  setNight(!!options.night, false);
  fillPanel();
  $('reader').hidden = false;
  document.body.classList.add('reading');
  const start = options.startAt ? entries.findIndex(e => e.n === options.startAt) : 0;
  show(Math.max(0, start), 0);
  keepAwake();
  if (options.toast) {
    const t = Object.assign(document.createElement('div'), { className: 'toast', textContent: options.toast });
    t.setAttribute('role', 'status');
    $('reader').append(t);
    setTimeout(() => t.remove(), 4500);
  }
}

// Keep the screen on while praying, if the user wants it (settings: "מסך פעיל") and the phone allows it.
function keepAwake() {
  if (state && state.keepAwake !== false) navigator.wakeLock?.request('screen').then(l => { wakeLock = l; }, () => {});
}

const twoUp = () => innerWidth > innerHeight && innerWidth >= 560;
// The first entry of the spread that holds entry i.
const spreadStart = i => (twoUp() ? i - (i % 2) : i);
const step = () => (twoUp() ? 2 : 1);

async function show(i, dir, focus) {
  const s = state;
  if (!s) return;
  // A tap during the page-turn is kept and done right after it, so quick taps are not lost.
  if (s.busy) { s.pending += Math.sign(dir || i - s.at); return; }
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
  s.onMove?.(list[0].n);
  s.busy = true;
  host.classList.toggle('zoomed', s.zoom > 1);
  try {
    const canvases = await Promise.all(list.map((e, k) => drawPage(e, sizes[k])));
    if (state !== s) return;
    canvases.forEach((c, k) => { if (c) boxes[k].replaceChildren(c); });
    host.append(spread);
    if (s.zoom > 1) {
      // Zoomed: scroll to the tapped point, or to the top right corner (where a Hebrew page starts).
      const f = focus ?? { x: 1, y: 0 };
      host.scrollTop = f.y * spread.scrollHeight - host.clientHeight / 2;
      host.scrollLeft = -(1 - f.x) * (spread.scrollWidth - host.clientWidth) || 0;
      if (!focus) { host.scrollTop = 0; host.scrollLeft = 0; }
    }
    if (old) {
      if (dir && s.zoom === 1 && !reduceMotion()) await turn(old, spread, dir);
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
  const ahead = s.entries.slice(i + step(), i + 2 * step());
  if (ahead.length) fit(ahead).forEach((size, k) => drawPage(ahead[k], size).catch(() => {}));
}

// The page sizes that fit the free screen area, keeping each page's shape (times the zoom).
function fit(list) {
  const host = $('r-pages');
  const W = host.clientWidth - 8, H = host.clientHeight - 8;
  const ratios = list.map(e => { const c = state.crops[e.n - 1]; return (c[2] - c[0]) / (c[3] - c[1]); });
  const totalRatio = ratios.reduce((a, b) => a + b, 0);
  const h = Math.min(H, W / totalRatio) * state.zoom;
  return ratios.map(r => ({ w: Math.floor(h * r), h: Math.floor(h) }));
}

async function drawPage(e, size) {
  const s = state;
  const key = `${e.n}:${size.w}:${e.first ? 1 : 0}`;
  if (s.cache.has(key)) {
    const job = s.cache.get(key);
    s.cache.delete(key); s.cache.set(key, job); // most recently used goes last
    return clone(await job);
  }
  const job = (async () => {
    const pdf = await loadPdf();
    const page = await pdf.getPage(e.n);
    const [l, t, r, b] = s.crops[e.n - 1];
    // Sharper than the screen, so zooming in with two fingers stays readable; capped to spare memory.
    const px = Math.min(size.w * Math.min(devicePixelRatio || 1, 3) * (s.zoom > 1 ? 1 : 1.25), 2600);
    const scale = px / (r - l);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round((r - l) * scale);
    canvas.height = Math.round((b - t) * scale);
    const ctx = canvas.getContext('2d', { alpha: false });
    await page.render({ canvasContext: ctx, viewport: page.getViewport({ scale, offsetX: -l * scale, offsetY: -t * scale }) }).promise;
    if (e.first) {
      ctx.globalCompositeOperation = 'multiply';
      for (const [map, color] of [[s.plan.skips, SKIP], [s.plan.marks, SAY]]) {
        ctx.fillStyle = color;
        for (const [x0, y0, x1, y1] of map?.get(e.n) ?? []) ctx.fillRect((x0 - l) * scale, (y0 - t) * scale, (x1 - x0) * scale, (y1 - y0) * scale);
      }
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
      const from = two ? oldSpread.lastElementChild : oldSpread.firstElementChild;
      if (!from) return resolve();
      leaf = from.cloneNode(true);
      copyCanvas(from, leaf);
      leaf.classList.add('leaf', 'fwd');
      place(leaf, from);
    } else {
      // Back: the new (right, or only) page comes back over the spine.
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
    $('r-pages').append(leaf);
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
  const r = like.getBoundingClientRect(), h = $('r-pages').getBoundingClientRect();
  Object.assign(leaf.style, { position: 'absolute', left: `${r.left - h.left}px`, top: `${r.top - h.top}px`, width: `${r.width}px`, height: `${r.height}px`, margin: 0 });
}

const label = e => state.idx.label(e.n) ?? `דף ${e.n}`;

function updateBars(list) {
  const s = state, first = list[0], last = list.at(-1);
  $('r-where').textContent = s.plan.segments[first.seg].title;
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
// Where the reader is now: { segment, page } for the error report.
export const where = () => state && { segment: state.plan.segments[state.entries[state.at].seg].title, page: label(state.entries[state.at]) };

function fillPanel() {
  const { plan, idx } = state, p = $('r-panel');
  p.replaceChildren();
  const el = (tag, props = {}, ...kids) => { const n = Object.assign(document.createElement(tag), props); n.append(...kids.filter(Boolean)); return n; };
  const pg = n => el('span', { className: 'pg', textContent: idx.label(n) ? `עמ' ${idx.label(n)}` : '' });
  const go = k => () => { p.hidden = true; show(k, 0); };

  // Places to jump to: each section, and inside it the known places (anchors) that fall on its pages.
  p.append(el('h2', { textContent: 'מעבר מהיר' }));
  const ul = el('ul', { className: 'list card jumps' });
  const used = new Set();
  plan.segments.forEach((s, k) => {
    const startIdx = state.entries.findIndex(e => e.seg === k);
    ul.append(el('li', {}, el('button', { type: 'button', className: 'item', onclick: go(startIdx) }, el('span', { textContent: s.title }), pg(s.pages[0]))));
    for (const [n, name] of plan.anchors ?? []) {
      if (n === s.pages[0] || used.has(n) || !s.pages.includes(n)) continue;
      used.add(n);
      const at = state.entries.findIndex(e => e.seg === k && e.n === n);
      ul.append(el('li', { className: 'sub' }, el('button', { type: 'button', className: 'item', onclick: go(at) }, el('span', { textContent: name }), pg(n))));
    }
  });
  p.append(ul);

  const rows = [...(plan.general ?? []).map(t => ({ t }))];
  for (const [n, texts] of plan.notes ?? []) for (const t of texts) rows.push({ t, n });
  if (rows.length) {
    p.append(el('h2', { textContent: 'מה אומרים היום' }));
    p.append(el('ul', { className: 'list card' }, ...rows.map(a => el('li', { className: 'plain' }, el('span', { className: 'say', textContent: a.t }), a.n ? pg(a.n) : null))));
    p.append(el('p', { className: 'sub', textContent: 'צהוב: אומרים היום. אפור: לא אומרים היום.' }));
  }
  if (state.onReport) {
    p.append(el('h2', { textContent: 'מצאת טעות?' }));
    p.append(el('div', { className: 'card' },
      el('p', { className: 'sub', style: 'margin-top:0', textContent: 'שולח הודעה עם התפילה, התאריך ומספר העמוד שפתוח עכשיו.' }),
      el('button', { type: 'button', className: 'btn primary', textContent: 'דווח על טעות', onclick: () => state.onReport(where()) })));
  }
}

function setNight(on, save = true) {
  document.body.classList.toggle('night', on);
  $('r-night').setAttribute('aria-pressed', String(on));
  $('r-night').textContent = on ? '☀' : '☾';
  if (save) state?.onNight?.(on);
}

export function closeReader() {
  if (state) for (const v of state.cache.values()) v.then(c => { c.width = c.height = 0; }, () => {});
  state = null;
  wakeLock?.release?.().catch(() => {});
  wakeLock = null;
  $('r-pages').replaceChildren();
  $('r-pages').classList.remove('zoomed');
  $('reader').hidden = true;
  $('reader').querySelector('.toast')?.remove();
  document.body.classList.remove('reading', 'night');
}

function toggleZoom(clientX, clientY) {
  const s = state;
  if (!s || s.busy) return;
  const host = $('r-pages'), sp = host.querySelector('.spread');
  let focus;
  if (s.zoom === 1 && sp) {
    const r = sp.getBoundingClientRect();
    focus = { x: Math.min(Math.max((clientX - r.left) / r.width, 0), 1), y: Math.min(Math.max((clientY - r.top) / r.height, 0), 1) };
  }
  s.zoom = s.zoom === 1 ? ZOOM : 1;
  show(s.at, 0, focus);
}

// ---- turning by touch, mouse and keyboard
(() => {
  const host = $('r-pages');
  let x0 = null, y0 = null, t0 = 0, multi = false, lastTap = 0, tapTimer = null;
  host.addEventListener('touchstart', e => {
    multi = e.touches.length > 1;
    if (e.touches.length === 1) { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; t0 = Date.now(); }
  }, { passive: true });
  host.addEventListener('touchend', e => {
    if (x0 === null || multi || (visualViewport?.scale ?? 1) > 1.05) { x0 = null; return; }
    const t = e.changedTouches[0], dx = t.clientX - x0, dy = t.clientY - y0;
    x0 = null;
    const zoomed = state?.zoom > 1;
    if (!zoomed && Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.4 && Date.now() - t0 < 800) {
      // In a Hebrew book the next page is reached by pulling from left to right.
      dx > 0 ? next() : prev();
      e.preventDefault();
    } else if (Math.abs(dx) < 10 && Math.abs(dy) < 10) {
      e.preventDefault();
      tap(t.clientX, t.clientY);
    }
  });
  host.addEventListener('click', e => { if (!('ontouchstart' in window)) tap(e.clientX, e.clientY); });
  // One tap on the page edge turns the page; two quick taps zoom in or out.
  function tap(x, y) {
    const now = Date.now();
    if (now - lastTap < 320) { clearTimeout(tapTimer); lastTap = 0; toggleZoom(x, y); return; }
    lastTap = now;
    clearTimeout(tapTimer);
    tapTimer = setTimeout(() => {
      if (!state || state.zoom > 1 || (visualViewport?.scale ?? 1) > 1.05) return;
      const r = host.getBoundingClientRect();
      if (x < r.left + r.width * 0.3) next(); else if (x > r.left + r.width * 0.7) prev();
    }, 320);
  }
  document.addEventListener('keydown', e => {
    if (!state || !$('r-panel').hidden) return;
    if (e.key === 'ArrowLeft' || e.key === 'PageDown' || e.key === ' ') { e.preventDefault(); next(); }
    if (e.key === 'ArrowRight' || e.key === 'PageUp') { e.preventDefault(); prev(); }
  });
  $('r-next').onclick = () => next();
  $('r-prev').onclick = () => prev();
  $('r-night').onclick = () => setNight(!document.body.classList.contains('night'));
  // Turning the phone: show the same place as one page or as a spread.
  let w = innerWidth, h = innerHeight, timer;
  addEventListener('resize', () => {
    if (innerWidth === w && Math.abs(innerHeight - h) < 120) return;
    w = innerWidth; h = innerHeight;
    clearTimeout(timer);
    timer = setTimeout(() => { if (state) { state.busy = false; show(state.at, 0); } }, 200);
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && state) keepAwake();
  });
})();
