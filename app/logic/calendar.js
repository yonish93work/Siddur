// What kind of day is it? Pure functions on a Hebrew date, no screen code here.
// Every rule names its source page in the siddur (printed numbers of the 2026 edition).
import { HDate, months, Sedra } from '@hebcal/core';

const { NISAN, IYYAR, SIVAN, TAMUZ, AV, ELUL, TISHREI, CHESHVAN, KISLEV, TEVET, SHVAT, ADAR_I, ADAR_II } = months;

export const hd = (day, month, year) => new HDate(day, month, year);
export const next = (d, n = 1) => new HDate(d.abs() + n);
const same = (a, b) => a.abs() === b.abs();
// The Adar in which Purim falls (hebcal: in an ordinary year the only Adar is number 12 = ADAR_I).
const purimAdar = y => (HDate.isLeapYear(y) ? ADAR_II : ADAR_I);
const monthIs = (d, m) => d.getMonth() === m;
const is = (d, day, m) => d.getDate() === day && d.getMonth() === m;

export const weekday = d => d.getDay(); // 0 = Sunday ... 6 = Saturday
export const isShabbat = d => weekday(d) === 6;

export function isRoshChodesh(d) {
  return (d.getDate() === 1 && !monthIs(d, TISHREI)) || d.getDate() === 30;
}
export const isRoshHashana = d => monthIs(d, TISHREI) && d.getDate() <= 2;
export const isYomKippur = d => is(d, 10, TISHREI);

// Name of the Yom Tov on which work is forbidden, or null.
export function yomTov(d, il = true) {
  if (isRoshHashana(d)) return 'ראש השנה';
  if (isYomKippur(d)) return 'יום הכיפורים';
  if (is(d, 15, TISHREI) || (!il && is(d, 16, TISHREI))) return 'סוכות';
  if (is(d, 22, TISHREI)) return il ? 'שמיני עצרת ושמחת תורה' : 'שמיני עצרת';
  if (!il && is(d, 23, TISHREI)) return 'שמחת תורה';
  if (is(d, 15, NISAN) || is(d, 21, NISAN) || (!il && (is(d, 16, NISAN) || is(d, 22, NISAN)))) return 'פסח';
  if (is(d, 6, SIVAN) || (!il && is(d, 7, SIVAN))) return 'שבועות';
  return null;
}
export const isHoly = (d, il = true) => isShabbat(d) || yomTov(d, il) !== null;

// 'pesach' | 'sukkot' | null
export function cholHamoed(d, il = true) {
  const day = d.getDate(), first = il ? 16 : 17;
  if (monthIs(d, NISAN) && day >= first && day <= 20) return 'pesach';
  if (monthIs(d, TISHREI) && day >= first && day <= 21) return 'sukkot';
  return null;
}
export const isHoshanaRaba = d => is(d, 21, TISHREI);

// 1..8, or 0
export function chanukahDay(d) {
  const n = d.abs() - hd(25, KISLEV, d.getFullYear()).abs() + 1;
  return n >= 1 && n <= 8 ? n : 0;
}

// walled = a city where Purim is on the 15th (Jerusalem)
export const isPurim = (d, walled = false) => is(d, walled ? 15 : 14, purimAdar(d.getFullYear()));
// In a walled city, when the 15th is Shabbat the Megillah is read on Friday the 14th.
export function isMegillahDay(d, walled = false) {
  const y = d.getFullYear(), m = purimAdar(y);
  if (!walled) return is(d, 14, m);
  return isShabbat(hd(15, m, y)) ? is(d, 14, m) : is(d, 15, m);
}

// The observed date of each public fast, after postponing or advancing for Shabbat (p. 8, notes 1-2).
export function fastDates(y) {
  const off = (d, n) => (isShabbat(d) ? next(d, n) : d);
  return {
    gedalia: off(hd(3, TISHREI, y), 1),
    tevet: hd(10, TEVET, y),
    esther: off(hd(13, purimAdar(y), y), -2),
    tammuz: off(hd(17, TAMUZ, y), 1),
    av: off(hd(9, AV, y), 1),
  };
}
export const FAST_NAMES = { gedalia: 'צום גדליה', tevet: 'צום עשירי בטבת', esther: 'תענית אסתר', tammuz: 'צום י"ז בתמוז', av: 'תשעה באב' };
export function publicFast(d) {
  return Object.entries(fastDates(d.getFullYear())).find(([, f]) => same(d, f))?.[0] ?? null;
}

export const isAseretYemeiTeshuva = d => monthIs(d, TISHREI) && d.getDate() <= 10;
// Selichot (ashmorot) from the day after Rosh Chodesh Elul until Yom Kippur (p. 532).
export const isAshmorot = d => (monthIs(d, ELUL) && d.getDate() >= 2) || (monthIs(d, TISHREI) && d.getDate() >= 3 && d.getDate() <= 9);
// "LeDavid Hashem Ori" from Rosh Chodesh Elul until Hoshana Raba (p. 101).
export const isOriSeason = d => is(d, 30, AV) || monthIs(d, ELUL) || (monthIs(d, TISHREI) && d.getDate() <= 21);

// Independence Day: 5 Iyar; Friday -> Thursday 4, Shabbat -> Thursday 3, Monday -> Tuesday 6 (p. 157).
export function yomHaatzmaut(y) {
  const d = hd(5, IYYAR, y);
  return next(d, { 5: -1, 6: -2, 1: 1 }[weekday(d)] ?? 0);
}
export const isYomHaatzmaut = d => same(d, yomHaatzmaut(d.getFullYear()));
export const isYomHazikaron = d => same(next(d), yomHaatzmaut(d.getFullYear()));

// "Mashiv haruach": from Mussaf of Shemini Atzeret until Mussaf of the first day of Pesach.
export function isGeshem(d) {
  const y = d.getFullYear(), a = d.abs();
  return a >= hd(22, TISHREI, y).abs() && a < hd(15, NISAN, y).abs();
}
// "Barech aleinu": in Israel from the night of 7 Marcheshvan; abroad from the evening of 4 December
// (5 December before a civil leap year) = the 60th day after tekufat Tishrei (p. 58, p. 113). Until Pesach.
export function isBarechAleinu(d, il = true) {
  const y = d.getFullYear(), a = d.abs();
  if (a >= hd(15, NISAN, y).abs()) return false;
  if (il) return a >= hd(7, CHESHVAN, y).abs();
  const tishrei = hd(1, TISHREI, y).greg().getFullYear();
  const leapNext = new Date(tishrei + 1, 1, 29).getDate() === 29;
  return a >= new HDate(new Date(tishrei, 11, leapNext ? 6 : 5)).abs();
}

// 1..49, or 0. The date is the halachic day, which begins at night.
export function omerDay(d) {
  const n = d.abs() - hd(16, NISAN, d.getFullYear()).abs() + 1;
  return n >= 1 && n <= 49 ? n : 0;
}

// Days without Tachanun: the list on p. 68 and the grey days in the table on p. 8. Returns the reason, or null.
export function noTachanunReason(d, il = true) {
  const y = d.getFullYear(), day = d.getDate();
  if (isShabbat(d)) return 'שבת';
  const yt = yomTov(d, il);
  if (yt) return yt;
  if (cholHamoed(d, il)) return 'חול המועד';
  if (isRoshChodesh(d)) return 'ראש חודש';
  if (is(d, 29, ELUL)) return 'ערב ראש השנה';
  if (is(d, 9, TISHREI)) return 'ערב יום הכיפורים';
  if (monthIs(d, TISHREI) && day >= 11) return 'ממוצאי כיפור עד סוף תשרי';
  if (chanukahDay(d)) return 'חנוכה';
  if (is(d, 15, SHVAT)) return 'ט"ו בשבט';
  if (is(d, 14, purimAdar(y)) || is(d, 15, purimAdar(y))) return 'פורים';
  if (HDate.isLeapYear(y) && (is(d, 14, ADAR_I) || is(d, 15, ADAR_I))) return 'פורים קטן';
  if (monthIs(d, NISAN)) return 'חודש ניסן';
  if (isYomHaatzmaut(d)) return 'יום העצמאות'; // p. 419
  if (is(d, 14, IYYAR)) return 'פסח קטן (י"ד באייר)';
  if (is(d, 18, IYYAR)) return 'ל"ג בעומר';
  if (monthIs(d, SIVAN) && day <= 12) return 'מראש חודש סיון עד י"ב בו';
  if (publicFast(d) === 'av') return 'תשעה באב';
  if (is(d, 15, AV)) return 'ט"ו באב';
  return null;
}
// Mincha: also none if tomorrow has none, except on the day before erev Rosh Hashana and erev Yom Kippur (p. 68).
export function noTachanunAtMinchaReason(d, il = true) {
  const today = noTachanunReason(d, il);
  if (today) return today;
  const t = next(d);
  if (is(t, 29, ELUL) || is(t, 9, TISHREI)) return null;
  const tomorrow = noTachanunReason(t, il);
  return tomorrow && `מחר: ${tomorrow}`;
}

// Kiddush Levana window, for a reminder only: nights 3-15 of the month; in Tishrei, Av and Tevet only after
// Yom Kippur / the fast (the black "לבנה" boxes on p. 8 stand right after the 10th).
export function isKiddushLevana(d) {
  const day = d.getDate();
  const first = monthIs(d, TISHREI) || monthIs(d, AV) || monthIs(d, TEVET) ? 11 : 3;
  return day >= first && day <= 15;
}

// The weekly portion read on Monday and Thursday, as an index into PARSHIOT (0 = Bereshit), or -1.
export function upcomingParsha(d, il = true) {
  const start = next(d, 6 - weekday(d));
  for (let s = start; s.abs() < start.abs() + 60; s = next(s, 7)) {
    const r = new Sedra(s.getFullYear(), il).lookup(s);
    if (!r.chag) {
      const n = (Array.isArray(r.num) ? r.num[0] : r.num) - 1;
      // Between Haazinu and Simchat Torah the weekday reading is Vezot Haberacha.
      if (n === 0 && monthIs(d, TISHREI) && d.getDate() < 22) return 53;
      return n;
    }
  }
  return -1;
}

// Everything the rest of the app needs to know about one day.
export function dayInfo(d, { il = true, walled = false } = {}) {
  return {
    d, il, walled, weekday: weekday(d),
    shabbat: isShabbat(d), yomTov: yomTov(d, il), holy: isHoly(d, il),
    erevShabbat: weekday(d) === 5,
    roshChodesh: isRoshChodesh(d), cholHamoed: cholHamoed(d, il), hoshanaRaba: isHoshanaRaba(d),
    chanukah: chanukahDay(d), purim: isPurim(d, walled), megillah: isMegillahDay(d, walled),
    fast: publicFast(d), ayt: isAseretYemeiTeshuva(d), ashmorot: isAshmorot(d), ori: isOriSeason(d),
    haatzmaut: isYomHaatzmaut(d), zikaron: isYomHazikaron(d),
    geshem: isGeshem(d), barech: isBarechAleinu(d, il), omer: omerDay(d),
    noTachanun: noTachanunReason(d, il), noTachanunMincha: noTachanunAtMinchaReason(d, il),
    levana: isKiddushLevana(d),
    afterShabbat: isShabbat(next(d, -1)), afterYomTov: yomTov(next(d, -1), il) !== null,
  };
}
