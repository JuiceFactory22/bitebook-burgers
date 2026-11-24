// Slack alerts for the spin funnel. Each channel has its own incoming-webhook URL in Vercel:
//   SLACK_LEADS_WEBHOOK      -> #spin-wheel-leads     (a free coupon is claimed)
//   SLACK_PURCHASES_WEBHOOK  -> #spin-wheel-purchases (a passport is paid for)
// No URL set = no post. A Slack failure never blocks a claim or a sale.
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

export function slackLead({ name, phone, textOk, city, restaurant, test = false }) {
  const t = test ? ' _(test number)_' : '';
  return post('SLACK_LEADS_WEBHOOK',
    `:dart: *New spin lead – ${city.name}*${t}\n${name} (${last4(phone)}) won *${restaurant.name}*` +
    `\nTexts OK: ${textOk ? 'yes' : 'no'}`);
}

export function slackPurchase({ name, city, quantity, amountCents, promoCode, fromSpin, isTest }) {
  const t = isTest ? ' _(Stripe test mode)_' : '';
  const books = quantity > 1 ? `${quantity} passports` : '1 passport';
  return post('SLACK_PURCHASES_WEBHOOK',
    `:moneybag: *New purchase – ${city.name}*${t}\n${name || 'Someone'} bought ${books} for *${money(amountCents)}*` +
    `\n${fromSpin ? 'From the spin wheel' : 'Regular checkout'}${promoCode ? ` · code ${promoCode}` : ''}`);
}
