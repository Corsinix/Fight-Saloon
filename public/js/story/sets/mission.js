// La mission San Rosario : église à façade baroque (retable de pierre ocre, pignon à volutes, porte cloutée),
// campanile à cloche, dôme, couvent à arcades, cimetière aux croix de bois, enceinte et puits. Crépi à la chaux
// taché et écaillé sur l'adobe (d'après San Xavier del Bac, Tumacácori, San Miguel, San José).
import * as S from '../../sprites.js';
import { H } from '../../worlds.js';
import { OUT, R, O, rnd, woodCross, tombstone, farMesas, lantern } from './kit.js';
import {
  shadowOf, blob, fillRows, outlineRows, archRows, colRows, masked, veil, veilRows, skew, plaster, bricks, peel, stone, cornice,
  tiles, viga, opening, door, grille, shutters, agave, pricklyPear, ocotillo, scatter, ground,
} from './kit-adobe.js';

const sh = S.shade;
const WH = '#eadfc8', WHL = '#f6eedc', RET = '#dab48e', RETL = '#ecc9a2', CW = '#e4d2b4', BRICK = '#b48a68', WOOD = '#6a4428';
const CX = 215, BASE = 166; // axe et pied de la façade
const BELL = [130, 53]; // la cloche du campanile

// Profil du pignon à volutes (haut de la silhouette pour chaque colonne)
function gableTop(x) {
  // sommet plat, épaulement, grande courbe concave, volute bombée, chute sur la corniche
  const u = Math.abs(x - CX);
  if (u <= 8) return 34;
  if (u <= 11) return 39;
  if (u <= 26) return Math.round(39 + 15 * Math.sin(((u - 11) / 15) * (Math.PI / 2)));
  if (u <= 33) return 54;
  if (u <= 43) return Math.round(54 - 5 * Math.sin(((u - 33) / 10) * Math.PI));
  if (u <= 47) return 54 + (u - 43) * 2;
  return 62;
}

// Petite maison d'adobe lointaine (toit plat, vigas, porte sombre)
function hut(g, x, base, w, h, col, seed) {
  O(g, x, base, [[0, -h, w, h, col]]);
  plaster(g, x, base - h, w, h, col, { seed, peel: 0, grime: 3, streak: 0.5, mottle: 0.6 });
  R(g, x - 1, base - h - 2, w + 2, 2, sh(col, 0.12));
  for (let vx = x + 3; vx < x + w - 2; vx += 6) R(g, vx, base - h + 2, 2, 1, '#5a3a22');
  R(g, x + Math.round(w * 0.3), base - 8, 4, 8, '#3a2a24');
  R(g, x + w - 1, base - h, 1, h, shadowOf(col, 0.3));
}

export default {
  w: 540, horizon: 132, ground: 186, outdoor: true,
  far: [
    { k: 0.12, draw(g, w) {
      // la sierra au loin, bleutée par la distance
      const r = rnd(5);
      let y = 112;
      for (let x = 0; x < w; x++) {
        y = Math.max(96, Math.min(124, y + (r() - 0.5) * 3 + Math.sin(x / 37) * 0.6));
        R(g, x, Math.round(y), 1, 133 - Math.round(y), '#b49a96');
        R(g, x, Math.round(y), 1, 1, '#c8b0a4');
        if (Math.sin(x / 11) > 0.6) R(g, x, Math.round(y) + 3, 1, 8, '#a68c8c');
      }
    } },
    { k: 0.3, draw: (g, w) => farMesas(g, w, 133, ['#c09a82', '#b08a74'], 29) },
  ],
  back(g, w) {
    ground(g, 0, 132, w, H - 132, ['#c8a070', '#d0aa7a', '#d8b484', '#e0be8e'], 61);
    // le village lointain
    for (const [x, ww, hh, s] of [[4, 22, 11, 1], [30, 16, 8, 2], [506, 24, 16, 3]]) hut(g, x, x > 400 ? 138 : 142, ww, hh, '#d8bf98', s);

    // ---- le dôme, derrière la façade
    const dx = 274;
    O(g, dx - 15, 64, [[0, -12, 30, 12, WH]]);
    plaster(g, dx - 15, 52, 30, 12, WH, { seed: 9, peel: 0, grime: 0, streak: 0.4 });
    for (const wx of [dx - 9, dx + 5]) { R(g, wx, 55, 4, 6, OUT); R(g, wx + 1, 56, 2, 5, '#3a2a30'); }
    const dome = [];
    for (let y = 37; y < 52; y++) { const half = Math.round(Math.sqrt(Math.max(0, 16 * 16 - ((52 - y) * 16 / 15) ** 2))); dome.push([y, dx - half, dx + half]); }
    outlineRows(g, dome);
    fillRows(g, dome, WH);
    fillRows(g, dome.map(([y, a, b]) => [y, a, Math.round(a + (b - a) * 0.4)]), WHL);
    fillRows(g, dome.map(([y, a, b]) => [y, Math.round(a + (b - a) * 0.78), b]), shadowOf(WH, 0.3));
    for (const k of [-8, 0, 8]) for (let y = 40; y < 52; y++) R(g, dx + Math.round(k * Math.sqrt((y - 36) / 16)), y, 1, 1, shadowOf(WH, 0.18));
    O(g, dx - 3, 37, [[0, -6, 6, 6, WH]]); R(g, dx - 1, 33, 2, 3, '#3a2a30');
    woodCross(g, dx, 31, 9, '#4a3a30');

    // ---- le couvent : étage, vigas, toit de tuiles, arcades sur la cour
    const c0 = 280, c1 = 470;
    R(g, c0, 61, c1 - c0 + 1, 44, OUT);
    plaster(g, c0, 62, c1 - c0, 42, CW, { seed: 21, peel: 4, grime: 0, streak: 1.2, brick: BRICK });
    R(g, c0, 62, c1 - c0, 2, sh(CW, 0.12));
    for (let vx = c0 + 6; vx < c1 - 4; vx += 14) viga(g, vx, 66, CW);
    for (const wx of [306, 362, 418]) shutters(g, wx, 74, 10, 13, '#5a6a5e', CW);
    tiles(g, c0 - 2, 90, c1 - c0 + 4, 8, '#b4583a', 4);
    R(g, c0, 100, c1 - c0, 1, OUT);
    plaster(g, c0, 101, c1 - c0, BASE - 101, CW, { seed: 22, peel: 3, grime: 9, streak: 0.6, brick: BRICK });
    R(g, c0, 101, c1 - c0, 1, shadowOf(CW, 0.35)); R(g, c0, 102, c1 - c0, 1, shadowOf(CW, 0.2)); // ombre du toit
    for (let i = 0; i < 5; i++) {
      const ax = 290 + i * 36;
      const rows = opening(g, ax, BASE, 26, 62, { fill: '#5a4a52', wall: CW, reveal: 2 });
      // sous le portique : le mur du fond à l'ombre, une porte, une jarre suspendue, un banc
      fillRows(g, rows.slice(0, 16), '#4a3a44');
      if (i % 2 === 0) { R(g, ax + 8, BASE - 30, 10, 30, '#2e2226'); R(g, ax + 8, BASE - 30, 10, 1, '#3e3036'); }
      if (i === 1) { R(g, ax + 13, 124, 1, 8, '#2a2226'); S.disc(g, ax + 13, 136, 4, '#8a4a2c'); R(g, ax + 11, 133, 2, 2, '#a8603a'); }
      if (i === 2) { R(g, ax + 13, 116, 1, 4, OUT); lantern(g, ax + 13, 120); }
      if (i === 3) { R(g, ax + 4, BASE - 9, 18, 2, '#3a2820'); R(g, ax + 5, BASE - 7, 2, 7, '#2a1c18'); R(g, ax + 19, BASE - 7, 2, 7, '#2a1c18'); }
      R(g, ax, BASE - 2, 26, 2, '#7a6a6a'); // le sol dallé du portique
      // impostes et socles des piliers
      for (const px of [ax - 10, ax + 26]) { R(g, px, 117, 10, 1, sh(CW, 0.15)); R(g, px, 118, 10, 1, shadowOf(CW, 0.3)); R(g, px, BASE - 6, 10, 6, sh(CW, -0.12)); }
    }
    R(g, c1, 62, 1, BASE - 62, shadowOf(CW, 0.4));
    skew(g, c1 + 1, BASE, 16, 5, 1.6, 'rgba(60,36,40,0.22)');

    // ---- le cimetière : croix derrière le mur, mur d'adobe usé, portail
    for (const [x, h, col] of [[10, 24, '#7a5a3a'], [28, 20, '#8a6a48'], [46, 27, '#6a4a30'], [92, 19, '#7a5a3a']]) woodCross(g, x, 154, h, col);
    const r = rnd(77);
    let top = 147;
    const wallRows = [];
    for (let x = 0; x < 104; x++) {
      if (x >= 62 && x < 80) continue;
      top = Math.max(143, Math.min(150, top + (r() - 0.5) * 1.6));
      wallRows.push([x, Math.round(top)]);
    }
    const wRows = colRows(wallRows, BASE);
    outlineRows(g, wRows);
    masked(g, 0, 140, 104, 27, wRows, (t) => {
      bricks(t, 0, 140, 104, 27, '#a8784e');
      plaster(t, 0, 140, 104, 27, '#d8c6a6', { seed: 5, peel: 5, grime: 6, brick: '#a8784e', streak: 0.8 });
      for (let x = 2; x < 100; x += 23) peel(t, r, x + 8, 150 + (x % 5), 5, 3, '#d8c6a6', '#a8784e');
    });
    for (const [x, t] of wallRows) R(g, x, t, 1, 1, '#ecdcbc');
    // les deux piliers du portail, un chapiteau et une croix de fer
    for (const px of [58, 80]) {
      O(g, px, BASE, [[0, -28, 6, 28, '#d8c6a6'], [-1, -31, 8, 3, '#e8dabc']]);
      R(g, px + 5, BASE - 28, 1, 28, shadowOf('#d8c6a6', 0.3));
      peel(g, r, px + 3, BASE - 14, 2, 3, '#d8c6a6', '#a8784e');
    }
    R(g, 61, 128, 1, 7, '#2a2626'); R(g, 59, 130, 5, 1, '#2a2626');
    for (const [x, base, w, h] of [[22, 176, 20, 4], [48, 172, 16, 3], [94, 178, 18, 4]]) {
      const mound = blob(rnd(x), x, base - h / 2, w / 2, h / 2);
      outlineRows(g, mound); fillRows(g, mound, '#b08a5c'); fillRows(g, mound.slice(0, 2), '#c8a06c');
    }
    woodCross(g, 16, 174, 13, '#8a6a48'); tombstone(g, 50, 170, 9, 11, '#a8a090'); woodCross(g, 101, 176, 12, '#6a4a30');
    ocotillo(g, 108, 170, 30);

    // ---- le campanile (en avant de la façade : il lui fait de l'ombre)
    R(g, 109, 75, 42, 94, OUT);
    plaster(g, 110, 76, 40, 92, WH, { seed: 31, peel: 6, grime: 11, brick: BRICK, streak: 1.3 });
    peel(g, rnd(304), 120, 152, 7, 8, WH, BRICK);
    for (let y = 78; y < 166; y += 9) { stone(g, 110, y, 4, 8, sh(WH, -0.04)); stone(g, 146, y + 4, 4, 8, sh(WH, -0.08)); } // chaînes d'angle
    R(g, 149, 76, 1, 92, shadowOf(WH, 0.35));
    grille(g, 125, 104, 10, 13, WH);
    R(g, 128, 136, 4, 10, OUT); R(g, 129, 137, 2, 8, '#2a1e22'); // meurtrière
    cornice(g, 108, 72, 44, WHL, WH);
    R(g, 113, 43, 34, 30, OUT);
    plaster(g, 114, 44, 32, 28, WH, { seed: 32, peel: 1, grime: 0, streak: 1 });
    opening(g, 121, 72, 18, 27, { fill: '#2e2228', wall: WH, ring: 2, ringCol: RETL });
    R(g, 121, 50, 18, 2, WOOD); R(g, 121, 50, 18, 1, '#8a6040'); // la poutre de la cloche
    for (const px of [114, 143]) stone(g, px, 44, 3, 28, WHL);
    cornice(g, 111, 40, 38, WHL, WH, 2);
    const cup = [];
    for (let y = 26; y < 40; y++) { const half = Math.round(Math.sqrt(Math.max(0, 144 - ((40 - y) * 12 / 14) ** 2))); cup.push([y, 130 - half, 130 + half]); }
    outlineRows(g, cup); fillRows(g, cup, WH);
    fillRows(g, cup.map(([y, a, b]) => [y, a, Math.round(a + (b - a) * 0.35)]), WHL);
    fillRows(g, cup.map(([y, a, b]) => [y, Math.round(a + (b - a) * 0.75), b]), shadowOf(WH, 0.3));
    O(g, 127, 26, [[0, -6, 6, 6, WH]]); R(g, 129, 22, 2, 3, '#2e2228');
    woodCross(g, 130, 20, 13, '#3a3030');

    // ---- la façade de l'église
    const fRows = [];
    for (let y = 34; y < BASE; y++) {
      const xs = [];
      for (let x = 150; x < 280; x++) if (y >= (x < 167 || x > 263 ? 62 : gableTop(x))) xs.push(x);
      if (xs.length) fRows.push([y, xs[0], xs[xs.length - 1] + 1]);
    }
    outlineRows(g, fRows);
    masked(g, 150, 30, 130, BASE - 30, fRows, (t) => {
      plaster(t, 150, 30, 130, BASE - 30, WH, { seed: 3, peel: 5, grime: 12, brick: BRICK, streak: 1.1 });
      // grandes plaques tombées au pied des murs (là où l'humidité remonte)
      const pr = rnd(303);
      peel(t, pr, 161, 146, 7, 9, WH, BRICK); peel(t, pr, 266, 132, 6, 8, WH, BRICK); peel(t, pr, 170, 92, 4, 3, WH, BRICK);
      // le retable de pierre ocre autour de la porte
      R(t, 177, 63, 76, BASE - 63, OUT);
      plaster(t, 178, 64, 74, BASE - 64, RET, { seed: 4, peel: 1, grime: 8, brick: BRICK, streak: 0.6, mottle: 1.4 });
    });
    // le haut du pignon : listel et chaperon
    for (const [y, a, b] of fRows) { if (y < 62) { R(g, a, y, 1, 1, WHL); R(g, b - 1, y, 1, 1, shadowOf(WH, 0.3)); } }
    for (let x = 167; x <= 263; x++) R(g, x, gableTop(x), 1, 1, WHL);
    cornice(g, 148, 60, 134, WHL, WH);
    // volutes du pignon
    for (const vx of [CX - 38, CX + 38]) {
      S.disc(g, vx, 53, 3, OUT); S.disc(g, vx, 53, 2, WHL); S.disc(g, vx, 53, 1, shadowOf(WH, 0.35)); R(g, vx, 53, 1, 1, WH);
      R(g, vx - 1, 51, 1, 1, '#fffaf0');
    }
    // niche du pignon et sa statue, croix de faîte
    const niche = archRows(CX - 4, 54, 8, 14);
    outlineRows(g, niche); fillRows(g, niche, '#5a4440');
    O(g, CX - 1, 53, [[0, -9, 3, 9, '#e8dcc0']]); R(g, CX - 1, 44, 3, 2, '#c8a888');
    woodCross(g, CX, 34, 15, '#3a3030');
    // pinacles aux angles de la corniche
    for (const px of [153, 277]) {
      O(g, px - 3, 60, [[0, -3, 6, 3, WHL], [1, -8, 4, 5, WH], [2, -11, 2, 3, WHL]]);
      R(g, px + 1, 52, 1, 5, shadowOf(WH, 0.3));
    }
    // ombre du campanile sur la façade
    const sRows = [];
    for (let y = 63; y < BASE; y++) sRows.push([y, 150, 150 + Math.min(9, Math.max(0, Math.round((y - 63) * 0.9)))]);
    veilRows(g, sRows, 0.28);
    // pilastres, entablement, niches à statues
    for (const px of [180, 242]) {
      stone(g, px - 1, BASE - 8, 10, 8, sh(RET, -0.06));
      stone(g, px, 90, 8, BASE - 98, RETL);
      R(g, px + 3, 92, 1, BASE - 102, sh(RET, -0.04)); R(g, px + 5, 92, 1, BASE - 102, sh(RET, -0.04)); // cannelures
      stone(g, px - 1, 86, 10, 4, RETL);
      R(g, px + 8, 90, 2, BASE - 98, shadowOf(RET, 0.3));
    }
    cornice(g, 176, 82, 78, RETL, RET);
    for (const px of [186, 238]) { stone(g, px, 66, 6, 16, RETL); R(g, px + 6, 66, 1, 16, shadowOf(RET, 0.3)); }
    for (const nx of [191, 231]) {
      const nr = archRows(nx, 140, 8, 20);
      outlineRows(g, nr); fillRows(g, nr, '#5a4036');
      O(g, nx + 2, 139, [[0, -12, 4, 12, '#ece0c4']]); R(g, nx + 2, 125, 4, 3, '#c89878'); R(g, nx + 2, 130, 1, 9, '#fff6e0');
      R(g, nx - 1, 141, 10, 2, RETL); R(g, nx - 1, 143, 10, 1, shadowOf(RET, 0.35));
    }
    // la fenêtre du chœur, en étoile
    const star = [];
    for (let y = -6; y <= 6; y++) { const hw = 6 - Math.max(0, Math.abs(y) - 3); star.push([74 + y, CX - hw, CX + hw + 1]); }
    outlineRows(g, star); fillRows(g, star, RETL);
    const inner = star.slice(1, -1).map(([y, a, b]) => [y, a + 1, b - 1]);
    fillRows(g, inner, '#3a3040');
    R(g, CX, 69, 1, 11, '#7a6040'); R(g, CX - 4, 74, 9, 1, '#7a6040');
    // coquille sculptée sous la corniche
    for (let k = -3; k <= 3; k++) R(g, CX + k * 2, 64 + Math.abs(k) / 2, 1, 4 - Math.abs(k) / 2, shadowOf(RET, 0.25));
    // la porte cloutée dans son arc de claveaux, le seuil et les marches
    opening(g, 202, BASE, 26, 68, { fill: '#2a1a16', wall: RET, ring: 3, ringCol: RETL, reveal: 2 });
    door(g, archRows(204, BASE, 22, 66), { col: WOOD });
    R(g, CX - 1, BASE - 66 - 4, 3, 4, RETL); R(g, CX - 1, BASE - 66 - 4, 3, 1, '#fff2d8'); // clé de voûte
    stone(g, 196, BASE, 38, 3, '#cab494'); stone(g, 192, BASE + 3, 46, 3, '#c0aa8a');
    R(g, 150, BASE, 130, 1, shadowOf('#d8b484', 0.3));

    // ---- l'enceinte de briques nues, le puits
    const e0 = 470, er = rnd(131), eCols = [];
    let cut = 136;
    for (let x = e0; x < w; x++) { cut = Math.max(132, Math.min(141, cut + (er() - 0.5) * 2)); eCols.push([x, Math.round(cut)]); }
    const eRows = colRows(eCols, BASE);
    outlineRows(g, eRows);
    masked(g, e0, 128, w - e0, BASE - 128, eRows, (t) => {
      bricks(t, e0, 128, w - e0, BASE - 128, BRICK);
      plaster(t, e0 + 4, 146, 30, 16, '#dcc8a6', { seed: 41, peel: 2, grime: 0 });
      plaster(t, e0 + 40, 150, 26, 12, '#dcc8a6', { seed: 42, peel: 1, grime: 0 });
    });
    for (const [x, t] of eCols) R(g, x, t, 1, 1, sh(BRICK, 0.22));
    veil(g, e0, BASE - 5, w - e0, 5, 0.18);
    // le puits : margelle de pierres, montants, poulie, seau
    const px0 = 496;
    O(g, px0 + 2, 132, [[0, 0, 3, 34, WOOD], [18, 0, 3, 34, WOOD], [-1, -3, 25, 3, WOOD]]);
    R(g, px0 + 2, 132, 1, 34, '#8a6040');
    S.disc(g, px0 + 12, 134, 2, OUT); R(g, px0 + 12, 134, 1, 1, '#8a8a92');
    R(g, px0 + 12, 136, 1, 18, '#c8b088');
    O(g, px0 + 10, 156, [[0, 0, 5, 4, '#7a5a3a']]); R(g, px0 + 10, 156, 5, 1, '#5a5a62');
    O(g, px0 - 2, 178, [[0, -16, 30, 16, '#b8a888']]);
    for (let y = 163; y < 178; y += 4) for (let x = px0 - 2 + ((y / 4) % 2 ? 0 : 3); x < px0 + 28; x += 6) { R(g, x, y, 5, 3, '#c8b898'); R(g, x, y + 3, 6, 1, '#8a7a62'); R(g, x, y, 5, 1, '#dcccb0'); }
    R(g, px0 - 2, 162, 30, 2, '#9a8a6c'); R(g, px0 + 25, 163, 3, 15, shadowOf('#b8a888', 0.3));
    skew(g, px0 + 28, 178, 8, 4, 1.5, 'rgba(60,36,40,0.25)');

    // ---- la cour : allée de terre battue devant l'église, cailloux, plantes
    for (let y = BASE + 6; y < H; y++) {
      const k = (y - BASE - 6) / (H - BASE - 6);
      const a = Math.round(194 - k * 26), b = Math.round(236 + k * 26);
      R(g, a, y, b - a, 1, (y % 3) ? '#e6c89a' : '#e0c090');
      R(g, a - 1, y, 1, 1, '#b8946a'); R(g, b, y, 1, 1, '#b8946a');
    }
    scatter(g, 0, 168, w, 46, 90, 7);
    agave(g, 298, 172, 1.1); agave(g, 162, 174, 0.8);
    pricklyPear(g, 474, 178); agave(g, 532, 180, 1.2);
    for (let x = 156; x < 278; x += 3) if (rnd(x)() < 0.5) R(g, x, BASE + 1, 2, 1, '#a88a5a');
  },
  lights() { return [[209, 69, 13, 11], [307, 75, 8, 11], [363, 75, 8, 11], [419, 75, 8, 11], [375, 124, 18]]; },
  props: [],
  anim(ctx, t) {
    // la cloche qui se balance dans le campanile
    const a = Math.sin(t / 380) * 0.5, [cx, cy] = BELL;
    const bx = Math.round(cx + Math.sin(a) * 3);
    R(ctx, cx - 1, cy - 2, 2, 3, OUT);
    O(ctx, bx - 4, cy, [[1, 0, 6, 2, '#c89a40'], [0, 2, 8, 6, '#c89a40'], [-1, 7, 10, 2, '#a07a28']]);
    R(ctx, bx - 3, cy + 2, 1, 5, '#f4d47a'); R(ctx, bx + 2, cy + 2, 1, 5, '#8a6a22');
    R(ctx, bx, cy + 9, 1, 1, '#5a4a2a');
  },
};
