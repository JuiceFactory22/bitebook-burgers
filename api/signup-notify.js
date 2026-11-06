// Emails the team when a restaurant submits the sign-up or "save your spot" form.
// The forms still send their answers to the Google sheet as before; this is only the alert.
// To change who gets these emails, edit NOTIFY_TO below.
//
// It also handles two small helpers for the /reserve page (kept in this file so we don't add
// another serverless function):
//   GET  /api/signup-notify?op=check-email&email=...  -> is the email's domain real? (checks DNS)
//   POST /api/signup-notify?op=track                  -> logs page visits; emails Will when someone
//                                                        starts the form but leaves without submitting
import { resolveMx, resolve4 } from 'node:dns/promises';
import { query, logEvent } from '../lib/db.js';
import { esc } from '../lib/html.js';
import { FROM_EMAIL } from '../lib/config.js';

const NOTIFY_TO = ['carol@getbitebook.com'];
const UNFINISHED_TO = ['will@getbitebook.com']; // who hears about people who started but didn't finish
const MAX_PER_HOUR = 30; // safety cap so junk submissions can't flood the inbox

const FIELDS = [
  ['location', 'City'], ['event', 'Event'], ['restaurantName', 'Restaurant'], ['instagram', 'Instagram'],
  ['address', 'Address'], ['primaryName', 'Contact'], ['primaryPhone', 'Phone'], ['primaryEmail', 'Email'],
  ['primaryMethod', 'Best way to reach'], ['secondaryName', 'Second contact'], ['secondaryPhone', 'Second phone'],
  ['secondaryEmail', 'Second email'], ['secondaryMethod', 'Second contact method'], ['couponDetails', 'Notes / deal details'],
];
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

async function domainExists(domain) {
  const withTimeout = (p) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 3000))]);
  try {
    const mx = await withTimeout(resolveMx(domain));
    if (mx && mx.length) return true;
  } catch (e) {
    if (e.message === 'timeout') return true; // can't tell; don't block the restaurant
  }
  try {
    const a = await withTimeout(resolve4(domain)); // some small domains take mail without MX records
    return !!(a && a.length);
  } catch (e) {
    return e.message === 'timeout';
  }
}

async function checkEmail(req, res) {
  const email = String(req.query.email || '').trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return res.json({ ok: false, reason: 'format' });
  const domain = email.split('@').pop();
  return res.json({ ok: await domainExists(domain) });
}

const TRACK_STAGES = ['visit', 'started', 'left'];
const PARTIAL_FIELDS = [['location', 'City'], ['restaurantName', 'Restaurant'], ['address', 'Address'], ['primaryName', 'Contact'],
  ['primaryPhone', 'Phone'], ['primaryEmail', 'Email'], ['primaryMethod', 'Best way to reach']];

async function track(req, res) {
  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch { b = {}; } }
  b = b || {};
  const sid = String(b.sid || '').replace(/[^a-z0-9]/gi, '').slice(0, 40);
  const stage = String(b.stage || '');
  if (!sid || !TRACK_STAGES.includes(stage)) return res.status(400).json({ ok: false });
  const city = String(b.city || '').slice(0, 30);
  const ref = String(b.ref || '').slice(0, 200);
  const fields = {};
  if (b.fields && typeof b.fields === 'object') for (const [k] of PARTIAL_FIELDS) fields[k] = String(b.fields[k] ?? '').trim().slice(0, 200);

  // One event per visitor per stage
  const seen = await query(`SELECT 1 FROM events WHERE kind = $1 AND detail LIKE $2 AND at > now() - interval '1 day' LIMIT 1`,
    [`reserve_${stage}`, `%"sid":"${sid}"%`]);
  if (seen.length) return res.json({ ok: true, skipped: 'seen' });
  await logEvent(`reserve_${stage}`, stage === 'left' ? { sid, city, ref, fields } : { sid, city, ref });

  if (stage !== 'left') return res.json({ ok: true });

  // Don't email if they ended up submitting, or if we've sent too many of these lately
  const done = await query(`SELECT 1 FROM events WHERE kind = 'signup_notify' AND detail LIKE $1 LIMIT 1`, [`%"sid":"${sid}"%`]);
  if (done.length) return res.json({ ok: true, skipped: 'submitted' });
  const recent = await query(`SELECT count(*) AS n FROM events WHERE kind = 'reserve_unfinished_email' AND at > now() - interval '1 hour'`);
  if (Number(recent[0]?.n || 0) >= 10) return res.json({ ok: true, skipped: 'cap' });

  const filled = PARTIAL_FIELDS.filter(([k]) => fields[k]);
  if (!filled.length) return res.json({ ok: true });
  const who = fields.restaurantName || fields.primaryName || fields.primaryEmail || fields.primaryPhone;
  const subject = `Unfinished sign-up: ${who}${city ? ` (${city})` : ''}`;
  const rows = filled.map(([k, label]) =>
    `<tr><td style="padding:6px 10px 6px 0;color:#5E5246;white-space:nowrap;vertical-align:top">${esc(label)}</td><td style="padding:6px 0">${esc(fields[k])}</td></tr>`).join('');
  const html = `<div style="font-family:Helvetica,Arial,sans-serif;color:#1F1A15;font-size:15px;line-height:1.5">
<p style="margin:0 0 12px">Someone started the Wing Month "save your spot" form but left before submitting. Here's what they typed:</p>
<table cellpadding="0" cellspacing="0" style="border-collapse:collapse">${rows}</table>
<p style="margin:16px 0 0;color:#5E5246">They may still come back and finish. If they don't, this is enough to reach out.</p></div>`;
  const text = ['Someone started the save-your-spot form but left before submitting:', '', ...filled.map(([k, label]) => `${label}: ${fields[k]}`)].join('\n');
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM_EMAIL, to: UNFINISHED_TO, subject, html, text }),
  });
  await logEvent('reserve_unfinished_email', { sid, status: r.status });
  return res.json({ ok: r.ok });
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const op = String(req.query.op || '');
  try {
    if (op === 'check-email' && req.method === 'GET') return await checkEmail(req, res);
    if (op === 'track' && req.method === 'POST') return await track(req, res);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false });
  }
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
    const sid = String(b.sid || '').replace(/[^a-z0-9]/gi, '').slice(0, 40);
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
    await logEvent('signup_notify', { key, sid, status: r.status, id: out.id || null, error: r.ok ? null : JSON.stringify(out).slice(0, 200) });
    return res.json({ ok: r.ok });
  } catch (e) {
    console.error(e);
    await logEvent('signup_notify_error', { error: String(e.message || e) });
    return res.status(500).json({ ok: false });
  }
}
