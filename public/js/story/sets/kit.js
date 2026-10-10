// Outils communs des décors du mode histoire (story/sets/*.js) : rectangles cernés, planches, bâtiments, mesas,
// flammes, fumée, halos… Chaque décor est dans son fichier ; story/sets.js les réunit.
import * as S from '../../sprites.js';
import { canvasText } from '../../scene.js';
import { W, H } from '../../worlds.js';
import { skyDeco, haloSprite } from '../../env.js';

export const OUT = S.OUT;
export const R = (g, x, y, w, h, col) => { g.fillStyle = col; g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };
// rectangles cernés d'un contour sombre, relatifs à (x, y)
export function O(g, x, y, rects) {
  for (const [dx, dy, w, h] of rects) R(g, x + dx - 1, y + dy - 1, w + 2, h + 2, OUT);
  for (const [dx, dy, w, h, col] of rects) R(g, x + dx, y + dy, w, h, col);
}
export const rnd = (seed) => { let s = seed; return () => ((s = (s * 9301 + 49297) % 233280) / 233280); };
export const hash = (n) => {
  let t = (n * 0x6d2b79f5) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

// Bandes de couleur tramées (ciel, sol)
export function bands(g, x0, y0, w, h, cols) {
  const n = cols.length;
  for (let i = 0; i < n; i++) {
    const ya = y0 + Math.round((i * h) / n), yb = y0 + Math.round(((i + 1) * h) / n);
    R(g, x0, ya, w, yb - ya, cols[i]);
    if (i) {
      g.fillStyle = cols[i - 1];
      for (let x = x0; x < x0 + w; x += 2) g.fillRect(x, ya, 1, 1);
      for (let x = x0 + 1; x < x0 + w; x += 4) g.fillRect(x, ya + 1, 1, 1);
    }
  }
}
// Planches horizontales (bardage)
export function clap(g, x, y, w, h, col) {
  R(g, x, y, w, h, col);
  const d = S.shade(col, -0.22), l = S.shade(col, 0.1);
  for (let yy = y + 5; yy < y + h; yy += 5) { R(g, x, yy, w, 1, d); R(g, x, yy + 1, w, 1, l); }
  const r = rnd(Math.round(x * 7 + y));
  for (let i = 0; i < (w * h) / 60; i++) R(g, x + Math.floor(r() * w), y + Math.floor(r() * h), 2, 1, d);
}
// Planches verticales
export function boards(g, x, y, w, h, col, bw = 6) {
  R(g, x, y, w, h, col);
  const d = S.shade(col, -0.25), l = S.shade(col, 0.12);
  for (let xx = x; xx < x + w; xx += bw) { R(g, xx, y, 1, h, d); R(g, xx + 1, y, 1, h, l); }
}
// Silhouette de mesa (sommet plat, flancs en escalier) : base, largeur, hauteur
export function mesa(g, x, base, w, h, col, lit = null, seed = 1) {
  const r = rnd(seed * 31 + 7);
  const top = base - h;
  for (let i = 0; i < w; i++) {
    const edge = Math.min(i, w - 1 - i);
    let yy = top + Math.round(r() * 1.4);
    if (edge < 10) yy = top + (10 - edge) * 3 + Math.round(r() * 2);
    R(g, x + i, yy, 1, base - yy, col);
    if (lit && i < w * 0.35) R(g, x + i, yy, 1, base - yy, lit);
  }
  // strates
  const d = S.shade(col, -0.18);
  for (let yy = top + 6; yy < base - 2; yy += 5 + Math.floor(r() * 4)) R(g, x + 8, yy, w - 16, 1, d);
}
export function cactus(g, x, base, h) {
  const gr = '#4a7a3a', gd = '#2e5228', gl = '#6a9a4a';
  O(g, x, base, [[0, -h, 5, h, gr]]);
  const a = Math.round(h * 0.45), b = Math.round(h * 0.6);
  O(g, x, base, [[-6, -a, 6, 3, gr], [-6, -a - 10, 3, 10, gr], [5, -b, 6, 3, gr], [8, -b - 8, 3, 8, gr]]);
  R(g, x + 1, base - h, 1, h, gl); R(g, x + 4, base - h, 1, h, gd);
  R(g, x - 5, base - a - 10, 1, 10, gl); R(g, x + 9, base - b - 8, 1, 8, gl);
}
export function rock(g, x, base, w, h, col = '#8a7a6a') {
  const d = S.shade(col, -0.3), l = S.shade(col, 0.2);
  O(g, x, base, [[0, -h, w, h, col], [2, -h - 2, w - 5, 2, col]]);
  R(g, x + 2, base - h - 2, w - 6, 1, l); R(g, x + 1, base - h, 3, h - 2, l);
  R(g, x + w - 4, base - h + 1, 4, h - 1, d);
}
export function woodCross(g, x, base, h, col = '#7a5232') {
  const w = Math.max(3, Math.round(h / 7));
  O(g, x, base, [[-Math.floor(w / 2), -h, w, h, col], [-Math.round(h / 3), -h + Math.round(h / 4), Math.round(h / 1.5), w, col]]);
  R(g, x - Math.floor(w / 2), base - h, 1, h, S.shade(col, 0.2));
}
export function tombstone(g, x, base, w, h, col = '#9a968c') {
  for (let dy = 0; dy < h; dy++) {
    const yy = base - h + dy;
    const half = dy < w / 2 ? Math.round(Math.sqrt((w / 2) ** 2 - (w / 2 - dy) ** 2)) : Math.round(w / 2);
    R(g, x - half - 1, yy - 1, half * 2 + 2, 2, OUT);
  }
  for (let dy = 0; dy < h; dy++) {
    const yy = base - h + dy;
    const half = dy < w / 2 ? Math.round(Math.sqrt((w / 2) ** 2 - (w / 2 - dy) ** 2)) : Math.round(w / 2);
    R(g, x - half, yy, half * 2, 1, dy < 2 ? S.shade(col, 0.2) : col);
  }
  R(g, x - 2, base - h + 4, 4, 1, S.shade(col, -0.35)); R(g, x - 3, base - h + 7, 6, 1, S.shade(col, -0.35));
}
export function sign(g, x, y, text, { bg = '#eadcb0', fg = '#4a2a14', pad = 4 } = {}) {
  const w = Math.max(20, text.length * 6 + pad * 2);
  O(g, x - Math.round(w / 2), y, [[0, 0, w, 11, bg]]);
  R(g, x - Math.round(w / 2), y + 10, w, 1, S.shade(bg, -0.25));
  canvasText(g, text, x, y + 2, { color: fg, shadow: '' });
  return w;
}
export function windowPane(g, x, y, w, h, frame = '#e8dcc0') {
  O(g, x, y, [[0, 0, w, h, frame]]);
  R(g, x + 1, y + 1, w - 2, h - 2, '#2a3440');
  R(g, x + Math.floor(w / 2), y + 1, 1, h - 2, frame);
  R(g, x + 1, y + Math.floor(h / 2), w - 2, 1, frame);
  R(g, x + 2, y + 2, 2, 1, '#6a7a88');
}
export function barrel(g, x, base) {
  O(g, x, base, [[0, -14, 12, 14, '#8a5228']]);
  R(g, x, base - 11, 12, 1, '#5a5a62'); R(g, x, base - 4, 12, 1, '#5a5a62');
  R(g, x + 2, base - 14, 2, 14, '#a8703c');
}
export function crate(g, x, base, s = 12, label = '') {
  O(g, x, base, [[0, -s, s, s, '#a8783c']]);
  R(g, x, base - s, s, 1, '#c8985a');
  for (let k = 0; k < s; k++) R(g, x + k, base - s + k, 1, 1, '#7a5228');
  if (label) { R(g, x + 1, base - s + 3, s - 2, 5, '#a8302a'); canvasText(g, label, x + s / 2, base - s + 3, { color: '#fdf6e0', shadow: '' }); }
}
export function lantern(g, x, y) {
  O(g, x, y, [[-2, 0, 5, 2, '#5a5a62'], [-2, 2, 5, 5, '#f8d070'], [-2, 7, 5, 1, '#5a5a62']]);
  R(g, x - 1, y + 3, 3, 3, '#fff4c0');
}
// Puits de flammes animé (feu) : base (x, y), largeur w, hauteur h
export function flames(ctx, x, y, w, h, t, seed = 0) {
  for (let i = 0; i < w; i += 2) {
    const k = hash(i + seed * 101);
    const fh = h * (0.45 + 0.55 * Math.abs(Math.sin(t / (90 + k * 60) + k * 9))) * (1 - Math.abs(i / w - 0.5));
    const hh = Math.round(fh);
    if (hh < 2) continue;
    R(ctx, x + i, y - hh, 2, hh, '#e8501c');
    R(ctx, x + i, y - Math.round(hh * 0.66), 2, Math.round(hh * 0.66), '#f89a2a');
    R(ctx, x + i, y - Math.round(hh * 0.33), 2, Math.round(hh * 0.33), '#fde870');
  }
}
// Fumée qui monte en volutes : source (x, y)
export function smoke(ctx, x, y, t, { n = 10, life = 3000, rise = 0.035, drift = 0.012, r0 = 3, grow = 0.006, col = '60,52,50', a = 0.55 } = {}) {
  for (let i = 0; i < n; i++) {
    const age = (t + (i * life) / n) % life;
    const k = age / life;
    const px = x + age * drift + Math.sin(age / 400 + i) * 3, py = y - age * rise;
    S.disc(ctx, Math.round(px), Math.round(py), Math.round(r0 + age * grow), `rgba(${col},${(a * (1 - k)).toFixed(2)})`);
  }
}
// Petit train lointain sur les rails (y : le rail) : la locomotive vers la droite en x, deux voitures derrière ;
// running : la bielle tourne et la cheminée crache, sinon un filet de vapeur
export function train(ctx, x, y, t, running) {
  for (const [cx, col] of [[x - 96, '#6a3a26'], [x - 50, '#7a4a2c']]) { // les voitures
    O(ctx, cx, y, [[0, -16, 42, 12, col], [-1, -18, 44, 2, '#3a2a22']]);
    for (let k = 0; k < 4; k++) R(ctx, cx + 4 + k * 10, y - 13, 5, 4, '#e8c070');
    for (const wx of [cx + 6, cx + 34]) { S.disc(ctx, wx, y - 2, 2, OUT); R(ctx, wx, y - 2, 1, 1, '#8a8f98'); }
  }
  // la locomotive : tender, cabine, chaudière, cheminée évasée, chasse-buffles
  O(ctx, x, y, [[0, -14, 10, 10, '#2a2a30'], [8, -22, 12, 18, '#3a3a42'], [20, -15, 20, 9, '#2a2a30'], [32, -24, 5, 9, '#2a2a30'], [30, -26, 9, 2, '#2a2a30'], [24, -18, 4, 3, '#c8a040']]);
  R(ctx, x + 10, y - 20, 6, 4, '#f0c060'); // la lueur de la cabine
  R(ctx, x + 20, y - 15, 20, 1, '#5a5a62');
  for (let k = 0; k < 5; k++) R(ctx, x + 40 + Math.floor(k / 2), y - 8 + k, 1, 1, '#8a8f98');
  const ph = running ? Math.floor(t / 90) % 2 : 0;
  for (const [wx, r] of [[x + 14, 4], [x + 26, 3], [x + 34, 3]]) { S.disc(ctx, wx, y - 3, r, OUT); S.disc(ctx, wx, y - 3, r - 1, '#5a1a14'); }
  R(ctx, x + 12, y - 4 + ph, 24, 1, '#b8bec6'); // la bielle
  // fumée de la cheminée
  smoke(ctx, x + 34, y - 28, t, running ? { n: 9, life: 2200, rise: 0.02, drift: -0.025, r0: 2, grow: 0.004, col: '220,214,206', a: 0.6 } : { n: 4, life: 3000, rise: 0.012, drift: -0.003, r0: 1, grow: 0.002, col: '230,226,220', a: 0.4 });
}

// Halo additif (après la teinte)
// Halo doux : huit disques concentriques (sprite mis en cache par rayon et couleur) ; a module l'intensité
// par globalAlpha, sans créer de nouveau sprite à chaque image.
export const RINGS = [[1, 0.025], [0.88, 0.03], [0.76, 0.035], [0.64, 0.04], [0.52, 0.05], [0.4, 0.06], [0.28, 0.07], [0.16, 0.09]];
export function halo(ctx, x, y, r, col, a = 1) {
  const h = haloSprite(RINGS.map(([k, aa]) => [Math.max(1, Math.round(r * k)), aa]), col);
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = Math.max(0, Math.min(1, a * 0.85));
  ctx.drawImage(h, Math.round(x) - h.r, Math.round(y) - h.r);
  if (a > 1.18) ctx.drawImage(h, Math.round(x) - h.r, Math.round(y) - h.r); // (rarement : un second passage)
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}
// Petite croix gravée qui scintille (les trois croix de la légende)
export function legendCross(ctx, x, y, t) {
  woodCross(ctx, x, y, 22, '#8a6038');
  R(ctx, x - 1, y - 18, 2, 1, '#f8d070'); R(ctx, x - 5, y - 15, 2, 1, '#f8d070'); R(ctx, x + 3, y - 15, 2, 1, '#f8d070'); R(ctx, x - 1, y - 11, 2, 1, '#f8d070');
  const k = Math.floor(t / 120) % 8;
  const sp = [[-6, -20], [5, -22], [7, -12], [-7, -9]][k % 4];
  if (k < 4) { R(ctx, x + sp[0] - 1, y + sp[1], 3, 1, '#fffbe0'); R(ctx, x + sp[0], y + sp[1] - 1, 1, 3, '#fffbe0'); }
}

// ---------------------------------------------------------------- façades de Dusty Gulch
export function building(g, b, base) {
  const { x, w, h, col, label, kind } = b;
  const top = base - h;
  // fausse façade : corniche, bardage
  R(g, x - 1, top - 1, w + 2, h + 1, OUT);
  clap(g, x, top, w, h, col);
  const dk = S.shade(col, -0.35), lt = S.shade(col, 0.2);
  R(g, x - 3, top - 1, w + 6, 5, OUT); R(g, x - 2, top, w + 4, 3, dk); R(g, x - 2, top, w + 4, 1, lt);
  if (kind === 'saloon' || kind === 'hotel') { // fronton en escalier
    O(g, x + w / 2 - 20, top - 8, [[0, 0, 40, 8, col]]);
    O(g, x + w / 2 - 10, top - 13, [[0, 0, 20, 5, col]]);
  }
  // auvent sur poteaux
  const aw = base - 46;
  if (kind === 'saloon' || kind === 'hotel') {
    // balcon à l'étage
    R(g, x - 4, aw - 1, w + 8, 6, OUT); R(g, x - 3, aw, w + 6, 4, dk); R(g, x - 3, aw, w + 6, 1, lt);
    R(g, x - 3, aw - 10, w + 6, 1, OUT); R(g, x - 3, aw - 9, w + 6, 1, lt);
    for (let px = x - 2; px < x + w + 3; px += 4) R(g, px, aw - 8, 1, 8, dk);
  } else {
    for (let k = 0; k < 6; k++) R(g, x - 4 + k, aw + k - 6, w + 8 - k * 2, 1, k ? S.shade(col, -0.45) : OUT);
    R(g, x - 4, aw, w + 8, 1, OUT);
  }
  for (const px of [x - 2, x + w - 1, ...(w > 110 ? [x + Math.round(w / 2)] : [])]) O(g, px, aw + 4, [[0, 0, 3, base - aw - 4, lt]]);
  // fenêtres de l'étage
  const nwin = w > 120 ? 3 : 2;
  const wins = [];
  for (let k = 0; k < nwin; k++) {
    const wx = Math.round(x + ((k + 0.5) * w) / nwin - 7), wy = top + 18;
    if (wy + 16 > aw - 10) continue;
    windowPane(g, wx, wy, 14, 16);
    R(g, wx - 3, wy - 1, 2, 18, dk); R(g, wx + 15, wy - 1, 2, 18, dk); // volets
    wins.push([wx + 1, wy + 1, 12, 14]);
  }
  // enseigne
  if (label) sign(g, x + w / 2, top + 5, label, kind === 'saloon' ? { bg: '#9a2a1c', fg: '#f8d070' } : kind === 'sheriff' ? { bg: '#2a2622', fg: '#f8d070' } : {});
  // rez-de-chaussée : porte et vitrines
  const dx = Math.round(x + w / 2 - 8);
  if (kind === 'saloon') {
    R(g, dx - 4, base - 30, 24, 30, OUT); R(g, dx - 3, base - 29, 22, 29, '#1e120c');
    R(g, dx - 3, base - 22, 10, 12, OUT); R(g, dx + 9, base - 22, 10, 12, OUT); // portes battantes
    R(g, dx - 2, base - 21, 8, 10, '#a8703c'); R(g, dx + 10, base - 21, 8, 10, '#a8703c');
    for (let k = 0; k < 4; k++) { R(g, dx - 1 + k * 2, base - 20, 1, 8, '#7a4a24'); R(g, dx + 11 + k * 2, base - 20, 1, 8, '#7a4a24'); }
    wins.push([dx - 2, base - 28, 20, 6]);
  } else {
    R(g, dx - 1, base - 27, 18, 27, OUT); R(g, dx, base - 26, 16, 26, '#4a2a14');
    R(g, dx + 2, base - 24, 12, 8, '#2a3440'); R(g, dx + 13, base - 13, 2, 2, '#e0b040');
    wins.push([dx + 2, base - 24, 12, 8]);
  }
  for (const sx of [x + 8, x + w - 34]) {
    if (sx > dx - 30 && sx < dx + 20) continue;
    if (kind === 'sheriff') { windowPane(g, sx, base - 32, 22, 18, '#5a5a62'); for (let k = 3; k < 22; k += 4) R(g, sx + k, base - 32, 1, 18, '#3a3a42'); }
    else windowPane(g, sx, base - 34, 26, 20);
    wins.push([sx + 1, base - 33, kind === 'sheriff' ? 20 : 24, 18]);
  }
  if (kind === 'sheriff') { // étoile
    const sx = x + w / 2, sy = top + 22;
    for (const [ax, ay, aw2, ah] of [[-1, -5, 3, 11], [-5, -1, 11, 3], [-3, -3, 7, 7]]) R(g, sx + ax, sy + ay, aw2, ah, '#e0b040');
    R(g, sx, sy, 1, 1, '#a06a20');
  }
  if (kind === 'bank') { for (const cx of [x + 4, x + w - 8]) { R(g, cx, top + 8, 4, h - 8, '#c8b8a0'); R(g, cx, top + 8, 1, h - 8, '#e8dcc8'); } }
  return wins;
}

// lanternes accrochées sous les auvents
export const LAMPS = [[8, 118], [114, 118], [234, 118], [368, 118], [494, 118], [666, 118], [752, 118]];
export const GULCH = [
  { x: 6, w: 112, h: 112, col: '#8a5a38', label: 'HÔTEL', kind: 'hotel' },
  { x: 128, w: 92, h: 92, col: '#9a8a78', label: 'BANQUE', kind: 'bank' },
  { x: 232, w: 140, h: 124, col: '#7a4a30', label: 'BUCKSHOT SALOON', kind: 'saloon' },
  { x: 384, w: 96, h: 86, col: '#a87a4a', label: 'SHÉRIF', kind: 'sheriff' },
  { x: 492, w: 104, h: 98, col: '#8a6a48', label: 'ÉPICERIE', kind: 'store' },
  { x: 664, w: 92, h: 90, col: '#6e5a48', label: 'POSTE', kind: 'store' },
  { x: 766, w: 90, h: 104, col: '#946040', label: 'BARBIER', kind: 'hotel' },
];

// Dusty Gulch vue du quai de la gare : [x, largeur, hauteur, couleur, genre] (base : y 147)
export const QUAI_TOWN = [
  [288, 30, 28, '#5e4230'], [320, 26, 36, '#6a4a34'], [348, 44, 46, '#6e4630', 'saloon'], [394, 28, 30, '#74503a'],
  [424, 18, 42, '#5a3a24', 'eau'], [446, 36, 38, '#6a4632'], [484, 30, 32, '#5e4a3a'], [516, 30, 32, '#665040', 'eglise'],
];
// Les feux de la ville (fx 'brasier') : [x, y (pied des flammes), largeur, hauteur, retard, graine]
export const QUAI_FIRES = [[350, 103, 40, 28, 0, 1], [290, 121, 26, 16, 400, 2], [322, 113, 22, 20, 900, 3], [396, 119, 26, 16, 200, 4], [448, 111, 32, 22, 700, 5], [486, 117, 26, 14, 1300, 6]];

// Mesas lointaines (calque en parallaxe)
export function farMesas(g, w, horizon, cols = ['#b07a62', '#9a6450'], seed = 3) {
  const r = rnd(seed);
  for (let x = -20; x < w; x += 60 + Math.floor(r() * 90)) {
    mesa(g, x, horizon, 50 + Math.floor(r() * 90), 10 + Math.floor(r() * 26), cols[Math.floor(r() * cols.length)], null, Math.floor(r() * 99));
  }
}
export const PIT = [326, 530]; // bords du gouffre de la Bouche de l'Enfer
