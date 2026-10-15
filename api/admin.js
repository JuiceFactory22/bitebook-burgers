// Behind-the-scenes tools. Every call needs ?key=<ADMIN_KEY>.
//   /api/admin?action=dashboard          Redemptions dashboard (HTML)
//   /api/admin?action=health             Check settings + database
//   /api/admin?action=init               Create database tables (safe to repeat)
//   /api/admin?action=sync[&since=ISO]   Create passports for every PAID Square order
//   /api/admin?action=send[&limit=10][&dry=1]   Email passports that haven't been sent
//   /api/admin?action=test&city=nashville&email=you@x.com[&name=Will][&send=1]
//   /api/admin?action=undo&token=XXXX    Undo an accidental redemption
//   /api/admin?action=resend&order=ID    Re-send an order's passports
import { timingSafeEqual } from 'node:crypto';
import { query, initSchema, logEvent } from '../lib/db.js';
import { createPassportsForOrder, undoRedemption, passportLabel } from '../lib/passports.js';
import { searchOrders } from '../lib/square.js';
import { processOrder, emailOrder } from '../lib/delivery.js';
import { RESTAURANTS, restaurantById } from '../lib/restaurants.js';
import { CITIES, SITE_URL, formatLocal } from '../lib/config.js';
import { page, esc } from '../lib/html.js';
import { buildStaffSheet } from '../lib/staffsheet.js';
import { sendRestaurantPacket } from '../lib/email.js';
import { findLogos, proxyImage } from '../lib/logos.js';
import { createDecipheriv } from 'node:crypto';
import { PHOENIX_KICKOFF } from '../lib/kickoff-data.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function authorized(req) {
  const expected = process.env.ADMIN_KEY || '';
  const given = String(req.query.key || req.headers['x-admin-key'] || '');
  if (!expected || given.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}

export default async function handler(req, res) {
  if (!authorized(req)) return res.status(401).json({ error: 'Not authorized' });
  const action = String(req.query.action || 'dashboard');
  res.setHeader('Cache-Control', 'no-store');
  try {
    switch (action) {
      case 'health': {
        const env = Object.fromEntries(['DATABASE_URL', 'RESEND_API_KEY', 'SQUARE_ACCESS_TOKEN', 'ADMIN_KEY'].map((k) => [k, Boolean(process.env[k])]));
        let db = 'unknown';
        try { await query('SELECT 1 AS ok'); db = 'ok'; } catch (e) { db = String(e.message || e); }
        let tables = null;
        try {
          const r = await query(`SELECT (SELECT count(*) FROM passports) AS passports, (SELECT count(*) FROM coupons) AS coupons,
            (SELECT count(*) FROM passports WHERE emailed_at IS NOT NULL) AS emailed, (SELECT count(*) FROM coupons WHERE redeemed_at IS NOT NULL) AS redeemed`);
          tables = r[0];
        } catch { tables = 'not created yet'; }
        return res.json({ env, db, tables });
      }
      case 'summary': {
        // Short plain-text status line
        const r = (await query(`SELECT
          (SELECT count(*) FROM passports WHERE is_test=0) AS books,
          (SELECT count(*) FROM passports WHERE is_test=0 AND city='nashville') AS nash,
          (SELECT count(*) FROM passports WHERE is_test=0 AND city='phoenix') AS phx,
          (SELECT count(DISTINCT order_id) FROM passports WHERE is_test=0) AS orders,
          (SELECT count(DISTINCT order_id) FROM passports WHERE is_test=0 AND emailed_at IS NULL) AS pending,
          (SELECT count(*) FROM passports WHERE is_test=0 AND (email IS NULL OR email='')) AS noemail,
          (SELECT count(*) FROM coupons c JOIN passports p ON p.id=c.passport_id WHERE p.is_test=0 AND c.redeemed_at IS NOT NULL) AS redeemed`))[0];
        res.setHeader('Content-Type', 'text/plain');
        return res.send(`books=${r.books} nash=${r.nash} phx=${r.phx} orders=${r.orders} unsent_orders=${r.pending} no_email=${r.noemail} redeemed=${r.redeemed}`);
      }
      case 'init': {
        await initSchema();
        return res.json({ ok: true });
      }
      case 'sync': {
        const since = String(req.query.since || '2026-09-21T00:00:00Z');
        const orders = await searchOrders(since);
        const summary = { ordersFound: orders.length, paid: 0, notPaid: 0, booksReady: 0, noBooks: 0, missingEmail: [], byCity: {} };
        for (const o of orders) {
          const r = await processOrder(o);
          if (r.status === 'not_paid') { summary.notPaid++; continue; }
          if (r.status === 'no_books') { summary.noBooks++; continue; }
          summary.paid++;
          summary.booksReady += r.passports.length;
          for (const p of r.passports) summary.byCity[p.city] = (summary.byCity[p.city] || 0) + 1;
          if (!r.email) summary.missingEmail.push(o.id);
        }
        await logEvent('sync', summary);
        return res.json(summary);
      }
      case 'send': {
        const limit = Math.min(25, Math.max(1, parseInt(req.query.limit || '10', 10)));
        const dry = req.query.dry === '1';
        const city = CITIES[String(req.query.city || '')] ? String(req.query.city) : null;
        const pending = await query(
          `SELECT order_id, min(email) AS email, count(*) AS books, min(created_at) AS first
           FROM passports WHERE emailed_at IS NULL AND is_test = 0 AND ($2::text IS NULL OR city = $2::text)
           GROUP BY order_id ORDER BY first LIMIT $1::int`, [String(limit), city]);
        const remaining = await query(`SELECT count(DISTINCT order_id) AS n FROM passports WHERE emailed_at IS NULL AND is_test = 0 AND ($1::text IS NULL OR city = $1::text)`, [city]);
        if (dry) return res.json({ dryRun: true, wouldSend: pending, totalPendingOrders: Number(remaining[0].n) });
        const results = [];
        for (const row of pending) {
          results.push(await emailOrder(row.order_id));
          await sleep(650); // stay under Resend's rate limit
        }
        const left = await query(`SELECT count(DISTINCT order_id) AS n FROM passports WHERE emailed_at IS NULL AND is_test = 0 AND ($1::text IS NULL OR city = $1::text)`, [city]);
        if (req.query.fmt === 'text') {
          const ok = results.filter((r) => r.status === 'sent').length;
          const bad = results.filter((r) => r.status !== 'sent' && r.status !== 'already_sent');
          res.setHeader('Content-Type', 'text/plain');
          return res.send(`sent=${ok} problems=${bad.length} left=${Number(left[0].n)}${bad.length ? ' ' + bad.map((b) => b.status).join(',') : ''}`);
        }
        return res.json({ results, pendingOrdersLeft: Number(left[0].n) });
      }
      case 'test': {
        const city = String(req.query.city || 'nashville');
        if (!CITIES[city]) return res.status(400).json({ error: 'Unknown city' });
        const email = String(req.query.email || '');
        const orderId = `test-${Date.now()}`;
        const passports = await createPassportsForOrder({ orderId, books: [city], name: String(req.query.name || 'Test Guest'), email, isTest: true });
        const coupons = await query('SELECT token, restaurant_id FROM coupons WHERE passport_id = $1', [passports[0].id]);
        let sent = null;
        if (req.query.send === '1' && email) sent = await emailOrder(orderId);
        return res.json({
          orderId,
          book: `${SITE_URL}/book/${passports[0].id}`,
          redeemLinks: coupons.map((c) => ({ restaurant: restaurantById(c.restaurant_id)?.name, link: `${SITE_URL}/r/${c.token}` })),
          sent,
        });
      }
      case 'undo': {
        const row = await undoRedemption(String(req.query.token || ''));
        await logEvent('undo', { token: req.query.token });
        if (req.query.back === '1') {
          res.setHeader('Location', `/api/admin?action=dashboard&key=${encodeURIComponent(req.query.key)}`);
          return res.status(302).end();
        }
        return res.json({ ok: Boolean(row) });
      }
      case 'staffguide': {
        // Preview a restaurant's printable guide: ?action=staffguide&r=<id>&contact=...
        const r = restaurantById(String(req.query.r || ''));
        if (!r) return res.status(404).json({ error: 'Unknown restaurant' });
        const pdf = await buildStaffSheet(r, { contact: String(req.query.contact || '') });
        res.setHeader('Content-Type', 'application/pdf');
        return res.status(200).send(Buffer.from(pdf));
      }
      case 'packet': {
        // Email a restaurant its kickoff packet: ?action=packet&r=<id>&to=a@x.com,b@y.com&name=Dane&contact=...&send=1
        const r = restaurantById(String(req.query.r || ''));
        if (!r || !r.active) return res.status(404).json({ error: 'Unknown or inactive restaurant' });
        const to = String(req.query.to || '').split(',').map((s) => s.trim()).filter((s) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s));
        if (!to.length) return res.status(400).json({ error: 'No valid recipient emails' });
        const contact = String(req.query.contact || '');
        if (req.query.send !== '1') return res.json({ dryRun: true, restaurant: r.name, to, deal: r.deal });
        const pdf = await buildStaffSheet(r, { contact });
        const out = await sendRestaurantPacket({ to, contactName: String(req.query.name || ''), restaurant: r, pdf, contact });
        await logEvent('packet_sent', { restaurant: r.id, to, resendId: out.id });
        return res.json({ sent: true, restaurant: r.name, to, id: out.id });
      }
      case 'events': {
        const rows = await query('SELECT id, at, kind, detail FROM events ORDER BY id DESC LIMIT 30');
        return res.json(rows);
      }
      case 'resend': {
        return res.json(await emailOrder(String(req.query.order || ''), { force: true }));
      }
      case 'kickoff': {
        return kickoffPage(req, res);
      }
      case 'logos': {
        return logosPage(req, res);
      }
      case 'logoimg': {
        const img = await proxyImage(String(req.query.u || ''));
        if (!img) return res.status(404).send('not found');
        res.setHeader('Content-Type', img.type);
        if (req.query.dl) res.setHeader('Content-Disposition', `attachment; filename="${String(req.query.name || 'logo').replace(/[^\w.-]/g, '')}"`);
        return res.send(img.body);
      }
      case 'dashboard':
      default:
        return dashboard(req, res);
    }
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: String(e.message || e) });
  }
}

function unlockKickoff(code) {
  const raw = Buffer.from(PHOENIX_KICKOFF, 'base64');
  const d = createDecipheriv('aes-128-gcm', Buffer.from(code, 'hex'), raw.subarray(0, 12));
  d.setAuthTag(raw.subarray(12, 28));
  return JSON.parse(Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString('utf8'));
}

async function kickoffPage(req, res) {
  const key = encodeURIComponent(String(req.query.key));
  const code = String(req.query.code || '').trim().toLowerCase();
  const shell = (inner) => page({ title: 'Phoenix kickoff', label: 'ADMIN', wide: true, body: `<main><h1>Phoenix kickoff</h1>${inner}<p><a href="/api/admin?action=dashboard&key=${key}">← Dashboard</a></p></main>` });
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  if (!code) {
    return res.send(shell(`<p>Sends the 11 Phoenix restaurant packets, then the Phoenix buyer passports. Safe to tap twice — anything already sent is skipped.</p>
      <form method="get" action="/api/admin"><input type="hidden" name="key" value="${esc(String(req.query.key))}"><input type="hidden" name="action" value="kickoff">
      <p><label>Code from Claude<br><input name="code" style="font-size:18px;padding:10px;width:100%;max-width:420px" autocomplete="off"></label></p>
      <p><button style="font-size:20px;padding:14px 22px;background:#C8371D;color:#fff;border:0;border-radius:10px">Send Phoenix kickoff</button></p></form>`));
  }
  let list;
  try { list = unlockKickoff(code); } catch { return res.send(shell('<p style="color:#C8371D"><b>That code didn’t work.</b> Copy it again from the chat.</p>')); }
  const started = Date.now();
  const already = new Set((await query(`SELECT detail FROM events WHERE kind = 'packet_sent' AND at > now() - interval '3 days'`))
    .map((r) => { try { return (typeof r.detail === 'string' ? JSON.parse(r.detail) : r.detail).restaurant; } catch { return null; } }));
  const rows = [];
  for (const [rid, [to, name]] of Object.entries(list)) {
    const r = restaurantById(rid);
    if (!r || !r.active) { rows.push([rid, 'skipped (not active)']); continue; }
    if (already.has(rid)) { rows.push([r.name, 'already sent earlier']); continue; }
    try {
      const pdf = await buildStaffSheet(r, { contact: '' });
      const out = await sendRestaurantPacket({ to, contactName: name, restaurant: r, pdf, contact: '' });
      await logEvent('packet_sent', { restaurant: rid, to, resendId: out.id, via: 'kickoff' });
      rows.push([r.name, 'sent']);
    } catch (e) { rows.push([r.name, 'FAILED: ' + String(e.message || e).slice(0, 120)]); }
    await sleep(650);
  }
  let sent = 0, problems = [];
  while (Date.now() - started < 45000) {
    const pending = await query(`SELECT order_id FROM passports WHERE emailed_at IS NULL AND is_test = 0 AND city = 'phoenix' GROUP BY order_id ORDER BY min(created_at) LIMIT 1`);
    if (!pending.length) break;
    const out = await emailOrder(pending[0].order_id);
    if (out.status === 'sent') sent++; else { problems.push(out.status); if (problems.length > 3) break; }
    await sleep(650);
  }
  const left = Number((await query(`SELECT count(DISTINCT order_id) AS n FROM passports WHERE emailed_at IS NULL AND is_test = 0 AND city = 'phoenix'`))[0].n);
  await logEvent('kickoff_phoenix', { packets: rows, buyersSent: sent, left, problems });
  return res.send(shell(`<h2>Restaurant packets</h2><table>${rows.map(([n, s]) => `<tr><td>${esc(n)}</td><td>${esc(s)}</td></tr>`).join('')}</table>
    <h2>Buyer passports</h2><p>Sent just now: <b>${sent}</b> · Still waiting: <b>${left}</b>${problems.length ? ` · Problems: ${esc(problems.join(', '))}` : ''}</p>
    ${left ? `<p><a style="font-size:18px" href="/api/admin?action=kickoff&key=${key}&code=${esc(code)}">Send the rest →</a></p>` : '<p><b>All Phoenix passports are out.</b></p>'}`));
}

async function logosPage(req, res) {
  const key = encodeURIComponent(String(req.query.key));
  const list = RESTAURANTS.filter((r) => r.active && (!req.query.city || r.city === req.query.city));
  const results = await Promise.all(list.map(async (r) => ({ r, ...(await findLogos(r.id)) })));
  if (req.query.fmt === 'text') {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.send(results.map(({ r, note, logos }) =>
      `${r.id}: ${logos.length} found${note ? ' (' + note + ')' : ''}\n` +
      logos.map((l) => `   ${l.type} ${Math.round(l.bytes / 1024)}KB ${l.url}`).join('\n')).join('\n'));
  }
  const ext = (t) => ({ 'image/png': 'png', 'image/jpeg': 'jpg', 'image/svg+xml': 'svg', 'image/webp': 'webp', 'image/avif': 'avif', 'image/gif': 'gif', 'image/x-icon': 'ico', 'image/vnd.microsoft.icon': 'ico' }[t] || 'img');
  const cards = results.map(({ r, note, logos }) => {
    const imgs = logos.map((l, i) => {
      const src = `/api/admin?key=${key}&action=logoimg&u=${encodeURIComponent(l.url)}`;
      const name = `${r.id}-${i + 1}.${ext(l.type)}`;
      return `<figure><div class="ph"><img src="${src}" alt="" loading="lazy"></div>
        <figcaption>${esc(l.type.replace('image/', ''))} · ${Math.max(1, Math.round(l.bytes / 1024))}KB · <a href="${src}&dl=1&name=${encodeURIComponent(name)}">Download</a></figcaption></figure>`;
    }).join('');
    return `<section><h3>${esc(r.name)} <small>${esc(r.city)}</small></h3>
      ${logos.length ? `<div class="row">${imgs}</div>` : `<p class="miss">Nothing found${note ? ' — ' + esc(note) : ''}. Ask them to send their logo.</p>`}</section>`;
  }).join('');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.send(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Restaurant logos</title>
<style>body{margin:0;background:#FBF4E4;color:#1F1A15;font-family:Inter,system-ui,sans-serif;padding:20px 16px 60px}h1{margin:0 0 4px}p.sub{color:#5E5246;margin:0 0 20px}
section{background:#fff;border:2px solid #1F1A15;border-radius:12px;padding:14px;margin:0 auto 14px;max-width:980px}h3{margin:0 0 10px}small{font-weight:400;color:#5E5246;text-transform:capitalize}
.row{display:flex;gap:12px;flex-wrap:wrap}figure{margin:0;width:200px}.ph{height:130px;border:1px solid #ddd;border-radius:8px;display:flex;align-items:center;justify-content:center;padding:8px;background:repeating-conic-gradient(#eee 0 25%,#fff 0 50%) 0 0/16px 16px}
.ph img{max-width:100%;max-height:100%}figcaption{font-size:12px;color:#5E5246;margin-top:4px}a{color:#C8371D}.miss{color:#C8371D;margin:0}</style></head>
<body><h1>Restaurant logos</h1><p class="sub">Pulled from each restaurant's own website. Checkered background = transparent. Some are small icons — the bigger file is usually the one to use.</p>${cards}</body></html>`);
}

async function dashboard(req, res) {
  const key = encodeURIComponent(String(req.query.key));
  const totals = await query(`SELECT city, count(*) AS books, count(emailed_at) AS emailed FROM passports WHERE is_test = 0 GROUP BY city ORDER BY city`);
  const byRest = await query(`SELECT c.restaurant_id, count(c.redeemed_at) AS redeemed FROM coupons c JOIN passports p ON p.id = c.passport_id
    WHERE p.is_test = 0 GROUP BY c.restaurant_id`);
  const recent = await query(`SELECT c.token, c.restaurant_id, c.redeemed_at, p.name, p.id AS passport_id, p.city, p.is_test FROM coupons c
    JOIN passports p ON p.id = c.passport_id WHERE c.redeemed_at IS NOT NULL ORDER BY c.redeemed_at DESC LIMIT 100`);
  const redeemedMap = Object.fromEntries(byRest.map((r) => [r.restaurant_id, Number(r.redeemed)]));

  const cityCards = totals.map((t) => `<div class="card" style="flex:1;min-width:180px"><div class="mono">${esc(CITIES[t.city]?.name || t.city)}</div>
    <div style="font-size:30px;font-weight:800;font-family:'Bricolage Grotesque'">${t.books} books</div><div class="muted">${t.emailed} emailed</div></div>`).join('');

  const restRows = RESTAURANTS.filter((r) => r.active).map((r) => `<tr><td>${esc(CITIES[r.city].name)}</td><td>${esc(r.name)}</td><td>${redeemedMap[r.id] || 0}</td>
    <td>${r.confirmed ? '' : '<span style="color:var(--red)">confirm offer</span>'}</td></tr>`).join('');

  const recentRows = recent.map((r) => `<tr><td>${esc(formatLocal(r.redeemed_at, r.city))}</td><td>${esc(restaurantById(r.restaurant_id)?.name || r.restaurant_id)}</td>
    <td>${esc(r.name || '')} · ${esc(passportLabel(r.passport_id))}${Number(r.is_test) ? ' (test)' : ''}</td>
    <td><a href="/api/admin?action=undo&back=1&token=${encodeURIComponent(r.token)}&key=${key}" onclick="return confirm('Undo this redemption? The coupon will work again.')">Undo</a></td></tr>`).join('');

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.status(200).send(page({
    title: 'Dashboard', label: 'ADMIN DASHBOARD', wide: true,
    body: `<main>
  <h1>Burger Blastoff dashboard</h1>
  <p style="margin:0 0 8px"><a href="/api/admin?action=kickoff&key=${key}" style="font-weight:700">Phoenix kickoff (send packets + passports) →</a></p>
  <p style="margin:0 0 8px"><a href="/api/admin?action=logos&key=${key}">Restaurant logos →</a></p>
  <div style="display:flex;gap:12px;flex-wrap:wrap">${cityCards || '<div class="muted">No passports yet.</div>'}</div>
  <h2 style="margin:12px 0 0;font-family:'Bricolage Grotesque'">Redemptions by restaurant</h2>
  <div style="overflow-x:auto"><table><tr><th>CITY</th><th>RESTAURANT</th><th>REDEEMED</th><th></th></tr>${restRows}</table></div>
  <h2 style="margin:12px 0 0;font-family:'Bricolage Grotesque'">Latest redemptions</h2>
  <div style="overflow-x:auto"><table><tr><th>WHEN</th><th>RESTAURANT</th><th>GUEST</th><th></th></tr>${recentRows || '<tr><td colspan="4" class="muted">None yet.</td></tr>'}</table></div>
</main>`,
  }));
}
