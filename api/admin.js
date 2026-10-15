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
        const pending = await query(
          `SELECT order_id, min(email) AS email, count(*) AS books, min(created_at) AS first
           FROM passports WHERE emailed_at IS NULL AND is_test = 0
           GROUP BY order_id ORDER BY first LIMIT $1::int`, [String(limit)]);
        const remaining = await query(`SELECT count(DISTINCT order_id) AS n FROM passports WHERE emailed_at IS NULL AND is_test = 0`);
        if (dry) return res.json({ dryRun: true, wouldSend: pending, totalPendingOrders: Number(remaining[0].n) });
        const results = [];
        for (const row of pending) {
          results.push(await emailOrder(row.order_id));
          await sleep(650); // stay under Resend's rate limit
        }
        const left = await query(`SELECT count(DISTINCT order_id) AS n FROM passports WHERE emailed_at IS NULL AND is_test = 0`);
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
      case 'dashboard':
      default:
        return dashboard(req, res);
    }
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: String(e.message || e) });
  }
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
  <div style="display:flex;gap:12px;flex-wrap:wrap">${cityCards || '<div class="muted">No passports yet.</div>'}</div>
  <h2 style="margin:12px 0 0;font-family:'Bricolage Grotesque'">Redemptions by restaurant</h2>
  <div style="overflow-x:auto"><table><tr><th>CITY</th><th>RESTAURANT</th><th>REDEEMED</th><th></th></tr>${restRows}</table></div>
  <h2 style="margin:12px 0 0;font-family:'Bricolage Grotesque'">Latest redemptions</h2>
  <div style="overflow-x:auto"><table><tr><th>WHEN</th><th>RESTAURANT</th><th>GUEST</th><th></th></tr>${recentRows || '<tr><td colspan="4" class="muted">None yet.</td></tr>'}</table></div>
</main>`,
  }));
}
