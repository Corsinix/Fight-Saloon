// Fusillade : la gare de Dusty Gulch, dessinée une fois par partie comme les décors du mode histoire (outils de
// story/sets/kit-ville.js) : la station à étage en planches et couvre-joints (toit de bardeaux à croupes, pignon de
// l'horloge, avant-toit sur consoles), le château d'eau, le sémaphore, le télégraphe, les rails, le quai de planches,
// et le train à quai (voitures de voyageurs à lanterneau, wagons de marchandises à portes coulissantes, wagons à
// bestiaux à claire-voie, locomotive américaine 4-4-0). Lumière en haut à gauche.
// La géométrie (STA, wagonOpenings, locoCab : worlds.js) est celle des emplacements des cibles : le dessin la suit au
// pixel près. shooterdeco.js dessine par-dessus : reflets des vitres, horloge, phare, lanternes du quai, drapeau…
import * as S from './sprites.js';
import { canvasText } from './scene.js';
import { H, STATION_W, STA, STA_COVER, PROP_BASE, wagonOpenings, stationTrain } from './worlds.js';
import { skyAndFar } from './shootersky.js';
import { bands } from './story/sets/kit.js';
import {
  OUT, R, rnd, shadow, box, battens, siding, sash, shingleRoof, brick, poster, telePole, wire, tuft, semaphore, milkCan, sack,
} from './story/sets/kit-ville.js';

const sh = S.shade;
const P = STA.platform; // 170 : le bord du quai
const RAIL = 162; // dessus du rail de devant : les roues y posent
const BODY = 146; // bas des caisses (dessous : châssis et bogies)
const IRON = '#3a3a42', STEEL = '#a8aeb6', BRASS = '#c8a040';
// la station : peinture, encadrements, bardeaux, volets (tirés de la graine)
const LOOKS = [
  { wall: '#b0783a', trim: '#3e4a2e', roof: '#5a3a2e', shut: '#3e4a2e' },
  { wall: '#8a3428', trim: '#e4d8bc', roof: '#3e3432', shut: '#2e3a2a' },
  { wall: '#c8b088', trim: '#6a3a24', roof: '#4a3a36', shut: '#7a2a20' },
];
// livrées des voitures de voyageurs : caisse, filets et lettres
const LIVERIES = [
  { body: '#6e2620', line: '#e0b040' }, { body: '#2f4a3a', line: '#d8c088' }, { body: '#7a4a24', line: '#f0d080' },
];

// ------------------------------------------------------------ le fond : terre-plein, voie, télégraphe, château d'eau
function drawTrack(g, x0, x1, r) {
  const w = x1 - x0;
  // l'accotement de terre entre le désert et le ballast
  bands(g, x0, 140, w, 8, ['#8e6a4c', '#86624a']);
  for (let i = 0; i < w * 0.3; i++) R(g, x0 + Math.floor(r() * w), 140 + Math.floor(r() * 7), r() < 0.3 ? 2 : 1, 1, r() < 0.5 ? '#a07a58' : '#6e4e38');
  for (let x = x0 + 6; x < x1; x += 30 + Math.floor(r() * 50)) tuft(g, x, 146, '#8a7a48');
  // le ballast, tramé, plus sombre sous les rails
  bands(g, x0, 146, w, 24, ['#7e6e62', '#74645a', '#6a5a50', '#62544a']);
  for (let i = 0; i < w * 3; i++) R(g, x0 + Math.floor(r() * w), 146 + Math.floor(r() * 24), 1, 1, r() < 0.5 ? '#9a8a7c' : '#4a3e38');
  // les traverses (vues un peu d'en haut), les crampons
  for (let x = x0 + 2 + Math.floor(r() * 4); x < x1; x += 14) {
    const c = r() < 0.2 ? '#5a3a24' : '#4a2e1c';
    R(g, x - 1, 150, 11, 17, OUT); R(g, x, 151, 9, 15, c); R(g, x, 151, 9, 1, sh(c, 0.3)); R(g, x, 151, 1, 15, sh(c, 0.18));
    R(g, x + 8, 152, 1, 14, sh(c, -0.3)); if (r() < 0.4) R(g, x + 3 + Math.floor(r() * 4), 154, 1, 6, sh(c, -0.35)); // une fente
    shadow(g, x + 9, 152, 2, 14, 0.25);
  }
  // le rail du fond, celui de devant (champignon clair, âme, patin), leur ombre
  R(g, x0, 152, w, 4, OUT); R(g, x0, 153, w, 1, '#c8ccd4'); R(g, x0, 154, w, 1, '#6a707a');
  R(g, x0, 161, w, 5, OUT); R(g, x0, 162, w, 1, '#e0e4ea'); R(g, x0, 163, w, 1, '#8a909a'); R(g, x0, 164, w, 1, '#4e545c');
  shadow(g, x0, 166, w, 2, 0.3); shadow(g, x0, 156, w, 1, 0.3);
  for (let x = x0 + 4; x < x1; x += 14) { R(g, x + 1, 160, 2, 1, '#5a5a62'); R(g, x + 6, 160, 2, 1, '#5a5a62'); } // crampons
}

// Le château d'eau sur ses tréteaux, derrière la voie (x : gauche de la cuve)
function drawTower(g, x, top) {
  const w = 72, th = 40, base = 148, legTop = top + th + 3;
  // les pieds et les croix de Saint-André
  for (const lx of [x + 4, x + 26, x + 44, x + 64]) {
    R(g, lx - 1, legTop, 6, base - legTop, OUT); R(g, lx, legTop, 4, base - legTop, '#5a3a22'); R(g, lx, legTop, 1, base - legTop, '#7a5232'); R(g, lx + 3, legTop, 1, base - legTop, '#3e2616');
  }
  for (let yy = legTop + 6; yy < base - 14; yy += 26) {
    for (const [a, b] of [[x + 8, x + 26], [x + 48, x + 64]]) for (let k = 0; k <= b - a; k++) {
      const d = Math.round((k * 22) / (b - a));
      R(g, a + k, yy + d, 1, 2, '#3a2414'); R(g, a + k, yy + 22 - d, 1, 2, '#3a2414');
    }
    R(g, x + 2, yy + 23, w - 4, 3, OUT); R(g, x + 3, yy + 24, w - 6, 1, '#6a4428');
  }
  // le plancher sous la cuve
  R(g, x - 4, top + th, w + 8, 5, OUT); R(g, x - 3, top + th + 1, w + 6, 3, '#5a3a22'); R(g, x - 3, top + th + 1, w + 6, 1, '#7a5232');
  // la cuve : douelles éclairées à gauche, cerclages de fer et leurs tendeurs
  R(g, x - 1, top - 1, w + 2, th + 2, OUT);
  for (let xx = 0; xx < w; xx += 4) {
    const c = sh('#7a4a2c', (((xx / 4) % 3) - 1) * 0.05 + (xx < 14 ? 0.14 : xx > w - 16 ? -0.22 : 0));
    R(g, x + xx, top, 4, th, c); R(g, x + xx, top, 1, th, sh(c, -0.28));
  }
  const r = rnd(x);
  for (let i = 0; i < 30; i++) R(g, x + 2 + Math.floor(r() * (w - 4)), top + Math.floor(r() * th), 1, 2 + Math.floor(r() * 4), sh('#7a4a2c', r() < 0.5 ? -0.2 : 0.1));
  for (let i = 0; i < 6; i++) shadow(g, x + 4 + Math.floor(r() * (w - 8)), top + th - 14 + Math.floor(r() * 6), 1, 12, 0.2); // les coulures
  for (const yy of [top + 6, top + 19, top + 32]) {
    R(g, x - 1, yy, w + 2, 3, OUT); R(g, x, yy + 1, w, 1, '#7a7a82');
    for (const tx of [x + 20, x + 52]) R(g, tx, yy, 3, 3, '#4a4a52');
  }
  // l'échelle
  for (const lx of [x + 8, x + 14]) R(g, lx, top - 2, 1, base - top - 40, '#2e2e34');
  for (let yy = top + 2; yy < base - 42; yy += 4) R(g, x + 8, yy, 7, 1, '#2e2e34');
  // le toit conique et son épi
  for (let k = 0; k < 12; k++) {
    const yy = top - 2 - Math.round(k * 1.5), x0 = x - 5 + k * 3, ww = w + 10 - k * 6;
    R(g, x0 - 1, yy - 1, ww + 2, 3, OUT);
    R(g, x0, yy, ww, 2, k % 2 ? '#4a3a36' : '#544440'); R(g, x0, yy, Math.max(1, Math.round(ww * 0.3)), 1, '#6a5a54');
  }
  R(g, x + w / 2 - 1, top - 26, 3, 8, OUT); R(g, x + w / 2, top - 25, 1, 7, '#8a8f98');
  // le bec verseur relevé, sa chaîne
  R(g, x + w - 8, top + th - 13, 24, 6, OUT); R(g, x + w - 7, top + th - 12, 22, 4, '#4a4a52'); R(g, x + w - 7, top + th - 12, 22, 1, '#7a7a82');
  R(g, x + w + 13, top + th - 12, 6, 18, OUT); R(g, x + w + 14, top + th - 11, 4, 16, '#4a4a52'); R(g, x + w + 14, top + th - 11, 1, 16, '#7a7a82');
  for (let k = 0; k < 26; k += 2) R(g, x + w + 4, top + th - 6 + k, 1, 1, '#2e2e34');
}

// Le fond de la gare : la voie, le sémaphore, les poteaux du télégraphe, le château d'eau
function drawBack(g, r) {
  semaphore(g, 12, 148, 108);
  const pts = [568, 952].map((px) => telePole(g, px, 148, 112));
  for (const k of [0, 1, 2, 3]) {
    wire(g, 200, pts[0][k][1] + 6, pts[0][k][0], pts[0][k][1], 4, '#3a2618');
    wire(g, pts[0][k][0], pts[0][k][1], pts[1][k][0], pts[1][k][1], 12, '#3a2618');
    wire(g, pts[1][k][0], pts[1][k][1], STATION_W + 20, pts[1][k][1] + 4, 8, '#3a2618');
  }
  drawTower(g, STA.tower - 36, 20);
  drawTrack(g, 0, STATION_W, r);
}

// ------------------------------------------------------------ la station
function drawDepot(g, K, seed) {
  const B = STA.building, x0 = B.x, x1 = B.x + B.w, w = B.w;
  const EAVE = 50, CAN = 100; // bas du toit ; bas de l'avant-toit du quai
  const { wall, trim, roof } = K, tl = sh(trim, 0.25), td = sh(trim, -0.35);
  const r = rnd(seed * 7 + 3);
  // le toit à croupes, ses cheminées de brique
  shingleRoof(g, x0 - 12, x1 + 12, 26, EAVE, roof, 22, seed);
  for (const cx of [66, 292]) {
    R(g, cx - 1, 9, 12, 26, OUT); brick(g, cx, 10, 10, 24, '#8a4030', '#a88a70', cx);
    R(g, cx, 10, 2, 24, 'rgba(255,230,190,0.18)');
    R(g, cx - 3, 6, 16, 5, OUT); R(g, cx - 2, 7, 14, 2, '#6a6a6a'); R(g, cx - 2, 7, 14, 1, '#8a8a8a');
    shadow(g, cx + 10, 30, 6, 4, 0.3);
  }
  // le mât du drapeau (le drapeau lui-même flotte : shooterdeco.js)
  R(g, x0 + 19, 24, 3, 9, OUT); R(g, x0 + 20, 24, 1, 8, '#5a4a40'); R(g, x0 + 17, 31, 7, 2, OUT);
  // les murs : planches et couvre-joints à l'étage et au rez-de-chaussée, soubassement à clin
  R(g, x0 - 1, EAVE, w + 2, P - EAVE, OUT);
  battens(g, x0, EAVE + 1, w, CAN - EAVE - 1, wall, seed, 8);
  battens(g, x0, CAN, w, 50, sh(wall, -0.04), seed + 1, 8);
  siding(g, x0, 154, w, 16, sh(wall, -0.12), seed + 3, { lap: 4 });
  R(g, x0, 150, w, 4, trim); R(g, x0, 150, w, 1, tl); R(g, x0, 153, w, 1, OUT);
  for (let i = 0; i < 40; i++) { // la peinture écaillée, des coulures sous l'avant-toit
    const px = x0 + 4 + Math.floor(r() * (w - 10)), py = EAVE + 6 + Math.floor(r() * 96), pw = 2 + Math.floor(r() * 4);
    R(g, px, py, pw, 1, sh('#8a6a48', (r() - 0.5) * 0.2)); R(g, px, py + 1, pw, 1, sh(wall, -0.3));
  }
  for (const px of [x0, x1 - 5]) { R(g, px, EAVE, 5, P - EAVE, trim); R(g, px, EAVE, 1, P - EAVE, tl); R(g, px + 4, EAVE, 1, P - EAVE, td); } // planches d'angle
  // la planche de rive du toit, son ombre sur le mur
  shadow(g, x0, EAVE + 5, w, 6, 0.32);
  R(g, x0 - 13, EAVE, w + 26, 6, OUT); R(g, x0 - 12, EAVE + 1, w + 24, 4, trim); R(g, x0 - 12, EAVE + 1, w + 24, 1, tl); R(g, x0 - 12, EAVE + 4, w + 24, 1, td);
  // le pignon de l'horloge : bardeaux en écailles, aisselier, ouïe d'aération
  const gx = B.x + 150, half0 = 46, gtop = 10, gb = EAVE + 6;
  for (let y = gtop; y <= gb; y++) {
    const half = Math.round((half0 * (y - gtop)) / (gb - gtop));
    R(g, gx - half - 2, y, half * 2 + 4, 1, OUT);
  }
  for (let y = gtop + 3; y <= gb; y++) {
    const half = Math.round((half0 * (y - gtop)) / (gb - gtop)) - 4;
    if (half <= 0) continue;
    const row = Math.floor((y - gtop - 3) / 4), yy = (y - gtop - 3) % 4;
    for (let x = gx - half; x < gx + half; x++) {
      const k = (x - gx + 64 + (row % 2) * 2) % 4;
      const c = y > 36 ? sh(wall, ((x >> 3) % 2 ? 0.03 : -0.02) + (x % 8 === 7 ? -0.3 : 0)) : yy === 3 && (k === 1 || k === 2) ? sh(roof, -0.35) : yy === 2 && (k === 0 || k === 3) ? sh(roof, -0.25) : yy === 0 ? sh(roof, 0.25) : sh(roof, 0.12);
      R(g, x, y, 1, 1, c);
    }
  }
  R(g, gx - 34, 36, 68, 3, OUT); R(g, gx - 33, 37, 66, 1, trim); // la moise sous les écailles
  // les rives du pignon, éclairées à gauche, et l'épi du faîte
  for (let y = gtop; y <= gb; y++) {
    const half = Math.round((half0 * (y - gtop)) / (gb - gtop));
    R(g, gx - half - 1, y, 3, 1, tl); R(g, gx + half - 2, y, 3, 1, td);
  }
  R(g, gx - 1, gtop - 8, 3, 9, OUT); R(g, gx, gtop - 7, 1, 8, trim);
  S.disc(g, gx, 24, 5, OUT); S.disc(g, gx, 24, 4, trim); // l'ouïe
  for (let k = -3; k <= 3; k += 2) R(g, gx - 3, 24 + k, 7, 1, sh(roof, -0.4));
  S.disc(g, gx, 58, 13, OUT); S.disc(g, gx, 58, 12, trim); S.disc(g, gx, 58, 11, sh(trim, -0.2)); // l'entourage de l'horloge
  R(g, gx - 2, 44, 5, 3, trim);
  // l'étage : fenêtres à guillotine et leurs volets, la plaque au nom de la gare (le texte : shooter.js)
  const curtains = ['#a8403a', '#c8a060', '#5a7a9a', '#7a8a5a'];
  for (const wn of B.windows) {
    const up = wn.y < 100;
    sash(g, wn.x - 2, wn.y - 2, wn.w + 4, wn.h + 4, { frame: K.trim === '#e4d8bc' ? '#e4d8bc' : '#ddd0b0', shutters: up ? K.shut : null, rows: !up, cap: up, glass: '#20262e', curtain: curtains[Math.floor(r() * 4)] });
  }
  const px0 = gx - 68, pw = 136;
  R(g, px0 - 1, 71, pw + 2, 18, OUT); R(g, px0, 72, pw, 16, '#eadcb0'); R(g, px0, 72, pw, 1, '#fff4d0'); R(g, px0, 87, pw, 1, '#c8b07c');
  R(g, px0 + 2, 74, pw - 4, 1, '#8a6a44'); R(g, px0 + 2, 85, pw - 4, 1, '#8a6a44'); R(g, px0 + 2, 74, 1, 12, '#8a6a44'); R(g, px0 + pw - 3, 74, 1, 12, '#8a6a44');
  for (const nx of [px0 + 4, px0 + pw - 5]) { R(g, nx, 79, 1, 1, '#5a5a62'); }
  shadow(g, px0 + 2, 89, pw, 2, 0.3);
  // l'avant-toit qui abrite le quai : pente de bardeaux, rive, consoles, poteaux d'angle
  shingleRoof(g, x0 - 14, x1 + 14, 93, CAN, roof, 3, seed + 2);
  shadow(g, x0, CAN + 5, w, 10, 0.3); shadow(g, x0, CAN + 15, w, 14, 0.12);
  R(g, x0 - 15, CAN, w + 30, 7, OUT); R(g, x0 - 14, CAN + 1, w + 28, 5, trim); R(g, x0 - 14, CAN + 1, w + 28, 1, tl); R(g, x0 - 14, CAN + 5, w + 28, 1, td);
  for (let px = x0 - 10; px < x1 + 12; px += 6) R(g, px, CAN + 2, 1, 2, td); // les bouts de chevrons
  for (const px of [x0 + 10, x0 + 80, x0 + 162, x0 + 240, x0 + 290]) {
    R(g, px - 1, CAN + 6, 4, 22, OUT); R(g, px, CAN + 6, 2, 21, trim);
    for (let k = 0; k < 14; k++) { R(g, px + 2 + Math.round(k * 0.6), CAN + 26 - k, 2, 1, OUT); R(g, px - 2 - Math.round(k * 0.6), CAN + 26 - k, 2, 1, OUT); }
    for (let k = 1; k < 13; k++) { R(g, px + 2 + Math.round(k * 0.6), CAN + 26 - k, 1, 1, trim); R(g, px - 1 - Math.round(k * 0.6), CAN + 26 - k, 1, 1, trim); }
  }
  for (const px of [x0 - 12, x1 + 9]) {
    R(g, px - 1, CAN + 6, 6, P - CAN - 6, OUT); R(g, px, CAN + 6, 4, P - CAN - 6, trim); R(g, px, CAN + 6, 1, P - CAN - 6, tl); R(g, px + 3, CAN + 6, 1, P - CAN - 6, td);
    for (const s of [-1, 1]) for (let k = 0; k < 10; k++) R(g, px + 1 + s * (3 + k), CAN + 6 + k, 2, 2, k === 9 ? OUT : trim);
    shadow(g, px + 4, P, 8, 2, 0.35);
  }
  // la porte de la salle d'attente, grande ouverte (le bandit s'y montre)
  const d = B.door;
  R(g, d.x - 4, d.y - 4, d.w + 8, d.h + 4, OUT); R(g, d.x - 3, d.y - 3, d.w + 6, d.h + 3, trim); R(g, d.x - 3, d.y - 3, d.w + 6, 1, tl); R(g, d.x - 3, d.y - 3, 1, d.h + 3, tl);
  R(g, d.x - 1, d.y - 1, d.w + 2, d.h + 1, OUT);
  R(g, d.x, d.y, d.w, d.h, '#20140e');
  R(g, d.x, d.y, d.w, 6, '#140c08'); R(g, d.x, d.y + d.h - 7, d.w, 7, '#3a2618'); R(g, d.x, d.y + d.h - 7, d.w, 1, '#4a3020'); // le plancher éclairé
  R(g, d.x + 12, d.y + 12, 12, 16, '#2a1c14'); R(g, d.x + 13, d.y + 13, 10, 14, '#4a3a2a'); R(g, d.x + 18, d.y + 13, 1, 14, '#2a1c14'); // la fenêtre du fond
  for (const [lx, s] of [[d.x, 1], [d.x + d.w - 5, -1]]) { // les battants ouverts vers l'intérieur
    R(g, lx, d.y, 5, d.h - 1, sh(wall, -0.5)); R(g, lx + (s > 0 ? 4 : 0), d.y, 1, d.h - 1, OUT);
    R(g, lx + 1, d.y + 6, 3, 18, '#4a5a68');
  }
  R(g, d.x - 6, d.y + d.h - 2, d.w + 12, 2, OUT); // le seuil
  // la porte de fret coulissante, fermée
  const fx = 278, fw = 44, ft = 112;
  R(g, fx - 6, ft - 6, fw + 12, 3, IRON); R(g, fx - 6, ft - 6, fw + 12, 1, '#6a6a72');
  R(g, fx - 1, ft - 1, fw + 2, P - ft + 1, OUT);
  battens(g, fx, ft, fw, P - ft, sh(wall, -0.12), seed + 9, 6);
  R(g, fx, ft, fw, 3, trim); R(g, fx, P - 3, fw, 3, trim); R(g, fx, ft, 3, P - ft, trim); R(g, fx + fw - 3, ft, 3, P - ft, trim);
  for (let k = 0; k < P - ft - 6; k++) R(g, fx + 3 + Math.round((k * (fw - 8)) / (P - ft - 6)), ft + 3 + k, 2, 1, trim);
  for (const rx of [fx + 3, fx + fw - 7]) { R(g, rx, ft - 7, 4, 4, OUT); R(g, rx + 1, ft - 6, 2, 2, '#6a6a72'); }
  R(g, fx + 6, 140, 3, 6, OUT); R(g, fx + 7, 141, 1, 4, '#8a8f98'); // le moraillon
  // le tableau des départs, les avis de recherche, le banc
  R(g, 99, 113, 34, 30, OUT); R(g, 100, 114, 32, 28, '#26221e'); R(g, 100, 114, 32, 1, '#4a443e');
  R(g, 102, 116, 28, 3, '#c8a050');
  for (let k = 0; k < 6; k++) { R(g, 102, 122 + k * 3, 12 + ((k * 7) % 6), 1, '#d8d0c0'); R(g, 120, 122 + k * 3, 8, 1, '#d8d0c0'); }
  R(g, 115, 108, 1, 5, '#3a3a40');
  poster(g, 182, 116, 14, 18, '#e0cc98'); poster(g, 201, 120, 12, 16, '#d8c48a');
  R(g, 175, 151, 46, 5, OUT); R(g, 176, 152, 44, 3, '#8a5a34'); R(g, 176, 152, 44, 1, '#b07a48'); // le banc
  R(g, 175, 141, 46, 5, OUT); R(g, 176, 142, 44, 3, '#7a4a2a'); R(g, 176, 142, 44, 1, '#a06a3a');
  for (const lx of [178, 215]) { R(g, lx - 1, 146, 5, 6, OUT); R(g, lx, 146, 3, 6, '#5a3420'); R(g, lx - 1, 155, 5, 15, OUT); R(g, lx, 155, 3, 15, '#5a3420'); }
  shadow(g, 182, 168, 44, 2, 0.35);
  // le pied du mur
  R(g, x0, P - 1, w, 1, OUT);
}

// ------------------------------------------------------------ le train
// Roue de wagon pleine (r 7) : bandage, toile percée de quatre trous qui tournent avec la roue
const wheelCache = new Map();
function wheelSprite(kind, frame) {
  const key = kind + frame;
  let c = wheelCache.get(key);
  if (c) return c;
  const big = kind === 'drive', pilot = kind === 'pilot';
  const r = big ? 16 : pilot ? 8 : 7;
  const s = r * 2 + 3, o = r + 1;
  c = S.makeCanvas(s, s);
  const g = c.getContext('2d');
  const col = big || pilot ? '#a8302a' : '#3a363a';
  const a0 = (frame / 16) * Math.PI * 2;
  S.disc(g, o, o, r, OUT);
  S.disc(g, o, o, r - 1, '#5e5e66'); // le bandage d'acier
  for (let a = 0; a < 40; a++) { // éclairé en haut à gauche
    const an = Math.PI + 0.3 + (a / 40) * 1.6;
    R(g, o + Math.round(Math.cos(an) * (r - 1)), o + Math.round(Math.sin(an) * (r - 1)), 1, 1, '#9a9ea6');
  }
  if (big || pilot) {
    S.disc(g, o, o, r - 3, col); S.disc(g, o, o, r - 4, '#241a1a'); // la jante, le jour entre les rayons
    const n = big ? 14 : 8;
    for (let k = 0; k < n; k++) {
      const an = a0 + (k * Math.PI * 2) / n;
      for (let d = 2; d < r - 3; d++) R(g, o + Math.round(Math.cos(an) * d), o + Math.round(Math.sin(an) * d), big ? 2 : 1, big ? 2 : 1, col);
    }
    if (big) { // le contrepoids, en croissant
      for (let d = 5; d < r - 3; d++) for (let a = -6; a <= 6; a++) {
        const an = a0 + Math.PI + a * 0.1;
        R(g, o + Math.round(Math.cos(an) * d), o + Math.round(Math.sin(an) * d), 1, 1, d > r - 6 || Math.abs(a) > 4 ? sh(col, -0.25) : col);
      }
    }
    S.disc(g, o, o, big ? 4 : 2, OUT); S.disc(g, o, o, big ? 3 : 1, col); R(g, o - 1, o - 1, 2, 1, sh(col, 0.35));
  } else {
    S.disc(g, o, o, r - 3, col); S.disc(g, o, o, r - 4, sh(col, 0.12));
    for (let k = 0; k < 4; k++) { const an = a0 + (k * Math.PI) / 2; R(g, o + Math.round(Math.cos(an) * 3), o + Math.round(Math.sin(an) * 3), 1, 1, '#141012'); }
  }
  wheelCache.set(key, c);
  return c;
}
// angle de rotation → image de la roue (16 par tour)
const wheelAt = (kind, ang) => wheelSprite(kind, ((Math.floor((ang / (Math.PI * 2)) * 16) % 16) + 16) % 16);
function drawWheel(g, kind, cx, cy, ang) {
  const c = wheelAt(kind, ang);
  g.drawImage(c, Math.round(cx) - (c.width >> 1), Math.round(cy) - (c.height >> 1));
}

// Les bogies d'un wagon (roues et boîtes d'essieu), au-dessus des longerons
function carWheels(g, x, w, ang) {
  for (const tx of [x + 30, x + w - 30]) for (const dx of [-10, 10]) {
    drawWheel(g, 'car', tx + dx, RAIL - 8, ang);
    R(g, tx + dx - 3, RAIL - 11, 7, 6, OUT); R(g, tx + dx - 2, RAIL - 10, 5, 4, '#4a4448'); R(g, tx + dx - 2, RAIL - 10, 5, 1, '#6a6468');
  }
}

// Le châssis d'un wagon : longeron, tirants armés, bogies (sans les roues), attelage
function underframe(g, x, w) {
  R(g, x + 1, BODY, w - 2, 5, OUT); R(g, x + 2, BODY, w - 4, 3, '#2e2a2c'); R(g, x + 2, BODY, w - 4, 1, '#4a4446');
  // les tirants sous la caisse, leurs aiguilles
  for (let i = 0; i <= w - 84; i++) R(g, x + 42 + i, BODY + 4 + Math.round(Math.sin((Math.PI * i) / (w - 84)) * 4), 1, 1, '#5a5a62');
  for (const qx of [x + w / 2 - 20, x + w / 2 + 20]) R(g, qx, BODY + 4, 1, 5, '#2e2a2c');
  box(g, x + w / 2 - 9, BODY + 4, 18, 5, '#2a2628'); // le cylindre de frein
  // les bogies : traverse, ressorts, longrines
  for (const tx of [x + 30, x + w - 30]) {
    R(g, tx - 21, BODY + 4, 42, 5, OUT); R(g, tx - 20, BODY + 5, 40, 3, '#2a2628'); R(g, tx - 20, BODY + 5, 40, 1, '#4a4448');
    R(g, tx - 4, BODY + 3, 9, 7, OUT); for (let k = 0; k < 3; k++) R(g, tx - 3, BODY + 4 + k * 2, 7, 1, '#6a6a72');
  }
  // l'attelage à maillon (vers le wagon suivant)
  R(g, x + w - 1, BODY - 5, 10, 5, OUT); R(g, x + w, BODY - 4, 8, 3, IRON); R(g, x + w + 6, BODY - 3, 6, 1, '#6a6a72');
  R(g, x - 9, BODY - 5, 10, 5, OUT); R(g, x - 8, BODY - 4, 8, 3, IRON);
}

// Le toit d'un wagon de marchandises (le dessus en y 70) : volant de frein au bout
function freightRoof(g, x, w) {
  R(g, x - 4, 69, w + 8, 6, OUT); R(g, x - 3, 70, w + 6, 4, '#3e3436'); R(g, x - 3, 70, w + 6, 1, '#6a5e5a'); R(g, x - 3, 73, w + 6, 1, '#2a2224');
  for (let px = x; px < x + w; px += 12) R(g, px, 71, 1, 2, '#2a2224'); // les couvre-joints du toit
  R(g, x + 5, 58, 3, 12, OUT); R(g, x + 6, 59, 1, 11, IRON); // le volant de frein
  R(g, x - 1, 56, 15, 4, OUT); R(g, x, 57, 13, 2, '#4a4a52'); R(g, x, 57, 13, 1, '#7a7a82');
  for (let y = 80; y < 140; y += 6) { R(g, x + w - 11, y, 7, 2, OUT); R(g, x + w - 10, y, 5, 1, '#6a6a72'); } // les marches d'échelle
}

// Caisse à charpente apparente : sablière, longeron, poteaux d'angle et montants de la porte (d) ; braced : écharpes
// des pieds des poteaux d'angle vers le haut des montants ; posts : montants en plus (abscisses)
function frame(g, x, w, col, d, braced = true, posts = []) {
  const lt = sh(col, 0.2), dk = sh(col, -0.35);
  const post = (px, pw = 5) => { R(g, px - 1, 74, pw + 2, 72, OUT); R(g, px, 74, pw, 72, col); R(g, px, 74, 1, 72, lt); R(g, px + pw - 1, 74, 1, 72, dk); };
  const brace = (ax, bx) => {
    const n = Math.abs(bx - ax), s = Math.sign(bx - ax);
    for (let k = 0; k <= n; k++) R(g, ax + s * k - 1, 139 - Math.round((k * 61) / n), 5, 5, OUT);
    for (let k = 0; k <= n; k++) { const py = 140 - Math.round((k * 61) / n); R(g, ax + s * k, py, 3, 3, col); R(g, ax + s * k, py, 3, 1, lt); }
  };
  if (braced) { brace(x + 5, d.x - 9); brace(x + w - 8, d.x + d.w + 6); }
  R(g, x - 1, 73, w + 2, 6, OUT); R(g, x, 74, w, 4, col); R(g, x, 74, w, 1, lt); // la sablière
  R(g, x - 1, BODY - 6, w + 2, 7, OUT); R(g, x, BODY - 5, w, 5, col); R(g, x, BODY - 5, w, 1, lt); R(g, x, BODY - 1, w, 1, dk); // le longeron
  for (const px of [x, x + w - 5, d.x - 5, d.x + d.w, ...posts]) post(px);
  for (let px = x + 8; px < x + w - 8; px += 10) { R(g, px, 75, 1, 1, '#2a2224'); R(g, px, BODY - 3, 1, 1, '#2a2224'); } // les boulons
}

function boxcar(g, wg, r) {
  const { x, w } = wg, o = wagonOpenings(wg), mid = x + w / 2;
  const col = ['#8a3a24', '#7a3a2a', '#94482a'][Math.floor(r() * 3)];
  freightRoof(g, x, w);
  R(g, x - 1, 73, w + 2, BODY - 72, OUT);
  battens(g, x, 74, w, BODY - 74, col, Math.floor(r() * 99), 6);
  for (let i = 0; i < 16; i++) shadow(g, x + 2 + Math.floor(r() * (w - 4)), 78 + Math.floor(r() * 20), 1, 10 + Math.floor(r() * 30), 0.14); // les coulures
  frame(g, x, w, sh(col, -0.18), o.doors[0]);
  // le marquage au pochoir
  g.globalAlpha = 0.85;
  canvasText(g, 'C.P.R.R.', x + 38, 116, { color: '#e8dcc0', shadow: '' });
  canvasText(g, `N° ${1200 + Math.floor(r() * 800)}`, x + w - 38, 116, { color: '#e8dcc0', shadow: '' });
  g.globalAlpha = 1;
  // les lucarnes d'aération, leur trappe relevée
  for (const v of o.wins) {
    R(g, v.x - 3, v.y - 3, v.w + 6, v.h + 6, OUT); R(g, v.x - 2, v.y - 2, v.w + 4, v.h + 4, sh(col, -0.25)); R(g, v.x - 2, v.y - 2, v.w + 4, 1, sh(col, 0.1));
    R(g, v.x, v.y, v.w, v.h, '#1a120e'); R(g, v.x, v.y, v.w, 4, '#120a06');
    R(g, v.x + 2, v.y + v.h - 6, 8, 6, '#6a4a2a'); R(g, v.x + 2, v.y + v.h - 6, 8, 1, '#8a6a3a'); // une caisse dans la pénombre
    for (let k = 0; k < v.w; k++) R(g, v.x + k, v.y - 9 + Math.round(k * 0.18), 1, 5, k === 0 || k === v.w - 1 ? OUT : sh(col, -0.1));
    R(g, v.x - 1, v.y - 10, v.w + 2, 1, OUT);
  }
  // la porte : grande ouverte sur la cargaison, ses deux vantaux coulissés de part et d'autre
  const d = o.doors[0];
  R(g, d.x - 24, d.y - 6, d.w + 48, 3, OUT); R(g, d.x - 23, d.y - 5, d.w + 46, 1, '#6a6a72');
  R(g, d.x - 3, d.y - 3, d.w + 6, d.h + 6, OUT);
  R(g, d.x, d.y, d.w, d.h, '#1c130e');
  for (let px = d.x + 4; px < d.x + d.w; px += 6) R(g, px, d.y, 1, d.h, '#24190f'); // le fond du wagon
  R(g, d.x, d.y, d.w, 5, '#100a06');
  R(g, d.x + 2, d.y + d.h - 16, 16, 16, '#7a5228'); R(g, d.x + 2, d.y + d.h - 16, 16, 1, '#9a6a38'); R(g, d.x + 2, d.y + d.h - 9, 16, 1, '#5a3a1c'); // les caisses
  R(g, d.x + 4, d.y + d.h - 26, 12, 10, '#6a4422'); R(g, d.x + 4, d.y + d.h - 26, 12, 1, '#8a5a30');
  R(g, d.x + d.w - 16, d.y + d.h - 10, 14, 10, '#b8a078'); R(g, d.x + d.w - 13, d.y + d.h - 13, 6, 3, '#a89068'); // un sac
  R(g, d.x, d.y + d.h - 2, d.w, 2, '#3a2a1c');
  for (const [lx, lw] of [[d.x - 22, 19], [d.x + d.w + 3, 19]]) {
    R(g, lx - 1, d.y - 3, lw + 2, d.h + 5, OUT);
    battens(g, lx, d.y - 2, lw, d.h + 3, sh(col, 0.06), x + lx, 5);
    R(g, lx, d.y - 2, lw, 3, sh(col, -0.25)); R(g, lx, d.y + d.h - 2, lw, 3, sh(col, -0.25));
    for (let k = 0; k < d.h - 4; k++) R(g, lx + 2 + Math.round((k * (lw - 6)) / (d.h - 4)), d.y + 1 + k, 2, 1, sh(col, -0.3));
    R(g, lx + (lx < d.x ? lw - 4 : 2), d.y + 26, 2, 6, '#8a8f98'); // la poignée
  }
}

// Une vache dans la pénombre du wagon (dir 1 : tête à droite) : (x, y) = le haut du dos
function cow(g, x, y, dir, hide, spots, r) {
  const c = sh(hide, -0.3), lt = sh(hide, -0.1), dk = sh(hide, -0.55);
  R(g, x + 1, y, 26, 16, c); R(g, x, y + 1, 28, 14, c); R(g, x + 2, y, 24, 1, lt); R(g, x + 1, y + 13, 26, 3, dk);
  if (spots) for (let k = 0; k < 3; k++) R(g, x + 3 + Math.floor(r() * 18), y + 2 + Math.floor(r() * 7), 4 + Math.floor(r() * 4), 3 + Math.floor(r() * 3), '#a89a88');
  const hx = dir > 0 ? x + 25 : x - 7;
  R(g, hx, y - 4, 10, 11, c); R(g, hx + 1, y - 4, 8, 1, lt); // la tête
  R(g, hx + (dir > 0 ? 5 : 0), y + 3, 5, 5, '#8a6a5a'); R(g, hx + (dir > 0 ? 8 : 1), y + 5, 1, 1, '#2a1a14'); // le mufle
  R(g, hx + (dir > 0 ? 3 : 6), y - 1, 1, 1, '#0a0604'); // l'œil
  for (const s of [0, 1]) { const ex = hx + (s ? 9 : -2); R(g, ex, y - 3, 3, 2, dk); } // les oreilles
  R(g, hx + 1, y - 7, 2, 3, '#d8ccb4'); R(g, hx + 7, y - 7, 2, 3, '#d8ccb4'); R(g, hx, y - 8, 2, 1, '#d8ccb4'); R(g, hx + 8, y - 8, 2, 1, '#d8ccb4'); // les cornes
}

function cattle(g, wg, r) {
  const { x, w } = wg, o = wagonOpenings(wg), d = o.doors[0];
  const col = ['#a8784a', '#9a6a3a', '#b08050'][Math.floor(r() * 3)];
  freightRoof(g, x, w);
  R(g, x - 1, 73, w + 2, BODY - 72, OUT);
  R(g, x, 74, w, BODY - 74, '#140d0a');
  R(g, x, BODY - 12, w, 8, '#5a4428'); for (let k = 0; k < w; k += 3) R(g, x + k, BODY - 13 - (k % 2), 2, 2, '#6a5030'); // la paille
  // le bétail, entassé derrière les lattes, tête vers les jours
  const hides = ['#6a3a22', '#8a5a34', '#3a2a24', '#b89a78', '#5a3a2a'];
  for (let cx = x + 4, k = 0; cx < x + w - 28; cx += 26 + Math.floor(r() * 8), k++) {
    cow(g, cx, 98 + Math.floor(r() * 8), k % 2 ? 1 : -1, hides[Math.floor(r() * hides.length)], r() < 0.4, r);
  }
  // les lattes à claire-voie (5 px de planche, 3 px de jour), sauf aux jours où le bandit se montre et à la porte
  const holes = [...o.wins, d];
  for (let y = 77; y < BODY - 6; y += 8) {
    const c = sh(col, (r() - 0.5) * 0.14);
    let run = -1;
    for (let px = x; px <= x + w; px++) {
      const open = px === x + w || holes.some((h) => px >= h.x && px < h.x + h.w && y + 4 >= h.y && y < h.y + h.h);
      if (!open && run < 0) run = px;
      if (open && run >= 0) { // une planche, d'un jour à l'autre
        R(g, run, y - 1, px - run, 7, OUT);
        R(g, run, y, px - run, 5, c); R(g, run, y, px - run, 1, sh(c, 0.22)); R(g, run, y + 4, px - run, 1, sh(c, -0.25));
        for (let i = 0; i < (px - run) / 9; i++) R(g, run + Math.floor(r() * (px - run - 4)), y + 1 + Math.floor(r() * 3), 3 + Math.floor(r() * 4), 1, sh(c, r() < 0.5 ? -0.14 : 0.1));
        run = -1;
      }
    }
  }
  for (const h of o.wins) { // les bouts de lattes cassées, en biseau
    for (let y = 77; y < BODY - 6; y += 8) if (y + 4 >= h.y && y < h.y + h.h) {
      R(g, h.x, y, 2, 3, sh(col, -0.1)); R(g, h.x, y + 3, 1, 1, OUT);
      R(g, h.x + h.w - 2, y + 2, 2, 3, sh(col, -0.1)); R(g, h.x + h.w - 1, y + 1, 1, 1, OUT);
    }
  }
  // la porte grande ouverte : la paille, le rail, le vantail à claire-voie glissé derrière le montant
  R(g, d.x, d.y, d.w, 3, '#0e0806');
  R(g, d.x - 22, d.y - 6, d.w + 44, 3, OUT); R(g, d.x - 21, d.y - 5, d.w + 42, 1, '#6a6a72');
  frame(g, x, w, sh(col, -0.45), d, false, [o.wins[0].x - 6, o.wins[0].x + o.wins[0].w + 1, o.wins[1].x - 6, o.wins[1].x + o.wins[1].w + 1]);
  R(g, d.x - 1, d.y + d.h, d.w + 2, 2, OUT); R(g, d.x, d.y + d.h - 1, d.w, 1, '#8a6a3a'); // le seuil
  // le marquage, sur une planche
  R(g, x + w - 52, 128, 36, 9, OUT); R(g, x + w - 51, 129, 34, 7, sh(col, -0.5));
  g.globalAlpha = 0.85; canvasText(g, 'U.P.', x + w - 34, 129, { color: '#e8dcc0', shadow: '' }); g.globalAlpha = 1;
}

// Voiture de voyageurs : toit à lanterneau, bandeau à lettres d'or, fenêtres, lambris, plates-formes aux deux bouts
function passenger(g, wg, liv, num) {
  const { x, w } = wg, o = wagonOpenings(wg);
  const body = liv.body, line = liv.line, dk = sh(body, -0.32), lt = sh(body, 0.16), roof = '#3a3234';
  // les plates-formes d'extrémité et leurs garde-corps (dans l'intervalle avec la voiture voisine)
  for (const [px, s] of [[x - 7, -1], [x + w + 1, 1]]) {
    R(g, px - 1, BODY - 3, 8, 4, OUT); R(g, px, BODY - 2, 6, 2, '#4a3a30');
    R(g, px + (s > 0 ? 5 : 0) - 1, 108, 3, BODY - 109, OUT); R(g, px + (s > 0 ? 5 : 0), 109, 1, BODY - 111, '#8a8f98');
    R(g, px - 1, 107, 8, 3, OUT); R(g, px, 108, 6, 1, '#8a8f98');
    for (let k = 0; k < 3; k++) { R(g, px - 1, BODY + 2 + k * 4, 8, 3, OUT); R(g, px, BODY + 3 + k * 4, 6, 1, '#6a6a72'); } // le marchepied
  }
  // le lanterneau et ses petits jours ambrés
  R(g, x + 15, 61, w - 30, 9, OUT); R(g, x + 16, 62, w - 32, 7, sh(body, -0.12)); R(g, x + 16, 62, w - 32, 1, sh(body, 0.1));
  for (let k = x + 24; k < x + w - 28; k += 11) { R(g, k, 64, 6, 4, OUT); R(g, k + 1, 65, 4, 2, '#c8a050'); }
  R(g, x + 12, 59, w - 24, 3, OUT); R(g, x + 13, 60, w - 26, 1, '#5a4e4c');
  // le toit bombé, ses rives
  R(g, x - 5, 68, w + 10, 9, OUT);
  R(g, x - 4, 69, w + 8, 2, '#5a4e4c'); R(g, x - 4, 71, w + 8, 3, roof); R(g, x - 4, 74, w + 8, 2, sh(roof, -0.3));
  for (let k = 0; k < 6; k++) { R(g, x - 4 + k, 69 - (k > 3 ? 1 : 0), 1, 1, OUT); R(g, x + w + 3 - k, 69 - (k > 3 ? 1 : 0), 1, 1, OUT); }
  // la caisse
  R(g, x - 1, 76, w + 2, BODY - 75, OUT);
  R(g, x, 77, w, BODY - 77, body);
  R(g, x, 77, w, 9, sh(body, -0.12)); R(g, x + 2, 86, w - 4, 1, line); // le bandeau
  R(g, x, 112, w, 3, dk); R(g, x, 112, w, 1, line); // la ceinture
  for (let px = x + 1; px < x + w - 1; px += 3) { R(g, px, 115, 1, 27, sh(body, -0.14)); R(g, px + 1, 115, 1, 27, sh(body, 0.05)); } // les lambris
  R(g, x + 26, 118, w - 52, 20, sh(body, -0.06)); R(g, x + 26, 118, w - 52, 1, line); R(g, x + 26, 137, w - 52, 1, line); R(g, x + 26, 118, 1, 20, line); R(g, x + w - 27, 118, 1, 20, line);
  canvasText(g, num, x + w / 2, 124, { color: line, shadow: sh(body, -0.55) });
  R(g, x, BODY - 4, w, 4, dk); R(g, x, BODY - 4, w, 1, line); // le bas de caisse
  R(g, x, 77, 2, BODY - 77, lt); R(g, x + w - 2, 77, 2, BODY - 77, dk);
  // les trumeaux entre les fenêtres
  for (let k = 0; k <= 4; k++) { const px = x + 24 + k * 32; R(g, px, 88, 1, 24, dk); R(g, px + 1, 88, 1, 24, lt); }
  // les fenêtres : cadre de bois verni, store à demi baissé, dossiers des banquettes
  for (const wn of o.wins) {
    R(g, wn.x - 3, wn.y - 3, wn.w + 6, wn.h + 6, OUT); R(g, wn.x - 2, wn.y - 2, wn.w + 4, wn.h + 4, '#a8783c'); R(g, wn.x - 2, wn.y - 2, wn.w + 4, 1, '#d0a060');
    R(g, wn.x, wn.y, wn.w, wn.h, '#1c1a20');
    R(g, wn.x, wn.y, wn.w, 7, '#c8a868'); R(g, wn.x, wn.y + 7, wn.w, 1, '#8a6a40'); R(g, wn.x + wn.w / 2 - 1, wn.y + 8, 2, 2, '#8a6a40');
    R(g, wn.x + 1, wn.y + 14, wn.w - 2, 8, '#2e3e32'); R(g, wn.x + 1, wn.y + 14, wn.w - 2, 1, '#4a5e4a');
    R(g, wn.x - 3, wn.y + wn.h + 2, wn.w + 6, 2, OUT); shadow(g, wn.x - 2, wn.y + wn.h + 4, wn.w + 4, 2, 0.3);
  }
  // les portes d'extrémité, ouvertes sur le couloir
  for (const d of o.doors) {
    R(g, d.x - 3, d.y - 3, d.w + 6, d.h + 4, OUT); R(g, d.x - 2, d.y - 2, d.w + 4, d.h + 2, '#a8783c'); R(g, d.x - 2, d.y - 2, d.w + 4, 1, '#d0a060');
    R(g, d.x, d.y, d.w, d.h, '#1a1416'); R(g, d.x, d.y + d.h - 5, d.w, 5, '#2e2018');
    R(g, d.x + 4, d.y + 8, d.w - 8, 14, '#2a2c34'); // le jour de la porte d'en face
    R(g, d.x, d.y, 3, d.h, sh(body, -0.5)); R(g, d.x + 3, d.y, 1, d.h, OUT); // le battant rabattu
    const gx = d.x < x + w / 2 ? d.x + d.w + 4 : d.x - 5;
    R(g, gx - 1, d.y + 8, 3, 34, OUT); R(g, gx, d.y + 9, 1, 32, '#c8ccd4'); // la main courante
  }
  canvasText(g, liv.name, x + w / 2, 77, { color: line, shadow: sh(body, -0.55) }); // en dernier : rien ne le mord
}

// Locomotive 4-4-0 (cabine à gauche, cheminée évasée, phare, chasse-buffles), sans roues ni bielles : x = STA.loco.x
const CAB = '#7a2a22', BOIL = '#3e4652';
const DRIVERS = [78, 114], PILOTS = [138, 156], DRIVE_Y = RAIL - 17, PILOT_Y = RAIL - 9;
function locoBody(g, x) {
  const lt = sh(CAB, 0.2), dk = sh(CAB, -0.35);
  // le châssis, derrière les roues
  R(g, x + 6, 128, 168, 12, OUT); R(g, x + 7, 129, 166, 10, '#26262c'); R(g, x + 7, 129, 166, 1, '#4a4a52');
  // la chaudière : tôle bleuie, bandes de laiton, main courante
  R(g, x + 56, 87, 84, 42, OUT);
  R(g, x + 57, 88, 82, 40, BOIL);
  R(g, x + 57, 89, 82, 2, '#8a96a4'); R(g, x + 57, 91, 82, 5, '#5e6a78'); R(g, x + 57, 96, 82, 4, '#4a5462');
  R(g, x + 57, 118, 82, 6, '#30363e'); R(g, x + 57, 124, 82, 4, '#262a32');
  for (const bx of [x + 72, x + 104, x + 134]) { R(g, bx, 88, 2, 40, BRASS); R(g, bx, 89, 1, 7, '#f0d070'); }
  R(g, x + 58, 99, 80, 1, '#c8ccd4'); for (const sx of [x + 64, x + 90, x + 120]) R(g, sx, 100, 1, 2, '#c8ccd4');
  // la cloche, le dôme de vapeur et la sablière, la soupape
  R(g, x + 66, 82, 14, 6, OUT); R(g, x + 67, 83, 12, 4, '#3a3a42');
  for (let k = 0; k < 9; k++) { const hw = 2 + Math.round(k * 0.5); R(g, x + 73 - hw - 1, 71 + k, hw * 2 + 2, 1, OUT); R(g, x + 73 - hw, 71 + k, hw * 2, 1, k < 2 ? '#f0d070' : BRASS); }
  R(g, x + 72, 68, 2, 3, OUT);
  const dome = (dx, dw, dh, col) => {
    for (let k = 0; k < dh; k++) {
      const ins = k < 2 ? 4 - k * 2 : 0;
      R(g, x + dx + ins - 1, 88 - dh + k, dw - ins * 2 + 2, 1, OUT);
    }
    for (let k = 1; k < dh; k++) {
      const ins = k < 3 ? 4 - (k - 1) * 2 : 0;
      R(g, x + dx + ins, 88 - dh + k, dw - ins * 2, 1, col); R(g, x + dx + ins, 88 - dh + k, 3, 1, sh(col, 0.35)); R(g, x + dx + dw - ins - 3, 88 - dh + k, 3, 1, sh(col, -0.3));
    }
  };
  dome(88, 18, 18, BRASS); dome(114, 14, 12, BOIL);
  R(g, x + 95, 65, 4, 6, OUT); R(g, x + 96, 66, 2, 4, '#f0d070'); // la soupape
  // la boîte à fumée, rivetée
  R(g, x + 137, 85, 34, 46, OUT); R(g, x + 138, 86, 32, 44, '#2a2a2e'); R(g, x + 138, 86, 32, 2, '#4a4a52'); R(g, x + 138, 86, 2, 44, '#3a3a40');
  for (let y = 90; y < 128; y += 5) R(g, x + 141, y, 1, 1, '#5a5a62');
  R(g, x + 166, 88, 4, 40, '#3a3a40'); R(g, x + 168, 88, 1, 40, '#5a5a62');
  // la cheminée évasée (diamant) : sa bouche en y 58, au milieu de x + 146 (vapeur : shooterdeco.js)
  R(g, x + 140, 70, 13, 17, OUT); R(g, x + 141, 70, 11, 16, '#26262a'); R(g, x + 141, 70, 3, 16, '#3a3a42');
  R(g, x + 139, 82, 15, 4, OUT); R(g, x + 140, 83, 13, 2, BRASS);
  for (let k = 0; k < 12; k++) {
    const hw = k < 4 ? 9 + k : k < 8 ? 12 : 12 - (k - 7) * 2, y = 69 - k;
    R(g, x + 146 - hw - 1, y - 1, hw * 2 + 3, 3, OUT);
  }
  for (let k = 0; k < 12; k++) {
    const hw = k < 4 ? 9 + k : k < 8 ? 12 : 12 - (k - 7) * 2, y = 69 - k;
    R(g, x + 146 - hw, y, hw * 2 + 1, 1, k > 9 ? '#4a4a52' : '#2e2e34'); R(g, x + 146 - hw, y, 3, 1, '#4a4a54'); R(g, x + 146 + hw - 2, y, 2, 1, '#1e1e22');
  }
  R(g, x + 138, 58, 17, 1, '#1a1416'); // la bouche
  // le phare : caisse noire, cerclage de laiton (le verre : shooterdeco.js)
  R(g, x + 165, 81, 24, 27, OUT); R(g, x + 166, 82, 22, 25, '#26262c'); R(g, x + 166, 82, 22, 1, '#5a5a62'); R(g, x + 166, 82, 2, 25, '#3a3a42');
  R(g, x + 170, 76, 10, 6, OUT); R(g, x + 171, 77, 8, 5, '#3a3a42'); R(g, x + 169, 75, 12, 2, OUT);
  S.disc(g, x + 177, 97, 8, OUT); S.disc(g, x + 177, 97, 7, BRASS); S.disc(g, x + 177, 97, 6, '#8a6a2a');
  R(g, x + 170, 108, 14, 4, OUT); R(g, x + 171, 108, 12, 3, IRON);
  // la plate-forme de tablier (rouge) le long de la chaudière
  R(g, x + 56, 127, 118, 5, OUT); R(g, x + 57, 128, 116, 3, CAB); R(g, x + 57, 128, 116, 1, lt);
  // les cylindres, la boîte à vapeur, les glissières de la crosse
  R(g, x + 134, 117, 34, 25, OUT); R(g, x + 135, 118, 32, 7, '#3a3a42'); R(g, x + 135, 118, 32, 1, '#6a6a72');
  R(g, x + 135, 125, 32, 16, '#2e2e34'); R(g, x + 135, 126, 32, 2, '#5a5a62');
  for (const bx of [x + 135, x + 164]) { R(g, bx, 125, 3, 16, BRASS); R(g, bx, 125, 1, 16, '#f0d070'); }
  R(g, x + 108, 129, 28, 3, OUT); R(g, x + 108, 130, 27, 1, STEEL); R(g, x + 108, 136, 28, 3, OUT); R(g, x + 108, 137, 27, 1, STEEL);
  R(g, x + 106, 128, 3, 12, OUT);
  // le cendrier sous la cabine, le longeron arrière
  R(g, x + 24, 135, 40, 12, OUT); R(g, x + 25, 136, 38, 10, '#2a2628'); R(g, x + 25, 136, 38, 1, '#4a4448');
  for (let px = x + 28; px < x + 62; px += 6) R(g, px, 138, 1, 6, '#1e1a1c');
  // la cabine : bois peint, filets d'or, fenêtre (le bandit s'y montre), numéro
  R(g, x - 3, 52, 66, 8, OUT); R(g, x - 2, 53, 64, 3, '#4a3e3c'); R(g, x - 2, 53, 64, 1, '#6a5e5a'); R(g, x - 2, 56, 64, 3, '#2e2628');
  R(g, x + 1, 59, 58, 78, OUT);
  R(g, x + 2, 60, 56, 76, CAB);
  for (let px = x + 4; px < x + 56; px += 4) R(g, px, 100, 1, 36, sh(CAB, -0.12));
  R(g, x + 2, 60, 2, 76, lt); R(g, x + 56, 60, 2, 76, dk);
  R(g, x + 5, 100, 50, 1, BRASS); R(g, x + 5, 132, 50, 1, BRASS); R(g, x + 5, 100, 1, 33, BRASS); R(g, x + 54, 100, 1, 33, BRASS);
  canvasText(g, 'N° 9', x + 30, 112, { color: '#f0d070', shadow: dk });
  R(g, x + 15, 67, 32, 32, OUT); R(g, x + 16, 68, 30, 30, BRASS); R(g, x + 16, 68, 30, 1, '#f0d070');
  R(g, x + 18, 70, 26, 26, '#1e1410');
  R(g, x + 18, 70, 26, 4, '#140c08'); R(g, x + 18, 90, 26, 6, '#3a1a10'); for (let k = 0; k < 26; k += 3) R(g, x + 18 + k, 93, 2, 2, '#c8642a'); // la lueur du foyer
  R(g, x + 48, 66, 6, 8, OUT); R(g, x + 49, 67, 4, 6, '#5a6a78'); // le jour de la façade avant
  R(g, x + 58, 47, 3, 6, OUT); R(g, x + 59, 48, 1, 4, '#f0d070'); R(g, x + 57, 46, 5, 2, OUT); // le sifflet
  // les marches de la cabine, la main courante
  R(g, x + 3, 136, 12, 3, OUT); for (let k = 0; k < 3; k++) { R(g, x + 3, 141 + k * 5, 12, 3, OUT); R(g, x + 4, 142 + k * 5, 10, 1, '#6a6a72'); }
  R(g, x + 60, 70, 1, 60, OUT);
  // le chasse-buffles : traverse rouge, barreaux en éventail, attelage
  R(g, x + 166, 135, 22, 8, OUT); R(g, x + 167, 136, 20, 6, CAB); R(g, x + 167, 136, 20, 1, lt);
  for (let k = 0; k < 7; k++) {
    const top = 143, bx = x + 168 + k * 3;
    for (let y = top; y < RAIL - 1; y++) {
      const px = bx + Math.round(((y - top) * (k + 1)) / 7) - 1;
      R(g, px - 1, y, 3, 1, OUT);
    }
  }
  for (let k = 0; k < 7; k++) {
    const top = 143, bx = x + 168 + k * 3;
    for (let y = top; y < RAIL - 2; y++) R(g, bx + Math.round(((y - top) * (k + 1)) / 7) - 1, y, 1, 1, k % 2 ? CAB : lt);
  }
  R(g, x + 166, RAIL - 3, 24, 2, OUT);
  R(g, x - 6, 130, 8, 5, OUT); R(g, x - 5, 131, 6, 3, IRON);
}
// Roues et bielles (ang : rotation des roues motrices ; les petites tournent deux fois plus vite)
function locoWheels(g, x, ang) {
  for (const px of PILOTS) drawWheel(g, 'pilot', x + px, PILOT_Y, ang * 2);
  for (const px of DRIVERS) drawWheel(g, 'drive', x + px, DRIVE_Y, ang);
  // les manetons, la bielle d'accouplement, la bielle motrice jusqu'à la crosse
  const pin = (px) => [x + px + Math.round(Math.cos(ang) * 9), DRIVE_Y + Math.round(Math.sin(ang) * 9)];
  const [ax, ay] = pin(DRIVERS[0]), [bx] = pin(DRIVERS[1]);
  R(g, ax - 2, ay - 2, bx - ax + 5, 5, OUT); R(g, ax - 1, ay - 1, bx - ax + 3, 3, STEEL); R(g, ax - 1, ay - 1, bx - ax + 3, 1, '#e0e4ea');
  const ex = ax + 46, hy = 133; // la crosse, sur ses glissières
  for (let i = 0; i <= ex - ax; i++) R(g, ax + i - 1, ay + Math.round(((hy - ay) * i) / (ex - ax)) - 2, 3, 4, OUT);
  for (let i = 0; i <= ex - ax; i++) R(g, ax + i, ay + Math.round(((hy - ay) * i) / (ex - ax)) - 1, 1, 2, i % 9 ? STEEL : '#d8dce2');
  R(g, ex - 1, hy - 4, 9, 8, OUT); R(g, ex, hy - 3, 7, 6, '#5a5a62'); R(g, ex, hy - 3, 7, 1, '#8a8f98'); // la crosse
  R(g, ex + 7, hy - 1, x + 135 - ex - 7, 2, '#c8ccd4'); // la tige du piston
  for (const [px, py] of [[ax, ay], [bx, ay]]) { R(g, px - 2, py - 2, 4, 4, OUT); R(g, px - 1, py - 1, 2, 2, '#e0b040'); }
}

function drawLoco(g, x, ang = 0) { locoBody(g, x); locoWheels(g, x, ang); }

function drawCar(g, wg, liv, r, num, wheels = true) {
  underframe(g, wg.x, wg.w);
  if (wg.type === 'boxcar') boxcar(g, wg, r);
  else if (wg.type === 'cattle') cattle(g, wg, r);
  else passenger(g, wg, liv, num);
  if (wheels) carWheels(g, wg.x, wg.w, 0);
}

// ------------------------------------------------------------ le quai
function drawPlatform(g, x0, x1, r) {
  const w = x1 - x0;
  const rows = [3, 3, 4, 4, 4, 5, 5, 6, 6, 6];
  let y = P;
  for (const [i, rh] of rows.entries()) {
    const c = ['#86603c', '#7c5634', '#825c38'][i % 3];
    R(g, x0, y, w, rh, c);
    R(g, x0, y + rh - 1, w, 1, sh(c, -0.35));
    if (rh > 3) R(g, x0, y, w, 1, sh(c, 0.1));
    for (let x = x0 + Math.floor(r() * 40); x < x1; x += 30 + Math.floor(r() * 60)) { // aboutements et clous
      R(g, x, y, 1, rh - 1, '#3a2414'); R(g, x + 2, y + 1, 1, 1, '#2e1c10'); R(g, x - 3, y + 1, 1, 1, '#2e1c10');
    }
    for (let k = 0; k < w / 18; k++) R(g, x0 + Math.floor(r() * w), y + 1 + Math.floor(r() * Math.max(1, rh - 2)), 3 + Math.floor(r() * 8), 1, sh(c, r() < 0.5 ? 0.14 : -0.16));
    if (r() < 0.8) { const sx = x0 + Math.floor(r() * w); R(g, sx, y + 1, 10 + Math.floor(r() * 20), 1, sh(c, -0.4)); } // une fente
    y += rh;
  }
  // la rive du quai, éclairée, son ombre sur le ballast
  R(g, x0, P - 1, w, 1, OUT); R(g, x0, P, w, 1, '#b08458');
  // l'usure au milieu, là où l'on marche
  g.fillStyle = 'rgba(240,210,160,0.07)'; g.fillRect(x0, P + 10, w, 14);
}
// Petit bazar du quai (derrière les abris du premier plan)
function platformClutter(g) {
  milkCan(g, 4, P + 8); milkCan(g, 14, P + 9); sack(g, 22, P + 10, '#c0a880');
  milkCan(g, 532, P + 7); milkCan(g, 542, P + 8);
  sack(g, 916, P + 8, '#b8a078'); sack(g, 927, P + 9);
  // une malle cloutée
  R(g, 1104, P - 5, 24, 14, OUT); R(g, 1105, P - 4, 22, 12, '#6a3a24'); R(g, 1105, P - 4, 22, 2, '#8a5a34'); R(g, 1105, P + 1, 22, 1, '#c8a050');
  for (const nx of [1108, 1115, 1122]) R(g, nx, P - 1, 1, 1, '#c8a050');
  shadow(g, 1128, P + 7, 4, 2, 0.3);
}

// ------------------------------------------------------------ les abris du premier plan (devant les bandits)
function drawCover(g, c) {
  const [w, h] = STA_COVER[c.kind];
  const x = c.x, top = PROP_BASE - h;
  shadow(g, x + 4, PROP_BASE - 1, w + 4, 3, 0.35);
  if (c.kind === 'crates') { // une grande caisse, une petite par-dessus
    plankCrate(g, x, PROP_BASE, 32, 20, '#a8783c');
    plankCrate(g, x + 5, PROP_BASE - 20, 20, 12, '#9a6a34');
  } else if (c.kind === 'barrels') {
    for (const bx of [x, x + 18]) cask(g, bx, top, 16, h);
  } else if (c.kind === 'cart') { // le chariot à bagages : plateau, roues cerclées, malles
    R(g, x - 1, top + 13, w + 2, 6, OUT); R(g, x, top + 14, w, 4, '#7a4a2a'); R(g, x, top + 14, w, 1, '#a8703c');
    R(g, x + w - 2, top - 6, 3, 21, OUT); R(g, x + w - 1, top - 5, 1, 19, '#5a3a22'); R(g, x + w - 5, top - 8, 9, 3, OUT); // le timon
    plankTrunk(g, x + 2, top + 13, 24, 13, '#5a3a24');
    plankTrunk(g, x + 27, top + 13, 18, 9, '#3a4a5a');
    plankTrunk(g, x + 6, top, 15, 8, '#7a2a1a');
    for (const wx of [x + 9, x + w - 11]) { S.disc(g, wx, PROP_BASE - 5, 5, OUT); S.disc(g, wx, PROP_BASE - 5, 4, IRON); S.disc(g, wx, PROP_BASE - 5, 2, '#6a6a72'); R(g, wx, PROP_BASE - 5, 1, 1, OUT); }
  } else if (c.kind === 'bags') { // les sacs postaux
    for (const [bx, bw, col] of [[0, 17, '#c8b088'], [13, 16, '#b8a078'], [25, 15, '#d0bc94']]) {
      const by = top + (bx === 13 ? 0 : 3);
      R(g, x + bx - 1, by + 2, bw + 2, PROP_BASE - by - 1, OUT); R(g, x + bx + bw / 2 - 3, by - 2, 7, 5, OUT);
      R(g, x + bx, by + 3, bw, PROP_BASE - by - 3, col); R(g, x + bx + bw / 2 - 2, by - 1, 5, 4, col);
      R(g, x + bx + 1, by + 4, 3, PROP_BASE - by - 6, sh(col, 0.2)); R(g, x + bx + bw - 3, by + 4, 2, PROP_BASE - by - 5, sh(col, -0.25));
      R(g, x + bx + bw / 2 - 2, by + 2, 5, 1, sh(col, -0.4)); // le lien
      if (bx === 13) { R(g, x + bx + 3, by + 7, bw - 6, 3, '#3a4a6a'); R(g, x + bx + 4, by + 8, bw - 8, 1, '#e0d0a0'); } // U.S. MAIL
    }
  }
}
function plankCrate(g, x, base, w, h, col, label = '') {
  const top = base - h, dk = sh(col, -0.28), lt = sh(col, 0.22);
  R(g, x - 1, top - 1, w + 2, h + 2, OUT); R(g, x, top, w, h, col);
  for (let y = top + 4; y < base - 3; y += 4) R(g, x + 3, y, w - 6, 1, sh(col, -0.12));
  R(g, x, top, w, 3, dk); R(g, x, base - 3, w, 3, dk); R(g, x, top, 3, h, dk); R(g, x + w - 3, top, 3, h, dk);
  R(g, x, top, w, 1, lt); R(g, x, top, 1, h, lt);
  for (let k = 0; k < w - 6; k++) R(g, x + 3 + k, base - 4 - Math.round((k * (h - 7)) / (w - 7)), 2, 1, dk); // l'écharpe
  for (const [nx, ny] of [[x + 1, top + 1], [x + w - 2, top + 1], [x + 1, base - 2], [x + w - 2, base - 2]]) R(g, nx, ny, 1, 1, '#3a3a40');
  if (label) { g.globalAlpha = 0.7; canvasText(g, label, x + w / 2, top + 6, { color: '#7a1a14', shadow: '' }); g.globalAlpha = 1; }
}
function cask(g, x, top, w, h) {
  const col = '#8a5228', base = top + h;
  R(g, x, top - 1, w, h + 2, OUT); R(g, x - 1, top + 2, w + 2, h - 4, OUT);
  R(g, x, top, w, h, col);
  for (let k = 2; k < w; k += 3) R(g, x + k, top + 1, 1, h - 1, sh(col, -0.18)); // les douelles
  R(g, x + 2, top + 1, 2, h - 2, sh(col, 0.25)); R(g, x + w - 3, top + 1, 2, h - 2, sh(col, -0.32));
  R(g, x + 1, top, w - 2, 2, '#5a3418'); R(g, x + 2, top, w - 4, 1, '#3e2410'); // le fond
  for (const yy of [top + 4, top + 13, base - 6]) { R(g, x - 1, yy, w + 2, 2, '#3a3a42'); R(g, x, yy, w, 1, '#7a7a82'); }
}
function plankTrunk(g, x, base, w, h, col) {
  const top = base - h;
  R(g, x - 1, top - 1, w + 2, h + 2, OUT); R(g, x, top, w, h, col); R(g, x, top, w, 1, sh(col, 0.3)); R(g, x, top + 2, w, 1, sh(col, -0.3));
  R(g, x, top + Math.round(h / 2), w, 1, '#c8a050'); R(g, x + 3, top, 2, h, sh(col, -0.25)); R(g, x + w - 5, top, 2, h, sh(col, -0.25));
  R(g, x + Math.round(w / 2) - 1, top + 3, 3, 3, '#c8a050');
}

// ------------------------------------------------------------ la gare de la partie
// Les lettres peintes (bandeaux, numéros, pochoirs) sont cuites dans le décor : si la police Silkscreen n'est pas encore
// chargée, le décor est repeint dans les mêmes canvas dès qu'elle l'est (sinon, lettres de la police de secours).
const FONT = '8px Silkscreen';
const fontReady = () => !document.fonts || document.fonts.check(FONT, 'N°');
function whenFont(redo) { if (!fontReady()) document.fonts.load(FONT, 'N°').then(redo, () => {}); }

export function renderStation(seed) {
  const bg = S.makeCanvas(STATION_W, H);
  const front = S.makeCanvas(STATION_W, H);
  paintStation(bg, front, seed);
  whenFont(() => {
    bg.getContext('2d').clearRect(0, 0, STATION_W, H);
    front.getContext('2d').clearRect(0, 0, STATION_W, H);
    paintStation(bg, front, seed);
  });
  return { bg, front };
}
function paintStation(bg, front, seed) {
  const g = bg.getContext('2d');
  const r = rnd(41 + (seed % 997));
  const K = LOOKS[seed % LOOKS.length];
  drawBack(g, r);
  // le train à quai
  const liv = LIVERIES[Math.floor(r() * LIVERIES.length)];
  stationTrain(seed).forEach((wg, k) => drawCar(g, wg, { ...liv, name: 'CIE DU PACIFIQUE' }, r, `N° ${3 + k * 4 + (seed % 3)}`));
  drawLoco(g, STA.loco.x, 0);
  drawDepot(g, K, 5 + (seed % 7));
  drawPlatform(g, 0, STATION_W, r);
  shadow(g, 18, P, 330, 4, 0.22); // sous l'avant-toit
  platformClutter(g);
  const f = front.getContext('2d');
  for (const c of STA.covers) drawCover(f, c);
}

// ------------------------------------------------------------ la cinématique d'ouverture : le train entre en gare
// Décor sans train (fond, puis station + quai + lanternes + abris), sprites des voitures et de la locomotive : une fois.
// Par image : la caméra, le train (roues et bielles), la fumée, la vapeur, le drapeau.
const IN = { cam: 400, stop: 1500, lx: 560, run: 380 }; // caméra finale ; arrêt ; x final de la locomotive ; distance freinée
const LAMPS = [364, 564, 764, 1000];
function introStage() {
  const r = rnd(97);
  const back = S.makeCanvas(STATION_W, H), mid = S.makeCanvas(STATION_W, H);
  drawBack(back.getContext('2d'), r);
  const m = mid.getContext('2d');
  drawDepot(m, LOOKS[0], 5);
  drawPlatform(m, 0, STATION_W, r);
  shadow(m, 18, P, 330, 4, 0.22);
  platformClutter(m);
  // les lanternes du quai sur leurs poteaux (en jeu : shooterdeco.js), l'horloge
  for (const lx of LAMPS) {
    const x = lx - 3, y = 96;
    R(m, x + 1, y + 5, 4, P - y - 5, OUT); R(m, x + 2, y + 6, 2, P - y - 6, IRON); R(m, x - 1, y + 4, 9, 2, IRON);
    R(m, x - 1, y - 1, 8, 11, OUT); R(m, x, y, 6, 9, IRON); R(m, x + 1, y + 2, 4, 5, '#f8d070'); R(m, x + 2, y + 3, 2, 2, '#fffbe0'); R(m, x + 1, y - 2, 4, 2, IRON);
    shadow(m, x + 5, P, 6, 2, 0.35);
  }
  const B = STA.building, ccx = B.x + 150, ccy = B.top + 14;
  S.disc(m, ccx, ccy, 10, OUT); S.disc(m, ccx, ccy, 9, '#c8a060'); S.disc(m, ccx, ccy, 7, '#f4ecd8');
  R(m, ccx, ccy - 5, 1, 5, '#5a3a20'); R(m, ccx, ccy, 4, 1, '#2a1a10');
  for (const c of STA.covers) if (c.x < 700) drawCover(m, c);
  // le train : deux voitures de voyageurs et la locomotive, sans leurs roues (elles tournent)
  const sprite = (w, draw) => { const c = S.makeCanvas(w + 32, H); const g = c.getContext('2d'); g.translate(16, 0); draw(g); return c; };
  const liv = { ...LIVERIES[0], name: 'CIE DU PACIFIQUE' };
  const cars = [0, 1].map((k) => sprite(176, (g) => drawCar(g, { x: 0, w: 176, type: 'passenger' }, liv, r, `N° ${4 + k * 3}`, false)));
  const loco = sprite(190, (g) => locoBody(g, 0));
  return { back, mid, cars, loco };
}
let intro = null;
const clamp01 = (k) => Math.max(0, Math.min(1, k));
const smooth = (k) => k * k * (3 - 2 * k);
// x de la locomotive au temps e (freinage régulier jusqu'à l'arrêt ; avant 0, à pleine vitesse)
const locoAt = (e) => (e >= IN.stop ? IN.lx : e >= 0 ? IN.lx - IN.run * (1 - e / IN.stop) ** 2 : IN.lx - IN.run + ((2 * IN.run) / IN.stop) * e);

// Plan d'ouverture de la cinématique (cutscene.js, extra.establish) : el ms depuis le début (0 à ~2000), amb : ambiance
// de la partie (ciel, teinte), town : nom de la ville sur la gare. Dessine toute l'image (ciel compris).
export function shooterIntro(ctx, el, amb, now, town = 'DUSTY GULCH') {
  if (!intro) { intro = introStage(); whenFont(() => { intro = null; }); }
  const I = intro;
  const e = Math.max(0, Math.min(el, 2200));
  const cx = Math.round(IN.cam * smooth(clamp01((e - 100) / 1800)));
  const w = skyAndFar(ctx, amb, now, -cx * 0.12 - 120);
  w.drawImage(I.back, -cx, 0);
  const lx = locoAt(e), ang = (lx - IN.lx) / 16;
  // la fumée de la cheminée : bouffées lâchées en marche (plus grosses au départ des coups de piston), panache à l'arrêt
  for (let k = -14; k < 24; k++) {
    const te = k * 110, j = (((k + 20) * 7919) % 17) / 17; // chaque bouffée a son allure
    const big = k === 0 || k === 5 || k === 6, life = (big ? 1700 : 1100) + j * 500;
    const age = e - te;
    if (age < 0 || age > life) continue;
    const moving = te < IN.stop, kk = age / life;
    const px = locoAt(te) + 146 - cx - age * (moving ? 0.026 : 0.01) + Math.sin(age / 240 + k * 1.7) * 3;
    const py = 56 - age * ((moving ? 0.018 : 0.028) + j * 0.014) - (big ? age * 0.008 : 0) + (j - 0.5) * 6;
    const rad = Math.round((big ? 4 : 2) + age * (0.004 + j * 0.003 + (big ? 0.002 : 0)));
    if (px < -40 || px > 424) continue;
    const a = 0.55 * (1 - kk) * (1 - kk);
    S.disc(w, px, py, rad, `rgba(208,202,194,${a.toFixed(2)})`);
    if (age < 600) S.disc(w, px - 1, py - 1, Math.max(1, rad - 2), `rgba(246,242,236,${(a * 0.7).toFixed(2)})`);
  }
  // les voitures et la locomotive
  for (let k = 0; k < 2; k++) {
    const x = Math.round(lx - 192 * (2 - k)) - cx;
    if (x > 400 || x < -200) continue;
    w.drawImage(I.cars[k], x - 16, 0);
    carWheels(w, x, 176, (lx - IN.lx) / 7);
  }
  const x = Math.round(lx) - cx;
  w.drawImage(I.loco, x - 16, 0);
  locoWheels(w, x, ang);
  S.disc(w, x + 177, 97, 5, OUT); S.disc(w, x + 177, 97, 4, '#f8e08a'); S.disc(w, x + 177, 97, 2, '#fffbe0'); // le phare
  // la vapeur : les purgeurs des cylindres qui crachent au freinage, la soupape qui siffle à l'arrêt
  if (e > 1100) {
    for (let k = 0; k < 14; k++) {
      const age = (e - 1100 + k * 71) % 900, s = k % 2 ? 1 : -1, kk = age / 900;
      if (e - 1100 < k * 30) continue;
      const a = (0.55 * (1 - kk) * Math.min(1, (2300 - e) / 500)).toFixed(2);
      if (a <= 0) continue;
      S.disc(w, x + 151 + s * (14 + age * 0.05), 146 - age * 0.012 + (k % 3), Math.round(2 + age * 0.012), `rgba(240,240,236,${a})`);
    }
  }
  if (e > IN.stop) {
    for (let k = 0; k < 6; k++) {
      const age = (e - IN.stop + k * 120) % 700, kk = age / 700;
      S.disc(w, x + 97 - age * 0.01, 62 - age * 0.05, Math.round(1 + age * 0.008), `rgba(248,248,244,${(0.6 * (1 - kk)).toFixed(2)})`);
    }
  }
  // la station, le quai, les lanternes et les abris, devant la voie
  w.drawImage(I.mid, -cx, 0);
  const B = STA.building;
  if (cx < 320) canvasText(w, `GARE DE ${town}`, B.x + 150 - cx, B.top + 33, { size: 8, color: '#3a2214', shadow: '#c8b07c' });
  // le drapeau sur le toit
  const fx = B.x + 20 - cx, fy = B.top - 20;
  if (fx > -20) {
    w.fillStyle = '#5a4a40'; w.fillRect(fx, fy - 18, 1, 20);
    for (let i = 0; i < 12; i++) {
      const dy = Math.round(Math.sin(now / 160 - i * 0.6 + 1) * 1.5 * (i / 12));
      w.fillStyle = i % 4 < 2 ? '#c0392b' : '#f4ecd8'; w.fillRect(fx + 1 + i, fy - 18 + dy, 1, 4);
      w.fillStyle = '#3a6ec0'; w.fillRect(fx + 1 + i, fy - 14 + dy, 1, 3);
    }
  }
  amb.end(ctx, now);
  // la nuit : les fenêtres des voitures, le phare, les lanternes du quai
  if (amb.env.lights) {
    for (let k = 0; k < 2; k++) {
      const wx = Math.round(lx - 192 * (2 - k)) - cx;
      if (wx > 400 || wx < -200) continue;
      for (const wn of wagonOpenings({ x: wx, w: 176, type: 'passenger' }).wins) if (wn.x + cx > B.x + B.w + 14) amb.window(ctx, wn.x, wn.y, wn.w, wn.h); // pas derrière la gare
    }
    amb.glow(ctx, x + 177, 97, 30, '255,230,150');
    for (const L of LAMPS) amb.glow(ctx, L - cx, 101, 22);
    for (const wn of B.windows) if (wn.x - cx > -40) amb.window(ctx, wn.x - cx, wn.y, wn.w, wn.h);
  }
}
