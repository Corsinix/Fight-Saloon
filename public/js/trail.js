// Décor du voyage de « Défends la roulotte » : de Dusty Gulch à Red Rock, à travers la prairie et ses
// troupeaux de bisons, le long d'un campement de tipis, au pied d'une butte de grès. Le décor est fait de
// plusieurs plans qui défilent à des vitesses différentes (parallaxe) pendant que la roulotte avance.
import * as S from './sprites.js';
import { canvasText } from './scene.js';
import { pixelSprite } from './miniscene.js';
import { horseSprite } from './lasso.js';
import { W, H, MODES } from './worlds.js';
import { WAGON } from './wagongame.js';

export const HORIZON = 112;
export const TRAIL_LEN = MODES.wagon.duration * WAGON.scroll; // distance parcourue pendant la partie
const OUT = S.OUT;
const FAR = 0.12, MID = 0.45; // vitesse des plans lointains par rapport à la piste
const tri = (u) => 1 - 2 * Math.abs((((u % 1) + 1) % 1) - 0.5);
const cache = new Map();
const cached = (key, make) => {
  let c = cache.get(key);
  if (!c) { c = make(); cache.set(key, c); }
  return c;
};

// ------------------------------------------------------------ le parcours
// plan du milieu (près de l'horizon) : bisons et arbres
const MID_ITEMS = [
  { k: 'tree', x: 120, y: 118 }, { k: 'tree', x: 168, y: 121 },
  ...[[300, 118], [318, 121], [334, 116], [346, 122], [362, 119], [380, 117]].map(([x, y], i) => ({ k: 'bison', x, y, f: i })),
  { k: 'tree', x: 520, y: 117 },
  ...[[640, 120], [655, 116], [668, 122], [690, 118]].map(([x, y], i) => ({ k: 'bison', x, y, f: i + 2 })),
  { k: 'tree', x: 800, y: 119 }, { k: 'tree', x: 822, y: 116 }, { k: 'tree', x: 1180, y: 118 },
  ...[[960, 117], [978, 121], [992, 118], [1010, 122], [1026, 116], [1044, 120], [1060, 118]].map(([x, y], i) => ({ k: 'bison', x, y, f: i + 1 })),
  { k: 'tree', x: 1320, y: 120 },
];

// piste (même vitesse que le sol) : les deux villes, le campement, la butte, les cactus
const town = (x0, cols) => cols.map(([dx, w, h, col, name]) => ({ k: 'house', x: x0 + dx, y: 132, w, h, col, name }));
const BACK_ITEMS = [
  ...town(-150, [[0, 74, 58, '#8a4a2a', 'ECURIE'], [84, 70, 66, '#b89a6a', 'BANQUE'], [166, 96, 72, '#9a4a2a', 'SALOON'], [274, 64, 52, '#6a8a8a', 'BAZAR']]),
  { k: 'sign', x: 330, y: 136, text: WAGON.from },
  { k: 'cactus', x: 450, y: 134 }, { k: 'rock', x: 560, y: 136 }, { k: 'cactus', x: 690, y: 130 }, { k: 'bones', x: 760, y: 138 },
  { k: 'cactus', x: 880, y: 136 }, { k: 'rock', x: 1000, y: 131 },
  // le campement : des tipis, un feu, un séchoir et des chevaux
  { k: 'tipi', x: 1140, y: 128, v: 0 }, { k: 'rack', x: 1186, y: 134 }, { k: 'tipi', x: 1222, y: 132, v: 1 },
  { k: 'fire', x: 1262, y: 137 }, { k: 'tipi', x: 1300, y: 126, v: 2 }, { k: 'tipi', x: 1352, y: 133, v: 0 },
  { k: 'horse', x: 1402, y: 132, v: 0 }, { k: 'horse', x: 1432, y: 128, v: 1 }, { k: 'tipi', x: 1474, y: 129, v: 1 },
  { k: 'cactus', x: 1600, y: 132 }, { k: 'rock', x: 1700, y: 137 }, { k: 'butte', x: 1880, y: 130 }, { k: 'cactus', x: 2010, y: 136 },
  { k: 'bones', x: 2120, y: 133 }, { k: 'cactus', x: 2240, y: 131 }, { k: 'rock', x: 2380, y: 136 }, { k: 'cactus', x: 2520, y: 134 },
  { k: 'sign', x: TRAIL_LEN + 70, y: 136, text: WAGON.to },
  ...town(TRAIL_LEN + 116, [[0, 70, 60, '#a8584a', 'HOTEL'], [80, 66, 54, '#9a7a4a', 'SHERIF'], [156, 90, 70, '#7a6a9a', 'SALOON'], [256, 60, 50, '#c8b48a', 'POSTE']]),
];

// ------------------------------------------------------------ sprites du décor
function ridge() {
  return cached('ridge', () => {
    const c = S.makeCanvas(512, 60);
    const g = c.getContext('2d');
    for (let i = 0; i < 512; i++) {
      const mesa = tri(i / 512 + 0.15) > 0.62 ? 18 + 4 * tri(i / 40) ** 4 : 0;
      const h = Math.round(4 + mesa + 9 * tri(i / 128 + 0.4) ** 2 + 3 * tri(i / 64));
      g.fillStyle = '#a8746a'; g.fillRect(i, 60 - h, 1, h);
      g.fillStyle = '#c08a78'; g.fillRect(i, 60 - h, 1, 1);
      if (mesa && i % 3 === 0) { g.fillStyle = '#946058'; g.fillRect(i, 60 - h + 4, 1, 2); }
    }
    return c;
  });
}

function ground() {
  return cached('ground', () => {
    const c = S.makeCanvas(W, H - HORIZON);
    const g = c.getContext('2d');
    const R = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(Math.round(x), Math.round(y), w, h); };
    ['#b8a060', '#c4a868', '#ccae70', '#d2b478', '#d8ba80', '#dcbe86'].forEach((col, i) => R(0, i * 18, W, 19, col));
    let s = 7;
    const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
    for (let i = 0; i < 650; i++) R(rnd() * W, 2 + rnd() * (H - HORIZON), rnd() < 0.2 ? 2 : 1, 1, rnd() < 0.5 ? '#e8cc98' : '#a8804a');
    for (let i = 0; i < 40; i++) { const x = rnd() * W, y = 6 + rnd() * 20; R(x, y, 1, 2, '#7a8a46'); R(x + 2, y, 1, 2, '#7a8a46'); R(x + 1, y - 1, 1, 3, '#8a9a52'); }
    // la piste et ses ornières
    R(0, 50, W, 26, '#d8bc84');
    for (const y of [56, 70]) for (let x = 0; x < W; x += 3) R(x, y + (x % 7 === 0 ? 1 : 0), 2, 1, '#a88250');
    return c;
  });
}

const TIPI_COLS = [['#a84a2a', '#2f4a5e'], ['#c8902a', '#5a2a4a'], ['#3a6a4a', '#a84a2a']];
function tipi(v) {
  return cached(`tipi${v}`, () => pixelSprite(48, 62, 24, 58, (R) => {
    const [a, b] = TIPI_COLS[v % TIPI_COLS.length];
    for (const dir of [-1, 0, 1]) for (let k = 0; k < 9; k++) R(dir * Math.round(k * 0.6), -47 - k, 1, 1, '#5a3a20'); // perches
    for (let dy = 0; dy <= 46; dy++) {
      const hw = Math.round(2 + dy * 0.43);
      R(-hw, -46 + dy, hw * 2 + 1, 1, '#e8d8b8');
      R(Math.round(hw * 0.35), -46 + dy, Math.ceil(hw * 0.65) + 1, 1, '#d6c6a2'); // côté à l'ombre
    }
    // bandes peintes : une frise de triangles, puis une bande unie
    for (let x = -15; x <= 15; x++) R(x, -15, 1, 2, a);
    for (let x = -14; x <= 12; x += 4) { R(x, -18, 3, 1, a); R(x + 1, -19, 1, 1, a); }
    for (let x = -8; x <= 8; x++) R(x, -31, 1, 1, b);
    for (let x = -7; x <= 7; x += 3) R(x, -33, 1, 2, b);
    R(-5, -46, 2, 5, a); R(4, -46, 2, 5, a); // rabats de fumée
    R(-3, -11, 7, 11, '#3a2a1a'); R(-2, -12, 5, 1, '#3a2a1a'); R(2, -10, 2, 8, '#c8b490'); // entrée, pan relevé
  }));
}

function bison(f) {
  return cached(`bison${f}`, () => pixelSprite(28, 20, 14, 18, (R) => {
    const d = '#2e1e12', b = '#5a3a24', m = '#6e4a2a';
    R(-6, -11, 15, 8, b); R(-5, -13, 8, 3, m); R(-8, -12, 6, 10, '#4a3020'); // corps, bosse, crinière
    R(8, -10, 1, 4, d); // queue
    if (f % 2) { R(-12, -10, 5, 5, d); R(-11, -12, 1, 2, '#e8dcc8'); R(-8, -12, 1, 2, '#e8dcc8'); } // tête levée
    else { R(-12, -6, 5, 5, d); R(-11, -7, 1, 2, '#e8dcc8'); } // il broute
    for (const x of [-6, -3, 3, 6]) R(x, -3, 2, 3, d);
  }));
}

function tree() {
  return cached('tree', () => pixelSprite(30, 40, 15, 37, (R, ctx) => {
    R(-1, -16, 3, 16, '#5a3a20'); R(-4, -14, 3, 1, '#5a3a20'); R(2, -12, 4, 1, '#5a3a20');
    for (const [x, y, r, col] of [[-5, -20, 7, '#5a7a32'], [5, -22, 7, '#5a7a32'], [0, -27, 8, '#6a8a3a'], [-3, -24, 4, '#7a9a46'], [4, -28, 3, '#7a9a46']]) S.disc(ctx, 15 + x, 37 + y, r, col);
  }));
}

function house(it) {
  return cached(`house${it.x}`, () => pixelSprite(it.w + 6, it.h + 8, 3, it.h + 4, (R) => {
    const { w, h, col } = it, dk = S.shade(col, -0.25), lt = S.shade(col, 0.15), trim = S.mix(col, '#f4ecd8', 0.5);
    R(0, -h, w, h, col);
    for (let x = 3; x < w; x += 5) R(x, -h + 1, 1, h - 1, dk);
    R(-2, -h - 3, w + 4, 4, dk); R(-2, -h - 3, w + 4, 1, lt);
    R(6, -h + 3, w - 12, 10, '#e8d4a0'); R(6, -h + 11, w - 12, 2, '#c8b07c'); // enseigne
    if (h > 56) for (const f of [0.28, 0.72]) { R(Math.round(w * f) - 5, -h + 18, 10, 12, '#2a180c'); R(Math.round(w * f) - 6, -h + 17, 12, 1, trim); }
    R(-3, -24, w + 6, 3, '#7a4a24'); R(-3, -24, w + 6, 1, '#9a6a3a'); R(0, -21, 2, 21, '#5a3a20'); R(w - 2, -21, 2, 21, '#5a3a20'); // auvent
    R(Math.round(w / 2) - 5, -18, 10, 18, '#2a180c'); R(Math.round(w / 2) - 5, -18, 2, 18, dk);
    for (const f of [0.18, 0.82]) { R(Math.round(w * f) - 5, -16, 10, 9, '#2a180c'); R(Math.round(w * f) - 5, -16, 10, 1, trim); }
  }));
}

const SMALL = {
  cactus: (R) => {
    const g = '#4a7a3a', d = '#2e5228';
    R(-1, -22, 3, 22, g); R(1, -22, 1, 22, d);
    R(-5, -14, 4, 2, g); R(-5, -19, 2, 5, g); R(2, -11, 4, 2, g); R(4, -17, 2, 6, g);
  },
  rock: (R) => { R(-8, -7, 16, 7, '#9a8a70'); R(-6, -9, 10, 2, '#9a8a70'); R(-5, -8, 6, 2, '#b8a888'); R(-8, -2, 16, 2, '#7a6a54'); },
  bones: (R) => { R(-3, -3, 7, 3, '#ece2c8'); R(-4, -4, 2, 2, '#ece2c8'); R(3, -4, 2, 2, '#ece2c8'); R(-1, -2, 1, 1, OUT); R(1, -2, 1, 1, OUT); },
  rack: (R) => {
    R(-12, -20, 2, 20, '#5a3a20'); R(10, -20, 2, 20, '#5a3a20'); R(-13, -20, 26, 2, '#6a4a2a');
    R(-9, -18, 7, 10, '#a8784a'); R(-8, -17, 5, 8, '#b88a58'); R(1, -18, 8, 12, '#8a5a34'); R(2, -17, 6, 10, '#9a6a3e');
  },
  butte: (R) => {
    for (let y = 0; y < 52; y++) {
      const hw = y < 6 ? 26 + y : y < 40 ? 32 + Math.round(2 * tri(y / 9)) : 32 + (y - 40) * 2;
      R(-hw, -52 + y, hw * 2, 1, y % 7 < 2 ? '#a85a3a' : '#c0704a');
      R(Math.round(hw * 0.4), -52 + y, Math.round(hw * 0.6), 1, y % 7 < 2 ? '#8a4a30' : '#a8603e');
    }
  },
};
const small = (k) => cached(k, () => (k === 'butte' ? pixelSprite(110, 58, 55, 54, SMALL[k]) : pixelSprite(32, 26, 16, 24, SMALL[k])));

// Tout ce qui sert au décor, à préparer pendant le compte à rebours (quelques-uns par image)
export function trailWarm() {
  return [ridge, ground, tree, () => bison(0), () => bison(1), () => tipi(0), () => tipi(1), () => tipi(2),
    ...Object.keys(SMALL).map((k) => () => small(k)), ...BACK_ITEMS.filter((it) => it.k === 'house').map((it) => () => house(it))];
}

// ------------------------------------------------------------ rendu
// cam : distance parcourue (px). Renvoie les lueurs à ajouter après le calque d'ambiance (le feu de camp).
export function drawTrail(ctx, cam, now) {
  const glows = [];
  const R = (x, y, w, h, col) => { ctx.fillStyle = col; ctx.fillRect(Math.round(x), Math.round(y), w, h); };
  // mesas au loin
  const rg = ridge();
  const off = Math.floor(cam * FAR) % rg.width;
  for (let x = -off; x < W; x += rg.width) ctx.drawImage(rg, x, HORIZON - 60);
  // le sol
  const gr = ground();
  const go = Math.floor(cam) % W;
  ctx.drawImage(gr, -go, HORIZON);
  ctx.drawImage(gr, W - go, HORIZON);
  // bisons et arbres près de l'horizon
  const mid = cam * MID;
  for (const it of MID_ITEMS) {
    const x = Math.round(it.x - mid);
    if (x < -30 || x > W + 30) continue;
    const spr = it.k === 'tree' ? tree() : bison((it.f + Math.floor(now / 1600 + it.f * 0.7)) % 2);
    ctx.drawImage(spr, x - spr.ox, it.y - spr.oy);
  }
  // le long de la piste
  const items = BACK_ITEMS.map((it) => ({ it, x: Math.round(it.x - cam) })).filter(({ x }) => x > -140 && x < W + 140).sort((a, b) => a.it.y - b.it.y);
  for (const { it, x } of items) {
    const y = it.y;
    if (it.k === 'house') {
      const spr = house(it);
      ctx.drawImage(spr, x - spr.ox, y - spr.oy);
      canvasText(ctx, it.name, x + it.w / 2, y - it.h + 4, { color: '#3a2214', shadow: '#c8b07c' });
    } else if (it.k === 'sign') {
      R(x - 1, y - 22, 3, 22, OUT); R(x, y - 22, 1, 22, '#5a3a20');
      R(x + 39, y - 22, 3, 22, OUT); R(x + 40, y - 22, 1, 22, '#5a3a20');
      R(x - 4, y - 28, 48, 12, OUT); R(x - 3, y - 27, 46, 10, '#d8bc80');
      canvasText(ctx, it.text, x + 20, y - 26, { color: '#3a2214', shadow: '#b89a60' });
    } else if (it.k === 'tipi') {
      const spr = tipi(it.v);
      ctx.drawImage(spr, x - spr.ox, y - spr.oy);
      // un filet de fumée qui sort du sommet
      for (let k = 0; k < 4; k++) {
        const u = ((now / 2600 + k / 4 + it.v * 0.13) % 1);
        S.disc(ctx, x + Math.round(Math.sin(u * 6 + k) * 2 + u * 6), y - 58 - u * 26, 1 + Math.round(u * 2), `rgba(220,214,206,${0.45 * (1 - u)})`);
      }
    } else if (it.k === 'fire') {
      for (const dx of [-5, -2, 2, 5]) R(x + dx, y - 1, 2, 2, '#7a7468');
      const f = Math.sin(now / 70) + Math.sin(now / 43);
      S.disc(ctx, x, y - 4, 3, '#e86a2a'); S.disc(ctx, x, y - 6 - Math.round(f), 2, '#f8c048'); R(x, y - 10 - Math.round(f), 1, 2, '#fff2b0');
      for (let k = 0; k < 5; k++) {
        const u = ((now / 3000 + k / 5) % 1);
        S.disc(ctx, x + Math.round(Math.sin(u * 5 + k) * 3 + u * 10), y - 12 - u * 40, 1 + Math.round(u * 3), `rgba(200,196,190,${0.5 * (1 - u)})`);
      }
      glows.push({ x, y: y - 6, r: 30 });
    } else if (it.k === 'horse') {
      const spr = horseSprite(it.v ? '#e8dcc8' : '#8a5a34', it.v ? '#8a7a68' : '#3a2214', 1, null);
      ctx.drawImage(spr, x - spr.ox, y - spr.oy);
    } else {
      const spr = small(it.k);
      ctx.drawImage(spr, x - spr.ox, y - spr.oy);
    }
  }
  return glows;
}
