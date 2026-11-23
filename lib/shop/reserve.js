// The restaurant "Save your spot" page (/reserve, /reserve?city=Nashville).
// The page itself lives in /reserve-page.html. It's served from here only so the
// link preview (the picture shown when the link is texted or DM'd) can be the
// right city's image — a plain HTML file can't change based on ?city=.
import { readFileSync } from 'node:fs';

const WWW = 'https://www.getbitebook.com';
const CITIES = { denver: 'Denver', nashville: 'Nashville', phoenix: 'Phoenix' };

let PAGE = null;
function page() {
  if (PAGE === null) PAGE = readFileSync(new URL('../../reserve-page.html', import.meta.url), 'utf8');
  return PAGE;
}

export default function reserve(req, res) {
  let html = page();
  const raw = String(req.query.city || '');
  const id = raw.toLowerCase().trim();
  if (CITIES[id]) {
    const name = CITIES[id];
    html = html
      .replaceAll(`${WWW}/brand/og-reserve.png`, `${WWW}/brand/og-reserve-${id}.png`)
      .replace('content="Save Your Spot · Wing Month · BiteBook"', `content="Save Your Spot · Wing Month · ${name} · BiteBook"`)
      .replace(`content="${WWW}/reserve"`, `content="${WWW}/reserve?city=${encodeURIComponent(name)}"`);
  }
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=86400');
  res.status(200).send(html);
}
