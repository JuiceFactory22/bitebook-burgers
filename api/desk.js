// Support desk for the BiteBook team: getbitebook.com/desk?k=<desk code>
// Look up buyers, resend or move passports, cancel passports, undo a mistaken redemption,
// and refund BiteBook payments (refunds are locked to the BiteBook Square location).
import { createHash, timingSafeEqual } from 'node:crypto';
import { page, esc } from '../lib/html.js';
import { DESK_TOKEN_SHA256 } from '../lib/desk-auth.js';
import { restaurantById } from '../lib/restaurants.js';
import { CITIES, SUPPORT_EMAIL } from '../lib/config.js';
import { passportLabel } from '../lib/passports.js';
import {
  findOrders, usedCoupons, paymentForOrder, refundOrder, cancelOrder, reissueOrder, resendOrder,
  undoCoupon, catchUpMissing, recentDeskActions,
} from '../lib/support-ops.js';

const authorized = (k) => {
  const a = createHash('sha256').update(String(k || '')).digest();
  const b = Buffer.from(DESK_TOKEN_SHA256, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
};
const money = (c) => `$${(Number(c || 0) / 100).toFixed(2)}`;
const day = (d) => (d ? new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' }) : '');
const cityName = (id) => CITIES[id]?.name || id;

const CSS = `<style>
  main { max-width: 860px !important; }
  .search { display:flex; gap:10px; flex-wrap:wrap; }
  .search input { flex:1 1 240px; min-width:0; font-size:17px; padding:12px 14px; border:2px solid var(--ink); border-radius:10px; background:var(--stub); color:var(--ink); }
  .b { display:inline-flex; align-items:center; justify-content:center; gap:6px; min-height:44px; padding:8px 16px; border:2px solid var(--ink); border-radius:10px; background:var(--stub); color:var(--ink); font:600 15px Inter, system-ui, sans-serif; cursor:pointer; text-decoration:none; box-shadow:0 3px 0 var(--ink); }
  .b.primary { background:var(--red); color:#fff; }
  .b.go { background:var(--mustard); }
  .b.danger { background:#fff; color:var(--usedred); border-color:var(--usedred); box-shadow:0 3px 0 var(--usedred); }
  .b:focus-visible, .search input:focus-visible, .inline input:focus-visible { outline:3px solid var(--mustard); outline-offset:2px; }
  .order { border:2px solid var(--ink); border-radius:14px; background:var(--stub); padding:16px; display:flex; flex-direction:column; gap:12px; }
  .order h2 { margin:0; font-family:'Bricolage Grotesque', sans-serif; font-weight:800; font-size:22px; }
  .meta { display:flex; flex-wrap:wrap; gap:4px 16px; font-size:14px; color:var(--muted); }
  .meta b { color:var(--ink); font-weight:600; }
  .pp { display:flex; flex-wrap:wrap; gap:8px; }
  .chip { font-family:'Space Mono', monospace; font-size:12px; font-weight:700; letter-spacing:.5px; padding:5px 10px; border-radius:999px; border:1.5px solid var(--ink); }
  .chip.ok { background:#E3F1E7; color:var(--green); border-color:var(--green); }
  .chip.off { background:#F6E1DC; color:var(--usedred); border-color:var(--usedred); }
  .pay { font-size:14px; padding:10px 12px; border-radius:10px; background:#F3EBDA; }
  .pay.warn { background:#F6E1DC; color:var(--usedred); }
  .actions { display:flex; flex-wrap:wrap; gap:10px; align-items:flex-end; }
  .inline { display:flex; gap:8px; flex-wrap:wrap; align-items:center; }
  .inline input[type=email] { min-width:0; flex:1 1 200px; font-size:15px; padding:10px 12px; border:2px solid var(--ink); border-radius:10px; background:#fff; }
  .used { font-size:14px; border-top:1px dashed #d9ccb2; padding-top:10px; display:flex; flex-direction:column; gap:6px; }
  .used form { display:inline; }
  .used .lnk { background:none; border:0; color:var(--red); text-decoration:underline; font:inherit; cursor:pointer; padding:0 0 0 6px; }
  .note { font-size:14px; color:var(--muted); }
  .ok-box { border:2px solid var(--green); background:#E3F1E7; border-radius:12px; padding:14px 16px; }
  .err-box { border:2px solid var(--usedred); background:#F6E1DC; border-radius:12px; padding:14px 16px; color:var(--usedred); }
  .confirm { border:2px solid var(--ink); border-radius:14px; background:var(--stub); padding:18px; display:flex; flex-direction:column; gap:12px; }
  .confirm ul { margin:0; padding-left:20px; display:flex; flex-direction:column; gap:4px; }
  h3 { margin:12px 0 0; font-family:'Bricolage Grotesque', sans-serif; font-weight:800; font-size:24px; }
  details { border:2px solid var(--ink); border-radius:12px; background:var(--stub); padding:12px 14px; }
  details summary { font-weight:600; cursor:pointer; font-size:16px; }
  details[open] summary { margin-bottom:8px; }
  .say { background:#F3EBDA; border-radius:12px 12px 12px 4px; padding:10px 12px; white-space:pre-line; font-size:15px; margin:6px 0; }
  .lbl { font-family:'Space Mono', monospace; font-size:11px; letter-spacing:1.2px; text-transform:uppercase; color:var(--red); margin-top:8px; }
  details ol { margin:4px 0; padding-left:20px; display:flex; flex-direction:column; gap:3px; font-size:15px; }
  .log { font-size:13px; }
  .log td { white-space:normal; }
</style>`;

const shell = (title, inner) => page({ title, label: 'SUPPORT DESK', wide: true, body: `${CSS}<main>${inner}</main>` });
const hidden = (k, fields) => `<input type="hidden" name="k" value="${esc(k)}">` +
  Object.entries(fields).map(([n, v]) => `<input type="hidden" name="${esc(n)}" value="${esc(v)}">`).join('');
const searchBox = (k, q = '') => `<form class="search" method="get" action="/desk">
  <input type="hidden" name="k" value="${esc(k)}">
  <input name="q" id="q" value="${esc(q)}" placeholder="Buyer's email, name, or order number" aria-label="Search buyers" autocomplete="off" required minlength="3">
  <button class="b primary">Search</button></form>`;

function orderCard(k, q, o, pay, used) {
  const active = o.passports.filter((p) => !p.voided_at);
  const first = o.passports[0];
  const chips = o.passports.map((p) => p.voided_at
    ? `<span class="chip off">${esc(passportLabel(p.id))} · CANCELLED</span>`
    : `<span class="chip ok">${esc(passportLabel(p.id))} · ACTIVE · ${Number(p.used)} used</span>`).join('');
  let payLine;
  if (pay.test) payLine = `<div class="pay">Test passport. No payment.</div>`;
  else if (pay.error) payLine = `<div class="pay warn">Couldn't load the payment: ${esc(pay.error)}</div>`;
  else if (!pay.bitebook) payLine = `<div class="pay warn">This payment isn't from the BiteBook Square location. Refunds are blocked here. Ask Will.</div>`;
  else payLine = `<div class="pay">Paid <b>${money(pay.paid)}</b>${pay.card ? ` · ${esc(pay.card)}` : ''} · Refunded <b>${money(pay.refunded)}</b></div>`;
  const usedList = used.length ? `<div class="used"><div class="lbl">Coupons already used</div>${used.map((c) => {
    const r = restaurantById(c.restaurant_id);
    const undo = active.some((p) => p.id === c.passport_id)
      ? `<form method="post" action="/desk">${hidden(k, { action: 'undo', token: c.token, q, step: 'review', what: r?.name || c.restaurant_id })}<button class="lnk">Undo (staff tapped by mistake)</button></form>` : '';
    return `<div>${esc(r?.name || c.restaurant_id)} · ${esc(day(c.redeemed_at))}${undo}</div>`;
  }).join('')}</div>` : '';
  const acts = [];
  if (active.length) {
    acts.push(`<form method="post" action="/desk">${hidden(k, { action: 'resend', order: o.orderId, q, step: 'review' })}<button class="b go">Resend passport</button></form>`);
    acts.push(`<form method="post" action="/desk" class="inline">${hidden(k, { action: 'reissue', order: o.orderId, q, step: 'review' })}<input type="email" name="email" placeholder="Correct email" required aria-label="Correct email"><button class="b">Change email</button></form>`);
    acts.push(`<form method="post" action="/desk">${hidden(k, { action: 'cancel', order: o.orderId, q, step: 'review' })}<button class="b danger">Cancel passport</button></form>`);
  }
  if (pay.refundable > 0) {
    acts.push(`<form method="post" action="/desk">${hidden(k, { action: 'refund', order: o.orderId, q, step: 'review' })}<button class="b danger">Refund ${money(pay.refundable)}</button></form>`);
  }
  return `<section class="order">
  <h2>${esc(first.name || 'No name')} <span class="note">· ${esc([...new Set(o.passports.map((p) => cityName(p.city)))].join(', '))}</span></h2>
  <div class="meta"><span>Email <b>${esc(first.email || '—')}</b></span><span>Bought <b>${esc(day(first.created_at))}</b></span><span>Passport emailed <b>${o.passports.some((p) => p.emailed_at) ? 'yes' : 'not yet'}</b></span></div>
  <div class="pp">${chips}</div>
  ${payLine}
  ${usedList}
  ${acts.length ? `<div class="actions">${acts.join('')}</div>` : '<div class="note">Everything on this order is cancelled and fully refunded. Nothing left to do.</div>'}
  <div class="note">Order ${esc(o.orderId)}</div>
</section>`;
}

const PLAYBOOK = `
<h3>How to handle common requests</h3>
<p class="note">You're allowed to make these calls without checking with Will. Our promise: anyone who isn't happy gets a full refund, no hard feelings.</p>

<details><summary>“I didn't get my passport”</summary>
  <div class="lbl">Do</div>
  <ol><li>Search their email.</li>
  <li>Found and "emailed: yes": tap <b>Resend passport</b>, then send the reply below.</li>
  <li>Nothing found: ask which email they used at checkout, or for their Square receipt, and search again by name.</li>
  <li>They paid but still nothing shows: tap <b>Check for missing purchases</b> at the top of this page, then search again.</li></ol>
  <div class="lbl">Say</div>
  <div class="say">So sorry about that! I just resent your passport from info@getbitebook.com. It can take a few minutes, and sometimes lands in spam or promotions. Let me know if it doesn't show up!</div>
</details>

<details><summary>“I used the wrong email” / “Send it to a different email”</summary>
  <div class="lbl">Do</div>
  <ol><li>Search the email they bought with.</li><li>Type the correct email in the box and tap <b>Change email</b>.</li>
  <li>This cancels the old passport and sends a brand-new one. They aren't charged again.</li></ol>
  <div class="lbl">Say</div>
  <div class="say">All set! Your passport is on its way to [new email]. The old one won't work anymore, so use the new email. Enjoy!</div>
</details>

<details><summary>“I want a refund”</summary>
  <div class="lbl">Do</div>
  <ol><li>Search their email.</li><li>Tap <b>Refund</b>. The money goes back to their card, and the passport is cancelled automatically so the coupons stop working.</li>
  <li>If they want to keep using the passport anyway (Will sometimes allows this), uncheck "Also cancel the passport" on the confirm screen.</li></ol>
  <div class="lbl">Say</div>
  <div class="say">No problem at all. I've refunded you in full. It usually shows up in 5–10 business days. Thanks for giving BiteBook a try!</div>
</details>

<details><summary>“A restaurant wouldn't take my coupon”</summary>
  <div class="lbl">Do</div>
  <ol><li>Apologize first. Ask which restaurant, the date, and what happened.</li>
  <li>Search their email. If that restaurant shows as already used and they say they didn't get the deal, tap <b>Undo</b> next to it so they can use it again.</li>
  <li>Our promise to restaurants and buyers: we refund the BiteBook and cover the cost of the meal. Offer that. For the meal, ask for a photo of the receipt and how they'd like to be paid back, and send both to Will. Refunds you can do right here.</li>
  <li>Email info@getbitebook.com with the restaurant name and what happened, so Will can talk to them. Don't argue with the restaurant.</li></ol>
  <div class="lbl">Say</div>
  <div class="say">I'm really sorry, that's not the experience we want for you. Which restaurant was it, and what happened? We'll make it right.</div>
</details>

<details><summary>Staff scanned it but didn't give the deal / tapped Redeem by mistake</summary>
  <div class="lbl">Do</div>
  <ol><li>Search the buyer, find the restaurant under "Coupons already used," and tap <b>Undo</b>.</li><li>The coupon works again right away.</li></ol>
  <div class="lbl">Say</div>
  <div class="say">Fixed! That coupon is good to use again.</div>
</details>

<details><summary>A restaurant has a question (QR won't scan, staff unsure)</summary>
  <div class="lbl">Do</div>
  <ol><li>If a code won't scan, tell them to honor the deal if the passport page looks right, and email us the guest's name.</li>
  <li>Anything about changing their deal, dates, or how it's going: pass it to Will at ${esc(SUPPORT_EMAIL)}.</li></ol>
</details>

<details><summary>Something else, or you're not sure</summary>
  <ol><li>Reply kindly and say you're looking into it.</li><li>Write it down in the team chat with the buyer's email, and leave it for Will. Don't guess on money or promises.</li></ol>
</details>`;

async function home(k, q, msg = '') {
  let results = '';
  if (q) {
    const orders = (await findOrders(q)).slice(0, 10);
    if (!orders.length) results = `<div class="err-box">No passports found for “${esc(q)}”. Try part of the email, their last name, or ask for their Square receipt.</div>`;
    else {
      const cards = await Promise.all(orders.map(async (o) => {
        const [pay, used] = await Promise.all([paymentForOrder(o.orderId).catch((e) => ({ error: e.message })), usedCoupons(o.passports.map((p) => p.id))]);
        return orderCard(k, q, o, pay, used);
      }));
      results = cards.join('');
    }
  }
  const log = q ? '' : await recentDeskActions(12).then((rows) => rows.length ? `<h3>Recent desk activity</h3><table class="log"><tr><th>WHEN</th><th>WHAT</th></tr>${rows.map((r) => {
    let d = {}; try { d = JSON.parse(r.detail); } catch {}
    const what = { desk_refund: `Refund ${money(d.amount)} on ${d.order}`, desk_cancel: `Cancelled ${d.order} (${d.reason || ''})`, desk_reissue: `Moved ${d.from} to ${d.email}`, desk_resend: `Resent ${d.order}`, desk_undo: 'Undid a redemption', desk_catchup: `Missing-purchase check: ${d.created} found` }[r.kind] || r.kind;
    return `<tr><td>${esc(day(r.at))}</td><td>${esc(what)}</td></tr>`;
  }).join('')}</table>` : '');
  return shell('Support desk', `
  <h1>Support desk</h1>
  ${msg}
  ${searchBox(k, q)}
  ${results}
  ${q ? `<p><a href="/desk?k=${encodeURIComponent(k)}">← Back to the playbook</a></p>` : `
  <form method="post" action="/desk">${hidden(k, { action: 'catchup', step: 'review', q: '' })}<button class="b">Check for missing purchases</button> <span class="note">Use if someone paid but their passport isn't showing up.</span></form>
  ${PLAYBOOK}
  ${log}`}`);
}

async function review(k, b) {
  const back = `/desk?k=${encodeURIComponent(k)}${b.q ? `&q=${encodeURIComponent(b.q)}` : ''}`;
  const { alsoCancel, reason, ...keep } = b;
  const go = (label, extra = '', cls = 'primary') => `<form method="post" action="/desk" class="actions">${hidden(k, { ...keep, step: 'go' })}${extra}<button class="b ${cls}">${esc(label)}</button><a class="b" href="${esc(back)}">Go back</a></form>`;
  let refundLine = 'The full remaining amount goes back to their card (5–10 business days).';
  if (b.action === 'refund') {
    const pay = await paymentForOrder(b.order).catch((e) => ({ error: e.message }));
    if (pay.error || pay.test || !pay.bitebook || !pay.refundable) return shell('Confirm', `<h1>Confirm</h1><div class="err-box">This purchase can't be refunded here: ${esc(pay.error || (pay.test ? 'it is a test passport' : !pay.bitebook ? 'it is not a BiteBook payment' : 'it is already fully refunded'))}.</div><p><a href="${esc(back)}">Go back</a></p>`);
    refundLine = `${money(pay.refundable)} goes back to ${pay.card || 'their card'} (5–10 business days).`;
  }
  const items = {
    resend: ['Resend this passport?', ['We email the same passport again to the address on file.', 'Nothing gets cancelled or charged.'], go('Yes, resend it')],
    reissue: [`Move this passport to ${b.email}?`, ['The current passport is cancelled. Its coupons stop working.', `A brand-new passport is emailed to ${b.email}.`, 'Coupons they already used stay used. They are not charged again.'], go('Yes, send to the new email')],
    cancel: ['Cancel this passport?', ['All of its coupons stop working right away.', 'This does NOT refund their money. Use Refund for that.'],
      go('Yes, cancel it', `<label class="inline">Reason <select name="reason"><option>Customer request</option><option>Refunded</option><option>Duplicate purchase</option><option>Other</option></select></label>`, 'danger')],
    refund: ['Refund this purchase?', [refundLine, 'Only BiteBook payments can be refunded here.'],
      go('Yes, refund it', `<label class="inline"><input type="checkbox" name="alsoCancel" value="1" checked> Also cancel the passport</label>`, 'danger')],
    undo: [`Undo the ${b.what || ''} redemption?`, ['That coupon becomes usable again.', 'Only do this if they did not actually get the deal.'], go('Yes, undo it')],
    catchup: ['Check for missing purchases?', ['Looks at the last 5 days of BiteBook sales in Square.', 'Anyone who paid but has no passport gets one created and emailed.', 'Takes up to a minute.'], go('Yes, check now')],
  }[b.action];
  if (!items) return shell('Support desk', `<h1>Support desk</h1><div class="err-box">Unknown action.</div>`);
  const [title, bullets, form] = items;
  return shell('Confirm', `<h1>Confirm</h1><div class="confirm"><h2 style="margin:0;font-family:'Bricolage Grotesque',sans-serif">${esc(title)}</h2><ul>${bullets.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>${form}</div>`);
}

async function execute(k, b) {
  const by = 'desk';
  switch (b.action) {
    case 'resend': { const r = await resendOrder(b.order, { by }); return r.status === 'sent' ? `Passport resent to ${r.to}.` : `Couldn't resend (${r.status}).`; }
    case 'reissue': { const r = await reissueOrder(b.order, String(b.email || '').trim(), { by }); return `Done. ${r.oldLabels.join(', ')} is cancelled, and new passport ${r.newLabels.join(', ')} was ${r.sent === 'sent' ? 'emailed' : `created (email: ${r.sent})`} to ${b.email}.`; }
    case 'cancel': { const r = await cancelOrder(b.order, String(b.reason || 'Customer request').slice(0, 60), { by }); return r.length ? `Cancelled ${r.map((p) => passportLabel(p.id)).join(', ')}. Its coupons no longer work.` : 'That passport was already cancelled.'; }
    case 'refund': {
      const r = await refundOrder(b.order, { by });
      let extra = '';
      if (b.alsoCancel === '1') { const c = await cancelOrder(b.order, 'Refunded', { by }); extra = c.length ? ' The passport is cancelled.' : ''; }
      return `Refunded ${money(r.amount)} (Square status: ${r.status || 'pending'}).${extra}`;
    }
    case 'undo': { const r = await undoCoupon(String(b.token || ''), { by }); return r ? 'Done. That coupon can be used again.' : 'Couldn’t find that coupon.'; }
    case 'catchup': { const r = await catchUpMissing({ by }); return r.created ? `Found ${r.created} missing purchase(s) and emailed ${r.sent}.` : 'No missing purchases. Everyone who paid has a passport.'; }
    default: throw new Error('Unknown action');
  }
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex');
  const b = req.method === 'POST' ? (typeof req.body === 'object' && req.body ? req.body : Object.fromEntries(new URLSearchParams(String(req.body || '')))) : {};
  const k = String(b.k || req.query.k || '');
  if (!authorized(k)) return res.status(401).send(shell('Support desk', '<h1>Support desk</h1><div class="err-box">This link isn’t valid. Use the full link Will sent you.</div>'));
  try {
    if (req.method === 'POST') {
      const fields = { action: String(b.action || ''), order: String(b.order || ''), email: String(b.email || ''), token: String(b.token || ''), q: String(b.q || ''), what: String(b.what || ''), reason: String(b.reason || ''), alsoCancel: String(b.alsoCancel || '') };
      if (b.step !== 'go') return res.send(await review(k, fields));
      try {
        const done = await execute(k, fields);
        return res.send(await home(k, fields.q || (fields.action === 'reissue' ? fields.email : ''), `<div class="ok-box">${esc(done)}</div>`));
      } catch (e) {
        return res.send(await home(k, fields.q, `<div class="err-box">${esc(e.message || String(e))}</div>`));
      }
    }
    return res.send(await home(k, String(req.query.q || '').trim()));
  } catch (e) {
    console.error(e);
    return res.status(500).send(shell('Support desk', `<h1>Support desk</h1><div class="err-box">Something went wrong: ${esc(e.message || String(e))}. Try again, or note it for Will.</div>`));
  }
}
