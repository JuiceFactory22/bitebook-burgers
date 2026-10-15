// Square calls this when a payment is created/updated.
// We never trust the notification itself: we look the payment up with Square and only
// create a passport when Square says it is COMPLETED at the BiteBook location.
import { processPaymentId, emailOrder } from '../lib/delivery.js';
import { logEvent } from '../lib/db.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(200).json({ ok: true });
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  const type = body?.type || '';
  const paymentId = body?.data?.object?.payment?.id;
  if (!type.startsWith('payment.') || !paymentId) return res.status(200).json({ ignored: true });
  try {
    const result = await processPaymentId(paymentId);
    // Passports are created here but NOT emailed. Emails only go out when Will
    // gives the go-ahead (admin "send" action), unless AUTO_SEND is turned on later.
    // Automatic delivery starts at each city's 8am kickoff send (Oct 15)
    const AUTO_FROM = { nashville: '2026-10-15T13:00:00Z', phoenix: '2026-10-15T15:00:00Z' };
    let email = null;
    const city = result.passports?.[0]?.city;
    const autoOn = process.env.AUTO_SEND === 'on' || (city && AUTO_FROM[city] && Date.now() >= Date.parse(AUTO_FROM[city]));
    if (result.status === 'ok' && autoOn) email = await emailOrder(result.orderId);
    await logEvent('webhook', { type, paymentId, status: result.status, orderId: result.orderId, email: email?.status || 'held' });
    return res.status(200).json({ ok: true, status: result.status });
  } catch (e) {
    console.error(e);
    await logEvent('webhook_error', { type, paymentId, error: String(e.message || e) });
    // 500 makes Square retry later
    return res.status(500).json({ ok: false });
  }
}
