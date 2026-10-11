// Combats de « La piste » en vue isométrique : la carte est une maquette posée dans le vide, vue en losanges de
// 32 × 16 pixels du jeu, dessinée en pixels fins (F par pixel du jeu) comme pistebattle.js et pistemap.js : palettes en
// dégradé tramées (tramage ordonné), lumière en haut à gauche, contour sombre d'un pixel fin.
//   - Le sol (avec chemins, rails, eau, berges, ombres portées, grille discrète et l'épaisseur de terrain au bord de la
//     carte) est rendu colonne par colonne comme un relief (lancer de rayons « voxel » d'avant en arrière), par
//     morceaux de 64 × 64 pixels du jeu calculés à la demande et gardés dans un cache à mémoire bornée.
//   - Les murs (rochers, parois, murs d'adobe, de planches, façades) sont un champ de hauteur continu : chaque case
//     ne garde que les pixels de relief qui lui appartiennent, si bien que les cases voisines forment une seule masse
//     (pas une pile de cubes) tout en restant triables une à une avec les personnages.
//   - Les objets (caisses, tonneaux, wagonnets, tables, comptoir, barrières, poteaux, cactus, sapins, arbres) sont de
//     petits volumes décrits par des colonnes pleines, rendus de la même façon, en variantes gardées en cache.
// À chaque image : morceaux de sol, reflets de l'eau, volumes et personnages triés en profondeur, voiles (portée,
// brouillard, noir de la mine). Aucune lecture de pixels ni dégradé par image.
import * as S from './sprites.js';
import { W, H } from './worlds.js';
import { DECO } from './pistemaps.js';

export const TW = 32, TH = 16, WALLH = 18;
const F = 4; // pixels fins par pixel du jeu
const HW = TW / 2, HH = TH / 2;
const DEPTH = 14; // épaisseur de la maquette sous le sol (bords de la carte)
const HMAX = 30; // plus haut volume possible (parois du canyon, arbres)
const PAD = 10;
const CHUNK = 32; // morceau de sol : 32 × 32 pixels du jeu (petit : on en prépare un ou deux par image sans à-coup)
const DS = 1 / 32; // pas du rayon : un pixel fin de hauteur
const BUDGET = 15 * 1024 * 1024; // mémoire du cache des morceaux de sol et des murs

// codes des cases (les mêmes que CELL de pistemaps.js / C de brawlkit.js)
const K = { FLOOR: 0, PATH: 1, WALL: 2, CRATE: 3, BUSH: 4, WATER: 5, CHEST: 6, SAND: 7, VOID: 8, TABLE: 9, COUNTER: 10, RAIL: 11, FENCE: 12, PILLAR: 13 };
const VOLUME = new Uint8Array(16);
for (const t of [K.WALL, K.CRATE, K.BUSH, K.CHEST, K.SAND, K.TABLE, K.COUNTER, K.FENCE, K.PILLAR]) VOLUME[t] = 1;

// ------------------------------------------------------------ couleurs (entiers RGBA, octets dans l'ordre R G B A)
const pack = (r, g, b, a = 255) => ((a << 24) | (b << 16) | (g << 8) | r) >>> 0;
const hex = (h) => { const n = parseInt(h, 16); return pack(n >> 16, (n >> 8) & 255, n & 255); };
const ramp = (s) => s.split(' ').map(hex);
const scale = (p, k) => pack(Math.min(255, (p & 255) * k) | 0, Math.min(255, ((p >>> 8) & 255) * k) | 0, Math.min(255, ((p >>> 16) & 255) * k) | 0);
const blend = (p, q, t) => {
  const c = (s) => { const a = (p >>> s) & 255; return (a + (((q >>> s) & 255) - a) * t) | 0; };
  return pack(c(0), c(8), c(16));
};
const OUTC = hex('1a0f0a');
const WHITE = hex('ffffff');

// ------------------------------------------------------------ bruit et tramage
const hsh = (x, y, s) => {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(s | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
function vnoise(x, y, s) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hsh(xi, yi, s), b = hsh(xi + 1, yi, s), c = hsh(xi, yi + 1, s), d = hsh(xi + 1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, y, s, oct) {
  let t = 0, amp = 0.5, f = 1, n = 0;
  for (let i = 0; i < oct; i++) { t += vnoise(x * f, y * f, s + i * 7919) * amp; n += amp; amp *= 0.5; f *= 2.03; }
  return t / n;
}
const BAY = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
const bay = (x, y) => BAY[((y & 3) << 2) | (x & 3)];
const P = (R, l) => R[l < 0 ? 0 : l >= R.length ? R.length - 1 : l | 0];
const pickc = (R, l, x, y) => P(R, l + bay(x, y) - 0.5);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const fract = (v) => v - Math.floor(v);

// la lumière vient d'en haut à gauche de l'écran ; +A (ou +U) descend vers la droite, +B (ou +V) vers la gauche
const LX = -0.6, LY = 0.32, LZ = 0.73;
const lit = (nx, ny, nz) => {
  const l = Math.hypot(nx, ny, nz) || 1;
  const d = (nx * LX + ny * LY + nz * LZ) / l;
  return d > 0 ? d : 0;
};

// champ de bruit précalculé en coordonnées de cases (res points par case, marge de 3 cases), lu en bilinéaire
function gridField(w, h, res, fn) {
  const gw = (w + 6) * res + 2, gh = (h + 6) * res + 2, a = new Float32Array(gw * gh);
  for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) a[j * gw + i] = fn(i / res - 3, j / res - 3);
  return (U, V) => {
    let u = (U + 3) * res, v = (V + 3) * res;
    if (u < 0) u = 0; else if (u > gw - 2) u = gw - 2;
    if (v < 0) v = 0; else if (v > gh - 2) v = gh - 2;
    const i = u | 0, j = v | 0, fx = u - i, fy = v - j, k = j * gw + i;
    const a0 = a[k] + (a[k + 1] - a[k]) * fx, a1 = a[k + gw] + (a[k + gw + 1] - a[k + gw]) * fx;
    return a0 + (a1 - a0) * fy;
  };
}

// trois champs de bruit entrelacés (une seule interpolation pour les trois) : fn(u, v, out) remplit out[0..2] ;
// le lecteur (U, V, out) remplit out
function gridField3(w, h, res, fn) {
  const gw = (w + 6) * res + 2, gh = (h + 6) * res + 2, a = new Float32Array(gw * gh * 3), t = [0, 0, 0];
  for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) { fn(i / res - 3, j / res - 3, t); a.set(t, (j * gw + i) * 3); }
  return (U, V, out) => {
    let u = (U + 3) * res, v = (V + 3) * res;
    if (u < 0) u = 0; else if (u > gw - 2) u = gw - 2;
    if (v < 0) v = 0; else if (v > gh - 2) v = gh - 2;
    const i = u | 0, j = v | 0, fx = u - i, fy = v - j, k = (j * gw + i) * 3, k2 = k + gw * 3;
    const w00 = (1 - fx) * (1 - fy), w10 = fx * (1 - fy), w01 = (1 - fx) * fy, w11 = fx * fy;
    out[0] = a[k] * w00 + a[k + 3] * w10 + a[k2] * w01 + a[k2 + 3] * w11;
    out[1] = a[k + 1] * w00 + a[k + 4] * w10 + a[k2 + 1] * w01 + a[k2 + 4] * w11;
    out[2] = a[k + 2] * w00 + a[k + 5] * w10 + a[k2 + 2] * w01 + a[k2 + 5] * w11;
  };
}

// distance (en cases) du point (a, b) d'une case au bord des voisines « autres » ; m : masque des voisines autres
// (1 ouest, 2 est, 4 nord, 8 sud, 16 nord-ouest, 32 nord-est, 64 sud-ouest, 128 sud-est), coins saillants arrondis
function edgeD(m, a, b, r = 0.25, rc = 0) {
  let d = 9;
  if (m & 1) d = a < d ? a : d;
  if (m & 2) d = Math.min(d, 1 - a);
  if (m & 4) d = Math.min(d, b);
  if (m & 8) d = Math.min(d, 1 - b);
  // coins rentrants (seule la diagonale est autre) : arrondis de rc (les marches d'une rivière en biais s'adoucissent)
  if (!(m & 5) && m & 16) d = Math.min(d, Math.hypot(a, b) - rc);
  if (!(m & 6) && m & 32) d = Math.min(d, Math.hypot(1 - a, b) - rc);
  if (!(m & 9) && m & 64) d = Math.min(d, Math.hypot(a, 1 - b) - rc);
  if (!(m & 10) && m & 128) d = Math.min(d, Math.hypot(1 - a, 1 - b) - rc);
  if (r > 0) {
    if ((m & 5) === 5 && a < r && b < r) d = Math.min(d, r - Math.hypot(r - a, r - b));
    if ((m & 6) === 6 && 1 - a < r && b < r) d = Math.min(d, r - Math.hypot(r - 1 + a, r - b));
    if ((m & 9) === 9 && a < r && 1 - b < r) d = Math.min(d, r - Math.hypot(r - a, r - 1 + b));
    if ((m & 10) === 10 && 1 - a < r && 1 - b < r) d = Math.min(d, r - Math.hypot(r - 1 + a, r - 1 + b));
  }
  return d;
}

// ------------------------------------------------------------ palettes communes
const WOOD = ramp('2e1c10 4a2e18 6a4424 8a5c32 a8743e c48e52 d8a668');
const DWOOD = ramp('1e100a 2e1a10 422616 5a3420 74452a 8e5a36');
const GREYW = ramp('3a3630 524c44 6c645a 8a8276 a8a092 c4bcae');
const CANVAS = ramp('4a3e28 6a5a3c 8a7652 a8946a c4b088 dccaa4');
const IRON = ramp('16161a 26262c 3a3a42 54545e 72727e 9a9aa6 c8c8d2');
const RED = ramp('3a0e08 5e1a10 862818 ac3a20 c8502a e07040');
const SNOWR = ramp('7e90b0 a0b2cc c0cee2 dae4f0 eef3fa fbfdff');
const STRAW = ramp('5a4418 7a5e22 9a7a2e b8963c d0b052 e4ca70 f2e09a');
const TERRA = ramp('4a1c10 6e2c18 8e3e22 ac522c c46838 d8844a');
const BRASS = ramp('4a3410 7a5a1c a8822c d0aa48 f0d47a fff0b8');
const CACT = ramp('10241a 183622 224a2c 2e6036 427a44 5e9656 82b06e');
const PINE = ramp('061210 0c1e18 122a20 1a3a28 245032 30643e 3e7a4a');
const LEAF = ramp('0e2010 16301a 1e4222 2a5630 3a6c3a 4e8448 66a058');
const BARK = ramp('1e120a 2e1c10 42281a 5a3a24 704a30');
const STUCCO = ramp('6a4a32 8a6446 a8805c c09c74 d4b48c e4caa4 f0dcbc');
const BRICK = ramp('3a1a10 5a2a18 7a3c22 965030 ae6640');
const GLASS = ramp('0e1620 182636 26405a 3a5e80 6a90b0 b8d8ec');
const FLOWERS = ['f4f0e0', 'f0d040', 'd060a0', '8090e0', 'e87040'].map(hex);

// ------------------------------------------------------------ les thèmes
// floor / path : sol et chemin (lv : niveau moyen dans la palette, amp : ampleur des taches, grain : grain fin) ;
// water : l'eau ; cliff : l'épaisseur de terrain au bord de la maquette (lip : herbe ou neige qui déborde) ;
// wall : les murs (kind : rock | mine | adobe | saloon | facade ; h : hauteur, hv : variation, r : arrondi des bords,
// wob : bords irréguliers, bump : bosses du dessus, terrace : paliers) ; props : variantes d'objets du thème
const THEMES = {
  desert: {
    back: '#1c120c',
    floor: ramp('8a6236 a47a44 b88c52 c89c5e d6ab6a e2ba7a ecc98c f4d8a0'), lv: 4.1, amp: 1.7, grain: 0.7,
    path: ramp('6e4c2c 86603a 9c7246 b08654 c29a64 d0aa74'), plv: 2.6,
    water: ramp('123c44 1a5058 246868 348080 4c9a92 74b8a8 b0dccc'),
    cliff: ramp('2a140a 42220e 5a3218 744424 8e5832 a86c40 c08450'), strata: 3.4,
    wall: { kind: 'rock', h: 18, hv: 6, r: 0.15, wob: 0.18, bump: 2.4, corner: 0.3,
      top: ramp('6a3a1e 864e2a a0663a b88050 cc9862 deb078 ecc890'), side: ramp('2e170c 44220f 5c3018 764022 90542e a86a3c c08450'), strata: 4.6, streak: true },
    deco: ['pebble', 'pebble', 'crack', 'tuft', 'skull', 'pebble', 'twig'],
    bush: 'sage', crate: ['crate', 'barrel', 'crate'], pillar: 'saguaro', fence: 'rail',
  },
  canyon: {
    back: '#1a0c08',
    floor: ramp('4e2414 64301a 7a3c22 8e4a2a a05834 b26840 c27a4e d08c5e'), lv: 3.9, amp: 1.8, grain: 0.8,
    path: ramp('6a4028 845234 9c6640 b27a50 c48c60 d29c70'), plv: 2.6,
    water: ramp('10303c 18444e 225a62 2e7276 46908c 6eb0a4 a8d4c4'),
    cliff: ramp('220a06 3a140a 54200e 6e2e14 8a3e1c a4522a bc6838'), strata: 2.6,
    wall: { kind: 'rock', h: 21, hv: 2.4, r: 0.24, wob: 0.13, bump: 0.5, corner: 0.22, terrace: 6,
      top: ramp('5a2412 7a3418 984420 b4582a c87036 da8c4c e8aa6a'), side: ramp('260c06 3c160a 561f0e 702a14 8c381c a64a26 be6234'), strata: 2.5,
      bands: [ramp('2a0e06 461a0c 622610 7e3418 9a4420 b65a2c ca7040'), ramp('3c1c10 5a2c18 784024 965432 b06a40 c88252 dc9a68'), ramp('4a2a1a 6a4028 8a5636 a87046 c28a5c d8a476 e8c094')] },
    deco: ['pebble', 'stone', 'crack', 'pebble', 'crack', 'tuft'],
    bush: 'scrub', crate: ['crate', 'barrel'], pillar: 'hoodoo', fence: 'rail',
  },
  prairie: {
    back: '#101a0c',
    floor: ramp('2a4c1a 38621e 4a7826 5e8e2e 6e9c36 80aa40 94b84e a8c862'), lv: 3.7, amp: 1.7, grain: 1.0,
    path: ramp('5a3e22 74522e 8e6a3c a8844e c0a066 d0b47c'), plv: 2.6,
    water: ramp('10304e 163e62 1e507a 2a6890 4486ac 6aa8c8 aad6e8'),
    cliff: ramp('1e1208 32200e 4a3018 624024 7a5232 92663e'), lip: ramp('1e3814 2e5218 406a20 568428 6e9c34'), strata: 4,
    wall: { kind: 'rock', h: 17, hv: 6, r: 0.24, wob: 0.18, bump: 2.6, corner: 0.36, moss: ramp('1e3814 2e5218 406a20 568428 6e9c34 86b048'),
      top: ramp('3a3a42 50505a 686872 82828c 9c9ca6 b6b6be d0d0d6'), side: ramp('1a1a20 26262e 34343e 44444e 56565f 6a6a74 80808a') },
    deco: ['tuft', 'flower', 'tuft', 'flower', 'pebble', 'tuft'],
    bush: 'grass', crate: ['hay', 'crate', 'hay'], pillar: 'pole', fence: 'rail',
  },
  foret: {
    back: '#0a120a',
    floor: ramp('1a2a18 22361e 2c4424 36522a 426030 506e38 5e7c42 6e8c4e'), lv: 3.4, amp: 1.8, grain: 1.0,
    path: ramp('2e2216 42301e 584228 6e5434 846842 9a7c52'), plv: 2.6,
    water: ramp('0c2232 123044 1a4258 245670 366e88 5a90a8 9ac0d0'),
    cliff: ramp('140c06 22160c 322214 443020 563e2a 6a4e36'), lip: ramp('122414 1a321a 244424 30562c 3e6a34'), strata: 4,
    wall: { kind: 'rock', h: 17, hv: 5, r: 0.22, wob: 0.17, bump: 2.4, corner: 0.34, moss: ramp('16301a 22441e 2e5a24 3e702c 528636 6a9c42'),
      top: ramp('2a2e2a 3a403a 4c544a 60685c 767e70 8c947e a2a88e'), side: ramp('101410 1a201a 262c26 343a32 424a40 525a4e 646c5e') },
    deco: ['needles', 'leaf', 'fern', 'needles', 'mushroom', 'leaf', 'pebble'],
    bush: 'fern', crate: ['logs', 'crate', 'logs'], pillar: 'pine', fence: 'rail', trees: true,
  },
  neige: {
    back: '#0c1018',
    floor: ramp('7a8cac 94a6c2 aebed6 c2d0e4 d2deee e0e8f4 ecf2fa f6f9fd'), lv: 4.6, amp: 1.5, grain: 0.6,
    path: ramp('5a6880 74829a 8c9ab0 a4b0c4 b8c2d4 cad2e0'), plv: 3.0,
    water: ramp('0c1a2c 12263c 1a344e 264662 3a5c78 5a7c96 9ab4c8'),
    ice: ramp('6a8aa8 82a2c0 9ab8d4 b2cce2 cadeee e2eef8'),
    cliff: ramp('141822 20242e 2e323e 3e4250 50566a 666e84'), lip: SNOWR, strata: 4,
    wall: { kind: 'rock', h: 18, hv: 6, r: 0.18, wob: 0.15, bump: 2.4, corner: 0.3, snow: true,
      top: ramp('2a2a34 3c3c48 50505e 666878 7e8296 989cb0'), side: ramp('16161e 22222c 30303c 40404e 52546a 686c84 8288a0') },
    deco: ['sparkle', 'twig', 'sparkle', 'step', 'sparkle'],
    bush: 'snowbush', crate: ['crate', 'barrel'], pillar: 'pine', fence: 'rail', snowy: true,
  },
  mine: {
    back: '#08070a',
    floor: ramp('1c1714 28201a 342a22 42362c 504236 5e4e40 6c5c4c'), lv: 3.2, amp: 1.6, grain: 1.3,
    path: ramp('2a1e14 3a2a1c 4c3826 5e4832 70583e'), plv: 2.6,
    water: ramp('06101a 0a1824 102232 182e42 223c54 345470 5a7c98'),
    cliff: ramp('0a0806 14100c 1e1812 2a2218 362c20 44382a'), strata: 3,
    wall: { kind: 'mine', h: 20, hv: 3, r: 0.1, wob: 0.1, bump: 1.6, corner: 0.18,
      top: ramp('141210 1e1a16 2a241e 383028 463c32 564a3e 665848'), side: ramp('0e0c0a 18140f 241e17 302820 3e342a 4e4236 5e5042') },
    deco: ['gravel', 'pebble', 'ore', 'gravel', 'plank', 'pebble'],
    bush: 'shroom', crate: ['cart', 'crate', 'cart', 'barrel'], pillar: 'etai', fence: 'barricade',
  },
  saloon: {
    back: '#0e0806',
    floor: ramp('3a2214 4c2e1a 5e3a20 704626 82532e 946238 a6724a'), lv: 3.5, amp: 1.0, grain: 0.5,
    path: ramp('3a0c0c 5a1414 7a1c1a 962a22 b03a2c c85238'), plv: 3,
    water: ramp('10202c 18303e 224052 2e566a 4a7488 7a9cb0 b0ccd8'),
    cliff: ramp('140c08 22160e 2e2014 3a2a1a 4a3622 5a442c'), strata: 0, joists: true,
    wall: { kind: 'saloon', h: 20, hv: 0, r: 0, wob: 0, bump: 0, corner: 0,
      top: ramp('120a06 1c120a 28180e 342014 422a1a 503420'), side: ramp('2a160c 3e2212 522e18 663c20 7a4a28 8e5a32 a26c3e') },
    deco: ['nail', 'card', 'nail', 'coin', 'straw'],
    bush: 'pot', crate: ['barrel', 'crate', 'barrel'], pillar: 'post', fence: 'balustre', street: true,
  },
  ville: {
    back: '#140e0a',
    floor: ramp('6a4a2e 7e5a38 926a42 a47a4e b48a5a c29a68 d0aa78'), lv: 3.6, amp: 1.6, grain: 0.8,
    path: ramp('3e2614 54341c 6a4424 80562e 966a3a aa7c48 bc8e58'), plv: 3.4,
    water: ramp('0e2a36 163a48 1e4c5a 2a6270 427e8a 68a0a8 a4ccd0'),
    cliff: ramp('22140a 361f10 4a2c18 5e3a22 72482c 86583a'), strata: 4,
    wall: { kind: 'facade', h: 20, hv: 0, r: 0, wob: 0, bump: 0, corner: 0,
      top: ramp('1e1a1a 2c2626 3c3432 4c423e 5c524c 6c605a'), side: WOOD },
    deco: ['hoof', 'pebble', 'straw', 'hoof', 'crack', 'dung'],
    bush: 'tumble', crate: ['crate', 'barrel', 'trough', 'barrel'], pillar: 'lamp', fence: 'picket', boardwalk: true, street: true,
  },
  hacienda: {
    back: '#180c08',
    floor: TERRA, lv: 3.4, amp: 1.2, grain: 0.6,
    path: ramp('6a6258 827a6e 9a9284 b0a898 c4bcaa d6cebc'), plv: 3,
    water: ramp('0c2a3c 12384e 1a4a62 26607a 3e7c96 64a0b8 a6d0e2'),
    cliff: ramp('2a1208 401c0e 582816 703420 88422a a05436'), strata: 3,
    wall: { kind: 'adobe', h: 17, hv: 0, r: 0.07, wob: 0.025, bump: 0, corner: 0.1,
      top: STUCCO, side: STUCCO },
    deco: ['petal', 'pebble', 'crack', 'leafd', 'petal'],
    bush: 'agave', crate: ['jar', 'crate', 'jar'], pillar: 'column', fence: 'adobe',
  },
};
// hauteur des volumes pour les ombres portées, et leur demi-emprise (en cases)
const VOLH = { [K.CRATE]: [10, 0.34], [K.CHEST]: [10, 0.28], [K.SAND]: [7, 0.44], [K.TABLE]: [7, 0.32], [K.COUNTER]: [11, 0.5], [K.FENCE]: [8, 0.14], [K.PILLAR]: [24, 0.14], [K.BUSH]: [4, 0.3] };

// ------------------------------------------------------------ le sol, pixel par pixel
// q : le pixel (x, y, i : sa case ; t : type de sol ; a, b : position dans la case de 0 à 1 ; U, V : position sur la carte,
// centre des cases aux entiers ; X, Y : pixel fin du monde, pour le tramage ; nb, nm, na : bruits large, moyen, autre ;
// g : grain fin)
function pathOver(v, q, col, T) {
  const e = edgeD(v.mPath[q.i], q.a, q.b, 0.45, 0.18) + (q.nm - 0.5) * 0.22 + (hsh(q.X >> 3, q.Y >> 2, v.seed) - 0.5) * 0.05;
  if (e < 0.03) return col;
  let pl = T.plv + (q.nb - 0.5) * 1.2 + (q.g - 0.5) * 0.6;
  // ornières le long du chemin
  const pd = v.pdir[q.i], au = (pd & 3) && !(pd & 12), av = (pd & 12) && !(pd & 3);
  if (au || av) {
    const cr = Math.abs((au ? q.b : q.a) - 0.5 + (q.nm - 0.5) * 0.06);
    if (Math.abs(cr - 0.2) < 0.03) pl -= 0.9; else if (Math.abs(cr - 0.2) < 0.055) pl += 0.35;
  }
  const pc = pickc(T.path, pl, q.X, q.Y);
  return e < 0.12 ? (bay(q.X, q.Y) < (e - 0.03) / 0.09 ? pc : blend(col, pc, 0.45)) : pc;
}

function waterPix(v, q, T) {
  const e = edgeD(v.mWater[q.i], q.a, q.b, 0.5, 0.2) + (q.nm - 0.5) * 0.12;
  const R = T.water;
  let lv = 4.2 - clamp(e / 0.4, 0, 1) * 2.6 + (q.nb - 0.5) * 0.4;
  const ph = q.V * 4.4 + q.U * 1.5 + Math.sin(q.U * 2.3 + q.nm * 3) * 0.7;
  if (fract(ph) < 0.06 && e > 0.14 && hsh(Math.floor(ph), Math.floor(q.U * 1.6 + q.V * 0.4), v.seed) > 0.72) lv += 1.6;
  if (T.ice && e < 0.13 + (q.nm - 0.5) * 0.08) return pickc(T.ice, 3 + (q.g - 0.5) + (e < 0.04 ? 1.5 : 0), q.X, q.Y);
  if (e < 0.045) lv = R.length - 1.4; // écume au bord
  return pickc(R, lv, q.X, q.Y);
}

// rails : traverses de bois, deux files de fer, ballast ; orientés selon les rails voisins (droits, courbes, croisements)
function railPix(v, q, col) {
  const m = v.mRail[q.i], a = q.a, b = q.b;
  const W = m & 1, E = m & 2, N = m & 4, Sd = m & 8, nu = (W ? 1 : 0) + (E ? 1 : 0), nv = (N ? 1 : 0) + (Sd ? 1 : 0);
  // chaque voie : (écart au milieu de la voie, abscisse le long de la voie)
  let t0 = 9, l0 = 0, t1 = 9, l1 = 0;
  if (nu === 1 && nv === 1) {
    const ca = W ? 0 : 1, cb = N ? 0 : 1;
    t0 = Math.hypot(a - ca, b - cb) - 0.5; l0 = Math.atan2(b - cb, a - ca) * 0.5;
  } else {
    if (nu || !nv) { t0 = b - 0.5; l0 = a; }
    if (nv) { t1 = a - 0.5; l1 = b; }
  }
  let tie = -1, rail = 0, ballast = false;
  for (let k = 0; k < 2; k++) {
    const ac = k ? t1 : t0, al = k ? l1 : l0, aa = Math.abs(ac);
    if (aa > 1) continue;
    if (aa < 0.36) ballast = true;
    const rd = Math.abs(aa - 0.17);
    if (rd < 0.032) { rail = rd < 0.012 ? 2 : 1; break; }
    const tl = al * 3.2 + 0.1;
    if (aa < 0.3 && fract(tl) < 0.36) tie = hsh(Math.floor(tl), q.x * 7 + q.y * 3 + k, v.seed);
  }
  if (rail === 2) return pickc(IRON, 5.4, q.X, q.Y);
  if (rail === 1) return pickc(IRON, 2.4, q.X, q.Y);
  if (tie >= 0) return pickc(WOOD, 2 + tie * 1.4 + (hsh(q.X >> 1, q.Y, v.seed) - 0.5) * 0.8, q.X, q.Y);
  if (ballast) return pickc(GREYW, 1.4 + hsh(q.X >> 1, q.Y >> 1, v.seed + 41) * 2.4, q.X, q.Y);
  return col;
}

const baseLv = (q, T) => T.lv + (q.nb - 0.5) * T.amp + (q.nm - 0.5) * 0.8 + (q.g - 0.5) * T.grain * 0.5;
const LEAFC = ['c8742a', 'a04a1c', 'd8a03a', '8a5a2a'].map(hex);

const GROUND = {
  desert(v, q, T) {
    let lv = baseLv(q, T);
    // rides de sable : crêtes fines éclairées, creux ombrés, par plaques
    const ph = (q.U * 1.15 + q.V * 0.5) * 3.3 + q.nm * 2 + q.nb * 3 + Math.sin(q.V * 1.7 + q.U * 0.6) * 0.35;
    const fr = fract(ph), mk = clamp((q.na - 0.4) * 5, 0, 1);
    if (fr < 0.12) lv += 0.9 * mk; else if (fr < 0.32) lv -= 0.5 * mk;
    return pickc(T.floor, lv, q.X, q.Y);
  },
  canyon(v, q, T) {
    let lv = baseLv(q, T);
    // plaques de boue séchée craquelée, gravillons clairs
    if (q.na > 0.58 && Math.abs(vnoise(q.U * 2.7, q.V * 2.7, v.seed + 5) - 0.5) < 0.03) lv -= 1.5;
    else if (q.na > 0.58) lv += 0.35;
    if (hsh(q.X >> 2, q.Y >> 2, v.seed + 2) > 0.975) lv += 1.4;
    return pickc(T.floor, lv, q.X, q.Y);
  },
  prairie(v, q, T) {
    let lv = baseLv(q, T) + (hsh(q.X, q.Y >> 3, v.seed + 9) - 0.5) * 0.9;
    if (hsh(q.X >> 1, (q.Y + (q.X & 2)) >> 2, v.seed + 3) > 0.94) lv += 1.1; // pointes d'herbe
    if (q.na < 0.3 && bay(q.X, q.Y) < (0.3 - q.na) * 7) return pickc(T.path, T.plv + (q.g - 0.5) + 0.3, q.X, q.Y); // terre nue
    return pickc(T.floor, lv, q.X, q.Y);
  },
  foret(v, q, T) {
    let lv = baseLv(q, T) - 0.3 + (hsh(q.X, q.Y >> 2, v.seed + 9) - 0.5) * 0.6;
    if (q.na > 0.6) lv += Math.min(1.5, (q.na - 0.6) * 6); // taches de soleil sous les arbres
    const lf = hsh(q.X >> 2, q.Y >> 1, v.seed + 13);
    if (lf > 0.986 && q.na < 0.62) return LEAFC[Math.floor((lf - 0.986) * 285) & 3]; // feuilles mortes
    return pickc(T.floor, lv, q.X, q.Y);
  },
  neige(v, q, T) {
    const lv = baseLv(q, T) + Math.sin(((q.U * 0.8 + q.V * 1.2) * 1.6 + q.nm * 2) * 6.283) * 0.3;
    if (q.na < 0.26) {
      // plaques de glace : reflets en biais
      const s = fract((q.U - q.V) * 2.4 + q.nm * 1.5);
      return pickc(T.ice, 2.6 + (q.nb - 0.5) * 1.5 + (s < 0.07 ? 1.6 : 0) + (q.g - 0.5) * 0.4, q.X, q.Y);
    }
    if (hsh(q.X, q.Y, v.seed + 17) > 0.994) return WHITE;
    return pickc(T.floor, lv, q.X, q.Y);
  },
  mine(v, q, T) {
    let lv = baseLv(q, T);
    const gr = hsh(q.X >> 1, q.Y >> 1, v.seed + 21);
    if (gr > 0.9) lv += 1.3; else if (gr < 0.07) lv -= 1.1;
    if (hsh(q.X >> 3, q.Y >> 2, v.seed + 22) > 0.95) lv += 0.8;
    if (q.na > 0.66) lv -= 0.8; // flaques sombres d'humidité
    return pickc(T.floor, lv, q.X, q.Y);
  },
  saloon(v, q, T) {
    // plancher en lattes posées le long de U : joints, veinures, raccords décalés, clous
    const p = (q.V + 0.5) * 4, idx = Math.floor(p), fr = p - idx;
    const su = (q.U + hsh(idx, 7, v.seed) * 3) / 2.5, seg = Math.floor(su), sf = (su - seg) * 2.5;
    let lv = T.lv + (hsh(idx, seg, v.seed) - 0.5) * 1.0 + (vnoise(q.U * 2.2, idx * 3.1, v.seed + 4) - 0.5) * 0.8 + (q.g - 0.5) * 0.3 + (q.nb - 0.5) * 0.7;
    const vein = fract(fr * 2.6 + vnoise(q.U * 1.4, idx, v.seed + 9) * 1.6);
    if (vein < 0.1) lv -= 0.6;
    if (fr < 0.075) lv -= 2.3;
    else if (fr > 0.92) lv += 0.5;
    if (sf < 0.025) lv -= 1.9;
    else if (sf < 0.09 && (Math.abs(fr - 0.3) < 0.07 || Math.abs(fr - 0.72) < 0.07)) lv -= 1.6; // clous
    return pickc(T.floor, lv, q.X, q.Y);
  },
  ville(v, q, T) {
    let lv = baseLv(q, T);
    // terre battue de la grand-rue : sillons des roues, flaques de boue
    const gv = Math.abs(fract(q.V * 0.5 + 0.25 + (q.nb - 0.5) * 0.35) - 0.5);
    if (gv < 0.018) lv -= 0.9; else if (gv < 0.035) lv += 0.35;
    if (q.na > 0.82) {
      // flaque de boue : terre mouillée plus sombre, un reflet de ciel en biais
      const k = (q.na - 0.82) * 14;
      if (k > 1 || bay(q.X, q.Y) < k) return k > 1.2 && fract((q.U - q.V) * 2.5 + q.nm) < 0.08 ? pickc(GLASS, 4, q.X, q.Y) : scale(pickc(T.floor, lv - 1.2, q.X, q.Y), 0.72);
    }
    return pickc(T.floor, lv, q.X, q.Y);
  },
  hacienda(v, q, T) {
    // dallage de tomettes : joints clairs, chaque tomette un peu différente, poussière par endroits
    const ta = q.a * 2, tb = q.b * 2, ti = Math.floor(ta), tj = Math.floor(tb), fa = ta - ti, fb = tb - tj;
    const id = hsh(q.x * 2 + ti, q.y * 2 + tj, v.seed + 3);
    let lv = T.lv + (id - 0.5) * 1.4 + (q.g - 0.5) * 0.4 + (q.nb - 0.5) * 0.6;
    if (fa < 0.07 || fb < 0.07) return pickc(STUCCO, 2.6 + (q.g - 0.5) + (q.nb - 0.5), q.X, q.Y);
    if (fa > 0.93 || fb > 0.93) lv -= 0.6;
    else if (fa < 0.16 || fb < 0.16) lv += 0.4;
    if (id > 0.86 && Math.abs(fa - fb * 0.6 - 0.2) < 0.03) lv -= 1.5; // tomette fendue
    if (q.na > 0.66) return blend(pickc(T.floor, lv, q.X, q.Y), P(STUCCO, 4), clamp((q.na - 0.66) * 3, 0, 0.45)); // poussière
    return pickc(T.floor, lv, q.X, q.Y);
  },
};

// chemins propres à certains thèmes (sinon : piste de terre, pathOver)
const PATHS = {
  // tapis rouge du saloon : bord frangé, galon doré, motifs en losanges
  saloon(v, q, T, col) {
    const e = edgeD(v.mPath[q.i], q.a, q.b, 0);
    if (e < 0.06) return col;
    if (e < 0.085) return (q.X + q.Y) & 2 ? pickc(STRAW, 4, q.X, q.Y) : col;
    if (e < 0.12) return pickc(T.path, 0.6, q.X, q.Y);
    if (e < 0.17) return pickc(BRASS, 2.6 + (q.g - 0.5), q.X, q.Y);
    const m = Math.abs(fract(q.U * 1.5) - 0.5) + Math.abs(fract(q.V * 1.5) - 0.5);
    let lv = T.plv + (q.nb - 0.5) * 0.8 + (q.g - 0.5) * 0.5;
    if (m < 0.06) return pickc(BRASS, 3.5, q.X, q.Y);
    if (m < 0.24 && m > 0.17) lv -= 1.6;
    else if (m < 0.17) lv += 0.8;
    return pickc(T.path, lv, q.X, q.Y);
  },
  // trottoir de planches de la ville, posées en travers du passage
  ville(v, q, T) {
    const pd = v.pdir[q.i], au = (pd & 3) && !(pd & 12);
    const p = (au ? q.U : q.V) * 5 + 0.5, idx = Math.floor(p), fr = p - idx;
    let lv = T.plv + (hsh(idx, 3, v.seed) - 0.5) * 1.2 + (vnoise((au ? q.V : q.U) * 3, idx * 2.7, v.seed) - 0.5) * 0.9 + (q.g - 0.5) * 0.3;
    if (fr < 0.1) lv -= 2.2; else if (fr > 0.88) lv += 0.6;
    if (edgeD(v.mPath[q.i], q.a, q.b, 0) < 0.05) lv += 0.8; // arête du trottoir
    return pickc(T.path, lv, q.X, q.Y);
  },
  // allées de dalles de pierre de la hacienda (pavage irrégulier)
  hacienda(v, q, T, col) {
    const e = edgeD(v.mPath[q.i], q.a, q.b, 0.3) + (q.nm - 0.5) * 0.1;
    if (e < 0.04) return col;
    const gu = q.U * 2.2, gv = q.V * 2.2, iu = Math.floor(gu), iv = Math.floor(gv);
    let d1 = 9, d2 = 9, id = 0;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      const cx = iu + i + 0.15 + hsh(iu + i, iv + j, v.seed + 61) * 0.7, cy = iv + j + 0.15 + hsh(iu + i, iv + j, v.seed + 62) * 0.7;
      const d = (gu - cx) * (gu - cx) + (gv - cy) * (gv - cy);
      if (d < d1) { d2 = d1; d1 = d; id = hsh(iu + i, iv + j, v.seed + 63); } else if (d < d2) d2 = d;
    }
    if (Math.sqrt(d2) - Math.sqrt(d1) < 0.09) return pickc(T.path, 0.6 + (q.g - 0.5), q.X, q.Y);
    return pickc(T.path, T.plv + (id - 0.5) * 1.6 + (q.g - 0.5) * 0.5 - Math.sqrt(d1) * 0.8, q.X, q.Y);
  },
};

// menus détails du sol, plats et discrets (jamais pris pour un obstacle), dessinés en pixels fins dans un morceau
const cssc = (p) => `rgb(${p & 255},${(p >>> 8) & 255},${(p >>> 16) & 255})`;
function drawDeco(g, kind, x, y, r, T) {
  const R = (px, py, w, h, c) => { g.fillStyle = c; g.fillRect(px, py, w, h); };
  const dark = cssc(scale(P(T.floor, T.lv - 1.6), 0.8));
  switch (kind) {
    case 'pebble': case 'stone': {
      const s = kind === 'stone' ? 7 : 3 + Math.floor(r(3) * 3), rk = T.wall.top;
      R(x - 1, y + 1, s + 2, s - 1, dark); R(x, y, s, s - 1, cssc(P(rk, 3 + r(4) * 2))); R(x + 1, y, Math.max(1, s - 3), 1, cssc(P(rk, 5.5)));
      if (r(5) > 0.5) { R(x + s + 3, y + 3, 3, 2, dark); R(x + s + 3, y + 2, 2, 2, cssc(P(rk, 3))); }
      break;
    }
    case 'crack': {
      let px = x, py = y;
      for (let i = 0; i < 6 + r(3) * 8; i++) { R(px, py, 2, 1, dark); px += 2; if (r(10 + i) > 0.5) py += 1; if (r(30 + i) > 0.8) py -= 1; }
      break;
    }
    case 'tuft': case 'fern': {
      const pal = kind === 'fern' ? LEAF : T.wall.moss || CACT;
      for (let i = 0; i < 5; i++) {
        const bx = x + i * 2 - 4, hg = 3 + Math.floor(r(20 + i) * 5);
        R(bx, y - hg, 1, hg, cssc(P(pal, 2 + (i % 2)))); R(bx, y - hg, 1, 1, cssc(P(pal, 4)));
      }
      R(x - 5, y, 11, 1, dark);
      break;
    }
    case 'flower': for (let i = 0; i < 3; i++) {
      const fx = x + Math.floor(r(40 + i) * 12), fy = y + Math.floor(r(50 + i) * 6);
      R(fx, fy + 1, 1, 3, cssc(P(T.floor, 2))); R(fx - 1, fy, 3, 2, cssc(FLOWERS[Math.floor(r(60 + i) * 4)])); R(fx, fy, 1, 1, '#fff8e0');
    } break;
    case 'skull': if (r(3) > 0.4) {
      R(x, y + 2, 7, 4, dark); R(x, y, 6, 4, '#e8e0cc'); R(x - 3, y - 1, 3, 1, '#d8d0bc'); R(x + 6, y - 1, 3, 1, '#d8d0bc');
      R(x + 1, y + 1, 1, 1, '#3a2a1a'); R(x + 4, y + 1, 1, 1, '#3a2a1a'); R(x + 2, y + 4, 2, 2, '#c8c0aa');
    } break;
    case 'twig': R(x, y, 8, 1, '#4a3a22'); R(x + 3, y - 2, 1, 2, '#4a3a22'); R(x + 6, y + 1, 3, 1, '#5a4628'); break;
    case 'needles': for (let i = 0; i < 6; i++) R(x + Math.floor(r(70 + i) * 14), y + Math.floor(r(80 + i) * 7), 3, 1, i % 2 ? '#6a4a26' : '#4a3418'); break;
    case 'leaf': case 'leafd': case 'petal': {
      const cols = kind === 'petal' ? ['#d0508a', '#e878a8', '#b83a70'] : kind === 'leafd' ? ['#8a5a2a', '#6a4220', '#a8763a'] : ['#c8742a', '#a04a1c', '#d8a03a'];
      for (let i = 0; i < 5; i++) R(x + Math.floor(r(90 + i) * 12), y + Math.floor(r(100 + i) * 6), 2, 1 + (i & 1), cols[i % 3]);
      break;
    }
    case 'mushroom': R(x, y + 2, 2, 3, '#e8dcc0'); R(x - 2, y, 6, 2, '#b8402a'); R(x - 1, y, 1, 1, '#f4e8d0'); R(x + 5, y + 3, 1, 2, '#e8dcc0'); R(x + 4, y + 2, 3, 1, '#c85a3a'); break;
    case 'sparkle': R(x, y, 1, 1, '#ffffff'); if (r(3) > 0.5) R(x + 7, y + 3, 1, 1, '#ffffff'); break;
    case 'step': for (let i = 0; i < 3; i++) R(x + i * 6, y + (i & 1) * 3, 3, 2, 'rgba(70,90,130,0.35)'); break;
    case 'gravel': for (let i = 0; i < 7; i++) R(x + Math.floor(r(110 + i) * 12), y + Math.floor(r(120 + i) * 6), 2, 1, i % 3 ? '#6a6058' : '#2a221c'); break;
    case 'ore': if (r(3) > 0.5) { R(x, y + 1, 5, 3, '#1a140e'); R(x, y, 4, 3, '#4a3e30'); R(x + 1, y, 2, 1, '#f0c850'); R(x + 3, y + 1, 1, 1, '#ffe890'); } break;
    case 'plank': R(x, y + 1, 12, 2, '#1a120c'); R(x, y, 12, 2, '#6a4a2a'); R(x + 1, y, 10, 1, '#8a6238'); R(x + 3, y, 1, 2, '#3a2414'); break;
    case 'nail': R(x, y, 1, 1, '#2a1a10'); break;
    case 'card': if (r(3) > 0.5) { R(x, y + 1, 4, 5, '#2a1a10'); R(x, y, 4, 5, '#f4ecd8'); R(x + 1, y + 2, 2, 1, r(4) > 0.5 ? '#b8302a' : '#1a1a1a'); } break;
    case 'coin': R(x, y + 1, 3, 2, '#5a4010'); R(x, y, 3, 2, '#e8c050'); R(x + 1, y, 1, 1, '#fff0a0'); break;
    case 'straw': for (let i = 0; i < 6; i++) R(x + Math.floor(r(130 + i) * 12), y + Math.floor(r(140 + i) * 5), 3, 1, i % 2 ? '#d8b860' : '#b8943c'); break;
    case 'hoof': for (let i = 0; i < 2; i++) { const hx = x + i * 7, hy = y + i * 3; R(hx, hy, 4, 1, dark); R(hx, hy, 1, 3, dark); R(hx + 3, hy, 1, 3, dark); } break;
    case 'dung': if (r(3) > 0.7) { R(x, y + 1, 5, 2, '#2e1e10'); R(x + 1, y, 3, 2, '#4a3018'); } break;
  }
}

// ------------------------------------------------------------ les murs, pixel par pixel
// q : le pixel du mur (x, y, i : sa case ; U, V, a, b : position ; z : hauteur, h : hauteur du mur à cet endroit ;
// top : dessus ou flanc ; li : éclairement (0 à 1) ; nz : pente ; face : 1 flanc droit, 0 flanc gauche ; wi : bords exposés)
const FACADES = [
  ramp('3a0e0a 5a1a12 7a281a 963624 ae4a30 c4603e d87a52'), // grange rouge
  ramp('5a5a56 7a7a74 9a9990 b8b6aa d2cfc2 e6e3d6 f4f1e6'), // blanc cassé
  ramp('222c38 32404e 445668 586c80 6e8498 8a9eb0 a8b8c8'), // bleu gris
  ramp('4a300c 6a4614 8a5e1e a8782a c4923a d8aa52 e8c272'), // ocre
  ramp('182c1e 24402a 325838 427048 548a5a 6ea272 8cba8c'), // vert
  WOOD, // planches brutes
];
const SIGNS = ramp('1a120c 2a1c10 3c2a18 524028 c8a868 e8d4a0');

// éclairage en facettes : l'éclairement est ramené à quelques paliers, tramés à leur frontière
const facet = (li, X, Y, n = 4) => Math.floor(li * n + bay(X, Y) * 0.98) / n;
function paintRock(v, W, q) {
  const g = hsh(q.X >> 1, q.Y >> 1, v.seed + 7), n1 = v.nDet(q.U, q.V);
  q.li = facet(q.li, q.X, q.Y, q.top ? 5 : 4);
  if (q.top) {
    if (W.snow && q.nz > 0.6) return pickc(SNOWR, 1.4 + q.li * 4.2 + (g - 0.5) * 0.5 + (n1 - 0.5) * 0.6, q.X, q.Y);
    let lv = 1.1 + q.li * 5 + (n1 - 0.5) * 1.4 + (g - 0.5) * 0.5;
    if (Math.abs(vnoise(q.U * 3.3, q.V * 3.3, v.seed + 21) - 0.5) < 0.018 && vnoise(q.U * 1.1, q.V * 1.1, v.seed + 22) > 0.5) lv -= 1.4; // fissures
    if (W.moss && q.nz > 0.8) {
      // mousse sur le dessus, par plaques au bord tramé
      const mk = vnoise(q.U * 1.3, q.V * 1.3, v.seed + 71) + (vnoise(q.U * 5, q.V * 5, v.seed + 73) - 0.5) * 0.25;
      if (mk > 0.58 || (mk > 0.53 && bay(q.X, q.Y) < (mk - 0.53) * 20)) return pickc(W.moss, lv - 0.9, q.X, q.Y);
    }
    return pickc(W.top, lv, q.X, q.Y);
  }
  const k = clamp(q.z / Math.max(4, q.h), 0, 1), sx = q.U - q.V;
  let R = W.side, lv = 0.8 + q.li * 5 + k * 1.0 + (n1 - 0.5) * 0.9 + (g - 0.5) * 0.45;
  if (W.strata) {
    const sz = q.z + (vnoise(sx * 1.4, 1, v.seed) - 0.5) * 3.2;
    const f = fract(sz / W.strata);
    if (f < 0.12) lv -= 0.8; else if (f < 0.22) lv += 0.35;
    if (W.bands) R = W.bands[Math.abs(Math.floor(sz / (W.strata * 2))) % W.bands.length];
  }
  if (W.streak && k > 0.2 && vnoise(sx * 5, 0.5, v.seed + 3) > 0.74) lv -= 0.5; // vernis du désert
  if (Math.abs(vnoise(sx * 2.4, q.z * 0.08, v.seed + 9) - 0.5) < 0.016) lv -= 1.1; // fentes verticales
  if (W.snow && k > 0.84 + (vnoise(sx * 4, 2, v.seed) - 0.5) * 0.3) return pickc(SNOWR, 1.8 + q.li * 3.6, q.X, q.Y);
  if (W.moss && k > 0.8 && vnoise(sx * 5, 0.5, v.seed + 72) > 0.66 + (1 - k) * 1.5) return pickc(W.moss, 0.8 + q.li * 4, q.X, q.Y);
  return pickc(R, lv, q.X, q.Y);
}

// paroi de galerie : roche sombre, étais de bois tous les deux pas, filons d'or
function paintMine(v, W, q) {
  const g = hsh(q.X >> 1, q.Y >> 1, v.seed + 7), n1 = v.nDet(q.U, q.V);
  q.li = facet(q.li, q.X, q.Y, 4);
  if (q.top) {
    const e = edgeD(q.wi, q.a, q.b, 0.2);
    return pickc(W.top, 0.3 + q.li * 2 + (e < 0.12 ? 1.6 : 0) + (n1 - 0.5) * 1.4 + (g - 0.5) * 0.6, q.X, q.Y);
  }
  // roche de la galerie : blocs fendus, filons de quartz et paillettes d'or, suintements
  const sx = q.U - q.V, k = clamp(q.z / q.h, 0, 1);
  if (vnoise(sx * 3, q.z * 0.3, v.seed + 80) > 0.9 && g > 0.7) return pickc(BRASS, 2.2 + q.li * 3, q.X, q.Y);
  let lv = 1.4 + q.li * 4.6 + k * 0.9 + (n1 - 0.5) * 1.3 + (g - 0.5) * 0.6;
  const bl = vnoise(sx * 2.2, q.z * 0.16, v.seed + 3);
  if (Math.abs(bl - 0.5) < 0.03) lv -= 1.4; else if (bl > 0.5 && bl < 0.56) lv += 0.5;
  if (Math.abs(vnoise(sx * 1.3, q.z * 0.09 + 5, v.seed + 4) - 0.5) < 0.01 && vnoise(sx * 0.7, 2, v.seed + 6) > 0.6) return pickc(GREYW, 2.4 + q.li * 2, q.X, q.Y);
  if (k < 0.25 && vnoise(sx * 6, 1, v.seed + 5) > 0.7) lv -= 0.7;
  return pickc(W.side, lv, q.X, q.Y);
}

// mur intérieur du saloon : planches verticales, lambris, fenêtres, lampes à huile
function paintSaloon(v, W, q) {
  const g = hsh(q.X >> 1, q.Y >> 1, v.seed + 7);
  if (q.top) {
    let lv = 1.2 + q.li * 2.6 + (g - 0.5) * 0.4;
    const e = edgeD(q.wi, q.a, q.b, 0);
    if (e < 0.08) lv += 1.6; else if (e < 0.11) lv -= 0.6;
    return pickc(W.top, lv, q.X, q.Y);
  }
  const t = q.face ? q.V : q.U, fx = fract(t + 0.5), hc = hsh(q.x * 2 + q.face, q.y, v.seed + 91);
  // fenêtre : cadre, croisillon, vitre sombre avec un reflet en biais
  if (hc < 0.3 && fx > 0.24 && fx < 0.76 && q.z > 8 && q.z < 16) {
    const ex = Math.min(fx - 0.24, 0.76 - fx), ez = Math.min(q.z - 8, 16 - q.z);
    if (ex < 0.05 || ez < 0.9) return pickc(WOOD, 3 + q.li * 3, q.X, q.Y);
    if (Math.abs(fx - 0.5) < 0.02 || Math.abs(q.z - 12) < 0.35) return pickc(WOOD, 2 + q.li * 3, q.X, q.Y);
    const rf = fract((fx * 18 + q.z) / 9);
    return pickc(GLASS, 1.4 + (rf < 0.18 ? 2.5 : 0) + q.li * 1.5, q.X, q.Y);
  }
  // lampe à huile sur une applique de laiton, et son halo sur les planches
  let glow = 0;
  if (hc > 0.3 && hc < 0.48) {
    const dx = (fx - 0.5) * 18, dz = q.z - 13.5;
    if (Math.abs(dx) < 0.6 && dz > 0 && dz < 2) return dz > 1.3 ? hex('fff8d0') : hex('f8b040');
    if (Math.abs(dx) < 1.3 && dz > -1.6 && dz <= 0) return pickc(BRASS, 3 + q.li * 2 - (dz < -1 ? 1 : 0), q.X, q.Y);
    if (Math.abs(dx) < 0.4 && dz > -3.4 && dz <= -1.6) return pickc(BRASS, 2, q.X, q.Y);
    const r = Math.hypot(dx, dz * 1.2);
    if (r < 7) glow = (1 - r / 7) * 2;
  }
  const pl = (t + 0.5) * 6, idx = Math.floor(pl), fr = pl - idx;
  let lv = 1.4 + q.li * 4.2 + (hsh(idx, q.face, v.seed) - 0.5) * 0.8 + (vnoise(idx * 3, q.z * 0.5, v.seed) - 0.5) * 0.6 + glow;
  if (fr < 0.08) lv -= 1.4;
  if (q.z < 6.2) {
    lv -= 0.7;
    if (q.z > 5.4) lv += 2;
    else if (Math.abs(fract(fx * 2) - 0.5) > 0.42 || q.z < 0.8 || q.z > 4.8) lv += 0.6;
  }
  if (q.z > q.h - 1.2) lv += 1;
  return pickc(W.side, lv, q.X, q.Y);
}

// façade de la grand-rue : planches à clin peintes, fenêtres, portes, enseigne, toit de bardeaux à rebord
function paintFacade(v, W, q) {
  const g = hsh(q.X >> 1, q.Y >> 1, v.seed + 7), bid = v.bid[q.i];
  const R = FACADES[Math.floor(hsh(bid, 3, v.seed) * FACADES.length)];
  if (q.top) {
    const e = edgeD(q.wi, q.a, q.b, 0);
    if (e < 0.075) return pickc(R, 2.6 + q.li * 3.4 + (g - 0.5) * 0.4, q.X, q.Y); // rebord peint
    const r = (q.V + 0.5) * 5, row = Math.floor(r), c = (q.U + 0.5) * 4 + (row & 1) * 0.5;
    let lv = 1.4 + q.li * 3 + (hsh(Math.floor(c), row, v.seed + bid) - 0.5) * 0.9 + (g - 0.5) * 0.4;
    if (fract(r) < 0.14) lv -= 1.1; else if (fract(c) < 0.06) lv -= 0.7;
    return pickc(W.top, lv, q.X, q.Y);
  }
  const t = q.face ? q.V : q.U, fx = fract(t + 0.5), hc = hsh(q.x * 2 + q.face, q.y, v.seed + 93);
  const sign = hsh(bid, 5, v.seed) < 0.75 && q.z > q.h - 5.2 && q.z < q.h - 1.2;
  if (sign) {
    const ez = Math.min(q.z - (q.h - 5.2), q.h - 1.2 - q.z);
    if (ez < 0.5) return pickc(SIGNS, 2 + q.li * 2, q.X, q.Y);
    const lt = hsh(Math.floor((t + 9) * 11), Math.floor(q.z * 1.4), bid) > 0.55 && ez > 1;
    return lt ? pickc(SIGNS, 0.5, q.X, q.Y) : pickc(SIGNS, 3.6 + q.li * 1.5, q.X, q.Y);
  }
  // porte (rez-de-chaussée) ou fenêtre, et fenêtre d'étage pour les hautes façades
  if (hc < 0.25 && fx > 0.3 && fx < 0.7 && q.z < 11.5) {
    const ex = Math.min(fx - 0.3, 0.7 - fx);
    if (ex < 0.04 || q.z > 10.8) return pickc(R, 4.6, q.X, q.Y);
    if (Math.abs(fx - 0.62) < 0.02 && Math.abs(q.z - 5.5) < 0.4) return pickc(BRASS, 4, q.X, q.Y);
    return pickc(DWOOD, 1.6 + q.li * 2.5 + (Math.abs(fx - 0.5) < 0.012 ? -1 : 0), q.X, q.Y);
  }
  const win = (z0, z1) => fx > 0.28 && fx < 0.72 && q.z > z0 && q.z < z1;
  const z0 = q.h >= 22 ? 5 : 6.5, z1 = z0 + 6.5;
  if ((hc >= 0.25 && win(z0, z1)) || (q.h >= 22 && win(13.5, 19))) {
    const a0 = q.z > 13 ? 13.5 : z0, a1 = q.z > 13 ? 19 : z1;
    const ex = Math.min(fx - 0.28, 0.72 - fx), ez = Math.min(q.z - a0, a1 - q.z);
    if (ex < 0.05 || ez < 0.7) return pickc(FACADES[1], 3.6 + q.li * 2.4, q.X, q.Y);
    if (Math.abs(fx - 0.5) < 0.018) return pickc(FACADES[1], 3.2, q.X, q.Y);
    const rf = fract((fx * 20 + q.z) / 10);
    return pickc(GLASS, 1 + (rf < 0.16 ? 2.8 : 0) + q.li * 1.6, q.X, q.Y);
  }
  let lv = 1.6 + q.li * 4 + (g - 0.5) * 0.4 + (vnoise(t * 3, q.z * 0.4, v.seed + bid) - 0.5) * 0.5;
  const fz = fract(q.z / 2.25);
  if (fz < 0.2) lv -= 1.1; else if (fz > 0.85) lv += 0.4;
  if (q.z < 1) lv -= 0.8;
  return pickc(R, lv, q.X, q.Y);
}

// mur d'adobe : enduit ocre, fissures, enduit tombé sur les briques, poutres (vigas), tuiles en rive
function paintAdobe(v, W, q) {
  const g = hsh(q.X >> 1, q.Y >> 1, v.seed + 7), n1 = v.nDet(q.U, q.V);
  if (q.top) {
    const e = edgeD(q.wi, q.a, q.b, 0.1);
    if (e < 0.17) {
      const t = (q.wi & 12) && e === Math.min(q.b, 1 - q.b) ? q.U : q.V;
      const f = fract(t * 7);
      return pickc(TERRA, 2.2 + q.li * 3 + (f < 0.3 ? -1 : f > 0.75 ? 0.8 : 0) + (g - 0.5) * 0.4, q.X, q.Y);
    }
    return pickc(STUCCO, 2 + q.li * 4 + (n1 - 0.5) * 0.9 + (g - 0.5) * 0.4, q.X, q.Y);
  }
  const t = q.face ? q.V : q.U, fx = fract(t + 0.5), sx = q.U - q.V;
  // dedans (pièce de la maison) : enduit blanchi à la chaux, plinthe sombre
  if (q.face ? v.inR[q.i] : v.inL[q.i]) {
    let lv = 2.4 + q.li * 3.6 + (n1 - 0.5) * 0.6 + (g - 0.5) * 0.3;
    if (q.z < 1.6) return pickc(TERRA, 1.6 + q.li * 2, q.X, q.Y);
    if (Math.abs(vnoise(sx * 2.4, q.z * 0.13, v.seed + 34) - 0.5) < 0.01) lv -= 1.2;
    return pickc(STUCCO, lv + 1, q.X, q.Y);
  }
  // vigas : bouts de poutres sous le toit
  if (q.z > q.h - 4.6 && q.z < q.h - 2.4 && Math.abs(fract(t * 3 + 0.5) - 0.5) < 0.1) {
    return pickc(DWOOD, 1.4 + q.li * 4 + (q.z > q.h - 3 ? 0.8 : 0), q.X, q.Y);
  }
  // fenêtre en niche, barreaux de fer forgé
  const hc = hsh(q.x * 2 + q.face, q.y, v.seed + 95);
  if (hc < 0.22 && fx > 0.34 && fx < 0.66 && q.z > 5.5 && q.z < 12.5 + Math.sqrt(Math.max(0, 0.0256 - (fx - 0.5) * (fx - 0.5))) * 12) {
    if (Math.abs(fract(fx * 22) - 0.5) < 0.16) return pickc(IRON, 1.6, q.X, q.Y);
    return pickc(DWOOD, 0.5 + q.li, q.X, q.Y);
  }
  let lv = 1.4 + q.li * 4.4 + clamp(q.z / q.h, 0, 1) * 0.6 + (n1 - 0.5) * 0.9 + (g - 0.5) * 0.4;
  if (fbm(sx * 1.5, q.z * 0.11, v.seed + 33, 2) > 0.64) {
    // l'enduit est tombé : briques d'adobe et leur mortier
    const row = Math.floor(q.z / 2.6), off = row & 1 ? 0.5 : 0;
    if (fract(q.z / 2.6) < 0.18 || fract(sx * 2.6 + off) < 0.08) return pickc(STUCCO, lv - 1.6, q.X, q.Y);
    return pickc(BRICK, 0.8 + q.li * 4 + (hsh(Math.floor(sx * 2.6 + off), row, v.seed) - 0.5), q.X, q.Y);
  }
  if (Math.abs(vnoise(sx * 2.4, q.z * 0.13, v.seed + 31) - 0.5) < 0.014 && vnoise(sx, 3, v.seed + 32) > 0.45) lv -= 1.6;
  if (q.z < 2.2) lv -= 0.9;
  return pickc(STUCCO, lv, q.X, q.Y);
}
const WALLPAINT = { rock: paintRock, mine: paintMine, saloon: paintSaloon, facade: paintFacade, adobe: paintAdobe, wood: (v, P, q) => paintWood(v, P, q) };

// ------------------------------------------------------------ sprites en pixels fins
// sprite 2D : w × h pixels fins, fn(x, y) → couleur (0 : vide), origine (ox, oy) = le centre au sol de la case ;
// contour sombre d'un pixel fin autour (sauf outline = false)
function sprite2(w, h, ox, oy, fn, outline = true) {
  const d = new Uint32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) d[y * w + x] = fn(x - ox, y - oy) || 0;
  if (outline) outlineBuf(d, w, h);
  return cropped(d, w, h, ox, oy);
}
// canevas recadré sur les pixels non vides ; ox, oy (pixels du jeu) : du coin haut gauche au centre au sol de la case
function cropped(d, w, h, ox, oy) {
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (d[y * w + x]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) { x0 = y0 = 0; x1 = y1 = 0; }
  const cw = x1 - x0 + 1, ch = y1 - y0 + 1, c = S.makeCanvas(cw, ch), g = c.getContext('2d');
  const img = g.createImageData(cw, ch), o = new Uint32Array(img.data.buffer);
  for (let y = 0; y < ch; y++) o.set(d.subarray((y + y0) * w + x0, (y + y0) * w + x0 + cw), y * cw);
  g.putImageData(img, 0, 0);
  c.ox = (ox - x0) / F;
  c.oy = (oy - y0) / F;
  return c;
}
function outlineBuf(d, w, h, keep = null) {
  const src = d.slice();
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const k = y * w + x;
    if (src[k] || (keep && keep[k])) continue;
    if ((x > 0 && src[k - 1]) || (x < w - 1 && src[k + 1]) || (y > 0 && src[k - w]) || (y < h - 1 && src[k + w])) d[k] = OUTC;
  }
}

// volume en isométrique décrit par des colonnes pleines : shape(A, B, iv) remplit iv = [bas0, haut0, bas1, haut1…]
// (hauteurs en pixels du jeu) et renvoie le nombre d'intervalles ; A, B : position dans la case (centre 0, bords ±0,5 ;
// +A descend vers la droite, +B vers la gauche). paint(A, B, z, top, k, x, y) → couleur ; k : l'intervalle touché ;
// x, y : pixel fin du sprite. R : demi-emprise (en cases), up : plus grande hauteur. post(g, ox, oy) : détails à la main.
const IV = new Float32Array(16);
function voxel(R, up, shape, paint, { post = null, outline = true } = {}) {
  const Wd = Math.ceil((64 * R * F + 8) / 8) * 8, oy = Math.ceil((up + 16 * R) * F / 4) * 4 + 4, Hd = oy + Math.ceil(16 * R * F) + 8;
  const ox = Wd / 2;
  const d = new Uint32Array(Wd * Hd), cov = new Uint8Array(Hd);
  for (let col = 0; col < Wd; col++) {
    const cc = (col + 0.5 - ox) / F / HW;
    cov.fill(0);
    for (let s = Math.ceil(2 * R / DS) * DS; s >= -2 * R; s -= DS) {
      const A = (s + cc) / 2, B = (s - cc) / 2;
      if (A < -R || A > R || B < -R || B > R) continue;
      const n = shape(A, B, IV);
      if (!n) continue;
      const base = s * HH * F + oy;
      for (let k = 0; k < n; k++) {
        const lo = IV[2 * k], hi = IV[2 * k + 1];
        let r0 = Math.ceil(base - hi * F - 0.5), r1 = Math.floor(base - lo * F - 0.5);
        if (r0 < 0) r0 = 0;
        if (r1 >= Hd) r1 = Hd - 1;
        for (let r = r0; r <= r1; r++) {
          if (cov[r]) continue;
          cov[r] = 1;
          const z = (base - r - 0.5) / F, top = z >= hi - 0.35;
          d[r * Wd + col] = paint(A, B, top ? hi : z, top, k, col, r) || 0;
        }
      }
    }
  }
  if (post) {
    // détails à la main (une seule fois, à la création) : on repasse par un canevas de travail
    const t = S.makeCanvas(Wd, Hd, true), g = t.getContext('2d', { willReadFrequently: true });
    const img = g.createImageData(Wd, Hd);
    new Uint32Array(img.data.buffer).set(d);
    g.putImageData(img, 0, 0);
    post(g, ox, oy);
    d.set(new Uint32Array(g.getImageData(0, 0, Wd, Hd).data.buffer));
    S.freeCanvas(t);
  }
  if (outline) outlineBuf(d, Wd, Hd);
  return cropped(d, Wd, Hd, ox, oy);
}
// face visible d'une boîte (demi-tailles hx, hy) : 1 flanc droit (+A), 0 flanc gauche (+B)
const boxFace = (A, B, hx, hy) => (hx - A < hy - B ? 1 : 0);
// tour : profil de rayon prof(z) (en cases), de 0 à hz ; renvoie la forme (jusqu'à 3 intervalles)
function lathe(hz, prof, step = 0.25) {
  const n = Math.ceil(hz / step), r = new Float32Array(n + 1);
  for (let k = 0; k <= n; k++) r[k] = prof(Math.min(hz, k * step));
  return (A, B, iv) => {
    const rho = Math.hypot(A, B);
    let m = 0, inside = false;
    for (let k = 0; k <= n; k++) {
      const ok = r[k] >= rho;
      if (ok && !inside) { if (m >= 3) break; iv[2 * m] = k * step; inside = true; }
      else if (!ok && inside) { iv[2 * m + 1] = (k - 1) * step + step * 0.5; m++; inside = false; }
    }
    if (inside) { iv[2 * m + 1] = hz; m++; }
    return m;
  };
}
// normale d'un champ de hauteur fh(A, B) (pixels du jeu), pour l'éclairage
function hfLit(fh, A, B) {
  const e = 0.02, hu = (fh(A + e, B) - fh(A - e, B)) / (2 * e), hv = (fh(A, B + e) - fh(A, B - e)) / (2 * e);
  return lit(-hu / 20, -hv / 20, 1);
}
const gr2 = (x, y, s) => hsh(x >> 1, y >> 1, s) - 0.5;

// ------------------------------------------------------------ objets (demi-couverts, poteaux)
// caisse de bois : dessus en planches, flancs à cadre et croisillon
function crateSprite(T, vr) {
  const hx = 0.31 + hsh(vr, 2, 5) * 0.04, hy = 0.31, hz = 9.5, tint = (hsh(vr, 1, 9) - 0.5) * 0.8;
  return voxel(0.42, hz + 2, (A, B, iv) => {
    if (Math.abs(A) > hx || Math.abs(B) > hy) return 0;
    iv[0] = 0; iv[1] = hz; return 1;
  }, (A, B, z, top, k, x, y) => {
    const gn = gr2(x, y, vr) * 0.5;
    if (top) {
      if (T.snowy) return pickc(SNOWR, 3.4 + gn - (A + B) * 0.8, x, y);
      const u = (A + hx) / (2 * hx), w = (B + hy) / (2 * hy), e = Math.min(u, 1 - u, w, 1 - w);
      let lv = 4.2 + tint + gn;
      if (e < 0.1) lv -= 0.5; else if (fract(w * 3) < 0.09) lv -= 1.7;
      if (u < 0.04 || w < 0.04) lv += 0.9;
      return pickc(WOOD, lv, x, y);
    }
    const f = boxFace(A, B, hx, hy), u = f ? (B + hy) / (2 * hy) : (A + hx) / (2 * hx), fz = z / hz;
    if (T.snowy && fz > 0.9 - hsh(x >> 2, 1, 4) * 0.1) return pickc(SNOWR, f ? 2 : 3, x, y);
    let lv = (f ? 1.6 : 3.1) + tint - (1 - fz) * 0.3 + gn;
    const e = Math.min(u, 1 - u);
    if (e < 0.1 || fz < 0.13 || fz > 0.87) lv += 0.5;
    else {
      const dd = Math.abs((f ? 1 - u : u) - fz);
      if (dd < 0.07) lv += 0.6; else if (dd < 0.1) lv -= 1; else if (fract(fz * 3) < 0.1) lv -= 1.1;
    }
    if (e < 0.025) lv -= 0.9;
    return pickc(WOOD, lv, x, y);
  });
}

// tonneau (ou tonneau de poudre : rouge, tête de mort, mèche)
const SKULL = ['.XXX.', 'XXXXX', 'X.X.X', 'XXXXX', '.X.X.'];
function barrelSprite(T, vr, keg = false) {
  const hz = keg ? 10.5 : 11, r0 = keg ? 0.21 : 0.22, bl = 0.035;
  const prof = (z) => r0 + bl * Math.sin(Math.PI * z / hz);
  const pal = keg ? RED : WOOD;
  return voxel(0.36, hz + 8, lathe(hz, prof), (A, B, z, top, k, x, y) => {
    const rho = Math.hypot(A, B), gn = gr2(x, y, 7) * 0.4;
    if (top) {
      if (T.snowy && !keg && rho < r0 - 0.03) return pickc(SNOWR, 3.4 + gn, x, y);
      if (rho > r0 - 0.035) return pickc(IRON, 3.2 - (A - B) * 2, x, y);
      return pickc(keg ? WOOD : WOOD, 3.4 + (fract((A - B) * 9) < 0.15 ? -1.2 : 0) + gn, x, y);
    }
    const ang = Math.atan2(B, A), li = lit(A, B, 0.2);
    const hoop = (z > 1.6 && z < 2.8) || (z > hz - 2.8 && z < hz - 1.6) || (!keg && z > hz / 2 - 0.5 && z < hz / 2 + 0.5);
    if (hoop) return pickc(IRON, 1.4 + li * 5, x, y);
    if (keg) {
      const su = (ang - Math.PI / 4) / 1.1 + 0.5, sv = (z - 3.6) / 4.2;
      if (su >= 0 && su < 1 && sv >= 0 && sv < 1 && SKULL[4 - Math.floor(sv * 5)][Math.floor(su * 5)] === 'X') return hex(li > 0.2 ? 'f4ecd8' : 'c8bca4');
    }
    let lv = (keg ? 0.8 : 0.8) + li * 5.4 + gn;
    if (fract(ang / (2 * Math.PI) * 14) < 0.1) lv -= 1;
    return pickc(pal, lv, x, y);
  }, { post: keg ? (g, ox, oy) => {
    // la mèche qui dépasse du couvercle, son étincelle
    const fx = ox + 3, fy = oy - hz * F;
    g.fillStyle = '#2a1a10';
    g.fillRect(fx, fy - 9, 2, 9); g.fillRect(fx + 2, fy - 12, 2, 4);
    g.fillStyle = '#f8a040'; g.fillRect(fx + 2, fy - 16, 3, 4);
    g.fillStyle = '#fff2b0'; g.fillRect(fx + 3, fy - 15, 1, 2);
  } : null });
}

// meule de foin : bloc arrondi, paille, deux liens de ficelle
function haySprite(T, vr) {
  const alongA = vr & 1, hx = alongA ? 0.38 : 0.3, hy = alongA ? 0.3 : 0.38, hz = 9, rr = 0.11;
  const fh = (A, B) => {
    const e = Math.min(hx - Math.abs(A), hy - Math.abs(B));
    if (e < 0) return 0;
    return e > rr ? hz : hz - 4 * (1 - Math.sqrt(Math.max(0, 1 - ((rr - e) / rr) ** 2)));
  };
  return voxel(0.42, hz + 2, (A, B, iv) => { const h = fh(A, B); if (h <= 0) return 0; iv[0] = 0; iv[1] = h; return 1; }, (A, B, z, top, k, x, y) => {
    const li = top ? hfLit(fh, A, B) : lit(boxFace(A, B, hx, hy) ? 1 : 0, boxFace(A, B, hx, hy) ? 0 : 1, 0.15);
    const along = alongA ? A : B;
    if (Math.abs(Math.abs(along) - 0.17) < 0.025) return pickc(WOOD, 1.2 + li * 3, x, y);
    return pickc(STRAW, 0.8 + li * 5.4 + (hsh(x, y >> 1, vr) - 0.5) * 1.6, x, y);
  });
}

// pile de rondins (forêt)
function logsSprite(T, vr) {
  const L = 0.38, rr = 0.12, logs = [[-0.125, 2.5], [0.125, 2.5], [0, 7.2]];
  return voxel(0.44, 12, (A, B, iv) => {
    if (Math.abs(A) > L) return 0;
    let m = 0;
    for (const [bc, zc] of logs) {
      const db = B - bc;
      if (Math.abs(db) >= rr) continue;
      const dz = Math.sqrt(rr * rr - db * db) * 20;
      iv[2 * m] = Math.max(0, zc - dz); iv[2 * m + 1] = zc + dz; m++;
    }
    return m;
  }, (A, B, z, top, k, x, y) => {
    let best = null, bd = 9;
    for (const L2 of logs) { const d = Math.abs(Math.hypot((B - L2[0]) * 20, z - L2[1]) - rr * 20); if (d < bd) { bd = d; best = L2; } }
    const nb = (B - best[0]) * 20, nz = z - best[1];
    if (A > L - 0.03) {
      // le bout scié : cernes
      const r = Math.hypot(nb, nz) / (rr * 20);
      return pickc(STRAW, 2.4 + (fract(r * 3.5) < 0.25 ? -1 : 0.6) - r, x, y);
    }
    if (T.snowy && nz > 1.2) return pickc(SNOWR, 3.4, x, y);
    return pickc(BARK, 0.6 + lit(0, nb, nz) * 4.4 + (hsh(x >> 1, y, 3) - 0.5) * 1.2, x, y);
  });
}

// wagonnet de mine : caisse de fer rivetée sur roues, chargée de minerai
function cartSprite(T, vr) {
  const hx = 0.32, hy = 0.24, z0 = 2.6, hz = 9.6, ix = hx - 0.05, iy = hy - 0.05;
  const ore = (A, B) => 7.4 + Math.max(0, 1 - Math.hypot(A / ix, B / iy)) * 3.2 + (vnoise(A * 18, B * 18, vr) - 0.5) * 1.6;
  return voxel(0.42, 14, (A, B, iv) => {
    if (Math.abs(A) > hx || Math.abs(B) > hy) return 0;
    iv[0] = z0;
    iv[1] = Math.abs(A) < ix && Math.abs(B) < iy ? ore(A, B) : hz;
    return 1;
  }, (A, B, z, top, k, x, y) => {
    const inner = Math.abs(A) < ix && Math.abs(B) < iy;
    if (top && inner) {
      const li = hfLit(ore, A, B);
      if (vnoise(A * 30, B * 30, vr + 1) > 0.78) return pickc(BRASS, 2 + li * 4, x, y);
      return pickc(GREYW, 0.4 + li * 4.6 + (hsh(x >> 1, y >> 1, 5) - 0.5) * 1.4, x, y);
    }
    if (top) return pickc(IRON, 3 + lit(-1, 1, 2) * 3, x, y);
    const f = boxFace(A, B, hx, hy), u = f ? (B + hy) / (2 * hy) : (A + hx) / (2 * hx);
    let lv = f ? 1.6 : 3;
    if (z > hz - 0.9) lv += 1.4; else if (z < z0 + 0.8) lv -= 0.6;
    if ((Math.abs(u - 0.08) < 0.03 || Math.abs(u - 0.92) < 0.03) && fract(z / 2) < 0.4) lv += 1.6; // rivets
    const rust = vnoise(u * 9 + f * 5, z * 0.6, vr) > 0.6;
    return rust ? pickc(RED, lv - 0.6, x, y) : pickc(IRON, lv + (hsh(x, y >> 1, 4) - 0.5) * 0.5, x, y);
  }, { post: (g, ox, oy) => {
    // les deux roues du flanc gauche
    for (const a of [-0.2, 0.2]) {
      const A = a, B = hy + 0.01, sx = ox + (A - B) * HW * F, sy = oy + (A + B) * HH * F - 2.2 * F;
      for (let yy = -8; yy <= 8; yy++) for (let xx = -6; xx <= 6; xx++) {
        const r = Math.hypot(xx / 6, yy / 8);
        if (r > 1) continue;
        g.fillStyle = r > 0.72 ? '#2a2a30' : r < 0.3 ? '#8a8a96' : '#4a4a54';
        g.fillRect(sx + xx, sy + yy, 1, 1);
      }
    }
  } });
}

// jarre de terre cuite (hacienda)
function jarSprite(T, vr) {
  const hz = 10.5 + hsh(vr, 3, 1) * 1.5;
  const prof = (z) => { const t = z / hz; return t > 0.86 ? 0.12 : t > 0.76 ? 0.09 : 0.11 + Math.sin(Math.min(1, t / 0.76) * Math.PI) * 0.15; };
  return voxel(0.34, hz + 2, lathe(hz, prof), (A, B, z, top, k, x, y) => {
    const rho = Math.hypot(A, B);
    if (top) return rho < 0.08 ? pickc(DWOOD, 0.5, x, y) : pickc(TERRA, 3.4, x, y);
    const li = lit(A, B, 0.25 - (z / hz - 0.4));
    if (Math.abs(z / hz - 0.55) < 0.05) return pickc(STUCCO, 3 + li * 3, x, y);
    if (Math.abs(z / hz - 0.62) < 0.02) return pickc(DWOOD, 1 + li * 2, x, y);
    return pickc(TERRA, 0.6 + li * 5 + gr2(x, y, 3) * 0.5, x, y);
  });
}

// abreuvoir (ville) : bac de planches plein d'eau
function troughSprite(T, vr) {
  const alongA = vr & 1, hx = alongA ? 0.42 : 0.22, hy = alongA ? 0.22 : 0.42, hz = 6.5;
  return voxel(0.46, hz + 2, (A, B, iv) => {
    if (Math.abs(A) > hx || Math.abs(B) > hy) return 0;
    iv[0] = 0; iv[1] = Math.abs(A) < hx - 0.05 && Math.abs(B) < hy - 0.05 ? hz - 1.2 : hz; return 1;
  }, (A, B, z, top, k, x, y) => {
    const inner = Math.abs(A) < hx - 0.05 && Math.abs(B) < hy - 0.05;
    if (top && inner) return pickc(T.water, 3 + (fract((A + B) * 6) < 0.1 ? 2 : 0), x, y);
    if (top) return pickc(WOOD, 4.4 + gr2(x, y, 1), x, y);
    const f = boxFace(A, B, hx, hy);
    return pickc(WOOD, (f ? 1.6 : 3) + (fract(z / 2.2) < 0.18 ? -1 : 0) + gr2(x, y, 2) * 0.5, x, y);
  });
}

// sacs de sable : un muret de sacs de toile en coussins, posés en quinconce sur trois rangs, coutures et liens
const BURLAP = ramp('30200f 4e3519 6a4a24 86602f a07a3e b8925a cca872');
function sandSprite(T, vr) {
  const alongA = vr & 1;
  const sacks = [];
  for (const [p, q, z] of [[-0.25, 0.1, 0], [0, 0.1, 0], [0.25, 0.1, 0], [-0.25, -0.12, 0], [0, -0.12, 0], [0.25, -0.12, 0], [-0.125, -0.01, 3.4], [0.125, -0.01, 3.4]]) {
    sacks.push(alongA ? [p, q, z] : [q, p, z]);
  }
  // un sac : coussin (super-ellipse), plus haut au milieu ; renvoie la hauteur et le sac le plus haut
  let which = 0;
  const fh = (A, B) => {
    let h = 0;
    for (let i = 0; i < sacks.length; i++) {
      const [sa, sb, z0] = sacks[i], rx = alongA ? 0.13 : 0.115, ry = alongA ? 0.115 : 0.13;
      const qd = ((A - sa) / rx) ** 4 + ((B - sb) / ry) ** 4;
      if (qd < 1) { const v = z0 + 3.6 * Math.pow(1 - qd, 0.3); if (v > h) { h = v; which = i; } }
    }
    return h;
  };
  return voxel(0.44, 9, (A, B, iv) => { const h = fh(A, B); if (h <= 0.3) return 0; iv[0] = 0; iv[1] = h; return 1; }, (A, B, z, top, k, x, y) => {
    fh(A, B);
    const s = sacks[which], li = hfLit(fh, A, B), along = alongA ? A - s[0] : B - s[1];
    if (T.snowy && li > 0.62 && s[2] > 0) return pickc(SNOWR, 3 + li, x, y);
    let lv = 0.4 + li * 5.4 + gr2(x, y, 4) * 0.6 + (hsh(x, y >> 1, 9) - 0.5) * 0.4;
    if (Math.abs(Math.abs(along) - 0.1) < 0.012) lv -= 1.2; // liens aux deux bouts
    if (Math.abs((alongA ? B - s[1] : A - s[0])) < 0.008) lv -= 0.8; // couture
    return pickc(BURLAP, lv, x, y);
  });
}

// table ronde du saloon, deux chaises, verres, bouteille ou cartes
function tableSprite(T, vr) {
  const rt = 0.3, zt = 6.6, a0 = hsh(vr, 4, 7) * Math.PI * 2;
  const chairs = [a0, a0 + Math.PI * (0.8 + hsh(vr, 5, 7) * 0.4)].map((a) => [Math.cos(a) * 0.38, Math.sin(a) * 0.38, a]);
  return voxel(0.56, 12, (A, B, iv) => {
    let m = 0;
    const rho = Math.hypot(A, B);
    if (rho < rt) { iv[0] = rho < 0.05 ? 0 : zt - 0.9; iv[1] = zt; m = 1; }
    else if (rho < 0.13) { iv[0] = 0; iv[1] = 0.8; m = 1; }
    for (const [ca, cb, a] of chairs) {
      const da = A - ca, db = B - cb;
      const u = da * Math.cos(a) + db * Math.sin(a), w = -da * Math.sin(a) + db * Math.cos(a);
      if (Math.abs(u) < 0.1 && Math.abs(w) < 0.1) {
        if (u > 0.065) { iv[2 * m] = 0; iv[2 * m + 1] = 9.5; m++; } // dossier
        else if (Math.abs(w) > 0.07 && Math.abs(u) > 0.06) { iv[2 * m] = 0; iv[2 * m + 1] = 4.2; m++; } // pieds
        else { iv[2 * m] = 3.4; iv[2 * m + 1] = 4.2; m++; }
      }
    }
    return m;
  }, (A, B, z, top, k, x, y) => {
    const rho = Math.hypot(A, B);
    if (k === 0 && rho < rt) {
      if (top) return pickc(WOOD, 3.6 + (rho > rt - 0.03 ? 1 : 0) + (vnoise(A * 30, B * 6, vr) - 0.5) * 1.2, x, y);
      return pickc(WOOD, rho < 0.05 ? 1.4 + lit(A, B, 0) * 3 : 1.6 + lit(A, B, 0) * 3, x, y);
    }
    if (rho < 0.13 && k === 0) return pickc(DWOOD, 2 + (top ? 1 : 0), x, y);
    return pickc(WOOD, (top ? 4 : 1.6 + lit(A, B, 0) * 3) + gr2(x, y, 3) * 0.5, x, y);
  }, { post: (g, ox, oy) => {
    // ce qu'il y a sur la table : verres, bouteille, cartes ou jetons
    const at = (A, B, z) => [ox + (A - B) * HW * F, oy + (A + B) * HH * F - z * F];
    const R = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), w, h); };
    const kind = Math.floor(hsh(vr, 9, 7) * 3);
    const [gx, gy] = at(-0.1, 0.05, zt);
    R(gx, gy - 6, 3, 6, '#c8e0e8'); R(gx, gy - 6, 1, 6, '#ffffff'); R(gx, gy - 3, 3, 3, '#d8a040');
    const [hx2, hy2] = at(0.12, -0.08, zt);
    R(hx2, hy2 - 5, 3, 5, '#c8e0e8'); R(hx2 + 2, hy2 - 5, 1, 5, '#8aa8b4');
    if (kind === 0) { const [bx, by] = at(0.02, 0.1, zt); R(bx, by - 14, 4, 10, '#2a5a2a'); R(bx + 1, by - 18, 2, 4, '#2a5a2a'); R(bx + 1, by - 13, 1, 7, '#6aa86a'); R(bx, by - 9, 4, 3, '#e8dcc0'); }
    else if (kind === 1) { const [cx, cy] = at(0.05, 0.1, zt); R(cx - 4, cy - 2, 5, 3, '#f4ecd8'); R(cx + 2, cy - 1, 5, 3, '#f4ecd8'); R(cx - 3, cy - 1, 1, 1, '#b8302a'); R(cx + 4, cy, 1, 1, '#1a1a1a'); }
    else { const [cx, cy] = at(0.06, 0.1, zt); for (let i = 0; i < 3; i++) { R(cx + i * 3, cy - 3 - i, 3, 2, ['#b8302a', '#f4ecd8', '#2a4ab0'][i]); } }
  } });
}

// comptoir du bar (raccordé à ses voisins) : dessus d'acajou ciré, panneaux, barre de laiton, bouteilles
function counterSprite(T, vr, mask) {
  const x0 = mask & 1 ? -0.5 : -0.4, x1 = mask & 2 ? 0.5 : 0.4, y0 = mask & 4 ? -0.5 : -0.4, y1 = mask & 8 ? 0.5 : 0.4, hz = 11;
  return voxel(0.5, hz + 8, (A, B, iv) => {
    if (A < x0 || A > x1 || B < y0 || B > y1) return 0;
    iv[0] = 0; iv[1] = hz; return 1;
  }, (A, B, z, top, k, x, y) => {
    if (top) {
      const e = Math.min(A - x0 + (mask & 1 ? 9 : 0), x1 - A + (mask & 2 ? 9 : 0), B - y0 + (mask & 4 ? 9 : 0), y1 - B + (mask & 8 ? 9 : 0));
      let lv = 2.2 + (vnoise((A + B) * 5, (A - B) * 30, 5) - 0.5) * 1.2;
      if (e < 0.04) lv += 2; else if (fract((A - B) * 1.5 + 0.2) < 0.08) lv += 1.4; // reflet ciré
      return pickc(DWOOD, lv, x, y);
    }
    const f = (x1 - A < y1 - B) ? 1 : 0, u = f ? B : A;
    let lv = f ? 1.4 : 2.6;
    if (z > hz - 1.2) lv += 1.4;
    else if (z < 2.2 && z > 1.2) return pickc(BRASS, f ? 2.6 : 4.2, x, y); // barre de laiton
    else {
      const pu = fract(u * 3 + 0.5);
      if (pu < 0.08 || pu > 0.92 || z < 3 || z > hz - 2.2) lv += 0.6; // cadres des panneaux
      else if (pu < 0.14 || z < 3.6) lv -= 0.8;
    }
    return pickc(DWOOD, lv + gr2(x, y, 6) * 0.5, x, y);
  }, { post: (g, ox, oy) => {
    const R = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), w, h); };
    const cols = [['#2a5a2a', '#6aa86a'], ['#5a2e14', '#a8643a'], ['#a8c8d0', '#ffffff'], ['#6a1a14', '#c84a3a']];
    const n = 1 + Math.floor(hsh(vr, 8, 3) * 3);
    for (let i = 0; i < n; i++) {
      const A = -0.25 + hsh(vr, 20 + i, 3) * 0.5, B = -0.2 + hsh(vr, 30 + i, 3) * 0.4;
      const sx = ox + (A - B) * HW * F, sy = oy + (A + B) * HH * F - hz * F;
      const [c0, c1] = cols[Math.floor(hsh(vr, 40 + i, 3) * 4)];
      if (hsh(vr, 50 + i, 3) < 0.35) { R(sx, sy - 5, 3, 5, '#c8e0e8'); R(sx, sy - 5, 1, 5, '#ffffff'); }
      else { R(sx, sy - 12, 4, 12, c0); R(sx + 1, sy - 17, 2, 5, c0); R(sx + 1, sy - 11, 1, 8, c1); R(sx, sy - 7, 4, 3, '#e8dcc0'); }
    }
  } });
}

// barrière raccordée à ses voisines : poteaux et lisses (bois), palissade blanche (ville), muret d'adobe (hacienda),
// balustrade (saloon)
function fenceSprite(T, vr, mask) {
  const kind = T.fence, ha = (mask & 3) !== 0 || !(mask & 12), hb = (mask & 12) !== 0;
  const runs = [];
  if (ha) runs.push([mask & 1 || !(mask & 3) ? -0.5 : 0, mask & 2 || !(mask & 3) ? 0.5 : 0, 'a']);
  if (hb) runs.push([mask & 4 ? -0.5 : 0, mask & 8 ? 0.5 : 0, 'b']);
  const onRun = (A, B, th) => runs.some(([l0, l1, ax]) => { const al = ax === 'a' ? A : B, cr = ax === 'a' ? B : A; return al >= l0 && al <= l1 && Math.abs(cr) < th; });
  if (kind === 'adobe') {
    const fh = (A, B) => (onRun(A, B, 0.15) ? 8 : 0);
    return voxel(0.5, 10, (A, B, iv) => { const h = fh(A, B); if (!h) return 0; iv[0] = 0; iv[1] = h; return 1; }, (A, B, z, top, k, x, y) => {
      if (top) return pickc(TERRA, 3.4 + (fract((A - B) * 7) < 0.3 ? -1 : 0), x, y);
      const f = hb && !ha ? 1 : ha && !hb ? 0 : (Math.abs(B) > Math.abs(A) ? 0 : 1);
      if (z > 6.8) return pickc(TERRA, f ? 1.8 : 3, x, y);
      return pickc(STUCCO, (f ? 1.8 : 3.4) + gr2(x, y, 3) * 0.6 + (z < 1.5 ? -0.8 : 0), x, y);
    });
  }
  const pal = kind === 'picket' ? FACADES[1] : kind === 'balustre' ? DWOOD : WOOD;
  const hz = kind === 'picket' ? 8 : kind === 'balustre' ? 8.5 : 8.6;
  return voxel(0.5, 11, (A, B, iv) => {
    let m = 0;
    if (Math.abs(A) < 0.065 && Math.abs(B) < 0.065) { iv[0] = 0; iv[1] = hz + 0.8; return 1; } // poteau
    for (const [l0, l1, ax] of runs) {
      const al = ax === 'a' ? A : B, cr = ax === 'a' ? B : A;
      if (al < l0 || al > l1 || Math.abs(cr) > 0.04) continue;
      if (kind === 'picket') {
        const pf = fract(al * 8 + 0.5);
        if (pf < 0.55) { iv[0] = 0; iv[1] = hz - Math.abs(pf - 0.275) * 6; return 1; }
        iv[0] = 2.2; iv[1] = 3.2; iv[2] = 5.6; iv[3] = 6.6; return 2;
      }
      if (kind === 'balustre') {
        if (Math.abs(fract(al * 7 + 0.5) - 0.5) < 0.13) { iv[0] = 0; iv[1] = hz; return 1; }
        iv[0] = 0; iv[1] = 0.9; iv[2] = hz - 1.2; iv[3] = hz; return 2;
      }
      if (kind === 'attache') { iv[2 * m] = 6; iv[2 * m + 1] = 7.3; m++; continue; }
      iv[2 * m] = 3; iv[2 * m + 1] = 4.3; iv[2 * m + 2] = 6.3; iv[2 * m + 3] = 7.6; m += 2;
    }
    return m;
  }, (A, B, z, top, k, x, y) => {
    if (top && T.snowy) return pickc(SNOWR, 3.4, x, y);
    const isPost = Math.abs(A) < 0.065 && Math.abs(B) < 0.065;
    let lv = top ? 4.2 : 0;
    if (!top) {
      const f = isPost ? (0.065 - A < 0.065 - B ? 1 : 0) : (hb && !ha ? 1 : 0);
      lv = f ? 1.6 : 3.2;
    }
    if (kind === 'picket') lv += 0.6;
    return pickc(pal, lv + gr2(x, y, 5) * 0.7, x, y);
  });
}

// ------------------------------------------------------------ poteaux, cactus, sapins (plein couvert, étroits)
function pillarSprite(T, vr) {
  const kind = T.pillar;
  if (kind === 'saguaro') {
    // tronc à côtes, un ou deux bras qui remontent
    const hz = 22 + hsh(vr, 1, 3) * 6, arms = [];
    const n = 1 + (hsh(vr, 2, 3) > 0.4 ? 1 : 0);
    for (let i = 0; i < n; i++) {
      const dir = (hsh(vr, 3 + i, 3) > 0.5) === (i === 0) ? [0.2, 0] : [0, -0.2];
      if (i === 1) { dir[0] = -dir[0] || 0; dir[1] = dir[1] ? 0 : 0.2; if (!dir[0] && !dir[1]) dir[0] = -0.2; }
      arms.push({ ca: dir[0], cb: dir[1], z0: 8 + hsh(vr, 5 + i, 3) * 6, z1: 0 });
      arms[i].z1 = arms[i].z0 + 6 + hsh(vr, 7 + i, 3) * 4;
    }
    const rT = 0.095, rA = 0.07;
    return voxel(0.34, hz + 2, (A, B, iv) => {
      let m = 0;
      const rho = Math.hypot(A, B);
      if (rho < rT) { iv[0] = 0; iv[1] = hz + Math.sqrt(1 - (rho / rT) ** 2) * 2 - 2; m = 1; }
      for (const a of arms) {
        const da = A - a.ca, db = B - a.cb, d = Math.hypot(da, db);
        if (d < rA) { iv[2 * m] = a.z0 + 1; iv[2 * m + 1] = a.z1 + Math.sqrt(1 - (d / rA) ** 2) * 1.5 - 1.5; m++; continue; }
        // le coude horizontal entre le tronc et le bras
        const L = Math.hypot(a.ca, a.cb), ux = a.ca / L, uy = a.cb / L, al = A * ux + B * uy, cr = -A * uy + B * ux;
        if (al > 0 && al < L && Math.abs(cr) < rA * 0.9) { const dz = Math.sqrt(1 - (cr / rA) ** 2) * 1.5; iv[2 * m] = a.z0 - dz; iv[2 * m + 1] = a.z0 + dz + 1; m++; }
      }
      return Math.min(m, 3);
    }, (A, B, z, top, k, x, y) => {
      let ca = 0, cb = 0;
      for (const a of arms) if (Math.hypot(A - a.ca, B - a.cb) < rA + 0.01 && k > 0) { ca = a.ca; cb = a.cb; }
      const da = A - ca, db = B - cb, ang = Math.atan2(db, da), li = lit(da, db, top ? 1 : 0.15);
      let lv = 0.8 + li * 5;
      if (fract(ang / (2 * Math.PI) * 9) < 0.28) lv -= 1;
      if (hsh(x, y, vr + 5) > 0.93) return hex('e8dca0');
      return pickc(CACT, lv, x, y);
    }, { post: (g, ox, oy) => { if (hsh(vr, 9, 3) > 0.5) { g.fillStyle = '#f4f0e0'; g.fillRect(ox - 2, oy - hz * F - 1, 4, 3); g.fillStyle = '#f0d040'; g.fillRect(ox - 1, oy - hz * F, 2, 1); } } });
  }
  if (kind === 'pine') {
    // sapin : étages de branches en cônes, neige sur le dessus des étages (neige)
    const tiers = [], nt = 4, top0 = 25 + hsh(vr, 1, 3) * 4;
    for (let i = 0; i < nt; i++) tiers.push({ z: 3.5 + i * (top0 - 10) / nt, r: 0.3 - i * 0.055, h: 9 - i * 0.6 });
    return voxel(0.34, top0 + 2, (A, B, iv) => {
      const rho = Math.hypot(A, B);
      let m = 0;
      if (rho < 0.045) { iv[0] = 0; iv[1] = 4; m = 1; }
      for (const t of tiers) if (rho < t.r && m < 4) { iv[2 * m] = t.z; iv[2 * m + 1] = t.z + (1 - rho / t.r) * t.h; m++; }
      return m;
    }, (A, B, z, top, k, x, y) => {
      const rho = Math.hypot(A, B) || 0.001;
      if (k === 0 && rho < 0.045 && z < 4.2) return pickc(BARK, 1 + lit(A, B, 0) * 3, x, y);
      const li = lit(A / rho, B / rho, 1.1);
      let tz = 0;
      for (const t of tiers) if (rho < t.r) { const hz2 = t.z + (1 - rho / t.r) * t.h; if (Math.abs(z - hz2) < 1.3) tz = 1; }
      if (T.snowy && tz && hsh(x >> 1, y >> 1, vr) > 0.3) return pickc(SNOWR, 1.6 + li * 3.6, x, y);
      return pickc(PINE, 0.6 + li * 5 + (hsh(x >> 1, y, vr) - 0.5) * 1.4, x, y);
    });
  }
  if (kind === 'hoodoo') {
    // cheminée de fée : colonne de roche tendre en strates, coiffée d'une pierre dure
    const hz = 24 + hsh(vr, 1, 3) * 4;
    const prof = (z) => (z > hz - 3.5 ? 0.17 : 0.1 + Math.sin(z * 0.55 + vr) * 0.02 + (z < 6 ? (6 - z) * 0.012 : 0) - (z > hz - 7 ? 0.03 : 0));
    return voxel(0.34, hz + 2, lathe(hz, prof), (A, B, z, top, k, x, y) => {
      const li = lit(A, B, top ? 2 : 0.1), W2 = THEMES.canyon.wall;
      if (z > hz - 3.5) return pickc(W2.top, 1 + li * 5, x, y);
      const band = W2.bands[Math.floor(z / 3) % 3];
      return pickc(band, 0.8 + li * 5 + (fract(z / 3) < 0.2 ? -1 : 0) + gr2(x, y, 2) * 0.5, x, y);
    });
  }
  if (kind === 'pole') {
    // poteau télégraphique : traverse et isolateurs
    const hz = 28;
    return voxel(0.36, hz + 2, (A, B, iv) => {
      if (Math.hypot(A, B) < 0.05) { iv[0] = 0; iv[1] = hz; return 1; }
      if (Math.abs(A) < 0.035 && Math.abs(B) < 0.3) { iv[0] = hz - 4; iv[1] = hz - 2.6; return 1; }
      return 0;
    }, (A, B, z, top, k, x, y) => pickc(GREYW, 0.6 + lit(A, B, top ? 2 : 0.1) * 4.4 + (hsh(x, y >> 2, 3) - 0.5), x, y),
    { post: (g, ox, oy) => { for (const B of [-0.24, 0.24]) { const sx = ox + (0 - B) * HW * F, sy = oy + B * HH * F - (hz - 2.6) * F; g.fillStyle = '#8ac0b0'; g.fillRect(sx - 1, sy - 4, 3, 4); g.fillStyle = '#d8f0e8'; g.fillRect(sx - 1, sy - 4, 1, 2); } } });
  }
  if (kind === 'etai') {
    // étai de mine : poteau équarri, chapeau de bois, coin de calage
    const hz = 23;
    return voxel(0.4, hz + 4, (A, B, iv) => {
      if (Math.abs(A) < 0.07 && Math.abs(B) < 0.07) { iv[0] = 0; iv[1] = hz; return 1; }
      if (Math.abs(A) < 0.34 && Math.abs(B) < 0.08) { iv[0] = hz - 0.2; iv[1] = hz + 2.6; return 1; }
      return 0;
    }, (A, B, z, top, k, x, y) => {
      const f = top ? -1 : z > hz - 0.3 ? boxFace(A, B, 0.34, 0.08) : boxFace(A, B, 0.07, 0.07);
      let lv = f < 0 ? 4 : f ? 1.4 : 2.8;
      if (z > hz - 0.3 && z < hz + 0.6 && f >= 0) lv -= 0.8;
      return pickc(WOOD, lv + (hsh(x, y >> 2, 3) - 0.5) * 1.1, x, y);
    });
  }
  if (kind === 'post' || kind === 'column') {
    // poteau tourné du saloon, ou colonne blanchie de la hacienda
    const col = kind === 'column', hz = col ? 27 : 26;
    const prof = col
      ? (z) => (z < 2.5 ? 0.16 : z < 3.5 ? 0.13 : z > hz - 2.5 ? 0.17 : z > hz - 4 ? 0.13 : 0.11 - (z / hz) * 0.015)
      : (z) => (z < 2 ? 0.12 : z > hz - 2 ? 0.12 : Math.abs(z - 6) < 0.8 || Math.abs(z - hz + 6) < 0.8 ? 0.09 : 0.07);
    return voxel(0.34, hz + 2, lathe(hz, prof), (A, B, z, top, k, x, y) => {
      const li = lit(A, B, top ? 2 : 0.12);
      if (col) return pickc(STUCCO, 1.8 + li * 4.6 + gr2(x, y, 2) * 0.5 + (z < 2.5 ? -0.6 : 0), x, y);
      return pickc(DWOOD, 1 + li * 5 + (vnoise(Math.atan2(B, A) * 2, z * 0.3, 4) - 0.5), x, y);
    });
  }
  if (kind === 'lamp') {
    // réverbère : fût de fonte, lanterne vitrée allumée
    const hz = 22;
    return voxel(0.32, hz + 7, (A, B, iv) => {
      const rho = Math.hypot(A, B);
      if (rho < 0.08 && rho >= 0) { if (rho < 0.04) { iv[0] = 0; iv[1] = hz + 6; return 1; } if (rho < 0.08) { iv[0] = hz; iv[1] = hz + 5; return 1; } }
      if (rho < 0.1) { iv[0] = 0; iv[1] = 2; return 1; }
      return 0;
    }, (A, B, z, top, k, x, y) => {
      const rho = Math.hypot(A, B);
      if (z > hz + 0.6 && z < hz + 4.4 && rho > 0.04) return pickc(BRASS, 3.6 + lit(A, B, 0.2) * 2, x, y);
      return pickc(IRON, 1 + lit(A, B, top ? 2 : 0.1) * 4, x, y);
    }, { post: (g, ox, oy) => { g.fillStyle = '#fff4c0'; g.fillRect(ox - 1, oy - (hz + 3.5) * F, 2, 6); } });
  }
  return null;
}

// arbre de la forêt (case de mur) : sapin haut ou feuillu en boules, gardé en variantes
function treeSprite(T, vr, force = null) {
  const pine = force == null ? hsh(vr, 1, 11) < 0.55 : force;
  if (pine) {
    const tiers = [], nt = 5, top0 = 27 + hsh(vr, 2, 11) * 3;
    for (let i = 0; i < nt; i++) tiers.push({ z: 4 + i * (top0 - 11) / nt, r: 0.48 - i * 0.075, h: 10 - i * 0.6 });
    return voxel(0.5, top0 + 2, (A, B, iv) => {
      const rho = Math.hypot(A, B);
      let m = 0;
      if (rho < 0.06) { iv[0] = 0; iv[1] = 5; m = 1; }
      for (const t of tiers) if (rho < t.r && m < 5) { iv[2 * m] = t.z; iv[2 * m + 1] = t.z + (1 - rho / t.r) * t.h; m++; }
      return Math.min(m, 6);
    }, (A, B, z, top, k, x, y) => {
      const rho = Math.hypot(A, B) || 0.001;
      if (k === 0 && rho < 0.06 && z < 5.2) return pickc(BARK, 1 + lit(A, B, 0) * 3, x, y);
      const li = lit(A / rho, B / rho, 1);
      return pickc(PINE, 0.5 + li * 5.2 + (hsh(x >> 1, y, vr) - 0.5) * 1.4 + (vnoise(x / 5, y / 4, vr) - 0.5), x, y);
    });
  }
  const balls = [];
  const nb = 5;
  for (let i = 0; i < nb; i++) {
    const a = (i / nb) * Math.PI * 2 + hsh(vr, 3 + i, 11);
    const d = i === 0 ? 0 : 0.16 + hsh(vr, 9 + i, 11) * 0.08;
    balls.push({ a: Math.cos(a) * d, b: Math.sin(a) * d, z: (i === 0 ? 21 : 15 + hsh(vr, 14 + i, 11) * 4), r: i === 0 ? 7.5 : 5.6 + hsh(vr, 19 + i, 11) * 1.8 });
  }
  const autumn = hsh(vr, 30, 11) < 0.25;
  const pal = autumn ? ramp('2a1208 4a2010 6e3414 944a1c b8662a d4883c e8aa58') : LEAF;
  return voxel(0.56, 30, (A, B, iv) => {
    let lo = 99, hi = -1;
    for (const s of balls) {
      const d2 = ((A - s.a) ** 2 + (B - s.b) ** 2) * 400;
      if (d2 < s.r * s.r) { const dz = Math.sqrt(s.r * s.r - d2); lo = Math.min(lo, s.z - dz * 0.9); hi = Math.max(hi, s.z + dz); }
    }
    let m = 0;
    if (Math.hypot(A, B) < 0.07) { iv[0] = 0; iv[1] = hi > 0 ? lo + 1 : 13; m = 1; }
    if (hi > 0) { iv[2 * m] = lo; iv[2 * m + 1] = hi; m++; }
    return m;
  }, (A, B, z, top, k, x, y) => {
    if (k === 0 && Math.hypot(A, B) < 0.07 && z < 13.5) return pickc(BARK, 0.6 + lit(A, B, 0) * 4 + (hsh(x, y >> 2, 2) - 0.5), x, y);
    let best = balls[0], bv = -9;
    for (const s of balls) { const d = Math.hypot((A - s.a) * 20, (B - s.b) * 20, z - s.z) / s.r; const v2 = 1 - Math.abs(1 - d); if (v2 > bv) { bv = v2; best = s; } }
    const li = lit((A - best.a) * 20, (B - best.b) * 20, z - best.z);
    let lv = 0.6 + li * 5.2 + (vnoise(x / 5, y / 4, vr) - 0.5) * 1.4 + (hsh(x >> 1, y >> 1, vr) - 0.5) * 0.6;
    if (vnoise(x / 3.2, y / 3.2, vr + 3) < 0.2) lv -= 1.3;
    return pickc(pal, lv, x, y);
  });
}

// ------------------------------------------------------------ buissons (on y passe) : deux images, ils ondulent
const SAGE = ramp('2e3018 46482a 5e5e38 787648 949060 aeaa78');
const SCRUB = ramp('3a2410 563618 724a22 8e602e a87a3e c09452');
const AGAVE = ramp('16302c 22463e 305e52 427868 5a9280 7aae98 a0c8b4');
const SHROOM = ramp('1a2830 2a4250 3e6474 5a8a9c 86b8c4 c0e4e8');
function bushSprite(T, vr, frame) {
  const kind = T.bush, r = (i) => hsh(vr * 17 + i, 31, 401);
  const Wd = 144, Hd = 112, ox = 72, oy = 84;
  // points du losange (au sol) : A, B dans [-0.4, 0.4] → pixels fins
  const at = (A, B) => [(A - B) * HW * F, (A + B) * HH * F];
  if (kind === 'grass' || kind === 'fern' || kind === 'agave' || kind === 'pot') {
    const blades = [], n = kind === 'agave' ? 14 : kind === 'pot' ? 9 : 26;
    for (let i = 0; i < n; i++) {
      let bx, by;
      if (kind === 'agave' || kind === 'pot') { bx = (r(i) - 0.5) * 10; by = (r(i + 60) - 0.5) * 6 - (kind === 'pot' ? 26 : 0); }
      else { [bx, by] = at((r(i) - 0.5) * 0.8, (r(i + 60) - 0.5) * 0.8); }
      const lean = kind === 'agave' ? (r(i + 80) - 0.5) * 60 : kind === 'pot' ? (r(i + 80) - 0.5) * 70 : kind === 'fern' ? (r(i + 80) - 0.5) * 34 : (r(i + 80) - 0.5) * 12;
      const h = kind === 'agave' ? 22 + r(i + 40) * 18 : kind === 'pot' ? 22 + r(i + 40) * 16 : kind === 'fern' ? 22 + r(i + 40) * 20 : 20 + r(i + 40) * 26;
      blades.push({ x: bx, y: by, h, w: kind === 'agave' ? 5 : kind === 'fern' ? 3 : kind === 'pot' ? 4 : 2, lean });
    }
    blades.sort((a, b) => a.y - b.y || a.h - b.h);
    const pal = kind === 'agave' ? AGAVE : kind === 'grass' ? T.wall.moss || LEAF : LEAF;
    const sway = frame ? 3 : 0;
    return sprite2(Wd, Hd, ox, oy, (x, y) => {
      if (kind === 'pot') {
        // le pot de terre cuite
        const py = y + 10;
        if (py > -22 && py <= 0 && Math.abs(x) <= 13 - (py < -18 ? -2 : 0) + py * 0.12) return pickc(TERRA, (py < -18 ? 4 : 1.6) + (x < 0 ? 1.4 : 0) - (py > -4 ? 0.8 : 0), x, y);
      }
      let col = 0;
      for (const b of blades) {
        const t = (b.y - y) / b.h;
        if (t < 0 || t > 1) continue;
        const bx = b.x + b.lean * t * t + sway * t * t * (kind === 'agave' ? 0.3 : 1);
        if (Math.abs(x - bx) > b.w * (1 - t * (kind === 'agave' ? 0.9 : 0.6)) + 0.3) continue;
        let lv = 1 + t * 3.6 + (bx > x ? 0.6 : 0);
        if (kind === 'fern' && fract(t * 7) < 0.3) lv -= 0.8;
        col = pickc(pal, lv, x, y);
        if (kind === 'agave' && t > 0.92) col = hex('3a2a18');
      }
      if (!col && kind === 'agave' && hsh(vr, 5, 2) > 0.4) {
        // une hampe fleurie
        if (Math.abs(x - 4) < 1 && y < -16 && y > -60) return pickc(STRAW, 2 + (x > 4 ? 0 : 1), x, y);
        if (Math.hypot(x - 4, y + 62) < 5) return FLOWERS[0];
      }
      return col;
    }, kind !== 'grass' && kind !== 'fern');
  }
  if (kind === 'shroom') {
    const caps = [];
    for (let i = 0; i < 6; i++) { const [cx, cy] = at((r(i) - 0.5) * 0.7, (r(i + 9) - 0.5) * 0.7); caps.push({ x: cx, y: cy, h: 6 + r(i + 18) * 14, rr: 4 + r(i + 27) * 6 }); }
    caps.sort((a, b) => a.y - b.y);
    return sprite2(Wd, Hd, ox, oy, (x, y) => {
      let col = 0;
      for (const c of caps) {
        if (Math.abs(x - c.x) < 1.5 && y <= c.y && y > c.y - c.h) col = pickc(STRAW, 4.5, x, y);
        const dx = (x - c.x) / c.rr, dy = (y - (c.y - c.h)) / (c.rr * 0.6);
        if (dx * dx + dy * dy < 1 && dy < 0.4) col = pickc(SHROOM, 2 + (frame ? 0.6 : 0) - dx * 1.2 - dy * 1.5 + (hsh(x >> 1, y >> 1, 3) > 0.85 ? 1.5 : 0), x, y);
      }
      return col;
    });
  }
  if (kind === 'tumble') {
    // virevoltant : boule de brindilles emmêlées, quelques herbes sèches
    const cx = (r(1) - 0.5) * 12, cy = -18;
    return sprite2(Wd, Hd, ox, oy, (x, y) => {
      const dx = x - cx - (frame ? 1 : 0), dy = (y - cy) * 1.1, d = Math.hypot(dx, dy);
      if (d < 20) {
        const ang = Math.atan2(dy, dx);
        const tw = Math.abs(Math.sin(ang * 5 + d * 0.5)) < 0.22 || Math.abs(Math.sin(ang * 3 - d * 0.45 + 1)) < 0.18 || d > 18.5;
        if (tw && hsh(x, y, 9) > 0.12) return pickc(SCRUB, 2.4 - (dx + dy) / 18 + (d > 18.5 ? -0.5 : 0), x, y);
      }
      if (y < 0 && y > -10 && Math.abs(x + 14) < 8 && hsh(x, 3, 5) > 0.7 && (x + 14) % 3 === 0) return pickc(STRAW, 2 + (-y) / 6, x, y);
      return 0;
    }, false);
  }
  // touffes rondes : sauge, broussailles, buisson enneigé
  const pal = kind === 'scrub' ? SCRUB : kind === 'snowbush' ? PINE : SAGE;
  const blobs = [];
  for (let i = 0; i < 7; i++) { const [bx, by] = at((r(i) - 0.5) * 0.7, (r(i + 9) - 0.5) * 0.7); blobs.push({ x: bx, y: by - 14 - r(i + 18) * 12, rr: 13 + r(i + 27) * 9 }); }
  blobs.sort((a, b) => a.y - b.y);
  return sprite2(Wd, Hd, ox, oy, (x, y) => {
    const sw = frame ? 1 : 0;
    let col = 0;
    for (const b of blobs) {
      const dx = (x - b.x - sw * (b.y < -24 ? 1 : 0)) / b.rr, dy = (y - b.y) / (b.rr * 0.85), qd = dx * dx + dy * dy;
      if (qd > 1 + (hsh(x, y, 7) - 0.5) * 0.35) continue;
      if (kind === 'snowbush' && dy < -0.3 + (hsh(x >> 2, 1, 3) - 0.5) * 0.3) col = pickc(SNOWR, 3.4 - qd, x, y);
      else col = pickc(pal, 2.6 - (dx + dy) * 1.2 - qd * 0.6 + (hsh(x >> 1, y >> 1, 3) - 0.5) * 0.9, x, y);
    }
    if (!col && kind === 'scrub' && y > -16 && y < 2 && hsh(x, y >> 2, 4) > 0.9) return pickc(SCRUB, 1, x, y);
    return col;
  });
}

// lanterne de mine (posée au sol ou accrochée) : dessinée à chaque image par drawScene (sa flamme vacille)
function lanternSprite() {
  return sprite2(40, 120, 20, 112, (x, y) => {
    if (Math.abs(x) <= 1 && y > -96 && y <= 0) return pickc(WOOD, x < 1 ? 3 : 2, x, y); // le piquet
    if (y > -100 && y <= -96 && x > -8 && x < 4) return pickc(WOOD, 3, x, y);
    const lx = x + 6, ly = y + 82;
    if (Math.abs(lx) <= 4 && ly > -10 && ly <= 4) {
      if (ly < -8 || ly > 2 || Math.abs(lx) === 4) return pickc(IRON, 3 + (lx < 0 ? 1 : 0), x, y);
      return hex(Math.abs(lx) < 2 && ly > -6 ? 'fff4c0' : 'f8b040');
    }
    if (Math.abs(lx) <= 1 && ly > -14 && ly <= -10) return pickc(IRON, 2, x, y);
    return 0;
  });
}


// ------------------------------------------------------------ matières du sol et styles de murs (map.deco)
// La carte dit ce que représente chaque case (DECO de pistemaps.js) : le rendu en tire la matière du sol (plancher surélevé
// des bâtiments et des trottoirs, estrade, usure, rue, pavés, pont, gué, glace…) et le style des murs (roche, mesa, galerie,
// mur de planches d'un bâtiment, adobe, maison, tour), pour que chaque thème garde une palette et un vocabulaire cohérents.
const MAT = { DEF: 0, PLANK: 1, STAGE: 2, WORN: 3, TRAIL: 4, PAVE: 5, BRIDGE: 6, FORD: 7, ICE: 8, RUG: 9, DOOR: 10, BREACH: 11, FIRE: 12, MUD: 13, FROZEN: 14, FOUNTAIN: 15, TROUGH: 16, WELL: 17 };
// hauteur du sol (pixels du jeu) selon la matière
const MATH_ = { [MAT.PLANK]: 1.5, [MAT.STAGE]: 4, [MAT.RUG]: 1.5, [MAT.BRIDGE]: 1.5, [MAT.DOOR]: 1.5 };
// le nom de la déco → matière du sol
const DECO_MAT = { PLANCHER: MAT.PLANK, ESTRADE: MAT.STAGE, USURE: MAT.WORN, PISTE: MAT.TRAIL, PAVE: MAT.PAVE, PONT: MAT.BRIDGE, GUE: MAT.FORD,
  GLACE: MAT.ICE, TAPIS: MAT.RUG, PORTE: MAT.DOOR, PORTAIL: MAT.DOOR, BRECHE: MAT.BREACH, FEU: MAT.FIRE, BOUE: MAT.MUD, FONTAINE: MAT.FOUNTAIN,
  ABREUVOIR: MAT.TROUGH, PUITS: MAT.WELL };
// les noms des décos, lus dans pistemaps.js s'il est là (sinon : aucune déco, le thème décide)
const DN = (() => { const o = {}; for (const [k, v] of Object.entries(DECO || {})) o[v] = k; return o; })();
const PLANKR = ramp('3a2214 4c2e1a 5e3a20 704626 82532e 946238 a6724a b8845a');
const BOARDR = ramp('3a2a1c 4e3a28 644c34 7a5e42 8e7050 a28462 b49674');
const STAGER = ramp('2a140c 3a1c10 4e2816 623420 764229 8a5234');
const ICER = ramp('5a7a98 7090b0 88a8c8 a2c0dc bcd6ec d6e8f6 eef6fc');
const MUDR = ramp('1e140c 2a1c10 3a2816 4a3420 5a4028 6c4e32');
const STONER = ramp('3e3a34 56504a 6e685e 868074 9e9888 b6b09e cec8b6');

// plancher : lattes le long de U (ou de V), joints, veinures, raccords décalés, clous ; usé : plus clair, plus lisse
function plankPix(v, q, R, lv0, alongV, worn) {
  const U = alongV ? q.V : q.U, Vv = alongV ? q.U : q.V;
  const p = (Vv + 0.5) * 4, idx = Math.floor(p), fr = p - idx;
  const su = (U + hsh(idx, 7, v.seed) * 3) / 2.5, seg = Math.floor(su), sf = (su - seg) * 2.5;
  let lv = lv0 + (hsh(idx, seg, v.seed) - 0.5) * (worn ? 0.6 : 1.0) + (vnoise(U * 2.2, idx * 3.1, v.seed + 4) - 0.5) * (worn ? 0.4 : 0.8) + (q.g - 0.5) * 0.3 + (q.nb - 0.5) * 0.6;
  const vein = fract(fr * 2.6 + vnoise(U * 1.4, idx, v.seed + 9) * 1.6);
  if (vein < 0.1 && !worn) lv -= 0.6;
  if (worn) lv += 0.7 + (q.nm - 0.5) * 0.6;
  if (fr < 0.075) lv -= worn ? 1.6 : 2.3;
  else if (fr > 0.92) lv += 0.5;
  if (sf < 0.025) lv -= 1.8;
  else if (sf < 0.09 && (Math.abs(fr - 0.3) < 0.07 || Math.abs(fr - 0.72) < 0.07)) lv -= 1.5;
  return pickc(R, lv, q.X, q.Y);
}
// rue de terre battue (ville, saloon) : sillons, crottin de poussière, plus sombre au milieu
const STREETR = ramp('4e3420 62422a 785234 8c6240 a07250 b28260 c29470');

// mur de planches d'un bâtiment, coupé à hauteur d'homme : chapeau sombre ; dehors planches à clin peintes, dedans
// planches verticales et lambris (lampes à huile) ; fenêtres (FENETRE), porte fermée (PORTE_CLOSE), étagère (ETAGERE)
function paintWood(v, P, q) {
  const g = hsh(q.X >> 1, q.Y >> 1, v.seed + 7);
  if (q.top) {
    let lv = 1.2 + q.li * 2.6 + (g - 0.5) * 0.4;
    const e = edgeD(q.wi, q.a, q.b, 0);
    if (e < 0.08) lv += 1.6; else if (e < 0.11) lv -= 0.6;
    return pickc(P.top, lv, q.X, q.Y);
  }
  const t = q.face ? q.V : q.U, fx = fract(t + 0.5), dn = v.dn[q.i];
  const inside = q.face ? v.inR[q.i] : v.inL[q.i];
  const hc = hsh(q.x * 2 + q.face, q.y, v.seed + 91);
  const winD = dn === 'FENETRE', doorD = dn === 'PORTE_CLOSE', shelf = dn === 'ETAGERE';
  // fenêtre : cadre, croisillon, vitre (sombre de jour vue du dedans, claire la nuit vue du dehors si éclairée)
  const win = winD || (!v.hasDeco && hc < 0.3);
  if (win && fx > 0.24 && fx < 0.76 && q.z > 7.5 && q.z < 15.5) {
    const ex = Math.min(fx - 0.24, 0.76 - fx), ez = Math.min(q.z - 7.5, 15.5 - q.z);
    if (ex < 0.05 || ez < 0.9) return pickc(inside ? WOOD : FACADES[1], 3 + q.li * 3, q.X, q.Y);
    if (Math.abs(fx - 0.5) < 0.02 || Math.abs(q.z - 11.5) < 0.35) return pickc(inside ? WOOD : FACADES[1], 2.4 + q.li * 3, q.X, q.Y);
    const rf = fract((fx * 18 + q.z) / 9);
    return pickc(GLASS, (inside ? 2 : 1.2) + (rf < 0.18 ? 2.5 : 0) + q.li * 1.5, q.X, q.Y);
  }
  if (doorD && fx > 0.28 && fx < 0.72 && q.z < 13) {
    const ex = Math.min(fx - 0.28, 0.72 - fx);
    if (ex < 0.04 || q.z > 12.2) return pickc(WOOD, 4.2, q.X, q.Y);
    if (Math.abs(fx - 0.63) < 0.025 && Math.abs(q.z - 6) < 0.5) return pickc(BRASS, 4, q.X, q.Y);
    return pickc(DWOOD, 1.8 + q.li * 2.5 + (Math.abs(fx - 0.5) < 0.012 ? -1 : 0) + (fract(q.z / 4) < 0.08 ? -0.8 : 0), q.X, q.Y);
  }
  if (inside) {
    // étagère à bouteilles : trois planches, bouteilles de couleurs entre elles
    if (shelf && q.z > 3 && q.z < q.h - 2) {
      const zz = (q.z - 3) / 4.6, row = Math.floor(zz), fz = zz - row;
      if (fz < 0.14) return pickc(WOOD, 3.6 + q.li * 2, q.X, q.Y);
      const b = Math.floor(fx * 9), bf = fract(fx * 9), hb = hsh(b + row * 13, q.x * 3 + q.y, v.seed + 7);
      if (hb > 0.25 && bf > 0.2 && bf < 0.8 && fz < 0.75 - (bf < 0.35 || bf > 0.65 ? 0 : 0) && (fz < 0.55 || Math.abs(bf - 0.5) < 0.12)) {
        const cols = [ramp('0e2a14 1e4a24 3a7a3a 7ab87a'), ramp('2a1408 5a2e14 8a5022 c88a48'), ramp('3a4a50 6a8088 a8c0c8 e8f4f8'), ramp('3a0a08 6a1814 a83228 e86a5a')];
        const R = cols[Math.floor(hb * 4) & 3];
        return pickc(R, 1 + (bf < 0.4 ? 1.6 : 0.6) + q.li * 1.2 + (fz > 0.35 && fz < 0.45 ? 1 : 0), q.X, q.Y);
      }
      return pickc(DWOOD, 0.8 + q.li * 1.5, q.X, q.Y);
    }
    // lampe à huile sur une applique, et son halo sur les planches
    let glow = 0;
    if (!win && hc > 0.3 && hc < 0.46) {
      const dx = (fx - 0.5) * 18, dz = q.z - 13.5;
      if (Math.abs(dx) < 0.6 && dz > 0 && dz < 2) return dz > 1.3 ? hex('fff8d0') : hex('f8b040');
      if (Math.abs(dx) < 1.3 && dz > -1.6 && dz <= 0) return pickc(BRASS, 3 + q.li * 2 - (dz < -1 ? 1 : 0), q.X, q.Y);
      if (Math.abs(dx) < 0.4 && dz > -3.4 && dz <= -1.6) return pickc(BRASS, 2, q.X, q.Y);
      const r = Math.hypot(dx, dz * 1.2);
      if (r < 7) glow = (1 - r / 7) * 2;
    }
    const pl = (t + 0.5) * 6, idx = Math.floor(pl), fr = pl - idx;
    let lv = 1.4 + q.li * 4.2 + (hsh(idx, q.face, v.seed) - 0.5) * 0.8 + (vnoise(idx * 3, q.z * 0.5, v.seed) - 0.5) * 0.6 + glow;
    if (fr < 0.08) lv -= 1.4;
    if (q.z < 6.2) {
      lv -= 0.7;
      if (q.z > 5.4) lv += 2;
      else if (Math.abs(fract(fx * 2) - 0.5) > 0.42 || q.z < 0.8 || q.z > 4.8) lv += 0.6;
    }
    if (q.z > q.h - 1.2) lv += 1;
    return pickc(P.side, lv, q.X, q.Y);
  }
  // dehors : planches à clin peintes (la couleur du bâtiment), enseigne sous le chapeau, socle sombre
  const bid = v.bid[q.i], R = P.raw ? WOOD : FACADES[Math.floor(hsh(bid, 3, v.seed) * FACADES.length)];
  if (!P.raw && hsh(bid, 5, v.seed) < 0.55 && q.z > q.h - 5.2 && q.z < q.h - 1.2) {
    const ez = Math.min(q.z - (q.h - 5.2), q.h - 1.2 - q.z);
    if (ez < 0.5) return pickc(SIGNS, 2 + q.li * 2, q.X, q.Y);
    const lt = hsh(Math.floor((t + 9) * 11), Math.floor(q.z * 1.4), bid) > 0.55 && ez > 1;
    return lt ? pickc(SIGNS, 0.5, q.X, q.Y) : pickc(SIGNS, 3.6 + q.li * 1.5, q.X, q.Y);
  }
  let lv = 1.6 + q.li * 4 + (g - 0.5) * 0.4 + (vnoise(t * 3, q.z * 0.4, v.seed + bid) - 0.5) * 0.5;
  if (P.raw) { const pl = fract((t + 0.5) * 5); if (pl < 0.1) lv -= 1.3; lv += (hsh(Math.floor((t + 0.5) * 5), 1, v.seed) - 0.5) * 0.8; }
  else { const fz = fract(q.z / 2.25); if (fz < 0.2) lv -= 1.1; else if (fz > 0.85) lv += 0.4; }
  if (q.z < 1.2) lv -= 0.9;
  if (q.z > q.h - 1.2) lv += 0.8;
  return pickc(R, lv, q.X, q.Y);
}
const MUDT = { water: MUDR };
const PAVET = { path: STONER, plv: 3.2 };
const STREETT = { path: STREETR, plv: 2.8 };
// glace : reflets en biais, fêlures, bulles
function icePix(v, q) {
  const s = fract((q.U - q.V) * 2.2 + q.nm * 1.4);
  let lv = 3 + (q.nb - 0.5) * 1.4 + (s < 0.07 ? 1.6 : 0) + (q.g - 0.5) * 0.4;
  if (Math.abs(vnoise(q.U * 3, q.V * 3, v.seed + 87) - 0.5) < 0.012) lv += 2;
  if (hsh(q.X >> 1, q.Y >> 1, v.seed + 88) > 0.992) lv -= 2;
  return pickc(ICER, lv, q.X, q.Y);
}

// ------------------------------------------------------------ objets du décor tirés de la carte (map.deco)
// sprite tracé à la main : draw(P, R) ; P(x, y, col) pose un pixel fin, R(x, y, w, h, col) un rectangle (origine : le
// centre au sol de la case) ; contour sombre puis recadrage
function drawn(w, h, ox, oy, draw, outline = true) {
  const d = new Uint32Array(w * h);
  const P = (x, y, c) => { x = Math.round(x + ox); y = Math.round(y + oy); if (c && x >= 0 && y >= 0 && x < w && y < h) d[y * w + x] = c; };
  const R = (x, y, ww, hh, c) => { for (let j = 0; j < hh; j++) for (let i = 0; i < ww; i++) P(x + i, y + j, c); };
  draw(P, R);
  if (outline) outlineBuf(d, w, h);
  return cropped(d, w, h, ox, oy);
}
// trait épais d'un point à un autre (pixels fins), couleur fournie par col(t, côté) : t de 0 à 1 le long du trait
function stroke(P, x0, y0, x1, y1, w0, w1, col) {
  const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 1.5) + 1;
  for (let k = 0; k <= n; k++) {
    const t = k / n, x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t, ww = w0 + (w1 - w0) * t;
    for (let i = -Math.floor(ww / 2); i < Math.ceil(ww / 2); i++) P(x + i, y, col(t, (i + ww / 2) / ww));
  }
}
const PALMR = ramp('0e2a14 18401c 245a24 34742c 4a8e38 66a848 8cc060');
const STONEW = ramp('4a4640 625c54 7c766c 969082 b0aa9a cac4b2 e2dccc');

// palmier : tronc annelé un peu penché, couronne de palmes qui retombent
function palmSprite(vr) {
  const lean = (hsh(vr, 1, 3) - 0.5) * 30, top = -104;
  return drawn(170, 140, 85, 124, (P) => {
    stroke(P, 0, 0, lean, top, 9, 6, (t, s) => pickc(BARK, 1.2 + (s < 0.45 ? 1.6 : 0) + (fract(t * 14) < 0.25 ? -0.8 : 0.3), 0, Math.round(t * 99)));
    const n = 8;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + hsh(vr, k, 5), L = 34 + hsh(vr, k + 9, 5) * 12, dx = Math.cos(a), dy = Math.sin(a) * 0.5;
      for (let s = 0; s <= 1; s += 0.02) {
        const x = lean + dx * L * s, y = top + dy * L * s - 10 * s + 26 * s * s, ww = 1 + (1 - s) * 3;
        const up = dy < 0.1;
        for (let j = -ww; j <= ww; j++) P(x - dy * j * 0.6, y + j * 0.5, pickc(PALMR, (up ? 3.6 : 2) + (j < 0 ? 1 : -0.4) - s, k, j));
        if (fract(s * 12) < 0.4) { P(x + 2, y + 3, P_(PALMR, 2)); P(x - 2, y + 3, P_(PALMR, 2)); }
      }
    }
    for (let i = 0; i < 4; i++) P(lean - 3 + i * 2, top + 3, hex('6a4a1c'));
  });
}
const P_ = (R, l) => P(R, l);
// poêle de fonte : corps rond, porte rougeoyante, tuyau
function stoveSprite() {
  return voxel(0.3, 30, (A, B, iv) => {
    const r = Math.hypot(A, B);
    if (r < 0.05) { iv[0] = 0; iv[1] = 28; return 1; }
    if (r < 0.17) { iv[0] = 1.2; iv[1] = 12; return 1; }
    return 0;
  }, (A, B, z, top, k, x, y) => {
    const r = Math.hypot(A, B), li = lit(A, B, top ? 2 : 0.15), ang = Math.atan2(B, A);
    if (z < 12 && z > 4 && r > 0.1 && Math.abs(ang - Math.PI / 4) < 0.5) return z < 9 && z > 5 ? pickc(ramp('6a1808 b03010 f06020 ffb040 fff0a0'), 2 + (hsh(x, y, 3) > 0.5 ? 1 : 0), x, y) : pickc(IRON, 4, x, y);
    return pickc(IRON, 0.8 + li * 4.5 + (fract(z / 3) < 0.15 ? -0.6 : 0), x, y);
  });
}
// épouvantail : poteau, bras en croix, chemise, chapeau de paille, paille qui dépasse
function scarecrowSprite(vr) {
  return drawn(90, 130, 45, 120, (P, R) => {
    R(-1, -92, 3, 92, pickc(WOOD, 2.5, 0, 0));
    R(-26, -70, 52, 3, pickc(WOOD, 3, 0, 0));
    for (let y = -72; y < -44; y++) for (let x = -12 + (y > -60 ? 2 : 0); x <= 12 - (y > -60 ? 2 : 0); x++) P(x, y, pickc(ramp('3a1a10 6a2e1c 9a4a2a c06a3a'), 1.5 + (x < 0 ? 1 : 0) + (fract((x + 40) / 6) < 0.2 ? -0.8 : 0), x, y));
    for (let x = -26; x < -12; x++) for (let y = -72; y < -66; y++) P(x, y, pickc(ramp('3a1a10 6a2e1c 9a4a2a c06a3a'), 2.2, x, y));
    for (let x = 12; x < 26; x++) for (let y = -72; y < -66; y++) P(x, y, pickc(ramp('3a1a10 6a2e1c 9a4a2a c06a3a'), 1.2, x, y));
    for (let i = 0; i < 12; i++) { P(-28 - (i % 3), -70 + i % 4, P_(STRAW, 4)); P(28 + (i % 3), -70 + i % 4, P_(STRAW, 3)); P(-6 + i, -44 + (i % 3), P_(STRAW, 4)); }
    for (let y = -86; y < -72; y++) for (let x = -6; x <= 6; x++) if (Math.hypot(x, (y + 79) * 0.9) < 7) P(x, y, pickc(CANVAS, 3.6 - x * 0.1, x, y));
    P(-2, -80, hex('1a0f0a')); P(2, -80, hex('1a0f0a')); R(-2, -76, 5, 1, hex('3a2a1a'));
    for (let x = -14; x <= 14; x++) P(x, -86, P_(STRAW, 3.6)); for (let y = -94; y < -86; y++) for (let x = -7; x <= 7; x++) P(x, y, pickc(STRAW, 3 + (x < 0 ? 1 : 0), x, y));
  });
}
// gros tronc : écorce, sommet cassé, couronne haute (forêt)
function trunkSprite(vr) {
  const crown = hsh(vr, 2, 3) < 0.7;
  return voxel(0.5, 32, (A, B, iv) => {
    const r = Math.hypot(A, B), ang = Math.atan2(B, A);
    let m = 0;
    if (r < 0.13 + (hsh(Math.floor(ang * 3 + 9), 1, vr) - 0.5) * 0.02) { iv[0] = 0; iv[1] = (crown ? 22 : 16) + Math.sin(ang * 3 + vr) * 2; m = 1; }
    if (crown) {
      // couronne haute et bosselée, plus étroite en haut
      const d2 = ((A + 0.04) ** 2 + (B - 0.02) ** 2) * 400, rr = 7.5 + (vnoise(ang * 1.6 + vr, 2, 7) - 0.5) * 3;
      if (d2 < rr * rr) { const dz = Math.sqrt(rr * rr - d2); iv[2 * m] = 21 - dz * 0.6; iv[2 * m + 1] = 23 + dz * 1.7; m++; }
    }
    return m;
  }, (A, B, z, top, k, x, y) => {
    if (k === 1 || z > 22.5) {
      const li = lit((A + 0.04) * 20, (B - 0.02) * 20, (z - 23) * 0.6);
      return pickc(PINE, 0.8 + li * 5 + (hsh(x >> 1, y >> 1, vr) - 0.5) * 1.2 + (vnoise(x / 3, y / 3, vr) < 0.25 ? -1.2 : 0), x, y);
    }
    if (top) return pickc(STRAW, 3 + (fract(Math.hypot(A, B) * 30) < 0.3 ? -1 : 0), x, y);
    return pickc(BARK, 0.6 + lit(A, B, 0.1) * 4.6 + (hsh(Math.floor(Math.atan2(B, A) * 8), Math.floor(z / 2), vr) - 0.5) * 1.2, x, y);
  });
}
// arbre mort : tronc gris, branches nues en fourche
function deadTreeSprite(vr) {
  const r = (i) => hsh(vr, i, 13);
  return drawn(130, 140, 65, 130, (P) => {
    const col = (t, s) => pickc(GREYW, 1 + (s < 0.5 ? 1.4 : 0) - t * 0.4, 0, 0);
    stroke(P, 0, 0, 2, -60, 8, 5, col);
    const br = (x, y, a, L, w, d) => {
      const x1 = x + Math.cos(a) * L, y1 = y + Math.sin(a) * L * 0.8;
      stroke(P, x, y, x1, y1, w, Math.max(1, w * 0.6), col);
      if (d > 0) { br(x1, y1, a - 0.4 - r(d) * 0.3, L * 0.65, w * 0.6, d - 1); br(x1, y1, a + 0.35 + r(d + 5) * 0.3, L * 0.6, w * 0.6, d - 1); }
    };
    br(2, -58, -Math.PI / 2 - 0.5, 26, 4, 2);
    br(2, -50, -Math.PI / 2 + 0.6, 22, 3, 2);
    br(1, -36, -0.2, 16, 3, 1);
  });
}
// statue de pierre sur son socle (la fontaine de la hacienda, la place)
function statueSprite(vr) {
  const base = voxel(0.3, 30, (A, B, iv) => {
    const r = Math.hypot(A, B);
    if (r < 0.1) { iv[0] = 0; iv[1] = 25 - r * 20; return 1; }
    if (Math.abs(A) < 0.2 && Math.abs(B) < 0.2) { iv[0] = 0; iv[1] = 7; return 1; }
    return 0;
  }, (A, B, z, top, k, x, y) => {
    if (z <= 7) { const f = top ? -1 : boxFace(A, B, 0.2, 0.2); return pickc(STONEW, f < 0 ? 4.6 : f ? 2 : 3.4, x, y); }
    return pickc(STONEW, 1.4 + lit(A, B, top ? 2 : 0.2) * 4, x, y);
  }, { post: (g, ox, oy) => {
    // la figure : tête, bras levé, plis du manteau
    const P = (x, y, c) => { g.fillStyle = c; g.fillRect(ox + x, oy + y, 1, 1); };
    for (let y = -112; y < -100; y++) for (let x = -5; x <= 5; x++) if (Math.hypot(x, (y + 106) * 0.95) < 6) P(x, y, x < 0 ? '#b0aa9a' : '#7c766c');
    for (let i = 0; i < 18; i++) { P(6 + Math.floor(i / 3), -96 - i, '#969082'); P(7 + Math.floor(i / 3), -96 - i, '#7c766c'); }
    for (let y = -30 * 4; y < -28 * 4; y++) P(0, y, '#000');
  } });
  return base;
}
// stalagmite : cône de calcaire mouillé, anneaux, reflets
function stalagmiteSprite(vr) {
  const hz = 18 + hsh(vr, 1, 2) * 8;
  return voxel(0.3, hz + 2, lathe(hz, (z) => 0.2 * (1 - z / hz) ** 1.3 + 0.015 + Math.sin(z * 1.3 + vr) * 0.01), (A, B, z, top, k, x, y) => {
    const li = lit(A, B, 0.4);
    return pickc(STONEW, 0.6 + li * 4.6 + (fract(z / 2.3) < 0.2 ? -0.7 : 0) + (hsh(x, y, vr) > 0.95 ? 2 : 0), x, y);
  });
}
// charrette à bras : plateau de planches, ridelles, deux grandes roues à rayons, brancards, une bâche roulée
function wagonSprite(T, vr) {
  const hx = 0.3, hy = 0.2;
  return voxel(0.46, 14, (A, B, iv) => {
    if (Math.abs(A) < hx && Math.abs(B) < hy) {
      const rim = Math.abs(A) > hx - 0.03 || Math.abs(B) > hy - 0.03;
      iv[0] = 3.4; iv[1] = rim ? 7.6 : 4.4;
      if (!rim && Math.abs(A + 0.05) < 0.14 && Math.abs(B) < 0.13) iv[1] = 4.4 + 3.6 * Math.sqrt(Math.max(0, 1 - (B / 0.13) ** 2));
      return 1;
    }
    if (A > hx && A < hx + 0.16 && Math.abs(Math.abs(B) - 0.12) < 0.025) { iv[0] = 4; iv[1] = 4.8; return 1; }
    return 0;
  }, (A, B, z, top, k, x, y) => {
    if (top && z > 4.6 && Math.abs(A + 0.05) < 0.14 && Math.abs(B) < 0.13) return pickc(CANVAS, 1 + hfLit((a, b) => 3.6 * Math.sqrt(Math.max(0, 1 - (b / 0.13) ** 2)), A, B) * 5, x, y);
    const f = top ? -1 : boxFace(A, B, hx, hy);
    let lv = f < 0 ? 4 : f ? 1.6 : 3;
    if (!top && fract(z / 1.4) < 0.2) lv -= 0.8;
    return pickc(WOOD, lv + gr2(x, y, vr) * 0.6, x, y);
  }, { post: (g, ox, oy) => {
    for (const a of [-0.12]) for (const sideB of [hy + 0.02]) {
      const sx = ox + (a - sideB) * HW * F, sy = oy + (a + sideB) * HH * F - 4 * F;
      for (let yy = -16; yy <= 16; yy++) for (let xx = -9; xx <= 9; xx++) {
        const r = Math.hypot(xx / 9, yy / 16);
        if (r > 1) continue;
        const ang = Math.atan2(yy / 16, xx / 9), spoke = Math.abs(fract(ang / (Math.PI / 4)) - 0.5) > 0.42;
        if (r > 0.8 || r < 0.22 || spoke) { g.fillStyle = r > 0.8 ? (xx < 0 ? '#8a5c32' : '#4a2e18') : '#6a4424'; g.fillRect(sx + xx, sy + yy, 1, 1); }
      }
    }
  } });
}
// souche : tronc coupé, cernes, racines
function stumpSprite(vr) {
  return voxel(0.34, 8, (A, B, iv) => {
    const r = Math.hypot(A, B), ang = Math.atan2(B, A);
    const rr = 0.17 + Math.max(0, Math.sin(ang * 4 + vr) - 0.6) * 0.15;
    if (r < 0.17) { iv[0] = 0; iv[1] = 5 + Math.sin(ang * 2 + vr) * 0.6; return 1; }
    if (r < rr) { iv[0] = 0; iv[1] = 2.2 * (1 - (r - 0.17) / (rr - 0.17)); return 1; }
    return 0;
  }, (A, B, z, top, k, x, y) => {
    const r = Math.hypot(A, B);
    if (top && r < 0.16) return pickc(STRAW, 2.6 + (fract(r * 32) < 0.3 ? -1 : 0.4) - r * 4, x, y);
    return pickc(BARK, 0.6 + lit(A, B, top ? 1 : 0.2) * 4.6 + (hsh(Math.floor(Math.atan2(B, A) * 9), 2, vr) - 0.5), x, y);
  });
}
// rocher isolé (demi-couvert) : bloc arrondi, facettes, la palette des roches du thème
function boulderSprite(T, vr) {
  const W2 = T.wall.kind === 'rock' ? T.wall : THEMES.desert.wall, sx = 0.3 + hsh(vr, 1, 7) * 0.06, sy = 0.26 + hsh(vr, 2, 7) * 0.06;
  // facettes : quelques plans taillés (le plus bas l'emporte) sous un dôme aplati
  const planes = [];
  for (let k = 0; k < 6; k++) { const a = k * 1.047 + hsh(vr, k, 9) * 0.8; planes.push([Math.cos(a), Math.sin(a), 8.5 + hsh(vr, k + 7, 9) * 2.5, 16 + hsh(vr, k + 14, 9) * 10]); }
  const fh = (A, B) => {
    const q = (A / sx) ** 2 + (B / sy) ** 2;
    if (q >= 1) return 0;
    let h = 8 * Math.pow(1 - q, 0.3);
    for (const [ca, cb, h0, sl] of planes) h = Math.min(h, h0 - (A * ca + B * cb) * sl);
    return h + (vnoise(A * 14 + vr, B * 14, 5) - 0.5) * 0.8;
  };
  return voxel(0.4, 13, (A, B, iv) => { const h = fh(A, B); if (h <= 0.4) return 0; iv[0] = 0; iv[1] = h; return 1; }, (A, B, z, top, k, x, y) => {
    const li = facet(hfLit(fh, A, B), x, y, 4);
    if (T.snowy && li > 0.55) return pickc(SNOWR, 2 + li * 3, x, y);
    if (W2.moss && li > 0.6 && vnoise(A * 7, B * 7, vr) > 0.55) return pickc(W2.moss, 1 + li * 3, x, y);
    return pickc(li > 0.45 ? W2.top : W2.side, 0.8 + li * 5.4 + gr2(x, y, vr) * 0.5 + (Math.abs(vnoise(A * 10, B * 10, vr + 3) - 0.5) < 0.03 ? -1.2 : 0), x, y);
  });
}
// tombe : butte de terre, croix de bois ou stèle
function graveSprite(T, vr) {
  const cross = hsh(vr, 1, 9) < 0.6;
  const fh = (A, B) => { const q = (A / 0.3) ** 2 + (B / 0.16) ** 2; return q < 1 ? 3 * Math.sqrt(1 - q) : 0; };
  return voxel(0.36, 16, (A, B, iv) => {
    if (cross) {
      if (Math.abs(A + 0.22) < 0.025 && Math.abs(B) < 0.025) { iv[0] = 0; iv[1] = 14; return 1; }
      if (Math.abs(A + 0.22) < 0.025 && Math.abs(B) < 0.09) { iv[0] = 9; iv[1] = 10.5; const h = fh(A, B); if (h > 0) { iv[2] = 0; iv[3] = h; return 2; } return 1; }
    } else if (Math.abs(A + 0.22) < 0.04 && Math.abs(B) < 0.12) { iv[0] = 0; iv[1] = 11 - (Math.abs(B) > 0.08 ? (Math.abs(B) - 0.08) * 40 : 0); return 1; }
    const h = fh(A, B); if (h <= 0.2) return 0; iv[0] = 0; iv[1] = h; return 1;
  }, (A, B, z, top, k, x, y) => {
    if (Math.abs(A + 0.22) < 0.045 && z > 2.8) return cross ? pickc(WOOD, top ? 4 : boxFace(A + 0.22, B, 0.025, 0.09) ? 1.6 : 3, x, y) : pickc(STONEW, top ? 4.6 : boxFace(A + 0.22, B, 0.04, 0.12) ? 2 : 3.6, x, y);
    if (T.snowy) return pickc(SNOWR, 2 + hfLit(fh, A, B) * 3, x, y);
    return pickc(T.path, 0.6 + hfLit(fh, A, B) * 4.4 + gr2(x, y, vr) * 0.6, x, y);
  });
}
// congère : butte de neige lisse, crête soufflée, paillettes
function driftSprite(vr) {
  const along = vr & 1;
  const fh = (A, B) => { const a = along ? A : B, b = along ? B : A, q = (a / 0.42) ** 2 + (b / 0.28) ** 2; return q < 1 ? 7 * Math.pow(1 - q, 0.6) * (1 + (b < 0 ? -b : 0) * 0.8) : 0; };
  return voxel(0.46, 11, (A, B, iv) => { const h = fh(A, B); if (h <= 0.3) return 0; iv[0] = 0; iv[1] = h; return 1; }, (A, B, z, top, k, x, y) => {
    if (hsh(x, y, vr) > 0.985) return WHITE;
    return pickc(SNOWR, 0.8 + hfLit(fh, A, B) * 4.6, x, y);
  });
}
// roseaux : tiges fines, massettes brunes
function reedsSprite(vr, frame) {
  const r = (i) => hsh(vr * 7 + i, 3, 77);
  return drawn(130, 120, 65, 100, (P) => {
    for (let i = 0; i < 26; i++) {
      const [bx, by] = [((r(i) - 0.5) * 0.8 - (r(i + 40) - 0.5) * 0.8) * HW * F, ((r(i) - 0.5) * 0.8 + (r(i + 40) - 0.5) * 0.8) * HH * F];
      const hgt = 40 + r(i + 80) * 44, lean = (r(i + 9) - 0.5) * 10 + (frame ? 3 : 0);
      for (let k = 0; k < hgt; k++) { const t = k / hgt; P(bx + lean * t * t, by - k, pickc(ramp('2a3a14 46561e 66702a 8a8a3a a8a24c'), 1 + t * 3, i, k)); }
      if (r(i + 30) > 0.6) for (let k = 0; k < 9; k++) { const t = (hgt - 6 + k) / hgt; P(bx + lean * t * t, by - hgt + 6 - k, pickc(ramp('2a160a 4a2a14 6a3c1c 8a5228'), 2 + (k < 2 ? 1 : 0), 0, k)); P(bx + lean * t * t + 1, by - hgt + 6 - k, P_(ramp('2a160a 4a2a14 6a3c1c'), 1)); }
    }
  }, false);
}
// blé mûr : épis dorés serrés qui ondulent
function wheatSprite(vr, frame) {
  const r = (i) => hsh(vr * 5 + i, 9, 31);
  const WHEAT = ramp('6a4a14 8a6418 aa821e c8a02c e0bc44 f0d468 f8e8a0');
  return drawn(140, 110, 70, 92, (P) => {
    const st = [];
    for (let i = 0; i < 46; i++) st.push([((r(i) - 0.5) * 0.85 - (r(i + 50) - 0.5) * 0.85) * HW * F, ((r(i) - 0.5) * 0.85 + (r(i + 50) - 0.5) * 0.85) * HH * F, 30 + r(i + 100) * 16, (r(i + 150) - 0.5) * 6 + (frame ? 4 : 0)]);
    st.sort((a, b) => a[1] - b[1]);
    for (const [bx, by, hgt, lean] of st) {
      for (let k = 0; k < hgt; k++) { const t = k / hgt; P(bx + lean * t * t, by - k, pickc(WHEAT, 1.6 + t * 2.4, k, bx)); }
      for (let k = 0; k < 8; k++) { const x = bx + lean, y = by - hgt - k; P(x, y, pickc(WHEAT, 4 + (k & 1), x, y)); P(x + 1, y + (k & 1), P_(WHEAT, 3)); }
    }
  }, false);
}
// piano droit : caisse d'acajou, clavier, bougeoirs de laiton
function pianoSprite() {
  const hx = 0.38, hy = 0.18, hz = 14;
  return voxel(0.46, 18, (A, B, iv) => {
    if (Math.abs(A) < hx && B > -hy && B < hy) { iv[0] = 0; iv[1] = hz; return 1; }
    if (Math.abs(A) < hx - 0.03 && B >= hy && B < hy + 0.12) { iv[0] = 7; iv[1] = 8.2; return 1; }
    return 0;
  }, (A, B, z, top, k, x, y) => {
    if (B >= hy - 0.005 && z > 7.6 && z <= 8.3 && top) return Math.abs(fract(A * 34) - 0.5) < 0.12 ? pickc(DWOOD, 0, x, y) : hex(fract(A * 34 + 0.25) < 0.62 ? 'f4ecd8' : 'c8bca4');
    if (top) return pickc(DWOOD, 3.4 + (fract((A - B) * 2) < 0.1 ? 1 : 0), x, y);
    const f = boxFace(A, B, hx, hy);
    let lv = f ? 1.4 : 2.8;
    if (!f && Math.abs(fract(A * 3 + 0.5) - 0.5) > 0.42) lv += 0.8;
    if (!f && z > 9.5 && z < 12.5 && Math.abs(fract(A * 3 + 0.5) - 0.5) < 0.3) lv -= 0.6;
    if (z < 1) lv -= 0.8;
    return pickc(DWOOD, lv + gr2(x, y, 3) * 0.4, x, y);
  }, { post: (g, ox, oy) => { for (const a of [-0.28, 0.28]) { const sx = ox + (a - 0.18) * HW * F, sy = oy + (a + 0.18) * HH * F - 14 * F; g.fillStyle = '#d0aa48'; g.fillRect(sx, sy - 3, 2, 3); g.fillStyle = '#f4ecd8'; g.fillRect(sx, sy - 9, 2, 6); g.fillStyle = '#fff4c0'; g.fillRect(sx, sy - 11, 2, 2); } } });
}
// escalier de bois qui monte vers l'étage, rampe
// escalier de bois : une volée continue sur plusieurs cases (k : rang de la case depuis le bas, n : nombre de cases),
// trois marches par case, qui montent vers le fond ; ax : 1 le long de A, 0 le long de B ; limon sur le côté
function stairsSprite(ax, k, n) {
  const top0 = 20, hs = top0 / (n * 3);
  const st = (A, B) => { const p = 0.5 - (ax ? A : B); return (k * 3 + Math.min(2, Math.floor(p * 3)) + 1) * hs; };
  return voxel(0.5, top0 + 6, (A, B, iv) => {
    const cr = ax ? B : A;
    if (Math.abs(cr) > 0.42) return 0;
    const h = st(A, B);
    if (cr > 0.36) { iv[0] = 0; iv[1] = h + 3; return 1; }
    iv[0] = 0; iv[1] = h; return 1;
  }, (A, B, z, top, kk, x, y) => {
    const cr = ax ? B : A;
    if (cr > 0.36) return pickc(DWOOD, top ? 3.6 : 2 + lit(ax ? 0 : 1, ax ? 1 : 0, 0) * 2, x, y);
    if (top) return pickc(PLANKR, 4.4 + gr2(x, y, 4) * 0.6 + (fract((0.5 - (ax ? A : B)) * 3) > 0.85 ? 0.8 : 0), x, y);
    const f = boxFace(A, B, 0.5, 0.5);
    return pickc(PLANKR, (f === ax ? 1.4 : 2.8) + (fract(z / hs) < 0.2 ? -0.8 : 0), x, y);
  });
}
// éolienne de ferme : pylône de bois en treillis, roue à pales, gouvernail
function windmillSprite(vr) {
  return drawn(150, 200, 75, 180, (P) => {
    const leg = (x0, x1) => stroke(P, x0, 0, x1, -112, 3, 2, (t, s) => pickc(WOOD, 2 + (s < 0.5 ? 1 : 0), 0, 0));
    leg(-22, -4); leg(22, 4); leg(-8, -2); leg(8, 2);
    for (let k = 1; k < 6; k++) { const y = -k * 20, w = 22 - k * 3.6; stroke(P, -w, y, w, y - 2, 2, 2, () => pickc(WOOD, 2.6, 0, 0)); stroke(P, -w, y, w - 3.6, y - 20, 1, 1, () => pickc(WOOD, 1.6, 0, 0)); }
    const cx = 0, cy = -124;
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      for (let s = 0.25; s <= 1; s += 0.04) {
        const x = cx + Math.cos(a) * 26 * s * 0.7, y = cy + Math.sin(a) * 26 * s;
        P(x, y, pickc(GREYW, (k & 1 ? 3.4 : 2.2) + (Math.cos(a) < 0 ? 0.8 : 0), k, 0)); P(x + 1, y, pickc(GREYW, 2.6, k, 1));
      }
    }
    stroke(P, cx + 2, cy, cx + 30, cy + 4, 2, 2, () => pickc(IRON, 3, 0, 0));
    for (let y = -6; y <= 8; y++) for (let x = 0; x < 10; x++) P(cx + 28 + x, cy + y - x * 0.2, pickc(GREYW, 3.4, x, y));
  });
}
// puits : margelle de pierre, deux montants, treuil et seau
function wellSprite() {
  return voxel(0.42, 26, (A, B, iv) => {
    const r = Math.hypot(A, B);
    let m = 0;
    if (r < 0.3) { iv[0] = 0; iv[1] = r > 0.21 ? 6 : 3; m = 1; }
    if (Math.abs(B) < 0.03 && Math.abs(Math.abs(A) - 0.3) < 0.03) { iv[2 * m] = 0; iv[2 * m + 1] = 18; m++; }
    if (Math.abs(B) < 0.02 && Math.abs(A) < 0.3) { iv[2 * m] = 15.6; iv[2 * m + 1] = 16.8; m++; }
    return m;
  }, (A, B, z, top, k, x, y) => {
    const r = Math.hypot(A, B);
    if (top && r < 0.21 && z < 3.5) return pickc(GLASS, 0.6 + (fract((A + B) * 9) < 0.12 ? 2 : 0), x, y);
    if (r < 0.31 && z <= 6.1) {
      const ang = Math.atan2(B, A), row = Math.floor(z / 2), bl = fract(ang * 2 + row * 0.5);
      return pickc(STONEW, (top ? 4.2 : 1 + lit(A, B, 0.2) * 4) + (!top && (fract(z / 2) < 0.18 || bl < 0.08) ? -1.2 : 0), x, y);
    }
    return pickc(WOOD, top ? 4 : 1.6 + lit(A, B, 0.1) * 3, x, y);
  }, { post: (g, ox, oy) => { g.fillStyle = '#2a1a10'; g.fillRect(ox, oy - 64, 1, 26); g.fillStyle = '#6a4424'; g.fillRect(ox - 3, oy - 40, 7, 6); g.fillStyle = '#9a9aa6'; g.fillRect(ox - 3, oy - 40, 7, 1); } });
}
// feu de camp (posé au sol) : cercle de pierres, bûches croisées, cendres ; les flammes sont animées à part
function campfireSprite(vr) {
  return voxel(0.36, 6, (A, B, iv) => {
    const r = Math.hypot(A, B), ang = Math.atan2(B, A);
    if (r > 0.18 && r < 0.27 && fract(ang / (Math.PI * 2) * 9) < 0.78) { iv[0] = 0; iv[1] = 2.4 + hsh(Math.floor(ang / (Math.PI * 2) * 9), 1, vr) * 1.2; return 1; }
    if ((Math.abs(A - B) < 0.05 || Math.abs(A + B) < 0.05) && r < 0.16) { iv[0] = 0.3; iv[1] = 2.6 - r * 6; return 1; }
    return 0;
  }, (A, B, z, top, k, x, y) => {
    const r = Math.hypot(A, B);
    if (r > 0.17) return pickc(STONEW, 1 + lit(A, B, top ? 1.5 : 0.2) * 4, x, y);
    return r < 0.06 ? pickc(ramp('3a0a04 8a2a08 e06018 ffb040'), 1.5 + (hsh(x, y, 3) > 0.6 ? 1.5 : 0), x, y) : pickc(BARK, 1 + (top ? 1.5 : 0) + (r < 0.09 ? -1 : 0), x, y);
  });
}
// brasero : vasque de fer sur trépied (les flammes sont animées à part)
function brazierSprite() {
  return voxel(0.3, 14, (A, B, iv) => {
    const r = Math.hypot(A, B);
    if (r < 0.17 && r > 0.02) { iv[0] = 7 + (0.17 - r) * 12; iv[1] = 10; return 1; }
    for (let k = 0; k < 3; k++) { const a = k * 2.094 + 0.5; if (Math.hypot(A - Math.cos(a) * 0.12, B - Math.sin(a) * 0.12) < 0.025) { iv[0] = 0; iv[1] = 8; return 1; } }
    return 0;
  }, (A, B, z, top, k, x, y) => {
    if (top && Math.hypot(A, B) < 0.14) return pickc(ramp('2a0804 6a1a08 c04010 f08020 ffd060'), 1 + hsh(x, y, 2) * 3, x, y);
    return pickc(IRON, 1 + lit(A, B, top ? 1.5 : 0.2) * 4.5, x, y);
  });
}
// tonneau de whisky : tonneau ordinaire, étiquette « XXX » au pochoir
function whiskySprite(T, vr) {
  const c = barrelSprite(T, vr), g = c.getContext('2d');
  const x = c.ox * F, y = c.oy * F - 28;
  g.fillStyle = '#e8dcc0'; g.fillRect(x - 7, y - 5, 15, 9);
  g.fillStyle = '#3a1a10';
  for (let k = 0; k < 3; k++) { const bx = x - 6 + k * 5; for (let j = 0; j < 5; j++) { g.fillRect(bx + j * 0.8, y - 3 + j, 1, 1); g.fillRect(bx + 3.2 - j * 0.8, y - 3 + j, 1, 1); } }
  return c;
}
// lustre brisé au sol (demi-couvert) : couronne tordue, bougies, éclats de verre
// lustre tombé (demi-couvert) : la couronne tordue, un côté relevé, la chaîne en tas, bougies cassées, verre en éclats
function lustreWreckSprite() {
  const tube = 0.028, R0 = 0.32;
  const zr = (ang) => 0.5 + Math.max(0, Math.sin(ang - 2.4)) ** 2 * 4;
  return voxel(0.42, 12, (A, B, iv) => {
    const rr = Math.hypot(A, B * 1.15), ang = Math.atan2(B, A), dr = rr - R0 - Math.sin(ang * 3) * 0.03;
    let m = 0;
    if (Math.abs(dr) < tube) { const z0 = zr(ang), dz = Math.sqrt(tube * tube - dr * dr) * 20; iv[0] = Math.max(0, z0 - dz); iv[1] = z0 + dz; m = 1; }
    for (let k = 0; k < 4; k++) { const a = k * 1.571 + 0.4, d = Math.abs(-A * Math.sin(a) + B * Math.cos(a)), al = A * Math.cos(a) + B * Math.sin(a); if (d < 0.025 && al > 0 && al < R0) { const hz = 0.4 + zr(a) * (al / R0); iv[2 * m] = hz; iv[2 * m + 1] = hz + 0.9; m++; break; } }
    const hub = Math.hypot(A + 0.02, B - 0.03);
    if (hub < 0.09 && m < 3) { iv[2 * m] = 0; iv[2 * m + 1] = 2.6 * (1 - hub / 0.09) + 0.6; m++; }
    return m;
  }, (A, B, z, top, k, x, y) => {
    const ang = Math.atan2(B, A), li = lit(Math.cos(ang), Math.sin(ang), top ? 1.5 : 0.3);
    if (Math.hypot(A + 0.02, B - 0.03) < 0.09 && z < 3.4) return pickc(IRON, 1.4 + li * 4 + (fract((A + B) * 40) < 0.4 ? 1 : 0), x, y);
    return pickc(BRASS, 1 + li * 4.4 + (hsh(x >> 1, y, 3) > 0.85 ? 1 : 0), x, y);
  }, { post: (g, ox, oy) => {
    const R = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(Math.round(ox + x), Math.round(oy + y), w, h); };
    // bougies : deux encore debout sur la couronne relevée, les autres couchées ; éclats de verre
    for (let k = 0; k < 6; k++) {
      const a = k * 1.047 + 0.3, sx = (Math.cos(a) * 0.3 - Math.sin(a) * 0.26) * HW * F, sy = (Math.cos(a) * 0.3 + Math.sin(a) * 0.26) * HH * F - zr(a) * F;
      if (k < 2) { R(sx, sy - 9, 2, 9, '#f4ecd8'); R(sx + 2, sy - 9, 1, 9, '#c8bca4'); }
      else { R(sx - 4, sy + 2, 9, 2, '#f4ecd8'); R(sx - 4, sy + 4, 9, 1, '#a89c84'); }
    }
    for (let k = 0; k < 46; k++) { const x = (hsh(k, 1, 4) - 0.5) * 120, y = (hsh(k, 2, 4) - 0.5) * 50 + 6; R(x, y, k % 4 ? 1 : 2, 1, k % 3 ? '#c8e8f4' : '#ffffff'); }
  } });
}
function lustreWreckFlat() {
  return drawn(140, 70, 70, 50, (P) => {
    for (let k = 0; k < 120; k++) {
      const a = (k / 120) * Math.PI * 2, wob = Math.sin(a * 3) * 4;
      const x = Math.cos(a) * (40 + wob), y = Math.sin(a) * (18 + wob * 0.5) - Math.max(0, Math.sin(a * 2 + 1)) * 6;
      P(x, y, pickc(BRASS, 2.4 + Math.cos(a - 2.4) * 1.6, k, 0)); P(x, y + 1, P_(BRASS, 1.4));
    }
    for (let k = 0; k < 6; k++) { const a = k * 1.05, x = Math.cos(a) * 34, y = Math.sin(a) * 15; for (let j = 0; j < 10; j++) P(x + j * (k & 1 ? 1 : -1), y - 2 - j * 0.3, hex(j > 7 ? 'c8bca4' : 'f4ecd8')); }
    for (let k = 0; k < 40; k++) { const x = (hsh(k, 1, 4) - 0.5) * 110, y = (hsh(k, 2, 4) - 0.5) * 44; P(x, y, hex(k % 3 ? 'c8e8f4' : 'ffffff')); }
  });
}

// ------------------------------------------------------------ sources de lumière et feu
// lustre : couronne de laiton, six bougies, pampilles de cristal (la chaîne est tracée à chaque image)
function chandelierSprite() {
  return drawn(110, 60, 55, 30, (P) => {
    for (let k = 0; k < 160; k++) {
      const a = (k / 160) * Math.PI * 2, x = Math.cos(a) * 38, y = Math.sin(a) * 17;
      P(x, y, pickc(BRASS, 2.8 + Math.cos(a - 2.4) * 1.8, k, 0)); P(x, y + 1, P_(BRASS, 1.2));
    }
    for (let k = 0; k < 4; k++) { const a = k * 1.571 + 0.785; stroke(P, 0, -10, Math.cos(a) * 38, Math.sin(a) * 17, 1, 1, () => P_(BRASS, 2)); }
    for (let k = 0; k < 6; k++) {
      const a = k * 1.047 + 0.3, x = Math.cos(a) * 38, y = Math.sin(a) * 17;
      for (let j = 1; j < 9; j++) { P(x, y - j, hex(j > 6 ? 'c8bca4' : 'f4ecd8')); P(x + 1, y - j, hex('d8ccb4')); }
      for (let j = 2; j < 7; j++) P(x + (k & 1), y + j, hex(j & 1 ? 'c8e8f4' : 'ffffff'));
    }
    for (let j = -14; j < -9; j++) P(0, j, P_(BRASS, 3));
  });
}
// lanterne suspendue (cadre de fer, verre), l'anse en haut ; la flamme est tracée à part
function hangLanternSprite() {
  return drawn(30, 50, 15, 40, (P, R) => {
    R(-5, -10, 11, 2, P_(IRON, 3)); R(-4, 2, 9, 2, P_(IRON, 2));
    for (let y = -8; y < 2; y++) { P(-5, y, P_(IRON, 3.5)); P(5, y, P_(IRON, 1.6)); for (let x = -4; x <= 4; x++) P(x, y, hex(Math.abs(x) < 2 && y > -6 ? 'fff0b8' : 'f0a840')); }
    for (let x = -3; x <= 3; x++) P(x, -13 + Math.abs(x) * 0.6, P_(IRON, 2.5));
  });
}
// lampe à pétrole : socle de laiton, réservoir, verre de lampe
function oilLampSprite() {
  return drawn(24, 40, 12, 36, (P, R) => {
    R(-4, -2, 9, 2, P_(BRASS, 2.6)); R(-3, -8, 7, 6, P_(BRASS, 3.4)); R(-3, -8, 2, 6, P_(BRASS, 4.6));
    for (let y = -20; y < -8; y++) { const w = y < -16 ? 2 : 3; for (let x = -w; x <= w; x++) P(x, y, hex(x < 0 ? 'f0f8fc' : 'c8e0e8')); }
    R(-1, -15, 2, 4, hex('fff4c0'));
  });
}
// torche : manche de bois, panier de fer (la flamme est tracée à part)
function torchSprite() {
  return drawn(30, 90, 15, 84, (P, R) => {
    R(-1, -66, 3, 66, P_(WOOD, 2.6)); P(-1, -40, P_(WOOD, 4));
    R(-4, -72, 9, 6, P_(IRON, 2)); R(-4, -72, 2, 6, P_(IRON, 3.6)); R(-3, -74, 7, 2, hex('8a2a08'));
  });
}
// flammes animées : langues de feu (cœur blanc-jaune, bords rouges), quatre images ; size : 1 petite, 2 grande
const FIRER = ramp('5a0e04 a02008 d84a10 f88020 ffb840 ffe080 fff8d8');
function flameSprite(size, frame) {
  const W2 = size === 2 ? 72 : 32, H2 = size === 2 ? 96 : 44, ox = W2 / 2, oy = H2 - 4;
  const tongues = size === 2 ? [[-12, 0.7], [0, 1], [13, 0.75], [-5, 0.55], [7, 0.6]] : [[0, 1], [-4, 0.6], [4, 0.65]];
  return sprite2(W2, H2, ox, oy, (x, y) => {
    let best = -1;
    for (const [tx, th] of tongues) {
      const hgt = (H2 - 10) * th * (0.85 + 0.15 * Math.sin(frame * 1.7 + tx));
      const t = -y / hgt;
      if (t < 0 || t > 1) continue;
      const sway = Math.sin(t * 5 + frame * 1.6 + tx) * 2.5 * t;
      const wdt = (size === 2 ? 12 : 6) * Math.sqrt(1 - t) * (1 - t * 0.3);
      const dx = Math.abs(x - tx - sway);
      if (dx > wdt) continue;
      best = Math.max(best, (1 - t) * (1 - dx / wdt));
    }
    if (best < 0) return 0;
    const lv = best * 6.5 + bay(x + frame, y) - 0.5;
    return P(FIRER, lv);
  }, false);
}
// bouffée de fumée (tramée, sans contour)
function smokeSprite(r) {
  const w = r * 2 * F + 4;
  return sprite2(w, w, w / 2, w / 2, (x, y) => {
    const d = Math.hypot(x, y) / (r * F);
    if (d >= 1 || (1 - d) * 1.6 < bay(x, y)) return 0;
    return pack(...(x + y < 0 ? [120, 116, 110] : [80, 76, 72]));
  }, false);
}

// ------------------------------------------------------------ flaques, débris, usure
// flaque (décalque sur le sol) : tache irrégulière dans le losange, reflet ; kind : whisky, petrole, eau, sang
const PUDDLES = {
  whisky: [ramp('5a2a08 8a4a10 b06a1c d08c30 f0b860'), 0.75],
  petrole: [ramp('0a0a0e 16141c 24202c 3a3446 5a5068'), 0.85],
  eau: [ramp('2a3a48 3a5466 52748a 7a9cb0 b8d4e2'), 0.6],
  sang: [ramp('2a0404 4a0808 6e1010 902018 b03020'), 0.9],
};
function puddleSprite(kind, vr) {
  const [R, op] = PUDDLES[kind] || PUDDLES.eau, sz = kind === 'sang' ? 0.55 : 0.9;
  const w = TW * F, h = TH * F;
  return sprite2(w, h, w / 2, h / 2, (x, y) => {
    const a = x / (w / 2), b = y / (h / 2), ang = Math.atan2(b, a);
    const rr = sz * (0.7 + vnoise(Math.cos(ang) * 2 + vr * 3, Math.sin(ang) * 2, 41) * 0.45 - (kind === 'sang' ? hsh(Math.floor(ang * 3), vr, 2) * 0.2 : 0));
    const d = Math.abs(a) + Math.abs(b) * 0.9;
    if (d > rr) return 0;
    const edge = rr - d;
    let lv = 1.2 + edge * 3 + (fract((x - y * 2) / 22 + vr) < 0.06 && edge > 0.08 ? 2.4 : 0);
    if (kind === 'petrole' && edge > 0.05) { const ir = fract(edge * 9 + x / 30); if (ir < 0.12) return pack(...[[90, 60, 140], [60, 120, 110], [150, 120, 50]][Math.floor(ir * 25) % 3], 220); }
    const c = P(R, lv + bay(x, y) - 0.5);
    return (c & 0xffffff) | (Math.round(op * 255) << 24) >>> 0;
  }, false);
}

// variante abîmée d'un sprite d'objet (une fois, à la création) : encoches arrachées sur le dessus, impacts de balles,
// éclats clairs ; très abîmé : plus d'encoches, plus profondes, planches manquantes
function damaged(src, dmg, vr) {
  const w = src.width, h = src.height, g0 = src.getContext('2d');
  const d = new Uint32Array(g0.getImageData(0, 0, w, h).data.buffer.slice(0));
  const top = new Int32Array(w).fill(-1);
  for (let x = 0; x < w; x++) for (let y = 0; y < h; y++) if (d[y * w + x] && d[y * w + x] !== OUTC) { top[x] = y; break; }
  const depth = dmg === 2 ? 22 : 10, th = dmg === 2 ? 0.45 : 0.62;
  for (let x = 0; x < w; x++) {
    if (top[x] < 0) continue;
    const n = vnoise(x / 7, vr, 17);
    if (n < th) continue;
    const dd = Math.round((n - th) / (1 - th) * depth + hsh(x, vr, 3) * 3);
    for (let y = top[x] - 1; y < Math.min(h, top[x] + dd); y++) d[y * w + x] = 0;
  }
  // impacts et éclats
  const holes = dmg === 2 ? 14 : 6;
  for (let k = 0, tries = 0; k < holes && tries < 400; tries++) {
    const x = 3 + Math.floor(hsh(tries, vr, 5) * (w - 6)), y = 3 + Math.floor(hsh(vr, tries, 6) * (h - 6));
    if (!d[y * w + x] || !d[(y + 2) * w + x] || !d[y * w + x + 2]) continue;
    for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) d[(y + j) * w + x + i] = hex('120a06');
    d[(y - 1) * w + x] = hex('d8b880'); d[(y + 2) * w + x + 1] = scale(d[(y + 2) * w + x + 1], 1.3);
    k++;
  }
  // contour : les bords des encoches
  for (let k = 0; k < w * h; k++) if (d[k] === OUTC) d[k] = 0;
  outlineBuf(d, w, h);
  const c = S.makeCanvas(w, h), g = c.getContext('2d'), img = g.createImageData(w, h);
  new Uint32Array(img.data.buffer).set(d);
  g.putImageData(img, 0, 0);
  c.ox = src.ox; c.oy = src.oy;
  return c;
}
// débris au sol (dans les morceaux de sol) : planches et échardes, sable répandu et toile, gravats
function drawDebris(g, kind, x, y, vr) {
  const R = (px, py, w, h, c) => { g.fillStyle = c; g.fillRect(Math.round(px), Math.round(py), w, h); };
  const r = (i) => hsh(vr, i, 61);
  if (kind === 'DEBRIS_SAC') {
    for (let k = 0; k < 160; k++) { const a = r(k) * 6.283, d = Math.sqrt(r(k + 200)) * 40; R(x + Math.cos(a) * d, y + Math.sin(a) * d * 0.5, 2, 1, k % 3 ? '#c8a868' : '#a88448'); }
    for (let k = 0; k < 3; k++) { const px = x + (r(k + 400) - 0.5) * 50, py = y + (r(k + 410) - 0.5) * 18; R(px, py + 1, 14, 5, '#3a2814'); R(px, py, 13, 4, '#98824c'); R(px + 2, py, 6, 1, '#b8a070'); }
    return;
  }
  if (kind === 'DEBRIS_PIERRE') {
    for (let k = 0; k < 16; k++) { const px = x + (r(k) - 0.5) * 70, py = y + (r(k + 50) - 0.5) * 30, s = 3 + Math.floor(r(k + 90) * 6); R(px - 1, py + 1, s + 2, s - 1, '#2a2620'); R(px, py, s, s - 1, k % 2 ? '#8a8276' : '#6c645a'); R(px + 1, py, Math.max(1, s - 3), 1, '#b0a898'); }
    return;
  }
  // bois : planches cassées en biais (bois clair fraîchement fendu, contour sombre), échardes, clous
  for (let k = 0; k < 10; k++) {
    const px = x + (r(k) - 0.5) * 76, py = y + (r(k + 30) - 0.5) * 32, L = 12 + Math.floor(r(k + 60) * 16), dir = r(k + 70) < 0.5 ? 1 : -1, wd = 3 + (k & 1);
    for (let j = -1; j <= L; j++) R(px + j, py + j * 0.5 * dir - 1, 1, wd + 2, '#1a0f0a');
    for (let j = 0; j < L; j++) {
      R(px + j, py + j * 0.5 * dir, 1, wd, j % 7 === 0 ? '#7a5030' : '#b07c48');
      R(px + j, py + j * 0.5 * dir, 1, 1, '#e0b070');
      if (j === L - 1 || j === 0) R(px + j, py + j * 0.5 * dir + wd - 1, 1, 1, '#f0d090');
    }
    if (r(k + 80) > 0.6) R(px + 2, py + dir, 1, 1, '#3a3a40');
  }
  for (let k = 0; k < 18; k++) R(x + (r(k + 100) - 0.5) * 84, y + (r(k + 120) - 0.5) * 36, 2 + (k & 1), 1, k % 3 ? '#d8a868' : '#f0d090');
}

// ambiances : amb (lumière du dehors, multipliée), inside (sous les toits), halo (force des halos), shaft (soleil
// par les fenêtres), haze (voile) ; ciels : mul (teinte), haze ; sources : rayon, couleur, hauteur par défaut
const MOODS = {
  midi: { amb: [255, 250, 240], inside: [168, 150, 132], halo: 0.25, shaft: '#fff0c8' },
  aube: { amb: [242, 208, 206], inside: [160, 140, 142], halo: 0.6, shaft: '#ffd0c0', haze: ['255,210,200', 0.05] },
  crepuscule: { amb: [250, 178, 130], inside: [150, 126, 118], halo: 0.8, shaft: '#ffa868', haze: ['255,140,80', 0.04] },
  nuit: { amb: [58, 72, 124], inside: [190, 178, 190], halo: 1 },
  mine: { amb: [36, 31, 46], inside: [255, 255, 255], halo: 1 },
};
const SKIES = { tempete: { mul: [236, 200, 156], haze: ['196,146,88', 0.16] }, brume: { mul: [212, 218, 224], haze: ['226,232,238', 0.2] }, blizzard: { mul: [204, 216, 238], haze: ['238,244,255', 0.22] } };
const LIGHTS = { lanterne: { r: 4, col: '#ffb060', h: 15 }, lampe: { r: 2.6, col: '#ffc878', h: 11 }, lustre: { r: 5, col: '#ffd890', h: 30 }, reverbere: { r: 4.5, col: '#ffd080', h: 24 },
  feu: { r: 4.5, col: '#ff9038', h: 4 }, fenetre: { r: 2.2, col: '#ffc070', h: 11 }, torche: { r: 3.8, col: '#ff9a40', h: 19 }, perso: { r: 2.4, col: '#ffd8a0', h: 12 } };

// ------------------------------------------------------------ outils exportés
const SLX = LX / Math.hypot(LX, LY), SLY = LY / Math.hypot(LX, LY); // vers la lumière, au sol
const tintCache = new Map();
// pochoir teinté (masque blanc → couleur col), en cache par couleur
function tinted(mask, col, key) {
  const k = `${key}|${col}`;
  let c = tintCache.get(k);
  if (c) return c;
  if (tintCache.size > 96) { for (const v of tintCache.values()) S.freeCanvas(v); tintCache.clear(); }
  c = S.makeCanvas(mask.width, mask.height);
  const g = c.getContext('2d');
  g.drawImage(mask, 0, 0);
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = col;
  g.fillRect(0, 0, c.width, c.height);
  tintCache.set(k, c);
  return c;
}
let tileMask = null, fullMask = null, edgeMasks = null;
// losange d'une case (32 × 16 pixels du jeu) en pixels fins ; inset : retrait du bord (en fraction), rim : liseré plus opaque
function diamondMask(inset, rim) {
  const w = TW * F, h = TH * F, c = S.makeCanvas(w, h);
  const g = c.getContext('2d'), img = g.createImageData(w, h), d = new Uint32Array(img.data.buffer);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dd = Math.abs(x + 0.5 - w / 2) / (w / 2) + Math.abs(y + 0.5 - h / 2) / (h / 2);
    if (dd > 1 - inset) continue;
    d[y * w + x] = rim && dd > 1 - inset - 0.07 ? pack(255, 255, 255, 255) : pack(255, 255, 255, rim ? 150 : 255);
  }
  g.putImageData(img, 0, 0);
  return c;
}
// pose un losange plein de couleur col centré sur (sx, sy) (pixels du jeu)
export function diamond(ctx, sx, sy, col) {
  fullMask ||= diamondMask(0, false);
  ctx.drawImage(tinted(fullMask, col, 'full'), Math.round((sx - HW) * F) / F, Math.round((sy - HH) * F) / F, TW, TH);
}
// les deux traits de bord d'un losange (« \ » et « / »), un demi-pixel du jeu d'épaisseur
function edgeMask(down) {
  const w = HW * F + 1, h = HH * F + 2, c = S.makeCanvas(w, h);
  const g = c.getContext('2d');
  g.fillStyle = '#fff';
  for (let x = 0; x < w; x++) {
    const y = Math.floor((down ? x : w - 1 - x) / 2);
    g.fillRect(x, y, 1, 2);
  }
  return c;
}

// ------------------------------------------------------------ la vue
export class IsoView {
  constructor(map, { top = 15, bottom = 176 } = {}) {
    this.m = map;
    this.w = map.w;
    this.h = map.h;
    this.top = top;
    this.bottom = bottom;
    this.theme = THEMES[map.theme] ? map.theme : THEMES[map.env] ? map.env : 'desert';
    this.T = THEMES[this.theme];
    const sd = map.seed;
    this.seed = (typeof sd === 'number' ? sd >>> 0 : typeof sd === 'string' ? Array.from(sd).reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 7)
      : Array.from(map.base || map.cells).reduce((a, c, i) => (a * 31 + c * (i + 7)) >>> 0, 17)) % 1000003 || 1;
    // le monde : la case (x, y) a son centre au sol en ((x - y) * 16 + OX, (x + y) * 8 + OY)
    this.OX = this.h * HW + PAD;
    this.OY = HMAX + HH + PAD;
    this.WW = (this.w + this.h) * HW + 2 * PAD;
    this.WH = (this.w + this.h) * HH + HMAX + DEPTH + 2 * PAD;
    this._cam = { x: 0, y: 0 };
    this._tgt = { x: 0, y: 0 };
    this._cr = { x: 0, y: 0 };
    this.hover = null; // case survolée ({x, y}) : les volumes devant elle s'effacent
    this.lru = new Map();
    this.bytes = 0;
    this.frame = 0;
    this.empty = new Set();
    this.props = new Map();
    this.stamps = new Map();
    this._items = [];
    this._pool = [];
    const s = this.seed, w = this.w, h = this.h;
    // bruits du sol (large, moyen, autre) et des murs (variation de hauteur, bords irréguliers, bosses)
    this.nGround = gridField3(w, h, 4, (u, v, o) => { o[0] = fbm(u / 3.2, v / 3.2, s, 3); o[1] = vnoise(u * 1.3, v * 1.3, s + 11); o[2] = fbm(u / 2.6 + 17, v / 2.6, s + 23, 2); });
    this.nWall = gridField3(w, h, 8, (u, v, o) => { o[0] = fbm(u / 2.2, v / 2.2, s + 53, 2); o[1] = vnoise(u * 3.2, v * 3.2, s + 41); o[2] = fbm(u * 1.6, v * 1.6, s + 31, 2); });
    this._gf = new Float32Array(3);
    this._wf = new Float32Array(3);
    this.nDet = (U, V) => { this.nWall(U, V, this._wf); return this._wf[2]; };
    this.nAlt = (U, V) => { this.nGround(U, V, this._gf); return this._gf[2]; };
    this._q = { x: 0, y: 0, i: 0, t: 0, a: 0, b: 0, U: 0, V: 0, X: 0, Y: 0, nb: 0, nm: 0, na: 0, g: 0 };
    this._wq = { x: 0, y: 0, i: 0, a: 0, b: 0, U: 0, V: 0, X: 0, Y: 0, z: 0, h: 0, top: false, li: 0, nz: 0, face: 0, wi: 0 };
    // les styles de murs (roche du thème, mesa, galerie, planches, adobe, maison, tour, cabane, façade à toit)
    const TW_ = this.T.wall, nat = TW_.kind === 'rock' ? TW_ : THEMES.desert.wall, ad = THEMES.hacienda.wall;
    const wood = { kind: 'wood', h: 20, hv: 0, r: 0, wob: 0, bump: 0, corner: 0, top: THEMES.saloon.wall.top, side: THEMES.saloon.wall.side };
    this.styles = [nat, nat.terrace ? nat : { ...nat, terrace: 6, hv: 2.4, h: 21, r: 0.24, bump: 0.5, corner: 0.22, strata: 2.6 }, THEMES.mine.wall, wood, ad,
      { ...ad, h: 19, parapet: 1 }, { ...ad, h: 26, crenel: 1 }, { ...wood, raw: 1, h: 18 }, THEMES.ville.wall];
    this.styleDef = { mine: 2, saloon: 3, ville: 8, hacienda: 4 }[this.theme] ?? 0;
    this.analyse();
    this._shadowMap();
    this.setCamera((this.WW - W) / 2, (this.WH - (top + bottom)) / 2);
  }

  // ---------------------------------------------------------- les cases : masques de voisinage, murs, ombres
  analyse() {
    const { w, h } = this, c = this.m.cells, T = this.T, n = w * h, s = this.seed, dk = this.m.deco;
    const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? K.VOID : c[y * w + x]);
    const A = (k) => (this[k] && this[k].length === n ? this[k] : (this[k] = new Uint8Array(n)));
    const gt = A('gt'), tree = A('tree'), mPath = A('mPath'), mWater = A('mWater'), mWet = A('mWet'), mRail = A('mRail'), pdir = A('pdir'), winfo = A('winfo');
    const mat = A('mat'), wst = A('wst'), inside = A('inside'), inR = A('inR'), inL = A('inL'), wetStone = A('wetStone'), plankV = A('plankV');
    this.hc = this.hc?.length === n ? this.hc : new Float32Array(n);
    this.vh = this.vh?.length === n ? this.vh : new Float32Array(n);
    this.vfp = this.vfp?.length === n ? this.vfp : new Float32Array(n);
    this.gh = this.gh?.length === n ? this.gh : new Float32Array(n);
    this.bid = this.bid?.length === n ? this.bid : new Int32Array(n);
    // ce que représente chaque case (nom de la déco) : matière du sol, style du mur, arbre, objet plein
    this.dn = this.dn?.length === n ? this.dn : new Array(n);
    let any = false;
    for (let i = 0; i < n; i++) { const nm = dk ? DN[dk[i]] || '' : ''; this.dn[i] = nm === 'AUCUN' ? '' : nm; if (this.dn[i]) any = true; }
    this.hasDeco = any;
    const STY = { ROCHER: this.theme === 'mine' ? 2 : 0, MESA: 1, FALAISE: 1, MUR_ROC: 2, MUR_BOIS: 3, FENETRE: 3, PORTE_CLOSE: 3, ETAGERE: 3, CABANE: 7, MUR_ADOBE: 4, MAISON: 5, TOUR: 6 };
    const PROPWALL = { PIANO: 1, ESCALIER: 1, MOULIN: 1 };
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x, t = c[i], dn = this.dn[i];
      let mt = DECO_MAT[dn] || MAT.DEF;
      if (t === K.WATER && (mt === MAT.TROUGH || mt === MAT.WELL)) gt[i] = K.FLOOR;
      else gt[i] = t === K.VOID || t === K.WATER || t === K.PATH || t === K.RAIL ? t : K.FLOOR;
      if (this.m.rail && this.m.rail[i] && t !== K.WATER && t !== K.VOID && t !== K.WALL) gt[i] = K.RAIL; // les rails sous un wagonnet
      if (t === K.WATER && mt === MAT.ICE) mt = MAT.FROZEN;
      mat[i] = mt;
      tree[i] = t !== K.WALL ? 0 : dn === 'ARBRE' ? 2 : dn === 'SAPIN' ? 1 : PROPWALL[dn] ? 3 : !dn && T.trees && hsh(x, y, s + 5) < 0.8 ? 1 + (hsh(x, y, s + 6) < 0.45 ? 1 : 0) : 0;
      wst[i] = STY[dn] ?? this.styleDef;
    }
    // la matière du sol sous les objets : celle des voisines (une table sur le plancher est sur le plancher)
    const floorish = (m2) => m2 === MAT.PLANK || m2 === MAT.STAGE || m2 === MAT.RUG || m2 === MAT.WORN || m2 === MAT.TRAIL || m2 === MAT.PAVE || m2 === MAT.DEF;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x, t = c[i];
      if (!(VOLUME[t] && t !== K.WALL) && !(t === K.WATER && gt[i] === K.FLOOR) && mat[i] !== MAT.FIRE) continue;
      const cnt = new Map();
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
        const j = yy * w + xx, m2 = mat[j];
        if (VOLUME[c[j]] || !floorish(m2)) continue;
        cnt.set(m2, (cnt.get(m2) || 0) + 1);
      }
      let best = MAT.DEF, bn = 0;
      for (const [m2, k] of cnt) if (k > bn || (k === bn && m2 === MAT.PLANK)) { best = m2; bn = k; }
      if (mat[i] !== MAT.FIRE) mat[i] = best === MAT.TRAIL ? MAT.DEF : best;
    }
    // usure : sur un plancher, des lattes usées ; ailleurs, de la terre tassée
    for (let i = 0; i < n; i++) {
      if (mat[i] !== MAT.WORN) continue;
      const x = i % w, y = (i - x) / w;
      let pk = 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < w && yy < h && (mat[yy * w + xx] === MAT.PLANK || mat[yy * w + xx] === 18)) pk++; }
      if (pk || this.theme === 'saloon') mat[i] = 18;
    }
    // l'intérieur des bâtiments : ce qu'on n'atteint pas depuis le bord sans traverser un mur ni une porte
    const out = new Uint8Array(n), st = [];
    const pass = (j) => c[j] !== K.WALL && mat[j] !== MAT.DOOR;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if ((x === 0 || y === 0 || x === w - 1 || y === h - 1 || c[i] === K.VOID) && pass(i) && !out[i]) { out[i] = 1; st.push(i); }
    }
    while (st.length) {
      const k = st.pop(), x = k % w, y = (k - x) / w;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const xx = x + dx, yy = y + dy, j = yy * w + xx;
        if (xx >= 0 && yy >= 0 && xx < w && yy < h && !out[j] && pass(j)) { out[j] = 1; st.push(j); }
      }
    }
    for (let i = 0; i < n; i++) inside[i] = !this.hasDeco ? (this.theme === 'saloon' ? 1 : 0) : !out[i] && c[i] !== K.WALL && c[i] !== K.VOID && mat[i] !== MAT.DOOR ? 1 : 0;
    const ins = [];
    for (let i = 0; i < n; i++) if (inside[i]) ins.push(i);
    this.interiors = ins.length ? ins : null;
    // hauteur du sol (planchers surélevés, estrade, eau plus basse), sens des lattes
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x, mt = mat[i];
      this.gh[i] = c[i] === K.WATER && gt[i] === K.WATER ? (mt === MAT.FROZEN ? -1 : -2) : mt === 18 ? 1.5 : MATH_[mt] || (gt[i] === K.PATH && T.boardwalk && !this.hasDeco ? 1.5 : 0);
      if (mt === MAT.PLANK || mt === 18 || mt === MAT.STAGE) {
        const isP = (xx, yy) => xx >= 0 && yy >= 0 && xx < w && yy < h && (mat[yy * w + xx] === mt || VOLUME[c[yy * w + xx]]);
        const nu = (isP(x - 1, y) ? 1 : 0) + (isP(x + 1, y) ? 1 : 0), nv = (isP(x, y - 1) ? 1 : 0) + (isP(x, y + 1) ? 1 : 0);
        plankV[i] = inside[i] ? 0 : nu > nv ? 1 : 0;
      }
    }
    // usure : la terre tassée au bord des pistes et devant les portes
    const wear = A('wear');
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      wear[i] = 0;
      if (gt[i] !== K.FLOOR || mat[i] !== MAT.DEF) continue;
      let wv = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy;
        if ((!dx && !dy) || xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
        const j = yy * w + xx, dg = dx && dy;
        if (mat[j] === MAT.DOOR) wv = Math.max(wv, dg ? 90 : 170);
        else if (gt[j] === K.PATH) wv = Math.max(wv, dg ? 40 : 90);
      }
      wear[i] = wv;
    }
    const isWall = (x, y) => at(x, y) === K.WALL && !tree[y * w + x];
    const grp = (k) => (k <= 2 ? 0 : k === 3 || k === 7 || k === 8 ? 1 : 2);
    const sameWall = (x, y, g) => isWall(x, y) && grp(wst[y * w + x]) === g;
    const N8 = [[-1, 0, 1], [1, 0, 2], [0, -1, 4], [0, 1, 8], [-1, -1, 16], [1, -1, 32], [-1, 1, 64], [1, 1, 128]];
    const mask = (x, y, other) => { let m = 0; for (const [dx, dy, bit] of N8) if (other(x + dx, y + dy)) m |= bit; return m; };
    // bâtiments de la grand-rue : blocs de murs voisins, découpés en façades de trois cases
    const comp = new Int32Array(n).fill(-1);
    let nc = 0;
    for (let i = 0; i < n; i++) {
      if (comp[i] >= 0 || !isWall(i % w, (i / w) | 0)) continue;
      const st = [i];
      comp[i] = nc;
      while (st.length) {
        const k = st.pop(), x = k % w, y = (k / w) | 0;
        for (const [dx, dy] of N8.slice(0, 4)) {
          const xx = x + dx, yy = y + dy, kk = yy * w + xx;
          if (xx >= 0 && yy >= 0 && xx < w && yy < h && comp[kk] < 0 && isWall(xx, yy)) { comp[kk] = nc; st.push(kk); }
        }
      }
      nc++;
    }
    let hmax = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x, t = c[i];
      inR[i] = x < w - 1 ? inside[i + 1] : 0;
      inL[i] = y < h - 1 ? inside[i + w] : 0;
      wetStone[i] = mask(x, y, (xx, yy) => xx >= 0 && yy >= 0 && xx < w && yy < h && mat[yy * w + xx] === MAT.FOUNTAIN) ? 1 : 0;
      mPath[i] = t === K.PATH ? mask(x, y, (xx, yy) => { const u = at(xx, yy); return u !== K.PATH && u !== K.VOID && u !== K.RAIL; }) : 0;
      mWater[i] = t === K.WATER ? mask(x, y, (xx, yy) => { const u = at(xx, yy); return u !== K.WATER && u !== K.VOID; }) : 0;
      mWet[i] = t !== K.WATER && t !== K.VOID ? mask(x, y, (xx, yy) => at(xx, yy) === K.WATER && gt[yy * w + xx] === K.WATER) : 0;
      const rl = this.m.rail;
      mRail[i] = gt[i] === K.RAIL ? mask(x, y, (xx, yy) => { const u = at(xx, yy); return u === K.RAIL || (rl && xx >= 0 && yy >= 0 && xx < w && yy < h && rl[yy * w + xx]) || (u === K.VOID && (xx === x || yy === y)); }) & 15 : 0;
      pdir[i] = mask(x, y, (xx, yy) => at(xx, yy) === K.PATH) & 15;
      const wall = isWall(x, y), P = this.styles[wst[i]];
      winfo[i] = wall ? mask(x, y, (xx, yy) => !sameWall(xx, yy, grp(wst[i]))) : 0;
      let hc = 0;
      if (wall) {
        const b = comp[i] * 4096 + Math.floor(x / 3) * 64 + Math.floor(y / 3);
        this.bid[i] = P.kind === 'wood' ? comp[i] * 4096 + Math.floor(x / 6) * 64 + Math.floor(y / 6) : b;
        hc = P.kind === 'facade' ? [18, 20.5, 23][Math.floor(hsh(b, 1, s) * 3)] : P.h;
      }
      this.hc[i] = hc;
      hmax = Math.max(hmax, hc + (P.hv || 0) + (P.bump || 0) + (P.crenel ? 3 : P.parapet ? 2 : 0) + 2);
      // (un wagonnet roule : pas d'ombre portée cuite dans le sol, pour qu'il puisse bouger sans refaire le sol)
      const vv = wall ? [hc, 0.5] : tree[i] ? [20, 0.42] : this.dn[i] === 'WAGONNET' ? [0, 0] : VOLH[t] || [0, 0];
      this.vh[i] = vv[0];
      this.vfp[i] = vv[1];
    }
    this.hTop = Math.min(HMAX, Math.ceil(hmax + 6));
    // le pied des murs suit le plancher voisin (bâtiments surélevés) : le plus haut des sols voisins, pour toute la masse
    const wz = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      if (!this.hc[i]) continue;
      const x = i % w, y = (i - x) / w;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < w && yy < h && !this.hc[yy * w + xx]) wz[i] = Math.max(wz[i], this.gh[yy * w + xx]); }
    }
    const cz = new Map();
    for (let i = 0; i < n; i++) if (this.hc[i]) cz.set(comp[i], Math.max(cz.get(comp[i]) || 0, wz[i]));
    for (let i = 0; i < n; i++) if (this.hc[i]) this.gh[i] = cz.get(comp[i]) || 0;
    // ombres du soleil selon le moment : longues et bleutées au crépuscule, à peine la nuit
    const tm = this.m.time || (this.m.sky === 'nuit' || this.m.dark ? 'nuit' : 'midi');
    this.sun = { midi: { thr: 15, tint: [0.72, 0.72, 0.76] }, aube: { thr: 8, tint: [0.7, 0.66, 0.8] }, crepuscule: { thr: 6, tint: [0.58, 0.6, 0.84] }, nuit: { thr: 15, tint: [0.86, 0.86, 0.92] } }[tm] || { thr: 15, tint: [0.72, 0.72, 0.76] };
    this.sun.time = tm;
    // fenêtres des murs de bâtiments donnant sur une pièce : les rayons de soleil sur le plancher
    // volées d'escalier : rang de chaque case dans sa volée ; braseros (feu même sans lumière déclarée)
    const sk = A('stairK'), sn2 = A('stairN'), sax = A('stairAx');
    this.braziers = [];
    for (let i = 0; i < n; i++) {
      if (this.dn[i] === 'BRASERO') this.braziers.push(i);
      if (this.dn[i] !== 'ESCALIER') continue;
      const x = i % w, y = (i - x) / w, isS = (xx, yy) => xx >= 0 && yy >= 0 && xx < w && yy < h && this.dn[yy * w + xx] === 'ESCALIER';
      const ax = isS(x - 1, y) || isS(x + 1, y) ? 1 : isS(x, y - 1) || isS(x, y + 1) ? 0 : (at(x - 1, y) === K.WALL || at(x + 1, y) === K.WALL ? 0 : 1);
      let lo = 0, hi = 0;
      while (ax ? isS(x - lo - 1, y) : isS(x, y - lo - 1)) lo++;
      while (ax ? isS(x + hi + 1, y) : isS(x, y + hi + 1)) hi++;
      sk[i] = hi; sn2[i] = lo + hi + 1; sax[i] = ax;
    }
    this._snapC = c.slice();
    this._snapD = dk ? dk.slice() : null;
    this.windows = [];
    for (let i = 0; i < n; i++) {
      if (!this.hc[i] || this.styles[wst[i]].kind !== 'wood' && this.styles[wst[i]].kind !== 'saloon') continue;
      const x = i % w, y = (i - x) / w;
      for (const f of [0, 1]) {
        if (!(f ? inR[i] : inL[i])) continue;
        const win = this.dn[i] === 'FENETRE' || (!this.hasDeco && hsh(x * 2 + f, y, s + 91) < 0.3);
        if (win) this.windows.push({ x, y, f });
      }
    }
    // pour aller vite : y a-t-il un volume qui peut faire de l'ombre sur la case (vers la lumière) ? des murs devant
    // ou derrière elle, qui peuvent la masquer ou qu'elle peut masquer (portée de leurs rayons) ?
    const sn = A('shadowNear'), wf = A('wallFront'), wb = A('wallBack');
    const hasW = (x, y) => x >= 0 && y >= 0 && x < w && y < h && this.hc[y * w + x] > 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      let s1 = 0, f = 0, b = 0;
      for (let dy = -1; dy <= 2 && !s1; dy++) for (let dx = -3; dx <= 1; dx++) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < w && yy < h && this.vh[yy * w + xx] > 0) { s1 = 1; break; } }
      if (!s1) for (let dy = -2; dy <= 3 && !s1; dy++) for (let dx = -4; dx <= 2; dx++) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < w && yy < h && this.vh[yy * w + xx] > 0) { s1 = 1; break; } }
      for (let dy = 0; dy <= 4; dy++) for (let dx = 0; dx <= 4; dx++) { if (dx + dy && dx + dy <= 4) { if (hasW(x + dx, y + dy)) f = 1; if (hasW(x - dx, y - dy)) b = 1; } }
      for (const [dx, dy] of [[1, -1], [-1, 1], [2, -1], [-1, 2], [1, -2], [-2, 1], [2, -2], [-2, 2]]) { if (hasW(x + dx, y + dy)) f = b = 1; }
      sn[i] = s1; wf[i] = f; wb[i] = b;
    }
    if (this.nWall) this._shadowMap();
  }

  // hauteur des murs au point (U, V) de la carte (0 hors des murs) : bords arrondis et irréguliers, bosses, paliers
  hW(U, V, bump = true, quant = true) {
    const x = Math.floor(U + 0.5), y = Math.floor(V + 0.5);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return 0;
    const i = y * this.w + x, H0 = this.hc[i];
    if (!H0) return 0;
    const P = this.styles[this.wst[i]], wi = this.winfo[i], nf = this._wf;
    if (P.hv || P.bump || P.wob) this.nWall(U, V, nf);
    let hg = P.hv ? H0 + (nf[0] - 0.5) * P.hv * 2 : H0;
    if (wi) {
      let d = edgeD(wi, U - x + 0.5, V - y + 0.5, P.corner);
      if (d < 1) {
        if (P.wob) d += (nf[1] - 0.5) * P.wob * 2 - P.wob * 0.5;
        if (d <= 0) return 0;
        if (P.r > 0 && d < P.r) { const t = d / P.r; hg *= Math.sqrt(1 - (1 - t) * (1 - t)); }
        if ((P.kind === 'facade' || P.parapet) && d < 0.075) hg += 1.6;
        if (P.crenel && d < 0.1 && fract((U - V) * 2.5 + 0.25) < 0.5) hg += 2.6;
      }
    }
    if (P.bump && bump) hg += (nf[2] - 0.5) * P.bump * 2;
    if (P.terrace && quant) hg = Math.ceil(hg / P.terrace) * P.terrace;
    return hg;
  }

  // ---------------------------------------------------------- caméra et conversions
  get cam() { return this._cam; }
  _clamp(p) {
    const vh = this.bottom - this.top;
    const x0 = -24, x1 = this.WW - W + 24, y0 = -this.top - 6, y1 = this.WH - this.bottom + 6;
    p.x = x1 < x0 ? (this.WW - W) / 2 : clamp(p.x, x0, x1);
    p.y = y1 < y0 || this.WH < vh ? (this.WH - this.top - this.bottom) / 2 : clamp(p.y, y0, y1);
    return p;
  }
  setCamera(x, y) {
    this._clamp(Object.assign(this._cam, { x, y }));
    Object.assign(this._tgt, this._cam);
    this._round();
  }
  centerOn(cx, cy, { smooth = true } = {}) {
    const t = this._clamp({ x: (cx - cy) * HW + this.OX - W / 2, y: (cx + cy) * HH + this.OY - (this.top + this.bottom) / 2 - 6 });
    if (smooth) Object.assign(this._tgt, t);
    else this.setCamera(t.x, t.y);
  }
  scroll(dx, dy) {
    this._clamp(Object.assign(this._cam, { x: this._cam.x + dx, y: this._cam.y + dy }));
    Object.assign(this._tgt, this._cam);
    this._round();
  }
  // dt en millisecondes : la caméra glisse vers sa cible ; on prépare en avance les morceaux de sol voisins
  update(dt = 16) {
    const k = 1 - Math.exp(-dt / 120), c = this._cam, t = this._tgt;
    c.x += (t.x - c.x) * k;
    c.y += (t.y - c.y) * k;
    if (Math.abs(t.x - c.x) < 0.1 && Math.abs(t.y - c.y) < 0.1) { c.x = t.x; c.y = t.y; }
    this._round();
    this.prewarm(3, 40);
  }
  _round() { this._cr.x = Math.round(this._cam.x * F) / F; this._cr.y = Math.round(this._cam.y * F) / F; }
  toScreen(cx, cy, z = 0) {
    return { x: (cx - cy) * HW + this.OX - this._cr.x, y: (cx + cy) * HH + this.OY - this._cr.y - z };
  }
  // case sous le pointeur (au sol), null hors de la carte ou dans le vide
  toCell(sx, sy) {
    const rx = sx + this._cr.x - this.OX, ry = sy + this._cr.y - this.OY;
    const U = (ry / HH + rx / HW) / 2, V = (ry / HH - rx / HW) / 2;
    const x = Math.floor(U + 0.5), y = Math.floor(V + 0.5);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h || this.m.cells[y * this.w + x] === K.VOID) return null;
    return { x, y };
  }
  // hauteur du sol d'une case (trottoirs de planches, eau) : pour poser les personnages au bon niveau
  groundZ(x, y) {
    const i = y * this.w + x;
    return this.m.cells[i] === K.WALL ? 0 : this.gh[i] || 0;
  }

  // ---------------------------------------------------------- caches à mémoire bornée (morceaux de sol, murs)
  _get(key, make) {
    let e = this.lru.get(key);
    if (e) {
      if (e.f !== this.frame) { this.lru.delete(key); this.lru.set(key, e); e.f = this.frame; }
      return e.c;
    }
    const c = make();
    e = { c, b: c ? c.width * c.height * 4 : 0, f: this.frame };
    this.lru.set(key, e);
    this.bytes += e.b;
    if (this.bytes > BUDGET) this._evict();
    return c;
  }
  _evict() {
    for (const [k, e] of this.lru) {
      if (this.bytes <= BUDGET * 0.85) break;
      if (e.f >= this.frame - 1) continue;
      S.freeCanvas(e.c);
      this.bytes -= e.b;
      this.lru.delete(k);
    }
  }
  _prop(key, make) {
    let c = this.props.get(key);
    if (c === undefined) { c = make(); this.props.set(key, c); }
    return c;
  }
  // prépare ce qui est (ou sera bientôt) à l'écran, dans la limite de ms millisecondes ; renvoie vrai quand tout est prêt
  prewarm(ms = 12, margin = 0) {
    const t0 = performance.now(), cam = this._tgt;
    const x0 = Math.floor((cam.x - margin) / CHUNK), x1 = Math.floor((cam.x + W + margin) / CHUNK);
    const y0 = Math.floor((cam.y + this.top - margin) / CHUNK), y1 = Math.floor((cam.y + this.bottom + margin) / CHUNK);
    for (let cj = y0; cj <= y1; cj++) for (let ci = x0; ci <= x1; ci++) {
      const key = cj * 1024 + ci;
      if (ci < 0 || cj < 0 || this.empty.has(key) || this.lru.has(key)) continue;
      if (performance.now() - t0 > ms) return false;
      const c = this._get(key, () => this._chunk(ci, cj));
      if (!c) { this.empty.add(key); this.lru.delete(key); }
    }
    const w = this.w;
    for (let y = 0; y < this.h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!this.hc[i] || this.m.cells[i] !== K.WALL || this.lru.has(-(i + 1))) continue;
      const sx = (x - y) * HW + this.OX - cam.x, sy = (x + y) * HH + this.OY - cam.y;
      if (sx < -20 - margin || sx > W + 20 + margin || sy < this.top - 10 - margin || sy - HMAX > this.bottom + margin) continue;
      if (performance.now() - t0 > ms) return false;
      this._get(-(i + 1), () => this._wallSprite(x, y));
    }
    // les objets visibles (sprites gardés en cache) : pas d'à-coup la première fois qu'on les voit
    const c = this.m.cells;
    for (let y = 0; y < this.h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x, t = c[i];
      if (!VOLUME[t] || t === K.WALL && !this.tree[i]) continue;
      const sx = (x - y) * HW + this.OX - cam.x, sy = (x + y) * HH + this.OY - cam.y;
      if (sx < -40 - margin || sx > W + 40 + margin || sy < this.top - 10 - margin || sy - 40 > this.bottom + margin) continue;
      if (performance.now() - t0 > ms) return false;
      this._volume(x, y, i, t, 0);
    }
    return true;
  }

  // ---------------------------------------------------------- le sol
  // un morceau de 64 × 64 pixels du jeu : chaque colonne de pixels fins est un rayon qu'on suit d'avant en arrière
  // (le terrain est plein de -DEPTH à la hauteur du sol, vide hors de la carte) ; null s'il est vide
  _chunk(ci, cj) {
    const n = CHUNK * F, X0 = ci * CHUNK, Y0 = cj * CHUNK;
    if (!this._img) { this._img = new ImageData(n, n); this._d = new Uint32Array(this._img.data.buffer); }
    const d = this._d;
    d.fill(0);
    let any = false;
    const q = this._q, T = this.T, w = this.w, h = this.h, gt = this.gt;
    const ground = GROUND[this.theme], pathf = PATHS[this.theme], bw = !!T.boardwalk;
    const oyc = this.OY - Y0, sTop = Math.ceil(((Y0 + CHUNK - this.OY) + 2) / HH / DS + 2) * DS, sEnd = (Y0 - this.OY - DEPTH) / HH - DS;
    for (let col = 0; col < n; col++) {
      const cc = (X0 + (col + 0.5) / F - this.OX) / HW;
      let rowMin = n;
      for (let s = sTop; s >= sEnd; s -= DS) {
        const U = (s + cc) / 2, V = (s - cc) / 2;
        const x = Math.floor(U + 0.5), y = Math.floor(V + 0.5);
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        const i = y * w + x, t = gt[i];
        if (t === K.VOID) continue;
        const hg = this.gh[i];
        const base = (s * HH + oyc) * F;
        let rTop = Math.ceil(base - hg * F - 0.5);
        if (rTop >= rowMin) continue;
        let rBot = Math.floor(base + DEPTH * F - 0.5);
        if (rBot < 0) break;
        if (rBot >= rowMin) rBot = rowMin - 1;
        if (rTop < 0) rTop = 0;
        q.x = x; q.y = y; q.i = i; q.t = t; q.U = U; q.V = V; q.a = U - x + 0.5; q.b = V - y + 0.5;
        for (let r = rTop; r <= rBot; r++) {
          const z = (base - r - 0.5) / F;
          q.X = X0 * F + col; q.Y = Y0 * F + r;
          d[r * n + col] = z >= hg - 0.3 ? this._top(q, ground, pathf) : this._cliff(q, z, hg);
        }
        rowMin = rTop;
        any = true;
        if (rowMin <= 0) break;
      }
    }
    if (!any) return null;
    const c = S.makeCanvas(n, n), g = c.getContext('2d');
    g.putImageData(this._img, 0, 0);
    this._decorate(g, X0, Y0);
    return c;
  }
  // le dessus du sol : matière du thème, chemin, rails, eau, berges, grille, ombres portées
  _top(q, ground, pathf) {
    const T = this.T, t = q.t;
    const gf = this._gf;
    this.nGround(q.U, q.V, gf);
    q.nb = gf[0]; q.nm = gf[1]; q.na = gf[2];
    q.g = hsh(q.X >> 1, q.Y >> 1, this.seed + 3);
    let col;
    const mt = this.mat[q.i];
    if (t === K.WATER) col = mt === MAT.MUD ? waterPix(this, q, MUDT) : mt === MAT.FROZEN ? icePix(this, q) : waterPix(this, q, T);
    else {
      switch (mt) {
        case MAT.PLANK: case MAT.DOOR: col = plankPix(this, q, this.inside[q.i] || this.theme === 'saloon' ? PLANKR : BOARDR, mt === MAT.DOOR ? 2.6 : 3.6, this.plankV[q.i], false); break;
        case 18: col = plankPix(this, q, PLANKR, 3.6, this.plankV[q.i], true); break;
        case MAT.STAGE: col = plankPix(this, q, STAGER, 3.2, 1, false); break;
        case MAT.RUG: col = PATHS.saloon(this, q, T, plankPix(this, q, PLANKR, 3.6, 0, false)); break;
        case MAT.BRIDGE: col = plankPix(this, q, BOARDR, 3.4, (this.pdir[q.i] & 3) && !(this.pdir[q.i] & 12) ? 1 : 0, false); break;
        case MAT.ICE: col = icePix(this, q); break;
        case MAT.FORD: {
          // gué : eau peu profonde sur des galets
          const st = vnoise(q.U * 4, q.V * 4, this.seed + 81);
          col = st > 0.58 ? pickc(STONER, 2.4 + (st - 0.58) * 9 + (q.g - 0.5), q.X, q.Y) : pickc(T.water, 3.4 + (q.nb - 0.5) + (fract(q.V * 4 + q.U) < 0.08 ? 1.5 : 0), q.X, q.Y);
          break;
        }
        default: {
          col = ground(this, q, T);
          if (t === K.PATH) {
            if (mt === MAT.PAVE) col = PATHS.hacienda(this, q, PAVET, col);
            else if (mt === MAT.TRAIL && T.street) col = pathOver(this, q, col, STREETT);
            else if (mt === MAT.TRAIL || mt === MAT.WORN) col = pathOver(this, q, col, T);
            else col = pathf ? pathf(this, q, T, col) : pathOver(this, q, col, T);
          } else if (t === K.RAIL) col = railPix(this, q, col);
          else if (mt === MAT.WORN) col = blend(col, pathOver(this, q, col, T), 0.6);
          else if (mt === MAT.FIRE) { const r = Math.hypot(q.a - 0.5, q.b - 0.5); if (r < 0.34 + (q.nm - 0.5) * 0.1) col = blend(col, hex('2a1a12'), clamp((0.34 - r) * 6, 0, 0.85)); }
          // usure de la terre au bord des pistes et devant les portes
          if (this.wear[q.i]) col = blend(col, pickc(T.path, T.plv + 0.4, q.X, q.Y), this.wear[q.i] / 255 * 0.5 * (0.6 + q.nm * 0.8));
        }
      }
      const wm = this.mWet[q.i];
      if (wm) {
        const e = edgeD(wm, q.a, q.b, 0.3) + (q.nm - 0.5) * 0.06;
        // la berge suit l'arrondi de l'eau : côté terre, les coins rentrants de l'eau débordent un peu
        if (this.wetStone[q.i] && e < 0.13) col = pickc(STONER, 4 - e * 10 + (fract((q.U - q.V) * 4) < 0.08 ? -1.4 : 0) + (q.g - 0.5) * 0.6, q.X, q.Y);
        else if (e < 0.14) col = scale(col, 0.74 + e * 1.6);
      }
      const ct = this.m.cells[q.i];
      if ((ct === K.FLOOR || ct === K.PATH || ct === K.RAIL || ct === K.BUSH) && (q.a < 1 / 64 || q.b < 1 / 64)) col = scale(col, T.grid || 0.84);
    }
    const sh = this._shadow(q) && !this.inside[q.i], tn = this.sun.tint;
    if (sh) col = pack(((col & 255) * tn[0]) | 0, (((col >>> 8) & 255) * tn[1]) | 0, (((col >>> 16) & 255) * tn[2]) | 0);
    return this._ao ? scale(col, 1 - this._ao) : col;
  }
  // ombre portée des volumes (lumière en haut à gauche, pénombre tramée) et pied des murs assombri
  // carte des ombres portées (SR points par case), calculée une fois : les murs avec leur vraie forme, les objets par
  // leur emprise ; adoucie (pénombre) puis lue en bilinéaire et tramée
  _shadowMap() {
    const R = 6, w = this.w, h = this.h, gw = w * R, gh = h * R, vh = this.vh, fp = this.vfp;
    const raw = new Uint8Array(gw * gh), sm = (this.sm = this.sm?.length === gw * gh ? this.sm : new Uint8Array(gw * gh));
    for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
      const U = (i + 0.5) / R - 0.5, V = (j + 0.5) / R - 0.5;
      if (this.sun.thr >= 15 && !this.shadowNear[Math.floor(V + 0.5) * w + Math.floor(U + 0.5)]) continue;
      const thr = this.sun.thr, kmax = Math.min(4, 26 / thr + 0.1);
      for (let k = 0.08; k < kmax; k += 0.12) {
        const pu = U + SLX * k, pv = V + SLY * k, cx = Math.floor(pu + 0.5), cy = Math.floor(pv + 0.5);
        if (cx < 0 || cy < 0 || cx >= w || cy >= h) continue;
        const ci = cy * w + cx, hv = vh[ci];
        if (!hv || hv < k * thr) continue;
        if (this.hc[ci]) { if (this.hW(pu, pv, false) < k * thr) continue; }
        else if (Math.abs(pu - cx) > fp[ci] || Math.abs(pv - cy) > fp[ci]) continue;
        raw[j * gw + i] = 1;
        break;
      }
    }
    for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const ii = i + dx, jj = j + dy; if (ii >= 0 && jj >= 0 && ii < gw && jj < gh) n += raw[jj * gw + ii]; }
      sm[j * gw + i] = Math.round(n * 255 / 9);
    }
    this.smW = gw; this.smH = gh;
  }
  _shadow(q) {
    const fp = this.vfp, w = this.w, h = this.h, sm = this.sm, gw = this.smW;
    let sh = 0;
    let u = (q.U + 0.5) * 6 - 0.5, v = (q.V + 0.5) * 6 - 0.5;
    if (u < 0) u = 0; else if (u > gw - 1.001) u = gw - 1.001;
    if (v < 0) v = 0; else if (v > this.smH - 1.001) v = this.smH - 1.001;
    const i0 = u | 0, j0 = v | 0, fx = u - i0, fy = v - j0, k = j0 * gw + i0;
    const k1 = i0 + 1 < gw ? k + 1 : k, k2 = j0 + 1 < this.smH ? k + gw : k, k3 = k2 + (k1 - k);
    const val = ((sm[k] * (1 - fx) + sm[k1] * fx) * (1 - fy) + (sm[k2] * (1 - fx) + sm[k3] * fx) * fy) / 255;
    if (val > bay(q.X, q.Y)) sh = 1;
    const i = q.i, x = q.x, y = q.y;
    let ao = 0;
    if (x > 0 && fp[i - 1] >= 0.44) ao = Math.max(ao, 0.18 - q.a);
    if (x < w - 1 && fp[i + 1] >= 0.44) ao = Math.max(ao, q.a - 0.82);
    if (y > 0 && fp[i - w] >= 0.44) ao = Math.max(ao, 0.18 - q.b);
    if (y < h - 1 && fp[i + w] >= 0.44) ao = Math.max(ao, q.b - 0.82);
    this._ao = ao * 1.1;
    return sh;
  }
  // l'épaisseur du terrain (bord de la maquette, berges, bord des trottoirs) : strates, herbe ou neige qui déborde
  _cliff(q, z, hg) {
    const T = this.T, t = q.t;
    if (z < -DEPTH + 0.3) return OUTC;
    const g = hsh(q.X >> 1, q.Y >> 1, this.seed + 3), right = q.a > q.b ? 1 : 0, sx = q.U - q.V;
    if (hg > 0 && z > -0.1) {
      // bord d'un plancher surélevé, d'une estrade (jupe rouge), d'un pont
      if (this.mat[q.i] === MAT.STAGE && z < hg - 0.8) return pickc(RED, (right ? 0.6 : 1.8) + (fract((right ? q.V : q.U) * 8) < 0.3 ? -0.6 : 0), q.X, q.Y);
      return pickc(WOOD, (right ? 1.2 : 2.6) + (fract((right ? q.V : q.U) * 5 + 0.5) < 0.12 ? -1 : 0) + (z > hg - 0.4 ? 1 : 0), q.X, q.Y);
    }
    if (this.wetStone[q.i] && z > hg - 3) return pickc(STONER, (right ? 1.4 : 2.8) + (fract((q.U - q.V) * 3) < 0.1 ? -1 : 0), q.X, q.Y);
    if (T.lip && t !== K.WATER && z > hg - 1.2 - hsh(q.X >> 2, 7, this.seed) * 2.2) return pickc(T.lip, (right ? 1.2 : 3) + (g - 0.5), q.X, q.Y);
    if (T.joists) {
      if (z > -2.6) return pickc(WOOD, (right ? 1.6 : 3) + (z > -0.6 ? 1 : 0) + (g - 0.5) * 0.5, q.X, q.Y);
      const row = Math.floor((z + 2.6) / 3.2), off = row & 1 ? 0.5 : 0;
      if (fract((z + 2.6) / 3.2) < 0.2 || fract(sx * 2.2 + off) < 0.08) return pickc(GREYW, right ? 0.4 : 1, q.X, q.Y);
      return pickc(GREYW, (right ? 1.4 : 2.6) - ((hg - z) / DEPTH) * 1.2 + (hsh(Math.floor(sx * 2.2 + off), row, this.seed) - 0.5), q.X, q.Y);
    }
    const k = (hg - z) / (DEPTH + hg);
    let lv = 4.4 - k * 3 - right * 1.1 + (vnoise(sx * 2, z * 0.3, this.seed + 3) - 0.5) * 0.9 + (g - 0.5) * 0.4;
    if (T.strata) { const sz = z + (vnoise(sx * 1.2, 0, this.seed + 2) - 0.5) * 2.5; if (fract(sz / T.strata) < 0.2) lv -= 0.8; }
    if (z > hg - 0.6) lv += 1;
    if (this.mWet[q.i] && z > hg - 2.4) lv -= 0.8;
    return pickc(T.cliff, lv, q.X, q.Y);
  }
  // menus détails du sol et brûlures des explosions, posés sur le morceau
  _decorate(g, X0, Y0) {
    const T = this.T, w = this.w, c = this.m.cells, s = this.seed;
    // les cases dont le centre tombe près du morceau : x - y et x + y bornés
    const d0 = Math.floor((X0 - 20 - this.OX) / HW), d1 = Math.ceil((X0 + CHUNK + 20 - this.OX) / HW);
    const s0 = Math.max(0, Math.floor((Y0 - 12 - this.OY) / HH)), s1 = Math.min(w + this.h - 2, Math.ceil((Y0 + CHUNK + 12 - this.OY) / HH));
    for (let sm = s0; sm <= s1; sm++) for (let dd = d0; dd <= d1; dd++) {
      if ((sm + dd) & 1) continue;
      const x = (sm + dd) / 2, y = (sm - dd) / 2;
      if (x < 0 || y < 0 || x >= w || y >= this.h) continue;
      const i = y * w + x, t = c[i];
      if (t !== K.FLOOR && t !== K.PATH) continue;
      const wx = (x - y) * HW + this.OX - X0, wy = (x + y) * HH + this.OY - Y0 - this.gh[i];
      const dn = this.dn[i], mt = this.mat[i];
      if (dn && dn.startsWith('DEBRIS') && dn !== 'DEBRIS_LUSTRE') { drawDebris(g, dn, Math.round(wx * F), Math.round(wy * F), x * 31 + y); continue; }
      if (mt === MAT.BREACH) { drawDebris(g, 'DEBRIS_PIERRE', Math.round(wx * F), Math.round(wy * F), x * 31 + y); continue; }
      if (mt === MAT.FIRE || mt === MAT.ICE || mt === MAT.FORD || mt === MAT.BRIDGE || mt === MAT.STAGE || mt === MAT.RUG) continue;
      const indoor = mt === MAT.PLANK || mt === 18 || mt === MAT.DOOR;
      const list = indoor ? (this.inside[i] ? ['nail', 'card', 'coin', 'straw', 'nail'] : ['nail', 'straw', 'nail']) : mt === MAT.TRAIL && T.street ? ['hoof', 'pebble', 'dung', 'hoof'] : T.deco;
      const nd = Math.floor(hsh(x, y, s + 77) * (indoor ? 1.6 : 2.6));
      for (let k = 0; k < nd; k++) {
        const r = (j) => hsh(x * 7 + k, y * 13 + j, s + 101);
        const kind = list[Math.floor(r(0) * list.length)];
        if (t === K.PATH && !indoor) { if (kind !== 'step' && kind !== 'hoof' && kind !== 'pebble' && kind !== 'dung') continue; }
        else if (kind === 'step') continue;
        const a = 0.22 + r(1) * 0.56, b = 0.22 + r(2) * 0.56;
        drawDeco(g, kind, Math.round((wx + (a - b) * HW) * F), Math.round((wy + (a + b - 1) * HH) * F), r, T);
      }
    }
    for (const sc of this.m.scorch || []) {
      const x0 = ((sc.x - sc.y) * HW + this.OX - X0) * F, y0 = ((sc.x + sc.y) * HH + this.OY - Y0) * F;
      if (x0 < -120 || x0 > CHUNK * F + 120 || y0 < -70 || y0 > CHUNK * F + 70) continue;
      for (let i = 0; i < 220; i++) {
        const a = hsh(i, sc.x, sc.y) * Math.PI * 2, k = hsh(sc.y, i, sc.x), r = k * 60;
        g.fillStyle = `rgba(20,10,6,${(0.45 * (1 - k)).toFixed(2)})`;
        g.fillRect(Math.round(x0 + Math.cos(a) * r) - 3, Math.round(y0 + Math.sin(a) * r * 0.5) - 2, 7, 4);
      }
      for (let i = 0; i < 36; i++) {
        const a = hsh(i, sc.y, sc.x) * Math.PI * 2, r = 50 + hsh(i, sc.x, 9) * 50;
        g.fillStyle = i % 3 ? 'rgba(40,24,14,0.6)' : 'rgba(110,72,40,0.7)';
        g.fillRect(Math.round(x0 + Math.cos(a) * r), Math.round(y0 + Math.sin(a) * r * 0.5), 3, 2);
      }
    }
  }
  drawGround(ctx, now = 0) {
    this.frame++;
    const cam = this._cr;
    ctx.fillStyle = this.T.back;
    ctx.fillRect(0, 0, W, H);
    const y0 = Math.floor((cam.y + this.top - 2) / CHUNK), y1 = Math.floor((cam.y + this.bottom + 2) / CHUNK);
    const x0 = Math.floor(cam.x / CHUNK), x1 = Math.floor((cam.x + W) / CHUNK);
    for (let cj = y0; cj <= y1; cj++) for (let ci = x0; ci <= x1; ci++) {
      if (ci < 0 || cj < 0 || ci * CHUNK > this.WW || cj * CHUNK > this.WH) continue;
      const key = cj * 1024 + ci;
      if (this.empty.has(key)) continue;
      const c = this._get(key, () => this._chunk(ci, cj));
      if (!c) { this.empty.add(key); this.lru.delete(key); continue; }
      ctx.drawImage(c, ci * CHUNK - cam.x, cj * CHUNK - cam.y, CHUNK, CHUNK);
    }
    this._water(ctx, now);
    // flaques (whisky, pétrole, eau, sang) : décalques posés sur le sol, un reflet qui passe
    if (this.m.puddle && this.m.puddle.size) for (const [i, kind] of this.m.puddle) {
      const x = i % this.w, y = (i - x) / this.w;
      const sx = (x - y) * HW + this.OX - cam.x, sy = (x + y) * HH + this.OY - cam.y - (this.gh[i] || 0);
      if (sx < -20 || sx > W + 20 || sy < this.top - 10 || sy > this.bottom + 10) continue;
      const st = this._prop(`puddle${kind}${i % 3}`, () => puddleSprite(kind, i % 3));
      ctx.drawImage(st, Math.round((sx - st.ox) * F) / F, Math.round((sy - st.oy) * F) / F, st.width / F, st.height / F);
      if (kind !== 'sang' && Math.sin(now / 900 + i) > 0.7) { ctx.fillStyle = 'rgba(255,255,240,0.55)'; ctx.fillRect(sx - 4 + Math.sin(now / 1300 + i) * 3, sy - 1, 2, 0.25); }
    }
  }
  // reflets mouvants sur l'eau
  _water(ctx, now) {
    const cam = this._cr, w = this.w, c = this.m.cells, s = this.seed;
    for (let y = 0; y < this.h; y++) for (let x = 0; x < w; x++) {
      if (c[y * w + x] !== K.WATER) continue;
      const sx = (x - y) * HW + this.OX - cam.x, sy = (x + y) * HH + this.OY - cam.y + 2;
      if (sx < -20 || sx > W + 20 || sy < this.top - 10 || sy > this.bottom + 10) continue;
      for (let k = 0; k < 3; k++) {
        const ph = hsh(x * 3 + k, y, s + 5) * 6.283, t = Math.sin(now / 700 + ph);
        if (t < 0.35) continue;
        const a = 0.22 + hsh(x, y * 3 + k, s + 6) * 0.56 + Math.sin(now / 1900 + ph) * 0.06, b = 0.22 + hsh(x + k, y, s + 7) * 0.56;
        const px = Math.round((sx + (a - b) * HW) * F) / F, py = Math.round((sy + (a + b - 1) * HH) * F) / F;
        ctx.fillStyle = t > 0.8 ? 'rgba(255,255,255,0.85)' : 'rgba(220,240,255,0.5)';
        ctx.fillRect(px, py, t > 0.8 ? 1.5 : 1, 0.25);
        if (t > 0.7) ctx.fillRect(px + 0.5, py - 0.25, 0.5, 0.25);
      }
    }
  }

  // ---------------------------------------------------------- les murs
  // sprite d'une case de mur : les pixels du relief dont le premier point touché par le rayon est dans cette case
  _wallSprite(x, y) {
    const hm = this.hTop, up = HH + hm + 2, down = HH + 2;
    const Wd = TW * F + 4, Hd = (up + down) * F, ox = Wd / 2, oy = up * F;
    const d = new Uint32Array(Wd * Hd), cls = new Uint8Array(Wd * Hd);
    const q = this._wq, sc = x + y, c0 = x - y;
    q.x = x; q.y = y; q.i = y * this.w + x; q.wi = this.winfo[q.i];
    const PS = this.styles[this.wst[q.i]], paint = WALLPAINT[PS.kind] || paintRock;
    const X0 = (c0 * HW + this.OX) * F - ox, Y0 = (sc * HH + this.OY) * F - oy;
    // le rayon part de devant la case (plus loin s'il y a des murs devant qui peuvent la masquer) et va jusque derrière
    // elle (à grands pas : on n'y cherche que les murs du fond, pour ne pas tracer de contour par-dessus)
    const front = this.wallFront[q.i] ? hm / HH : 0, back = this.wallBack[q.i], e = 1 / 24;
    for (let col = 0; col < Wd; col++) {
      const cc = c0 + (col + 0.5 - ox) / F / HW;
      // la colonne ne traverse la case que de sc - span à sc + span
      const span = Math.max(0, 1 - Math.abs(cc - c0)), sIn = sc + span + DS, sOut = sc - span - DS;
      const sTop = Math.ceil((sIn + front) / DS) * DS, sEnd = back ? sc - up / HH - DS : sOut;
      let rowMin = Hd, ownTop = -1;
      for (let s = sTop; s >= sEnd; s -= s < sOut || s > sIn ? DS * 3 : DS) {
        if (s < sOut && ownTop >= 0 && rowMin < ownTop - 6) break;
        const U = (s + cc) / 2, V = (s - cc) / 2;
        const hg = this.hW(U, V);
        if (hg <= 0) continue;
        const base = (s - sc) * HH * F + oy;
        let rTop = Math.ceil(base - hg * F - 0.5);
        if (rTop >= rowMin) continue;
        let rBot = Math.floor(base - 0.5);
        if (rBot >= rowMin) rBot = rowMin - 1;
        if (rTop < 0) rTop = 0;
        if (Math.floor(U + 0.5) === x && Math.floor(V + 0.5) === y && rBot >= rTop) {
          ownTop = rTop;
          const h0 = this.hW(U, V, false, false), hu = (this.hW(U + e, V, false, false) - h0) / e, hv = (this.hW(U, V + e, false, false) - h0) / e;
          // la surface touchée : dessus (presque à plat) ou flanc, selon sa normale (pas selon la longueur du trait)
          let nx = -hu / 20, ny = -hv / 20;
          const a = U - x + 0.5, b = V - y + 0.5, g2 = nx * nx + ny * ny;
          q.U = U; q.V = V; q.a = a; q.b = b; q.h = hg;
          const tnz = 1 / Math.sqrt(g2 + 1), top = tnz > 0.55, terr = !!PS.terrace;
          const li = top ? lit(nx, ny, 1) : lit(nx, ny, Math.min(1, 1 / Math.sqrt(g2 + 0.01)));
          if (g2 < 0.5) { nx = a > b ? 1 : 0; ny = a > b ? 0 : 1; }
          const ff = nx > ny ? 1 : 0, lf = lit(nx, ny, 0.1);
          for (let r = rTop; r <= rBot; r++) {
            const z = (base - r - 0.5) / F;
            // en paliers : la première rangée du trait est le replat, le reste la marche ; sinon, selon la normale
            const tp = terr ? z >= hg - 0.35 : top;
            q.z = tp ? hg : z; q.top = tp; q.X = X0 + col; q.Y = Y0 + r; q.face = ff;
            q.li = terr ? (tp ? LZ : lf) : li; q.nz = tp ? (terr ? 1 : tnz) : 0;
            const k = r * Wd + col;
            d[k] = paint(this, PS, q);
            cls[k] = top ? 2 : 3;
          }
        } else for (let r = rTop; r <= rBot; r++) cls[r * Wd + col] = 1;
        rowMin = rTop;
        if (rowMin <= 0) break;
      }
    }
    // arête claire au bord du dessus, puis contour sombre là où il n'y a que le sol derrière
    for (let k = 0; k < Wd * (Hd - 1); k++) if (cls[k] === 2 && cls[k + Wd] === 3) d[k] = blend(d[k], WHITE, 0.22);
    let bx0 = Wd, by0 = Hd, bx1 = -1, by1 = -1;
    const src = cls;
    for (let r = 0; r < Hd; r++) for (let col = 0; col < Wd; col++) {
      const k = r * Wd + col;
      if (src[k] === 0 && ((col > 0 && src[k - 1] > 1) || (col < Wd - 1 && src[k + 1] > 1) || (r > 0 && src[k - Wd] > 1) || (r < Hd - 1 && src[k + Wd] > 1))) d[k] = OUTC;
      if (d[k]) { if (col < bx0) bx0 = col; if (col > bx1) bx1 = col; if (r < by0) by0 = r; if (r > by1) by1 = r; }
    }
    if (bx1 < 0) return null;
    const cw = bx1 - bx0 + 1, ch = by1 - by0 + 1, c = S.makeCanvas(cw, ch), g = c.getContext('2d');
    const img = g.createImageData(cw, ch), o = new Uint32Array(img.data.buffer);
    for (let r = 0; r < ch; r++) o.set(d.subarray((r + by0) * Wd + bx0, (r + by0) * Wd + bx0 + cw), r * cw);
    g.putImageData(img, 0, 0);
    c.ox = (ox - bx0) / F;
    c.oy = (oy - by0) / F;
    return c;
  }

  // ---------------------------------------------------------- volumes et personnages
  // le sprite du volume de la case (x, y), ou null : la déco de la carte choisit l'objet (cohérence du thème), l'usure
  // (m.dmg : 1 abîmé, 2 très abîmé) sa variante, faite une fois
  _volume(x, y, i, t, beat) {
    const T = this.T, s = this.seed, c = this.m.cells, w = this.w, dn = this.dn[i];
    const vr = (n) => Math.floor(hsh(x, y, s + 200 + t) * n);
    const nb = (dx, dy, ok) => { const xx = x + dx, yy = y + dy; return xx >= 0 && yy >= 0 && xx < w && yy < this.h && ok(c[yy * w + xx]); };
    let key, make;
    switch (t) {
      case K.WALL: {
        const tr = this.tree[i];
        if (tr === 3) {
          if (dn === 'PIANO') return this._prop('piano', pianoSprite);
          if (dn === 'MOULIN') return this._prop('moulin', () => windmillSprite(0));
          const ax = this.stairAx[i], sk = this.stairK[i], sn = Math.max(1, this.stairN[i]);
          return this._prop(`stairs${ax}_${sk}_${sn}`, () => stairsSprite(ax, sk, sn));
        }
        if (tr) { const v = vr(6), pine = tr === 1; return this._prop(`tree${pine ? 1 : 0}_${v}`, () => treeSprite(T, v, pine)); }
        return this._get(-(i + 1), () => this._wallSprite(x, y));
      }
      case K.CRATE: {
        const byDeco = { CAISSE: 'crate', TONNEAU: 'barrel', TONNEAU_WHISKY: 'whisky', CHARIOT: 'wagon', MEULE: 'hay', WAGONNET: 'cart', SOUCHE: 'stump', BILLE: 'logs', BUCHES: 'logs', ROCHE: 'boulder', TOMBE: 'grave', DEBRIS_LUSTRE: 'wreck', BRASERO: 'brazier' };
        const kind = byDeco[dn] || T.crate[vr(T.crate.length * 7) % T.crate.length], v = vr(3);
        const fn = { crate: crateSprite, barrel: barrelSprite, hay: haySprite, logs: logsSprite, cart: cartSprite, jar: jarSprite, trough: troughSprite, whisky: whiskySprite, wagon: wagonSprite,
          stump: (T2, v2) => stumpSprite(v2), boulder: boulderSprite, grave: graveSprite, wreck: () => lustreWreckSprite(), brazier: () => brazierSprite() }[kind] || crateSprite;
        key = `${kind}${kind === 'wreck' || kind === 'brazier' ? 0 : v}`;
        make = () => fn(T, v);
        break;
      }
      case K.CHEST: { const v = vr(2); key = `keg${v}`; make = () => barrelSprite(T, v + 5, true); break; }
      case K.SAND: {
        if (dn === 'CONGERE') { const v = vr(2); key = `drift${v}`; make = () => driftSprite(v); break; }
        const along = nb(-1, 0, (u) => u === K.SAND) || nb(1, 0, (u) => u === K.SAND) ? 1 : nb(0, -1, (u) => u === K.SAND) || nb(0, 1, (u) => u === K.SAND) ? 0 : vr(2);
        key = `sand${along}`; make = () => sandSprite(T, along);
        break;
      }
      case K.TABLE: { const v = vr(4); key = `table${v}`; make = () => tableSprite(T, v); break; }
      case K.COUNTER: {
        const ok = (u) => u === K.COUNTER;
        const mk = (nb(-1, 0, ok) ? 1 : 0) | (nb(1, 0, ok) ? 2 : 0) | (nb(0, -1, ok) ? 4 : 0) | (nb(0, 1, ok) ? 8 : 0), v = vr(4);
        key = `counter${mk}_${v}`; make = () => counterSprite(T, v, mk);
        break;
      }
      case K.FENCE: {
        const ok = (u) => u === K.FENCE || u === K.WALL || u === K.PILLAR;
        const mk = (nb(-1, 0, ok) ? 1 : 0) | (nb(1, 0, ok) ? 2 : 0) | (nb(0, -1, ok) ? 4 : 0) | (nb(0, 1, ok) ? 8 : 0);
        const fk = dn === 'ATTACHE' ? 'attache' : dn === 'ENCLOS' ? 'rail' : T.fence;
        key = `fence${fk}${mk}`; make = () => fenceSprite({ ...T, fence: fk }, 0, mk);
        break;
      }
      case K.PILLAR: {
        const byDeco = { CACTUS: 'saguaro', PALMIER: 'palm', POTEAU: this.theme === 'prairie' || this.theme === 'desert' ? 'pole' : 'post', REVERBERE: 'lamp', POELE: 'stove', EPOUVANTAIL: 'scarecrow',
          TRONC: 'trunk', SAPIN: 'pine', ARBRE_MORT: 'deadtree', ETAI: 'etai', COLONNE: 'column', STATUE: 'statue', STALAGMITE: 'stalagmite', BRASERO: 'brazier' };
        const kind = byDeco[dn] || T.pillar, v = vr(3);
        key = `pillar${kind}${v}`;
        make = () => kind === 'palm' ? palmSprite(v) : kind === 'stove' ? stoveSprite() : kind === 'scarecrow' ? scarecrowSprite(v) : kind === 'trunk' ? trunkSprite(v)
          : kind === 'deadtree' ? deadTreeSprite(v) : kind === 'statue' ? statueSprite(v) : kind === 'stalagmite' ? stalagmiteSprite(v) : kind === 'brazier' ? brazierSprite()
            : pillarSprite({ ...T, pillar: kind }, v);
        break;
      }
      case K.BUSH: {
        const kind = dn === 'ROSEAUX' ? 'reeds' : dn === 'BLE' ? 'wheat' : dn === 'FOUGERE' ? 'fern' : T.bush, v = vr(3), f = (beat + x + y) & 1;
        key = `bush${kind}${v}_${f}`;
        make = () => kind === 'reeds' ? reedsSprite(v, f) : kind === 'wheat' ? wheatSprite(v, f) : bushSprite({ ...T, bush: kind }, v, f);
        break;
      }
      case K.WATER: {
        const mt = this.mat[i];
        if (mt === MAT.WELL) return this._prop('well', wellSprite);
        if (mt === MAT.TROUGH) { const along = nb(-1, 0, (u) => u === K.WATER) || nb(1, 0, (u) => u === K.WATER) ? 1 : 0; return this._prop(`trough${along}`, () => troughSprite(T, along)); }
        return null;
      }
      default:
        if (this.mat[i] === MAT.FIRE) return this._prop('campfire', () => campfireSprite(1));
        return null;
    }
    const dm = this.m.dmg ? this.m.dmg[i] : 0;
    if (dm && t !== K.PILLAR) {
      const base = this._prop(key, make);
      return base ? this._prop(`${key}_d${dm}_${(x * 7 + y) % 3}`, () => damaged(base, dm, (x * 7 + y) % 3 + 1)) : null;
    }
    return this._prop(key, make);
  }
  // sprites des sources de lumière et du feu (en cache)
  _fx(key) {
    return this._prop(key, () => {
      if (key === 'lustre') return chandelierSprite();
      if (key === 'lanterne') return hangLanternSprite();
      if (key === 'lanternePied') return lanternSprite();
      if (key === 'lampe') return oilLampSprite();
      if (key === 'torche') return torchSprite();
      if (key === 'feu') return campfireSprite(1);
      if (key.startsWith('flame')) return flameSprite(+key[5], +key[7]);
      if (key.startsWith('smoke')) return smokeSprite(+key.slice(5));
      return null;
    });
  }
  // tous les volumes et les personnages, triés en profondeur ; actors : [{ x, y, z?, light?, draw(ctx, sx, sy) }] ;
  // seeThrough : cases ({x, y}) des personnages qu'on doit toujours voir (les volumes devant eux s'effacent),
  // hover : case survolée (même effet). Dessine aussi les lustres, lanternes, lampes, torches, feux de camp, les flammes
  // des cases en feu (m.fire) et leur fumée.
  drawScene(ctx, now = 0, actors = [], { seeThrough = [], hover = this.hover } = {}) {
    const cam = this._cr, items = this._items, pool = this._pool, w = this.w, m = this.m, c = m.cells, gh = this.gh;
    items.length = 0;
    let np = 0;
    const item = (k, img, x, y) => {
      const o = pool[np] || (pool[np] = {}); np++; items.push(o);
      o.k = k; o.img = img; o.actor = null; o.chain = 0; o.a = 1; o.x = x; o.y = y; o.ghost = true; o.flame = null;
      return o;
    };
    const beat = Math.floor(now / 650);
    const vis = (sx, sy, up = HMAX) => sx > -48 && sx < W + 48 && sy > this.top - 14 && sy - up - 14 < this.bottom;
    for (let y = 0; y < this.h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x, t = c[i];
      if (!VOLUME[t] && !(t === K.WATER && this.gt[i] === K.FLOOR) && this.mat[i] !== MAT.FIRE) continue;
      const sx = (x - y) * HW + this.OX - cam.x, sy = (x + y) * HH + this.OY - cam.y - gh[i];
      if (!vis(sx, sy, 44)) continue;
      const img = this._volume(x, y, i, t, beat);
      if (!img) continue;
      item(x + y + (t === K.BUSH ? 0.02 : 0), img, Math.round((sx - img.ox) * F) / F, Math.round((sy - img.oy) * F) / F);
      if (this.dn[i] === 'BRASERO' && !(m.lights || []).some((l) => l.x === x && l.y === y && l.off)) {
        const f = this._fx(`flame1_${(Math.floor(now / 95) + x * 3 + y) & 3}`);
        item(x + y + 0.001, f, Math.round((sx - f.ox) * F) / F, Math.round((sy - 10 - f.oy) * F) / F).ghost = false;
      }
    }
    // les sources de lumière : lustres suspendus (avec leur chaîne), lanternes, lampes sur les tables, torches, feux
    const fl = Math.floor(now / 95);
    (m.lights || []).forEach((l, n) => {
      const kind = l.kind || (this.theme === 'mine' || m.dark ? 'lanterne' : '');
      if (!kind || kind === 'fenetre' || kind === 'reverbere') return;
      const i = l.y * w + l.x, t = c[i];
      // les lumières accrochées (lanterne, torche) pendent sur le côté de leur support, vers la case qu'elles éclairent
      const hung = (l.dx || l.dy) && (kind === 'lanterne' || kind === 'torche'), hx = hung ? l.dx * 0.46 : 0, hy = hung ? l.dy * 0.46 : 0;
      const sx = (l.x + hx - l.y - hy) * HW + this.OX - cam.x, sy = (l.x + hx + l.y + hy) * HH + this.OY - cam.y - (gh[i] || 0);
      if (!vis(sx, sy, 40)) return;
      const k0 = l.x + l.y + (hung ? (l.dx + l.dy) * 0.5 : 0) + 0.016;
      if (hung) {
        const img = this._fx(kind === 'torche' ? 'torche' : 'lanterne'), h = l.h || (kind === 'torche' ? 15 : 14);
        if (kind === 'torche') {
          item(k0, img, Math.round((sx - img.ox) * F) / F, Math.round((sy - h + 15 - img.oy) * F) / F).ghost = false;
          if (!l.off) { const f = this._fx(`flame1_${(fl + n) & 3}`); item(k0 + 0.001, f, Math.round((sx - f.ox) * F) / F, Math.round((sy - h - 3 - f.oy) * F) / F).ghost = false; }
        } else {
          const o = item(k0, img, Math.round((sx - img.ox) * F) / F, Math.round((sy - h - img.oy) * F) / F);
          o.ghost = false;
          if (!l.off) o.flame = [sx, sy - h - 1.5];
        }
        return;
      }
      if (this.dn[i] === 'BRASERO') return; // ses flammes sont dessinées avec le brasero
      if (kind === 'lustre') {
        if (l.off) return;
        const img = this._fx('lustre'), h = l.h || 30;
        const o = item(k0, img, Math.round((sx - img.ox) * F) / F, Math.round((sy - h - img.oy) * F) / F);
        o.chain = sy - h - 3; o.ghost = false;
      } else if (kind === 'lanterne') {
        // accrochée à un étai ou à un poteau (sur le côté), sinon sur un piquet planté
        const onPost = t === K.PILLAR || t === K.WALL;
        const img = this._fx(onPost ? 'lanterne' : 'lanternePied'), h = onPost ? l.h || 15 : 0;
        const o = item(k0, img, Math.round((sx + (onPost ? 5 : 4) - img.ox) * F) / F, Math.round((sy - h + (onPost ? 0 : 3) - img.oy) * F) / F);
        o.ghost = false;
        if (!l.off) o.flame = onPost ? [sx + 5, sy - h - 1.5] : [sx + 2.5, sy - 18];
      } else if (kind === 'lampe') {
        const img = this._fx('lampe'), base = (l.h || (t === K.COUNTER ? 15 : 11)) - 4;
        const o = item(k0 + 0.01, img, Math.round((sx - 2 - img.ox) * F) / F, Math.round((sy - base - img.oy) * F) / F);
        o.ghost = false;
        if (!l.off) o.flame = [sx - 2, sy - base - 3.6];
      } else if (kind === 'torche') {
        const onPost = t === K.PILLAR || t === K.WALL;
        const img = this._fx('torche'), dx = onPost ? 6 : 0;
        item(k0, img, Math.round((sx + dx - img.ox) * F) / F, Math.round((sy - img.oy) * F) / F).ghost = false;
        if (!l.off) { const f = this._fx(`flame1_${(fl + n) & 3}`); item(k0 + 0.001, f, Math.round((sx + dx - f.ox) * F) / F, Math.round((sy - 18 - f.oy) * F) / F).ghost = false; }
      } else if (kind === 'feu') {
        if (this.mat[i] !== MAT.FIRE) { const img = this._fx('feu'); item(l.x + l.y, img, Math.round((sx - img.ox) * F) / F, Math.round((sy - img.oy) * F) / F); }
        if (!l.off) { const f = this._fx(`flame1_${(fl + n) & 3}`); item(k0 + 0.001, f, Math.round((sx - f.ox) * F) / F, Math.round((sy - 1 - f.oy) * F) / F).ghost = false; }
      }
    });
    // braseros (déco) : leurs flammes
    // cases en feu : grandes flammes animées
    if (m.fire) for (const [i] of m.fire) {
      const x = i % w, y = (i - x) / w, sx = (x - y) * HW + this.OX - cam.x, sy = (x + y) * HH + this.OY - cam.y - (gh[i] || 0);
      if (!vis(sx, sy, 30)) continue;
      const f = this._fx(`flame2_${(fl + x * 3 + y) & 3}`), f2 = this._fx(`flame1_${(fl + x + y * 5 + 2) & 3}`);
      item(x + y + 0.03, f, Math.round((sx - f.ox) * F) / F, Math.round((sy + 1 - f.oy) * F) / F).ghost = false;
      item(x + y + 0.031, f2, Math.round((sx + 7 - f2.ox) * F) / F, Math.round((sy + 3 - f2.oy) * F) / F).ghost = false;
    }
    // les personnages (et la lumière qu'ils portent)
    const al = (this._alights ||= []);
    al.length = 0;
    for (const a of actors) {
      const o = item(a.x + a.y + 0.01, null, (a.x - a.y) * HW + this.OX - cam.x, (a.x + a.y) * HH + this.OY - cam.y - (a.z || 0));
      o.actor = a;
      if (a.light) al.push({ x: a.x, y: a.y, r: a.light.r || 2.5, col: a.light.col || '#ffd8a0', kind: 'perso', h: 12 });
    }
    // ceux qu'il faut toujours voir : les volumes plus en avant qui leur passent devant s'effacent
    const prot = this._prot ||= [];
    prot.length = 0;
    for (const p of seeThrough) prot.push(p.x, p.y);
    // dans le noir (mine, nuit) : les personnages du joueur portent une petite lumière, comme avec drawDark
    if (m.dark || this.theme === 'mine' || this.sun.time === 'nuit') for (const p of seeThrough) if (!actors.some((a) => a.light && Math.round(a.x) === p.x && Math.round(a.y) === p.y)) al.push({ x: p.x, y: p.y, r: 2.2, col: '#b89060', kind: 'perso', h: 12 });
    if (hover) prot.push(hover.x, hover.y);
    if (prot.length) for (const o of items) {
      if (!o.img || !o.ghost) continue;
      const ow = o.img.width / F, oh = o.img.height / F;
      for (let k = 0; k < prot.length; k += 2) {
        const px = prot[k], py = prot[k + 1];
        if (o.k <= px + py + 0.012) continue;
        const sx = (px - py) * HW + this.OX - cam.x, sy = (px + py) * HH + this.OY - cam.y;
        if (o.x < sx + 7 && o.x + ow > sx - 7 && o.y < sy - 9 && o.y + oh > sy - 22) { o.a = 0.36; break; }
      }
    }
    items.sort((a, b) => a.k - b.k);
    for (const o of items) {
      if (o.actor) { o.actor.draw(ctx, o.x, o.y); continue; }
      if (o.a !== 1) ctx.globalAlpha = o.a;
      if (o.chain) { ctx.fillStyle = '#2a1e12'; ctx.fillRect(o.x + o.img.ox - 0.25, this.top - 2, 0.5, o.chain - this.top + 2); ctx.fillStyle = '#7a5a1c'; for (let yy = o.chain - 1; yy > this.top; yy -= 2) ctx.fillRect(o.x + o.img.ox - 0.25, yy, 0.5, 0.75); }
      ctx.drawImage(o.img, o.x, o.y, o.img.width / F, o.img.height / F);
      if (o.flame) {
        const fk = Math.sin(now / 61 + o.k * 7) + Math.sin(now / 23 + o.k);
        ctx.fillStyle = fk > 0.6 ? '#fffbe0' : '#ffd070';
        ctx.fillRect(o.flame[0] - 0.25, o.flame[1] - (fk > 0 ? 0.5 : 0.25), 0.5, fk > 0 ? 1 : 0.75);
      }
      if (o.a !== 1) ctx.globalAlpha = 1;
    }
    // la fumée des feux, au-dessus de tout
    if (m.fire && m.fire.size) for (const [i] of m.fire) {
      const x = i % w, y = (i - x) / w, sx = (x - y) * HW + this.OX - cam.x, sy = (x + y) * HH + this.OY - cam.y - (gh[i] || 0);
      if (!vis(sx, sy, 60)) continue;
      for (let k = 0; k < 3; k++) {
        const ph = fract(now / 1600 + k / 3 + hsh(x, y, 9)), r = 2 + Math.floor(ph * 3);
        const s2 = this._fx(`smoke${r}`);
        ctx.globalAlpha = (1 - ph) * 0.55;
        ctx.drawImage(s2, Math.round((sx + Math.sin(ph * 4 + k) * 3 + ph * 6 - s2.ox) * F) / F, Math.round((sy - 20 - ph * 34 - s2.oy) * F) / F, s2.width / F, s2.height / F);
      }
      ctx.globalAlpha = 1;
    }
  }

  // ---------------------------------------------------------- voiles
  _cells(cells) {
    if (cells instanceof Set) return cells;
    const out = new Set(), w = this.w;
    if (cells instanceof Map) { for (const [k, v] of cells) out.add(typeof k === 'number' ? k : v.y * w + v.x); return out; }
    for (const c of cells || []) out.add(typeof c === 'number' ? c : c.y * w + c.x);
    return out;
  }
  // losanges colorés (portée, danger, cible…) : cells = [{x, y}] ou Set d'index
  drawTiles(ctx, cells, col, alpha = 1) {
    tileMask ||= diamondMask(0.08, true);
    const st = tinted(tileMask, col, 'tile'), cam = this._cr, w = this.w;
    ctx.globalAlpha = alpha;
    const one = (x, y) => {
      const sx = (x - y) * HW + this.OX - cam.x, sy = (x + y) * HH + this.OY - cam.y;
      if (sx < -HW || sx > W + HW || sy < -HH || sy > H + HH) return;
      ctx.drawImage(st, sx - HW, sy - HH, TW, TH);
    };
    if (cells instanceof Set) for (const k of cells) one(k % w, Math.floor(k / w));
    else if (cells instanceof Map) for (const v of cells.values()) one(v.x, v.y);
    else for (const c of cells) typeof c === 'number' ? one(c % w, Math.floor(c / w)) : one(c.x, c.y);
    ctx.globalAlpha = 1;
  }
  // contour extérieur d'un ensemble de cases, net, d'un demi-pixel du jeu
  drawOutline(ctx, cellsSet, col) {
    edgeMasks ||= [edgeMask(true), edgeMask(false)];
    const set = this._cells(cellsSet), dn = tinted(edgeMasks[0], col, 'edn'), upm = tinted(edgeMasks[1], col, 'eup');
    const cam = this._cr, w = this.w, h = this.h, ew = dn.width / F, eh = dn.height / F;
    const has = (x, y) => x >= 0 && y >= 0 && x < w && y < h && set.has(y * w + x);
    for (const k of set) {
      const x = k % w, y = Math.floor(k / w);
      const sx = (x - y) * HW + this.OX - cam.x, sy = (x + y) * HH + this.OY - cam.y;
      if (sx < -HW || sx > W + HW || sy < -HH || sy > H + HH) continue;
      if (!has(x - 1, y)) ctx.drawImage(upm, sx - HW, sy - HH, ew, eh);
      if (!has(x, y - 1)) ctx.drawImage(dn, sx, sy - HH, ew, eh);
      if (!has(x + 1, y)) ctx.drawImage(upm, sx, sy - 0.25, ew, eh);
      if (!has(x, y + 1)) ctx.drawImage(dn, sx - HW, sy - 0.25, ew, eh);
    }
  }
  // pochoir de brouillard (pixels du jeu × 2), opaque : le facteur de luminosité à appliquer (blanc : rien) ; losange
  // balayé de zlo à zhi (les volumes, le bord de la maquette), bord adouci par tramage vers le blanc
  _fogStamp(lvl, hc, edge) {
    const key = `fog${lvl}${hc}${edge}`;
    let st = this.stamps.get(key);
    if (st) return st;
    const zhi = [0, 11, this.hTop + 2][hc], zlo = edge ? -DEPTH : 0, m = 6;
    const w = (TW + 2 * m) * 2, hgt = Math.ceil((TH + 2 * m + zhi - zlo) * 2 / 4) * 4 + 4;
    const ox = w / 2, oy = Math.ceil((HH + m + zhi) * 2 / 4) * 4;
    st = S.makeCanvas(w, hgt);
    const g = st.getContext('2d'), img = g.createImageData(w, hgt), d = new Uint32Array(img.data.buffer);
    const col = lvl === 2 ? pack(40, 44, 62) : pack(128, 132, 146), wh = pack(255, 255, 255);
    for (let y = 0; y < hgt; y++) for (let x = 0; x < w; x++) {
      const px = (x + 0.5 - ox) / 2, py = (y + 0.5 - oy) / 2;
      const dz = py < -zhi ? -zhi - py : py > -zlo ? py + zlo : 0;
      const dd = Math.abs(px) / HW + dz / HH;
      const k = dd <= 1 ? 1 : 1 - (dd - 1) / (m / HW);
      d[y * w + x] = k >= 1 ? col : k > 0 ? (k > bay(x - ox, y - oy) ? col : blend(wh, col, k * 0.5)) : wh;
    }
    g.putImageData(img, 0, 0);
    st.ox = ox / 2; st.oy = oy / 2;
    this.stamps.set(key, st);
    return st;
  }
  // brouillard de guerre : non vu = nuit opaque (85 %), déjà vu = voile (50 %), visible = clair ; bords tramés.
  // Les pochoirs sont réunis (le plus sombre l'emporte) dans un calque, puis le calque assombrit l'image (multiply).
  drawFog(ctx, visible, explored) {
    const cam = this._cr, w = this.w, h = this.h, c = this.m.cells;
    const L = this._fogC ||= S.makeCanvas(W * 2, H * 2), g = L.getContext('2d');
    g.globalCompositeOperation = 'source-over';
    g.fillStyle = '#fff';
    g.fillRect(0, 0, L.width, L.height);
    g.globalCompositeOperation = 'darken';
    let any = false;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (c[i] === K.VOID || (visible && visible.has(i))) continue;
      const lvl = explored && explored.has(i) ? 1 : 2;
      const sx = (x - y) * HW + this.OX - cam.x, sy = (x + y) * HH + this.OY - cam.y;
      if (sx < -30 || sx > W + 30 || sy < this.top - 30 || sy - HMAX - 10 > this.bottom + 20) continue;
      const vh = this.vh[i], hc = vh >= 14 ? 2 : vh >= 6 ? 1 : 0;
      const edge = x === w - 1 || y === h - 1 || c[i + 1] === K.VOID || c[i + w] === K.VOID ? 1 : 0;
      const st = this._fogStamp(lvl, hc, edge);
      g.drawImage(st, Math.round((sx - st.ox) * 2), Math.round((sy - st.oy) * 2));
      any = true;
    }
    g.globalCompositeOperation = 'source-over';
    if (!any) return;
    ctx.globalCompositeOperation = 'multiply';
    ctx.drawImage(L, 0, 0, W, H);
    ctx.globalCompositeOperation = 'source-over';
  }
  // tache de lumière (pixels du jeu × 2) : couleur col, paliers tramés (noir dehors : rien en mode « lighter ») ;
  // squash : aplatissement (0,5 : au sol en isométrique ; plus haut pour éclairer aussi murs et personnages)
  _lightStamp(r, col = '#ffc070', squash = 0.62) {
    const key = `L${r}|${col}|${squash}`;
    let st = this.stamps.get(key);
    if (st) return st;
    const rx = r * 22.6 * 2, ry = rx * squash, w = Math.ceil(rx * 2 / 4) * 4 + 4, hgt = Math.ceil(ry * 2 / 4) * 4 + 4;
    const n = parseInt(col.slice(1), 16), cr = n >> 16, cg = (n >> 8) & 255, cb = n & 255;
    st = S.makeCanvas(w, hgt);
    const g = st.getContext('2d'), img = g.createImageData(w, hgt), d = new Uint32Array(img.data.buffer);
    for (let y = 0; y < hgt; y++) for (let x = 0; x < w; x++) {
      const dd = Math.hypot((x + 0.5 - w / 2) / rx, (y + 0.5 - hgt / 2) / ry);
      if (dd >= 1) continue;
      const lv = clamp(Math.floor(Math.pow(1 - dd, 1.2) * 4.6 + bay(x, y) - 0.5), 0, 4) / 4;
      if (lv) d[y * w + x] = pack(cr * lv, cg * lv, cb * lv, 255);
    }
    g.putImageData(img, 0, 0);
    this.stamps.set(key, st);
    return st;
  }
  // rayon de soleil par une fenêtre (pixels du jeu × 2) : la tache claire sur le plancher, devant le mur ; f : la face
  _shaftStamp(f, col) {
    const key = `shaft${f}|${col}`;
    let st = this.stamps.get(key);
    if (st) return st;
    const w = 160, hgt = 96, ox = w / 2, oy = 24;
    const n = parseInt(col.slice(1), 16), cr = n >> 16, cg = (n >> 8) & 255, cb = n & 255;
    st = S.makeCanvas(w, hgt);
    const g = st.getContext('2d'), img = g.createImageData(w, hgt), d = new Uint32Array(img.data.buffer);
    for (let y = 0; y < hgt; y++) for (let x = 0; x < w; x++) {
      const dx = (x + 0.5 - ox) / 2, dy = (y + 0.5 - oy) / 2;
      const U = (dy / HH + dx / HW) / 2, V = (dy / HH - dx / HW) / 2;
      // le long de la normale du mur (t) et en travers (u), le soleil arrive un peu de biais
      const t = (f ? U : V) - 0.5, u = (f ? V : U) - t * 0.35;
      if (t < 0 || t > 1.7 || Math.abs(u) > 0.24 + t * 0.05) continue;
      const k = (1 - t / 1.7) * (Math.abs(u) > 0.2 + t * 0.05 ? 0.6 : 1);
      const lv = clamp(Math.floor(k * 3.6 + bay(x, y) - 0.5), 0, 3) / 3;
      if (lv) d[y * w + x] = pack(cr * lv, cg * lv, cb * lv, 255);
    }
    g.putImageData(img, 0, 0);
    st.ox = ox; st.oy = oy;
    this.stamps.set(key, st);
    return st;
  }
  // le masque des intérieurs (dans le monde, un pixel par pixel du jeu), fait une fois par carte : blanc dehors, la
  // pénombre des pièces dedans ; on le pose d'un seul coup sur la carte de lumière
  _inside(ic) {
    if (this._inMask) return this._inMask;
    fullMask ||= diamondMask(0, false);
    const c = (this._inMask = S.makeCanvas(Math.ceil(this.WW), Math.ceil(this.WH))), g = c.getContext('2d'), w = this.w;
    g.fillStyle = '#fff';
    g.fillRect(0, 0, c.width, c.height);
    const st = tinted(fullMask, `rgb(${ic[0]},${ic[1]},${ic[2]})`, 'full');
    for (const i of this.interiors) {
      const x = i % w, y = (i - x) / w;
      g.drawImage(st, (x - y) * HW + this.OX - HW - 0.5, (x + y) * HH + this.OY - HH - this.gh[i] - 0.5, TW + 1, TH + 1);
    }
    return c;
  }
  // éclair bref (tir, explosion, chute de lustre) : une lumière qui s'éteint en ms millisecondes
  flash(x, y, { r = 2.5, col = '#ffd890', ms = 140, z = 10 } = {}) {
    (this._flashes ||= []).push({ x, y, r, col, ms, z, t0: performance.now() });
  }
  // l'éclairage de la scène, après drawScene et avant drawFog : étalonnage selon le moment (m.time) et le ciel (m.sky),
  // intérieurs plus sombres, taches de lumière de toutes les sources allumées (m.lights, feux, éclairs, personnages qui
  // portent une lanterne), rayons de soleil par les fenêtres, halos chauds qui vacillent, voile de brume ou de poussière.
  // Une carte de lumière (pixels du jeu × 2) multiplie l'image ; les halos s'ajoutent. opt : { lights, units, dark }
  drawLight(ctx, now = performance.now(), { lights = this.m.lights || [], units = null, dark = false } = {}) {
    const m = this.m, cam = this._cr, w = this.w, pnow = performance.now();
    const tm = this.sun.time, sky = m.sky, mine = dark || this.theme === 'mine' || sky === 'mine';
    const mood = mine ? MOODS.mine : MOODS[tm] || MOODS.midi, sk = SKIES[sky];
    const amb = mood.amb.map((v, k) => (sk ? (v * sk.mul[k]) / 255 : v) | 0);
    const fls = (this._flashes || []).filter((f) => pnow - f.t0 < f.ms);
    this._flashes = fls;
    const ext = units ? units.map((u) => ({ x: u.x, y: u.y, r: u.r || 2.2, col: '#ffd8a0', kind: 'perso', h: 12 })) : this._alights || [];
    const lit = (l) => !l.off && (l.kind || mine);
    const nLit = lights.reduce((a, l) => a + (lit(l) ? 1 : 0), 0) + (m.fire ? m.fire.size : 0) + fls.length + ext.length;
    const dayOut = amb[0] > 240 && amb[1] > 236 && !this.interiors && !nLit;
    const L = this._dark ||= S.makeCanvas(W * 2, H * 2), g = L.getContext('2d');
    const at = (x, y, z = 0) => [(x - y) * HW + this.OX - cam.x, (x + y) * HH + this.OY - cam.y - z];
    const flick = (l, n) => {
      const k = l.kind;
      if (k === 'feu' || k === 'torche' || k === 'fire') return 0.78 + 0.12 * Math.sin(now / 53 + n * 1.7) + 0.1 * Math.sin(now / 21 + n * 3.1);
      if (k === 'lanterne' || k === 'lampe' || k === 'perso') return 0.93 + 0.05 * Math.sin(now / 97 + n * 2.1) + 0.02 * Math.sin(now / 37 + n);
      return 1;
    };
    if (!dayOut) {
      g.globalCompositeOperation = 'source-over';
      g.globalAlpha = 1;
      g.fillStyle = `rgb(${amb[0]},${amb[1]},${amb[2]})`;
      g.fillRect(0, 0, L.width, L.height);
      // sous les toits : moins de jour (rien la nuit dans la mine, déjà noire)
      if (this.interiors && !mine) {
        g.globalCompositeOperation = 'multiply';
        g.imageSmoothingEnabled = false;
        g.drawImage(this._inside(mood.inside), Math.round(cam.x), Math.round(cam.y), W, H, 0, 0, W * 2, H * 2);
      }
      g.globalCompositeOperation = 'lighter';
      const put = (x, y, r, col, a, lift = 6, z = 0) => {
        const st = this._lightStamp(Math.max(1, Math.round(r * 2) / 2), col), [sx, sy] = at(x, y, z);
        if (sx < -r * 50 || sx > W + r * 50 || sy < -r * 30 || sy > H + r * 30) return;
        g.globalAlpha = Math.min(1, a);
        g.drawImage(st, Math.round(sx * 2 - st.width / 2), Math.round((sy - lift) * 2 - st.height / 2));
      };
      lights.forEach((l, n) => {
        if (!lit(l)) return;
        const D2 = LIGHTS[l.kind] || LIGHTS.lanterne, ox = (l.dx || 0) * 0.7, oy = (l.dy || 0) * 0.7;
        put(l.x + ox, l.y + oy, l.r || D2.r, l.col || D2.col, flick(l, n), Math.min(l.h ?? D2.h, 16) * 0.45, this.gh[l.y * w + l.x] || 0);
      });
      if (m.fire) for (const [i] of m.fire) { const x = i % w, y = (i - x) / w; put(x, y, 3.2, '#ff9038', flick({ kind: 'fire' }, i), 6); }
      for (const i of this.braziers) { const x = i % w, y = (i - x) / w; if (!lights.some((l) => l.x === x && l.y === y)) put(x, y, 3.6, '#ff9038', flick({ kind: 'fire' }, i), 8); }
      ext.forEach((u, n) => put(u.x, u.y, u.r, u.col, flick(u, n + 40), 6));
      // soleil par les fenêtres des pièces
      if (mood.shaft && this.windows.length) {
        for (const wd of this.windows) {
          const st = this._shaftStamp(wd.f, mood.shaft), [sx, sy] = at(wd.x, wd.y, this.gh[wd.y * w + wd.x]);
          if (sx < -60 || sx > W + 60 || sy < -40 || sy > H + 60) continue;
          g.globalAlpha = 0.7;
          g.drawImage(st, Math.round(sx * 2 - st.ox), Math.round(sy * 2 - st.oy));
        }
      }
      for (const f of fls) { const k = 1 - (pnow - f.t0) / f.ms; put(f.x, f.y, f.r * (0.7 + 0.3 * k), f.col, k * 1.2, f.z * 0.4); }
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';
      ctx.globalCompositeOperation = 'multiply';
      ctx.drawImage(L, 0, 0, W, H);
    }
    // halos chauds autour des flammes, lueur des fenêtres la nuit, rayons visibles, éclairs
    ctx.globalCompositeOperation = 'lighter';
    const halo = (x, y, z, r, col, a) => {
      const st = this._lightStamp(r, col, 1), [sx, sy] = at(x, y, z);
      if (sx < -40 || sx > W + 40 || sy < -40 || sy > H + 40) return;
      ctx.globalAlpha = Math.min(1, a);
      ctx.drawImage(st, sx - st.width / 4, sy - st.height / 4, st.width / 2, st.height / 2);
    };
    const hk = mood.halo;
    lights.forEach((l, n) => {
      if (!lit(l)) return;
      const D2 = LIGHTS[l.kind] || LIGHTS.lanterne, h = (l.h ?? D2.h) + (this.gh[l.y * w + l.x] || 0);
      const hx = l.dx || l.dy ? (l.dx || 0) * 0.46 : l.kind === 'fenetre' ? 0.3 : 0, hy = l.dx || l.dy ? (l.dy || 0) * 0.46 : l.kind === 'fenetre' ? 0.3 : 0;
      if (l.kind === 'fenetre') { halo(l.x + hx, l.y + hy, h, 0.9, l.col || D2.col, 0.5 * hk); return; }
      halo(l.x + hx, l.y + hy, h, l.kind === 'lustre' ? 1.3 : l.kind === 'feu' ? 1.2 : 0.7, l.col || D2.col, 0.5 * flick(l, n) * hk);
    });
    if (m.fire) for (const [i] of m.fire) { const x = i % w, y = (i - x) / w; halo(x, y, 8, 1.3, '#ff8030', 0.45 * flick({ kind: 'fire' }, i) * Math.max(0.5, hk)); }
    for (const i of this.braziers) { const x = i % w, y = (i - x) / w; if (!lights.some((l) => l.x === x && l.y === y)) halo(x, y, 13, 0.9, '#ff9038', 0.5 * flick({ kind: 'fire' }, i) * Math.max(0.4, hk)); }
    if (mood.shaft && this.windows.length && !mine) {
      ctx.globalAlpha = 0.18;
      for (const wd of this.windows) {
        const st = this._shaftStamp(wd.f, mood.shaft), [sx, sy] = at(wd.x, wd.y, this.gh[wd.y * w + wd.x]);
        if (sx < -60 || sx > W + 60 || sy < -40 || sy > H + 60) continue;
        ctx.drawImage(st, sx - st.ox / 2, sy - st.oy / 2, st.width / 2, st.height / 2);
        // poussière qui danse dans le rayon
        for (let k = 0; k < 4; k++) {
          const ph = fract(now / 5200 + k * 0.27 + wd.x * 0.13), t = 0.15 + ph * 1.2, u = Math.sin(now / 900 + k * 2) * 0.12;
          const U = wd.f ? 0.5 + t : u + t * 0.35, V = wd.f ? u + t * 0.35 : 0.5 + t;
          ctx.fillStyle = '#fff4d0';
          ctx.fillRect(sx + (U - V) * HW, sy + (U + V) * HH - 6 - ph * 4, 0.5, 0.5);
        }
      }
    }
    for (const f of fls) { const k = 1 - (pnow - f.t0) / f.ms; halo(f.x, f.y, f.z, f.r * 0.5, f.col, k); }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    // voile du ciel : poussière de la tempête, brume, blizzard ; l'étalonnage léger du jour
    const hz = sk?.haze || mood.haze;
    if (hz) { ctx.fillStyle = `rgba(${hz[0]},${hz[1]})`; ctx.fillRect(0, 0, W, H); }
    if (dayOut && mood.grade) { ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = mood.grade; ctx.fillRect(0, 0, W, H); ctx.globalCompositeOperation = 'source-over'; }
  }
  // le noir de la mine (compatibilité) : un cas de drawLight, avec des lumières et des personnages éclairés donnés
  drawDark(ctx, lights = this.m.lights || [], units = []) {
    this.drawLight(ctx, performance.now(), { lights, units, dark: true });
  }

  // ---------------------------------------------------------- explosions, mémoire
  // après une explosion (caisses détruites, mur abattu) : met à jour les masques et les caches touchés
  changed(cells) {
    if (this._quick(this._cells(cells))) return;
    this.analyse();
    S.freeCanvas(this._inMask);
    this._inMask = null;
    const w = this.w, h = this.h;
    for (const k of this._cells(cells)) {
      const x = k % w, y = Math.floor(k / w);
      // les murs voisins (raccords, ombres) et ceux qu'il masquait
      for (let dy = -4; dy <= 2; dy++) for (let dx = -4; dx <= 2; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
        const key = -(yy * w + xx + 1), e = this.lru.get(key);
        if (e) { S.freeCanvas(e.c); this.bytes -= e.b; this.lru.delete(key); }
      }
      // les morceaux de sol sous la case et autour (ombres portées)
      const sx = (x - y) * HW + this.OX, sy = (x + y) * HH + this.OY;
      for (let cj = Math.floor((sy - 40) / CHUNK); cj <= Math.floor((sy + 40) / CHUNK); cj++) for (let ci = Math.floor((sx - 56) / CHUNK); ci <= Math.floor((sx + 56) / CHUNK); ci++) {
        const key = cj * 1024 + ci, e = this.lru.get(key);
        this.empty.delete(key);
        if (e) { S.freeCanvas(e.c); this.bytes -= e.b; this.lru.delete(key); }
      }
    }
  }
  // mise à jour légère quand rien ne change au sol ni aux murs : un wagonnet qui avance d'une case sur ses rails (il
  // ne porte pas d'ombre cuite) ; renvoie faux s'il faut tout refaire
  _quick(set) {
    const c = this.m.cells, dk = this.m.deco, rl = this.m.rail, sc = this._snapC, sd = this._snapD;
    if (!sc || !set.size) return false;
    const name = (d) => { const s = DN[d] || ''; return s === 'AUCUN' ? '' : s; };
    const mobile = (t, nm, i) => (t === K.CRATE && nm === 'WAGONNET') || ((t === K.RAIL || ((t === K.FLOOR || t === K.PATH) && rl && rl[i])) && !nm);
    for (const i of set) {
      const on = sd ? name(sd[i]) : '', nn = dk ? name(dk[i]) : '';
      if (!mobile(sc[i], on, i) || !mobile(c[i], nn, i)) return false;
      const ng = c[i] === K.RAIL || (rl && rl[i]) ? K.RAIL : c[i] === K.PATH ? K.PATH : K.FLOOR;
      if (ng !== this.gt[i]) return false;
    }
    for (const i of set) {
      this.dn[i] = dk ? name(dk[i]) : '';
      this.vh[i] = 0; this.vfp[i] = 0;
      sc[i] = c[i];
      if (sd) sd[i] = dk[i];
    }
    return true;
  }
  // mémoire des canevas en cache (octets) et quelques compteurs
  stats() {
    let props = 0, stamps = 0, chunks = 0, walls = 0;
    for (const c of this.props.values()) if (c) props += c.width * c.height * 4;
    for (const c of this.stamps.values()) stamps += c.width * c.height * 4;
    for (const k of this.lru.keys()) k >= 0 ? chunks++ : walls++;
    const dark = (this._dark ? this._dark.width * this._dark.height * 4 : 0) + (this._fogC ? this._fogC.width * this._fogC.height * 4 : 0) + (this._inMask ? this._inMask.width * this._inMask.height * 4 : 0);
    return { bytes: this.bytes + props + stamps + dark, cache: this.bytes, props, stamps, dark, chunks, walls, sprites: this.props.size };
  }
  free() {
    for (const e of this.lru.values()) S.freeCanvas(e.c);
    for (const c of this.props.values()) S.freeCanvas(c);
    for (const c of this.stamps.values()) S.freeCanvas(c);
    S.freeCanvas(this._dark);
    S.freeCanvas(this._fogC);
    S.freeCanvas(this._inMask);
    this._inMask = null;
    S.freeCanvas(this._lantern);
    this.lru.clear(); this.props.clear(); this.stamps.clear(); this.empty.clear();
    this.bytes = 0;
    this._dark = this._fogC = this._lantern = this._img = this._d = null;
  }
}
