// What appears in the Hebrew calendar: holidays, fasts, Rosh Chodesh, the weekly portion, candle lighting
// and Havdalah, from hebcal, in Hebrew. Plus the siddur's own marks (days without Tachanun, the Omer).
import { HebrewCalendar, HDate, Location, flags } from '@hebcal/core';
import { dayInfo } from './calendar.js';

const KIND = [
  [flags.CHAG | flags.MAJOR_FAST, 'holiday'],
  [flags.ROSH_CHODESH, 'rc'],
  [flags.MINOR_FAST, 'fast'],
  [flags.CHANUKAH_CANDLES, 'minor'],
  [flags.PARSHA_HASHAVUA, 'parsha'],
  [flags.SPECIAL_SHABBAT | flags.SHABBAT_MEVARCHIM, 'shabbat'],
  [flags.MODERN_HOLIDAY, 'modern'],
  [flags.MINOR_HOLIDAY | flags.EREV, 'minor'],
];
const kindOf = f => KIND.find(([m]) => f & m)?.[1] ?? 'minor';

// Gregorian dates first..last (inclusive) -> Map(absolute day -> { events: [{ text, kind }], info })
export function eventsBetween(first, last, { il = true, walled = false, place } = {}) {
  const location = place ? new Location(place.lat, place.lon, il, place.tz, place.name, il ? 'IL' : undefined) : undefined;
  const list = HebrewCalendar.calendar({
    start: first, end: last, il, sedrot: true, location, candlelighting: !!location,
    candleLightingMins: place?.candles ?? (il ? 30 : 18), havdalahDeg: 8.5, shabbatMevarchim: true,
  });
  const out = new Map();
  const day = a => { if (!out.has(a)) out.set(a, { events: [] }); return out.get(a); };
  for (const e of list) {
    const f = e.getFlags();
    // Leave out the many small civic memorial days; keep the national ones (Independence Day, Memorial Day...).
    if ((f & flags.MODERN_HOLIDAY) && (f & flags.IL_ONLY)) continue;
    if (/Selichot|LaBehemot/.test(e.getDesc())) continue;
    // hebcal writes the postponed Tisha B'Av with its brackets mixed up: "(תשעה באב (נדחה".
    const text = e.render('he-x-NoNikud').replace(/^חנוכה: (.+)$/, 'חנוכה, $1').replace(/ \d{4}$/, '').replace(/^\(תשעה באב \(נדחה$/, 'תשעה באב (נדחה)');
    // Chanukah: hebcal puts the candles on the evening before (24 Kislev = "first candle"). The calendar marks the
    // days themselves (25 Kislev = "חנוכה א׳", added below), and the candles become a note for that evening.
    if (/^חנוכה, /.test(text)) {
      const n = text.match(/^חנוכה, (\S+) נרו?ת?$/)?.[1];
      if (n) day(e.getDate().abs()).events.push({ text: `נר ${n} של חנוכה בערב`, kind: 'candles' });
      continue;
    }
    // All the days of Pesach, Sukkot and Chanukah count as a holiday in the calendar (red).
    // Purim counts as a holiday too; Tisha B'Av is a fast (not a holiday), and the day before it an ordinary day.
    const festive = /חוה״מ|הושענא רבה|^חנוכה|^פורים$|^שושן פורים$/.test(text) || (f & flags.CHANUKAH_CANDLES);
    const kind = /\d:\d\d/.test(text) ? 'time' : /^תשעה באב/.test(text) ? 'fast' : /^ערב /.test(text) ? 'minor' : festive ? 'holiday' : kindOf(f);
    day(e.getDate().abs()).events.push({ text, kind });
  }
  for (let a = new HDate(first).abs(); a <= new HDate(last).abs(); a++) {
    const d = day(a), info = dayInfo(new HDate(a), { il, walled });
    d.info = info;
    if (info.omer) d.events.push({ text: `${info.omer} בעומר`, kind: 'omer' });
    if (info.chanukah) d.events.unshift({ text: `חנוכה, יום ${'אבגדהוזח'[info.chanukah - 1]}׳`, kind: 'holiday' });
    if (info.fast === 'av' && !d.events.some(x => /^תשעה באב/.test(x.text))) d.events.unshift({ text: 'תשעה באב', kind: 'fast' });
  }
  const order = ['holiday', 'fast', 'rc', 'modern', 'minor', 'shabbat', 'parsha', 'candles', 'omer', 'time'];
  for (const d of out.values()) d.events.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
  return out;
}
