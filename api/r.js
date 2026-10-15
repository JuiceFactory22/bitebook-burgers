// Coupon redemption page: getbitebook.com/r/<token>
// GET shows the coupon; POST (the big Redeem button) redeems it once.
import { getCoupon, redeemCoupon } from '../lib/passports.js';
import { restaurantById } from '../lib/restaurants.js';
import { CITIES, EVENT, eventWindow, formatLocal, SUPPORT_EMAIL } from '../lib/config.js';
import { page, esc, CHECK_SVG, X_SVG } from '../lib/html.js';
import { passportLabel } from '../lib/passports.js';
import { logEvent } from '../lib/db.js';

function firstName(n) {
  const s = String(n || '').trim();
  if (!s) return 'Guest';
  const parts = s.split(/\s+/);
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : parts[0];
}

function dealBlock(r) {
  return `<div class="deal"><div class="big">${esc(r.deal)}</div><div style="font-size:15px;font-weight:500">${esc(r.condition)}</div>${
    r.terms.length ? `<div class="mono" style="color:var(--ink);letter-spacing:.5px">${esc(r.terms.join(' · '))}</div>` : ''}</div>`;
}

function notFound() {
  return page({
    title: 'Coupon not found',
    body: `<div class="banner" style="background:var(--usedred)">${X_SVG}<h1>Coupon not found</h1><div style="font-weight:600">Do not honor this code.</div></div>
<main><p class="muted">This QR code doesn't match any BiteBook coupon. If the guest thinks this is a mistake, they can email ${esc(SUPPORT_EMAIL)}.</p></main>`,
  });
}

function readyPage(c, r, token, note) {
  const city = CITIES[c.city];
  return page({
    title: `Redeem – ${r.name}`,
    body: `<main>
  <span class="pill" style="background:var(--green)">✓ VALID · NOT YET USED</span>
  ${note ? `<div class="card" style="border-color:var(--red)"><b>${esc(note)}</b></div>` : ''}
  <div style="display:flex;flex-direction:column;gap:6px">
    <div class="mono">THIS COUPON IS FOR</div>
    <h1>${esc(r.name)}</h1>
    <div class="muted" style="font-size:14px">${esc(r.address)}</div>
  </div>
  ${dealBlock(r)}
  <div class="row" style="border-top:1.5px dashed var(--ink);padding-top:14px"><span class="muted">Guest</span><b>${esc(firstName(c.name))} · ${esc(passportLabel(c.passport_id))}</b></div>
  <div class="row"><span class="muted">Valid through</span><b>Nov 15, 2026</b></div>
  <form method="post" style="margin-top:12px" onsubmit="this.querySelector('button').disabled=true;this.querySelector('button').textContent='Redeeming…'">
    <button class="btn" type="submit">REDEEM</button>
  </form>
  <p class="muted" style="text-align:center;font-size:13px;margin:0">Tap once when the guest orders.<br>Not ${esc(r.name)}? Don't tap — this coupon is for them.</p>
</main>`,
  });
}

function donePage(c, r, when) {
  return page({
    title: 'Redeemed',
    body: `<main style="text-align:center;align-items:stretch">
  <div class="check">${CHECK_SVG}</div>
  <h1 style="font-size:44px;margin-top:8px">Redeemed!</h1>
  <div>Give the guest their deal:</div>
  ${dealBlock(r)}
  <div class="stamp"><div style="font-size:12px;letter-spacing:2px">${esc(r.name.toUpperCase())}</div><div style="font-size:16px">${esc(formatLocal(when, c.city))}</div></div>
  <div class="muted" style="font-size:14px">${esc(firstName(c.name))} · Passport ${esc(passportLabel(c.passport_id))}</div>
  <p class="muted" style="font-size:13px">This coupon can't be used again. You can close this page.</p>
</main>`,
  });
}

function usedPage(c, r) {
  return page({
    title: 'Already redeemed',
    body: `<div class="banner" style="background:var(--usedred)">${X_SVG}<h1>Already redeemed</h1><div style="font-weight:600;font-size:16px">Do not honor this coupon.</div></div>
<main>
  <div class="mono">FIRST USED</div>
  <div class="card">
    <div class="row"><span class="muted">Date</span><b>${esc(formatLocal(c.redeemed_at, c.city))}</b></div>
    <div class="row"><span class="muted">Restaurant</span><b>${esc(r.name)}</b></div>
    <div class="row"><span class="muted">Deal</span><b>${esc(r.deal)}</b></div>
    <div class="row"><span class="muted">Guest</span><b>${esc(firstName(c.name))} · ${esc(passportLabel(c.passport_id))}</b></div>
  </div>
  <p class="muted" style="font-size:14px">Each BiteBook coupon works once. If the guest thinks this is a mistake, they can contact BiteBook at ${esc(SUPPORT_EMAIL)}.</p>
</main>`,
  });
}

function windowPage(r, msg) {
  return page({
    title: msg,
    body: `<div class="banner" style="background:var(--ink)"><h1 style="color:var(--paper)">${esc(msg)}</h1></div>
<main>
  <div class="mono">THIS COUPON IS FOR</div>
  <h1>${esc(r.name)}</h1>
  ${dealBlock(r)}
  <p class="muted" style="font-size:14px">${esc(EVENT.name)} coupons work ${esc(EVENT.datesLabel)}. Please don't honor this coupon today.</p>
</main>`,
  });
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  const token = String(req.query.t || '').trim();
  // Practice coupons for staff training: /r/demo-<restaurantId>. Never touches the database.
  if (token.startsWith('demo-')) {
    const r = restaurantById(token.slice(5));
    if (!r || !r.active) return res.status(404).send(notFound());
    const fake = { city: r.city, name: 'Practice Guest', passport_id: 'bbPRACTICE00000000' };
    if (req.method === 'POST') return res.status(200).send(donePage(fake, r, new Date()));
    return res.status(200).send(readyPage(fake, r, token, 'PRACTICE COUPON — nothing gets used up. Scan & tap as much as you like.'));
  }
  try {
    const c = token ? await getCoupon(token) : null;
    const r = c && restaurantById(c.restaurant_id);
    if (!c || !r) return res.status(404).send(notFound());

    const isTest = Number(c.is_test) === 1;
    const now = new Date();
    const { start, end } = eventWindow(c.city);
    if (!isTest && now < start) return res.status(200).send(windowPage(r, 'Not valid yet — starts Oct 15'));
    if (!isTest && now >= end) return res.status(200).send(windowPage(r, 'This event has ended'));

    if (req.method === 'POST') {
      const done = await redeemCoupon(token);
      if (done) {
        await logEvent('redeem', { token, restaurant: r.id, passport: c.passport_id });
        return res.status(200).send(donePage(c, r, done.redeemed_at));
      }
      const fresh = await getCoupon(token);
      return res.status(200).send(usedPage(fresh, r));
    }

    if (c.redeemed_at) return res.status(200).send(usedPage(c, r));
    return res.status(200).send(readyPage(c, r, token, isTest ? 'TEST PASSPORT — not a real purchase' : ''));
  } catch (e) {
    console.error(e);
    return res.status(500).send(page({
      title: 'Something went wrong',
      body: `<main><h1>Something went wrong</h1><p class="muted">Please try scanning again in a moment. If it keeps happening, honor the coupon if it looks right and email ${esc(SUPPORT_EMAIL)}.</p></main>`,
    }));
  }
}
