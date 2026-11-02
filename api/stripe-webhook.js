// Stripe calls this after checkout events. Every call is verified with STRIPE_WEBHOOK_SECRET.
//   checkout.session.completed / async_payment_succeeded -> create passports + "you're in" email
//   checkout.session.expired                             -> mark the checkout abandoned (for follow-up)
// Before an event starts, passports are created but held; they're emailed at kickoff
// (/api/admin?action=send&event=<id>). Once an event has started, they're emailed right away.
import { verifyWebhook, getCheckoutSession, getSessionLineItems, promoCodeFor } from '../lib/stripe.js';
import { createPassportsForOrder } from '../lib/passports.js';
import { emailOrder } from '../lib/delivery.js';
import { sendPurchaseConfirmation } from '../lib/email.js';
import { query, logEvent, ensureMultiEventSchema } from '../lib/db.js';
import { EVENTS, CITIES, eventWindow } from '../lib/config.js';

export const config = { api: { bodyParser: false } };

// The signature covers the exact bytes Stripe sent, so read the raw stream before anything parses it.
// (Don't touch req.body first; Vercel parses it lazily.)
async function rawBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(typeof c === 'string' ? Buffer.from(c) : c);
  if (chunks.length) return Buffer.concat(chunks).toString('utf8');
  if (typeof req.body === 'string') return req.body;
  if (Buffer.isBuffer(req.body)) return req.body.toString('utf8');
  return '';
}

async function fulfill(sessionId) {
  const s = await getCheckoutSession(sessionId);
  if (!(s.payment_status === 'paid' || s.payment_status === 'no_payment_required')) return { status: 'not_paid' };
  const ev = EVENTS[s.metadata?.event];
  const city = CITIES[s.metadata?.city];
  if (!ev || !city) { await logEvent('stripe_bad_metadata', { session: s.id, metadata: s.metadata }); return { status: 'bad_metadata' }; }

  const items = await getSessionLineItems(s.id);
  const quantity = (items.data || []).reduce((n, li) => n + Number(li.quantity || 0), 0) || 1;
  const d = s.customer_details || {};
  const marketingOk = s.consent?.promotions === 'opt_in' ? true : (s.consent?.promotions === 'opt_out' ? false : null);
  const promoCode = await promoCodeFor(s);
  const isTest = s.livemode === false;

  const passports = await createPassportsForOrder({
    orderId: s.id, books: Array(quantity).fill(city.id), name: d.name, email: d.email, phone: d.phone, isTest,
    event: ev.id, source: 'stripe', marketingOk, promoCode, amountPaidCents: s.amount_total,
  });

  // Record the sale on the checkout row and claim the confirmation email (exactly once, even if Stripe retries)
  await ensureMultiEventSchema();
  const claimed = await query(
    `INSERT INTO checkouts (id, event, city, status, is_test, source, email, name, phone, marketing_ok, quantity, amount_cents, promo_code, completed_at)
     VALUES ($1, $2, $3, 'paid', $4::int, $5, $6, $7, $8, $9::int, $10::int, $11::int, $12, now())
     ON CONFLICT (id) DO UPDATE SET status = 'paid', email = EXCLUDED.email, name = EXCLUDED.name, phone = EXCLUDED.phone,
       marketing_ok = EXCLUDED.marketing_ok, quantity = EXCLUDED.quantity, amount_cents = EXCLUDED.amount_cents,
       promo_code = EXCLUDED.promo_code, completed_at = now()
     WHERE checkouts.status <> 'paid'
     RETURNING id`,
    [s.id, ev.id, city.id, isTest ? '1' : '0', s.metadata?.source || null, d.email || null, d.name || null, d.phone || null,
      marketingOk === null ? null : (marketingOk ? '1' : '0'), String(quantity), String(s.amount_total ?? 0), promoCode],
  );
  if (!claimed.length) return { status: 'already_done', passports: passports.length };

  let email = 'none';
  if (d.email) {
    const started = new Date() >= eventWindow(city.id, ev.id).start;
    try {
      if (started) email = (await emailOrder(s.id)).status; // event is live: send the passports now
      else { await sendPurchaseConfirmation({ to: d.email, name: d.name, ev, city, quantity, amountCents: s.amount_total }); email = 'confirmation_sent'; }
    } catch (e) {
      email = 'failed';
      await logEvent('stripe_email_failed', { session: s.id, error: String(e.message || e) });
    }
  }
  await logEvent('stripe_sale', { session: s.id, event: ev.id, city: city.id, quantity, amount: s.amount_total, promo: promoCode, test: isTest, email });
  return { status: 'ok', passports: passports.length, email };
}

async function markExpired(sessionObj) {
  await ensureMultiEventSchema();
  const d = sessionObj.customer_details || {};
  await query(
    `UPDATE checkouts SET status = 'abandoned', expired_at = now(), email = COALESCE($2, email), name = COALESCE($3, name),
       phone = COALESCE($4, phone), marketing_ok = COALESCE($5::int, marketing_ok)
     WHERE id = $1 AND status = 'started'`,
    [sessionObj.id, d.email || null, d.name || null, d.phone || null,
      sessionObj.consent?.promotions === 'opt_in' ? '1' : null],
  );
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(200).json({ ok: true });
  let body;
  try { body = await rawBody(req); } catch { return res.status(400).json({ error: 'Unreadable body' }); }
  let ok = false;
  try { ok = verifyWebhook(body, req.headers['stripe-signature']); } catch (e) { console.error(e); }
  if (!ok) return res.status(400).json({ error: 'Bad signature' });

  let event;
  try { event = JSON.parse(body); } catch { return res.status(400).json({ error: 'Bad JSON' }); }
  const obj = event?.data?.object || {};
  try {
    if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
      const r = await fulfill(obj.id);
      return res.status(200).json({ ok: true, ...r });
    }
    if (event.type === 'checkout.session.expired') {
      await markExpired(obj);
      return res.status(200).json({ ok: true, status: 'abandoned' });
    }
    return res.status(200).json({ ignored: event.type });
  } catch (e) {
    console.error(e);
    await logEvent('stripe_webhook_error', { type: event.type, id: obj.id, error: String(e.message || e) });
    return res.status(500).json({ ok: false }); // Stripe retries later
  }
}
