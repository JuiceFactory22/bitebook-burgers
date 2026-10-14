// Tiny Neon Postgres client over Neon's HTTPS SQL endpoint (no extra packages).
// Values come back as text; callers convert numbers/timestamps as needed.

let workingEndpoint = null;

function endpointsFor(connString) {
  const host = new URL(connString).hostname;
  return [
    `https://${host.replace(/^[^.]+\./, 'api.')}/sql`,
    `https://${host}/sql`,
  ];
}

export async function query(text, params = []) {
  const conn = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!conn) throw new Error('DATABASE_URL is not set');
  const candidates = workingEndpoint ? [workingEndpoint] : endpointsFor(conn);
  let lastErr;
  for (const ep of candidates) {
    let res;
    try {
      res = await fetch(ep, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Neon-Connection-String': conn,
          'Neon-Raw-Text-Output': 'true',
          'Neon-Array-Mode': 'false',
        },
        body: JSON.stringify({ query: text, params: params.map((p) => (p === undefined ? null : p)) }),
      });
    } catch (e) {
      lastErr = e;
      continue;
    }
    if (res.status === 404) { lastErr = new Error(`404 from ${ep}`); continue; }
    const body = await res.text();
    if (!res.ok) throw new Error(`Database error (${res.status}): ${body.slice(0, 500)}`);
    workingEndpoint = ep;
    const json = JSON.parse(body);
    return json.rows || [];
  }
  throw lastErr || new Error('Could not reach database');
}

export async function initSchema() {
  await query(`CREATE TABLE IF NOT EXISTS passports (
    id text PRIMARY KEY,
    order_id text NOT NULL,
    book_index int NOT NULL,
    city text NOT NULL,
    name text,
    email text,
    phone text,
    is_test int NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    emailed_at timestamptz,
    UNIQUE (order_id, book_index)
  )`);
  await query(`CREATE TABLE IF NOT EXISTS coupons (
    token text PRIMARY KEY,
    passport_id text NOT NULL REFERENCES passports(id),
    restaurant_id text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    redeemed_at timestamptz,
    UNIQUE (passport_id, restaurant_id)
  )`);
  await query(`CREATE TABLE IF NOT EXISTS events (
    id bigserial PRIMARY KEY,
    at timestamptz NOT NULL DEFAULT now(),
    kind text NOT NULL,
    detail text
  )`);
  await query(`CREATE INDEX IF NOT EXISTS coupons_passport_idx ON coupons (passport_id)`);
  await query(`CREATE INDEX IF NOT EXISTS passports_email_idx ON passports (lower(email))`);
}

export async function logEvent(kind, detail) {
  try {
    await query('INSERT INTO events (kind, detail) VALUES ($1, $2)', [kind, JSON.stringify(detail ?? null)]);
  } catch (e) {
    console.error('logEvent failed', e);
  }
}
