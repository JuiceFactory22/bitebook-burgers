// Customer-support tools (plain text). Every call needs ?code=<support token>.
//   ?a=find&q=<email, name or order id>         list matching passports
//   ?a=void&order=<orderId>&reason=refund         cancel an order's passports
//   ?a=reissue&order=<orderId>&email=<new email>  cancel them and send fresh passports to a new email
import { createHash, timingSafeEqual } from 'node:crypto';
import { query, logEvent } from '../lib/db.js';
import { createPassportsForOrder, voidOrder, ensureVoidColumns, passportLabel } from '../lib/passports.js';
import { emailOrder } from '../lib/delivery.js';
import { SUPPORT_TOKEN_SHA256 } from '../lib/support-auth.js';
import { tokenStatus } from '../lib/square.js';
import { reissueOrder } from '../lib/support-ops.js';

function ok(t) {
  const a = createHash('sha256').update(String(t || '')).digest();
  const b = Buffer.from(SUPPORT_TOKEN_SHA256, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex');
  if (!ok(req.query.code)) return res.send(`not authorized (got ${String(req.query.code || '').length} chars, starts ${String(req.query.code || '').slice(0, 3)})`);
  try {
    await ensureVoidColumns();
    const a = String(req.query.a || '');
    if (a === 'sqcheck') {
      const t = await tokenStatus();
      const b = t.body || {};
      return res.send(`http=${t.status} type=${b.client_id ? 'oauth' : 'personal'} scopes=${(b.scopes || []).join(',') || 'none-listed'} refunds_allowed=${!b.scopes || b.scopes.includes('PAYMENTS_WRITE') ? 'yes' : 'NO'} errors=${JSON.stringify(b.errors || [])}`);
    }
    if (a === 'find') {
      const q = String(req.query.q || '').trim();
      if (q.length < 3) return res.send('query too short');
      const rows = await query(
        `SELECT p.id, p.order_id, p.book_index, p.city, p.name, p.email, p.is_test, p.created_at, p.emailed_at, p.voided_at, p.void_reason,
                (SELECT count(*) FROM coupons c WHERE c.passport_id = p.id AND c.redeemed_at IS NOT NULL) AS used
         FROM passports p
         WHERE p.email ILIKE $1 OR p.name ILIKE $1 OR p.order_id = $2
         ORDER BY p.created_at LIMIT 20`, [`%${q}%`, q]);
      if (!rows.length) return res.send('no matches');
      return res.send(rows.map((p) => [
        passportLabel(p.id), p.id, `order=${p.order_id}`, p.city, p.name || '-', p.email || '-',
        `bought=${String(p.created_at).slice(0, 16)}`, `emailed=${p.emailed_at ? 'yes' : 'no'}`,
        `used=${p.used}`, p.voided_at ? `CANCELLED(${p.void_reason || ''})` : 'active', Number(p.is_test) ? 'TEST' : '',
      ].join(' | ')).join('\n'));
    }
    if (a === 'void') {
      const order = String(req.query.order || '');
      const reason = String(req.query.reason || 'refund').slice(0, 60);
      const done = await voidOrder(order, reason);
      await logEvent('void', { order, reason, passports: done.map((p) => p.id) });
      return res.send(done.length ? `cancelled ${done.length} passport(s) on order ${order}: ${done.map((p) => passportLabel(p.id)).join(', ')}` : 'nothing to cancel (wrong order id, or already cancelled)');
    }
    if (a === 'reissue') {
      const r = await reissueOrder(String(req.query.order || ''), String(req.query.email || '').trim(), { by: 'support-tool' });
      return res.send(`old: ${r.oldLabels.join(', ')} cancelled\nnew: ${r.newLabels.join(', ')} order=${r.newOrder}\nemail: ${r.sent}`);
    }
    return res.send('unknown action');
  } catch (e) {
    console.error(e);
    return res.send('error: ' + String(e.message || e).slice(0, 200));
  }
}
