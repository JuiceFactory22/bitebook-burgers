// Starts a Stripe checkout for one event + city (POST { event, city, source }).
// Returns the client secret the page uses to show Stripe's checkout form inline.
// Prices live here on the server (from config.js), never in the browser.
import { EVENTS, CITIES, SITE_URL } from '../config.js';
import { createCheckoutSession, isTestKey } from '../stripe.js';
import { query, logEvent, ensureMultiEventSchema } from '../db.js';

function originFor(req) {
  // Preview deployments return to themselves; the live site always returns to getbitebook.com
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '');
  if (/^[a-z0-9-]+\.vercel\.app$/i.test(host) || /^localhost(:\d+)?$/.test(host)) return `${host.startsWith('localhost') ? 'http' : 'https'}://${host}`;
  return SITE_URL.replace('://getbitebook.com', '://www.getbitebook.com'); // the bare domain redirects to www
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
      // Marketing opt-in checkbox + "I agree to the passport terms" checkbox
      consent_collection: { promotions: 'auto', terms_of_service: 'required' },
      custom_text: {
        submit: { message: `Your passport arrives by email when ${ev.name} kicks off on ${ev.startLabel}. Not happy? Full refund, no hassle.` },
        terms_of_service_acceptance: { message: 'I agree to the [BiteBook passport terms](https://www.getbitebook.com/terms).' },
      },
      branding_settings: {
        display_name: 'BiteBook',
        button_color: '#C8371D',
        background_color: '#FBF4E4',
        border_style: 'rounded',
        font_family: 'inter',
      },
      // Unfinished checkouts expire after 4 hours, so a reminder can go out the same day
      expires_at: Math.floor(Date.now() / 1000) + 4 * 3600,
      return_url: `${originFor(req)}/${ev.slug}/thanks?session_id={CHECKOUT_SESSION_ID}`,
      metadata: { event: ev.id, city: city.id, source: source || '' },
      payment_intent_data: {
        description: `BiteBook ${ev.name} passport · ${city.name}`,
        metadata: { event: ev.id, city: city.id },
      },
    };
    // Some options need a one-time setting in the Stripe Dashboard (marketing consent terms, a terms-of-service
    // URL in Public details). Until those are set, sell without that option rather than not at all.
    let session;
    for (let attempt = 0; ; attempt++) {
      try { session = await createCheckoutSession(params); break; } catch (e) {
        const msg = String(e.message || '');
        if (attempt > 3) throw e;
        if (/terms_of_service/i.test(msg) && params.consent_collection?.terms_of_service) {
          delete params.consent_collection.terms_of_service;
          delete params.custom_text.terms_of_service_acceptance;
        } else if (/consent_collection|promotions/i.test(msg) && params.consent_collection?.promotions) {
          delete params.consent_collection.promotions;
        } else if (/branding_settings/i.test(msg) && params.branding_settings) {
          delete params.branding_settings;
        } else throw e;
        if (params.consent_collection && !Object.keys(params.consent_collection).length) delete params.consent_collection;
        await logEvent('checkout_option_skipped', { error: msg.slice(0, 200) });
      }
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
