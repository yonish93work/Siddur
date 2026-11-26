// Screens: home ("now" and the three prayers), Hebrew calendar, table of contents, settings.
// The reading screen is in reader.js; the rules are in logic/.
import { HDate } from '@hebcal/core';
import { dayInfo } from './logic/calendar.js';
import { PRAYERS, reminders, dayTitles } from './logic/prayers.js';
import { HIGHLIGHTS } from './logic/highlights.js';
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
const DEFAULTS = { il: true, walled: false, adjacent: false, place: null };
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
const ICON = { shacharit: '🌅', mincha: '☀️', arvit: '🌙' };

// ---- opening a prayer or a section
function prayerPlan(prayer, civil) {
  const d = prayerDate(prayer, civil), info = dayInfo(d, opts());
  const segments = PRAYERS[prayer].build(info, { adjacent: settings.adjacent })
    .map(s => ({ ...s, pages: idx.range(s.from, s.to) })).filter(s => s.pages.length);
  const notes = new Map(), marks = new Map(), general = [];
  for (const r of reminders(prayer, info)) {
    if (!r.page) { general.push(r.text); continue; }
    const n = idx.first(r.page);
    notes.set(n, [...(notes.get(n) ?? []), r.text]);
    for (const m of r.marks) {
      const [page, rects] = HIGHLIGHTS[prayer][m];
      const p = idx.first(page);
      marks.set(p, [...(marks.get(p) ?? []), ...rects]);
    }
  }
  const night = prayer === 'arvit';
  const t = dayTitles(info).filter(x => !x.includes('בעומר') && x !== 'ערב שבת');
  return { title: `${PRAYERS[prayer].name}${t.length ? ` · ${t[0]}` : ''}`, sub: `${night ? 'ליל ' : ''}${heb(d)}`, segments, notes, marks, general, info };
}

function show(plan, startAt) {
  readerOpen = true;
  for (const s of SCREENS) $(s).hidden = true;
  $('nav').hidden = true;
  openReader(plan, { idx, crops, startAt, onError: showError });
  if (history.state?.reader !== true) history.pushState({ reader: true }, '');
}
const openPrayer = (prayer, civil) => show(prayerPlan(prayer, civil));
const openRange = (title, from, to, startAt) => show({
  title, segments: [{ title, why: '', pages: Array.from({ length: to - from + 1 }, (_, k) => from + k) }],
}, startAt);

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
      el('span', { className: 'ic', textContent: ICON[prayer], ariaHidden: 'true' }),
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
      el('span', { className: 'ic', textContent: ICON[current], ariaHidden: 'true' }),
      el('span', {}, el('span', { textContent: 'התפילה עכשיו' }), el('div', { className: 'big', textContent: PRAYERS[current].name }), el('span', { textContent: `${current === 'arvit' ? 'ליל ' : ''}${heb(d)}` })),
      el('span', { className: 'go', textContent: '‹', ariaHidden: 'true' }));
  }

  const sayPrayer = current && !holyNow ? current : ['shacharit', 'mincha', 'arvit'].find(x => !holyName(x, dates[x]));
  $('home').replaceChildren(
    el('header', { className: 'hero' },
      el('h1', { textContent: `${weekdayName(hd.greg())}, ${heb(hd)}` }),
      el('p', { className: 'sub', textContent: `${gregText(hd.greg())}${dates.isToday && iso(hd.greg()) !== iso(dates.today) ? ' · היום העברי מתחיל בשקיעה' : ''}` }),
      titles.length ? el('div', { className: 'chips' }, titles.map(t => el('span', { className: 'chip', textContent: t }))) : '',
      el('div', { className: 'daynav' }, btn('→ יום קודם', () => step(-1), ''), chosen ? btn('חזרה להיום', () => { chosen = null; renderHome(); }, '') : '', btn('יום הבא ←', () => step(1), ''))),
    nowBox ? sec(dates.isToday ? 'עכשיו' : '') : '', nowBox,
    sec(dates.isToday ? 'תפילות היום' : `תפילות ל${weekdayName(chosen)}`),
    prayerButtons(dates, current),
    sayPrayer ? todayCard(sayPrayer, dates[sayPrayer]) : '',
    sec('זמני היום'), timesCard(dates.isToday ? dates.today : chosen),
    sec('קיצורים'), extras(info),
    sec('שיתוף'), shareCard(),
    el('p', { className: 'draft', textContent: 'גרסת ניסיון: החוקים נכתבו לפי ההוראות שבסידור, ועדיין לא אומתו בידי בקיא במנהג. בכל ספק יש לנהוג לפי הסידור המודפס והרב.' }),
  );
}

function todayCard(prayer, civil) {
  const plan = prayerPlan(prayer, civil);
  const rows = [...plan.general.map(t => [t, null]), ...[...plan.notes].flatMap(([n, ts]) => ts.map(t => [t, n]))];
  return el('div', {}, sec(`מה אומרים ב${PRAYERS[prayer].name}`),
    el('div', { className: 'card' }, el('ul', { className: 'list' }, rows.map(([t, n]) => el('li', { className: 'plain' }, el('span', { className: 'say', textContent: t }),
      n ? el('span', { className: 'pg', textContent: `עמ' ${idx.label(n)}` }) : ''))),
    el('p', { className: 'sub', style: 'font-size:.82rem;margin-top:8px', textContent: 'בתוך הסידור, מה שאומרים היום מסומן ברקע צהוב.' })));
}

function sectionByTitle(part) {
  for (const list of menu.values()) for (const e of list) if (e.title.includes(part)) return e;
  return null;
}
function extras(info) {
  const want = [];
  const tomorrowChanukah = dayInfo(new HDate(info.d.abs() + 1), opts()).chanukah;
  if (info.chanukah || tomorrowChanukah) want.push('הדלקת נרות', 'מעוז צור');
  if (info.megillah) want.push('מגילת אסתר');
  if (info.omer) want.push('ספירת העומר');
  if (info.ashmorot) want.push('אשמורות');
  if (info.levana) want.push('ברכת הלבנה');
  if (info.fast === 'av') want.push('מגילת איכה');
  want.push('ברכת המזון', 'מעין שלוש', 'קריאת שמע על המטה', 'תפלת הדרך');
  return el('ul', { className: 'list card' }, want.map(sectionByTitle).filter(Boolean).map(menuItem));
}
const menuItem = e => el('li', {}, el('button', { type: 'button', className: 'item', onclick: () => openRange(e.title, e.from, e.to) },
  el('span', { textContent: e.title }), el('span', { className: 'pg', textContent: idx.label(e.from) ? `עמ' ${idx.label(e.from)}` : '' })));

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
    const cls = ['cell', d.getDay() === 6 && 'sat', info.noTachanun && d.getDay() !== 6 && 'notach', a === today.abs() && 'today', a === calSel && 'sel'].filter(Boolean).join(' ');
    grid.append(el('button', { type: 'button', className: cls, onclick: () => { calSel = a; renderCalendar(); } },
      el('span', { className: 'hd', textContent: d.renderGematriya(true).split(' ')[0] }),
      el('span', { className: 'gd', textContent: d.greg().getDate() }),
      list.slice(0, 2).map(e => el('span', { className: `ev ${e.kind}`, textContent: e.text.replace('פרשת ', '') }))));
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
    el('div', { className: 'legend' }, el('span', {}, el('i'), 'יום בלי תחנון (לפי עמוד 68)'), el('span', { textContent: 'אדום: חג · כחול: ראש חודש · סגול: צום' })),
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
  $('browse').replaceChildren(
    el('header', { className: 'hero' }, el('h1', { textContent: 'תוכן העניינים' }), el('p', { className: 'sub', textContent: 'כל חלקי הסידור, לפי הסדר שבעמוד 3' })),
    sec('קפיצה לעמוד'), el('div', { className: 'card' }, form, err),
    sec('חלקי הסידור'),
    ...[...menu].map(([g, list]) => el('details', { className: 'card' }, el('summary', { textContent: g }), el('ul', { className: 'list' }, list.map(menuItem)))));
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

go('home');
setupUpdates();
// Midnight and sunset pass while the app is open: refresh the home screen when the user comes back to it.
document.addEventListener('visibilitychange', () => { if (!document.hidden && !readerOpen && tab === 'home') renderHome(); });
setInterval(() => { if (!document.hidden && !readerOpen && tab === 'home') go('home', true); }, 60000);
