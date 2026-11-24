// Live restaurant data from the BiteBook Backend sheet (Restaurants tab).
// Read through a small Apps Script feed ("BiteBook Website Feed", owned by Sam) that returns only the public
// columns. Vercel env: SHEET_FEED_URL (the /exec link) + SHEET_FEED_TOKEN (its access code).
//
// Apps Script can take several seconds to answer, so pages never wait on it when they don't have to:
//   - the last good copy is kept in memory and in the database (table sheet_cache)
//   - pages use that copy right away; if it's over 5 minutes old, a refresh runs in the background
//   - only a server with no copy at all waits for the feed (up to 12 seconds)
// #site-alerts gets a Slack message only when the saved copy is over 30 minutes old (refreshes keep failing),
// at most once an hour, plus a "fixed" message once a refresh works again.
import { query } from './db.js';
import { slackAlert, slackAlertCleared } from './slack.js';

const FRESH_MS = 5 * 60 * 1000;
const ALERT_AFTER_MS = 30 * 60 * 1000;
const FETCH_TIMEOUT_MS = 12000;

let mem = { at: 0, rows: null };
let refreshing = null;
let tableReady = false;

async function ensureTable() {
  if (tableReady) return;
  await query('CREATE TABLE IF NOT EXISTS sheet_cache (id text PRIMARY KEY, rows jsonb NOT NULL, fetched_at timestamptz NOT NULL DEFAULT now())');
  tableReady = true;
}

async function loadSaved() {
  try {
    await ensureTable();
    const r = await query("SELECT rows, fetched_at FROM sheet_cache WHERE id = 'restaurants'");
    if (r.length) return { rows: r[0].rows, at: new Date(r[0].fetched_at).getTime() };
  } catch (e) { console.error('sheet cache read:', e.message || e); }
  return null;
}

async function save(rows) {
  try {
    await ensureTable();
    await query(
      `INSERT INTO sheet_cache (id, rows, fetched_at) VALUES ('restaurants', $1::jsonb, now())
       ON CONFLICT (id) DO UPDATE SET rows = EXCLUDED.rows, fetched_at = now()`,
      [JSON.stringify(rows)],
    );
  } catch (e) { console.error('sheet cache write:', e.message || e); }
}

async function fetchFeed() {
  const r = await fetch(`${process.env.SHEET_FEED_URL}?token=${encodeURIComponent(process.env.SHEET_FEED_TOKEN)}`,
    { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const data = await r.json();
  if (!Array.isArray(data.restaurants)) throw new Error(data.error || 'bad feed');
  return data.restaurants;
}

function refresh() {
  if (refreshing) return refreshing;
  refreshing = (async () => {
    try {
      const rows = await fetchFeed();
      mem = { at: Date.now(), rows };
      await save(rows);
      await slackAlertCleared('sheet-feed', 'The website can read the backend sheet again.');
    } catch (e) {
      const why = String(e.message || e).slice(0, 120);
      console.error('sheet feed:', why);
      const age = mem.rows ? Date.now() - mem.at : Infinity;
      if (age > ALERT_AFTER_MS) {
        const since = Number.isFinite(age) ? ` Last good copy is ${Math.round(age / 60000)} minutes old.` : '';
        await slackAlert('sheet-feed',
          `The website can't read the backend sheet (${why}).${since}\n` +
          'The spin page is using its last saved restaurant list until this is fixed. ' +
          'Check the "BiteBook Website Feed" Apps Script and the SHEET_FEED_URL / SHEET_FEED_TOKEN settings in Vercel.');
      }
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

// Let a refresh finish after the page has been sent (Vercel keeps the function alive for it)
function inBackground(p) {
  const ctx = globalThis[Symbol.for('@vercel/request-context')]?.get?.();
  if (ctx?.waitUntil) ctx.waitUntil(p); else p.catch(() => {});
}

export async function sheetRows() {
  if (!process.env.SHEET_FEED_URL || !process.env.SHEET_FEED_TOKEN) return null;
  if (!mem.rows) {
    const saved = await loadSaved();
    if (saved) mem = saved;
  }
  if (mem.rows && Date.now() - mem.at < FRESH_MS) return mem.rows;
  if (mem.rows) { inBackground(refresh()); return mem.rows; }
  await refresh(); // nothing saved anywhere yet: wait for the feed once
  return mem.rows;
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
