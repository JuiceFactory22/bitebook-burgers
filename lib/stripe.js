// Stripe API helpers (plain fetch, no extra packages). Needs STRIPE_SECRET_KEY.
// Webhooks are verified with STRIPE_WEBHOOK_SECRET.
import { createHmac, timingSafeEqual } from 'node:crypto';

const BASE = 'https://api.stripe.com/v1';

// Turn { a: { b: [ { c: 1 } ] } } into Stripe's form encoding: a[b][0][c]=1
function encode(obj, prefix = '', out = []) {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (Array.isArray(v)) v.forEach((item, i) => (typeof item === 'object' ? encode(item, `${key}[${i}]`, out) : out.push([`${key}[${i}]`, String(item)])));
    else if (typeof v === 'object') encode(v, key, out);
    else out.push([key, String(v)]);
  }
  return out;
}

async function stripe(path, { method = 'GET', body, query, idempotencyKey } = {}) {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY is not set');
  const qs = query ? '?' + new URLSearchParams(encode(query)).toString() : '';
  const headers = { Authorization: `Bearer ${key}` };
  if (body) headers['Content-Type'] = 'application/x-www-form-urlencoded';
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
  const res = await fetch(BASE + path + qs, {
    method, headers, body: body ? new URLSearchParams(encode(body)).toString() : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Stripe ${method} ${path} failed (${res.status}): ${json?.error?.message || JSON.stringify(json).slice(0, 300)}`);
  return json;
}

export const isTestKey = () => String(process.env.STRIPE_SECRET_KEY || '').startsWith('sk_test_');

export const createCheckoutSession = (params) => stripe('/checkout/sessions', { method: 'POST', body: params });
export const getCheckoutSession = (id) =>
  stripe(`/checkout/sessions/${encodeURIComponent(id)}`, { query: { expand: ['total_details.breakdown', 'payment_intent.latest_charge'] } });
export const getPaymentIntent = (id) => stripe(`/payment_intents/${encodeURIComponent(id)}`);
export const createRefund = ({ paymentIntent, amount, reason, idempotencyKey }) =>
  stripe('/refunds', { method: 'POST', body: { payment_intent: paymentIntent, amount, metadata: { reason } }, idempotencyKey });

// The promo code a buyer typed, if any (needs the session fetched with total_details.breakdown expanded)
export async function promoCodeFor(session) {
  const d = session?.total_details?.breakdown?.discounts?.[0]?.discount;
  const pc = d?.promotion_code;
  if (!pc) return null;
  if (typeof pc === 'object') return pc.code || pc.id;
  try { return (await stripe(`/promotion_codes/${encodeURIComponent(pc)}`)).code || pc; } catch { return pc; }
}

// Verify the Stripe-Signature header on a webhook (rejects anything older than 5 minutes)
export function verifyWebhook(rawBody, header, secret = process.env.STRIPE_WEBHOOK_SECRET, toleranceSec = 300) {
  if (!secret) throw new Error('STRIPE_WEBHOOK_SECRET is not set');
  const parts = Object.fromEntries(String(header || '').split(',').map((kv) => kv.split('=')).filter((a) => a.length === 2).map(([k, v]) => [k.trim(), v]));
  const sigs = String(header || '').split(',').filter((kv) => kv.trim().startsWith('v1=')).map((kv) => kv.trim().slice(3));
  const t = Number(parts.t);
  if (!t || !sigs.length) return false;
  if (Math.abs(Date.now() / 1000 - t) > toleranceSec) return false;
  const expected = createHmac('sha256', secret).update(`${t}.${rawBody}`).digest('hex');
  return sigs.some((s) => s.length === expected.length && timingSafeEqual(Buffer.from(s), Buffer.from(expected)));
}

export const getSessionLineItems = (id) =>
  stripe(`/checkout/sessions/${encodeURIComponent(id)}/line_items`, { query: { limit: 20 } });
