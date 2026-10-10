// Vignettes des événements de « La piste » : une petite scène peinte en pixel art pour chaque rencontre (pistekit.js,
// EVENTS), dessinée au code puis gardée en cache. 192 × 100 pixels du jeu ; les scènes sont composées en pixels fins
// (Q = 2, comme les personnages) et peintes K fois plus fin encore (768 × 400), au niveau de la carte du territoire :
// ciels à nuages, sols texturés, reliefs modelés, sprites affinés (contour d'un pixel, volume), étalonnage final.
import * as S from './sprites.js';
import { outline } from './miniscene.js';
import { lookOf, charSprite, weaponSprite, Q } from './brawlart.js';

export const VIG_W = 192, VIG_H = 100; // en pixels du jeu
const CW = VIG_W * Q, CH = VIG_H * Q; // en pixels fins (repères des scènes)
const K = 2; // pixels de l'image par pixel fin
const IW = CW * K, IH = CH * K; // l'image : 768 × 400
const OUT = S.OUT;

// ------------------------------------------------------------ palettes
const SKY = {
  day: ['#8fb8d0', '#a6c6d2', '#bed2cc', '#d4d8bc', '#e8d8a8'],
  hot: ['#d4ae7e', '#dcb98a', '#e3c697', '#ebd2a5', '#f0dcb0'],
  dusk: ['#3e2442', '#6a3248', '#a0443e', '#d06a3a', '#eea04a'],
  night: ['#0c0c20', '#121632', '#1a1e40', '#22284c', '#2c3258'],
  storm: ['#6a4a34', '#8a603e', '#a87848', '#c08c52'],
};
const GROUND = {
  sand: ['#e0b070', '#d6a462', '#cc9858', '#c08a4c'],
  red: ['#cc7046', '#c2643e', '#b8583a', '#a84e34'],
  grass: ['#b8b060', '#a8a454', '#98984a', '#888a40'],
  night: ['#3a3040', '#322838', '#2a2230', '#221a28'],
  stone: ['#a8907a', '#9a826c', '#8a745e', '#7a6652'],
};

// ------------------------------------------------------------ couleurs, bruit, tramage (rendu en pixels de l'image)
const pk = (r, g, b) => (0xff000000 | ((b < 0 ? 0 : b > 255 ? 255 : b) << 16) | ((g < 0 ? 0 : g > 255 ? 255 : g) << 8) | (r < 0 ? 0 : r > 255 ? 255 : r)) >>> 0;
const P = (hex) => { const n = parseInt(hex.slice(1), 16); return pk(n >> 16, (n >> 8) & 255, n & 255); };
const shadeP = (p, k) => {
  const r = p & 255, g = (p >>> 8) & 255, b = (p >>> 16) & 255;
  return k < 0 ? pk((r * (1 + k)) | 0, (g * (1 + k)) | 0, (b * (1 + k)) | 0) : pk((r + (255 - r) * k) | 0, (g + (255 - g) * k) | 0, (b + (255 - b) * k) | 0);
};
const mixP = (p, q, t) => {
  const c = (s) => { const a = (p >>> s) & 255; return (a + (((q >>> s) & 255) - a) * t) | 0; };
  return pk(c(0), c(8), c(16));
};
const lumP = (p) => (p & 255) * 0.3 + ((p >>> 8) & 255) * 0.59 + ((p >>> 16) & 255) * 0.11;
// palette ordonnée : de la teinte k = -2 (sombre) à +2 (claire) autour d'une couleur
const rampOf = (hex, n = 7, lo = -0.42, hi = 0.3) => Array.from({ length: n }, (_, i) => shadeP(P(hex), lo + ((hi - lo) * i) / (n - 1)));
// dégradé à travers une liste de couleurs, quatre teintes intermédiaires par écart
const gradOf = (cols, per = 4) => {
  const out = [];
  for (let i = 0; i < cols.length - 1; i++) for (let s = 0; s < per; s++) out.push(mixP(P(cols[i]), P(cols[i + 1]), s / per));
  out.push(P(cols[cols.length - 1]));
  return out;
};
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
const sstep = (a, b, x) => { const t = x <= a ? 0 : x >= b ? 1 : (x - a) / (b - a); return t * t * (3 - 2 * t); };
// teinte d'une palette à un niveau fractionnaire, tramée entre les deux voisines
const tone = (pal, l, X, Y) => { const k = Math.round(l + bay(X, Y) - 0.5); return pal[k < 0 ? 0 : k >= pal.length ? pal.length - 1 : k]; };
const OUTP = P(OUT);
const isOutP = (p) => (p & 0xffffff) === (OUTP & 0xffffff);

// Un sprite des scènes (dessiné en pixels fins, cerné) passé en pixels de l'image : contour affiné à un pixel,
// relief (lumière en haut à gauche, ombre en bas à droite) et léger grain. Gardé en cache par canevas source.
const hdCache = new WeakMap();
function hd(c) {
  if (c.hd) return c;
  const hit = hdCache.get(c);
  if (hit) return hit;
  const w = c.width * K, h = c.height * K, o = S.makeCanvas(w, h, true), og = o.getContext('2d');
  og.imageSmoothingEnabled = false;
  og.drawImage(c, 0, 0, w, h);
  const img = og.getImageData(0, 0, w, h), d = new Uint32Array(img.data.buffer), src = d.slice();
  const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : src[y * w + x]);
  const hole = (x, y) => { const q = at(x, y); return !(q >>> 24) || isOutP(q); };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, p = src[i];
    if (!(p >>> 24)) continue;
    if (isOutP(p)) {
      // la moitié extérieure de l'ancien contour (deux pixels d'épaisseur) devient transparente
      if ((!(at(x - 1, y) >>> 24) && isOutP(at(x + 1, y))) || (!(at(x + 1, y) >>> 24) && isOutP(at(x - 1, y)))
        || (!(at(x, y - 1) >>> 24) && isOutP(at(x, y + 1))) || (!(at(x, y + 1) >>> 24) && isOutP(at(x, y - 1)))) d[i] = 0;
      continue;
    }
    let k = (bay(x, y) - 0.5) * 0.07 + (hsh(x, y, 5) - 0.5) * 0.04;
    if (hole(x - 2, y - 2) || hole(x - 1, y - 2) || hole(x - 2, y - 1)) k += 0.15;
    else if (hole(x + 2, y + 2) || hole(x + 1, y + 2) || hole(x + 2, y + 1)) k -= 0.2;
    d[i] = shadeP(p, k);
  }
  og.putImageData(img, 0, 0);
  o.ox = c.ox; o.oy = c.oy; o.hd = true;
  hdCache.set(c, o);
  return o;
}
const dims = (c) => (c.hd ? [c.width / K, c.height / K] : [c.width, c.height]);

// ------------------------------------------------------------ outils de dessin
// Les scènes placent tout en pixels fins (CW × CH) ; le canevas est K fois plus fin. Les décors (ciel, sol, relief,
// rochers, cactus, astres, lueurs, fumées) sont peints pixel par pixel à la pleine finesse ; R() garde le pixel fin.
function painter(g, seed) {
  let s = seed >>> 0 || 1;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const sd = seed & 4095;
  const R = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };
  // un rectangle en pixels de l'image (détails plus fins que le pixel des scènes)
  const R1 = (X, Y, w, h, col) => { g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = col; g.fillRect(X | 0, Y | 0, w, h); g.setTransform(K, 0, 0, K, 0, 0); };
  // peint chaque pixel de l'image dans un cadre (en pixels fins) : fn(X, Y, couleur actuelle) → nouvelle couleur ou rien
  const px = (x0, y0, x1, y1, fn) => {
    const X0 = Math.max(0, Math.floor(x0 * K)), Y0 = Math.max(0, Math.floor(y0 * K));
    const X1 = Math.min(IW, Math.ceil(x1 * K)), Y1 = Math.min(IH, Math.ceil(y1 * K));
    const w = X1 - X0, h = Y1 - Y0;
    if (w <= 0 || h <= 0) return;
    const img = g.getImageData(X0, Y0, w, h), d = new Uint32Array(img.data.buffer);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const k = j * w + i, v = fn(X0 + i, Y0 + j, d[k]);
      if (v !== undefined) d[k] = v;
    }
    g.putImageData(img, X0, Y0);
  };

  // Bandes de couleur : en haut de l'image, un ciel en dégradé tramé avec ses nuages ; plus bas, un sol texturé
  // (taches, grain, rides de sable) ; une eau (palette bleue) ondule et scintille.
  const bands = (cols, y0, y1, x0 = 0, x1 = CW) => {
    const pal = gradOf(cols), n = pal.length - 1, Y0 = y0 * K, HH = (y1 - y0) * K;
    const first = P(cols[0]), last = P(cols[cols.length - 1]);
    const night = lumP(first) < 60 && lumP(last) < 80;
    const water = ((first >>> 16) & 255) > (first & 255) + 25;
    if (y0 <= 0) {
      const cl = mixP(last, P('#fdf6e0'), night ? 0.15 : 0.55), cd = mixP(first, last, 0.6), lite = night ? P('#4a5078') : P('#fffaf0');
      px(x0, y0, x1, y1, (X, Y) => {
        const t = (Y - Y0 + 0.5) / HH;
        let c = tone(pal, t * n + (hsh(X, Y, 3) - 0.5) * 0.5, X, Y);
        const m = fbm(X * 0.0035, Y * 0.016, sd, 4);
        const dens = sstep(0.55, 0.8, m) * (night ? 0.4 : 0.9) * (1 - t * 0.55);
        if (dens > 0.08 + bay(X, Y) * 0.3) {
          const top = m - fbm(X * 0.0035, (Y - 6) * 0.016, sd, 4); // le haut du nuage prend la lumière
          const base = mixP(cd, cl, Math.min(1, dens * 1.4));
          c = mixP(c, top > 0.006 ? mixP(base, lite, 0.55) : top < -0.008 ? shadeP(base, -0.12) : base, dens > 0.45 ? 0.9 : 0.6);
        }
        return c;
      });
      return;
    }
    const lite = shadeP(pal[0], 0.35), dark = shadeP(pal[n], -0.15);
    px(x0, y0, x1, y1, (X, Y) => {
      const t = (Y - Y0 + 0.5) / HH, m = fbm(X * 0.008, Y * 0.03, sd + 7, 3);
      if (water) {
        const w = Math.sin(X * (0.02 + 0.05 * t) + Math.sin(Y * 0.45 + X * 0.003) * 2 + m * 8);
        if (w > 0.93 - t * 0.05) return lite;
        if (w < -0.95) return dark;
        return tone(pal, t * n + (m - 0.5) * 2, X, Y);
      }
      let l = t * n + (m - 0.5) * 3.4 + (hsh(X, Y, 5) - 0.5) * 1.1;
      if (Math.sin(Y * (0.55 - 0.25 * t) + Math.sin(X * 0.015 + m * 6) * 3) > 0.9) l -= 1.4; // rides
      if (hsh(X >> 1, Y >> 1, 9) < 0.006) l += 2.5; // graviers sombres
      // touffes et cailloux semés, plus gros au premier plan (une par case, au hasard)
      const cx = (X >> 3) * 8 + 4, cy = (Y >> 2) * 4 + 2, r = 0.8 + t * 2.6, hc = hsh(X >> 3, Y >> 2, sd + 11);
      if (hc < 0.03 && ((X - cx) / (r * 1.7)) ** 2 + ((Y - cy) / r) ** 2 < 1) l = Y < cy - r * 0.3 && X < cx ? n * 0.55 : n + 1.5;
      return tone(pal, l, X, Y);
    });
  };

  // ligne de crête (collines, montagnes) remplie jusqu'en bas : amp en pixels, rough : nervosité
  const ridge = (col, base, amp, sdr, { rough = 1, bottom = CH, x0 = 0, x1 = CW, top = null } = {}) => {
    const a = sdr * 1.7, b = sdr * 0.37, pal = rampOf(col, 6, -0.3, 0.16), rim = top ? P(top) : shadeP(P(col), 0.24);
    const prof = (x) => base - ((Math.sin(x * 0.021 * rough + a) * 0.5 + Math.sin(x * 0.057 * rough + b) * 0.3 + Math.sin(x * 0.13 * rough + a * 2) * 0.2) * 0.5 + 0.5) * amp;
    px(x0, base - amp - 2, x1, bottom, (X, Y) => {
      const x = (X + 0.5) / K, y = (Y + 0.5) / K;
      const yt = prof(x) + (vnoise(X * 0.09, 0.5, sd + sdr) - 0.5) * 1.4;
      if (y < yt) return undefined;
      const dep = y - yt;
      if (dep < 0.5) return rim;
      const m = fbm(X * 0.025, Y * 0.05, sd + sdr * 13, 3), e = m - fbm((X + 4) * 0.025, (Y + 4) * 0.05, sd + sdr * 13, 3);
      const bush = hsh(X >> 2, Y >> 1, sdr) < 0.03 ? -1.2 : 0; // buissons et rochers, au loin
      return tone(pal, 3 + e * 14 + (m - 0.5) * 1.6 - Math.min(1.4, dep / 34) + bush + (hsh(X, Y, 2) - 0.5) * 0.6, X, Y);
    });
  };

  // mesa : sommet plat éclairé, falaise striée et ravinée, ombre à droite, éboulis au pied
  const mesa = (x, base, w, h, col) => {
    const pal = rampOf(col, 8, -0.4, 0.3);
    px(x - h - 2, base - h - 1, x + w + h + 2, base, (X, Y) => {
      const u = (X + 0.5) / K, r = (Y + 0.5) / K - (base - h);
      if (r < 0) return undefined;
      const cliff = r < h * 0.55, e = cliff ? 0 : (r - h * 0.55) * 1.3;
      const jag = (vnoise(Y * 0.12, 3, sd) - 0.5) * 3 + (vnoise(X * 0.2, 9, sd) - 0.5) * (r < 1.5 ? 1.6 : 0);
      const L = x - e + jag, Rr = x + w + e - jag * 0.6;
      if (u < L || u > Rr || (r < 1.5 && (vnoise(X * 0.2, 9, sd) - 0.5) * 3 > r)) return undefined;
      let l;
      if (r < 1.5) l = 6.4;
      else if (cliff) {
        l = 4 + ((Math.floor(r / 3 + vnoise(X * 0.05, 1, sd) * 1.5) & 1) ? -0.7 : 0.3) + (fbm(X * 0.18, Y * 0.012, sd + 4, 2) - 0.5) * 3.2;
        if (u > Rr - w * 0.22 - jag) l -= 2;
        else if (u < L + 2) l += 1;
      } else l = 2.6 + (hsh(X >> 1, Y >> 1, 4) - 0.5) * 2.6 + (u > (L + Rr) / 2 + w * 0.2 ? -1.2 : 0.3) - (r - h * 0.55) / (h * 0.45);
      return tone(pal, l, X, Y);
    });
  };

  // formes cernées peintes au pixel : inside(u, v) → niveau de la palette (ou null), puis un contour d'un pixel
  const shape = (x0, y0, x1, y1, pal, inside) => {
    const st = 1 / K;
    px(x0 - 1, y0 - 1, x1 + 1, y1 + 1, (X, Y) => {
      const u = (X + 0.5) / K, v = (Y + 0.5) / K, l = inside(u, v, X, Y);
      if (l != null) return tone(pal, l, X, Y);
      if (inside(u - st, v, X, Y) != null || inside(u + st, v, X, Y) != null || inside(u, v - st, X, Y) != null || inside(u, v + st, X, Y) != null) return OUTP;
      return undefined;
    });
  };
  const CACTUS = ['#16301a', '#24482a', '#34622f', '#4c7e3c', '#6c9c50', '#92b86a', '#b8d488'].map(P);
  const cactus = (x, base, hgt) => {
    const a = Math.round(hgt * 0.5), up = Math.round(hgt * 0.3);
    const stems = [[x, x + 3, base - hgt, base], [x - 3.2, x - 1, base - a - up, base - a + 1.4], [x + 5.6, x + 7.8, base - a - 2, base - a + 4.4]];
    const arms = [[x - 2, x + 0.5, base - a, base - a + 1.4], [x + 2.5, x + 6.4, base - a + 3, base - a + 4.4]];
    shape(x - 4, base - hgt - 1, x + 9, base, CACTUS, (u, v, X) => {
      for (const [a0, a1, b0, b1] of stems) {
        if (u < a0 || u > a1 || v > b1) continue;
        const r = (a1 - a0) / 2, cx = a0 + r;
        if (v < b0 + r && (u - cx) ** 2 + (v - b0 - r) ** 2 > r * r) continue;
        if (v < b0) continue;
        const rel = (u - a0) / (a1 - a0);
        return 5.2 - rel * 4.4 - (X % 3 === 2 ? 0.8 : 0) + (hsh(X, v * 8, 1) < 0.03 ? 2 : 0);
      }
      for (const [a0, a1, b0, b1] of arms) if (u >= a0 && u <= a1 && v >= b0 && v <= b1) return 4 - ((v - b0) / (b1 - b0)) * 2.4;
      return null;
    });
  };

  // rocher : ellipse bosselée, modelée par la lumière, fissurée, posée à plat sur le sol (base)
  const stone = (cx, cy, rx, ry, col, base) => {
    const pal = rampOf(col, 7, -0.45, 0.3), k = rnd() * 100;
    shape(cx - rx - 1, cy - ry - 1, cx + rx + 1, Math.min(base, cy + ry + 1), pal, (u, v, X, Y) => {
      if (v > base) return null;
      const nx = (u - cx) / rx, ny = (v - cy) / ry, rr = 1 + (vnoise(Math.atan2(ny, nx) * 2.2 + k, 0.5, sd) - 0.5) * 0.3, d = (nx * nx + ny * ny) / (rr * rr);
      if (d > 1) return null;
      const l = -0.5 * nx - 0.62 * ny + 0.6 * Math.sqrt(1 - d);
      const crack = Math.abs(fbm(X * 0.05 + k, Y * 0.05, sd + 3, 2) - 0.5) < 0.018 ? -1.6 : 0;
      return (l * 0.55 + 0.45) * 6.4 + (fbm(X * 0.07, Y * 0.07, sd + 1, 2) - 0.5) * 1.8 + crack;
    });
  };
  const rock = (x, base, w, h, col = '#8a7460') => stone(x + w / 2, base - h * 0.5, w / 2 + 1, h * 0.62, col, base);
  const boulder = (x, base, w, h, col = '#9a8068') => stone(x + w / 2, base - h * 0.55, w / 2, h * 0.62, col, base);

  // bouffée ronde (fumée, poussière, nuage bas) modelée par la lumière
  const disc = (x, y, r, col) => {
    const pal = rampOf(col, 6, -0.22, 0.22), k = rnd() * 50;
    px(x - r - 1, y - r - 1, x + r + 1, y + r + 1, (X, Y) => {
      const nx = ((X + 0.5) / K - x) / r, ny = ((Y + 0.5) / K - y) / r;
      const d = (nx * nx + ny * ny) / (1 + (vnoise(Math.atan2(ny, nx) * 3 + k, 1, sd) - 0.5) * 0.35) ** 2;
      if (d > 1) return undefined;
      return tone(pal, (-0.45 * nx - 0.6 * ny + 0.6 * Math.sqrt(1 - d)) * 2.6 + 2.2, X, Y);
    });
  };
  // soleil : disque éclatant, halo tramé qui se fond dans le ciel
  const sun = (x, y, r, halo = '#fbecc4', core = '#fdf6e0') => {
    const H = P(halo), C = P(core);
    px(x - r * 4, y - r * 4, x + r * 4, y + r * 4, (X, Y, cur) => {
      const d = Math.hypot((X + 0.5) / K - x, (Y + 0.5) / K - y);
      if (d < r) return (d / r) ** 6 > bay(X, Y) ? H : C;
      const a = Math.max(0, 1 - (d - r) / (r * 3)) ** 2 * 0.75;
      const q = Math.floor(a * 6 + bay(X, Y)) / 6;
      return q > 0 ? mixP(cur, H, q) : undefined;
    });
  };
  // lune : croissant gris perle, mers sombres, halo pâle ; l'ombre laisse voir le ciel
  const moon = (x, y, r) => {
    const L = P('#f0ecd0'), M = P('#c8c2a4'), Hh = P('#8a90b8');
    const sx = x + Math.round(r * 0.6), sy = y - Math.round(r * 0.3), sr = r - 1;
    px(x - r * 3, y - r * 3, x + r * 3, y + r * 3, (X, Y, cur) => {
      const u = (X + 0.5) / K, v = (Y + 0.5) / K, d = Math.hypot(u - x, v - y);
      if (d < r && Math.hypot(u - sx, v - sy) > sr) return fbm(X * 0.08, Y * 0.08, sd, 2) > 0.58 ? M : (d / r) ** 4 > bay(X, Y) * 1.4 ? M : L;
      if (d < r) return undefined;
      const a = Math.max(0, 1 - (d - r) / (r * 2)) ** 2 * 0.35;
      const q = Math.floor(a * 5 + bay(X, Y)) / 5;
      return q > 0 ? mixP(cur, Hh, q) : undefined;
    });
  };
  const stars = (n, y1, cols = ['#f4ecd8', '#a8b0d0', '#6a7098']) => {
    for (let k = 0; k < n * 2; k++) {
      const X = Math.floor(rnd() * IW), Y = Math.floor(rnd() * y1 * K), c = cols[Math.floor(rnd() * cols.length)];
      R1(X, Y, 1, 1, c);
      const b = rnd();
      if (b < 0.06) { R1(X - 2, Y, 5, 1, c); R1(X, Y - 2, 1, 5, c); R1(X, Y, 1, 1, '#ffffff'); } else if (b < 0.16) R1(X, Y, 2, 2, c);
    }
  };
  // cailloux : un éclat clair, un corps, une ombre ; plus gros au premier plan
  const pebbles = (y0, y1, n, cols) => {
    for (let k = 0; k < n * 2; k++) {
      const t = rnd(), X = Math.floor(rnd() * IW), Y = Math.floor((y0 + t * (y1 - y0)) * K), c = cols[Math.floor(rnd() * cols.length)];
      const w = 1 + Math.floor(t * 3 * rnd() + rnd()), h = Math.max(1, w - 1);
      R1(X + 1, Y + h, w, 1, 'rgba(40,20,10,0.35)');
      R1(X, Y, w, h, c);
      if (w > 1) R1(X, Y, 1, 1, S.shade(c, 0.35));
    }
  };
  // touffes d'herbe : brins fins, pointes claires
  const grass = (y0, y1, n, cols) => {
    for (let k = 0; k < n * 1.4; k++) {
      const t = rnd(), X = Math.floor(rnd() * IW), Y = Math.floor((y0 + t * (y1 - y0)) * K), c = cols[Math.floor(rnd() * cols.length)];
      const sz = 2 + t * 7, blades = 3 + Math.floor(rnd() * 4);
      for (let b = 0; b < blades; b++) {
        const bx = X + b * 2 - blades, bh = Math.round(sz * (0.5 + rnd() * 0.7)), lean = (b - blades / 2) * 0.25;
        for (let j = 0; j < bh; j++) R1(bx + Math.round(lean * j * 0.4), Y - j, 1, 1, j > bh - 3 ? S.shade(c, 0.3) : c);
      }
    }
  };
  // voile transparent (lumière du feu, poussière…)
  const veil = (col, a, x = 0, y = 0, w = CW, h = CH) => { g.globalAlpha = a; R(x, y, w, h, col); g.globalAlpha = 1; };
  // lueur ronde (feu, lanterne) : la couleur se mêle à l'image, par paliers tramés
  const glow = (x, y, r, col, a = 0.1) => {
    const C = P(col);
    px(x - r, y - r, x + r, y + r, (X, Y, cur) => {
      const d = Math.hypot((X + 0.5) / K - x, (Y + 0.5) / K - y) / r;
      if (d >= 1) return undefined;
      const q = Math.floor(Math.min(0.85, a * 7 * (1 - d) ** 1.6) * 8 + bay(X, Y)) / 8;
      return q > 0 ? mixP(cur, C, q) : undefined;
    });
  };
  // flamme de feu de camp, pied en (x, base), haute de h pixels fins : langues de feu, cœur blanc
  const FIRE = ['#5a1006', '#a82410', '#d8501a', '#f08a2a', '#f8c050', '#fdf0b8'].map(P);
  const fire = (x, base, h) => {
    const k = rnd() * 9;
    px(x - h * 0.5, base - h - 1, x + h * 0.5, base, (X, Y) => {
      const u = (X + 0.5) / K - x, yr = (base - (Y + 0.5) / K) / h;
      const wob = (vnoise(Y * 0.18 + k, X * 0.05, sd) - 0.5) * 0.5;
      const half = h * 0.32 * (1 - yr) ** 0.8 * (1 + wob) * (0.75 + 0.25 * Math.sin(u * 1.4 + k + yr * 5));
      const a = Math.abs(u + wob * h * 0.12) / Math.max(0.01, half);
      if (a > 1 || yr < 0) return undefined;
      return tone(FIRE, (1 - a) * 4.2 + (1 - yr) * 2 - 0.8, X, Y);
    });
  };
  // un sprite dessiné à part en pixels fins, cerné, puis affiné (hd) : P(x, y, w, h, col) depuis l'origine (ox, oy)
  const sprite = (w, h, ox, oy, draw) => {
    const c = S.makeCanvas(w + 2, h + 2, true), sg = c.getContext('2d');
    draw((x, y, ww, hh, col) => { sg.fillStyle = col; sg.fillRect(Math.round(ox + 1 + x), Math.round(oy + 1 + y), Math.round(ww), Math.round(hh)); }, sg);
    outline(c);
    c.ox = ox + 1; c.oy = oy + 1;
    const o = hd(c);
    S.freeCanvas(c);
    return o;
  };
  const put = (c, x, y, flip = false, flipY = false) => {
    const [w, h] = dims(c);
    if (!flip && !flipY) { g.drawImage(c, Math.round(x - c.ox), Math.round(y - c.oy), w, h); return; }
    g.save();
    g.translate(Math.round(x), Math.round(y));
    g.scale(flip ? -1 : 1, flipY ? -1 : 1);
    g.drawImage(c, -c.ox, -c.oy, w, h);
    g.restore();
  };
  // silhouette : le sprite repeint d'une seule couleur (contre-jour)
  const silhouette = (c, col) => {
    const o = S.makeCanvas(c.width, c.height), og = o.getContext('2d');
    og.drawImage(c, 0, 0);
    og.globalCompositeOperation = 'source-in';
    og.fillStyle = col;
    og.fillRect(0, 0, o.width, o.height);
    o.ox = c.ox; o.oy = c.oy; o.hd = c.hd;
    return o;
  };
  // un cow-boy du jeu (charSprite), pieds en (x, y) ; wa : angle de l'arme tenue (null : mains vides)
  // (charSprite a son origine en pixels du jeu : 10, 22 ; soit 20, 44 en pixels fins)
  const cowboy = (lk, kit, x, y, { back = false, frame = 0, flip = false, wa = null } = {}) => {
    const body = charSprite(lk, kit, back, frame), bh = hd(body);
    const wp = wa === null ? null : weaponSprite(kit, wa);
    const gun = () => { if (wp) g.drawImage(hd(wp), Math.round(x + (flip ? -8 : 8) - wp.width / 2), Math.round(y - 13 - wp.height / 2), wp.width, wp.height); };
    if (back) gun();
    g.save();
    g.translate(Math.round(x), Math.round(y));
    if (flip) g.scale(-1, 1);
    g.drawImage(bh, -20, -44, body.width, body.height);
    g.restore();
    if (!back) gun();
  };
  // un sprite à demi-taille (au loin), éventuellement transparent
  const small = (c, x, y, { flip = false, a = 1 } = {}) => {
    const [w, h] = dims(c);
    g.globalAlpha = a;
    g.save();
    g.translate(Math.round(x), Math.round(y));
    if (flip) g.scale(-1, 1);
    g.drawImage(c, -c.ox / 2, -c.oy / 2, w / 2, h / 2);
    g.restore();
    g.globalAlpha = 1;
  };
  return { g, rnd, R, R1, px, fire, bands, disc, sun, moon, stars, ridge, mesa, cactus, rock, boulder, small, pebbles, grass, veil, glow, sprite, put, silhouette, cowboy };
}

// les personnages des vignettes (index des couleurs de data.js)
const LOOKS = {
  hero: { skin: 2, hairColor: 1, eyeColor: 1, outfitColor: 0, hat: 'cowboy', hatColor: 1, beard: 'stubble' },
  pard: { skin: 4, hairColor: 0, eyeColor: 0, outfitColor: 3, hat: 'gambler', hatColor: 7, beard: 'mustache' },
  gambler1: { skin: 1, hairColor: 8, eyeColor: 0, outfitColor: 7, hat: 'gambler', hatColor: 7, beard: 'imperial' },
  gambler2: { skin: 3, hairColor: 2, eyeColor: 3, outfitColor: 10, hat: 'bowler', hatColor: 1, beard: 'chops' },
  gambler3: { skin: 6, hairColor: 6, eyeColor: 4, outfitColor: 4, hat: 'cowboy', hatColor: 5, beard: 'full' },
  bunsen: { skin: 6, hairColor: 7, eyeColor: 2, outfitColor: 6, hat: 'tophat', hatColor: 7, beard: 'mustache' },
  sheriff: { skin: 7, hairColor: 6, eyeColor: 0, outfitColor: 1, hat: 'cowboy', hatColor: 7, beard: 'mustache' },
  deputy: { skin: 1, hairColor: 3, eyeColor: 0, outfitColor: 8, hat: 'cowboy', hatColor: 2, beard: 'none' },
  deputy2: { skin: 5, hairColor: 0, eyeColor: 0, outfitColor: 12, hat: 'bowler', hatColor: 7, beard: 'stubble' },
  soldier: { skin: 1, hairColor: 3, eyeColor: 2, outfitColor: 3, hat: 'none', hatColor: 3, beard: 'stubble' },
  rancher: { skin: 7, hairColor: 2, eyeColor: 0, outfitColor: 8, hat: 'cowboy', hatColor: 5, beard: 'chops' },
};
const look = (id) => lookOf(LOOKS[id], `vig-${id}`);

// ------------------------------------------------------------ bêtes et véhicules
// cheval de profil, tourné vers la droite (origine : sabots, sous la sangle) ; gallop : jambes lancées ; rider : cavalier
function horse(D, { coat = '#8a5a34', mane = '#3a2414', gallop = false, rider = null, blaze = false, spots = [] } = {}) {
  const L = S.shade(coat, 0.18), Dk = S.shade(coat, -0.22);
  return D.sprite(46, 56, 19, 54, (P) => {
    // queue
    P(-15, -24, 3, 3, mane); P(-17, -22, 3, 6, mane); P(-18, -17, 3, 6, mane); P(-17, -12, 2, 3, mane);
    // jambes
    const leg = (x, y, dx, dy, back) => {
      const col = back ? Dk : coat;
      for (let k = 0; k < 12; k++) P(x + Math.round((dx * k) / 12), y + Math.round((dy * k) / 12), 3, 2, col);
      P(x + dx - 1, y + dy, 4, 2, '#2a1c14');
    };
    if (gallop) { leg(-12, -14, -9, 9, true); leg(6, -14, 10, 7, true); leg(-9, -14, -4, 12, false); leg(9, -14, 12, 3, false); }
    else { leg(-11, -14, 0, 12, true); leg(6, -14, 0, 12, true); leg(-8, -14, 0, 12, false); leg(9, -14, 1, 12, false); }
    // corps
    P(-14, -24, 28, 11, coat); P(-15, -22, 30, 7, coat); P(-12, -25, 22, 1, coat);
    P(-13, -24, 20, 2, L); P(-12, -14, 24, 1, Dk); P(-15, -17, 3, 3, Dk);
    for (const [x, y, w, h] of spots) P(x, y, w, h, '#6a4a30'); // robe pie
    // encolure et tête
    for (let r = 0; r < 12; r++) P(9 + Math.round(r * 0.55), -25 - r, 7, 1, coat);
    P(14, -39, 6, 4, coat); P(17, -37, 6, 4, coat); P(20, -35, 4, 3, coat); P(22, -33, 2, 1, Dk);
    P(15, -41, 2, 2, coat); P(17, -42, 1, 1, coat); // oreille
    P(18, -38, 1, 1, OUT); // œil
    P(23, -34, 1, 1, '#2a1c14'); // naseau
    if (blaze) P(19, -38, 1, 3, '#f4ecd8');
    // crinière
    for (let r = 0; r < 13; r++) P(8 + Math.round(r * 0.55), -25 - r, 2, 1, mane);
    P(13, -40, 3, 1, mane);
    // selle et cavalier
    if (rider) {
      P(-6, -26, 10, 3, '#5a3418'); P(-6, -26, 10, 1, '#7a4a24'); P(-2, -23, 3, 5, '#7a4a24');
      rider(P);
    }
  });
}
// le cavalier (vu de profil, tourné vers la droite), dessiné sur la selle
const riderOf = ({ skin = '#c58a5c', cloth = '#7a2a1e', hat = '#3d2a1c', hair = '#32261e', feathers = false, rifle = false } = {}) => (P) => {
  const cD = S.shade(cloth, -0.25), sD = S.shade(skin, -0.2);
  P(-3, -22, 4, 9, '#4a3a2a'); P(-3, -14, 5, 3, '#3a2414'); // jambe et botte
  P(-4, -36, 8, 11, cloth); P(-4, -36, 2, 11, S.shade(cloth, 0.15)); P(2, -36, 2, 11, cD); // buste
  P(1, -34, 6, 3, cloth); P(6, -33, 2, 2, skin); // bras tendu (rênes)
  P(-3, -43, 7, 7, skin); P(2, -42, 2, 6, sD); P(-3, -43, 3, 3, hair); P(3, -40, 1, 1, OUT);
  if (feathers) {
    P(-3, -45, 7, 2, '#c83828');
    for (let k = 0; k < 6; k++) { P(-4 - k * 2, -49 + k * 2, 2, 5, '#f4ecd8'); P(-4 - k * 2, -49 + k * 2, 2, 1, '#2a1c14'); }
    P(-4, -51, 2, 6, '#f4ecd8'); P(-4, -51, 2, 1, '#2a1c14');
  } else { P(-6, -44, 13, 2, hat); P(-3, -48, 7, 4, hat); P(-3, -45, 7, 1, S.shade(hat, -0.4)); }
  if (rifle) { P(4, -40, 2, 3, '#6a4428'); for (let k = 0; k < 9; k++) P(5 + k, -41 - Math.round(k * 0.6), 2, 1, '#4a4a52'); }
};

// vache longhorn, de profil vers la droite (origine : sabots)
function longhorn(D, { coat = '#a0603a', patch = '#f0e6d0' } = {}) {
  const Dk = S.shade(coat, -0.25);
  return D.sprite(48, 30, 20, 26, (P) => {
    P(-20, -20, 2, 9, coat); P(-21, -12, 3, 3, '#3a2414'); // queue
    const leg = (x, col) => { P(x, -9, 3, 7, col); P(x, -3, 3, 2, '#2a1c14'); };
    leg(-15, Dk); leg(8, Dk); leg(-12, coat); leg(11, coat);
    P(-17, -22, 32, 13, coat); P(-18, -20, 34, 9, coat); P(-16, -10, 30, 2, Dk);
    P(-10, -21, 8, 7, patch); P(-12, -18, 4, 4, patch); P(4, -20, 5, 4, patch); P(-3, -13, 6, 2, patch);
    P(-16, -23, 26, 1, S.shade(coat, 0.15));
    // tête basse et grandes cornes
    P(14, -20, 8, 9, coat); P(18, -15, 6, 6, coat); P(19, -11, 5, 2, Dk); P(18, -18, 1, 1, OUT);
    P(14, -20, 3, 9, patch);
    for (let k = 0; k < 12; k++) P(16 + k, -22 - Math.round((k * k) / 22), 2, 2, '#e8dcc0');
    for (let k = 0; k < 9; k++) P(16 - k, -22 - Math.round((k * k) / 14), 2, 2, '#c8bca0');
  });
}

// roue de chariot (rayons), centrée en (cx, cy)
function wheel(P, cx, cy, r, wood = '#6a4428', rim = '#3a2a1e') {
  for (let a = 0; a < 48; a++) {
    const t = (a / 48) * Math.PI * 2;
    P(cx + Math.round(Math.cos(t) * r) - 1, cy + Math.round(Math.sin(t) * r) - 1, 2, 2, rim);
  }
  for (let a = 0; a < 8; a++) {
    const t = (a / 8) * Math.PI * 2 + 0.2;
    for (let k = 2; k < r; k++) P(cx + Math.round(Math.cos(t) * k), cy + Math.round(Math.sin(t) * k), 1, 1, wood);
  }
  P(cx - 2, cy - 2, 4, 4, rim); P(cx - 1, cy - 1, 2, 2, '#c0a040');
}

// chariot bâché (vue de côté, vers la droite)
function coveredWagon(D, { canvas = '#ece2c8' } = {}) {
  const cD = S.shade(canvas, -0.15), cDD = S.shade(canvas, -0.3);
  return D.sprite(76, 46, 38, 44, (P) => {
    // bâche en arceaux
    for (let x = -30; x <= 28; x++) {
      const t = (x + 30) / 58, hump = Math.round(Math.sin(t * Math.PI) * 4);
      P(x, -40 - hump + (x < -26 || x > 24 ? 4 : 0), 1, 22 + hump - (x < -26 || x > 24 ? 4 : 0), canvas);
    }
    for (const x of [-22, -9, 4, 17]) P(x, -42, 1, 24, cD);
    P(-30, -20, 59, 2, cDD);
    P(-31, -40, 3, 22, cD); P(27, -40, 3, 22, cD);
    // caisse
    P(-32, -18, 64, 10, '#7a4a24'); P(-32, -18, 64, 1, '#a8703c'); P(-32, -13, 64, 1, '#5a3418'); P(-32, -9, 64, 1, '#4a2a14');
    P(30, -16, 10, 2, '#5a3418'); // timon
    wheel(P, -20, -9, 9); wheel(P, 20, -8, 8);
  });
}

// ------------------------------------------------------------ les scènes (une par événement)
// Les repères sont pensés sur une grille de 224 × 128 puis étirés au format réel (X, Y) ; les sprites gardent leur
// taille en pixels fins : la vignette gagne en finesse, pas en gros pixels.
const X = (v) => Math.round((v * CW) / 224), Y = (v) => Math.round((v * CH) / 128);
const SCENES = {
  pont(D) {
    const { R, bands, ridge, mesa, sun, sprite, put, cowboy, cactus } = D;
    bands(SKY.day, 0, Y(70));
    sun(X(182), Y(22), 13);
    mesa(X(10), Y(70), X(46), Y(22), '#c4967a'); mesa(X(150), Y(70), X(60), Y(16), '#c4967a'); mesa(X(96), Y(70), X(30), Y(12), '#b88a70');
    // la gorge : parois de plus en plus sombres vers le fond, rivière tout en bas
    ridge('#a0623e', Y(67), 10, 3, { rough: 0.8 });
    bands(['#8a4e34', '#6e3c2c', '#542e26', '#3e2220'], Y(70), CH, X(50), X(190));
    R(X(104), CH - 9, 44, 9, '#4a7aa0'); R(X(108), CH - 8, 14, 1, '#8ac0e0'); R(X(116), CH - 5, 10, 1, '#8ac0e0');
    for (let y = Y(72); y < CH; y += 4) { R(X(64) + ((y * 7) % 13), y, 4, 1, '#a0583a'); R(X(146) + ((y * 5) % 17), y + 2, 5, 1, '#5a3426'); }
    // les falaises : le plateau de chaque côté, et sa paroi qui plonge dans la gorge
    const tl = Y(72), tr = Y(68);
    for (let y = tr; y < CH; y++) {
      const eL = Math.round(X(72) - (y - tl) * 0.35), eR = Math.round(X(158) + (y - tr) * 0.35);
      if (y >= tl) {
        R(0, y, eL, 1, S.mix('#d08850', '#b4643a', (y - tl) / (CH - tl)));
        R(eL, y, 14, 1, (y >> 2) % 3 ? '#8e4c30' : '#7a402a'); R(eL + 14, y, 1, 1, '#4a2620');
        if (y === tl) R(0, y, eL + 14, 2, '#e8a060');
      }
      R(eR, y, CW - eR, 1, S.mix('#d08850', '#b4643a', (y - tr) / (CH - tr)));
      R(eR - 11, y, 11, 1, (y >> 2) % 3 ? '#6e3a28' : '#5e3224'); R(eR - 12, y, 1, 1, '#3a2018');
      if (y === tr) R(eR - 11, y, CW, 2, '#e8a060');
    }
    D.pebbles(Y(80), CH, 70, ['#e8a070', '#8a3a24']);
    cactus(X(206), Y(108), 26); cactus(X(196), Y(88), 16);
    // le pont de corde (une planche manque)
    const x0 = X(70), y0 = Y(70), x1 = X(160), y1 = Y(66), sag = 20;
    const yAt = (t, s = sag) => y0 + (y1 - y0) * t + s * 4 * t * (1 - t);
    const N = 44;
    for (let k = 0; k <= N; k++) {
      if (k === 25) continue;
      const t = k / N, x = Math.round(x0 + (x1 - x0) * t), y = Math.round(yAt(t));
      const tilt = k === 26 ? 2 : 0;
      R(x - 1, y - 1, 4, 5 + tilt, OUT); R(x, y, 2, 3 + tilt, k % 3 ? '#a8703c' : '#8a5a30'); R(x, y, 2, 1, '#c89060');
    }
    R(Math.round(x0 + (x1 - x0) * 0.57), Math.round(yAt(0.57)) + 12, 2, 3, '#8a5a30'); // planche qui tombe
    R(Math.round(x0 + (x1 - x0) * 0.58), Math.round(yAt(0.57)) + 30, 2, 2, '#8a5a30');
    for (let x = x0; x <= x1; x++) {
      const t = (x - x0) / (x1 - x0);
      R(x, Math.round(yAt(t)) + 3, 1, 1, '#5a3a20');
      R(x, Math.round(yAt(t, sag - 6)) - 16, 1, 1, '#d8c090');
      if (x % 7 === 0) R(x, Math.round(yAt(t, sag - 6)) - 15, 1, Math.round(yAt(t) - yAt(t, sag - 6)) + 15, '#c0a878');
    }
    const post = sprite(4, 22, 2, 22, (P) => { P(-2, -22, 4, 22, '#7a4a24'); P(-2, -22, 1, 22, '#a8703c'); P(-2, -20, 4, 1, '#d8c090'); });
    put(post, x0 - 2, y0 + 4); put(post, x1 + 2, y1 + 3);
    cowboy(look('hero'), 'colts', X(44), Y(106), { frame: 0 });
    cowboy(look('pard'), 'pompe', X(24), Y(116), { frame: 0 });
    // des vautours tournent
    for (const [vx, vy] of [[X(118), Y(30)], [X(134), Y(18)], [X(100), Y(14)]]) { R(vx, vy, 3, 1, '#3a2418'); R(vx - 3, vy - 1, 3, 1, '#3a2418'); R(vx + 3, vy - 1, 3, 1, '#3a2418'); }
  },

  diligence(D) {
    const { R, bands, mesa, sun, cactus, sprite, put, pebbles, rock, veil, boulder } = D;
    bands(SKY.hot, 0, Y(72));
    sun(X(40), Y(20), 13);
    mesa(X(130), Y(72), X(70), Y(20), '#c08a68'); mesa(X(6), Y(72), X(40), Y(14), '#b07a5c');
    bands(GROUND.sand, Y(72), CH);
    pebbles(Y(74), CH, 180, ['#f0c890', '#a87040']);
    cactus(X(204), Y(100), 30); cactus(X(184), Y(84), 16);
    boulder(X(190), Y(112), 34, 20, '#a08068');
    // la diligence, sur le toit, roues en l'air
    const coach = sprite(92, 58, 46, 50, (P) => {
      // caisse (vue normale, retournée ensuite)
      P(-34, -40, 66, 24, '#8a2a1e'); P(-30, -44, 58, 4, '#8a2a1e'); P(-34, -40, 66, 2, '#b04030');
      P(-34, -18, 66, 2, '#5a1a14'); P(-36, -44, 4, 28, '#6a1e16'); P(30, -44, 4, 28, '#6a1e16');
      P(-30, -36, 58, 1, '#e0b040'); P(-30, -22, 58, 1, '#e0b040');
      P(-8, -38, 16, 20, '#7a2418'); P(-8, -38, 16, 1, '#e0b040'); P(-6, -36, 12, 7, '#2a2a3a'); P(-5, -35, 4, 2, '#5a6a8a');
      P(-26, -36, 12, 8, '#2a2a3a'); P(14, -36, 12, 8, '#2a2a3a'); P(-25, -35, 4, 2, '#5a6a8a');
      P(-30, -48, 58, 4, '#3a2414'); P(-28, -50, 2, 2, '#3a2414'); P(24, -50, 2, 2, '#3a2414');
      P(-36, -16, 70, 3, '#3a2414'); // châssis
      wheel(P, -22, -10, 11, '#c0a040', '#4a2a14');
      wheel(P, 22, -8, 9, '#c0a040', '#4a2a14');
    });
    put(coach, X(112), Y(66), false, true);
    // une roue arrachée, contre un rocher
    const w = sprite(24, 24, 12, 12, (P) => wheel(P, 0, 0, 10, '#c0a040', '#4a2a14'));
    rock(X(48), Y(112), 18, 12, '#9a7a62');
    put(w, X(40), Y(104));
    // malles éventrées, linge éparpillé
    const trunk = sprite(18, 14, 9, 14, (P) => {
      P(-9, -10, 18, 10, '#6a4428'); P(-9, -10, 18, 2, '#8a5c38'); P(-9, -6, 18, 1, '#c0a040'); P(-1, -8, 2, 3, '#e0b040');
      P(-9, -14, 18, 4, '#5a3418'); P(-8, -13, 16, 1, '#7a4a24');
    });
    put(trunk, X(166), Y(116)); put(trunk, X(80), Y(122), true); put(trunk, X(140), Y(124));
    R(X(176), Y(116), 8, 3, '#e8e0cc'); R(X(176) + 2, Y(116) + 3, 6, 2, '#c8c0b0'); R(X(94), Y(122), 10, 2, '#a83a3a'); R(X(68), Y(124), 6, 2, '#2f4a5e');
    R(X(150), Y(110), 12, 2, '#e8e0cc'); R(X(124), Y(126), 6, 3, '#6a5a8a');
    for (const [x, y] of [[150, 120], [158, 122], [132, 118], [104, 124]]) { R(X(x), Y(y), 2, 1, '#f8e08a'); R(X(x) + 1, Y(y) + 1, 1, 1, '#c0a040'); }
    veil('#f0dcb0', 0.08, 0, Y(70), CW, 30);
  },

  poker(D) {
    const { R, bands, moon, stars, ridge, sprite, put, cowboy, glow, veil, fire } = D;
    bands(SKY.night, 0, Y(80));
    stars(150, Y(72));
    moon(X(190), Y(18), 10, SKY.night[0]);
    ridge('#1a1830', Y(80), 24, 5, { rough: 0.5 });
    bands(GROUND.night, Y(82), CH);
    // les trois joueurs derrière la couverture
    cowboy(look('gambler1'), 'colts', X(84), Y(104), { frame: 0 });
    cowboy(look('gambler2'), 'couteau', X(116), Y(100), { frame: 0 });
    cowboy(look('gambler3'), 'pompe', X(148), Y(104), { frame: 0, flip: true });
    // la couverture et les cartes
    const blanket = sprite(150, 24, 75, 0, (P) => {
      P(-75, 0, 150, 22, '#7a2a1e'); for (let x = -70; x < 75; x += 12) P(x, 0, 5, 22, '#a83a2a');
      P(-75, 0, 150, 2, '#c85a40'); P(-75, 20, 150, 2, '#4a1a14');
      for (const [x, y] of [[-40, 6], [-32, 7], [14, 5], [22, 6], [30, 7]]) { P(x, y, 6, 8, '#f4ecd8'); P(x + 1, y + 1, 2, 2, x > 0 ? '#c83828' : '#1a0f0a'); }
      for (let k = 0; k < 5; k++) { P(-6, 13 - k * 2, 8, 2, '#e0b040'); P(-6, 13 - k * 2, 8, 1, '#f8e08a'); }
      for (let k = 0; k < 3; k++) { P(6, 15 - k * 2, 8, 2, '#c8ced6'); P(6, 15 - k * 2, 8, 1, '#f4ecd8'); }
      P(46, 9, 5, 9, '#8a5a30'); P(47, 5, 3, 4, '#c8b080'); // bouteille
      P(56, 12, 4, 5, '#c8b080'); // verre
    });
    put(blanket, X(116), Y(97));
    // le feu
    const fx = X(30), fy = Y(118);
    glow(fx, fy - 8, 90, '#f0a040', 0.09);
    R(fx - 12, fy - 2, 24, 3, '#4a2a14'); R(fx - 10, fy - 4, 20, 2, '#6a3a1a'); R(fx - 12, fy - 2, 24, 1, '#8a5a30');
    for (const dx of [-14, -9, 9, 13]) { R(fx + dx, fy - 1, 4, 3, '#6a6460'); R(fx + dx, fy - 1, 4, 1, '#9a948c'); }
    fire(fx, fy - 3, 24);
    for (const [x, y] of [[fx - 4, fy - 30], [fx + 3, fy - 38], [fx - 1, fy - 46]]) R(x, y, 1, 1, '#f8d070'); // escarbilles
    // un cheval attaché, dans l'ombre
    put(D.silhouette(horse(D, {}), '#14122a'), X(196), Y(100));
    veil('#f0a040', 0.06, 0, Y(80), CW, CH);
  },

  puits(D) {
    const { R, bands, sun, mesa, cactus, sprite, put, pebbles, veil, boulder } = D;
    bands(SKY.hot, 0, Y(74));
    sun(X(170), Y(24), 15);
    mesa(X(20), Y(74), X(60), Y(14), '#c49070'); mesa(X(150), Y(74), X(40), Y(10), '#b88466');
    bands(GROUND.sand, Y(74), CH);
    pebbles(Y(76), CH, 160, ['#f0c890', '#a87040']);
    cactus(X(30), Y(108), 30); cactus(X(196), Y(90), 18); cactus(X(212), Y(96), 12);
    boulder(X(56), Y(94), 22, 12, '#b08a6a');
    // le puits de pierre
    const well = sprite(70, 76, 35, 74, (P) => {
      // charpente et toit
      P(-26, -70, 52, 4, '#7a4a24'); P(-22, -74, 44, 4, '#8a5a30'); P(-22, -74, 44, 1, '#b07848');
      P(-24, -66, 4, 40, '#6a4428'); P(20, -66, 4, 40, '#6a4428'); P(-24, -66, 1, 40, '#8a5c38');
      P(-20, -56, 40, 3, '#5a3418'); P(18, -58, 8, 2, '#4a4a52'); P(24, -58, 2, 8, '#4a4a52'); // treuil
      P(-1, -53, 1, 16, '#c8b080'); // corde
      P(-5, -38, 10, 8, '#7a4a24'); P(-5, -38, 10, 1, '#c0a040'); P(-5, -34, 10, 1, '#c0a040'); // seau
      // margelle
      for (let r = 0; r < 5; r++) {
        for (let k = 0; k < 6; k++) {
          const x = -30 + k * 10 + (r % 2 ? 5 : 0);
          if (x > 24) continue;
          const col = (r + k) % 3 === 0 ? '#a89c88' : (r + k) % 3 === 1 ? '#bcb09a' : '#948876';
          P(Math.max(-30, x), -26 + r * 5, Math.min(9, 30 - x), 4, col);
          P(Math.max(-30, x), -26 + r * 5, Math.min(9, 30 - x), 1, '#d4c8b0');
        }
      }
      P(-30, -28, 60, 3, '#8a7e6a'); P(-28, -30, 56, 2, '#2a3a2a');
    });
    put(well, X(112), Y(116));
    // vapeurs de soufre
    for (const [x, y] of [[106, 50], [116, 44], [110, 38], [120, 54], [114, 32]]) { R(X(x), Y(y), 5, 1, '#d8e0a0'); R(X(x) + 2, Y(y) - 2, 4, 1, '#c8d090'); }
    // crâne de vache, os blanchis
    const skull = sprite(16, 10, 8, 10, (P) => {
      P(-4, -8, 8, 6, '#f0e8d8'); P(-3, -2, 6, 2, '#d8d0c0'); P(-3, -6, 2, 2, OUT); P(1, -6, 2, 2, OUT);
      P(-8, -9, 4, 2, '#e8dcc0'); P(4, -9, 4, 2, '#e8dcc0'); P(-9, -11, 2, 2, '#e8dcc0'); P(7, -11, 2, 2, '#e8dcc0');
    });
    put(skull, X(170), Y(120));
    R(X(160), Y(122), 8, 2, '#e8dcc0'); R(X(182), Y(118), 6, 2, '#e8dcc0');
    veil('#f8e8b0', 0.05);
  },

  charlatan(D) {
    const { R, bands, sun, ridge, sprite, put, cowboy, pebbles, rnd, cactus } = D;
    bands(SKY.day, 0, Y(72));
    sun(X(30), Y(18), 12);
    ridge('#a8b0a0', Y(72), 14, 2, { rough: 0.4 });
    bands(GROUND.sand, Y(72), CH);
    pebbles(Y(74), CH, 140, ['#f0c890', '#a87040']);
    cactus(X(14), Y(100), 22);
    // la roulotte, couverte de fioles
    const van = sprite(110, 82, 50, 72, (P) => {
      P(-46, -70, 92, 4, '#3a2a5e'); P(-42, -74, 84, 4, '#4a3a70'); // toit arrondi
      P(-44, -66, 88, 48, '#6a2a4a'); P(-44, -66, 88, 2, '#8a3a60'); P(-44, -20, 88, 2, '#4a1a30');
      P(-40, -62, 80, 10, '#e0b040'); P(-38, -60, 76, 6, '#8a2a1e'); // enseigne
      for (let k = 0; k < 9; k++) P(-34 + k * 8, -58, 4, 2, '#f8e08a');
      // étagères de fioles
      const cols = ['#40c070', '#c83828', '#7ab0f0', '#e0b040', '#a070e0', '#e8604c'];
      for (let r = 0; r < 2; r++) {
        P(-38, -38 + r * 12, 46, 2, '#5a3418');
        for (let k = 0; k < 9; k++) {
          const c = cols[(k + r * 3) % cols.length], h = 6 + ((k * 3 + r) % 3);
          P(-36 + k * 5, -38 + r * 12 - h, 3, h, c); P(-36 + k * 5, -38 + r * 12 - h, 1, h, '#f4ecd8'); P(-35 + k * 5, -40 + r * 12 - h, 1, 2, '#8a5a30');
        }
      }
      P(14, -48, 24, 30, '#4a1a30'); P(16, -46, 20, 12, '#2a1a2a'); P(34, -34, 2, 2, '#e0b040'); // porte
      P(-48, -18, 96, 6, '#3a2414'); P(-48, -18, 96, 1, '#5a3418');
      wheel(P, -30, -8, 10, '#c0a040', '#3a2414'); wheel(P, 30, -8, 10, '#c0a040', '#3a2414');
    });
    put(van, X(92), Y(114));
    // le cheval de trait, qui s'ennuie
    put(horse(D, { coat: '#9a7a5a', mane: '#5a4030' }), X(40), Y(118), true);
    // un tréteau de démonstration, et le professeur Bunsen, une fiole brandie
    const stall = sprite(36, 28, 18, 26, (P) => {
      P(-18, -16, 36, 3, '#8a5a30'); P(-18, -16, 36, 1, '#a87444'); P(-16, -13, 2, 13, '#6a4428'); P(14, -13, 2, 13, '#6a4428');
      for (const [x, c] of [[-14, '#40c070'], [-8, '#c83828'], [-2, '#7ab0f0'], [4, '#e0b040'], [10, '#a070e0']]) { P(x, -24, 4, 8, c); P(x, -24, 1, 8, '#f4ecd8'); P(x + 1, -26, 2, 2, '#8a5a30'); }
    });
    put(stall, X(154), Y(118));
    cowboy(look('bunsen'), 'docteur', X(184), Y(122), { frame: 0, flip: true, wa: Math.PI + 0.9 });
    // éclats de verre qui brillent
    for (let k = 0; k < 10; k++) R(X(140) + rnd() * X(70), Y(30) + rnd() * Y(26), 1, 1, '#fdf6e0');
  },

  traces(D) {
    const { R, bands, sun, ridge, mesa, small, silhouette, veil, cactus } = D;
    bands(SKY.dusk, 0, Y(46));
    sun(X(150), Y(40), 15, '#f8c060', '#fde8a0');
    mesa(X(18), Y(46), X(50), Y(12), '#5a2a34'); mesa(X(176), Y(46), X(36), Y(8), '#5a2a34');
    ridge('#7a3a34', Y(46), 6, 7, { rough: 0.5 });
    bands(['#b0583a', '#bc6440', '#c87048', '#d27c50', '#da8858'], Y(46), CH);
    D.pebbles(Y(48), CH, 160, ['#e8a070', '#8a3a24']);
    cactus(X(30), Y(90), 22); cactus(X(206), Y(104), 26);
    // les traces, de plus en plus grandes vers nous ; une fourche marquée dans chaque fer
    const SHOE = [
      '....dddddddd....',
      '..dddddddddddd..',
      '.ddlddddddddldd.',
      '.dd..........dd.',
      'ddd....f.....ddd',
      'dl...f.f.f....ld',
      'dd...f.f.f....dd',
      'dd...fffff....dd',
      'dl.....f......ld',
      'dd.....f......dd',
      'ddd....f.....ddd',
      '.dd..........dd.',
      '.dl..........ld.',
      '.ddd........ddd.',
      '..dd........dd..',
    ];
    const shoe = (x, y, s, flat) => {
      const col = { d: '#6e3020', l: '#9a4a2c', f: '#4a1810' };
      SHOE.forEach((row, j) => [...row].forEach((ch, i) => {
        if (ch === '.' || (s < 2 && ch === 'f')) return;
        R(x + (i - 8) * s, y + Math.round((j - 15) * s * flat), s, Math.max(1, Math.round(s * flat)), col[ch]);
      }));
    };
    [[118, 54, 0.5, 0.5], [110, 58, 0.5, 0.5], [122, 64, 1, 0.5], [106, 72, 1, 0.55], [126, 82, 2, 0.5], [98, 96, 2, 0.6], [138, 110, 3, 0.55], [86, 128, 4, 0.5]]
      .forEach(([x, y, s, f]) => (s < 1 ? R(X(x) - 3, Y(y) - 2, 6, 2, '#7a3424') : shoe(X(x), Y(y), s, f)));
    // les éclaireurs, au loin, dans leur poussière
    const sil = silhouette(horse(D, { gallop: true, rider: riderOf({ rifle: true }) }), '#3a1a24');
    small(sil, X(180), Y(47)); small(sil, X(194), Y(46)); small(sil, X(206), Y(47));
    veil('#f0a050', 0.18, X(150), Y(38), CW, 14);
    for (let k = 0; k < 12; k++) D.disc(X(170) - k * 5, Y(44) - (k % 2), 3 + (k % 3), '#c8784a');
  },

  comanches(D) {
    const { R, bands, sun, ridge, mesa, put, small, silhouette, grass } = D;
    bands(SKY.dusk, 0, Y(70));
    sun(X(48), Y(50), 20, '#f8c060', '#fde8a0');
    mesa(X(150), Y(66), X(60), Y(18), '#5a2a34');
    ridge('#6a3036', Y(64), 14, 9, { rough: 0.35 });
    // les cavaliers en contre-jour sur la crête (sabots posés sur son profil, pas dans le ciel)
    const sil = silhouette(horse(D, { rider: riderOf({ feathers: true }) }), '#2a1420');
    for (const [x, y, f] of [[18, 60, false], [38, 60.5, false], [60, 62, false], [84, 62, true], [196, 62, true], [212, 63, true]]) small(sil, X(x), Y(y), { flip: f });
    // le terrain devant
    ridge('#8a6a3a', Y(84), 9, 4, { rough: 0.6 });
    bands(GROUND.grass.map((c) => S.shade(c, -0.12)), Y(88), CH);
    grass(Y(86), CH, 150, ['#6a7030', '#a8a050', '#5a6028']);
    // un second guerrier, et le chef, plus près, sur son pinto, la lance levée
    put(horse(D, { coat: '#6a4028', mane: '#1a0f0a', rider: riderOf({ skin: '#ad7346', cloth: '#8a5a30', hair: '#14121a', feathers: true }) }), X(100), Y(112));
    const cx = X(150), cy = Y(122);
    for (let k = 0; k < 64; k++) R(cx + 16 - Math.round(k * 0.12), cy - 74 + k, 2, 1, '#6a4428');
    R(cx + 15, cy - 80, 3, 7, '#c8ced6'); R(cx + 16, cy - 64, 3, 4, '#c83828'); R(cx + 15, cy - 60, 2, 3, '#f4ecd8');
    const chief = horse(D, {
      coat: '#e8e0d0', mane: '#3a2a20',
      spots: [[-12, -23, 9, 7], [1, -20, 7, 6], [10, -32, 4, 6], [-15, -18, 4, 4]],
      rider: riderOf({ skin: '#ad7346', cloth: '#c8a070', hair: '#14121a', feathers: true }),
    });
    put(chief, cx, cy);
  },

  mine(D) {
    const { R, bands, sun, ridge, rock, sprite, put, pebbles, boulder } = D;
    bands(SKY.day.map((c) => S.mix(c, '#a89888', 0.3)), 0, Y(60));
    sun(X(196), Y(18), 12);
    // la colline
    ridge('#8a6a50', Y(40), 46, 6, { rough: 0.35 });
    ridge('#7a5a44', Y(70), 28, 11, { rough: 0.5 });
    bands(GROUND.stone, Y(92), CH);
    pebbles(Y(92), CH, 180, ['#c0a890', '#5a4a3a']);
    // l'entrée étayée
    const portal = sprite(60, 56, 30, 56, (P) => {
      P(-22, -48, 44, 48, '#120a08'); P(-18, -44, 36, 44, '#080404');
      P(-26, -52, 52, 6, '#7a4a24'); P(-26, -52, 52, 1, '#a8703c'); P(-26, -47, 52, 1, '#4a2a14');
      P(-26, -46, 6, 46, '#6a4428'); P(20, -46, 6, 46, '#6a4428'); P(-26, -46, 1, 46, '#8a5c38'); P(20, -46, 1, 46, '#8a5c38');
      P(-14, -40, 4, 30, '#1a0f0a'); P(4, -36, 4, 26, '#120a08'); // étais au fond
      P(-2, -46, 1, 6, '#5a5a5a'); P(-4, -40, 5, 6, '#3a3a40'); P(-3, -39, 3, 4, '#5a5040'); P(-4, -40, 5, 1, '#6a6a72'); // lanterne éteinte
    });
    put(portal, X(96), Y(100));
    // un panneau « DANGER » de travers
    const sign = sprite(22, 24, 11, 24, (P) => { P(-1, -24, 2, 24, '#6a4428'); P(-10, -24, 20, 10, '#d8c090'); P(-9, -23, 18, 1, '#f0e0b0'); P(-6, -20, 12, 1, '#a83a2a'); P(-4, -18, 8, 1, '#a83a2a'); });
    put(sign, X(130), Y(104));
    // rails et wagonnet renversé
    for (let k = 0; k < 14; k++) {
      const y = Y(100) + k * 4, sp = 10 + k * 3;
      R(X(96) - sp - 2, y, sp * 2 + 4, 2, '#5a3a20');
      R(X(96) - sp, y - 1, 2, 5, '#7a6a5a'); R(X(96) + sp - 2, y - 1, 2, 5, '#7a6a5a');
    }
    const cart = sprite(30, 22, 15, 20, (P) => {
      P(-14, -18, 28, 12, '#5a5a62'); P(-14, -18, 28, 2, '#8a8a92'); P(-12, -14, 24, 1, '#3a3a40');
      P(-10, -6, 6, 6, '#2a2a2e'); P(4, -6, 6, 6, '#2a2a2e'); P(-8, -4, 2, 2, '#6a6a72'); P(6, -4, 2, 2, '#6a6a72');
    });
    put(cart, X(170), Y(120));
    for (const [x, y] of [[154, 122], [150, 118], [160, 124], [146, 124]]) { R(X(x), Y(y), 4, 3, '#4a3a2a'); R(X(x) + 1, Y(y), 1, 1, '#f8d070'); }
    // pioche abandonnée
    for (let k = 0; k < 16; k++) R(X(40) + k, Y(118) - Math.round(k * 0.5), 2, 1, '#8a5a30');
    R(X(40) + 14, Y(118) - 12, 2, 8, '#6a6a72'); R(X(40) + 12, Y(118) - 12, 6, 2, '#8a8a92');
    rock(X(26), Y(116), 22, 14, '#7a6a5a'); boulder(X(196), Y(108), 30, 18, '#7a6a5a');
  },

  sherif(D) {
    const { R, bands, sun, ridge, sprite, put, cowboy, rnd } = D;
    bands(SKY.hot, 0, Y(60));
    sun(X(186), Y(18), 13);
    ridge('#b8906a', Y(60), 16, 4, { rough: 0.4 });
    bands(GROUND.sand, Y(60), Y(92));
    // la ville au loin : trois façades
    for (const [x, w, h] of [[150, 20, 14], [172, 14, 10], [188, 22, 16]]) { R(X(x), Y(60) - h, w, h, '#a07a5a'); R(X(x), Y(60) - h, w, 2, '#c09a78'); R(X(x) + 4, Y(60) - h + 5, 3, 3, '#5a3a2a'); }
    // le gué
    bands(['#5a8aa8', '#4a7a98', '#3e6a88'], Y(104), CH);
    R(0, Y(102), CW, 3, '#c8a870');
    for (let k = 0; k < 50; k++) R(Math.floor(rnd() * CW), Y(106) + Math.floor(rnd() * (CH - Y(106))), 4 + Math.floor(rnd() * 8), 1, '#9ac8e0');
    bands(['#c09060', '#b08050'], Y(92), Y(102));
    // la barrière du péage
    const bar = sprite(170, 34, 85, 34, (P) => {
      P(-78, -26, 4, 26, '#6a4428'); P(74, -26, 4, 26, '#6a4428');
      P(-82, -20, 164, 4, '#a83a2a'); for (let x = -76; x < 80; x += 16) P(x, -20, 8, 4, '#f4ecd8');
      P(-82, -20, 164, 1, '#d86050');
      P(48, -32, 26, 12, '#d8c090'); P(49, -31, 24, 1, '#f0e0b0'); P(52, -28, 16, 1, '#5a3418'); P(52, -26, 12, 1, '#5a3418'); P(52, -24, 14, 1, '#5a3418'); // panneau
    });
    put(bar, X(112), Y(100));
    // le shérif ventru et ses adjoints
    cowboy(look('deputy'), 'pompe', X(70), Y(100), { frame: 0, wa: -0.3 });
    cowboy(look('deputy2'), 'sniper', X(154), Y(100), { frame: 0, flip: true, wa: Math.PI + 0.3 });
    cowboy(look('sheriff'), 'forgeron', X(112), Y(104), { frame: 0 });
    // étoile tordue
    const sx = X(112) - 5, sy = Y(104) - 17;
    R(sx, sy, 3, 3, '#e0b040'); R(sx - 1, sy + 1, 5, 1, '#f8e08a'); R(sx + 3, sy - 2, 1, 2, '#e0b040');
  },

  caravane(D) {
    const { R, bands, sun, ridge, put, small, silhouette, veil, rnd } = D;
    bands(SKY.hot.map((c) => S.mix(c, '#c07050', 0.25)), 0, Y(64));
    sun(X(30), Y(22), 12);
    ridge('#b08060', Y(64), 12, 8, { rough: 0.4 });
    bands(GROUND.sand, Y(64), CH);
    D.pebbles(Y(66), CH, 120, ['#f0c890', '#a87040']);
    // fumée
    for (let k = 0; k < 18; k++) { const y = Y(62) - k * 5; D.disc(X(150) + Math.round(Math.sin(k * 0.7) * 8) + k * 3, y, 3 + Math.floor(k / 3), k % 2 ? '#8a8078' : '#a09890'); }
    // bandits au galop autour
    const bandit = silhouette(horse(D, { gallop: true, rider: riderOf({ rifle: true }) }), '#4a2a1e');
    small(bandit, X(24), Y(82)); small(bandit, X(48), Y(78)); small(bandit, X(200), Y(80), { flip: true }); small(bandit, X(184), Y(74), { flip: true });
    // les chariots en cercle
    const wagon = coveredWagon(D);
    put(wagon, X(90), Y(108)); put(wagon, X(158), Y(112), true);
    const w3 = coveredWagon(D, { canvas: '#d8ccb0' });
    put(w3, X(124), Y(94));
    // un bandit, tout près, au grand galop
    put(horse(D, { gallop: true, coat: '#3a2a20', mane: '#1a0f0a', rider: riderOf({ cloth: '#5a2a2a', hat: '#1a0f0a', rifle: true }) }), X(30), Y(122));
    // éclairs des coups de feu
    for (const [x, y] of [[38, 76], [186, 70], [112, 84], [140, 98], [46, 100]]) { R(X(x), Y(y), 4, 2, '#fdf6e0'); R(X(x) + 1, Y(y) - 1, 2, 4, '#f8d070'); }
    for (let k = 0; k < 40; k++) R(rnd() * CW, Y(96) + rnd() * (CH - Y(96)), 3, 1, '#e8c890');
    veil('#e8c090', 0.08, 0, Y(70), CW, CH);
  },

  serpent(D) {
    const { R, bands, moon, stars, ridge, sprite, put, glow, cactus, fire } = D;
    bands(SKY.night, 0, Y(70));
    stars(130, Y(64));
    moon(X(40), Y(18), 9, SKY.night[0]);
    ridge('#16142a', Y(70), 18, 2, { rough: 0.5 });
    bands(GROUND.night.map((c) => S.mix(c, '#4a3020', 0.3)), Y(70), CH);
    cactus(X(18), Y(84), 20);
    // le bivouac, au fond : feu mourant, selle et couverture
    const fx = X(176), fy = Y(88);
    glow(fx, fy, 54, '#f08030', 0.1);
    R(fx - 8, fy, 16, 2, '#3a1a10'); fire(fx - 1, fy + 1, 9);
    R(fx + 12, fy + 2, 40, 9, '#5a2a3a'); R(fx + 12, fy + 2, 40, 2, '#7a3a4a'); R(fx + 44, fy, 10, 7, '#d8c8a8');
    R(fx - 30, fy - 2, 12, 8, '#6a4428'); R(fx - 30, fy - 2, 12, 2, '#8a5c38');
    // la botte du blessé
    const boot = sprite(26, 26, 13, 26, (P) => {
      P(-6, -26, 10, 16, '#4a3a2a'); P(-8, -12, 12, 8, '#3a2414'); P(-8, -5, 20, 5, '#3a2414'); P(-8, -12, 12, 1, '#5a3a20');
      P(4, -5, 8, 1, '#5a3a20'); P(-8, -1, 20, 1, '#1a0e06'); P(-2, -9, 4, 2, '#c0c0c8'); // éperon
    });
    put(boot, X(56), Y(120));
    R(X(56) + 6, Y(120) - 14, 4, 2, '#c83828'); R(X(56) + 10, Y(120) - 15, 2, 1, '#c83828');
    // le crotale, lové, tête dressée, sonnette levée
    const snake = sprite(64, 44, 32, 40, (P) => {
      const body = '#a08a50', dark = '#5a4a2a', belly = '#d8c890';
      const ring = (cx, cy, rx, ry) => {
        for (let a = 0; a < 64; a++) {
          const t = (a / 64) * Math.PI * 2;
          P(cx + Math.round(Math.cos(t) * rx) - 3, cy + Math.round(Math.sin(t) * ry) - 3, 6, 6, a % 8 < 3 ? dark : body);
        }
      };
      ring(0, -8, 24, 7); ring(2, -14, 16, 5);
      for (let k = 0; k < 14; k++) P(8 - Math.round(k * 0.4), -18 - k, 6, 3, k % 4 < 2 ? body : dark); // cou dressé
      P(0, -38, 12, 7, body); P(1, -37, 10, 2, '#c0aa70'); P(9, -36, 2, 2, '#e0b040'); P(9, -36, 1, 1, OUT); // tête
      P(10, -31, 3, 1, belly); P(12, -32, 4, 1, '#c83828'); P(15, -33, 1, 1, '#c83828'); P(15, -31, 1, 1, '#c83828'); // langue
      for (let k = 0; k < 5; k++) P(-26 - k, -14 - k * 3, 4, 3, k % 2 ? '#e8dcb0' : '#c8b890'); // sonnette
    });
    put(snake, X(124), Y(122));
    for (const [x, y] of [[-34, -26], [-38, -22], [-32, -20]]) R(X(124) + x, Y(122) + y, 2, 1, '#e8dcb0'); // ça vibre
  },

  tempete(D) {
    const { R, bands, sun, mesa, cactus, cowboy, veil, rnd } = D;
    bands(SKY.storm, 0, Y(70));
    sun(X(30), Y(24), 9, '#e8c080', '#f0d8a0');
    mesa(X(20), Y(70), X(50), Y(14), '#8a5a3a');
    bands(['#b88050', '#a87444', '#9a683c', '#8a5c34'], Y(70), CH);
    cactus(X(40), Y(98), 24); cactus(X(14), Y(110), 16);
    // le mur de sable avance de la droite
    const x0 = X(70);
    for (let x = x0; x < CW; x++) {
      const t = (x - x0) / (CW - x0);
      const top = Math.round(Y(60) - t * Y(70) + Math.sin(x * 0.11) * 6 + Math.sin(x * 0.03) * 12);
      R(x, top, 1, CH - top, S.mix('#c89058', '#7a4a2a', Math.min(1, t * 1.2)));
      if (x % 3 === 0) R(x, top, 1, 3, '#e0b070');
    }
    for (let k = 0; k < 12; k++) D.disc(X(80) + k * 24, Y(56) - k * 9 + (k % 2) * 9, 14 + k, S.mix('#c89058', '#8a5430', k / 12));
    // la bande, courbée contre le vent
    cowboy(look('hero'), 'colts', X(92), Y(114), { frame: 1 });
    cowboy(look('pard'), 'pompe', X(70), Y(120), { frame: 3 });
    // rafales
    for (let k = 0; k < 120; k++) {
      const x = Math.floor(rnd() * CW), y = Math.floor(rnd() * CH), l = 6 + Math.floor(rnd() * 20);
      R(x, y, l, 1, rnd() < 0.5 ? '#f0d0a0' : '#d8a870');
    }
    veil('#c08048', 0.22);
  },

  train(D) {
    const { R, bands, sun, ridge, sprite, put, grass, disc } = D;
    bands(SKY.day, 0, Y(70));
    sun(X(40), Y(20), 12);
    ridge('#9aa8a0', Y(70), 12, 3, { rough: 0.35 });
    bands(GROUND.grass, Y(70), CH);
    grass(Y(72), CH, 120, ['#788838', '#c8c070']);
    // les poteaux du télégraphe
    for (let x = 6; x < CW; x += 70) { R(x, Y(70) - 22, 2, 22, '#6a4428'); R(x - 4, Y(70) - 20, 10, 1, '#6a4428'); }
    for (let x = 0; x < CW; x++) R(x, Y(70) - 19 + Math.round(Math.abs(Math.sin((x * Math.PI) / 70)) * 3), 1, 1, '#4a3a2a');
    // la voie
    const ty = Y(104);
    R(0, ty, CW, 3, '#5a3a20'); for (let x = 0; x < CW; x += 6) R(x, ty - 2, 3, 7, '#6a4428');
    R(0, ty - 3, CW, 2, '#8a8a92'); R(0, ty + 2, CW, 1, '#6a6a72');
    // fumée et vapeur
    for (let k = 0; k < 11; k++) disc(X(150) + 30 - k * 12, Y(18) + Math.round(Math.sin(k) * 4), 5 + k, k % 2 ? '#d8d4cc' : '#c4c0b8');
    // les wagons, dont le wagon postal cadenassé
    const car = sprite(76, 44, 38, 42, (P) => {
      P(-36, -40, 72, 4, '#3a2a1e'); P(-34, -36, 68, 26, '#2f4a5e'); P(-34, -36, 68, 2, '#4a6a80');
      for (let x = -30; x < 34; x += 8) P(x, -34, 1, 22, '#24384a');
      P(-10, -32, 20, 20, '#24384a'); P(-10, -32, 20, 1, '#5a7a90'); P(-2, -24, 4, 6, '#e0b040'); P(-1, -26, 2, 2, '#c0a040'); // porte + cadenas
      P(-26, -30, 10, 6, '#e8e0cc'); P(-24, -28, 6, 1, '#3a2a1e'); // « U.S. MAIL »
      P(-36, -10, 72, 4, '#2a2a2e');
      wheel(P, -22, -5, 5, '#5a5a62', '#2a2a2e'); wheel(P, 22, -5, 5, '#5a5a62', '#2a2a2e');
    });
    put(car, X(20), ty - 2); put(car, X(70), ty - 2);
    // la locomotive
    const loco = sprite(110, 64, 40, 62, (P) => {
      P(-38, -48, 30, 38, '#2a2a2e'); P(-38, -48, 30, 2, '#5a5a62'); P(-36, -54, 34, 6, '#3a2a1e'); // cabine
      P(-32, -42, 10, 10, '#f0c060'); P(-31, -41, 8, 1, '#fde8a0');
      P(-8, -38, 54, 20, '#3a3a40'); P(-8, -38, 54, 3, '#6a6a72'); P(-8, -22, 54, 2, '#1a1a1e'); // chaudière
      for (const x of [2, 18, 34]) P(x, -38, 2, 20, '#c0a040');
      P(28, -58, 10, 20, '#2a2a2e'); P(25, -62, 16, 5, '#2a2a2e'); P(25, -62, 16, 1, '#6a6a72'); // cheminée
      P(10, -44, 8, 6, '#c0a040'); P(11, -46, 6, 2, '#e0c060'); // dôme
      P(44, -36, 6, 6, '#f8e08a'); P(45, -35, 3, 3, '#fdf6e0'); // phare
      for (let k = 0; k < 10; k++) P(46 + k, -16 + k, 2, 16 - k, '#a83a2a'); // chasse-bestiaux
      P(-40, -18, 90, 4, '#a83a2a');
      wheel(P, -24, -8, 8, '#a83a2a', '#2a2a2e'); wheel(P, -4, -8, 8, '#a83a2a', '#2a2a2e'); wheel(P, 30, -5, 5, '#a83a2a', '#2a2a2e');
      P(-24, -10, 22, 2, '#8a8a92');
    });
    put(loco, X(150), ty - 2);
    // la vapeur qui fuit de la chaudière, le mécanicien qui se gratte la tête
    for (const [x, y, r] of [[150, 82, 6], [160, 78, 5], [142, 76, 4], [154, 72, 3]]) disc(X(x), Y(y), r, '#f4f0e8');
    D.cowboy(look('deputy2'), 'forgeron', X(198), Y(124), { flip: true });
  },

  chapelle(D) {
    const { R, bands, sun, mesa, cactus, sprite, put, pebbles, boulder } = D;
    bands(SKY.dusk, 0, Y(76));
    sun(X(176), Y(60), 18, '#f8c060', '#fde8a0');
    mesa(X(140), Y(76), X(80), Y(16), '#6a3040');
    bands(GROUND.red.map((c) => S.shade(c, -0.1)), Y(76), CH);
    pebbles(Y(78), CH, 140, ['#e8a070', '#7a3424']);
    // la mission : façade à clocher-mur, mur écroulé
    const church = sprite(120, 104, 60, 102, (P, sg) => {
      const a = '#d8b890', aL = '#ecd0a8', aD = '#b09070';
      // nef (à droite, en partie effondrée)
      P(10, -50, 46, 50, a); P(10, -50, 46, 2, aL);
      for (let x = 30; x < 56; x++) { const h = Math.round(Math.abs(Math.sin(x * 0.4)) * 8 + (x - 30) * 0.8); sg.clearRect(61 + x, 53, 1, h); }
      P(16, -40, 6, 12, '#2a1a20'); P(36, -38, 6, 12, '#2a1a20');
      // façade et clocher-mur
      P(-30, -60, 44, 60, a); P(-30, -60, 2, 60, aL); P(12, -60, 2, 60, aD);
      P(-26, -80, 36, 20, a); P(-20, -88, 24, 8, a); P(-12, -92, 8, 4, a);
      P(-10, -102, 4, 10, '#6a4428'); P(-14, -99, 12, 3, '#6a4428'); // croix
      P(-20, -78, 10, 14, '#2a1a20'); P(-2, -78, 10, 14, '#2a1a20'); // arches des cloches
      P(-18, -72, 6, 6, '#c0a040'); P(-18, -72, 6, 1, '#e0c060'); P(-15, -72, 1, 6, '#5a4010'); // cloche fêlée
      P(-16, -38, 16, 38, '#3a2418'); P(-14, -40, 12, 2, '#3a2418'); P(-8, -38, 1, 38, '#2a1a10'); // porte
      P(-24, -54, 6, 8, '#2a1a20'); P(4, -54, 6, 8, '#2a1a20');
      // fissures et briques à nu
      P(-28, -30, 1, 10, aD); P(-27, -22, 1, 6, aD); P(6, -46, 1, 12, aD);
      for (const [x, y] of [[-26, -12], [-22, -8], [2, -24], [8, -16], [-6, -64]]) P(x, y, 4, 2, '#a86a48');
    });
    put(church, X(96), Y(116));
    // le cimetière : croix de bois penchées
    for (const [x, y, t] of [[30, 112, 0], [44, 116, 1], [20, 120, -1], [168, 120, 1]]) {
      const cx = X(x), cy = Y(y);
      R(cx - 1 + t, cy - 14, 3, 14, OUT); R(cx + t, cy - 13, 1, 13, '#7a5a3a'); R(cx - 4 + t, cy - 10, 9, 3, OUT); R(cx - 3 + t, cy - 9, 7, 1, '#7a5a3a');
    }
    // gravats
    for (const [x, y] of [[148, 114], [156, 118], [142, 120], [164, 112], [136, 116]]) { R(X(x), Y(y), 6, 4, '#c8a880'); R(X(x), Y(y), 6, 1, '#e0c8a0'); }
    cactus(X(208), Y(114), 26); cactus(X(8), Y(104), 18);
    boulder(X(186), Y(104), 20, 10, '#8a4a3a');
  },

  deserteur(D) {
    const { R, bands, sun, mesa, boulder, sprite, put, cowboy, pebbles, cactus } = D;
    bands(SKY.hot, 0, Y(70));
    sun(X(60), Y(16), 17);
    mesa(X(150), Y(70), X(60), Y(16), '#c08a68'); mesa(X(4), Y(70), X(30), Y(10), '#b07a5c');
    bands(GROUND.sand, Y(70), CH);
    pebbles(Y(72), CH, 160, ['#f0c890', '#a87040']);
    for (let k = 0; k < 16; k++) R(20 + k * 24, Y(68) + (k % 2), 12, 1, '#f8e8c0'); // ondes de chaleur
    cactus(X(200), Y(104), 26); cactus(X(26), Y(96), 18);
    // le soldat, adossé à un rocher : uniforme bleu déchiré, képi, la main tendue
    const fx = X(116), fy = Y(118);
    boulder(fx + 4, fy + 2, 46, 30, '#a08068');
    const blue = '#2f4a5e', skin = '#eab78e';
    cowboy(look('soldier'), 'sniper', fx, fy);
    R(fx - 6, fy - 39, 12, 1, OUT); R(fx - 7, fy - 38, 1, 7, OUT); R(fx + 6, fy - 38, 1, 7, OUT); R(fx - 6, fy - 38, 12, 7, blue); R(fx - 6, fy - 38, 12, 1, '#4a6a80'); R(fx - 7, fy - 32, 14, 2, '#1a1a22'); R(fx - 1, fy - 36, 2, 2, '#e0b040'); // képi
    R(fx - 4, fy - 18, 2, 2, skin); R(fx + 3, fy - 15, 2, 2, skin); R(fx - 3, fy - 14, 3, 1, '#1e3040'); // accrocs
    R(fx - 9, fy - 21, 3, 1, '#e0b040'); R(fx + 6, fy - 21, 3, 1, '#e0b040'); // épaulettes
    R(fx - 21, fy - 21, 14, 6, OUT); R(fx - 20, fy - 20, 12, 4, blue); R(fx - 20, fy - 20, 12, 1, '#4a6a80'); R(fx - 26, fy - 21, 7, 6, OUT); R(fx - 25, fy - 20, 5, 4, skin); R(fx - 26, fy - 19, 1, 2, skin);
    // la gourde vide, renversée ; la selle de son cheval, plus loin ; les vautours attendent
    const canteen = sprite(16, 16, 8, 14, (P) => { P(-6, -12, 12, 12, '#7a8a6a'); P(-5, -11, 10, 1, '#9aaa88'); P(-6, -7, 12, 1, '#5a6a4a'); P(6, -9, 3, 3, '#5a3418'); });
    put(canteen, X(80), Y(124));
    R(X(80) + 10, Y(124) - 2, 6, 1, '#c09058'); R(X(80) + 16, Y(124) - 1, 4, 1, '#c8a068'); // dernières gouttes, bues par le sable
    const saddle = sprite(20, 10, 10, 10, (P) => { P(-10, -6, 20, 6, '#6a4428'); P(-10, -6, 20, 1, '#8a5c38'); P(-4, -10, 4, 4, '#5a3418'); });
    put(saddle, X(160), Y(122));
    for (const [x, y] of [[180, 40], [190, 34], [172, 30]]) { R(X(x), Y(y), 3, 1, '#3a2418'); R(X(x) - 3, Y(y) - 1, 3, 1, '#3a2418'); R(X(x) + 3, Y(y) - 1, 3, 1, '#3a2418'); }
  },

  ranch(D) {
    const { R, bands, sun, ridge, sprite, put, grass } = D;
    bands(SKY.day, 0, Y(64));
    sun(X(190), Y(16), 12);
    ridge('#8a9a70', Y(64), 18, 6, { rough: 0.35 });
    bands(GROUND.grass, Y(64), CH);
    grass(Y(66), CH, 170, ['#788838', '#c8c070', '#6a7a30']);
    // la grange au loin
    const barn = sprite(46, 34, 23, 34, (P) => {
      P(-20, -22, 40, 22, '#a83a2a'); P(-23, -24, 46, 3, '#5a3a2a'); P(-16, -32, 32, 8, '#a83a2a'); P(-18, -33, 36, 2, '#5a3a2a');
      P(-6, -16, 12, 16, '#6a2a1e'); P(-6, -16, 12, 1, '#f4ecd8'); P(-1, -16, 1, 16, '#f4ecd8'); P(-4, -28, 8, 4, '#3a2a1e');
    });
    put(barn, X(198), Y(66));
    // l'enclos
    const fence = sprite(CW, 18, 0, 18, (P) => {
      for (let x = 4; x < CW; x += 30) P(x, -18, 3, 18, '#6a4428');
      P(0, -15, CW, 2, '#8a5c38'); P(0, -8, CW, 2, '#8a5c38');
    });
    put(fence, 0, Y(82));
    // le troupeau
    put(longhorn(D), X(60), Y(102));
    put(longhorn(D, { coat: '#3a2a20', patch: '#6a5040' }), X(126), Y(104), true);
    put(longhorn(D, { coat: '#5a3a24', patch: '#a07050' }), X(28), Y(114), true);
    put(longhorn(D, { coat: '#c08048', patch: '#f0e6d0' }), X(96), Y(120));
    // l'éleveur à cheval, le lasso tournoyant
    const ranchero = horse(D, { coat: '#6a4028', mane: '#2a1810', blaze: true, rider: riderOf({ skin: '#c58a5c', cloth: '#b08a30', hat: '#d9c49a' }) });
    const rx = X(170), ry = Y(118);
    put(ranchero, rx, ry);
    for (let a = 0; a < 56; a++) {
      const t = (a / 56) * Math.PI * 2;
      R(rx + 8 + Math.round(Math.cos(t) * 20), ry - 68 + Math.round(Math.sin(t) * 6), 1, 1, '#d8c090');
    }
    for (let k = 0; k < 16; k++) R(rx + 5 + Math.round(k * 0.2), ry - 46 - k, 1, 1, '#d8c090');
  },
};

// ------------------------------------------------------------ la vignette d'un événement, en cache
// étalonnage : coins assombris par paliers tramés (vieille gravure), grain, pointe de chaleur
function grade(g) {
  const img = g.getImageData(0, 0, IW, IH), d = new Uint32Array(img.data.buffer), warm = P('#f0b060');
  for (let Y = 0; Y < IH; Y++) for (let X = 0; X < IW; X++) {
    const nx = X / IW * 2 - 1, ny = Y / IH * 2 - 1, v = nx * nx * 0.55 + ny * ny * 0.75;
    const k = -Math.floor(Math.max(0, v - 0.3) * 0.5 * 10 + bay(X, Y)) / 10 + (hsh(X, Y, 77) - 0.5) * 0.045;
    const i = Y * IW + X;
    d[i] = mixP(shadeP(d[i], k), warm, 0.04);
  }
  g.putImageData(img, 0, 0);
}
const cache = new Map();
export function eventArt(id) {
  if (cache.has(id)) return cache.get(id);
  const draw = SCENES[id];
  if (!draw) return null;
  const c = S.makeCanvas(IW, IH, true);
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  let seed = 7;
  for (const ch of id) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
  g.setTransform(K, 0, 0, K, 0, 0);
  draw(painter(g, seed));
  g.setTransform(1, 0, 0, 1, 0, 0);
  grade(g);
  cache.set(id, c);
  return c;
}
export const VIGNETTE_IDS = Object.keys(SCENES);
