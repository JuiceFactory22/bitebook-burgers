// Free single-coupon passports from the spinner page (getbitebook.com/spin/wings/<city>).
// Spin first, contact details second:
//   1. The page shows a wheel of restaurants. Pressing SPIN asks the server to pick the winner from the
//      restaurants on that wheel and saves the result as a "spin" (so the coupon always matches what
//      the person saw land, and nobody can claim a restaurant they didn't win).
//   2. After the celebration, the person enters name/phone/email and the spin is turned into a coupon.
// A free passport is an ordinary passport with source = 'free' and one coupon, so the QR code,
// the redeem page, the dashboard and the redemption tracking all work for it unchanged.
import { randomBytes, randomInt } from 'node:crypto';
import { restaurantsFor } from './restaurants.js';
import { createPassportsForOrder } from './passports.js';
import { query, ensureMultiEventSchema } from './db.js';

export const WHEEL_SIZE = 6;          // restaurants on the wheel (easy to read on a phone)
const SPIN_TTL_HOURS = 48;            // a spin can be claimed for this long (in case they come back later)

let spinsReady = false;
async function ensureSpins() {
  if (spinsReady) return;
  await ensureMultiEventSchema();
  // One row per spin: shows the funnel (spins -> coupons claimed -> passports bought)
  await query(`CREATE TABLE IF NOT EXISTS spins (
    id text PRIMARY KEY,
    event text NOT NULL,
    city text NOT NULL,
    restaurant text NOT NULL,
    source text,
    passport text,
    created_at timestamptz NOT NULL DEFAULT now(),
    claimed_at timestamptz
  )`);
  spinsReady = true;
}

function shuffle(list) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = randomInt(i + 1); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

// The restaurants shown on the wheel when the page loads (a fresh mix each visit)
// A restaurant with several locations (e.g. "Tha Caddy Shack – Briley Pkwy" / "– Downtown") shows up once per wheel;
// which location is random.
export function wheelFor(cityId, eventId) {
  const seen = new Set();
  return shuffle(restaurantsFor(cityId, eventId)).filter((r) => {
    const base = r.name.split(' – ')[0].trim().toLowerCase();
    if (seen.has(base)) return false;
    seen.add(base);
    return true;
  }).slice(0, WHEEL_SIZE);
}

// Spin: pick the winner from the restaurants on the person's wheel and save it.
// `ids` are the restaurants their page showed; anything that isn't a live restaurant for this
// city and event is ignored, and a short or empty list falls back to a fresh wheel.
export async function spinWheel({ cityId, eventId, ids, source }) {
  const all = restaurantsFor(cityId, eventId);
  if (!all.length) return null;
  const byId = new Map(all.map((r) => [r.id, r]));
  let wheel = [...new Set((Array.isArray(ids) ? ids : []).map(String))].map((id) => byId.get(id)).filter(Boolean);
  if (wheel.length < Math.min(WHEEL_SIZE, all.length)) wheel = wheelFor(cityId, eventId);
  wheel = wheel.slice(0, WHEEL_SIZE);
  const pick = randomInt(wheel.length);
  const winner = wheel[pick];
  await ensureSpins();
  const id = `s_${randomBytes(9).toString('base64url')}`;
  await query('INSERT INTO spins (id, event, city, restaurant, source) VALUES ($1, $2, $3, $4, $5)',
    [id, eventId, cityId, winner.id, source ? String(source).slice(0, 80) : null]);
  return { id, wheel, pick, winner };
}

// A saved spin that can still be claimed (unclaimed, recent, same city and event)
export async function openSpin({ spinId, cityId, eventId }) {
  await ensureSpins();
  const rows = await query(
    `SELECT * FROM spins WHERE id = $1 AND city = $2 AND event = $3
       AND created_at > now() - interval '${SPIN_TTL_HOURS} hours'`,
    [String(spinId || ''), cityId, eventId],
  );
  return rows[0] || null;
}

export async function markSpinClaimed(spinId, passportId) {
  await query('UPDATE spins SET passport = $2, claimed_at = now() WHERE id = $1 AND claimed_at IS NULL', [spinId, passportId]);
}

// One free coupon per phone number, per event and city (people are identified by their mobile number;
// the email comes later, from Stripe, if they buy the passport)
export async function existingFreePassport({ cityId, eventId, phone }) {
  const last10 = String(phone || '').replace(/\D/g, '').slice(-10);
  if (last10.length < 10) return null;
  await ensureMultiEventSchema();
  const rows = await query(
    `SELECT * FROM passports WHERE source = 'free' AND city = $1 AND event = $2
       AND regexp_replace(COALESCE(phone, ''), '\\D', '', 'g') LIKE '%' || $3
     ORDER BY created_at LIMIT 1`,
    [cityId, eventId, last10],
  );
  return rows[0] || null;
}

// A free passport by its id (the spin-winner discount on the full passport is tied to it)
export async function freePassportById(id, { cityId, eventId }) {
  if (!id) return null;
  await ensureMultiEventSchema();
  const rows = await query(`SELECT * FROM passports WHERE id = $1 AND source = 'free' AND city = $2 AND event = $3 LIMIT 1`,
    [String(id).slice(0, 80), cityId, eventId]);
  return rows[0] || null;
}

export async function createFreePassport({ cityId, eventId, name, email = null, phone, textOk, restaurantId }) {
  const orderId = `free-${randomBytes(6).toString('hex')}`;
  const [p] = await createPassportsForOrder({
    orderId, books: [cityId], name, email, phone, event: eventId, source: 'free',
    amountPaidCents: 0, textOk, freeRestaurant: restaurantId,
  });
  return p;
}
