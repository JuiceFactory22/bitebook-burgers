// Delivery email via Resend (plain fetch). Needs RESEND_API_KEY.
import { CITIES, eventOf, FROM_EMAIL, SUPPORT_EMAIL, SITE_URL, eventWindow } from './config.js';
import { esc } from './html.js';
import { passportLabel } from './passports.js';

function firstName(n) {
  const s = String(n || '').trim().split(/\s+/)[0];
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : 'there';
}

export async function sendPassportEmail({ to, name, passports, pdfs }) {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error('RESEND_API_KEY is not set');
  const cityIds = [...new Set(passports.map((p) => p.city))];
  const cityNames = cityIds.map((c) => CITIES[c].name).join(' & ');
  const multi = passports.length > 1;
  const ev = eventOf(passports[0]);
  const started = cityIds.every((c) => new Date() >= eventWindow(c, ev.id).start);

  const subject = multi
    ? `Your ${passports.length} ${ev.name} passports are here ${ev.emoji}`
    : `Your ${ev.name} passport is here ${ev.emoji}`;

  const buttons = passports.map((p, i) => `
    <tr><td style="padding:6px 0">
      <a href="${SITE_URL}/book/${p.id}" style="display:block;background:#C8371D;color:#ffffff;text-decoration:none;font-weight:700;font-size:17px;text-align:center;padding:16px;border-radius:12px;border:2px solid #1F1A15">
        Open ${multi ? `passport ${i + 1} (${esc(CITIES[p.city].name)}, ${esc(passportLabel(p.id))})` : `my ${esc(CITIES[p.city].name)} passport`} →
      </a>
    </td></tr>`).join('');

  const html = `<!doctype html><html><body style="margin:0;background:#FBF4E4;font-family:Helvetica,Arial,sans-serif;color:#1F1A15">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FBF4E4"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#FFFDF7;border:2px solid #1F1A15;border-radius:14px;overflow:hidden">
  <tr><td style="background:#1F1A15;padding:16px 22px;color:#FBF4E4;font-size:22px;font-weight:800">BiteBook
    <span style="float:right;color:#F2B33D;font-family:Courier,monospace;font-size:12px;letter-spacing:1.5px;line-height:30px">${esc(ev.name.toUpperCase())}</span></td></tr>
  <tr><td style="padding:26px 22px 8px">
    <div style="font-size:26px;font-weight:800;line-height:1.15">Hey ${esc(firstName(name))}, your passport${multi ? 's are' : ' is'} here!</div>
    <p style="font-size:16px;line-height:1.5;margin:14px 0 6px">${multi ? `Your ${passports.length} ${esc(ev.name)} passports` : `Your ${esc(ev.name)} passport`} for <b>${esc(cityNames)}</b> ${multi ? 'are' : 'is'} attached as a PDF, and you can open ${multi ? 'them' : 'it'} anytime with the button below.</p>
    ${multi ? `<p style="font-size:15px;line-height:1.5;margin:6px 0;color:#5E5246">Each passport has its own coupons. Keep one and forward the other to whoever's coming along.</p>` : ''}
  </td></tr>
  <tr><td style="padding:6px 22px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${buttons}</table></td></tr>
  <tr><td style="padding:14px 22px 4px">
    <div style="background:#F2B33D;border:2px solid #1F1A15;border-radius:12px;padding:14px 16px">
      <div style="font-family:Courier,monospace;font-size:12px;font-weight:700;letter-spacing:1.5px">HOW IT WORKS</div>
      <ol style="margin:8px 0 0;padding-left:20px;font-size:15px;line-height:1.55">
        <li>Visit any restaurant in your passport${started ? '' : ` starting <b>${esc(ev.startLabel)}</b>`}.</li>
        <li>Tell your server up front: "I have a BiteBook coupon."</li>
        <li>Open that restaurant's page and show them the QR code at the bottom. They scan it and tap Redeem. Enjoy!</li>
      </ol>
      <div style="margin-top:10px;font-size:14px;line-height:1.5"><b>Be a good BiteBooker:</b> be kind and patient, tip on the full value, and remember add-ons, toppings and tax are extra. Great guests keep the deals coming for everyone.</div>
    </div>
  </td></tr>
  <tr><td style="padding:14px 22px 22px;font-size:14px;line-height:1.55;color:#5E5246">
    Coupons work <b style="color:#C8371D">${esc(ev.datesLabel)}</b>, one time each. Please don't scan your own QR codes; that's your server's job.
    We're adding restaurants all month, and your passport link always shows the latest lineup.<br><br>
    Questions? Just reply to this email or write to ${esc(SUPPORT_EMAIL)}.
  </td></tr>
  <tr><td style="background:#1F1A15;color:#FBF4E4;padding:12px 22px;font-family:Courier,monospace;font-size:12px">getbitebook.com</td></tr>
</table></td></tr></table></body></html>`;

  const text = [
    `Hey ${firstName(name)}, your ${ev.name} passport${multi ? 's are' : ' is'} here!`,
    '',
    ...passports.map((p, i) => `${multi ? `Passport ${i + 1}` : 'Your passport'} (${CITIES[p.city].name}): ${SITE_URL}/book/${p.id}`),
    '',
    'How it works:',
    `1. Visit any restaurant in your passport${started ? '' : ` starting ${ev.startLabel}`}.`,
    '2. Tell your server up front: "I have a BiteBook coupon."',
    "3. Show them the QR code on that restaurant's page. They scan it and tap Redeem.",
    '',
    'Be a good BiteBooker: be kind and patient, tip on the full value, and remember add-ons, toppings and tax are extra.',
    '',
    `Coupons work ${ev.datesLabel}, one time each.`,
    `Questions? Reply to this email or write to ${SUPPORT_EMAIL}.`,
  ].join('\n');

  const attachments = passports.map((p, i) => ({
    filename: `BiteBook-${ev.fileName}-${CITIES[p.city].name}${multi ? `-${i + 1}` : ''}.pdf`,
    content: Buffer.from(pdfs[i]).toString('base64'),
  }));

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM_EMAIL, to: [to], reply_to: SUPPORT_EMAIL, subject, html, text, attachments }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Resend failed (${res.status}): ${JSON.stringify(json).slice(0, 300)}`);
  return json; // { id }
}

// Internal alert to the team (info@ and will@)
export async function sendTeamAlert({ subject, html }) {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error('RESEND_API_KEY is not set');
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM_EMAIL, to: [SUPPORT_EMAIL, 'will@getbitebook.com'], subject, html }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Resend failed (${res.status}): ${JSON.stringify(json).slice(0, 300)}`);
  return json;
}

// Kickoff packet for a participating restaurant, with its printable staff guide attached
export async function sendRestaurantPacket({ to, contactName, restaurant: r, pdf, contact }) {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error('RESEND_API_KEY is not set');
  const first = String(contactName || '').trim().split(/\s+/)[0] || 'there';
  const terms = r.terms.length ? ` (${r.terms.join(', ').toLowerCase()})` : '';
  const subject = `Burger Blastoff kicks off: your staff guide for ${r.name}`;
  const html = `<!doctype html><html><body style="margin:0;background:#FBF4E4;font-family:Helvetica,Arial,sans-serif;color:#1F1A15">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FBF4E4"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFDF7;border:2px solid #1F1A15;border-radius:14px;overflow:hidden">
<tr><td style="background:#1F1A15;padding:16px 22px;color:#FBF4E4;font-size:22px;font-weight:800">BiteBook <span style="float:right;color:#F2B33D;font-family:Courier,monospace;font-size:12px;letter-spacing:1.5px;line-height:30px">${esc(ev.name.toUpperCase())}</span></td></tr>
<tr><td style="padding:24px 22px 6px;font-size:16px;line-height:1.55">
<p style="margin:0 0 12px">Hi ${esc(first)},</p>
<p style="margin:0 0 12px">Burger Blastoff kicks off and runs <b>Thursday, Oct 15 through Sunday, Nov 15</b>. Thank you for being part of it. Here's everything your team needs, and it takes about 2 minutes.</p>
</td></tr>
<tr><td style="padding:6px 22px"><div style="background:#F2B33D;border:2px solid #1F1A15;border-radius:12px;padding:14px 16px">
<div style="font-family:Courier,monospace;font-size:12px;font-weight:700;letter-spacing:1.5px">YOUR BITEBOOK OFFER</div>
<div style="font-size:20px;font-weight:800;margin-top:6px">${esc(r.deal)}</div>
<div style="font-size:15px;margin-top:4px">${esc(r.condition)}${esc(terms)}</div>
</div><div style="font-size:13px;color:#5E5246;margin-top:6px">If anything here isn't right, reply and we'll fix it today.</div></td></tr>
<tr><td style="padding:16px 22px 4px;font-size:15px;line-height:1.55">
<div style="font-family:Courier,monospace;font-size:12px;font-weight:700;letter-spacing:1.5px;color:#C8371D">HOW REDEMPTION WORKS</div>
<ol style="margin:8px 0 0;padding-left:20px">
<li>Guest says <b>"I have a BiteBook coupon"</b> and shows your page in their digital passport.</li>
<li>Your server scans the QR code with <b>their own phone camera</b>. No app or login.</li>
<li>Check the screen says <b>${esc(r.name)}</b> and <b>VALID</b>, then tap the big red <b>REDEEM</b> button.</li>
<li>Green "Redeemed!" means honor the deal. Ring it up as a comp labeled "BiteBook." A red "Already redeemed" screen means don't honor it.</li>
</ol>
<p style="margin:12px 0 0">Guests pay normally for the required purchase, add-ons, toppings and tax, and they've been asked to tip on the full value.</p>
</td></tr>
<tr><td style="padding:14px 22px 4px;font-size:15px;line-height:1.55">
<div style="font-family:Courier,monospace;font-size:12px;font-weight:700;letter-spacing:1.5px;color:#1F6B3A">BEFORE YOUR NEXT SERVICE</div>
<p style="margin:8px 0 0"><b>Print the attached one-page staff guide</b> and share it with your front-of-house team. It has a <b>practice QR code</b> they can scan and redeem as many times as they like, so everyone knows exactly what it looks like before the first guest walks in.</p>
</td></tr>
<tr><td style="padding:14px 22px 4px"><div style="background:#1F1A15;color:#FBF4E4;border-radius:12px;padding:16px 18px;font-size:15px;line-height:1.55">
<div style="font-family:Courier,monospace;font-size:12px;font-weight:700;letter-spacing:1.5px;color:#F2B33D">WE'VE GOT YOUR BACK</div>
<p style="margin:8px 0 0">We're here to support you. If a guest is ever unhappy or gives your team a hard time, don't argue and don't eat the cost. Just let us know.</p>
<p style="margin:8px 0 0"><b>We'll refund their BiteBook and cover the cost of their meal. That part is on us.</b></p>
</div></td></tr>
<tr><td style="padding:14px 22px 22px;font-size:15px;line-height:1.55">
<p style="margin:0 0 12px">Same goes for anything else that goes sideways, like a page that won't load: honor it if it looks legit and let me know. ${contact ? esc(contact) + ' or ' : ''}email ${esc(SUPPORT_EMAIL)}.</p>
<p style="margin:0">Thanks for taking care of our BiteBookers. Let's have a great month.<br><br>Will<br><span style="color:#5E5246">Founder, BiteBook</span></p>
</td></tr>
<tr><td style="background:#1F1A15;color:#FBF4E4;padding:12px 22px;font-family:Courier,monospace;font-size:12px">getbitebook.com</td></tr>
</table></td></tr></table></body></html>`;
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: FROM_EMAIL, to, reply_to: SUPPORT_EMAIL, subject, html,
      attachments: [{ filename: `BiteBook-Staff-Guide-${r.name.replace(/[^A-Za-z0-9]+/g, '-')}.pdf`, content: Buffer.from(pdf).toString('base64') }],
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Resend failed (${res.status}): ${JSON.stringify(json).slice(0, 300)}`);
  return json;
}

// "You're in!" email right after a Stripe purchase, for events that haven't started yet.
// The passports themselves are emailed at kickoff (admin send action with &event=<id>).
export async function sendPurchaseConfirmation({ to, name, ev, city, quantity, amountCents }) {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error('RESEND_API_KEY is not set');
  const many = quantity > 1;
  const paid = `$${(Number(amountCents || 0) / 100).toFixed(2)}`;
  const subject = `You're in for ${ev.name}! ${ev.emoji}`;
  const html = `<!doctype html><html><body style="margin:0;background:#FBF4E4;font-family:Helvetica,Arial,sans-serif;color:#1F1A15">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FBF4E4"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#FFFDF7;border:2px solid #1F1A15;border-radius:14px;overflow:hidden">
  <tr><td style="background:#1F1A15;padding:16px 22px;color:#FBF4E4;font-size:22px;font-weight:800">BiteBook
    <span style="float:right;color:#F2B33D;font-family:Courier,monospace;font-size:12px;letter-spacing:1.5px;line-height:30px">${esc(ev.name.toUpperCase())}</span></td></tr>
  <tr><td style="padding:26px 22px 8px">
    <div style="font-size:26px;font-weight:800;line-height:1.15">You're in, ${esc(firstName(name))}!</div>
    <p style="font-size:16px;line-height:1.5;margin:14px 0 6px">Thanks for getting ${many ? `<b>${quantity} ${esc(ev.name)} passports</b>` : `your <b>${esc(ev.name)} passport</b>`} for <b>${esc(city.name)}</b>. You're supporting local restaurants, and we can't wait for you to dig in.</p>
  </td></tr>
  <tr><td style="padding:10px 22px 4px">
    <div style="background:#F2B33D;border:2px solid #1F1A15;border-radius:12px;padding:14px 16px;font-size:15px;line-height:1.55">
      <div style="font-family:Courier,monospace;font-size:12px;font-weight:700;letter-spacing:1.5px">WHAT HAPPENS NEXT</div>
      Your passport${many ? 's' : ''} will arrive in this inbox when ${esc(ev.name)} kicks off on <b>${esc(ev.startLabel)}</b>, with every restaurant and its deal. Coupons work <b>${esc(ev.datesLabel)}</b>.
    </div>
  </td></tr>
  <tr><td style="padding:14px 22px 22px;font-size:14px;line-height:1.55;color:#5E5246">
    Order total: <b>${paid}</b> for ${quantity} passport${many ? 's' : ''}.<br><br>
    Questions? Just reply to this email or write to ${esc(SUPPORT_EMAIL)}.
  </td></tr>
  <tr><td style="background:#1F1A15;color:#FBF4E4;padding:12px 22px;font-family:Courier,monospace;font-size:12px">getbitebook.com</td></tr>
</table></td></tr></table></body></html>`;
  const text = [
    `You're in, ${firstName(name)}!`, '',
    `Thanks for getting ${many ? `${quantity} ${ev.name} passports` : `your ${ev.name} passport`} for ${city.name}.`,
    `Your passport${many ? 's' : ''} will arrive in this inbox when ${ev.name} kicks off on ${ev.startLabel}. Coupons work ${ev.datesLabel}.`, '',
    `Order total: ${paid} for ${quantity} passport${many ? 's' : ''}.`,
    `Questions? Reply to this email or write to ${SUPPORT_EMAIL}.`,
  ].join('\n');
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM_EMAIL, to: [to], reply_to: SUPPORT_EMAIL, subject, html, text }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Resend failed (${res.status}): ${JSON.stringify(json).slice(0, 300)}`);
  return json;
}

// Reminder for someone who started checkout, entered their email, opted in to marketing, and didn't finish.
export async function sendCheckoutReminder({ to, name, ev, city, url }) {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error('RESEND_API_KEY is not set');
  const subject = `Still want your ${ev.name} passport? ${ev.emoji}`;
  const html = `<!doctype html><html><body style="margin:0;background:#FBF4E4;font-family:Helvetica,Arial,sans-serif;color:#1F1A15">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FBF4E4"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#FFFDF7;border:2px solid #1F1A15;border-radius:14px;overflow:hidden">
  <tr><td style="background:#1F1A15;padding:16px 22px;color:#FBF4E4;font-size:22px;font-weight:800">BiteBook
    <span style="float:right;color:#F2B33D;font-family:Courier,monospace;font-size:12px;letter-spacing:1.5px;line-height:30px">${esc(ev.name.toUpperCase())}</span></td></tr>
  <tr><td style="padding:26px 22px 8px">
    <div style="font-size:24px;font-weight:800;line-height:1.2">Hey ${esc(firstName(name))}, you were so close!</div>
    <p style="font-size:16px;line-height:1.5;margin:14px 0">Your ${esc(ev.name)} passport for <b>${esc(city.name)}</b> is still waiting: ${esc(ev.food)} deals at local spots across ${esc(city.area)}, ${esc(ev.datesLabel)}.</p>
  </td></tr>
  <tr><td style="padding:6px 22px 18px">
    <a href="${url}" style="display:block;background:#C8371D;color:#ffffff;text-decoration:none;font-weight:700;font-size:18px;text-align:center;padding:16px;border-radius:12px;border:2px solid #1F1A15">Finish getting my passport →</a>
  </td></tr>
  <tr><td style="padding:0 22px 22px;font-size:14px;line-height:1.55;color:#5E5246">
    Not happy for any reason? Full refund, no hassle. Questions? Just reply to this email.
  </td></tr>
  <tr><td style="background:#1F1A15;color:#FBF4E4;padding:12px 22px;font-family:Courier,monospace;font-size:12px">getbitebook.com</td></tr>
</table></td></tr></table></body></html>`;
  const text = `Hey ${firstName(name)}, you were so close!\n\nYour ${ev.name} passport for ${city.name} is still waiting.\nFinish here: ${url}\n\nNot happy for any reason? Full refund, no hassle. Questions? Reply to this email.`;
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM_EMAIL, to: [to], reply_to: SUPPORT_EMAIL, subject, html, text }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Resend failed (${res.status}): ${JSON.stringify(json).slice(0, 300)}`);
  return json;
}
