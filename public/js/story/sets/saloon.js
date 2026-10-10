// Le saloon, côté salle (le Buckshot à Dusty Gulch, le Dernier Verre à Red Rock : rien n'y porte de nom).
// D'après les photos du Long Branch (Dodge City) et du Bird Cage (Tombstone) : arrière-bar sculpté et son grand
// miroir entre deux étagères de bouteilles, comptoir à panneaux avec repose-pied de laiton et crachoirs, papier peint
// au-dessus des lambris, lampes à pétrole suspendues, porte battante sur la rue, escalier vers la galerie des
// chambres, piano droit sous la galerie, tables de jeu. Le comptoir et la table de devant sont des accessoires
// (triés en profondeur avec les acteurs) ; tout le reste est dessiné une fois.
import * as S from '../../sprites.js';
import { W } from '../../worlds.js';
import { canvasText } from '../../scene.js';
import { OUT, R, rnd, hash, shadow, box } from './kit-ville.js';
import { halo } from './kit.js';

const sh = S.shade;
const FLOOR = 140; // pied du mur du fond
const WOOD = '#5a3420', WOOD_D = '#3a2010', WOOD_L = '#8a5a34', BRASS = '#d8a840', BRASS_L = '#f8d880';
const PAPER = '#6a2a24';
const LAMPS = [[40, 36], [136, 36], [262, 44]]; // les lampes suspendues (le verre)

// Papier peint damassé, rayures et motifs dorés passés
function wallpaper(g, x, y, w, h) {
  R(g, x, y, w, h, PAPER);
  for (let xx = x; xx < x + w; xx += 12) { R(g, xx, y, 1, h, sh(PAPER, -0.18)); R(g, xx + 6, y, 1, h, sh(PAPER, 0.08)); }
  for (let yy = y + 4, row = 0; yy < y + h - 3; yy += 10, row++) for (let xx = x + 3 + (row % 2) * 6; xx < x + w - 3; xx += 12) {
    R(g, xx, yy, 1, 3, '#8a4a30'); R(g, xx - 1, yy + 1, 3, 1, '#8a4a30'); R(g, xx, yy + 1, 1, 1, '#a8683a');
  }
}
// Lambris à panneaux sous la cimaise
function wainscot(g, x, y, w, h) {
  R(g, x, y, w, h, WOOD);
  R(g, x, y, w, 3, WOOD_L); R(g, x, y + 3, w, 1, WOOD_D); R(g, x, y, w, 1, sh(WOOD_L, 0.2)); // la cimaise
  for (let px = x + 3; px < x + w - 10; px += 16) {
    R(g, px, y + 7, 12, h - 12, sh(WOOD, -0.12));
    R(g, px, y + 7, 12, 1, WOOD_D); R(g, px, y + 7, 1, h - 12, WOOD_D);
    R(g, px, y + h - 6, 12, 1, sh(WOOD, 0.2)); R(g, px + 11, y + 7, 1, h - 12, sh(WOOD, 0.15));
  }
  R(g, x, y + h - 3, w, 3, WOOD_D); // la plinthe
}
// Une bouteille (hauteur h) : verre, étiquette, goulot
function bottle(g, x, base, h, col, label) {
  R(g, x - 1, base - h - 1, 5, h + 1, OUT);
  R(g, x, base - h + 4, 3, h - 4, col); R(g, x + 1, base - h, 1, 4, col);
  R(g, x, base - h + 4, 1, h - 5, sh(col, 0.35));
  if (label) R(g, x, base - Math.round(h * 0.5), 3, 3, label);
}
// Étagère de bouteilles (x, y : la planche) sur w px
function shelf(g, x, y, w, seed) {
  const r = rnd(seed);
  const cols = ['#3a6a2a', '#7a3a1a', '#a8702a', '#2a4a3a', '#6a2a3a', '#c8b070', '#4a2a1a'];
  for (let bx = x + 1; bx < x + w - 4; bx += 5) {
    if (r() < 0.12) continue;
    bottle(g, bx, y, 9 + Math.floor(r() * 5), cols[Math.floor(r() * cols.length)], r() < 0.7 ? ['#e8dcc0', '#c8a050', '#d84a2a'][Math.floor(r() * 3)] : null);
  }
  R(g, x - 1, y, w + 2, 3, OUT); R(g, x, y, w, 2, WOOD_L); R(g, x, y, w, 1, sh(WOOD_L, 0.25));
}
// L'arrière-bar : grand miroir encadré, étagères de bouteilles, fronton sculpté, trophée de longhorn
function backBar(g) {
  const x0 = 6, x1 = 170, top = 48;
  // le meuble
  R(g, x0 - 1, top - 1, x1 - x0 + 2, FLOOR - top + 1, OUT);
  R(g, x0, top, x1 - x0, FLOOR - top, WOOD_D);
  // fronton : corniche et ornement central
  R(g, x0 - 4, top - 6, x1 - x0 + 8, 7, OUT); R(g, x0 - 3, top - 5, x1 - x0 + 6, 5, WOOD); R(g, x0 - 3, top - 5, x1 - x0 + 6, 1, WOOD_L);
  for (let px = x0; px < x1; px += 8) R(g, px, top - 1, 4, 2, WOOD_L);
  const cx = (x0 + x1) / 2;
  for (let k = 0; k < 7; k++) { R(g, cx - 20 + k * 2 - 1, top - 7 - k, 40 - k * 4 + 2, 2, OUT); R(g, cx - 20 + k * 2, top - 6 - k, 40 - k * 4, 1, k % 2 ? WOOD : WOOD_L); }
  S.disc(g, cx, top - 13, 3, OUT); S.disc(g, cx, top - 13, 2, BRASS);
  // le miroir (reflets de la salle : lueurs, silhouettes floues)
  const mx = 44, my = top + 8, mw = 88, mh = 50;
  R(g, mx - 4, my - 4, mw + 8, mh + 8, OUT); R(g, mx - 3, my - 3, mw + 6, mh + 6, '#a87a3a'); R(g, mx - 3, my - 3, mw + 6, 1, BRASS_L); R(g, mx - 2, my - 2, mw + 4, mh + 4, OUT);
  R(g, mx, my, mw, mh, '#3a3a48');
  for (let yy = 0; yy < mh; yy++) R(g, mx, my + yy, mw, 1, S.mix('#5a5a6a', '#2e2a36', yy / mh));
  R(g, mx, my + mh - 14, mw, 14, '#3a2a26'); R(g, mx, my + mh - 14, mw, 1, '#5a4434'); // le comptoir reflété
  for (const [lx, ly] of [[18, 10], [70, 8]]) { S.disc(g, mx + lx, my + ly, 4, '#8a7a5a'); S.disc(g, mx + lx, my + ly, 2, '#d8c088'); } // les lampes reflétées
  for (let k = 0; k < mw + mh; k += 22) for (let j = 0; j < mh; j++) { const px = mx + k - j; if (px >= mx && px < mx + mw) R(g, px, my + j, 2, 1, 'rgba(220,220,240,0.10)'); } // reflets en biais
  // les étagères de part et d'autre, et sous le miroir
  for (const [sx, sw] of [[x0 + 4, 30], [x1 - 34, 30]]) {
    R(g, sx - 1, top + 4, sw + 2, 66, '#2a1608');
    for (let k = 0; k < 4; k++) shelf(g, sx, top + 20 + k * 16, sw, sx + k * 7);
  }
  shelf(g, mx, my + mh + 12, mw, 77);
  // pilastres tournés
  for (const px of [x0 + 36, x1 - 42]) { R(g, px - 1, top + 2, 6, FLOOR - top - 2, OUT); R(g, px, top + 2, 4, FLOOR - top - 2, WOOD); R(g, px, top + 2, 1, FLOOR - top - 2, WOOD_L); for (let yy = top + 6; yy < FLOOR - 4; yy += 10) R(g, px, yy, 4, 2, WOOD_L); }
  // le bas : tiroirs et portes
  R(g, x0, FLOOR - 26, x1 - x0, 2, WOOD_L);
  for (let px = x0 + 4; px < x1 - 18; px += 20) { R(g, px, FLOOR - 22, 16, 18, WOOD); R(g, px, FLOOR - 22, 16, 1, WOOD_L); R(g, px + 7, FLOOR - 14, 2, 2, BRASS); }
  // la caisse enregistreuse, en laiton, et une pile de verres
  box(g, 140, top + 82, 20, 12, BRASS); R(g, 141, top + 83, 18, 2, BRASS_L); R(g, 143, top + 86, 14, 4, '#2a2016'); R(g, 144, top + 87, 4, 2, '#f0e0b0');
  // le trophée de longhorn au-dessus du fronton
  const tx = cx, ty = top - 30;
  R(g, tx - 5, ty - 1, 11, 12, OUT); R(g, tx - 4, ty, 9, 10, '#e8dcc0'); R(g, tx - 2, ty + 3, 2, 2, OUT); R(g, tx + 1, ty + 3, 2, 2, OUT); R(g, tx - 1, ty + 7, 3, 2, '#b8a888');
  for (let k = 0; k < 24; k++) { const yy = ty + 2 - Math.round(Math.sin((k / 24) * Math.PI) * 5) + (k > 18 ? -(k - 18) : 0); R(g, tx + 5 + k, yy - 1, 1, 3, OUT); R(g, tx - 6 - k, yy - 1, 1, 3, OUT); }
  for (let k = 0; k < 24; k++) { const yy = ty + 2 - Math.round(Math.sin((k / 24) * Math.PI) * 5) + (k > 18 ? -(k - 18) : 0); R(g, tx + 5 + k, yy, 1, 1, '#e8dcc0'); R(g, tx - 6 - k, yy, 1, 1, '#e8dcc0'); }
}
// La porte battante sur la rue, la nuit
function streetDoor(g) {
  const x = 180, w = 44, top = 70;
  R(g, x - 4, top - 5, w + 8, FLOOR - top + 5, OUT); R(g, x - 3, top - 4, w + 6, FLOOR - top + 4, WOOD); R(g, x - 3, top - 4, w + 6, 1, WOOD_L);
  R(g, x, top, w, FLOOR - top, '#161a2c');
  for (let k = 0; k < 10; k++) R(g, x + 2 + Math.floor(hash(k) * (w - 4)), top + 2 + Math.floor(hash(k + 9) * 24), 1, 1, '#8a90b0');
  R(g, x, top + 30, w, 14, '#2a2234'); // les façades d'en face
  for (const [wx, ww] of [[x + 4, 6], [x + 24, 8]]) R(g, wx, top + 34, ww, 6, '#c89048');
  R(g, x, top + 44, w, FLOOR - top - 44, '#3a2a24'); // la rue
  for (const [bx, s] of [[x + 2, 1], [x + w / 2 + 1, -1]]) { // les battants
    R(g, bx - 1, top + 25, w / 2 - 1, 28, OUT); R(g, bx, top + 26, w / 2 - 3, 26, '#a8703c'); R(g, bx, top + 26, w / 2 - 3, 1, '#d09a58');
    for (let k = 2; k < w / 2 - 4; k += 3) R(g, bx + k, top + 30, 1, 18, '#7a4a24');
    R(g, bx + (s > 0 ? 0 : w / 2 - 4), top + 26, 1, 26, '#5a3418');
  }
}
// L'escalier vers la galerie : marches, limon à panneaux, rampe et balustres, pilastre de départ
function stairs(g) {
  const x0 = 230, n = 12, st = 6;
  for (let i = 0; i < n; i++) { // le limon plein sous les marches
    const sx = x0 + i * st, sy = FLOOR - (i + 1) * st;
    R(g, sx, sy, st, FLOOR - sy, WOOD);
    R(g, sx - 1, sy - 1, st + 2, 2, OUT); R(g, sx, sy, st + 1, 1, WOOD_L);
    R(g, sx + st - 1, sy, 1, st, sh(WOOD, -0.3));
  }
  for (let i = 2; i < n; i += 3) { const sx = x0 + i * st; R(g, sx - 6, FLOOR - (i - 1) * st + 4, 14, 10, sh(WOOD, -0.18)); R(g, sx - 6, FLOOR - (i - 1) * st + 4, 14, 1, WOOD_D); }
  // balustres et rampe
  for (let i = 0; i < n; i++) { const bx = x0 + i * st + 2, by = FLOOR - (i + 1) * st; R(g, bx, by - 16, 1, 16, WOOD_L); R(g, bx + 1, by - 16, 1, 16, OUT); }
  for (let k = 0; k < n * st; k++) { const yy = FLOOR - 22 - Math.round(k); R(g, x0 + k, yy - 1, 1, 4, OUT); R(g, x0 + k, yy, 1, 2, WOOD_L); }
  R(g, x0 - 4, FLOOR - 30, 7, 30, OUT); R(g, x0 - 3, FLOOR - 29, 5, 29, WOOD_L); R(g, x0 - 3, FLOOR - 29, 1, 29, sh(WOOD_L, 0.25));
  S.disc(g, x0, FLOOR - 32, 3, OUT); S.disc(g, x0, FLOOR - 32, 2, WOOD_L);
}
// La galerie des chambres (plancher y 66) sur son poteau, ses portes numérotées, sa balustrade
function gallery(g) {
  const x0 = 302, y = 66;
  shadow(g, x0, y + 6, W - x0, FLOOR - y - 6, 0.32); // l'ombre sous la galerie
  for (const [dx, n] of [[316, '3'], [350, '4']]) {
    R(g, dx - 3, 22, 24, y - 22, OUT); R(g, dx - 2, 23, 22, y - 23, WOOD_L); R(g, dx, 26, 18, y - 26, WOOD);
    R(g, dx + 2, 29, 14, 12, sh(WOOD, -0.15)); R(g, dx + 2, 44, 14, 14, sh(WOOD, -0.15)); R(g, dx + 14, 46, 2, 2, BRASS);
    canvasText(g, n, dx + 9, 18, { color: BRASS_L, shadow: '#2a1608' });
  }
  R(g, x0 - 1, y - 1, W - x0 + 2, 8, OUT); R(g, x0, y, W - x0, 6, WOOD); R(g, x0, y, W - x0, 1, WOOD_L); R(g, x0, y + 5, W - x0, 1, WOOD_D);
  R(g, x0 - 1, y - 16, W - x0 + 2, 4, OUT); R(g, x0, y - 15, W - x0, 2, WOOD_L);
  for (let px = x0 + 2; px < W; px += 4) { R(g, px, y - 12, 2, 12, OUT); R(g, px, y - 12, 1, 12, WOOD_L); }
  R(g, x0 - 2, y - 18, 6, FLOOR - y + 18, OUT); R(g, x0 - 1, y - 17, 4, FLOOR - y + 17, WOOD_L); R(g, x0 - 1, y - 17, 1, FLOOR - y + 17, sh(WOOD_L, 0.25));
  // la lampe murale sous la galerie
  R(g, x0 + 4, y + 18, 4, 1, OUT); R(g, x0 + 7, y + 14, 5, 9, OUT); R(g, x0 + 8, y + 15, 3, 7, '#f8d070');
}
// Le piano droit sous la galerie, son tabouret, la partition et un chandelier
function piano(g) {
  const x = 314, top = 98, w = 52;
  R(g, x - 1, top - 1, w + 2, FLOOR - top + 1, OUT);
  R(g, x, top, w, FLOOR - top, '#2e1a12'); R(g, x, top, w, 1, '#5a3a2a'); R(g, x, top, 1, FLOOR - top, '#4a2e20');
  R(g, x + 4, top + 4, w - 8, 14, '#3a2418'); R(g, x + 6, top + 6, w - 12, 10, '#24140c');
  for (let k = 0; k < 4; k++) R(g, x + 9 + k * 10, top + 7, 6, 8, '#3a2418'); // la façade ajourée
  box(g, x + 18, top - 9, 14, 9, '#eadcb0'); for (let k = 0; k < 3; k++) R(g, x + 20, top - 7 + k * 3, 10, 1, '#5a4a3a'); // la partition
  R(g, x - 2, top + 21, w + 4, 2, OUT); R(g, x - 1, top + 22, w + 2, 6, '#f0e8d8'); // le clavier
  for (let k = 1; k < w; k += 3) R(g, x + k, top + 22, 1, 6, '#c8c0b0');
  for (let k = 2; k < w - 2; k += 7) { R(g, x + k, top + 22, 2, 3, '#1a1010'); R(g, x + k + 3, top + 22, 2, 3, '#1a1010'); }
  R(g, x, top + 28, w, 2, '#4a2e20');
  for (const px of [x + 3, x + w - 7]) { R(g, px, top + 30, 4, FLOOR - top - 30, '#3a2418'); R(g, px, FLOOR - 3, 5, 3, '#2a1610'); }
  R(g, x + 22, FLOOR - 6, 6, 2, BRASS); // les pédales
  // le chandelier sur le piano
  R(g, x + 6, top - 6, 2, 6, BRASS); R(g, x + 4, top - 1, 6, 1, BRASS); R(g, x + 6, top - 10, 2, 4, '#f0e8d8'); R(g, x + 6, top - 12, 2, 2, '#f8d070');
  // le tabouret
  box(g, x + 18, FLOOR + 2, 14, 3, '#5a3420'); box(g, x + 24, FLOOR + 5, 2, 9, '#3a2010'); R(g, x + 20, FLOOR + 14, 10, 1, '#3a2010');
}
// Une lampe à pétrole suspendue (le verre en x, y)
function hangingLamp(g, x, y) {
  R(g, x, 0, 1, y - 8, OUT);
  R(g, x - 9, y - 9, 19, 3, OUT); R(g, x - 8, y - 8, 17, 1, BRASS); // l'abat-jour
  for (let k = 0; k < 4; k++) R(g, x - 7 + k, y - 6 + k, 15 - k * 2, 1, k % 2 ? '#e8d8b0' : '#f0e4c4');
  R(g, x - 3, y - 2, 7, 7, OUT); R(g, x - 2, y - 1, 5, 5, '#f8e090'); R(g, x - 1, y, 3, 3, '#fffbe0');
  R(g, x - 4, y + 5, 9, 2, OUT); R(g, x - 3, y + 5, 7, 1, BRASS);
}
// Une petite table de jeu au fond, ses deux chaises, des cartes
function backTable(g, x) {
  const y = FLOOR + 10;
  for (const [cx, d] of [[x - 14, 1], [x + 26, -1]]) {
    R(g, cx - 1, y - 25, 3, 25, OUT); R(g, cx, y - 24, 1, 24, WOOD_L);
    R(g, cx + (d > 0 ? 0 : -8) - 1, y - 11, 11, 3, OUT); R(g, cx + (d > 0 ? 0 : -8), y - 10, 9, 1, WOOD_L);
    R(g, cx + (d > 0 ? 8 : -8), y - 9, 1, 9, OUT);
  }
  box(g, x - 6, y - 15, 30, 3, '#6a3e22'); R(g, x - 6, y - 15, 30, 1, '#9a6a3a');
  box(g, x + 7, y - 12, 4, 12, WOOD_D);
  R(g, x - 2, y - 16, 4, 1, '#f0e8d8'); R(g, x + 4, y - 16, 4, 1, '#f0e8d8'); R(g, x + 14, y - 17, 3, 2, '#c8a050');
}

export default {
  w: W, horizon: FLOOR, ground: 186, outdoor: false,
  back(g) {
    // le plafond à poutres
    R(g, 0, 0, W, 16, '#2a1810');
    for (let x = 0; x < W; x += 48) { R(g, x, 0, 10, 16, '#3a2216'); R(g, x, 0, 1, 16, '#5a3a24'); }
    R(g, 0, 14, W, 4, OUT); R(g, 0, 15, W, 2, '#4a2e1c');
    // les murs : papier peint, cimaise, lambris
    wallpaper(g, 0, 18, W, 82);
    wainscot(g, 0, 100, W, FLOOR - 100);
    // un tableau (la mesa au couchant) au-dessus de la porte
    box(g, 186, 30, 32, 24, '#a87a3a'); R(g, 188, 32, 28, 20, '#e0a060'); R(g, 188, 32, 28, 8, '#f0c888');
    R(g, 188, 44, 28, 8, '#7a4a3a'); R(g, 194, 40, 12, 4, '#8a5040'); R(g, 188, 50, 28, 2, '#5a3a2a');
    backBar(g);
    streetDoor(g);
    gallery(g);
    stairs(g);
    piano(g);
    for (const [lx, ly] of LAMPS) hangingLamp(g, lx, ly);
    // le plancher : planches en rangs de plus en plus larges vers nous, usées au milieu
    const rows = [140, 145, 151, 158, 166, 175, 185, 196, 208, 222];
    const r = rnd(5);
    for (let i = 0; i < rows.length - 1; i++) {
      const y0 = rows[i], hh = rows[i + 1] - y0;
      R(g, 0, y0, W, hh, i % 2 ? '#6e4628' : '#64401f');
      R(g, 0, y0, W, 1, '#3a2214'); R(g, 0, y0 + 1, W, 1, i % 2 ? '#7e5434' : '#74502e');
      for (let x = Math.floor(r() * 40); x < W; x += 40 + Math.floor(r() * 50) + i * 4) R(g, x, y0, 1, hh, '#3a2214');
      for (let k = 0; k < W / 30; k++) R(g, Math.floor(r() * W), y0 + 2 + Math.floor(r() * Math.max(1, hh - 3)), 3 + Math.floor(r() * 6), 1, '#5a381c');
    }
    for (let y = 150; y < 216; y++) { const half = 20 + (y - 150) * 0.9; g.fillStyle = 'rgba(200,150,90,0.06)'; g.fillRect(Math.round(200 - half), y, Math.round(half * 2), 1); } // l'usure devant le comptoir
    shadow(g, 0, FLOOR, W, 3, 0.4);
    for (let i = 0; i < 140; i++) R(g, Math.floor(r() * W), 142 + Math.floor(r() * 74), 1, 1, r() < 0.5 ? '#9a7a50' : '#8a6a48'); // la sciure
    backTable(g, 262);
    // les crachoirs de laiton
    for (const cx of [176, 120]) { R(g, cx - 1, 179, 11, 8, OUT); R(g, cx, 180, 9, 6, '#c89a40'); R(g, cx - 1, 179, 11, 1, BRASS_L); R(g, cx + 2, 180, 5, 1, '#3a2a1a'); }
  },
  props: [
    { // le comptoir, devant l'arrière-bar : plateau verni, panneaux, repose-pied de laiton
      y: 162, x: 0, w: 176, h: 60, oy: 56,
      draw(g) {
        const top = 16, base = 56, w = 168;
        R(g, 0, top - 1, w + 4, base - top + 2, OUT);
        R(g, 0, top + 4, w, base - top - 4, '#4a2814');
        for (let px = 6; px < w - 20; px += 27) { // les panneaux à moulure
          R(g, px, top + 10, 22, 24, '#3a1e0c'); R(g, px, top + 10, 22, 1, '#24120a'); R(g, px, top + 10, 1, 24, '#24120a');
          R(g, px + 1, top + 33, 21, 1, '#6a3e1e'); R(g, px + 21, top + 11, 1, 23, '#6a3e1e');
          R(g, px + 4, top + 14, 14, 16, '#4a2814'); R(g, px + 4, top + 14, 14, 1, '#6a3e1e');
          R(g, px - 3, top + 6, 2, base - top - 8, '#6a3e1e');
        }
        R(g, 0, top, w + 3, 5, '#9a6234'); R(g, 0, top, w + 3, 1, '#d09a5a'); R(g, 0, top + 4, w + 3, 1, '#5a3014'); // le plateau
        R(g, 0, base - 6, w, 2, BRASS); R(g, 0, base - 6, w, 1, BRASS_L); // le repose-pied
        for (let px = 10; px < w; px += 40) R(g, px, base - 5, 2, 5, '#a87a2a');
        R(g, 0, base - 2, w, 2, '#2a1608');
        // sur le plateau : bouteille, verres, chope, chiffon
        bottle(g, 120, top, 16, '#3a6a2a', '#e8dcc0');
        for (const gx of [130, 137]) { R(g, gx - 1, top - 7, 6, 7, OUT); R(g, gx, top - 6, 4, 6, '#c8d0d0'); R(g, gx, top - 3, 4, 3, '#c8902a'); R(g, gx, top - 6, 1, 6, '#ffffff'); }
        R(g, 146, top - 10, 9, 11, OUT); R(g, 147, top - 9, 6, 9, '#e8c070'); R(g, 147, top - 9, 6, 2, '#fffbe8'); R(g, 153, top - 7, 2, 5, OUT);
        R(g, 30, top - 2, 12, 2, '#e8e0cc'); R(g, 32, top - 3, 6, 1, '#f8f4ea');
        R(g, 60, top - 4, 8, 4, OUT); R(g, 61, top - 3, 6, 3, '#c8a050'); // la boîte de cigares
      },
    },
    { // table ronde au premier plan, chaises, jetons et cartes
      y: 182, x: 296, w: 84, h: 52, oy: 46,
      draw(g) {
        const tx = 14, ty = 20;
        // chaise de gauche, dossier à barreaux
        R(g, 1, 6, 4, 40, OUT); R(g, 2, 7, 2, 38, WOOD_L); for (let k = 10; k < 24; k += 4) R(g, 2, k, 9, 1, WOOD_L);
        R(g, 1, 26, 14, 4, OUT); R(g, 2, 27, 12, 2, WOOD_L); R(g, 12, 30, 3, 16, OUT); R(g, 13, 30, 1, 16, WOOD);
        // la table
        R(g, tx + 24, ty + 6, 6, 18, OUT); R(g, tx + 25, ty + 6, 4, 18, WOOD); R(g, tx + 16, ty + 23, 22, 3, OUT); R(g, tx + 17, ty + 24, 20, 1, WOOD);
        R(g, tx - 1, ty - 1, 56, 8, OUT); R(g, tx, ty, 54, 6, '#7a4a28'); R(g, tx, ty, 54, 1, '#b07a44'); R(g, tx + 2, ty + 1, 50, 3, '#2e5a34'); // le tapis vert
        for (const [cx, col] of [[tx + 8, '#a8302a'], [tx + 12, '#e8e0cc'], [tx + 40, '#2a4a8a']]) { R(g, cx, ty - 2, 4, 3, OUT); R(g, cx, ty - 2, 3, 2, col); }
        R(g, tx + 22, ty - 1, 5, 2, '#f0e8d8'); R(g, tx + 28, ty - 1, 5, 2, '#f0e8d8'); R(g, tx + 24, ty - 1, 1, 1, '#a8302a');
        // chaise de droite
        R(g, 78, 6, 4, 40, OUT); R(g, 79, 7, 2, 38, WOOD_L); for (let k = 10; k < 24; k += 4) R(g, 72, k, 8, 1, WOOD_L);
        R(g, 68, 26, 14, 4, OUT); R(g, 69, 27, 12, 2, WOOD_L); R(g, 68, 30, 3, 16, OUT); R(g, 69, 30, 1, 16, WOOD);
      },
    },
  ],
  lights() { return []; },
  // lumières ajoutées après la teinte : les lampes suspendues, la lampe de la galerie, la bougie du piano
  glow(ctx, t) {
    for (const [lx, ly] of LAMPS) halo(ctx, lx, ly + 2, 60, '255,190,100', 0.85 + 0.08 * Math.sin(t / 70 + lx));
    halo(ctx, 311, 84, 26, '255,180,90', 0.7 + 0.1 * Math.sin(t / 90));
    halo(ctx, 321, 87, 12, '255,200,110', 0.6 + 0.2 * Math.sin(t / 50));
  },
  // la poussière qui danse dans la lumière des lampes
  anim(ctx, t) {
    for (let i = 0; i < 16; i++) {
      const x = 40 + hash(i) * 220 + Math.sin(t / 700 + i) * 6, y = 30 + ((hash(i + 40) * 100 + t * 0.006 * (1 + (i % 3))) % 100);
      R(ctx, x, y, 1, 1, 'rgba(255,230,180,0.45)');
    }
  },
};
