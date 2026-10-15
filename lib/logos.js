// Finds each restaurant's logo from its own website (admin-only review tool).
// The server reads the restaurant's homepage and pulls likely logo images
// (og:image, icons, and <img> tags with "logo" in them), plus any known candidates below.

export const LOGO_SOURCES = {
  'nash-caney-fork': { site: 'https://www.caneyforkrestaurant.com/' },
  'nash-caddy-briley': { site: '' },
  'nash-caddy-downtown': { site: '' },
  'nash-fozzys-franklin': { site: 'https://fozzysfranklin.net/', urls: ['https://fozzysfranklin.net/wp-content/uploads/2024/10/Fozzys-Logo-On-White.png'] },
  'nash-fozzys-spring-hill': { site: 'https://fozzysspringhill.net/', urls: ['https://fozzys.net/wp-content/uploads/2019/09/Fozzys-Logo-On-White-300x223.png'] },
  'nash-little-bite': { site: 'http://www.littlebiteofeverything.com/', urls: ['https://static.spotapps.co/website_images/ab_websites/502551_website_v1/logo.png'] },
  'nash-twisted-fork': { site: 'https://www.twistedforktn.com/' },
  'nash-edessa': { site: 'https://edessaburgerpizza.com/', urls: ['https://edessaburgerpizza.com/wp-content/uploads/2023/06/edessa.svg'] },
  'nash-chefs-market': { site: 'https://www.chefsmarket.com/' },
  'nash-sticky-rice': { site: 'https://www.stickyriceexpresscafe.com/', urls: ['https://www.stickyriceexpresscafe.com/airo-assets/images/logo/horizontal'] },
  'nash-makeshift': { site: 'https://www.makeshiftnashville.co/', urls: ['https://popmenucloud.com/uopikwhv/4c02d339-7af5-4695-8697-79ae86daba07.png'] },
  'nash-uncle-lennys': { site: 'https://unclelennyscountrycafe.com/', urls: ['https://unclelennyscountrycafe.com/pluto-images/funnel/images/a8768045-0953-4e72-8fa1-32e23bd3e49e'] },
  'nash-fat-mos-east': { site: 'https://fatmosno1.shop/' },
  'phx-happys': { site: 'https://happyshamburgers.com/', urls: ['https://happyshamburgers.com/wp-content/uploads/2022/09/Happys-Hamburgers-Logo-2022.png', 'https://happyshamburgers.com/wp-content/uploads/2019/01/logo_happys-1.png'] },
  'phx-jims': { site: 'https://jimsburgersaz.com/', urls: ['https://jimsburgersaz.com/pluto-images/funnel/images/92217096-8da4-4c2a-89a2-1382861dda78'] },
  'phx-frashers': { site: 'https://frasherstavern.com/', urls: ['https://static.wixstatic.com/media/37ef22_6b6f96e996fb494abfb44a5981d55dcb~mv2.png'] },
  'phx-culinary-gangster': { site: 'https://culinarygangsterusa.com/scottsdale', urls: ['https://culinarygangsterusa.com/pluto-images/63eed2c2-ca18-49ca-8533-e10f6e79d784.png'] },
  'phx-blu': { site: 'https://www.bluburgergrille.com/' },
  'phx-roadrunner': { site: 'http://www.roadrunnerrestaurantandsaloon.com/', urls: ['https://static.wixstatic.com/media/326e1b_bf800536db7045a48d3e53fa411d6678~mv2.png'] },
  'phx-stumblinas': { site: 'http://stumblinascantinaaz.com/', urls: ['https://static.spotapps.co/web/stumblinascantinaaz--com/custom/logo.png'] },
  'phx-copper-bull': { site: 'http://copperbullcc.com/', urls: ['https://static.spotapps.co/website_images/ab_websites/206219_website_v1/bull_logo.png'] },
  'phx-coyote-den': { site: 'https://coyotedensaloon0994.s4shops.com/', urls: ['https://cdn01.s4shops.com/skytabweb/uploads/ea0ddb90-d90d-f111-a69a-000d3ae51c49/d477d110-6168-f111-8fcb-000d3a7b73be.jpg'] },
  'phx-patties': { site: 'http://pattiespintsandpizzas.com/', urls: ['https://static.spotapps.co/web/pattiespintsandpizzas--com/custom/logo_new.png'] },
  'phx-detroit-coney': { site: 'http://detroitconeygrill.com/', urls: ['https://detroitconeygrill.com/wp-content/uploads/2025/01/detroitconeygrill__1_-removebg-preview.png', 'https://detroitconeygrill.com/wp-content/uploads/2025/01/Heading-1.png'] },
};

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128 Safari/537.36';

async function get(url, ms = 8000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    return await fetch(url, { headers: { 'User-Agent': UA, Accept: '*/*' }, redirect: 'follow', signal: ctl.signal });
  } finally { clearTimeout(t); }
}

function abs(u, base) {
  try { return new URL(u.replace(/&amp;/g, '&'), base).href; } catch { return null; }
}

// Pull likely logo URLs out of a homepage's HTML.
function extract(html, base) {
  const out = [];
  const push = (u) => { const a = u && abs(u, base); if (a && !a.startsWith('data:')) out.push(a); };
  for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
    const tag = m[0];
    if (!/logo/i.test(tag)) continue;
    const src = (tag.match(/\b(?:data-src|src)=["']([^"']+)["']/i) || [])[1];
    push(src);
  }
  for (const m of html.matchAll(/<meta\b[^>]*(?:og:image|twitter:image)[^>]*>/gi)) {
    push((m[0].match(/content=["']([^"']+)["']/i) || [])[1]);
  }
  for (const m of html.matchAll(/<link\b[^>]*rel=["'][^"']*(?:apple-touch-icon|icon)[^"']*["'][^>]*>/gi)) {
    push((m[0].match(/href=["']([^"']+)["']/i) || [])[1]);
  }
  return out;
}

// Returns [{ url, ok, type, bytes, note }] for one restaurant.
export async function findLogos(id) {
  const src = LOGO_SOURCES[id] || {};
  const found = [...(src.urls || [])];
  let note = '';
  if (src.site) {
    try {
      const r = await get(src.site);
      if (r.ok) found.push(...extract(await r.text(), r.url || src.site));
      else note = `website returned ${r.status}`;
    } catch (e) { note = 'website did not load'; }
  } else note = 'no website';
  const uniq = [...new Set(found)].slice(0, 6);
  const checked = await Promise.all(uniq.map(async (url) => {
    try {
      const r = await get(url);
      const type = (r.headers.get('content-type') || '').split(';')[0];
      const buf = r.ok ? await r.arrayBuffer() : null;
      return { url, ok: r.ok && /^image\//.test(type), type, bytes: buf ? buf.byteLength : 0 };
    } catch { return { url, ok: false, type: '', bytes: 0 }; }
  }));
  return { note, logos: checked.filter((c) => c.ok) };
}

// Fetch one image for display/download through our own domain.
export async function proxyImage(url) {
  const r = await get(url, 10000);
  const type = (r.headers.get('content-type') || '').split(';')[0];
  if (!r.ok || !/^image\//.test(type)) return null;
  return { type, body: Buffer.from(await r.arrayBuffer()) };
}
