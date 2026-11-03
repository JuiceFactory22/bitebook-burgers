// One backend function for passport sales (keeps the site under Vercel's 12-function limit).
//   GET  /wings, /wings/<city>, /wings/thanks   -> sales pages      (lib/shop/pages.js)
//   POST /api/checkout                          -> start a checkout (lib/shop/checkout.js)
//   POST /api/stripe-webhook                    -> Stripe events    (lib/shop/webhook.js)
//   POST /api/notify                            -> "tell me when restaurants are announced"
//   GET  /terms                                 -> passport terms
// The friendly URLs are mapped here in vercel.json.
import pages from '../lib/shop/pages.js';
import checkout from '../lib/shop/checkout.js';
import webhook from '../lib/shop/webhook.js';
import notify from '../lib/shop/notify.js';

export const config = { api: { bodyParser: false } }; // the webhook needs the raw body to check Stripe's signature

export default async function handler(req, res) {
  const op = String(req.query.op || 'page');
  if (op === 'webhook') return webhook(req, res);
  if (op === 'checkout' || op === 'notify') {
    // Body parsing is off for this function, so read the small JSON body here
    if (req.method === 'POST' && (req.body === undefined || typeof req.body !== 'object')) {
      let raw = '';
      try { for await (const c of req) raw += c; } catch { raw = ''; }
      try { req.body = raw ? JSON.parse(raw) : {}; } catch { req.body = {}; }
    }
    return op === 'notify' ? notify(req, res) : checkout(req, res);
  }
  return pages(req, res);
}
