// Slack alerts for leads and purchases. Each channel has its own incoming-webhook URL in Vercel:
//   SLACK_LEADS_WEBHOOK      -> leads channel     (spin-wheel coupon claims + "tell me when" email sign-ups)
//   SLACK_PURCHASES_WEBHOOK  -> purchases channel (every paid passport)
// Each message says where it came from. No URL set = no post. If a post fails, the site carries on as normal.
import { logEvent } from './db.js';

async function post(envName, text) {
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
