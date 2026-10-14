// Central settings for the Burger Blastoff passport system.

export const SITE_URL = 'https://getbitebook.com';
export const FROM_EMAIL = 'BiteBook <info@getbitebook.com>';
export const SUPPORT_EMAIL = 'info@getbitebook.com';

// Square location that only sells BiteBook passports ("BiteBook - Eat Local")
export const SQUARE_LOCATION_ID = 'LX3Z9VY1YFX39';

export const EVENT = {
  name: 'Burger Blastoff',
  startDate: '2026-10-15', // first day coupons work (local time in each city)
  endDate: '2026-11-15',   // last day coupons work (inclusive)
  datesLabel: 'Oct 15 – Nov 15, 2026',
};

export const CITIES = {
  nashville: {
    id: 'nashville',
    name: 'Nashville',
    tz: 'America/Chicago',
    // Square item names for this city's passport
    match: (itemName) => /nashville/i.test(itemName),
  },
  phoenix: {
    id: 'phoenix',
    name: 'Phoenix',
    tz: 'America/Phoenix',
    match: (itemName) => /phoenix|phx/i.test(itemName),
  },
};

export function cityForItem(itemName) {
  return Object.values(CITIES).find((c) => c.match(itemName || '')) || null;
}

// Offset in minutes of a time zone at a given instant (e.g. -300 for UTC-5)
function tzOffsetMinutes(tz, date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(date);
  const v = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  const asUTC = Date.UTC(+v.year, +v.month - 1, +v.day, +v.hour, +v.minute, +v.second);
  return Math.round((asUTC - date.getTime()) / 60000);
}

// Midnight at the start of `ymd` in a city's time zone, as a Date
function localMidnight(ymd, tz) {
  const [y, m, d] = ymd.split('-').map(Number);
  const guess = new Date(Date.UTC(y, m - 1, d));
  const off = tzOffsetMinutes(tz, guess);
  return new Date(guess.getTime() - off * 60000);
}

export function eventWindow(cityId) {
  const tz = CITIES[cityId].tz;
  const start = localMidnight(EVENT.startDate, tz);
  const [y, m, d] = EVENT.endDate.split('-').map(Number);
  const dayAfter = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
  const end = localMidnight(dayAfter, tz); // exclusive
  return { start, end };
}

// Postgres text timestamps look like "2026-10-18 23:42:00.123456+00"
export function toDate(v) {
  if (v instanceof Date) return v;
  let s = String(v).trim().replace(' ', 'T');
  s = s.replace(/(\.\d{3})\d+/, '$1');
  s = s.replace(/([+-]\d\d)$/, '$1:00');
  return new Date(s);
}

export function formatLocal(date, cityId) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: CITIES[cityId].tz,
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  }).format(toDate(date));
}
