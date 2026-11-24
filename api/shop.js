// One backend function for passport sales (keeps the site under Vercel's 12-function limit).
//   GET  /wings, /wings/<city>, /wings/thanks   -> sales pages      (lib/shop/pages.js)
//   POST /api/checkout                          -> start a checkout (lib/shop/checkout.js)
//   POST /api/stripe-webhook                    -> Stripe events    (lib/shop/webhook.js)
//   POST /api/notify                            -> "tell me when restaurants are announced"
//   GET  /spin/<event>/<city>, POST /api/spin         -> free-coupon spinner (lib/shop/spin.js)
//   GET  /terms                                 -> passport terms
//   GET  /reserve?city=...                      -> restaurant sign-up page (lib/shop/reserve.js)
// The friendly URLs are mapped here in vercel.json.
import pages from '../lib/shop/pages.js';
import spin from '../lib/shop/spin.js';
import { logEvent } from '../lib/db.js';
// Only the pages visitors land on load up front; the rest load when first needed. The Stripe webhook pulls in
// the PDF library, which alone added ~150-250 ms to every cold start of the spin page.
// (Literal paths so Vercel still bundles these files.)
const checkout = async (req, res) => (await import('../lib/shop/checkout.js')).default(req, res);
const webhook = async (req, res) => (await import('../lib/shop/webhook.js')).default(req, res);
const notify = async (req, res) => (await import('../lib/shop/notify.js')).default(req, res);
const reserve = async (req, res) => (await import('../lib/shop/reserve.js')).default(req, res);

export const config = { api: { bodyParser: false } }; // the webhook needs the raw body to check Stripe's signature

export default async function handler(req, res) {
  try {
    return await route(req, res);
  } catch (e) {
    console.error(e);
    await logEvent('page_error', { path: String(req.url || '').split('?')[0].slice(0, 120), error: String(e.message || e).slice(0, 200) });
    if (!res.headersSent) res.status(500).send('Something went wrong. Please try again in a minute.');
  }
}

async function route(req, res) {
  const op = String(req.query.op || 'page');
  if (op === 'webhook') return webhook(req, res);
  if (op === 'reserve') return reserve(req, res);
  if (op === 'checkout' || op === 'notify' || op === 'spin') {
    // Body parsing is off for this function, so read the small JSON body here
    if (req.method === 'POST' && (req.body === undefined || typeof req.body !== 'object')) {
      let raw = '';
      try { for await (const c of req) raw += c; } catch { raw = ''; }
      try { req.body = raw ? JSON.parse(raw) : {}; } catch { req.body = {}; }
    }
    if (op === 'spin') return spin(req, res);
    return op === 'notify' ? notify(req, res) : checkout(req, res);
  }
  return pages(req, res);
}
