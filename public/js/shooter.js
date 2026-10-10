// Mini-jeu « Fusillade » : rail shooter de la gare de Dusty Gulch au saloon, en passant par les abords de la ville
// (cimetière, ranch, mine, ou un décor du mode histoire, tiré au sort, voir shooteredge.js) et la grand-rue.
// La caméra avance toute seule ; les bandits surgissent des fenêtres, des portes, des toits et des abris.
// La rue (succession de façades, abris) et l'ambiance (heure, météo) changent à chaque partie.
import * as S from './sprites.js';
import { sfx } from './audio.js';
import { canvasText } from './scene.js';
import { SKIN, CLOTH_COLORS } from './data.js';
import { MiniScene, ring } from './miniscene.js';
import { Deco } from './shooterdeco.js';
import { renderEdge, edgeSigns, edgeLights } from './shooteredge.js';
import { loadSets, drawSet } from './storyset.js';
import { skyAndFar } from './shootersky.js';
import { paint, signRect, renderStreet } from './shooterstreet.js';
import { renderStation, shooterIntro } from './shooterstation.js';
import { renderSaloonRoom, renderMineRoom, drawChaseBack, drawChaseFront } from './shooterlair.js';
import { horseSprite, riderLook } from './lasso.js';
import {
  W, H, SALOON_START, facade, belfry,
  SAL, camAt, shooterWorld, BONUSES, BONUS_MS, SAND_MS, crateAt, targetSec, bossX, BOSS_T0, SHOOTER_PTS,
  WAGER, shooterEventAt, STATION_START, STREET_START, STA, wagonOpenings,
  EDGE_START, FADES, rideX, LAIRS, MINE, CHASE,
} from './worlds.js';

const AMMO = 6, RELOAD = 850;
// rattrapage : le dernier (300 pts de retard ou plus) a un barillet de 8 balles qui se recharge plus vite
const AMMO_BACK = 8, RELOAD_BACK = 550, BEHIND = 300;
const BANNER_MS = 1800; // durée des annonces (embuscade, bonus…)
const EVENT_TXT = {
  ambush: ['EMBUSCADE !', '#f0705a'],
  train: ['ATTAQUE DU TRAIN !', '#f0705a'],
  graves: ['EMBUSCADE AU CIMETIÈRE !', '#f0705a'],
  cloister: ['EMBUSCADE AU CLOÎTRE !', '#f0705a'],
  ramparts: ['EMBUSCADE SUR LES REMPARTS !', '#f0705a'],
  riders: ['CAVALIERS EN VUE !', '#f0a070'],
  tnt: ['DYNAMITE ! ABATS-LA EN VOL', '#f0705a'],
  bounty: ['PRIME DOUBLÉE : 8 S !', '#f8d070'],
  blackout: ['PANNE DE LUMIÈRE !', '#c8b8e8'],
  lamps: ['LES LAMPES S\'ÉTEIGNENT !', '#c8b8e8'],
  gang: ['LA BANDE D\'EL DIABLO !', '#f0a070'],
  wager: [`PARI SUR EL DIABLO : TOUCHE B`, '#f8d070'],
};
const GUN_TXT = {
  gatling: 'MITRAILLEUSE ! (CLIC MAINTENU)',
  rusty: 'VIEILLE GATLING : 30 BALLES',
  winchester: 'WINCHESTER : 15 BALLES',
  akimbo: 'DEUX COLTS : 2 BALLES PAR CLIC',
};
const OUT = S.OUT;

const BANDITS = [
  { skin: 1, hat: 'cowboy', hatColor: 7, hair: 'short', hairColor: 0, eyes: 'angry', nose: 'big', mouth: 'frown', beard: 'stubble', outfit: 'duster', outfitColor: 1 },
  { skin: 3, hat: 'sombrero', hatColor: 1, hair: 'long', hairColor: 0, eyes: 'squint', nose: 'hooked', mouth: 'cigar', beard: 'mustache', outfit: 'poncho', outfitColor: 4 },
  { skin: 0, hat: 'bandana', hatColor: 0, hair: 'messy', hairColor: 5, eyes: 'angry', nose: 'broken', mouth: 'grin', beard: 'full', outfit: 'vest', outfitColor: 7 },
  { skin: 2, hat: 'gambler', hatColor: 7, hair: 'ponytail', hairColor: 1, eyes: 'patch', nose: 'small', mouth: 'toothpick', beard: 'goatee', outfit: 'duster', outfitColor: 7 },
  { skin: 4, hat: 'cowboy', hatColor: 1, hair: 'curly', hairColor: 0, eyes: 'squint', nose: 'round', mouth: 'frown', beard: 'chops', outfit: 'shirt', outfitColor: 0 },
  { skin: 1, hat: 'coonskin', hatColor: 1, hair: 'mullet', hairColor: 2, eyes: 'angry', nose: 'red', mouth: 'neutral', beard: 'horseshoe', outfit: 'vest', outfitColor: 4 },
  { skin: 5, hat: 'bowler', hatColor: 7, hair: 'short', hairColor: 0, eyes: 'tired', nose: 'big', mouth: 'cigar', beard: 'handlebar', outfit: 'duster', outfitColor: 1 },
  { skin: 2, hat: 'cowboy', hatColor: 0, hair: 'long', hairColor: 6, eyes: 'angry', nose: 'hooked', mouth: 'grin', beard: 'stubble', outfit: 'poncho', outfitColor: 7 },
];
const CIVILS = [
  { skin: 0, hat: 'none', hatColor: 5, hair: 'long', hairColor: 4, eyes: 'wide', nose: 'small', mouth: 'neutral', beard: 'none', outfit: 'shirt', outfitColor: 5 },
  { skin: 2, hat: 'bowler', hatColor: 3, hair: 'short', hairColor: 6, eyes: 'wide', nose: 'round', mouth: 'neutral', beard: 'mustache', outfit: 'vest', outfitColor: 3 },
  { skin: 1, hat: 'tophat', hatColor: 7, hair: 'short', hairColor: 7, eyes: 'wide', nose: 'big', mouth: 'neutral', beard: 'full', outfit: 'vest', outfitColor: 6 },
  { skin: 3, hat: 'none', hatColor: 5, hair: 'curly', hairColor: 0, eyes: 'wide', nose: 'small', mouth: 'smile', beard: 'none', outfit: 'shirt', outfitColor: 6 },
  { skin: 4, hat: 'none', hatColor: 5, hair: 'ponytail', hairColor: 2, eyes: 'wide', nose: 'small', mouth: 'neutral', beard: 'none', outfit: 'shirt', outfitColor: 3 },
];
// Le ravitailleur : un vieux prospecteur à barbe blanche, de notre côté (ne pas lui tirer dessus)
const SUPPLIER = { skin: 1, hat: 'cowboy', hatColor: 5, hair: 'messy', hairColor: 7, eyes: 'wide', nose: 'red', mouth: 'smile', beard: 'full', outfit: 'shirt', outfitColor: 4 };
const BOSS = { skin: 3, hat: 'sombrero', hatColor: 7, hair: 'long', hairColor: 0, eyes: 'patch', nose: 'hooked', mouth: 'cigar', beard: 'handlebar', outfit: 'poncho', outfitColor: 0 };
const BOSS_SCALE = 1.5;
const BOTTLES = ['#4a7a3a', '#8a4a1a', '#9ab8c8', '#6a2a2a'];
const HORSE_COATS = [['#8a5a34', '#3a2214'], ['#2a2220', '#1a1210'], ['#e8dcc8', '#8a7a68'], ['#a8683a', '#f4ecd8'], ['#5a4a40', '#2a2220']];
const RIDE_SCALE = 1.5; // cheval et cavalier agrandis, à l'échelle des bandits
const EVENT_SFX = { ambush: 'hurt', train: 'hurt', graves: 'hurt', cloister: 'hurt', ramparts: 'hurt', tnt: 'hurt', riders: 'neigh', blackout: 'thud', lamps: 'thud', gang: 'neigh' };

// sprite retourné (les chevaux galopent vers la droite)
function flipped(spr) {
  if (!spr.flip) {
    const c = S.makeCanvas(spr.width, spr.height);
    const x = c.getContext('2d');
    x.scale(-1, 1);
    x.drawImage(spr, -spr.width, 0);
    c.ox = spr.width - spr.ox;
    c.oy = spr.oy;
    spr.flip = c;
  }
  return spr.flip;
}

// Le cavalier seul, découpé de son cheval (pixels qui diffèrent du cheval sans cavalier), au même point d'ancrage :
// abattu, c'est lui qui vide les étriers, à sa taille et à sa place (lu une fois par allure, puis gardé).
const unseated = new Map();
function riderOnly(coat, mane, look, tint = null) {
  const key = `${coat}${mane}${look.key}${tint || ''}`;
  let c = unseated.get(key);
  if (c) return c;
  const a = horseSprite(coat, mane, 0, look), b = horseSprite(coat, mane, 0, null);
  const w = a.width, h = a.height;
  const tmp = S.makeCanvas(w, h, true), tx = tmp.getContext('2d', { willReadFrequently: true });
  tx.drawImage(b, 0, 0);
  const B = tx.getImageData(0, 0, w, h).data;
  tx.clearRect(0, 0, w, h);
  tx.drawImage(a, 0, 0);
  const A = tx.getImageData(0, 0, w, h);
  for (let i = 0; i < B.length; i += 4) if (A.data[i] === B[i] && A.data[i + 1] === B[i + 1] && A.data[i + 2] === B[i + 2] && A.data[i + 3] === B[i + 3]) A.data[i + 3] = 0;
  S.freeCanvas(tmp);
  c = S.makeCanvas(w, h);
  const x = c.getContext('2d');
  x.putImageData(A, 0, 0);
  if (tint) { x.globalCompositeOperation = 'source-atop'; x.fillStyle = tint; x.fillRect(0, 0, w, h); }
  c.ox = a.ox;
  c.oy = a.oy;
  if (unseated.size > 40) { for (const v of unseated.values()) S.freeCanvas(v); unseated.clear(); }
  unseated.set(key, c);
  return c;
}

// Trou autour du viseur (panne de lumière, tempête de sable) : disque plein de rayon r0, puis anneau tramé
// jusqu'à r1 (plein jusqu'à r2). Dessiné une fois, puis découpé dans le voile à chaque image (destination-out).
const holes = new Map();
function holeSprite(r0, r1, r2) {
  const key = `${r0}:${r1}:${r2}`;
  let c = holes.get(key);
  if (c) return c;
  c = S.makeCanvas(r1 * 2 + 1, r1 * 2 + 1);
  const x = c.getContext('2d');
  S.disc(x, r1, r1, r0, '#000');
  x.fillStyle = '#000';
  for (let dy = -r1; dy <= r1; dy++) for (let dx = -r1; dx <= r1; dx++) {
    const d = Math.hypot(dx, dy);
    if (d > r0 && d < r1 && ((dx + dy) & 1 || d < r2)) x.fillRect(r1 + dx, r1 + dy, 1, 1);
  }
  holes.set(key, c);
  return c;
}

// Bâton de dynamite en vol, huit orientations (k × 45°, mèche vers le haut pour k = 0), centré en (12, 12) :
// chaque pixel est relu dans le repère du bâton, puis contour sombre autour du corps.
const tnts = [];
function tntSprite(k) {
  if (tnts[k]) return tnts[k];
  const c = S.makeCanvas(24, 24);
  const x = c.getContext('2d');
  const a = (k * Math.PI) / 4, ca = Math.cos(a), sa = Math.sin(a);
  const at = (i, j) => {
    const dx = i + 0.5 - 12, dy = j + 0.5 - 12;
    const u = dx * ca + dy * sa, v = -dx * sa + dy * ca;
    if (Math.abs(u) <= 2.05 && Math.abs(v) <= 6.05) return Math.abs(v) <= 1.05 ? '#f4ecd8' : u < -1 ? '#e8604c' : '#c0392b';
    if (u > -0.6 && u <= 0.25 && v < -6 && v >= -10.2) return '#5a3a20'; // mèche
    return null;
  };
  for (let j = 0; j < 24; j++) for (let i = 0; i < 24; i++) {
    let col = at(i, j);
    if (!col && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([di, dj]) => { const n = at(i + di, j + dj); return n && n !== '#5a3a20'; })) col = OUT;
    if (col) { x.fillStyle = col; x.fillRect(i, j, 1, 1); }
  }
  tnts[k] = c;
  return c;
}

const clamp01 = (k) => (k < 0 ? 0 : k > 1 ? 1 : k);
const hash = (n) => {
  let t = (n * 0x6d2b79f5) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

// Panoramas : le ciel dépend de l'ambiance, la rue de la graine. On garde le dernier de chaque.
const CACHE = { street: null, streetKey: null, saloon: null, station: null, stationKey: null, edge: null, edgeKey: null };
function stationPano(seed) {
  if (CACHE.stationKey !== seed) { CACHE.station = renderStation(seed); CACHE.stationKey = seed; }
  return CACHE.station;
}
function edgePano(E) {
  if (CACHE.edgeKey !== E) { CACHE.edge = renderEdge(E); CACHE.edgeKey = E; }
  return CACHE.edge;
}
function streetPano(L) {
  if (CACHE.streetKey !== L) { CACHE.street = renderStreet(L); CACHE.streetKey = L; }
  return CACHE.street;
}
const saloonPano = () => (CACHE.saloon ||= renderSaloonRoom());
const minePano = () => (CACHE.mine ||= renderMineRoom());

// Vue de la grand-rue depuis la position camX : le ciel est dessiné sur ctx, la rue sur le calque
// de l'ambiance, renvoyé pour la suite du décor (à refermer avec amb.end). town : le nom sur le panneau d'entrée.
export function drawStreet(ctx, camX, L, amb, now, town = 'DUSTY GULCH') {
  const cx = Math.round(camX);
  const w = skyAndFar(ctx, amb, now, -camX * 0.12);
  w.drawImage(streetPano(L).bg, -cx, 0);
  for (const b of L.buildings) {
    if (!b.sign) continue;
    const sr = signRect(b, facade(b));
    if (sr.x + sr.w < cx || sr.x > cx + W) continue;
    canvasText(w, b.sign, sr.x + sr.w / 2 - cx, sr.y + 2, { size: 8, color: '#3a2214', shadow: '#c8b07c' });
  }
  if (cx < 320) canvasText(w, town, 226 - cx, 117, { size: 8, color: '#3a2214', shadow: '#b89a60' });
  return w;
}

// La nuit (ou sous l'orage), une partie des fenêtres sont éclairées et les lanternes brillent.
export function streetLights(ctx, camX, L, amb) {
  if (!amb.env.lights) return;
  const cx = Math.round(camX);
  for (const b of L.buildings) {
    if (b.x - cx > W || b.x + b.w - cx < 0) continue;
    const f = facade(b);
    f.windows.forEach((wn, k) => { if (hash(b.x * 7 + k) < 0.6) amb.window(ctx, wn.x - cx, wn.y, wn.w, wn.h); });
    if (b.steeple) { const r = belfry(b); amb.glow(ctx, r.x + r.w / 2 - cx, r.y + 8, 14); }
    if (b.kind === 'saloon') {
      const d = f.door;
      for (const lx of [d.x - 8, d.x + d.w + 8]) amb.glow(ctx, lx - cx, 121, 26);
      amb.glow(ctx, d.x + d.w / 2 - cx, d.y + d.h / 2, 26);
    }
    if (b.kind === 'smithy') amb.glow(ctx, f.door.x + f.door.w - 12 - cx, f.door.y + 38, 22, '255,120,40');
    if (b.kind === 'theater') amb.glow(ctx, b.x + b.w / 2 - cx, 92, 40, '255,220,120');
  }
}

function drawBottle(ctx, x, base, look, k) {
  const { R, box } = paint(ctx);
  const col = BOTTLES[look % BOTTLES.length];
  const h = Math.round(15 * k);
  if (h < 2) return;
  const y = base - h;
  box(x - 3, y + Math.round(5 * k), 6, h - Math.round(5 * k), col);
  box(x - 1, y, 2, Math.round(5 * k), col);
  R(x - 2, y + Math.round(6 * k), 1, Math.max(1, h - Math.round(8 * k)), S.shade(col, 0.4));
  if (k > 0.8) R(x - 3, base - 7, 6, 3, '#e8d8b0');
}

// Symbole du contenu d'un bonus (8×7), coin haut-gauche en (x, y)
function bonusIcon(R, x, y, bonus) {
  R(x, y, 8, 7, '#e8d4a0');
  if (bonus === 'gatling' || bonus === 'rusty') {
    const c = bonus === 'rusty' ? '#9a5a30' : '#4a4f58';
    R(x + 1, y + 2, 4, 3, c); R(x + 5, y + 2, 3, 1, c); R(x + 5, y + 4, 3, 1, c);
    if (bonus === 'rusty') R(x + 2, y + 3, 1, 1, '#c87a3a');
  } else if (bonus === 'winchester') {
    R(x + 1, y + 4, 3, 2, '#7a4a24'); R(x + 3, y + 3, 2, 2, '#c8a040'); R(x + 4, y + 2, 4, 1, '#4a4f58'); R(x + 5, y + 5, 1, 1, '#4a4f58');
  } else if (bonus === 'akimbo') {
    R(x + 1, y + 1, 3, 1, '#4a4f58'); R(x + 1, y + 2, 1, 2, '#7a4a24');
    R(x + 4, y + 4, 3, 1, '#4a4f58'); R(x + 6, y + 5, 1, 2, '#7a4a24');
  }
  else if (bonus === 'dynamite') { R(x + 3, y + 2, 3, 5, '#c0392b'); R(x + 4, y + 1, 1, 1, '#5a3a20'); R(x + 5, y, 1, 1, '#f8d070'); }
  else if (bonus === 'sand') { R(x + 2, y + 1, 4, 5, '#c8a870'); R(x + 3, y, 2, 1, '#7a4a24'); R(x + 1, y + 6, 6, 1, '#e0c088'); }
  else { R(x + 3, y + 1, 2, 5, '#e0b040'); R(x + 1, y + 3, 6, 2, '#e0b040'); R(x + 2, y + 5, 1, 1, '#e0b040'); R(x + 5, y + 5, 1, 1, '#e0b040'); }
}

// Caisse bonus (symbole du contenu dessus) ou sac de sable
function drawCrate(ctx, x, base, bonus, k, now) {
  const { R, box } = paint(ctx);
  const h = Math.round(13 * k);
  if (h < 2) return;
  const y = base - h;
  if (bonus === 'sand') {
    box(x - 6, y + 2, 12, h - 2, '#c8a870');
    R(x - 7, y + 4, 1, Math.max(1, h - 6), OUT); R(x + 6, y + 4, 1, Math.max(1, h - 6), OUT);
    R(x - 6, y + 4, 2, Math.max(1, h - 5), '#a8884a');
    if (k > 0.8) {
      box(x - 2, y - 1, 4, 3, '#c8a870'); R(x - 3, y + 2, 6, 1, '#7a4a24');
      R(x - 3, y + 6, 6, 1, '#8a6a3a'); R(x - 2, y + 8, 4, 1, '#8a6a3a');
      R(x + 7, base - 2, 3, 1, '#e0c088'); R(x + 9, base - 1, 2, 1, '#e0c088');
    }
  } else {
    box(x - 8, y, 16, h, '#a8783c');
    R(x - 7, y + 1, 14, 1, '#c8984c'); R(x - 8, y + Math.round(h / 2), 16, 1, '#7a5428');
    if (k > 0.8) bonusIcon(R, x - 4, y + 3, bonus);
  }
  // halo doré qui tourne autour pour attirer l'œil
  if (k > 0.8) {
    ring(ctx, x, base - 7, 13, 11, Math.floor(now / 200) % 2 ? '#f8d070' : '#fff6c0', 2, now / 70);
    const a = now / 160;
    ctx.fillStyle = '#fffbe8';
    ctx.fillRect(Math.round(x + Math.cos(a) * 15), Math.round(base - 7 + Math.sin(a) * 13), 1, 1);
  }
}

// Sac de butin au-dessus d'un porteur : le bonus revient à celui qui l'abat
function drawLoot(ctx, x, y, bonus, now) {
  const { R, box } = paint(ctx);
  const bob = Math.round(Math.sin(now / 160) * 2);
  y += bob;
  R(x - 1, y + 12, 3, 3, OUT); R(x, y + 13, 1, 3, '#f8d070'); // petite flèche vers le porteur
  box(x - 7, y, 14, 11, '#c8a060');
  R(x - 4, y - 2, 8, 2, OUT); R(x - 3, y - 1, 6, 1, '#7a4a24');
  bonusIcon(R, x - 4, y + 2, bonus);
  if (Math.floor(now / 180) % 2) { R(x - 10, y - 2, 1, 1, '#fffbe8'); R(x + 9, y + 9, 1, 1, '#fffbe8'); }
  else { R(x + 10, y - 1, 1, 1, '#fffbe8'); R(x - 9, y + 10, 1, 1, '#fffbe8'); }
}

// El Diablo : personnage + cartouchière et deux revolvers, puis silhouette rouge pour son aura.
const bossCache = new Map();
function bossSprite(flash, blink, t) {
  const frame = Math.floor(t / 300) % 4;
  const key = `${flash}${blink}${frame}`;
  let c = bossCache.get(key);
  if (c) return c;
  const base = S.characterSprite(BOSS, { blink, t, tint: flash ? 'rgba(255,60,40,0.6)' : null });
  const img = S.makeCanvas(base.width, base.height);
  const x = img.getContext('2d');
  x.drawImage(base, 0, 0);
  const R = (a, b, w, h, col) => { x.fillStyle = col; x.fillRect(a, b, w, h); };
  for (let k = 0; k < 10; k++) { R(13 + k * 2, 35 + k * 2, 3, 2, OUT); if (k % 2) R(14 + k * 2, 35 + k * 2, 1, 2, '#e0b040'); }
  for (const dir of [1, -1]) {
    const gx = dir > 0 ? 28 : 20 - 10;
    R(gx, 40, 8, 7, OUT); R(gx + 1, 41, 6, 5, SKIN[BOSS.skin]);
    R(gx + (dir > 0 ? 1 : -1), 34, 9, 9, OUT); R(gx + (dir > 0 ? 2 : 0), 35, 7, 7, '#4a4f58'); R(gx + (dir > 0 ? 3 : 1), 36, 5, 5, '#c8a040'); R(gx + (dir > 0 ? 4 : 2), 37, 3, 3, OUT);
  }
  const sil = S.makeCanvas(base.width, base.height);
  const sx = sil.getContext('2d');
  sx.drawImage(img, 0, 0);
  sx.globalCompositeOperation = 'source-in';
  sx.fillStyle = '#ff3020';
  sx.fillRect(0, 0, sil.width, sil.height);
  c = { img, sil };
  if (bossCache.size > 40) bossCache.clear();
  bossCache.set(key, c);
  return c;
}

// El Diablo à cheval (la poursuite) : son cheval noir, puis la même silhouette rouge pour l'aura (ox, oy : les pieds)
const BOSS_RIDER = riderLook(BOSS, '#7a1a14', 'diablo');
function bossHorse(frame, flash) {
  const key = `horse${frame}${flash}`;
  let c = bossCache.get(key);
  if (c) return c;
  const base = horseSprite('#2a2220', '#141010', frame, BOSS_RIDER);
  const img = S.makeCanvas(base.width, base.height);
  const x = img.getContext('2d');
  x.drawImage(base, 0, 0);
  if (flash) { x.globalCompositeOperation = 'source-atop'; x.fillStyle = 'rgba(255,60,40,0.6)'; x.fillRect(0, 0, img.width, img.height); x.globalCompositeOperation = 'source-over'; }
  const sil = S.makeCanvas(base.width, base.height);
  const sx = sil.getContext('2d');
  sx.drawImage(base, 0, 0);
  sx.globalCompositeOperation = 'source-in';
  sx.fillStyle = '#ff3020';
  sx.fillRect(0, 0, sil.width, sil.height);
  c = { img, sil, ox: base.ox, oy: base.oy };
  if (bossCache.size > 40) bossCache.clear();
  bossCache.set(key, c);
  return c;
}

// ------------------------------------------------------------ scène
export class ShooterScene extends MiniScene {
  constructor(canvas, hooks) {
    super(canvas, hooks);
    this.kind = 'shooter';
    this.showEnv = true;
    this.cv.style.cursor = 'none';
    this.world = null;
    this.ammo = AMMO;
    this.reloadUntil = 0;
    this.red = 0;
  }

  title() { return 'FUSILLADE À DUSTY GULCH'; }
  variantName() { return this.world?.layout.edge.name; }
  help() {
    return [
      this.touch ? 'TOUCHE L\'ÉCRAN : TIRER À CET ENDROIT' : 'SOURIS : VISER - CLIC : TIRER',
      this.touch ? 'BOUTON RECHARGER' : 'CLIC DROIT, R OU ESPACE : RECHARGER',
      'BANDIT +100 - TOIT OU CAVALIER +150 - BOUTEILLE +50',
      'MAINS EN L\'AIR = CIVIL : -100 - TOUCHÉ : -50',
      'BONUS : CAISSES DU PROSPECTEUR, SACS DES BANDITS',
      'DYNAMITE EN VOL : ABATS-LA +75, SINON TOUS -75',
      this.touch ? 'GARE AUX EMBUSCADES - BOUTON PARIER : EL DIABLO' : 'GARE AUX EMBUSCADES - TOUCHE B : PARI SUR EL DIABLO',
    ];
  }

  // rattrapage du dernier : barillet plus grand, rechargement plus rapide
  get behind() {
    const ps = this.state?.players;
    if (!ps || ps.length < 2) return false;
    const alive = ps.filter((p) => !p.left);
    const mine = ps[this.me].score, best = Math.max(...alive.map((p) => p.score)), worst = Math.min(...alive.map((p) => p.score));
    return mine === worst && best - mine >= BEHIND;
  }
  get cap() { return this.behind ? AMMO_BACK : AMMO; }
  goText() { return 'DÉGAINEZ !'; }
  // cinématique d'ouverture : le train entre en gare, dans le décor de la gare (shooterstation.js)
  cutCaption() { return `${this.town}, GARE DU PACIFIQUE`; }
  cutExtra() { return { establish: (ctx, el) => shooterIntro(ctx, el, this.amb, this.now, this.town) }; }

  setup(seed) {
    this.world = shooterWorld(seed, this.n, this.state.variant);
    // mode histoire : enseignes et nom de la ville de l'épisode (story/decos : { town, signs: { SALOON: 'BUCKSHOT SALOON' } }),
    // changés avant le premier dessin de la rue (les panneaux sont taillés à la longueur du texte)
    const sd = this.hooks.story?.deco;
    this.town = sd?.town || this.world.layout.edge.town || 'DUSTY GULCH'; // la ville des abords tirés (Red Rock pour la mine du Vieux Joe)
    this.gare = `GARE DE ${this.town}`;
    if (sd?.signs) for (const b of this.world.layout.buildings) if (sd.signs[b.sign]) b.sign = sd.signs[b.sign];
    this.deco = new Deco(this.world, seed);
    // abords peints avec un décor du mode histoire : chargé maintenant, prêt bien avant la fin de la gare
    if (this.world.layout.edge.set) loadSets().catch((e) => console.error(e));
    // les décors sont peints une fois (quelques dizaines de ms chacun) : préparés un par un pendant la cinématique,
    // plutôt qu'au premier passage dans chaque section (à-coup en pleine partie)
    const L = this.world.layout;
    const warm = [() => stationPano(L.seed), () => edgePano(L.edge), () => streetPano(L), () => (L.lair === 'mine' ? minePano() : L.lair === 'saloon' ? saloonPano() : null)];
    warm.forEach((f, k) => setTimeout(() => { if (this.world?.layout === L) f(); }, 300 + k * 400));
    this.spots = this.world.spots;
    this.boss = this.world.targets.find((tg) => tg.kind === 'boss');
    this.bossTnts = this.world.targets.filter((tg) => tg.kind === 'tnt' && tg.from === this.boss.id); // sa dynamite (mine, poursuite)
    this.dead = new Map(); // id -> { by, at }
    this.hp = new Map();
    this.fireFx = [];
    this.holes = [];
    this.ammo = AMMO;
    this.reloadUntil = 0;
    this.shots = 0;
    this.kills = 0;
    this.bossFlash = -1e9;
    this.aims = new Map(); // `${cible}:${tir}` -> joueur visé (annoncé par l'hôte)
    this.seenEvents = new Set();
    this.wagered = false;
    this.lightFlash = -1e9; // éclair d'un coup de feu pendant la panne de lumière
    this.power = null; // bonus actif : une arme (BONUSES[...].gun) ou shield
    this.powerUntil = 0;
    this.powerMs = BONUS_MS;
    this.gunAmmo = 0;
    this.gunAt = -1e9; // dernier tir de l'arme (recul, éclair)
    this.sandUntil = -1e9;
    this.firing = false;
    this.nextShot = 0;
    this.powers = {}; // bonus des autres joueurs (pour l'affichage)
    this.booms = [];
    this.feed = []; // qui a ramassé quel bonus
    this.cues = new Set();
    this.remote = {};
    for (let i = 0; i < this.n; i++) if (i !== this.me) this.remote[i] = { x: W / 2, y: H / 2, tx: W / 2, ty: H / 2, shot: -1e9 };
  }

  applySync(st) {
    for (const [id, by] of st.claimed || []) this.dead.set(id, { by, at: -1e9 });
    for (const [id, hp] of st.hp || []) this.hp.set(id, hp);
  }

  // ---------------------------------------------------------- géométrie à l'écran
  rise(tg, t) {
    const d = this.dead.get(tg.id);
    if (d) return clamp01(1 - (t - d.at) / 260);
    return Math.min(clamp01((t - tg.t0) / 180), clamp01((tg.t1 - t) / 180));
  }

  bossRage() { return (this.hp.get(this.boss.id) ?? this.boss.hp) <= this.boss.hp / 2; }

  // haut de la silhouette d'El Diablo : il se relève de derrière la rambarde (saloon) ou dans son wagonnet (mine) ;
  // à cheval, le haut du cavalier
  bossTop(t) {
    const h = Math.round(56 * BOSS_SCALE), lair = this.world.lair;
    if (lair === 'chase') return CHASE.y - Math.round(54 * CHASE.scale);
    const rise = 1 - clamp01((t - this.boss.t0) / 500);
    return lair === 'mine' ? MINE.balcony - 74 + Math.round(rise * h * 0.6) : SAL.balcony - h + Math.round(rise * h);
  }
  // x (dans la section) d'El Diablo ; à cheval, il arrive au galop par la droite
  bossXAt(t) {
    const x = bossX(t);
    return this.world.lair === 'chase' ? x + (1 - clamp01((t - this.boss.t0) / 900)) ** 2 * 240 : x;
  }
  chasing(cam) { return cam.sec === 'saloon' && this.world.lair === 'chase'; }

  hitRect(tg, cx, k) {
    if (tg.arc) {
      const p = crateAt(tg, this.t);
      return { x: p.x - 9, y: p.y - 8, w: 18, h: 16 };
    }
    if (tg.ride) {
      const x = rideX(tg, this.t) - cx;
      return { x: x - 30, y: tg.ride.y - 70, w: 62, h: 56 };
    }
    const s = this.spots[tg.spot];
    const sx = s.cx - cx;
    if (tg.kind === 'boss') {
      const bx = this.bossXAt(this.t) - cx, top = this.bossTop(this.t), lair = this.world.lair;
      // à cheval : le cavalier et le garrot ; dans la mine, ce qui dépasse du wagonnet
      if (lair === 'chase') return { x: bx - Math.round(14 * CHASE.scale), y: top, w: Math.round(30 * CHASE.scale), h: Math.round(36 * CHASE.scale) };
      return { x: bx - 20, y: top + 6, w: 40, h: Math.max(0, lair === 'mine' ? MINE.balcony - 30 - top : SAL.balcony - top - 10) }; // mine : jusqu'au bord du wagonnet
    }
    if (tg.kind === 'bottle') return { x: sx - 4, y: s.base - 16, w: 8, h: 16 };
    if (tg.kind === 'crate') return { x: sx - 9, y: s.base - 15, w: 18, h: 15 };
    const y = s.base - 56 + (1 - k) * 56;
    const fig = { x: sx - 14, y: y + 6, w: 28, h: 50 };
    const clip = { x: s.x - cx, y: s.y, w: s.w, h: s.h };
    const x0 = Math.max(fig.x, clip.x), y0 = Math.max(fig.y, clip.y);
    const x1 = Math.min(fig.x + fig.w, clip.x + clip.w), y1 = Math.min(fig.y + fig.h, clip.y + clip.h);
    return x1 > x0 && y1 > y0 ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null;
  }

  visible(t, cam) {
    return this.world.targets.filter((tg) => {
      if (targetSec(tg) !== cam.sec || t < tg.t0) return false;
      if (this.defused(tg)) return false;
      const d = this.dead.get(tg.id);
      if (d && tg.ride) return t <= tg.t1 + 200; // le cheval s'enfuit sans son cavalier
      if (d) return t - d.at < (tg.kind === 'boss' ? 1600 : 600);
      return t <= tg.t1 + 200;
    });
  }

  // bâton de dynamite jamais lancé : son lanceur a été abattu avant
  defused(tg) {
    if (tg.kind !== 'tnt' || tg.from == null) return false;
    const d = this.dead.get(tg.from);
    return !!d && d.at < tg.t0;
  }

  // ---------------------------------------------------------- entrées
  onMove(m) {
    if (this.t0 != null) this.sendLive({ c: [Math.round(m.x), Math.round(m.y)] });
  }

  onAlt() { this.reload(); }
  onKey(k) {
    if (k === 'r' || k === ' ') this.reload();
    // pari sur El Diablo, pendant les 6 s qui suivent son arrivée
    if (k === 'b' && this.canWager()) {
      this.wagered = true;
      this.hooks.send({ kind: 'wager' });
    }
  }

  canWager() { return this.playing && !this.wagered && shooterEventAt(this.world.events || [], 'wager', this.t); }

  reload() {
    if (!this.playing || this.ammo >= this.cap || this.reloadUntil || this.gun) return;
    this.reloadUntil = this.t + (this.behind ? RELOAD_BACK : RELOAD);
    sfx('reload');
  }

  // arme ramassée (mitrailleuse, vieille Gatling, Winchester, deux colts) : tant qu'il reste du temps et des balles
  get gun() {
    const g = BONUSES[this.power]?.gun;
    return g && this.t < this.powerUntil && this.gunAmmo > 0 ? g : null;
  }
  get shielded() { return this.power === 'shield' && this.t < this.powerUntil; }

  onFire(m) {
    if (!this.playing) return;
    const gun = this.gun;
    if (gun) {
      // armes automatiques : on garde le bouton enfoncé ; les deux colts tirent à chaque clic
      if (gun.auto) this.firing = true;
      if (this.t >= this.nextShot) this.fireGun(m, gun);
      return;
    }
    if (this.reloadUntil) { sfx('dry'); return; }
    if (this.ammo <= 0) { sfx('dry'); this.reload(); return; }
    this.ammo--;
    this.shoot(m);
  }

  onRelease() { this.firing = false; }

  fireGun(m, gun) {
    this.nextShot = this.t + gun.rate;
    this.gunAt = this.now;
    if (gun.dual) {
      this.shoot({ x: m.x - 5, y: m.y }, gun);
      this.shoot({ x: m.x + 5, y: m.y }, gun, true);
    } else this.shoot(m, gun);
    if (!gun.mag) return;
    this.gunAmmo -= gun.dual ? 2 : 1;
    if (this.gunAmmo > 0) return;
    // chargeur vide : retour au revolver
    this.power = null;
    this.firing = false;
    this.banner = { text: 'PLUS DE BALLES : RETOUR AU REVOLVER', col: '#f0a070', at: this.t };
    sfx('dry', 0.15);
  }

  shoot(at, gun = null, quiet = false) {
    const t = this.t;
    const sp = gun?.spread || 0;
    const m = sp ? { x: at.x + (Math.random() - 0.5) * sp, y: at.y + (Math.random() - 0.5) * sp } : at;
    this.shots++;
    if (!quiet) sfx(gun ? gun.sfx : 'revolver');
    this.lightFlash = this.now;
    this.shake = gun?.auto ? (gun.sfx === 'rifle' ? 2.5 : 1.2) : 2;
    this.sendLive({ c: [Math.round(at.x), Math.round(at.y)], s: 1 }, !gun?.auto);
    const cam = camAt(t);
    let hit = null;
    for (const tg of this.visible(t, cam)) {
      if (this.dead.has(tg.id)) continue;
      const k = this.rise(tg, t);
      if (k < 0.35) continue;
      const r = this.hitRect(tg, cam.x, k);
      if (r && m.x >= r.x - 1 && m.x <= r.x + r.w + 1 && m.y >= r.y - 1 && m.y <= r.y + r.h + 1) hit = tg;
    }
    if (hit) {
      if (hit.kind === 'boss') this.bossFlash = t;
      else this.dead.set(hit.id, { by: this.me, at: t, local: true });
      if (hit.kind === 'bottle') { sfx('glass'); this.shards(m.x, m.y, BOTTLES[hit.look % BOTTLES.length]); }
      else if (hit.kind === 'crate') { sfx('crate'); this.shards(m.x, m.y, hit.bonus === 'sand' ? '#d8c088' : '#a8783c'); }
      else if (hit.kind === 'tnt') { sfx('boom'); this.explode(m.x, m.y); }
      else this.puff(m.x, m.y, '#c0392b', 5);
      this.hooks.send({ kind: 'hit', id: hit.id });
      this.deco.scare(cam.sec, m.x + cam.x, m.y);
    } else if (!this.deco.shoot(cam.sec, m.x + cam.x, m.y, t) && !this.chasing(cam)) {
      // rien de cassable : un impact dans le mur (pas pendant la poursuite : le décor défile)
      this.holes.push({ wx: m.x + cam.x, y: m.y, sec: cam.sec });
      if (this.holes.length > 40) this.holes.shift();
      this.puff(m.x, m.y, '#d8c8a8', 4);
    }
  }

  remoteLive(i, d) {
    const r = this.remote[i];
    if (!r || !Array.isArray(d.c)) return;
    r.tx = d.c[0];
    r.ty = d.c[1];
    if (d.s) {
      r.shot = this.t;
      sfx('far');
      // les balles des autres cassent aussi le décor et font fuir les bêtes
      const cam = camAt(Math.max(0, this.t));
      if (this.deco) this.deco.shoot(cam.sec, d.c[0] + cam.x, d.c[1], this.t);
    }
  }

  // ---------------------------------------------------------- événements de l'hôte
  targetScreen(tg, t) {
    if (tg.arc) return crateAt(tg, t);
    const cam = camAt(t);
    if (tg.ride) return { x: rideX(tg, t) - cam.x, y: tg.ride.y - 68 };
    const s = this.spots[tg.spot];
    if (tg.kind === 'boss') return { x: this.bossXAt(t) - cam.x, y: this.bossTop(t) + 10 };
    return { x: s.cx - cam.x, y: s.kind === 'bottle' ? s.base - 22 : Math.max(s.y + 4, s.base - 50) };
  }

  onEvent(ev) {
    const t = this.t;
    if (ev.type === 'hit') {
      const tg = this.world.targets[ev.id];
      const p = this.targetScreen(tg, t);
      if (tg.kind === 'boss') {
        this.hp.set(ev.id, ev.hp);
        this.bossFlash = t;
      }
      if (ev.kill) {
        const d = this.dead.get(ev.id);
        this.dead.set(ev.id, { by: ev.by, at: d ? d.at : t });
        if (ev.by === this.me && tg.kind !== 'civil' && tg.kind !== 'supply') this.kills++;
      }
      const big = tg.kind === 'boss' && ev.kill;
      this.popup(p.x, p.y, `${ev.pts > 0 ? '+' : ''}${ev.pts}`, ev.pts < 0 ? '#f0705a' : this.color(ev.by), big || ev.by === this.me);
      if (ev.by === this.me) sfx(ev.pts < 0 ? 'bad' : big ? 'victory' : 'coin');
      if (big) { this.banner = { text: 'EL DIABLO EST TOMBÉ !', col: '#f8d070', at: t }; this.shake = 8; this.whiteUntil = this.now + 120; }
      if (tg.kind === 'civil' && ev.by === this.me) this.popup(p.x, p.y - 12, 'UN CIVIL !', '#f0705a');
      if (tg.kind === 'supply' && ev.by === this.me) this.popup(p.x, p.y - 12, 'LE PROSPECTEUR !', '#f0705a');
      if (ev.boom) this.explode(p.x, p.y + 20);
      if (tg.kind === 'tnt' && ev.by !== this.me) { sfx('boom'); this.explode(p.x, p.y); }
      // lanceur abattu à temps : sa dynamite ne part pas
      if (ev.defused) for (const d of this.world.targets) if (d.kind === 'tnt' && d.from === ev.id) this.dead.set(d.id, { by: -1, at: -1e9 });
      if (ev.bonus) {
        if (tg.loot && !ev.boom) { this.shards(p.x, p.y, '#e0b040'); sfx('crate'); }
        this.gotBonus(ev.bonus, ev.by, p);
      }
    } else if (ev.type === 'fire' && ev.blocked) {
      const tg = this.world.targets[ev.id];
      if (!this.dead.has(ev.id)) this.fireFx.push({ id: ev.id, at: t });
      if (ev.victim === this.me) {
        sfx('clank');
        this.popup(W / 2, 150, 'PROTÉGÉ !', '#f8d070', true);
      } else {
        const p = this.targetScreen(tg, t);
        this.popup(p.x, p.y, 'BLOQUÉ', this.color(ev.victim));
      }
    } else if (ev.type === 'tntBoom') {
      // la dynamite a touché le sol : tout le monde encaisse (sauf les protégés)
      const tg = this.world.targets[ev.id];
      this.dead.set(ev.id, { by: -1, at: t });
      const p = crateAt(tg, tg.t1);
      this.explode(p.x, Math.min(p.y, H - 12));
      sfx('boom');
      this.shake = 9;
      this.whiteUntil = this.now + 80;
      for (const [j, pts] of ev.hurt) {
        if (j === this.me) {
          if (pts < 0) { this.red = 0.75; sfx('hurt'); }
          this.popup(W / 2, 150, pts < 0 ? `${pts}` : 'PROTÉGÉ !', pts < 0 ? '#f0705a' : '#f8d070', true);
        } else if (pts) {
          const r = this.remote[j];
          if (r) this.popup(r.x, r.y - 10, `${pts}`, this.color(j));
        }
      }
    } else if (ev.type === 'aim') {
      this.aims.set(`${ev.id}:${ev.k}`, ev.victim);
    } else if (ev.type === 'wager') {
      const mine = ev.by === this.me;
      if (mine) this.wagered = true;
      sfx('coin');
      this.popup(mine ? W / 2 : this.remote[ev.by]?.x ?? W / 2, mine ? 130 : (this.remote[ev.by]?.y ?? 100) - 12, mine ? `TU MISES ${ev.stake} $` : `${this.name(ev.by).toUpperCase()} MISE`, this.color(ev.by), mine);
    } else if (ev.type === 'wagerEnd') {
      const mine = ev.results.find(([j]) => j === this.me);
      if (ev.killer >= 0 && ev.results.some(([j]) => j === ev.killer)) {
        this.banner = { text: `${ev.killer === this.me ? 'TU EMPOCHES' : `${this.name(ev.killer).toUpperCase()} EMPOCHE`} ${WAGER.prize} $ !`, col: '#f8d070', at: t };
      }
      if (mine) {
        sfx(mine[1] > 0 ? 'victory' : 'bad');
        this.popup(W / 2, 150, `${mine[1] > 0 ? '+' : ''}${mine[1]}`, mine[1] > 0 ? '#f8d070' : '#f0705a', true);
      }
    } else if (ev.type === 'fire') {
      if (!this.dead.has(ev.id)) this.fireFx.push({ id: ev.id, at: t });
      this.lightFlash = this.now;
      if (ev.victim === this.me) {
        this.red = 0.75;
        this.shake = 8;
        sfx('revolver');
        sfx('hurt');
        this.popup(W / 2, 150, `${ev.pts}`, '#f0705a', true);
      } else {
        sfx('far');
        const r = this.remote[ev.victim];
        if (r) this.popup(r.x, r.y - 10, `${ev.pts}`, this.color(ev.victim));
      }
    } else if (ev.type === 'left') {
      const r = this.remote[ev.who];
      if (r) r.left = true;
    }
  }

  gotBonus(bonus, by, p) {
    const t = this.t;
    const name = BONUSES[bonus]?.name || bonus;
    const mine = by === this.me;
    this.popup(p.x, p.y - 12, name, this.color(by), mine);
    this.feed.push({ by, bonus, at: t });
    if (this.feed.length > 3) this.feed.shift();
    const gun = BONUSES[bonus]?.gun;
    if (gun || bonus === 'shield') {
      const ms = gun ? gun.ms : BONUS_MS;
      if (mine) {
        this.power = bonus;
        this.powerUntil = t + ms;
        this.powerMs = ms;
        this.gunAmmo = gun ? gun.mag || Infinity : 0;
        this.nextShot = 0;
        this.reloadUntil = 0;
        this.ammo = this.cap;
        sfx(bonus === 'gatling' ? 'yeehaw' : 'power'); // la mitrailleuse : rafale et cri de Corsi
        this.banner = { text: GUN_TXT[bonus] || 'ÉTOILE DU SHÉRIF : PROTÉGÉ !', col: '#f8d070', at: t };
      } else this.powers[by] = { kind: bonus, until: t + ms };
    } else if (bonus === 'dynamite') {
      sfx('boom');
      this.shake = mine ? 10 : 6;
      this.whiteUntil = this.now + 90;
      this.banner = { text: mine ? 'DYNAMITE !' : `DYNAMITE DE ${this.name(by).toUpperCase()} !`, col: '#f0705a', at: t };
    } else if (bonus === 'sand') {
      sfx('sand');
      if (mine) this.banner = { text: 'TEMPÊTE DE SABLE ENVOYÉE !', col: '#f8d070', at: t };
      else {
        this.sandUntil = t + SAND_MS;
        this.banner = { text: 'TEMPÊTE DE SABLE !', col: '#f0a070', at: t };
      }
    }
  }

  explode(x, y) {
    this.booms.push({ x, y, at: this.t });
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * Math.PI * 2, v = 0.04 + Math.random() * 0.12;
      this.parts.push({ type: 'dot', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 0.05, g: 0.0003, col: i % 3 ? '#f87818' : '#fff070', t: 0, max: 500 + Math.random() * 300 });
    }
  }

  // ---------------------------------------------------------- effets
  puff(x, y, col, n) {
    for (let i = 0; i < n; i++) this.parts.push({ type: 'dot', x, y, vx: (Math.random() - 0.5) * 0.12, vy: -Math.random() * 0.1, g: 0.0004, col, t: 0, max: 300 + Math.random() * 200 });
  }

  shards(x, y, col) {
    for (let i = 0; i < 10; i++) this.parts.push({ type: 'dot', x, y, vx: (Math.random() - 0.5) * 0.2, vy: -Math.random() * 0.15, g: 0.0008, col: i % 3 ? col : '#f4ecd8', t: 0, max: 500 });
  }

  cue(name, at, fn) {
    if (this.t >= at && !this.cues.has(name)) { this.cues.add(name); if (this.t < at + 1500) fn(); }
  }

  update(dt) {
    if (!this.world) return;
    const t = this.t;
    this.deco.update(dt, this.now);
    if (this.reloadUntil && t >= this.reloadUntil) { this.reloadUntil = 0; this.ammo = this.cap; }
    // les annonces d'événements (embuscade, prime, panne, pari) arrivent toutes seules, au bon moment
    for (const e of this.world.events || []) {
      const at = e.t0 + (e.id === 'wager' ? WAGER.banner : 0); // le pari s'annonce après l'arrivée d'El Diablo
      if (t >= at && !this.seenEvents.has(e.id)) {
        this.seenEvents.add(e.id);
        if (t < at + 1500) {
          this.banner = { text: EVENT_TXT[e.id][0], col: EVENT_TXT[e.id][1], at: t };
          sfx(EVENT_SFX[e.id] || 'power');
          if (e.id === 'wager') this.popup(W / 2, 112, `MISE ${WAGER.stake} $ - CELUI QUI L'ABAT : ${WAGER.prize} $`, '#fdf6e0');
        }
      }
    }
    if (this.firing) {
      const gun = this.gun;
      if (!gun || !gun.auto || !this.playing) this.firing = false;
      else if (t >= this.nextShot) this.fireGun(this.mouse, gun);
    }
    // entrée d'El Diablo : cœur qui bat, puis il surgit dans un coup de tonnerre
    this.cue('bossBeat', BOSS_T0 - 1600, () => sfx('heartbeat'));
    this.cue('bossBeat2', BOSS_T0 - 800, () => sfx('heartbeat'));
    this.cue('bossIn', BOSS_T0, () => { sfx('thunder'); sfx('bad'); if (this.world.lair === 'chase') sfx('neigh'); this.shake = 9; });
    // la poursuite s'engage au galop ; El Diablo allume ses bâtons de dynamite (mine, poursuite)
    if (this.world.lair === 'chase') this.cue('chaseGo', SALOON_START + 600, () => { sfx('neigh'); sfx('whip'); });
    for (const tg of this.bossTnts) if (!this.dead.has(this.boss.id)) this.cue(`btnt${tg.id}`, tg.t0, () => sfx('whip'));
    // le ravitailleur lance sa caisse
    for (const tg of this.world.targets) {
      if (tg.kind !== 'supply' || this.dead.has(tg.id)) continue;
      this.cue(`sup${tg.id}`, tg.throwAt ?? 1e9, () => {
        const p = this.targetScreen(tg, t);
        this.popup(p.x, p.y - 18, 'ATTRAPEZ !', '#b8e070');
        sfx('whip');
      });
    }
    for (const tg of this.world.targets) {
      if (tg.throwAt && tg.kind === 'bandit' && !this.dead.has(tg.id)) this.cue(`tnt${tg.id}`, tg.throwAt, () => sfx('whip'));
    }
    this.booms = this.booms.filter((b) => t - b.at < 500);
    for (const r of Object.values(this.remote)) {
      const k = Math.min(1, dt * 0.015);
      r.x += (r.tx - r.x) * k;
      r.y += (r.ty - r.y) * k;
    }
    this.red = Math.max(0, this.red - dt * 0.0015);
    for (const p of this.parts) { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += (p.g || 0) * dt; }
    this.parts = this.parts.filter((p) => p.t < p.max);
    this.fireFx = this.fireFx.filter((f) => t - f.at < 160);
  }

  // ---------------------------------------------------------- rendu
  render(ctx) {
    if (!this.world) return;
    const t = Math.max(0, Math.min(this.t, this.duration));
    const cam = camAt(t);
    const cx = Math.round(cam.x);
    const amb = this.amb, now = this.now;
    const lair = this.world.lair, chase = this.chasing(cam);
    const outdoor = cam.sec !== 'saloon' || chase;
    const L = this.world.layout;
    const pano = cam.sec === 'street' ? streetPano(L) : cam.sec === 'station' ? stationPano(L.seed) : cam.sec === 'edge' ? edgePano(L.edge)
      : chase ? null : lair === 'mine' ? minePano() : saloonPano();
    // la fusillade sur le calque teinté du décor : impacts, figurants, bandits, abris, bouteilles
    const depth = (tg) => (tg.arc ? 999 : tg.ride ? tg.ride.y : this.spots[tg.spot].base);
    const vis = this.visible(t, cam).sort((a, b) => depth(a) - depth(b));
    const play = (w) => {
      for (const h of this.holes) {
        if (h.sec !== cam.sec) continue;
        w.fillStyle = OUT; w.fillRect(Math.round(h.wx - cx) - 1, Math.round(h.y) - 1, 2, 2);
      }
      this.deco.drawBack(w, cam.sec, cx, t, now);
      for (const tg of vis) {
        if (tg.kind === 'boss') this.drawBoss(w, tg, cx, t);
        else if (tg.kind === 'rider') this.drawRider(w, tg, cx, t);
        else if (tg.kind !== 'bottle' && tg.kind !== 'crate' && tg.kind !== 'tnt') this.drawFigure(w, tg, cx, t);
      }
      if (pano) w.drawImage(pano.front, -cx, 0);
      else drawChaseFront(w, t);
      for (const tg of vis) {
        if (tg.kind !== 'bottle') continue;
        const s = this.spots[tg.spot];
        drawBottle(w, Math.round(s.cx - cx), s.base, tg.look, this.rise(tg, t));
      }
      this.deco.drawFront(w, cam.sec, cx, t, now);
    };
    // abords repris d'un décor du mode histoire : storyset.js peint le ciel, le lointain, le fond, ses lumières et
    // sa teinte, et la fusillade se joue sur son calque des acteurs (s'il n'est pas encore chargé : ciel et abris seuls)
    const inSet = cam.sec === 'edge' && !!L.edge.set && drawSet(ctx, L.edge.set, cx, amb, now, { actors: play });
    if (!inSet) {
      // décor teinté par l'ambiance : façades, silhouettes, abris, bouteilles
      let w;
      if (cam.sec === 'street') w = drawStreet(ctx, cam.x, this.world.layout, amb, now, this.town);
      else if (cam.sec === 'station') {
        w = skyAndFar(ctx, amb, now, -cam.x * 0.12 - 120);
        w.drawImage(pano.bg, -cx, 0);
        canvasText(w, this.gare, STA.building.x + 150 - cx, STA.building.top + 33, { size: 8, color: '#3a2214', shadow: '#c8b07c' });
      } else if (cam.sec === 'edge') {
        w = skyAndFar(ctx, amb, now, -cam.x * 0.12 - 40);
        if (pano.bg) w.drawImage(pano.bg, -cx, 0);
        edgeSigns(w, cx, L.edge);
      } else if (chase) {
        // la poursuite : le ciel ne bouge pas, tout le reste défile
        w = skyAndFar(ctx, amb, now, -60);
        drawChaseBack(w, t);
      } else {
        // le saloon, ou la mine (à la lueur des lanternes, quelle que soit l'heure dehors)
        w = amb.begin(ctx, lair === 'mine' ? '#b4a08c' : amb.env.inside);
        w.drawImage(pano.bg, -cx, 0);
      }
      play(w);
      amb.end(ctx, now);
    }
    if (cam.sec === 'street') streetLights(ctx, cam.x, L, amb);
    else if (cam.sec === 'edge') edgeLights(ctx, cx, L.edge, amb);
    else if (cam.sec === 'station') {
      // la nuit : fenêtres de la gare et des voitures de voyageurs éclairées, lampes du quai
      if (amb.env.lights) {
        for (const wn of STA.building.windows) amb.window(ctx, wn.x - cx, wn.y, wn.w, wn.h);
        for (const wg of L.train) if (wg.type === 'passenger') for (const wn of wagonOpenings(wg).wins) amb.window(ctx, wn.x - cx, wn.y, wn.w, wn.h);
        for (const lx of [364, 564, 764, 1000]) amb.glow(ctx, lx - cx, 101, 22);
        amb.glow(ctx, STA.loco.x + STA.loco.w - 7 - cx, 97, 30, '255,230,150');
      }
    } else if (lair === 'saloon') {
      ctx.globalCompositeOperation = 'lighter';
      for (const lx of [200, 520]) {
        if (!this.deco.lit(lx)) continue; // lustre abattu : plus de lumière
        const fl = Math.sin(now / 90 + lx) + Math.sin(now / 37);
        for (const [r, a] of [[44, 0.04], [28, 0.05], [14, 0.06]]) S.disc(ctx, lx - cx, 20, r + Math.round(fl), `rgba(255,170,70,${a})`);
      }
      ctx.globalCompositeOperation = 'source-over';
    } else if (lair === 'mine') {
      // la lueur des lanternes de la mine (une lanterne abattue n'éclaire plus)
      ctx.globalCompositeOperation = 'lighter';
      for (const it of this.deco.items) {
        if (it.sec !== 'saloon' || it.kind !== 'lantern' || it.hits) continue;
        const fl = Math.sin(now / 80 + it.x) + Math.sin(now / 31 + it.id);
        for (const [r, a] of [[40, 0.035], [24, 0.05], [12, 0.07]]) S.disc(ctx, it.x + 3 - cx, it.y + 5, r + Math.round(fl), `rgba(255,160,60,${a})`);
      }
      ctx.globalCompositeOperation = 'source-over';
    }

    // bonus et repères par-dessus l'ambiance, pour rester bien visibles
    for (const tg of vis) {
      if (this.dead.has(tg.id) && tg.kind !== 'supply') continue;
      if (tg.kind === 'tnt') {
        if (t >= tg.t0) this.drawTnt(ctx, tg, t, now);
      } else if (tg.kind === 'crate') {
        if (tg.arc) {
          const p = crateAt(tg, t);
          if (t >= tg.t0) drawCrate(ctx, Math.round(p.x), Math.round(p.y + 7), tg.bonus, 1, now);
        } else {
          const s = this.spots[tg.spot];
          drawCrate(ctx, Math.round(s.cx - cx), s.base, tg.bonus, this.rise(tg, t), now);
        }
      } else if (tg.loot && this.rise(tg, t) > 0.6) {
        const p = this.targetScreen(tg, t);
        drawLoot(ctx, Math.round(p.x), Math.round(p.y - 22), tg.bonus, now);
      } else if (tg.kind === 'supply' && !this.dead.has(tg.id) && t < tg.throwAt && this.rise(tg, t) > 0.6) {
        const p = this.targetScreen(tg, t);
        drawCrate(ctx, Math.round(p.x), Math.round(p.y - 2), null, 1, 0);
        canvasText(ctx, 'AMI', p.x, p.y - 24, { size: 8, color: '#b8e070' });
      }
    }
    for (const tg of vis) this.drawLockOn(ctx, tg, cx, t);
    for (const p of this.parts) { ctx.fillStyle = p.col; ctx.fillRect(Math.round(p.x), Math.round(p.y), 1, 1); }
    for (const b of this.booms) {
      const k = (t - b.at) / 500;
      S.disc(ctx, b.x, b.y, Math.round(6 + k * 18), `rgba(248,120,24,${0.7 * (1 - k)})`);
      if (k < 0.4) S.drawFlash(ctx, b.x, b.y, 24, t / 30);
    }
    amb.weather(ctx, now, outdoor);
    const dark = shooterEventAt(this.world.events || [], 'blackout', t) || shooterEventAt(this.world.events || [], 'lamps', t);
    if (dark && cam.sec === 'saloon') this.drawBlackout(ctx, t, dark);
    if (t < this.sandUntil) this.drawSand(ctx, t);

    // fondus entre la gare, les abords, la rue et le saloon
    for (const [a, b] of FADES) {
      if (t > a && t < b) {
        ctx.fillStyle = `rgba(10,5,3,${1 - Math.abs(t - (a + b) / 2) / ((b - a) / 2)})`;
        ctx.fillRect(0, 0, W, H);
      }
    }
    // noms des lieux (en plus grand) puis annonces : courtes, en haut de l'écran
    if (t >= STATION_START + 1000 && t < STATION_START + 1000 + BANNER_MS) this.drawBanner(ctx, 'LA GARE', '#f8d070', t - STATION_START - 1000, true);
    if (t >= EDGE_START && t < EDGE_START + BANNER_MS) this.drawBanner(ctx, L.edge.name, '#f8d070', t - EDGE_START, true);
    if (t >= STREET_START && t < STREET_START + BANNER_MS) this.drawBanner(ctx, 'LA GRAND-RUE', '#f8d070', t - STREET_START, true);
    if (t >= SALOON_START && t < SALOON_START + BANNER_MS) this.drawBanner(ctx, LAIRS[lair].name, '#f8d070', t - SALOON_START, true);
    this.drawBossHud(ctx, t);
    if (this.banner && t - this.banner.at < BANNER_MS) this.drawBanner(ctx, this.banner.text, this.banner.col, t - this.banner.at);

    if (this.red > 0) { ctx.fillStyle = `rgba(190,30,20,${this.red * 0.5})`; ctx.fillRect(0, 0, W, H); }
    if (this.now < (this.whiteUntil || 0)) { ctx.fillStyle = 'rgba(255,251,232,0.85)'; ctx.fillRect(0, 0, W, H); }
    if (this.gun) this.drawGun(ctx);
    if (this.shielded) {
      const a = 0.35 + 0.15 * Math.sin(this.now / 120);
      ctx.fillStyle = `rgba(248,208,112,${a})`;
      ctx.fillRect(0, 0, W, 2); ctx.fillRect(0, H - 2, W, 2); ctx.fillRect(0, 0, 2, H); ctx.fillRect(W - 2, 0, 2, H);
    }
    this.drawAmmo(ctx);
    this.drawFeed(ctx, t);
    for (const [i, r] of Object.entries(this.remote)) {
      if (r.left) continue;
      const col = this.color(+i);
      const shot = this.t - r.shot < 150;
      const pw = this.powers[i];
      if (pw && BONUSES[pw.kind]?.gun && t < pw.until) ring(ctx, Math.round(r.x), Math.round(r.y), 9, 9, col, 2, this.now / 50);
      ring(ctx, Math.round(r.x), Math.round(r.y), shot ? 6 : 4, shot ? 6 : 4, col);
      ctx.fillStyle = col; ctx.fillRect(Math.round(r.x), Math.round(r.y), 1, 1);
      canvasText(ctx, this.name(+i).slice(0, 3).toUpperCase(), r.x, r.y + 6, { size: 8, color: col });
    }
    if (this.mouse.in) this.drawCrosshair(ctx);
  }

  drawFigure(ctx, tg, cx, t) {
    const s = this.spots[tg.spot];
    const k = this.rise(tg, t);
    if (k <= 0) return;
    const friend = tg.kind === 'civil' || tg.kind === 'supply';
    const char = tg.kind === 'supply' ? SUPPLIER : tg.kind === 'civil' ? CIVILS[tg.look % CIVILS.length] : BANDITS[tg.look % BANDITS.length];
    const d = this.dead.get(tg.id);
    const flash = d && t - d.at < 120;
    const spr = S.characterSprite(char, { blink: (t + tg.id * 517) % 3100 < 120, hurt: !!d, t, tint: flash ? 'rgba(255,60,40,0.6)' : null });
    const x = Math.round(s.cx - cx - 24);
    const y = Math.round(s.base - 56 + (1 - k) * 56);
    if (s.dark) {
      // ouverture que le décor n'a pas (meurtrière, guichet) : elle s'ouvre sur le noir le temps qu'il s'y montre
      const ow = Math.round(s.w * Math.min(1, k * 2)), ox = Math.round(s.x - cx + (s.w - ow) / 2);
      ctx.fillStyle = OUT; ctx.fillRect(ox - 1, s.y - 1, ow + 2, s.h + 2);
      ctx.fillStyle = '#1e1612'; ctx.fillRect(ox, s.y, ow, s.h);
    }
    ctx.save();
    ctx.beginPath();
    ctx.rect(s.x - cx, s.y, s.w, s.h);
    ctx.clip();
    ctx.drawImage(spr, x, y);
    const { R } = paint(ctx);
    const skin = SKIN[char.skin], sleeve = CLOTH_COLORS[char.outfitColor];
    // bras (6 px de large) ramenés dans l'ouverture : une fenêtre ou une porte est plus étroite que le buste,
    // les mains levées du civil seraient sinon coupées (et c'est tout ce qui le distingue d'un bandit)
    const cl = s.x - cx, cr = cl + s.w;
    const fit = (ax) => Math.max(cl, Math.min(cr - 6, ax));
    if (tg.kind === 'supply' && t < tg.throwAt && !d) {
      // il tient la caisse à bout de bras au-dessus de sa tête
      for (const ax of [fit(x + 9), fit(x + 33)]) { R(ax, y + 10, 6, 26, OUT); R(ax + 1, y + 11, 4, 24, sleeve); R(ax, y + 6, 6, 6, OUT); R(ax + 1, y + 7, 4, 4, skin); }
    } else if (tg.kind === 'supply') {
      // il salue de la main
      const ax = Math.min(x + 37, cr - 8) + (Math.floor(t / 150) % 2 ? 2 : 0);
      R(ax, y + 15, 6, 22, OUT); R(ax + 1, y + 16, 4, 20, sleeve);
      R(ax, y + 9, 6, 8, OUT); R(ax + 1, y + 10, 4, 6, skin);
    } else if (friend) {
      for (const ax of [fit(x + 5), fit(x + 37)]) {
        R(ax, y + 22, 6, 20, OUT); R(ax + 1, y + 23, 4, 18, sleeve);
        R(ax, y + 15, 6, 8, OUT); R(ax + 1, y + 16, 4, 6, skin);
      }
    } else if (!d && tg.throwAt && t < tg.throwAt) {
      const ax = fit(x + 33);
      R(ax, y + 10, 6, 26, OUT); R(ax + 1, y + 11, 4, 24, sleeve); R(ax, y + 6, 6, 6, OUT); R(ax + 1, y + 7, 4, 4, skin);
      R(ax + 1, y - 5, 5, 12, OUT); R(ax + 2, y - 4, 3, 10, '#c0392b'); R(ax + 2, y - 1, 3, 2, '#f4ecd8');
      const sp = Math.floor(t / 60) % 2;
      R(ax + 3 + sp, y - 8, 2, 2, sp ? '#fff070' : '#f87818');
    } else if (!d) {
      R(x + 28, y + 40, 8, 7, OUT); R(x + 29, y + 41, 6, 5, skin);
      R(x + 29, y + 34, 9, 9, OUT); R(x + 30, y + 35, 7, 7, '#4a4f58'); R(x + 31, y + 36, 5, 5, '#8a8f98'); R(x + 32, y + 37, 3, 3, OUT);
      if (tg.loot) { const bx = Math.max(x + 2, cl); R(bx, y + 30, 12, 16, OUT); R(bx + 1, y + 31, 10, 14, '#c8a060'); R(bx + 3, y + 29, 6, 2, '#7a4a24'); R(bx + 4, y + 35, 4, 4, '#e0b040'); }
    }
    ctx.restore();
    for (const f of this.fireFx) if (f.id === tg.id) S.drawFlash(ctx, x + 33, y + 38, 14, t / 30);
  }

  // Cavalier au galop ; abattu, il vide les étriers et son cheval s'enfuit.
  drawRider(ctx, tg, cx, t) {
    const d = this.dead.get(tg.id);
    // pendant la poursuite, tout le monde galope vers la droite (même ceux qui se laissent distancer) ; sans son
    // cavalier, le cheval ralentit et reste en arrière
    const chase = this.chasing(camAt(t));
    const dir = chase || tg.ride.vx > 0 ? 1 : -1;
    const x = Math.round((chase && d ? rideX(tg, d.at) - (t - d.at) * 0.12 : rideX(tg, t)) - cx), y = tg.ride.y;
    if (x < -60 || x > W + 60) return;
    if (chase) this.dust(ctx, x - 22, y, t + tg.id * 131);
    const [coat, mane] = HORSE_COATS[tg.look % HORSE_COATS.length];
    const char = BANDITS[tg.look % BANDITS.length];
    const frame = Math.floor((t + tg.id * 97) / 90) % 4;
    const look = riderLook(char, '#7a2a1e', `bandit${tg.look}`);
    let spr = horseSprite(coat, mane, frame, d ? null : look);
    if (dir < 0) spr = flipped(spr);
    ctx.fillStyle = 'rgba(40,24,10,0.3)';
    ctx.fillRect(x - 24, y - 1, 50, 3);
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.translate(x, y);
    ctx.scale(RIDE_SCALE, RIDE_SCALE);
    ctx.drawImage(spr, -spr.ox, -spr.oy);
    if (d) {
      const k = clamp01((t - d.at) / 600);
      if (k < 1) {
        // il vide les étriers et bascule en arrière, autour de sa selle (rougi à l'impact, comme les bandits à pied)
        let body = riderOnly(coat, mane, look, t - d.at < 120 ? 'rgba(255,60,40,0.6)' : null);
        if (dir < 0) body = flipped(body);
        const hx = -3 * dir, hy = -20;
        ctx.globalAlpha = 1 - k * 0.5;
        ctx.translate(hx - dir * 26 * k, hy - 6 * k + 30 * k * k);
        ctx.rotate(-dir * k * 1.8);
        ctx.drawImage(body, -body.ox - hx, -body.oy - hy);
      }
    }
    ctx.restore();
    if (!d) {
      // revolver pointé vers les joueurs : dessiné à l'échelle mais en coordonnées entières (un rectangle agrandi
      // ×1,5 tombait sur des demi-pixels, aux bords lissés)
      const gx = x + (dir > 0 ? 2 : -13), gy = y - 63 - (frame === 2 ? 2 : 0); // la main monte avec le rebond du galop
      ctx.fillStyle = OUT; ctx.fillRect(gx, gy, 12, 6);
      ctx.fillStyle = '#8a8f98'; ctx.fillRect(gx + 1, gy + 2, 9, 3);
    }
    for (const f of this.fireFx) if (f.id === tg.id) S.drawFlash(ctx, x + dir * 15, y - 60, 14, t / 30);
  }

  // Bâton de dynamite qui tournoie, mèche qui crépite ; le cercle clignote de plus en plus vite avant l'impact.
  drawTnt(ctx, tg, t, now) {
    if (t > tg.t1 || this.defused(tg)) return;
    const p = crateAt(tg, t);
    const x = Math.round(p.x), y = Math.round(p.y);
    const fast = tg.t1 - t < 600 ? 60 : 140;
    ring(ctx, x, y, 11, 11, Math.floor(now / fast) % 2 ? '#f0705a' : '#f8d070', 2, now / 50);
    // le bâton tourne par huitièmes de tour (sprites au pixel près, pas de rotation lissée)
    const k = Math.round((t - tg.t0) / 110 / (Math.PI / 4)) & 7, a = (k * Math.PI) / 4;
    ctx.drawImage(tntSprite(k), x - 12, y - 12);
    const sp = Math.floor(now / 50) % 2;
    ctx.fillStyle = sp ? '#fff070' : '#f87818';
    ctx.fillRect(x + Math.round(Math.sin(a) * 11) - 1 + sp, y - Math.round(Math.cos(a) * 11) - 1, 2, 2);
  }

  // nuage de poussière soulevé au galop, qui reste en arrière (poursuite)
  dust(ctx, x, y, t, s = 1) {
    for (let k = 0; k < 4; k++) {
      const age = (t / 420 + k / 4) % 1;
      S.disc(ctx, Math.round(x - age * 46 * s), Math.round(y - 2 - age * 7 * s), Math.round((2 + age * 6) * s), `rgba(214,170,120,${(0.45 * (1 - age)).toFixed(2)})`);
    }
  }

  // le bâton de dynamite allumé qu'El Diablo brandit juste avant de le lancer (mine, poursuite), en (x, y)
  drawBossStick(ctx, t, x, y) {
    const next = this.bossTnts.find((d) => d.t0 > t && d.t0 - t < 700 && !this.defused(d));
    if (!next) return;
    const { R } = paint(ctx);
    R(x - 1, y, 5, 12, OUT); R(x, y + 1, 3, 10, '#c0392b'); R(x, y + 4, 3, 2, '#f4ecd8');
    const sp = Math.floor(t / 60) % 2;
    R(x + sp, y - 3, 2, 2, sp ? '#fff070' : '#f87818');
  }

  // El Diablo, une fois et demie plus grand, entouré d'une aura rouge, arpente le balcon.
  drawBoss(ctx, tg, cx, t) {
    if (this.world.lair === 'mine') return this.drawBossMine(ctx, tg, cx, t);
    if (this.world.lair === 'chase') return this.drawBossChase(ctx, tg, cx, t);
    const d = this.dead.get(tg.id);
    const rage = this.bossRage();
    const sc = BOSS_SCALE, w = Math.round(48 * sc), h = Math.round(56 * sc);
    const bx = Math.round(bossX(d && d.at > 0 ? d.at : t) - cx);
    const flash = t - this.bossFlash < 110 || (d && t - d.at < 150);
    const { img, sil } = bossSprite(!!flash, (t % 2900) < 120, t);
    let top = this.bossTop(t);
    ctx.save();
    if (d) {
      // il bascule par-dessus la rambarde
      const k = clamp01((t - d.at) / 1100);
      ctx.translate(bx, top + h / 2 - 30 * k + 300 * k * k);
      ctx.rotate(k * 2.2);
      ctx.drawImage(img, -w / 2, -h / 2, w, h);
      ctx.restore();
      return;
    }
    ctx.beginPath();
    ctx.rect(0, 0, W, SAL.balcony);
    ctx.clip();
    const pulse = 0.35 + 0.25 * Math.sin(t / (rage ? 70 : 140));
    ctx.globalAlpha = pulse + (rage ? 0.25 : 0);
    for (const [dx, dy] of [[-2, 0], [2, 0], [0, -2], [0, 2]]) ctx.drawImage(sil, bx - w / 2 + dx, top + dy, w, h);
    ctx.globalAlpha = 1;
    ctx.drawImage(img, bx - w / 2, top, w, h);
    ctx.restore();
    for (const f of this.fireFx) if (f.id === tg.id) for (const gx of [-18, 18]) S.drawFlash(ctx, bx + gx, top + 56, 16, t / 30 + gx);
  }

  // Dans la mine : El Diablo debout dans son wagonnet qui roule sur la passerelle (étincelles sous les roues quand il
  // file), il brandit sa dynamite avant de la lancer. Abattu, il bascule hors du wagonnet et tombe de la passerelle ;
  // le wagonnet vide continue de rouler.
  drawBossMine(ctx, tg, cx, t) {
    const d = this.dead.get(tg.id);
    const rage = this.bossRage();
    const sc = BOSS_SCALE, w = Math.round(48 * sc), h = Math.round(56 * sc), B = MINE.balcony;
    const flash = t - this.bossFlash < 110 || (d && t - d.at < 150);
    const { img, sil } = bossSprite(!!flash, (t % 2900) < 120, t);
    const top = this.bossTop(t);
    const bx = Math.round(bossX(d && d.at > 0 ? d.at : t) - cx), cartX = Math.round(bossX(t) - cx);
    if (d) {
      const k = clamp01((t - d.at) / 1100);
      ctx.save();
      ctx.translate(bx - 30 * k, top + h / 2 - 40 * k + 320 * k * k);
      ctx.rotate(-k * 2.4);
      ctx.drawImage(img, -w / 2, -h / 2, w, h);
      ctx.restore();
    } else {
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, W, B - 18);
      ctx.clip();
      const pulse = 0.35 + 0.25 * Math.sin(t / (rage ? 70 : 140));
      ctx.globalAlpha = pulse + (rage ? 0.25 : 0);
      for (const [dx, dy] of [[-2, 0], [2, 0], [0, -2], [0, 2]]) ctx.drawImage(sil, bx - w / 2 + dx, top + dy, w, h);
      ctx.globalAlpha = 1;
      ctx.drawImage(img, bx - w / 2, top, w, h);
      ctx.restore();
      this.drawBossStick(ctx, t, bx + 26, top + 14);
    }
    // le wagonnet (devant ses jambes), ses roues sur le rail
    const { R, box } = paint(ctx);
    const cy = B - 3;
    box(cartX - 25, cy - 21, 50, 15, '#5a5450');
    R(cartX - 23, cy - 19, 46, 2, '#8a8478'); R(cartX - 25, cy - 12, 50, 2, '#3e434c');
    for (const rx of [-21, -9, 8, 20]) { R(cartX + rx, cy - 16, 1, 1, '#b8bcc4'); R(cartX + rx, cy - 9, 1, 1, '#b8bcc4'); }
    for (const wx of [cartX - 14, cartX + 14]) { S.disc(ctx, wx, cy - 4, 5, OUT); S.disc(ctx, wx, cy - 4, 4, '#2a2628'); S.disc(ctx, wx, cy - 4, 1, '#8a8478'); }
    const v = (bossX(t + 40) - bossX(t)) / 40; // il file : des étincelles jaillissent des roues
    if (Math.abs(v) > 0.06) for (let k = 0; k < 6; k++) R(cartX + (v > 0 ? -18 : 18) - Math.sign(v) * Math.random() * 12, cy - Math.random() * 4, 1, 1, Math.random() < 0.5 ? '#fff070' : '#f87818');
    if (!d) for (const f of this.fireFx) if (f.id === tg.id) for (const gx of [-18, 18]) S.drawFlash(ctx, bx + gx, top + 56, 16, t / 30 + gx);
  }

  // La poursuite : El Diablo au galop sur son cheval noir, la poussière derrière lui ; il se retourne pour tirer et
  // brandit sa dynamite avant de la lancer. Abattu, il vide les étriers et son cheval file sans lui.
  drawBossChase(ctx, tg, cx, t) {
    const d = this.dead.get(tg.id);
    const rage = this.bossRage();
    const s = CHASE.scale, y = CHASE.y;
    const flash = t - this.bossFlash < 110 || (d && t - d.at < 150);
    const frame = Math.floor(t / 85) % 4;
    if (d) {
      const hx = Math.round(this.bossXAt(d.at) + (t - d.at) * 0.16 - cx);
      this.dust(ctx, hx - 26, y, t, 1.3);
      const horse = horseSprite('#2a2220', '#141010', frame, null);
      ctx.save(); ctx.imageSmoothingEnabled = false; ctx.translate(hx, y); ctx.scale(s, s); ctx.drawImage(horse, -horse.ox, -horse.oy); ctx.restore();
      // il bascule en arrière hors de la selle (le cavalier tel qu'il galopait, pas le buste du saloon), retombe dans la
      // poussière puis reste en arrière : distancé de plus en plus vite en l'air, puis emporté par le sol qui défile
      const el = t - d.at, k = clamp01(el / 900);
      const back = (el < 900 ? (el * el) / 1800 : 450 + (el - 900)) * CHASE.speed * 0.9;
      const bx = Math.round(this.bossXAt(d.at) - cx - back);
      const body = riderOnly('#2a2220', '#141010', BOSS_RIDER, flash ? 'rgba(255,60,40,0.6)' : null);
      ctx.save(); ctx.imageSmoothingEnabled = false; ctx.globalAlpha = 1 - k * 0.3;
      ctx.translate(bx, y); ctx.scale(s, s); ctx.translate(-3 - 14 * k, -20 - 6 * k + 22 * k * k); ctx.rotate(-k * 1.9);
      ctx.drawImage(body, -body.ox + 3, -body.oy + 20);
      ctx.restore();
      return;
    }
    const bx = Math.round(this.bossXAt(t) - cx);
    this.dust(ctx, bx - 26, y, t, 1.3);
    const hs = bossHorse(frame, !!flash);
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.translate(bx, y);
    ctx.scale(s, s);
    ctx.globalAlpha = 0.35 + 0.25 * Math.sin(t / (rage ? 70 : 140)) + (rage ? 0.25 : 0);
    for (const [dx, dy] of [[-1.5, 0], [1.5, 0], [0, -1.5], [0, 1.5]]) ctx.drawImage(hs.sil, -hs.ox + dx, -hs.oy + dy);
    ctx.globalAlpha = 1;
    ctx.drawImage(hs.img, -hs.ox, -hs.oy);
    ctx.restore();
    // le revolver tendu vers l'arrière (en coordonnées entières : agrandi ×1,6, il tombait sur des fractions de pixel)
    const gy = y - 56 - (frame === 2 ? 2 : 0);
    ctx.fillStyle = OUT; ctx.fillRect(bx - 27, gy, 16, 6);
    ctx.fillStyle = '#8a8f98'; ctx.fillRect(bx - 26, gy + 2, 13, 3);
    if (this.bossTnts.some((d) => d.t0 > t && d.t0 - t < 700 && !this.defused(d))) {
      // le bras levé, le bâton au poing
      const { R } = paint(ctx);
      const sy = y - Math.round(31 * s); // l'épaule
      for (let k = 0; k <= 10; k++) R(bx + 3 + k, sy - k * 2 - 1, 4, 4, OUT);
      for (let k = 0; k <= 10; k++) R(bx + 4 + k, sy - k * 2, 2, 2, '#5a1a14');
      this.drawBossStick(ctx, t, bx + 13, sy - 32);
    }
    for (const f of this.fireFx) if (f.id === tg.id) S.drawFlash(ctx, bx - Math.round(18 * s), y - Math.round(33 * s), 16, t / 30);
  }

  drawLockOn(ctx, tg, cx, t) {
    if (!tg.fire.length || this.dead.has(tg.id)) return;
    const boss = tg.kind === 'boss';
    if (tg.ride) {
      for (let i = 0; i < tg.fire.length; i++) {
        const f = tg.fire[i];
        if (t < f - 700 || t > f) continue;
        const u = (f - t) / 700;
        const col = this.color(this.aims.get(`${tg.id}:${i}`) ?? tg.victims[i] % this.n);
        const x = Math.round(rideX(tg, t) - cx), y = tg.ride.y - 46;
        ring(ctx, x, y, 8 + u * 12, 8 + u * 12, col, 3, t / 80);
        if (u < 0.35) canvasText(ctx, '!', x, y - 28, { size: 8, color: col });
      }
      return;
    }
    const s = this.spots[tg.spot];
    const k = this.rise(tg, t);
    for (let i = 0; i < tg.fire.length; i++) {
      const f = tg.fire[i];
      if (t < f - 700 || t > f) continue;
      const u = (f - t) / 700;
      const col = this.color(this.aims.get(`${tg.id}:${i}`) ?? tg.victims[i] % this.n);
      const x = boss ? Math.round(this.bossXAt(t) - cx) : Math.round(s.cx - cx);
      const y = boss ? this.bossTop(t) + 40 : Math.round(s.base - 56 + (1 - k) * 56 + 26);
      ring(ctx, x, y, (boss ? 10 : 7) + u * 12, (boss ? 10 : 7) + u * 12, col, 3, t / 80);
      if (boss) ring(ctx, x, y, 22 + u * 14, 22 + u * 14, '#f0705a', 2, -t / 60);
      if (u < 0.35) canvasText(ctx, boss ? '!!' : '!', x, y - (boss ? 40 : 26), { size: boss ? 16 : 8, color: col });
    }
  }

  // Présentation d'El Diablo (bandes noires, affiche « WANTED »), puis sa jauge et l'aura rouge de l'écran.
  drawBossHud(ctx, t) {
    const boss = this.boss;
    const el = t - (boss.t0 - 1200);
    if (el > 0 && el < 4000 && !this.dead.has(boss.id)) {
      const k = Math.min(1, el / 300, (4000 - el) / 400);
      const bar = Math.round(22 * k);
      ctx.fillStyle = '#0a0503';
      ctx.fillRect(0, 0, W, bar); ctx.fillRect(0, H - bar, W, bar);
      if (el > 1200) {
        const e = el - 1200, a = Math.min(1, e / 250, (2800 - e) / 400);
        if (a > 0) {
          ctx.globalAlpha = a;
          const px = Math.round(W - 80 + (1 - Math.min(1, e / 300)) * 90);
          const P = (this.bossPoster ||= this.makePoster());
          ctx.drawImage(P, px, 40);
          ctx.fillStyle = 'rgba(26,15,10,0.75)';
          ctx.fillRect(0, 96, W - 90, 40);
          canvasText(ctx, 'EL DIABLO', (W - 90) / 2, 100, { size: 16, color: '#f0705a' });
          canvasText(ctx, `PRIME : ${SHOOTER_PTS.bossKill} PTS - ABATTEZ-LE !`, (W - 90) / 2, 121, { color: '#f8d070' });
          ctx.globalAlpha = 1;
        }
      }
    }
    if (t < boss.t0 || this.dead.has(boss.id)) return;
    const hp = this.hp.get(boss.id) ?? boss.hp;
    const rage = this.bossRage();
    // aura rouge sur les bords de l'écran
    const pulse = 0.5 + 0.5 * Math.sin(t / (rage ? 110 : 260));
    for (let i = 0; i < 8; i++) {
      ctx.fillStyle = `rgba(170,20,10,${(0.05 + (rage ? 0.05 : 0)) * (1 - i / 8) * (0.6 + 0.4 * pulse)})`;
      ctx.fillRect(i, i, W - 2 * i, 1); ctx.fillRect(i, H - 1 - i, W - 2 * i, 1);
      ctx.fillRect(i, i, 1, H - 2 * i); ctx.fillRect(W - 1 - i, i, 1, H - 2 * i);
    }
    // jauge : une case par point de vie
    const BW = 180, x0 = Math.round(W / 2 - BW / 2), y0 = 14;
    canvasText(ctx, rage && Math.floor(t / 250) % 2 ? 'EL DIABLO - ENRAGÉ !' : 'EL DIABLO', W / 2, 3, { color: '#f0705a' });
    ctx.fillStyle = OUT; ctx.fillRect(x0 - 2, y0 - 2, BW + 4, 10);
    ctx.fillStyle = '#5a1a14'; ctx.fillRect(x0, y0, BW, 6);
    const hit = t - this.bossFlash < 120;
    ctx.fillStyle = hit ? '#fdf6e0' : rage ? '#f87818' : '#e8604c';
    ctx.fillRect(x0, y0, Math.round((BW * hp) / boss.hp), 6);
    ctx.fillStyle = 'rgba(255,240,200,0.35)'; ctx.fillRect(x0, y0, Math.round((BW * hp) / boss.hp), 1);
    ctx.fillStyle = OUT;
    for (let k = 1; k < boss.hp; k++) ctx.fillRect(x0 + Math.round((BW * k) / boss.hp), y0, 1, 6);
    // tête de mort de part et d'autre
    for (const sx of [x0 - 12, x0 + BW + 4]) {
      S.disc(ctx, sx + 4, y0 + 2, 4, OUT); S.disc(ctx, sx + 4, y0 + 2, 3, '#f4ecd8');
      ctx.fillStyle = OUT; ctx.fillRect(sx + 2, y0 + 1, 2, 2); ctx.fillRect(sx + 5, y0 + 1, 2, 2); ctx.fillRect(sx + 3, y0 + 6, 3, 1);
    }
  }

  makePoster() {
    const p = S.makeCanvas(70, 90);
    const x = p.getContext('2d');
    x.fillStyle = OUT; x.fillRect(0, 0, 70, 90);
    x.fillStyle = '#e8d4a0'; x.fillRect(1, 1, 68, 88);
    x.fillStyle = '#c8b07c'; x.fillRect(1, 80, 68, 9);
    canvasText(x, 'WANTED', 35, 3, { color: '#7a2a1e', shadow: '#c8b07c' });
    const por = S.portrait(BOSS, 1);
    x.drawImage(por, 7, 14);
    x.fillStyle = OUT; x.strokeStyle = OUT; x.strokeRect(6.5, 13.5, por.width + 1, por.height + 1);
    canvasText(x, 'MORT OU VIF', 35, 78, { color: '#3a2214', shadow: '#c8b07c' });
    return p;
  }

  // Annonce en haut de l'écran, sur une petite étiquette à la taille du texte : le jeu reste visible.
  // Pendant le combat contre El Diablo, elle passe sous sa jauge de vie.
  drawBanner(ctx, text, col, el, big = false) {
    const a = el < 150 ? el / 150 : el > BANNER_MS - 300 ? (BANNER_MS - el) / 300 : 1;
    const size = big ? 16 : 8;
    ctx.font = `${size}px Silkscreen, monospace`;
    const w = Math.ceil(ctx.measureText(text).width);
    const y = (this.t >= BOSS_T0 ? 24 : 4) - (el < 150 ? Math.round((1 - el / 150) * 6) : 0);
    ctx.globalAlpha = Math.max(0, a);
    ctx.fillStyle = 'rgba(26,15,10,0.6)';
    ctx.fillRect(Math.round(W / 2 - w / 2 - 5), y - 2, w + 10, size + 6);
    canvasText(ctx, text, W / 2, y, { size, color: col });
    ctx.globalAlpha = 1;
  }

  // Derniers bonus ramassés (en haut à gauche)
  drawFeed(ctx, t) {
    let y = 26;
    for (const f of this.feed) {
      const el = t - f.at;
      if (el > 4000) continue;
      ctx.globalAlpha = Math.min(1, (4000 - el) / 500);
      const who = f.by === this.me ? 'TOI' : this.name(f.by).slice(0, 8).toUpperCase();
      const { R } = paint(ctx);
      R(5, y - 1, 10, 9, OUT);
      bonusIcon(R, 6, y, f.bonus);
      canvasText(ctx, `${who} : ${BONUSES[f.bonus]?.name || f.bonus}`, 18, y, { size: 8, color: this.color(f.by), align: 'left' });
      ctx.globalAlpha = 1;
      y += 11;
    }
  }

  // Tempête de sable : l'écran est couvert, seul un petit cercle autour du viseur reste visible.
  // Panne de lumière au saloon : tout est noir sauf une lueur autour du viseur ; chaque coup de feu éclaire la salle.
  drawBlackout(ctx, t, e) {
    const k = Math.max(0, Math.min(1, (t - e.t0) / 400, (e.t1 - t) / 500));
    const flash = Math.max(0, 1 - (this.now - this.lightFlash) / 140);
    const c = (this.darkCv ||= S.makeCanvas(W, H));
    const x = c.getContext('2d');
    x.globalCompositeOperation = 'source-over';
    x.clearRect(0, 0, W, H);
    x.fillStyle = `rgba(6,6,16,${0.9 * k * (1 - 0.75 * flash)})`;
    x.fillRect(0, 0, W, H);
    const mx = Math.round(this.mouse.in ? this.mouse.x : W / 2), my = Math.round(this.mouse.in ? this.mouse.y : H / 2);
    x.globalCompositeOperation = 'destination-out';
    x.drawImage(holeSprite(22, 32, 26), mx - 32, my - 32);
    ctx.drawImage(c, 0, 0);
  }

  drawSand(ctx, t) {
    const left = this.sandUntil - t, el = SAND_MS - left;
    const a = Math.max(0, Math.min(1, el / 300, left / 600));
    const c = (this.sandCv ||= S.makeCanvas(W, H));
    const x = c.getContext('2d');
    x.globalCompositeOperation = 'source-over';
    x.fillStyle = '#c8a060';
    x.fillRect(0, 0, W, H);
    const off = this.now * 0.3;
    for (let i = 0; i < 90; i++) {
      const yy = (i * 37) % H;
      const xx = (i * 91 + off * (1 + (i % 3) * 0.5)) % (W + 60);
      x.fillStyle = i % 3 ? '#e0c088' : '#a8803c';
      x.fillRect(Math.round(W + 30 - xx), yy, 14 + (i % 5) * 6, 1);
    }
    const mx = Math.round(this.mouse.in ? this.mouse.x : W / 2), my = Math.round(this.mouse.in ? this.mouse.y : H / 2);
    x.globalCompositeOperation = 'destination-out';
    x.drawImage(holeSprite(30, 42, 35), mx - 42, my - 42);
    ctx.globalAlpha = a;
    ctx.drawImage(c, 0, 0);
    ctx.globalAlpha = 1;
  }

  drawGun(ctx) {
    if (this.power === 'winchester') this.drawRifle(ctx);
    else if (this.power === 'akimbo') this.drawAkimbo(ctx);
    else this.drawGatling(ctx, this.power === 'rusty');
  }

  drawGatling(ctx, rusty) {
    const { R } = paint(ctx);
    const gx = Math.round(W / 2 + (this.mouse.x - W / 2) * 0.4), gy = H;
    const lean = Math.round((this.mouse.x - gx) * 0.12);
    const spin = this.firing ? Math.floor(this.now / (rusty ? 80 : 40)) % 3 : 0;
    const cols = rusty ? ['#4a2e1e', '#7a4a2a', '#9a6a3a', '#b8885a', '#7a4a2a'] : ['#3a3e44', '#6a6f78', '#9a9fa8', '#c9ced6', '#6a6f78'];
    const L = 40;
    const at = (y) => gx + Math.round((lean * y) / L);
    // 5 canons parallèles dont l'éclairage tourne quand on tire
    for (let y = 0; y < L; y++) {
      const cx = at(y);
      R(cx - 11, gy - 20 - y, 23, 1, OUT);
      for (let j = 0; j < 5; j++) R(cx - 10 + j * 4, gy - 20 - y, 4, 1, cols[(j + spin) % 5]);
      for (let j = 0; j < 5; j++) R(cx - 10 + j * 4, gy - 20 - y, 1, 1, OUT);
    }
    const brass = rusty ? '#8a6a2a' : '#e0b040', body = rusty ? '#5a3a24' : '#4a4f58', top = rusty ? '#7a5a3a' : '#8a8f98';
    for (const y of [10, 26, L - 2]) { const cx = at(y); R(cx - 13, gy - 22 - y, 27, 4, OUT); R(cx - 12, gy - 21 - y, 25, 2, brass); }
    R(gx - 22, gy - 22, 44, 22, OUT); R(gx - 21, gy - 21, 42, 21, body);
    R(gx - 21, gy - 21, 42, 3, top); R(gx - 21, gy - 10, 42, 2, brass);
    if (rusty) for (const [dx, dy] of [[-15, -17], [6, -6], [12, -18], [-4, -4]]) R(gx + dx, gy + dy, 3, 2, '#9a5a30'); // taches de rouille
    // manivelle
    const ang = this.firing ? this.now / (rusty ? 120 : 60) : 0;
    const hx = gx + 26 + Math.round(Math.cos(ang) * 5), hy = gy - 12 + Math.round(Math.sin(ang) * 5);
    R(gx + 21, gy - 14, 6, 4, OUT); R(gx + 22, gy - 13, 4, 2, top);
    R(hx - 2, hy - 2, 5, 5, OUT); R(hx - 1, hy - 1, 3, 3, '#7a4a24');
    if (this.now - this.gunAt < 50) S.drawFlash(ctx, at(L), gy - 24 - L, rusty ? 11 : 14, this.now / 30);
  }

  // Winchester : crosse, boîtier en laiton et son levier, long canon ; elle recule à chaque tir
  drawRifle(ctx) {
    const { R } = paint(ctx);
    const kick = this.now - this.gunAt < 90 ? 5 : 0;
    const gx = Math.round(W / 2 + 46 + (this.mouse.x - W / 2) * 0.35), gy = H + kick;
    const L = 70;
    const lean = Math.round((this.mouse.x - gx) * 0.2);
    const at = (y) => gx + Math.round((lean * y) / L);
    for (let y = 0; y < 20; y++) {
      const cx = at(y);
      R(cx - 7, gy - y, 15, 1, OUT); R(cx - 6, gy - y, 13, 1, y % 6 ? '#8a5428' : '#7a4a24'); R(cx - 6, gy - y, 3, 1, '#a86a34');
    }
    for (let y = 20; y < 33; y++) {
      const cx = at(y);
      R(cx - 6, gy - y, 13, 1, OUT); R(cx - 5, gy - y, 11, 1, '#c8a040'); R(cx - 5, gy - y, 3, 1, '#f0d070');
    }
    const lx = at(24) + 7, lever = this.now - this.gunAt < 200 ? 3 : 0; // le levier qu'on actionne
    R(lx, gy - 30 + lever, 7, 2, OUT); R(lx + 6, gy - 30 + lever, 2, 11, OUT); R(lx, gy - 21 + lever, 8, 2, OUT);
    for (let y = 33; y < L; y++) {
      const cx = at(y);
      R(cx - 4, gy - y, 9, 1, OUT); R(cx - 3, gy - y, 3, 1, '#6a6f78'); R(cx, gy - y, 3, 1, '#9aa0a8'); R(cx + 3, gy - y, 1, 1, '#3a3e44');
    }
    for (const y of [42, 60]) { const cx = at(y); R(cx - 4, gy - y - 1, 9, 2, '#c8a040'); }
    R(at(L) - 1, gy - L - 2, 3, 2, OUT);
    if (this.now - this.gunAt < 60) S.drawFlash(ctx, at(L), gy - L - 6, 13, this.now / 30);
  }

  // Deux colts, un dans chaque main : ils tirent ensemble et reculent à chaque clic
  drawAkimbo(ctx) {
    const { R } = paint(ctx);
    const kick = this.now - this.gunAt < 90 ? 5 : 0;
    for (const side of [-1, 1]) {
      const gx = Math.round(W / 2 + side * 78 + (this.mouse.x - W / 2) * 0.3), gy = H + kick;
      const L = 46;
      const lean = Math.round((this.mouse.x + side * 5 - gx) * 0.25);
      const at = (y) => gx + Math.round((lean * y) / L);
      for (let y = 0; y < 14; y++) { const cx = at(y); R(cx - 7, gy - y, 15, 1, OUT); R(cx - 6, gy - y, 13, 1, y < 5 ? '#7a2a1e' : '#eab78e'); } // manche et main
      for (let y = 14; y < 22; y++) { const cx = at(y); R(cx - 4, gy - y, 9, 1, OUT); R(cx - 3, gy - y, 7, 1, '#7a4a24'); R(cx - 3, gy - y, 2, 1, '#9a6a34'); }
      for (let y = 22; y < 31; y++) { const cx = at(y); R(cx - 6, gy - y, 13, 1, OUT); R(cx - 5, gy - y, 11, 1, y % 3 ? '#6a6f78' : '#9aa0a8'); }
      R(at(28) - side * 7 - 1, gy - 32, 3, 3, OUT); // chien
      for (let y = 31; y < L; y++) { const cx = at(y); R(cx - 3, gy - y, 7, 1, OUT); R(cx - 2, gy - y, 2, 1, '#9aa0a8'); R(cx, gy - y, 3, 1, '#6a6f78'); }
      if (this.now - this.gunAt < 60) S.drawFlash(ctx, at(L), gy - L - 5, 11, this.now / 30 + side);
    }
  }

  drawAmmo(ctx) {
    const gun = this.gun;
    if (this.power && this.t < this.powerUntil) {
      const k = (this.powerUntil - this.t) / this.powerMs;
      const name = BONUSES[this.power].name;
      const { R } = paint(ctx);
      R(7, H - 24, 10, 9, OUT);
      bonusIcon(R, 8, H - 23, this.power);
      canvasText(ctx, name, 20, H - 22, { size: 8, color: '#f8d070', align: 'left' });
      ctx.fillStyle = OUT; ctx.fillRect(7, H - 11, 82, 6);
      ctx.fillStyle = '#5a3a20'; ctx.fillRect(8, H - 10, 80, 4);
      ctx.fillStyle = gun ? '#f0705a' : '#f8d070'; ctx.fillRect(8, H - 10, Math.round(80 * k), 4);
    }
    if (gun) {
      // chargeur de l'arme : il ne se recharge pas, l'arme disparaît quand il est vide
      if (gun.mag) {
        const low = this.gunAmmo <= (gun.dual ? 4 : 5);
        canvasText(ctx, `${this.gunAmmo} BALLES`, W - 10, H - 18, { size: 8, color: low ? '#f0705a' : '#f8d070', align: 'right' });
      }
      if (gun.auto && this.t - (this.powerUntil - this.powerMs) < 4000) canvasText(ctx, 'CLIC MAINTENU', W - 10, H - 30, { size: 8, color: '#fdf6e0', align: 'right' });
      return;
    }
    if (this.behind) canvasText(ctx, 'RENFORTS', W - 10, H - 40, { size: 8, color: '#b8e070', align: 'right' });
    for (let i = 0; i < this.cap; i++) {
      const x = W - 12 - i * 8, y = H - 16;
      const full = i < this.ammo;
      ctx.fillStyle = OUT; ctx.fillRect(x - 1, y - 1, 6, 13);
      ctx.fillStyle = full ? '#e0b040' : '#4a3a2a'; ctx.fillRect(x, y + 3, 4, 8);
      ctx.fillStyle = full ? '#c8c0b8' : '#3a2e28'; ctx.fillRect(x, y, 4, 3);
    }
    if (this.reloadUntil) canvasText(ctx, 'RECHARGE...', W - 30, H - 28, { size: 8, color: '#f8d070' });
    else if (this.ammo === 0 && this.playing && Math.floor(this.now / 300) % 2) canvasText(ctx, 'CLIC DROIT : RECHARGER', W - 90, H - 28, { size: 8, color: '#f0705a' });
  }

  drawCrosshair(ctx) {
    const x = Math.round(this.mouse.x), y = Math.round(this.mouse.y);
    const col = this.color(this.me);
    const seg = (dx, dy, w, h) => {
      ctx.fillStyle = OUT; ctx.fillRect(x + dx + 1, y + dy + 1, w, h);
      ctx.fillStyle = col; ctx.fillRect(x + dx, y + dy, w, h);
    };
    // bonus actif : un arc doré autour du viseur montre le temps restant
    if (this.power && this.t < this.powerUntil) {
      const k = (this.powerUntil - this.t) / this.powerMs;
      const n = 48;
      ctx.fillStyle = this.gun ? '#f0705a' : '#f8d070';
      for (let i = 0; i < n * k; i++) {
        const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
        ctx.fillRect(Math.round(x + Math.cos(a) * 13), Math.round(y + Math.sin(a) * 13), 1, 1);
      }
    }
    ring(ctx, x + 1, y + 1, 6, 6, OUT);
    ring(ctx, x, y, 6, 6, col);
    seg(-10, 0, 6, 1); seg(5, 0, 6, 1); seg(0, -10, 1, 6); seg(0, 5, 1, 6);
    ctx.fillStyle = '#fdf6e0'; ctx.fillRect(x, y, 1, 1);
  }

  hudStats() {
    const gun = this.gun;
    const ammo = gun
      ? [BONUSES[this.power].name, gun.mag ? `${this.gunAmmo}` : `${Math.ceil((this.powerUntil - this.t) / 1000)}s`, 'salmon']
      : ['BALLES', `${this.ammo}/${this.cap}`, 'green'];
    const out = [['TIRS', this.shots || 0, 'cream'], ['ABATTUS', this.kills || 0, 'yellow'], ammo];
    const b = this.world && shooterEventAt(this.world.events || [], 'bounty', this.t);
    if (b) out.push(['PRIME X2', `${Math.ceil((b.t1 - this.t) / 1000)}s`, 'yellow']);
    return out;
  }
}
