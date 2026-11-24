// Map pins for restaurants from the backend sheet, looked up on Google (Places API, GOOGLE_MAPS_API_KEY).
// Each restaurant location is looked up once and saved in the database (table pin_cache).
// Lookups never happen while a visitor waits: pages use saved pins, and missing ones are looked up in the
// background (a few per page view) so they appear on the next visit.
// If Google's address for a restaurant doesn't match the sheet's, #site-alerts gets one message about it.
import { query } from './db.js';
import { post } from './slack.js';

let mem = null; // key -> { lat, lng }
const checked = new Set(); // every key already looked up (found or not)
let tableReady = false;
const inFlight = new Set();
const PER_RUN = 20; // ~0.3 s each; runs after the page is sent, so visitors never wait

// Metro centers: Google searches near the right city, and a result over 80 km away is treated as wrong
// (same-name restaurants in other cities / franchises)
const CENTERS = {
  denver: { latitude: 39.7392, longitude: -104.9903 },
  nashville: { latitude: 36.1627, longitude: -86.7816 },
  phoenix: { latitude: 33.4484, longitude: -112.0740 },
};
const km = (a, b) => {
  const r = (d) => (d * Math.PI) / 180;
  const h = Math.sin(r(b.latitude - a.latitude) / 2) ** 2 + Math.cos(r(a.latitude)) * Math.cos(r(b.latitude)) * Math.sin(r(b.longitude - a.longitude) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
};

async function ensureTable() {
  if (tableReady) return;
  await query(`CREATE TABLE IF NOT EXISTS pin_cache (
    key text PRIMARY KEY, lat double precision, lng double precision,
    google_name text, google_address text, place_id text, website text,
    mismatch boolean NOT NULL DEFAULT false, checked_at timestamptz NOT NULL DEFAULT now())`);
  tableReady = true;
}

const slug = (v) => String(v || '').toLowerCase().replace(/[^a-z0-9]/g, '');
// Google listing ID if the sheet has one, else the address; no address = name + city (re-checked once an address is added)
export const pinKey = (loc) => (loc.placeId ? `place:${loc.placeId}` : loc.address ? `addr:${slug(loc.address)}` : `none:${slug(loc.sheetName)}|${slug(loc.city)}`);

export async function savedPins() {
  if (mem) return mem;
  try {
    const rows = await query('SELECT key, lat, lng FROM pin_cache'); // table is created by the first lookup
    rows.forEach((r) => checked.add(r.key));
    mem = Object.fromEntries(rows.filter((r) => r.lat !== null).map((r) => [r.key, { lat: Number(r.lat), lng: Number(r.lng) }]));
  } catch (e) {
    console.error('pin cache read:', e.message || e);
    mem = {};
  }
  return mem;
}

const GOOGLE_FIELDS = 'id,displayName,formattedAddress,location,websiteUri';

async function lookup(loc) {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) return null;
  const headers = { 'X-Goog-Api-Key': key };
  if (loc.placeId) {
    const r = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(loc.placeId)}`,
      { headers: { ...headers, 'X-Goog-FieldMask': GOOGLE_FIELDS }, signal: AbortSignal.timeout(8000) });
    if (r.ok) return r.json();
  }
  if (!loc.address) return null;
  const r = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json', 'X-Goog-FieldMask': GOOGLE_FIELDS.split(',').map((f) => `places.${f}`).join(',') },
    body: JSON.stringify({
      // Addresses without a city/state get the metro name added, so Google looks in the right place
      textQuery: `${loc.sheetName} ${loc.address}${/\b[A-Z]{2}\b\s*\d{5}|,\s*[A-Z]{2}\b/.test(loc.address) ? '' : `, ${loc.city}`}`,
      maxResultCount: 1,
      ...(CENTERS[loc.city.toLowerCase()] ? { locationBias: { circle: { center: CENTERS[loc.city.toLowerCase()], radius: 50000 } } } : {}),
    }),
    signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) throw new Error(`Google ${r.status}`);
  return (await r.json()).places?.[0] || null;
}

// Same street number, same town and same ZIP (whichever both addresses have) = same place.
// The town check catches franchises / same-name restaurants in a different town.
const townOf = (s) => {
  const m = String(s || '').match(/,\s*([A-Za-z .'-]+?),?\s+[A-Z]{2}\b(?:\s*\d{5})?(?:,\s*(?:USA|US|United States))?\s*$/);
  return m ? m[1].trim().toLowerCase() : '';
};
function addressProblem(sheet, google) {
  const num = (s) => (String(s || '').match(/^\s*(\d+)/) || [])[1];
  const zip = (s) => (String(s || '').match(/\b(\d{5})\b(?!.*\b\d{5}\b)/) || [])[1];
  if (num(sheet) && num(google) && num(sheet) !== num(google)) return 'street number';
  if (townOf(sheet) && townOf(google) && townOf(sheet) !== townOf(google)) return 'town';
  if (zip(sheet) && zip(google) && zip(sheet) !== zip(google)) return 'ZIP';
  return '';
}

async function fill(loc) {
  const k = pinKey(loc);
  if (inFlight.has(k)) return;
  inFlight.add(k);
  try {
    const noAddress = !loc.placeId && !loc.address;
    const p = noAddress ? null : await lookup(loc); // no address: don't guess from the name alone
    await ensureTable();
    const center = CENTERS[loc.city.toLowerCase()];
    const far = p?.location && center && km(center, p.location) > 80;
    const found = p && !far ? p : null;
    const lat = found?.location?.latitude ?? null;
    const lng = found?.location?.longitude ?? null;
    const gAddr = (p?.formattedAddress || '').replace(/,\s*USA$/, '');
    const problem = !p ? 'not found' : far ? 'wrong city' : addressProblem(loc.address, gAddr);
    const mismatch = Boolean(problem);
    const ins = await query(
      `INSERT INTO pin_cache (key, lat, lng, google_name, google_address, place_id, website, mismatch)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT (key) DO NOTHING RETURNING key`,
      [k, lat, lng, p?.displayName?.text || null, gAddr || null, p?.id || null, p?.websiteUri || null, mismatch],
    );
    checked.add(k);
    if (lat !== null && mem) mem[k] = { lat, lng };
    if (ins.length && mismatch) {
      const head = `:round_pushpin: *Address check: ${loc.sheetName}* (${loc.city})\nSheet says: ${loc.address || '(no address)'}`;
      await post('SLACK_ALERTS_WEBHOOK', noAddress
        ? `${head}\nNo address in the sheet, so it has no map pin. Add its address to the Address column.`
        : !p
        ? `${head}\nGoogle couldn't find it, so it has no map pin. Check the Address column.`
        : far
          ? `${head}\nGoogle's closest match is in another city (${gAddr}), so it has no map pin. Check the Address column.`
          : `${head}\nGoogle says: ${gAddr} (different ${problem})\nThe map uses Google's location. If the sheet is wrong, fix the Address column.`);
    }
  } catch (e) {
    console.error('pin lookup:', loc.sheetName, e.message || e);
  } finally {
    inFlight.delete(k);
  }
}

// Look up a few missing pins after the page has been sent
export function fillMissingPins(locs) {
  if (!process.env.GOOGLE_MAPS_API_KEY || !mem) return;
  const todo = locs.filter((l) => !checked.has(pinKey(l)) && !inFlight.has(pinKey(l))).slice(0, PER_RUN);
  if (!todo.length) return;
  const p = (async () => { for (const l of todo) await fill(l); })();
  const ctx = globalThis[Symbol.for('@vercel/request-context')]?.get?.();
  if (ctx?.waitUntil) ctx.waitUntil(p); else p.catch(() => {});
}
