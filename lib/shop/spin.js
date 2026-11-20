// Free-coupon spinner landing page (built for Meta ads): getbitebook.com/spin/<city>
//   GET  /spin/<city>   -> the page: spin first, then claim, then the 25%-off passport offer
//   GET  /spin          -> pick your city
//   POST /api/spin      -> { step: 'spin', city, wheel: [restaurant ids], source }
//                          -> picks the winner from the restaurants on the person's wheel and saves the spin
//                       -> { step: 'claim', city, spinId, name, email, phone, textOk }
//                          -> turns the spin into the free coupon, sends it into GHL (which texts it) and,
//                             until texting is approved, emails it too
// One free coupon per email and per phone, per event and city. It works on the event's dates, like the book.
import { EVENTS, CITIES, SUPPORT_EMAIL, SITE_URL, eventWindow, SPIN_DISCOUNT_PCT, spinPriceCents } from '../config.js';
import { esc } from '../html.js';
import { wheelFor, spinWheel, openSpin, markSpinClaimed, existingFreePassport, createFreePassport } from '../freecoupon.js';
import { restaurantById, restaurantsFor } from '../restaurants.js';
import { syncFreeCoupon } from '../ghl.js';
import { sendFreeCouponEmail } from '../email.js';
import { logEvent } from '../db.js';

// The event the spinner gives coupons for. Change this when the next event goes on sale.
export const SPIN_EVENT = 'wings';

const WWW = 'https://www.getbitebook.com';
const STATE = { denver: 'CO', nashville: 'TN', phoenix: 'AZ' };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const digits = (s) => String(s || '').replace(/\D/g, '');
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
  const email = String(b.email || '').trim().toLowerCase().slice(0, 200);
  const phone = digits(b.phone).slice(-11);
  const textOk = b.textOk === true || b.textOk === 'yes';
  if (!name) return res.status(400).json({ error: 'Please enter your first name.', field: 'name' });
  if (phone.length < 10) return res.status(400).json({ error: 'Please enter a valid mobile number. We text your coupon to it.', field: 'phone' });
  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Please enter a valid email.', field: 'email' });
  if (ended(city, ev)) return res.status(400).json({ error: `${ev.name} has ended. Follow @${city.instagram} for the next one!` });

  // Already has a free coupon for this event and city: show it again (and still offer the passport deal)
  const already = await existingFreePassport({ cityId: city.id, eventId: ev.id, email, phone });
  if (already) {
    const r = restaurantById(already.free_restaurant);
    return res.status(200).json({ ok: true, already: true, coupon: r ? couponView(already, r, ev) : null, offer: already.id });
  }

  const s = await openSpin({ spinId: b.spinId, cityId: city.id, eventId: ev.id });
  if (!s || s.claimed_at) return res.status(400).json({ error: 'That spin has expired. Give the wheel another spin!', respin: true });
  const r = restaurantById(s.restaurant);
  if (!r || !r.active) return res.status(400).json({ error: 'That restaurant just left the lineup. Give the wheel another spin!', respin: true });

  const p = await createFreePassport({ cityId: city.id, eventId: ev.id, name, email, phone, textOk, restaurantId: r.id });
  await markSpinClaimed(s.id, p.id);
  await logEvent('free_coupon', { city: city.id, event: ev.id, restaurant: r.id, passport: p.id, spin: s.id, textOk });

  // GHL: contact + tags + New Lead card. Its workflow texts the coupon link.
  const ghl = await syncFreeCoupon({ cityId: city.id, name, email, phone, textOptIn: textOk, passportId: p.id, restaurant: r, ev });

  // Email copy, on by default until GHL texting is approved. Set FREE_COUPON_EMAIL=off in Vercel to stop it.
  if (process.env.FREE_COUPON_EMAIL !== 'off') {
    try { await sendFreeCouponEmail({ to: email, name, ev, city, restaurant: r, link: `${SITE_URL}/book/${p.id}` }); }
    catch (e) { await logEvent('free_coupon_email_failed', { passport: p.id, error: String(e.message || e).slice(0, 200) }); }
  }
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
.lede{font-size:1.06rem;color:var(--ink-soft);max-width:34ch;margin:12px auto 0}
.stage{display:flex;flex-direction:column;align-items:center;padding:18px 0 8px}
.wheelwrap{position:relative;width:min(86vw,370px);aspect-ratio:1;margin:8px auto 0;cursor:pointer;-webkit-tap-highlight-color:transparent}
.wheelwrap::before{content:"";position:absolute;inset:-10px;border-radius:50%;background:var(--ink);box-shadow:8px 8px 0 rgba(28,20,15,.25)}
.disc{position:relative;width:100%;height:100%;border-radius:50%;overflow:hidden;contain:paint}
#wheel{width:100%;height:100%;display:block;will-change:transform}
.pointer{position:absolute;top:-22px;left:50%;transform:translateX(-50%);width:44px;height:52px;z-index:3;filter:drop-shadow(3px 3px 0 rgba(28,20,15,.35))}
.hub{position:absolute;inset:0;margin:auto;width:24%;height:24%;border-radius:50%;background:var(--ink);border:4px solid var(--cream);z-index:2;display:flex;align-items:center;justify-content:center;color:var(--gold);font-family:'Bricolage Grotesque',sans-serif;font-weight:800;font-size:clamp(.9rem,4vw,1.2rem);letter-spacing:.02em;pointer-events:none}
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
.sent{background:var(--teal);color:var(--cream);border:2px solid var(--ink);padding:10px 12px;font-size:.92rem;font-weight:600;display:flex;gap:8px;align-items:flex-start}
.kick{font-family:'Space Mono',monospace;font-size:.74rem;letter-spacing:.12em;text-transform:uppercase;font-weight:700;color:var(--tomato);text-align:center;margin-top:16px}
.price{display:flex;justify-content:center;align-items:baseline;gap:12px;margin:10px 0 2px;font-family:'Bricolage Grotesque',sans-serif;font-weight:800}
.price s{font-size:1.5rem;color:var(--ink-soft);text-decoration-thickness:3px;text-decoration-color:var(--tomato)}
.price b{font-size:3rem;line-height:1;letter-spacing:-.03em}
.price small{font-family:'Space Mono',monospace;font-weight:400;font-size:.74rem;color:var(--ink-soft)}
.save{display:table;margin:4px auto 0;font-family:'Space Mono',monospace;font-size:.7rem;letter-spacing:.08em;text-transform:uppercase;font-weight:700;background:var(--gold);border:2px solid var(--ink);border-radius:40px;padding:4px 11px}
.list{list-style:none;margin:14px 0;border:2.5px solid var(--ink);background:var(--cream);max-height:34vh;overflow-y:auto}
.list li{display:flex;gap:10px;padding:9px 12px;border-bottom:1.5px solid var(--line);font-size:.92rem;line-height:1.3}
.list li:last-child{border-bottom:none}
.list .ck{color:var(--teal);font-weight:800;flex:none}
.list b{display:block}
.list span{color:var(--ink-soft);font-size:.84rem}
.list .mine{background:#fff3d6}
.list .mine em{font-style:normal;font-family:'Space Mono',monospace;font-size:.66rem;font-weight:700;color:var(--teal);text-transform:uppercase;letter-spacing:.06em}
.skip{display:block;margin:12px auto 0;background:none;border:none;font:inherit;font-size:.9rem;color:var(--ink-soft);text-decoration:underline;cursor:pointer;padding:6px}
#upCheckout{margin-top:12px;min-height:380px;background:#fff;border:2.5px solid var(--ink)}
#upCheckout .loading{padding:40px 16px;text-align:center;color:var(--ink-soft);font-family:'Space Mono',monospace;font-size:.8rem}
.confetti{position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:90}
[hidden]{display:none!important}
@media(prefers-reduced-motion:reduce){.spinbtn{animation:none}.sheet,.modal.on{animation:none}}
`;

function head({ title, desc, url, jsonld = '' }) {
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
<meta property="og:image" content="${WWW}/brand/logo-full.jpg">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${WWW}/brand/logo-full.jpg">
<link rel="icon" href="/favicon.ico" sizes="any">
<link rel="icon" type="image/png" sizes="192x192" href="/brand/icon-192.png">
<link rel="apple-touch-icon" href="/brand/icon-180.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,700;12..96,800&family=Space+Mono:wght@400;700&family=Inter:wght@400;500;600&display=swap">
<style>${CSS}</style>
<script src="/meta-pixel.js" async></script>
${jsonld}
</head>`;
}

const topBar = (ev, city) => `<header class="top"><div class="top-in">
  <a class="brand" href="/"><img src="/brand/logo-mark.png" alt="" width="38" height="26">BiteBook</a>
  <span class="pill">${esc(ev.name)}${city ? ` · ${esc(city.name)}` : ''}</span>
</div></header>`;

function faqs(ev, city, count) {
  return [
    ['Is the coupon really free?', `Yes. Spinning and claiming your coupon is free, with no purchase needed to get it. Your coupon is for the deal exactly as the restaurant offers it, and some deals are "with the purchase of" another item.`],
    ['When can I use my coupon?', `During ${ev.name}, ${ev.datesLabel}. Show the coupon on your phone at the restaurant and they scan it. Each coupon works once.`],
    ['How do I get my coupon?', 'After you spin, tell us where to send it. We text the coupon link to your phone and email you a copy. Nothing to print or download.'],
    ['Can I spin more than once?', `Every spin wins, and there's one free coupon per person in ${city.name}. If you spin again with the same phone or email, you'll see the coupon you already won.`],
    ['What is the BiteBook passport?', `The ${ev.name} passport has a deal at every participating restaurant in ${city.area}: ${count} spots and counting. Spin winners can get it for ${SPIN_DISCOUNT_PCT}% off right after claiming their free coupon.`],
    ['Do I have to sign up for texts?', 'No. We text you your coupon either way. Getting BiteBook deals by text is optional, and you can reply STOP at any time.'],
    ['Who is BiteBook?', 'BiteBook runs local food events that send hungry people to independent restaurants. The restaurants set the deals; we make it easy to find them.'],
  ];
}

function cityPage(ev, city) {
  const all = restaurantsFor(city.id, ev.id);
  const wheel = wheelFor(city.id, ev.id).map((r) => ({ id: r.id, name: r.name }));
  const url = `${WWW}/spin/${city.id}`;
  const fq = faqs(ev, city, all.length);
  const price = money(ev.priceCents);
  const deal = money(spinPriceCents(ev));
  const pk = process.env.STRIPE_PUBLISHABLE_KEY || '';
  const { start, end } = eventWindow(city.id, ev.id);
  const title = `Free Wing Deal in ${city.name}: Spin to Win | BiteBook`;
  const desc = `Spin the BiteBook wheel and win a free ${ev.food} deal at a local ${city.name} restaurant. Every spin wins. Good ${ev.datesLabel}.`;
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
        image: [`${WWW}/brand/logo-full.jpg`],
        offers: { '@type': 'Offer', price: (ev.priceCents / 100).toFixed(2), priceCurrency: 'USD', url: `${WWW}/${ev.slug}/${city.id}`, availability: 'https://schema.org/InStock' },
      },
    ],
  })}</script>`;

  const spots = all.map((r) => `<div class="spot"><h3>${esc(r.name)}</h3><div class="d">${esc(r.short || r.deal)}</div>${r.address ? `<div class="a">${esc(r.address)}</div>` : ''}</div>`).join('');

  return `${head({ title, desc, url, jsonld })}
<body>
${topBar(ev, city)}
<main>
  <div class="wrap hero">
    <div class="eyebrow">Free · Every spin wins</div>
    <h1>Spin to win a <span class="swap">free wing deal</span> in ${esc(city.name)}</h1>
    <p class="lede">Win a deal from a local ${esc(city.name)} wing spot. Good ${esc(ev.datesLabel)}.</p>
  </div>

  <div class="wrap stage" id="spin">
    <div class="wheelwrap" id="wheelwrap" role="button" tabindex="-1" aria-label="Spin the wheel">
      <svg class="pointer" viewBox="0 0 44 52" aria-hidden="true"><path d="M22 50 L3 10 A20 20 0 0 1 41 10 Z" fill="#e0442a" stroke="#1c140f" stroke-width="3.5" stroke-linejoin="round"/><circle cx="22" cy="17" r="6" fill="#fffaf0" stroke="#1c140f" stroke-width="3"/></svg>
      <div class="disc"><canvas id="wheel" width="740" height="740" aria-hidden="true"></canvas></div>
      <div class="hub">SPIN</div>
    </div>
    <button class="spinbtn" id="go" type="button">SPIN THE WHEEL</button>
    <div class="err" id="err" role="alert"></div>
    <ul class="trust"><li>Every spin wins</li><li>No purchase to claim</li><li>Takes 10 seconds</li></ul>
    <div class="prize" id="prize" aria-live="polite"></div>
  </div>

  <div class="wrap">
    <section>
      <h2>How it works</h2>
      <ol class="steps">
        <li><span class="n">01</span><b>Spin the wheel</b><span>Every spin lands on a real ${esc(ev.food)} deal from a local ${esc(city.name)} restaurant.</span></li>
        <li><span class="n">02</span><b>Claim your coupon</b><span>Tell us where to send it. It arrives by text and email in seconds.</span></li>
        <li><span class="n">03</span><b>Eat local</b><span>Show the coupon on your phone at the restaurant, ${esc(ev.datesLabel)}.</span></li>
      </ol>
    </section>

    ${all.length ? `<section>
      <h2>${esc(ev.name)} deals in ${esc(city.name)}</h2>
      <p style="color:var(--ink-soft);margin:-4px 0 14px">${all.length} local restaurants on the wheel. Spin for one free, or get every deal with the BiteBook passport.</p>
      <div class="deals">${spots}</div>
    </section>` : ''}

    <section>
      <h2>Questions</h2>
      ${fq.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('')}
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
      <div class="ask">Where should we send your coupon?</div>
      <input type="text" name="name" placeholder="First name" autocomplete="given-name" aria-label="First name" required>
      <input type="tel" name="phone" placeholder="Mobile number" autocomplete="tel" inputmode="tel" aria-label="Mobile number" required>
      <input type="email" name="email" placeholder="Email" autocomplete="email" inputmode="email" aria-label="Email" required>
      <label class="opt"><input type="checkbox" name="textOk" value="yes"><span>Also text me exclusive BiteBook deals &amp; new events (about 2 a month). Msg &amp; data rates may apply. Reply STOP to opt out, HELP for help. Not required.</span></label>
      <div class="err" id="cerr" role="alert" style="margin:0"></div>
      <button class="cta" id="claimBtn" type="submit">Send my free coupon →</button>
      <p class="fine">We'll text your coupon to this number and email you a copy. By claiming you agree to our <a href="/terms">terms</a>.</p>
    </form>
  </div>
</div>

<!-- Pop-up 2: the full passport, 25% off for spin winners -->
<div class="modal" id="mUp" role="dialog" aria-modal="true" aria-labelledby="upH">
  <div class="sheet">
    <button class="x" type="button" data-close aria-label="Close">×</button>
    <div class="sent" id="upSent"><span aria-hidden="true">✓</span><span>Your free coupon is on its way. Check your texts and email.</span></div>
    <div id="upOffer">
      <div class="kick">Spin winners only · ${SPIN_DISCOUNT_PCT}% off</div>
      <h2 id="upH">Want all ${all.length} ${esc(city.name)} deals?</h2>
      <div class="price"><s>${price}</s><b>${deal}</b><small>/ PASSPORT</small></div>
      <span class="save">You save ${money(ev.priceCents - spinPriceCents(ev))}</span>
      <ul class="list" id="upList"></ul>
      <button class="cta" id="upBuy" type="button">Get all ${all.length} deals for ${deal} →</button>
      <p class="fine" style="margin-top:10px">One passport, a ${esc(ev.food)} deal at every spot, ${esc(ev.datesLabel)}. Not happy? Full refund, no hassle.</p>
    </div>
    <div id="upPay" hidden><div id="upCheckout"><div class="loading">Loading secure checkout…</div></div><div class="err" id="uerr" role="alert"></div></div>
    <button class="skip" type="button" id="upSkip">No thanks, just my free coupon</button>
  </div>
</div>

<script${pk ? '' : ' data-nostripe'}>
(function () {
  var CITY = ${js(city.id)}, EVENT = ${js(ev.id)}, SLUG = ${js(ev.slug)};
  var WHEEL = ${js(wheel)};
  var DEALS = ${js(all.map((r) => ({ id: r.id, n: r.name, d: r.short || r.deal })))};
  var PK = ${js(pk)}, PRICE = ${spinPriceCents(ev) / 100};
  var LEAD_NAME = ${js(`${ev.name} free coupon · ${city.name}`)};
  var q = new URLSearchParams(location.search);
  var SOURCE = q.get('utm_source') || q.get('src') || '';
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var COLORS = ['#f2ac1d', '#e0442a', '#fffaf0', '#127e73'];
  var canvas = document.getElementById('wheel'), ctx = canvas.getContext('2d');
  var go = document.getElementById('go'), err = document.getElementById('err'), wrap = document.getElementById('wheelwrap');
  var rot = 0, spinning = false, spinId = null, prize = null, coupon = null, offer = null;

  function colorFor(i, n) { var c = COLORS[i % 4]; if (n % 4 === 1 && i === n - 1) c = COLORS[1]; return c; }
  function fit(t, max) {
    if (ctx.measureText(t).width <= max) return t;
    while (t.length > 3 && ctx.measureText(t + '…').width > max) t = t.slice(0, -1);
    return t.replace(/[\\s–-]+$/, '') + '…';
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
      ctx.font = '800 30px "Bricolage Grotesque", Inter, sans-serif';
      ctx.fillText(fit(String(list[i].name), 230), r - 26, 0); ctx.restore();
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
    var a = el('a', null, 'See my coupon →'); a.href = coupon.link; a.target = '_blank'; a.rel = 'noopener';
    prizeBox.appendChild(a);
    if (offer) {
      var b = el('button', null, 'Get every deal for ' + '${deal}'); b.type = 'button';
      b.style.background = 'var(--gold)'; b.style.color = 'var(--ink)';
      b.onclick = function () { open('mUp'); };
      prizeBox.appendChild(b);
    }
    prizeBox.classList.add('on');
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
    var name = form.name.value.trim(), phone = form.phone.value.replace(/\\D/g, ''), email = form.email.value.trim();
    var bad = !name ? 'name' : (phone.length < 10 ? 'phone' : (!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]{2,}$/.test(email) ? 'email' : null));
    if (bad) {
      form[bad].classList.add('bad'); form[bad].focus();
      cerr.textContent = bad === 'name' ? 'Please enter your first name.' : (bad === 'phone' ? 'Please enter your mobile number.' : 'Please enter a valid email.');
      return;
    }
    cbtn.disabled = true; cbtn.textContent = 'Sending…';
    post({ step: 'claim', city: CITY, spinId: spinId, name: name, phone: form.phone.value, email: email, textOk: form.textOk.checked }).then(function (d) {
      if (!d.ok) {
        cbtn.disabled = false; cbtn.textContent = 'Send my free coupon →';
        if (d.field && form[d.field]) form[d.field].classList.add('bad');
        cerr.textContent = d.error || 'Please try again.';
        if (d.respin) { prize = null; spinId = null; prizeBox.classList.remove('on'); go.disabled = false; go.textContent = 'SPIN AGAIN'; setTimeout(function () { close('mWin'); }, 1800); }
        return;
      }
      coupon = d.coupon; offer = d.offer || null;
      track('Lead', { content_name: LEAD_NAME });
      document.getElementById('upSent').lastChild.textContent = d.already
        ? 'You already have a free coupon (' + (coupon ? coupon.restaurant : 'see your texts') + '). We sent it again.'
        : 'Your free coupon is on its way. Check your texts and email.';
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
  var stripeLoaded = null, mounted = null;
  function loadStripe() {
    if (window.Stripe) return Promise.resolve();
    if (stripeLoaded) return stripeLoaded;
    stripeLoaded = new Promise(function (ok, no) {
      var s = document.createElement('script'); s.src = 'https://js.stripe.com/v3/'; s.onload = ok; s.onerror = no; document.head.appendChild(s);
    });
    return stripeLoaded;
  }
  document.getElementById('upBuy').onclick = function () {
    if (!PK) { location.href = '/' + SLUG + '/' + CITY + '?src=spin&offer=' + encodeURIComponent(offer || ''); return; }
    document.getElementById('upOffer').hidden = true; document.getElementById('upSent').hidden = true;
    document.getElementById('upPay').hidden = false;
    document.getElementById('upSkip').textContent = 'Not now';
    track('InitiateCheckout', { content_type: 'product', content_ids: [EVENT + '-' + CITY], value: PRICE, currency: 'USD' });
    if (mounted) return;
    var uerr = document.getElementById('uerr'), box = document.getElementById('upCheckout');
    loadStripe().then(function () {
      var stripe = Stripe(PK);
      var make = stripe.createEmbeddedCheckoutPage ? stripe.createEmbeddedCheckoutPage.bind(stripe) : stripe.initEmbeddedCheckout.bind(stripe);
      return make({ fetchClientSecret: function () {
        return fetch('/api/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ event: EVENT, city: CITY, source: SOURCE ? 'spin-' + SOURCE : 'spin', offer: offer }) })
          .then(function (r) { return r.json().then(function (j) { if (!r.ok || !j.clientSecret) throw new Error(j.error || 'Checkout is having trouble right now.'); return j.clientSecret; }); });
      } });
    }).then(function (checkout) { box.innerHTML = ''; checkout.mount('#upCheckout'); mounted = checkout; })
      .catch(function (e) {
        box.innerHTML = '';
        var a = el('a', 'cta', 'Open checkout →'); a.href = '/' + SLUG + '/' + CITY + '?src=spin&offer=' + encodeURIComponent(offer || '');
        box.appendChild(a); uerr.textContent = (e && e.message) || '';
      });
  };

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
  const links = ev.cities.map((id) => CITIES[id]).map((c) => `<a class="again" style="margin-top:14px" href="/spin/${c.id}">${esc(c.name)} →</a>`).join('');
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
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  if (!city || !ev.cities.includes(city.id)) return res.status(200).send(pickerPage(ev));
  return res.status(200).send(cityPage(ev, city));
}
