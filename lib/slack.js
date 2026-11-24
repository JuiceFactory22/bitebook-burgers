// Slack alerts for leads and purchases. Each channel has its own incoming-webhook URL in Vercel:
//   SLACK_LEADS_WEBHOOK      -> leads channel     (spin-wheel coupon claims + "tell me when" email sign-ups)
//   SLACK_PURCHASES_WEBHOOK  -> purchases channel (every paid passport)
//   SLACK_ALERTS_WEBHOOK     -> #site-alerts      (something on the site needs fixing, e.g. the sheet feed is down)
// Each message says where it came from. No URL set = no post. If a post fails, the site carries on as normal.
import { logEvent } from './db.js';

export async function post(envName, text) {
  const url = process.env[envName];
  if (!url) return 'off';
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(4000),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return 'sent';
  } catch (e) {
    try { await logEvent('slack_error', { channel: envName, error: String(e.message || e) }); } catch {}
    return 'failed';
  }
}

const last4 = (phone) => (phone ? `•••${String(phone).replace(/\D/g, '').slice(-4)}` : 'no phone');
const money = (cents) => `$${(Number(cents || 0) / 100).toFixed(2).replace(/\.00$/, '')}`;
// Traffic tag from the link (?src= or ?utm_source=), e.g. "fb-ad", "ig", "dm"
const via = (source) => (source ? ` (via ${source})` : '');

// Every lead, whatever brought it in. `from` says which part of the site it came from.
export function slackLead({ from, name, phone, email, textOk, city, restaurant, source, test = false }) {
  const t = test ? ' _(test)_' : '';
  const who = name ? `${name} (${last4(phone)})` : (email || 'Someone');
  const what = restaurant ? ` won *${restaurant.name}*` : ' signed up';
  return post('SLACK_LEADS_WEBHOOK',
    `:dart: *New lead – ${city.name}*${t}\n${who}${what}` +
    `\nFrom: ${from}${via(source)}${textOk === undefined ? '' : ` · texts OK: ${textOk ? 'yes' : 'no'}`}`);
}

// Every paid passport, whatever page it was bought from.
export function slackPurchase({ name, city, quantity, amountCents, promoCode, fromSpin, source, isTest }) {
  const t = isTest ? ' _(Stripe test mode)_' : '';
  const books = quantity > 1 ? `${quantity} passports` : '1 passport';
  return post('SLACK_PURCHASES_WEBHOOK',
    `:moneybag: *New purchase – ${city.name}*${t}\n${name || 'Someone'} bought ${books} for *${money(amountCents)}*` +
    `\nFrom: ${fromSpin ? 'Spin wheel $20 offer' : 'Website checkout'}${via(source)}${promoCode && !fromSpin ? ` · code ${promoCode}` : ''}`);
}

// Site problems. Each kind of alert posts at most once an hour (per server instance).
// Repeats in that hour are counted and mentioned in the next alert of the same kind.
const lastAlert = {};
const skipped = {};
export function slackAlert(kind, text) {
  const now = Date.now();
  if (lastAlert[kind] && now - lastAlert[kind] < 60 * 60 * 1000) { skipped[kind] = (skipped[kind] || 0) + 1; return Promise.resolve('throttled'); }
  lastAlert[kind] = now;
  const more = skipped[kind] ? `\n_(+${skipped[kind]} more of these since the last alert)_` : '';
  skipped[kind] = 0;
  return post('SLACK_ALERTS_WEBHOOK', `:rotating_light: *Site alert*\n${text}${more}`);
}

// Plain-English names for the error events the site logs (lib/db.js logEvent sends every *_error / *_failed here)
const WHAT = {
  db_error: 'The database is not responding. Sales, coupons and sign-ups may be failing.',
  checkout_error: 'Checkout failed to open for a customer (Stripe).',
  stripe_webhook_error: 'A Stripe payment came in but the site could not finish the order. Stripe will retry; check the order in the dashboard.',
  stripe_bad_metadata: 'A Stripe payment came in without its event/city info, so no passport was made. Check it in Stripe.',
  stripe_email_failed: 'A buyer paid but their confirmation/passport email failed to send.',
  email_failed: 'An email to a customer failed to send.',
  free_coupon_error: 'The spin wheel failed for a visitor (spin or claim).',
  ghl_error: 'Sending a contact to GoHighLevel failed (the sale/coupon itself still went through).',
  meta_capi_failed: 'Sending a purchase to Meta (Conversions API) failed. Ad reporting may be missing a sale.',
  webhook_error: 'A Square payment notice failed to process. Square will retry.',
  nightly_error: 'The nightly job (passport emails/reminders) failed.',
  checkout_reminder_failed: 'An abandoned-checkout reminder email failed to send.',
  restaurant_welcome_error: 'A restaurant welcome email failed to send.',
  signup_notify_error: 'A restaurant sign-up notification failed.',
  held_order_alert_failed: 'The held-order alert email failed to send.',
  unknown_items: 'A Square order had items the site did not recognize.',
  page_error: 'A page on the website crashed for a visitor.',
  passport_page_error: 'A passport PDF failed to load for a customer.',
  coupon_page_error: 'A coupon page failed to load for a customer.',
};

export function alertForEvent(kind, detail) {
  const what = WHAT[kind] || `Something failed on the site (${kind}).`;
  const d = detail && typeof detail === 'object'
    ? Object.entries(detail).filter(([k]) => !/email|phone|name/i.test(k)).map(([k, v]) => `${k}: ${String(typeof v === 'object' ? JSON.stringify(v) : v).slice(0, 160)}`).join(' · ')
    : '';
  return slackAlert(kind, `${what}${d ? `\n\`${d.slice(0, 400)}\`` : ''}`);
}
export function slackAlertCleared(kind, text) {
  if (!lastAlert[kind]) return Promise.resolve('none');
  delete lastAlert[kind];
  return post('SLACK_ALERTS_WEBHOOK', `:white_check_mark: *Fixed*\n${text}`);
}
