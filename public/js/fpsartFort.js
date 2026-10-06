// Dessins de la carte « Fort » du FPS (fpsmaps/fort.js) : murs, sols et objets enregistrés dans les registres de
// fpsart.js (TX_WALLS / TX_VARS / TX_FLATS / PR_DECO). Chargé par fps.js.
// Même conventions que fpsart.js : textures 64x64 opaques (raccord gauche/droite, sols dans les deux sens), lumière
// d'en haut à gauche, ciel-clé #9fb8c8 (TW2_SEE) là où l'on voit au travers ; sprites à base au centre du bas.
import * as A from './fpsart.js';

const { TX_WALLS, TX_VARS, TX_FLATS, PR_DECO, TW2_SEE, memo, canvas, pen, rng, hash, clamp, grain, shade, mix, sprite, text } = A;
const { txField, txRGB, txK, txLerp, txNoise, txFbm, txWP, txPick, txSiding, txShutter, txWindowFrame, txWindowPane, txVBoards, txTimber, txBevel, txText, txTextW, txStencil, tw2Dim, tw2Grain } = A;
const { prRing, prPick, prLit, prCyl, prSpokeWheel, prGlow, prSheen, PR_WOOD, PR_IRON, PR_GOLD, PR_CREAM, PR_BURLAP, PR_GUN, PR_STONE, PR_STRAW, PR_RED, PR_LEATHER, PR_FIRE } = A;

// =================================================================== lisière : peupliers du ruisseau (bord de la carte)
// Une bande de 64 x 128 (lignes 0-63 : les cimes, au-dessus de 1 ; 64-127 : troncs et sous-bois, de 0 à 1) ;
// k : deux bandes différentes (deux variantes qui se suivent sans raccord visible : même lisière d'herbe en bas)
const FT_LEAF = ['#16220f', '#203016', '#2c401c', '#3c5424', '#506a2c', '#6a8436', '#8aa246', '#a8bc5c'];
const FT_FAR = ['#1c2a1e', '#243424', '#2e402a'];
const FT_BARK = ['#2a2420', '#3e3630', '#564c44', '#70665a', '#8e8274', '#aa9e8c'];
const FT_SAGE = ['#2e3628', '#46503a', '#5e6a4c', '#7a8660', '#96a276'];
const FT_GRASS = ['#4e5a2a', '#66723a', '#7e8a48', '#98a258', '#b4b86a'];
function ftTreeline(k) {
  return memo(`ftTreeline:${k}`, () => {
    const c = canvas(64, 128), r = rng(hash(`fortTrees:${k}`));
    const nz = txNoise(r, 4), nz2 = txNoise(r, 2), far = txFbm(r, [16, 8], [0.6, 0.4]);
    // trois peupliers par bande : tronc (x, penché), houppier fait de touffes ; plus des touffes basses entre eux
    const trunks = [], tufts = [];
    for (let i = 0; i < 3; i++) {
      const x = i * 21 + 4 + r() * 12, top = 30 + r() * 26, w = 4 + Math.floor(r() * 3), lean = (r() - 0.5) * 0.12;
      trunks.push({ x, top, w, lean });
      const n = 7 + Math.floor(r() * 4);
      for (let j = 0; j < n; j++) tufts.push({ x: x + (r() - 0.5) * 30, y: top - 18 + r() * 34, r: 7 + r() * 7, k: 0.9 + r() * 0.4 });
    }
    const bushes = Array.from({ length: 7 }, (_, j) => ({ x: j * 9.2 + r() * 6, y: 115 + r() * 6, r: 7 + r() * 5 })); // posés sur l'herbe
    const dens = (x, y) => {
      let v = 0;
      for (const t of tufts) for (const ox of [-64, 0, 64]) {
        const d2 = ((x - t.x - ox) ** 2 + ((y - t.y) * 1.25) ** 2) / (t.r * t.r);
        if (d2 < 1) v += (1 - d2) ** 2 * t.k;
      }
      return v + (nz(x, y) - 0.5) * 0.45;
    };
    const bush = (x, y) => {
      let v = 0;
      for (const b of bushes) for (const ox of [-64, 0, 64]) { const d2 = ((x - b.x - ox) ** 2 + ((y - b.y) * 1.6) ** 2) / (b.r * b.r); if (d2 < 1) v += 1 - d2; }
      return v + (nz2(x, y) - 0.5) * 0.4;
    };
    const blade = Array.from({ length: 64 }, () => 117 + Math.floor(r() * 8));
    const farTop = (x) => 34 + far(x, 0) * 22;
    txField(c, (x, y) => {
      // l'herbe au pied (même couleur que la prairie), brins de hauteurs inégales
      if (y >= blade[x]) return txK(txRGB(FT_GRASS[clamp(1 + ((x * 7 + y) % 3) - (y > 124 ? 1 : 0), 0, 4)]), 0.94 + nz2(x, y) * 0.12);
      // sauge et ronces du sous-bois, éclairées en haut à gauche
      const b = bush(x, y);
      if (b > 0.45 && y > 96) {
        const L = bush(x + 2, y + 2) - bush(x - 2, y - 2);
        return FT_SAGE[clamp(2 + Math.round(L * 1.6) + (nz2(x * 2, y * 2) > 0.6 ? 1 : 0), 0, 4)];
      }
      // feuillage : bord haut-gauche des touffes au soleil, creux à l'ombre, plus sombre en bas
      const d = dens(x, y);
      if (d > 0.42) {
        const L = dens(x + 2, y + 3) - dens(x - 2, y - 3);
        let i = 3 + Math.round(L * 2.2) + (nz2(x * 3, y * 3) > 0.62 ? 1 : 0) - (y > 70 ? 1 : 0) - (d < 0.55 ? 1 : 0);
        return FT_LEAF[clamp(i, 0, 7)];
      }
      // troncs gris à écorce crevassée (lumière à gauche)
      for (const t of trunks) {
        if (y < t.top) continue;
        const cx = t.x + (y - t.top) * t.lean, w = t.w + (y > 100 ? 1 : 0);
        for (const ox of [-64, 0, 64]) {
          const u = (x + 0.5 - (cx + ox - w / 2)) / w;
          if (u < 0 || u >= 1) continue;
          let i = Math.round(prLit(u) * 4);
          if (nz2(x * 4, y * 0.6) > 0.66) i--; // crevasses (longues, en long du tronc)
          return FT_BARK[clamp(i, 0, 5)];
        }
      }
      // derrière : le bois lointain, sombre (et le ciel au-dessus de lui, en haut)
      if (y >= farTop(x)) return FT_FAR[clamp(Math.floor(nz2(x, y) * 3) - (y > 90 ? 1 : 0), 0, 2)];
      return y < 64 ? TW2_SEE : FT_FAR[0];
    }, 0, 0, 64, 128);
    return c;
  });
}
// v0/v1 : sous-bois (de 0 à 1) ; v2/v3 : les cimes (au-dessus de 1, le ciel passe entre elles)
TX_WALLS.fortTrees = (p, rand, c, v) => { c.getContext('2d').drawImage(ftTreeline(v & 1), 0, v >= 2 ? 0 : -64); };
TX_VARS.fortTrees = 4;

// =================================================================== casernes : bardage blanchi à la chaux
// v0 : chaux fraîche ; v1 : délavée, écaillée ; v2/v3 : les mêmes sous l'avant-toit (façade, au-dessus de 1)
const FT_LIME = ['#dcd5c2', '#c6c0ae'];
TX_WALLS.fortBarracks = (p, rand, c, v) => {
  const b = v & 1, paint = FT_LIME[b];
  txSiding(p, rng(hash(`w:fortBarracks:${b}`)), c, paint, [12, 30][b]);
  const w = txWP(p);
  if (v < 2) {
    // sole goudronnée posée sur des moellons, éclaboussures de boue au pied
    p.R(0, 54, 64, 1, shade(paint, -0.5)); p.R(0, 55, 64, 3, '#4a3a2c'); p.R(0, 55, 64, 1, '#6e5a44'); p.R(0, 57, 64, 1, '#2e2218');
    for (let x = 0; x < 64; x += 16) {
      const s = shade('#8a8274', (rand() - 0.5) * 0.2);
      p.R(x, 58, 15, 6, s); p.R(x, 58, 15, 1, shade(s, 0.2)); p.R(x + 14, 58, 1, 6, shade(s, -0.4)); p.R(x, 63, 15, 1, shade(s, -0.3));
    }
    for (let i = 0; i < 14; i++) w.P(rand() * 64, 49 + rand() * 5, rand() < 0.5 ? '#8a7458' : '#a08a6a');
    return;
  }
  // avant-toit : planche de rive, abouts de chevrons, sous-face dans l'ombre portée sur le bardage
  const trim = '#ece6d6';
  p.R(0, 0, 64, 6, trim); p.R(0, 0, 64, 1, '#fffaf0'); p.R(0, 5, 64, 1, '#a8a294');
  p.R(0, 6, 64, 4, '#3a3028');
  for (let x = 2; x < 64; x += 8) { p.R(x, 6, 4, 4, '#8a7a62'); p.R(x, 6, 4, 1, '#b0a080'); p.R(x + 3, 7, 1, 3, '#4a3e30'); }
  tw2Dim(c, 0, 10, 64, 6, (x, y) => [0.55, 0.65, 0.75, 0.84, 0.9, 0.95][y - 10]);
};
TX_VARS.fortBarracks = 4;

// Fenêtre à guillotine de six carreaux, volets verts de l'armée (v : chaux fraîche / délavée)
TX_WALLS.fortBarracksWindow = (p, rand, c, v) => {
  TX_WALLS.fortBarracks(p, rng(hash(`w:fortBarracks:${v}`)), c, v);
  const green = ['#3e5a44', '#4a5e4a'][v], trim = '#ece6d6', ws = shade(FT_LIME[v], -0.45);
  for (const sx of [10, 45]) { txShutter(p, sx, 12, 9, 32, green); p.R(sx + 1, 44, 9, 1, ws); }
  txWindowFrame(p, 23, 15, 18, 26, trim, ws);
  txWindowPane(p, rand, 23, 15, 18, 26, trim, null);
  // six carreaux : un petit bois de plus au tiers, et la traverse de la guillotine plus épaisse
  for (const y of [23, 32]) { p.R(23, y, 18, 1, trim); p.R(23, y + 1, 18, 1, shade(trim, -0.35)); }
  p.R(23, 27, 8, 2, '#1a130f'); p.R(33, 27, 8, 2, '#1a130f'); // (la croisée du milieu cède la place aux tiers)
  p.P(19, 16, '#2a2a2a'); p.P(19, 38, '#2a2a2a'); p.P(44, 16, '#2a2a2a'); p.P(44, 38, '#2a2a2a');
};
TX_VARS.fortBarracksWindow = 2;

// =================================================================== enseignes peintes, accrochées au mur du bâtiment
// [mot, fond, lettres, mur derrière, variante du mur]
const FT_SIGNS = [
  ['SUTLER', '#2c4a34', '#ecdcb0', 'plank', 1], ['POWDER', '#8a1e14', '#f4ecd8', 'stone', 0], ['HDQRS', '#1e2c52', '#e8c860', 'plank', 2],
  ['GUARD', '#2a2420', '#e8dcc0', 'logs', 1], ['STORES', '#5a3a22', '#f0dca8', 'fortBarracks', 0], ['HOSPITAL', '#ece6d6', '#a42418', 'fortBarracks', 0],
  ['STABLES', '#7a5434', '#f2e6c8', 'fortStable', 0],
];
// Étoile à cinq branches de 5 px (ornement de l'état-major)
const ftStar = (R, x, y, col) => { R(x, y - 2, 1, 1, col); R(x - 2, y - 1, 5, 1, col); R(x - 1, y, 3, 1, col); R(x - 1, y + 1, 1, 1, col); R(x + 1, y + 1, 1, 1, col); };
// Panneau de bois peint (cadre en relief, filets, mot centré), ombre portée sur le mur ; x0, y0, w, h
function ftBoard(p, rand, word, board, ink, x0, y0, w, h, star = false) {
  p.R(x0 + 1, y0 + h, w - 1, 2, 'rgba(20,12,6,0.55)');
  p.R(x0, y0, w, h, shade(board, -0.45));
  txBevel(p, x0 + 1, y0 + 1, w - 2, h - 2, shade(board, 0.15), true, 0.3);
  p.R(x0 + 3, y0 + 3, w - 6, h - 6, board);
  p.R(x0 + 3, y0 + 3, w - 6, 1, shade(board, -0.35));
  for (let i = 0; i < 16; i++) p.R(x0 + 4 + rand() * (w - 10), y0 + 4 + Math.floor(rand() * (h - 8)), 2 + rand() * 6, 1, shade(board, rand() < 0.5 ? -0.12 : 0.08));
  const fil = mix(board, ink, 0.45);
  p.R(x0 + 5, y0 + 4, w - 10, 1, fil); p.R(x0 + 5, y0 + h - 5, w - 10, 1, fil);
  const fit = [[2, 2, false, 8], [2, 1, false, 6], [2, 1, true, 8], [1, 1, false, 8]].find(([a, b, n, m]) => txTextW(word, a, b, n) <= w - m);
  const [sz, lg, nar] = fit, tw = txTextW(word, sz, lg, nar);
  const tx = x0 + ((w - tw) >> 1), ty = y0 + ((h - 5 * sz) >> 1);
  txText(p.R, word, tx + 1, ty + 1, shade(board, -0.6), sz, lg, nar);
  txText(p.R, word, tx, ty, ink, sz, lg, nar);
  const gap = (w - 6 - tw) >> 1;
  if (gap >= 8) for (const ox of [x0 + 3 + (gap >> 1), x0 + w - 4 - (gap >> 1)]) {
    const oy = y0 + (h >> 1);
    if (star) ftStar(p.R, ox, oy, ink);
    else { p.P(ox, oy - 2, ink); p.R(ox - 1, oy - 1, 3, 1, ink); p.R(ox - 2, oy, 5, 1, ink); p.R(ox - 1, oy + 1, 3, 1, ink); p.P(ox, oy + 2, ink); }
  }
  for (let i = 0; i < 6; i++) { const ex = x0 + 3 + Math.floor(rand() * (w - 6)), ey = y0 + 3 + Math.floor(rand() * (h - 6)); p.R(ex, ey, 1 + Math.floor(rand() * 2), 1, shade(board, -0.25)); }
  for (const [nx, ny] of [[x0 + 1, y0 + 1], [x0 + w - 2, y0 + 1], [x0 + 1, y0 + h - 2], [x0 + w - 2, y0 + h - 2]]) p.P(nx, ny, '#2a2420');
}
TX_WALLS.fortSign = (p, rand, c, v) => {
  const [word, board, ink, base, bv] = FT_SIGNS[v];
  TX_WALLS[base](p, rng(hash(`w:${base}:${bv}`)), c, bv);
  ftBoard(p, rand, word, board, ink, 1, 15, 62, 22, word === 'HDQRS');
  if (word === 'HOSPITAL') { p.R(29, 10, 6, 2, '#a42418'); p.R(31, 8, 2, 6, '#a42418'); } // la croix au-dessus
};
TX_VARS.fortSign = FT_SIGNS.length;

// =================================================================== la grande porte : « FORT DEFIANCE » sur trois cases
// Au-dessus de 1 sur la poutre de la porte (on n'en voit que les lignes 0-35 : linteau à 1,45) : les pointes de la
// palissade (logs v0, même graine), et en travers le panneau, pendu à deux chaînes ; v = case (gauche, milieu, droite)
function ftGateBoard() {
  return memo('ftGateBoard', () => {
    const c = canvas(192, 26), p = pen(c), r = rng(hash('fortGate'));
    const wood = '#6a4a2c', W = 186, x0 = 3;
    p.R(x0 - 1, 0, W + 2, 26, '#2a1a0e');
    for (let b = 0; b < 3; b++) {
      const y = 1 + b * 8, col = shade(wood, (r() - 0.5) * 0.16);
      p.R(x0, y, W, 8, col); p.R(x0, y, W, 1, shade(col, 0.22)); p.R(x0, y + 7, W, 1, shade(col, -0.4));
      for (let i = 0; i < 26; i++) p.R(x0 + r() * W, y + 2 + Math.floor(r() * 4), 4 + r() * 14, 1, shade(col, r() < 0.5 ? -0.14 : 0.08));
    }
    // ferrures aux bouts, clous
    for (const fx of [x0, x0 + W - 6]) { p.R(fx, 1, 6, 24, '#2e2e34'); p.R(fx, 1, 6, 1, '#6a6a72'); for (const y of [4, 12, 20]) p.P(fx + 3, y, '#9a9aa4'); }
    // lettres peintes en blanc cassé, ombre portée, usure
    const word = 'FORT DEFIANCE', tw = txTextW(word, 3, 3), tx = x0 + ((W - tw) >> 1), ty = 6;
    txText(p.R, word, tx + 1, ty + 1, '#1e120a', 3, 3);
    txText(p.R, word, tx, ty, '#ece2c4', 3, 3);
    for (let i = 0; i < 40; i++) { const x = tx + Math.floor(r() * tw), y = ty + Math.floor(r() * 15); p.P(x, y, txPick(r, ['#c8b898', '#a89878'])); }
    for (const sx of [x0 + 14, x0 + W - 15]) { ftStar(p.R, sx + 1, 14, '#1e120a'); ftStar(p.R, sx, 13, '#e8c860'); }
    return c;
  });
}
TX_WALLS.fortGate = (p, rand, c, v) => {
  TX_WALLS.logs(p, rng(hash('w:logs:0')), c, 0);
  const ctx = c.getContext('2d');
  ctx.drawImage(ftGateBoard(), -64 * v, 10);
  // chaînes du panneau, jusqu'aux pointes (seulement sur les cases du bout)
  if (v !== 1) { const x = v === 0 ? 20 : 43; for (let y = 1; y < 10; y++) p.P(x + (y & 1), y, y & 1 ? '#5a5a62' : '#9a9aa4'); }
  tw2Dim(c, 0, 36, 64, 3, 0.6); // ombre sous le panneau, sur les pieux
};
TX_VARS.fortGate = 3;

// =================================================================== lits de camp (mur bas) : couverture grise (v0), drap blanc (v1)
TX_WALLS.fortBunk = (p, rand, c, v) => {
  const w = txWP(p);
  p.R(0, 0, 64, 64, '#1a1410');
  const bl = v ? ['#9a968a', '#c4c0b2', '#e4e0d4', '#f6f2e8'] : ['#3e403c', '#575a54', '#70736a', '#8a8c82'];
  const stripe = v ? '#6a7a9a' : '#26304a';
  // le dessus de la couverture (lignes 0-7), l'oreiller à gauche
  p.R(0, 0, 64, 8, bl[2]); p.R(0, 0, 64, 1, bl[3]); p.R(0, 7, 64, 1, bl[1]);
  p.R(3, 0, 16, 6, '#ece6d8'); p.R(3, 0, 16, 1, '#ffffff'); p.R(3, 5, 16, 1, '#b8b0a0'); p.R(18, 1, 1, 4, '#c8c0b0');
  // la couverture qui retombe sur le côté : plis verticaux, bandes au bord, ourlet ondulé
  for (let x = 0; x < 64; x++) {
    const f = Math.sin(x * 0.45) + Math.sin(x * 0.19 + 1.3) * 0.6, i = clamp(Math.round(1.6 + f * 0.7), 0, 3), hem = 30 + Math.round(Math.sin(x * 0.5) * 1.5);
    p.R(x, 8, 1, hem - 8, bl[i]);
    p.R(x, hem - 7, 1, 2, stripe); p.R(x, hem - 4, 1, 1, stripe);
    p.R(x, hem, 1, 1, bl[0]);
  }
  for (let i = 0; i < 30; i++) w.P(rand() * 64, 9 + rand() * 18, rand() < 0.5 ? bl[1] : bl[3]);
  // le cadre (chant de la traverse sous la couverture), les pieds, l'ombre dessous
  p.R(0, 32, 64, 4, '#6a4a2c'); p.R(0, 32, 64, 1, '#8a6a44'); p.R(0, 35, 64, 1, '#3a2614');
  for (const x of [2, 58]) { p.R(x, 36, 4, 28, '#5a3e24'); p.R(x, 36, 1, 28, '#7a5634'); p.R(x + 3, 36, 1, 28, '#2e1e10'); }
  p.R(6, 36, 52, 2, '#120c08');
  if (!v) { // les bottes rangées sous le lit
    for (const x of [24, 33]) { p.R(x, 48, 6, 14, '#2e1c10'); p.R(x, 48, 2, 14, '#4a2e1a'); p.R(x, 58, 9, 5, '#2e1c10'); p.R(x, 58, 9, 1, '#4a2e1a'); }
  } else { // la cuvette émaillée
    p.ell(32, 58, 9, 4, '#c8ccd0'); p.ell(32, 57, 8, 2, '#e8ecf0'); p.R(25, 58, 14, 1, '#3a5a8a');
  }
  grain(c, 0, 0, 64, 64, rand, 0.05, 0.4);
};
TX_VARS.fortBunk = 2;

// =================================================================== sacs de sable (mur bas) : quatre rangs de sacs en quinconce
TX_WALLS.fortSandbags = (p, rand, c) => {
  p.R(0, 0, 64, 64, '#2a2014');
  const B = PR_BURLAP, nz = txNoise(rand, 2);
  const bags = [];
  for (let row = 0; row < 4; row++) for (let k = -1; k < 3; k++) bags.push({ x: k * 24 + (row % 2) * 12 + Math.floor(rand() * 3), y: row * 16, w: 23, h: 16, t: (rand() - 0.5) * 0.25, tie: rand() < 0.5 });
  txField(c, (x, y) => {
    for (const b of bags) for (const ox of [-64, 0, 64]) {
      const u = (x + 0.5 - b.x - ox) / b.w, v = (y + 0.5 - b.y) / b.h;
      if (u < 0 || u > 1 || v < 0 || v > 1) continue;
      // sac bombé : coins arrondis, lumière en haut à gauche, dessous à l'ombre (écrasé par le rang du dessus)
      const dx = Math.abs(u - 0.5) * 2, dy = Math.abs(v - 0.5) * 2;
      if (dx ** 4 + dy ** 3 > 1) return null;
      let k = 0.62 + (0.5 - v) * 0.7 + (0.5 - u) * 0.18 + b.t - (dx ** 4 + dy ** 3) * 0.25;
      if ((x + y * 3) % 4 === 0) k -= 0.06; // trame de la toile
      const col = txRGB(prPick(B, clamp(k + (nz(x, y) - 0.5) * 0.12, 0, 1)));
      return col;
    }
    return null;
  });
  // ligatures et coutures, un peu de sable qui s'échappe
  const w = txWP(p);
  for (const b of bags) {
    if (b.tie) { w.R(b.x + 2, b.y + 6, 2, 4, B[1]); w.P(b.x + 1, b.y + 7, B[4]); }
    w.R(b.x + 6, b.y + 3, b.w - 12, 1, shade(B[2], -0.1));
  }
  for (let i = 0; i < 12; i++) w.P(rand() * 64, 60 + rand() * 4, '#c8aa76');
};

// =================================================================== intérieurs : rayonnages du cantinier, carte d'état-major, outils de la forge
// Rayonnages chargés : conserves, bocaux, pièces de drap, bottes, tabac (v0/v1 : deux assortiments)
TX_WALLS.fortShelves = (p, rand, c, v) => {
  txVBoards(p, rand, c, 0, 0, 64, 64, '#4a3220', 8, '#24160c');
  tw2Dim(c, 0, 0, 64, 64, 0.62);
  const goods = (x0, x1, base) => {
    for (let x = x0; x < x1;) {
      const kind = Math.floor(rand() * 5), col = txPick(rand, ['#a42418', '#2c4a7a', '#c8a040', '#3e6a3a', '#e6dcc4', '#7a3a7a']);
      if (kind === 0) { // boîte de conserve à étiquette
        const h = 6 + Math.floor(rand() * 3);
        p.R(x, base - h, 5, h, '#8a8c90'); p.R(x, base - h + 2, 5, h - 4, col); p.P(x, base - h + 2, shade(col, 0.3)); p.R(x, base - h, 5, 1, '#c8ccd0'); x += 6;
      } else if (kind === 1) { // bocal
        p.R(x, base - 9, 6, 9, '#6a8a7a'); p.R(x + 1, base - 7, 4, 6, shade(col, -0.2)); p.R(x, base - 10, 6, 1, '#4a4a50'); p.P(x + 1, base - 8, '#d0e8e0'); x += 7;
      } else if (kind === 2) { // pièce de drap couchée
        p.R(x, base - 7, 11, 7, col); p.R(x, base - 7, 11, 1, shade(col, 0.25)); p.R(x + 10, base - 7, 1, 7, shade(col, -0.35)); p.R(x + 1, base - 4, 9, 1, shade(col, -0.15)); x += 12;
      } else if (kind === 3) { // une paire de bottes
        for (const bx of [x, x + 4]) { p.R(bx, base - 10, 3, 10, '#3a2214'); p.R(bx, base - 2, 5, 2, '#3a2214'); p.P(bx, base - 10, '#6a4228'); }
        x += 10;
      } else { // boîtes de tabac empilées
        for (let j = 0; j < 2; j++) { p.R(x, base - 4 - j * 4, 8, 4, j ? '#c8a040' : '#a42418'); p.R(x, base - 4 - j * 4, 8, 1, '#f0d070'); }
        x += 9;
      }
      x += Math.floor(rand() * 2);
    }
  };
  for (const y of [15, 31, 47, 63]) {
    goods(2, 60, y - 2);
    p.R(0, y - 2, 64, 2, '#7a5634'); p.R(0, y - 2, 64, 1, '#9a7448'); p.R(0, y, 64, 1, '#1a100a');
  }
  for (const x of [0, 62]) { p.R(x, 0, 2, 64, '#5a3c22'); p.R(x, 0, 1, 64, '#7a5634'); }
  if (v) txStencil(p, rand, 'ARMY', 22, 5, '#e6dcc4', 1, 0.2); // une caisse marquée sur l'étagère du haut
};
TX_VARS.fortShelves = 2;

// État-major : la carte du territoire punaisée (v0), les sabres croisés du 7e de cavalerie (v1), sur le papier vert
TX_WALLS.fortMap = (p, rand, c, v) => {
  TX_WALLS.wallpaper(p, rng(hash('w:wallpaper:1')), c, 1);
  if (!v) {
    const x0 = 8, y0 = 6, w = 48, h = 32;
    p.R(x0 + 1, y0 + 1, w, h, 'rgba(10,14,8,0.55)');
    p.R(x0, y0, w, h, '#d8c8a0');
    for (let i = 0; i < 40; i++) p.P(x0 + rand() * w, y0 + rand() * h, '#c8b48a');
    for (let x = x0 + 8; x < x0 + w; x += 8) p.R(x, y0 + 1, 1, h - 2, '#cbb994');
    for (let y = y0 + 8; y < y0 + h; y += 8) p.R(x0 + 1, y, w - 2, 1, '#cbb994');
    // la rivière, les montagnes, la piste en pointillé, le fort (étoile rouge)
    let ry = y0 + 6;
    for (let x = x0 + 1; x < x0 + w - 1; x++) { ry += Math.round(Math.sin(x * 0.4) * 0.6 + 0.25); p.R(x, Math.min(y0 + h - 3, ry), 1, 2, '#4a7aa8'); }
    for (const [mx, my] of [[x0 + 8, y0 + 22], [x0 + 13, y0 + 24], [x0 + 36, y0 + 10], [x0 + 41, y0 + 12]]) { for (let k = 0; k < 4; k++) p.R(mx - k, my + k, 2 * k + 1, 1, k === 0 ? '#5a3a1e' : '#8a6a44'); }
    for (let x = x0 + 4; x < x0 + w - 4; x += 3) p.P(x, y0 + 16 + Math.round(Math.sin(x * 0.2) * 3), '#a42418');
    ftStar(p.R, x0 + 27, y0 + 18, '#a42418');
    text(p.R, 'DAKOTA', x0 + 3, y0 + h - 7, '#5a3a1e');
    for (const [nx, ny] of [[x0 + 1, y0 + 1], [x0 + w - 2, y0 + 1], [x0 + 1, y0 + h - 2], [x0 + w - 2, y0 + h - 2]]) { p.P(nx, ny, '#c8a040'); p.P(nx + 1, ny + 1, '#5a4010'); }
    return;
  }
  // sabres croisés, lames vers le haut, gardes de laiton ; le 7 au milieu ; le fanion à queue d'aronde derrière
  const cx = 32;
  p.poly([[cx - 8, 4], [cx + 8, 4], [cx + 4, 9], [cx + 8, 14], [cx - 8, 14]], '#a42418');
  p.R(cx - 8, 9, 16, 5, '#ece2c4');
  for (const s of [-1, 1]) {
    for (let t = 0; t <= 30; t++) {
      const x = cx + s * (14 - t * 0.95) + s * Math.sin(t / 30 * Math.PI) * 2, y = 36 - t;
      p.P(Math.round(x), y, '#d8dce4'); p.P(Math.round(x) + (s > 0 ? 1 : -1), y, '#7a808a');
    }
    const hx = cx + s * 14, hy = 37;
    p.R(hx - 1, hy - 2, 3, 6, '#3a2214'); p.R(hx - 3, hy - 3, 7, 2, '#c8a040'); p.P(hx - 3, hy - 3, '#f0d070');
    prRingTx(p, hx + s * 3, hy, '#c8a040');
  }
  txText(p.R, '7', cx - 2, 18, '#1a1008', 2); txText(p.R, '7', cx - 3, 17, '#e8c860', 2);
};
// garde en coquille d'un sabre (petit arc de laiton)
function prRingTx(p, x, y, col) { p.P(x, y - 2, col); p.P(x + 1, y - 1, col); p.P(x + 1, y, col); p.P(x, y + 1, col); }
TX_VARS.fortMap = 2;

// Forge : pierre noircie de suie, râtelier d'outils (tenailles, marteaux, fers à cheval) sur une traverse
TX_WALLS.fortTools = (p, rand, c, v) => {
  TX_WALLS.stone(p, rng(hash('w:stone:1')), c, 1);
  tw2Dim(c, 0, 0, 64, 40, (x, y) => 0.5 + y * 0.012); // suie
  txTimber(p, rand, 0, 8, 64, 5, '#5a3e24', true);
  const iron = '#3a3a40', ih = '#7a7a84';
  const shoe = (x, y) => { p.R(x, y, 2, 7, iron); p.R(x + 5, y, 2, 7, iron); p.R(x + 1, y + 7, 5, 2, iron); p.P(x, y, ih); p.P(x + 5, y, ih); p.P(x + 2, y + 8, ih); };
  const tongs = (x) => { p.line(x, 13, x - 2, 40, iron); p.line(x + 2, 13, x + 4, 40, iron); p.P(x + 1, 13, ih); p.R(x - 3, 40, 3, 2, iron); p.R(x + 4, 40, 3, 2, iron); };
  const hammer = (x) => { p.R(x, 13, 2, 22, '#7a5634'); p.R(x, 13, 1, 22, '#9a7448'); p.R(x - 4, 33, 10, 5, iron); p.R(x - 4, 33, 10, 1, ih); };
  p.P(4, 10, '#c8a040');
  if (!v) { shoe(6, 14); shoe(16, 14); tongs(30); hammer(46); shoe(55, 14); }
  else { hammer(8); shoe(20, 14); shoe(29, 15); tongs(44); p.line(56, 13, 58, 34, '#4a4a52'); for (let y = 15; y < 34; y += 3) p.R(56 + Math.round((y - 13) / 10), y, 3, 2, '#5a5a62'); }
  for (const x of [12, 30, 46, 58]) { p.R(x, 11, 2, 2, '#2a1a10'); p.P(x, 11, '#8a6a44'); }
};
TX_VARS.fortTools = 2;

// =================================================================== écuries : planches et couvre-joints, lucarne (v1)
TX_WALLS.fortStable = (p, rand, c, v) => {
  const r0 = rng(hash('w:fortStable:0'));
  txVBoards(p, r0, c, 0, 0, 64, 64, '#6e5842', 10, '#2a1e14');
  const w = txWP(p);
  // couvre-joints sur les fentes, plus clairs, cloués
  for (let x = 9; x < 64; x += 10) { w.R(x - 1, 0, 3, 64, '#7e6a52'); w.R(x - 1, 0, 1, 64, '#9a8668'); w.R(x + 1, 0, 1, 64, '#3e3022'); for (const y of [6, 30, 54]) w.P(x, y, '#2a2018'); }
  for (let i = 0; i < 10; i++) w.R(r0() * 64, r0() * 50, 1, 4 + r0() * 10, '#5a4634');
  // éclaboussures de crottin et de boue en bas
  tw2Dim(c, 0, 52, 64, 12, (x, y) => 1 - (y - 52) * 0.03);
  for (let i = 0; i < 18; i++) w.P(r0() * 64, 54 + r0() * 10, txPick(r0, ['#4a3a24', '#5a4a30', '#3a2c1c']));
  if (!v) return;
  // lucarne de foin : cadre, croix de Saint-André, paille qui dépasse
  const x0 = 20, y0 = 12, s = 22;
  p.R(x0 - 3, y0 - 3, s + 6, s + 6, '#8a7458'); p.R(x0 - 3, y0 - 3, s + 6, 1, '#b09a78'); p.R(x0 - 3, y0 + s + 2, s + 6, 1, '#3e3022');
  p.R(x0, y0, s, s, '#140e08');
  for (let i = 0; i < 26; i++) { const x = x0 + rand() * s, y = y0 + s - 1 - rand() * 9; p.line(x, y, x + (rand() - 0.5) * 4, y - 2 - rand() * 3, txPick(rand, PR_STRAW.slice(2))); }
  for (let k = -1; k <= 1; k++) { p.line(x0, y0 + k + 1, x0 + s - 1, y0 + s - 1 + k - 1, '#8a7458'); p.line(x0, y0 + s - 1 + k - 1, x0 + s - 1, y0 + k + 1, '#8a7458'); }
  p.R(x0 + s, y0 + 1, 1, s, '#2a1e14');
};
TX_VARS.fortStable = 2;

// =================================================================== blockhaus : l'étage en encorbellement (au-dessus de 1, sur 1,6 unité)
// toit de bardeaux sur le ciel, rondins couchés de l'étage (v0 : une meurtrière), abouts des solives, ombre portée
TX_WALLS.fortBlockhouse = (p, rand, c, v) => {
  const r0 = rng(hash('w:fortBlockhouse'));
  p.R(0, 0, 64, 12, TW2_SEE);
  // bardeaux : rangs décalés, bord bas éclairé
  for (let row = 0; row < 3; row++) {
    const y = 4 + row * 5;
    for (let x = -((row * 5) % 8); x < 64; x += 8) {
      const col = shade('#6a5a48', (r0() - 0.5) * 0.25);
      p.R(x, y, 8, 5, col); p.R(x, y, 1, 5, shade(col, -0.4)); p.R(x, y + 4, 8, 1, shade(col, 0.25));
    }
  }
  for (let x = 0; x < 64; x++) if ((x * 13 + 5) % 7 < 3) p.P(x, 4, TW2_SEE); // bord des bardeaux, irrégulier
  p.R(0, 19, 64, 3, '#2a1e14');
  // rondins couchés de l'étage
  const L = ['#3a2616', '#5c3e26', '#7a5636', '#9a744a', '#b08a5a'];
  for (let k = 0; k < 4; k++) {
    const y0 = 22 + k * 7;
    for (let y = 0; y < 7; y++) p.R(0, y0 + y, 64, 1, L[[1, 3, 4, 3, 2, 2, 1][y]]);
    p.R(0, y0 + 6, 64, 1, L[0]);
    for (let i = 0; i < 8; i++) p.R(r0() * 64, y0 + 2 + Math.floor(r0() * 3), 4 + r0() * 10, 1, L[2]);
  }
  if (!v) { p.R(27, 32, 10, 6, '#3a2616'); p.R(28, 33, 8, 4, '#0a0806'); p.R(28, 37, 8, 1, '#9a744a'); }
  // solives qui dépassent sous l'étage, et l'ombre de l'encorbellement en bas
  p.R(0, 50, 64, 3, '#2e1e12');
  for (let x = 3; x < 64; x += 16) { p.R(x, 50, 8, 7, '#7a5636'); p.R(x, 50, 8, 1, '#a07a50'); p.R(x + 7, 50, 1, 7, '#3a2616'); p.ell(x + 4, 53, 2, 2, '#5c3e26'); p.P(x + 4, 53, '#3a2616'); }
  p.R(0, 57, 64, 7, '#24180e');
  tw2Grain(c, 0, 12, 64, 52, r0, 0.06, 0.4);
};
TX_VARS.fortBlockhouse = 2;

// =================================================================== sols
// Prairie verte (plus fraîche que l'herbe sèche de la ville) : touffes, fleurs, quelques plaques de terre
TX_FLATS.fortPrairie = (p, rand, c) => {
  const a = txRGB('#76844a'), b = txRGB('#8c9452'), d = txRGB('#8e7a54'), nz = txFbm(rand, [16, 8, 4]), nz2 = txNoise(rand, 2), bare = txNoise(rand, 16);
  txField(c, (x, y) => {
    const t = bare(x, y);
    const col = t > 0.72 ? txLerp(txLerp(a, b, nz(x, y)), d, clamp((t - 0.72) * 5, 0, 1)) : txLerp(a, b, nz(x, y));
    return txK(col, 0.92 + (nz2(x, y) - 0.5) * 0.14);
  });
  const w = txWP(p, true);
  const BL = ['#5a6a2c', '#6e7e36', '#88964a', '#a2ac5a', '#b8bc6a', '#7a8a3e'];
  for (let i = 0; i < 46; i++) {
    const x = rand() * 64, y = rand() * 64, n = 3 + Math.floor(rand() * 4);
    w.P(x, y, '#4a5424');
    for (let j = 0; j < n; j++) { const ang = -Math.PI / 2 + (rand() - 0.5) * 2.4, len = 2 + rand() * 3.5; w.line(x, y, x + Math.cos(ang) * len, y + Math.sin(ang) * len * 0.7, txPick(rand, BL)); }
  }
  for (let i = 0; i < 9; i++) { const x = rand() * 64, y = rand() * 64, col = txPick(rand, ['#f0ece0', '#e8c840', '#a888c8', '#f0ece0']); w.P(x, y, col); w.P(x + 1, y + 1, '#3e4a20'); }
  grain(c, 0, 0, 64, 64, rand, 0.05, 0.5);
};
// Place d'armes : terre battue claire, traces de bottes et de sabots, gravillons
TX_FLATS.fortParade = (p, rand, c) => {
  const a = txRGB('#b49a72'), b = txRGB('#c4ab82'), d = txRGB('#a08660'), nz = txFbm(rand, [16, 8, 4], [0.4, 0.35, 0.25]), nz2 = txNoise(rand, 2);
  txField(c, (x, y) => {
    const n = nz(x, y);
    const col = n < 0.45 ? txLerp(d, a, clamp((n - 0.25) / 0.2, 0, 1)) : txLerp(a, b, clamp((n - 0.45) / 0.3, 0, 1));
    return txK(col, 0.95 + (nz2(x, y) - 0.5) * 0.08);
  });
  const w = txWP(p, true);
  // empreintes de bottes (semelle et talon), par paires
  const boot = (x, y) => { w.ell(x, y, 1.4, 2.4, '#94784f'); w.R(x - 1, y + 4, 3, 2, '#94784f'); w.P(x, y + 3, '#c8b08a'); w.P(x - 1, y - 2, '#a8906a'); };
  for (let i = 0; i < 4; i++) { const x = Math.floor(rand() * 64), y = Math.floor(rand() * 64); boot(x, y); boot(x + 5, y + 7); }
  for (let i = 0; i < 22; i++) { const x = rand() * 64, y = rand() * 64, col = txPick(rand, ['#d8c8a8', '#8a7e70', '#e8dcc0', '#7a6a58']); w.R(x, y, 1 + Math.floor(rand() * 2), 1, col); w.P(x, y + 1, '#8a7048'); }
  grain(c, 0, 0, 64, 64, rand, 0.06, 0.6);
};
// Litière des écuries : paille jetée sur la terre
TX_FLATS.fortStraw = (p, rand, c) => {
  const base = txRGB('#7a6040'), nz = txFbm(rand, [16, 8]), nz2 = txNoise(rand, 2);
  txField(c, (x, y) => txK(base, 0.85 + nz(x, y) * 0.25 + (nz2(x, y) - 0.5) * 0.08));
  const w = txWP(p, true);
  for (let i = 0; i < 260; i++) {
    const x = rand() * 64, y = rand() * 64, ang = rand() * Math.PI, len = 2 + rand() * 5;
    w.line(x, y, x + Math.cos(ang) * len, y + Math.sin(ang) * len, txPick(rand, PR_STRAW.slice(1, 5)));
  }
  for (let i = 0; i < 4; i++) { const x = rand() * 64, y = rand() * 64; w.ell(x, y, 3, 2, '#4e3a22'); w.ell(x - 1, y - 1, 1.5, 1, '#5e4628'); }
  grain(c, 0, 0, 64, 64, rand, 0.06, 0.5);
};

// =================================================================== objets du décor
// Mât du fort et la bannière étoilée (13 bandes, le canton bleu semé d'étoiles) ; f 0..2 : le vent la fait onduler
const FT_RED = ['#4e0a0e', '#76121a', '#9a1c24', '#b22234', '#cc4048', '#e06a6a'];
const FT_WHITE = ['#6a6656', '#9a9682', '#c8c4b0', '#e6e2d2', '#f6f2e6', '#ffffff'];
const FT_BLUE = ['#0e1430', '#18204a', '#22305e', '#2e3e74', '#43568e', '#6276a8'];
function ftFlagpole(f) {
  return sprite(140, 212, (p) => {
    const { R, P } = p;
    // socle de pierres blanchies, mât de pin (lumière à gauche), pommeau doré, drisse
    R(-9, -7, 19, 8, PR_STONE[4]); R(-9, -7, 19, 1, PR_STONE[5]); R(-9, -7, 1, 8, PR_STONE[5]); R(9, -7, 1, 8, PR_STONE[2]);
    for (const x of [-4, 3]) R(x, -6, 1, 6, PR_STONE[3]);
    R(-7, -10, 15, 3, PR_STONE[3]); R(-7, -10, 15, 1, PR_STONE[5]);
    prCyl(p, -1, -204, 3, 194, PR_WOOD.slice(2));
    for (const y of [-150, -100, -50]) R(-1, y, 3, 1, PR_WOOD[2]);
    p.disc(0, -206, 2.4, PR_GOLD[3]); P(-1, -207, PR_GOLD[5]); P(1, -205, PR_GOLD[1]);
    R(2, -200, 1, 186, '#d8d0bc'); R(2, -16, 2, 2, PR_IRON[3]);
    // la bannière : grille plate (u le long, v en hauteur), plissée par une onde qui grandit vers le bout libre
    const W = 62, Hh = 39, x0 = 3, y0 = -201, ph = (f * 2 * Math.PI) / 3;
    const Wf = W + [0, 2, -2][f];
    for (let i = 0; i < Wf; i++) {
      const u = Math.min(W - 1, Math.round((i * (W - 1)) / (Wf - 1))), s = u / (W - 1);
      const dy = Math.round(Math.sin(u * 0.16 - ph) * (0.3 + 3.2 * s ** 1.4));
      const k = Math.cos(u * 0.16 - ph) * 0.22 * Math.min(1, s * 3 + 0.2);
      for (let v = 0; v < Hh; v++) {
        let ramp;
        if (u < 26 && v < 21) {
          // canton : étoiles en quinconce (points blancs)
          const star = (v % 4 === 1 && (u % 5 === 2)) || (v % 4 === 3 && (u % 5 === 4 || u % 5 === 0) && u > 1);
          ramp = star ? FT_WHITE : FT_BLUE;
        } else ramp = Math.floor(v / 3) % 2 ? FT_WHITE : FT_RED;
        const e = v === 0 ? 0.12 : v === Hh - 1 ? -0.14 : 0;
        P(x0 + i, y0 + v + dy, prPick(ramp, 0.62 + k + e - (u === 0 ? 0.15 : 0)));
      }
    }
  });
}
// Tente conique (Sibley) : toile écrue cousue en fuseaux, porte relevée, haubans et piquets, chapeau de cheminée
function ftTent() {
  return sprite(80, 72, (p, c) => {
    const { R, P, line } = p;
    const top = -66, hw = 33, base = -3;
    for (let y = top; y <= base; y++) {
      const t = (y - top) / (base - top), half = Math.round(2 + t * hw);
      for (let x = -half; x <= half; x++) {
        const u = (x + half + 0.5) / (2 * half + 1);
        let k = prLit(u) * 0.8 + 0.18 - (y > base - 4 ? 0.2 : 0);
        if (Math.round((x / half) * 8) !== Math.round(((x + 1) / half) * 8) && half > 6) k -= 0.12; // coutures des fuseaux
        P(x, y, prPick(PR_CREAM, k));
      }
    }
    // la porte relevée : l'ouverture sombre, le pan replié (envers plus clair), les attaches
    p.poly([[-4, -40], [7, -1], [-13, -1]], '#2a2016');
    p.poly([[-3, -36], [-12, -1], [-9, -1]], '#16100a');
    p.poly([[-4, -40], [-13, -1], [-21, -1]], PR_CREAM[4]);
    line(-4, -40, -21, -1, PR_CREAM[2]);
    P(-15, -20, '#6a4a2c'); P(-16, -19, '#6a4a2c');
    R(-3, -6, 2, 5, '#4a3a2a'); // le mât central dans l'ombre
    // le chapeau au sommet, le tuyau de poêle
    R(-3, top - 2, 7, 3, PR_CREAM[2]); R(-3, top - 2, 7, 1, PR_CREAM[4]);
    R(4, top - 8, 2, 9, PR_IRON[1]); R(4, top - 8, 1, 9, PR_IRON[3]); R(3, top - 9, 4, 1, PR_IRON[2]);
    // haubans jusqu'aux piquets
    for (const [x0, y0, x1] of [[-24, -18, -38], [26, -16, 39], [-14, -36, -30], [16, -34, 33]]) { line(x0, y0, x1, 0, '#a89878'); R(x1, -2, 1, 3, PR_WOOD[1]); }
    R(-hw - 1, base, 2 * hw + 3, 1, '#6a5638'); // le bas de la toile, sali par la boue
    grain(c, 0, 0, c.width, c.height, rng(77), 0.05, 0.3);
  });
}
// Pile de boulets : pyramide sur un châssis de bois
function ftBalls() {
  return sprite(32, 24, (p) => {
    const { R } = p;
    R(-13, -3, 27, 3, PR_WOOD[2]); R(-13, -3, 27, 1, PR_WOOD[4]); R(-13, -1, 27, 1, PR_WOOD[0]);
    const ball = (bx, by) => {
      for (let y = by - 3; y <= by + 3; y++) for (let x = bx - 3; x <= bx + 3; x++) {
        const nx = (x - bx) / 3.2, ny = (y - by) / 3.2, d = Math.hypot(nx, ny);
        if (d > 1) continue;
        p.P(x, y, prPick(PR_GUN, 0.35 - nx * 0.3 - ny * 0.4 - (d > 0.8 ? 0.12 : 0) + (nx < -0.2 && ny < -0.2 && d < 0.7 ? 0.35 : 0)));
      }
    };
    for (const x of [-9, -3, 3, 9]) ball(x, -7);
    for (const x of [-6, 0, 6]) ball(x, -13);
    for (const x of [-3, 3]) ball(x, -19);
  });
}
// Avant-train d'artillerie : coffre à munitions vert olive « U.S. », roue à rayons, timon
function ftLimber() {
  return sprite(64, 40, (p, c) => {
    const { R, P, line } = p;
    const O = ['#262c1c', '#353e26', '#46512f', '#58663a', '#6e7e4a', '#8a9a60'];
    line(-31, -7, -6, -13, PR_WOOD[1], 3); line(-31, -8, -6, -14, PR_WOOD[3]); // le timon
    prRing(p, 8, -14, 11.6, 13.2, () => '#1e1a18'); // la roue de l'autre côté
    // le coffre : face, couvercle, ferrures, poignées, pochoir
    R(-15, -33, 34, 15, O[3]); R(-15, -33, 34, 1, O[5]); R(-15, -33, 1, 15, O[4]); R(18, -33, 1, 15, O[1]); R(-15, -19, 34, 1, O[0]);
    R(-16, -36, 36, 3, O[4]); R(-16, -36, 36, 1, O[5]); R(-16, -34, 36, 1, O[2]);
    for (const x of [-12, 15]) { R(x, -33, 2, 15, PR_IRON[2]); P(x, -32, PR_IRON[4]); P(x, -21, PR_IRON[4]); }
    R(-7, -28, 4, 2, PR_IRON[1]); R(8, -28, 4, 2, PR_IRON[1]);
    txText(R, 'U.S.', -5, -31, '#e6dcc4', 1, 1);
    R(-14, -18, 34, 3, PR_WOOD[2]); R(-14, -18, 34, 1, PR_WOOD[4]); // l'essieu et la planche
    prSpokeWheel(p, 4, -14, 13, PR_WOOD, 12);
    grain(c, 0, 0, c.width, c.height, rng(31), 0.06, 0.35);
  });
}
// Chariot bâché : caisse bleue, bâche bombée sur ses arceaux, roues rouges (petite devant, grande derrière)
function ftWagon() {
  return sprite(88, 64, (p, c) => {
    const { R, P, line } = p;
    const RED = ['#3a0e08', '#5e1a10', '#7e2a1a', '#9e3a24', '#c05a3a', '#dc7a54'];
    const BLU = ['#1a2636', '#26384e', '#344c66', '#46627e', '#5e7c98', '#7c9ab4'];
    line(-43, -4, -24, -14, PR_WOOD[1], 3); // le timon
    prRing(p, -18, -12, 8.4, 9.8, () => '#1e1a18'); prRing(p, 22, -14, 11.4, 12.8, () => '#1e1a18'); // roues de l'autre côté
    // la bâche : arc bombé, ourlets rentrés aux deux bouts, arceaux plus sombres, lumière en haut à gauche
    for (let x = -34; x <= 34; x++) {
      const t = (x + 34) / 68, top = Math.round(-58 + 10 * (2 * t - 1) ** 2 - (Math.abs(x) > 30 ? (Math.abs(x) - 30) * 1.5 : 0));
      for (let y = top; y <= -30; y++) {
        let k = 0.85 - (y - top) / 40 - t * 0.2;
        if ((x + 34) % 11 === 0) k -= 0.18;
        P(x, y, prPick(PR_CREAM, k));
      }
      P(x, top, PR_CREAM[5]);
    }
    p.ell(33, -42, 3, 9, '#2a2016'); // l'ouverture arrière, dans l'ombre
    line(-30, -32, -38, -27, '#a89878'); line(30, -32, 38, -27, '#a89878'); // cordes de la bâche
    // la caisse bleue, ses planches et sa bordure rouge
    R(-38, -31, 76, 13, BLU[3]); R(-38, -31, 76, 1, BLU[5]); R(-38, -19, 76, 1, BLU[0]);
    for (let x = -30; x < 38; x += 10) { R(x, -30, 1, 11, BLU[1]); R(x + 1, -30, 1, 11, BLU[4]); }
    R(-38, -27, 76, 1, BLU[2]); R(-39, -32, 78, 2, RED[3]); R(-39, -32, 78, 1, RED[5]);
    R(-30, -18, 64, 3, PR_IRON[1]); // le train et les essieux
    prSpokeWheel(p, -18, -10, 9.5, RED, 10);
    prSpokeWheel(p, 22, -13, 12.5, RED, 12);
    // le seau sous la caisse, le tonnelet sur le flanc
    R(4, -17, 5, 5, PR_IRON[2]); R(4, -17, 5, 1, PR_IRON[4]); line(4, -18, 8, -18, PR_IRON[3]);
    R(-34, -28, 6, 8, PR_WOOD[3]); R(-34, -28, 6, 1, PR_WOOD[5]); R(-34, -25, 6, 1, PR_IRON[2]);
    grain(c, 0, 0, c.width, c.height, rng(53), 0.05, 0.3);
  });
}
// Enclume sur sa souche, et la masse appuyée
function ftAnvil() {
  return sprite(32, 28, (p, c) => {
    const { R, P, poly } = p;
    prCyl(p, -6, -12, 13, 12, PR_WOOD); R(-6, -12, 13, 1, PR_WOOD[5]); R(-6, -1, 13, 1, PR_WOOD[0]);
    for (const y of [-9, -5]) R(-5, y, 11, 1, PR_WOOD[2]);
    const I = PR_GUN;
    poly([[-13, -19], [-5, -21], [10, -21], [10, -17], [-5, -17]], I[3]); // la bigorne et la table
    R(-5, -22, 16, 2, I[4]); R(-5, -22, 16, 1, I[5]); P(-12, -19, I[4]);
    R(-3, -17, 10, 2, I[2]); R(-1, -15, 6, 3, I[1]); R(-4, -13, 12, 1, I[2]);
    R(6, -21, 2, 1, I[0]); // trou de la tranche
    prSheen(c, -10, -21, 9, -21, 0.6, 0.25);
    // la masse
    R(11, -18, 2, 17, PR_WOOD[3]); R(11, -18, 1, 17, PR_WOOD[5]); R(9, -2, 6, 3, I[2]); R(9, -2, 6, 1, I[4]);
  });
}
// Forge : foyer de briques, braises (f : elles palpitent), hotte et conduit, soufflet de cuir
function ftForge(f) {
  const c = sprite(56, 76, (p) => {
    const { R, P, poly } = p;
    // le soufflet, à droite, derrière le foyer
    poly([[12, -36], [26, -42], [26, -28]], PR_LEATHER[3]); poly([[12, -36], [26, -28], [24, -26]], PR_LEATHER[1]);
    R(25, -43, 2, 17, PR_WOOD[2]); line2(p, 26, -43, 27, -56, PR_WOOD[3]);
    // le foyer de briques
    for (let y = -28; y <= 0; y++) for (let x = -20; x <= 16; x++) {
      const row = Math.floor((y + 28) / 4), joint = (y + 28) % 4 === 3 || (x + 20 + (row % 2) * 4) % 8 === 7;
      const k = joint ? 0.2 : 0.55 + ((x * 7 + row * 13) % 5) * 0.06 - (x > 12 ? 0.2 : 0) + (x < -17 ? 0.15 : 0);
      P(x, y, prPick(PR_RED.slice(0, 5), k));
    }
    R(-21, -30, 38, 3, PR_STONE[3]); R(-21, -30, 38, 1, PR_STONE[5]);
    // le creuset et les braises
    R(-12, -33, 22, 3, '#1a1410');
    for (let x = -11; x <= 8; x++) {
      const hgt = 2 + ((x * 5 + f * 3) % 4 === 0 ? 1 : 0);
      for (let y = -33 - hgt; y <= -31; y++) P(x, y, prPick(PR_FIRE, 0.35 + ((x * 3 + y * 5 + f * 7) % 6) / 9));
    }
    // la hotte de tôle et le conduit
    poly([[-18, -42], [14, -42], [6, -56], [-10, -56]], PR_IRON[1]);
    poly([[-18, -42], [-10, -56], [-7, -56], [-14, -42]], PR_IRON[3]);
    R(-18, -42, 32, 2, PR_IRON[0]);
    prCyl(p, -5, -74, 7, 18, PR_IRON.slice(0, 5));
    R(-6, -74, 9, 2, PR_IRON[2]);
  });
  return prGlow(c, -1, -36, 12, ['#8a2a0a', '#d06018', '#f8a030'], 0.4 + (f % 2) * 0.12);
}
const line2 = (p, x0, y0, x1, y1, col) => p.line(x0, y0, x1, y1, col, 2);
// Faisceau de fusils : trois carabines appuyées l'une contre l'autre, baïonnettes croisées
function ftRifles() {
  return sprite(28, 48, (p) => {
    const { line, R } = p;
    const rifle = (bx, tx, ty, back) => {
      const k = back ? -1 : 0;
      line(bx, 0, bx + (tx - bx) * 0.42, ty * 0.42, PR_WOOD[3 + k], 3); // la crosse
      line(bx + (tx - bx) * 0.42, ty * 0.42, tx, ty, PR_GUN[2 + k], 1); // le canon
      line(bx + 1, -1, bx + (tx - bx) * 0.4 + 1, ty * 0.4, PR_WOOD[5 + k]);
      line(tx, ty, tx + (tx - bx) * 0.18, ty - 7, PR_IRON[4]); // la baïonnette
    };
    rifle(0, 1, -36, true);
    rifle(-10, 2, -37, false);
    rifle(10, -1, -37, false);
    R(-2, -30, 5, 2, PR_LEATHER[3]); // la bretelle qui les tient
  });
}
Object.assign(PR_DECO, {
  fortFlagpole: [3, ftFlagpole], fortTent: [1, ftTent], fortBalls: [1, ftBalls], fortLimber: [1, ftLimber], fortWagon: [1, ftWagon],
  fortAnvil: [1, ftAnvil], fortForge: [4, ftForge], fortRifles: [1, ftRifles],
});
