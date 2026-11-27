// Automatic checks of the day rules on known dates. Run: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { HDate, HebrewCalendar, months as m, flags } from '@hebcal/core';
import * as c from '../app/logic/calendar.js';
import { PRAYERS, reminders, omerText, omittedPages } from '../app/logic/prayers.js';
import { PARSHIOT } from '../app/logic/parshiot.js';
import { pageIndex } from '../app/logic/pages.js';

const idx = pageIndex(JSON.parse(readFileSync(new URL('../data/pages.json', import.meta.url))).pages);
const day = (d, mo, y, o) => c.dayInfo(new HDate(d, mo, y), o);
const titles = (p, i, o) => PRAYERS[p].build(i, o).map(s => s.title);
const has = (p, i, t, o) => titles(p, i, o).some(x => x.includes(t));
const tells = (p, i, t) => reminders(p, i).some(r => r.text.includes(t));

test('fasts match hebcal for 60 years', () => {
  const key = { 'Tzom Gedaliah': 'gedalia', "Asara B'Tevet": 'tevet', "Ta'anit Esther": 'esther', 'Tzom Tammuz': 'tammuz', "Tish'a B'Av": 'av', "Tish'a B'Av (observed)": 'av' };
  for (let y = 5780; y < 5840; y++) {
    const seen = new Set();
    for (const e of HebrewCalendar.calendar({ year: y, isHebrewYear: true, il: true })) {
      const k = key[e.getDesc()];
      if (k && e.getFlags() & (flags.MINOR_FAST | flags.MAJOR_FAST)) { assert.equal(c.publicFast(e.getDate()), k, `${e.getDate()} ${e.getDesc()}`); seen.add(k); }
    }
    assert.equal(seen.size, 5, `year ${y}`);
  }
});

test('Rosh Chodesh, Chol Hamoed, Yom Tov and Independence Day match hebcal for 40 years', () => {
  for (const il of [true, false]) for (let y = 5780; y < 5820; y++) {
    const rc = new Set(), chm = new Set(), yt = new Set();
    let ind;
    for (const e of HebrewCalendar.calendar({ year: y, isHebrewYear: true, il })) {
      const a = e.getDate().abs(), f = e.getFlags();
      if (f & flags.ROSH_CHODESH) rc.add(a);
      if (f & flags.CHAG && !(f & flags.EREV)) yt.add(a);
      if (/CH''M|Hoshana Raba/.test(e.getDesc())) chm.add(a);
      if (e.getDesc() === "Yom HaAtzma'ut") ind = a;
    }
    for (let d = new HDate(1, m.TISHREI, y); d.getFullYear() === y; d = d.next()) {
      const a = d.abs();
      assert.equal(c.isRoshChodesh(d), rc.has(a), `RC ${d}`);
      assert.equal(!!c.yomTov(d, il), yt.has(a), `YT ${d} il=${il}`);
      assert.equal(!!c.cholHamoed(d, il), chm.has(a), `CHM ${d} il=${il}`);
      assert.equal(c.isYomHaatzmaut(d), a === ind, `5 Iyar ${d}`);
    }
  }
});

test('postponed fasts', () => {
  assert.equal(c.publicFast(new HDate(9, m.AV, 5782)), null); // Shabbat
  assert.equal(c.publicFast(new HDate(10, m.AV, 5782)), 'av');
  assert.equal(c.publicFast(new HDate(11, m.ADAR_II, 5784)), 'esther'); // the 13th was Shabbat
});

test('tachanun: the list on page 68', () => {
  const no = [[1, m.CHESHVAN], [11, m.TISHREI], [30, m.TISHREI], [25, m.KISLEV], [15, m.SHVAT], [14, m.ADAR_I], [15, m.ADAR_I], [14, m.ADAR_II], [15, m.ADAR_II],
    [8, m.NISAN], [29, m.NISAN], [14, m.IYYAR], [18, m.IYYAR], [1, m.SIVAN], [12, m.SIVAN], [9, m.AV], [15, m.AV], [29, m.ELUL], [9, m.TISHREI]];
  for (const [d, mo] of no) assert.ok(c.noTachanunReason(new HDate(d, mo, 5787)), `${d}/${mo}`);
  for (const [d, mo] of [[4, m.TISHREI], [5, m.CHESHVAN], [13, m.SIVAN], [16, m.ADAR_II], [17, m.TAMUZ], [10, m.TEVET], [28, m.IYYAR]]) {
    const x = new HDate(d, mo, 5787);
    if (!c.isShabbat(x)) assert.equal(c.noTachanunReason(x), null, `${d}/${mo}`);
  }
  assert.equal(c.noTachanunReason(new HDate(14, m.ADAR_I, 5789)), 'פורים'); // ordinary year
});

test('tachanun at mincha the day before', () => {
  const before = (d, mo, y = 5787) => c.noTachanunAtMinchaReason(c.next(new HDate(d, mo, y), -1));
  assert.ok(before(1, m.KISLEV));
  assert.ok(before(18, m.IYYAR));
  assert.ok(before(9, m.AV));
  for (let y = 5780; y < 5800; y++) for (const [d, mo] of [[29, m.ELUL], [9, m.TISHREI]]) { // the two exceptions
    const b = c.next(new HDate(d, mo, y), -1);
    if (!c.isShabbat(b)) assert.equal(c.noTachanunAtMinchaReason(b), null, `${b}`);
  }
  let f = new HDate(5, m.CHESHVAN, 5787);
  while (c.weekday(f) !== 5) f = f.next();
  assert.match(c.noTachanunAtMinchaReason(f), /שבת/);
});

test('rain', () => {
  assert.equal(c.isGeshem(new HDate(23, m.TISHREI, 5787)), true);
  assert.equal(c.isGeshem(new HDate(21, m.TISHREI, 5787)), false);
  assert.equal(c.isGeshem(new HDate(14, m.NISAN, 5787)), true);
  assert.equal(c.isGeshem(new HDate(16, m.NISAN, 5787)), false);
  assert.equal(c.isBarechAleinu(new HDate(6, m.CHESHVAN, 5787)), false);
  assert.equal(c.isBarechAleinu(new HDate(7, m.CHESHVAN, 5787)), true);
  // Abroad: from the evening of 4 Dec 2026 (= the Hebrew date of 5 Dec); in 2027 from the evening of 5 Dec.
  const g = (y, mo, d) => new HDate(new Date(y, mo - 1, d));
  assert.equal(c.isBarechAleinu(g(2026, 12, 4), false), false);
  assert.equal(c.isBarechAleinu(g(2026, 12, 5), false), true);
  assert.equal(c.isBarechAleinu(g(2027, 12, 5), false), false);
  assert.equal(c.isBarechAleinu(g(2027, 12, 6), false), true);
});

test('omer', () => {
  assert.equal(c.omerDay(new HDate(16, m.NISAN, 5787)), 1);
  assert.equal(c.omerDay(new HDate(18, m.IYYAR, 5787)), 33);
  assert.equal(c.omerDay(new HDate(5, m.SIVAN, 5787)), 49);
  assert.equal(c.omerDay(new HDate(6, m.SIVAN, 5787)), 0);
  assert.equal(omerText(1), 'היום יום אחד');
  assert.equal(omerText(8), 'היום 8 ימים, שהם שבוע אחד ויום אחד');
  assert.equal(omerText(33), 'היום 33 יום, שהם 4 שבועות ו-5 ימים');
  assert.equal(omerText(49), 'היום 49 יום, שהם 7 שבועות');
});

test('mincha routes', () => {
  const route = i => PRAYERS.mincha.build(i).map(s => `${s.from}-${s.to}`).join(' ');
  const weekdayIn = (from, test) => { let d = from; while (!test(d)) d = d.next(); return c.dayInfo(d); };
  assert.match(route(c.dayInfo(c.fastDates(5787).gedalia)), /^17-20 105-109 452-457א 109-121 121-122 123-124 125-125/);
  assert.match(route(c.dayInfo(c.fastDates(5788).tammuz)), /^17-20 105-109 452-455 457א-457א 109-121 123-124/);
  assert.match(route(c.dayInfo(c.fastDates(5787).av)), /^526-526 105-109 452-455 456-457א 109-121 526-531/);
  const plain = weekdayIn(new HDate(9, m.CHESHVAN, 5787), d => c.weekday(d) === 2);
  assert.match(route(plain), /^105-121 123-124 125-125 126-126 127-128/);
  assert.ok(!has('mincha', plain, 'תחנון', { adjacent: true }));
  const esther = c.dayInfo(c.fastDates(5787).esther);
  assert.ok(!has('mincha', esther, 'תחנון'));
  assert.ok(tells('mincha', esther, 'יהי ה'));
});

test('shacharit contents', () => {
  const mon = c.dayInfo(new HDate(new Date(2026, 10, 30)));
  assert.ok(has('shacharit', mon, 'תחנון לשני וחמישי'));
  assert.ok(has('shacharit', mon, 'וישב'));
  assert.ok(has('shacharit', day(1, m.TAMUZ, 5787), 'מוסף לראש חודש'));
  assert.ok(has('shacharit', day(26, m.KISLEV, 5787), 'הלל שלם'));
  assert.ok(has('shacharit', day(14, m.ADAR_II, 5787), 'מגילת אסתר'));
  assert.ok(has('shacharit', day(17, m.NISAN, 5787), 'מוסף שלש רגלים'));
});

test('walled city Purim', () => {
  assert.equal(c.isPurim(new HDate(15, m.ADAR_II, 5787), true), true);
  assert.equal(c.isPurim(new HDate(14, m.ADAR_II, 5787), true), false);
  for (let y = 5780; y < 5810; y++) {
    const mo = HDate.isLeapYear(y) ? m.ADAR_II : m.ADAR_I, d15 = new HDate(15, mo, y);
    if (c.isShabbat(d15)) {
      assert.ok(c.isMegillahDay(new HDate(14, mo, y), true));
      assert.ok(!c.isMegillahDay(d15, true));
    }
  }
});

test('parasha table', () => {
  assert.equal(PARSHIOT.length, 54);
  for (let y = 5785; y < 5800; y++) for (let d = new HDate(1, m.TISHREI, y); d.getFullYear() === y; d = d.next()) {
    const n = c.upcomingParsha(d, true);
    assert.ok(n >= 0 && n < 54, `${d} ${n}`);
  }
  assert.equal(PARSHIOT[c.upcomingParsha(new HDate(12, m.TISHREI, 5787))][0], 'וזאת הברכה');
});

test('every segment and reminder points at real pages, for 20 years', () => {
  const start = new HDate(1, m.TISHREI, 5785).abs();
  for (let a = start; a < start + 365 * 20; a++) for (const il of [true, false]) {
    const i = c.dayInfo(new HDate(a), { il });
    if (i.holy) continue;
    for (const p of Object.keys(PRAYERS)) {
      const pages = new Set();
      for (const s of PRAYERS[p].build(i)) {
        const r = idx.range(s.from, s.to);
        assert.ok(r.length > 0 && r.length < 70, `${i.d} ${p} ${s.title} ${s.from}-${s.to}: ${r.length}`);
        r.forEach(n => pages.add(n));
      }
      for (const l of omittedPages(p, i)) pages.delete(idx.first(l));
      for (const r of reminders(p, i)) if (r.page) {
        assert.ok(idx.first(r.page), `no page ${r.page}`);
        assert.ok(pages.has(idx.first(r.page)), `${i.d} ${p}: reminder on page ${r.page} (${r.text}) is not in the sequence`);
      }
    }
  }
});

test('jump places and painted boxes point at real places', async () => {
  const { ANCHORS } = await import('../app/logic/anchors.js');
  const { HIGHLIGHTS } = await import('../app/logic/highlights.js');
  for (const [l, name] of ANCHORS) assert.ok(idx.first(l), `jump place ${name}: no page ${l}`);
  for (const [prayer, marks] of Object.entries(HIGHLIGHTS)) for (const [m, [page, rects]] of Object.entries(marks)) {
    assert.ok(idx.first(page), `${prayer}.${m}: no page ${page}`);
    for (const [x0, y0, x1, y1] of rects) assert.ok(x0 >= 0 && y0 >= 0 && x1 <= 595 && y1 <= 842 && x1 > x0 && y1 > y0, `${prayer}.${m}: box outside the page`);
  }
});

test('calendar squares: every main day gets a short tag (10 years, Israel and abroad)', async () => {
  const { eventsBetween } = await import('../app/logic/events.js');
  const { cellLabel } = await import('../app/logic/labels.js');
  for (const il of [true, false]) {
    for (let y = 5785; y < 5795; y++) {
      const first = new HDate(1, m.TISHREI, y), last = new HDate(new HDate(1, m.TISHREI, y + 1).abs() - 1);
      for (const [a, d] of eventsBetween(first.greg(), last.greg(), { il })) {
        const L = cellLabel(d.events.filter(e => e.kind !== 'time' && e.kind !== 'omer'));
        if (!L.kind) continue;
        // One or two short words fit in the square on a small phone (checked by eye on six real months).
        assert.ok(L.tag.length <= 8, `${new HDate(a)}: tag "${L.tag}" is too long`);
        assert.ok(L.detail.length <= 22, `${new HDate(a)}: detail "${L.detail}" is too long`);
      }
    }
  }
});
