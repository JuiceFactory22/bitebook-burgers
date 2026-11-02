// Turning paid orders into passports and emailing them
import { query, logEvent } from './db.js';
import { createPassportsForOrder, ensureCoupons } from './passports.js';
import { buildPassportPdf } from './pdf.js';
import { sendPassportEmail, sendTeamAlert } from './email.js';
import { esc } from './html.js';
import { getOrder, getPayment, getCustomer, isPaid, orderDetails } from './square.js';
import { SQUARE_LOCATION_ID } from './config.js';

// Create passports for a Square order if (and only if) it is fully paid
export async function processOrder(order, paymentFallback) {
  if (!isPaid(order)) return { status: 'not_paid', orderId: order?.id };
  let d = orderDetails(order, paymentFallback);
  // No shipping form at checkout: get the email from the payment, and the name from the customer profile
  if (!d.email || !d.name) {
    try {
      const pay = paymentFallback?.id ? paymentFallback : await getPayment(order.tenders?.[0]?.payment_id);
      if (!d.email && pay?.buyer_email_address) d = { ...d, email: pay.buyer_email_address };
      const custId = order.customer_id || pay?.customer_id;
      if (custId && (!d.name || !d.email || !d.phone)) {
        const c = await getCustomer(custId);
        if (c) d = { ...d, name: d.name || [c.given_name, c.family_name].filter(Boolean).join(' ') || null,
          email: d.email || c.email_address || null, phone: d.phone || c.phone_number || null };
      }
    } catch (e) { await logEvent('buyer_lookup_failed', { order: order.id, error: String(e.message || e) }); }
  }
  if (d.unknownItems.length) {
    await logEvent('unknown_items', { order: order.id, items: d.unknownItems });
    await alertHeldOrder(order.id, d);
  }
  if (!d.books.length) return { status: 'no_books', orderId: order.id };
  const passports = await createPassportsForOrder({ orderId: order.id, books: d.books, name: d.name, email: d.email, phone: d.phone });
  return { status: 'ok', orderId: order.id, passports, email: d.email };
}

// Email the team once per order when a paid Square order has items that aren't Burger Blastoff books
async function alertHeldOrder(orderId, d) {
  try {
    const already = await query(
      `SELECT 1 FROM events WHERE kind = 'held_order_alert' AND detail::jsonb->>'order' = $1 LIMIT 1`,
      [orderId],
    );
    if (already.length) return;
    const rows = [
      ['Order', orderId], ['Name', d.name], ['Email', d.email], ['Phone', d.phone],
      ['Items held', d.unknownItems.join(', ')],
      ['Burger passports also in this order', String(d.books.length)],
    ].map(([k, v]) => `<tr><td style="padding:4px 10px;font-weight:bold">${esc(k)}</td><td style="padding:4px 10px">${esc(v || '—')}</td></tr>`).join('');
    await sendTeamAlert({
      subject: `Held Square order — not a Burger Blastoff book (${d.name || d.email || orderId})`,
      html: `<div style="font-family:Arial,sans-serif;max-width:560px">
        <p>A paid Square order included items that aren't Burger Blastoff books. <b>No passport was created or emailed for these items.</b> Please follow up with the buyer.</p>
        <table style="border-collapse:collapse;font-size:14px">${rows}</table></div>`,
    });
    await logEvent('held_order_alert', { order: orderId });
  } catch (e) {
    await logEvent('held_order_alert_failed', { order: orderId, error: String(e.message || e) });
  }
}

// Webhook path: verify with Square that the payment is real and completed
export async function processPaymentId(paymentId) {
  const payment = await getPayment(paymentId);
  if (!payment || payment.status !== 'COMPLETED') return { status: 'payment_not_completed', paymentId };
  if (payment.location_id !== SQUARE_LOCATION_ID) return { status: 'other_location', paymentId };
  if (!payment.order_id) return { status: 'no_order', paymentId };
  const order = await getOrder(payment.order_id);
  return processOrder(order, payment);
}

// Email an order's passports once. Claims them first so two triggers can't double-send.
export async function emailOrder(orderId, { force = false } = {}) {
  const claimed = force
    ? await query('UPDATE passports SET emailed_at = now() WHERE order_id = $1 RETURNING *', [orderId])
    : await query('UPDATE passports SET emailed_at = now() WHERE order_id = $1 AND emailed_at IS NULL RETURNING *', [orderId]);
  if (!claimed.length) return { status: 'already_sent', orderId };
  const passports = claimed.sort((a, b) => Number(a.book_index) - Number(b.book_index));
  const to = passports[0].email;
  if (!to) {
    await query('UPDATE passports SET emailed_at = NULL WHERE order_id = $1', [orderId]);
    await logEvent('no_email', { orderId });
    return { status: 'no_email', orderId };
  }
  try {
    const pdfs = [];
    for (const p of passports) {
      const coupons = await ensureCoupons(p);
      pdfs.push(await buildPassportPdf({ passport: p, coupons }));
    }
    const result = await sendPassportEmail({ to, name: passports[0].name, passports, pdfs });
    await logEvent('email_sent', { orderId, to, resendId: result.id, books: passports.length });
    return { status: 'sent', orderId, to, books: passports.length };
  } catch (e) {
    await query('UPDATE passports SET emailed_at = NULL WHERE order_id = $1', [orderId]);
    await logEvent('email_failed', { orderId, error: String(e.message || e) });
    return { status: 'failed', orderId, error: String(e.message || e) };
  }
}
