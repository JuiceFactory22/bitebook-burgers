// Public, shareable lineup page: getbitebook.com/lineup, /lineup/nashville, /lineup/phoenix
// Reads the live restaurant list, so it updates automatically when restaurants change.
import { RESTAURANTS } from '../lib/restaurants.js';
import { CITIES, EVENT } from '../lib/config.js';
import { esc } from '../lib/html.js';

// ▼▼ Square checkout links — paste a new link here to change where "Get your BiteBook" goes ▼▼
const CHECKOUT = {
  nashville: 'https://square.link/u/xIWWanki',
  phoenix: 'https://square.link/u/ZwVeKSYK',
};
// ▲▲ ------------------------------------------------------------------------------------- ▲▲

// Neighborhood / town shown under each restaurant name
const AREA = {
  'nash-caney-fork': 'Music Valley', 'nash-caddy-briley': 'Briley Pkwy', 'nash-caddy-downtown': 'Downtown',
  'nash-fozzys-franklin': 'Franklin', 'nash-fozzys-spring-hill': 'Spring Hill', 'nash-little-bite': 'Dickson',
  'nash-twisted-fork': 'Pleasant View', 'nash-edessa': 'Nolensville Pike', 'nash-chefs-market': 'Goodlettsville',
  'nash-sticky-rice': "Nashville Farmers' Market", 'nash-makeshift': 'Dickerson Pike', 'nash-uncle-lennys': 'Fairview',
  'nash-fat-mos-east': 'East Nashville',
  'phx-happys': 'Scottsdale', 'phx-jims': 'Surprise', 'phx-frashers': 'Old Town Scottsdale',
  'phx-culinary-gangster': 'Scottsdale', 'phx-blu': 'North Scottsdale', 'phx-roadrunner': 'New River',
  'phx-stumblinas': 'Cave Creek', 'phx-copper-bull': 'Cave Creek', 'phx-coyote-den': 'Casa Grande',
  'phx-patties': 'New River', 'phx-detroit-coney': 'Gilbert', 'phx-whiskey-wings': 'Cave Creek',
};

const YEAR = EVENT.startDate.slice(0, 4);

function sentence(s) {
  const t = String(s || '').trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : '';
}

function citySection(city, showHeader) {
  const list = RESTAURANTS.filter((r) => r.city === city.id && r.active)
    .sort((a, b) => a.name.localeCompare(b.name));
  const cards = list.map((r, i) => {
    const deal = r.deal.toUpperCase();
    const cond = sentence(r.condition);
    const terms = r.terms.length ? `<div class="terms">${r.terms.map(esc).join(' · ')}</div>` : '';
    return `<article class="card">
  <div class="num">${String(i + 1).padStart(2, '0')}</div>
  <div class="body">
    <h3>${esc(r.name)}</h3>
    <div class="area">${esc((AREA[r.id] || '').toUpperCase())}</div>
    <div class="deal"><div class="big">${esc(deal)}</div><div class="cond">${esc(cond)}</div></div>
    ${terms}
  </div>
</article>`;
  }).join('\n');
  return `<section class="city" id="${city.id}">
  ${showHeader ? `<div class="cityhead"><h2>${esc(city.name)}</h2><span class="count">${list.length} restaurants</span></div>` : ''}
  <div class="grid">${cards}</div>
  <div class="cta"><a class="btn" href="${esc(CHECKOUT[city.id])}">Get your ${esc(city.name)} BiteBook →</a></div>
</section>`;
}

function shell({ title, desc, eyebrow, hero, main }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} · BiteBook</title>
<meta name="description" content="${esc(desc)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:type" content="website">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,700;12..96,800&family=Space+Mono:wght@400;700&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<style>${CSS}</style>
</head>
<body>
<header class="hero">
  <div class="wrap">
    <div class="top"><a class="brand" href="/">BiteBook</a><span class="eyebrow">${esc(eyebrow)}</span></div>
    ${hero}
  </div>
</header>
<main class="wrap">${main}</main>
<footer>getbitebook.com</footer>
</body>
</html>`;
}

const CSS = `
  :root { --ink:#1F1A15; --paper:#FBF4E4; --stub:#FFFDF7; --mustard:#F2B33D; --red:#C8371D; --muted:#5E5246; }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--paper); color:var(--ink); font-family:Inter, system-ui, sans-serif; }
  a { color:inherit; }
  .hero { background:var(--ink); color:var(--paper); padding:28px 16px 34px; }
  .wrap { max-width:960px; margin:0 auto; padding:0 16px; }
  .hero .wrap { padding:0; max-width:928px; }
  .top { display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap; }
  .brand { font-family:'Bricolage Grotesque', sans-serif; font-weight:800; font-size:24px; text-decoration:none; }
  .eyebrow { font-family:'Space Mono', monospace; font-size:13px; letter-spacing:3px; color:var(--mustard); }
  h1 { font-family:'Bricolage Grotesque', sans-serif; font-weight:800; font-size:clamp(48px, 13vw, 112px); line-height:.88; letter-spacing:-2px; margin:26px 0 14px; }
  .cityname { font-family:'Bricolage Grotesque', sans-serif; font-weight:800; font-size:clamp(30px, 8vw, 56px); line-height:1; color:var(--paper); margin-bottom:10px; }
  .dates { font-family:'Bricolage Grotesque', sans-serif; font-weight:800; font-size:clamp(22px, 5.5vw, 36px); color:var(--mustard); }
  .lede { font-size:18px; line-height:1.5; max-width:600px; margin:14px 0 22px; }
  .btns { display:flex; gap:12px; flex-wrap:wrap; }
  .btn { display:inline-flex; align-items:center; justify-content:center; min-height:56px; padding:14px 22px; background:var(--red); color:#fff; border:2px solid var(--ink); border-radius:12px; font-family:'Bricolage Grotesque', sans-serif; font-weight:800; font-size:20px; text-decoration:none; box-shadow:0 4px 0 var(--mustard); }
  .hero .btn { border-color:var(--mustard); }
  .btn:hover { filter:brightness(1.08); }
  .city { padding:34px 0 10px; }
  .cityhead { display:flex; align-items:baseline; justify-content:space-between; gap:12px; border-bottom:3px solid var(--ink); padding-bottom:8px; margin-bottom:18px; flex-wrap:wrap; }
  h2 { font-family:'Bricolage Grotesque', sans-serif; font-weight:800; font-size:40px; margin:0; }
  .count { font-family:'Space Mono', monospace; font-size:13px; letter-spacing:2px; color:var(--muted); text-transform:uppercase; }
  .grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(min(100%, 420px), 1fr)); gap:14px; }
  .card { display:flex; gap:14px; background:var(--stub); border:2px solid var(--ink); border-radius:14px; padding:16px; }
  .num { flex-shrink:0; width:44px; height:44px; border-radius:999px; background:var(--mustard); border:2px solid var(--ink); display:flex; align-items:center; justify-content:center; font-family:'Space Mono', monospace; font-weight:700; font-size:15px; }
  .body { min-width:0; display:flex; flex-direction:column; gap:6px; }
  h3 { font-family:'Bricolage Grotesque', sans-serif; font-weight:800; font-size:23px; line-height:1.1; margin:0; }
  .area { font-family:'Space Mono', monospace; font-size:12px; letter-spacing:1.5px; color:var(--muted); }
  .deal { background:var(--mustard); border:1.5px solid var(--ink); border-radius:10px; padding:10px 12px; margin-top:4px; }
  .deal .big { font-family:'Bricolage Grotesque', sans-serif; font-weight:800; font-size:19px; line-height:1.1; }
  .deal .cond { font-size:14.5px; line-height:1.4; margin-top:3px; }
  .terms { font-size:13px; color:var(--muted); }
  .cta { display:flex; justify-content:center; padding:24px 0 6px; }
  .pick { display:flex; flex-direction:column; gap:14px; padding:34px 0 50px; max-width:520px; }
  .pick a { display:flex; justify-content:space-between; align-items:center; background:var(--stub); border:2px solid var(--ink); border-radius:14px; padding:20px; text-decoration:none; font-family:'Bricolage Grotesque', sans-serif; font-weight:800; font-size:28px; }
  .pick a span { font-family:'Space Mono', monospace; font-size:13px; font-weight:700; letter-spacing:1.5px; color:var(--muted); }
  .fine { border-top:2px dashed var(--ink); margin-top:26px; padding:18px 0 40px; font-size:14px; line-height:1.6; color:var(--muted); }
  footer { background:var(--ink); color:var(--paper); font-family:'Space Mono', monospace; font-size:12px; padding:14px 16px; text-align:center; }
`;

const activeIn = (id) => RESTAURANTS.filter((r) => r.city === id && r.active).length;

export default function handler(req, res) {
  const cityId = String((req.query && req.query.city) || '').toLowerCase();
  const city = CITIES[cityId] || null;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=60');

  if (!city) {
    // /lineup with no city: just a picker. Each city is its own event, so no combined list.
    const links = Object.values(CITIES).map((c) =>
      `<a href="/lineup/${c.id}">${esc(c.name)} <span>${activeIn(c.id)} SPOTS →</span></a>`).join('');
    return res.status(200).send(shell({
      title: `${EVENT.name} ${YEAR} lineups`,
      desc: `Pick your city to see every restaurant in ${EVENT.name} ${YEAR}.`,
      eyebrow: 'THE LINEUP',
      hero: `<h1>${esc(EVENT.name.toUpperCase())}<br>${YEAR}</h1><div class="dates">OCTOBER 15 – NOVEMBER 15</div>`,
      main: `<div class="pick"><h2>Pick your city</h2>${links}</div>`,
    }));
  }

  const n = activeIn(city.id);
  const btn = `<a class="btn" href="${esc(CHECKOUT[city.id])}">Get your ${esc(city.name)} BiteBook →</a>`;
  res.status(200).send(shell({
    title: `${EVENT.name} ${YEAR} ${city.name} — the lineup`,
    desc: `Every restaurant in ${city.name}'s ${EVENT.name} ${YEAR} and exactly what you get. ${EVENT.datesLabel}.`,
    eyebrow: `${city.name.toUpperCase()} · THE LINEUP`,
    hero: `<h1>${esc(EVENT.name.toUpperCase())}<br>${YEAR}</h1>
    <div class="cityname">${esc(city.name)}</div>
    <div class="dates">OCTOBER 15 – NOVEMBER 15</div>
    <p class="lede">${n} local ${esc(city.name)} restaurants. One digital passport. Here's every spot and exactly what you get at each one.</p>
    <div class="btns">${btn}</div>`,
    main: `${citySection(city, true)}
  <div class="fine">
    Each deal is good once per passport, ${esc(EVENT.datesLabel)}. Add-ons, toppings and tax are extra, and please tip on the full value.
    Your passport is delivered to your inbox and used from your phone. More restaurants are joining all month.
    Questions? info@getbitebook.com
  </div>`,
  }));
}
