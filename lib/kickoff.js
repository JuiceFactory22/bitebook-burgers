// Phoenix kickoff: restaurant packets + buyer passports. Contacts are encrypted; the code unlocks them.
import { createDecipheriv } from 'node:crypto';
import { PHOENIX_KICKOFF } from './kickoff-data.js';
import { query, logEvent } from './db.js';
import { restaurantById } from './restaurants.js';
import { buildStaffSheet } from './staffsheet.js';
import { sendRestaurantPacket } from './email.js';
import { emailOrder } from './delivery.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function unlockKickoff(code) {
  const raw = Buffer.from(PHOENIX_KICKOFF, 'base64');
  const d = createDecipheriv('aes-128-gcm', Buffer.from(code, 'hex'), raw.subarray(0, 12));
  d.setAuthTag(raw.subarray(12, 28));
  return JSON.parse(Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString('utf8'));
}

export async function phoenixLeft() {
  return Number((await query(`SELECT count(DISTINCT order_id) AS n FROM passports WHERE emailed_at IS NULL AND is_test = 0 AND city = 'phoenix'`))[0].n);
}

export async function runKickoff(list) {
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
  const left = await phoenixLeft();
  await logEvent('kickoff_phoenix', { packets: rows, buyersSent: sent, left, problems });
  return { rows, sent, left, problems };
}
