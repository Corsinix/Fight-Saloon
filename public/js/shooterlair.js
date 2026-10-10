// Fusillade : le repaire d'El Diablo au bout de la grand-rue (dernière section) : la salle du saloon, la mine
// abandonnée, et la poursuite à cheval (décor qui défile, en tuiles). Peints comme les décors du mode histoire
// (story/sets : saloon.js, mine.js, canyon.js, desert.js et leurs outils), lumière en haut à gauche. Tout est dessiné
// une fois ; la poursuite n'est faite que de tuiles et de sprites en cache (une tuile neuve au plus par image,
// préparée avant d'entrer à l'écran).
import * as S from './sprites.js';
import { canvasText } from './scene.js';
import { W, H, SALOON_W, SALOON_START, SAL, MINE, CHASE } from './worlds.js';
import { OUT, R, rnd, hash, shadow, battens, crate, barrel, poster, wallLamp, ghostText } from './story/sets/kit-ville.js';
import { sign } from './story/sets/kit.js';
import {
  P, Pix, hex, ramp, mixc, pick, vnoise, fbm, hsh, butte, wall,
  saguaro, ocotillo, cholla, pear, bush, tuft, boulder, skull, juniper, deadTree, cottonwood,
} from './story/sets/kit-nature.js';

const SW = SALOON_W, FLOOR = 196; // largeur du repaire ; pied des murs (le plancher, le sol de la mine)
const sh = S.shade;
const WOOD = '#5a3420', WOOD_D = '#3a2010', WOOD_L = '#8a5a34', BRASS = '#d8a840', BRASS_L = '#f8d880';
const PAPER = '#6a2a24';
const CACHE = {};
// les bouteilles-cibles des étagères (buildSpots : x 56..296 tous les 40) : le décor les laisse bien dégagées
const nearTarget = (x, m = 7) => x > 56 - m && x < 296 + m && Math.abs(((x - 56 + 20) % 40) - 20) < m;

// ================================================================ outils communs
// Papier peint damassé : rayures et motifs dorés passés (comme story/sets/saloon.js)
function wallpaper(g, x, y, w, h) {
  R(g, x, y, w, h, PAPER);
  for (let xx = x; xx < x + w; xx += 12) { R(g, xx, y, 1, h, sh(PAPER, -0.18)); R(g, xx + 6, y, 1, h, sh(PAPER, 0.08)); }
  for (let yy = y + 4, row = 0; yy < y + h - 3; yy += 10, row++) for (let xx = x + 3 + (row % 2) * 6; xx < x + w - 3; xx += 12) {
    R(g, xx, yy, 1, 3, '#8a4a30'); R(g, xx - 1, yy + 1, 3, 1, '#8a4a30'); R(g, xx, yy + 1, 1, 1, '#a8683a');
  }
}
// Lambris à panneaux sous la cimaise
function wainscot(g, x, y, w, h, pitch = 16) {
  R(g, x, y, w, h, WOOD);
  R(g, x, y, w, 3, WOOD_L); R(g, x, y + 3, w, 1, WOOD_D); R(g, x, y, w, 1, sh(WOOD_L, 0.2)); // la cimaise
  for (let px = x + 3; px < x + w - 10; px += pitch) {
    const pw = pitch - 4;
    R(g, px, y + 7, pw, h - 12, sh(WOOD, -0.12));
    R(g, px, y + 7, pw, 1, WOOD_D); R(g, px, y + 7, 1, h - 12, WOOD_D);
    R(g, px, y + h - 6, pw, 1, sh(WOOD, 0.2)); R(g, px + pw - 1, y + 7, 1, h - 12, sh(WOOD, 0.15));
  }
  R(g, x, y + h - 3, w, 3, WOOD_D); // la plinthe
}
// Petite bouteille décorative (plus petite que les bouteilles-cibles de 6 × 15)
function bottle(g, x, base, h, col, label) {
  R(g, x - 1, base - h - 1, 5, h + 1, OUT);
  R(g, x, base - h + 3, 3, h - 3, col); R(g, x + 1, base - h, 1, 3, col);
  R(g, x, base - h + 3, 1, h - 4, sh(col, 0.35));
  if (label) R(g, x, base - Math.round(h * 0.5), 3, 2, label);
}
const BOTTLE_COLS = ['#3a6a2a', '#7a3a1a', '#a8702a', '#2a4a3a', '#6a2a3a', '#c8b070', '#4a2a1a'];
const LABELS = ['#e8dcc0', '#c8a050', '#d84a2a'];
// Planche d'étagère (dessus en y)
function plank(g, x, y, w, col = WOOD_L) {
  R(g, x - 1, y, w + 2, 3, OUT); R(g, x, y, w, 2, col); R(g, x, y, w, 1, sh(col, 0.25));
}
// Cadre doré, son fil et son clou, son ombre portée (vers la droite et le bas)
function giltFrame(g, x, y, w, h) {
  const nx = x + Math.floor(w / 2);
  for (let k = 0; k <= w / 2; k++) { const yy = y - 4 - Math.round((k * 6) / (w / 2)); R(g, x + k, yy, 1, 1, '#2a1a12'); R(g, x + w - k, yy, 1, 1, '#2a1a12'); }
  R(g, nx - 1, y - 11, 3, 2, '#3a3436');
  shadow(g, x + w + 4, y - 1, 2, h + 6, 0.3); shadow(g, x - 1, y + h + 4, w + 7, 2, 0.3);
  R(g, x - 4, y - 4, w + 8, h + 8, OUT);
  R(g, x - 3, y - 3, w + 6, h + 6, '#a87a3a');
  R(g, x - 3, y - 3, w + 6, 1, BRASS_L); R(g, x - 3, y - 3, 1, h + 6, '#d8b060');
  R(g, x - 3, y + h + 2, w + 6, 1, '#6a4a1a'); R(g, x + w + 2, y - 3, 1, h + 6, '#6a4a1a');
  for (let k = 0; k < w + 6; k += 4) R(g, x - 3 + k, y - 2, 2, 1, '#c89a50'); // les perles du cadre
  R(g, x - 1, y - 1, w + 2, h + 2, OUT);
}
// Tableau : une mesa au couchant
function paintMesa(g, x, y, w, h, seed) {
  giltFrame(g, x, y, w, h);
  const sky = ['#d88850', '#e8a060', '#f0b878', '#f4c890'], hz = Math.round(h * 0.62);
  for (let k = 0; k < hz; k++) R(g, x, y + k, w, 1, sky[Math.min(3, Math.floor((k / hz) * 4))]);
  S.disc(g, x + Math.round(w * 0.68), y + hz - 4, 3, '#fff0c0');
  const r = rnd(seed);
  for (let i = 0; i < 2; i++) { // deux mesas violettes
    const mx = x + 2 + Math.floor(r() * (w * 0.5)), mw = 8 + Math.floor(r() * w * 0.3), mh = 4 + Math.floor(r() * (hz * 0.4));
    R(g, mx, y + hz - mh, Math.min(mw, x + w - mx), mh, i ? '#8a4a4a' : '#6a3a40');
    R(g, mx, y + hz - mh, Math.min(mw, x + w - mx), 1, '#c87a5a');
    R(g, mx - 2, y + hz - 2, Math.min(mw + 4, x + w - mx + 2), 2, i ? '#8a4a4a' : '#6a3a40');
  }
  R(g, x, y + hz, w, h - hz, '#a8603a'); R(g, x, y + hz, w, 1, '#c87a4a');
  for (let k = 0; k < w; k += 5) R(g, x + k + (k % 3), y + hz + 2 + (k % 4), 2, 1, '#7a4028');
  R(g, x + 4, y + hz - 6, 1, 6, '#2e5228'); R(g, x + 3, y + hz - 4, 1, 2, '#2e5228'); // un saguaro
}
// Tableau : portrait d'une chanteuse du saloon
function paintLady(g, x, y, w, h) {
  giltFrame(g, x, y, w, h);
  for (let k = 0; k < h; k++) R(g, x, y + k, w, 1, S.mix('#3a4a34', '#1e2a1e', k / h));
  const cx = x + Math.round(w / 2);
  S.disc(g, cx, y + 11, 6, '#3a1a10'); // les cheveux
  R(g, cx - 3, y + 8, 6, 8, '#e8b890'); R(g, cx - 3, y + 8, 2, 8, '#f4ccaa'); // le visage
  R(g, cx - 2, y + 11, 1, 1, '#2a1a10'); R(g, cx + 1, y + 11, 1, 1, '#2a1a10'); R(g, cx - 1, y + 14, 2, 1, '#b02a2a');
  R(g, cx - 1, y + 16, 3, 2, '#e8b890'); // le cou
  for (let k = 0; k < h - 18; k++) R(g, cx - 4 - Math.min(k, 6), y + 18 + k, 9 + Math.min(k, 6) * 2, 1, k < 2 ? '#e8b890' : '#9a2a1c'); // la robe
  R(g, cx - 3, y + 20, 7, 1, '#f4ecd8'); // le collier
  R(g, cx + 4, y + 3, 1, 6, '#f4ecd8'); R(g, cx + 5, y + 2, 1, 3, '#f4ecd8'); // la plume
}
// Trophée de longhorn (crâne et cornes)
function longhorn(g, tx, ty) {
  R(g, tx - 6, ty - 3, 13, 16, OUT); R(g, tx - 5, ty - 2, 11, 14, '#6a4224'); R(g, tx - 5, ty - 2, 11, 1, '#8a5a34'); // la plaque
  R(g, tx - 5, ty - 1, 11, 12, OUT); R(g, tx - 4, ty, 9, 10, '#e8dcc0'); R(g, tx - 4, ty, 2, 10, '#f4ecdc');
  R(g, tx - 2, ty + 3, 2, 2, OUT); R(g, tx + 1, ty + 3, 2, 2, OUT); R(g, tx - 1, ty + 7, 3, 2, '#b8a888');
  const hy = (k) => ty + 2 - Math.round(Math.sin((k / 24) * Math.PI) * 5) + (k > 18 ? -(k - 18) : 0);
  for (let k = 0; k < 24; k++) { R(g, tx + 5 + k, hy(k) - 1, 1, 3, OUT); R(g, tx - 6 - k, hy(k) - 1, 1, 3, OUT); }
  for (let k = 0; k < 24; k++) { R(g, tx + 5 + k, hy(k), 1, 1, k > 20 ? '#a89878' : '#e8dcc0'); R(g, tx - 6 - k, hy(k), 1, 1, k > 20 ? '#a89878' : '#f4ecdc'); }
}
// Crachoir de laiton
function spittoon(g, x, y) {
  // (x, y) : le coin haut gauche du col ; panse ronde, col évasé, ombre à droite
  R(g, x - 1, y - 1, 11, 3, OUT); R(g, x + 1, y + 2, 7, 1, OUT); R(g, x - 1, y + 3, 11, 5, OUT); R(g, x, y + 8, 9, 1, OUT);
  R(g, x, y, 9, 1, BRASS_L); R(g, x + 2, y, 5, 1, '#3a2a1a'); // le col et son ouverture
  R(g, x, y + 4, 9, 4, '#b8862e'); R(g, x + 1, y + 3, 7, 1, '#c89a40'); R(g, x + 1, y + 4, 2, 3, '#f0cc70'); R(g, x + 7, y + 4, 2, 4, '#7a5418');
  shadow(g, x + 9, y + 7, 4, 2, 0.3);
}

// ================================================================ le saloon
// Une porte de chambre de la galerie, ouverte : l'embrasure (34 × 56, exactement le cadre où surgit le bandit), la
// chambre dans la pénombre (fenêtre, lit ou commode), le battant rabattu côté gonds ; chambranle, fronton, numéro.
function roomDoor(g, x, n) {
  const w = 34, h = 56, y = SAL.balcony - h;
  // le chambranle mouluré et son fronton
  R(g, x - 6, y - 7, w + 12, h + 7, OUT);
  R(g, x - 5, y - 6, w + 10, h + 6, WOOD_L); R(g, x - 5, y - 6, w + 10, 1, sh(WOOD_L, 0.3)); R(g, x - 5, y - 6, 1, h + 6, sh(WOOD_L, 0.2));
  R(g, x + w + 4, y - 6, 1, h + 6, sh(WOOD_L, -0.35)); R(g, x - 3, y - 4, 1, h + 4, sh(WOOD_L, -0.2)); R(g, x + w + 2, y - 4, 1, h + 4, sh(WOOD_L, 0.15));
  R(g, x - 9, y - 13, w + 18, 7, OUT); R(g, x - 8, y - 12, w + 16, 4, WOOD); R(g, x - 8, y - 12, w + 16, 1, WOOD_L); R(g, x - 8, y - 9, w + 16, 1, WOOD_D);
  for (let k = 0; k < w + 14; k += 5) R(g, x - 7 + k, y - 8, 3, 1, WOOD_L); // les denticules
  shadow(g, x - 7, y - 5, w + 14, 1, 0.3);
  // la plaque de laiton, le numéro de la chambre (pas sous un lustre : il la cacherait)
  if (Math.min(Math.abs(x + w / 2 - 200), Math.abs(x + w / 2 - 520)) > 20) {
    R(g, x + w / 2 - 6, y - 23, 13, 10, OUT); R(g, x + w / 2 - 5, y - 22, 11, 8, '#2a1608'); R(g, x + w / 2 - 5, y - 22, 11, 1, BRASS);
    canvasText(g, String(n), x + w / 2 + 1, y - 21, { color: BRASS_L, shadow: '' });
  }
  // la chambre
  for (let k = 0; k < h; k++) R(g, x, y + k, w, 1, S.mix('#2e1a12', '#160c08', k / h));
  R(g, x, y + h - 8, w, 8, '#24160e'); R(g, x, y + h - 8, w, 1, '#3e2616');
  for (let k = 3; k < w; k += 7) R(g, x + k, y + h - 7, 1, 7, '#180e08');
  const kind = n % 3, hr = n % 2; // hr : gonds à droite
  const ix = hr ? x + 6 : x + 12;
  if (kind === 0) { // la fenêtre au fond, le clair de lune, les rideaux
    R(g, ix, y + 12, 14, 18, OUT); R(g, ix + 1, y + 13, 12, 16, '#3a4a60'); R(g, ix + 1, y + 13, 12, 5, '#4e5e78');
    R(g, ix + 7, y + 13, 1, 16, OUT); R(g, ix + 1, y + 20, 12, 1, OUT);
    R(g, ix - 2, y + 10, 4, 22, '#5a1a18'); R(g, ix + 12, y + 10, 4, 22, '#5a1a18'); R(g, ix - 2, y + 10, 1, 22, '#7a2a22');
    R(g, ix - 1, y + 39, 16, 3, '#3a2a40'); // la lune sur le plancher
  } else if (kind === 1) { // le pied du lit, la couverture rouge
    R(g, ix - 1, y + 30, 18, 18, OUT); R(g, ix, y + 31, 16, 6, '#e8dcc0'); R(g, ix, y + 37, 16, 10, '#7a2a22');
    for (let k = 1; k < 16; k += 4) R(g, ix + k, y + 38, 2, 9, '#5a1a18');
    R(g, ix - 2, y + 26, 2, 22, '#5a3420'); R(g, ix + 16, y + 26, 2, 22, '#5a3420'); R(g, ix - 2, y + 26, 20, 2, '#6a4024');
  } else { // la commode, la lampe allumée
    R(g, ix - 1, y + 33, 18, 15, OUT); R(g, ix, y + 34, 16, 13, '#4a2a16'); R(g, ix, y + 39, 16, 1, '#24120a'); R(g, ix, y + 43, 16, 1, '#24120a');
    R(g, ix + 7, y + 36, 2, 1, BRASS); R(g, ix + 7, y + 41, 2, 1, BRASS);
    R(g, ix + 5, y + 24, 6, 9, OUT); R(g, ix + 6, y + 25, 4, 7, '#e8a848'); R(g, ix + 7, y + 26, 2, 4, '#fff0b0');
    R(g, ix + 4, y + 22, 8, 2, '#8a6a3a');
    g.fillStyle = 'rgba(255,190,100,0.10)'; g.fillRect(ix - 4, y + 18, 24, 30); // la lueur sur le mur du fond
  }
  // le battant ouvert, rabattu contre l'embrasure
  const lx = hr ? x + w - 6 : x;
  R(g, lx, y, 6, h, OUT); R(g, lx + 1, y + 1, 4, h - 2, '#4a2a16');
  R(g, lx + (hr ? 1 : 4), y + 1, 1, h - 2, '#6a3e22');
  for (const py of [y + 6, y + 30]) R(g, lx + 2, py, 2, 18, '#3a1e0e');
  R(g, lx + 2, y + 27, 2, 2, BRASS);
  R(g, x, y + h - 1, w, 1, WOOD_L); // le seuil
}
// Poteau tourné de la galerie, jambes de force sous la poutre de rive
function column(g, x, top, bot) {
  for (const s of [-1, 1]) {
    for (let k = 0; k < 10; k++) R(g, x + 2 + s * (3 + k) - 1, top + 9 - k - 1, 4, 3, OUT);
    for (let k = 0; k < 10; k++) R(g, x + 2 + s * (3 + k), top + 9 - k, 2, 1, s < 0 ? WOOD_L : sh(WOOD_L, -0.15));
  }
  R(g, x - 1, top, 8, bot - top, OUT);
  R(g, x, top, 6, bot - top, WOOD_L); R(g, x, top, 1, bot - top, sh(WOOD_L, 0.25)); R(g, x + 5, top, 1, bot - top, sh(WOOD_L, -0.35));
  for (let y = top + 14; y < bot - 12; y += 20) { R(g, x - 1, y, 8, 3, OUT); R(g, x, y + 1, 6, 1, sh(WOOD_L, 0.15)); }
  R(g, x - 3, bot - 7, 12, 7, OUT); R(g, x - 2, bot - 6, 10, 6, WOOD); R(g, x - 2, bot - 6, 10, 1, WOOD_L); // le socle
  shadow(g, x + 7, top + 2, 3, bot - top - 2, 0.25);
}
// Escalier vers la galerie : marches, limon plein à panneaux, placard dessous, balustres, rampe, pilastre de départ
function stairs(g, x0, n, run) {
  const B = SAL.balcony;
  const sy = (i) => FLOOR - Math.round(((i + 1) * (FLOOR - B)) / n);
  const len = n * run, yl = (k) => FLOOR - Math.round(((k + run) * (FLOOR - B)) / len); // la ligne des nez de marche
  for (let i = 0; i < n; i++) R(g, x0 + i * run, sy(i), run, FLOOR - sy(i), sh(WOOD, -0.08));
  for (let x = x0 + 3; x < x0 + len; x += 6) { // le coffrage en planches sous l'escalier
    const y = Math.max(yl(x - x0) + 9, B + 9);
    R(g, x, y, 1, FLOOR - y, sh(WOOD, -0.3)); R(g, x + 1, y, 1, FLOOR - y, sh(WOOD, 0.06));
  }
  for (let k = 0; k < len; k++) { // le limon, parallèle à la pente
    const y = yl(k) + 3;
    R(g, x0 + k, y, 1, 6, '#6a4024'); R(g, x0 + k, y, 1, 1, WOOD_L); R(g, x0 + k, y + 6, 1, 1, OUT);
  }
  const cx = x0 + Math.round(n * run * 0.62); // le placard sous l'escalier
  R(g, cx - 1, FLOOR - 27, 18, 27, OUT); R(g, cx, FLOOR - 26, 16, 26, '#4a2814'); R(g, cx + 2, FLOOR - 24, 12, 9, '#3a1e0c'); R(g, cx + 2, FLOOR - 13, 12, 9, '#3a1e0c');
  R(g, cx + 12, FLOOR - 15, 2, 2, BRASS);
  for (let i = 0; i < n; i++) { // marches : nez éclairé, contremarche dans l'ombre
    const sx = x0 + i * run, rise = (i ? sy(i - 1) : FLOOR) - sy(i);
    R(g, sx - 1, sy(i) - 1, run + 2, 2, OUT); R(g, sx, sy(i), run + 1, 1, WOOD_L);
    R(g, sx - 1, sy(i) + 1, 1, Math.max(0, rise - 1), sh(WOOD, -0.35));
  }
  for (let i = 0; i < n; i++) { // balustres
    const bx = x0 + i * run + 2, by = sy(i);
    for (const dx of [0, Math.round(run / 2)]) { R(g, bx + dx, by - 15, 1, 15, WOOD_L); R(g, bx + dx + 1, by - 15, 1, 15, OUT); }
  }
  // la rampe
  for (let k = 0; k < len; k++) { const yy = FLOOR - 19 - Math.round((k * (FLOOR - B)) / len); R(g, x0 + k, yy - 1, 1, 4, OUT); }
  for (let k = 0; k < len; k++) { const yy = FLOOR - 19 - Math.round((k * (FLOOR - B)) / len); R(g, x0 + k, yy, 1, 2, WOOD_L); R(g, x0 + k, yy, 1, 1, sh(WOOD_L, 0.25)); }
  R(g, x0 - 5, FLOOR - 30, 8, 30, OUT); R(g, x0 - 4, FLOOR - 29, 6, 29, WOOD_L); R(g, x0 - 4, FLOOR - 29, 1, 29, sh(WOOD_L, 0.25)); R(g, x0 + 1, FLOOR - 29, 1, 29, sh(WOOD_L, -0.3));
  S.disc(g, x0 - 1, FLOOR - 32, 3, OUT); S.disc(g, x0 - 1, FLOOR - 32, 2, WOOD_L); R(g, x0 - 2, FLOOR - 33, 1, 1, sh(WOOD_L, 0.4));
}
// La porte de l'arrière-salle : rideau de velours, battants, plaque « PRIVÉ »
function backDoor(g, x, w, top) {
  R(g, x - 6, top - 7, w + 12, FLOOR - top + 7, OUT);
  R(g, x - 5, top - 6, w + 10, FLOOR - top + 6, WOOD_L); R(g, x - 5, top - 6, w + 10, 1, sh(WOOD_L, 0.3)); R(g, x + w + 4, top - 6, 1, FLOOR - top + 6, sh(WOOD_L, -0.35));
  R(g, x - 1, top - 1, w + 2, FLOOR - top + 1, OUT);
  for (let k = 0; k < FLOOR - top; k++) R(g, x, top + k, w, 1, S.mix('#24140e', '#100806', k / (FLOOR - top)));
  R(g, x + w - 12, top + 10, 5, 4, '#6a4a2a'); R(g, x + w - 11, top + 11, 3, 2, '#c8963a'); // une lampe au fond
  R(g, x + 3, top + 30, w - 10, 3, '#2a1a10'); R(g, x + 5, top + 33, 2, 14, '#2a1a10'); R(g, x + w - 10, top + 33, 2, 14, '#2a1a10'); // la table du fond
  for (let k = 0; k < 13; k++) { // le rideau tiré à gauche, noué par une embrasse
    for (let yy = 0; yy < FLOOR - top; yy++) {
      const ww = yy < 26 ? 12 : yy < 32 ? 6 : 6 + Math.round((yy - 32) / 9);
      if (k < ww) R(g, x + k, top + yy, 1, 1, k % 3 === 0 ? '#5a1414' : k % 3 === 1 ? '#8a2420' : '#a83228');
    }
  }
  R(g, x, top, w, 3, '#5a1414'); R(g, x, top, w, 1, '#a83228'); // la cantonnière
  R(g, x + 4, top + 28, 4, 3, BRASS);
  for (const [bx, s] of [[x + 2, 1], [x + Math.round(w / 2) + 1, -1]]) { // les battants
    const bw = Math.round(w / 2) - 3, by = top + 24;
    R(g, bx - 1, by, bw + 2, 26, OUT); R(g, bx, by + 1, bw, 24, '#a8703c'); R(g, bx, by + 1, bw, 1, '#d09a58');
    for (let k = 2; k < bw - 1; k += 3) R(g, bx + k, by + 5, 1, 16, '#7a4a24');
    R(g, bx + (s > 0 ? 0 : bw - 1), by + 1, 1, 24, '#5a3418');
  }
  const px = x + Math.round(w / 2);
  R(g, px - 15, top - 18, 31, 11, OUT); R(g, px - 14, top - 17, 29, 9, '#2a1608'); R(g, px - 14, top - 17, 29, 1, BRASS);
  canvasText(g, 'PRIVÉ', px + 1, top - 16, { color: BRASS_L, shadow: '' });
}
// Horloge régulateur
function regulator(g, x, y) {
  R(g, x - 1, y - 1, 18, 40, OUT); R(g, x, y, 16, 38, WOOD_D); R(g, x, y, 16, 1, WOOD_L); R(g, x, y, 1, 38, WOOD);
  R(g, x - 2, y - 4, 20, 4, OUT); R(g, x - 1, y - 3, 18, 2, WOOD); R(g, x + 6, y - 7, 4, 3, WOOD_L); // le fronton
  S.disc(g, x + 8, y + 9, 6, OUT); S.disc(g, x + 8, y + 9, 5, '#c8a060'); S.disc(g, x + 8, y + 9, 4, '#f4ecd8');
  R(g, x + 8, y + 6, 1, 4, OUT); R(g, x + 8, y + 9, 3, 1, OUT);
  R(g, x + 3, y + 17, 10, 18, '#1a0e08'); R(g, x + 3, y + 17, 10, 1, '#5a3a24');
  R(g, x + 8, y + 18, 1, 11, '#a88a4a'); S.disc(g, x + 8, y + 30, 3, BRASS); R(g, x + 7, y + 29, 1, 1, BRASS_L);
  R(g, x + 11, y + 18, 1, 16, 'rgba(255,255,255,0.15)');
  R(g, x - 2, y + 38, 20, 3, OUT); R(g, x - 1, y + 38, 18, 2, WOOD);
}
// Chapeau pendu à une patère, et un lasso
function hatPeg(g, x, y) {
  R(g, x, y, 3, 3, OUT); R(g, x, y, 2, 2, WOOD_L);
  R(g, x - 9, y + 4, 21, 4, OUT); R(g, x - 8, y + 5, 19, 2, '#6a4a30'); R(g, x - 8, y + 5, 19, 1, '#8a6a48');
  R(g, x - 5, y - 4, 13, 9, OUT); R(g, x - 4, y - 3, 11, 8, '#7a5838'); R(g, x - 4, y - 3, 11, 1, '#9a7850'); R(g, x - 4, y + 2, 11, 2, '#3a2214');
  R(g, x - 1, y - 3, 1, 3, '#5a3a24');
  for (let a = 0; a < 40; a++) { const t = (a / 40) * Math.PI * 2; R(g, Math.round(x + 1 + Math.cos(t) * 6), Math.round(y + 24 + Math.sin(t) * 9), 1, 1, a % 7 ? '#c8a868' : '#8a7040'); }
  R(g, x, y + 8, 1, 7, '#c8a868');
}

export function renderSaloonRoom() {
  const bg = S.makeCanvas(SW, H), front = S.makeCanvas(SW, H);
  const g = bg.getContext('2d'), f = front.getContext('2d');
  const B = SAL.balcony, bar = SAL.bar;
  const LOW = B + 9; // sous la galerie
  // ---- le plafond à caissons, la corniche, les rosaces des lustres (les lustres : shooterdeco.js)
  R(g, 0, 0, SW, 13, '#24140c');
  for (let x = 20; x < SW; x += 64) { R(g, x, 0, 12, 9, '#3a2216'); R(g, x, 0, 1, 9, '#5a3a24'); R(g, x + 11, 0, 1, 9, '#160a06'); }
  for (let x = 52; x < SW; x += 64) for (let k = 2; k < 8; k += 3) R(g, x - 10, k, 20, 1, '#2e1a10');
  R(g, 0, 9, SW, 1, OUT); R(g, 0, 10, SW, 3, WOOD); R(g, 0, 10, SW, 1, WOOD_L);
  for (let x = 1; x < SW; x += 5) R(g, x, 13, 3, 2, WOOD_D);
  R(g, 0, 15, SW, 1, OUT);
  for (const cx of [200, 520]) { S.disc(g, cx, 9, 4, OUT); S.disc(g, cx, 9, 3, BRASS); R(g, cx - 2, 7, 2, 1, BRASS_L); }
  // ---- l'étage : papier peint, cimaise, lambris (derrière la balustrade)
  wallpaper(g, 0, 16, SW, 54);
  shadow(g, 0, 16, SW, 3, 0.3); // l'ombre de la corniche
  wainscot(g, 0, 70, SW, B - 70, 14);
  // tableaux, trophée, appliques entre les portes (les emplacements des bandits penchés restent dégagés)
  paintMesa(g, 151, 46, 32, 22, 3);
  paintLady(g, 296, 42, 22, 28);
  longhorn(g, 398, 48);
  paintMesa(g, 491, 42, 56, 28, 8);
  paintMesa(g, 738, 46, 24, 20, 5);
  for (const [lx, ly] of [[22, 48], [86, 48], [674, 48]]) wallLamp(g, lx, ly);
  SAL.upperDoors.forEach((x, k) => roomDoor(g, x, k + 1));
  // ---- le rez-de-chaussée, sous la galerie : papier peint et lambris
  wallpaper(g, 0, LOW, SW, 150 - LOW);
  wainscot(g, 0, 150, SW, FLOOR - 150, 18);
  // l'arrière-bar : corniche, cadre doré du miroir (le verre : shooterdeco.js), pilastres, étagères, tiroirs
  const bx0 = 34, bx1 = 326;
  R(g, bx0 - 1, LOW, bx1 - bx0 + 2, 146 - LOW, OUT);
  R(g, bx0, LOW, bx1 - bx0, 146 - LOW, '#24120a');
  for (let x = bx0 + 3; x < bx1; x += 7) R(g, x, LOW, 1, 146 - LOW, '#1a0c06');
  R(g, bx0 - 2, LOW, bx1 - bx0 + 4, 3, WOOD); R(g, bx0 - 2, LOW, bx1 - bx0 + 4, 1, WOOD_L); R(g, bx0 - 2, LOW + 3, bx1 - bx0 + 4, 1, OUT);
  R(g, 107, LOW - 1, 150, 23, OUT);
  R(g, 108, LOW, 148, 21, '#a87a3a'); R(g, 108, LOW, 148, 1, BRASS_L); R(g, 108, LOW, 1, 21, '#d8b060');
  R(g, 108, LOW + 20, 148, 1, '#6a4a1a'); R(g, 255, LOW, 1, 21, '#6a4a1a');
  R(g, 110, LOW + 2, 145, 17, '#3a3a48');
  for (let yy = 0; yy < 17; yy++) R(g, 110, LOW + 2 + yy, 145, 1, S.mix('#5a5a6a', '#2e2a36', yy / 17));
  R(g, 176, LOW - 1, 14, 3, OUT); R(g, 177, LOW - 1, 12, 2, BRASS); // la coquille au sommet du cadre
  const r = rnd(11);
  const shelfItems = (x0, x1, y, maxH, glasses) => {
    for (let x = x0 + 1; x < x1 - 3; x += 5) {
      if (nearTarget(x + 1) || r() < 0.25) continue;
      if (glasses || r() < 0.2) { R(g, x - 1, y - 5, 5, 5, OUT); R(g, x, y - 4, 3, 4, '#8a9a9c'); R(g, x, y - 4, 1, 4, '#d8e4e4'); }
      else bottle(g, x, y, Math.min(maxH, 7 + Math.floor(r() * 6)), BOTTLE_COLS[Math.floor(r() * BOTTLE_COLS.length)], r() < 0.7 ? LABELS[Math.floor(r() * 3)] : null);
    }
  };
  for (const [x0, x1] of [[42, 101], [263, 319]]) {
    shelfItems(x0, x1, 112, 6, true); plank(g, x0, 112, x1 - x0);
    shelfItems(x0, x1, 136, 12, false);
  }
  shelfItems(110, 254, 136, 8, false);
  plank(g, 42, 136, 277);
  for (let x = 44; x < 318; x += 23) { // les tiroirs
    if (x + 20 > 318) break;
    R(g, x, 140, 20, 6, WOOD); R(g, x, 140, 20, 1, WOOD_L); R(g, x, 140, 1, 6, WOOD_D); R(g, x + 9, 142, 2, 1, BRASS);
  }
  for (const px of [35, 102, 257, 320]) {
    R(g, px - 1, LOW + 3, 8, 146 - LOW - 3, OUT); R(g, px, LOW + 3, 6, 146 - LOW - 3, WOOD); R(g, px, LOW + 3, 1, 146 - LOW - 3, WOOD_L); R(g, px + 5, LOW + 3, 1, 146 - LOW - 3, WOOD_D);
    for (let yy = LOW + 8; yy < 144; yy += 9) R(g, px, yy, 6, 2, WOOD_L);
  }
  // à gauche du bar : chapeau et lasso à la patère, applique
  hatPeg(g, 16, 116);
  // la salle à droite : poteaux de la galerie, affiches, piano (devant), porte de l'arrière-salle, escalier, horloge
  wallLamp(g, 352, 114);
  poster(g, 364, 118, 13, 17, '#e0cc98', false);
  for (const [px, n] of [[440, 0], [456, 1]]) R(g, px, 112 + n * 3, 1, 1, '#2a1a12');
  paintLady(g, 436, 108, 20, 24);
  poster(g, 497, 110, 18, 24);
  poster(g, 500, 140, 12, 15, '#d8c088', false);
  backDoor(g, 530, 38, 134);
  stairs(g, 604, 12, 8);
  regulator(g, 734, 110);
  wallLamp(g, 716, 116);
  column(g, 337, LOW, FLOOR);
  // la poutre de rive de la galerie (son plancher) : nez, frise, denticules
  R(g, 0, B, SW, 9, OUT);
  R(g, 0, B, SW, 4, WOOD); R(g, 0, B, SW, 1, WOOD_L); R(g, 0, B + 3, SW, 1, WOOD_D);
  R(g, 0, B + 4, SW, 4, sh(WOOD, -0.15));
  for (let x = 2; x < SW; x += 6) { R(g, x, B + 5, 3, 3, WOOD_L); R(g, x + 2, B + 5, 1, 3, WOOD_D); }
  // l'ombre sous la galerie
  shadow(g, 0, LOW, SW, 3, 0.42); shadow(g, 0, LOW + 3, SW, 5, 0.26); shadow(g, 0, LOW + 8, SW, 8, 0.12);
  // ---- le plancher : planches, joints, sciure, crachoirs
  const rows = [196, 199, 203, 208, 214, 217];
  for (let i = 0; i < rows.length - 1; i++) {
    const y0 = rows[i], hh = rows[i + 1] - y0;
    R(g, 0, y0, SW, hh, i % 2 ? '#6e4628' : '#64401f');
    R(g, 0, y0, SW, 1, '#3a2214'); R(g, 0, y0 + 1, SW, 1, i % 2 ? '#7e5434' : '#74502e');
    for (let x = Math.floor(r() * 40); x < SW; x += 40 + Math.floor(r() * 50) + i * 6) R(g, x, y0, 1, hh, '#3a2214');
    for (let k = 0; k < SW / 24; k++) R(g, Math.floor(r() * SW), y0 + 2 + Math.floor(r() * Math.max(1, hh - 3)), 3 + Math.floor(r() * 6), 1, '#5a381c');
  }
  shadow(g, 0, FLOOR, SW, 2, 0.45);
  for (let i = 0; i < 260; i++) R(g, Math.floor(r() * SW), 198 + Math.floor(r() * 18), 1, 1, r() < 0.5 ? '#9a7a50' : '#8a6a48');
  for (const x of [76, 186, 404]) spittoon(g, x, 199);

  // ================= devant (après les bandits) : balustrade de la galerie, comptoir, piano, tables renversées
  // la balustrade : main courante, balustres tournés, lisse basse, poteaux
  R(f, 0, B - 17, SW, 5, OUT); R(f, 0, B - 16, SW, 3, WOOD_L); R(f, 0, B - 16, SW, 1, '#b07a44'); R(f, 0, B - 14, SW, 1, sh(WOOD_L, -0.25));
  for (let px = 2; px < SW; px += 6) {
    R(f, px - 1, B - 12, 4, 10, OUT); R(f, px - 2, B - 9, 6, 3, OUT);
    R(f, px, B - 12, 2, 10, WOOD_L); R(f, px - 1, B - 8, 4, 1, WOOD_L); R(f, px, B - 12, 1, 10, sh(WOOD_L, 0.25));
  }
  R(f, 0, B - 3, SW, 3, OUT); R(f, 0, B - 2, SW, 1, WOOD);
  for (const px of [0, 337, 604 + 12 * 8 - 3, SW - 6]) {
    R(f, px - 1, B - 22, 8, 22, OUT); R(f, px, B - 21, 6, 21, WOOD_L); R(f, px, B - 21, 1, 21, sh(WOOD_L, 0.25)); R(f, px + 5, B - 21, 1, 21, sh(WOOD_L, -0.3));
    R(f, px - 2, B - 24, 10, 3, OUT); R(f, px - 1, B - 24, 8, 2, WOOD); R(f, px - 1, B - 24, 8, 1, '#b07a44');
  }
  // le comptoir : plateau verni, panneaux moulurés, repose-pied de laiton, plinthe
  const top = bar.top, cx0 = bar.x - 4, cx1 = bar.x + bar.w + 4;
  R(f, bar.x - 1, top + 4, bar.w + 2, FLOOR - top - 4, OUT);
  R(f, bar.x, top + 5, bar.w, FLOOR - top - 5, '#4a2814');
  R(f, bar.x, top + 5, bar.w, 3, '#5a3018'); R(f, bar.x, top + 8, bar.w, 1, '#2a1608');
  const np = 6, pw = Math.floor((bar.w - 8) / np);
  for (let k = 0; k < np; k++) {
    const px = bar.x + 6 + k * pw, ww = pw - 8, py = top + 12, ph = 24;
    R(f, px, py, ww, ph, '#3a1e0c'); R(f, px, py, ww, 1, '#24120a'); R(f, px, py, 1, ph, '#24120a');
    R(f, px + 1, py + ph - 1, ww - 1, 1, '#6a3e1e'); R(f, px + ww - 1, py + 1, 1, ph - 1, '#6a3e1e');
    R(f, px + 4, py + 4, ww - 8, ph - 8, '#4a2814'); R(f, px + 4, py + 4, ww - 8, 1, '#6a3e1e'); R(f, px + 4, py + ph - 5, ww - 8, 1, '#2a1608');
    R(f, px - 5, top + 9, 3, FLOOR - top - 16, '#6a3e1e'); R(f, px - 5, top + 9, 1, FLOOR - top - 16, '#8a5430'); // le pilastre
  }
  R(f, bar.x + bar.w - 4, top + 9, 3, FLOOR - top - 16, '#6a3e1e');
  R(f, cx0 - 1, top - 1, cx1 - cx0 + 2, 7, OUT);
  R(f, cx0, top, cx1 - cx0, 5, '#9a6234'); R(f, cx0, top, cx1 - cx0, 1, '#d09a5a'); R(f, cx0, top + 4, cx1 - cx0, 1, '#5a3014'); // le plateau
  for (let x = cx0 + 20; x < cx1; x += 37) R(f, x, top + 1, 9, 1, '#b07a44'); // les reflets du vernis
  R(f, bar.x, FLOOR - 13, bar.w, 3, OUT); R(f, bar.x, FLOOR - 12, bar.w, 1, BRASS_L); R(f, bar.x, FLOOR - 11, bar.w, 1, BRASS); // le repose-pied
  for (let px = bar.x + 14; px < bar.x + bar.w; px += 48) { R(f, px, FLOOR - 13, 2, 7, '#a87a2a'); R(f, px, FLOOR - 13, 1, 7, BRASS_L); }
  R(f, bar.x, FLOOR - 5, bar.w, 5, '#2a1608'); R(f, bar.x, FLOOR - 5, bar.w, 1, '#5a3418');
  // sur le plateau (entre les places des bandits) : bouteille et verres, chope, caisse enregistreuse, lampe à pétrole
  bottle(f, 101, top, 14, '#3a6a2a', '#e8dcc0');
  for (const gx of [107, 112]) { R(f, gx - 1, top - 6, 5, 6, OUT); R(f, gx, top - 5, 3, 5, '#c8d0d0'); R(f, gx, top - 3, 3, 3, '#c8902a'); R(f, gx, top - 5, 1, 5, '#ffffff'); }
  R(f, 170, top - 9, 9, 9, OUT); R(f, 171, top - 8, 6, 8, '#e8c070'); R(f, 171, top - 8, 6, 2, '#fffbe8'); R(f, 177, top - 6, 2, 4, OUT);
  R(f, 237, top - 14, 18, 14, OUT); R(f, 238, top - 13, 16, 13, BRASS); R(f, 238, top - 13, 16, 1, BRASS_L); R(f, 238, top - 13, 1, 13, '#f0c860');
  R(f, 240, top - 11, 12, 4, '#2a2016'); R(f, 241, top - 10, 4, 2, '#f0e0b0'); R(f, 247, top - 10, 3, 2, '#f0e0b0');
  for (let k = 0; k < 4; k++) R(f, 240 + k * 3, top - 5, 2, 2, '#f4ecd8');
  R(f, 313, top - 3, 9, 3, OUT); R(f, 314, top - 3, 7, 2, BRASS); // le pied de la lampe
  R(f, 314, top - 9, 7, 6, OUT); R(f, 315, top - 8, 5, 5, '#c8a860');
  R(f, 315, top - 19, 5, 10, OUT); R(f, 316, top - 18, 3, 9, '#f8e8b0'); R(f, 317, top - 15, 1, 4, '#fffbe0');
  // le piano droit (le pianola de shooterdeco.js enfonce ses touches noires) et son tabouret
  const p = SAL.piano, ptop = p.top;
  R(f, p.x - 1, ptop + 1, p.w + 2, FLOOR - ptop - 1, OUT);
  R(f, p.x, ptop + 2, p.w, FLOOR - ptop - 2, '#2e1a12'); R(f, p.x, ptop + 2, 1, FLOOR - ptop - 2, '#4a2e20'); R(f, p.x + p.w - 1, ptop + 2, 1, FLOOR - ptop - 2, '#1a0e08');
  R(f, p.x - 3, ptop - 1, p.w + 6, 5, OUT); R(f, p.x - 2, ptop, p.w + 4, 3, '#4a2e20'); R(f, p.x - 2, ptop, p.w + 4, 1, '#7a5034');
  R(f, p.x + 4, ptop + 5, p.w - 8, 13, '#1e100a'); R(f, p.x + 6, ptop + 7, p.w - 12, 9, '#6a2420');
  for (let k = p.x + 8; k < p.x + p.w - 8; k += 8) { R(f, k, ptop + 7, 3, 9, '#2e1a12'); R(f, k + 1, ptop + 10, 1, 3, '#4a2e20'); } // la façade ajourée
  R(f, p.x + p.w / 2 - 9, ptop + 6, 18, 12, OUT); R(f, p.x + p.w / 2 - 8, ptop + 7, 16, 10, '#eadcb0'); // la partition
  for (let k = 0; k < 3; k++) R(f, p.x + p.w / 2 - 6, ptop + 9 + k * 3, 12, 1, '#5a4a3a');
  for (const bx of [p.x + 2, p.x + p.w - 5]) { // les bougeoirs
    R(f, bx, ptop + 11, 3, 2, BRASS); R(f, bx, ptop + 4, 3, 7, OUT); R(f, bx + 1, ptop + 5, 1, 6, '#f0e8d8'); R(f, bx + 1, ptop + 2, 1, 2, '#f8d070');
  }
  R(f, p.x + 1, ptop + 21, p.w - 2, 7, OUT); R(f, p.x + 4, ptop + 22, p.w - 8, 5, '#f0e8d8'); // le clavier
  for (let k = 4; k < p.w - 4; k += 3) R(f, p.x + k, ptop + 22, 1, 5, '#c8c0b0');
  for (let k = 6; k < p.w - 8; k += 5) R(f, p.x + k, ptop + 22, 2, 3, '#1a1010');
  R(f, p.x + 1, ptop + 20, 3, 9, '#3a2418'); R(f, p.x + p.w - 4, ptop + 20, 3, 9, '#3a2418');
  R(f, p.x + 1, ptop + 28, p.w - 2, 2, '#4a2e20');
  for (const px of [p.x + 7, p.x + p.w / 2 + 3]) { R(f, px, ptop + 33, p.w / 2 - 10, 17, '#24140c'); R(f, px, ptop + 33, p.w / 2 - 10, 1, '#1a0e08'); R(f, px + 1, ptop + 49, p.w / 2 - 11, 1, '#4a2e20'); }
  for (const px of [p.x + 2, p.x + p.w - 6]) R(f, px, ptop + 30, 4, FLOOR - ptop - 33, '#3a2418');
  R(f, p.x + p.w / 2 - 6, FLOOR - 5, 3, 2, BRASS); R(f, p.x + p.w / 2 + 3, FLOOR - 5, 3, 2, BRASS);
  R(f, p.x + p.w / 2 - 9, 177, 18, 5, OUT); R(f, p.x + p.w / 2 - 8, 178, 16, 3, '#6a2420'); R(f, p.x + p.w / 2 - 8, 178, 16, 1, '#9a3a2a'); // le tabouret
  R(f, p.x + p.w / 2 - 2, 182, 4, 12, OUT); R(f, p.x + p.w / 2 - 1, 182, 2, 12, '#3a2010');
  R(f, p.x + p.w / 2 - 7, 193, 14, 3, OUT); R(f, p.x + p.w / 2 - 6, 194, 12, 1, '#5a3420');
  // les tables renversées : plateau vu de dessous (planches, traverses, pied central), cartes et jetons au sol
  SAL.tables.forEach((tb, n) => {
    const cx = tb.x + Math.round(tb.w / 2), cy = tb.top + 18, rr = 18;
    shadow(f, cx - 12, 205, 34, 3, 0.35);
    S.disc(f, cx, cy, rr, OUT); S.disc(f, cx, cy, rr - 1, '#5e3820');
    for (let dy = -rr + 2; dy <= rr - 2; dy++) { // les planches (joints verticaux), le chant
      const hw = Math.floor(Math.sqrt((rr - 1.5) ** 2 - dy * dy));
      for (let x = cx - 13; x <= cx + 13; x += 7) if (Math.abs(x - cx) < hw) R(f, x, cy + dy, 1, 1, '#3e2414');
      if (dy < 0) R(f, cx - hw, cy + dy, 2, 1, '#9a6a3a'); else R(f, cx + hw - 1, cy + dy, 1, 1, '#3e2414');
    }
    for (let k = -14; k < 0; k++) R(f, cx + k, cy - Math.floor(Math.sqrt((rr - 1.5) ** 2 - k * k)), 1, 1, '#a8784a'); // le chant au soleil
    for (const by of [cy - 9, cy + 6]) { R(f, cx - 14, by - 1, 29, 5, OUT); R(f, cx - 13, by, 27, 3, '#4a2a16'); R(f, cx - 13, by, 27, 1, '#6a4024'); } // les traverses
    for (const [dx, dy] of [[-8, -7], [8, -7], [-8, 7], [8, 7]]) R(f, cx + dx - 1, cy + dy - 1, 3, 3, '#2a1608'); // les vis
    // le pied tourné, couché vers nous : colonne courte et sa croix de pieds
    R(f, cx - 3, cy - 12, 7, 25, OUT); R(f, cx - 2, cy - 11, 5, 23, '#5a3420'); R(f, cx - 2, cy - 11, 1, 23, '#8a5a34');
    for (const yy of [cy - 7, cy + 4]) R(f, cx - 3, yy, 7, 2, '#7a4a28');
    R(f, cx - 4, cy - 14, 9, 3, OUT); R(f, cx - 4, cy + 12, 9, 3, OUT);
    const rc = rnd(tb.x);
    for (let k = 0; k < 5; k++) { // les cartes et les jetons éparpillés
      const x = Math.round(cx - 26 + rc() * 52), y = 206 + Math.floor(rc() * 6);
      if (k < 3) { R(f, x - 1, y - 1, 6, 4, OUT); R(f, x, y, 4, 2, '#f0e8d8'); R(f, x + 1, y, 1, 1, k % 2 ? '#a8302a' : OUT); }
      else { R(f, x - 1, y - 1, 5, 3, OUT); R(f, x, y, 3, 1, ['#a8302a', '#2a4a8a', '#e8e0cc'][(k + n) % 3]); }
    }
  });
  return { bg, front };
}

// ================================================================ la mine
const ROCK = ramp('120e0c 1e1814 2c231c 3a2e24 4a3b2e 5a4838 6c5844 806a52 967d62 ac9274');
const TIM = '#7a4a26', TIM_L = '#a87244', TIM_D = '#4a2c16';
// Étai rond (poteau) : bois écorcé, nœuds, lumière à gauche
function post(g, x, y0, y1, w = 6, seed = 1) {
  const r = rnd(seed * 7 + x);
  R(g, x - 1, y0, w + 2, y1 - y0, OUT);
  R(g, x, y0, w, y1 - y0, TIM); R(g, x, y0, 1, y1 - y0, TIM_L); R(g, x + 1, y0, 1, y1 - y0, sh(TIM, 0.12)); R(g, x + w - 1, y0, 1, y1 - y0, TIM_D);
  for (let y = y0 + 3; y < y1 - 2; y += 4 + Math.floor(r() * 7)) R(g, x + 1 + Math.floor(r() * (w - 3)), y, 2, 1, TIM_D);
  for (let y = y0 + 6; y < y1 - 4; y += 9 + Math.floor(r() * 14)) R(g, x + 2, y, 1, 3, sh(TIM, -0.3)); // fentes
}
// Poutre (chapeau, longrine) : dessus éclairé, dessous dans l'ombre
function beam(g, x0, x1, y, h, seed = 1) {
  const r = rnd(seed * 5 + y);
  R(g, x0, y - 1, x1 - x0, h + 2, OUT);
  R(g, x0, y, x1 - x0, h, TIM); R(g, x0, y, x1 - x0, 1, TIM_L); R(g, x0, y + h - 1, x1 - x0, 1, TIM_D);
  for (let x = x0 + Math.floor(r() * 20); x < x1 - 6; x += 10 + Math.floor(r() * 24)) R(g, x, y + 1 + Math.floor(r() * (h - 2)), 4 + Math.floor(r() * 8), 1, sh(TIM, -0.22));
}
// Une galerie de l'étage : le noir, des cadres qui s'enfoncent, les rails ; boisage autour (l'ouverture est le cadre
// exact où surgit le bandit, 34 × 56)
function adit(g, x, seed) {
  const w = 34, h = 56, B = MINE.balcony, y = B - h;
  post(g, x - 6, y - 2, B, 6, seed); post(g, x + w, y - 2, B, 6, seed + 1);
  beam(g, x - 10, x + w + 10, y - 8, 6, seed);
  for (let k = 0; k < w + 16; k += 6) R(g, x - 8 + k, y - 12, 5, 3, k % 12 ? '#5a3a1e' : '#6a4224'); // le garnissage au-dessus
  for (let k = 0; k < h; k++) R(g, x, y + k, w, 1, S.mix('#1e140c', '#0a0604', Math.min(1, k / h + 0.2)));
  for (const [ins, col] of [[4, '#2a1c12'], [9, '#1e140c'], [13, '#140c08']]) {
    const x0 = x + ins, x1 = x + w - ins, y0 = y + Math.round(ins * 1.2), y1 = B - Math.round(ins * 0.6);
    R(g, x0, y0, x1 - x0, 2, col); R(g, x0, y0, 2, y1 - y0, col); R(g, x1 - 2, y0, 2, y1 - y0, col);
  }
  R(g, x + 15, y + 22, 4, 6, '#080402'); // le fond
  for (let k = 0; k < 14; k++) { // les rails qui s'enfoncent
    const t = k / 14, yy = B - 1 - k;
    R(g, Math.round(x + 7 + t * 8), yy, 1, 1, '#5a5e66'); R(g, Math.round(x + w - 8 - t * 8), yy, 1, 1, '#5a5e66');
    if (k % 3 === 0) R(g, Math.round(x + 8 + t * 8), yy, Math.round(w - 16 - t * 16), 1, '#24160c');
  }
}
// Peint la roche de la mine (tampon Pix) : facettes éclairées en haut à gauche, diaclases, filons d'or, quartz
function paintRock(g, B) {
  const Pp = new Pix(g);
  const Wd = SW + 2, Ht = FLOOR + 2;
  const hf = new Float32Array(Wd * Ht);
  for (let y = 0; y < Ht; y++) for (let x = 0; x < Wd; x++) hf[y * Wd + x] = fbm(x / 17, y / 11, 61, 3) + 0.35 * fbm(x / 5, y / 4, 62, 2);
  const hv = (x, y) => hf[Math.min(Ht - 1, Math.max(0, y)) * Wd + Math.min(Wd - 1, Math.max(0, x))];
  for (let y = 0; y < FLOOR; y++) {
    // l'ombre : sous la voûte, sous la passerelle, au pied de la paroi
    const ao = (y < 18 ? -1.6 + y * 0.06 : 0) + (y > B + 8 && y < B + 34 ? -1.4 * (1 - (y - B - 8) / 26) : 0) + (y > 170 ? -(y - 170) / 18 : 0);
    for (let x = 0; x < SW; x++) {
      const slope = hv(x - 1, y - 1) - hv(x + 1, y + 1);
      let l = 4 + slope * 26 + (vnoise(x / 40, y / 30, 63) - 0.5) * 2 + ao;
      if (Math.abs(vnoise(x / 11, y / 9, 64) - 0.5) < 0.018) l -= 2.4; // les joints de la roche
      Pp.set(x, y, pick(ROCK, l, x, y));
    }
  }
  const r = rnd(67);
  for (let i = 0; i < 46; i++) { // diaclases : fissure sombre, arête claire à gauche
    let x = r() * SW, y = r() * (FLOOR - 20);
    for (let k = 0; k < 8 + r() * 18; k++) {
      Pp.shade(x, y, hex('#0c0806'), 0.55); Pp.shade(x - 1, y, hex('#c8b49a'), 0.2);
      y++; x += r() < 0.3 ? 1 : r() < 0.3 ? -1 : 0;
    }
  }
  for (let i = 0; i < 9; i++) { // les filons d'or et de quartz
    let x = r() * SW, y = 20 + r() * 160;
    const gold = i % 3 !== 2, len = 30 + r() * 60, dy = (r() - 0.5) * 0.9;
    for (let k = 0; k < len; k++) {
      const c = gold ? pick(P.or, 3 + vnoise(k / 3, i, 68) * 2.6, Math.round(x), Math.round(y)) : hex(k % 3 ? '#b8b0a4' : '#d8d4cc');
      Pp.set(x, y, c); if (k % 2) Pp.set(x, y + 1, gold ? P.or[2] : hex('#8a8478'));
      if (gold && hsh(k, i, 69) < 0.12) Pp.set(x, y - 1, P.or[6]);
      x += 1; y += dy + (vnoise(k / 6, i, 70) - 0.5) * 1.6;
    }
  }
  for (let i = 0; i < 140; i++) { const x = r() * SW, y = r() * 186; Pp.set(x, y, P.or[4 + Math.floor(r() * 3)]); } // les paillettes
  // le sol : gravier, terre battue
  for (let y = FLOOR; y < H; y++) for (let x = 0; x < SW; x++) {
    const l = 3.4 + (fbm(x / 7, y / 2, 71, 3) - 0.5) * 2.4 + (y - FLOOR) * 0.05 + (y < FLOOR + 2 ? -1 : 0);
    Pp.set(x, y, pick(P.terre, l, x, y));
  }
  for (let i = 0; i < 520; i++) { // cailloux et éclats de minerai
    const x = Math.floor(r() * SW), y = FLOOR + 2 + Math.floor(r() * 18), gold = r() < 0.08;
    Pp.set(x, y, gold ? P.or[5] : P.terre[7 + Math.floor(r() * 2)]); Pp.set(x + 1, y, gold ? P.or[3] : P.terre[2]);
  }
  Pp.put();
}

export function renderMineRoom() {
  const bg = S.makeCanvas(SW, H), front = S.makeCanvas(SW, H);
  const g = bg.getContext('2d'), f = front.getContext('2d');
  const B = MINE.balcony, bar = MINE.bar;
  paintRock(g, B);
  // ---- la voûte : planches de garnissage, le grand chapeau d'où pendent les lanternes (shooterdeco.js)
  const r = rnd(53);
  for (let x = 0; x < SW; x += 7) {
    if (r() < 0.12) continue; // une planche tombée : la roche
    const c = r() < 0.5 ? '#4a3018' : '#3e2814', hh = 13 + Math.floor(r() * 3);
    R(g, x, 0, 6, hh, c); R(g, x, 0, 1, hh, sh(c, 0.25)); R(g, x + 5, 0, 1, hh, OUT); R(g, x, hh, 6, 1, OUT);
  }
  beam(g, 0, SW, 16, 8, 3);
  // ---- l'étage : galeries boisées, étais de la passerelle, pancartes, caisses de dynamite, outils
  MINE.upperDoors.forEach((x, k) => adit(g, x, k + 2));
  for (const x of MINE.rails) {
    post(g, x - 3, 24, B, 6, x);
    R(g, x - 6, 24, 12, 3, OUT); R(g, x - 5, 24, 10, 2, TIM_D); // la semelle sous le chapeau
  }
  for (const x of [6, 762]) post(g, x - 3, 24, B, 6, x);
  sign(g, 409, 40, 'DANGER', { bg: '#eadcb0', fg: '#7a1a14' }); R(g, 397, 36, 1, 4, '#3a3436'); R(g, 421, 36, 1, 4, '#3a3436');
  sign(g, 172, 46, 'N°7', { bg: '#c8a878', fg: '#3a2214' });
  crate(g, 166, B - 1, 14, '#a8783c', 'TNT'); crate(g, 506, B - 1, 15, '#a8783c', 'TNT'); crate(g, 522, B - 1, 12, '#8a6a3a');
  for (let k = 0; k < 20; k++) R(g, 239 + Math.round(k * 0.3), B - 22 + k, 2, 1, '#8a5a30'); // la pioche et la pelle
  R(g, 234, B - 23, 11, 2, '#8a8f98'); R(g, 233, B - 22, 2, 1, '#5a5e66');
  for (let k = 0; k < 22; k++) R(g, 248 - Math.round(k * 0.2), B - 24 + k, 1, 1, '#7a5228');
  R(g, 241, B - 4, 6, 3, '#8a8f98');
  barrel(g, 664, B - 1, '#6a4a2e', 18); R(g, 666, B - 21, 9, 2, '#3a5a6a'); // le tonneau d'eau
  for (let a = 0; a < 30; a++) { const t = (a / 30) * Math.PI * 2; R(g, Math.round(316 + Math.cos(t) * 5), Math.round(52 + Math.sin(t) * 7), 1, 1, a % 5 ? '#b8a070' : '#7a6a48'); } // la corde
  R(g, 315, 44, 2, 2, '#3a3436');
  // ---- la passerelle : rail du wagonnet d'El Diablo, traverses, plancher, longrine ; l'ombre dessous
  R(g, 0, B - 3, SW, 1, '#c0c4cc'); R(g, 0, B - 2, SW, 1, '#5a5f68');
  for (let x = 3; x < SW; x += 9) R(g, x, B - 1, 6, 1, '#3e2a18');
  R(g, 0, B, SW, 1, OUT);
  for (let x = 0; x < SW; x += 5 + (x % 3)) { const c = (x * 7) % 3 ? '#6a4a2e' : '#5e4028'; R(g, x, B + 1, 5, 5, c); R(g, x, B + 1, 5, 1, '#8a6440'); R(g, x + 4, B + 1, 1, 5, '#3e2a18'); }
  beam(g, 0, SW, B + 7, 4, 9);
  shadow(g, 0, B + 12, SW, 4, 0.4); shadow(g, 0, B + 16, SW, 6, 0.2);
  // ---- en bas : palées sous la passerelle, croix de Saint-André
  const LP = [18, 116, 236, 338, 460, 626, 758];
  for (const [a, b] of [[338, 460], [626, 758]]) {
    for (let k = 0; k <= 60; k++) {
      const t = k / 60, yy = B + 14 + t * (FLOOR - B - 20);
      for (const xx of [a + 6 + t * (b - a - 8), b - 2 - t * (b - a - 8)]) R(g, Math.round(xx) - 1, Math.round(yy) - 1, 4, 4, OUT);
    }
    for (let k = 0; k <= 60; k++) {
      const t = k / 60, yy = B + 14 + t * (FLOOR - B - 20);
      for (const xx of [a + 6 + t * (b - a - 8), b - 2 - t * (b - a - 8)]) { R(g, Math.round(xx), Math.round(yy), 2, 2, '#5a3a1e'); R(g, Math.round(xx), Math.round(yy), 1, 1, '#7a5230'); }
    }
  }
  for (const x of LP) {
    post(g, x - 3, B + 11, FLOOR, 6, x + 5);
    for (const s of [-1, 1]) for (let k = 0; k < 8; k++) { R(g, x + s * (4 + k) - 1, B + 18 - k, 3, 3, OUT); R(g, x + s * (4 + k), B + 18 - k, 1, 1, TIM); } // jambes de force
  }
  // la planche aux bouteilles des mineurs : planches sur consoles de fer, gamelles, bougies, quart de fer-blanc
  for (const y of MINE.shelves) {
    for (const bx of [44, 116, 236, 314]) { R(g, bx - 1, y + 2, 4, 9, OUT); R(g, bx, y + 3, 2, 7, '#4a4e56'); for (let k = 0; k < 6; k++) R(g, bx + (bx < 180 ? 2 + k : -k - 1), y + 3 + k, 1, 1, '#4a4e56'); }
    R(g, 39, y - 1, 283, 5, OUT); R(g, 40, y, 281, 3, '#8a6440'); R(g, 40, y, 281, 1, '#a88058'); R(g, 40, y + 2, 281, 1, '#5e4028');
  }
  const minerItem = (x, y, k) => {
    if (k === 0) { R(g, x - 1, y - 6, 6, 6, OUT); R(g, x, y - 5, 4, 5, '#8a8f98'); R(g, x, y - 5, 1, 5, '#c8ccd4'); R(g, x + 4, y - 4, 2, 2, OUT); } // le quart
    else if (k === 1) { R(g, x - 1, y - 7, 4, 7, OUT); R(g, x, y - 6, 2, 6, '#e8dcc0'); R(g, x, y - 9, 1, 2, '#f8d070'); R(g, x - 1, y - 1, 4, 1, '#c8b890'); } // la bougie
    else if (k === 2) { R(g, x - 1, y - 7, 10, 7, OUT); R(g, x, y - 6, 8, 6, '#6a6e76'); R(g, x, y - 6, 8, 1, '#9aa0a8'); R(g, x + 2, y - 9, 4, 2, OUT); } // la gamelle
    else { for (let a = 0; a < 16; a++) { const t = (a / 16) * Math.PI * 2; R(g, Math.round(x + 3 + Math.cos(t) * 3), Math.round(y - 3 + Math.sin(t) * 2), 1, 1, '#c8a050'); } } // la mèche roulée
  };
  let mk = 0;
  for (const y of MINE.shelves) for (let x = 62; x < 314; x += 17) if (!nearTarget(x + 3, 9) && r() < 0.6) minerItem(x, y, mk++ % 4);
  // la galerie du bas (la voie s'y enfonce), son boisage, sa pancarte
  const tx = 504, tw = 64, tt = 130;
  post(g, tx - 8, tt - 4, FLOOR, 8, 41); post(g, tx + tw, tt - 4, FLOOR, 8, 42);
  beam(g, tx - 12, tx + tw + 12, tt - 12, 9, 43);
  for (let k = 0; k < tw + 20; k += 7) R(g, tx - 10 + k, tt - 18, 6, 5, k % 14 ? '#5a3a1e' : '#6a4224');
  for (let k = 0; k < FLOOR - tt; k++) R(g, tx, tt + k, tw, 1, S.mix('#1e140c', '#0a0604', Math.min(1, k / (FLOOR - tt) + 0.25)));
  for (const [ins, col] of [[7, '#2e1e12'], [15, '#20140c'], [22, '#160e08'], [27, '#100a06']]) {
    const x0 = tx + ins, x1 = tx + tw - ins, y0 = tt + Math.round(ins * 1.1), y1 = FLOOR - Math.round(ins * 0.55);
    R(g, x0, y0, x1 - x0, 3, col); R(g, x0, y0, 3, y1 - y0, col); R(g, x1 - 3, y0, 3, y1 - y0, col);
  }
  R(g, tx + tw / 2 - 1, tt + 40, 3, 3, '#5a4020'); R(g, tx + tw / 2, tt + 41, 1, 1, '#e0b040'); // une lanterne, tout au fond
  for (let k = 0; k < 18; k++) { // la voie qui s'enfonce
    const t = k / 18, yy = FLOOR - 1 - k;
    R(g, Math.round(tx + 10 + t * 18), yy, 1, 1, '#6a707a'); R(g, Math.round(tx + tw - 11 - t * 18), yy, 1, 1, '#6a707a');
    if (k % 3 === 0) R(g, Math.round(tx + 11 + t * 18), yy, Math.round(tw - 22 - t * 36), 1, '#2a1a10');
  }
  sign(g, tx + tw / 2, B + 14, 'FILON', { bg: '#c8a878', fg: '#3a2214' });
  // l'échelle vers la passerelle, le tonneau, la pile de dynamite, la masse
  for (const lx of [584, 594]) { R(g, lx - 1, B + 9, 4, FLOOR - B - 9, OUT); R(g, lx, B + 9, 2, FLOOR - B - 9, '#8a5a30'); R(g, lx, B + 9, 1, FLOOR - B - 9, TIM_L); }
  for (let y = B + 14; y < FLOOR - 2; y += 8) { R(g, 586, y - 1, 8, 3, OUT); R(g, 586, y, 8, 1, '#8a5a30'); }
  barrel(g, 603, FLOOR, '#7a4a28', 20);
  crate(g, 636, FLOOR, 18, '#a8783c', 'TNT'); crate(g, 655, FLOOR, 16, '#8a6a3a'); crate(g, 643, FLOOR - 18, 16, '#a8783c', 'TNT');
  R(g, 352, 148, 2, 30, '#7a5228'); R(g, 348, 146, 10, 4, '#5a5e66'); R(g, 348, 146, 10, 1, '#8a8f98'); // la masse contre le poteau
  // ---- le sol : la voie des wagonnets (traverses, rails)
  for (let x = 0; x < SW; x += 10) { R(g, x, 202, 7, 5, OUT); R(g, x, 202, 6, 4, '#4a3220'); R(g, x, 202, 6, 1, '#6a4a30'); }
  R(g, 0, 201, SW, 1, '#b8bcc4'); R(g, 0, 202, SW, 1, '#4a4e56');
  R(g, 0, 207, SW, 1, '#c8ccd4'); R(g, 0, 208, SW, 1, '#4a4e56');
  shadow(g, 0, FLOOR, SW, 2, 0.4);

  // ================= devant : garde-corps de la passerelle, trémie, wagonnet renversé, tas de minerai
  R(f, 0, B - 17, SW, 5, OUT); R(f, 0, B - 16, SW, 3, '#7a5232'); R(f, 0, B - 16, SW, 1, '#a07448'); R(f, 0, B - 14, SW, 1, '#4e3420');
  for (let x = 9; x < SW; x += 17 + (x % 7)) R(f, x, B - 15, 3, 1, '#4e3420'); // les nœuds
  for (const x of [...MINE.rails, 6, 762]) { R(f, x - 3, B - 18, 6, 18, OUT); R(f, x - 2, B - 17, 4, 17, '#6a4224'); R(f, x - 2, B - 17, 1, 17, '#8a5a30'); R(f, x - 2, B - 18, 4, 1, '#a87244'); }
  // la trémie à minerai : planches, poteaux d'angle, ferrures rivetées, goulotte, le minerai qui déborde
  const top = bar.top;
  R(f, bar.x - 1, top - 1, bar.w + 2, FLOOR - top + 1, OUT);
  battens(f, bar.x, top + 3, bar.w, FLOOR - top - 3, '#5e4028', 7, 12);
  R(f, bar.x - 3, top - 1, bar.w + 6, 5, OUT); R(f, bar.x - 2, top, bar.w + 4, 3, '#8a6440'); R(f, bar.x - 2, top, bar.w + 4, 1, '#a88058');
  for (const y of [top + 12, FLOOR - 14]) {
    R(f, bar.x, y - 1, bar.w, 4, OUT); R(f, bar.x, y, bar.w, 2, '#4a4f58'); R(f, bar.x, y, bar.w, 1, '#7a808a');
    for (let x = bar.x + 5; x < bar.x + bar.w - 2; x += 12) R(f, x, y, 1, 1, '#b8bcc4');
  }
  for (const px of [bar.x - 1, bar.x + bar.w - 6]) { R(f, px - 1, top - 4, 9, FLOOR - top + 4, OUT); R(f, px, top - 3, 7, FLOOR - top + 3, TIM); R(f, px, top - 3, 1, FLOOR - top + 3, TIM_L); R(f, px + 6, top - 3, 1, FLOOR - top + 3, TIM_D); }
  ghostText(f, 'MINERAI', bar.x + bar.w / 2, top + 17, '#d8c8a8', 0.45);
  const gx = bar.x + Math.round(bar.w / 2) - 16; // la goulotte et sa vanne
  R(f, gx - 1, FLOOR - 13, 34, 13, OUT); R(f, gx, FLOOR - 12, 32, 12, '#120a06');
  R(f, gx, FLOOR - 12, 32, 2, '#4a4f58'); R(f, gx + 36, FLOOR - 20, 2, 10, '#4a4f58'); R(f, gx + 34, FLOOR - 22, 6, 3, '#7a808a'); R(f, gx + 32, FLOOR - 12, 6, 2, '#4a4f58');
  for (let k = 0; k < 7; k++) R(f, gx + 3 + k * 4, FLOOR - 4 - (k % 2), 3, 2, k % 3 ? '#6a6058' : '#c89428');
  const Q = new Pix(f);
  for (let x = bar.x + 1; x < bar.x + bar.w - 1; x++) { // le minerai qui déborde
    const hh = 3 + Math.round(2.5 * Math.sin(x / 7) + vnoise(x / 3, 1, 81) * 3);
    for (let y = top - hh; y < top; y++) {
      const l = 4.6 + (vnoise(x / 2, y / 2, 82) - 0.5) * 4 + (y === top - hh ? 1.5 : 0) - (x / bar.w) * 0.6;
      Q.set(x, y, hsh(x, y, 83) < 0.05 ? P.or[5] : pick(P.granit, l, x, y));
    }
    Q.set(x, top - hh - 1, OUTC);
  }
  // le wagonnet renversé, roues en l'air, le minerai répandu
  const p = MINE.piano, ptop = p.top;
  for (let k = 0; k < 32; k++) {
    const y = ptop + 8 + k, inset = Math.round((31 - k) * 0.22);
    for (let x = p.x + inset - 1; x <= p.x + p.w - inset; x++) {
      const edge = x === p.x + inset - 1 || x === p.x + p.w - inset || k === 0 || k === 31;
      const l = 4 + (1 - (x - p.x) / p.w) * 2 - k * 0.05 + (k % 10 === 4 ? -1.6 : 0);
      Q.set(x, y, edge ? OUTC : pick(ramp('2a2628 3e3a3a 5a5450 6e6862 8a8478 a8a294'), l, x, y));
    }
  }
  const rocks = (x0, w, y0, n, seed) => { // éclats de roche et de minerai, modelés
    const rr = rnd(seed);
    for (let i = 0; i < n; i++) {
      const cx = x0 + rr() * w, cy = y0 + rr() * 6, rx = 1.5 + rr() * 2.5, ry = 1 + rr() * 1.6, gold = rr() < 0.18;
      for (let y = Math.floor(cy - ry - 1); y <= cy + ry + 1; y++) for (let x = Math.floor(cx - rx - 1); x <= cx + rx + 1; x++) {
        const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry, dd = dx * dx + dy * dy;
        if (dd > 1.6) continue;
        Q.set(x, y, dd > 1 ? OUTC : gold ? pick(P.or, 4 - dx - dy, x, y) : pick(P.granit, 5 - dx * 1.5 - dy * 1.5, x, y));
      }
    }
  };
  rocks(p.x - 6, p.w + 22, FLOOR - 6, 18, 91);
  // les tas de minerai (des étais tombés en travers devant)
  MINE.tables.forEach((tb, n) => {
    const peak = FLOOR + 4 - tb.top;
    for (let x = tb.x - 6; x < tb.x + tb.w + 6; x++) {
      const u = (x - tb.x + 6) / (tb.w + 12), hh = Math.round(Math.pow(Math.sin(u * Math.PI), 0.75) * peak + (vnoise(x / 3, n, 84) - 0.5) * 4);
      const y0 = FLOOR + 4 - hh;
      for (let y = y0; y < FLOOR + 6; y++) {
        const lump = vnoise(x / 2.4, y / 2.2, 85 + n);
        let l = 4.4 + (0.5 - u) * 3 + (lump - 0.5) * 4 - (y - y0) * 0.04 + (y - y0 < 2 ? 1.2 : 0);
        if (lump < 0.25) l -= 2;
        Q.set(x, y, y === y0 ? OUTC : hsh(x, y, 86 + n) < 0.035 ? P.or[5 + (x % 2)] : pick(P.granit, l, x, y));
      }
    }
  });
  Q.put();
  for (const [wx, wy] of [[p.x + 15, ptop + 6], [p.x + p.w - 15, ptop + 6]]) { // les roues et l'essieu
    S.disc(f, wx, wy, 6, OUT); S.disc(f, wx, wy, 5, '#3a3436'); S.disc(f, wx, wy, 3, '#5a5450'); S.disc(f, wx, wy, 1, '#a8a294');
    R(f, wx - 4, wy - 4, 2, 1, '#8a8478');
  }
  R(f, p.x + 15, ptop + 5, p.w - 30, 3, OUT); R(f, p.x + 15, ptop + 6, p.w - 30, 1, '#6a6e76');
  for (let x = p.x + 6; x < p.x + p.w - 6; x += 9) { R(f, x, ptop + 13, 1, 1, '#c8c4bc'); R(f, x + 2, ptop + 26, 1, 1, '#c8c4bc'); }
  R(f, p.x + 4, ptop + 8, p.w - 8, 1, '#c8c4bc');
  MINE.tables.forEach((tb, n) => { // l'étai cassé en travers
    const x0 = tb.x - 4, len = tb.w + 6, y0 = tb.top + 24 - n * 4;
    for (let k = 0; k < len; k++) R(f, x0 + k, Math.round(y0 - k * 0.22) - 1, 1, 7, OUT);
    for (let k = 1; k < len - 1; k++) { const yy = Math.round(y0 - k * 0.22); R(f, x0 + k, yy, 1, 5, TIM); R(f, x0 + k, yy, 1, 1, TIM_L); R(f, x0 + k, yy + 4, 1, 1, TIM_D); }
    for (let k = 0; k < 4; k++) R(f, x0 + len - 2 + (k % 2), Math.round(y0 - len * 0.22) - 1 + k, 2, 1, '#c8a070'); // le bout éclaté
  });
  return { bg, front };
}
const OUTC = hex(OUT);

// ================================================================ la poursuite
// Le décor défile au galop (la caméra reste à x = 0 dans la section) : au loin des buttes puis le rebord du plateau
// (calque lent), au milieu la végétation du désert puis les parois rouges du canyon, le sol en bandes horizontales de
// plus en plus rapides vers nous (perspective), des cactus et des rochers posés dessus, et devant les cavaliers des
// touffes et des cailloux qui filent. d : distance parcourue depuis le début de la section.
const chaseD = (t) => Math.max(0, t - SALOON_START) * CHASE.speed;
const TW = 768;                // largeur d'une tuile
const HZV = 100;               // horizon de la perspective du sol (plus haut que l'horizon peint : écarts de vitesse modérés)
const MID = 0.45, FAR = 0.1;   // vitesses (× d) du calque du milieu (pied en y 140) et du lointain
const spd = (y) => (MID * (y - HZV)) / 40;
const G0 = 128;                // haut du sol (l'horizon du ciel et du lointain de shootersky.js)
const GATE = 4, GATE_X = 300;  // la tuile 4 du milieu passe du désert au canyon en x 300
const GATE_D = (GATE * TW + GATE_X - W / 2) / MID; // l'entrée du canyon passe au milieu de l'écran (peu avant El Diablo)
const FAR_X = Math.round(FAR * GATE_D + W / 2 - TW); // au même instant, dans la tuile 1 du lointain
const HAZE = hex('#e2bcae'), HAZE_C = hex('#d8aca8'), MIST = hex('#e8c4b8');
const SABLE = ramp('6a3a2a 84482e 9c5834 b26a3e c47c4a d28e58 dca068 e6b27c eec494');
// les bandes du sol : [y, hauteur, vitesse]
const STRIPS = [];
for (let y = G0; y < H;) { const h = Math.min(H - y, Math.max(2, Math.round((y - HZV) / 9))); STRIPS.push([y, h, spd(y + h / 2)]); y += h; }

// silhouette en gradins d'une paroi entre a et b (comme story/sets/canyon.js)
const stepped = (a, b, top, run = 34, drop = 12, seed = 1) => (x) => {
  const left = x - a < b - x, e = Math.min(x - a, b - x);
  let y = top;
  for (let k = 0, rr = run; k < 3; k++) {
    if (e < rr) y += Math.round(drop * (0.6 + hsh(k, left ? 3 : 4, seed) * 0.9));
    rr -= rr * (0.25 + hsh(k, left ? 1 : 2, seed) * 0.3);
  }
  return y + Math.round((vnoise(x / 5, 0, seed) - 0.5) * 3);
};
// éboulis au pied d'une paroi (a..b, pied foot), qui débordent de part et d'autre
function apron(Pp, a, b, foot, seed, spill = 24) {
  for (let x = a - spill; x < b + spill; x++) {
    const out = x < a ? (a - x) / spill : x > b ? (x - b) / spill : 0;
    const top = Math.round(foot - 12 * (1 - out) ** 1.4 + (vnoise(x / 3, 2, seed) - 0.5) * 4);
    for (let y = top; y < foot + 6 - out * 5; y++) {
      const l = 3.6 + (x < (a + b) / 2 ? 1 : 0) + (vnoise(x / 2, y / 2, seed + 1) - 0.5) * 3 + (y === top ? 1.4 : 0) - (y - top) * 0.05;
      Pp.set(x, y, pick(P.talus, l, x, y));
    }
  }
}
// sprite (Spr de kit-nature) → petit canvas, avec son ombre portée au sol (vers la droite)
function sprCanvas(spr, sw = 0) {
  const c = S.makeCanvas(spr.w + sw + 4, spr.h + 2), g = c.getContext('2d');
  if (sw) {
    g.fillStyle = 'rgba(40,16,14,0.3)';
    for (let dy = -1; dy <= 1; dy++) { const hw = Math.round(sw * Math.sqrt(1 - (dy * dy) / 4)); g.fillRect(spr.ox + 3 - hw, spr.oy + dy, hw * 2, 1); }
  }
  const Pp = new Pix(g);
  spr.blit(Pp, spr.ox, spr.oy);
  Pp.put();
  c.ox = spr.ox; c.oy = spr.oy;
  return c;
}

// Tuiles du lointain : 0 buttes du désert ; 1 les dernières buttes, puis le rebord du canyon (dès FAR_X) ; 2, 3 le rebord
function farTile(v) {
  const c = S.makeCanvas(TW, 136), Pp = new Pix(c.getContext('2d'));
  const rim = (x0, seed) => {
    // le rebord du plateau : gradins, pointes, et une brèche au bord de la tuile (raccord invisible entre deux tuiles)
    const top = (x) => {
      const e = Math.min(x - x0, TW - x);
      if (e < 9) return 120 + (9 - e);
      return Math.min(118, 52 + Math.round(fbm(x / 46, 1, seed, 2) * 22) + (Math.sin(x / 37 + seed) > 0.8 ? -9 : 0) + (e < 40 ? (40 - e) * 1.4 : 0));
    };
    wall(Pp, { x0, x1: TW, top, bot: () => 134, R: P.grès, lit: 6.6, band: 7, haze: 0.42, hcol: HAZE_C, seed, warp: 2 });
    for (let y = 70; y < 134; y++) for (let x = x0; x < TW; x++) Pp.shade(x, y, MIST, 0.55 * ((y - 70) / 64) ** 1.2);
  };
  if (v === 0) {
    butte(Pp, { cx: 130, base: 133, cw: 40, ch: 26, tw: 70, th: 14, haze: 0.38, hcol: HAZE, seed: 31 });
    butte(Pp, { cx: 420, base: 133, cw: 120, ch: 13, tw: 150, th: 9, haze: 0.48, hcol: HAZE, seed: 32 });
    butte(Pp, { cx: 650, base: 133, cw: 22, ch: 34, tw: 44, th: 12, haze: 0.34, hcol: HAZE, seed: 33,
      tops: (x) => (x > 656 && x < 661 ? -7 : Math.round((vnoise(x / 3, 7, 33) - 0.5) * 3)) });
  } else if (v === 1) {
    butte(Pp, { cx: 52, base: 133, cw: 26, ch: 22, tw: 46, th: 10, haze: 0.4, hcol: HAZE, seed: 34 });
    rim(FAR_X, 35);
  } else rim(0, 36 + v);
  Pp.put();
  return c;
}
// Tuiles du milieu : 0..2 le désert (cactus, ocotillos, genévriers, petits rochers), 3 l'entrée du canyon (dès
// GATE_X), 4 et 5 les parois rouges dans l'ombre de la gorge, leurs éboulis, des brèches aux bords
function midTile(v) {
  const c = S.makeCanvas(TW, 152), Pp = new Pix(c.getContext('2d'));
  const desert = (x0, x1, seed) => {
    const sows = [];
    const rr = rnd(seed);
    for (let i = 0; i < 24; i++) sows.push([Math.round(134 + rr() * 9), Math.round(x0 + rr() * (x1 - x0)), rr(), Math.floor(rr() * 1e6)]);
    sows.sort((a, b) => a[0] - b[0]);
    for (const [y, x, d, s] of sows) {
      const sp = [saguaro(16 + Math.round(d * 14) + (s % 7), s, hex('#3a2422')), ocotillo(14 + Math.round(d * 10), s), cholla(6 + Math.round(d * 4), s, null),
        bush(2 + Math.round(d), s, P.sauge), juniper(2 + Math.round(d * 2), s, hex('#3a2422')), boulder(2 + Math.round(d * 2), s, P.sable, hex('#3a2422'))][s % 6];
      sp.blit(Pp, x, y, 0.28 * (1 - d), HAZE);
    }
  };
  const walls = (list, seed) => {
    for (const [a, b, top] of list) {
      const tf = stepped(a, b, top, 40, 14, a + seed);
      wall(Pp, { x0: a, x1: b, top: tf, bot: () => 142, R: P.grès, lit: 4.8, band: 10, seed: a + seed, fade: 1.5,
        edge: (x) => { const e = x - a, f = b - x; return e < 5 ? 2.2 - e * 0.4 : f < 6 ? -1.6 : 0; } });
      apron(Pp, a, b, 142, a + seed + 3);
    }
  };
  if (v < 3) desert(24, TW - 24, 101 + v * 7);
  else if (v === 3) {
    desert(24, GATE_X - 30, 120);
    apron(Pp, GATE_X + 30, GATE_X + 50, 142, 121, 30); // le premier éboulis, puis la première paroi
    walls([[GATE_X + 50, 742, 22]], 122);
    juniper(4, 2).blit(Pp, GATE_X + 150, 70);
  } else {
    walls(v === 4 ? [[34, 330, 16], [420, 738, 34]] : [[30, 282, 40], [366, 740, 8]], 130 + v);
    juniper(3 + (v % 2), v).blit(Pp, v === 4 ? 520 : 140, v === 4 ? 66 : 86);
    if (v === 5) { // une maison troglodyte dans une alcôve
      const ax = 560, ay = 74;
      for (let y = -8; y <= 7; y++) for (let x = -22; x <= 22; x++) {
        const dd = (x * x) / 484 + (y * y) / (y < 0 ? 64 : 49);
        if (dd <= 1) Pp.set(ax + x, ay + y, pick(P.grès, dd > 0.75 ? 2 : y < -2 ? 1 : 1.6, ax + x, ay + y));
      }
      for (const [x, y, bw, bh] of [[-14, 1, 10, 6], [-3, -2, 8, 9], [6, 2, 9, 5]]) for (let j = 0; j < bh; j++) for (let i = 0; i < bw; i++) Pp.set(ax + x + i, ay + y + j, pick(ramp('6a4232 8a5a42 a8765a c4946e'), i === 0 || j === 0 ? 3 : 2, ax + x + i, ay + y + j));
      Pp.rect(ax - 1, ay + 1, 2, 3, hex('#1e0e0e')); Pp.rect(ax + 9, ay + 3, 2, 2, hex('#1e0e0e'));
    }
  }
  Pp.put();
  return c;
}
// Texture du sol (bouclée tous les TW px) : sable rouge du désert ou sable pâle du canyon ; cailloux et touffes rangés
// dans leur bande (chaque bande défile à sa vitesse), ornières de la piste, lit de rivière à sec dans le canyon
function groundTile(canyon) {
  const hh = H - G0, c = S.makeCanvas(TW, hh), Pp = new Pix(c.getContext('2d'));
  const Rm = canyon ? SABLE : P.sable, seed = canyon ? 141 : 140;
  const lf = canyon ? 7.4 : 7.2, ln = canyon ? 4.8 : 4.4;
  for (let y = 0; y < hh; y++) {
    const d = y / hh, sx = 5 + 30 * d, sy = 1.6 + 10 * d;
    for (let x = 0; x < TW; x++) {
      const nz = ((TW - x) * fbm(x / sx, y / sy, seed, 3) + x * fbm((x - TW) / sx, y / sy, seed, 3)) / TW - 0.5; // bouclé
      Pp.set(x, y, pick(Rm, lf + (ln - lf) * Math.sqrt(d) + nz * 1.8 * (0.5 + d) * 1.6, x, y));
    }
  }
  if (canyon) for (let y = 22; y < 34; y++) for (let x = 0; x < TW; x++) { // le lit de la rivière à sec
    const e = Math.abs(y - 28) / 6;
    if (e < 1) Pp.set(x, y, pick(SABLE, e > 0.7 ? 7 : 3.6 + vnoise(x / 3, y, 5) * 1.6 + (hsh(x, y, 6) < 0.05 ? 3 : 0), x, y));
  }
  for (const ry of [48, 49, 66, 67]) for (let x = 0; x < TW; x++) { // les ornières
    const lip = ry === 49 || ry === 67;
    if (vnoise(x / 5, ry, 9) < 0.25) continue;
    Pp.set(x, ry, pick(Rm, lip ? 7.6 : 2.4 + vnoise(x / 2, ry, 10), x, ry));
  }
  const rr = rnd(seed + 1);
  for (const [y0, h] of STRIPS) { // cailloux et touffes, chacun tout entier dans sa bande
    const ty = y0 - G0, dd = ty / hh, n = Math.round((TW * h) / 22);
    for (let i = 0; i < n; i++) {
      const x = Math.floor(rr() * (TW - 8)) + 2, y = ty + 1 + Math.floor(rr() * Math.max(1, h - 2));
      if (rr() < 0.25 && h > 3) { // touffe d'herbe sèche
        const th = Math.min(h - 1, y - ty, 1 + Math.round(dd * 4 * (0.6 + rr())));
        for (let k = -1; k <= 1; k++) for (let j = 0; j < th - Math.abs(k); j++) Pp.set(x + k * (1 + (j >> 1)), y - j, pick(P.herbe, 3 + j * 0.6 - k * 0.4, x + k, y - j));
        continue;
      }
      const w = rr() < dd * 0.6 ? 2 + Math.round(dd * 2) : 1, base = Pp.get(x, y), lt = pick(Rm, Rm.length - 1 - rr() * 2, x, y);
      for (let k = 0; k < w; k++) { Pp.set(x + k, y, k === 0 ? lt : pick(Rm, Rm.length * 0.6, x + k, y)); if (w > 2 && y - 1 >= ty) Pp.set(x + k, y - 1, k < w - 1 ? lt : pick(Rm, Rm.length * 0.5, x + k, y)); }
      Pp.set(x + w, y, mixc(base, hex('#1e0e10'), 0.45));
    }
  }
  Pp.put();
  return c;
}
// Réserves de sprites : derrière (sur le sol, derrière les cavaliers) et devant, au désert et au canyon
function pools() {
  if (CACHE.pools) return CACHE.pools;
  const s = (spr, sw) => sprCanvas(spr, sw);
  CACHE.pools = {
    backD: [s(saguaro(34, 3), 7), s(saguaro(42, 5), 8), s(saguaro(26, 8), 6), s(ocotillo(28, 2, OUT), 0), s(cholla(12, 4), 5), s(cholla(15, 7), 6),
      s(bush(3, 1, P.sauge, hex('#2a2a1e')), 6), s(boulder(6, 1, P.sable), 7), s(deadTree(28, 3), 6), s(juniper(4, 5), 7), s(skull(), 0), s(pear(4, 2), 6)],
    backC: [s(boulder(8, 2, P.grès), 9), s(boulder(11, 4, P.grès), 11), s(boulder(5, 6, P.grès), 6), s(juniper(4, 6), 7), s(bush(3, 3, P.sauge, hex('#2a2a1e')), 6),
      s(deadTree(30, 8), 6), s(tuft(9, 2, P.herbe, OUT), 0), s(cottonwood(34, 5), 10), s(skull(), 0), s(bush(2, 9, P.olive, hex('#2a2a1e')), 5)],
    frontD: [s(tuft(12, 1, P.herbe), 0), s(tuft(10, 4, P.olive, null, true), 0), s(bush(5, 2, P.sauge, hex('#2a2a1e')), 0), s(boulder(7, 3, P.sable), 0), s(pear(6, 4), 0), s(tuft(14, 6, P.herbe), 0)],
    frontC: [s(tuft(12, 7, P.herbe), 0), s(boulder(9, 5, P.grès), 0), s(bush(5, 8, P.sauge, hex('#2a2a1e')), 0), s(boulder(6, 7, P.grès), 0), s(tuft(10, 3, P.olive, null, true), 0)],
  };
  return CACHE.pools;
}
// les tuiles, en cache (clé : genre + variante)
const MAKE = { f: farTile, m: midTile, g: (v) => groundTile(v === 1) };
function tile(key) { return (CACHE[key] ||= MAKE[key[0]](+key.slice(1))); }
const farKey = (k) => `f${k <= 1 ? k : 2 + (k & 1)}`;
const midKey = (k) => `m${k < GATE ? k % 3 : k === GATE ? 3 : 4 + ((k - GATE) & 1)}`;
// un calque de tuiles décalé de o
function layer(w, o, keyOf) {
  o = Math.round(o);
  for (let k = Math.max(0, Math.floor(o / TW)); k * TW - o < W; k++) w.drawImage(tile(keyOf(k)), k * TW - o, 0);
}
// une bande du sol (y, hauteur h) de la texture img, décalée de o, entre les x écran xa et xb
function band(w, img, y, h, o, xa, xb) {
  let u = (((o + xa) % TW) + TW) % TW;
  for (let x = xa; x < xb;) { const n = Math.min(TW - u, xb - x); w.drawImage(img, u, y - G0, n, h, x, y, n, h); x += n; u = 0; }
}
// Sprites posés sur le sol : n par boucle, base entre y0 et y1, chacun à la vitesse du sol sous lui ; au canyon dès que
// son passage au milieu de l'écran vient après GATE_D
function strew(w, d, n, seed, y0, y1, desertPool, canyonPool) {
  for (let i = 0; i < n; i++) {
    const y = Math.round(y0 + hash(seed + i * 7) * (y1 - y0)), s = spd(y), L = 760 + Math.round(hash(seed + i * 7 + 1) * 640);
    const wx = hash(seed + i * 7 + 2) * L, o = d * s;
    const m = Math.ceil((o - 80 - wx) / L), X = wx + m * L, x = Math.round(X - o);
    if (x > W + 80) continue;
    const cyn = X - W / 2 > GATE_D * s, pool = cyn ? canyonPool : desertPool;
    const c = pool[(i * 5 + ((m % 7) + 7) * 3) % pool.length];
    w.drawImage(c, x - c.ox, y - c.oy);
  }
}
const BACK_N = 9, FRONT_N = 7;
// prépare la prochaine tuile qui manque (une au plus par image)
function prefetch(d) {
  const want = [farKey(Math.floor((d * FAR) / TW) + 1), midKey(Math.floor((d * MID) / TW) + 1)];
  if (d > GATE_D - 4000) want.push('g1');
  for (const k of want) if (!CACHE[k]) { tile(k); return; }
}
// arrière de la poursuite : lointain, sol en bandes, calque du milieu, cactus et rochers derrière les cavaliers
export function drawChaseBack(w, t) {
  const d = chaseD(t), P0 = pools();
  layer(w, d * FAR, farKey);
  const gd = tile('g0');
  for (const [y, h, s] of STRIPS) {
    const o = Math.round(d * s), bx = Math.max(0, Math.min(W, Math.round((GATE_D - d) * s + W / 2)));
    if (bx > 0) band(w, gd, y, h, o, 0, bx);
    if (bx < W) band(w, tile('g1'), y, h, o, bx, W);
  }
  layer(w, d * MID, midKey);
  strew(w, d, BACK_N, 300, 146, 164, P0.backD, P0.backC);
  prefetch(d);
}
// devant les cavaliers : touffes, buissons et cailloux du premier plan, qui filent
export function drawChaseFront(w, t) {
  const d = chaseD(t), P0 = pools();
  strew(w, d, FRONT_N, 900, 208, 218, P0.frontD, P0.frontC);
}
