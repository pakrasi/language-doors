/* Igloo service worker: offline for app.html (B1 rounds on the subway). Registered by site.js as a fixed URL with
   updateViaCache:'none', so every deploy (a new V below) is picked up.
   - navigations (app.html): network first with a 3 s timeout, cache fallback;
   - versioned files (?v=…, which includes data/b1/*): cache first;
   - fonts: stale-while-revalidate; everything else cross-origin (GitHub, Anthropic): not touched.
   The page switches versions only from the B1 hub (version.json check), never mid-round. */
const V = '20261002d';
const CACHE = 'igloo-' + V;
const SHELL = ['app.html'];
const VERSIONED = ['tokens.css', 'app.css', 'b1.css', 'site.js', 'match.js', 'readiness.js', 'b1day.js', 'fsrs.js', 'timer.js', 'detect.js', 'b1ready.js',
  'speech.js', 'b1round.js', 'b1.js', 'b1more.js', 'data/framework.json', 'data/b1/items.json', 'data/b1/grammar.json', 'data/b1/bank.json', 'data/b1/plan.json', 'data/b1/nouns.json'];
const PLAIN = ['assets/logo.svg', 'assets/favicon-32.png'];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await Promise.all([...SHELL, ...PLAIN, ...VERSIONED.map(p => `${p}?v=${V}`)].map(u => c.add(new Request(u, { cache: 'reload' })).catch(() => {})));
  })());
});
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('igloo-') && k !== CACHE) await caches.delete(k);
    await self.clients.claim();
    for (const cl of await self.clients.matchAll()) cl.postMessage({ type: 'cached', v: V });
  })());
});
self.addEventListener('message', e => { if (e.data === 'skipWaiting') self.skipWaiting(); });

const timeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) {
    if (/fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) e.respondWith(swr(req));
    return;
  }
  if (!url.pathname.startsWith(new URL('./', location).pathname)) return;
  if (url.pathname.endsWith('/version.json') || url.pathname.endsWith('/sw.js')) return;
  if (req.mode === 'navigate') { e.respondWith(navigate(req)); return; }
  if (url.searchParams.has('v')) { e.respondWith(cacheFirst(req)); return; }
  e.respondWith(networkFirst(req));
});
async function navigate(req) {
  const c = await caches.open(CACHE);
  try {
    const r = await timeout(fetch(req), 3000);
    if (r.ok) c.put(new URL(req.url).pathname.endsWith('app.html') ? 'app.html' : req, r.clone());
    return r;
  } catch {
    const path = new URL(req.url).pathname;
    return (await c.match(path.endsWith('app.html') ? 'app.html' : req, { ignoreSearch: true })) || (await c.match('app.html')) || Response.error();
  }
}
async function cacheFirst(req) {
  const c = await caches.open(CACHE);
  const hit = await c.match(req);
  if (hit) return hit;
  const r = await fetch(req);
  if (r.ok) c.put(req, r.clone());
  return r;
}
async function networkFirst(req) {
  const c = await caches.open(CACHE);
  try { const r = await timeout(fetch(req), 4000); if (r.ok) c.put(req, r.clone()); return r; }
  catch { return (await c.match(req)) || Response.error(); }
}
async function swr(req) {
  const c = await caches.open('igloo-fonts');
  const hit = await c.match(req);
  const net = fetch(req).then(r => { if (r.ok) c.put(req, r.clone()); return r; }).catch(() => hit);
  return hit || net;
}
