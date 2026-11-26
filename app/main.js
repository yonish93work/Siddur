// Screens: home ("now" and the three prayers), Hebrew calendar, table of contents, settings.
// The reading screen is in reader.js; the rules are in logic/.
import { HDate } from '@hebcal/core';
import { dayInfo } from './logic/calendar.js';
import { PRAYERS, reminders, dayTitles } from './logic/prayers.js';
import { HIGHLIGHTS } from './logic/highlights.js';
import { ANCHORS } from './logic/anchors.js';
import { ICONS } from './icons.js';
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
const DEFAULTS = { il: true, walled: false, adjacent: false, place: null, night: false, special: null, installHidden: false };
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
// A drawn icon inside a round gold-edged medallion.
const medal = key => { const s = el('span', { className: 'medal' }); s.innerHTML = ICONS[key] ?? ''; return s; };

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
  const segments = PRAYERS[prayer].build(info, { adjacent: settings.adjacent })
    .map(s => ({ ...s, pages: idx.range(s.from, s.to) })).filter(s => s.pages.length);
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
    notes.set(n, [...(notes.get(n) ?? []), r.text]);
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
    idx, crops, startAt, onError: showError, night: settings.night,
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

function prayerButtons(dates, current) {
  return el('div', { className: 'prayers' }, ['shacharit', 'mincha', 'arvit'].map(prayer => {
    const civil = dates[prayer], holy = holyName(prayer, civil), d = prayerDate(prayer, civil);
    const b = el('button', { type: 'button', className: `prayer${prayer === current ? ' current' : ''}`, onclick: () => openPrayer(prayer, civil) },
      medal(prayer),
      el('b', { textContent: PRAYERS[prayer].name }),
      el('small', { textContent: holy ? `${holy}: לא מוצג` : `${prayer === 'arvit' ? 'ליל ' : ''}${weekdayName(prayer === 'arvit' ? d.greg() : civil)}` }));
    b.disabled = !!holy;
    return b;
  }));
}

function timesCard(date, compact = false) {
  const p = place();
  const rows = zmanimList(date, p).filter(([n]) => !compact || !n.includes('מג"א'));
  return el('div', { className: 'card times' },
    el('div', { className: 'where' }, el('b', { textContent: `זמני היום · ${p.name}` }), btn('שינוי מקום', () => go('settings'), 'link')),
    el('ul', { className: 'list' }, rows.map(([n, t]) => el('li', { className: 'plain' }, el('span', { textContent: n }), el('span', { textContent: time(t) })))),
    el('p', { className: 'sub', style: 'font-size:.8rem;margin-top:6px', textContent: 'לפי השיטות המקובלות. צאת הכוכבים: 8.5 מעלות.' }));
}

// ---- home
function renderHome() {
  const dates = prayerDates();
  const hd = dates.halachic, info = dayInfo(hd, opts());
  const titles = dayTitles(info);
  const current = dates.current, holyNow = current && holyName(current, dates[current]);
  const step = n => { chosen = addDays(chosen ?? dates.today, n); if (iso(chosen) === iso(dates.today)) chosen = null; renderHome(); };

  let nowBox = '';
  if (current && holyNow) nowBox = el('div', { className: 'card' }, el('b', { textContent: holyNow }), el('p', { className: 'sub', textContent: 'האפליקציה אינה מציגה תפילות בשבת וביום טוב.' }));
  else if (current) {
    const d = prayerDate(current, dates[current]);
    nowBox = el('button', { type: 'button', className: 'now', onclick: () => openPrayer(current, dates[current]) },
      medal(current),
      el('span', {}, el('span', { textContent: 'התפילה עכשיו' }), el('div', { className: 'big', textContent: PRAYERS[current].name }), el('span', { textContent: `${current === 'arvit' ? 'ליל ' : ''}${heb(d)}` })),
      el('span', { className: 'go', textContent: '‹', ariaHidden: 'true' }));
  }

  const sayPrayer = current && !holyNow ? current : ['shacharit', 'mincha', 'arvit'].find(x => !holyName(x, dates[x]));
  const resume = loadResume();
  $('home').replaceChildren(
    el('header', { className: 'hero' },
      el('div', { className: 'cartouche' }, el('b', { textContent: 'תפילת שלמה' })),
      el('div', { className: 'ribbon' }, el('span', { textContent: 'נוסח תימן שאמי' })),
      el('div', { className: 'date' },
        el('h1', { textContent: `${weekdayName(hd.greg())}, ${heb(hd)}` }),
        el('p', { className: 'sub', textContent: `${gregText(hd.greg())}${dates.isToday && iso(hd.greg()) !== iso(dates.today) ? ' · היום העברי מתחיל בשקיעה' : ''}` })),
      titles.length ? el('div', { className: 'chips' }, titles.map(t => el('span', { className: 'chip', textContent: t }))) : '',
      dates.isToday ? countdown() : '',
      el('div', { className: 'daynav' }, btn('→ יום קודם', () => step(-1), ''), chosen ? btn('חזרה להיום', () => { chosen = null; renderHome(); }, '') : '', btn('יום הבא ←', () => step(1), ''))),
    installCard(),
    resume ? el('button', { type: 'button', className: 'resume', onclick: () => reopen(resume) },
      medal('back'), el('span', {}, el('b', { textContent: 'להמשיך מאיפה שעצרתי' }), el('small', { textContent: `${resume.title}${resume.label ? `, עמוד ${resume.label}` : ''}` }))) : '',
    nowBox ? sec(dates.isToday ? 'עכשיו' : '') : '', nowBox,
    sec(dates.isToday ? 'תפילות היום' : `תפילות ל${weekdayName(chosen)}`),
    prayerButtons(dates, current),
    sec('גישה מהירה'), tiles(info),
    specialCard(hd.greg()),
    sec('זמני היום'), timesCard(dates.isToday ? dates.today : chosen),
    sayPrayer ? todayCard(sayPrayer, dates[sayPrayer]) : '',
    sec('שיתוף'), shareCard(),
    el('p', { className: 'draft', textContent: 'גרסת ניסיון: החוקים נכתבו לפי ההוראות שבסידור, ועדיין לא אומתו בידי בקיא במנהג. בכל ספק יש לנהוג לפי הסידור המודפס והרב.' }),
  );
}

// "In 35 minutes: sunset" - the next of the times people most often watch for.
function countdown() {
  const now = Date.now(), p = place(), today = civilDate(new Date(), p.tz);
  const watch = ['סוף זמן קריאת שמע (גר"א)', 'סוף זמן תפילה (גר"א)', 'חצות היום', 'מנחה גדולה', 'פלג המנחה', 'שקיעה', 'צאת הכוכבים'];
  const list = [...zmanimList(today, p), ...zmanimList(addDays(today, 1), p).map(([n, t]) => [n, t])]
    .filter(([n, t]) => (watch.includes(n) || n === 'עלות השחר') && t && t.getTime() > now);
  const nextOne = list[0];
  if (!nextOne) return '';
  const mins = Math.round((nextOne[1].getTime() - now) / 60000);
  const text = mins < 60 ? `${mins} דקות` : `${Math.floor(mins / 60)} שעות ו-${mins % 60} דקות`;
  const c = el('div', { className: 'count' }, el('span', {}), `${nextOne[0]} בעוד ${mins === 1 ? 'דקה' : text} (${time(nextOne[1])})`);
  c.firstChild.innerHTML = ICONS.clock;
  return c;
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
    info.megillah && ['מגילת אסתר', 'scroll', 'פורים'],
    info.omer && ['ספירת העומר', 'omer', `היום ${info.omer} בעומר`],
    info.ashmorot && ['אשמורות', 'book', 'סליחות'],
    info.levana && ['ברכת הלבנה', 'moonStar', ''],
    info.fast === 'av' && ['מגילת איכה', 'scroll', 'תשעה באב'],
  ].filter(Boolean);
  const daily = [['ברכת המזון', 'cup', ''], ['מעין שלוש', 'grapes', 'ברכה מעין שלוש'], ['תפלת הדרך', 'road', ''], ['קריאת שמע על המטה', 'bed', '']];
  const tile = (title, icon, sub, onclick, wide) => el('button', { type: 'button', className: `tile${wide ? ' wide' : ''}`, onclick }, medal(icon), el('span', {}, el('b', { textContent: title }), sub ? el('small', { textContent: sub }) : ''));
  const fromMenu = ([part, icon, sub]) => { const e = sectionByTitle(part); return e && tile(part === 'מעין שלוש' ? 'מעין שלוש' : e.title.replace(/^חנוכה: /, ''), icon, sub || `עמ' ${idx.label(e.from) ?? ''}`, () => openRange(e.title, e.from, e.to)); };
  // "Asher Yatzar" is printed on the first page of Birchot Hashachar (p. 9).
  const asher = tile('אשר יצר', 'jug', "עמ' 9", () => openRange('אשר יצר', idx.first('9'), idx.first('9')));
  const list = [...seasonal.map(fromMenu), ...daily.slice(0, 1).map(fromMenu), asher, ...daily.slice(1).map(fromMenu)].filter(Boolean);
  list.push(tile('כל התפילות', 'book', 'תוכן העניינים', () => go('browse'), list.length % 2 === 0));
  return el('div', { className: 'tiles' }, list);
}
const menuItem = e => el('li', {}, el('button', { type: 'button', className: 'item', onclick: () => openRange(e.title, e.from, e.to) },
  el('span', { textContent: e.title }), el('span', { className: 'pg', textContent: idx.label(e.from) ? `עמ' ${idx.label(e.from)}` : '' })));

// ---- Hebrew calendar
// Short names, so they fit in the small day squares.
const short = t => t.replace(/^פרשת /, '').replace(/^ראש חודש .*/, 'ר״ח').replace(/^חנוכה, יום ח׳$/, 'חנוכה ח׳')
  .replace(/^חנוכה, (\S+) נרו?ת?$/, 'חנוכה $1').replace(/^שבת מברכים.*/, 'מברכים').replace(/ \(חוה״מ\)/, '').replace(/^יום הזכרון.*/, 'יום הזכרון');
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
    const cls = ['cell', d.getDay() === 6 && 'sat', info.noTachanun && d.getDay() !== 6 && 'notach', a === today.abs() && 'today', a === calSel && 'sel'].filter(Boolean).join(' ');
    grid.append(el('button', { type: 'button', className: cls, onclick: () => { calSel = a; renderCalendar(); } },
      el('span', { className: 'hd', textContent: d.renderGematriya(true).split(' ')[0] }),
      el('span', { className: 'gd', textContent: d.greg().getDate() }),
      list.slice(0, 2).map(e => el('span', { className: `ev ${e.kind}`, textContent: short(e.text) }))));
  }

  const sel = new HDate(calSel), selEv = ev.get(calSel)?.events ?? [], civil = sel.greg();
  const dates = { shacharit: civil, mincha: civil, arvit: civil };
  const day = el('div', { className: 'card day' },
    el('h2', { textContent: `${weekdayName(civil)}, ${heb(sel)}` }),
    el('p', { className: 'sub', textContent: gregText(civil) }),
    selEv.length ? el('ul', { className: 'evs' }, selEv.map(e => el('li', { className: e.kind, textContent: e.text }))) : el('p', { className: 'sub', textContent: 'אין אירועים מיוחדים.' }),
    ev.get(calSel)?.info?.noTachanun ? el('p', { className: 'sub', textContent: `אין תחנון: ${ev.get(calSel).info.noTachanun}` }) : '',
    prayerButtons(dates, null),
  );
  day.append(btn('פתח במסך התפילה', () => { chosen = iso(civil) === iso(civilDate(new Date(), place().tz)) ? null : civil; go('home'); }, 'link'));

  $('calendar').replaceChildren(
    el('header', { className: 'hero' },
      el('div', { className: 'mhead' },
        el('button', { type: 'button', className: 'mnav', onclick: () => move(-1), ariaLabel: 'החודש הקודם', textContent: '→' }),
        el('div', {}, el('h1', { textContent: first.renderGematriya(true).split(' ').slice(1).join(' ') }), el('p', { className: 'sub', textContent: gregSpan })),
        el('button', { type: 'button', className: 'mnav', onclick: () => move(1), ariaLabel: 'החודש הבא', textContent: '←' })),
      el('div', { className: 'daynav' }, btn('היום', () => { calMonth = null; calSel = null; renderCalendar(); }, ''))),
    grid,
    el('div', { className: 'legend' }, el('span', {}, el('i'), 'יום בלי תחנון'),
      el('span', { className: 'holiday', textContent: 'חג' }), el('span', { className: 'rc', textContent: 'ראש חודש' }), el('span', { className: 'fast', textContent: 'צום' })),
    sec('היום שנבחר'), day,
    sec('זמני היום'), timesCard(civil),
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
  return el('div', { className: 'card' }, el('b', { textContent: 'לשתף את האפליקציה' }),
    el('p', { className: 'sub', textContent: 'שולח קישור והוראות התקנה בוואטסאפ, בהודעה או במייל.' }),
    el('div', { style: 'margin-top:10px' }, btn('שתף', share, 'btn primary'), ' ', status));
}

// ---- table of contents
function renderBrowse() {
  const err = el('p', { className: 'err' });
  err.setAttribute('role', 'status');
  const input = el('input', { inputMode: 'text', placeholder: 'למשל 105', autocomplete: 'off' });
  input.setAttribute('aria-label', 'מספר עמוד');
  const form = el('form', { className: 'jump' }, el('span', { textContent: 'מספר עמוד' }), input, el('button', { type: 'submit', className: 'btn primary', textContent: 'פתח' }));
  form.onsubmit = ev => {
    ev.preventDefault();
    const label = input.value.replace(/[\s'"״׳]/g, '');
    const n = idx.first(label.startsWith('@') ? '' : label);
    if (!n) { err.textContent = label ? `עמוד ${label} לא קיים בסידור.` : 'כתוב מספר עמוד.'; return; }
    err.textContent = '';
    openRange('הסידור', Math.max(1, n - 5), Math.min(idx.pages.length, n + 30), n);
  };
  // Search: typing a word keeps only the parts whose name has it, and opens their groups.
  const search = el('input', { type: 'search', className: 'search', placeholder: '🔍 חיפוש, למשל הבדלה', autocomplete: 'off' });
  search.setAttribute('aria-label', 'חיפוש בתוכן העניינים');
  const none = el('p', { className: 'sub', hidden: true, textContent: 'לא נמצא. אפשר לנסות מילה אחרת, או לקפוץ למספר עמוד למטה.' });
  const groups = [...menu].map(([g, list]) => {
    const d = el('details', { className: 'card' }, el('summary', { textContent: g }), el('ul', { className: 'list' }, list.map(e => { const li = menuItem(e); li.dataset.t = `${g} ${e.title}`; return li; })));
    return d;
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
    el('header', { className: 'hero' }, el('h1', { textContent: 'תוכן העניינים' }), el('p', { className: 'sub', textContent: 'כל חלקי הסידור, לפי הסדר שבעמוד 3' })),
    el('div', { className: 'card', style: 'margin-top:16px' }, search), none,
    sec('חלקי הסידור'), ...groups,
    sec('קפיצה לעמוד'), el('div', { className: 'card' }, form, err));
}

// ---- settings
function renderSettings() {
  const check = (key, title, sub) => {
    const input = el('input', { type: 'checkbox', checked: settings[key], onchange: e => { settings[key] = e.target.checked; save(); } });
    return el('label', { className: 'set' }, el('span', {}, title, el('small', { textContent: sub })), input);
  };
  const status = el('small');
  const city = el('select', { onchange: e => { settings.place = e.target.value === '0' ? null : CITIES[+e.target.value] ?? settings.place; save(); renderSettings(); } },
    CITIES.map((c, k) => el('option', { value: String(k), textContent: c.name })),
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

  const saved = el('small', { textContent: 'בודק…' });
  $('settings').replaceChildren(
    el('header', { className: 'hero' }, el('h1', { textContent: 'הגדרות' }), el('p', { className: 'sub', textContent: 'נשמרות רק בטלפון הזה' })),
    sec('מקום'),
    el('div', { className: 'card' },
      el('label', { className: 'set' }, el('span', {}, 'עיר לזמני היום', el('small', { textContent: `עכשיו: ${place().name}` })), city),
      el('div', { className: 'set' }, el('span', {}, 'מיקום מדויק', status), locate),
      el('label', { className: 'set' }, el('span', {}, 'ארץ או חוץ לארץ', el('small', { textContent: 'משפיע על ימים טובים ועל שאלת גשמים' })), il)),
    sec('מנהג'),
    el('div', { className: 'card' },
      check('walled', 'עיר מוקפת חומה', 'פורים בט"ו (ירושלים)'),
      check('adjacent', 'מנחה וערבית סמוכות', 'במנחה בלי תחנון ובלי עלינו, לפי עמוד 125')),
    sec('בלי אינטרנט'),
    el('div', { className: 'card' }, el('p', { className: 'sub', style: 'margin:0', textContent: 'הסידור נשמר בטלפון בפעם הראשונה (כ-13 מגה). אחר כך אפשר להתפלל גם בלי רשת.' }), saved),
    sec('שיתוף'), shareCard(),
    el('p', { className: 'draft', textContent: `גרסה ${__VERSION__}. סידור תפילת שלמה, נוסח תימן שאמי. המיקום וההגדרות נשארים בטלפון ואינם נשלחים.` }));
  const report = async () => {
    if (!saved.isConnected) return;
    // The whole app is saved once the background worker (sw.js) has finished installing.
    const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration().catch(() => null) : null;
    if (reg?.active) { saved.textContent = 'הסידור שמור בטלפון.'; return; }
    saved.textContent = reg?.installing ? 'שומר את הסידור בטלפון…' : 'הסידור עוד לא נשמר.';
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
setInterval(() => { if (!document.hidden && !readerOpen && tab === 'home') go('home', true); }, 60000);
