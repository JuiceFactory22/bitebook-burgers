// POST /api/notify { email, event, city, source } -> saves a "tell me when restaurants are announced" sign-up
import { EVENTS, CITIES } from '../config.js';
import { query, logEvent, ensureMultiEventSchema } from '../db.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export default async function notify(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST' });
  const b = req.body || {};
  const email = String(b.email || '').trim().toLowerCase().slice(0, 200);
  const ev = EVENTS[String(b.event || '')];
  const city = CITIES[String(b.city || '')];
  if (!EMAIL_RE.test(email) || !ev || !city) return res.status(400).json({ error: 'Please enter a valid email.' });
  try {
    await ensureMultiEventSchema();
    await query(
      `INSERT INTO leads (email, event, city, source) VALUES ($1, $2, $3, $4) ON CONFLICT (email, event, city) DO NOTHING`,
      [email, ev.id, city.id, String(b.source || '').slice(0, 80) || null],
    );
    await logEvent('lead', { event: ev.id, city: city.id });
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Please try again.' });
  }
}
