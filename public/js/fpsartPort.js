// Dessins de la carte « Port Lafitte » du FPS (fpsmaps/port.js) : murs, sols et objets enregistrés dans les registres
// de fpsart.js (TX_WALLS / TX_VARS / TX_FLATS / PR_DECO). Chargé par fps.js.
// Le fleuve boueux et le bayou vert, le vapeur blanc et or (rambarde à balustres, roue à aubes rouge, salon tendu de
// velours, cheminées à couronne), le stuc pastel des maisons créoles et leurs balcons de fer forgé, la brique des
// entrepôts, le coton, les cyprès chauves et leur mousse espagnole. Ciel au travers : couleur SEE (transparente en jeu).
import * as A from './fpsart.js';

const { TX_WALLS, TX_VARS, TX_FLATS, PR_DECO, TW2_SEE: SEE, shade, mix, clamp, rng, hash, sprite, grain, txField, txK, txRGB, txLerp, txMod, txPick, txFbm, txNoise,
  txWP, txVBoards, txBlocks, txText, txTextW, txRevealWin, txBevel, prCyl, prPick, prLit, prRing, prField, prB, PR_IRON, PR_CAST, PR_BRASS, PR_WOOD, PR_GREY } = A;

const PT_SEE = txRGB(SEE);
const PT_STUCCO = ['#d4a868', '#d89a8c', '#8eaac2', '#9ab08a']; // ocre, rose, bleu, vert
const PT_SHUT = '#2e5236'; // volets vert bouteille
const PT_RED = ['#2a0c08', '#4a160e', '#6e2216', '#8e2e1e', '#b04030', '#d06850']; // la roue
const PT_GOLD = ['#4a3008', '#7a5414', '#a87c24', '#d0a840', '#ecd070', '#fff0b0'];
const PT_MOSS = ['#4a5444', '#6a7464', '#8a9480', '#a8b09c'];

// =================================================================== l'eau
// fleuve : eau boueuse vert-brun, rides en croissants (crête claire, creux sombre), écume ; bayou : eau sombre et
// verte, lentilles d'eau par plaques, quelques feuilles de nénuphar
function ptRiver(c, rand) {
  const base = txRGB('#55644e'), nz = txFbm(rand, [32, 16, 8]), fine = txNoise(rand, 2), ph = txNoise(rand, 16);
  txField(c, (x, y) => {
    const t = (y + 3 * Math.sin((x / 64) * 6.283 * 2 + ph(x, y) * 4) + (nz(x, y) - 0.5) * 6) / 8;
    const f = t - Math.floor(t);
    let k = 0.92 + nz(x, y) * 0.14 + (fine(x, y) - 0.5) * 0.04;
    if (f < 0.12) k *= 1.22; else if (f < 0.22) k *= 1.08; else if (f > 0.8) k *= 0.84;
    return txK(base, k);
  });
  const w = txWP(p0(c), true);
  for (let i = 0; i < 10; i++) { const x = rand() * 64, y = rand() * 64; w.R(x, y, 2 + rand() * 4, 1, '#9aa890'); }
}
const p0 = (c) => A.pen(c);
function ptBayou(c, rand) {
  const base = txRGB('#2c3a28'), nz = txFbm(rand, [16, 8, 4]), weed = txFbm(rand, [16, 8], [0.6, 0.4]), fine = txNoise(rand, 2);
  txField(c, (x, y) => {
    const d = weed(x, y);
    if (d > 0.66) return txK(txRGB(prB(x, y) < 0.5 ? '#5a7a2e' : '#7a9a3a'), 0.9 + fine(x, y) * 0.2); // lentilles d'eau
    return txK(base, 0.88 + nz(x, y) * 0.2 + (fine(x, y) - 0.5) * 0.05);
  });
  const w = txWP(p0(c), true);
  for (let i = 0; i < 2; i++) { const x = rand() * 64, y = rand() * 64; w.ell(x, y, 5, 3, '#3e6a2a'); w.ell(x - 1, y - 1, 3, 1, '#5a8a3a'); w.R(x, y - 3, 1, 3, '#2c3a28'); }
  w.P(rand() * 64, rand() * 64, '#e8e0d0'); // une fleur
}
TX_FLATS.portWater = (p, rand, c) => ptRiver(c, rand);
TX_FLATS.portBayou = (p, rand, c) => ptBayou(c, rand);
// la même eau pour la fine lame de « mur » qui arrête les joueurs (voir fpsmaps/port.js) : on n'en voit presque rien
TX_WALLS.portWater = (p, rand, c) => ptRiver(c, rand);
TX_WALLS.portBayou = (p, rand, c) => ptBayou(c, rand);

// =================================================================== sols
// le quai : gros madriers goudronnés, joints larges, boulons de fer
TX_FLATS.portWharf = (p, rand, c) => {
  const nz = txFbm(rand, [16, 8, 4]), fine = txNoise(rand, 2), tone = [0.9, 1.05, 0.96, 1.1].map((k) => k * (0.95 + rand() * 0.1));
  const wood = txRGB('#54412e');
  txField(c, (x, y) => {
    const b = y >> 4, u = y & 15;
    if (u === 0) return txRGB('#140e0a');
    let k = tone[b] * (0.86 + nz(x * 0.4, b * 16 + u * 0.4) * 0.28) * (0.95 + fine(x, y) * 0.1);
    if (u === 1) k *= 1.2; else if (u === 15) k *= 0.7;
    if (txMod(x - b * 23) % 64 === 0) return txRGB('#140e0a'); // about
    return txK(wood, k);
  });
  for (let b = 0; b < 4; b++) for (const x of [6, 38]) { const X = txMod(x + b * 11); p.R(X, b * 16 + 6, 2, 2, '#2a2a2e'); p.P(X, b * 16 + 6, '#6a6a70'); }
  grain(c, 0, 0, 64, 64, rand, 0.06, 0.4);
};
// la passerelle : planches en long, tasseaux en travers pour ne pas glisser
TX_FLATS.portGangway = (p, rand, c) => {
  txVBoards(p, rand, c, 0, 0, 64, 64, '#7a6248', 8, '#2a1e14');
  for (let y = 4; y < 64; y += 10) { p.R(0, y, 64, 3, '#5a4632'); p.R(0, y, 64, 1, '#8a7258'); p.R(0, y + 2, 64, 1, '#2a1e14'); }
};
// le pont du vapeur : lattes étroites peintes en gris clair, joints calfatés, usure claire au milieu
TX_FLATS.portDeck = (p, rand, c) => {
  const nz = txFbm(rand, [16, 8, 4]), fine = txNoise(rand, 2), base = txRGB('#b8b0a0');
  txField(c, (x, y) => {
    const b = y >> 2, u = y & 3;
    if (u === 0) return txRGB('#3a342c');
    if (txMod(x - b * 19) % 64 < 1) return txRGB('#3a342c');
    return txK(base, (0.88 + nz(x, y) * 0.18 + (b & 1 ? 0.03 : 0)) * (u === 1 ? 1.07 : 1) * (0.96 + fine(x, y) * 0.08));
  });
  grain(c, 0, 0, 64, 64, rand, 0.04, 0.4);
};
// pavés de granit (Belgian blocks) posés en boutisse, joints de sable sombre
TX_FLATS.portCobble = (p, rand, c) => {
  txBlocks(c, rand, { y0: 0, y1: 64, ch: 8, lens: (r, rd) => (r % 2 ? [12, 13, 13, 13, 13] : [13, 13, 12, 13, 13]).sort(() => rd() - 0.5), off: () => Math.floor(rand() * 13),
    cols: ['#7a7876', '#86827c', '#6e6c6a', '#908a82', '#76726c'], mortar: '#3a3632', bev: 0.2 });
  grain(c, 0, 0, 64, 64, rand, 0.05, 0.5);
};
// le tapis du grand salon : rouge sombre, médaillons dorés, filets
TX_FLATS.portCarpet = (p, rand, c) => {
  const fine = txNoise(rand, 2), red = txRGB('#6e1a1a'), gold = txRGB('#c89a3a'), dk = txRGB('#3a0e0e');
  txField(c, (x, y) => {
    const u = x & 31, v = y & 31, du = Math.abs(u - 15.5), dv = Math.abs(v - 15.5);
    if (u === 0 || v === 0) return txK(gold, 0.85);
    if (u === 2 || v === 2) return dk;
    const r = du + dv;
    if (r < 3) return gold; if (r > 7 && r < 8.6) return txK(gold, 0.9); if (r < 8.6 && (du < 1 || dv < 1)) return txK(gold, 0.75);
    if (Math.abs(du - dv) < 0.8 && r > 12 && r < 20) return dk;
    return txK(red, 0.92 + fine(x, y) * 0.12);
  });
};
// le plafond du salon : caissons blancs, moulures dorées, une rosace au milieu de chaque caisson
TX_FLATS.portSalonCeil = (p, rand, c) => {
  const fine = txNoise(rand, 2), wh = txRGB('#e8e2d2'), g = txRGB('#c8a040');
  txField(c, (x, y) => {
    const u = x & 31, v = y & 31, m = Math.min(u, v, 31 - u, 31 - v), d = Math.hypot(u - 15.5, v - 15.5);
    if (m < 2) return txK(wh, m === 0 ? 0.7 : 1.05);
    if (m === 2 || m === 3) return txK(g, m === 2 ? 1.1 : 0.8);
    if (d < 4) return txK(g, d < 1.5 ? 1.2 : 0.9 - (d - 2) * 0.05);
    return txK(wh, (m < 6 ? 0.88 : 0.96) * (0.97 + fine(x, y) * 0.05));
  });
};

// =================================================================== le vapeur
// rambarde à balustres (mur bas, on tire par-dessus) : main courante, balustres tournés, le ciel entre eux ; v1 : le
// bordage plein, planches goudronnées (le chaland)
TX_WALLS.portRail = (p, rand, c, v) => {
  if (v === 1) {
    txVBoards(p, rand, c, 0, 0, 64, 64, '#5a4632', 16, '#1e140c');
    p.R(0, 0, 64, 8, '#6a5440'); p.R(0, 0, 64, 2, '#8a7258'); p.R(0, 7, 64, 1, '#1e140c');
    for (let x = 6; x < 64; x += 16) p.R(x, 12, 2, 50, '#3a2c1e');
    return;
  }
  const W = ['#4a4640', '#8a867c', '#c8c4b8', '#e8e4d8', '#f6f2e8', '#ffffff'];
  txField(c, () => PT_SEE);
  p.R(0, 0, 64, 9, W[3]); p.R(0, 0, 64, 2, W[5]); p.R(0, 7, 64, 2, W[1]); p.R(0, 54, 64, 10, W[3]); p.R(0, 54, 64, 1, W[5]); p.R(0, 62, 64, 2, W[1]);
  for (let x = 2; x < 64; x += 8) {
    for (let y = 9; y < 54; y++) {
      const t = (y - 9) / 45, hw = 1.4 + 1.4 * Math.sin(Math.PI * Math.min(1, t * 1.25)) + (t > 0.85 ? 1 : 0);
      for (let i = -Math.ceil(hw); i <= Math.ceil(hw); i++) if (Math.abs(i) <= hw) p.P(x + 2 + i, y, prPick(W, prLit((i + hw) / (2 * hw + 0.01))));
    }
  }
  p.R(0, 0, 64, 1, '#c8a040'); // filet doré sur la main courante
};
// la roue à aubes (2 cases de large, de 0 à 1,7) : un seul dessin en coordonnées du monde, v = colonne ;
// rayons et aubes rouges, jante, moyeu, l'arbre ; le ciel entre les rayons ; le bas trempe dans l'eau
function ptWheel(c, col, z0, zh) {
  const R0 = 0.84, cx = 1, cz = 0.85;
  txField(c, (x, y) => {
    const X = col + (x + 0.5) / 64, Z = z0 + (1 - (y + 0.5) / 64) * zh;
    const dx = X - cx, dz = Z - cz, d = Math.hypot(dx, dz), a = Math.atan2(dz, dx);
    if (Z < 0.05) return txK(txRGB('#55644e'), 0.9 + prB(x, y) * 0.2); // l'eau
    if (d > R0) return Z < 0.16 && prB(x, y) < 0.3 ? txRGB('#c8d4d0') : PT_SEE; // embruns au pied
    if (d < 0.07) return txRGB(d < 0.04 ? '#5c626c' : '#24282e'); // le moyeu
    const s = a / (Math.PI / 6), sp = Math.abs(s - Math.round(s)); // 12 rayons
    if (d > R0 - 0.05) return txRGB(PT_RED[d > R0 - 0.02 ? 2 : 4]); // la jante
    if (d > R0 - 0.24 && sp < 0.42) return txRGB(PT_RED[clamp(Math.round(3.5 - sp * 5 + (dz > 0 ? 1 : 0)), 0, 5)]); // l'aube
    if (sp < 0.14) return txRGB(PT_RED[sp < 0.05 ? 4 : d < 0.3 ? 2 : 3]); // le rayon
    if (Math.abs(d - 0.42) < 0.02) return txRGB(PT_RED[1]); // le cercle de renfort
    return PT_SEE;
  });
}
TX_WALLS.portWheel = (p, rand, c, v) => ptWheel(c, v, 0, 1);
// entre les deux flasques : le tambour, vu par les jours de la roue (les aubes en travers, l'arbre au milieu)
function ptDrum(c, col, z0, zh) {
  txField(c, (x, y) => {
    const X = col + (x + 0.5) / 64, Z = z0 + (1 - (y + 0.5) / 64) * zh, d = Math.hypot(X - 1, Z - 0.85);
    if (Z < 0.05) return txK(txRGB('#55644e'), 0.9 + prB(x, y) * 0.2);
    if (d > 0.84) return PT_SEE;
    if (Math.abs(Z - 0.85) < 0.035) return txRGB(Math.abs(Z - 0.85) < 0.015 ? '#5c626c' : '#24282e'); // l'arbre
    const a = (Math.atan2(Z - 0.85, X - 1) + Math.PI) / (Math.PI / 6), f = a - Math.floor(a);
    if (d > 0.68 && f < 0.22) return txRGB(PT_RED[f < 0.08 ? 4 : f > 0.22 ? 1 : 3]); // une aube, de chant
    return PT_SEE;
  });
}
TX_WALLS.portPaddles = (p, rand, c, v) => ptDrum(c, v, 0, 1);
TX_WALLS.portPaddlesUp = (p, rand, c, v) => ptDrum(c, v, 1, 0.7);
TX_WALLS.portWheelUp = (p, rand, c, v) => ptWheel(c, v, 1, 0.7);
// le rouf du grand salon : planches blanches à languettes, plinthe verte, frise découpée en haut, filet doré
function ptCabin(p, rand, c) {
  const nz = txNoise(rand, 2), wh = txRGB('#ece8dc');
  txField(c, (x, y) => {
    const u = x & 7;
    if (y >= 56) return txK(txRGB('#2e4a36'), y === 56 ? 1.3 : y === 63 ? 0.6 : 0.95);
    if (y < 8) return txK(wh, y === 7 ? 0.6 : 1.02); // la frise
    return txK(wh, (u === 0 ? 0.74 : u === 1 ? 1.06 : 0.97) * (0.96 + nz(x, y) * 0.06));
  });
  for (let x = 0; x < 64; x += 8) { p.disc(x + 4, 5, 2, '#c8c4b8'); p.P(x + 4, 4, '#ffffff'); p.R(x, 7, 8, 1, '#8a867c'); } // dentelle de bois
  p.R(0, 9, 64, 1, '#c8a040'); p.R(0, 55, 64, 1, '#c8a040');
}
TX_WALLS.portCabin = (p, rand, c) => ptCabin(p, rand, c);
// fenêtre cintrée, volets verts entrouverts, le salon éclairé derrière
TX_WALLS.portCabinWin = (p, rand, c) => {
  ptCabin(p, rand, c);
  const x0 = 22, x1 = 42, y0 = 14, y1 = 48, cx = 32;
  txField(c, (x, y) => {
    const X = x + 0.5, inArch = (r) => X > x0 + r && X < x1 - r && y < y1 - r && (y > y0 + 10 || Math.hypot(X - cx, y + 0.5 - (y0 + 10)) < 10 - r);
    if (!inArch(-2)) return null;
    if (!inArch(0)) return txRGB('#c8a040');
    if (X > cx - 1 && X < cx + 1) return txRGB('#5a3a1a');
    return txRGB(y < y0 + 10 ? '#f8d890' : y < 30 ? '#e8b060' : y < 40 ? '#c88040' : '#8a4a2a'); // la lumière des lustres
  });
  for (const sx of [x0 - 9, x1 + 1]) { txBevel(p, sx, y0 + 6, 8, y1 - y0 - 6, PT_SHUT, true, 0.25); for (let y = y0 + 9; y < y1 - 2; y += 3) p.R(sx + 1, y, 6, 1, shade(PT_SHUT, -0.35)); }
};
// au-dessus de 1 (étiré jusqu'à 2,2 : 64 rangées pour 1,2) : le haut du rouf et ses impostes, le bandeau du pont
// (v1 « CREOLE », v2 « BELLE » en lettres d'or), les lambrequins, puis la galerie du pont-promenade (balustres, le ciel)
TX_WALLS.portCabinUp = (p, rand, c, v) => {
  ptCabin(p, rand, c);
  txField(c, (x, y) => (y < 34 ? PT_SEE : null));
  const W = ['#4a4640', '#8a867c', '#c8c4b8', '#e8e4d8', '#f6f2e8', '#ffffff'];
  // les impostes (petits vitraux) au-dessus des fenêtres
  for (const x of [8, 40]) { p.R(x, 52, 16, 6, '#c8a040'); p.R(x + 1, 53, 14, 4, '#e8b060'); for (let k = 0; k < 14; k += 4) p.R(x + 1 + k, 53, 1, 4, '#7a3a7a'); }
  // le bandeau du pont
  p.R(0, 34, 64, 12, W[3]); p.R(0, 34, 64, 1, W[5]); p.R(0, 45, 64, 1, W[1]); p.R(0, 36, 64, 1, '#c8a040'); p.R(0, 43, 64, 1, '#c8a040');
  const word = ['', 'CREOLE', 'BELLE'][v] || '';
  if (word) { const tw = txTextW(word, 1, 1), tx = 32 - (tw >> 1); txText(p.R, word, tx + 1, 38, '#6a4a14', 1, 1); txText(p.R, word, tx, 37, '#ecc040', 1, 1); }
  // les lambrequins sous le bandeau (festons, le ciel entre eux)
  for (let x = 0; x < 64; x++) { const h = 3 + Math.round(2 * Math.abs(Math.sin((x * Math.PI) / 8))); p.R(x, 46, 1, h, x % 8 === 4 ? W[2] : W[4]); }
  txField(c, (x, y) => (y >= 46 && y < 52 && y >= 46 + 3 + Math.round(2 * Math.abs(Math.sin((x * Math.PI) / 8))) ? txRGB('#ece8dc') : null));
  // la galerie : main courante, balustres
  p.R(0, 12, 64, 4, W[3]); p.R(0, 12, 64, 1, W[5]); p.R(0, 15, 64, 1, W[1]); p.R(0, 31, 64, 3, W[2]);
  for (let x = 1; x < 64; x += 6) { p.R(x, 16, 3, 15, W[3]); p.P(x, 16, W[5]); p.R(x + 2, 16, 1, 15, W[1]); p.R(x - 1, 22, 5, 2, W[4]); }
};
// dedans : panneaux blancs à arcs gothiques et filets d'or, velours rouge en bas (étiré du sol au plafond)
function ptSalon(p, rand, c) {
  const nz = txNoise(rand, 2), wh = txRGB('#ece4d0'), g = txRGB('#c8a040'), vel = txRGB('#7a1e22');
  txField(c, (x, y) => {
    if (y < 6) return txK(g, y === 0 || y === 5 ? 0.7 : 1.05); // la corniche
    if (y >= 42) { if (y === 42 || y === 43) return txK(g, y === 42 ? 1.1 : 0.7); return txK(vel, (x % 16 === 0 ? 0.7 : 1) * (0.9 + nz(x, y) * 0.15) * (y > 60 ? 0.7 : 1)); }
    const u = x & 31, X = u + 0.5;
    const inP = (r) => X > 5 + r && X < 27 - r && y < 39 - r && (y > 18 || (Math.hypot(X - 5 - 11, y - 18) < 11 - r && Math.hypot(X - 27 + 11, y - 18) < 11 - r && Math.hypot(X - 16, y - 18) < 11));
    if (inP(0) && !inP(1.5)) return txK(g, X < 16 ? 1.1 : 0.85);
    return txK(wh, (inP(1.5) ? 0.94 : 1) * (0.96 + nz(x, y) * 0.06));
  });
}
TX_WALLS.portSalonIn = (p, rand, c) => ptSalon(p, rand, c);
TX_WALLS.portSalonInWin = (p, rand, c) => {
  ptSalon(p, rng(hash('w:portSalonIn:0')), c);
  txRevealWin(p, c, rand, { x0: 22, y0: 12, x1: 41, y1: 38, d: 3, lit: '#f0e8d4', dark: '#b4ac98', frame: ['#c8a040', '#ecd070'] });
};
// le coton : balles en toile de jute cerclées de fer, le coton qui s'échappe aux coutures ; v1 décalées
TX_WALLS.portCotton = (p, rand, c, v) => {
  const nz = txFbm(rand, [8, 4], [0.6, 0.4]), fine = txNoise(rand, 2), jute = txRGB('#cfc2a0');
  txField(c, (x, y) => {
    const by = (y + (v ? 16 : 0)) & 31, bx = txMod(x + ((y + (v ? 16 : 0)) & 32 ? 20 : 0)) % 40;
    if (by === 0 || bx === 0) return txRGB('#3a3226');
    if (by === 1 || bx === 1) return txK(txRGB('#f4f0e6'), 0.95 + fine(x, y) * 0.1); // le coton aux coutures
    if (by % 10 === 5) return txK(txRGB('#3e434c'), x % 7 === 0 ? 1.6 : 1); // les cercles de fer
    let k = (0.9 + nz(x, y) * 0.2) * (by < 4 ? 1.1 : by > 28 ? 0.75 : 1) * ((x + y) % 3 === 0 ? 0.94 : 1);
    if (nz(x + 31, y) > 0.72) return txK(txRGB('#f4f0e6'), 0.92 + fine(x, y) * 0.1);
    return txK(jute, k);
  });
  p.R(0, 0, 64, 2, '#e8e2d2'); // le dessus du tas
};
// le bois des chaudières : bûches empilées vues par le bout
TX_WALLS.portCordwood = (p, rand, c, v) => {
  p.R(0, 0, 64, 64, '#140e08');
  const w = txWP(p);
  for (let y = 4 + (v ? 3 : 0); y < 70; y += 10) for (let x = (y & 8 ? 0 : 6); x < 64; x += 12) {
    const r = 4 + Math.floor(rand() * 2), xx = x + Math.floor(rand() * 3);
    w.disc(xx, y, r + 1, '#3a2614'); w.disc(xx, y, r, '#b88a58'); w.disc(xx - 1, y - 1, r - 2, '#c89a68');
    for (let k = 1; k < r; k += 2) prRing({ P: (a, b, col) => w.P(a, b, col) }, xx, y, k, k + 0.6, () => '#9a6e44');
    w.P(xx, y, '#6a4a2a');
  }
  p.R(0, 0, 64, 2, '#7a5434');
};
TX_VARS.portRail = 2; TX_VARS.portWheel = 2; TX_VARS.portWheelUp = 2; TX_VARS.portPaddles = 2; TX_VARS.portPaddlesUp = 2; TX_VARS.portCabinUp = 3; TX_VARS.portCotton = 2; TX_VARS.portCordwood = 2;

// =================================================================== le stuc des maisons créoles
// enduit de chaux teinté, marbré, des plaques tombées montrent la brique ; soubassement grisé par les éclaboussures
function ptStucco(p, rand, c, v, o = {}) {
  const col = txRGB(PT_STUCCO[v]), nz = txFbm(rand, [16, 8, 4]), fine = txNoise(rand, 2), sp = txFbm(rand, [16, 8], [0.6, 0.4]);
  const brick = ['#8a4a34', '#9a5440', '#7a4030'].map(txRGB), mortar = txRGB('#c8b8a0');
  txField(c, (x, y) => {
    const bare = !(o.keep && o.keep(x, y)) && sp(x, y) > (o.thr ?? 0.73) && y > 6;
    if (bare) {
      const row = y >> 2, u = txMod(x + (row & 1) * 5) % 10;
      if ((y & 3) === 3 || u === 9) return txK(mortar, 0.8);
      return txK(brick[(row + Math.floor(txMod(x + (row & 1) * 5) / 10)) % 3], 0.9 + fine(x, y) * 0.15);
    }
    let k = 0.93 + nz(x, y) * 0.12 + (fine(x, y) - 0.5) * 0.04;
    if (sp(x, y - 1) > (o.thr ?? 0.73) && y > 7) k *= 0.75;
    if (!o.noBase && y > 54) k *= 0.8 - (y - 54) * 0.015;
    return txK(col, k);
  });
  grain(c, 0, 0, 64, 64, rand, 0.04, 0.4);
}
// porte-fenêtre : haute ouverture, volets à lames ouverts, les vitres dans l'ombre, l'imposte
function ptFrench(p, x0, x1, y0, y1, dark = '#1a1614') {
  p.R(x0 - 2, y0 - 2, x1 - x0 + 4, y1 - y0 + 2, '#e8e0cc');
  p.R(x0, y0, x1 - x0, y1 - y0, dark);
  p.R(x0, y0, x1 - x0, 7, '#2a3a3a'); p.R(x0, y0 + 7, x1 - x0, 1, '#e8e0cc');
  for (let k = x0 + 4; k < x1; k += 6) p.R(k, y0, 1, 7, '#e8e0cc');
  p.R((x0 + x1) >> 1, y0 + 8, 1, y1 - y0 - 8, '#3a2a1a');
  for (let y = y0 + 12; y < y1; y += 10) p.R(x0 + 1, y, x1 - x0 - 2, 1, '#3a3430');
  for (const sx of [x0 - 9, x1 + 1]) { txBevel(p, sx, y0, 8, y1 - y0, PT_SHUT, true, 0.25); for (let y = y0 + 3; y < y1 - 2; y += 3) p.R(sx + 1, y, 6, 1, shade(PT_SHUT, -0.35)); }
}
TX_WALLS.portStucco = (p, rand, c, v) => ptStucco(p, rand, c, v);
TX_WALLS.portStuccoWindow = (p, rand, c, v) => { ptStucco(p, rand, c, v, { keep: (x, y) => x > 10 && x < 54 && y > 2 }); ptFrench(p, 22, 42, 6, 62); };
// porte à deux battants vert bouteille, imposte en éventail
TX_WALLS.portStuccoDoor = (p, rand, c, v) => {
  ptStucco(p, rand, c, v, { keep: (x, y) => x > 14 && x < 50 });
  p.R(18, 8, 28, 56, '#e8e0cc');
  for (let y = 8; y < 20; y++) for (let x = 20; x < 44; x++) { const d = Math.hypot(x + 0.5 - 32, y + 0.5 - 20); if (d < 12) p.P(x, y, d > 10.5 ? '#e8e0cc' : Math.floor(Math.atan2(y - 20, x - 32) * 3) % 2 ? '#2a3a3a' : '#e8e0cc'); }
  txBevel(p, 20, 20, 12, 44, PT_SHUT, true, 0.22); txBevel(p, 32, 20, 12, 44, PT_SHUT, true, 0.22);
  for (const x of [22, 34]) { txBevel(p, x, 24, 8, 16, shade(PT_SHUT, -0.12), false, 0.25); txBevel(p, x, 44, 8, 16, shade(PT_SHUT, -0.12), false, 0.25); }
  p.R(30, 42, 1, 3, '#d0a848'); p.R(33, 42, 1, 3, '#d0a848');
};
// au-dessus de 1 (étiré jusqu'au toit) : l'étage, sa porte-fenêtre, le balcon de fer forgé en dentelle, la corniche
TX_WALLS.portStuccoUp = (p, rand, c, v) => {
  ptStucco(p, rand, c, v, { keep: (x, y) => x > 10 && x < 54 && y > 6, noBase: true });
  p.R(0, 0, 64, 6, shade(PT_STUCCO[v], 0.35)); p.R(0, 0, 64, 1, '#f8f4ec'); p.R(0, 5, 64, 1, shade(PT_STUCCO[v], -0.4)); p.R(0, 6, 64, 1, shade(PT_STUCCO[v], -0.2));
  ptFrench(p, 22, 42, 12, 58);
  // le balcon : la dalle, la rambarde de fonte (barreaux, volutes, main courante)
  const ir = '#1a1a1e', ih = '#4a4a52';
  p.R(0, 58, 64, 6, '#b8b0a0'); p.R(0, 58, 64, 1, '#d8d0c0'); p.R(0, 63, 64, 1, '#3a3632');
  p.R(0, 36, 64, 2, ir); p.R(0, 36, 64, 1, ih); p.R(0, 55, 64, 2, ir);
  for (let x = 0; x < 64; x += 4) p.R(x, 38, 1, 17, ir);
  for (let x = 0; x < 64; x += 8) { prRing(p, x + 4, 42, 1.5, 2.6, () => ir); prRing(p, x + 4, 50, 1.5, 2.6, () => ir); p.P(x + 4, 46, ih); }
};
// dedans : enduit pâle, cimaise, lambris peint
function ptStuccoIn(p, rand, c, v) {
  const col = txRGB(mix(PT_STUCCO[v], '#f0e8d8', 0.55)), nz = txFbm(rand, [16, 8]), fine = txNoise(rand, 2);
  txField(c, (x, y) => {
    if (y >= 46) return txK(txRGB(shade(PT_STUCCO[v], -0.25)), (y === 46 ? 1.2 : (x & 15) === 0 ? 0.7 : 0.95) * (0.95 + fine(x, y) * 0.1));
    if (y === 44 || y === 45) return txRGB(y === 44 ? '#e8e0cc' : '#6a5a48');
    return txK(col, 0.94 + nz(x, y) * 0.1 + (fine(x, y) - 0.5) * 0.03);
  });
}
TX_WALLS.portStuccoIn = (p, rand, c, v) => ptStuccoIn(p, rand, c, v);
TX_WALLS.portStuccoInWin = (p, rand, c, v) => {
  ptStuccoIn(p, rng(hash(`w:portStuccoIn:${v}`)), c, v);
  txRevealWin(p, c, rand, { x0: 22, y0: 8, x1: 41, y1: 42, d: 3, lit: mix(PT_STUCCO[v], '#ffffff', 0.6), dark: shade(PT_STUCCO[v], -0.2), frame: [PT_SHUT, shade(PT_SHUT, 0.3)] });
};
Object.assign(TX_VARS, { portStucco: 4, portStuccoWindow: 4, portStuccoDoor: 4, portStuccoUp: 4, portStuccoIn: 4, portStuccoInWin: 4 });

// =================================================================== entrepôts, enseignes, étals
// dedans : la brique passée à la chaux (v1 : une fenêtre)
TX_WALLS.portStoreIn = (p, rand, c, v) => {
  A.txBrickWall(p, rng(hash('w:brick:0')), c, 0);
  const wash = txFbm(rand, [16, 8, 4]), lime = txRGB('#e0d8c8');
  txField(c, (x, y, cur) => txLerp(cur, lime, clamp(0.85 - wash(x, y) * 0.5 - (y > 50 ? 0.3 : 0), 0, 0.85)));
  if (v === 1) txRevealWin(p, c, rand, { x0: 22, y0: 12, x1: 41, y1: 38, d: 4, lit: '#e8e0d0', dark: '#a89888', frame: ['#3a2a1e', '#6a5440'] });
};
TX_VARS.portStoreIn = 2;
// enseigne : v = mot * 8 + fond (brique v0 / v1 : lettres peintes à même la brique sur un bandeau sombre ; stuc v0-v3 :
// lettres noires sur un cartouche crème ; planches v2 / v1 : planche peinte comme celles de la ville)
const PT_WORDS = ['COTTON', 'CUSTOMS', 'OYSTERS', 'LAFITTE CO.', 'CHANDLER', 'HOTEL'];
const PT_BASES = [['brick', 0], ['brick', 1], ['portStucco', 0], ['portStucco', 1], ['portStucco', 2], ['portStucco', 3], ['plankUp', 2], ['plankUp', 1]];
TX_WALLS.portSign = (p, rand, c, v) => {
  const word = PT_WORDS[v >> 3] || '', bi = v & 7, [bid, bv] = PT_BASES[bi];
  TX_WALLS[bid](p, rng(hash(`w:${bid}:${bv}`)), c, bv);
  const [s, g] = [[2, 2], [2, 1], [1, 1]].find(([a, b]) => txTextW(word, a, b) <= 54), tw = txTextW(word, s, g), tx = 32 - (tw >> 1), ty = 30 - ((5 * s) >> 1);
  const x0 = tx - 4, y0 = ty - 4, w = tw + 8, h = 5 * s + 8;
  if (bi < 2) {
    const band = txRGB('#2a1e18'), wear = txFbm(rand, [8, 4], [0.6, 0.4]);
    txField(c, (x, y, cur) => (x >= x0 && x < x0 + w && y >= y0 && y < y0 + h ? txLerp(cur, band, clamp(0.85 - wear(x, y) * 0.4, 0, 1)) : null));
    txText(p.R, word, tx, ty, '#ece2c8', s, g);
  } else if (bi < 6) {
    p.R(x0 - 1, y0 - 1, w + 2, h + 2, '#3a2a1e'); p.R(x0, y0, w, h, '#ece2c8'); p.R(x0, y0, w, 1, '#ffffff'); p.R(x0 + 1, y0 + 1, w - 2, 1, '#c8a040'); p.R(x0 + 1, y0 + h - 2, w - 2, 1, '#c8a040');
    txText(p.R, word, tx, ty, '#1e1a16', s, g);
  } else {
    const board = bi === 6 ? '#1e3a4a' : '#5a2a1a';
    p.R(x0 - 1, y0 - 1, w + 2, h + 2, '#1a1410'); txBevel(p, x0, y0, w, h, board, true, 0.25);
    txText(p.R, word, tx + 1, ty + 1, shade(board, -0.6), s, g); txText(p.R, word, tx, ty, '#f0d272', s, g);
  }
};
TX_VARS.portSign = PT_WORDS.length * 8;
// l'étal de la halle (mur bas) : planches, la glace pilée sur le dessus (couleur du dessus), des poissons qui dépassent
TX_WALLS.portStall = (p, rand, c, v) => {
  txVBoards(p, rand, c, 0, 0, 64, 64, v ? '#6a5440' : '#5a6a6a', 8, '#1e1a16');
  p.R(0, 0, 64, 10, '#d8e4e8'); p.R(0, 0, 64, 2, '#f0f6f8'); p.R(0, 9, 64, 1, '#6a7a80');
  for (let x = 4; x < 64; x += 11) { p.ell(x, 4, 4, 1.5, '#8a9aa4'); p.P(x - 4, 4, '#3a4a54'); p.P(x + 3, 3, '#e8f0f0'); }
  txText(p.R, 'FRESH', 32 - (txTextW('FRESH', 1, 1) >> 1), 30, '#ece2c8', 1, 1);
};
TX_VARS.portStall = 2;

// =================================================================== objets du décor
// cheminée du vapeur : longue colonne de tôle noire, colliers, la couronne découpée en plumes au sommet
function prStack() {
  return sprite(46, 272, (p, c) => {
    const { R, P } = p;
    prCyl(p, -9, -246, 19, 246, PR_CAST, 0);
    for (const y of [-60, -150, -228]) { prCyl(p, -10, y, 21, 3, PR_IRON, 0.05); }
    prCyl(p, -12, -14, 25, 14, PR_CAST, 0.05); R(-12, -14, 25, 1, PR_IRON[3]);
    // la couronne : une collerette évasée, découpée en feuilles dorées
    for (let y = -262; y <= -246; y++) { const hw = 10 + Math.round((y + 262) * -0.3 + 6); prCyl(p, -hw, y, 2 * hw + 1, 1, PR_CAST, 0.05); }
    for (let k = -4; k <= 4; k++) {
      const x = k * 4, top = -271 + Math.abs(k) * 0.5;
      for (let y = Math.round(top); y < -262; y++) R(x - 1, y, 3, 1, prPick(PT_GOLD, 0.6 - (y - top) / 20 + (k < 0 ? 0.15 : 0)));
      P(x, Math.round(top), PT_GOLD[5]);
    }
    R(-15, -262, 31, 2, PT_GOLD[3]); R(-15, -262, 31, 1, PT_GOLD[5]);
    grain(c, 0, 0, c.width, c.height, rng(41), 0.04, 0.3);
  });
}
// cloche du vapeur, pendue à sa potence de bois
function prShipBell() {
  return sprite(30, 46, (p) => {
    const { R } = p;
    for (const x of [-11, 9]) prCyl(p, x, -44, 3, 44, PR_WOOD, 0);
    R(-12, -46, 25, 3, PR_WOOD[3]); R(-12, -46, 25, 1, PR_WOOD[5]);
    R(-1, -43, 3, 4, PR_IRON[2]);
    for (let y = -39; y <= -24; y++) { const t = (y + 39) / 15, hw = Math.round(3 + t * t * 5); prCyl(p, -hw, y, 2 * hw + 1, 1, PR_BRASS, 0.05); }
    R(-8, -24, 17, 1, PR_BRASS[1]); R(0, -23, 1, 3, PR_IRON[1]);
  });
}
// rouleau de cordage sur le pont
function prCoil() {
  return sprite(30, 14, (p) => {
    for (let k = 0; k < 4; k++) p.ell(0, -4 + (k & 1), 13 - k * 3, 4 - k * 0.8, k & 1 ? '#8a7448' : '#b09868');
    p.ell(0, -4, 3, 1, '#3a2e1a'); p.line(10, -3, 15, -1, '#b09868', 2);
  });
}
// bitte d'amarrage de fonte, un tour de cordage
function prBollard() {
  return sprite(20, 24, (p) => {
    prCyl(p, -5, -16, 11, 16, PR_CAST, 0.05); prCyl(p, -7, -21, 15, 5, PR_CAST, 0.15); p.R(-7, -21, 15, 1, PR_CAST[5]);
    p.R(-6, -10, 13, 2, '#b09868'); p.R(-6, -10, 13, 1, '#d0b888');
  });
}
// pirogue amarrée : coque creusée dans un tronc, la pagaie dedans (posée sur l'eau)
function prPirogue() {
  return sprite(76, 16, (p) => {
    const { R, P, line } = p;
    p.ell(0, -1, 36, 2, '#2c3428');
    for (let x = -34; x <= 34; x++) { const h = Math.round(5 * Math.sqrt(Math.max(0, 1 - (x / 35) ** 2)) + (Math.abs(x) > 30 ? 2 : 0)); R(x, -2 - h, 1, h, x < 0 ? '#5a3a20' : '#4a2e18'); P(x, -2 - h, '#8a6038'); }
    line(-20, -9, 16, -5, '#a87c48', 2); R(14, -7, 6, 3, '#a87c48');
  });
}
// grue de quai en bois : le mât, la flèche, les haubans, la poulie et une balle de coton au crochet
function prCrane() {
  return sprite(150, 214, (p, c) => {
    const { R, P, line } = p, G = PR_WOOD;
    R(-20, -6, 40, 6, G[2]); R(-20, -6, 40, 1, G[4]); // le socle
    prCyl(p, -5, -200, 10, 196, G, 0);
    line(-18, -6, -3, -60, G[1], 3); line(18, -6, 3, -60, G[1], 3);
    for (let k = -2; k <= 2; k++) line(4, -60 + k, 60, -190 + k, k === -2 ? G[4] : k === 2 ? G[0] : G[2]); // la flèche
    line(0, -200, 60, -190, '#7a6438'); line(0, -200, -60, -4, '#7a6438'); line(60, -190, 60, -110, '#a8925a');
    R(-3, -204, 7, 5, G[3]); prRing(p, 60, -190, 2, 4, () => PR_IRON[2]);
    // la balle de coton qui pend au crochet
    R(57, -112, 7, 3, PR_IRON[1]); R(50, -109, 22, 24, '#cfc2a0'); R(50, -109, 22, 1, '#f4f0e6');
    for (const y of [-103, -95, -88]) R(50, y, 22, 1, '#3e434c');
    R(48, -98, 2, 3, '#f4f0e6'); R(71, -104, 2, 3, '#f4f0e6');
    // le treuil au pied du mât
    p.disc(-12, -26, 7, PR_IRON[1]); p.disc(-12, -26, 5, PR_IRON[2]); P(-12, -26, PR_IRON[4]); line(-12, -26, -20, -36, PR_IRON[3], 2);
    grain(c, 0, 0, c.width, c.height, rng(43), 0.05, 0.3);
  });
}
// ancre de marine posée contre une bitte
function prAnchor() {
  return sprite(44, 56, (p) => {
    const { R, line } = p, I = PR_CAST;
    line(0, -44, 0, -6, I[3], 3); R(-8, -42, 17, 3, I[3]); R(-8, -42, 17, 1, I[5]);
    prRing(p, 0, -47, 2, 3.6, () => I[4]);
    for (let a = 0.15; a < Math.PI - 0.15; a += 0.04) R(Math.round(Math.cos(a) * 16), Math.round(-14 + Math.sin(a) * 10), 3, 3, I[2]);
    for (const d of [-1, 1]) { line(d * 17, -15, d * 12, -20, I[3], 3); R(d * 17 - 2, -15, 4, 3, I[4]); }
    p.ell(0, 0, 18, 2, '#3a3226');
  });
}
// poteau de la halle (jusqu'au plafond)
function prPost() {
  return sprite(12, 86, (p) => { prCyl(p, -3, -84, 7, 84, PR_GREY, 0); p.R(-5, -84, 11, 3, PR_GREY[2]); p.R(-5, -3, 11, 3, PR_GREY[1]); });
}
// cageot de poissons sur la glace (posé sur l'étal)
function prFish() {
  return sprite(36, 18, (p) => {
    const { R, P, ell } = p;
    R(-15, -8, 30, 8, '#7a5a3a'); R(-15, -8, 30, 1, '#9a7a52'); R(-15, -4, 30, 1, '#4a3420');
    for (const [x, y, col] of [[-9, -10, '#8a9aa4'], [-1, -11, '#a8b4b8'], [7, -10, '#c86a5a'], [-5, -13, '#9aaab0'], [4, -14, '#8a9aa4']]) {
      ell(x, y, 5, 1.6, col); P(x + 5, y, shade(col, -0.3)); P(x + 6, y - 1, shade(col, -0.3)); P(x + 6, y + 1, shade(col, -0.3)); P(x - 3, y, '#1a1a1e');
    }
  });
}
// cyprès chauve : tronc évasé en contreforts, quelques « genoux » autour, houppier clair et léger, mousse espagnole
// qui pend des branches
function prCypress() {
  return sprite(128, 214, (p, c) => {
    const { R, P, line } = p, r = rng(5150), bark = ['#2e2420', '#463830', '#5e4e42', '#786658', '#948272', '#ae9c8a'];
    for (let y = -150; y <= 0; y++) { const hw = Math.round(4 + (y > -30 ? ((y + 30) / 30) ** 2 * 12 : 0) + (y < -110 ? 0 : 0)); prCyl(p, -hw, y, 2 * hw + 1, 1, bark, 0); }
    for (let x = -14; x <= 14; x += 7) line(x, -2, x * 0.4, -28, bark[1]);
    for (const x of [-30, -22, 24, 34]) { R(x, -6, 3, 6, bark[3]); R(x, -6, 1, 6, bark[5]); } // les genoux
    line(0, -120, -34, -150, bark[2], 3); line(0, -132, 30, -160, bark[2], 3); line(0, -146, -18, -186, bark[2], 2); line(0, -150, 10, -200, bark[2], 2);
    const blobs = [];
    for (let k = 0; k < 22; k++) { const a = r() * 6.283, d = r(); blobs.push([Math.cos(a) * 40 * d, -168 + Math.sin(a) * 26 * d, 10 + r() * 9, 1]); }
    blobs.push([-34, -150, 14, 1], [30, -160, 14, 1], [0, -196, 12, 1]);
    for (let y = -213; y <= -126; y++) for (let x = -63; x <= 63; x++) {
      const v = prField(blobs, x, y);
      if (v <= 0.22 || A.prN(x >> 1, y >> 1, 21) > 0.82) continue; // un feuillage léger, troué
      const g = prField(blobs, x - 3, y - 3) - prField(blobs, x + 3, y + 3);
      const t = clamp(0.45 + g * 0.6, 0, 1);
      P(x, y, ['#2a3a1e', '#3a5228', '#4e6a32', '#6a843e', '#8aa04e'][clamp(Math.floor(t * 4.99 + (prB(x, y) - 0.5) * 0.8), 0, 4)]);
    }
    // la mousse espagnole : des mèches grises qui pendent sous les branches
    for (let k = 0; k < 26; k++) {
      const x = Math.round((r() - 0.5) * 100), y0 = -150 - Math.round(r() * 30), len = 14 + Math.floor(r() * 26);
      if (prField(blobs, x, y0) < 0.2) continue;
      for (let j = 0; j < len; j++) P(x + Math.round(Math.sin(j * 0.4 + k) * 1.2), y0 + j, PT_MOSS[(j + k) % 4]);
    }
    grain(c, 0, 0, c.width, c.height, rng(53), 0.05, 0.3);
  });
}
Object.assign(PR_DECO, {
  portStack: [1, prStack], portBell: [1, prShipBell], portCoil: [1, prCoil], portBollard: [1, prBollard], portPirogue: [1, prPirogue], portCrane: [1, prCrane],
  portAnchor: [1, prAnchor], portPost: [1, prPost], portFish: [1, prFish], portCypress: [1, prCypress],
});

// murs intérieurs dessinés du sol au plafond (corniche en haut, velours ou lambris en bas) : fps.js les étire
for (const id of ['portSalonIn', 'portSalonInWin', 'portStuccoIn', 'portStuccoInWin']) A.TX_TALL[id] = true;
