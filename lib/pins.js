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
const PER_RUN = 4;

async function ensureTable() {
  if (tableReady) return;
  await query(`CREATE TABLE IF NOT EXISTS pin_cache (
    key text PRIMARY KEY, lat double precision, lng double precision,
    google_name text, google_address text, place_id text, website text,
    mismatch boolean NOT NULL DEFAULT false, checked_at timestamptz NOT NULL DEFAULT now())`);
  tableReady = true;
}

export const pinKey = (loc) => (loc.placeId ? `place:${loc.placeId}` : `addr:${String(loc.address || '').toLowerCase().replace(/[^a-z0-9]/g, '')}`);

export async function savedPins() {
  if (mem) return mem;
  try {
    await ensureTable();
    const rows = await query('SELECT key, lat, lng FROM pin_cache');
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
    body: JSON.stringify({ textQuery: `${loc.sheetName} ${loc.address}`, maxResultCount: 1 }),
    signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) throw new Error(`Google ${r.status}`);
  return (await r.json()).places?.[0] || null;
}

// Same street number and same ZIP (when both have one) = same place
function sameAddress(sheet, google) {
  const num = (s) => (String(s || '').match(/^\s*(\d+)/) || [])[1];
  const zip = (s) => (String(s || '').match(/\b(\d{5})\b(?!.*\b\d{5}\b)/) || [])[1];
  if (num(sheet) && num(google) && num(sheet) !== num(google)) return false;
  if (zip(sheet) && zip(google) && zip(sheet) !== zip(google)) return false;
  return true;
}

async function fill(loc) {
  const k = pinKey(loc);
  if (inFlight.has(k)) return;
  inFlight.add(k);
  try {
    const p = await lookup(loc);
    await ensureTable();
    const lat = p?.location?.latitude ?? null;
    const lng = p?.location?.longitude ?? null;
    const gAddr = (p?.formattedAddress || '').replace(/,\s*USA$/, '');
    const mismatch = !p || !sameAddress(loc.address, gAddr);
    const ins = await query(
      `INSERT INTO pin_cache (key, lat, lng, google_name, google_address, place_id, website, mismatch)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT (key) DO NOTHING RETURNING key`,
      [k, lat, lng, p?.displayName?.text || null, gAddr || null, p?.id || null, p?.websiteUri || null, mismatch],
    );
    checked.add(k);
    if (lat !== null && mem) mem[k] = { lat, lng };
    if (ins.length && mismatch) {
      await post('SLACK_ALERTS_WEBHOOK', p
        ? `:round_pushpin: *Address check: ${loc.sheetName}* (${loc.city})\nSheet says: ${loc.address}\nGoogle says: ${gAddr}\nThe map uses Google's location. If the sheet is wrong, fix the Address column.`
        : `:round_pushpin: *Address check: ${loc.sheetName}* (${loc.city})\nGoogle couldn't find "${loc.address}", so this restaurant has no map pin. Check the Address column.`);
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
  const todo = locs.filter((l) => !checked.has(pinKey(l)) && (l.placeId || l.address) && !inFlight.has(pinKey(l))).slice(0, PER_RUN);
  if (!todo.length) return;
  const p = (async () => { for (const l of todo) await fill(l); })();
  const ctx = globalThis[Symbol.for('@vercel/request-context')]?.get?.();
  if (ctx?.waitUntil) ctx.waitUntil(p); else p.catch(() => {});
}
