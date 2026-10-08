// Cloudflare Worker des liens d'invitation : https://<worker>/CODE/Pseudo?m=message&p=joueurs&s=chaises
// Les robots des messageries (Discord, WhatsApp, Messenger…) lisent les balises og: sans exécuter le JS, et Surge
// ne sert que des fichiers fixes : ce worker leur renvoie une petite page dont l'aperçu reprend le pseudo et le message
// portés par le lien, avec l'image de la table et des joueurs assis (/card/CODE.png, voir card.js).
// Les joueurs, eux, sont redirigés tout de suite vers la table sur le site. Rien n'est stocké.
import { renderCard } from './card.js';
import { decodePlayers } from '../public/js/invitelook.js';

const SITE = 'https://saloon-roulette.surge.sh';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clean = (s, max) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, max);
const decode = (s) => { try { return decodeURIComponent(s); } catch { return ''; } };
// robots d'aperçu des messageries et réseaux : ils reçoivent la page, les joueurs sont redirigés tout de suite
const BOTS = /discordbot|facebookexternalhit|facebot|whatsapp|twitterbot|telegrambot|slackbot|linkedinbot|skypeuripreview|applebot|googlebot|bingbot|embedly|redditbot|iframely|vkshare|pinterest|mastodon|signal|snapchat|viber|line\/|kakaotalk/i;

const seatsOf = (url) => Math.max(2, Math.min(6, parseInt(url.searchParams.get('s'), 10) || 6));

// l'image ne dépend que de son URL : dessinée une fois, puis servie depuis le cache de Cloudflare
async function card(request, url, ctx) {
  const cache = caches.default;
  const hit = await cache.match(request);
  if (hit) return hit;
  const code = (url.pathname.split('/')[2] || '').replace(/\.png$/i, '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
  const png = await renderCard({ code, players: decodePlayers(url.searchParams.get('p') || ''), seats: seatsOf(url) });
  const res = new Response(png, { headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=604800, immutable' } });
  ctx.waitUntil(cache.put(request, res.clone()));
  return res;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/card/')) return card(request, url, ctx);
    const [rawCode = '', rawBy = ''] = url.pathname.split('/').filter(Boolean);
    const code = rawCode.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
    if (code.length !== 5) return Response.redirect(SITE, 302);
    const by = clean(decode(rawBy), 16);
    const msg = clean(url.searchParams.get('m'), 200);

    const target = `${SITE}/?lobby=${code}`;
    if (!BOTS.test(request.headers.get('user-agent') || '')) return Response.redirect(target, 302);
    const title = by ? `${by} t’attend au Buckshot Saloon !` : 'On t’attend au Buckshot Saloon, cowboy !';
    const text = `${msg ? `${msg}${/[.!?…]$/.test(msg) ? '' : '.'} ` : ''}Table ${code} : clique pour t’asseoir, ça se joue dans le navigateur.`;
    // la table et ses joueurs si le lien les porte, sinon l'affiche du jeu
    const players = url.searchParams.get('p');
    const image = players
      ? `${url.origin}/card/${code}.png?p=${encodeURIComponent(players)}&s=${seatsOf(url)}`
      : `${SITE}/icons/og-image.png`;

    const html = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>${esc(title)}</title>
<meta name="description" content="${esc(text)}">
<meta name="theme-color" content="#120c08">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Buckshot Saloon">
<meta property="og:locale" content="fr_FR">
<meta property="og:url" content="${esc(url.href)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(text)}">
<meta property="og:image" content="${esc(image)}">
<meta property="og:image:type" content="image/png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(text)}">
<meta name="twitter:image" content="${esc(image)}">
</head>
<body style="background:#120c08;color:#f0deb4;font-family:sans-serif">
<p><a href="${esc(target)}" style="color:#f0c040">Entrer dans le saloon</a></p>
</body>
</html>`;
    // la réponse dépend du navigateur (robot ou joueur) : pas de cache partagé
    return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', Vary: 'User-Agent' } });
  },
};
