// Square API helpers (plain fetch). Needs SQUARE_ACCESS_TOKEN.
import { SQUARE_LOCATION_ID, cityForItem } from './config.js';

const BASE = 'https://connect.squareup.com/v2';

async function sq(path, { method = 'GET', body } = {}) {
  const token = process.env.SQUARE_ACCESS_TOKEN;
  if (!token) throw new Error('SQUARE_ACCESS_TOKEN is not set');
  const res = await fetch(BASE + path, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Square-Version': '2025-01-23',
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Square ${method} ${path} failed (${res.status}): ${JSON.stringify(json.errors || json).slice(0, 300)}`);
  return json;
}

export const getPayment = async (id) => {
  try {
    return (await sq(`/payments/${encodeURIComponent(id)}`)).payment;
  } catch (e) {
    if (String(e.message).includes('(404)')) return null; // e.g. Square's "send test event"
    throw e;
  }
};
export const getOrder = async (id) => (await sq(`/orders/${encodeURIComponent(id)}`)).order;

// All orders at the BiteBook location since a date (paginated)
export async function searchOrders(sinceIso) {
  const orders = [];
  let cursor;
  do {
    const json = await sq('/orders/search', {
      method: 'POST',
      body: {
        location_ids: [SQUARE_LOCATION_ID],
        query: {
          filter: {
            date_time_filter: { created_at: { start_at: sinceIso } },
            state_filter: { states: ['OPEN', 'COMPLETED'] },
          },
          sort: { sort_field: 'CREATED_AT', sort_order: 'ASC' },
        },
        limit: 100,
        cursor,
      },
    });
    orders.push(...(json.orders || []));
    cursor = json.cursor;
  } while (cursor);
  return orders;
}

// A purchase counts only if it was actually paid in full (abandoned checkouts have no tenders)
export function isPaid(order) {
  if (!order || order.location_id !== SQUARE_LOCATION_ID) return false;
  if (order.state === 'CANCELED') return false;
  if (!order.tenders || order.tenders.length === 0) return false;
  if ((order.net_amount_due_money?.amount ?? 1) !== 0) return false;
  if ((order.refunds || []).some((r) => r.status === 'COMPLETED' || r.status === 'PENDING')) return false;
  return true;
}

// Turn a paid order into { books: [cityId,...], name, email, phone, unknownItems }
export function orderDetails(order, paymentFallback = {}) {
  const books = [];
  const unknownItems = [];
  for (const li of order.line_items || []) {
    const city = cityForItem(li.name);
    const qty = Math.max(0, parseInt(li.quantity || '0', 10));
    if (!city) { unknownItems.push(li.name); continue; }
    for (let i = 0; i < qty; i++) books.push(city.id);
  }
  let recipient = {};
  for (const f of order.fulfillments || []) {
    const d = f.shipment_details || f.pickup_details || f.digital_details || f.delivery_details;
    if (d?.recipient) { recipient = d.recipient; break; }
  }
  return {
    books,
    unknownItems,
    name: (recipient.display_name || '').trim() || null,
    email: recipient.email_address || paymentFallback.buyer_email_address || null,
    phone: recipient.phone_number || null,
  };
}

// What the website's Square token is allowed to do (scopes are listed for OAuth tokens;
// a personal access token has full access to its own account and may list none).
export async function tokenStatus() {
  const res = await fetch('https://connect.squareup.com/oauth2/token/status', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.SQUARE_ACCESS_TOKEN}`, 'Square-Version': '2025-01-23', 'Content-Type': 'application/json' },
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

// Refund a payment. Callers must check the payment belongs to the BiteBook location first.
export async function refundPayment({ paymentId, amount, currency = 'USD', reason, idempotencyKey }) {
  return (await sq('/refunds', {
    method: 'POST',
    body: { idempotency_key: idempotencyKey, payment_id: paymentId, amount_money: { amount, currency }, reason },
  })).refund;
}
