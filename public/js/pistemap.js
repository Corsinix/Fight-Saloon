// Carte du monde de « La piste », façon Pathway : un vrai paysage vu de dessus, dessiné une seule fois par partie en
// haute résolution (F pixels fins par pixel du jeu, soit 1536 × 864) : relief ombré propre à chaque région (dunes et
// salines, mesas en gradins, collines fleuries, sous-bois, montagnes enneigées, cendres et lave autour du repaire),
// rivière, ruisseau et lacs, pistes de terre battue avec leurs ponts, la ville de départ, le repaire d'El Diablo et des
// milliers de détails (cactus, cheminées de fée, forêts, bisons, tipis, ferme, cabane, chariot abandonné…).
// À chaque image, par-dessus : ombres des nuages, reflets sur l'eau, fumées et feux, brouillard des terres inconnues.
// Le relief et les couleurs sont calculés pixel par pixel (tramage ordonné : l'aspect pixel art), les objets sont de
// petits sprites dessinés en code et posés du fond vers l'avant.
import * as S from './sprites.js';
import { W, H, rng } from './worlds.js';

export const F = 4; // pixels fins par pixel du jeu
const FW = W * F, FH = H * F;
const TOP = 15, BOT = H - 19; // la carte visible, entre la barre des ressources et la bande

// ------------------------------------------------------------ couleurs (entiers RGBA, octets dans l'ordre R G B A)
const pack = (r, g, b, a = 255) => ((a << 24) | (b << 16) | (g << 8) | r) >>> 0;
const hex = (h) => { const n = parseInt(h, 16); return pack(n >> 16, (n >> 8) & 255, n & 255); };
const ramp = (s) => s.split(' ').map(hex);
const scale = (p, k) => pack(Math.min(255, (p & 255) * k) | 0, Math.min(255, ((p >>> 8) & 255) * k) | 0, Math.min(255, ((p >>> 16) & 255) * k) | 0);
const blend = (p, q, t) => {
  const c = (s) => { const a = (p >>> s) & 255; return (a + (((q >>> s) & 255) - a) * t) | 0; };
  return pack(c(0), c(8), c(16));
};

// palettes, du plus sombre au plus clair
const SAND = ramp('5a3a20 7a5030 9a6a3a b8844a d0a05c e2b872 eecb8a f6dea8');
const SALT = ramp('b89c74 c8b088 d6c29c e2d2b0 ecdfc2');
const ROCKR = ramp('2e100a 4a1c10 6a2a16 8a3c1e a8522a c46c36 d88a4a e8aa68 f2c890');
const GRASS = ramp('1e3814 2a4c1a 38621e 4a7826 5e8e2e 76a43a 92b84a b0cc62');
const DRY = ramp('4a4a1e 66622a 847a34 a09440 baae52 d0c46a');
const FORR = ramp('0c180c 122414 1a321a 22401e 2c5026 3a6230');
const SNOW = ramp('4a5878 66789a 8698b8 a8b8d4 c8d6e8 e2eaf4 f6f9fd');
const SROCK = ramp('22222c 34343f 4a4a58 626478 7e8298');
const ASH = ramp('0e0606 1c0c0a 2c1410 3e1c14 52261a 6a3424');
const LAVA = ramp('7a1408 b02a0c e0561a f8902c fcc860');
const WATER = ramp('143656 1c4a6e 266086 367a9e 5498b8 86bcd4 c8e8f0');
const ICE = ramp('6a8aa8 8aa8c4 a8c4dc c4dcec e0eef8');
const MUD = ramp('3a2a18 4e3a22 64502e 7a6440 948058');
const DIRT = ramp('5a3e22 74522e 8e6a3c a8844e c0a066 d4b880');
const FLOWERS = ['f4f0e0', 'f0d040', 'd060a0', '8090e0'].map(hex);
// objets
const CACT = ramp('16301a 24482a 34622f 4c7e3c 6c9c50 92b86a');
const TRUNK = ramp('2a180c 44281a 5e3c24 7a5232');
const LEAF = ramp('1a3214 284a1c 3a6424 52802e 6e9a3a 8eb44c');
const DLEAF = ramp('0a160c 10221a 183220 22422a 2e5432 3e6a3a');
const AUTUMN = ramp('3a1a0a 6a2a10 9a4418 c0642a d88a3a');
const PINE = ramp('081610 0e2418 16321e 1e4228 2a5432');
const SAGE = ramp('3a3a1e 54522a 6e6a36 8a8446 a8a05c');
const ROCKD = ramp('3e3024 5a4634 786048 967c5e b49a78 d0b896');
const OBS = ramp('060303 120807 1e0e0a 2e1610 422016 5a2c1c');
const BONE = ramp('6a6050 8a8070 b4aa94 d8d0bc f2ecdc');
const HORN = ramp('2a1a12 4a3424 7a6248 a8946e d2c29a efe4c6');
const CANVAS = ramp('8a7454 b49c74 d6c098 eadab4 f6eed6');
const WOOD = ramp('3a2414 5a3a20 7a5230 9a6a3e b88a54');
const REDW = ramp('3a120c 5e2216 843420 a8482a c06038');
const BLUEW = ramp('2a3440 3e4c5c 566a7e 7088a0 8aa2b8');
const GREYW = ramp('3a3a40 5a5a64 7c7c88 a0a0ac c8c8d0');
const WHITEW = ramp('7a766c a8a296 cecabe ecE8de'.toLowerCase());
const ROOF = ramp('241812 3a2a20 524032 6c5844 86705a');
const BISON = { k: hex('140c08'), n: hex('3a2414'), N: hex('5a3a20'), b: hex('6a4a2a'), B: hex('8a6a3a'), h: hex('d8d0bc') };
const OUTC = hex('1a0f0a');
const INKC = hex('2a1a10');
const CREAMC = hex('eadab4');

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
// couleur d'une palette à un niveau fractionnaire, tramée entre les deux teintes voisines
const P = (R, l) => R[l < 0 ? 0 : l >= R.length ? R.length - 1 : l | 0];
const pickc = (R, l, x, y) => P(R, l + bay(x, y) - 0.5);
const sstep = (a, b, x) => { const t = x <= a ? 0 : x >= b ? 1 : (x - a) / (b - a); return t * t * (3 - 2 * t); };

// champ de bruit calculé sur une grille d'un demi-pixel du jeu, ramené à [0, 1], lu ensuite en bilinéaire
function field(fn) {
  const gw = W * 2 + 3, gh = H * 2 + 3, a = new Float32Array(gw * gh);
  let lo = Infinity, hi = -Infinity;
  for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
    const v = fn(i / 2, j / 2);
    a[j * gw + i] = v;
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  for (let k = 0; k < a.length; k++) a[k] = (a[k] - lo) / (hi - lo || 1);
  a.gw = gw;
  return a;
}
function samp(a, u, v) {
  const x = u * 2, y = v * 2, i = x | 0, j = y | 0, fx = x - i, fy = y - j, gw = a.gw, k = j * gw + i;
  const a0 = a[k] + (a[k + 1] - a[k]) * fx, a1 = a[k + gw] + (a[k + gw + 1] - a[k + gw]) * fx;
  return a0 + (a1 - a0) * fy;
}

// ------------------------------------------------------------ petits sprites en pixels fins
class Spr {
  constructor(w, h, ox, oy) { this.w = w; this.h = h; this.ox = ox; this.oy = oy; this.px = new Uint32Array(w * h); this.emit = []; }
  set(x, y, c) { x = Math.floor(x); y = Math.floor(y); if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.px[y * this.w + x] = c; }
  rect(x, y, w, h, c) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, typeof c === 'function' ? c(x + i, y + j) : c);
  }
  // ellipse modelée, éclairée d'en haut à gauche ; boost éclaircit ou assombrit, yMax coupe le bas
  ball(cx, cy, rx, ry, R, boost = 0, yMax = 1e9) {
    const n = R.length;
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry) && y < yMax; y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const nx = (x + 0.5 - cx) / rx, ny = (y + 0.5 - cy) / ry, d = nx * nx + ny * ny;
        if (d > 1) continue;
        const l = -0.5 * nx - 0.6 * ny + 0.62 * Math.sqrt(1 - d);
        this.set(x, y, pickc(R, (l * 0.55 + 0.45) * (n - 0.4) + boost - (d > 0.82 ? 0.7 : 0), x, y));
      }
    }
  }
  line(x0, y0, x1, y1, c, th = 1, c2 = c) {
    const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 1.6) + 1;
    for (let k = 0; k <= n; k++) {
      const x = x0 + ((x1 - x0) * k) / n, y = y0 + ((y1 - y0) * k) / n;
      this.set(x, y, c);
      if (th > 1) this.set(x + 1, y, c2);
      if (th > 2) this.set(x - 1, y, c);
    }
  }
  // contour d'un pixel fin autour de la silhouette
  outline(c) {
    const src = this.px.slice(), w = this.w, h = this.h;
    const o = (x, y) => x >= 0 && y >= 0 && x < w && y < h && src[y * w + x];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (!src[y * w + x] && (o(x - 1, y) || o(x + 1, y) || o(x, y - 1) || o(x, y + 1))) this.px[y * w + x] = c;
    }
    return this;
  }
}
const grid = (rows, pal, ox, oy) => {
  const s = new Spr(rows[0].length, rows.length, ox, oy);
  rows.forEach((r, y) => [...r].forEach((ch, x) => { if (pal[ch]) s.set(x, y, pal[ch]); }));
  return s;
};

function saguaro(R) {
  const h = 16 + ((R() * 14) | 0), s = new Spr(17, h + 2, 8, h + 1);
  const stem = (x0, y0, y1, w) => {
    for (let y = y0; y <= y1; y++) for (let k = 0; k < w; k++) {
      if (y === y0 && (k === 0 || k === w - 1)) continue;
      s.set(x0 + k, y, pickc(CACT, 4.4 - ((k + 0.5) / w) * 3.8, x0 + k, y));
    }
  };
  stem(6, 1, h, 5);
  if (R() < 0.85) { const ya = (h * (0.35 + R() * 0.25)) | 0; s.rect(4, ya, 2, 3, CACT[3]); stem(2, ya - 4 - ((R() * 5) | 0), ya + 2, 3); }
  if (R() < 0.7) { const ya = (h * (0.3 + R() * 0.3)) | 0; s.rect(11, ya, 2, 3, CACT[2]); stem(12, ya - 4 - ((R() * 5) | 0), ya + 2, 3); }
  for (let k = 0; k < 6; k++) s.set(7 + ((R() * 3) | 0), 2 + R() * (h - 3), CACT[5]);
  if (R() < 0.3) s.set(8, 1, hex('f4ecd8'));
  return s.outline(OUTC);
}
function pear(R) {
  const s = new Spr(18, 15, 9, 14);
  s.ball(9, 10, 3.4, 4, CACT, 0, 14);
  const n = 1 + ((R() * 3) | 0);
  for (let k = 0; k < n; k++) {
    const x = 9 + (R() - 0.5) * 9, y = 6 + R() * 3;
    s.ball(x, y, 2.6, 3.3, CACT, 0.3);
    if (R() < 0.5) s.set(x, y - 3, hex('d0306a'));
  }
  return s.outline(OUTC);
}
function rock(R, P0, size, snowy = false) {
  const rx = size * (0.9 + R() * 0.4), ry = size * (0.65 + R() * 0.25);
  const w = Math.ceil(rx * 2.6 + 6), h = Math.ceil(ry * 2 + 5), s = new Spr(w, h, w >> 1, h - 2);
  const cx = w / 2, cy = h - 2 - ry;
  s.ball(cx, cy, rx, ry, P0, 0, h - 1);
  if (R() < 0.6) s.ball(cx + (R() < 0.5 ? -1 : 1) * rx * 0.8, cy + ry * 0.35, rx * 0.5, ry * 0.6, P0, -0.2, h - 1);
  if (snowy) {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (s.px[i] && y < cy - ry * 0.1 + Math.sin(x * 1.3) * 1.2) s.px[i] = pickc(SNOW, 5 - (x - cx) / rx, x, y);
    }
  }
  return s.outline(scale(P0[0], 0.6));
}
function bush(R, P0) {
  const s = new Spr(14, 10, 7, 9);
  const n = 2 + ((R() * 3) | 0);
  for (let k = 0; k < n; k++) s.ball(7 + (R() - 0.5) * 6, 6 + (R() - 0.3) * 2, 2 + R() * 1.6, 1.8 + R() * 1.2, P0, k / n - 0.3, 9);
  return s.outline(scale(P0[0], 0.6));
}
function deadTree(R, c1, c2, out = OUTC) {
  const s = new Spr(24, 28, 12, 27);
  const br = (x, y, a, len, th, d) => {
    const x1 = x + Math.cos(a) * len, y1 = y + Math.sin(a) * len;
    s.line(x, y, x1, y1, c1, th, c2);
    if (d > 0) {
      br(x1, y1, a - 0.35 - R() * 0.45, len * 0.66, Math.max(1, th - 1), d - 1);
      if (R() < 0.8) br(x1, y1, a + 0.35 + R() * 0.45, len * 0.6, Math.max(1, th - 1), d - 1);
    }
  };
  br(12, 27, -Math.PI / 2 + (R() - 0.5) * 0.4, 9 + R() * 4, 2, 3);
  return s.outline(out);
}
function hoodoo(R) {
  const cw = 7 + ((R() * 4) | 0), ch = 18 + ((R() * 16) | 0), w = cw + 8, h = ch + 6;
  const s = new Spr(w, h, w >> 1, h - 1), x0 = (w - cw) >> 1, ph = R() * 6;
  for (let y = 4; y < h - 1; y++) {
    const band = [5, 6, 4, 5.5, 3.5][Math.floor(y / 3) % 5], wob = Math.round(Math.sin(y * 0.6 + ph) * 0.7);
    for (let k = 0; k < cw; k++) s.set(x0 + k + wob, y, pickc(ROCKR, band + 1.4 - (k / (cw - 1)) * 3.4, x0 + k, y));
  }
  s.ball(w / 2, 3.5, cw / 2 + 2, 2.7, ROCKR, -1.2);
  return s.outline(hex('1e0806'));
}
function pine(R, P0, snowy) {
  const h = 18 + ((R() * 14) | 0), hw = 5 + ((R() * 3) | 0), w = hw * 2 + 5;
  const s = new Spr(w, h + 4, w >> 1, h + 3), cx = (w >> 1) + 0.5;
  for (let y = h - 4; y <= h + 2; y++) { s.set(cx - 1, y, TRUNK[2]); s.set(cx, y, TRUNK[1]); }
  const L = 4;
  for (let l = L - 1; l >= 0; l--) {
    const top = Math.round(l * (h - 2) * 0.21), bot = Math.min(h, Math.round(top + (h - 2) * 0.38));
    const hwl = hw * (0.42 + (0.58 * l) / (L - 1));
    for (let y = top; y <= bot; y++) {
      const k = (y - top) / Math.max(1, bot - top), half = 0.6 + k * hwl;
      for (let x = Math.round(cx - half - 0.5); x <= Math.round(cx + half - 0.5); x++) {
        if (y === bot && (x + l) % 2 === 0) continue; // bord dentelé des branches
        const rel = (x + 0.5 - cx) / (half + 0.5);
        let c = pickc(P0, 2.7 - rel * 1.7 - (k > 0.8 ? 0.9 : 0) + (k < 0.25 ? 0.5 : 0), x, y);
        if (snowy && ((k < 0.4 && rel < 0.5) || hsh(x, y, l + 3) < 0.07)) c = pickc(SNOW, 5.2 - rel * 1.4 - k * 2, x, y);
        s.set(x, y, c);
      }
    }
  }
  return s.outline(scale(P0[0], 0.5));
}
function tree(R, P0) {
  const r = 5 + R() * 3, w = Math.ceil(r * 2 + 8), th = 4 + ((R() * 3) | 0), h = Math.ceil(r * 1.9 + th + 4);
  const s = new Spr(w, h, w >> 1, h - 1), cx = w / 2, cy = r + 2;
  for (let y = (cy + r * 0.4) | 0; y < h - 1; y++) { s.set(cx - 1, y, TRUNK[2]); s.set(cx, y, TRUNK[1]); }
  for (let b = 0; b < 3; b++) s.ball(cx + (R() - 0.5) * r * 1.2, cy + r * 0.35 + R() * 1.5, r * (0.5 + R() * 0.2), r * 0.45, P0, -0.8);
  s.ball(cx, cy, r * 0.9, r * 0.8, P0);
  const n = 1 + ((R() * 3) | 0);
  for (let b = 0; b < n; b++) s.ball(cx + (R() - 0.6) * r * 0.9, cy - r * 0.3 + (R() - 0.5) * r * 0.5, r * (0.35 + R() * 0.15), r * 0.33, P0, 0.5);
  return s.outline(scale(P0[0], 0.55));
}
const skull = () => grid([
  'W.......W',
  'Ww.....wW',
  '.wwWWWww.',
  '..WkWkW..',
  '...WWW...',
  '...wWw...',
], { W: BONE[4], w: BONE[2], k: INKC }, 4, 5);
function bones(R) {
  const s = new Spr(10, 6, 5, 5);
  for (let k = 0; k < 3; k++) { const x = 1 + R() * 6, y = 1 + R() * 4, a = R() * Math.PI; s.line(x, y, x + Math.cos(a) * 3, y + Math.sin(a) * 1.5, BONE[3 + (k & 1)]); }
  return s;
}
function weed(R) {
  const s = new Spr(10, 9, 5, 8), cols = [hex('7a5a32'), hex('9a7646'), hex('5a4026'), hex('b08a58')];
  for (let k = 0; k < 70; k++) {
    const a = R() * Math.PI * 2, r = 3.6 * Math.sqrt(R());
    s.set(5 + Math.cos(a) * r, 4.5 + Math.sin(a) * r * 0.85, cols[(R() * 4) | 0]);
  }
  return s;
}
const bison = () => grid([
  '..nn.......',
  '.nNNnbbb...',
  'kNNNNbbBbb.',
  'hkNNNbBBbbb',
  '.kNNbbbbbb.',
  '..k.k..k.k.',
  '..k.k..k.k.',
], BISON, 6, 6).outline(scale(BISON.k, 1));
function tipi(R) {
  const s = new Spr(15, 19, 7, 18), cx = 7.5, band = hex(R() < 0.5 ? '9a3020' : '2a5a8a');
  for (let y = 3; y < 18; y++) {
    const half = 0.6 + (y - 3) * 0.42;
    for (let x = Math.round(cx - half); x < Math.round(cx + half); x++) {
      const rel = (x + 0.5 - cx) / half;
      let c = pickc(CANVAS, 3.6 - rel * 1.8, x, y);
      if (y === 10 || y === 11) c = band;
      if (y === 14 && (x & 1)) c = band;
      s.set(x, y, c);
    }
  }
  for (let y = 13; y < 18; y++) for (let x = Math.round(cx - (y - 13) * 0.5) - 1; x < Math.round(cx + (y - 13) * 0.5); x++) s.set(x, y, hex('3a2414'));
  s.line(cx - 0.5, 3, cx - 3, 0, WOOD[1]);
  s.line(cx - 0.5, 3, cx + 2, 0, WOOD[2]);
  return s.outline(OUTC);
}
function campfire() {
  const s = new Spr(9, 6, 4, 4);
  [[1, 3], [2, 4], [4, 5], [6, 4], [7, 3], [6, 2], [2, 2]].forEach(([x, y]) => s.set(x, y, GREYW[(x + y) % 3 + 1]));
  s.rect(3, 2, 3, 2, hex('3a1a0a'));
  s.emit.push({ x: 4.5, y: 2.5, kind: 'fire' }, { x: 4.5, y: 0, kind: 'smoke' });
  return s;
}
function wagon() {
  const s = new Spr(26, 16, 13, 15);
  s.rect(3, 9, 20, 3, (x, y) => pickc(WOOD, y === 9 ? 3.5 : 2, x, y));
  s.ball(13, 9, 9, 7, CANVAS, 0.2, 9);
  for (const x of [7, 11, 15, 19]) for (let y = 3; y < 9; y++) if (s.px[y * 26 + x]) s.set(x, y, CANVAS[1]);
  const wheel = (cx, cy) => {
    for (let a = 0; a < 24; a++) s.set(cx + Math.cos((a / 24) * 6.28) * 3, cy + Math.sin((a / 24) * 6.28) * 3, WOOD[0]);
    for (let a = 0; a < 4; a++) s.line(cx, cy, cx + Math.cos(a * 0.8) * 2.5, cy + Math.sin(a * 0.8) * 2.5, WOOD[2]);
  };
  wheel(6, 12);
  wheel(20, 12);
  s.line(23, 11, 25, 14, WOOD[1]); // timon cassé
  return s.outline(OUTC);
}
function waterTower() {
  const s = new Spr(18, 30, 9, 29);
  for (const [x0, x1] of [[4, 2], [8, 7], [10, 11], [14, 16]]) s.line(x0, 15, x1, 29, WOOD[x0 < 9 ? 2 : 1]);
  s.line(3, 21, 15, 21, WOOD[1]);
  s.line(3, 26, 15, 26, WOOD[1]);
  s.rect(2, 6, 14, 10, (x, y) => pickc(WOOD, (y === 8 || y === 13 ? 0.6 : 3.2) - (x - 2) / 6, x, y));
  for (let y = 0; y < 6; y++) { const half = 1 + y * 1.4; s.rect(Math.round(9 - half), y, Math.round(half * 2), 1, (x) => pickc(ROOF, 3.4 - (x - 9 + half) / 3, x, y)); }
  return s.outline(OUTC);
}
function windmill() {
  const s = new Spr(22, 36, 11, 35);
  s.line(11, 12, 6, 35, WOOD[2]);
  s.line(11, 12, 16, 35, WOOD[1]);
  for (const y of [18, 24, 30]) { const k = (y - 12) / 23; s.line(11 - k * 5, y, 11 + k * 5, y, WOOD[1]); }
  for (let a = 0; a < 12; a++) { const t = (a / 12) * Math.PI * 2; s.line(11, 8, 11 + Math.cos(t) * 7, 8 + Math.sin(t) * 7, a & 1 ? GREYW[3] : GREYW[4]); }
  s.line(11, 8, 19, 9, GREYW[1]);
  s.rect(18, 7, 3, 4, REDW[3]);
  s.rect(10, 7, 2, 2, GREYW[0]);
  return s.outline(OUTC);
}

// bâtiments vus en 3/4 : le toit vu d'en haut, puis le mur de façade (fausse façade des boutiques de l'Ouest)
const BT = {
  saloon: { w: 34, rd: 9, wh: 16, ff: 7, wall: REDW, roof: ROOF, sign: true, porch: true, bat: true },
  store: { w: 30, rd: 9, wh: 14, ff: 6, wall: BLUEW, roof: ROOF, sign: true, porch: true },
  bank: { w: 28, rd: 9, wh: 15, ff: 5, wall: GREYW, roof: ROOF, sign: true },
  house: { w: 24, rd: 10, wh: 12, wall: WOOD, roof: ROOF, gable: true, chim: true },
  church: { w: 24, rd: 11, wh: 14, wall: WHITEW, roof: ROOF, gable: true, steeple: true },
  barn: { w: 32, rd: 12, wh: 15, wall: REDW, roof: ROOF, gable: true, barn: true },
  cabin: { w: 24, rd: 10, wh: 11, wall: WOOD, roof: SNOW, gable: true, log: true, chim: true },
};
function building(R, type) {
  const T = BT[type], bw = T.w + ((R() * 5) | 0), pad = T.steeple ? 17 : 4;
  const w = bw + 4, h = pad + T.rd + T.wh + 2, s = new Spr(w, h, w >> 1, h - 2);
  const x0 = 2, yR = pad, yW = pad + T.rd, yB = yW + T.wh, cx = x0 + (bw >> 1);
  const top = T.roof.length - 1;
  s.rect(x0, yR, bw, T.rd, (x, y) => {
    const k = (y - yR) / T.rd;
    let l = T.gable ? (k < 0.45 ? top - 0.6 : top - 1.9) : top - 1 - k;
    if ((y - yR) % 3 === 2) l -= 0.8;
    return pickc(T.roof, l, x, y);
  });
  if (T.gable) s.rect(x0, yR + Math.floor(T.rd * 0.45), bw, 1, T.roof[top]);
  s.rect(x0, yW, bw, T.wh, (x, y) => {
    let l = T.log ? ((y - yW) % 3 === 2 ? 0.8 : 2.4) : (x - x0) % 4 === 3 ? 1.1 : 2.4;
    if (y === yW) l = 0.4;
    return pickc(T.wall, l + (x - x0 < 2 ? 0.6 : 0), x, y);
  });
  if (T.ff) {
    const fy = yW - T.ff;
    s.rect(x0, fy, bw, T.ff, (x, y) => pickc(T.wall, (x - x0) % 4 === 3 ? 1.1 : 2.5, x, y));
    s.rect(x0 + 4, fy - 3, bw - 8, 3, (x, y) => pickc(T.wall, 2.3, x, y));
    s.rect(x0 + 4, fy - 3, bw - 8, 1, T.wall[T.wall.length - 1]);
    s.rect(x0, fy, bw, 1, T.wall[T.wall.length - 1]);
    if (T.sign) {
      s.rect(x0 + 5, fy + 1, bw - 10, T.ff - 2, CREAMC);
      for (let x = x0 + 7; x < x0 + bw - 7; x++) if ((x & 1) && R() < 0.8) s.set(x, fy + 1 + ((T.ff - 2) >> 1), INKC);
    }
  }
  const win = (x, y) => { s.rect(x - 1, y - 1, 5, 6, T.wall[T.wall.length - 1]); s.rect(x, y, 3, 4, hex('1e2430')); s.set(x, y, hex('7aa0c0')); };
  win(x0 + 3, yW + 3);
  win(x0 + bw - 6, yW + 3);
  if (bw > 30) win(cx - 9, yW + 3);
  if (T.barn) {
    s.rect(cx - 6, yB - 11, 12, 11, REDW[1]);
    s.line(cx - 6, yB - 11, cx + 5, yB - 1, CREAMC);
    s.line(cx + 5, yB - 11, cx - 6, yB - 1, CREAMC);
    s.rect(cx - 6, yB - 12, 12, 1, CREAMC);
  } else {
    s.rect(cx - 2, yB - 7, 4, 7, T.bat ? WOOD[3] : hex('2a1810'));
    if (T.bat) s.rect(cx, yB - 6, 1, 4, hex('1a0f0a'));
  }
  if (T.porch) {
    s.rect(x0 - 1, yB - 10, bw + 2, 2, (x, y) => pickc(ROOF, y === yB - 10 ? 3 : 1.5, x, y));
    for (let x = x0; x < x0 + bw; x += 8) s.rect(x, yB - 8, 1, 8, WOOD[1]);
    s.rect(x0 + bw - 1, yB - 8, 1, 8, WOOD[1]);
    s.rect(x0 - 1, yB - 1, bw + 2, 1, WOOD[3]);
  }
  if (T.steeple) {
    s.rect(cx - 3, yR - 6, 6, 11, (x, y) => pickc(WHITEW, x < cx ? 3.2 : 2, x, y));
    s.rect(cx - 1, yR - 4, 2, 3, hex('2a1810'));
    for (let y = 0; y < 7; y++) { const half = 0.5 + y * 0.5; s.rect(Math.round(cx - half), yR - 13 + y, Math.round(half * 2), 1, (x) => pickc(ROOF, x < cx ? 3 : 1.5, x, y)); }
    s.rect(cx - 0.5, yR - 17, 1, 4, CREAMC);
    s.rect(cx - 1.5, yR - 16, 3, 1, CREAMC);
  }
  if (T.chim) {
    const x = x0 + bw - 7;
    s.rect(x, yR - 2, 3, 5, (xx, y) => pickc(REDW, y % 2 ? 1 : 2.4, xx, y));
    s.emit.push({ x: x + 1.5, y: yR - 3, kind: 'smoke' });
  }
  return s.outline(OUTC);
}

// le repaire d'El Diablo : une butte d'obsidienne taillée en crâne cornu, deux braseros devant la gueule
function lairSprite() {
  const s = new Spr(128, 116, 64, 112), yM = 112;
  s.ball(28, 92, 26, 20, OBS, 0, yM);
  s.ball(100, 92, 26, 20, OBS, 0, yM);
  s.ball(64, 74, 50, 36, OBS, 0.4, yM);
  s.ball(64, 50, 32, 24, OBS, 0.8, yM);
  const horn = (d) => {
    const B = [64 + d * 22, 40], M = [64 + d * 50, 26], T = [64 + d * 42, 2];
    for (let t = 0; t <= 1; t += 0.006) {
      const a = (1 - t) * (1 - t), b = 2 * (1 - t) * t, c = t * t;
      const x = a * B[0] + b * M[0] + c * T[0], y = a * B[1] + b * M[1] + c * T[1], r = 4.2 * (1 - t) + 0.8;
      for (let oy = -r; oy <= r; oy++) for (let ox = -r; ox <= r; ox++) {
        if (ox * ox + oy * oy > r * r) continue;
        s.set(x + ox, y + oy, pickc(HORN, 1 + t * 3.6 - (ox + oy) / r * 0.8, Math.floor(x + ox), Math.floor(y + oy)));
      }
    }
  };
  horn(-1);
  horn(1);
  const eye = (ex) => {
    for (let y = 56; y < 72; y++) for (let x = ex - 10; x <= ex + 10; x++) {
      const d = ((x - ex) / 9.5) ** 2 + ((y - 64) / 6.5) ** 2;
      if (d > 1) continue;
      const g = ((x - ex) / 4.5) ** 2 + ((y - 64.5) / 3) ** 2;
      s.set(x, y, g < 1 ? pickc(LAVA, 4.4 - g * 3.6, x, y) : hex('080202'));
    }
    s.emit.push({ x: ex + 0.5, y: 64.5, kind: 'eye' });
  };
  eye(46);
  eye(82);
  for (let y = 73; y < 82; y++) { const half = (82 - y) * 0.45; s.rect(Math.round(64 - half), y, Math.round(half * 2), 1, hex('080202')); }
  for (let y = 86; y < yM; y++) for (let x = 44; x < 84; x++) {
    const dy = y < 96 ? ((x - 64) / 20) ** 2 + ((y - 96) / 10) ** 2 : ((x - 64) / 20) ** 2;
    if (dy > 1) continue;
    s.set(x, y, y > 103 ? pickc(LAVA, (y - 103) * 0.22 - 0.3, x, y) : hex('0a0404'));
  }
  for (let tx = 47; tx < 80; tx += 6) for (let y = 0; y < 5; y++) for (let k = -2 + y * 0.5; k < 2 - y * 0.5; k++) s.set(tx + k + 2, 87 + y, BONE[y < 2 ? 4 : 3]);
  for (const bx of [34, 94]) {
    s.rect(bx - 1, 102, 2, 10, WOOD[1]);
    s.rect(bx - 3, 100, 6, 2, GREYW[1]);
    s.rect(bx - 3, 100, 6, 1, GREYW[3]);
    s.emit.push({ x: bx, y: 99.5, kind: 'fire' });
  }
  return s.outline(hex('000000'));
}

// ------------------------------------------------------------ la carte
const DES = 0, CAN = 1, PRA = 2, FOR = 3, NEI = 4, LAIR = 5;
const BIOME = { desert: DES, canyon: CAN, prairie: PRA, foret: FOR, neige: NEI };

// terr : le territoire (pistekit.js) ; xy(nœud) : sa position à l'écran, en pixels du jeu
// opts (carte du mode histoire, story/mapview.js ; sans opts, la carte de La piste telle quelle) :
//   regionAt(u, v) -> nom de biome (desert, canyon, prairie, foret, neige) à la place des trois bandes de régions ;
//   nodes [{ x, y }] et segs [{ ax, ay, bx, by }] : lieux et pistes donnés tels quels (terr peut alors être null) ;
//   start { x, y } (null : pas de ville) et lair { x, y } : la ville de départ et le repaire ;
//   rivers [{ pts: [{ x, y }…], width, dry }] : rivières imposées (tracés denses, en pixels du jeu).
export function worldMap(terr, seed, xy, opts = {}) {
  const s0 = (seed ^ 0x51a7e) >>> 0, R = rng(s0);
  const reg = opts.regionAt ? [] : terr.regions.map((r) => BIOME[r] ?? DES);
  const nodes = opts.nodes || terr.cols.flat().map((nd) => ({ nd, ...xy(nd) }));
  const segs = opts.segs ? opts.segs.slice() : [];
  if (!opts.segs) for (const col of terr.cols) for (const nd of col) {
    const a = xy(nd);
    for (const j of nd.next) { const b = xy(terr.cols[nd.c + 1][j]); segs.push({ ax: a.x, ay: a.y, bx: b.x, by: b.y }); }
  }
  const colX = (c) => xy({ c, y: 0 }).x;
  const b1 = opts.regionAt ? 0 : colX(3.5), b2 = opts.regionAt ? 0 : colX(6.5);
  const start = opts.start === undefined ? nodes[0] : opts.start, lair = opts.lair || nodes[nodes.length - 1];

  // les champs de bruit : frontières des régions, relief, variations, détails
  const fw = field((u, v) => fbm(u / 60, v / 60, s0 + 1, 3));
  const f1 = field((u, v) => fbm(u / 38, v / 38, s0 + 2, 5));
  const f2 = field((u, v) => fbm(u / 22, v / 22, s0 + 3, 3));
  const f3 = field((u, v) => fbm(u / 12, v / 12, s0 + 4, 3));

  const heightOf = (b, n1, n2, n3, u, v) => {
    switch (b) {
      case DES: { // dunes : pente douce au vent, pente raide (dans l'ombre) sous le vent
        const a = (u * 0.5 + v * 0.32 + n2 * 16) / (Math.PI * 2), fr = a - Math.floor(a);
        return n1 * 10 + (fr < 0.75 ? fr / 0.75 : (1 - fr) / 0.25) * 2.4;
      }
      case CAN: { // mesas en gradins
        const q = n1 * 5.5, k = Math.floor(q);
        return (k + sstep(0.78, 0.95, q - k)) * 6 + n3 * 1.2;
      }
      case PRA: return n1 * 18 + n3 * 2.5;
      case FOR: return n1 * 14 + n3 * 3;
      case NEI: { const r = 1 - Math.abs(2 * n1 - 1); return r * r * r * 46 + n3 * 5 + n2 * 6; }
      default: return (1 - Math.abs(2 * n3 - 1)) * 8 + n1 * 8;
    }
  };

  // ---- 1. régions et relief, pixel fin par pixel fin
  const N = FW * FH, bio = new Uint8Array(N), hs = new Float32Array(N);
  const zones = opts.regionAt ? zoneGrid(opts.regionAt, fw, f2) : null;
  for (let py = 0; py < FH; py++) {
    const v = (py + 0.5) / F;
    for (let px = 0; px < FW; px++) {
      const u = (px + 0.5) / F, i = py * FW + px;
      const wp = samp(fw, u, v), n1 = samp(f1, u, v), n2 = samp(f2, u, v), n3 = samp(f3, u, v);
      const xr = u + (wp - 0.5) * 36 + (n2 - 0.5) * 18, dz = (BAY[((py & 3) << 2) | (px & 3)] - 0.5) * 8;
      let b, h;
      if (zones) { // régions données (mode histoire) : bord tramé, relief mêlé d'une région à l'autre
        b = zones.at(u + dz * 0.4, v);
        h = zones.height(u, v, (k) => heightOf(k, n1, n2, n3, u, v));
      } else {
        b = reg[xr + dz < b1 ? 0 : xr + dz < b2 ? 1 : 2];
        const t1 = sstep(b1 - 10, b1 + 10, xr), t2 = sstep(b2 - 10, b2 + 10, xr);
        if (t1 < 1) { h = heightOf(reg[0], n1, n2, n3, u, v); if (t1 > 0) h += (heightOf(reg[1], n1, n2, n3, u, v) - h) * t1; }
        else { h = heightOf(reg[1], n1, n2, n3, u, v); if (t2 > 0) h += (heightOf(reg[2], n1, n2, n3, u, v) - h) * t2; }
      }
      const dl = Math.hypot(u - lair.x, (v - lair.y) * 1.25) + (wp - 0.5) * 24;
      if (dl + dz * 0.8 < 32) b = LAIR;
      const tl = 1 - sstep(24, 38, dl);
      if (tl > 0) h += (heightOf(LAIR, n1, n2, n3, u, v) - h) * tl;
      bio[i] = b;
      hs[i] = h;
    }
  }
  const bioAt = (u, v) => bio[clampi(Math.floor(v * F), 0, FH - 1) * FW + clampi(Math.floor(u * F), 0, FW - 1)];

  // ---- 2. l'eau, les berges et les pistes, tracées dans un masque (rouge : profondeur, vert : berge, bleu : piste)
  const wet = []; // cercles d'eau (pour garder les objets au sec)
  const segD = (u, v, s) => {
    const dx = s.bx - s.ax, dy = s.by - s.ay, t = clamp(((u - s.ax) * dx + (v - s.ay) * dy) / (dx * dx + dy * dy || 1), 0, 1);
    return Math.hypot(u - s.ax - dx * t, v - s.ay - dy * t);
  };
  const occ = new Uint8Array(W * H);
  const isFree = (u, v) => !occ[clampi(v | 0, 0, H - 1) * W + clampi(u | 0, 0, W - 1)];
  const mark = (u, v, r) => {
    for (let y = Math.floor(v - r); y <= v + r; y++) for (let x = Math.floor(u - r); x <= u + r; x++) {
      if (x >= 0 && y >= 0 && x < W && y < H && (x - u) ** 2 + (y - v) ** 2 <= r * r) occ[y * W + x] = 1;
    }
  };
  const clear = (u, v, r, nodeGap = 8, segGap = 1.6) => {
    for (const n of nodes) if ((n.x - u) ** 2 + (n.y - v) ** 2 < (r + nodeGap) ** 2) return false;
    for (const sg of segs) if (segD(u, v, sg) < r * 0.7 + segGap) return false;
    for (const w of wet) if ((w.x - u) ** 2 + (w.y - v) ** 2 < (r + w.r + 0.8) ** 2) return false;
    return true;
  };
  const spot = (biomes, r, tries = 300) => {
    for (let k = 0; k < tries; k++) {
      const u = r + R() * (W - r * 2), v = TOP + r + R() * (BOT - TOP - r * 2);
      if (!biomes.includes(bioAt(u, v)) || !isFree(u, v) || !clear(u, v, r, 10, 3)) continue;
      return { x: u, y: v };
    }
    return null;
  };

  const mc = S.makeCanvas(FW, FH, true), g = mc.getContext('2d');
  g.fillStyle = '#000';
  g.fillRect(0, 0, FW, FH);
  g.setTransform(F, 0, 0, F, 0, 0);
  g.globalCompositeOperation = 'lighter';
  g.lineCap = 'round';
  g.lineJoin = 'round';
  const stroke = (pts, width, col) => {
    g.strokeStyle = col;
    g.lineWidth = width;
    g.beginPath();
    pts.forEach((p, k) => (k ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
    g.stroke();
  };
  const river = (xc, amp, width, dry = false) => {
    const pts = [], ph = R() * 6, ns = (R() * 1e6) | 0;
    for (let v = -6; v <= H + 6; v += 2) pts.push({ x: xc + Math.sin(v * 0.045 + ph) * amp * 0.6 + (fbm(v * 0.06, 0.5, ns, 2) - 0.5) * amp * 1.6, y: v });
    return riverAlong(pts, width, dry);
  };
  // une rivière le long d'un tracé (berges, profondeur, et l'eau gardée libre d'objets)
  const riverAlong = (pts, width, dry = false) => {
    stroke(pts, width + 2.2, 'rgb(0,255,0)');
    if (!dry) {
      for (const k of [1, 0.66, 0.33]) stroke(pts, width * k, 'rgb(85,0,0)');
      pts.forEach((p) => wet.push({ x: p.x, y: p.y, r: width / 2 + 1 }));
    } else pts.forEach((p) => wet.push({ x: p.x, y: p.y, r: width / 2 }));
    return pts;
  };
  // la rivière entre deux colonnes du deuxième acte, un ruisseau dans le troisième, un lit à sec dans le désert
  let riverPts, creekPts;
  if (opts.rivers) {
    const rs = opts.rivers.map((r) => riverAlong(r.pts, r.width ?? 2.8, !!r.dry));
    riverPts = rs.flat();
    creekPts = [];
  } else {
    riverPts = river(colX(R() < 0.5 ? 4.5 : 5.5), 5, 2.8);
    creekPts = river(colX(R() < 0.5 ? 7.5 : 8.5), 4, 1.5);
    if (reg[0] === DES) river(colX(R() < 0.5 ? 1.5 : 2.5), 7, 2.2, true);
  }
  // des lacs là où il y a de la place (une oasis dans le désert, un lac gelé dans la sierra)
  const lake = (p, r) => {
    const blobs = [{ x: p.x, y: p.y, r }];
    for (let k = 0; k < 3; k++) blobs.push({ x: p.x + (R() - 0.5) * r * 1.4, y: p.y + (R() - 0.5) * r * 0.8, r: r * (0.5 + R() * 0.3) });
    const fill = (k, col) => { g.fillStyle = col; g.beginPath(); for (const b of blobs) { g.moveTo(b.x + b.r * k, b.y); g.ellipse(b.x, b.y, b.r * k, b.r * k * 0.7, 0, 0, Math.PI * 2); } g.fill(); };
    fill(1, 'rgb(0,255,0)');
    g.fillStyle = 'rgb(0,0,0)';
    for (const k of [0.82, 0.55, 0.28]) fill(k, 'rgb(85,0,0)');
    blobs.forEach((b) => { wet.push({ x: b.x, y: b.y, r: b.r * 0.85 }); mark(b.x, b.y, b.r); });
  };
  const lakes = [];
  for (const [biomes, r] of [[[PRA, FOR, NEI], 6 + R() * 3], [[PRA, FOR, NEI, CAN], 5 + R() * 3], [[DES], 3.5]]) {
    const p = spot(biomes, r + 3);
    if (p) { lake(p, r); lakes.push({ ...p, r, b: bioAt(p.x, p.y) }); }
  }
  // les lieux spéciaux, décidés avant le terrain (leurs clairières sont dans le masque)
  const special = {};
  const claim = (key, biomes, r) => { const p = spot(biomes, r); if (p) { special[key] = p; mark(p.x, p.y, r); } return p; };
  claim('farm', [PRA], 11);
  claim('camp', [PRA, CAN, DES], 7);
  claim('cabin', [NEI, FOR], 5);
  claim('wreck', [DES, CAN], 4);
  for (let k = 0; k < 3; k++) claim(`herd${k}`, [PRA], 5);
  // pistes : bande pleine au centre, bords à moitié (tramés en terrain) ; clairières des lieux et de la ville
  g.lineCap = 'round';
  for (const sg of segs) { stroke([{ x: sg.ax, y: sg.ay }, { x: sg.bx, y: sg.by }], 3.2, 'rgb(0,0,128)'); stroke([{ x: sg.ax, y: sg.ay }, { x: sg.bx, y: sg.by }], 2, 'rgb(0,0,127)'); }
  const blob = (x, y, rx, ry, col) => { g.fillStyle = col; g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); g.fill(); };
  for (const n of nodes) blob(n.x, n.y + 1, 6, 4.5, 'rgb(0,0,110)');
  if (start) {
    blob(start.x - 2, start.y, 18, 6, 'rgb(0,0,255)');
    g.fillStyle = 'rgb(0,0,255)';
    g.fillRect(-2, start.y - 2.5, start.x, 5);
  }
  if (special.camp) blob(special.camp.x, special.camp.y, 7, 5, 'rgb(0,0,140)');
  if (special.cabin) blob(special.cabin.x, special.cabin.y + 1, 5, 3, 'rgb(0,0,140)');
  for (const n of nodes) mark(n.x, n.y, 7);
  mark(14, BOT - 15, 12); // la rose des vents
  const mk = g.getImageData(0, 0, FW, FH).data;
  S.freeCanvas(mc);

  // ---- 3. les couleurs du terrain
  const bg = S.makeCanvas(FW, FH, true), bgx = bg.getContext('2d');
  const img = bgx.createImageData(FW, FH), out = new Uint32Array(img.data.buffer);
  for (let py = 0; py < FH; py++) {
    const v = (py + 0.5) / F;
    for (let px = 0; px < FW; px++) {
      const i = py * FW + px, u = (px + 0.5) / F, b = bio[i];
      const iA = i - (py >= 2 ? 2 * FW : 0) - (px >= 2 ? 2 : 0), iB = i + (py < FH - 2 ? 2 * FW : 0) + (px < FW - 2 ? 2 : 0);
      const sl = hs[iB] - hs[iA], dz = BAY[((py & 3) << 2) | (px & 3)] - 0.5, gr = hsh(px, py, 91) - 0.5;
      const n1 = samp(f1, u, v), n2 = samp(f2, u, v), n3 = samp(f3, u, v);
      const m = i * 4, wr = mk[m], bk = mk[m + 1], tr = mk[m + 2];
      let c;
      if (wr) {
        const d = wr > 200 ? 0 : wr > 120 ? 1 : 2;
        if (b === NEI) c = P(ICE, [1.6, 2.4, 3.3][d] + gr * 0.8 + (Math.abs(n3 - 0.5) < 0.012 ? -1.6 : 0) + dz);
        else {
          let l = [1.3, 2.3, 3.5][d] + gr * 0.5;
          const wave = Math.sin(u * 1.7 + v * 0.6 + n2 * 22);
          if (wave > 0.88) l += 1.7; else if (wave < -0.9) l -= 0.6;
          if (d === 2 && hsh(px >> 1, py >> 1, 17) < 0.08) l += 2;
          c = P(WATER, l + dz);
        }
      } else {
        switch (b) {
          case DES:
            if (n2 > 0.78) c = P(SALT, 2 + sl * 1.1 + (n2 - 0.78) * 8 + gr * 0.8 + dz);
            else c = P(SAND, 4.2 + (n2 - 0.5) * 2.2 + sl * 1.5 + gr * 0.7 - (hsh(px >> 1, py >> 1, 5) < 0.012 ? 2.2 : 0) + dz);
            break;
          case CAN: {
            const k = Math.floor(n1 * 5.5);
            let l = 2.4 + k * 0.8 + sl * 0.2 + gr * 0.6;
            if (sl < -1.6 || sl > 1.6) l = 3.4 + (sl > 0 ? 1.3 : -1.6) + ((hs[i] * 1.6) & 1 ? 0.6 : -0.3) + gr * 0.4;
            c = P(ROCKR, l + dz);
            break;
          }
          case PRA: {
            const l = 4.2 + (n2 - 0.5) * 3 + sl * 0.9 + gr * 0.9;
            c = n3 > 0.66 ? P(DRY, l - 0.8 + dz) : P(GRASS, l + dz);
            const fl = hsh(px >> 1, py >> 1, 13);
            if (fl < 0.003 + (n2 > 0.62 ? 0.014 : 0)) c = FLOWERS[(fl * 997) & 3];
            break;
          }
          case FOR: c = P(FORR, 2.7 + (n2 - 0.5) * 2.5 + sl * 0.8 + gr * 1.1 + dz); break;
          case NEI:
            if (Math.abs(sl) > 3.4 + n3 * 2) c = P(SROCK, 2 + sl * 0.18 + gr * 0.8 + dz);
            else c = P(SNOW, 4.3 + sl * 0.7 + (n2 - 0.5) * 1.5 + gr * 0.5 + dz);
            break;
          default: {
            const cr = Math.abs(n3 - 0.5);
            if (cr < 0.014 && n1 > 0.25) c = P(LAVA, 1.5 + (0.014 - cr) * 200 + dz);
            else c = P(ASH, 2.5 + sl * 0.5 + gr * 1 + (n2 - 0.5) * 2 + dz);
          }
        }
        if (bk && bk > (dz + 0.5) * 255) {
          if (b === DES || b === CAN) c = P(SAND, 5.4 + gr * 1.2 - (hsh(px, py, 23) < 0.03 ? 2 : 0) + dz);
          else if (b === NEI) c = P(SNOW, 3 + gr + dz);
          else if (b === LAIR) c = P(ASH, 1 + gr + dz);
          else c = hsh(px >> 1, py, 29) < 0.12 ? GRASS[5] : P(MUD, 2.4 + sl * 0.5 + gr + dz);
        }
        if (tr && tr > (dz * 0.85 + 0.5) * 255) {
          if (b === NEI) c = P(SNOW, 2.8 + gr + dz);
          else if (b === LAIR) c = P(ASH, 3.8 + gr + dz);
          else c = P(DIRT, 3 + sl * 0.6 + gr * 1.2 + (n2 - 0.5) + dz);
        }
      }
      out[i] = c;
    }
  }

  // ---- 4. la ferme : champs en sillons ; les ponts là où une piste passe l'eau
  if (special.farm) {
    const f = special.farm, x0 = Math.round((f.x - 9) * F), y0 = Math.round((f.y - 3) * F), wheat = R() < 0.5;
    const A = hex(wheat ? 'c8a040' : '5e8a2a'), Bc = hex(wheat ? 'e0c060' : '82a838'), soil = hex('8a6238');
    for (let y = 0; y < 34; y++) for (let x = 0; x < 64; x++) {
      const X = x0 + x, Y = y0 + y;
      if (X < 0 || Y < 0 || X >= FW || Y >= FH) continue;
      out[Y * FW + X] = x === 0 || y === 0 || x === 63 || y === 33 ? (x + y) % 3 ? WOOD[2] : WOOD[0] : y % 3 === 2 ? soil : hsh(X, Y, 3) < 0.5 ? A : Bc;
    }
  }
  const bridge = (sg) => {
    const len = Math.hypot(sg.bx - sg.ax, sg.by - sg.ay), dx = (sg.bx - sg.ax) / len, dy = (sg.by - sg.ay) / len;
    let t0 = -1;
    for (let t = 0; t <= len + 0.25; t += 0.25) {
      const X = Math.floor((sg.ax + dx * t) * F), Y = Math.floor((sg.ay + dy * t) * F);
      const w = X >= 0 && Y >= 0 && X < FW && Y < FH && mk[(Y * FW + X) * 4] > 0;
      if (w && t0 < 0) t0 = t;
      if (!w && t0 >= 0) { planks(sg.ax, sg.ay, dx, dy, t0 - 1.2, t + 1); t0 = -1; }
    }
  };
  const planks = (ax, ay, dx, dy, ta, tb) => {
    const xs = [ax + dx * ta, ax + dx * tb], ys = [ay + dy * ta, ay + dy * tb];
    const X0 = Math.floor((Math.min(...xs) - 2) * F), X1 = Math.ceil((Math.max(...xs) + 2) * F);
    const Y0 = Math.floor((Math.min(...ys) - 2) * F), Y1 = Math.ceil((Math.max(...ys) + 2) * F);
    for (let Y = Math.max(0, Y0); Y < Math.min(FH, Y1); Y++) for (let X = Math.max(0, X0); X < Math.min(FW, X1); X++) {
      const u = (X + 0.5) / F - ax, v = (Y + 0.5) / F - ay, a = u * dx + v * dy, bb = -u * dy + v * dx;
      if (a < ta || a > tb || Math.abs(bb) > 1.6) continue;
      const i = Y * FW + X;
      if (Math.abs(bb) > 1.15) out[i] = WOOD[(a - ta < 0.5 || tb - a < 0.5) ? 0 : 1];
      else out[i] = Math.floor(a * F / 2) % 2 ? WOOD[3] : WOOD[2];
      if (bb > 1.15) out[i] = WOOD[0];
    }
  };
  for (const sg of segs) bridge(sg);

  // ---- 5. les objets : lieux spéciaux, puis semis au hasard selon la région
  const objs = [];
  const put = (spr, u, v, flip = false, sh = 1) => objs.push({ spr, x: Math.round(u * F), y: Math.round(v * F), flip, sh });
  const VAR = {};
  const variants = (kind) => VAR[kind] || (VAR[kind] = Array.from({ length: 8 }, () => MAKE[kind](R)));
  const MAKE = {
    saguaro, pear,
    rockd: (r) => rock(r, ROCKD, 3 + r() * 3), rockc: (r) => rock(r, ROCKR.slice(1, 7), 3 + r() * 4),
    rocks: (r) => rock(r, SROCK, 3 + r() * 4, true), rocko: (r) => rock(r, OBS, 3 + r() * 3),
    sage: (r) => bush(r, SAGE), bush: (r) => bush(r, LEAF), bushf: (r) => bush(r, DLEAF),
    dead: (r) => deadTree(r, hex('8a7a64'), hex('5a4a3a')), deadc: (r) => deadTree(r, hex('2a1a14'), hex('120a08'), hex('000000')),
    hoodoo, tree: (r) => tree(r, LEAF), treef: (r) => tree(r, r() < 0.12 ? AUTUMN : DLEAF),
    pinef: (r) => pine(r, PINE, false), pines: (r) => pine(r, PINE, true),
    skull, bones, weed,
  };
  const KINDS = {
    [DES]: [['saguaro', 0.3, 1.6], ['pear', 0.14, 1.5], ['rockd', 0.2, 1.6], ['sage', 0.2, 1.2], ['skull', 0.04, 0.8], ['dead', 0.05, 1.8], ['weed', 0.07, 0.9]],
    [CAN]: [['hoodoo', 0.17, 2], ['rockc', 0.33, 1.8], ['sage', 0.3, 1.2], ['dead', 0.08, 1.8], ['saguaro', 0.08, 1.6], ['skull', 0.04, 0.8]],
    [PRA]: [['tree', 0.3, 2.4], ['bush', 0.5, 1.3], ['rockd', 0.12, 1.5], ['dead', 0.08, 1.8]],
    [FOR]: [['pinef', 0.55, 1.9], ['treef', 0.37, 2.2], ['bushf', 0.08, 1.2]],
    [NEI]: [['pines', 0.8, 1.9], ['rocks', 0.12, 1.8], ['dead', 0.08, 1.8]],
    [LAIR]: [['deadc', 0.3, 1.8], ['rocko', 0.35, 1.6], ['skull', 0.15, 0.8], ['bones', 0.2, 0.8]],
  };

  // la ville de départ, de part et d'autre de la grand-rue
  if (start) {
    const town = ['saloon', 'store', 'bank', 'house', 'church', 'house'];
    const slots = [[start.x - 11, start.y - 8], [start.x + 1, start.y - 9], [start.x + 12, start.y - 9], [start.x - 11, start.y + 19], [start.x + 1, start.y + 20], [start.x + 12, start.y + 20]];
    slots.forEach(([x, y], k) => {
      if (!segs.every((sg) => segD(x, y - 1, sg) > 4.5 && segD(x, y - 5, sg) > 4.5)) return;
      put(building(R, town[k]), x, y);
      mark(x, y - 3, 5);
    });
    const tw = [start.x + 6, start.y - 18];
    if (segs.every((sg) => segD(tw[0], tw[1], sg) > 4)) { put(waterTower(), tw[0], tw[1]); mark(tw[0], tw[1], 3); }
  }
  put(lairSprite(), lair.x, lair.y - 1);
  mark(lair.x, lair.y - 10, 16);
  if (special.farm) {
    const f = special.farm;
    put(building(R, 'barn'), f.x + 12, f.y + 2);
    put(windmill(), f.x - 12, f.y + 1);
  }
  if (special.camp) {
    const c = special.camp;
    put(campfire(), c.x, c.y);
    for (let k = 0; k < 4; k++) { const a = (k / 4) * Math.PI * 2 + 0.4; put(tipi(R), c.x + Math.cos(a) * 5.5, c.y + Math.sin(a) * 3.5); }
  }
  if (special.cabin) { const c = special.cabin; put(building(R, 'cabin'), c.x, c.y + 2); put(variants('rocks')[0], c.x + 6, c.y + 3); }
  if (special.wreck) { const c = special.wreck; put(wagon(), c.x, c.y, R() < 0.5); put(skull(), c.x - 6, c.y + 2); put(bones(R), c.x + 5, c.y + 3); }
  for (let k = 0; k < 3; k++) {
    const c = special[`herd${k}`];
    if (!c) continue;
    const n = 4 + ((R() * 5) | 0), b = bison();
    for (let j = 0; j < n; j++) put(b, c.x + (R() - 0.5) * 9, c.y + (R() - 0.5) * 5, R() < 0.5, 0.6);
  }
  for (const l of lakes) { // roseaux et buissons au bord des lacs
    const kind = l.b === NEI ? 'rocks' : l.b === DES ? 'pear' : 'bush';
    for (let k = 0; k < 5; k++) { const a = R() * Math.PI * 2; put(variants(kind)[k], l.x + Math.cos(a) * (l.r + 2), l.y + Math.sin(a) * (l.r * 0.7 + 2)); }
  }

  // le semis : des milliers de candidats, gardés selon la densité de la région
  for (let k = 0; k < 16000; k++) {
    const u = R() * W, v = TOP - 2 + R() * (BOT - TOP + 12);
    const b = bioAt(u, v), n2 = samp(f2, u, v), n3 = samp(f3, u, v);
    const dens = b === FOR ? (n2 > 0.3 ? 0.95 : 0.12) : b === NEI ? (n2 > 0.42 ? 0.5 : 0.05) : b === PRA ? (n3 > 0.58 ? 0.45 : 0.05)
      : b === CAN ? 0.07 : b === LAIR ? 0.3 : 0.055;
    if (R() > dens || !isFree(u, v)) continue;
    let list = KINDS[b];
    if (b === PRA && n3 > 0.58) list = [['tree', 0.85, 2.4], ['bush', 0.15, 1.3]];
    if (b === NEI && hs[Math.floor(v * F) * FW + Math.floor(u * F)] > 24) { if (R() < 0.85) continue; list = [['rocks', 1, 1.8]]; }
    let x = R(), pick = list[0];
    for (const it of list) { if ((x -= it[1]) <= 0) { pick = it; break; } }
    const r = pick[2];
    if (!clear(u, v, r)) continue;
    const vs = variants(pick[0]);
    put(vs[(R() * vs.length) | 0], u, v, false, r < 1 ? 0.5 : 1);
    mark(u, v, r * (b === FOR || b === NEI ? 0.75 : 1.1));
  }

  // ombres portées (vers le bas à droite), puis les objets du fond vers l'avant
  const shade = new Uint8Array(N);
  for (const o of objs) {
    const s = o.spr, rx = s.w * 0.42 * o.sh + 1, ry = Math.max(2, s.w * 0.15 * o.sh), cx = o.x + s.w * 0.16, cy = o.y - 1;
    for (let Y = Math.floor(cy - ry); Y <= cy + ry; Y++) for (let X = Math.floor(cx - rx); X <= cx + rx; X++) {
      if (X < 0 || Y < 0 || X >= FW || Y >= FH || ((X - cx) / rx) ** 2 + ((Y - cy) / ry) ** 2 > 1) continue;
      shade[Y * FW + X] = 1;
    }
  }
  for (let i = 0; i < N; i++) if (shade[i]) out[i] = scale(out[i], 0.66);
  objs.sort((a, b) => a.y - b.y);
  const emit = [];
  for (const o of objs) {
    const s = o.spr, x0 = o.x - (o.flip ? s.w - 1 - s.ox : s.ox), y0 = o.y - s.oy;
    for (let j = 0; j < s.h; j++) {
      const Y = y0 + j;
      if (Y < 0 || Y >= FH) continue;
      for (let i = 0; i < s.w; i++) {
        const c = s.px[j * s.w + (o.flip ? s.w - 1 - i : i)];
        const X = x0 + i;
        if (c && X >= 0 && X < FW) out[Y * FW + X] = c;
      }
    }
    for (const e of s.emit) if (o.spr !== VAR.rocks?.[0] && (e.kind !== 'smoke' || R() < 0.7)) emit.push({ x: (x0 + e.x) / F, y: (y0 + e.y) / F, kind: e.kind, ph: R() });
  }

  // ---- 6. la rose des vents, la lueur rouge du repaire, le bord assombri
  compass(out, Math.round(14 * F), Math.round((BOT - 13) * F), 34);

  for (let py = 0; py < FH; py++) {
    const v = (py + 0.5) / F, ey = Math.min(v - TOP, BOT - v) / 26;
    for (let px = 0; px < FW; px++) {
      const u = (px + 0.5) / F, i = py * FW + px;
      const e = Math.min(Math.min(u, W - u) / 34, ey);
      if (e < 1) out[i] = scale(out[i], 0.72 + 0.28 * sstep(0, 1, e) + (BAY[((py & 3) << 2) | (px & 3)] - 0.5) * 0.04);
      const dl = Math.hypot(u - lair.x, v - lair.y);
      if (dl < 70) out[i] = blend(out[i], hex('6a0c04'), 0.3 * (1 - dl / 70) ** 2);
    }
  }
  bgx.putImageData(img, 0, 0);

  // reflets sur l'eau (pas sur la glace) et ombres de nuages, pour l'animation
  const sparkle = [];
  for (const p of [...riverPts, ...creekPts, ...lakes]) {
    if (p.y < TOP || p.y > BOT || bioAt(p.x, p.y) === NEI || R() < 0.4) continue;
    sparkle.push({ x: Math.round((p.x + (R() - 0.5) * 1.6) * F) / F, y: Math.round((p.y + (R() - 0.5) * 1.6) * F) / F, ph: R() });
  }
  const clouds = [0, 1, 2].map((k) => ({ c: cloudShadow(s0 + k * 31), off: R() * (W + 120), y: TOP + 10 + k * 55 + R() * 20, sp: 0.0018 + R() * 0.0012 }));
  return { bg, emit, sparkle, clouds, seed: s0, fog: null };
}

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const clampi = (v, a, b) => (v < a ? a : v > b ? b : v);

// Régions données par une fonction (worldMap, opts.regionAt) : le biome de chaque point de la grille demi-pixel des
// champs, aux bords déformés par le bruit ; le relief se mêle d'une région à l'autre sur une dizaine de pixels
// (poids lissés de chaque biome), comme entre les bandes de La piste.
function zoneGrid(regionAt, fw, f2) {
  const gw = W * 2 + 3, gh = H * 2 + 3, n = gw * gh, ids = new Uint8Array(n);
  for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
    const u = Math.min(W, i / 2), v = Math.min(H, j / 2);
    const wu = u + (samp(fw, u, v) - 0.5) * 22 + (samp(f2, u, v) - 0.5) * 10;
    const wv = v + (samp(fw, W - u, H - v) - 0.5) * 16;
    ids[j * gw + i] = BIOME[regionAt(wu, wv)] ?? DES;
  }
  // moyenne glissante (±r cellules), deux fois en x puis en y : un flou doux
  const blur = (a, r) => {
    const tmp = new Float32Array(n);
    for (let pass = 0; pass < 2; pass++) {
      for (let j = 0; j < gh; j++) {
        let s = 0;
        for (let i = -r; i <= r; i++) s += a[j * gw + clampi(i, 0, gw - 1)];
        for (let i = 0; i < gw; i++) {
          tmp[j * gw + i] = s / (2 * r + 1);
          s += a[j * gw + clampi(i + r + 1, 0, gw - 1)] - a[j * gw + clampi(i - r, 0, gw - 1)];
        }
      }
      for (let i = 0; i < gw; i++) {
        let s = 0;
        for (let j = -r; j <= r; j++) s += tmp[clampi(j, 0, gh - 1) * gw + i];
        for (let j = 0; j < gh; j++) {
          a[j * gw + i] = s / (2 * r + 1);
          s += tmp[clampi(j + r + 1, 0, gh - 1) * gw + i] - tmp[clampi(j - r, 0, gh - 1) * gw + i];
        }
      }
    }
  };
  const wts = [...new Set(ids)].map((k) => {
    const a = new Float32Array(n);
    for (let m = 0; m < n; m++) a[m] = ids[m] === k ? 1 : 0;
    blur(a, 10);
    a.gw = gw;
    return [k, a];
  });
  return {
    at: (u, v) => ids[clampi(Math.round(v * 2), 0, gh - 1) * gw + clampi(Math.round(u * 2), 0, gw - 1)],
    height(u, v, hOf) {
      const x = clamp(u, 0, W), y = clamp(v, 0, H);
      let h = 0, t = 0;
      for (const [k, a] of wts) {
        const w = samp(a, x, y);
        if (w > 0.002) { h += w * hOf(k); t += w; }
      }
      return t ? h / t : 0;
    },
  };
}

// rose des vents à 8 branches, dessinée dans le tampon (centre et rayon en pixels fins)
function compass(out, cx, cy, Rr) {
  const dark = hex('2a1a10'), light = hex('f2e6c4'), mid = hex('c8b088'), gold = hex('d8a840'), goldD = hex('8a6420'), red = hex('c0392b'), redD = hex('7a1a14');
  for (let y = -Rr - 2; y <= Rr + 2; y++) for (let x = -Rr - 2; x <= Rr + 2; x++) {
    const X = cx + x, Y = cy + y;
    if (X < 0 || Y < 0 || X >= FW || Y >= FH) continue;
    const r = Math.hypot(x + 0.5, y + 0.5), th = Math.atan2(y + 0.5, x + 0.5);
    const k = Math.round(th / (Math.PI / 4)), dt = th - k * (Math.PI / 4), f = Math.abs(dt) / (Math.PI / 8);
    const main = ((k % 2) + 2) % 2 === 0, tip = main ? Rr : Rr * 0.58;
    const edge = tip * (1 - f) + Rr * 0.16 * f;
    const i = Y * FW + X;
    if (r <= edge) {
      const north = k === -2;
      let c = main ? (dt > 0 ? light : mid) : dt > 0 ? gold : goldD;
      if (north) c = dt > 0 ? red : redD;
      out[i] = r > edge - 1.2 ? dark : c;
    } else if (Math.abs(r - Rr * 0.66) < 0.8) out[i] = dark;
  }
  const N = ['k...k', 'kk..k', 'k.k.k', 'k..kk', 'k...k'];
  N.forEach((row, y) => [...row].forEach((ch, x) => {
    if (ch !== 'k') return;
    for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) out[(cy - Rr - 13 + y * 2 + j) * FW + cx - 5 + x * 2 + i] = dark;
  }));
}

// ombre d'un nuage : une tache tramée, très transparente
function cloudShadow(seed) {
  const w = 170, h = 76, c = S.makeCanvas(w, h), g = c.getContext('2d'), img = g.createImageData(w, h), o = new Uint32Array(img.data.buffer);
  const col = pack(18, 14, 40, 44);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = (x - w / 2) / (w / 2), dy = (y - h / 2) / (h / 2);
    if (1 - dx * dx - dy * dy + (fbm(x * 0.035, y * 0.06, seed, 3) - 0.5) * 1.4 > 0.3 + bay(x, y) * 0.25) o[y * w + x] = col;
  }
  g.putImageData(img, 0, 0);
  return c;
}

// Les mêmes nuées sur des terres inconnues de forme quelconque (carte du mode histoire) : edgeOf(u, v) donne, en pixels
// du jeu, la profondeur du point dans le brouillard (positive dedans, négative dehors).
export const mistCanvas = (seed, edgeOf) => fogCanvas(seed, 0, edgeOf);

// le brouillard des terres inconnues, au-delà de fx (pixels du jeu) : des nuées claires, bord effiloché
function fogCanvas(seed, fx, edgeOf = null) {
  const w = W * 2, h = H * 2, c = S.makeCanvas(w, h), g = c.getContext('2d'), img = g.createImageData(w, h), o = new Uint32Array(img.data.buffer);
  const C = ramp('9894a0 aeaab2 c4c0c2 d8d3cf e8e3db');
  const n = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) n[y * w + x] = fbm(x * 0.016 + 3, y * 0.024, seed + 11, 5);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const u = (x + 0.5) / 2, i = y * w + x;
    const e = (edgeOf ? edgeOf(u, (y + 0.5) / 2) : u - fx) + (n[i] - 0.5) * 70 + Math.sin(y * 0.05 + seed) * 6;
    if (e < -6) continue;
    const dens = Math.min(1, (e + 6) / 20) * (0.55 + n[i] * 0.75);
    if (dens < bay(x, y) * 0.55 + 0.15) continue;
    const sl = n[i] - n[Math.max(0, i - 3 * w - 3)];
    const col = pickc(C, 1.6 + sl * 60 + (n[i] - 0.35) * 5, x, y);
    const a = dens > 0.8 + (bay(x + 1, y) - 0.5) * 0.2 ? 228 : dens > 0.5 + (bay(x, y + 2) - 0.5) * 0.2 ? 190 : 140;
    o[i] = (col & 0xffffff) | (a << 24);
  }
  g.putImageData(img, 0, 0);
  return c;
}

// brouillard au-delà de fx (rien si fx est hors de la carte) ; gardé en cache tant que fx ne change pas
export function drawFog(ctx, m, fx) {
  if (fx >= W) return;
  if (!m.fog || m.fog.fx !== fx) {
    if (m.fog) S.freeCanvas(m.fog.c);
    m.fog = { fx, c: fogCanvas(m.seed, fx) };
  }
  ctx.drawImage(m.fog.c, 0, 0, W, H);
}

// ce qui bouge sur la carte : ombres des nuages, reflets, fumées, feux, yeux du repaire
export function drawMapFx(ctx, m, now) {
  for (const cl of m.clouds) {
    const span = W + cl.c.width / 2 + 20;
    const x = ((now * cl.sp + cl.off) % span) - cl.c.width / 2;
    ctx.drawImage(cl.c, x, cl.y + Math.sin(now / 9000 + cl.off) * 4, cl.c.width / 2, cl.c.height / 2);
  }
  ctx.fillStyle = '#eef9ff';
  for (const p of m.sparkle) {
    const ph = (now / 1300 + p.ph) % 1;
    if (ph < 0.1) ctx.fillRect(p.x - (ph < 0.05 ? 0.25 : 0), p.y, ph < 0.05 ? 0.75 : 0.5, 0.25);
  }
  const q = (v) => Math.round(v * F) / F;
  for (const e of m.emit) {
    if (e.kind === 'smoke') {
      for (let k = 0; k < 5; k++) {
        const ph = (now / 2600 + e.ph + k / 5) % 1, sz = q(0.5 + ph * 1.5);
        ctx.globalAlpha = (1 - ph) * 0.5;
        ctx.fillStyle = ph < 0.3 ? '#9a948c' : '#d8d2c8';
        ctx.fillRect(q(e.x + Math.sin(ph * 5 + k) * 0.6 + ph * 3 - sz / 2), q(e.y - ph * 9 - sz / 2), sz, sz);
      }
      ctx.globalAlpha = 1;
    } else if (e.kind === 'fire') {
      const f = (Math.sin(now / 70 + e.ph * 9) + Math.sin(now / 43 + e.ph * 5)) * 0.25 + 0.5;
      ctx.fillStyle = 'rgba(255,150,50,0.18)';
      ctx.fillRect(q(e.x - 2), q(e.y - 2.5), 4, 3.5);
      ctx.fillStyle = '#e0561a';
      ctx.fillRect(q(e.x - 0.75), q(e.y - 1 - f * 0.75), 1.5, q(1 + f * 0.75));
      ctx.fillStyle = '#fcc860';
      ctx.fillRect(q(e.x - 0.25), q(e.y - 0.5 - f * 0.5), 0.5, q(0.5 + f * 0.5));
    } else if (e.kind === 'eye') {
      ctx.fillStyle = `rgba(255,120,30,${0.25 + 0.2 * Math.sin(now / 500 + e.ph)})`;
      ctx.fillRect(q(e.x - 2.5), q(e.y - 1.5), 5, 3);
    }
  }
}
