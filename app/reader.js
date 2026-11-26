// The reading screen: the pages of a prayer one under the other, drawn only when they come near the screen.
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

let observer = null, live = null, wakeLock = null;

// plan: { title, sub, segments: [{ title, why, pages: [pdf numbers] }], notes: Map(pdf page -> [text]), general: [text] }
export function openReader(plan, { idx, crops, onError, startAt }) {
  closeReader();
  const host = $('r-pages');
  host.replaceChildren();
  $('r-title').textContent = plan.title;
  $('r-where').textContent = plan.sub ?? '';
  $('r-panel').hidden = true;
  const token = (live = { boxes: new Map(), tasks: new Map() });

  observer = new IntersectionObserver(entries => {
    for (const e of entries) e.isIntersecting ? draw(e.target, token, onError) : wipe(e.target, token);
  }, { rootMargin: '1200px 0px' });

  const heads = [], noted = new Set();
  plan.segments.forEach((s, k) => {
    const h = document.createElement('div');
    h.className = 'segh';
    h.append(Object.assign(document.createElement('span'), { textContent: s.title }));
    if (s.why) h.append(Object.assign(document.createElement('small'), { textContent: s.why }));
    host.append(h);
    heads.push(h);
    for (const n of s.pages) {
      // A reminder is shown on the first appearance of its page only.
      const notes = noted.has(n) ? null : plan.notes?.get(n);
      noted.add(n);
      if (notes) {
        const box = document.createElement('div');
        box.className = 'pnote';
        for (const t of notes) box.append(Object.assign(document.createElement('div'), { textContent: t }));
        host.append(box);
      }
      const c = crops[n - 1];
      const d = document.createElement('div');
      d.className = 'page';
      d.dataset.n = n;
      d.dataset.seg = k;
      d.style.aspectRatio = `${c[2] - c[0]} / ${c[3] - c[1]}`;
      d.setAttribute('role', 'img');
      d.setAttribute('aria-label', idx.label(n) ? `עמוד ${idx.label(n)}` : `דף ${n} בקובץ`);
      d.innerHTML = '<span class="wait"></span>';
      d.firstChild.textContent = idx.label(n) ? `עמוד ${idx.label(n)}` : '';
      d._crop = c;
      host.append(d);
      observer.observe(d);
    }
  });

  const where = () => {
    const y = 120;
    let cur = null;
    for (const p of host.querySelectorAll('.page')) { if (p.getBoundingClientRect().top <= y) cur = p; else break; }
    cur ??= host.querySelector('.page');
    if (!cur) return;
    const l = idx.label(+cur.dataset.n);
    $('r-where').textContent = `${plan.segments[+cur.dataset.seg].title}${l ? ` · עמוד ${l}` : ''}`;
    token.at = cur;
  };
  let ticking = false;
  token.onScroll = () => { if (!ticking) { ticking = true; requestAnimationFrame(() => { ticking = false; where(); }); } };
  addEventListener('scroll', token.onScroll, { passive: true });

  fillPanel(plan, heads, idx);
  $('reader').hidden = false;
  const target = startAt ? host.querySelector(`.page[data-n="${startAt}"]`) : null;
  if (target) jump(target); else scrollTo(0, 0);
  where();
  // Keep the screen on while praying (where the phone allows it).
  navigator.wakeLock?.request('screen').then(l => { wakeLock = l; }, () => {});
}

function jump(el) {
  scrollTo(0, el.getBoundingClientRect().top + scrollY - $('reader').querySelector('.rbar').offsetHeight - 4);
}

function fillPanel(plan, heads, idx) {
  const p = $('r-panel');
  p.replaceChildren();
  const section = t => p.append(Object.assign(document.createElement('h2'), { textContent: t }));
  const all = [...(plan.general ?? [])];
  for (const [n, texts] of plan.notes ?? []) for (const t of texts) all.push({ t, n });
  if (all.length) {
    section('היום אומרים');
    const ul = document.createElement('ul');
    ul.className = 'list card';
    for (const a of all) {
      const li = document.createElement('li');
      li.className = 'plain';
      li.append(Object.assign(document.createElement('span'), { textContent: a.t ?? a }));
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
    b.onclick = () => { p.hidden = true; jump(heads[k]); };
    li.append(b);
    ul.append(li);
  });
  p.append(ul);
}

async function draw(el, token, onError) {
  if (token.tasks.has(el)) return;
  const job = { cancelled: false, task: null };
  token.tasks.set(el, job);
  try {
    const pdf = await loadPdf();
    if (job.cancelled || token !== live) return;
    const page = await pdf.getPage(+el.dataset.n);
    if (job.cancelled || token !== live) return;
    const [l, t, r, b] = el._crop;
    // Extra sharpness, so that zooming in with two fingers stays readable; capped to spare the phone's memory.
    const px = Math.min(el.clientWidth * Math.min(devicePixelRatio || 1, 3) * 1.15, 2000);
    const scale = px / (r - l);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round((r - l) * scale);
    canvas.height = Math.round((b - t) * scale);
    const viewport = page.getViewport({ scale, offsetX: -l * scale, offsetY: -t * scale });
    job.task = page.render({ canvasContext: canvas.getContext('2d', { alpha: false }), viewport });
    await job.task.promise;
    if (job.cancelled) return;
    el.append(canvas);
    el.querySelector('.wait').hidden = true;
  } catch (e) {
    token.tasks.delete(el);
    if (e?.name !== 'RenderingCancelledException') onError?.(e);
  }
}

function wipe(el, token) {
  const job = token.tasks.get(el);
  if (!job) return;
  job.cancelled = true;
  job.task?.cancel();
  token.tasks.delete(el);
  const c = el.querySelector('canvas');
  if (c) { c.width = c.height = 0; c.remove(); } // frees the memory right away on iPhones
  el.querySelector('.wait').hidden = false;
}

export function closeReader() {
  if (observer) { observer.disconnect(); observer = null; }
  if (live) {
    removeEventListener('scroll', live.onScroll);
    for (const el of [...live.tasks.keys()]) wipe(el, live);
    live = null;
  }
  wakeLock?.release?.().catch(() => {});
  wakeLock = null;
  $('r-pages').replaceChildren();
  $('reader').hidden = true;
}

// Turning the phone changes the page width: draw again at the new size.
let lastWidth = innerWidth, timer;
addEventListener('resize', () => {
  if (innerWidth === lastWidth) return;
  lastWidth = innerWidth;
  clearTimeout(timer);
  timer = setTimeout(() => {
    if (!live) return;
    const pages = [...live.tasks.keys()], keep = live.at;
    for (const el of pages) { wipe(el, live); observer.unobserve(el); observer.observe(el); }
    if (keep) jump(keep);
  }, 250);
});
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && live) navigator.wakeLock?.request('screen').then(l => { wakeLock = l; }, () => {});
});
