import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { qrMatrix } from './qr.js';
import { CITIES, EVENT, SITE_URL, SUPPORT_EMAIL } from './config.js';
import { restaurantById, UNIVERSAL_TERMS } from './restaurants.js';
import { passportLabel } from './passports.js';

// Phone-shaped pages so each page fills a phone screen
const W = 360;
const H = 640;
const M = 22; // side margin

const C = {
  ink: rgb(0x1f / 255, 0x1a / 255, 0x15 / 255),
  paper: rgb(0xfb / 255, 0xf4 / 255, 0xe4 / 255),
  white: rgb(1, 1, 1),
  stub: rgb(0xff / 255, 0xfd / 255, 0xf7 / 255),
  mustard: rgb(0xf2 / 255, 0xb3 / 255, 0x3d / 255),
  red: rgb(0xc8 / 255, 0x37 / 255, 0x1d / 255),
  muted: rgb(0x5e / 255, 0x52 / 255, 0x46 / 255),
};

// Standard PDF fonts only cover basic Western characters; swap anything else
function safe(s) {
  return String(s ?? '')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/–|—/g, '-')
    .replace(/…/g, '...')
    .replace(/[^\x20-\x7E -ÿ•]/g, '');
}

function wrap(text, font, size, maxWidth) {
  const words = safe(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (font.widthOfTextAtSize(test, size) <= maxWidth) line = test;
    else {
      if (line) lines.push(line);
      line = w;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export async function buildPassportPdf({ passport, coupons, siteUrl = SITE_URL }) {
  const city = CITIES[passport.city];
  const doc = await PDFDocument.create();
  doc.setTitle(`BiteBook ${EVENT.name} Passport - ${city.name}`);
  doc.setAuthor('BiteBook');

  const F = {
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
    reg: await doc.embedFont(StandardFonts.Helvetica),
    mono: await doc.embedFont(StandardFonts.Courier),
    monoBold: await doc.embedFont(StandardFonts.CourierBold),
  };

  const text = (page, str, x, y, font, size, color = C.ink) =>
    page.drawText(safe(str), { x, y, font, size, color });
  const textRight = (page, str, xRight, y, font, size, color = C.ink) => {
    const s = safe(str);
    page.drawText(s, { x: xRight - font.widthOfTextAtSize(s, size), y, font, size, color });
  };
  const textCenter = (page, str, y, font, size, color = C.ink) => {
    const s = safe(str);
    page.drawText(s, { x: (W - font.widthOfTextAtSize(s, size)) / 2, y, font, size, color });
  };
  // Draw wrapped lines; returns the y below the last line
  const para = (page, str, x, y, font, size, maxW, color = C.ink, lh = 1.3) => {
    for (const ln of wrap(str, font, size, maxW)) {
      page.drawText(ln, { x, y: y - size, font, size, color });
      y -= size * lh;
    }
    return y;
  };

  const items = coupons
    .map((c) => ({ coupon: c, r: restaurantById(c.restaurant_id) }))
    .filter((x) => x.r && x.r.active)
    .sort((a, b) => a.r.name.localeCompare(b.r.name));

  const holder = passport.name ? safe(passport.name).trim() : '';
  const label = passportLabel(passport.id);
  const firstCouponPage = 5;

  // ---------- Page 1: cover ----------
  {
    const p = doc.addPage([W, H]);
    p.drawRectangle({ x: 0, y: 0, width: W, height: H, color: C.ink });
    p.drawRectangle({ x: 14, y: 14, width: W - 28, height: H - 28, borderColor: C.mustard, borderWidth: 1.5 });
    textCenter(p, 'BITEBOOK', H - 70, F.monoBold, 12, C.mustard);
    textCenter(p, 'BURGER', H - 170, F.bold, 58, C.paper);
    textCenter(p, 'BLASTOFF', H - 228, F.bold, 58, C.paper);
    p.drawRectangle({ x: 70, y: H - 290, width: W - 140, height: 34, color: C.mustard });
    textCenter(p, city.name.toUpperCase(), H - 279, F.bold, 18, C.ink);
    textCenter(p, EVENT.datesLabel.toUpperCase(), H - 330, F.monoBold, 12, C.paper);
    textCenter(p, `${items.length} RESTAURANTS · ONE PASSPORT`, H - 352, F.mono, 10, C.mustard);
    p.drawLine({ start: { x: 60, y: 190 }, end: { x: W - 60, y: 190 }, thickness: 1, color: C.mustard, dashArray: [4, 3] });
    textCenter(p, 'OFFICIAL PASSPORT', 160, F.monoBold, 10, C.mustard);
    if (holder) textCenter(p, holder, 132, F.bold, 18, C.paper);
    textCenter(p, `PASSPORT ${label}`, holder ? 108 : 132, F.mono, 10, C.paper);
    textCenter(p, 'getbitebook.com', 48, F.mono, 9, C.mustard);
  }

  // ---------- Page 2: how to redeem ----------
  {
    const p = doc.addPage([W, H]);
    p.drawRectangle({ x: 0, y: 0, width: W, height: H, color: C.paper });
    header(p, 'HOW IT WORKS');
    let y = H - 70;
    y = para(p, `Welcome to ${EVENT.name}, ${city.name}!`, M, y, F.bold, 20, W - 2 * M);
    y -= 4;
    y = para(p, `This passport gets you a burger deal at every restaurant inside, one time each, from ${EVENT.datesLabel}.`, M, y, F.reg, 11, W - 2 * M, C.ink, 1.4);
    y -= 14;
    text(p, 'HOW TO REDEEM', M, y - 9, F.monoBold, 9.5, C.red);
    y -= 22;
    const steps = [
      ['1', 'Tell your server up front', 'When you sit down, let them know: "I have a BiteBook coupon." Before you order is best.'],
      ['2', "Open that restaurant's page", `Find it in this passport (the full lineup is on page ${firstCouponPage - 1}).`],
      ['3', 'Show them the QR code', 'It\'s at the bottom of the page. Your server scans it with their phone camera, then taps the big Redeem button. About 10 seconds.'],
      ['4', 'Enjoy your burger', "That coupon is now used up. On to the next spot!"],
    ];
    for (const [n, title, body] of steps) {
      p.drawCircle({ x: M + 12, y: y - 10, size: 12, color: C.mustard, borderColor: C.ink, borderWidth: 1.2 });
      text(p, n, M + 8.5, y - 14.5, F.bold, 12);
      text(p, title, M + 34, y - 12, F.bold, 12.5);
      y = para(p, body, M + 34, y - 18, F.reg, 10, W - 2 * M - 34, C.muted, 1.35);
      y -= 10;
    }
    y -= 4;
    // Help-your-server tip
    const tip = "Server not sure what to do? Point them to the \"For staff only\" box at the bottom of the coupon page. The instructions are right there. Please don't scan your own codes; leave that to your server.";
    const tipLines = wrap(tip, F.reg, 9.5, W - 2 * M - 28);
    const tipH = 30 + tipLines.length * 9.5 * 1.35 + 8;
    p.drawRectangle({ x: M, y: y - tipH, width: W - 2 * M, height: tipH, color: C.mustard, borderColor: C.ink, borderWidth: 1.2 });
    text(p, 'HELP YOUR SERVER HELP YOU', M + 14, y - 18, F.monoBold, 9);
    para(p, tip, M + 14, y - 26, F.reg, 9.5, W - 2 * M - 28, C.ink, 1.35);
    footer(p);
  }

  // ---------- Page 3: house rules ----------
  {
    const p = doc.addPage([W, H]);
    p.drawRectangle({ x: 0, y: 0, width: W, height: H, color: C.paper });
    header(p, 'HOUSE RULES');
    let y = H - 70;
    y = para(p, 'Be a good BiteBooker', M, y, F.bold, 24, W - 2 * M);
    y -= 2;
    y = para(p, 'BiteBook only works because local restaurants are generous enough to take part. Treat them well and we\'ll keep bringing more deals, more restaurants and more events to your area, month after month.', M, y, F.reg, 10.5, W - 2 * M, C.ink, 1.4);
    y -= 12;
    const rules = [
      ['Be kind, patient and courteous.', 'Your server is helping make this happen. A little grace goes a long way.'],
      ['Tip generously.', 'Tip on the full value of your meal, including the free item.'],
      ['Extras cost extra.', 'Add-ons, toppings, upgrades and substitutions are charged as usual.'],
      ['Tax still applies.', 'Expect normal tax on everything else you order.'],
      ['Read the deal first.', 'Each coupon requires the purchase listed on its page, and some are dine-in only or have set hours.'],
      ['One coupon, one time.', 'Each coupon works once. No screenshots or sharing.'],
      ['Something wrong? Email us.', `Please don't argue with staff. Write to ${SUPPORT_EMAIL} and we'll make it right.`],
    ];
    const rulesH = 22 + rules.reduce((s, [, b]) => s + 13 + wrap(b, F.reg, 9.3, W - 2 * M - 40).length * 9.3 * 1.35 + 6, 0) + 6;
    p.drawRectangle({ x: M, y: y - rulesH, width: W - 2 * M, height: rulesH, color: C.stub, borderColor: C.ink, borderWidth: 1.2 });
    let ry = y - 14;
    for (const [title, body] of rules) {
      text(p, '•', M + 14, ry - 11, F.bold, 11, C.red);
      text(p, title, M + 26, ry - 11, F.bold, 10.5);
      ry = para(p, body, M + 26, ry - 14, F.reg, 9.3, W - 2 * M - 40, C.muted, 1.35);
      ry -= 6;
    }
    y -= rulesH + 12;
    y = para(p, 'Restaurants can decline coupons that don\'t follow these rules. Good BiteBookers keep the deals coming for everyone. Thanks for being one.', M, y, F.bold, 10, W - 2 * M, C.ink, 1.4);
    y -= 6;
    para(p, `Coupons work ${EVENT.datesLabel}. We're adding restaurants all month; open your passport link from our email anytime for the latest lineup.`, M, y, F.reg, 9, W - 2 * M, C.muted, 1.4);
    footer(p);
  }

  // ---------- Page 4: lineup ----------
  {
    const p = doc.addPage([W, H]);
    p.drawRectangle({ x: 0, y: 0, width: W, height: H, color: C.paper });
    header(p, 'THE LINEUP');
    let y = H - 72;
    text(p, `${city.name} restaurants`, M, y - 18, F.bold, 20);
    y -= 40;
    const rowH = Math.min(34, (y - 70) / Math.max(items.length, 1));
    const nameSize = rowH < 28 ? 10 : 11;
    items.forEach(({ r }, i) => {
      const pg = String(firstCouponPage + i);
      text(p, safe(r.name), M, y - nameSize, F.bold, nameSize);
      textRight(p, `p. ${pg}`, W - M, y - nameSize, F.mono, 9, C.muted);
      const dealLine = wrap(r.deal.toLowerCase().replace(/^\w/, (c) => c.toUpperCase()), F.reg, 8.5, W - 2 * M - 40)[0] || '';
      text(p, dealLine, M, y - nameSize - 11, F.reg, 8.5, C.muted);
      p.drawLine({ start: { x: M, y: y - rowH + 3 }, end: { x: W - M, y: y - rowH + 3 }, thickness: 0.5, color: C.muted, dashArray: [2, 2] });
      y -= rowH;
    });
    footer(p);
  }

  // ---------- Coupon pages ----------
  items.forEach(({ coupon, r }, i) => {
    const p = doc.addPage([W, H]);
    p.drawRectangle({ x: 0, y: 0, width: W, height: H, color: C.paper });
    // header bar
    p.drawRectangle({ x: 0, y: H - 34, width: W, height: 34, color: C.ink });
    text(p, 'BiteBook', M, H - 23, F.bold, 14, C.paper);
    text(p, `${EVENT.name.toUpperCase()} · ${city.name.toUpperCase()}`, M + 70, H - 21.5, F.mono, 7.5, C.mustard);
    textRight(p, `No. ${String(i + 1).padStart(2, '0')}/${String(items.length).padStart(2, '0')}`, W - M, H - 21.5, F.mono, 7.5, C.paper);

    let y = H - 52;
    y = para(p, r.name, M, y, F.bold, 22, W - 2 * M, C.ink, 1.1);
    y -= 2;
    y = para(p, r.address, M, y, F.mono, 8.5, W - 2 * M, C.muted, 1.35);
    y -= 10;

    // Deal box
    const dealLines = wrap(r.deal, F.bold, 21, W - 2 * M - 28);
    const condLines = wrap(r.condition, F.reg, 10.5, W - 2 * M - 28);
    const boxH = 22 + dealLines.length * 22 + condLines.length * 13.5 + 12;
    p.drawRectangle({ x: M, y: y - boxH, width: W - 2 * M, height: boxH, color: C.mustard, borderColor: C.ink, borderWidth: 1.5 });
    let by = y - 16;
    text(p, 'YOUR DEAL', M + 14, by, F.monoBold, 8);
    by -= 6;
    for (const ln of dealLines) { by -= 21; text(p, ln, M + 14, by, F.bold, 21); }
    by -= 6;
    for (const ln of condLines) { by -= 12.5; text(p, ln, M + 14, by, F.reg, 10.5); by -= 1; }
    y -= boxH + 10;

    // Terms box
    const terms = [...r.terms, ...UNIVERSAL_TERMS];
    const termLines = terms.map((t) => wrap(t, F.reg, 8.8, W - 2 * M - 40));
    const termsH = 40 + termLines.reduce((s, l) => s + l.length * 11.5, 0) + 4;
    p.drawRectangle({ x: M, y: y - termsH, width: W - 2 * M, height: termsH, color: C.stub, borderColor: C.ink, borderWidth: 1 });
    let ty = y - 15;
    text(p, 'TERMS', M + 12, ty, F.monoBold, 8);
    textRight(p, `VALID ${EVENT.datesLabel.toUpperCase()} ONLY`, W - M - 12, ty, F.bold, 8.5, C.red);
    ty -= 7;
    p.drawLine({ start: { x: M + 12, y: ty }, end: { x: W - M - 12, y: ty }, thickness: 0.7, color: C.ink, dashArray: [3, 2] });
    ty -= 4;
    termLines.forEach((lines) => {
      text(p, '•', M + 12, ty - 9.5, F.bold, 9);
      for (const ln of lines) { ty -= 11.5; text(p, ln, M + 24, ty + 2, F.reg, 8.8); }
    });

    // Friendly prompt in the open space above the stub
    const stubTop = 196;
    const termsBottom = y - termsH;
    if (termsBottom - stubTop > 40) {
      const my = stubTop + (termsBottom - stubTop) / 2;
      textCenter(p, 'SHOW THIS PAGE TO YOUR SERVER', my + 2, F.monoBold, 9, C.muted);
      textCenter(p, 'when you order', my - 12, F.mono, 8.5, C.muted);
    }

    // Staff stub
    p.drawLine({ start: { x: 0, y: stubTop }, end: { x: W, y: stubTop }, thickness: 1.5, color: C.ink, dashArray: [6, 4] });
    p.drawRectangle({ x: 0, y: 22, width: W, height: stubTop - 23, color: C.stub });
    const qrSize = 132;
    const qx = W - M - qrSize;
    const qy = 38;
    drawQr(p, `${siteUrl}/r/${coupon.token}`, qx, qy, qrSize);
    let sy = stubTop - 20;
    text(p, 'FOR STAFF ONLY', M, sy, F.monoBold, 8.5, C.red);
    sy -= 6;
    sy = para(p, 'Server: scan with your phone camera, then tap Redeem.', M, sy, F.bold, 12.5, qx - M - 12, C.ink, 1.2);
    sy -= 6;
    sy = para(p, "Guests: please don't scan this yourself - just show it to your server.", M, sy, F.reg, 9, qx - M - 12, C.muted, 1.35);
    sy -= 8;
    if (holder) sy = para(p, `ISSUED TO ${holder.toUpperCase()}`, M, sy, F.mono, 7.5, qx - M - 12, C.muted, 1.3);
    para(p, `PASSPORT ${label}`, M, sy, F.mono, 7.5, qx - M - 12, C.muted, 1.3);

    footer(p);
  });

  return doc.save();

  function header(p, title) {
    p.drawRectangle({ x: 0, y: H - 34, width: W, height: 34, color: C.ink });
    text(p, 'BiteBook', M, H - 23, F.bold, 14, C.paper);
    textRight(p, `${title} · ${city.name.toUpperCase()}`, W - M, H - 21.5, F.mono, 7.5, C.mustard);
  }
  function footer(p) {
    p.drawRectangle({ x: 0, y: 0, width: W, height: 22, color: C.ink });
    text(p, `Questions? ${SUPPORT_EMAIL}`, M, 8, F.mono, 7.5, C.paper);
    textRight(p, 'getbitebook.com', W - M, 8, F.mono, 7.5, C.paper);
  }
  function drawQr(p, url, x, y, size) {
    const m = qrMatrix(url);
    const n = m.length;
    const quiet = 3;
    const cell = size / (n + quiet * 2);
    p.drawRectangle({ x, y, width: size, height: size, color: C.white, borderColor: C.ink, borderWidth: 1.2 });
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (!m[r][c]) continue;
        // extend right while dark to reduce rectangles
        let run = 1;
        while (c + run < n && m[r][c + run]) run++;
        p.drawRectangle({
          x: x + (quiet + c) * cell,
          y: y + size - (quiet + r + 1) * cell,
          width: run * cell + 0.05,
          height: cell + 0.05,
          color: C.ink,
        });
        c += run - 1;
      }
    }
  }
}
