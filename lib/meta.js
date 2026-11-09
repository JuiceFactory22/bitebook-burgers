// Meta Conversions API: sends purchases to Meta straight from our server, so ad results still count
// buyers whose browser blocked the Pixel. The browser Pixel sends the same purchase with the same
// event ID (the Stripe checkout session ID), and Meta counts it once.
// Needs META_PIXEL_ID (lib/config.js) and the META_CAPI_TOKEN environment variable in Vercel.
// Optional: META_TEST_EVENT_CODE (from Events Manager > Test events) to see events land while testing.
import { createHash } from 'node:crypto';
import { META_PIXEL_ID } from './config.js';
import { logEvent } from './db.js';

const GRAPH = 'https://graph.facebook.com/v24.0';
const sha = (v) => createHash('sha256').update(v).digest('hex');
const norm = (v) => String(v ?? '').trim().toLowerCase();

// Meta wants phone numbers as digits with the country code (US numbers get a leading 1)
function normPhone(p) {
  let d = String(p || '').replace(/\D/g, '');
  if (d.length === 10) d = '1' + d;
  return d;
}

// The browser details we save at checkout start, so the server event can be matched to the ad click
export function browserDetails(req) {
  const cookies = Object.fromEntries(String(req.headers.cookie || '').split(';').map((c) => {
    const i = c.indexOf('=');
    return i < 0 ? [c.trim(), ''] : [c.slice(0, i).trim(), decodeURIComponent(c.slice(i + 1).trim())];
  }));
  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || String(req.headers['x-real-ip'] || '');
  return {
    meta_fbp: (cookies._fbp || '').slice(0, 200),
    meta_fbc: (cookies._fbc || '').slice(0, 400),
    meta_ip: ip.slice(0, 60),
    meta_ua: String(req.headers['user-agent'] || '').slice(0, 450),
  };
}

// Send one Purchase for a paid Stripe checkout session. Never throws: a Meta hiccup must not break an order.
export async function sendPurchase(session, { ev, city, quantity, url }) {
  const token = process.env.META_CAPI_TOKEN;
  const testCode = process.env.META_TEST_EVENT_CODE || '';
  if (!META_PIXEL_ID || !token) return 'meta_not_configured';
  if (session.livemode === false && !testCode) return 'meta_skipped_test_payment'; // keep Stripe test orders out of real ad data

  try {
    const d = session.customer_details || {};
    const m = session.metadata || {};
    const names = String(d.name || '').trim().split(/\s+/).filter(Boolean);
    const addr = d.address || {};
    const user = {};
    if (d.email) { user.em = [sha(norm(d.email))]; user.external_id = [sha(norm(d.email))]; }
    if (d.phone) user.ph = [sha(normPhone(d.phone))];
    if (names.length) user.fn = [sha(norm(names[0]))];
    if (names.length > 1) user.ln = [sha(norm(names[names.length - 1]))];
    if (addr.postal_code) user.zp = [sha(norm(addr.postal_code).replace(/\s/g, '').slice(0, 5))];
    if (addr.country) user.country = [sha(norm(addr.country))];
    if (m.meta_fbp) user.fbp = m.meta_fbp;
    if (m.meta_fbc) user.fbc = m.meta_fbc;
    if (m.meta_ip) user.client_ip_address = m.meta_ip;
    if (m.meta_ua) user.client_user_agent = m.meta_ua;

    const payload = {
      data: [{
        event_name: 'Purchase',
        event_time: Math.floor(Number(session.created || Date.now() / 1000)),
        event_id: session.id, // matches the browser Pixel's eventID on the thanks page
        action_source: 'website',
        event_source_url: url,
        user_data: user,
        custom_data: {
          currency: String(session.currency || 'usd').toUpperCase(),
          value: Number(session.amount_total || 0) / 100,
          num_items: quantity,
          content_type: 'product',
          content_ids: [`${ev.id}-${city.id}`],
          content_name: `${ev.name} Passport · ${city.name}`,
          content_category: ev.id,
        },
      }],
    };
    // Meta rejects events older than 7 days; use "now" for slow webhook retries
    if (Date.now() / 1000 - payload.data[0].event_time > 6 * 86400) payload.data[0].event_time = Math.floor(Date.now() / 1000);
    if (testCode) payload.test_event_code = testCode;

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5000);
    const res = await fetch(`${GRAPH}/${META_PIXEL_ID}/events?access_token=${encodeURIComponent(token)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: ctrl.signal,
    }).finally(() => clearTimeout(timer));
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      await logEvent('meta_capi_failed', { session: session.id, status: res.status, error: json?.error?.message || '' });
      return 'meta_failed';
    }
    await logEvent('meta_capi_sent', { session: session.id, received: json.events_received, test: !!testCode });
    return 'meta_sent';
  } catch (e) {
    await logEvent('meta_capi_failed', { session: session.id, error: String(e.message || e).slice(0, 200) }).catch(() => {});
    return 'meta_failed';
  }
}
