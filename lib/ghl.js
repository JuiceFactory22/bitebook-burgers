// Sends leads, buyers and redemptions into GoHighLevel (GHL), one sub-account per city.
//
// Setup, per city (Vercel > Settings > Environment Variables):
//   GHL_TOKEN_DENVER, GHL_TOKEN_NASHVILLE, GHL_TOKEN_PHOENIX
//   = the Private Integration key from that city's GHL (Settings > Private Integrations).
// A city with no key is skipped quietly, so this can go live one city at a time.
//
// In each city's GHL this expects (created Nov 19, 2026 in Denver):
//   - a pipeline named "Buyers" with the stages listed in STAGE_ORDER below
//   - the contact fields in FIELD below (looked up by their field key, so the ids don't matter)
//
// Nothing here may ever break a checkout, a redemption or a coupon claim: every call is wrapped,
// failures are logged as 'ghl_error' events, and the caller carries on.
import { CITIES, EVENTS, SITE_URL, eventOf } from './config.js';
import { restaurantById, loadLineups } from './restaurants.js';
import { query, logEvent } from './db.js';

const API = 'https://services.leadconnectorhq.com';
const VERSION = '2021-07-28';

// Public sub-account ids (not secret)
export const GHL_LOCATIONS = {
  denver: 'gctapaTmJkPC2kmepKF4',
  nashville: 'uAUhsVtOHRE4OjStkzFi',
  phoenix: 'ErEDyfTjrbtK5y8IzSVT',
};

const PIPELINE_NAME = 'Buyers';

// Stage order: an automatic update only ever moves a card forward in this list.
const STAGE_ORDER = [
  'New Lead', 'Passport Offer Sent', 'Coupon Redeemed', 'Engaged', 'Started Checkout',
  'Purchased', 'Redeeming', 'Event Ended', 'Next Event Invite Sent', 'Interested',
];
// "Not Now" is a parking spot: any automatic move takes a card out of it.
// "Refunded" is left alone except by a new purchase.
// Opting out of texts/email is not a stage: GHL's Do Not Disturb + the Text Opt-In field hold it,
// so an opted-out contact who buys still moves to Purchased like anyone else.
const PARKED = 'Not Now';
const REFUNDED = 'Refunded';

// Contact fields, by GHL field key
const FIELD = {
  leadSource: 'contact.lead_source',
  freeCouponLink: 'contact.free_coupon_link',
  freeCouponRestaurant: 'contact.free_coupon_restaurant',
  passportLink: 'contact.passport_link',
  textOptIn: 'contact.text_optin',
  textOptInSource: 'contact.text_optin_source',
  eventsBought: 'contact.events_bought',
  lastPurchaseDate: 'contact.last_purchase_date',
  lastAmountPaid: 'contact.last_amount_paid',
  lastPromoCode: 'contact.last_promo_code',
  lastStripeOrderId: 'contact.last_stripe_order_id',
  refunded: 'contact.refunded',
  redemptionCount: 'contact.redemption_count',
  lastRestaurantRedeemed: 'contact.last_restaurant_redeemed',
  lastRedemptionDate: 'contact.last_redemption_date',
  redemptionLog: 'contact.redemption_log',
};

export function ghlEnabled(cityId) {
  return Boolean(GHL_LOCATIONS[cityId] && process.env[`GHL_TOKEN_${String(cityId).toUpperCase()}`]);
}

async function call(cityId, method, path, body) {
  const token = process.env[`GHL_TOKEN_${String(cityId).toUpperCase()}`];
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Version: VERSION,
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(8000),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`GHL ${method} ${path.split('?')[0]} -> ${res.status}: ${JSON.stringify(json).slice(0, 300)}`);
  return json;
}

// Pipeline + stage ids and field ids, looked up once per warm function and reused
const setupCache = {};
async function setup(cityId) {
  if (setupCache[cityId]) return setupCache[cityId];
  const loc = GHL_LOCATIONS[cityId];
  const [pipes, fields] = await Promise.all([
    call(cityId, 'GET', `/opportunities/pipelines?locationId=${loc}`),
    call(cityId, 'GET', `/locations/${loc}/customFields`),
  ]);
  const pipeline = (pipes.pipelines || []).find((p) => p.name.trim().toLowerCase() === PIPELINE_NAME.toLowerCase());
  if (!pipeline) throw new Error(`No "${PIPELINE_NAME}" pipeline in GHL ${cityId}`);
  const stages = Object.fromEntries((pipeline.stages || []).map((s) => [s.name.trim(), s.id]));
  const fieldIds = Object.fromEntries((fields.customFields || []).map((f) => [f.fieldKey, f.id]));
  setupCache[cityId] = { loc, pipelineId: pipeline.id, stages, fieldIds };
  return setupCache[cityId];
}

function customFields(s, values) {
  return Object.entries(values)
    .filter(([k, v]) => v !== undefined && v !== null && s.fieldIds[FIELD[k]])
    .map(([k, v]) => ({ id: s.fieldIds[FIELD[k]], key: FIELD[k].replace('contact.', ''), fieldValue: v }));
}

function splitName(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  return { firstName: parts[0] || undefined, lastName: parts.slice(1).join(' ') || undefined };
}

// US numbers to +1XXXXXXXXXX so GHL matches the same person across forms
export function normalizePhone(p) {
  const d = String(p || '').replace(/\D/g, '');
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d.startsWith('1')) return `+${d}`;
  return d ? `+${d}` : null;
}

async function upsertContact(cityId, s, { name, email, phone, source, fields }) {
  const body = {
    locationId: s.loc,
    ...splitName(name),
    email: email || undefined,
    phone: normalizePhone(phone) || undefined,
    source: source || 'getbitebook.com',
    customFields: customFields(s, fields || {}),
  };
  if (!body.email && !body.phone) throw new Error('No email or phone to match on');
  const r = await call(cityId, 'POST', '/contacts/upsert', body);
  return r.contact?.id;
}

async function addTags(cityId, contactId, tags) {
  const list = [...new Set(tags.filter(Boolean))];
  if (list.length) await call(cityId, 'POST', `/contacts/${contactId}/tags`, { tags: list });
}

async function removeTags(cityId, contactId, tags) {
  if (tags.length) await call(cityId, 'DELETE', `/contacts/${contactId}/tags`, { tags });
}

// Put the contact's card in `stageName`, but only move forward (see STAGE_ORDER notes above)
async function moveCard(cityId, s, contactId, stageName, { name, value, force = false } = {}) {
  const stageId = s.stages[stageName];
  if (!stageId) throw new Error(`No "${stageName}" stage in GHL ${cityId} ${PIPELINE_NAME}`);
  const found = await call(cityId, 'GET',
    `/opportunities/search?location_id=${s.loc}&pipeline_id=${s.pipelineId}&contact_id=${contactId}&limit=1`);
  const current = (found.opportunities || [])[0];
  if (current) {
    const currentName = Object.keys(s.stages).find((n) => s.stages[n] === current.pipelineStageId) || '';
    if (currentName === REFUNDED && stageName !== 'Purchased') return 'refunded';
    const from = STAGE_ORDER.indexOf(currentName);
    const to = STAGE_ORDER.indexOf(stageName);
    if (!force && currentName !== PARKED && currentName !== REFUNDED && from >= to) return 'kept';
  }
  await call(cityId, 'POST', '/opportunities/upsert', {
    locationId: s.loc,
    pipelineId: s.pipelineId,
    contactId,
    ...(current ? { id: current.id } : { name: name || 'BiteBook contact' }),
    pipelineStageId: stageId,
    status: 'open',
    ...(value !== undefined ? { monetaryValue: value } : {}),
  });
  return 'moved';
}

async function safely(kind, cityId, detail, fn) {
  if (!ghlEnabled(cityId)) return 'skipped';
  try {
    const s = await setup(cityId);
    const r = await fn(s);
    await logEvent('ghl_sync', { kind, city: cityId, ...detail, result: r || 'ok' });
    return r || 'ok';
  } catch (e) {
    console.error('GHL', kind, e);
    await logEvent('ghl_error', { kind, city: cityId, ...detail, error: String(e.message || e).slice(0, 400) });
    return 'error';
  }
}

// e.g. "bought: wing month 2026" (the year the event starts). New events get their tag automatically.
export const eventTag = (ev) => `bought: ${ev.name.toLowerCase()} ${ev.startDate.slice(0, 4)}`;
const dateOnly = (d) => new Date(d).toISOString().slice(0, 10);

// Everything the site knows about this person's purchases and redemptions, from the database
async function historyFor(email) {
  await loadLineups(); // wheel + coupons from the backend sheet (lib/restaurants.js)
  if (!email) return { events: [], redemptions: [] };
  const events = await query(
    `SELECT DISTINCT COALESCE(p.event, 'burger') AS event FROM passports p
     WHERE lower(p.email) = lower($1) AND COALESCE(p.source, '') <> 'free' AND to_jsonb(p)->>'voided_at' IS NULL`, [email]).catch(() => []);
  const redemptions = await query(
    `SELECT c.restaurant_id, c.redeemed_at FROM coupons c JOIN passports p ON p.id = c.passport_id
     WHERE lower(p.email) = lower($1) AND c.redeemed_at IS NOT NULL ORDER BY c.redeemed_at`, [email]).catch(() => []);
  return { events: events.map((r) => r.event), redemptions };
}

function redemptionFields(redemptions, cityId) {
  if (!redemptions.length) return {};
  const last = redemptions[redemptions.length - 1];
  const fmt = (d) => new Intl.DateTimeFormat('en-US', { timeZone: CITIES[cityId].tz, month: 'short', day: 'numeric' }).format(new Date(d));
  return {
    redemptionCount: redemptions.length,
    lastRestaurantRedeemed: restaurantById(last.restaurant_id)?.name || last.restaurant_id,
    lastRedemptionDate: dateOnly(last.redeemed_at),
    redemptionLog: redemptions.map((r) => `${fmt(r.redeemed_at)} - ${restaurantById(r.restaurant_id)?.name || r.restaurant_id}`).join('\n'),
  };
}

// 1) Free coupon claimed on the spinner page -> New Lead
export function syncFreeCoupon({ cityId, name, email, phone, textOptIn, passportId, restaurant, ev, retest = false }) {
  return safely('free_coupon', cityId, { passport: passportId }, async (s) => {
    const contactId = await upsertContact(cityId, s, {
      name, email, phone, source: 'BiteBook spinner',
      fields: {
        leadSource: 'free coupon',
        freeCouponLink: `${SITE_URL}/book/${passportId}`,
        freeCouponRestaurant: restaurant.name,
        ...(textOptIn ? { textOptIn: 'yes', textOptInSource: 'coupon form' } : {}),
      },
    });
    // Test numbers (SPIN_TEST_PHONES): clear the coupon tags first, so re-adding them fires the GHL workflows again
    if (retest) await removeTags(cityId, contactId, ['lead: free coupon', 'text opt-in: yes', 'text opt-in asked']);
    // Opt-in tag first: the GHL free-coupon workflow fires on 'lead: free coupon'
    // and branches on 'text opt-in: yes', so it must already be on the contact.
    if (textOptIn) await addTags(cityId, contactId, ['text opt-in: yes']);
    await addTags(cityId, contactId, ['lead', 'lead: free coupon']);
    return moveCard(cityId, s, contactId, 'New Lead', { name: `${name || email} (${ev.name} free coupon)` });
  });
}

// 2) Purchase (Stripe) -> Purchased
export function syncPurchase({ cityId, ev, name, email, phone, orderId, amountCents, promoCode, textOptIn, passports, isTest }) {
  return safely('purchase', cityId, { order: orderId }, async (s) => {
    const h = await historyFor(email);
    const events = [...new Set([...h.events, ev.id])].map((id) => EVENTS[id]?.name || id);
    const contactId = await upsertContact(cityId, s, {
      name, email, phone, source: 'BiteBook checkout',
      fields: {
        eventsBought: events.join(', '),
        lastPurchaseDate: dateOnly(Date.now()),
        lastAmountPaid: Number(amountCents || 0) / 100,
        lastPromoCode: promoCode || '',
        lastStripeOrderId: orderId,
        refunded: 'no',
        passportLink: passports?.[0] ? `${SITE_URL}/book/${passports[0].id}` : undefined,
        ...(textOptIn ? { textOptIn: 'yes', textOptInSource: 'checkout' } : {}),
        ...redemptionFields(h.redemptions, cityId),
      },
    });
    await addTags(cityId, contactId, [
      'customer', eventTag(ev), promoCode ? `code: ${promoCode.toLowerCase()}` : null,
      h.events.some((e) => e !== ev.id) ? 'repeat buyer' : null,
      textOptIn ? 'text opt-in: yes' : null, isTest ? 'test' : null,
    ]);
    await removeTags(cityId, contactId, ['checkout abandoned']).catch(() => {});
    return moveCard(cityId, s, contactId, 'Purchased', {
      name: `${name || email} (${ev.name})`, value: Number(amountCents || 0) / 100, force: true,
    });
  });
}

// 3) Checkout started but not paid (Stripe expired the session) -> Started Checkout
export function syncAbandoned({ cityId, ev, name, email, phone, textOptIn }) {
  return safely('abandoned', cityId, { event: ev.id }, async (s) => {
    const contactId = await upsertContact(cityId, s, {
      name, email, phone, source: 'BiteBook checkout',
      fields: { ...(textOptIn ? { textOptIn: 'yes', textOptInSource: 'checkout' } : {}) },
    });
    await addTags(cityId, contactId, ['lead', 'checkout abandoned', textOptIn ? 'text opt-in: yes' : null]);
    return moveCard(cityId, s, contactId, 'Started Checkout', { name: `${name || email} (${ev.name} checkout)` });
  });
}

// 4) A coupon was redeemed (restaurant tapped Redeem) -> Coupon Redeemed (free coupon) or Redeeming (bought book)
//    The "new redemption" tag is removed and re-added so the feedback workflow fires every time.
export function syncRedemption({ passport, restaurantId }) {
  const cityId = passport.city;
  return safely('redemption', cityId, { passport: passport.id, restaurant: restaurantId }, async (s) => {
    const h = await historyFor(passport.email);
    const free = passport.source === 'free';
    const contactId = await upsertContact(cityId, s, {
      name: passport.name, email: passport.email, phone: passport.phone,
      fields: redemptionFields(h.redemptions, cityId),
    });
    await removeTags(cityId, contactId, ['new redemption']).catch(() => {});
    await addTags(cityId, contactId, ['new redemption', free ? 'free coupon redeemed' : null]);
    const ev = eventOf(passport);
    return moveCard(cityId, s, contactId, free ? 'Coupon Redeemed' : 'Redeeming', { name: `${passport.name || passport.email} (${ev.name})` });
  });
}

// 5) "Email me new restaurants" sign-up on a sales page -> New Lead (email only)
export function syncSignup({ cityId, ev, email }) {
  return safely('signup', cityId, { event: ev.id }, async (s) => {
    const contactId = await upsertContact(cityId, s, { email, source: 'BiteBook website signup', fields: { leadSource: 'website signup' } });
    await addTags(cityId, contactId, ['lead', 'lead: website signup']);
    return moveCard(cityId, s, contactId, 'New Lead', { name: `${email} (${ev.name} signup)` });
  });
}
