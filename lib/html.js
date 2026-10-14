// Shared page shell for the redeem and admin pages (matches the site's retro ticket look)

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function page({ title, body, label = 'STAFF REDEMPTION', wide = false }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${esc(title)} · BiteBook</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,700;12..96,800&family=Space+Mono:wght@400;700&family=Inter:wght@400;500;600&display=swap">
<style>
  :root { --ink:#1F1A15; --paper:#FBF4E4; --stub:#FFFDF7; --mustard:#F2B33D; --red:#C8371D; --usedred:#B3261E; --green:#1F6B3A; --muted:#5E5246; }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--paper); color:var(--ink); font-family:Inter, system-ui, sans-serif; min-height:100vh; display:flex; flex-direction:column; }
  header { background:var(--ink); color:var(--paper); padding:16px 20px; display:flex; justify-content:space-between; align-items:center; }
  header .brand { font-family:'Bricolage Grotesque', sans-serif; font-weight:800; font-size:22px; }
  header .tag { font-family:'Space Mono', monospace; font-size:12px; letter-spacing:1.5px; color:var(--mustard); }
  main { flex:1; padding:24px 20px 32px; width:100%; max-width:${wide ? 1100 : 480}px; margin:0 auto; display:flex; flex-direction:column; gap:16px; }
  h1 { margin:0; font-family:'Bricolage Grotesque', sans-serif; font-weight:800; font-size:36px; line-height:1.02; letter-spacing:-0.5px; }
  .mono { font-family:'Space Mono', monospace; font-size:12px; letter-spacing:1.5px; color:var(--muted); }
  .muted { color:var(--muted); }
  .pill { align-self:flex-start; display:inline-flex; gap:8px; align-items:center; border-radius:999px; padding:7px 14px; font-family:'Space Mono', monospace; font-weight:700; font-size:13px; letter-spacing:1.2px; color:#fff; }
  .deal { background:var(--mustard); border:2px solid var(--ink); border-radius:12px; padding:16px 18px; display:flex; flex-direction:column; gap:6px; }
  .deal .big { font-family:'Bricolage Grotesque', sans-serif; font-weight:800; font-size:26px; line-height:1.05; }
  .row { display:flex; justify-content:space-between; gap:12px; font-size:15px; }
  .row b { font-weight:600; text-align:right; }
  .btn { display:block; width:100%; height:72px; border:2px solid var(--ink); border-radius:14px; background:var(--red); color:#fff; font-family:'Bricolage Grotesque', sans-serif; font-weight:800; font-size:26px; letter-spacing:0.5px; box-shadow:0 5px 0 var(--ink); cursor:pointer; }
  .btn:disabled { opacity:.6; }
  .banner { padding:28px 20px; text-align:center; display:flex; flex-direction:column; align-items:center; gap:10px; color:#fff; border-bottom:3px solid var(--ink); }
  .card { border:2px solid var(--ink); border-radius:12px; background:var(--stub); padding:16px 18px; display:flex; flex-direction:column; gap:10px; }
  .check { width:120px; height:120px; border-radius:999px; background:var(--green); border:3px solid var(--ink); display:flex; align-items:center; justify-content:center; box-shadow:0 6px 0 var(--ink); align-self:center; }
  .stamp { border:3px solid var(--green); color:var(--green); border-radius:10px; padding:12px; font-family:'Space Mono', monospace; font-weight:700; transform:rotate(-2deg); text-align:center; }
  table { border-collapse:collapse; width:100%; font-size:14px; background:var(--stub); }
  th, td { border:1px solid #d9ccb2; padding:6px 8px; text-align:left; vertical-align:top; }
  th { background:var(--ink); color:var(--paper); font-family:'Space Mono', monospace; font-size:11px; letter-spacing:1px; }
  a { color:var(--red); }
</style>
</head>
<body>
<header><span class="brand">BiteBook</span><span class="tag">${esc(label)}</span></header>
${body}
</body>
</html>`;
}

export const CHECK_SVG = `<svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5L20 7"/></svg>`;
export const X_SVG = `<svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M6 6l12 12"/></svg>`;
