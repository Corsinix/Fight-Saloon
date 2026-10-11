// Icônes d'objets de « La piste », en pixels fins (F par pixel du jeu), au grain des pions et de la carte du monde
// (pistepawn.js, pistemap.js) : chaque objet est construit en formes (distances signées : boîtes arrondies, polygones,
// tubes, anneaux), éclairé d'en haut à gauche avec un vrai modelé (biseaux, cylindres, dômes, reflets des métaux),
// coloré dans des palettes en dégradé tramées (tramage ordonné de Bayer), puis cerné d'un pixel fin sombre.
// Le dessin est pensé pour chaque taille : de 8 à 12 pixels du jeu, il est calculé deux fois moins fin (un pixel
// « d'art » = deux pixels fins) pour garder une silhouette nette, avec moins de détails ; à partir de 16, il est
// calculé au pixel fin, avec les matières (veines du bois, reflets, coutures) et, à 24-32, les gravures.
// API :
//   ITEM_IDS : la liste des objets dessinés ;
//   itemArt(id, size, opts) : le canvas (size × F de côté), gardé en cache ; opts.q : 0, 1 (« de choix » : liseré et
//     éclat bleus) ou 2 (« de légende » : liseré et éclat d'or, opts.f : image 0 à GLINT_FRAMES - 1 de l'éclat qui
//     scintille) ; opts.off : grisé ; opts.mono : une seule couleur (silhouette) ; opts.tint : teinté d'une couleur
//     (les ombres vers l'encre, les lumières vers le blanc : le modelé reste) ; opts.art : le dessin réduit même en
//     tout petit (sans le signe fait main, pour comparer) ;
//   drawItem(ctx, id, cx, cy, size, opts) : le pose centré en (cx, cy), sur un ctx en setTransform(F) ;
//   hasItemArt(id).
import * as S from './sprites.js';

export const F = 4; // pixels fins par pixel du jeu
export const GLINT_FRAMES = 6; // images de l'éclat d'or des objets de légende

// ------------------------------------------------------------ couleurs (entiers RGBA, octets dans l'ordre R G B A)
const pack = (r, g, b, a = 255) => ((a << 24) | (b << 16) | (g << 8) | r) >>> 0;
const hex = (h) => { const n = parseInt(h.replace('#', ''), 16); return pack(n >> 16, (n >> 8) & 255, n & 255); };
const ramp = (s) => s.split(' ').map(hex);
const scale = (p, k) => pack(Math.min(255, (p & 255) * k) | 0, Math.min(255, ((p >>> 8) & 255) * k) | 0, Math.min(255, ((p >>> 16) & 255) * k) | 0, p >>> 24);
const blend = (p, q, t) => {
  const c = (s) => { const a = (p >>> s) & 255; return (a + (((q >>> s) & 255) - a) * t) | 0; };
  return pack(c(0), c(8), c(16));
};
const lum = (p) => ((p & 255) * 0.3 + ((p >>> 8) & 255) * 0.55 + ((p >>> 16) & 255) * 0.15) / 255;

const OUT = hex('1a0f0a');
const PAL = {
  steel: ramp('0e1018 181c28 252b3c 343d54 4a566e 66748e 8a9ab2 b4c2d6 e2eaf4'), // acier bleui
  iron: ramp('18181c 26262c 36363e 4a4a54 60606a 7a7a84 9898a2 bcbcc4 e0e0e6'),
  brass: ramp('34200a 54360e 7a5216 a2721e c4922c dcb040 eccc62 f8e494 fff6d0'),
  gold: ramp('3e2406 6a420c 966414 bc8820 dcaa30 f0c848 fae070 fff2a8 fffbe2'),
  wood: ramp('1e1008 30190c 442412 5a3218 724222 8a5430 a26a3e ba8450'),
  oak: ramp('241208 3c2010 56301a 704226 8a5634 a26c42 b88656 cca06c'),
  leather: ramp('200e06 361a0c 4e2814 6a3a1e 864e28 a06434 b87e46 cc9a60'),
  bag: ramp('120a08 1e1410 2c1e18 3c2a20 4e382a 624836 7a5c46'),
  cloth: ramp('6e6658 8e8674 aca48e c6bea8 dcd6c2 ece8da f8f6ee fffefa'),
  dust: ramp('2e2418 463826 5e4c34 786446 927c58 aa946c c2ae86 d8c8a2'),
  red: ramp('240404 440a06 6a140c 921e12 b82e1c d4462a e86a46 f49a76'),
  fire: ramp('5a0c04 961e08 c83c0e e8641a f6942a fcc046 fee68a fffbd8'),
  pewter: ramp('1c1e22 2c2f35 40444b 575c64 70767e 8c929a aab0b6 cad0d4 eef0f2'),
  bone: ramp('3e3628 5a5040 7a705c 9c927a bcb298 d8d0b8 eee8d6 fdfaf0'),
  bread: ramp('3e1c06 62300e 884a18 ae6a28 cc8c3e e2ae5e f2cc86 fbe6b4'),
  meat: ramp('220604 3e0e08 5e1a0e 7e2a16 9c3e20 b45a32 c87a4a'),
  burlap: ramp('2e200e 463218 5e4824 786034 927a46 ac945a c4ae74 dac892'),
  fig: ramp('2e241c 4a3c2e 6a5a46 8c7a60 ae9c7e cebe9e e6dac0 f8f0de'),
  ghost: ramp('2e3a58 465676 627696 8498b8 a8bcd6 c8d8ec e2ecf8 f6faff'),
  blue: ramp('0a1430 14244e 203a78 2e56a4 4276cc 6098e8 8cbaf6 c4defe'),
  lead: ramp('202024 303036 44444c 5a5a64 74747e 90909a aeaeb6 d0d0d6'),
  copper: ramp('2e1006 4a1c0a 6c2c12 90401c b45a28 d07a3a e4a058 f4c88a'),
  paper: ramp('6a5a42 8a785a a8966e c4b088 dcc8a0 ece0bc f8f0d8'),
  smoke: ramp('2e2a28 46403c 5e5854 78726c 948e88 b0aaa4 ccc8c2 e6e2dc'),
  sand: ramp('4a3018 6a4626 8a6034 a87a44 c49656 d8b06c e8c886 f4e0aa'),
  green: ramp('0e1c0a 182c12 24401c 34582a 487238 628e4c 82aa66 a8c88a'),
  dyn: ramp('2a0604 4e0c08 761810 a0241a c2382a da5238 ec7652 f6a080'),
  cream: ramp('5a4c3a 7c6c54 a08e72 c2b092 dccca8 eee2c2 faf4e0 fffdf4'),
  skin: ramp('3a1c10 5a2e1a 7e4628 a2643a c08250 d8a06a eabf8c f6dcb4'),
  felt: ramp('1c120c 2e2016 443222 5c4630 765c40 907452 aa8e68 c4aa84'),
};
const CREAM = hex('fdf6e0'), INK = hex('2a1a10'), BLACK = hex('0c0806');

// une matière : palette, niveau moyen (0..1), ampleur du modelé, force et dureté du reflet
const mat = (R, mid = 0.5, span = 1, spec = 0, shin = 12) => ({ R, mid, span, spec, shin });
const M = {
  steel: mat(PAL.steel, 0.4, 1.15, 1.1, 22),
  iron: mat(PAL.iron, 0.42, 1.05, 0.6, 14),
  brass: mat(PAL.brass, 0.48, 1.05, 1.0, 16),
  gold: mat(PAL.gold, 0.5, 1.05, 1.1, 18),
  wood: mat(PAL.wood, 0.5, 0.9, 0.25, 8),
  oak: mat(PAL.oak, 0.48, 0.9, 0.2, 8),
  leather: mat(PAL.leather, 0.5, 0.95, 0.3, 10),
  bag: mat(PAL.bag, 0.5, 1.0, 0.45, 12),
  cloth: mat(PAL.cloth, 0.58, 0.85, 0, 1),
  dust: mat(PAL.dust, 0.52, 0.9, 0, 1),
  red: mat(PAL.red, 0.5, 1.0, 1.0, 26),
  redm: mat(PAL.red, 0.52, 0.9, 0.15, 8),
  fire: mat(PAL.fire, 0.55, 0.5, 0, 1),
  pewter: mat(PAL.pewter, 0.48, 1.05, 1.0, 20),
  bone: mat(PAL.bone, 0.55, 0.95, 0.2, 8),
  bread: mat(PAL.bread, 0.5, 1.0, 0.2, 6),
  meat: mat(PAL.meat, 0.5, 0.9, 0.5, 14),
  burlap: mat(PAL.burlap, 0.5, 0.95, 0, 1),
  fig: mat(PAL.fig, 0.55, 0.95, 0.1, 6),
  ghost: mat(PAL.ghost, 0.6, 0.9, 0.3, 10),
  blue: mat(PAL.blue, 0.5, 1.0, 1.0, 20),
  lead: mat(PAL.lead, 0.45, 1.0, 0.8, 16),
  copper: mat(PAL.copper, 0.5, 1.0, 1.0, 18),
  paper: mat(PAL.paper, 0.55, 0.8, 0, 1),
  smoke: mat(PAL.smoke, 0.55, 0.8, 0, 1),
  sand: mat(PAL.sand, 0.5, 0.9, 0, 1),
  green: mat(PAL.green, 0.5, 0.95, 0.2, 8),
  dyn: mat(PAL.dyn, 0.5, 1.0, 0.35, 10),
  cream: mat(PAL.cream, 0.55, 0.9, 0.3, 10),
  skin: mat(PAL.skin, 0.55, 0.9, 0.25, 8),
  felt: mat(PAL.felt, 0.48, 1.0, 0.2, 8),
};

// ------------------------------------------------------------ tramage et lumière
const BAY = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
const bay = (x, y) => BAY[((y & 3) << 2) | (x & 3)];
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
// la lumière vient d'en haut à gauche, un peu de face ; H : la direction du reflet (entre la lumière et l'œil)
const HX = -0.26, HY = -0.34, HZ = 0.9;

// ------------------------------------------------------------ formes (distances signées, négatives dedans)
// Toutes les coordonnées sont celles du modèle : un carré de 32 × 32 unités, quelle que soit la taille de l'icône.
const sBox = (cx, cy, hw, hh, r = 0) => (x, y) => {
  const qx = Math.abs(x - cx) - hw + r, qy = Math.abs(y - cy) - hh + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
};
const sCirc = (cx, cy, r) => (x, y) => Math.hypot(x - cx, y - cy) - r;
// ellipse (approximation d'Inigo Quilez, bien assez juste pour des pixels)
const sEll = (cx, cy, rx, ry) => (x, y) => {
  const px = (x - cx) / rx, py = (y - cy) / ry, k0 = Math.hypot(px, py);
  if (k0 < 1e-6) return -Math.min(rx, ry);
  const k1 = Math.hypot((x - cx) / (rx * rx), (y - cy) / (ry * ry));
  return (k0 * (k0 - 1)) / k1;
};
const sPoly = (pts) => (x, y) => {
  let d = Infinity, s = 1;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const ax = pts[j][0], ay = pts[j][1], ex = pts[i][0] - ax, ey = pts[i][1] - ay, wx = x - ax, wy = y - ay;
    const t = clamp((wx * ex + wy * ey) / (ex * ex + ey * ey || 1), 0, 1), dx = wx - ex * t, dy = wy - ey * t;
    d = Math.min(d, dx * dx + dy * dy);
    const c1 = y >= ay, c2 = y < pts[i][1], c3 = ex * wy > ey * wx;
    if ((c1 && c2 && c3) || (!c1 && !c2 && !c3)) s = -s;
  }
  return s * Math.sqrt(d);
};
// un tube le long d'une ligne brisée, son rayon passant de r0 à r1
const sTube = (pts, r0, r1 = r0) => {
  const segs = [];
  let tot = 0;
  for (let i = 0; i < pts.length - 1; i++) { const l = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]); segs.push([pts[i], pts[i + 1], tot, l]); tot += l; }
  return (x, y) => {
    let d = Infinity;
    for (const [a, b, l0, l] of segs) {
      const ex = b[0] - a[0], ey = b[1] - a[1], t = clamp(((x - a[0]) * ex + (y - a[1]) * ey) / (l * l || 1), 0, 1);
      const r = r0 + (r1 - r0) * ((l0 + t * l) / (tot || 1));
      d = Math.min(d, Math.hypot(x - a[0] - ex * t, y - a[1] - ey * t) - r);
    }
    return d;
  };
};
const sRing = (cx, cy, r, w) => (x, y) => Math.abs(Math.hypot(x - cx, y - cy) - r) - w;
// demi-plan : dedans du côté droit du sens a → b, à l'écran (y vers le bas)
const sHalf = (ax, ay, bx, by) => { const l = Math.hypot(bx - ax, by - ay); return (x, y) => -((bx - ax) * (y - ay) - (by - ay) * (x - ax)) / l; };
const U = (...fs) => (x, y) => { let d = Infinity; for (const f of fs) d = Math.min(d, f(x, y)); return d; };
const X = (...fs) => (x, y) => { let d = -Infinity; for (const f of fs) d = Math.max(d, f(x, y)); return d; };
const Sub = (a, ...bs) => (x, y) => { let d = a(x, y); for (const b of bs) d = Math.max(d, -b(x, y)); return d; };
const sSmooth = (a, b, k) => (x, y) => { const da = a(x, y), db = b(x, y), h = clamp(0.5 + (0.5 * (db - da)) / k, 0, 1); return db + (da - db) * h - k * h * (1 - h); };
const grow = (f, r) => (x, y) => f(x, y) - r;
// une forme tournée de a autour de (cx, cy)
const sRot = (f, cx, cy, a) => { const c = Math.cos(a), s = Math.sin(a); return (x, y) => { const dx = x - cx, dy = y - cy; return f(cx + dx * c + dy * s, cy - dx * s + dy * c); }; };
const starPts = (cx, cy, n, ro, ri, a0 = -Math.PI / 2) => Array.from({ length: n * 2 }, (_, i) => {
  const a = a0 + (i * Math.PI) / n, r = i & 1 ? ri : ro;
  return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
});
// un arc de cercle épais (demi-épaisseur w), de l'angle a0 à a1 dans le sens des aiguilles d'une montre, bouts ronds
const sArc = (cx, cy, r, w, a0, a1) => {
  const T = Math.PI * 2, span = (((a1 - a0) % T) + T) % T;
  const e0 = [cx + Math.cos(a0) * r, cy + Math.sin(a0) * r], e1 = [cx + Math.cos(a1) * r, cy + Math.sin(a1) * r];
  return (x, y) => {
    const t = (((Math.atan2(y - cy, x - cx) - a0) % T) + T) % T;
    if (t <= span) return Math.abs(Math.hypot(x - cx, y - cy) - r) - w;
    return Math.min(Math.hypot(x - e0[0], y - e0[1]), Math.hypot(x - e1[0], y - e1[1])) - w;
  };
};
// des points rapprochés (s < 1) ou écartés d'un point fixe (bx, by)
const shrink = (pts, bx, by, s) => pts.map(([x, y]) => [bx + (x - bx) * s, by + (y - by) * s]);
// le signe du dollar, en relief (centré en cx, cy, haut de 13 × k unités)
const sDollar = (cx, cy, k = 1) => U(
  sArc(cx, cy - 2.1 * k, 2.3 * k, 0.8 * k, Math.PI / 2, (Math.PI * 11) / 6),
  sArc(cx, cy + 2.1 * k, 2.3 * k, 0.8 * k, -Math.PI / 2, (Math.PI * 5) / 6),
  sBox(cx, cy, 0.55 * k, 6.2 * k, 0.2),
);

// les points d'un arc d'ellipse (pour les tubes courbes)
const arcPts = (cx, cy, rx, ry, a0, a1, n = 16) => Array.from({ length: n + 1 }, (_, i) => { const a = a0 + ((a1 - a0) * i) / n; return [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]; });
// les normales en facettes d'une étoile : chaque branche a un côté éclairé et un côté dans l'ombre
const starNrm = (cx, cy, n, a0, tilt = 0.6) => (x, y) => {
  const th = Math.atan2(y - cy, x - cx), seg = (Math.PI * 2) / n;
  const k = Math.round((th - a0) / seg), ph = a0 + k * seg;
  let dd = th - ph;
  dd = Math.atan2(Math.sin(dd), Math.cos(dd));
  const sd = dd >= 0 ? 1 : -1, nx = -Math.sin(ph) * sd, ny = Math.cos(ph) * sd;
  const z = Math.sqrt(1 - tilt * tilt);
  return [nx * tilt, ny * tilt, z];
};

// ------------------------------------------------------------ repères : le modèle posé, tourné, retourné, agrandi
// un point du modèle (x, y) va en (cx, cy) + rotation(a) · ((x - 16) · sx, (y - 16) · sy)
function frame(cx = 16, cy = 16, a = 0, sx = 1, sy = sx) {
  const c = Math.cos(a), s = Math.sin(a), gx = Math.sign(sx), gy = Math.sign(sy);
  return {
    sc: Math.min(Math.abs(sx), Math.abs(sy)),
    fwd: (x, y) => { const u = (x - 16) * sx, v = (y - 16) * sy; return [cx + u * c - v * s, cy + u * s + v * c]; },
    inv: (u, v) => { const du = u - cx, dv = v - cy; return [(du * c + dv * s) / sx + 16, (-du * s + dv * c) / sy + 16]; },
    nrm: (nx, ny) => { const ax = nx * gx, ay = ny * gy; return [ax * c - ay * s, ax * s + ay * c]; },
  };
}
const I = frame();
// en petit, les objets longs et fins (fusils, couteau, longue-vue) sont épaissis en travers pour rester lisibles
// (en grand aussi, un peu : des armes trapues, qui ont du corps, comme des objets de collection)
const thick = (D) => (D.lo ? 1.55 : D.A <= 24 ? 1.3 : D.A < 96 ? 1.4 : 1.5);

// ------------------------------------------------------------ la toile de l'icône
class Art {
  // z, ox, oy : un cadrage (agrandi z fois, le point (ox, oy) du modèle au coin haut gauche) : en petit, l'objet est
  // recadré pour remplir sa case (voir base)
  constructor(A, z = 1, ox = 0, oy = 0) {
    this.A = A; // côté en pixels d'art
    this.s = (A / 32) * z; // pixels d'art par unité du modèle
    this.ox = ox; this.oy = oy;
    this.px = new Uint32Array(A * A);
    this.dz = A >= 48 ? 1 : 0.45; // tramage plein en grand, discret en petit (plus net)
  }
  // le point du modèle au centre du pixel d'art (X, Y), et l'inverse
  mu(X) { return (X + 0.5) / this.s + this.ox; }
  mv(Y) { return (Y + 0.5) / this.s + this.oy; }
  pX(u) { return (u - this.ox) * this.s; }
  pY(v) { return (v - this.oy) * this.s; }
  // la teinte d'une matière pour une normale (nx, ny, nz), un décalage de niveau add, au pixel (x, y)
  tone(m, nx, ny, nz, add, x, y) {
    const n = m.R.length - 1;
    let l = n * (m.mid + m.span * (0.5 * (-0.55 * nx - 0.7 * ny) + 0.25 * (nz - 0.85)));
    if (m.spec) { const h = nx * HX + ny * HY + nz * HZ; if (h > 0) l += m.spec * n * Math.pow(h, m.shin); }
    l += add;
    const k = Math.floor(l + 0.5 + (bay(x, y) - 0.5) * this.dz);
    return m.R[k < 0 ? 0 : k > n ? n : k];
  }
  // une forme pleine. o : bev (largeur du biseau, en unités ; grand = tube ou dôme), prof ('soft'), add, g ([gx, gy] :
  // dégradé par unité), tex(x, y, X, Y, prof) : décalage de niveau, nrm(x, y) : normale imposée, edge (true : liseré
  // sombre de la matière, ou une couleur), col (couleur unie), clip (seulement sur ce qui est déjà peint),
  // drop (ombre portée d'autant de pixels sur ce qui est dessous), holes (fn(X, Y) : pixels laissés vides)
  shape(f, sd, m, o = {}) {
    const { A, s, px } = this, ls = 1 / (s * f.sc), bw = o.bev || 0;
    const edge = o.edge === true ? m.R[0] : o.edge;
    const at = (X, Y) => { const [u, v] = f.inv(this.mu(X), this.mv(Y)); return sd(u, v); };
    const drop = o.drop ? Math.max(1, Math.round(o.drop)) : 0;
    // on parcourt la toile par blocs de 8 pixels, en sautant ceux que la forme ne peut pas toucher (sa distance au
    // centre du bloc dépasse le rayon du bloc, avec une marge pour les distances approchées et l'ombre portée)
    const B = 8, rad = ((B * 0.71 + 2 + drop) / (s * f.sc)) * 1.25 + 0.5;
    for (let by = 0; by < A; by += B) for (let bx = 0; bx < A; bx += B) {
      const [cu, cv] = f.inv(this.mu(bx + B / 2 - 0.5), this.mv(by + B / 2 - 0.5));
      if (sd(cu, cv) > rad) continue;
      for (let Y = by; Y < Math.min(A, by + B); Y++) for (let X = bx; X < Math.min(A, bx + B); X++) {
        const i = Y * A + X;
        const [lx, ly] = f.inv(this.mu(X), this.mv(Y)), d = sd(lx, ly);
        if (d > 0) {
          if (drop && px[i] && d < (drop + 1.5) * ls && at(X - drop, Y - drop) <= 0) px[i] = scale(px[i], 0.62);
          continue;
        }
        if (o.clip && !px[i]) continue;
        if (o.holes && o.holes(X, Y)) continue;
        if (edge != null && (at(X - 1, Y) > 0 || at(X + 1, Y) > 0 || at(X, Y - 1) > 0 || at(X, Y + 1) > 0)) { px[i] = edge; continue; }
        if (o.col != null) { px[i] = typeof o.col === 'function' ? o.col(lx, ly, X, Y) : o.col; continue; }
        let nx = 0, ny = 0, nz = 1;
        if (o.nrm) [nx, ny, nz] = o.nrm(lx, ly, -d);
        else if (bw > 0 && -d < bw) {
          const e = ls * 0.5, gx = sd(lx + e, ly) - sd(lx - e, ly), gy = sd(lx, ly + e) - sd(lx, ly - e), gl = Math.hypot(gx, gy) || 1;
          let t = 1 + d / bw;
          if (o.prof === 'soft') t *= t;
          t = Math.min(t, 0.97);
          nx = (gx / gl) * t; ny = (gy / gl) * t; nz = Math.sqrt(1 - t * t);
          if (o.inv) { nx = -nx; ny = -ny; }
        }
        const [wx, wy] = f.nrm(nx, ny);
        let add = o.add || 0;
        if (o.g) add += o.g[0] * (lx - 16) + o.g[1] * (ly - 16);
        if (o.tex) add += o.tex(lx, ly, X, Y, -d);
        px[i] = this.tone(m, wx, wy, nz, add, X, Y);
      }
    }
  }
  // un dôme exact (sphère aplatie) : boules, rivets, têtes
  ball(f, cx, cy, rx, ry, m, o = {}) {
    const flat = o.flat || 0;
    this.shape(f, sEll(cx, cy, rx, ry), m, { ...o, nrm: o.nrm || ((x, y) => {
      let nx = (x - cx) / rx, ny = (y - cy) / ry;
      const d = Math.min(1, nx * nx + ny * ny);
      nx *= 1 - flat; ny *= 1 - flat;
      return [nx, ny, Math.sqrt(Math.max(0.02, 1 - d * (1 - flat) * (1 - flat)))];
    }) });
  }
  // un trait fin (w pixels d'art) le long d'une ligne brisée du modèle ; c : couleur ou fn(X, Y) ; clip : sur la peinture
  line(f, pts, c, o = {}) {
    const { A, s, px } = this, w = o.w || 1;
    let last = -1;
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, y0] = f.fwd(pts[i][0], pts[i][1]), [x1, y1] = f.fwd(pts[i + 1][0], pts[i + 1][1]);
      const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * s * 2) + 1;
      for (let k = 0; k <= n; k++) {
        const X = Math.floor(this.pX(x0 + ((x1 - x0) * k) / n) - (w - 1) / 2), Y = Math.floor(this.pY(y0 + ((y1 - y0) * k) / n) - (w - 1) / 2);
        const key = Y * A + X;
        if (key === last) continue;
        last = key;
        for (let j = 0; j < w; j++) for (let q = 0; q < w; q++) {
          const xx = X + q, yy = Y + j;
          if (xx < 0 || yy < 0 || xx >= A || yy >= A) continue;
          const ii = yy * A + xx;
          if (o.clip && !px[ii]) continue;
          const v = typeof c === 'function' ? c(xx, yy, px[ii]) : c;
          if (v != null) px[ii] = v; // null : un trou du pointillé, on laisse ce qui est dessous
        }
      }
    }
  }
  dot(f, x, y, c) { const [u, v] = f.fwd(x, y), X = Math.floor(this.pX(u)), Y = Math.floor(this.pY(v)); if (X >= 0 && Y >= 0 && X < this.A && Y < this.A) this.px[Y * this.A + X] = c; }
  // un éclat : une petite croix lumineuse (r pixels d'art), cœur blanc
  glint(f, x, y, r, c1 = hex('fffbe8'), c2 = hex('f8d878')) {
    const [u, v] = f.fwd(x, y), X = Math.floor(this.pX(u)), Y = Math.floor(this.pY(v)), A = this.A;
    const put = (xx, yy, c) => { if (xx >= 0 && yy >= 0 && xx < A && yy < A) this.px[yy * A + xx] = c; };
    for (let k = 1; k <= r; k++) { const c = k <= r / 2 ? c1 : c2; put(X + k, Y, c); put(X - k, Y, c); put(X, Y + k, c); put(X, Y - k, c); }
    if (r >= 3) { put(X + 1, Y + 1, c2); put(X - 1, Y - 1, c2); put(X + 1, Y - 1, c2); put(X - 1, Y + 1, c2); }
    put(X, Y, c1);
  }
  // assombrit (k < 1) ou éclaircit ce qui est déjà peint dans une forme
  tint(f, sd, k) {
    const { A, s, px } = this;
    for (let Y = 0; Y < A; Y++) for (let X = 0; X < A; X++) {
      const i = Y * A + X;
      if (!px[i]) continue;
      const [u, v] = f.inv(this.mu(X), this.mv(Y));
      if (sd(u, v) <= 0) px[i] = scale(px[i], k);
    }
  }
  // efface (laisse transparent) l'intérieur d'une forme
  erase(f, sd) {
    const { A, s, px } = this;
    for (let Y = 0; Y < A; Y++) for (let X = 0; X < A; X++) {
      const [u, v] = f.inv(this.mu(X), this.mv(Y));
      if (sd(u, v) <= 0) px[Y * A + X] = 0;
    }
  }
  // le contour d'un pixel d'art autour de la silhouette
  outline(c = OUT) {
    const { A } = this, src = this.px.slice(), o = (x, y) => x >= 0 && y >= 0 && x < A && y < A && src[y * A + x] >>> 24 === 255;
    for (let y = 0; y < A; y++) for (let x = 0; x < A; x++) {
      if (src[y * A + x] >>> 24 !== 255 && (o(x - 1, y) || o(x + 1, y) || o(x, y - 1) || o(x, y + 1))) this.px[y * A + x] = c;
    }
  }
}

// ------------------------------------------------------------ textures construites (pas de bruit au hasard)
// veines du bois le long de l'axe x du modèle (fréquence : veines par unité), décalées par une ondulation lente
const grain = (D, fq = 0.75, amp = 0.9, ph = 0) => (x, y) => {
  if (!D.hi) return 0;
  const g = y * fq + amp * Math.sin(x * 0.42 + ph) + 0.4 * Math.sin(x * 1.3 + y * 0.6 + ph * 2);
  const fr = g - Math.floor(g);
  return fr < 0.16 ? -1.1 : fr < 0.3 ? -0.4 : fr > 0.8 ? 0.35 : 0;
};
// une couture en pointillés (un point sur deux le long d'un trait)
const dashed = (c, step = 2) => (X, Y) => (((X + Y) / step) | 0) % 2 === 0 ? c : null;

// ------------------------------------------------------------ morceaux réutilisés
// le Colt Single Action Army, canon vers la droite (repère f : on peut le tourner, le retourner, le réduire)
function revolver(g, D, f = I) {
  const st = M.steel;
  // la crosse de noyer, sous la carcasse
  const grip = grow(sPoly([[6.6, 14.2], [10.8, 15.4], [9.8, 19.6], [9.6, 23.2], [10.4, 26.4], [9.4, 27.4], [4.8, 27.4], [3.6, 26.2], [3.8, 22.2], [5.2, 17.4]]), 0.4);
  g.shape(f, grip, M.wood, { bev: D.lo ? 1.2 : 1.6, edge: D.hi ? true : undefined, tex: (x, y) => grain(D, 0.9, 0.7)(y * 0.4 - x * 0.9, x * 0.4 + y * 0.9) });
  if (D.hi) {
    // le dos de la poignée et la vis de crosse
    g.shape(f, sTube([[6.4, 14.4], [5, 17.6], [3.9, 22.4], [3.7, 26.6]], 0.55), st, { bev: 0.6 });
    g.ball(f, 7.4, 21, 0.75, 0.75, M.brass);
  }
  g.shape(f, sTube([[3.8, 27.3], [9.8, 27.3]], D.lo ? 0.7 : 0.55), st, { bev: 0.6 });
  // le pontet de laiton et la détente
  g.shape(f, X(sRing(11.2, 16.4, 2.5, D.lo ? 0.75 : 0.6), (x, y) => 15.6 - y), M.brass, { bev: 0.7 });
  g.shape(f, sTube([[11.2, 15.4], [10.5, 17.6]], 0.45, 0.35), st, { bev: 0.5 });
  // le canon et le logement de la baguette d'éjection
  g.shape(f, sBox(19.2, 12.9, 4, D.lo ? 1 : 0.8, 0.5), st, { bev: 0.9, add: -0.4, edge: D.hi ? true : undefined });
  if (D.hi) g.ball(f, 23.2, 13, 0.75, 0.75, st);
  g.shape(f, sBox(22, 10.6, 8.6, 1.55, 0.35), st, { bev: 1.6, edge: D.hi ? true : undefined, drop: D.hi ? 1 : 0 });
  g.shape(f, sPoly([[28.6, 9.3], [29.4, 8.1], [30.2, 8.1], [30.4, 9.3]]), st, { bev: 0.4 });
  // la carcasse, le barillet cannelé, le chien
  g.shape(f, sPoly([[6.4, 8.8], [15.2, 8.8], [15.2, 14.4], [13.6, 15.8], [9.6, 16.2], [6.2, 14.6]]), st, { bev: 0.8, add: -0.5 });
  g.shape(f, sBox(11.7, 11.6, 3.4, 3.15, 0.9), st, { bev: 3.2, edge: D.lo ? undefined : true, drop: D.hi ? 1 : 0, nrm: (x, y) => { const t = clamp((y - 11.6) / 3.3, -0.95, 0.95); return [0, t, Math.sqrt(1 - t * t)]; } });
  if (!D.lo) {
    for (const fy of D.hi ? [9.9, 11.6, 13.3] : [11.6]) g.line(f, [[9, fy], [14.4, fy]], (X, Y, p) => scale(p, 0.55), { clip: true });
    if (D.xhi) g.line(f, [[9.2, 9.2], [14.2, 9.2]], hex('dfe8f4'), { clip: true });
  }
  g.shape(f, sPoly([[6.8, 9.2], [5.6, 7.6], [4.4, 7], [4.4, 6.1], [6, 6.1], [8.6, 8.8]]), st, { bev: 0.6, edge: D.hi ? true : undefined });
  if (D.xhi) {
    // gravures en volutes sur la carcasse
    const ink = (X, Y, p) => scale(p, 0.7);
    g.line(f, arcPts(8.4, 12.6, 1.2, 1, -Math.PI, Math.PI * 0.6), ink, { clip: true });
    g.line(f, arcPts(7.6, 13.7, 0.6, 0.5, 0, Math.PI * 1.6), ink, { clip: true });
  }
  if (!D.lo) g.glint(f, 18, 9.8, D.xhi ? 3 : D.hi ? 2 : 1, hex('f2f6fc'), hex('9aaac4'));
}

// une carabine (Winchester 1866 au boîtier de laiton) couchée, canon à droite, dans le repère f (longueur -3..35)
function winchester(g, D, f) {
  const wd = M.wood;
  // la crosse et sa plaque de couche
  const stock = grow(sPoly([[9.6, 15], [-2.6, 15.8], [-2.8, 20.6], [-1.6, 20.8], [8.6, 17.6], [9.6, 17.4]]), 0.3);
  g.shape(f, stock, wd, { bev: 1.6, edge: D.lo ? undefined : true, tex: grain(D, 0.8, 0.6) });
  g.shape(f, sBox(-2.7, 18.2, 0.55, 2.7, 0.3), M.steel, { bev: 0.5 });
  // le levier en boucle sous le boîtier
  g.shape(f, U(sRing(10.6, 19.6, 1.55, D.lo ? 0.6 : 0.48), sTube([[12.1, 19.2], [14.4, 17.4]], D.lo ? 0.6 : 0.48)), M.steel, { bev: 0.5 });
  // le canon et le magasin tubulaire
  g.shape(f, sBox(25, 17.1, 9.4, D.lo ? 0.9 : 0.75, 0.6), M.steel, { bev: 0.8, add: -0.6 });
  g.shape(f, sBox(25.2, 15.1, 10, 0.95, 0.4), M.steel, { bev: 1, edge: D.hi ? true : undefined });
  g.shape(f, sPoly([[34.2, 14.3], [34.7, 13.3], [35.2, 13.3], [35.2, 14.3]]), M.steel, {});
  // le fût de bois et les grenadières
  g.shape(f, sBox(19.6, 16.2, 4.4, 1.55, 0.9), wd, { bev: 1.5, edge: D.lo ? undefined : true, tex: grain(D, 0.8, 0.5, 2) });
  if (!D.lo) for (const bx of [24.3, 32.6]) g.shape(f, sBox(bx, 16.1, 0.45, 2.05, 0.2), M.brass, { bev: 0.5 });
  // le boîtier de laiton, le chien
  g.shape(f, sPoly([[9.4, 14.3], [15.4, 14.3], [15.4, 17.7], [14.2, 18.3], [9.4, 18]]), M.brass, { bev: 1, edge: true, drop: D.hi ? 1 : 0 });
  if (D.hi) {
    g.line(f, [[10.6, 15.6], [13.8, 15.6], [14.4, 16.8]], (X, Y, p) => scale(p, 0.7), { clip: true });
    g.ball(f, 12.6, 16.9, 0.45, 0.45, M.brass);
  }
  g.shape(f, sPoly([[9.6, 14.4], [8.4, 12.9], [8.8, 12.4], [10.4, 14.2]]), M.steel, { bev: 0.4 });
  if (!D.lo) g.glint(f, 13, 15, D.hi ? 2 : 1);
}

// la flèche (tige de bois clair, pointe de silex, empennage), couchée, pointe à droite de x0 à x1, sur y
function arrow(g, D, f, x0, x1, y, barbed = false) {
  g.shape(f, sBox((x0 + x1) / 2, y, (x1 - x0) / 2, D.lo ? 0.65 : 0.45, 0.3), M.oak, { bev: 0.5, add: 0.5 });
  // l'empennage : deux plumes, hautes à l'arrière, qui s'effilent vers l'avant ; une bande sombre, les barbes
  const fe = (sgn) => sPoly([[x0, y], [x0 + 0.3, y + sgn * 2.1], [x0 + 2.8, y + sgn * 2.2], [x0 + 6, y + sgn * 1.2], [x0 + 7.8, y + sgn * 0.35], [x0 + 7.8, y]]);
  const red = mat(PAL.red, 0.6, 0.6), wht = mat(PAL.cloth, 0.6, 0.7);
  const vane = (k) => (x, y, X, Y) => (D.hi && x > x0 + 2 && x < x0 + 3 ? k : D.xhi && (X + Y * (y < 16 ? 1 : -1)) % 3 === 0 ? -0.6 : 0);
  g.shape(f, fe(-1), red, { bev: 1, edge: D.lo ? undefined : true, tex: vane(-2) });
  g.shape(f, fe(1), wht, { bev: 1, edge: D.lo ? undefined : true, tex: vane(-2.5) });
  const hp = barbed
    ? [[x1 + 3.6, y], [x1 - 0.6, y - 2.2], [x1 + 0.4, y - 0.8], [x1 - 1.8, y - 2.1], [x1 - 1.2, y - 0.5], [x1 - 1.2, y + 0.5], [x1 - 1.8, y + 2.1], [x1 + 0.4, y + 0.8], [x1 - 0.6, y + 2.2]]
    : [[x1 + 3.6, y], [x1 - 0.2, y - 1.9], [x1 - 0.6, y], [x1 - 0.2, y + 1.9]];
  g.shape(f, sPoly(hp), barbed ? M.iron : mat(PAL.lead, 0.42, 1.1, 0.7, 12), { bev: 1, edge: D.hi ? true : undefined });
  if (D.hi) g.line(f, [[x1 - 0.8, y - 0.6], [x1 - 0.8, y + 0.6]], hex('c8b48a'));
}

// un cylindre couché le long de l'axe x du repère (rayon r, demi-longueur hw), modelé en travers ; vertical si vert
function cyl(g, f, cx, cy, hw, r, m, o = {}) {
  const sd = o.vert ? sBox(cx, cy, r, hw, o.rr ?? 0.4) : sBox(cx, cy, hw, r, o.rr ?? 0.4);
  g.shape(f, sd, m, { ...o, nrm: (x, y) => { const t = clamp((o.vert ? x - cx : y - cy) / (r + 0.3), -0.96, 0.96); return o.vert ? [t, 0, Math.sqrt(1 - t * t)] : [0, t, Math.sqrt(1 - t * t)]; } });
}

// une goutte de sang (pointe en haut), centrée en (cx, cy), haute de 2 × h unités
function drop(g, D, f, cx, cy, h, o = {}) {
  const r = h * 0.62;
  const sd = sSmooth(sCirc(cx, cy + h - r, r), sPoly([[cx, cy - h], [cx + r * 0.75, cy + h - r * 1.25], [cx - r * 0.75, cy + h - r * 1.25]]), r * 0.4);
  g.shape(f, sd, M.red, { bev: r * 1.2, prof: 'soft', add: o.add || 0 });
  if (!D.lo || h > 6) g.shape(f, sEll(cx - r * 0.38, cy + h - r * 1.15, r * 0.22, r * 0.36), M.red, { col: hex('fbe2d4') });
}

// un œil en amande (blanc, iris, pupille, reflet), centré en (cx, cy), demi-largeur w, demi-hauteur hh × w :
// l'amande est l'intersection de deux cercles de rayon R décalés de ± o en hauteur
function eye(g, D, f, cx, cy, w, iris = M.green, hh = 0.3) {
  const R = (w / hh + hh * w) / 2, o = (w / hh - hh * w) / 2;
  const lid = X(sCirc(cx, cy + o, R), sCirc(cx, cy - o, R)), ir = Math.min(w * 0.45, hh * w * 1.25);
  g.shape(f, lid, M.cloth, { bev: hh * w, add: 0.3, edge: D.lo ? undefined : true });
  const ix = cx + w * 0.05;
  g.shape(f, X(sCirc(ix, cy, ir), lid), iris, { nrm: (x, y) => { const nx = ((x - ix) / ir) * 0.7, ny = ((y - cy) / ir) * 0.7; return [nx, ny, Math.sqrt(Math.max(0.05, 1 - nx * nx - ny * ny))]; } });
  g.shape(f, X(sCirc(ix, cy, ir * 0.45), lid), M.cloth, { col: BLACK });
  if (!D.lo) g.ball(f, ix - ir * 0.35, cy - ir * 0.35, ir * 0.22 + 0.25, ir * 0.22 + 0.25, M.cloth, { col: hex('fffdf6') });
  // la paupière du haut, plus épaisse
  g.shape(f, X(lid, (x, y) => -(Math.hypot(x - cx, y - cy - o) - R + (D.lo ? 1.5 : 0.9))), M.cloth, { col: INK });
}

// une étoile à facettes (n branches) : chaque branche a un pan dans la lumière et un dans l'ombre
function facetStar(g, D, f, cx, cy, n, ro, ri, m, o = {}) {
  const a0 = -Math.PI / 2;
  g.shape(f, sPoly(starPts(cx, cy, n, ro, ri, a0)), m, { nrm: starNrm(cx, cy, n, a0, o.tilt ?? 0.62), edge: o.edge, add: o.add || 0 });
}

// une petite silhouette de cow-boy (matière m), posée par ses articulations (repère du modèle)
// j : { hip, neck, head, hat (angle), arms: [[épaule, coude, main]...], legs: [[hanche, genou, pied]...] }
function figure(g, D, f, j, m, o = {}) {
  const r = (v) => (D.lo ? v * 1.15 : v);
  const back = { ...o, add: (o.add || 0) - 0.8 };
  if (j.legs) j.legs.forEach((l, k) => g.shape(f, sTube(l, r(1.6), r(1.3)), m, { bev: 1.6, ...(k === 0 && j.legs.length > 1 ? back : o) }));
  if (j.arms && j.arms[1]) g.shape(f, sTube(j.arms[1], r(1.2), r(1.05)), m, { bev: 1.2, ...back });
  g.shape(f, sTube([j.hip, j.neck], r(2.7), r(2.4)), m, { bev: 2.6, edge: D.hi && o.edge !== false ? true : undefined, ...o });
  if (j.arms) g.shape(f, sTube(j.arms[0], r(1.25), r(1.05)), m, { bev: 1.2, edge: D.hi && o.edge !== false ? true : undefined, ...o });
  const [hx, hy] = j.head, a = j.hat ?? 0;
  g.ball(f, hx, hy, r(2.3), r(2.4), m, o);
  // le chapeau : un bord large et une calotte pincée
  const brim = sRot(sEll(hx, hy - 1.6, r(4.4), r(1.05)), hx, hy, a);
  const crown = sRot(grow(sPoly([[hx - 2.2, hy - 1.8], [hx - 1.9, hy - 4.6], [hx, hy - 4.1], [hx + 1.9, hy - 4.6], [hx + 2.2, hy - 1.8]]), 0.3), hx, hy, a);
  g.shape(f, crown, m, { bev: 1.2, add: (o.add || 0) - 0.5 });
  g.shape(f, brim, m, { bev: 0.8, add: (o.add || 0) - 0.2 });
}

// la botte de cow-boy de profil, bout pointu vers la droite, avec l'éperon
function boot(g, D, f) {
  const lt = M.leather;
  // l'éperon : la branche et la molette étoilée
  g.shape(f, sTube([[10.4, 22.4], [6.6, 23]], D.lo ? 0.75 : 0.55), M.iron, { bev: 0.5, add: 0.6 });
  g.shape(f, sPoly(starPts(5.4, 23.2, 6, D.lo ? 2.8 : 2.6, 1.1, 0)), M.iron, { nrm: starNrm(5.4, 23.2, 6, 0, 0.5), add: 0.6 });
  if (!D.lo) g.ball(f, 5.4, 23.2, 0.65, 0.65, M.brass);
  // la tige, un peu galbée, et ses tirants
  const shaft = grow(sPoly([[10.8, 3.6], [15, 5], [19.2, 3.6], [19.6, 8.4], [19.2, 17.4], [10.6, 18], [10.2, 9.4]]), 0.4);
  g.shape(f, shaft, lt, { bev: 2.4, edge: D.lo ? undefined : true, nrm: (x) => { const t = clamp((x - 15) / 5.2, -0.9, 0.9); return [t, 0, Math.sqrt(1 - t * t)]; } });
  if (!D.lo) {
    g.shape(f, U(sArc(12.2, 3.6, 1.3, 0.42, Math.PI, Math.PI * 2), sArc(17.8, 3.6, 1.3, 0.42, Math.PI, Math.PI * 2)), mat(PAL.leather, 0.6, 0.8), { bev: 0.4 });
    g.shape(f, sBox(15, 5.2, 4.6, 0.8, 0.3), lt, { clip: true, nrm: () => [0, 0, 1], add: -1 });
  }
  // le pied : le cou-de-pied qui descend vers la pointe, relevée
  const foot = grow(sPoly([[10.4, 16.6], [19.2, 16.4], [22.6, 19.4], [27.6, 21.6], [29.8, 23.2], [29.4, 24.8], [13.6, 25], [10.2, 24.8]]), 0.5);
  g.shape(f, foot, lt, { bev: 2.6, edge: D.lo ? undefined : true, drop: D.hi ? 1 : 0, tex: (x, y) => (x > 25.4 ? -0.7 : 0) });
  if (!D.lo) g.line(f, [[24.4, 19.6], [25.2, 22.4], [24.4, 25]], PAL.leather[2], { clip: true });
  // le talon biseauté et la semelle
  g.shape(f, sPoly([[9.8, 24.4], [14.4, 24.6], [13.4, 29], [10.6, 29]]), M.bag, { bev: 0.8, add: 0.8, edge: D.lo ? undefined : true });
  g.shape(f, grow(sPoly([[13.2, 25.2], [29.8, 24.6], [30.2, 25.6], [13.2, 26.2]]), 0.2), M.bag, { bev: 0.4, add: 0.6 });
  if (D.hi) {
    // les surpiqûres de la tige : deux arcs en U et une feuille
    const st = hex('e8c890');
    g.line(f, arcPts(15, 8.8, 2.8, 5.6, 0, Math.PI, 16), st, { clip: true });
    g.line(f, arcPts(15, 8.8, 1.4, 3, 0, Math.PI, 10), st, { clip: true });
    g.line(f, [[11.4, 17], [19, 16.8]], dashed(st), { clip: true });
  }
}

// ------------------------------------------------------------ les dessins
const ART = {
  // ---------------------------------------------------------------- armes
  revolver(g, D) { revolver(g, D, frame(16.4, 16, -0.08)); },

  winchester(g, D) { winchester(g, D, frame(16.4, 16.4, -Math.PI / 4, 0.8, 0.8 * thick(D))); },

  // fusil de chasse à deux canons juxtaposés (vus un peu d'en haut : on voit les deux), crosse droite à l'anglaise
  fusil(g, D) {
    const f = frame(16.4, 16.2, -Math.PI / 4, 0.82, 0.82 * thick(D));
    const stock = grow(sPoly([[9.4, 15.6], [-2.6, 15.8], [-2.6, 20.6], [-1.6, 20.8], [8.6, 18.2], [9.4, 18]]), 0.3);
    g.shape(f, stock, M.oak, { bev: 1.6, edge: D.lo ? undefined : true, tex: grain(D, 0.7, 0.8, 1) });
    if (D.hi) g.shape(f, sBox(-2.7, 18.2, 0.5, 2.6, 0.3), M.bag, { bev: 0.5, add: 1 });
    // les deux canons et la bande entre eux
    g.shape(f, sBox(22.4, 17.7, 9.6, D.lo ? 1.2 : 1.05, 0.5), M.steel, { bev: 1.1, add: -0.4, edge: D.lo ? undefined : true });
    g.shape(f, sBox(22.4, 15.4, 9.6, D.lo ? 1.2 : 1.05, 0.5), M.steel, { bev: 1.1, edge: D.lo ? undefined : true });
    if (D.lo) g.line(f, [[14, 16.55], [31.6, 16.55]], PAL.steel[0]);
    // les bouches : deux trous noirs
    for (const by of [15.4, 17.7]) g.shape(f, sEll(31.7, by, 0.55, D.lo ? 0.75 : 0.6), M.steel, { col: BLACK });
    // le devant de bois
    g.shape(f, sBox(18, 18.6, 3.4, 1.25, 0.8), M.oak, { bev: 1.2, edge: D.lo ? undefined : true, tex: grain(D, 0.7, 0.5, 3) });
    // la bascule gravée, les deux chiens, le pontet et les deux détentes
    g.shape(f, sTube([[11.6, 18.8], [11, 20.4], [9, 20.8], [8.4, 19.4]], D.lo ? 0.55 : 0.42), M.steel, { bev: 0.4 });
    g.shape(f, sPoly([[8.8, 14.4], [13.8, 14.4], [13.8, 18.8], [9.6, 18.8], [8.8, 18]]), M.iron, { bev: 0.9, edge: true, drop: D.hi ? 1 : 0, add: 0.4 });
    if (D.hi) {
      const ink = (X, Y, p) => scale(p, 0.72);
      g.line(f, arcPts(11.2, 16.6, 1.3, 1.1, -Math.PI, Math.PI * 0.7), ink, { clip: true });
      if (D.xhi) g.line(f, arcPts(12.4, 17.6, 0.6, 0.5, 0, Math.PI * 1.7), ink, { clip: true });
    }
    for (const [hx, k] of [[9.4, -0.6], [10.8, 0]]) g.shape(f, sPoly([[hx, 14.6], [hx - 1.6, 12.6], [hx - 1, 12.2], [hx + 1, 14.4]]), M.steel, { bev: 0.4, add: k });
    if (!D.lo) g.glint(f, 25, 14.6, D.hi ? 2 : 1, hex('f2f6fc'), hex('9aaac4'));
  },

  // fusil Sharps : long canon octogonal, lunette de laiton sur toute la longueur, plaque de crosse
  sharps(g, D) {
    const f = frame(16.2, 16.6, -Math.PI / 4, 0.76, 0.76 * thick(D));
    const stock = grow(sPoly([[9.4, 15.6], [-3.4, 16.4], [-3.4, 21.4], [-2.2, 21.6], [7.8, 18.6], [9.4, 18.2]]), 0.3);
    g.shape(f, stock, M.wood, { bev: 1.6, edge: D.lo ? undefined : true, tex: grain(D, 0.8, 0.6, 4) });
    g.shape(f, sBox(-3.5, 18.8, 0.55, 2.8, 0.3), M.steel, { bev: 0.5 });
    if (D.hi) g.shape(f, sEll(2.4, 18.3, 1.8, 0.95), M.brass, { bev: 0.8 });
    // le canon octogonal (des pans plats : trois bandes de lumière)
    g.shape(f, sBox(24.2, 16.4, 12.4, D.lo ? 1.1 : 0.95, 0), M.steel, { tex: (x, y) => (y < 15.95 ? 1.2 : y < 16.85 ? 0 : -1.2) * (D.lo ? 0.6 : 1), add: 0.2 });
    // le fût court en bec
    g.shape(f, grow(sPoly([[12.8, 16.8], [22.6, 16.8], [23.6, 17.6], [22.4, 18.6], [12.8, 18.6]]), 0.3), M.wood, { bev: 1.1, edge: D.lo ? undefined : true, tex: grain(D, 0.8, 0.5, 6) });
    // le boîtier, le levier-pontet, le chien de côté
    g.shape(f, sTube([[12, 18.8], [11.4, 20.4], [8.8, 20.6], [8.4, 19.2]], D.lo ? 0.55 : 0.42), M.steel, { bev: 0.4 });
    g.shape(f, sPoly([[9.2, 15.2], [13.2, 15.2], [13.2, 18.8], [9.6, 18.8], [9.2, 18.2]]), M.iron, { bev: 0.8, edge: true, add: 0.3 });
    g.shape(f, sPoly([[10, 15.4], [8.8, 13.6], [9.4, 13.2], [10.8, 15.2]]), M.steel, { bev: 0.4 });
    // la lunette : un long tube de laiton, les colliers, les deux bouts évasés
    g.shape(f, U(sTube([[11.4, 14.2], [11.4, 15.4]], 0.4), sTube([[27.4, 14.2], [27.4, 15.6]], 0.4)), M.steel, { bev: 0.3 });
    g.shape(f, sBox(19.6, 13.4, 10.4, D.lo ? 1.05 : 0.95, 0.6), M.brass, { bev: 0.8, edge: D.hi ? true : undefined, drop: D.hi ? 1 : 0 });
    g.shape(f, U(sBox(8.2, 13.4, 1.4, 1.35, 0.4), sBox(30.6, 13.4, 1.4, 1.55, 0.4)), M.brass, { bev: 1.2, edge: D.lo ? undefined : true });
    if (!D.lo) {
      g.line(f, [[31.7, 12.6], [31.7, 14.2]], hex('8ab8e0'));
      g.glint(f, 22, 12.9, D.hi ? 2 : 1);
    }
  },

  // arc amérindien bandé, la flèche encochée, pointée vers le haut à droite
  arc(g, D) {
    const f = frame(16.6, 15.4, -Math.PI / 4, 1, D.lo ? 1.08 : 1);
    // la corde tirée en V jusqu'à l'encoche
    const sc = hex('efe4c6');
    g.line(f, [[19.6, 2.8], [9.2, 16], [19.6, 29.2]], sc);
    arrow(g, D, f, 8.6, 27.4, 16);
    // les branches de l'arc (un peu réflexes), plus fines aux bouts
    const t0 = D.lo ? 0.9 : D.hi ? 1 : 0.65, t1 = D.lo ? 1.5 : D.hi ? 2 : 1.35;
    const limb = sTube([[19.2, 2.6], [21.4, 4.6], [23.4, 9], [24.6, 13.6], [24.8, 16]], t0, t1);
    const limb2 = sTube([[24.8, 16], [24.6, 18.4], [23.4, 23], [21.4, 27.4], [19.2, 29.4]], t1, t0);
    g.shape(f, U(limb, limb2), M.wood, { bev: 1.4, edge: D.lo ? undefined : true, add: 0.6 });
    // la poignée gainée de cuir rouge, les ligatures de tendon aux bouts
    g.shape(f, sBox(24.9, 16, 1.7, 2.6, 0.8), M.redm, { bev: 1.6, edge: D.lo ? undefined : true });
    if (!D.lo) {
      for (const yy of [14.4, 15.4, 16.6, 17.6]) g.line(f, [[23.4, yy], [26.4, yy + 0.3]], (X, Y, p) => scale(p, 0.7), { clip: true });
      g.shape(f, U(sBox(20.6, 3.8, 0.9, 0.6, 0.3), sBox(20.6, 28.2, 0.9, 0.6, 0.3)), M.cream, { bev: 0.5 });
    }
    if (D.hi) {
      // deux plumes pendues à la poignée
      g.line(f, [[26.4, 17.6], [28.2, 20.6]], hex('c8b48a'));
      g.shape(f, sRot(sEll(29, 22.8, 0.9, 2.4), 29, 22.8, -0.5), M.cloth, { bev: 0.8, edge: true, tex: (x, y) => (y > 23.6 ? -3 : 0) });
    }
  },

  // ---------------------------------------------------------------- armures
  // veste de cuir à franges : empiècement en V frangé, franges aux manches et à l'ourlet, conchos d'argent
  cuir(g, D) {
    const lt = M.leather, f = I;
    const fr = (x0, x1, y0, len, step) => {
      // une rangée de franges : de petites lanières, une sur deux plus claire
      for (let x = x0, k = 0; x <= x1; x += step, k++) g.shape(f, sBox(x, y0 + len / 2, step * 0.28, len / 2, step * 0.2), lt, { add: k & 1 ? -0.6 : 0.4, bev: step * 0.3 });
    };
    // les manches
    for (const sx of [-1, 1]) {
      const p = [[16 + sx * 7.6, 6.8], [16 + sx * 11.6, 10.4], [16 + sx * 13, 24.2], [16 + sx * 9.6, 24.6], [16 + sx * 8.8, 15]];
      g.shape(f, grow(sPoly(p), 0.5), lt, { bev: 2.2, edge: D.lo ? undefined : true, add: sx > 0 ? -0.5 : 0.2 });
    }
    fr(D.lo ? 4.4 : 3.9, D.lo ? 6 : 6.9, 24.4, D.lo ? 2.6 : 3, D.lo ? 1.6 : 1);
    fr(D.lo ? 26 : 25.1, D.lo ? 27.6 : 28.1, 24.4, D.lo ? 2.6 : 3, D.lo ? 1.6 : 1);
    // le corps
    const body = grow(sPoly([[9.4, 6.2], [13.2, 4.6], [16, 6.8], [18.8, 4.6], [22.6, 6.2], [24.4, 10], [24, 26.4], [8, 26.4], [7.6, 10]]), 0.5);
    g.shape(f, body, lt, { bev: 3, edge: D.lo ? undefined : true, g: [-0.03, -0.02], drop: D.hi ? 1 : 0 });
    // l'ouverture : la chemise sombre et les revers
    g.shape(f, sPoly([[13.2, 5], [16, 7.2], [18.8, 5], [17.4, 16], [16, 26.6], [14.6, 16]]), M.redm, { add: -2.2, tex: (x, y, X, Y) => (D.hi && (((X >> 1) + (Y >> 1)) & 1) ? -0.6 : 0) });
    for (const sx of [-1, 1]) g.shape(f, sPoly([[16 - sx * 2.8, 4.8], [16 - sx * 0.6, 7.6], [16 - sx * 1.6, 13], [16 - sx * 4.2, 8.4]]), lt, { bev: 1, edge: D.lo ? undefined : true, add: sx > 0 ? 0.8 : 0.1 });
    // l'empiècement frangé en V sur la poitrine
    if (!D.lo) {
      g.line(f, [[8.4, 11], [13.6, 14.6]], PAL.leather[1]);
      g.line(f, [[23.6, 11], [18.4, 14.6]], PAL.leather[1]);
      for (let k = 0; k <= 5; k++) {
        const t = k / 5, x = 8.8 + t * 4.6, y = 11.4 + t * 3.2;
        g.shape(f, sBox(x, y + 1.3, 0.3, 1.3, 0.2), lt, { add: k & 1 ? -0.4 : 0.6 });
        g.shape(f, sBox(32 - x, y + 1.3, 0.3, 1.3, 0.2), lt, { add: k & 1 ? -0.8 : 0 });
      }
    }
    // les franges de l'ourlet
    fr(D.lo ? 9 : 8.6, D.lo ? 23.4 : 23.6, 26.4, D.lo ? 2.6 : 3.2, D.lo ? 1.8 : 1);
    if (D.hi) {
      // les conchos et les surpiqûres
      for (const [x, y] of [[11, 18.4], [21, 18.4]]) g.ball(f, x, y, 0.9, 0.9, M.pewter);
      g.line(f, [[9.2, 24.8], [22.8, 24.8]], dashed(hex('d8a86c')), { clip: true });
    }
  },

  // cache-poussière long : grande cape d'épaules, col rabattu, pans qui s'écartent sur la doublure sombre
  duster(g, D) {
    const f = I, du = M.dust;
    for (const sx of [-1, 1]) {
      const p = [[16 + sx * 7, 7.4], [16 + sx * 11.2, 11], [16 + sx * 12.6, 21.8], [16 + sx * 9.4, 22.2], [16 + sx * 8.6, 14]];
      g.shape(f, grow(sPoly(p), 0.5), du, { bev: 2, edge: D.lo ? undefined : true, add: sx > 0 ? -0.6 : 0.1, tex: (x, y) => (y > 19.8 ? -0.9 : 0) });
    }
    // le long corps évasé, ses plis
    const body = grow(sPoly([[10, 6.6], [16, 7.4], [22, 6.6], [23.6, 11], [26.2, 29.4], [5.8, 29.4], [8.4, 11]]), 0.4);
    g.shape(f, body, du, { bev: 2.6, edge: D.lo ? undefined : true, g: [-0.04, 0], drop: D.hi ? 1 : 0, tex: (x, y) => (D.hi ? 0.55 * Math.sin((x - 16) * 0.8) * clamp((y - 14) / 12, 0, 1) : 0) });
    // les pans qui s'ouvrent en bas sur la doublure
    g.shape(f, sPoly([[15.5, 19], [16.5, 19], [19.4, 29.6], [12.6, 29.6]]), du, { col: PAL.dust[0], edge: D.lo ? undefined : INK });
    g.line(f, [[16, 8.6], [16, 19.4]], PAL.dust[1]);
    if (!D.lo) {
      // les rabats des poches, les boutons
      for (const x of [11.2, 20.8]) {
        g.shape(f, sBox(x, 21.6, 2.2, 0.8, 0.3), du, { bev: 0.6, add: 0.6, edge: PAL.dust[1] });
      }
      for (const y of [15.4, 17.8]) g.ball(f, 17.2, y, 0.6, 0.6, M.bag, { add: 1 });
    }
    // la cape d'épaules, qui fait de l'ombre sur le corps
    const cape = grow(sPoly([[10.2, 6], [16, 7.6], [21.8, 6], [25.6, 10.4], [24.8, 14.6], [16, 13.8], [7.2, 14.6], [6.4, 10.4]]), 0.6);
    g.shape(f, cape, du, { bev: 2.4, edge: D.lo ? undefined : true, add: 0.5, drop: D.lo ? 0 : D.hi ? 2 : 1 });
    if (D.hi) g.line(f, [[7.6, 13.6], [16, 12.8], [24.4, 13.6]], dashed(PAL.dust[6]), { clip: true });
    // le col rabattu
    for (const sx of [-1, 1]) g.shape(f, sPoly([[16, 7.8], [16 - sx * 4.8, 5.6], [16 - sx * 5.8, 8.2], [16 - sx * 2, 10.6]]), du, { bev: 0.9, add: sx > 0 ? 1 : 0.4, edge: D.lo ? undefined : true });
  },

  // plastron d'acier riveté : arête au milieu, rivets de laiton au bord, sangles de cuir, une balle écrasée
  plastron(g, D) {
    const f = I;
    g.shape(f, U(sBox(10.4, 5.6, 1.6, 2.6, 0.6), sBox(21.6, 5.6, 1.6, 2.6, 0.6)), M.leather, { bev: 1, edge: D.lo ? undefined : true });
    const body = grow(sPoly([[8.6, 6.4], [12.6, 8.6], [16, 9.4], [19.4, 8.6], [23.4, 6.4], [26, 9.6], [25, 15.4], [26.2, 24], [16, 29], [5.8, 24], [7, 15.4], [6, 9.6]]), 0.6);
    // la normale : une arête verticale au milieu, et le bombé du plastron
    const nrm = (x, y, dist) => {
      const ax = clamp((x - 16) / 9.6, -1, 1), ay = clamp((y - 17) / 13, -1, 1), sx = x < 16 ? -1 : 1;
      let nx = ax * 0.55 + sx * 0.22, ny = ay * 0.45;
      if (dist < 1.4) { nx *= 1.4; ny *= 1.4; }
      const l = Math.hypot(nx, ny);
      if (l > 0.95) { nx *= 0.95 / l; ny *= 0.95 / l; }
      return [nx, ny, Math.sqrt(1 - nx * nx - ny * ny)];
    };
    g.shape(f, body, M.iron, { nrm, edge: D.lo ? undefined : true, drop: D.hi ? 1 : 0 });
    // le bord roulé du col et des emmanchures
    if (!D.lo) g.line(f, [[8.8, 7.2], [12.6, 9.4], [16, 10.2], [19.4, 9.4], [23.2, 7.2]], hex('d8d8de'), { clip: true });
    g.line(f, [[16, 10.4], [16, 28.4]], (X, Y, p) => scale(p, D.lo ? 0.75 : 0.8), { clip: true });
    // les rivets
    const riv = D.lo ? [[8.4, 12], [23.6, 12], [8.6, 22.6], [23.4, 22.6]] : [[8.4, 11.4], [23.6, 11.4], [8.2, 16.6], [23.8, 16.6], [8.6, 22], [23.4, 22], [12, 25.6], [20, 25.6], [16, 27.4]];
    for (const [x, y] of riv) g.ball(f, x, y, D.lo ? 1 : 0.8, D.lo ? 1 : 0.8, M.brass);
    if (D.hi) {
      // la marque d'une balle arrêtée
      g.shape(f, sCirc(19.6, 18.6, 1.3), M.lead, { bev: 1.3, add: -1 });
      g.ball(f, 19.4, 18.4, 0.6, 0.6, M.lead, { add: 1 });
      g.glint(f, 11.6, 13.6, D.xhi ? 3 : 2, hex('ffffff'), hex('c8ccd8'));
    }
  },

  // ---------------------------------------------------------------- objets
  // couteau Bowie : lame à contre-tranchant, fil poli, gouttière, garde de laiton, manche de bois à rivets
  couteau(g, D) {
    const f = frame(16, 16.2, -Math.PI / 4, 0.86, 0.86 * thick(D));
    const blade = sPoly([[12.6, 14.1], [26.2, 14.1], [29.8, 15.1], [34, 16.7], [30.6, 18], [25.6, 18.5], [12.6, 18.5]]);
    g.shape(f, blade, M.steel, {
      edge: D.lo ? undefined : true, drop: D.hi ? 1 : 0, add: 0.6,
      tex: (x, y) => {
        // le fil poli en bas, le dos sombre en haut, le faux tranchant du bout, un reflet en biais
        let l = y > 17 - Math.max(0, x - 26) * 0.1 ? 1.8 : y < 14.9 ? -1 : 0;
        if (x > 26.2 && y < 15.1 + (x - 26.2) * 0.38) l += 1.4;
        if (D.hi && Math.abs((x - 19) - (y - 16) * 0.8) < 0.9) l += 1.2;
        return l;
      },
    });
    if (!D.lo) g.line(f, [[14.4, 15.6], [24.4, 15.6]], (X, Y, p) => scale(p, 0.6), { clip: true });
    if (D.hi) g.line(f, [[14.4, 16.2], [24.4, 16.2]], hex('e2eaf4'), { clip: true });
    // le manche et ses rivets, le pommeau
    const handle = grow(sPoly([[0.6, 15.2], [11.6, 14.8], [11.6, 17.9], [0.6, 18.4], [-0.4, 16.8]]), 0.4);
    g.shape(f, handle, M.wood, { bev: 1.6, edge: D.lo ? undefined : true, tex: grain(D, 0.9, 0.5, 1) });
    if (!D.lo) for (const x of [3.6, 8]) g.ball(f, x, 16.5, 0.65, 0.65, M.brass);
    g.shape(f, sBox(-0.6, 16.8, 1, 2.1, 0.7), M.brass, { bev: 1, edge: D.hi ? true : undefined });
    // la garde en croix, aux bouts en boule
    g.shape(f, sBox(12.4, 16.3, 0.85, 3.6, 0.4), M.brass, { bev: 0.9, edge: D.lo ? undefined : true, drop: D.hi ? 1 : 0 });
    if (!D.lo) for (const y of [12.6, 20]) g.ball(f, 12.4, y, 1.05, 1.05, M.brass);
    if (!D.lo) g.glint(f, 28.6, 16.8, D.hi ? 2 : 1, hex('ffffff'), hex('b4c2d6'));
  },

  // rouleau de bandages : le rouleau couché, sa tranche en spirale, la bande qui se déroule en ruban
  bandages(g, D) {
    if (D.lo) {
      const f = I, cl = M.cloth;
      g.shape(f, sPoly([[5.4, 17], [13, 17], [12.2, 29.6], [4.6, 28.4]]), cl, { bev: 1.4, add: -0.7 });
      cyl(g, f, 13.6, 13.6, 10, 7.2, cl, { rr: 2.4, add: 0.2 });
      g.shape(f, sEll(23.6, 13.6, 3.6, 7.2), cl, { bev: 1.6, add: 1.2 });
      g.shape(f, sEll(24, 13.6, 1.3, 2.4), cl, { col: PAL.cloth[1] });
      g.shape(f, U(sBox(12.4, 13.6, 3.8, 1.4, 0.1), sBox(12.4, 13.6, 1.4, 3.8, 0.1)), M.red, { clip: true, add: 0.4 });
      return;
    }
    const f = I, cl = M.cloth;
    const weave = (x, y, X, Y) => (D.hi && ((X % 3 === 0) || (Y % 3 === 0)) ? -0.3 : 0);
    // la bande déroulée : un ruban qui ondule vers le bas, de plus en plus étroit, effiloché au bout
    const c = D.lo ? [[13.4, 19.4], [14.6, 24.4], [12.4, 28.6]] : [[13.4, 19.4], [15.2, 24.4], [19.6, 27], [24.6, 26.2], [28.6, 27.6]], w = D.lo ? [4.4, 4, 3.6] : [4.4, 4, 3.4, 2.8, 2.5];
    const L = [], R = [];
    c.forEach(([x, y], i) => {
      const [ax, ay] = c[Math.max(0, i - 1)], [bx, by] = c[Math.min(c.length - 1, i + 1)], l = Math.hypot(bx - ax, by - ay);
      const nx = -(by - ay) / l, ny = (bx - ax) / l;
      L.push([x + nx * w[i], y + ny * w[i]]);
      R.push([x - nx * w[i], y - ny * w[i]]);
    });
    const strip = Sub(sPoly([...L, ...R.reverse()]), D.lo ? () => 1 : U(sCirc(29.4, 26.2, 0.6), sCirc(30.2, 28.4, 0.6)));
    g.shape(f, strip, cl, { bev: 1.6, edge: D.lo ? undefined : true, add: -0.5, tex: (x, y, X, Y) => weave(x, y, X, Y) + (x > 21 && y < 26.6 ? -0.8 : 0) });
    // le rouleau : un cylindre couché, plus haut que large
    cyl(g, f, 12.6, 14.4, 4.8, 7.4, cl, { rr: 1.6, edge: D.lo ? undefined : true, drop: D.hi ? 1 : 0, tex: weave });
    // sa tranche à droite : l'ellipse claire et la spirale
    g.shape(f, sEll(17.4, 14.4, 3, 7.4), cl, { bev: 1.4, add: 0.9, edge: D.lo ? undefined : true });
    if (!D.lo) {
      const sp = PAL.cloth[3];
      g.line(f, arcPts(17.6, 14.4, 2, 5.4, -Math.PI * 0.6, Math.PI * 1.15, 18), sp, { clip: true });
      g.line(f, arcPts(17.7, 14.6, 1.1, 3.2, Math.PI * 0.3, Math.PI * 1.9, 12), sp, { clip: true });
    }
    g.shape(f, sEll(17.8, 14.6, D.lo ? 0.9 : 0.6, D.lo ? 1.5 : 1.3), cl, { col: PAL.cloth[2] });
    // une petite croix rouge imprimée sur le rouleau
    const cw = D.lo ? 1.1 : 0.75;
    g.shape(f, U(sBox(11.6, 13.6, 2.4, cw, 0.1), sBox(11.6, 13.6, cw, 2.4, 0.1)), M.redm, { clip: true, add: 0.6 });
  },

  // trousse de médecin : sacoche de cuir, monture et fermoir de laiton, croix rouge sur une pièce blanche
  trousse(g, D) {
    const f = I, lt = mat(PAL.leather, 0.38, 1.0, 0.45, 12);
    // la poignée en arceau et ses pattes
    g.shape(f, X(sEll(16, 10.4, 5.2, 5.4), (x, y) => y - 10.4, (x, y) => -sEll(16, 10.4, 3.4, 3.6)(x, y)), lt, { bev: 0.9, add: 0.6, edge: D.lo ? undefined : true });
    // le corps, ventru
    const body = grow(sPoly([[6.6, 12.2], [25.4, 12.2], [27.4, 26.6], [4.6, 26.6]]), 1.4);
    g.shape(f, body, lt, { bev: 3.4, edge: D.lo ? undefined : true, drop: D.hi ? 1 : 0, g: [0, 0.03] });
    if (D.hi) g.line(f, [[5, 24.2], [27, 24.2]], dashed(PAL.leather[5]), { clip: true });
    // la monture de laiton et le fermoir
    g.shape(f, sBox(16, 12, 10.4, D.lo ? 1.2 : 0.95, 0.5), M.brass, { bev: 0.9, edge: D.hi ? true : undefined });
    g.shape(f, sBox(16, 13.2, 1.7, 1.6, 0.5), M.brass, { bev: 1, edge: D.lo ? undefined : true, drop: D.hi ? 1 : 0 });
    // la croix rouge sur sa pièce blanche
    g.shape(f, sBox(16, 20.2, 4.8, 4.4, 1.2), M.cloth, { bev: 1.2, add: -0.3, edge: D.lo ? undefined : true });
    g.shape(f, U(sBox(16, 20.2, 3.4, D.lo ? 1.3 : 1.15, 0.2), sBox(16, 20.2, D.lo ? 1.3 : 1.15, 3.2, 0.2)), M.red, { bev: 0.8, add: 0.3 });
    // les pieds cloutés
    if (!D.lo) for (const x of [7.6, 24.4]) g.ball(f, x, 27.6, 1, 0.8, M.brass);
  },

  // trois bâtons de dynamite ficelés, la mèche qui crépite
  dynamite(g, D) {
    const f = I;
    for (const [cx, cy, a, k] of [[10.2, 18.4, -0.16, -0.5], [21.8, 18.4, 0.16, -0.7], [16, 17.6, 0, 0.3]]) {
      const sd = sRot(sBox(cx, cy, 2.9, 9.4, 1), cx, cy, a);
      g.shape(f, sd, M.dyn, { add: k, edge: D.lo ? undefined : true, drop: D.hi ? 1 : 0,
        nrm: (x, y) => { const c = Math.cos(a), s = Math.sin(a), u = (x - cx) * c + (y - cy) * s, t = clamp(u / 3.2, -0.95, 0.95); return [t * c, t * s, Math.sqrt(1 - t * t)]; } });
      // le bout de papier plié en haut
      g.shape(f, sRot(sEll(cx, cy - 8.6, 2.3, 0.85), cx, cy, a), M.paper, { bev: 0.8, add: 0.4 });
      if (D.hi) g.shape(f, sRot(sBox(cx, cy + 0.2, 2.9, 1.5, 0), cx, cy, a), M.paper, { clip: true, add: -0.2, nrm: () => [0, 0, 1], tex: (x, y) => (Math.abs(y - cy - 0.2) < 0.35 && Math.abs(x - cx) < 1.6 ? -3 : 0) });
    }
    // les deux tours de ficelle
    for (const y of [12.4, 23.6]) g.shape(f, sBox(16, y, 8.8, D.lo ? 0.75 : 0.6, 0.3), M.burlap, { clip: true, bev: 0.6, add: 0.6 });
    // la mèche, et l'étincelle au bout
    g.shape(f, sTube([[16, 8.6], [16.4, 5.6], [18.4, 3.8], [21, 3.8]], D.lo ? 0.7 : 0.55), M.bag, { bev: 0.5, add: 1.4 });
    g.shape(f, sPoly(starPts(22.6, 3.8, 6, D.lo ? 3 : 3.4, 1.2, 0.3)), M.fire, { add: 1.6 });
    g.glint(f, 22.6, 3.8, D.lo ? 1 : D.hi ? 3 : 2, hex('fffbe8'), hex('fce070'));
  },

  // kit de rafistolage : la clé plate en travers, le pot de graisse devant, deux rivets
  graisse(g, D) {
    const fw = frame(16.6, 15.2, -Math.PI / 4, 0.95);
    const jaw = Sub(sCirc(27.6, 16, 3.9), sBox(30.6, 16, 3.6, 1.6, 0.4));
    const ring = Sub(sCirc(4.6, 16, 3.1), sCirc(4.6, 16, 1.4));
    g.shape(fw, U(sBox(16, 16, 10, 1.45, 0.7), jaw, ring), M.iron, { bev: 1.2, edge: D.lo ? undefined : true, add: 0.4 });
    if (D.hi) g.line(fw, [[9, 16], [22, 16]], (X, Y, p) => scale(p, 0.75), { clip: true });
    const f = I;
    // le pot d'étain : le corps, l'étiquette, le bord, la graisse noire et luisante, une coulure
    cyl(g, f, 10.8, 23, 5.8, 5.6, M.pewter, { vert: true, rr: 0.8, edge: D.lo ? undefined : true, drop: D.hi ? 1 : 0 });
    g.shape(f, sBox(10.8, 23.6, 5.8, 2.3, 0), M.red, { clip: true, nrm: (x) => { const t = clamp((x - 10.8) / 6.2, -0.95, 0.95); return [t, 0, Math.sqrt(1 - t * t)]; }, tex: (x, y) => (D.hi && Math.abs(y - 23.6) < 0.4 && Math.abs(x - 10.8) < 3 ? 3 : 0) });
    g.shape(f, sEll(10.8, 17.4, 5.8, 1.9), M.pewter, { bev: 0.8, add: 0.8, edge: D.lo ? undefined : true });
    g.shape(f, sEll(10.8, 17.5, 4.5, 1.2), M.bag, { add: -0.6, tex: (x, y) => (x < 9.4 && y < 17.4 ? 3 : 0) });
    g.shape(f, U(sTube([[13.6, 18.4], [13.8, 21.4]], 0.55, 0.75)), M.bag, { bev: 0.6, add: 0.4 });
    // deux rivets à tête ronde
    if (!D.lo) for (const [x, y] of [[23.6, 25.2], [28, 21.4]]) {
      g.shape(f, sBox(x, y + 2, D.lo ? 0.75 : 0.6, 2.2, 0.3), M.iron, { bev: 0.5 });
      g.ball(f, x, y, 2, 1.4, M.iron, { add: 0.6 });
    }
  },

  // flasque de whisky en étain, bouchon moleté, ceinture de cuir cousue, étoile gravée
  whisky(g, D) {
    const f = frame(16, 16.4, 0.12);
    const body = sSmooth(sBox(16, 19, 8.2, 8.8, 3.8), sBox(16, 10.2, 2.8, 1.2, 0.5), 1.4);
    g.shape(f, body, M.pewter, { bev: 5, prof: 'soft', edge: D.lo ? undefined : true, drop: D.hi ? 1 : 0, tex: (x) => (D.hi && x > 10.4 && x < 11.6 ? 1.4 : 0) });
    g.shape(f, sBox(16, 7.8, 1.9, 1.9, 0.3), M.pewter, { bev: 1.2, add: -0.6 });
    g.shape(f, sBox(16, 4.8, 2.7, 1.8, 0.6), M.pewter, { bev: 1.6, add: 0.3, edge: D.lo ? undefined : true, tex: (x, y, X) => (D.hi && X % 2 === 0 ? -0.7 : 0) });
    // la ceinture de cuir
    g.shape(f, sBox(16, 21.6, 7.8, D.lo ? 3 : 3.2, 0.4), M.leather, { clip: true, nrm: (x) => { const t = clamp((x - 16) / 8.4, -0.95, 0.95); return [t, 0, Math.sqrt(1 - t * t)]; }, add: 0.2 });
    if (!D.lo) {
      g.line(f, [[8.6, 18.4], [23.4, 18.4]], PAL.leather[1], { clip: true });
      g.line(f, [[8.6, 24.8], [23.4, 24.8]], PAL.leather[1], { clip: true });
    }
    if (D.hi) {
      g.line(f, [[9, 19.3], [23, 19.3]], dashed(PAL.leather[7]), { clip: true });
      g.line(f, [[9, 23.9], [23, 23.9]], dashed(PAL.leather[7]), { clip: true });
      // l'étoile gravée au-dessus
      g.line(f, [...starPts(16, 14, 5, 2.6, 1.1), starPts(16, 14, 5, 2.6, 1.1)[0]], (X, Y, p) => scale(p, 0.62), { clip: true });
    }
    if (!D.lo) g.glint(f, 11.2, 12.8, D.hi ? 2 : 1, hex('ffffff'), hex('cad0d4'));
  },

  // fer à cheval porte-bonheur, ouvert vers le haut : rainure, trous de clous, talons coupés droit
  fer(g, D) {
    const f = I, cy = 17.6;
    const shoe = X(Sub(sEll(16, cy, 12, 12), sEll(16, cy - 0.4, 6.6, 7.6), sBox(16, 4, 3.6, 8)), (x, y) => 8.4 - y);
    g.shape(f, shoe, M.iron, { bev: 3, edge: D.lo ? undefined : true, drop: D.hi ? 1 : 0, add: D.hi ? 0.8 : 1.6 });
    // la rainure et les trous de clous
    if (!D.lo) {
      g.line(f, arcPts(16, cy - 0.2, 9.3, 9.8, -1.08, Math.PI + 1.08, 40), (X, Y, p) => scale(p, 0.6), { clip: true });
      for (const a of D.hi ? [-0.55, 0.15, 0.85, Math.PI - 0.85, Math.PI - 0.15, Math.PI + 0.55] : [-0.4, 0.6, Math.PI - 0.6, Math.PI + 0.4]) {
        g.shape(f, sBox(16 + Math.cos(a) * 9.3, cy - 0.2 + Math.sin(a) * 9.8, 0.7, 0.7, 0.2), M.iron, { col: BLACK, clip: true });
      }
    } else for (const a of [0.2, Math.PI - 0.2]) g.dot(f, 16 + Math.cos(a) * 9.3, cy + Math.sin(a) * 9.8, BLACK);
    if (!D.lo) g.glint(f, 7.2, 14, D.hi ? 2 : 1, hex('ffffff'), hex('bcbcc4'));
  },

  // étoile de shérif à six branches boulées, en or, à facettes ; médaillon central gravé
  etoile(g, D) {
    const f = I, cx = 16, cy = 16.2;
    facetStar(g, D, f, cx, cy, 6, 12.2, 6.6, M.gold, { edge: D.lo ? undefined : true, tilt: 0.55 });
    for (let k = 0; k < 6; k++) {
      const a = -Math.PI / 2 + (k * Math.PI) / 3;
      g.ball(f, cx + Math.cos(a) * 12.4, cy + Math.sin(a) * 12.4, D.lo ? 2 : 1.75, D.lo ? 2 : 1.75, M.gold, { add: 0.2 });
    }
    g.ball(f, cx, cy, 5.2, 5.2, M.gold, { flat: 0.55, edge: D.lo ? undefined : true, add: -0.3 });
    if (D.hi) {
      g.line(f, arcPts(cx, cy, 3.8, 3.8, 0, Math.PI * 2, 32), (X, Y, p) => scale(p, 0.72), { clip: true });
      g.shape(f, sPoly(starPts(cx, cy, 5, 2.6, 1.1)), M.gold, { add: 1.4, nrm: starNrm(cx, cy, 5, -Math.PI / 2, 0.5) });
    }
    if (!D.lo) g.glint(f, 9.4, 11, D.hi ? 3 : 1);
  },

  // longue-vue en laiton, trois tubes qui coulissent, le gros gainé de cuir
  longuevue(g, D) {
    const f = frame(16, 16, -Math.PI / 4, 0.92, 0.92 * thick(D));
    cyl(g, f, 3.4, 16, 2.4, 1.45, M.brass, { edge: D.lo ? undefined : true });
    cyl(g, f, 9.4, 16, 3.8, 1.95, M.brass, { edge: D.lo ? undefined : true, add: -0.2 });
    cyl(g, f, 18, 16, 5, 2.5, M.leather, { edge: D.lo ? undefined : true, tex: (x, y, X, Y) => (D.hi && ((X + Y) % 4 === 0) ? -0.5 : 0) });
    cyl(g, f, 27.4, 16, 4.6, 2.95, M.brass, { edge: D.lo ? undefined : true });
    // les bagues
    for (const [x, r] of D.lo ? [[5.6, 2.2], [32, 3.4]] : [[1.2, 1.7], [5.8, 2.25], [13.2, 2.8], [22.8, 3.25], [32.1, 3.45]]) cyl(g, f, x, 16, D.lo ? 0.8 : 0.6, r, M.brass, { add: 0.5, rr: 0.3 });
    if (D.hi) for (const x of [14.6, 21.4]) g.line(f, [[x, 13.8], [x, 18.2]], PAL.leather[1], { clip: true });
    if (!D.lo) g.glint(f, 27, 13.6, D.hi ? 3 : 1);
  },

  // ---------------------------------------------------------------- ressources et caractéristiques
  // vivres : une miche de pain doré entaillée devant une boîte de conserve, une lanière de viande séchée
  vivres(g, D) {
    const f = I;
    const can = (x) => { const t = clamp((x - 22.6) / 5.4, -0.95, 0.95); return [t, 0, Math.sqrt(1 - t * t)]; };
    cyl(g, f, 22.6, 14.8, 5.6, 5, M.pewter, { vert: true, rr: 0.6, edge: D.lo ? undefined : true });
    g.shape(f, sBox(22.6, 15.6, 5, 2.8, 0), M.red, { clip: true, nrm: can, tex: (x, y) => (Math.abs(y - 15.6) < 0.7 ? 3.4 : 0) - (D.hi && Math.abs(y - 15.6) < 0.25 && Math.abs(x - 22.6) < 2.6 ? 6 : 0) });
    g.shape(f, sEll(22.6, 9.4, 5, 1.6), M.pewter, { bev: 0.8, add: 0.7, edge: D.lo ? undefined : true });
    if (D.hi) g.line(f, arcPts(22.6, 9.4, 3.8, 1.1, 0, Math.PI * 2, 24), (X, Y, p) => scale(p, 0.75), { clip: true });
    // la miche, au fond plat
    const loaf = X(sEll(13.6, 20.6, 10.6, 7), (x, y) => y - 25.6);
    g.shape(f, loaf, M.bread, { edge: D.lo ? undefined : true, drop: D.hi ? 1 : 0, nrm: (x, y) => {
      const nx = (x - 13.6) / 10.6, ny = (y - 20.6) / 7, d = Math.min(0.96, nx * nx + ny * ny);
      return [nx, ny, Math.sqrt(1 - d)];
    } });
    // les entailles : la mie claire, le bord haut dans l'ombre
    for (const [x, y] of D.lo ? [[9.6, 18.6], [15.6, 17.6]] : [[8, 19.4], [12.6, 17.6], [17.4, 17.2]]) {
      const cut = sRot(sEll(x, y, D.lo ? 2.8 : 2.6, D.lo ? 1 : 0.85), x, y, -0.7);
      g.shape(f, cut, M.bread, { clip: true, add: 2.6, edge: D.lo ? undefined : PAL.bread[2] });
    }
    // la viande séchée, posée devant : une lanière tordue, marbrée de gras
    if (!D.lo) {
      const jerky = sTube([[19.6, 26.6], [22.4, 25.2], [25.6, 26], [29, 24.4]], 1.5, 1.2);
      g.shape(f, jerky, M.meat, { bev: 1.2, edge: true, tex: (x, y) => (D.hi && Math.abs(y - (25.6 - (x - 19.6) * 0.18) + Math.sin(x * 1.3) * 0.5) < 0.3 ? 2.4 : 0) });
    }
  },

  // balles : trois cartouches debout, étuis de laiton, balles de plomb cuivré
  balles(g, D) {
    const f = I;
    for (const [x, y] of [[9.4, 17.6], [22.6, 17.6], [16, 15.2]]) {
      g.shape(f, U(sEll(x, y - 1.4, 2.5, 4.8), sBox(x, y, 2.5, 1.2, 0)), M.copper, { edge: D.lo ? undefined : true, nrm: (px, py) => {
        const nx = clamp((px - x) / 2.8, -0.95, 0.95), ny = py < y - 1.4 ? clamp((py - y + 1.4) / 5, -0.9, 0) : 0;
        const l = Math.min(0.97, Math.hypot(nx, ny));
        return [nx, ny, Math.sqrt(1 - l * l)];
      } });
      cyl(g, f, x, y + 5.4, 5.6, 2.7, M.brass, { vert: true, rr: 0.4, edge: D.lo ? undefined : true, drop: D.hi ? 1 : 0 });
      cyl(g, f, x, y + 11.4, D.lo ? 0.9 : 0.75, 3.1, M.brass, { vert: true, rr: 0.3, add: -0.6 });
      if (!D.lo) g.line(f, [[x - 2.4, y + 0.6], [x + 2.4, y + 0.6]], (X, Y, p) => scale(p, 0.6), { clip: true });
    }
  },

  // caisse de fournitures, vue de trois quarts : planches, cadre, écharpe en biais, clous, marque au fer
  fourn(g, D) {
    const f = I, wd = mat(ramp('3a2410 563820 74502c 926a3a ae8448 c69c5c dab478 eacc98'), 0.5, 0.9, 0.1, 6);
    const face = (pts, n, plank) => g.shape(f, sPoly(pts), wd, { nrm: () => n, edge: D.lo ? undefined : true, tex: plank });
    const fr = (x, y) => (x < 6.2 || x > 20.2 || y < 14.6 || y > 26.8 ? 0.7 : 0);
    face([[3.8, 12.6], [22.4, 12.6], [22.4, 29.2], [3.8, 29.2]], [0, 0, 1], (x, y) => fr(x, y) + (D.hi && !fr(x, y) && (y - 14.6) % 4.1 < 0.35 ? -1.4 : 0) + grain(D, 0.9, 0.4)(x, y) * 0.5);
    face([[3.8, 12.6], [10, 6.2], [28.6, 6.2], [22.4, 12.6]], [0, -0.62, 0.78], (x, y) => (D.hi && (x + (y - 6.2) * 0.97) % 4.6 < 0.4 ? -1.2 : 0));
    face([[22.4, 12.6], [28.6, 6.2], [28.6, 22.8], [22.4, 29.2]], [0.72, 0, 0.69], (x, y) => (x > 26.6 || y - (12.6 - (x - 22.4) * 1.03) < 1.6 || y > 27 - (x - 22.4) * 1.03 ? 0.6 : 0));
    // l'écharpe en biais sur la face avant
    if (!D.lo) {
      g.shape(f, X(sTube([[6.4, 26.8], [20, 14.8]], 1.2), sBox(13.1, 20.9, 7, 6.1, 0)), wd, { bev: 0.8, add: 0.8, edge: true });
      for (const [x, y] of [[5, 13.8], [21.2, 13.8], [5, 28], [21.2, 28], [27.4, 8.6], [27.4, 21.4]]) g.dot(f, x, y, PAL.iron[1]);
    }
    // la marque au fer : une étoile
    if (D.hi) g.line(f, [...starPts(16.4, 23.4, 5, 2, 0.85), starPts(16.4, 23.4, 5, 2, 0.85)[0]], hex('3a2410'), { clip: true });
  },

  // dollars : une grosse pièce d'or frappée du dollar, une pile derrière
  dollars(g, D) {
    const f = I, cx = 12.8, cy = 15.4, r = 9.4;
    for (let k = 0; k < 3; k++) {
      const x = 22.6, y = 26.4 - k * 2.8;
      g.shape(f, U(sEll(x, y + 1.3, 6.2, 2.2), sBox(x, y + 0.65, 6.2, 0.65, 0)), M.gold, { edge: D.lo ? undefined : true, add: -1, nrm: (px) => { const t = clamp((px - x) / 6.6, -0.9, 0.9); return [t, 0.3, 0.9]; }, tex: (px, py, X) => (D.hi && X % 3 === 0 ? -0.8 : 0) });
      g.shape(f, sEll(x, y, 6.2, 2.2), M.gold, { bev: 1, add: 0.6, edge: D.lo ? undefined : true });
    }
    g.ball(f, cx, cy, r, r, M.gold, { flat: 0.82, edge: D.lo ? undefined : true, drop: D.hi ? 1 : 0, add: 0.2 });
    g.shape(f, sCirc(cx, cy, r - (D.lo ? 2.4 : 1.8)), M.gold, { nrm: () => [0.3, 0.35, 0.89], add: -0.2 });
    if (D.xhi) for (let k = 0; k < 28; k++) { const a = (k / 28) * Math.PI * 2; g.dot(f, cx + Math.cos(a) * (r - 1.15), cy + Math.sin(a) * (r - 1.15), PAL.gold[2]); }
    g.shape(f, sDollar(cx, cy, D.lo ? 0.95 : 0.88), M.gold, { bev: D.lo ? 0.6 : 0.9, add: 0.9, drop: D.lo ? 0 : 1 });
    if (!D.lo) g.glint(f, cx - 5, cy - 5.4, D.hi ? 3 : 1);
  },

  // cran (le courage) : une flamme à trois langues, du rouge au jaune blanc
  cran(g, D) {
    const f = I, pts = [[15.4, 1.6], [18.8, 6.6], [21.2, 10.4], [22.8, 6.8], [25.4, 12.6], [26.2, 18.4], [24.8, 24.2], [20.8, 28.4], [16, 29.6], [11.2, 28.4], [7.2, 24.2], [5.8, 18.4], [6.8, 13.2], [8.8, 9.2], [10.6, 13.4], [12.6, 8.6]];
    const lay = (s, add) => g.shape(f, grow(sPoly(shrink(pts, 16, 28, s)), 0.5), M.fire, { bev: 6 * s, prof: 'soft', add, g: [0, 0.06], edge: s === 1 && !D.lo ? PAL.fire[0] : undefined });
    lay(1, -1.6);
    lay(0.7, 0.2);
    lay(0.4, 2.2);
    if (D.hi) for (const [x, y] of [[27.4, 8.4], [5, 7.6], [24.6, 3.4]]) g.glint(f, x, y, 1, hex('fff0a0'), hex('f6942a'));
  },

  // expérience : une étoile d'or pâle à cinq branches, à facettes, et des scintillements
  xp(g, D) {
    const f = I;
    facetStar(g, D, f, 16, 17, 5, 14, 6, mat(PAL.gold, 0.6, 1.0, 0.8, 14), { edge: D.lo ? undefined : true, tilt: 0.6 });
    g.shape(f, sPoly(starPts(16, 17, 5, 5.4, 2.4)), M.gold, { add: 2.6, nrm: starNrm(16, 17, 5, -Math.PI / 2, 0.4) });
    if (!D.lo) for (const [x, y, r] of [[26.6, 5, 2], [5, 6.4, 1], [28, 25.4, 1]]) g.glint(f, x, y, D.hi ? r + 1 : r);
  },

  // cœur (points de vie) : rouge, bombé et luisant
  coeur(g, D) {
    const f = I;
    const heart = sSmooth(U(sCirc(10.8, 12, 6.6), sCirc(21.2, 12, 6.6)), sPoly([[4.6, 14.4], [27.4, 14.4], [16, 28.6]]), 2);
    // le modelé : chaque lobe bombé en haut, un seul dôme vers la pointe, le bord qui tourne
    const nrm = (x, y, dist) => {
      const lx = x < 16 ? 10.8 : 21.2, ax = (x - lx) / 8, ay = (y - 12) / 8, bx = (x - 16) / 13, by = (y - 15) / 14;
      const w = clamp((y - 11) / 9, 0, 1);
      let nx = ax + (bx - ax) * w, ny = ay + (by - ay) * w;
      const l = Math.hypot(nx, ny) || 1, t = Math.min(0.96, Math.max(l, 1 - dist / 2.2));
      nx = (nx / l) * t; ny = (ny / l) * t;
      return [nx, ny, Math.sqrt(1 - t * t)];
    };
    g.shape(f, heart, M.red, { nrm, edge: D.lo ? undefined : true, add: 0.2 });
    g.shape(f, sRot(sEll(9.6, 10.6, 2.6, 1.6), 9.6, 10.6, -0.6), M.red, { col: hex('fcd8c8') });
    if (!D.lo) g.dot(f, 13.4, 8.6, hex('fcd8c8'));
  },

  // armure : un écu d'acier cerclé de laiton, riveté
  armure(g, D) {
    const f = I, shield = grow(sPoly([[5.6, 5.4], [26.4, 5.4], [26.4, 14], [24.4, 20.6], [16, 29], [7.6, 20.6], [5.6, 14]]), 0.6);
    g.shape(f, shield, M.brass, { bev: 2, edge: D.lo ? undefined : true, drop: D.hi ? 1 : 0 });
    g.shape(f, grow(shield, D.lo ? -2.2 : -1.8), M.iron, { bev: 3, add: 0.3, edge: D.lo ? undefined : PAL.iron[2], nrm: (x, y) => {
      const sx = x < 16 ? -1 : 1, nx = sx * 0.3 + clamp((x - 16) / 14, -0.4, 0.4), ny = clamp((y - 15) / 18, -0.5, 0.5);
      return [nx, ny, Math.sqrt(1 - nx * nx - ny * ny)];
    } });
    for (const [x, y] of D.lo ? [[9.6, 9.6], [22.4, 9.6]] : [[9.4, 9.4], [22.6, 9.4], [9.4, 17.6], [22.6, 17.6], [16, 24.4]]) g.ball(f, x, y, D.lo ? 1.1 : 0.9, D.lo ? 1.1 : 0.9, M.brass);
    if (!D.lo) g.glint(f, 11.4, 12.6, D.hi ? 2 : 1, hex('ffffff'), hex('bcbcc4'));
  },

  // botte (le déplacement)
  botte(g, D) { boot(g, D, I); },

  // viseur (la précision) : un réticule, sa croix qui dépasse, le point rouge
  viseur(g, D) {
    const f = I, w = D.lo ? 1.3 : 1;
    g.shape(f, sRing(16, 16, 10.4, w), M.pewter, { bev: w, add: 0.8 });
    const bars = U(sBox(16, 6.2, w * 0.7, 4.4, 0.2), sBox(16, 25.8, w * 0.7, 4.4, 0.2), sBox(6.2, 16, 4.4, w * 0.7, 0.2), sBox(25.8, 16, 4.4, w * 0.7, 0.2));
    g.shape(f, bars, M.pewter, { bev: w * 0.7, add: 1 });
    if (D.hi) g.shape(f, sRing(16, 16, 5.4, 0.4), M.pewter, { add: 0.4, holes: (X, Y) => ((X + Y) & 3) > 1 });
    g.ball(f, 16, 16, D.lo ? 2 : 1.8, D.lo ? 2 : 1.8, M.red, { add: 0.6 });
  },

  // esquive : une silhouette qui se jette de côté, sa traînée, la balle qui la frôle
  esquive(g, D) {
    const f = I;
    const pose = (dx) => ({
      hip: [17.4 + dx, 20.4], neck: [12.4 + dx, 12], head: [10.2 + dx, 8.6], hat: -0.5,
      arms: [[[13.2 + dx, 12.8], [17.4 + dx, 13.4], [20.6 + dx, 11.2]], [[12.6 + dx, 12.6], [8.4 + dx, 15.6], [6.2 + dx, 19]]],
      legs: [[[17.4 + dx, 20.4], [15.4 + dx, 24.8], [12.2 + dx, 28.6]], [[17.4 + dx, 20.4], [20.6 + dx, 24.4], [23.4 + dx, 28.8]]],
    });
    if (!D.lo) figure(g, D, f, pose(4.6), M.ghost, { add: -0.6, edge: false, holes: (X, Y) => ((X + Y) & 1) === 1 });
    figure(g, D, f, pose(0), M.fig);
    // la balle et sa traînée
    g.line(f, [[23.4, 6.4], [30.6, 6.4]], hex('f8d070'), { w: D.lo ? 1 : 1 });
    g.shape(f, U(sEll(21.6, 6.4, 1.6, 1), sBox(22.8, 6.4, 1.2, 1, 0)), M.copper, { bev: 1 });
  },

  // critique : un éclat en étoile, rouge au bord, blanc au cœur
  crit(g, D) {
    const f = I, R = [14.6, 12.6, 14.8, 12, 14.2, 13, 14.8, 12.4, 13.8, 13.4];
    const pts = [];
    R.forEach((ro, k) => {
      const a = -Math.PI / 2 + (k / R.length) * Math.PI * 2;
      pts.push([16 + Math.cos(a) * ro, 16 + Math.sin(a) * ro]);
      const b = a + Math.PI / R.length;
      pts.push([16 + Math.cos(b) * 5.6, 16 + Math.sin(b) * 5.6]);
    });
    const lay = (s, add) => g.shape(f, sPoly(shrink(pts, 16, 16, s)), M.fire, { bev: 3 * s, add, edge: s === 1 && !D.lo ? PAL.fire[0] : undefined });
    lay(1, -1.8);
    lay(0.66, 0.4);
    lay(0.36, 2.6);
    if (D.hi) g.glint(f, 16, 16, 3);
  },

  // ---------------------------------------------------------------- coups spéciaux (barre de combat)
  // double : deux revolvers croisés (en tout petit : l'un derrière l'autre, côte à côte, plus lisible)
  double(g, D) {
    if (D.lo) {
      revolver(g, D, frame(14.6, 12.6, -0.1, 0.78));
      revolver(g, D, frame(17.6, 19.6, -0.1, 0.78));
      return;
    }
    revolver(g, D, frame(18.6, 18.4, 0.62, -0.74, 0.74));
    revolver(g, D, frame(13.4, 18.4, -0.62, 0.74));
  },

  // feu (rafale) : trois balles qui filent, chacune sa traînée de feu
  feu(g, D) {
    const f = I;
    for (const [x, y] of [[22.6, 7.6], [28, 16], [22.6, 24.4]]) {
      const trail = sPoly([[x - 1.2, y - 1.3], [x - 1.2, y + 1.3], [x - 17, y + 0.2], [x - 17, y - 0.2]]);
      g.shape(f, trail, M.fire, { add: 1, g: [0.12, 0], holes: (X, Y) => { const t = (g.mu(X) - (x - 17)) / 16; return bay(X, Y) > t * 1.3; } });
      g.shape(f, U(sEll(x + 0.4, y, 2.8, 1.45), sBox(x - 1.2, y, 1.4, 1.45, 0.2)), M.copper, { edge: D.lo ? undefined : true, nrm: (px, py) => { const t = clamp((py - y) / 1.7, -0.95, 0.95); return [0, t, Math.sqrt(1 - t * t)]; } });
    }
  },

  // volée : le canon court qui crache un cône de plombs
  volee(g, D) {
    const f = frame(16, 16, -0.42);
    // le cône de fumée et de plombs, tramé de plus en plus clair
    const cone = X(sCirc(7, 16, 26), sHalf(7, 16, 31, 6.4), sHalf(31, 25.6, 7, 16));
    g.shape(f, cone, M.sand, { add: 2, holes: (X, Y) => { const [u] = f.inv(g.mu(X), g.mv(Y)); return bay(X, Y) > 0.75 - (u - 7) / 32; } });
    g.shape(f, sPoly([[7.4, 16], [14.6, 11.2], [12.6, 16], [14.6, 20.8]]), M.fire, { add: 1.6 });
    for (const [x, y] of [[15, 13.4], [17.4, 18.4], [20.2, 11.4], [21.6, 15.6], [23.6, 20.4], [25.8, 9.4], [26.8, 14], [27.6, 18.6], [24.4, 23.6]]) g.ball(f, x, y, D.lo ? 1.3 : 1.1, D.lo ? 1.3 : 1.1, M.lead, { edge: D.hi ? true : undefined });
    // le canon et sa bouche
    cyl(g, f, 2.4, 16, 4, 1.9, M.steel, { edge: D.lo ? undefined : true });
    cyl(g, f, 6.6, 16, 0.7, 2.3, M.steel, { add: 0.6, rr: 0.3 });
  },

  // affût : l'œil du guetteur dans un réticule
  affut(g, D) {
    const f = I;
    g.shape(f, sRing(16, 16, 12.6, D.lo ? 1.2 : 0.9), M.pewter, { bev: 1, add: 0.6 });
    const t = D.lo ? 1 : 0.7;
    g.shape(f, U(sBox(16, 3.4, t, 2.8, 0.2), sBox(16, 28.6, t, 2.8, 0.2), sBox(3.4, 16, 2.8, t, 0.2), sBox(28.6, 16, 2.8, t, 0.2)), M.pewter, { bev: t, add: 1 });
    eye(g, D, f, 16, 16, 8.8, M.copper, 0.36);
  },

  // barbelée : la flèche barbelée, et le sang qui goutte de la pointe
  barbelee(g, D) {
    const f = frame(15, 14.6, -Math.PI / 4, 0.95, 1.2 * thick(D));
    arrow(g, D, f, 3, 26, 16, true);
    if (D.hi) g.shape(f, sPoly([[26.6, 14.6], [29.6, 16], [26.6, 17.4]]), M.red, { clip: true, add: -0.6 });
    drop(g, D, I, 25.4, 22.4, D.lo ? 4.2 : 3.6);
    if (!D.lo) drop(g, D, I, 21.8, 27.4, 2.2, { add: -0.6 });
  },

  // sprint : la botte éperonnée qui file, ses traits de vitesse et sa poussière
  sprint(g, D) {
    const f = frame(18.4, 16, 0, 0.84);
    for (const [x, y] of [[4.4, 26.4], [7, 28.6], [2.4, 29]]) g.ball(I, x, y, 2, 1.6, M.smoke, { add: 1.4, holes: (X, Y) => ((X ^ Y) & 1) === 1 && !D.lo });
    boot(g, D, f);
    for (const [x0, x1, y] of [[1.6, 9.4, 8.4], [3.4, 10.4, 13], [1.2, 8.6, 17.6]]) g.shape(I, sBox((x0 + x1) / 2, y, (x1 - x0) / 2, D.lo ? 0.8 : 0.6, 0.6), M.cream, { add: 1.4, g: [0.1, 0] });
  },

  // profil bas : une silhouette accroupie, le revolver au poing
  profil(g, D) {
    const f = I;
    g.shape(f, sBox(16, 29.4, 13.4, D.lo ? 0.9 : 0.7, 0.5), M.sand, { add: -0.4 });
    figure(g, D, f, {
      hip: [12.6, 21.4], neck: [18, 14.6], head: [20.8, 11.4], hat: -0.1,
      arms: [[[18.6, 15.4], [22, 18.6], [25.6, 18.6]], [[17.6, 15], [15, 19.4], [17.4, 22.6]]],
      legs: [[[12.6, 21.4], [9.6, 27.4], [4.6, 28]], [[12.6, 21.4], [18.6, 22], [19.2, 28.4]]],
    }, M.fig);
    g.shape(f, U(sBox(27.6, 18, 2.4, 0.8, 0.3), sBox(26, 19.6, 0.8, 1.4, 0.3)), M.steel, { bev: 0.6, add: 0.6 });
  },

  // retranché : une pyramide de sacs de sable
  retranche(g, D) {
    const f = I;
    const weave = (x, y, X, Y) => (D.hi && ((X + Y) % 4 === 0 || (X - Y) % 4 === 0) ? -0.5 : 0);
    const bag = (cx, cy, w, h, add = 0) => {
      const sd = U(sBox(cx, cy, w, h, h * 0.85), sEll(cx - w - 0.4, cy - 0.2, 1, 1.2), sEll(cx + w + 0.4, cy - 0.2, 1, 1.2));
      g.shape(f, sd, M.burlap, { bev: h * 1.3, prof: 'soft', add, edge: D.lo ? undefined : true, drop: D.hi ? 1 : 0, tex: weave });
      if (D.hi) g.line(f, [[cx - w + 1, cy - h * 0.25], [cx + w - 1, cy - h * 0.25]], dashed(PAL.burlap[2]), { clip: true });
    };
    bag(6.6, 25.4, 4.6, 3.4, -0.4); bag(16, 25.6, 4.6, 3.4, -0.2); bag(25.4, 25.4, 4.6, 3.4, -0.5);
    bag(11.2, 18.8, 4.6, 3.4); bag(20.8, 18.8, 4.6, 3.4, -0.2);
    bag(16, 12.2, 4.6, 3.4, 0.3);
  },

  // ralliement : le clairon de cavalerie, son cordon rouge à gland
  ralliement(g, D) {
    const f = frame(16, 16.4, -0.12);
    const r = D.lo ? 1.2 : 0.95;
    // la boucle du tube
    g.shape(f, sTube(arcPts(13.2, 17.6, 8, 4.4, -Math.PI * 0.35, Math.PI * 1.55, 32), r), M.brass, { bev: r, edge: D.hi ? true : undefined });
    // l'embouchure
    g.shape(f, sTube([[6.2, 14.4], [2.6, 13.4]], r * 0.85), M.brass, { bev: r, add: 0.4 });
    g.ball(f, 2.4, 13.4, 1.2, 1.5, M.brass, { add: 0.6 });
    // le pavillon qui s'évase
    const bell = grow(sPoly([[18.6, 13.8], [24.6, 11.6], [28.4, 7.6], [29.6, 7.4], [29.6, 22.6], [28.4, 22.4], [24.6, 18.6], [18.6, 16.4]]), 0.3);
    g.shape(f, bell, M.brass, { bev: 3, edge: D.lo ? undefined : true, drop: D.hi ? 1 : 0, nrm: (x, y) => { const t = clamp((y - 15) / (2 + (x - 18.6) * 0.6), -0.95, 0.95); return [0, t, Math.sqrt(1 - t * t)]; } });
    g.shape(f, sEll(29.6, 15, 1.3, 7.6), M.brass, { bev: 1, add: 1.2, edge: D.lo ? undefined : true });
    if (!D.lo) g.shape(f, sEll(29.8, 15, 0.6, 5.4), M.brass, { col: PAL.brass[1] });
    // le cordon et son gland
    g.shape(f, sTube([[9, 21.4], [10.6, 25.4], [13.6, 26.4]], D.lo ? 0.8 : 0.6), M.redm, { bev: 0.6, add: 0.6 });
    g.shape(f, sPoly([[13.4, 25.4], [16.4, 28.8], [12.4, 30], [12.6, 26.6]]), M.redm, { bev: 1, edge: D.lo ? undefined : true, add: 0.4 });
    if (!D.lo) g.glint(f, 23.6, 12.6, D.hi ? 2 : 1);
  },

  // roulade : une silhouette roulée en boule, l'arc de son mouvement
  roulade(g, D) {
    const f = I;
    g.shape(f, sArc(16, 16.4, 13, D.lo ? 1.1 : 0.8, Math.PI * 0.62, Math.PI * 1.62), M.cream, { add: 1, holes: (X, Y) => { const a = Math.atan2(g.mv(Y) - 16.4, g.mu(X) - 16); const t = ((a - Math.PI * 0.62 + Math.PI * 4) % (Math.PI * 2)) / Math.PI; return bay(X, Y) > t * 1.2; } });
    g.shape(f, sPoly([[24.2, 3.6], [29.4, 6.8], [23.4, 9.6]]), M.cream, { add: 1.2 });
    // le dos rond, les genoux repliés, les bras qui les tiennent, la tête et le chapeau
    const fg = M.fig;
    g.shape(f, sTube(arcPts(16, 17.6, 6, 6.2, Math.PI * 0.75, Math.PI * 1.75, 14), D.lo ? 3 : 2.7, D.lo ? 2.8 : 2.4), fg, { bev: 2.6, edge: D.hi ? true : undefined });
    g.shape(f, sTube([[11.6, 21.6], [16.6, 23.6], [21.4, 21]], D.lo ? 2 : 1.7, D.lo ? 1.7 : 1.4), fg, { bev: 1.6, add: -0.6, edge: D.hi ? true : undefined });
    g.shape(f, sTube([[18.8, 13.4], [20.6, 18], [18.6, 21.6]], D.lo ? 1.4 : 1.15), fg, { bev: 1.2, add: 0.2, edge: D.hi ? true : undefined });
    g.ball(f, 21.6, 12.4, D.lo ? 2.6 : 2.3, D.lo ? 2.6 : 2.4, fg);
    g.shape(f, sRot(sEll(22.4, 9.8, 4.4, 1.05), 22.4, 9.8, 0.25), fg, { bev: 0.8, add: -0.2 });
    g.shape(f, sRot(grow(sPoly([[20.6, 9.6], [20.9, 6.6], [22.6, 7.2], [24.3, 6.6], [24.6, 9.6]]), 0.3), 22.6, 8.4, 0.25), fg, { bev: 1, add: -0.5 });
  },

  // soins : une croix rouge sur une pastille blanche
  soins(g, D) {
    const f = I;
    g.ball(f, 16, 16, 13, 13, M.cloth, { flat: 0.72, edge: D.lo ? undefined : true, add: 0.2 });
    g.shape(f, U(sBox(16, 16, 8.6, 3.1, 0.6), sBox(16, 16, 3.1, 8.6, 0.6)), M.red, { bev: 1.8, edge: D.lo ? undefined : true, drop: D.lo ? 0 : 1, add: 0.3 });
    if (!D.lo) g.glint(f, 9, 8.6, D.hi ? 2 : 1, hex('ffffff'), hex('e8e4d8'));
  },

  // épaule : une charge épaule en avant, l'onde du choc
  epaule(g, D) {
    const f = I;
    for (const [r, k] of [[6.6, 1.6], [9.8, 0.8]]) g.shape(f, sArc(20.6, 14.6, r, D.lo ? 1.1 : 0.85, -1, 1), M.fire, { add: k + 1, edge: D.hi ? PAL.fire[2] : undefined });
    figure(g, D, f, {
      hip: [11, 20.4], neck: [17, 13.8], head: [14.8, 9.8], hat: 0.35,
      arms: [[[17.6, 14], [19.2, 18.4], [15.6, 19.8]], null],
      legs: [[[11, 20.4], [7.6, 24.6], [3.6, 27.6]], [[11, 20.4], [15.6, 24], [17.6, 28.8]]],
    }, M.fig);
    g.ball(f, 19.4, 13.6, D.lo ? 3.4 : 3.1, D.lo ? 3.2 : 2.9, M.fig, { edge: D.hi ? true : undefined, add: 0.3 });
  },

  // jugement : le crâne pris dans un réticule rouge
  jugement(g, D) {
    const f = I;
    g.shape(f, sRing(16, 16, 13.4, D.lo ? 1.2 : 0.9), M.red, { bev: 1, add: 0.6 });
    const t = D.lo ? 1 : 0.75;
    g.shape(f, U(sBox(16, 2.8, t, 2.6, 0.2), sBox(16, 29.2, t, 2.6, 0.2), sBox(2.8, 16, 2.6, t, 0.2), sBox(29.2, 16, 2.6, t, 0.2)), M.red, { bev: t, add: 0.6 });
    const skull = U(sEll(16, 13.4, 8.2, 7.8), sBox(16, 20.8, 4.8, 3.6, 1.6));
    g.shape(f, skull, M.bone, { bev: 4, prof: 'soft', edge: D.lo ? undefined : true, drop: D.hi ? 1 : 0, add: 0.4 });
    for (const sx of [-1, 1]) g.shape(f, sRot(sEll(16 + sx * 3.4, 15, 2.4, 2.1), 16 + sx * 3.4, 15, sx * 0.3), M.bone, { col: BLACK, edge: D.hi ? PAL.bone[1] : undefined });
    g.shape(f, sPoly([[16, 17.6], [17.2, 19.8], [14.8, 19.8]]), M.bone, { col: BLACK });
    if (!D.lo) for (const x of [13.6, 16, 18.4]) g.line(f, [[x, 21.4], [x, 24]], PAL.bone[1], { clip: true });
    if (D.hi) g.line(f, arcPts(11.6, 9.6, 2.4, 1.6, Math.PI * 1.1, Math.PI * 1.6, 6), PAL.bone[7], { clip: true });
  },

  // traque : des empreintes de bottes (creusées dans la terre) qui mènent à une cible
  traque(g, D) {
    const f = I, tx = 25, ty = 7.2;
    for (const [r, c, k] of [[5.8, M.redm, 0.4], [4.1, M.cloth, 0], [2.4, M.redm, 0.6]]) g.ball(f, tx, ty, r, r, c, { flat: 0.8, add: k, edge: r > 5 && !D.lo ? true : undefined });
    if (D.lo) g.ball(f, tx, ty, 1, 1, M.cloth, { col: CREAM });
    // une empreinte : la semelle et le talon, la pointe vers la cible ; le creux éclairé à l'envers
    const print = (cx, cy, a, k = 1) => {
      // la semelle (large à la pointe, cambrée), le talon à part ; un creux sombre, le bord bas éclairé
      const P = (dx, dy) => [cx + dx * k, cy + dy * k];
      const sole = grow(sPoly([P(-2, -5.4), P(0, -6.4), P(2, -5.4), P(2.2, -2.2), P(1.2, 0.6), P(-1.2, 0.6), P(-2.2, -2.2)]), 0.5 * k);
      const sd = sRot(U(sole, sBox(cx, cy + 3.6 * k, 1.7 * k, 1.4 * k, 0.7 * k)), cx, cy, a);
      g.shape(f, sd, M.sand, { bev: D.lo ? 1.4 : 1.3, inv: !D.lo, add: D.lo ? 1 : -0.6, edge: D.lo ? undefined : PAL.sand[1] });
      if (D.hi) for (const oy of [-4.2, -2.4]) g.line(f, [-1.2, 1.2].map((o) => { const c = Math.cos(a), s = Math.sin(a); return [cx + o * c - oy * s, cy + o * s + oy * c]; }), PAL.sand[2], { clip: true });
    };
    if (D.lo) { print(4.6, 24, 0.86, 1.05); print(17.4, 18.4, 0.86, 1.05); } else { print(6.6, 25, 0.86); print(15.2, 21.6, 0.86); print(17, 12.6, 0.86); }
  },

  // mèche : la mèche torsadée qui brûle, ses étincelles et sa fumée
  meche(g, D) {
    const f = I;
    const pts = [[3.4, 28], [8.4, 25.6], [11, 21], [14.2, 17.6], [19, 16.6], [21.6, 12.4]];
    g.shape(f, sTube(pts, D.lo ? 1.4 : 1.15), M.burlap, { bev: 1.2, edge: D.lo ? undefined : true, add: -0.4, tex: (x, y, X, Y) => (D.hi && (X + Y * 2) % 5 < 1 ? -1.2 : 0) });
    g.ball(f, 22, 11.6, 1.8, 1.8, M.fire, { add: 0.6 });
    if (D.hi) for (const [x, y, r] of [[18.4, 5.6, 2.4], [15.4, 3.4, 1.8]]) g.ball(f, x, y, r, r, M.smoke, { add: 1.6, holes: (X, Y) => ((X ^ Y) & 1) === 1 });
    g.shape(f, sPoly(starPts(23, 10.6, 8, D.lo ? 5 : 5.6, 2, 0.2)), M.fire, { add: 1.4 });
    g.shape(f, sPoly(starPts(23, 10.6, 4, 2.8, 1, 0.6)), M.fire, { add: 3 });
    if (!D.lo) for (const [x, y] of [[28.6, 6.4], [28, 15.4], [19.6, 6.6]]) g.glint(f, x, y, 1, hex('fff0a0'), hex('f6942a'));
  },

  // fondu : une silhouette qui s'efface, fantomatique, et son double
  fondu(g, D) {
    const f = I;
    const stand = (dx) => ({
      hip: [16 + dx, 19.6], neck: [16 + dx, 10.6], head: [16 + dx, 7], hat: 0,
      arms: [[[17.6 + dx, 11.4], [19.4 + dx, 16], [19.8 + dx, 20.4]], [[14.4 + dx, 11.4], [12.6 + dx, 16], [12.2 + dx, 20.4]]],
      legs: [[[15 + dx, 20], [14.4 + dx, 24.6], [13.8 + dx, 29.4]], [[17 + dx, 20], [17.6 + dx, 24.6], [18.2 + dx, 29.4]]],
    });
    const y0 = D.A <= 24 ? 19 : 14, fade = (k) => (X, Y) => bay(X, Y) < clamp((g.mv(Y) - y0) / 14, 0, 1) * k;
    if (D.hi) figure(g, D, f, stand(-5.4), M.ghost, { add: -1.2, edge: false, holes: (X, Y) => ((X + Y) & 1) === 1 || fade(1.2)(X, Y) });
    figure(g, D, D.hi ? f : frame(16, 16, 0, 1.08), stand(D.hi ? 1 : 0), M.ghost, { holes: fade(D.hi ? 1 : 0.7) });
  },

  // semonce : des balles qui frappent le sol, giclées de poussière et éclats
  semonce(g, D) {
    const f = I, hits = D.lo ? [[9.6, 1.25], [22.4, 1.15]] : [[8.4, 1], [17.4, 1.15], [26, 0.9]];
    // les traits des balles, qui plongent vers le sol
    for (const [x] of hits) g.shape(f, sTube([[x - 6.4, 2.6], [x - 0.8, 18.6]], 0.2, D.lo ? 1 : 0.75), M.fire, { add: 2.2 });
    // le sol, et les giclées de poussière avec leurs éclats
    g.shape(f, sBox(16, 27.4, 14.6, 2.4, 1.2), M.sand, { bev: 1.4, edge: D.lo ? undefined : true, tex: (x, y, X, Y) => (D.hi && (X * 7 + Y * 3) % 11 === 0 ? -1.2 : 0) });
    for (const [x, s] of hits) {
      for (const [dx, dy, r] of [[-2.2, -1.4, 2.2], [2, -1.6, 2], [0, -3.4, 2.6], [0, -0.4, 2.4]]) g.ball(f, x + dx * s, 24.6 + dy * s, r * s, r * s, M.dust, { add: 1.4, edge: D.lo ? undefined : true });
      if (!D.lo) for (const [dx, dy] of [[-3.6, -6], [3.4, -6.6], [0.8, -8.6]]) g.shape(f, sBox(x + dx * s, 24.6 + dy * s, 0.65, 0.65, 0.1), M.sand, { col: PAL.sand[1] });
    }
  },

  // recharger : le barillet ouvert, ses chambres, et une cartouche qui y entre
  recharger(g, D) {
    const f = I, cx = 13, cy = 14.4;
    g.ball(f, cx, cy, 10, 10, M.steel, { flat: 0.6, edge: D.lo ? undefined : true, drop: D.hi ? 1 : 0 });
    if (D.hi) for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2 + Math.PI / 6; g.shape(f, sCirc(cx + Math.cos(a) * 10.4, cy + Math.sin(a) * 10.4, 1.4), M.steel, { col: 0, clip: true }); }
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 - Math.PI / 2, x = cx + Math.cos(a) * 5.6, y = cy + Math.sin(a) * 5.6;
      g.shape(f, sCirc(x, y, 2.2), M.steel, { col: BLACK });
      if (k !== 1) {
        g.ball(f, x, y, 1.9, 1.9, M.brass, { flat: 0.5 });
        if (!D.lo) g.ball(f, x, y, 0.7, 0.7, M.copper);
      }
    }
    g.ball(f, cx, cy, 1.6, 1.6, M.steel, { add: 0.8 });
    // la cartouche qui arrive
    const fc = frame(24.4, 24.2, -Math.PI * 0.68, 0.9);
    g.shape(fc, U(sEll(21.4, 16, 2.6, 1.9), sBox(22.6, 16, 1.4, 1.9, 0)), M.copper, { bev: 1.6, edge: D.lo ? undefined : true });
    cyl(g, fc, 13.2 + 14.4 / 2 - 2.6, 16, 5.2, 1.95, M.brass, { edge: D.lo ? undefined : true });
    cyl(g, fc, 9.4, 16, 0.6, 2.4, M.brass, { add: -0.6, rr: 0.2 });
    if (!D.lo) g.glint(f, 8, 8.4, D.hi ? 2 : 1, hex('f2f6fc'), hex('9aaac4'));
  },

  // suivant : une flèche de laiton vers la droite
  suivant(g, D) {
    const f = I;
    g.shape(f, grow(sPoly([[3.6, 12.4], [16.4, 12.4], [16.4, 5.4], [28.6, 16], [16.4, 26.6], [16.4, 19.6], [3.6, 19.6]]), 0.6), M.brass, { bev: 2, edge: D.lo ? undefined : true, drop: D.hi ? 1 : 0 });
    if (!D.lo) g.glint(f, 8, 13.6, D.hi ? 2 : 1);
  },

  // annuler : une croix rouge
  annuler(g, D) {
    const f = I, r = D.lo ? 3.4 : 3.1;
    g.shape(f, U(sTube([[7, 7], [25, 25]], r), sTube([[25, 7], [7, 25]], r)), M.red, { bev: r, edge: D.lo ? undefined : true, add: 0.2 });
  },

  // ---------------------------------------------------------------- petits signes de l'interface
  // une flamme de cran, faite pour être toute petite (5 à 8 pixels du jeu, en rang serré) : deux langues seulement
  cran_s(g, D) {
    const f = I, pts = [[15.6, 1.4], [20.8, 8.6], [23.2, 13.6], [25, 9.2], [27.6, 16.2], [27.4, 22.4], [24.2, 27.6], [16, 30.4], [7.8, 27.6], [4.6, 22.4], [5.4, 15.6], [9.6, 9.4], [11.4, 14.2]];
    g.shape(f, grow(sPoly(pts), 0.6), M.fire, { bev: 8, prof: 'soft', add: -1.2, g: [0, 0.08] });
    g.shape(f, grow(sPoly(shrink(pts, 16, 29.6, 0.52)), 0.4), M.fire, { bev: 4, prof: 'soft', add: 2.6 });
    if (D.hi) g.shape(f, sEll(14.6, 25.4, 2.2, 3), M.fire, { col: PAL.fire[7] });
  },

  // ---------------------------------------------------------------- lieux du territoire (chacun la couleur de son
  // médaillon sur la carte : rouge des hors-la-loi, bleu des rencontres, vert du comptoir, orange du camp…)
  // hors-la-loi : la tête d'un bandit, chapeau rabattu, le foulard rouge sur le nez
  n_combat(g, D) {
    const f = I, felt = M.felt;
    // le visage, les sourcils froncés, les yeux
    g.shape(f, sEll(16, 18.4, D.lo ? 8.2 : 7.6, 8.6), M.skin, { bev: 5, prof: 'soft', edge: D.lo ? undefined : true, add: -0.2 });
    for (const sx of [-1, 1]) {
      g.shape(f, sEll(16 + sx * 3.3, 15.6, D.lo ? 1.5 : 1.15, D.lo ? 1.6 : 1.45), M.skin, { col: BLACK });
      if (!D.lo) g.line(f, [[16 + sx * 1.2, 13.6], [16 + sx * 5.2, 12.8]], PAL.skin[1], { w: D.hi ? 2 : 1 });
    }
    // le foulard : la pointe qui pend sur la poitrine, ses plis et ses pois
    const scarf = grow(sPoly([[6.8, 18], [25.2, 18], [24.2, 23.2], [16, 31], [7.8, 23.2]]), 0.6);
    g.shape(f, scarf, M.redm, { bev: 3, edge: D.lo ? undefined : true, drop: D.hi ? 1 : 0, add: 0.4, tex: (x, y) => (D.hi && Math.abs(x - 16 - (y - 22) * 0.4) < 0.5 && y > 21 ? -1.4 : 0) });
    if (D.hi) for (const [x, y] of [[11.4, 20.8], [16, 20.4], [20.6, 20.8], [13.6, 24.6], [18.4, 24.6], [16, 28]]) g.ball(f, x, y, 0.75, 0.75, M.cloth, { add: 0.6 });
    // le chapeau : la calotte pincée, le ruban, le bord large un peu cintré
    const crown = grow(sPoly([[9.2, 10.4], [10.2, 2.8], [13.2, 1.2], [16, 3], [18.8, 1.2], [21.8, 2.8], [22.8, 10.4]]), 0.6);
    g.shape(f, crown, felt, { bev: 3, edge: D.lo ? undefined : true, add: 0.3 });
    if (!D.lo) g.line(f, [[16, 3.4], [16, 7.4]], PAL.felt[1], { clip: true });
    g.shape(f, sBox(16, 8.8, 6.8, D.lo ? 1.3 : 1, 0.2), felt, { clip: true, nrm: () => [0, 0, 1], add: -2.6 });
    const brim = X(sEll(16, 10.4, 14.8, 3.4), (x, y) => -(Math.hypot(x - 16, y - 0.6) - 10.8));
    g.shape(f, U(brim, sEll(16, 10.8, 14.4, 1.8)), felt, { bev: 1.6, edge: D.lo ? undefined : true, add: 0.7, drop: D.hi ? 1 : 0 });
  },

  // rencontre : un grand point d'interrogation bleu, en relief
  n_event(g, D) {
    const f = I, w = D.lo ? 3.3 : 2.8;
    const q = U(sArc(16, 10.4, 6.6, w, Math.PI * 0.96, Math.PI * 2.36), sTube([[19.2, 16.4], [16.2, 18.8], [16, 21.2]], w));
    g.shape(f, q, M.blue, { bev: w, edge: D.lo ? undefined : true, drop: D.lo ? 0 : D.hi ? 2 : 1, add: 1.2 });
    g.ball(f, 16, 27.2, w + 0.5, w + 0.5, M.blue, { add: 1.2, edge: D.lo ? undefined : true });
    if (!D.lo) g.glint(f, 11.4, 6.8, D.hi ? 2 : 1, hex('ffffff'), hex('c4defe'));
  },

  // comptoir : une bourse de toile ficelée, le dollar au pochoir, deux pièces d'or
  n_comptoir(g, D) {
    const f = I, weave = (x, y, X, Y) => (D.hi && ((X + Y) % 4 === 0 || (X - Y + 64) % 4 === 0) ? -0.45 : 0);
    const body = sSmooth(sEll(15, 21.2, 10.6, 8.8), sBox(15, 11.4, 3.4, 2.4, 1), 3);
    g.shape(f, body, M.burlap, { bev: 6, prof: 'soft', edge: D.lo ? undefined : true, drop: D.hi ? 1 : 0, tex: weave });
    // le haut froncé qui s'évase au-dessus du lien
    g.shape(f, grow(sPoly([[10.4, 4.2], [13.4, 7.4], [16.6, 7.4], [19.6, 4.2], [19, 9.6], [11, 9.6]]), 0.5), M.burlap, { bev: 1.6, add: 0.6, edge: D.lo ? undefined : true, tex: (x) => (D.hi && Math.abs(x - 15) < 0.5 ? -1.2 : 0) });
    g.shape(f, sBox(15, 10, 4.8, D.lo ? 1.3 : 1, 0.6), M.redm, { bev: 1, add: 0.4, edge: D.hi ? true : undefined });
    if (!D.lo) g.shape(f, sTube([[19.4, 10.2], [21.6, 12.6], [21, 14.6]], 0.55), M.redm, { bev: 0.5, add: 0.6 });
    // le dollar au pochoir, vert sombre
    g.shape(f, sDollar(15, 21.6, D.lo ? 0.92 : 0.82), M.green, { clip: true, add: D.lo ? -1.4 : -1.8, bev: 0.6 });
    // les pièces devant
    if (D.hi) for (const [x, y] of [[25.4, 28.2], [27.8, 25.6]]) {
      g.shape(f, U(sEll(x, y + 0.8, 3.4, 1.4), sBox(x, y + 0.4, 3.4, 0.4, 0)), M.gold, { add: -1.2, edge: true });
      g.shape(f, sEll(x, y, 3.4, 1.4), M.gold, { bev: 0.8, add: 0.8, edge: true });
    }
  },

  // campement : le feu de camp sur ses bûches croisées, cerné de pierres
  n_camp(g, D) {
    const f = I;
    if (!D.lo) for (const [x, y, r] of [[4.2, 27.4, 2.4], [27.8, 27.4, 2.4], [9.6, 29.6, 2.2], [22.4, 29.6, 2.2], [16, 30.4, 2]]) g.ball(f, x, y, r, r * 0.8, M.smoke, { add: -0.4, edge: true });
    for (const [a, b, k] of [[[5, 21.4], [27, 28.2], -0.6], [[5, 28.2], [27, 21.4], 0.2]]) {
      g.shape(f, sTube([a, b], D.lo ? 2.6 : 2.2), M.wood, { bev: 2.2, add: k + 0.6, edge: D.lo ? undefined : true, tex: grain(D, 0.9, 0.3) });
      if (!D.lo) for (const p of [a, b]) g.ball(f, p[0], p[1], 1.5, 1.9, M.oak, { add: 2.4, flat: 0.6 });
    }
    const pts = [[15.4, 1.6], [19.4, 7.4], [21.6, 11], [23, 7.8], [25.4, 13], [25.6, 18.4], [23.4, 22.8], [16, 25], [8.6, 22.8], [6.4, 18.4], [7.2, 13.6], [9.2, 10], [10.8, 13.6], [12.6, 8.8]];
    const lay = (s, add) => g.shape(f, grow(sPoly(shrink(pts, 16, 24, s)), 0.5), M.fire, { bev: 6 * s, prof: 'soft', add, g: [0, 0.07], edge: s === 1 && !D.lo ? PAL.fire[0] : undefined });
    lay(1, -1.4);
    lay(0.66, 0.6);
    if (!D.lo) lay(0.36, 2.6);
    if (D.hi) for (const [x, y] of [[26.4, 4.4], [6.4, 6.6]]) g.glint(f, x, y, 1, hex('fff0a0'), hex('f6942a'));
  },

  // recrue : un chapeau de cow-boy (le bord relevé sur les côtés, qui plonge devant) et le signe plus, vert
  n_recrue(g, D) {
    const f = I, felt = mat(PAL.felt, 0.56, 1.0, 0.25, 8);
    const crown = grow(sPoly([[7.6, 16.4], [8.6, 6.4], [12.2, 3.6], [16, 6], [19.8, 3.6], [23.4, 6.4], [24.4, 16.4]]), 0.8);
    g.shape(f, crown, felt, { bev: 4, edge: D.hi ? true : undefined, add: 0.2 });
    if (!D.lo) g.shape(f, sTube([[16, 6.6], [16, 11.6]], 0.7, 1.1), felt, { clip: true, add: -1.6, nrm: () => [0.4, 0, 0.9] });
    g.shape(f, sBox(16, 14.6, 8.4, D.lo ? 1.6 : 1.3, 0.3), M.redm, { clip: true, add: 0.3, nrm: (x) => { const t = clamp((x - 16) / 9, -0.9, 0.9); return [t, 0, Math.sqrt(1 - t * t)]; } });
    // le bord : un croissant, épais devant, effilé et relevé aux deux bouts
    const brim = Sub(sEll(16, 13.8, 15.6, 7.2), sEll(16, 11.6, 13.8, 6.6), (x, y) => y - 8);
    g.shape(f, brim, felt, { bev: 2, add: 0.6, edge: D.hi ? true : undefined, drop: D.hi ? 1 : 0, nrm: (x, y) => { const t = clamp((y - 19.4) / 2.6, -0.9, 0.9); return [clamp((x - 16) / 20, -0.5, 0.5), t, Math.sqrt(1 - t * t * 0.9 - 0.06)]; } });
    // le plus
    const t = D.lo ? 2.1 : 1.7, px = 25, py = 25.4;
    g.shape(I, U(sBox(px, py, 5.6, t, 0.4), sBox(px, py, t, 5.6, 0.4)), M.green, { bev: t, add: 2.4, edge: D.hi ? true : undefined, drop: D.lo ? 0 : 1 });
  },

  // cache : un coffre bombé cerclé de laiton, sa serrure
  n_cache(g, D) {
    const f = I, wd = M.oak;
    const planks = (x, y) => (D.hi && (y - 17) % 3.4 < 0.4 ? -1.2 : 0) + grain(D, 0.9, 0.3)(x, y) * 0.5;
    g.shape(f, sBox(16, 22, 13, 6.6, 1), wd, { bev: 2, edge: D.lo ? undefined : true, drop: D.hi ? 1 : 0, tex: planks });
    const lid = U(X(sEll(16, 14.8, 13, 7.6), (x, y) => y - 14.8), sBox(16, 15.2, 13, 1.2, 0.4));
    g.shape(f, lid, wd, { bev: 4, prof: 'soft', edge: D.lo ? undefined : true, add: 0.7, nrm: (x, y) => { const t = clamp((y - 14.8) / 8, -0.9, 0); return [clamp((x - 16) / 16, -0.4, 0.4), t, Math.sqrt(1 - t * t - 0.05)]; } });
    g.line(f, [[3.4, 16.4], [28.6, 16.4]], PAL.oak[0], { w: D.lo ? 1 : 2 });
    // les ferrures
    for (const x of D.lo ? [8, 24] : [7.6, 24.4]) g.shape(f, sBox(x, 17.4, D.lo ? 1.5 : 1.25, 11.6, 0.3), M.brass, { clip: true, bev: 0.9, add: 0.2 });
    if (!D.lo) for (const x of [3.6, 28.4]) g.shape(f, sBox(x, 22.4, 0.9, 6.2, 0.3), M.brass, { clip: true, bev: 0.6, add: -0.6 });
    // la serrure et son trou
    g.shape(f, sBox(16, 18, D.lo ? 2.8 : 2.6, D.lo ? 3.2 : 3, 0.8), M.brass, { bev: 1.2, add: 0.6, edge: D.lo ? undefined : true });
    g.shape(f, U(sCirc(16, 17.4, D.lo ? 0.9 : 0.75), sBox(16, 19, 0.4, 1, 0)), M.brass, { col: BLACK });
    if (!D.lo) g.glint(f, 9.6, 10, D.hi ? 2 : 1);
  },

  // otage : des menottes d'acier, leurs charnières et la chaîne
  n_prisonnier(g, D) {
    const f = I, w = D.lo ? 1.9 : 1.6, st = M.steel;
    // la chaîne : trois maillons, un de face, un de profil
    if (!D.lo) {
      g.shape(f, sRing(11.6, 10.6, 1.7, 0.7), st, { bev: 0.7, add: 0.8 });
      g.shape(f, sBox(16, 9, 2.2, 0.8, 0.8), st, { bev: 0.8, add: 1 });
      g.shape(f, sRing(20.4, 10.6, 1.7, 0.7), st, { bev: 0.7, add: 0.8 });
    } else g.shape(f, sBox(16, 10.6, 5.4, 1, 0.8), st, { bev: 1, add: 1 });
    for (const [cx, k] of [[9.2, 0.4], [22.8, -0.2]]) {
      g.shape(f, sRing(cx, 20.6, 6.2, w), st, { bev: w, add: k + 0.4, edge: D.lo ? undefined : true, drop: D.hi ? 1 : 0 });
      // la charnière en haut de l'anneau
      g.shape(f, sBox(cx + (cx < 16 ? 2.2 : -2.2), 14.6, 2.6, 1.8, 0.6), st, { bev: 1.2, add: k + 1, edge: D.lo ? undefined : true });
      if (!D.lo) g.ball(f, cx + (cx < 16 ? 2.2 : -2.2), 14.6, 0.7, 0.7, M.brass);
    }
    if (!D.lo) g.glint(f, 4.6, 17, D.hi ? 2 : 1, hex('ffffff'), hex('b4c2d6'));
  },

  // le repaire d'El Diablo : un crâne cornu aux orbites rougeoyantes
  n_repaire(g, D) {
    const f = I;
    // les cornes, effilées, qui montent en se recourbant
    for (const sx of [-1, 1]) {
      const p = [[16 + sx * 6, 11.2], [16 + sx * 10, 8.8], [16 + sx * 12.6, 5.4], [16 + sx * 12.6, 1.6]];
      g.shape(f, sTube(p, D.lo ? 3.4 : 2.6, D.lo ? 1.2 : 0.6), M.red, { bev: 2.4, edge: D.lo ? undefined : true, add: sx > 0 ? -0.4 : 0.4 });
      if (D.hi) for (const t of [0.3, 0.55]) { const [x, y] = [16 + sx * (6 + t * 7.4), 11.2 - t * 5]; g.line(f, [[x - 1.2, y - 1.2 * sx], [x + 1.2, y + 1.2 * sx]], PAL.red[1], { clip: true }); }
    }
    const skull = U(sEll(16, 15.4, 8.6, 8), sBox(16, 23, 5.2, 4, 1.8));
    g.shape(f, skull, M.bone, { bev: 4.4, prof: 'soft', edge: D.lo ? undefined : true, drop: D.hi ? 1 : 0, add: 0.5 });
    for (const sx of [-1, 1]) {
      g.shape(f, sRot(sEll(16 + sx * 3.5, 16.2, D.lo ? 2.6 : 2.4, D.lo ? 2.4 : 2.1), 16 + sx * 3.5, 16.2, sx * 0.35), M.bone, { col: BLACK });
      g.ball(f, 16 + sx * 3.4, 16.6, D.lo ? 0.9 : 0.8, D.lo ? 0.9 : 0.8, M.fire, { col: D.lo ? PAL.fire[3] : PAL.fire[4] });
    }
    g.shape(f, sPoly([[16, 19.2], [17.3, 21.6], [14.7, 21.6]]), M.bone, { col: BLACK });
    if (!D.lo) for (const x of [13.4, 16, 18.6]) g.line(f, [[x, 23.4], [x, 26.4]], PAL.bone[1], { clip: true });
    if (D.hi) g.line(f, arcPts(11.6, 10.4, 2.4, 1.6, Math.PI * 1.1, Math.PI * 1.6, 6), PAL.bone[7], { clip: true });
  },

  // le départ (Dusty Gulch) : une maison de planches, toit rouge, fenêtres allumées
  n_depart(g, D) {
    const f = I;
    const planks = (x, y, X) => (D.hi && Math.abs(((x - 6) % 3.2) - 1.6) > 1.3 ? -1 : 0);
    g.shape(f, sBox(16, 21.4, 10.6, 8.2, 0.4), M.oak, { bev: 1.4, edge: D.lo ? undefined : true, add: 0.6, tex: planks, drop: D.hi ? 1 : 0 });
    // la cheminée, puis le toit
    g.shape(f, sBox(22.4, 6.6, 1.6, 3.4, 0.3), M.redm, { bev: 1, add: -0.6, edge: D.lo ? undefined : true });
    g.shape(f, grow(sPoly([[2.6, 14.2], [16, 3.6], [29.4, 14.2]]), 0.8), M.redm, { bev: 2.4, edge: D.lo ? undefined : true, add: 0.4, drop: D.hi ? 1 : 0, tex: (x, y) => (D.hi && (y - 4) % 2.6 < 0.5 ? -1 : 0) });
    // la porte et les fenêtres éclairées
    g.shape(f, sBox(16, 25, D.lo ? 2.6 : 2.4, 4.8, 0.3), M.wood, { col: PAL.wood[1] });
    if (!D.lo) g.dot(f, 17.6, 25.4, PAL.brass[6]);
    for (const x of [9.6, 22.4]) {
      g.shape(f, sBox(x, 19.6, D.lo ? 2.4 : 2.2, D.lo ? 2.4 : 2.2, 0.2), M.fire, { col: PAL.fire[5] });
      if (!D.lo) g.line(f, [[x, 17.6], [x, 21.6]], PAL.wood[2], { clip: true });
    }
    if (D.hi) for (const [x, y, r] of [[23.8, 1.8, 1.6], [26.2, -0.4, 1.2]]) g.ball(f, x, y + 1, r, r, M.smoke, { add: 2, holes: (X, Y) => ((X ^ Y) & 1) === 1 });
  },

  // territoire (encore inconnu) : une carte pliée en trois, la piste en pointillés rouges jusqu'à la croix
  n_unknown(g, D) {
    const f = I, pp = M.paper;
    const panes = [
      [[[2.6, 8.4], [11.4, 5.4], [11.4, 26], [2.6, 29]], [-0.34, 0, 0.94]],
      [[[11.4, 5.4], [20.6, 8.4], [20.6, 29], [11.4, 26]], [0.4, 0, 0.92]],
      [[[20.6, 8.4], [29.4, 5.4], [29.4, 26], [20.6, 29]], [-0.34, 0, 0.94]],
    ];
    for (const [pts, n] of panes) g.shape(f, sPoly(pts), pp, { nrm: () => n, edge: D.lo ? undefined : true, add: 0.8, tex: (x, y, X, Y) => (D.hi && (X * 5 + Y * 3) % 13 === 0 ? -0.8 : 0) });
    const trail = [[5, 25], [8.4, 20.2], [13.4, 19.6], [16.4, 15], [21.4, 14.6], [24.6, 11.4]];
    if (D.lo) g.line(f, trail, PAL.red[3], { clip: true });
    else {
      // la piste en points, réguliers le long du tracé
      let acc = 0;
      for (let i = 0; i < trail.length - 1; i++) {
        const [ax, ay] = trail[i], [bx, by] = trail[i + 1], l = Math.hypot(bx - ax, by - ay);
        for (; acc < l; acc += D.hi ? 2.2 : 2.8) g.ball(f, ax + ((bx - ax) * acc) / l, ay + ((by - ay) * acc) / l, D.hi ? 0.8 : 0.7, D.hi ? 0.8 : 0.7, M.red, { col: PAL.red[3], clip: true });
        acc -= l;
      }
    }
    const r = D.lo ? 2.2 : 2;
    g.shape(f, U(sTube([[25.6 - r, 10.4 - r], [25.6 + r, 10.4 + r]], D.lo ? 1 : 0.8), sTube([[25.6 + r, 10.4 - r], [25.6 - r, 10.4 + r]], D.lo ? 1 : 0.8)), M.red, { add: 0.6, clip: true });
  },

  // ---------------------------------------------------------------- états (au-dessus des têtes)
  s_bleed(g, D) { drop(g, D, I, 16, 16, 13.4); },

  s_mark(g, D) {
    const f = I;
    for (const [r, c, k] of [[13.4, M.red, 0.3], [9.8, M.cloth, 0.2], [6.2, M.red, 0.5], [2.8, M.cloth, 0.6]]) g.ball(f, 16, 16, r, r, c, { flat: 0.8, add: k, edge: r > 13 && !D.lo ? true : undefined });
  },

  s_affut(g, D) { eye(g, D, I, 16, 16, 14, M.copper, 0.44); },

  s_shield(g, D) {
    const f = I, shield = grow(sPoly([[5.4, 4.4], [26.6, 4.4], [26.6, 14], [24.4, 21], [16, 29.4], [7.6, 21], [5.4, 14]]), 0.6);
    g.shape(f, shield, M.blue, { bev: 2.4, edge: D.lo ? undefined : true, add: 0.6 });
    g.shape(f, grow(shield, D.lo ? -3 : -2.4), M.blue, { bev: 3, add: -0.4, nrm: (x, y) => { const sx = x < 16 ? -1 : 1, nx = sx * 0.34, ny = clamp((y - 15) / 20, -0.4, 0.4); return [nx, ny, Math.sqrt(1 - nx * nx - ny * ny)]; } });
    if (!D.lo) g.glint(f, 10.6, 9.6, D.hi ? 2 : 1, hex('ffffff'), hex('c4defe'));
  },

  // épinglé : deux gros clous plantés en croix
  s_pin(g, D) {
    const f = I;
    // la planche, ses veines ; le clou enfoncé jusqu'à mi-hauteur, sa tête ronde ; les éclats autour du trou
    g.shape(f, sBox(16, 25, 14, 4.4, 1), M.oak, { bev: 1.6, add: 0.6, edge: D.lo ? undefined : true, tex: grain(D, 0.9, 0.4) });
    cyl(g, f, 16, 14.6, 8, D.lo ? 2.4 : 2, M.iron, { vert: true, add: 1.4, edge: D.lo ? undefined : true, drop: D.hi ? 1 : 0 });
    g.shape(f, sEll(16, 6.2, D.lo ? 7.4 : 7, D.lo ? 3 : 2.6), M.iron, { bev: 2, add: 1.8, edge: D.lo ? undefined : true, drop: D.lo ? 0 : 1 });
    g.shape(f, sEll(16, 21.2, 3.4, 1), M.oak, { col: PAL.oak[0] });
    if (!D.lo) for (const [x0, y0, x1, y1] of [[10.4, 19.4, 8, 17.4], [21.6, 19.4, 24, 17.4], [16, 18.4, 16, 16.6]].slice(0, 2)) g.line(f, [[x0, y0], [x1, y1]], PAL.fire[6], { w: D.hi ? 2 : 1 });
  },

  // fantôme : un drap qui flotte, l'ourlet ondulé, les yeux creux
  s_ghost(g, D) {
    const f = I;
    const body = Sub(sSmooth(sCirc(16, 13, 10.4), sBox(16, 21.6, 10.4, 7.4, 1), 1), sCirc(9.4, 30.2, 2.7), sCirc(16.6, 30.6, 2.7), sCirc(23.6, 30.2, 2.4));
    g.shape(f, body, M.ghost, { bev: 6, prof: 'soft', edge: D.lo ? undefined : true, add: 0.6 });
    for (const x of [12, 20]) g.shape(f, sEll(x, 13.6, D.lo ? 2.4 : 2, D.lo ? 3.2 : 2.8), M.ghost, { col: PAL.ghost[0] });
    g.shape(f, sEll(16, 20.2, 1.8, 2.2), M.ghost, { col: PAL.ghost[1] });
  },
};

// le cadrage de chaque dessin (base) : 1 par défaut, moins pour un objet qu'on veut garder petit dans sa case, 0 : tel quel
const FIT = {};

export const ITEM_IDS = Object.keys(ART);
export const hasItemArt = (id) => Object.prototype.hasOwnProperty.call(ART, id);

// ------------------------------------------------------------ petits signes faits main (6 à 10 pixels du jeu)
// En tout petit, un dessin réduit devient de la bouillie : les icônes d'interface (caractéristiques, ressources,
// états, cran) ont leur version dessinée à la main, case par case (une case = deux pixels fins), en une seule
// famille : silhouette franche, trois tons par matière (l'ombrage est calculé : le bord exposé en haut à gauche
// s'éclaire, le bord en bas à droite s'assombrit), une lettre majuscule pour un reflet, et un contour d'un pixel fin
// sombre posé autour. Elles se lisent d'un coup d'œil sur le bois sombre comme sur le parchemin.
// Une grille : rows (une lettre = une matière, '.' = vide) ; mirror : la moitié gauche (colonne du milieu comprise),
// recopiée en miroir (le côté droit, à l'ombre, un ton plus sombre) ; vmirror : de même, la moitié haute ; flat :
// des traits fins (un ton clair partout).
const GM = {
  r: ramp('7a1c12 b8301c e45a3a ffb08a'), // rouge sang
  g: ramp('8a5a14 c8901e f2c84a fff0b0'), // or, laiton
  q: ramp('7a3410 b85a24 e08a48 ffc890'), // cuivre des balles
  s: ramp('56607a 8a96aa c2ccdc f4f8ff'), // acier
  b: ramp('5a2c14 8e4c22 c27a3e eeb070'), // cuir de botte
  h: ramp('2a1810 3e2618 5a3a24 7a5434'), // semelle, cerclages sombres
  w: ramp('6a4220 a06a34 d29a58 f2c888'), // bois clair
  x: ramp('4a2c14 6a4220 8a5a2e a87442'), // bois à l'ombre
  c: ramp('9a8a6c cfc2a2 f2e8cc fffdf4'), // crème, os, blanc d'œil
  v: ramp('6a7ea8 a8bcd8 dce8f6 ffffff'), // fantôme
  f: ramp('a82a0c e0601a f8962a ffd070'), // flamme
  y: ramp('d88a18 f6c040 ffe68a fffbe0'), // cœur de flamme, éclat
  u: ramp('1e3c7a 3466c0 6aa0ec bfe0ff'), // bleu
  n: ramp('3e2c1e 64503a 927454 bc9a70'), // feutre du chapeau
  p: ramp('8a4a28 c4845a e8b484 fcdcb4'), // peau
  o: ramp('7a3a12 b86a2a e2a058 f8d498'), // croûte du pain
  i: ramp('5a2a10 9a5420 c8843a f0b870'), // iris
  d: ramp('4a2808 4a2808 5a3410 5a3410'), // gravure sombre sur l'or
  k: ramp('1e120a 1e120a 1e120a 1e120a'), // encre (pupille, trous)
};
// une grille de disques concentriques (layers : [rayon, lettre], du plus petit au plus grand)
const disk = (w, h, cx, cy, layers) => Array.from({ length: h }, (_, y) => Array.from({ length: w }, (_, x) => {
  const d = Math.hypot(x - cx, y - cy);
  for (const [r, ch] of layers) if (d <= r) return ch;
  return '.';
}).join(''));
// une grille retouchée : cells = [[x, y, lettre], …]
const overlay = (rows, cells) => {
  const g = rows.map((r) => [...r]);
  for (const [x, y, ch] of cells) g[y][x] = ch;
  return g.map((r) => r.join(''));
};
const GLYPH = {
  coeur: { mirror: true, rows: [
    '..rrrr..',
    '.rRRrrr.',
    'rRRrrrrr',
    'rRrrrrrr',
    'rrrrrrrr',
    'rrrrrrrr',
    '.rrrrrrr',
    '..rrrrrr',
    '...rrrrr',
    '....rrrr',
    '.....rrr',
    '......rr',
    '.......r',
  ] },
  armure: { mirror: true, rows: [
    'gggggggg',
    'gSSsssss',
    'gSssssss',
    'gSssssss',
    'gsssssss',
    'gsssssss',
    '.gssssss',
    '.gssssss',
    '..gsssss',
    '..gsssss',
    '...gssss',
    '....gsss',
    '.....ggg',
    '.......g',
  ] },
  // une grosse botte de cow-boy : la tige et ses tirants, la pointe, le talon, l'éperon
  botte: { rows: [
    '..bbb.bbbb.....',
    '..bbbbbbbb.....',
    '..bBbbbbbb.....',
    '..bBhhhhhb.....',
    '..bBbbbbbb.....',
    '..bBbbbbbb.....',
    '..bBbbbbbb.....',
    '..bBbbbbbbb....',
    '..bBbbbbbbbbb..',
    '..bbbbbbbbbbbb.',
    's.bbbbbbbbbbbbb',
    'sshhhhhhhhhhhhh',
    's.hhh..........',
  ] },
  viseur: { flat: 1, rows: [
    '.....sssss.....',
    '...ss.....ss...',
    '..s.........s..',
    '.s.....s.....s.',
    '.s.....s.....s.',
    's.............s',
    's......r......s',
    'ssss..rrr..ssss',
    's......r......s',
    's.............s',
    '.s.....s.....s.',
    '.s.....s.....s.',
    '..s.........s..',
    '...ss.....ss...',
    '.....sssss.....',
  ] },
  // l'esquive : une flèche courbe qui file par-dessus une silhouette qui se jette de côté
  esquive: { flat: true, rows: [
    '.....uuuuu.....',
    '...uuu...uuu...',
    '..uu.......uu..',
    '.uu.........u..',
    '.u...bb....uuuu',
    'uu...bb.....uu.',
    'u...bbbb....u..',
    'u..b.bb.b......',
    'u....bb........',
    '....bbbb.......',
    '...bb..bb......',
    '..bb....bb.....',
    '..b......b.....',
  ] },
  crit: { mirror: true, vmirror: true, rows: [
    '.......y',
    '.f.....y',
    '..f...fy',
    '...f.ffy',
    '....ffyy',
    '...ffyyy',
    '..ffyyyY',
    'yyyyyyyY',
  ] },
  cran: { rows: [
    '....f........',
    '....ff.......',
    '...fff...f...',
    '...ffff.ff...',
    '..fffffffff..',
    '..ffffyffff..',
    '.fffffyyffff.',
    '.ffffyyyyfff.',
    'fffffyyyyyfff',
    'ffffyyyYyyfff',
    'fffyyyYYyyyff',
    '.ffyyYYYyyyf.',
    '.fffyyYYyyff.',
    '..fffyyyyff..',
    '...fffffff...',
  ] },
  cran_s: { rows: [
    '...f......',
    '...ff.....',
    '..fff..f..',
    '..ffff.ff.',
    '.ffffffff.',
    '.fffyyfff.',
    'fffyyyyfff',
    'ffyyYYyyff',
    'ffyYYYYyff',
    '.ffyYYyff.',
    '..ffffff..',
  ] },
  s_affut: { flat: true, rows: [
    '....hhhhhhh....',
    '..hhhhhhhhhhh..',
    '.hhcciiiiicchh.',
    'hcccciwkkicccch',
    'hccccikkkicccch',
    '.hccciiiiiccch.',
    '..hhccccccchh..',
    '....hhhhhhh....',
  ] },
  s_mark: { rows: disk(15, 15, 7, 7, [[1.1, 'c'], [3.3, 'r'], [5.1, 'c'], [7.2, 'r']]) },
  s_shield: { mirror: true, rows: [
    'uuuuuuuu',
    'uUUuuuuu',
    'uUuuuuuu',
    'uUuuuuuu',
    'uuuuuuuu',
    'uuuuuuuu',
    '.uuuuuuu',
    '.uuuuuuu',
    '..uuuuuu',
    '...uuuuu',
    '....uuuu',
    '.....uuu',
    '.......u',
  ] },
  // cloué : le clou planté dans la planche
  s_pin: { rows: [
    '...sssssssss...',
    '..sSSsssssssss.',
    '......sSs......',
    '......sSs......',
    '......sSs......',
    '......sSs......',
    '......sSs......',
    '......sSs......',
    'wwwwwwkkkwwwwww',
    'wwwwwwwwwwwwwww',
    'wwwwwwwwwwwwwww',
    'xxxxxxxxxxxxxxx',
  ] },
  s_bleed: { mirror: true, rows: [
    '......r',
    '.....rr',
    '.....rr',
    '....rrr',
    '....rrr',
    '...rrrr',
    '..rrrrr',
    '..rRrrr',
    '.rRRrrr',
    '.rRrrrr',
    '.rrrrrr',
    '.rrrrrr',
    '..rrrrr',
    '...rrrr',
    '....rrr',
  ] },
  s_ghost: { mirror: true, rows: [
    '....vvvv',
    '..vvvvvv',
    '.vVvvvvv',
    '.vVkkvvv',
    'vvvkkvvv',
    'vvvvvvvv',
    'vvvvvvvk',
    'vvvvvvvk',
    'vvvvvvvv',
    'vvvvvvvv',
    'vv.vvv.v',
    'v...v...',
  ] },
  balles: { rows: [
    '......qq......',
    '.....qqqq.....',
    '.qq..qqqq..qq.',
    'qqqq.qqqq.qqqq',
    'qqqq.gggg.qqqq',
    'gggg.Gggg.gggg',
    'Gggg.Gggg.Gggg',
    'Gggg.Gggg.Gggg',
    'Gggg.Gggg.Gggg',
    'Gggg.Gggg.Gggg',
    'gggg.gggg.gggg',
    'hhhh.hhhh.hhhh',
  ] },
  // une caisse de trois quarts : le dessus clair, la face avant cerclée et son écharpe, le côté à l'ombre
  fourn: { rows: [
    '...WWWWWWWWWWW',
    '..WWWWWWWWWWWx',
    '.WWWWWWWWWWWxx',
    'wwwwwwwwwwwxxx',
    'whhhhhhhhhwxxx',
    'whwwwwwwhhwxxx',
    'whwwwwwhhwwxxx',
    'whwwwwhhwwwxxx',
    'whwwwhhwwwwxxx',
    'whwwhhwwwhwxxx',
    'whwhhwwwwhwxxx',
    'whhhhhhhhhwxxx',
    'wwwwwwwwwwwxx.',
    'wwwwwwwwwwwx..',
  ] },
  // une miche entaillée
  vivres: { rows: [
    '....oooooo.....',
    '..oooooooooo...',
    '.oooooccoooocc.',
    'ooocooocooooco.',
    'oocoooocoooocoo',
    'ooooooooooooooo',
    'ooooooooooooooo',
    '.ooooooooooooo.',
    '..ooooooooooo..',
  ] },
  dollars: { rows: overlay(disk(13, 13, 6, 6, [[6.4, 'g']]), [
    [6, 2, 'd'], [5, 3, 'd'], [6, 3, 'd'], [7, 3, 'd'], [8, 3, 'd'], [4, 4, 'd'], [6, 4, 'd'], [5, 5, 'd'], [6, 5, 'd'],
    [6, 6, 'd'], [7, 6, 'd'], [6, 7, 'd'], [8, 7, 'd'], [4, 8, 'd'], [5, 8, 'd'], [6, 8, 'd'], [7, 8, 'd'], [6, 9, 'd'],
    [3, 2, 'G'], [4, 2, 'G'], [2, 3, 'G'], [2, 4, 'G'],
  ]) },
  xp: { mirror: true, rows: [
    '.......g',
    '......gg',
    '......gg',
    '.....ggg',
    'gGGGgggg',
    '.ggggggg',
    '..gggggg',
    '...ggggg',
    '...ggggg',
    '..gggggg',
    '..ggggg.',
    '.gggg...',
    '.gg.....',
  ] },
  // un bandit : chapeau rabattu, les yeux, le foulard rouge sur le nez
  n_combat: { mirror: true, rows: [
    '.....nn.',
    '....nnnn',
    '....hhhh',
    '.nnnnnnn',
    'nnnnnnnn',
    '...ppppp',
    '...pkppp',
    '...ppppp',
    '..rrrrrr',
    '..rrrrrr',
    '...rrrrr',
    '....rrrr',
    '.....rrr',
    '......rr',
  ] },
};
// les grilles complètes (miroirs déroulés), et la part à l'ombre
const glyphMemo = {};
function glyphGrid(id) {
  if (glyphMemo[id]) return glyphMemo[id];
  const G = GLYPH[id];
  let rows = G.rows.map((r) => [...r]), dark = rows.map((r) => r.map(() => false));
  if (G.mirror) {
    rows = rows.map((r) => [...r, ...r.slice(0, -1).reverse().map((ch) => ch.toLowerCase())]);
    dark = rows.map((r) => r.map((_, x) => x >= (r.length + 1) / 2));
  }
  if (G.vmirror) {
    rows = [...rows, ...rows.slice(0, -1).reverse().map((r) => r.map((ch) => ch.toLowerCase()))];
    dark = [...dark, ...dark.slice(0, -1).reverse().map((r) => r.map(() => true))];
  }
  return (glyphMemo[id] = { rows, dark, w: Math.max(...rows.map((r) => r.length)), h: rows.length });
}
// les pixels (N × N, N = size × F) d'un petit signe, ou null s'il n'a pas de grille ou qu'elle ne tient pas
function glyphPixels(id, size) {
  if (!GLYPH[id]) return null;
  const { rows, dark, w, h } = glyphGrid(id), G = GLYPH[id], N = size * F, c = 2;
  if (w * c + 2 > N || h * c + 2 > N) return null;
  const at = (x, y) => (y >= 0 && y < h && x >= 0 && rows[y][x] && rows[y][x] !== '.' ? rows[y][x].toLowerCase() : null);
  const px = new Uint32Array(N * N), ox = Math.floor((N - w * c) / 2), oy = Math.floor((N - h * c) / 2);
  for (let y = 0; y < h; y++) for (let x = 0; x < rows[y].length; x++) {
    const ch = rows[y][x];
    if (ch === '.') continue;
    const m = ch.toLowerCase(), R = GM[m];
    let t;
    if (ch !== m) t = 3;
    else {
      // (seul le bord contre le vide s'éclaire ou s'assombrit : un détail posé sur une matière reste net)
      const tl = !at(x, y - 1) || !at(x - 1, y), br = !at(x, y + 1) || !at(x + 1, y);
      t = tl ? 2 : br ? 0 : 1;
      // (les traits fins, anneaux et flèches : un seul ton clair, sans le grain des marches d'escalier)
      if (G.flat) t = typeof G.flat === 'number' ? G.flat : br && !tl ? 1 : 2;
      if (dark[y][x]) t = Math.max(0, t - 1);
    }
    for (let j = 0; j < c; j++) for (let i = 0; i < c; i++) px[(oy + y * c + j) * N + ox + x * c + i] = R[t];
  }
  // le contour d'un pixel fin
  const src = px.slice(), o = (x, y) => x >= 0 && y >= 0 && x < N && y < N && src[y * N + x];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (!src[y * N + x] && (o(x - 1, y) || o(x + 1, y) || o(x, y - 1) || o(x, y + 1))) px[y * N + x] = OUT;
  return px;
}
export const GLYPH_IDS = Object.keys(GLYPH);

// ------------------------------------------------------------ rendu, variantes et cache
// les pixels de base (sans variante) d'une icône : calculés une fois par (id, taille)
const bases = new Map();
// au plus tant de dessins gardés (pixels de base, et canvas finis) : bien assez pour un combat, la mémoire reste sage
const MAX_ARTS = 400;
const artK = (size) => (size <= 12 ? 2 : 1); // pixels fins par pixel d'art
function base(id, size, noGlyph = false) {
  const key = `${id}|${size}|${noGlyph ? 1 : 0}`;
  let b = bases.get(key);
  if (b) return b;
  // en tout petit, le signe fait main s'il y en a un (et qu'il tient dans la case)
  const gp = size <= 10 && !noGlyph ? glyphPixels(id, size) : null;
  if (gp) b = { A: size * F, k: 1, px: gp };
  else {
    const k = artK(size), A = Math.max(8, Math.round((size * F) / k));
    const g = render(id, A, k);
    g.outline(OUT);
    if (A >= 80) g.outline(OUT); // en grand (20 pixels du jeu et plus), un contour franc de deux pixels fins
    b = { A, k, px: g.px };
  }
  if (bases.size >= MAX_ARTS) bases.delete(bases.keys().next().value);
  bases.set(key, b);
  return b;
}
// le dessin d'un objet sur une toile de A pixels d'art (k : pixels fins par pixel d'art, 2 en petit), sans contour
function render(id, A, k = 1) {
  const D = { A, lo: A <= 20, hi: A >= 48, xhi: A >= 96 };
  let g = new Art(A);
  ART[id](g, D);
  // le cadrage : l'objet agrandi (un peu) et recentré pour remplir sa case, surtout en petit où chaque pixel compte
  // (on mesure le dessin, puis on le refait cadré : deux rendus, une seule fois par taille)
  const fit = FIT[id] ?? 1;
  if (fit) {
    let x0 = A, y0 = A, x1 = -1, y1 = -1;
    for (let y = 0; y < A; y++) for (let x = 0; x < A; x++) if (g.px[y * A + x]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    if (x1 >= 0) {
      const m = Math.max(x1 - x0 + 1, y1 - y0 + 1), room = k === 2 ? A - 2 : Math.round(A * 0.9);
      const z = clamp(room / m, 1, k === 2 ? 1 + 0.42 * fit : 1 + 0.16 * fit), s1 = A / 32;
      const cx = (x0 + x1 + 1) / 2, cy = (y0 + y1 + 1) / 2;
      if (z > 1.03 || Math.abs(cx - A / 2) > 0.6 || Math.abs(cy - A / 2) > 0.6) {
        const s = s1 * z;
        g = new Art(A, z, cx / s1 - A / (2 * s), cy / s1 - A / (2 * s));
        ART[id](g, D);
      }
    }
  }
  return g;
}
// les pixels bruts (entiers RGBA) d'un dessin de A × A pixels fins, sans contour ni cache : pour les emblèmes des
// médaillons de la carte (pistepawn.js), qui les recolorent ; FIRE : les teintes du feu (gardées telles quelles)
export function artPixels(id, A) { return hasItemArt(id) ? render(id, A, 1).px.slice() : null; }
export const FIRE = new Set(PAL.fire);

// le liseré et l'éclat des objets de qualité (1 : bleu, 2 : or), l'éclat d'or scintille (f : son image)
const QCOL = [null, { line: hex('3a64b0'), hi: hex('8cc0fa'), core: hex('eef6ff') }, { line: hex('a87818'), hi: hex('f8d070'), core: hex('fffbe0') }];
function decorate(px, A, q, fr) {
  const Q = QCOL[q];
  // le contour prend la couleur de la qualité
  for (let i = 0; i < px.length; i++) if (px[i] === OUT) px[i] = Q.line;
  // l'éclat : une étoile à quatre branches en haut à droite
  const r = q === 2 ? [2, 3, 4, 3, 2, 1][fr % GLINT_FRAMES] : 2, u = Math.max(1, Math.round(A / 32));
  const cx = A - 1 - (r + 1) * u, cy = (r + 1) * u;
  const put = (x, y, c) => { for (let j = 0; j < u; j++) for (let i = 0; i < u; i++) { const X = x + i, Y = y + j; if (X >= 0 && Y >= 0 && X < A && Y < A) px[Y * A + X] = c; } };
  for (let k = -r - 1; k <= r + 1; k++) for (const [x, y] of [[cx + k * u, cy], [cx, cy + k * u]]) if (k !== 0) put(x, y, Q.line);
  for (const [x, y] of [[cx - u, cy - u], [cx + u, cy - u], [cx - u, cy + u], [cx + u, cy + u]]) put(x, y, Q.line);
  for (let k = -r; k <= r; k++) { put(cx + k * u, cy, Math.abs(k) <= r / 2 ? Q.core : Q.hi); put(cx, cy + k * u, Math.abs(k) <= r / 2 ? Q.core : Q.hi); }
}

const arts = new Map();
// l'icône d'un objet (canvas de size × F pixels fins de côté), ou null si l'objet n'a pas de dessin
export function itemArt(id, size = 16, opts = {}) {
  if (!hasItemArt(id)) return null;
  const q = opts.q | 0, fr = q === 2 ? (opts.f | 0) % GLINT_FRAMES : 0;
  const key = `${id}|${size}|${q}|${fr}|${opts.off ? 1 : 0}|${opts.mono || ''}|${opts.tint || ''}|${opts.art ? 1 : 0}`;
  let c = arts.get(key);
  if (c) { arts.delete(key); arts.set(key, c); return c; } // remis en tête : le moins servi partira le premier
  const b = base(id, size, !!opts.art), A = b.A, px = b.px.slice();
  if (q) decorate(px, A, q, fr);
  if (opts.off) {
    // grisé : la luminosité seule, éteinte et un peu froide
    for (let i = 0; i < px.length; i++) {
      if (!px[i]) continue;
      const l = lum(px[i]), v = 34 + l * 120;
      px[i] = pack(v * 0.96, v * 0.95, v, 255);
    }
  }
  if (opts.tint) {
    const t = hex(opts.tint), wh = hex('fffbf0');
    for (let i = 0; i < px.length; i++) {
      if (!px[i] || px[i] === OUT) continue;
      const l = lum(px[i]);
      px[i] = l < 0.5 ? blend(OUT, t, 0.25 + l * 1.5) : blend(t, wh, (l - 0.5) * 1.1);
    }
  }
  if (opts.mono) { const m = hex(opts.mono); for (let i = 0; i < px.length; i++) if (px[i]) px[i] = m; }
  // agrandi (k pixels fins par pixel d'art) sans lissage
  const N = A * b.k;
  c = S.makeCanvas(N, N);
  const g = c.getContext('2d'), img = g.createImageData(N, N), out = new Uint32Array(img.data.buffer);
  for (let y = 0; y < N; y++) {
    const row = ((y / b.k) | 0) * A;
    for (let x = 0; x < N; x++) out[y * N + x] = px[row + ((x / b.k) | 0)];
  }
  g.putImageData(img, 0, 0);
  if (arts.size >= MAX_ARTS) arts.delete(arts.keys().next().value); // le plus ancien s'en va
  arts.set(key, c);
  return c;
}

// pose l'icône centrée en (cx, cy), en pixels du jeu, sur un ctx mis à l'échelle F (setTransform(F, 0, 0, F, 0, 0))
export function drawItem(ctx, id, cx, cy, size = 16, opts = {}) {
  const c = itemArt(id, size, opts);
  if (!c) return false;
  const w = c.width / F, q = (v) => Math.round(v * F) / F;
  ctx.drawImage(c, q(cx - w / 2), q(cy - w / 2), w, w);
  return true;
}
