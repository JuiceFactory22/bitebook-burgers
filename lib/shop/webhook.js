// Stripe calls this after checkout events. Every call is verified with STRIPE_WEBHOOK_SECRET.
//   checkout.session.completed / async_payment_succeeded -> create passports + "you're in" email
//   checkout.session.expired                             -> mark the checkout abandoned (for follow-up)
// Before an event starts, passports are created but held; they're emailed at kickoff
// (/api/admin?action=send&event=<id>). Once an event has started, they're emailed right away.
import { verifyWebhook, getCheckoutSession, getSessionLineItems, promoCodeFor } from '../stripe.js';
import { createPassportsForOrder } from '../passports.js';
import { emailOrder } from '../delivery.js';
import { sendPurchaseConfirmation, sendCheckoutReminder } from '../email.js';
import { query, logEvent, ensureMultiEventSchema } from '../db.js';
import { EVENTS, CITIES, eventWindow } from '../config.js';
import { sendPurchase } from '../meta.js';
import { syncPurchase, syncAbandoned } from '../ghl.js';
import { slackPurchase } from '../slack.js';

// Texts are opt-out (Nov 24, 2026): anyone who gave a phone number can be texted and replies STOP to leave.
const textOptIn = (s) => Boolean(s.customer_details?.phone);


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
  // Spin-winner discount has no Stripe promo code; record it as SPIN<pct> (e.g. SPIN20) so it shows like one (GHL, dashboard)
  const promoCode = (await promoCodeFor(s)) || (/^spin\d+$/.test(s.metadata?.offer || '') ? s.metadata.offer.toUpperCase() : null);
  const isTest = s.livemode === false;

  const textOk = textOptIn(s);
  const passports = await createPassportsForOrder({
    orderId: s.id, books: Array(quantity).fill(city.id), name: d.name, email: d.email, phone: d.phone, isTest,
    event: ev.id, source: 'stripe', marketingOk, promoCode, amountPaidCents: s.amount_total, textOk,
  });

  // Record the sale on the checkout row and claim the confirmation email (exactly once, even if Stripe retries)
  await ensureMultiEventSchema();
  const claimed = await query(
    `INSERT INTO checkouts (id, event, city, status, is_test, source, email, name, phone, marketing_ok, quantity, amount_cents, promo_code, completed_at, text_ok)
     VALUES ($1, $2, $3, 'paid', $4::int, $5, $6, $7, $8, $9::int, $10::int, $11::int, $12, now(), $13::int)
     ON CONFLICT (id) DO UPDATE SET status = 'paid', email = EXCLUDED.email, name = EXCLUDED.name, phone = EXCLUDED.phone,
       marketing_ok = EXCLUDED.marketing_ok, quantity = EXCLUDED.quantity, amount_cents = EXCLUDED.amount_cents,
       promo_code = EXCLUDED.promo_code, completed_at = now(), text_ok = EXCLUDED.text_ok
     WHERE checkouts.status <> 'paid'
     RETURNING id`,
    [s.id, ev.id, city.id, isTest ? '1' : '0', s.metadata?.source || null, d.email || null, d.name || null, d.phone || null,
      marketingOk === null ? null : (marketingOk ? '1' : '0'), String(quantity), String(s.amount_total ?? 0), promoCode, textOk ? '1' : '0'],
  );
  if (!claimed.length) return { status: 'already_done', passports: passports.length };

  let email = 'none';
  if (d.email) {
    const started = new Date() >= eventWindow(city.id, ev.id).start;
    try {
      if (started) email = (await emailOrder(s.id)).status; // event is live: send the passports now
      else { await sendPurchaseConfirmation({ to: d.email, name: d.name, ev, city, quantity, amountCents: s.amount_total, passports }); email = 'confirmation_sent'; }
    } catch (e) {
      email = 'failed';
      await logEvent('stripe_email_failed', { session: s.id, error: String(e.message || e) });
    }
  }
  await logEvent('stripe_sale', { session: s.id, event: ev.id, city: city.id, quantity, amount: s.amount_total, promo: promoCode, test: isTest, email });
  const meta = await sendPurchase(s, { ev, city, quantity, url: `https://www.getbitebook.com/${ev.slug}/${city.id}` });
  // GHL last, after the buyer's email is out: contact, tags, fields and the Buyers card.
  // Never blocks the sale; errors are logged as 'ghl_error'.
  const ghl = await syncPurchase({
    cityId: city.id, ev, name: d.name, email: d.email, phone: d.phone, orderId: s.id,
    amountCents: s.amount_total, promoCode, textOptIn: textOk, passports, isTest,
  });
  const slack = await slackPurchase({
    name: d.name, city, quantity, amountCents: s.amount_total, promoCode, isTest, source: s.metadata?.source,
    fromSpin: /^spin\d+$/.test(s.metadata?.offer || ''),
  });
  return { status: 'ok', passports: passports.length, email, meta, ghl, slack };
}

async function markExpired(sessionObj) {
  await ensureMultiEventSchema();
  const d = sessionObj.customer_details || {};
  const optedIn = sessionObj.consent?.promotions === 'opt_in';
  const textOk = textOptIn(sessionObj);
  await query(
    `UPDATE checkouts SET status = 'abandoned', expired_at = now(), email = COALESCE($2, email), name = COALESCE($3, name),
       phone = COALESCE($4, phone), marketing_ok = COALESCE($5::int, marketing_ok)
     WHERE id = $1 AND status = 'started'`,
    [sessionObj.id, d.email || null, d.name || null, d.phone || null, optedIn ? '1' : null],
  );

  // Reminder email: to anyone who gave an email (opted in or not) and hasn't bought this event since.
  // US email law allows this with a postal address and an opt-out in the email (see sendCheckoutReminder).
  const ev = EVENTS[sessionObj.metadata?.event];
  const city = CITIES[sessionObj.metadata?.city];
  if (!d.email || !ev || !city || !ev.onSale) return 'abandoned';
  const boughtAlready = await query(
    `SELECT 1 FROM checkouts WHERE lower(email) = lower($1) AND event = $2 AND status = 'paid' LIMIT 1`, [d.email, ev.id]);
  if (!boughtAlready.length) await syncAbandoned({ cityId: city.id, ev, name: d.name, email: d.email, phone: d.phone, textOptIn: textOk });
  if (new Date() >= eventWindow(city.id, ev.id).end) return 'abandoned';
  const bought = await query(
    `SELECT 1 FROM checkouts WHERE lower(email) = lower($1) AND event = $2 AND status = 'paid' LIMIT 1`, [d.email, ev.id]);
  if (bought.length) return 'abandoned_already_bought';
  const claimed = await query(
    `UPDATE checkouts SET recovery_sent_at = now() WHERE id = $1 AND recovery_sent_at IS NULL RETURNING id`, [sessionObj.id]);
  if (!claimed.length) return 'abandoned_reminder_already_sent';
  // One reminder per person per event, even if they abandoned several times
  const earlier = await query(
    `SELECT 1 FROM checkouts WHERE lower(email) = lower($1) AND event = $2 AND recovery_sent_at IS NOT NULL AND id <> $3 LIMIT 1`,
    [d.email, ev.id, sessionObj.id]);
  if (earlier.length) return 'abandoned_reminder_already_sent';
  try {
    await sendCheckoutReminder({ to: d.email, name: d.name, ev, city, url: `https://www.getbitebook.com/${ev.slug}/${city.id}?src=reminder` });
    await logEvent('checkout_reminder_sent', { session: sessionObj.id, event: ev.id, city: city.id });
    return 'abandoned_reminder_sent';
  } catch (e) {
    await logEvent('checkout_reminder_failed', { session: sessionObj.id, error: String(e.message || e) });
    return 'abandoned_reminder_failed';
  }
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
      const status = await markExpired(obj);
      return res.status(200).json({ ok: true, status });
    }
    return res.status(200).json({ ignored: event.type });
  } catch (e) {
    console.error(e);
    await logEvent('stripe_webhook_error', { type: event.type, id: obj.id, error: String(e.message || e) });
    return res.status(500).json({ ok: false }); // Stripe retries later
  }
}
