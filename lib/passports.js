import { randomBytes } from 'node:crypto';
import { query } from './db.js';
import { restaurantsFor } from './restaurants.js';

// Unambiguous characters (no 0/O, 1/l/I)
const ALPHABET = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function randomId(len) {
  const bytes = randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}
export const newPassportId = () => 'bb' + randomId(14);
export const newToken = () => randomId(12);

// Short, readable passport number for printing, e.g. "BB-7K4Q"
export const passportLabel = (id) => 'BB-' + id.slice(2, 6).toUpperCase();

export async function getPassport(id) {
  const rows = await query('SELECT * FROM passports WHERE id = $1', [id]);
  return rows[0] || null;
}

// Create passports for an order (idempotent per order + book number)
export async function createPassportsForOrder({ orderId, books, name, email, phone, isTest = false }) {
  // books: array of city ids, one entry per book purchased
  const passports = [];
  for (let i = 0; i < books.length; i++) {
    const rows = await query(
      `INSERT INTO passports (id, order_id, book_index, city, name, email, phone, is_test)
       VALUES ($1, $2, $3::int, $4, $5, $6, $7, $8::int)
       ON CONFLICT (order_id, book_index) DO UPDATE SET order_id = EXCLUDED.order_id
       RETURNING *, (xmax = 0) AS inserted`,
      [newPassportId(), orderId, String(i), books[i], name || null, email || null, phone || null, isTest ? '1' : '0'],
    );
    const p = rows[0];
    await ensureCoupons(p);
    passports.push(p);
  }
  return passports;
}

// Make sure the passport has one coupon per active restaurant in its city.
// Called whenever a passport is opened, so newly added restaurants appear automatically.
export async function ensureCoupons(passport) {
  const list = restaurantsFor(passport.city);
  if (list.length) {
    const values = [];
    const params = [];
    list.forEach((r, i) => {
      values.push(`($${i * 3 + 1}, $${i * 3 + 2}, $${i * 3 + 3})`);
      params.push(newToken(), passport.id, r.id);
    });
    await query(
      `INSERT INTO coupons (token, passport_id, restaurant_id) VALUES ${values.join(', ')}
       ON CONFLICT (passport_id, restaurant_id) DO NOTHING`,
      params,
    );
  }
  return query('SELECT * FROM coupons WHERE passport_id = $1', [passport.id]);
}

export async function getCoupon(token) {
  const rows = await query(
    `SELECT c.*, p.city, p.name, p.is_test, p.id AS passport_id, to_jsonb(p)->>'voided_at' AS voided_at
     FROM coupons c JOIN passports p ON p.id = c.passport_id
     WHERE c.token = $1`,
    [token],
  );
  return rows[0] || null;
}

// Atomically redeem; returns the updated row, or null if it was already redeemed
export async function redeemCoupon(token) {
  const rows = await query(
    `UPDATE coupons SET redeemed_at = now() WHERE token = $1 AND redeemed_at IS NULL RETURNING *`,
    [token],
  );
  return rows[0] || null;
}

export async function undoRedemption(token) {
  const rows = await query(`UPDATE coupons SET redeemed_at = NULL WHERE token = $1 RETURNING *`, [token]);
  return rows[0] || null;
}

// Support: cancel every passport on an order (coupons stop working, the PDF link shows 'cancelled')
export async function ensureVoidColumns() {
  await query('ALTER TABLE passports ADD COLUMN IF NOT EXISTS voided_at TIMESTAMPTZ');
  await query('ALTER TABLE passports ADD COLUMN IF NOT EXISTS void_reason TEXT');
}

export async function voidOrder(orderId, reason) {
  await ensureVoidColumns();
  return query('UPDATE passports SET voided_at = now(), void_reason = $2 WHERE order_id = $1 AND voided_at IS NULL RETURNING id, city, name, email', [orderId, reason]);
}
