// Central settings for the Burger Blastoff passport system.

export const SITE_URL = 'https://getbitebook.com';
export const FROM_EMAIL = 'BiteBook <info@getbitebook.com>';
export const SUPPORT_EMAIL = 'info@getbitebook.com';

// Square location that only sells BiteBook passports ("BiteBook - Eat Local")
export const SQUARE_LOCATION_ID = 'LX3Z9VY1YFX39';

// Every BiteBook event. A passport belongs to one event + one city.
// To add an event: copy an entry, give it a new unique `id`, and fill in the dates and wording.
// Never change an existing event's `id` (passports are tied to it).
export const EVENTS = {
  burger: {
    id: 'burger',
    name: 'Burger Blastoff',
    coverWords: ['BURGER', 'BLASTOFF'],
    food: 'burger',            // "a burger deal at every restaurant"
    enjoy: 'Enjoy your burger',
    emoji: '🍔',
    startDate: '2026-10-15',   // first day coupons work (local time in each city)
    endDate: '2026-11-15',     // last day coupons work (inclusive)
    datesLabel: 'Oct 15 – Nov 15, 2026',
    startLabel: 'Thursday, Oct 15',
    startShort: 'Oct 15',
    endLabel: 'Nov 15, 2026',
    fileName: 'Burger-Blastoff',
    cities: ['nashville', 'phoenix'],
    // Sold through Square (see square-webhook.js), not the Stripe checkout
    onSale: false,
  },
  wings: {
    id: 'wings',
    name: 'Wing Month',
    coverWords: ['WING', 'MONTH'],
    food: 'wing',
    enjoy: 'Enjoy your wings',
    emoji: '🍗',
    startDate: '2026-12-15',
    endDate: '2027-01-15',
    datesLabel: 'Dec 15, 2026 – Jan 15, 2027',
    startLabel: 'Tuesday, Dec 15',
    startShort: 'Dec 15',
    endLabel: 'Jan 15, 2027',
    fileName: 'Wing-Month',
    cities: ['denver', 'nashville', 'phoenix'],
    // Stripe checkout at getbitebook.com/wings/<city>
    onSale: true,
    priceCents: 2000,
    slug: 'wings',
    // Sales page extras (all optional; sections stay hidden until filled in)
    giftLine: 'Perfect stocking stuffer: grab a few and forward one to each friend.',
    // Total value of the deals per city, once known, e.g. { nashville: '$150+' }
    valueByCity: {},
    // Photos for the page, e.g. [{ src: '/photos/wings/caney-fork.jpg', alt: 'Wings at Caney Fork' }]
    photos: [],
  },
};

// The event a passport (or coupon row) belongs to. Older passports have no event and are Burger Blastoff.
export function eventOf(row) {
  return EVENTS[row?.event] || EVENTS.burger;
}

// Kept for pages that are still Burger Blastoff only (lineup, nightly, staff guide)
export const EVENT = EVENTS.burger;

export const CITIES = {
  denver: {
    id: 'denver',
    name: 'Denver',
    area: 'the Denver metro area',
    instagram: 'bitebook_denver',
    tz: 'America/Denver',
    match: (itemName) => /denver/i.test(itemName),
  },
  nashville: {
    id: 'nashville',
    name: 'Nashville',
    area: 'the Greater Nashville area', // many spots are outside the city proper
    instagram: 'bitebook_nashville',
    tz: 'America/Chicago',
    // Square item names for this city's passport
    match: (itemName) => /nashville/i.test(itemName),
  },
  phoenix: {
    id: 'phoenix',
    name: 'Phoenix',
    area: 'the Valley of the Sun',      // never "around Phoenix"
    instagram: 'bitebook_phoenix',
    tz: 'America/Phoenix',
    match: (itemName) => /phoenix|phx/i.test(itemName),
  },
};

// Safety lock: this Square setup only makes Burger Blastoff passports. Any Square item that
// mentions another event is never turned into a burger passport; it's held and Will is emailed.
const OTHER_EVENT_ITEM = /wing|coffee|latte|espresso|taco/i;

export function cityForItem(itemName) {
  if (OTHER_EVENT_ITEM.test(itemName || '')) return null;
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

export function eventWindow(cityId, eventId = 'burger') {
  const ev = EVENTS[eventId] || EVENTS.burger;
  const tz = CITIES[cityId].tz;
  const start = localMidnight(ev.startDate, tz);
  const [y, m, d] = ev.endDate.split('-').map(Number);
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
