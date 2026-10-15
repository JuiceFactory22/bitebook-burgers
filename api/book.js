// A buyer's passport PDF, always up to date: getbitebook.com/book/<passportId>
import { getPassport, ensureCoupons } from '../lib/passports.js';
import { buildPassportPdf } from '../lib/pdf.js';
import { CITIES } from '../lib/config.js';
import { page, esc } from '../lib/html.js';
import { SUPPORT_EMAIL } from '../lib/config.js';

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
    const coupons = await ensureCoupons(passport);
    const bytes = await buildPassportPdf({ passport, coupons });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="BiteBook-Burger-Blastoff-${CITIES[passport.city].name}.pdf"`);
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
