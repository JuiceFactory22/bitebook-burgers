// Starts a Stripe checkout for one event + city (POST { event, city, source }).
// Returns the client secret the page uses to show Stripe's checkout form inline.
// Prices live here on the server (from config.js), never in the browser.
import { EVENTS, CITIES, SITE_URL } from '../lib/config.js';
import { createCheckoutSession, isTestKey } from '../lib/stripe.js';
import { query, logEvent, ensureMultiEventSchema } from '../lib/db.js';

function originFor(req) {
  // Preview deployments return to themselves; the live site always returns to getbitebook.com
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '');
  if (/^[a-z0-9-]+\.vercel\.app$/i.test(host) || /^localhost(:\d+)?$/.test(host)) return `${host.startsWith('localhost') ? 'http' : 'https'}://${host}`;
  return SITE_URL;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST' });
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  const ev = EVENTS[String(body?.event || '')];
  const city = CITIES[String(body?.city || '')];
  if (!ev || !ev.onSale || !ev.priceCents) return res.status(400).json({ error: 'That event isn’t on sale.' });
  if (!city || !ev.cities.includes(city.id)) return res.status(400).json({ error: 'That city isn’t part of this event.' });
  const source = String(body?.source || '').slice(0, 80) || null; // e.g. "ig", "fb-ad", "dm"

  try {
    const params = {
      mode: 'payment',
      ui_mode: 'embedded_page',
      line_items: [{
        price_data: {
          currency: 'usd',
          unit_amount: ev.priceCents,
          product_data: {
            name: `${ev.name} Passport · ${city.name}`,
            description: `One BiteBook passport for ${ev.name} in ${city.area}, ${ev.datesLabel}. Delivered by email.`,
            metadata: { event: ev.id, city: city.id },
          },
        },
        quantity: 1,
        adjustable_quantity: { enabled: true, minimum: 1, maximum: 10 },
      }],
      allow_promotion_codes: true,
      phone_number_collection: { enabled: true },
      consent_collection: { promotions: 'auto' },
      return_url: `${originFor(req)}/${ev.slug}/thanks?session_id={CHECKOUT_SESSION_ID}`,
      metadata: { event: ev.id, city: city.id, source: source || '' },
      payment_intent_data: {
        description: `BiteBook ${ev.name} passport · ${city.name}`,
        metadata: { event: ev.id, city: city.id },
      },
    };
    let session;
    try {
      session = await createCheckoutSession(params);
    } catch (e) {
      // The marketing-consent checkbox needs a one-time terms acceptance in Stripe's Checkout settings.
      // Until that's done, sell without the checkbox rather than not at all.
      if (!/consent_collection/i.test(String(e.message))) throw e;
      await logEvent('checkout_consent_unavailable', { error: String(e.message).slice(0, 200) });
      delete params.consent_collection;
      session = await createCheckoutSession(params);
    }

    try {
      await ensureMultiEventSchema();
      await query(
        `INSERT INTO checkouts (id, event, city, is_test, source) VALUES ($1, $2, $3, $4::int, $5) ON CONFLICT (id) DO NOTHING`,
        [session.id, ev.id, city.id, session.livemode === false || isTestKey() ? '1' : '0', source],
      );
    } catch (e) { await logEvent('checkout_log_failed', { session: session.id, error: String(e.message || e) }); }

    return res.status(200).json({ clientSecret: session.client_secret });
  } catch (e) {
    console.error(e);
    await logEvent('checkout_error', { event: ev.id, city: city.id, error: String(e.message || e) });
    return res.status(500).json({ error: 'Checkout is having trouble right now. Please try again in a minute.' });
  }
}
