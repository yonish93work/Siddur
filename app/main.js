// Screens: home ("now" and the three prayers), table of contents, settings. The reading screen is in reader.js.
import { HDate } from '@hebcal/core';
import { dayInfo } from './logic/calendar.js';
import { PRAYERS, reminders, dayTitles } from './logic/prayers.js';
import { pageIndex } from './logic/pages.js';
import { buildMenu } from './logic/sections.js';
import { JERUSALEM, situation, civilDate, addDays, prayerDate } from './logic/now.js';
import { openReader, closeReader } from './reader.js';
import pagesData from '../data/pages.json';
import crops from '../data/crops.json';

const $ = id => document.getElementById(id);
const idx = pageIndex(pagesData.pages);
const menu = buildMenu(idx);

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
  for (const k of kids.flat()) if (k !== null && k !== undefined && k !== false) n.append(k);
  return n;
}
const btn = (text, onclick, className = 'btn') => el('button', { type: 'button', className, onclick }, text);
const heb = d => d.renderGematriya(true, true);
const WEEKDAY = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
const weekdayName = d => (d.getDay() === 6 ? 'שבת' : `יום ${WEEKDAY[d.getDay()]}`);
const time = d => (d && !Number.isNaN(d.getTime()) ? new Intl.DateTimeFormat('he-IL', { hour: '2-digit', minute: '2-digit', timeZone: place().tz }).format(d) : '—');
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// ---- opening a prayer or a section
function prayerPlan(prayer, civil) {
  const d = prayerDate(prayer, civil), info = dayInfo(d, opts());
  const segments = PRAYERS[prayer].build(info, { adjacent: settings.adjacent })
    .map(s => ({ ...s, pages: idx.range(s.from, s.to) })).filter(s => s.pages.length);
  const notes = new Map(), general = [];
  for (const r of reminders(prayer, info)) {
    if (!r.page) { general.push(r.text); continue; }
    const n = idx.first(r.page);
    notes.set(n, [...(notes.get(n) ?? []), r.text]);
  }
  const night = prayer === 'arvit';
  return { title: `${PRAYERS[prayer].name}${dayTitles(info).length ? ` · ${dayTitles(info)[0]}` : ''}`, sub: `${night ? 'ליל ' : ''}${heb(d)}`, segments, notes, general, info };
}

function show(plan, startAt) {
  readerOpen = true;
  for (const s of ['home', 'browse', 'settings']) $(s).hidden = true;
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
  if (!$('r-panel').hidden) $('r-panel').hidden = true;
  readerOpen = false;
  closeReader();
  go(tab);
  offerUpdate();
}
$('r-back').onclick = () => (history.state?.reader ? history.back() : leaveReader());
$('r-menu').onclick = () => { $('r-panel').hidden = !$('r-panel').hidden; };
addEventListener('popstate', leaveReader);

function showError(e) {
  console.error(e);
  const box = $('r-pages');
  if (box.querySelector('.err')) return;
  box.prepend(el('div', { className: 'card' },
    el('p', { className: 'err', textContent: navigator.onLine ? 'טעינת הסידור נכשלה.' : 'אין חיבור לאינטרנט, והסידור עוד לא נשמר בטלפון.' }),
    btn('נסה שוב', () => location.reload())));
}

// ---- home
function renderHome() {
  const root = $('home'), now = new Date(), p = place();
  const s = situation(now, p);
  const today = civilDate(now, p.tz);
  const isToday = !chosen || iso(chosen) === iso(today);
  const dates = isToday ? s : { shacharit: chosen, mincha: chosen, arvit: chosen };
  const hd = isToday ? s.halachic : new HDate(chosen);
  const info = dayInfo(hd, opts());
  const titles = dayTitles(info);

  const holyFor = prayer => {
    const i = dayInfo(prayerDate(prayer, dates[prayer]), opts());
    return i.holy ? (i.yomTov ?? 'שבת') : null;
  };
  const prayerButton = prayer => {
    const holy = holyFor(prayer), d = prayerDate(prayer, dates[prayer]);
    const b = btn('', () => openPrayer(prayer, dates[prayer]));
    b.append(PRAYERS[prayer].name, el('small', { textContent: holy ?? `${prayer === 'arvit' ? 'ליל ' : ''}${weekdayName(prayer === 'arvit' ? d.greg() : dates[prayer])}` }));
    b.disabled = !!holy;
    return b;
  };

  const current = isToday ? s.current : null;
  const holyNow = current && holyFor(current);
  let nowBox = null;
  if (current && holyNow) nowBox = el('div', { className: 'card' }, el('b', { textContent: holyNow }), el('p', { className: 'sub', textContent: 'האפליקציה אינה מציגה את תפילות שבת ויום טוב.' }));
  else if (current) {
    const d = prayerDate(current, dates[current]);
    nowBox = el('button', { type: 'button', className: 'now', onclick: () => openPrayer(current, dates[current]) },
      el('span', { textContent: 'עכשיו' }), el('b', { textContent: PRAYERS[current].name }), el('span', { textContent: `${current === 'arvit' ? 'ליל ' : ''}${heb(d)}` }));
  }

  const picker = el('input', { type: 'date', value: iso(chosen ?? today) });
  picker.setAttribute('aria-label', 'בחירת תאריך');
  picker.onchange = () => { if (picker.value) { const [y, m, d] = picker.value.split('-').map(Number); chosen = new Date(y, m - 1, d, 12); renderHome(); } };
  const step = n => { chosen = addDays(chosen ?? today, n); renderHome(); };

  root.replaceChildren(
    el('h1', { textContent: `${weekdayName(hd.greg())}, ${heb(hd)}` }),
    el('p', { className: 'sub', textContent: `${hd.greg().toLocaleDateString('he-IL', { day: 'numeric', month: 'long', year: 'numeric' })}${isToday && iso(hd.greg()) !== iso(today) ? ' (היום העברי מתחיל בשקיעה)' : ''}` }),
    titles.length ? el('div', { className: 'tags' }, titles.map(t => el('span', { className: 'tag', textContent: t }))) : '',
    nowBox ?? '',
    el('div', { className: 'row' }, ['shacharit', 'mincha', 'arvit'].map(prayerButton)),
    el('div', { className: 'datebar' }, btn('→ אתמול', () => step(-1)), picker, btn('מחר ←', () => step(1)), chosen ? btn('חזרה להיום', () => { chosen = null; renderHome(); }) : ''),
    todayCard(current && !holyNow ? current : 'mincha', dates, holyFor),
    extras(info),
    isToday ? el('div', { className: 'card' }, el('b', { textContent: `זמנים: ${p.name}` }),
      el('ul', { className: 'list' }, [['עלות השחר', s.zmanim.alot], ['זריחה', s.zmanim.sunrise], ['חצות', s.zmanim.chatzot], ['מנחה גדולה', s.zmanim.minchaGedola], ['שקיעה', s.zmanim.sunset], ['צאת הכוכבים (8.5 מעלות)', s.zmanim.tzeit]]
        .map(([n, t]) => el('li', { className: 'plain' }, el('span', { textContent: n }), el('span', { className: 'pg', textContent: time(t) }))))) : '',
    el('p', { className: 'draft', textContent: 'גרסת ניסיון: החוקים נכתבו לפי ההוראות שבסידור, ועדיין לא אומתו בידי בקיא במנהג. בכל ספק יש לנהוג לפי הסידור המודפס והרב.' }),
  );
}

function todayCard(prayer, dates, holyFor) {
  if (holyFor(prayer)) return '';
  const plan = prayerPlan(prayer, dates[prayer]);
  const rows = [...plan.general.map(t => [t, null]), ...[...plan.notes].flatMap(([n, ts]) => ts.map(t => [t, n]))];
  return el('div', { className: 'card' }, el('b', { textContent: `היום ב${PRAYERS[prayer].name}` }),
    el('ul', { className: 'list' }, rows.map(([t, n]) => el('li', { className: 'plain' }, el('span', { textContent: t }),
      n ? el('span', { className: 'pg', textContent: `עמ' ${idx.label(n)}` }) : ''))));
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
  return el('div', { className: 'card' }, el('b', { textContent: 'קיצורים' }),
    el('ul', { className: 'list' }, want.map(sectionByTitle).filter(Boolean).map(menuItem)));
}
const menuItem = e => el('li', {}, el('button', { type: 'button', className: 'item', onclick: () => openRange(e.title, e.from, e.to) },
  el('span', { textContent: e.title }), el('span', { className: 'pg', textContent: idx.label(e.from) ? `עמ' ${idx.label(e.from)}` : '' })));

// ---- table of contents
function renderBrowse() {
  const err = el('p', { className: 'err' });
  err.setAttribute('role', 'status');
  const input = el('input', { inputMode: 'text', placeholder: 'למשל 105', autocomplete: 'off' });
  input.setAttribute('aria-label', 'מספר עמוד');
  const form = el('form', { className: 'jump' }, el('span', { textContent: 'עמוד בסידור' }), input, el('button', { type: 'submit', className: 'btn primary', textContent: 'פתח' }));
  form.onsubmit = ev => {
    ev.preventDefault();
    const label = input.value.replace(/[\s'"״׳]/g, '');
    const n = idx.first(label.startsWith('@') ? '' : label);
    if (!n) { err.textContent = label ? `עמוד ${label} לא קיים בסידור.` : 'כתוב מספר עמוד.'; return; }
    err.textContent = '';
    openRange('הסידור', Math.max(1, n - 5), Math.min(idx.pages.length, n + 30), n);
  };
  $('browse').replaceChildren(el('h1', { textContent: 'תוכן העניינים' }), el('div', { className: 'card' }, form, err),
    ...[...menu].map(([g, list]) => el('details', { className: 'card' }, el('summary', { textContent: g }), el('ul', { className: 'list' }, list.map(menuItem)))));
}

// ---- settings
function renderSettings() {
  const check = (key, title, sub) => {
    const input = el('input', { type: 'checkbox', checked: settings[key], onchange: e => { settings[key] = e.target.checked; save(); } });
    return el('label', { className: 'set' }, el('span', {}, title, el('small', { textContent: sub })), input);
  };
  const status = el('small');
  const locate = btn('מצא את מיקומי', () => {
    if (!navigator.geolocation) { status.textContent = 'הטלפון לא תומך במיקום.'; return; }
    status.textContent = 'מחפש…';
    navigator.geolocation.getCurrentPosition(g => {
      settings.place = { name: 'המיקום שלי', lat: +g.coords.latitude.toFixed(2), lon: +g.coords.longitude.toFixed(2), tz: Intl.DateTimeFormat().resolvedOptions().timeZone };
      save();
      renderSettings();
    }, () => { status.textContent = 'לא התקבלה הרשאה למיקום. נשארים עם הזמנים הקודמים.'; }, { timeout: 15000, maximumAge: 3600000 });
  });
  const il = el('select', { onchange: e => { settings.il = e.target.value === 'il'; save(); } },
    el('option', { value: 'il', textContent: 'ארץ ישראל' }), el('option', { value: 'abroad', textContent: 'חוץ לארץ' }));
  il.value = settings.il ? 'il' : 'abroad';

  const saved = el('small', { textContent: 'בודק…' });
  $('settings').replaceChildren(el('h1', { textContent: 'הגדרות' }),
    el('div', { className: 'card' },
      el('div', { className: 'set' }, el('span', {}, 'מיקום לזמנים', el('small', { textContent: place().name }), status), locate),
      settings.place ? el('div', { className: 'set' }, el('span', { textContent: 'חזרה לזמני ירושלים' }), btn('אפס', () => { settings.place = null; save(); renderSettings(); })) : '',
      el('label', { className: 'set' }, el('span', {}, 'מקום', el('small', { textContent: 'משפיע על ימים טובים ועל שאלת גשמים' })), il),
      check('walled', 'עיר מוקפת חומה', 'פורים בט"ו (ירושלים)'),
      check('adjacent', 'מנחה וערבית סמוכות', 'במנחה בלי תחנון ובלי עלינו, לפי עמוד 125')),
    el('div', { className: 'card' }, el('b', { textContent: 'שימוש בלי אינטרנט' }), el('p', { className: 'sub', textContent: 'הסידור נשמר בטלפון בפעם הראשונה (כ-13 מגה). אחר כך אפשר להתפלל גם בלי רשת.' }), saved),
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
function go(name) {
  tab = name;
  for (const s of ['home', 'browse', 'settings']) $(s).hidden = s !== name;
  $('nav').hidden = false;
  for (const b of $('nav').children) b.dataset.go === name ? b.setAttribute('aria-current', 'page') : b.removeAttribute('aria-current');
  ({ home: renderHome, browse: renderBrowse, settings: renderSettings })[name]();
  scrollTo(0, 0);
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
setInterval(() => { if (!document.hidden && !readerOpen && tab === 'home' && document.activeElement?.type !== 'date') renderHome(); }, 60000);
