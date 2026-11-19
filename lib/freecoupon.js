// Free single-coupon passports from the spinner page (getbitebook.com/spin/<city>).
// The spin lands on a restaurant near the zip code the person enters: the closest few are on the
// wheel and one is picked at random, so it feels lucky but is still somewhere they'd actually go.
// A free passport is an ordinary passport with source = 'free' and one coupon, so the QR code,
// the redeem page, the dashboard and the redemption tracking all work for it unchanged.
import { randomBytes, randomInt } from 'node:crypto';
import { CITIES } from './config.js';
import { restaurantsFor } from './restaurants.js';
import { createPassportsForOrder } from './passports.js';
import { query, logEvent, ensureMultiEventSchema } from './db.js';

const WHEEL_SIZE = 8;   // restaurants shown on the wheel (the closest ones), so people see how many spots are near them
const NEAREST = 3;      // the spin lands on one of the closest this many

// City centers, used when a zip or address can't be looked up
const CENTERS = {
  denver: { lat: 39.7392, lng: -104.9903 },
  nashville: { lat: 36.1627, lng: -86.7816 },
  phoenix: { lat: 33.4484, lng: -112.0740 },
};

// Turn a zip or an address into a map point with Google (Places API, same key as the restaurant sign-up form).
// Results are saved, so each zip/address costs one lookup ever.
async function geocode(text, cityId) {
  const q = String(text || '').trim().toLowerCase();
  if (!q) return null;
  try {
    const hit = await query('SELECT lat, lng FROM geocache WHERE q = $1', [q]);
    if (hit.length) return hit[0].lat === null ? null : { lat: Number(hit[0].lat), lng: Number(hit[0].lng) };
  } catch { /* table not there yet: fall through */ }
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': 'places.location' },
      body: JSON.stringify({
        textQuery: q,
        regionCode: 'us',
        maxResultCount: 1,
        locationBias: { circle: { center: { latitude: CENTERS[cityId].lat, longitude: CENTERS[cityId].lng }, radius: 50000 } },
      }),
      signal: AbortSignal.timeout(5000),
    });
    const json = await res.json().catch(() => ({}));
    const loc = json.places?.[0]?.location;
    const point = loc ? { lat: loc.latitude, lng: loc.longitude } : null;
    await query('INSERT INTO geocache (q, lat, lng) VALUES ($1, $2, $3) ON CONFLICT (q) DO NOTHING',
      [q, point ? String(point.lat) : null, point ? String(point.lng) : null]).catch(() => {});
    return point;
  } catch (e) {
    await logEvent('geocode_failed', { q, error: String(e.message || e).slice(0, 200) });
    return null;
  }
}

function miles(a, b) {
  const R = 3958.8;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// The wheel (closest restaurants first) and the one it lands on
export async function spinFor(cityId, eventId, zip) {
  const list = restaurantsFor(cityId, eventId);
  if (!list.length) return null;
  const home = (zip && (await geocode(`${zip}`, cityId))) || null;
  let ranked = list.map((r) => ({ r, d: null }));
  if (home) {
    const withPoints = await Promise.all(list.map(async (r) => ({ r, p: await geocode(r.address, cityId) })));
    ranked = withPoints.map(({ r, p }) => ({ r, d: p ? miles(home, p) : 9999 })).sort((a, b) => a.d - b.d);
  } else {
    ranked.sort(() => randomInt(3) - 1); // no zip lookup: shuffle
  }
  const wheel = ranked.slice(0, WHEEL_SIZE);
  const pick = randomInt(Math.min(NEAREST, wheel.length));
  return { wheel, pick, winner: wheel[pick] };
}

// One free coupon per email and per phone, per event and city
export async function existingFreePassport({ cityId, eventId, email, phone }) {
  await ensureMultiEventSchema();
  const rows = await query(
    `SELECT * FROM passports WHERE source = 'free' AND city = $1 AND event = $2
       AND (lower(email) = lower($3) OR ($4 <> '' AND regexp_replace(COALESCE(phone, ''), '\\D', '', 'g') LIKE '%' || $4))
     ORDER BY created_at LIMIT 1`,
    [cityId, eventId, email, String(phone || '').replace(/\D/g, '').slice(-10)],
  );
  return rows[0] || null;
}

export async function createFreePassport({ cityId, eventId, name, email, phone, zip, textOk, restaurantId }) {
  const orderId = `free-${randomBytes(6).toString('hex')}`;
  const [p] = await createPassportsForOrder({
    orderId, books: [cityId], name, email, phone, event: eventId, source: 'free',
    amountPaidCents: 0, textOk, freeRestaurant: restaurantId, zip,
  });
  return p;
}

