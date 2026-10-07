// Dessins de la carte « Bitter Creek » du FPS (fpsmaps/ghost.js) : murs, sols et objets enregistrés dans les registres
// de fpsart.js (TX_WALLS / TX_VARS / TX_FLATS / PR_DECO). Chargé par fps.js.
// Une ville morte : planches grisées par le soleil (des restes de peinture, des planches arrachées), enseignes presque
// effacées, saloon calciné (charbon de bois en écailles, braises), église chaulée qui pèle et son clocher penché
// découpé sur le ciel (couleur SEE, transparente en jeu), moulin à bocards, gibet.
import * as A from './fpsart.js';

const { TX_WALLS, TX_VARS, TX_FLATS, PR_DECO, TW2_SEE: SEE, shade, clamp, rng, hash, sprite, grain, txField, txK, txRGB, txLerp, txMod, txPick, txFbm, txNoise,
  txCellMap, txCellLight, txWP, txTimber, txVBoards, txFloorBoards, txText, txTextW, txRevealWin, prCyl, prPick, prRing, PR_GREY, PR_IRON, PR_STONE } = A;

const GH_SEE = txRGB(SEE);
const GH_WOOD = '#8a8072'; // planche grisée par le soleil
const GH_PAINT = [null, '#a0584a', '#6a7c8c', '#b89c66']; // restes de peinture : aucune, rouge, bleu, ocre
const GH_ASH = ['#0c0908', '#1e1816', '#2c2522', '#3e3632', '#5a524c', '#7a726a'];
const GH_BRONZE = ['#1a2018', '#2a3e30', '#46624a', '#6a7a4a', '#8a8448', '#b8a868']; // bronze vert-de-grisé

// =================================================================== outils
// Bardage à clins grisé : veinage étiré, chant des planches, plaques de peinture qui tiennent encore, clous et coulures
// de rouille ; parfois une planche arrachée (on voit la charpente et le noir de la pièce). Rend le rang de cette planche.
function ghSiding(p, rand, c, v, o = {}) {
  const base = txRGB(GH_WOOD), paint = txRGB(GH_PAINT[v] || '#d8d2c4');
  const grainN = txFbm(rand, [16, 8, 4]), fine = txNoise(rand, 2), pm = txFbm(rand, [16, 8], [0.6, 0.4]);
  const tone = Array.from({ length: 8 }, () => 0.88 + rand() * 0.2);
  const thr = GH_PAINT[v] ? 0.5 : 0.6;
  const gap = o.gap ?? (rand() < 0.7 ? Math.floor(rand() * 7) : -1);
  const gx0 = Math.floor(rand() * 40), gw = 12 + Math.floor(rand() * 18);
  const stud = txRGB('#4a3626'), dark = txRGB('#141010');
  txField(c, (x, y) => {
    const b = y >> 3, u = y & 7;
    if (b === gap && u > 0 && txMod(x - gx0) < gw) return txMod(x - 4) % 32 < 5 ? txK(stud, 0.8 + fine(x, y) * 0.3) : txK(dark, 0.8 + fine(x, y) * 0.5);
    let col = base, k = tone[b] * (0.84 + grainN(x, b * 8 + u * 0.3) * 0.3) * (0.95 + fine(x, y) * 0.1);
    if (pm(x, y) > thr && u > 1 && u < 7) { col = paint; k = 0.9 + fine(x, y) * 0.12; }
    if (u === 0) k *= 0.45; else if (u === 1) k *= 0.72; else if (u === 7) k *= 1.18;
    return txK(col, k);
  });
  const w = txWP(p);
  for (let b = 0; b < 8; b++) {
    if (b === gap) continue;
    const jx = Math.floor(rand() * 60) + 2;
    p.R(jx, b * 8 + 1, 1, 7, '#2a2420'); // about de planche
    for (const nx of [6, 38]) {
      p.P(nx, b * 8 + 4, '#2a2018');
      if (rand() < 0.45) { const n = 2 + Math.floor(rand() * 4); for (let k = 1; k <= n; k++) p.P(nx, b * 8 + 4 + k, k === n ? '#8a5a3a' : '#6e4428'); }
    }
    if (rand() < 0.5) w.R(rand() * 64, b * 8 + 3 + Math.floor(rand() * 3), 6 + rand() * 14, 1, '#4a4238'); // fente du bois
  }
  if (gap >= 0) for (const ex of [gx0, gx0 + gw - 1]) for (let k = 0; k < 6; k++) w.P(ex + (k & 1 ? 0 : ex === gx0 ? -1 : 1), gap * 8 + 1 + k, '#6a6256'); // échardes
  grain(c, 0, 0, 64, 64, rand, 0.05, 0.4);
}
// Charbon de bois : planches verticales calcinées en écailles (reflet argenté sur le haut des écailles), crevasses noires,
// le pied moins brûlé (le bois brun sous la ligne burn), quelques braises
function ghChar(p, rand, c, o = {}) {
  const nz = txFbm(rand, [16, 8, 4]), fine = txNoise(rand, 2);
  const off = Array.from({ length: 8 }, () => Math.floor(rand() * 7)), bh = Array.from({ length: 8 }, () => 5 + Math.floor(rand() * 3));
  const tone = Array.from({ length: 64 }, () => 0.78 + rand() * 0.4), split = Array.from({ length: 64 }, () => 2 + Math.floor(rand() * 4));
  const wood = txRGB('#5a3e28'), ch = txRGB('#2e2724'), sheen = txRGB('#76706a'), black = txRGB('#0a0706');
  const burn = o.burn ?? 46;
  txField(c, (x, y) => {
    const b = x >> 3, u = x & 7;
    if (u === 0) return txRGB('#0c0908'); // le joint des planches
    const t = y + off[b], row = Math.floor(t / bh[b]), v = t % bh[b], id = (b * 9 + row) & 63;
    const un = clamp((y - burn - (nz(x, 0) - 0.5) * 20) / 14, 0, 1);
    if (v === 0 || (u === split[id] && v > 1 && un < 0.5)) return txLerp(black, txK(wood, 0.5), un * 0.6); // les crevasses
    let col = txLerp(ch, wood, un), k = tone[id] * (0.92 + fine(x, y) * 0.14);
    if (v === 1 && un < 0.4) col = txLerp(col, sheen, 0.55); // le haut de l'écaille, qui brille
    else if (v === bh[b] - 1) k *= 0.7;
    if (u === 1) k *= 1.1; else if (u === 7) k *= 0.8;
    return txK(col, k);
  });
  for (let i = 0; i < (o.embers ?? 3); i++) { const x = Math.floor(rand() * 64), y = Math.floor(rand() * 40); p.P(x, y, '#c84a1a'); if (rand() < 0.5) p.P(x + 1, y, '#f08a2a'); }
  grain(c, 0, 0, 64, 64, rand, 0.05, 0.4);
}
// Planches verticales et couvre-joints passés à la chaux (l'église) : la chaux s'écaille et montre le bois gris
function ghWhite(p, rand, c, thr = 0.68) {
  const peel = txFbm(rand, [16, 8, 4]), fine = txNoise(rand, 2), streak = txNoise(rand, 4);
  const lime = txRGB('#e4e0d4'), wood = txRGB('#a09684');
  txField(c, (x, y) => {
    const u = x & 15, bare = peel(x, y) > thr;
    let k = 0.93 + fine(x, y) * 0.1 - Math.max(0, streak(x * 4, y * 0.5) - 0.7) * 0.4;
    if (u < 3) k *= u === 0 ? 1.15 : u === 2 ? 0.7 : 1.05; // le couvre-joint
    else if (u === 3) k *= 0.6; else if (u === 9) k *= 0.85;
    if (bare && peel(x, y - 1) <= thr) k *= 0.7; // bord de l'écaille
    return txK(bare ? wood : lime, k);
  });
  grain(c, 0, 0, 64, 64, rand, 0.04, 0.4);
}
// Lancette (fenêtre en arc brisé) : dedans, dehors. Vitrail : plombs, verres de couleur, beaucoup de carreaux cassés
const ghArch = (x, y, r = 0) => y <= 56 - r && Math.abs(x + 0.5 - 32) <= 10 - r && (y >= 26 || (Math.hypot(x + 0.5 - 22, y + 0.5 - 26) <= 20 - r && Math.hypot(x + 0.5 - 42, y + 0.5 - 26) <= 20 - r));
function ghLancet(c, rand, inside) {
  const glass = ['#a83a2a', '#2e4a8a', '#c8962a', '#3a6a3a', '#7a3a7a'].map(txRGB), fine = txNoise(rand, 2);
  const trim = txRGB('#8a8478'), hole = inside ? txRGB('#c8d4dc') : txRGB('#120e0c');
  txField(c, (x, y) => {
    if (!ghArch(x, y)) return null;
    if (!ghArch(x, y, 2)) return txK(trim, (x < 32 ? 1.1 : 0.8) * (0.92 + fine(x, y) * 0.1));
    if (x % 6 === 1 || y % 7 === 3) return txRGB('#1e1a18'); // les plombs
    const cell = Math.floor(x / 6) * 13 + Math.floor(y / 7) * 7, h = A.prN(cell, 3, 11);
    if (h < 0.42) return txK(hole, inside ? 0.9 + (y / 64) * 0.2 : 1); // carreau cassé
    return txK(glass[cell % 5], (inside ? 1.25 : 0.7) * (0.9 + fine(x, y) * 0.2));
  });
}

// =================================================================== bardage grisé des bâtiments abandonnés
TX_WALLS.ghostPlank = (p, rand, c, v) => ghSiding(p, rand, c, v);
// fenêtre : vitres cassées (des éclats restent dans le cadre, un croisillon pend), ou condamnée par deux planches en croix
TX_WALLS.ghostPlankWindow = (p, rand, c, v) => {
  ghSiding(p, rand, c, v, { gap: -1 });
  const x0 = 21, x1 = 43, y0 = 13, y1 = 43, fr = '#6e665a', mx = (x0 + x1) >> 1, my = (y0 + y1) >> 1;
  p.R(x0 - 5, y0 - 6, x1 - x0 + 10, 3, shade(fr, 0.1)); p.R(x0 - 5, y0 - 3, x1 - x0 + 10, 1, '#2a2620'); // le fronton
  p.R(x0 - 3, y0 - 3, x1 - x0 + 6, y1 - y0 + 6, fr); p.R(x0 - 3, y0 - 3, x1 - x0 + 6, 1, shade(fr, 0.25)); p.R(x0 - 3, y1 + 2, x1 - x0 + 6, 1, '#2a2620');
  p.R(x0, y0, x1 - x0, y1 - y0, '#120e0c'); p.R(x0, y1 - 8, x1 - x0, 8, '#1a1410');
  if (v % 2 === 0) {
    p.R(mx - 1, y0, 2, y1 - y0, '#4a4238'); p.R(x0, my - 1, mx - x0, 2, '#4a4238');
    p.poly([[x0, y0], [x0 + 8, y0], [x0, y0 + 11]], '#7a8a96'); p.poly([[mx + 1, y0], [x1, y0], [x1, y0 + 6], [x1 - 6, y0 + 2]], '#5a6a76');
    p.poly([[x1, my + 1], [x1, y1], [x1 - 9, y1]], '#7a8a96'); p.poly([[x0, y1], [x0 + 5, y1 - 7], [x0 + 9, y1]], '#9aaab4');
    p.line(x0 + 1, y0 + 1, x0 + 6, y0 + 1, '#c8d4dc'); p.line(x1 - 2, my + 4, x1 - 2, y1 - 2, '#b8c4cc');
    p.line(mx + 2, my + 1, x1 - 3, y1 - 9, '#4a4238', 2); // le croisillon décroché
    p.R(x0 - 4, y1 + 3, x1 - x0 + 8, 2, shade(fr, 0.15)); // l'appui
  } else {
    for (const [ax, ay, bx, by] of [[x0 - 4, y0 + 2, x1 + 3, y1 - 3], [x0 - 4, y1 - 3, x1 + 3, y0 + 2]]) {
      p.line(ax, ay, bx, by, '#9a8e7c', 5); p.line(ax, ay - 2, bx, by - 2, '#b4a892'); p.line(ax, ay + 2, bx, by + 2, '#4a4238');
    }
    for (const [nx, ny] of [[x0 - 2, y0 + 2], [x1 + 1, y0 + 2], [x0 - 2, y1 - 3], [x1 + 1, y1 - 3]]) p.P(nx, ny, '#2a2018');
  }
};
// porte condamnée : planches clouées en travers, « KEEP OUT » barbouillé à la peinture
TX_WALLS.ghostPlankDoor = (p, rand, c, v) => {
  ghSiding(p, rand, c, v, { gap: -1 });
  const x0 = 19, x1 = 45, top = 10;
  p.R(x0 - 3, top - 4, x1 - x0 + 6, 68 - top, '#6a6256'); p.R(x0 - 3, top - 4, x1 - x0 + 6, 1, '#9a9282');
  txVBoards(p, rand, c, x0, top, x1 - x0, 64 - top, '#5a4a3a', 6, '#241c14');
  for (const y of [16, 36, 52]) {
    const t = Math.round(rand() * 4 - 2);
    p.poly([[x0 - 4, y + t], [x1 + 4, y - t], [x1 + 4, y - t + 6], [x0 - 4, y + t + 6]], '#9a8e7c');
    p.line(x0 - 4, y + t, x1 + 4, y - t, '#b8ac96'); p.line(x0 - 4, y + t + 6, x1 + 4, y - t + 6, '#3a3228');
    p.P(x0 - 2, y + t + 3, '#2a2018'); p.P(x1 + 2, y - t + 3, '#2a2018');
  }
  if (v % 2 === 0) { const s = 'KEEP OUT', tx = 32 - (txTextW(s, 1, 1) >> 1); txText(p.R, s, tx + 1, 27, '#2a2018', 1, 1); txText(p.R, s, tx, 26, '#d8d0c0', 1, 1); }
};
// au-dessus de 1 : la fausse façade, sa corniche à modillons, le bord du haut arraché (le ciel par les trous)
TX_WALLS.ghostPlankUp = (p, rand, c, v) => {
  ghSiding(p, rand, c, v, { gap: -1 });
  const nz = txNoise(rand, 8), notch = Math.floor(rand() * 48) + 6, nw = 6 + Math.floor(rand() * 8);
  p.R(0, 5, 64, 5, '#7a7264'); p.R(0, 5, 64, 1, '#a49a88'); p.R(0, 9, 64, 1, '#2a2620');
  for (let x = 2; x < 64; x += 8) { p.R(x, 10, 3, 3, '#6a6256'); p.R(x, 12, 3, 1, '#2a2620'); }
  txField(c, (x, y) => (y < 1 + Math.round(nz(x, 0) * 4) + (txMod(x - notch) < nw ? 10 + ((x * 7) % 3) : 0) ? GH_SEE : null), 0, 0, 64, 20);
};
// enseigne peinte à même les planches, presque effacée (v = mot * 4 + variante du mur) : un panneau plus sombre autour
const GH_WORDS = ['HOTEL', 'ASSAY', 'BARBER', 'SALOON', 'MERCANTILE', 'SADDLERY', 'FEED', 'LAND OFFICE'];
TX_WALLS.ghostSign = (p, rand, c, v) => {
  const wv = v & 3, word = GH_WORDS[v >> 2];
  TX_WALLS.ghostPlankUp(p, rng(hash(`w:ghostPlankUp:${wv}`)), c, wv);
  const [s, g] = [[2, 2], [2, 1], [1, 1]].find(([a, b]) => txTextW(word, a, b) <= 56), tw = txTextW(word, s, g), tx = 32 - (tw >> 1), ty = 34 - ((5 * s) >> 1);
  const mask = new Uint8Array(64 * 64);
  txText((x, y, w, h) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (x + i >= 0 && x + i < 64 && y + j >= 0 && y + j < 64) mask[(y + j) * 64 + x + i] = 1; }, word, tx, ty, null, s, g);
  const wear = txFbm(rand, [8, 4], [0.6, 0.4]), ink = txRGB(wv === 3 ? '#4a2a1e' : '#ece4d0'), board = txRGB('#3a3632');
  txField(c, (x, y, cur) => {
    if (mask[y * 64 + x]) return txLerp(cur, ink, clamp(0.85 - wear(x, y) * 0.6, 0.15, 0.8));
    if (x > tx - 6 && x < tx + tw + 5 && y > ty - 6 && y < ty + 5 * s + 5) return txLerp(cur, board, 0.22 * clamp(1.2 - wear(x + 9, y), 0, 1));
    return null;
  });
};
Object.assign(TX_VARS, { ghostPlank: 4, ghostPlankWindow: 4, ghostPlankDoor: 4, ghostPlankUp: 4, ghostSign: 32 });

// =================================================================== dedans : papier peint arraché, lattis
const GH_PAPER = [['#b08a7a', '#c8a494', '#8a5a52'], ['#7a8a6a', '#94a482', '#4e5e44']];
TX_WALLS.ghostIn = (p, rand, c, v) => {
  const tear = txFbm(rand, [16, 8, 4]), stain = txFbm(rand, [32, 16], [0.6, 0.4]), fine = txNoise(rand, 2);
  if (v === 2) txVBoards(p, rand, c, 0, 0, 64, 54, '#6a5a48', 8, '#2a2018'); // planches nues (bureau du shérif)
  const [a, b, d] = (GH_PAPER[v] || GH_PAPER[0]).map(txRGB);
  txField(c, (x, y, cur) => {
    if (y >= 54) return txK(txRGB('#4a3a2a'), (y === 54 ? 1.3 : y === 55 ? 0.6 : 0.9) * (0.9 + fine(x, y) * 0.2)); // la plinthe
    const s = stain(x, y), wet = s > 0.62 ? clamp((s - 0.62) * 3, 0, 0.6) : 0;
    if (v === 2) return wet ? txLerp(cur, txRGB('#3a2a1a'), wet) : null;
    const t = tear(x, y);
    if (t > 0.6) {
      if (t < 0.63) return txRGB('#e0d4b8'); // le bord du papier, recroquevillé
      return y % 5 < 3 ? txK(txRGB('#8a6a48'), 0.85 + fine(x, y) * 0.3) : txRGB('#1e1610'); // le lattis
    }
    const u = x % 16;
    let col = u < 2 ? d : u < 8 ? a : b;
    if (u >= 10 && u <= 12 && (y + (x >> 4) * 8) % 16 === 4) col = d;
    return txK(wet ? txLerp(col, txRGB('#6a4a2a'), wet) : col, 0.92 + fine(x, y) * 0.12);
  });
  grain(c, 0, 0, 64, 64, rand, 0.04, 0.4);
};
TX_WALLS.ghostInWin = (p, rand, c, v) => {
  TX_WALLS.ghostIn(p, rng(hash(`w:ghostIn:${v}`)), c, v);
  txRevealWin(p, c, rand, { x0: 22, y0: 12, x1: 41, y1: 38, d: 3, lit: '#8a7a64', dark: '#4a3e30', frame: ['#5a4a3a', '#8a7a64'], flip: v === 1 });
  for (const [x, y, dx, dy] of [[26, 16, 1, 1], [26, 16, 1, -0.2], [37, 30, -1, 0.6]]) for (let k = 0; k < 6; k++) p.P(x + dx * k, y + dy * k, '#e8eef0'); // la vitre fêlée
};
Object.assign(TX_VARS, { ghostIn: 3, ghostInWin: 3 });

// =================================================================== le saloon calciné
TX_WALLS.ghostCharred = (p, rand, c, v) => ghChar(p, rand, c, { burn: v ? 36 : 48 });
// au-dessus de 1 : les planches ont brûlé, leurs bouts noircis pointent vers le ciel
TX_WALLS.ghostCharredUp = (p, rand, c, v) => {
  ghChar(p, rand, c, { burn: 80, embers: 5 });
  const nz = txNoise(rand, 4), nz2 = txNoise(rand, 16);
  txField(c, (x, y) => (y < 6 + Math.round(nz2(x, 0) * 26 + nz((x >> 3) * 8, 0) * 10 + (v ? 6 : 0)) + Math.abs((x & 7) - 3.5) * 1.6 ? GH_SEE : null));
};
// la fenêtre : le châssis a brûlé, un trou noir aux bords déchiquetés
TX_WALLS.ghostCharredWin = (p, rand, c) => {
  ghChar(p, rand, c, { burn: 50 });
  const nz = txNoise(rand, 4);
  txField(c, (x, y) => {
    const e = (nz(x, y) - 0.5) * 6;
    return x > 20 + e && x < 44 - e && y > 14 + e && y < 42 - e ? txK(txRGB('#0a0706'), y > 34 ? 1.4 : 1) : null;
  });
  for (let i = 0; i < 4; i++) p.P(21 + Math.floor(rand() * 22), 15 + Math.floor(rand() * 26), '#f08a2a');
};
// dedans : v0 le mur calciné ; v1 la fenêtre (le jour par le trou)
TX_WALLS.ghostCharredIn = (p, rand, c, v) => {
  ghChar(p, rand, c, { burn: 52, embers: 2 });
  if (!v) return;
  const nz = txNoise(rand, 4), sky = ['#9ab4c8', '#a8c0d0', '#bccad2', '#d4d0c0', '#d8c4a0'].map(txRGB);
  txField(c, (x, y) => {
    const e = (nz(x, y) - 0.5) * 6;
    return x > 20 + e && x < 44 - e && y > 12 + e && y < 40 - e ? sky[clamp(Math.floor((y - 10) / 6), 0, 4)] : null;
  });
};
Object.assign(TX_VARS, { ghostCharred: 2, ghostCharredUp: 2, ghostCharredIn: 2 });

// =================================================================== l'église
TX_WALLS.ghostChurch = (p, rand, c) => ghWhite(p, rand, c);
TX_WALLS.ghostChurchWin = (p, rand, c) => { ghWhite(p, rand, c); ghLancet(c, rand, false); };
// au-dessus de 1 : la chaux, puis la corniche
TX_WALLS.ghostChurchUp = (p, rand, c) => {
  ghWhite(p, rand, c, 0.55);
  p.R(0, 0, 64, 6, '#d8d4c8'); p.R(0, 0, 64, 1, '#f0ece2'); p.R(0, 5, 64, 1, '#6a665e'); p.R(0, 6, 64, 2, '#4a463e');
};
// Le clocher, au-dessus de la porte (étiré de 1 à 3,6 : une rangée de pixels pour 0,04) : rangées 39-63 le mur et
// son oculus (z 1-2), 37-39 la corniche, 20-37 le beffroi vide (la cloche est tombée : le ciel au travers, la poutre
// qui la tenait), puis la flèche de bardeaux qui penche, et sa croix de travers ; le ciel autour (SEE)
TX_WALLS.ghostSteeple = (p, rand, c) => {
  ghWhite(p, rand, c, 0.58);
  const shingle = txNoise(rand, 2);
  txField(c, (x, y) => {
    const X = x + 0.5;
    if (y >= 21 && y < 37) { // le beffroi : deux montants chaulés, l'arcade ouverte
      if (X < 9 || X > 55) return null;
      if (y < 24) return txK(txRGB('#d8d4c8'), y === 21 ? 1.1 : 0.85);
      if (y === 28 || y === 29) return X > 14 && X < 50 ? txRGB(y === 28 ? '#6a5440' : '#3a2a1e') : GH_SEE; // la poutre de la cloche
      if (y > 33) return txK(txRGB('#8a8478'), y === 34 ? 1.1 : 0.8); // l'appui des abat-sons
      return GH_SEE;
    }
    if (y >= 19 && y < 21) return txRGB('#2e2a26'); // l'avant-toit
    if (y < 19) {
      const t = (19 - y) / 17, cx = 32 + t * 9, hw = 30 * (1 - t) + 0.6;
      if (Math.abs(X - cx) > hw) return GH_SEE;
      const row = Math.floor(y / 2), sx = Math.floor((X - cx + 40 + (row & 1) * 2) / 4);
      const miss = A.prN(sx, row, 5) < 0.12; // bardeau envolé
      return miss ? txRGB('#1a1410') : txK(txRGB(X < cx ? '#7a746a' : '#5a564e'), (y % 2 === 0 ? 0.8 : 1) * (0.92 + shingle(x, y) * 0.14) * (sx & 1 ? 0.95 : 1.05));
    }
    if (y >= 37 && y < 39) return txK(txRGB('#d8d4c8'), y === 37 ? 1.15 : 0.7);
    // l'oculus au-dessus de la porte : un rond, ses carreaux cassés
    const d = Math.hypot(X - 32, (y + 0.5 - 51) * 1.6);
    if (d < 9) return d > 7.5 ? txRGB('#8a8478') : txK(txRGB(A.prN(x >> 2, y >> 1, 3) < 0.5 ? '#120e0c' : '#2e4a8a'), 0.9);
    return null;
  });
  // la croix, de travers au bout de la flèche
  p.line(41, 0, 42, 4, '#2a2420'); p.line(39, 1, 44, 2, '#2a2420');
};
TX_WALLS.ghostChurchIn = (p, rand, c) => {
  ghWhite(p, rand, c, 0.66);
  txVBoards(p, rand, c, 0, 44, 64, 20, '#6a5444', 8, '#2a1e14'); // le lambris
  p.R(0, 43, 64, 2, '#4a3a2c'); p.R(0, 43, 64, 1, '#8a7058');
};
TX_WALLS.ghostChurchInWin = (p, rand, c) => { TX_WALLS.ghostChurchIn(p, rng(hash('w:ghostChurchIn:0')), c, 0); ghLancet(c, rand, true); };

// =================================================================== le moulin à bocards
// planches brutes disjointes sur une charpente de gros bois ; v1 : avec une contrefiche
TX_WALLS.ghostMill = (p, rand, c, v) => {
  txVBoards(p, rand, c, 0, 0, 64, 64, '#6e6252', 7, '#0e0a08');
  const T = '#4e3e2c';
  txTimber(p, rand, 0, 0, 6, 64, T); txTimber(p, rand, 58, 0, 6, 64, T);
  txTimber(p, rand, 0, 0, 64, 5, T, true); txTimber(p, rand, 0, 30, 64, 6, T, true);
  if (v === 1) for (let k = -2; k <= 2; k++) p.line(6, 61 + k, 58, 37 + k, k === -2 ? '#7a6248' : k === 2 ? '#22180e' : T);
  for (const [x, y] of [[3, 2], [61, 2], [3, 33], [61, 33]]) { p.P(x, y, '#1a1410'); p.P(x, y + 1, '#8a5a3a'); }
  grain(c, 0, 0, 64, 64, rand, 0.05, 0.4);
};
// une batterie de pilons (mur à 1,25, sous le toit) : l'arbre à cames en haut, les tiges, leurs bossages, la boîte à mortier
TX_WALLS.ghostStamps = (p, rand, c, v) => {
  p.R(0, 0, 64, 64, '#16120e');
  txTimber(p, rand, 0, 0, 5, 64, '#5a4630'); txTimber(p, rand, 59, 0, 5, 64, '#5a4630');
  prCyl({ R: (x, y, w, h, col) => p.R(y + 0, x, h, w, col) }, 6, 0, 7, 64, PR_IRON, 0); // l'arbre à cames (couché)
  for (let k = 0; k < 4; k++) {
    const x = 9 + k * 13 + (v ? 3 : 0), lift = ((k * 7 + v * 3) % 4) * 3;
    p.R(x - 3, 5, 9, 3, '#2a2c30'); p.P(x + 4, 5, '#8a8f98'); // la came
    p.R(x, 13 - lift, 3, 36, '#5c626c'); p.R(x, 13 - lift, 1, 36, '#b8bec6'); p.R(x + 2, 13 - lift, 1, 36, '#24282e');
    p.R(x - 2, 20 - lift, 7, 5, '#3e434c'); p.R(x - 2, 20 - lift, 7, 1, '#8a8f98'); // le bossage
    p.R(x - 3, 42 - lift, 9, 7, '#3e434c'); p.R(x - 3, 42 - lift, 9, 1, '#8a8f98'); // le sabot
  }
  txTimber(p, rand, 0, 48, 64, 16, '#4a3a2a', true);
  for (const x of [4, 32, 58]) { p.R(x, 48, 2, 16, '#2a2c30'); p.P(x, 52, '#8a8f98'); p.P(x, 59, '#8a8f98'); }
  for (let i = 0; i < 12; i++) p.P(6 + rand() * 52, 47, txPick(rand, ['#8a8478', '#a8a094', '#6a645c'])); // du minerai broyé
};
// gravats (mur bas) : planches et poutres effondrées en vrac ; v1 calcinées
TX_WALLS.ghostRubble = (p, rand, c, v) => {
  const w = txWP(p);
  p.R(0, 0, 64, 64, '#1a1410');
  const cols = v ? ['#3a302a', '#2a2420', '#4a3a2e', '#5a4a3a'] : ['#7a7064', '#8a8072', '#5a5246', '#6a5a48'];
  for (let i = 0; i < 30; i++) {
    const x = rand() * 64, y = 2 + rand() * 62, a = (rand() - 0.5) * 1.1, L = 10 + rand() * 26, bw = 3 + Math.floor(rand() * 4), col = txPick(rand, cols);
    const dx = (Math.cos(a) * L) / 2, dy = (Math.sin(a) * L) / 2;
    w.line(x - dx, y - dy, x + dx, y + dy, col, bw); w.line(x - dx, y - dy - (bw >> 1), x + dx, y + dy - (bw >> 1), shade(col, 0.25));
    w.line(x - dx, y - dy + (bw >> 1), x + dx, y + dy + (bw >> 1), shade(col, -0.45));
    if (rand() < 0.4) w.P(x, y, '#2a2018');
  }
  for (let i = 0; i < 5; i++) w.line(rand() * 64, rand() * 64, rand() * 64, rand() * 64, '#0e0a08'); // le noir entre les planches
  p.R(0, 0, 64, 2, v ? '#3a302a' : '#7a7064'); // le dessus du tas (couleur du dessus vu d'en haut)
  grain(c, 0, 0, 64, 64, rand, 0.06, 0.4);
};
Object.assign(TX_VARS, { ghostMill: 2, ghostStamps: 2, ghostRubble: 2 });

// =================================================================== sols
// terre alcaline craquelée : des plaques claires aux bords relevés, fentes sombres
TX_FLATS.ghostDust = (p, rand, c) => {
  const m = txCellMap(rand, 7, true, 6), nz = txFbm(rand, [32, 16, 8]), fine = txNoise(rand, 2);
  const base = txRGB('#cdb690'), crack = txRGB('#8a7254'), tone = m.pts.map(() => 0.94 + rand() * 0.1);
  txField(c, (x, y) => {
    const k = y * 64 + x;
    if (m.e[k] < 0.9) return txK(crack, 0.85 + fine(x, y) * 0.3);
    return txK(base, tone[m.id[k]] * (0.93 + nz(x, y) * 0.12) * (0.97 + fine(x, y) * 0.06) * (m.e[k] < 2.2 ? 1.07 : 1));
  });
  const w = txWP(p, true);
  for (let i = 0; i < 12; i++) w.P(rand() * 64, rand() * 64, txPick(rand, ['#9a8466', '#e0ccaa', '#7a6a58']));
  grain(c, 0, 0, 64, 64, rand, 0.05, 0.5);
};
// trottoir pourri : planches grisées, des planches manquent (le vide dessous, la terre dans l'ombre)
TX_FLATS.ghostBoards = (p, rand, c) => {
  txFloorBoards(p, rand, c, ['#8a8070', '#7e7466', '#948a78', '#746a5c'], '#2a241e');
  const holes = [[Math.floor(rand() * 8), Math.floor(rand() * 64), 10 + Math.floor(rand() * 16)], [Math.floor(rand() * 8), Math.floor(rand() * 64), 6 + Math.floor(rand() * 10)]];
  const dirt = txRGB('#3a2e22'), fine = txNoise(rand, 2);
  txField(c, (x, y) => {
    for (const [b, x0, w] of holes) {
      const u = txMod(x - x0);
      if (y >> 3 !== b || u >= w) continue;
      if ((u === 0 || u === w - 1) && (x + y) & 1) return null; // bout cassé
      return txK(dirt, (y & 7) === 0 ? 0.5 : 0.8 + fine(x, y) * 0.3);
    }
    return null;
  });
  grain(c, 0, 0, 64, 64, rand, 0.05, 0.4);
};
// plancher calciné : planches noircies, cendre, bouts de poutres, quelques braises
TX_FLATS.ghostAsh = (p, rand, c) => {
  txFloorBoards(p, rand, c, ['#2e2622', '#3a302a', '#26201c', '#423630'], '#0c0908');
  const ash = txFbm(rand, [16, 8, 4]), fine = txNoise(rand, 2), a1 = txRGB('#8a8480'), a2 = txRGB('#5a5450');
  txField(c, (x, y) => { const a = ash(x, y); return a > 0.55 ? txK(txLerp(a2, a1, clamp((a - 0.55) * 4, 0, 1)), 0.9 + fine(x, y) * 0.2) : null; });
  const w = txWP(p, true);
  for (let i = 0; i < 4; i++) { const x = rand() * 64, y = rand() * 64; w.R(x, y, 6 + rand() * 8, 2, '#141010'); w.R(x, y, 6, 1, '#3e3632'); }
  for (let i = 0; i < 6; i++) w.P(rand() * 64, rand() * 64, txPick(rand, ['#c84a1a', '#f08a2a']));
};
// plancher poussiéreux : la poussière par plaques, des pas, des débris (papier, verre, plâtre)
TX_FLATS.ghostFloor = (p, rand, c) => {
  txFloorBoards(p, rand, c, ['#6a5440', '#5e4a38', '#745c46', '#64503c'], '#241a12');
  const dust = txFbm(rand, [32, 16, 8]), fine = txNoise(rand, 2), D = txRGB('#a89474');
  txField(c, (x, y, cur) => txLerp(cur, D, clamp((dust(x, y) - 0.35) * 1.4, 0, 0.75) * (0.9 + fine(x, y) * 0.2)));
  const w = txWP(p, true);
  for (let k = 0; k < 4; k++) w.ell(10 + k * 12, 50 - k * 11 + (k & 1) * 4, 1.5, 2.5, '#6a5640');
  for (let i = 0; i < 7; i++) w.R(rand() * 64, rand() * 64, 2, 1, txPick(rand, ['#d8d0c0', '#3a2a1e', '#8a9aa4', '#e8e0d0']));
};

// =================================================================== objets du décor
// Le gibet : plateforme sur pieux et croix de Saint-André, l'escalier de treize marches, la potence et sa corde,
// deux corbeaux sur la traverse
function prGallows() {
  return sprite(150, 178, (p, c) => {
    const { R, P, line } = p, G = PR_GREY;
    const post = (x, y0, y1, w = 5) => { prCyl(p, x, y1, w, y0 - y1, G, -0.05); };
    // sous la plateforme : les pieux et leurs croix
    for (const x of [-46, -16, 12, 41]) post(x, 0, -55);
    for (const [a, b] of [[-46, -16], [-16, 12], [12, 41]]) { line(a + 4, -4, b, -50, G[2], 2); line(a + 4, -50, b, -4, G[1], 2); }
    // le plancher de la plateforme, la trappe
    R(-50, -60, 100, 6, G[3]); R(-50, -60, 100, 1, G[5]); R(-50, -55, 100, 1, G[1]);
    for (let x = -48; x < 50; x += 7) P(x, -57, G[1]);
    R(-9, -60, 18, 1, G[0]); R(-9, -60, 1, 6, G[0]); R(8, -60, 1, 6, G[0]); P(0, -58, '#5a5a60');
    // l'escalier (à gauche)
    line(-74, 0, -50, -58, G[2], 3);
    for (let k = 0; k < 8; k++) { const sx = -73 + k * 3, sy = -7 - k * 7; R(sx - 4, sy, 9, 2, G[4]); R(sx - 4, sy + 2, 9, 1, G[1]); }
    line(-70, 0, -46, -58, G[1], 2);
    // la potence : deux montants, la traverse, les jambes de force
    post(-32, -60, -152, 6); post(28, -60, -152, 6);
    R(-38, -158, 76, 7, G[3]); R(-38, -158, 76, 1, G[5]); R(-38, -152, 76, 1, G[1]);
    line(-26, -132, -14, -151, G[2], 3); line(28, -132, 16, -151, G[2], 3);
    // la corde, le nœud coulant
    for (let y = -151; y < -112; y++) P(0, y, y % 3 ? '#a8925a' : '#7a6438');
    R(-2, -114, 5, 8, '#8a7448'); for (let y = -113; y < -106; y += 2) R(-2, y, 5, 1, '#5a4828');
    prRing(p, 0, -97, 6, 8, (a) => (Math.sin(a * 3) > 0 ? '#a8925a' : '#7a6438'), 0.75);
    // les corbeaux sur la traverse
    for (const [x, d] of [[-24, 1], [18, -1]]) {
      p.ell(x, -163, 4, 3, '#14141a'); p.ell(x + d * 4, -167, 2, 2, '#14141a'); P(x + d * 7, -167, '#5a5a60'); P(x + d * 6, -167, '#3a3a40');
      P(x + d * 4, -168, '#a8a8b0'); line(x - d * 3, -162, x - d * 8, -159, '#14141a', 2); P(x - 1, -160, '#2a2a30'); P(x + 1, -160, '#2a2a30');
      P(x - 1, -164, '#3a3a48');
    }
    grain(c, 0, 0, c.width, c.height, rng(13), 0.07, 0.35);
  });
}
// Le puits à sec : margelle de pierres, deux montants, un petit toit de bardeaux, le treuil, le seau
function prWell() {
  return sprite(64, 92, (p, c) => {
    const { R, P, line } = p;
    prCyl(p, -21, -26, 43, 26, PR_STONE, 0);
    for (let y = -24; y < 0; y += 6) for (let x = -20 + ((y / 6) & 1) * 4; x < 21; x += 8) { R(x, y, 1, 6, '#2e2e34'); R(x - 3, y, 8, 1, '#3a3a40'); }
    p.ell(0, -26, 21, 4, '#8e8e94'); p.ell(0, -26, 17, 3, '#0e0c0a');
    for (const x of [-19, 15]) prCyl(p, x, -72, 5, 46, PR_GREY, 0);
    // le treuil et sa manivelle, la corde, le seau
    R(-15, -56, 31, 5, PR_GREY[3]); R(-15, -56, 31, 1, PR_GREY[5]); R(-15, -52, 31, 1, PR_GREY[1]);
    line(20, -54, 25, -46, '#3e434c', 2); R(24, -47, 5, 2, PR_GREY[2]);
    for (let y = -51; y < -38; y++) P(2, y, '#a8925a');
    R(-3, -38, 11, 9, '#5a4a3a'); R(-3, -38, 11, 1, '#8a7a64'); R(-3, -34, 11, 1, '#3e434c'); R(-3, -31, 11, 1, '#3e434c');
    // le toit (deux pans de bardeaux, l'un a perdu des bardeaux)
    p.poly([[-28, -68], [0, -90], [0, -84], [-24, -66]], '#6a6258'); p.poly([[28, -68], [0, -90], [0, -84], [24, -66]], '#4e4840');
    for (let k = 0; k < 4; k++) { line(-24 + k * 6, -67 - k * 4.5, -20 + k * 6, -70 - k * 4.5, '#3a342e'); line(24 - k * 6, -67 - k * 4.5, 20 - k * 6, -70 - k * 4.5, '#2a2620'); }
    R(8, -78, 5, 3, '#1a1410');
    grain(c, 0, 0, c.width, c.height, rng(17), 0.06, 0.35);
  });
}
// La cloche tombée du clocher : couchée de travers dans la poussière, fêlée, vert-de-gris ; un bout du joug
function prBell() {
  return sprite(52, 40, (p, c) => {
    const { R, P, line } = p, B = GH_BRONZE;
    p.ell(0, -1, 24, 3, '#6a5a44');
    // la cloche couchée (gueule vers la droite) : rangées verticales du cerveau à la pince
    for (let x = -18; x <= 14; x++) {
      const t = (x + 18) / 32, hw = Math.round(7 + t * t * 10 + (t > 0.9 ? 2 : 0));
      for (let y = -hw; y <= hw; y++) P(x, -18 + y, prPick(B, clamp(0.75 - (y + hw) / (2 * hw) * 0.8 + (x > 10 ? 0.15 : 0), 0, 1)));
    }
    p.ell(15, -18, 3, 19, '#0e100c'); p.ell(14, -18, 1, 17, B[1]);
    line(-6, -27, 2, -12, '#0e100c'); line(2, -12, 8, -16, '#0e100c'); // la fêlure
    R(-22, -22, 5, 8, B[2]); R(-22, -22, 5, 1, B[4]); // l'anse
    R(-26, -8, 18, 5, PR_GREY[2]); R(-26, -8, 18, 1, PR_GREY[4]); R(-26, -4, 18, 1, PR_GREY[0]); // le joug brisé
    grain(c, 0, 0, c.width, c.height, rng(23), 0.08, 0.4);
  });
}
// Le fauteuil à bascule : patins courbes, siège de lattes, dossier à barreaux
function prRocker() {
  return sprite(34, 50, (p, c) => {
    const { R, line } = p, G = PR_GREY;
    for (const d of [-1, 1]) { line(-14, -3 + d, 14, -1 + d, G[1], 2); }
    line(-14, -3, -12, -6, G[2], 2); line(14, -1, 12, -4, G[2], 2);
    for (const x of [-11, 9]) { R(x, -20, 3, 17, G[2]); R(x, -20, 1, 17, G[4]); }
    R(-12, -22, 25, 4, G[3]); R(-12, -22, 25, 1, G[5]); R(-12, -19, 25, 1, G[1]);
    for (const x of [-11, 10]) { R(x, -46, 3, 25, G[2]); R(x, -46, 1, 25, G[4]); }
    R(-11, -47, 24, 4, G[3]); R(-11, -47, 24, 1, G[5]);
    for (let x = -7; x <= 7; x += 4) R(x, -43, 2, 21, G[2]);
    for (const x of [-13, 12]) { R(x, -30, 3, 2, G[3]); line(x + 1, -28, x + 1, -22, G[2], 2); } // les accoudoirs
    grain(c, 0, 0, c.width, c.height, rng(29), 0.06, 0.35);
  });
}
// Le panneau à l'entrée de la ville : « BITTER CREEK », et dessous, pendu à un seul clou, « POP. 0 »
function prSignpost() {
  return sprite(66, 86, (p, c) => {
    const { R, P } = p, G = PR_GREY;
    prCyl(p, -3, -84, 6, 84, G, 0);
    const b = (x0, y0, w, h, slope, word, s) => {
      const sh = (x) => Math.round((x - x0) * slope);
      for (let x = x0; x < x0 + w; x++) { R(x, y0 + sh(x), 1, h, G[3]); P(x, y0 + sh(x), G[5]); P(x, y0 + sh(x) + h - 1, G[1]); }
      const tw = txTextW(word, s, 1), tx = x0 + ((w - tw) >> 1);
      txText((x, y, ww, hh, col) => R(x, y + sh(x), ww, hh, col), word, tx, y0 + ((h - 5 * s) >> 1), '#2a2018', s, 1);
    };
    b(-32, -76, 64, 12, 0.03, 'BITTER CREEK', 1);
    P(-9, -61, '#1a1410'); b(-10, -60, 22, 9, 0.28, 'POP. 0', 1);
    grain(c, 0, 0, c.width, c.height, rng(31), 0.06, 0.35);
  });
}
Object.assign(PR_DECO, { ghostGallows: [1, prGallows], ghostWell: [1, prWell], ghostBell: [1, prBell], ghostRocker: [1, prRocker], ghostSignpost: [1, prSignpost] });

// murs intérieurs dessinés du sol au plafond (lambris en bas) : fps.js les étire sur toute la hauteur
for (const id of ['ghostChurchIn', 'ghostChurchInWin']) A.TX_TALL[id] = true;
