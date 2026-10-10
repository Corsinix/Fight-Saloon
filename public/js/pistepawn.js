// Pions de la carte de « La piste », au grain de la carte du monde (pistemap.js : F pixels fins par pixel du jeu,
// ombrage éclairé d'en haut à gauche et tramé, contour d'un pixel fin) :
// - les médaillons des lieux : cerclage de bois (laiton quand on peut y aller, fer pour le repaire), face de
//   parchemin bombée, ombre portée tramée, et le dessin du lieu (revolvers croisés, point d'interrogation à l'encre,
//   bourse de dollars, tente et feu de camp, chapeau, coffre, menottes, fourche d'El Diablo, saloon du départ) ;
// - le pion de la bande : son cowboy à cheval, à ses couleurs, au galop pendant le voyage ;
// - le halo qui pulse autour des lieux où l'on peut aller.
// Chaque dessin est calculé une fois (pixel par pixel), gardé en cache, et posé avec drawFine.
import * as S from './sprites.js';
import { SKIN, CLOTH_COLORS, HAIR_COLORS, hatColorOf } from './data.js';

export const F = 4; // pixels fins par pixel du jeu (le même que la carte)

// ------------------------------------------------------------ couleurs (entiers RGBA, octets dans l'ordre R G B A)
const pack = (r, g, b, a = 255) => ((a << 24) | (b << 16) | (g << 8) | r) >>> 0;
const hex = (h) => { const n = parseInt(h.replace('#', ''), 16); return pack(n >> 16, (n >> 8) & 255, n & 255); };
const ramp = (s) => s.split(' ').map(hex);
const blend = (p, q, t) => {
  const c = (s) => { const a = (p >>> s) & 255; return (a + (((q >>> s) & 255) - a) * t) | 0; };
  return pack(c(0), c(8), c(16));
};
// une palette de six teintes tirée d'une seule couleur (du plus sombre au plus clair)
const rampOf = (base, lo = -0.62, hi = 0.34) => Array.from({ length: 6 }, (_, i) => hex(S.shade(base, lo + ((hi - lo) * i) / 5)));
const hsh = (x, y, s) => {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(s | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
// tramage ordonné : une teinte à un niveau fractionnaire tombe sur l'une des deux voisines selon le pixel
const BAY = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
const bay = (x, y) => BAY[((y & 3) << 2) | (x & 3)];
const pick = (R, l, x, y) => { const k = Math.floor(l + bay(x, y) - 0.5); return R[k < 0 ? 0 : k >= R.length ? R.length - 1 : k]; };

const OUT = hex('1a0f0a'), INKO = hex('2a1a10');
const WOOD = ramp('2a180c 44281a 5e3c24 7a5232 98683e b08048');
const WOODO = ramp('241a12 342618 463424 58442e 6a5438 7a6444');
const BRASS = ramp('4a3010 7a5418 a8782a d0a040 ecc860 f8e49a');
const IRON = ramp('1a1a20 2e2e36 46464f 62626c 82828c a4a4ae');
const PARCH = ramp('9a8462 b49c78 ccb48e e0caa4 eedcb8 f8ecd2');
const PARCHO = ramp('6a5a44 7e6c54 927e66 a49078 b4a088 c2ae96');
const BLOOD = ramp('2a0806 4a100c 6e1a12 92281a b03c24 c85a34');
const INKR = ramp('1e0604 3a0c08 5a160e 7a2216 9a3420');
const BURLAP = ramp('4a3420 6a4c2e 8a6a40 a88a56 c4a670 dac08c');
const CANVAS = ramp('6a5638 8a7454 b49c74 d6c098 eadab4 f6eed6');
const FELT = ramp('241608 3e2a16 584022 74582e 90703c aa8a50');
const FIRE = ramp('8a1a08 c03a10 e86a18 f8a830 fce070 fff6c0');
const BONE = ramp('6a6050 8a8070 b4aa94 d8d0bc f2ecdc');
const STEEL = ramp('2a2e36 4a505a 6e7682 9aa2ae c8ced6 eef0f4');
const GRIP = ramp('3a1e0c 5a3218 7a4824 9a6234 b87c48');
const RED = ramp('4a0e08 7a1a10 a82a18 c8402a e0603c');

// ------------------------------------------------------------ petite toile en pixels fins
class Fine {
  constructor(w, h, ox, oy, dy = 0) { this.w = w; this.h = h; this.ox = ox; this.oy = oy; this.dy = dy; this.px = new Uint32Array(w * h); }
  // dy : décalage vertical de tout ce qu'on dessine (marge en haut de la toile)
  set(x, y, c) { x = Math.floor(x); y = Math.floor(y + this.dy); if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.px[y * this.w + x] = c; }
  get(x, y) { y += this.dy; return x >= 0 && y >= 0 && x < this.w && y < this.h ? this.px[y * this.w + x] : 0; }
  // ellipse modelée, éclairée d'en haut à gauche ; boost éclaircit (ou assombrit), yMax coupe le bas
  ball(cx, cy, rx, ry, R, boost = 0, yMax = 1e9) {
    const n = R.length;
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry) && y < yMax; y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const nx = (x + 0.5 - cx) / rx, ny = (y + 0.5 - cy) / ry, d = nx * nx + ny * ny;
        if (d > 1) continue;
        const l = -0.5 * nx - 0.6 * ny + 0.62 * Math.sqrt(1 - d);
        this.set(x, y, pick(R, (l * 0.55 + 0.45) * (n - 0.4) + boost - (d > 0.82 ? 0.7 : 0), x, y));
      }
    }
  }
  // trait épais : une suite de petites boules le long des points (rayon r, du premier au dernier point)
  stroke(pts, r0, r1, R, boost = 0) {
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, y0] = pts[i], [x1, y1] = pts[i + 1], n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2) + 1;
      for (let k = 0; k <= n; k++) {
        const t = (i + k / n) / (pts.length - 1), r = r0 + (r1 - r0) * t;
        this.ball(x0 + ((x1 - x0) * k) / n, y0 + ((y1 - y0) * k) / n, r, r, R, boost);
      }
    }
  }
  rect(x, y, w, h, c) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, typeof c === 'function' ? c(x + i, y + j) : c); }
  // un petit dessin en lettres (une lettre = une couleur), tourné de ang (et retourné si mirror), agrandi sc fois, centré en (cx, cy)
  stamp(rows, pal, cx, cy, ang = 0, mirror = false, sc = 1) {
    const gw = rows[0].length, gh = rows.length, ca = Math.cos(ang) / sc, sa = Math.sin(ang) / sc, rad = Math.ceil((Math.hypot(gw, gh) / 2) * sc) + 1;
    for (let y = Math.floor(cy - rad); y <= cy + rad; y++) for (let x = Math.floor(cx - rad); x <= cx + rad; x++) {
      let dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      if (mirror) dx = -dx;
      const sx = Math.floor(dx * ca + dy * sa + gw / 2), sy = Math.floor(-dx * sa + dy * ca + gh / 2);
      if (sx < 0 || sy < 0 || sx >= gw || sy >= gh) continue;
      const c = pal[rows[sy][sx]];
      if (c) this.set(x, y, c);
    }
  }
  // contour d'un pixel fin autour de la silhouette
  outline(c) {
    const src = this.px.slice(), w = this.w, h = this.h;
    const o = (x, y) => x >= 0 && y >= 0 && x < w && y < h && src[y * w + x] >>> 24 === 255;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (!(src[y * w + x] >>> 24 === 255) && (o(x - 1, y) || o(x + 1, y) || o(x, y - 1) || o(x, y + 1))) this.px[y * w + x] = c;
    }
    return this;
  }
  canvas() {
    const c = S.makeCanvas(this.w, this.h), g = c.getContext('2d');
    const img = g.createImageData(this.w, this.h);
    new Uint32Array(img.data.buffer).set(this.px);
    g.putImageData(img, 0, 0);
    c.ox = this.ox;
    c.oy = this.oy;
    return c;
  }
}

// pose une image en pixels fins, son origine en (x, y) (pixels du jeu, arrondis au pixel fin pour rester net)
export function drawFine(ctx, c, x, y) {
  const q = (v) => Math.round(v * F) / F;
  ctx.drawImage(c, q(x - c.ox / F), q(y - c.oy / F), c.width / F, c.height / F);
}

// ------------------------------------------------------------ dessins des lieux (dans un calque, centrés en cx, cy)
const REVOLVER = [
  '....................',
  '..kkkkkkkkkkkkkkkk..',
  '.kGGGGGGGGGGGGGGGGk.',
  '.kgggggggggggggggk..',
  '.kkkdGGGdkkkkkkkk...',
  '..kdgGGgdk..........',
  '..kbBBBbkk..........',
  '.kbBBbbk............',
  'kbBbbbk.............',
  'kkkkkk..............',
];
const DOLLAR = ['...k...', '.kkkkk.', 'kk.k...', 'kk.k...', '.kkkk..', '...k.kk', '...k.kk', 'kkkkkk.', '...k...'];

const GLYPHS = {
  // un viseur (le combat, comme dans Pathway)
  combat(g, cx, cy) {
    const ring = [];
    for (let k = 0; k <= 40; k++) { const a = (k / 40) * Math.PI * 2; ring.push([cx + Math.cos(a) * 7.5, cy + Math.sin(a) * 7.5]); }
    g.stroke(ring, 1.5, 1.5, STEEL, 1);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) g.stroke([[cx + dx * 4, cy + dy * 4], [cx + dx * 12, cy + dy * 12]], 1.4, 1.4, STEEL, 1);
    g.ball(cx, cy, 1.8, 1.8, STEEL, 1);
  },
  // un point d'interrogation tracé à l'encre rouge sang
  event(g, cx, cy) {
    const pts = [];
    for (let a = Math.PI * 1.08; a <= Math.PI * 2.28; a += 0.12) pts.push([cx + Math.cos(a) * 6.5, cy - 5 + Math.sin(a) * 6]);
    pts.push([cx + 0.5, cy + 3.5], [cx + 0.5, cy + 5]);
    g.stroke(pts, 2.3, 1.9, INKR, 0.6);
    g.ball(cx + 0.5, cy + 10, 2.4, 2.4, INKR, 0.6);
  },
  // un grand dollar
  comptoir(g, cx, cy) {
    g.stroke([[cx + 5.5, cy - 6.5], [cx + 2.5, cy - 9], [cx - 2.5, cy - 9], [cx - 5.5, cy - 6.5], [cx - 5.5, cy - 3.5], [cx - 2, cy - 1],
      [cx + 2, cy + 1], [cx + 5.5, cy + 3.5], [cx + 5.5, cy + 6.5], [cx + 2.5, cy + 9], [cx - 2.5, cy + 9], [cx - 5.5, cy + 6.5]], 2, 2, BRASS, 1);
    g.stroke([[cx, cy - 12.5], [cx, cy + 12.5]], 1.2, 1.2, BRASS, 1);
  },
  // une tente et son feu de camp
  camp(g, cx, cy) {
    const ax = cx - 3, top = cy - 11, bot = cy + 10;
    for (let y = top; y <= bot; y++) {
      const half = 0.6 + (y - top) * 0.62;
      for (let x = Math.round(ax - half); x < Math.round(ax + half); x++) {
        const rel = (x + 0.5 - ax) / half;
        g.set(x, y, pick(CANVAS, 3.9 - rel * 1.9 - (y > bot - 1 ? 1 : 0), x, y));
      }
    }
    for (let y = cy + 1; y <= bot; y++) for (let x = Math.round(ax - (y - cy - 1) * 0.42); x <= Math.round(ax + (y - cy - 1) * 0.3); x++) g.set(x, y, hex('2a1a10'));
    g.stroke([[ax, top], [ax - 2, top - 3]], 0.7, 0.7, WOOD);
    const fx = cx + 11, fy = cy + 8;
    g.stroke([[fx - 4, fy + 1], [fx + 4, fy - 1]], 1, 1, WOOD);
    g.stroke([[fx - 4, fy - 1], [fx + 4, fy + 1]], 1, 1, WOOD, -0.5);
    g.ball(fx, fy - 3, 3.2, 4.4, FIRE, 0.6);
    g.ball(fx, fy - 2, 1.6, 2.4, FIRE, 2.4);
  },
  // un chapeau de cow-boy
  recrue(g, cx, cy) {
    g.ball(cx, cy + 4, 14, 4.2, FELT, 0.2);
    g.ball(cx, cy - 3, 7.5, 8.5, FELT, 0.5, cy + 3);
    for (let x = -6; x <= 6; x++) { g.set(cx + x, cy + 1, RED[2]); g.set(cx + x, cy + 2, RED[1]); }
    for (let y = -10; y <= -6; y++) g.set(cx, cy + y, FELT[1]);
  },
  // un coffre cerclé de laiton
  cache(g, cx, cy) {
    g.rect(cx - 12, cy - 1, 25, 11, (x, y) => pick(WOOD, 3.6 - (y - cy) * 0.18 - ((y - cy + 1) % 4 === 0 ? 1 : 0), x, y));
    g.ball(cx + 0.5, cy - 1, 12.5, 7, WOOD, 0.4, cy);
    for (const bx of [cx - 9, cx + 8]) for (let y = cy - 7; y < cy + 10; y++) if (g.get(bx, y)) { g.set(bx, y, pick(BRASS, 3.5, bx, y)); g.set(bx + 1, y, pick(BRASS, 2.2, bx + 1, y)); }
    g.ball(cx + 0.5, cy + 1, 3, 3.5, BRASS, 0.6);
    g.set(cx, cy + 1, OUT); g.set(cx, cy + 2, OUT);
  },
  // des menottes
  prisonnier(g, cx, cy) {
    const ring = (rx, ry) => {
      for (let y = ry - 7; y <= ry + 7; y++) for (let x = rx - 7; x <= rx + 7; x++) {
        const dx = x + 0.5 - rx, dy = y + 0.5 - ry, d = Math.hypot(dx, dy);
        if (d < 3.6 || d > 6.6) continue;
        g.set(x, y, pick(IRON, 3.2 - (dx + dy) / d * 1.4 - (d > 5.8 ? 0.8 : 0), x, y));
      }
    };
    ring(cx - 6, cy + 4);
    ring(cx + 7, cy + 4);
    for (const [x, y] of [[cx - 3, cy - 4], [cx + 0.5, cy - 6], [cx + 4, cy - 4]]) g.ball(x, y, 1.9, 1.6, IRON, 0.5);
  },
  // la fourche d'El Diablo, en fer, sur fond de sang
  repaire(g, cx, cy) {
    const pal = IRON.map((c, i) => (i < 2 ? c : blend(c, hex('f0e0d0'), 0.15)));
    g.stroke([[cx, cy - 4], [cx, cy + 16]], 1.4, 1.4, pal, 1);
    g.stroke([[cx - 8, cy - 3], [cx + 8, cy - 3]], 1.4, 1.4, pal, 1);
    for (const tx of [cx - 8, cx, cx + 8]) {
      g.stroke([[tx, cy - 3], [tx, cy - 13]], 1.3, 1, pal, 1);
      g.set(tx - 2, cy - 11, pal[3]); g.set(tx - 1, cy - 12, pal[4]);
    }
  },
  // une maison (Dusty Gulch, le départ)
  depart(g, cx, cy) {
    for (let y = -11; y <= -2; y++) { const half = 1 + (y + 11) * 1.25; for (let x = Math.round(-half); x <= Math.round(half); x++) g.set(cx + x, cy + y, CANVAS[4]); }
    g.rect(cx - 8, cy - 2, 17, 11, CANVAS[4]);
    g.rect(cx - 2, cy + 3, 5, 6, OUT);
    g.rect(cx - 6, cy, 3, 3, OUT);
    g.rect(cx + 4, cy, 3, 3, OUT);
  },
  // encore inconnu : trois points d'encre pâlis
  unknown(g, cx, cy) {
    for (const dx of [-6, 0, 6]) g.ball(cx + dx, cy + 1, 1.8, 1.8, PARCHO, -2.5);
  },
};

// ------------------------------------------------------------ médaillons
// state : 'idle' (on n'y va pas d'ici), 'open' (on peut y aller : cerclage de laiton), 'seen' (déjà visité : éteint)
// Chaque type de lieu a sa couleur de fond, comme un panneau : on les reconnaît d'un coup d'œil, même en petit.
const FACES = {
  combat: '#a8322a', event: '#2e5590', comptoir: '#3c7034', camp: '#9a5420', recrue: '#6a4290', cache: '#8a6818',
  prisonnier: '#4a5060', depart: '#6a4a2a', repaire: '#7a1a12',
};
const CREAMR = ramp('7a6a50 9c8c6c c0b08e dccdac eee2c4 fbf3e0');
const KEEP = new Set(FIRE); // les flammes du feu de camp gardent leurs couleurs
const medals = new Map();
export const medalRadius = (type) => (type === 'repaire' ? 9.5 : 9); // en pixels du jeu
// dessine dans g autour de (cx, cy), k fois plus grand que le modèle (toujours au grain du pixel fin)
function scaled(g, cx, cy, k) {
  const X = (x) => cx + (x - cx) * k, Y = (y) => cy + (y - cy) * k;
  return {
    set: (x, y, c) => { for (let j = 0; j < k; j++) for (let i = 0; i < k; i++) g.set(X(x) + i, Y(y) + j, c); },
    get: (x, y) => g.get(Math.floor(X(x)), Math.floor(Y(y))),
    ball: (x, y, rx, ry, R, boost = 0, yMax = 1e9) => g.ball(X(x), Y(y), rx * k, ry * k, R, boost, yMax >= 1e9 ? 1e9 : Y(yMax)),
    stroke: (pts, r0, r1, R, boost = 0) => g.stroke(pts.map(([x, y]) => [X(x), Y(y)]), r0 * k, r1 * k, R, boost),
    rect: (x, y, w, h, c) => g.rect(Math.round(X(x)), Math.round(Y(y)), Math.round(w * k), Math.round(h * k), c),
    stamp: (rows, pal, x, y, ang = 0, mirror = false, sc = 1) => g.stamp(rows, pal, X(x), Y(y), ang, mirror, sc * k),
  };
}
export function medal(type, state = 'idle') {
  const key = `${type}|${state}`;
  if (medals.has(key)) return medals.get(key);
  const big = type === 'repaire', R0 = medalRadius(type) * F, size = Math.ceil(R0 * 2 + 14), cx = R0 + 5, cy = R0 + 5;
  const s = new Fine(size, size, cx, cy);
  const seen = state === 'seen', unknown = !FACES[type];
  // l'ombre portée, tramée et transparente
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = (x + 0.5 - cx - 5) / (R0 + 1), dy = (y + 0.5 - cy - 7) / ((R0 + 1) * 0.8);
    if (dx * dx + dy * dy <= 1 && bay(x, y) > 0.3) s.set(x, y, pack(10, 6, 4, 115));
  }
  const rim = big ? IRON : state === 'open' ? BRASS : seen ? WOODO : WOOD;
  // le fond : la couleur du lieu (éteinte une fois visité), parchemin pour les lieux encore inconnus
  const face = unknown ? (seen ? PARCHO : PARCH) : rampOf(seen ? S.mix(FACES[type], '#6a6258', 0.6) : FACES[type], -0.55, 0.22);
  const rw = big ? 5 : 4; // épaisseur du cerclage
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = x + 0.5 - cx, dy = y + 0.5 - cy, d = Math.hypot(dx, dy);
    if (d > R0 + 1) continue;
    if (d > R0) { s.set(x, y, OUT); continue; }
    const nx = dx / R0, ny = dy / R0;
    if (d > R0 - rw) {
      // le cerclage : éclairé en haut à gauche, biseau sombre vers l'intérieur
      const l = -0.55 * nx - 0.65 * ny, inner = d < R0 - rw + 1.2;
      s.set(x, y, pick(rim, 2.7 + l * 2.3 - (inner ? 1.2 : 0) + (d > R0 - 1 ? -0.6 : 0), x, y));
    } else {
      // le fond, un peu bombé et grainé
      const r1 = d / (R0 - rw), l = -0.4 * nx - 0.5 * ny + 0.35 * Math.sqrt(Math.max(0, 1 - r1 * r1));
      const shadowRing = r1 > 0.86 ? -1 : 0; // l'ombre du cerclage sur le fond
      s.set(x, y, pick(face, 3.1 + l * 1.8 + shadowRing + (hsh(x, y, 9) - 0.5) * 0.4, x, y));
    }
  }
  // les rivets du cerclage de fer
  if (big) for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2 + 0.2; s.ball(cx + Math.cos(a) * (R0 - 2.5), cy + Math.sin(a) * (R0 - 2.5), 1.3, 1.3, BRASS, 0.4); }
  // le dessin du lieu, agrandi, en silhouette crème modelée (les flammes gardent leur couleur), cerné d'encre ;
  // éteint sur un lieu déjà visité
  const g = new Fine(size, size, cx, cy);
  (GLYPHS[type] || GLYPHS.unknown)(scaled(g, cx, cy, big ? 1.25 : 1.3), cx, cy);
  if (!unknown) {
    for (let i = 0; i < g.px.length; i++) {
      const p = g.px[i];
      if (!p || KEEP.has(p)) continue;
      const lum = ((p & 255) * 0.3 + ((p >>> 8) & 255) * 0.55 + ((p >>> 16) & 255) * 0.15) / 255;
      g.px[i] = pick(CREAMR, 1.6 + lum * 4.4, i % size, Math.floor(i / size));
    }
    g.outline(INKO);
  }
  const bg = face[2];
  for (let i = 0; i < g.px.length; i++) if (g.px[i]) s.px[i] = seen ? blend(g.px[i], bg, 0.45) : g.px[i];
  const c = s.canvas();
  medals.set(key, c);
  return c;
}

// le halo qui pulse autour d'un lieu où l'on peut aller (k : 0..1, la phase de la pulsation)
const halos = new Map();
export function halo(type, k) {
  const step = Math.round(k * 5);
  const key = `${type}|${step}`;
  if (halos.has(key)) return halos.get(key);
  const R0 = medalRadius(type) * F, size = Math.ceil(R0 * 2 + 26), cx = size / 2, cy = size / 2;
  const s = new Fine(size, size, cx, cy);
  const r = R0 + 3 + step * 0.9, a = 200 - step * 26;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
    if (d < r - 1.6 || d > r + 1.6) continue;
    const inner = Math.abs(d - r) < 0.8;
    if (!inner && bay(x, y) < 0.5) continue;
    s.set(x, y, inner ? pack(248, 200, 96, a) : pack(224, 96, 40, Math.round(a * 0.7)));
  }
  const c = s.canvas();
  halos.set(key, c);
  return c;
}

// ------------------------------------------------------------ le pion de la bande : son cowboy à cheval
// look : l'allure du personnage (data.js) ; frame : -1 à l'arrêt, 0 à 3 au galop. Origine : sous les sabots.
const pawns = new Map();
const PAWN_Z = 1.45; // le cavalier est dessiné un peu plus grand que son modèle (en pixels fins, sans agrandir l'image)
const LEGS = [ // décalage des sabots (avant, arrière) et levée, image par image du galop
  [[6, 0], [3, 2], [-6, 0], [-3, 2]],
  [[2, 3], [0, 1], [-2, 2], [0, 0]],
  [[-2, 1], [1, 3], [3, 1], [-1, 3]],
  [[4, 2], [1, 0], [-4, 2], [-2, 0]],
];
export function pawn(look = {}, frame = -1) {
  const key = `${S.lookKey ? S.lookKey(look) : JSON.stringify(look)}|${frame}`;
  if (pawns.has(key)) return pawns.get(key);
  const Z = PAWN_Z, s = new Fine(Math.ceil(52 * Z), Math.ceil(50 * Z) + 3, Math.round(25 * Z), Math.round(47 * Z) + 3, 3);
  const ball = (x, y, rx, ry, R, boost = 0, yMax = 1e9) => s.ball(x * Z, y * Z, rx * Z, ry * Z, R, boost, yMax * Z);
  const stroke = (pts, r0, r1, R, boost = 0) => s.stroke(pts.map(([x, y]) => [x * Z, y * Z]), r0 * Z, r1 * Z, R, boost);
  const rect = (x, y, w, h, fn) => s.rect(Math.round(x * Z), Math.round(y * Z), Math.round(w * Z), Math.round(h * Z), (X, Y) => fn(X, Y, X / Z, Y / Z));
  const dot = (x, y, c) => { for (let j = 0; j < Z; j++) for (let i = 0; i < Z; i++) s.set(x * Z + i, y * Z + j, c); };
  const coat = rampOf('#8a5228'), mane = rampOf('#3a2414', -0.5, 0.2);
  const skin = rampOf(SKIN[look.skin] || SKIN[1], -0.5, 0.25), cloth = rampOf(CLOTH_COLORS[look.outfitColor] ?? CLOTH_COLORS[2]);
  const hat = rampOf(hatColorOf(look)), hair = rampOf(HAIR_COLORS[look.hairColor] || HAIR_COLORS[1], -0.5, 0.2);
  const pants = rampOf('#4a3a30'), boot = rampOf('#2a1a12', -0.4, 0.3);
  const by = frame < 0 ? 0 : [0, -1, 0, 1][frame];
  // l'ombre au sol
  for (let y = Math.floor(43 * Z); y < 49 * Z; y++) for (let x = Math.floor(8 * Z); x < 44 * Z; x++) {
    const dx = (x + 0.5 - 25 * Z) / (15 * Z), dy = (y + 0.5 - 46 * Z) / (2.6 * Z);
    if (dx * dx + dy * dy <= 1 && bay(x, y) > 0.3) s.set(x, y, pack(10, 6, 4, 110));
  }
  // les jambes du cheval (derrière le corps d'abord)
  const legs = frame < 0 ? [[2, 0], [0, 0], [-2, 0], [0, 0]] : LEGS[frame];
  const hips = [[31, 31], [29, 31], [17, 31], [15, 31]];
  legs.forEach(([dx, lift], i) => {
    const [hx, hy] = hips[i], far = i % 2 === 1;
    const fx = hx + dx, fy = 45 - lift;
    stroke([[hx, hy + by], [hx + dx * 0.4, hy + 7 + by], [fx, fy - 1]], 1.4, 1.1, coat, far ? -1.2 : -0.2);
    ball(fx, fy, 1.4, 1, boot, far ? -0.6 : 0);
  });
  // la queue, qui flotte au galop
  const wave = frame < 0 ? 0 : [0, 1, 2, 1][frame];
  stroke([[13, 25 + by], [9, 28 + by - wave], [7, 34 + by - wave * 2]], 1.8, 1, mane, 0.3);
  // le corps, le poitrail, l'encolure et la tête
  ball(24, 28 + by, 12, 6.5, coat);
  ball(33, 26 + by, 5, 6, coat, 0.2);
  stroke([[33, 24 + by], [37, 16 + by]], 3.6, 3, coat, 0.3);
  ball(40, 14.5 + by, 5, 3.2, coat, 0.3);
  ball(43.5, 16 + by, 2.4, 2.2, coat, -0.6);
  dot(44, 16 + by, OUT);
  dot(39, 13 + by, OUT);
  stroke([[37, 11 + by], [38, 9 + by]], 0.8, 0.6, coat, 0.6);
  stroke([[36, 12 + by], [33, 18 + by], [31, 22 + by]], 1.3, 1.1, mane, 0.4);
  // la selle et la couverture
  rect(19, 20 + by, 10, 3, (x, y, u, v) => pick(RED, 3 - (v - 20 - by) * 0.8, x, y));
  rect(20, 18 + by, 8, 2, (x, y) => pick(GRIP, 2.6, x, y));
  // le cavalier : la jambe, la botte dans l'étrier, le buste, le bras qui tient les rênes, la tête et le chapeau
  stroke([[24, 18 + by], [26, 27 + by]], 1.8, 1.5, pants);
  ball(26.5, 28.5 + by, 2.2, 1.5, boot);
  ball(24, 13 + by, 4, 5.6, cloth);
  stroke([[25.5, 11 + by], [30, 16 + by], [33, 17 + by]], 1.3, 1.1, cloth, -0.2);
  ball(33.5, 17.5 + by, 1.2, 1.2, skin);
  stroke([[34, 17.5 + by], [39, 14 + by]], 0.5, 0.5, boot, 1);
  ball(24.5, 6 + by, 2.8, 3, skin, 0.3);
  rect(22, 7 + by, 2, 3, (x, y) => pick(hair, 2.5, x, y));
  if (look.hat !== 'none') {
    ball(24.5, 3.6 + by, 6.2, 1.5, hat, 0.3);
    ball(24.5, 1.8 + by, 3.4, 2.6, hat, 0.6, 3.6 + by);
  } else ball(24.5, 3.8 + by, 3, 1.6, hair, 0.4);
  const c = s.outline(OUT).canvas();
  pawns.set(key, c);
  return c;
}
