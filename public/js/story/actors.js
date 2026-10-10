// Acteurs en pied des cinématiques du mode histoire (joués par stage.js) : le buste de l'éditeur
// (S.characterSprite, 48 × 56) prolongé d'un bas de veste, d'une ceinture, de jambes et de bottes dessinés ici.
// Deux images de marche, retournement selon la direction, quelques poses (revolver, bras levés, blessé, à terre,
// lancer d'une bouteille enflammée, cheval cabré…),
// monture facultative (un cheval à l'échelle du buste). Tout est mis en cache : une image = un drawImage.
// Repère : (x, y) = les pieds de l'acteur, au sol.
// La vie, toujours fonction du temps t (vignettes recalculables) : clignements irréguliers, respiration d'un pixel
// à l'arrêt, balancement de celui qui parle (st.talk), poussière aux pieds de qui court ou galope, cheval qui
// s'ébroue à l'arrêt, acteur assombri quand un autre est mis en avant (st.dim). Les variantes (respiration, buste
// penché, assombri, retourné) sont dérivées une fois du sprite de base et rangées sur lui.
import * as S from '../sprites.js';
import { SKIN, CLOTH_COLORS } from '../data.js';

const OUT = S.OUT;
const BW = 64, BH = 80; // canvas d'un acteur en pied : buste en (8, 0), pieds en (OX, OY)
export const OX = 32, OY = 77;
export const HEAD_TOP = 74; // hauteur d'un acteur debout (pour placer bulles et ombres)
const MW = 132, MH = 116; // canvas d'un cavalier
const MOX = 62, MOY = 112;
export const MOUNT_TOP = 100;
const SEAT = 50; // hauteur de la selle au-dessus du sol

// Bas du corps propre à quelques personnages du casting (les autres portent un pantalon)
const LOWER = { rosa: 'skirt', ines: 'robe' };

const hash = (n) => {
  let t = (n * 0x6d2b79f5) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

// Clignement des yeux : un par tranche de 2,7 s, à un instant tiré au hasard ; parfois un double clignement
export function blinking(t, seed = 0) {
  const u = t + seed * 911, P = 2700, k = Math.floor(u / P), e = u - k * P;
  const o = 250 + hash(k * 13 + seed * 7) * 2100;
  if (e >= o && e < o + 110) return true;
  return hash(k * 7 + seed + 3) < 0.22 && e >= o + 230 && e < o + 330;
}

function painter(g) {
  const R = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
  // rectangles cernés : d'abord tous les contours, puis tous les remplissages
  const O = (rects) => {
    for (const [x, y, w, h] of rects) R(x - 1, y - 1, w + 2, h + 2, OUT);
    for (const [x, y, w, h, col] of rects) R(x, y, w, h, col);
  };
  return { R, O };
}

// Couleurs du pantalon et des bottes selon la tenue
function lowerColors(look) {
  const cloth = CLOTH_COLORS[look.outfitColor] ?? CLOTH_COLORS[2];
  const pants = look.outfit === 'overalls' ? cloth
    : look.outfit === 'sheriff' || look.outfit === 'suit' ? S.shade(cloth, -0.25)
      : ['#3e3a4a', '#4a3a2c', '#34404e', '#5a4632'][Math.floor(hash(lookHash(look)) * 4)];
  return { pants, pantsD: S.shade(pants, -0.3), pantsL: S.shade(pants, 0.15), boot: '#3a2414', bootL: '#5e3c22', cloth };
}
const lookHash = (look) => {
  let h = 7;
  for (const ch of S.lookKey(look)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
};

// ---------------------------------------------------------------- corps en pied
// frame : 0 au repos, 1 et 2 : les deux temps de la marche. pose : voir drawPose.
// libère un sprite et toutes ses variantes dérivées (retourné, respiration, penché, assombri)
const freeDeep = (c) => { if (!c) return; for (const k of ['flip', 'breath', 'lean', 'dim']) freeDeep(c[k]); S.freeCanvas(c); };
const bodies = S.lru(200, freeDeep);
export function bodySprite(look, { frame = 0, pose = 'stand', blink = false, t = 0, kind = 'pants' } = {}) {
  const hurt = pose === 'ko' || pose === 'down';
  const cig = look.mouth === 'cigar' || look.mouth === 'pipe' ? Math.floor(t / 300) % 4 : 0;
  const key = `${S.lookKey(look)}|${frame}|${pose}|${blink ? 1 : 0}|${cig}|${kind}`;
  let c = bodies.get(key);
  if (c) return c;
  c = S.makeCanvas(BW, BH, true);
  const g = c.getContext('2d', { willReadFrequently: true });
  const bust = S.characterSprite(look, { blink, hurt, t });
  g.drawImage(bust, 8, 0);
  const row = g.getImageData(8, 54, 48, 1).data; // dernière ligne des vêtements du buste
  const px = (x) => { const i = x * 4; return row[i + 3] ? `rgb(${row[i]},${row[i + 1]},${row[i + 2]})` : null; };
  const { R, O } = painter(g);
  const col = lowerColors(look);
  const skin = SKIN[look.skin] || SKIN[1];
  const sleeve = px(6) || col.cloth;
  const poncho = look.outfit === 'poncho';
  const duster = look.outfit === 'duster';
  const lift = (side) => (frame === 1 && side === 0) || (frame === 2 && side === 1) ? 2 : 0;

  // jambes et bottes d'abord (le bas de la veste passe par-dessus)
  if (kind === 'pants') {
    for (const side of [0, 1]) {
      const lx = side ? 34 : 22, l = lift(side), fx = l ? 1 : 0;
      O([[lx + fx, 63, 9, 8 - l, col.pants]]);
      R(lx + fx, 63, 1, 8 - l, col.pantsL);
      R(lx + fx + 8, 63, 1, 8 - l, col.pantsD);
      O([[lx - 1 + fx, 70 - l, 11, 6, col.boot], [lx + 7 + fx, 73 - l, 3, 3, col.boot]]);
      R(lx + fx, 70 - l, 9, 1, col.bootL);
      R(lx - 1 + fx, 75 - l, 11, 1, '#24140a');
      R(lx - 2 + fx, 73 - l, 1, 1, '#c8c8d0'); // éperon
    }
  } else if (kind === 'skirt') {
    for (const side of [0, 1]) { const l = lift(side); O([[side ? 34 : 23, 72 - l, 8, 4, col.boot]]); }
    const sk = S.shade(col.cloth, -0.35), sw = frame === 1 ? -1 : frame === 2 ? 1 : 0;
    for (let y = 62; y < 74; y++) {
      const half = 15 + Math.floor((y - 62) / 2);
      R(32 - half - 1 + (y > 68 ? sw : 0), y, half * 2 + 2, 1, OUT);
    }
    for (let y = 62; y < 73; y++) {
      const half = 15 + Math.floor((y - 62) / 2) - 1;
      R(32 - half + (y > 68 ? sw : 0), y, half * 2, 1, y === 72 ? S.shade(sk, -0.3) : (y + 1) % 4 ? sk : S.shade(sk, 0.15));
    }
    R(32 - 20 + sw, 73, 40, 1, OUT);
  } else if (kind === 'robe') {
    for (const side of [0, 1]) { const l = lift(side); O([[side ? 33 : 24, 73 - l, 7, 3, '#2a2226']]); }
    O([[17, 60, 30, 14, col.cloth]]);
    R(18, 60, 1, 14, S.shade(col.cloth, 0.2));
    for (const x of [24, 32, 40]) R(x, 62, 1, 12, S.shade(col.cloth, -0.35));
  }

  // bas de la veste : on prolonge la dernière ligne du buste, un peu moins large que les épaules
  const x0 = poncho ? 11 : 17, x1 = poncho ? 53 : 47, y1 = poncho ? 66 : 62;
  for (let y = 55; y < y1; y++) for (let x = x0; x < x1; x++) {
    const sx = Math.max(0, Math.min(47, x - 8 + (poncho ? 0 : 0)));
    const cc = px(sx) || col.cloth;
    R(x, y, 1, 1, cc);
  }
  R(x0 - 1, 55, 1, y1 - 55, OUT); R(x1, 55, 1, y1 - 55, OUT);
  if (poncho) {
    // frange du poncho, motif en zigzag
    for (let x = x0; x < x1; x++) {
      R(x, y1, 1, 1, OUT);
      if (x % 3 === 0) R(x, y1 + 1, 1, 1, OUT);
      R(x, 61 + (x % 4 < 2 ? 0 : 1), 1, 1, '#e0b040');
    }
  } else {
    if (duster) { // les pans du cache-poussière tombent le long des jambes
      O([[17, 62, 5, 10, sleeve], [42, 62, 5, 10, sleeve]]);
      R(17, 62, 1, 10, S.shade(sleeve, 0.15));
    }
    O([[17, 61, 30, 2, '#2a1a10']]); // ceinture
    R(30, 61, 4, 2, '#e0b040');
    if (kind === 'pants') R(19, 63, 3, 4, '#5a5a62'); // l'étui du revolver
    if (kind === 'pants') R(19, 63, 3, 1, '#7a5a3a');
    // les bras le long du corps
    if (!['up', 'tied', 'sack', 'gun', 'point', 'rifle', 'salute', 'wave', 'torch', 'throw', 'lob'].includes(pose)) {
      O([[12, 54, 4, 8, sleeve], [48, 54, 4, 8, sleeve]]);
      O([[12, 62, 4, 3, skin], [48, 62, 4, 3, skin]]);
    }
  }
  drawPose(g, R, O, pose, { sleeve, skin, look });
  c.ox = OX; c.oy = OY;
  bodies.set(key, c);
  return c;
}

// Poses dessinées par-dessus le corps (personnage tourné vers la droite ; le retournement vient après)
//   gun : revolver tendu   point : bras tendu, doigt pointé   up : bras levés   rifle : fusil en travers
//   salute : salut militaire   wave : salue de la main   tied : mains liées   sack : sac sur la tête et mains liées
//   hurt : la main sur le flanc ensanglanté   ko / down : sonné (down : couché, voir drawActor)
//   torch : une torche brandie (la flamme, animée, est dessinée par drawActor)
//   throw : l'élan du lancer, le bras arrière levé (la bouteille et son chiffon en feu : drawActor), l'autre bras
//   tendu vers la cible   lob : le geste fini, le bras lanceur parti vers l'avant et le haut, main vide
function drawPose(g, R, O, pose, { sleeve, skin }) {
  if (pose === 'throw') {
    O([[11, 24, 4, 22, sleeve], [11, 19, 4, 5, skin]]);
    O([[48, 45, 9, 4, sleeve], [57, 45, 3, 4, skin]]);
  } else if (pose === 'lob') {
    O([[12, 54, 4, 8, sleeve]]); O([[12, 62, 4, 3, skin]]);
    O([[47, 40, 5, 7, sleeve], [50, 35, 5, 6, sleeve], [53, 30, 5, 6, sleeve], [57, 26, 4, 4, skin]]);
  } else if (pose === 'gun' || pose === 'point') {
    O([[12, 54, 4, 8, sleeve]]); O([[12, 62, 4, 3, skin]]);
    O([[48, 45, 9, 4, sleeve], [57, 45, 3, 4, skin]]);
    if (pose === 'gun') {
      O([[58, 42, 5, 3, '#6a6e78'], [56, 45, 3, 4, '#5a3a22']]);
      R(58, 42, 5, 1, '#b8bec6');
    } else R(60, 46, 3, 1, skin);
  } else if (pose === 'torch') {
    O([[12, 54, 4, 8, sleeve]]); O([[12, 62, 4, 3, skin]]);
    O([[49, 24, 4, 22, sleeve], [49, 19, 4, 5, skin]]);
    O([[50, 6, 2, 16, '#6a4424']]); // le manche
    R(49, 6, 4, 2, '#3a2214'); // la poix
  } else if (pose === 'up' || pose === 'wave') {
    const both = pose === 'up';
    if (both) O([[11, 24, 4, 22, sleeve], [11, 19, 4, 5, skin]]);
    else { O([[12, 54, 4, 8, sleeve]]); O([[12, 62, 4, 3, skin]]); }
    O([[49, 24, 4, 22, sleeve], [49, 19, 4, 5, skin]]);
  } else if (pose === 'salute') {
    O([[12, 54, 4, 8, sleeve]]); O([[12, 62, 4, 3, skin]]);
    O([[46, 30, 4, 18, sleeve], [42, 24, 7, 4, skin]]);
  } else if (pose === 'rifle') {
    for (let k = 0; k < 34; k++) {
      const x = 14 + k, y = 64 - Math.round(k * 0.75);
      R(x - 1, y - 1, 3, 4, OUT);
    }
    for (let k = 0; k < 34; k++) {
      const x = 14 + k, y = 64 - Math.round(k * 0.75);
      R(x, y, 1, 2, k < 13 ? '#7a4a24' : '#6a6e78');
    }
    O([[22, 55, 4, 4, skin], [36, 47, 4, 4, skin]]);
  } else if (pose === 'tied' || pose === 'sack') {
    O([[27, 57, 10, 4, skin]]);
    R(26, 58, 12, 1, '#c8a060'); R(30, 56, 1, 6, '#c8a060'); R(34, 56, 1, 6, '#c8a060');
    if (pose === 'sack') drawSack(R, 32, 0);
  } else if (pose === 'hurt') {
    O([[12, 54, 4, 8, sleeve]]); O([[12, 62, 4, 3, skin]]);
    R(38, 54, 6, 4, '#9a2a1c'); R(39, 58, 3, 2, '#7a1a14'); // tache de sang
    O([[44, 52, 4, 7, sleeve], [38, 56, 6, 3, skin]]);
  }
}

// Sac de jute sur la tête, ficelé au cou (tête centrée en cx, haut du buste en y0)
function drawSack(R, cx, y0) {
  const sack = '#b89a68', sackD = '#8a6e44';
  const half = (y, k) => Math.round(13 * Math.sqrt(Math.max(0, 1 - ((y - 22) / 17.5) ** 2))) + (y > 30 ? 1 : 0) - k;
  for (let y = 6; y < 39; y++) R(cx - half(y, 0) - 1, y0 + y, half(y, 0) * 2 + 2, 1, OUT);
  for (let y = 7; y < 38; y++) R(cx - half(y, 1), y0 + y, half(y, 1) * 2, 1, y % 5 === 0 ? sackD : sack);
  for (let y = 9; y < 36; y += 3) R(cx - 4 + (y % 2), y0 + y, 1, 2, sackD); // coutures
  R(cx - 8, y0 + 9, 4, 3, S.shade(sack, 0.15));
  R(cx - 10, y0 + 36, 20, 2, '#7a5a30'); R(cx - 10, y0 + 36, 20, 1, '#a8844a'); // la corde
}

// ---------------------------------------------------------------- cheval
// Cheval de profil tourné vers la droite, à l'échelle des bustes ; frame 0 debout, 1 et 2 au trot/galop.
// nod : la tête plonge et la queue fouette (le cheval s'ébroue, à l'arrêt).
const horses = S.lru(48);
function horseSprite(coat, frame, blanket, nod = 0) {
  const key = `${coat}|${frame}|${blanket}|${nod}`;
  let c = horses.get(key);
  if (c) return c;
  c = S.makeCanvas(MW, MH, true);
  const g = c.getContext('2d', { willReadFrequently: true });
  const R = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(MOX + Math.round(x), MOY + Math.round(y), w, h); };
  const dark = S.shade(coat, -0.3), light = S.shade(coat, 0.2), mane = S.shade(coat, -0.6);
  const b = frame === 2 ? -1 : 0;
  // pattes : hanche → genou → sabot ; frame 1 foulée ouverte, 2 regroupée
  const leg = (hx, dx, col, front) => {
    const top = -30 + b, kneeY = -14, fx = hx + dx;
    const kx = hx + dx * 0.4 + (front ? 2 : -2) * Math.sign(Math.abs(dx));
    for (let y = top; y <= kneeY; y++) { const t = (y - top) / (kneeY - top); R(hx + (kx - hx) * t - (y < top + 6 ? 1 : 0), y, y < top + 6 ? 7 : 5, 1, col); }
    for (let y = kneeY; y <= -3; y++) { const t = (y - kneeY) / (-3 - kneeY); R(kx + (fx - kx) * t, y, 4, 1, col); }
    R(fx - 1, -3, 6, 3, '#2a1a10'); // sabot
    R(fx, -5, 4, 1, S.shade(col, 0.25)); // balzane claire
  };
  const L = [[-24, -10, 8], [20, 10, -8], [-18, 8, -6], [26, 4, 10]]; // [hanche, foulée 1, foulée 2]
  const dx = (l) => (frame === 1 ? l[1] : frame === 2 ? l[2] : 0);
  leg(L[0][0], dx(L[0]), dark, false); leg(L[1][0], dx(L[1]), dark, true);
  // queue
  const tw = frame === 1 ? -3 : frame === 2 ? 2 : nod ? -4 : 0;
  const hb = nod ? 4 : 0; // la tête qui s'abaisse
  for (let k = 0; k < 24; k++) R(-34 - Math.round(k * 0.35) + (k > 10 ? tw : 0), -46 + b + k, k < 4 ? 5 : 4, 1, mane);
  // corps : un gros ovale, ventre plus sombre, dos éclairé
  for (let dy = -12; dy <= 11; dy++) {
    const half = Math.round(33 * Math.sqrt(1 - (dy / 12.5) ** 2));
    R(-half, -38 + b + dy, half * 2 + 1, 1, dy > 6 ? dark : coat);
  }
  R(-26, -49 + b, 44, 1, light); R(-30, -46 + b, 3, 6, light);
  // encolure épaisse qui monte vers l'avant
  for (let k = 0; k < 24; k++) {
    const y = -42 + b - k + Math.round((hb * k) / 23), xl = 18 + Math.round(k * 0.62), xr = 34 + Math.round(k * 0.45);
    R(xl, y, xr - xl, 1, coat);
    if (k > 4) R(xr - 2, y, 2, 1, dark);
    R(xl - 2, y, 4, 1, mane); // crinière
    if (k % 3 === 0) R(xl - 3, y + 1, 2, 2, mane);
  }
  // tête allongée, chanfrein vers le bas
  const hy = b + hb;
  for (const [y, xa, xb] of [[-72, 31, 40], [-71, 30, 44], [-70, 30, 47], [-69, 31, 50], [-68, 32, 52], [-67, 34, 54], [-66, 36, 55], [-65, 38, 56], [-64, 40, 56], [-63, 42, 55], [-62, 44, 54]]) R(xa, y + hy, xb - xa, 1, coat);
  R(49, -64 + hy, 7, 2, dark); R(46, -62 + hy, 8, 1, dark); // museau
  R(53, -66 + hy, 2, 1, OUT); // naseau
  R(32, -76 + hy + (nod ? 1 : 0), 3, 5, coat); R(36, -75 + hy, 3, 4, coat); R(33, -75 + hy, 1, 3, dark); // oreilles
  R(39, -69 + hy, 2, 2, OUT); R(39, -69 + hy, 1, 1, '#f4ecd8'); // œil
  R(30, -73 + hy, 4, 3, mane); // toupet
  // couverture de selle et selle
  R(-14, -54 + b, 28, 14, blanket);
  R(-14, -54 + b, 28, 1, S.shade(blanket, 0.25));
  R(-14, -42 + b, 28, 2, S.shade(blanket, -0.35));
  for (let x = -12; x < 14; x += 4) R(x, -41 + b, 2, 1, S.shade(blanket, 0.3));
  R(-11, -57 + b, 22, 5, '#5a3418'); R(-11, -57 + b, 22, 1, '#8a5a30');
  R(9, -61 + b, 4, 6, '#5a3418'); // pommeau
  R(-2, -52 + b, 2, 12, '#3a2214'); // sangle
  leg(L[2][0], dx(L[2]), coat, false); leg(L[3][0], dx(L[3]), coat, true);
  // bride et rênes
  R(42, -70 + hy, 1, 8, '#3a2214'); R(36, -62 + hy, 12, 1, '#3a2214');
  for (let k = 0; k < 22; k++) R(36 - k, -62 + hy + Math.round(k * (0.2 - hb / 110)), 1, 1, '#3a2214');
  outlineOnce(c);
  horses.set(key, c);
  return c;
}

// Contour sombre d'un pixel (une fois, à la création du sprite)
function outlineOnce(canvas) {
  const g = canvas.getContext('2d', { willReadFrequently: true });
  const { width: w, height: h } = canvas;
  const img = g.getImageData(0, 0, w, h);
  const d = img.data, src = new Uint8ClampedArray(d);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    if (src[i + 3]) continue;
    if ((x > 0 && src[i - 1]) || (x < w - 1 && src[i + 7]) || (y > 0 && src[i - w * 4 + 3]) || (y < h - 1 && src[i + w * 4 + 3])) {
      d[i] = 26; d[i + 1] = 15; d[i + 2] = 10; d[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
}

// Cavalier : le cheval, puis le buste en selle, la jambe et la botte côté spectateur, les mains aux rênes
const riders = S.lru(80, freeDeep);
function riderSprite(look, coat, frame, blanket, { blink, t, pose, nod = 0 }) {
  const cig = look.mouth === 'cigar' || look.mouth === 'pipe' ? Math.floor(t / 300) % 4 : 0;
  const key = `${S.lookKey(look)}|${coat}|${frame}|${blanket}|${blink ? 1 : 0}|${cig}|${pose}|${nod}`;
  let c = riders.get(key);
  if (c) return c;
  c = S.makeCanvas(MW, MH);
  const g = c.getContext('2d');
  g.drawImage(horseSprite(coat, frame, blanket, nod), 0, 0);
  const b = frame === 2 ? -1 : 0;
  const seat = MOY - SEAT - 6 + b; // haut de la selle
  g.drawImage(S.characterSprite(look, { blink, t, hurt: pose === 'ko' }), 0, 0, 48, 56, MOX - 26, seat - 55, 48, 56);
  const { R, O } = painter(g);
  const col = lowerColors(look);
  const skin = SKIN[look.skin] || SKIN[1];
  // cuisse, genou plié vers l'avant, botte dans l'étrier
  O([[MOX - 6, seat, 15, 6, col.pants], [MOX + 3, seat + 5, 6, 12, col.pants], [MOX + 2, seat + 16, 11, 5, col.boot]]);
  R(MOX - 6, seat, 15, 1, col.pantsL); R(MOX + 3, seat + 5, 1, 12, col.pantsL);
  R(MOX + 2, seat + 20, 11, 1, '#24140a');
  R(MOX + 1, seat + 18, 1, 1, '#c8c8d0');
  R(MOX + 5, seat + 14, 1, 7, '#3a2214'); // l'étrivière
  if (pose === 'gun') O([[MOX + 16, seat - 13, 10, 4, col.cloth], [MOX + 26, seat - 13, 3, 4, skin], [MOX + 27, seat - 16, 6, 3, '#6a6e78']]);
  // (le canvas s'arrête au haut du chapeau, seat - 56 : un bras levé reste en dessous)
  else if (pose === 'up') { O([[MOX + 20, seat - 42, 5, 34, col.cloth], [MOX + 20, seat - 47, 5, 5, skin], [MOX + 21, seat - 55, 3, 8, '#6a6e78']]); R(MOX + 21, seat - 55, 1, 8, '#b8bec6'); }
  else if (pose === 'torch') { O([[MOX + 12, seat - 30, 12, 5, col.cloth], [MOX + 21, seat - 36, 5, 6, skin], [MOX + 23, seat - 50, 2, 14, '#6a4424']]); R(MOX + 22, seat - 50, 4, 2, '#3a2214'); }
  // le lancer en selle : bras levé derrière la tête (la bouteille : drawActor), puis le bras parti vers l'avant
  else if (pose === 'throw') { O([[MOX - 22, seat - 40, 5, 30, col.cloth], [MOX - 22, seat - 45, 5, 5, skin]]); O([[MOX + 12, seat - 6, 6, 4, skin]]); }
  else if (pose === 'lob') O([[MOX + 10, seat - 16, 6, 6, col.cloth], [MOX + 14, seat - 21, 6, 6, col.cloth], [MOX + 18, seat - 26, 6, 6, col.cloth], [MOX + 22, seat - 30, 4, 4, skin]]);
  else O([[MOX + 12, seat - 6, 6, 4, skin]]);
  if (pose === 'sack' || pose === 'tied') R(MOX - 8, seat - 4, 16, 1, '#c8a060');
  if (pose === 'sack') drawSack(R, MOX - 2, seat - 55);
  c.ox = MOX; c.oy = MOY;
  riders.set(key, c);
  return c;
}

// Copie retournée d'un sprite (mise en cache sur le sprite lui-même)
function flipped(c) {
  if (c.flip) return c.flip;
  const f = S.makeCanvas(c.width, c.height);
  const g = f.getContext('2d');
  g.translate(c.width, 0);
  g.scale(-1, 1);
  g.drawImage(c, 0, 0);
  f.ox = c.width - c.ox; f.oy = c.oy;
  c.flip = f;
  return f;
}
// Inspiration : le haut du corps (jusqu'à la poitrine, ligne 56) remonte d'un pixel ; la ligne 56 est doublée
// (pas de trou) et les jambes ne bougent pas
function breathed(c) {
  if (c.breath) return c.breath;
  const b = S.makeCanvas(c.width, c.height);
  const g = b.getContext('2d');
  g.drawImage(c, 0, 0, c.width, 57, 0, -1, c.width, 57);
  g.drawImage(c, 0, 56, c.width, c.height - 56, 0, 56, c.width, c.height - 56);
  b.ox = c.ox; b.oy = c.oy;
  c.breath = b;
  return b;
}
// Buste penché d'un pixel vers l'avant (balancement de celui qui parle)
function leaned(c) {
  if (c.lean) return c.lean;
  const b = S.makeCanvas(c.width, c.height);
  const g = b.getContext('2d');
  g.drawImage(c, 0, 0, c.width, 57, 1, 0, c.width, 57);
  g.drawImage(c, 0, 57, c.width, c.height - 57, 0, 57, c.width, c.height - 57);
  b.ox = c.ox; b.oy = c.oy;
  c.lean = b;
  return b;
}
// Copie assombrie (acteur au second plan quand un autre est mis en avant)
function dimmed(c) {
  if (c.dim) return c.dim;
  const d = S.makeCanvas(c.width, c.height);
  const g = d.getContext('2d');
  g.drawImage(c, 0, 0);
  g.globalCompositeOperation = 'source-atop';
  g.fillStyle = 'rgba(18,9,6,0.5)';
  g.fillRect(0, 0, d.width, d.height);
  d.ox = c.ox; d.oy = c.oy;
  c.dim = d;
  return d;
}
// Pose un sprite (pieds en x, y), assombri selon dim (0 à 1 : fondu entre les deux copies)
function put(ctx, spr, x, y, dim) {
  if (dim < 1) ctx.drawImage(spr, x - spr.ox, y - spr.oy);
  if (dim > 0) {
    if (dim < 1) ctx.globalAlpha = dim;
    ctx.drawImage(dimmed(spr), x - spr.ox, y - spr.oy);
    ctx.globalAlpha = 1;
  }
}

// ---------------------------------------------------------------- dessin
// a : { look, kind, seed } ; st : { dir, pose, moving, dist (px parcourus : rythme des pas), speed (px/ms), mount
//   (couleur ou null), blanket (couleur de la couverture de selle), t (horloge des animations), talk (il parle :
//   balancement), dim (0 à 1 : assombri), dusty (false : pas de poussière sous les pas, à l'intérieur) }
// Renvoie la position de la flamme si l'acteur brandit une torche ou une bouteille enflammée (pose 'throw')
// ([x, y], pour son halo), sinon null. Pose 'rear' d'un cavalier : le cheval se cabre.
export function drawActor(ctx, a, x, y, st) {
  x = Math.round(x); y = Math.round(y);
  const t = st.t || 0, seed = a.seed || 0;
  const blink = blinking(t, seed);
  const dir = st.dir < 0 ? -1 : 1;
  const dim = st.dim || 0;
  if (st.mount && st.pose === 'rear') {
    // le cheval se cabre : tout le cavalier pivote autour des sabots arrière (exception à la règle « pas de
    // rotation » : deux angles seulement, pour que les pixels ne grouillent pas), les antérieurs battent l'air
    const k = Math.floor((t + seed * 37) / 120) % 2;
    let spr = riderSprite(a.look, st.mount, 1 + k, st.blanket || '#9a2a1c', { blink, t, pose: 'rear' });
    if (dir < 0) spr = flipped(spr);
    const px = x - dir * 24, ang = -dir * (Math.floor((t + seed * 53) / 230) % 2 ? 0.44 : 0.38);
    shadow(ctx, px, y, 16);
    ctx.save();
    ctx.translate(px, y);
    ctx.rotate(ang);
    put(ctx, spr, x - px, 0, dim);
    ctx.restore();
    return null;
  }
  if (st.mount) {
    const fast = st.speed > 0.09;
    const frame = st.moving ? 1 + (Math.floor(st.dist / (fast ? 14 : 9)) % 2) : 0;
    // à l'arrêt, le cheval s'ébroue de temps en temps : la tête plonge deux fois, la queue fouette, il souffle
    const ph = (t + seed * 1777) % 5600;
    const nod = !st.moving && ph < 640 ? Math.floor(ph / 160) % 2 : 0;
    let spr = riderSprite(a.look, st.mount, frame, st.blanket || '#9a2a1c', { blink, t, pose: st.pose, nod });
    if (dir < 0) spr = flipped(spr);
    shadow(ctx, x, y, 36);
    if (st.moving && st.dusty !== false) dust(ctx, x - dir * 30, y, dir, t, seed, fast ? 2 : 1);
    const lift = st.moving && fast && frame === 1 ? -2 : 0;
    put(ctx, spr, x, y + lift, dim);
    if (!st.moving && ph < 640 && dim < 1) snort(ctx, x + dir * 55, y - 60, dir, ph);
    if (st.pose === 'throw') return bottle(ctx, x - dir * 19, y - 107 + lift, dir > 0 ? 7 : 1, t + seed * 50, dim);
    return st.pose === 'torch' ? torch(ctx, x + (dir > 0 ? 24 : -25), y - 106 + lift, t + seed * 50, dim) : null;
  }
  if (st.pose === 'down') {
    // couché au sol, tête du côté de dir : le corps pivote d'un quart de tour (pixels intacts)
    let spr = bodySprite(a.look, { pose: 'down', t, kind: a.kind });
    if (dim > 0.5) spr = dimmed(spr);
    shadow(ctx, x, y, 38);
    ctx.save();
    ctx.translate(x + (dir > 0 ? -34 : 34), y - 26);
    ctx.rotate(dir > 0 ? Math.PI / 2 : -Math.PI / 2);
    ctx.drawImage(spr, -OX, -OY);
    ctx.restore();
    return null;
  }
  const frame = st.moving ? 1 + (Math.floor(st.dist / 7) % 2) : 0;
  let spr = bodySprite(a.look, { frame, pose: st.pose || 'stand', blink, t, kind: a.kind });
  // à l'arrêt : respiration (cycle de 2,8 s) ; s'il parle : petits hochements irréguliers et buste qui se penche
  let up = false, lean = false;
  if (!st.moving && st.pose !== 'ko') {
    if (st.talk) {
      up = hash(Math.floor((t + seed * 97) / 140) + seed * 31) < 0.5;
      lean = Math.floor((t + seed * 300) / 720) % 2 === 1;
    } else up = (t + seed * 613) % 2800 < 1150;
  }
  if (lean) spr = leaned(spr);
  if (up) spr = breathed(spr);
  if (dir < 0) spr = flipped(spr);
  shadow(ctx, x, y, 14);
  if (st.moving && st.speed > 0.11 && st.dusty !== false) dust(ctx, x - dir * 8, y, dir, t, seed, 1);
  put(ctx, spr, x, y - (frame ? 1 : 0), dim);
  if (st.pose === 'throw') return bottle(ctx, x + dir * (12 - OX) + (lean ? dir : 0), y - 63 - (up ? 1 : 0), dir > 0 ? 7 : 1, t + seed * 50, dim);
  return st.pose === 'torch' ? torch(ctx, x + (dir > 0 ? 18 : -19) + (lean ? dir : 0), y - 71 - (up ? 1 : 0), t + seed * 50, dim) : null;
}

// Flamme d'une torche, posée sur le haut du manche (x, y) : trois couches qui vacillent, une étincelle
function torch(ctx, x, y, t, dim) {
  const f = Math.floor(t / 90) % 4, h = [7, 9, 8, 10][f], w = [4, 4, 5, 4][f];
  const sway = [0, 1, 0, -1][Math.floor(t / 140) % 4];
  ctx.globalAlpha = dim ? 1 - dim * 0.4 : 1;
  ctx.fillStyle = '#e8501c'; ctx.fillRect(x - (w >> 1), y - h, w, h);
  ctx.fillStyle = '#f89a2a'; ctx.fillRect(x - 1 + sway, y - h + 2, 3, h - 2);
  ctx.fillStyle = '#fde870'; ctx.fillRect(x + sway, y - 4, 1, 3);
  if (f === 1) { ctx.fillStyle = '#f8c040'; ctx.fillRect(x + sway * 2, y - h - 2, 1, 1); }
  ctx.globalAlpha = 1;
  return [x, y - 4];
}

// Poussière soulevée par les pas ou les sabots : trois bouffées qui s'élargissent et retombent derrière
function dust(ctx, x, y, dir, t, seed, big) {
  const P = big > 1 ? 420 : 520;
  for (let i = 0; i < 3; i++) {
    const age = ((t + seed * 131 + (i * P) / 3) % P) / P;
    const px = x - dir * Math.round(age * 12 * big), py = y - 1 - Math.round(age * 5 * big);
    S.disc(ctx, px, py, Math.max(1, Math.round((1 + age * 3) * big)), `rgba(214,176,128,${(0.5 * (1 - age)).toFixed(2)})`);
  }
}

// Le cheval s'ébroue : deux bouffées de vapeur sortent des naseaux (x, y), une à chaque plongée de la tête
function snort(ctx, x, y, dir, ph) {
  for (const p0 of [0, 320]) {
    const e = ph - p0;
    if (e < 0 || e > 300) continue;
    const k = e / 300;
    ctx.fillStyle = `rgba(236,228,214,${(0.6 * (1 - k)).toFixed(2)})`;
    ctx.fillRect(Math.round(x + dir * (2 + k * 7)), Math.round(y + k * 3), 2 + Math.round(k * 2), 1);
    ctx.fillRect(Math.round(x + dir * (1 + k * 5)), Math.round(y + 2 + k * 2), 2, 1);
  }
}

function shadow(ctx, x, y, rx) {
  ctx.fillStyle = 'rgba(30,14,6,0.32)';
  ctx.fillRect(x - rx, y - 1, rx * 2, 3);
  ctx.fillRect(x - rx + 3, y + 2, rx * 2 - 6, 1);
}

export const lowerKind = (castId) => LOWER[castId] || 'pants';

// ---------------------------------------------------------------- bouteille de pétrole enflammée
// La main qui lâche la bouteille (pose 'lob'), par rapport aux pieds, personnage tourné vers la droite
export const THROW_HAND = { stand: [27, -50], mount: [24, -86] };
// Bouteille vue de profil, goulot en haut : chiffon, goulot, verre vert, pétrole ambré, cul sombre
const BOTTLE = ['.cc.', '.nn.', '.nn.', 'gggg', 'ghgg', 'ghgg', 'phpp', 'pppp', 'dddd'];
const BOTTLE_COL = { c: '#e8d8b0', n: '#5a8a6a', g: '#4a7a5a', h: '#c8f0d8', p: '#c08a30', d: '#2a4a3a' };
let bottles = null;
// Huit orientations (k × 45°, sens horaire, 0 : goulot en haut), échantillonnées une fois au plus proche puis
// cernées ; le bout du goulot de chacune (pour la flamme du chiffon) est rangé sur le sprite
function bottleFrames() {
  if (bottles) return bottles;
  bottles = [];
  for (let k = 0; k < 8; k++) {
    const a = (k * Math.PI) / 4, ca = Math.cos(a), sa = Math.sin(a);
    const c = S.makeCanvas(15, 15, true);
    const g = c.getContext('2d', { willReadFrequently: true });
    for (let y = 0; y < 15; y++) for (let x = 0; x < 15; x++) {
      const dx = x + 0.5 - 7.5, dy = y + 0.5 - 7.5;
      const u = Math.floor(dx * ca + dy * sa + 2 + 0.001), v = Math.floor(-dx * sa + dy * ca + 4.5 + 0.001);
      const ch = BOTTLE[v]?.[u];
      if (!ch || ch === '.') continue;
      g.fillStyle = BOTTLE_COL[ch];
      g.fillRect(x, y, 1, 1);
    }
    outlineOnce(c);
    c.tip = [Math.round(4.5 * sa), Math.round(-4.5 * ca)];
    bottles.push(c);
  }
  return bottles;
}
// Bouteille d'orientation k centrée en (x, y), et la flamme de son chiffon ; renvoie la position de la flamme
export function bottle(ctx, x, y, k, t, dim = 0) {
  const c = bottleFrames()[((k % 8) + 8) % 8];
  x = Math.round(x); y = Math.round(y);
  if (dim) ctx.globalAlpha = 1 - dim * 0.4;
  ctx.drawImage(c, x - 7, y - 7);
  ctx.globalAlpha = 1;
  return ragFlame(ctx, x + c.tip[0], y + c.tip[1], t, dim);
}
// Le chiffon qui flambe au goulot : une petite flamme qui monte toujours, quelle que soit la bouteille
export function ragFlame(ctx, x, y, t, dim = 0) {
  const f = Math.floor(t / 70) % 4, h = [5, 6, 4, 7][f], sw = [0, 1, 0, -1][Math.floor(t / 110) % 4];
  ctx.globalAlpha = dim ? 1 - dim * 0.4 : 1;
  ctx.fillStyle = '#c8381a'; ctx.fillRect(x - 1, y - h + 1, 3, h);
  ctx.fillStyle = '#f89a2a'; ctx.fillRect(x - 1 + (sw > 0 ? 1 : 0), y - h + 2, 2, h - 2);
  ctx.fillStyle = '#fde870'; ctx.fillRect(x, y - 2, 1, 2);
  if (f === 3) { ctx.fillStyle = '#f8c040'; ctx.fillRect(x + sw, y - h - 1, 1, 1); }
  ctx.globalAlpha = 1;
  return [x, y - 3, 16]; // (le halo d'un chiffon est plus petit que celui d'une torche)
}
