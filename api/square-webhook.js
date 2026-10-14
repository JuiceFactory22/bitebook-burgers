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
    let email = null;
    if (result.status === 'ok') email = await emailOrder(result.orderId);
    await logEvent('webhook', { type, paymentId, status: result.status, orderId: result.orderId, email: email?.status });
    return res.status(200).json({ ok: true, status: result.status, email: email?.status });
  } catch (e) {
    console.error(e);
    await logEvent('webhook_error', { type, paymentId, error: String(e.message || e) });
    // 500 makes Square retry later
    return res.status(500).json({ ok: false });
  }
}
