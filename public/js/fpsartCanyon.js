// Dessins de la carte « Canyon » du FPS (fpsmaps/canyon.js) : murs, sols et objets enregistrés dans les registres de
// fpsart.js (TX_WALLS / TX_VARS / TX_FLATS / PR_DECO). Chargé par fps.js.
// Mêmes conventions que fpsart.js : textures 64x64 opaques qui se raccordent bord à bord (lumière en haut à gauche),
// sprites à alpha tout ou rien, base au centre du bas.
import * as A from './fpsart.js';

const { TEX, txRGB, txK, txLerp, txMod, txPick, txField, txNoise, txFbm, txCellMap, txCellLight, txWP, txCrack, txTimber, txMineRock, txText, txTextW, grain, shade, mix, rng, hash, canvas, pen, opaque, hardAlpha, sprite, prRing, prPick, prLit } = A;

// =================================================================== falaise de grès
// La falaise est une seule grande image de 64 x 256 (4 unités de haut, z = 0 en bas) : talus au pied, bancs durs
// (arête claire en haut, surplomb dans l'ombre en bas, diaclases), lits tendres feuilletés, banc blanchi à stratification
// oblique, chapeau de roche. canyonCliff (le mur, de 0 à 1) en est l'unité du bas ; canyonCliffUp (au-dessus de 1, étiré
// sur h - 1) le reste, rangée par rangée : la carte arrondit la hauteur des falaises au cinquième d'unité, deux cases
// voisines montrent les mêmes strates à la même hauteur, sans les répéter à chaque unité (le mille-feuille).
// v1 : la même roche, couverte de coulures de vernis du désert.
const CY_H = 256;
// bandes de bas en haut : [épaisseur (unités), couleur, banc dur]
const CY_BANDS = [[0.5, '#9e4a34', 0], [1.3, '#c4643e', 1], [0.16, '#8e402e', 0], [0.34, '#b85838', 1], [0.12, '#9a4632', 0], [1.0, '#d6a078', 1], [0.14, '#a4503a', 0], [0.44, '#b65a3a', 1]];
function cyTall(v) {
  return A.memo(`canyonTall:${v}`, () => {
    const c = canvas(TEX, CY_H), p = pen(c), r = rng(hash('canyonStrata'));
    p.R(0, 0, TEX, CY_H, '#000000');
    let z0 = 0;
    // rangées (y) des bandes, du haut de l'image vers le bas
    const bands = CY_BANDS.map(([t, col, hard]) => { const b = { y0: CY_H - (z0 + t) * 64, y1: CY_H - z0 * 64, col: txRGB(col), hard }; z0 += t; return b; });
    const ph = r() * 6.283, nz = txFbm(r, [32, 16, 8], [0.5, 0.3, 0.2]), nz2 = txNoise(r, 4), nz3 = txNoise(r, 2), tone = txFbm(r, [32, 16], [0.6, 0.4]);
    const yyOf = (x, y) => y + 1.6 * Math.sin((x / 64) * 6.283 + ph) + 0.7 * Math.sin((x / 32) * 6.283 + ph * 1.7) + (nz(x, y) - 0.5) * 3;
    const bandOf = (yy) => bands.find((b) => yy >= b.y0 && yy < b.y1) || (yy < bands[bands.length - 1].y0 ? bands[bands.length - 1] : bands[0]);
    // diaclases : de longues fentes verticales qui serpentent dans les bancs durs (pas des joints de briques)
    const jm = new Uint8Array(TEX * CY_H);
    for (let j = 0; j < 9; j++) {
      let x = Math.floor(r() * 64);
      const y1 = Math.floor(r() * (CY_H - 40)), len = 18 + Math.floor(r() * 50);
      for (let k = 0; k < len; k++) { const y = y1 + k; jm[y * TEX + txMod(x)] = 1; if (!jm[y * TEX + txMod(x + 1)]) jm[y * TEX + txMod(x + 1)] = 2; const q = r(); x += q < 0.15 ? -1 : q < 0.3 ? 1 : 0; }
    }
    txField(c, (x, y) => {
      const yy = yyOf(x, y), B = bandOf(yy), u = yy - B.y0, d = B.y1 - yy;
      let k = (0.93 + nz2(x, y) * 0.14) * (0.93 + tone(x, y) * 0.14);
      if (B.hard) {
        if (u < 1) k *= 1.2; else if (u < 2) k *= 1.08;
        else if (d < 1.2) k *= 0.6; else if (d < 2.6) k *= 0.8;
        // stratification oblique, à peine marquée, dans l'épaisseur du banc
        else if (txMod(Math.floor(x * 0.5 + yy * 1.4 + (nz3(x, y) - 0.5) * 3), 11) === 0) k *= 0.94;
      } else {
        if (u < 2.5) k *= 0.74; // sous le surplomb du banc du dessus
        if (Math.floor(yy * 1.5) % 3 === 0) k *= 0.93; // feuillets
        if (nz3(x * 2, y) > 0.72) k *= 1.07; // éclats
      }
      const jj = jm[y * TEX + x];
      if (B.hard && jj === 1) k *= 0.6; else if (B.hard && jj === 2) k *= 1.08;
      return txK(B.col, k);
    }, 0, 0, TEX, CY_H);
    const w = txWP(p);
    // alvéoles (tafoni) dans les bancs durs : creux sombre, rebord clair en bas ; cailloux coincés sur les arêtes
    for (const B of bands) if (B.hard) {
      const n = Math.round((B.y1 - B.y0) / 12);
      for (let i = 0; i < n; i++) { const x = r() * 64, y = B.y0 + 4 + r() * (B.y1 - B.y0 - 8), rx = 1 + r() * 2.2; w.ell(x, y + 1, rx, 1, '#d88a60'); w.ell(x, y, rx, 1, '#5a2418'); w.P(x - rx, y, '#7a3420'); }
      for (let i = 0; i < 4; i++) { const x = r() * 64; w.R(x, B.y0 - 1, 2, 1, '#e0a07a'); w.P(x + 1, B.y0, '#6a2a1a'); }
    }
    // le talus au pied : éboulis et gravillons
    for (let i = 0; i < 26; i++) { const x = r() * 64, y = CY_H - 2 - r() * 26 * (1 - r() * 0.5), col = txPick(r, ['#d08458', '#b4603e', '#8a3e28', '#e0a07a']); w.R(x, y, 2, 1, col); w.R(x, y + 1, 2, 1, '#5a2418'); }
    // vernis du désert : coulures sombres sous les arêtes (v1 : partout ; v0 : quelques-unes)
    const dk = new Float32Array(TEX * CY_H), hard = bands.filter((b) => b.hard);
    for (let i = 0; i < (v ? 26 : 5); i++) {
      const x0 = Math.floor(r() * 64), B = txPick(r, hard), len = 10 + r() * (v ? 50 : 24), ww = 1 + Math.floor(r() * 3), a = 0.22 + r() * 0.3;
      for (let j = 0; j < len; j++) for (let k = 0; k < ww; k++) {
        const x = txMod(x0 + k + (j > len * 0.6 && k === 0 ? 1 : 0)), y = Math.round(B.y0 + j + 1);
        if (y < CY_H) dk[y * TEX + x] = Math.max(dk[y * TEX + x], a * (1 - j / len) * (k === 0 || k === ww - 1 ? 0.7 : 1));
      }
    }
    const tar = txRGB('#3a2020');
    txField(c, (x, y, col) => (dk[y * TEX + x] > 0 ? txLerp(col, tar, dk[y * TEX + x]) : null), 0, 0, TEX, CY_H);
    grain(c, 0, 0, TEX, CY_H, r, 0.05, 0.45);
    return c;
  });
}
// Le mur (z de 0 à 1) : l'unité du bas de la grande image
function cyCliff(p, rand, c, v) {
  c.getContext('2d').drawImage(cyTall(v ? 1 : 0), 0, TEX - CY_H);
}
// Au-dessus de 1 (C.up) : v = q + 16 * variante, la falaise fait 1 + q / 5 de haut ; chaque rangée de la texture (étirée
// sur q / 5 unités par fps.js) prend la rangée de la grande image à la même hauteur
function cyCliffUp(p, rand, c, v) {
  const src = cyTall(v >> 4).getContext('2d').getImageData(0, 0, TEX, CY_H).data, H = Math.max(0.2, (v & 15) / 5);
  txField(c, (x, y) => {
    const z = 1 + (1 - (y + 0.5) / TEX) * H, i = (Math.max(0, Math.min(CY_H - 1, Math.floor(CY_H - z * 64))) * TEX + x) * 4;
    return [src[i], src[i + 1], src[i + 2]];
  });
}

// =================================================================== mine : roche rouge des galeries
const CY_MINE = ['#7a4434', '#86503c', '#6e3c2e', '#925a44', '#744030'];
function cyMine(p, rand, c, v) {
  txMineRock(p, rand, c, false, CY_MINE, -5, '#22100a');
  if (!v) return;
  // cadre de boisage : deux montants sur semelles, le chapeau, les garnissages au-dessus, coins de serrage
  const sh = '#140c08';
  p.R(18, 10, 3, 54, sh); p.R(54, 10, 3, 54, sh); p.R(4, 9, 56, 3, sh);
  for (const x of [10, 46]) {
    txTimber(p, rand, x, 8, 8, 56, '#7a5634');
    p.R(x - 1, 61, 10, 3, '#4a3020'); p.R(x - 1, 61, 10, 1, '#62442c');
  }
  txTimber(p, rand, 4, 2, 56, 7, '#6e4c2e', true);
  for (const x of [8, 22, 36, 50]) { p.R(x, 0, 6, 2, '#5a3e24'); p.R(x, 0, 6, 1, '#8a6440'); }
  for (const x of [10, 46]) { p.R(x + 1, 9, 6, 3, '#3a2a20'); p.P(x + 2, 10, '#8a7a6a'); p.P(x + 5, 10, '#8a7a6a'); }
  // un clou et une bougie fichée dans le boisage (suie au-dessus)
  p.R(30, 12, 1, 3, '#2a2624'); p.R(29, 15, 3, 1, '#3a3430');
  p.R(29, 16, 3, 5, '#e8dcc0'); p.R(31, 16, 1, 5, '#b8a888'); p.P(30, 15, '#2a1a10'); p.P(30, 14, '#f8d040'); p.P(30, 13, '#fff0a0');
  for (let y = 3; y < 12; y++) if (y > 8 || y < 6) p.P(30 + (y % 2), y, '#3a2a20');
}

// =================================================================== galerie condamnée (dans la falaise du carreau)
function cyAdit(p, rand, c) {
  cyCliff(p, rng(hash('w:canyonCliff:0')), c, 0);
  // le trou noir, des rails rouillés qui en sortent
  p.R(12, 14, 40, 50, '#060302');
  for (let i = 0; i < 5; i++) { const y = 63 - Math.round(i * i * 0.8 + i * 2); p.R(32 - 11 + i * 2, y, 22 - i * 4, 1, '#1a100a'); }
  p.line(21, 63, 29, 46, '#5a3020'); p.line(43, 63, 35, 46, '#5a3020');
  p.line(22, 63, 29, 47, '#2a1a12'); p.line(42, 63, 35, 47, '#2a1a12');
  // cadre de boisage
  p.R(14, 14, 3, 50, '#140c08'); p.R(53, 14, 3, 50, '#140c08');
  txTimber(p, rand, 7, 10, 7, 54, '#7a5634'); txTimber(p, rand, 50, 10, 7, 54, '#7a5634');
  txTimber(p, rand, 3, 5, 58, 7, '#6a4a2c', true);
  p.R(5, 12, 54, 2, '#140c08');
  // planches clouées en travers, délavées, une arrachée (on voit le noir entre elles)
  const plank = (x0, y0, x1, y1, col) => {
    for (let k = 0; k < 5; k++) p.line(x0, y0 + k, x1, y1 + k, k === 0 ? shade(col, 0.2) : k === 4 ? shade(col, -0.4) : col);
    for (const [nx, ny] of [[x0 + 2, y0 + 2], [x1 - 2, y1 + 2]]) { p.P(nx, ny, '#2a2420'); p.P(nx + 1, ny - 1, shade(col, 0.3)); }
  };
  plank(9, 20, 55, 24, '#9a8a72'); plank(9, 33, 55, 31, '#8e7c64'); plank(9, 50, 55, 46, '#a08e74');
  plank(11, 40, 30, 43, '#857258');
  p.line(12, 27, 52, 39, '#6a5a46', 3); p.line(12, 26, 52, 38, '#a89478'); // la diagonale
  // DANGER peint en rouge sur la planche du milieu, crâne grossier
  txText(p.R, 'DANGER', 18, 32, '#8a1a10');
  p.R(44, 31, 5, 4, '#e8dcc4'); p.P(45, 32, '#2a1a10'); p.P(47, 32, '#2a1a10'); p.R(45, 35, 3, 1, '#e8dcc4');
  grain(c, 0, 0, 64, 64, rand, 0.05, 0.3);
}
// =================================================================== redoute : gabions et sacs de sable (murs bas)
// Mur bas (0,72) : toute la texture est écrasée sur sa hauteur. v0 : deux gabions d'osier pleins de terre, une rangée
// de sacs dessus ; v1 : sacs de sable empilés en quinconce.
function cySandbags(p, rand, y0, rows, rh) {
  const w = txWP(p);
  const B = ['#6e5a3a', '#8a7450', '#a48c62', '#bca274', '#d0b88a'];
  for (let r = 0; r < rows; r++) {
    const y = y0 + r * rh, off = (r % 2) * 11;
    for (let x = -off; x < 64; x += 22) {
      const t = (rand() - 0.5) * 0.12;
      w.R(x, y, 22, rh, '#2e2418');
      w.R(x + 1, y + 1, 20, rh - 2, shade(B[2], t)); w.R(x + 2, y + 1, 17, 2, shade(B[4], t)); w.R(x + 1, y + 3, 1, rh - 5, shade(B[3], t));
      w.R(x + 1, y + rh - 3, 20, 2, shade(B[1], t)); w.R(x + 20, y + 2, 1, rh - 4, shade(B[1], t));
      w.R(x + 3, y + 3, 1, rh - 6, shade(B[1], t)); w.P(x + 2, y + 2, shade(B[1], t)); w.P(x + 19, y + 2, shade(B[1], t)); // le pli ficelé
      for (let i = 0; i < 4; i++) w.R(x + 5 + rand() * 12, y + 3 + Math.floor(rand() * (rh - 6)), 2 + rand() * 3, 1, shade(B[1], t + 0.05));
    }
  }
}
function cyGabion(p, rand, c, v) {
  p.R(0, 0, 64, 64, '#2a1e14');
  if (v === 1) { cySandbags(p, rand, 0, 6, 11); grain(c, 0, 0, 64, 64, rand, 0.06, 0.4); return; }
  cySandbags(p, rand, 0, 2, 10);
  // deux gabions : piquets verticaux, osier tressé (rangs alternés), la terre qui déborde
  for (const gx of [0, 32]) {
    const W2 = ['#4a3418', '#6e5028', '#8e6c38', '#ae8a4a', '#c8a462'];
    for (let y = 20; y < 64; y++) for (let x = 1; x < 31; x++) {
      const u = (x + 0.5) / 31, row = Math.floor((y - 20) / 3), ph = (Math.floor(x / 4) + row) % 2;
      const lit = prLit(u) * (ph ? 0.85 : 1.05) * ((y - 20) % 3 === 2 ? 0.7 : 1);
      p.P(gx + x, y, prPick(W2, lit));
    }
    for (let x = 3; x < 31; x += 5) { p.R(gx + x, 20, 1, 44, '#3a2610'); p.P(gx + x, 19, '#8a6a3a'); p.P(gx + x, 18, '#5a3e1e'); }
    p.R(gx, 20, 1, 44, '#1e140a'); p.R(gx + 31, 20, 1, 44, '#1e140a');
    for (let x = 2; x < 30; x++) if (rand() < 0.6) p.R(gx + x, 20, 1, 1 + Math.floor(rand() * 2), '#7a5034');
  }
  grain(c, 0, 0, 64, 64, rand, 0.06, 0.4);
}

// =================================================================== éboulis (mur bas) : gros blocs de grès arrondis
function cyBoulder(p, rand, c) {
  const m = txCellMap(rand, -3, false, 5);
  const pal = ['#b25a38', '#c26a42', '#a24e32', '#cc7a4c', '#9a4a30'].map(txRGB), cols = m.pts.map(() => txPick(rand, pal));
  const nz = txFbm(rand, [8, 4, 2]), gap = txRGB('#2a120c');
  txField(c, (x, y) => {
    const k = y * TEX + x, id = m.id[k], pt = m.pts[id];
    if (m.e[k] < 1.6) return txK(gap, 0.8 + nz(x, y) * 0.4);
    let dx = x + 0.5 - pt[0]; dx -= TEX * Math.round(dx / TEX);
    const dy = y + 0.5 - pt[1], rim = Math.min(1, m.e[k] / 7);
    // bloc arrondi : sommet éclairé à gauche, bas dans l'ombre, liseré de strates
    const sh = 0.75 + 0.45 * rim - (dy > 0 ? dy * 0.012 : 0) - (dx * 0.006) + (dy < -4 && dx < 2 ? 0.1 : 0);
    const band = Math.floor((y + pt[2] * 9) / 5) % 3 === 0 ? 0.92 : 1;
    return txK(cols[id], sh * band * (0.92 + nz(x, y) * 0.16));
  });
  const w = txWP(p);
  for (let i = 0; i < 10; i++) { const x = rand() * 64, y = rand() * 64; w.R(x, y, 2, 1, '#e0a07a'); w.P(x, y + 1, '#6a2a1a'); }
  grain(c, 0, 0, 64, 64, rand, 0.06, 0.45);
}

// =================================================================== aqueduc (linteau de 1,5 à 1,95)
// On en voit les rangées 3 à 32 (z 1,95 → 1,5) : la goulotte de planches (rebord, flanc cerclé, eau qui suinte), la
// longrine sur laquelle elle repose ; rangées 0-1 : le dessous (fps.js en tire la couleur du dessous du linteau).
function cyFlume(p, rand, c) {
  p.R(0, 0, 64, 64, '#3a2414');
  const w = txWP(p);
  // rebord
  txTimber(p, rand, 0, 3, 64, 4, '#9a7a52', true);
  // flanc : trois planches horizontales
  for (const [y, col] of [[7, '#8a6a46'], [12, '#7e6040'], [17, '#86663e']]) {
    w.R(0, y, 64, 5, col); w.R(0, y, 64, 1, shade(col, 0.18)); w.R(0, y + 4, 64, 1, shade(col, -0.4));
    for (let i = 0; i < 6; i++) w.R(rand() * 64, y + 1 + Math.floor(rand() * 3), 4 + rand() * 10, 1, shade(col, -0.15));
  }
  // montants tous les 32 px, avec leur boulon ; l'eau qui suinte des joints (traces sombres, gouttes)
  for (const x of [6, 38]) { txTimber(w, rand, x, 5, 4, 18, '#6e4c2e'); w.P(x + 1, 9, '#c8c8d0'); w.P(x + 1, 18, '#c8c8d0'); }
  for (let i = 0; i < 5; i++) { const x = rand() * 64, y = 11 + Math.floor(rand() * 2) * 5; w.R(x, y, 1, 4 + rand() * 6, '#4a3424'); w.P(x, y + 1, '#8ab0c0'); }
  // longrine (la pièce que portent les chevalets)
  txTimber(p, rand, 0, 23, 64, 7, '#5e4026', true);
  w.R(0, 30, 64, 3, '#2a1a0e');
  for (const x of [20, 52]) { w.R(x, 24, 2, 2, '#2a2624'); w.P(x, 24, '#7a7470'); }
  // dessous et reste : planches sombres
  w.R(0, 0, 64, 3, '#4a3020');
  for (let y = 33; y < 64; y += 6) { w.R(0, y, 64, 6, '#4e3420'); w.R(0, y + 5, 64, 1, '#2a1a0e'); }
  grain(c, 0, 0, 64, 64, rand, 0.06, 0.4);
}

// =================================================================== sluice (mur bas de 0,55) : caisson de lavage
// Le dessus du mur bas prend la couleur des rangées 0-1 (fps.js) : l'eau qui court dans le caisson.
// v0 : caisson de planches ; v1 : la tête, sous le bec de l'aqueduc (vanne, l'eau qui déborde)
function cySluice(p, rand, c, v) {
  p.R(0, 0, 64, 64, '#2a1a0e');
  p.R(0, 0, 64, 2, '#5a8aa0');
  const w = txWP(p);
  for (const [y, col] of [[2, '#8e7050'], [22, '#84663e'], [42, '#7a5c3a']]) {
    w.R(0, y, 64, 20, col); w.R(0, y, 64, 2, shade(col, 0.2)); w.R(0, y + 18, 64, 2, shade(col, -0.45));
    for (let i = 0; i < 9; i++) w.R(rand() * 64, y + 3 + Math.floor(rand() * 14), 5 + rand() * 12, 1, shade(col, -0.16));
  }
  // taquets et piquets qui tiennent le caisson
  for (const x of [2, 34]) { txTimber(w, rand, x, 0, 6, 64, '#6a4a2c'); for (const y of [8, 30, 50]) { w.P(x + 2, y, '#2a2624'); w.P(x + 3, y - 1, '#a8a098'); } }
  // l'eau qui suinte sous le rebord, la mousse verte, le sable d'or au pied
  for (let i = 0; i < 6; i++) { const x = rand() * 64; w.R(x, 2, 1, 6 + rand() * 12, '#3e4a44'); w.P(x, 3, '#9ac0d0'); }
  for (let i = 0; i < 10; i++) w.P(rand() * 64, 2 + rand() * 3, '#5a7a3a');
  for (let i = 0; i < 6; i++) { const x = rand() * 64; w.P(x, 61, '#e0c050'); w.P(x + 1, 62, '#8a6a20'); }
  if (v === 1) {
    // la vanne : planche coulissante entre deux glissières, l'eau qui déborde par-dessus
    txTimber(p, rand, 20, 0, 20, 40, '#9a7a52');
    p.R(18, 0, 2, 44, '#3a2818'); p.R(40, 0, 2, 44, '#3a2818');
    for (let x = 21; x < 39; x++) { const n = 3 + ((x * 7) % 5); p.R(x, 0, 1, n, x % 3 ? '#7ab0c8' : '#c8e4f0'); }
    p.R(26, 12, 8, 3, '#2a2624'); p.R(27, 12, 6, 1, '#7a7470');
  }
  grain(c, 0, 0, 64, 64, rand, 0.05, 0.35);
}

// =================================================================== toile de tente
// v0 : dehors, toile écrue au soleil, coutures, haubans, salissures en bas ; v1 : dedans, la toile éclairée par le
// jour (plus chaude, on devine la trame et les coutures en ombre) ; v2 : le haut (C.up), la panne et l'auvent
function cyCanvas(p, rand, c, v) {
  const base = txRGB(v === 1 ? '#e6c890' : '#ecdcb6'), nz = txFbm(rand, [32, 16, 8], [0.5, 0.3, 0.2]), fine = txNoise(rand, 2);
  txField(c, (x, y) => {
    let k = 0.95 + nz(x, y) * 0.08 + (fine(x * 2, y * 2) - 0.5) * 0.04;
    // chaque lé (16 px) se gonfle un peu : pli clair à gauche, creux à l'ombre à droite (pas des moellons)
    const s = txMod(x, 16), fold = Math.cos(((s - 4) / 16) * 6.283);
    k *= 1 + fold * (v === 1 ? 0.05 : 0.08);
    if (s === 0) k *= v === 1 ? 0.86 : 0.78; else if (s === 1) k *= 1.05; // couture
    // plis de tension en V sous les attaches (en haut de chaque lé)
    if (v === 0 && y > 52) k *= 0.97 - (y - 52) * 0.02; // la poussière rouge du canyon remonte en bas
    if (y % 2 === 0 && x % 2 === 0) k *= 0.985; // la trame
    return txLerp(txK(base, k), txRGB('#b8724a'), v === 0 && y > 54 ? (y - 54) * 0.05 : 0);
  });
  const w = txWP(p);
  if (v === 1) {
    // dedans : ombre des perches et d'un hauban en contre-jour, une pièce cousue
    w.R(31, 0, 3, 64, '#a88a5a'); w.R(32, 0, 1, 64, '#8e7048');
    w.line(0, 6, 63, 22, '#c0a470');
    w.R(10, 30, 9, 8, '#d0b07a'); w.R(10, 30, 9, 1, '#b0905a'); w.R(10, 37, 9, 1, '#b0905a'); for (let x = 10; x < 19; x += 2) w.P(x, 31, '#9a7a4a');
    grain(c, 0, 0, 64, 64, rand, 0.04, 0.4);
    return;
  }
  if (v === 2) {
    // l'auvent : l'ourlet et ses œillets en bas, la panne faîtière qui dépasse en haut, les plis de la toile tendue
    // (l'ombre portée du double toit en haut, la ralingue tendue entre les œillets)
    txField(c, (x, y, col) => (y < 14 ? txK(col, 0.72 + y * 0.02) : null), 0, 0, 64, 14);
    w.R(0, 0, 64, 3, '#6e4c2e'); w.R(0, 0, 64, 1, '#a8805a'); w.R(0, 2, 64, 1, '#3a2818');
    w.R(0, 14, 64, 1, '#a89870');
    for (let x = 4; x < 64; x += 16) { w.P(x, 15, '#3a3020'); w.P(x + 1, 15, '#b0a488'); w.line(x, 16, x - 2, 22, '#8a7a5a'); }
    grain(c, 0, 0, 64, 64, rand, 0.04, 0.4);
    return;
  }
  // dehors : haubans en diagonale, une pièce rapiécée, les piquets et les cordes au pied
  w.line(0, 10, 63, 4, '#8a7a5a'); w.line(0, 11, 63, 5, '#efe6cc');
  w.R(40, 22, 10, 9, '#c4b490'); w.R(40, 22, 10, 1, '#a89874'); w.R(40, 30, 10, 1, '#a89874'); w.R(40, 22, 1, 9, '#a89874');
  for (let x = 41; x < 50; x += 2) w.P(x, 23, '#8a7a5a');
  for (const x of [12, 44]) { w.R(x, 46, 1, 18, '#7a6a4a'); w.line(x, 46, x + 6, 63, '#9a8a6a'); w.R(x + 5, 58, 2, 6, '#5a3e24'); w.P(x + 5, 58, '#8a6440'); }
  for (let i = 0; i < 5; i++) { const x = rand() * 64, y = 20 + rand() * 30; w.ell(x, y, 2 + rand() * 2, 1, '#c2b494'); }
  grain(c, 0, 0, 64, 64, rand, 0.04, 0.4);
}

// =================================================================== baraques de planches délavées
// v0 : planches verticales grisées par le soleil, de largeurs inégales, fentes noires ; v1 : une fenêtre poussiéreuse ;
// v2 : vues du dedans (bois resté chaud, le jour qui passe par les fentes)
function cyBoards(p, rand, c, cols, gap, glow = null) {
  let x = 0;
  const w = txWP(p);
  while (x < 64) {
    const bw = Math.min(64 - x, 6 + Math.floor(rand() * 5)), col = txPick(rand, cols), t = (rand() - 0.5) * 0.1;
    const bc = shade(col, t);
    p.R(x, 0, bw, 64, bc);
    p.R(x, 0, 1, 64, glow || gap); p.R(x + 1, 0, 1, 64, shade(bc, 0.14)); p.R(x + bw - 1, 0, 1, 64, shade(bc, -0.2));
    // veinage, nœuds, fentes de séchage
    for (let i = 0; i < 7; i++) p.R(x + 2 + Math.floor(rand() * Math.max(1, bw - 3)), rand() * 64, 1, 4 + rand() * 12, shade(bc, -0.14));
    if (rand() < 0.6) { const ky = rand() * 60; p.ell(x + bw / 2, ky, 1, 2, shade(bc, -0.4)); p.P(x + bw / 2, ky - 2, shade(bc, 0.2)); }
    if (rand() < 0.4) { const sy = rand() * 50; p.R(x + 2 + Math.floor(rand() * (bw - 3)), sy, 1, 6 + rand() * 10, glow || gap); }
    // clous des deux traverses (raccord vertical : rien ne touche les bords haut et bas)
    for (const ny of [10, 52]) { w.P(x + 2, ny, '#2a2624'); w.P(x + bw - 3, ny, '#2a2624'); w.P(x + 2, ny - 1, '#a89a8a'); }
    x += bw;
  }
}
const CY_GREYW = ['#8a7a66', '#968672', '#7e705e', '#a08e78', '#8e7e6a'];
function cyShack(p, rand, c, v) {
  if (v === 2) {
    cyBoards(p, rand, c, ['#7a5a3a', '#6e5034', '#86643e', '#745438'], '#1a100a', '#f0d8a0');
    grain(c, 0, 0, 64, 64, rand, 0.05, 0.4);
    return;
  }
  cyBoards(p, rand, c, CY_GREYW, '#1e1610');
  grain(c, 0, 0, 64, 64, rand, 0.06, 0.45);
  if (v !== 1) return;
  // fenêtre : chambranle de planches, quatre carreaux poussiéreux (un fendu, un remplacé par une planche), appui
  const fx = 16, fy = 14, fw = 32, fh = 28;
  p.R(fx - 3, fy - 3, fw + 6, fh + 6, '#5e5040'); p.R(fx - 3, fy - 3, fw + 6, 1, '#a8987e'); p.R(fx - 3, fy - 3, 1, fh + 6, '#968670');
  const glass = txRGB('#6a8a94'), dust = txRGB('#b4a688');
  txField(c, (x, y) => {
    const u = (x - fx) / fw, t = (y - fy) / fh;
    let col = txLerp(glass, txRGB('#a8c4cc'), Math.max(0, 0.6 - t) * 0.8);
    col = txLerp(col, dust, 0.25 + (1 - Math.abs(u - 0.5) * 2) * 0.1 + t * 0.2);
    return col;
  }, fx, fy, fw, fh);
  p.R(fx + fw / 2 - 1, fy, 2, fh, '#4e4232'); p.R(fx, fy + fh / 2 - 1, fw, 2, '#4e4232');
  p.R(fx + fw / 2 + 1, fy + fh / 2 + 1, fw / 2 - 1, fh / 2 - 1, '#7a6a54'); // la planche à la place d'un carreau
  p.R(fx + fw / 2 + 1, fy + fh / 2 + 1, fw / 2 - 1, 1, '#a8987e'); p.P(fx + fw / 2 + 3, fy + fh / 2 + 3, '#2a2624'); p.P(fx + fw - 3, fy + fh - 3, '#2a2624');
  p.line(fx + 3, fy + 2, fx + 11, fy + 12, '#e0eaec'); p.line(fx + 4, fy + 2, fx + 12, fy + 12, '#c8d8dc'); // la fente du carreau
  for (let k = 0; k < 5; k++) p.P(fx + fw - 6 + k, fy + 2 + k, '#e8f0f2');
  p.R(fx - 4, fy + fh + 2, fw + 8, 3, '#6e5e48'); p.R(fx - 4, fy + fh + 2, fw + 8, 1, '#b4a48a'); p.R(fx - 4, fy + fh + 4, fw + 8, 1, '#2a2018');
}

// Enseigne peinte sur la fausse façade (C.up, étirée) : panneau cloué sur les planches grises. v0 ASSAY, v1 POWDER, v2 GOLD $
const CY_SIGNS = [['ASSAY', '#2a3a4a', '#e8dcb8'], ['POWDER', '#8a1e14', '#f0e0b8'], ['GOLD $', '#1e2a1e', '#e8c048']];
function cySign(p, rand, c, v) {
  cyShack(p, rng(hash('w:canyonShack:0')), c, 0);
  const [word, board, ink] = CY_SIGNS[v];
  const x0 = 2, y0 = 18, w = 60, h = 26;
  p.R(x0 + 1, y0 + 1, w, h, '#1a120c');
  p.R(x0, y0, w, h, board); p.R(x0, y0, w, 1, shade(board, 0.35)); p.R(x0, y0 + h - 1, w, 1, shade(board, -0.4));
  for (let i = 0; i < 14; i++) p.R(x0 + 2 + rand() * (w - 8), y0 + 2 + Math.floor(rand() * (h - 4)), 3 + rand() * 8, 1, shade(board, rand() < 0.5 ? -0.12 : 0.1));
  p.R(x0 + 3, y0 + 3, w - 6, 1, mix(board, ink, 0.4)); p.R(x0 + 3, y0 + h - 4, w - 6, 1, mix(board, ink, 0.4));
  const s = txTextW(word, 2) <= w - 6 ? 2 : 1, tw = txTextW(word, s), tx = x0 + ((w - tw) >> 1), ty = y0 + ((h - 5 * s) >> 1);
  txText(p.R, word, tx + 1, ty + 1, shade(board, -0.6), s);
  txText(p.R, word, tx, ty, ink, s);
  // peinture écaillée, clous
  for (let i = 0; i < 8; i++) { const ex = x0 + 2 + rand() * (w - 4), ey = y0 + 2 + rand() * (h - 4); p.R(ex, ey, 1 + Math.floor(rand() * 2), 1, '#8a7a66'); }
  for (const [nx, ny] of [[x0 + 2, y0 + 2], [x0 + w - 3, y0 + 2], [x0 + 2, y0 + h - 3], [x0 + w - 3, y0 + h - 3]]) { p.P(nx, ny, '#2a2420'); p.P(nx + 1, ny, '#b0a898'); }
}

// Poudrière : planches peintes au minium (rouge sombre, écaillé). v1 : DANGER / POWDER au pochoir (rangées 6-22 :
// au-dessus de 1, la texture se répète à partir de la rangée 25, le texte n'y revient pas)
function cyPowder(p, rand, c, v) {
  cyBoards(p, rand, c, ['#7a2e20', '#86362a', '#702a1e', '#8e3e2c'], '#1a0c08');
  const w = txWP(p);
  for (let i = 0; i < 22; i++) { const x = rand() * 64, y = rand() * 64; w.R(x, y, 1 + rand() * 3, 1 + Math.floor(rand() * 2), txPick(rand, CY_GREYW)); } // écailles
  grain(c, 0, 0, 64, 64, rand, 0.06, 0.45);
  if (v !== 1) return;
  p.R(6, 5, 52, 19, '#e6d6b0'); p.R(6, 5, 52, 1, '#fff0d0'); p.R(6, 23, 52, 1, '#9a8a6a');
  txText(p.R, 'DANGER', (64 - txTextW('DANGER')) >> 1, 7, '#a01a10');
  txText(p.R, 'POWDER', (64 - txTextW('POWDER')) >> 1, 15, '#2a1a10');
  for (let i = 0; i < 10; i++) p.P(6 + rand() * 52, 5 + rand() * 19, '#c4b48e');
  for (const [nx, ny] of [[7, 6], [56, 6], [7, 22], [56, 22]]) p.P(nx, ny, '#3a2a20');
}

// =================================================================== sols et plafonds
// terre rouge du canyon : grumeaux, gravillons, craquelures, traces de roues
function cyDirt(p, rand, c) {
  const a = txRGB('#a85e3a'), b = txRGB('#bc6e44'), d = txRGB('#94502e'), nz = txFbm(rand, [16, 8, 4], [0.35, 0.4, 0.25]), nz2 = txNoise(rand, 2);
  txField(c, (x, y) => {
    const n = nz(x, y);
    const col = n < 0.42 ? txLerp(d, a, Math.max(0, Math.min(1, (n - 0.2) / 0.22))) : txLerp(a, b, Math.max(0, Math.min(1, (n - 0.42) / 0.3)));
    return txK(col, 0.95 + (nz2(x, y) - 0.5) * 0.1);
  });
  const w = txWP(p, true);
  for (let i = 0; i < 3; i++) txCrack(p, rand, Math.floor(rand() * 64), Math.floor(rand() * 64), 5 + Math.floor(rand() * 6), '#7a3e22', null, true);
  for (let i = 0; i < 20; i++) { const x = rand() * 64, y = rand() * 64, col = txPick(rand, ['#d8a07a', '#c48a64', '#e8b890', '#8a5a40']); w.R(x, y, 1 + Math.floor(rand() * 2), 1, col); w.R(x, y + 1, 2, 1, '#6a3420'); }
  for (let i = 0; i < 3; i++) { const x = rand() * 64, y = rand() * 64; w.ell(x, y, 2, 1, '#9a5634'); w.ell(x, y - 1, 2, 1, '#cc8458'); }
  grain(c, 0, 0, 64, 64, rand, 0.07, 0.6);
}
// lit du ruisseau à sec : boue craquelée en plaques (bords relevés, clairs), sable pâle dans les fentes, galets ronds
function cyCreek(p, rand, c) {
  const m = txCellMap(rand, 9, true, 9);
  const pal = ['#d0aa80', '#c8a076', '#d8b48a', '#c09670'].map(txRGB), cols = m.pts.map(() => txPick(rand, pal));
  const nz = txFbm(rand, [16, 8, 4]), nz2 = txNoise(rand, 2), crack = txRGB('#6a3e26');
  txField(c, (x, y) => {
    const k = y * TEX + x;
    if (m.e[k] < 0.8) return txK(crack, 0.85 + nz2(x, y) * 0.4);
    let s = txCellLight(m, x, y, 0.45) * (0.92 + nz(x, y) * 0.12);
    if (m.e[k] < 1.8) s *= 1.1; // bord relevé de la plaque
    else if (m.e[k] < 3) s *= 0.96;
    return txK(cols[m.id[k]], s + (nz2(x * 2, y * 2) - 0.5) * 0.05);
  });
  const w = txWP(p, true);
  for (let i = 0; i < 7; i++) {
    const x = rand() * 64, y = rand() * 64, r = 1.5 + rand() * 2, col = txPick(rand, ['#8a8478', '#a09484', '#7a5a48', '#b4a898']);
    w.ell(x + 1, y + 1, r, r * 0.7, '#5a3a26'); w.ell(x, y, r, r * 0.7, col); w.P(x - 1, y - 1, shade(col, 0.3));
  }
  grain(c, 0, 0, 64, 64, rand, 0.05, 0.5);
}
// sol des galeries : gravier rouge sombre, éclats de minerai
function cyGallery(p, rand, c) {
  A.txGravel(c, rand, 110, ['#6a3e2e', '#74463a', '#5e3628', '#7e4e3c', '#664032'], '#2a140c', 0.8);
  const w = txWP(p, true);
  for (let i = 0; i < 4; i++) { const x = rand() * 64, y = rand() * 64; w.P(x, y, '#e0c050'); w.P(x + 1, y + 1, '#6a4a18'); }
  grain(c, 0, 0, 64, 64, rand, 0.06, 0.5);
}
// plafond des galeries : roche rouge, chapeaux de boisage en travers tous les 32 px
function cyRockCeil(p, rand, c) {
  txMineRock(p, rand, c, true, ['#5e3428', '#683c2e', '#542e24', '#744434', '#603628'], -4, '#160a06');
  const w = txWP(p, true);
  for (const y of [6, 38]) {
    p.R(0, y + 8, 64, 2, '#140a06');
    txTimber(w, rand, 0, y, 64, 8, '#6a4a2c', true);
    for (const x of [14, 46]) { w.P(x, y + 3, '#2a2624'); w.P(x + 1, y + 2, '#8a8480'); }
  }
}
// dessous de la toile (cantine) : lés éclairés par le jour, coutures, la panne faîtière au milieu
function cyCanvasCeil(p, rand, c) {
  const base = txRGB('#dcc090'), nz = txFbm(rand, [32, 16], [0.6, 0.4]), fine = txNoise(rand, 2);
  txField(c, (x, y) => {
    let k = 0.92 + nz(x, y) * 0.12 + (fine(x * 2, y * 2) - 0.5) * 0.04;
    const s = txMod(y, 16);
    if (s === 0) k *= 0.8; else if (s === 1) k *= 0.92;
    return txK(base, k);
  });
  txTimber(p, rand, 26, 0, 12, 64, '#6e4c2e');
  p.R(25, 0, 1, 64, '#8a6e48'); p.R(38, 0, 1, 64, '#8a6e48');
  grain(c, 0, 0, 64, 64, rand, 0.04, 0.4);
}

// =================================================================== enregistrement des murs et des sols
Object.assign(A.TX_WALLS, {
  canyonCliff: cyCliff, canyonCliffUp: cyCliffUp, canyonMine: cyMine, canyonAdit: cyAdit, canyonGabion: cyGabion, canyonBoulder: cyBoulder,
  canyonFlume: cyFlume, canyonSluice: cySluice, canyonCanvas: cyCanvas, canyonShack: cyShack, canyonSign: cySign, canyonPowder: cyPowder,
});
Object.assign(A.TX_VARS, { canyonCliff: 2, canyonCliffUp: 32, canyonMine: 2, canyonGabion: 2, canyonSluice: 2, canyonCanvas: 3, canyonShack: 3, canyonSign: 3, canyonPowder: 2 });
Object.assign(A.TX_FLATS, { canyonDirt: cyDirt, canyonCreek: cyCreek, canyonGallery: cyGallery, canyonRockCeil: cyRockCeil, canyonCanvasCeil: cyCanvasCeil });

// =================================================================== objets du décor
const T = A.PR_TIMBER, I = A.PR_IRON, CR = A.PR_CREAM;
const CY_ROCK = ['#4a1e14', '#6e2e1e', '#8e3e28', '#ae5234', '#c86a44', '#de8a5e', '#eeae84'];

// Tente de chercheur (tente à murets vue de face) : toile écrue, rabats ouverts sur le noir, mât, haubans et piquets
function cyTent() {
  return sprite(100, 76, (p, c) => {
    const { R, P, line, poly } = p;
    const top = -66, eave = -34, hw = 40, wall = 44;
    // le toit à deux pans (pan gauche au soleil, pan droit à l'ombre) et le muret
    poly([[-hw - 4, eave], [0, top], [0, eave]], CR[4]);
    poly([[0, top], [hw + 4, eave], [0, eave]], CR[2]);
    R(-wall, eave, wall * 2, -eave, CR[3]);
    R(wall - 10, eave, 10, -eave, CR[2]);
    // coutures du toit et du muret
    for (const t of [0.33, 0.66]) { line(-(hw + 4) * t, eave + (top - eave) * (1 - t) - 0, -(hw + 4) * t, eave, CR[2]); line((hw + 4) * t, eave + (top - eave) * (1 - t), (hw + 4) * t, eave, CR[1]); }
    R(-hw - 4, eave, (hw + 4) * 2, 2, CR[1]); R(-hw - 4, eave - 1, hw + 4, 1, CR[5]);
    // l'entrée : le noir, les deux rabats relevés et noués
    poly([[-12, -1], [0, top + 6], [12, -1]], '#1a120c');
    poly([[-12, -1], [0, top + 6], [-5, -1]], '#0c0806');
    poly([[-13, 0], [0, top + 5], [-6, -24], [-18, -8]], CR[5]); line(-13, 0, 0, top + 5, CR[2]);
    poly([[13, 0], [0, top + 5], [6, -24], [18, -8]], CR[3]); line(13, 0, 0, top + 5, CR[1]);
    R(-15, -12, 4, 2, '#7a5a34'); R(11, -12, 4, 2, '#7a5a34');
    // salissures rouges en bas, une pièce, la poussière
    for (let x = -wall; x < wall; x++) for (let y = -5; y <= -1; y++) if (((x * 7 + y * 13) & 7) < y + 9 && Math.abs(x) > 13) P(x, y, mix('#c8b090', '#b06a44', 0.5));
    R(22, -22, 8, 7, CR[2]); R(22, -22, 8, 1, CR[1]);
    // le mât qui dépasse, la panne, les haubans jusqu'aux piquets
    R(-1, top - 6, 2, 8, T[4]); P(-1, top - 6, T[5]);
    line(0, top - 4, -49, -1, '#8a7a5a'); line(0, top - 4, 49, -1, '#7a6a4a');
    for (const s of [-1, 1]) { R(s * 48 - 1, -4, 2, 4, T[3]); P(s * 48 - 1, -4, T[5]); }
    grain(c, 0, 0, c.width, c.height, rng(1849), 0.05, 0.35);
  });
}

// Feu de camp : cercle de pierres, bûches croisées, flammes (f 0..3 : elles dansent), braises
function cyCampfire(f) {
  return sprite(36, 44, (p) => {
    const { R, P, ell, line } = p;
    const r = rng(2000 + f);
    ell(0, -2, 15, 3, '#2a1a12'); ell(0, -2, 11, 2, '#5a1e0c');
    for (let k = 0; k < 9; k++) {
      const a = (k / 9) * Math.PI * 2, x = Math.cos(a) * 14, y = -2 + Math.sin(a) * 3.2;
      ell(x, y, 3, 2, A.PR_STONE[2]); ell(x - 0.5, y - 0.5, 2, 1, A.PR_STONE[4]); P(x - 1, y - 1, A.PR_STONE[5]);
    }
    line(-9, -2, 8, -7, T[2], 3); line(-9, -3, 8, -8, T[4]); line(9, -2, -8, -7, T[1], 3); line(9, -3, -8, -8, T[3]);
    R(-8, -9, 2, 2, '#e05a10'); R(6, -9, 2, 2, '#e05a10');
    // flammes : langues qui montent et se tordent selon l'image
    const F = A.PR_FIRE;
    for (let k = 0; k < 5; k++) {
      const x0 = -6 + k * 3, h = 16 + ((k * 5 + f * 3) % 4) * 4 + (k === 2 ? 8 : 0), sway = Math.sin(f * 1.6 + k) * 2;
      for (let j = 0; j < h; j++) {
        const t = j / h, wdt = Math.max(0, Math.round((1 - t) * (k === 2 ? 4 : 3)));
        const x = x0 + sway * t * t;
        R(x - wdt, -8 - j, wdt * 2 + 1, 1, F[Math.min(6, 2 + Math.floor(t * 3) + (j % 3 === 0 ? 1 : 0))]);
        if (wdt > 1) R(x - wdt + 2, -8 - j, Math.max(1, wdt * 2 - 3), 1, F[Math.min(6, 4 + Math.floor(t * 3))]);
      }
    }
    for (let k = 0; k < 4; k++) P(-8 + r() * 16, -30 - r() * 10, r() < 0.5 ? F[4] : F[5]); // étincelles
  });
}

// Crâne de bœuf (longhorn) posé au sol : cornes en lyre, orbites noires, chanfrein
function cySkull() {
  return sprite(44, 18, (p) => {
    const { R, P, line, poly } = p;
    const B = ['#6a6050', '#9a907c', '#c8bea8', '#e6dcc6', '#f8f2e4'];
    for (const s of [-1, 1]) {
      line(s * 4, -9, s * 12, -11, B[3], 2); line(s * 12, -11, s * 18, -10, B[2], 2); line(s * 18, -10, s * 21, -14, B[2]);
      P(s * 21, -15, B[1]); line(s * 5, -8, s * 12, -10, B[1]);
    }
    poly([[-6, -12], [6, -12], [5, -6], [2, -1], [-2, -1], [-5, -6]], B[3]);
    poly([[-6, -12], [0, -12], [0, -1], [-2, -1], [-5, -6]], B[4]);
    R(-6, -12, 12, 1, B[2]);
    R(-4, -9, 3, 2, '#1a1410'); R(1, -9, 3, 2, '#1a1410'); P(-3, -9, '#3a3028'); P(2, -9, '#3a3028');
    R(-1, -5, 2, 3, B[2]); P(-1, -2, '#2a2420'); P(0, -2, '#2a2420');
    R(-10, 0, 20, 1, '#6a3a24');
  });
}

// Chevalet de l'aqueduc : deux jambes écartées, croix de Saint-André, chapeau sous la longrine (à 1,5 unité, 96 px)
function cyTrestle() {
  return sprite(64, 98, (p, c) => {
    const { R, P, line } = p;
    const top = -95, legX = (y) => 26 - (12 * -y) / -top;
    // semelles de pierre
    for (const s of [-1, 1]) { R(s * 26 - 4, -3, 9, 3, A.PR_STONE[3]); R(s * 26 - 4, -3, 9, 1, A.PR_STONE[4]); }
    // croix de Saint-André (deux étages) et moise du milieu
    for (const [yb, yt] of [[-4, -46], [-48, -90]]) {
      line(-legX(yb) + 2, yb, legX(yt) - 2, yt, T[2], 2);
      line(legX(yb) - 2, yb, -legX(yt) + 2, yt, T[3], 2); line(legX(yb) - 2, yb - 1, -legX(yt) + 2, yt - 1, T[5]);
    }
    const xm = Math.round(legX(-47));
    R(-xm, -48, 2 * xm, 3, T[3]); R(-xm, -48, 2 * xm, 1, T[5]); R(-xm, -46, 2 * xm, 1, T[1]);
    grain(c, 0, 0, c.width, c.height, rng(1859), 0.08, 0.35);
    // jambes (arête claire à gauche)
    for (const s of [-1, 1]) for (let y = top + 3; y <= 0; y++) { const x = Math.round(s * legX(y)); P(x - 2, y, T[5]); R(x - 1, y, 2, 1, T[3]); P(x + 1, y, T[1]); }
    // chapeau, boulons, l'eau qui goutte de la goulotte
    R(-20, top, 40, 4, T[3]); R(-20, top, 40, 1, T[5]); R(-20, top + 3, 40, 1, T[1]);
    for (const x of [-15, 14]) { R(x, top + 1, 2, 2, '#2a2624'); P(x, top + 1, '#8a8480'); }
    for (const [x, y] of [[-3, -70], [4, -40], [-6, -20]]) { P(x, y, '#9ac4d8'); P(x, y + 1, '#5a8aa0'); }
  });
}

// Bloc de grès tombé de la falaise : facettes éclairées en haut à gauche, strates, lichen
function cyRock() {
  return sprite(44, 30, (p, c) => {
    const r = rng(1871);
    const n = 9, pts = [];
    for (let i = 0; i < n; i++) { const a = Math.PI + (i / (n - 1)) * Math.PI, rr = 19 * (0.82 + r() * 0.22); pts.push([Math.cos(a) * rr, Math.min(0, Math.sin(a) * rr * 1.25)]); }
    p.poly(pts, CY_ROCK[2]);
    const pk = [-5, -20];
    for (let i = 0; i < n - 1; i++) {
      const a = pts[i], b = pts[i + 1], mx = (a[0] + b[0]) / 2 - pk[0], my = (a[1] + b[1]) / 2 - pk[1], l = Math.hypot(mx, my) || 1;
      p.poly([pk, a, b], prPick(CY_ROCK, 0.18 + (0.5 + (0.5 * (-mx * 0.6 - my * 0.8)) / l) * 0.75));
    }
    p.poly([pk, pts[n - 1], [pts[n - 1][0], 0], [pts[0][0], 0], pts[0]], CY_ROCK[3]);
    grain(c, 0, 0, c.width, c.height, r, 0.1, 0.35);
    // strates, lichen, ombre au pied
    for (const y of [-8, -15]) for (let x = -17; x < 17; x++) if (r() < 0.75) p.P(x, y + Math.round(Math.sin(x / 5)), CY_ROCK[1]);
    for (let i = 0; i < 6; i++) p.P(-8 + r() * 12, -18 + r() * 6, i % 2 ? '#8a9a5a' : '#aab468');
    p.R(-19, 0, 38, 1, CY_ROCK[0]);
  });
}

// Pic et pelle plantés dans un tas de terre
function cyPick() {
  return sprite(28, 40, (p) => {
    const { R, P, line, ell } = p;
    ell(0, -1, 10, 3, '#8a4a2c'); ell(-1, -2, 7, 2, '#b06a44'); P(-4, -3, '#d08a60');
    // pelle : manche en biais, poignée en D, lame de fer
    line(4, -3, 9, -33, T[3], 2); line(4, -4, 9, -34, T[5]);
    R(7, -37, 6, 1, T[4]); R(7, -37, 1, 3, T[4]); R(12, -37, 1, 3, T[4]);
    p.poly([[1, -1], [7, -1], [6, -9], [2, -9]], I[3]); R(2, -9, 4, 1, I[4]); P(5, -5, I[5]);
    // pic : manche droit, fer recourbé en haut
    R(-5, -30, 2, 28, T[2]); R(-5, -30, 1, 28, T[4]);
    line(-13, -27, -7, -31, I[2], 2); line(-3, -31, 3, -27, I[2], 2); R(-7, -33, 5, 3, I[3]); P(-6, -33, I[5]); line(-12, -28, -7, -32, I[4]);
  });
}

// Batée de chercheur d'or posée de biais contre un caillou, quelques paillettes
function cyPan() {
  return sprite(26, 14, (p) => {
    const { R, P, ell } = p;
    ell(7, -3, 4, 3, CY_ROCK[3]); ell(6, -4, 3, 2, CY_ROCK[4]);
    ell(-2, -5, 10, 5, I[2]); ell(-2, -5, 8, 4, I[1]); ell(-3, -6, 6, 2.5, I[2]);
    for (const [x, y] of [[-4, -5], [-1, -4], [-3, -3]]) P(x, y, A.PR_GOLD[4]);
    R(-12, -6, 2, 2, I[4]); P(-11, -8, I[5]);
    R(-10, 0, 22, 1, '#6a3a24');
  });
}

// Pyramide de boulets à côté du canon
function cyBalls() {
  return sprite(36, 26, (p) => {
    const ball = (bx, by) => {
      for (let y = by - 4; y <= by + 4; y++) for (let x = bx - 4; x <= bx + 4; x++) {
        const nx = (x - bx) / 3.7, ny = (y - by) / 3.7, d = Math.hypot(nx, ny);
        if (d > 1.02) continue;
        p.P(x, y, prPick(A.PR_GUN, 0.3 - nx * 0.3 - ny * 0.4 - (d > 0.82 ? 0.14 : 0) + (nx < -0.15 && ny < -0.15 && d < 0.7 ? 0.4 : 0)));
      }
    };
    for (const [x, y] of [[-12, -4], [-4, -4], [4, -4], [12, -4], [-8, -11], [0, -11], [8, -11], [-4, -18], [4, -18]]) ball(x, y);
  });
}

// Balance à or du bureau des essais (posée sur le guichet) : fléau, plateaux de laiton, socle de bois
function cyScales() {
  return sprite(24, 24, (p) => {
    const { R, P, line } = p;
    const B = A.PR_BRASS;
    R(-8, -3, 16, 3, T[3]); R(-8, -3, 16, 1, T[5]); R(-8, -1, 16, 1, T[1]);
    R(-1, -19, 2, 16, B[3]); R(-1, -19, 1, 16, B[5]);
    R(-10, -19, 20, 1, B[4]); P(0, -21, B[5]); R(-1, -21, 2, 2, B[3]);
    for (const s of [-1, 1]) {
      line(s * 9, -18, s * 6, -10, B[2]); line(s * 9, -18, s * 11, -10, B[2]);
      R(s * 9 - 4, -10, 9, 1, B[4]); R(s * 9 - 3, -9, 7, 1, B[2]);
    }
    P(-9, -11, A.PR_GOLD[5]); P(-10, -11, A.PR_GOLD[4]); P(-8, -11, A.PR_GOLD[3]);
    R(7, -12, 3, 2, B[1]); // le poids
  });
}

Object.assign(A.PR_DECO, {
  canyonTent: [1, cyTent], canyonCampfire: [4, cyCampfire], canyonSkull: [1, cySkull], canyonTrestle: [1, cyTrestle], canyonRock: [1, cyRock],
  canyonPick: [1, cyPick], canyonPan: [1, cyPan], canyonBalls: [1, cyBalls], canyonScales: [1, cyScales],
});
