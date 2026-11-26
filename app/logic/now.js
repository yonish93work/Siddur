// Which Hebrew date each prayer belongs to at a given moment, and which prayer is "now".
import { HDate, GeoLocation, Zmanim } from '@hebcal/core';

// Places to choose from, without asking the phone for its location. candles = minutes before sunset.
const IL = (name, lat, lon, candles = 30) => ({ name, lat, lon, tz: 'Asia/Jerusalem', candles });
export const CITIES = [
  IL('ירושלים', 31.778, 35.235, 40), IL('תל אביב', 32.08, 34.78, 20), IL('חיפה', 32.79, 34.99, 30), IL('באר שבע', 31.25, 34.79, 20),
  IL('בני ברק', 32.08, 34.83, 20), IL('ראש העין', 32.095, 34.957, 20), IL('פתח תקווה', 32.09, 34.88, 20), IL('אשדוד', 31.80, 34.65, 20),
  IL('אשקלון', 31.67, 34.57, 20), IL('נתניה', 32.33, 34.86, 20), IL('רחובות', 31.89, 34.81, 20), IL('ראשון לציון', 31.96, 34.80, 20),
  IL('חולון', 32.02, 34.78, 20), IL('בית שמש', 31.75, 34.99, 30), IL('מודיעין', 31.90, 35.01, 20), IL('אלעד', 32.05, 34.95, 20),
  IL('קריית אונו', 32.06, 34.86, 20), IL('יבנה', 31.88, 34.74, 20), IL('צפת', 32.96, 35.50, 30), IL('טבריה', 32.79, 35.53, 20),
  IL('עפולה', 32.61, 35.29, 20), IL('אילת', 29.56, 34.95, 20),
];
// Default place until the user chooses: Jerusalem.
export const JERUSALEM = CITIES[0];

// The times shown under each day, in order.
export function zmanimList(date, place) {
  const z = new Zmanim(new GeoLocation(null, place.lat, place.lon, 0, place.tz), date, false);
  return [
    ['עלות השחר', z.alotHaShachar()], ['זמן טלית ותפילין', z.misheyakir()], ['זריחה', z.sunrise()],
    ['סוף זמן קריאת שמע (מג"א)', z.sofZmanShmaMGA()], ['סוף זמן קריאת שמע (גר"א)', z.sofZmanShma()],
    ['סוף זמן תפילה (גר"א)', z.sofZmanTfilla()], ['חצות היום', z.chatzot()], ['מנחה גדולה', z.minchaGedola()],
    ['מנחה קטנה', z.minchaKetana()], ['פלג המנחה', z.plagHaMincha()], ['שקיעה', z.sunset()], ['צאת הכוכבים', z.tzeit(8.5)],
  ];
}

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
