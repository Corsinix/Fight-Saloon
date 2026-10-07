// Mini-jeu « Rodéo au lasso » : au galop à travers l'Ouest, chaque cowboy attrape le plus de bêtes possible.
// ZQSD / WASD / flèches pour diriger le cheval, souris pour viser, clic pour lancer le lasso.
import * as S from './sprites.js';
import { sfx } from './audio.js';
import { canvasText, prune } from './scene.js';
import { SKIN, HAIR_COLORS, CLOTH_COLORS, EYE_COLORS, hatColorOf, beardHasMustache, beardHasChin } from './data.js';
import { MiniScene, ring, pixelSprite as sprite } from './miniscene.js';
import { skyDeco } from './env.js';
import {
  W, H, MODES, rng, LASSO, LASSO_HORIZON, ANIMALS, lassoWorld, animalPos, animalVisible, obstacleX,
  lassoHand, lassoStart, groundSpeed, biomeAt, TWISTS, OUTLAW, LASSO_CATCHUP, lassoRush, lassoTrailing, LASSO_BIOME_NAMES,
} from './worlds.js';

const HORIZON = LASSO_HORIZON;
// une robe par cavalier (6 au plus) : bai, noir, blanc, palomino, gris, rouan
const COATS = [['#8a4a24', '#2e1a10'], ['#3a2c26', '#120c08'], ['#e8dcc8', '#8a7a68'], ['#d8a850', '#f4ecd8'], ['#9a948c', '#3a3632'], ['#a85a48', '#3a1a12']];
const MUSTANGS = [['#b0602a', '#4a2010'], ['#a8a49c', '#4a4640'], ['#d8a850', '#f4ecd8'], ['#3a2c26', '#120c08']];
const ROPE = '#f4e4b8', ROPE_D = '#5a3a20';
const CRY = { chicken: 'cluck', pig: 'oink', sheep: 'baa', goat: 'baa', cow: 'moo', rabbit: 'cluck', mustang: 'neigh', goldbull: 'moo', skunk: 'stink', bison: 'moo', outlaw: 'neigh' };
const GOLD_ROPE = '#f8d040', GOLD_ROPE_D = '#8a6010'; // lasso doré (pari)
// le hors-la-loi : cheval noir, cavalier en noir, foulard rouge
const OUTLAW_RIDER = { key: 'outlaw', skin: SKIN[2], hair: '#2a2622', cloth: '#3a3236', hatC: '#1e1a1c', hat: 'cowboy', beard: 'full', color: '#a8302a' };
const PULL = 800;
const TAU = Math.PI * 2;
const OUT = '#1a0f0a';
const rd = Math.round;
const tri = (u) => 1 - 2 * Math.abs((((u % 1) + 1) % 1) - 0.5);
const clamp01 = (k) => (k < 0 ? 0 : k > 1 ? 1 : k);
const byY = (a, b) => a.y - b.y;

// ------------------------------------------------------------ sprites
const cache = new Map();
const cached = (key, make) => {
  let c = cache.get(key);
  if (!c) { c = make(); cache.set(key, c); }
  return c;
};
// au début d'une partie (lasso, course…) : on libère les chevaux montés par les joueurs des parties précédentes
export const forgetRiders = (riders) => S.forgetLooks(cache, riders.map((r) => r.key));

// sprite sans contour (marques au sol)
function rawSprite(w, h, ox, oy, draw) {
  const c = S.makeCanvas(w, h);
  const ctx = c.getContext('2d');
  draw((dx, dy, ww, hh, col) => { ctx.fillStyle = col; ctx.fillRect(ox + rd(dx), oy + rd(dy), rd(ww), rd(hh)); });
  c.ox = ox;
  c.oy = oy;
  return c;
}

function leg(R, hx, hy, fx, fy, col) {
  const n = Math.max(1, Math.abs(fx - hx), Math.abs(fy - hy));
  for (let k = 0; k <= n; k++) R(Math.round(hx + ((fx - hx) * k) / n), Math.round(hy + ((fy - hy) * k) / n), 2, 1, col);
  R(fx, fy, 2, 1, '#2a1a10');
}

// pieds (x, y) des 4 jambes [arrière loin, arrière près, avant loin, avant près] pour les 4 temps du galop
const GALLOP = [
  [[-18, -3], [-15, -1], [17, -4], [14, -1]],
  [[-13, -2], [-10, -1], [12, -2], [9, -1]],
  [[-7, -5], [-5, -3], [5, -6], [7, -4]],
  [[-12, -1], [-9, -2], [10, -1], [15, -3]],
];

// Allure d'un joueur en petit format (cavalier, duelliste) à partir de son personnage
export function riderLook(c = {}, color, key) {
  return {
    key,
    skin: SKIN[c.skin] || SKIN[1], hair: HAIR_COLORS[c.hairColor] || HAIR_COLORS[1],
    cloth: CLOTH_COLORS[c.outfitColor] || CLOTH_COLORS[2], hatC: hatColorOf(c),
    hat: c.hat || 'cowboy', beard: c.beard, outfit: c.outfit, color,
    hairStyle: c.hair, eyes: c.eyes, eyeC: EYE_COLORS[c.eyeColor] || EYE_COLORS[0], mouth: c.mouth, extra: c.extra,
  };
}

// Chapeau d'un cavalier (tête en x -6..0, y -40..-34 ; b = rebond)
export function drawHat(R, r, b = 0) {
  const { hair, hatC, hat } = r;
  const band = S.shade(hatC, -0.35);
  switch (hat) {
    case 'sombrero': R(-11, -42 + b, 16, 2, hatC); R(-5, -47 + b, 5, 5, hatC); R(-5, -43 + b, 5, 1, band); break;
    case 'bowler': R(-7, -41 + b, 8, 1, hatC); R(-6, -44 + b, 6, 3, hatC); R(-5, -45 + b, 4, 1, hatC); break;
    case 'tophat': R(-8, -41 + b, 10, 1, hatC); R(-6, -48 + b, 6, 7, hatC); R(-6, -43 + b, 6, 1, band); break;
    case 'gambler': R(-9, -41 + b, 12, 1, hatC); R(-6, -43 + b, 6, 2, hatC); break;
    case 'bandana': R(-6, -42 + b, 6, 2, hatC); R(-8, -41 + b, 2, 1, hatC); R(-9, -40 + b, 1, 2, hatC); break;
    case 'coonskin': R(-6, -43 + b, 6, 3, '#8a6a48'); R(-9, -42 + b, 3, 1, '#8a6a48'); R(-10, -41 + b, 2, 6, '#8a6a48'); R(-10, -38 + b, 2, 1, '#4a3420'); break;
    case 'kepi': R(-6, -44 + b, 6, 3, hatC); R(-6, -42 + b, 6, 1, '#e0b040'); R(0, -41 + b, 3, 1, '#2a2226'); break;
    case 'none': R(-6, -41 + b, 6, 2, hair); break;
    default:
      R(-9, -41 + b, 12, 1, hatC); R(-6, -44 + b, 6, 3, hatC); R(-6, -45 + b, 2, 1, hatC); R(-2, -45 + b, 2, 1, hatC);
      R(-6, -42 + b, 6, 1, hat === 'straw' ? '#a8302a' : hat === 'cavalry' ? '#e0b040' : band);
      if (hat === 'feather') { R(-1, -47 + b, 1, 4, '#ece4d0'); R(0, -48 + b, 1, 2, '#ece4d0'); }
  }
}

function drawRider(R, r, frame, b) {
  const { skin, hair, cloth, color, beard } = r;
  R(-7, -23 + b, 9, 3, color); // couverture de selle aux couleurs du joueur
  R(-6, -25 + b, 7, 2, '#5a3a20');
  R(-3, -24 + b, 3, 9, '#4a3a2a');
  R(-4, -16 + b, 5, 2, '#2a1a10');
  R(-6, -33 + b, 7, 9, cloth);
  R(-6, -25 + b, 7, 1, '#2a1a10');
  R(1, -31 + b, 5, 2, cloth); R(5, -30 + b, 2, 2, skin); // rênes
  R(1, -36 + b, 2, 5, cloth); R(2, -38 + b, 2, 2, skin); // bras levé
  R(-6, -40 + b, 6, 7, skin); R(0, -37 + b, 1, 1, skin);
  R(-6, -39 + b, 1, 5, hair); R(-2, -38 + b, 1, 1, '#1a0f0a');
  if (beardHasMustache(beard)) R(-2, -35 + b, 3, 1, hair);
  if (beardHasChin(beard)) R(-4, -34 + b, 4, 1, hair);
  R(-6, -33 + b, 6, 1, color); R(-9, -33 + b + (frame % 2), 3, 1, color); // foulard qui flotte
  drawHat(R, r, b);
}

export function horseSprite(coat, mane, frame, rider) {
  return cached(`h${coat}${mane}${frame}${rider ? rider.key : ''}`, () => sprite(60, 56, 26, 54, (R) => {
    const b = frame === 2 ? -1 : 0;
    const dark = S.shade(coat, -0.28), light = S.shade(coat, 0.15);
    const L = GALLOP[frame];
    leg(R, -11, -13 + b, L[0][0], L[0][1], dark);
    leg(R, 8, -13 + b, L[2][0], L[2][1], dark);
    const tw = [0, 1, 2, 1][frame];
    R(-15, -21 + b, 2, 2, mane); R(-17, -20 + b + tw, 2, 3, mane); R(-19, -18 + b + tw, 2, 4, mane); R(-20, -15 + b + tw, 1, 3, mane);
    R(-13, -21 + b, 25, 9, coat); R(-12, -22 + b, 22, 1, coat); R(-12, -13 + b, 22, 1, dark); R(-12, -20 + b, 20, 1, light);
    // encolure épaisse qui s'affine vers la tête, crinière le long du bord arrière
    for (let y = -21; y >= -32; y--) {
      const u = -21 - y;
      const xl = Math.round(6 + u * 0.5), xr = Math.round(13 + u * 0.3);
      R(xl, y + b, xr - xl + 1, 1, coat);
      if (u > 2) R(xr, y + b, 1, 1, light);
      R(xl - 1 - ((u + frame) % 3 === 0 ? 1 : 0), y + b, 2, 1, mane);
    }
    // tête allongée, chanfrein vers l'avant et le bas
    for (const [y, x0, x1] of [[-35, 14, 16], [-34, 13, 18], [-33, 13, 20], [-32, 14, 21], [-31, 15, 22], [-30, 17, 23], [-29, 18, 23], [-28, 19, 22]]) R(x0, y + b, x1 - x0 + 1, 1, coat);
    R(19, -29 + b, 5, 1, dark); R(19, -28 + b, 4, 1, dark); // museau
    R(15, -31 + b, 3, 1, dark); // ganache
    R(14, -37 + b, 1, 2, coat); R(16, -37 + b, 2, 2, coat); // oreilles
    R(12, -35 + b, 2, 2, mane); R(13, -36 + b, 1, 1, mane); // toupet
    R(17, -33 + b, 1, 1, '#1a0f0a'); R(22, -30 + b, 1, 1, '#1a0f0a');
    leg(R, -9, -13 + b, L[1][0], L[1][1], coat);
    leg(R, 10, -13 + b, L[3][0], L[3][1], coat);
    if (rider) drawRider(R, rider, frame, b);
  }));
}

// ------------------------------------------------------------ bêtes
// Outils de dessin : ellipse pleine, membre épais, patte articulée qui suit un cycle de foulée.
function blob(R, cx, cy, rx, ry, col) {
  for (let dy = -ry; dy <= ry; dy++) {
    const half = rd(rx * Math.sqrt(Math.max(0, 1 - (dy / (ry + 0.5)) ** 2)));
    R(rd(cx) - half, rd(cy) + dy, half * 2 + 1, 1, col);
  }
}
function limb(R, x0, y0, x1, y1, w, col) {
  const n = Math.max(1, Math.abs(rd(x1) - rd(x0)), Math.abs(rd(y1) - rd(y0)));
  for (let k = 0; k <= n; k++) R(rd(x0 + ((x1 - x0) * k) / n), rd(y0 + ((y1 - y0) * k) / n), w, 1, col);
}
// hanche (hx, hy), pied au sol en y = -1 ; ph = phase (pied levé et ramené vers l'avant quand sin > 0)
function stride(R, hx, hy, ph, step, lift, w, col, hoof, front = false) {
  const up = Math.max(0, Math.sin(ph));
  const fx = hx - Math.cos(ph) * step, fy = -1 - up * lift;
  const kx = (hx + fx) / 2 + (front ? -1 : 1) * up * lift * 0.6, ky = hy + (fy - hy) * 0.5;
  limb(R, hx, hy, kx, ky, w, col);
  limb(R, kx, ky, fx, fy, w, col);
  if (hoof) R(rd(fx), rd(fy), w, 1, hoof);
}

const COWS = [
  { body: '#f4ecd8', spots: '#2a2622', leg: '#f4ecd8', horn: '#e8dcc0', muzzle: '#e8a8a0', udder: true }, // Holstein
  { body: '#9a4a2a', face: '#f4ecd8', belly: '#f4ecd8', leg: '#9a4a2a', horn: '#e8dcc0', muzzle: '#e8a8a0' }, // Hereford
  { body: '#c89058', spots: '#9a6034', leg: '#c89058', horn: '#f4ecd8', muzzle: '#5a3a20', long: true }, // Longhorn
  { body: '#34302c', leg: '#34302c', muzzle: '#5a4a48' }, // Angus
];
const GOLD = { body: '#e0b040', leg: '#e0b040', horn: '#fdf6e0', muzzle: '#c89030', long: true, gold: true };

function drawCow(R, p, c) {
  const dk = S.shade(c.body, -0.32), lt = S.shade(c.body, 0.2);
  const b = -rd(Math.abs(Math.sin(p)) * 1.5);
  const hb = rd(Math.sin(p + 1) * 1);
  const hy = -12 + b;
  const G = [0, 0.18, 0.5, 0.68].map((g) => p + g * TAU);
  const legD = S.shade(c.leg, -0.3);
  stride(R, -8, hy, G[0], 4, 3, 2, legD, '#2a1a10');
  stride(R, 8, hy, G[2], 4, 3, 2, legD, '#2a1a10', true);
  // queue qui fouette
  const tx = -15 - rd(Math.cos(p) * 1.5), ty = -10 + rd(Math.sin(p) * 2);
  limb(R, -12, -18 + b, tx, ty + b, 1, dk);
  R(tx - 1, ty + b, 2, 2, c.gold ? '#fff0a0' : OUT);
  blob(R, 0, -14 + b, 12, 5, dk);
  blob(R, 0, -15 + b, 12, 5, c.body);
  R(-8, -20 + b, 15, 1, lt);
  if (c.gold) { R(-6, -18 + b, 3, 1, '#fff6c0'); R(2, -19 + b, 4, 1, '#fff6c0'); R(-12, -13 + b, 3, 2, '#c89030'); }
  if (c.spots) { blob(R, -5, -16 + b, 4, 2, c.spots); blob(R, 4, -13 + b, 3, 2, c.spots); blob(R, -10, -13 + b, 1, 2, c.spots); }
  if (c.belly) R(-7, -11 + b, 13, 1, c.belly);
  if (c.udder) R(-3, -10 + b, 4, 2, '#e8a8a0');
  // cou et tête
  R(9, -19 + b + hb, 4, 7, c.body); R(9, -13 + b + hb, 4, 1, dk);
  blob(R, 14, -17 + b + hb, 4, 3, c.face || c.body);
  blob(R, 17, -15 + b + hb, 2, 2, c.muzzle);
  R(18, -16 + b + hb, 1, 1, OUT);
  R(14, -18 + b + hb, 1, 1, c.gold ? '#e8302a' : OUT);
  R(11, -20 + b + hb, 2, 1, dk);
  if (c.long) {
    limb(R, 13, -20 + b + hb, 8, -24 + b + hb, 1, c.horn); limb(R, 15, -20 + b + hb, 21, -24 + b + hb, 1, c.horn);
    R(7, -25 + b + hb, 1, 1, c.horn); R(21, -25 + b + hb, 1, 1, c.horn);
  } else if (c.horn) { R(12, -22 + b + hb, 1, 2, c.horn); R(15, -22 + b + hb, 1, 2, c.horn); }
  if (c.gold) R(18, -13 + b + hb, 2, 1, '#c8c0b8');
  stride(R, -10, hy, G[1], 4, 3, 2, c.leg, '#2a1a10');
  stride(R, 10, hy, G[3], 4, 3, 2, c.leg, '#2a1a10', true);
}

const PIGS = [
  { body: '#f0a8a0', snout: '#d87870' }, { body: '#f0b4aa', snout: '#d87870', spots: '#3a2a2a' },
  { body: '#3a3032', snout: '#e8a8a0', belt: '#f0e4dc' }, { body: '#b07a58', snout: '#8a5038', spots: '#7a4a30' },
];
function drawPig(R, p, c) {
  const dk = S.shade(c.body, -0.25), lt = S.shade(c.body, 0.18);
  const b = -rd(Math.abs(Math.sin(p)) * 1.2);
  const hy = -6 + b;
  const G = [0, 0.5, 0.5, 0].map((g) => p + g * TAU);
  stride(R, -5, hy, G[0], 3, 2, 2, dk, '#5a3a30');
  stride(R, 5, hy, G[2], 3, 2, 2, dk, '#5a3a30', true);
  // queue en tire-bouchon qui frétille
  const tw = rd(Math.sin(p * 2));
  R(-10, -10 + b, 1, 1, dk); R(-11, -11 + b + tw, 1, 1, dk); R(-10, -12 + b + tw, 1, 1, dk);
  blob(R, 0, -8 + b, 9, 4, dk);
  blob(R, 0, -9 + b, 9, 4, c.body);
  R(-6, -13 + b, 11, 1, lt);
  if (c.spots) { blob(R, -4, -10 + b, 2, 1, c.spots); blob(R, 3, -8 + b, 2, 1, c.spots); }
  if (c.belt) R(1, -12 + b, 3, 7, c.belt);
  blob(R, 9, -9 + b, 3, 3, c.body);
  R(11, -10 + b, 3, 3, c.snout); R(13, -9 + b, 1, 1, '#5a2a24');
  R(9, -10 + b, 1, 1, OUT);
  R(7, -13 + b, 2, 2, dk); R(9, -12 + b - (Math.sin(p) > 0 ? 1 : 0), 1, 1, dk); // oreille qui ballotte
  stride(R, -6, hy, G[1], 3, 2, 2, c.body, '#5a3a30');
  stride(R, 6, hy, G[3], 3, 2, 2, c.body, '#5a3a30', true);
}

const SHEEP = [
  { wool: '#ece6da', face: '#3a3230' }, { wool: '#e4d8bc', face: '#3a3230' },
  { wool: '#4a4240', face: '#1e1818' }, { wool: '#c8c0b4', face: '#f0e8dc' },
];
function drawSheep(R, p, c) {
  const dk = S.shade(c.wool, -0.18), lt = S.shade(c.wool, 0.25);
  const b = -rd(Math.abs(Math.sin(p)) * 2); // petits bonds
  const hy = -7 + b;
  const G = [0, 0.5, 0.5, 0].map((g) => p + g * TAU);
  stride(R, -5, hy, G[0], 2, 3, 1, S.shade(c.face, -0.2), '#1a1414');
  stride(R, 5, hy, G[2], 2, 3, 1, S.shade(c.face, -0.2), '#1a1414', true);
  blob(R, 0, -10 + b, 9, 5, dk);
  blob(R, 0, -11 + b, 9, 5, c.wool);
  for (const [x, y] of [[-6, -15], [-1, -16], [4, -15], [-9, -11], [8, -12]]) blob(R, x, y + b, 2, 2, c.wool);
  for (const [x, y] of [[-5, -15], [0, -16], [-7, -12], [2, -13]]) R(x, y + b, 1, 1, lt);
  const hb = rd(Math.sin(p) * 1);
  blob(R, 10, -12 + b + hb, 3, 2, c.face);
  R(7, -13 + b + hb, 2, 1, c.face); R(12, -13 + b + hb, 1, 1, c.wool === '#4a4240' ? '#c8c0b4' : '#f4ecd8');
  stride(R, -6, hy, G[1], 2, 3, 1, c.face, '#1a1414');
  stride(R, 6, hy, G[3], 2, 3, 1, c.face, '#1a1414', true);
}

const GOATS = [
  { body: '#e8e0d0', horn: '#b8a888' }, { body: '#8a5a3a', horn: '#d8c8a8' },
  { body: '#3a3232', horn: '#c8b898', patch: '#e8e0d0' }, { body: '#9a948a', horn: '#d8c8a8' },
];
function drawGoat(R, p, c) {
  const dk = S.shade(c.body, -0.28), lt = S.shade(c.body, 0.2);
  const b = -rd(Math.max(0, Math.sin(p)) * 4); // la chèvre bondit
  const hy = -10 + b;
  const G = [0, 0.08, 0.5, 0.58].map((g) => p + g * TAU);
  stride(R, -5, hy, G[0], 4, 4, 1, dk, '#2a1a10');
  stride(R, 5, hy, G[2], 4, 4, 1, dk, '#2a1a10', true);
  R(-9, -16 + b, 2, 2, c.body); R(-10, -17 + b, 1, 1, c.body); // queue dressée
  blob(R, 0, -12 + b, 8, 3, dk);
  blob(R, 0, -13 + b, 8, 3, c.body);
  R(-5, -16 + b, 9, 1, lt);
  if (c.patch) blob(R, -3, -13 + b, 3, 2, c.patch);
  limb(R, 6, -14 + b, 9, -19 + b, 3, c.body);
  blob(R, 11, -20 + b, 3, 2, c.body);
  R(13, -19 + b, 2, 2, dk); R(11, -21 + b, 1, 1, OUT);
  limb(R, 10, -22 + b, 7, -25 + b, 1, c.horn); R(6, -25 + b, 1, 1, c.horn);
  R(8, -21 + b, 2, 1, dk); // oreille
  R(12, -17 + b, 1, 2, dk); // barbiche
  stride(R, -6, hy, G[1], 4, 4, 1, c.body, '#2a1a10');
  stride(R, 6, hy, G[3], 4, 4, 1, c.body, '#2a1a10', true);
}

const RABBITS = ['#a07850', '#8a8478', '#c8a878', '#6a5040'];
function drawRabbit(R, f, col) {
  const dk = S.shade(col, -0.3), lt = S.shade(col, 0.25);
  // 0 accroupi, 1 détente, 2 en l'air, 3 réception
  const lift = [0, 2, 5, 2][f], st = [0, 2, 3, 1][f];
  const y = -lift;
  if (f === 0) { R(-4, -3, 5, 2, dk); R(1, -2, 2, 1, dk); }
  else if (f === 3) { limb(R, 3, -4 + y, 5, -1, 1, dk); R(-5, -4 + y, 3, 1, dk); }
  else { limb(R, -3, -4 + y, -7 - st, -2 + y + st, 2, dk); limb(R, 3, -5 + y, 6 + st, -3 + y, 1, dk); }
  blob(R, -st / 2, -5 + y, 4 + st, 3, col);
  R(-3 - st, -8 + y, 5 + st, 1, lt);
  blob(R, -5 - st, -6 + y, 1, 1, '#f4ecd8'); // queue blanche
  blob(R, 4, -8 + y, 2, 2, col);
  R(5, -9 + y, 1, 1, OUT); R(6, -7 + y, 1, 1, '#e8a8a0');
  limb(R, 3, -10 + y, 0, -15 + y, 2, col); R(1, -14 + y, 1, 3, '#e8b0a8');
  limb(R, 4, -10 + y, 3, -15 + y, 1, dk);
}

const HENS = [
  { body: '#f4ecd8', tail: '#d8d0bc' }, { body: '#b0602a', tail: '#3a2a20' },
  { body: '#3a3232', tail: '#2a3a4a' }, { body: '#d8c8a8', tail: '#8a7a68', speck: '#6a5a48' },
];
function drawChicken(R, f, c) {
  const dk = S.shade(c.body, -0.25), lt = S.shade(c.body, 0.2);
  const b = -[0, 1, 2, 1][f];
  const run = f % 2;
  // pattes qui moulinent
  limb(R, -1, -4 + b, run ? -3 : 1, -1, 1, '#e0b040'); limb(R, 1, -4 + b, run ? 2 : -2, -1, 1, '#d09030');
  R(run ? -4 : 0, -1, 2, 1, '#e0b040'); R(run ? 2 : -3, -1, 2, 1, '#d09030');
  // queue
  R(-6, -11 + b, 2, 4, c.tail); R(-7, -12 + b, 1, 3, c.tail); R(-5, -12 + b, 1, 2, c.tail);
  blob(R, 0, -6 + b, 4, 3, dk);
  blob(R, 0, -7 + b, 4, 3, c.body);
  if (c.speck) { R(-2, -8 + b, 1, 1, c.speck); R(1, -6 + b, 1, 1, c.speck); R(-1, -5 + b, 1, 1, c.speck); }
  // aile qui bat
  if (f % 2) { R(-3, -11 + b, 4, 2, lt); R(-2, -12 + b, 2, 1, lt); } else R(-3, -7 + b, 4, 2, dk);
  blob(R, 4, -11 + b, 2, 2, c.body);
  R(3, -14 + b, 3, 1, '#e8604c'); R(4, -15 + b, 1, 1, '#e8604c');
  R(6, -11 + b, 2, 1, '#e0b040'); R(5, -9 + b, 1, 2, '#e8604c'); R(5, -12 + b, 1, 1, OUT);
}

function drawSkunk(R, f, v) {
  const k = '#2a2622', w = '#f4ecd8';
  const p = (f / 4) * TAU;
  const b = -rd(Math.abs(Math.sin(p)));
  const sway = rd(Math.sin(p));
  const G = [0, 0.5, 0.5, 0].map((g) => p + g * TAU);
  stride(R, -4, -3 + b, G[0], 1, 1, 1, k);
  stride(R, 4, -3 + b, G[2], 1, 1, 1, k);
  blob(R, -8 + sway, -11 + b, 3, 5, k); // queue en panache
  R(-8 + sway, -15 + b, 1, 7, w); if (v % 2) R(-9 + sway, -12 + b, 1, 3, w);
  R(-6 + sway, -16 + b, 2, 1, k);
  blob(R, 0, -5 + b, 6, 3, k);
  R(-5, -8 + b, 10, 1, w); R(-4, -7 + b, 3, 1, w); R(2, -7 + b, 3, 1, w);
  blob(R, 6, -5 + b, 3, 2, k);
  R(5, -8 + b, 3, 1, w); R(9, -4 + b, 1, 1, '#e8a8a0'); R(7, -6 + b, 1, 1, w);
  stride(R, -5, -3 + b, G[1], 1, 1, 1, k);
  stride(R, 5, -3 + b, G[3], 1, 1, 1, k);
}

// Bison de la stampede : bosse laineuse, tête basse et barbue, petites cornes
const BISONS = ['#5a3a24', '#4a3020', '#6a4a2c', '#3e2a1c'];
function drawBison(R, p, col) {
  const wool = S.shade(col, -0.35), dk = S.shade(col, -0.2), lt = S.shade(col, 0.2);
  const b = -rd(Math.abs(Math.sin(p)) * 2);
  const hb = rd(Math.sin(p + 1) * 1);
  const hy = -11 + b;
  const G = [0, 0.18, 0.5, 0.68].map((g) => p + g * TAU);
  stride(R, -8, hy, G[0], 5, 3, 2, S.shade(col, -0.4), '#1a0f0a');
  stride(R, 7, hy, G[2], 5, 3, 2, S.shade(wool, -0.2), '#1a0f0a', true);
  limb(R, -12, -15 + b, -15, -11 + b + rd(Math.sin(p) * 2), 1, dk); // queue
  R(-16, -11 + b + rd(Math.sin(p) * 2), 2, 2, wool);
  blob(R, -3, -12 + b, 10, 4, dk); // arrière-train
  blob(R, -3, -13 + b, 10, 4, col);
  blob(R, 5, -15 + b, 8, 7, wool); // bosse et épaules laineuses
  blob(R, 4, -16 + b, 7, 6, S.shade(wool, 0.15));
  R(0, -22 + b, 7, 1, lt); R(2, -21 + b, 3, 1, lt);
  blob(R, 13, -11 + b + hb, 4, 4, wool); // tête basse
  R(15, -9 + b + hb, 3, 2, '#2a1a10');
  R(14, -12 + b + hb, 1, 1, '#e8dcc0');
  R(12, -16 + b + hb, 1, 2, '#e8dcc0'); R(15, -16 + b + hb, 1, 2, '#e8dcc0');
  R(12, -7 + b + hb, 3, 2, wool); // barbe
  stride(R, -10, hy, G[1], 5, 3, 2, col, '#1a0f0a');
  stride(R, 9, hy, G[3], 5, 3, 2, wool, '#1a0f0a', true);
}

// nb d'images, ms par image, largeur de l'ombre
const ANIM = {
  bison: { n: 6, ms: 55, sh: 24 }, outlaw: { n: 4, ms: 70, sh: 24 },
  cow: { n: 6, ms: 75, sh: 22 }, goldbull: { n: 6, ms: 60, sh: 24 }, pig: { n: 6, ms: 65, sh: 16 },
  sheep: { n: 6, ms: 80, sh: 16 }, goat: { n: 6, ms: 70, sh: 14 }, rabbit: { n: 4, ms: 85, sh: 9 },
  chicken: { n: 4, ms: 60, sh: 8 }, skunk: { n: 4, ms: 90, sh: 12 }, mustang: { n: 4, ms: 80, sh: 24 },
};

function animalSprite(kind, v, f) {
  if (kind === 'mustang') { const [c, m] = MUSTANGS[v % 4]; return horseSprite(c, m, f, null); }
  if (kind === 'outlaw') return horseSprite('#2a2420', '#0e0a08', f, OUTLAW_RIDER);
  return cached(`a${kind}|${v}|${f}`, () => sprite(50, 38, 22, 36, (R) => {
    const p = (f / ANIM[kind].n) * TAU;
    switch (kind) {
      case 'cow': drawCow(R, p, COWS[v % 4]); break;
      case 'goldbull': drawCow(R, p, GOLD); break;
      case 'pig': drawPig(R, p, PIGS[v % 4]); break;
      case 'sheep': drawSheep(R, p, SHEEP[v % 4]); break;
      case 'goat': drawGoat(R, p, GOATS[v % 4]); break;
      case 'rabbit': drawRabbit(R, f, RABBITS[v % 4]); break;
      case 'chicken': drawChicken(R, f, HENS[v % 4]); break;
      case 'skunk': drawSkunk(R, f, v); break;
      case 'bison': drawBison(R, p, BISONS[v % 4]); break;
    }
  }));
}

// ------------------------------------------------------------ obstacles (font trébucher le cheval)
const OBSTACLE_DRAW = {
  rock(R) { blob(R, 0, -4, 8, 4, '#6a6458'); blob(R, 0, -5, 8, 4, '#8a8478'); R(-5, -8, 6, 2, '#aaa496'); },
  cactus(R) {
    const g = '#4a7a3a', d = '#2e5228';
    R(-2, -22, 4, 22, g); R(1, -22, 1, 22, d); R(-1, -21, 1, 18, '#6a9a4a');
    R(-6, -14, 4, 2, g); R(-6, -19, 2, 5, g); R(2, -11, 4, 2, g); R(4, -17, 2, 6, g);
  },
  log(R) { R(-10, -6, 20, 6, '#7a5a3a'); R(-10, -6, 20, 1, '#9a7a52'); R(8, -6, 2, 6, '#c8a070'); R(9, -4, 1, 2, '#8a6a40'); R(-4, -3, 6, 1, '#5a3a20'); },
  skull(R) {
    blob(R, 0, -4, 4, 3, '#e8e0d0'); R(-2, -5, 1, 1, OUT); R(1, -5, 1, 1, OUT);
    limb(R, -3, -6, -9, -9, 1, '#e8e0d0'); limb(R, 3, -6, 9, -9, 1, '#e8e0d0'); R(-9, -10, 1, 1, '#e8e0d0'); R(9, -10, 1, 1, '#e8e0d0');
  },
  hay(R) { R(-9, -10, 18, 10, '#d8b048'); for (let x = -8; x < 9; x += 3) R(x, -9, 1, 8, '#c09838'); R(-9, -7, 18, 1, '#8a6a30'); R(-9, -3, 18, 1, '#8a6a30'); R(-9, -10, 18, 1, '#f0d070'); },
  boulder(R) { blob(R, 0, -6, 11, 6, '#7a4030'); blob(R, -1, -7, 10, 6, '#a8604a'); R(-6, -12, 8, 2, '#c8806a'); R(2, -6, 5, 1, '#7a4030'); },
  stump(R) { R(-6, -8, 12, 8, '#6a4a30'); R(-6, -8, 12, 2, '#c8a070'); R(-4, -7, 8, 1, '#a8804a'); R(-8, -2, 3, 2, '#6a4a30'); R(5, -2, 3, 2, '#6a4a30'); },
  barrel(R) { R(-6, -14, 12, 14, '#8a5a34'); R(-4, -14, 2, 14, '#a8703c'); for (const y of [-12, -7, -2]) R(-6, y, 12, 1, '#4a4f58'); R(-5, -14, 10, 1, '#5a3a20'); },
  fence(R) { for (const x of [-11, 0, 10]) R(x, -12, 2, 12, '#7a5a3a'); R(-11, -10, 23, 2, '#9a7a52'); R(-11, -5, 23, 2, '#9a7a52'); },
};
const obstacleSprite = (kind) => cached(`o${kind}`, () => sprite(30, 28, 15, 27, OBSTACLE_DRAW[kind] || OBSTACLE_DRAW.rock));

// ------------------------------------------------------------ décor des régions traversées
const BIOMES = {
  desert: {
    ground: ['#c4ac68', '#c8b070', '#ccb474', '#d0b878', '#d4bc80'], specks: ['#e8d8a0', '#a08a50', '#8a8478'], streak: '#e0cc94',
    far: ['#8a92ac', '#9ea6bc'], mid: ['#b8946a', '#a8845a'],
    props: ['saguaro', 'saguaro', 'deadTree', 'mesaRock', 'wagon'], flat: ['pebbles', 'tuft', 'bones', 'crack', 'pebbles'], fore: ['fCactus', 'fRock', 'fGrass'],
  },
  prairie: {
    ground: ['#8a9a4a', '#92a250', '#9aa856', '#a2ae5c', '#aab462'], specks: ['#c8cc78', '#6a7a30', '#d8c858'], streak: '#b4bc6c',
    far: ['#8aa0b8', '#9cb0c4'], mid: ['#5a7a3e', '#4a6a34'],
    props: ['tree', 'tree', 'windmill', 'haystack', 'barn'], flat: ['tuft', 'flowersY', 'tuft', 'flowersP', 'grass'], fore: ['fGrass', 'fGrass', 'fFlowers'],
  },
  canyon: {
    ground: ['#b06a48', '#b8724e', '#c07a54', '#c8825a', '#cc8a60'], specks: ['#e0a070', '#8a4a30', '#a8584a'], streak: '#d8946a',
    far: ['#b07a68', '#c08a78'], mid: ['#9a4a34', '#8a3e2c'],
    props: ['hoodoo', 'hoodoo', 'arch', 'deadTree', 'boulderFar'], flat: ['pebbles', 'crack', 'redStones', 'tuft'], fore: ['fRock', 'fDeadBush'],
  },
  ranch: {
    ground: ['#a89060', '#b09868', '#b8a070', '#c0a878', '#c8b080'], specks: ['#d8c898', '#8a7448', '#7a8a3a'], streak: '#c8b484',
    far: ['#98a0b4', '#aab0c0'], mid: ['#7a8a52', '#6a7a46'],
    props: ['house', 'waterTower', 'windmill', 'fenceFar', 'tree'], flat: ['rut', 'tuft', 'pebbles', 'grass'], fore: ['fFence', 'fGrass'],
  },
};

const PROP_DRAW = {
  saguaro(R) {
    const g = '#4a7a3a', d = '#2e5228', l = '#6a9a4a';
    R(-2, -26, 4, 26, g); R(1, -26, 1, 26, d); R(-1, -25, 1, 22, l);
    R(-7, -14, 5, 2, g); R(-7, -21, 2, 7, g); R(2, -11, 5, 2, g); R(5, -18, 2, 7, g);
  },
  deadTree(R) {
    const c = '#6a4a30';
    limb(R, 0, 0, 0, -16, 2, c); limb(R, 0, -9, -6, -15, 1, c); limb(R, 1, -13, 6, -20, 1, c); limb(R, -3, -12, -5, -19, 1, c); limb(R, 4, -17, 8, -18, 1, c);
  },
  mesaRock(R) { blob(R, 0, -6, 11, 6, '#8a4e38'); R(-8, -12, 16, 2, '#a8644a'); R(-9, -10, 18, 4, '#9a5a42'); R(-6, -7, 4, 1, '#7a4030'); },
  wagon(R) {
    R(-12, -9, 24, 5, '#7a4a24'); R(-12, -9, 24, 1, '#9a6a3c');
    for (let i = 0; i < 16; i++) { const h = rd(7 * Math.sin((Math.PI * i) / 16)); if (i % 5 !== 2) R(-9 + i, -9 - h, 1, h, '#e0d4b8'); }
    blob(R, -7, -4, 4, 4, '#5a3a20'); blob(R, -7, -4, 2, 2, '#c4ac68'); R(4, -3, 7, 2, '#5a3a20');
  },
  tree(R) {
    R(-1, -10, 3, 10, '#6a4a30');
    blob(R, 0, -16, 8, 6, '#3e6a32'); blob(R, -5, -13, 5, 4, '#3e6a32'); blob(R, 5, -13, 5, 4, '#3e6a32');
    blob(R, -1, -18, 5, 3, '#5a8a44'); R(-4, -20, 3, 1, '#7aaa58');
  },
  windmill(R) {
    const c = '#6a6a72';
    limb(R, -5, 0, -1, -30, 1, c); limb(R, 5, 0, 1, -30, 1, c); limb(R, -4, -8, 4, -14, 1, c); limb(R, 4, -8, -4, -14, 1, c);
    limb(R, -3, -18, 3, -24, 1, c); R(1, -33, 8, 2, '#8a8a92'); R(8, -35, 2, 6, '#c8c8d0');
  },
  haystack(R) { blob(R, 0, -6, 9, 6, '#c8a040'); blob(R, 0, -7, 8, 5, '#d8b048'); R(-4, -11, 6, 1, '#f0d070'); for (let x = -6; x < 7; x += 3) R(x, -6, 1, 4, '#b08830'); },
  barn(R) {
    R(-14, -16, 28, 16, '#a8403a'); for (let x = -13; x < 14; x += 4) R(x, -15, 1, 15, '#8a3028');
    for (let k = 0; k < 7; k++) R(-15 + k * 2, -17 - k, 30 - k * 4, 1, '#5a2a1a');
    R(-5, -10, 10, 10, '#f4ecd8'); R(-4, -9, 8, 9, '#7a2a20'); limb(R, -4, -9, 3, -1, 1, '#f4ecd8'); limb(R, 3, -9, -4, -1, 1, '#f4ecd8');
  },
  hoodoo(R) {
    blob(R, 0, -3, 6, 3, '#9a5a40'); R(-3, -20, 6, 17, '#b0704e'); R(-3, -20, 2, 17, '#c8886a');
    R(-3, -14, 6, 1, '#8a4a34'); R(-3, -8, 6, 1, '#8a4a34'); blob(R, 0, -22, 6, 2, '#7a4434');
  },
  arch(R) {
    // deux piliers reliés par une voûte : l'ouverture est une demi-ellipse
    for (let x = -18; x <= 18; x++) {
      const top = -30 + rd(Math.abs(x) / 6);
      const open = Math.abs(x) < 11 ? rd(20 * Math.sqrt(1 - (x / 11) ** 2)) : 0;
      R(x, top, 1, -top - open, x < -13 ? '#c8886a' : x > 13 ? '#8a5038' : '#a0603e');
    }
  },
  boulderFar(R) { blob(R, 0, -5, 8, 5, '#8a4e38'); blob(R, -1, -6, 7, 4, '#a8644a'); },
  house(R) {
    R(-12, -14, 24, 14, '#c8b090'); for (let x = -11; x < 12; x += 3) R(x, -13, 1, 13, '#b09a78');
    for (let k = 0; k < 6; k++) R(-13 + k * 2, -15 - k, 26 - k * 4, 1, '#6a3a2a');
    R(-8, -10, 5, 5, '#3a2a20'); R(3, -9, 5, 9, '#5a3a20'); R(6, -22, 3, 6, '#7a4a3a');
  },
  waterTower(R) {
    const l = '#5a3a20';
    for (const x of [-7, 6]) R(x, -18, 2, 18, l); limb(R, -6, -4, 6, -14, 1, l); limb(R, 6, -4, -6, -14, 1, l);
    R(-9, -30, 18, 12, '#7a5a3a'); for (let x = -8; x < 9; x += 3) R(x, -30, 1, 12, '#5a3a20');
    R(-9, -27, 18, 1, '#4a4f58'); R(-9, -21, 18, 1, '#4a4f58');
    for (let k = 0; k < 5; k++) R(-9 + k * 2, -31 - k, 18 - k * 4, 1, '#6a3a1a');
  },
  fenceFar(R) { for (let x = -15; x <= 15; x += 6) R(x, -8, 1, 8, '#6a4a30'); R(-15, -7, 31, 1, '#8a6a48'); R(-15, -4, 31, 1, '#8a6a48'); },
  pole(R) { R(-1, -30, 2, 30, '#5a3a20'); R(-6, -28, 12, 1, '#5a3a20'); R(-5, -29, 1, 1, '#c8c8d0'); R(4, -29, 1, 1, '#c8c8d0'); },
};

const FLAT_DRAW = {
  pebbles(R, c) { R(0, 0, 2, 1, c[2]); R(3, -1, 1, 1, c[1]); R(-2, -1, 1, 1, c[2]); },
  tuft(R) { R(-1, -2, 1, 2, '#6a7a30'); R(1, -2, 1, 2, '#6a7a30'); R(0, -3, 1, 3, '#7a8a3a'); },
  grass(R) { R(-2, -3, 1, 3, '#5a7a2a'); R(0, -4, 1, 4, '#6a8a32'); R(2, -3, 1, 3, '#5a7a2a'); R(1, -2, 1, 2, '#7a9a3a'); },
  bones(R) { R(-2, 0, 5, 1, '#e8e0d0'); R(-3, -1, 1, 1, '#e8e0d0'); R(-3, 1, 1, 1, '#e8e0d0'); R(3, -1, 1, 1, '#e8e0d0'); R(3, 1, 1, 1, '#e8e0d0'); },
  crack(R, c) { R(-4, 0, 3, 1, c[1]); R(-1, -1, 3, 1, c[1]); R(2, 0, 3, 1, c[1]); },
  flowersY(R) { FLAT_DRAW.tuft(R); R(-1, -3, 1, 1, '#f8d040'); R(1, -4, 1, 1, '#f8d040'); },
  flowersP(R) { FLAT_DRAW.tuft(R); R(-1, -3, 1, 1, '#b070c0'); R(1, -4, 1, 1, '#d090e0'); },
  redStones(R) { R(0, 0, 2, 1, '#8a4a30'); R(3, 0, 1, 1, '#a8584a'); },
  rut(R, c) { R(-8, 0, 16, 1, c[1]); R(-8, 3, 16, 1, c[1]); },
};

const FORE_DRAW = {
  fGrass(R) { for (const [x, h] of [[-5, 10], [-3, 14], [-1, 9], [1, 15], [3, 11], [5, 8]]) limb(R, x, 0, x + (x > 0 ? 2 : -1), -h, 1, x % 2 ? '#4a5a24' : '#5a6a2a'); },
  fFlowers(R) { FORE_DRAW.fGrass(R); R(1, -16, 2, 2, '#f8d040'); R(-3, -15, 2, 2, '#e07040'); },
  fCactus(R) { blob(R, 0, -7, 6, 7, '#2e5228'); blob(R, 0, -8, 5, 6, '#3e6a30'); for (let y = -13; y < 0; y += 3) R(-1, y, 1, 1, '#a8c878'); R(-1, -15, 2, 2, '#e05878'); },
  fRock(R) { blob(R, 0, -5, 10, 5, '#4a3e34'); blob(R, -1, -6, 9, 4, '#6a5a48'); R(-5, -9, 6, 1, '#8a7a64'); },
  fDeadBush(R) { const c = '#5a4030'; limb(R, 0, 0, -6, -10, 1, c); limb(R, 0, 0, 5, -12, 1, c); limb(R, 0, 0, 1, -14, 1, c); limb(R, -3, -5, -7, -6, 1, c); limb(R, 3, -7, 7, -9, 1, c); },
  fFence(R) { R(-2, -18, 4, 18, '#4a3420'); R(-2, -18, 4, 1, '#6a4a30'); R(-10, -14, 8, 2, '#5a4028'); R(2, -14, 8, 2, '#5a4028'); R(-10, -7, 8, 2, '#5a4028'); R(2, -7, 8, 2, '#5a4028'); },
};

const propSprite = (k) => cached(`p${k}`, () => sprite(44, 40, 22, 38, PROP_DRAW[k]));
const foreSprite = (k) => cached(`f${k}`, () => sprite(30, 24, 15, 22, FORE_DRAW[k]));
const flatSprite = (k, biome) => cached(`d${k}${biome}`, () => rawSprite(20, 8, 10, 5, (R) => FLAT_DRAW[k](R, BIOMES[biome].specks)));

function ditherBands(ctx, x, y, w, h, cols) {
  const bh = h / cols.length;
  cols.forEach((c, i) => {
    ctx.fillStyle = c;
    ctx.fillRect(x, Math.round(y + i * bh), w, Math.ceil(bh) + 1);
    if (i === 0) return;
    const yy = Math.round(y + i * bh);
    ctx.fillStyle = cols[i - 1];
    for (let xx = x; xx < x + w; xx += 2) { ctx.fillRect(xx, yy, 1, 1); ctx.fillRect(xx + 1, yy + 2, 1, 1); }
  });
}

// Ciel de la prairie selon l'ambiance (bleu par beau temps)
const SKIES = new Map();
function skyFor(env) {
  let sky = SKIES.get(env.id);
  if (sky) return sky;
  sky = S.makeCanvas(W, HORIZON);
  const sx = sky.getContext('2d');
  ditherBands(sx, 0, 0, W, HORIZON, env.sky || ['#6a9ad0', '#78a6d8', '#88b2dc', '#9cbedc', '#b4ccd8', '#ccdad2', '#e2e2c4']);
  if (env.sky) skyDeco(env, 0.23, 0.26)(sx, 0, 0, W, HORIZON);
  else { S.disc(sx, 88, 26, 18, '#fbecc4'); S.disc(sx, 88, 26, 16, '#fdf6e0'); }
  SKIES.set(env.id, sky);
  return sky;
}

// Couches lointaines d'une région (montagnes, collines) et texture de son sol, faites une fois.
const LAYERS = {};
function biomeLayers(id) {
  if (LAYERS[id]) return LAYERS[id];
  const B = BIOMES[id];
  const ridge = (cols, fn, deco) => {
    const c = S.makeCanvas(512, 60);
    const x = c.getContext('2d');
    for (let i = 0; i < 512; i++) {
      const h = Math.round(fn(i));
      x.fillStyle = cols[0];
      x.fillRect(i, 60 - h, 1, h);
      x.fillStyle = cols[1];
      if ((i + h) % 3 === 0) x.fillRect(i, 60 - h + 1, 1, 1);
    }
    deco?.(x);
    return c;
  };
  const shapes = {
    desert: [(i) => 4 + 24 * tri(i / 512 + 0.2) ** 2 + 11 * tri(i / 128 + 0.4) ** 2 + 3 * tri(i / 64), (i) => 3 + 7 * tri(i / 256 + 0.7) ** 3 + 3 * tri(i / 64 + 0.1) ** 2],
    prairie: [(i) => 6 + 14 * tri(i / 512 + 0.6) ** 2 + 6 * tri(i / 128) ** 2, (i) => 4 + 9 * tri(i / 256 + 0.3) ** 2 + 3 * tri(i / 128 + 0.5)],
    // mesas à sommet plat
    canyon: [(i) => 6 + Math.min(30, 44 * tri(i / 256 + 0.15) ** 1.2) + 2 * tri(i / 32), (i) => 3 + Math.min(16, 26 * tri(i / 128 + 0.4) ** 2)],
    ranch: [(i) => 5 + 12 * tri(i / 512 + 0.35) ** 2 + 5 * tri(i / 128 + 0.2) ** 2, (i) => 3 + 6 * tri(i / 256 + 0.8) ** 2 + 2 * tri(i / 64)],
  }[id];
  const far = ridge(B.far, shapes[0]);
  const mid = ridge(B.mid, shapes[1], (x) => {
    // petits détails sur la ligne des collines
    for (const cx of [40, 150, 270, 410, 480]) {
      x.fillStyle = S.shade(B.mid[0], -0.25);
      if (id === 'desert') { x.fillRect(cx, 48, 1, 6); x.fillRect(cx - 2, 50, 2, 1); x.fillRect(cx + 1, 49, 2, 1); }
      else if (id === 'prairie' || id === 'ranch') { x.fillRect(cx, 52, 1, 4); x.fillRect(cx - 2, 49, 5, 3); }
    }
  });
  // texture du sol (raccord gauche/droite) avec traînées dans le sens du défilement
  const gh = H - HORIZON;
  const ground = S.makeCanvas(W, gh);
  const g = ground.getContext('2d');
  ditherBands(g, 0, 0, W, gh, B.ground);
  let s = id.length * 977 + 13;
  const r = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  const put = (px, py, w, h, col) => { g.fillStyle = col; g.fillRect(px, py, w, h); g.fillRect(px - W, py, w, h); };
  for (let i = 0; i < 520; i++) {
    const py = Math.floor(r() * gh), px = Math.floor(r() * W), k = r();
    const near = py / gh;
    if (k < 0.18) put(px, py, 3 + Math.floor(near * 10), 1, B.streak);
    else if (k < 0.6) put(px, py, 1 + (near > 0.5 ? 1 : 0), 1, B.specks[0]);
    else if (k < 0.85) put(px, py, 1 + (near > 0.6 ? 1 : 0), 1, B.specks[1]);
    else put(px, py, 2, 1, B.specks[2]);
  }
  return (LAYERS[id] = { far, mid, ground });
}

// ------------------------------------------------------------ scène
export class LassoScene extends MiniScene {
  constructor(canvas, hooks) {
    super(canvas, hooks);
    this.kind = 'lasso';
    this.showEnv = true;
    this.cv.style.cursor = 'none';
    this.world = null;
    this.tw = { x: -40, y: 160 };
    this.deco = { props: [], flat: [], fore: [], poles: [] };
  }

  title() { return 'RODÉO AU LASSO'; }
  variantName() { return LASSO_BIOME_NAMES[this.state?.variant] || null; }
  help() {
    return [
      this.touch ? 'STICK : DIRIGER LE CHEVAL' : 'ZQSD OU FLÈCHES : DIRIGER LE CHEVAL',
      this.touch ? 'TOUCHE UNE BÊTE : LANCER LE LASSO' : 'SOURIS : VISER - CLIC : LANCER LE LASSO',
      'POULE 1 - COCHON 2 - MOUTON 2 - CHÈVRE 2',
      'VACHE 3 - LIÈVRE 4 - MUSTANG 5',
      'TAUREAU D\'OR 10 - MOUFFETTE -3',
      this.touch ? 'BOUTON LASSO DORÉ : X2, RATÉ -2' : 'CLIC DROIT OU E : LASSO DORÉ (X2, RATÉ -2)',
    ];
  }
  goText() { return 'YEE-HAW !'; }

  setup(seed) {
    this.world = lassoWorld(seed, this.n, this.state.variant);
    this.caught = new Map(); // id -> { by, at }
    this.pend = new Set();
    this.hitObs = new Set();
    this.hitHerd = new Set();
    this.twSeen = new Set(); // événements déjà annoncés
    this.banner = null;
    this.gold = []; // éclats dorés de la ruée vers l'or
    this.wasGiant = false;
    const s = lassoStart(this.me, this.n);
    this.my = { x: s.x, y: s.y, stumbleUntil: -1e9, stinkUntil: -1e9, cd: 0, throw: null, throws: 0, caught: 0, bet: false };
    this.remote = {};
    for (let i = 0; i < this.n; i++) {
      if (i === this.me) continue;
      const p = lassoStart(i, this.n);
      this.remote[i] = { x: p.x, y: p.y, tx: p.x, ty: p.y, throw: null, stinkUntil: -1e9 };
    }
    this.riders = this.state.players.map((p, i) => riderLook(p.character, this.color(i), `${i}:${JSON.stringify(p.character || {})}`));
    forgetRiders(this.riders);
    this.buildDecor(seed);
  }

  // Décor qui défile : même graine pour toute la table, donc même paysage pour tout le monde.
  buildDecor(seed) {
    const R = rng((seed ^ 0x9e3779b9) >>> 0);
    const pick = (a) => a[Math.floor(R() * a.length)];
    const biomes = this.world.biomes;
    const end = MODES.lasso.duration + 3000;
    const make = (from, gap, yr, kindOf, speedK = 1) => {
      const list = [];
      for (let ts = from; ts < end; ts += gap[0] + R() * (gap[1] - gap[0])) {
        const y = yr[0] + Math.floor(R() * (yr[1] - yr[0]));
        const b = biomeAt(biomes, ts).id;
        const k = kindOf(BIOMES[b], b);
        if (k) list.push({ ts, y, k, b, v: groundSpeed(y) * speedK, flip: R() < 0.5 });
      }
      return list;
    };
    this.deco = {
      props: make(-16000, [500, 1300], [101, 113], (B, b) => (b === 'ranch' && R() < 0.35 ? null : pick(B.props))),
      flat: make(-6000, [70, 170], [114, 214], (B) => pick(B.flat)),
      fore: make(-4000, [700, 1700], [218, 224], (B) => pick(B.fore), 1.25),
      poles: [],
    };
    this.deco.props.sort((a, b) => a.y - b.y);
    this.deco.flat.sort((a, b) => a.y - b.y);
    // poteaux télégraphiques réguliers au ranch, reliés par des fils
    const ranch = biomes.find((b) => b.id === 'ranch');
    if (ranch) {
      const next = biomes[biomes.indexOf(ranch) + 1];
      for (let ts = Math.max(-16000, ranch.at); ts < (next ? next.at : end); ts += 1150) this.deco.poles.push({ ts, y: 105, v: groundSpeed(105) });
      this.train = { at: Math.max(0, ranch.at) + 1500 };
    } else this.train = null;
  }

  applySync(st) {
    for (const [id, by] of st.claimed || []) this.caught.set(id, { by, at: -1e9 });
  }

  horse(i) { return i === this.me ? this.my : this.remote[i]; }

  // lasso géant : le dernier, avec au moins 5 pts de retard sur le premier
  giant(i) { return !!this.state && lassoTrailing(this.state.players, i); }
  range() { return LASSO.range + (this.giant(this.me) ? LASSO_CATCHUP.range : 0); }

  // ---------------------------------------------------------- entrées
  onFire(m) {
    const me = this.my;
    const t = this.t;
    if (!this.playing) return;
    if (me.throw || t < me.cd || t < me.stumbleUntil || t < me.stinkUntil) { sfx('dry'); return; }
    const h = lassoHand(me.x, me.y);
    let dx = m.x - h.x, dy = m.y - h.y;
    const d = Math.hypot(dx, dy) || 1;
    const dist = Math.min(this.range(), d);
    dx = (dx / d) * dist; dy = (dy / d) * dist;
    const tx = Math.round(h.x + dx), ty = Math.round(h.y + dy);
    me.throw = { tx, ty, t0: t, fly: dist / LASSO.rope, phase: 'out', bet: me.bet };
    me.bet = false;
    me.throws++;
    sfx(me.throw.bet ? 'whip' : 'rope');
    this.sendLive({ x: Math.round(me.x), y: Math.round(me.y), th: [tx, ty], ...(me.throw.bet ? { gb: 1 } : {}) }, true);
  }

  // lasso doré : arme (ou désarme) le prochain lancer
  onAlt() { this.toggleBet(); }
  onKey(k) { if (k === 'e') this.toggleBet(); }
  toggleBet() {
    if (!this.playing) return;
    this.my.bet = !this.my.bet;
    sfx(this.my.bet ? 'coin' : 'click');
  }

  remoteLive(i, d) {
    const r = this.remote[i];
    if (!r) return;
    if (typeof d.x === 'number') r.tx = d.x;
    if (typeof d.y === 'number') r.ty = d.y;
    if (Array.isArray(d.th)) {
      const h = lassoHand(r.x, r.y);
      const dist = Math.hypot(d.th[0] - h.x, d.th[1] - h.y);
      r.throw = { tx: d.th[0], ty: d.th[1], t0: this.t, fly: dist / LASSO.rope, bet: !!d.gb };
    }
  }

  onEvent(ev) {
    if (ev.type === 'catch') {
      const a = this.world.animals[ev.id];
      const p = animalPos(a, this.t);
      this.caught.set(ev.id, { by: ev.by, at: this.t });
      this.pend.delete(ev.id);
      const boost = ev.rush || ev.bet;
      this.popup(p.x, p.y - 26, `${ev.pts > 0 ? '+' : ''}${ev.pts}`, ev.pts > 0 ? (boost ? '#f8d040' : this.color(ev.by)) : '#b8e070', ev.by === this.me || boost);
      if (ev.bet) this.popup(p.x, p.y - 38, 'LASSO DORÉ !', '#f8d040');
      if (boost) this.sparkle(p.x, p.y - a.r, 10);
      if (a.kind === 'skunk') {
        const h = this.horse(ev.by);
        if (h) h.stinkUntil = this.t + 1500;
      }
      if (a.kind === 'outlaw') {
        this.announce(ev.by === this.me ? 'HORS-LA-LOI CAPTURÉ !' : `${this.name(ev.by).toUpperCase()} L'A CAPTURÉ !`, `+${ev.pts} - EL DIABLO N'AURA PAS LE BUTIN`, '#b8e070', 2400);
        sfx('good');
      }
      if (ev.by === this.me) {
        this.my.caught++;
        sfx(CRY[a.kind]);
        if (a.kind === 'goldbull' || boost) sfx('good');
        if (a.kind === 'goldbull' || a.kind === 'outlaw') sfx('hiha', 0.15);
      } else {
        const r = this.remote[ev.by];
        if (r) r.throw = null;
        const th = this.my.throw;
        if (th && th.id === ev.id) { th.phase = 'back'; th.back = this.t; }
      }
    } else if (ev.type === 'betMiss') {
      const h = this.horse(ev.by);
      if (h) this.popup(h.x, h.y - 66, `${ev.pts}`, '#f0705a', ev.by === this.me);
      if (ev.by === this.me) sfx('bad');
    } else if (ev.type === 'steal') {
      if (ev.from >= 0) {
        const h = this.horse(ev.from);
        if (h) this.popup(h.x, h.y - 66, `-${ev.pts}`, '#f0705a', true);
        const who = ev.from === this.me ? 'TOI' : this.name(ev.from).toUpperCase();
        this.announce('LE HORS-LA-LOI S\'ENFUIT !', `IL APPORTE ${ev.pts} PTS DE ${who} À EL DIABLO`, '#f0705a', 2600);
        sfx(ev.from === this.me ? 'bad' : 'revolver');
      } else this.announce('LE HORS-LA-LOI S\'ENFUIT !', 'LES POCHES VIDES : EL DIABLO SERA FURIEUX', '#f0705a', 2200);
    } else if (ev.type === 'left') {
      const r = this.remote[ev.who];
      if (r) r.left = true;
    }
  }

  announce(title, sub, col, ms = 2600) { this.banner = { title, sub, col, t0: this.now, ms }; }

  sparkle(x, y, n) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, v = 0.02 + Math.random() * 0.04;
      this.gold.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 0.02, t: 0, max: 500 + Math.random() * 400 });
    }
  }

  // Événements tirés de la graine : annoncés à l'heure dite, sur tous les écrans à la fois.
  twistUpdate(t) {
    for (const tw of this.world.twists) {
      if (this.twSeen.has(tw) || t < tw.at) continue;
      this.twSeen.add(tw);
      if (t - tw.at > 2500) continue; // reconnexion en cours de partie : on ne rejoue pas l'annonce
      const T = TWISTS[tw.kind];
      this.announce(T.name, T.sub, T.col);
      if (tw.kind === 'rush') { sfx('coin'); sfx('power', 0.15); }
      else if (tw.kind === 'stampede') sfx('thunder');
      else { sfx('revolver'); sfx('neigh', 0.35); }
    }
    const st = this.world.twists.find((e) => e.kind === 'stampede' && t >= e.arrive && t < e.end);
    if (st) this.shake = Math.max(this.shake, 1.6); // le sol tremble
    if (st && !st.heard) { st.heard = true; sfx('moo'); }
    // éclats dorés pendant la ruée vers l'or
    if (lassoRush(this.world, t) && Math.random() < 0.5) {
      this.gold.push({ x: Math.random() * W, y: LASSO.top - 30 + Math.random() * (H - LASSO.top + 30), vx: 0, vy: -0.01, t: 0, max: 700 });
    }
  }

  // le cheval trébuche (obstacle, bête de la stampede)
  stumble(t) {
    const me = this.my;
    me.stumbleUntil = t + 900;
    if (me.throw && me.throw.phase !== 'pull') {
      if (me.throw.phase === 'out' && me.throw.bet) me.bet = true; // pari rendu : le lasso n'est jamais parti
      me.throw = null;
    }
    this.shake = 5;
    sfx('thud');
    this.popup(me.x, me.y - 52, 'AÏE !', '#f0705a');
    this.dust(me.x, me.y, 8);
  }

  // ---------------------------------------------------------- simulation
  update(dt) {
    if (!this.world) return;
    const t = this.t;
    const me = this.my;
    if (this.playing) {
      const k = this.keys;
      let vx = 0, vy = 0;
      if (k.has('arrowup') || k.has('z') || k.has('w')) vy -= 1;
      if (k.has('arrowdown') || k.has('s')) vy += 1;
      if (k.has('arrowleft') || k.has('q') || k.has('a')) vx -= 1;
      if (k.has('arrowright') || k.has('d')) vx += 1;
      const ox = me.x, oy = me.y;
      if (t < me.stumbleUntil) me.x -= 0.03 * dt;
      else {
        me.x += vx * LASSO.horse * 0.8 * dt;
        me.y += vy * LASSO.horse * dt;
      }
      me.x = Math.max(LASSO.minX, Math.min(LASSO.maxX, me.x));
      me.y = Math.max(LASSO.top, Math.min(LASSO.bottom, me.y));
      if (Math.round(ox) !== Math.round(me.x) || Math.round(oy) !== Math.round(me.y)) this.sendLive({ x: Math.round(me.x), y: Math.round(me.y) });
      // obstacles : le cheval trébuche
      this.world.obstacles.forEach((o, i) => {
        if (this.hitObs.has(i) || t < o.t0) return;
        const x = obstacleX(o, t);
        if (Math.abs(x - me.x) < 12 && Math.abs(o.y - me.y) < 6 && t >= me.stumbleUntil) {
          this.hitObs.add(i);
          this.stumble(t);
        }
      });
      // le troupeau de la stampede bouscule le cheval
      for (const tw of this.world.twists) {
        if (tw.kind !== 'stampede' || t < tw.arrive || t > tw.end) continue;
        for (const id of tw.ids) {
          const a = this.world.animals[id];
          if (this.hitHerd.has(id) || this.caught.has(id) || this.pend.has(id) || !animalVisible(a, t)) continue;
          const p = animalPos(a, t);
          if (Math.abs(p.x - me.x) < 14 && Math.abs(p.y - me.y) < 7 && t >= me.stumbleUntil) {
            this.hitHerd.add(id);
            this.stumble(t);
          }
        }
      }
      const giant = this.giant(this.me);
      if (giant && !this.wasGiant) { this.popup(me.x, me.y - 84, 'LASSO GÉANT !', '#b8e070', true); sfx('power'); }
      this.wasGiant = giant;
    }
    this.twistUpdate(t);
    for (const g of this.gold) { g.t += dt; g.x += g.vx * dt; g.y += g.vy * dt; }
    prune(this.gold, (g) => g.t < g.max);
    // lasso du joueur
    const th = me.throw;
    if (th) {
      if (th.phase === 'out' && t >= th.t0 + th.fly) {
        const a = this.catchable(th.tx, th.ty, t);
        if (a) {
          th.phase = 'pull'; th.id = a.id; th.pull = t;
          this.pend.add(a.id);
          this.hooks.send(th.bet ? { kind: 'catch', id: a.id, bet: true } : { kind: 'catch', id: a.id });
        } else {
          th.phase = 'back'; th.back = t;
          if (th.bet) this.hooks.send({ kind: 'miss', bet: true });
        }
      } else if (th.phase === 'pull') {
        const c = this.caught.get(th.id);
        if (c && c.by === this.me && t - c.at >= PULL) { me.throw = null; me.cd = t + 200; }
        else if (!c && t - th.pull > 1500) { this.pend.delete(th.id); th.phase = 'back'; th.back = t; }
      } else if (th.phase === 'back' && t - th.back > 220) { me.throw = null; me.cd = t + 250; }
    }
    // autres cavaliers
    for (const r of Object.values(this.remote)) {
      const k = Math.min(1, dt * 0.012);
      r.x += (r.tx - r.x) * k;
      r.y += (r.ty - r.y) * k;
      if (r.throw && t - r.throw.t0 > r.throw.fly + 260) r.throw = null;
    }
    // poussière des sabots (plus fournie au premier plan)
    this.dustT = (this.dustT || 0) + dt;
    if (this.dustT > 55) {
      this.dustT = 0;
      for (let i = 0; i < this.n; i++) {
        const h = this.horse(i);
        if (h && !h.left) this.dust(h.x - 12, h.y, 1);
      }
    }
    for (const p of this.parts) { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.r += dt * 0.006; }
    prune(this.parts, (p) => p.t < p.max);
    // virevoltant
    this.tw.x -= dt * 0.24;
    if (this.tw.x < -30) { this.tw.x = W + 40 + Math.random() * 300; this.tw.y = 120 + Math.random() * 80; }
  }

  dust(x, y, n) {
    for (let i = 0; i < n; i++) {
      this.parts.push({ x: x + (Math.random() - 0.5) * 6, y: y - 1 - Math.random() * 3, vx: -groundSpeed(y) * (0.5 + Math.random() * 0.3), vy: -0.004 - Math.random() * 0.004, r: 1 + Math.random(), t: 0, max: 450 + Math.random() * 300 });
    }
  }

  catchable(x, y, t) {
    let best = null, bd = 1e9;
    const extra = this.giant(this.me) ? LASSO_CATCHUP.radius : 0;
    for (const a of this.world.animals) {
      if (!animalVisible(a, t) || this.caught.has(a.id) || this.pend.has(a.id)) continue;
      const p = animalPos(a, t);
      const d = Math.hypot(p.x - x, p.y - a.r - y);
      if (d <= a.r + 7 + extra && d < bd) { bd = d; best = a; }
    }
    return best;
  }

  // position affichée d'une bête (traînée vers son cavalier une fois attrapée)
  animalDraw(a, t) {
    const c = this.caught.get(a.id);
    if (!c) {
      const th = this.my.throw;
      if (th && th.phase === 'pull' && th.id === a.id) return this.pulled(a, this.my, th.pull, t);
      return animalVisible(a, t) ? { ...animalPos(a, t), tied: null } : null;
    }
    const h = this.horse(c.by);
    if (!h || t - c.at > PULL) return null;
    const th = c.by === this.me ? this.my.throw : null;
    return this.pulled(a, h, th && th.id === a.id ? th.pull : c.at, t, c.by);
  }

  pulled(a, h, from, t, by = this.me) {
    const p0 = animalPos(a, from);
    const k = Math.min(1, (t - from) / PULL);
    const e = k * k;
    return { x: p0.x + (h.x - 18 - p0.x) * e, y: p0.y + (h.y - p0.y) * e, tied: by, fade: k };
  }

  // ---------------------------------------------------------- rendu du décor
  // temps du décor : continu, même avant le départ (les chevaux galopent déjà pendant le compte à rebours)
  get dt0() { return this.t0 == null ? this.now - 4000 : this.t; }

  drawBackdrop(ctx, tt) {
    const biomes = this.world ? this.world.biomes : [{ id: 'desert', at: -1e9 }];
    const now = this.now;
    // nuages qui dérivent
    for (let i = 0; i < 4; i++) {
      const x = ((((i * 131 + 40) - tt * (0.004 + i * 0.0015)) % (W + 90)) + W + 90) % (W + 90) - 45;
      const y = 14 + i * 11;
      const col = 'rgba(255,250,240,0.75)';
      S.disc(ctx, x, y, 5 + (i % 2) * 2, col); S.disc(ctx, x + 7, y + 1, 4, col); S.disc(ctx, x - 7, y + 2, 3, col);
      ctx.fillStyle = col; ctx.fillRect(Math.round(x - 10), y + 3, 20, 2);
    }
    for (let i = 0; i < 3; i++) {
      const a = now / 6000 + i * 2.3;
      S.vulture(ctx, Math.round(150 + i * 80 + Math.cos(a) * 40), Math.round(20 + i * 6 + Math.sin(a) * 8), now + i * 120);
    }
    // montagnes et collines : fondu enchaîné d'une région à l'autre
    const cur = biomeAt(biomes, tt);
    const prev = biomes[biomes.indexOf(cur) - 1];
    const k = prev ? clamp01((tt - cur.at) / 2500) : 1;
    const strip = (img, speed, y, alpha) => {
      if (alpha <= 0) return;
      ctx.globalAlpha = alpha;
      const off = Math.floor((((tt + 20000) * speed) % img.width + img.width) % img.width);
      ctx.drawImage(img, -off, y);
      ctx.drawImage(img, img.width - off, y);
      ctx.globalAlpha = 1;
    };
    for (const layer of ['far', 'mid']) {
      const sp = layer === 'far' ? 0.005 : 0.016;
      if (prev && k < 1) strip(biomeLayers(prev.id)[layer], sp, HORIZON - 60, 1);
      strip(biomeLayers(cur.id)[layer], sp, HORIZON - 60, k);
    }
    // train à vapeur au loin quand on passe au ranch
    if (this.train && tt > this.train.at && tt < this.train.at + 20000) this.drawTrain(ctx, tt - this.train.at);
  }

  drawTrain(ctx, el) {
    const x0 = -110 + el * 0.03, y = HORIZON - 1;
    ctx.fillStyle = '#2a2622';
    for (let c = 0; c < 4; c++) {
      const x = Math.round(x0 + c * 16);
      ctx.fillRect(x, y - 5, 13, 4); ctx.fillRect(x + 1, y - 1, 2, 1); ctx.fillRect(x + 9, y - 1, 2, 1);
      ctx.fillStyle = '#5a3a2a'; ctx.fillRect(x + 1, y - 4, 11, 1); ctx.fillStyle = '#2a2622';
    }
    const lx = Math.round(x0 + 64);
    ctx.fillRect(lx, y - 6, 14, 5); ctx.fillRect(lx + 2, y - 9, 4, 3); ctx.fillRect(lx + 10, y - 10, 2, 4); ctx.fillRect(lx + 13, y - 2, 3, 1);
    ctx.fillStyle = '#e0b040'; ctx.fillRect(lx + 14, y - 5, 1, 1);
    for (let i = 0; i < 6; i++) {
      const age = ((el / 140 + i) % 6) / 6;
      S.disc(ctx, lx + 11 - age * 26, y - 12 - age * 9, Math.round(1 + age * 3), `rgba(230,226,220,${0.6 * (1 - age)})`);
    }
  }

  // sol en perspective : chaque bande défile à sa vitesse ; une nouvelle région arrive par la droite
  drawGround(ctx, tt) {
    const biomes = this.world ? this.world.biomes : [{ id: 'desert', at: -1e9 }];
    const tex = biomes.map((b) => biomeLayers(b.id).ground);
    for (let y = HORIZON; y < H; y += 2) {
      const v = groundSpeed(y + 1);
      const off = (((tt + 20000) * v) % W + W) % W;
      // segments [début, texture] de gauche à droite
      let segs = [[0, 0]];
      for (let i = 1; i < biomes.length; i++) {
        if (tt < biomes[i].at) break;
        const bx = W - v * (tt - biomes[i].at);
        if (bx <= 0) segs = [[0, i]];
        else segs.push([Math.round(bx), i]);
      }
      for (let s = 0; s < segs.length; s++) {
        const x0 = segs[s][0], x1 = s + 1 < segs.length ? segs[s + 1][0] : W;
        if (x1 > x0) this.blit(ctx, tex[segs[s][1]], x0, x1, y, off);
      }
    }
  }

  blit(ctx, img, x0, x1, y, off) {
    const sy = y - HORIZON;
    let x = x0;
    while (x < x1) {
      const sx = Math.floor((x + off) % W);
      const w = Math.min(x1 - x, W - sx);
      ctx.drawImage(img, sx, sy, w, 2, x, y, w, 2);
      x += w;
    }
  }

  // objets posés au sol qui défilent (x à l'instant tt)
  decoX(d, tt, w = 24) { return W + w - d.v * (tt - d.ts); }

  drawProps(ctx, tt) {
    const now = this.now;
    for (const d of this.deco.props) {
      const x = this.decoX(d, tt);
      if (x < -30 || x > W + 30) continue;
      const spr = propSprite(d.k);
      ctx.drawImage(spr, Math.round(x - spr.ox), Math.round(d.y - spr.oy));
      if (d.k === 'windmill') {
        // les pales tournent
        const hx = Math.round(x), hy = Math.round(d.y - 32);
        ctx.fillStyle = '#d8d0c0';
        for (let b = 0; b < 6; b++) {
          const a = now / 300 + (b * TAU) / 6;
          for (let r = 2; r < 9; r++) ctx.fillRect(Math.round(hx + Math.cos(a) * r), Math.round(hy + Math.sin(a) * r), 1, 1);
        }
        ctx.fillStyle = '#4a4a52'; ctx.fillRect(hx - 1, hy - 1, 2, 2);
      }
    }
    // poteaux télégraphiques et leurs fils
    let last = null;
    for (const p of this.deco.poles) {
      const x = Math.round(this.decoX(p, tt));
      if (x < -140 || x > W + 140) { last = null; continue; }
      const spr = propSprite('pole');
      ctx.drawImage(spr, x - spr.ox, p.y - spr.oy);
      if (last != null) {
        ctx.fillStyle = '#2a1a10';
        for (const dx of [-5, 4]) for (let xx = last + dx; xx < x + dx; xx += 2) {
          const u = (xx - last - dx) / (x - last);
          ctx.fillRect(xx, Math.round(p.y - 29 + Math.sin(u * Math.PI) * 4), 1, 1);
        }
      }
      last = x;
    }
  }

  drawFlat(ctx, tt) {
    for (const d of this.deco.flat) {
      const x = this.decoX(d, tt, 12);
      if (x < -12 || x > W + 12) continue;
      ctx.drawImage(flatSprite(d.k, d.b), Math.round(x - 10), d.y - 5);
    }
  }

  drawFore(ctx, tt) {
    for (const d of this.deco.fore) {
      const x = this.decoX(d, tt, 20);
      if (x < -20 || x > W + 20) continue;
      const spr = foreSprite(d.k);
      ctx.drawImage(spr, Math.round(x - spr.ox), Math.round(d.y - spr.oy));
    }
  }

  // ---------------------------------------------------------- rendu
  render(out) {
    const now = this.now;
    const t = this.t;
    const tt = this.dt0;
    out.drawImage(skyFor(this.amb.env), 0, 0);
    this.amb.sky(out, now);
    // tout le reste du décor passe par le calque teinté de l'ambiance
    const ctx = this.amb.begin(out);
    this.drawBackdrop(ctx, tt);
    this.drawGround(ctx, tt);
    if (!this.world) { this.amb.end(out, now); this.amb.weather(out, now); return; }
    this.drawProps(ctx, tt);
    this.drawFlat(ctx, tt);
    S.tumbleweed(ctx, Math.round(this.tw.x), Math.round(this.tw.y - Math.abs(Math.sin(now / 160)) * 6), now);

    // tout ce qui est au sol, trié par profondeur (kind : 0 obstacle, 1 bête, 2 cheval ; objets réutilisés
    // d'une image à l'autre, tri sur place)
    const items = (this.drawItems ||= []);
    let n = 0;
    const put = (y, kind, ref, x, p) => { const it = (items[n++] ||= { y: 0, kind: 0, ref: null, x: 0, p: null }); it.y = y; it.kind = kind; it.ref = ref; it.x = x; it.p = p; };
    for (const o of this.world.obstacles) {
      if (t < o.t0) continue;
      const x = obstacleX(o, t);
      if (x > -20 && x < W + 20) put(o.y, 0, o, x, null);
    }
    for (const a of this.world.animals) {
      if (t < a.t0 - 50 || t > a.t1 + PULL + 50) continue;
      const p = this.animalDraw(a, t);
      if (!p || p.x < -40 || p.x > W + 40) continue;
      put(p.y, 1, a, 0, p);
    }
    for (let i = 0; i < this.n; i++) {
      const h = this.horse(i);
      if (!h || h.left) continue;
      put(h.y, 2, i, 0, h);
    }
    items.length = n;
    items.sort(byY);
    for (const p of this.parts) S.disc(ctx, p.x, p.y, Math.round(p.r), `rgba(236,220,170,${0.5 * (1 - p.t / p.max)})`);
    for (const it of items) {
      if (it.kind === 0) this.drawAt(ctx, obstacleSprite(it.ref.kind), it.x, it.ref.y);
      else if (it.kind === 1) this.drawAnimal(ctx, it.ref, it.p, now);
      else this.drawHorse(ctx, it.ref, it.p, now, t);
    }
    this.drawFore(ctx, tt);
    this.amb.end(out, now);
    this.amb.weather(out, now);
    this.drawNames(out);

    // cordes et nœuds coulants par-dessus
    for (let i = 0; i < this.n; i++) {
      const h = this.horse(i);
      if (h && !h.left) this.drawLasso(out, i, h, t, now);
    }
    for (const a of this.world.animals) {
      const c = this.caught.get(a.id);
      if (!c || t - c.at > PULL) continue;
      const h = this.horse(c.by);
      const p = this.animalDraw(a, t);
      if (h && p) this.rope(out, lassoHand(h.x, h.y), { x: p.x, y: p.y - a.r }, 0);
    }
    const th = this.my.throw;
    if (th && th.phase === 'pull' && !this.caught.has(th.id)) {
      const a = this.world.animals[th.id];
      const p = this.animalDraw(a, t);
      if (p) this.rope(out, lassoHand(this.my.x, this.my.y), { x: p.x, y: p.y - a.r }, 0, th.bet);
    }

    this.drawTwists(out, t, now);
    this.drawCrosshair(out, t);
  }

  // ---------------------------------------------------------- retournements de situation
  drawTwists(ctx, t, now) {
    // stampede : bande menacée et flèche d'alerte avant l'arrivée du troupeau
    for (const tw of this.world.twists) {
      if (tw.kind !== 'stampede' || t < tw.at || t >= tw.arrive) continue;
      const on = Math.floor(now / 160) % 2;
      ctx.fillStyle = on ? 'rgba(240,112,90,0.16)' : 'rgba(240,112,90,0.07)';
      ctx.fillRect(0, tw.band[0] - 20, W, tw.band[1] - tw.band[0] + 22);
      const cy = Math.round((tw.band[0] + tw.band[1]) / 2) - 9, x = W - 30 - (on ? 2 : 0);
      ctx.fillStyle = OUT;
      for (let k = 0; k < 9; k++) ctx.fillRect(x + k + 1, cy - k + 1, 1, 2 * k + 1);
      ctx.fillRect(x + 9, cy - 3, 14, 7);
      ctx.fillStyle = on ? '#f8d040' : '#f0705a';
      for (let k = 0; k < 9; k++) ctx.fillRect(x + k, cy - k, 1, 2 * k + 1);
      ctx.fillRect(x + 8, cy - 3, 14, 7);
      canvasText(ctx, `${Math.ceil((tw.arrive - t) / 1000)}`, x - 8, cy - 4, { color: '#fdf6e0' });
    }
    // éclats dorés
    for (const g of this.gold) {
      if (Math.floor(g.t / 90) % 3 === 2) continue;
      const x = Math.round(g.x), y = Math.round(g.y);
      ctx.fillStyle = g.t < g.max / 2 ? '#fff6c0' : '#f8d040';
      ctx.fillRect(x, y, 1, 1); ctx.fillRect(x - 1, y, 3, 1); ctx.fillRect(x, y - 1, 1, 3);
    }
    // chrono de la ruée vers l'or
    const rush = this.world.twists.find((e) => e.kind === 'rush' && t >= e.at && t < e.end);
    if (rush) {
      const left = (rush.end - t) / TWISTS.rush.ms;
      ctx.fillStyle = 'rgba(26,15,10,0.6)';
      ctx.fillRect(W / 2 - 62, 3, 124, 16);
      ctx.fillStyle = '#f8d040';
      ctx.fillRect(W / 2 - 60, 16, Math.round(120 * left), 2);
      canvasText(ctx, `RUÉE VERS L'OR X2 - ${Math.ceil((rush.end - t) / 1000)} S`, W / 2, 5, { color: '#f8d040' });
    }
    // bandeau d'annonce
    const b = this.banner;
    if (b) {
      const el = now - b.t0;
      if (el > b.ms) { this.banner = null; return; }
      const k = Math.min(1, el / 180, (b.ms - el) / 300);
      ctx.globalAlpha = Math.max(0, k);
      ctx.fillStyle = 'rgba(26,15,10,0.72)';
      ctx.fillRect(0, 34, W, 34);
      ctx.fillStyle = b.col;
      ctx.fillRect(0, 34, W, 1); ctx.fillRect(0, 67, W, 1);
      canvasText(ctx, b.title, W / 2 + Math.round((1 - k) * 40), 37, { size: 16, color: b.col });
      canvasText(ctx, b.sub, W / 2, 56, { color: '#fdf6e0' });
      ctx.globalAlpha = 1;
    }
  }

  drawAt(ctx, spr, x, y, alpha = 1, shadow = null) {
    ctx.fillStyle = 'rgba(70,50,20,0.28)';
    const w = shadow ?? Math.round(spr.width * 0.4);
    ctx.fillRect(Math.round(x - w / 2), Math.round(y) - 1, w, 2);
    ctx.fillRect(Math.round(x - w / 2) + 1, Math.round(y) - 2, w - 2, 1);
    ctx.globalAlpha = alpha;
    ctx.drawImage(spr, Math.round(x - spr.ox), Math.round(y - spr.oy));
    ctx.globalAlpha = 1;
  }

  drawAnimal(ctx, a, p, now) {
    const A = ANIM[a.kind] || ANIM.cow;
    const tied = p.tied != null;
    // attrapée : elle se débat (pattes qui moulinent, secousses)
    const f = Math.floor((now * (tied ? 2.4 : a.herd ? 1.6 : 1)) / A.ms + a.id * 1.7) % A.n;
    const spr = animalSprite(a.kind, a.v ?? a.id % 4, f);
    const x = p.x + (tied ? Math.round(Math.sin(now / 22)) : 0);
    const blink = p.fade > 0.7 && Math.floor(now / 60) % 2;
    if (!blink) this.drawAt(ctx, spr, x, p.y, 1, A.sh);
    if (a.kind === 'outlaw' && !blink) {
      // foulard sur le nez, sac de butin, et sa prime au-dessus de la tête
      const X = Math.round(x), Y = Math.round(p.y) + (f === 2 ? -1 : 0);
      ctx.fillStyle = '#c8302a'; ctx.fillRect(X - 6, Y - 37, 7, 2); ctx.fillRect(X - 8, Y - 36, 2, 1);
      ctx.fillStyle = OUT; ctx.fillRect(X - 14, Y - 31, 6, 6);
      ctx.fillStyle = '#c8b078'; ctx.fillRect(X - 13, Y - 30, 4, 4);
      ctx.fillStyle = '#5a3a20'; ctx.fillRect(X - 12, Y - 31, 2, 1);
      if (!tied && Math.floor(now / 200) % 2) canvasText(ctx, `+${OUTLAW.pts}`, X - 2, Y - 62, { color: '#f0705a' });
    }
    if (tied && !blink) {
      ctx.fillStyle = '#e8f4ff';
      const k = (now / 300) % 1;
      ctx.fillRect(Math.round(x + 6 + k * 4), Math.round(p.y - a.r * 2 - 4 - k * 4), 1, 2);
      ctx.fillRect(Math.round(x - 4 - k * 4), Math.round(p.y - a.r * 2 - 2 - k * 3), 1, 2);
    }
    if (a.kind === 'goldbull' && !tied) {
      ctx.fillStyle = '#fff6c0';
      for (let k = 0; k < 4; k++) {
        const ph = now / 120 + k * 1.6;
        if (Math.sin(ph * 1.7) > 0.2) {
          const sx = Math.round(p.x + Math.cos(ph) * 16), sy = Math.round(p.y - 13 + Math.sin(ph) * 10);
          ctx.fillRect(sx, sy, 1, 1); ctx.fillRect(sx - 1, sy, 1, 1); ctx.fillRect(sx, sy - 1, 1, 1);
        }
      }
    }
  }

  drawNames(ctx) {
    for (let i = 0; i < this.n; i++) {
      const h = this.horse(i);
      if (!h || h.left) continue;
      canvasText(ctx, i === this.me ? 'TOI' : this.name(i).slice(0, 10).toUpperCase(), h.x - 2, h.y - 60, { size: 8, color: this.color(i) });
      if (this.giant(i)) {
        // badge du lasso géant
        const x = Math.round(h.x - 2), y = Math.round(h.y - 71);
        ctx.fillStyle = OUT; ctx.fillRect(x - 21, y - 1, 42, 10);
        ctx.fillStyle = '#4a6a2a'; ctx.fillRect(x - 20, y, 40, 8);
        canvasText(ctx, 'LASSO XL', x, y, { color: '#d8f0a0' });
      }
    }
  }

  drawHorse(ctx, i, h, now, t) {
    const [coat, mane] = COATS[i % COATS.length];
    const stumble = i === this.me && t < this.my.stumbleUntil;
    const f = stumble ? 2 : Math.floor(now / 85 + i) % 4;
    const spr = horseSprite(coat, mane, f, this.riders[i]);
    const flash = stumble && Math.floor(now / 80) % 2;
    this.drawAt(ctx, spr, h.x, h.y, flash ? 0.5 : 1);
    if (t < h.stinkUntil) {
      for (let k = 0; k < 4; k++) {
        const a = now / 200 + k * 1.6;
        S.disc(ctx, h.x - 2 + Math.cos(a) * 8, h.y - 42 + Math.sin(a * 1.3) * 4, 2, 'rgba(150,190,60,0.6)');
      }
    }
  }

  rope(ctx, a, b, sag, gold = false) {
    const n = Math.max(2, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y)));
    for (let k = 0; k <= n; k++) {
      const u = k / n;
      const x = a.x + (b.x - a.x) * u, y = a.y + (b.y - a.y) * u + Math.sin(u * Math.PI) * sag;
      ctx.fillStyle = gold ? GOLD_ROPE_D : ROPE_D; ctx.fillRect(Math.round(x), Math.round(y) + 1, 1, 1);
      ctx.fillStyle = gold ? GOLD_ROPE : ROPE; ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
    }
  }

  loop(ctx, x, y, rx, ry, step = 1, phase = 0, gold = false) {
    ring(ctx, x, y + 1, rx, ry, gold ? GOLD_ROPE_D : ROPE_D, step, phase);
    ring(ctx, x, y, rx, ry, gold ? GOLD_ROPE : ROPE, step, phase);
  }

  drawLasso(ctx, i, h, t, now) {
    const hand = lassoHand(h.x, h.y);
    const th = i === this.me ? this.my.throw : h.throw;
    const busy = this.state?.players[i] && [...this.caught.values()].some((c) => c.by === i && t - c.at < PULL);
    const big = this.giant(i) ? 1.4 : 1; // lasso géant du dernier
    if (th && th.phase !== 'pull') {
      let k = Math.min(1, (t - th.t0) / th.fly);
      if (th.phase === 'back') k = Math.max(0, 1 - (t - th.back) / 220);
      else if (i !== this.me && t > th.t0 + th.fly) k = Math.max(0, 1 - (t - th.t0 - th.fly) / 260);
      const x = hand.x + (th.tx - hand.x) * k, y = hand.y + (th.ty - hand.y) * k;
      this.rope(ctx, hand, { x, y }, (1 - k) * 6 + 2, th.bet);
      this.loop(ctx, x, y, Math.round(6 * big), Math.round(3 * big), 1, 0, th.bet);
      return;
    }
    if (th || busy) return;
    if (i === this.me && (t < this.my.stumbleUntil || t < this.my.stinkUntil)) return;
    // le lasso tourne au-dessus de la tête (doré quand le pari est armé)
    const gold = i === this.me && this.my.bet;
    const a = now / 90;
    const rx = Math.round(9 * big), cx = hand.x - 2, cy = hand.y - 6;
    this.rope(ctx, hand, { x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * 3 }, 0, gold);
    this.loop(ctx, cx, cy, rx, 3, 2, now / 60, gold);
  }

  drawCrosshair(ctx, t) {
    if (!this.mouse.in || this.t0 == null) return;
    const m = this.mouse;
    const h = lassoHand(this.my.x, this.my.y);
    const far = Math.hypot(m.x - h.x, m.y - h.y) > this.range();
    const ready = !this.my.throw && t >= this.my.cd && t >= this.my.stumbleUntil && t >= this.my.stinkUntil;
    const col = !ready ? '#8a8478' : far ? '#f0a070' : this.my.bet ? GOLD_ROPE : '#fdf6e0';
    if (this.my.bet) canvasText(ctx, 'X2', Math.round(m.x) + 9, Math.round(m.y) + 5, { color: GOLD_ROPE, align: 'left' });
    const x = Math.round(m.x), y = Math.round(m.y);
    const seg = (dx, dy, w, hh) => {
      ctx.fillStyle = '#1a0f0a'; ctx.fillRect(x + dx + 1, y + dy + 1, w, hh);
      ctx.fillStyle = col; ctx.fillRect(x + dx, y + dy, w, hh);
    };
    seg(-10, 0, 5, 1); seg(6, 0, 5, 1); seg(0, -10, 1, 5); seg(0, 6, 1, 5);
    ctx.fillStyle = this.color(this.me);
    ctx.fillRect(x, y, 1, 1);
  }

  hudStats() {
    if (!this.world) return [];
    const t = this.t;
    const fled = this.world.animals.filter((a) => a.t1 < t && !this.caught.has(a.id) && a.kind !== 'skunk' && a.kind !== 'outlaw' && !a.herd).length;
    return [['BÊTES', this.my?.caught || 0, 'yellow'], ['LANCERS', this.my?.throws || 0, 'cream'], ['FUITES', fled, 'salmon']];
  }
}
