// Live restaurant data from the BiteBook Backend sheet (Restaurants tab).
// Read through a small Apps Script feed ("BiteBook Website Feed", owned by Sam) that returns only the public
// columns. Vercel env: SHEET_FEED_URL (the /exec link) + SHEET_FEED_TOKEN (its access code).
// Cached for 5 minutes. If the feed is missing or down, callers fall back to the hand-kept lists.

const TTL_MS = 5 * 60 * 1000;
let cache = { at: 0, rows: null };

export async function sheetRows() {
  const url = process.env.SHEET_FEED_URL;
  const token = process.env.SHEET_FEED_TOKEN;
  if (!url || !token) return null;
  if (cache.rows && Date.now() - cache.at < TTL_MS) return cache.rows;
  try {
    const r = await fetch(`${url}?token=${encodeURIComponent(token)}`, { signal: AbortSignal.timeout(4000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    if (!Array.isArray(data.restaurants)) throw new Error(data.error || 'bad feed');
    cache = { at: Date.now(), rows: data.restaurants };
  } catch (e) {
    console.error('sheet feed:', e.message || e);
    if (cache.rows) cache.at = Date.now() - TTL_MS + 60 * 1000; // keep the last good copy, retry in a minute
  }
  return cache.rows;
}

const norm = (s) => String(s || '').toLowerCase().normalize('NFKD')
  .replace(/[’'`]/g, '').replace(/&/g, 'and').replace(/^the\s+/, '').replace(/[^a-z0-9]/g, '');

// Restaurants signed up for an event in a city: Status Confirmed or Pending (not cancelled), one per name.
export function signedUp(rows, { cityName, eventName }) {
  const seen = new Map();
  for (const r of rows || []) {
    const status = String(r.Status || '').trim().toLowerCase();
    if (status !== 'confirmed' && status !== 'pending') continue;
    if (String(r.City || '').trim().toLowerCase() !== cityName.toLowerCase()) continue;
    if (!String(r.Event || '').toLowerCase().includes(eventName.toLowerCase())) continue;
    const key = norm(r.RestaurantName);
    if (!key) continue;
    const prev = seen.get(key);
    // Duplicate rows (repeat form submissions): keep the confirmed one, and any deal value
    if (!prev || (status === 'confirmed' && prev.status !== 'confirmed')) {
      seen.set(key, { name: String(r.RestaurantName).trim(), status, value: parseFloat(r.DealValue) || prev?.value || null });
    } else if (!prev.value && parseFloat(r.DealValue)) prev.value = parseFloat(r.DealValue);
  }
  return [...seen.values()];
}

// Count + total deal value for the spin page. Restaurants with no DealValue yet count as the city's median.
export function dealStats(list) {
  const known = list.map((r) => r.value).filter((v) => Number.isFinite(v) && v > 0).sort((a, b) => a - b);
  let value = 0;
  if (known.length) {
    const mid = known.length / 2;
    const median = known.length % 2 ? known[Math.floor(mid)] : (known[mid - 1] + known[mid]) / 2;
    value = known.reduce((a, b) => a + b, 0) + median * (list.length - known.length);
  }
  return { count: list.length, value };
}

export async function liveDealStats({ cityName, eventName }) {
  const rows = await sheetRows();
  if (!rows) return null;
  const s = dealStats(signedUp(rows, { cityName, eventName }));
  return s.count ? s : null;
}
