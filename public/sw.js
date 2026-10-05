// Service worker : rend l'application installable et la fait démarrer même avec un réseau faible.
// Code, styles, polices, images : le réseau d'abord (toujours la dernière version, pour que l'hôte et les
// joueurs d'une table aient le même code), le cache seulement hors ligne ou si le réseau traîne.
// Jamais de cache pour public/music (morceaux sous droits, absents du site) ni pour Supabase (comptes, tables).
const CACHE = 'saloon-v2';
const SLOW_MS = 4000; // au-delà, on sert la copie en cache et la mise à jour continue en arrière-plan

// Le cache n'est qu'un bonus : si le stockage refuse (plein, navigation privée…), l'app marche quand même en ligne.
const match = (req, opts) => caches.match(req, opts).catch(() => undefined);

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['./', 'index.html', 'manifest.webmanifest'])).catch(() => {}).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    try { for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k); } catch {}
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || req.headers.has('range')) return;
  const url = new URL(req.url);
  const same = url.origin === self.location.origin;
  if (same && url.pathname.includes('/music/')) return;
  const cdn = url.hostname === 'cdn.jsdelivr.net'; // bibliothèque Supabase, version fixée
  if (!same && !cdn) return;
  // la copie en cache est mise à jour en arrière-plan, sans retarder la réponse
  const fresh = fetch(req).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {}); }
    return res;
  });
  e.waitUntil(fresh.then(() => {}, () => {}));
  const opts = { ignoreSearch: req.mode === 'navigate' }; // ?lobby=CODE : même page
  e.respondWith(cdn ? cacheFirst(req, fresh) : networkFirst(req, fresh, opts));
});

async function networkFirst(req, fresh, opts) {
  const slow = new Promise((ok) => setTimeout(ok, SLOW_MS)).then(() => match(req, opts));
  try {
    const res = await Promise.race([fresh, slow.then((hit) => hit || fresh)]);
    if (res) return res;
  } catch {}
  return (await match(req, opts)) || fresh; // hors ligne et jamais vu : l'erreur réseau d'origine
}

async function cacheFirst(req, fresh) {
  return (await match(req)) || fresh;
}
