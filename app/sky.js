// The sky at the top of every screen follows the time of day where the user is (approved design, 2026-11-27):
// dawn with a rising sun, a bright day with a glaring sun, the hour before sunset with the top darkening and a
// half-set sun, evening, and night with many stars (no moon).
const MIN = 60e3;

// Which of the five skies to show. z = zmanim of today: { alot, sunrise, sunset, tzeit } as Dates.
export function skyOf(now, z) {
  const t = now.getTime(), at = d => d?.getTime() ?? NaN;
  if (t >= at(z.alot) && t < at(z.sunrise) + 20 * MIN) return 'dawn';
  if (t >= at(z.sunrise) + 20 * MIN && t < at(z.sunset) - 45 * MIN) return 'day';
  if (t >= at(z.sunset) - 45 * MIN && t < at(z.sunset) + 10 * MIN) return 'golden';
  if (t >= at(z.sunset) + 10 * MIN && t < at(z.tzeit) + 40 * MIN) return 'evening';
  return 'night';
}

// Many small stars, always in the same places.
let seed = 7;
const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
const STARS = Array.from({ length: 80 }, () => {
  const s = (0.6 + rnd() * 1.6).toFixed(1), a = (0.45 + rnd() * 0.55).toFixed(2);
  return `radial-gradient(${s}px ${s}px at ${(rnd() * 100).toFixed(1)}% ${(rnd() * 70).toFixed(1)}%, rgba(255,255,255,${a}) 50%, transparent 52%)`;
}).join(', ');

// light: the sky is bright, so the writing on it is dark blue instead of gold.
export const SKIES = {
  dawn: { light: true, ms: .35, sky: 'linear-gradient(180deg, #fbe9cc 0%, #f2c39a 26%, #c98a8c 52%, #5d4a7a 76%, #26284f 100%)', theme: '#c98a8c' },
  day: { light: true, ms: .22, sky: 'linear-gradient(180deg, #9fd3f6 0%, #c4e5fa 45%, #e9f6ff 100%)', theme: '#9fd3f6' },
  golden: { light: false, ms: .45, sky: 'linear-gradient(180deg, #1c2150 0%, #463371 26%, #9a4c63 52%, #ea7f49 76%, #ffcf86 100%)', theme: '#1c2150' },
  evening: { light: false, ms: .55, sky: 'linear-gradient(180deg, #0e1433 0%, #28245a 50%, #4d3270 85%, #6a3f78 100%)', theme: '#0e1433' },
  night: { light: false, ms: .4, sky: `${STARS}, linear-gradient(180deg, #030816 0%, #0a1730 55%, #15305a 100%)`, theme: '#030816' },
};

// Puts the sky on the page: a class on <body> for the colours, and the sky itself as a CSS variable.
export function applySky(name) {
  const s = SKIES[name];
  const b = document.body;
  for (const k of Object.keys(SKIES)) b.classList.toggle(`sky-${k}`, k === name);
  b.classList.toggle('sky-light', s.light);
  b.style.setProperty('--sky', s.sky);
  b.style.setProperty('--sky-ms', String(s.ms));
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', s.theme);
}
