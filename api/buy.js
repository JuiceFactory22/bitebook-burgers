// Passport sales pages with Stripe checkout built in:
//   /wings             pick a city
//   /wings/<city>      event page + inline checkout
//   /wings/thanks      after payment (?session_id=...)
import { EVENTS, CITIES } from '../lib/config.js';
import { esc } from '../lib/html.js';
import { getCheckoutSession, getSessionLineItems } from '../lib/stripe.js';

const money = (cents) => `$${(Number(cents || 0) / 100).toFixed(Number(cents) % 100 ? 2 : 0)}`;
const firstName = (n) => String(n || '').trim().split(/\s+/)[0] || 'friend';

function shell({ title, desc, ev, body, scripts = '' }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,700;12..96,800&family=Space+Mono:wght@400;700&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<style>
  :root { --ink:#1F1A15; --paper:#FBF4E4; --stub:#FFFDF7; --mustard:#F2B33D; --red:#C8371D; --muted:#5E5246; }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--paper); color:var(--ink); font-family:Inter, system-ui, sans-serif; }
  a { color:var(--red); }
  .bar { background:var(--ink); color:var(--paper); padding:14px 16px; display:flex; justify-content:space-between; align-items:center; }
  .bar a { color:var(--paper); text-decoration:none; font-family:'Bricolage Grotesque', sans-serif; font-weight:800; font-size:22px; }
  .bar span { font-family:'Space Mono', monospace; font-size:12px; letter-spacing:2px; color:var(--mustard); }
  .hero { background:var(--ink); color:var(--paper); padding:26px 16px 36px; border-bottom:4px solid var(--mustard); }
  .wrap { max-width:720px; margin:0 auto; }
  .eyebrow { font-family:'Space Mono', monospace; font-size:13px; letter-spacing:3px; color:var(--mustard); }
  h1 { font-family:'Bricolage Grotesque', sans-serif; font-weight:800; font-size:clamp(52px, 15vw, 116px); line-height:.86; letter-spacing:-2px; margin:18px 0 14px; }
  .city { font-family:'Bricolage Grotesque', sans-serif; font-weight:800; font-size:clamp(28px, 8vw, 50px); line-height:1; margin:0 0 8px; }
  .dates { font-family:'Bricolage Grotesque', sans-serif; font-weight:800; font-size:clamp(20px, 5.5vw, 32px); color:var(--mustard); }
  .lede { font-size:18px; line-height:1.5; margin:16px 0 22px; max-width:600px; }
  .price { display:inline-block; background:var(--mustard); color:var(--ink); border:2px solid var(--paper); border-radius:999px; padding:6px 14px; font-family:'Space Mono', monospace; font-weight:700; font-size:14px; letter-spacing:1px; margin-bottom:18px; }
  .btn { display:flex; align-items:center; justify-content:center; width:100%; max-width:420px; min-height:62px; padding:14px 22px; background:var(--red); color:#fff; border:2px solid var(--ink); border-radius:14px; font-family:'Bricolage Grotesque', sans-serif; font-weight:800; font-size:22px; text-decoration:none; box-shadow:0 5px 0 var(--mustard); cursor:pointer; }
  .hero .btn { border-color:var(--mustard); }
  .btn:disabled { opacity:.6; cursor:wait; }
  main { padding:30px 16px 48px; }
  h2 { font-family:'Bricolage Grotesque', sans-serif; font-weight:800; font-size:34px; margin:0 0 14px; }
  .steps { display:grid; gap:12px; margin:0 0 30px; padding:0; list-style:none; }
  .steps li { display:flex; gap:14px; background:var(--stub); border:2px solid var(--ink); border-radius:14px; padding:14px 16px; line-height:1.45; }
  .steps .n { flex-shrink:0; width:38px; height:38px; border-radius:999px; background:var(--mustard); border:2px solid var(--ink); display:flex; align-items:center; justify-content:center; font-family:'Space Mono', monospace; font-weight:700; }
  .steps b { display:block; font-family:'Bricolage Grotesque', sans-serif; font-size:19px; }
  .note { font-size:15px; line-height:1.5; color:var(--muted); }
  #buy { scroll-margin-top:12px; }
  #checkout { margin-top:18px; background:#fff; border:2px solid var(--ink); border-radius:14px; overflow:hidden; display:none; }
  #checkout.on { display:block; }
  .err { color:var(--red); font-weight:600; margin-top:12px; }
  .cities { display:grid; gap:12px; }
  .cities a { display:flex; justify-content:space-between; align-items:center; background:var(--stub); border:2px solid var(--ink); border-radius:14px; padding:18px; color:var(--ink); text-decoration:none; font-family:'Bricolage Grotesque', sans-serif; font-weight:800; font-size:28px; box-shadow:0 4px 0 var(--ink); }
  .cities a span { font-family:'Space Mono', monospace; font-size:13px; letter-spacing:1.5px; color:var(--red); }
  .card { background:var(--stub); border:2px solid var(--ink); border-radius:14px; padding:18px; line-height:1.5; }
  .others { margin-top:28px; font-size:15px; }
  footer { text-align:center; padding:22px 16px 34px; font-family:'Space Mono', monospace; font-size:12px; color:var(--muted); }
</style>
</head>
<body>
<div class="bar"><a href="/">BiteBook</a><span>${esc(ev.name.toUpperCase())}</span></div>
${body}
<footer>Questions? info@getbitebook.com · getbitebook.com</footer>
${scripts}
</body>
</html>`;
}

function pickerPage(ev) {
  const links = ev.cities.map((id) => CITIES[id]).map((c) => `<a href="/${ev.slug}/${c.id}">${esc(c.name)} <span>GET PASSPORT →</span></a>`).join('');
  return shell({
    title: `${ev.name} · BiteBook`,
    desc: `${ev.name}: one passport, a ${ev.food} deal at local restaurants near you. ${ev.datesLabel}.`,
    ev,
    body: `<section class="hero"><div class="wrap">
  <div class="eyebrow">BITEBOOK PRESENTS</div>
  <h1>${esc(ev.coverWords.join(' '))}</h1>
  <div class="dates">${esc(ev.datesLabel.toUpperCase())}</div>
  <p class="lede">One passport. A ${esc(ev.food)} deal at local restaurants all over your area. Pick your city to get yours.</p>
</div></section>
<main><div class="wrap"><div class="cities">${links}</div></div></main>`,
  });
}

function cityPage(ev, city) {
  const pk = process.env.STRIPE_PUBLISHABLE_KEY || '';
  const others = ev.cities.filter((id) => id !== city.id).map((id) => `<a href="/${ev.slug}/${id}">${esc(CITIES[id].name)}</a>`).join(' · ');
  const buy = pk
    ? `<button class="btn" id="go" type="button">Get my passport · ${money(ev.priceCents)}</button>
  <div id="err" class="err" role="alert"></div>
  <div id="checkout"></div>`
    : `<div class="card"><b>Passports go on sale very soon.</b> Check back shortly!</div>`;
  const scripts = pk ? `<script src="https://js.stripe.com/v3/"></script>
<script>
(function () {
  var go = document.getElementById('go'), box = document.getElementById('checkout'), err = document.getElementById('err');
  var q = new URLSearchParams(location.search);
  var source = q.get('src') || q.get('utm_source') || '';
  var started = false;
  async function fetchClientSecret() {
    var r = await fetch('/api/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: ${JSON.stringify(ev.id)}, city: ${JSON.stringify(city.id)}, source: source }) });
    var j = await r.json().catch(function () { return {}; });
    if (!r.ok || !j.clientSecret) throw new Error(j.error || 'Checkout is having trouble right now.');
    return j.clientSecret;
  }
  async function start() {
    if (started) return; started = true;
    go.disabled = true; go.textContent = 'Loading secure checkout…'; err.textContent = '';
    try {
      var stripe = Stripe(${JSON.stringify(pk)});
      var make = stripe.createEmbeddedCheckoutPage ? stripe.createEmbeddedCheckoutPage.bind(stripe) : stripe.initEmbeddedCheckout.bind(stripe);
      var checkout = await make({ fetchClientSecret: fetchClientSecret });
      box.classList.add('on');
      checkout.mount('#checkout');
      go.style.display = 'none';
      box.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (e) {
      started = false; go.disabled = false; go.textContent = 'Get my passport · ${money(ev.priceCents)}';
      err.textContent = (e && e.message) || 'Something went wrong. Please try again.';
    }
  }
  go.addEventListener('click', start);
  document.querySelectorAll('a[href="#buy"]').forEach(function (a) { a.addEventListener('click', function () { setTimeout(start, 250); }); });
})();
</script>` : '';
  return shell({
    title: `${ev.name} ${city.name} · BiteBook passport`,
    desc: `Get your ${ev.name} passport for ${city.area}: a ${ev.food} deal at local restaurants, ${ev.datesLabel}. ${money(ev.priceCents)}.`,
    ev,
    body: `<section class="hero"><div class="wrap">
  <div class="eyebrow">BITEBOOK PRESENTS</div>
  <h1>${esc(ev.coverWords.join(' '))}</h1>
  <div class="city">${esc(city.name)}</div>
  <div class="dates">${esc(ev.datesLabel.toUpperCase())}</div>
  <p class="lede">One passport gets you an exclusive ${esc(ev.food)} deal at local restaurants across ${esc(city.area)}, one time each. Discover new favorite spots and support local kitchens.</p>
  <div class="price">${money(ev.priceCents)} PER PASSPORT</div>
  <a class="btn" href="#buy">Get my passport →</a>
</div></section>
<main><div class="wrap">
  <h2>How it works</h2>
  <ul class="steps">
    <li><span class="n">1</span><div><b>Get your passport</b>Buy one for yourself or a few for friends. Each passport has its own coupons.</div></li>
    <li><span class="n">2</span><div><b>It lands in your inbox</b>Your passport arrives by email when ${esc(ev.name)} kicks off on ${esc(ev.startLabel)}, with every restaurant and its deal.</div></li>
    <li><span class="n">3</span><div><b>Eat local</b>Show your server the QR code for that restaurant. They scan it, and you enjoy the deal. One use per restaurant.</div></li>
  </ul>
  <section id="buy">
    <h2>Get your passport</h2>
    <p class="note">We're adding restaurants all the time, and your passport always shows the latest lineup. Be a good BiteBooker: tip on the full value, and remember add-ons and tax are extra.</p>
    ${buy}
  </section>
  ${others ? `<p class="others">Not in ${esc(city.name)}? ${others}</p>` : ''}
</div></main>`,
    scripts,
  });
}

function thanksPage(ev, s) {
  const paid = s && s.status === 'complete';
  if (!paid) {
    const city = s?.metadata?.city && CITIES[s.metadata.city];
    return shell({
      title: `Payment not finished · BiteBook`, desc: '', ev,
      body: `<main><div class="wrap"><h2>Your payment didn't go through</h2>
  <div class="card">No charge was made. <a href="/${ev.slug}${city ? '/' + city.id : ''}">Try again</a>, or email info@getbitebook.com and we'll help.</div></div></main>`,
    });
  }
  const city = CITIES[s.metadata?.city] || null;
  const qty = Number(s._quantity || 0) || 1;
  const email = s.customer_details?.email || '';
  return shell({
    title: `You're in! · ${ev.name}`, desc: '', ev,
    body: `<section class="hero"><div class="wrap">
  <div class="eyebrow">ORDER CONFIRMED</div>
  <h1>YOU'RE IN, ${esc(firstName(s.customer_details?.name).toUpperCase())}!</h1>
  <div class="dates">${esc(ev.name.toUpperCase())}${city ? ' · ' + esc(city.name.toUpperCase()) : ''}</div>
</div></section>
<main><div class="wrap">
  <div class="card">
    <p style="margin-top:0"><b>Thanks for supporting local restaurants.</b> We sent a receipt${email ? ` to <b>${esc(email)}</b>` : ''}.</p>
    <p>Your ${qty > 1 ? `${qty} passports` : 'passport'} will arrive at that address when ${esc(ev.name)} kicks off on <b>${esc(ev.startLabel)}</b>, with every restaurant and its deal. Coupons work ${esc(ev.datesLabel)}.</p>
    <p style="margin-bottom:0">Questions? Email <a href="mailto:info@getbitebook.com">info@getbitebook.com</a>.</p>
  </div>
  ${city ? `<p class="others">Know someone who'd love this? Send them to <a href="/${ev.slug}/${city.id}">getbitebook.com/${ev.slug}/${city.id}</a></p>` : ''}
</div></main>`,
  });
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  const ev = Object.values(EVENTS).find((e) => e.slug && e.slug === String(req.query.event || ''));
  if (!ev || !ev.onSale) return res.status(404).send('Not found');
  const cityId = String(req.query.city || '').toLowerCase();

  if (cityId === 'thanks') {
    res.setHeader('Cache-Control', 'no-store');
    let s = null;
    try {
      if (req.query.session_id) {
        s = await getCheckoutSession(String(req.query.session_id));
        const items = await getSessionLineItems(s.id);
        s._quantity = (items.data || []).reduce((n, li) => n + Number(li.quantity || 0), 0);
      }
    } catch { s = s || null; }
    return res.status(200).send(thanksPage(ev, s));
  }
  res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=60');
  if (!cityId) return res.status(200).send(pickerPage(ev));
  if (!ev.cities.includes(cityId)) return res.status(404).send(pickerPage(ev));
  return res.status(200).send(cityPage(ev, CITIES[cityId]));
}
