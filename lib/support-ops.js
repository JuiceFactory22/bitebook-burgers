// Shared customer-support actions (used by the support desk page and the plain-text support tool).
import { query, logEvent } from './db.js';
import { createPassportsForOrder, voidOrder, ensureVoidColumns, passportLabel } from './passports.js';
import { emailOrder, processOrder } from './delivery.js';
import { getOrder, getPayment, refundPayment, searchOrders } from './square.js';
import { SQUARE_LOCATION_ID } from './config.js';

export const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// The Square order behind a passport order id (replacement orders look like "<squareId>~r1")
export const squareOrderId = (orderId) => String(orderId).split('~')[0];

// Search passports by email, name or order id; grouped by order
export async function findOrders(raw) {
  await ensureVoidColumns();
  // Phones often paste invisible characters, spaces or "mailto:" along with an email. Strip them.
  let q = String(raw || '')
    .replace(/[\u200B-\u200F\u2060\uFEFF]/g, '')
    .replace(/\u00A0/g, ' ')
    .replace(/^\s*mailto:/i, '')
    .replace(/[<>"“”]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (q.includes('@')) q = q.replace(/\s/g, ''); // emails never contain spaces; names can
  if (q.length < 3) return [];
  const local = q.includes('@') ? q.split('@')[0] : q; // fall back to the part before @ if the domain was mistyped
  const found = await searchPassports(q);
  return found.length || local === q || local.length < 4 ? found : searchPassports(local);
}

async function searchPassports(q) {
  const rows = await query(
    `SELECT p.*, (SELECT count(*) FROM coupons c WHERE c.passport_id = p.id AND c.redeemed_at IS NOT NULL) AS used
     FROM passports p
     WHERE p.email ILIKE $1 OR p.name ILIKE $1 OR p.order_id = $2 OR p.order_id LIKE $3
     ORDER BY p.created_at, p.book_index LIMIT 40`, [`%${q}%`, q, `${q}~%`]);
  const byOrder = new Map();
  for (const p of rows) {
    if (!byOrder.has(p.order_id)) byOrder.set(p.order_id, []);
    byOrder.get(p.order_id).push(p);
  }
  return [...byOrder.entries()].map(([orderId, passports]) => ({ orderId, passports }));
}

export async function usedCoupons(passportIds) {
  if (!passportIds.length) return [];
  return query(
    `SELECT token, passport_id, restaurant_id, redeemed_at FROM coupons
     WHERE redeemed_at IS NOT NULL AND passport_id = ANY(string_to_array($1, ','))
     ORDER BY redeemed_at`, [passportIds.join(',')]);
}

// Payment for an order, with a strict check that it belongs to the BiteBook location
export async function paymentForOrder(orderId) {
  const sqId = squareOrderId(orderId);
  if (sqId.startsWith('test-')) return { test: true };
  let order;
  try { order = await getOrder(sqId); } catch { return { error: 'Square order not found' }; }
  const tender = (order.tenders || [])[0];
  if (!tender?.payment_id) return { error: 'No payment on this order' };
  const p = await getPayment(tender.payment_id);
  if (!p) return { error: 'Payment not found' };
  const paid = p.amount_money?.amount || 0;
  const refunded = p.refunded_money?.amount || 0;
  const bitebook = p.location_id === SQUARE_LOCATION_ID && order.location_id === SQUARE_LOCATION_ID;
  return {
    paymentId: p.id, paid, refunded, refundable: bitebook && p.status === 'COMPLETED' ? Math.max(0, paid - refunded) : 0,
    bitebook, status: p.status, card: p.card_details?.card ? `${p.card_details.card.card_brand} ending ${p.card_details.card.last_4}` : '',
    createdAt: p.created_at,
  };
}

// Full refund of whatever is left on the payment. Refuses anything outside the BiteBook location.
export async function refundOrder(orderId, { by = 'desk', feedback = '' } = {}) {
  const pay = await paymentForOrder(orderId);
  if (pay.test) throw new Error('Test order: nothing to refund');
  if (pay.error) throw new Error(pay.error);
  if (!pay.bitebook) throw new Error('This payment is not from the BiteBook Square location. Refund refused.');
  if (!pay.refundable) throw new Error('Nothing left to refund on this payment');
  const refund = await refundPayment({
    paymentId: pay.paymentId, amount: pay.refundable,
    reason: 'BiteBook refund (customer request)',
    idempotencyKey: `desk-${pay.paymentId}-${pay.refunded}`, // a double click can't refund twice
  });
  await logEvent('desk_refund', { by, order: orderId, payment: pay.paymentId, amount: pay.refundable, refund: refund?.id, status: refund?.status, feedback });
  return { amount: pay.refundable, status: refund?.status };
}

export async function cancelOrder(orderId, reason, { by = 'desk' } = {}) {
  const done = await voidOrder(orderId, reason);
  await logEvent('desk_cancel', { by, order: orderId, reason, passports: done.map((p) => p.id) });
  return done;
}

// Cancel the passports on an order and send a fresh set to a new email
export async function reissueOrder(orderId, email, { by = 'desk' } = {}) {
  if (!EMAIL_RE.test(email)) throw new Error('That email address doesn’t look right');
  const old = await query('SELECT * FROM passports WHERE order_id = $1 AND voided_at IS NULL ORDER BY book_index', [orderId]);
  if (!old.length) throw new Error('No active passports on that order');
  const base = squareOrderId(orderId);
  const prior = await query('SELECT count(DISTINCT order_id) AS n FROM passports WHERE order_id LIKE $1', [`${base}~r%`]);
  const newOrder = `${base}~r${Number(prior[0].n) + 1}`;
  const fresh = await createPassportsForOrder({
    orderId: newOrder, books: old.map((p) => p.city), name: old[0].name, email, phone: old[0].phone, isTest: Number(old[0].is_test) === 1,
  });
  await voidOrder(orderId, `reissued to ${newOrder}`);
  const sent = await emailOrder(newOrder);
  await logEvent('desk_reissue', { by, from: orderId, to: newOrder, email, sent: sent.status });
  return { oldLabels: old.map((p) => passportLabel(p.id)), newLabels: fresh.map((p) => passportLabel(p.id)), newOrder, sent: sent.status };
}

export async function resendOrder(orderId, { by = 'desk' } = {}) {
  const active = await query('SELECT count(*) AS n FROM passports WHERE order_id = $1 AND voided_at IS NULL', [orderId]);
  if (!Number(active[0].n)) throw new Error('This passport is cancelled, so there is nothing to resend');
  const out = await emailOrder(orderId, { force: true });
  await logEvent('desk_resend', { by, order: orderId, status: out.status, to: out.to });
  return out;
}

export async function undoCoupon(token, { by = 'desk' } = {}) {
  const rows = await query('UPDATE coupons SET redeemed_at = NULL WHERE token = $1 RETURNING *', [token]);
  await logEvent('desk_undo', { by, token });
  return rows[0] || null;
}

// Look for paid Square orders from the last few days that never became passports, create them, and email them
export async function catchUpMissing({ days = 5, by = 'desk' } = {}) {
  const since = new Date(Date.now() - days * 864e5).toISOString();
  const orders = await searchOrders(since);
  let created = 0, sent = 0;
  for (const o of orders) {
    const existing = await query('SELECT count(*) AS n FROM passports WHERE order_id = $1 OR order_id LIKE $2', [o.id, `${o.id}~%`]);
    if (Number(existing[0].n)) continue;
    const r = await processOrder(o);
    if (r.status !== 'ok') continue;
    created++;
    const e = await emailOrder(o.id);
    if (e.status === 'sent') sent++;
  }
  await logEvent('desk_catchup', { by, created, sent });
  return { created, sent };
}

export async function recentDeskActions(limit = 15) {
  return query(`SELECT at, kind, detail FROM events WHERE kind LIKE 'desk_%' ORDER BY id DESC LIMIT $1::int`, [String(limit)]);
}
