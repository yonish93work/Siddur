// Screens: home ("now" and the three prayers), Hebrew calendar, table of contents, settings.
// The reading screen is in reader.js; the rules are in logic/.
import { HDate } from '@hebcal/core';
import { dayInfo } from './logic/calendar.js';
import { PRAYERS, reminders, dayTitles, omittedPages } from './logic/prayers.js';
import { HIGHLIGHTS } from './logic/highlights.js';
import { ANCHORS } from './logic/anchors.js';
import { ICONS, STAR } from './icons.js';
import { cellLabel } from './logic/labels.js';
import { skyOf, applySky } from './sky.js';
import { pageIndex } from './logic/pages.js';
import { buildMenu } from './logic/sections.js';
import { eventsBetween } from './logic/events.js';
import { JERUSALEM, CITIES, situation, civilDate, addDays, prayerDate, zmanimList } from './logic/now.js';
import { openReader, closeReader } from './reader.js';
import pagesData from '../data/pages.json';
import crops from '../data/crops.json';

const $ = id => document.getElementById(id);
const idx = pageIndex(pagesData.pages);
const menu = buildMenu(idx);
const SCREENS = ['home', 'calendar', 'browse', 'settings'];

// ---- settings, kept on the phone only
// special = { date: 'YYYY-MM-DD', kind: 'avel' | 'chatan' | 'brit' }: a one-day change to the prayers (p. 68).
const DEFAULTS = { il: true, walled: false, adjacent: false, place: null, night: false, special: null, installHidden: false, keepAwake: true, quiet: false, margins: false, sayColor: 'yellow', notToday: 'hide', pageSound: true };
const SPECIAL = { avel: 'בית האבל', chatan: 'חתן בבית הכנסת', brit: 'ברית מילה' };
const settings = { ...DEFAULTS };
try { Object.assign(settings, JSON.parse(localStorage.getItem('settings') ?? '{}')); } catch { /* storage blocked: defaults */ }
const save = () => { try { localStorage.setItem('settings', JSON.stringify(settings)); } catch { /* storage blocked */ } };
const place = () => settings.place ?? JERUSALEM;
const opts = () => ({ il: settings.il, walled: settings.walled });

let chosen = null; // a civil date picked by the user, or null = today

// ---- small helpers for building the screen
function el(tag, props = {}, ...kids) {
  const n = Object.assign(document.createElement(tag), props);
  for (const k of kids.flat()) if (k !== null && k !== undefined && k !== false && k !== '') n.append(k);
  return n;
}
const btn = (text, onclick, className = 'btn') => el('button', { type: 'button', className, onclick }, text);
const sec = text => el('h2', { className: 'sec', textContent: text });
const heb = d => d.renderGematriya(true, true);
const WEEKDAY = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
const weekdayName = d => (d.getDay() === 6 ? 'שבת' : `יום ${WEEKDAY[d.getDay()]}`);
const time = d => (d && !Number.isNaN(d.getTime()) ? new Intl.DateTimeFormat('he-IL', { hour: '2-digit', minute: '2-digit', timeZone: place().tz }).format(d) : '—');
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const gregText = d => d.toLocaleDateString('he-IL', { day: 'numeric', month: 'long', year: 'numeric' });
// The round gold arrow on the "now" button.
const goArrow = () => { const s = el('span', { className: 'go', ariaHidden: 'true' }); s.innerHTML = ICONS.chevron; return s; };
// A drawn icon inside a round gold-edged medallion.
const medal = key => { const s = el('span', { className: 'medal' }); s.innerHTML = ICONS[key] ?? ''; return s; };
const icon = key => { const s = el('span', { ariaHidden: 'true', style: 'display:contents' }); s.innerHTML = ICONS[key] ?? ''; return s; };
// Today's main times as { name: Date }.
const zmanim = (date, p = place()) => Object.fromEntries(zmanimList(date, p));

// The sky at the top of the screens follows the time of day where the user is.
let updateSky = function () {
  const p = place(), z = zmanim(civilDate(new Date(), p.tz), p);
  applySky(skyOf(new Date(), { alot: z['עלות השחר'], sunrise: z['זריחה'], sunset: z['שקיעה'], tzeit: z['צאת הכוכבים'] }));
}

// ---- opening a prayer or a section
// The day's facts, plus a mourner / groom / circumcision chosen for that date (no Tachanun, p. 68).
function infoFor(prayer, civil) {
  const info = dayInfo(prayerDate(prayer, civil), opts());
  const sp = settings.special;
  if (!sp || sp.date !== iso(civil) || prayer === 'arvit' || info.holy) return info;
  const reason = SPECIAL[sp.kind];
  return { ...info, noTachanun: info.noTachanun ?? reason, noTachanunMincha: info.noTachanunMincha ?? reason, avel: sp.kind === 'avel' };
}

function prayerPlan(prayer, civil) {
  const d = prayerDate(prayer, civil), info = infoFor(prayer, civil);
  const omit = omittedPages(prayer, info).map(l => idx.first(l));
  const segments = PRAYERS[prayer].build(info, { adjacent: settings.adjacent })
    .map(s => ({ ...s, pages: idx.range(s.from, s.to).filter(n => !omit.includes(n)) })).filter(s => s.pages.length);
  const notes = new Map(), marks = new Map(), skips = new Map(), general = [];
  const paint = (map, list) => {
    for (const m of list) {
      const [page, rects] = HIGHLIGHTS[prayer][m];
      const p = idx.first(page);
      map.set(p, [...(map.get(p) ?? []), ...rects]);
    }
  };
  for (const r of reminders(prayer, info)) {
    if (!r.page) { general.push(r.text); continue; }
    const n = idx.first(r.page);
    if (r.text) notes.set(n, [...(notes.get(n) ?? []), r.text]);
    paint(marks, r.marks);
    paint(skips, r.skips ?? []);
  }
  const anchors = ANCHORS.map(([l, name]) => [idx.first(l), name]);
  const night = prayer === 'arvit';
  const t = dayTitles(info).filter(x => !x.includes('בעומר') && x !== 'ערב שבת');
  return { title: `${PRAYERS[prayer].name}${t.length ? ` · ${t[0]}` : ''}`, sub: `${night ? 'ליל ' : ''}${heb(d)}`, segments, notes, marks, skips, general, info, anchors };
}

// ---- "continue where I stopped": the last place read, kept on the phone for a few hours
const RESUME_HOURS = 6;
const saveResume = r => { try { localStorage.setItem('resume', JSON.stringify(r)); } catch { /* storage blocked */ } };
function loadResume() {
  try {
    const r = JSON.parse(localStorage.getItem('resume') ?? 'null');
    return r && Date.now() - r.at < RESUME_HOURS * 3600e3 ? r : null;
  } catch { return null; }
}

function show(plan, startAt, resume) {
  readerOpen = true;
  for (const s of SCREENS) $(s).hidden = true;
  $('nav').hidden = true;
  openReader(plan, {
    idx, crops, startAt, onError: showError, night: settings.night, keepAwake: settings.keepAwake, margins: settings.margins, sayColor: settings.sayColor, notToday: settings.notToday, pageSound: settings.pageSound,
    toast: settings.quiet && resume?.kind === 'prayer' ? '🔕 כדאי להעביר את הטלפון למצב שקט' : '',
    onNight: on => { settings.night = on; save(); },
    onMove: n => saveResume({ ...resume, n, label: idx.label(n), at: Date.now() }),
    onReport: w => report(plan, w),
  });
  if (history.state?.reader !== true) history.pushState({ reader: true }, '');
}
const openPrayer = (prayer, civil, startAt) => show(prayerPlan(prayer, civil), startAt, { kind: 'prayer', prayer, civil: iso(civil), title: PRAYERS[prayer].name });
const openRange = (title, from, to, startAt) => show({
  title, segments: [{ title, why: '', pages: Array.from({ length: to - from + 1 }, (_, k) => from + k) }],
}, startAt, { kind: 'range', title, from, to });
function reopen(r) {
  if (r.kind === 'prayer') { const [y, m, d] = r.civil.split('-').map(Number); openPrayer(r.prayer, new Date(y, m - 1, d, 12), r.n); }
  else openRange(r.title, r.from, r.to, r.n);
}

// ---- "report a mistake": a ready message with everything needed to find the place
async function report(plan, w) {
  const lines = ['דיווח על טעות בסידור תפילת שלמה', `תפילה: ${plan.title}`, plan.sub ? `תאריך: ${plan.sub}` : '', w ? `מקום: ${w.segment}, עמוד ${w.page}` : '',
    `גרסה: ${__VERSION__}`, settings.special ? `הגדרה מיוחדת: ${SPECIAL[settings.special.kind]}` : '', '', 'מה לא נכון:'].filter((x, k, a) => x !== '' || a[k - 1] !== '');
  const text = lines.join('\n');
  if (navigator.share) { try { await navigator.share({ text }); return; } catch (e) { if (e?.name === 'AbortError') return; } }
  open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
}

let readerOpen = false, tab = 'home';
function leaveReader() {
  if (!readerOpen) return;
  $('r-panel').hidden = true;
  readerOpen = false;
  closeReader();
  go(tab, true);
  offerUpdate();
}
$('r-back').onclick = () => (history.state?.reader ? history.back() : leaveReader());
$('r-menu').onclick = () => { $('r-panel').hidden = !$('r-panel').hidden; };
addEventListener('popstate', leaveReader);

function showError(e) {
  console.error(e);
  const box = $('r-pages');
  if (box.querySelector('.err')) return;
  box.prepend(el('div', { className: 'card', style: 'position:relative;z-index:5;margin:16px' },
    el('p', { className: 'err', textContent: navigator.onLine ? 'טעינת הסידור נכשלה.' : 'אין חיבור לאינטרנט, והסידור עוד לא נשמר בטלפון.' }),
    btn('נסה שוב', () => location.reload())));
}

// What each prayer belongs to, on today or on a chosen date.
function prayerDates() {
  const now = new Date(), p = place();
  const s = situation(now, p), today = civilDate(now, p.tz);
  const isToday = !chosen || iso(chosen) === iso(today);
  return isToday ? { ...s, isToday, today } : { shacharit: chosen, mincha: chosen, arvit: chosen, halachic: new HDate(chosen), isToday, today, current: null };
}
const holyName = (prayer, civil) => { const i = dayInfo(prayerDate(prayer, civil), opts()); return i.holy ? (i.yomTov ?? 'שבת') : null; };

// The three prayers side by side; the one of this hour stands out. Shabbat and Yom Tov prayers are not shown.
function prayerButtons(dates, current) {
  return el('div', { className: 'seg', role: 'group', ariaLabel: 'תפילות' }, ['shacharit', 'mincha', 'arvit'].map(prayer => {
    const civil = dates[prayer], holy = holyName(prayer, civil), d = prayerDate(prayer, civil);
    const b = el('button', { type: 'button', className: prayer === current ? 'on' : '', onclick: () => openPrayer(prayer, civil) },
      icon(prayer),
      el('b', { textContent: PRAYERS[prayer].name }),
      el('small', { textContent: holy ? `${holy}: לא מוצג` : `${prayer === 'arvit' ? 'ליל ' : ''}${weekdayName(prayer === 'arvit' ? d.greg() : civil)}` }));
    b.disabled = !!holy;
    return b;
  }));
}

function timesCard(date) {
  const p = place();
  return el('div', { className: 'card times' },
    el('div', { className: 'where' }, el('h2', { textContent: 'זמני היום' }), el('span', {}, `${p.name} · `, btn('שינוי', () => go('settings'), 'link'))),
    el('ul', { className: 'list' }, zmanimList(date, p).map(([n, t]) => el('li', { className: 'plain' }, el('span', { textContent: n }), el('span', { textContent: time(t) })))));
}

// The arc of the sun over the day: sunrise on the right, midday at the top, sunset on the left. The bright part
// is the day that has passed; in the middle, how long until the next time people watch for.
function sunArc(date, live) {
  const z = zmanim(date), now = Date.now();
  const rise = z['זריחה']?.getTime(), set = z['שקיעה']?.getTime();
  const NS = 'http://www.w3.org/2000/svg';
  const svgEl = (tag, attrs) => { const n = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); return n; };
  const svg = svgEl('svg', { viewBox: '0 0 320 150', 'aria-hidden': 'true' });
  svg.innerHTML = '<defs><radialGradient id="sunglow"><stop offset="0" stop-color="#fff6d6"/><stop offset=".6" stop-color="#f6cf72"/><stop offset="1" stop-color="#f6cf72" stop-opacity="0"/></radialGradient></defs>';
  svg.append(svgEl('line', { x1: 6, y1: 138, x2: 314, y2: 138, class: 'faint', 'stroke-width': 1 }),
    svgEl('path', { d: 'M24 138 A136 136 0 0 1 296 138', fill: 'none', class: 'faint', 'stroke-width': 2.5, 'stroke-dasharray': '2 7', 'stroke-linecap': 'round' }),
    svgEl('line', { x1: 160, y1: 2, x2: 160, y2: 10, class: 'faint', 'stroke-width': 1.5 }));
  if (live && now > rise && now < set) {
    const a = Math.PI * (now - rise) / (set - rise), x = (160 + 136 * Math.cos(a)).toFixed(1), y = (138 - 136 * Math.sin(a)).toFixed(1);
    svg.append(svgEl('path', { d: `M296 138 A136 136 0 0 0 ${x} ${y}`, fill: 'none', class: 'lit', 'stroke-width': 3.5, 'stroke-linecap': 'round' }),
      svgEl('circle', { cx: x, cy: y, r: 22, fill: 'url(#sunglow)' }), svgEl('circle', { cx: x, cy: y, r: 9, fill: '#fff3cc' }));
  }
  const next = live ? nextTime() : null;
  return el('section', { className: 'arc', ariaLabel: 'מהלך היום' }, svg,
    next ? el('div', { className: 'count' }, el('span', { textContent: `${next.name} בעוד` }), el('b', { className: 'gold', textContent: next.left })) : '',
    el('div', { className: 'times' }, [['זריחה', z['זריחה']], ['חצות', z['חצות היום']], ['שקיעה', z['שקיעה']]].map(([n, t]) => el('span', {}, el('b', { textContent: time(t) }), n))));
}

// ---- home
function renderHome() {
  const dates = prayerDates();
  const hd = dates.halachic, info = dayInfo(hd, opts());
  const titles = dayTitles(info);
  const current = dates.current, holyNow = current && holyName(current, dates[current]);
  const step = n => { chosen = addDays(chosen ?? dates.today, n); if (iso(chosen) === iso(dates.today)) chosen = null; renderHome(); };

  const p = place(), dayDate = dates.isToday ? dates.today : chosen, z = zmanim(dayDate);
  let nowBox = '';
  if (current && holyNow) nowBox = el('div', { className: 'card holycard' }, el('b', { textContent: holyNow }), el('p', { className: 'sub', textContent: 'האפליקציה אינה מציגה תפילות בשבת וביום טוב.' }));
  else if (current) {
    const d = prayerDate(current, dates[current]);
    // Under the name: the date, and the time that matters for this prayer.
    const key = { shacharit: ['סוף זמן תפילה (גר"א)', 'סוף זמן תפילה'], mincha: ['שקיעה', 'שקיעה'] }[current];
    const line = key && z[key[0]]?.getTime() > Date.now() ? `${heb(d)} · ${key[1]} ${time(z[key[0]])}` : `${current === 'arvit' ? 'ליל ' : ''}${heb(d)}`;
    nowBox = el('button', { type: 'button', className: 'nowcard', onclick: () => openPrayer(current, dates[current]) },
      medal(current),
      el('span', { className: 'txt' }, el('small', { textContent: 'התפילה עכשיו' }), el('b', { className: 'gold', textContent: PRAYERS[current].name }), el('span', { textContent: line })),
      goArrow());
  }

  const resume = loadResume();
  const stepBtn = (n, key, label) => { const b = el('button', { type: 'button', className: 'daystep', onclick: () => step(n), ariaLabel: label }); b.innerHTML = ICONS[key]; return b; };
  const afterSunset = dates.isToday && iso(hd.greg()) !== iso(dates.today);
  const times = el('div', { hidden: !timesOpen }, timesCard(dayDate));
  const timesLink = btn(timesOpen ? 'הסתר את זמני היום' : 'כל זמני היום', () => { timesOpen = !timesOpen; times.hidden = !timesOpen; timesLink.textContent = timesOpen ? 'הסתר את זמני היום' : 'כל זמני היום'; }, 'link');
  const star = el('span', { className: 'medal brand' });
  star.innerHTML = STAR();
  $('home').replaceChildren(
    el('header', { className: 'hero home-hero' },
      el('div', { className: 'fx glow' }), el('div', { className: 'fx sun' }), el('div', { className: 'fx ground' }),
      star,
      el('h1', { className: 'gold', textContent: 'תפילת שלמה' }),
      el('div', { className: 'tagline' }, el('i'), el('span', { textContent: 'נוסח תימן שאמי' }), el('i')),
      sunArc(dayDate, dates.isToday)),
    el('div', { className: 'stack lift' },
      el('section', { className: 'card daycard', ariaLabel: 'היום' },
        stepBtn(-1, 'chevronRight', 'יום קודם'),
        el('div', { className: 'when' },
          el('b', { textContent: hd.renderGematriya(true) }),
          el('small', { textContent: `${weekdayName(hd.greg())} · ${hd.greg().toLocaleDateString('he-IL', { day: 'numeric', month: 'long' })}${afterSunset ? ' · מהשקיעה' : ''}` }),
          titles.length ? el('div', { className: 'chips' }, titles.map(t => el('span', { className: 'chip', textContent: t }))) : '',
          chosen ? btn('חזרה להיום', () => { chosen = null; renderHome(); }, 'link back') : ''),
        stepBtn(1, 'chevron', 'יום הבא')),
      resume ? el('button', { type: 'button', className: 'card resume', onclick: () => reopen(resume) },
        medal('back'), el('span', {}, el('b', { textContent: 'להמשיך מאיפה שעצרתי' }), el('small', { textContent: `${resume.title}${resume.label ? `, עמוד ${resume.label}` : ''}` }))) : '',
      nowBox,
      prayerButtons(dates, current),
      installCard(),
      el('div', { className: 'head' }, el('h2', { textContent: 'גישה מהירה' }), timesLink),
      tiles(info),
      times,
      specialCard(hd.greg()),
      shareCard(),
      el('p', { className: 'draft', textContent: 'גרסת ניסיון: החוקים נכתבו לפי ההוראות שבסידור, ועדיין לא אומתו בידי בקיא במנהג. בכל ספק יש לנהוג לפי הסידור המודפס והרב.' })),
  );
}
let timesOpen = false;

// The next of the times people most often watch for, and how long until it: { name, left: "35 דק׳" or "1:20" }.
function nextTime() {
  const now = Date.now(), p = place(), today = civilDate(new Date(), p.tz);
  const watch = ['עלות השחר', 'זריחה', 'סוף זמן קריאת שמע (גר"א)', 'סוף זמן תפילה (גר"א)', 'חצות היום', 'מנחה גדולה', 'פלג המנחה', 'שקיעה', 'צאת הכוכבים'];
  const nextOne = [...zmanimList(today, p), ...zmanimList(addDays(today, 1), p)].find(([n, t]) => watch.includes(n) && t && t.getTime() > now);
  if (!nextOne) return null;
  const mins = Math.max(1, Math.round((nextOne[1].getTime() - now) / 60000));
  return { name: nextOne[0].replace(/ \(גר"א\)$/, ''), left: mins < 60 ? `${mins} דק׳` : `${Math.floor(mins / 60)}:${String(mins % 60).padStart(2, '0')}` };
}

// A mourner, a groom or a circumcision today: no Tachanun (p. 68); in a mourner's house also Psalm 49 (p. 98).
function specialCard(civil) {
  const sp = settings.special?.date === iso(civil) ? settings.special.kind : '';
  const sel = el('select', { onchange: e => { settings.special = e.target.value ? { date: iso(civil), kind: e.target.value } : null; save(); renderHome(); } },
    el('option', { value: '', textContent: 'רגיל' }), ...Object.entries(SPECIAL).map(([k, v]) => el('option', { value: k, textContent: v })));
  sel.value = sp;
  sel.setAttribute('aria-label', 'מתפללים היום במקום מיוחד');
  return el('label', { className: `card special${sp ? ' on' : ''}` },
    el('span', {}, el('b', { textContent: 'מתפללים היום עם' }), el('small', { textContent: sp ? 'בלי תחנון, לפי עמוד 68. חוזר לרגיל מחר.' : 'חתן, ברית מילה או בית האבל משנים את התפילה' })), sel);
}

// How to put the app on the home screen, until it is installed (or the user closes this).
let installEvent = null;
addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvent = e; if (tab === 'home' && !readerOpen) renderHome(); });
function installCard() {
  const installed = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  if (installed || settings.installHidden) return '';
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const steps = ios
    ? ['לפתוח את האתר ב-Safari', 'ללחוץ על כפתור השיתוף (ריבוע עם חץ למעלה) בתחתית המסך', 'לגלול ולבחור "הוספה למסך הבית"', 'ללחוץ "הוסף". הסמל "תפילת שלמה" יופיע במסך הבית']
    : ['ללחוץ על שלוש הנקודות בפינה של Chrome', 'לבחור "התקנת אפליקציה" או "הוספה למסך הבית"', 'לאשר. הסמל "תפילת שלמה" יופיע במסך הבית'];
  return el('div', { className: 'card install' },
    el('div', { className: 'where' }, el('b', { textContent: '📲 להתקין את האפליקציה בטלפון' }), btn('✕', () => { settings.installHidden = true; save(); renderHome(); }, 'link')),
    installEvent ? el('div', { style: 'margin:8px 0' }, btn('התקן עכשיו', async () => { installEvent.prompt(); await installEvent.userChoice.catch(() => {}); installEvent = null; renderHome(); }, 'btn primary')) : '',
    el('ol', {}, steps.map(t => el('li', { textContent: t }))),
    el('p', { className: 'sub', style: 'margin:0;font-size:.85rem', textContent: 'אחרי ההתקנה האפליקציה עובדת גם בלי אינטרנט.' }));
}

function todayCard(prayer, civil) {
  const plan = prayerPlan(prayer, civil);
  const rows = [...plan.general.map(t => [t, null]), ...[...plan.notes].flatMap(([n, ts]) => ts.map(t => [t, n]))];
  return el('div', {}, sec(`מה אומרים ב${PRAYERS[prayer].name}`),
    el('div', { className: 'card' }, el('ul', { className: 'list' }, rows.map(([t, n]) => el('li', { className: 'plain' }, el('span', { className: 'say', textContent: t }),
      n ? el('span', { className: 'pg', textContent: `עמ' ${idx.label(n)}` }) : ''))),
    el('p', { className: 'sub', style: 'font-size:.82rem;margin-top:8px', textContent: 'בתוך הסידור: צהוב = אומרים היום, אפור = לא אומרים היום.' })));
}

function sectionByTitle(part) {
  for (const list of menu.values()) for (const e of list) if (e.title.includes(part)) return e;
  return null;
}
// The big buttons: what is needed every day, plus what the season brings (Chanukah lights, the Omer...).
function tiles(info) {
  const tomorrowChanukah = dayInfo(new HDate(info.d.abs() + 1), opts()).chanukah;
  const seasonal = [
    (info.chanukah || tomorrowChanukah) && ['הדלקת נרות', 'candle', 'נרות חנוכה'],
    info.megillah && ['מגילת אסתר', 'scroll', 'מגילת אסתר'],
    info.omer && ['ספירת העומר', 'omer', `ספירת העומר`],
    info.ashmorot && ['אשמורות', 'book', 'אשמורות'],
    info.levana && ['ברכת הלבנה', 'moonStar', 'ברכת הלבנה'],
    info.fast === 'av' && ['מגילת איכה', 'scroll', 'מגילת איכה'],
  ].filter(Boolean);
  const daily = [['ברכת המזון', 'cup', 'ברכת המזון'], ['מעין שלוש', 'grapes', 'מעין שלוש'], ['תפלת הדרך', 'road', 'תפילת הדרך'], ['קריאת שמע על המטה', 'bed', 'שמע על המטה']];
  // A round medallion with a short name under it; the full name and page are read out by screen readers.
  const tile = (title, key, onclick, full = title) => el('button', { type: 'button', className: 'q', onclick, title: full, ariaLabel: full }, medal(key), el('span', { textContent: title }));
  const fromMenu = ([part, key, name]) => { const e = sectionByTitle(part); return e && tile(name, key, () => openRange(e.title, e.from, e.to), `${e.title}, עמוד ${idx.label(e.from) ?? ''}`); };
  // "Asher Yatzar" is printed on the first page of Birchot Hashachar (p. 9).
  const asher = tile('אשר יצר', 'jug', () => openRange('אשר יצר', idx.first('9'), idx.first('9')), 'אשר יצר, עמוד 9');
  const list = [...seasonal.map(fromMenu), ...daily.slice(0, 1).map(fromMenu), asher, ...daily.slice(1).map(fromMenu)].filter(Boolean);
  list.push(tile('מצפן לכותל', 'compass', openCompass));
  list.push(tile('כל התפילות', 'book', () => go('browse'), 'כל התפילות: תוכן העניינים'));
  return el('div', { className: 'quick' }, list);
}

// ---- compass: which way to face to pray towards the Western Wall, from where the phone is
const KOTEL = { lat: 31.7767, lon: 35.2345 };
function bearingTo(lat, lon) {
  const r = Math.PI / 180, f1 = lat * r, f2 = KOTEL.lat * r, dl = (KOTEL.lon - lon) * r;
  const y = Math.sin(dl) * Math.cos(f2), x = Math.cos(f1) * Math.sin(f2) - Math.sin(f1) * Math.cos(f2) * Math.cos(dl);
  return (Math.atan2(y, x) / r + 360) % 360;
}
function distanceKm(lat, lon) {
  const r = Math.PI / 180, a = Math.sin((KOTEL.lat - lat) * r / 2) ** 2 + Math.cos(lat * r) * Math.cos(KOTEL.lat * r) * Math.sin((KOTEL.lon - lon) * r / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(a));
}
let compassStop = null;
async function openCompass() {
  // iPhones allow the compass only if asked right at the tap, so ask before anything else.
  const orientation = typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function'
    ? DeviceOrientationEvent.requestPermission().catch(() => 'denied') : Promise.resolve('granted');
  const status = el('p', { className: 'sub', textContent: 'מבקש את המיקום שלך…' });
  const ring = el('div', { className: 'ring' }, [['צ', 0], ['מז', 90], ['ד', 180], ['מע', 270]].map(([t, deg]) => el('span', { textContent: t, style: `rotate:${deg}deg` })));
  const needle = el('div', { className: 'needle', hidden: true });
  const dial = el('div', { className: 'dial' }, ring, needle, el('div', { className: 'hub' }));
  const info = el('p', { className: 'bearing' });
  const help = el('div', { className: 'card', hidden: true });
  const close = () => { compassStop?.(); compassStop = null; box.remove(); };
  const box = el('div', { className: 'overlay compass' },
    el('header', { className: 'hero' }, el('h1', { className: 'gold', textContent: 'מצפן לכותל' }), el('p', { className: 'sub', textContent: 'סובב את הטלפון עד שהחץ הזהוב מצביע ישר קדימה' })),
    dial, info, status, help,
    el('div', { style: 'display:flex;gap:10px;justify-content:center;margin-top:12px' }, btn('נסה שוב', () => { close(); openCompass(); }), btn('סגור', close, 'btn primary')));
  document.body.append(box);

  // 1. Location: asked for every time the compass opens, as the phone's own permission prompt.
  const pos = await new Promise(res => {
    if (!navigator.geolocation) return res(null);
    navigator.geolocation.getCurrentPosition(p => res(p.coords), err => res({ error: err.code }), { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 });
  });
  if (!pos || pos.error) {
    status.textContent = 'כדי להראות את הכיוון לכותל, צריך לאשר לאפליקציה את שירותי המיקום.';
    const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
    help.hidden = false;
    help.replaceChildren(el('b', { textContent: 'איך מאשרים מיקום' }), el('ol', {}, (ios
      ? ['הגדרות ← פרטיות ואבטחה ← שירותי מיקום: להפעיל', 'באותו מסך: Safari (או "אתרי Safari") ← "בזמן השימוש"', 'לחזור לכאן וללחוץ "נסה שוב"']
      : ['להפעיל "מיקום" בתפריט המהיר של הטלפון (מושכים את המסך מלמעלה)', 'ב-Chrome: ללחוץ על סמל המנעול או ⓘ ליד הכתובת ← הרשאות ← מיקום ← "אפשר"', 'לחזור לכאן וללחוץ "נסה שוב"']).map(t => el('li', { textContent: t }))));
    return;
  }
  const target = bearingTo(pos.latitude, pos.longitude);
  const km = distanceKm(pos.latitude, pos.longitude);
  needle.hidden = false;
  info.textContent = km < 0.05 ? 'אתה ליד הכותל.' : `הכותל בכיוון ${Math.round(target)}° מהצפון, במרחק ${km < 10 ? km.toFixed(1) : Math.round(km)} ק"מ`;
  needle.style.transform = `rotate(${target}deg)`;
  status.textContent = 'מחכה למצפן של הטלפון…';

  // 2. The phone's compass (iPhone asks for permission once).
  if (await orientation !== 'granted') {
    status.textContent = 'לא אושרה גישה למצפן של הטלפון. אפשר לכוון לפי המעלות (0° הוא צפון), או לסגור, לפתוח שוב את המצפן וללחוץ "אישור".';
    return;
  }
  let got = false;
  const onTurn = e => {
    const heading = e.webkitCompassHeading ?? (e.absolute || e.type === 'deviceorientationabsolute' ? (360 - (e.alpha ?? 0)) % 360 : null);
    if (heading == null) return;
    got = true;
    ring.style.transform = `rotate(${-heading}deg)`;
    needle.style.transform = `rotate(${target - heading}deg)`;
    const off = Math.abs(((target - heading + 540) % 360) - 180);
    dial.classList.toggle('aligned', off < 8);
    status.textContent = off < 8 ? '✓ אתה מכוון לכותל' : 'סובב לאט עד שהחץ מצביע קדימה';
  };
  const evName = 'ondeviceorientationabsolute' in window ? 'deviceorientationabsolute' : 'deviceorientation';
  addEventListener(evName, onTurn);
  compassStop = () => removeEventListener(evName, onTurn);
  setTimeout(() => { if (!got && box.isConnected) status.textContent = 'לא התקבל מצפן מהטלפון (במחשב אין מצפן). אפשר לכוון לפי המעלות: 0° הוא צפון.'; }, 3000);
}
const menuItem = e => el('li', {}, el('button', { type: 'button', className: 'item', onclick: () => openRange(e.title, e.from, e.to) },
  el('span', { textContent: e.title }), el('span', { className: 'pg', textContent: idx.label(e.from) ? `עמ׳ ${idx.label(e.from)}` : '' })));
// The places inside a section (למנצח, אשרי, עמידה...): open the section at that place.
const ANCHOR_PAGES = ANCHORS.map(([l, name]) => [idx.first(l), name]);
const SECTION_TITLES = new Set([...menu.values()].flat().map(e => e.title));
const subItems = e => ANCHOR_PAGES.filter(([n, name]) => n >= e.from && n <= e.to && !SECTION_TITLES.has(name))
  .map(([n, name]) => el('li', { className: 'sub' }, el('button', { type: 'button', className: 'item', onclick: () => openRange(e.title, e.from, e.to, n) },
    el('span', { textContent: name }), el('span', { className: 'pg', textContent: `עמ׳ ${idx.label(n)}` }))));

// ---- Hebrew calendar
let calMonth = null, calSel = null; // calMonth = HDate of the 1st of the month shown; calSel = absolute day picked

function renderCalendar() {
  const today = new HDate(civilDate(new Date(), place().tz));
  calMonth ??= new HDate(1, today.getMonth(), today.getFullYear());
  calSel ??= today.abs();
  const y = calMonth.getFullYear(), m = calMonth.getMonth();
  const first = new HDate(1, m, y), days = HDate.daysInMonth(m, y), last = new HDate(days, m, y);
  const ev = eventsBetween(first.greg(), last.greg(), { ...opts(), place: place() });
  const g1 = first.greg(), g2 = last.greg();
  const gregSpan = g1.getMonth() === g2.getMonth()
    ? g1.toLocaleDateString('he-IL', { month: 'long', year: 'numeric' })
    : `${g1.toLocaleDateString('he-IL', { month: 'long' })}${g1.getFullYear() !== g2.getFullYear() ? ` ${g1.getFullYear()}` : ''} – ${g2.toLocaleDateString('he-IL', { month: 'long', year: 'numeric' })}`;
  // Next month starts the day after this one ends; the previous one ends the day before this one starts.
  const move = n => {
    const d = new HDate(n > 0 ? last.abs() + 1 : first.abs() - 1);
    calMonth = new HDate(1, d.getMonth(), d.getFullYear());
    calSel = calMonth.abs();
    renderCalendar();
  };

  const grid = el('div', { className: 'grid', role: 'grid' }, ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'].map(d => el('div', { className: 'wd', textContent: d })));
  for (let k = 0; k < first.getDay(); k++) grid.append(el('div', { className: 'cell empty' }));
  for (let dnum = 1; dnum <= days; dnum++) {
    const d = new HDate(dnum, m, y), a = d.abs(), info = ev.get(a)?.info ?? dayInfo(d, opts());
    const list = (ev.get(a)?.events ?? []).filter(e => e.kind !== 'time' && e.kind !== 'omer');
    // A coloured tag for the day's most important event ("חנוכה ב׳"), a detail line, and the portion (labels.js).
    const L = cellLabel(list);
    const cls = ['cell', L.kind && `k-${L.kind}`, d.getDay() === 6 && 'sat', info.noTachanun && d.getDay() !== 6 && 'notach', a === today.abs() && 'today', a === calSel && 'sel'].filter(Boolean).join(' ');
    const name = d.renderGematriya(true).split(' ')[0];
    grid.append(el('button', { type: 'button', className: cls, onclick: () => { calSel = a; renderCalendar(); }, ariaLabel: [name, ...list.map(e => e.text)].join(', ') },
      el('span', { className: 'hd', textContent: name }),
      el('span', { className: 'gd', textContent: d.greg().getDate() }),
      L.tag ? el('span', { className: 'tag', textContent: L.tag }) : '',
      L.detail ? el('span', { className: 'det', textContent: L.detail }) : '',
      L.extra ? el('span', { className: 'ex', textContent: L.extra }) : ''));
  }

  const sel = new HDate(calSel), selEv = ev.get(calSel)?.events ?? [], civil = sel.greg();
  const dates = { shacharit: civil, mincha: civil, arvit: civil };
  const day = el('section', { className: 'card day', ariaLabel: 'היום שנבחר' },
    el('div', { className: 'top' }, el('h2', { textContent: `${weekdayName(civil)}, ${heb(sel)}` }), el('span', { textContent: civil.toLocaleDateString('he-IL', { day: 'numeric', month: 'long' }) })),
    selEv.length ? el('div', { className: 'evs' }, selEv.map(e => el('span', { className: e.kind, textContent: e.text }))) : el('p', { className: 'sub', textContent: 'אין אירועים מיוחדים.' }),
    ev.get(calSel)?.info?.noTachanun ? el('p', { className: 'sub', textContent: `אין תחנון: ${ev.get(calSel).info.noTachanun}` }) : '',
    prayerButtons(dates, null),
    btn('פתח במסך התפילה', () => { chosen = iso(civil) === iso(civilDate(new Date(), place().tz)) ? null : civil; go('home'); }, 'link'));
  const navBtn = (n, key, label) => { const b = el('button', { type: 'button', className: 'skybtn', onclick: () => move(n), ariaLabel: label }); b.innerHTML = ICONS[key]; return b; };
  const legend = (cls, text) => el('b', { style: `background:var(--${cls})`, textContent: text });

  $('calendar').replaceChildren(
    el('header', { className: 'hero' },
      el('div', { className: 'mhead' },
        navBtn(-1, 'chevronRight', 'החודש הקודם'),
        el('div', {}, el('h1', { className: 'gold', textContent: first.renderGematriya(true).split(' ').slice(1).join(' ') }), el('p', { className: 'sub', textContent: gregSpan })),
        navBtn(1, 'chevron', 'החודש הבא')),
      el('div', { className: 'mtoday' }, btn('היום', () => { calMonth = null; calSel = null; renderCalendar(); }, 'skypill'))),
    el('div', { className: 'stack lift' },
      el('section', { className: 'card calcard', ariaLabel: 'ימי החודש' }, grid,
        el('div', { className: 'legend' }, legend('holiday', 'חג'), legend('rc', 'ראש חודש'), legend('fast', 'צום'), legend('modern', 'יום לאומי'),
          el('span', {}, el('i'), 'בלי תחנון'))),
      day,
      timesCard(civil)),
  );
}

// ---- sharing the app with others: the phone's own share list, or copying the message where there is none
const SHARE_TEXT = url => `סידור תפילת שלמה (נוסח תימן שאמי), לפי היום בלוח העברי:
${url}

אנדרואיד: לפתוח ב-Chrome ← שלוש נקודות ← "התקנת אפליקציה" או "הוספה למסך הבית".
אייפון: לפתוח ב-Safari ← כפתור השיתוף ← "הוספה למסך הבית".
בפעם הראשונה צריך אינטרנט, אחר כך עובד גם בלי.`;

function shareCard() {
  const url = new URL('./', location.href).href;
  const status = el('small');
  status.setAttribute('role', 'status');
  const share = async () => {
    const text = SHARE_TEXT(url);
    if (navigator.share) {
      try { await navigator.share({ title: 'סידור תפילת שלמה', text }); return; } catch (e) { if (e?.name === 'AbortError') return; }
    }
    try { await navigator.clipboard.writeText(text); status.textContent = 'ההודעה הועתקה. אפשר להדביק אותה בוואטסאפ.'; return; } catch { /* no clipboard */ }
    open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
  };
  return el('section', { className: 'card' },
    el('div', { className: 'grp-h' }, medal('share2'), el('h2', { textContent: 'לשתף את האפליקציה' })),
    el('p', { className: 'sub', style: 'margin-top:0', textContent: 'שולח קישור והוראות התקנה בוואטסאפ, בהודעה או במייל.' }),
    el('div', { style: 'margin-top:10px' }, btn('שתף', share, 'btn primary'), ' ', status));
}

// ---- table of contents
function renderBrowse() {
  const err = el('p', { className: 'err' });
  err.setAttribute('role', 'status');
  const input = el('input', { inputMode: 'text', placeholder: 'למשל 105', autocomplete: 'off' });
  input.setAttribute('aria-label', 'מספר עמוד');
  const form = el('form', { className: 'jumpbox' }, el('span', { textContent: 'קפיצה לעמוד' }), input, el('button', { type: 'submit', className: 'btn primary', textContent: 'פתח' }), err);
  form.onsubmit = ev => {
    ev.preventDefault();
    const label = input.value.replace(/[\s'"״׳]/g, '');
    const n = idx.first(label.startsWith('@') ? '' : label);
    if (!n) { err.textContent = label ? `עמוד ${label} לא קיים בסידור.` : 'כתוב מספר עמוד.'; return; }
    err.textContent = '';
    openRange('הסידור', Math.max(1, n - 5), Math.min(idx.pages.length, n + 30), n);
  };
  // Search: typing a word keeps only the parts whose name has it, and opens their groups.
  const search = el('input', { type: 'search', placeholder: 'חיפוש, למשל הבדלה', autocomplete: 'off' });
  search.setAttribute('aria-label', 'חיפוש בתוכן העניינים');
  const searchBox = el('label', { className: 'searchbox' }, icon('search'), search);
  const none = el('p', { className: 'sub', hidden: true, textContent: 'לא נמצא. אפשר לנסות מילה אחרת, או לקפוץ למספר עמוד למטה.' });
  const GROUP_ICON = { 'שחרית': 'shacharit', 'מנחה': 'mincha', 'ערבית': 'arvit', 'מוצאי שבת': 'candle', 'ראש חודש': 'moonStar', 'חנוכה ופורים': 'candle',
    'מועדים': 'calendar', 'תעניות': 'clock', 'ימי תשובה': 'book', 'ברכות': 'cup', 'מעגל החיים': 'jug', 'לימוד': 'scroll', 'לוחות': 'calendar' };
  const groups = [...menu].map(([g, list]) => {
    const chev = el('span', { className: 'chev' });
    chev.innerHTML = ICONS.chevronDown;
    return el('details', { className: 'card grp' },
      el('summary', {}, medal(GROUP_ICON[g] ?? 'book'), el('span', { className: 't' }, el('b', { textContent: g }), el('small', { textContent: `${list.length} ${list.length === 1 ? 'חלק' : 'חלקים'}` })), chev),
      el('ul', { className: 'list jumps' }, list.flatMap(e => [menuItem(e), ...subItems(e)].map((li, k, all) => { li.dataset.t = `${g} ${e.title} ${li.textContent}`; return li; }))));
  });
  const norm = s => s.replace(/[֑-ׇ"'״׳]/g, '').replace(/\s+/g, ' ').trim();
  search.oninput = () => {
    const q = norm(search.value);
    let found = 0;
    for (const d of groups) {
      let shown = 0;
      for (const li of d.querySelectorAll('li')) { const ok = !q || norm(li.dataset.t).includes(q); li.hidden = !ok; shown += ok; }
      d.hidden = !shown;
      d.open = !!q && shown > 0;
      found += shown;
    }
    none.hidden = !q || found > 0;
  };
  $('browse').replaceChildren(
    el('header', { className: 'hero' }, el('h1', { className: 'gold', textContent: 'תוכן העניינים' }), el('p', { className: 'sub', textContent: 'כל חלקי הסידור, לפי הסדר שבעמוד 3' })),
    el('div', { className: 'stack lift', style: 'gap:12px' }, searchBox, none, ...groups, form));
}

// ---- settings
function renderSettings() {
  const check = (key, title, sub) => {
    const input = el('input', { type: 'checkbox', checked: settings[key], onchange: e => { settings[key] = e.target.checked; save(); } });
    return el('label', { className: 'set' }, el('span', {}, title, el('small', { textContent: sub })), input);
  };
  const choose = (key, title, sub, options) => {
    const sel = el('select', { onchange: e => { settings[key] = e.target.value; save(); } }, options.map(([v, t]) => el('option', { value: v, textContent: t })));
    sel.value = settings[key];
    return el('label', { className: 'set' }, el('span', {}, title, el('small', { textContent: sub })), sel);
  };
  const status = el('small');
  const byName = (a, b) => a[1].name.localeCompare(b[1].name, 'he');
  const group = (label, g) => el('optgroup', { label }, [...CITIES.entries()].filter(([, c]) => c.group === g).sort(byName).map(([k, c]) => el('option', { value: String(k), textContent: c.name })));
  const city = el('select', { onchange: e => { settings.place = e.target.value === '0' ? null : CITIES[+e.target.value] ?? settings.place; save(); renderSettings(); } },
    el('option', { value: '0', textContent: 'ירושלים' }),
    group('יישובים ושכונות תימניים', 'yemenite'), group('ערים', 'city'),
    settings.place && !CITIES.some(c => c.name === settings.place.name) ? el('option', { value: 'mine', textContent: 'המיקום שלי' }) : '');
  city.value = settings.place ? String(CITIES.findIndex(c => c.name === settings.place.name)).replace('-1', 'mine') : '0';
  city.setAttribute('aria-label', 'עיר');
  const locate = btn('לפי מיקום הטלפון', () => {
    if (!navigator.geolocation) { status.textContent = 'הטלפון לא תומך במיקום.'; return; }
    status.textContent = 'מחפש…';
    navigator.geolocation.getCurrentPosition(g => {
      settings.place = { name: 'המיקום שלי', lat: +g.coords.latitude.toFixed(2), lon: +g.coords.longitude.toFixed(2), tz: Intl.DateTimeFormat().resolvedOptions().timeZone, candles: 20 };
      save();
      renderSettings();
    }, () => { status.textContent = 'לא התקבלה הרשאה למיקום. נשארים עם העיר שנבחרה.'; }, { timeout: 15000, maximumAge: 3600000 });
  });
  const il = el('select', { onchange: e => { settings.il = e.target.value === 'il'; save(); } },
    el('option', { value: 'il', textContent: 'ארץ ישראל' }), el('option', { value: 'abroad', textContent: 'חוץ לארץ' }));
  il.value = settings.il ? 'il' : 'abroad';

  const saved = el('span', { textContent: '' });
  const box = (key, title, ...rows) => el('section', { className: 'card' }, el('div', { className: 'grp-h' }, medal(key), el('h2', { textContent: title })), ...rows);
  $('settings').replaceChildren(
    el('header', { className: 'hero' }, el('h1', { className: 'gold', textContent: 'הגדרות' }), el('p', { className: 'sub', textContent: 'נשמרות רק בטלפון הזה' })),
    el('div', { className: 'stack lift', style: 'gap:14px' },
      box('pin', 'מקום',
        el('label', { className: 'set' }, el('span', {}, 'עיר או יישוב', el('small', { textContent: 'לזמני היום ולצבעי השמיים' })), city),
        el('div', { className: 'set' }, el('span', {}, 'מיקום מדויק', status), locate),
        el('label', { className: 'set' }, el('span', {}, 'מקום מגורים', el('small', { textContent: 'ימים טובים ושאלת גשמים' })), il)),
      box('phone', 'בזמן התפילה',
        check('keepAwake', 'מסך פעיל', 'המסך לא נכבה בזמן התפילה'),
        check('quiet', 'תזכורת למצב שקט', 'הודעה בפתיחת תפילה'),
        check('pageSound', 'צליל בהעברת דף', 'רחש עדין של דף נהפך')),
      box('book', 'תצוגת הסידור',
        choose('sayColor', 'סימון מה שאומרים היום', 'למשל "משיב הרוח" או "ברך עלינו"',
          [['yellow', 'צהוב'], ['green', 'ירוק'], ['blue', 'כחול'], ['pink', 'ורוד'], ['none', 'בלי צבע']]),
        choose('notToday', 'מה שלא אומרים היום', 'למשל "מוריד הטל" בחורף, או שיר של יום אחר',
          [['hide', 'מוסתר'], ['grey', 'באפור'], ['show', 'מוצג כרגיל']]),
        check('margins', 'הערות בשולי הדף', 'מקורות ופירושי מילים בצדי העמוד')),
      box('scroll', 'מנהג',
        check('walled', 'עיר מוקפת חומה', 'פורים בט״ו (ירושלים)'),
        check('adjacent', 'מנחה וערבית סמוכות', 'במנחה בלי תחנון ובלי עלינו, עמוד 125')),
      shareCard(),
      el('p', { className: 'draft' }, 'הסידור נשמר בטלפון בפתיחה הראשונה (כ-13 מגה), ואחר כך עובד גם בלי אינטרנט. ', saved),
      el('p', { className: 'draft', textContent: `גרסה ${__VERSION__}. סידור תפילת שלמה, נוסח תימן שאמי. המיקום וההגדרות נשארים בטלפון ואינם נשלחים. תמונות הרקע: כתב יד של רבי שלום שבזי (תכלאל, 1676) וכתב יד תימני של "מורה נבוכים", נחלת הכלל.` })));
  const report = async () => {
    if (!saved.isConnected) return;
    // The whole app is saved once the background worker (sw.js) has finished installing.
    const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration().catch(() => null) : null;
    if (reg?.active) { saved.textContent = '✓ שמור בטלפון.'; return; }
    saved.textContent = reg?.installing ? 'שומר עכשיו…' : '';
    setTimeout(report, 1500);
  };
  report();
}

// ---- navigation
function go(name, keepScroll = false) {
  tab = name;
  for (const s of SCREENS) $(s).hidden = s !== name;
  $('nav').hidden = false;
  for (const b of $('nav').children) b.dataset.go === name ? b.setAttribute('aria-current', 'page') : b.removeAttribute('aria-current');
  updateSky();
  ({ home: renderHome, calendar: renderCalendar, browse: renderBrowse, settings: renderSettings })[name]();
  if (!keepScroll) scrollTo(0, 0);
}
$('nav').onclick = e => { const t = e.target.closest('button')?.dataset.go; if (t) go(t); };

// ---- keeping everyone on the newest version
// A new version installs itself in the background. If the user is not in the middle of a prayer the page reloads
// on its own; during a prayer a bar is shown instead.
let offerUpdate = () => {};
function setupUpdates() {
  if (!('serviceWorker' in navigator)) return;
  let reloading = false;
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading || !hadController) return;
    reloading = true;
    location.reload();
  });
  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(reg => {
    const apply = () => reg.waiting?.postMessage('activate');
    const offer = () => {
      if (!reg.waiting || !navigator.serviceWorker.controller) return;
      if (!readerOpen) { apply(); return; }
      $('update').hidden = false;
      $('update-btn').onclick = apply;
    };
    offerUpdate = offer;
    offer();
    reg.addEventListener('updatefound', () => reg.installing?.addEventListener('statechange', e => { if (e.target.state === 'installed') offer(); }));
    const check = () => reg.update().catch(() => {});
    document.addEventListener('visibilitychange', () => { if (!document.hidden) { check(); offer(); } });
    setInterval(check, 30 * 60 * 1000);
  }).catch(console.error);
}

// Drawn icons in the bottom bar.
for (const [b, key] of [...$('nav').children].map((b, k) => [b, ['book', 'calendar', 'scroll', 'gear'][k]])) b.querySelector('.ni').innerHTML = ICONS[key];
go('home');
setupUpdates();
// Midnight and sunset pass while the app is open: refresh the home screen when the user comes back to it.
document.addEventListener('visibilitychange', () => { if (!document.hidden && !readerOpen && tab === 'home') renderHome(); });
setInterval(() => { if (document.hidden) return; updateSky(); if (!readerOpen && tab === 'home') go('home', true); }, 60000);
// For checking the look: ?sky=dawn|day|golden|evening|night shows that sky instead of the real one.
const forcedSky = new URLSearchParams(location.search).get('sky');
if (forcedSky) { updateSky = () => applySky(forcedSky); updateSky(); }
