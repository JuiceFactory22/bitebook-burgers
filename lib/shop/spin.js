// Free-coupon spinner landing page (built for Meta ads): getbitebook.com/spin/<event>/<city>, e.g. /spin/wings/denver
//   (old /spin/<city> links forward to the current event's page; see vercel.json)
//   GET  /spin/<event>/<city> -> the page: spin first, then claim, then the spin-winner discount on the passport (SPIN_DISCOUNT_PCT in config.js)
//   GET  /spin          -> pick your city
//   POST /api/spin      -> { step: 'spin', city, wheel: [restaurant ids], source }
//                          -> picks the winner from the restaurants on the person's wheel and saves the spin
//                       -> { step: 'claim', city, spinId, name, phone, textOk }
//                          -> turns the spin into the free coupon and sends it into GHL (which texts it)
// One free coupon per phone number, per event and city. No email is asked for; buyers give it at Stripe checkout.
// The coupon works on the event's dates, like the book.
import { EVENTS, CITIES, SUPPORT_EMAIL, SITE_URL, eventWindow, SPIN_DISCOUNT_PCT, spinPriceCents } from '../config.js';
import { esc } from '../html.js';
import { wheelFor, spinWheel, openSpin, markSpinClaimed, existingFreePassport, createFreePassport } from '../freecoupon.js';
import { restaurantById, restaurantsFor } from '../restaurants.js';
import { syncFreeCoupon } from '../ghl.js';
import { signupsFor } from '../signups.js';
import { logEvent } from '../db.js';

// The event the spinner gives coupons for. Change this when the next event goes on sale.
export const SPIN_EVENT = 'wings';

const WWW = 'https://www.getbitebook.com';
const STATE = { denver: 'CO', nashville: 'TN', phoenix: 'AZ' };
const digits = (s) => String(s || '').replace(/\D/g, '');
// Test numbers (Vercel env SPIN_TEST_PHONES, comma-separated): skip the one-coupon-per-phone rule so the
// whole flow (coupon, GHL text, Reply YES) can be tried again and again. Real visitors are never affected.
const isTestPhone = (phone) => String(process.env.SPIN_TEST_PHONES || '').split(',')
  .map((p) => digits(p).slice(-10)).filter((p) => p.length === 10).includes(digits(phone).slice(-10));
const money = (cents) => `$${(Number(cents || 0) / 100).toFixed(Number(cents) % 100 ? 2 : 0)}`;
// JSON that is safe inside a <script> tag
const js = (v) => JSON.stringify(v).replace(/</g, '\\u003c');

function prizeView(r) {
  return { id: r.id, restaurant: r.name, deal: r.short || r.deal, headline: r.deal, address: r.address || '', logo: r.logo || null };
}
function couponView(p, r, ev) {
  return { ...prizeView(r), link: `${SITE_URL}/book/${p.id}`, dates: ev.datesLabel };
}
const ended = (city, ev) => new Date() >= eventWindow(city.id, ev.id).end;

async function doSpin(res, b, ev, city) {
  if (ended(city, ev)) return res.status(400).json({ error: `${ev.name} has ended. Follow @${city.instagram} for the next one!` });
  const s = await spinWheel({ cityId: city.id, eventId: ev.id, ids: b.wheel, source: b.source });
  if (!s) return res.status(400).json({ error: 'The wheel isn’t ready yet. Restaurants are still being added. Check back soon!' });
  return res.status(200).json({
    ok: true,
    spinId: s.id,
    wheel: s.wheel.map((r) => ({ id: r.id, name: r.name })),
    pick: s.pick,
    prize: prizeView(s.winner),
  });
}

async function doClaim(res, b, ev, city) {
  const name = String(b.name || '').trim().slice(0, 80);
  const phone = digits(b.phone).slice(-11);
  const textOk = b.textOk === true || b.textOk === 'yes';
  if (!name) return res.status(400).json({ error: 'Please enter your first name.', field: 'name' });
  if (phone.length < 10) return res.status(400).json({ error: 'Please enter a valid mobile number. We text your coupon to it.', field: 'phone' });
  if (ended(city, ev)) return res.status(400).json({ error: `${ev.name} has ended. Follow @${city.instagram} for the next one!` });

  // This phone number already has a free coupon for this event and city: show it again (and still offer the passport deal)
  const retest = isTestPhone(phone);
  const already = retest ? null : await existingFreePassport({ cityId: city.id, eventId: ev.id, phone });
  if (already) {
    const r = restaurantById(already.free_restaurant);
    return res.status(200).json({ ok: true, already: true, coupon: r ? couponView(already, r, ev) : null, offer: already.id });
  }

  const s = await openSpin({ spinId: b.spinId, cityId: city.id, eventId: ev.id });
  if (!s || s.claimed_at) return res.status(400).json({ error: 'That spin has expired. Give the wheel another spin!', respin: true });
  const r = restaurantById(s.restaurant);
  if (!r || !r.active) return res.status(400).json({ error: 'That restaurant just left the lineup. Give the wheel another spin!', respin: true });

  const p = await createFreePassport({ cityId: city.id, eventId: ev.id, name, phone, textOk, restaurantId: r.id });
  await markSpinClaimed(s.id, p.id);
  await logEvent('free_coupon', { city: city.id, event: ev.id, restaurant: r.id, passport: p.id, spin: s.id, textOk });

  // GHL: contact + tags + New Lead card. Its workflow texts the coupon link.
  const ghl = await syncFreeCoupon({ cityId: city.id, name, email: null, phone, textOptIn: textOk, passportId: p.id, restaurant: r, ev, retest });
  return res.status(200).json({ ok: true, coupon: couponView(p, r, ev), offer: p.id, ghl });
}

async function api(req, res) {
  const b = req.body || {};
  const ev = EVENTS[SPIN_EVENT];
  const city = CITIES[String(b.city || '')];
  if (!city || !ev.cities.includes(city.id)) return res.status(400).json({ error: 'That city isn’t part of this event.' });
  try {
    return b.step === 'spin' ? await doSpin(res, b, ev, city) : await doClaim(res, b, ev, city);
  } catch (e) {
    console.error(e);
    await logEvent('free_coupon_error', { city: city.id, step: b.step || 'claim', error: String(e.message || e).slice(0, 300) });
    return res.status(500).json({ error: 'Something went wrong. Please try again in a minute.' });
  }
}

// ---------------------------------------------------------------- page

const CSS = `
:root{--ink:#1c140f;--ink-soft:#3a2c22;--paper:#f8efdd;--paper-2:#f1e4c9;--cream:#fffaf0;--gold:#f2ac1d;--tomato:#e0442a;--teal:#127e73;--line:rgba(28,20,15,.14)}
*{box-sizing:border-box;margin:0;padding:0}
html{scroll-behavior:smooth;-webkit-text-size-adjust:100%;overflow-x:hidden}
body{font-family:'Inter',system-ui,sans-serif;background:var(--paper);color:var(--ink);line-height:1.55;-webkit-font-smoothing:antialiased;overflow-x:hidden}
a{color:inherit}
img{max-width:100%}
.wrap{max-width:720px;margin:0 auto;padding:0 20px}
.mono{font-family:'Space Mono',monospace}
.top{background:var(--paper);border-bottom:2.5px solid var(--ink)}
.top-in{display:flex;align-items:center;justify-content:space-between;gap:12px;max-width:720px;margin:0 auto;padding:12px 20px}
.brand{font-family:'Bricolage Grotesque',sans-serif;font-weight:800;font-size:1.3rem;letter-spacing:-.03em;display:flex;align-items:center;gap:8px;text-decoration:none}
.brand img{height:26px;width:auto;display:block}
.pill{font-family:'Space Mono',monospace;font-size:.68rem;letter-spacing:.08em;text-transform:uppercase;font-weight:700;border:2px solid var(--ink);border-radius:40px;padding:5px 12px;background:var(--gold);white-space:nowrap}
.hero{padding:26px 0 8px;text-align:center}
.eyebrow{font-family:'Space Mono',monospace;font-size:.74rem;letter-spacing:.14em;text-transform:uppercase;color:var(--teal);font-weight:700}
h1{font-family:'Bricolage Grotesque',sans-serif;font-weight:800;font-size:clamp(2.3rem,9vw,3.8rem);line-height:.96;letter-spacing:-.025em;margin:10px auto 0;max-width:13ch}
h1 .swap{color:var(--tomato)}
.lede{font-size:1.06rem;color:var(--ink-soft);max-width:36ch;margin:12px auto 0}
.lede .ld2{display:block;white-space:nowrap}
.stage{display:flex;flex-direction:column;align-items:center;padding:18px 0 8px}
.wheelwrap{position:relative;width:min(86vw,370px);aspect-ratio:1;margin:26px auto 0;cursor:pointer;-webkit-tap-highlight-color:transparent}
.wheelwrap::before{content:"";position:absolute;inset:-5px;border-radius:50%;background:var(--ink);box-shadow:8px 8px 0 rgba(28,20,15,.25)}
.disc{position:relative;width:100%;height:100%;border-radius:50%;overflow:hidden;contain:paint}
#wheel{width:100%;height:100%;display:block;will-change:transform}
.pointer{position:absolute;top:-24px;left:50%;transform:translateX(-50%);width:24px;height:32px;z-index:3;filter:drop-shadow(3px 3px 0 rgba(28,20,15,.35))}
.hub{position:absolute;inset:0;margin:auto;width:20%;height:20%;border-radius:50%;background:var(--ink);border:4px solid var(--cream);z-index:2;display:flex;align-items:center;justify-content:center;color:var(--gold);font-family:'Bricolage Grotesque',sans-serif;font-weight:800;font-size:clamp(1rem,4.6vw,1.4rem);letter-spacing:.02em;pointer-events:none}
.spinbtn{margin-top:30px;width:min(100%,370px);font-family:'Bricolage Grotesque',sans-serif;font-weight:800;font-size:1.6rem;letter-spacing:-.01em;border:2.5px solid var(--ink);background:var(--tomato);color:var(--cream);padding:16px 20px;cursor:pointer;box-shadow:6px 6px 0 var(--ink);transition:transform .12s ease,box-shadow .12s ease;animation:nudge 2.4s ease-in-out infinite}
.spinbtn:hover{transform:translate(-2px,-2px);box-shadow:8px 8px 0 var(--ink)}
.spinbtn:active{transform:translate(3px,3px);box-shadow:3px 3px 0 var(--ink)}
.spinbtn:disabled{animation:none;opacity:.75;cursor:default;transform:none;box-shadow:6px 6px 0 var(--ink)}
@keyframes nudge{0%,80%,100%{transform:none}86%{transform:rotate(-1.5deg)}92%{transform:rotate(1.5deg)}}
.trust{display:flex;flex-wrap:wrap;justify-content:center;gap:8px;list-style:none;margin-top:18px}
.trust li{font-family:'Space Mono',monospace;font-size:.68rem;letter-spacing:.07em;text-transform:uppercase;font-weight:700;border:2px solid var(--ink);border-radius:40px;padding:5px 11px;background:var(--cream)}
.err{color:var(--tomato);font-weight:600;font-size:.95rem;min-height:1.3em;margin-top:10px;text-align:center}
.prize{display:none;margin:22px auto 0;width:min(100%,420px);background:var(--gold);border:2.5px solid var(--ink);box-shadow:6px 6px 0 var(--ink);padding:14px 16px;text-align:left}
.prize.on{display:block}
.prize .buyall{font-family:'Bricolage Grotesque',sans-serif;font-weight:800;font-size:1.3rem;line-height:1.1;padding:13px 12px;box-shadow:5px 5px 0 var(--ink);animation:nudge 2.4s ease-in-out infinite}
.prize .buyall small{display:block;font-family:'Space Mono',monospace;font-weight:700;font-size:.72rem;letter-spacing:.04em;text-transform:uppercase;margin-top:5px;opacity:.95}
.prize .buyall s{text-decoration-thickness:3px;opacity:.75;font-size:.85em;margin-right:2px}
.prize a.seecoupon{background:var(--cream);color:var(--ink);font-size:.95rem;padding:9px;margin-top:12px}
.back .wheelwrap,.back #go,.back .trust{display:none}
.back .prize{margin-top:6px}
.prize b{font-family:'Bricolage Grotesque',sans-serif;font-size:1.25rem;line-height:1.1;display:block}
.prize button,.prize a{margin-top:10px;width:100%;display:block;text-align:center;font-family:'Bricolage Grotesque',sans-serif;font-weight:700;font-size:1.05rem;border:2.5px solid var(--ink);background:var(--tomato);color:var(--cream);padding:11px;cursor:pointer;text-decoration:none}
/* sections below the wheel */
section{padding:34px 0 6px}
h2{font-family:'Bricolage Grotesque',sans-serif;font-weight:800;font-size:clamp(1.7rem,6vw,2.4rem);line-height:1;letter-spacing:-.02em;margin-bottom:14px}
.steps{display:grid;gap:14px;list-style:none}
.steps li{border-top:3px solid var(--ink);padding-top:12px}
.steps .n{font-family:'Space Mono',monospace;font-weight:700;font-size:.78rem;letter-spacing:.1em;color:var(--tomato)}
.steps b{display:block;font-family:'Bricolage Grotesque',sans-serif;font-weight:700;font-size:1.25rem;margin:4px 0 2px}
.steps span{color:var(--ink-soft)}
@media(min-width:700px){.steps{grid-template-columns:repeat(3,1fr);gap:20px}}
/* deal scroller under the wheel */
.ticker{overflow:hidden;margin:0 -20px;padding:6px 20px 16px;-webkit-mask-image:linear-gradient(90deg,transparent,#000 20px,#000 calc(100% - 20px),transparent);mask-image:linear-gradient(90deg,transparent,#000 20px,#000 calc(100% - 20px),transparent)}
.track{display:flex;width:max-content;animation:ticker var(--dur,40s) linear infinite}
.track .set{display:flex;align-items:flex-start;gap:16px;padding-right:16px}
.track .spot{width:240px;flex:none}
.spot .lg{width:64px;height:64px;border:2.5px solid var(--ink);background:#fff;display:flex;align-items:center;justify-content:center;margin-bottom:10px;overflow:hidden}
.spot .lg img{max-width:100%;max-height:100%;object-fit:contain;padding:4px}
.spot .lg.ini{font-family:'Bricolage Grotesque',sans-serif;font-weight:800;font-size:1.5rem;letter-spacing:-.02em}
.spot .lg.c0{background:var(--gold);color:var(--ink)}.spot .lg.c1{background:var(--tomato);color:var(--cream)}.spot .lg.c2{background:var(--teal);color:var(--cream)}
.spot .soon{color:var(--ink-soft);font-weight:400;font-style:italic}
@keyframes ticker{from{transform:translateX(0)}to{transform:translateX(-50%)}}
@media(prefers-reduced-motion:reduce){.ticker{overflow-x:auto}.track{animation:none}.track .set[aria-hidden]{display:none}}
.kicker{font-family:'Space Mono',monospace;font-size:.74rem;letter-spacing:.12em;text-transform:uppercase;font-weight:700;color:var(--teal);margin-bottom:10px}
.more{font-family:'Bricolage Grotesque',sans-serif;font-weight:800;font-size:clamp(1.3rem,5vw,1.7rem);line-height:1.1;letter-spacing:-.01em;text-align:center;margin:14px 0 14px}
/* map + list of every signed-up restaurant */
.lu{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(0,1fr);border:2.5px solid var(--ink);background:var(--cream);box-shadow:6px 6px 0 var(--ink)}
.lu.nomap{grid-template-columns:1fr}
.lu #map{height:440px;margin:0;border:0;border-right:2.5px solid var(--ink);position:relative;z-index:0}
.lu-side{display:flex;flex-direction:column;min-height:0;height:440px}
.lu.nomap .lu-side{height:auto;max-height:560px}
.lu-search{font-family:'Inter',sans-serif;font-size:16px;padding:12px 14px;border:0;border-bottom:2.5px solid var(--ink);background:#fff;color:var(--ink);width:100%;border-radius:0;-webkit-appearance:none}
.lu-search:focus{outline:3px solid var(--gold);outline-offset:-3px}
.lu-list{list-style:none;margin:0;padding:0;overflow-y:auto;flex:1;position:relative}
.lu-list li{border-bottom:1.5px solid var(--line)}
.lu-item{all:unset;box-sizing:border-box;display:grid;grid-template-columns:1fr auto;gap:2px 10px;width:100%;padding:12px 14px;cursor:pointer}
.lu-item:hover,.lu-item.on{background:var(--paper-2)}
.lu-item.on{box-shadow:inset 5px 0 0 var(--tomato)}
.lu-name{font-family:'Bricolage Grotesque',sans-serif;font-weight:800;font-size:1.05rem;line-height:1.15}
.lu-area{font-family:'Space Mono',monospace;font-size:.66rem;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-soft);text-align:right;padding-top:3px}
.lu-deal{grid-column:1/-1;font-family:'Space Mono',monospace;font-weight:700;font-size:.78rem;color:var(--tomato)}
.lu-deal.soon-deal{color:var(--ink-soft);font-weight:400;font-style:italic}
.lu-tag{color:var(--ink);font-weight:700;font-style:normal;letter-spacing:.06em}
.lu-empty{padding:16px 14px;color:var(--ink-soft)}
.lu-pin{background:none;border:0}
.lu-pin svg{display:block;overflow:visible;filter:drop-shadow(2px 2px 0 rgba(28,20,15,.85))}
.leaflet-popup-content{font-family:'Inter',sans-serif;margin:12px 14px}
.leaflet-popup-content b{font-family:'Bricolage Grotesque',sans-serif;font-size:1.05rem}
.leaflet-popup-content .pa{font-family:'Space Mono',monospace;font-size:.68rem;letter-spacing:.08em;text-transform:uppercase;color:#6b5d50;margin-top:2px}
.leaflet-popup-content .pd{font-family:'Space Mono',monospace;font-weight:700;font-size:.8rem;color:#e0442a;margin-top:6px}
.leaflet-popup-content .lu-tag{color:#1c140f}
@media(max-width:700px){.lu{grid-template-columns:1fr}.lu #map{height:300px;border-right:0;border-bottom:2.5px solid var(--ink)}.lu-side{height:auto;max-height:420px}}
.deals{display:grid;gap:12px;grid-template-columns:repeat(auto-fill,minmax(250px,1fr))}
.spot{background:var(--cream);border:2.5px solid var(--ink);box-shadow:5px 5px 0 var(--ink);padding:14px 16px}
.spot h3{font-family:'Bricolage Grotesque',sans-serif;font-weight:800;font-size:1.15rem;line-height:1.1}
.spot .d{font-family:'Space Mono',monospace;font-weight:700;font-size:.78rem;color:var(--tomato);margin:6px 0 4px;text-transform:uppercase}
.spot .a{font-size:.88rem;color:var(--ink-soft)}
details{border-top:2.5px solid var(--ink)}
details:last-of-type{border-bottom:2.5px solid var(--ink)}
summary{cursor:pointer;padding:15px 0;font-family:'Bricolage Grotesque',sans-serif;font-weight:700;font-size:1.08rem;list-style:none}
summary::-webkit-details-marker{display:none}
summary::after{content:'+';float:right;font-family:'Space Mono',monospace;color:var(--tomato)}
details[open] summary::after{content:'–'}
details p{margin:0 0 15px;color:var(--ink-soft)}
.faqbuy{color:var(--tomato);font-weight:700;white-space:nowrap}
.again{display:block;text-align:center;font-family:'Bricolage Grotesque',sans-serif;font-weight:800;font-size:1.3rem;border:2.5px solid var(--ink);background:var(--tomato);color:var(--cream);padding:14px;text-decoration:none;box-shadow:6px 6px 0 var(--ink);margin-top:6px}
footer{margin-top:40px;padding:26px 0 34px;border-top:2.5px solid var(--ink);font-size:.88rem;color:var(--ink-soft)}
footer a{text-decoration:underline}
/* pop-ups */
.modal{position:fixed;inset:0;z-index:80;display:none;align-items:flex-end;justify-content:center;background:rgba(28,20,15,.55);padding:0}
.modal.on{display:flex;animation:fade .2s ease}
.sheet{position:relative;width:100%;max-width:480px;max-height:94vh;overflow-y:auto;-webkit-overflow-scrolling:touch;background:var(--paper);border:2.5px solid var(--ink);border-bottom:none;box-shadow:0 -6px 0 rgba(28,20,15,.25);padding:22px 20px calc(22px + env(safe-area-inset-bottom));animation:up .32s cubic-bezier(.2,.9,.3,1.2)}
@media(min-width:560px){.modal{align-items:center;padding:20px}.sheet{border-bottom:2.5px solid var(--ink);box-shadow:10px 10px 0 var(--ink);max-height:90vh}}
@keyframes up{from{transform:translateY(40px);opacity:0}to{transform:none;opacity:1}}
@keyframes fade{from{opacity:0}to{opacity:1}}
.x{position:absolute;top:10px;right:10px;width:38px;height:38px;border:2px solid var(--ink);background:var(--cream);font-size:1.2rem;line-height:1;cursor:pointer;border-radius:50%}
.won{font-family:'Space Mono',monospace;font-size:.76rem;letter-spacing:.14em;text-transform:uppercase;font-weight:700;color:var(--teal);text-align:center}
.sheet h2{text-align:center;margin:6px 0 0;font-size:clamp(1.9rem,8vw,2.4rem)}
.ticket{margin:14px 0 4px;background:var(--gold);border:2.5px solid var(--ink);box-shadow:5px 5px 0 var(--ink)}
.ticket .t1{padding:14px 16px 12px}
.ticket .big{font-family:'Bricolage Grotesque',sans-serif;font-weight:800;font-size:1.45rem;line-height:1.05}
.ticket .where{font-weight:600;margin-top:6px}
.ticket .addr{font-size:.88rem;color:var(--ink-soft)}
.ticket .perf{border-top:2.5px dashed var(--ink);position:relative}
.ticket .perf::before,.ticket .perf::after{content:"";position:absolute;top:-12px;width:22px;height:22px;background:var(--paper);border:2.5px solid var(--ink);border-radius:50%}
.ticket .perf::before{left:-13px}.ticket .perf::after{right:-13px}
.ticket .t2{padding:9px 16px;font-family:'Space Mono',monospace;font-size:.72rem;letter-spacing:.06em;text-transform:uppercase;font-weight:700}
.ticket img{max-height:56px;max-width:140px;object-fit:contain;display:block;margin-bottom:8px}
form.claim{display:flex;flex-direction:column;gap:10px;margin-top:14px}
.ask{font-family:'Bricolage Grotesque',sans-serif;font-weight:700;font-size:1.12rem;text-align:center;margin-top:6px}
.claim input[type=text],.claim input[type=email],.claim input[type=tel]{width:100%;font:inherit;font-size:17px;padding:13px 14px;border:2.5px solid var(--ink);background:var(--cream);color:var(--ink);border-radius:0;-webkit-appearance:none}
.claim input:focus{outline:3px solid var(--gold);outline-offset:1px}
.claim input.bad{border-color:var(--tomato);background:#fff1ee}
.opt{display:flex;gap:10px;align-items:flex-start;font-size:.8rem;color:var(--ink-soft);line-height:1.4;cursor:pointer}
.opt input{width:22px;height:22px;flex:none;margin-top:1px;accent-color:var(--teal)}
.cta{width:100%;font-family:'Bricolage Grotesque',sans-serif;font-weight:800;font-size:1.3rem;border:2.5px solid var(--ink);background:var(--tomato);color:var(--cream);padding:15px;cursor:pointer;box-shadow:5px 5px 0 var(--ink);text-align:center;text-decoration:none;display:block}
.cta:active{transform:translate(3px,3px);box-shadow:2px 2px 0 var(--ink)}
.cta:disabled{opacity:.7}
.fine{font-size:.76rem;color:var(--ink-soft);text-align:center;line-height:1.45}
.fine a{text-decoration:underline}
.sent a{font-weight:700}
.sent{background:var(--teal);color:var(--cream);border:2px solid var(--ink);padding:10px 12px;font-size:.92rem;font-weight:600;display:flex;gap:8px;align-items:flex-start}
.kick{font-family:'Space Mono',monospace;font-size:.74rem;letter-spacing:.12em;text-transform:uppercase;font-weight:700;color:var(--tomato);text-align:center;margin-top:16px}
.price{display:flex;justify-content:center;align-items:baseline;gap:12px;margin:10px 0 2px;font-family:'Bricolage Grotesque',sans-serif;font-weight:800}
.price s{font-size:1.5rem;color:var(--ink-soft);text-decoration-thickness:3px;text-decoration-color:var(--tomato)}
.price b{font-size:3rem;line-height:1;letter-spacing:-.03em}
.price small{font-family:'Space Mono',monospace;font-weight:400;font-size:.74rem;color:var(--ink-soft)}
.when{text-align:center;font-family:'Space Mono',monospace;font-weight:700;font-size:.82rem;letter-spacing:.05em;text-transform:uppercase;margin-top:12px}
.save{display:table;margin:4px auto 0;font-family:'Space Mono',monospace;font-size:.7rem;letter-spacing:.08em;text-transform:uppercase;font-weight:700;background:var(--gold);border:2px solid var(--ink);border-radius:40px;padding:4px 11px}
.list{list-style:none;margin:14px 0;border:2.5px solid var(--ink);background:var(--cream);max-height:38vh;overflow-y:auto}
.list li{display:flex;gap:10px;padding:11px 14px;border-bottom:1.5px solid var(--line);font-size:1.08rem;line-height:1.3}
.list li:last-child{border-bottom:none}
.list .ck{color:var(--teal);font-weight:800;flex:none}
.list b{display:block;font-size:1.1rem}
.list span{color:var(--ink-soft);font-size:1rem}
.list .mine{background:#fff3d6}
.list .mine em{font-style:normal;font-family:'Space Mono',monospace;font-size:.74rem;font-weight:700;color:var(--teal);text-transform:uppercase;letter-spacing:.06em}
.skip{display:block;margin:12px auto 0;background:none;border:none;font:inherit;font-size:.9rem;color:var(--ink-soft);text-decoration:underline;cursor:pointer;padding:6px}
.confetti{position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:90}
[hidden]{display:none!important}
/* Built for the Facebook / Instagram app browser (short screen): headline, wheel and Spin button all fit
   on the first screen. The wheel shrinks with the screen height, never below 220px. */
@media(max-width:700px){
  .top-in{padding:6px 16px}.brand{font-size:1.15rem}.brand img{height:22px}
  .hero{padding:12px 0 0}
  .eyebrow{font-size:.68rem}
  h1{font-size:clamp(1.8rem,7.8vw,2.45rem);margin-top:5px}
  .lede{font-size:.84rem;margin-top:5px;line-height:1.3}
  .stage{padding:6px 0 8px}
  .wheelwrap{width:min(90vw,380px,max(230px,calc(100vh - 272px)));width:min(90vw,380px,max(230px,calc(100svh - 272px)));margin-top:26px}
  .spinbtn{margin-top:14px;font-size:1.25rem;padding:9px 18px;box-shadow:5px 5px 0 var(--ink)}
}
@media(prefers-reduced-motion:reduce){.spinbtn{animation:none}.sheet,.modal.on{animation:none}}
`;

function head({ title, desc, url, jsonld = '', extra = '', image = `${WWW}/brand/og-spin.png` }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${esc(url)}">
<meta name="robots" content="index,follow,max-image-preview:large">
<meta name="theme-color" content="#f8efdd">
<meta property="og:type" content="website">
<meta property="og:site_name" content="BiteBook">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:image" content="${esc(image)}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${esc(title)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${esc(image)}">
<link rel="icon" href="/favicon.ico" sizes="any">
<link rel="icon" type="image/png" sizes="192x192" href="/brand/icon-192.png">
<link rel="apple-touch-icon" href="/brand/icon-180.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,700;12..96,800&family=Space+Mono:wght@400;700&family=Inter:wght@400;500;600&display=swap">
<style>${CSS}</style>
<script>
// Step addresses (/won, /claimed) are only counted when the step happens. Someone who opens one of those
// links later lands back on the main address before the Pixel loads, so they aren't counted twice.
(function () { try { var p = location.pathname.split('/'); // ['', 'spin', event, city, step]
  if (p[4] === 'won' || p[4] === 'claimed') history.replaceState(null, '', p.slice(0, 4).join('/') + location.search); } catch (_) {} })();
</script>
<script src="/meta-pixel.js" async></script>
${extra}
${jsonld}
</head>`;
}

const topBar = (ev, city) => `<header class="top"><div class="top-in">
  <a class="brand" href="/"><img src="/brand/logo-mark.png" alt="" width="38" height="26">BiteBook</a>
  <span class="pill">${esc(ev.name)}${city ? ` · ${esc(city.name)}` : ''}</span>
</div></header>`;

// FAQ: [question, answer text (also used for Google), optional answer HTML for the page]
function faqs(ev) {
  const off = `${SPIN_DISCOUNT_PCT}%`;
  return [
    ['What is the BiteBook passport?', `The ${ev.name} passport has a deal at every participating restaurant. Want the full book? Get it now for ${off} off.`,
      `The ${esc(ev.name)} passport has a deal at every participating restaurant. Want the full book? <a href="#" id="faqBuy" class="faqbuy">Get it now for ${off} off →</a>`],
    ['Is the coupon really free?', `Yes. Spinning and claiming your coupon is free, with no purchase needed to get it. Your coupon is for the deal exactly as the restaurant offers it, and some deals are "with the purchase of" another item.`],
    ['When can I use my coupon?', `During ${ev.name}, ${ev.datesLabel}. Show the coupon on your phone at the restaurant and they scan it. Each coupon works once.`],
    ['How do I get my coupon?', 'After you spin, enter your first name and mobile number. We text you the coupon link, and you can open it right away on this page too. Nothing to print or download.'],
    ['Can I spin more than once?', 'Every spin wins, limited to one per visitor.'],
    ['Do I have to sign up for texts?', "Yes, we need your phone number to text you your free coupon. We won't spam, but we'll reach out with other exclusive restaurant deals."],
    ['Who is BiteBook?', 'BiteBook runs local food events that send hungry people to independent restaurants. The restaurants set the deals; we make it easy to find them.'],
  ];
}

function cityPage(ev, city) {
  const all = restaurantsFor(city.id, ev.id);
  const wheel = wheelFor(city.id, ev.id).map((r) => ({ id: r.id, name: r.name }));
  const url = `${WWW}/spin/${ev.slug}/${city.id}`;
  const fq = faqs(ev);
  const price = money(ev.priceCents);
  const deal = money(spinPriceCents(ev));
  const { start, end } = eventWindow(city.id, ev.id);
  const title = `Free Wing Deal: Spin to Win | BiteBook`;
  const shortDates = `${ev.startShort} – ${String(ev.endLabel).replace(/,\s*\d{4}$/, '')}`;
  const desc = `Spin the BiteBook wheel and win a free ${ev.food} deal at a local restaurant. Every spin wins. Good ${ev.datesLabel}.`;
  const jsonld = `<script type="application/ld+json">${js({
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'FAQPage',
        mainEntity: fq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })),
      },
      {
        '@type': 'Event',
        name: `${ev.name} ${city.name}`,
        description: `A ${ev.food} deal at local restaurants across ${city.area}, ${ev.datesLabel}.`,
        startDate: start.toISOString(),
        endDate: new Date(end.getTime() - 1000).toISOString(),
        eventStatus: 'https://schema.org/EventScheduled',
        eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
        location: { '@type': 'Place', name: `Participating restaurants in ${city.area}`, address: { '@type': 'PostalAddress', addressLocality: city.name, addressRegion: STATE[city.id] || '', addressCountry: 'US' } },
        organizer: { '@type': 'Organization', name: 'BiteBook', url: WWW },
        image: [`${WWW}/brand/og-spin.png`],
        offers: { '@type': 'Offer', price: (ev.priceCents / 100).toFixed(2), priceCurrency: 'USD', url: `${WWW}/${ev.slug}/${city.id}`, availability: 'https://schema.org/InStock' },
      },
    ],
  })}</script>`;

  // Scroller + map: every restaurant signed up for the event (confirmed and pending) from lib/signups.js.
  // The wheel itself only uses confirmed restaurants (lib/restaurants.js).
  const signed = (ev.id === 'wings' ? signupsFor(city.id) : [])
    .slice().sort((a, b) => (!a.deal - !b.deal) || a.name.localeCompare(b.name));
  const mapped = signed.filter((r) => Number.isFinite(r.lat) && Number.isFinite(r.lng));
  // Logo tile on each card: the restaurant's logo when we have one (lib/signups.js "logo"), otherwise its initials
  const initials = (n) => n.replace(/^the\s+/i, '').split(/[\s&–-]+/).filter((w) => /^[A-Za-z0-9]/.test(w)).slice(0, 2).map((w) => w[0].toUpperCase()).join('');
  const tile = (r, i) => r.logo
    ? `<div class="lg"><img src="${esc(r.logo)}" alt="${esc(r.name)} logo" loading="lazy"></div>`
    : `<div class="lg ini c${i % 3}" aria-hidden="true">${esc(initials(r.name))}</div>`;
  const card = (r, i) => `<div class="spot">${tile(r, i)}<h3>${esc(r.name)}</h3><div class="d${r.deal ? '' : ' soon'}">${esc(r.deal || 'Coming soon')}</div>${r.area ? `<div class="a">${esc(r.area)}</div>` : ''}</div>`;
  const cards = signed.map(card).join('');
  const row = (r, i) => `<li><button type="button" class="lu-item" data-i="${i}">
      <span class="lu-name">${esc(r.name)}</span><span class="lu-area">${esc(r.area || '')}</span>
      <span class="lu-deal${r.deal ? '' : ' soon-deal'}"><b class="lu-tag">DEAL:</b> ${esc(r.deal || 'Coming soon')}</span></button></li>`;
  const nearby = signed.length ? `<div class="wrap" id="deals">
    <section style="padding-top:22px">
      <div class="kicker">${esc(ev.name)} deals</div>
      <div class="ticker" style="--dur:${Math.max(30, signed.length * 4)}s"><div class="track"><div class="set">${cards}</div><div class="set" aria-hidden="true">${cards}</div></div></div>
      <p class="more">Scroll down to see more deals near you ↓</p>
      <div class="lu${mapped.length ? '' : ' nomap'}">
        ${mapped.length ? '<div id="map" aria-label="Map of participating restaurants"></div>' : ''}
        <div class="lu-side">
          <input type="search" id="luSearch" class="lu-search" placeholder="Search restaurants or towns" aria-label="Search restaurants or towns">
          <ul class="lu-list" id="luList">${signed.map(row).join('')}</ul>
          <p class="lu-empty" id="luEmpty" hidden>No matches. Try another name or town.</p>
        </div>
      </div>
    </section>
  </div>` : '';
  const spots = all.map((r) => `<div class="spot"><h3>${esc(r.name)}</h3><div class="d">${esc(r.short || r.deal)}</div>${r.address ? `<div class="a">${esc(r.address)}</div>` : ''}</div>`).join('');

  return `${head({ title, desc, url, jsonld })}
<body>
${topBar(ev)}
<main>
  <div class="wrap hero">
    <div class="eyebrow" id="heroEye">Free · Every spin wins</div>
    <h1 id="heroH1">Spin to win a <span class="swap">free wing deal!</span></h1>
    <p class="lede" id="heroLede">A free local ${esc(ev.food)} deal · Good ${esc(shortDates)}</p>
  </div>

  <div class="wrap stage" id="spin">
    <div class="wheelwrap" id="wheelwrap" role="button" tabindex="-1" aria-label="Spin the wheel">
      <svg class="pointer" viewBox="0 -6 44 58" aria-hidden="true"><path d="M22 50 L3 10 A20 20 0 0 1 41 10 Z" fill="#e0442a" stroke="#1c140f" stroke-width="3.5" stroke-linejoin="round"/><circle cx="22" cy="17" r="6" fill="#fffaf0" stroke="#1c140f" stroke-width="3"/></svg>
      <div class="disc"><canvas id="wheel" width="740" height="740" aria-hidden="true"></canvas></div>
      <div class="hub">SPIN</div>
    </div>
    <button class="spinbtn" id="go" type="button">SPIN THE WHEEL</button>
    <div class="err" id="err" role="alert"></div>
    <div class="prize" id="prize" aria-live="polite"></div>
  </div>

  ${nearby}

  <div class="wrap">
    <section>
      <h2>How it works</h2>
      <ol class="steps">
        <li><span class="n">01</span><b>Spin the wheel</b><span>Every spin lands on a real ${esc(ev.food)} deal from a local restaurant.</span></li>
        <li><span class="n">02</span><b>Claim your coupon</b><span>Enter your first name and mobile number. Your coupon arrives by text in seconds.</span></li>
        <li><span class="n">03</span><b>Eat local</b><span>Show it on your phone at the restaurant. Coupon valid ${esc(ev.datesLabel)} only.</span></li>
      </ol>
    </section>


    <section>
      <h2>Questions</h2>
      ${fq.map(([q, a, h]) => `<details${h ? ' open' : ''}><summary>${esc(q)}</summary><p>${h || esc(a)}</p></details>`).join('')}
    </section>

    <section><a class="again" href="#spin">Spin the wheel ↑</a></section>
  </div>
</main>
<footer><div class="wrap">
  <b style="font-family:'Bricolage Grotesque',sans-serif;color:var(--ink)">BiteBook</b> · Local food events that send hungry people to independent restaurants.<br>
  Questions? <a href="mailto:${esc(SUPPORT_EMAIL)}">${esc(SUPPORT_EMAIL)}</a> · <a href="/terms">Terms</a> · <a href="/${esc(ev.slug)}/${esc(city.id)}">${esc(ev.name)} passport</a>
</div></footer>

<!-- Pop-up 1: you won + where to send it -->
<div class="modal" id="mWin" role="dialog" aria-modal="true" aria-labelledby="winH">
  <div class="sheet">
    <button class="x" type="button" data-close aria-label="Close">×</button>
    <div class="won">🎉 You won!</div>
    <h2 id="winH">Nice spin!</h2>
    <div class="ticket" id="winTicket"></div>
    <form class="claim" id="claim" novalidate>
      <div class="ask">Where should we text your coupon?</div>
      <input type="text" name="name" placeholder="First name" autocomplete="given-name" aria-label="First name" required>
      <input type="tel" name="phone" placeholder="Mobile number" autocomplete="tel" inputmode="tel" aria-label="Mobile number" required>
      <label class="opt"><input type="checkbox" name="textOk" value="yes"><span>Keep sending me exclusive ${esc(ev.food)} deals near me (~2/mo). Msg &amp; data rates may apply. Reply STOP to opt out, HELP for help.</span></label>
      <div class="err" id="cerr" role="alert" style="margin:0"></div>
      <button class="cta" id="claimBtn" type="submit">Send my free coupon →</button>
      <p class="fine">We'll text your coupon to this number. By claiming you agree to our <a href="/terms">terms</a>.</p>
    </form>
  </div>
</div>

<!-- Pop-up 2: the full passport at the spin-winner discount -->
<div class="modal" id="mUp" role="dialog" aria-modal="true" aria-labelledby="upH">
  <div class="sheet">
    <button class="x" type="button" data-close aria-label="Close">×</button>
    <div class="sent" id="upSent"><span aria-hidden="true">✓</span><span><span id="upSentText">Your free coupon is on its way by text.</span> <a id="upSentLink" href="#" target="_blank" rel="noopener" style="color:var(--gold);white-space:nowrap">Open it now →</a></span></div>
    <div id="upOffer">
      <div class="kick">Spin winners only · ${SPIN_DISCOUNT_PCT}% off</div>
      <h2 id="upH">Want all ${all.length} deals?</h2>
      <div class="price"><s>${price}</s><b>${deal}</b><small>/ PASSPORT</small></div>
      <span class="save">You save ${money(ev.priceCents - spinPriceCents(ev))}</span>
      <div class="when">🗓 Valid ${esc(ev.datesLabel)}</div>
      <ul class="list" id="upList"></ul>
      <button class="cta" id="upBuy" type="button">Get all ${all.length} deals for ${deal} →</button>
      <p class="fine" style="margin-top:10px">One passport, a ${esc(ev.food)} deal at every spot. Secure checkout by Stripe. Not happy? Full refund, no hassle.</p>
    </div>
    <div class="err" id="uerr" role="alert"></div>
    <button class="skip" type="button" id="upSkip">No thanks, just my free coupon</button>
  </div>
</div>

${signed.length ? `<script>
// Map + list of every signed-up restaurant. Tap a restaurant to find it on the map, or a pin to find it in the list.
(function () {
  try {
    var pts = ${js(signed.map((r) => ({ n: r.name, d: r.deal || 'Coming soon', a: r.area || '', lat: r.lat, lng: r.lng })))};
    var items = Array.prototype.slice.call(document.querySelectorAll('.lu-item'));
    var markers = [], m = null;
    function pick(i, fromMap) {
      items.forEach(function (el) { el.classList.toggle('on', +el.dataset.i === i); });
      var el = items[i];
      if (fromMap && el) { var list = document.getElementById('luList'); list.scrollTop = el.parentNode.offsetTop - 8; }
      if (!fromMap && m && markers[i]) {
        if (window.matchMedia('(max-width: 700px)').matches) document.getElementById('map').scrollIntoView({ behavior: 'smooth', block: 'center' });
        m.setView(markers[i].getLatLng(), Math.max(m.getZoom(), 13)); markers[i].openPopup();
      }
    }
    function buildMap() {
      if (m || !window.L || !document.getElementById('map')) return;
      m = L.map('map', { scrollWheelZoom: false });
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '&copy; OpenStreetMap contributors' }).addTo(m);
      var pin = L.divIcon({ className: 'lu-pin', iconSize: [30, 40], iconAnchor: [15, 39], popupAnchor: [0, -36],
        html: '<svg viewBox="0 0 30 40" width="30" height="40" aria-hidden="true"><path d="M15 38.5C15 38.5 2 23.5 2 14.5a13 13 0 0 1 26 0c0 9-13 24-13 24z" fill="#e0442a" stroke="#1c140f" stroke-width="2.5" stroke-linejoin="round"/><circle cx="15" cy="14.5" r="5" fill="#f8efdd" stroke="#1c140f" stroke-width="2"/></svg>' });
      var b = [];
      pts.forEach(function (p, i) {
        if (typeof p.lat !== 'number') return;
        var t = document.createElement('div'); var h = document.createElement('b'); h.textContent = p.n; t.appendChild(h);
        if (p.a) { var s = document.createElement('div'); s.className = 'pa'; s.textContent = p.a; t.appendChild(s); }
        var dd = document.createElement('div'); dd.className = 'pd'; var tg = document.createElement('b'); tg.className = 'lu-tag'; tg.textContent = 'DEAL: '; dd.appendChild(tg); dd.appendChild(document.createTextNode(p.d)); t.appendChild(dd);
        markers[i] = L.marker([p.lat, p.lng], { icon: pin, title: p.n }).addTo(m).bindPopup(t);
        markers[i].on('click', function () { pick(i, true); });
        b.push([p.lat, p.lng]);
      });
      m.fitBounds(b, { padding: [30, 30], maxZoom: 13 });
    }
    // The map (the heaviest part of the page) only loads when someone scrolls near it,
    // so the wheel shows up fast in the Facebook / Instagram app browser.
    var mapEl = document.getElementById('map');
    function loadMap() {
      if (loadMap.done) return; loadMap.done = true;
      var css = document.createElement('link'); css.rel = 'stylesheet'; css.href = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css'; document.head.appendChild(css);
      var sc = document.createElement('script'); sc.src = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js'; sc.onload = buildMap; document.head.appendChild(sc);
    }
    if (mapEl) {
      if ('IntersectionObserver' in window) {
        var io = new IntersectionObserver(function (es) { if (es.some(function (e) { return e.isIntersecting; })) { io.disconnect(); loadMap(); } }, { rootMargin: '150px 0px' });
        io.observe(mapEl);
      } else loadMap();
    }
    items.forEach(function (el) { el.addEventListener('click', function () { pick(+el.dataset.i, false); }); });
    var sb = document.getElementById('luSearch'), empty = document.getElementById('luEmpty');
    if (sb) sb.addEventListener('input', function () {
      var q = sb.value.trim().toLowerCase(), any = false;
      items.forEach(function (el) {
        var i = +el.dataset.i, p = pts[i], hit = !q || (p.n + ' ' + p.a + ' ' + p.d).toLowerCase().indexOf(q) > -1;
        el.parentNode.hidden = !hit; if (hit) any = true;
        if (markers[i]) markers[i].setOpacity(hit ? 1 : 0.25);
      });
      empty.hidden = any;
    });
  } catch (_) {}
})();
</script>` : ''}
<script>
(function () {
  var CITY = ${js(city.id)}, EVENT = ${js(ev.id)}, SLUG = ${js(ev.slug)};
  var WHEEL = ${js(wheel)};
  var DEALS = ${js(all.map((r) => ({ id: r.id, n: r.name, d: r.short || r.deal })))};
  var PRICE = ${spinPriceCents(ev) / 100};
  var LEAD_NAME = ${js(`${ev.name} free coupon · ${city.name}`)};
  var q = new URLSearchParams(location.search);
  var SOURCE = q.get('utm_source') || q.get('src') || '';
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var COLORS = ['#f2ac1d', '#e0442a', '#127e73'];
  var canvas = document.getElementById('wheel'), ctx = canvas.getContext('2d');
  var go = document.getElementById('go'), err = document.getElementById('err'), wrap = document.getElementById('wheelwrap');
  var rot = 0, spinning = false, spinId = null, prize = null, coupon = null, offer = null;

  // Even color pattern: 3 colors when the slice count splits by 3 (6 slices: mustard, red, teal, twice),
  // otherwise alternate 2 colors (even counts) so no two neighbors ever match and nothing looks lopsided.
  function colorFor(i, n) {
    if (n % 3 === 0) return COLORS[i % 3];
    if (n % 2 === 0) return COLORS[i % 2];
    return COLORS[i % 3 === 0 && i === n - 1 ? 1 : i % 3];
  }
  // Restaurant names on the wheel: one line if it fits, otherwise two balanced lines,
  // shrinking the text a little for long names. Only cut with "…" if even that can't fit.
  var FONT = '"Bricolage Grotesque", Inter, sans-serif', MAXW = 236;
  function setSize(px) { ctx.font = '800 ' + px + 'px ' + FONT; }
  function cut(t, max) {
    if (ctx.measureText(t).width <= max) return t;
    while (t.length > 3 && ctx.measureText(t + '…').width > max) t = t.slice(0, -1);
    return t.replace(/[\\s–-]+$/, '') + '…';
  }
  // Every way to break the words into n lines
  function splitsInto(words, n) {
    if (n === 1) return [[words.join(' ')]];
    var out = [];
    for (var k = 1; k <= words.length - n + 1; k++) {
      splitsInto(words.slice(k), n - 1).forEach(function (rest) { out.push([words.slice(0, k).join(' ')].concat(rest)); });
    }
    return out;
  }
  // Fewest lines first (1, then 2, then 3), shrinking the text a little before adding a line.
  // The top line is always the fullest; lines below only get what's left over.
  function layout(name) {
    var words = String(name).split(/\\s+/);
    var tries = [[1, 34], [2, 31], [3, 27]];
    for (var t = 0; t < tries.length; t++) {
      var n = tries[t][0];
      if (n > words.length) continue;
      for (var px = 42; px >= tries[t][1]; px -= 1) {
        setSize(px);
        var best = null, loose = null;
        splitsInto(words, n).forEach(function (ls) {
          var w = ls.map(function (l) { return ctx.measureText(l).width; });
          var widest = Math.max.apply(null, w);
          if (widest > MAXW) return;
          var topFull = true;
          for (var j = 1; j < w.length; j++) if (w[j] > w[j - 1] + 30) topFull = false; // top line fullest (a little leeway)
          var slack = Math.abs(w[0] - w[w.length - 1]);
          if (topFull) { if (!best || slack < best.slack) best = { slack: slack, lines: ls }; }
          else if (!loose || slack < loose.slack) loose = { slack: slack, lines: ls };
        });
        if (best || loose) return { px: px, lines: (best || loose).lines };
      }
    }
    setSize(27);
    var per = Math.ceil(words.length / 3), three = [];
    for (var i = 0; i < words.length; i += per) three.push(cut(words.slice(i, i + per).join(' '), MAXW));
    return { px: 27, lines: three };
  }
  function draw(list) {
    var n = list.length, c = 370, r = 366, step = 2 * Math.PI / n;
    ctx.clearRect(0, 0, 740, 740);
    for (var i = 0; i < n; i++) {
      var a0 = -Math.PI / 2 - step / 2 + i * step, col = colorFor(i, n);
      ctx.beginPath(); ctx.moveTo(c, c); ctx.arc(c, c, r, a0, a0 + step); ctx.closePath();
      ctx.fillStyle = col; ctx.fill(); ctx.lineWidth = 5; ctx.strokeStyle = '#1c140f'; ctx.stroke();
      ctx.save(); ctx.translate(c, c); ctx.rotate(a0 + step / 2); ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      ctx.fillStyle = (col === '#e0442a' || col === '#127e73') ? '#fffaf0' : '#1c140f';
      var L = layout(String(list[i].name)), lh = L.px * 1.05;
      setSize(L.px);
      L.lines.forEach(function (line, j) { ctx.fillText(line, r - 34, (j - (L.lines.length - 1) / 2) * lh); });
      ctx.restore();
    }
    // rim dots
    for (var k = 0; k < n * 2; k++) {
      var a = -Math.PI / 2 + k * step / 2;
      ctx.beginPath(); ctx.arc(c + Math.cos(a) * (r - 12), c + Math.sin(a) * (r - 12), 6, 0, 2 * Math.PI);
      ctx.fillStyle = '#fffaf0'; ctx.fill(); ctx.lineWidth = 2.5; ctx.stroke();
    }
  }
  draw(WHEEL.length ? WHEEL : [{ name: 'Coming soon' }]);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { if (!spinning && !prize) draw(WHEEL.length ? WHEEL : [{ name: 'Coming soon' }]); });

  function track(name, data) { try { if (window.bbTrack) bbTrack(name, data); } catch (_) {} }
  function post(body) {
    return fetch('/api/spin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().catch(function () { return { error: 'Please try again.' }; }); });
  }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

  // ---- pop-ups
  var lastFocus = null;
  function open(id) {
    lastFocus = document.activeElement;
    var m = document.getElementById(id); m.classList.add('on'); document.body.style.overflow = 'hidden';
    var f = m.querySelector('input,button.cta'); if (f && window.innerWidth > 560) setTimeout(function () { f.focus(); }, 250);
  }
  function close(id) {
    document.getElementById(id).classList.remove('on'); document.body.style.overflow = '';
    if (id === 'mUp') { showCouponCard(); setTimeout(function () { prizeBox.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' }); }, 150); }
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  Array.prototype.forEach.call(document.querySelectorAll('.modal'), function (m) {
    m.addEventListener('click', function (e) { if (e.target === m || e.target.hasAttribute('data-close')) close(m.id); });
  });
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    Array.prototype.forEach.call(document.querySelectorAll('.modal.on'), function (m) { close(m.id); });
  });

  function ticket(box, p) {
    box.innerHTML = '';
    var t1 = el('div', 't1');
    if (p.logo) { var img = el('img'); img.src = p.logo; img.alt = p.restaurant + ' logo'; t1.appendChild(img); }
    t1.appendChild(el('div', 'big', p.deal));
    t1.appendChild(el('div', 'where', p.restaurant));
    if (p.address) t1.appendChild(el('div', 'addr', p.address));
    box.appendChild(t1); box.appendChild(el('div', 'perf'));
    box.appendChild(el('div', 't2', 'Valid ${esc(ev.datesLabel)}'));
  }

  // ---- the prize card under the wheel (reopens the pop-up if they close it)
  var prizeBox = document.getElementById('prize');
  function showPrizeCard() {
    prizeBox.innerHTML = '';
    prizeBox.appendChild(el('div', 'won', 'Your prize'));
    prizeBox.appendChild(el('b', null, prize.deal));
    prizeBox.appendChild(el('div', null, prize.restaurant));
    var btn = el('button', null, 'Claim my free coupon →'); btn.type = 'button';
    btn.onclick = function () { open('mWin'); };
    prizeBox.appendChild(btn); prizeBox.classList.add('on');
  }
  function showCouponCard() {
    if (!coupon) return;
    prizeBox.innerHTML = '';
    prizeBox.appendChild(el('div', 'won', 'Your free coupon'));
    prizeBox.appendChild(el('b', null, coupon.deal));
    prizeBox.appendChild(el('div', null, coupon.restaurant));
    // The main ask: the full passport at the spin-winner price
    if (offer) {
      var b = el('button', 'buyall'); b.type = 'button';
      b.innerHTML = 'Get every deal for <s>${price}</s> ${deal} →';
      b.onclick = function () { renderList(); open('mUp'); };
      prizeBox.appendChild(b);
    }
    // Opens the coupon they were already texted (nothing is sent again)
    var a = el('a', offer ? 'seecoupon' : null, 'See my coupon →'); a.href = coupon.link; a.target = '_blank'; a.rel = 'noopener';
    prizeBox.appendChild(a);
    prizeBox.classList.add('on');
  }

  // ---- remember this visitor (on this phone's browser) so a return visit picks up where they left off:
  //   nothing saved          -> they never spun: normal wheel
  //   { s: 'spun', ... }     -> spun but didn't claim: "You won X, claim it" (the spin is good for 48 hours)
  //   { s: 'claimed', ... }  -> claimed: their coupon + the spin-winner passport price
  // Facebook and Instagram each keep their own browser storage, so a visitor can look new in the other app;
  // the one-coupon-per-phone rule on the server still applies.
  var KEY = 'bb_spin:' + EVENT + ':' + CITY, SPIN_TTL = 47 * 3600 * 1000;
  // Change the web address for each funnel step and report it to Meta as a page view:
  //   /spin/<event>/<city>/won      after the wheel lands
  //   /spin/<event>/<city>/claimed  after they enter their name + number (coupon texted)
  var BASE = '/spin/' + SLUG + '/' + CITY;
  function step(name) {
    try { history.pushState(null, '', BASE + '/' + name + location.search); } catch (_) { return; }
    if (window.fbq) window.fbq('track', 'PageView');
  }
  function save(v) { try { v.at = Date.now(); localStorage.setItem(KEY, JSON.stringify(v)); } catch (_) {} }
  function load() { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (_) { return null; } }
  function forget() { try { localStorage.removeItem(KEY); } catch (_) {} }
  function hero(eye, h1, lede) {
    document.getElementById('heroEye').textContent = eye;
    document.getElementById('heroH1').innerHTML = h1;
    document.getElementById('heroLede').textContent = lede;
  }
  function restore() {
    if (q.get('reset')) forget(); // testing: add ?reset=1 to the link to start fresh
    var v = load(); if (!v) return;
    var stage = document.getElementById('spin');
    if (v.s === 'claimed' && v.coupon) {
      coupon = v.coupon; offer = v.offer || null;
      hero('Welcome back', 'Your <span class="swap">free coupon</span> is ready', offer ? 'Spin winners get every deal for ${deal}.' : 'Show it at the restaurant, ${esc(ev.datesLabel)}.');
      stage.classList.add('back'); showCouponCard();
      if (offer) { document.getElementById('upSent').hidden = true; renderList(); }
    } else if (v.s === 'spun' && v.prize && Date.now() - v.at < SPIN_TTL) {
      spinId = v.spinId; prize = v.prize;
      hero('Welcome back', 'You won! <span class="swap">Claim your deal</span>', 'Good ${esc(ev.datesLabel)}.');
      stage.classList.add('back'); ticket(document.getElementById('winTicket'), prize); showPrizeCard();
      setTimeout(function () { open('mWin'); }, 700);
    } else forget();
  }

  // ---- spin
  function spin() {
    if (spinning || prize) { if (prize && !coupon) open('mWin'); return; }
    if (!WHEEL.length) { err.textContent = 'The wheel isn’t ready yet. Check back soon!'; return; }
    spinning = true; err.textContent = ''; go.disabled = true; go.textContent = 'SPINNING…';
    // Start turning right away so it feels instant; settle on the winner when the server answers
    canvas.style.transition = 'transform 1.2s cubic-bezier(.5,0,1,1)';
    rot += 720; canvas.style.transform = 'rotate(' + rot + 'deg)';
    var t0 = Date.now();
    post({ step: 'spin', city: CITY, wheel: WHEEL.map(function (w) { return w.id; }), source: SOURCE }).then(function (d) {
      if (!d.ok) throw new Error(d.error || 'Please try again.');
      var changed = d.wheel.map(function (w) { return w.id; }).join() !== WHEEL.map(function (w) { return w.id; }).join();
      WHEEL = d.wheel; if (changed) draw(WHEEL);
      spinId = d.spinId; prize = d.prize;
      setTimeout(function () {
        var n = WHEEL.length, step = 360 / n;
        var target = (360 - d.pick * step) % 360 + (Math.random() - 0.5) * step * 0.55;
        var base = rot - (rot % 360) + 360 * (reduce ? 2 : 5);
        rot = base + target; if (rot < base) rot += 360;
        var dur = reduce ? 1.2 : 4.6;
        canvas.style.transition = 'transform ' + dur + 's cubic-bezier(.15,.75,.15,1)';
        canvas.style.transform = 'rotate(' + rot + 'deg)';
        setTimeout(landed, dur * 1000 + 150);
      }, Math.max(0, 900 - (Date.now() - t0)));
    }).catch(function (e) {
      spinning = false; go.disabled = false; go.textContent = 'SPIN THE WHEEL';
      err.textContent = (e && e.message) || 'Connection problem. Please try again.';
    });
  }
  function landed() {
    spinning = false; go.textContent = 'YOU WON! 🎉';
    confetti();
    if (navigator.vibrate) try { navigator.vibrate([60, 40, 120]); } catch (_) {}
    ticket(document.getElementById('winTicket'), prize);
    showPrizeCard();
    save({ s: 'spun', spinId: spinId, prize: prize });
    step('won');
    setTimeout(function () { open('mWin'); }, reduce ? 200 : 650);
  }
  go.addEventListener('click', spin);
  wrap.addEventListener('click', spin);

  // ---- claim
  var form = document.getElementById('claim'), cerr = document.getElementById('cerr'), cbtn = document.getElementById('claimBtn');
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    cerr.textContent = '';
    Array.prototype.forEach.call(form.querySelectorAll('input'), function (i) { i.classList.remove('bad'); });
    var name = form.name.value.trim(), phone = form.phone.value.replace(/\\D/g, '');
    var bad = !name ? 'name' : (phone.length < 10 ? 'phone' : null);
    if (bad) {
      form[bad].classList.add('bad'); form[bad].focus();
      cerr.textContent = bad === 'name' ? 'Please enter your first name.' : 'Please enter your mobile number.';
      return;
    }
    cbtn.disabled = true; cbtn.textContent = 'Sending…';
    post({ step: 'claim', city: CITY, spinId: spinId, name: name, phone: form.phone.value, textOk: form.textOk.checked }).then(function (d) {
      if (!d.ok) {
        cbtn.disabled = false; cbtn.textContent = 'Send my free coupon →';
        if (d.field && form[d.field]) form[d.field].classList.add('bad');
        cerr.textContent = d.error || 'Please try again.';
        if (d.respin) { forget(); prize = null; spinId = null; prizeBox.classList.remove('on'); go.disabled = false; go.textContent = 'SPIN AGAIN'; setTimeout(function () { close('mWin'); }, 1800); }
        return;
      }
      coupon = d.coupon; offer = d.offer || null;
      save({ s: 'claimed', coupon: coupon, offer: offer });
      step('claimed');
      track('Lead', { content_name: LEAD_NAME });
      document.getElementById('upSentText').textContent = d.already
        ? 'This number already has a free coupon' + (coupon ? ' (' + coupon.restaurant + ')' : '') + '.'
        : 'Your free coupon is on its way by text.';
      var sl = document.getElementById('upSentLink');
      if (coupon && coupon.link) { sl.href = coupon.link; sl.hidden = false; } else sl.hidden = true;
      close('mWin');
      if (offer && DEALS.length > 1) setTimeout(function () { renderList(); open('mUp'); }, 450);
      else showCouponCard();
    }).catch(function () {
      cbtn.disabled = false; cbtn.textContent = 'Send my free coupon →';
      cerr.textContent = 'Connection problem. Please try again.';
    });
  });

  // ---- upsell
  function renderList() {
    var ul = document.getElementById('upList'); ul.innerHTML = '';
    DEALS.forEach(function (x) {
      var mine = coupon && x.id === coupon.id;
      var li = el('li', mine ? 'mine' : null);
      li.appendChild(el('span', 'ck', '✓'));
      var t = el('div'); t.appendChild(el('b', null, x.n));
      t.appendChild(el('span', null, x.d));
      if (mine) { t.appendChild(document.createElement('br')); t.appendChild(el('em', null, 'Free coupon already yours')); }
      li.appendChild(t); ul.appendChild(li);
    });
  }
  document.getElementById('upSkip').onclick = function () { close('mUp'); };
  document.getElementById('upBuy').onclick = function () {
    // Checkout stays on getbitebook.com at its own address, /spin/<event>/<city>/checkout: the passport page
    // with Stripe built into the page, at the spin-winner price
    this.disabled = true; this.textContent = 'Opening secure checkout…';
    track('InitiateCheckout', { content_type: 'product', content_ids: [EVENT + '-' + CITY], value: PRICE, currency: 'USD' });
    location.href = BASE + '/checkout?src=' + encodeURIComponent(SOURCE ? 'spin-' + SOURCE : 'spin') + '&offer=' + encodeURIComponent(offer || '') + '#buy';
  };
  // FAQ "Get it now for 20% off": straight to checkout for spin winners; everyone else spins first
  var faqBuy = document.getElementById('faqBuy');
  if (faqBuy) faqBuy.onclick = function (e) {
    e.preventDefault();
    if (offer) return document.getElementById('upBuy').click();
    document.getElementById('spin').scrollIntoView({ behavior: 'smooth', block: 'start' });
    err.textContent = 'Spin first: every winner unlocks ${SPIN_DISCOUNT_PCT}% off the full book.';
  };
  // Back from Stripe (browser back button): undo the "opening" state
  window.addEventListener('pageshow', function (e) {
    if (!e.persisted) return;
    var b = document.getElementById('upBuy'); b.disabled = false; b.textContent = ${js(`Get all ${all.length} deals for ${deal} →`)};
  });

  restore();

  // ---- confetti
  function confetti() {
    var c = document.createElement('canvas'); c.className = 'confetti'; document.body.appendChild(c);
    var dpr = Math.min(window.devicePixelRatio || 1, 2), W = innerWidth, H = innerHeight;
    c.width = W * dpr; c.height = H * dpr; var g = c.getContext('2d'); g.scale(dpr, dpr);
    var cols = ['#f2ac1d', '#e0442a', '#127e73', '#fffaf0', '#1c140f'], parts = [], N = reduce ? 40 : 170;
    for (var i = 0; i < N; i++) {
      var left = i % 2 === 0, sp = 9 + Math.random() * 10, ang = (left ? -60 : -120) + (Math.random() - 0.5) * 50;
      parts.push({ x: left ? -10 : W + 10, y: H * 0.75, vx: Math.cos(ang * Math.PI / 180) * sp * (W / 420), vy: Math.sin(ang * Math.PI / 180) * sp * 1.25,
        w: 7 + Math.random() * 7, h: 10 + Math.random() * 8, r: Math.random() * 6.28, vr: (Math.random() - 0.5) * 0.35, c: cols[i % cols.length] });
    }
    var t0 = performance.now();
    (function frame(t) {
      var age = t - t0; g.clearRect(0, 0, W, H);
      parts.forEach(function (p) {
        p.vy += 0.32; p.vx *= 0.99; p.vy *= 0.99; p.x += p.vx; p.y += p.vy; p.r += p.vr;
        g.save(); g.translate(p.x, p.y); g.rotate(p.r); g.globalAlpha = Math.max(0, 1 - Math.max(0, age - 2600) / 900);
        g.fillStyle = p.c; g.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.r * 1.7))); g.restore();
      });
      if (age < 3500) requestAnimationFrame(frame); else c.remove();
    })(t0);
  }
})();
</script>
</body>
</html>`;
}

function pickerPage(ev) {
  const links = ev.cities.map((id) => CITIES[id]).map((c) => `<a class="again" style="margin-top:14px" href="/spin/${ev.slug}/${c.id}">${esc(c.name)} →</a>`).join('');
  return `${head({ title: `Spin to Win a Free ${ev.name} Deal | BiteBook`, desc: `Spin the BiteBook wheel and win a free ${ev.food} deal at a local restaurant in ${ev.cities.map((id) => CITIES[id].name).join(', ')}. Every spin wins.`, url: `${WWW}/spin` })}
<body>
${topBar(ev)}
<main><div class="wrap hero" style="padding-bottom:30px">
  <div class="eyebrow">Free · Every spin wins</div>
  <h1>Spin to win a <span class="swap">free wing deal</span></h1>
  <p class="lede">Pick your city to spin.</p>
  <div style="max-width:380px;margin:20px auto 0">${links}</div>
</div></main>
<footer><div class="wrap">Questions? <a href="mailto:${esc(SUPPORT_EMAIL)}">${esc(SUPPORT_EMAIL)}</a> · <a href="/terms">Terms</a></div></footer>
</body></html>`;
}

export default async function spin(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'POST') return api(req, res);
  const ev = EVENTS[SPIN_EVENT];
  const city = CITIES[String(req.query.city || '')];
  // /spin/<event>/<city>: only the event currently on the spinner has a page; anything else gets the picker
  if (req.query.event && String(req.query.event) !== ev.slug) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send(pickerPage(ev));
  }
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  if (!city || !ev.cities.includes(city.id)) return res.status(200).send(pickerPage(ev));
  return res.status(200).send(cityPage(ev, city));
}
