// Floating "Free Spin" button for the customer city pages (/denver, /nashville, /phoenix only).
// Include with: <script src="/spin-button.js" data-city="denver" defer></script>
// It hides while the "Which one are you?" section (the diner + restaurant doors) is on screen,
// so restaurant owners reading their door don't see it and it never covers the passport button.
(function () {
  var me = document.currentScript;
  var city = me && me.getAttribute('data-city');
  if (!city) return;
  var css = document.createElement('style');
  css.textContent =
    '.bb-spin-btn{position:fixed;right:16px;bottom:calc(16px + env(safe-area-inset-bottom));z-index:90;display:flex;align-items:center;gap:8px;' +
    'background:#e0442a;color:#fffaf0;font-family:"Bricolage Grotesque",sans-serif;font-weight:800;font-size:17px;padding:12px 16px 12px 12px;' +
    'border:2.5px solid #1c140f;border-radius:40px;box-shadow:4px 4px 0 #1c140f;text-decoration:none;transition:transform .2s ease,opacity .2s ease}' +
    '.bb-spin-btn:hover{transform:translate(-2px,-2px);box-shadow:6px 6px 0 #1c140f}' +
    '.bb-spin-btn.off{opacity:0;transform:translateY(20px);pointer-events:none}' +
    '.bb-spin-btn .w{width:26px;height:26px;border-radius:50%;border:2px solid #1c140f;' +
    'background:conic-gradient(#f2ac1d 0 25%,#fffaf0 0 50%,#127e73 0 75%,#f2ac1d 0)}' +
    '@media(prefers-reduced-motion:reduce){.bb-spin-btn{transition:none}}';
  document.head.appendChild(css);
  var a = document.createElement('a');
  a.className = 'bb-spin-btn';
  a.href = '/spin/' + encodeURIComponent(city) + '?src=citypage';
  a.setAttribute('aria-label', 'Spin for a free wing deal');
  a.innerHTML = '<span class="w" aria-hidden="true"></span>Free Spin';
  document.body.appendChild(a);
  var fork = document.getElementById('start');
  if (fork && 'IntersectionObserver' in window) {
    new IntersectionObserver(function (es) { a.classList.toggle('off', es[0].isIntersecting); }, { threshold: 0.05 }).observe(fork);
  }
})();
