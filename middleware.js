// Vercel Routing Middleware: lets the CDN serve the ad landing pages from its cache.
// Ad clicks add a unique ?fbclid=... (plus utm_ tags) to every link, and the CDN treats every different link as
// a different page, so nothing would ever be served from cache. Here the page is fetched without the query string
// (the visitor's address bar keeps it, and the page's own script still reads src/utm_source/reset from there).
// Runs only for the spin page and the passport sales pages; everything else is untouched.
export const config = { matcher: ['/spin/:event/:city', '/wings/:city'] };

export default function middleware(request) {
  const url = new URL(request.url);
  if (!url.search || url.pathname === '/wings/thanks') return; // thank-you page needs its session_id
  url.search = '';
  return new Response(null, { headers: { 'x-middleware-rewrite': url.toString() } });
}
