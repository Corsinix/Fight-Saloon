// Atelier de sprites isométriques (losanges de 32 × 16 pixels du jeu), commun à tous les jeux en vue isométrique.
// Tout est dessiné en code, une seule fois, dans un tampon de pixels (Pix) puis mis en cache : pas d'image à fichier,
// pas de lissage, pas de dégradé ni de lecture de pixels à chaque image.
//
// Le principe : un volume est un champ de hauteur z(u, v) posé sur un rectangle du sol (u le long de l'axe x de la
// carte, qui descend vers la droite de l'écran ; v le long de l'axe y, qui descend vers la gauche ; 16 unités par
// case). Chaque colonne de pixels de l'écran est parcourue de l'avant vers l'arrière : le premier échantillon qui
// dépasse ce qui est déjà dessiné donne la couleur (dessus, face gauche ou face droite) par une fonction de matière
// col(u, v, z, face). Boîtes, toits à deux ou quatre pans, cônes, cylindres, dalles en surplomb (auvents) : tout passe
// par là, au pixel près (pentes 2:1 propres), et les volumes d'un sprite se dessinent de l'arrière vers l'avant.
// Finitions : lumière d'en haut à gauche (face gauche claire, face droite sombre), contour d'un pixel #1a0f0a,
// ombre portée en losange au sol.
import * as S from './sprites.js';

export const TW = 32, TH = 16; // une case : 32 × 16 pixels
export const U = 16; // unités par case le long de u et de v

// ------------------------------------------------------------ couleurs (entiers 0xAABBGGRR, ordre des octets RGBA)
export const pack = (r, g, b, a = 255) => ((a << 24) | (b << 16) | (g << 8) | r) >>> 0;
const HEX = new Map();
export function hex(h) {
  let v = HEX.get(h);
  if (v === undefined) {
    const s = h[0] === '#' ? h.slice(1) : h;
    const n = parseInt(s.length === 3 ? s.replace(/./g, '$&$&') : s, 16);
    v = pack(n >> 16, (n >> 8) & 255, n & 255);
    HEX.set(h, v);
  }
  return v;
}
export const OUTC = hex('1a0f0a');
const ch = (p, s) => (p >>> s) & 255;
// assombrir (k < 0) ou éclaircir (k > 0) une couleur ; k de -1 à 1
export function tone(p, k) {
  const f = (c) => Math.max(0, Math.min(255, Math.round(k < 0 ? c * (1 + k) : c + (255 - c) * k)));
  return pack(f(ch(p, 0)), f(ch(p, 8)), f(ch(p, 16)), ch(p, 24));
}
export function blend(p, q, t) {
  const c = (s) => Math.round(ch(p, s) + (ch(q, s) - ch(p, s)) * t);
  return pack(c(0), c(8), c(16), 255);
}
// rampe de tons d'une couleur (pour le tramage) : de l'ombre à la lumière
export const ramp = (h, n = 5, span = 0.5) => Array.from({ length: n }, (_, i) => tone(hex(h), -span + (2 * span * i) / (n - 1)));

// bruit et tramage ordonné (déterministes)
export const hsh = (x, y, s = 0) => {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(s | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
const BAY = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
export const bay = (x, y) => BAY[((y & 3) << 2) | (x & 3)];
// couleur d'une rampe selon un niveau 0..1, tramée
export const dither = (R, l, x, y) => R[Math.max(0, Math.min(R.length - 1, Math.floor(l * (R.length - 1) + bay(x, y))))];

// ------------------------------------------------------------ tampon de pixels
export class Pix {
  constructor(w, h) {
    this.w = w; this.h = h;
    this.d = new Uint32Array(w * h);
  }
  set(x, y, c) { if (x >= 0 && y >= 0 && x < this.w && y < this.h && c) this.d[y * this.w + x] = c; }
  get(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h ? this.d[y * this.w + x] : 0; }
  rect(x, y, w, h, c) { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.set(i, j, c); }
  // contour d'un pixel autour de tout ce qui est opaque (sauf where(x, y) faux)
  outline(c = OUTC) {
    const { w, h, d } = this, src = d.slice();
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (src[y * w + x]) continue;
      if ((x > 0 && src[y * w + x - 1]) || (x < w - 1 && src[y * w + x + 1]) || (y > 0 && src[(y - 1) * w + x]) || (y < h - 1 && src[(y + 1) * w + x])) d[y * w + x] = c;
    }
    return this;
  }
  canvas() {
    const c = S.makeCanvas(this.w, this.h);
    const g = c.getContext('2d');
    const img = g.createImageData(this.w, this.h);
    new Uint32Array(img.data.buffer).set(this.d);
    g.putImageData(img, 0, 0);
    return c;
  }
}

// ------------------------------------------------------------ le losange d'un rectangle du sol
// Pour un rectangle de du × dv unités (pairs), colonne x de 0 à du + dv - 1 : rangée du haut et du bas (incluses),
// mesurées depuis le haut de la boîte englobante. Le coin du haut est en x = dv, le bas en x = du.
export const dTop = (x, du, dv) => (x < dv ? (dv >> 1) - 1 - (x >> 1) : (x - dv) >> 1);
export const dBot = (x, du, dv) => (x < du ? (dv >> 1) + (x >> 1) : ((du + dv) >> 1) - 1 - ((x - du) >> 1));

// losange plein (case du sol, ombre portée) dont la boîte englobante commence en (ox, oy)
export function diamond(px, ox, oy, du, dv, col) {
  for (let x = 0; x < du + dv; x++) {
    const t = dTop(x, du, dv), b = dBot(x, du, dv);
    for (let y = t; y <= b; y++) px.set(ox + x, oy + y, typeof col === 'function' ? col(x, y) : col);
  }
}

// ------------------------------------------------------------ le volume (champ de hauteur), en pixels fins
// Le sprite d'une emprise de a × b cases fait (a + b) × 16 pixels du jeu de large ; son sol est à la hauteur H (marge
// pour ce qui dépasse en haut). Il est rastérisé à K pixels fins par pixel du jeu (comme les combats de La piste) :
// pentes 2:1 lisses, contour d'un pixel fin, matières (planches, briques, toits) détaillées au pixel fin.
// Les recettes restent écrites en unités de base (16 par case), façade sur la face +v : un volume posé en (u0, v0) de
// du × dv unités, de z0 (bas) à z(u, v) (haut). Le sprite peut être tourné (rot 0 à 3, quarts de tour) : la recette
// est la même, le sprite la montre de face (0), de côté (1, 3) ou de dos (2). Un tampon de profondeur (u + v à l'écran)
// garde devant ce qui est devant : l'ordre de dessin des volumes et des détails ne compte plus.
// col(u, v, z, face, s, U, V, Z, rf, SU, SV) :
//   u, v, z : coordonnées locales dans la recette (unités de base, entières) ; U, V, Z : les mêmes en pixels fins ;
//   face : face à l'écran (0 dessus, 1 gauche éclairée, 2 droite à l'ombre), pour l'éclairage ;
//   s : pente du dessus (-1 vers l'arrière, 0 plat, 1 vers l'avant) ;
//   rf : face dans la recette (0 : +v, la façade ; 1 : +u ; 2 : -v, le dos ; 3 : -u) ;
//   SU, SV : position à l'écran dans la boîte du volume (pixels fins), pour les dégradés des cylindres.
export const K = 2; // pixels fins par pixel du jeu
// face de la recette montrée à gauche et à droite de l'écran, selon la rotation
const RF = [[0, 1], [1, 2], [2, 3], [3, 0]];
export class Sprite {
  constructor(a, b, H = 48, pad = 2, k = K, rot = 0) {
    this.rot = rot & 3; this.k = k; this.H = H; this.pad = pad;
    this.RA = a * 16; this.RB = b * 16; // étendue de la recette
    const odd = this.rot & 1;
    this.a = odd ? b : a; this.b = odd ? a : b; // emprise à l'écran
    this.px = new Pix(((this.a + this.b) * 16 + pad * 2) * k, ((this.a + this.b) * 8 + H + pad) * k);
    this.mask = new Uint8Array(this.px.w * this.px.h); // pixels posés par le volume en cours
    this.zb = new Float32Array(this.px.w * this.px.h).fill(-1e9); // profondeur (u + v à l'écran)
  }
  // recette -> écran (unités de base) et retour
  toS(u, v) {
    switch (this.rot) {
      case 1: return [this.RB - v, u];
      case 2: return [this.RA - u, this.RB - v];
      case 3: return [v, this.RA - u];
      default: return [u, v];
    }
  }
  toR(us, vs) {
    switch (this.rot) {
      case 1: return [vs, this.RB - us];
      case 2: return [this.RA - us, this.RB - vs];
      case 3: return [this.RA - vs, us];
      default: return [us, vs];
    }
  }
  // écran (pixels fins du sprite) d'un point (u, v, z) de la recette ; depth : sa profondeur
  sx(u, v) { const [us, vs] = this.toS(u, v); return (this.b * 16 + us - vs + this.pad) * this.k; }
  sy(u, v, z) { const [us, vs] = this.toS(u, v); return ((us + vs) / 2 + this.H - z) * this.k; }
  depth(u, v) { const [us, vs] = this.toS(u, v); return us + vs; }
  // un mur de la recette ('L' : façade +v, 'R' : côté +u) est-il tourné vers nous ?
  faces(wall) { const f = wall === 'L' ? 0 : 1; return RF[this.rot][0] === f || RF[this.rot][1] === f; }
  // poser un pixel fin s'il est devant ce qui est déjà là
  put(x, y, c, d = 1e9) {
    x = Math.round(x); y = Math.round(y);
    if (!c || x < 0 || y < 0 || x >= this.px.w || y >= this.px.h) return;
    const q = y * this.px.w + x;
    if (d >= this.zb[q] - 0.02) { this.px.d[q] = c; this.zb[q] = d; }
  }

  // Même rastérisation, interruptible pour les grands reliefs de la carte.
  *volSteps(u0, v0, du, dv, zf, col, z0 = 0) {
    for (let x = 0; x < this.px.w; x += 8) {
      this.vol(u0, v0, du, dv, zf, col, z0, x, x + 8);
      yield;
    }
    return this;
  }

  vol(u0, v0, du, dv, zf, col, z0 = 0, xStart = 0, xEnd = this.px.w) {
    const k = this.k, px = this.px, W = px.w, Hh = px.h, mask = this.mask, zb = this.zb;
    const zfn = typeof zf === 'function' ? zf : () => zf;
    // le rectangle de la recette, à l'écran
    const [p0, q0] = this.toS(u0, v0), [p1, q1] = this.toS(u0 + du, v0 + dv);
    const su0 = Math.min(p0, p1), sv0 = Math.min(q0, q1), sdu = Math.abs(p1 - p0), sdv = Math.abs(q1 - q0);
    const inside = (u, v) => u >= su0 && v >= sv0 && u < su0 + sdu && v < sv0 + sdv;
    const zAt = (u, v) => { if (!inside(u, v)) return -1e9; const [ur, vr] = this.toR(u, v); return zfn(ur - u0, vr - v0); };
    if (xStart === 0) mask.fill(0);
    const ox = (this.b * 16 + this.pad) * k, st = 1 / k, e = 1 / k;
    const [rfL, rfR] = RF[this.rot];
    const xL = Math.floor((this.b * 16 + su0 - (sv0 + sdv) + this.pad) * k), xR = Math.ceil((this.b * 16 + su0 + sdu - sv0 + this.pad) * k);
    for (let X = Math.max(0, xL, xStart); X < Math.min(W, xR, xEnd); X++) {
      const c = (X - ox + 0.5) / k; // u - v au centre de la colonne (unités de base, à l'écran)
      let yFree = Hh;
      for (let s = 2 * (su0 + sdu + sv0 + sdv); s >= 2 * (su0 + sv0) - st; s -= st) {
        const u = (s / 2 + c) / 2, v = (s / 2 - c) / 2;
        if (!inside(u, v)) continue;
        const [ur, vr] = this.toR(u, v);
        const lu = ur - u0, lv = vr - v0;
        const z = zfn(lu, lv);
        if (z <= z0 - 0.5 * e) continue;
        const base = (u + v) / 2 + this.H;
        const yt = Math.floor((base - z) * k), yb = Math.floor((base - z0) * k);
        if (yt >= yFree) continue;
        const zf2 = zAt(u + 1, v + 1), zbk = zAt(u - 1, v - 1);
        const slope = zf2 > -1e8 && zbk > -1e8 ? Math.sign(Math.round((zbk - zf2) * 2)) : 0;
        const side = zAt(u, v + e) <= zAt(u + e, v) ? 1 : 2;
        const d = u + v;
        const SU = Math.floor((u - su0) * k), SV = Math.floor((v - sv0) * k);
        for (let y = Math.min(yb, yFree - 1); y >= yt; y--) {
          if (y < 0 || y >= Hh) continue;
          const q = y * W + X;
          if (mask[q]) continue;
          mask[q] = 1;
          if (d < zb[q] - 0.02) continue; // déjà caché par un volume plus proche
          const zz = base - y / k;
          const top = y === yt || zz >= z - 0.5 * e;
          const zc = top ? z : zz;
          const f = top ? 0 : side;
          const cc = col(Math.floor(lu), Math.floor(lv), top ? z : Math.floor(zz), f, top ? slope : 0, Math.floor(lu * k), Math.floor(lv * k), Math.floor(zc * k), f === 1 ? rfL : f === 2 ? rfR : -1, SU, SV);
          if (cc) { px.d[q] = cc; zb[q] = d; }
        }
        yFree = Math.min(yFree, yt);
        if (yt <= 0) break;
      }
    }
    return this;
  }

  // une boîte : murs (mat.left : la façade, mat.right : le côté ; mat.back et mat.side pour le dos et l'autre côté,
  // sinon les mêmes) : (t, z, longueur, T, Z, face à l'écran) -> couleur ; dessus : mat.top(u, v, U, V)
  box(u0, v0, du, dv, h, mat, z0 = 0) {
    const zk = z0 * this.k;
    return this.vol(u0, v0, du, dv, h, (u, v, z, f, s, U, V, Z, rf) => {
      if (f === 0) return mat.top(u, v, U, V);
      const alongU = rf === 0 || rf === 2;
      const m = rf === 0 ? mat.left : rf === 1 ? mat.right : rf === 2 ? (mat.back || mat.left) : (mat.side || mat.right);
      return m(alongU ? u : v, z - z0, alongU ? du : dv, alongU ? U : V, Z - zk, f);
    }, z0);
  }
  // toit à deux pans (faîte le long de u si axis 'u', sinon le long de v), qui déborde de over unités
  gable(u0, v0, du, dv, z0, rise, mat, axis = 'u', over = 2) {
    const U0 = u0 - over, V0 = v0 - over, DU = du + 2 * over, DV = dv + 2 * over, k = this.k;
    const zf = axis === 'u'
      ? (u, v) => z0 + rise * (1 - Math.abs(v + 0.5 / k - DV / 2) / (DV / 2))
      : (u, v) => z0 + rise * (1 - Math.abs(u + 0.5 / k - DU / 2) / (DU / 2));
    return this.vol(U0, V0, DU, DV, zf, (u, v, z, f, s, U, V, Z, rf) => {
      if (f === 0) return mat.roof(u, v, s, axis, U, V);
      // pignon : le mur sous le toit (aux bouts du faîte), le reste est la tranche du toit
      const gableSide = axis === 'u' ? rf === 1 || rf === 3 : rf === 0 || rf === 2;
      const inWall = axis === 'u' ? v >= over && v < DV - over : u >= over && u < DU - over;
      if (gableSide && inWall && z < zf(axis === 'u' ? 0 : u + 0.5, axis === 'u' ? v + 0.5 : 0) - 1.2) return mat.gable(axis === 'u' ? v : u, z - z0, f, axis === 'u' ? V : U, Z - z0 * k);
      return mat.edge(f);
    }, z0 - 1);
  }
  // toit à quatre pans (pyramide si carré)
  hip(u0, v0, du, dv, z0, rise, mat, over = 2) {
    const U0 = u0 - over, V0 = v0 - over, DU = du + 2 * over, DV = dv + 2 * over, h = 0.5 / this.k;
    const zf = (u, v) => z0 + rise * Math.min(1, 2 * Math.min(u + h, DU - u - h, v + h, DV - v - h) / Math.min(DU, DV));
    return this.vol(U0, V0, DU, DV, zf, (u, v, z, f, s, U, V) => (f === 0 ? mat.roof(u, v, s, 'h', U, V) : mat.edge(f)), z0 - 1);
  }
  // cylindre (réservoir, silo) de rayon r unités, centré en (cu, cv), de z0 à z0 + h ; cap : dessus en cône (hauteur)
  cyl(cu, cv, r, z0, h, mat, cap = 0) {
    const zf = (u, v) => {
      const du = u - r, dv = v - r, d = Math.sqrt(du * du + dv * dv);
      if (d > r) return -1e9;
      return z0 + h + (cap ? cap * (1 - d / r) : 0);
    };
    const k = this.k;
    return this.vol(cu - r, cv - r, 2 * r, 2 * r, zf, (u, v, z, f, s, U, V, Z, rf, SU, SV) => {
      if (f === 0) return mat.top(u, v, z, U, V);
      // de la gauche (éclairée) à la droite (à l'ombre), à l'écran : un dégradé lisse
      const kk = Math.max(0, Math.min(1, ((SU - SV) / k + 2 * r) / (4 * r)));
      return mat.side(kk, z - z0, Z - z0 * k, U, V);
    }, z0);
  }
  // dalle en surplomb (auvent, plancher de balcon) : de z0 à z0 + t
  slab(u0, v0, du, dv, z0, t, mat) { return this.vol(u0, v0, du, dv, z0 + t, (u, v, z, f, s, U, V) => (f === 0 ? mat.top(u, v, U, V) : mat.edge(f)), z0); }
  // poteau (piquet, poteau de porche) : deux pixels fins de section, le droit à l'ombre
  post(u, v, h, c, z0 = 0) {
    const X = Math.round(this.sx(u, v)), Y = Math.round(this.sy(u, v, z0)), D = tone(c, -0.3), d = this.depth(u, v) + 0.5;
    for (let y = Y - Math.round(h * this.k); y < Y; y++) { this.put(X, y, c, d); this.put(X + 1, y, D, d); }
    return this;
  }
  // un pixel fin (x, y en pixels fins du sprite) ; dot2 : un pixel du jeu (K × K pixels fins) ; d : profondeur
  dot(x, y, c, d = 1e9) { this.put(x, y, c, d); return this; }
  dot2(x, y, c, d = 1e9) { const X = Math.round(x), Y = Math.round(y); for (let j = 0; j < this.k; j++) for (let i = 0; i < this.k; i++) this.put(X + i, Y + j, c, d); return this; }
  // trait en pixels fins (profondeur interpolée)
  line(x0, y0, x1, y1, c, d0 = 1e9, d1 = d0) {
    const n = Math.max(Math.abs(Math.round(x1) - Math.round(x0)), Math.abs(Math.round(y1) - Math.round(y0)), 1);
    for (let i = 0; i <= n; i++) this.put(x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n, c, d0 + ((d1 - d0) * i) / n);
    return this;
  }
  // segment entre deux points de la recette (unités de base)
  seg(u0, v0, z0, u1, v1, z1, c) { return this.line(this.sx(u0, v0), this.sy(u0, v0, z0), this.sx(u1, v1), this.sy(u1, v1, z1), c, this.depth(u0, v0) + 0.5, this.depth(u1, v1) + 0.5); }
  // ombre portée au sol : un losange sombre décalé vers la droite (la lumière vient d'en haut à gauche)
  shadow(u0, v0, du, dv, a = 0.32) {
    const k = this.k;
    const [p0, q0] = this.toS(u0, v0), [p1, q1] = this.toS(u0 + du, v0 + dv);
    const su0 = Math.min(p0, p1), sv0 = Math.min(q0, q1), DU = Math.abs(p1 - p0) * k, DV = Math.abs(q1 - q0) * k;
    const ox = Math.round((this.b * 16 + su0 - (sv0 + DV / k) + this.pad) * k), oy = Math.round(((su0 + sv0) / 2 + this.H) * k);
    const c = pack(28, 14, 8, Math.round(255 * a));
    for (let x = 0; x < DU + DV; x++) {
      const t = dTop(x, DU, DV), b = dBot(x, DU, DV);
      for (let y = t; y <= b; y++) {
        const X = ox + x + 3 * k, Y = oy + y + k;
        if (X >= 0 && Y >= 0 && X < this.px.w && Y < this.px.h && !this.px.d[Y * this.px.w + X]) this.px.d[Y * this.px.w + X] = c;
      }
    }
    return this;
  }
  // terminer : contour d'un pixel fin (les ombres translucides n'en ont pas), puis canvas avec son point d'ancrage
  done(outline = true) {
    if (outline) {
      const { w, h, d } = this.px, src = d.slice();
      const solid = (q) => src[q] && (src[q] >>> 24) === 255;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const q = y * w + x;
        if (solid(q)) continue;
        if ((x > 0 && solid(q - 1)) || (x < w - 1 && solid(q + 1)) || (y > 0 && solid(q - w)) || (y < h - 1 && solid(q + w))) d[q] = OUTC;
      }
    }
    const c = this.px.canvas();
    c.k = this.k; // pixels fins par pixel du jeu : on le dessine à 1 / k
    c.ox = this.pad * this.k; // le coin gauche de la boîte du losange au sol (pixels fins)
    c.oy = this.H * this.k;
    return c;
  }
}

// ------------------------------------------------------------ matières
// Chaque matière renvoie une fonction (t le long du mur, z la hauteur, longueur, face, T, Z en pixels fins) -> couleur,
// éclairée selon la face à l'écran (gauche claire, droite sombre). Le détail se fait au pixel fin (T, Z) ; seed varie
// les planches et les briques d'un bâtiment à l'autre.
export const LIGHT = [0.12, 0.02, -0.28]; // dessus, gauche, droite
const fk = (a, b) => (b == null ? a * K : b);

export function planks(base, seed = 1, lap = 4) {
  const R = ramp(base, 7, 0.42);
  return (t, z, len, face = 1, T, Z) => {
    const tt = fk(t, T), zz = fk(z, Z);
    const row = Math.floor(zz / lap);
    const joint = Math.floor((tt + hsh(row, 0, seed) * 30) / 22);
    let l = 0.55 + (hsh(row, joint, seed) - 0.5) * 0.32 + LIGHT[face];
    const r = ((zz % lap) + lap) % lap;
    if (r === 0) l -= 0.32;
    else if (r === lap - 1) l += 0.12;
    if (Math.floor(tt + hsh(row, 0, seed) * 30) % 22 === 0) l -= 0.25;
    if (hsh(tt >> 1, zz, seed + 3) < 0.03) l -= 0.2; // nœud du bois
    return dither(R, l, tt, zz);
  };
}
export function battens(base, seed = 1) {
  const R = ramp(base, 7, 0.42);
  return (t, z, len, face = 1, T, Z) => {
    const tt = fk(t, T), zz = fk(z, Z);
    const m = tt % 7;
    let l = 0.55 + LIGHT[face] + (hsh(Math.floor(tt / 7), 0, seed) - 0.5) * 0.22 + (hsh(tt, zz >> 2, seed) - 0.5) * 0.08;
    if (m === 0) l -= 0.34; else if (m === 1) l += 0.14; // couvre-joint en relief
    return dither(R, l, tt, zz);
  };
}
export function brick(base, mortar = '#b89878', seed = 1) {
  const R = ramp(base, 7, 0.36), M = hex(mortar);
  return (t, z, len, face = 1, T, Z) => {
    const tt = fk(t, T), zz = fk(z, Z);
    const row = Math.floor(zz / 3), off = row & 1 ? 3 : 0;
    if (zz % 3 === 0) return tone(M, LIGHT[face] - 0.08);
    if ((tt + off) % 7 === 0) return tone(M, LIGHT[face] - 0.16);
    const id = Math.floor((tt + off) / 7);
    return dither(R, 0.5 + LIGHT[face] + (hsh(id, row, seed) - 0.5) * 0.34 + (zz % 3 === 1 ? 0.06 : -0.04), tt, zz);
  };
}
export function adobe(base, seed = 1) {
  const R = ramp(base, 7, 0.32);
  return (t, z, len, face = 1, T, Z) => {
    const tt = fk(t, T), zz = fk(z, Z);
    let l = 0.55 + LIGHT[face] + (hsh(tt >> 2, zz >> 2, seed) - 0.5) * 0.14 + (hsh(tt, zz, seed + 1) - 0.5) * 0.08;
    if (hsh(tt >> 3, zz >> 3, seed + 5) < 0.08) l -= 0.18; // l'enduit écaillé
    return dither(R, l, tt, zz);
  };
}
export function stone(base, seed = 1) {
  const R = ramp(base, 7, 0.42);
  return (t, z, len, face = 1, T, Z) => {
    const tt = fk(t, T), zz = fk(z, Z);
    const row = Math.floor(zz / 5), off = (row * 5) % 9;
    const id = Math.floor((tt + off) / 9);
    if (zz % 5 === 0 || (tt + off) % 9 === 0) return dither(R, 0.14 + LIGHT[face], tt, zz);
    let l = 0.55 + LIGHT[face] + (hsh(id, row, seed) - 0.5) * 0.34;
    if (zz % 5 === 1) l += 0.1; // l'arête du bloc prend la lumière
    return dither(R, l, tt, zz);
  };
}
export function plain(base) {
  const C = [tone(hex(base), LIGHT[0]), tone(hex(base), LIGHT[1]), tone(hex(base), LIGHT[2])];
  return (t, z, len, face = 1) => C[face];
}
// toit de bardeaux (rangs parallèles au faîte, décalés), de tôle (cannelures) ou de tuiles
export function shingles(base, seed = 1) {
  const R = ramp(base, 7, 0.46);
  return (u, v, s, axis, U, V) => {
    const uu = fk(u, U), vv = fk(v, V);
    const along = axis === 'u' ? vv : uu, across = axis === 'u' ? uu : vv;
    const row = Math.floor(along / 4);
    let l = s > 0 ? 0.72 : s < 0 ? 0.3 : 0.55;
    if (along % 4 === 0) l -= 0.24;
    const tile = Math.floor((across + (row & 1) * 3) / 6);
    if ((across + (row & 1) * 3) % 6 === 0) l -= 0.12;
    l += (hsh(tile, row, seed) - 0.5) * 0.26;
    return dither(R, l, uu, vv);
  };
}
export function tin(base) {
  const R = ramp(base, 6, 0.42);
  return (u, v, s, axis, U, V) => {
    const uu = fk(u, U), vv = fk(v, V);
    const across = axis === 'u' ? uu : vv;
    const m = across % 5;
    return dither(R, (s > 0 ? 0.74 : s < 0 ? 0.3 : 0.55) + (m === 0 ? -0.22 : m === 1 ? 0.12 : 0) + (hsh(across, (axis === 'u' ? vv : uu) >> 3, 9) < 0.02 ? -0.2 : 0), uu, vv);
  };
}
export function flatTop(base, seed = 1) {
  const R = ramp(base, 6, 0.26);
  return (u, v, U, V) => { const uu = fk(u, U), vv = fk(v, V); return dither(R, 0.6 + (hsh(uu >> 2, vv >> 2, seed) - 0.5) * 0.3, uu, vv); };
}

// ------------------------------------------------------------ détails posés sur les murs (au pixel fin)
// Un mur gauche (plan v = v0 + dv, la façade) ou droit (plan u = u0 + du) : position t le long du mur, hauteur z
// (unités de base de la recette). Rien n'est posé sur un mur tourné vers l'arrière.
export function onLeft(sp, u0, v0, dv, t, z) { return [sp.sx(u0 + t, v0 + dv), sp.sy(u0 + t, v0 + dv, z)]; }
export function onRight(sp, u0, v0, du, t, z) { return [sp.sx(u0 + du, v0 + t), sp.sy(u0 + du, v0 + t, z)]; }
// parcourt un rectangle de w × h unités sur un mur, pixel fin par pixel fin : fn(i, j, x, y, profondeur)
function onWall(sp, wall, u0, v0, du, dv, t, z, w, h, fn, margin = 1) {
  if (!sp.faces(wall)) return;
  const k = sp.k;
  for (let i = -margin; i < w * k + margin; i++) for (let j = -margin; j < h * k + margin; j++) {
    const tt = t + (i + 0.5) / k, zz = z + h - (j + 0.5) / k;
    const u = wall === 'L' ? u0 + tt : u0 + du, v = wall === 'L' ? v0 + dv : v0 + tt;
    fn(i, j, sp.sx(u, v), sp.sy(u, v, zz), sp.depth(u, v) + 0.8); // (un pixel fin d'écart le long du mur : 0,5 de profondeur)
  }
}
// peindre un rectangle de w × h unités sur un mur, au pixel fin : fn(i, j, W, H) -> couleur (ou 0 : rien)
export function paint(sp, wall, u0, v0, du, dv, t, z, w, h, fn) {
  const W = w * sp.k, Hh = h * sp.k;
  onWall(sp, wall, u0, v0, du, dv, t, z, w, h, (i, j, x, y, d) => { const c = fn(i, j, W, Hh); if (c) sp.dot(x, y, c, d); }, 0);
}
// le mur est-il éclairé (à gauche de l'écran) ou à l'ombre (à droite) dans cette rotation ?
const shaded = (sp, wall) => RF[sp.rot][1] === (wall === 'L' ? 0 : 1);
// fenêtre (w × h unités) : vitre sombre à reflet, croisillon, appui, encadrement clair
export function window(sp, wall, u0, v0, du, dv, t, z, w = 3, h = 4, frame = '#e0c890', glass = '#2a2a3a', lit = false) {
  const F = hex(frame), Fd = tone(F, -0.3), G = hex(lit ? '#f8d070' : glass), G2 = tone(G, lit ? 0.3 : 0.28), G3 = tone(G, -0.25);
  const k = sp.k, W = Math.round(w * k), Hh = Math.round(h * k), mx = Math.floor(W / 2), my = Math.floor(Hh / 2), sh = shaded(sp, wall);
  onWall(sp, wall, u0, v0, du, dv, t, z, w, h, (i, j, x, y, d) => {
    const edge = i < 0 || j < 0 || i >= W || j >= Hh;
    let c;
    if (edge) c = j >= Hh ? tone(F, 0.15) : sh ? Fd : F;
    else if ((i === mx && W > 3) || (j === my && Hh > 5)) c = sh ? Fd : F; // croisillon
    else if (i + j < 2 || (i === W - 1 && j > 1)) c = i + j < 2 ? G2 : G3; // reflet en haut, ombre du côté
    else c = G;
    sp.dot(x, y, c, d);
  });
}
export function door(sp, wall, u0, v0, du, dv, t, w = 3, h = 6, col = '#5a3a22') {
  const C = hex(col), D = tone(C, -0.3), L = tone(C, 0.18), Kn = hex('#c89a40');
  const k = sp.k, W = w * k, Hh = h * k, sh = shaded(sp, wall);
  onWall(sp, wall, u0, v0, du, dv, t, 0, w, h, (i, j, x, y, d) => {
    let c = j === 0 ? L : (i === 0 || i === W - 1) ? D : (j % 5 === 0 && j > 0) ? D : C; // montants et panneaux
    if (i === W - 2 && j === Math.floor(Hh / 2)) c = Kn; // la poignée
    sp.dot(x, y, sh ? tone(c, -0.3) : c, d);
  }, 0);
}
// enseigne : un panneau de couleur à cadre, avec un pictogramme (5 × 5 pixels fins) dessus
export function sign(sp, wall, u0, v0, du, dv, t, z, w, h, bg, glyph = null, fg = '#f8d070') {
  const B = hex(bg), Fg = hex(fg), Fr = hex('#3a2414'), Bl = tone(B, 0.15);
  const k = sp.k, W = w * k, Hh = h * k, sh = shaded(sp, wall);
  const g = glyph ? GLYPHS[glyph] : null;
  const gx = g ? Math.floor((W - g[0].length) / 2) : 0, gy = g ? Math.floor((Hh - g.length) / 2) : 0;
  onWall(sp, wall, u0, v0, du, dv, t, z, w, h, (i, j, x, y, d) => {
    const edge = i < 0 || j < 0 || i >= W || j >= Hh;
    let c = edge ? Fr : j === 0 ? Bl : B;
    if (!edge && g && g[j - gy]?.[i - gx] === '#') c = Fg;
    sp.dot(x, y, sh && !edge ? tone(c, -0.25) : c, d);
  });
}
// pictogrammes des enseignes
export const GLYPHS = {
  bottle: ['..#..', '..#..', '.###.', '.###.', '.###.'],
  cross: ['..#..', '#####', '..#..', '..#..', '..#..'],
  star: ['..#..', '#####', '.###.', '.#.#.', '#...#'],
  dollar: ['.###.', '#.#..', '.###.', '..#.#', '.###.'],
  bread: ['.###.', '#####', '#####', '.....', '.....'],
  plus: ['.....', '..#..', '.###.', '..#..', '.....'],
  scissors: ['#...#', '.#.#.', '..#..', '.#.#.', '#...#'],
  bed: ['#....', '#.###', '#####', '#...#', '.....'],
  book: ['##.##', '##.##', '##.##', '#####', '.....'],
  card: ['.#.#.', '#####', '#####', '.###.', '..#..'],
  note: ['..###', '..#.#', '..#..', '###..', '###..'],
  key: ['.##..', '#..#.', '.##..', '..###', '..#.#'],
  wheel: ['.###.', '#.#.#', '###.#', '#.#.#', '.###.'],
  hammer: ['####.', '####.', '..#..', '..#..', '..#..'],
  drop: ['..#..', '.###.', '#####', '#####', '.###.'],
  bolt: ['...#.', '..#..', '.###.', '..#..', '.#...'],
  hat: ['.###.', '.###.', '#####', '.....', '.....'],
  cow: ['#...#', '#####', '.###.', '.#.#.', '.....'],
  anvil: ['####.', '.###.', '..#..', '.###.', '.....'],
};

// ------------------------------------------------------------ cache
// (un sprite chassé du cache est libéré : on le redemande à chaque image plutôt que de le garder sous la main)
let CACHE = S.lru(700);
// isoSprite(key, draw) : le sprite (canvas avec ox, oy) dessiné une seule fois par clé
export function isoSprite(key, draw) {
  let c = CACHE.get(key);
  if (!c) { c = draw(); CACHE.set(key, c); }
  return c;
}
export function forgetSprites() { CACHE = S.lru(700); }

// ------------------------------------------------------------ petits sprites 2D (grilles ASCII)
// grid2d(['..a..', '.aba.'], { a: '#c2643e', b: '#f8d070' }) -> canvas, contour en option
export function grid2d(rows, pal, outline = true) {
  const w = rows[0].length, h = rows.length, P = outline ? 1 : 0;
  const px = new Pix(w + 2 * P, h + 2 * P);
  rows.forEach((r, y) => [...r].forEach((c, x) => { if (pal[c]) px.set(x + P, y + P, hex(pal[c])); }));
  if (outline) px.outline();
  return px.canvas();
}
// une suite d'images (marche, flammes) : frames de grilles, même palette
export const anim = (frames, pal, outline = true) => frames.map((f) => grid2d(f, pal, outline));
