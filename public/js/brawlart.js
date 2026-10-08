// Dessins de « La mêlée » (vue de dessus, en 3/4) : sol, murs, caisses, buissons et eau pour chaque environnement,
// personnages (l'allure du cowboy de chaque joueur, avec l'arme de son kit), armes orientées, projectiles, objets.
// Tout est dessiné une fois puis gardé en cache ; le sol de la carte est un seul grand canevas.
// Le jeu se dessine en double résolution (Q pixels d'écran par pixel du jeu) : les sprites ont deux fois plus de pixels
// dans chaque sens ; leurs dimensions et leurs origines (ox, oy, top) restent comptées en pixels du jeu.
import * as S from './sprites.js';
import { SKIN, HAIR_COLORS, CLOTH_COLORS, EYE_COLORS, hatColorOf, beardHasMustache } from './data.js';
import { outline } from './miniscene.js';
import { C, KITS } from './brawlkit.js';

export const T = 16; // pixels par case
export const WALL_H = 6; // hauteur des murs (face avant) en pixels
export const Q = 2; // finesse des sprites : pixels d'écran par pixel du jeu
const OUT = S.OUT;

// Canevas en double résolution, sur lequel on dessine en pixels du jeu (les demi-pixels donnent les détails fins)
function qCanvas(w, h) {
  const c = S.makeCanvas(Math.ceil(w * Q), Math.ceil(h * Q), true);
  const g = c.getContext('2d');
  g.setTransform(Q, 0, 0, Q, 0, 0);
  g.imageSmoothingEnabled = false;
  return { c, g };
}

// Grain : chaque pixel fin un peu plus clair ou plus sombre (matière de la roche, du bois, de l'herbe)
function grain(c, amt, seed = 1) {
  const g = c.getContext('2d');
  const img = g.getImageData(0, 0, c.width, c.height);
  const d = img.data;
  for (let y = 0, i = 0; y < c.height; y++) for (let x = 0; x < c.width; x++, i += 4) {
    if (!d[i + 3]) continue;
    const n = (hash(x, y, seed) - 0.5) * amt * 255;
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
}

// Sprite en pixels fins : R(dx, dy, w, h, couleur) en pixels du jeu autour de l'origine (ox, oy), grain et contour fin
function qSprite(w, h, ox, oy, draw, amt = 0.08) {
  const { c, g } = qCanvas(w, h);
  draw((dx, dy, ww, hh, col) => { g.fillStyle = col; g.fillRect(ox + dx, oy + dy, ww, hh); }, g);
  if (amt) grain(c, amt, w * 7 + h);
  outline(c);
  c.ox = ox;
  c.oy = oy;
  return c;
}

// Dessine un sprite en pixels fins à sa taille en pixels du jeu (origine ox, oy ; flip : retourné)
export function blit(ctx, img, x, y, flip = false) {
  const w = img.width / Q, h = img.height / Q;
  if (!flip) { ctx.drawImage(img, x - (img.ox || 0), y - (img.oy || 0), w, h); return; }
  ctx.save();
  ctx.translate(x, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(img, -(img.ox || 0), y - (img.oy || 0), w, h);
  ctx.restore();
}
export const drawQ = (ctx, img, x, y, k = 1) => ctx.drawImage(img, x, y, (img.width / Q) * k, (img.height / Q) * k);

const hash = (x, y, k = 0) => {
  let h = (x * 374761393 + y * 668265263 + k * 2147483647) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
const pick = (list, r) => list[Math.floor(r * list.length) % list.length];

// ------------------------------------------------------------ environnements
// floor : teintes du sol ; dots : petits détails ; path : chemin ; water : eau (fond, reflet, berge)
// wall : style des murs ; crate : style des caisses ; bush : couleurs des buissons ; dark : sous terre (vision réduite)
export const ENV_ART = {
  desert: {
    floor: ['#dcbc7c', '#d8b676', '#e0c286', '#d4b070'], dots: ['#c09a5c', '#ecd4a0', '#b88e54'], path: ['#c8a264', '#c09a5c'],
    water: ['#3e8ab0', '#68b4d4', '#c8b070'], wall: 'mesa', rock: ['#d08850', '#a85e34', '#ecaa70', '#8a4a28'], crate: 'crate',
    bush: ['#9aa050', '#76803a', '#c0c070', '#5a6228'], envs: ['midi', 'aube', 'crepuscule', 'nuit', 'poussiere'],
  },
  foret: {
    floor: ['#5c8c3c', '#609040', '#58883a', '#649444'], dots: ['#4a7430', '#7cac54', '#8a6a3a'], path: ['#8c6c42', '#7e6038'],
    water: ['#2e7a8a', '#58a8b4', '#4a6a30'], wall: 'tree', rock: ['#7a8478', '#5a6458', '#9aa496', '#3e463c'], crate: 'logs',
    bush: ['#2e7a32', '#1e5a24', '#4a9a44', '#14401a'], envs: ['midi', 'aube', 'crepuscule', 'nuit', 'orage'],
  },
  prairie: {
    floor: ['#8cb454', '#90b858', '#88b050', '#94bc5c'], dots: ['#74a040', '#f0e8a0', '#e8a0b0', '#ffffff'], path: ['#b8975e', '#ac8c56'],
    water: ['#3c86b8', '#70b6dc', '#6a9a40'], wall: 'stone', rock: ['#a8a49a', '#7c786e', '#c8c4b8', '#5c5850'], crate: 'hay',
    bush: ['#d4b84c', '#a88a30', '#ecd474', '#7a6420'], envs: ['midi', 'aube', 'crepuscule', 'nuit', 'orage'],
  },
  mine: {
    floor: ['#4c4652', '#48424e', '#524c58', '#45404a'], dots: ['#3a3640', '#6a6472', '#8a70b0'], path: ['#5a5048', '#4e463e'],
    water: ['#1e4a6a', '#3a7aa0', '#3a3640'], wall: 'cave', rock: ['#5e5666', '#3c3644', '#7a7084', '#2a2430'], crate: 'cart',
    bush: ['#3ab8a8', '#1e7a70', '#8af0e0', '#145048'], envs: ['mine'], dark: true,
  },
  canyon: {
    floor: ['#c27c52', '#bc764c', '#c8845a', '#b8724a'], dots: ['#a86440', '#dc9c70', '#8a5034'], path: ['#d0a070', '#c69466'],
    water: ['#6a7a48', '#8c9c60', '#9a6a44'], wall: 'redrock', rock: ['#b85a38', '#8a3e24', '#d87a50', '#6a2e1a'], crate: 'barrel',
    bush: ['#8a6a3a', '#6a4a26', '#b08a50', '#4a3218'], envs: ['midi', 'aube', 'crepuscule', 'nuit', 'orage', 'poussiere'],
  },
  neige: {
    floor: ['#e8eef8', '#e2e9f5', '#eef3fb', '#dde5f2'], dots: ['#c8d4e8', '#ffffff', '#b0bcd4'], path: ['#c4cee2', '#bac6dc'],
    water: ['#3a6a9a', '#a8d0ec', '#f4f8ff'], wall: 'pine', rock: ['#9aa8bc', '#6a788c', '#e8f0fc', '#4a5668'], crate: 'snowcrate',
    bush: ['#4a7a5a', '#2e5a40', '#f4f8ff', '#1e3e2c'], envs: ['neige', 'aube', 'nuit', 'midi'],
  },
};

// ------------------------------------------------------------ sol (un canevas pour toute la carte)
export function renderGround(w) {
  const A = ENV_ART[w.env] || ENV_ART.desert;
  const { c, g } = qCanvas(w.w * T, w.h * T);
  const R = (x, y, ww, hh, col) => { g.fillStyle = col; g.fillRect(x, y, ww, hh); };
  const at = (x, y) => (x < 0 || y < 0 || x >= w.w || y >= w.h ? -1 : w.base[y * w.w + x]);
  for (let y = 0; y < w.h; y++) for (let x = 0; x < w.w; x++) drawFloor(g, R, A, w, x, y);
  for (let y = 0; y < w.h; y++) for (let x = 0; x < w.w; x++) {
    const ty = at(x, y);
    if (ty === C.PATH) drawPath(R, A, w, x, y, at);
    else if (ty === C.WATER) drawWater(R, A, w, x, y, at);
  }
  // ombre au pied des murs, des caisses (côté bas) et sous les buissons
  for (let y = 0; y < w.h; y++) for (let x = 0; x < w.w; x++) {
    const ty = at(x, y);
    if ((ty === C.WALL || ty === C.CRATE || ty === C.CHEST) && at(x, y + 1) !== C.WALL && y + 1 < w.h) {
      g.fillStyle = 'rgba(20,10,20,0.22)';
      g.fillRect(x * T, (y + 1) * T, T, 3);
      g.fillRect(x * T + 2, (y + 1) * T + 3, T - 2, 1);
    }
  }
  grain(c, w.env === 'neige' ? 0.035 : 0.06, 3);
  // le contexte garde l'échelle : brûlures et débris se peignent ensuite en pixels du jeu
  return c;
}

function drawFloor(g, R, A, w, x, y) {
  const px = x * T, py = y * T;
  R(px, py, T, T, pick(A.floor, hash(x, y, 1)));
  // grain : taches de 2 × 2 dans des teintes voisines
  for (let k = 0; k < 10; k++) {
    const r = hash(x, y, k + 10);
    R(px + Math.floor(r * 8) * 2, py + Math.floor(hash(x, y, k + 30) * 8) * 2, 2, 2, pick(A.floor, hash(x, y, k + 50)));
  }
  const nd = 3 + Math.floor(hash(x, y, 2) * 4);
  for (let k = 0; k < nd; k++) {
    const dx = Math.floor(hash(x, y, k + 70) * 15), dy = Math.floor(hash(x, y, k + 90) * 15);
    const col = pick(A.dots, hash(x, y, k + 110));
    if (w.env === 'foret' || w.env === 'prairie') R(px + dx, py + dy, 1, 2, col); // brins d'herbe
    else R(px + dx, py + dy, 1, 1, col);
  }
  // détails fins (demi-pixels)
  for (let k = 0; k < 8; k++) R(px + Math.floor(hash(x, y, k + 130) * 31) / 2, py + Math.floor(hash(x, y, k + 150) * 31) / 2, 0.5, w.env === 'foret' || w.env === 'prairie' ? 1 : 0.5, pick(A.dots, hash(x, y, k + 170)));
  const r = hash(x, y, 3);
  if (w.env === 'desert' && r < 0.08) { R(px + 4, py + 9, 3, 2, '#b08850'); R(px + 4, py + 9, 2, 1, '#e4c890'); } // caillou
  if (w.env === 'canyon' && r < 0.12) { for (let k = 0; k < 5; k++) R(px + 3 + k * 2, py + 6 + (k % 2), 2, 1, '#9a5a38'); } // fissure
  if (w.env === 'prairie' && r < 0.1) { R(px + 6, py + 6, 1, 1, '#fff0a0'); R(px + 5, py + 6, 1, 1, '#ffffff'); R(px + 7, py + 6, 1, 1, '#ffffff'); R(px + 6, py + 5, 1, 1, '#ffffff'); R(px + 6, py + 7, 1, 1, '#ffffff'); }
  if (w.env === 'foret' && r < 0.1) { R(px + 9, py + 4, 2, 1, '#b07a30'); R(px + 10, py + 5, 1, 1, '#8a5a20'); } // feuille morte
  if (w.env === 'mine' && r < 0.06) { R(px + 7, py + 8, 1, 2, '#b090e0'); R(px + 8, py + 9, 1, 1, '#e0d0ff'); } // éclat de cristal
  if (w.env === 'neige' && r < 0.12) { R(px + 5, py + 4, 2, 1, '#c4d0e4'); R(px + 8, py + 9, 2, 1, '#c4d0e4'); } // traces
}

function drawPath(R, A, w, x, y, at) {
  const px = x * T, py = y * T;
  const same = (dx, dy) => at(x + dx, y + dy) === C.PATH;
  if (w.env === 'mine') {
    // rails : traverses en bois, deux rails d'acier, dans le sens des cases voisines
    R(px, py, T, T, A.path[0]);
    for (let k = 0; k < 6; k++) R(px + Math.floor(hash(x, y, k) * 15), py + Math.floor(hash(x, y, k + 9) * 15), 1, 1, '#3a342e');
    const h = same(-1, 0) || same(1, 0), v = same(0, -1) || same(0, 1);
    if (h || !v) {
      for (let k = 1; k < T; k += 4) R(px + k, py + 3, 2, 10, '#6a4a2a');
      R(px, py + 4, T, 1, '#a8a8b0'); R(px, py + 11, T, 1, '#a8a8b0'); R(px, py + 5, T, 1, '#5a5a62'); R(px, py + 12, T, 1, '#5a5a62');
    }
    if (v) {
      for (let k = 1; k < T; k += 4) R(px + 3, py + k, 10, 2, '#6a4a2a');
      R(px + 4, py, 1, T, '#a8a8b0'); R(px + 11, py, 1, T, '#a8a8b0'); R(px + 5, py, 1, T, '#5a5a62'); R(px + 12, py, 1, T, '#5a5a62');
    }
    return;
  }
  // chemin de terre (ou neige tassée) aux bords irréguliers
  const m = (dx, dy) => (same(dx, dy) ? 0 : 2);
  const l = m(-1, 0), r = m(1, 0), u = m(0, -1), d = m(0, 1);
  R(px + l, py + u, T - l - r, T - u - d, A.path[0]);
  for (let k = 0; k < 6; k++) R(px + 2 + Math.floor(hash(x, y, k + 3) * 12), py + 2 + Math.floor(hash(x, y, k + 8) * 12), 2, 1, A.path[1]);
  if (!l) R(px, py + 4, 2, 8, A.path[0]);
  if (!r) R(px + T - 2, py + 4, 2, 8, A.path[0]);
  if (w.env === 'desert' || w.env === 'prairie') {
    // ornières
    if (same(-1, 0) || same(1, 0)) { R(px, py + 5, T, 1, A.path[1]); R(px, py + 10, T, 1, A.path[1]); }
    else if (same(0, -1) || same(0, 1)) { R(px + 5, py, 1, T, A.path[1]); R(px + 10, py, 1, T, A.path[1]); }
  }
}

function drawWater(R, A, w, x, y, at) {
  const px = x * T, py = y * T;
  const [deep, hi, bank] = A.water;
  R(px, py, T, T, deep);
  const wet = (dx, dy) => { const t = at(x + dx, y + dy); return t === C.WATER || t === -1; };
  // berges
  if (!wet(0, -1)) { R(px, py, T, 2, bank); R(px, py + 2, T, 1, S.shade(deep, -0.25)); }
  if (!wet(0, 1)) R(px, py + T - 2, T, 2, S.shade(bank, -0.1));
  if (!wet(-1, 0)) R(px, py, 2, T, bank);
  if (!wet(1, 0)) R(px + T - 2, py, 2, T, bank);
  for (let k = 0; k < 3; k++) {
    const dx = 2 + Math.floor(hash(x, y, k + 40) * 9), dy = 3 + Math.floor(hash(x, y, k + 60) * 10);
    R(px + dx, py + dy, 3 + Math.floor(hash(x, y, k) * 3), 1, hi);
  }
  if (w.env === 'neige' && hash(x, y, 7) < 0.35) { R(px + 4, py + 5, 6, 4, '#e8f2fc'); R(px + 5, py + 9, 4, 1, '#b8cce0'); } // glaçon
  if (w.env === 'foret' && hash(x, y, 7) < 0.15) { R(px + 6, py + 7, 4, 3, '#4a8a3a'); R(px + 7, py + 7, 1, 1, '#f0f0d0'); } // nénuphar
}

// ------------------------------------------------------------ murs, caisses, buissons (sprites par case)
const tileCache = new Map();
const cached = (key, make) => {
  let c = tileCache.get(key);
  if (!c) { c = make(); tileCache.set(key, c); }
  return c;
};
export const forgetTiles = () => { for (const c of tileCache.values()) S.freeCanvas?.(c); tileCache.clear(); };

// Le sprite d'un mur à la case (x, y) : n, s, e, o : voisins qui sont des murs
export function wallSprite(w, x, y) {
  const A = ENV_ART[w.env] || ENV_ART.desert;
  const isW = (dx, dy) => { const X = x + dx, Y = y + dy; return X < 0 || Y < 0 || X >= w.w || Y >= w.h || w.base[Y * w.w + X] === C.WALL; };
  const n = isW(0, -1), s = isW(0, 1), e = isW(1, 0), o = isW(-1, 0);
  const alone = !n && !s && !e && !o;
  const v = Math.floor(hash(x, y, 5) * 4);
  let style = A.wall;
  if (style === 'mesa' && alone) style = 'cactus';
  if (style === 'tree' && hash(x, y, 6) < 0.18) style = 'mossrock';
  if (style === 'pine' && hash(x, y, 6) < 0.22) style = 'icerock';
  if (style === 'stone' && alone) style = 'boulder';
  if (style === 'cave' && hash(x, y, 6) < 0.3) style = 'crystal';
  const key = `${w.env}|${style}|${+n}${+s}${+e}${+o}|${v}`;
  return cached(key, () => drawWall(style, A, { n, s, e, o, v }));
}

function drawWall(style, A, nb) {
  // canevas : 16 de large, 16 + WALL_H + 10 de haut (les arbres débordent vers le haut) ; origine en haut de la case
  const H = T + WALL_H + 10, top = 10;
  const { c, g } = qCanvas(T, H);
  const R = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x, y + top, w, h); };
  const [base, dark, light, deep] = A.rock;
  const block = (cTop, cSide, cHi, cLo, stripes) => {
    // face du dessus (remontée de WALL_H), puis face avant
    R(0, -WALL_H, T, T, cTop);
    if (!nb.n) R(0, -WALL_H, T, 2, cHi);
    if (!nb.o) R(0, -WALL_H, 1, T, cHi);
    if (!nb.e) R(T - 1, -WALL_H, 1, T, cLo);
    for (let k = 0; k < 4; k++) R(2 + ((k * 5 + nb.v * 3) % 12), -WALL_H + 3 + ((k * 7 + nb.v) % 9), 2, 1, k % 2 ? cHi : cLo);
    if (!nb.s) {
      R(0, T - WALL_H, T, WALL_H, cSide);
      R(0, T - WALL_H, T, 1, cLo);
      if (stripes) for (let k = 0; k < 3; k++) R(0, T - WALL_H + 2 + k * 2, T, 1, k % 2 ? cSide : S.shade(cSide, -0.12));
      else for (let k = 0; k < 3; k++) R(2 + ((k * 6 + nb.v * 2) % 13), T - WALL_H + 2, 1, WALL_H - 2, cLo);
      R(0, T - 0.5, T, 0.5, OUT);
    }
    if (!nb.n) R(0, -WALL_H - 0.5, T, 0.5, OUT);
    if (!nb.o) R(0, -WALL_H, 0.5, T + (nb.s ? 0 : WALL_H), OUT);
    if (!nb.e) R(T - 0.5, -WALL_H, 0.5, T + (nb.s ? 0 : WALL_H), OUT);
  };
  switch (style) {
    case 'mesa': block(base, dark, light, deep, true); break;
    case 'redrock': block(base, dark, light, deep, true); R(3, -WALL_H + 6, 9, 1, light); break;
    case 'cave': block(base, dark, light, deep, false); break;
    case 'stone': {
      block(base, dark, light, deep, false);
      // pierres des champs
      for (let k = 0; k < 5; k++) R(1 + ((k * 4 + nb.v) % 12), -WALL_H + 2 + ((k * 3) % 11), 3, 2, k % 2 ? light : dark);
      break;
    }
    case 'crystal': {
      block(A.rock[0], A.rock[1], A.rock[2], A.rock[3], false);
      const cols = nb.v % 2 ? ['#a070e0', '#e0c8ff', '#6a40a8'] : ['#40c0e0', '#c8f4ff', '#2a7a98'];
      R(5, -WALL_H + 2, 3, 7, cols[0]); R(6, -WALL_H + 1, 1, 2, cols[1]); R(9, -WALL_H + 5, 3, 5, cols[0]); R(9, -WALL_H + 5, 1, 4, cols[1]);
      R(5, -WALL_H + 8, 7, 1, cols[2]);
      break;
    }
    case 'mossrock': {
      block('#7a8478', '#566050', '#9aa496', '#3e463c', false);
      R(2, -WALL_H + 1, 8, 3, '#4a8a3a'); R(3, -WALL_H, 5, 1, '#6aaa4a');
      break;
    }
    case 'icerock': {
      block('#c8d8ec', '#8aa0bc', '#ffffff', '#5a6e88', false);
      R(3, -WALL_H + 2, 6, 2, '#ffffff');
      break;
    }
    case 'boulder': {
      R(1, -2, 14, 13, base); R(3, -4, 10, 2, base); R(2, -3, 7, 3, light); R(3, 8, 11, 3, dark); R(10, 1, 4, 6, dark);
      R(1, 10, 14, 1, OUT); R(0, -2, 1, 12, OUT); R(15, -2, 1, 12, OUT); R(3, -5, 10, 1, OUT);
      break;
    }
    case 'cactus': {
      const gC = '#4a8a3a', d = '#2e5a28', l = '#6aaa4a';
      R(6, -14, 5, 28, gC); R(6, -14, 1, 28, l); R(10, -14, 1, 28, d); R(6, -15, 5, 1, OUT);
      R(1, -6, 5, 3, gC); R(1, -11, 3, 6, gC); R(1, -11, 1, 6, l); R(11, -2, 4, 3, gC); R(12, -9, 3, 8, gC); R(14, -9, 1, 8, d);
      for (let k = 0; k < 6; k++) R(7 + (k % 2) * 2, -12 + k * 4, 1, 1, '#d8e8a0');
      R(4, 13, 10, 2, 'rgba(0,0,0,0.25)');
      break;
    }
    case 'tree': {
      // tronc, puis grosse frondaison qui déborde vers le haut
      R(6, 4, 4, 11, '#6a4428'); R(6, 4, 1, 11, '#8a5c38'); R(9, 4, 1, 11, '#4a2c18');
      const leaf = ['#2e6a2a', '#3e8a34', '#5aa848', '#1e4a1e'];
      R(1, -9, 14, 13, leaf[1]); R(3, -12, 10, 3, leaf[1]); R(0, -5, 16, 7, leaf[1]);
      R(3, -11, 6, 4, leaf[2]); R(2, -7, 4, 3, leaf[2]); R(9, -8, 3, 2, leaf[2]);
      R(1, 1, 14, 3, leaf[0]); R(11, -4, 4, 6, leaf[0]);
      for (let k = 0; k < 5; k++) R(2 + ((k * 3 + nb.v * 5) % 12), -10 + ((k * 5) % 12), 1, 1, leaf[3]);
      R(3, -13, 10, 1, OUT); R(0, -6, 1, 9, OUT); R(15, -6, 1, 9, OUT); R(1, 4, 5, 1, OUT); R(10, 4, 5, 1, OUT);
      break;
    }
    case 'pine': {
      R(7, 8, 2, 7, '#5a3a20');
      const d = '#1e4a32', m = '#2e6a46', sn = '#f4f8ff', sh = '#c8d8ec';
      R(2, 4, 12, 4, m); R(3, -1, 10, 5, m); R(4, -6, 8, 5, m); R(6, -11, 4, 5, m); R(7, -14, 2, 3, m);
      R(2, 7, 12, 1, d); R(3, 3, 10, 1, d); R(4, -2, 8, 1, d);
      R(3, 4, 6, 1, sn); R(4, -1, 5, 1, sn); R(5, -6, 4, 1, sn); R(6, -11, 3, 1, sn); R(7, -14, 1, 1, sn); R(9, 4, 3, 1, sh);
      R(1, 4, 1, 4, OUT); R(14, 4, 1, 4, OUT); R(7, -15, 2, 1, OUT);
      break;
    }
    default: block(base, dark, light, deep, false);
  }
  grain(c, 0.09, nb.v + 11);
  c.top = top;
  return c;
}

// Caisse, tonneau, foin… (cassable) ; coffre à poudre (mêlée) ; sacs de sable
export function crateSprite(env, x, y) {
  const A = ENV_ART[env] || ENV_ART.desert;
  const v = hash(x, y, 9) < 0.5 ? 0 : 1;
  return cached(`crate|${A.crate}|${v}`, () => qSprite(T + 2, T + 8, 1, T + 6, (R) => {
    const h = 4;
    switch (A.crate) {
      case 'hay':
        R(1, -15 - h, 14, 13, '#d8b858'); R(1, -15 - h, 14, 2, '#f0d078'); R(1, -2 - h, 14, h + 2, '#b09040');
        R(5, -15 - h, 1, 13 + h, '#8a6a30'); R(10, -15 - h, 1, 13 + h, '#8a6a30');
        for (let k = 2; k < 14; k += 3) R(k, -10 - h, 1, 2, '#f0d078');
        break;
      case 'logs':
        for (const yy of [-6, -11, -16]) { R(1, yy - h + 2, 14, 5, '#8a5a30'); R(1, yy - h + 2, 14, 1, '#a87040'); R(1, yy - h + 2, 3, 5, '#d0a870'); R(2, yy - h + 3, 1, 2, '#8a5a30'); }
        R(1, -2, 14, 2, '#5a3818');
        break;
      case 'cart':
        if (v) { // caisse de TNT
          R(1, -15 - h, 14, 15 + h, '#a83828'); R(1, -15 - h, 14, 2, '#d05040'); R(4, -10 - h, 8, 4, '#f0e0c0'); R(5, -9 - h, 6, 2, '#a83828');
          R(1, -2, 14, 2, '#6a1e14');
        } else { // wagonnet de minerai
          R(1, -12 - h, 14, 12 + h, '#6a6a72'); R(1, -12 - h, 14, 2, '#9a9aa2'); R(2, -15 - h, 12, 4, '#8a7a5a'); R(4, -16 - h, 4, 2, '#c0a040'); R(9, -16 - h, 3, 2, '#a080d0');
          R(2, -2, 3, 2, '#2a2a2a'); R(11, -2, 3, 2, '#2a2a2a');
        }
        break;
      case 'barrel':
        R(2, -15 - h, 12, 15 + h, '#8a5a30'); R(2, -15 - h, 12, 3, '#a87040'); R(4, -14 - h, 8, 1, '#5a3818');
        R(2, -9 - h, 12, 1, '#4a4440'); R(2, -3, 12, 1, '#4a4440'); R(4, -12, 1, 10, '#a87040'); R(13, -12 - h, 1, 12 + h, '#5a3818');
        break;
      case 'snowcrate':
        R(1, -15 - h, 14, 15 + h, '#a88050'); R(1, -15 - h, 14, 4, '#f4f8ff'); R(1, -11 - h, 14, 1, '#c8d8ec');
        R(1, -2 - h, 14, 1, '#7a5a30'); for (let k = 0; k < 10; k++) R(2 + k, -10 - h + k, 2, 1, '#7a5a30');
        break;
      default:
        R(1, -15 - h, 14, 15 + h, '#b08850'); R(1, -15 - h, 14, 2, '#c8a068'); R(1, -2 - h, 14, 1, '#8a6438'); R(1, -2, 14, 2, '#6a4a28');
        R(1, -15 - h, 2, 15 + h, '#8a6438'); R(13, -15 - h, 2, 15 + h, '#8a6438');
        for (let k = 0; k < 11; k++) R(2 + k, -14 - h + k, 2, 1, '#8a6438');
    }
  }));
}

export const chestSprite = () => cached('chest', () => qSprite(T + 2, T + 8, 1, T + 6, (R) => {
  R(1, -16, 14, 16, '#7a4a28'); R(1, -16, 14, 4, '#9a6034'); R(1, -12, 14, 1, '#4a2a14');
  R(1, -16, 2, 16, '#c83828'); R(13, -16, 2, 16, '#c83828'); R(6, -10, 4, 4, '#e0b040'); R(7, -9, 2, 2, '#4a2a14');
  R(4, -15, 2, 2, '#2a2a2a'); R(5, -16, 1, 1, '#f8d070');
}));

export const sandSprite = () => cached('sand', () => qSprite(T + 2, T + 8, 1, T + 6, (R) => {
  for (const [x, y] of [[1, -7], [8, -7], [4, -13], [11, -13], [1, -19], [8, -19]]) {
    if (y < -16 && x > 10) continue;
    R(x, y, 7, 6, '#c8b078'); R(x, y, 7, 1, '#e0cc98'); R(x + 1, y + 5, 6, 1, '#9a8450'); R(x + 3, y + 2, 1, 1, '#9a8450');
  }
}));

// Buisson : deux images (il ondule) ; dessiné par-dessus ceux qui s'y cachent
export function bushSprite(env, x, y, f) {
  const A = ENV_ART[env] || ENV_ART.desert;
  const v = Math.floor(hash(x, y, 4) * 3);
  return cached(`bush|${env}|${v}|${f}`, () => {
    const { c, g } = qCanvas(T + 4, T + 8);
    const R = (xx, yy, w, h, col) => { g.fillStyle = col; g.fillRect(xx + 2, yy + 6, w, h); };
    const [m, d, l, dd] = A.bush;
    const sway = f ? 1 : 0;
    if (env === 'prairie' || env === 'canyon') {
      // hautes herbes : des brins
      R(-1, 4, 18, 12, d);
      for (let k = 0; k < 9; k++) {
        const bx = k * 2 + (v + k) % 2 - 1, hgt = 8 + ((k * 5 + v) % 6);
        R(bx + (k % 3 === 0 ? sway : 0), 14 - hgt, 2, hgt, k % 2 ? m : l);
        R(bx, 14 - hgt + 1, 1, 2, dd);
      }
      R(-1, 14, 18, 2, dd);
    } else if (env === 'mine') {
      // champignons phosphorescents
      R(0, 6, 16, 10, '#2a3a40');
      for (const [bx, by, r] of [[1, 2, 5], [8, -2, 6], [4, 7, 4], [11, 6, 4]]) {
        R(bx + 1, by + r - 1, 2, 5, '#c8d8d0');
        R(bx - 1 + sway, by, r + 2, r - 1, m); R(bx + sway, by, r, 1, l); R(bx + 1 + sway, by + 1, 1, 1, '#ffffff'); R(bx - 1 + sway, by + r - 2, r + 2, 1, d);
      }
    } else {
      // touffes rondes
      const blob = (bx, by, w, h) => { R(bx, by + 1, w, h - 2, m); R(bx + 1, by, w - 2, h, m); R(bx + 1, by + 1, w - 3, 2, l); R(bx + 1, by + h - 2, w - 2, 1, d); };
      blob(-1, 3, 9, 10); blob(7 + sway, 1, 10, 11); blob(3, 7, 10, 9); blob(-1 + sway, -2 + v, 7, 7); blob(9, 8 - v, 8, 8);
      for (let k = 0; k < 6; k++) R(((k * 5 + v * 3) % 15), ((k * 7 + v) % 13), 1, 1, dd);
      if (env === 'neige') { R(0, -2 + v, 6, 2, '#f4f8ff'); R(8 + sway, 1, 8, 2, '#f4f8ff'); R(4, 7, 6, 1, '#f4f8ff'); }
      if (env === 'desert') { R(3, 2, 1, 1, '#e8d890'); R(12, 5, 1, 1, '#e8d890'); }
      if (env === 'foret') { for (let k = 0; k < 4; k++) R(1 + k * 4, 9 + (k % 2) * 3, 3, 1, l); }
    }
    grain(c, 0.1, v + f * 5 + 21);
    outline(c, [20, 40, 20]);
    c.ox = 2;
    c.oy = 6;
    return c;
  });
}

// ------------------------------------------------------------ personnages (haute définition : Q pixels par pixel du jeu)
// look : l'allure d'un joueur (couleurs et chapeau tirés de son personnage)
export function lookOf(character, key) {
  const c = character || {};
  return {
    key: `${key}|${JSON.stringify(c)}`,
    skin: SKIN[c.skin] || SKIN[1], hair: HAIR_COLORS[c.hairColor] || HAIR_COLORS[1], eye: EYE_COLORS[c.eyeColor] || EYE_COLORS[0],
    cloth: CLOTH_COLORS[c.outfitColor] || CLOTH_COLORS[2], hatC: hatColorOf(c), hat: c.hat || 'cowboy', beard: c.beard || 'none',
  };
}

// Repères du corps, en pixels du jeu depuis les pieds : hauteur des mains (où l'on tient l'arme) et du haut de la tête
export const HAND_Y = -6.5;
export const HEAD_Y = -16;

const charCache = new Map();
export const forgetChars = () => { for (const c of charCache.values()) S.freeCanvas?.(c); charCache.clear(); };

// Chapeau, en pixels fins (P : rectangle en pixels du sprite haute définition, origine aux pieds)
function hatHD(P, r, back) {
  const { hatC, hat, hair } = r;
  const D = S.shade(hatC, -0.3), L = S.shade(hatC, 0.22), band = S.shade(hatC, -0.5);
  switch (hat) {
    case 'sombrero':
      P(-11, -33, 22, 3, hatC); P(-11, -33, 22, 1, L); P(-10, -31, 20, 1, D);
      P(-4, -39, 8, 6, hatC); P(-4, -39, 2, 6, L); P(-4, -35, 8, 1, band);
      for (let k = -9; k <= 7; k += 4) P(k, -32, 1, 1, '#e0b040');
      break;
    case 'bowler':
      P(-6, -33, 12, 1, hatC);
      P(-4, -37, 8, 4, hatC); P(-3, -38, 6, 1, hatC); P(-4, -37, 2, 3, L); P(-4, -34, 8, 1, band);
      break;
    case 'tophat':
      P(-6, -33, 12, 1, hatC);
      P(-4, -42, 8, 9, hatC); P(-4, -42, 2, 9, L); P(3, -42, 1, 9, D); P(-4, -35, 8, 1, band);
      break;
    case 'gambler':
      P(-7, -33, 14, 1, hatC);
      P(-4, -36, 8, 3, hatC); P(-4, -36, 8, 1, L); P(-4, -34, 8, 1, band);
      break;
    case 'bandana':
      P(-5, -34, 10, 4, hatC); P(-5, -34, 10, 1, L); P(-5, -31, 10, 1, D);
      P(-3, -33, 1, 1, '#f4ecd8'); P(1, -33, 1, 1, '#f4ecd8');
      if (back) { P(0, -30, 2, 4, hatC); P(1, -27, 1, 2, D); }
      break;
    case 'coonskin':
      P(-5, -36, 10, 5, '#8a6a48'); P(-5, -36, 10, 1, '#a88a68'); P(-3, -34, 1, 2, '#6a4a30'); P(1, -34, 1, 2, '#6a4a30');
      P(back ? -1 : 4, -32, 2, 8, '#8a6a48'); P(back ? -1 : 4, -29, 2, 1, '#4a3420'); P(back ? -1 : 4, -26, 2, 1, '#4a3420');
      break;
    case 'none':
      P(-5, -33, 10, 3, hair); P(-3, -34, 6, 1, hair); P(-3, -33, 3, 1, S.shade(hair, 0.25));
      break;
    default: // chapeau de cow-boy
      P(-8, -33, 16, 2, hatC); P(-8, -33, 16, 1, L); P(-9, -34, 2, 1, hatC); P(7, -34, 2, 1, hatC); // bords relevés
      P(-4, -38, 8, 5, hatC); P(-4, -38, 1, 5, L); P(3, -38, 1, 5, D);
      P(-1, -38, 2, 1, D); // creux du dessus
      P(-4, -34, 8, 1, band); P(-3, -34, 1, 1, '#e0b040');
  }
}

// Petit bonhomme en 3/4 : de face (back = false) ou de dos ; frame 0..3 (marche) ; kit pour la carrure et l'accessoire.
// Dessiné en pixels fins : 40 × 48 (20 × 24 pixels du jeu, un peu plus d'une case de haut), origine aux pieds.
export function charSprite(r, kit, back, frame) {
  const key = `${r.key}|${kit}|${back ? 'b' : 'f'}|${frame}`;
  let c = charCache.get(key);
  if (c) return c;
  c = S.makeCanvas(40, 48, true);
  const g = c.getContext('2d');
  const P = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(20 + x, 44 + y, w, h); };
  const { skin, hair, cloth, beard, eye, hatC } = r;
  const skinD = S.shade(skin, -0.2), skinL = S.shade(skin, 0.15);
  const hairD = S.shade(hair, -0.3), hairL = S.shade(hair, 0.2);
  const clothD = S.shade(cloth, -0.3), clothL = S.shade(cloth, 0.18);
  const pants = kit === 'forgeron' ? '#3a3028' : '#4a3a2a', pantsD = '#2e2418';
  const boot = '#3a2414', bootL = '#5a3a20';
  const b = kit === 'forgeron' || kit === 'pompe' ? 1 : 0; // carrure
  const lu = frame === 1 ? 1 : 0, ru = frame === 3 ? 1 : 0; // jambe levée
  const sw = frame === 1 ? 1 : frame === 3 ? -1 : 0; // bras qui balancent
  // accessoires portés dans le dos (vus de dos : devant le corps, sinon derrière)
  const backGear = () => {
    if (kit === 'arc') { P(-5, -28, 4, 10, '#8a5a30'); P(-5, -28, 4, 1, '#a87040'); P(-5, -30, 1, 2, '#e8e0d0'); P(-3, -31, 1, 3, '#e8e0d0'); }
    if (kit === 'dynamite' && back) { P(-3, -20, 6, 5, '#6a4a2a'); P(-3, -20, 6, 1, '#8a6a40'); P(-2, -18, 4, 2, '#c83828'); }
  };
  if (!back) backGear();
  // jambes et bottes
  P(-5 - b, -10, 4, 6 - lu, pants); P(-2 - b, -10, 1, 6 - lu, pantsD);
  P(-6 - b, -4 - lu, 5, 4, boot); P(-6 - b, -4 - lu, 5, 1, bootL); P(-6 - b, -1 - lu, 5, 1, '#1a0e06');
  P(1 + b, -10, 4, 6 - ru, pants); P(1 + b, -10, 1, 6 - ru, pantsD);
  P(1 + b, -4 - ru, 5, 4, boot); P(1 + b, -4 - ru, 5, 1, bootL); P(1 + b, -1 - ru, 5, 1, '#1a0e06');
  if (kit === 'sniper') { P(-6, -12, 12, 5, S.shade(cloth, -0.42)); P(-1, -12, 1, 5, S.shade(cloth, -0.55)); } // pans du manteau
  // corps
  P(-6 - b, -21, 12 + 2 * b, 9, cloth);
  P(-6 - b, -21, 1, 9, clothL); P(5 + b, -21, 1, 9, clothD);
  P(-6 - b, -13, 12 + 2 * b, 1, clothD);
  if (!back) {
    P(-1, -21, 2, 2, skin); // col ouvert
    P(0, -18, 1, 1, clothD); P(0, -15, 1, 1, clothD); // boutons
    P(-4, -20, 1, 6, clothD); P(3, -20, 1, 6, clothD); // plis
  } else P(0, -20, 1, 7, clothD); // couture du dos
  P(-3, -22, 6, 2, hatC); // foulard
  if (!back) P(-1, -20, 2, 2, hatC);
  P(-6 - b, -12, 12 + 2 * b, 2, '#3a2414'); // ceinture
  if (!back) { P(-1, -12, 2, 2, '#e0b040'); P(-1, -12, 1, 1, '#f8e08a'); }
  // bras
  P(-9 - b, -20 + sw, 3, 7, cloth); P(-9 - b, -20 + sw, 1, 7, clothL);
  P(-9 - b, -13 + sw, 3, 2, skin);
  P(6 + b, -20 - sw, 3, 7, cloth); P(8 + b, -20 - sw, 1, 7, clothD);
  P(6 + b, -13 - sw, 3, 2, skin);
  // accessoire du kit
  switch (kit) {
    case 'dynamite': if (!back) for (let k = 0; k < 5; k++) { P(-5 + k * 2, -20 + k * 2, 2, 2, '#c83828'); P(-5 + k * 2, -21 + k * 2, 1, 1, '#e8d8a0'); } break;
    case 'colts': P(-8 - b, -11, 2, 4, '#6a4020'); P(-8 - b, -12, 2, 1, '#3a3a40'); P(6 + b, -11, 2, 4, '#6a4020'); P(6 + b, -12, 2, 1, '#3a3a40'); break;
    case 'pompe': P(-7, -23, 14, 3, '#8a6a48'); P(-7, -23, 14, 1, '#b0906a'); for (let k = -6; k < 7; k += 3) P(k, -21, 1, 1, '#6a4a30'); break;
    case 'couteau': if (!back) { P(-5, -25, 10, 3, '#2a2a2e'); P(-5, -25, 10, 1, '#4a4a52'); } break;
    case 'arc': if (!back) for (let k = 0; k < 5; k++) P(-4 + k * 2, -21 + k * 2, 1, 1, '#8a5a30'); break;
    case 'forgeron': if (!back) { P(-4, -19, 8, 10, '#6a4a30'); P(-4, -19, 8, 1, '#8a6a48'); P(-4, -19, 1, 10, '#8a6a48'); } break;
    case 'docteur': if (!back) { P(-2, -19, 4, 5, '#f4ecd8'); P(-1, -19, 2, 5, '#c83828'); P(-2, -17, 4, 1, '#c83828'); } break;
    case 'gatling': for (let k = 0; k < 6; k++) P(-6 + k * 2, -21 + k * 2, 2, 1, k % 2 ? '#f0d070' : '#c0a040'); break;
    default: break;
  }
  // tête
  if (back) {
    P(-5, -32, 10, 11, hair); P(-5, -32, 10, 1, hairL); P(-5, -23, 10, 2, hairD);
    P(-6, -27, 1, 2, skinD); P(5, -27, 1, 2, skinD); // oreilles
    P(-2, -21, 4, 1, skinD); // nuque
  } else {
    P(-5, -31, 10, 10, skin);
    P(-5, -31, 1, 10, skinL); P(3, -30, 2, 9, skinD); P(-4, -22, 8, 1, skinD);
    P(-6, -27, 1, 2, skin); P(5, -27, 1, 2, skinD); // oreilles
    P(-5, -32, 10, 2, hair); P(-5, -30, 1, 4, hair); P(4, -30, 1, 4, hair); P(-3, -32, 3, 1, hairL); // cheveux
    P(-4, -28, 2, 1, hairD); P(1, -28, 2, 1, hairD); // sourcils
    P(-4, -27, 2, 2, '#ffffff'); P(1, -27, 2, 2, '#ffffff'); // yeux
    P(-3, -27, 1, 2, eye); P(2, -27, 1, 2, eye);
    P(0, -25, 1, 1, skinD); // nez
    P(-1, -23, 3, 1, '#8a4a3a'); // bouche
    if (beardHasMustache(beard)) P(-3, -24, 6, 1, hair);
    if (['full', 'prospector'].includes(beard)) { P(-5, -25, 10, 4, hair); P(-4, -22, 8, 1, hairD); P(-1, -23, 3, 1, '#5a2a1a'); }
    if (beard === 'chops' || beard === 'chinstrap') { P(-5, -27, 1, 5, hair); P(4, -27, 1, 5, hair); if (beard === 'chinstrap') P(-4, -22, 8, 1, hair); }
    if (beard === 'goatee' || beard === 'imperial') P(-1, -22, 2, 2, hair);
    if (beard === 'stubble') for (let k = -4; k < 4; k += 2) P(k, -22, 1, 1, S.shade(skin, -0.32));
  }
  hatHD(P, r, back);
  if (back) backGear();
  outline(c);
  c.ox = 10;
  c.oy = 22;
  charCache.set(key, c);
  return c;
}

// ------------------------------------------------------------ armes (pixels fins, dessinées vers la droite, puis tournées)
const WEAPON_DRAW = {
  dynamite: (P) => { P(0, -2, 9, 4, '#c83828'); P(0, -2, 9, 1, '#e86050'); P(3, -2, 1, 4, '#f0e0c0'); P(9, -1, 2, 1, '#e8d8a0'); P(11, -2, 1, 1, '#f8d070'); },
  colts: (P) => {
    P(-1, 0, 3, 5, '#6a4020'); P(-1, 0, 1, 5, '#8a5a30'); P(1, -1, 3, 3, '#4a4a52');
    P(3, -2, 4, 4, '#5a5a62'); P(4, -2, 1, 4, '#8a8a92'); P(6, -1, 7, 2, '#3a3a40'); P(6, -1, 7, 1, '#a0a0a8');
  },
  pompe: (P) => {
    P(-5, 0, 8, 4, '#6a4428'); P(-5, 0, 8, 1, '#8a5c38'); P(3, -1, 6, 4, '#3a3a40'); P(3, -1, 6, 1, '#7a7a82');
    P(9, -1, 12, 2, '#4a4a52'); P(9, -1, 12, 1, '#a0a0a8'); P(10, 1, 5, 2, '#8a5a30');
  },
  sniper: (P) => {
    P(-6, 0, 9, 4, '#6a4428'); P(-6, 0, 9, 1, '#8a5c38'); P(3, -1, 6, 3, '#3a3a40'); P(9, -1, 18, 2, '#5a5a62'); P(9, -1, 18, 1, '#a0a0a8');
    P(4, -4, 9, 2, '#2a2a2a'); P(12, -4, 1, 2, '#a0d0f0');
  },
  couteau: (P) => { P(0, -1, 5, 3, '#3a2414'); P(5, -2, 1, 5, '#c0a040'); P(6, -1, 9, 3, '#c8d0d8'); P(6, -1, 9, 1, '#ffffff'); P(15, 0, 1, 1, '#c8d0d8'); },
  arc: (P) => {
    for (let k = -10; k <= 10; k++) { const x = Math.round(6 - (k * k) / 24); P(x, k, 2, 1, Math.abs(k) < 3 ? '#5a3818' : '#8a5a30'); }
    P(1, -10, 1, 21, '#e8e0d0'); P(1, 0, 16, 1, '#c8a070'); P(16, -1, 2, 3, '#d0d8e0'); P(1, -1, 2, 1, '#e8e0d0'); P(1, 1, 2, 1, '#e8e0d0');
  },
  forgeron: (P) => { P(0, -1, 12, 2, '#8a5a30'); P(0, -1, 12, 1, '#a87040'); P(11, -6, 7, 12, '#5a5a62'); P(11, -6, 7, 1, '#a0a0a8'); P(11, -6, 1, 12, '#7a7a82'); P(17, -6, 1, 12, '#3a3a40'); },
  docteur: (P) => { P(1, -4, 7, 8, '#8a50c0'); P(2, -3, 1, 6, '#c890f0'); P(2, 0, 5, 2, '#f0e8d8'); P(3, -6, 3, 2, '#e8e0d0'); P(3, -7, 3, 1, '#8a5a30'); },
  gatling: (P) => {
    P(-5, -1, 6, 6, '#6a4428'); P(-5, -1, 6, 1, '#8a5c38'); P(1, -3, 6, 8, '#4a4a52'); P(1, -3, 6, 1, '#8a8a92');
    for (let k = 0; k < 3; k++) { P(7, -3 + k * 2, 13, 1, '#3a3a40'); P(7, -2 + k * 2, 13, 1, '#8a8a92'); }
    P(20, -4, 2, 8, '#2a2a2a'); P(2, 5, 6, 3, '#c0a040');
  },
};

function weaponBase(kit) {
  return cached(`wbase|${kit}`, () => {
    const c = S.makeCanvas(44, 32, true);
    const g = c.getContext('2d');
    WEAPON_DRAW[kit]((x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x + 10, y + 16, w, h); });
    c.px = 10; c.py = 16;
    return c;
  });
}

// L'arme tournée de l'angle a (32 crans, plus proche voisin : les pixels restent nets), retournée si elle vise à gauche
export function weaponSprite(kit, a) {
  const steps = 32;
  const k = ((Math.round((a / (Math.PI * 2)) * steps) % steps) + steps) % steps;
  return cached(`w|${kit}|${k}`, () => {
    const src = weaponBase(kit);
    const sg = src.getContext('2d').getImageData(0, 0, src.width, src.height).data;
    const ang = (k / steps) * Math.PI * 2;
    const flip = Math.cos(ang) < 0; // vers la gauche : l'arme n'est pas à l'envers
    const D = 60, c = S.makeCanvas(D, D, true), g = c.getContext('2d');
    const img = g.createImageData(D, D);
    const ca = Math.cos(-ang), sa = Math.sin(-ang);
    for (let y = 0; y < D; y++) for (let x = 0; x < D; x++) {
      const dx = x - D / 2 + 0.5, dy = y - D / 2 + 0.5;
      const sx = Math.round(dx * ca - dy * sa + src.px - 0.5);
      let sy = dx * sa + dy * ca;
      if (flip) sy = -sy;
      sy = Math.round(sy + src.py - 0.5);
      if (sx < 0 || sy < 0 || sx >= src.width || sy >= src.height) continue;
      const i = (sy * src.width + sx) * 4, o = (y * D + x) * 4;
      if (!sg[i + 3]) continue;
      img.data[o] = sg[i]; img.data[o + 1] = sg[i + 1]; img.data[o + 2] = sg[i + 2]; img.data[o + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    outline(c);
    c.ox = D / 2 / Q;
    c.oy = D / 2 / Q;
    return c;
  });
}

// ------------------------------------------------------------ icônes (objets, gemmes, fioles, kits)
const ICONS = {
  whisky: ['  aa  ', '  bb  ', ' cccc ', ' cddc ', ' cddc ', ' cccc '],
  etoile: ['   y   ', '  yyy  ', 'yyyYyyy', ' yyYyy ', ' yy yy ', 'yy   yy'],
  eperons: ['   s   ', '  sSs  ', 's sSs s', ' sSSSs ', '  sss  ', ' bbbbb '],
  longuevue: ['       ', 'b      ', 'bbbb   ', ' sSSSb ', '  SSSSb', '     bb'],
  piege: ['s s s s', 'SSSSSSS', 's     s', 'S  o  S', 's     s', 'SSSSSSS'],
  fumigene: ['  gg   ', ' gGGg  ', 'gGGGGg ', ' gGGg  ', '  kk   ', ' kkkk  '],
  cartouches: ['r r r r', 'R R R R', 'R R R R', 'bbbbbbb', 'BBBBBBB', '       '],
  sacs: ['  tt   ', ' tTTt  ', ' tttt  ', 'tt  tt ', 'TTttTT ', 'tttttt '],
  gem: ['  c  ', ' cCc ', 'cCWCc', ' cCc ', '  c  '],
  vial: [' bb ', ' kk ', 'gGGg', 'gGWg', 'gGGg', ' gg '],
  skull: [' www ', 'wWwWw', 'wwwww', ' w w '],
  star: ['  y  ', 'yyyyy', ' yyy ', 'y   y'],
};
const ICON_PAL = {
  a: '#8a5a30', b: '#5a3818', c: '#b8702a', d: '#e8a040', y: '#f8d070', Y: '#ffffff', s: '#c8c8d0', S: '#8a8a92', o: '#c83828',
  g: '#9a9aa2', G: '#d8d8e0', k: '#3a3a40', r: '#c83828', R: '#e0b040', B: '#8a5a30', t: '#c8b078', T: '#9a8450',
  C: '#40c0e0', W: '#ffffff', w: '#f0e8d8',
};
export function icon(id, scale = 1, pal = null) {
  return cached(`icon|${id}|${scale}|${pal ? JSON.stringify(pal) : ''}`, () => {
    const rows = ICONS[id];
    const wd = Math.max(...rows.map((r) => r.length));
    const c = S.makeCanvas(wd * scale + 2, rows.length * scale + 2, true);
    const g = c.getContext('2d');
    const P = { ...ICON_PAL, ...(pal || {}) };
    rows.forEach((row, y) => { for (let x = 0; x < row.length; x++) { const col = P[row[x]]; if (col) { g.fillStyle = col; g.fillRect(1 + x * scale, 1 + y * scale, scale, scale); } } });
    // contour
    const img = g.getImageData(0, 0, c.width, c.height), d = img.data, out = new Uint8ClampedArray(d);
    for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
      const i = (y * c.width + x) * 4;
      if (d[i + 3]) continue;
      if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => { const X = x + dx, Y = y + dy; return X >= 0 && Y >= 0 && X < c.width && Y < c.height && d[(Y * c.width + X) * 4 + 3]; })) {
        out[i] = 26; out[i + 1] = 15; out[i + 2] = 10; out[i + 3] = 255;
      }
    }
    img.data.set(out);
    g.putImageData(img, 0, 0);
    return c;
  });
}
export const gemIcon = (purple) => icon('gem', 1, purple ? { c: '#a070e0', C: '#e0c8ff' } : null);

// Tourelle de la Gatling (couleur de l'équipe sur le trépied)
export function turretSprite(col, a) {
  const base = cached(`turret|${col}`, () => qSprite(20, 20, 10, 16, (R) => {
    R(-7, -2, 3, 2, '#5a3818'); R(4, -2, 3, 2, '#5a3818'); R(-5, -5, 2, 4, '#6a4428'); R(3, -5, 2, 4, '#6a4428'); R(-1, -6, 2, 6, '#6a4428');
    R(-5, -9, 10, 4, col); R(-5, -9, 10, 1, S.shade(col, 0.3));
  }));
  return { base, gun: weaponSprite('gatling', a) };
}

// Couleur d'un kit (cartes du choix, interface)
export const kitColor = (kit) => KITS[kit]?.col || '#f8d070';
