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
import { FROM_EMAIL, CITIES } from '../lib/config.js';

const NOTIFY_TO = ['carol@getbitebook.com'];
const UNFINISHED_TO = ['will@getbitebook.com']; // who hears about people who started but didn't finish
const MAX_PER_HOUR = 30; // safety cap so junk submissions can't flood the inbox
const DEAL_TO = ['will@getbitebook.com', 'carol@getbitebook.com']; // who hears when a restaurant sends a deal from /wing-deals

// The friendly "your spot is saved" email to the restaurant. Turn on once the old one in the
// Google Sheet's Apps Script (Code.gs) is switched off, so restaurants don't get two.
const SEND_RESTAURANT_WELCOME = true;
const WELCOME_FROM = 'Will at BiteBook <will@getbitebook.com>';
const WELCOME_REPLY_TO = 'will@getbitebook.com';
const SITE = 'https://www.getbitebook.com';

const FIELDS = [
  ['location', 'City'], ['event', 'Event'], ['restaurantName', 'Restaurant'], ['instagram', 'Instagram'],
  ['address', 'Address'], ['primaryName', 'Contact'], ['primaryPhone', 'Phone'], ['primaryEmail', 'Email'],
  ['primaryMethod', 'Best way to reach'], ['secondaryName', 'Second contact'], ['secondaryPhone', 'Second phone'],
  ['secondaryEmail', 'Second email'], ['secondaryMethod', 'Second contact method'], ['couponDetails', 'Notes / deal details'],
  ['googlePlaceId', 'Google Place ID'], ['googleMapsUrl', 'Google Maps'],
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

// ---------------- Google Places lookup for the /reserve page ----------------
// The browser never sees the Google key: it asks us, we ask Google.
//   GET /api/signup-notify?op=places&q=...&city=nashville&kind=name|address&s=SESSION
//   GET /api/signup-notify?op=place&id=PLACE_ID&s=SESSION
// Needs the GOOGLE_MAPS_API_KEY environment variable in Vercel (Places API (New) turned on).
// The session token (s) bundles a person's typing + their final pick into one Google charge.
const PLACE_CENTERS = {
  denver: { latitude: 39.7392, longitude: -104.9903 },
  nashville: { latitude: 36.1627, longitude: -86.7816 },
  phoenix: { latitude: 33.4484, longitude: -112.0740 },
};
const cleanSession = (s) => String(s || '').replace(/[^a-z0-9-]/gi, '').slice(0, 64) || undefined;
const stripUSA = (a) => String(a || '').replace(/,\s*(USA|United States)$/i, '');

async function placesSearch(req, res) {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) return res.json({ ok: false, reason: 'not-configured' }); // page falls back to the free search
  const q = String(req.query.q || '').trim().slice(0, 100);
  if (q.length < 2) return res.json({ ok: true, results: [] });
  const kind = req.query.kind === 'address' ? 'address' : 'name';
  const center = PLACE_CENTERS[String(req.query.city || '').toLowerCase()];
  const body = {
    input: q,
    includedRegionCodes: ['us'],
    languageCode: 'en',
    sessionToken: cleanSession(req.query.s),
    // Restaurant search: businesses only. Address search: real addresses only.
    includedPrimaryTypes: kind === 'name' ? ['establishment'] : ['street_address', 'premise', 'subpremise', 'route'],
    // Show spots near the chosen city first, but suburbs and farther towns still come up
    ...(center ? { locationBias: { circle: { center, radius: 50000 } } } : {}),
  };
  const ask = async (b) => {
    const r = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key },
      body: JSON.stringify(b),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) console.error('places autocomplete', r.status, JSON.stringify(j).slice(0, 300));
    return r.ok ? j : null;
  };
  let j = await ask(body);
  // Nothing with the type filter (or it was rejected)? Try once more without it.
  if (!j || !(j.suggestions || []).length) { const { includedPrimaryTypes, ...loose } = body; j = await ask(loose) || j; }
  if (!j) return res.json({ ok: false });
  const results = (j.suggestions || []).map((s) => s.placePrediction).filter(Boolean).slice(0, 6).map((p) => ({
    id: p.placeId,
    name: p.structuredFormat?.mainText?.text || p.text?.text || '',
    address: stripUSA(p.structuredFormat?.secondaryText?.text || ''),
  }));
  return res.json({ ok: true, results });
}

async function placeDetails(req, res) {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  const id = String(req.query.id || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 300);
  if (!key || !id) return res.json({ ok: false });
  const s = cleanSession(req.query.s);
  const r = await fetch(`https://places.googleapis.com/v1/places/${id}${s ? `?sessionToken=${s}` : ''}`, {
    headers: { 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': 'id,displayName,formattedAddress,googleMapsUri' },
  });
  const p = await r.json().catch(() => ({}));
  if (!r.ok) { console.error('place details', r.status, JSON.stringify(p).slice(0, 300)); return res.json({ ok: false }); }
  return res.json({
    ok: true,
    id: p.id,
    name: p.displayName?.text || '',
    address: stripUSA(p.formattedAddress),
    mapsUrl: p.googleMapsUri || '',
  });
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

// A restaurant sent a deal from /wing-deals
async function dealPicked(req, res) {
  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch { b = {}; } }
  b = b || {};
  const name = String(b.restaurantName || '').trim().slice(0, 120);
  const city = String(b.location || '').trim().slice(0, 30);
  const email = String(b.email || '').trim().slice(0, 120);
  const deal = String(b.deal || '').trim().slice(0, 500);
  if (!name || !deal) return res.status(400).json({ ok: false });
  const recent = await query(`SELECT count(*) AS n FROM events WHERE kind = 'wing_deal_picked' AND at > now() - interval '1 hour'`);
  if (Number(recent[0]?.n || 0) >= 20) return res.json({ ok: true, skipped: 'cap' });
  const html = `<div style="font-family:Helvetica,Arial,sans-serif;color:#1F1A15;font-size:15px;line-height:1.5">
<p style="margin:0 0 12px"><b>${esc(name)}</b>${city ? ` (${esc(city)})` : ''} picked a Wing Month deal on getbitebook.com/wing-deals:</p>
<p style="margin:0 0 12px;padding:12px 14px;background:#127e73;color:#f8efdd;font-size:17px;font-weight:600">${esc(deal)}</p>
${email ? `<p style="margin:0 0 12px">Their email: ${esc(email)} (just reply to this email to reach them)</p>` : ''}
<p style="margin:0;color:#5E5246">Next step: confirm it with them and add it to the CouponDetails column in the sign-up sheet.</p></div>`;
  const text = `${name}${city ? ` (${city})` : ''} picked a Wing Month deal:\n\n${deal}\n${email ? `\nTheir email: ${email}\n` : ''}\nConfirm it with them and add it to the sign-up sheet.`;
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM_EMAIL, to: DEAL_TO, subject: `Wing deal picked: ${name}${city ? ` (${city})` : ''}`, html, text,
      ...(EMAIL_RE.test(email) ? { reply_to: email } : {}) }),
  });
  await logEvent('wing_deal_picked', { name, city, status: r.status });
  return res.json({ ok: r.ok });
}

function firstNameOf(v) {
  const f = String(v || '').trim().split(/\s+/)[0] || '';
  return f ? f.charAt(0).toUpperCase() + f.slice(1) : 'there';
}

// Splits "deal | Best time to reach: X" back into its two parts
function splitDetails(s) {
  const parts = String(s || '').split('|').map((x) => x.trim()).filter(Boolean);
  const best = parts.find((x) => /^best time to reach:/i.test(x));
  return { deal: parts.filter((x) => x !== best).join(' '), bestTime: best ? best.replace(/^best time to reach:\s*/i, '') : '' };
}

export function restaurantWelcome(v) {
  const first = firstNameOf(v.primaryName);
  const cityId = String(v.location || '').toLowerCase();
  const area = CITIES[cityId]?.area || v.location || 'your city';
  const { deal, bestTime } = splitDetails(v.couponDetails);
  const how = { phone: 'give you a call', text: 'send you a text', email: 'email you' }[String(v.primaryMethod || '').toLowerCase()] || 'reach out';
  const dealsUrl = `${SITE}/wing-deals?${new URLSearchParams({ r: v.restaurantName, city: cityId, ...(EMAIL_RE.test(v.primaryEmail) ? { e: v.primaryEmail } : {}) })}`;
  const subject = `Your spot in Wing Month is saved, ${first}!`;

  const steps = [
    `<b>We'll follow up to confirm your spot.</b> I'll ${how} to go over the details${bestTime ? ` (best time to reach you: ${esc(bestTime)})` : ''}.`,
    deal ? `<b>We'll lock in your wing deal.</b> You told us: <i>&ldquo;${esc(/[.!?]$/.test(deal) ? deal : deal + '.')}&rdquo;</i> We'll confirm it together.` : `<b>We'll pick your wing deal together.</b> Any wing deal works. Something simple like "Buy 6, get 6 free" is a great start.`,
    `<b>Send us your logo and a few photos,</b> and we'll start promoting you to locals.`,
  ];
  // Kept deliberately plain (like a normal email from Will) so Gmail files it in the main inbox, not Promotions/Updates
  const p = (inner) => `<p style="margin:0 0 14px">${inner}</p>`;
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#222">
${p(`Hi ${esc(first)},`)}
${p(`Thanks for saving a spot for ${esc(v.restaurantName)} in BiteBook's Wing Month! I'm Will, the owner of BiteBook, and I'm excited you're interested.`)}
${p(`Here's how it works: from December 15 to January 15, locals across ${esc(area)} buy a BiteBook passport and head out to try the wing deals inside. You offer one wing deal, and we handle all the promotion. It's a simple way to bring new faces through your door.`)}
${p('<b>What happens next:</b>')}
<ol style="margin:0 0 14px;padding-left:22px">${steps.map((s) => `<li style="margin:0 0 8px">${s}</li>`).join('')}</ol>
${p(`Need help picking your deal? <a href="${dealsUrl}">See what other restaurants are offering and build yours here</a>. It takes about 30 seconds.`)}
${p('Questions in the meantime? Just reply to this email.')}
${p('Talk soon,<br>Will<br>Owner, BiteBook<br><a href="' + SITE + '">getbitebook.com</a>')}
</div>`;

  const text = [
    `Hi ${first},`, '',
    `Thanks for saving a spot for ${v.restaurantName} in BiteBook's Wing Month! I'm Will, the owner of BiteBook, and I'm excited you're interested.`, '',
    `Here's how it works: from December 15 to January 15, locals across ${area} buy a BiteBook passport and head out to try the wing deals inside. You offer one wing deal, and we handle all the promotion.`, '',
    'What happens next:',
    ...steps.map((s, i) => `${i + 1}. ${s.replace(/<[^>]+>/g, '').replace(/&ldquo;|&rdquo;/g, '"')}`), '',
    `Need help picking your deal? See what other restaurants are offering and build yours here: ${dealsUrl}`, '',
    'Questions in the meantime? Just reply to this email.', '',
    'Talk soon,', 'Will', 'Owner, BiteBook', 'getbitebook.com',
  ].join('\n');
  return { subject, html, text };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const op = String(req.query.op || '');
  try {
    if (op === 'check-email' && req.method === 'GET') return await checkEmail(req, res);
    if (op === 'track' && req.method === 'POST') return await track(req, res);
    if (op === 'deal' && req.method === 'POST') return await dealPicked(req, res);
    if (op === 'places' && req.method === 'GET') return await placesSearch(req, res);
    if (op === 'place' && req.method === 'GET') return await placeDetails(req, res);
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
    await logEvent('signup_notify', { key, sid, placeId: v.googlePlaceId || null, status: r.status, id: out.id || null, error: r.ok ? null : JSON.stringify(out).slice(0, 200) });

    // Welcome email to the restaurant (Wing Month sign-ups only)
    if (SEND_RESTAURANT_WELCOME && /wing/i.test(v.event) && EMAIL_RE.test(v.primaryEmail)) {
      try {
        const w = restaurantWelcome(v);
        const wr = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ from: WELCOME_FROM, to: [v.primaryEmail], reply_to: WELCOME_REPLY_TO, bcc: ['will@getbitebook.com'], ...w }),
        });
        await logEvent('restaurant_welcome', { key, status: wr.status });
      } catch (e) { await logEvent('restaurant_welcome_error', { key, error: String(e.message || e).slice(0, 200) }); }
    }
    return res.json({ ok: r.ok });
  } catch (e) {
    console.error(e);
    await logEvent('signup_notify_error', { error: String(e.message || e) });
    return res.status(500).json({ ok: false });
  }
}
