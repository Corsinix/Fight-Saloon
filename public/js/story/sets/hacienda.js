// L'Hacienda del Diablo, au pied du volcan : casco fortifié en adobe crépi d'ocre rouge, encadrements de tezontle
// (la pierre volcanique rouge-noir), tour ronde à talus et tour carrée crénelées, portail ouvert sur un passage voûté
// et le patio éclairé, balcon de fer forgé, bannières au crâne cornu, torches et braseros. Le volcan fume derrière.
import * as S from '../../sprites.js';
import { H } from '../../worlds.js';
import { OUT, R, O, rnd, flames, smoke, halo } from './kit.js';
import {
  shadowOf, blob, fillRows, outlineRows, archRows, colRows, masked, veil, veilRows, skew, plaster, bricks, peel, tezontle,
  stone, cornice, viga, canal, opening, door, grille, shutters, agave, deadTree, scatter, ground,
} from './kit-adobe.js';

const sh = S.shade, mix = S.mix;
const AD = '#9e5c46', ADL = '#b8745a', BR = '#7a4636', TZ = '#5a2e2a', TZL = '#7a4038', WOOD = '#4a2c1c';
const BASE = 168;
const GATE = [302, 56, 70]; // le portail : x, largeur, hauteur (El Diablo en sort, x 338, pieds en 170)
const TORCH = [[284, 128], [376, 128]]; // pied des flammes des torches du portail
const BRAZIER = [156, 30]; // le brasero de la tour ronde
const FLAGS = [[330, 9], [543, 4]]; // hampes (haut) des drapeaux d'El Diablo : faîte du logis, tour carrée

// Crâne cornu d'El Diablo (os sur fond sombre), w ≈ 26
function skull(g, x, y, bone = '#e8dcc0', eye = '#9a1a10') {
  const d = shadowOf(bone, 0.4);
  O(g, x - 7, y, [[0, 0, 14, 10, bone], [3, 10, 8, 4, bone], [-6, -3, 6, 3, bone], [14, -3, 6, 3, bone], [-9, -8, 3, 6, bone], [20, -8, 3, 6, bone]]);
  R(g, x + 5, y + 1, 2, 9, d); R(g, x - 7, y, 14, 1, sh(bone, 0.3));
  R(g, x - 4, y + 3, 3, 3, eye); R(g, x + 2, y + 3, 3, 3, eye); R(g, x - 1, y + 7, 2, 2, '#3a2420');
  for (let k = 0; k < 4; k++) R(g, x - 3 + k * 2, y + 12, 1, 2, '#3a2420');
}
// Créneaux pyramidaux (almenas) le long d'un parapet
function merlons(g, x0, x1, top, col, step = 10) {
  for (let x = x0 + 2; x < x1 - 4; x += step) {
    O(g, x, top, [[0, -5, 6, 5, col], [1, -7, 4, 2, col], [2, -9, 2, 2, col]]);
    R(g, x, top - 5, 1, 5, sh(col, 0.15)); R(g, x + 5, top - 5, 1, 5, shadowOf(col, 0.35)); R(g, x + 3, top - 9, 1, 4, shadowOf(col, 0.3));
  }
}
// Mur crépi d'ocre rouge, cerné, avec son crépi taché
function wall(g, x, y, w, h, seed, opt = {}) {
  R(g, x - 1, y - 1, w + 2, h + 1, OUT);
  plaster(g, x, y, w, h, opt.col || AD, { seed, peel: opt.peel ?? Math.round((w * h) / 2200), grime: 10, brick: BR, earth: '#2a1e1e', streak: 1.2, ...opt });
}
// Bannière d'El Diablo suspendue au parapet : noire bordée de rouge, crâne d'os, queue d'aronde
function banner(g, x, y, w, h) {
  const rows = [];
  for (let yy = y; yy < y + h; yy++) {
    const tail = yy - (y + h - 8);
    if (tail <= 0) rows.push([yy, x, x + w]);
    else { const k = Math.round((tail * w) / 16); rows.push([yy, x, x + Math.round(w / 2) - k]); rows.push([yy, x + Math.round(w / 2) + k, x + w]); }
  }
  veilRows(g, rows.map(([yy, a, b]) => [yy + 2, a + 3, b + 3]), 0.35);
  outlineRows(g, rows);
  fillRows(g, rows, '#9a2a1c');
  fillRows(g, rows.map(([yy, a, b]) => [yy, a + 2, b - 2]).filter(([yy, a, b]) => b > a), '#1e1416');
  for (const [yy, a, b] of rows) if (b - a > 4) { R(g, a + 2, yy, 1, 1, '#2e2224'); if ((yy - y) % 9 < 2) R(g, a + 3, yy, b - a - 6, 1, '#141012'); } // plis
  // petit crâne cornu brodé
  const sx = x + Math.round(w / 2) - 3, sy = y + 16, bone = '#e0d0b0';
  R(g, sx, sy, 7, 5, bone); R(g, sx + 1, sy + 5, 5, 2, bone); R(g, sx - 2, sy - 2, 2, 2, bone); R(g, sx + 7, sy - 2, 2, 2, bone);
  R(g, sx - 3, sy - 4, 1, 2, bone); R(g, sx + 9, sy - 4, 1, 2, bone);
  R(g, sx + 1, sy + 2, 2, 2, '#c0392b'); R(g, sx + 4, sy + 2, 2, 2, '#c0392b'); R(g, sx + 6, sy, 1, 5, shadowOf(bone, 0.4));
  for (let k = 0; k < 3; k++) R(g, sx + 1 + k * 2, sy + 9 + k * 5, 3, 1, '#9a2a1c'); // les gouttes rouges
  R(g, x - 2, y - 2, w + 4, 2, '#3a2a22'); R(g, x - 2, y - 2, w + 4, 1, '#6a5040'); // la tringle
}
// Applique de fer et sa torche ; suie au-dessus
function sconce(g, x, y, wallCol) {
  const soot = blob(rnd(x), x, y - 26, 6, 22);
  veilRows(g, soot, 0.22, '20,10,10'); veilRows(g, blob(rnd(x + 1), x, y - 14, 4, 12), 0.25, '20,10,10');
  O(g, x - 1, y, [[0, 4, 3, 14, '#4a2a14'], [-3, 0, 9, 4, '#2a2626']]);
  R(g, x - 2, y + 1, 7, 1, '#5a5452');
  O(g, x + 1, y + 12, [[0, 0, 6, 2, '#2a2626']]);
}

export default {
  w: 680, horizon: 130, ground: 186, outdoor: true,
  far: [
    { k: 0.12, draw(g, w) {
      // le volcan : cône à cratère tronqué, ravines, flanc gauche éclairé, coulées de lave, panache de cendres
      const cx = Math.round(w * 0.55), rim = 22, r = rnd(13);
      const top = (x) => { const u = Math.abs(x - cx); return u < 14 ? rim + (u > 10 ? 1 : 0) : Math.round(rim + ((u - 14) / (w * 0.5)) ** 1.2 * 130); };
      for (let x = 0; x < w; x++) {
        const y = Math.min(131, top(x)), u = (x - cx) / (w * 0.5);
        R(g, x, y - 1, 1, 1, '#1e1216');
        R(g, x, y, 1, 131 - y, u < -0.05 ? '#4a2c30' : u < 0.08 ? '#3e2428' : '#321c22');
        if (u < -0.05) R(g, x, y, 1, 2, '#6a4040');
      }
      // ravines qui descendent du cratère
      for (let i = 0; i < 16; i++) {
        let x = cx + (r() - 0.5) * 30, y = rim + 3 + r() * 8;
        const dir = (x - cx) / 14 + (r() - 0.5) * 0.4;
        const col = x < cx ? '#3a2226' : '#26161a';
        for (let s = 0; s < 40 + r() * 60 && y < 128; s++) {
          x += dir * 0.9 + (r() - 0.5) * 0.8; y += 1;
          if (y > top(Math.round(x)) + 1) { R(g, Math.round(x), Math.round(y), 1, 1, col); if (x < cx) R(g, Math.round(x) - 1, Math.round(y), 1, 1, '#5a3638'); }
        }
      }
      // la lueur du cratère et deux coulées de lave
      for (let x = cx - 13; x <= cx + 13; x++) { R(g, x, rim, 1, 1, '#f8a040'); R(g, x, rim + 1, 1, 1, '#c8401c'); }
      for (const [k, len, seed] of [[-1, 46, 1], [1, 30, 2], [1, 58, 3]]) {
        const rr = rnd(seed);
        let x = cx + k * (4 + seed * 2);
        for (let s = 0; s < len; s++) {
          x += k * (0.45 + rr() * 0.4) + Math.sin(s / 5 + seed) * 0.35;
          const y = rim + 2 + s;
          if (y < top(Math.round(x))) continue;
          R(g, Math.round(x), y, 2, 1, s < len * 0.3 ? '#f87a2a' : s < len * 0.7 ? '#c8401c' : '#7a2418');
          if (s < len * 0.3) R(g, Math.round(x), y, 1, 1, '#fde070');
        }
      }
      // le panache de cendres qui dérive vers la droite, éclairé par dessous
      const plume = [[cx + 2, 16, 7, 5], [cx + 9, 11, 9, 6], [cx + 20, 8, 11, 6], [cx + 35, 5, 13, 6], [cx + 52, 3, 14, 6], [cx + 71, 2, 15, 5], [cx + 92, 1, 16, 5], [cx + 113, 0, 14, 5]];
      for (const [x, y, rx, ry] of plume) outlineRows(g, blob(r, x, y, rx, ry), '#2a1c20');
      for (const [x, y, rx, ry] of plume) {
        fillRows(g, blob(r, x, y, rx, ry), '#4a3a40');
        fillRows(g, blob(r, x - 2, y - 2, rx * 0.7, ry * 0.6), '#5e4c50');
        fillRows(g, blob(r, x + 1, y + ry - 2, rx * 0.6, 2), '#8a4a3a');
      }
    } },
    { k: 0.4, draw(g, w) {
      // les coulées de basalte figées, entre le volcan et l'hacienda
      const r = rnd(17);
      let y = 112;
      for (let x = 0; x < w; x++) {
        y = Math.max(98, Math.min(124, y + (r() - 0.5) * 2.2 + Math.sin(x / 41) * 0.5));
        const spire = r() < 0.025 ? 4 + Math.floor(r() * 8) : 0;
        const yy = Math.round(y) - spire;
        R(g, x, yy - 1, 1, 1, '#140c10');
        R(g, x, yy, 1, 140 - yy, '#22181c');
        R(g, x, yy, 1, 1, '#5a3a3a');
        if (Math.sin(x / 7) > 0.7) R(g, x, yy + 2, 1, 5, '#2c2024');
      }
    } },
  ],
  back(g, w) {
    ground(g, 0, 130, w, H - 130, ['#3a2a2a', '#423030', '#4a3632', '#523c36'], 81, ['#6a5048', '#2a1c1c']);
    const r = rnd(81);
    for (let i = 0; i < 34; i++) { // fissures rougeoyantes
      let x = Math.floor(r() * w), y = 140 + Math.floor(r() * 70);
      if (x > 250 && x < 410 && y > 166) continue;
      for (let k = 0; k < 8; k++) { R(g, x, y, 2, 1, '#7a2a1c'); if (k > 2 && k < 6) R(g, x, y, 1, 1, '#c8401c'); x += 2; y += Math.round(r() * 2 - 1); }
    }

    // ---- murs d'enceinte bas, aux deux bouts
    const lowWall = (x0, x1, top, seed) => {
      const rr = rnd(seed), cols = [];
      let t = top;
      for (let x = x0; x < x1; x++) { t = Math.max(top - 3, Math.min(top + 6, t + (rr() - 0.5) * 2)); cols.push([x, Math.round(t)]); }
      const rows = colRows(cols, BASE);
      outlineRows(g, rows);
      masked(g, x0, top - 5, x1 - x0, BASE - top + 5, rows, (t2) => {
        bricks(t2, x0, top - 5, x1 - x0, BASE - top + 5, BR);
        plaster(t2, x0, top + 4, x1 - x0, BASE - top - 4, AD, { seed, peel: 4, grime: 8, brick: BR, earth: '#2a1e1e' });
      });
      for (const [x, t2] of cols) R(g, x, t2, 1, 1, sh(BR, 0.25));
    };
    lowWall(70, 134, 128, 3);
    lowWall(566, 612, 124, 4);
    lowWall(632, w, 126, 5);
    for (let k = 0; k < 7; k++) O(g, 610 + k * 3, BASE, [[0, -3 - (k % 3) * 2, 4, 3 + (k % 3) * 2, k % 2 ? BR : AD]]); // la brèche du mur
    // l'orgue (cactus) derrière le mur de droite
    for (const [x, h] of [[648, 58], [656, 70], [664, 50], [641, 40]]) {
      const col = '#4a6a42', top = BASE - 20 - h;
      R(g, x - 1, top + 1, 7, h, OUT); R(g, x, top - 1, 5, 2, OUT); R(g, x, top, 5, h, col); R(g, x + 1, top - 1, 3, 1, col);
      R(g, x + 1, top, 1, h, '#6a8a5a'); R(g, x + 3, top + 1, 1, h - 1, '#2e4628'); R(g, x + 4, top + 1, 1, h - 1, '#26381f');
      for (let y = top + 3; y < top + h; y += 4) R(g, x + 2, y, 1, 1, '#c8c0a0'); // épines
    }

    // ---- aile droite : loggia à l'étage, fenêtres grillées, porte de service
    wall(g, 398, 66, 124, BASE - 66, 11);
    merlons(g, 398, 522, 66, AD);
    cornice(g, 398, 64, 124, ADL, AD, 2);
    for (let i = 0; i < 4; i++) {
      const ax = 410 + i * 27;
      opening(g, ax, 108, 18, 30, { fill: '#1e1214', wall: AD, ring: 2, ringCol: TZL });
      for (let bx = ax; bx < ax + 18; bx += 3) R(g, bx, 98, 1, 10, '#2a2626');
      R(g, ax - 1, 97, 20, 1, '#2a2626');
    }
    R(g, 402, 109, 116, 2, OUT); R(g, 402, 109, 116, 1, TZL); // l'appui de la loggia
    for (const vx of [404, 432, 460, 488, 512]) viga(g, vx, 72, AD);
    canal(g, 408, 66, AD, 26); canal(g, 506, 66, AD, 20);
    grille(g, 414, 126, 12, 16, AD); grille(g, 492, 126, 12, 16, AD);
    opening(g, 452, BASE, 18, 34, { fill: '#1e1214', wall: AD, ring: 2, ringCol: TZL });
    door(g, archRows(454, BASE, 14, 32), { col: WOOD, studs: false });

    // ---- aile gauche : mur presque aveugle, grilles en saillie
    wall(g, 176, 66, 88, BASE - 66, 12);
    merlons(g, 176, 264, 66, AD);
    cornice(g, 176, 64, 88, ADL, AD, 2);
    grille(g, 192, 84, 12, 17, AD); grille(g, 224, 84, 12, 17, AD); grille(g, 200, 128, 10, 13, AD);
    canal(g, 186, 66, AD, 22); canal(g, 252, 66, AD, 30);
    grille(g, 238, 128, 10, 13, AD);

    // ---- la tour ronde à talus (torreón), le brasero
    const tc = 156;
    const tRows = [];
    for (let y = 40; y < 172; y++) { const rad = y > 146 ? 24 + Math.round((y - 146) / 6) : 24; tRows.push([y, tc - rad, tc + rad]); }
    outlineRows(g, tRows);
    masked(g, tc - 30, 40, 60, 132, tRows, (t) => {
      plaster(t, tc - 30, 40, 60, 132, AD, { seed: 14, peel: 7, grime: 12, brick: BR, earth: '#2a1e1e', streak: 1.4 });
      // modelé du cylindre : clair à gauche, sombre à droite
      for (let x = tc - 30; x < tc + 30; x++) {
        const u = (x - tc) / 26;
        if (u < -0.75) veil(t, x, 40, 1, 132, 0.06, '255,230,200');
        else if (u < -0.35) veil(t, x, 40, 1, 132, 0.14, '255,230,200');
        else if (u > 0.15) veil(t, x, 40, 1, 132, Math.min(0.55, 0.12 + (u - 0.15) * 0.6), '40,20,36');
      }
      for (let x = tc - 30; x < tc + 30; x++) R(t, x, 146, 1, 1, shadowOf(AD, 0.45)); // le talus
    });
    merlons(g, tc - 26, tc + 26, 40, AD, 9);
    cornice(g, tc - 25, 38, 50, ADL, AD, 2);
    for (const [lx, ly] of [[146, 64], [164, 98], [138, 120]]) { R(g, lx - 1, ly - 1, 4, 13, OUT); R(g, lx, ly, 2, 11, '#120a0c'); S.disc(g, lx + 1, ly + 12, 2, OUT); }
    O(g, BRAZIER[0] - 5, BRAZIER[1] + 4, [[0, 0, 10, 4, '#2a2626'], [3, 4, 4, 5, '#2a2626']]); // la corbeille du brasero

    // ---- la tour carrée de droite
    wall(g, 520, 34, 46, 136, 15, { peel: 4 });
    veil(g, 556, 34, 10, 136, 0.32);
    merlons(g, 520, 566, 34, AD, 9);
    cornice(g, 519, 32, 48, ADL, AD, 2);
    for (const [lx, ly] of [[534, 52], [548, 88], [536, 126]]) { R(g, lx - 1, ly - 1, 4, 13, OUT); R(g, lx, ly, 2, 11, '#120a0c'); }
    grille(g, 530, 66, 12, 14, AD);
    for (let y = 40; y < 168; y += 10) { tezontle(g, 520, y, 5, 9, TZ, y); tezontle(g, 561, y + 5, 5, 9, TZ, y + 1); } // chaînes d'angle

    // ---- le logis du maître au-dessus du portail
    wall(g, 262, 44, 136, BASE - 44, 16, { peel: 5 });
    merlons(g, 262, 398, 44, AD);
    // le fronton du faîte et sa hampe
    O(g, 314, 44, [[0, -11, 32, 11, AD]]);
    R(g, 314, 33, 32, 1, ADL); R(g, 344, 33, 2, 11, shadowOf(AD, 0.35));
    cornice(g, 260, 42, 140, ADL, AD, 2);
    skull(g, 330, 32, '#e0d0b0', '#5a1a14');
    for (const vx of [268, 290, 306, 352, 370, 392]) viga(g, vx, 48, AD);
    // chaînes d'angle de tezontle
    for (let y = 40; y < 168; y += 10) { tezontle(g, 262, y, 6, 9, TZ, y + 7); tezontle(g, 392, y + 5, 6, 9, TZ, y + 9); }
    // l'étage : trois portes-fenêtres à volets sur le balcon de fer forgé
    for (const wx of [284, 322, 360]) {
      opening(g, wx, 78, 16, 27, { fill: '#1a0e10', wall: AD, ring: 2, ringCol: TZL });
      for (const sx of [wx - 6, wx + 17]) { O(g, sx, 53, [[0, 0, 5, 25, '#3a2a24']]); for (let yy = 55; yy < 77; yy += 2) R(g, sx, yy, 5, 1, '#2a1c18'); R(g, sx, 53, 1, 25, '#5a4234'); }
    }
    O(g, 274, 78, [[0, 0, 112, 3, TZ]]); R(g, 274, 78, 112, 1, TZL);
    for (let k = 0; k < 8; k++) { const cx = 278 + k * 15; O(g, cx, 81, [[0, 0, 4, 3, TZ], [1, 3, 2, 2, TZ]]); }
    veil(g, 274, 82, 112, 3, 0.28);
    R(g, 274, 63, 112, 1, '#2a2626'); R(g, 274, 64, 112, 1, '#5a5452');
    for (let x = 275; x < 386; x += 3) { R(g, x, 65, 1, 13, '#2a2626'); if (x % 6 === 2) { R(g, x - 1, 70, 3, 1, '#2a2626'); R(g, x, 69, 1, 1, '#5a5452'); } }
    // bannières d'El Diablo
    banner(g, 266, 52, 14, 72); banner(g, 380, 52, 14, 72);
    // pilastres de tezontle et cartouche au crâne au-dessus du portail
    for (const px of [292, 360]) { O(g, px, BASE, [[0, -78, 8, 78, TZ]]); tezontle(g, px, BASE - 78, 8, 78, TZ, px); R(g, px, BASE - 78, 1, 78, TZL); stone(g, px - 1, BASE - 82, 10, 4, TZL); }
    cornice(g, 288, 84, 84, TZL, AD, 2);
    O(g, 318, 102, [[0, -14, 24, 14, TZ]]); tezontle(g, 318, 88, 24, 14, TZ, 3);
    skull(g, 330, 89, '#d8c8a8', '#c0392b');

    // ---- le portail : passage voûté, vantaux ouverts, le patio éclairé au fond
    const [gx, gw, gh] = GATE;
    const gRows = opening(g, gx, BASE, gw, gh, { fill: '#160c0c', wall: AD, ring: 5, ringCol: TZ, reveal: 0 });
    for (const [y, a, b] of archRows(gx - 5, BASE, gw + 10, gh + 5)) if (y % 3 === 0) R(g, a + 1, y, 1, 1, TZL);
    tezontle(g, gx - 5, BASE - gh + gw / 2, 5, gh - gw / 2, TZ, 9); tezontle(g, gx + gw, BASE - gh + gw / 2, 5, gh - gw / 2, TZ, 10);
    // la voûte du passage qui s'enfonce : arcs successifs plus petits
    for (const [inset, col] of [[6, '#1e1210'], [12, '#26160e'], [17, '#2e1a10']]) {
      const ir = archRows(gx + inset, BASE - inset * 0.5, gw - inset * 2, gh - inset * 1.4);
      fillRows(g, ir, col);
    }
    // le patio au fond, éclairé de torches : sol, arcades, fontaine
    const px0 = gx + 20, pw = gw - 40;
    R(g, px0, BASE - 40, pw, 32, '#5a3020');
    R(g, px0, BASE - 14, pw, 6, '#a8603a'); R(g, px0, BASE - 15, pw, 1, '#d88a4a');
    R(g, px0 + 3, BASE - 38, 3, 24, '#3a2014'); R(g, px0 + pw - 6, BASE - 38, 3, 24, '#3a2014');
    O(g, px0 + pw / 2 - 4, BASE - 13, [[0, -6, 8, 6, '#8a6a5a'], [3, -11, 2, 5, '#8a6a5a']]);
    R(g, px0 + pw / 2 - 4, BASE - 19, 8, 1, '#c8a080');
    R(g, gx + 6, BASE - 8, gw - 12, 8, '#2a1812'); // le sol du passage
    for (let k = 0; k < 4; k++) R(g, gx + 8 + k * 3, BASE - 6 + k * 2, gw - 16 - k * 6, 1, '#3a2418');
    // les vantaux ouverts, rabattus contre les murs du passage
    for (const [vx, dir] of [[gx + 1, 1], [gx + gw - 9, -1]]) {
      const vr = [];
      for (let y = BASE - gh + 18; y < BASE; y++) vr.push([y, vx, vx + 8]);
      door(g, vr, { col: '#3a2216', split: false });
      R(g, dir > 0 ? vx + 7 : vx, BASE - gh + 18, 1, gh - 18, '#140a08');
    }
    for (const [tx, ty] of TORCH) sconce(g, tx, ty + 2, AD);

    // ---- abords : rocs noirs, arbre mort, pavés de tezontle devant le portail
    // rocs de basalte : blocs anguleux, arête éclairée, face droite dans l'ombre, bulles de lave
    for (const [x, ww, hh, seed] of [[4, 36, 24, 1], [102, 26, 14, 2], [586, 42, 28, 3], [648, 30, 17, 4]]) {
      const rr = rnd(seed * 7), cols = [];
      const peak = 0.3 + rr() * 0.3;
      for (let i = 0; i < ww; i++) {
        const u = i / ww, f = u < peak ? u / peak : (1 - u) / (1 - peak);
        cols.push([x + i, Math.round(176 - hh * Math.min(1, 0.35 + f * 0.8) - (rr() < 0.2 ? 1 : 0))]);
      }
      const rows = colRows(cols, 177);
      outlineRows(g, rows);
      fillRows(g, rows, '#2a2226');
      for (const [y, a, b] of rows) { const m = Math.round(x + ww * peak); if (m < b) R(g, Math.max(a, m), y, b - Math.max(a, m), 1, '#1c1418'); }
      cols.forEach(([cx, ty], i) => { if (i < ww * peak) R(g, cx, ty, 1, 2, '#5a4448'); else R(g, cx, ty, 1, 1, '#3a2e32'); });
      for (let k = 0; k < ww / 3; k++) R(g, x + 2 + Math.floor(rr() * (ww - 4)), 176 - Math.floor(rr() * hh * 0.6), 1, 1, '#463a3e');
    }
    deadTree(g, 52, 176, 74, '#2e2220', 6);
    agave(g, 120, 178, 1, '#5a6a5a'); agave(g, 552, 180, 1.1, '#5a6a5a');
    for (let y = BASE; y < H; y++) {
      const k = (y - BASE) / (H - BASE);
      const a = Math.round(gx - 4 - k * 52), b = Math.round(gx + gw + 4 + k * 52);
      R(g, a, y, b - a, 1, '#3a2c2a');
      const row = Math.floor((y - BASE) / 3), sz = 5 + Math.floor(k * 4);
      if ((y - BASE) % 3 === 2) R(g, a, y, b - a, 1, '#1e1616');
      else for (let x = a + ((row % 2) * Math.floor(sz / 2)); x < b; x += sz) { R(g, x, y, 1, 1, '#1e1616'); if ((y - BASE) % 3 === 0) R(g, x + 1, y, sz - 2, 1, hash3(x, row) ? '#5a3a34' : '#4a3a38'); }
    }
    R(g, 262, BASE, 136, 1, '#1a1214');
    scatter(g, 0, 172, w, 42, 60, 9, ['#5a4a40', '#3a2c28', '#6a5a50']);
  },
  // fenêtres éclairées la nuit : loggia, grilles, portes-fenêtres du balcon, le patio au fond du portail
  lights() {
    return [[411, 88, 16, 20], [438, 88, 16, 20], [465, 88, 16, 20], [492, 88, 16, 20], [193, 85, 10, 15], [225, 85, 10, 15],
      [285, 58, 14, 19], [323, 58, 14, 19], [361, 58, 14, 19], [322, 128, 16, 26], [531, 67, 10, 12]];
  },
  anim(ctx, t, fx) {
    // les drapeaux d'El Diablo qui claquent sur les hampes
    for (const [x, y] of FLAGS) {
      R(ctx, x - 1, y, 2, 24, OUT); R(ctx, x, y, 1, 24, '#8a8a92');
      for (let c = 0; c < 18; c++) {
        const dy = Math.round(Math.sin(t / 150 - c / 2.6 + x) * 1.4 * (c / 18 + 0.3));
        R(ctx, x + 1 + c, y + 1 + dy, 1, 11, c > 15 ? '#9a2a1c' : '#1e1416');
        if (c === 0 || c === 17) R(ctx, x + 1 + c, y + 1 + dy, 1, 11, OUT);
      }
      const sx = x + 7, sy = y + 4 + Math.round(Math.sin(t / 150 - 3 + x) * 1.2);
      R(ctx, sx, sy, 5, 3, '#e0d0b0'); R(ctx, sx + 1, sy + 3, 3, 2, '#e0d0b0'); R(ctx, sx - 1, sy - 2, 1, 2, '#e0d0b0'); R(ctx, sx + 5, sy - 2, 1, 2, '#e0d0b0');
      R(ctx, sx + 1, sy + 1, 1, 1, '#9a1a10'); R(ctx, sx + 3, sy + 1, 1, 1, '#9a1a10');
    }
    // fumerolles du cratère (calque lointain : on compense la caméra) et vautours qui tournent
    const m = ctx.getTransform(), cam = m.a ? -m.e / m.a : 0;
    const vx = 231 + cam * 0.88;
    smoke(ctx, vx, 19, t, { n: 6, life: 5200, rise: 0.006, drift: 0.012, r0: 3, grow: 0.002, col: '74,58,64', a: 0.75 });
    for (let k = 0; k < 2; k++) {
      const a = t / (2600 + k * 700) + k * 2.4;
      S.vulture(ctx, Math.round(vx - 60 + k * 90 + Math.cos(a) * 26), Math.round(58 + k * 10 + Math.sin(a) * 7), t + k * 130);
    }
  },
  // flammes vives même la nuit (non teintées) : torches du portail, brasero de la tour ronde
  light(ctx, t) {
    for (const [tx, ty] of TORCH) flames(ctx, tx - 3, ty, 10, 15, t, tx);
    flames(ctx, BRAZIER[0] - 6, BRAZIER[1] + 4, 12, 13, t, 7);
  },
  glow(ctx, t, fx, cam) {
    for (const [tx, ty] of TORCH) halo(ctx, tx + 2, ty - 6, 40, '255,120,40', 1 + 0.2 * Math.sin(t / 70 + tx));
    halo(ctx, BRAZIER[0], BRAZIER[1] - 2, 34, '255,120,40', 0.9 + 0.2 * Math.sin(t / 90));
    halo(ctx, 330, BASE - 30, 26, '255,140,60', 0.55);
    halo(ctx, 231 + cam * 0.88, 36, 110, '255,70,30', 0.9 + 0.15 * Math.sin(t / 600));
    halo(ctx, 231 + cam * 0.88, 24, 30, '255,150,60', 0.9);
  },
};
function hash3(x, y) { return ((x * 73856093) ^ (y * 19349663)) % 7 < 3; }
