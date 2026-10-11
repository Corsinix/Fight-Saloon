// Armes en main en 3D (moteur « vm3d » du FPS) : petit moteur de rendu, mains articulées, armes longues (Winchester,
// fusil à pompe, Sharps, canon scié, harpon, canardière) et derringer. Extrait de fpsart.js, qui l'importe et s'en sert
// tel quel (la roulette, elle, dessine les siennes en 2D : rlart.js).
import { OUT, shade, mix } from './sprites.js';

// Canvas relu pixel par pixel : gardé en mémoire plutôt que sur la carte graphique
function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingEnabled = false;
  return c;
}
// Tirage pseudo-aléatoire reproductible (mêmes assets à chaque chargement)
function rng(seed) {
  let s = (seed * 2654435761) >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rd = Math.round;
// Pinceau sur un canvas, origine (ox, oy) : toutes les coordonnées sont arrondies au pixel.
//  R(x, y, w, h, col)   rectangle        P(x, y, col)              un pixel
//  line(x0, y0, x1, y1, col, w = 1)      ell(cx, cy, rx, ry, col)  ellipse pleine
//  disc(cx, cy, r, col)                  poly(points, col)         polygone plein (règle pair-impair)
function pen(c, ox = 0, oy = 0) {
  const ctx = c.getContext('2d');
  const R = (x, y, w, h, col) => {
    if (w <= 0 || h <= 0) return;
    ctx.fillStyle = col;
    ctx.fillRect(rd(ox + x), rd(oy + y), rd(w), rd(h));
  };
  const P = (x, y, col) => R(x, y, 1, 1, col);
  const line = (x0, y0, x1, y1, col, w = 1) => {
    const n = Math.max(1, Math.abs(rd(x1) - rd(x0)), Math.abs(rd(y1) - rd(y0)));
    const o = Math.floor((w - 1) / 2);
    for (let k = 0; k <= n; k++) R(rd(x0 + ((x1 - x0) * k) / n) - o, rd(y0 + ((y1 - y0) * k) / n) - o, w, w, col);
  };
  const ell = (cx, cy, rx, ry, col) => {
    for (let dy = -Math.ceil(ry); dy <= Math.ceil(ry); dy++) {
      const t = 1 - (dy / (ry + 0.5)) ** 2;
      if (t < 0) continue;
      const half = rd(rx * Math.sqrt(t));
      R(rd(cx) - half, rd(cy) + dy, half * 2 + 1, 1, col);
    }
  };
  const disc = (cx, cy, r, col) => ell(cx, cy, r, r, col);
  const poly = (pts, col) => {
    const ys = pts.map((p) => p[1]);
    const y0 = Math.floor(Math.min(...ys)), y1 = Math.ceil(Math.max(...ys));
    for (let y = y0; y <= y1; y++) {
      const yc = y + 0.5, xs = [];
      for (let i = 0; i < pts.length; i++) {
        const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % pts.length];
        if ((ay <= yc && by > yc) || (by <= yc && ay > yc)) xs.push(ax + ((yc - ay) / (by - ay)) * (bx - ax));
      }
      xs.sort((a, b) => a - b);
      for (let i = 0; i + 1 < xs.length; i += 2) R(rd(xs[i]), y, rd(xs[i + 1]) - rd(xs[i]), 1, col);
    }
  };
  return { ctx, R, P, line, ell, disc, poly };
}
// Alpha tout ou rien (au cas où un tracé du navigateur aurait lissé un bord)
function hardAlpha(c) {
  const ctx = c.getContext('2d');
  const img = ctx.getImageData(0, 0, c.width, c.height);
  const d = img.data;
  for (let i = 3; i < d.length; i += 4) d[i] = d[i] >= 128 ? 255 : 0;
  ctx.putImageData(img, 0, 0);
  return c;
}

// ------------------------------------------------------------------ 8) armes en main : petit moteur 3D
// Les armes en vue subjective sont des modèles 3D simples (boîtes, cylindres, profils extrudés, mains articulées)
// projetés depuis l'œil du joueur, puis ramenés en pixel art : rampe de 5 tons par matière, lumière en haut à gauche,
// traits sombres entre les pièces qui se chevauchent et contour OUT. Le canon vise ainsi toujours le viseur.
// Repère caméra : x à droite, y en haut, z vers l'écran, en centimètres. Écran 384x216, viseur en (192, 108), focale 300 px (plus serrée que le monde : moins de déformation de près).
// Le canvas rendu (200x130) est la fenêtre d'écran x 104..304, y 86..216 : son milieu bas tombe en (204, 216).
// DEV PREVIEW : node build.mjs dev, puis http://localhost:3917/?s=weapons&src=dev&z=3&id=bowie
//   (capture : sh shot-dev.sh <section> <zoom> <largeur> <hauteur> <ids>)

const VM_W = 200, VM_H = 130, VM_X0 = 204 - VM_W / 2, VM_Y0 = 216 - VM_H, VM_F = 300;

// --- matrices 3x4 rangées par lignes : [r00 r01 r02 tx, r10 r11 r12 ty, r20 r21 r22 tz]
const vmI = () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0];
function vmMul(a, b) {
  const o = new Array(12);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) {
    o[r * 4 + c] = a[r * 4] * b[c] + a[r * 4 + 1] * b[4 + c] + a[r * 4 + 2] * b[8 + c] + (c === 3 ? a[r * 4 + 3] : 0);
  }
  return o;
}
const vmChain = (...ms) => ms.reduce(vmMul);
const vmT = (x, y, z) => [1, 0, 0, x, 0, 1, 0, y, 0, 0, 1, z];
const vmS = (x, y, z) => [x, 0, 0, 0, 0, y, 0, 0, 0, 0, z, 0];
function vmRx(a) { const c = Math.cos(a), s = Math.sin(a); return [1, 0, 0, 0, 0, c, -s, 0, 0, s, c, 0]; }
function vmRy(a) { const c = Math.cos(a), s = Math.sin(a); return [c, 0, s, 0, 0, 1, 0, 0, -s, 0, c, 0]; }
function vmRz(a) { const c = Math.cos(a), s = Math.sin(a); return [c, -s, 0, 0, s, c, 0, 0, 0, 0, 1, 0]; }
const vmP = (m, p) => [
  m[0] * p[0] + m[1] * p[1] + m[2] * p[2] + m[3],
  m[4] * p[0] + m[5] * p[1] + m[6] * p[2] + m[7],
  m[8] * p[0] + m[9] * p[1] + m[10] * p[2] + m[11],
];
const vmAdd = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const vmSub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const vmK = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const vmDot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const vmCross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const vmLen = (a) => Math.hypot(a[0], a[1], a[2]);
const vmUnit = (a) => vmK(a, 1 / (vmLen(a) || 1));
const vmLerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
// Matrice des normales (inverse transposée de la partie 3x3), valable aussi avec échelle et miroir
function vmNormalMat(m) {
  const [a, b, c, , d, e, f, , g, h, i] = m;
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
  const D = -(b * i - c * h), E = a * i - c * g, F = -(a * h - b * g);
  const G = b * f - c * e, H = -(a * f - c * d), I = a * e - b * d;
  const det = a * A + b * B + c * C || 1;
  return [A / det, B / det, C / det, D / det, E / det, F / det, G / det, H / det, I / det];
}
const vmNM = (n, v) => vmUnit([n[0] * v[0] + n[1] * v[1] + n[2] * v[2], n[3] * v[0] + n[4] * v[1] + n[5] * v[2], n[6] * v[0] + n[7] * v[1] + n[8] * v[2]]);

// Caméra de l'arme inclinée vers le bas (comme Doom) : on voit le dessus de l'arme, le canon tenu droit devant file
// vers le haut de l'écran. vmHold(x, y, z, roll) pose l'arme, canon parallèle au regard, dans ce repère incliné.
const VM_TILT = 0.26;
// VM_DIP : le canon plonge un peu dans ce repère incliné, pour qu'il file vers le viseur et non vers le ciel
const VM_DIP = 0.12;
const vmHold = (x, y, z, roll = 0) => vmChain(vmRx(-VM_TILT), vmT(x, y, z), vmRx(VM_DIP), vmRz(roll));
// Repère posé en (x, y, z) dont l'axe +z vise le point de convergence (0, 0, conv) au fond du viseur.
// Pour lever le canon (recul), composer ensuite avec vmRx(-angle).
function vmAim(x, y, z, roll = 0, conv = 600) {
  const d = vmUnit([-x, -y, conv - z]);
  return vmChain(vmT(x, y, z), vmRy(Math.atan2(d[0], d[2])), vmRx(-Math.asin(d[1])), vmRz(roll));
}
// Repère dont l'axe +z va de a vers b (pour les capsules)
function vmAlong(a, b) {
  const w = vmUnit(vmSub(b, a));
  const u = vmUnit(Math.abs(w[1]) < 0.9 ? vmCross([0, 1, 0], w) : vmCross([1, 0, 0], w));
  const v = vmCross(w, u);
  return [u[0], v[0], w[0], a[0], u[1], v[1], w[1], a[1], u[2], v[2], w[2], a[2]];
}
// Écran → canvas
const vmProj = (p) => [192 + (VM_F * p[0]) / p[2] - VM_X0, 108 - (VM_F * p[1]) / p[2] - VM_Y0];
const VM_PROJ = vmProj;
// Écran → canvas d'une autre fenêtre de rendu (vmScene(view))
const vmProjOf = (v) => (p) => [192 + (v.f * p[0]) / p[2] - v.x0, 108 - (v.f * p[1]) / p[2] - v.y0];

// --- matières : rampe de 5 tons (0 ombre profonde … 3 éclairé, 4 reflet)
const vmRgb = (hex) => { const n = parseInt(hex.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
function vmMatRamp(ramp, o = {}) {
  const line = o.line || mix(OUT, ramp[0], 0.35);
  return { ramp, rgb: ramp.map(vmRgb), spec: !!o.spec, line: vmRgb(line) };
}
// Rampe tirée d'une couleur de base : ombres décalées vers le violet, lumières vers le chaud
function vmMat(base, o = {}) {
  return vmMatRamp([
    mix(shade(base, -0.62), '#1a1030', 0.3), mix(shade(base, -0.4), '#2a1838', 0.18), shade(base, -0.16),
    mix(base, '#fff4e0', 0.06), mix(shade(base, o.spec ? 0.55 : 0.3), '#fff0d0', 0.15),
  ], o);
}
const VM_STEEL = vmMatRamp(['#1c2129', '#363e4c', '#566072', '#8692a6', '#e2ecf8'], { spec: true });
const VM_BLUED = vmMatRamp(['#12141c', '#20263a', '#343d58', '#526080', '#b0c0e4'], { spec: true });
const VM_NICKEL = vmMatRamp(['#34363e', '#5e6270', '#9298a8', '#c4cad6', '#ffffff'], { spec: true });
const VM_BRASS = vmMatRamp(['#3a2408', '#744a12', '#ab7622', '#d6a63e', '#fff0b0'], { spec: true });
const VM_GOLD = vmMatRamp(['#463006', '#8e5c0e', '#cc961e', '#f0cc4c', '#fffbe0'], { spec: true });
const VM_WALNUT = vmMatRamp(['#220f08', '#3e1e0e', '#5c3218', '#7e4e28', '#a6703c']);
const VM_STAG = vmMatRamp(['#382a1e', '#665240', '#968064', '#c2ae8a', '#e8dcc0']);
const VM_RUBBER = vmMatRamp(['#0e0e12', '#1c1c22', '#2a2a32', '#3e3e48', '#6c6c7a']);
const VM_LEATHER = vmMatRamp(['#28140a', '#482812', '#683e1e', '#8a582e', '#b07846']);
const VM_PAPER = vmMatRamp(['#480c0e', '#781618', '#ac2820', '#d64834', '#f08a68']);
const VM_FUSE = vmMatRamp(['#281e12', '#483822', '#6c5838', '#98825e', '#c6b28a']);
const VM_DARK = vmMatRamp(['#08080a', '#0e0e12', '#16161c', '#202028', '#30303a']);

// --- scène : pile de repères + triangles en espace caméra
// view (facultatif) : autre fenêtre de rendu { w, h, f, x0, y0 } (canvas w x h, focale f, coin haut gauche (x0, y0) sur
// l'écran 384x216, viseur en (192, 108)) ; par défaut celle des armes en main du FPS
function vmScene(view = null) {
  const sc = { tris: [], fxs: [], stack: [vmI()], id: 0, view, proj: view ? vmProjOf(view) : vmProj };
  sc.top = () => sc.stack[sc.stack.length - 1];
  sc.push = (m) => { sc.stack.push(vmMul(sc.top(), m)); return sc; };
  sc.pop = () => { sc.stack.pop(); return sc; };
  // Superposition 2D après le rendu ; proj() donne les coordonnées canvas d'un point du repère courant
  sc.fx = (fn) => { const m = sc.top(); sc.fxs.push((pen) => fn(pen, (p) => sc.proj(vmP(m, p)))); };
  // Où tombe à l'écran (canvas) un point du repère courant
  sc.at = (p) => sc.proj(vmP(sc.top(), p));
  // tri : [[pa, pb, pc], [na, nb, nc]] en local
  sc.emit = (mat, tris, same = false) => {
    if (!same) sc.id++;
    const m = sc.top(), nm = vmNormalMat(m);
    for (const [p, n] of tris) sc.tris.push({ p: p.map((q) => vmP(m, q)), n: n.map((q) => vmNM(nm, q)), mat, id: sc.id });
    return sc;
  };
  sc.box = (mat, w, h, d, o = {}) => sc.emit(mat, vmBoxTris(w, h, d), o.same);
  sc.cyl = (mat, r, len, o = {}) => sc.emit(mat, vmCylTris(r, o.r2 ?? r, len, o.segs || 14, o.caps !== false), o.same);
  sc.ext = (mat, prof, thick, o = {}) => sc.emit(mat, vmExtTris(prof, thick), o.same);
  sc.ell = (mat, rx, ry, rz, o = {}) => sc.emit(mat, vmEllTris(rx, ry, rz, o.segs || 12), o.same);
  sc.caps = (mat, a, b, r, r2 = r, o = {}) => {
    const L = vmLen(vmSub(b, a));
    if (L < 1e-3) return sc.ell(mat, r, r, r, o);
    sc.push(vmAlong(a, b));
    sc.emit(mat, vmCylTris(r, r2, L, o.segs || 10, false), o.same);
    sc.emit(mat, vmEllTris(r, r, r, 8), true);
    sc.push(vmT(0, 0, L)).emit(mat, vmEllTris(r2, r2, r2, 8), true).pop();
    return sc.pop();
  };
  sc.tube = (mat, pts, r, o = {}) => {
    for (let i = 0; i + 1 < pts.length; i++) sc.caps(mat, pts[i], pts[i + 1], r, r, { ...o, same: i > 0 || o.same });
    return sc;
  };
  return sc;
}

// --- maillages (en local)
function vmQuad(a, b, c, d, n) { return [[[a, b, c], [n, n, n]], [[a, c, d], [n, n, n]]]; }
function vmBoxTris(w, h, d) {
  const x = w / 2, y = h / 2, z = d / 2;
  const P = (i, j, k) => [i * x, j * y, k * z];
  return [
    ...vmQuad(P(1, -1, -1), P(1, 1, -1), P(1, 1, 1), P(1, -1, 1), [1, 0, 0]),
    ...vmQuad(P(-1, -1, 1), P(-1, 1, 1), P(-1, 1, -1), P(-1, -1, -1), [-1, 0, 0]),
    ...vmQuad(P(-1, 1, -1), P(-1, 1, 1), P(1, 1, 1), P(1, 1, -1), [0, 1, 0]),
    ...vmQuad(P(-1, -1, 1), P(-1, -1, -1), P(1, -1, -1), P(1, -1, 1), [0, -1, 0]),
    ...vmQuad(P(-1, -1, 1), P(1, -1, 1), P(1, 1, 1), P(-1, 1, 1), [0, 0, 1]),
    ...vmQuad(P(1, -1, -1), P(-1, -1, -1), P(-1, 1, -1), P(1, 1, -1), [0, 0, -1]),
  ];
}
function vmCylTris(r, r2, len, segs, caps) {
  const out = [], k = (r - r2) / (len || 1);
  for (let i = 0; i < segs; i++) {
    const a0 = (i / segs) * Math.PI * 2, a1 = ((i + 1) / segs) * Math.PI * 2;
    const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
    const p00 = [c0 * r, s0 * r, 0], p01 = [c1 * r, s1 * r, 0], p10 = [c0 * r2, s0 * r2, len], p11 = [c1 * r2, s1 * r2, len];
    const n0 = vmUnit([c0, s0, k]), n1 = vmUnit([c1, s1, k]);
    out.push([[p00, p01, p11], [n0, n1, n1]], [[p00, p11, p10], [n0, n1, n0]]);
    if (caps) {
      out.push([[[0, 0, 0], p01, p00], [[0, 0, -1], [0, 0, -1], [0, 0, -1]]]);
      out.push([[[0, 0, len], p10, p11], [[0, 0, 1], [0, 0, 1], [0, 0, 1]]]);
    }
  }
  return out;
}
function vmEllTris(rx, ry, rz, segs) {
  const out = [], lat = Math.max(4, segs >> 1);
  const pt = (i, j) => {
    const t = (i / lat) * Math.PI, f = (j / segs) * Math.PI * 2;
    const u = [Math.sin(t) * Math.cos(f), Math.cos(t), Math.sin(t) * Math.sin(f)];
    return [[u[0] * rx, u[1] * ry, u[2] * rz], vmUnit([u[0] / rx, u[1] / ry, u[2] / rz])];
  };
  for (let i = 0; i < lat; i++) for (let j = 0; j < segs; j++) {
    const [a, na] = pt(i, j), [b, nb] = pt(i + 1, j), [c, nc] = pt(i + 1, j + 1), [d, nd] = pt(i, j + 1);
    out.push([[a, b, c], [na, nb, nc]], [[a, c, d], [na, nc, nd]]);
  }
  return out;
}
// Profil [[z, y], ...] extrudé en x de -thick/2 à +thick/2
function vmExtTris(prof, thick) {
  let pts = prof.map(([z, y]) => [z, y]);
  const area = pts.reduce((s, p, i) => { const q = pts[(i + 1) % pts.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0);
  if (area < 0) pts = pts.reverse();
  const h = thick / 2, out = [];
  for (const [i, j, k] of vmEarClip(pts)) {
    const A = pts[i], B = pts[j], C = pts[k];
    // face x = +h vue depuis +x, face x = -h vue depuis -x
    out.push([[[h, A[1], A[0]], [h, C[1], C[0]], [h, B[1], B[0]]], [[1, 0, 0], [1, 0, 0], [1, 0, 0]]]);
    out.push([[[-h, A[1], A[0]], [-h, B[1], B[0]], [-h, C[1], C[0]]], [[-1, 0, 0], [-1, 0, 0], [-1, 0, 0]]]);
  }
  for (let i = 0; i < pts.length; i++) {
    const [z0, y0] = pts[i], [z1, y1] = pts[(i + 1) % pts.length];
    const n = vmUnit([0, -(z1 - z0), y1 - y0]);
    out.push(...vmQuad([-h, y0, z0], [h, y0, z0], [h, y1, z1], [-h, y1, z1], n));
  }
  return out;
}
// Triangulation par oreilles d'un polygone simple orienté dans le sens direct
function vmEarClip(pts) {
  const idx = pts.map((_, i) => i), out = [];
  const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const inside = (p, a, b, c) => cross(a, b, p) >= 0 && cross(b, c, p) >= 0 && cross(c, a, p) >= 0;
  let guard = 0;
  while (idx.length > 3 && guard++ < 1000) {
    let cut = false;
    for (let i = 0; i < idx.length; i++) {
      const ia = idx[(i + idx.length - 1) % idx.length], ib = idx[i], ic = idx[(i + 1) % idx.length];
      const a = pts[ia], b = pts[ib], c = pts[ic];
      if (cross(a, b, c) <= 0) continue;
      if (idx.some((j) => j !== ia && j !== ib && j !== ic && inside(pts[j], a, b, c))) continue;
      out.push([ia, ib, ic]);
      idx.splice(i, 1);
      cut = true;
      break;
    }
    if (!cut) break;
  }
  if (idx.length === 3) out.push([idx[0], idx[1], idx[2]]);
  return out;
}

// --- rendu
const VM_LIGHT = vmUnit([-0.55, 0.72, -0.45]);
const VM_BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
function vmRender(sc) {
  const W = sc.view ? sc.view.w : VM_W, H = sc.view ? sc.view.h : VM_H, N = W * H, vmProj = sc.proj || VM_PROJ;
  const zb = new Float32Array(N).fill(1e9), pid = new Int32Array(N), lv = new Uint8Array(N), mats = new Array(N);
  for (const t of sc.tris) {
    const [a, b, c] = t.p;
    if (a[2] < 3 || b[2] < 3 || c[2] < 3) continue;
    const A = vmProj(a), B = vmProj(b), C = vmProj(c);
    const area = (B[0] - A[0]) * (C[1] - A[1]) - (B[1] - A[1]) * (C[0] - A[0]);
    if (Math.abs(area) < 1e-7) continue;
    const x0 = Math.max(0, Math.floor(Math.min(A[0], B[0], C[0]))), x1 = Math.min(W - 1, Math.ceil(Math.max(A[0], B[0], C[0])));
    const y0 = Math.max(0, Math.floor(Math.min(A[1], B[1], C[1]))), y1 = Math.min(H - 1, Math.ceil(Math.max(A[1], B[1], C[1])));
    const iza = 1 / a[2], izb = 1 / b[2], izc = 1 / c[2];
    const [na, nb, nc] = t.n;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const px = x + 0.5, py = y + 0.5;
      const w0 = ((B[0] - px) * (C[1] - py) - (B[1] - py) * (C[0] - px)) / area;
      const w1 = ((C[0] - px) * (A[1] - py) - (C[1] - py) * (A[0] - px)) / area;
      const w2 = 1 - w0 - w1;
      if (w0 < -1e-5 || w1 < -1e-5 || w2 < -1e-5) continue;
      const z = 1 / (w0 * iza + w1 * izb + w2 * izc), i = y * W + x;
      if (z >= zb[i]) continue;
      const k0 = w0 * iza * z, k1 = w1 * izb * z, k2 = w2 * izc * z;
      let n = vmUnit([k0 * na[0] + k1 * nb[0] + k2 * nc[0], k0 * na[1] + k1 * nb[1] + k2 * nc[1], k0 * na[2] + k1 * nb[2] + k2 * nc[2]]);
      const p = [k0 * a[0] + k1 * b[0] + k2 * c[0], k0 * a[1] + k1 * b[1] + k2 * c[1], z];
      const V = vmUnit(vmK(p, -1));
      if (vmDot(n, V) < 0) n = vmK(n, -1);
      const d = Math.max(0, vmDot(n, VM_LIGHT));
      let I = 0.2 + 0.8 * d + (VM_BAYER[(y & 3) * 4 + (x & 3)] - 7.5) * 0.003;
      let l = I < 0.34 ? 0 : I < 0.54 ? 1 : I < 0.76 ? 2 : 3;
      if (t.mat.spec && vmDot(n, vmUnit(vmAdd(VM_LIGHT, V))) ** 36 > 0.45) l = 4;
      zb[i] = z; pid[i] = t.id; lv[i] = l; mats[i] = t.mat;
    }
  }
  const c = canvas(W, H);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(W, H), D = img.data;
  const out = vmRgb(OUT);
  const put = (i, rgb) => { D[i * 4] = rgb[0]; D[i * 4 + 1] = rgb[1]; D[i * 4 + 2] = rgb[2]; D[i * 4 + 3] = 255; };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (!mats[i]) {
      // contour : pixel vide qui touche la pièce
      if ((x > 0 && mats[i - 1]) || (x < W - 1 && mats[i + 1]) || (y > 0 && mats[i - W]) || (y < H - 1 && mats[i + W])) put(i, out);
      continue;
    }
    // trait intérieur sur le pixel le plus loin quand une autre pièce passe devant (ou pli de la même pièce)
    let crease = false;
    for (const j of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, y > 0 ? i - W : -1, y < H - 1 ? i + W : -1]) {
      if (j < 0 || !mats[j]) continue;
      const dz = zb[i] - zb[j];
      if ((pid[j] !== pid[i] && dz > 0.25) || dz > 1.2 + zb[i] * 0.03) { crease = true; break; }
    }
    put(i, crease ? mats[i].line : mats[i].rgb[lv[i]]);
  }
  ctx.putImageData(img, 0, 0);
  const p = pen(c);
  for (const fx of sc.fxs) fx(p);
  return hardAlpha(c);
}

// --- main articulée qui serre un manche
// Repère local de la main (posé par sc.push avant l'appel) : manche selon +y (de l'auriculaire vers l'index),
// axe du manche en x = 0, z = 0, paume du côté -z, doigts qui s'enroulent +x → +z → -x (side = 1, main droite).
const VM_FINGERS = [
  { dy: 0, r: 0.86, len: [4.0, 2.4, 1.9] },
  { dy: -2.05, r: 0.9, len: [4.4, 2.8, 2.0] },
  { dy: -4.0, r: 0.86, len: [4.1, 2.6, 1.9] },
  { dy: -5.75, r: 0.74, len: [3.3, 1.9, 1.7] },
];
function vmHand(sc, o) {
  const side = o.side ?? 1, rx = o.rx ?? 1.4, rz = o.rz ?? 1.8, y0 = o.y0 ?? 0;
  const skin = vmMat(o.skin || '#d19a6a'), cloth = vmMat(o.cloth || '#7a2a1e');
  const nail = vmMatRamp([shade(o.skin || '#d19a6a', -0.3), shade(o.skin || '#d19a6a', -0.1), mix(o.skin || '#d19a6a', '#f0d8d0', 0.5), mix(o.skin || '#d19a6a', '#fff0ea', 0.7), '#fff8f4']);
  sc.push(vmS(side, 1, 1));
  // point de l'ellipse du manche, écarté de off
  const ring = (th, y, off) => [Math.cos(th) * (rx + off), y, Math.sin(th) * (rz + off)];
  // doigts : phalanges qui suivent le manche par longueur d'arc
  VM_FINGERS.forEach((f, k) => {
    const y = y0 + f.dy, r = f.r * (o.scale ?? 1);
    const th0 = -0.35;
    const knuckle = ring(th0, y, r + 0.55);
    let joints = [knuckle];
    if (k === 0 && o.trigger) {
      const tg = o.trigger.slice(); tg[0] *= side;
      const mid = vmAdd(vmLerp(knuckle, tg, 0.55), [0.4, -0.5, 0]);
      joints = [knuckle, vmLerp(knuckle, mid, 1), vmLerp(mid, tg, 0.55), tg];
    } else {
      // (o.lift : ce doigt-là se relève, l'adversaire qui pianote sur la table)
      const curl = o.lift === k ? 0.35 : o.curl ?? 1;
      let th = th0 + 0.25, acc = 0;
      for (const L of f.len) {
        // avance le long de l'ellipse jusqu'à couvrir L (moins serré si curl < 1)
        let prev = joints[joints.length - 1], target = acc + L, p = prev;
        while (acc < target && th < 4.2) {
          th += 0.04;
          const q = vmLerp(ring(th, y, r * 1.05), vmAdd(prev, vmK(vmUnit(vmSub(ring(th, y, r), prev)), L)), 1 - curl);
          acc += vmLen(vmSub(q, p));
          p = q;
        }
        joints.push(p);
      }
    }
    for (let j = 0; j < 3; j++) sc.caps(skin, joints[j], joints[j + 1], r * (1 - j * 0.06), r * (0.94 - j * 0.06));
    // ongle au bout du doigt, côté extérieur
    const tip = joints[3], dir = vmUnit(vmSub(joints[3], joints[2]));
    const outw = vmUnit([tip[0], 0, tip[2]]);
    sc.push(vmAlong(vmAdd(vmSub(tip, vmK(dir, 0.8)), vmK(outw, r * 0.55)), vmAdd(tip, vmK(outw, r * 0.55))));
    sc.ell(nail, r * 0.55, r * 0.3, 0.55);
    sc.pop();
  });
  // paume et dos de la main : masses le long de l'arrière du manche
  const yc = y0 - 2.9;
  for (const [th, ry] of [[-0.55, 4.3], [-1.15, 4.4], [-1.75, 4.0]]) {
    const c = ring(th, yc, 1.25);
    sc.push(vmChain(vmT(c[0], c[1], c[2]), vmRy(-th)));
    sc.ell(skin, 1.55, ry, 2.3, { same: th !== -0.55 });
    sc.pop();
  }
  // creux entre pouce et index (web) : remonte au-dessus de l'index sur les crosses de pistolet (o.web en cm)
  const web = o.web ?? 0;
  if (web > 0) {
    const c = ring(-1.5, y0 + web * 0.45, 1.0);
    sc.push(vmChain(vmT(c[0], c[1], c[2]), vmRy(1.5))).ell(skin, 1.7, 1.1 + web * 0.5, 1.5, { same: true }).pop();
  }
  // pouce : base derrière le haut du manche, puis enroulé, levé ou vers une cible
  const base = ring(-1.9, y0 + 0.2 + web * 0.6, 1.3);
  let tj;
  if (Array.isArray(o.thumb)) {
    const tg = o.thumb.slice(); tg[0] *= side;
    const m1 = vmLerp(base, tg, 0.45);
    tj = [base, vmAdd(m1, [-0.3, 0.6, 0]), vmLerp(m1, tg, 0.5), tg];
  } else if (o.thumb === 'up') {
    tj = [base, vmAdd(base, [-0.6, 2.6, 1.2]), vmAdd(base, [-0.9, 5.4, 2.2]), vmAdd(base, [-1.0, 7.6, 2.8])];
  } else {
    // enroulé par-dessus l'index, sur le flanc gauche du manche
    tj = [base, ring(-2.5, y0 + 0.9, 1.4), ring(-3.05, y0 + 0.5, 1.1), ring(-3.6, y0 - 0.4, 0.9)];
  }
  sc.caps(skin, tj[0], tj[1], 1.15, 1.0);
  sc.caps(skin, tj[1], tj[2], 1.0, 0.92);
  sc.caps(skin, tj[2], tj[3], 0.92, 0.82);
  // poignet, avant-bras et manchette
  const wrist = ring(-1.2, y0 - 7.2, 0.9);
  let arm = o.arm ? [o.arm[0] * side, o.arm[1], o.arm[2]] : vmAdd(wrist, [6, -30, -20]);
  const dir = vmUnit(vmSub(arm, wrist));
  // o.stub : avant-bras coupé à stub cm du poignet (la roulette dessine le reste à part) ; o.wrist(p, q) reçoit, en
  // repère caméra, le bout du poignet et un point plus loin sur l'avant-bras
  if (o.stub) arm = vmAdd(wrist, vmK(dir, o.stub));
  if (o.wrist) o.wrist(vmP(sc.top(), vmAdd(wrist, vmK(dir, 3.2))), vmP(sc.top(), vmAdd(wrist, vmK(dir, 12))));
  sc.caps(skin, vmAdd(wrist, vmK(dir, -1.5)), vmAdd(wrist, vmK(dir, 3.5)), 2.5, 2.7);
  if (o.cuff !== false) {
    sc.caps(cloth, vmAdd(wrist, vmK(dir, 3.2)), vmAdd(wrist, vmK(dir, 6.2)), 3.4, 3.6);
    sc.caps(cloth, vmAdd(wrist, vmK(dir, 6.4)), arm, 3.5, 4.4);
  } else sc.caps(skin, vmAdd(wrist, vmK(dir, 3.5)), arm, 2.7, 3.6);
  sc.pop();
  return sc;
}

// Éclair de bouche : étoile chaude en 2D, centrée sur (x, y) en canvas, rayon r
function vmFlash(p, x, y, r, seed = 0, cols = ['#c83418', '#f07818', '#f8c030', '#fff0a0', '#ffffff']) {
  const rand = rng(seed + 11);
  for (let k = 0; k < 5; k++) {
    const rr = r * (1 - k * 0.19), n = 9;
    const pts = [];
    for (let i = 0; i < n * 2; i++) {
      const a = (i / (n * 2)) * Math.PI * 2 + seed * 0.4;
      const l = i % 2 ? rr * (0.38 + rand() * 0.1) : rr * (0.75 + rand() * 0.3);
      pts.push([x + Math.cos(a) * l, y + Math.sin(a) * l * 0.85]);
    }
    p.poly(pts, cols[k]);
  }
}
// Petite fumée qui monte (frame de récupération)
function vmSmoke(p, x, y, seed = 0, cols = ['#c8c4bc', '#e4e0d8', '#f4f0ea']) {
  const rand = rng(seed + 5);
  for (let i = 0; i < 5; i++) {
    const r = 1.5 + i * 0.6;
    p.disc(x + Math.sin(i * 1.3 + seed) * 2, y - i * 3.2, r, i % 2 ? cols[0] : cols[1]);
    if (rand() < 0.5) p.P(x + rand() * 4 - 2, y - i * 3.2 - r, cols[2]);
  }
}
// VM3D READY

// --- matières du couteau et du lasso (aussi sur le harpon)
const KN_STEEL = vmMatRamp(['#1a1f27', '#3a4250', '#626c7e', '#97a3b5', '#e4ecf6'], { spec: true });
const KN_STEEL_HI = vmMatRamp(['#222831', '#48515f', '#737f91', '#b0bbcb', '#f2f6fb'], { spec: true });
const KN_HEMP = vmMatRamp(['#3a2a12', '#6a5028', '#9a7a44', '#c8a868', '#ecd8a0']);

// ------------------------------------------------------------------ 8c) armes longues en main (moteur vm3d)
// Winchester 1873 (et sa version dorée gravée), fusil à pompe, Sharps 1874 à bloc tombant, canon scié juxtaposé.
// Repère de chaque arme (cm) : axe du canon selon +z en x = 0, y = 0 ; origine à la culasse (face arrière du canon).
// Tenue « Doom » : arme au centre, tenue droite, canon parallèle au regard qui file vers le viseur ; on la voit de
// dessus-arrière (boîte de culasse, bande, hausse, guidon). Les sections (x, y) sont épaissies de LG_K (comme les
// sprites de Doom), les longueurs restent vraies. Main droite au poignet de crosse (index sur la détente, pouce
// par-dessus), main gauche qui berce le garde-main par-dessous (pouce sur un flanc, doigts enroulés sur l'autre).
// lgViewModel(id, state, frame, skin, cloth) → canvas 200x130 (vmRender) ou null si l'id n'est pas une arme longue.

const LG_IDS = ['winchester', 'goldwin', 'pump', 'sharps', 'sawed', 'harpoon', 'puntgun'];
const LG_K = 1.32;

// --- matières propres aux armes longues
const LG_CASE = vmMatRamp(['#1c1a24', '#3a3746', '#6e6a7a', '#a6a0ae', '#fbf4ee'], { spec: true });
const LG_MOT_B = vmMatRamp(['#141a2a', '#2a3656', '#4a6090', '#7a98c8', '#e0ecff'], { spec: true });
const LG_MOT_S = vmMatRamp(['#2a1c0e', '#5a3e1c', '#967036', '#ccA45c', '#fff4cc'], { spec: true });
const LG_MOT_P = vmMatRamp(['#201428', '#42284a', '#704c78', '#a47eac', '#f4e0f8'], { spec: true });
const LG_WOOD = vmMatRamp(['#220e07', '#4a220f', '#743c1a', '#a2622e', '#d09458']);
const LG_GRAIN = vmMatRamp(['#140704', '#2a1107', '#421e0c', '#5e2e14', '#7e4422']);
const LG_GLOW = vmMatRamp(['#3a1a0a', '#6a3416', '#9c5a2a', '#c88444', '#eebc78']);
const LG_GOLDWOOD = vmMatRamp(['#260a08', '#4e170e', '#7a2a1a', '#a8482a', '#d87c4c']);
const LG_GOLDGRAIN = vmMatRamp(['#170504', '#2e0c08', '#4a160e', '#681f12', '#8c2e1a']);
const LG_ENGRAVE = vmMatRamp(['#2a1804', '#4a2c08', '#6c440e', '#8a5a14', '#b07e24']);
const LG_BLACK = vmMatRamp(['#0c0e14', '#1a1f2c', '#2e3648', '#4c5872', '#c4d0ea'], { spec: true });
const LG_GUNMETAL = vmMatRamp(['#14161e', '#262c3c', '#3e4860', '#64728e', '#c8d4ec'], { spec: true });
const LG_LEAD = vmMatRamp(['#26262c', '#40424a', '#60646e', '#8a8e98', '#c4c8d0'], { spec: true });
const LG_SHELL = vmMatRamp(['#3a0a0a', '#6a1612', '#9a2a1c', '#c8462c', '#ec8058']);

// --- petits outils géométriques
// Prisme à n pans (canon octogonal : n = 8, un pan sur le dessus), facettes plates, de z = 0 à len
function lgPrism(sc, mat, r, len, n = 8, o = {}) {
  const r2 = o.r2 ?? r, tris = [];
  for (let j = 0; j < n; j++) {
    const a0 = ((2 * j - 1) * Math.PI) / n, a1 = ((2 * j + 1) * Math.PI) / n, am = (2 * j * Math.PI) / n;
    const nn = [Math.cos(am), Math.sin(am), 0];
    const p = (a, rr, z) => [Math.cos(a) * rr, Math.sin(a) * rr, z];
    tris.push(...vmQuad(p(a0, r, 0), p(a1, r, 0), p(a1, r2, len), p(a0, r2, len), nn));
    tris.push([[[0, 0, len], p(a0, r2, len), p(a1, r2, len)], [[0, 0, 1], [0, 0, 1], [0, 0, 1]]]);
    tris.push([[[0, 0, 0], p(a1, r, 0), p(a0, r, 0)], [[0, 0, -1], [0, 0, -1], [0, 0, -1]]]);
  }
  return sc.emit(mat, tris, o.same);
}
// Super-ellipse : point et normale pour l'angle a (exposant pw : 2 = ellipse, 5 = boîte aux arêtes rondes)
function lgSE(a, pw) {
  const c = Math.cos(a), s = Math.sin(a), ex = 2 / pw, en = 2 - 2 / pw;
  return [Math.sign(c) * Math.abs(c) ** ex, Math.sign(s) * Math.abs(s) ** ex, Math.sign(c) * Math.abs(c) ** en, Math.sign(s) * Math.abs(s) ** en];
}
// Pièce arrondie : sections [z, yc, hy, hx] reliées, normales lissées
function lgLoft(sc, mat, st, o = {}) {
  const N = o.n || 14, pw = o.p || 2.6, tris = [];
  const ring = ([z, yc, hy, hx]) => {
    const out = [];
    for (let j = 0; j < N; j++) {
      const [ux, uy, nx, ny] = lgSE((j / N) * Math.PI * 2, pw);
      out.push([[ux * hx, yc + uy * hy, z], vmUnit([nx / hx, ny / hy, 0])]);
    }
    return out;
  };
  const R = st.map(ring);
  for (let i = 0; i + 1 < R.length; i++) for (let j = 0; j < N; j++) {
    const k = (j + 1) % N, A = R[i], B = R[i + 1];
    tris.push([[A[j][0], A[k][0], B[k][0]], [A[j][1], A[k][1], B[k][1]]]);
    tris.push([[A[j][0], B[k][0], B[j][0]], [A[j][1], B[k][1], B[j][1]]]);
  }
  const dir = Math.sign(st[st.length - 1][0] - st[0][0]) || 1;
  for (const [ri, sz] of [[0, -dir], [R.length - 1, dir]]) {
    const r = R[ri], c = r.reduce((s, q) => vmAdd(s, vmK(q[0], 1 / N)), [0, 0, 0]), nz = [0, 0, sz];
    for (let j = 0; j < N; j++) tris.push([[c, r[j][0], r[(j + 1) % N][0]], [nz, nz, nz]]);
  }
  return sc.emit(mat, tris, o.same);
}
// Section interpolée à la cote z (null hors de la pièce)
function lgStn(st, z) {
  for (let i = 0; i + 1 < st.length; i++) {
    const a = st[i], b = st[i + 1];
    if ((z - a[0]) * (z - b[0]) <= 0) { const t = (z - a[0]) / (b[0] - a[0] || 1); return a.map((v, k) => v + (b[k] - v) * t); }
  }
  return null;
}
// Point de la surface d'une pièce lgLoft (angle a, décollé de off le long de la normale)
function lgSurf(st, z, a, pw, off) {
  const s = lgStn(st, z);
  if (!s) return null;
  const [ux, uy, nx, ny] = lgSE(a, pw), n = vmUnit([nx / s[3], ny / s[2], 0]);
  return [[ux * s[3] + n[0] * off, s[1] + uy * s[2] + n[1] * off, z], n];
}
// Bande posée sur une pièce lgLoft : de z0 à z1, angle centre af(z), demi-largeur w (veines, jaspures, gravures)
function lgStrip(sc, mat, st, z0, z1, af, w, o = {}) {
  const pw = o.p || 2.6, off = o.off ?? 0.03, n = Math.max(2, Math.ceil(Math.abs(z1 - z0) / 0.5)), tris = [];
  let prev = null;
  for (let i = 0; i <= n; i++) {
    const z = z0 + ((z1 - z0) * i) / n, a = af(z), ww = typeof w === 'function' ? w(z) : w;
    const A = lgSurf(st, z, a - ww, pw, off), B = lgSurf(st, z, a + ww, pw, off);
    if (!A || !B) { prev = null; continue; }
    if (prev) tris.push([[prev[0][0], prev[1][0], B[0]], [prev[0][1], prev[1][1], B[1]]], [[prev[0][0], B[0], A[0]], [prev[0][1], B[1], A[1]]]);
    prev = [A, B];
  }
  if (tris.length) sc.emit(mat, tris, true);
  return sc;
}
// Veinage du noyer : fils sombres ondulés et quelques reflets clairs sur le dessus et les flancs
function lgGrain(sc, st, z0, z1, seed, o = {}) {
  const rand = rng(seed), dark = o.dark || LG_GRAIN, lite = o.lite || LG_GLOW, n = o.n || 9;
  for (let k = 0; k < n; k++) {
    const a0 = Math.PI * (0.06 + 0.88 * ((k + rand() * 0.6) / n)), ph = rand() * 6, amp = 0.05 + rand() * 0.07, fr = 0.18 + rand() * 0.2;
    const za = z0 + (z1 - z0) * rand() * 0.25, zb = z1 - (z1 - z0) * rand() * 0.25;
    lgStrip(sc, k % 3 === 2 ? lite : dark, st, za, zb, (z) => a0 + Math.sin(z * fr + ph) * amp, 0.035 + rand() * 0.02, { p: o.p });
  }
  return sc;
}
// Jaspure de trempe : taches bleues, paille et violettes sur une boîte lgLoft
function lgMottle(sc, st, z0, z1, seed, pw = 5, n = 14) {
  const rand = rng(seed), mats = [LG_MOT_B, LG_MOT_S, LG_MOT_P, LG_MOT_B];
  for (let k = 0; k < n; k++) {
    const zc = z0 + (z1 - z0) * rand(), len = 0.8 + rand() * 2.2, a = Math.PI * (0.05 + rand() * 0.9), w = 0.12 + rand() * 0.18;
    const za = Math.max(z0, zc - len / 2), zb = Math.min(z1, zc + len / 2);
    lgStrip(sc, mats[k % 4], st, za, zb, (z) => a + Math.sin(z * 1.3 + k) * 0.08,
      (z) => w * (0.35 + 0.65 * Math.sin(Math.PI * Math.min(1, Math.max(0, (z - za) / (zb - za || 1))))), { p: pw, off: 0.02 });
  }
  return sc;
}
// Gravure sur un plan horizontal y = ys (rectangle x0..x1 × z0..z1) : cadre et rinceaux en facettes sombres
function lgEngraveTop(sc, ys, x0, x1, z0, z1, seed = 0) {
  const tris = [], cs = 0.3, ny = [0, 1, 0];
  for (let z = z0; z < z1 - 0.01; z += cs) for (let x = x0; x < x1 - 0.01; x += cs) {
    const u = (z - z0) / (z1 - z0), v = (x - x0) / (x1 - x0);
    const border = (u < 0.05 || u > 0.95 || v < 0.1 || v > 0.9) && !(u > 0.07 && u < 0.93 && v > 0.16 && v < 0.84);
    const inner = u > 0.1 && u < 0.9 && v > 0.22 && v < 0.78;
    const sw = Math.sin(z * 1.7 + Math.sin(x * 3.1 + seed) * 2.4 + seed) * Math.cos(x * 2.2 - z * 0.6);
    if (!border && !(inner && Math.abs(sw) < 0.2)) continue;
    const z2 = Math.min(z + cs, z1), x2 = Math.min(x + cs, x1);
    tris.push(...vmQuad([x, ys, z], [x, ys, z2], [x2, ys, z2], [x2, ys, z], ny));
  }
  return sc.emit(LG_ENGRAVE, tris, true);
}
const lgAt = (sc, x, y, z, fn) => { sc.push(vmT(x, y, z)); fn(); sc.pop(); };
// Plaque dans le plan (x, y), profil [[x, y], ...], épaisse de th selon z, posée en z
function lgPlate(sc, mat, z, prof, th, o = {}) {
  sc.push(vmChain(vmT(0, 0, z), vmRy(Math.PI / 2)));
  sc.ext(mat, prof, th, o);
  return sc.pop();
}
// Pivot : rotation m autour du point (0, y, z)
const lgPivot = (y, z, m) => vmChain(vmT(0, y, z), m, vmT(0, -y, -z));
// Main posée sur un manche décrit dans le repère F (éventuellement épaissi) : tout est converti en caméra et la main
// est construite dans un repère rigide (pas de déformation des doigts)
function lgHandAt(sc, F, b, t, o) {
  const P = (p) => vmP(F, p), D = (v) => vmUnit(vmSub(vmP(F, v), vmP(F, [0, 0, 0])));
  sc.stack.push(vmI());
  vmGrip(sc, P(b), P(t), { ...o, fwd: D(o.fwd || [0, 0, 1]), trigger: o.trigger && P(o.trigger), thumb: Array.isArray(o.thumb) ? P(o.thumb) : o.thumb });
  sc.stack.pop();
}
// Cartouche, de la base (z = 0) vers +z : 'shell' étui carton rouge à culot laiton ('hull' tiré : bout ouvert),
// 'win' / 'sharps' douille laiton + balle de plomb, 'case' douille vide ; 'none' ne dessine rien
function lgRound(sc, kind) {
  if (kind === 'none') return sc;
  if (kind === 'shell' || kind === 'hull') {
    sc.cyl(LG_SHELL, 0.9, 5.4, { segs: 12 });
    sc.push(vmT(0, 0, -0.05)).cyl(VM_BRASS, 0.98, 1.5, { segs: 12 }).pop();
    sc.push(vmT(0, 0, -0.2)).cyl(VM_BRASS, 1.08, 0.2, { segs: 12 }).pop();
    if (kind === 'hull') sc.push(vmT(0, 0, 5.3)).cyl(VM_DARK, 0.7, 0.14, { segs: 10 }).pop();
  } else {
    const big = kind === 'sharps', len = big ? 6.0 : 3.2;
    sc.cyl(VM_BRASS, big ? 0.62 : 0.5, len, { segs: 10 });
    sc.push(vmT(0, 0, -0.12)).cyl(VM_BRASS, big ? 0.74 : 0.6, 0.14, { segs: 10 }).pop();
    if (kind === 'case') sc.push(vmT(0, 0, len - 0.05)).cyl(VM_DARK, 0.4, 0.1, { segs: 8 }).pop();
    else sc.push(vmT(0, 0, len)).cyl(LG_LEAD, big ? 0.55 : 0.44, big ? 2.2 : 1.4, { segs: 10, r2: 0.2 }).pop();
  }
  return sc;
}

// Chien armé vu de derrière : crête basse et large, dessus strié qui prend la lumière (ne masque pas la boîte)
function lgHammer(sc, mat) {
  sc.ext(mat, [[-0.4, 0.9], [-0.7, 1.8], [-1.4, 2.35], [-2.6, 2.45], [-2.75, 2.15], [-1.8, 1.75], [-1.4, 0.2], [-0.4, 0.2]], 0.72);
  for (let k = 0; k < 3; k++) lgAt(sc, 0, 2.43, -1.7 - k * 0.32, () => sc.box(VM_DARK, 0.76, 0.06, 0.1));
}

// --- Winchester 1873 : boîte jaspée (ou dorée gravée), canon octogonal, magasin tubulaire, levier à boucle
const LG_WIN = { L: 56, grip: { b: [0, -3.9, -11.0], t: [0, -2.3, -4.4], trigger: [0, -4.6, 0.9] }, fore: [19.5, 27.5], foreY: -1.15, foreR: [2.15, 2.2] };
function lgWinchester(sc, o) {
  const gold = o.gold;
  const rec = gold ? VM_GOLD : LG_CASE, steel = VM_BLUED, trim = gold ? VM_GOLD : VM_BLUED, cover = gold ? VM_GOLD : VM_STEEL, wood = gold ? LG_GOLDWOOD : LG_WOOD;
  const L = o.L ?? LG_WIN.L;
  // boîte de culasse aux arêtes arrondies, nez qui enveloppe le canon et le magasin
  const RS = [[-1.1, -0.95, 2.1, 1.38], [-0.2, -1.05, 2.55, 1.5], [12.7, -1.05, 2.55, 1.5], [13.6, -1.0, 2.25, 1.42], [14.0, -0.95, 1.85, 1.3]];
  lgLoft(sc, rec, RS, { p: 5, n: 20 });
  if (gold) {
    lgEngraveTop(sc, 1.51, -1.25, 1.25, 0.2, 12.4, 3);
    for (const s of [-1, 1]) lgStrip(sc, LG_ENGRAVE, RS, 0.4, 12.4, () => (s > 0 ? 0.32 : Math.PI - 0.32), 0.05, { p: 5 });
  } else {
    lgMottle(sc, RS, -0.6, 13.4, 7, 5, 12);
    // vis de la plaque latérale (flancs)
    for (const [z, y] of [[3.0, -0.9], [9.6, -0.9]]) for (const x of [-1.52, 1.52]) lgAt(sc, x, y, z, () => sc.ell(VM_STEEL, 0.1, 0.3, 0.3));
  }
  // couvre-culasse coulissant sur le dessus (acier bleui) et son bouton strié
  const cy = o.cycle || 0;
  lgLoft(sc, cover, [[0.4 - 4 * cy, 1.6, 0.26, 0.52], [11.0 - 4 * cy, 1.6, 0.26, 0.52]], { p: 3 });
  for (let k = 0; k < 4; k++) lgAt(sc, 0, 1.87, 7.6 - 4 * cy + k * 0.45, () => sc.box(VM_DARK, 0.8, 0.06, 0.14));
  // arrière de la culasse : percuteur, chien armé au centre
  lgAt(sc, 0, 0.75, -1.25, () => sc.cyl(VM_STEEL, 0.42, 0.3, { segs: 10 }));
  sc.push(lgPivot(0.4, -0.8, vmRx(o.hammerDown ? 0.9 : 0)));
  lgHammer(sc, gold ? VM_GOLD : LG_CASE);
  sc.pop();
  // canon octogonal (un pan sur le dessus), bague de bouche, guidon à perle laiton, hausse à cran
  lgAt(sc, 0, 0, 13.6, () => lgPrism(sc, steel, 1.22, L - 13.6, 8));
  lgAt(sc, 0, 0, L - 0.05, () => sc.cyl(VM_DARK, 0.52, 0.14, { segs: 10 }));
  lgAt(sc, 0, 0, L - 0.6, () => lgPrism(sc, gold ? VM_GOLD : VM_STEEL, 1.26, 0.55, 8));
  sc.ext(steel, [[L - 2.2, 1.0], [L - 1.0, 1.0], [L - 1.2, 1.6], [L - 2.0, 1.6]], 0.34);
  lgAt(sc, 0, 1.78, L - 1.55, () => sc.ell(gold ? VM_GOLD : VM_BRASS, 0.34, 0.34, 0.34));
  lgPlate(sc, steel, 21.6, [[-0.95, 1.0], [0.95, 1.0], [1.0, 1.6], [0.8, 1.95], [0.45, 1.8], [0.2, 1.62], [0, 1.4], [-0.2, 1.62], [-0.45, 1.8], [-0.8, 1.95], [-1.0, 1.6]], 0.3);
  lgAt(sc, 0, 1.12, 22.6, () => sc.box(steel, 0.5, 0.18, 2.4));
  // magasin tubulaire sous le canon, bouchon, collier
  lgAt(sc, 0, -2.15, 13.6, () => sc.cyl(steel, 0.86, L - 16.2, { segs: 12 }));
  lgAt(sc, 0, -2.15, L - 2.6, () => sc.cyl(gold ? VM_GOLD : VM_STEEL, 0.95, 0.9, { segs: 12 }));
  lgAt(sc, 0, -1.0, L - 6.5, () => sc.box(trim, 2.7, 3.9, 0.9));
  // garde-main en noyer qui dépasse du canon sur les côtés, embout d'acier
  const FS = [[13.9, -1.12, 2.05, 2.0], [16, -1.12, 2.1, 2.1], [30, -1.17, 2.02, 2.02], [33, -1.22, 1.92, 1.86]];
  lgLoft(sc, wood, FS, { n: 18 });
  lgGrain(sc, FS, 14.2, 32.8, 11, gold ? { dark: LG_GOLDGRAIN, n: 8 } : { n: 8 });
  lgLoft(sc, trim, [[33, -1.22, 1.96, 1.9], [34.2, -1.27, 1.88, 1.7]], { n: 16 });
  // crosse : poignet fin puis crosse qui s'élargit, plaque de couche hors champ
  const SS = [[-0.9, -0.95, 2.3, 1.42], [-3.5, -1.7, 2.0, 1.36], [-8, -2.6, 2.05, 1.42], [-13, -3.7, 2.8, 1.6], [-19, -5.0, 4.0, 1.8], [-24, -6.0, 5.0, 1.9]];
  lgLoft(sc, wood, SS, { n: 18 });
  lgGrain(sc, SS, -1.2, -23, 12, gold ? { dark: LG_GOLDGRAIN, n: 10 } : { n: 10 });
  lgAt(sc, 0, 0.95, -3.4, () => sc.box(rec, 1.15, 0.32, 5.0));
  lgAt(sc, 0, 1.13, -4.6, () => sc.ell(VM_STEEL, 0.22, 0.1, 0.22));
  // détente et levier (pivot à l'avant de la boîte ; o.lever = ouverture en radians)
  sc.ext(VM_STEEL, [[1.4, -3.6], [1.2, -4.6], [0.6, -5.3], [0.8, -4.5], [0.7, -3.6]], 0.45);
  sc.push(lgPivot(-3.3, 11.6, vmRx(-(o.lever || 0))));
  const lv = (z, y) => [0, y, z];
  sc.tube(rec, [lv(11.6, -3.55), lv(3.4, -3.95), lv(2.5, -4.6), lv(1.9, -5.6), lv(0.6, -6.05), lv(-0.6, -5.75), lv(-1.4, -5.95),
    lv(-4.0, -6.95), lv(-7.0, -6.9), lv(-8.4, -6.0), lv(-8.3, -4.8), lv(-6.9, -4.1)], 0.36);
  sc.pop();
  // levier abaissé : culasse et couvre-culasse reculés, boîte ouverte sur le dessus
  if (cy > 0) {
    lgAt(sc, 0, 1.5, 1.2 + 2.2 * cy, () => sc.box(VM_DARK, 1.0, 0.2, 4.2 * cy));
    lgAt(sc, 0, 0.75, -1.25 - 3.8 * cy, () => sc.cyl(VM_STEEL, 0.5, 3.8 * cy + 0.3, { segs: 12 }));
  }
  // portière de chargement (sur le flanc que montre le rechargement)
  lgAt(sc, -1.53, -1.3, 9.9, () => sc.box(gold ? VM_GOLD : VM_STEEL, 0.1, 1.5, 2.7));
  lgAt(sc, -1.6, -1.3, 8.9, () => sc.ell(VM_DARK, 0.05, 0.18, 0.18));
}

// --- fusil à pompe (1897) : boîte bleuie, chien apparent, canon rond, magasin, pompe en noyer rainurée
const LG_PUMP = { L: 52, grip: { b: [0, -4.4, -11.6], t: [0, -2.7, -4.8], trigger: [0, -5.0, 0.6] }, fore: [27.5, 35.5], foreY: -2.3, foreR: [2.15, 2.15] };
function lgPump(sc, o) {
  // o.L, o.recv, o.metal, o.wood : longueur et matières d'un autre fusil (roulette), sinon celles du FPS
  const L = o.L ?? LG_PUMP.L, s = o.slide || 0, REC = o.recv || LG_BLACK, MET = o.metal || VM_BLUED, WOOD = o.wood || LG_WOOD;
  const RS = [[-1.3, -0.85, 2.05, 1.42], [0.0, -0.85, 2.85, 1.58], [14.6, -0.85, 2.85, 1.58], [15.6, -0.8, 2.3, 1.42]];
  lgLoft(sc, REC, RS, { p: 3.4, n: 22 });
  // bande polie sur le dessus, fenêtre d'éjection sur l'arête droite avec la culasse brillante dedans
  lgLoft(sc, VM_STEEL, [[0.2, 1.98, 0.12, 0.36], [15.0, 1.98, 0.12, 0.36]], { p: 4 });
  lgStrip(sc, VM_DARK, RS, 4.6, 12.4, () => 0.5, 0.34, { p: 3.4 });
  lgStrip(sc, VM_STEEL, RS, 4.6 - s * 0.8, 12.0 - s * 0.8, () => 0.5, 0.16, { p: 3.4, off: 0.05 });
  for (const [z, y] of [[2.2, -1.0], [12.6, -1.0], [7.4, -2.6]]) for (const x of [-1.6, 1.6]) lgAt(sc, x, y, z, () => sc.ell(VM_NICKEL, 0.12, 0.3, 0.3));
  // culasse mobile qui recule avec la pompe (sort à l'arrière de la boîte)
  if (s > 0.5) lgAt(sc, 0.2, 0.6, -1.3 - s * 0.35, () => sc.box(VM_STEEL, 1.6, 1.4, s * 0.7 + 0.2));
  // chien
  sc.push(lgPivot(0.6, -0.6, vmRx(o.hammerDown ? 0.9 : 0)));
  lgHammer(sc, VM_STEEL);
  sc.pop();
  // canon, bague de bouche, guidon perle laiton, magasin
  lgAt(sc, 0, 0, 15.4, () => sc.cyl(MET, 1.34, L - 15.4, { segs: 18, r2: 1.24 }));
  lgAt(sc, 0, 0, L - 0.05, () => sc.cyl(VM_DARK, 0.95, 0.14, { segs: 14 }));
  lgAt(sc, 0, 0, L - 0.5, () => sc.cyl(VM_STEEL, 1.29, 0.45, { segs: 18 }));
  lgAt(sc, 0, 1.42, L - 1.0, () => sc.ell(VM_BRASS, 0.36, 0.36, 0.36));
  lgAt(sc, 0, -2.5, 15.4, () => sc.cyl(MET, 1.0, L - 19, { segs: 14 }));
  lgAt(sc, 0, -2.5, L - 3.6, () => sc.cyl(VM_STEEL, 1.1, 1.2, { segs: 14 }));
  lgAt(sc, 0, -1.3, L - 5.8, () => sc.box(MET, 2.4, 4.0, 1.1));
  // pompe : barres d'action + garde-main rainuré (coulisse de s cm vers l'arrière)
  sc.push(vmT(0, 0, -s));
  for (const x of [-1.05, 1.05]) lgAt(sc, x, -2.0, 18.5, () => sc.box(VM_STEEL, 0.3, 0.5, 8.0));
  const st = [];
  for (let k = 0; k <= 14; k++) {
    const z = 22.5 + k * 1.1, rib = k % 2 ? 0.88 : 1, end = k === 0 || k === 14 ? 0.9 : 1;
    st.push([z, -2.3, 1.95 * end * rib, 2.15 * end * rib]);
  }
  lgLoft(sc, WOOD, st, { n: 18 });
  sc.pop();
  // crosse, pontet, détente
  const SS = [[-1.0, -1.0, 2.6, 1.5], [-3.5, -2.2, 2.2, 1.42], [-8.5, -3.3, 2.2, 1.46], [-13, -4.4, 3.0, 1.66], [-19, -5.8, 4.2, 1.86], [-24, -6.9, 5.2, 1.96]];
  lgLoft(sc, WOOD, SS, { n: 18 });
  lgGrain(sc, SS, -1.3, -23, 21, { n: 10 });
  sc.tube(MET, [[0, -3.5, 3.4], [0, -5.0, 3.0], [0, -6.0, 1.6], [0, -6.0, -0.4], [0, -5.2, -1.6], [0, -4.0, -2.0]], 0.3);
  sc.ext(VM_STEEL, [[1.3, -3.5], [1.1, -4.6], [0.5, -5.3], [0.7, -4.5], [0.6, -3.5]], 0.45);
}

// --- Sharps 1874 : boîte jaspée, bloc tombant, lourd canon octogonal, guidon tunnel, dioptre replié sur la queue
const LG_SHARPS = { L: 64, grip: { b: [0, -4.1, -12.4], t: [0, -2.5, -5.8], trigger: [0, -5.6, -0.2] }, fore: [15.5, 23.5], foreY: -1.45, foreR: [1.95, 2.0] };
function lgSharps(sc, o) {
  const L = LG_SHARPS.L, op = o.open || 0;
  // arrière de la boîte (queue, chien) et avant (nez) pleins ; au milieu deux joues autour du bloc
  const RB = [[-3.3, -1.0, 2.2, 1.45], [-2.2, -1.3, 2.9, 1.6], [-0.9, -1.35, 2.85, 1.6]];
  const RF = [[2.2, -1.35, 2.85, 1.6], [8.6, -1.4, 2.8, 1.6], [9.5, -1.3, 2.2, 1.5]];
  lgLoft(sc, LG_CASE, RB, { p: 5, n: 18 });
  lgLoft(sc, LG_CASE, RF, { p: 5, n: 18 });
  lgMottle(sc, RB, -3.1, -1.0, 31, 5, 5);
  lgMottle(sc, RF, 2.3, 9.3, 32, 5, 10);
  for (const x of [-1.15, 1.15]) lgAt(sc, x, 0, 0, () => lgLoft(sc, LG_CASE, [[-1.0, -1.35, 2.85, 0.45], [2.3, -1.35, 2.85, 0.45]], { p: 5, n: 12 }));
  for (const x of [-1.61, 1.61]) lgAt(sc, x, -1.4, 3.8, () => sc.ell(VM_STEEL, 0.12, 0.42, 0.42));
  // bloc tombant : descend à l'ouverture et découvre la chambre (face arrière du canon)
  sc.push(vmT(0, -3.6 * op, -0.1 * op));
  lgAt(sc, 0, -1.3, 0.65, () => sc.box(LG_CASE, 1.8, 5.3, 3.1));
  sc.pop();
  if (op > 0.2) {
    lgAt(sc, 0, 0, 2.15, () => sc.cyl(VM_STEEL, 1.5, 0.1, { segs: 14 }));
    lgAt(sc, 0, 0, 2.1, () => sc.cyl(VM_DARK, 0.7, 0.14, { segs: 12 }));
    lgAt(sc, 0, -2.6, 0.6, () => sc.box(VM_DARK, 1.8, 4.2, 3.0));
  }
  // chien latéral (côté droit, crête visible au-dessus)
  sc.push(vmChain(vmT(1.0, 0, 0), lgPivot(-0.4, -1.6, vmRx(o.hammerDown ? 0.8 : 0))));
  sc.ext(LG_CASE, [[-0.8, -0.6], [-1.4, 1.4], [-2.6, 2.8], [-3.6, 2.95], [-3.0, 2.1], [-2.4, 0.8], [-2.2, -1.2], [-0.8, -1.4]], 0.9);
  sc.pop();
  // canon lourd, bague, guidon à tunnel, hausse à échelle repliée
  lgAt(sc, 0, 0, 9.4, () => lgPrism(sc, VM_BLUED, 1.55, L - 9.4, 8, { r2: 1.42 }));
  lgAt(sc, 0, 0, L - 0.05, () => sc.cyl(VM_DARK, 0.6, 0.14, { segs: 10 }));
  lgAt(sc, 0, 0, L - 0.55, () => lgPrism(sc, VM_STEEL, 1.46, 0.5, 8));
  lgAt(sc, 0, 1.78, L - 2.4, () => sc.cyl(VM_BLUED, 0.52, 2.0, { segs: 12 }));
  lgAt(sc, 0, 1.78, L - 2.45, () => sc.cyl(VM_DARK, 0.32, 0.1, { segs: 10 }));
  lgAt(sc, 0, 1.55, L - 1.4, () => sc.ell(VM_BRASS, 0.16, 0.2, 0.16));
  lgAt(sc, 0, 1.52, 24.5, () => sc.box(VM_BLUED, 1.7, 0.3, 4.6));
  lgAt(sc, 0, 1.72, 23.0, () => sc.box(VM_DARK, 0.5, 0.12, 0.4));
  // garde-main court, embout en étain
  const FS = [[9.5, -1.5, 1.8, 1.95], [22, -1.4, 1.7, 1.85], [25.5, -1.35, 1.55, 1.7]];
  lgLoft(sc, LG_WOOD, FS, { n: 18 });
  lgGrain(sc, FS, 9.8, 25.2, 41, { n: 7 });
  lgLoft(sc, VM_NICKEL, [[25.5, -1.35, 1.58, 1.73], [27.2, -1.25, 1.35, 1.5]], { n: 16 });
  // crosse et queue de culasse avec dioptre replié
  const SS = [[-3.1, -1.1, 2.4, 1.48], [-6, -2.1, 2.0, 1.4], [-10.5, -3.0, 2.1, 1.46], [-15, -4.2, 3.0, 1.66], [-21, -5.6, 4.2, 1.86], [-26, -6.6, 5.2, 1.96]];
  lgLoft(sc, LG_WOOD, SS, { n: 18 });
  lgGrain(sc, SS, -3.4, -25, 42, { n: 10 });
  lgAt(sc, 0, 1.05, -5.4, () => sc.box(LG_CASE, 1.2, 0.35, 5.0));
  lgAt(sc, 0, 1.25, -4.2, () => sc.ell(VM_STEEL, 0.24, 0.1, 0.24));
  lgAt(sc, 0, 1.25, -6.9, () => sc.ell(VM_STEEL, 0.24, 0.1, 0.24));
  // doubles détentes et levier-pontet (pivot avant, s'ouvre vers le bas)
  sc.ext(VM_STEEL, [[1.6, -4.1], [1.3, -5.3], [0.8, -5.8], [1.0, -5.0], [0.9, -4.1]], 0.4);
  sc.ext(VM_STEEL, [[-0.2, -4.1], [-0.4, -5.1], [-0.9, -5.6], [-0.7, -4.9], [-0.8, -4.1]], 0.4);
  sc.push(lgPivot(-4.0, 6.4, vmRx(-0.95 * op)));
  sc.tube(LG_CASE, [[0, -4.1, 6.4], [0, -4.5, 3.6], [0, -5.6, 3.0], [0, -6.6, 1.7], [0, -6.8, 0], [0, -6.3, -1.8],
    [0, -5.6, -2.8], [0, -6.3, -4.0], [0, -7.4, -4.4], [0, -8.2, -3.8], [0, -8.2, -2.9]], 0.36);
  sc.pop();
}

// --- canon scié : juxtaposé, bande et guidon perle, deux chiens, crosse courte ; o.open bascule les canons
const LG_SAWED = { L: 30, grip: { b: [0, -4.6, -10.4], t: [0, -2.8, -4.4], trigger: [0, -4.6, 0.2] }, fore: [9.0, 16.0], foreY: -1.55, foreR: [2.35, 1.7] };
function lgSawed(sc, o) {
  const L = o.L ?? LG_SAWED.L, op = o.open || 0, REC = o.recv || LG_CASE, MET = o.metal || VM_BLUED, WOOD = o.wood || LG_WOOD;
  // bascule : canons et garde-main pivotent ensemble autour de la charnière
  sc.push(lgPivot(-1.9, 6.4, vmRx(0.62 * op)));
  for (const x of [-1.22, 1.22]) {
    lgAt(sc, x, 0, 0, () => sc.cyl(MET, 1.24, L, { segs: 18, r2: 1.18 }));
    lgAt(sc, x, 0, L - 0.04, () => sc.cyl(VM_DARK, 0.86, 0.12, { segs: 12 }));
    lgAt(sc, x, 0, L - 0.5, () => sc.cyl(VM_STEEL, 1.22, 0.45, { segs: 18 }));
    // culasse : faces des canons, chambres vides ou cartouches neuves qu'on enfonce
    lgAt(sc, x, 0, -0.02, () => sc.cyl(VM_STEEL, 1.2, 0.04, { segs: 18 }));
    if (op > 0.15) {
      if (o.shells === 'new') {
        const out = 4.8 * (1 - (o.seat ?? 1));
        sc.push(vmT(x, 0, -out - 0.06));
        sc.push(vmT(0, 0, -0.22)).cyl(VM_BRASS, 1.05, 0.22, { segs: 14 }).pop();
        sc.cyl(VM_BRASS, 0.97, Math.min(out + 0.1, 1.4), { segs: 14 });
        sc.push(vmT(0, 0, -0.26)).cyl(LG_GUNMETAL, 0.3, 0.06, { segs: 8 }).pop();
        if (out > 1.4) sc.push(vmT(0, 0, 1.4)).cyl(LG_SHELL, 0.9, out - 1.3, { segs: 12 }).pop();
        sc.pop();
      } else lgAt(sc, x, 0, -0.06, () => sc.cyl(VM_DARK, 0.86, 0.1, { segs: 12 }));
    }
  }
  // bande entre les canons, guidon perle laiton
  lgAt(sc, 0, 0.98, L / 2, () => sc.box(MET, 0.9, 0.5, L - 0.6));
  lgAt(sc, 0, 1.24, L / 2, () => sc.box(LG_GUNMETAL, 0.62, 0.06, L - 1.2));
  lgAt(sc, 0, 1.55, L - 0.8, () => sc.ell(VM_BRASS, 0.32, 0.32, 0.32));
  lgAt(sc, 0, -1.0, L / 2, () => sc.box(MET, 0.9, 0.9, L - 1));
  // pièces de culasse sous les canons + garde-main
  sc.ext(REC, [[0, -0.6], [6.4, -0.6], [6.6, -1.8], [6.0, -2.5], [0.4, -2.5]], 2.3);
  const FS = [[6.6, -1.55, 1.15, 2.35], [9, -1.6, 1.22, 2.4], [15, -1.5, 1.0, 2.2], [16.5, -1.38, 0.78, 1.9]];
  lgLoft(sc, WOOD, FS, { n: 18 });
  lgGrain(sc, FS, 6.8, 16.3, 51, { n: 6 });
  sc.pop();
  // boîte : bascule jaspée, flasques arrondies derrière les canons
  const RS = [[-1.9, -0.8, 1.9, 2.3], [0.2, -0.9, 2.05, 2.45]], RL = [[0.2, -1.6, 1.25, 2.3], [6.6, -1.6, 1.2, 2.3]];
  lgLoft(sc, REC, RS, { p: 4, n: 20 });
  lgLoft(sc, REC, RL, { p: 5, n: 16 });
  lgMottle(sc, RL, 0.4, 6.4, 61, 5, 8);
  lgMottle(sc, RS, -1.8, 0.1, 62, 4, 5);
  for (const x of [-1.22, 1.22]) lgAt(sc, x, 0, -0.9, () => sc.ell(REC, 1.18, 1.18, 1.0));
  for (const x of [-2.32, 2.32]) lgAt(sc, x, -1.6, 4.0, () => sc.ell(VM_STEEL, 0.1, 0.33, 0.33));
  // clé d'ouverture sur la queue de culasse
  lgAt(sc, 0, 1.2, -2.2, () => lgLoft(sc, REC, [[0.2, 0, 0.26, 0.42], [-2.2, 0, 0.24, 0.36], [-2.8, 0.05, 0.28, 0.42]], { p: 3, n: 12 }));
  // deux chiens extérieurs, crêtes striées
  for (const [x, k] of [[-1.35, 0], [1.35, 1]]) {
    const down = o.hammerDown && (o.hammerDown === 2 || k === 1);
    sc.push(vmChain(vmT(x, 0, 0), lgPivot(-0.2, -2.6, vmRx(down ? 0.85 : 0))));
    sc.ext(REC, [[-1.8, -0.4], [-2.2, 1.0], [-3.2, 2.2], [-4.2, 2.6], [-4.45, 2.1], [-3.4, 1.4], [-3.0, -0.2], [-2.0, -1.4]], 0.85);
    for (let j = 0; j < 3; j++) lgAt(sc, 0, 2.55 - j * 0.12, -4.0 + j * 0.3, () => sc.box(VM_DARK, 0.9, 0.08, 0.12));
    sc.pop();
  }
  // crosse courte à poignée pistolet, pontet, deux détentes
  const SS = [[-1.7, -0.9, 2.3, 1.9], [-3.8, -1.9, 2.1, 1.55], [-7.5, -3.1, 2.3, 1.52], [-11, -4.6, 3.2, 1.66], [-15.5, -6.0, 4.0, 1.8]];
  lgLoft(sc, WOOD, SS, { n: 18 });
  lgGrain(sc, SS, -2.0, -15, 52, { n: 9 });
  sc.tube(MET, [[0, -2.8, 3.4], [0, -4.4, 2.9], [0, -5.4, 1.4], [0, -5.4, -0.6], [0, -4.6, -1.8], [0, -3.4, -2.2]], 0.3);
  sc.ext(VM_STEEL, [[1.6, -2.8], [1.4, -3.9], [0.9, -4.5], [1.1, -3.8], [1.0, -2.8]], 0.4);
  sc.ext(VM_STEEL, [[0.4, -2.8], [0.2, -3.8], [-0.3, -4.4], [-0.1, -3.7], [-0.2, -2.8]], 0.4);
}

// --- fusil à harpon (canon baleinier) : canon court et gros en bronze, platine à chien latéral, harpon d'acier qui sort
// de la bouche (fer barbelé, anneau et bout de câble qui pend) ; o.harpoon : 0 absent … 1 enfoncé dans le canon
const LG_HARP = { L: 30, grip: { b: [0, -4.4, -10.8], t: [0, -2.6, -4.6], trigger: [0, -4.8, 0.4] }, fore: [8.0, 16.0], foreY: -2.3, foreR: [2.3, 2.3] };
const LG_BRONZE = vmMatRamp(['#2e1a0a', '#5a3814', '#8a5e26', '#b88a40', '#f0d080'], { spec: true });
function lgHarpoon(sc, o) {
  const L = LG_HARP.L;
  // boîte et platine, chien latéral à droite
  const RS = [[-1.4, -0.9, 2.1, 1.6], [0.0, -0.9, 2.6, 1.8], [6.0, -0.95, 2.6, 1.8], [7.0, -0.9, 2.2, 1.7]];
  lgLoft(sc, LG_BLACK, RS, { p: 4, n: 18 });
  sc.push(vmChain(vmT(1.2, 0, 0), lgPivot(-0.4, -1.4, vmRx(o.hammerDown ? 0.8 : 0))));
  sc.ext(VM_STEEL, [[-0.8, -0.6], [-1.3, 1.3], [-2.4, 2.6], [-3.4, 2.8], [-2.9, 2.0], [-2.3, 0.8], [-2.1, -1.0], [-0.8, -1.2]], 0.9);
  sc.pop();
  // gros canon de bronze, bagues renforcées, bouche évasée
  lgAt(sc, 0, 0, 6.0, () => sc.cyl(LG_BRONZE, 2.0, L - 6.0, { segs: 20, r2: 1.85 }));
  for (const z of [6.4, 14, L - 1.2]) lgAt(sc, 0, 0, z, () => sc.cyl(LG_BRONZE, 2.25, 1.1, { segs: 20 }));
  lgAt(sc, 0, 0, L - 0.05, () => sc.cyl(VM_DARK, 1.1, 0.14, { segs: 14 }));
  lgAt(sc, 0, 2.15, L - 2.0, () => sc.ell(VM_BRASS, 0.32, 0.32, 0.32));
  // fût court sous le canon, crosse de chêne, pontet
  const FS = [[5.8, -2.2, 1.6, 2.2], [9, -2.3, 1.7, 2.3], [17, -2.2, 1.5, 2.1], [18, -2.0, 1.2, 1.8]];
  lgLoft(sc, LG_WOOD, FS, { n: 18 });
  lgGrain(sc, FS, 6.0, 17.8, 71, { n: 6 });
  const SS = [[-1.2, -1.0, 2.6, 1.6], [-3.6, -2.0, 2.2, 1.5], [-8, -3.2, 2.3, 1.55], [-12.5, -4.5, 3.2, 1.7], [-18, -5.8, 4.3, 1.9], [-23, -6.8, 5.2, 2.0]];
  lgLoft(sc, LG_WOOD, SS, { n: 18 });
  lgGrain(sc, SS, -1.4, -22, 72, { n: 9 });
  sc.tube(VM_STEEL, [[0, -3.3, 3.2], [0, -4.8, 2.8], [0, -5.7, 1.4], [0, -5.7, -0.5], [0, -4.9, -1.6], [0, -3.8, -2.0]], 0.3);
  sc.ext(VM_STEEL, [[1.3, -3.3], [1.1, -4.4], [0.6, -5.0], [0.8, -4.3], [0.7, -3.3]], 0.45);
  // le harpon : hampe d'acier qui dépasse de la bouche, fer barbelé à deux ailettes, anneau et câble qui pend
  const h = o.harpoon ?? 1;
  if (h > 0) {
    const out = 20 * h + (1 - h) * 40; // pendant le rechargement il est encore à moitié sorti
    const zt = L + out;
    lgAt(sc, 0, 0, L - 6, () => sc.cyl(VM_STEEL, 0.6, zt - (L - 6), { segs: 10 }));
    lgAt(sc, 0, 0, zt, () => sc.cyl(VM_STEEL, 0.75, 1.0, { segs: 10 }));
    // fer en croix (vu de derrière, on lit ses quatre barbelures)
    for (const a of [0, Math.PI / 2]) {
      sc.push(vmRz(a));
      sc.ext(KN_STEEL_HI, [[zt + 0.8, 1.3], [zt + 6.5, 0], [zt + 0.8, -1.3], [zt + 1.4, 0]], 0.5);
      for (const s of [1, -1]) sc.ext(KN_STEEL, [[zt + 1.5, s * 0.6], [zt - 3.0, s * 3.4], [zt - 2.0, s * 0.7]], 0.4);
      sc.pop();
    }
    lgAt(sc, 0, 0.9, L + 3.2, () => sc.cyl(VM_BRASS, 0.95, 0.4, { segs: 12 }));
    sc.tube(KN_HEMP, [[0, 1.6, L + 3.2], [0.8, -0.4, L + 2.0], [1.4, -3.8, L - 1.5], [1.6, -6.5, L - 6], [1.2, -8.5, L - 12]], 0.32, { segs: 6 });
  }
}

// --- canardière (punt gun) : un canon de marais démesuré, bandes de laiton, énorme bouche, crosse de chêne
const LG_PUNT = { L: 74, grip: { b: [0, -4.6, -11.4], t: [0, -2.8, -4.8], trigger: [0, -5.0, 0.6] }, fore: [20, 30], foreY: -3.4, foreR: [2.6, 2.6] };
function lgPunt(sc, o) {
  const L = LG_PUNT.L;
  const RS = [[-1.4, -0.9, 2.2, 1.8], [0.0, -0.9, 2.9, 2.1], [8.0, -0.9, 2.9, 2.1], [9.0, -0.8, 2.6, 2.0]];
  lgLoft(sc, LG_BLACK, RS, { p: 4, n: 18 });
  sc.push(vmChain(vmT(1.4, 0, 0), lgPivot(-0.4, -1.4, vmRx(o.hammerDown ? 0.8 : 0))));
  sc.ext(VM_STEEL, [[-0.8, -0.6], [-1.3, 1.4], [-2.4, 2.8], [-3.6, 3.0], [-3.0, 2.1], [-2.3, 0.8], [-2.1, -1.0], [-0.8, -1.2]], 0.9);
  sc.pop();
  // canon : très long, gros, qui s'évase un peu à la bouche ; bandes de laiton tous les 14 cm
  lgAt(sc, 0, 0.6, 8.0, () => sc.cyl(LG_GUNMETAL, 2.5, L - 8, { segs: 22, r2: 2.75 }));
  for (let z = 10; z < L - 4; z += 14) lgAt(sc, 0, 0.6, z, () => sc.cyl(VM_BRASS, 2.7 + (z / L) * 0.25, 1.2, { segs: 22 }));
  lgAt(sc, 0, 0.6, L - 1.4, () => sc.cyl(VM_BRASS, 3.05, 1.4, { segs: 22 }));
  lgAt(sc, 0, 0.6, L - 0.05, () => sc.cyl(VM_DARK, 1.9, 0.14, { segs: 16 }));
  lgAt(sc, 0, 3.4, L - 2.4, () => sc.ell(VM_BRASS, 0.42, 0.42, 0.42));
  // long fût de chêne sous le canon, crosse
  const FS = [[8, -2.6, 1.9, 2.6], [12, -2.9, 2.0, 2.7], [38, -2.9, 1.8, 2.5], [40, -2.6, 1.4, 2.1]];
  lgLoft(sc, LG_WOOD, FS, { n: 18 });
  lgGrain(sc, FS, 8.2, 39.6, 81, { n: 8 });
  const SS = [[-1.2, -1.0, 2.7, 1.8], [-3.6, -2.1, 2.3, 1.6], [-8.5, -3.4, 2.4, 1.6], [-13, -4.7, 3.3, 1.8], [-19, -6.1, 4.5, 2.0], [-24, -7.2, 5.4, 2.1]];
  lgLoft(sc, LG_WOOD, SS, { n: 18 });
  lgGrain(sc, SS, -1.4, -23, 82, { n: 9 });
  sc.tube(VM_STEEL, [[0, -3.4, 3.4], [0, -5.0, 3.0], [0, -6.0, 1.6], [0, -6.0, -0.4], [0, -5.2, -1.6], [0, -4.0, -2.0]], 0.32);
  sc.ext(VM_STEEL, [[1.4, -3.4], [1.2, -4.6], [0.6, -5.3], [0.8, -4.5], [0.7, -3.4]], 0.45);
  // rechargement par la bouche : la baguette qui dépasse
  if (o.ramrod) lgAt(sc, 0, 0.6, L - 12, () => sc.cyl(LG_WOOD, 0.45, 12 + o.ramrod, { segs: 8 }));
}

// --- tenue : culasse posée sur le point b du canvas à la profondeur zb, bouche visée sur le point m du canvas (la
// longueur du canon fixe sa profondeur) ; m est choisi pour que le canon reste à peu près parallèle au regard (il file
// vers le viseur comme dans Doom et laisse voir le dessus de l'arme)
const LG_POSE = {
  winchester: { b: [89, 116], zb: 25, m: [88, 52] },
  pump: { b: [89, 116], zb: 25, m: [88, 52] },
  sharps: { b: [89, 118], zb: 31, m: [88, 54] },
  sawed: { b: [89, 120], zb: 28, m: [88, 66] },
  harpoon: { b: [89, 122], zb: 28, m: [88, 72] },
  puntgun: { b: [89, 118], zb: 24, m: [88, 50] },
};
// bouts des avant-bras (canvas x, y sous le bord bas, profondeur) : les bras sortent par le bas
const LG_RARM = [112, 330, 12], LG_LARM = [20, 250, 28];
// Point caméra qui tombe en (cx, cy) du canvas à la profondeur z
const lgUn = (cx, cy, z) => [((cx - 88) * z) / 300, (-(cy - 22) * z) / 300, z];
function lgPose(P, L) {
  const O = lgUn(P.b[0], P.b[1], P.zb), u = lgUn(P.m[0], P.m[1], 1);
  const uu = vmDot(u, u), uo = vmDot(u, O), k = (uo + Math.sqrt(uo * uo - uu * (vmDot(O, O) - L * L))) / uu;
  return vmAlong(O, vmK(u, k));
}

// Rechargement, par arme et par image : roulis (négatif = flanc gauche vers nous), montée (cm), cabré (+ = bouche en
// haut) ; le canon reste dirigé vers l'avant
const LG_REL = {
  winchester: [{ roll: -0.32, lift: 1.0, pitch: 0.05 }, { roll: -0.42, lift: 1.4, pitch: 0.07 }, { roll: -0.14, lift: 0.5, pitch: 0.03 }],
  pump: [{ roll: 0.08, lift: 0.3, pitch: 0.02 }, { roll: 0.12, lift: 0.5, pitch: 0.03 }, { roll: 0.04, lift: 0.2, pitch: 0.01 }],
  sharps: [{ roll: -0.32, lift: 1.4, pitch: 0.04 }, { roll: -0.36, lift: 1.6, pitch: 0.05 }, { roll: -0.1, lift: 0.4, pitch: 0.02 }],
  sawed: [{ roll: 0, lift: 0.4, pitch: -0.1 }, { roll: 0, lift: 0.8, pitch: -0.12 }, { roll: 0, lift: 0.3, pitch: -0.05 }],
  harpoon: [{ roll: -0.2, lift: 0.6, pitch: 0.12 }, { roll: -0.3, lift: 1.0, pitch: 0.16 }, { roll: -0.1, lift: 0.4, pitch: 0.06 }],
  puntgun: [{ roll: 0.1, lift: -1.5, pitch: 0.16 }, { roll: 0.12, lift: -2.0, pitch: 0.2 }, { roll: 0.05, lift: -0.8, pitch: 0.08 }],
};
// Cartouche ou douille (taille réelle) dont la base est au point p du repère F de l'arme, axe d (repère arme)
function lgCart(sc, F, p, d, kind) {
  const c0 = vmP(F, p), ax = vmUnit(vmSub(vmP(F, vmAdd(p, d)), c0));
  sc.stack.push(vmAlong(c0, vmAdd(c0, ax)));
  lgRound(sc, kind);
  sc.stack.pop();
}

// x (roulette) : { pose, L, recv, metal, wood } pour un autre fusil que ceux du FPS
function lgView(id, state, frame, skin, cloth, x = {}) {
  const kind = id === 'goldwin' ? 'winchester' : id;
  const P = x.pose || LG_POSE[kind], spec = { winchester: LG_WIN, pump: LG_PUMP, sharps: LG_SHARPS, sawed: LG_SAWED, harpoon: LG_HARP, puntgun: LG_PUNT }[kind];
  const fire = state === 'fire', rel = state === 'reload';
  const kick = fire ? (frame === 0 ? 1 : 0.3) : 0;
  const sc = vmScene();
  const S = vmS(LG_K, LG_K, 1), G = spec.grip.t, gy = G[1] * LG_K, gz = G[2];
  // recul : la bouche se relève autour de la main droite et l'arme recule
  let hold = vmChain(lgPose(P, x.L ?? spec.L), vmT(0, 0, -2.2 * kick), lgPivot(gy, gz, vmRx(-0.11 * kick)));
  const R = rel ? LG_REL[kind][frame] : null;
  if (R) hold = vmChain(vmT(0, R.lift, 0), hold, lgPivot(gy, gz, vmChain(vmRx(-R.pitch), vmRz(R.roll))));
  sc.push(hold).push(S);
  const o = { gold: id === 'goldwin', L: x.L, recv: x.recv, metal: x.metal, wood: x.wood };
  if (kind === 'winchester') { o.lever = rel ? [0.6, 1.0, 0.25][frame] : 0; o.cycle = rel ? [0.6, 1, 0.25][frame] : 0; }
  if (kind === 'pump') o.slide = rel ? [5, 8.5, 2.5][frame] : 0;
  if (kind === 'sharps') o.open = rel ? [1, 1, 0.35][frame] : 0;
  if (kind === 'sawed') {
    o.open = rel ? [0.85, 1, 0.5][frame] : 0;
    o.shells = rel && frame > 0 ? 'new' : 'old';
    o.seat = frame === 1 ? 0.45 : 1;
    o.hammerDown = fire && frame === 0 ? 2 : 0;
  } else o.hammerDown = fire && frame === 0;
  // harpon : parti au coup de feu, renfoncé dans le canon pendant le rechargement ; canardière : la baguette
  if (kind === 'harpoon') o.harpoon = fire ? 0 : rel ? [0, 0.35, 1][frame] : 1;
  if (kind === 'puntgun') o.ramrod = rel ? [14, 6, 0][frame] : 0;
  ({ winchester: lgWinchester, pump: lgPump, sharps: lgSharps, sawed: lgSawed, harpoon: lgHarpoon, puntgun: lgPunt })[kind](sc, o);
  const F = sc.top();
  sc.pop().pop();

  // douilles éjectées (taille réelle) ; Sharps : cartouche neuve à moitié glissée dans la chambre
  if (rel && kind === 'winchester' && frame === 1) lgCart(sc, F, [1.0, 3.8, 4.0], [0.6, 0.5, -0.8], 'case');
  if (rel && kind === 'pump' && frame === 1) lgCart(sc, F, [2.6, 2.4, 8.5], [0.8, 0.5, 0.5], 'shell');
  if (rel && kind === 'sharps' && frame === 0) lgCart(sc, F, [2.2, 2.2, -2.5], [0.7, 0.3, 0.6], 'case');
  if (rel && kind === 'sharps' && frame === 1) lgCart(sc, F, [0, 1.9, -2.2], [0, -0.3, 1], 'sharps');
  if (rel && kind === 'sawed' && frame === 0) {
    lgCart(sc, F, [-3.0, 3.0, -2.0], [-0.4, 0.8, -0.5], 'hull');
    lgCart(sc, F, [2.8, 3.6, -1.0], [0.5, 0.9, -0.3], 'hull');
  }

  // main droite : poignet de crosse sous la boîte, doigts par-dessous, index sur la détente, pouce sur le flanc
  const g = spec.grip, rFwd = [-0.42, -0.9, 0.1];
  // Winchester : pendant le rechargement les doigts sont dans la boucle et la main suit le levier
  const FR0 = kind === 'winchester' && rel ? vmMul(F, lgPivot(-3.3, 11.6, vmRx(-o.lever * 0.75))) : F;
  lgHandAt(sc, FR0, g.b, g.t, { skin, cloth, side: 1, rx: 1.5 * LG_K, rz: 1.7 * LG_K, fwd: rFwd, trigger: rel ? null : g.trigger, arm: lgUn(...LG_RARM) });

  // main gauche : berce le garde-main par-dessous (pompe : suit la coulisse ; scié : suit les canons basculés)
  const [f0, f1] = spec.fore, y = spec.foreY, FR = spec.foreR;
  const lOpt = { skin, cloth, side: -1, rx: FR[0] * LG_K, rz: FR[1] * LG_K, fwd: [0.87, 0.5, 0], curl: 0.62,
    thumb: [-FR[0] - 0.15, y + 1.2, f1 + 3.0], arm: lgUn(...LG_LARM) };
  const FL = kind === 'sawed' ? vmMul(F, lgPivot(-1.9, 6.4, vmRx(0.62 * o.open))) : vmMul(F, vmT(0, 0, -(o.slide || 0)));
  lgHandAt(sc, FL, [0, y, f0], [0, y, f1], lOpt);

  // éclair, fumée
  const L = x.L ?? spec.L;
  if (fire) sc.fx((p) => {
    const pts = (kind === 'sawed' ? [[-1.22, 0, L + 0.8], [1.22, 0, L + 0.8]] : [[0, 0, L + 0.8]]).map((q) => vmP(F, q));
    const m = pts.map(vmProj).reduce((a, q) => [a[0] + q[0] / pts.length, a[1] + q[1] / pts.length], [0, 0]);
    if (frame === 0) vmFlash(p, m[0], m[1], kind === 'puntgun' ? 26 : kind === 'sawed' || kind === 'harpoon' ? 19 : kind === 'pump' ? 17 : kind === 'sharps' ? 16 : 14, kind.length);
    else vmSmoke(p, m[0], m[1] - 2, kind.length);
  });
  return vmRender(sc);
}

function lgViewModel(id, state, frame, skin, cloth) {
  if (!LG_IDS.includes(id)) return null;
  const ok = (state === 'fire' && (frame === 0 || frame === 1)) || (state === 'reload' && (frame === 0 || frame === 1 || frame === 2));
  try { return lgView(id, ok ? state : 'idle', ok ? frame : 0, skin, cloth); }
  catch (e) {
    console.error(e);
    try { return lgView(id, 'idle', 0, skin, cloth); } catch (e2) { return null; }
  }
}

// ------------------------------------------------------------------ 8c) armes diverses en main : derringer, Gatling, dynamite, rênes
// Modèles 3D pour le moteur vm3d (repère de chaque arme : canon selon +z, y en haut, cm).
// msViewModel(id, state, frame, skin, cloth) → canvas 200x130 (mis en cache par viewModel) ou null si l'id n'est pas géré.

// --- matières propres
const MS_PEARL = vmMatRamp(['#4c4450', '#8a8090', '#c6bcc0', '#ece4da', '#ffffff'], { spec: true });
const MS_LABEL = vmMatRamp(['#5a3e22', '#8e6c40', '#c8a46a', '#ecd8a4', '#fff6dc']);
const MS_REIN = vmMatRamp(['#1e0e06', '#3a1c0c', '#5a3016', '#7c4a22', '#a06a38']);
const MS_IRON = vmMatRamp(['#141418', '#24262e', '#3a3e4a', '#5a6070', '#a8b0c4'], { spec: true });

// --- outils
// TUNE (dev) : variantes passées par la page d'aperçu, indexées par la couleur de peau
const msTune = (skin) => (globalThis.__TUNE && globalThis.__TUNE[skin]) || {};
const MS_TAU = Math.PI * 2;
// Lanière plate entre des points successifs : largeur w (côté large), épaisseur t
function msStrap(sc, mat, pts, w, t) {
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i], b = pts[i + 1], L = vmLen(vmSub(b, a));
    sc.push(vmChain(vmAlong(a, b), vmT(0, 0, L / 2)));
    sc.box(mat, w, t, L + t * 1.2, { same: i > 0 });
    sc.pop();
  }
  return sc;
}
// Point p (caméra) ramené dans le repère m (rotation + translation, sans échelle) : pour viser un coude hors champ en bas
function msToLocal(m, p) {
  const v = [p[0] - m[3], p[1] - m[7], p[2] - m[11]];
  return [m[0] * v[0] + m[4] * v[1] + m[8] * v[2], m[1] * v[0] + m[5] * v[1] + m[9] * v[2], m[2] * v[0] + m[6] * v[1] + m[10] * v[2]];
}
// Courbe pendante entre a et b (milieu abaissé de sag), n segments
function msSag(a, b, sag, n = 8, fwd = 0) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, k = 4 * t * (1 - t);
    out.push(vmAdd(vmLerp(a, b, t), [0, -sag * k, fwd * k]));
  }
  return out;
}
// Rayon d'éclair borné pour ne jamais toucher les bords haut / côtés du canvas
const msFlashR = (x, y, r) => Math.max(3, Math.min(r, (y - 2) / 0.9, (x - 2) / 1.06, (VM_W - 3 - x) / 1.06));
// Pixel sûr (loin des bords haut et côtés)
const msIn = (x, y) => x >= 1 && x <= VM_W - 2 && y >= 1 && y <= VM_H - 1;
// Gerbe d'étincelles 2D autour de (x, y) : cœur blanc, rayons jaunes, escarbilles orange
function msSparks(p, x, y, seed, size = 1) {
  const rand = rng(seed + 31);
  const P = (px, py, col) => { if (msIn(px, py)) p.P(px, py, col); };
  const n = Math.round(9 * size);
  for (let i = 0; i < n; i++) {
    const a = rand() * MS_TAU, l = (2 + rand() * 5) * size;
    const ex = x + Math.cos(a) * l, ey = y + Math.sin(a) * l - 1;
    const steps = Math.max(1, Math.round(l));
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      P(Math.round(x + (ex - x) * t), Math.round(y + (ey - y) * t), t < 0.5 ? '#fff6c0' : t < 0.85 ? '#ffd040' : '#ff8a20');
    }
  }
  for (let i = 0; i < 6 * size; i++) P(Math.round(x + (rand() * 2 - 1) * 9 * size), Math.round(y + (rand() * 2 - 1.3) * 7 * size), rand() < 0.5 ? '#ffb030' : '#ffe880');
  for (const [dx, dy, col] of [[0, 0, '#ffffff'], [1, 0, '#fff8d0'], [-1, 0, '#fff8d0'], [0, -1, '#fff8d0'], [0, 1, '#ffe070']]) P(Math.round(x + dx), Math.round(y + dy), col);
}
// Fumée légère (bornée en haut)
function msPuff(p, x, y, seed, n = 4) {
  const rand = rng(seed + 7);
  for (let i = 0; i < n; i++) {
    const r = 1.2 + i * 0.55, cy = y - i * 2.8, cx = x + Math.sin(i * 1.4 + seed) * 1.8;
    if (cy - r < 2) break;
    p.disc(cx, cy, r, i % 2 ? '#bcb8b0' : '#dcd8d0');
    if (rand() < 0.5) p.P(cx - r * 0.4, cy - r * 0.5, '#f0ece4');
  }
}

// ================================================================== derringer Remington (canons superposés, crosse en bec d'oiseau)
// Repère : canon du haut selon +z en y = 0 ; culasse (face arrière des canons) en z = 0 (cm, échelle réelle).
// o.tip : angle de bascule des canons (vers le haut, autour de la charnière en haut de la culasse) ; o.rounds : culots visibles
const msDerTip = (tip) => vmChain(vmT(0, 1.05, -0.35), vmRx(-tip), vmT(0, -1.05, 0.35));
const MS_DER_K = 1.22; // un peu plus grand que nature : lisible à l'écran à côté de la main
function msDerringer(sc, o = {}) {
  sc.push(msDerTip(o.tip || 0));
  // deux canons superposés reliés par une âme étroite (silhouette en 8 vue de derrière)
  for (const y of [0, -1.55]) { sc.push(vmT(0, y, 0)); sc.cyl(VM_NICKEL, 0.8, 7.6, { segs: 16, same: y !== 0 }); sc.pop(); }
  sc.push(vmT(0, -0.78, 3.8)); sc.box(VM_NICKEL, 1.0, 1.4, 7.6, { same: true }); sc.pop();
  // nervure du dessus, guidon, talon de charnière
  sc.push(vmT(0, 0.82, 3.75)); sc.box(VM_NICKEL, 0.42, 0.3, 7.4); sc.pop();
  sc.push(vmT(0, 1.1, 7.05)); sc.box(VM_STEEL, 0.24, 0.45, 0.7); sc.pop();
  sc.push(vmT(0, 0.85, 0.2)); sc.box(VM_NICKEL, 1.2, 0.6, 1.0, { same: true }); sc.pop();
  // bouches
  for (const y of [0, -1.55]) { sc.push(vmT(0, y, 7.6)); sc.cyl(VM_DARK, 0.44, 0.06, { segs: 12 }); sc.pop(); }
  // chambres / culots à la culasse (visibles une fois basculé)
  [0, -1.55].forEach((y, k) => {
    sc.push(vmT(0, y, -0.1));
    if ((o.rounds || 0) > k) { sc.cyl(VM_BRASS, 0.62, 0.12, { segs: 12 }); sc.push(vmT(0, 0, -0.02)).cyl(VM_GOLD, 0.2, 0.05, { segs: 8 }).pop(); }
    else sc.cyl(VM_DARK, 0.5, 0.12, { segs: 12 });
    sc.pop();
  });
  sc.pop();
  // carcasse et crosse en bec d'oiseau (une seule pièce nickelée), bouclier de culasse haut
  sc.ext(VM_NICKEL, [[0, 1.0], [-0.5, 1.35], [-2.4, 1.2], [-3.3, 0.8], [-4.0, 0.0], [-4.7, -1.4], [-5.4, -3.0], [-6.0, -4.5],
    [-6.25, -5.6], [-6.0, -6.4], [-5.3, -6.85], [-4.5, -6.7], [-4.0, -6.1], [-3.6, -5.0], [-3.0, -3.9], [-2.2, -3.1], [-1.4, -2.85],
    [2.0, -2.8], [2.9, -2.5], [3.05, -2.05], [0, -2.05]], 1.9);
  // plaquettes de nacre (débordent de la carcasse de chaque côté)
  sc.ext(MS_PEARL, [[-3.2, -0.3], [-3.9, -0.6], [-4.5, -1.7], [-5.15, -3.2], [-5.7, -4.6], [-5.85, -5.6], [-5.4, -6.35], [-4.7, -6.4],
    [-4.25, -5.9], [-3.85, -4.8], [-3.2, -3.6], [-2.5, -2.7], [-2.3, -1.5], [-2.6, -0.6]], 2.5);
  // vis de plaquette (laiton), vis de charnière, levier de verrou rotatif (côté droit)
  for (const s of [-1, 1]) { sc.push(vmChain(vmT(s * 1.26, -4.5, -4.6), vmRy(Math.PI / 2))); sc.cyl(VM_GOLD, 0.3, 0.1, { segs: 8 }); sc.pop(); }
  sc.push(vmChain(vmT(0.98, 0.55, -0.55), vmRy(Math.PI / 2))); sc.cyl(VM_STEEL, 0.34, 0.1, { segs: 8 }); sc.pop();
  sc.push(vmChain(vmT(1.0, -0.95, -1.4), vmRz(o.tip ? 0.9 : 0))); sc.box(VM_NICKEL, 0.22, 0.6, 1.4); sc.pop();
  // chien (armé ou abattu) et détente à éperon sans pontet
  if (o.hammer === 'down') sc.ext(VM_NICKEL, [[-2.9, 1.0], [-3.0, 1.6], [-3.4, 2.0], [-3.95, 2.05], [-3.85, 1.6], [-3.55, 1.2], [-3.45, 0.6]], 0.6);
  else sc.ext(VM_NICKEL, [[-2.9, 1.0], [-3.2, 1.8], [-3.9, 2.4], [-4.7, 2.35], [-4.4, 1.95], [-3.8, 1.45], [-3.6, 0.6]], 0.6);
  sc.ext(VM_STEEL, [[-0.85, -2.8], [-0.75, -3.45], [-1.05, -4.1], [-1.55, -4.35], [-1.3, -3.85], [-1.25, -3.25], [-1.35, -2.8]], 0.5);
}
const MS_DER_GRIP = { b: [0, -5.7, -5.0], t: [0, -2.3, -3.45], trigger: [0, -3.5, -0.85], thumb: [-1.25, -0.4, -0.2] };
const MS_DER_MUZ = [0, 0, 8.0];
const msDerK = (p) => vmK(p, MS_DER_K);

// tenue droite comme les revolvers ; rechargement : arme couchée de profil (flanc gauche vers l'œil), canons basculés
const MS_DER_HOLD = [0.3, -9.4, 21, -0.07];
function msDerringerView(state, frame, skin, cloth) {
  const sc = vmScene(), TU = msTune(skin);
  const fire = state === 'fire', rel = state === 'reload';
  const kick = fire ? (frame === 0 ? 1 : 0.35) : 0;
  const G = MS_DER_GRIP, K = MS_DER_K;
  if (TU.dbg) return msDbgView((sc) => msDerringer(sc, { tip: TU.tip || 0, rounds: 2 }), TU.dbg);
  const HD = TU.h || MS_DER_HOLD;
  let hold = vmChain(vmHold(HD[0], HD[1], HD[2]), vmRx(HD[3]), vmT(0, -5, -4.5), vmRx(-0.11 * kick), vmT(0, 5 - 0.6 * kick, 4.5 - 0.8 * kick));
  const tip = rel ? [1.05, 1.05, 0.35][frame] : 0;
  if (rel) {
    const t = [1, 1, 0.6][frame], R = TU.rel || MS_DER_REL;
    hold = vmChain(vmHold(MS_DER_HOLD[0] + R[0] * t, MS_DER_HOLD[1] + R[1] * t, MS_DER_HOLD[2] + R[2] * t, R[5] * t), vmRy(R[3] * t), vmT(0, -5, -4.5), vmRx(R[4] * t), vmT(0, 5, 4.5));
  }
  sc.push(hold);
  sc.push(vmS(K, K, K));
  msDerringer(sc, { tip, rounds: rel ? [0, 2, 2][frame] : 2, hammer: fire && frame === 0 ? 'down' : 'up' });
  sc.pop();
  vmGrip(sc, msDerK(G.b), msDerK(G.t), { skin, cloth, rx: 1.15 * K, rz: 1.45 * K, web: 1.5, trigger: msDerK(G.trigger), thumb: msDerK(G.thumb), arm: rel ? msToLocal(hold, TU.arm || [6, -56, 16]) : [1, -32, -16] });
  if (fire) sc.fx((p, proj) => {
    const [mx, my] = proj(msDerK(MS_DER_MUZ));
    if (frame === 0) vmFlash(p, mx, my, msFlashR(mx, my, 13), 5);
    else msPuff(p, mx, my - 2, 2, 5);
  });
  sc.pop();
  if (rel && frame === 0) {
    // douilles vides éjectées : deux étuis de laiton qui tombent devant la culasse
    for (const [d, a] of [[[1.5, -3.5, 1.5], 0.6], [[3.2, -7.0, 0.5], -0.5]]) {
      sc.push(vmChain(hold, vmS(K, K, K), msDerTip(tip), vmT(d[0], d[1], d[2] - 1.5), vmRx(a), vmRy(0.8)));
      sc.cyl(VM_BRASS, 0.5, 2.2, { segs: 10 }); sc.push(vmT(0, 0, -0.1)).cyl(VM_BRASS, 0.62, 0.15, { segs: 10 }).pop();
      sc.pop();
    }
  }
  if (rel && frame === 1) {
    // main gauche : le pouce enfonce la deuxième cartouche dans la chambre du bas
    const C = vmChain(hold, vmS(K, K, K), msDerTip(tip), vmT(0, -1.55, -1.4));
    sc.push(C); sc.cyl(VM_BRASS, 0.5, 1.4, { segs: 10 }); sc.pop();
    const tp = vmP(C, [0, 0, -0.6]);
    const H = vmChain(vmT(tp[0], tp[1], tp[2]));
    sc.push(H);
    vmHand(sc, { skin, cloth, side: -1, curl: 0.6, rx: 1.3, rz: 1.3, y0: TU.ly0 ?? -4.2, thumb: TU.lth || [0.3, 3.9, 0.5], arm: TU.larm || [-14, -26, -14] });
    sc.pop();
  }
  return vmRender(sc);
}
const MS_DER_REL = [-1.6, -4, 24, -1.4, 0.35, 0.2];

// DEBUG (dev) : modèle seul vu sous un angle quelconque (TU.dbg = [lacet, tangage, zoom, distance])
function msDbgView(build, d) {
  const sc = vmScene();
  sc.push(vmChain(vmT(0, 0, d[3] || 80), vmS(d[2], d[2], d[2]), vmRx(d[1]), vmRy(d[0])));
  build(sc);
  sc.pop();
  return vmRender(sc);
}
// Inverse d'un repère rigide (rotation + translation)
function vmInv(m) {
  const r = [m[0], m[4], m[8], m[1], m[5], m[9], m[2], m[6], m[10]];
  const t = [m[3], m[7], m[11]];
  return [r[0], r[1], r[2], -(r[0] * t[0] + r[1] * t[1] + r[2] * t[2]),
    r[3], r[4], r[5], -(r[3] * t[0] + r[4] * t[1] + r[5] * t[2]),
    r[6], r[7], r[8], -(r[6] * t[0] + r[7] * t[1] + r[8] * t[2])];
}
// Main posée sur un manche décrit dans le repère de l'arme : du bas (b) vers le haut (t) du manche, l'index en t.
// trigger / thumb / arm sont donnés dans le repère de l'arme et convertis dans celui de la main.
function vmGrip(sc, b, t, o) {
  const up = vmUnit(vmSub(t, b));
  // repère : y le long du manche, z vers l'avant de l'arme (projeté), x = y × z
  let fwd = o.fwd || [0, 0, 1];
  fwd = vmUnit(vmSub(fwd, vmK(up, vmDot(fwd, up))));
  const x = vmCross(up, fwd);
  const F = [x[0], up[0], fwd[0], t[0], x[1], up[1], fwd[1], t[1], x[2], up[2], fwd[2], t[2]];
  const inv = vmInv(F);
  const loc = (p) => (Array.isArray(p) ? vmP(inv, p) : p);
  sc.push(F);
  vmHand(sc, { ...o, trigger: o.trigger && loc(o.trigger), thumb: loc(o.thumb), arm: o.arm && loc(o.arm) });
  sc.pop();
}

// Tout le moteur est partagé avec fpsart.js (VMK, modules js/fpsvm/)
export {
  canvas, rng, rd, pen, hardAlpha, VM_W, VM_H, VM_X0, VM_Y0, VM_F, vmI, vmMul, vmChain, vmT, vmS, vmRx, vmRy,
  vmRz, vmP, vmAdd, vmSub, vmK, vmDot, vmCross, vmLen, vmUnit, vmLerp, vmNormalMat, vmNM, VM_TILT, VM_DIP,
  vmHold, vmAim, vmAlong, vmProj, vmRgb, vmMatRamp, vmMat, VM_STEEL, VM_BLUED, VM_NICKEL, VM_BRASS, VM_GOLD,
  VM_WALNUT, VM_STAG, VM_RUBBER, VM_LEATHER, VM_PAPER, VM_FUSE, VM_DARK, vmScene, vmQuad, vmBoxTris, vmCylTris,
  vmEllTris, vmExtTris, vmEarClip, VM_LIGHT, VM_BAYER, vmRender, VM_FINGERS, vmHand, vmFlash, vmSmoke, KN_STEEL,
  KN_STEEL_HI, KN_HEMP, LG_IDS, LG_K, LG_CASE, LG_MOT_B, LG_MOT_S, LG_MOT_P, LG_WOOD, LG_GRAIN, LG_GLOW,
  LG_GOLDWOOD, LG_GOLDGRAIN, LG_ENGRAVE, LG_BLACK, LG_GUNMETAL, LG_LEAD, LG_SHELL, lgPrism, lgSE, lgLoft, lgStn,
  lgSurf, lgStrip, lgGrain, lgMottle, lgEngraveTop, lgAt, lgPlate, lgPivot, lgHandAt, lgRound, lgHammer, LG_WIN,
  lgWinchester, LG_PUMP, lgPump, LG_SHARPS, lgSharps, LG_SAWED, lgSawed, LG_HARP, LG_BRONZE, lgHarpoon, LG_PUNT,
  lgPunt, LG_POSE, LG_RARM, LG_LARM, lgUn, lgPose, LG_REL, lgCart, lgView, lgViewModel, MS_PEARL, MS_LABEL,
  MS_REIN, MS_IRON, msTune, MS_TAU, msStrap, msToLocal, msSag, msFlashR, msIn, msSparks, msPuff, msDerTip,
  MS_DER_K, msDerringer, MS_DER_GRIP, MS_DER_MUZ, msDerK, MS_DER_HOLD, msDerringerView, MS_DER_REL, msDbgView,
  vmInv, vmGrip,
};
