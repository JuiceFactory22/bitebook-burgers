// Nightly redemption summary emailed to info@. Triggered by Vercel Cron (see vercel.json),
// or manually with ?key=<ADMIN_KEY>&force=1. Sends at most once every 20 hours unless forced.
import { timingSafeEqual } from 'node:crypto';
import { query, logEvent } from '../lib/db.js';
import { CITIES, EVENT, FROM_EMAIL, SUPPORT_EMAIL, SITE_URL } from '../lib/config.js';
import { RESTAURANTS } from '../lib/restaurants.js';
import { esc } from '../lib/html.js';

function isAdmin(req) {
  const expected = process.env.ADMIN_KEY || '';
  const given = String(req.query.key || '');
  return expected && given.length === expected.length && timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}

export default async function handler(req, res) {
  const fromCron = /vercel-cron/i.test(String(req.headers['user-agent'] || ''));
  const admin = isAdmin(req);
  if (!fromCron && !admin) return res.status(401).json({ error: 'Not authorized' });
  const force = admin && req.query.force === '1';
  const to = admin && req.query.to ? String(req.query.to) : SUPPORT_EMAIL;
  try {
    if (!force) {
      const recent = await query(`SELECT 1 FROM events WHERE kind = 'nightly_sent' AND at > now() - interval '20 hours' LIMIT 1`);
      if (recent.length) return res.json({ skipped: 'already sent recently' });
    }

    // Last 24 hours, by restaurant (real passports only)
    const today = await query(`SELECT c.restaurant_id, count(*) AS n FROM coupons c JOIN passports p ON p.id = c.passport_id
      WHERE p.is_test = 0 AND c.redeemed_at > now() - interval '24 hours' GROUP BY c.restaurant_id`);
    const total = await query(`SELECT c.restaurant_id, count(*) AS n FROM coupons c JOIN passports p ON p.id = c.passport_id
      WHERE p.is_test = 0 AND c.redeemed_at IS NOT NULL GROUP BY c.restaurant_id`);
    const books = (await query(`SELECT
      (SELECT count(*) FROM passports WHERE is_test = 0) AS total,
      (SELECT count(*) FROM passports WHERE is_test = 0 AND created_at > now() - interval '24 hours') AS new24,
      (SELECT count(DISTINCT order_id) FROM passports WHERE is_test = 0 AND emailed_at IS NULL) AS unsent`))[0];
    const tMap = Object.fromEntries(today.map((r) => [r.restaurant_id, Number(r.n)]));
    const aMap = Object.fromEntries(total.map((r) => [r.restaurant_id, Number(r.n)]));
    const todayTotal = today.reduce((s, r) => s + Number(r.n), 0);
    const allTotal = total.reduce((s, r) => s + Number(r.n), 0);

    const cityBlocks = Object.values(CITIES).map((city) => {
      const list = RESTAURANTS.filter((r) => r.city === city.id && r.active)
        .map((r) => ({ name: r.name, t: tMap[r.id] || 0, a: aMap[r.id] || 0 }))
        .sort((x, y) => y.t - x.t || y.a - x.a || x.name.localeCompare(y.name));
      const cityToday = list.reduce((s, r) => s + r.t, 0);
      const rows = list.map((r) => `<tr><td style="padding:6px 8px;border-bottom:1px solid #e6dcc6">${esc(r.name)}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e6dcc6;text-align:center;font-weight:${r.t ? 700 : 400}">${r.t}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e6dcc6;text-align:center;color:#5E5246">${r.a}</td></tr>`).join('');
      return `<div style="margin:18px 0 6px;font-weight:800;font-size:18px">${esc(city.name)} <span style="font-weight:400;color:#5E5246;font-size:14px">· ${cityToday} today</span></div>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;background:#FFFDF7;border:1px solid #1F1A15">
        <tr style="background:#1F1A15;color:#FBF4E4;font-family:Courier,monospace;font-size:11px"><td style="padding:6px 8px">RESTAURANT</td><td style="padding:6px 8px;text-align:center">LAST 24H</td><td style="padding:6px 8px;text-align:center">TO DATE</td></tr>${rows}</table>`;
    }).join('');

    const dateLabel = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric' }).format(new Date());
    const subject = `BiteBook nightly: ${todayTotal} redemption${todayTotal === 1 ? '' : 's'} today (${dateLabel})`;
    const html = `<!doctype html><html><body style="margin:0;background:#FBF4E4;font-family:Helvetica,Arial,sans-serif;color:#1F1A15">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:20px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px"><tr><td>
<div style="background:#1F1A15;color:#FBF4E4;padding:14px 18px;border-radius:12px 12px 0 0;font-weight:800;font-size:20px">BiteBook <span style="float:right;color:#F2B33D;font-family:Courier,monospace;font-size:12px;line-height:26px">${esc(EVENT.name.toUpperCase())} · NIGHTLY</span></div>
<div style="background:#FFFDF7;border:2px solid #1F1A15;border-top:0;border-radius:0 0 12px 12px;padding:16px 18px">
<div style="display:block;font-size:15px;line-height:1.6">
<b style="font-size:26px">${todayTotal}</b> redemptions in the last 24 hours · <b>${allTotal}</b> to date<br>
<b>${books.new24}</b> new books sold in the last 24 hours · <b>${books.total}</b> total${Number(books.unsent) ? ` · <span style="color:#C8371D"><b>${books.unsent}</b> orders not yet emailed</span>` : ''}
</div>
${cityBlocks}
<p style="font-size:13px;color:#5E5246;margin:16px 0 0">Live numbers anytime in your dashboard. Undo accidental redemptions there too.</p>
</div></td></tr></table></td></tr></table></body></html>`;

    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM_EMAIL, to: [to], subject, html }),
    });
    const json = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`Resend failed (${r.status}): ${JSON.stringify(json).slice(0, 200)}`);
    if (!force) await logEvent('nightly_sent', { todayTotal, allTotal, id: json.id });
    return res.json({ sent: true, to, todayTotal, allTotal });
  } catch (e) {
    console.error(e);
    await logEvent('nightly_error', { error: String(e.message || e) });
    return res.status(500).json({ error: String(e.message || e) });
  }
}
