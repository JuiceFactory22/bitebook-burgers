// A buyer's passport PDF, always up to date: getbitebook.com/book/<passportId>
//   /book/<id>        -> a tiny page that opens the PDF right away. It carries the link-preview tags
//                        (title, dates, BiteBook image), so the link shows a nice card in texts and chats.
//   /book/<id>?pdf=1  -> the PDF itself
import { getPassport, ensureCoupons } from '../lib/passports.js';
import { buildPassportPdf } from '../lib/pdf.js';
import { CITIES, eventOf, SITE_URL } from '../lib/config.js';
import { page, esc } from '../lib/html.js';
import { SUPPORT_EMAIL } from '../lib/config.js';
import { restaurantById } from '../lib/restaurants.js';

const WWW = 'https://www.getbitebook.com';
// Link-preview fetchers (iMessage uses the facebookexternalhit/Twitterbot one). They get the page without the redirect.
const PREVIEW_BOT = /facebookexternalhit|facebot|twitterbot|whatsapp|slackbot|telegrambot|discordbot|linkedinbot|skypeuripreview|applebot|google-pagerenderer|embedly|iframely|redditbot|pinterest|snapchat|bingpreview|vkshare|preview/i;

function previewPage(passport, req) {
  const ev = eventOf(passport);
  const r = passport.free_restaurant ? restaurantById(passport.free_restaurant) : null;
  const title = r ? `Your free ${ev.food} coupon: ${r.name}` : `Your ${ev.name} passport`;
  const desc = r
    ? `${r.short || r.deal}. Show it at the restaurant ${ev.datesLabel}.`
    : `A ${ev.food} deal at every participating spot, ${ev.datesLabel}.`;
  const image = `${WWW}/brand/${r ? 'og-coupon' : 'og-passport'}.png`;
  const pdf = `/book/${passport.id}?pdf=1`;
  const bot = PREVIEW_BOT.test(String(req.headers['user-agent'] || ''));
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${esc(title)} · BiteBook</title>
<meta name="description" content="${esc(desc)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="BiteBook">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(`${SITE_URL}/book/${passport.id}`)}">
<meta property="og:image" content="${image}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${esc(title)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${image}">
<link rel="icon" href="/favicon.ico" sizes="any">
<link rel="apple-touch-icon" href="/brand/icon-180.png">
${bot ? '' : `<meta http-equiv="refresh" content="0;url=${pdf}">`}
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f8efdd;color:#1c140f;font-family:Inter,system-ui,sans-serif;text-align:center;padding:24px}
a{display:inline-block;margin-top:16px;background:#e0442a;color:#fffaf0;border:2.5px solid #1c140f;box-shadow:5px 5px 0 #1c140f;padding:14px 22px;font-weight:700;font-size:18px;text-decoration:none}</style>
</head><body><div><b style="font-size:22px">BiteBook</b><p>Opening your ${r ? 'coupon' : 'passport'}…</p><a href="${pdf}">Open it</a></div>
${bot ? '' : `<script>location.replace(${JSON.stringify(pdf)});</script>`}
</body></html>`;
}

export default async function handler(req, res) {
  const id = String(req.query.id || '').trim();
  try {
    const passport = /^bb[A-Za-z0-9]{14}$/.test(id) ? await getPassport(id) : null;
    if (!passport) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.status(404).send(page({
        title: 'Passport not found', label: 'BURGER BLASTOFF',
        body: `<main><h1>Passport not found</h1><p class="muted">Double-check the link in your email, or write to ${esc(SUPPORT_EMAIL)} and we'll sort it out.</p></main>`,
      }));
    }
    if (passport.voided_at) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.status(410).send(page({
        title: 'Passport cancelled', label: 'BURGER BLASTOFF',
        body: `<main><h1>This passport was cancelled</h1><p class="muted">If you were sent a replacement, use the link in that newer email. Questions? Write to ${esc(SUPPORT_EMAIL)}.</p></main>`,
      }));
    }
    if (req.query.pdf !== '1') {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('X-Robots-Tag', 'noindex');
      return res.status(200).send(previewPage(passport, req));
    }
    const coupons = await ensureCoupons(passport);
    const bytes = await buildPassportPdf({ passport, coupons });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="BiteBook-${eventOf(passport).fileName}${passport.source === 'free' ? '-Free-Coupon' : ''}.pdf"`);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Robots-Tag', 'noindex');
    return res.status(200).send(Buffer.from(bytes));
  } catch (e) {
    console.error(e);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(500).send(page({
      title: 'Something went wrong', label: 'BURGER BLASTOFF',
      body: `<main><h1>Something went wrong</h1><p class="muted">Please try again in a minute. If it keeps happening, write to ${esc(SUPPORT_EMAIL)}.</p></main>`,
    }));
  }
}
