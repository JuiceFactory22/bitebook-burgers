// Restaurant partner logo strip. Reads /partners.json, so adding a restaurant there
// updates the homepage and every city page at once.
//
// Use on a page:
//   <section class="partners" data-partners hidden></section>                  -> all cities, mixed
//   <section class="partners" data-partners="nashville" hidden></section>      -> one city
//   add data-more="/lineup/nashville" to show a "See every restaurant & deal" link
//   <script src="/partners.js" defer></script>
// A partner with no logo yet shows its name on the tile until a logo is added.
(function () {
  var CITY = { denver: 'Denver', nashville: 'Nashville', phoenix: 'Phoenix' };
  var EVENT = { burger: 'Burger Blastoff', wings: 'Wing Month' };

  var css = '' +
    '.partners{background:#1c140f;color:#f8efdd;margin-top:44px;padding:44px 0 40px;overflow:hidden}' +
    '.partners-head{text-align:center;padding:0 24px 22px}' +
    '.partners-head .k{font-family:"Space Mono",monospace;font-size:.72rem;letter-spacing:.12em;text-transform:uppercase;color:#f2ac1d}' +
    '.partners-head h2{font-family:"Bricolage Grotesque",sans-serif;font-weight:800;font-size:clamp(1.6rem,4vw,2.3rem);line-height:1.05;letter-spacing:-.02em;margin:6px 0 0}' +
    '.partners .marquee{display:flex;width:max-content;animation:bb-scroll var(--bb-dur,40s) linear infinite}' +
    '.partners:hover .marquee{animation-play-state:paused}' +
    '.partners .logo-tile{flex:0 0 auto;width:200px;height:120px;margin:0 9px;background:#f8efdd;border:2px solid #f2ac1d;border-radius:14px;display:flex;align-items:center;justify-content:center;padding:14px}' +
    '.partners .logo-tile.dark{background:#2b2119}' +
    '.partners .logo-tile.fill{padding:0;overflow:hidden}' +
    '.partners .logo-tile.fill img{width:100%;height:100%;max-width:none;max-height:none;object-fit:cover}' +
    '.partners .logo-tile img{max-width:100%;max-height:100%;object-fit:contain}' +
    '.partners .logo-tile.name span{font-family:"Bricolage Grotesque",sans-serif;font-weight:800;font-size:1.25rem;line-height:1.05;letter-spacing:-.01em;color:#1c140f;text-align:center;text-wrap:balance}' +
    '.partners-more{text-align:center;margin-top:24px;font-family:"Space Mono",monospace;font-size:.8rem}' +
    '.partners-more a{color:#f2ac1d}' +
    '@keyframes bb-scroll{from{transform:translateX(0)}to{transform:translateX(-50%)}}' +
    '@media(max-width:620px){.partners .logo-tile{width:150px;height:96px;margin:0 7px}}' +
    '@media(prefers-reduced-motion:reduce){.partners .marquee{animation:none;flex-wrap:wrap;justify-content:center;width:auto;row-gap:14px;padding:0 16px}.partners .marquee .dup{display:none}}';

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // Alternate cities so the homepage mix doesn't show one city in a long run
  function mix(list) {
    var byCity = {}, order = [];
    list.forEach(function (p) {
      if (!byCity[p.city]) { byCity[p.city] = []; order.push(p.city); }
      byCity[p.city].push(p);
    });
    var out = [], more = true;
    for (var i = 0; more; i++) {
      more = false;
      order.forEach(function (c) { if (byCity[c][i]) { out.push(byCity[c][i]); more = true; } });
    }
    return out;
  }

  function tile(p, dup) {
    var cls = 'logo-tile' + (p.logo && p.tile ? ' ' + p.tile : '') + (p.logo ? '' : ' name') + (dup ? ' dup' : '');
    var inner = p.logo
      ? '<img src="' + esc(p.logo) + '" alt="' + (dup ? '' : esc(p.name)) + '" loading="lazy">'
      : '<span>' + esc(p.name) + '</span>'; // no logo yet: show the name
    return '<div class="' + cls + '"' + (dup ? ' aria-hidden="true"' : '') + '>' + inner + '</div>';
  }

  function render(el, all) {
    var city = el.getAttribute('data-partners');
    var list = all.filter(function (p) { return p && p.name && (!city || p.city === city); });
    if (!list.length) return; // nothing to show yet: section stays hidden
    if (!city) list = mix(list);

    // Label: which city and which events these partners come from
    var events = [];
    list.forEach(function (p) { (p.events || []).forEach(function (e) { if (events.indexOf(e) < 0) events.push(e); }); });
    var k = city
      ? CITY[city] + ' partners'
      : events.map(function (e) { return EVENT[e] || e; }).join(' · ') + ' · ' +
        Object.keys(CITY).filter(function (c) { return list.some(function (p) { return p.city === c; }); }).map(function (c) { return CITY[c]; }).join(', ');

    // Repeat the logos so the strip always fills the screen, then once more for a seamless loop
    var row = list.slice();
    while (row.length < 12) row = row.concat(list);
    var html = row.map(function (p, i) { return tile(p, i >= list.length); }).join('') +
      row.map(function (p) { return tile(p, true); }).join('');

    var more = el.getAttribute('data-more');
    el.innerHTML = '<div class="partners-head"><div class="k">' + esc(k) + '</div>' +
      '<h2>Restaurants we’ve partnered with</h2></div>' +
      '<div class="marquee" style="--bb-dur:' + Math.max(30, row.length * 3.5) + 's">' + html + '</div>' +
      (more ? '<div class="partners-more"><a href="' + esc(more) + '">See every restaurant &amp; deal →</a></div>' : '');
    el.hidden = false;
  }

  function start() {
    var els = document.querySelectorAll('[data-partners]');
    if (!els.length) return;
    var st = document.createElement('style');
    st.textContent = css;
    document.head.appendChild(st);
    fetch('/partners.json', { cache: 'no-cache' })
      .then(function (r) { return r.json(); })
      .then(function (d) { els.forEach(function (el) { render(el, d.partners || []); }); })
      .catch(function () {});
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
