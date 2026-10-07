// Service worker : rend l'application installable et la fait démarrer vite, même avec un réseau faible ou absent.
// L'hôte et les joueurs d'une table doivent avoir le même code : chaque déploiement (npm run deploy) passe par
// tools/stamp.mjs, qui écrit ci-dessous l'empreinte du contenu (VERSION) et la liste des fichiers (FILES).
// Nouvelle empreinte = nouveau service worker = nouveau cache, rempli d'un coup à l'installation (les fichiers
// inchangés sont repris de l'ancien cache). Les fichiers de l'app sont ensuite servis depuis ce cache, sans aller-retour
// réseau ; la page (main.js) n'active la nouvelle version qu'à l'accueil ou au menu, jamais en pleine partie.
// Sans empreinte (VERSION 'dev', serveur local) : le réseau d'abord, comme avant, pour toujours tester le dernier code.
// Jamais de cache pour public/music (morceaux sous droits, absents du site) ni pour Supabase (comptes, tables).
const VERSION = 'dev';
const FILES = {}; // chemin -> empreinte du fichier
const CACHE = `saloon-${VERSION}`;
const CDN_CACHE = 'saloon-cdn'; // bibliothèque Supabase, version fixée : elle ne change jamais, gardée d'une version à l'autre
const MANIFEST = '__files.json'; // les empreintes de FILES, rangées dans le cache (pour la prochaine version)
const SLOW_MS = 4000; // version dev : au-delà, on sert la copie en cache et la mise à jour continue en arrière-plan
const stamped = VERSION !== 'dev';

// Le cache n'est qu'un bonus : si le stockage refuse (plein, navigation privée…), l'app marche quand même en ligne.
const match = (req, opts) => caches.match(req, opts).catch(() => undefined);
const scoped = (path) => new URL(path, self.registration.scope).href;

self.addEventListener('install', (e) => {
  if (!stamped) {
    e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['./', 'index.html', 'manifest.webmanifest'])).catch(() => {}).then(() => self.skipWaiting()));
    return;
  }
  // Tout le site d'un coup : une partie ne mélange jamais deux versions. Les fichiers dont l'empreinte n'a pas
  // changé sont recopiés depuis le cache de la version précédente ; les autres viennent du réseau.
  // La nouvelle version attend ensuite que la page l'active (message 'skipWaiting', envoyé par main.js au menu) ;
  // à la toute première installation, rien à attendre.
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const old = await previousFiles();
    await Promise.all(Object.entries(FILES).map(async ([path, hash]) => {
      const url = scoped(path);
      if (old && old.files[path] === hash) {
        const hit = await old.cache.match(url);
        if (hit) return cache.put(url, hit);
      }
      const res = await fetch(url, { cache: 'no-cache' });
      if (!res.ok) throw new Error(`${path} : ${res.status}`);
      return cache.put(url, res);
    }));
    await cache.put(scoped(MANIFEST), new Response(JSON.stringify(FILES), { headers: { 'Content-Type': 'application/json' } }));
    if (!self.registration.active) await self.skipWaiting();
  })());
});

// Cache et empreintes de la version la plus récente déjà installée, s'il y en a une.
async function previousFiles() {
  try {
    for (const k of (await caches.keys()).reverse()) {
      if (k === CACHE || k === CDN_CACHE || !k.startsWith('saloon-')) continue;
      const cache = await caches.open(k);
      const m = await cache.match(scoped(MANIFEST));
      if (m) return { cache, files: await m.json() };
    }
  } catch {}
  return null;
}

self.addEventListener('message', (e) => {
  if (e.data?.t === 'skipWaiting') self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    try { for (const k of await caches.keys()) if (k !== CACHE && k !== CDN_CACHE) await caches.delete(k); } catch {}
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
  if (cdn) return e.respondWith(cdnFirst(req));
  if (stamped) {
    // la page (?lobby=CODE compris) et les fichiers de la version installée : directement depuis son cache
    const key = req.mode === 'navigate' && (url.pathname.endsWith('/') || url.pathname.endsWith('/index.html')) ? scoped('index.html') : url.href.split('?')[0];
    const path = key.slice(scoped('').length);
    if (path in FILES) return e.respondWith(fromCache(key, req));
    return; // hors de la version (bancs d'essai…) : le navigateur s'en occupe
  }
  // version dev : le réseau d'abord ; la copie en cache n'est réécrite que si le fichier a changé
  const fresh = fetch(req).then((res) => {
    if (res.ok) e.waitUntil(store(req, res.clone()));
    return res;
  });
  e.waitUntil(fresh.then(() => {}, () => {}));
  e.respondWith(networkFirst(req, fresh, { ignoreSearch: req.mode === 'navigate' }));
});

async function fromCache(key, req) {
  let hit;
  try { hit = await (await caches.open(CACHE)).match(key); } catch {} // ce cache-là seulement : jamais un fichier d'une autre version
  return hit || fetch(req); // cache vidé par le navigateur : le réseau, en attendant la prochaine version
}

async function cdnFirst(req) {
  const hit = await match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) {
    const copy = res.clone();
    caches.open(CDN_CACHE).then((c) => c.put(req, copy)).catch(() => {});
  }
  return res;
}

// Réécrit la copie en cache seulement si elle a changé (ETag, date ou taille) : sinon, tout le site à chaque lancement.
async function store(req, res) {
  try {
    const c = await caches.open(CACHE);
    const old = await c.match(req);
    const same = (h) => old && res.headers.get(h) && old.headers.get(h) === res.headers.get(h);
    if (old && (same('etag') || (same('last-modified') && same('content-length')))) return;
    await c.put(req, res);
  } catch {}
}

async function networkFirst(req, fresh, opts) {
  const slow = new Promise((ok) => setTimeout(ok, SLOW_MS)).then(() => match(req, opts));
  try {
    const res = await Promise.race([fresh, slow.then((hit) => hit || fresh)]);
    if (res) return res;
  } catch {}
  return (await match(req, opts)) || fresh; // hors ligne et jamais vu : l'erreur réseau d'origine
}
