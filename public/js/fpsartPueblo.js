// Dessins de la carte « Pueblo » du FPS (fpsmaps/pueblo.js) : murs, sols et objets enregistrés dans les registres de
// fpsart.js (TX_WALLS / TX_VARS / TX_FLATS / PR_DECO). Chargé par fps.js.
// San Miguel : adobe passé à la chaux et soubassements peints (guardapolvo), mission de pierre et de cantera rose,
// clocher et fronton chantournés découpés sur le ciel (couleur SEE, transparente en jeu), arcades de l'hacienda,
// bâches rayées du mercado, papel picado.
import * as A from './fpsart.js';

const { TX_WALLS, TX_VARS, TX_FLATS, PR_DECO, TW2_SEE: SEE, shade, mix, clamp, rng, hash, sprite, grain, txField, txK, txRGB, txLerp, txFbm, txNoise, txCellMap,
  txCellLight, txCrack, txLayer, txBevel, txVBoards, txWP, txRevealWin, txText, txTextW, txMod, txPick, prCyl, prPick, prLit, prRing, prField, prB } = A;

// =================================================================== palettes
// murs chaulés : chaux, soubassement peint (guardapolvo), boiseries ; v0 blanc et añil, v1 ocre et rouge, v2 rose et vert
// d'eau, v3 bleu et jaune
const PB_WALL = [
  { lime: '#e8e2d2', band: '#2c5a9c', wood: '#2a5a8a', brick: '#a8764e' },
  { lime: '#d6a45a', band: '#963222', wood: '#6a3a1e', brick: '#9a6644' },
  { lime: '#dc9c98', band: '#2e8676', wood: '#2e6a5a', brick: '#a06a4a' },
  { lime: '#6e9cc4', band: '#e0b448', wood: '#7a4422', brick: '#8a6448' },
];
const PB_CANTERA = ['#4a2a20', '#6e4434', '#945e48', '#b4785c', '#d0987a', '#ecbc9c']; // cantera rose des portails
const PB_BRONZE = ['#2a1a08', '#4a3010', '#7a5418', '#a8782a', '#d0a048', '#f0d080'];
const PB_LEAF = ['#0c1e12', '#16321a', '#224622', '#30602a', '#467c34', '#6e9c44'];
const PB_CLAY = ['#3a160c', '#6a2c16', '#9a4826', '#c0643a', '#d8885a', '#eeb486'];
const PB_LIME = '#f0eadc'; // chaux fraîche de la façade et du clocher
const PB_PICADO = ['#e83a8a', '#2ab0c0', '#f0c030', '#f07a20', '#5ac04a', '#a050d0', '#e83a3a', '#2a7ae0'];
const PB_STRIPE = [['#c8402e', '#ece2cc'], ['#2e5aa8', '#ece2cc'], ['#3a8a4a', '#e8c040']]; // bâches A, B, C
const PB_SEE = txRGB(SEE);

// =================================================================== outils
// Enduit de chaux de couleur col sur l'adobe : marbrures lentes, coulures de pluie, plaques tombées qui montrent les
// briques crues (entre les lignes y0 et y1). Rend le test « brique à nu » pour poser d'autres couches autour.
function pbPlaster(c, rand, col, o = {}) {
  const base = txRGB(col), br = txRGB(o.brick || '#a8764e'), mo = txRGB('#6e4630');
  const nz = txFbm(rand, [16, 8, 4]), nz2 = txNoise(rand, 2), fine = txFbm(rand, [8, 4, 2]), st = txNoise(rand, 4);
  const thr = o.thr ?? 0.69, y0 = o.y0 ?? 8, y1 = o.y1 ?? 44;
  const bare = (x, y) => y > y0 && y < y1 && !(o.keep && o.keep(txMod(x), y)) && nz(x + 23, y) * 0.86 + fine(x, y) * 0.18 > thr;
  txField(c, (x, y) => {
    if (bare(x, y)) {
      const row = Math.floor(y / 5), u = txMod(x + (row % 2) * 6) % 12, v = y % 5;
      let k = v === 4 || u === 11 ? 0 : 0.9 + ((row * 7 + Math.floor(txMod(x + (row % 2) * 6) / 12) * 5) % 5) * 0.045;
      let cc = k ? txK(br, k) : mo;
      if (!bare(x, y - 1) || !bare(x, y - 2)) cc = txK(cc, 0.58); else if (!bare(x - 1, y)) cc = txK(cc, 0.75);
      return txK(cc, 0.95 + nz2(x, y) * 0.1);
    }
    let k = 0.93 + nz(x, y) * 0.1 + (nz2(x, y) - 0.5) * 0.05 - Math.max(0, st(x * 3, y * 0.5) - 0.7) * 0.3;
    if (bare(x, y - 1)) k *= 1.13; else if (bare(x, y + 1)) k *= 0.84; else if (bare(x - 1, y)) k *= 1.06;
    return txK(base, k);
  });
  for (let i = 0; i < 3; i++) txCrack(A.pen(c), rand, Math.floor(rand() * 64), y0 + 4 + Math.floor(rand() * (y1 - y0 - 8)), 4 + Math.floor(rand() * 7), shade(col, -0.35), shade(col, 0.12));
  grain(c, 0, 0, 64, 64, rand, 0.04, 0.4);
  return bare;
}
// Soubassement peint (guardapolvo) des lignes yb à 63 : bord haut un peu ondulé, liseré sombre, écaillures, salissures en pied
function pbBand(c, rand, col, yb, line = null) {
  const b = txRGB(col), nz = txNoise(rand, 4), nz2 = txNoise(rand, 2), chip = txFbm(rand, [8, 4], [0.6, 0.4]);
  txField(c, (x, y, cur) => {
    const top = yb + Math.round((nz(x, 0) - 0.5) * 2);
    if (y < top - 1) return null;
    if (y === top - 1) return line ? line : txK(cur, 0.86); // ombre du bord
    if (chip(x, y) > 0.78 && y > top + 2) return txK(cur, 0.92); // l'enduit apparaît sous la peinture
    let k = 0.94 + nz2(x, y) * 0.1 - (y > 58 ? (y - 58) * 0.035 : 0);
    if (y === top) k *= 1.12;
    return txK(b, k);
  }, 0, yb - 2, 64, 66 - yb);
}
// Ciel (SEE) partout où test(x, y) : posé en dernier, après le grain
const pbSee = (c, test) => txField(c, (x, y) => (test(x, y) ? PB_SEE : null));
// Bouts de vigas (rondins) sortant du mur à la ligne y : rond de bois, cœur, ombre coulée
function pbVigas(p, xs, y, wall) {
  const sh = shade(wall, -0.35);
  for (const x of xs) {
    p.R(x - 2, y + 4, 9, 2, sh); p.R(x - 1, y + 6, 7, 1, sh); p.R(x + 4, y - 2, 2, 6, sh);
    for (let k = 7; k < 16; k++) p.P(x + ((k * 3) % 3) - 1, y + k, shade(wall, -0.18 + (k % 3) * 0.04)); // coulure sous le rondin
    p.disc(x, y, 4, '#3e2616'); p.disc(x, y, 3, '#8a6038'); p.disc(x, y, 2, '#a87a4a');
    p.P(x, y, '#6a4628'); p.P(x - 1, y - 1, '#c89a64'); p.P(x - 2, y - 2, '#b08452');
  }
}

// =================================================================== murs chaulés du village
TX_WALLS.puebloWhite = (p, rand, c, v) => {
  const P = PB_WALL[v];
  pbPlaster(c, rand, P.lime, { brick: P.brick });
  pbBand(c, rand, P.band, 47);
};
// au-dessus de 1 : l'acrotère (pretil) sur les bouts de vigas, chaperon de chaux usé, coulures
TX_WALLS.puebloWhiteUp = (p, rand, c, v) => {
  const P = PB_WALL[v];
  pbPlaster(c, rand, P.lime, { brick: P.brick, y0: 14, y1: 40, thr: 0.74 });
  const hi = shade(P.lime, 0.2), lo = shade(P.lime, -0.3);
  txField(c, (x, y, cur) => (y < 7 ? txK(cur, y === 0 ? 1.15 : y < 3 ? 1.06 : y === 6 ? 0.78 : 0.98) : null));
  p.R(0, 0, 64, 1, hi); p.R(0, 7, 64, 1, lo);
  for (let x = 3; x < 64; x += 9) p.P(x, 3, shade(P.lime, -0.15));
  pbVigas(p, [12, 44], 22, P.lime);
};
// fenêtre à barreaux forgés dans une embrasure profonde, encadrement peint, pot de géraniums
TX_WALLS.puebloWhiteWin = (p, rand, c, v) => {
  const P = PB_WALL[v];
  pbPlaster(c, rand, P.lime, { brick: P.brick, keep: (x, y) => x > 13 && x < 51 && y > 8 && y < 50 });
  pbBand(c, rand, P.band, 47);
  const x0 = 22, x1 = 42, y0 = 15, y1 = 40, d = 3, fr = P.band;
  p.R(x0 - d - 3, y0 - d - 3, x1 - x0 + 2 * d + 6, y1 - y0 + 2 * d + 6, fr); // l'encadrement peint
  p.R(x0 - d - 3, y0 - d - 3, x1 - x0 + 2 * d + 6, 1, shade(fr, 0.25)); p.R(x0 - d - 3, y1 + d + 2, x1 - x0 + 2 * d + 6, 1, shade(fr, -0.4));
  p.R(x0 - d, y0 - d, x1 - x0 + 2 * d, y1 - y0 + 2 * d, shade(P.lime, -0.08));
  p.poly([[x0 - d, y0 - d], [x1 + d, y0 - d], [x1, y0], [x0, y0]], shade(P.lime, -0.5));
  p.poly([[x0 - d, y0 - d], [x0, y0], [x0, y1], [x0 - d, y1 + d]], shade(P.lime, -0.3));
  p.poly([[x0 - d, y1 + d], [x0, y1], [x1, y1], [x1 + d, y1 + d]], shade(P.lime, 0.15));
  // dedans : volets de bois ouverts contre l'ébrasement, la pièce dans l'ombre
  p.R(x0, y0, x1 - x0, y1 - y0, '#140e0a'); p.R(x0, y1 - 6, x1 - x0, 6, '#1e150e');
  for (const sx of [x0, x1 - 4]) { p.R(sx, y0, 4, y1 - y0, shade(P.wood, -0.35)); for (let y = y0 + 2; y < y1; y += 3) p.R(sx, y, 4, 1, shade(P.wood, -0.1)); }
  // la reja : barreaux carrés, une traverse, des volutes en haut
  const ir = '#2a2624', ih = '#6a625c';
  for (let x = x0 + 2; x < x1 - 1; x += 4) { p.R(x, y0 - 1, 2, y1 - y0 + 2, ir); p.R(x, y0 - 1, 1, y1 - y0 + 2, ih); }
  for (const y of [y0 + 3, y1 - 6]) { p.R(x0, y, x1 - x0, 2, ir); p.R(x0, y, x1 - x0, 1, ih); }
  for (let x = x0 + 4; x < x1 - 2; x += 8) { prRing(p, x, y0 + 8, 1.2, 2.4, (a) => (a < 0 ? ih : ir)); }
  // appui et géraniums
  p.R(x0 - d - 2, y1 + d, x1 - x0 + 2 * d + 4, 2, shade(P.lime, 0.2)); p.R(x0 - d - 2, y1 + d + 2, x1 - x0 + 2 * d + 4, 1, shade(P.lime, -0.45));
  p.R(25, y1 - 2, 6, 5, '#b0583a'); p.R(24, y1 - 2, 8, 1, '#d8885a'); p.R(25, y1 + 2, 6, 1, '#6a2c16');
  p.R(24, y1 - 6, 8, 4, '#2e5a24'); p.P(25, y1 - 7, '#e8304a'); p.P(28, y1 - 7, '#f05a6a'); p.P(30, y1 - 6, '#e8304a'); p.P(26, y1 - 5, '#4a7a34');
  p.R(34, y1 - 1, 5, 4, '#2c5a9c'); p.R(34, y1 - 1, 5, 1, '#e8e2d2'); p.R(33, y1 - 5, 7, 4, '#3a6a2a'); p.P(35, y1 - 6, '#f0d040'); p.P(37, y1 - 5, '#f0d040');
};
// porte de planches peinte (condamnée) dans un encadrement peint, heurtoir, marche de pierre
TX_WALLS.puebloWhiteDoor = (p, rand, c, v) => {
  const P = PB_WALL[v];
  pbPlaster(c, rand, P.lime, { brick: P.brick, keep: (x, y) => x > 12 && x < 52 && y > 4 });
  pbBand(c, rand, P.band, 47);
  const x0 = 18, x1 = 46, y0 = 9, wd = P.wood;
  p.R(x0 - 4, y0 - 4, x1 - x0 + 8, 64 - y0 + 4, P.band); p.R(x0 - 4, y0 - 4, x1 - x0 + 8, 1, shade(P.band, 0.3));
  p.R(x0 - 1, y0 - 1, x1 - x0 + 2, 65 - y0, '#1a120c');
  txVBoards(p, rand, c, x0, y0, x1 - x0, 62 - y0, wd, 7, shade(wd, -0.5));
  p.R(31, y0, 2, 62 - y0, shade(wd, -0.55));
  for (const y of [16, 50]) { p.R(x0, y, x1 - x0, 3, shade(wd, -0.25)); p.R(x0, y, x1 - x0, 1, shade(wd, 0.2)); for (let x = x0 + 3; x < x1; x += 6) p.P(x, y + 1, '#c8b890'); }
  for (let i = 0; i < 6; i++) p.R(x0 + rand() * (x1 - x0), y0 + 4 + rand() * 46, 2 + rand() * 3, 1, shade(wd, 0.3)); // peinture écaillée
  prRing(p, 28, 34, 1.4, 2.6, (a) => (a < 0 ? '#e0b850' : '#8a6420')); prRing(p, 36, 34, 1.4, 2.6, (a) => (a < 0 ? '#e0b850' : '#8a6420'));
  p.R(x0 - 6, 62, x1 - x0 + 12, 2, '#a8a090'); p.R(x0 - 6, 62, x1 - x0 + 12, 1, '#d0c8b8');
};
// dedans : chaux claire, soubassement peint à liseré, frise au pochoir sous le plafond
TX_WALLS.puebloWhiteIn = (p, rand, c, v) => {
  const P = PB_WALL[v], lime = mix(P.lime, '#f2ece0', 0.55);
  pbPlaster(c, rand, lime, { brick: P.brick, thr: 0.8 });
  pbBand(c, rand, P.band, 49, shade(P.band, -0.45));
  p.R(0, 46, 64, 1, P.band);
  for (let x = 0; x < 64; x += 8) { p.P(x + 3, 3, P.band); p.R(x + 2, 4, 3, 1, P.band); p.P(x + 3, 5, P.band); p.P(x + 7, 4, shade(P.band, 0.3)); }
  p.R(0, 1, 64, 1, shade(P.band, 0.1)); p.R(0, 7, 64, 1, shade(P.band, 0.1));
};
TX_WALLS.puebloWhiteInWin = (p, rand, c, v) => {
  TX_WALLS.puebloWhiteIn(p, rng(hash(`w:puebloWhiteIn:${v}`)), c, v);
  const P = PB_WALL[v], lime = mix(P.lime, '#f2ece0', 0.55);
  txRevealWin(p, c, rand, { x0: 22, y0: 15, x1: 41, y1: 36, d: 4, lit: shade(lime, 0.06), dark: shade(lime, -0.2), frame: [P.wood, shade(P.wood, 0.3)], grille: true, pot: v % 2 ? null : 26, flip: v % 2 === 1 });
};
// enseigne peinte sur l'acrotère (v = mot * 4 + variante du mur) : lettres à la main, ombrées, dans un cadre peint
const PB_WORDS = ['CANTINA', 'TIENDA', 'BOTICA', 'PANADERIA'];
TX_WALLS.puebloSign = (p, rand, c, v) => {
  const wv = v & 3, P = PB_WALL[wv], word = PB_WORDS[v >> 2];
  TX_WALLS.puebloWhiteUp(p, rng(hash(`w:puebloWhiteUp:${wv}`)), c, wv);
  const ink = wv === 3 ? '#f4ecd8' : wv === 1 ? '#3a1a0c' : P.band, sh = shade(ink, -0.6);
  const s = txTextW(word, 2, 1) <= 58 ? 2 : 1, tw = txTextW(word, s, 1), tx = 32 - (tw >> 1), ty = 34;
  p.R(tx - 4, ty - 4, tw + 8, 5 * s + 8, shade(P.lime, 0.12));
  p.R(tx - 4, ty - 4, tw + 8, 1, ink); p.R(tx - 4, ty + 5 * s + 3, tw + 8, 1, ink); p.R(tx - 4, ty - 4, 1, 5 * s + 8, ink); p.R(tx + tw + 3, ty - 4, 1, 5 * s + 8, ink);
  txText(p.R, word, tx + 1, ty + 1, sh, s, 1); txText(p.R, word, tx, ty, ink, s, 1);
  for (const ox of [tx - 7, tx + tw + 6]) if (ox > 1 && ox < 62) { p.P(ox, ty + s * 2, '#c83a3a'); p.P(ox - 1, ty + s * 2 + 1, '#3a8a3a'); p.P(ox + 1, ty + s * 2 + 1, '#3a8a3a'); }
};
TX_VARS.puebloWhite = 4; TX_VARS.puebloWhiteUp = 4; TX_VARS.puebloWhiteWin = 4; TX_VARS.puebloWhiteDoor = 4; TX_VARS.puebloWhiteIn = 4; TX_VARS.puebloWhiteInWin = 4;
TX_VARS.puebloSign = 16;

// =================================================================== la mission
// pierre de taille et moellons sous une chaux crème tombée par plaques
const PB_MISSION = '#e6dcc6';
TX_WALLS.puebloMission = (p, rand, c) => {
  const lime = txRGB(PB_MISSION), nz = txFbm(rand, [16, 8, 4]), nz2 = txNoise(rand, 2), fine = txFbm(rand, [8, 4]);
  const m = txCellMap(rand, -6, false, 5), pal = ['#a89478', '#b8a284', '#9a8468', '#c4ae8e', '#8e7a60'].map(txRGB), cols = m.pts.map(() => txPick(rand, pal));
  const bare = (x, y) => nz(x, y) * 0.8 + fine(x, y) * 0.25 + (y > 52 ? 0.25 : 0) > 0.68;
  txField(c, (x, y) => {
    const k = y * 64 + x;
    if (bare(x, y)) {
      if (m.e[k] < 1.1) return txK(txRGB('#5a4a3a'), 0.9 + nz2(x, y) * 0.2);
      let col = txK(cols[m.id[k]], txCellLight(m, x, y, 0.9) * (0.92 + nz2(x, y) * 0.12));
      if (!bare(x, y - 1) || !bare(x, y - 2)) col = txK(col, 0.62);
      return col;
    }
    let kk = 0.93 + nz(x + 9, y) * 0.1 + (nz2(x, y) - 0.5) * 0.05;
    if (bare(x, y + 1)) kk *= 0.86; else if (bare(x, y - 1)) kk *= 1.1;
    return txK(lime, kk);
  });
  for (let i = 0; i < 2; i++) txCrack(A.pen(c), rand, Math.floor(rand() * 64), 6 + Math.floor(rand() * 40), 6 + Math.floor(rand() * 8), '#7a6a58', '#f4ecdc');
  grain(c, 0, 0, 64, 64, rand, 0.05, 0.45);
};
// haute fenêtre en plein cintre, ébrasement profond, vitrage d'albâtre sombre derrière une grille
TX_WALLS.puebloMissionWin = (p, rand, c) => {
  TX_WALLS.puebloMission(p, rng(hash('w:puebloMission:0')), c, 0);
  const cx = 32, top = 14, bot = 44, hw = 7;
  txField(c, (x, y) => {
    const X = x + 0.5 - cx, inA = (g) => y + 0.5 <= bot + g && (y + 0.5 >= top + hw ? Math.abs(X) <= hw + g : Math.hypot(X, y + 0.5 - top - hw) <= hw + g);
    if (inA(0)) return y > bot - 3 ? '#2a201a' : txLerp(txRGB('#2a3238'), txRGB('#5a5a50'), clamp((y - top) / 40, 0, 1));
    if (inA(3)) return txK(PB_CANTERA.map(txRGB)[3], X < 0 ? 0.7 : y < top + hw ? 0.8 : 1.08);
    if (inA(5)) return txK(txRGB(PB_CANTERA[4]), 1);
    return null;
  });
  for (let x = cx - 5; x <= cx + 5; x += 3) p.R(x, top + 3, 1, bot - top - 3, '#1a1614');
  p.R(cx - hw, 30, 2 * hw, 1, '#1a1614');
};
// vue du dedans : chaux, frise peinte (rinceaux rouges et verts), soubassement ocre à losanges
TX_WALLS.puebloNave = (p, rand, c) => {
  const lime = '#ece4d4';
  pbPlaster(c, rand, lime, { thr: 0.82, brick: '#b8a284' });
  p.R(0, 2, 64, 8, '#d8ccb0'); p.R(0, 2, 64, 1, '#8a2a1e'); p.R(0, 9, 64, 1, '#8a2a1e');
  for (let x = 0; x < 64; x += 16) {
    p.line(x, 7, x + 4, 4, '#3a6a3a'); p.line(x + 4, 4, x + 8, 7, '#3a6a3a'); p.line(x + 8, 7, x + 12, 4, '#3a6a3a'); p.line(x + 12, 4, x + 16, 7, '#3a6a3a');
    p.disc(x + 4, 5, 1, '#b8382a'); p.disc(x + 12, 6, 1, '#b8382a'); p.P(x + 8, 7, '#d8a030');
  }
  pbBand(c, rand, '#b0703a', 46, '#5a2a14');
  txField(c, (x, y) => { const u = txMod(x) % 16, vv = y - 54; return Math.abs(u - 8) + Math.abs(vv) === 5 ? '#6a2a18' : Math.abs(u - 8) + Math.abs(vv) < 2 ? '#e0b048' : null; }, 0, 48, 64, 14);
  // croix de consécration peinte (une case sur deux, raccord sans tirage) : rouge dans un cercle
  prRing(p, 32, 26, 4, 5.2, () => '#8a2a1e'); p.R(31, 22, 3, 9, '#a8382a'); p.R(28, 25, 9, 3, '#a8382a');
};
TX_WALLS.puebloNaveWin = (p, rand, c) => {
  TX_WALLS.puebloNave(p, rng(hash('w:puebloNave:0')), c, 0);
  // haute baie en plein cintre, la lumière du jour sur un vitrage d'albâtre (clair, veiné)
  const cx = 32, top = 12, bot = 40, hw = 7, al = txFbm(rand, [8, 4], [0.6, 0.4]);
  txField(c, (x, y) => {
    const X = x + 0.5 - cx, inA = (g) => y + 0.5 <= bot + g && (y + 0.5 >= top + hw ? Math.abs(X) <= hw + g : Math.hypot(X, y + 0.5 - top - hw) <= hw + g);
    if (inA(0)) { const a = al(x, y); return txLerp(txRGB('#f4e2b8'), txRGB('#d8a868'), a > 0.55 ? 0.6 : a * 0.4); }
    if (inA(4)) return txK(txRGB('#d8ccb6'), X < -hw ? 0.82 : X > hw ? 1.06 : y + 0.5 > bot ? 1.1 : 0.88);
    return null;
  });
  for (let x = cx - 4; x <= cx + 4; x += 4) p.R(x, top + 2, 1, bot - top - 2, '#5a3a20');
  for (const y of [22, 31]) p.R(cx - hw, y, 2 * hw, 1, '#5a3a20');
};
// le retablo doré derrière l'autel, sur trois cases (v 0 à 2, d'ouest en est vu de la nef : la face nord est vue
// depuis le sud, texture à l'endroit) : colonnes torses, niches de saints, San Miguel au milieu
TX_WALLS.puebloRetablo = (p, rand, c, v) => {
  const G = PR_GOLD_PB, nz = txNoise(rand, 2);
  txField(c, (x, y) => {
    const X = v * 64 + x; // 0..191 sur les trois cases
    const col = Math.abs(((X + 16) % 64) - 32) < 6; // colonnes aux joints des cases (et au milieu des niches latérales)
    if (col) { const t = Math.sin((y + X * 0.7) * 0.6); return txK(txRGB(G[t > 0.3 ? 4 : t < -0.3 ? 1 : 2]), 0.95 + nz(x, y) * 0.1); }
    // fond : rinceaux d'or en relief sur bois doré, quelques touches de rouge
    const o = Math.sin(X * 0.45) * Math.cos(y * 0.5) + Math.sin((X + y) * 0.23);
    return txK(txRGB(o > 0.9 ? G[5] : o > 0.2 ? G[3] : o < -0.9 ? '#7a1e14' : G[2]), 0.94 + nz(x, y) * 0.1);
  });
  // la niche de la case (arc en plein cintre, fond rouge sombre) et son saint ; au milieu, San Miguel
  const nx = 32, top = 6, bot = 46, hw = v === 1 ? 13 : 10;
  txField(c, (x, y) => {
    const X = x + 0.5 - nx, inN = (g) => y + 0.5 <= bot + g && y + 0.5 >= top - g && (y + 0.5 >= top + hw ? Math.abs(X) <= hw + g : Math.hypot(X, y + 0.5 - top - hw) <= hw + g);
    if (inN(0)) return txK(txRGB('#4a1410'), 0.75 + 0.35 * clamp((y - top) / 40, 0, 1) - (Math.abs(X) > hw - 2 ? 0.2 : 0));
    if (inN(2)) return txRGB(G[5]);
    if (inN(3)) return txRGB(G[1]);
    return null;
  });
  txLayer(c, (q) => {
    if (v === 1) {
      // San Miguel arcángel : ailes, armure d'or, manteau rouge, l'épée levée, le dragon sous ses pieds
      q.poly([[24, 20], [16, 10], [18, 26], [26, 30]], '#ece4d8'); q.poly([[40, 20], [48, 10], [46, 26], [38, 30]], '#ece4d8');
      q.line(18, 13, 24, 22, '#b8b0a4'); q.line(46, 13, 40, 22, '#b8b0a4');
      q.poly([[27, 20], [37, 20], [40, 42], [24, 42]], '#a82a20'); q.R(29, 20, 6, 12, G[4]); q.R(29, 20, 1, 12, G[5]);
      q.disc(32, 16, 3, '#e0b090'); q.R(29, 12, 7, 2, '#5a3018'); q.disc(32, 16, 6, G[5]); q.disc(32, 16, 3, '#e0b090'); q.P(31, 16, '#3a2010');
      q.line(36, 24, 42, 8, '#e8eef4'); q.R(35, 23, 4, 2, G[4]);
      q.poly([[22, 46], [42, 46], [44, 42], [30, 42], [20, 44]], '#2e5a2e'); q.P(43, 42, '#c83a2a');
    } else {
      // un saint en robe (brune à l'ouest, bleue à l'est), auréole, livre ou croix
      const robe = v === 0 ? '#5a3a22' : '#2a4a8a';
      q.disc(32, 14, 5, G[5]); q.disc(32, 15, 3, '#e0b090'); q.R(30, 12, 5, 2, '#3a2010');
      q.poly([[28, 19], [36, 19], [39, 44], [25, 44]], robe); q.line(29, 20, 27, 43, shade(robe, 0.3));
      q.R(31, 25, 3, 4, v === 0 ? '#ece4d0' : G[4]); q.R(29, 44, 6, 2, G[2]);
    }
  }, [1, 1, 0.6]);
  p.R(0, 50, 64, 3, G[4]); p.R(0, 50, 64, 1, G[5]); p.R(0, 53, 64, 11, '#5a2a14');
  for (let x = 2; x < 64; x += 10) { txBevel(p, x, 55, 8, 7, '#7a3a1c', true, 0.3); p.P(x + 4, 58, G[4]); }
};
const PR_GOLD_PB = ['#4a2c08', '#7a5010', '#a8781c', '#d0a038', '#ecc864', '#fff0b0'];
TX_VARS.puebloRetablo = 3;

// --- la façade, en coordonnées du monde : X depuis l'axe de la porte (case 30 : -0,5..0,5 ; façade -5,5..5,5),
// Z la hauteur. Rend une couleur, PB_SEE au-dessus du fronton chantourné (ciel), ou null (le mur nu de la mission).
function pbFacadeAt(X, Z, n) {
  const ax = Math.abs(X), C = PB_CANTERA.map(txRGB), cant = (i) => txK(C[clamp(i, 0, 5)], 0.95 + n * 0.1);
  // silhouette : fronton central, volutes qui descendent vers les ailes, pinacles
  let top = 2.42;
  if (ax <= 0.95) top = 3.1;
  else if (ax <= 2.55) { const t = (ax - 0.95) / 1.6; top = 2.44 + 0.66 * (1 - t) ** 1.4 + 0.1 * Math.sin(t * Math.PI); }
  for (const [px, w, h] of [[2.7, 0.15, 2.82], [5.32, 0.18, 2.74]]) if (Math.abs(ax - px) < w) top = Math.max(top, 2.42 + (h - 2.42) * (1 - Math.abs(ax - px) / w));
  if (Z > top) {
    if ((ax < 0.045 && Z < 3.19) || (Math.abs(Z - 3.09) < 0.025 && ax < 0.13)) return txRGB('#2a2422'); // la croix de fer
    return PB_SEE;
  }
  if (Z > top - 0.06) return cant(Z > top - 0.02 ? 5 : 4); // chaperon de cantera
  // l'espadaña : un arc ouvert dans le fronton, sa cloche
  const ar = Math.hypot(X, Math.max(0, Z - 2.62));
  if (Z > 2.4 && ar < 0.3) {
    const bz = (2.74 - Z) / 0.26, bw = 0.07 + 0.11 * clamp(bz, 0, 1) ** 1.4;
    if (Z > 2.47 && Z < 2.74 && ax < bw) return txRGB(PB_BRONZE[clamp(Math.round(4 - (X + bw) / (2 * bw) * 3 - (Z < 2.5 ? 1 : 0)), 0, 5)]);
    if (Z > 2.74 && Z < 2.78 && ax < 0.16) return txRGB('#4a2e18'); // le joug
    return PB_SEE;
  }
  if (Z > 2.4 && ar < 0.36) return cant(Z > 2.62 && X < 0 ? 4 : 2);
  // corniche
  if (Z > 1.98 && Z < 2.09) return cant(Z > 2.06 ? 5 : Z > 2.02 ? 3 : 1);
  if (Z > 1.94 && Z <= 1.98) return txRGB('#7a6a5a'); // ombre sous la corniche
  // pilastres des ailes et des angles
  if ((ax > 2.5 && ax < 2.78) || ax > 5.18) return cant(ax - (ax > 5 ? 5.18 : 2.5) < 0.05 ? 4 : 2 + (n > 0.5 ? 1 : 0));
  // soubassement
  if (Z < 0.1) return cant(Z > 0.08 ? 4 : 1);
  // le portail : colonnes torses, chapiteaux, entablement, tympan à coquille au-dessus de la porte
  if (ax < 1.08 && Z > 1.42 && Z < 1.52) return cant(Z > 1.49 ? 5 : Z > 1.45 ? 3 : 1);
  if (ax > 0.5 && ax < 0.9) {
    if (Z < 1.42 && Z > 1.33) return cant(Z > 1.39 ? 5 : 3);
    if (Z < 0.2) return cant(Z > 0.17 ? 4 : 2);
    if (Z < 1.33 && ax > 0.55 && ax < 0.85) { const t = Math.sin((Z * 14 + (X > 0 ? -1 : 1) * ax * 18) * 1.0); return cant(t > 0.45 ? 5 : t > -0.2 ? 3 : 1); }
    if (Z < 1.33) return txRGB('#8a7a64');
  }
  if (ax <= 0.5 && Z >= 1.0 && Z < 1.42) {
    const r = Math.hypot(X, Z - 1.02);
    if (r < 0.36) { const a = Math.atan2(Z - 1.02, X), s = (a / Math.PI) * 9; return cant(Math.abs(s - Math.round(s)) < 0.18 ? 1 : r < 0.08 ? 2 : 4 - (r > 0.3 ? 1 : 0)); }
    if (r < 0.46) { const a = Math.atan2(Z - 1.02, X), s = (a / Math.PI) * 7; return Math.abs(s - Math.round(s)) < 0.06 ? txRGB('#4a3426') : cant(r < 0.4 ? 2 : 4); }
    return cant(3);
  }
  // l'étage : l'óculo étoilé et ses pilastres
  if (Z > 1.52 && Z < 1.98) {
    if (ax > 0.55 && ax < 0.74) return cant(ax < 0.6 ? 4 : 2);
    const r = Math.hypot(X, (Z - 1.75) * 1.0);
    if (r < 0.17) {
      const a = Math.atan2(Z - 1.75, X), star = 0.1 + 0.06 * Math.cos(a * 8);
      return r < star ? txRGB(r < 0.04 ? '#fff0b0' : '#e0a838') : Math.abs(Math.sin(a * 4)) < 0.12 ? txRGB('#2a1e14') : txRGB(Z > 1.75 ? '#3a4a5a' : '#2a3440');
    }
    if (r < 0.22) return cant(Z > 1.75 && X < 0 ? 5 : 3);
  }
  // les niches et leurs saints, de part et d'autre du portail
  const nx = ax - 1.68;
  if (Math.abs(nx) < 0.27 && Z > 0.92 && Z < 1.78) {
    const inN = (g) => Z < 1.52 ? Math.abs(nx) < 0.18 + g : Math.hypot(nx, Z - 1.52) < 0.18 + g;
    if (inN(0) && Z > 1.0) {
      const robe = X < 0 ? '#2e4e8a' : '#6a3a22', h = Math.abs(nx);
      if (Z > 1.42 && Z < 1.5 && h < 0.045) return txRGB('#d8a882');
      if (Z > 1.04 && Z < 1.42 && h < 0.03 + (1.42 - Z) * 0.12) return txRGB(nx < 0 ? shade(robe, 0.25) : robe);
      return txK(txRGB('#3a2a22'), 0.75 + (Z - 1.0) * 0.2);
    }
    if (inN(0.06) || (Z <= 1.0 && Math.abs(nx) < 0.24)) return cant(Z <= 1.0 ? (Z > 0.97 ? 5 : 3) : nx < 0 ? 4 : 2);
  }
  return null;
}
// pose la façade : base (0..1) ou fronton (1..3,2) d'une case de façade (dx : rang depuis la porte)
function pbFacade(c, rand, dx, up) {
  const nz = txNoise(rand, 2);
  txField(c, (x, y) => {
    const X = dx - 0.5 + (x + 0.5) / 64, Z = up ? 3.2 - ((y + 0.5) * 2.2) / 64 : 1 - (y + 0.5) / 64;
    return pbFacadeAt(X, Z, nz(x, y));
  });
}
TX_WALLS.puebloFacade = (p, rand, c, v) => { pbPlaster(c, rng(hash('w:puebloLime')), PB_LIME, { brick: '#b8a284', thr: 0.78, y0: 10, y1: 56 }); pbFacade(c, rand, v - 5, false); };
TX_WALLS.puebloMissionUp = (p, rand, c, v) => { pbPlaster(c, rng(hash(`w:puebloLime:${v & 1}`)), PB_LIME, { brick: '#b8a284', thr: 0.8, y0: 30, y1: 62 }); pbFacade(c, rand, v - 5, true); };
TX_VARS.puebloFacade = 11; TX_VARS.puebloMissionUp = 11;

// --- le clocher (au-dessus de 1, de 1 à 4) : fût chaulé et son horloge, corniche, l'arc de la cloche ouvert sur le
// ciel (v0 et v2 : la cloche, devant à l'ouest et à l'est, l'horloge à cheval sur leur joint ; v1 : arc vide, la rangée de
// derrière), corniche haute, merlons et pinacles d'angle
TX_WALLS.puebloBelfry = (p, rand, c, v) => {
  pbPlaster(c, rng(hash('w:puebloLime')), PB_LIME, { brick: '#b8a284', thr: 0.78, y0: 24, y1: 62 });
  const nz = txNoise(rand, 2), C = PB_CANTERA.map(txRGB), H = 4.0;
  txField(c, (x, y) => {
    const X = (x + 0.5) / 64, Z = H - ((y + 0.5) * (H - 1)) / 64, n = nz(x, y), cant = (i) => txK(C[i], 0.95 + n * 0.1);
    const ex = Math.min(X, 1 - X);
    // couronnement : merlons aux angles, petit fronton au milieu
    if (Z > 3.62) {
      const t = ex < 0.14 ? 3.98 - ex * 0.6 : 3.72 + 0.06 * Math.cos((X - 0.5) * Math.PI * 2);
      if (Z > t) return PB_SEE;
      return cant(Z > t - 0.05 ? 5 : ex < 0.14 ? 3 : 2);
    }
    if (Z > 3.5) return cant(Z > 3.59 ? 5 : Z > 3.54 ? 3 : 1);
    if (Z > 2.55 && Z < 2.66) return cant(Z > 2.63 ? 5 : Z > 2.59 ? 3 : 1);
    if (Z > 2.52 && Z <= 2.55) return txRGB('#6a5a4c'); // ombre sous la corniche
    if (ex < 0.1 && Z > 2.66) return cant(X < 0.5 ? 4 : 2); // jambages
    // l'arc et la cloche
    const r = Math.hypot(X - 0.5, Math.max(0, Z - 3.12));
    if (Z > 2.66 && r < 0.3) {
      if (v !== 1) {
        const bz = (3.26 - Z) / 0.4, bw = 0.07 + 0.13 * clamp(bz, 0, 1) ** 1.5, bx = X - 0.5;
        if (Z > 2.86 && Z < 3.26 && Math.abs(bx) < bw) return txRGB(PB_BRONZE[clamp(Math.round(4.4 - ((bx + bw) / (2 * bw)) * 3.6 - (Z < 2.9 ? 1.5 : 0)), 0, 5)]);
        if (Z > 2.82 && Z <= 2.86 && Math.abs(bx) < 0.03) return txRGB(PB_BRONZE[1]); // le battant
        if (Z > 3.26 && Z < 3.33 && Math.abs(bx) < 0.26) return txRGB(Z > 3.3 ? '#6a4628' : '#3e2616'); // le joug
      }
      return PB_SEE;
    }
    if (Z > 2.66 && r < 0.35) return txRGB(Z > 3.12 || X < 0.5 ? '#4a3a30' : '#8a7462'); // l'intrados dans l'ombre
    if (Z > 2.66 && r < 0.41) return cant(Z > 3.12 && X < 0.5 ? 5 : 3);
    // l'horloge sur le fût (les cases du devant) : cadran blanc, chiffres, aiguilles
    const ox = v === 0 ? 1 : 0, cr = Math.hypot(X - ox, Z - 2.15);
    if (v !== 1 && cr < 0.24) {
      if (cr > 0.2) return cant(Z > 2.15 ? 4 : 2);
      const a = Math.atan2(Z - 2.15, X - ox), hand = (Math.abs(X - ox) < 0.014 && Z > 2.15 && Z < 2.33) || (Math.abs(Z - 2.15) < 0.014 && X > ox && X < ox + 0.12);
      if (hand) return txRGB('#1a1410');
      return cr > 0.16 && Math.abs(Math.sin(a * 6)) < 0.2 ? txRGB('#2a2420') : txRGB(cr < 0.03 ? '#2a2420' : '#f4eee0');
    }
    return null;
  });
};
TX_VARS.puebloBelfry = 3;

// --- arcade de l'hacienda (au-dessus de 1 sur un linteau à 1,02 : v = variante du mur) : arc en plein cintre posé
// sur les colonnes (objets puebloColumn aux joints des cases), écoinçons chaulés, le ciel ou le portal au travers.
// v4 / v5 : les deux moitiés du zaguán (linteau à 1,45, de 1 à 2,3) : arc surbaissé à claveaux, clé datée
TX_WALLS.puebloArch = (p, rand, c, v) => {
  const wv = v < 4 ? v : 1, P = PB_WALL[wv];
  pbPlaster(c, rand, P.lime, { brick: P.brick, y0: 6, y1: 30, thr: 0.76 });
  const C = PB_CANTERA.map(txRGB), nz = txNoise(rand, 2);
  if (v < 4) {
    p.R(0, 0, 64, 5, shade(P.lime, 0.12)); p.R(0, 0, 64, 1, shade(P.lime, 0.3)); p.R(0, 5, 64, 1, shade(P.lime, -0.35));
    txField(c, (x, y) => {
      const X = (x + 0.5) / 64 - 0.5, Z = 2.0 - ((y + 0.5) * 1.0) / 64, r = Math.hypot(X, Math.max(0, Z - 1.06) * 1.0);
      if (Z < 1.06 && Math.abs(X) < 0.47) return PB_SEE;
      if (r < 0.47 && Z >= 1.06) return PB_SEE;
      if (r < 0.55) { const a = Math.atan2(Z - 1.06, X), s = (a / Math.PI) * 9; return Math.abs(s - Math.round(s)) < 0.07 ? txRGB('#6a4a36') : txK(C[r < 0.5 ? 3 : 4], 0.95 + nz(x, y) * 0.1); }
      if (Z < 1.12) return txK(C[Z > 1.09 ? 5 : 2], 1); // imposte
      return null;
    });
    return;
  }
  // zaguán : arc surbaissé de 2 cases (X de 0 à 2), naissance à 1,45, flèche à 2,05
  txField(c, (x, y) => {
    const X = (v - 4) + (x + 0.5) / 64, Z = 2.3 - ((y + 0.5) * 1.3) / 64, ex = (X - 1) / 1.0, rise = Z - 1.45;
    const e = Math.hypot(ex, rise / 0.6);
    if (rise < 0 || e < 0.94) return PB_SEE;
    if (e < 1.12) { const a = Math.atan2(rise / 0.6, ex), s = (a / Math.PI) * 13; if (Math.abs(ex) < 0.07 && e < 1.14) return txK(C[5], 1); return Math.abs(s - Math.round(s)) < 0.08 ? txRGB('#5a3e2c') : txK(C[e < 1.0 ? 2 : 4], 0.95 + nz(x, y) * 0.1); }
    if (Z > 2.22) return txK(C[Z > 2.27 ? 5 : 3], 1);
    return null;
  });
  if (v === 4) txText((x, y, w, h) => p.R(x, y, w, h, '#3a2416'), '17', 57, 6, '#3a2416'); else txText((x, y, w, h) => p.R(x, y, w, h, '#3a2416'), '81', 1, 6, '#3a2416');
};
TX_VARS.puebloArch = 6;
// pilier d'angle de l'arcade : maçonnerie chaulée, base et chapiteau de cantera
TX_WALLS.puebloPillar = (p, rand, c) => {
  const P = PB_WALL[1];
  pbPlaster(c, rand, P.lime, { brick: P.brick, thr: 0.75 });
  txBevel(p, 0, 0, 64, 6, PB_CANTERA[4], true, 0.25); txBevel(p, 2, 6, 60, 3, PB_CANTERA[3], true, 0.2);
  txBevel(p, 0, 54, 64, 10, PB_CANTERA[3], true, 0.25);
  for (const x of [4, 59]) { p.R(x, 9, 1, 45, shade(P.lime, x < 32 ? 0.2 : -0.3)); }
};

// =================================================================== murets, fontaine, étals, four
// muret d'adobe chaulé sous un chaperon de tuiles (v0 blanc, v1 ocre) ; tout est étiré sur sa hauteur (0,55 à 0,6)
TX_WALLS.puebloAdobeLow = (p, rand, c, v) => {
  const P = PB_WALL[v ? 1 : 0];
  pbPlaster(c, rand, P.lime, { brick: P.brick, y0: 16, y1: 50, thr: 0.66 });
  pbBand(c, rand, v ? P.band : '#8a7a68', 54);
  // tuiles canal vues de face (demi-cylindres), ombre portée sur le mur
  p.R(0, 0, 64, 10, '#4a1a0c');
  for (let x = 0; x < 64; x += 8) {
    for (let i = 1; i < 8; i++) p.R(x + i, 1, 1, 7, prPick(PB_CLAY, prLit((i - 0.5) / 7) * 0.9 + 0.08));
    p.R(x + 1, 8, 7, 1, PB_CLAY[1]); p.P(x + 2, 2, PB_CLAY[5]);
  }
  p.R(0, 0, 64, 1, PB_CLAY[4]); p.R(0, 10, 64, 2, shade(P.lime, -0.4));
  grain(c, 0, 0, 64, 10, rand, 0.08, 0.4);
};
TX_VARS.puebloAdobeLow = 2;
// bassin de fontaine en cantera (v0 : la plaza, l'eau en haut ; v1 : puits ou pila, moellons, l'eau sombre)
TX_WALLS.puebloFountain = (p, rand, c, v) => {
  const C = PB_CANTERA.map(txRGB), nz = txFbm(rand, [16, 8, 4]), nz2 = txNoise(rand, 2);
  if (v) {
    txField(c, (x, y) => (y < 2 ? txRGB(y ? '#2a4a5a' : '#4a7a8a') : null));
    const m = txCellMap(rand, -4, false, 4), pal = ['#9a8a74', '#a8987e', '#8a7a64', '#b4a488'].map(txRGB), cols = m.pts.map(() => txPick(rand, pal));
    txField(c, (x, y) => { if (y < 2) return null; const k = y * 64 + x; return m.e[k] < 1.2 ? txRGB('#4a3e30') : txK(cols[m.id[k]], txCellLight(m, x, y) * (0.92 + nz2(x, y) * 0.12)); });
    p.R(0, 2, 64, 6, '#b8a88c'); p.R(0, 2, 64, 1, '#d8ccb0'); p.R(0, 7, 64, 1, '#6a5a48');
    return;
  }
  txField(c, (x, y) => {
    if (y < 2) return txRGB(y ? '#4a8ab0' : '#8ac0d8'); // l'eau (dessus du bassin, vu à cheval)
    const k = 0.93 + nz(x, y) * 0.1 + (nz2(x, y) - 0.5) * 0.05;
    if (y < 12) return txK(C[y < 4 ? 5 : y < 9 ? 4 : y < 11 ? 2 : 1], k); // margelle moulurée
    if (y > 54) return txK(C[y < 57 ? 4 : 2], k); // socle
    const u = x % 32;
    if (u < 3 || u > 29) return txK(C[u < 3 ? 4 : 2], k); // pilastres
    return txK(C[3], k);
  });
  // médaillons de talavera entre les pilastres
  const T = A.TX_TALAVERA;
  for (const ox of [9, 41]) {
    p.R(ox - 1, 21, 16, 25, '#4a3426'); p.R(ox, 22, 14, 23, '#ece6d6');
    for (const [tx, ty, pat] of [[ox, 22, T.A], [ox + 7, 22, T.B], [ox, 33, T.B], [ox + 7, 33, T.A]]) pat.forEach((row, j) => [...row].forEach((ch, i) => { if (T.col[ch]) p.P(tx + i, ty + j + (j > 3 ? 1 : 0), T.col[ch]); }));
  }
  p.R(0, 12, 64, 1, '#3a2a20');
  for (let i = 0; i < 10; i++) p.P(rand() * 64, 47 + rand() * 7, '#5a7a4a'); // mousse au pied
};
TX_VARS.puebloFountain = 2;
// étals du mercado (murs bas de 0,55) : v0 fruits dans des cagettes, v1 piments, maïs et haricots dans des paniers,
// v2 poteries ; devant, un sarape rayé tendu sous le plateau
TX_WALLS.puebloStall = (p, rand, c, v) => {
  p.R(0, 0, 64, 64, '#3a2414');
  p.R(0, 0, 64, 3, '#a87a4a'); p.R(0, 0, 64, 1, '#d0a46a'); p.R(0, 3, 64, 1, '#2a1a0c');
  const w = txWP(p);
  if (v === 0) {
    for (let k = 0; k < 4; k++) {
      const x = k * 16, fr = ['#e8901a', '#8ac83a', '#e8c020', '#d83a2a'][k];
      p.R(x + 1, 6, 14, 22, '#8a6038'); p.R(x + 1, 6, 14, 1, '#b08458');
      for (let j = 0; j < 9; j++) { const fx = x + 3 + (j % 3) * 4, fy = 7 + Math.floor(j / 3) * 3; p.disc(fx + 1, fy + 1, 2, shade(fr, -0.25)); p.R(fx, fy, 2, 2, fr); p.P(fx, fy, shade(fr, 0.4)); }
      for (const y of [18, 24]) { p.R(x + 1, y, 14, 2, '#a07448'); p.R(x + 1, y + 2, 14, 1, '#4a2a14'); }
    }
  } else if (v === 1) {
    for (let k = 0; k < 4; k++) {
      const x = k * 16 + 8, goods = [['#b8201a', '#e04a30'], ['#e8c040', '#f8e080'], ['#5a2a1a', '#8a4a2a'], ['#2e6a2a', '#5aa040']][k];
      w.ell(x, 9, 7, 3, goods[0]); for (let i = 0; i < 12; i++) w.P(x - 6 + rand() * 12, 7 + rand() * 4, goods[1]);
      for (let y = 11; y < 28; y++) { const hw = 7 - Math.floor((y - 11) / 8); for (let i = -hw; i <= hw; i++) w.P(x + i, y, (i + y) % 3 ? '#b08a4a' : '#7a5a2a'); }
      w.R(x - 7, 11, 15, 1, '#d8b070');
    }
  } else {
    for (let k = 0; k < 5; k++) {
      const x = 6 + k * 13, h = 10 + ((k * 5) % 7), top = 28 - h;
      for (let y = top; y < 28; y++) { const t = (y - top) / h, hw = Math.round(3 + 3 * Math.sin(Math.PI * Math.min(1, t * 1.15))); prCyl(p, x - hw, y, 2 * hw + 1, 1, PB_CLAY, -0.05); }
      p.R(x - 2, top - 1, 5, 2, PB_CLAY[4]); p.R(x - 4, top + Math.round(h * 0.45), 9, 1, '#ece4d0'); p.R(x - 4, top + Math.round(h * 0.45) + 1, 9, 1, '#2c5a9c');
    }
    p.R(0, 28, 64, 2, '#8a6038'); p.R(0, 28, 64, 1, '#b08458');
  }
  // le devant : sarape rayé (raies de couleur vive, liserés, franges)
  const SR = ['#c8302a', '#e8a020', '#2a8a7a', '#ece2cc', '#6a2a6a', '#e86a20', '#2c5a9c'];
  for (let y = 30; y < 60; y++) {
    const band = Math.floor((y - 30) / 3) % SR.length, col = SR[(band + v * 2) % SR.length];
    for (let x = 0; x < 64; x++) p.P(x, y, (y % 3 === 0 && (x + y) % 4 === 0) ? shade(col, -0.3) : col);
  }
  for (let x = 0; x < 64; x += 2) { p.R(x, 60, 1, 3, '#ece2cc'); p.P(x + 1, 61, '#8a7a68'); }
  grain(c, 0, 30, 64, 30, rand, 0.06, 0.4);
};
TX_VARS.puebloStall = 3;
// lambrequin festonné des bâches (au-dessus de 1, de 1 à 1,4 sur un linteau à 1,02) : v = bâche A, B, C
// lignes 0-1 : le dessous de la bâche (vu en passant sous le linteau) ; au-dessus de la perche, le ciel ; en bas, les festons
TX_WALLS.puebloValance = (p, rand, c, v) => {
  const [a, b] = PB_STRIPE[v];
  txField(c, (x, y) => {
    if (y < 2) return txRGB(Math.floor(x / 8) % 2 ? a : b);
    if (y < 14) return PB_SEE;
    if (y < 18) return txRGB(y === 14 ? '#8a6038' : y < 17 ? '#5a3a22' : '#2a1a0c'); // la perche
    const k = x % 16, sc = 46 + Math.round(8 * Math.sin((Math.PI * (k + 0.5)) / 16));
    if (y > sc) return PB_SEE;
    const col = txRGB(Math.floor(x / 8) % 2 ? a : b);
    return txK(col, y === sc ? 0.7 : y < 21 ? 0.82 : 0.96 + ((x % 8) === 0 ? -0.12 : 0));
  });
  for (let x = 4; x < 64; x += 16) { p.P(x, 40, '#f0d040'); p.P(x + 8, 42, '#f0d040'); } // pompons brodés
  pbSee(c, (x, y) => y >= 2 && y < 14);
};
TX_VARS.puebloValance = 3;

// =================================================================== sols et plafonds
// empedrado de la plaza : galets de rivière serrés, joints de terre, une bande de dalles tous les 32 px (guías)
TX_FLATS.puebloCobble = (p, rand, c) => {
  const m = txCellMap(rand, -7, true, 3), pal = ['#9a9288', '#a89c8c', '#8a8278', '#b4a894', '#948a7c', '#7e786e'].map(txRGB);
  const cols = m.pts.map(() => txPick(rand, pal)), nz = txNoise(rand, 2), dirt = txRGB('#7a6448');
  txField(c, (x, y) => {
    if (x % 32 < 3 || y % 32 < 3) { const e = (x % 32 < 3 ? x % 32 : y % 32); return txK(txRGB('#c4b498'), (e === 0 ? 1.1 : e === 2 ? 0.82 : 1) * (0.93 + nz(x, y) * 0.12)); }
    const k = y * 64 + x;
    if (m.e[k] < 1.5) return txK(dirt, 0.8 + nz(x, y) * 0.3);
    return txK(cols[m.id[k]], txCellLight(m, x, y, 1) * (0.92 + nz(x, y) * 0.14));
  });
  grain(c, 0, 0, 64, 64, rand, 0.05, 0.5);
};
// champ d'agaves : sillons de terre retournée, herbes sèches
TX_FLATS.puebloField = (p, rand, c) => {
  const a = txRGB('#8a6644'), nz = txFbm(rand, [16, 8, 4]), nz2 = txNoise(rand, 2);
  txField(c, (x, y) => {
    const t = (y + Math.round((nz(x, 0) - 0.5) * 3)) % 16;
    const k = t < 2 ? 1.18 : t < 8 ? 1.04 : t < 12 ? 0.9 : 0.78;
    return txK(a, k * (0.92 + nz2(x, y) * 0.14));
  });
  const w = txWP(p, true);
  for (let i = 0; i < 14; i++) { const x = rand() * 64, y = Math.floor(rand() * 4) * 16 + 4; w.line(x, y, x + 2, y - 3, txPick(rand, ['#b8a060', '#9a8a4a', '#c8b070'])); w.line(x, y, x - 1, y - 3, '#8a7a40'); }
  for (let i = 0; i < 10; i++) w.P(rand() * 64, rand() * 64, '#5a4430');
  grain(c, 0, 0, 64, 64, rand, 0.06, 0.5);
};
// sol de la nef : grandes dalles de terre cuite cerclées de cantera
TX_FLATS.puebloNaveFloor = (p, rand, c) => {
  const nz = txFbm(rand, [16, 8, 4]), nz2 = txNoise(rand, 2), tc = Array.from({ length: 4 }, () => txRGB(txPick(rand, ['#a8583a', '#b0603e', '#9a5034', '#b86a44'])));
  txField(c, (x, y) => {
    const u = x % 32, v = y % 32;
    if (u < 4 || v < 4) return txK(txRGB('#c8b090'), (u === 0 || v === 0 ? 1.1 : u === 3 || v === 3 ? 0.8 : 1) * (0.94 + nz2(x, y) * 0.1));
    let k = 0.9 + nz(x, y) * 0.16;
    if (u === 4 || v === 4) k *= 1.1; else if (u === 31 || v === 31) k *= 0.85;
    return txK(tc[(y >> 5) * 2 + (x >> 5)], k);
  });
  grain(c, 0, 0, 64, 64, rand, 0.05, 0.4);
};
// plafond à vigas et latillas : deux rondins par case, entre eux des branchages posés en chevrons
TX_FLATS.puebloVigaCeil = (p, rand, c) => {
  const nz = txNoise(rand, 2);
  txField(c, (x, y) => {
    const u = x % 32, d = (u - 7.5) / 6.5;
    if (Math.abs(d) <= 1) { const k = prLit((d + 1) / 2) * 0.8 + 0.25; return txK(txRGB('#8a5e36'), k * (0.94 + nz(x, y) * 0.1) * (((y + u * 3) % 11) === 0 ? 0.8 : 1)); }
    if (Math.abs(d) <= 1.25) return txRGB('#2a1a0e');
    // latillas en chevrons (bois écorcé clair), joints sombres
    const s = ((u > 16 ? y + x : y - x) % 4 + 4) % 4;
    return txK(txRGB(s === 0 ? '#4a3420' : s === 1 ? '#c8a878' : '#a88a5e'), 0.9 + nz(x, y) * 0.15);
  });
  grain(c, 0, 0, 64, 64, rand, 0.05, 0.4);
};
// bâches rayées du mercado vues de dessous (le soleil passe au travers) : A rouge, B bleue, C verte et jaune
for (const [k, id] of ['puebloAwningA', 'puebloAwningB', 'puebloAwningC'].entries()) {
  TX_FLATS[id] = (p, rand, c) => {
    const [a, b] = PB_STRIPE[k].map(txRGB), nz = txFbm(rand, [16, 8], [0.6, 0.4]), nz2 = txNoise(rand, 2);
    txField(c, (x, y) => {
      const col = Math.floor(x / 8) % 2 ? a : b, sag = Math.sin((Math.PI * (y % 32)) / 32);
      return txK(col, (0.82 + sag * 0.22 + (nz(x, y) - 0.5) * 0.1) * (x % 8 === 0 ? 0.8 : 1) * (0.97 + nz2(x, y) * 0.05));
    });
    for (let x = 0; x < 64; x += 2) { p.P(x, 0, '#3a2a1a'); p.P(x + 1, 32, '#3a2a1a'); } // coutures
  };
}

// =================================================================== objets du décor
// Ristra : piments rouges séchés en grappe sous une tête d'ail, pendue à sa ficelle (hang)
function prRistra() {
  return sprite(14, 40, (p) => {
    const { R, P } = p, r = rng(77);
    R(0, -39, 1, 8, '#a89060'); P(0, -40 + 1, '#5a4a30');
    p.disc(0, -30, 2.5, '#e8e0cc'); P(-1, -31, '#ffffff'); P(1, -29, '#b8b0a0');
    for (let y = -27; y <= -2; y += 2) for (const dx of [-3, -1, 1, 3]) {
      if (Math.abs(dx) === 3 && (y < -24 || y > -6)) continue;
      const x = dx + ((y >> 1) & 1 ? 0 : -1), col = txPick(r, ['#b4201a', '#9a1a14', '#c83020', '#8a1810', '#d03a28']);
      R(x, y, 2, 3, col); P(x, y, shade(col, 0.35)); P(x + 1, y + 2, '#4a0a08');
    }
    R(-1, -1, 2, 2, '#3a6a2a');
  });
}
// Veladoras : gradins de cierges dans leurs verres rouges, allumés, sur un pied de fer
function prVotive() {
  return sprite(30, 30, (p) => {
    const { R, P } = p;
    for (const [y, w] of [[-4, 13], [-10, 10], [-16, 7]]) { R(-w, y, 2 * w + 1, 2, '#2a2420'); R(-w, y, 2 * w + 1, 1, '#5a504a'); }
    R(-12, -3, 1, 4, '#2a2420'); R(12, -3, 1, 4, '#2a2420');
    for (const [y, w] of [[-4, 13], [-10, 10], [-16, 7]]) for (let x = -w + 1; x < w; x += 3) {
      const col = (x + y) % 2 ? '#c8302a' : '#e8a020';
      R(x, y - 4, 2, 4, col); P(x, y - 4, shade(col, 0.4)); P(x, y - 5, '#fff0a0'); P(x, y - 6, '#f8b830');
    }
  });
}
// Croix atriale de cantera sur son piédestal à degrés : couronne d'épines au croisement, INRI
function prCruzAtrial() {
  return sprite(40, 76, (p, c) => {
    const { R, P } = p, C = PB_CANTERA;
    for (const [y, w, h] of [[-4, 17, 5], [-9, 14, 5], [-22, 10, 13]]) { prCyl(p, -w, y - h + 1, 2 * w + 1, h, C, 0.05); R(-w, y - h + 1, 2 * w + 1, 1, C[5]); }
    R(-11, -23, 23, 2, C[4]);
    prCyl(p, -3, -66, 7, 44, C, 0.1); prCyl(p, -14, -56, 29, 6, C, 0.15); R(-14, -56, 29, 1, C[5]); R(-14, -51, 29, 1, C[1]);
    for (const [x, y] of [[-4, -67], [3, -67], [-15, -57], [14, -57]]) R(x, y, 2, 2, C[4]); // fleurons
    prRing(p, 0, -53, 3, 5, (a) => (Math.sin(a * 6) > 0 ? '#5a4030' : C[2]));
    R(-2, -64, 5, 4, '#ece2cc'); P(-1, -63, '#5a3a2a'); P(1, -63, '#5a3a2a');
    grain(c, 0, 0, c.width, c.height, rng(61), 0.08, 0.4);
    for (const [x, col] of [[-12, '#e8a020'], [10, '#e86a20'], [-8, '#f0c030']]) { R(x, -6, 3, 2, col); P(x + 1, -7, shade(col, 0.3)); }
  });
}
// Croix de bois peinte d'un tertre du camposanto : bleu ciel à liseré rose, couronne de cempasúchil, fleurs en papier
function prCrossPainted() {
  return sprite(22, 42, (p, c) => {
    const { R, P, ell } = p;
    ell(0, 0, 9, 2, '#6a4628'); ell(-1, -1, 7, 1, '#8a5e36');
    R(-2, -34, 4, 34, '#3a7ac0'); R(-2, -34, 1, 34, '#6aa8e0'); R(1, -34, 1, 34, '#24508a');
    R(-8, -27, 17, 4, '#3a7ac0'); R(-8, -27, 17, 1, '#6aa8e0'); R(-8, -24, 17, 1, '#24508a');
    for (const [x, y] of [[-8, -26], [8, -26], [0, -34]]) P(x, y, '#e84a8a');
    R(-1, -31, 2, 1, '#e84a8a'); R(-6, -25, 12, 1, '#e8e0d0');
    prRing(p, 0, -25, 3, 5, (a) => (Math.sin(a * 5) > 0.2 ? '#f0a020' : '#e86a10')); P(0, -25, '#3a7ac0');
    grain(c, 0, 0, c.width, c.height, rng(19), 0.06, 0.3);
    for (const [x, col] of [[-7, '#f0a020'], [-4, '#e84a8a'], [3, '#f0a020'], [6, '#f0f0f0'], [-1, '#e86a10']]) { R(x, -3, 2, 2, col); P(x, -4, shade(col, 0.4)); P(x + 1, -1, '#3a6a2a'); }
  });
}
// Agave bleu (maguey) en pleine terre : rosace de feuilles charnues en lame, épine terminale, bords dentés
function prAgave() {
  return sprite(56, 44, (p) => {
    const { P, poly, line } = p, G = A.PR_AGAVE;
    const leaves = [[-2.95, 25, 0], [-0.2, 25, 0], [-2.7, 27, 0], [-0.45, 27, 0], [-2.35, 29, 1], [-0.8, 29, 1], [-2.05, 32, 1], [-1.1, 32, 1], [-1.57, 33, 2], [-2.5, 22, 2], [-0.65, 22, 2], [-1.85, 26, 2], [-1.3, 26, 2]];
    for (const [a, len, layer] of leaves) {
      const bx = 0, by = -3, ca = Math.cos(a), sa = Math.sin(a) * 1.15, nx = -Math.sin(a), ny = Math.cos(a), w = 3.4;
      const tip = [bx + ca * len, by + sa * len];
      const lit = layer * 0.22 + (ca < 0 ? 0.18 : 0) + 0.2;
      poly([[bx + nx * w, by + ny * w], [bx + ca * len * 0.55 + nx * w * 0.9, by + sa * len * 0.55 + ny * w * 0.9], tip, [bx + ca * len * 0.55 - nx * w * 0.7, by + sa * len * 0.55 - ny * w * 0.7], [bx - nx * w, by - ny * w]], prPick(G, lit));
      line(bx, by, bx + ca * (len - 3), by + sa * (len - 3), prPick(G, lit + 0.22));
      for (let k = 6; k < len - 3; k += 5) P(bx + ca * k + nx * w * 0.85, by + sa * k + ny * w * 0.85, '#5a3a20');
      P(tip[0], tip[1], '#3a1e10'); P(tip[0] - ca, tip[1] - sa, '#7a4a2a');
    }
    p.ell(0, 0, 14, 2, '#5a4430');
  });
}
// Ollas : grande jarre à eau, cántaro à anse et comal posé contre, terre cuite peinte de bandes et de fleurs
function prOllas() {
  return sprite(34, 30, (p, c) => {
    const { R, P, ell } = p;
    ell(1, 0, 15, 2, '#5a4430');
    const pot = (cx, h, rw, band) => {
      for (let y = -h; y <= 0; y++) { const t = (y + h) / h, hw = Math.max(2, Math.round(rw * Math.sin(Math.PI * Math.min(1, 0.18 + t * 0.9)))); prCyl(p, cx - hw, y, 2 * hw + 1, 1, PB_CLAY, -0.05); }
      R(cx - 3, -h - 2, 7, 2, PB_CLAY[4]); R(cx - 2, -h - 2, 5, 1, PB_CLAY[1]);
      const by = -Math.round(h * 0.55);
      for (let x = -rw + 1; x < rw; x++) { P(cx + x, by, band); P(cx + x, by - 2, '#ece4d0'); if ((x & 3) === 0) P(cx + x, by - 1, '#2a6a3a'); }
    };
    pot(-6, 22, 9, '#2c5a9c'); pot(8, 15, 6, '#c8302a');
    R(13, -12, 2, 4, PB_CLAY[2]); P(14, -13, PB_CLAY[4]);
    ell(-12, -4, 4, 5, PB_CLAY[1]); ell(-12, -4, 3, 4, PB_CLAY[3]); P(-13, -6, PB_CLAY[5]); // le comal, debout
    grain(c, 0, 0, c.width, c.height, rng(33), 0.07, 0.35);
  });
}
// La vasque de la fontaine : fût, coupe d'où l'eau retombe en nappe, pomme de pin au sommet (le bassin la cache en bas)
function prFountainTop() {
  return sprite(64, 92, (p) => {
    const { R, P } = p, C = PB_CANTERA;
    prCyl(p, -4, -60, 9, 60, C, 0.05);
    for (const y of [-40, -24]) { prCyl(p, -6, y, 13, 3, C, 0.12); }
    // la coupe (taza) vue un peu d'en dessous : lèvre, galbe
    for (let y = -70; y <= -60; y++) { const hw = Math.round(9 + (y + 70) * -0.6 + 10); prCyl(p, -hw, y, 2 * hw + 1, 1, C, y < -67 ? 0.2 : 0); }
    R(-19, -71, 39, 2, C[5]); R(-18, -72, 37, 1, '#8ac0d8');
    // nappe d'eau qui retombe de la coupe (tramée, reflets)
    for (let x = -21; x <= 21; x++) {
      if (Math.abs(x) < 12) continue;
      for (let y = -69; y <= -36 + Math.abs(x) * 0.2; y++) {
        const t = prB(x, y);
        if (t < 0.55) P(x + Math.sign(x) * Math.round((y + 69) * 0.06), y, t < 0.15 ? '#e8f4fa' : t < 0.35 ? '#9ad0ec' : '#5a9ac0');
      }
    }
    // la pomme de pin et le jet
    prCyl(p, -2, -80, 5, 9, C, 0.1); p.disc(0, -82, 3, C[4]); P(-1, -83, C[5]);
    for (let y = -91; y < -84; y++) P(0, y, y % 2 ? '#e8f4fa' : '#9ad0ec');
    P(-1, -88, '#9ad0ec'); P(1, -89, '#e8f4fa');
  });
}
// Laurier des Indes de la plaza : gros tronc au pied chaulé, houppier dense et rond, lumière en haut à gauche
function prLaurel() {
  return sprite(136, 152, (p, c) => {
    const { R, P, line } = p, r = rng(4242);
    // tronc et maîtresses branches
    for (let y = -64; y <= 0; y++) { const hw = Math.round(5 + (y > -10 ? (y + 10) * 0.5 : 0) + (y < -50 ? (-50 - y) * 0.25 : 0)); prCyl(p, -hw, y, 2 * hw + 1, 1, y > -22 ? ['#8a8478', '#b0aa9c', '#d8d2c4', '#ece8de', '#f8f4ec', '#ffffff'] : ['#2a2018', '#3e3024', '#5a4634', '#6e5a44', '#8a7458', '#a08a6a'], 0); }
    for (let x = -5; x <= 5; x++) P(x, -22 + Math.round(Math.sin(x * 1.3)), '#a8a294'); // bord irrégulier de la chaux
    line(-3, -60, -22, -84, '#3e3024', 3); line(3, -60, 24, -88, '#3e3024', 3); line(0, -62, 2, -96, '#3e3024', 3);
    // houppier : des boules de feuillage, ombrées par la pente du champ, feuillage tramé
    const blobs = [];
    for (let k = 0; k < 26; k++) { const a = r() * 6.283, d = r() * 1; blobs.push([Math.cos(a) * 44 * d, -108 + Math.sin(a) * 28 * d - 4, 16 + r() * 12, 1]); }
    blobs.push([0, -112, 34, 1.2], [-30, -96, 22, 1], [30, -98, 22, 1]);
    for (let y = -151; y <= -66; y++) for (let x = -67; x <= 67; x++) {
      const v = prField(blobs, x, y);
      if (v <= 0.18) continue;
      const g = prField(blobs, x - 3, y - 3) - prField(blobs, x + 3, y + 3);
      let t = clamp(0.38 + g * 0.6 + (y < -120 ? 0.1 : 0) - (y > -84 ? 0.18 : 0), 0, 1);
      if (A.prN(x >> 1, y >> 1, 7) > 0.8) t += 0.18; else if (A.prN(x >> 1, y >> 1, 9) > 0.82) t -= 0.2;
      P(x, y, PB_LEAF[clamp(Math.floor(t * 5.99 + (prB(x, y) - 0.5) * 0.8), 0, 5)]);
    }
    void R;
  });
}
// Guirlande de papel picado : six drapeaux de papier découpé sur une ficelle qui ploie (hang)
function prPicado() {
  return sprite(64, 18, (p) => {
    const { R, P } = p;
    const sag = (x) => -16 + Math.round(3 * Math.sin((Math.PI * (x + 32)) / 64));
    for (let x = -32; x < 32; x++) P(x, sag(x), '#6a5a4a');
    for (let k = 0; k < 6; k++) {
      const fx = -31 + k * 11, fy = sag(fx + 4) + 1, col = PB_PICADO[(k * 3) % PB_PICADO.length], cd = shade(col, -0.3);
      R(fx, fy, 9, 11, col); R(fx, fy, 9, 1, cd);
      for (let i = 0; i < 9; i += 2) P(fx + i, fy + 11, col);
      // découpes : losange, fleur, points (on voit au travers)
      for (const [dx, dy] of [[4, 3], [3, 4], [5, 4], [4, 5], [2, 7], [6, 7], [4, 8]]) p.ctx.clearRect(32 + fx + dx, 17 + fy + dy, 1, 1);
      P(fx + 1, fy + 2, cd); P(fx + 7, fy + 2, cd);
    }
  });
}
// Colonne de cantera de l'arcade (base, fût galbé, chapiteau toscan) : jusqu'au linteau, à 1,02
function prColumn() {
  return sprite(16, 66, (p, c) => {
    const { R } = p, C = PB_CANTERA;
    prCyl(p, -6, -3, 13, 4, C, 0.05); R(-6, -3, 13, 1, C[5]); prCyl(p, -5, -6, 11, 3, C, 0.1);
    for (let y = -58; y < -6; y++) { const hw = y < -40 ? 3 : 4; prCyl(p, -hw, y, 2 * hw + 1, 1, C, 0.08); }
    prCyl(p, -5, -61, 11, 3, C, 0.15); prCyl(p, -7, -65, 15, 4, C, 0.2); R(-7, -65, 15, 1, C[5]);
    grain(c, 0, 0, c.width, c.height, rng(71), 0.06, 0.4);
  });
}
// Burro : âne gris de profil (tête à droite), museau et ventre clairs, croix sombre sur le garrot, bât de paniers
function prBurro() {
  return sprite(48, 40, (p, c) => {
    const { R, P, ell, line } = p;
    const G = ['#2e2a28', '#4a4440', '#6a625c', '#8a8078', '#a89e94', '#d4ccc0'];
    for (const [x, d] of [[-13, 0], [-9, 1], [8, 1], [12, 0]]) { R(x, -12, 3, 12, G[1 + d]); R(x, -1, 3, 1, '#1a1614'); }
    ell(0, -17, 15, 7, G[2]); ell(-1, -19, 13, 5, G[3]); R(-12, -15, 24, 3, G[4]); ell(0, -13, 11, 2, G[4]);
    ell(-15, -18, 3, 4, G[2]); line(-17, -18, -19, -9, G[1], 2); P(-19, -8, '#1a1614'); // la queue
    // encolure et tête, grandes oreilles
    p.poly([[10, -22], [15, -30], [21, -30], [17, -18]], G[3]); ell(20, -26, 4, 4, G[3]); ell(23, -22, 3, 3, G[5]); P(24, -23, '#1a1614');
    P(19, -28, '#1a1614'); line(17, -30, 15, -38, G[2], 2); line(19, -30, 19, -38, G[3], 2); P(15, -38, '#1a1614'); P(19, -38, '#1a1614');
    R(9, -26, 2, 6, G[1]); line(-6, -24, 10, -24, G[1]); // crinière et raie de mulet
    // bât : couverture rayée et deux paniers d'osier
    R(-8, -26, 14, 4, '#c8302a'); R(-8, -25, 14, 1, '#e8a020'); R(-8, -23, 14, 1, '#2a8a7a');
    for (const x of [-9, 2]) { R(x, -21, 7, 8, '#a8844a'); for (let y = -21; y < -13; y += 2) R(x, y, 7, 1, '#7a5a2a'); R(x, -22, 7, 1, '#d0aa68'); }
    grain(c, 0, 0, c.width, c.height, rng(45), 0.06, 0.35);
  });
}
// Four à poteries en briques (une coupole : vue de partout pareille, d'où un objet plutôt que des murs) : rangs de
// briques, gueule du foyer et ses braises, suie au-dessus, l'évent au sommet
function prKiln() {
  return sprite(100, 70, (p, c) => {
    const { R, P, ell } = p, r = rng(91), brick = ['#a8502e', '#b85c36', '#9a4628', '#c0663e'];
    ell(0, 0, 48, 3, '#4a3426');
    for (let y = -62; y <= 0; y++) for (let x = -47; x <= 47; x++) {
      const X = x / 47, Z = -y / 62, top = Math.sqrt(Math.max(0, 1 - X * X)) * (1 - 0.08 * X * X);
      if (Z > top) continue;
      const row = Math.floor(-y / 4), u = Math.asin(clamp(X / Math.max(0.2, Math.sqrt(1 - Z * Z)), -1, 1)) * 14 + (row % 2) * 3;
      const joint = -y % 4 === 0 || Math.abs(u - Math.round(u / 6) * 6) < 0.5;
      const nx = X, nz = Z, k = clamp(0.62 + 0.42 * (-nx * 0.55 + nz * 0.6 + 0.3), 0.45, 1.15);
      const soot = Math.abs(x) < 16 - (Z - 0.25) * 12 && Z > 0.2 ? 0.55 + A.prN(x >> 1, y >> 1, 3) * 0.3 : 1;
      P(x, y, shade(joint ? '#5a3a2a' : brick[(row * 3 + Math.round(u / 6)) & 3], (k * soot - 1) * 0.9));
    }
    // la gueule : arc noir, braises qui rougeoient
    for (let y = -20; y <= 0; y++) for (let x = -10; x <= 10; x++) if (y > -12 || Math.hypot(x, y + 12) < 10) P(x, y, y > -4 ? (A.prN(x, y, 5) > 0.5 ? '#f8a030' : '#c84010') : '#140a06');
    for (let x = -12; x <= 12; x++) { const yy = x * x < 100 ? -12 - Math.round(Math.sqrt(100 - x * x)) - 1 : -12; P(x, yy, '#d8885a'); }
    ell(0, -61, 5, 1.5, '#1a0e08');
    for (let k = 0; k < 14; k++) P(-2 + r() * 6, -64 - r() * 5, k % 2 ? '#8a8078' : '#b4aca4'); // un filet de fumée
    void R;
  });
}
Object.assign(PR_DECO, {
  puebloRistra: [1, prRistra], puebloVotive: [1, prVotive], puebloCruzAtrial: [1, prCruzAtrial], puebloCrossPainted: [1, prCrossPainted],
  puebloAgave: [1, prAgave], puebloOllas: [1, prOllas], puebloFountainTop: [1, prFountainTop], puebloLaurel: [1, prLaurel],
  puebloPicado: [1, prPicado], puebloColumn: [1, prColumn], puebloBurro: [1, prBurro], puebloKiln: [1, prKiln],
});

// murs intérieurs dessinés du sol au plafond (frise en haut, soubassement en bas) : fps.js les étire sur toute la hauteur
for (const id of ['puebloWhiteIn', 'puebloWhiteInWin', 'puebloNave', 'puebloNaveWin', 'puebloRetablo']) A.TX_TALL[id] = true;
