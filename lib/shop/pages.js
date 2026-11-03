// Passport sales pages with Stripe checkout built in:
//   /wings             pick a city
//   /wings/<city>      event page + inline checkout
//   /wings/thanks      after payment (?session_id=...)
//   /terms             passport terms (linked from checkout)
import { EVENTS, CITIES, eventWindow, SUPPORT_EMAIL } from '../config.js';
import { esc } from '../html.js';
import { getCheckoutSession, getSessionLineItems } from '../stripe.js';
import { restaurantsFor } from '../restaurants.js';

const WWW = 'https://www.getbitebook.com';
const money = (cents) => `$${(Number(cents || 0) / 100).toFixed(Number(cents) % 100 ? 2 : 0)}`;
const firstName = (n) => String(n || '').trim().split(/\s+/)[0] || 'friend';
const mapLink = (r) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${r.name} ${r.address}`)}`;

function shell({ title, desc, ev, body, scripts = '', head = '', url = '' }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
${url ? `<meta property="og:url" content="${esc(url)}"><link rel="canonical" href="${esc(url)}">` : ''}
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,700;12..96,800&family=Space+Mono:wght@400;700&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
${head}
<style>
  :root { --ink:#1F1A15; --paper:#FBF4E4; --stub:#FFFDF7; --mustard:#F2B33D; --red:#C8371D; --muted:#5E5246; --green:#1F6B3A; }
  * { box-sizing:border-box; }
  html { scroll-behavior:smooth; }
  body { margin:0; background:var(--paper); color:var(--ink); font-family:Inter, system-ui, sans-serif; }
  a { color:var(--red); }
  .bar { background:var(--ink); color:var(--paper); padding:14px 16px; display:flex; justify-content:space-between; align-items:center; }
  .bar a { color:var(--paper); text-decoration:none; font-family:'Bricolage Grotesque', sans-serif; font-weight:800; font-size:22px; }
  .bar span { font-family:'Space Mono', monospace; font-size:12px; letter-spacing:2px; color:var(--mustard); }
  .hero { background:var(--ink); color:var(--paper); padding:24px 16px 34px; border-bottom:4px solid var(--mustard); }
  .wrap { max-width:760px; margin:0 auto; }
  .eyebrow { font-family:'Space Mono', monospace; font-size:13px; letter-spacing:3px; color:var(--mustard); }
  h1 { font-family:'Bricolage Grotesque', sans-serif; font-weight:800; font-size:clamp(52px, 15vw, 116px); line-height:.86; letter-spacing:-2px; margin:16px 0 14px; }
  .city { font-family:'Bricolage Grotesque', sans-serif; font-weight:800; font-size:clamp(28px, 8vw, 50px); line-height:1; margin:0 0 8px; }
  .dates { font-family:'Bricolage Grotesque', sans-serif; font-weight:800; font-size:clamp(20px, 5.5vw, 32px); color:var(--mustard); }
  .countdown { display:inline-block; margin-top:14px; font-family:'Space Mono', monospace; font-weight:700; font-size:13px; letter-spacing:1.5px; background:var(--red); color:#fff; border:2px solid var(--paper); border-radius:999px; padding:6px 14px; }
  .lede { font-size:18px; line-height:1.5; margin:16px 0 18px; max-width:600px; }
  .gift { font-size:15px; color:var(--mustard); margin:0 0 20px; }
  .btn { display:flex; align-items:center; justify-content:center; width:100%; max-width:420px; min-height:62px; padding:14px 22px; background:var(--red); color:#fff; border:2px solid var(--ink); border-radius:14px; font-family:'Bricolage Grotesque', sans-serif; font-weight:800; font-size:22px; text-decoration:none; box-shadow:0 5px 0 var(--mustard); cursor:pointer; }
  .hero .btn { border-color:var(--mustard); }
  main { padding:28px 16px 48px; }
  section { margin:0 0 34px; scroll-margin-top:12px; }
  h2 { font-family:'Bricolage Grotesque', sans-serif; font-weight:800; font-size:34px; line-height:1.05; margin:0 0 14px; }
  .chips { display:flex; flex-wrap:wrap; gap:8px; margin:0; padding:0; list-style:none; }
  .chips li { background:var(--stub); border:2px solid var(--ink); border-radius:999px; padding:8px 14px; font-weight:600; font-size:15px; }
  .value { background:var(--mustard); border:2px solid var(--ink); border-radius:14px; padding:14px 16px; font-family:'Bricolage Grotesque', sans-serif; font-weight:800; font-size:24px; margin-top:12px; }
  .buybox { background:var(--stub); border:3px solid var(--ink); border-radius:16px; padding:18px; box-shadow:0 6px 0 var(--ink); }
  .pricerow { display:flex; justify-content:space-between; align-items:baseline; gap:12px; flex-wrap:wrap; }
  .price { font-family:'Bricolage Grotesque', sans-serif; font-weight:800; font-size:40px; }
  .price small { font-family:Inter, sans-serif; font-weight:500; font-size:15px; color:var(--muted); }
  .promise { display:flex; gap:10px; align-items:flex-start; background:#EAF3EC; border:2px solid var(--green); border-radius:12px; padding:10px 12px; margin:12px 0; font-size:15px; line-height:1.4; }
  .promise b { color:var(--green); }
  .secure { display:flex; flex-wrap:wrap; gap:6px 12px; align-items:center; font-size:13px; color:var(--muted); margin:10px 0 0; }
  .secure .pill { border:1.5px solid #cbbd9f; border-radius:6px; padding:2px 7px; font-family:'Space Mono', monospace; font-size:11px; letter-spacing:.5px; color:var(--ink); background:#fff; }
  #checkout { margin-top:14px; min-height:420px; background:#fff; border:2px solid var(--ink); border-radius:14px; overflow:hidden; }
  #checkout .loading { padding:40px 16px; text-align:center; color:var(--muted); font-family:'Space Mono', monospace; font-size:13px; }
  .err { color:var(--red); font-weight:600; margin-top:12px; }
  .steps { display:grid; gap:12px; margin:0; padding:0; list-style:none; }
  .steps li { display:flex; gap:14px; background:var(--stub); border:2px solid var(--ink); border-radius:14px; padding:14px 16px; line-height:1.45; }
  .steps .n { flex-shrink:0; width:38px; height:38px; border-radius:999px; background:var(--mustard); border:2px solid var(--ink); display:flex; align-items:center; justify-content:center; font-family:'Space Mono', monospace; font-weight:700; }
  .steps b { display:block; font-family:'Bricolage Grotesque', sans-serif; font-size:19px; }
  .spots { display:grid; gap:12px; }
  .spot { background:var(--stub); border:2px solid var(--ink); border-radius:14px; padding:14px 16px; }
  .spot h3 { font-family:'Bricolage Grotesque', sans-serif; font-weight:800; font-size:21px; margin:0 0 4px; }
  .spot .deal { font-family:'Space Mono', monospace; font-weight:700; font-size:13px; color:var(--red); margin:6px 0; }
  .spot .addr { font-size:14px; color:var(--muted); }
  #map { height:340px; border:2px solid var(--ink); border-radius:14px; margin-top:14px; }
  .soon { background:var(--stub); border:2px dashed var(--ink); border-radius:14px; padding:18px; line-height:1.5; }
  .notify { display:flex; gap:8px; flex-wrap:wrap; margin-top:12px; }
  .notify input { flex:1 1 220px; min-height:50px; border:2px solid var(--ink); border-radius:12px; padding:0 14px; font-size:16px; font-family:Inter, sans-serif; }
  .notify button { min-height:50px; padding:0 18px; border:2px solid var(--ink); border-radius:12px; background:var(--ink); color:var(--paper); font-weight:700; font-size:16px; cursor:pointer; }
  .gallery { display:grid; grid-template-columns:repeat(auto-fill, minmax(150px, 1fr)); gap:10px; }
  .gallery img { width:100%; aspect-ratio:1; object-fit:cover; border:2px solid var(--ink); border-radius:12px; display:block; }
  details { background:var(--stub); border:2px solid var(--ink); border-radius:12px; padding:0 16px; margin-bottom:10px; }
  summary { cursor:pointer; padding:14px 0; font-weight:700; font-size:16px; list-style:none; }
  summary::-webkit-details-marker { display:none; }
  summary::after { content:'+'; float:right; font-family:'Space Mono', monospace; }
  details[open] summary::after { content:'–'; }
  details p { margin:0 0 14px; line-height:1.55; }
  .note { font-size:15px; line-height:1.5; color:var(--muted); }
  .cities { display:grid; gap:12px; }
  .cities a { display:flex; justify-content:space-between; align-items:center; background:var(--stub); border:2px solid var(--ink); border-radius:14px; padding:18px; color:var(--ink); text-decoration:none; font-family:'Bricolage Grotesque', sans-serif; font-weight:800; font-size:28px; box-shadow:0 4px 0 var(--ink); }
  .cities a span { font-family:'Space Mono', monospace; font-size:13px; letter-spacing:1.5px; color:var(--red); }
  .card { background:var(--stub); border:2px solid var(--ink); border-radius:14px; padding:18px; line-height:1.5; }
  .share { display:grid; grid-template-columns:repeat(auto-fit, minmax(150px, 1fr)); gap:10px; margin-top:12px; }
  .share a, .share button { display:flex; align-items:center; justify-content:center; min-height:52px; border:2px solid var(--ink); border-radius:12px; background:var(--stub); color:var(--ink); font-weight:700; font-size:16px; text-decoration:none; cursor:pointer; font-family:Inter, sans-serif; }
  .share .main { background:var(--red); color:#fff; }
  .others { margin-top:6px; font-size:15px; }
  .sticky { position:fixed; left:0; right:0; bottom:0; padding:10px 16px calc(10px + env(safe-area-inset-bottom)); background:var(--ink); display:none; z-index:20; }
  .sticky a { display:flex; justify-content:center; align-items:center; min-height:52px; background:var(--red); color:#fff; border:2px solid var(--mustard); border-radius:12px; font-family:'Bricolage Grotesque', sans-serif; font-weight:800; font-size:20px; text-decoration:none; }
  @media (max-width: 760px) { .sticky.on { display:block; } body.has-sticky { padding-bottom:78px; } }
  footer { text-align:center; padding:22px 16px 34px; font-size:14px; color:var(--muted); line-height:1.6; }
  footer a { color:var(--muted); }
</style>
</head>
<body>
<div class="bar"><a href="/">BiteBook</a><span>${esc(ev.name.toUpperCase())}</span></div>
${body}
<footer>Questions? <a href="mailto:${esc(SUPPORT_EMAIL)}">${esc(SUPPORT_EMAIL)}</a> · we reply fast<br><a href="/terms">Passport terms</a> · getbitebook.com</footer>
${scripts}
</body>
</html>`;
}

function pickerPage(ev) {
  const links = ev.cities.map((id) => CITIES[id]).map((c) => `<a href="/${ev.slug}/${c.id}">${esc(c.name)} <span>GET PASSPORT →</span></a>`).join('');
  return shell({
    title: `${ev.name} · BiteBook`,
    desc: `${ev.name}: one passport, a ${ev.food} deal at local restaurants near you. ${ev.datesLabel}.`,
    ev, url: `${WWW}/${ev.slug}`,
    body: `<section class="hero"><div class="wrap">
  <div class="eyebrow">BITEBOOK PRESENTS</div>
  <h1>${esc(ev.coverWords.join(' '))}</h1>
  <div class="dates">${esc(ev.datesLabel.toUpperCase())}</div>
  <p class="lede">One passport. A ${esc(ev.food)} deal at local restaurants all over your area. Pick your city to get yours.</p>
</div></section>
<main><div class="wrap"><div class="cities">${links}</div></div></main>`,
  });
}

function faqItems(ev, city) {
  const items = [
    ['How does it work?', `Buy a passport and it arrives by email. Each participating restaurant has its own coupon page with a QR code. Tell your server you have a BiteBook coupon, show them the code, and they scan it to redeem your ${ev.food} deal. Each coupon works once.`],
    ['When do I get my passport?', `You'll get a confirmation email right away, and your passport arrives by email when ${ev.name} kicks off on ${ev.startLabel}. Coupons work ${ev.datesLabel}.`],
    ['Which restaurants are included?', `Local spots across ${city.area}. We're adding restaurants all the time, and your passport always shows the latest lineup, so anything added after you buy shows up automatically.`],
    ['Can I share my passport?', 'Yes, you can share it, but each coupon in the passport can only be used one time. Want everyone to get every deal? Pick a higher quantity at checkout: each passport gets its own set of coupons, and you can forward them to friends.'],
    ['Can I give it as a gift?', `Yes! Buy as many as you like, then forward a passport email to each person when it arrives on ${ev.startLabel}.`],
    ['Do I need to print anything?', 'No. Just open your passport on your phone and show the QR code. You can also print the PDF if you prefer.'],
    ['Is there any catch?', 'Each deal is listed exactly as the restaurant offers it, and many are "with the purchase of" another item. Add-ons, upgrades and tax are extra. Please tip on the full value; great guests keep the deals coming.'],
    ['What if a restaurant won’t take my coupon?', `Let us know at ${SUPPORT_EMAIL} with the restaurant and what happened, and we'll make it right.`],
    ['What if I change my mind?', `No problem. If you're not happy, email ${SUPPORT_EMAIL} and we'll refund you in full.`],
    ['How do I contact you?', `Email ${SUPPORT_EMAIL} or just reply to any BiteBook email. A real person answers.`],
  ];
  return items.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('');
}

function cityPage(ev, city) {
  const pk = process.env.STRIPE_PUBLISHABLE_KEY || '';
  const price = money(ev.priceCents);
  const startIso = eventWindow(city.id, ev.id).start.toISOString();
  const endIso = eventWindow(city.id, ev.id).end.toISOString();
  const spots = restaurantsFor(city.id, ev.id);
  const mapped = spots.filter((r) => Number.isFinite(r.lat) && Number.isFinite(r.lng));
  const value = ev.valueByCity?.[city.id];
  const others = ev.cities.filter((id) => id !== city.id).map((id) => `<a href="/${ev.slug}/${id}">${esc(CITIES[id].name)}</a>`).join(' · ');

  const lineup = spots.length
    ? `<div class="spots">${spots.map((r) => `<div class="spot"><h3>${esc(r.name)}</h3>
        <div class="deal">${esc(r.short || r.deal)}</div>
        <div class="addr">${esc(r.address)} · <a href="${mapLink(r)}" target="_blank" rel="noopener">Map</a></div></div>`).join('')}</div>
       <p class="note">More restaurants are being added. Your passport updates automatically.</p>
       ${mapped.length ? '<div id="map" aria-label="Map of participating restaurants"></div>' : ''}`
    : `<div class="soon"><b>Restaurants are being announced now.</b> We're signing up local favorites across ${esc(city.area)}, and every spot added shows up in your passport automatically.
        <form class="notify" id="notify"><input type="email" name="email" required placeholder="Your email" aria-label="Your email"><button type="submit">Tell me when they're announced</button></form>
        <div id="notifyMsg" class="note" role="status"></div></div>`;

  const buy = pk
    ? `<div id="checkout"><div class="loading">Loading secure checkout…</div></div><div id="err" class="err" role="alert"></div>`
    : `<div class="card"><b>Passports go on sale very soon.</b> Check back shortly!</div>`;

  const head = mapped.length ? '<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css">' : '';
  const scripts = `${pk ? '<script src="https://js.stripe.com/v3/"></script>' : ''}
${mapped.length ? '<script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js"></script>' : ''}
<script>
(function () {
  var q = new URLSearchParams(location.search);
  var source = q.get('src') || q.get('utm_source') || '';
  var start = new Date(${JSON.stringify(startIso)}), end = new Date(${JSON.stringify(endIso)});
  // Countdown
  var cd = document.getElementById('countdown');
  if (cd) {
    var now = new Date(), days = Math.ceil((start - now) / 864e5);
    if (now >= end) cd.textContent = 'THIS EVENT HAS ENDED';
    else if (now >= start) cd.textContent = 'HAPPENING NOW · ENDS ${esc(ev.endLabel.toUpperCase())}';
    else cd.textContent = days <= 1 ? 'KICKS OFF TOMORROW' : 'KICKS OFF IN ' + days + ' DAYS';
  }
  // Sticky "get my passport" bar on phones, hidden while the checkout is on screen
  var sticky = document.getElementById('sticky'), buy = document.getElementById('buy');
  if (sticky && buy && 'IntersectionObserver' in window) {
    document.body.classList.add('has-sticky');
    new IntersectionObserver(function (es) { sticky.classList.toggle('on', !es[0].isIntersecting); }, { rootMargin: '0px 0px -40% 0px' }).observe(buy);
  }
  // "Tell me when restaurants are announced"
  var nf = document.getElementById('notify');
  if (nf) nf.addEventListener('submit', async function (e) {
    e.preventDefault();
    var msg = document.getElementById('notifyMsg'), btn = nf.querySelector('button');
    btn.disabled = true;
    try {
      var r = await fetch('/api/notify', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: nf.email.value, event: ${JSON.stringify(ev.id)}, city: ${JSON.stringify(city.id)}, source: source }) });
      if (!r.ok) throw new Error();
      nf.style.display = 'none'; msg.textContent = "You're on the list! We'll email you as restaurants are announced.";
    } catch (_) { btn.disabled = false; msg.textContent = 'That didn’t go through. Please try again.'; }
  });
${mapped.length ? `  // Map of participating restaurants
  try {
    var pts = ${JSON.stringify(mapped.map((r) => ({ n: r.name, d: r.short || r.deal, a: r.address, lat: r.lat, lng: r.lng })))};
    var m = L.map('map', { scrollWheelZoom: false });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '&copy; OpenStreetMap contributors' }).addTo(m);
    var b = [];
    pts.forEach(function (p) {
      var t = document.createElement('div'); var h = document.createElement('b'); h.textContent = p.n; t.appendChild(h);
      t.appendChild(document.createElement('br')); t.appendChild(document.createTextNode(p.d));
      L.marker([p.lat, p.lng]).addTo(m).bindPopup(t); b.push([p.lat, p.lng]);
    });
    m.fitBounds(b, { padding: [30, 30], maxZoom: 13 });
  } catch (_) {}
` : ''}${pk ? `  // Stripe checkout, shown right on the page (loads when the buy section comes near the screen)
  var box = document.getElementById('checkout'), err = document.getElementById('err'), started = false;
  async function fetchClientSecret() {
    var r = await fetch('/api/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: ${JSON.stringify(ev.id)}, city: ${JSON.stringify(city.id)}, source: source }) });
    var j = await r.json().catch(function () { return {}; });
    if (!r.ok || !j.clientSecret) throw new Error(j.error || 'Checkout is having trouble right now.');
    return j.clientSecret;
  }
  async function load() {
    if (started) return; started = true;
    try {
      var stripe = Stripe(${JSON.stringify(pk)});
      var make = stripe.createEmbeddedCheckoutPage ? stripe.createEmbeddedCheckoutPage.bind(stripe) : stripe.initEmbeddedCheckout.bind(stripe);
      var checkout = await make({ fetchClientSecret: fetchClientSecret });
      box.innerHTML = '';
      checkout.mount('#checkout');
    } catch (e) {
      started = false;
      box.innerHTML = '<div class="loading">Checkout didn’t load. <a href="#" id="retry">Try again</a></div>';
      err.textContent = (e && e.message) || '';
      document.getElementById('retry').onclick = function (ev) { ev.preventDefault(); load(); };
    }
  }
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (es) { if (es[0].isIntersecting) { io.disconnect(); load(); } }, { rootMargin: '600px 0px' });
    io.observe(box);
  } else load();
` : ''}})();
</script>`;

  return shell({
    title: `${ev.name} ${city.name} · BiteBook passport`,
    desc: `Get your ${ev.name} passport for ${city.area}: a ${ev.food} deal at local restaurants, ${ev.datesLabel}. ${price}.`,
    ev, head, url: `${WWW}/${ev.slug}/${city.id}`,
    body: `<section class="hero" style="margin:0"><div class="wrap">
  <div class="eyebrow">BITEBOOK PRESENTS</div>
  <h1>${esc(ev.coverWords.join(' '))}</h1>
  <div class="city">${esc(city.name)}</div>
  <div class="dates">${esc(ev.datesLabel.toUpperCase())}</div>
  <div class="countdown" id="countdown">KICKS OFF ${esc(ev.startShort.toUpperCase())}</div>
  <p class="lede">One passport gets you an exclusive ${esc(ev.food)} deal at local restaurants across ${esc(city.area)}. Discover new favorite spots and support local kitchens.</p>
  ${ev.giftLine ? `<p class="gift">🎁 ${esc(ev.giftLine)}</p>` : ''}
  <a class="btn" href="#buy">Get my passport · ${price}</a>
</div></section>
<main><div class="wrap">
  <section>
    <ul class="chips">
      <li>Shareable passport</li><li>A ${esc(ev.food)} deal at every spot</li><li>Valid ${esc(ev.datesLabel)}</li><li>Delivered by email</li>
    </ul>
    ${value ? `<div class="value">Over ${esc(value)} in ${esc(ev.food)} deals for just ${price}</div>` : ''}
  </section>

  <section id="buy">
    <div class="buybox">
      <div class="pricerow"><div class="price">${price} <small>per passport</small></div><div class="note">Buying for friends? Change the quantity below.</div></div>
      <div class="promise"><span aria-hidden="true">✓</span><div><b>Our promise:</b> not happy for any reason? Email us and we'll refund you in full. No hassle.</div></div>
      ${buy}
      <div class="secure"><span>🔒 Secure checkout powered by Stripe</span><span class="pill">Apple Pay</span><span class="pill">Google Pay</span><span class="pill">Visa · Mastercard · Amex</span></div>
    </div>
  </section>

  <section>
    <h2>How it works</h2>
    <ul class="steps">
      <li><span class="n">1</span><div><b>Get your passport</b>Buy one for yourself or a few for friends. Each passport has its own coupons.</div></li>
      <li><span class="n">2</span><div><b>It lands in your inbox</b>You'll get a confirmation now, and your passport arrives when ${esc(ev.name)} kicks off on ${esc(ev.startLabel)}, with every restaurant and its deal.</div></li>
      <li><span class="n">3</span><div><b>Eat local</b>Tell your server you have a BiteBook coupon and show the QR code. They scan it, and you enjoy the deal. One use per restaurant.</div></li>
    </ul>
  </section>

  <section>
    <h2>The lineup</h2>
    ${lineup}
  </section>

  ${(ev.photos || []).length ? `<section><h2>A taste of what's coming</h2><div class="gallery">${ev.photos.map((p) => `<img src="${esc(p.src)}" alt="${esc(p.alt || '')}" loading="lazy">`).join('')}</div></section>` : ''}

  <section>
    <h2>Questions</h2>
    ${faqItems(ev, city)}
  </section>

  ${others ? `<p class="others">Not in ${esc(city.name)}? ${others}</p>` : ''}
</div></main>
<div class="sticky" id="sticky"><a href="#buy">Get my passport · ${price}</a></div>`,
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
  <div class="card">No charge was made. <a href="/${ev.slug}${city ? '/' + city.id : ''}">Try again</a>, or email ${esc(SUPPORT_EMAIL)} and we'll help.</div></div></main>`,
    });
  }
  const city = CITIES[s.metadata?.city] || null;
  const qty = Number(s._quantity || 0) || 1;
  const email = s.customer_details?.email || '';
  const pageUrl = city ? `${WWW}/${ev.slug}/${city.id}?src=share` : `${WWW}/${ev.slug}?src=share`;
  const shareText = `I just got my BiteBook ${ev.name} passport${city ? ` for ${city.name}` : ''}: ${ev.food} deals at local spots, ${ev.datesLabel}. Want to come?`;
  return shell({
    title: `You're in! · ${ev.name}`, desc: '', ev,
    body: `<section class="hero"><div class="wrap">
  <div class="eyebrow">ORDER CONFIRMED</div>
  <h1>YOU'RE IN, ${esc(firstName(s.customer_details?.name).toUpperCase())}!</h1>
  <div class="dates">${esc(ev.name.toUpperCase())}${city ? ' · ' + esc(city.name.toUpperCase()) : ''}</div>
</div></section>
<main><div class="wrap">
  <section><div class="card">
    <p style="margin-top:0"><b>Thanks for supporting local restaurants.</b> We sent a confirmation${email ? ` to <b>${esc(email)}</b>` : ''}.</p>
    <p>Your ${qty > 1 ? `${qty} passports` : 'passport'} will arrive at that address when ${esc(ev.name)} kicks off on <b>${esc(ev.startLabel)}</b>, with every restaurant and its deal. Coupons work ${esc(ev.datesLabel)}.</p>
    <p style="margin-bottom:0">Questions? Email <a href="mailto:${esc(SUPPORT_EMAIL)}">${esc(SUPPORT_EMAIL)}</a>.</p>
  </div></section>
  <section>
    <h2>Bring a friend</h2>
    <p class="note">${esc(ev.name)} is better with company. Send them the link:</p>
    <div class="share">
      <button class="main" type="button" id="shareBtn">Share</button>
      <a href="sms:?&body=${encodeURIComponent(`${shareText} ${pageUrl}`)}">Text a friend</a>
      <a href="https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(pageUrl)}" target="_blank" rel="noopener">Facebook</a>
      <button type="button" id="copyBtn">Copy link</button>
    </div>
  </section>
  ${city?.instagram ? `<section><div class="card">📸 <b>Follow <a href="https://www.instagram.com/${esc(city.instagram)}/" target="_blank" rel="noopener">@${esc(city.instagram)}</a></b> for restaurant reveals before ${esc(ev.name)} kicks off.</div></section>` : ''}
</div></main>`,
    scripts: `<script>
(function () {
  var url = ${JSON.stringify(pageUrl)}, text = ${JSON.stringify(shareText)};
  var sb = document.getElementById('shareBtn'), cb = document.getElementById('copyBtn');
  sb.onclick = function () {
    if (navigator.share) navigator.share({ title: 'BiteBook', text: text, url: url }).catch(function () {});
    else cb.click();
  };
  cb.onclick = function () {
    (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(function () { cb.textContent = 'Link copied!'; }, function () { prompt('Copy this link:', url); });
  };
})();
</script>`,
  });
}

function termsPage() {
  const ev = EVENTS.wings;
  const items = [
    ['What you’re buying', 'A BiteBook passport is a digital coupon book for one event in one city. It contains one coupon for each participating restaurant, and each coupon can be redeemed once during the event dates printed on the passport.'],
    ['Delivery', 'Passports are delivered by email to the address entered at checkout, by the time the event starts. Keep that email; it is your passport.'],
    ['Using your coupons', 'Show the coupon’s QR code to restaurant staff, who scan and redeem it. Coupons are valid only at the listed restaurant location, only during the event dates, and only for the deal as described, including any conditions the restaurant set (for example, dine-in only, specific days or hours, limits per group, or a required purchase). Add-ons, upgrades, tax and gratuity are not included. Coupons have no cash value and can’t be combined with other offers unless the restaurant allows it.'],
    ['Lineup changes', 'We add restaurants throughout the event, and they appear in your passport automatically. Occasionally a restaurant may change its deal or leave the event; if that happens, contact us and we’ll make it right.'],
    ['Sharing', 'You can share your passport with friends and family, but each coupon in it can be used only one time. Buying several? Each passport has its own set of coupons and can be forwarded to a friend. Passports may not be resold.'],
    ['Refunds', `Not happy for any reason? Email ${SUPPORT_EMAIL} and we’ll refund your purchase in full. Refunded passports are cancelled and their coupons stop working.`],
    ['If a restaurant won’t honor a coupon', `Please don’t argue with the staff. Email ${SUPPORT_EMAIL} with the restaurant and what happened, and we’ll sort it out.`],
    ['Misuse', 'We may cancel passports or coupons that are copied, resold, or used in ways that break these terms.'],
    ['Your information', 'We use your name, email and phone number to deliver your passport and support you. If you opt in, we’ll also send you news about future BiteBook events; you can unsubscribe anytime.'],
    ['Contact', `BiteBook · ${SUPPORT_EMAIL} · getbitebook.com`],
  ];
  return shell({
    title: 'Passport terms · BiteBook', desc: 'Terms for BiteBook passports.', ev, url: `${WWW}/terms`,
    body: `<main><div class="wrap"><h2>Passport terms</h2>
  <p class="note">The short version: share it if you like, each coupon works one time, deals as listed by each restaurant, and a full refund if you're not happy.</p>
  ${items.map(([h, t]) => `<div class="card" style="margin-bottom:10px"><b>${esc(h)}</b><br>${esc(t)}</div>`).join('')}
</div></main>`,
  });
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  if (req.query.page === 'terms') {
    res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=300');
    return res.status(200).send(termsPage());
  }
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
