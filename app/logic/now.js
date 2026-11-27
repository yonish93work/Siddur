// Which Hebrew date each prayer belongs to at a given moment, and which prayer is "now".
import { HDate, GeoLocation, Zmanim } from '@hebcal/core';

// Places to choose from, without asking the phone for its location. candles = minutes before sunset.
// group: 'city' or 'yemenite' (towns and moshavim founded by, or home to, Yemenite communities). Coordinates are
// approximate (a few hundred metres change the times by seconds).
const IL = (name, lat, lon, candles = 20, group = 'city') => ({ name, lat, lon, tz: 'Asia/Jerusalem', candles, group });
const Y = (name, lat, lon, candles = 20) => IL(name, lat, lon, candles, 'yemenite');
export const CITIES = [
  IL('ירושלים', 31.778, 35.235, 40), IL('תל אביב', 32.08, 34.78), IL('חיפה', 32.79, 34.99, 30), IL('באר שבע', 31.25, 34.79),
  IL('בני ברק', 32.08, 34.83), IL('פתח תקווה', 32.09, 34.88), IL('אשדוד', 31.80, 34.65), IL('אשקלון', 31.67, 34.57),
  IL('נתניה', 32.33, 34.86), IL('רחובות', 31.89, 34.81), IL('ראשון לציון', 31.96, 34.80), IL('חולון', 32.02, 34.78),
  IL('בית שמש', 31.75, 34.99, 30), IL('מודיעין', 31.90, 35.01), IL('אלעד', 32.05, 34.95), IL('קריית אונו', 32.06, 34.86),
  IL('יבנה', 31.88, 34.74), IL('יהוד', 32.03, 34.89), IL('צפת', 32.96, 35.50, 30), IL('טבריה', 32.79, 35.53),
  IL('עפולה', 32.61, 35.29), IL('אילת', 29.56, 34.95),
  // North
  IL('מטולה', 33.28, 35.58), IL('קריית שמונה', 33.21, 35.57), IL('ראש פינה', 32.97, 35.54), IL('קצרין', 32.99, 35.69),
  IL('נהריה', 33.01, 35.10), IL('עכו', 32.93, 35.08), IL('כרמיאל', 32.92, 35.30), IL('מעלות-תרשיחא', 33.02, 35.27),
  IL('שלומי', 33.07, 35.15), IL('נוף הגליל', 32.71, 35.32), IL('מגדל העמק', 32.68, 35.24), IL('יקנעם עילית', 32.66, 35.11),
  IL('קריית טבעון', 32.72, 35.13), IL('רכסים', 32.75, 35.10), IL('בית שאן', 32.50, 35.50), IL('קריית אתא', 32.81, 35.11),
  IL('קריית ביאליק', 32.84, 35.09), IL('קריית מוצקין', 32.84, 35.08), IL('קריית ים', 32.85, 35.07), IL('טירת כרמל', 32.76, 34.97),
  // Center and Sharon
  IL('זכרון יעקב', 32.57, 34.95), IL('אור עקיבא', 32.51, 34.92), IL('חדרה', 32.44, 34.92), IL('פרדס חנה-כרכור', 32.47, 34.97),
  IL('הרצליה', 32.16, 34.84), IL('רעננה', 32.18, 34.87), IL('כפר סבא', 32.18, 34.91), IL('הוד השרון', 32.15, 34.89),
  IL('רמת גן', 32.07, 34.82), IL('גבעתיים', 32.07, 34.81), IL('בת ים', 32.02, 34.75), IL('אור יהודה', 32.03, 34.86),
  IL('גבעת שמואל', 32.08, 34.85), IL('שוהם', 32.00, 34.95), IL('רמלה', 31.93, 34.87), IL('לוד', 31.95, 34.89),
  IL('באר יעקב', 31.94, 34.84), IL('נס ציונה', 31.93, 34.80), IL('גדרה', 31.81, 34.78), IL('כפר חב"ד', 31.99, 34.85),
  IL('מודיעין עילית', 31.93, 35.04),
  // South
  IL('קריית מלאכי', 31.73, 34.75), IL('קריית גת', 31.61, 34.77), IL('שדרות', 31.52, 34.60), IL('נתיבות', 31.42, 34.59),
  IL('אופקים', 31.31, 34.62), IL('דימונה', 31.07, 35.03), IL('ערד', 31.26, 35.21), IL('ירוחם', 30.99, 34.93),
  IL('מצפה רמון', 30.61, 34.80),
  // Judea and Samaria
  IL('מעלה אדומים', 31.78, 35.30, 30), IL('ביתר עילית', 31.70, 35.12, 30), IL('אפרת', 31.65, 35.15, 30), IL('קריית ארבע', 31.53, 35.12),
  IL('אריאל', 32.10, 35.17), IL('עמנואל', 32.16, 35.13), IL('קרני שומרון', 32.17, 35.10),
  Y('ראש העין', 32.095, 34.957), Y('שעריים (רחובות)', 31.887, 34.80), Y('כרם התימנים (תל אביב)', 32.068, 34.768),
  Y('קריית עקרון', 31.86, 34.82), Y('אליכין', 32.405, 34.925), Y('עמקה', 32.977, 35.162), Y('אחיעזר', 31.977, 34.867),
  Y('גבעת יערים', 31.783, 35.093, 30), Y('אשתאול', 31.780, 35.008, 30), Y('תרום', 31.788, 34.995, 30), Y('זנוח', 31.734, 34.997, 30),
  Y('תעוז', 31.808, 34.972, 30), Y('גבעת כ"ח', 32.03, 34.94), Y('יגל', 31.994, 34.885), Y('רינתיה', 32.04, 34.93),
  Y('גאולי תימן', 32.30, 34.88),
  // Added 2026-11-27 (each founded by immigrants from Yemen, by the Hebrew encyclopedias): Elyashiv, the first
  // Yemenite moshav (1933); Shefer and Elkosh (1949-50); Shtulim; Machane Yehuda, the Yemenite quarter of Petah Tikva.
  Y('אלישיב', 32.36, 34.91), Y('שפר', 32.94, 35.43), Y('אלקוש', 33.03, 35.31), Y('שתולים', 31.77, 34.70),
  Y('מחנה יהודה (פתח תקווה)', 32.09, 34.87),
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
