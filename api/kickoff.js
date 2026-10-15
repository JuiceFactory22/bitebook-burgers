// Code-only trigger for the Phoenix kickoff (the code is a one-time secret; anything already sent is skipped).
import { unlockKickoff, runKickoff, phoenixLeft } from '../lib/kickoff.js';
import { query } from '../lib/db.js';

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  let list;
  try { list = unlockKickoff(String(req.query.code || '').trim().toLowerCase()); } catch { return res.status(401).send('bad code'); }
  if (req.query.last === '1') {
    const ev = await query(`SELECT at, kind, detail FROM events WHERE at > now() - interval '30 minutes' ORDER BY id DESC LIMIT 8`);
    return res.send(ev.map((r) => `${r.at} ${r.kind} ${String(r.detail).replace(/[\w.+-]+@[\w.-]+/g, '***').slice(0, 700)}`).join('\n') || 'no recent events');
  }
  if (req.query.status === '1') {
    const ev = await query(`SELECT at, detail FROM events WHERE kind = 'packet_sent' AND at > now() - interval '3 days'`);
    if (req.query.detail === '1') {
      const mine = ev.filter((r) => { try { return JSON.parse(r.detail).restaurant in list; } catch { return false; } });
      return res.send(mine.map((r) => { const d = JSON.parse(r.detail); return `${r.at} ${d.restaurant} to=${(d.to || []).map((e) => e.replace(/^(.).*@/, '$1***@')).join(',')}`; }).join('\n') || 'none');
    }
    const done = new Set(ev.map((r) => { try { return JSON.parse(r.detail).restaurant; } catch { return null; } }));
    const phx = Object.keys(list).filter((id) => done.has(id));
    return res.send(`packets_sent=${phx.length}/11 [${phx.join(',')}] passports_left=${await phoenixLeft()}`);
  }
  const { rows, sent, left, problems } = await runKickoff(list);
  return res.send(rows.map(([n, s]) => `${n}: ${s}`).join('\n') + `\npassports_sent=${sent} passports_left=${left}${problems.length ? ' problems=' + problems.join(',') : ''}`);
}
