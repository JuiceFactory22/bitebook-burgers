// One-off: download candidate logos into logos-raw/ for review.
import { mkdirSync, writeFileSync } from 'node:fs';
import { findLogos } from '../lib/logos.js';
import { RESTAURANTS } from '../lib/restaurants.js';
const ext = (t) => ({ 'image/png': 'png', 'image/jpeg': 'jpg', 'image/svg+xml': 'svg', 'image/webp': 'webp', 'image/avif': 'avif', 'image/gif': 'gif' }[t] || 'bin');
mkdirSync('logos-raw', { recursive: true });
const lines = [];
for (const r of RESTAURANTS.filter((x) => x.active)) {
  const { note, logos } = await findLogos(r.id);
  lines.push(`${r.id}: ${logos.length} ${note}`);
  let i = 0;
  for (const l of logos) {
    i++;
    try {
      const res = await fetch(l.url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      const buf = Buffer.from(await res.arrayBuffer());
      const f = `logos-raw/${r.id}-${i}.${ext(l.type)}`;
      writeFileSync(f, buf);
      lines.push(`  ${f} ${l.url}`);
    } catch (e) { lines.push(`  fail ${l.url}`); }
  }
}
writeFileSync('logos-raw/index.txt', lines.join('\n'));
console.log(lines.join('\n'));
