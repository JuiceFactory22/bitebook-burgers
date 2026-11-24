// Map pins for restaurants from the backend sheet, looked up on Google (Places API, GOOGLE_MAPS_API_KEY).
// Each restaurant location is looked up once and saved in the database (table pin_cache).
// Lookups never happen while a visitor waits: pages use saved pins, and missing ones are looked up in the
// background (a few per page view) so they appear on the next visit.
// If Google's address for a restaurant doesn't match the sheet's (street number, town, ZIP, or a listing in another
// city), #site-alerts gets one message about it. A different street number = the pin goes on the sheet's address.
import { query } from './db.js';
import { post } from './slack.js';

const RECHECK_BEFORE = new Date('2026-11-24T18:05:00Z');
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
  await query('ALTER TABLE pin_cache ADD COLUMN IF NOT EXISTS problem text');
  tableReady = true;
}

const slug = (v) => String(v || '').toLowerCase().replace(/[^a-z0-9]/g, '');
// Google listing ID if the sheet has one, else the address; no address = name + city (re-checked once an address is added)
export const pinKey = (loc) => (loc.placeId ? `place:${loc.placeId}` : loc.address ? `addr:${slug(loc.address)}` : `none:${slug(loc.sheetName)}|${slug(loc.city)}`);

export async function savedPins() {
  if (mem) return mem;
  try {
    const rows = await query('SELECT key, lat, lng, mismatch, checked_at FROM pin_cache'); // table is created by the first lookup
    // Flagged rows checked before the last rule change are looked up again with the current rules
    rows.forEach((r) => { if (!(r.mismatch && new Date(r.checked_at) < RECHECK_BEFORE)) checked.add(r.key); });
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

// Where the sheet's address itself is (used when Google's listing has a different street number)
async function geocodeSheetAddress(loc) {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key || !loc.address) return null;
  const r = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: { 'X-Goog-Api-Key': key, 'Content-Type': 'application/json', 'X-Goog-FieldMask': 'places.formattedAddress,places.location' },
    body: JSON.stringify({
      textQuery: `${loc.address}${/,\s*[A-Z]{2}\b/.test(loc.address) ? '' : `, ${loc.city}`}`,
      maxResultCount: 1,
      ...(CENTERS[loc.city.toLowerCase()] ? { locationBias: { circle: { center: CENTERS[loc.city.toLowerCase()], radius: 50000 } } } : {}),
    }),
    signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) return null;
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
  const zip = (s) => (String(s || '').match(/\b[A-Z]{2},?\s+(\d{5})(?:-\d{4})?\b/) || [])[1]; // ZIP only after a state code
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
    const near = (pl) => pl?.location && (!center || km(center, pl.location) <= 80);
    const far = p?.location && !near(p);
    const gAddr = (p?.formattedAddress || '').replace(/,\s*USA$/, '');
    const problem = noAddress ? 'no address' : !p ? 'not found' : far ? 'wrong city' : addressProblem(loc.address, gAddr);
    // Pin: Google's listing, unless its street number differs from the sheet's - then the sheet's own address
    // (could be a same-name restaurant elsewhere). Town/ZIP-only differences keep Google's listing.
    let pinAt = p && !far ? p.location : null;
    let usedSheet = false;
    if (problem === 'street number' || problem === 'not found' || problem === 'wrong city') {
      const g = await geocodeSheetAddress(loc);
      pinAt = near(g) ? g.location : null;
      usedSheet = Boolean(pinAt);
    }
    const lat = pinAt?.latitude ?? null;
    const lng = pinAt?.longitude ?? null;
    const mismatch = Boolean(problem);
    const saved = await query(
      `WITH old AS (SELECT problem FROM pin_cache WHERE key = $1)
       INSERT INTO pin_cache (key, lat, lng, google_name, google_address, place_id, website, mismatch, problem, checked_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())
       ON CONFLICT (key) DO UPDATE SET lat = EXCLUDED.lat, lng = EXCLUDED.lng, google_name = EXCLUDED.google_name,
         google_address = EXCLUDED.google_address, place_id = EXCLUDED.place_id, website = EXCLUDED.website,
         mismatch = EXCLUDED.mismatch, problem = EXCLUDED.problem, checked_at = now()
       RETURNING (SELECT problem FROM old) AS old_problem, (SELECT count(*) FROM old) AS existed`,
      [k, lat, lng, p?.displayName?.text || null, gAddr || null, p?.id || null, p?.websiteUri || null, mismatch, problem || null],
    );
    checked.add(k);
    if (mem) { if (lat !== null) mem[k] = { lat, lng }; else delete mem[k]; }
    const was = saved[0] || {};
    const isNew = Number(was.existed) === 0 || (was.old_problem !== null && was.old_problem !== (problem || null));
    if (mismatch && isNew) {
      const head = `:round_pushpin: *Address check: ${loc.sheetName}* (${loc.city})\nSheet says: ${loc.address || '(no address)'}`;
      const pinNote = usedSheet ? "The map pin uses the sheet's address." : lat !== null ? "The map pin uses Google's listing." : 'No map pin for now.';
      await post('SLACK_ALERTS_WEBHOOK', problem === 'no address'
        ? `${head}\nNo address in the sheet, so it has no map pin. Add its address to the Address column.`
        : problem === 'not found'
          ? `${head}\nGoogle couldn't find this restaurant. ${pinNote} Check the Address column.`
          : problem === 'wrong city'
            ? `${head}\nGoogle's closest listing is in another city (${gAddr}). ${pinNote} Check the Address column.`
            : `${head}\nGoogle's listing: ${gAddr} (different ${problem})\n${pinNote} If the sheet is wrong, fix the Address column.`);
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
