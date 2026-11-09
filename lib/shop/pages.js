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
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400;12..96,600;12..96,700;12..96,800&family=Space+Mono:wght@400;700&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<script src="/meta-pixel.js"></script>
${head}
<style>
  /* Matches the getbitebook.com homepage design system */
  :root{ --ink:#1c140f; --ink-soft:#3a2c22; --paper:#f8efdd; --paper-2:#f1e4c9; --gold:#f2ac1d; --tomato:#e0442a; --teal:#127e73; --line:rgba(28,20,15,.14); }
  *{box-sizing:border-box;margin:0;padding:0}
  html{scroll-behavior:smooth}
  body{font-family:'Inter',system-ui,sans-serif;background:var(--paper);color:var(--ink);line-height:1.55;-webkit-font-smoothing:antialiased;overflow-x:hidden}
  a{color:inherit}
  .wrap{max-width:1140px;margin:0 auto;padding:0 24px}
  .narrow{max-width:760px}
  .display{font-family:'Bricolage Grotesque',sans-serif;line-height:.98;letter-spacing:-.02em}
  .mono{font-family:'Space Mono',monospace}
  /* nav (same as homepage) */
  nav{position:sticky;top:0;z-index:50;background:var(--paper);border-bottom:2.5px solid var(--ink)}
  .nav-in{display:flex;align-items:center;justify-content:space-between;padding:16px 24px;max-width:1140px;margin:0 auto}
  .brand{font-family:'Bricolage Grotesque',sans-serif;font-weight:800;font-size:1.45rem;letter-spacing:-.03em;display:flex;align-items:center;gap:9px;text-decoration:none}
  .brand .dot{width:15px;height:15px;background:var(--tomato);border-radius:50%;border:2.5px solid var(--ink);flex:none}
  .nav-links{display:flex;align-items:center;gap:24px;margin-left:32px}
  .nav-link{font-family:'Bricolage Grotesque',sans-serif;font-weight:700;font-size:.95rem;text-decoration:none;color:var(--ink);background:none;border:none;cursor:pointer;display:flex;align-items:center;gap:5px;padding:0}
  .nav-dropdown{position:relative}
  .caret{font-size:.7rem;transition:transform .15s ease}
  .nav-dropdown.open .caret{transform:rotate(180deg)}
  .dropdown-menu{display:none;position:absolute;top:calc(100% + 14px);left:0;background:var(--paper);border:2.5px solid var(--ink);box-shadow:6px 6px 0 rgba(28,20,15,1);min-width:160px;z-index:60}
  .nav-dropdown.open .dropdown-menu{display:block}
  .dropdown-menu a{display:block;padding:12px 16px;font-family:'Space Mono',monospace;font-size:.85rem;text-decoration:none;color:var(--ink);border-bottom:1.5px solid var(--line)}
  .dropdown-menu a:last-child{border-bottom:none}
  .dropdown-menu a:hover{background:var(--paper-2)}
  .event-pill{font-family:'Space Mono',monospace;font-size:.72rem;letter-spacing:.08em;text-transform:uppercase;border:2px solid var(--ink);border-radius:40px;padding:6px 14px;background:var(--gold)}
  @media(max-width:700px){.nav-links{margin-left:14px;gap:14px}.nav-link{font-size:.85rem}.event-pill{display:none}}
  /* hero */
  .hero{padding:56px 0 34px}
  .eyebrow{font-family:'Space Mono',monospace;font-size:.78rem;letter-spacing:.16em;text-transform:uppercase;color:var(--teal);font-weight:700;margin-bottom:18px}
  h1{font-family:'Bricolage Grotesque',sans-serif;font-weight:800;font-size:clamp(3rem,7.2vw,5.6rem);line-height:.98;letter-spacing:-.02em}
  h1 .swap{color:var(--tomato)}
  .dates{font-family:'Space Mono',monospace;font-weight:700;font-size:.95rem;letter-spacing:.06em;text-transform:uppercase;margin-top:18px}
  .countdown{display:inline-block;margin-top:14px;font-family:'Space Mono',monospace;font-weight:700;font-size:.72rem;letter-spacing:.12em;text-transform:uppercase;background:var(--gold);border:2px solid var(--ink);border-radius:40px;padding:6px 14px}
  .lede{font-size:1.16rem;max-width:40ch;margin:22px 0 0;color:var(--ink-soft)}
  .gift{font-size:1rem;margin:14px 0 0;color:var(--ink-soft)}
  .btn{display:flex;align-items:center;justify-content:space-between;gap:10px;font-family:'Bricolage Grotesque',sans-serif;font-weight:700;font-size:1.1rem;border:2.5px solid var(--ink);padding:14px 20px;text-decoration:none;background:var(--tomato);color:var(--paper);cursor:pointer;transition:transform .14s ease, box-shadow .14s ease;box-shadow:5px 5px 0 rgba(28,20,15,1);max-width:380px;margin-top:26px}
  .btn:hover{transform:translate(-2px,-2px);box-shadow:8px 8px 0 rgba(28,20,15,1)}
  .btn .go{font-family:'Space Mono',monospace;font-weight:700}
  main{padding:10px 0 56px}
  section{margin:0 0 46px;scroll-margin-top:90px}
  h2{font-family:'Bricolage Grotesque',sans-serif;font-weight:800;font-size:clamp(1.8rem,4vw,2.7rem);line-height:1;letter-spacing:-.02em;margin-bottom:16px}
  .chips{display:flex;flex-wrap:wrap;gap:8px;list-style:none}
  .chips li{font-family:'Space Mono',monospace;font-size:.72rem;letter-spacing:.08em;text-transform:uppercase;font-weight:700;border:2px solid var(--ink);border-radius:40px;padding:6px 13px;background:var(--paper)}
  .value{background:var(--gold);border:2.5px solid var(--ink);box-shadow:6px 6px 0 rgba(28,20,15,1);padding:16px 18px;font-family:'Bricolage Grotesque',sans-serif;font-weight:800;font-size:1.5rem;margin-top:16px}
  /* buy box = the homepage ticket look */
  .buybox{background:var(--paper);border:2.5px solid var(--ink);box-shadow:10px 10px 0 rgba(28,20,15,1)}
  .buy-top{padding:22px 24px 18px}
  .kicker{font-family:'Space Mono',monospace;font-size:.7rem;letter-spacing:.14em;text-transform:uppercase;color:var(--tomato);font-weight:700}
  .pricerow{display:flex;justify-content:space-between;align-items:baseline;gap:12px;flex-wrap:wrap;margin-top:6px}
  .price{font-family:'Bricolage Grotesque',sans-serif;font-weight:800;font-size:2.6rem;line-height:1;letter-spacing:-.03em}
  .price small{font-family:'Space Mono',monospace;font-weight:400;font-size:.8rem;letter-spacing:.04em;color:var(--ink-soft)}
  .perf{border-top:2.5px dashed var(--ink);position:relative}
  .perf::before,.perf::after{content:"";position:absolute;top:-13px;width:24px;height:24px;background:var(--paper);border:2.5px solid var(--ink);border-radius:50%}
  .perf::before{left:-14px}.perf::after{right:-14px}
  .buy-bot{padding:18px 24px 22px}
  .promise{display:flex;gap:10px;align-items:flex-start;background:var(--teal);color:var(--paper);border:2px solid var(--ink);padding:11px 14px;font-size:.95rem;line-height:1.45}
  .promise b{color:var(--gold)}
  .secure{display:flex;flex-wrap:wrap;gap:6px 12px;align-items:center;font-family:'Space Mono',monospace;font-size:.7rem;letter-spacing:.04em;color:var(--ink-soft);margin-top:14px}
  .secure .pill{border:1.5px solid var(--ink);padding:2px 7px;background:var(--paper-2);color:var(--ink)}
  #checkout{margin-top:16px;min-height:420px;background:#fff;border:2.5px solid var(--ink)}
  #checkout .loading{padding:40px 16px;text-align:center;color:var(--ink-soft);font-family:'Space Mono',monospace;font-size:.8rem}
  .err{color:var(--tomato);font-weight:600;margin-top:12px}
  /* how it works (same as homepage steps) */
  .steps{display:grid;grid-template-columns:repeat(3,1fr);gap:22px;list-style:none}
  .steps li{border-top:3px solid var(--ink);padding-top:16px}
  .steps .n{font-family:'Space Mono',monospace;font-weight:700;font-size:.82rem;letter-spacing:.1em;color:var(--tomato)}
  .steps b{display:block;font-family:'Bricolage Grotesque',sans-serif;font-weight:700;font-size:1.35rem;letter-spacing:-.01em;margin:10px 0 6px}
  .steps span.t{color:var(--ink-soft);font-size:.98rem}
  /* lineup */
  .spots{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:18px}
  .spot{background:var(--paper);border:2.5px solid var(--ink);box-shadow:6px 6px 0 rgba(28,20,15,1);padding:18px}
  .spot h3{font-family:'Bricolage Grotesque',sans-serif;font-weight:800;font-size:1.35rem;line-height:1.05;letter-spacing:-.01em}
  .spot .deal{font-family:'Space Mono',monospace;font-weight:700;font-size:.8rem;color:var(--tomato);margin:8px 0}
  .spot .addr{font-size:.9rem;color:var(--ink-soft)}
  #map{height:360px;border:2.5px solid var(--ink);margin-top:18px}
  .soon{background:var(--teal);color:var(--paper);border:2.5px solid var(--ink);box-shadow:10px 10px 0 rgba(28,20,15,1);padding:26px 24px;line-height:1.55}
  .soon b{font-family:'Bricolage Grotesque',sans-serif;font-size:1.4rem;display:block;margin-bottom:6px}
  .notify{display:flex;gap:10px;flex-wrap:wrap;margin-top:16px}
  .notify input{flex:1 1 220px;font-family:'Inter',sans-serif;font-size:1rem;padding:13px 16px;border:2.5px solid var(--ink);background:var(--paper);color:var(--ink)}
  .notify input:focus{outline:3px solid var(--gold);outline-offset:1px}
  .notify button{font-family:'Bricolage Grotesque',sans-serif;font-weight:700;font-size:1rem;border:2.5px solid var(--ink);padding:13px 18px;background:var(--gold);color:var(--ink);cursor:pointer;box-shadow:5px 5px 0 rgba(28,20,15,1)}
  .soon .note{color:rgba(248,239,221,.9);margin-top:10px}
  .gallery{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:14px}
  .gallery img{width:100%;aspect-ratio:1;object-fit:cover;border:2.5px solid var(--ink);display:block}
  /* FAQ */
  details{border-top:2.5px solid var(--ink)}
  details:last-of-type{border-bottom:2.5px solid var(--ink)}
  summary{cursor:pointer;padding:18px 0;font-family:'Bricolage Grotesque',sans-serif;font-weight:700;font-size:1.15rem;list-style:none}
  summary::-webkit-details-marker{display:none}
  summary::after{content:'+';float:right;font-family:'Space Mono',monospace;color:var(--tomato)}
  details[open] summary::after{content:'–'}
  details p{margin:0 0 18px;color:var(--ink-soft);max-width:65ch}
  .note{font-size:.95rem;color:var(--ink-soft);margin-top:12px}
  .cities{display:flex;flex-direction:column;gap:12px;max-width:420px}
  .cities a{display:flex;align-items:center;justify-content:space-between;font-family:'Bricolage Grotesque',sans-serif;font-weight:700;font-size:1.3rem;border:2.5px solid var(--ink);padding:16px 20px;text-decoration:none;background:var(--tomato);color:var(--paper);box-shadow:5px 5px 0 rgba(28,20,15,1)}
  .cities a span{font-family:'Space Mono',monospace;font-size:.8rem}
  .card{background:var(--paper);border:2.5px solid var(--ink);box-shadow:10px 10px 0 rgba(28,20,15,1);padding:24px;line-height:1.6}
  .card p+p{margin-top:12px}
  .share{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin-top:16px}
  .share a,.share button{display:flex;align-items:center;justify-content:center;font-family:'Bricolage Grotesque',sans-serif;font-weight:700;font-size:1.02rem;border:2.5px solid var(--ink);padding:13px 16px;text-decoration:none;background:var(--gold);color:var(--ink);cursor:pointer;box-shadow:5px 5px 0 rgba(28,20,15,1)}
  .share .main{background:var(--tomato);color:var(--paper)}
  .others{font-size:1rem}
  .others a{font-weight:600}
  .sticky{position:fixed;left:0;right:0;bottom:0;padding:10px 16px calc(10px + env(safe-area-inset-bottom));background:var(--paper);border-top:2.5px solid var(--ink);display:none;z-index:40}
  .sticky a{display:flex;justify-content:space-between;align-items:center;font-family:'Bricolage Grotesque',sans-serif;font-weight:700;font-size:1.1rem;border:2.5px solid var(--ink);padding:13px 18px;text-decoration:none;background:var(--tomato);color:var(--paper)}
  @media(max-width:760px){.sticky.on{display:block}body.has-sticky{padding-bottom:80px}}
  @media(max-width:860px){.steps{grid-template-columns:1fr}.hero{padding:40px 0 26px}}
  /* footer (same as homepage) */
  footer{padding:52px 0 40px;border-top:2.5px solid var(--ink)}
  .foot-in{display:flex;justify-content:space-between;align-items:flex-start;gap:24px;flex-wrap:wrap}
  .foot-brand{font-family:'Bricolage Grotesque',sans-serif;font-weight:800;font-size:1.3rem;display:flex;align-items:center;gap:9px}
  .foot-brand .dot{width:14px;height:14px;background:var(--tomato);border-radius:50%;border:2.5px solid var(--ink)}
  .foot-note{font-size:.9rem;color:var(--ink-soft);max-width:40ch;margin-top:10px}
  .foot-note a{text-decoration:underline}
</style>
</head>
<body>
<nav>
  <div class="nav-in">
    <a class="brand" href="/"><span class="dot"></span>BiteBook</a>
    <div class="nav-links">
      <div class="nav-dropdown" id="locationsDropdown">
        <button class="nav-link" id="locationsToggle" type="button">Locations <span class="caret">▾</span></button>
        <div class="dropdown-menu"><a href="/denver">Denver</a><a href="/nashville">Nashville</a><a href="/phoenix">Phoenix</a></div>
      </div>
      <a class="nav-link" href="/news">News &amp; Updates</a>
    </div>
    <div class="event-pill">${esc(ev.name)} · ${esc(ev.datesLabel)}</div>
  </div>
</nav>
${body}
<footer>
  <div class="wrap foot-in">
    <div>
      <div class="foot-brand"><span class="dot"></span>BiteBook</div>
      <p class="foot-note">Local food events that fill dining rooms and help hungry people find their next favorite spot.</p>
    </div>
    <div>
      <p class="foot-note">Questions? <a href="mailto:${esc(SUPPORT_EMAIL)}">${esc(SUPPORT_EMAIL)}</a><br><a href="/terms">Passport terms</a></p>
    </div>
  </div>
</footer>
<script>
  (function () {
    var d = document.getElementById('locationsDropdown'), t = document.getElementById('locationsToggle');
    if (!d || !t) return;
    t.addEventListener('click', function (e) { e.stopPropagation(); d.classList.toggle('open'); });
    document.addEventListener('click', function () { d.classList.remove('open'); });
  })();
</script>
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
    body: `<header class="hero"><div class="wrap narrow">
  <div class="eyebrow">BiteBook presents</div>
  <h1>${esc(ev.name)}.<br><span class="swap">One passport.</span></h1>
  <div class="dates">${esc(ev.datesLabel)}</div>
  <p class="lede">One passport. A ${esc(ev.food)} deal at local restaurants all over your area. Pick your city to get yours.</p>
</div></section>
<main><div class="wrap narrow"><div class="cities">${links}</div></div></main>`,
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
  var item = { content_type: 'product', content_ids: [${JSON.stringify(`${ev.id}-${city.id}`)}], content_name: ${JSON.stringify(`${ev.name} Passport · ${city.name}`)}, value: ${(ev.priceCents || 0) / 100}, currency: 'USD' };
  if (window.bbTrack) bbTrack('ViewContent', item);
  // Countdown
  var cd = document.getElementById('countdown');
  if (cd) {
    var now = new Date(), days = Math.ceil((start - now) / 864e5);
    if (now >= end) cd.textContent = 'This event has ended';
    else if (now >= start) cd.textContent = 'Happening now · ends ${esc(ev.endLabel)}';
    else cd.textContent = days <= 1 ? 'Kicks off tomorrow' : 'Kicks off in ' + days + ' days';
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
    // Meta "InitiateCheckout" once the checkout form is actually on screen
    var seen = new IntersectionObserver(function (es) {
      if (es[0].isIntersecting) { seen.disconnect(); if (window.bbTrack) bbTrack('InitiateCheckout', item); }
    }, { threshold: 0.3 });
    seen.observe(box);
  } else load();
` : ''}})();
</script>`;

  return shell({
    title: `${ev.name} ${city.name} · BiteBook passport`,
    desc: `Get your ${ev.name} passport for ${city.area}: a ${ev.food} deal at local restaurants, ${ev.datesLabel}. ${price}.`,
    ev, head, url: `${WWW}/${ev.slug}/${city.id}`,
    body: `<header class="hero"><div class="wrap narrow">
  <div class="eyebrow">BiteBook presents · ${esc(city.name)}</div>
  <h1>${esc(ev.name)}.<br><span class="swap">One passport.</span></h1>
  <div class="dates">${esc(city.name)} · ${esc(ev.datesLabel)}</div>
  <div class="countdown" id="countdown">Kicks off ${esc(ev.startShort)}</div>
  <p class="lede">One passport gets you an exclusive ${esc(ev.food)} deal at local restaurants across ${esc(city.area)}. Discover new favorite spots and support local kitchens.</p>
  ${ev.giftLine ? `<p class="gift">🎁 ${esc(ev.giftLine)}</p>` : ''}
  <a class="btn" href="#buy">Get my passport · ${price} <span class="go">→</span></a>
</div></header>
<main><div class="wrap narrow">
  <section>
    <ul class="chips">
      <li>Shareable passport</li><li>A ${esc(ev.food)} deal at every spot</li><li>Valid ${esc(ev.datesLabel)}</li><li>Delivered by email</li>
    </ul>
    ${value ? `<div class="value">Over ${esc(value)} in ${esc(ev.food)} deals for just ${price}</div>` : ''}
  </section>

  <section id="buy">
    <div class="buybox">
      <div class="buy-top">
        <div class="kicker">Admit one · ${esc(ev.name)} · ${esc(city.name)}</div>
        <div class="pricerow"><div class="price">${price} <small>PER PASSPORT</small></div></div>
        <div class="note" style="margin-top:6px">Buying for friends? Change the quantity in checkout.</div>
      </div>
      <div class="perf"></div>
      <div class="buy-bot">
      <div class="promise"><span aria-hidden="true">✓</span><div><b>Our promise:</b> not happy for any reason? Email us and we'll refund you in full. No hassle.</div></div>
      ${buy}
      <div class="secure"><span>🔒 Secure checkout powered by Stripe</span><span class="pill">Apple Pay</span><span class="pill">Google Pay</span><span class="pill">Visa · Mastercard · Amex</span></div>
      </div>
    </div>
  </section>

  <section>
    <h2>How it works</h2>
    <ul class="steps">
      <li><span class="n">STEP 01</span><b>Get your passport</b><span class="t">Buy one for yourself or a few for friends. Each passport has its own coupons.</span></li>
      <li><span class="n">STEP 02</span><b>It lands in your inbox</b><span class="t">You'll get a confirmation now, and your passport arrives when ${esc(ev.name)} kicks off on ${esc(ev.startLabel)}, with every restaurant and its deal.</span></li>
      <li><span class="n">STEP 03</span><b>Eat local</b><span class="t">Tell your server you have a BiteBook coupon and show the QR code. They scan it, and you enjoy the deal. One use per coupon.</span></li>
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
<section class="partners" data-partners="${esc(city.id)}" hidden></section>
<script src="/partners.js" defer></script>
<div class="sticky" id="sticky"><a href="#buy">Get my passport · ${price} <span class="mono">→</span></a></div>`,
    scripts,
  });
}

function thanksPage(ev, s) {
  const paid = s && s.status === 'complete';
  if (!paid) {
    const city = s?.metadata?.city && CITIES[s.metadata.city];
    return shell({
      title: `Payment not finished · BiteBook`, desc: '', ev,
      body: `<main style="padding-top:48px"><div class="wrap narrow"><h2>Your payment didn't go through</h2>
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
    body: `<header class="hero"><div class="wrap narrow">
  <div class="eyebrow">Order confirmed</div>
  <h1>You're in,<br><span class="swap">${esc(firstName(s.customer_details?.name))}!</span></h1>
  <div class="dates">${esc(ev.name)}${city ? ' · ' + esc(city.name) : ''} · ${esc(ev.datesLabel)}</div>
</div></header>
<main><div class="wrap narrow">
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
  // Meta Pixel purchase. Same event ID as the server's Conversions API purchase, so Meta counts it once.
  if (window.bbTrack) bbTrack('Purchase', ${JSON.stringify({
    value: Number(s.amount_total || 0) / 100, currency: String(s.currency || 'usd').toUpperCase(), num_items: qty,
    content_type: 'product', content_ids: [city ? `${ev.id}-${city.id}` : ev.id],
  })}, ${JSON.stringify(s.id)});
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
    body: `<main style="padding-top:48px"><div class="wrap narrow"><h2>Passport terms</h2>
  <p class="note">The short version: share it if you like, each coupon works one time, deals as listed by each restaurant, and a full refund if you're not happy.</p>
  ${items.map(([h, t]) => `<details open><summary>${esc(h)}</summary><p>${esc(t)}</p></details>`).join('')}
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
