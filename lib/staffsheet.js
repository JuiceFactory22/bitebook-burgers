// One-page printable front-of-house guide for a restaurant (US Letter)
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { qrMatrix } from './qr.js';
import { EVENT, SITE_URL, SUPPORT_EMAIL, CITIES } from './config.js';
import { UNIVERSAL_TERMS } from './restaurants.js';

const W = 612, H = 792, M = 40;
const C = {
  ink: rgb(0x1f / 255, 0x1a / 255, 0x15 / 255),
  paper: rgb(0xfb / 255, 0xf4 / 255, 0xe4 / 255),
  white: rgb(1, 1, 1),
  stub: rgb(0xff / 255, 0xfd / 255, 0xf7 / 255),
  mustard: rgb(0xf2 / 255, 0xb3 / 255, 0x3d / 255),
  red: rgb(0xc8 / 255, 0x37 / 255, 0x1d / 255),
  green: rgb(0x1f / 255, 0x6b / 255, 0x3a / 255),
  muted: rgb(0x5e / 255, 0x52 / 255, 0x46 / 255),
};
const safe = (s) => String(s ?? '').replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
  .replace(/–|—/g, '-').replace(/[^\x20-\x7E -ÿ•]/g, '');
function wrap(text, font, size, maxW) {
  const out = []; let line = '';
  for (const w of safe(text).split(/\s+/).filter(Boolean)) {
    const t = line ? line + ' ' + w : w;
    if (font.widthOfTextAtSize(t, size) <= maxW) line = t; else { if (line) out.push(line); line = w; }
  }
  if (line) out.push(line);
  return out;
}

export async function buildStaffSheet(r, { contact = '' } = {}) {
  const doc = await PDFDocument.create();
  doc.setTitle(`BiteBook staff guide - ${r.name}`);
  const F = {
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
    reg: await doc.embedFont(StandardFonts.Helvetica),
    mono: await doc.embedFont(StandardFonts.CourierBold),
  };
  const p = doc.addPage([W, H]);
  const txt = (s, x, y, f, sz, c = C.ink) => p.drawText(safe(s), { x, y, font: f, size: sz, color: c });
  const para = (s, x, y, f, sz, maxW, c = C.ink, lh = 1.3) => {
    for (const ln of wrap(s, f, sz, maxW)) { p.drawText(ln, { x, y: y - sz, font: f, size: sz, color: c }); y -= sz * lh; }
    return y;
  };

  p.drawRectangle({ x: 0, y: 0, width: W, height: H, color: C.paper });
  // Header
  p.drawRectangle({ x: 0, y: H - 74, width: W, height: 74, color: C.ink });
  txt('BiteBook', M, H - 44, F.bold, 26, C.paper);
  txt(`${EVENT.name.toUpperCase()} · STAFF GUIDE`, M, H - 62, F.mono, 9, C.mustard);
  const right = `${EVENT.datesLabel.toUpperCase()}`;
  txt(right, W - M - F.mono.widthOfTextAtSize(right, 11), H - 46, F.mono, 11, C.paper);

  let y = H - 100;
  y = para(r.name, M, y, F.bold, 26, W - 2 * M, C.ink, 1.1);
  y = para(r.address, M, y - 2, F.reg, 10, W - 2 * M, C.muted);
  y -= 10;

  // Offer box
  const terms = [...r.terms];
  const dealLines = wrap(r.deal, F.bold, 20, W - 2 * M - 30);
  const condLines = wrap(r.condition, F.reg, 11.5, W - 2 * M - 30);
  const termLine = terms.length ? terms.join('  ·  ') : '';
  const boxH = 26 + dealLines.length * 22 + condLines.length * 15 + (termLine ? 20 : 0) + 12;
  p.drawRectangle({ x: M, y: y - boxH, width: W - 2 * M, height: boxH, color: C.mustard, borderColor: C.ink, borderWidth: 1.6 });
  let by = y - 18;
  txt('YOUR BITEBOOK OFFER', M + 15, by, F.mono, 9);
  by -= 4;
  for (const l of dealLines) { by -= 22; txt(l, M + 15, by, F.bold, 20); }
  by -= 4;
  for (const l of condLines) { by -= 15; txt(l, M + 15, by, F.reg, 11.5); }
  if (termLine) { by -= 18; txt(termLine, M + 15, by, F.bold, 10); }
  y -= boxH + 18;

  // Steps (left) + practice QR (right)
  const colW = 330;
  txt('HOW TO REDEEM  (ABOUT 10 SECONDS)', M, y - 10, F.mono, 10, C.red);
  let sy = y - 26;
  const steps = [
    ['Guest says "I have a BiteBook coupon"', `They show the ${r.name} page of their digital passport on their phone.`],
    ['Scan the QR code with YOUR phone camera', 'Any phone camera works. No app, no login.'],
    ['Check the screen', `It should say ${r.name} and "VALID - NOT YET USED."`],
    ['Tap the big red REDEEM button', 'Green "Redeemed!" = honor the deal. Ring it up as a comp labeled "BiteBook."'],
  ];
  steps.forEach(([t, b], i) => {
    p.drawCircle({ x: M + 12, y: sy - 8, size: 11.5, color: C.mustard, borderColor: C.ink, borderWidth: 1.2 });
    txt(String(i + 1), M + 8.6, sy - 12.5, F.bold, 12);
    txt(t, M + 32, sy - 10, F.bold, 11.5);
    sy = para(b, M + 32, sy - 15, F.reg, 10, colW - 32, C.muted, 1.3) - 9;
  });

  // Practice QR
  const qx = M + colW + 26, qw = W - M - qx;
  const qTop = y - 4;
  const qrBox = Math.min(qw - 28, 116);
  txt('PRACTICE COUPON', qx + 14, qTop - 20, F.mono, 9, C.green);
  const textBottom = para('Train your team on this one. Scan + tap as often as you like; nothing gets used up.', qx + 14, qTop - 26, F.reg, 9, qw - 28, C.muted, 1.3);
  const qy = textBottom - 8 - qrBox;
  const boxBottom = Math.min(sy + 4, qy - 14);
  p.drawRectangle({ x: qx, y: boxBottom, width: qw, height: qTop - boxBottom, borderColor: C.ink, borderWidth: 1.2 });
  txt('PRACTICE COUPON', qx + 14, qTop - 20, F.mono, 9, C.green);
  const m = qrMatrix(`${SITE_URL}/r/demo-${r.id}`);
  const n = m.length, quiet = 2, cell = qrBox / (n + quiet * 2);
  sy = Math.min(sy, boxBottom - 4);
  p.drawRectangle({ x: qx + (qw - qrBox) / 2, y: qy, width: qrBox, height: qrBox, color: C.white });
  for (let rr = 0; rr < n; rr++) for (let cc = 0; cc < n; cc++) {
    if (!m[rr][cc]) continue;
    let run = 1; while (cc + run < n && m[rr][cc + run]) run++;
    p.drawRectangle({ x: qx + (qw - qrBox) / 2 + (quiet + cc) * cell, y: qy + qrBox - (quiet + rr + 1) * cell, width: run * cell + 0.05, height: cell + 0.05, color: C.ink });
    cc += run - 1;
  }
  y = sy - 10;

  // Do / Don't
  const half = (W - 2 * M - 14) / 2;
  const dos = ['Ask for the BiteBook coupon before the order is rung up', 'Charge normally for the required purchase, add-ons, toppings and tax', 'Check the screen says your restaurant before tapping', 'Honor it if the screen turns green'];
  const donts = ['Don\'t honor a red "Already redeemed" or "Not valid" screen', 'Don\'t accept a screenshot of a redeem page instead of a scan', "Don't argue at the table; if something's off, send it to us", 'Coupons work Oct 15 - Nov 15 only, one per passport'];
  const list = (title, items, x, color) => {
    let ly = y;
    txt(title, x, ly - 10, F.mono, 10, color);
    ly -= 20;
    for (const it of items) { txt('•', x, ly - 10, F.bold, 11, color); ly = para(it, x + 12, ly, F.reg, 10, half - 14, C.ink, 1.3) - 4; }
    return ly;
  };
  const l1 = list('DO', dos, M, C.green);
  const l2 = list("DON'T", donts, M + half + 14, C.red);
  y = Math.min(l1, l2) - 8;

  // Problems box
  const probs = [
    ["Page won't load / bad signal", 'Try once more on wifi. If it still fails, honor it if it looks legit and let us know.'],
    ['Guest scanned their own code by mistake', 'If it says "Already redeemed" moments ago, contact us. We can reset it in seconds.'],
  ];
  const boxTop = y;
  const bw = (W - 2 * M - 14) / 2;
  const inner = bw - 26;
  const probH = 30 + probs.reduce((s, [t, b]) => s + wrap(t, F.bold, 10.5, inner).length * 13 + wrap(b, F.reg, 9.5, inner).length * 12.4 + 8, 0);
  const backLines = [
    "If a guest is unhappy for any reason, don't argue and don't eat the cost. Just let us know.",
    "We'll refund their BiteBook and cover the cost of their meal. That part is on us.",
  ];
  const backH = 30 + backLines.reduce((s, b) => s + wrap(b, F.reg, 10, inner).length * 13 + 8, 0) + 4;
  const bottomH = Math.max(probH, backH);
  // Left: if something goes wrong
  p.drawRectangle({ x: M, y: boxTop - bottomH, width: bw, height: bottomH, color: C.stub, borderColor: C.ink, borderWidth: 1.2 });
  let py = boxTop - 18;
  txt('IF SOMETHING GOES WRONG', M + 13, py, F.mono, 9.5);
  py -= 6;
  for (const [t, b] of probs) {
    py = para(t, M + 13, py, F.bold, 10.5, inner, C.ink, 1.24);
    py = para(b, M + 13, py, F.reg, 9.5, inner, C.muted, 1.3) - 8;
  }
  // Right: we've got your back
  const bx = M + bw + 14;
  p.drawRectangle({ x: bx, y: boxTop - bottomH, width: bw, height: bottomH, color: C.ink });
  let gy = boxTop - 18;
  txt("WE'VE GOT YOUR BACK", bx + 13, gy, F.mono, 9.5, C.mustard);
  gy -= 6;
  backLines.forEach((b, i) => { gy = para(b, bx + 13, gy, i === 1 ? F.bold : F.reg, 10, inner, C.paper, 1.3) - 8; });

  // Footer
  p.drawRectangle({ x: 0, y: 0, width: W, height: 40, color: C.ink });
  const help = `Questions? ${contact ? contact + '  ·  ' : ''}${SUPPORT_EMAIL}`;
  txt(help, M, 15, F.mono, 10, C.paper);
  txt('getbitebook.com', W - M - F.mono.widthOfTextAtSize('getbitebook.com', 10), 15, F.mono, 10, C.mustard);
  return doc.save();
}
