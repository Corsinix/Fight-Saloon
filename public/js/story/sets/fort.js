// Le Fort Saint-Jude, au bord de la rivière : palissade de pieux ronds taillés en pointe, blockhaus d'angle à étage
// en surplomb et toit en pavillon (Fort Nisqually, Fort Vancouver), porte massive sous un chemin de ronde couvert,
// toits des casernes et maison des officiers au-dessus des pieux, peupliers et rivière derrière, drapeau.
import * as S from '../../sprites.js';
import { H } from '../../worlds.js';
import { OUT, R, O, rnd, hash, sign, flames, smoke, halo, farMesas, lantern, barrel, crate } from './kit.js';
import {
  shadowOf, blob, fillRows, outlineRows, colRows, veil, veilRows, skew, stake, logH, logWall, shingles, door, cottonwood,
  scatter, ground,
} from './kit-adobe.js';

const sh = S.shade, mix = S.mix;
const LOG = '#8a7058', LOGD = '#6e5642', WOOD = '#6a4a30', ROOF = '#6a5a4c', BASE = 170;
const P0 = 38, P1 = 600, PTOP = 84; // la palissade
const GATE = [304, 72]; // la porte : x, largeur (haut des vantaux en 74)
const FLAG = [340, 28]; // haut de la hampe, plantée sur le toit du chemin de ronde
const CHIMNEYS = [[150, 52], [236, 52], [500, 42]];
const BLOCKS = [74, 566]; // arête d'angle des deux blockhaus

// Blockhaus vu de trois quarts : face gauche au soleil, face droite à l'ombre, étage en surplomb, toit en pavillon
function blockhouse(g, cx) {
  const lit = '#94744e', dk = shadowOf('#8a6a4c', 0.58);
  // rez-de-chaussée
  O(g, cx - 22, BASE + 2, [[0, -72, 22, 72, lit], [22, -72, 24, 72, dk]]);
  logWall(g, cx - 22, BASE - 70, 22, 72, lit, cx);
  logWall(g, cx, BASE - 70, 24, 72, dk, cx + 1);
  for (const [lx, ly] of [[cx - 14, 128], [cx + 9, 136]]) { R(g, lx, ly, 6, 2, OUT); R(g, lx + 1, ly, 4, 1, '#1a1210'); }
  // l'étage en surplomb sur ses aisseliers
  O(g, cx - 28, 100, [[0, -34, 28, 34, lit], [28, -34, 30, 34, dk]]);
  logWall(g, cx - 28, 66, 28, 34, lit, cx + 2);
  logWall(g, cx, 66, 30, 34, dk, cx + 3);
  veil(g, cx - 22, 100, 46, 4, 0.35);
  for (const bx of [cx - 20, cx - 9, cx + 6, cx + 18]) { for (let k = 0; k < 6; k++) R(g, bx + (bx < cx ? -k : k) * 0.6, 100 + k, 2, 1, k ? '#4a3424' : OUT); }
  for (const [lx, ly, w] of [[cx - 22, 78, 10], [cx - 10, 86, 6], [cx + 6, 80, 10], [cx + 20, 88, 6]]) { R(g, lx, ly, w, 3, OUT); R(g, lx + 1, ly + 1, w - 2, 1, '#120c0a'); }
  // les bouts des rondins croisés à l'angle
  for (let y = 68; y < 100; y += 4) { R(g, cx - 2, y, 4, 3, OUT); R(g, cx - 1, y, 2, 2, '#b0906a'); }
  for (let y = BASE - 70; y < BASE; y += 4) { R(g, cx - 2, y, 4, 3, OUT); R(g, cx - 1, y, 2, 2, '#a88660'); }
  // le toit en pavillon : versant gauche éclairé, versant droit à l'ombre
  const apex = 40, eave = 66, left = cx - 34, right = cx + 36;
  const rows = [];
  for (let y = apex; y < eave; y++) { const k = (y - apex) / (eave - apex); rows.push([y, Math.round(cx - k * (cx - left)), Math.round(cx + k * (right - cx))]); }
  outlineRows(g, rows);
  const c = S.makeCanvas(right - left + 2, eave - apex + 1), t = c.getContext('2d');
  shingles(t, 0, 0, c.width, c.height, '#7a6a58', cx);
  g.save(); g.beginPath(); for (const [y, a, b] of rows) g.rect(a, y, b - a, 1); g.clip();
  g.drawImage(c, left, apex);
  for (const [y, a, b] of rows) veil(g, cx, y, b - cx, 1, 0.4);
  g.restore(); S.freeCanvas(c);
  R(g, left - 1, eave, right - left + 2, 2, OUT); R(g, left, eave, right - left, 1, '#9a8a74');
  for (let y = apex; y < eave; y++) R(g, cx, y, 1, 1, '#a8987e');
  O(g, cx - 1, apex, [[0, -4, 3, 4, '#5a4a3a']]); S.disc(g, cx, apex - 6, 2, OUT); R(g, cx, apex - 6, 1, 1, '#c8a040');
  // il avance devant la palissade : ombre portée sur les pieux, à droite
  veil(g, cx + 25, 104, 8, BASE - 104, 0.3);
  skew(g, cx + 24, BASE + 2, 14, 4, 1.5, 'rgba(40,24,30,0.25)');
}

export default {
  w: 660, horizon: 128, ground: 186, outdoor: true,
  far: [
    { k: 0.12, draw(g, w) {
      // les collines de l'autre rive, bleuies par la distance
      const r = rnd(9);
      let y = 116;
      for (let x = 0; x < w; x++) { y = Math.max(104, Math.min(124, y + (r() - 0.5) * 1.6 + Math.sin(x / 60) * 0.3)); R(g, x, Math.round(y), 1, 129 - Math.round(y), '#a29a9c'); R(g, x, Math.round(y), 1, 1, '#b8aeaa'); }
    } },
    { k: 0.3, draw: (g, w) => farMesas(g, w, 129, ['#b08a72', '#9e7a64'], 23) },
  ],
  back(g, w) {
    ground(g, 0, 128, w, H - 128, ['#a48a5c', '#b09462', '#ba9e68', '#c4a870'], 51, ['#d4bc88', '#7a6440']);
    // ---- la rivière derrière le fort, qui tourne vers nous à droite ; roseaux sur les berges
    const water = [];
    for (let y = 131; y < 142; y++) water.push([y, 0, w]);
    for (let y = 142; y < 180; y++) { const k = (y - 142) / 38; water.push([y, Math.round(598 + k * 18 - Math.sin(k * 3) * 5), w]); }
    fillRows(g, water.map(([y, a, b]) => [y + 1, a - 2, b]), '#5a4630');
    fillRows(g, water, '#5a7a86');
    const r = rnd(41);
    for (const [y, a, b] of water) {
      if (y % 2) for (let x = a + Math.floor(r() * 9); x < b; x += 9 + Math.floor(r() * 14)) R(g, x, y, 2 + Math.floor(r() * 4), 1, '#86a4ac');
      R(g, a, y, 1, 1, '#c8b890');
    }
    R(g, 0, 131, w, 1, '#6a8a80');
    for (let x = 590; x < 622; x += 3) if (r() < 0.7) { const rx = x + Math.floor(r() * 3), base = 146 + (x - 590); R(g, rx, base - 6, 1, 6, '#5a6a3a'); if (r() < 0.3) R(g, rx, base - 8, 1, 2, '#6a4a2a'); }
    for (let x = 0; x < 40; x += 3) { R(g, x + 1, 141, 1, 5, '#5a6a3a'); if (x % 2) R(g, x + 1, 139, 1, 2, '#6a4a2a'); }
    // l'embarcadère de planches et la barque amarrée
    for (const px of [618, 632, 646]) { O(g, px, 162, [[0, -8, 2, 8, '#4a3424']]); R(g, px, 162, 2, 3, '#3a4a50'); }
    O(g, 612, 154, [[0, 0, 48, 3, '#8a6a46']]);
    for (let x = 612; x < 660; x += 5) R(g, x, 154, 1, 3, '#5a4028');
    R(g, 612, 154, 48, 1, '#b08a5a');
    const boat = [];
    for (let y = 166; y < 172; y++) { const k = (y - 166) / 6; boat.push([y, Math.round(622 + k * 4), Math.round(652 - k * 3)]); }
    outlineRows(g, boat); fillRows(g, boat, '#6a4a30'); R(g, 622, 166, 30, 1, '#9a7448'); R(g, 626, 168, 22, 1, '#3a2a1c');
    R(g, 618, 163, 6, 1, '#c8b890'); // l'amarre
    for (let x = 618; x < 656; x += 4) R(g, x, 173, 3, 1, '#86a4ac');
    // ---- peupliers des berges, derrière les pieux
    for (const [x, base, ww, hh, s] of [[14, 131, 30, 46, 1], [112, 112, 40, 60, 2], [282, 104, 34, 56, 3], [528, 108, 38, 58, 4], [640, 131, 34, 50, 5]]) cottonwood(g, x, base, ww, hh, s);

    // ---- dans l'enceinte, au-dessus des pieux : casernes, maison des officiers, cheminées
    // casernes : grand toit de bardeaux
    const bar = [];
    for (let y = 64; y < 86; y++) { const k = (y - 64) / 16; bar.push([y, Math.round(124 - k * 8), Math.round(262 + k * 8)]); }
    outlineRows(g, bar);
    { const c = S.makeCanvas(160, 24), t = c.getContext('2d'); shingles(t, 0, 0, 160, 24, ROOF, 7);
      g.save(); g.beginPath(); for (const [y, a, b] of bar) g.rect(a, y, b - a, 1); g.clip(); g.drawImage(c, 114, 64); g.restore(); S.freeCanvas(c); }
    R(g, 124, 64, 138, 1, sh(ROOF, 0.3));
    for (const [cx, top] of CHIMNEYS.slice(0, 2)) {
      O(g, cx - 4, 70, [[0, top - 70, 8, 70 - top, '#8a6a5a'], [-1, top - 72, 10, 3, '#6a4a3a']]);
      for (let y = top; y < 70; y += 3) R(g, cx - 4 + ((y / 3) % 2 ? 0 : 2), y, 4, 1, '#6a4a3a');
      R(g, cx - 4, top, 1, 70 - top, '#a8887a');
    }
    // maison des officiers : pignon de planches blanchies, fenêtre, toit, cheminée
    const hx = 462;
    O(g, hx - 42, 86, [[0, -28, 84, 28, '#dcd2c0']]);
    for (let y = 60; y < 86; y += 4) { R(g, hx - 42, y + 3, 84, 1, '#b4aa98'); R(g, hx - 42, y, 84, 1, '#ece4d4'); }
    veil(g, hx + 10, 58, 32, 28, 0.25);
    for (const wx of [hx - 30, hx + 18]) { O(g, wx, 64, [[0, 0, 10, 12, '#e8e0d0']]); R(g, wx + 1, 65, 8, 10, '#2a3440'); R(g, wx + 5, 65, 1, 10, '#e8e0d0'); R(g, wx + 1, 70, 8, 1, '#e8e0d0'); R(g, wx - 3, 64, 2, 12, '#4a5a4a'); R(g, wx + 11, 64, 2, 12, '#4a5a4a'); }
    const roof = [];
    for (let y = 38; y < 60; y++) { const half = Math.round(((y - 38) / 22) * 48); roof.push([y, hx - half, hx + half]); }
    outlineRows(g, roof);
    { const c = S.makeCanvas(98, 23), t = c.getContext('2d'); shingles(t, 0, 0, 98, 23, '#5a4a40', 11);
      g.save(); g.beginPath(); for (const [y, a, b] of roof) g.rect(a, y, b - a, 1); g.clip(); g.drawImage(c, hx - 49, 38);
      for (const [y, a, b] of roof) veil(g, hx, y, b - hx, 1, 0.35); g.restore(); S.freeCanvas(c); }
    R(g, hx - 50, 59, 100, 2, OUT); R(g, hx - 49, 59, 98, 1, '#8a7a6a');
    for (let y = 40; y < 60; y++) { const half = Math.round(((y - 38) / 22) * 48); R(g, hx - half, y, 2, 1, '#e8e0d0'); R(g, hx + half - 2, y, 2, 1, '#b4aa98'); }
    const [chx, cht] = CHIMNEYS[2];
    O(g, chx - 4, 56, [[0, cht - 56, 8, 56 - cht, '#8a6a5a'], [-1, cht - 58, 10, 3, '#6a4a3a']]);

    // ---- la palissade
    for (let x = P0; x < P1; x += 7) {
      const v = hash(x * 3);
      const col = v < 0.2 ? '#7e6650' : v < 0.4 ? '#94785e' : v < 0.5 ? '#867a6a' : LOG;
      stake(g, x, PTOP + Math.floor(hash(x) * 5), BASE, 7, col, x);
    }
    // meurtrières, traverse de chevillage, talus de terre au pied
    for (let x = P0 + 10; x < P1 - 6; x += 28) { if (x > 290 && x < 392) continue; R(g, x, 118, 3, 7, OUT); R(g, x + 1, 119, 1, 5, '#120c0a'); }
    for (let x = P0; x < P1; x += 7) if (hash(x + 9) < 0.5) { R(g, x + 3, 106, 1, 1, '#4a3424'); R(g, x + 3, 146, 1, 1, '#4a3424'); }
    const berm = [];
    const br = rnd(23);
    let bt = 166;
    for (let x = P0 - 8; x < P1 + 8; x++) { bt = Math.max(163, Math.min(168, bt + (br() - 0.5) * 1.2)); berm.push([x, Math.round(bt)]); }
    const bRows = colRows(berm, 174);
    fillRows(g, bRows, '#8a6e48');
    for (const [x, t] of berm) { R(g, x, t, 1, 1, '#a88a5a'); if (br() < 0.2) { R(g, x, t - 2, 1, 2, '#9a8a4a'); R(g, x + 1, t - 1, 1, 1, '#7a6a3a'); } }
    veil(g, P0 - 8, 172, P1 - P0 + 16, 3, 0.2);

    // ---- la porte : poteaux équarris, linteau, chemin de ronde couvert, vantaux à pentures
    const [gx, gw] = GATE;
    for (const px of [gx - 10, gx + gw]) {
      O(g, px, BASE + 2, [[0, -112, 10, 112, '#7a5a3e']]);
      R(g, px, BASE - 110, 2, 112, '#9a7a56'); R(g, px + 8, BASE - 110, 2, 112, shadowOf('#7a5a3e', 0.4));
      for (let y = BASE - 100; y < BASE; y += 17) R(g, px + 3, y, 3, 1, '#5a4028');
    }
    veil(g, gx + gw + 10, 74, 6, BASE - 74, 0.28);
    logH(g, gx - 14, 62, gw + 28, 7, '#7a5a3e');
    for (let k = 0; k < 3; k++) logH(g, gx - 12, 50 + k * 4 - 2, gw + 24, 4, k % 2 ? '#7e6046' : '#86684c');
    R(g, gx - 12, 47, gw + 24, 1, OUT);
    { const c = S.makeCanvas(gw + 32, 8), t = c.getContext('2d'); shingles(t, 0, 0, gw + 32, 8, ROOF, 13);
      O(g, gx - 16, 40, [[0, 0, gw + 32, 8, ROOF]]); g.drawImage(c, gx - 16, 40); S.freeCanvas(c); }
    R(g, gx - 16, 40, gw + 32, 1, sh(ROOF, 0.3)); veil(g, gx - 12, 48, gw + 24, 2, 0.35);
    for (const lx of [gx + 2, gx + gw - 8]) { R(g, lx, 52, 6, 3, OUT); R(g, lx + 1, 53, 4, 1, '#120c0a'); }
    sign(g, gx + gw / 2, 50, 'FORT SAINT-JUDE', { bg: '#2a3a5a', fg: '#f0dca0' });
    const leaves = [];
    for (let y = 74; y < BASE; y++) leaves.push([y, gx, gx + gw]);
    R(g, gx - 1, 73, gw + 2, BASE - 73, OUT);
    door(g, leaves, { col: '#6a4a2e', studs: true });
    for (const [a, b] of [[gx + 2, gx + gw / 2 - 2], [gx + gw / 2 + 2, gx + gw - 2]]) for (let k = 0; k < b - a; k++) { const y = Math.round(150 - (k * 46) / (b - a)); R(g, a + k, y, 1, 3, '#4a3020'); R(g, a + k, y, 1, 1, '#7a5a3a'); }
    R(g, gx, 110, gw, 4, '#3a2a20'); R(g, gx, 110, gw, 1, '#6a5040'); // la barre
    for (const lx of [gx - 6, gx + gw + 6]) { R(g, lx, 92, 1, 6, OUT); lantern(g, lx, 98); }
    // tonneaux, caisses, abreuvoir près de la porte ; ornières vers la porte
    barrel(g, 268, 174); barrel(g, 281, 175); crate(g, 396, 176, 13); crate(g, 409, 176, 11); crate(g, 400, 163, 9);
    O(g, 220, 176, [[0, -7, 30, 7, '#7a5a3a']]); R(g, 222, 170, 26, 2, '#5a8a9a'); R(g, 220, 169, 30, 1, '#9a7a56');
    for (let y = BASE + 4; y < H; y++) {
      const k = (y - BASE - 4) / (H - BASE - 4);
      for (const off of [-22, 22]) R(g, Math.round(GATE[0] + GATE[1] / 2 + off * (1 + k * 1.6)), y, 2, 1, '#9a7e52');
    }
    blockhouse(g, BLOCKS[0]);
    blockhouse(g, BLOCKS[1]);
    // le canon dans l'embrasure du blockhaus de gauche
    O(g, BLOCKS[0] - 18, 92, [[0, 0, 10, 4, '#3a3e46']]); R(g, BLOCKS[0] - 18, 92, 10, 1, '#6a6e76'); R(g, BLOCKS[0] - 19, 92, 2, 4, '#2a2c32');
    scatter(g, 0, 176, w, 38, 80, 5, ['#8a7a4a', '#6a5a3a', '#c8b088']);
  },
  lights() { return [[433, 65, 8, 10], [481, 65, 8, 10], [BLOCKS[0] - 21, 79, 8, 1], [BLOCKS[1] - 21, 79, 8, 1], [GATE[0] - 6, 102, 18], [GATE[0] + GATE[1] + 6, 102, 18]]; },
  anim(ctx, t, fx, el, lt) {
    // le drapeau qui claque au vent ; le fort tombé (fx 'tombe') : on hisse le drapeau noir et rouge d'El Diablo
    const [fx0, fy] = FLAG;
    R(ctx, fx0 - 1, fy, 2, 13, OUT); R(ctx, fx0, fy, 1, 13, '#c8c0b0');
    S.disc(ctx, fx0, fy - 1, 1, '#c8a040');
    if (!fx.has('tombe')) {
      for (let c = 0; c < 26; c++) {
        const dy = Math.round(Math.sin(t / 140 - c / 2.5) * 1.5 * (c / 26 + 0.3));
        for (let s = 0; s < 14; s += 2) R(ctx, fx0 + 1 + c, fy + 2 + s + dy, 1, 2, c < 10 && s < 8 ? '#3a5a9a' : (s / 2) % 2 ? '#eadcb0' : '#c0392b');
        if (c < 10 && (c + Math.floor(t / 400)) % 3 === 0) R(ctx, fx0 + 1 + c, fy + 3 + dy, 1, 1, '#fdf6e0');
      }
    } else {
      const up = Math.round(10 * (1 - Math.min(1, (lt || 0) / 1600)));
      for (let c = 0; c < 24; c++) {
        const dy = Math.round(Math.sin(t / 140 - c / 2.5) * 1.5 * (c / 24 + 0.3)) + up;
        R(ctx, fx0 + 1 + c, fy + 2 + dy, 1, 14, c > 21 ? '#9a2a1c' : '#1e1416');
      }
      // le crâne cornu
      const sx = fx0 + 10, sy = fy + 5 + up + Math.round(Math.sin(t / 140 - 4) * 1.2);
      R(ctx, sx, sy, 5, 4, '#c0392b'); R(ctx, sx + 1, sy + 4, 3, 2, '#c0392b');
      R(ctx, sx - 2, sy - 2, 2, 2, '#c0392b'); R(ctx, sx + 5, sy - 2, 2, 2, '#c0392b');
      R(ctx, sx + 1, sy + 1, 1, 1, '#1e1416'); R(ctx, sx + 3, sy + 1, 1, 1, '#1e1416');
    }
    if (fx.has('breche')) {
      // la porte enfoncée : le vantail gauche arraché, le droit pendu de travers, la cour en feu derrière
      const [gx, gw] = GATE;
      R(ctx, gx, 74, gw, BASE - 74, '#2a1812');
      R(ctx, gx, 74, gw, 30, '#4a2a1e'); R(ctx, gx, 74, gw, 12, '#6a3a24'); // la fumée rougie par les feux de la cour
      R(ctx, gx, BASE - 26, gw, 26, '#5a4030'); R(ctx, gx, BASE - 26, gw, 1, '#8a6040');
      R(ctx, gx + 8, BASE - 58, 34, 32, '#3a2418'); R(ctx, gx + 8, BASE - 62, 34, 4, '#2a1a12'); // une baraque, dans la cour
      R(ctx, gx + 13, BASE - 50, 7, 9, '#e88a3a'); R(ctx, gx + 28, BASE - 50, 7, 9, '#c8602a');
      flames(ctx, gx + 40, BASE - 26, 22, 18, t, 9);
      for (let k = 0; k < 4; k++) O(ctx, gx + 2 + k * 6, 74 + (k % 2) * 6, [[0, 0, 5, 18 + k * 5, '#6a4a2e']]); // éclats au gond gauche
      for (let k = 0; k < 6; k++) { const x = gx + gw - 30 + k * 5; O(ctx, x + k, 80 + k * 3, [[0, 0, 5, BASE - 84 - k * 5, '#6a4a2e']]); R(ctx, x + k, 80 + k * 3, 1, BASE - 84 - k * 5, '#8a6a46'); }
      for (let k = 0; k < 9; k++) O(ctx, gx - 8 + k * 10, BASE + 4, [[0, -6 - (k % 3) * 3, 8 + (k % 2) * 4, 3, '#6a4a2e']]);
      O(ctx, gx + 6, BASE + 8, [[0, -6, 46, 6, '#5a4028']]); R(ctx, gx + 6, BASE + 2, 46, 1, '#8a6a46'); // le bélier
    }
    if (fx.has('feu')) {
      for (const [x, y, w, s] of FIRES) {
        smoke(ctx, x + w / 2, y - 30, t + s * 600, { n: 9, life: 3800, rise: 0.028, drift: 0.008, r0: 6, grow: 0.008, col: '40,32,30', a: 0.62 });
        flames(ctx, x, y, w, 34, t, s);
      }
    }
    if (fx.has('fumee')) for (const [[x, y], s] of [...CHIMNEYS.map((c, i) => [c, i + 1]), [[588, 60], 4]]) smoke(ctx, x, y - 2, t + s * 900, { n: 7, life: 4200, rise: 0.02, drift: 0.006, r0: 3, grow: 0.006, col: '200,196,190', a: 0.35 });
  },
  glow(ctx, t, fx) {
    if (fx.has('feu')) for (const [x, y, w] of FIRES) halo(ctx, x + w / 2, y - 10, 62, '255,120,40', 1 + 0.2 * Math.sin(t / 90 + x));
  },
};
// les feux du fort tombé : [x, pied des flammes, largeur, graine] (toits, blockhaus, palissade ; pas sur la porte : le drapeau doit se voir)
const FIRES = [[46, 70, 50, 1], [140, 82, 70, 2], [430, 64, 60, 3], [540, 70, 56, 4], [392, 88, 44, 5]];
