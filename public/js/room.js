// Décor de la Roulette : quatre lieux (saloon, cantina, wagon-bar du train, bureau du shérif), chacun
// avec ses éléments animés, et une ambiance (heure, météo) visible par les fenêtres et dans l'éclairage.
// Lieu et ambiance sont tirés de la graine de la partie : les deux joueurs voient la même chose.
import * as S from './sprites.js';
import { pickEnv, Ambience, desertOpts, skyDeco } from './env.js';
import { rng } from './worlds.js';
import { sfx } from './audio.js';

const W = 384, H = 216;
const OUT = S.OUT;
const TAU = Math.PI * 2;

const hash = (n) => {
  let t = (n * 0x6d2b79f5) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const clamp01 = (k) => (k < 0 ? 0 : k > 1 ? 1 : k);
const smooth = (k) => { k = clamp01(k); return k * k * (3 - 2 * k); };

function paint(ctx) {
  const R = (x, y, w, h, col) => { ctx.fillStyle = col; ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };
  const box = (x, y, w, h, col) => { R(x - 1, y - 1, w + 2, h + 2, OUT); R(x, y, w, h, col); };
  return { R, box };
}
function seeded(s) { return () => ((s = (s * 9301 + 49297) % 233280) / 233280); }

// Éclairage intérieur selon l'ambiance (multiplication du décor du fond)
const ROOM_TINT = {
  aube: '#f4e4e4', crepuscule: '#f4d0b8', nuit: '#9c96c4', orage: '#b4b6c8', poussiere: '#f0e0c8', neige: '#e4e8f4',
};

// ------------------------------------------------------------ petits personnages et objets animés
function drawLamp(ctx, ax, ay, len, a) {
  const { R } = paint(ctx);
  const x = Math.round(ax + Math.sin(a) * len), y = Math.round(ay + Math.cos(a) * len);
  for (let k = 0; k <= len; k += 2) R(ax + Math.sin(a) * k, ay + Math.cos(a) * k, 1, 2, '#2a1810');
  R(x - 5, y - 1, 11, 5, OUT); R(x - 4, y, 9, 3, '#a06a20');
  R(x - 4, y + 3, 9, 10, OUT); R(x - 3, y + 3, 7, 9, '#a06a20');
  R(x - 2, y + 4, 5, 6, '#f8e08a'); R(x - 1, y + 5, 3, 3, '#fffbe0');
  R(x - 5, y + 12, 11, 3, OUT); R(x - 4, y + 12, 9, 2, '#a06a20');
  return { x, y: y + 7 };
}

function drawFly(ctx, cx, cy, now, ph = 0) {
  const x = Math.round(cx + Math.sin(now / 170 + ph) * 22 + Math.sin(now / 53 + ph) * 5);
  const y = Math.round(cy + Math.cos(now / 230 + ph) * 12 + Math.sin(now / 41) * 2);
  ctx.fillStyle = '#1a0f0a'; ctx.fillRect(x, y, 1, 1);
  if (Math.floor(now / 40) % 2) { ctx.fillStyle = 'rgba(220,230,240,0.7)'; ctx.fillRect(x - 1, y - 1, 1, 1); ctx.fillRect(x + 1, y - 1, 1, 1); }
}

// Barman : il fait les cent pas derrière le comptoir et essuie un verre
function drawBartender(ctx, x, now, wiping) {
  const { R, box } = paint(ctx);
  const skin = '#eab78e';
  const step = wiping ? 0 : Math.floor(now / 160) % 2;
  box(x - 9, 62 - step, 18, 26, '#e8e0d0');
  R(x - 9, 62 - step, 4, 26, '#2a2622'); R(x + 5, 62 - step, 4, 26, '#2a2622');
  R(x - 2, 63 - step, 4, 2, '#c0392b');
  R(x - 9, 74 - step, 18, 1, '#c8c0b0'); R(x - 9, 80 - step, 18, 8, '#f4ecd8'); // tablier
  const hy = 48 - step;
  box(x - 6, hy, 12, 13, skin);
  R(x - 3, hy + 1, 3, 1, '#f8d8b8');
  R(x - 6, hy + 4, 2, 5, '#4a3a2a'); R(x + 4, hy + 4, 2, 5, '#4a3a2a');
  if ((now % 3300) > 120) { R(x - 3, hy + 5, 1, 1, OUT); R(x + 2, hy + 5, 1, 1, OUT); }
  R(x - 4, hy + 8, 8, 2, '#3a2a1a'); R(x - 5, hy + 9, 1, 1, '#3a2a1a'); R(x + 4, hy + 9, 1, 1, '#3a2a1a');
  if (wiping) {
    // verre tenu à hauteur de poitrine, chiffon qui tourne
    const a = now / 160;
    box(x - 3, 70, 6, 8, '#c8d8e0'); R(x - 2, 74, 4, 3, '#d9a040');
    R(x - 11, 64, 3, 9, '#e8e0d0'); R(x - 9, 72, 6, 3, '#e8e0d0'); R(x - 4, 72, 2, 3, skin);
    const cx = Math.round(x + 1 + Math.cos(a) * 2), cy = Math.round(69 + Math.sin(a) * 2);
    R(x + 8, 64, 3, 6, '#e8e0d0'); R(cx + 2, cy, 6, 3, '#e8e0d0');
    box(cx - 2, cy - 1, 5, 4, '#f4ecd8'); R(cx + 1, cy + 1, 2, 2, skin);
  } else {
    R(x - 11, 64 - step, 3, 18, '#e8e0d0'); R(x + 8, 64 - step, 3, 18, '#e8e0d0');
    R(x - 11, 81 - step, 3, 3, skin); R(x + 8, 81 - step, 3, 3, skin);
  }
}

// Chat noir qui se promène sur le comptoir
function drawCat(ctx, x, base, dir, now, sitting) {
  const { R } = paint(ctx);
  const col = '#2a2428', o = OUT;
  const f = sitting ? 0 : Math.floor(now / 140) % 2;
  const X = (dx) => Math.round(x + dx * dir);
  const P = (dx, dy, w, h, c) => R(dir > 0 ? x + dx : x - dx - w + 1, base + dy, w, h, c);
  if (sitting) {
    P(-5, -9, 9, 9, o); P(-4, -8, 7, 8, col);
    P(2, -14, 7, 7, o); P(3, -13, 5, 5, col); P(3, -15, 1, 2, col); P(6, -15, 1, 2, col);
    const sw = Math.round(Math.sin(now / 300) * 2);
    P(-8, -3 + sw, 4, 2, col); P(-9, -6 + sw, 2, 4, col);
  } else {
    P(-7, -8, 14, 6, o); P(-6, -7, 12, 4, col);
    P(5, -11, 6, 6, o); P(6, -10, 4, 4, col); P(6, -12, 1, 2, col); P(9, -12, 1, 2, col);
    P(-9, -12, 2, 6, col); P(-10, -13, 2, 2, col);
    for (const [lx, ph] of [[-5, 0], [-2, 1], [2, 0], [5, 1]]) P(lx, -3, 1, 3 - ((f + ph) % 2), col);
  }
  if ((now % 2900) > 140) P(sitting ? 6 : 8, sitting ? -11 : -9, 1, 1, '#c8e040');
  return X;
}

// Mariachi en traje de charro, debout derrière la table (le bas des jambes est caché) :
// il joue de la guitare, de la trompette ou des maracas selon la partie.
// Renvoie le point d'où s'envolent les notes (null quand il ne joue pas).
const MARIACHI = ['guitar', 'trumpet', 'maracas'];
function drawMariachi(ctx, mx, now, kind = 'guitar') {
  ctx.save();
  ctx.translate(0, 8); // sous la seconde guirlande de papel picado
  const src = mariachiBody(ctx, mx, now, kind);
  ctx.restore();
  return src && { x: src.x, y: src.y + 8 };
}
function mariachiBody(ctx, mx, now, kind) {
  const { R } = paint(ctx);
  // forme pleine cernée de noir : lignes [y, x0, x1], x relatifs à mx
  const blob = (rows, col) => {
    for (const [y, x0, x1] of rows) R(mx + x0 - 1, y - 1, x1 - x0 + 3, 3, OUT);
    for (const [y, x0, x1] of rows) R(mx + x0, y, x1 - x0 + 1, 1, col);
  };
  const span = (y0, y1, x0, x1) => { const r = []; for (let y = y0; y <= y1; y++) r.push([y, x0, x1]); return r; };
  // membre épais (manche de veste) d'un point à l'autre, cerné
  const limb = (pts, w, col) => {
    for (const pass of [0, 1]) for (let i = 1; i < pts.length; i++) {
      const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
      const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
      for (let k = 0; k <= n; k++) {
        const x = mx + x0 + ((x1 - x0) * k) / n, y = y0 + ((y1 - y0) * k) / n;
        if (pass) R(x, y, w, w, col); else R(x - 1, y - 1, w + 2, w + 2, OUT);
      }
    }
  };
  const hand = (x, y) => { R(mx + x - 1, y - 1, 6, 5, OUT); R(mx + x, y, 4, 3, skin); R(mx + x, y + 2, 4, 1, skinD); R(mx + x - 1, y + 3, 6, 1, silver); };

  const skin = '#c98e5e', skinD = '#a06a3c', skinL = '#dfa874';
  const suit = '#26211f', suitL = '#3e3633', suitD = '#141010';
  const silver = '#dcdce4', silverD = '#8a8a98';
  const shirt = '#f4ecd8', red = '#c0392b', redD = '#8a2218', hair = '#1e1410';
  const felt = '#e8d4a0', feltD = '#bfa26a', feltL = '#f6e8c0', gold = '#d4a030';
  const brass = '#e0b040', brassL = '#f8e488', brassD = '#9a6e1c';

  const beat = Math.floor(now / 420);
  const b = beat % 2; // il marque le temps
  const blink = (now % 3100) < 130;
  const trumpetUp = kind !== 'trumpet' || (beat % 8) < 6; // la trompette souffle 6 temps, respire 2
  const puff = kind === 'trumpet' && trumpetUp;

  // pantalon (bas caché par la table) avec la botonadura d'argent sur les coutures
  blob(span(86, 127, -8, 7), suit);
  R(mx - 1, 96, 1, 32, suitD); R(mx - 8, 88, 2, 40, suitL);
  for (let y = 90; y < 128; y += 5) { R(mx - 7, y, 1, 2, silver); R(mx + 6, y, 1, 2, silver); R(mx - 7, y + 1, 1, 1, silverD); R(mx + 6, y + 1, 1, 1, silverD); }
  // ceinture et boucle
  blob(span(85 + b, 87 + b, -9, 8), '#5a3a20');
  R(mx - 9, 85 + b, 18, 1, '#7a5230');
  R(mx - 2, 84 + b, 5, 5, OUT); R(mx - 1, 85 + b, 3, 3, silver); R(mx, 86 + b, 1, 1, silverD);
  // veste courte (chaquetilla) : épaules, plastron ouvert sur la chemise, broderies d'argent
  blob([[65 + b, -7, 6], [66 + b, -9, 8], ...span(67 + b, 78 + b, -10, 9), ...span(79 + b, 83 + b, -9, 8)], suit);
  R(mx - 10, 67 + b, 2, 12, suitL); R(mx - 8, 66 + b, 5, 1, suitL); R(mx + 8, 68 + b, 2, 11, suitD);
  for (let k = 0; k < 9; k++) {
    const hw = 3 - Math.floor(k / 3), y = 65 + b + k;
    R(mx - hw, y, hw * 2, 1, shirt);
    if (k % 2 === 0) { R(mx - hw - 1, y, 1, 1, silver); R(mx + hw, y, 1, 1, silver); }
  }
  R(mx - 1, 68 + b, 2, 6, '#e0d6c0');
  // arabesques brodées sur la poitrine et l'ourlet
  for (const s of [-1, 1]) {
    const px = (dx) => (s < 0 ? mx + dx : mx - dx - 1);
    for (const [dx, dy] of [[-8, 70], [-7, 69], [-6, 70], [-6, 71], [-7, 72], [-8, 73], [-5, 73], [-4, 74], [-6, 76], [-7, 77], [-5, 77]]) R(px(dx), dy + b, 1, 1, silver);
  }
  for (let x = -8; x <= 7; x += 2) R(mx + x, 83 + b, 1, 1, silverD);
  // cou et moño (grand nœud rouge)
  R(mx - 2, 62 + b, 4, 3, skinD);
  blob([[64 + b, -6, -3], [65 + b, -6, 5], [66 + b, -6, -3], [64 + b, 2, 5], [66 + b, 2, 5]], red);
  R(mx - 6, 66 + b, 4, 1, redD); R(mx + 2, 66 + b, 4, 1, redD); R(mx - 1, 64 + b, 2, 3, redD); R(mx - 5, 64 + b, 1, 1, '#e05a48');

  // tête
  const cheek = puff ? 7 : 6;
  blob([[50 + b, -5, 4], ...span(51 + b, 54 + b, -6, 5), ...span(55 + b, 57 + b, -7, 6), ...span(58 + b, 60 + b, -cheek, cheek - 1), [61 + b, -5, 4], [62 + b, -4, 3]], skin);
  R(mx - 7, 56 + b, 1, 1, skinD); R(mx + 6, 56 + b, 1, 1, skinD);
  R(mx - 6, 51 + b, 1, 5, hair); R(mx + 5, 51 + b, 1, 5, hair); // favoris
  R(mx - 5, 52 + b, 10, 1, skinD); // ombre du bord du chapeau
  R(mx + 3, 57 + b, 2, 4, skinD); R(mx - 5, 57 + b, 1, 2, skinL);
  if (puff) { R(mx - 6, 58 + b, 2, 2, skinL); R(mx + 4, 58 + b, 2, 2, '#d89a68'); }
  R(mx - 4, 53 + b, 3, 1, hair); R(mx + 1, 53 + b, 3, 1, hair); // sourcils
  if (blink || puff) { R(mx - 4, 55 + b, 3, 1, OUT); R(mx + 1, 55 + b, 3, 1, OUT); } else {
    R(mx - 4, 55 + b, 3, 2, shirt); R(mx + 1, 55 + b, 3, 2, shirt);
    R(mx - 3, 55 + b, 2, 2, OUT); R(mx + 1, 55 + b, 2, 2, OUT);
  }
  R(mx - 1, 55 + b, 2, 3, skinL); R(mx - 1, 58 + b, 2, 1, skinD); // nez
  // grosse moustache
  R(mx - 4, 59 + b, 8, 2, hair); R(mx - 5, 60 + b, 1, 2, hair); R(mx + 4, 60 + b, 1, 2, hair); R(mx - 3, 59 + b, 2, 1, '#3a2a20');
  if (kind !== 'trumpet') {
    const sing = (now % 840) < 560;
    if (sing) { R(mx - 1, 61 + b, 3, 2, '#5a1a14'); R(mx, 62 + b, 1, 1, '#c0504a'); } else R(mx - 1, 61 + b, 3, 1, skinD);
  }

  // sombrero brodé : calotte pointue, large bord relevé aux extrémités
  blob([[33 + b, -2, 1], [34 + b, -3, 2], ...span(35 + b, 37 + b, -4, 3), ...span(38 + b, 42 + b, -5, 4), ...span(43 + b, 46 + b, -6, 5)], felt);
  R(mx - 4, 36 + b, 1, 9, feltL); R(mx - 3, 34 + b, 1, 3, feltL); R(mx + 3, 37 + b, 2, 9, feltD); R(mx - 1, 33 + b, 1, 5, feltD);
  R(mx - 6, 44 + b, 12, 2, gold); for (let x = -5; x < 6; x += 3) R(mx + x, 44 + b, 1, 1, red);
  for (const [dx, dy] of [[-3, 40], [-2, 39], [-1, 40], [0, 39], [1, 40], [2, 41], [-2, 42], [1, 42]]) R(mx + dx, dy + b, 1, 1, gold);
  blob([[44 + b, -19, -18], [45 + b, -19, -17], [46 + b, -14, 13], [44 + b, 17, 18], [45 + b, 16, 18], [47 + b, -17, 16], [48 + b, -19, 18], [49 + b, -19, 18], [50 + b, -16, 15]], felt);
  R(mx - 14, 46 + b, 28, 1, feltL); R(mx - 19, 49 + b, 38, 1, feltD); R(mx - 16, 50 + b, 32, 1, feltD);
  for (let x = -18; x <= 17; x += 3) R(mx + x, 48 + b, 2, 1, gold);
  R(mx - 19, 44 + b, 1, 2, gold); R(mx + 18, 44 + b, 1, 2, gold);

  // instrument et bras
  if (kind === 'guitar') {
    const strum = [0, 2, 1, -1][Math.floor(now / 110) % 4];
    const slide = [0, -2, -4, -2][Math.floor(now / 880) % 4];
    const neckY = (x) => 83 + b - (-6 - x) * 0.62;
    // manche et tête
    for (const pass of [0, 1]) for (let x = -6; x >= -27; x--) {
      const y = neckY(x);
      if (pass) { R(mx + x, y, 1, 3, '#5a3a20'); R(mx + x, y + 1, 1, 1, '#8a6a48'); if (x % 4 === 0) R(mx + x, y, 1, 1, '#e8d8b0'); } else R(mx + x - 1, y - 1, 3, 5, OUT);
    }
    blob([[65 + b, -31, -29], ...span(66 + b, 68 + b, -32, -27), [69 + b, -31, -28]], '#8a5a30');
    R(mx - 31, 67 + b, 3, 1, '#5a3a20');
    for (const [dx, dy] of [[-33, 66], [-33, 68], [-30, 64], [-28, 65]]) R(mx + dx, dy + b, 1, 1, silver);
    // caisse
    S.disc(ctx, mx + 4, 91 + b, 9, OUT); S.disc(ctx, mx - 3, 85 + b, 7, OUT);
    S.disc(ctx, mx + 4, 91 + b, 8, '#c8783c'); S.disc(ctx, mx - 3, 85 + b, 6, '#c8783c');
    S.disc(ctx, mx - 4, 84 + b, 4, '#dc9450'); S.disc(ctx, mx + 6, 93 + b, 5, '#b8692e');
    S.disc(ctx, mx, 88 + b, 3, gold); S.disc(ctx, mx, 88 + b, 2, '#2a1810');
    R(mx + 4, 93 + b, 5, 2, '#3a2214');
    for (let k = 0; k <= 10; k++) R(mx + 5 - k, 93 + b - k * 0.62, 1, 1, 'rgba(240,228,200,0.6)');
    // bras droit qui gratte, bras gauche sur le manche
    const hy = 87 + b + strum;
    limb([[8, 67 + b], [12, 79 + b], [7, hy]], 4, suit);
    hand(5, hy);
    const fx = -20 + slide;
    limb([[-11, 67 + b], [-16, 78 + b], [fx - 1, neckY(fx) + 1]], 4, suit);
    hand(fx - 1, Math.round(neckY(fx)));
    return { x: mx + 6, y: 80 + b };
  }
  if (kind === 'trumpet') {
    const ty = b + (trumpetUp ? 0 : 3);
    const press = trumpetUp ? Math.floor(now / 210) % 3 : -1;
    // bras derrière l'instrument, mains par-dessus
    limb([[8, 67 + b], [13, 77 + b], [7, 63 + ty]], 4, suit);
    limb([[-11, 67 + b], [-14, 77 + b], [1, 66 + ty]], 4, suit);
    // coulisse du bas, tube principal, pistons, pavillon
    blob(span(65 + ty, 66 + ty, 3, 13), brassD);
    blob(span(62 + ty, 64 + ty, 3, 3), brass); blob(span(62 + ty, 64 + ty, 13, 13), brass);
    blob(span(60 + ty, 61 + ty, 0, 19), brass);
    R(mx, 60 + ty, 20, 1, brassL);
    blob(span(58 + ty, 63 + ty, 6, 10), brass);
    R(mx + 6, 58 + ty, 1, 6, brassL); R(mx + 10, 58 + ty, 1, 6, brassD);
    for (let i = 0; i < 3; i++) { const py = 55 + ty + (i === press ? 1 : 0); R(mx + 5 + i * 2, py - 1, 3, 4, OUT); R(mx + 6 + i * 2, py, 1, 2, silver); }
    for (const pass of [0, 1]) for (let i = 0; i <= 6; i++) {
      const half = [1, 1, 1, 2, 3, 4, 5][i], x = mx + 19 + i, y0 = 60 + ty - half + 1, h = half * 2;
      if (pass) { R(x, y0, 1, h, i === 6 ? brassL : brass); R(x, y0 + h - 1, 1, 1, brassD); } else R(x - 1, y0 - 1, 3, h + 2, OUT);
    }
    R(mx - 1, 60 + ty, 2, 2, silver); // embouchure
    hand(6, 62 + ty);
    hand(0, 65 + ty);
    return trumpetUp ? { x: mx + 26, y: 56 + ty } : null;
  }
  // maracas secouées en alternance
  const shake = Math.floor(now / 130) % 2;
  for (const [s, up, col] of [[-1, shake, red], [1, 1 - shake, '#3aa858']]) {
    const hx = s < 0 ? -18 : 14, hy = 67 + b - up * 3;
    limb(s < 0 ? [[-11, 67 + b], [-18, 79 + b], [hx + 1, hy + 2]] : [[8, 67 + b], [15, 79 + b], [hx, hy + 2]], 4, suit);
    R(mx + hx, hy - 5, 3, 6, OUT); R(mx + hx + 1, hy - 4, 1, 5, '#7a4a24');
    S.disc(ctx, mx + hx + 1, hy - 8, 4, OUT); S.disc(ctx, mx + hx + 1, hy - 8, 3, col);
    R(mx + hx - 2, hy - 8, 7, 1, '#f8c838'); R(mx + hx - 1, hy - 10, 1, 1, '#ffffff'); R(mx + hx + 1, hy - 6, 3, 1, S.shade(col, -0.3));
    if (up) for (const [dx, dy] of [[-4, -10], [-4, -7], [6, -10], [6, -7]]) R(mx + hx + dx, hy + dy, 1, 1, shirt);
    hand(hx - 1, hy);
  }
  return { x: mx + 2, y: 46 + b };
}

// Note de musique qui s'envole
function note(ctx, x, y, col) {
  ctx.fillStyle = col;
  ctx.fillRect(x, y, 1, 5); ctx.fillRect(x - 2, y + 4, 3, 2); ctx.fillRect(x + 1, y, 2, 1); ctx.fillRect(x + 2, y + 1, 1, 1);
}

function drawParrot(ctx, x, now) {
  const { R } = paint(ctx);
  R(x, 4, 1, 20, '#3a2a1a'); R(x - 7, 24, 15, 2, OUT); R(x - 6, 24, 13, 1, '#7a4a24');
  const bob = (now % 2600) < 200 ? 1 : 0;
  const flap = (now % 9000) < 700 && Math.floor(now / 90) % 2;
  R(x - 4, 13, 8, 11, OUT); R(x - 3, 14, 6, 9, '#3a9a3a'); R(x - 2, 20, 3, 6, '#3a6ec0');
  if (flap) { R(x - 8, 12, 5, 3, '#3a9a3a'); R(x + 3, 12, 5, 3, '#3a9a3a'); R(x - 9, 11, 2, 2, '#3a6ec0'); R(x + 7, 11, 2, 2, '#3a6ec0'); }
  R(x - 3, 8 + bob, 7, 7, OUT); R(x - 2, 9 + bob, 5, 5, '#c0392b'); R(x + 3, 10 + bob, 2, 3, '#e0b040');
  R(x, 10 + bob, 1, 1, OUT); R(x - 1, 9 + bob, 1, 1, '#f4ecd8');
}

// Prisonnier qui fait les cent pas dans sa cellule
const PRISONER = { skin: 2, hat: 'none', hatColor: 0, hair: 'messy', hairColor: 1, eyes: 'tired', nose: 'broken', mouth: 'frown', beard: 'stubble', outfit: 'shirt', outfitColor: 5 };

// ------------------------------------------------------------ les lieux
// windows : ouvertures sur l'extérieur ; lamps(now, room) : sources de lumière animées ; render() : décor fixe
// (bg = fond, mid = premier plan du décor) ; anim() : derrière le premier plan ; front() : devant.
const ROOMS = {
  saloon: {
    name: 'LE SALOON',
    windows: [{ x: 286, y: 20, w: 72, h: 58 }],
    render(bg, mid) {
      const { R, box } = paint(bg);
      const rnd = seeded(3);
      for (let x = 0; x < W; x += 16) {
        const col = (x / 16) % 2 ? '#6a4028' : '#5e3822';
        R(x, 0, 16, 140, col); R(x, 0, 1, 140, '#3a2214'); R(x + 1, 0, 1, 140, S.shade(col, 0.1));
        for (let k = 0; k < 2; k++) R(x + 4 + Math.floor(rnd() * 8), 10 + Math.floor(rnd() * 80), 2, 1, '#3a2214');
        for (let y = 0; y < 140; y += 3) if (rnd() < 0.15) R(x + 2 + Math.floor(rnd() * 13), y, 1, 2, S.shade(col, -0.12));
      }
      R(0, 92, W, 4, '#3a2214'); R(0, 92, W, 1, '#8a5a34'); R(0, 96, W, 44, '#4a2c18');
      for (let x = 6; x < W; x += 42) { R(x, 100, 34, 30, '#3e2414'); R(x + 1, 101, 32, 1, '#5e3a22'); }
      R(0, 0, W, 7, '#2a1810'); R(0, 7, W, 1, OUT); R(0, 5, W, 1, '#4a2c18');
      // miroir et étagères du bar
      box(10, 10, 108, 72, '#4a2a18');
      R(14, 14, 100, 20, '#6a7a80'); R(16, 16, 30, 2, '#8a9aa0'); R(60, 22, 20, 1, '#8a9aa0');
      const bottleCols = ['#c07a2a', '#4a7a3a', '#7a3a1a', '#9ab8c8', '#d9a040', '#6a2a2a', '#3a5a2a'];
      for (const sy of [38, 64]) {
        for (let bx = 14; bx < 112;) {
          const bw = 4 + Math.floor(rnd() * 3), bh = 9 + Math.floor(rnd() * 7);
          const col = bottleCols[Math.floor(rnd() * bottleCols.length)];
          R(bx - 1, sy - bh - 1, bw + 2, bh + 1, OUT);
          R(bx, sy - bh + 4, bw, bh - 4, col); R(bx + Math.floor(bw / 2) - 1, sy - bh, 2, 4, col);
          R(bx + 1, sy - bh + 5, 1, bh - 6, S.shade(col, 0.35));
          if (rnd() < 0.6) R(bx, sy - bh + 8, bw, 3, '#e8d8b0');
          bx += bw + 3 + Math.floor(rnd() * 3);
        }
        box(10, sy, 108, 3, '#7a4a28'); R(10, sy, 108, 1, '#a8703c');
      }
      // affiche WANTED
      box(246, 22, 26, 34, '#d8c088');
      R(249, 25, 20, 3, '#5a3a20'); R(253, 31, 12, 12, '#a88a5a'); R(255, 33, 8, 8, '#7a5a38'); R(256, 30, 6, 3, '#5a3a20');
      R(250, 46, 18, 2, '#5a3a20'); R(252, 50, 14, 1, '#7a5a38'); R(256, 52, 6, 1, '#c84a3a');
      // crâne de bœuf
      const bx = 184, by = 12;
      for (const [x, y, w, h] of [[bx, by, 16, 9], [bx + 3, by + 9, 10, 6], [bx - 10, by - 2, 10, 3], [bx + 16, by - 2, 10, 3], [bx - 12, by - 6, 3, 4], [bx + 25, by - 6, 3, 4]]) R(x - 1, y - 1, w + 2, h + 2, OUT);
      for (const [x, y, w, h] of [[bx, by, 16, 9], [bx + 3, by + 9, 10, 6], [bx - 10, by - 2, 10, 3], [bx + 16, by - 2, 10, 3], [bx - 12, by - 6, 3, 4], [bx + 25, by - 6, 3, 4]]) R(x, y, w, h, '#e8dcc0');
      R(bx + 3, by + 3, 3, 3, OUT); R(bx + 10, by + 3, 3, 3, OUT); R(bx + 6, by + 11, 1, 2, OUT); R(bx + 9, by + 11, 1, 2, OUT);
      // pianola (les touches bougent toutes seules)
      box(254, 94, 76, 34, '#3a2214'); R(252, 91, 80, 4, OUT); R(253, 92, 78, 2, '#5a3422');
      R(258, 98, 68, 12, '#2a1810'); box(280, 99, 24, 8, '#e8dcc0');
      R(262, 100, 12, 6, '#6a4a2a'); R(310, 100, 12, 6, '#6a4a2a');
      // horloge
      box(338, 94, 14, 34, '#6a3a1a'); S.disc(bg, 345, 102, 4, '#f0e0b0'); R(345, 99, 1, 3, OUT); R(345, 102, 2, 1, OUT);
      R(340, 109, 10, 16, '#2a1810');
      // fenêtre : le dehors est découpé
      bg.clearRect(286, 20, 72, 58);
      // premier plan : cadre de fenêtre, comptoir
      const M = paint(mid);
      M.R(281, 15, 82, 5, OUT); M.R(282, 16, 80, 3, '#4a2c18');
      M.R(281, 77, 82, 3, OUT); M.R(281, 15, 6, 66, OUT); M.R(282, 16, 4, 64, '#4a2c18'); M.R(357, 15, 6, 66, OUT); M.R(358, 16, 4, 64, '#4a2c18');
      M.R(320, 20, 2, 58, '#4a2c18'); M.R(286, 48, 72, 2, '#4a2c18');
      M.box(282, 80, 80, 4, '#7a4a28'); M.R(282, 80, 80, 1, '#a8703c');
      M.box(0, 84, 128, 4, '#a8703c'); M.R(0, 84, 128, 1, '#d09858');
      M.box(0, 88, 126, 40, '#5a3018');
      for (let x = 4; x < 120; x += 30) { M.box(x, 94, 24, 26, '#4a2810'); M.R(x + 1, 95, 22, 1, '#6a3a1a'); }
      M.R(0, 122, 126, 2, '#e0b040');
    },
    lamps(now) {
      return [140, 236].map((lx, i) => ({ lx, a: Math.sin(now / 1500 + i * 2) * 0.06, len: 12, r: 46 }));
    },
    anim(ctx, now, room) {
      const { R } = paint(ctx);
      // barman : va-et-vient avec des pauses pour essuyer un verre
      const T = now % 16000;
      const pos = T < 4000 ? smooth(T / 4000) : T < 8000 ? 1 : T < 12000 ? 1 - smooth((T - 8000) / 4000) : 0;
      drawBartender(ctx, Math.round(36 + pos * 54), now, (T > 4000 && T < 8000) || T > 12000);
      // pendule de l'horloge
      const a = Math.sin(now / 520) * 0.4;
      const px = Math.round(345 + Math.sin(a) * 10), py = Math.round(110 + Math.cos(a) * 10);
      for (let k = 0; k <= 10; k++) R(345 + Math.sin(a) * k, 110 + Math.cos(a) * k, 1, 1, '#c8a040');
      S.disc(ctx, px, py + 2, 2, '#e0b040');
      // pianola : touches enfoncées et rouleau perforé qui défile
      R(256, 112, 72, 6, OUT); R(257, 112, 70, 5, '#f4ecd8');
      const beat = Math.floor(now / 140);
      for (let k = 0; k < 23; k++) {
        if (hash(beat * 31 + k) < 0.13) R(257 + k * 3, 113, 2, 4, '#b8b098');
        if (k % 7 !== 2 && k % 7 !== 6) R(259 + k * 3, 112, 2, 3, OUT);
      }
      for (let i = 0; i < 9; i++) R(282 + ((i * 7) % 20), 100 + ((i * 3 + now * 0.006) % 6), 1, 1, '#5a3a20');
    },
    front(ctx, now) {
      // chat sur le comptoir
      const T = now % 30000;
      if (T < 7000) drawCat(ctx, Math.round(-14 + (84 * T) / 7000), 84, 1, now, false);
      else if (T < 13000) drawCat(ctx, 70, 84, 1, now, true);
      else if (T < 20000) drawCat(ctx, Math.round(70 - (84 * (T - 13000)) / 7000), 84, -1, now, false);
      // fumée de cigare sous le plafond
      for (let b = 0; b < 3; b++) {
        const off = (now * 0.004 * (b + 1) + b * 140) % (W + 120) - 60;
        for (let k = 0; k < 5; k++) S.disc(ctx, Math.round(off + k * 14), 22 + b * 9 + Math.round(Math.sin(now / 900 + k) * 2), 6, 'rgba(230,220,200,0.05)');
      }
      drawFly(ctx, 330, 60, now);
    },
  },

  cantina: {
    name: 'LA CANTINA',
    windows: [{ x: 24, y: 20, w: 72, h: 66, arch: true }],
    render(bg, mid) {
      const { R, box } = paint(bg);
      const rnd = seeded(5);
      R(0, 0, W, 128, '#d8a878');
      for (let i = 0; i < 260; i++) R(rnd() * W, rnd() * 92, 2 + rnd() * 4, 1 + rnd() * 2, rnd() < 0.5 ? '#e4b888' : '#c89868');
      for (let i = 0; i < 6; i++) { let x = rnd() * W, y = 10 + rnd() * 60; for (let k = 0; k < 8; k++) { R(x, y, 1, 1, '#a87850'); x += rnd() < 0.5 ? 1 : 0; y += 1; } }
      // poutres (vigas)
      R(0, 0, W, 5, '#6a4024');
      for (let x = 20; x < W; x += 46) { S.disc(bg, x, 7, 5, OUT); S.disc(bg, x, 7, 4, '#7a4a24'); S.disc(bg, x, 7, 2, '#5a3418'); }
      // frise de carreaux peints
      R(0, 90, W, 3, '#a8503a');
      for (let x = 0; x < W; x += 12) for (let y = 93; y < 128; y += 12) {
        const alt = ((x + y) / 12) % 2;
        R(x, y, 12, 12, alt ? '#f0e8d8' : '#e8d8b8'); R(x, y, 12, 1, '#a89878'); R(x, y, 1, 12, '#a89878');
        R(x + 4, y + 4, 4, 4, alt ? '#3a6ec0' : '#e0b040'); R(x + 5, y + 2, 2, 8, alt ? '#3a6ec0' : '#c0392b'); R(x + 2, y + 5, 8, 2, alt ? '#3a6ec0' : '#c0392b');
      }
      // niches à bougie
      for (const nx of [114, 248]) { R(nx, 30, 14, 18, '#a87850'); R(nx + 1, 28, 12, 2, '#a87850'); R(nx + 3, 27, 8, 1, '#a87850'); R(nx + 1, 46, 12, 2, '#8a5a34'); }
      // guirlande de piments, sombrero au mur, étagère à jarres
      R(270, 6, 1, 8, '#5a3a20');
      for (let k = 0; k < 9; k++) { const y = 14 + k * 5; box(266 + (k % 2) * 4, y, 4, 5, '#c0392b'); R(267 + (k % 2) * 4, y, 1, 1, '#4a7a3a'); }
      box(346, 26, 24, 4, '#e8d4a0'); box(352, 18, 12, 9, '#e8d4a0'); R(352, 24, 12, 2, '#3a9a3a'); R(346, 28, 24, 1, '#c0392b');
      box(334, 68, 46, 3, '#7a4a24');
      for (const [x, h, c] of [[338, 12, '#b8603a'], [350, 16, '#c8783c'], [364, 10, '#a85030']]) { box(x, 68 - h, 10, h, c); R(x + 2, 68 - h, 6, 2, S.shade(c, -0.3)); R(x + 1, 66 - h / 2, 8, 1, '#f0e0c0'); }
      // fenêtre en arc : embrasure, puis découpe du dehors
      const w = ROOMS.cantina.windows[0], cx = w.x + w.w / 2, r = w.w / 2;
      for (let x = w.x - 6; x < w.x + w.w + 6; x++) {
        const d = x + 0.5 - cx, top = w.y + r - Math.sqrt(Math.max(0, (r + 6) ** 2 - d * d));
        R(x, top, 1, w.y + w.h + 2 - top, '#b88858');
      }
      for (let x = w.x; x < w.x + w.w; x++) {
        const d = x + 0.5 - cx, top = Math.round(w.y + r - Math.sqrt(Math.max(0, r * r - d * d)));
        bg.clearRect(x, top, 1, w.y + w.h - top);
      }
      const M = paint(mid);
      M.box(w.x - 8, w.y + w.h, w.w + 16, 4, '#8a5a34');
      // grille en fer forgé
      for (let x = w.x + 8; x < w.x + w.w; x += 10) {
        const d = x + 0.5 - cx, top = Math.round(w.y + r - Math.sqrt(Math.max(0, r * r - d * d)));
        M.R(x, top, 2, w.y + w.h - top, '#2a2622');
      }
      M.R(w.x, w.y + 40, w.w, 2, '#2a2622');
    },
    lamps() { return [{ x: 121, y: 36, r: 26 }, { x: 255, y: 36, r: 26 }]; },
    anim(ctx, now, room) {
      const { R } = paint(ctx);
      // bougies
      for (const [i, cx] of [[0, 120], [1, 254]]) {
        R(cx - 1, 38, 3, 8, '#f4ecd8'); R(cx - 1, 38, 1, 8, '#d8d0c0');
        const f = hash(Math.floor(now / 90) + i * 77);
        const h = f < 0.3 ? 3 : 4;
        R(cx, 38 - h, 1, h, '#f8a030'); R(cx, 37, 1, 1, '#fff6c0'); if (f > 0.7) R(cx + 1, 36, 1, 1, '#f8d070');
      }
      drawParrot(ctx, 104, now);
      const src = drawMariachi(ctx, 300, now, room?.band);
      // notes qui s'envolent de l'instrument (ou de sa bouche quand il chante)
      if (src) for (let i = 0; i < 3; i++) {
        const ph = ((now / 2200) + i / 3) % 1;
        ctx.globalAlpha = 1 - ph;
        note(ctx, Math.round(src.x + Math.sin(ph * 6 + i) * 6 + i * 6), Math.round(src.y - ph * 44), ['#f8d070', '#f4ecd8', '#e8508a'][i]);
        ctx.globalAlpha = 1;
      }
    },
    front(ctx, now) {
      // guirlandes de papel picado qui ondulent
      const cols = ['#e8508a', '#3aa858', '#f8c838', '#3a8ad8', '#f07830', '#9a5ad8'];
      for (const [y0, sag, off] of [[8, 10, 0], [28, 8, 8]]) {
        const yAt = (x) => y0 + sag * (1 - ((x - 192) / 192) ** 2);
        ctx.fillStyle = '#5a3a20';
        for (let x = 0; x < W; x += 2) ctx.fillRect(x, Math.round(yAt(x)), 2, 1);
        for (let i = 0, x = 4 + off; x < W - 8; x += 16, i++) {
          const y = Math.round(yAt(x + 5)) + 1;
          const dx = Math.round(Math.sin(now / 320 + i * 1.3) * 1.2);
          const h = 11 - (Math.sin(now / 260 + i * 1.7) > 0.6 ? 2 : 0);
          const c = cols[(i + off) % cols.length];
          ctx.fillStyle = c; ctx.fillRect(x + dx, y, 11, h);
          ctx.fillStyle = S.shade(c, -0.3);
          ctx.fillRect(x + dx + 3, y + 3, 1, 1); ctx.fillRect(x + dx + 7, y + 3, 1, 1); ctx.fillRect(x + dx + 5, y + 5, 1, 2); ctx.fillRect(x + dx + 3, y + 7, 1, 1); ctx.fillRect(x + dx + 7, y + 7, 1, 1);
          for (let k = 0; k < 11; k += 2) ctx.fillRect(x + dx + k, y + h, 1, 1);
        }
      }
      drawFly(ctx, 70, 60, now, 2);
    },
  },

  train: {
    name: 'LE WAGON-BAR DU TRAIN',
    windows: [{ x: 14, y: 30, w: 90, h: 50, train: true }, { x: 280, y: 30, w: 90, h: 50, train: true }],
    render(bg, mid) {
      const { R, box } = paint(bg);
      const rnd = seeded(7);
      // boiseries en acajou
      R(0, 0, W, 128, '#5a2418');
      for (let x = 0; x < W; x += 32) { R(x, 18, 1, 74, '#3a160e'); R(x + 1, 18, 1, 74, '#6a3020'); }
      for (let i = 0; i < 120; i++) R(rnd() * W, 18 + rnd() * 74, 3 + rnd() * 6, 1, '#4e2014');
      // plafond surélevé et ses petites vitres ambrées
      R(0, 0, W, 14, '#3a1a10'); R(0, 14, W, 2, '#c8a040'); R(0, 16, W, 2, '#2a120a');
      for (let x = 12; x < W; x += 40) { box(x, 3, 18, 7, '#d8a048'); R(x + 1, 4, 16, 2, '#f0c868'); R(x + 9, 3, 1, 7, '#3a1a10'); }
      // lambris et main courante en laiton
      R(0, 90, W, 3, '#c8a040'); R(0, 93, W, 35, '#4a1c12');
      for (let x = 6; x < W; x += 42) { box(x, 98, 34, 24, '#3e180e'); R(x + 1, 99, 32, 1, '#6a3020'); }
      // porte-bagages
      for (const [x0, x1] of [[6, 112], [272, 378]]) { R(x0, 22, x1 - x0, 1, '#c8a040'); R(x0, 26, x1 - x0, 1, '#c8a040'); for (let x = x0; x < x1; x += 12) R(x, 22, 1, 5, '#a88030'); }
      // médaillon au-dessus de l'adversaire
      S.disc(bg, 192, 30, 9, OUT); S.disc(bg, 192, 30, 8, '#c8a040'); S.disc(bg, 192, 30, 6, '#8a6a20');
      R(188, 28, 9, 4, '#c8a040'); R(190, 26, 5, 8, '#c8a040');
      // fenêtres aux coins arrondis
      for (const w of ROOMS.train.windows) {
        box(w.x - 5, w.y - 5, w.w + 10, w.h + 10, '#3a160e');
        bg.clearRect(w.x, w.y, w.w, w.h);
        for (const [cx, cy] of [[w.x, w.y], [w.x + w.w - 2, w.y], [w.x, w.y + w.h - 2], [w.x + w.w - 2, w.y + w.h - 2]]) R(cx, cy, 2, 2, '#3a160e');
      }
      const M = paint(mid);
      for (const w of ROOMS.train.windows) {
        M.box(w.x - 4, w.y + w.h + 2, w.w + 8, 3, '#c8a040');
        // rideaux de velours retenus par des embrasses
        for (const side of [0, 1]) {
          const x0 = side ? w.x + w.w - 6 : w.x - 8;
          for (let y = w.y - 6; y < w.y + w.h + 2; y++) {
            const u = (y - w.y + 6) / (w.h + 8);
            const ww = Math.round(14 - 9 * Math.sin(Math.min(1, u * 1.6) * Math.PI * 0.5) + (u > 0.6 ? (u - 0.6) * 12 : 0));
            const x = side ? x0 + 14 - ww : x0;
            M.R(x - 1, y, ww + 2, 1, OUT); M.R(x, y, ww, 1, (y % 4) ? '#8a1a1a' : '#6a1010');
          }
          M.box(side ? x0 + 6 : x0 + 2, w.y + 26, 6, 3, '#e0b040');
        }
        M.box(w.x - 8, w.y - 8, w.w + 16, 4, '#6a1010');
      }
    },
    lamps(now) {
      return [130, 254].map((lx, i) => ({ lx, a: Math.sin(now / 700 + i * 0.6) * 0.16, len: 6, top: 18, r: 40 }));
    },
    sway(now) { return Math.round(Math.sin(now / 260) * 0.7 + ((now % 1150) < 70 ? 1 : 0)); },
    anim(ctx, now) {
      const { box } = paint(ctx);
      // valises sur le porte-bagages, secouées aux joints des rails
      const jolt = (k) => ((now + k * 230) % 1150 < 80 ? -1 : 0);
      for (const [k, x, w, h, c] of [[0, 12, 22, 9, '#7a4a24'], [1, 40, 16, 12, '#3a5a6a'], [2, 64, 26, 8, '#8a3a2a'], [3, 286, 20, 10, '#5a5a3a'], [4, 316, 28, 9, '#7a4a24'], [5, 352, 16, 12, '#4a3a5a']]) {
        box(x, 22 - h + jolt(k), w, h, c);
        ctx.fillStyle = '#e0b040'; ctx.fillRect(x + Math.round(w / 2) - 1, 22 - h + jolt(k) + 1, 3, 1);
      }
    },
    front(ctx, now) { drawFly(ctx, 210, 70, now, 1); },
  },

  prison: {
    name: 'LE BUREAU DU SHÉRIF',
    windows: [{ x: 306, y: 18, w: 60, h: 42 }],
    render(bg, mid) {
      const { R, box } = paint(bg);
      const rnd = seeded(11);
      // murs en pierre
      R(0, 0, W, 92, '#6a6458');
      for (let y = 0, row = 0; y < 92; y += 12, row++) {
        for (let x = -(row % 2) * 13; x < W;) {
          const w = 20 + Math.floor(rnd() * 10);
          const c = ['#9a9080', '#a49a88', '#8e8676', '#a89e8a'][Math.floor(rnd() * 4)];
          R(x + 1, y + 1, w - 1, 11, c); R(x + 1, y + 1, w - 1, 1, S.shade(c, 0.12));
          x += w;
        }
      }
      R(0, 92, W, 3, '#3a2214'); R(0, 95, W, 33, '#5a3a20');
      for (let x = 0; x < W; x += 12) R(x, 95, 1, 33, '#4a2c18');
      // cellule : mur du fond plus sombre, couchette
      R(0, 8, 118, 120, '#4a463e');
      for (let y = 8; y < 120; y += 10) for (let x = (y / 10) % 2 ? 0 : 11; x < 118; x += 22) R(x, y, 1, 10, '#3a3630');
      for (let y = 18; y < 120; y += 10) R(0, y, 118, 1, '#3a3630');
      box(6, 98, 60, 8, '#6a6a5a'); R(6, 98, 60, 2, '#8a8a7a'); R(10, 106, 3, 14, '#3a3630'); R(58, 106, 3, 14, '#3a3630');
      box(84, 108, 10, 10, '#6a5a3a'); R(84, 110, 10, 1, '#4a3a2a');
      // étoile du shérif
      const sx = 192, sy = 18;
      S.disc(bg, sx, sy, 7, OUT); S.disc(bg, sx, sy, 6, '#e0b040');
      for (const [dx, dy] of [[0, -8], [7, -3], [5, 7], [-5, 7], [-7, -3]]) { R(sx + dx - 1, sy + dy - 1, 3, 3, OUT); R(sx + dx, sy + dy, 1, 1, '#e0b040'); }
      S.disc(bg, sx, sy, 2, '#c09020');
      // râtelier à fusils
      box(254, 26, 36, 60, '#5a3418'); R(254, 34, 36, 3, '#3a2214'); R(254, 76, 36, 3, '#3a2214');
      for (const x of [260, 270, 280]) { R(x, 30, 3, 36, '#6a6f78'); R(x, 30, 1, 36, '#9aa0a8'); box(x - 1, 64, 5, 18, '#7a4a24'); }
      // avis de recherche sous la fenêtre
      for (const px of [304, 338]) { box(px, 66, 24, 22, '#d8c088'); R(px + 3, 68, 18, 3, '#5a3a20'); R(px + 7, 72, 10, 9, '#a88a5a'); R(px + 4, 83, 16, 1, '#5a3a20'); }
      // fenêtre à barreaux
      box(302, 14, 68, 50, '#4a463e');
      bg.clearRect(306, 18, 60, 42);
      const M = paint(mid);
      for (const x of [318, 330, 342, 354]) M.box(x, 18, 2, 42, '#3a3e44');
      M.box(302, 60, 68, 3, '#5a5a52');
      // barreaux de la cellule et porte
      for (let x = 4; x < 118; x += 8) { M.R(x - 1, 8, 4, 120, OUT); M.R(x, 8, 2, 120, '#4a4f58'); M.R(x, 8, 1, 120, '#7a808a'); }
      for (const y of [20, 100]) { M.R(0, y - 1, 120, 5, OUT); M.R(0, y, 120, 3, '#4a4f58'); }
      M.box(96, 58, 8, 10, '#3a3e44'); M.R(99, 62, 2, 3, OUT);
      M.R(118, 0, 3, 128, OUT); M.R(0, 7, 121, 2, OUT);
    },
    lamps(now) { return [{ lx: 236, a: Math.sin(now / 1800) * 0.05, len: 12, r: 46 }]; },
    anim(ctx, now) {
      const { R } = paint(ctx);
      // le prisonnier fait les cent pas, puis s'agrippe aux barreaux
      const T = now % 14000;
      const pos = T < 4000 ? smooth(T / 4000) : T < 7000 ? 1 : T < 11000 ? 1 - smooth((T - 7000) / 4000) : 0;
      const walking = (T < 4000) || (T > 7000 && T < 11000);
      const x = Math.round(8 + pos * 52), bob = walking && Math.floor(now / 180) % 2 ? 1 : 0;
      const spr = S.characterSprite(PRISONER, { blink: (now % 3700) < 120, t: now });
      ctx.drawImage(spr, x, 48 + bob);
      if (T > 4300 && T < 6800) for (const hx of [x + 12, x + 32]) { R(hx - 1, 77, 6, 5, OUT); R(hx, 78, 4, 3, '#d19a6a'); }
    },
    front(ctx, now) {
      const { R } = paint(ctx);
      // trousseau de clés qui se balance au clou
      const a = Math.sin(now / 900) * 0.3;
      const kx = Math.round(130 + Math.sin(a) * 6), ky = Math.round(52 + Math.cos(a) * 6);
      R(129, 46, 3, 2, OUT);
      S.disc(ctx, kx, ky, 3, OUT); S.disc(ctx, kx, ky, 2, '#c8a040'); S.disc(ctx, kx, ky, 1, '#4a463e');
      for (const d of [-2, 2]) { R(kx + d, ky + 3, 1, 6, '#c8a040'); R(kx + d, ky + 8, 2, 1, '#c8a040'); }
      // un courant d'air soulève les coins des avis de recherche
      for (const [i, px] of [[0, 304], [1, 338]]) {
        const lift = Math.sin(now / 240 + i * 2) > 0.55 ? 1 : 0;
        if (lift) { R(px + 20, 84, 4, 4, '#4a463e'); R(px + 19, 82, 4, 4, OUT); R(px + 20, 83, 3, 3, '#f0dca8'); }
      }
      drawFly(ctx, 200, 48, now, 3);
    },
  },
};
const ROOM_IDS = Object.keys(ROOMS);
// Salle tirée de la graine, sans rien dessiner (même tirage que le constructeur de Room) : sert aux règles de la pinte.
export const roomIdFor = (seed) => ROOM_IDS[Math.floor(rng((seed ^ 0x9e3779b9) >>> 0)() * ROOM_IDS.length)];

// ------------------------------------------------------------ dehors
const OUTSIDE = new Map();
function outsideArt(key, w, env, train) {
  let c = OUTSIDE.get(key);
  if (c) return c;
  c = S.makeCanvas(train ? 512 : w.w, w.h);
  const opts = desertOpts(env, { sunX: 0.7, sunY: 0.3 });
  if (train) { opts.skyDeco = () => {}; opts.cacti = false; }
  S.drawDesert(c.getContext('2d'), 0, 0, c.width, w.h, opts);
  if (OUTSIDE.size > 24) { for (const old of OUTSIDE.values()) S.freeCanvas(old); OUTSIDE.clear(); }
  OUTSIDE.set(key, c);
  return c;
}

export class Room {
  constructor(seed) {
    this.seed = seed;
    const R = rng((seed ^ 0x9e3779b9) >>> 0);
    this.id = ROOM_IDS[Math.floor(R() * ROOM_IDS.length)];
    this.def = ROOMS[this.id];
    this.band = MARIACHI[Math.floor(R() * MARIACHI.length)];
    this.env = pickEnv(seed, 'roulette');
    this.amb = new Ambience(this.env);
    this.tint = ROOM_TINT[this.env.id] || null;
    this.art = Room.art(this.id);
    this.layer = S.makeCanvas(W, H);
    this.tinted = null;
  }

  static art(id) {
    Room.cache ||= new Map();
    let a = Room.cache.get(id);
    if (!a) {
      a = { bg: S.makeCanvas(W, H), mid: S.makeCanvas(W, H) };
      ROOMS[id].render(a.bg.getContext('2d'), a.mid.getContext('2d'));
      Room.cache.set(id, a);
    }
    return a;
  }

  get name() { return this.def.name; }
  get label() { return `${this.def.name} - ${this.env.name}`; }
  sway(now) { return this.def.sway ? this.def.sway(now) : 0; }

  // Tout ce qui est derrière l'adversaire : dehors, décor teinté, éléments animés, lumières.
  drawBack(ctx, now) {
    const sway = this.sway(now);
    this.def.windows.forEach((w, i) => {
      ctx.save();
      ctx.beginPath();
      ctx.rect(w.x, w.y + sway, w.w, w.h);
      ctx.clip();
      ctx.translate(0, sway);
      this.drawOutside(ctx, w, i, now);
      ctx.restore();
    });
    const L = this.layer, l = L.getContext('2d');
    l.setTransform(1, 0, 0, 1, 0, sway);
    l.clearRect(0, -2, W, H + 4);
    l.drawImage(this.art.bg, 0, 0);
    this.def.anim?.(l, now, this);
    const lamps = this.lampPos(l, now);
    l.drawImage(this.art.mid, 0, 0);
    this.def.front?.(l, now, this);
    l.setTransform(1, 0, 0, 1, 0, 0);
    const f = this.amb.flash(now);
    const tint = this.tint && f ? S.mix(this.tint, '#ffffff', 0.6 * f) : this.tint;
    if (tint) {
      this.tinted = S.tintCanvas(L, tint, this.tinted || S.makeCanvas(W, H));
      ctx.drawImage(this.tinted, 0, 0);
    } else ctx.drawImage(L, 0, 0);
    // rayons de lumière par les fenêtres, puis halo des lampes (plus fort la nuit)
    const night = this.env.id === 'nuit' || this.env.id === 'orage';
    const beam = { midi: '255,236,190,0.05', aube: '255,210,210,0.05', crepuscule: '255,170,100,0.08', poussiere: '255,210,150,0.06', neige: '230,240,255,0.05' }[this.env.id];
    ctx.globalCompositeOperation = 'lighter';
    if (beam && !this.def.windows[0].train) {
      for (const w of this.def.windows) {
        ctx.fillStyle = `rgba(${beam})`;
        ctx.beginPath();
        ctx.moveTo(w.x, w.y + w.h); ctx.lineTo(w.x + w.w, w.y + w.h);
        const dx = w.x > W / 2 ? -70 : 70;
        ctx.lineTo(w.x + w.w + dx, 140); ctx.lineTo(w.x + dx, 140);
        ctx.closePath(); ctx.fill();
      }
    }
    const k = night ? 1.8 : 1;
    for (const p of lamps) {
      const fl = Math.sin(now / 90 + p.x) * 0.5 + Math.sin(now / 37) * 0.5;
      for (const [r, a] of [[p.r, 0.04], [p.r * 0.65, 0.05], [p.r * 0.35, 0.06]]) S.disc(ctx, p.x, p.y + sway, Math.round(r + fl), `rgba(255,170,70,${a * k})`);
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  // lampes suspendues (dessinées sur le calque) ou points lumineux fixes
  lampPos(l, now) {
    return this.def.lamps(now, this).map((p) => {
      if (p.lx == null) return p;
      const q = drawLamp(l, p.lx, p.top ?? 7, p.len, p.a);
      return { x: q.x, y: q.y, r: p.r };
    });
  }

  drawOutside(ctx, w, i, now) {
    const env = this.env;
    const horizon = w.y + Math.round(w.h * 0.6);
    if (w.train) {
      // le paysage défile : désert lointain lentement, buissons et poteaux télégraphiques à toute vitesse
      const art = outsideArt(`${this.id}${env.id}t${w.h}`, w, env, true);
      const off = Math.floor((now * 0.012 + i * 200) % art.width);
      ctx.drawImage(art, w.x - off, w.y); ctx.drawImage(art, w.x - off + art.width, w.y);
      if (env.moon || env.sky == null || env.sun) skyDeco(env, 0.75, 0.3)(ctx, w.x, w.y, w.w, horizon);
      const { R } = paint(ctx);
      for (let k = 0; k < 14; k++) {
        const x = w.x + ((((k * 53) - now * 0.09) % (w.w + 40)) + w.w + 40) % (w.w + 40) - 20;
        const y = horizon + 6 + (k % 3) * 5;
        R(x, y, 4 + (k % 3) * 2, 2, k % 2 ? '#6a7a3a' : '#8a6a4a'); R(x + 1, y - 1, 2, 1, '#7a8a46');
      }
      const span = 150, px = ((-now * 0.32) % span + span) % span;
      for (let x = w.x + px - span; x < w.x + w.w + span; x += span) {
        R(x, w.y, 3, w.h, '#3a2214'); R(x - 5, w.y + 6, 13, 2, '#3a2214');
        for (let k = 3; k < span; k += 3) R(x + k, w.y + 7 + Math.sin((k / span) * Math.PI) * 6, 1, 1, '#2a1a10');
      }
      // panaches de fumée de la locomotive
      for (let k = 0; k < 3; k++) {
        const ph = ((now / 1700) + k / 3 + i * 0.5) % 1;
        S.disc(ctx, Math.round(w.x + w.w + 10 - ph * (w.w + 30)), Math.round(w.y + 4 + Math.sin(ph * 5 + k) * 2), Math.round(4 + ph * 6), `rgba(240,236,228,${0.55 * (1 - ph)})`);
      }
    } else {
      ctx.drawImage(outsideArt(`${this.id}${env.id}${i}`, w, env, false), w.x, w.y);
      const { R } = paint(ctx);
      // nuages qui passent
      if (env.id !== 'nuit') {
        const col = env.id === 'orage' ? 'rgba(50,54,66,0.85)' : 'rgba(255,250,240,0.55)';
        for (let k = 0; k < 2; k++) {
          const cx = w.x + (((now * 0.003 + k * 47) % (w.w + 40)) - 20), cy = w.y + 7 + k * 8;
          for (const [dx, r] of [[0, 4], [5, 5], [10, 3]]) S.disc(ctx, Math.round(cx + dx), cy, r, col);
        }
      }
      if (['midi', 'aube', 'crepuscule'].includes(env.id)) S.vulture(ctx, Math.round(w.x + w.w / 2 + Math.cos(now / 4000) * 18), Math.round(w.y + 12 + Math.sin(now / 3000) * 4), now);
      // virevoltant
      const tw = now % 15000;
      if (tw < 5000) S.tumbleweed(ctx, Math.round(w.x - 6 + ((w.w + 12) * tw) / 5000), Math.round(horizon + 8 - Math.abs(Math.sin(now / 160)) * 4), now);
      // cavalier au loin sur la crête
      const rd = (now + 7000) % 23000;
      if (rd < 7000) {
        const x = Math.round(w.x + w.w + 6 - ((w.w + 12) * rd) / 7000), y = horizon - 1;
        const leg = Math.floor(now / 120) % 2;
        const c = 'rgba(40,24,16,0.85)';
        R(x, y - 4, 7, 3, c); R(x - 2, y - 6, 3, 3, c); R(x + 2, y - 8, 2, 4, c); R(x + 2, y - 9, 3, 1, c);
        R(x + leg, y - 1, 1, 2, c); R(x + 5 - leg, y - 1, 1, 2, c);
      }
      // étoile filante
      if (env.stars && (now % 11000) < 500) {
        const k = (now % 11000) / 500;
        for (let j = 0; j < 6; j++) R(w.x + 10 + k * 40 - j * 2, w.y + 6 + k * 12 - j * 0.6, 1, 1, `rgba(255,255,240,${1 - j / 6})`);
      }
    }
    // météo sur la vitre
    if (env.weather === 'rain') {
      ctx.fillStyle = 'rgba(200,210,240,0.6)';
      for (let k = 0; k < (w.train ? 26 : 16); k++) {
        const x = w.x + ((k * 13.7) % w.w), y = w.y + ((k * 23 + now * (w.train ? 0.05 : 0.09)) % w.h);
        if (w.train) for (let j = 0; j < 4; j++) ctx.fillRect(Math.round(x - j * 2), Math.round(y + j * 0.5), 1, 1);
        else ctx.fillRect(Math.round(x), Math.round(y), 1, 3);
      }
    } else if (env.weather === 'snow') {
      ctx.fillStyle = '#f4f6ff';
      for (let k = 0; k < 22; k++) {
        const x = w.x + ((((k * 19.3 + Math.sin(now / 700 + k) * 4 - (w.train ? now * 0.08 : 0)) % w.w) + w.w) % w.w);
        const y = w.y + ((k * 11 + now * 0.012) % w.h);
        ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
      }
    } else if (env.weather === 'dust') {
      ctx.fillStyle = 'rgba(214,162,104,0.35)'; ctx.fillRect(w.x, w.y, w.w, w.h);
      ctx.fillStyle = 'rgba(232,196,140,0.6)';
      for (let k = 0; k < 10; k++) ctx.fillRect(Math.round(w.x + w.w - ((k * 31 + now * 0.12) % (w.w + 20))), w.y + ((k * 7) % w.h), 8, 1);
    }
    const f = this.amb.flash(now);
    if (f) { ctx.fillStyle = `rgba(240,240,255,${0.8 * f})`; ctx.fillRect(w.x, w.y, w.w, w.h); this.amb.sky(ctx, now); }
  }

  // Par-dessus toute la scène : éclair qui illumine la pièce (et le tonnerre)
  drawOverlay(ctx, now) {
    if (this.amb.thunder(now)) sfx('thunder', 0.4);
    const f = this.amb.flash(now);
    if (f) { ctx.fillStyle = `rgba(230,236,255,${0.18 * f})`; ctx.fillRect(0, 0, W, H); }
  }
}
