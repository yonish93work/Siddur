// Which Hebrew date each prayer belongs to at a given moment, and which prayer is "now".
import { HDate, GeoLocation, Zmanim } from '@hebcal/core';

// Default place until the user allows location: Jerusalem.
export const JERUSALEM = { name: 'ירושלים', lat: 31.778, lon: 35.235, tz: 'Asia/Jerusalem' };

export function zmanim(date, place) {
  const z = new Zmanim(new GeoLocation(null, place.lat, place.lon, 0, place.tz), date, false);
  return { alot: z.alotHaShachar(), chatzot: z.chatzot(), minchaGedola: z.minchaGedola(), sunrise: z.sunrise(), sunset: z.sunset(), tzeit: z.tzeit(8.5) };
}

// The civil date in the place's own time zone, as a local Date at noon.
export function civilDate(now, tz) {
  const [y, m, d] = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now).split('-').map(Number);
  return new Date(y, m - 1, d, 12);
}
export const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, 12);

// { current, shacharit, mincha, arvit, halachic, zmanim }: civil dates for the three prayers.
// The evening prayer of civil date D belongs to the Hebrew date of D + 1.
export function situation(now, place) {
  const today = civilDate(now, place.tz);
  const z = zmanim(today, place);
  const t = now.getTime();
  const at = x => (x && !Number.isNaN(x.getTime()) ? x.getTime() : null);
  const alot = at(z.alot) ?? at(z.sunrise), sunset = at(z.sunset), tzeit = at(z.tzeit) ?? sunset, mg = at(z.minchaGedola);
  if (alot !== null && t < alot) {
    // Still the night that began yesterday.
    return { current: 'arvit', shacharit: today, mincha: today, arvit: addDays(today, -1), halachic: new HDate(today), zmanim: z };
  }
  if (sunset !== null && t >= sunset) {
    const day = t >= tzeit ? addDays(today, 1) : today;
    return { current: 'arvit', shacharit: addDays(today, 1), mincha: day, arvit: today, halachic: new HDate(addDays(today, 1)), zmanim: z };
  }
  return { current: mg !== null && t >= mg ? 'mincha' : 'shacharit', shacharit: today, mincha: today, arvit: today, halachic: new HDate(today), zmanim: z };
}

// Hebrew date of a prayer said on a civil date.
export const prayerDate = (prayer, civil) => (prayer === 'arvit' ? new HDate(addDays(civil, 1)) : new HDate(civil));
