// Outils des décors naturels du mode histoire (désert, Red Rock, canyon, rivière, Boot Hill, mine, Bouche de l'Enfer) :
// peinture au pixel dans un tampon (Pix), tramée (trame de Bayer 4×4 entre les teintes d'une palette), bruit de valeur,
// reliefs (buttes « chapeau + éboulis », chaînes lointaines, parois à strates et corniches), sol en perspective et
// petits sprites de végétation (saguaro, ocotillo, cholla, oponce, buissons, touffes, genévrier, peuplier, roseaux,
// arbre mort, cailloux). Tout est peint UNE fois, à la construction du décor (getSet de sets.js) : jamais par image.
// Lumière de la gauche (convention du projet) : faces gauches au soleil, faces droites dans une ombre froide.
import { rnd } from './kit.js';

// ---------------------------------------------------------------- couleurs (Uint32 de l'ImageData : 0xAABBGGRR)
export const hex = (c) => {
  const n = parseInt(c.replace('#', ''), 16);
  return ((255 << 24) | ((n & 255) << 16) | (n & 0xff00) | ((n >> 16) & 255)) >>> 0;
};
export const ramp = (s) => s.trim().split(/\s+/).map(hex);
export const mixc = (a, b, k) => {
  if (k <= 0) return a;
  if (k >= 1) return b;
  const r = (a & 255) + ((b & 255) - (a & 255)) * k, g = ((a >> 8) & 255) + (((b >> 8) & 255) - ((a >> 8) & 255)) * k;
  const bl = ((a >> 16) & 255) + (((b >> 16) & 255) - ((a >> 16) & 255)) * k;
  return ((255 << 24) | (Math.round(bl) << 16) | (Math.round(g) << 8) | Math.round(r)) >>> 0;
};
export const css = (u) => `#${[u & 255, (u >> 8) & 255, (u >> 16) & 255].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
export const OUTC = hex('#1a0f0a');

// ---------------------------------------------------------------- bruit et trame
export const hsh = (x, y, s = 0) => {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(s | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
export function vnoise(x, y, s = 0) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hsh(xi, yi, s), b = hsh(xi + 1, yi, s), c = hsh(xi, yi + 1, s), d = hsh(xi + 1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function fbm(x, y, s = 0, oct = 3) {
  let t = 0, amp = 0.5, f = 1, n = 0;
  for (let i = 0; i < oct; i++) { t += vnoise(x * f, y * f, s + i * 7919) * amp; n += amp; amp *= 0.5; f *= 2.03; }
  return t / n;
}
const BAY = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
export const bay = (x, y) => BAY[((y & 3) << 2) | (x & 3)];
// teinte d'une palette à un niveau fractionnaire l, tramée entre les deux voisines
export const pick = (Rm, l, x, y) => {
  const i = Math.floor(l + bay(x, y) - 0.5);
  return Rm[i < 0 ? 0 : i >= Rm.length ? Rm.length - 1 : i];
};

// ---------------------------------------------------------------- palettes
export const P = {
  // grès rouge : ombres froides (violet) → soleil (orange pâle)
  grès: ramp('24121c 341822 4a2026 622a2a 7a342c 943e2e a84a30 bc5a36 cc6c3e da8048 e6985a f0b478'),
  // grès des éboulis, plus sableux
  talus: ramp('2a1620 3e1e24 562828 70342c 8a422e a2522f b66236 c8743e d68a4c e2a060 ecb87a'),
  // sable rouge du sol
  sable: ramp('5a2a1e 703422 863e26 9c4a2a b05830 c0663a cc7444 d68450 e0965e e8a870'),
  // terre beige-brun (Boot Hill, mine, rivière)
  terre: ramp('3a2a22 4e3828 64462e 7a5636 90663e a47848 b68a56 c69c66 d4ae78 e0c08c'),
  // basalte et scories (volcan)
  basalte: ramp('0c0a0e 16121a 201820 2c2028 3a282e 4a3234 5c3e3a 704c42 86604e'),
  scorie: ramp('1a0c0c 2a1210 3e1a14 54221a 6a2c1e 803a24'),
  // granit (montagne de la mine)
  granit: ramp('1e1a1c 2e2626 40362f 534638 66573f 7c6a52 927f66 a8967e c0ae98'),
  // végétation
  cact: ramp('16221a 1e2e20 2a3e2a 385234 486840 5c7e4c 74965c 90ac6e'),
  sauge: ramp('2a2e22 3a4030 4c5440 606a4e 78805e 92987a acb092'),
  olive: ramp('1e2414 2a3418 38461e 4a5a26 5e6e30 788a3c 94a64e'),
  feuille: ramp('16240e 203414 2c4618 3a5a1e 4c7024 62862c 7c9e38 9ab44a c0cc68'),
  pin: ramp('0c1610 122018 182c1e 203826 2a4630 36563a'),
  herbe: ramp('4a3a1c 66502a 806838 9a8044 b4985a cab070 dcc888'),
  bois: ramp('241610 3a2416 523420 6a4428 84582f 9c6c3a b4844a'),
  mort: ramp('1e1814 2e2620 40362c 54483a 6a5c4a 82725e'),
  os: ramp('6a6050 8a8070 b4aa94 d8d0bc f2ecdc'),
  eau: ramp('10202e 18304a 22425e 2e5672 3c6a86 52829c 6e9cb4 92bccc b8d8e0'),
  or: ramp('5a3a0c 7a5212 a0701a c89428 e8b838 f8d870 fff0b0 fffbe8'),
};

// ---------------------------------------------------------------- tampon de pixels d'un canvas
export class Pix {
  constructor(g) {
    this.g = g;
    this.w = g.canvas.width; this.h = g.canvas.height;
    this.img = g.getImageData(0, 0, this.w, this.h);
    this.u = new Uint32Array(this.img.data.buffer);
  }
  set(x, y, c) { x |= 0; y |= 0; if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.u[y * this.w + x] = c; }
  get(x, y) { x |= 0; y |= 0; return x >= 0 && y >= 0 && x < this.w && y < this.h ? this.u[y * this.w + x] : 0; }
  rect(x, y, w, h, c) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c); }
  // assombrit (ou teinte) les pixels déjà peints : ombres portées
  shade(x, y, col, k) { const c = this.get(x, y); if (c >>> 24) this.set(x, y, mixc(c, col, k)); }
  // ombre portée elliptique au sol, décalée vers la droite (soleil à gauche)
  shadow(cx, cy, rx, ry, col = hex('#2a1418'), k = 0.35) {
    for (let y = -ry; y <= ry; y++) for (let x = -rx; x <= rx; x++) {
      if ((x * x) / (rx * rx) + (y * y) / (ry * ry) > 1) continue;
      if (bay(cx + x, cy + y) > 0.85 && (x * x) / (rx * rx) + (y * y) / (ry * ry) > 0.6) continue;
      this.shade(cx + x, cy + y, col, k);
    }
  }
  put() { this.g.putImageData(this.img, 0, 0); }
}

// petit sprite de pixels (contour automatique, collage avec brume de distance)
export class Spr {
  constructor(w, h, ox, oy) { this.w = w; this.h = h; this.ox = ox; this.oy = oy; this.px = new Uint32Array(w * h); }
  set(x, y, c) { x = Math.floor(x); y = Math.floor(y); if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.px[y * this.w + x] = c; }
  get(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h ? this.px[y * this.w + x] : 0; }
  rect(x, y, w, h, c) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c); }
  // trait épais (pinceau carré)
  line(x0, y0, x1, y1, c, th = 1) {
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
    for (let k = 0; k <= n; k++) {
      const x = x0 + ((x1 - x0) * k) / n, y = y0 + ((y1 - y0) * k) / n;
      for (let j = 0; j < th; j++) for (let i = 0; i < th; i++) this.set(x + i - (th >> 1), y + j - (th >> 1), typeof c === 'function' ? c(i, th) : c);
    }
  }
  // ellipse modelée (lumière en haut à gauche) ; boost éclaircit ; yMax coupe le bas
  ball(cx, cy, rx, ry, Rm, boost = 0, yMax = 1e9) {
    const n = Rm.length;
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry) && y < yMax; y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry, d = dx * dx + dy * dy;
        if (d > 1) continue;
        const l = (n - 1) * (0.62 - dx * 0.32 - dy * 0.3 - d * 0.12) + boost * n;
        this.set(x, y, pick(Rm, l, x, y));
      }
    }
  }
  // contour d'un pixel autour des pixels peints
  outline(c = OUTC) {
    const src = this.px.slice();
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      if (src[y * this.w + x]) continue;
      const on = (i, j) => i >= 0 && j >= 0 && i < this.w && j < this.h && src[j * this.w + i];
      if (on(x - 1, y) || on(x + 1, y) || on(x, y - 1) || on(x, y + 1)) this.px[y * this.w + x] = c;
    }
    return this;
  }
  flip() {
    for (let y = 0; y < this.h; y++) this.px.subarray(y * this.w, (y + 1) * this.w).reverse();
    this.ox = this.w - 1 - this.ox;
    return this;
  }
  // colle le sprite dans un tampon : (x, y) = point d'ancrage ; haze : mélange vers hcol (distance)
  blit(Pp, x, y, haze = 0, hcol = 0) {
    for (let j = 0; j < this.h; j++) for (let i = 0; i < this.w; i++) {
      const c = this.px[j * this.w + i];
      if (c) Pp.set(x - this.ox + i, y - this.oy + j, haze ? mixc(c, hcol, haze) : c);
    }
  }
}

// ---------------------------------------------------------------- reliefs
// Butte de Monument Valley : un chapeau de falaise (fissures, strates, corniche claire, face droite à l'ombre) posé
// sur un cône d'éboulis raviné. { cx, base, cw (largeur du chapeau), ch (sa hauteur), tw (demi-largeur des éboulis),
// th (leur hauteur), R (palette du chapeau), T (des éboulis), haze, hcol, seed, tops (x → décalage du sommet) }
export function butte(Pp, o) {
  const { cx, base, cw, ch, tw, th, R = P.grès, T = P.talus, haze = 0, hcol = 0, seed = 1 } = o;
  const col = (c) => (haze ? mixc(c, hcol, haze) : c);
  const n = R.length, nt = T.length;
  const half = cw / 2;
  const capBot = base - th + 2, capTop = capBot - ch;
  // les éboulis
  for (let x = Math.floor(cx - tw); x <= Math.ceil(cx + tw); x++) {
    const ax = Math.abs(x - cx);
    const t = Math.max(0, (ax - half + 1) / Math.max(1, tw - half));
    if (t >= 1) continue;
    const top = Math.round(base - th * Math.pow(1 - t, 1.7) + (vnoise(x / 4, 3, seed) - 0.5) * 2.4 * t);
    const left = x < cx - half * 0.3;
    for (let y = top; y < base; y++) {
      let l = left ? nt * 0.66 - t * 1.4 : nt * 0.3 + t * 0.6;
      l += (vnoise(x / 1.6, y / 7, seed + 3) - 0.5) * 2.6; // ravines
      if (!left && ax < half + 3) l -= 0.9; // ombre portée du chapeau
      if (y - top < 1) l += left ? 1.2 : 0.4;
      Pp.set(x, y, col(pick(T, l, x, y)));
    }
  }
  // le chapeau
  const tops = o.tops || ((x) => Math.round((vnoise(x / 3, 7, seed) - 0.5) * 3));
  for (let y = capTop - 6; y < capBot; y++) {
    const xl = Math.round(cx - half + (vnoise(1.5, y / 5, seed) - 0.5) * 3);
    const xr = Math.round(cx + half + (vnoise(4.5, y / 5, seed) - 0.5) * 3);
    for (let x = xl; x <= xr; x++) {
      const e = Math.min(x - xl, xr - x);
      const top = capTop + tops(x) + (e < 1 ? 2 : e < 2 ? 1 : 0);
      if (y < top) continue;
      const u = (x - xl) / Math.max(1, xr - xl);
      let l = u < 0.2 ? n * 0.86 : u < 0.68 ? n * 0.68 - (u - 0.2) * 2.2 : n * 0.24 - (u - 0.68) * 1.2;
      const s = Math.floor((y - capTop + (vnoise(x / 12, 0, seed) - 0.5) * 3) / 4);
      l += s % 3 === 0 ? -0.6 : s % 3 === 1 ? 0.35 : 0; // strates
      if (hsh(x, 0, seed) < 0.13 && vnoise(x, y / 6, seed + 9) > 0.35) l -= 1.3; // fissures verticales
      l -= Math.max(0, vnoise(x / 1.4, y / 22, seed + 5) - 0.62) * 5; // coulures de vernis du désert
      if (y - top < 1) l += 1.6; // la corniche au soleil
      else if (y - top < 2) l += 0.6;
      if (y > capBot - 2) l -= 0.8; // pied du chapeau, dans l'ombre
      Pp.set(x, y, col(pick(R, l, x, y)));
    }
  }
}

// Chaîne de montagnes ou de mesas lointaines : top(x) donne la crête ; faces tournées à gauche éclairées.
// { x0, x1, base, top, R, l0 (ton moyen), k (contraste des pentes), haze, hcol, seed, snow: y (neige au-dessus), S }
export function range(Pp, o) {
  const { x0 = 0, x1 = Pp.w, base, top, R, l0 = R.length * 0.5, k = 6, haze = 0, hcol = 0, seed = 1 } = o;
  const col = (c) => (haze ? mixc(c, hcol, haze) : c);
  for (let x = x0; x < x1; x++) {
    const t0 = Math.round(top(x));
    for (let y = t0; y < base; y++) {
      // pente locale de la surface (relief interne : crêtes secondaires en bruit)
      const h = (xx) => top(xx) - (fbm(xx / 9, y / 6, seed, 3) - 0.5) * 10 * Math.min(1, (y - t0) / 12);
      const slope = h(x + 1) - h(x - 1);
      let l = l0 + Math.max(-2.4, Math.min(2.4, -slope * k * 0.25)) + (vnoise(x / 3, y / 3, seed + 1) - 0.5) * 0.8;
      if (y - t0 < 1) l += 0.8;
      let c = pick(R, l, x, y);
      if (o.snow != null && y < o.snow(x) + (vnoise(x / 2, y, seed + 4) - 0.5) * 3 && o.S) c = pick(o.S, l - 1, x, y);
      Pp.set(x, y, col(c));
    }
  }
}

// Paroi à strates (canyon, falaise) : bandes horizontales ondulées, corniches (dessus clair, dessous sombre),
// cannelures verticales éclairées de la gauche, coulures sombres sous les corniches, liseré du rebord.
// { x0, x1, top(x), bot(x), R, lit (ton de base), band (épaisseur moyenne), haze, hcol, seed, warp }
export function wall(Pp, o) {
  const { x0 = 0, x1 = Pp.w, top, bot, R, lit = R.length * 0.55, band = 9, haze = 0, hcol = 0, seed = 1, warp = 5, flute = 4 } = o;
  const col = (c) => (haze ? mixc(c, hcol, haze) : c);
  // épaisseurs des bancs, irrégulières, et leur ton propre
  const bands = [];
  for (let y = -60, i = 0; y < 300; i++) { const hh = Math.round(band * (0.5 + hsh(i, 1, seed) * 1.1)); bands.push([y, hh, (hsh(i, 2, seed) - 0.5) * 3]); y += hh; }
  for (let x = x0; x < x1; x++) {
    const t0 = Math.round(top(x)), b0 = Math.round(bot(x));
    const wy = Math.sin(x / 47 + seed) * warp + (vnoise(x / 30, 0, seed) - 0.5) * warp;
    for (let y = t0; y < b0; y++) {
      const sy = y + wy;
      let bi = 0;
      while (bi < bands.length - 1 && bands[bi + 1][0] <= sy) bi++;
      const [by, bh, bt] = bands[bi];
      const f = sy - by;
      let l = lit + bt;
      if (f < 1) l += 2; // dessus de la corniche
      else if (f > bh - 2) l -= 1.8; // dessous, dans l'ombre
      // cannelures verticales : la pente du bruit en x fait la lumière
      const nf = (xx) => fbm(xx / 10, sy / 30, seed + 7, 2);
      l += (nf(x - 1) - nf(x + 1)) * flute * 1.6;
      l -= Math.max(0, vnoise(x / 1.5, (y - by) / 18, seed + bi) - 0.64) * 6; // coulures
      if (y - t0 < 1) l += 1.8;
      else if (y - t0 < 3) l += 0.7;
      if (o.fade) l -= (o.fade * (y - t0)) / 100; // le bas de la paroi s'enfonce dans l'ombre de la gorge
      if (o.edge) l += o.edge(x, y); // lumière propre (arête au soleil, recoin…)
      Pp.set(x, y, col(pick(R, l, x, y)));
    }
  }
}

// Sol en perspective : du ton lointain lf (à l'horizon y0, pâle) au ton proche ln (en bas), taches de bruit
// plus grandes au premier plan. { x0, x1, y0, y1, R, lf, ln, amp, seed }
export function ground(Pp, o) {
  const { x0 = 0, x1 = Pp.w, y0, y1 = Pp.h, R, lf, ln, amp = 1.6, seed = 1 } = o;
  for (let y = y0; y < y1; y++) {
    const d = (y - y0) / Math.max(1, y1 - y0);
    for (let x = x0; x < x1; x++) {
      const nz = fbm(x / (5 + 30 * d), y / (1.6 + 10 * d), seed, 3) - 0.5;
      const l = lf + (ln - lf) * Math.sqrt(d) + nz * amp * (0.5 + d);
      Pp.set(x, y, pick(R, l, x, y));
    }
  }
}

// Cailloux, gravillons et touffes semés au sol, plus gros au premier plan (soleil à gauche : point clair puis ombre)
export function pebbles(Pp, o) {
  const { x0 = 0, x1 = Pp.w, y0, y1 = Pp.h, n, R, seed = 1, grass = 0, G = P.herbe } = o;
  const r = rnd(seed);
  for (let i = 0; i < n; i++) {
    const d = r() ** 0.7, y = Math.round(y0 + d * (y1 - y0)), x = Math.round(x0 + r() * (x1 - x0));
    const big = r() < d * 0.5;
    if (grass && r() < grass) { // touffe d'herbe sèche
      const hh = 1 + Math.round(d * 4 * (0.6 + r()));
      for (let k = -1; k <= 1; k++) for (let j = 0; j < hh - Math.abs(k); j++) Pp.set(x + k * (1 + (j >> 1)), y - j, pick(G, 3 + j * 0.6 - k * 0.4, x + k, y - j));
      continue;
    }
    const base = Pp.get(x, y);
    if (!(base >>> 24)) continue;
    const w = big ? 2 + Math.round(d * 3) : 1, lt = pick(R, R.length - 1 - r() * 2, x, y);
    for (let k = 0; k < w; k++) { Pp.set(x + k, y, k === 0 ? lt : pick(R, R.length * 0.6, x + k, y)); if (w > 2) Pp.set(x + k, y - 1, k < w - 1 ? lt : pick(R, R.length * 0.5, x + k, y)); }
    Pp.set(x + w, y, mixc(base, hex('#1e0e10'), 0.45)); // l'ombre
    if (w > 2) Pp.set(x + w, y + 1, mixc(base, hex('#1e0e10'), 0.3));
  }
}

// Ornière (piste) : deux traces sombres qui suivent path(x) → y, avec un liseré clair
export function ruts(Pp, x0, x1, path, gap, R, l = 2) {
  for (let x = x0; x < x1; x++) {
    const y = Math.round(path(x));
    for (const dy of [0, gap(y)]) {
      Pp.set(x, y + dy, pick(R, l, x, y + dy));
      Pp.set(x, y + dy + 1, pick(R, l + 2.4, x, y + dy + 1));
    }
  }
}

// ---------------------------------------------------------------- végétation (sprites)
// Saguaro gris-vert à côtes : h (hauteur), seed ; contour out (null : aucun, pour le lointain)
export function saguaro(h, seed, out = OUTC, R = P.cact) {
  const r = rnd(seed * 13 + 1);
  const tw = h > 44 ? 6 : h > 30 ? 5 : h > 18 ? 4 : 3, w = tw + 22, s = new Spr(w, h + 3, w >> 1, h + 1);
  const n = R.length;
  const stem = (x0, y0, y1, ww) => {
    for (let y = y0; y <= y1; y++) for (let k = 0; k < ww; k++) {
      if (y === y0 && ww > 2 && (k === 0 || k === ww - 1)) continue;
      let l = n - 1.4 - (k / Math.max(1, ww - 1)) * (n - 2.2);
      if (ww >= 4 && k % 2 === 1) l -= 0.7; // côtes
      s.set(x0 + k, y, pick(R, l, x0 + k, y));
    }
  };
  const cx = (w >> 1) - (tw >> 1);
  stem(cx, 1, h, tw);
  const aw = Math.max(2, tw - 1);
  const arms = h < 14 ? 0 : 1 + Math.floor(r() * 2.6);
  for (let a = 0; a < arms; a++) {
    const side = a % 2 === 0 ? (r() < 0.5 ? -1 : 1) : 0;
    const sd = side || (a === 1 ? 1 : -1);
    const ya = Math.round(h * (0.38 + r() * 0.25)), up = Math.round(h * (0.18 + r() * 0.22)), reach = 2 + Math.round(r() * tw * 0.8);
    const ax = sd < 0 ? cx - reach - aw : cx + tw + reach;
    for (let k = 0; k < reach + 1; k++) stem(sd < 0 ? cx - 1 - k : cx + tw + k - 1, ya, ya + aw - 1, 1); // le coude
    stem(ax, ya - up, ya + aw - 1, aw);
  }
  if (h > 20 && r() < 0.4) s.set(cx + 1, 1, hex('#f4ecd8')); // une fleur blanche
  return out ? s.outline(out) : s;
}
// Ocotillo : un bouquet de longues tiges en fouet piquetées de feuilles, bouts rouges
export function ocotillo(h, seed, out = null) {
  const r = rnd(seed * 7 + 3), w = Math.round(h * 0.9) + 4, s = new Spr(w, h + 2, w >> 1, h + 1);
  const n = 6 + Math.floor(r() * 5);
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (i / (n - 1) - 0.5) * 1.1 + (r() - 0.5) * 0.15, len = h * (0.7 + r() * 0.3), bend = (r() - 0.5) * 0.3;
    let x = w >> 1, y = h;
    for (let k = 0; k < len; k++) {
      const aa = a + bend * (k / len);
      x += Math.cos(aa); y += Math.sin(aa);
      s.set(x, y, k % 3 === 0 ? P.olive[4 + (i % 2)] : P.mort[2 + (k % 2)]);
      if (k % 3 === 1 && k > 3) s.set(x + (i % 2 ? 1 : -1), y, P.olive[5]);
    }
    s.set(x, y, hex('#e0503a')); s.set(x, y - 1, hex('#f07848'));
  }
  return out ? s.outline(out) : s;
}
// Cholla : petit tronc sombre, rameaux d'épines pâles qui s'allument en contre-jour
export function cholla(h, seed, out = OUTC) {
  const r = rnd(seed * 5 + 11), w = Math.round(h * 1.3) + 4, s = new Spr(w, h + 2, w >> 1, h + 1);
  const F = ramp('5a5a34 7e7a48 a8a062 cac482 e4dea8 f8f4d0');
  const cx = w >> 1, fork = Math.round(h * 0.55);
  s.rect(cx - 1, fork, 2, h - fork + 1, P.mort[1]);
  // rameaux : segments courts qui partent du tronc puis remontent, hérissés d'épines
  const arms = 3 + Math.floor(r() * 3);
  for (let i = 0; i < arms; i++) {
    const a = -Math.PI / 2 + (i / (arms - 1) - 0.5) * 1.6 + (r() - 0.5) * 0.3, len = h * (0.35 + r() * 0.25);
    let x = cx, y = fork;
    for (let k = 0; k < len; k++) {
      x += Math.cos(k > len / 2 ? (a - -Math.PI / 2) * 0.3 - Math.PI / 2 : a); y += Math.sin(a);
      for (let j = 0; j < 3; j++) {
        const dx = Math.round((r() - 0.5) * 3), dy = Math.round((r() - 0.5) * 3);
        s.set(x + dx, y + dy, pick(F, 2.6 - dx * 0.8 - dy * 0.5 + r(), Math.round(x + dx), Math.round(y + dy)));
      }
      s.set(x, y, F[1]);
    }
  }
  return out ? s.outline(hex('#3a3420')) : s;
}
// Oponce (figuier de Barbarie) : raquettes ovales, quelques fleurs ou fruits pourpres
export function pear(size, seed, out = OUTC) {
  const r = rnd(seed * 3 + 5), w = size * 4 + 6, h = size * 3 + 3, s = new Spr(w, h, w >> 1, h - 1);
  s.ball(w / 2, h - size - 1, size * 0.9, size * 1.1, P.cact, 0.05, h - 1);
  const k = 2 + Math.floor(r() * 3);
  for (let i = 0; i < k; i++) {
    const x = w / 2 + (r() - 0.5) * size * 2.4, y = h - size * 1.9 - r() * size * 0.6;
    s.ball(x, y, size * 0.75, size * 0.95, P.cact, 0.12, h - 1);
    if (r() < 0.5) s.set(x, y - size, hex(r() < 0.5 ? '#c03a6a' : '#e8c040'));
  }
  return out ? s.outline(out) : s;
}
// Buisson (créosote, armoise…) : grappe de boules
export function bush(size, seed, R = P.sauge, out = null) {
  const r = rnd(seed * 17 + 2), w = size * 4 + 4, h = size * 2 + 4, s = new Spr(w, h, w >> 1, h - 2);
  const n = 2 + Math.floor(r() * 3) + (size > 3 ? 2 : 0);
  for (let k = 0; k < n; k++) s.ball(w / 2 + (r() - 0.5) * size * 2.4, h - 2 - size * (0.6 + r() * 0.5), size * (0.55 + r() * 0.45), size * (0.45 + r() * 0.35), R, k / n * 0.2 - 0.08, h - 1);
  return out ? s.outline(out) : s;
}
// Touffe d'herbe sèche ou de yucca : brins rayonnants
export function tuft(h, seed, R = P.herbe, out = null, spiky = false) {
  const r = rnd(seed * 23 + 9), w = Math.round(h * 1.6) + 4, s = new Spr(w, h + 2, w >> 1, h + 1);
  const n = spiky ? 9 + Math.floor(r() * 5) : 5 + Math.floor(h * 0.8);
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (i / (n - 1) - 0.5) * (spiky ? 2.4 : 1.8) + (r() - 0.5) * 0.3, len = h * (0.55 + r() * 0.45);
    for (let k = 0; k < len; k++) {
      const x = (w >> 1) + Math.cos(a) * k + (spiky ? 0 : Math.sin(k / 3 + i) * 0.4), y = h + Math.sin(a) * k;
      s.set(x, y, pick(R, 1.5 + (k / len) * (R.length - 2) - (Math.cos(a) > 0 ? 0.8 : 0), Math.round(x), Math.round(y)));
    }
  }
  return out ? s.outline(out) : s;
}
// Genévrier : boule vert sombre irrégulière, tronc tordu
export function juniper(size, seed, out = OUTC) {
  const r = rnd(seed * 29 + 4), w = size * 4 + 6, h = size * 4 + 4, s = new Spr(w, h, w >> 1, h - 1);
  s.line(w / 2, h - 1, w / 2 + (r() - 0.5) * 3, h - size * 1.5, P.mort[2], 2);
  for (let k = 0; k < 5 + size; k++) s.ball(w / 2 + (r() - 0.5) * size * 2.2, h - size * 1.6 - r() * size * 1.6, size * (0.45 + r() * 0.35), size * (0.4 + r() * 0.3), P.pin, 0.08, h - 2);
  return out ? s.outline(out) : s;
}
// Peuplier (cottonwood) des rives : tronc clair ramifié, houppier de feuillage vert-jaune
export function cottonwood(h, seed, out = OUTC, R = P.feuille) {
  const r = rnd(seed * 31 + 7), w = Math.round(h * 1.3) + 6, s = new Spr(w, h + 2, w >> 1, h + 1);
  const cx = w >> 1, th = Math.max(2, Math.round(h / 12));
  // tronc court qui se divise en grosses branches
  s.line(cx, h, cx + (r() - 0.5) * 3, h * 0.7, P.mort[4], th + 1);
  for (let k = 0; k < 3; k++) s.line(cx, h * 0.72, cx + (k - 1) * h * 0.3 + (r() - 0.5) * 4, h * 0.38, P.mort[3 + (k === 0 ? 1 : 0)], Math.max(1, th - 1));
  // houppier large et bosselé : des touffes en dôme, plus sombres dessous
  const n = 12 + Math.floor(h / 3);
  for (let k = 0; k < n; k++) {
    const u = r() * 2 - 1, v = r();
    const bx = cx + u * h * 0.46, by = h * 0.58 - v * h * 0.42 * Math.sqrt(1 - u * u * 0.6) - h * 0.05;
    s.ball(bx, by, h * (0.1 + r() * 0.07), h * (0.08 + r() * 0.05), R, (0.5 - by / h) * 0.25 - 0.05, h * 0.72);
  }
  // trouées de lumière et feuilles claires au soleil
  for (let k = 0; k < h; k++) { const x = cx - h * 0.4 + r() * h * 0.5, y = h * 0.15 + r() * h * 0.3; if (s.get(Math.round(x), Math.round(y))) s.set(x, y, R[R.length - 1]); }
  return out ? s.outline(out) : s;
}
// Arbre mort : branches tordues récursives
export function deadTree(h, seed, out = OUTC, R = P.mort) {
  const r = rnd(seed * 37 + 1), w = Math.round(h * 1.1) + 6, s = new Spr(w, h + 2, w >> 1, h + 1);
  const br = (x, y, a, len, th, d) => {
    const x1 = x + Math.cos(a) * len, y1 = y + Math.sin(a) * len;
    s.line(x, y, x1, y1, (i, t) => R[Math.max(0, Math.min(R.length - 1, 3 + (i === 0 ? 1 : 0) - (i === t - 1 && t > 1 ? 1 : 0)))], th);
    if (d > 0) {
      br(x1, y1, a - 0.3 - r() * 0.5, len * (0.6 + r() * 0.15), Math.max(1, th - 1), d - 1);
      if (r() < 0.85) br(x1, y1, a + 0.3 + r() * 0.5, len * (0.55 + r() * 0.15), Math.max(1, th - 1), d - 1);
    }
  };
  br(w >> 1, h, -Math.PI / 2 + (r() - 0.5) * 0.3, h * 0.38, Math.max(2, Math.round(h / 12)), 4);
  return out ? s.outline(out) : s;
}
// Roseaux et massettes
export function reeds(h, seed, out = null) {
  const r = rnd(seed * 41 + 6), w = Math.round(h * 0.8) + 4, s = new Spr(w, h + 2, w >> 1, h + 1);
  const n = 6 + Math.floor(h / 2);
  for (let i = 0; i < n; i++) {
    const x0 = (w >> 1) + (r() - 0.5) * h * 0.6, len = h * (0.5 + r() * 0.5), lean = (r() - 0.5) * 0.4;
    for (let k = 0; k < len; k++) s.set(x0 + lean * k, h - k, pick(P.olive, 2 + (k / len) * 4 - (i % 2), Math.round(x0), k));
    if (r() < 0.35) { const tx = x0 + lean * len, ty = h - len; s.rect(Math.round(tx), Math.round(ty), 1, 3, hex('#5a3a22')); }
  }
  return out ? s.outline(out) : s;
}
// Rocher modelé
export function boulder(size, seed, R = P.grès, out = OUTC) {
  const r = rnd(seed * 43 + 8), rx = size * (0.9 + r() * 0.4), ry = size * (0.6 + r() * 0.25);
  const w = Math.ceil(rx * 2.6 + 6), h = Math.ceil(ry * 2 + 5), s = new Spr(w, h, w >> 1, h - 2);
  const cx = w / 2, cy = h - 2 - ry;
  s.ball(cx, cy, rx, ry, R, 0.05, h - 1);
  if (r() < 0.7) s.ball(cx + (r() < 0.5 ? -1 : 1) * rx * 0.75, cy + ry * 0.35, rx * 0.55, ry * 0.65, R, -0.08, h - 1);
  for (let k = 0; k < size; k++) s.set(cx + (r() - 0.5) * rx, cy + (r() - 0.2) * ry, R[1]); // fissures
  return out ? s.outline(out) : s;
}
// Crâne de bœuf blanchi
export function skull() {
  const s = new Spr(19, 9, 9, 8), B = P.os;
  s.rect(6, 2, 7, 5, B[3]); s.rect(7, 7, 5, 1, B[2]); s.rect(6, 2, 7, 1, B[4]);
  s.rect(7, 4, 2, 2, OUTC); s.rect(10, 4, 2, 2, OUTC); s.set(9, 6, B[1]);
  for (const [x, y] of [[5, 2], [4, 1], [3, 1], [2, 0], [13, 2], [14, 1], [15, 1], [16, 0]]) s.set(x, y, B[3]);
  return s.outline(OUTC);
}

// ---------------------------------------------------------------- semis
// Sème des sprites entre y0 et y1 (perspective : taille et brume selon la profondeur) ; make(d, seed) → sprite
export function sow(Pp, { x0 = 0, x1 = Pp.w, y0, y1, n, seed = 1, make, haze = 0, hcol = 0, avoid = null }) {
  const r = rnd(seed), items = [];
  for (let i = 0; i < n; i++) {
    const d = r(), y = Math.round(y0 + d * (y1 - y0)), x = Math.round(x0 + r() * (x1 - x0));
    if (avoid && avoid(x, y)) continue;
    items.push([y, x, d, Math.floor(r() * 1e6)]);
  }
  items.sort((a, b) => a[0] - b[0]);
  for (const [y, x, d, s] of items) { const sp = make(d, s, x, y); if (sp) sp.blit(Pp, x, y, haze * (1 - d), hcol); }
}
