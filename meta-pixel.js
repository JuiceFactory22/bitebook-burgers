// Meta (Facebook/Instagram) Pixel for getbitebook.com.
// Every public page loads this file. It records a PageView, and pages can call
//   bbTrack('ViewContent', { ... })                       -> standard event
//   bbTrack('Purchase', { value: 20, currency: 'USD' }, id) -> event with an ID, so Meta can match it
//                                                             with the same purchase sent from our server
// Set the Pixel ID below (also set META_PIXEL_ID in lib/config.js to the same number).
// Leave it blank and nothing loads.
(function () {
  var PIXEL_ID = '';
  window.bbTrack = function (name, data, eventId) {
    if (!window.fbq) return;
    if (eventId) window.fbq('track', name, data || {}, { eventID: eventId });
    else window.fbq('track', name, data || {});
  };
  if (!PIXEL_ID || window.fbq) return;
  !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
  n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
  n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
  t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
  document,'script','https://connect.facebook.net/en_US/fbevents.js');
  window.fbq('init', PIXEL_ID);
  window.fbq('track', 'PageView');
})();
