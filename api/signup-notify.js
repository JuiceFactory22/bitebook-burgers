// Emails the team when a restaurant submits the sign-up or "save your spot" form.
// The forms still send their answers to the Google sheet as before; this is only the alert.
// To change who gets these emails, edit NOTIFY_TO below.
import { query, logEvent } from '../lib/db.js';
import { esc } from '../lib/html.js';
import { FROM_EMAIL } from '../lib/config.js';

const NOTIFY_TO = ['carol@getbitebook.com'];
const MAX_PER_HOUR = 30; // safety cap so junk submissions can't flood the inbox

const FIELDS = [
  ['location', 'City'], ['event', 'Event'], ['restaurantName', 'Restaurant'], ['instagram', 'Instagram'],
  ['address', 'Address'], ['primaryName', 'Contact'], ['primaryPhone', 'Phone'], ['primaryEmail', 'Email'],
  ['primaryMethod', 'Best way to reach'], ['secondaryName', 'Second contact'], ['secondaryPhone', 'Second phone'],
  ['secondaryEmail', 'Second email'], ['secondaryMethod', 'Second contact method'], ['couponDetails', 'Notes / deal details'],
];
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ ok: false });
  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch { b = {}; } }
  b = b || {};
  const v = {};
  for (const [k] of FIELDS) v[k] = String(b[k] ?? '').trim().slice(0, k === 'couponDetails' ? 1000 : 200);
  if (b.formType !== 'restaurant_signup' || !v.restaurantName) return res.status(400).json({ ok: false });

  try {
    // Skip exact repeats (double taps) and cap the hourly volume
    const key = `${v.restaurantName.toLowerCase()}|${v.location.toLowerCase()}|${v.event.toLowerCase()}`;
    const recent = await query(
      `SELECT detail FROM events WHERE kind = 'signup_notify' AND at > now() - interval '1 hour'`);
    if (recent.length >= MAX_PER_HOUR) { await logEvent('signup_notify_capped', { key }); return res.json({ ok: true, skipped: 'cap' }); }
    if (recent.some((r) => { try { return JSON.parse(r.detail).key === key; } catch { return false; } })) return res.json({ ok: true, skipped: 'repeat' });

    const spot = /spot reserved/i.test(v.event);
    const subject = `${spot ? 'Spot reserved' : 'New sign-up'}: ${v.restaurantName}${v.location ? ` (${v.location})` : ''}`;
    const rows = FIELDS.filter(([k]) => v[k]).map(([k, label]) =>
      `<tr><td style="padding:6px 10px 6px 0;color:#5E5246;white-space:nowrap;vertical-align:top">${esc(label)}</td><td style="padding:6px 0">${esc(v[k])}</td></tr>`).join('');
    const html = `<div style="font-family:Helvetica,Arial,sans-serif;color:#1F1A15;font-size:15px;line-height:1.5">
<p style="margin:0 0 12px"><b>${esc(v.restaurantName)}</b> just submitted the ${spot ? '"save your spot" form' : 'restaurant sign-up form'}.</p>
<table cellpadding="0" cellspacing="0" style="border-collapse:collapse">${rows}</table>
<p style="margin:16px 0 0;color:#5E5246">Next step: ${spot ? 'move their card to <b>Spot Reserved</b> and set up the follow-up call.' : 'update their card in the Restaurant Pipeline.'} It's also saved in the sign-up sheet.</p></div>`;
    const text = [`${v.restaurantName} submitted the ${spot ? '"save your spot"' : 'sign-up'} form.`, '',
      ...FIELDS.filter(([k]) => v[k]).map(([k, label]) => `${label}: ${v[k]}`)].join('\n');

    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM_EMAIL, to: NOTIFY_TO, subject, html, text, ...(EMAIL_RE.test(v.primaryEmail) ? { reply_to: v.primaryEmail } : {}) }),
    });
    const out = await r.json().catch(() => ({}));
    await logEvent('signup_notify', { key, status: r.status, id: out.id || null, error: r.ok ? null : JSON.stringify(out).slice(0, 200) });
    return res.json({ ok: r.ok });
  } catch (e) {
    console.error(e);
    await logEvent('signup_notify_error', { error: String(e.message || e) });
    return res.status(500).json({ ok: false });
  }
}
