// Mini-jeu « Défends la roulotte » : la roulotte fait route de Dusty Gulch à Red Rock et une bande de hors-la-loi
// l'attaque en chemin. Quatre étapes : la prairie (vue de côté, le décor défile, trail.js), le canyon (de
// l'intérieur de la roulotte, en vue subjective : on surveille devant, par-dessus l'attelage, ou on se retourne
// vers le hayon), le campement (de côté) puis l'assaut de Black Bart (de l'intérieur).
// Souris : viser · clic : tirer (6 balles) · clic droit, R : recharger (Espace aussi, de côté).
// Dans la roulotte : Espace, E, S ou clic sur le bouton du bas : se retourner.
// Les bandits dorés lâchent un bonus qu'il faut abattre au vol ; les balles au but d'affilée font monter la série.
import * as S from './sprites.js';
import { sfx } from './audio.js';
import { canvasText } from './scene.js';
import { SKIN, HAIR_COLORS } from './data.js';
import { MiniScene, ring, pixelSprite } from './miniscene.js';
import { skyDeco } from './env.js';
import { horseSprite, riderLook } from './lasso.js';
import { W, H } from './worlds.js';
import {
  WAGON, BANDIT_LOOKS, STAGES, BONUS, IN, SNIPE, AMB_ROCK, stageAt, wagonWorld, banditX, banditBox, anchor, climbK,
  sniperUp, inPos, inProj, inK, ambushRise, targetBox, headBox, faceOf, active, dynThrows, dynPos, bonusPos, nextStrike,
} from './wagongame.js';
import { HORIZON, drawTrail, trailWarm, trailProp } from './trail.js';

const OUT = S.OUT;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const rd = Math.round;
const tri = (u) => 1 - 2 * Math.abs((((u % 1) + 1) % 1) - 0.5);
const ease = (k) => 1 - (1 - k) ** 3;
const lcg = (s) => () => ((s = (s * 9301 + 49297) % 233280) / 233280);
function hash(n) {
  let x = Math.imul(n ^ 0x5bd1e995, 0x27d4eb2d);
  x ^= x >>> 15;
  x = Math.imul(x, 0x165667b1);
  return ((x ^ (x >>> 13)) >>> 0) / 4294967296;
}
const cache = new Map();
const cached = (key, make) => {
  let c = cache.get(key);
  if (!c) { c = make(); cache.set(key, c); }
  return c;
};
const BOSS_K = 1.2; // Black Bart et son cheval, un peu plus grands que les autres
const SHOT_R = 14; // rayon du tir groupé (escopette)
const TURN_BTN = { x: W / 2 - 75, y: H - 20, w: 150, h: 17 };
const ZIG_LOOK = { skin: 3, hair: 0, coat: '#c8582a', hat: '#d8b878', band: '#2a2622' }; // le bandido : poncho et sombrero
const inRectPt = (m, r) => r && m.x >= r.x && m.x <= r.x + r.w && m.y >= r.y && m.y <= r.y + r.h;

// ------------------------------------------------------------ la bande
const LOOKS = [
  { skin: 1, hair: 0, coat: '#3d2a1c', pants: '#2a2622', hat: '#2a2622', band: '#a8302a', char: { skin: 1, hairColor: 0, outfitColor: 1, hatColor: 7, hat: 'cowboy', beard: 'stubble', outfit: 'duster' } },
  { skin: 3, hair: 0, coat: '#4a5a2a', pants: '#3d2a1c', hat: '#3d2a1c', band: '#2a2622', char: { skin: 3, hairColor: 0, outfitColor: 4, hatColor: 1, hat: 'sombrero', beard: 'mustache', outfit: 'poncho' } },
  { skin: 0, hair: 5, coat: '#7a2a1e', pants: '#2a2622', hat: '#2a2622', band: '#d9c49a', char: { skin: 0, hairColor: 5, outfitColor: 0, hatColor: 7, hat: 'bandana', beard: 'full', outfit: 'vest' } },
  { skin: 2, hair: 1, coat: '#2a2622', pants: '#3d2a1c', hat: '#5a2a4a', band: '#a8302a', char: { skin: 2, hairColor: 1, outfitColor: 7, hatColor: 6, hat: 'gambler', beard: 'goatee', outfit: 'duster' } },
  { skin: 4, hair: 0, coat: '#2f4a5e', pants: '#2a2622', hat: '#3d2a1c', band: '#2a2622', char: { skin: 4, hairColor: 0, outfitColor: 3, hatColor: 1, hat: 'cowboy', beard: 'chops', outfit: 'shirt' } },
  { skin: 1, hair: 2, coat: '#c26a2a', pants: '#3d2a1c', hat: '#2a2622', band: '#a8302a', char: { skin: 1, hairColor: 2, outfitColor: 2, hatColor: 7, hat: 'cowboy', beard: 'horseshoe', outfit: 'vest' } },
];
const BOSS_LOOK = { skin: 3, hair: 0, coat: '#1e1a18', pants: '#2a2622', hat: '#1e1a18', band: '#1e1a18', boss: true };
const HORSES = [['#8a4a24', '#2e1a10'], ['#3a2c26', '#120c08'], ['#e8dcc8', '#8a7a68'], ['#5a3a20', '#1a0f0a']];
const TEAM = [['#a86a3a', '#4a2a14'], ['#6a4a34', '#2a1a10']]; // l'attelage de la roulotte

// bandit à pied, tourné vers la droite, pieds en (0, 0)
// pose : 'walk' (frame 0..3), 'stand', 'strike' (frame 0..1, il s'acharne sur la roulotte), 'throw', 'aim' (fusil épaulé)
function drawBandit(R, L, kind, pose, frame) {
  const big = kind === 'brute' || kind === 'boss';
  const wd = big ? 2 : 0, lift = big ? 3 : 0;
  const skin = SKIN[L.skin], hair = HAIR_COLORS[L.hair], coat = L.coat, coatD = S.shade(coat, -0.3);
  const s = pose === 'walk' ? [-1, 0, 1, 0][frame] : 0;
  const legH = 11 + lift, bodyH = 12 + lift;
  R(-3 + s - wd / 2, -legH - 1, 3, legH, S.shade(L.pants, -0.2)); R(1 - s + wd / 2, -legH - 1, 3, legH, L.pants);
  R(-3 + s - wd / 2, -2, 4, 2, '#2a1a10'); R(1 - s + wd / 2, -2, 4, 2, '#2a1a10');
  const T = -legH - 1 - bodyH;
  R(-5 - wd, T + bodyH - 6, 2, 7, coatD); // pan du manteau
  R(-4 - wd, T, 9 + 2 * wd, bodyH, coat); R(-4 - wd, T, 9 + 2 * wd, 1, S.shade(coat, 0.15));
  R(-4 - wd, T + bodyH - 2, 9 + 2 * wd, 2, '#2a1a10'); R(0, T + bodyH - 2, 2, 2, L.boss ? '#e0b040' : '#a88a40');
  if (L.boss) for (let k = 0; k < bodyH - 2; k++) R(-4 - wd + k, T + k, 2, 1, '#c8a040'); // cartouchière
  R(-6 - wd, T + 1, 2, 8, coatD); R(-6 - wd, T + 9, 2, 2, skin); // bras arrière
  const hy = T - 7;
  R(-2, hy, 6, 7, skin); R(-2, hy, 2, 4, hair); R(2, hy + 2, 1, 1, '#1a0f0a');
  R(-2, hy + 4, 7, 3, L.band); R(-4, hy + 4, 2, 2, L.band); R(-5, hy + 5, 1, 2, L.band); // foulard sur le nez
  const hc = L.hat, band = S.shade(hc, -0.4);
  if (L.boss) { R(-9, hy - 1, 19, 2, hc); R(-2, hy - 6, 8, 5, hc); R(-2, hy - 2, 8, 1, '#c8a040'); }
  else { R(-5, hy - 1, 12, 1, hc); R(-2, hy - 4, 7, 3, hc); R(-2, hy - 2, 7, 1, band); R(-2, hy - 5, 2, 1, hc); R(3, hy - 5, 2, 1, hc); }
  // bras avant
  if (pose === 'throw') {
    R(1, hy - 3, 2, 9, coat); R(1, hy - 5, 2, 2, skin);
    R(1, hy - 10, 2, 5, '#c0302a'); R(1, hy - 9, 2, 1, '#e8d8a0'); R(2, hy - 12, 1, 2, '#e8d8a0');
  } else if (pose === 'aim') { // fusil épaulé, canon vers la droite
    R(-2, T + 2, 5, 3, '#7a4a24'); R(3, T + 1, 17, 2, '#5a5f68'); R(3, T + 3, 6, 1, '#7a4a24');
    R(3, T + 3, 6, 2, coat); R(8, T + 3, 2, 2, skin);
  } else if (pose === 'strike') {
    const up = frame === 0;
    R(3, up ? T - 5 : T + 2, 2, up ? 8 : 2, coat); R(up ? 3 : 5, up ? T - 7 : T + 2, 2, 2, skin);
    if (big) R(up ? 2 : 7, up ? T - 15 : T - 6, 3, 10, '#7a4a24'); // gourdin
    else R(up ? 3 : 6, up ? T - 12 : T - 3, 2, 6, '#9aa0a8'); // couteau
  } else if (big && !L.boss) {
    R(3, T + 2, 5, 2, coat); R(7, T + 2, 2, 2, skin); R(8, T - 6, 3, 10, '#7a4a24'); // gourdin
  } else {
    R(3, T + 2, 7, 2, coat); R(9, T + 2, 2, 2, skin);
    R(10, T, L.boss ? 9 : 6, 2, '#5a5f68'); R(10, T + 2, 2, 2, '#3a2a1a');
  }
}

function banditSprite(look, kind, pose, frame) {
  return cached(`b${kind}|${look}|${pose}|${frame}`, () => {
    const L = kind === 'boss' ? BOSS_LOOK : LOOKS[look % LOOKS.length];
    return pixelSprite(44, 58, 20, 54, (R) => drawBandit(R, L, kind, pose, frame));
  });
}

const riders = new Map();
function riderSprite(look, frame) {
  const L = LOOKS[look % LOOKS.length];
  let r = riders.get(look);
  if (!r) { r = riderLook(L.char, L.band, `bandit${look}`); riders.set(look, r); }
  const [coat, mane] = HORSES[look % HORSES.length];
  return horseSprite(coat, mane, frame, r);
}

function flipped(spr) {
  if (!spr.flip) {
    const c = S.makeCanvas(spr.width, spr.height);
    const x = c.getContext('2d');
    x.scale(-1, 1);
    x.drawImage(spr, -spr.width, 0);
    c.ox = spr.width - spr.ox;
    c.oy = spr.oy;
    spr.flip = c;
  }
  return spr.flip;
}

// silhouette dorée d'un sprite : le liseré qui signale un bandit porteur de bonus
function goldOf(spr) {
  if (!spr.gold) {
    const c = S.makeCanvas(spr.width, spr.height);
    const g = c.getContext('2d');
    g.drawImage(spr, 0, 0);
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = '#f8d070';
    g.fillRect(0, 0, c.width, c.height);
    spr.gold = c;
  }
  return spr.gold;
}
function goldRim(ctx, spr, x, y, w, h, now) {
  const g = goldOf(spr);
  ctx.globalAlpha = 0.6 + 0.4 * Math.sin(now / 120);
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) ctx.drawImage(g, rd(x) + dx, rd(y) + dy, rd(w), rd(h));
  ctx.globalAlpha = 1;
  // une étincelle de temps en temps
  const k = Math.floor(now / 160) % 5;
  if (k < 2) { ctx.fillStyle = '#fff8d0'; ctx.fillRect(rd(x + w * (0.2 + 0.6 * hash(Math.floor(now / 800) + rd(x)))), rd(y + h * 0.3 * k), 1, 1); }
}

// mule chargée de caisses de dynamite, tournée vers la droite, pieds en (0, 0)
function muleSprite(f) {
  return cached(`mule${f}`, () => pixelSprite(48, 44, 22, 40, (R) => {
    const c = '#8a7a6a', d = '#5a4a3e', l = '#a89888';
    const b = f % 2 ? -1 : 0;
    [[-10, 0], [-6, 1], [6, 0], [10, 1]].forEach(([x, ph], i) => {
      const up = (f + ph * 2) % 4 < 2 ? 0 : 2;
      R(x, -10 + b, 2, 10 - up, i % 2 ? c : d); R(x, -2 - up, 2, 2, '#2a1a10');
    });
    R(-12, -19 + b, 24, 10, c); R(-12, -19 + b, 24, 1, l); R(-12, -10 + b, 24, 1, d); // corps
    R(-14, -18 + b, 2, 7, d); R(-15, -12 + b, 2, 2, OUT); // queue
    R(10, -24 + b, 5, 8, c); R(13, -27 + b, 7, 6, c); R(19, -24 + b, 3, 3, d); R(16, -25 + b, 1, 1, OUT); // tête
    R(13, -34 + b, 2, 7, c); R(16, -33 + b, 2, 6, d); // grandes oreilles
    R(-10, -28 + b, 17, 9, '#8a5a34'); R(-10, -28 + b, 17, 1, '#a8784a'); R(-10, -24 + b, 17, 1, '#5a3418'); // bât
    for (let k = 0; k < 4; k++) R(-8 + k * 4, -32 + b, 2, 5, '#c0302a');
    R(-1, -35 + b, 1, 3, '#e8d8a0'); // mèche
  }));
}

// rocher derrière lequel se cache un tireur (w de large, h de haut, sommet presque plat), base au sol en (0, 0)
function boulder(w, h) {
  return cached(`boulder${w}x${h}`, () => pixelSprite(w + 4, h + 4, rd(w / 2) + 2, h + 2, (R) => {
    const half = w / 2;
    for (let y = -h; y < 0; y++) {
      const u = (y + h) / h, hw = rd(half * (0.62 + 0.38 * Math.sqrt(Math.min(1, u * 2.5))));
      R(-hw, y, hw * 2, 1, y < -h + 3 ? '#c0b090' : '#9a8a70');
      R(rd(hw * 0.35), y, rd(hw * 0.65), 1, y < -h + 3 ? '#a89878' : '#7e6e58');
    }
    R(rd(-half * 0.5), rd(-h * 0.55), 6, 1, '#6a5a46'); R(rd(-half * 0.35), rd(-h * 0.55), 1, 4, '#6a5a46');
    R(rd(half * 0.3), rd(-h * 0.75), 1, 6, '#5a4a3a'); R(rd(-half * 0.85), -3, rd(half * 1.7), 3, '#6a5a46');
  }));
}
const SNIPE_ROCK = () => boulder(44, SNIPE.rock);
const AMB_BOULDER = () => boulder(66, AMB_ROCK.rock);

// barricade en travers de la piste : tonneaux, planches et un baril de poudre
function barricadeSprite() {
  return cached('barricade', () => pixelSprite(64, 40, 32, 36, (R) => {
    for (const x of [-27, 15]) {
      R(x, -18, 12, 18, '#8a5a34'); R(x, -18, 12, 1, '#a8784a'); R(x + 9, -18, 3, 18, '#6a4024');
      R(x, -15, 12, 1, '#4a4f58'); R(x, -5, 12, 1, '#4a4f58');
    }
    R(-30, -14, 60, 4, '#7a4a24'); R(-30, -14, 60, 1, '#9a6a3a'); R(-30, -8, 60, 3, '#6a4024');
    for (let k = 0; k < 18; k++) { R(-24 + k * 3, -3 - k, 3, 2, '#5a3418'); R(24 - k * 3, -3 - k, 3, 2, '#6a4024'); }
    R(-8, -28, 16, 18, '#a8302a'); R(-8, -28, 16, 1, '#c84a3a'); R(5, -28, 3, 18, '#7a2018');
    R(-8, -25, 16, 1, '#4a4f58'); R(-8, -14, 16, 1, '#4a4f58');
    R(-3, -22, 6, 5, '#e8d8a0'); R(-2, -21, 1, 1, OUT); R(1, -21, 1, 1, OUT); R(-1, -19, 2, 1, OUT); // tête de mort
    R(0, -32, 1, 4, '#e8d8a0'); // mèche
  }));
}

// cavalier qui galope droit sur nous (vue de face), sabots en (0, 0) ; kind : 'chaser', 'zigzag', 'thrower' ou 'boss'
function riderFront(look, frame, kind) {
  return cached(`rf${kind}${look}${frame}`, () => pixelSprite(52, 84, 26, 80, (R) => {
    const boss = kind === 'boss', zig = kind === 'zigzag';
    const L = boss ? BOSS_LOOK : zig ? ZIG_LOOK : LOOKS[look % LOOKS.length];
    const [coat, mane] = boss ? ['#2a2422', '#0e0a08'] : zig ? ['#d8a860', '#f4e6c8'] : HORSES[look % HORSES.length];
    const dark = S.shade(coat, -0.3), light = S.shade(coat, 0.18);
    const skin = SKIN[L.skin], hair = HAIR_COLORS[L.hair], cl = L.coat, clD = S.shade(cl, -0.3);
    const b = [0, -1, -2, -1][frame];
    const lift = [[0, 5], [2, 3], [5, 0], [3, 2]][frame];
    // jambes : les postérieures derrière, plus sombres ; les antérieures se lèvent tour à tour
    R(-10, -20 + b, 3, 16 - lift[1], S.shade(dark, -0.2)); R(7, -20 + b, 3, 16 - lift[0], S.shade(dark, -0.2));
    lift.forEach((up, i) => {
      const x = i ? 2 : -6;
      R(x, -22 + b, 4, 22 - up + b * -1 - 2, coat); R(x, -2 - up, 4, 2, '#2a1a10');
    });
    // le cavalier, derrière l'encolure
    R(-9, -58 + b, 18, 16, cl); R(-9, -58 + b, 18, 1, S.shade(cl, 0.15)); R(-9, -58 + b, 2, 16, clD);
    if (boss) for (let k = 0; k < 14; k++) R(-8 + k, -57 + b + k, 2, 1, '#c8a040'); // cartouchière
    R(-11, -56 + b, 3, 10, clD); R(-11, -46 + b, 3, 3, skin); // bras qui tient les rênes
    if (kind === 'thrower') { // bâton de dynamite brandi
      R(7, -72 + b, 3, 14, cl); R(7, -74 + b, 3, 3, skin);
      R(7, -80 + b, 3, 6, '#c0302a'); R(7, -78 + b, 3, 1, '#e8d8a0'); R(8, -82 + b, 1, 2, '#e8d8a0');
    } else { // revolver braqué sur nous
      R(7, -58 + b, 4, 6, cl); R(7, -53 + b, 4, 3, skin);
      R(7, -57 + b, 4, 4, '#3a3e46'); R(8, -56 + b, 2, 2, '#0a0808');
    }
    R(-4, -66 + b, 8, 8, skin); R(-4, -66 + b, 1, 4, hair); R(3, -66 + b, 1, 4, hair);
    R(-2, -63 + b, 1, 1, OUT); R(1, -63 + b, 1, 1, OUT);
    R(-4, -61 + b, 8, 3, L.band); R(-2, -58 + b, 4, 1, L.band); // foulard sur le nez
    const hc = L.hat, hb = S.shade(hc, -0.4);
    if (boss) { R(-11, -68 + b, 22, 2, hc); R(-5, -75 + b, 10, 7, hc); R(-5, -70 + b, 10, 1, '#c8a040'); }
    else if (zig) { // sombrero et poncho rayé
      R(-14, -68 + b, 28, 2, hc); R(-12, -69 + b, 24, 1, hc); R(-4, -75 + b, 8, 7, hc); R(-4, -70 + b, 8, 1, '#a8302a');
      for (let x = -9; x < 9; x += 4) R(x, -52 + b, 2, 8, '#f0d070');
    } else { R(-8, -67 + b, 16, 2, hc); R(-4, -71 + b, 8, 4, hc); R(-4, -68 + b, 8, 1, hb); R(-1, -72 + b, 2, 1, hc); }
    // le poitrail et la tête du cheval, qui vient vers nous
    R(-11, -36 + b, 22, 15, coat); R(-11, -36 + b, 22, 1, light); R(-11, -36 + b, 2, 15, dark); R(9, -36 + b, 2, 15, dark);
    R(-6, -44 + b, 12, 8, coat); R(-1, -46 + b, 2, 9, mane); // encolure, crinière
    R(-4, -48 + b, 8, 18, coat); R(-4, -48 + b, 1, 18, light); R(3, -48 + b, 1, 18, dark);
    R(-5, -51 + b, 2, 3, coat); R(3, -51 + b, 2, 3, coat); R(-2, -49 + b, 4, 2, mane); // oreilles, toupet
    if (!boss) R(-1, -46 + b, 2, 10, '#e8dcc8'); // liste blanche
    R(-5, -44 + b, 1, 2, OUT); R(4, -44 + b, 1, 2, OUT); // yeux
    R(-4, -38 + b, 8, 1, '#3a2214'); // muserolle
    R(-4, -33 + b, 8, 4, dark); R(-3, -31 + b, 2, 1, OUT); R(1, -31 + b, 2, 1, OUT); // naseaux
    if (boss) R(-3, -40 + b, 6, 1, '#c8a040');
  }));
}

// buste de bandit vu de face (embusqué derrière un rocher, ou qui escalade le hayon), base en (0, 0)
function bustSprite(look, pose) {
  return cached(`bust${look}${pose}`, () => {
    const L = LOOKS[look % LOOKS.length];
    const skin = SKIN[L.char.skin];
    const c = S.makeCanvas(S.CHAR_W, S.CHAR_H);
    const g = c.getContext('2d');
    g.drawImage(S.characterSprite(L.char), 0, 0);
    const R = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
    // foulard sur le nez
    R(13, 26, 22, 8, OUT); R(18, 33, 12, 3, OUT); R(21, 35, 6, 2, OUT);
    R(14, 27, 20, 6, L.band); R(19, 33, 10, 2, L.band); R(22, 35, 4, 1, L.band); R(14, 27, 20, 1, S.shade(L.band, 0.25));
    if (pose === 'aim') { // fusil braqué sur nous : le bout du canon entre les deux mains
      R(15, 41, 18, 9, OUT); R(16, 42, 5, 7, skin); R(27, 42, 5, 7, skin);
      R(20, 38, 8, 8, OUT); R(21, 39, 6, 6, '#5a5f68'); R(21, 39, 6, 1, '#9aa0a8'); R(23, 41, 2, 2, '#0a0808');
    } else { // il s'agrippe, couteau levé
      R(36, 10, 7, 30, OUT); R(37, 22, 5, 18, L.coat); R(37, 18, 5, 5, skin);
      R(38, 8, 3, 11, '#c8ccd4'); R(38, 8, 1, 11, '#f0f2f4');
    }
    c.ox = 24;
    c.oy = 56;
    return c;
  });
}

// cheval de l'attelage vu de dos (vue de l'intérieur, vers l'avant), sabots en (0, 0)
function horseRear(i, f) {
  return cached(`hr${i}${f}`, () => pixelSprite(40, 60, 20, 57, (R) => {
    const [coat, mane] = TEAM[i];
    const dark = S.shade(coat, -0.28), light = S.shade(coat, 0.16), strap = '#3a2214';
    const b = f % 2 ? -1 : 0, up = [[0, 3], [3, 0], [0, 3], [3, 0]][f];
    // jambes arrière, fines, jarret marqué, sabots qui se lèvent tour à tour
    for (const [x, u] of [[-8, up[0]], [5, up[1]]]) {
      R(x, -16 + b, 4, 8, dark); R(x + 1, -8 + b, 2, 7 - u, dark); R(x, -2 - u, 4, 2, '#2a1a10');
    }
    // encolure et tête, au loin au-dessus du dos ; collier
    R(-3, -50 + b, 6, 9, coat); R(-1, -51 + b, 2, 10, mane); R(-3, -54 + b, 2, 4, coat); R(1, -54 + b, 2, 4, coat);
    R(-6, -44 + b, 12, 4, '#5a3418'); R(-6, -44 + b, 12, 1, '#8a5a34'); R(-7, -45 + b, 2, 3, '#c8a040'); R(5, -45 + b, 2, 3, '#c8a040');
    R(-7, -41 + b, 14, 4, coat); // garrot
    // croupe ronde
    for (let y = -38; y <= -13; y++) {
      const hw = Math.round(12.5 * Math.sqrt(Math.max(0, 1 - ((y + 25) / 13.5) ** 2)));
      R(-hw, y + b, hw * 2, 1, coat);
      if (y < -30) { R(-hw + 2, y + b, Math.max(1, hw - 4), 1, light); R(2, y + b, Math.max(1, hw - 4), 1, light); }
      R(hw - 2, y + b, 2, 1, dark);
    }
    R(0, -37 + b, 1, 22, dark); // la raie de la croupe
    R(-12, -23 + b, 24, 1, strap); R(-9, -37 + b, 1, 14, strap); R(8, -37 + b, 1, 14, strap); // avaloire, barres de fesse
    R(-13, -29 + b, 2, 1, strap); R(11, -29 + b, 2, 1, strap); // traits vers la roulotte
    const tx = [0, 1, 0, -1][f];
    R(-1, -37 + b, 3, 6, mane); R(-1 + tx, -31 + b, 3, 10, mane); R(-1 + tx * 2, -21 + b, 3, 5, mane); R(tx * 2, -16 + b, 2, 2, mane); // queue
  }));
}

// icônes des bonus, centrées
function bonusIcon(type) {
  return cached(`bonus${type}`, () => pixelSprite(19, 19, 9, 9, (R, g) => {
    S.disc(g, 9, 9, 8, '#f8d070'); S.disc(g, 9, 9, 7, '#5a3418'); S.disc(g, 9, 9, 6, '#3a2214');
    switch (type) {
      case 'gold':
        S.disc(g, 9, 9, 4, '#f8d070');
        for (const [x, y] of [[0, -3], [3, -1], [3, 2], [0, 3], [-3, 2], [-3, -1]]) R(x, y, 1, 1, '#a06a20');
        R(0, 0, 1, 1, '#fff8d0');
        break;
      case 'shotgun':
        R(-5, -3, 10, 1, '#e0e4ea'); R(-5, -2, 10, 1, '#8a8f98'); R(-5, -1, 10, 1, '#e0e4ea'); R(-5, 0, 10, 1, '#8a8f98');
        R(-5, 1, 4, 3, '#c08850'); R(-1, 1, 2, 1, '#5a5f68');
        break;
      case 'x2':
        for (const [x, y] of [[-5, -2], [-3, -2], [-4, -1], [-5, 0], [-3, 0]]) R(x, y, 1, 1, '#f8d070');
        R(0, -3, 4, 1, '#f8d070'); R(3, -2, 1, 2, '#f8d070'); R(0, 0, 4, 1, '#f8d070'); R(0, 1, 1, 2, '#f8d070'); R(0, 3, 4, 1, '#f8d070');
        break;
      case 'repair':
        R(-5, -4, 10, 3, '#d8a868'); R(-5, 0, 10, 3, '#b07840'); R(-4, -3, 1, 1, '#5a5f68'); R(3, 1, 1, 1, '#5a5f68');
        R(-2, 4, 5, 1, '#9aa0a8');
        break;
      case 'tnt':
        for (const x of [-4, -1, 2]) R(x, -3, 2, 7, '#e04030');
        R(-4, 0, 8, 1, '#2a1a10'); R(0, -5, 1, 2, '#e8d8a0'); R(1, -6, 1, 1, '#fff070');
        break;
    }
  }));
}

// ------------------------------------------------------------ décor (dessiné une fois)
const SKIES = new Map();
function skyFor(env) {
  let sky = SKIES.get(env.id);
  if (sky) return sky;
  sky = S.makeCanvas(W, HORIZON);
  const g = sky.getContext('2d');
  const cols = env.sky || ['#5a8ac8', '#6a98d0', '#7ea6d6', '#94b4d8', '#aec2d4', '#c8d0c8', '#e0d8b8'];
  const bh = HORIZON / cols.length;
  cols.forEach((c, i) => {
    g.fillStyle = c;
    g.fillRect(0, Math.round(i * bh), W, Math.ceil(bh) + 1);
    if (i) { g.fillStyle = cols[i - 1]; for (let x = i % 2; x < W; x += 2) g.fillRect(x, Math.round(i * bh), 1, 1); }
  });
  if (env.sky) skyDeco(env, 0.22, 0.3)(g, 0, 0, W, HORIZON);
  else { S.disc(g, 84, 26, 10, '#fbecc4'); S.disc(g, 84, 26, 9, '#fdf6e0'); }
  SKIES.set(env.id, sky);
  return sky;
}

// la caisse et la bâche de la roulotte (dessinées tournées vers la gauche, affichées en miroir), base au sol en (0, 0)
function wagonSprite() {
  return cached('wagon', () => pixelSprite(160, 92, 80, 88, (R) => {
    R(-74, -20, 26, 2, '#5a3a20'); R(-76, -22, 3, 6, '#5a3a20'); // timon
    R(-52, -32, 104, 14, '#7a4a24'); R(-52, -32, 104, 2, '#9a6a3a'); R(-52, -25, 104, 1, '#5a3418'); R(-52, -19, 104, 1, '#5a3418');
    for (let i = 0; i <= 92; i++) {
      const h = Math.round(36 * Math.sin((Math.PI * i) / 92) ** 0.55);
      R(-46 + i, -32 - h, 1, h, i % 18 < 2 ? '#c8bca0' : (i % 18 < 9 ? '#ece2c8' : '#e4d8bc'));
    }
    R(-47, -54, 5, 22, '#3a2a1a'); R(-46, -56, 3, 2, '#3a2a1a'); // ouverture de la bâche
    R(18, -30, 10, 12, '#8a5a34'); R(18, -27, 10, 1, '#4a4f58'); R(18, -22, 10, 1, '#4a4f58'); // tonneau d'eau
    R(-28, -46, 14, 1, '#c8bca0'); R(4, -50, 18, 1, '#c8bca0'); // cordages
    R(-52, -18, 104, 3, '#5a3418'); // essieux
  }));
}

// roue qui tourne (ang en radians)
function wheel(ctx, cx, cy, r, ang) {
  S.disc(ctx, cx, cy, r + 1, OUT);
  S.disc(ctx, cx, cy, r, '#6a4024');
  S.disc(ctx, cx, cy, r - 2, '#c08850');
  ctx.fillStyle = '#6a4024';
  for (let k = 0; k < 6; k++) {
    const a = ang + (k * Math.PI) / 3;
    for (let d = 2; d < r - 1; d++) ctx.fillRect(Math.round(cx + Math.cos(a) * d), Math.round(cy + Math.sin(a) * d), 1, 1);
  }
  ctx.fillStyle = OUT; ctx.fillRect(cx - 3, cy - 3, 7, 7);
  ctx.fillStyle = '#4a4f58'; ctx.fillRect(cx - 2, cy - 2, 5, 5);
}

// ---------- vue de l'intérieur
// Couleurs du sol ligne par ligne (elles se fondent dans la brume près de l'horizon) : sable, piste, ornières
function groundPal(canyon) {
  return cached(`pal${canyon}`, () => {
    const sand = canyon ? ['#b07a52', '#a67048'] : ['#c4a868', '#b89c5e'];
    const trail = canyon ? ['#c8946a', '#be8a60'] : ['#dcc08a', '#d0b47e'];
    const rut = canyon ? '#8a5a3a' : '#a88250', haze = canyon ? '#d8a888' : '#e0d0a8';
    const P = { sand: [], trail: [], rut: [] };
    for (let y = IN.hz + 1; y < H; y++) {
      const s = (y - IN.hz) / IN.camH, d = IN.depth * (1 / s - 1);
      const f = Math.min(1, (d / IN.far) ** 0.6) * 0.85;
      P.sand.push(sand.map((c) => S.mix(c, haze, f)));
      P.trail.push(trail.map((c) => S.mix(c, haze, f)));
      P.rut.push(S.mix(rut, haze, f));
    }
    return P;
  });
}

// mesas sur l'horizon (différentes devant et derrière)
function horizonStrip(face, canyon) {
  return cached(`hz${face}${canyon}`, () => {
    const c = S.makeCanvas(W, 34);
    const g = c.getContext('2d');
    const o = face > 0 ? 0.13 : 0.61;
    for (let x = 0; x < W; x++) {
      const u = x / W;
      const mesa = tri(u * 1.6 + o) > 0.72 ? 13 + 3 * tri(u * 9) ** 4 : 0;
      const h = rd(3 + mesa + 7 * tri(u * 2.3 + o * 3) ** 2 + 2 * tri(u * 11) + (canyon ? 10 : 0));
      g.fillStyle = canyon ? '#8a4a34' : '#a8746a'; g.fillRect(x, 34 - h, 1, h);
      g.fillStyle = canyon ? '#a85a3e' : '#c08a78'; g.fillRect(x, 34 - h, 1, 1);
    }
    return c;
  });
}

// l'intérieur de la roulotte autour de l'ouverture de la bâche (face 1 : l'avant et le siège du cocher,
// -1 : l'arrière et le hayon). L'ouverture est transparente.
const ARCH = { cy: 112, hw: 164, top: 14 };
const archHalf = (y, off = 0) => {
  const hw = ARCH.hw + off, top = ARCH.top - off;
  if (y >= ARCH.cy) return hw;
  const k = (ARCH.cy - y) / (ARCH.cy - top);
  return k >= 1 ? -1 : hw * Math.sqrt(1 - k * k);
};
function interior(face) {
  return cached(`int${face}`, () => {
    const c = S.makeCanvas(W, H);
    const g = c.getContext('2d');
    const R = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(rd(x), rd(y), rd(w), rd(h)); };
    const cx = W / 2;
    // la bâche vue du dedans, plus sombre vers les bords
    R(0, 0, W, H, '#cdbd96');
    for (let x = 0; x < W; x += 24) R(x, 0, 1, H, '#b8a882'); // coutures
    for (let x = 0; x < W; x++) {
      const e = Math.min(x, W - 1 - x);
      if (e < 60) { g.fillStyle = `rgba(50,32,16,${((60 - e) / 60) * 0.45})`; g.fillRect(x, 0, 1, H); }
    }
    g.fillStyle = 'rgba(50,32,16,0.25)'; g.fillRect(0, 0, W, 10);
    // les arceaux de bois, parallèles à l'ouverture
    for (const [off, wd] of [[10, 5], [46, 6]]) {
      let prev = null;
      for (let y = 0; y < H; y++) {
        const h = archHalf(y, off);
        if (h < 0) continue;
        for (const s of [-1, 1]) {
          const x = cx + s * h, px = prev == null ? x : cx + s * prev;
          const a = Math.min(x, px) - (s < 0 ? wd : 0), b = Math.max(x, px) + (s > 0 ? wd : 0);
          R(a, y, b - a, 1, '#6a4a2a');
          R(s < 0 ? a : b - 1, y, 1, 1, '#4a3018');
        }
        prev = h;
      }
    }
    // l'ouverture, bordée par la bâche froncée
    let prev = null;
    for (let y = 0; y < H; y++) {
      const h = archHalf(y);
      if (h < 0) continue;
      for (const s of [-1, 1]) {
        const x = cx + s * h, px = prev == null ? x : cx + s * prev;
        const a = Math.min(x, px) - 3, b = Math.max(x, px) + 3;
        R(a, y, b - a, 1, (y >> 2) % 2 ? '#9a8a64' : '#a8986e');
      }
      prev = h;
    }
    for (let y = 0; y < H; y++) {
      const h = archHalf(y);
      if (h > 0) g.clearRect(rd(cx - h), y, rd(2 * h), 1);
    }
    if (face > 0) {
      // le siège du cocher et le garde-pieds
      R(0, 194, W, 22, '#6a4024'); R(0, 194, W, 2, '#9a6a3a'); R(0, 203, W, 1, '#4a2a14'); R(0, 210, W, 1, '#4a2a14');
      for (let x = 30; x < W; x += 54) R(x, 196, 2, 20, '#4a2a14');
      R(cx - 70, 188, 140, 7, '#7a4a24'); R(cx - 70, 188, 140, 1, '#a8784a'); // planche du garde-pieds
      R(cx - 40, 204, 18, 12, '#3a2a1a'); R(cx + 26, 205, 14, 11, '#3a2a1a'); // bottes du cocher
    } else {
      // le hayon, ses chaînes, des caisses et un sac dans la roulotte
      R(0, 186, W, 30, '#7a4a24'); R(0, 186, W, 2, '#a8784a');
      for (const y of [194, 202, 210]) R(0, y, W, 1, '#5a3418');
      for (const x of [40, W - 42]) { R(x, 188, 3, 28, '#5a3418'); R(x - 1, 190, 5, 3, '#4a4f58'); R(x - 1, 206, 5, 3, '#4a4f58'); }
      for (const s of [-1, 1]) for (let k = 0; k < 14; k++) R(cx + s * (ARCH.hw - 4 - k * 0.6), 122 + k * 4.6, 3, 2, k % 2 ? '#4a4f58' : '#6a707a');
      R(0, 150, 30, 40, '#8a5a34'); R(0, 150, 30, 2, '#a8784a'); R(0, 168, 30, 1, '#5a3418'); R(14, 150, 1, 40, '#5a3418');
      R(W - 36, 160, 36, 30, '#d8c8a0'); R(W - 36, 160, 36, 2, '#e8dcbc'); R(W - 22, 158, 6, 4, '#a8986e');
    }
    return c;
  });
}

// ------------------------------------------------------------ scène
export class WagonScene extends MiniScene {
  constructor(canvas, hooks) {
    super(canvas, hooks);
    this.kind = 'wagon';
    this.showEnv = true;
    this.cv.style.cursor = 'none';
    this.world = null;
    this.ammo = WAGON.ammo;
    this.reloadUntil = 0;
    this.face = 1;
    this.sway = { x: 0, y: 0 }; // tangage du paysage vu de la roulotte (il décale aussi la visée)
  }

  title() { return 'DÉFENDS LA ROULOTTE'; }
  help() {
    return [
      `DE ${WAGON.from} À ${WAGON.to}, PROTÈGE LA ROULOTTE !`,
      this.touch ? 'TOUCHE L\'ÉCRAN : TIRER - BOUTON : RECHARGER' : 'CLIC : TIRER - R OU CLIC DROIT : RECHARGER',
      this.touch ? 'DANS LA ROULOTTE : BOUTON DU BAS POUR TE RETOURNER' : 'DANS LA ROULOTTE : ESPACE POUR TE RETOURNER',
      'BANDITS DORÉS : ILS LÂCHENT UN BONUS, TIRE DESSUS !',
      'SÉRIE DE TIRS AU BUT : x3 - EN PLEINE TÊTE : x1,5',
    ];
  }
  goText() { return 'À VOS FUSILS !'; }

  setup(seed) {
    this.world = wagonWorld(seed, this.n);
    this.dyns = this.world.targets.filter((b) => b.kind === 'dyn' || b.kind === 'thrower');
    this.boss = this.world.targets.find((b) => b.kind === 'boss');
    this.dead = new Map(); // id -> { by, at (horloge de l'hôte), seen (horloge locale) }
    this.mine = new Map(); // tirs prometteurs pas encore confirmés : id -> heure locale
    this.hp = new Map();
    this.dynState = new Map(); // `${id}:${k}` -> 'shot' | 'boom'
    this.picked = new Map(); // bonus ramassés : id du porteur -> joueur
    this.pickTry = new Map(); // bonus visés, pas encore confirmés : id -> heure locale
    this.booms = [];
    this.hitFx = [];
    this.shotFx = []; // éclairs des coups de feu des bandits
    this.ammo = WAGON.ammo;
    this.reloadUntil = 0;
    this.shots = 0;
    this.kills = 0;
    this.streak = 0;
    this.mult = 1;
    this.buff = null; // { type, until } : bonus personnel en cours
    this.x2Until = 0;
    this.wagonFlash = -1e9;
    this.hurtAt = -1e9;
    this.tntAt = -1e9;
    this.firedAt = -1e9;
    this.banner = null;
    this.stopAt = null; // la roulotte s'arrête si elle tombe
    this.face = 1; // dans la roulotte : 1 vers l'avant, -1 vers l'arrière
    this.turnAt = -1e9;
    this.turned = false; // s'est déjà retourné pendant cette étape
    this.stageI = -1;
    this.cueT = 0; // apparitions déjà annoncées (sons, alertes)
    this.alertAt = -1e9;
    this.remote = {};
    for (let i = 0; i < this.n; i++) if (i !== this.me) this.remote[i] = { x: W / 2, y: H / 2, tx: W / 2, ty: H / 2, shot: -1e9, f: 0 };
    // sprites préparés pendant le compte à rebours, quelques-uns par image
    this.warmQueue = [...trailWarm(), () => flipped(wagonSprite()), SNIPE_ROCK, AMB_BOULDER, barricadeSprite, () => interior(1), () => interior(-1),
      () => groundPal(false), () => groundPal(true), () => horizonStrip(1, false), () => horizonStrip(-1, false), () => horizonStrip(1, true), () => horizonStrip(-1, true)];
    for (const [coat, mane] of TEAM) for (let f = 0; f < 4; f++) this.warmQueue.push(() => horseSprite(coat, mane, f, null));
    for (let f = 0; f < 4; f++) this.warmQueue.push(() => muleSprite(f), () => horseRear(0, f), () => horseRear(1, f), () => riderFront(0, f, 'boss'), () => riderFront(0, f, 'zigzag'));
    for (const k of Object.keys(BONUS)) this.warmQueue.push(() => bonusIcon(k));
    for (let l = 0; l < BANDIT_LOOKS; l++) {
      for (let f = 0; f < 4; f++) {
        this.warmQueue.push(() => riderSprite(l, f), () => banditSprite(l, 'walker', 'walk', f), () => banditSprite(l, 'brute', 'walk', f));
        this.warmQueue.push(() => riderFront(l, f, 'chaser'), () => riderFront(l, f, 'thrower'));
      }
      this.warmQueue.push(() => banditSprite(l, 'walker', 'strike', 0), () => banditSprite(l, 'walker', 'strike', 1), () => banditSprite(l, 'brute', 'strike', 0), () => banditSprite(l, 'brute', 'strike', 1));
      this.warmQueue.push(() => flipped(banditSprite(l, 'walker', 'aim', 0)), () => bustSprite(l, 'aim'), () => bustSprite(l, 'grab'));
    }
  }

  applySync(st) {
    for (const [id, d] of st.dead || []) this.dead.set(id, { ...d, seen: -1e9 });
    for (const [id, hp] of st.hp || []) this.hp.set(id, hp);
    for (const [key, v] of st.dyn || []) this.dynState.set(key, v);
    for (const [id, by] of st.picked || []) this.picked.set(id, by);
  }

  get wagonHp() { return this.state?.wagonHp ?? WAGON.hp; }

  // ---------------------------------------------------------- étapes et vues
  // 'side' (de côté) ou 'in' (dans la roulotte). L'arrivée (ou la chute de la roulotte) se voit de côté.
  viewAt(t) {
    if (t < 0 || t >= this.duration) return 'side';
    if (this.stopAt != null && t >= this.stopAt + 1500) return 'side';
    return stageAt(t).view;
  }
  get inView() { return this.viewAt(this.t) === 'in'; }
  // 0 : de côté ; 1 / -1 : dans la roulotte, vers l'avant / l'arrière
  viewKey(t) { return this.viewAt(t) === 'in' ? this.face : 0; }

  // fondu au noir autour des changements de vue
  wipeA(t) {
    const cuts = STAGES.slice(1).map((s) => s.t0);
    cuts.push(this.duration);
    if (this.stopAt != null && stageAt(this.stopAt).view === 'in') cuts.push(this.stopAt + 1500);
    let a = 0;
    for (const c of cuts) if (Math.abs(t - c) < WAGON.wipe && (this.stopAt == null || c <= this.stopAt + 1500)) a = Math.max(a, 1 - Math.abs(t - c) / WAGON.wipe);
    return a;
  }

  turnK(t) { return clamp((t - this.turnAt) / WAGON.turn, 0, 1); }
  turning(t) { return this.turnK(t) < 1; }

  turn() {
    const t = this.t;
    if (!this.playing || !this.inView || this.turning(t)) return;
    this.face = -this.face;
    this.turnAt = t;
    this.turned = true;
    sfx('rope');
    this.sendLive({ c: [Math.round(this.mouse.x), Math.round(this.mouse.y)], f: this.face }, true);
  }

  buffOn(type, t) { return this.buff && this.buff.type === type && t < this.buff.until; }

  // ---------------------------------------------------------- entrées
  onMove(m) {
    if (this.t0 != null) this.sendLive({ c: [Math.round(m.x), Math.round(m.y)], f: this.viewKey(this.t) });
  }

  onAlt() { this.reload(); }
  onKey(k) {
    if (this.inView && (k === ' ' || k === 'e' || k === 's' || k === 'arrowdown')) this.turn();
    else if (k === 'r' || k === ' ') this.reload();
  }

  reload() {
    if (!this.playing || this.ammo === WAGON.ammo || this.reloadUntil || this.buffOn('gold', this.t)) return;
    this.reloadUntil = this.t + WAGON.reload;
    sfx('reload');
  }

  isDown(id, t) {
    if (this.dead.has(id)) return true;
    const m = this.mine.get(id);
    return m != null && t - m < 1500;
  }

  inTurnBtn(m) {
    const b = TURN_BTN;
    return m.x >= b.x - 4 && m.x <= b.x + b.w + 4 && m.y >= b.y - 4;
  }

  onFire(m) {
    if (!this.playing) return;
    const t = this.t, v = this.viewKey(t);
    if (v && this.inTurnBtn(m)) { this.turn(); return; }
    if (this.wipeA(t) > 0.5 || (v && this.turning(t))) return;
    if (!this.buffOn('gold', t)) {
      if (this.reloadUntil) { sfx('dry'); return; }
      if (this.ammo <= 0) { sfx('dry'); this.reload(); return; }
      this.ammo--;
    }
    this.shots++;
    this.firedAt = this.now;
    sfx(this.buffOn('shotgun', t) ? 'gunshot' : 'revolver');
    this.shake = 2;
    this.sendLive({ c: [Math.round(m.x), Math.round(m.y)], s: 1, f: v }, true);
    // dans la roulotte, le paysage tangue un peu : on vise dans le paysage
    if (v) m = { x: m.x - this.sway.x, y: m.y - this.sway.y };
    const r = this.buffOn('shotgun', t) ? SHOT_R : 0;
    const hits = this.aimAt(m, t, v, r);
    if (!hits.length) {
      this.puff(m.x, m.y, '#d8c8a8', 4, v);
      if (this.streak) { this.streak = 0; this.mult = this.x2Until > t ? 2 : 1; this.hooks.send({ kind: 'miss' }); }
      return;
    }
    for (const h of hits) {
      if (h.dyn) {
        this.dynState.set(h.dyn.key, 'shot');
        this.puff(h.dyn.x, h.dyn.y, '#e8d8a0', 8, v);
        this.hooks.send({ kind: 'hit', id: h.dyn.id, k: h.dyn.k });
      } else if (h.pick) {
        this.pickTry.set(h.pick.id, t);
        this.puff(h.pick.x, h.pick.y, '#f8d070', 8, v);
        this.hooks.send({ kind: 'pick', id: h.pick.id });
      } else {
        const b = h.b;
        if ((this.hp.get(b.id) ?? b.hp) <= 1) this.mine.set(b.id, t);
        const head = inRectPt(m, headBox(b, t)); // en pleine tête : 2 dégâts, points x1,5
        if (head && (this.hp.get(b.id) ?? b.hp) <= 2) this.mine.set(b.id, t);
        this.puff(r ? h.box.x + h.box.w / 2 : m.x, r ? h.box.y + h.box.h / 2 : m.y, '#c0392b', head ? 9 : 5, v);
        this.hooks.send(head ? { kind: 'hit', id: b.id, head: 1 } : { kind: 'hit', id: b.id });
      }
    }
  }

  // ce que touche un tir en m (r > 0 : tir groupé, jusqu'à 4 cibles) : dynamite en vol, bonus, puis bandits
  aimAt(m, t, v, r) {
    const out = [];
    const near = (x, y, rad) => Math.hypot(x - m.x, y - m.y) <= rad + r;
    const inBoxR = (b) => {
      const dx = Math.max(b.x - 1 - m.x, 0, m.x - b.x - b.w - 1), dy = Math.max(b.y - 1 - m.y, 0, m.y - b.y - b.h - 1);
      return Math.hypot(dx, dy) <= r;
    };
    for (const d of this.flying(t, v)) if (near(d.x, d.y, 7 * Math.max(1, 2 * d.s))) out.push({ dyn: d });
    for (const p of this.pickups(t, v)) if (near(p.x, p.y, 8 * p.k + 3)) out.push({ pick: p });
    const live = [];
    for (const b of this.world.targets) {
      if (b.t0 > t) break;
      if (faceOf(b) !== v || !active(b, t) || this.isDown(b.id, t)) continue;
      const box = targetBox(b, t);
      if (box && inBoxR(box)) live.push({ b, box, z: v ? inPos(b, t).d : -anchor(b, t).y });
    }
    live.sort((a, b) => a.z - b.z); // le plus proche d'abord
    out.push(...live);
    return out.slice(0, r ? 4 : 1);
  }

  remoteLive(i, d) {
    const r = this.remote[i];
    if (!r || !Array.isArray(d.c)) return;
    r.tx = d.c[0];
    r.ty = d.c[1];
    if (d.f != null) r.f = d.f;
    if (d.s) { r.shot = this.t; sfx('far'); }
  }

  // bâtons de dynamite en l'air, dans la vue v
  flying(t, v) {
    const out = [];
    for (const b of this.dyns) {
      if (t < b.reach || faceOf(b) !== v) continue;
      const dd = this.dead.get(b.id);
      for (const th of dynThrows(b, dd ? dd.at : Infinity, t + 1)) {
        const key = `${b.id}:${th.k}`;
        if (this.dynState.has(key) || t > th.at + WAGON.fly) continue;
        out.push({ key, id: b.id, k: th.k, at: th.at, b, ...dynPos(b, th.k, th.at, t) });
      }
    }
    return out;
  }

  // bonus qui flottent, dans la vue v ; k : échelle de l'icône
  pickups(t, v) {
    const out = [];
    for (const [id, d] of this.dead) {
      const b = this.world.targets[id];
      if (!b.bonus || d.by < 0 || faceOf(b) !== v || this.picked.has(id)) continue;
      const tr = this.pickTry.get(id);
      if (tr != null && t - tr < 1200) continue;
      const p = bonusPos(b, d.at, t);
      if (p) out.push({ id, b, x: p.x, y: p.y, k: v ? Math.max(1, rd(2 * p.s)) : 1, el: t - d.at });
    }
    return out;
  }

  // ---------------------------------------------------------- événements de l'hôte
  // où afficher un texte au-dessus d'un assaillant (null s'il n'est pas dans la vue)
  spot(b, t) {
    if (faceOf(b) !== this.viewKey(t)) return null;
    const r = targetBox(b, t);
    if (r) return { x: r.x + r.w / 2, y: r.y - 4 };
    if (b.view === 'side') { const a = anchor(b, t); return { x: a.x, y: a.y - 40 }; }
    const p = inPos(b, t), g = inProj(p.lx, Math.max(4, p.d));
    return { x: g.x, y: g.y - 60 * g.s };
  }

  onEvent(ev) {
    const t = this.t;
    if (ev.type === 'hit') {
      const b = this.world.targets[ev.id];
      const sp = this.spot(b, t);
      this.hp.set(ev.id, ev.hp);
      if (ev.kill) {
        this.dead.set(ev.id, { by: ev.by, at: ev.at, seen: this.mine.get(ev.id) ?? t });
        if (ev.by === this.me) this.kills++;
        if (b.bonus && sp) { this.popup(sp.x, sp.y - 10, 'BONUS !', '#f8d070'); sfx('ding'); }
      } else this.hitFx.push({ id: ev.id, at: t });
      this.mine.delete(ev.id);
      const big = b.kind === 'boss' && ev.kill;
      if (sp) this.popup(sp.x, sp.y, `+${ev.pts}`, this.color(ev.by), big);
      if (ev.why && ev.kill && sp) this.booms.push({ x: sp.x, y: sp.y + 20, at: t, small: true, v: faceOf(b) });
      if (ev.by === this.me) {
        if (!ev.why) sfx(big ? 'victory' : 'coin');
        if (ev.head && sp) { this.popup(sp.x, sp.y - 12, 'EN PLEINE TÊTE !', '#fff2b0'); sfx('ding'); }
        this.setStreak(ev.streak, t);
      }
      if (big) { this.banner = { text: 'BLACK BART EST TOMBÉ !', sub: 'EL DIABLO VA L\'APPRENDRE…', col: '#f8d070', at: t }; this.shake = 6; }
    } else if (ev.type === 'dynHit') {
      this.dynState.set(`${ev.id}:${ev.k}`, 'shot');
      const b = this.world.targets[ev.id];
      const th = dynThrows(b).find((x) => x.k === ev.k);
      if (th && faceOf(b) === this.viewKey(t)) {
        const p = dynPos(b, ev.k, th.at, t);
        this.popup(p.x, p.y - 8, `+${ev.pts}`, this.color(ev.by));
        this.booms.push({ x: p.x, y: p.y, at: t, small: true, v: faceOf(b) });
      }
      sfx(ev.by === this.me ? 'coin' : 'far');
      if (ev.by === this.me) this.setStreak(ev.streak, t);
    } else if (ev.type === 'boom') {
      this.dynState.set(`${ev.id}:${ev.k}`, 'boom');
      const b = this.world.targets[ev.id];
      const th = dynThrows(b).find((x) => x.k === ev.k);
      sfx('boom');
      this.shake = 7;
      if (b.view === 'in') { this.hurt(t, ev.dmg); if (th && b.end === this.viewKey(t)) { const p = dynPos(b, ev.k, th.at, th.at + WAGON.fly); this.booms.push({ x: p.x, y: p.y, at: t, v: b.end }); } return; }
      const p = th ? dynPos(b, ev.k, th.at, th.at + WAGON.fly) : { x: WAGON.x, y: WAGON.base - 34 };
      this.booms.push({ x: p.x, y: p.y, at: t, v: 0 });
      this.wagonHit(t, p.x, p.y, ev.dmg);
    } else if (ev.type === 'atk') {
      const b = this.world.targets[ev.id];
      this.shotFx.push({ id: ev.id, at: t });
      if (b.view === 'in') { this.hurt(t, ev.dmg); sfx('far'); return; }
      const a = anchor(b, t);
      if (b.kind === 'sniper') { sfx('rifle'); this.wagonHit(t, WAGON.x - 30 + (ev.id * 23) % 60, WAGON.base - 50, ev.dmg); return; }
      const x = climbK(b, t) ? a.x : WAGON.x + b.side * ((b.side > 0 ? WAGON.front : WAGON.half) - 12);
      this.wagonHit(t, x, climbK(b, t) ? a.y - 4 : b.y - 22, ev.dmg);
      sfx('thud');
      this.shake = Math.max(this.shake, 3);
    } else if (ev.type === 'crash') { // la mule ou la barricade : un gros coup, une seule fois
      const b = this.world.targets[ev.id];
      this.dead.set(ev.id, { by: -1, at: ev.at, seen: t });
      sfx('boom');
      this.shake = 10;
      if (b.view === 'in') {
        this.hurt(t, ev.dmg);
        if (this.viewKey(t) === 1) { const p = inPos(b, t), g = inProj(p.lx, Math.max(30, p.d)); this.booms.push({ x: g.x, y: g.y - 20 * g.s, at: t, v: 1 }); }
        this.banner = { text: 'LA BARRICADE ! AÏE !', col: '#f0705a', at: t };
        return;
      }
      const a = anchor(b, t);
      this.booms.push({ x: a.x, y: a.y - 14, at: t, v: 0 });
      this.wagonHit(t, a.x, a.y - 24, ev.dmg);
    } else if (ev.type === 'blast') {
      this.booms.push({ x: ev.x, y: ev.y - 14, at: t, v: 0, big: true });
      sfx('boom');
      this.shake = 9;
    } else if (ev.type === 'pick') {
      this.picked.set(ev.id, ev.by);
      this.pickTry.delete(ev.id);
      const bo = BONUS[ev.bonus];
      const mine = ev.by === this.me;
      if (mine) {
        sfx('power');
        if (bo.buff) this.buff = { type: ev.bonus, until: ev.until };
        if (ev.bonus === 'x2') { this.x2Until = ev.until; this.mult = Math.max(this.mult, 2); }
        if (ev.bonus === 'gold') { this.reloadUntil = 0; this.ammo = WAGON.ammo; }
      } else sfx('ding');
      this.banner = { text: `${mine ? '' : `${this.name(ev.by).toUpperCase()} : `}${bo.name}`, sub: bo.desc, col: mine ? '#f8d070' : this.color(ev.by), at: t, short: true };
      if (ev.bonus === 'repair') { sfx('good'); this.popup(this.viewKey(t) ? W / 2 : WAGON.x, this.viewKey(t) ? 150 : WAGON.base - 76, `+${WAGON.repair}`, '#b8e070', true); }
      if (ev.bonus === 'tnt') { this.tntAt = t; sfx('boom'); this.shake = 12; }
    } else if (ev.type === 'matchEnd') {
      this.banner = ev.result === 'saved'
        ? { text: `ARRIVÉE À ${WAGON.to} ! +${ev.bonus}`, col: '#b8e070', at: t, stay: true }
        : { text: 'LA ROULOTTE EST TOMBÉE…', col: '#f0705a', at: t, stay: true };
      if (ev.result === 'lost') { sfx('boom'); this.shake = 10; this.stopAt = Math.min(t, this.duration); }
    } else if (ev.type === 'left') {
      const r = this.remote[ev.who];
      if (r) r.left = true;
    }
  }

  // série de tirs au but : le multiplicateur monte d'un cran toutes les WAGON.combo balles
  setStreak(n, t) {
    const x2 = this.x2Until > t ? 2 : 1;
    const m = (1 + Math.min(4, Math.floor(n / WAGON.combo)) * 0.5) * x2;
    if (m > this.mult && n % WAGON.combo === 0 && n) { this.popup(this.mouse.x, this.mouse.y - 14, `SÉRIE x${m / x2} !`, '#f8d070'); sfx('good'); }
    this.streak = n;
    this.mult = m;
  }

  wagonHit(t, x, y, dmg) {
    this.wagonFlash = t;
    this.popup(x, y - 6, `-${dmg}`, '#f0705a');
    for (let i = 0; i < 6; i++) this.parts.push({ x, y, vx: (Math.random() - 0.5) * 0.12, vy: -Math.random() * 0.12, g: 0.0004, col: i % 2 ? '#ece2c8' : '#8a5a34', t: 0, max: 500, v: 0 });
  }

  // la roulotte encaisse, vue de l'intérieur : l'écran rougit, la bâche tremble
  hurt(t, dmg) {
    this.hurtAt = t;
    this.wagonFlash = t;
    this.popup(W / 2, 150, `-${dmg}`, '#f0705a', dmg > 2);
    this.shake = Math.max(this.shake, 4);
    if (dmg <= 2) sfx('thud');
  }

  puff(x, y, col, n, v = 0) {
    for (let i = 0; i < n; i++) this.parts.push({ x, y, vx: (Math.random() - 0.5) * 0.12, vy: -Math.random() * 0.1, g: 0.0004, col, t: 0, max: 300 + Math.random() * 200, v });
  }

  // ---------------------------------------------------------- simulation
  update(dt) {
    const q = this.warmQueue;
    if (q?.length) { const a = performance.now(); while (q.length && performance.now() - a < 4) q.shift()(); }
    if (!this.world) return;
    const t = this.t;
    if (this.reloadUntil && t >= this.reloadUntil) { this.reloadUntil = 0; this.ammo = WAGON.ammo; }
    if (this.buff && t >= this.buff.until) {
      if (this.buff.type === 'gold') this.ammo = WAGON.ammo;
      this.buff = null;
    }
    if (this.x2Until && t >= this.x2Until) { this.x2Until = 0; this.mult = 1 + Math.min(4, Math.floor(this.streak / WAGON.combo)) * 0.5; }
    // nouvelle étape : on regarde devant
    const st = stageAt(Math.max(0, t));
    if (st.i !== this.stageI) {
      this.stageI = st.i;
      this.face = 1;
      this.turnAt = -1e9;
      this.turned = false;
    }
    this.cues(t);
    for (const r of Object.values(this.remote)) {
      const k = Math.min(1, dt * 0.015);
      r.x += (r.tx - r.x) * k;
      r.y += (r.ty - r.y) * k;
    }
    for (const p of this.parts) { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += (p.g || 0) * dt; }
    this.parts = this.parts.filter((p) => p.t < p.max);
    this.booms = this.booms.filter((b) => t - b.at < 700);
    this.hitFx = this.hitFx.filter((h) => t - h.at < 150);
    this.shotFx = this.shotFx.filter((h) => t - h.at < 160);
    if (this.viewAt(t) !== 'side') return;
    // poussière soulevée par les roues et les sabots tant que le convoi roule
    this.dustT = (this.dustT || 0) + dt;
    if (this.rolling(t) && this.dustT > 60) {
      this.dustT = 0;
      for (const x of [WAGON.x - 34, WAGON.x + 34, WAGON.x + 72]) this.parts.push({ x: x + Math.random() * 6, y: WAGON.base - 1 - Math.random() * 3, vx: -WAGON.scroll * (0.6 + Math.random() * 0.3), vy: -0.006, col: 'rgba(236,214,166,0.55)', t: 0, max: 500 + Math.random() * 300, smoke: true, s: 1, v: 0 });
    }
    // la roulotte fume puis brûle quand elle est mal en point
    const k = this.wagonHp / WAGON.hp;
    this.smokeT = (this.smokeT || 0) + dt;
    if (k < 0.6 && this.smokeT > (k < 0.3 ? 70 : 160)) {
      this.smokeT = 0;
      const x = WAGON.x + (Math.random() - 0.5) * 70;
      this.parts.push({ x, y: WAGON.base - 60, vx: 0.004, vy: -0.025, col: k < 0.3 ? 'rgba(60,50,45,0.6)' : 'rgba(120,110,100,0.45)', t: 0, max: 1600, smoke: true, v: 0 });
    }
  }

  // les assaillants qui arrivent dans la roulotte s'annoncent : hennissement, alerte s'ils sont dans le dos
  cues(t) {
    const from = this.cueT;
    if (t <= from) return;
    this.cueT = t;
    if (t - from > 500) return; // retour d'arrière-plan : pas d'avalanche de sons
    for (const b of this.world.targets) {
      if (b.t0 > t) break;
      if (b.t0 <= from || b.view !== 'in') continue;
      if (b.kind === 'chaser' || b.kind === 'thrower' || b.kind === 'zigzag' || b.kind === 'crosser') sfx('neigh');
      if (b.kind === 'boarder') sfx('thud');
      if (b.kind === 'boss') { sfx('neigh'); this.banner = { text: 'BLACK BART ARRIVE PAR DERRIÈRE !', sub: 'LE BRAS DROIT D\'EL DIABLO', col: '#f0705a', at: t }; }
      if (b.end !== this.face && this.viewAt(t) === 'in') {
        this.alertAt = t;
        if (!this.turned && b.kind !== 'boss') this.banner = { text: b.end < 0 ? 'ÇA VIENT DE DERRIÈRE !' : 'ÇA VIENT DE DEVANT !', sub: this.touch ? 'BOUTON DU BAS : SE RETOURNER' : 'ESPACE : SE RETOURNER', col: '#f0705a', at: t, short: true };
      }
      if (b.kind === 'barricade' && this.face < 0) this.banner = { text: 'BARRICADE DEVANT !', col: '#f0705a', at: t, short: true };
    }
  }

  // ---------------------------------------------------------- rendu
  render(out) {
    const t = this.t, now = this.now;
    if (!this.world) { out.drawImage(skyFor(this.amb.env), 0, 0); return; }
    if (this.viewAt(t) === 'in') this.renderIn(out, t, now);
    else this.renderSide(out, t, now);
    // la caisse de TNT : tout blanchit
    if (t - this.tntAt < 500) { out.fillStyle = `rgba(255,244,214,${0.8 * (1 - (t - this.tntAt) / 500)})`; out.fillRect(0, 0, W, H); }
    const a = this.wipeA(t);
    if (a > 0) { out.fillStyle = `rgba(14,8,6,${a.toFixed(3)})`; out.fillRect(-8, -8, W + 16, H + 16); }
    this.drawHud(out, t);
  }

  // distance parcourue (px) : elle s'arrête si la roulotte tombe
  cam(t) { return Math.max(0, Math.min(t, this.stopAt ?? this.duration)) * WAGON.scroll; }
  travel(t) { return Math.max(0, Math.min(t, this.stopAt ?? this.duration)) * WAGON.rush; }
  rolling(t) { return t > 0 && t < this.duration && this.stopAt == null; }

  drawParts(ctx, v) {
    for (const p of this.parts) {
      if ((p.v || 0) !== v) continue;
      if (p.smoke) S.disc(ctx, p.x, p.y, Math.round((p.s ?? 2) + p.t / 300), p.col);
      else { ctx.fillStyle = p.col; ctx.fillRect(Math.round(p.x), Math.round(p.y), 1, 1); }
    }
  }

  drawBooms(ctx, t, v) {
    for (const b of this.booms) {
      if ((b.v || 0) !== v) continue;
      const el = t - b.at;
      const size = b.big ? 34 : b.small ? 10 : 22;
      if (el < 220) S.drawFlash(ctx, b.x, b.y, size, b.at);
      if (el < 400) this.amb.glow(ctx, b.x, b.y, size * 2.7, '255,170,70');
    }
  }

  // ---------- de côté
  renderSide(out, t, now) {
    const amb = this.amb;
    out.drawImage(skyFor(amb.env), 0, 0);
    amb.sky(out, now);
    const ctx = amb.begin(out);
    const tt = clamp(t, 0, this.duration);
    const glows = drawTrail(ctx, this.cam(t), now);
    const fly = this.flying(tt, 0);
    // ombres de la dynamite
    for (const d of fly) {
      const gy = Math.round(d.b.y + (WAGON.base - 30 - d.b.y) * d.u);
      ctx.fillStyle = 'rgba(70,50,20,0.3)';
      ctx.fillRect(Math.round(d.x) - 2, gy, 5, 1);
    }
    // la roulotte et les assaillants, triés par profondeur
    const items = [
      { y: WAGON.base - 6, draw: () => this.drawHorse(ctx, 0, WAGON.x + 80, WAGON.base - 6, t, now) },
      { y: WAGON.base, draw: () => this.drawWagon(ctx, tt, now) },
      { y: WAGON.base + 3, draw: () => this.drawHorse(ctx, 1, WAGON.x + 88, WAGON.base + 3, t, now) },
    ];
    for (const b of this.world.targets) {
      if (b.t0 > tt) break;
      if (b.view !== 'side' || tt >= b.t1 || (b.gone != null && tt >= b.gone) || b.t0 > (this.stopAt ?? Infinity)) continue;
      const d = this.dead.get(b.id);
      if (d && tt - (d.seen ?? tt) > 4000) continue;
      const roof = climbK(b, d ? d.at : tt) > 0 && !d;
      items.push({ y: roof ? WAGON.base + 1 : b.y, draw: () => this.drawBandit(ctx, b, tt, now) });
    }
    items.sort((a, b) => a.y - b.y);
    for (const it of items) it.draw();
    for (const d of fly) this.drawDyn(ctx, d, now, 1);
    for (const p of this.pickups(tt, 0)) this.drawPickup(ctx, p, now);
    this.drawParts(ctx, 0);
    amb.end(out, now);
    for (const g of glows) amb.glow(out, g.x, g.y, g.r);
    amb.weather(out, now);
    // le feu et les explosions ne sont pas teintés
    this.drawFire(out, now);
    this.drawBooms(out, t, 0);
    for (const s of this.shotFx) {
      const b = this.world.targets[s.id];
      if (b.kind !== 'sniper' || t - s.at > 90) continue;
      S.drawFlash(out, banditX(b, t) - 20, b.y - SNIPE.feet - 23, 7, s.at);
    }
  }

  drawHorse(ctx, i, x, y, t, now) {
    const [coat, mane] = TEAM[i];
    const f = this.rolling(t) ? Math.floor(now / 110 + i * 2) % 4 : 1;
    const spr = horseSprite(coat, mane, f, null);
    ctx.fillStyle = 'rgba(70,50,20,0.28)';
    ctx.fillRect(x - 14, y - 1, 30, 2);
    ctx.drawImage(spr, x - spr.ox, y - spr.oy);
    // trait jusqu'au timon
    ctx.fillStyle = '#3a2214';
    for (let k = 0; k <= 16; k++) ctx.fillRect(Math.round(WAGON.x + 70 + ((x - 8 - WAGON.x - 70) * k) / 16), Math.round(WAGON.base - 20 + ((y - 22 - WAGON.base + 20) * k) / 16), 1, 1);
  }

  drawWagon(ctx, t, now) {
    const spr = flipped(wagonSprite());
    const x = WAGON.x, y = WAGON.base;
    ctx.fillStyle = 'rgba(70,50,20,0.3)';
    ctx.fillRect(x - 60, y - 2, 120, 4);
    const flash = t - this.wagonFlash < 90;
    // la caisse cahote un peu sur la piste
    const bump = this.rolling(t) && Math.floor(now / 180) % 3 === 0 ? -1 : 0;
    ctx.drawImage(spr, x - spr.ox, y - spr.oy + bump + (flash ? 1 : 0));
    const ang = this.cam(t) / 14;
    for (const cx of [-34, 34]) wheel(ctx, x + cx, y - 14, 14, ang);
    // accrocs et brûlures sur la bâche, au fil des dégâts
    const lost = Math.floor((1 - this.wagonHp / WAGON.hp) * 12);
    for (let k = 0; k < lost; k++) {
      const hx = x - 40 + ((k * 37) % 80), hy = y - 62 + ((k * 23) % 26);
      ctx.fillStyle = k % 3 ? '#3a2a1a' : '#6a5a48';
      ctx.fillRect(hx, hy, 3 + (k % 2), 2 + (k % 3 === 0 ? 1 : 0));
    }
    if (flash) { ctx.fillStyle = 'rgba(255,240,220,0.35)'; ctx.fillRect(x - 52, y - 70, 104, 56); }
  }

  drawFire(ctx, now) {
    const k = this.wagonHp / WAGON.hp;
    if (k >= 0.3) return;
    const n = k < 0.15 ? 6 : 3;
    for (let i = 0; i < n; i++) {
      const fx = WAGON.x - 34 + ((i * 29) % 70), base = WAGON.base - 50 - ((i * 13) % 14);
      const h = 6 + Math.round(3 * Math.sin(now / 90 + i * 1.7));
      S.disc(ctx, fx, base - h / 2, 3, 'rgba(240,120,40,0.85)');
      S.disc(ctx, fx, base - h, 2, 'rgba(255,200,80,0.9)');
      ctx.fillStyle = '#fff2b0'; ctx.fillRect(fx, base - h - 3, 1, 2);
    }
    this.amb.glow(ctx, WAGON.x, WAGON.base - 50, 50, '255,140,60');
  }

  drawBandit(ctx, b, t, now) {
    const d = this.dead.get(b.id);
    if (d && d.by < 0) return; // la mule a sauté contre la roulotte
    if (b.kind === 'sniper') return this.drawSniper(ctx, b, t, now, d);
    // abattu, il reste sur la piste pendant que le convoi s'éloigne
    const at = d ? d.at : t;
    const a = anchor(b, at);
    const ck = climbK(b, at);
    const x = Math.round(a.x - (d ? this.cam(t) - this.cam(d.at) : 0));
    const el = d ? t - (d.seen ?? t) : 0;
    const y = Math.round(d && ck > 0 ? a.y + (b.y - a.y) * clamp(el / 400, 0, 1) : a.y); // il tombe de la bâche
    const atWagon = t >= b.reach;
    let spr, stick = false, right = b.side < 0;
    if (b.kind === 'mule') spr = muleSprite(d ? 1 : Math.floor(now / 110 + b.id) % 4);
    else if ((b.kind === 'rider' || b.kind === 'dyn' || b.kind === 'climber') && ck === 0) {
      spr = riderSprite(b.look, d ? 1 : Math.floor(now / 85 + b.id) % 4);
      if (b.kind === 'dyn' && atWagon && !d) {
        const ph = ((t - b.reach - 500) % WAGON.throwEvery + WAGON.throwEvery) % WAGON.throwEvery;
        stick = t > b.reach + 150 && (ph > WAGON.throwEvery - 450 || ph < 60);
      }
    } else if (b.kind === 'climber') {
      // son cheval repart sans lui
      const e = t - b.reach, hx = b.stopX + b.side * 0.07 * e;
      if (hx > -40 && hx < W + 40) {
        const [coat, mane] = HORSES[b.look % HORSES.length];
        const hs = horseSprite(coat, mane, Math.floor(now / 85) % 4, null);
        const img = b.side < 0 ? flipped(hs) : hs;
        ctx.drawImage(img, rd(hx) - img.ox, b.y - img.oy);
      }
      const onRoof = ck >= 1;
      spr = banditSprite(b.look, 'walker', onRoof && !d ? 'strike' : 'walk', onRoof && !d ? Math.floor((t - b.reach) / 300) % 2 : 1);
      right = x < WAGON.x;
    } else {
      const strike = atWagon && !d;
      spr = banditSprite(b.look, b.kind, strike ? 'strike' : 'walk', strike ? Math.floor((t - b.reach) / 300) % 2 : Math.floor(now / (b.kind === 'walker' ? 140 : 190) + b.id) % 4);
    }
    const img = right ? spr : flipped(spr);
    const dir = right ? 1 : -1;
    const k = d ? clamp(el / 300, 0, 1) : 0;
    ctx.fillStyle = 'rgba(70,50,20,0.28)';
    if (ck === 0 || d) ctx.fillRect(x - 10, (d ? b.y : y) - 1, 20, 2);
    if (b.bonus && !d) goldRim(ctx, img, x - img.ox, y - img.oy, img.width, img.height, now);
    ctx.globalAlpha = el > 3000 ? clamp(1 - (el - 3000) / 1000, 0, 1) : 1;
    ctx.save();
    ctx.translate(x, y - Math.round(k * 6));
    ctx.rotate((-dir * k * Math.PI) / 2);
    ctx.drawImage(img, -img.ox, -img.oy);
    ctx.restore();
    ctx.globalAlpha = 1;
    if (d) return;
    if (stick) { // le dynamiteur brandit son bâton, mèche allumée
      const sx = x - dir * 4, sy = y - 54;
      ctx.fillStyle = OUT; ctx.fillRect(sx - 2, sy - 1, 4, 8);
      ctx.fillStyle = '#c0302a'; ctx.fillRect(sx - 1, sy, 2, 6);
      ctx.fillStyle = Math.floor(now / 50) % 2 ? '#fff2b0' : '#f8a040'; ctx.fillRect(sx, sy - 2, 1, 2);
    }
    if (b.kind === 'mule') { // la mèche grésille
      ctx.fillStyle = Math.floor(now / 50) % 2 ? '#fff2b0' : '#f8a040';
      ctx.fillRect(x - dir, y - 36, 1, 1);
      if (Math.floor(now / 90) % 2) { ctx.fillRect(x - dir * 2, y - 37, 1, 1); ctx.fillRect(x, y - 38, 1, 1); }
    }
    if (this.hitFx.some((h) => h.id === b.id)) {
      const r = banditBox(b, t);
      ctx.fillStyle = 'rgba(255,80,60,0.45)';
      ctx.fillRect(r.x, r.y, r.w, r.h);
    }
    // jauge des costauds
    if (b.hp > 1) {
      const hp = this.hp.get(b.id) ?? b.hp;
      const r = banditBox(b, t);
      const w = 14;
      ctx.fillStyle = OUT; ctx.fillRect(r.x + r.w / 2 - w / 2 - 1, r.y - 6, w + 2, 4);
      ctx.fillStyle = '#5a1a14'; ctx.fillRect(r.x + r.w / 2 - w / 2, r.y - 5, w, 2);
      ctx.fillStyle = '#e8604c'; ctx.fillRect(r.x + r.w / 2 - w / 2, r.y - 5, Math.round((w * hp) / b.hp), 2);
    }
  }

  // le tireur embusqué : derrière son rocher, il se lève, épaule, tire et se recache
  drawSniper(ctx, b, t, now, d) {
    const x = Math.round(d ? banditX(b, d.at) - (this.cam(t) - this.cam(d.at)) : banditX(b, t)), y = b.y;
    const e = (t - b.t0) % SNIPE.period;
    let rise = 0;
    if (d) rise = 1 - clamp((t - (d.seen ?? t)) / 300, 0, 1);
    else if (sniperUp(b, t)) rise = Math.min(1, (e - SNIPE.hide) / 150, (SNIPE.period - e) / 150);
    const spr = flipped(banditSprite(b.look, 'walker', 'aim', 0));
    // ses pieds : debout sur une marche derrière le rocher, ou plus bas quand il se cache
    const sy = y - SNIPE.feet + Math.round((1 - rise) * SNIPE.drop);
    // on ne dessine que ce qui dépasse du sommet du rocher : ni jambes, ni rien qui déborde sur les côtés
    ctx.save();
    ctx.beginPath(); ctx.rect(x - 60, 0, 120, y - SNIPE.rock + 2); ctx.clip();
    if (b.bonus && !d && rise > 0.5) goldRim(ctx, spr, x - spr.ox, sy - spr.oy, spr.width, spr.height, now);
    ctx.drawImage(spr, x - spr.ox, sy - spr.oy);
    ctx.restore();
    const rock = SNIPE_ROCK();
    ctx.drawImage(rock, x - rock.ox, y - rock.oy);
    if (d) return;
    // reflet du canon juste avant le coup de feu
    if (rise >= 1 && nextStrike(b, t) - t < 500 && Math.floor(now / 70) % 2) {
      ctx.fillStyle = '#fff8d0'; ctx.fillRect(x - 21, sy - 24, 2, 2);
      ctx.fillStyle = '#f0705a'; ctx.fillRect(x - 22, sy - 25, 1, 1); ctx.fillRect(x - 19, sy - 22, 1, 1);
    }
    if (!d && rise >= 1 && x > 20 && x < W - 20) this.threatMark(ctx, x, y - 54, b.bonus, now);
    if (this.hitFx.some((h) => h.id === b.id)) { const r = banditBox(b, t); if (r) { ctx.fillStyle = 'rgba(255,80,60,0.45)'; ctx.fillRect(r.x, r.y, r.w, r.h); } }
  }

  // bâton de dynamite (z : échelle)
  drawDyn(ctx, d, now, z) {
    const x = Math.round(d.x), y = Math.round(d.y);
    const a = (now / 70 + d.k) % 4, L = Math.max(1, rd(z));
    const R = (dx, dy, w, h, col) => { ctx.fillStyle = col; ctx.fillRect(x + dx * L, y + dy * L, w * L, h * L); };
    if (a < 2) { R(-3, -2, 7, 4, OUT); R(-2, -1, 5, 2, '#c0302a'); } else { R(-2, -3, 4, 7, OUT); R(-1, -2, 2, 5, '#c0302a'); }
    R(a < 2 ? 3 : 0, a < 2 ? -1 : -3, 1, 1, Math.floor(now / 50) % 2 ? '#fff2b0' : '#f8a040');
  }

  drawPickup(ctx, p, now) {
    const spr = bonusIcon(p.b.bonus);
    const k = p.k, w = spr.width * k, h = spr.height * k;
    // il clignote quand il va disparaître
    if (p.el > WAGON.bonusLife - 900 && Math.floor(now / 90) % 2) return;
    ring(ctx, rd(p.x), rd(p.y), rd(10 * k + 2 + Math.sin(now / 120) * 2), rd(10 * k + 2 + Math.sin(now / 120) * 2), '#fff2b0', 2, now / 200);
    ctx.drawImage(spr, rd(p.x - spr.ox * k), rd(p.y - spr.oy * k), w, h);
  }

  // ---------- de l'intérieur de la roulotte
  renderIn(out, t, now) {
    const amb = this.amb;
    const k = this.turnK(t);
    // pendant le demi-tour, l'ancienne vue file d'un côté et la nouvelle arrive de l'autre
    const views = k < 1 ? [[-this.face, -rd(ease(k) * W)], [this.face, rd(W * (1 - ease(k)))]] : [[this.face, 0]];
    const each = (ctx, fn) => {
      for (const [f, dx] of views) {
        ctx.save();
        ctx.translate(dx, 0);
        ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.clip();
        fn(ctx, f);
        ctx.restore();
      }
    };
    // la roulotte cahote : le paysage tangue un peu dans l'ouverture de la bâche
    const roll = this.rolling(t);
    this.sway = { x: roll ? rd(Math.sin(now / 700) * 1.5) : 0, y: roll && Math.floor(now / 180) % 3 === 0 ? -1 : 0 };
    each(out, (c) => c.drawImage(skyFor(amb.env), 0, IN.hz - HORIZON));
    amb.sky(out, now);
    each(amb.begin(out), (c, f) => { c.translate(this.sway.x, this.sway.y); this.drawInWorld(c, f, t, now); });
    amb.end(out, now);
    amb.weather(out, now);
    each(out, (c, f) => {
      if (f !== this.face) return;
      c.translate(this.sway.x, this.sway.y);
      this.drawBooms(c, t, f);
      for (const s of this.shotFx) this.drawEnemyShot(c, s, t);
    });
    const ctx = amb.begin(out);
    each(ctx, (c, f) => this.drawInFrame(c, f, t, now));
    this.drawGun(ctx, t);
    amb.end(out, now);
    // la roulotte encaisse : les bords de l'écran rougissent
    const hk = this.wagonHp / WAGON.hp;
    const hurt = clamp(1 - (t - this.hurtAt) / 260, 0, 1), low = hk < 0.3 ? 0.25 + 0.15 * Math.sin(now / 160) : 0;
    const a = Math.max(hurt * 0.55, low);
    if (a > 0.02) {
      for (let i = 0; i < 6; i++) {
        out.fillStyle = `rgba(200,40,20,${(a * (6 - i)) / 10})`;
        out.fillRect(0, i * 3, W, 3); out.fillRect(0, H - (i + 1) * 3, W, 3);
        out.fillRect(i * 3, 0, 3, H); out.fillRect(W - (i + 1) * 3, 0, 3, H);
      }
    }
  }

  drawInWorld(ctx, f, t, now) {
    const tt = clamp(t, 0, this.duration - 1), travel = this.travel(t);
    const st = stageAt(tt), canyon = st.id === 'canyon';
    // des vautours tournent dans le ciel
    for (let i = 0; i < 3; i++) {
      const a = now / (4200 + i * 900) + i * 2.1 + (f < 0 ? 1 : 0);
      S.vulture(ctx, rd(W / 2 + (i - 1) * 110 + Math.cos(a) * 34), rd(30 + i * 9 + Math.sin(a) * 9), now + i * 170);
    }
    ctx.drawImage(horizonStrip(f, canyon), 0, IN.hz - 33);
    // le sol défile : vers nous quand on regarde devant, il s'éloigne quand on regarde derrière
    const P = groundPal(canyon);
    for (let y = IN.hz + 1; y < H; y++) {
      const i = y - IN.hz - 1, s = (y - IN.hz) / IN.camH, d = IN.depth * (1 / s - 1);
      const band = Math.floor((travel + f * d) / 22) & 1;
      ctx.fillStyle = P.sand[i][band]; ctx.fillRect(0, y, W, 1);
      const tw = IN.trail * s;
      ctx.fillStyle = P.trail[i][band]; ctx.fillRect(rd(W / 2 - tw), y, rd(2 * tw), 1);
      const rw = Math.max(1, rd(3 * s));
      ctx.fillStyle = P.rut[i];
      for (const o of [-24, 24]) ctx.fillRect(rd(W / 2 + o * s - rw / 2), y, rw, 1);
    }
    if (canyon) this.drawWalls(ctx, f, travel);
    // derrière, la poussière que soulève la roulotte
    if (f < 0 && this.rolling(t)) {
      for (let i = 0; i < 10; i++) {
        const u = (now / 1100 + i / 10) % 1;
        const g = inProj(Math.sin(i * 2.7) * 34, 14 + u * 240, 8 + u * 36);
        S.disc(ctx, rd(g.x), rd(g.y), Math.max(1, rd(16 * g.s * (0.6 + u))), `rgba(236,214,166,${(0.4 * (1 - u)).toFixed(2)})`);
      }
    }
    // cailloux et brins d'herbe sèche qui filent sous la roulotte : ils viennent vers nous devant, s'éloignent derrière
    if (this.rolling(t)) {
      for (let i = 0; i < 46; i++) {
        const ph = (travel * 1.7 + hash(i * 5 + 1) * IN.far) % IN.far;
        const d = f > 0 ? IN.far - ph : ph;
        if (d < 6) continue;
        const air = i % 3 === 0;
        const g = inProj((hash(i * 5 + 2) - 0.5) * 420, d, air ? 6 + hash(i * 5 + 3) * 50 : 0);
        const sz = Math.max(1, rd(2.4 * g.s));
        ctx.fillStyle = air ? `rgba(240,224,190,${(0.25 + 0.4 * g.s).toFixed(2)})` : i % 2 ? '#9a7a4a' : '#e8d4a4';
        ctx.fillRect(rd(g.x), rd(g.y) - sz, sz * (air ? 2 : 1), sz);
      }
    }
    // tout ce qui est sur la piste et sur ses bords, du plus loin au plus proche
    const items = [];
    const STEP = 40, i0 = Math.floor(travel / STEP);
    for (let j = 0; j < IN.far / STEP + 2; j++) {
      const idx = i0 + f * j, d = f * (idx * STEP - travel);
      if (d < 4 || d > IN.far) continue;
      for (const sd of [-1, 1]) {
        const h = hash(idx * 2 + (sd > 0 ? 1 : 0));
        if (h > (canyon ? 0.3 : 0.42)) continue;
        const kind = canyon ? (h < 0.22 ? 'rock' : 'bones') : h < 0.15 ? 'cactus' : h < 0.27 ? 'rock' : h < 0.34 ? 'tree' : 'bones';
        items.push({ d, prop: kind, lx: sd * (60 + hash(idx * 7 + sd) * (canyon ? 80 : 160)) });
      }
    }
    // Red Rock se rapproche, au bout de la piste
    if (f > 0 && st.id === 'bart') {
      const dt = (this.duration - tt) * WAGON.rush + 240;
      if (dt < 3600) items.push({ d: dt, town: true });
    }
    for (const b of this.world.targets) {
      if (b.t0 > tt) break;
      if (b.view !== 'in' || b.end !== f || tt >= b.t1 || b.t0 > (this.stopAt ?? Infinity)) continue;
      const dd = this.dead.get(b.id);
      if (dd ? dd.by < 0 || tt - (dd.seen ?? tt) > 1500 : !active(b, tt)) continue;
      const p = inPos(b, dd ? dd.at : tt);
      const d = dd ? p.d - b.end * WAGON.rush * (tt - dd.at) : p.d;
      if (d > 2 && d < IN.far + 200) items.push({ d, b, p, dd });
    }
    for (const s of this.flying(tt, f)) items.push({ d: 0, stick: s });
    for (const p of this.pickups(tt, f)) items.push({ d: -1, pick: p });
    items.sort((a, b) => b.d - a.d);
    for (const it of items) {
      if (it.prop) this.drawProp(ctx, it);
      else if (it.town) this.drawTown(ctx, it.d);
      else if (it.b) this.drawInBandit(ctx, it, tt, now);
      else if (it.stick) this.drawDyn(ctx, it.stick, now, Math.max(1, inK(it.stick.s)));
      else this.drawPickup(ctx, it.pick, now);
    }
    this.drawParts(ctx, f);
  }

  // les parois du canyon : deux murs de grès de part et d'autre de la piste
  drawWalls(ctx, f, travel) {
    const X = 176, TOP = 240;
    for (const s of [-1, 1]) {
      const a = inProj(s * X, -20), b = inProj(s * X, IN.far), c = inProj(s * X, IN.far, TOP), e = inProj(s * X, -20, TOP);
      const edge = s < 0 ? -10 : W + 10;
      ctx.fillStyle = '#9a5236';
      ctx.beginPath();
      ctx.moveTo(edge, e.y); ctx.lineTo(e.x, e.y); ctx.lineTo(c.x, c.y); ctx.lineTo(b.x, b.y); ctx.lineTo(a.x, a.y); ctx.lineTo(edge, a.y);
      ctx.closePath();
      ctx.fill();
      // strates
      for (const [h, col] of [[30, '#7a3e28'], [74, '#b0603e'], [120, '#7a3e28'], [170, '#b0603e']]) {
        const p = inProj(s * X, -20, h), q = inProj(s * X, IN.far, h);
        ctx.strokeStyle = col; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(edge, p.y); ctx.lineTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke();
      }
      // fissures qui défilent
      const STEP = 70;
      for (let j = 0; j < IN.far / STEP + 1; j++) {
        const idx = Math.floor(travel / STEP) + f * j, d = f * (idx * STEP - travel);
        if (d < 2 || d > IN.far) continue;
        const g = inProj(s * X, d), top = inProj(s * X, d, 60 + hash(idx * 3 + s) * 170);
        ctx.fillStyle = `rgba(60,24,12,${(0.6 * (1 - d / IN.far)).toFixed(2)})`;
        ctx.fillRect(rd(g.x), rd(top.y), Math.max(1, rd(3 * g.s)), rd(g.y - top.y));
      }
      // la brume au fond
      ctx.fillStyle = 'rgba(216,168,136,0.35)';
      ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.lineTo(inProj(s * X, 500, TOP).x, inProj(s * X, 500, TOP).y); ctx.lineTo(inProj(s * X, 500).x, inProj(s * X, 500).y); ctx.closePath(); ctx.fill();
    }
  }

  drawProp(ctx, it) {
    const spr = trailProp(it.prop), g = inProj(it.lx, it.d), k = 2 * g.s;
    ctx.globalAlpha = 1 - clamp((it.d - 700) / 700, 0, 0.6);
    ctx.drawImage(spr, rd(g.x - spr.ox * k), rd(g.y - spr.oy * k), Math.max(1, rd(spr.width * k)), Math.max(1, rd(spr.height * k)));
    ctx.globalAlpha = 1;
  }

  drawTown(ctx, d) {
    const HOUSES = [[-236, 72, 58, '#a8584a'], [-150, 66, 48, '#9a7a4a'], [-84, 50, 64, '#7a6a9a'], [84, 60, 52, '#c8b48a'], [156, 74, 60, '#8a4a2a'], [240, 62, 46, '#b89a6a']];
    for (const [lx, w, h, col] of HOUSES) {
      const g = inProj(lx, d), k = 2 * g.s;
      const R = (x, y, ww, hh, c) => { ctx.fillStyle = c; ctx.fillRect(rd(g.x + x * k), rd(g.y + y * k), Math.max(1, rd(ww * k)), Math.max(1, rd(hh * k))); };
      R(-w / 2 - 1, -h - 4, w + 2, h + 4, OUT);
      R(-w / 2, -h, w, h, col); R(-w / 2 - 2, -h - 4, w + 4, 4, S.shade(col, -0.25));
      R(-w / 2 + 6, -h + 4, w - 12, 9, '#e8d4a0');
      R(-6, -20, 12, 20, '#2a180c');
      for (const s of [-1, 1]) R(s * w * 0.3 - 5, -h + 20, 10, 10, '#2a180c');
    }
    // le portique à l'entrée de la ville, avec son nom sur une planche : le texte n'apparaît que s'il y tient
    const g = inProj(0, d), k = 2 * g.s;
    const R = (x, y, ww, hh, c) => { ctx.fillStyle = c; ctx.fillRect(rd(g.x + x * k), rd(g.y + y * k), Math.max(1, rd(ww * k)), Math.max(1, rd(hh * k))); };
    for (const s of [-1, 1]) { R(s * 50 - 2, -70, 4, 70, OUT); R(s * 50 - 1, -70, 2, 70, '#6a4024'); }
    R(-56, -78, 112, 14, OUT); R(-55, -77, 110, 12, '#d8bc80'); R(-55, -77, 110, 1, '#f0d8a0'); R(-55, -66, 110, 1, '#9a7a4a');
    const pw = 110 * k, size = pw > WAGON.to.length * 11 + 10 ? 16 : pw > WAGON.to.length * 5.5 + 6 ? 8 : 0;
    if (size) canvasText(ctx, WAGON.to, g.x, g.y - 71.5 * k - (size === 16 ? 7 : 4), { size, color: '#3a2214', shadow: '#b89a60' });
  }

  // chevron au-dessus d'un assaillant qui attaque (doré s'il porte un bonus) : on les repère de loin
  threatMark(ctx, x, y, gold, now) {
    const b = rd(Math.sin(now / 140) * 1.5);
    const col = gold ? '#f8d070' : '#f0705a';
    ctx.fillStyle = OUT; ctx.fillRect(rd(x) - 4, rd(y) - 4 + b, 9, 4); ctx.fillRect(rd(x) - 2, rd(y) + b, 5, 2);
    ctx.fillStyle = col; ctx.fillRect(rd(x) - 3, rd(y) - 3 + b, 7, 2); ctx.fillRect(rd(x) - 1, rd(y) - 1 + b, 3, 2);
  }

  drawInBandit(ctx, it, t, now) {
    const { b, p, dd } = it;
    const g = inProj(p.lx, it.d), k = inK(g.s) * (b.kind === 'boss' ? BOSS_K : 1);
    const el = dd ? t - (dd.seen ?? t) : 0, fall = dd ? clamp(el / 400, 0, 1) : 0;
    ctx.globalAlpha = dd ? clamp(1 - (el - 700) / 700, 0, 1) : 1;
    const hit = !dd && this.hitFx.some((h) => h.id === b.id);
    const draw = (spr, ox, oy, rot = 0) => { // sprite posé sur le point au sol, éventuellement basculé (abattu)
      const w = Math.max(1, rd(spr.width * k)), h = Math.max(1, rd(spr.height * k));
      ctx.save();
      ctx.translate(rd(g.x), rd(g.y + oy * k));
      if (rot) ctx.rotate(rot);
      if (b.bonus && !dd) goldRim(ctx, spr, -spr.ox * k, -spr.oy * k, w, h, now);
      ctx.drawImage(spr, rd(-spr.ox * k), rd(-spr.oy * k), w, h);
      ctx.restore();
    };
    const glint = (x, y) => { // reflet du canon juste avant le coup de feu
      if (dd || nextStrike(b, t) - t > 450 || Math.floor(now / 60) % 2) return;
      const s = Math.max(2, rd(2 * k));
      ctx.fillStyle = '#fff8d0'; ctx.fillRect(rd(g.x + x * k), rd(g.y + y * k), s, s);
      ctx.fillStyle = '#f0705a'; ctx.fillRect(rd(g.x + x * k) - 1, rd(g.y + y * k) - 1, 1, 1); ctx.fillRect(rd(g.x + x * k) + s, rd(g.y + y * k) + s, 1, 1);
    };
    const shadow = (w) => { ctx.fillStyle = 'rgba(60,40,20,0.3)'; ctx.fillRect(rd(g.x - w * k), rd(g.y - k), rd(2 * w * k), Math.max(1, rd(2 * k))); };
    if (b.kind === 'chaser' || b.kind === 'thrower' || b.kind === 'boss' || b.kind === 'zigzag') {
      shadow(12);
      const frame = dd ? 1 : Math.floor(now / 90 + b.id) % 4;
      // le bandido se penche dans ses virages
      const lean = b.kind === 'zigzag' && !dd ? (p.lean || 0) * 0.16 : 0;
      draw(riderFront(b.look, frame, b.kind), 0, 0, lean + (b.lx > 0 || p.lx > 0 ? 1 : -1) * fall * 1.2);
      if (b.kind !== 'thrower') glint(8, -56);
    } else if (b.kind === 'crosser') { // de profil : il traverse la piste au galop
      shadow(16);
      const spr = riderSprite(b.look, dd ? 1 : Math.floor(now / 80 + b.id) % 4);
      draw(b.dir > 0 ? spr : flipped(spr), 0, 0, -b.dir * fall * 1.2);
      glint(b.dir * 6, -38);
    } else if (b.kind === 'ambush') {
      // debout, il dépasse du rocher jusqu'aux mains ; caché, il est tout entier dessous : on ne dessine que ce qui dépasse
      const rise = dd ? 1 - fall : ambushRise(b, t);
      const top = AMB_ROCK.rock - 2;
      ctx.save();
      ctx.beginPath(); ctx.rect(-W, -H, 3 * W, rd(g.y - top * k) + H); ctx.clip();
      draw(bustSprite(b.look, 'aim'), 0, -AMB_ROCK.up + (1 - rise) * (56 - top + AMB_ROCK.up));
      ctx.restore();
      draw(AMB_BOULDER(), 0, 0);
      if (rise >= 1) glint(-1, -AMB_ROCK.up - 15);
    } else if (b.kind === 'barricade') {
      draw(barricadeSprite(), 0, 0);
      ctx.fillStyle = Math.floor(now / 50) % 2 ? '#fff2b0' : '#f8a040';
      ctx.fillRect(rd(g.x), rd(g.y - 33 * k), Math.max(1, rd(k)), Math.max(1, rd(k)));
      // elle approche : alerte
      if (b.reach - t < 2500 && Math.floor(now / 150) % 2) canvasText(ctx, '!', g.x, g.y - 52 * k - 8, { size: 16, color: '#f0705a' });
    } else if (b.kind === 'boarder') {
      draw(bustSprite(b.look, 'grab'), 0, -p.lift + fall * 30);
    }
    ctx.globalAlpha = 1;
    if (hit) {
      const r = targetBox(b, t);
      if (r) { ctx.fillStyle = 'rgba(255,80,60,0.45)'; ctx.fillRect(r.x, r.y, r.w, r.h); }
    }
    // de loin, un chevron les signale
    if (!dd && it.d > 220 && b.kind !== 'barricade') {
      const r = targetBox(b, t);
      if (r) this.threatMark(ctx, r.x + r.w / 2, r.y - 4, b.bonus, now);
    }
    // jauge des costauds
    if (!dd && b.hp > 1) {
      const r = targetBox(b, t);
      if (r && b.kind !== 'boss') {
        const hp = this.hp.get(b.id) ?? b.hp, w = 20;
        ctx.fillStyle = OUT; ctx.fillRect(rd(r.x + r.w / 2 - w / 2 - 1), rd(r.y - 6), w + 2, 4);
        ctx.fillStyle = '#5a1a14'; ctx.fillRect(rd(r.x + r.w / 2 - w / 2), rd(r.y - 5), w, 2);
        ctx.fillStyle = '#e8604c'; ctx.fillRect(rd(r.x + r.w / 2 - w / 2), rd(r.y - 5), rd((w * hp) / b.hp), 2);
      }
    }
  }

  // éclair du coup de feu d'un bandit, vu de l'intérieur
  drawEnemyShot(ctx, s, t) {
    const b = this.world.targets[s.id];
    if (b.view !== 'in' || b.end !== this.face || t - s.at > 100) return;
    const p = inPos(b, t), g = inProj(p.lx, p.d), k = inK(g.s) * (b.kind === 'boss' ? BOSS_K : 1);
    if (b.kind === 'ambush') S.drawFlash(ctx, g.x, g.y - (AMB_ROCK.up + 14) * k, Math.max(4, 8 * k), s.at);
    else if (b.kind === 'boarder') S.drawFlash(ctx, g.x + 16 * k, g.y - 40 * k, Math.max(4, 6 * k), s.at);
    else if (b.kind === 'crosser') S.drawFlash(ctx, g.x + b.dir * 8 * k, g.y - 38 * k, Math.max(4, 6 * k), s.at);
    else S.drawFlash(ctx, g.x + 9 * k, g.y - 55 * k, Math.max(4, 7 * k), s.at);
  }

  // l'intérieur de la roulotte autour de l'ouverture, l'attelage devant, les mains des pillards sur le rebord
  drawInFrame(ctx, f, t, now) {
    const roll = this.rolling(t);
    if (f > 0) {
      const fr = roll ? Math.floor(now / 110) % 4 : 1;
      for (const i of [0, 1]) {
        const spr = horseRear(i, (fr + i * 2) % 4), k = 1.2;
        const x = W / 2 + (i ? 24 : -24), y = 206 + (roll && Math.floor(now / 110 + i) % 2 ? -1 : 0);
        ctx.drawImage(spr, rd(x - spr.ox * k), rd(y - spr.oy * k), rd(spr.width * k), rd(spr.height * k));
      }
      // les rênes
      ctx.fillStyle = '#3a2214';
      for (const s of [-1, 1]) for (let k = 0; k <= 20; k++) ctx.fillRect(rd(W / 2 + s * (10 + k * 0.7)), rd(216 - k * 2.6 + Math.sin(k / 6) * 3), 1, 1);
    }
    const bump = roll && Math.floor(now / 180) % 3 === 0 ? 1 : 0;
    const oy = bump + (t - this.wagonFlash < 90 ? 1 : 0);
    ctx.drawImage(interior(f), 0, oy);
    // la bâche se crible de trous au fil des dégâts : le jour passe au travers
    const holes = Math.floor((1 - this.wagonHp / WAGON.hp) * 26);
    for (let i = 0, n = 0; n < holes && i < 120; i++) {
      const x = rd(6 + hash(i * 3 + (f > 0 ? 0 : 500)) * (W - 12)), y = rd(4 + hash(i * 3 + 1 + (f > 0 ? 0 : 500)) * 150);
      if (archHalf(y, 6) >= 0 && Math.abs(x - W / 2) < archHalf(y, 6)) continue; // pas dans l'ouverture
      n++;
      ctx.fillStyle = '#4a3420'; ctx.fillRect(x - 1, y - 1 + oy, 4, 4);
      ctx.fillStyle = n % 3 ? '#fff4d0' : '#ffe8a8'; ctx.fillRect(x, y + oy, 2, 2);
    }
    // la lanterne qui se balance
    const sw = Math.sin(now / 420) * 5, lx = f > 0 ? 58 : W - 60;
    ctx.fillStyle = '#3a2a1a';
    for (let k = 0; k < 12; k++) ctx.fillRect(rd(lx + (sw * k) / 12), 18 + k, 1, 1);
    const ly = 30, lxx = rd(lx + sw);
    ctx.fillStyle = OUT; ctx.fillRect(lxx - 4, ly, 9, 12);
    ctx.fillStyle = '#4a4f58'; ctx.fillRect(lxx - 3, ly + 1, 7, 2);
    ctx.fillStyle = '#f8d070'; ctx.fillRect(lxx - 2, ly + 3, 5, 6);
    ctx.fillStyle = '#fff2b0'; ctx.fillRect(lxx - 1, ly + 4, 2, 3);
    // les mains des pillards qui escaladent
    const rim = f > 0 ? 189 : 187;
    for (const b of this.world.targets) {
      if (b.t0 > t) break;
      if (b.kind !== 'boarder' || b.end !== f || !active(b, t) || this.isDown(b.id, t)) continue;
      const g = inProj(b.lx, 8), k = 2 * g.s;
      const L = LOOKS[b.look % LOOKS.length], skin = SKIN[L.char.skin];
      const up = clamp((t - b.t0) / 300, 0, 1);
      if (up < 1) continue;
      for (const s of [-1, 1]) {
        const hx = rd(g.x + s * 16 * k);
        ctx.fillStyle = OUT; ctx.fillRect(hx - 5, rim - 2, 11, 7);
        ctx.fillStyle = skin; ctx.fillRect(hx - 4, rim - 1, 9, 5);
        ctx.fillStyle = S.shade(skin, -0.25); ctx.fillRect(hx - 4, rim + 2, 9, 1);
      }
    }
    // la bâche fume quand la roulotte est mal en point
    const hk = this.wagonHp / WAGON.hp;
    if (hk < 0.6) {
      for (let i = 0; i < (hk < 0.3 ? 8 : 4); i++) {
        const u = (now / 2400 + i / 8) % 1;
        S.disc(ctx, rd(60 + ((i * 97) % (W - 120)) + u * 20), rd(26 - u * 30), 4 + rd(u * 8), hk < 0.3 ? 'rgba(50,40,36,0.5)' : 'rgba(110,100,92,0.4)');
      }
    }
  }

  // ton revolver, tenu à bout de bras dans la roulotte
  drawGun(ctx, t) {
    const pl = this.state?.players[this.me]?.character || {};
    const skin = SKIN[pl.skin] || SKIN[1], cloth = '#7a2a1e';
    const rec = clamp(1 - (this.now - this.firedAt) / 140, 0, 1);
    const turn = this.turning(t) ? Math.sin(this.turnK(t) * Math.PI) * 40 : 0;
    const x = rd(W - 112 + (this.mouse.x - W / 2) * 0.08), y = rd(H - 44 + (this.mouse.y - H / 2) * 0.06 + rec * 6 + turn);
    const gold = this.buffOn('gold', t), shot = this.buffOn('shotgun', t);
    const M = gold ? ['#c89a40', '#f4d47a', '#8a6420'] : ['#5c626c', '#b8bec6', '#3a3e46'];
    const R = (dx, dy, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(x + dx, y + dy, w, h); };
    R(12, 26, 34, 30, OUT); R(13, 27, 32, 30, cloth); R(13, 27, 32, 2, S.shade(cloth, 0.15)); // manche
    R(5, 14, 24, 18, OUT); R(6, 15, 22, 16, skin); R(6, 15, 22, 2, S.shade(skin, 0.18)); R(6, 28, 22, 3, S.shade(skin, -0.2)); // main
    R(10, 6, 11, 12, OUT); R(11, 7, 9, 10, '#7a4a24'); // crosse
    R(3, -4, 20, 14, OUT); R(4, -3, 18, 12, M[0]); R(4, -3, 18, 2, M[1]); R(9, -1, 1, 8, M[2]); R(15, -1, 1, 8, M[2]); // barillet
    const bw = shot ? 12 : 8;
    R(13 - bw / 2 - 1, -30, bw + 2, 27, OUT); R(13 - bw / 2, -29, bw, 26, M[0]); R(13 - bw / 2, -29, 2, 26, M[1]); // canon
    if (shot) R(12, -29, 1, 26, M[2]);
    R(11, -33, 4, 4, OUT); R(12, -32, 2, 3, M[2]); // guidon
    R(1, 11, 9, 7, OUT); R(2, 12, 7, 5, skin); // pouce
    if (rec > 0.6) S.drawFlash(ctx, x + 13, y - 36, 9, Math.floor(this.firedAt));
  }

  // ---------------------------------------------------------- interface
  drawHud(ctx, t) {
    const v = this.viewKey(t);
    // la roulotte
    const hp = this.wagonHp, k = hp / WAGON.hp;
    canvasText(ctx, 'ROULOTTE', W / 2, 3, { color: k < 0.3 ? '#f0705a' : '#f8d070' });
    ctx.fillStyle = OUT; ctx.fillRect(W / 2 - 61, 13, 122, 6);
    ctx.fillStyle = '#5a1a14'; ctx.fillRect(W / 2 - 60, 14, 120, 4);
    ctx.fillStyle = k < 0.3 ? '#e8604c' : k < 0.6 ? '#f8a040' : '#b8e070';
    ctx.fillRect(W / 2 - 60, 14, Math.round(120 * k), 4);
    if (t - this.wagonFlash < 120) { ctx.fillStyle = 'rgba(255,240,220,0.7)'; ctx.fillRect(W / 2 - 60, 14, Math.round(120 * k), 4); }
    // le trajet : où en est la roulotte entre les deux villes, et les étapes
    const prog = clamp(this.cam(t) / (this.duration * WAGON.scroll), 0, 1);
    const x0 = W / 2 - 60, y0 = 27;
    ctx.fillStyle = OUT; ctx.fillRect(x0 - 1, y0 - 1, 122, 3);
    ctx.fillStyle = '#c8a070'; ctx.fillRect(x0, y0, 120, 1);
    ctx.fillStyle = '#f8d070'; ctx.fillRect(x0, y0, Math.round(120 * prog), 1);
    for (const s of STAGES.slice(1)) { ctx.fillStyle = OUT; ctx.fillRect(x0 + Math.round((120 * s.t0) / this.duration), y0 - 2, 1, 5); }
    canvasText(ctx, WAGON.from, x0 - 5, y0 - 4, { align: 'right', color: '#e8d8b8' });
    canvasText(ctx, WAGON.to, x0 + 125, y0 - 4, { align: 'left', color: '#e8d8b8' });
    const wx = Math.round(x0 + 120 * prog);
    ctx.fillStyle = OUT; ctx.fillRect(wx - 4, y0 - 5, 9, 7);
    ctx.fillStyle = '#ece2c8'; ctx.fillRect(wx - 3, y0 - 4, 7, 3);
    ctx.fillStyle = '#7a4a24'; ctx.fillRect(wx - 3, y0 - 1, 7, 1);
    // Black Bart : sa jauge
    const boss = this.boss;
    if (boss && t >= boss.t0 && t < boss.t1 && !this.dead.has(boss.id)) {
      const bh = this.hp.get(boss.id) ?? boss.hp;
      canvasText(ctx, 'BLACK BART', W / 2, 33, { color: '#f0705a' });
      ctx.fillStyle = OUT; ctx.fillRect(W / 2 - 41, 43, 82, 5);
      ctx.fillStyle = '#5a1a14'; ctx.fillRect(W / 2 - 40, 44, 80, 3);
      ctx.fillStyle = '#e8604c'; ctx.fillRect(W / 2 - 40, 44, Math.round((80 * bh) / boss.hp), 3);
    }
    // bandeaux : nouvelle étape, événements. Pendant la partie, petits et en haut, sous la jauge : ils ne cachent pas les bandits
    const st = stageAt(Math.max(0, t));
    const sel = t - st.t0;
    const top = boss && t >= boss.t0 && t < boss.t1 && !this.dead.has(boss.id) ? 52 : 36;
    if (this.banner?.stay) this.drawBanner(ctx, this.banner.text, this.banner.col, Math.min(t - this.banner.at, 1000), this.banner.sub);
    else if (st.i > 0 && sel >= 0 && sel < 2600 && t < this.duration && !this.over) this.drawNote(ctx, st.name, '#f8d070', sel, 2600, top, st.sub);
    else if (this.banner) {
      const el = t - this.banner.at, life = this.banner.short ? 1800 : 2400;
      if (el < life) this.drawNote(ctx, this.banner.text, this.banner.col, el, life, top, this.banner.sub);
    }
    if (v) this.drawTurnBtn(ctx, t);
    this.drawAmmo(ctx, t);
    this.drawBuff(ctx, t);
    if (this.mult > 1 || this.streak >= 2) {
      canvasText(ctx, `SÉRIE ${this.streak}`, W - 6, 4, { align: 'right', color: '#e8d8b8' });
      if (this.mult > 1) canvasText(ctx, `x${this.mult}`, W - 6, 14, { align: 'right', size: 16, color: this.mult >= 3 ? '#f0705a' : '#f8d070' });
    }
    // les viseurs des autres : discrets, pour ne pas cacher les bandits ; leur nom n'apparaît qu'au moment du tir
    for (const [i, r] of Object.entries(this.remote)) {
      if (r.left || (r.f || 0) !== v) continue;
      const col = this.color(+i);
      const el = t - r.shot, shot = el < 150;
      ctx.globalAlpha = shot ? 0.8 : 0.4;
      ring(ctx, Math.round(r.x), Math.round(r.y), shot ? 5 : 3, shot ? 5 : 3, col, 2);
      ctx.globalAlpha = 1;
      if (el < 600) {
        ctx.globalAlpha = 0.75 * (1 - el / 600);
        canvasText(ctx, this.name(+i).slice(0, 3).toUpperCase(), r.x, r.y + 6, { size: 8, color: col });
        ctx.globalAlpha = 1;
      }
    }
    if (this.mouse.in) this.drawCrosshair(ctx, t);
  }

  // le bouton du demi-tour : ce qui se passe dans ton dos, en rouge s'il y a urgence
  drawTurnBtn(ctx, t) {
    const back = -this.face;
    let n = 0, danger = false;
    for (const b of this.world.targets) {
      if (b.t0 > t) break;
      if (b.view !== 'in' || b.end !== back || !active(b, t) || this.isDown(b.id, t)) continue;
      n++;
      if (b.kind === 'boarder' || b.kind === 'boss' || (b.kind === 'barricade' && b.reach - t < 3500) || nextStrike(b, t) - t < 800) danger = true;
    }
    if (this.flying(t, back).length) danger = true;
    const blink = danger && Math.floor(this.now / 180) % 2;
    const B = TURN_BTN;
    const col = blink ? '#f0705a' : n ? '#f8d070' : '#e8d8b8';
    ctx.fillStyle = OUT; ctx.fillRect(B.x - 1, B.y - 1, B.w + 2, B.h + 2);
    ctx.fillStyle = blink ? 'rgba(120,24,16,0.9)' : 'rgba(42,26,16,0.85)'; ctx.fillRect(B.x, B.y, B.w, B.h);
    // flèche de demi-tour
    const ax = B.x + 9, ay = B.y + 4;
    ctx.fillStyle = col;
    ctx.fillRect(ax, ay, 6, 1); ctx.fillRect(ax + 6, ay + 1, 1, 1); ctx.fillRect(ax + 7, ay + 2, 1, 4); ctx.fillRect(ax + 6, ay + 6, 1, 1); ctx.fillRect(ax + 1, ay + 7, 5, 1);
    ctx.fillRect(ax, ay + 6, 1, 3); ctx.fillRect(ax - 1, ay + 7, 1, 1); ctx.fillRect(ax + 1, ay + 7, 1, 1);
    const label = `${this.touch ? '' : 'ESPACE : '}${back > 0 ? 'DEVANT' : 'DERRIÈRE'}`;
    canvasText(ctx, n ? `${label} (${n})` : label, B.x + B.w / 2 + 7, B.y + 4, { color: col });
    // alerte qui pulse au bord de l'écran quand ça arrive dans ton dos
    if (n && t - this.alertAt < 1200 && Math.floor(this.now / 120) % 2) {
      ctx.fillStyle = 'rgba(240,112,90,0.6)';
      ctx.fillRect(B.x - 6, B.y - 6, B.w + 12, 2);
    }
  }

  // petit bandeau en haut de l'écran, juste la largeur du texte (≈ 5,5 px par lettre)
  drawNote(ctx, text, col, el, life, y, sub) {
    const a = el < 200 ? el / 200 : el > life - 400 ? (life - el) / 400 : 1;
    const w = Math.ceil(Math.max(text.length, sub ? sub.length : 0) * 5.5) + 14, h = sub ? 22 : 12;
    ctx.globalAlpha = clamp(a, 0, 1);
    ctx.fillStyle = 'rgba(26,15,10,0.6)';
    ctx.fillRect(rd(W / 2 - w / 2), y, w, h);
    canvasText(ctx, text, W / 2, y + 2, { color: col });
    if (sub) canvasText(ctx, sub, W / 2, y + 12, { color: '#e8d8b8' });
    ctx.globalAlpha = 1;
  }

  // grand bandeau au milieu : seulement pour la fin de partie
  drawBanner(ctx, text, col, el, sub) {
    const a = el < 300 ? el / 300 : el > 2100 ? (2500 - el) / 400 : 1;
    ctx.globalAlpha = clamp(a, 0, 1);
    ctx.fillStyle = 'rgba(26,15,10,0.7)';
    ctx.fillRect(0, 74, W, sub ? 38 : 28);
    // en gros si ça tient dans l'écran (≈ 10,5 px par lettre), sinon en petit
    const big = text.length * 10.5 < W - 16;
    canvasText(ctx, text, W / 2, big ? 80 : 84, { size: big ? 16 : 8, color: col });
    if (sub) canvasText(ctx, sub, W / 2, 100, { color: '#fdf6e0' });
    ctx.globalAlpha = 1;
  }

  drawAmmo(ctx, t) {
    const gold = this.buffOn('gold', t);
    for (let i = 0; i < WAGON.ammo; i++) {
      const x = W - 12 - i * 8, y = H - 16;
      const full = gold || i < this.ammo;
      ctx.fillStyle = OUT; ctx.fillRect(x - 1, y - 1, 6, 13);
      ctx.fillStyle = full ? (gold ? '#f8e08a' : '#e0b040') : '#4a3a2a'; ctx.fillRect(x, y + 3, 4, 8);
      ctx.fillStyle = full ? (gold ? '#fff8d0' : '#c8c0b8') : '#3a2e28'; ctx.fillRect(x, y, 4, 3);
    }
    if (this.reloadUntil) canvasText(ctx, 'RECHARGE...', W - 30, H - 28, { color: '#f8d070' });
    else if (this.ammo === 0 && !gold && this.playing && Math.floor(this.now / 300) % 2) canvasText(ctx, this.touch ? 'RECHARGER !' : 'CLIC DROIT : RECHARGER', W - (this.touch ? 40 : 90), H - 28, { color: '#f0705a' });
  }

  // bonus personnel en cours : icône et temps restant
  drawBuff(ctx, t) {
    const list = [];
    if (this.buff && t < this.buff.until) list.push(this.buff);
    if (this.x2Until > t && this.buff?.type !== 'x2') list.push({ type: 'x2', until: this.x2Until });
    list.forEach((b, i) => {
      const x = 6, y = H - 22 - i * 22;
      const spr = bonusIcon(b.type);
      ctx.drawImage(spr, x, y);
      canvasText(ctx, BONUS[b.type].name, x + 22, y + 1, { align: 'left', color: '#f8d070' });
      const k = clamp((b.until - t) / WAGON.buffMs, 0, 1);
      ctx.fillStyle = OUT; ctx.fillRect(x + 21, y + 12, 52, 4);
      ctx.fillStyle = '#f8d070'; ctx.fillRect(x + 22, y + 13, Math.round(50 * k), 2);
    });
  }

  drawCrosshair(ctx, t) {
    const x = Math.round(this.mouse.x), y = Math.round(this.mouse.y);
    const col = this.color(this.me);
    const r = this.buffOn('shotgun', t) ? SHOT_R : 6;
    if (this.viewKey(t) && this.inTurnBtn(this.mouse)) { // sur le bouton : une main plutôt qu'un viseur
      ctx.fillStyle = OUT; ctx.fillRect(x - 1, y - 1, 5, 8);
      ctx.fillStyle = '#fdf6e0'; ctx.fillRect(x, y, 3, 6);
      return;
    }
    const seg = (dx, dy, w, h) => {
      ctx.fillStyle = OUT; ctx.fillRect(x + dx + 1, y + dy + 1, w, h);
      ctx.fillStyle = col; ctx.fillRect(x + dx, y + dy, w, h);
    };
    ring(ctx, x + 1, y + 1, r, r, OUT);
    ring(ctx, x, y, r, r, col);
    seg(-r - 4, 0, 6, 1); seg(r - 1, 0, 6, 1); seg(0, -r - 4, 1, 6); seg(0, r - 1, 1, 6);
    ctx.fillStyle = '#fdf6e0'; ctx.fillRect(x, y, 1, 1);
  }

  mood() {
    const m = super.mood();
    if (!this.inView || this.over) return m;
    return { ...m, level: Math.max(m.level, stageAt(this.t).id === 'bart' ? 0.9 : 0.75) };
  }

  hudStats() {
    return [['ABATTUS', this.kills || 0, 'yellow'], ['BALLES', this.buffOn('gold', this.t) ? '∞' : `${this.ammo}/${WAGON.ammo}`, 'green'], ['ROULOTTE', `${this.wagonHp}/${WAGON.hp}`, 'salmon']];
  }
}
