// Free-coupon spinner: getbitebook.com/spin/<city>
//   GET  /spin/<city>      -> the page (form + wheel)
//   POST /api/spin         -> { city, name, email, phone, zip, textOk } -> spins, makes the free coupon,
//                             sends it into GHL (which texts it) and, until texting is approved, emails it too.
// One free coupon per email and per phone, per event and city. It works on the event's dates, like the book.
import { EVENTS, CITIES, SITE_URL, SUPPORT_EMAIL, eventWindow } from '../config.js';
import { esc } from '../html.js';
import { spinFor, existingFreePassport, createFreePassport } from '../freecoupon.js';
import { restaurantById } from '../restaurants.js';
import { syncFreeCoupon } from '../ghl.js';
import { sendFreeCouponEmail } from '../email.js';
import { logEvent } from '../db.js';

// The event the spinner gives coupons for. Change this when the next event goes on sale.
export const SPIN_EVENT = 'wings';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const digits = (s) => String(s || '').replace(/\D/g, '');

function couponView(p, r, ev) {
  return { restaurant: r.name, address: r.address, deal: r.short || r.deal, link: `${SITE_URL}/book/${p.id}`, dates: ev.datesLabel };
}

async function claim(req, res) {
  const b = req.body || {};
  const ev = EVENTS[SPIN_EVENT];
  const city = CITIES[String(b.city || '')];
  const name = String(b.name || '').trim().slice(0, 80);
  const email = String(b.email || '').trim().toLowerCase().slice(0, 200);
  const phone = digits(b.phone).slice(-11);
  const zip = digits(b.zip).slice(0, 5);
  const textOk = b.textOk === true || b.textOk === 'yes';
  if (!city || !ev.cities.includes(city.id)) return res.status(400).json({ error: 'That city isn’t part of this event.' });
  if (!name) return res.status(400).json({ error: 'Please enter your name.' });
  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Please enter a valid email.' });
  if (phone.length < 10) return res.status(400).json({ error: 'Please enter a valid mobile number. We text your coupon to it.' });
  if (zip.length !== 5) return res.status(400).json({ error: 'Please enter your 5-digit zip code.' });
  if (new Date() >= eventWindow(city.id, ev.id).end) return res.status(400).json({ error: `${ev.name} has ended. Follow @${city.instagram} for the next one!` });

  try {
    const already = await existingFreePassport({ cityId: city.id, eventId: ev.id, email, phone });
    if (already) {
      const r = restaurantById(already.free_restaurant);
      return res.status(200).json({ ok: true, already: true, coupon: r ? couponView(already, r, ev) : null });
    }

    const spin = await spinFor(city.id, ev.id, zip);
    if (!spin) return res.status(400).json({ error: 'The wheel isn’t ready yet. Restaurants are still being added. Check back soon!' });
    const r = spin.winner.r;
    const p = await createFreePassport({ cityId: city.id, eventId: ev.id, name, email, phone, zip, textOk, restaurantId: r.id });
    await logEvent('free_coupon', { city: city.id, event: ev.id, restaurant: r.id, passport: p.id, textOk });

    // GHL: contact + tags + New Lead card. Its workflow texts the coupon link.
    const ghl = await syncFreeCoupon({ cityId: city.id, name, email, phone, textOptIn: textOk, passportId: p.id, restaurant: r, ev });

    // Email copy, on by default until GHL texting is approved. Set FREE_COUPON_EMAIL=off in Vercel to stop it.
    if (process.env.FREE_COUPON_EMAIL !== 'off') {
      try { await sendFreeCouponEmail({ to: email, name, ev, city, restaurant: r, link: `${SITE_URL}/book/${p.id}` }); }
      catch (e) { await logEvent('free_coupon_email_failed', { passport: p.id, error: String(e.message || e).slice(0, 200) }); }
    }

    return res.status(200).json({
      ok: true,
      wheel: spin.wheel.map((w) => w.r.name),
      pick: spin.pick,
      coupon: couponView(p, r, ev),
      ghl,
    });
  } catch (e) {
    console.error(e);
    await logEvent('free_coupon_error', { city: city.id, error: String(e.message || e).slice(0, 300) });
    return res.status(500).json({ error: 'Something went wrong. Please try again in a minute.' });
  }
}

function pageHtml(city, ev) {
  const passportUrl = `/${ev.slug}/${city.id}?src=spin`;
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Spin for a free wing deal · BiteBook ${esc(city.name)}</title>
<meta name="description" content="Spin the wheel for a free ${esc(ev.name)} coupon from a local restaurant near you in ${esc(city.area)}.">
<link rel="icon" href="/favicon.ico" sizes="any"><link rel="apple-touch-icon" href="/brand/icon-180.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,700;12..96,800&family=Space+Mono:wght@400;700&family=Inter:wght@400;500;600&display=swap">
<script src="/meta-pixel.js"></script>
<style>
  :root { --ink:#1F1A15; --paper:#FBF4E4; --stub:#FFFDF7; --mustard:#F2B33D; --red:#C8371D; --muted:#5E5246; --green:#1F6B3A; }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--paper); color:var(--ink); font-family:Inter, system-ui, sans-serif; }
  header { background:var(--ink); color:var(--paper); padding:14px 20px; display:flex; justify-content:space-between; align-items:center; }
  header b { font-family:'Bricolage Grotesque', sans-serif; font-size:22px; }
  header span { font-family:'Space Mono', monospace; font-size:12px; letter-spacing:1.5px; color:var(--mustard); }
  main { max-width:480px; margin:0 auto; padding:22px 18px 40px; display:flex; flex-direction:column; gap:16px; }
  h1 { font-family:'Bricolage Grotesque', sans-serif; font-weight:800; font-size:38px; line-height:1; margin:0; letter-spacing:-.5px; }
  p { margin:0; line-height:1.5; }
  .muted { color:var(--muted); font-size:14px; }
  .card { background:var(--stub); border:2px solid var(--ink); border-radius:14px; padding:16px; display:flex; flex-direction:column; gap:10px; }
  label { font-weight:600; font-size:14px; display:flex; flex-direction:column; gap:4px; }
  input[type=text], input[type=email], input[type=tel] { font:inherit; font-size:17px; padding:12px; border:2px solid var(--ink); border-radius:10px; background:#fff; }
  .opt { flex-direction:row; align-items:flex-start; gap:10px; font-weight:400; font-size:13px; color:var(--muted); line-height:1.4; }
  .opt input { width:22px; height:22px; margin-top:1px; flex:none; }
  .btn { display:block; width:100%; height:64px; border:2px solid var(--ink); border-radius:14px; background:var(--red); color:#fff; font-family:'Bricolage Grotesque', sans-serif; font-weight:800; font-size:26px; box-shadow:0 5px 0 var(--ink); cursor:pointer; text-decoration:none; text-align:center; line-height:60px; }
  .btn:disabled { opacity:.6; }
  .btn.alt { background:var(--mustard); color:var(--ink); }
  .err { color:var(--red); font-weight:600; font-size:14px; min-height:1em; }
  .wheelwrap { position:relative; width:300px; height:300px; margin:6px auto; }
  .pointer { position:absolute; top:-6px; left:50%; transform:translateX(-50%); width:0; height:0; border-left:16px solid transparent; border-right:16px solid transparent; border-top:28px solid var(--ink); z-index:2; }
  #wheel { width:300px; height:300px; border-radius:50%; border:4px solid var(--ink); transition:transform 4.2s cubic-bezier(.12,.6,.12,1); }
  .deal { background:var(--mustard); border:2px solid var(--ink); border-radius:12px; padding:14px 16px; }
  .deal .big { font-family:'Bricolage Grotesque', sans-serif; font-weight:800; font-size:24px; line-height:1.1; }
  .small { font-family:'Space Mono', monospace; font-size:11px; letter-spacing:1px; color:var(--muted); text-transform:uppercase; }
  [hidden] { display:none !important; }
</style>
</head><body>
<header><b>BiteBook</b><span>${esc(ev.name.toUpperCase())} · ${esc(city.name.toUpperCase())}</span></header>
<main>
  <div class="small">Free coupon</div>
  <h1>Spin for a free wing deal ${ev.emoji}</h1>
  <p>Spin the wheel and win a ${esc(ev.name)} deal from a local spot near you. We'll text you the coupon. Good ${esc(ev.datesLabel)}.</p>

  <div class="wheelwrap"><div class="pointer"></div><canvas id="wheel" width="600" height="600"></canvas></div>

  <form id="f" class="card" novalidate>
    <label>Name<input type="text" name="name" autocomplete="name" required></label>
    <label>Email<input type="email" name="email" autocomplete="email" required></label>
    <label>Mobile number<input type="tel" name="phone" autocomplete="tel" inputmode="tel" required></label>
    <label>Zip code<input type="text" name="zip" inputmode="numeric" maxlength="5" autocomplete="postal-code" required></label>
    <label class="opt"><input type="checkbox" name="textOk" value="yes">
      <span>Yes, text me exclusive BiteBook deals and new events (about 2 a month). Msg &amp; data rates may apply. Reply STOP to opt out, HELP for help. Not required to get your coupon.</span></label>
    <div class="err" id="err"></div>
    <button class="btn" id="go" type="submit">SPIN</button>
    <p class="muted">We'll text your coupon to this number and email you a copy. See our <a href="/terms">terms</a>.</p>
  </form>

  <div id="win" class="card" hidden>
    <div class="small" id="wintitle">You won!</div>
    <div class="deal"><div class="big" id="wdeal"></div><div id="wrest" style="font-weight:600;margin-top:6px"></div><div id="waddr" class="muted"></div></div>
    <p id="wmsg">Your coupon is on its way by text and email. Show it at the restaurant from ${esc(ev.datesLabel)}.</p>
    <a class="btn alt" id="wlink" href="#" target="_blank" rel="noopener">See my coupon</a>
  </div>

  <div id="upsell" class="card" hidden>
    <div class="small">Want every deal?</div>
    <p>Your free coupon covers one restaurant. The ${esc(ev.name)} passport has a deal at <b>every</b> participating spot across ${esc(city.area)}.</p>
    <a class="btn" href="${passportUrl}">Get the passport</a>
  </div>
  <p class="muted">Questions? ${esc(SUPPORT_EMAIL)}</p>
</main>
<script>
(function () {
  var COLORS = ['#F2B33D', '#C8371D', '#FFFDF7', '#1F6B3A', '#F2B33D', '#C8371D', '#FFFDF7', '#1F6B3A'];
  var canvas = document.getElementById('wheel'), ctx = canvas.getContext('2d');
  function draw(labels) {
    var n = labels.length, c = 300, r = 296, step = 2 * Math.PI / n;
    ctx.clearRect(0, 0, 600, 600);
    for (var i = 0; i < n; i++) {
      var a0 = -Math.PI / 2 - step / 2 + i * step;
      ctx.beginPath(); ctx.moveTo(c, c); ctx.arc(c, c, r, a0, a0 + step); ctx.closePath();
      ctx.fillStyle = COLORS[i % COLORS.length]; ctx.fill(); ctx.lineWidth = 4; ctx.strokeStyle = '#1F1A15'; ctx.stroke();
      ctx.save(); ctx.translate(c, c); ctx.rotate(a0 + step / 2); ctx.textAlign = 'right';
      ctx.fillStyle = (COLORS[i % COLORS.length] === '#C8371D' || COLORS[i % COLORS.length] === '#1F6B3A') ? '#fff' : '#1F1A15';
      ctx.font = '700 26px Inter, sans-serif';
      var t = String(labels[i]); if (t.length > 18) t = t.slice(0, 17) + '…';
      ctx.fillText(t, r - 22, 9); ctx.restore();
    }
    ctx.beginPath(); ctx.arc(c, c, 34, 0, 2 * Math.PI); ctx.fillStyle = '#1F1A15'; ctx.fill();
  }
  draw(['?', '?', '?', '?', '?', '?']);
  var f = document.getElementById('f'), err = document.getElementById('err'), go = document.getElementById('go');
  function show(c, title, msg) {
    document.getElementById('wintitle').textContent = title;
    document.getElementById('wdeal').textContent = c.deal;
    document.getElementById('wrest').textContent = c.restaurant;
    document.getElementById('waddr').textContent = c.address || '';
    if (msg) document.getElementById('wmsg').textContent = msg;
    document.getElementById('wlink').href = c.link;
    f.hidden = true; document.getElementById('win').hidden = false; document.getElementById('upsell').hidden = false;
  }
  f.addEventListener('submit', function (e) {
    e.preventDefault(); err.textContent = ''; go.disabled = true; go.textContent = 'SPINNING…';
    var body = { city: ${JSON.stringify(city.id)}, name: f.name.value, email: f.email.value, phone: f.phone.value, zip: f.zip.value, textOk: f.textOk.checked };
    fetch('/api/spin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (!d.ok) { err.textContent = d.error || 'Please try again.'; go.disabled = false; go.textContent = 'SPIN'; return; }
        if (d.already) {
          if (d.coupon) show(d.coupon, 'You already have a free coupon', 'You already spun for ${esc(ev.name)}. Here is your coupon again.');
          else { err.textContent = 'You already claimed a free coupon.'; go.disabled = false; go.textContent = 'SPIN'; }
          return;
        }
        draw(d.wheel);
        var n = d.wheel.length, step = 360 / n, turns = 6;
        var deg = turns * 360 + (360 - d.pick * step) + (Math.random() - 0.5) * step * 0.6;
        canvas.style.transform = 'rotate(' + deg + 'deg)';
        if (window.bbTrack) window.bbTrack('Lead', { content_name: ${JSON.stringify(`${ev.name} free coupon · ${city.name}`)} });
        setTimeout(function () { show(d.coupon, 'You won!'); }, 4400);
      })
      .catch(function () { err.textContent = 'Connection problem. Please try again.'; go.disabled = false; go.textContent = 'SPIN'; });
  });
})();
</script>
</body></html>`;
}

export default async function spin(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'POST') return claim(req, res);
  const ev = EVENTS[SPIN_EVENT];
  const city = CITIES[String(req.query.city || '')];
  if (!city || !ev.cities.includes(city.id)) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    const links = ev.cities.map((id) => `<li><a href="/spin/${id}">${esc(CITIES[id].name)}</a></li>`).join('');
    return res.status(200).send(`<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><title>Spin · BiteBook</title><body style="font-family:Inter,system-ui,sans-serif;padding:24px"><h1>Pick your city</h1><ul>${links}</ul></body>`);
  }
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.status(200).send(pageHtml(city, ev));
}
