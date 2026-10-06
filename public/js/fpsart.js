// Assets du mode « fps » (western façon Doom) : murs, sols, personnages, montures, objets, décor, effets, armes en main.
// Tout est dessiné en code, en pixel art, et mis en cache : chaque fonction renvoie un canvas que fps.js relit une fois
// (getImageData) pour le copier dans son tampon 384x216.
// Conventions : 1 unité du monde = 1 hauteur de mur = 64 px de texture. Les textures sont opaques, sans éclairage ni
// brouillard (fps.js ombre selon la distance et l'ambiance), et se raccordent bord à bord. Les sprites ont un alpha
// tout ou rien, un contour OUT, et leur base au centre du bas du canvas (w/2, h-1).
import { OUT, shade, mix } from './sprites.js';
import { SKIN, HAIR_COLORS, CLOTH_COLORS, EYE_COLORS, hatColorOf, beardHasMustache, beardHasChin } from './data.js';
import { outline } from './miniscene.js';

export const TEX = 64;

// ------------------------------------------------------------------ outils communs
const CACHE = new Map();
// Met en cache le résultat de make() sous la clé key (les canvas ne sont jamais redessinés)
function memo(key, make) {
  let c = CACHE.get(key);
  if (!c) { c = make(); CACHE.set(key, c); }
  return c;
}

// Canvas relu pixel par pixel : gardé en mémoire plutôt que sur la carte graphique
function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingEnabled = false;
  return c;
}

// Damier magenta/noir pour un id pas encore dessiné : visible tout de suite en jeu
function checker(w, h) {
  return memo(`?${w}x${h}`, () => {
    const c = canvas(w, h);
    const ctx = c.getContext('2d');
    for (let y = 0; y < h; y += 8) for (let x = 0; x < w; x += 8) {
      ctx.fillStyle = ((x + y) / 8) % 2 ? '#000000' : '#ff00ff';
      ctx.fillRect(x, y, 8, 8);
    }
    return c;
  });
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
// Graine tirée d'une chaîne (id d'asset)
const hash = (str) => { let h = 7; for (const ch of String(str)) h = (Math.imul(h, 31) + ch.charCodeAt(0)) | 0; return h >>> 0; };

const rd = Math.round;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

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
// Texture : tout pixel transparent est bouché avec la couleur donnée
function opaque(c, fill = '#000000') {
  const ctx = c.getContext('2d');
  const img = ctx.getImageData(0, 0, c.width, c.height);
  const d = img.data;
  const n = parseInt(fill.slice(1), 16);
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 255) { if (d[i + 3] === 0) { d[i] = n >> 16; d[i + 1] = (n >> 8) & 255; d[i + 2] = n & 255; } d[i + 3] = 255; }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}
// Sprite fini : alpha tout ou rien puis contour sombre d'un pixel
const finish = (c) => outline(hardAlpha(c));

// Copie retournée horizontalement
function mirror(src) {
  const c = canvas(src.width, src.height);
  const ctx = c.getContext('2d');
  ctx.translate(src.width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(src, 0, 0);
  return c;
}

// Nouveau sprite de w x h : draw(pen) avec l'origine au centre du bas (base des pieds), puis finish()
function sprite(w, h, draw, { outlined = true } = {}) {
  const c = canvas(w, h);
  draw(pen(c, w >> 1, h - 1), c);
  return outlined ? finish(c) : hardAlpha(c);
}
// Nouvelle texture 64x64 opaque : draw(pen, rand) avec l'origine en haut à gauche
function texture(seed, draw, w = TEX, h = TEX) {
  const c = canvas(w, h);
  const p = pen(c);
  p.R(0, 0, w, h, '#000000');
  draw(p, rng(hash(seed)), c);
  return opaque(hardAlpha(c));
}

// Grain : nuance au hasard (±amt) des pixels d'une zone, pour casser les aplats (bois, crépi, pierre)
function grain(c, x, y, w, h, rand, amt = 0.08, density = 0.35) {
  const ctx = c.getContext('2d');
  const img = ctx.getImageData(x, y, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    if (!d[i + 3] || rand() > density) continue;
    const k = 1 + (rand() * 2 - 1) * amt;
    d[i] = clamp(d[i] * k, 0, 255); d[i + 1] = clamp(d[i + 1] * k, 0, 255); d[i + 2] = clamp(d[i + 2] * k, 0, 255);
  }
  ctx.putImageData(img, x, y);
}

// ------------------------------------------------------------------ police pixel 3x5
// Chaque glyphe : 5 lignes de 3 bits. Accents ignorés (É → E).
const GLYPHS = {
  A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110', E: '111100110100111',
  F: '111100110100100', G: '011100101101011', H: '101101111101101', I: '111010010010111', J: '001001001101010',
  K: '101101110101101', L: '100100100100111', M: '101111111101101', N: '110101101101101', O: '010101101101010',
  P: '110101110100100', Q: '010101101110011', R: '110101110101101', S: '011100010001110', T: '111010010010010',
  U: '101101101101111', V: '101101101101010', W: '101101111111101', X: '101101010101101', Y: '101101010010010',
  Z: '111001010100111', 0: '111101101101111', 1: '010110010010111', 2: '110001010100111', 3: '110001010001110',
  4: '101101111001001', 5: '111100110001110', 6: '011100111101111', 7: '111001010010010', 8: '111101111101111',
  9: '111101111001110', $: '011110010011110', '?': '110001010000010', '!': '010010010000010', '.': '000000000000010',
  '-': '000000111000000', '#': '101111101111101', ':': '000010000010000', "'": '010010000000000', ' ': '000000000000000',
};
const deaccent = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
// Largeur en pixels d'un texte (4 px par lettre à l'échelle 1, sans l'espace final)
const textW = (str, s = 1) => deaccent(str).length * 4 * s - s;
// Écrit str avec le pinceau R à partir de (x, y), lettres de 3x5 pixels agrandies s fois
function text(R, str, x, y, col, s = 1) {
  for (const ch of deaccent(str)) {
    const g = GLYPHS[ch] || GLYPHS['?'];
    for (let i = 0; i < 15; i++) if (g[i] === '1') R(x + (i % 3) * s, y + Math.floor(i / 3) * s, s, s, col);
    x += 4 * s;
  }
}

// ------------------------------------------------------------------ 1) murs  2) sols
// Textures 64x64 opaques. Murs : raccord gauche/droite. Sols/plafonds : raccord dans les deux sens.
// Lumière locale venant d'en haut à gauche (reliefs, rainures), jamais de dégradé global.

// --- couleurs en tableaux [r, g, b] pour les calculs pixel par pixel
const txRGB = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const txK = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const txLerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const txMod = (n, m = TEX) => ((n % m) + m) % m;
const txPick = (rand, arr) => arr[Math.floor(rand() * arr.length)];

// Remplit une zone pixel par pixel : f(x, y, [r, g, b] actuel) → '#hex' | [r, g, b] | null (inchangé)
function txField(c, f, x0 = 0, y0 = 0, w = TEX, h = TEX) {
  const ctx = c.getContext('2d');
  const img = ctx.getImageData(x0, y0, w, h), d = img.data;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    const v = f(x0 + x, y0 + y, [d[i], d[i + 1], d[i + 2]]);
    if (!v) continue;
    const a = typeof v === 'string' ? txRGB(v) : v;
    d[i] = a[0]; d[i + 1] = a[1]; d[i + 2] = a[2]; d[i + 3] = 255;
  }
  ctx.putImageData(img, x0, y0);
}

// Étalonnage final commun à toutes les textures : ombres décalées vers un violet froid, lumières vers un jaune chaud,
// au lieu d'un simple assombrissement (façon Blood / Outlaws). Le ciel-clé #9fb8c8 est laissé tel quel, et aucun
// autre pixel ne peut tomber dessus.
function txGrade(c) {
  const ctx = c.getContext('2d'), img = ctx.getImageData(0, 0, c.width, c.height), d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    let r = d[i], g = d[i + 1], b = d[i + 2];
    if (r === 0x9f && g === 0xb8 && b === 0xc8) continue;
    const L = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    const s = clamp((0.45 - L) / 0.45, 0, 1), h = clamp((L - 0.58) / 0.42, 0, 1);
    r = r * (1 - 0.13 * s) * (1 + 0.05 * h);
    g = g * (1 - 0.07 * s) * (1 + 0.02 * h);
    b = b * (1 + 0.1 * s) * (1 - 0.07 * h) + 9 * s * (1 - s * 0.4);
    r = clamp(Math.round(r), 0, 255); g = clamp(Math.round(g), 0, 255); b = clamp(Math.round(b), 0, 255);
    if (r === 0x9f && g === 0xb8 && b === 0xc8) b--;
    d[i] = r; d[i + 1] = g; d[i + 2] = b;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

// Pinceau qui dessine aussi à ±64 px (raccord horizontal, et vertical si wy)
function txWP(p, wy = false) {
  const offs = [];
  for (const dx of [-TEX, 0, TEX]) for (const dy of wy ? [-TEX, 0, TEX] : [0]) offs.push([dx, dy]);
  const each = (fn) => { for (const [dx, dy] of offs) fn(dx, dy); };
  return {
    R: (x, y, w, h, col) => each((dx, dy) => p.R(x + dx, y + dy, w, h, col)),
    P: (x, y, col) => each((dx, dy) => p.P(x + dx, y + dy, col)),
    line: (x0, y0, x1, y1, col, w = 1) => each((dx, dy) => p.line(x0 + dx, y0 + dy, x1 + dx, y1 + dy, col, w)),
    ell: (cx, cy, rx, ry, col) => each((dx, dy) => p.ell(cx + dx, cy + dy, rx, ry, col)),
    disc: (cx, cy, r, col) => each((dx, dy) => p.disc(cx + dx, cy + dy, r, col)),
    poly: (pts, col) => each((dx, dy) => p.poly(pts.map(([a, b]) => [a + dx, b + dy]), col)),
  };
}

// Bruit de valeur lisse, périodique sur 64 px dans les deux sens (cell = taille de maille, diviseur de 64)
function txNoise(rand, cell) {
  const n = Math.max(1, TEX / cell), g = Array.from({ length: n * n }, () => rand());
  const at = (i, j) => g[txMod(j, n) * n + txMod(i, n)];
  const sm = (t) => t * t * (3 - 2 * t);
  return (x, y) => {
    const fx = x / cell, fy = y / cell, ix = Math.floor(fx), iy = Math.floor(fy), u = sm(fx - ix), v = sm(fy - iy);
    const a = at(ix, iy), b = at(ix + 1, iy), q = at(ix, iy + 1), d = at(ix + 1, iy + 1);
    return a + (b - a) * u + (q - a) * v + (a - b - q + d) * u * v;
  };
}
function txFbm(rand, cells = [16, 8, 4], wts = [0.5, 0.3, 0.2]) {
  const ns = cells.map((s) => txNoise(rand, s));
  return (x, y) => { let s = 0; for (let i = 0; i < ns.length; i++) s += ns[i](x, y) * wts[i]; return s; };
}

// Cellules de Voronoï périodiques (pierres, cailloux, roche) : id de cellule par pixel + distance au bord
// n < 0 : grille de |n| x |n| germes décalés au hasard (cellules de taille régulière)
function txCellMap(rand, n, wy = true, warp = 0) {
  let pts;
  if (n < 0) {
    const g = -n, s = TEX / g;
    pts = [];
    for (let j = 0; j < g; j++) for (let i = 0; i < g; i++) pts.push([(i + 0.5 + (rand() - 0.5) * 0.7 + (j % 2) * 0.5) * s, (j + 0.5 + (rand() - 0.5) * 0.7) * s, rand()]);
    n = pts.length;
  } else pts = Array.from({ length: n }, () => [rand() * TEX, rand() * TEX, rand()]);
  const wx1 = warp ? txFbm(rand, [16, 8], [0.6, 0.4]) : null, wy1 = warp ? txFbm(rand, [16, 8], [0.6, 0.4]) : null;
  const id = new Int16Array(TEX * TEX), e = new Float32Array(TEX * TEX), ry = new Float32Array(TEX * TEX);
  for (let y = 0; y < TEX; y++) for (let x = 0; x < TEX; x++) {
    const X = x + 0.5 + (warp ? (wx1(x, y) - 0.5) * warp : 0), Y = y + 0.5 + (warp ? (wy1(x, y) - 0.5) * warp : 0);
    let d1 = 1e9, d2 = 1e9, best = 0, by = 0;
    for (let i = 0; i < n; i++) {
      let dx = X - pts[i][0]; dx -= TEX * Math.round(dx / TEX);
      let dy = Y - pts[i][1]; if (wy) dy -= TEX * Math.round(dy / TEX);
      const d = dx * dx + dy * dy;
      if (d < d1) { d2 = d1; d1 = d; best = i; by = dy; } else if (d < d2) d2 = d;
    }
    const k = y * TEX + x;
    id[k] = best; e[k] = Math.sqrt(d2) - Math.sqrt(d1); ry[k] = by / (Math.sqrt(d1) + 4);
  }
  const at = (x, y) => id[(wy ? txMod(y) : clamp(y, 0, TEX - 1)) * TEX + txMod(x)];
  return { pts, id, e, ry, at };
}
// Relief d'une cellule : bord haut éclairé, bord bas dans l'ombre, bombé léger
function txCellLight(m, x, y, s = 1) {
  const i = m.at(x, y);
  let k = 1;
  if (m.at(x, y - 1) !== i) k = 1 + 0.3 * s; else if (m.at(x, y - 2) !== i) k = 1 + 0.15 * s;
  else if (m.at(x, y + 1) !== i) k = 1 - 0.38 * s; else if (m.at(x, y + 2) !== i) k = 1 - 0.2 * s;
  if (m.at(x - 1, y) !== i) k *= 1 + 0.1 * s; else if (m.at(x + 1, y) !== i) k *= 1 - 0.15 * s;
  return k * (1 - m.ry[y * TEX + x] * 0.12 * s);
}

// Rectangle en relief (raised) ou en creux
function txBevel(p, x, y, w, h, col, raised = true, k = 0.25) {
  const hi = shade(col, k), lo = shade(col, -k);
  p.R(x, y, w, h, col);
  p.R(x, y, w, 1, raised ? hi : lo); p.R(x, y, 1, h, raised ? hi : lo);
  p.R(x, y + h - 1, w, 1, raised ? lo : hi); p.R(x + w - 1, y + 1, 1, h - 1, raised ? lo : hi);
}

// Fissure (marche aléatoire vers le bas) avec lèvre claire à droite
function txCrack(p, rand, x, y, len, dark, light, wy = false) {
  const w = txWP(p, wy);
  for (let i = 0; i < len; i++) {
    w.P(x, y, dark);
    if (light && rand() < 0.7) w.P(x + 1, y, light);
    y++;
    const r = rand();
    x += r < 0.28 ? -1 : r < 0.56 ? 1 : 0;
    if (rand() < 0.08) txCrack(p, rand, x, y, Math.floor(len / 3), dark, null, wy);
  }
}

// Rangs de blocs (briques, pierres de taille) : renvoie la description des rangs
// o : y0, y1, ch (hauteur d'un rang, joint compris), lens(r) → longueurs (somme 64), off(r), cols, mortar, bev, nz
function txBlocks(c, rand, o) {
  const rows = [];
  for (let y = o.y0, r = 0; y < o.y1; y += o.ch, r++) {
    const lens = o.lens(r, rand), off = o.off ? o.off(r, rand) : 0;
    let s = off;
    const blocks = lens.map((L) => { const b = { s, L, col: txRGB(txPick(rand, o.cols)), k: 0.92 + rand() * 0.16 }; s += L; return b; });
    rows.push({ y, h: Math.min(o.ch, o.y1 - y), blocks });
  }
  const nz = txFbm(rand, [16, 8, 4]), nz2 = txNoise(rand, 2);
  const mortar = txRGB(o.mortar), bev = o.bev ?? 0.22;
  txField(c, (x, y) => {
    if (y < o.y0 || y >= o.y1) return null;
    const row = rows[Math.floor((y - o.y0) / o.ch)];
    const v = y - row.y;
    let blk = row.blocks[0], u = 0;
    for (const b of row.blocks) { const d = txMod(x - b.s); if (d < b.L) { blk = b; u = d; break; } }
    const w = blk.L, h = row.h;
    // joint en creux : sous le bloc il est dans l'ombre, le joint vertical reste à mi-teinte
    if (v === h - 1) return txK(mortar, (u === w - 1 ? 0.62 : 0.74) + nz2(x, y) * 0.12);
    if (u === w - 1) return txK(mortar, 0.92 + nz2(x, y) * 0.14);
    let k = blk.k * (1 + ((o.nz ?? 0.18) * (nz(x + blk.s * 3, y) - 0.5)) + (nz2(x, y) - 0.5) * 0.08);
    if (v === 0 || u === 0) k *= 1 + bev; else if (v === h - 2 || u === w - 2) k *= 1 - bev * 1.3;
    else if (o.wide && (v === 1 || u === 1)) k *= 1 + bev * 0.45; else if (o.wide && v === h - 3) k *= 1 - bev * 0.55;
    return txK(blk.col, k);
  });
  return rows;
}

// =================================================================== palettes
const TX_PAINT = ['#a2462f', '#c2903f', '#687c8a', '#d8d0bc'];
const TX_TRIM = ['#e6dcc6', '#5a3a22', '#e6dcc6', '#5e4630'];
const TX_SHUT = ['#3e5c3c', '#3c4e6a', '#8a3426', '#3a5a40'];
const TX_DOOR = ['#5e3c22', '#2f4a36', '#7a3424', '#48364e'];
const TX_BARE = '#8e7356';

// =================================================================== bardage à clins
function txSiding(p, rand, c, paint, chips = 10) {
  const w = txWP(p);
  const dk = shade(paint, -0.55), md = shade(paint, -0.25), hi = shade(paint, 0.22), gr = shade(paint, -0.1), gl = shade(paint, 0.08);
  const bare = TX_BARE, bareD = shade(TX_BARE, -0.3);
  const nail = shade(paint, -0.42), rust = mix(paint, '#6a3a1e', 0.4);
  for (let b = 0; b < 8; b++) {
    const y = b * 8, bc = shade(paint, (rand() - 0.5) * 0.09), bg = shade(bc, -0.09);
    p.R(0, y, 64, 8, bc);
    // lèvre de la planche du dessus : ombre portée en haut, chant éclairé en bas
    p.R(0, y, 64, 1, dk); p.R(0, y + 1, 64, 1, md); p.R(0, y + 2, 64, 1, shade(bc, -0.07)); p.R(0, y + 7, 64, 1, hi);
    for (let i = 0; i < 5; i++) w.R(rand() * 64, y + 3 + Math.floor(rand() * 4), 4 + rand() * 12, 1, bg);
    for (let i = 0; i < 2; i++) w.R(rand() * 64, y + 3 + Math.floor(rand() * 4), 3 + rand() * 8, 1, gl);
    // abouts de planches
    const jx = Math.floor(rand() * 60) + 2;
    p.R(jx, y + 1, 1, 7, dk); p.R(jx + 1, y + 2, 1, 5, gl);
    // clous sur les montants (une planche sur deux, parfois une coulure de rouille)
    for (const nx of [6, 38]) if ((b + (nx > 20 ? 1 : 0)) % 2 === 0 || rand() < 0.2) {
      p.P(nx, y + 5, nail);
      if (rand() < 0.4) p.P(nx, y + 6, rust);
    }
    p.P(jx - 2, y + 4, nail); p.P(jx + 3, y + 4, nail);
  }
  void gr;
  // peinture écaillée : le bois nu apparaît surtout le long du chant bas des planches (là où l'eau ruisselle)
  for (let i = 0; i < chips; i++) {
    const b = Math.floor(rand() * 8), x = Math.floor(rand() * 64), edge = rand() < 0.7;
    const y = b * 8 + (edge ? 5 : 3 + Math.floor(rand() * 2)), cw = 3 + Math.floor(rand() * (edge ? 9 : 5)), chh = edge ? 2 : 1;
    w.R(x, y, cw, chh, bare);
    if (rand() < 0.5) w.R(x + 1 + Math.floor(rand() * 2), y - 1, Math.max(1, cw - 3), 1, bare);
    w.R(x + 1, y, Math.max(1, cw - 2), 1, bareD);
    if (!edge) w.R(x, y + chh, cw, 1, hi);
  }
  grain(c, 0, 0, 64, 64, rand, 0.04, 0.4);
}

// Volet ouvert à lames
function txShutter(p, x, y, w, h, col) {
  const hi = shade(col, 0.25), dk = shade(col, -0.45);
  txBevel(p, x, y, w, h, col, true, 0.25);
  const mid = y + (h >> 1) - 1;
  for (let yy = y + 2; yy < y + h - 3; yy += 3) {
    if (yy >= mid - 2 && yy <= mid + 2) continue;
    p.R(x + 2, yy, w - 4, 1, hi); p.R(x + 2, yy + 1, w - 4, 1, col); p.R(x + 2, yy + 2, w - 4, 1, dk);
  }
  txBevel(p, x + 1, mid, w - 2, 3, col, true, 0.2);
}

// Fenêtre à petits bois, intérieur sombre (pas de lumière)
function txWindowPane(p, rand, x, y, w, h, frame, curtain) {
  const fd = shade(frame, -0.35);
  p.R(x, y, w, h, '#1a130f');
  p.R(x, y + h - 6, w, 6, '#22180f');
  p.R(x + 3, y + h - 9, 5, 3, '#1e1510');
  if (curtain) {
    const cd = shade(curtain, -0.35);
    p.R(x, y, 3, h, curtain); p.R(x + w - 3, y, 3, h, curtain);
    for (let yy = y; yy < y + h; yy += 2) { p.P(x + 1, yy, cd); p.P(x + w - 2, yy + 1, cd); }
    p.R(x, y, w, 2, curtain); p.R(x, y + 2, w, 1, cd);
    p.R(x + 3, y + (h >> 1) + 2, 1, 2, shade(curtain, 0.25)); p.R(x + w - 4, y + (h >> 1) + 2, 1, 2, shade(curtain, 0.25));
  }
  // reflets de vitre (traits obliques ternes)
  const rf = '#3c3e44', rf2 = '#2c2c32';
  for (const [ox, oy] of [[w * 0.3, h * 0.45], [w * 0.75, h * 0.92]]) {
    p.line(x + ox - 3, y + oy, x + ox + 2, y + oy - 6, rf);
    p.line(x + ox - 1, y + oy, x + ox + 3, y + oy - 5, rf2);
  }
  p.R(x, y, w, 1, '#0a0705'); p.R(x, y, 1, h, '#0a0705');
  const mx = x + (w >> 1) - 1, my = y + (h >> 1) - 1;
  p.R(mx, y, 2, h, frame); p.R(mx + 1, y, 1, h, fd);
  p.R(x, my, w, 2, frame); p.R(x, my + 1, w, 1, fd);
}

// Cadre de fenêtre peint (chambranle, linteau, appui) autour d'une baie x..x+w, y..y+h
function txWindowFrame(p, x, y, w, h, trim, wallShadow) {
  const th = shade(trim, 0.25), td = shade(trim, -0.35);
  p.R(x - 3, y - 3, w + 6, h + 6, trim);
  p.R(x - 3, y - 3, 1, h + 6, th); p.R(x + w + 2, y - 3, 1, h + 6, td);
  p.R(x - 5, y - 7, w + 10, 4, trim); p.R(x - 5, y - 7, w + 10, 1, th); p.R(x - 5, y - 4, w + 10, 1, td);
  p.R(x - 6, y - 8, w + 12, 1, th);
  p.R(x - 5, y + h + 3, w + 10, 2, trim); p.R(x - 5, y + h + 3, w + 10, 1, th);
  p.R(x - 4, y + h + 5, w + 8, 1, wallShadow);
  p.R(x + w + 3, y - 2, 1, h + 5, wallShadow);
}

// =================================================================== briques
const TX_BRICK = [
  { cols: ['#9a3e2a', '#a4462f', '#913a28', '#aa4d35', '#963c2b', '#88372a'], mortar: '#aa9a88', burnt: '#5c2618', band: '#cdb48c' },
  { cols: ['#c49464', '#ba8a5a', '#c99a6a', '#b38352', '#cea474', '#b07e4e'], mortar: '#cfc0a6', burnt: '#8a5a34', band: '#e0d0b0' },
];
function txBrickWall(p, rand, c, v) {
  const B = TX_BRICK[v];
  const rows = txBlocks(c, rand, { y0: 8, y1: 58, ch: 4, lens: () => Array(8).fill(8), off: (r) => (r % 2) * 4 + 1, cols: B.cols, mortar: B.mortar, bev: 0.14, nz: 0.14 });
  for (const row of rows) for (const b of row.blocks) {
    if (rand() < 0.1) { p.R(txMod(b.s), row.y, b.L - 1, 3, B.burnt); p.R(txMod(b.s), row.y, b.L - 1, 1, shade(B.burnt, 0.2)); }
    if (rand() < 0.12) p.P(txMod(b.s + (rand() < 0.5 ? 0 : b.L - 2)), row.y + (rand() < 0.5 ? 0 : 2), B.mortar);
  }
  // bandeau de pierre en haut (corniche à denticules) et soubassement
  const s = B.band, sh = shade(s, 0.2), sd = shade(s, -0.3), sdd = shade(s, -0.5);
  p.R(0, 0, 64, 8, s); p.R(0, 0, 64, 1, sh); p.R(0, 4, 64, 1, sd);
  for (let x = 0; x < 64; x += 4) { p.R(x, 5, 2, 2, s); p.P(x, 5, sh); p.R(x + 2, 5, 2, 2, sdd); }
  p.R(0, 7, 64, 1, sdd);
  for (const jx of [15, 47]) { p.R(jx, 1, 1, 3, sd); p.P(jx + 1, 1, sh); }
  const g = shade(s, -0.12);
  p.R(0, 58, 64, 6, g); p.R(0, 58, 64, 1, shade(g, 0.25)); p.R(0, 59, 64, 1, shade(g, 0.1)); p.R(0, 63, 64, 1, shade(g, -0.3));
  for (const jx of [23, 55]) { p.R(jx, 59, 1, 5, shade(g, -0.35)); p.P(jx + 1, 60, shade(g, 0.15)); }
  grain(c, 0, 0, 64, 8, rand, 0.06, 0.5); grain(c, 0, 58, 64, 6, rand, 0.06, 0.5);
}

// =================================================================== adobe
const TX_ADOBE = [
  { plaster: '#c99a6c', brick: '#9a6644', mortar: '#6e4630', crack: '#6a4430', splash: '#8a5e40' },
  { plaster: '#ded2ba', brick: '#a8764e', mortar: '#7a5034', crack: '#8a7a64', splash: '#b09474' },
];
function txAdobeWall(p, rand, c, v, keepOut = null) {
  const A = TX_ADOBE[v];
  const pl = txRGB(A.plaster), br = txRGB(A.brick), mo = txRGB(A.mortar), sp = txRGB(A.splash);
  const nz = txFbm(rand, [16, 8, 4]), nz2 = txNoise(rand, 2), fine = txFbm(rand, [8, 4, 2]);
  const thr = 0.66 - rand() * 0.04;
  const exposed = (x, y) => {
    if (keepOut && keepOut(txMod(x), y)) return false;
    // plaques compactes (bruit basse fréquence, peu de détail fin) plutôt que des lanières
    return y > 12 && y < 58 && nz(x, y) * 0.9 + fine(x, y) * 0.14 > thr + 0.015;
  };
  const splashTop = (x) => 56 + Math.round(fine(x, 60) * 6);
  txField(c, (x, y) => {
    if (exposed(x, y)) {
      // briques d'adobe 11 x 4 + joint, appareil décalé d'un demi-bloc
      const row = Math.floor(y / 5), u = txMod(x + (row % 2) * 6) % 12, v2 = y % 5;
      let col = (v2 === 4 || u === 11) ? mo : txK(br, 0.9 + ((row * 7 + Math.floor(txMod(x + (row % 2) * 6) / 12) * 5) % 5) * 0.045);
      if (v2 === 0 && u !== 11) col = txK(col, 1.1);
      // trou dans l'enduit, lumière d'en haut à gauche : ombre portée en haut et à gauche, fond éclairé en bas
      if (!exposed(x, y - 1) || !exposed(x, y - 2)) col = txK(col, 0.6);
      else if (!exposed(x - 1, y)) col = txK(col, 0.76);
      else if (!exposed(x, y + 1)) col = txK(col, 1.08);
      return txK(col, 0.95 + nz2(x, y) * 0.1);
    }
    let col = txK(pl, 0.93 + nz(x, y) * 0.1 + (nz2(x, y) - 0.5) * 0.06);
    if (exposed(x, y - 1)) col = txK(col, 1.14);
    else if (exposed(x, y + 1)) col = txK(col, 0.88);
    else if (exposed(x - 1, y)) col = txK(col, 1.07);
    if (y >= splashTop(x)) col = txLerp(col, sp, 0.55 + (nz2(x, y) - 0.5) * 0.3);
    return col;
  });
  const nC = 3 + Math.floor(rand() * 2);
  for (let i = 0; i < nC; i++) {
    const x = Math.floor(rand() * 64), y = 14 + Math.floor(rand() * 34);
    if (keepOut && keepOut(x, y)) continue;
    txCrack(p, rand, x, y, 5 + Math.floor(rand() * 9), A.crack, shade(A.plaster, 0.15));
  }
  grain(c, 0, 0, 64, 64, rand, 0.05, 0.45);
}
// Bouts de vigas qui dépassent du mur (rond de bois + ombre coulée)
function txVigaEnds(p, xs, y, plaster) {
  const sh = shade(plaster, -0.35);
  for (const x of xs) {
    p.R(x - 2, y + 4, 8, 2, sh); p.R(x - 1, y + 6, 6, 1, sh); p.R(x + 4, y - 2, 2, 6, sh);
    p.disc(x, y, 4, '#3e2616');
    p.disc(x, y, 3, '#8a6038');
    p.disc(x, y, 2, '#a87a4a');
    p.P(x, y, '#6a4628'); p.P(x - 1, y - 1, '#c89a64'); p.P(x - 2, y - 2, '#b08452');
  }
}

// =================================================================== pierre de taille
const TX_STONE = [
  { cols: ['#7c7872', '#86827a', '#706c6a', '#8e8a80', '#7a7268', '#747478'], mortar: '#3e3a36' },
  { cols: ['#c6a87a', '#d0b486', '#b89a6c', '#ccae80', '#bea070'], mortar: '#7a6448' },
];
function txStoneWall(p, rand, c, v, y0 = 0, y1 = 64) {
  const S = TX_STONE[v];
  const rows = txBlocks(c, rand, {
    y0, y1, ch: 16, cols: S.cols, mortar: S.mortar, bev: 0.22, nz: 0.22, wide: true,
    lens: (r, rnd) => { const a = 18 + Math.floor(rnd() * 12), b = 16 + Math.floor(rnd() * 10); return [a, b, 64 - a - b]; },
    off: (r, rnd) => Math.floor(rnd() * 64),
  });
  for (let i = 0; i < 40; i++) {
    const x = Math.floor(rand() * 64), y = y0 + Math.floor(rand() * (y1 - y0));
    p.P(x, y, shade(S.cols[0], -0.3)); if (rand() < 0.5) p.P(x + 1, y + 1, shade(S.cols[0], 0.15));
  }
  for (let i = 0; i < 2; i++) txCrack(p, rand, Math.floor(rand() * 64), y0 + 3 + Math.floor(rand() * (y1 - y0 - 12)), 4 + Math.floor(rand() * 5), shade(S.mortar, 0.1), shade(S.cols[1], 0.15));
  grain(c, 0, y0, 64, y1 - y0, rand, 0.07, 0.5);
  return rows;
}

// =================================================================== roche
const TX_STRATA = ['#b85c3c', '#c87048', '#a44c32', '#d68a5a', '#c06446', '#e0a070', '#9a4630'];
// Strates de grès : couches épaisses et de teintes voisines, ondulation lente et irrégulière, passage fondu d'une couche à
// l'autre (des bandes fines, régulières et contrastées faisaient des chevrons au loin)
function txStrata(p, rand, c) {
  const layers = [];
  let prev = txRGB(txPick(rand, TX_STRATA));
  for (let y = -12; y < 80;) {
    const h = 5 + Math.floor(rand() * 9), col = txLerp(prev, txRGB(txPick(rand, TX_STRATA)), 0.65);
    layers.push({ y, h, col, hard: rand() < 0.4 }); prev = col; y += h;
  }
  const ph1 = rand() * 6.283, ph2 = rand() * 6.283;
  const nz = txFbm(rand, [32, 16, 8], [0.55, 0.3, 0.15]), nz2 = txNoise(rand, 4), nz3 = txNoise(rand, 2);
  txField(c, (x, Y) => {
    const yy = Y + 1.2 * Math.sin((x / 64) * 6.283 + ph1) + 0.5 * Math.sin((x / 32) * 6.283 + ph2) + (nz(x, Y) - 0.5) * 8;
    let i = layers.length - 1;
    for (let j = 0; j < layers.length; j++) if (yy >= layers[j].y && yy < layers[j].y + layers[j].h) { i = j; break; }
    const L = layers[i], t = (yy - L.y) / L.h;
    let col = L.col;
    if (t < 0.3 && i > 0) col = txLerp(layers[i - 1].col, col, 0.5 + t / 0.6);
    let k = L.hard ? (t < 0.2 ? 1.06 : t > 0.85 ? 0.91 : 1) : t < 0.25 ? 0.92 : 0.96;
    if (!L.hard && nz3(x * 2, Y) > 0.74) k *= 0.93;
    k *= 0.92 + nz2(x, Y) * 0.16;
    return txK(col, k);
  });
  for (let i = 0; i < 2; i++) txCrack(p, rand, Math.floor(rand() * 64), Math.floor(rand() * 48), 6 + Math.floor(rand() * 10), '#6e3220', '#c87a52');
  const w = txWP(p);
  for (let i = 0; i < 12; i++) { const x = rand() * 64, y = rand() * 64; w.R(x, y, 2, 1, '#e0a878'); w.R(x, y + 1, 2, 1, '#7a3a22'); }
  grain(c, 0, 0, 64, 64, rand, 0.06, 0.5);
}
function txMineRock(p, rand, c, wy = false, pal = ['#6e665e', '#7a7068', '#625a52', '#847a6e', '#6a625c'], n = -5, crackCol = '#1e1a16') {
  const m = txCellMap(rand, n, wy, 7);
  const cols = m.pts.map(() => txRGB(txPick(rand, pal)));
  const nz = txFbm(rand, [8, 4, 2]);
  const cr = txRGB(crackCol), joint = txFbm(rand, [16, 8], [0.6, 0.4]);
  txField(c, (x, y) => {
    const k = y * TEX + x, id = m.id[k], pt = m.pts[id];
    // fissure plus ou moins ouverte selon un bruit : certains blocs se soudent (la roche n'est pas un pavage)
    const open = joint(x, y), cw = open > 0.6 ? 0.5 : open > 0.46 ? 0.9 : 1.3;
    if (m.e[k] < cw) return txK(cr, (open > 0.6 ? 1.7 : 0.95) + nz(x, y) * 0.3);
    // bloc bombé éclairé d'en haut à gauche : facette claire vers la lumière, flanc bas-droit dans l'ombre
    let dx = x + 0.5 - pt[0]; dx -= TEX * Math.round(dx / TEX);
    let dy = y + 0.5 - pt[1]; if (wy) dy -= TEX * Math.round(dy / TEX);
    const d = Math.hypot(dx, dy) + 0.01, rim = clamp(1 - m.e[k] / 6, 0, 1);
    const facet = (-(dx + dy * 1.3) / d) * rim;
    const lit = facet > 0.35 ? 1.1 : facet < -0.35 ? 0.82 : 1;
    return txK(cols[id], txCellLight(m, x, y, 0.8) * lit * (0.9 + nz(x, y) * 0.2));
  });
  // quelques filons de quartz courts et paillettes d'or (pas de long trait qui se répète)
  const w = txWP(p, wy);
  for (let v = 0; v < 2; v++) {
    let x = rand() * 64, y = rand() * 48 + 8;
    const n = 6 + Math.floor(rand() * 7);
    for (let i = 0; i < n; i++) { w.P(x, y, i % 3 ? '#b8b0a2' : '#d8d0c0'); w.P(x, y + 1, '#5e584e'); x += 1; y += rand() < 0.35 ? 1 : rand() < 0.3 ? -1 : 0; }
    w.P(x, y, '#e0c050');
  }
  for (let i = 0; i < 5; i++) { const gx = rand() * 64, gy = rand() * 64; w.P(gx, gy, '#ecd060'); w.P(gx + 1, gy + 1, '#7a5a1a'); }
  grain(c, 0, 0, 64, 64, rand, 0.06, 0.45);
}

// =================================================================== bois
// Planches verticales : fond + veinage, rainure à gauche
function txVBoards(p, rand, c, x0, y0, w, h, col, bw = 8, seam = null) {
  const sd = seam || shade(col, -0.5), hi = shade(col, 0.15);
  p.R(x0, y0, w, h, col);
  for (let x = x0; x < x0 + w; x += bw) {
    const bc = shade(col, (rand() - 0.5) * 0.14), gr = shade(bc, -0.14);
    p.R(x, y0, Math.min(bw, x0 + w - x), h, bc);
    p.R(x, y0, 1, h, sd); p.R(x + 1, y0, 1, h, hi);
    for (let i = 0; i < Math.ceil(h / 6); i++) p.R(x + 2 + Math.floor(rand() * Math.max(1, bw - 3)), y0 + rand() * h, 1, 3 + rand() * 8, gr);
  }
}
// Pièce de bois équarrie (verticale, ou horizontale)
function txTimber(p, rand, x, y, w, h, col = '#7a5634', horizontal = false) {
  const hi = shade(col, 0.22), lo = shade(col, -0.3), dk = shade(col, -0.55), gr = shade(col, -0.15);
  p.R(x, y, w, h, col);
  if (!horizontal) {
    p.R(x, y, 1, h, dk); p.R(x + 1, y, 1, h, hi); p.R(x + w - 2, y, 1, h, lo); p.R(x + w - 1, y, 1, h, dk);
    for (let i = 0; i < h / 3; i++) p.R(x + 2 + Math.floor(rand() * (w - 4)), y + rand() * h, 1, 2 + rand() * 6, gr);
    for (let i = 0; i < 2; i++) { const ky = y + 4 + rand() * (h - 8), kx = x + 2 + Math.floor(rand() * (w - 4)); p.P(kx, ky, dk); p.P(kx, ky - 1, gr); p.P(kx, ky + 1, gr); }
  } else {
    p.R(x, y, w, 1, hi); p.R(x, y + 1, w, 1, shade(col, 0.1)); p.R(x, y + h - 2, w, 1, lo); p.R(x, y + h - 1, w, 1, dk);
    for (let i = 0; i < w / 3; i++) p.R(x + rand() * w, y + 2 + Math.floor(rand() * (h - 4)), 2 + rand() * 6, 1, gr);
  }
}
// Caisse carrée (bois, cadre, entretoise), avec raccord
function txCrate(p, rand, x, y, s, tone) {
  const fr = shade('#b48c58', tone), pn = shade('#98723f', tone), dk = '#2a1c10';
  const w = txWP(p);
  w.R(x, y, s, s, dk);
  for (let yy = y + 1; yy < y + s - 1; yy += 6) { w.R(x + 1, yy, s - 2, 6, pn); w.R(x + 1, yy + 5, s - 2, 1, shade(pn, -0.3)); w.R(x + 1, yy, s - 2, 1, shade(pn, 0.1)); }
  for (let i = 0; i < 8; i++) w.R(x + 4 + rand() * (s - 10), y + 4 + Math.floor(rand() * (s - 8)), 2 + rand() * 5, 1, shade(pn, -0.15));
  for (let k = -1; k <= 2; k++) w.line(x + 4, y + s - 4 + k, x + s - 4, y + 4 + k, k === -1 ? shade(fr, 0.2) : k === 2 ? shade(fr, -0.35) : fr);
  const fw = 4;
  w.R(x + 1, y + 1, s - 2, fw, fr); w.R(x + 1, y + s - 1 - fw, s - 2, fw, fr);
  w.R(x + 1, y + 1, fw, s - 2, fr); w.R(x + s - 1 - fw, y + 1, fw, s - 2, fr);
  w.R(x + 1, y + 1, s - 2, 1, shade(fr, 0.25)); w.R(x + 1, y + 1, 1, s - 2, shade(fr, 0.2));
  w.R(x + 1, y + s - 2, s - 2, 1, shade(fr, -0.35)); w.R(x + s - 2, y + 1, 1, s - 2, shade(fr, -0.3));
  w.R(x + fw + 1, y + fw + 1, s - 2 * fw - 2, 1, shade(pn, -0.45)); w.R(x + fw + 1, y + fw + 1, 1, s - 2 * fw - 2, shade(pn, -0.35));
  for (const [nx, ny] of [[2, 2], [s - 4, 2], [2, s - 4], [s - 4, s - 4]]) { w.P(x + nx + 1, y + ny + 1, '#2a2018'); w.P(x + nx + 2, y + ny + 1, shade(fr, 0.3)); }
}
// Texte des enseignes : la police 3x5 commune, mais N et A sur 4 colonnes (en 3x5 le N se lit « n » et l'A se
// confond avec un R une fois l'ombre portée ajoutée). narrow : A sur 3 colonnes, pour les mots longs.
const TX_GL = { N: ['1001', '1101', '1011', '1001', '1001'], A: ['0110', '1001', '1111', '1001', '1001'] };
const TX_GLN = { N: TX_GL.N, A: ['111', '101', '111', '101', '101'] };
const txGW = (ch, G = TX_GL) => (G[ch] ? G[ch][0].length : 3);
function txTextW(str, s = 1, gap = s, narrow = false) {
  const G = narrow ? TX_GLN : TX_GL;
  let w = 0;
  for (const ch of deaccent(str)) w += txGW(ch, G) * s + gap;
  return w - gap;
}
function txText(R, str, x, y, col, s = 1, gap = s, narrow = false) {
  const G = narrow ? TX_GLN : TX_GL;
  for (const ch of deaccent(str)) {
    if (G[ch]) { G[ch].forEach((row, j) => [...row].forEach((b, i) => { if (b === '1') R(x + i * s, y + j * s, s, s, col); })); }
    else text(R, ch, x, y, col, s);
    x += txGW(ch, G) * s + gap;
  }
}
// Texte au pochoir usé (quelques pixels ternis), avec raccord
function txStencil(p, rand, str, x, y, col, s = 1, wear = 0.12, gap = s) {
  const w = txWP(p), worn = shade(col, -0.3);
  txText((xx, yy, ww, hh) => { for (let j = 0; j < hh; j++) for (let i = 0; i < ww; i++) w.P(xx + i, yy + j, rand() < wear ? worn : col); }, str, x, y, col, s, gap);
}

// =================================================================== affiche WANTED
function txFace(p, x, y, kind) {
  const ink = '#3a2614', fill = '#c9ab7c', mid = '#8a6c48';
  p.ell(x + 6, y + 7, 5, 6, ink); p.ell(x + 6, y + 7, 4, 5, fill);
  p.R(x + 2, y + 6, 1, 3, mid); p.R(x + 10, y + 6, 1, 3, mid);
  p.P(x + 4, y + 6, ink); p.P(x + 8, y + 6, ink); p.P(x + 6, y + 8, mid); p.R(x + 4, y + 5, 2, 1, mid); p.R(x + 7, y + 5, 2, 1, mid);
  p.R(x + 1, y + 13, 11, 2, ink); p.R(x + 5, y + 12, 3, 2, fill);
  if (kind === 0) { // chapeau + moustache
    p.R(x, y + 3, 13, 1, ink); p.R(x + 3, y, 7, 3, ink); p.R(x + 4, y + 2, 5, 1, mid);
    p.R(x + 4, y + 10, 5, 1, ink); p.P(x + 3, y + 11, ink); p.P(x + 9, y + 11, ink);
  } else if (kind === 1) { // chauve, grande barbe
    p.R(x + 4, y + 2, 2, 1, '#e0caa0');
    p.ell(x + 6, y + 11, 4, 3, ink); p.R(x + 5, y + 10, 3, 1, fill); p.ell(x + 6, y + 11, 2, 1, mid);
  } else { // foulard sur le visage + chapeau
    p.R(x - 1, y + 3, 15, 1, ink); p.R(x + 3, y, 7, 3, ink);
    p.R(x + 2, y + 8, 9, 3, mid); p.poly([[x + 3, y + 11], [x + 10, y + 11], [x + 6.5, y + 14]], mid);
    for (let i = 0; i < 3; i++) p.P(x + 4 + i * 2, y + 9, ink);
  }
}
function txPoster(p, rand, x, y, w, h, title, reward, face) {
  const paper = '#e2d1a2', aged = '#c4aa76', ink = '#3a2614';
  p.R(x + 1, y + 1, w, h, '#3a2818');
  p.R(x, y, w, h, paper);
  for (let i = 0; i < w + h; i++) if (rand() < 0.5) p.P(x + Math.floor(rand() * w), y + (rand() < 0.5 ? 0 : h - 1), aged);
  p.R(x, y, 1, h, aged); p.R(x + w - 1, y, 1, h, aged);
  p.P(x + w - 1, y + h - 1, '#3a2818'); p.P(x + w - 2, y + h - 1, aged); p.P(x + w - 1, y + h - 2, aged);
  for (let i = 0; i < 10; i++) p.P(x + 1 + Math.floor(rand() * (w - 2)), y + 1 + Math.floor(rand() * (h - 2)), '#d4c08e');
  txText(p.R, title, x + ((w - txTextW(title, 1, 1, true)) >> 1), y + 2, ink, 1, 1, true);
  p.R(x + 2, y + 8, w - 4, 1, ink);
  let yy = y + 10;
  if (face !== null) { txFace(p, x + ((w - 13) >> 1), yy, face); yy += 16; }
  txText(p.R, reward, x + ((w - txTextW(reward)) >> 1), yy, '#7a1e12');
  for (let ly = yy + 7; ly < y + h - 2; ly += 2) p.R(x + 3, ly, w - 6 - Math.floor(rand() * 5), 1, '#9a8460');
  p.P(x + (w >> 1), y + 1, '#5a5a5e'); p.P(x + (w >> 1), y, '#9a9aa0');
}

// =================================================================== intérieurs : fenêtres vues du dedans, comptoirs, arrière-bars
// Calque : draw(q, t) sur un canvas transparent, posé ensuite sur c. sh = [dx, dy, k] : ombre portée sur ce qui est dessous.
function txLayer(c, draw, sh = null) {
  const t = canvas(TEX, TEX);
  draw(pen(t), t);
  if (sh) {
    const [dx, dy, k] = sh, a = t.getContext('2d').getImageData(0, 0, TEX, TEX).data;
    const on = (x, y) => x >= 0 && y >= 0 && x < TEX && y < TEX && a[(y * TEX + x) * 4 + 3] >= 128;
    txField(c, (x, y, col) => (!on(x, y) && on(x - dx, y - dy) ? [col[0] * k, col[1] * k, col[2] * Math.min(1, k + 0.1)] : null));
  }
  c.getContext('2d').drawImage(t, 0, 0);
}
// Lettres 3x5 étirées 2x en hauteur (murs bas : 64 lignes écrasées sur une demi-unité)
const txTall = (R, y0) => (x, y, w, h, col) => R(x, y0 + (y - y0) * 2, w, h * 2, col);

// Plein jour vu à travers une vitre (x0, y0, w, h) : ciel, fausses façades d'en face en silhouette dans la brume, rue au
// soleil. hz : ligne d'horizon (depuis y0) ; flip : profil des toits retourné.
function txDaylight(c, x0, y0, w, h, hz = Math.round(h * 0.6), flip = false) {
  const top = txRGB('#94b8d2'), low = txRGB('#c6dae4'), haze = txRGB('#e6d8b8'), sand = txRGB('#d6b888'), sil = txRGB('#7c8896');
  const roof = (u) => {
    if (flip) u = 1 - u;
    if (u < 0.05) return 0.28;
    if (u < 0.36) return u > 0.12 && u < 0.29 ? 0.74 : 0.62; // fausse façade à gradin
    if (u < 0.42) return 0.3;
    if (u < 0.62) return 0.3 + 0.2 * (1 - Math.abs(u - 0.52) / 0.1); // toit à deux pans
    if (u < 0.67) return 0.22;
    if (u < 0.96) return 0.5;
    return 0.22;
  };
  txField(c, (x, y) => {
    const u = (x - x0 + 0.5) / w, j = y - y0;
    if (j >= hz) {
      if (j === hz) return txK(haze, 0.86); // ombre des auvents d'en face
      return txLerp(haze, sand, clamp(((j - hz) / Math.max(1, h - hz - 1)) * 1.2, 0, 1));
    }
    const col = txLerp(top, low, Math.pow(j / hz, 1.3)), rt = hz - Math.round(roof(u) * hz);
    return j >= rt ? txLerp(col, sil, j === rt ? 0.58 : 0.44) : col;
  }, x0, y0, w, h);
}
// Reflet oblique sur une vitre
function txGlint(p, x, y, n) {
  for (let k = 0; k < n; k++) p.P(x + k, y - k, '#f4f8f6');
  for (let k = 0; k < n - 2; k++) p.P(x + 2 + k, y - k, '#dce8ee');
}
// Ombre du dormant sur le haut et la gauche de la vitre
function txGlassShade(c, x0, y0, w, h) {
  txField(c, (x, y, col) => (x === x0 || y === y0 ? txK(col, 0.78) : x === x0 + 1 || y === y0 + 1 ? txK(col, 0.9) : null), x0, y0, w, h);
}
// Fenêtre dans un mur épais (adobe) vue du dedans : ébrasement d'enduit de d px (haut/gauche éclairés, bas/droite à
// l'ombre), châssis peint (frame = [couleur, arête claire]) en 2 x 2, plein jour, grille de fer en ombre chinoise, pot.
function txRevealWin(p, c, rand, o) {
  const { x0, y0, x1, y1, d } = o, lit = txRGB(o.lit), dark = txRGB(o.dark), nz = txNoise(rand, 4), nz2 = txNoise(rand, 2);
  txField(c, (x, y) => {
    const l = x0 - x, r = x - x1, t = y0 - y, b = y - y1, m = Math.max(l, r, t, b);
    if (m <= 0 || m > d) return null;
    if ((l === d || r === d) && (t === d || b === d)) return null; // arêtes adoucies
    const top = t === m, bot = !top && b === m, left = !top && !bot && l === m;
    const k = (m === d ? 1.05 : 1 - (d - m) * 0.03) * (0.96 + nz(x, y) * 0.06 + (nz2(x, y) - 0.5) * 0.04);
    return txK(top || left ? lit : dark, k);
  }, x0 - d, y0 - d, x1 - x0 + 1 + 2 * d, y1 - y0 + 1 + 2 * d);
  const gx0 = x0 + 2, gy0 = y0 + 2, gw = x1 - x0 - 3, gh = y1 - y0 - 3;
  txDaylight(c, gx0, gy0, gw, gh, o.hz ?? Math.round(gh * 0.6), o.flip);
  txGlassShade(c, gx0, gy0, gw, gh);
  const mx = (x0 + x1) >> 1, my = (y0 + y1) >> 1;
  if (o.grille) {
    // grille de l'autre côté de la vitre : barreaux espacés, une traverse, en ombre chinoise sur le ciel
    const g = '#3a3230', gk = '#2a2422', ty = gy0 + Math.round(gh * 0.3);
    for (let x = gx0 + 3; x < gx0 + gw - 1; x += 5) { p.R(x, gy0, 1, gh, g); p.P(x, ty - 1, gk); p.P(x, ty + 1, gk); }
    p.R(gx0, ty, gw, 1, gk);
  }
  const [fr, frL] = o.frame, frD = shade(fr, -0.35), W = x1 - x0 + 1, H = y1 - y0 + 1;
  p.R(x0, y0, W, 2, fr); p.R(x0, y1 - 1, W, 2, fr); p.R(x0, y0, 2, H, fr); p.R(x1 - 1, y0, 2, H, fr);
  p.R(mx, y0, 2, H, fr); p.R(x0, my, W, 2, fr);
  p.R(x0, y0, W, 1, frL); p.R(x0, y0, 1, H, frL); p.R(mx, y0 + 1, 1, H - 2, frL); p.R(x0 + 1, my, W - 2, 1, frL);
  p.R(x0 + 1, y1, W - 1, 1, frD); p.R(x1, y0 + 1, 1, H - 1, frD); p.R(x0 + 2, my + 1, W - 3, 1, frD);
  p.P(mx + 2, my - 1, '#c8a040');
  txGlint(p, gx0 + 1, my - 2, 4); txGlint(p, mx + 3, y1 - 3, 3);
  if (o.pot != null) txLayer(c, (q) => {
    const px = o.pot, by = y1 + d - 1;
    q.R(px, by - 4, 5, 5, '#b0583a'); q.R(px - 1, by - 5, 7, 2, '#c4683e'); q.R(px - 1, by - 5, 7, 1, '#d88a5a');
    q.P(px, by - 3, '#c87050'); q.R(px + 4, by - 3, 1, 3, '#8a4028'); q.R(px, by, 5, 1, '#7a3420');
    q.R(px + 1, by - 11, 3, 6, '#3a7a3a'); q.R(px + 1, by - 11, 1, 6, '#6aa85a'); q.P(px + 2, by - 12, '#3a7a3a');
    q.R(px - 1, by - 8, 2, 1, '#3a7a3a'); q.R(px - 1, by - 10, 1, 2, '#5a9a4a');
    q.R(px + 4, by - 9, 2, 1, '#2e6a2e'); q.R(px + 5, by - 11, 1, 2, '#2e6a2e');
    q.P(px + 2, by - 13, '#e84050'); q.P(px + 3, by - 9, '#9ac080'); q.P(px + 1, by - 7, '#9ac080');
  }, [1, 1, 0.72]);
}

// Carreaux de Talavera (motifs 7x7 du bandeau de cantinaIn)
const TX_TALAVERA = {
  A: ['B..Y..B', '.B.Y.B.', '..BBB..', 'YYBWBYY', '..BBB..', '.B.Y.B.', 'B..Y..B'],
  B: ['..B.B..', '.BB.BB.', 'BB.Y.BB', '..YGY..', 'BB.Y.BB', '.BB.BB.', '..B.B..'],
  col: { B: '#2a4aa8', Y: '#e8b030', G: '#2a8a5a', W: '#ffffff' },
};

// Fusil posé à l'horizontale (crosse à gauche en x, axe du canon sur la ligne y) : 0 Winchester, 1 Sharps, 2 fusil double
function txRifle(q, x, y, kind) {
  const wd = kind === 2 ? '#6a3a1c' : '#7a4222', wl = shade(wd, 0.3), wk = shade(wd, -0.4);
  const sk = '#1a1a1e', rc = kind === 0 ? ['#c8a040', '#f0d070', '#7a5a1c'] : ['#5a5a62', '#9a9aa4', '#2a2a30'];
  const len = kind === 2 ? 46 : kind === 1 ? 53 : 50;
  for (let i = 0; i < 13; i++) {
    const t = i / 12, top = y - 2 + Math.round(t), bot = y + 3 - Math.round(t * 2);
    q.R(x + i, top, 1, bot - top + 1, wd); q.P(x + i, top, wl); q.P(x + i, bot, wk);
  }
  q.R(x - 1, y - 2, 1, 6, '#2a1a10');
  q.R(x + 13, y - 1, 3, 2, wd); q.R(x + 13, y - 1, 3, 1, wl);
  q.R(x + 16, y - 1, 7, 3, rc[0]); q.R(x + 16, y - 1, 7, 1, rc[1]); q.R(x + 16, y + 1, 7, 1, rc[2]);
  if (kind === 0) { q.R(x + 15, y + 2, 5, 1, sk); q.R(x + 15, y + 3, 1, 2, sk); q.R(x + 15, y + 5, 5, 1, sk); q.R(x + 19, y + 3, 1, 2, sk); }
  else { q.R(x + 17, y + 2, 1, 2, sk); q.R(x + 17, y + 3, 4, 1, sk); q.P(x + 19, y + 2, sk); }
  q.P(x + 17, y - 2, sk); if (kind === 2) q.P(x + 19, y - 2, sk);
  const bx = x + 23, bl = len - 23;
  if (kind === 2) { q.R(bx, y - 1, bl, 1, '#9a9aa4'); q.R(bx, y, bl, 1, '#4a4a52'); q.R(bx, y + 1, 8, 1, wd); q.R(bx, y + 1, 8, 1, wk); }
  else {
    q.R(bx, y - 1, bl, 1, '#8a8a96'); q.R(bx, y, bl, 1, '#3a3a42');
    const fl = kind === 1 ? 21 : 11;
    q.R(bx, y, fl, 2, wd); q.R(bx, y, fl, 1, wl); q.R(bx, y + 1, fl, 1, wk);
    if (kind === 1) for (const k of [8, 18]) q.R(bx + k, y - 1, 1, 3, '#6a6a74');
  }
  q.P(x + len - 1, y - 2, sk); q.P(x + len - 1, y - 1, '#5a5a62');
}

// --- arrière-bar du saloon (v0) : miroir, bouteilles, comptoir de marbre, placard
function txBackbarSaloon(p, rand, c) {
  const wd = '#4a2412', wh = shade(wd, 0.3), wdk = shade(wd, -0.45);
  p.R(0, 0, 64, 64, wd);
  grain(c, 0, 0, 64, 64, rand, 0.06, 0.5);
  p.R(0, 0, 64, 4, shade(wd, 0.1)); p.R(0, 0, 64, 1, wh); p.R(0, 3, 64, 1, wdk);
  for (let x = 1; x < 64; x += 3) p.P(x, 2, '#c8a040');
  // étagères et bouteilles (à cheval sur le raccord)
  const w = txWP(p);
  const BOT = [['#8a4a10', '#c87a28'], ['#2a5a2a', '#5a9a4a'], ['#a8b8b0', '#e0f0e8'], ['#2a1a18', '#5a4038'], ['#5a1020', '#9a3040'], ['#6a3a0a', '#b06a20']];
  for (const y of [17, 31, 44]) {
    for (let x = 49; x < 78;) {
      const bw = 3 + Math.floor(rand() * 2), bh = 7 + Math.floor(rand() * 4), [col, hi] = txPick(rand, BOT);
      if (x + bw > 78) break;
      w.R(x, y - bh + 3, bw, bh - 3, col); w.R(x, y - bh + 3, 1, bh - 3, hi); w.R(x + bw - 1, y - bh + 3, 1, bh - 3, shade(col, -0.35));
      w.R(x + (bw >> 1), y - bh, 1, 3, col); w.P(x + (bw >> 1), y - bh - 1, rand() < 0.5 ? '#c8a878' : '#8a2a1a');
      if (rand() < 0.7) w.R(x + 1, y - 5, bw - 2, 2, '#e8dcb0');
      x += bw + 1 + (rand() < 0.3 ? 1 : 0);
    }
    if (y < 44) { w.R(48, y, 32, 2, '#6a3a1c'); w.R(48, y, 32, 1, '#9a5a2c'); w.R(48, y + 2, 32, 1, wdk); }
  }
  for (const x of [16, 46]) { p.R(x, 4, 2, 40, wd); p.R(x, 4, 1, 40, wh); }
  // miroir encadré
  p.R(18, 5, 28, 39, '#2a1408');
  p.R(19, 6, 26, 37, '#c8a040'); p.R(19, 6, 26, 1, '#f0d070'); p.R(19, 42, 26, 1, '#7a5a1c'); p.R(44, 6, 1, 37, '#7a5a1c');
  p.R(21, 8, 22, 33, '#3c4a50');
  txField(c, (x, y) => {
    const d = (x - 21) + (y - 8) * 0.6;
    if (d > 4 && d < 8) return '#5a6a72';
    if (d > 13 && d < 15) return '#4e5e66';
    if (y > 33) return '#303c42';
    return null;
  }, 21, 8, 22, 33);
  p.R(28, 3, 8, 3, '#c8a040'); p.R(30, 1, 4, 2, '#c8a040'); p.P(31, 1, '#f0d070');
  // comptoir de marbre et verres
  p.R(0, 44, 64, 3, '#d8d0c0'); p.R(0, 44, 64, 1, '#f0ece0'); p.R(0, 46, 64, 1, '#8a8478');
  for (const x of [22, 27, 38]) { p.R(x, 40, 3, 4, '#9ab0b0'); p.P(x, 40, '#e0f0f0'); p.R(x, 43, 3, 1, '#c0d0d0'); }
  p.R(32, 36, 3, 8, '#7a3a08'); p.R(32, 36, 1, 8, '#c87a28'); p.R(33, 33, 1, 3, '#7a3a08'); p.P(33, 32, '#c8a878'); p.R(32, 39, 3, 2, '#e8dcb0');
  p.R(0, 47, 64, 17, wd);
  for (const x of [2, 18, 34, 50]) { txBevel(p, x, 49, 13, 13, shade(wd, -0.1), false, 0.4); txBevel(p, x + 2, 51, 9, 9, shade(wd, 0.06), true, 0.25); p.P(x + 10, 55, '#c8a040'); }
  p.R(0, 62, 64, 2, '#1e0e06');
}
// v2 : la même boiserie (bords identiques à v0), au milieu une horloge régulateur et une caisse enregistreuse en laiton
function txBackbarRegister(p, rand, c) {
  const wd = '#4a2412';
  p.R(18, 5, 28, 39, wd); grain(c, 18, 5, 28, 39, rand, 0.06, 0.5);
  txBevel(p, 19, 6, 26, 37, shade(wd, -0.12), false, 0.4);
  txBevel(p, 21, 8, 22, 33, shade(wd, 0.04), true, 0.22);
  for (let i = 0; i < 8; i++) p.R(23 + rand() * 18, 10 + rand() * 28, 1, 3 + rand() * 6, shade(wd, -0.12));
  const br = '#c8a040', brL = '#f0d070', brD = '#7a5a1c';
  txLayer(c, (q) => {
    const cs = '#3a1a0a', cl = shade(cs, 0.4), cd = shade(cs, -0.45);
    q.poly([[24, 10], [32, 5], [40, 10]], cs); q.line(25, 9, 31, 6, cl); q.line(33, 6, 39, 9, cd); q.P(32, 4, brL); q.P(32, 5, br);
    q.R(25, 10, 15, 18, cs); q.R(25, 10, 1, 18, cl); q.R(39, 10, 1, 18, cd); q.R(25, 10, 15, 1, cl);
    q.disc(32, 15, 6, brD); q.disc(32, 15, 5, br); q.P(28, 12, brL); q.P(29, 11, brL); q.P(27, 13, brL);
    q.disc(32, 15, 4, '#ece4cc'); q.P(30, 13, '#fffaf0');
    for (const [x, y] of [[36, 15], [32, 19], [28, 15]]) q.P(x, y, '#a89878');
    q.R(32, 11, 1, 4, '#1a1008'); q.P(33, 16, '#1a1008'); q.P(34, 17, '#1a1008'); // midi passé de 20 : grande aiguille en haut, petite vers 4 h
    q.P(32, 15, '#7a5a1c');
    q.R(28, 22, 9, 5, '#1a120c'); q.R(28, 22, 9, 1, cd); q.line(29, 26, 32, 23, '#3a3430');
    q.R(32, 22, 1, 3, br); q.disc(32, 25, 1, br); q.P(31, 24, brL);
    q.R(26, 28, 13, 1, cs); q.R(28, 29, 9, 1, cs); q.P(32, 30, br);
  }, [1, 1, 0.55]);
  txLayer(c, (q) => {
    const B = '#b88a30', BH = '#dcb450', BK = '#4a3410';
    q.R(27, 29, 11, 5, B); q.R(27, 29, 11, 1, brL); q.R(28, 30, 9, 3, '#ece4cc'); q.R(27, 33, 11, 1, brD);
    for (let x = 29; x < 36; x += 2) q.P(x, 31, '#2a1a08');
    q.R(31, 28, 3, 1, B); q.P(32, 27, brL);
    for (let y = 34; y < 44; y++) {
      const e = Math.round((y - 34) / 5), xl = 24 - e, xr = 40 + e;
      q.R(xl, y, xr - xl + 1, 1, B); q.P(xl, y, brL); q.P(xl + 1, y, BH); q.P(xr, y, brD);
    }
    q.R(25, 34, 15, 1, BH);
    for (let j = 0; j < 3; j++) for (let x = 26 + j; x < 39 - j; x += 2) { q.P(x, 35 + j * 2, '#ece4cc'); q.P(x, 36 + j * 2, BK); }
    for (let x = 23; x < 42; x += 2) { q.P(x, 41, BH); q.P(x + 1, 41, brD); }
    q.R(23, 42, 19, 2, brD); q.R(23, 42, 19, 1, B); q.R(30, 43, 5, 1, brL);
    q.R(42, 36, 1, 4, BK); q.R(43, 35, 2, 1, BK); q.P(44, 34, '#2a1a08');
    q.R(19, 42, 3, 2, B); q.P(20, 41, brL); q.P(21, 43, brD); // sonnette de comptoir
  }, [1, 1, 0.55]);
}

// --- arrière-bar de la cantina (v1) : bois peint ocre et turquoise, tequila et mezcal, retablo de la Guadalupe
const TX_OCH = '#b07a3a', TX_TQ = '#24827e';
function txBackbarCantina(p, rand, c) {
  const och = TX_OCH, tq = TX_TQ, tqL = shade(tq, 0.32), tqD = shade(tq, -0.45), sh = '#3a2410';
  txVBoards(p, rand, c, 0, 0, 64, 64, och, 8, shade(och, -0.42));
  grain(c, 0, 0, 64, 64, rand, 0.05, 0.45);
  const w = txWP(p);
  for (let i = 0; i < 8; i++) { const x = rand() * 64, y = 6 + rand() * 36; w.R(x, y, 2 + rand() * 3, 1, '#7a5030'); }
  p.R(0, 0, 64, 4, tq); p.R(0, 0, 64, 1, tqL); p.R(0, 3, 64, 1, tqD); p.R(0, 4, 64, 1, sh);
  for (let x = 0; x < 64; x += 4) { p.P(x + 1, 2, '#e8b030'); p.P(x + 3, 1, '#c83a2a'); }
  const BOT = [['#c4d2ca', '#f0faf4', '#d8c070'], ['#a8601a', '#e09040'], ['#2a6a3a', '#5aa060'], ['#7a6a44', '#b0a070'], ['#c4d2ca', '#f0faf4', '#ece4c0'], ['#6a2a10', '#a8582a']];
  for (const y of [17, 31, 44]) {
    for (let x = 49; x < 78;) {
      const squat = rand() < 0.3, bw = squat ? 4 : 3 + Math.floor(rand() * 2), bh = squat ? 7 : 8 + Math.floor(rand() * 4), [col, hi, liq] = txPick(rand, BOT);
      if (x + bw > 78) break;
      const top = y - bh + 3;
      w.R(x, top, bw, bh - 3, col);
      if (liq) w.R(x + 1, top + 2, bw - 2, bh - 5, liq);
      w.R(x, top, 1, bh - 3, hi); w.R(x + bw - 1, top, 1, bh - 3, shade(col, -0.35));
      w.R(x + (bw >> 1), y - bh, 1, 3, col); w.P(x + (bw >> 1), y - bh - 1, rand() < 0.5 ? '#a42418' : '#2a1a10');
      if (rand() < 0.75) w.R(x + 1, y - 5, bw - 1, 2, txPick(rand, ['#e8dcb0', '#e8b030', '#c83020', '#f0e8d0']));
      x += bw + 1 + (rand() < 0.3 ? 1 : 0);
    }
    if (y < 44) { w.R(48, y, 32, 2, tq); w.R(48, y, 32, 1, tqL); w.R(48, y + 2, 32, 1, sh); }
  }
  for (const x of [16, 46]) { p.R(x, 4, 2, 40, tq); p.R(x, 4, 1, 40, tqL); }
  // retablo : la Guadalupe dans un cadre de fer-blanc poinçonné, fleurs de papier aux coins, veladoras dessous
  txField(c, (x, y, col) => { const g = Math.exp(-(((x - 31.5) / 9) ** 2 + ((y - 34) / 7) ** 2)); return g < 0.03 ? null : [col[0] * (1 + 0.3 * g), col[1] * (1 + 0.2 * g), col[2] * (1 + 0.05 * g)]; }, 18, 24, 28, 20);
  txLayer(c, (q) => {
    const fx = 23, fy = 6, fw = 18, fh = 24;
    q.R(fx, fy, fw, fh, '#8a7a50'); q.R(fx + 1, fy + 1, fw - 2, fh - 2, '#c8b878'); q.R(fx + 1, fy + 1, fw - 2, 1, '#ece0a8'); q.R(fx + 1, fy + 1, 1, fh - 2, '#ece0a8');
    for (let x = fx + 2; x < fx + fw - 2; x += 2) { q.P(x, fy + 2, '#8a7a50'); q.P(x, fy + fh - 3, '#8a7a50'); }
    for (let y = fy + 4; y < fy + fh - 3; y += 2) { q.P(fx + 2, y, '#8a7a50'); q.P(fx + fw - 3, y, '#8a7a50'); }
    q.R(fx + 3, fy + 3, fw - 6, fh - 6, '#5a1812');
    q.ell(32, 18, 5, 8, '#d87a20'); q.ell(32, 18, 4, 7, '#e8b040');
    for (let k = 0; k < 8; k++) { const a = (k / 8) * 6.283; q.P(32 + Math.round(Math.cos(a) * 5), 18 + Math.round(Math.sin(a) * 8), '#f8d878'); }
    q.poly([[32, 11], [36, 15], [36, 24], [32, 26], [28, 24], [28, 15]], '#1e6a5a');
    q.R(31, 15, 2, 9, '#c86a6a'); q.P(31, 16, '#e08a8a');
    q.R(31, 12, 2, 2, '#c8946a'); q.P(31, 12, '#e0b08a'); q.R(31, 17, 2, 1, '#c8946a');
    for (const [x, y] of [[29, 16], [35, 18], [29, 21], [35, 22], [34, 15]]) q.P(x, y, '#f0d060');
    q.R(29, 26, 7, 1, '#2a2420'); q.P(28, 25, '#2a2420'); q.P(36, 25, '#2a2420'); q.R(31, 27, 3, 1, '#a42418');
    for (const [x, y, cl] of [[fx, fy, '#e86a9a'], [fx + fw - 1, fy, '#e8b030'], [fx, fy + fh - 1, '#e8b030'], [fx + fw - 1, fy + fh - 1, '#e86a9a']]) {
      q.disc(x, y, 2, cl); q.P(x, y, '#fff0c0'); q.P(x - 1, y - 1, shade(cl, 0.3));
    }
    q.R(22, 37, 20, 2, tq); q.R(22, 37, 20, 1, tqL); q.P(23, 39, tqD); q.P(40, 39, tqD);
    for (const [x, cl] of [[25, '#c82a20'], [30, '#2a8a4a'], [35, '#c82a20']]) {
      q.R(x, 33, 3, 4, cl); q.R(x, 33, 1, 4, shade(cl, 0.35)); q.R(x, 33, 3, 1, '#f0e8d0');
      q.P(x + 1, 32, '#ffe080'); q.P(x + 1, 31, '#fff6c0');
    }
  }, [1, 1, 0.6]);
  p.R(0, 44, 64, 3, tq); p.R(0, 44, 64, 1, tqL); p.R(0, 46, 64, 1, tqD);
  p.R(0, 47, 64, 15, och); grain(c, 0, 47, 64, 15, rand, 0.05, 0.5);
  for (const x of [2, 18, 34, 50]) {
    txBevel(p, x, 49, 13, 13, tq, false, 0.35); txBevel(p, x + 2, 51, 9, 9, och, true, 0.25);
    p.P(x + 6, 55, '#c83a2a'); p.P(x + 5, 55, '#3a8a4a'); p.P(x + 7, 55, '#3a8a4a'); p.P(x + 6, 54, '#e8b030'); p.P(x + 6, 56, '#3a8a4a');
    p.P(x + 10, 55, '#2a1a10');
  }
  p.R(0, 62, 64, 2, sh);
}
// v3 : la même structure que v1 (bords identiques), au milieu une guitare, une ristra, des cántaros et une pile de verres
function txBackbarGuitar(p, rand, c) {
  const och = TX_OCH, tq = TX_TQ, tqL = shade(tq, 0.32);
  // planches du fond refaites sur un canvas à part puis recopiées (le veinage de txVBoards déborde de sa zone)
  const t = canvas(TEX, TEX);
  txVBoards(pen(t), rand, t, 16, 0, 32, 64, och, 8, shade(och, -0.42));
  grain(t, 16, 0, 32, 64, rand, 0.05, 0.45);
  c.getContext('2d').drawImage(t, 16, 5, 32, 39, 16, 5, 32, 39);
  for (const x of [16, 46]) { p.R(x, 5, 2, 39, tq); p.R(x, 5, 1, 39, tqL); }
  txLayer(c, (q) => {
    // guitare pendue à une cheville
    const gw = '#c8883a', gl = '#e0a858', gd = '#8a5424', bd = '#4a2810';
    q.P(26, 5, '#2a1a10');
    q.R(25, 6, 3, 4, '#3a2010'); q.P(25, 6, '#5a3820'); q.P(24, 7, '#d8d0c0'); q.P(28, 7, '#d8d0c0'); q.P(24, 9, '#d8d0c0'); q.P(28, 9, '#d8d0c0');
    q.R(26, 10, 2, 13, '#4a2a14'); q.R(26, 10, 1, 13, '#6a4024');
    q.ell(26.5, 26, 5, 4, bd); q.ell(26.5, 32, 6, 4, bd);
    q.ell(26.5, 26, 4, 3, gw); q.ell(26.5, 32, 5, 3, gw);
    q.R(22, 25, 2, 6, gl); q.P(23, 24, gl); q.R(30, 29, 1, 5, gd); q.R(31, 31, 1, 3, gd);
    q.disc(26.5, 27, 1, '#1a0e06'); q.R(25, 27, 4, 1, '#1a0e06');
    q.R(24, 33, 6, 1, '#3a2010');
    q.R(27, 10, 1, 23, '#ece4cc');
    // ristra de piments
    q.P(38, 5, '#2a2420'); q.R(38, 6, 1, 3, '#a89060');
    for (let y = 9; y < 28; y += 2) for (const dx of [-2, 0, 2]) {
      const xx = 38 + dx + ((y >> 1) % 2 ? 1 : 0) - 1, col = txPick(rand, ['#b4201a', '#9a1a14', '#c83020', '#8a1810']);
      q.R(xx, y, 2, 3, col); q.P(xx, y, shade(col, 0.35)); q.P(xx + 1, y + 2, '#5a0e0a');
    }
    q.R(37, 28, 1, 2, '#3a6a2a');
    // pile de verres (3 + 2 + 1)
    for (const [x, y] of [[19, 41], [22, 41], [25, 41], [20.5, 38], [23.5, 38], [22, 35]]) {
      q.R(x, y, 2, 3, '#9ab0b0'); q.P(x, y, '#e8f4f4'); q.P(x + 1, y + 2, '#c0d4d4');
    }
    // cántaros de terre cuite
    for (const [cx, hh] of [[35, 11], [42, 8]]) {
      const top = 44 - hh, my = top + Math.round(hh * 0.6);
      q.ell(cx, my, 3, Math.min(3, 43 - my), '#b0583a');
      q.R(cx - 1, top + 1, 3, my - top - 1, '#b0583a'); q.R(cx - 2, top, 5, 1, '#c4683e'); q.P(cx - 2, top, '#e09a6a');
      q.R(cx - 3, my - 1, 7, 1, '#ece4d0'); q.R(cx - 3, my + 1, 7, 1, '#2a4aa8');
      q.R(cx - 3, my - 3, 1, 2, '#d07a50'); q.R(cx - 2, top + 1, 1, 2, '#d07a50');
      q.R(cx + 3, my, 1, 2, '#7a3420'); q.R(cx - 2, 43, 5, 1, '#7a3420');
    }
  }, [1, 1, 0.6]);
}

// --- devants de comptoirs (murs bas, 0.48 à 0.55 de haut : tout est dessiné deux fois plus haut qu'il ne paraît)
// v1 cantina : dessus de bois, devant en carreaux de Talavera, pied sombre
function txBarCantina(p, rand, c) {
  const wd = '#7a4a26';
  p.R(0, 0, 64, 2, '#9a6436'); p.R(0, 2, 64, 1, '#c08a52'); p.R(0, 3, 64, 2, wd); p.R(0, 5, 64, 1, '#2e180a');
  for (let i = 0; i < 6; i++) p.R(rand() * 60, Math.floor(rand() * 2) * 3 + (rand() < 0.5 ? 0 : 1), 3 + rand() * 6, 1, shade(wd, -0.12));
  p.R(0, 6, 64, 2, '#b0583a'); p.R(0, 6, 64, 1, '#c87050');
  p.R(0, 8, 64, 48, '#a8a090');
  const T = TX_TALAVERA;
  for (let ty = 0; ty < 3; ty++) for (let tx = 0; tx < 8; tx++) {
    const x = tx * 8, y = 8 + ty * 16, pat = (tx + ty) % 2 ? T.B : T.A;
    p.R(x, y, 7, 14, '#ece6d6');
    pat.forEach((row, j) => [...row].forEach((ch, i) => { if (T.col[ch]) p.R(x + i, y + j * 2, 1, 2, T.col[ch]); }));
    p.P(x, y, '#fffaf0'); p.R(x, y + 13, 7, 1, '#d8d0c0');
  }
  for (let i = 0; i < 4; i++) {
    const x = Math.floor(rand() * 8) * 8 + Math.floor(rand() * 5), y = 8 + Math.floor(rand() * 3) * 16 + Math.floor(rand() * 11);
    p.R(x, y, 2, 2, '#c8b8a0'); p.R(x, y + 2, 2, 1, '#8a7a68');
  }
  grain(c, 0, 8, 64, 48, rand, 0.03, 0.3);
  p.R(0, 56, 64, 8, '#4a2a18'); p.R(0, 56, 64, 1, '#b0583a'); p.R(0, 57, 64, 1, '#6a3a22'); p.R(0, 63, 64, 1, '#1e100a');
  grain(c, 0, 57, 64, 7, rand, 0.06, 0.5);
}
// v2 bureau du shérif : deux caissons de tiroirs à poignées de laiton, niche pour les jambes dans l'ombre
function txBarDesk(p, rand, c) {
  const wd = '#6a4022', wl = shade(wd, 0.22), wk = shade(wd, -0.35), wdd = shade(wd, -0.6);
  p.R(0, 0, 64, 64, wd);
  grain(c, 0, 0, 64, 64, rand, 0.06, 0.5);
  p.R(0, 0, 64, 2, '#8a5a32'); p.R(0, 2, 64, 1, '#b07a48'); p.R(0, 3, 64, 2, shade(wd, 0.06)); p.R(0, 5, 64, 1, wdd);
  for (let i = 0; i < 5; i++) p.R(rand() * 60, Math.floor(rand() * 2), 4 + rand() * 8, 1, '#7a4e2a');
  const kx0 = 21, kx1 = 42;
  txField(c, (x, y) => txK(txRGB('#3a2210'), y < 20 ? 0.45 : 0.85 - ((y - 20) / 38) * 0.45), kx0, 18, kx1 - kx0 + 1, 40);
  p.R(kx0, 18, 1, 40, '#120a04');
  txBevel(p, kx0, 7, kx1 - kx0 + 1, 10, shade(wd, 0.02), true, 0.25);
  p.R(29, 10, 6, 2, '#a07a28'); p.R(29, 10, 6, 1, '#e0b850'); p.R(30, 12, 4, 2, '#c8a040'); p.P(30, 12, '#f0d070'); p.R(30, 14, 4, 1, wdd);
  for (const x0 of [1, 43]) {
    p.R(x0, 6, 1, 52, wl); p.R(x0 + 19, 6, 1, 52, wk);
    for (let k = 0; k < 3; k++) {
      const y = 7 + k * 17;
      txBevel(p, x0 + 2, y, 16, 16, shade(wd, -0.08), false, 0.35);
      txBevel(p, x0 + 3, y + 1, 14, 14, shade(wd, 0.05), true, 0.22);
      // poignée coquille en laiton (plaque, puis coupelle)
      const px = x0 + 7, py = y + 6;
      p.R(px, py, 6, 2, '#a07a28'); p.R(px, py, 6, 1, '#e0b850');
      p.R(px + 1, py + 2, 4, 2, '#c8a040'); p.P(px + 1, py + 2, '#f0d070'); p.R(px + 1, py + 4, 4, 1, '#5a3a10'); p.R(px + 2, py + 5, 3, 1, wdd);
    }
  }
  p.R(0, 6, 1, 52, wk); p.R(63, 6, 1, 52, wk);
  p.R(0, 58, 64, 6, '#3a2210'); p.R(0, 58, 64, 1, '#6a4022'); p.R(kx0, 58, kx1 - kx0 + 1, 6, '#120a04');
}
// v3 guichet de banque : marbre vert sombre et noir, cadres et barre de pied en laiton, plaque TELLER
function txBarTeller(p, rand, c) {
  const nz = txFbm(rand, [16, 8, 4]), vn = txFbm(rand, [32, 16, 8], [0.5, 0.3, 0.2]), nz2 = txNoise(rand, 2);
  const G = txRGB('#1e3a2c'), G2 = txRGB('#2c4c3a'), V = txRGB('#8aa898'), K = txRGB('#0c1410'), Kb = txRGB('#161e1a');
  txField(c, (x, y) => {
    const pil = x >= 60 || x < 4, base = pil || y >= 48 ? Kb : G;
    const r = Math.abs(vn(x + (pil ? 20 : 0), y * 0.5) - 0.5);
    let col = txLerp(base, pil || y >= 48 ? txRGB('#222c28') : G2, nz(x, y * 0.5));
    if (r < 0.012) col = txLerp(col, V, pil ? 0.45 : 0.7); else if (r < 0.03) col = txLerp(col, V, 0.25);
    else if (nz2(x, y) > 0.92) col = K;
    return txK(col, 0.95 + nz2(x, y) * 0.08);
  });
  p.R(0, 0, 64, 2, '#2e3a36'); p.R(0, 2, 64, 1, '#9ab4a8'); p.R(0, 3, 64, 2, '#16201c'); p.R(0, 5, 64, 1, '#060a08');
  for (let i = 0; i < 4; i++) p.R(rand() * 60, 3 + Math.floor(rand() * 2), 3 + rand() * 6, 1, '#3a4a44');
  const w = txWP(p);
  w.R(60, 6, 1, 42, '#e0b850'); w.R(67, 6, 1, 42, '#7a5a1c');
  const bx0 = 6, by0 = 8, bx1 = 57, by1 = 45;
  p.R(bx0, by0, bx1 - bx0 + 1, 1, '#e0b850'); p.R(bx0, by0, 1, by1 - by0 + 1, '#e0b850');
  p.R(bx0, by1, bx1 - bx0 + 1, 1, '#7a5a1c'); p.R(bx1, by0, 1, by1 - by0 + 1, '#7a5a1c');
  txField(c, (x, y, col) => (x === bx0 + 1 || y === by0 + 1 || y === by0 + 2 ? txK(col, 0.65) : null), bx0 + 1, by0 + 1, bx1 - bx0 - 1, by1 - by0 - 1);
  txLayer(c, (q) => {
    const x0 = 18, y0 = 17, pw = 28, ph = 18;
    q.R(x0, y0, pw, ph, '#c8a040'); q.R(x0, y0, pw, 2, '#f0d070'); q.R(x0, y0, 1, ph, '#f0d070');
    q.R(x0, y0 + ph - 2, pw, 2, '#7a5a1c'); q.R(x0 + pw - 1, y0, 1, ph, '#7a5a1c');
    q.R(x0 + 2, y0 + 3, pw - 4, 1, '#a07a28'); q.R(x0 + 2, y0 + ph - 4, pw - 4, 1, '#e0b850');
    const tx = x0 + ((pw - textW('TELLER')) >> 1), ty = y0 + 4;
    text(txTall(q.R, ty + 1), 'TELLER', tx, ty + 1, '#f8e08a');
    text(txTall(q.R, ty), 'TELLER', tx, ty, '#3a2408');
    for (const [sx, sy] of [[x0 + 1, y0 + 2], [x0 + pw - 2, y0 + 2], [x0 + 1, y0 + ph - 4], [x0 + pw - 2, y0 + ph - 4]]) { q.R(sx, sy, 1, 2, '#5a3a10'); }
  }, [1, 1, 0.5]);
  p.R(0, 48, 64, 2, '#2a3632'); p.R(0, 48, 64, 1, '#4a5a54');
  p.R(0, 51, 64, 1, '#f4d888'); p.R(0, 52, 64, 1, '#d8b050'); p.R(0, 53, 64, 1, '#b08a30'); p.R(0, 54, 64, 1, '#6a4a18'); p.R(0, 55, 64, 1, '#060a08');
  for (const x of [12, 44]) { p.R(x, 50, 3, 7, '#a07a28'); p.P(x, 50, '#f4d888'); p.R(x + 2, 50, 1, 7, '#5a3a10'); }
  p.R(0, 56, 64, 8, '#141a18'); p.R(0, 56, 64, 1, '#3a4a44'); p.R(0, 63, 64, 1, '#060806');
  grain(c, 0, 56, 64, 8, rand, 0.06, 0.5);
}
// v4 guichet de la gare : pin verni, plaque TICKETS, horaire épinglé
function txBarTicket(p, rand, c) {
  const pine = '#b08850';
  txVBoards(p, rand, c, 0, 8, 64, 46, pine, 4, shade(pine, -0.45));
  const w = txWP(p);
  for (let i = 0; i < 10; i++) w.R(Math.floor(rand() * 16) * 4 + 2, 10 + rand() * 36, 1, 6 + rand() * 12, shade(pine, 0.16));
  p.R(0, 0, 64, 2, '#c49a60'); p.R(0, 2, 64, 1, '#e8c088'); p.R(0, 3, 64, 3, '#9a7240'); p.R(0, 3, 64, 1, '#b08850'); p.R(0, 6, 64, 1, '#4a3018');
  p.R(0, 7, 64, 2, '#8a6438'); p.R(0, 7, 64, 1, '#a87c48');
  for (let i = 0; i < 5; i++) p.R(rand() * 60, Math.floor(rand() * 2), 4 + rand() * 8, 1, '#b48a54');
  p.R(0, 52, 64, 4, '#8a6438'); p.R(0, 52, 64, 1, '#c09860'); p.R(0, 55, 64, 1, '#4a3018');
  p.R(0, 56, 64, 8, '#5a3a1e'); p.R(0, 56, 64, 1, '#7a5430'); p.R(0, 63, 64, 1, '#2a1a0c');
  for (let i = 0; i < 5; i++) p.R(rand() * 60, 58 + rand() * 4, 2 + rand() * 4, 1, '#4a2e16');
  txLayer(c, (q) => {
    const x0 = 4, y0 = 15, pw = 31, ph = 16;
    q.R(x0, y0, pw, ph, '#c8a040'); q.R(x0, y0, pw, 1, '#f0d070'); q.R(x0, y0, 1, ph, '#f0d070'); q.R(x0, y0 + ph - 1, pw, 1, '#6a4a18'); q.R(x0 + pw - 1, y0, 1, ph, '#6a4a18');
    q.R(x0 + 1, y0 + 1, pw - 2, ph - 2, '#22302a'); q.R(x0 + 1, y0 + 1, pw - 2, 1, '#121a16');
    const tx = x0 + ((pw - textW('TICKETS')) >> 1), ty = y0 + 3;
    text(txTall(q.R, ty), 'TICKETS', tx, ty, '#f0d070');
    q.R(x0 + 3, y0 + ph - 3, pw - 6, 1, '#3a4a40');
  }, [1, 1, 0.55]);
  txLayer(c, (q) => {
    const x0 = 40, y0 = 10, pw = 19, ph = 36, ink = '#3a2614';
    q.R(x0, y0, pw, ph, '#ece4cc'); q.R(x0, y0 + ph - 2, pw, 2, '#d8ccac'); q.R(x0 + pw - 1, y0, 1, ph, '#c8b890');
    for (let i = 0; i < 10; i++) q.P(x0 + Math.floor(rand() * pw), y0 + (rand() < 0.5 ? 0 : ph - 1), '#c8b890');
    q.R(x0 + 2, y0 + 3, pw - 4, 2, ink); q.R(x0 + 4, y0 + 7, pw - 8, 2, '#8a2a1a'); q.R(x0 + 2, y0 + 10, pw - 4, 1, ink);
    for (let y = y0 + 13; y < y0 + ph - 3; y += 4) {
      q.R(x0 + 2, y, 5, 2, ink); q.R(x0 + 9, y, 3 + Math.floor(rand() * 5), 2, '#6a5a44');
    }
    q.R(x0 + 8, y0 + 12, 1, ph - 15, '#a89878');
    for (const x of [x0 + 1, x0 + pw - 2]) { q.P(x, y0, '#c42a20'); q.P(x, y0 - 1, '#f07a60'); }
  }, [1, 1, 0.6]);
}

// --- cellule vue du dedans : le bureau derrière les barreaux (bardage ocre, lampe, trousseau de clés), pas de couchette
function txCellInside(p, rand, c) {
  txSiding(p, rand, c, '#a87a38', 4);
  p.R(0, 50, 64, 2, '#3a2412'); p.R(0, 50, 64, 1, '#5a3a20');
  txBlocks(c, rand, { y0: 52, y1: 64, ch: 6, cols: ['#8a7e6a', '#7e725e', '#948872'], mortar: '#4a4032', bev: 0.12, lens: () => [16, 16, 16, 16], off: (r) => r * 8 + 3 });
  // affiche délavée et trousseau de clés à un clou
  p.R(51, 9, 9, 13, '#cfc2a0'); p.R(51, 9, 9, 1, '#e0d4b4'); p.R(60, 10, 1, 13, '#5a3a18');
  for (let y = 12; y < 20; y += 2) p.R(52, y, 3 + Math.floor(rand() * 5), 1, '#7a6a50');
  // chapeau pendu à une patère
  p.R(13, 19, 2, 2, '#3a2412'); p.P(13, 19, '#7a5030');
  p.ell(14, 23, 3, 3, '#5a3e24'); p.R(11, 21, 2, 3, '#7a5634'); p.R(13, 20, 3, 1, '#4a3018');
  p.R(9, 25, 11, 2, '#4a3018'); p.R(9, 25, 11, 1, '#6e4c2e'); p.P(9, 24, '#6e4c2e'); p.P(19, 24, '#5a3e24');
  p.R(11, 24, 7, 1, '#2a1a10');
  // lueur chaude de la lampe (périodique en x)
  const LX = 40, LY = 15;
  txField(c, (x, y, col) => {
    let dx = x + 0.5 - LX; dx -= 64 * Math.round(dx / 64);
    const g = Math.exp(-((Math.hypot(dx, (y + 0.5 - LY) * 1.1) / 18) ** 2)), k = 0.5 + 0.72 * g;
    return [col[0] * k * (1 + 0.12 * g), col[1] * k, col[2] * k * (1 - 0.22 * g)];
  });
  // lampe à pétrole sur une applique, réflecteur de fer-blanc
  p.ell(40, 14, 3, 6, '#8a826e'); p.ell(40, 14, 2, 5, '#d8d0b4'); p.P(39, 10, '#f4ecd0');
  p.R(39, 10, 3, 8, '#f8e8b0'); p.R(40, 11, 1, 6, '#fff8e0'); p.P(40, 15, '#ffd860'); p.P(40, 14, '#ffb030');
  p.R(38, 18, 5, 3, '#c8a040'); p.R(38, 18, 5, 1, '#f0d070'); p.R(38, 20, 5, 1, '#7a5a1c');
  p.R(39, 21, 3, 1, '#5a4418'); p.R(36, 22, 9, 1, '#2a2624'); p.P(36, 21, '#2a2624');
  // barreaux à contre-jour
  for (let x = 2; x < 64; x += 8) {
    const near = Math.abs(x + 1 - LX) < 12;
    p.R(x, 0, 3, 64, '#2e2e34'); p.R(x, 0, 1, 64, near ? '#8a7a68' : '#62626c'); p.R(x + 2, 0, 1, 64, '#141418');
  }
  for (const y of [4, 50]) {
    p.R(0, y, 64, 4, '#26262c'); p.R(0, y, 64, 1, '#5a5a64'); p.R(0, y + 3, 64, 1, '#101014');
    for (let x = 3; x < 64; x += 8) p.P(x, y + 2, '#8a8a94');
  }
  p.R(0, 0, 64, 2, '#1e1e24'); p.R(0, 1, 64, 1, '#3e3e46');
}

// =================================================================== les murs
const TX_SIGNS = [
  ['SALOON', '#6e1e18', '#f2c84e', 1], ['BANK', '#1e4a30', '#f0d272', 3], ['SHERIFF', '#2a2420', '#ece2c4', 0], ['HOTEL', '#1e2e5c', '#f2e6c4', 1],
  ['GUNS', '#1c1714', '#dc4430', 3], ['CANTINA', '#24827e', '#f8d040', 0], ['JAIL', '#6a6660', '#1a1614', 2], ['STABLE', '#7a5434', '#f2e6c8', 2],
];
const TX_VARS = { plank: 4, plankWindow: 4, plankDoor: 4, brick: 2, brickWindow: 2, brickDoor: 2, barn: 2, adobe: 2, adobeWindow: 2, adobeDoor: 2, sign: 8, trainCar: 2, freightCar: 2, rock: 2, wallpaper: 2, stone: 2, logs: 2,
  wallpaperWin: 2, cantinaInWin: 1, plankWin: 4, stoneWin: 1, adobeWin: 2, brickWin: 2, backbar: 4, bar: 5, cell: 2 };

const TX_WALLS = {
  plank(p, rand, c, v) { txSiding(p, rand, c, TX_PAINT[v], [10, 9, 13, 16][v]); },

  plankWindow(p, rand, c, v) {
    const paint = TX_PAINT[v], ws = shade(paint, -0.45);
    txSiding(p, rand, c, paint, [8, 7, 10, 12][v]);
    for (const sx of [10, 45]) { txShutter(p, sx, 12, 9, 32, TX_SHUT[v]); p.R(sx + 1, 44, 9, 1, ws); }
    p.P(19, 16, '#2a2a2a'); p.P(19, 38, '#2a2a2a'); p.P(44, 16, '#2a2a2a'); p.P(44, 38, '#2a2a2a');
    txWindowFrame(p, 23, 15, 18, 26, TX_TRIM[v], ws);
    txWindowPane(p, rand, 23, 15, 18, 26, TX_TRIM[v], ['#5a1e1a', '#5a1e1a', '#6a5a2a', '#4a2a3a'][v]);
  },

  plankDoor(p, rand, c, v) {
    const paint = TX_PAINT[v], trim = TX_TRIM[v], ws = shade(paint, -0.45), door = TX_DOOR[v];
    txSiding(p, rand, c, paint, [8, 7, 10, 12][v]);
    const th = shade(trim, 0.25), td = shade(trim, -0.35);
    p.R(17, 10, 30, 54, trim); p.R(17, 10, 1, 54, th); p.R(46, 10, 1, 54, td);
    p.R(15, 6, 34, 4, trim); p.R(15, 6, 34, 1, th); p.R(15, 9, 34, 1, td); p.R(14, 5, 36, 1, th);
    p.R(47, 10, 1, 54, ws);
    txBevel(p, 20, 12, 24, 52, door, true, 0.2);
    for (const [px, py, ph] of [[22, 14, 22], [33, 14, 22], [22, 39, 21], [33, 39, 21]]) {
      txBevel(p, px, py, 9, ph, shade(door, -0.15), false, 0.35);
      txBevel(p, px + 2, py + 2, 5, ph - 4, shade(door, 0.06), true, 0.18);
    }
    for (let i = 0; i < 10; i++) p.R(21 + rand() * 22, 12 + rand() * 50, 1, 2 + rand() * 4, shade(door, -0.18));
    p.R(40, 35, 3, 6, '#5a4418'); p.R(40, 36, 2, 2, '#d8b040'); p.P(40, 36, '#fff0a0'); p.P(41, 39, '#1a1008');
    p.R(18, 62, 28, 2, '#6a5038'); p.R(18, 62, 28, 1, '#9a7a56');
    // fer à cheval porte-bonheur (ouvert vers le haut)
    const fe = '#8a8a90', fd = '#4a4a50', fh = '#c8c8cc';
    p.R(28, 0, 2, 4, fe); p.R(34, 0, 2, 4, fe); p.R(29, 4, 6, 1, fe); p.P(28, 4, fd); p.P(35, 4, fd); p.R(29, 5, 6, 1, fd);
    p.P(28, 0, fh); p.P(28, 2, '#2a2a2a'); p.P(35, 2, '#2a2a2a'); p.P(31, 4, '#2a2a2a');
  },

  brick(p, rand, c, v) { txBrickWall(p, rand, c, v); },

  brickWindow(p, rand, c, v) {
    txBrickWall(p, rand, c, v);
    const B = TX_BRICK[v], s = B.band, sh = shade(s, 0.22), sd = shade(s, -0.35);
    const x0 = 22, x1 = 42, yb = 50;
    if (v === 0) {
      p.R(x0, 21, x1 - x0, yb - 21, '#110c0a');
      p.R(x0 - 4, 15, x1 - x0 + 8, 6, s); p.R(x0 - 4, 15, x1 - x0 + 8, 1, sh); p.R(x0 - 4, 20, x1 - x0 + 8, 1, sd);
      p.R(29, 13, 6, 9, shade(s, 0.06)); p.R(29, 13, 6, 1, sh); p.R(29, 13, 1, 9, sh); p.R(34, 13, 1, 9, sd); p.R(29, 21, 6, 1, sd);
      p.R(x0 - 4, 21, x1 - x0 + 8, 1, '#3a1a10');
    } else {
      const cx = 32, cy = 29;
      txField(c, (x, y) => {
        const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
        if (y < cy && d < 10.5) return '#110c0a';
        if (y < cy + 1 && d >= 10.5 && d < 15) {
          const a = Math.atan2(y + 0.5 - cy, x + 0.5 - cx), f = (a + Math.PI) / (Math.PI / 9), seg = Math.floor(f);
          if (Math.abs(f - seg - 0.5) > 0.4) return B.mortar;
          const col = txRGB(seg === 4 ? s : B.cols[seg % B.cols.length]);
          return txK(col, d < 11.5 ? 0.75 : d > 14 ? 1.15 : 1);
        }
        return null;
      });
      p.R(29, 13, 6, 6, s); p.R(29, 13, 6, 1, sh); p.R(34, 13, 1, 6, sd);
      p.R(x0, cy, x1 - x0, yb - cy, '#110c0a');
    }
    const top = v === 0 ? 21 : 19;
    p.R(x0, top, 2, yb - top, '#070504'); p.R(x0, top, x1 - x0, 2, '#070504');
    p.R(x0 + 2, top + 2, x1 - x0 - 2, yb - top - 2, '#1c1612');
    p.R(x0 + 2, 35, x1 - x0 - 2, 1, '#2e4a36'); p.R(31, top + 2, 1, yb - top - 2, '#2e4a36');
    p.line(x0 + 4, 34, x0 + 8, 28, '#34343a'); p.line(x0 + 13, 48, x0 + 17, 42, '#34343a');
    for (let x = x0 + 3; x < x1; x += 4) { p.R(x, top, 2, yb - top, '#2c2a2a'); p.R(x, top, 1, yb - top, '#6a6866'); }
    for (const by of [top + 4, 44]) { p.R(x0, by, x1 - x0, 2, '#2c2a2a'); p.R(x0, by, x1 - x0, 1, '#5a5856'); }
    p.R(x0 - 3, yb, x1 - x0 + 6, 3, s); p.R(x0 - 3, yb, x1 - x0 + 6, 1, sh); p.R(x0 - 3, yb + 2, x1 - x0 + 6, 1, sd);
    p.R(x0 - 2, yb + 3, x1 - x0 + 4, 1, '#3a1a10');
  },

  // Porte à panneaux encastrée dans la brique : linteau de pierre à clé (v0) ou arc plat de briques posées de chant (v1),
  // ébrasement dans l'ombre à gauche et sous le linteau, imposte vitrée, seuil de pierre. Bords gauche/droit en brique.
  brickDoor(p, rand, c, v) {
    txBrickWall(p, rand, c, v);
    const B = TX_BRICK[v], s = B.band, sh = shade(s, 0.22), sd = shade(s, -0.35), sdd = shade(s, -0.55);
    const door = ['#2c4a34', '#6a2620'][v], dh = shade(door, 0.22), dd = shade(door, -0.45);
    const x0 = 20, x1 = 44, top = 13, bot = 62;
    // baie : fond sombre, ébrasement (gauche et haut dans l'ombre, droite éclairée)
    p.R(x0, top, x1 - x0, bot - top, '#140d0a');
    p.R(x0, top, 2, bot - top, shade(B.cols[0], -0.6)); p.R(x0, top, x1 - x0, 2, shade(B.cols[0], -0.65));
    p.R(x1 - 1, top + 2, 1, bot - top - 2, shade(B.cols[0], 0.12));
    // vantail
    const lx = x0 + 2, lw = x1 - x0 - 3, ly = top + 2;
    p.R(lx, ly, lw, bot - ly, shade(door, -0.3));
    txBevel(p, lx + 1, ly + 1, lw - 2, bot - ly - 1, door, true, 0.22);
    // imposte vitrée
    p.R(lx + 2, ly + 2, lw - 4, 7, dd); p.R(lx + 3, ly + 3, lw - 6, 5, '#1c1a1e');
    p.line(lx + 5, ly + 7, lx + 8, ly + 4, '#3a3c44'); p.R(lx + 3 + ((lw - 6) >> 1), ly + 3, 1, 5, dd);
    p.R(lx + 2, ly + 9, lw - 4, 1, dh);
    // quatre panneaux moulurés (en creux, puis plate-bande en relief)
    const pw = (lw - 7) >> 1;
    for (const [px, py, ph] of [[lx + 2, ly + 12, 18], [lx + 4 + pw, ly + 12, 18], [lx + 2, ly + 32, 12], [lx + 4 + pw, ly + 32, 12]]) {
      txBevel(p, px, py, pw + 1, ph, shade(door, -0.15), false, 0.35);
      txBevel(p, px + 2, py + 2, pw - 3, ph - 4, shade(door, 0.06), true, 0.18);
    }
    for (let i = 0; i < 8; i++) p.R(lx + 2 + rand() * (lw - 4), ly + 11 + rand() * 34, 1, 2 + rand() * 4, shade(door, -0.16));
    // bouton de laiton, entrée de serrure, plaque de propreté
    p.R(lx + lw - 5, 38, 2, 2, '#c8a040'); p.P(lx + lw - 5, 38, '#f8e090'); p.P(lx + lw - 4, 39, '#6a4a18');
    p.P(lx + lw - 4, 41, '#120c08');
    p.R(lx + 2, bot - 4, lw - 4, 2, '#a07a2c'); p.R(lx + 2, bot - 4, lw - 4, 1, '#d8b050');
    // linteau
    if (v === 0) {
      p.R(x0 - 4, 8, x1 - x0 + 8, 5, s); p.R(x0 - 4, 8, x1 - x0 + 8, 1, sh); p.R(x0 - 4, 12, x1 - x0 + 8, 1, sd);
      p.R(x0 - 4, 8, 1, 5, sh); p.R(x1 + 3, 8, 1, 5, sd);
      p.R(29, 7, 6, 7, shade(s, 0.06)); p.R(29, 7, 6, 1, sh); p.R(29, 7, 1, 7, sh); p.R(34, 7, 1, 7, sd); p.R(29, 13, 6, 1, sd);
      p.R(x0 - 3, 13, x1 - x0 + 6, 1, sdd);
    } else {
      // briques posées de chant (2 px + joint), clé en pierre au milieu
      p.R(x0 - 3, 7, x1 - x0 + 6, 6, B.mortar);
      for (let x = x0 - 3, k = 0; x < x1 + 3; x += 3, k++) {
        const col = B.cols[(k * 5 + 2) % B.cols.length];
        p.R(x, 7, 2, 5, col); p.P(x, 7, shade(col, 0.2)); p.R(x, 11, 2, 1, shade(col, -0.3));
      }
      p.R(30, 6, 4, 7, s); p.R(30, 6, 4, 1, sh); p.R(30, 6, 1, 7, sh); p.R(33, 6, 1, 7, sd);
      p.R(x0 - 3, 12, x1 - x0 + 6, 1, shade(B.mortar, -0.5));
    }
    // seuil de pierre (déborde un peu de la baie)
    p.R(x0 - 2, 62, x1 - x0 + 4, 2, s); p.R(x0 - 2, 62, x1 - x0 + 4, 1, sh); p.P(x0 - 2, 63, sd); p.P(x1 + 1, 63, sd);
  },

  adobe(p, rand, c, v) { txAdobeWall(p, rand, c, v); txVigaEnds(p, [12, 44], 5, TX_ADOBE[v].plaster); },

  adobeWindow(p, rand, c, v) {
    const A = TX_ADOBE[v];
    txAdobeWall(p, rand, c, v, (x, y) => x > 14 && x < 50 && y > 10 && y < 50);
    txVigaEnds(p, [6, 58], 5, A.plaster);
    const pl = A.plaster, x0 = 22, x1 = 42, y0 = 18, y1 = 42;
    p.R(x0 - 3, y0 - 3, x1 - x0 + 6, y1 - y0 + 6, shade(pl, 0.06));
    p.R(x0, y0, x1 - x0, y1 - y0, '#130d09');
    p.poly([[x0 - 3, y0 - 3], [x1 + 3, y0 - 3], [x1, y0], [x0, y0]], shade(pl, -0.45));
    p.poly([[x0 - 3, y0 - 3], [x0, y0], [x0, y1], [x0 - 3, y1 + 3]], shade(pl, -0.25));
    p.poly([[x1 + 3, y0 - 3], [x1 + 3, y1 + 3], [x1, y1], [x1, y0]], shade(pl, 0.08));
    p.poly([[x0 - 3, y1 + 3], [x0, y1], [x1, y1], [x1 + 3, y1 + 3]], shade(pl, 0.16));
    const wd = v ? '#2a6a8a' : '#6a4426';
    for (let x = x0 + 2; x < x1 - 1; x += 4) {
      p.R(x, y0, 2, y1 - y0, wd); p.R(x, y0, 1, y1 - y0, shade(wd, 0.2));
      for (let y = y0 + 3; y < y1; y += 5) { p.R(x - 1, y, 4, 1, wd); p.P(x - 1, y, shade(wd, 0.25)); }
    }
    p.R(x0, y0 + 11, x1 - x0, 2, wd); p.R(x0, y0 + 11, x1 - x0, 1, shade(wd, 0.25));
    txTimber(p, rand, x0 - 7, y0 - 8, x1 - x0 + 14, 5, '#7a5432', true);
    p.R(x0 - 6, y0 - 3, x1 - x0 + 12, 1, shade(pl, -0.4));
    // pot de géranium sur l'appui
    p.R(34, y1 - 1, 6, 5, '#b0583a'); p.R(33, y1 - 1, 8, 2, '#c4683e'); p.R(34, y1 + 3, 6, 1, '#7a3420');
    p.R(33, y1 - 4, 8, 3, '#3a6a2a'); p.P(35, y1 - 5, '#d8303a'); p.P(38, y1 - 5, '#e84050'); p.P(34, y1 - 4, '#e84050'); p.P(39, y1 - 3, '#d8303a'); p.P(36, y1 - 3, '#4a8a3a');
  },

  adobeDoor(p, rand, c, v) {
    const A = TX_ADOBE[v];
    txAdobeWall(p, rand, c, v, (x, y) => x > 12 && x < 52 && y > 8);
    txVigaEnds(p, [6, 58], 5, A.plaster);
    const cx = 32, cy = 27, r = 12, pl = A.plaster;
    const inDoor = (x, y, rr) => (y >= cy ? Math.abs(x + 0.5 - cx) < rr : Math.hypot(x + 0.5 - cx, y + 0.5 - cy) < rr);
    txField(c, (x, y) => {
      if (inDoor(x, y, r) || !inDoor(x, y, r + 3)) return null;
      const d = y >= cy ? Math.abs(x + 0.5 - cx) : Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      const up = y < cy ? (y + 0.5 - cy) / d : 0, side = (x + 0.5 - cx) / d;
      return txK(txRGB(pl), 1.08 - up * 0.12 - side * 0.06 + (d > r + 2 ? -0.18 : 0));
    }, 14, 10, 36, 54);
    const wood = ['#5e3a20', '#4e3a2a'][v];
    txField(c, (x, y) => {
      if (!inDoor(x, y, r)) return null;
      const u = x - (cx - r), plank = Math.floor(u / 4), uu = u % 4;
      let col = txK(txRGB(wood), 0.9 + ((plank * 37) % 7) / 30);
      if (uu === 0) col = txK(col, 0.55); else if (uu === 1) col = txK(col, 1.15);
      if (!inDoor(x - 1, y - 1, r) || !inDoor(x - 2, y - 2, r)) col = txK(col, 0.55);
      if (x === cx || x === cx - 1) col = txK(txRGB(wood), x === cx ? 0.4 : 0.75);
      return col;
    });
    for (let i = 0; i < 18; i++) p.R(cx - r + 1 + rand() * (2 * r - 2), 18 + rand() * 44, 1, 2 + rand() * 5, shade(wood, -0.2));
    const iron = '#2a2624', ih = '#6a6460';
    for (const y of [32, 52]) {
      p.R(cx - r, y, 2 * r, 2, iron); p.R(cx - r, y, 2 * r, 1, ih);
      p.R(cx - r + 1, y - 1, 3, 4, iron); p.R(cx + r - 4, y - 1, 3, 4, iron);
    }
    for (let y = 23; y < 62; y += 6) for (let x = cx - r + 3; x < cx + r - 1; x += 5) {
      if (!inDoor(x, y - 2, r) || Math.abs(y - 32) < 3 || Math.abs(y - 52) < 3) continue;
      p.P(x, y, iron); p.P(x + 1, y, iron); p.P(x, y + 1, iron); p.P(x + 1, y + 1, '#120e0c'); p.P(x, y, ih);
    }
    p.disc(cx + 4, 42, 2, iron); p.P(cx + 4, 42, shade(wood, -0.2)); p.P(cx + 3, 40, ih); p.P(cx + 4, 39, iron);
    p.disc(cx - 5, 42, 2, iron); p.P(cx - 5, 42, shade(wood, -0.2)); p.P(cx - 6, 40, ih); p.P(cx - 5, 39, iron);
    p.R(cx - r - 2, 62, 2 * r + 4, 2, '#8a6a4a'); p.R(cx - r - 2, 62, 2 * r + 4, 1, '#b08a62');
  },

  saloonFront(p, rand, c) {
    txVBoards(p, rand, c, 0, 0, 14, 64, '#c9a46a', 7);
    txVBoards(p, rand, c, 50, 0, 14, 64, '#c9a46a', 7);
    // intérieur sombre
    p.R(14, 6, 36, 58, '#120b07');
    p.R(18, 14, 28, 2, '#1d120b'); p.R(18, 16, 28, 6, '#170e09');
    p.R(30, 9, 1, 6, '#2a2018'); p.R(27, 15, 7, 2, '#2a2018'); p.R(28, 17, 5, 1, '#3a2c1c');
    p.R(18, 52, 28, 12, '#1e130c');
    for (let y = 54; y < 64; y += 3) p.R(18, y, 28, 1, '#140c08');
    p.R(20, 55, 2, 9, '#0c0705'); p.R(41, 56, 2, 8, '#0c0705');
    // poteaux et linteau peints
    const tr = '#2e4a34', th = '#4e6e52', td = '#1a2c1e';
    for (const x of [14, 46]) { p.R(x, 6, 4, 58, tr); p.R(x, 6, 1, 58, th); p.R(x + 3, 6, 1, 58, td); }
    p.R(12, 2, 40, 5, tr); p.R(12, 2, 40, 1, th); p.R(12, 6, 40, 1, td); p.R(11, 1, 42, 1, th);
    for (let x = 16; x < 48; x += 4) { p.R(x, 3, 2, 2, '#c8a040'); p.P(x, 3, '#f0d070'); }
    for (const [x, d] of [[18, 1], [45, -1]]) for (let i = 0; i < 5; i++) p.R(d > 0 ? x : x - (4 - i), 7 + i, 5 - i, 1, i === 4 ? td : tr);
    // portes battantes
    const bw = '#8a3a22', bh = shade(bw, 0.3), bd = shade(bw, -0.4), sl = '#c89a5a';
    for (const [x0, dir] of [[19, 1], [33, -1]]) {
      const w = 12;
      for (let i = 0; i < w; i++) {
        const t = dir > 0 ? i / (w - 1) : 1 - i / (w - 1);
        const top = 26 + Math.round(5 * t * t);
        p.R(x0 + i, top, 1, 50 - top, bw);
        p.P(x0 + i, top, bh);
      }
      p.R(x0, 26, 1, 24, bh); p.R(x0 + w - 1, 26, 1, 24, bd); p.R(x0, 49, w, 1, bd);
      for (let y = 33; y < 43; y += 2) { p.R(x0 + 2, y, w - 4, 1, sl); p.R(x0 + 2, y + 1, w - 4, 1, shade(sl, -0.45)); }
      p.R(x0 + 2, 32, w - 4, 1, bd);
      txBevel(p, x0 + 2, 44, w - 4, 4, shade(bw, -0.1), false, 0.3);
      const hx = dir > 0 ? x0 - 1 : x0 + w;
      p.R(hx, 29, 1, 3, '#c8a040'); p.R(hx, 44, 1, 3, '#c8a040');
    }
    p.R(31, 26, 2, 24, '#0a0604');
    grain(c, 14, 26, 36, 24, rand, 0.05, 0.4);
  },

  sign(p, rand, c, v) {
    const [word, board, ink, paintI] = TX_SIGNS[v];
    txSiding(p, rand, c, TX_PAINT[paintI], 8);
    const x0 = 1, y0 = 15, w = 62, h = 22, wall = shade(TX_PAINT[paintI], -0.5);
    p.R(x0 + 1, y0 + h, w - 1, 2, wall);
    const mo = shade(board, -0.45);
    p.R(x0, y0, w, h, mo);
    txBevel(p, x0 + 1, y0 + 1, w - 2, h - 2, shade(board, 0.15), true, 0.3);
    p.R(x0 + 3, y0 + 3, w - 6, h - 6, board);
    p.R(x0 + 3, y0 + 3, w - 6, 1, shade(board, -0.35));
    for (let i = 0; i < 16; i++) p.R(x0 + 4 + rand() * (w - 10), y0 + 4 + Math.floor(rand() * (h - 8)), 2 + rand() * 6, 1, shade(board, rand() < 0.5 ? -0.12 : 0.08));
    const fil = mix(board, ink, 0.45);
    p.R(x0 + 5, y0 + 4, w - 10, 1, fil); p.R(x0 + 5, y0 + h - 5, w - 10, 1, fil);
    // grande taille si elle tient (au besoin lettres resserrées d'un pixel), sinon petite
    const fit = [[2, 2, false, 8], [2, 1, false, 6], [2, 1, true, 8], [1, 1, false, 8]].find(([a, b, n, m]) => txTextW(word, a, b, n) <= w - m);
    const [s, lg, nar] = fit, tw = txTextW(word, s, lg, nar);
    const tx = x0 + ((w - tw) >> 1), ty = y0 + ((h - 5 * s) >> 1);
    txText(p.R, word, tx + 1, ty + 1, shade(board, -0.6), s, lg, nar);
    txText(p.R, word, tx, ty, ink, s, lg, nar);
    const gap = (w - 6 - tw) >> 1;
    if (gap >= 8) for (const ox of [x0 + 3 + (gap >> 1), x0 + w - 4 - (gap >> 1)]) {
      const oy = y0 + (h >> 1);
      p.P(ox, oy - 2, ink); p.R(ox - 1, oy - 1, 3, 1, ink); p.R(ox - 2, oy, 5, 1, ink); p.R(ox - 1, oy + 1, 3, 1, ink); p.P(ox, oy + 2, ink);
    }
    for (let i = 0; i < 6; i++) { const ex = x0 + 3 + Math.floor(rand() * (w - 6)), ey = y0 + 3 + Math.floor(rand() * (h - 6)); p.R(ex, ey, 1 + Math.floor(rand() * 2), 1, shade(board, -0.25)); }
    for (const [nx, ny] of [[x0 + 1, y0 + 1], [x0 + w - 2, y0 + 1], [x0 + 1, y0 + h - 2], [x0 + w - 2, y0 + h - 2]]) p.P(nx, ny, '#2a2420');
  },

  station(p, rand, c) {
    const paint = '#cdb070', trim = '#5a3a22';
    txSiding(p, rand, c, paint, 6);
    txVBoards(p, rand, c, 0, 42, 64, 22, '#3c5a3a', 4);
    p.R(0, 40, 64, 3, trim); p.R(0, 40, 64, 1, shade(trim, 0.35)); p.R(0, 42, 64, 1, shade(trim, -0.4)); p.R(0, 43, 64, 1, '#1e2a1c');
    const ws = shade(paint, -0.45);
    txWindowFrame(p, 6, 12, 14, 22, trim, ws);
    txWindowPane(p, rand, 6, 12, 14, 22, trim, null);
    // tableau noir des départs
    const bx = 27, by = 7, bw = 34, bh = 28;
    p.R(bx + 1, by + 1, bw, bh, ws);
    txBevel(p, bx, by, bw, bh, '#7a5030', true, 0.3);
    p.R(bx + 2, by + 2, bw - 4, bh - 4, '#28332e');
    for (let i = 0; i < 18; i++) p.P(bx + 3 + rand() * (bw - 6), by + 3 + rand() * (bh - 6), '#3a4540');
    const chalk = '#dcdcd2', chalkD = '#9aa29c';
    const ch = (xx, yy, ww, hh) => { for (let j = 0; j < hh; j++) for (let i = 0; i < ww; i++) p.P(xx + i, yy + j, rand() < 0.15 ? chalkD : chalk); };
    text(ch, 'DEPARTS', bx + 4, by + 4, chalk);
    p.R(bx + 4, by + 10, 27, 1, chalkD);
    [['10:30', 'W'], ['2:45', 'E'], ['6:00', 'W']].forEach(([t, d], i) => {
      const ly = by + 12 + i * 5;
      text(ch, t, bx + 4, ly, chalk);
      text(ch, d, bx + bw - 7, ly, chalk);
      for (let x = bx + 5 + textW(t); x < bx + bw - 9; x += 2) p.P(x, ly + 3, chalkD);
    });
    p.line(bx + 4, by + 24, bx + 22, by + 22, '#c86058');
    p.R(bx - 1, by + bh, bw + 2, 2, '#5a3a20'); p.R(bx - 1, by + bh, bw + 2, 1, '#8a6040'); p.R(bx + 8, by + bh - 1, 3, 1, '#f0f0e8');
  },

  trainCar(p, rand, c, v) {
    const body = ['#2e4a34', '#6a2220'][v], bh = shade(body, 0.18), bd = shade(body, -0.4), gold = '#d4aa48', goldD = '#8a6a28';
    p.R(0, 0, 64, 64, body);
    grain(c, 0, 0, 64, 64, rand, 0.04, 0.4);
    p.R(0, 0, 64, 3, '#3a3634'); p.R(0, 0, 64, 1, '#5a5652'); p.R(0, 3, 64, 1, '#1a1716'); p.R(0, 4, 64, 1, bd);
    p.R(0, 6, 64, 1, gold); p.R(0, 10, 64, 1, gold); p.R(0, 7, 64, 1, bd);
    for (let x = 4; x < 64; x += 8) p.P(x, 8, goldD);
    for (let x = 3; x < 64; x += 16) {
      const wx = x, wy = 13, ww = 10, wh = 15;
      p.R(wx - 1, wy - 1, ww + 2, wh + 2, '#8a5a2c'); p.R(wx - 1, wy - 1, ww + 2, 1, '#b07a44');
      p.R(wx, wy, ww, wh, '#161c20');
      p.P(wx - 1, wy - 1, body); p.P(wx + ww, wy - 1, body);
      p.line(wx + 2, wy + 9, wx + 7, wy + 2, '#2e3a42'); p.line(wx + 3, wy + 10, wx + 8, wy + 3, '#242e34');
      const blind = Math.floor(rand() * 9);
      if (blind > 1) { p.R(wx, wy, ww, blind, '#c8a870'); p.R(wx, wy + blind - 1, ww, 1, '#8a6a40'); p.P(wx + 4, wy + blind, '#8a6a40'); }
      p.R(wx - 1, wy + wh - 5, ww + 2, 1, '#8a5a2c');
      p.R(wx - 2, wy + wh + 1, ww + 4, 1, bh);
    }
    p.R(0, 31, 64, 1, gold); p.R(0, 32, 64, 1, bd);
    for (let x = 0; x < 64; x += 32) {
      p.R(x + 3, 35, 26, 1, gold); p.R(x + 3, 47, 26, 1, gold); p.R(x + 3, 35, 1, 13, gold); p.R(x + 28, 35, 1, 13, gold);
      p.R(x + 4, 36, 24, 1, bd); p.R(x + 4, 36, 1, 11, bd);
      p.R(x + 4, 48, 25, 1, bh);
      for (const [cx, cy] of [[x + 3, 35], [x + 28, 35], [x + 3, 47], [x + 28, 47]]) p.P(cx, cy, '#f8e090');
    }
    p.R(0, 51, 64, 4, shade(body, -0.3)); p.R(0, 51, 64, 1, bh);
    for (let x = 2; x < 64; x += 4) { p.P(x, 53, '#1a1a1a'); p.P(x, 52, shade(body, 0.3)); }
    p.R(0, 55, 64, 9, '#1a1816'); p.R(0, 55, 64, 1, '#0c0b0a');
    p.R(0, 60, 64, 1, '#4a4844'); p.R(0, 61, 64, 1, '#2a2826');
    for (const x of [14, 46]) { p.R(x, 56, 2, 5, '#3a3836'); p.P(x, 56, '#5a5854'); }
    p.R(26, 57, 12, 3, '#2c2a28'); p.R(26, 57, 12, 1, '#44423e');
  },

  freightCar(p, rand, c, v) {
    const body = ['#8a3422', '#4c5a6a'][v], bd = shade(body, -0.45), stencil = '#e6e0d0';
    txVBoards(p, rand, c, 0, 4, 64, 50, body, 4);
    const ir = '#2a2624', ih = '#5a5450';
    p.R(0, 0, 64, 4, ir); p.R(0, 0, 64, 1, ih); p.R(0, 3, 64, 1, '#151312');
    for (let x = 2; x < 64; x += 6) p.P(x, 2, ih);
    p.R(20, 5, 26, 2, ir); p.R(20, 5, 26, 1, ih);
    for (const x of [22, 42]) { p.R(x, 4, 3, 4, '#3a3634'); p.P(x + 1, 5, '#7a7470'); }
    const door = shade(body, -0.08);
    txVBoards(p, rand, c, 22, 8, 22, 44, door, 5);
    p.R(21, 8, 1, 44, ir); p.R(44, 8, 1, 44, ir); p.R(45, 8, 1, 44, bd);
    for (const y of [9, 49]) { p.R(22, y, 22, 2, ir); p.R(22, y, 22, 1, ih); }
    for (let k = 0; k < 2; k++) p.line(23 + k, 49, 42 + k, 11, k ? ir : ih);
    for (const [x, y] of [[23, 10], [42, 10], [23, 50], [42, 50]]) p.P(x, y, '#8a8480');
    p.R(40, 28, 2, 6, ir); p.P(40, 28, ih); p.R(38, 30, 3, 1, ir);
    p.R(14, 52, 40, 2, ir); p.R(14, 52, 40, 1, ih);
    txStencil(p, rand, 'UP', 3, 14, stencil, 2, 0.1);
    if (v) txStencil(p, rand, '1869', 2, 30, stencil, 1, 0.1);
    else {
      // v0 : pochoir net, et un 8 à taille pincée (le 8 plein de la police 3x5 se lisait 9 en jeu)
      txStencil(p, rand, '1', 2, 30, stencil, 1, 0); txStencil(p, rand, '69', 10, 30, stencil, 1, 0);
      [[0, 1, 1, 1], [1, 1, 0, 1], [2, 0, 1, 0], [3, 1, 0, 1], [4, 1, 1, 1]].forEach(([j, ...b]) => b.forEach((on, i) => { if (on) p.P(6 + i, 30 + j, stencil); }));
    }
    txStencil(p, rand, 'CAP', 48, 14, stencil, 1, 0.12); txStencil(p, rand, '30T', 48, 21, stencil, 1, 0.12);
    for (let y = 32; y < 52; y += 5) { p.R(55, y, 7, 1, '#8a8480'); p.R(55, y + 1, 7, 1, '#1a1816'); p.P(55, y - 1, ir); p.P(61, y - 1, ir); }
    p.R(0, 54, 64, 4, ir); p.R(0, 54, 64, 1, ih);
    for (let x = 1; x < 64; x += 4) p.P(x, 56, '#7a7470');
    p.R(0, 58, 64, 6, '#151312'); p.R(0, 61, 64, 1, '#3a3836');
    for (const x of [10, 42]) { p.R(x, 58, 12, 4, '#24201e'); p.R(x, 58, 12, 1, '#3c3834'); }
  },

  loco(p, rand, c) {
    // chaudière cylindrique : ombrage propre au cylindre
    txField(c, (x, y) => {
      const t = y / 41;
      const k = y < 2 ? 0.45 : 0.62 + 0.85 * Math.exp(-(((t - 0.2) / 0.13) ** 2)) + 0.12 * Math.exp(-(((t - 0.7) / 0.2) ** 2));
      return txK([40, 40, 44], k);
    }, 0, 0, 64, 42);
    grain(c, 0, 0, 64, 42, rand, 0.06, 0.4);
    for (let x = 0; x < 64; x += 4) { p.P(x + 1, 2, '#4a4a4c'); p.P(x + 3, 38, '#4a4846'); p.P(x + 3, 39, '#121110'); }
    p.R(0, 37, 64, 1, '#121110');
    // tuyau d'alimentation (laiton)
    p.R(0, 25, 64, 3, '#a87a2a'); p.R(0, 25, 64, 1, '#f0d070'); p.R(0, 27, 64, 1, '#5a3c12'); p.R(0, 28, 64, 1, '#121110');
    for (const x of [6, 38]) { p.R(x, 24, 2, 5, '#c89a3a'); p.P(x, 24, '#f8e090'); p.R(x + 1, 24, 1, 5, '#6a4a18'); }
    // colliers de laiton
    for (const x of [18, 50]) {
      p.R(x, 0, 4, 42, '#c49a38'); p.R(x, 0, 1, 42, '#f0d070'); p.R(x + 1, 0, 1, 42, '#dcb450'); p.R(x + 3, 0, 1, 42, '#6a4a18');
      for (let y = 2; y < 40; y += 4) { p.P(x - 1, y, '#5a5a5c'); p.P(x + 4, y, '#0e0d0c'); }
      p.R(x, 7, 4, 1, '#f8e8a0');
    }
    // soupape
    p.R(30, 18, 4, 7, '#8a6a28'); p.R(30, 18, 1, 7, '#f0d070'); p.R(28, 17, 8, 2, '#c49a38'); p.R(28, 17, 8, 1, '#f8e090'); p.R(31, 15, 2, 2, '#3a3836');
    // tablier rouge
    p.R(0, 42, 64, 2, '#121110'); p.R(0, 44, 64, 4, '#8e2a1c'); p.R(0, 44, 64, 1, '#c44a32'); p.R(0, 47, 64, 1, '#4a140e');
    for (let x = 3; x < 64; x += 8) p.P(x, 46, '#d8b040');
    // dessous : longerons et haut d'une grande roue motrice rouge
    p.R(0, 48, 64, 16, '#0e0d0c');
    p.R(0, 49, 64, 3, '#24221f'); p.R(0, 49, 64, 1, '#3a3836');
    txField(c, (x, y) => {
      const d = Math.hypot(x + 0.5 - 32, y + 0.5 - 80);
      if (d > 27 || y < 52) return null;
      if (d > 25) return d > 26 ? '#3a3836' : '#6a6864';
      if (d > 22.5) return y < 56 ? '#c43a24' : '#9a2a1a';
      const a = Math.atan2(y + 0.5 - 80, x + 0.5 - 32);
      const sp = Math.abs((((a / (Math.PI / 8)) % 1) + 1) % 1 - 0.5) < 0.12;
      return sp ? '#a8301e' : '#0e0d0c';
    });
    p.R(4, 59, 56, 3, '#8a8a90'); p.R(4, 59, 56, 1, '#d0d0d8'); p.R(4, 61, 56, 1, '#3a3a40');
    p.disc(8, 60, 2, '#5a5a60'); p.disc(56, 60, 2, '#5a5a60'); p.P(8, 60, '#c8c8d0'); p.P(56, 60, '#c8c8d0');
  },

  rock(p, rand, c, v) {
    if (v === 0) txStrata(p, rand, c);
    else txMineRock(p, rand, c, false);
  },

  mineProp(p, rand, c) {
    txMineRock(p, rand, c, false, ['#6a5e52', '#74685a', '#5e544a', '#7e705e', '#665a4e'], -5);
    const sh = '#1a1612';
    p.R(18, 10, 3, 54, sh); p.R(54, 10, 3, 54, sh); p.R(4, 9, 56, 3, sh);
    for (const x of [10, 46]) {
      txTimber(p, rand, x, 8, 8, 56, '#7a5634');
      p.R(x - 1, 61, 10, 3, '#4a3a2a'); p.R(x - 1, 61, 10, 1, '#5e4a36');
    }
    txTimber(p, rand, 4, 2, 56, 7, '#6e4c2e', true);
    for (const x of [4, 59]) { p.R(x, 2, 1, 7, '#a07a50'); p.P(x, 4, '#5a3e24'); p.P(x, 6, '#5a3e24'); }
    for (const x of [8, 22, 36, 50]) { p.R(x, 0, 6, 2, '#5a3e24'); p.R(x, 0, 6, 1, '#8a6440'); }
    for (const x of [10, 46]) { p.R(x + 1, 9, 6, 3, '#3a3634'); p.P(x + 2, 10, '#8a8480'); p.P(x + 5, 10, '#8a8480'); }
    p.R(31, 9, 1, 3, '#2a2624'); p.P(32, 12, '#2a2624'); p.P(31, 13, '#5a5450'); p.P(32, 14, '#2a2624');
  },

  mineEntrance(p, rand, c) {
    txStrata(p, rand, c);
    p.R(12, 12, 40, 52, '#050302');
    // perspective : traverses, rails qui fuient, cadres au loin
    for (let i = 0; i < 6; i++) { const y = 63 - Math.round(i * i * 0.7 + i * 2); const hw = 12 - i * 2; p.R(32 - hw - 2, y, 2 * hw + 4, 1, '#1a120c'); }
    p.line(22, 63, 30, 42, '#3a3430'); p.line(42, 63, 34, 42, '#3a3430');
    p.line(23, 63, 30, 43, '#1e1a18'); p.line(41, 63, 34, 43, '#1e1a18');
    p.R(22, 30, 20, 2, '#1a120c'); p.R(22, 30, 2, 22, '#1a120c'); p.R(40, 30, 2, 22, '#1a120c');
    p.R(27, 37, 10, 1, '#120c08'); p.R(27, 37, 1, 12, '#120c08'); p.R(36, 37, 1, 12, '#120c08');
    // cadre de boisage
    p.R(14, 14, 3, 50, '#1a1612'); p.R(53, 14, 3, 50, '#1a1612');
    txTimber(p, rand, 7, 10, 7, 54, '#7a5634');
    txTimber(p, rand, 50, 10, 7, 54, '#7a5634');
    txTimber(p, rand, 3, 5, 58, 7, '#6a4a2c', true);
    p.R(5, 12, 54, 2, '#1a1612');
    for (const x of [3, 60]) { p.R(x, 5, 1, 7, '#a07a50'); p.P(x, 7, '#5a3e24'); p.P(x, 9, '#5a3e24'); }
    // panneau DANGER
    p.R(19, 1, 28, 10, '#2a1a10');
    p.R(18, 0, 28, 10, '#d4b682'); p.R(18, 0, 28, 1, '#ecd4a2'); p.R(18, 9, 28, 1, '#9a7a50'); p.R(45, 0, 1, 10, '#9a7a50');
    txText(p.R, 'DANGER', 20, 3, '#a42418');
    p.P(19, 1, '#3a2c20'); p.P(44, 1, '#3a2c20'); p.P(19, 8, '#3a2c20'); p.P(44, 8, '#3a2c20');
    // crochet et lanterne éteinte
    p.R(14, 20, 4, 1, '#2a2624'); p.P(17, 21, '#2a2624'); p.P(17, 22, '#4a4440');
    p.R(15, 23, 5, 1, '#1a1716'); p.R(16, 22, 3, 1, '#2a2624');
    p.R(15, 24, 5, 6, '#2a2624'); p.R(16, 25, 3, 4, '#5a4a2a'); p.P(16, 25, '#8a7a4a'); p.R(17, 26, 1, 2, '#3a2a18');
    p.R(14, 30, 7, 1, '#1a1716');
  },

  // v0 : rang du haut (pointes sur ciel #9fb8c8, fût jusqu'à la ligne 63) ; v1 : fût plein 64 px (blockhaus,
  // ou rang du bas d'une palissade de 2 unités sous v0) — mêmes rondins, mêmes teintes, veinage continu, aucun pixel de ciel
  logs(p, rand, c, v) {
    const r0 = v ? rng(hash('w:logs:0')) : rand;
    const widths = [8, 7, 9, 8, 7, 9, 8, 8];
    const logs = []; let lx = 0;
    for (const w of widths) { logs.push({ x: lx, w, top: Math.floor(r0() * 3), th: 6 + Math.floor(r0() * 2), tone: 0.88 + r0() * 0.22 }); lx += w; }
    const sky = txRGB('#9fb8c8'), shades = ['#3a2616', '#5c3e26', '#7a5636', '#9a744a', '#b08a5a'].map(txRGB);
    const st = txNoise(r0, 4), nz = txNoise(r0, 2);
    txField(c, (x, y) => {
      const L = logs.find((l) => x >= l.x && x < l.x + l.w);
      const cx = L.w / 2, dx = x - L.x + 0.5 - cx, u = (x - L.x + 0.5) / L.w;
      if (v) {
        if (x === L.x + L.w - 1) return shades[0];
        let k = u < 0.2 ? 4 : u < 0.5 ? 3 : u < 0.8 ? 2 : 1;
        const s = st(x * 5 + L.x * 3, (y + 64) * 0.4);
        if (s > 0.68 && k > 1) k--; else if (s < 0.25 && k < 4) k++;
        return txK(shades[k], L.tone * (0.94 + nz(x, y) * 0.12));
      }
      if (y < L.top + L.th) {
        const half = ((y - L.top + 0.5) / L.th) * cx;
        if (y < L.top || Math.abs(dx) > half + 0.25) return sky;
        if (Math.abs(dx) > half - 1) return '#3a2616';
        return dx < 0 ? txK(txRGB('#c8a070'), L.tone) : txK(txRGB('#8a6844'), L.tone);
      }
      if (y < L.top + L.th + 1) return txK(shades[1], L.tone);
      if (x === L.x + L.w - 1) return shades[0];
      let k = u < 0.2 ? 4 : u < 0.5 ? 3 : u < 0.8 ? 2 : 1;
      const s = st(x * 5 + L.x * 3, y * 0.4);
      if (s > 0.68 && k > 1) k--; else if (s < 0.25 && k < 4) k++;
      return txK(shades[k], L.tone * (0.94 + nz(x, y) * 0.12));
    });
    if (v) {
      // nœuds, cordages de ligature et chevilles de fer
      for (const L of logs) for (let i = 0; i < 2; i++) if (rand() < 0.6) {
        const ky = 4 + i * 32 + rand() * 22, kx = L.x + 2 + Math.floor(rand() * (L.w - 4));
        p.ell(kx, ky, 1, 2, '#4e3420'); p.P(kx, ky, '#3a2616'); p.P(kx - 1, ky - 2, '#a8845a'); p.P(kx, ky + 2, '#5a3e26');
      }
      for (const ry of [9, 41]) {
        for (let x = 0; x < 64; x++) { p.P(x, ry, (x % 3) === 0 ? '#8a6c40' : '#d0b07a'); p.P(x, ry + 1, (x % 3) === 1 ? '#7a5c34' : '#b8985e'); p.P(x, ry + 2, (x % 3) === 2 ? '#7a5c34' : '#a8884e'); }
        p.R(0, ry + 3, 64, 1, '#2e1e12');
        for (const L of logs) { p.P(L.x + L.w - 1, ry, '#2e1e12'); p.P(L.x + L.w - 1, ry + 1, '#5a4228'); }
      }
      for (const L of logs) for (const ry of [25]) {
        const px = L.x + (L.w >> 1);
        p.R(px - 1, ry, 2, 2, '#4a3c30'); p.P(px - 1, ry, '#8a7c6a'); p.P(px, ry + 2, '#5a3e26');
      }
      grain(c, 0, 0, 64, 64, rand, 0.05, 0.4);
      return;
    }
    for (const L of logs) if (rand() < 0.7) { const ky = 24 + rand() * 30, kx = L.x + 2 + Math.floor(rand() * (L.w - 4)); p.ell(kx, ky, 1, 2, '#4e3420'); p.P(kx, ky, '#3a2616'); p.P(kx - 1, ky - 2, '#a8845a'); }
    for (const ry of [17, 47]) {
      for (let x = 0; x < 64; x++) { p.P(x, ry, (x % 3) === 0 ? '#8a6c40' : '#d0b07a'); p.P(x, ry + 1, (x % 3) === 1 ? '#7a5c34' : '#b8985e'); }
      p.R(0, ry + 2, 64, 1, '#2e1e12');
    }
  },

  // v0 : porte à croix blanche ; v1 : bardage seul (mêmes planches et mêmes coulures que v0, tirées de la même graine)
  barn(p, rand, c, v) {
    const red = '#9a2c22', wh = '#e6ddcc', wd = '#a89c88';
    const r0 = v ? rng(hash('w:barn:0')) : rand;
    txVBoards(p, r0, c, 0, 0, 64, 64, red, 6, '#4a120c');
    const w = txWP(p);
    for (let i = 0; i < 10; i++) w.R(r0() * 64, r0() * 64, 1 + r0() * 2, 2 + r0() * 6, '#8a7a6a');
    if (v) {
      // clous des lisses intérieures, quelques planches plus délavées
      for (let x = 3; x < 64; x += 6) for (const y of [7, 33, 58]) { p.P(x, y, '#3a0e0a'); p.P(x, y - 1, '#b8483a'); }
      for (let i = 0; i < 3; i++) { const bx = Math.floor(rand() * 10) * 6 + 1; w.R(bx, rand() * 40, 4, 10 + rand() * 20, shade(red, 0.06)); }
      return;
    }
    // rail et galets
    p.R(6, 8, 52, 3, '#2a2624'); p.R(6, 8, 52, 1, '#5a5450');
    for (const x of [14, 46]) { p.disc(x, 9, 2, '#3a3634'); p.P(x, 9, '#8a8480'); }
    // porte à croix blanche
    const x0 = 11, y0 = 12, ww = 42, hh = 52;
    p.R(x0 + 1, y0 + 1, ww, hh, '#3a0e0a');
    p.R(x0, y0, ww, hh, shade(red, -0.08));
    for (let x = x0; x < x0 + ww; x += 6) p.R(x, y0, 1, hh, '#5a1810');
    const fw = 4, mid = y0 + (hh >> 1) - 2;
    p.R(x0, y0, ww, fw, wh); p.R(x0, y0 + hh - fw, ww, fw, wh); p.R(x0, y0, fw, hh, wh); p.R(x0 + ww - fw, y0, fw, hh, wh); p.R(x0, mid, ww, fw, wh);
    for (const [ya, yb] of [[y0 + fw, mid], [mid + fw, y0 + hh - fw]]) {
      for (let k = -1; k <= 2; k++) {
        p.line(x0 + fw, ya + k, x0 + ww - fw - 1, yb - 1 + k, k === 2 ? wd : wh);
        p.line(x0 + fw, yb - 1 + k, x0 + ww - fw - 1, ya + k, k === 2 ? wd : wh);
      }
    }
    p.R(x0, y0, ww, 1, '#fffaf0'); p.R(x0, y0, 1, hh, '#fffaf0');
    p.R(x0 + ww - 1, y0, 1, hh, wd); p.R(x0, y0 + fw - 1, ww, 1, wd); p.R(x0, mid + fw - 1, ww, 1, wd);
    p.R(x0 + (ww >> 1) - 1, y0, 2, hh, '#2a0a06');
    p.R(x0 + (ww >> 1) - 5, y0 + 30, 2, 6, '#2a2624'); p.R(x0 + (ww >> 1) + 3, y0 + 30, 2, 6, '#2a2624');
  },

  fence(p, rand, c) {
    txVBoards(p, rand, c, 0, 0, 64, 64, '#3e2c1e', 8, '#20160e');
    const w = txWP(p);
    const wood = '#9a8264', wh = shade(wood, 0.2), wdk = shade(wood, -0.35), wg = shade(wood, -0.15);
    for (const x of [-3, 29]) {
      w.R(x + 6, 6, 2, 58, '#1a120a');
      w.R(x, 4, 6, 60, wood); w.R(x, 4, 1, 60, wh); w.R(x + 1, 4, 1, 60, shade(wood, 0.1)); w.R(x + 5, 4, 1, 60, wdk);
      w.R(x, 3, 6, 1, shade(wood, 0.35)); w.R(x + 1, 2, 4, 1, shade(wood, 0.25));
      for (let i = 0; i < 6; i++) w.R(x + 2 + Math.floor(rand() * 3), 6 + rand() * 54, 1, 3 + rand() * 6, wg);
    }
    for (const ry of [12, 28, 44]) {
      w.R(0, ry + 5, 64, 2, '#1a120a');
      w.R(0, ry, 64, 5, wood); w.R(0, ry, 64, 1, wh); w.R(0, ry + 4, 64, 1, wdk);
      for (let i = 0; i < 8; i++) w.R(rand() * 64, ry + 1 + Math.floor(rand() * 3), 3 + rand() * 9, 1, wg);
      for (const x of [0, 32]) { w.P(x - 1, ry + 2, '#2a221a'); w.P(x + 1, ry + 2, '#2a221a'); }
      w.R(8 + Math.floor(rand() * 16), ry, 1, 5, wdk);
    }
    grain(c, 0, 0, 64, 64, rand, 0.05, 0.4);
  },

  hay(p, rand, c) {
    p.R(0, 0, 64, 64, '#2e200c');
    const w = txWP(p);
    // rampe de paille : 0 ombre … 5 lumière (ombres tirées vers l'ocre brun, pas vers le gris)
    const ST = ['#6e5222', '#8e6c2c', '#ad8a3a', '#c8a44a', '#dcbc5e', '#eed47c'];
    const bale = (bx, by, bw, bh, tone) => {
      // volume : dessus et flanc gauche au soleil, dessous et flanc droit dans l'ombre, coins arrondis
      for (let j = 1; j < bh - 1; j++) {
        const t = j / (bh - 1);
        let k = t < 0.12 ? 4 : t < 0.55 ? 3 : t < 0.82 ? 2 : 1;
        k = clamp(k + tone, 0, 5);
        w.R(bx + 1, by + j, bw - 2, 1, ST[k]);
        w.P(bx + 1, by + j, ST[clamp(k + 1, 0, 5)]); w.P(bx + bw - 2, by + j, ST[clamp(k - 1, 0, 5)]);
      }
      for (const [cx, cy] of [[bx, by], [bx + bw - 1, by], [bx, by + bh - 1], [bx + bw - 1, by + bh - 1]]) w.R(cx, cy, 1, 1, '#2e200c');
      w.R(bx + 1, by + 1, bw - 2, 1, ST[5]);
      // brins couchés : courts traits horizontaux, un ton au-dessus ou au-dessous du fond
      for (let i = 0; i < 105; i++) {
        const sy = by + 2 + Math.floor(rand() * (bh - 4)), t = (sy - by) / bh, base = (t < 0.12 ? 4 : t < 0.55 ? 3 : t < 0.82 ? 2 : 1) + tone;
        const sx = bx + 2 + rand() * (bw - 6), len = 3 + rand() * 5;
        w.R(sx, sy, len, 1, ST[clamp(base + (rand() < 0.55 ? -1 : 1), 0, 5)]);
      }
      // brins qui dépassent des bords
      for (let i = 0; i < 8; i++) w.P(bx + 2 + rand() * (bw - 4), by, ST[4]);
      for (let i = 0; i < 5; i++) w.P(bx + 2 + rand() * (bw - 4), by + bh - 1, ST[1]);
      // ficelles
      for (const tx of [bx + 8, bx + bw - 9]) {
        w.R(tx, by + 1, 1, bh - 2, '#6a3418'); w.R(tx + 1, by + 1, 1, bh - 2, '#9a5a2a');
        for (let y = by + 3; y < by + bh - 2; y += 4) w.P(tx + 1, y, '#c08048');
        w.R(tx, by + bh - 4, 2, 3, '#4a240e');
      }
    };
    bale(0, 0, 32, 32, 0); bale(32, 0, 32, 32, rand() < 0.5 ? -1 : 0); bale(16, 32, 32, 32, 0); bale(48, 32, 32, 32, -1);
    grain(c, 0, 0, 64, 64, rand, 0.04, 0.3);
  },

  crates(p, rand, c) {
    p.R(0, 0, 64, 64, '#1e140c');
    const tones = [0, -0.1, 0.06, -0.18];
    [[16, 0], [48, 0], [0, 32], [32, 32]].forEach(([x, y], i) => txCrate(p, rand, x, y, 32, tones[i]));
    txStencil(p, rand, 'XXX', 26, 13, '#3a2414', 1, 0.15);
    txStencil(p, rand, 'NO.7', 56, 13, '#7a2416', 1, 0.15);
    txStencil(p, rand, '1882', 9, 45, '#3a2414', 1, 0.15);
    const ar = '#3a2414';
    for (let k = 0; k < 4; k++) p.R(48 - k, 41 + k, 1 + 2 * k, 1, ar);
    p.R(47, 45, 3, 7, ar);
  },

  tnt(p, rand, c) {
    p.R(0, 0, 64, 64, '#1e140c');
    const w = txWP(p);
    [[16, 0, 0.04], [48, 0, -0.08], [0, 32, -0.02], [32, 32, 0.08]].forEach(([x, y, t]) => {
      txCrate(p, rand, x, y, 32, t - 0.05);
      // étiquette d'époque : fagot de trois bâtons rouges ficelés, mèche allumée (pas de rayures « chantier » modernes)
      w.R(x + 5, y + 19, 22, 8, '#3a2414'); w.R(x + 6, y + 20, 20, 6, '#e0cc9c'); w.R(x + 6, y + 25, 20, 1, '#b8a070');
      for (let j = 0; j < 3; j++) {
        const sy = y + 20 + j * 2 - (j === 2 ? 1 : 0);
        w.R(x + 8, sy, 11, 2, '#a42418'); w.R(x + 8, sy, 11, 1, '#d04a30'); w.P(x + 8, sy + 1, '#6a140c'); w.P(x + 18, sy, '#e8d8b0');
      }
      w.R(x + 12, y + 20, 2, 5, '#2a1a10'); w.P(x + 12, y + 20, '#5a4030');
      w.line(x + 19, y + 22, x + 22, y + 21, '#3a2a1a'); w.P(x + 23, y + 20, '#f0c040'); w.P(x + 24, y + 21, '#e86a20'); w.P(x + 23, y + 22, '#e86a20');
      w.R(x + 5, y + 6, 22, 12, shade('#c8a070', t));
      w.R(x + 5, y + 6, 22, 1, shade('#c8a070', t + 0.2)); w.R(x + 5, y + 17, 22, 1, shade('#c8a070', t - 0.3));
      txStencil(p, rand, 'TNT', x + 5, y + 7, '#b42818', 2, 0.06, 1);
    });
  },

  wallpaper(p, rand, c, v) {
    const base = ['#5e1a24', '#1e3a2a'][v], motif = shade(base, -0.3), lite = shade(base, 0.14), gold = ['#b88a40', '#a8904a'][v];
    p.R(0, 0, 64, 40, base);
    for (let x = 0; x < 64; x += 16) { p.R(x, 4, 1, 36, gold); p.R(x + 2, 4, 1, 36, motif); p.R(x + 14, 4, 1, 36, motif); }
    const FL = ['...#...', '..###..', '..###..', '.#.#.#.', '##.#.##', '#..#..#', '.#####.', '...#...', '..###..', '.#.#.#.'];
    for (let col = 0; col < 4; col++) for (let yy = (col % 2) * 9 - 4; yy < 40; yy += 18) {
      const ox = col * 16 + 5;
      FL.forEach((row, j) => [...row].forEach((ch, i) => { if (ch === '#' && yy + j >= 4) p.P(ox + i, yy + j, j < 3 ? lite : motif); }));
      if (yy + 1 >= 4) p.P(ox + 3, yy + 1, gold);
    }
    grain(c, 0, 4, 64, 36, rand, 0.05, 0.4);
    const wd = '#5a2e16';
    p.R(0, 0, 64, 4, wd); p.R(0, 0, 64, 1, shade(wd, 0.3)); p.R(0, 2, 64, 1, shade(wd, -0.3)); p.R(0, 4, 64, 1, shade(base, -0.5));
    p.R(0, 39, 64, 1, shade(base, -0.5));
    p.R(0, 40, 64, 3, '#6a3a1e'); p.R(0, 40, 64, 1, '#a8683a'); p.R(0, 42, 64, 1, '#3a1a0c');
    const wn = '#4a2814';
    p.R(0, 43, 64, 21, wn);
    for (const x of [3, 35]) {
      txBevel(p, x, 46, 26, 13, shade(wn, -0.15), false, 0.4);
      txBevel(p, x + 2, 48, 22, 9, shade(wn, 0.08), true, 0.25);
      p.R(x + 4, 51, 18, 1, shade(wn, 0.18));
    }
    grain(c, 0, 43, 64, 17, rand, 0.06, 0.5);
    p.R(0, 60, 64, 4, '#2e180a'); p.R(0, 60, 64, 1, '#6a3a1e');
  },

  // v0 saloon ; v1 cantina, v2 bureau du shérif, v3 guichet de banque, v4 guichet de gare
  bar(p, rand, c, v) {
    if (v) return [null, txBarCantina, txBarDesk, txBarTeller, txBarTicket][v](p, rand, c);
    const m = '#5a2a16', mh = shade(m, 0.25), md = shade(m, -0.4);
    p.R(0, 0, 64, 64, m);
    grain(c, 0, 0, 64, 64, rand, 0.06, 0.5);
    p.R(0, 0, 64, 1, '#c88a5a'); p.R(0, 1, 64, 3, '#7e3c20'); p.R(0, 4, 64, 1, '#3a1a0c'); p.R(0, 5, 64, 1, '#1e0e06');
    for (let x = 0; x < 64; x += 11) p.R(x + 2, 2, 5, 1, '#a8603a');
    for (const X0 of [-3, 29]) for (const X of [X0, X0 + 64]) {
      p.R(X, 6, 7, 46, shade(m, 0.05));
      p.R(X, 6, 7, 3, mh); p.R(X, 8, 7, 1, md); p.R(X, 47, 7, 1, mh); p.R(X, 48, 7, 4, shade(m, -0.1));
      for (let k = 1; k < 7; k += 2) { p.R(X + k, 10, 1, 36, md); p.R(X + k + 1, 10, 1, 36, mh); }
    }
    for (const x of [5, 37]) {
      txBevel(p, x, 9, 22, 38, shade(m, -0.12), false, 0.45);
      txBevel(p, x + 2, 11, 18, 34, shade(m, 0.06), true, 0.3);
      const cx = x + 11, cy = 28;
      for (let k = 0; k < 7; k++) { p.R(cx - k, cy - 7 + k, 2 * k + 1, 1, shade(m, 0.12)); p.R(cx - k, cy + 7 - k, 2 * k + 1, 1, shade(m, -0.15)); }
      p.P(cx, cy - 7, mh); p.R(cx - 6, cy, 13, 1, md); p.disc(cx, cy, 1, '#c8a040'); p.P(cx, cy - 1, '#f0d070');
    }
    p.R(0, 51, 64, 1, md);
    p.R(0, 53, 64, 1, '#f4d888'); p.R(0, 54, 64, 1, '#c89a38'); p.R(0, 55, 64, 1, '#7a5a1c'); p.R(0, 56, 64, 1, '#2a1408');
    for (const x of [14, 46]) { p.R(x, 52, 3, 5, '#a87a28'); p.P(x, 52, '#f4d888'); p.R(x - 1, 56, 5, 1, '#5a3a10'); }
    p.R(0, 57, 64, 7, '#2a140a'); p.R(0, 57, 64, 1, '#4a2614');
    for (let i = 0; i < 6; i++) p.R(rand() * 60, 58 + rand() * 5, 2 + rand() * 4, 1, '#3e2214');
  },

  // v0 saloon (miroir), v2 saloon (horloge + caisse) ; v1 cantina (retablo), v3 cantina (guitare). v2/v3 redessinent v0/v1
  // avec leur graine puis remplacent le milieu : les bords se raccordent v0↔v2 et v1↔v3.
  backbar(p, rand, c, v) {
    if (v & 1) { txBackbarCantina(p, v === 1 ? rand : rng(hash('w:backbar:1')), c); if (v === 3) txBackbarGuitar(p, rand, c); return; }
    txBackbarSaloon(p, v === 0 ? rand : rng(hash('w:backbar:0')), c);
    if (v === 2) txBackbarRegister(p, rand, c);
  },

  piano(p, rand, c) {
    const wd = '#3e1c10', wh = shade(wd, 0.35), wdk = shade(wd, -0.5);
    p.R(0, 0, 64, 64, wd);
    grain(c, 0, 0, 64, 64, rand, 0.06, 0.5);
    p.R(0, 0, 64, 4, shade(wd, 0.1)); p.R(0, 0, 64, 1, wh); p.R(0, 3, 64, 1, wdk);
    p.R(0, 4, 3, 60, shade(wd, 0.08)); p.R(0, 4, 1, 60, wh); p.R(61, 4, 3, 60, shade(wd, 0.08)); p.R(63, 4, 1, 60, wdk);
    // fenêtre du rouleau perforé (pianola)
    txBevel(p, 14, 6, 36, 20, shade(wd, -0.1), false, 0.4);
    p.R(17, 8, 30, 15, '#1a0c06');
    p.R(18, 9, 28, 2, '#5a5048'); p.R(18, 20, 28, 2, '#5a5048'); p.P(18, 9, '#8a8078'); p.P(18, 20, '#8a8078');
    p.R(19, 11, 26, 9, '#e2d6b4');
    for (let y = 11; y < 20; y++) for (let x = 19; x < 45; x++) if (rand() < 0.16) p.P(x, y, '#3a2a1a');
    p.R(19, 11, 26, 1, '#bcae8a');
    p.R(14, 6, 36, 1, '#c8a040'); p.R(15, 25, 34, 1, '#7a5a1c');
    // bougeoirs
    for (const x of [7, 54]) {
      p.R(x - 1, 20, 4, 1, '#f0d070'); p.R(x, 21, 2, 2, '#8a6a28'); p.R(x - 2, 23, 6, 1, '#c8a040');
      p.R(x, 12, 2, 8, '#ece4d0'); p.R(x + 1, 12, 1, 8, '#c0b8a4'); p.P(x, 11, '#2a2420');
      p.R(x - 1, 24, 4, 1, '#5a3c18');
    }
    for (const x of [5, 52]) { p.P(x + 1, 7, wh); p.R(x, 8, 4, 1, wh); p.P(x + 1, 9, wdk); }
    p.R(3, 26, 58, 2, shade(wd, 0.18)); p.R(3, 26, 58, 1, wh);
    // clavier
    p.R(3, 28, 58, 1, '#0e0604');
    p.R(4, 29, 56, 9, '#ece4cc');
    for (let x = 4; x < 60; x += 4) { p.R(x + 3, 29, 1, 9, '#9a9078'); p.R(x, 37, 3, 1, '#c8bea4'); }
    const blk = [1, 1, 0, 1, 1, 1, 0];
    for (let k = 0, x = 4; x < 59; x += 4, k++) if (blk[k % 7]) { p.R(x + 2, 29, 3, 5, '#14100e'); p.P(x + 3, 29, '#4a4440'); }
    p.R(3, 38, 58, 2, shade(wd, 0.1)); p.R(3, 38, 58, 1, wh); p.R(3, 40, 58, 1, wdk);
    for (const x of [6, 34]) {
      txBevel(p, x, 43, 24, 15, shade(wd, -0.12), false, 0.45);
      txBevel(p, x + 2, 45, 20, 11, shade(wd, 0.05), true, 0.28);
      p.R(x + 7, 50, 10, 1, wh); p.P(x + 6, 49, wh); p.P(x + 17, 51, wdk); p.P(x + 12, 48, wh);
    }
    p.R(3, 59, 58, 5, wdk); p.R(3, 59, 58, 1, wd);
    for (const x of [27, 35]) { p.R(x, 60, 3, 2, '#c8a040'); p.P(x, 60, '#f0d070'); }
  },

  wanted(p, rand, c) {
    txVBoards(p, rand, c, 0, 0, 64, 64, '#7a5636', 8);
    for (let x = 0; x < 64; x += 8) for (const y of [6, 56]) p.P(x + 4, y, '#2a1e14');
    // tout l'affichage tient dans les lignes 0-42 : dedans, les lignes 43-63 se répètent sous le plafond
    txPoster(p, rand, 2, 1, 26, 36, 'WANTED', '$500', 0);
    txPoster(p, rand, 36, 3, 26, 36, 'WANTED', '$1000', 1);
    const nx = 16, ny = 35, nw = 32, nh = 7;
    p.R(nx + 1, ny + 1, nw, nh, '#3a2818'); p.R(nx, ny, nw, nh, '#e8dcc0'); p.R(nx, ny, 1, nh, '#c8b890'); p.R(nx + nw - 1, ny, 1, nh, '#c8b890');
    p.R(nx, ny + nh - 1, nw, 1, '#d4c4a0');
    txText(p.R, 'NO', nx + 2, ny + 1, '#1e1a18');
    txText(p.R, 'GUNS', nx + 13, ny + 1, '#a42418');
    p.P(nx + 1, ny, '#9a9aa0'); p.P(nx + nw - 2, ny, '#9a9aa0');
  },

  // v0 : la cellule vue du bureau (couchette) ; v1 : vue de l'intérieur de la cellule (le bureau derrière les barreaux)
  cell(p, rand, c, v) {
    if (v) return txCellInside(p, rand, c);
    txBlocks(c, rand, { y0: 0, y1: 54, ch: 9, cols: ['#36312c', '#3e3832', '#2e2a26'], mortar: '#1c1916', bev: 0.15, lens: () => [16, 16, 16, 16], off: (r) => (r % 2) * 8 });
    p.R(38, 8, 14, 8, '#1a1614'); p.R(39, 9, 12, 6, '#56687a'); p.R(39, 9, 12, 1, '#3a4654');
    for (let x = 41; x < 51; x += 3) p.R(x, 9, 1, 6, '#1a1614');
    p.R(0, 54, 64, 10, '#24201c'); p.R(0, 54, 64, 1, '#141210');
    for (let x = 0; x < 64; x += 11) p.R(x, 58 + (x % 3), 6, 1, '#1c1916');
    // couchette
    p.R(4, 44, 30, 2, '#5a5048'); p.R(4, 44, 30, 1, '#7a7068');
    p.R(4, 40, 30, 4, '#6a6458'); p.R(4, 40, 30, 1, '#8a8478');
    for (let x = 6; x < 34; x += 4) p.P(x, 42, '#58534a');
    p.R(20, 39, 13, 5, '#5a3a28'); p.R(20, 39, 13, 1, '#7a5238'); p.R(25, 39, 1, 5, '#4a2e1e');
    p.R(5, 38, 7, 3, '#b0a890'); p.R(5, 38, 7, 1, '#c8c0a8');
    p.R(5, 46, 2, 8, '#2a2624'); p.R(31, 46, 2, 8, '#2a2624');
    p.R(44, 48, 6, 6, '#4a4440'); p.R(44, 48, 6, 1, '#7a746c'); p.R(43, 47, 8, 1, '#2a2624');
    // barreaux
    for (let x = 2; x < 64; x += 8) { p.R(x, 0, 3, 64, '#46464c'); p.R(x, 0, 1, 64, '#9a9aa4'); p.R(x + 2, 0, 1, 64, '#1e1e22'); }
    for (const y of [4, 50]) {
      p.R(0, y, 64, 4, '#3a3a40'); p.R(0, y, 64, 1, '#8a8a94'); p.R(0, y + 3, 64, 1, '#18181c');
      for (let x = 3; x < 64; x += 8) p.P(x, y + 2, '#b0b0ba');
    }
    p.R(0, 0, 64, 2, '#2a2a30'); p.R(0, 1, 64, 1, '#5a5a62');
  },

  cantinaIn(p, rand, c) {
    const wash = txRGB('#e6dccb'), nz = txFbm(rand, [16, 8, 4]), nz2 = txNoise(rand, 2);
    txField(c, (x, y) => txK(wash, 0.93 + nz(x, y) * 0.09 + (nz2(x, y) - 0.5) * 0.04));
    // ristra de piments séchés pendue à un clou
    p.P(46, 15, '#2a2420'); p.R(46, 16, 1, 3, '#a89060');
    for (let y = 19; y < 38; y += 2) for (const dx of [-2, 0, 2]) {
      const xx = 46 + dx + ((y >> 1) % 2 ? 1 : 0) - 1, col = txPick(rand, ['#b4201a', '#9a1a14', '#c83020', '#8a1810']);
      p.R(xx, y, 2, 3, col); p.P(xx, y, shade(col, 0.35)); p.P(xx + 1, y + 2, '#5a0e0a');
    }
    p.R(44, 37, 1, 2, '#3a6a2a'); p.R(47, 38, 1, 2, '#9a1a14'); p.P(47, 40, '#5a0e0a');
    p.R(49, 19, 1, 20, shade('#e6dccb', -0.12));
    txCrack(p, rand, 12, 22, 9, '#9a8c78', '#f4ece0');
    txCrack(p, rand, 55, 32, 7, '#9a8c78', '#f4ece0');
    grain(c, 0, 0, 64, 44, rand, 0.04, 0.4);
    // guirlande de papel picado
    const sag = (x) => 2 + 4 * Math.sin((Math.PI * x) / 64);
    const FLAG = ['#e83a8a', '#2ab0c0', '#f0c030', '#f07a20', '#5ac04a', '#a050d0', '#e83a3a', '#2a7ae0'];
    for (let x = 0; x < 64; x++) p.P(x, Math.round(sag(x)), '#6a5a4a');
    for (let k = 0; k < 8; k++) {
      const fx = 1 + k * 8, fy = Math.round(sag(fx + 3)) + 1, col = FLAG[k], cd = shade(col, -0.25), bg = '#e6dccb';
      p.R(fx, fy, 7, 8, col); p.R(fx, fy, 7, 1, cd);
      for (let i = 0; i < 7; i += 2) p.P(fx + i, fy + 8, col);
      p.P(fx + 3, fy + 2, bg); p.R(fx + 2, fy + 3, 3, 1, bg); p.P(fx + 3, fy + 4, bg);
      p.P(fx + 1, fy + 6, bg); p.P(fx + 5, fy + 6, bg); p.P(fx + 3, fy + 6, bg);
      p.P(fx + 1, fy + 2, cd); p.P(fx + 5, fy + 2, cd);
      p.R(fx + 1, fy + 9, 6, 1, '#cfc4b2');
    }
    // carreaux de Talavera
    p.R(0, 44, 64, 2, '#b0583a'); p.R(0, 44, 64, 1, '#c87050'); p.R(0, 43, 64, 1, '#c8bca8');
    const TA = ['B..Y..B', '.B.Y.B.', '..BBB..', 'YYBWBYY', '..BBB..', '.B.Y.B.', 'B..Y..B'];
    const TB = ['..B.B..', '.BB.BB.', 'BB.Y.BB', '..YGY..', 'BB.Y.BB', '.BB.BB.', '..B.B..'];
    const TCOL = { B: '#2a4aa8', Y: '#e8b030', G: '#2a8a5a', W: '#ffffff' };
    p.R(0, 46, 64, 16, '#a8a090');
    for (let ty = 0; ty < 2; ty++) for (let tx = 0; tx < 8; tx++) {
      const x = tx * 8, y = 46 + ty * 8, pat = (tx + ty) % 2 ? TB : TA;
      p.R(x, y, 7, 7, '#ece6d6');
      pat.forEach((row, j) => [...row].forEach((ch, i) => { if (TCOL[ch]) p.P(x + i, y + j, TCOL[ch]); }));
    }
    p.R(0, 62, 64, 2, '#b0583a'); p.R(0, 63, 64, 1, '#7a3420');
  },

  stone(p, rand, c, v) { txStoneWall(p, rand, c, v); },

  chapel(p, rand, c) {
    txStoneWall(p, rand, c, 1);
    const L = 20, Rr = 44, sp = 28, base = 54;
    const inArch = (x, y, g) => {
      const X = x + 0.5, Y = y + 0.5;
      if (X < L - g || X > Rr + g || Y > base + g) return false;
      if (Y >= sp) return true;
      const r = Rr - L + g;
      return Math.hypot(X - Rr, Y - sp) <= r && Math.hypot(X - L, Y - sp) <= r;
    };
    const stone = txRGB('#d8bc8c'), lead = '#1c1612';
    const PAL = ['#2a4aa8', '#2a4aa8', '#2a4aa8', '#a82a2a', '#2a8a4a', '#d8902a', '#6a2a8a', '#3a6ad0'].map(txRGB);
    txField(c, (x, y) => {
      if (inArch(x, y, 0)) {
        const X = x - 32, Y = y - 30;
        const cross = (Math.abs(X + 0.5) < 2.5 && y >= 13 && y <= 48) || (Math.abs(Y + 0.5) < 2.5 && x >= 24 && x <= 39);
        const crossLead = (Math.abs(X + 0.5) < 3.5 && y >= 12 && y <= 49) || (Math.abs(Y + 0.5) < 3.5 && x >= 23 && x <= 40);
        if (cross) return (Math.abs(X + 0.5) < 0.6 || Math.abs(Y + 0.5) < 0.6) ? '#fff2b0' : '#f0c040';
        if (crossLead) return lead;
        if ((x + y) % 6 === 0 || (x - y + 64) % 6 === 0) return lead;
        const a = Math.floor((x + y) / 6), b = Math.floor((x - y + 64) / 6);
        const col = PAL[(a * 7 + b * 13) % PAL.length];
        const u = (x + y) % 6;
        return txK(col, u === 1 ? 1.3 : u >= 4 ? 0.8 : 1);
      }
      if (!inArch(x, y, 1)) {
        if (inArch(x, y, 4)) {
          const ang = Math.atan2(y - sp, x - 32), seg = Math.floor(ang * 4);
          if (y < sp && (((ang * 4) % 1) + 1) % 1 < 0.12) return '#7a6448';
          if (y >= sp && (y - sp) % 8 === 7) return '#7a6448';
          return txK(stone, (inArch(x, y, 2) ? 0.82 : 1.06) * (seg % 2 ? 0.96 : 1.03));
        }
        return null;
      }
      return lead;
    });
    p.R(15, 55, 34, 3, '#d8bc8c'); p.R(15, 55, 34, 1, '#f0d8a8'); p.R(15, 57, 34, 1, '#9a8060'); p.R(16, 58, 32, 1, '#5a4a36');
  },

  tomb(p, rand, c) {
    const S = ['#b8b4ac', '#c4c0b8', '#aca8a0', '#bcb8b0'];
    txBlocks(c, rand, { y0: 0, y1: 64, ch: 16, cols: S, mortar: '#5e5a54', bev: 0.18, lens: () => [32, 32], off: (r) => (r % 2) * 16 + 8 });
    p.R(0, 0, 64, 6, '#cac6be'); p.R(0, 0, 64, 1, '#e8e4dc'); p.R(0, 4, 64, 1, '#8a867e'); p.R(0, 5, 64, 1, '#5e5a54');
    for (let x = 1; x < 64; x += 4) p.R(x, 2, 2, 2, '#9a968e');
    p.R(0, 6, 64, 15, '#bcb8b0'); p.R(0, 20, 64, 1, '#6e6a64'); p.R(0, 6, 64, 1, '#d8d4cc');
    grain(c, 0, 6, 64, 15, rand, 0.05, 0.5);
    const t = 'R.I.P', tx = 32 - (textW(t, 2) >> 1);
    text(p.R, t, tx + 1, 9, '#e8e4dc', 2);
    text(p.R, t, tx, 8, '#4a4640', 2);
    for (const x of [2, 55]) {
      p.R(x, 21, 7, 43, '#c8c4bc'); p.R(x, 21, 1, 43, '#e4e0d8'); p.R(x + 6, 21, 1, 43, '#7a766e');
      for (let k = 2; k < 6; k += 2) p.R(x + k, 24, 1, 36, '#8a867e');
      p.R(x - 1, 21, 9, 2, '#d4d0c8'); p.R(x - 1, 61, 9, 3, '#9a968e');
    }
    p.R(16, 22, 32, 42, '#8a867e'); p.R(16, 22, 32, 1, '#dcd8d0'); p.R(16, 22, 1, 42, '#dcd8d0');
    p.R(19, 25, 26, 39, '#0e0c0a');
    const ir = '#2c2c30', ih = '#5a5a62';
    p.R(20, 26, 24, 38, ir); p.R(20, 26, 24, 1, ih); p.R(20, 26, 1, 38, ih);
    p.R(32, 26, 1, 38, '#141416');
    p.R(23, 29, 18, 11, '#060504');
    for (let x = 24; x < 41; x += 3) { p.R(x, 29, 1, 11, '#4a4a52'); p.P(x, 29, '#8a8a92'); }
    p.R(23, 33, 18, 1, '#4a4a52');
    p.R(22, 28, 20, 1, ih); p.R(22, 40, 20, 1, '#141416');
    for (const x of [22, 34]) txBevel(p, x, 43, 9, 18, '#2a2a2e', true, 0.35);
    for (let y = 27; y < 63; y += 5) { p.P(21, y, '#7a7a84'); p.P(42, y, '#7a7a84'); }
    p.disc(30, 50, 2, '#4a4a52'); p.P(30, 50, ir); p.P(29, 48, '#8a8a92');
    for (let i = 0; i < 12; i++) p.R(21 + rand() * 22, 30 + rand() * 30, 1, 2 + rand() * 4, '#5a3a24');
    for (let i = 0; i < 16; i++) p.P(rand() * 64, 58 + rand() * 6, txPick(rand, ['#6a7a4a', '#5a6a3a', '#7a8a5a']));
  },

  // ----------------------------------------------------------------- fenêtres vues du dedans ('<mur intérieur>Win', même v)
  // Le mur intérieur est redessiné avec sa propre graine (identique au mur voisin), puis la fenêtre par-dessus.
  // v0 saloon (rideaux rouges), v1 banque / gare (verts). Lignes 43-63 (lambris) inchangées.
  wallpaperWin(p, rand, c, v) {
    TX_WALLS.wallpaper(p, rng(hash(`w:wallpaper:${v}`)), c, v);
    const fr = '#3a1c0c', frL = '#7a4a26', frD = '#1e0c04', frM = '#5a2e16';
    const [cu, cuL, cuD] = v ? ['#1c4a32', '#2e6446', '#0e2c1a'] : ['#6a181c', '#8c2a2a', '#420c10'];
    const gold = '#c8a040', goldL = '#f0d070', goldD = '#7a5a1c';
    // croisée : dormant 19-44 x 7-37, vitre 21-42 x 9-36, 2 x 3 carreaux
    p.R(19, 7, 26, 31, fr); p.R(19, 7, 26, 1, frL); p.R(19, 7, 1, 31, frL); p.R(44, 8, 1, 30, frD);
    txDaylight(c, 21, 9, 22, 28, 16, v === 1);
    txGlassShade(c, 21, 9, 22, 28);
    for (const y of [17, 27]) { p.R(21, y, 22, 2, fr); p.R(21, y, 22, 1, frM); }
    p.R(31, 9, 2, 28, fr); p.R(31, 9, 1, 28, frM);
    txGlint(p, 23, 15, 5); txGlint(p, 34, 35, 4);
    // rideaux de velours retenus par une embrasse dorée, cantonnière à festons
    txLayer(c, (q) => {
      const aL = (y) => (y < 24 ? 14 : 14 - Math.round((y - 24) / 7));
      const bL = (y) => (y < 24 ? Math.round(24 - 6 * ((y - 10) / 14) ** 1.5) : Math.round(18 + 3 * ((y - 24) / 13) ** 0.8));
      const drape = (a, b) => {
        for (let y = 10; y <= 37; y++) {
          const xa = a(y), xb = b(y), n = xb - xa + 1, folds = Math.max(1, Math.round(n / 3.5));
          for (let x = xa; x <= xb; x++) {
            const f = ((x - xa + 0.5) / n * folds + 0.1) % 1;
            let col = f < 0.3 ? cuL : f < 0.64 ? cu : cuD;
            if (x === xa) col = cuL; else if (x === xb) col = cuD;
            if (y === 37) col = shade(col, -0.2);
            q.P(x, y, col);
          }
        }
      };
      drape(aL, bL); drape((y) => 63 - bL(y), (y) => 63 - aL(y));
      for (const [xa, xb, hook] of [[aL(24), bL(24), 11], [63 - bL(24), 63 - aL(24), 51]]) {
        for (let x = xa; x <= xb; x++) { q.P(x, 24, (x + xa) % 2 ? gold : goldL); q.P(x, 25, goldD); }
        const bx = hook < 32 ? xa - 2 : xb + 1, tx = hook < 32 ? xa : xb - 1;
        q.R(bx, 23, 2, 2, gold); q.P(bx, 23, goldL); q.P(bx + 1, 24, goldD);
        q.R(tx, 26, 2, 3, gold); q.P(tx, 26, goldL); q.R(tx, 29, 2, 1, goldD); q.P(tx + 1, 30, goldD);
      }
      for (let x = 12; x <= 51; x++) {
        const k = (x - 12) % 10, bot = 10 + Math.round(2.5 * Math.sin((Math.PI * k) / 10));
        for (let y = 4; y <= bot; y++) {
          let col = (x - 12) % 5 === 0 ? cuD : (x - 12) % 5 === 1 ? cuL : cu;
          if (y === 4) col = cuL; else if (y === 6) col = x % 2 ? gold : goldL; else if (y === 5) col = cuD;
          if (y === bot) col = x % 2 ? goldD : gold;
          q.P(x, y, col);
        }
      }
    }, [1, 1, 0.6]);
    // appui posé sur la cimaise
    txLayer(c, (q) => { q.R(16, 38, 32, 3, fr); q.R(16, 38, 32, 1, frL); q.R(16, 40, 32, 1, frD); q.P(16, 39, frM); }, [1, 1, 0.6]);
  },

  // Cantina : ébrasement d'adobe, châssis turquoise, la grille de fer de adobeWindow à contre-jour, un cactus en pot
  cantinaInWin(p, rand, c) {
    TX_WALLS.cantinaIn(p, rng(hash('w:cantinaIn:0')), c, 0);
    txRevealWin(p, c, rand, { x0: 13, y0: 20, x1: 36, y1: 38, d: 4, lit: '#d8ccb6', dark: '#a89a82', frame: ['#1e6a66', '#3a9a92'], grille: true, pot: 30 });
  },

  adobeWin(p, rand, c, v) {
    TX_WALLS.adobe(p, rng(hash(`w:adobe:${v}`)), c, v);
    const pl = TX_ADOBE[v].plaster;
    txRevealWin(p, c, rand, { x0: 22, y0: 19, x1: 41, y1: 38, d: 4, lit: shade(pl, 0.1), dark: shade(pl, -0.2), frame: v ? ['#2a6a8a', '#4a8aaa'] : ['#6a4426', '#9a6a40'], grille: true, pot: v ? null : 34, flip: v === 1 });
  },

  // Bardage peint (v = peinture), croisée simple à 2 x 2 carreaux dans le chambranle TX_TRIM[v] ; lignes 43-63 : bardage seul
  plankWin(p, rand, c, v) {
    TX_WALLS.plank(p, rng(hash(`w:plank:${v}`)), c, v);
    const trim = TX_TRIM[v], ws = shade(TX_PAINT[v], -0.45), x = 23, y = 16, w = 18, h = 21;
    txWindowFrame(p, x, y, w, h, trim, ws);
    txDaylight(c, x, y, w, h, 13, v % 2 === 1);
    txGlassShade(c, x, y, w, h);
    const td = shade(trim, -0.3), tl = shade(trim, 0.15);
    p.R(x + 8, y, 2, h, trim); p.R(x + 9, y, 1, h, td);
    p.R(x, y + 10, w, 2, trim); p.R(x, y + 10, w, 1, tl); p.R(x, y + 11, w, 1, td);
    p.R(x + 7, y + 9, 4, 1, '#c8a040'); p.P(x + 7, y + 9, '#f0d070');
    txGlint(p, x + 1, y + 7, 4); txGlint(p, x + 11, y + h - 2, 3);
  },

  // Brique, croisée sous linteau de pierre, barreaux à contre-jour (banque, prison)
  brickWin(p, rand, c, v) {
    TX_WALLS.brick(p, rng(hash(`w:brick:${v}`)), c, v);
    const B = TX_BRICK[v], s = B.band, sh = shade(s, 0.22), sd = shade(s, -0.35);
    const x0 = 22, x1 = 41, y0 = 18, y1 = 38;
    txField(c, (x, y, col) => {
      const l = x0 - x, r = x - x1, t = y0 - y, m = Math.max(l, r, t);
      if (m <= 0 || m > 3 || y > y1) return null;
      return txK(col, t === m ? 0.5 : l === m ? 0.66 : 0.92);
    }, x0 - 3, y0 - 3, x1 - x0 + 7, y1 - y0 + 4);
    txDaylight(c, x0 + 2, y0 + 2, x1 - x0 - 3, y1 - y0 - 3, 11, v === 1);
    txGlassShade(c, x0 + 2, y0 + 2, x1 - x0 - 3, y1 - y0 - 3);
    for (let x = x0 + 4; x < x1 - 1; x += 4) p.R(x, y0 + 2, 1, y1 - y0 - 3, '#2e2a2a');
    p.R(x0 + 2, y0 + 6, x1 - x0 - 3, 1, '#2e2a2a');
    const fr = '#4a2e18', frL = '#8a6038', frD = '#2a180a', mx = (x0 + x1) >> 1, my = (y0 + y1) >> 1;
    p.R(x0, y0, x1 - x0 + 1, 2, fr); p.R(x0, y1 - 1, x1 - x0 + 1, 2, fr); p.R(x0, y0, 2, y1 - y0 + 1, fr); p.R(x1 - 1, y0, 2, y1 - y0 + 1, fr);
    p.R(mx, y0, 2, y1 - y0 + 1, fr); p.R(x0, my, x1 - x0 + 1, 2, fr);
    p.R(x0, y0, x1 - x0 + 1, 1, frL); p.R(x0, y0, 1, y1 - y0 + 1, frL); p.R(mx, y0 + 1, 1, y1 - y0 - 1, frL); p.R(x0 + 1, my, x1 - x0 - 1, 1, frL);
    p.R(x1, y0 + 1, 1, y1 - y0, frD); p.R(x0 + 2, my + 1, x1 - x0 - 3, 1, frD);
    txGlint(p, x0 + 3, my - 2, 4); txGlint(p, mx + 3, y1 - 3, 3);
    p.R(x0 - 5, y0 - 8, x1 - x0 + 11, 5, s); p.R(x0 - 5, y0 - 8, x1 - x0 + 11, 1, sh); p.R(x0 - 5, y0 - 4, x1 - x0 + 11, 1, sd);
    p.R(29, y0 - 9, 6, 7, shade(s, 0.06)); p.R(29, y0 - 9, 6, 1, sh); p.R(29, y0 - 9, 1, 7, sh); p.R(34, y0 - 9, 1, 7, sd);
    p.R(x0 - 5, y1 + 1, x1 - x0 + 11, 3, s); p.R(x0 - 5, y1 + 1, x1 - x0 + 11, 1, sh); p.R(x0 - 5, y1 + 3, x1 - x0 + 11, 1, sd);
    p.R(x0 - 4, y1 + 4, x1 - x0 + 9, 1, shade(B.cols[0], -0.5));
  },

  // Chapelle : pierre grise, le vitrail en lancette vu du dedans (motif en miroir, plus saturé), ébrasement de pierre grise
  stoneWin(p, rand, c) {
    TX_WALLS.stone(p, rng(hash('w:stone:0')), c, 0);
    const L = 21, Rr = 43, sp = 24, base = 38;
    const inArch = (x, y, g) => {
      const X = x + 0.5, Y = y + 0.5;
      if (X < L - g || X > Rr + g || Y > base + g) return false;
      if (Y >= sp) return true;
      const r = Rr - L + g;
      return Math.hypot(X - Rr, Y - sp) <= r && Math.hypot(X - L, Y - sp) <= r;
    };
    const lead = txRGB('#1c1612'), stone = txRGB('#8a867e'), mortar = txRGB('#3e3a36'), nz = txNoise(rand, 4), nz2 = txNoise(rand, 2);
    const PAL = ['#2450c8', '#2450c8', '#2a5ad8', '#c42a2a', '#22a052', '#f0a428', '#8a34c4', '#3a7af0'].map(txRGB);
    txField(c, (x, y) => {
      if (inArch(x, y, 0)) {
        const xm = 63 - x, X = x - 31.5;
        const cross = (Math.abs(X) < 2 && y >= 10 && y <= 35) || (y >= 16 && y <= 19 && x >= 24 && x <= 39);
        const crossLead = (Math.abs(X) < 3 && y >= 9 && y <= 36) || (y >= 15 && y <= 20 && x >= 23 && x <= 40);
        if (cross) return Math.abs(X) < 1 || y === 17 || y === 18 ? '#fff4c0' : '#ffd860';
        if (crossLead) return lead;
        if ((xm + y) % 6 === 0 || (xm - y + 64) % 6 === 0) return lead;
        const a = Math.floor((xm + y) / 6), b = Math.floor((xm - y + 64) / 6), u = (xm + y) % 6;
        const glow = 1.06 + 0.16 * Math.max(0, 1 - Math.hypot(X, y - 20) / 16);
        return txK(PAL[(a * 7 + b * 13) % PAL.length], (u === 1 ? 1.28 : u >= 4 ? 0.84 : 1) * glow);
      }
      if (inArch(x, y, 1)) return lead;
      if (!inArch(x, y, 4)) return null;
      // ébrasement : appui éclairé, intrados dans l'ombre, jambage droit (tourné vers la lumière) plus clair que le gauche
      let k = y + 0.5 > base ? 1.14 : y < sp ? (x > 31 ? 0.82 : 0.68) : x < 32 ? 0.74 : 1.06;
      if (inArch(x, y, 2)) k *= 0.86;
      const ang = Math.atan2(y + 0.5 - sp, x + 0.5 - 32);
      if (y < sp && (((ang * 3) % 1) + 1) % 1 < 0.1) return txK(mortar, 1);
      if (y >= sp && y + 0.5 <= base && (y - sp) % 7 === 6) return mortar;
      return txK(stone, k * (0.94 + nz(x, y) * 0.08 + (nz2(x, y) - 0.5) * 0.06));
    });
    p.R(L - 5, 42, Rr - L + 11, 1, '#2e2c2a');
  },

  // ----------------------------------------------------------------- bureau du shérif, banque
  // Râtelier : bardage plank v1, trois fusils sur des chevilles et un ceinturon pendu ; tout tient dans les lignes 0-42
  gunrack(p, rand, c) {
    TX_WALLS.plank(p, rng(hash('w:plank:1')), c, 1);
    txLayer(c, (q) => {
      const rk = '#5a3418', rl = shade(rk, 0.3), rd = shade(rk, -0.4);
      for (const x of [10, 47]) {
        q.R(x, 4, 4, 28, rk); q.R(x, 4, 1, 28, rl); q.R(x + 3, 4, 1, 28, rd); q.R(x - 1, 3, 6, 2, rk); q.R(x - 1, 3, 6, 1, rl);
        q.P(x + 1, 6, '#2a2018'); q.P(x + 1, 29, '#2a2018');
      }
      [[9, 0], [17, 1], [25, 2]].forEach(([y, kind]) => {
        txRifle(q, 6, y, kind);
        for (const [px, py] of [[11, y + 3], [48, y + 2]]) { q.R(px, py, 3, 2, '#3a2010'); q.R(px, py, 3, 1, '#8a5a34'); }
      });
      // ceinturon à cartouchières et étui, pendu à une cheville
      const lt = '#8a5a2a', ll = '#b07a40', ld = '#4a2a10';
      for (let a = 0; a < 6.283; a += 0.05) {
        const x = 34 + Math.cos(a) * 6.5, y = 36 + Math.sin(a) * 5;
        q.R(Math.round(x), Math.round(y), 2, 2, Math.sin(a) < -0.3 ? ll : Math.cos(a) > 0.5 ? ld : lt);
      }
      for (let a = 0.35; a < 2.8; a += 0.38) q.P(Math.round(34 + Math.cos(a) * 7.5), Math.round(36 + Math.sin(a) * 6), '#d8b040');
      q.R(27, 37, 3, 3, '#c8a040'); q.P(28, 38, ld); q.P(27, 37, '#f0d070');
      q.R(33, 29, 3, 2, '#3a2414'); q.P(33, 29, '#7a5030');
      q.R(41, 31, 2, 4, '#4a2410'); q.P(41, 31, '#7a4428'); q.R(43, 32, 1, 2, '#3a3a42'); q.R(40, 33, 1, 1, '#5a5a62');
      q.poly([[39, 34], [45, 34], [44.5, 43], [41.5, 43]], '#6a3a18');
      q.R(39, 34, 1, 5, '#9a5a2a'); q.R(39, 34, 6, 1, '#9a5a2a');
      for (let y = 36; y < 42; y += 2) q.P(43, y, '#c8a060');
    }, [1, 1, 0.55]);
  },

  // Fond de la banque : porte de coffre ronde en acier (verrous, volant à 5 rayons, cadran) dans un bâti riveté ;
  // le papier peint vert de la banque (wallpaper v1) autour, cimaise et lambris (lignes 40-63) inchangés
  vault(p, rand, c) {
    TX_WALLS.wallpaper(p, rng(hash('w:wallpaper:1')), c, 1);
    const cx = 32, cy = 22;
    txLayer(c, (q, t) => {
      q.R(9, 5, 46, 35, '#40444a');
      q.R(9, 5, 46, 1, '#8a9098'); q.R(9, 5, 1, 35, '#7a8088'); q.R(9, 39, 46, 1, '#1a1c20'); q.R(54, 6, 1, 34, '#1a1c20');
      q.R(10, 6, 44, 1, '#5a6068'); q.R(10, 6, 1, 33, '#5a6068');
      for (let x = 12; x < 54; x += 6) for (const y of [7, 37]) if (Math.hypot(x - cx, y - cy) > 18.5) { q.P(x, y, '#a8aeb6'); q.P(x + 1, y + 1, '#16181c'); }
      for (let y = 9; y < 37; y += 6) for (const x of [11, 52]) if (Math.hypot(x - cx, y - cy) > 18.5) { q.P(x, y, '#a8aeb6'); q.P(x + 1, y + 1, '#16181c'); }
      const steel = txRGB('#7c828a'), face = txRGB('#6c7279'), groove = txRGB('#2a2c30');
      txField(t, (x, y) => {
        const dx = x + 0.5 - cx, dy = y + 0.5 - cy, d = Math.hypot(dx, dy);
        if (d > 16.5) return null;
        const facing = -(dx + dy) / Math.SQRT2 / Math.max(d, 0.01);
        if (d > 15.5) return '#121418';
        if (d > 12.5) return txK(steel, 1 + 0.38 * facing * (d > 14 ? 1 : -0.6));
        if (d > 11.5) return txK(groove, 1 - 0.3 * facing);
        return txK(face, (Math.floor(d) % 2 ? 1.02 : 0.97) * (1 + 0.12 * facing * (d / 11.5)));
      }, 14, 4, 37, 37);
      for (let k = 0; k < 8; k++) {
        const a = ((k + 0.5) / 8) * 6.283, bx = Math.round(cx + Math.cos(a) * 14 - 1), by = Math.round(cy + Math.sin(a) * 14 - 1);
        q.R(bx, by, 2, 2, '#c8ccd2'); q.P(bx, by, '#f0f2f4'); q.P(bx + 1, by + 1, '#4a4e54');
      }
      for (let k = 0; k < 5; k++) {
        const a = ((-54 + k * 72) * Math.PI) / 180, ca = Math.cos(a), sa = Math.sin(a);
        q.line(cx + ca * 3 + 1, cy + sa * 3 + 1, cx + ca * 7 + 1, cy + sa * 7 + 1, '#2a2c30');
        q.line(cx + ca * 3, cy + sa * 3, cx + ca * 7, cy + sa * 7, '#d0d4da');
        const kx = cx + ca * 8, ky = cy + sa * 8;
        q.disc(kx, ky, 1, '#c8a040'); q.P(Math.round(kx) - 1, Math.round(ky) - 1, '#f0d070'); q.P(Math.round(kx) + 1, Math.round(ky) + 1, '#6a4a18');
      }
      q.disc(cx, cy, 3, '#7a5a1c'); q.disc(cx, cy, 2, '#c8a040'); q.P(cx - 1, cy - 1, '#f0d070'); q.P(cx, cy, '#5a4010');
      q.disc(cx, 13, 2, '#2a2c30'); q.disc(cx, 13, 1, '#b8bcc2'); q.P(cx - 1, 12, '#e8eaee'); q.P(cx, 13, '#1a1a1e'); q.P(cx, 10, '#c8a040');
      for (const y of [12, 27]) { q.R(46, y, 6, 5, '#5a5e64'); q.R(46, y, 6, 1, '#9aa0a8'); q.R(46, y + 4, 6, 1, '#22252a'); }
      q.R(50, 10, 1, 24, '#b0b6be'); q.R(51, 10, 1, 24, '#7a8088'); q.R(52, 10, 1, 24, '#3a3e44'); q.R(50, 10, 3, 1, '#d0d4da'); q.R(50, 33, 3, 1, '#22252a');
    }, [1, 1, 0.55]);
  },
};

export function wallTex(id, v = 0) {
  const draw = TX_WALLS[id];
  if (!draw) return checker(TEX, TEX);
  const n = TX_VARS[id] || 1, vv = txMod(Math.floor(+v || 0), n);
  return memo(`w:${id}:${vv}`, () => txGrade(texture(`w:${id}:${vv}`, (p, rand, c) => draw(p, rand, c, vv))));
}

// =================================================================== affiche « WANTED » d'un joueur
// Affiche sur un mur (wallTex(base, baseV)) : WANTED, MORT OU VIF, portrait (hudFace) imprimé à l'encre, nom, prime.
// Tout le papier tient dans les lignes 0-42 (dedans, les lignes 43-63 se répètent sous le plafond).
const TX_LOOK = ['skin', 'hair', 'hairColor', 'eyes', 'eyeColor', 'nose', 'mouth', 'beard', 'hat', 'hatColor', 'outfit', 'outfitColor', 'extra'];
export function wantedPoster(base, baseV, character, name, reward) {
  const ch = character || {}, look = JSON.stringify(TX_LOOK.map((k) => ch[k]));
  const rw0 = String(reward ?? '?'), rw1 = rw0.startsWith('$') ? rw0 : '$' + rw0;
  return memo(`wp:${base}:${baseV}:${look}:${name}:${rw1}`, () => {
    const c = canvas(TEX, TEX), ctx = c.getContext('2d');
    ctx.drawImage(wallTex(base, baseV), 0, 0);
    // papier dessiné à part (étalonné comme les murs), puis posé sur le mur
    const pc = canvas(TEX, TEX), p = pen(pc), rand = rng(hash(`wp:${look}:${name}:${rw1}`));
    const paper = '#e2d1a2', aged = '#c4aa76', ink = '#3a2614', red = '#8a1e12';
    const x0 = 8, y0 = 0, w = 48, h = 43; // papier sur les lignes 0-42 (ombre portée à droite seulement)
    p.R(x0, y0, w, h, paper);
    for (let i = 0; i < 70; i++) p.P(x0 + Math.floor(rand() * w), y0 + (rand() < 0.5 ? 0 : h - 1), aged);
    for (let i = 0; i < 30; i++) p.P(x0 + (rand() < 0.5 ? 0 : w - 1), y0 + Math.floor(rand() * h), aged);
    for (let i = 0; i < 18; i++) p.P(x0 + 1 + Math.floor(rand() * (w - 2)), y0 + 1 + Math.floor(rand() * (h - 2)), '#d4c08e');
    p.ell(x0 + 8 + rand() * 30, y0 + 30 + rand() * 6, 3, 2, '#d6c08c');
    // WANTED en gras, MORT OU VIF en rouge
    const cx = (str, s = 1, gap = s, nar = false) => x0 + ((w - txTextW(str, s, gap, nar)) >> 1);
    // gras : la même ligne tirée deux fois, décalée d'un pixel, avec 2 px entre les lettres pour qu'elles restent séparées
    const tw = x0 + ((w - txTextW('WANTED', 1, 2) - 1) >> 1);
    txText(p.R, 'WANTED', tw, y0 + 2, ink, 1, 2); txText(p.R, 'WANTED', tw + 1, y0 + 2, ink, 1, 2);
    txText(p.R, "MORT OU VIF", cx("MORT OU VIF"), y0 + 8, red);
    // portrait : tête de hudFace (lignes 5-19), passée à l'encre sépia ; fond bleu → hachures de gravure
    const fx = x0 + 12, fy = y0 + 15, fw = 24, fh = 14, crop = 5;
    p.R(fx - 1, fy - 1, fw + 2, fh + 2, ink);
    const fd = hudFace(ch, 1, 'idle').getContext('2d').getImageData(0, crop, fw, fh).data;
    const RAMP = ['#3a2614', '#6a4a2c', '#9a7a52', '#c8ae80', paper];
    const isBg = (k) => fd[k + 2] > fd[k] + 10 && fd[k + 2] >= fd[k + 1];
    const lum = (k) => 0.3 * fd[k] + 0.59 * fd[k + 1] + 0.11 * fd[k + 2];
    // contraste étiré sur la tête seule : un teint sombre reste lisible une fois imprimé
    const Ls = [];
    for (let k = 0; k < fd.length; k += 4) if (!isBg(k)) Ls.push(lum(k));
    Ls.sort((a, b) => a - b);
    const lo = Ls.length ? Ls[Math.floor(Ls.length * 0.04)] : 0, hi = Ls.length ? Ls[Math.floor(Ls.length * 0.96)] : 255;
    for (let j = 0; j < fh; j++) for (let i = 0; i < fw; i++) {
      const k = (j * fw + i) * 4;
      let col;
      if (isBg(k)) col = (i + j) % 3 === 0 ? RAMP[2] : RAMP[3];
      else {
        const t = clamp((lum(k) - lo) / Math.max(1, hi - lo), 0, 1);
        col = RAMP[t < 0.14 ? 0 : t < 0.38 ? 1 : t < 0.62 ? 2 : t < 0.86 ? 3 : 4];
      }
      p.P(fx + i, fy + j, col);
    }
    // nom (en capitales, tronqué pour tenir) et prime
    let nm = deaccent(String(name || '?')).trim() || '?';
    while (nm.length > 1 && txTextW(nm, 1, 1, true) > w - 4) nm = nm.slice(0, -1);
    txText(p.R, nm, cx(nm, 1, 1, true), y0 + 31, ink, 1, 1, true);
    let rs = rw1;
    while (rs.length > 1 && txTextW(rs) > w - 4) rs = rs.slice(0, -1);
    txText(p.R, rs, cx(rs), y0 + 37, red);
    // papier déchiré : coin bas droit arraché, encoche à gauche, bord du bas grignoté
    const erase = (x, y) => p.ctx.clearRect(x, y, 1, 1);
    for (let k = 0; k < 4; k++) for (let i = 0; i <= k; i++) erase(x0 + w - 1 - i, y0 + h - 4 + k);
    for (let k = 0; k < 4; k++) p.P(x0 + w - 2 - k, y0 + h - 4 + k, aged);
    erase(x0, y0 + 22); erase(x0, y0 + 23); erase(x0 + 1, y0 + 23); p.P(x0 + 1, y0 + 22, aged); p.P(x0 + 2, y0 + 23, aged);
    for (let i = 0; i < 5; i++) erase(x0 + 2 + Math.floor(rand() * (w - 10)), y0 + h - 1);
    // clous aux deux coins du haut
    for (const nx of [x0 + 2, x0 + w - 4]) { p.R(nx, y0 + 1, 2, 2, '#4a4a50'); p.P(nx, y0 + 1, '#b0b0b8'); p.P(nx + 1, y0 + 3, '#8a7650'); }
    txGrade(pc);
    ctx.drawImage(pc, 0, 0);
    // ombre portée du papier sur le mur (à droite) : le mur lui-même assombri, pas un trait noir
    const img = ctx.getImageData(x0 + w, y0 + 2, 1, h - 2), d = img.data;
    for (let i = 0; i < d.length; i += 4) { d[i] *= 0.5; d[i + 1] *= 0.48; d[i + 2] *= 0.52; }
    ctx.putImageData(img, x0 + w, y0 + 2);
    return opaque(hardAlpha(c));
  });
}

// =================================================================== sols et plafonds
function txGravel(c, rand, n, pal, gap, light = 0.9) {
  const m = txCellMap(rand, n, true, 2);
  const cols = m.pts.map(() => txRGB(txPick(rand, pal)));
  const g = txRGB(gap), nz = txNoise(rand, 2);
  txField(c, (x, y) => {
    const k = y * TEX + x;
    if (m.e[k] < 0.9) return txK(g, 0.85 + nz(x, y) * 0.3);
    return txK(cols[m.id[k]], txCellLight(m, x, y, light) * (0.92 + nz(x, y) * 0.16));
  });
}
function txFloorBoards(p, rand, c, cols, seam, opt = {}) {
  const w = txWP(p, true);
  for (let b = 0; b < 8; b++) {
    const y = b * 8, col = txPick(rand, cols), hi = shade(col, 0.15), lo = shade(col, -0.22), gr = shade(col, -0.12);
    p.R(0, y, 64, 8, col);
    p.R(0, y, 64, 1, seam); p.R(0, y + 1, 64, 1, hi); p.R(0, y + 7, 64, 1, lo);
    for (let i = 0; i < 9; i++) w.R(rand() * 64, y + 2 + Math.floor(rand() * 5), 3 + rand() * 12, 1, gr);
    if (opt.sheen) w.R(rand() * 64, y + 2, 10 + rand() * 14, 1, shade(col, 0.22));
    const jx = (b * 23 + Math.floor(rand() * 10)) % 64;
    w.R(jx, y + 1, 1, 7, seam); w.R(jx + 1, y + 1, 1, 7, hi);
    // clous sur les solives : discrets (un ton sous la planche), un peu de jeu d'une planche à l'autre
    const nail = opt.nail || shade(col, -0.42);
    for (const nx of [4, 36]) { const ox = nx + (b % 3 === 1 ? 1 : 0); w.P(ox, y + 2, nail); w.P(ox, y + 5, nail); w.P(ox + 1, y + 2, hi); }
    w.P(jx - 2, y + 3, nail); w.P(jx + 2, y + 3, nail);
  }
}

const TX_FLATS = {
  // damier de marbre noir et blanc (carreaux de 16 px, veines différentes d'un carreau à l'autre), joints fins
  bankFloor(p, rand, c) {
    const nz = txFbm(rand, [16, 8, 4], [0.5, 0.3, 0.2]), cl = txFbm(rand, [32, 16], [0.6, 0.4]), fine = txNoise(rand, 2);
    const W = txRGB('#e2ded4'), Wv = txRGB('#8e8a84'), Bk = txRGB('#242220'), Bv = txRGB('#5a5856'), grout = txRGB('#8a847a');
    const off = Array.from({ length: 16 }, () => [Math.floor(rand() * 64), Math.floor(rand() * 64)]);
    txField(c, (x, y) => {
      const u = x % 16, v = y % 16, ti = (y >> 4) * 4 + (x >> 4), white = ((x >> 4) + (y >> 4)) % 2 === 0;
      if (u === 15 || v === 15) return txK(grout, 0.85 + fine(x, y) * 0.2);
      const [ox, oy] = off[ti], r = Math.abs(nz(x + ox, y + oy) - 0.5);
      let col = white ? txLerp(W, txRGB('#d4cec2'), cl(x + ox, y + oy)) : txLerp(Bk, txRGB('#302c2a'), cl(x + ox, y + oy));
      const vein = white ? Wv : Bv;
      if (r < 0.014) col = txLerp(col, vein, white ? 0.7 : 0.5); else if (r < 0.035) col = txLerp(col, vein, white ? 0.22 : 0.16);
      let k = 0.97 + fine(x * 2, y * 2) * 0.05;
      if (u === 0 || v === 0) k *= white ? 1.03 : 1.18; else if (u === 14 || v === 14) k *= white ? 0.88 : 0.8;
      return txK(col, k);
    });
  },

  sand(p, rand, c) {
    const base = txRGB('#d6ae74'), nz = txFbm(rand, [32, 16, 8]), amp = txFbm(rand, [32, 16], [0.6, 0.4]), nz2 = txNoise(rand, 2);
    txField(c, (x, y) => {
      const t = y + 2.5 * Math.sin((x / 64) * 6.283) + 1.6 * Math.sin(((2 * x + y) / 64) * 6.283) + (nz(x, y) - 0.5) * 4;
      const ph = txMod(t, 8), a = clamp((amp(x, y) - 0.35) * 3, 0, 1);
      let k = 0.95 + nz(x, y) * 0.1;
      if (ph < 1) k += 0.1 * a; else if (ph < 2.5) k -= 0.1 * a;
      return txK(base, k + (nz2(x, y) - 0.5) * 0.06);
    });
    const w = txWP(p, true);
    for (let i = 0; i < 10; i++) { const x = rand() * 64, y = rand() * 64, col = txPick(rand, ['#8a7058', '#a08870', '#6a5848', '#c8b098']); w.R(x, y, 2, 1, col); w.R(x, y + 1, 2, 1, '#a88454'); if (rand() < 0.4) w.P(x + 2, y, col); }
    grain(c, 0, 0, 64, 64, rand, 0.06, 0.6);
  },

  dirt(p, rand, c) {
    const a = txRGB('#8e6a48'), b = txRGB('#a07a55'), d = txRGB('#806042'), nz = txFbm(rand, [16, 8, 4], [0.35, 0.4, 0.25]), nz2 = txNoise(rand, 2);
    txField(c, (x, y) => {
      const n = nz(x, y);
      const col = n < 0.42 ? txLerp(d, a, clamp((n - 0.2) / 0.22, 0, 1)) : txLerp(a, b, clamp((n - 0.42) / 0.3, 0, 1));
      return txK(col, 0.95 + (nz2(x, y) - 0.5) * 0.1);
    });
    const w = txWP(p, true);
    // empreintes de sabots (creux en fer à cheval, bord éclairé en bas)
    // par paires décalées (piste d'un cheval), creux peu profonds : bord bas éclairé, fourchette au milieu
    const hoof = (x, y) => {
      w.ell(x, y + 1, 2.5, 2, '#a88260');
      w.ell(x, y, 2.5, 2, '#6c503a');
      w.R(x - 1, y - 1, 3, 2, '#7a5c42'); w.P(x, y + 1, '#7a5c42');
      w.P(x, y + 2, '#8a6848');
    };
    for (let i = 0; i < 3; i++) {
      const x = Math.floor(rand() * 64), y = Math.floor(rand() * 64), d = rand() < 0.5 ? 1 : -1;
      hoof(x, y); hoof(x + 7 * d, y + 9);
    }
    // fines craquelures de terre sèche
    for (let i = 0; i < 3; i++) txCrack(p, rand, Math.floor(rand() * 64), Math.floor(rand() * 64), 5 + Math.floor(rand() * 5), '#6a4e34', null, true);
    for (let i = 0; i < 16; i++) { const x = rand() * 64, y = rand() * 64, col = txPick(rand, ['#b0a490', '#8a7e70', '#c8b8a0', '#6e6258']); w.R(x, y, 1 + Math.floor(rand() * 2), 1, col); w.R(x, y + 1, 2, 1, '#5a4430'); }
    grain(c, 0, 0, 64, 64, rand, 0.07, 0.6);
  },

  grass(p, rand, c) {
    const a = txRGB('#9a7a52'), b = txRGB('#8a7a4a'), nz = txFbm(rand, [16, 8, 4]), nz2 = txNoise(rand, 2);
    txField(c, (x, y) => txK(txLerp(a, b, nz(x, y)), 0.92 + (nz2(x, y) - 0.5) * 0.12));
    const w = txWP(p, true);
    const BL = ['#c8b060', '#a8a048', '#8a8a3a', '#d8c070', '#7a8a40', '#b8a050'];
    for (let i = 0; i < 36; i++) {
      const x = rand() * 64, y = rand() * 64, n = 4 + Math.floor(rand() * 5);
      w.disc(x, y, 1, '#5a5226');
      for (let j = 0; j < n; j++) {
        const ang = rand() * 6.283, len = 2 + rand() * 3.5;
        w.line(x, y, x + Math.cos(ang) * len, y + Math.sin(ang) * len * 0.8, txPick(rand, BL));
      }
      w.P(x, y, '#4a4420');
    }
    for (let i = 0; i < 8; i++) { const x = rand() * 64, y = rand() * 64; w.P(x, y, '#b0a490'); w.P(x, y + 1, '#5a4430'); }
    grain(c, 0, 0, 64, 64, rand, 0.06, 0.5);
  },

  boardwalk(p, rand, c) {
    txFloorBoards(p, rand, c, ['#9a7a58', '#8e7254', '#a08462', '#88705a', '#9a8064'], '#1a120c');
    const w = txWP(p, true);
    for (let i = 0; i < 3; i++) { const x = rand() * 64, y = Math.floor(rand() * 8) * 8 + 4; w.ell(x, y, 2, 1, '#5a4430'); w.P(x, y, '#3a2a1c'); }
    grain(c, 0, 0, 64, 64, rand, 0.07, 0.5);
  },

  saloonFloor(p, rand, c) {
    txFloorBoards(p, rand, c, ['#6a3c20', '#5e3418', '#744426', '#64381c'], '#200e06', { sheen: true, nail: '#2e1609' });
    const w = txWP(p, true);
    const kx = rand() * 64, ky = Math.floor(rand() * 8) * 8 + 4;
    w.ell(kx, ky, 3, 1, '#4a2410'); w.ell(kx, ky, 1, 1, '#2a1208'); w.P(kx - 3, ky - 1, '#7a4a2a');
    const sx = rand() * 64, sy = rand() * 64;
    w.ell(sx, sy, 4, 2, '#4e2a14'); w.ell(sx + 2, sy + 1, 2, 1, '#462410');
    grain(c, 0, 0, 64, 64, rand, 0.05, 0.5);
  },

  tiles(p, rand, c) {
    const cols = ['#b05a38', '#a85030', '#c0683e', '#9a4a2c', '#b86040'].map(txRGB), nz = txFbm(rand, [16, 8, 4]), nz2 = txNoise(rand, 2);
    const tc = Array.from({ length: 16 }, () => txPick(rand, cols));
    const grout = txRGB('#8a7a68');
    txField(c, (x, y) => {
      const u = x % 16, v = y % 16, t = tc[Math.floor(y / 16) * 4 + Math.floor(x / 16)];
      if (u === 15 || v === 15) return txK(grout, 0.95 + nz2(x, y) * 0.1);
      let k = 0.92 + nz(x, y) * 0.16;
      if (u === 0 || v === 0) k *= 1.14; else if (u === 14 || v === 14) k *= 0.78;
      return txK(t, k + (nz2(x * 2, y * 2) - 0.5) * 0.06);
    });
    const w = txWP(p, true);
    for (let i = 0; i < 4; i++) { const tx = Math.floor(rand() * 4) * 16, ty = Math.floor(rand() * 4) * 16; w.R(tx + 2, ty + 4, 2, 1, '#8a3a20'); w.P(tx + 3, ty + 3, '#8a3a20'); }
    // cabochons de Talavera aux croisements
    for (let ty = 0; ty < 4; ty++) for (let tx = 0; tx < 4; tx++) if ((tx + ty) % 2 === 0) {
      const cx = tx * 16 + 15, cy = ty * 16 + 15;
      for (let k = 0; k < 3; k++) { w.R(cx - k, cy - 2 + k, 2 * k + 1, 1, '#ece4d0'); w.R(cx - k, cy + 2 - k, 2 * k + 1, 1, '#ece4d0'); }
      w.P(cx, cy, '#2a4aa8'); w.P(cx - 1, cy, '#3a6ad0'); w.P(cx + 1, cy, '#3a6ad0'); w.P(cx, cy - 1, '#3a6ad0'); w.P(cx, cy + 1, '#3a6ad0');
      w.P(cx, cy - 3, '#6a5a48'); w.P(cx - 3, cy, '#6a5a48');
    }
    grain(c, 0, 0, 64, 64, rand, 0.05, 0.4);
  },

  flagstone(p, rand, c) {
    const m = txCellMap(rand, -4, true, 6);
    const pal = ['#a89a84', '#9a8a72', '#b4a88e', '#8a7e6a', '#a0907a', '#bcae94'].map(txRGB);
    const cols = m.pts.map(() => txPick(rand, pal)), nz = txFbm(rand, [16, 8, 4]), nz2 = txNoise(rand, 2);
    const mortar = txRGB('#5a4a38');
    txField(c, (x, y) => {
      const k = y * TEX + x;
      if (m.e[k] < 1.4) return txK(mortar, 0.85 + nz2(x, y) * 0.3);
      return txK(cols[m.id[k]], txCellLight(m, x, y, 0.8) * (0.9 + nz(x, y) * 0.18) + (nz2(x * 2, y * 2) - 0.5) * 0.06);
    });
    grain(c, 0, 0, 64, 64, rand, 0.07, 0.5);
  },

  gravel(p, rand, c) {
    txGravel(c, rand, 120, ['#7c7268', '#867c72', '#70685e', '#928678', '#6a6258', '#857664'], '#3a322a', 0.85);
    grain(c, 0, 0, 64, 64, rand, 0.06, 0.5);
  },

  railsX(p, rand, c) {
    txGravel(c, rand, 150, ['#665e56', '#6e645a', '#5e564e', '#746a5c', '#6a6054'], '#463c32', 0.5);
    const w = txWP(p, true);
    for (let x = 0; x < 64; x += 16) {
      const tw = 8, y0 = 9, y1 = 55, wood = shade('#5e4430', (rand() - 0.5) * 0.15);
      w.R(x + 1, y0 + 1, tw, y1 - y0, '#1a1410');
      w.R(x, y0, tw, y1 - y0, wood); w.R(x, y0, 1, y1 - y0, shade(wood, 0.2)); w.R(x + tw - 1, y0, 1, y1 - y0, shade(wood, -0.35));
      w.R(x, y0, tw, 1, shade(wood, 0.25)); w.R(x, y1 - 1, tw, 1, shade(wood, -0.4));
      for (let i = 0; i < 7; i++) w.R(x + 1 + Math.floor(rand() * (tw - 2)), y0 + rand() * (y1 - y0 - 6), 1, 3 + rand() * 8, shade(wood, -0.2));
      w.R(x + 3, y0 + 6 + rand() * 30, 1, 5, '#2a1e14');
    }
    for (const ry of [16, 45]) {
      for (let x = 0; x < 64; x += 16) { w.R(x - 1, ry - 2, 10, 9, '#2c2826'); w.R(x - 1, ry - 2, 10, 1, '#4a4440'); w.P(x, ry - 1, '#6a6460'); w.P(x + 7, ry + 5, '#6a6460'); w.P(x, ry + 5, '#121010'); w.P(x + 7, ry - 1, '#121010'); }
      w.R(0, ry, 64, 1, '#3a3836'); w.R(0, ry + 1, 64, 1, '#6e6c6a'); w.R(0, ry + 2, 64, 1, '#d0d4d8'); w.R(0, ry + 3, 64, 1, '#8a8c90'); w.R(0, ry + 4, 64, 1, '#2a2826');
      w.R(0, ry + 5, 64, 1, '#161412');
      for (let i = 0; i < 6; i++) w.R(rand() * 64, ry + (rand() < 0.5 ? 0 : 4), 2 + rand() * 4, 1, '#6a3e24');
      for (let x = 0; x < 64; x += 32) w.R(x + 12, ry + 1, 1, 3, '#2a2826');
    }
  },

  woodCeil(p, rand, c) {
    txFloorBoards(p, rand, c, ['#6a4a30', '#5e422a', '#72503a', '#664630'], '#1a100a');
    const w = txWP(p, true);
    p.R(22, 0, 3, 64, '#2a1a10'); p.R(39, 0, 3, 64, '#2a1a10');
    txTimber(w, rand, 25, 0, 14, 64, '#4e321e');
    for (const y of [10, 42]) { p.R(29, y, 6, 6, '#2a2624'); p.R(29, y, 6, 1, '#5a5450'); p.P(30, y + 2, '#8a8480'); p.P(33, y + 3, '#8a8480'); }
    grain(c, 25, 0, 14, 64, rand, 0.05, 0.4);
  },

  rockCeil(p, rand, c) {
    txMineRock(p, rand, c, true, ['#5a524a', '#625a50', '#4e4840', '#6a6056', '#564e46'], -4, '#14110e');
  },

  beamCeil(p, rand, c) {
    const pl = txRGB('#d8c4a2'), nz = txFbm(rand, [16, 8, 4]), nz2 = txNoise(rand, 2);
    txField(c, (x, y) => txK(pl, 0.92 + nz(x, y) * 0.12 + (nz2(x, y) - 0.5) * 0.05));
    txCrack(p, rand, 22, 10, 10, '#9a8668', '#ece0c8', true);
    grain(c, 0, 0, 64, 64, rand, 0.04, 0.4);
    const w = txWP(p, true);
    const sh = ['#3a2414', '#5a3a22', '#7a5434', '#9a7048', '#b08458', '#9a7048', '#7a5434', '#6a4628', '#5a3a22', '#3a2414'];
    for (const x0 of [5, 37]) {
      p.R(x0 - 2, 0, 2, 64, '#a89474'); p.R(x0 + 10, 0, 3, 64, '#988466');
      for (let i = 0; i < 10; i++) p.R(x0 + i, 0, 1, 64, sh[i]);
      for (let i = 0; i < 10; i++) w.R(x0 + 1 + Math.floor(rand() * 8), rand() * 64, 1, 3 + rand() * 9, '#4a2e1a');
      for (let i = 0; i < 3; i++) { const ky = rand() * 64; w.ell(x0 + 4, ky, 1, 2, '#3a2414'); w.P(x0 + 3, ky - 2, '#c89a6a'); }
    }
  },
};

export function flatTex(id) {
  if (id === 'railsY') {
    return memo('f:railsY', () => {
      const src = flatTex('railsX'), c = canvas(TEX, TEX);
      const s = src.getContext('2d').getImageData(0, 0, TEX, TEX), ctx = c.getContext('2d'), d = ctx.createImageData(TEX, TEX);
      for (let y = 0; y < TEX; y++) for (let x = 0; x < TEX; x++) {
        const i = (y * TEX + x) * 4, j = (x * TEX + y) * 4;
        for (let k = 0; k < 4; k++) d.data[i + k] = s.data[j + k];
      }
      ctx.putImageData(d, 0, 0);
      return c;
    });
  }
  const draw = TX_FLATS[id];
  if (!draw) return checker(TEX, TEX);
  return memo(`f:${id}`, () => txGrade(texture(`f:${id}`, draw)));
}

// ------------------------------------------------------------------ 1b) murs et sols en plus (ville, abords, mine)
// Enregistrés dans TX_WALLS / TX_VARS / TX_FLATS de walls.js (même module) : wallTex et flatTex les trouvent seuls.

// =================================================================== outils
// Ciel-clé (transparent en jeu) : seulement dans les toits du train
const TW2_SEE = '#9fb8c8';
const tw2IsSee = (d, i) => d[i] === 0x9f && d[i + 1] === 0xb8 && d[i + 2] === 0xc8;
// Grain qui épargne le ciel-clé
function tw2Grain(c, x, y, w, h, rand, amt = 0.06, density = 0.4) {
  const ctx = c.getContext('2d'), img = ctx.getImageData(x, y, w, h), d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    if (tw2IsSee(d, i) || rand() > density) continue;
    const k = 1 + (rand() * 2 - 1) * amt;
    d[i] = clamp(d[i] * k, 0, 255); d[i + 1] = clamp(d[i + 1] * k, 0, 255); d[i + 2] = clamp(d[i + 2] * k, 0, 255);
  }
  ctx.putImageData(img, x, y);
}
// Assombrit (k < 1) ou éclaircit une zone telle qu'elle est déjà peinte ; k nombre ou k(x, y)
function tw2Dim(c, x, y, w, h, k) {
  txField(c, (xx, yy, cur) => txK(cur, typeof k === 'function' ? k(xx, yy) : k), x, y, w, h);
}
// Volume de révolution vu de profil (cheminée, dôme, cloche) : demi-largeur hw(y) autour de cx (null : rien),
// ombré comme un cylindre éclairé d'en haut à gauche, bord sombre, dessus éclairé
function tw2Solid(c, cx, y0, y1, hw, col, o = {}) {
  const base = txRGB(col);
  const inside = (x, y) => { if (y < y0 || y >= y1) return false; const h = hw(y); return h != null && h > 0 && Math.abs(x + 0.5 - cx) <= h; };
  txField(c, (x, y) => {
    if (!inside(x, y)) return null;
    const h = hw(y), d = (x + 0.5 - cx) / h, u = (d + 1) / 2;
    let k = 0.6 + 0.78 * Math.exp(-(((u - 0.3) / 0.19) ** 2)) + 0.12 * Math.exp(-(((u - 0.75) / 0.15) ** 2)) - 0.12 * u;
    if (!inside(x - 1, y) || !inside(x + 1, y)) k *= 0.55;
    else if (!inside(x, y - 1)) k *= 1.22;
    else if (!inside(x, y + 1)) k *= 0.7;
    if (o.k) k *= o.k(x, y);
    return txK(base, k);
  }, 0, Math.max(0, y0), TEX, Math.min(TEX, y1) - Math.max(0, y0));
}

// =================================================================== 1. enseigne accrochée à l'adobe / à la brique
// Le panneau de la texture sign (lignes 15-36 : mot, couleurs et taille identiques), sans le bardage derrière
function tw2SignBoard(p, rand, s) {
  const [word, board, ink] = TX_SIGNS[s];
  const x0 = 1, y0 = 15, w = 62, h = 22;
  p.R(x0, y0, w, h, shade(board, -0.45));
  txBevel(p, x0 + 1, y0 + 1, w - 2, h - 2, shade(board, 0.15), true, 0.3);
  p.R(x0 + 3, y0 + 3, w - 6, h - 6, board);
  p.R(x0 + 3, y0 + 3, w - 6, 1, shade(board, -0.35));
  for (let i = 0; i < 16; i++) p.R(x0 + 4 + rand() * (w - 10), y0 + 4 + Math.floor(rand() * (h - 8)), 2 + rand() * 6, 1, shade(board, rand() < 0.5 ? -0.12 : 0.08));
  const fil = mix(board, ink, 0.45);
  p.R(x0 + 5, y0 + 4, w - 10, 1, fil); p.R(x0 + 5, y0 + h - 5, w - 10, 1, fil);
  const fit = [[2, 2, false, 8], [2, 1, false, 6], [2, 1, true, 8], [1, 1, false, 8]].find(([a, b, n, m]) => txTextW(word, a, b, n) <= w - m);
  const [sz, lg, nar] = fit, tw = txTextW(word, sz, lg, nar);
  const tx = x0 + ((w - tw) >> 1), ty = y0 + ((h - 5 * sz) >> 1);
  txText(p.R, word, tx + 1, ty + 1, shade(board, -0.6), sz, lg, nar);
  txText(p.R, word, tx, ty, ink, sz, lg, nar);
  const gap = (w - 6 - tw) >> 1;
  if (gap >= 8) for (const ox of [x0 + 3 + (gap >> 1), x0 + w - 4 - (gap >> 1)]) {
    const oy = y0 + (h >> 1);
    p.P(ox, oy - 2, ink); p.R(ox - 1, oy - 1, 3, 1, ink); p.R(ox - 2, oy, 5, 1, ink); p.R(ox - 1, oy + 1, 3, 1, ink); p.P(ox, oy + 2, ink);
  }
  for (let i = 0; i < 6; i++) { const ex = x0 + 3 + Math.floor(rand() * (w - 6)), ey = y0 + 3 + Math.floor(rand() * (h - 6)); p.R(ex, ey, 1 + Math.floor(rand() * 2), 1, shade(board, -0.25)); }
  for (const [nx, ny] of [[x0 + 1, y0 + 1], [x0 + w - 2, y0 + 1], [x0 + 1, y0 + h - 2], [x0 + w - 2, y0 + h - 2]]) p.P(nx, ny, '#2a2420');
}
// Éclat d'enduit : l'adobe apparaît dans un petit creux (ombre en haut à gauche, lèvre claire en bas)
function tw2Chip(p, x, y, w, A) {
  const br = A.brick;
  p.R(x, y, w, 2, br); p.R(x + 1, y + 2, Math.max(1, w - 2), 1, br);
  p.R(x, y, w, 1, shade(br, -0.4)); p.P(x, y + 1, shade(br, -0.3));
  p.P(x + w - 1, y + 1, shade(br, 0.12));
  p.R(x + 1, y + 3, Math.max(1, w - 2), 1, shade(A.plaster, 0.14));
  if (w > 3) p.P(x + 2, y + 1, A.mortar);
}

function tw2SignAdobe(p, rand, c, v) {
  const s = v >> 1, wv = v & 1, A = TX_ADOBE[wv];
  // pas de grande plaque d'adobe à nu coupée par le panneau : l'enduit reste entier autour
  txAdobeWall(p, rand, c, wv, (x, y) => y > 9 && y < 44);
  txVigaEnds(p, [12, 44], 5, A.plaster);
  // ombre douce sous le panneau (décalée d'un pixel vers la droite) et le long de son chant droit
  tw2Dim(c, 2, 37, 62, 4, (x, y) => [0.5, 0.64, 0.8, 0.92][y - 37]);
  tw2Dim(c, 63, 17, 1, 20, 0.66);
  // quelques éclats d'enduit autour
  const spots = [[3 + Math.floor(rand() * 4), 11], [50 + Math.floor(rand() * 6), 12], [7 + Math.floor(rand() * 8), 42], [44 + Math.floor(rand() * 10), 41]];
  for (const [x, y] of spots) tw2Chip(p, x, y, 3 + Math.floor(rand() * 3), A);
  tw2SignBoard(p, rand, s);
  // deux pattes de fer plat scellées dans l'enduit (chapeau boulonné), rabattues sur le cadre ; coulure de rouille
  const ir = '#2a2624', ih = '#6a625c';
  for (const x of [21, 41]) {
    p.R(x + 2, 12, 1, 7, shade(A.plaster, -0.3));
    p.R(x - 1, 10, 4, 2, ir); p.R(x - 1, 10, 4, 1, ih);
    p.R(x, 12, 2, 7, ir); p.R(x, 12, 1, 7, ih);
    p.P(x - 1, 10, '#9a948e'); p.P(x + 2, 10, '#9a948e');
    p.R(x + 3, 11, 1, 3, mix(A.plaster, '#7a3a1a', 0.45)); p.P(x + 3, 14, mix(A.plaster, '#7a3a1a', 0.25));
    p.P(x, 17, '#9a948e'); p.P(x + 1, 18, '#120e0c');
  }
}

function tw2SignBrick(p, rand, c, v) {
  const s = v >> 1, wv = v & 1;
  txBrickWall(p, rand, c, wv);
  // suie et ombre sous le panneau, crasse coulée juste au-dessus
  tw2Dim(c, 1, 37, 63, 4, (x, y) => [0.4, 0.56, 0.76, 0.9][y - 37]);
  tw2Dim(c, 63, 16, 1, 21, 0.6);
  tw2Dim(c, 2, 13, 60, 2, (x, y) => (y === 14 ? 0.8 : 0.9));
  tw2SignBoard(p, rand, s);
  // deux équerres de fer : bras sous le panneau, jambe sur le mur, jambe de force en biais
  const ir = '#2a2624', ih = '#6a6460';
  for (const bx of [8, 54]) {
    tw2Dim(c, bx + 2, 39, 1, 9, 0.62);
    p.R(bx - 3, 37, 10, 2, ir); p.R(bx - 3, 37, 10, 1, ih);
    p.R(bx, 37, 2, 10, ir); p.R(bx, 38, 1, 9, ih);
    for (let k = 0; k < 5; k++) { p.P(bx + 2 + k, 45 - k * 1.5, ir); p.P(bx + 2 + k, 44 - k * 1.5, ir); }
    p.P(bx, 40, '#9a948e'); p.P(bx, 45, '#9a948e'); p.P(bx + 1, 46, '#120e0c');
    p.P(bx + 5, 37, '#9a948e');
  }
}

// =================================================================== 2. gare : bardage nu, étage sous corniche
const TW2_ST_PAINT = '#cdb070', TW2_ST_TRIM = '#5a3a22';
function tw2StationWall(p, rand, c) {
  const paint = TW2_ST_PAINT, trim = TW2_ST_TRIM;
  txSiding(p, rand, c, paint, 6);
  txVBoards(p, rand, c, 0, 42, 64, 22, '#3c5a3a', 4);
  p.R(0, 40, 64, 3, trim); p.R(0, 40, 64, 1, shade(trim, 0.35)); p.R(0, 42, 64, 1, shade(trim, -0.4)); p.R(0, 43, 64, 1, '#1e2a1c');
  // un petit détail une fois sur trois : horaire punaisé, ou le dossier d'un banc qui a usé la peinture
  const pick = rand();
  if (pick < 1 / 3) {
    const x = 40, y = 13, w = 12, h = 17, paper = '#e4d8b4', ink = '#4a3a2a';
    p.R(x + 1, y + 1, w, h, shade(paint, -0.45));
    p.R(x, y, w, h, paper); p.R(x, y, w, 1, '#f2e8cc'); p.R(x + w - 1, y + 1, 1, h - 1, '#c4b48c');
    p.R(x + 2, y + 2, w - 4, 2, '#7a2a1c');
    for (let ly = y + 6; ly < y + h - 2; ly += 2) { p.R(x + 2, ly, 3, 1, ink); p.R(x + 6, ly, w - 8 - (ly % 3), 1, '#8a7a60'); }
    p.P(x + 1, y, '#9a9aa0'); p.P(x + w - 2, y, '#9a9aa0');
    p.P(x + w - 1, y + h - 1, shade(paint, -0.3)); p.P(x + w - 2, y + h - 1, '#c4b48c');
  } else if (pick < 2 / 3) {
    tw2Dim(c, 6, 31, 52, 6, (x, y) => (y === 31 || y === 36 ? 0.92 : 0.84));
    for (let i = 0; i < 9; i++) p.R(7 + rand() * 46, 33 + Math.floor(rand() * 2), 2 + rand() * 5, 1, TX_BARE);
  }
}
function tw2StationUp(p, rand, c) {
  const paint = TW2_ST_PAINT, trim = TW2_ST_TRIM, th = shade(trim, 0.35), tm = shade(trim, 0.15), td = '#2e1e12', ws = shade(paint, -0.45);
  txSiding(p, rand, c, paint, 5);
  // corniche : chapeau éclairé, doucine, bandeau à perles, rangée sombre dessous, consoles toutes les 8 px
  p.R(0, 0, 64, 9, ws);
  p.R(0, 0, 64, 1, th); p.R(0, 1, 64, 1, tm); p.R(0, 2, 64, 1, trim); p.R(0, 3, 64, 1, shade(trim, -0.3));
  p.R(0, 4, 64, 3, trim); p.R(0, 4, 64, 1, tm);
  for (let x = 1; x < 64; x += 4) p.P(x, 5, shade(trim, -0.25));
  p.R(0, 7, 64, 1, td);
  for (let k = 2; k < 64; k += 8) {
    p.R(k, 7, 3, 3, trim); p.P(k, 7, th); p.P(k, 8, tm); p.R(k + 2, 8, 1, 2, td); p.P(k + 1, 9, shade(trim, -0.2));
    p.R(k + 3, 8, 1, 3, ws); p.R(k, 10, 4, 1, shade(paint, -0.28));
  }
  p.R(0, 9, 64, 1, shade(paint, -0.3));
  tw2Grain(c, 0, 0, 64, 9, rand, 0.05, 0.4);
}

// =================================================================== 3. haut du train à quai (fond SEE : le ciel passe)
// Voiture : toit bombé, lanterneau à petits jours, aérateurs ; la ligne du bas rejoint le #3a3634 du haut de trainCar
function tw2TrainCarUp(p, rand, c, v) {
  const body = ['#2e4a34', '#6a2220'][v & 1], bd = shade(body, -0.4), gold = '#d4aa48', goldD = '#8a6a28';
  p.R(0, 0, 64, 64, TW2_SEE);
  // toit bas (bombé : la partie haute, presque à plat, prend la lumière ; le bas tourne vers le flanc)
  const lower = ['#1a1716', '#1a1716', '#7a7672', '#6a6662', '#5e5a56', '#56524e', '#4e4a46', '#4a4642', '#46423e', '#423e3a',
    '#3e3a38', '#3c3836', '#3a3634', '#363230', '#33302e', '#2e2a28', '#5a5652', '#3a3634'];
  lower.forEach((col, i) => p.R(0, 46 + i, 64, 1, col));
  // lanterneau : flanc à la couleur de la voiture, filet d'or, petits jours colorés
  p.R(0, 32, 64, 14, body);
  p.R(0, 32, 64, 2, bd); p.R(0, 34, 64, 1, gold); p.R(0, 44, 64, 1, goldD); p.R(0, 45, 64, 1, bd);
  for (let x = 3; x < 64; x += 8) {
    const amber = (x >> 3) % 2;
    p.R(x - 1, 35, 7, 9, '#8a5a2c'); p.R(x - 1, 35, 7, 1, '#b07a44');
    p.R(x, 37, 5, 6, amber ? '#3a2a18' : '#22303a');
    p.R(x, 37, 5, 2, amber ? '#a8742a' : '#5a7a8a');
    p.P(x + 3, 37, '#e8d8a0'); p.P(x + 4, 38, '#c8b880');
    p.R(x + 2, 37, 1, 6, '#6a4422');
  }
  // toit du lanterneau
  const upper = ['#8a8682', '#7a7672', '#6a6662', '#5e5a56', '#524e4a', '#4a4642', '#423e3a', '#3a3634', '#2e2a28', '#1e1b1a'];
  upper.forEach((col, i) => p.R(0, 22 + i, 64, 1, col));
  // aérateurs « torpille » : pied court, corps fuselé
  for (const ax of [12, 44]) {
    p.R(ax - 1, 17, 3, 5, '#2a2826'); p.P(ax - 1, 17, '#5a5652');
    p.R(ax - 3, 21, 7, 1, '#3a3634'); p.R(ax - 3, 21, 2, 1, '#6a6662');
    p.R(ax - 5, 11, 11, 6, '#3a3634');
    p.R(ax - 6, 12, 1, 4, '#2a2826'); p.R(ax + 6, 12, 1, 4, '#2a2826');
    p.R(ax - 4, 11, 9, 1, '#7a7672'); p.R(ax - 5, 12, 10, 1, '#5e5a56'); p.R(ax - 5, 15, 11, 1, '#2a2826'); p.R(ax - 4, 16, 9, 1, '#1a1716');
    p.R(ax + 6, 13, 1, 2, '#1a1716');
    p.P(ax - 3, 12, '#9a9692');
  }
  // suie et coulures sur le toit, rivets du bord
  for (let i = 0; i < 6; i++) p.R(rand() * 60, 48 + Math.floor(rand() * 8), 3 + rand() * 8, 1, '#2a2624');
  for (let i = 0; i < 4; i++) p.R(rand() * 60, 24 + Math.floor(rand() * 4), 2 + rand() * 6, 1, '#3a3634');
  for (let x = 4; x < 64; x += 8) p.P(x, 62, '#7a7672');
  tw2Grain(c, 0, 22, 64, 42, rand, 0.05, 0.35);
}
// Wagon couvert : toit de planches peu pentu, bandeau de rive, passerelle sur ses selles ; bas = fer #2a2624 de freightCar
function tw2FreightCarUp(p, rand, c, v) {
  const body = ['#8a3422', '#4c5a6a'][v & 1], roof = mix(body, '#3a3430', 0.5);
  p.R(0, 0, 64, 64, TW2_SEE);
  // toit : planches transversales (on en voit les abouts), plus clair vers le faîtage
  for (let y = 46; y < 58; y++) p.R(0, y, 64, 1, shade(roof, y < 48 ? 0.22 : y < 51 ? 0.1 : y < 55 ? 0 : -0.18));
  for (let x = 3; x < 64; x += 10) { p.R(x, 48, 1, 10, shade(roof, -0.16)); p.R(x + 1, 48, 1, 9, shade(roof, 0.06)); }
  p.R(0, 46, 64, 1, shade(roof, 0.34));
  for (let i = 0; i < 6; i++) p.R(rand() * 60, 48 + Math.floor(rand() * 8), 2 + rand() * 6, 1, shade(roof, rand() < 0.5 ? 0.14 : -0.12));
  for (let i = 0; i < 3; i++) { const x = Math.floor(rand() * 62); p.R(x, 53, 1, 5, mix(roof, '#7a4a2a', 0.5)); }
  // bandeau de rive à la couleur du wagon, goutte d'eau, puis le fer du haut de caisse
  p.R(0, 58, 64, 3, body); p.R(0, 58, 64, 1, shade(body, 0.25)); p.R(0, 60, 64, 1, shade(body, -0.25));
  p.R(0, 61, 64, 1, '#151312'); p.R(0, 62, 64, 1, '#3a3634'); p.R(0, 63, 64, 1, '#2a2624');
  for (let x = 3; x < 64; x += 8) p.P(x, 59, shade(body, -0.45));
  // passerelle sur selles
  for (let x = 6; x < 64; x += 16) {
    p.R(x, 43, 4, 4, '#3a2c1e'); p.R(x, 43, 1, 4, '#5a4630'); p.R(x + 3, 43, 1, 4, '#1e1610');
    p.R(x - 1, 46, 6, 1, '#2a2018');
  }
  p.R(0, 43, 64, 1, '#241a10');
  p.R(0, 36, 64, 7, '#6a5034');
  p.R(0, 36, 64, 1, '#a08060'); p.R(0, 37, 64, 1, '#8a7050'); p.R(0, 41, 64, 1, '#4a3a26'); p.R(0, 42, 64, 1, '#241a10');
  for (const x of [13, 45]) { p.R(x, 37, 1, 5, '#2a2018'); p.R(x + 1, 37, 1, 5, '#a08060'); }
  for (let i = 0; i < 8; i++) p.R(rand() * 60, 38 + Math.floor(rand() * 3), 3 + rand() * 7, 1, rand() < 0.5 ? '#5a4430' : '#7a6044');
  for (let x = 4; x < 64; x += 8) { p.P(x, 39, '#2a2624'); p.P(x + 1, 39, '#8a8480'); }
  tw2Grain(c, 0, 36, 64, 28, rand, 0.06, 0.4);
}

// Locomotive, v = rang depuis l'avant (vue du quai, l'avant est à gauche) :
// 0 cheminée à ballon et fanal, 1 cloche et sablière, 2 dôme de vapeur, 3 cabine (grande baie), 4 cabine (porte, mains courantes)
const TW2_IRON = '#2e2e34', TW2_BRASS = '#b8862e';
const TW2_CAB = { body: '#6a2220', hi: '#8a3a30', dk: '#3a1210', gold: '#d4aa48', goldD: '#8a6a28' };
// Fenêtre de cabine à coins hauts arrondis : cadre de bois, vitre sombre, petit-bois, reflets, appui
function tw2CabWindow(p, c, x0, x1, y0, y1) {
  const r = 5;
  const inWin = (x, y, g) => {
    const X = x + 0.5, Y = y + 0.5;
    if (X < x0 + g || X > x1 - g || Y < y0 + g || Y > y1 - g) return false;
    const rr = r - g, cy = y0 + r;
    if (Y < cy && X < x0 + r) return Math.hypot(X - (x0 + r), Y - cy) <= rr;
    if (Y < cy && X > x1 - r) return Math.hypot(X - (x1 - r), Y - cy) <= rr;
    return true;
  };
  txField(c, (x, y) => {
    if (inWin(x, y, 2)) return y < y0 + 6 ? '#1e2830' : '#161c20';
    if (!inWin(x, y, 0)) return null;
    return !inWin(x - 1, y, 0) || !inWin(x, y - 1, 0) ? '#b07a44' : '#8a5a2c';
  }, x0, y0, x1 - x0, y1 - y0);
  const mx = (x0 + x1) >> 1;
  p.R(mx - 1, y0 + 2, 2, y1 - y0 - 3, '#8a5a2c'); p.P(mx - 1, y0 + 2, '#b07a44');
  p.line(x0 + 4, y0 + 15, x0 + 8, y0 + 7, '#2e3a42'); p.line(x0 + 5, y0 + 17, x0 + 9, y0 + 9, '#242e34');
  if (x1 - x0 > 24) p.line(mx + 3, y0 + 18, mx + 7, y0 + 10, '#2e3a42');
  p.R(x0 - 1, y1, x1 - x0 + 2, 2, '#8a5a2c'); p.R(x0 - 1, y1, x1 - x0 + 2, 1, '#c08a50'); p.R(x0, y1 + 2, x1 - x0, 1, TW2_CAB.dk);
}
function tw2LocoUp(p, rand, c, v) {
  p.R(0, 0, 64, 64, TW2_SEE);
  const ir = '#2a2a2e', ih = '#5a5a60', id = '#141416', gold = TW2_CAB.gold;
  if (v === 0) {
    // cheminée à ballon (chaudière au bois) : embase évasée, fût, cône, chapeau à grille, suie en haut
    tw2Solid(c, 32, 50, 64, (y) => 7 + Math.max(0, (y - 56) * 0.9), TW2_IRON);
    tw2Solid(c, 32, 26, 50, () => 5.5, '#3a3a40');
    tw2Solid(c, 32, 9, 26, (y) => 5.5 + ((26 - y) / 17) ** 1.25 * 8.5, '#34343a', { k: (x, y) => 0.7 + ((y - 9) / 17) * 0.3 });
    tw2Solid(c, 32, 4, 9, (y) => (y < 5 ? 13 : 14.5), '#2a2a30', { k: () => 0.8 });
    p.R(22, 3, 20, 1, id);
    for (let x = 23; x < 42; x += 2) p.P(x, 3, '#3a3a40');
    tw2Solid(c, 32, 26, 29, () => 6.5, TW2_BRASS);
    tw2Solid(c, 32, 48, 51, () => 6.5, TW2_BRASS);
    // fanal à pétrole sur sa console, à l'avant : caisse peinte (étoile), lanterneau, verre qui luit
    p.R(5, 57, 9, 7, id); p.R(5, 57, 9, 1, ih); p.R(7, 58, 5, 6, ir);
    p.R(2, 38, 15, 19, '#1e1e22');
    p.R(3, 39, 13, 17, '#2e2e34'); p.R(3, 39, 13, 2, ih); p.R(3, 54, 13, 2, id);
    p.R(5, 42, 9, 11, '#7a2a1c'); p.R(5, 42, 9, 1, '#a84a30'); p.R(6, 44, 7, 7, '#8e2a1c');
    p.P(9, 45, gold); p.R(8, 46, 3, 2, gold); p.P(9, 48, gold); p.P(7, 47, gold); p.P(11, 47, gold);
    p.R(2, 40, 2, 15, TW2_BRASS); p.R(2, 40, 1, 15, '#f0d070'); p.R(1, 43, 1, 9, '#f8e8a0');
    p.R(4, 34, 11, 4, '#2a2a30'); p.R(4, 34, 11, 1, ih); p.R(7, 30, 5, 4, ir); p.R(6, 29, 7, 1, ih); p.R(8, 28, 3, 1, id);
    p.R(16, 40, 1, 15, '#c49a38'); p.P(16, 40, '#f0d070');
    tw2Grain(c, 0, 0, 64, 64, rand, 0.05, 0.35);
  } else if (v === 1) {
    // cloche de laiton dans sa chape, avec son levier ; sablière (dôme bas à couvercle de laiton)
    const bx = 22;
    p.R(bx - 9, 56, 19, 8, id); p.R(bx - 9, 56, 19, 1, ih);
    p.R(bx - 8, 34, 2, 22, ir); p.R(bx - 8, 34, 1, 22, ih); p.R(bx + 7, 34, 2, 22, ir); p.R(bx + 7, 34, 1, 22, ih);
    p.R(bx - 8, 33, 17, 2, ir); p.R(bx - 8, 33, 17, 1, ih); p.R(bx - 1, 30, 3, 3, ir); p.P(bx - 1, 30, ih);
    tw2Solid(c, bx + 0.5, 35, 52, (y) => 2.5 + ((y - 35) / 16) ** 1.6 * 4 + (y > 49 ? 0.8 : 0), TW2_BRASS);
    p.R(bx - 5, 52, 11, 1, '#6a4a18');
    p.R(bx, 53, 2, 2, '#4a3410');
    p.R(bx + 9, 35, 3, 1, ir); p.R(bx + 11, 35, 1, 6, '#8a7a5a'); p.P(bx + 11, 41, '#c8b88a');
    tw2Solid(c, 49, 40, 64, (y) => (y < 44 ? 3 + (y - 40) * 1.6 : 9.5 + Math.max(0, y - 58) * 0.8), TW2_IRON);
    tw2Solid(c, 49, 37, 44, (y) => (y < 40 ? 3 : 5), TW2_BRASS);
    p.R(47, 35, 5, 2, '#6a4a18'); p.P(47, 35, '#f0d070');
    tw2Solid(c, 49, 52, 55, () => 10.2, TW2_BRASS);
    tw2Grain(c, 0, 28, 64, 36, rand, 0.04, 0.3);
  } else if (v === 2) {
    // dôme de vapeur à chapeau de laiton, sifflet et soupape à balance de part et d'autre
    tw2Solid(c, 28, 30, 64, (y) => (y < 38 ? 6 + Math.sqrt(Math.max(0, (y - 30) * 4.5)) : 12 + Math.max(0, y - 56) * 0.9), TW2_IRON);
    tw2Solid(c, 28, 22, 34, (y) => (y < 25 ? 2 + (y - 22) * 2.4 : 8 + Math.sqrt(Math.max(0, (y - 25) * 4))), TW2_BRASS);
    p.R(26, 19, 5, 3, '#8a6a28'); p.P(26, 19, '#f0d070'); p.R(27, 17, 3, 2, '#6a4a18');
    tw2Solid(c, 28, 33, 36, () => 12.5, TW2_BRASS);
    tw2Solid(c, 28, 49, 52, () => 12.8, TW2_BRASS);
    p.R(51, 53, 2, 11, '#8a6a28'); p.R(51, 53, 1, 11, '#d8b050'); p.R(49, 61, 6, 3, '#5a5a60'); p.R(49, 61, 6, 1, '#8a8a90');
    tw2Solid(c, 52, 40, 53, (y) => (y < 42 ? 1.5 : 2.4), TW2_BRASS);
    p.R(50, 37, 5, 3, '#6a4a18'); p.P(50, 37, '#f0d070'); p.R(52, 35, 1, 2, '#3a3a40');
    p.R(54, 50, 5, 1, '#3a3a40'); p.R(58, 50, 1, 5, '#8a7a5a');
    p.R(7, 54, 6, 10, ir); p.R(7, 54, 1, 10, ih); p.R(6, 52, 8, 2, TW2_BRASS); p.R(6, 52, 8, 1, '#f0d070');
    p.R(8, 44, 2, 8, '#c49a38'); p.P(8, 44, '#f0d070'); p.R(4, 46, 12, 1, '#3a3a40'); p.R(4, 45, 1, 2, '#3a3a40');
    tw2Grain(c, 0, 17, 64, 47, rand, 0.04, 0.3);
  } else {
    // cabine : toit noir bombé qui déborde, paroi rouge filetée d'or ; v3 grande baie et montant avant,
    // v4 petite baie, porte vitrée (qui descend dans loco v4), montant arrière et main courante dans le vide
    const { body: cab, hi: cabH, dk: cabD, goldD } = TW2_CAB;
    const front = v === 3, wx0 = front ? 4 : 0, wx1 = front ? 64 : 56;
    p.R(wx0, 10, wx1 - wx0, 54, cab);
    for (let x = wx0 + 3; x < wx1; x += 6) p.R(x, 12, 1, 52, shade(cab, -0.12));
    tw2Grain(c, wx0, 10, wx1 - wx0, 54, rand, 0.05, 0.4);
    p.R(wx0, 10, wx1 - wx0, 3, cabD); p.R(wx0, 13, wx1 - wx0, 1, shade(cab, -0.25));
    p.R(wx0, 42, wx1 - wx0, 2, goldD); p.R(wx0, 42, wx1 - wx0, 1, gold);
    const pan = (x0, x1) => { p.R(x0, 47, x1 - x0, 1, gold); p.R(x0, 59, x1 - x0, 1, gold); p.R(x0, 47, 1, 13, gold); p.R(x1 - 1, 47, 1, 13, gold); p.R(x0 + 1, 48, x1 - x0 - 2, 1, cabD); };
    p.R(wx0, 62, wx1 - wx0, 2, shade(cab, -0.2));
    if (front) {
      tw2CabWindow(p, c, 13, 49, 16, 40);
      pan(11, 59);
      p.R(4, 10, 4, 54, cabH); p.R(4, 10, 1, 54, shade(cabH, 0.25)); p.R(7, 10, 1, 54, cabD);
      p.R(9, 18, 1, 40, '#c49a38'); p.P(9, 18, '#f0d070');
      for (const y of [18, 57]) p.R(8, y, 2, 1, '#6a4a18');
    } else {
      tw2CabWindow(p, c, 6, 24, 16, 40);
      pan(5, 26);
      const dx0 = 30, dx1 = 47;
      p.R(dx0 - 1, 16, dx1 - dx0 + 2, 48, cabD);
      p.R(dx0, 17, dx1 - dx0, 47, shade(cab, 0.06)); p.R(dx0, 17, dx1 - dx0, 1, cabH); p.R(dx0, 17, 1, 47, cabH);
      p.R(dx0 + 3, 20, dx1 - dx0 - 6, 18, '#8a5a2c'); p.R(dx0 + 3, 20, dx1 - dx0 - 6, 1, '#b07a44'); p.R(dx0 + 4, 21, dx1 - dx0 - 8, 16, '#161c20');
      p.line(dx0 + 5, 33, dx0 + 9, 24, '#2e3a42');
      p.R(dx0 + 3, 44, dx1 - dx0 - 6, 1, gold); p.R(dx0 + 3, 44, 1, 20, gold); p.R(dx1 - 4, 44, 1, 20, gold);
      p.R(dx1 - 4, 50, 2, 3, '#c49a38'); p.P(dx1 - 4, 50, '#f0d070');
      p.R(52, 10, 4, 54, cabH); p.R(52, 10, 1, 54, shade(cabH, 0.25)); p.R(55, 10, 1, 54, cabD);
      p.R(59, 16, 1, 48, '#c49a38'); p.R(60, 16, 1, 48, '#6a4a18'); p.P(59, 16, '#f0d070');
      for (const y of [16, 40, 62]) p.R(56, y, 3, 1, '#3a3a40');
    }
    const rx1 = front ? 64 : 62;
    ['#141416', '#5a5a60', '#46464c', '#34343a', '#2a2a2e', '#242428', '#1e1e22', '#141416'].forEach((col, i) => p.R(0, 2 + i, rx1, 1, col));
    p.R(0, 10, rx1, 1, '#0c0c0e');
    if (front) { p.R(0, 3, 1, 7, id); p.P(1, 3, '#7a7a80'); }
    else { p.R(61, 3, 1, 8, id); p.R(60, 9, 2, 2, '#0c0c0e'); }
    for (let x = 6; x < 60; x += 9) p.P(x, 4, '#7a7a80');
  }
}

// --- bas de la locomotive par rang (v0 boîte à fumée, cylindre et chasse-buffle ; v1-2 chaudière d'origine ; v3-4 cabine)
const tw2LocoBase = TX_WALLS.loco;
function tw2Wheel(c, cx, cy, r) {
  const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(TEX, Math.ceil(cx + r + 1));
  const y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(TEX, Math.ceil(cy + r + 1));
  if (y1 <= y0 || x1 <= x0) return;
  txField(c, (x, y) => {
    const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
    if (d > r) return null;
    if (d > r - 2) return d > r - 1 ? '#3a3836' : '#6a6864';
    if (d > r - 4.5) return y < cy - r + 6 ? '#c43a24' : '#9a2a1a';
    const a = Math.atan2(y + 0.5 - cy, x + 0.5 - cx);
    return Math.abs((((a / (Math.PI / 5)) % 1) + 1) % 1 - 0.5) < 0.16 ? '#a8301e' : '#0e0d0c';
  }, x0, y0, x1 - x0, y1 - y0);
}
function tw2LocoFront(p, rand, c) {
  tw2LocoBase(p, rand, c, 0);
  // boîte à fumée (graphite, plus mate que la chaudière) jusqu'à x 43, puis le début de la chaudière d'origine
  txField(c, (x, y) => {
    const t = y / 41;
    const k = y < 2 ? 0.42 : 0.56 + 0.62 * Math.exp(-(((t - 0.22) / 0.12) ** 2)) + 0.1 * Math.exp(-(((t - 0.7) / 0.2) ** 2));
    return txK([46, 44, 46], k);
  }, 0, 0, 44, 42);
  grain(c, 0, 0, 44, 42, rand, 0.07, 0.45);
  p.R(0, 37, 44, 1, '#121110');
  // collier rivé entre boîte à fumée et chaudière
  p.R(42, 0, 3, 42, '#3a3a3e'); p.R(42, 0, 1, 42, '#6a6a70'); p.R(44, 0, 1, 42, '#121110');
  for (let y = 3; y < 38; y += 4) p.P(43, y, '#8a8a90');
  // couronne avant (porte de la boîte à fumée vue de chant), rivets
  p.R(0, 1, 4, 40, '#3e3e44'); p.R(1, 1, 1, 40, '#7a7a82'); p.R(3, 1, 1, 40, '#16161a');
  for (let y = 4; y < 38; y += 5) p.P(2, y, '#a0a0a8');
  // clapet de retenue au bout du tuyau d'alimentation ; console du fanal (le fanal est dans locoUp v0)
  p.R(44, 23, 5, 7, '#a87a2a'); p.R(44, 23, 5, 1, '#f0d070'); p.R(44, 29, 5, 1, '#5a3c12'); p.R(46, 21, 2, 2, '#c49a38');
  p.R(4, 0, 11, 2, '#2a2a2e'); p.R(4, 0, 11, 1, '#5a5a60'); p.R(8, 2, 3, 3, '#1e1e22');
  // dessous : roues du bogie sous le cylindre et son tiroir, glissières et tige de piston vers l'arrière
  p.R(0, 48, 64, 16, '#0e0d0c');
  p.R(12, 49, 52, 2, '#24221f'); p.R(12, 49, 52, 1, '#3a3836');
  tw2Wheel(c, 20, 69, 10); tw2Wheel(c, 38, 69, 10);
  p.R(14, 47, 27, 3, '#3a3836'); p.R(14, 47, 27, 1, '#6a6864');
  p.R(13, 50, 29, 9, '#34302c'); p.R(13, 50, 29, 1, '#5a5652'); p.R(13, 58, 29, 1, '#161412');
  p.R(17, 52, 21, 4, '#4a2a1c'); p.R(17, 52, 21, 1, '#6a3a26');
  for (let x = 19; x < 38; x += 5) p.P(x, 54, '#2a1a10');
  for (const x of [13, 39]) { p.R(x, 49, 3, 11, '#a87a2a'); p.R(x, 49, 1, 11, '#f0d070'); p.R(x + 2, 49, 1, 11, '#5a3c12'); }
  p.R(42, 51, 22, 1, '#5a5a60'); p.R(42, 52, 22, 1, '#24221f'); p.R(42, 57, 22, 1, '#5a5a60'); p.R(42, 58, 22, 1, '#24221f');
  p.R(42, 54, 22, 1, '#c8c8d0'); p.R(42, 55, 22, 1, '#3a3a40');
  p.R(56, 52, 6, 5, '#4a4a50'); p.R(56, 52, 6, 1, '#8a8a90'); p.P(58, 54, '#c8c8d0');
  // chasse-buffle : traverse rouge, barreaux en biais qui descendent vers l'avant, sabot au ras du rail
  p.R(0, 44, 11, 5, '#8e2a1c'); p.R(0, 44, 11, 1, '#c44a32'); p.R(0, 48, 11, 1, '#4a140e');
  p.R(1, 45, 2, 2, '#d8b040');
  for (const [xt, xb, col] of [[5, 0, '#a83a26'], [8, 3, '#8e2a1c'], [11, 7, '#a83a26']]) p.line(xt, 49, xb, 62, col, 2);
  p.R(0, 62, 12, 2, '#5a1a10'); p.R(0, 62, 12, 1, '#8e2a1c');
}
function tw2LocoBoiler(p, rand, c, v) {
  tw2LocoBase(p, rand, c, 0);
  if (v === 1) {
    // tuyaux de sablière qui descendent du dôme vers l'avant des roues
    for (const x of [44, 54]) {
      p.R(x, 0, 2, 42, '#1e1e20'); p.P(x, 0, '#5a5a60'); p.R(x, 1, 1, 41, '#4a4a50');
      p.R(x - 1, 9, 4, 2, '#c49a38'); p.P(x - 1, 9, '#f0d070');
    }
    p.line(44, 48, 41, 58, '#4a4a50', 2); p.line(54, 48, 56, 56, '#4a4a50', 2);
  }
}
function tw2LocoCab(p, rand, c, v) {
  tw2LocoBase(p, rand, c, 0);
  const { body: cab, hi: cabH, dk: cabD, gold } = TW2_CAB;
  const front = v === 3, wx0 = front ? 4 : 0, wx1 = front ? 64 : 56;
  p.R(wx0, 0, wx1 - wx0, 42, cab);
  for (let x = wx0 + 3; x < wx1; x += 6) p.R(x, 0, 1, 40, shade(cab, -0.12));
  grain(c, wx0, 0, wx1 - wx0, 42, rand, 0.05, 0.4);
  // bas de caisse : filet d'or puis longrine sombre au-dessus du tablier
  p.R(wx0, 37, wx1 - wx0, 1, gold); p.R(wx0, 38, wx1 - wx0, 4, shade(cab, -0.3)); p.R(wx0, 41, wx1 - wx0, 1, cabD);
  if (front) {
    // grand panneau fileté, plaque de numéro ovale en laiton
    p.R(11, 2, 48, 1, gold); p.R(11, 33, 48, 1, gold); p.R(11, 2, 1, 32, gold); p.R(58, 2, 1, 32, gold); p.R(12, 3, 46, 1, cabD);
    p.ell(34, 17, 10, 8, '#4a3410'); p.ell(34, 17, 9, 7, '#c49a38'); p.ell(33, 16, 8, 6, '#e0bc58'); p.ell(34, 17, 7, 5, '#b8862e');
    text(p.R, '7', 32, 13, '#e8c870', 2); text(p.R, '7', 31, 12, '#3a2410', 2);
    p.R(4, 0, 4, 42, cabH); p.R(4, 0, 1, 42, shade(cabH, 0.25)); p.R(7, 0, 1, 42, cabD);
    p.R(9, 0, 1, 34, '#c49a38'); p.R(8, 33, 2, 1, '#6a4a18');
  } else {
    // bas de la porte (suite de locoUp v4), panneau de côté, seuil de fer sur le tablier
    const dx0 = 30, dx1 = 47;
    p.R(dx0 - 1, 0, dx1 - dx0 + 2, 39, cabD);
    p.R(dx0, 0, dx1 - dx0, 38, shade(cab, 0.06)); p.R(dx0, 0, 1, 38, cabH);
    p.R(dx0 + 3, 0, 1, 34, gold); p.R(dx1 - 4, 0, 1, 34, gold); p.R(dx0 + 3, 33, dx1 - dx0 - 6, 1, gold); p.R(dx0 + 3, 6, dx1 - dx0 - 6, 1, gold);
    p.R(dx0 - 1, 38, dx1 - dx0 + 2, 3, '#5a5a60'); p.R(dx0 - 1, 38, dx1 - dx0 + 2, 1, '#8a8a90');
    p.R(5, 2, 21, 1, gold); p.R(5, 32, 21, 1, gold); p.R(5, 2, 1, 31, gold); p.R(25, 2, 1, 31, gold); p.R(6, 3, 19, 1, cabD);
    // montant arrière, l'ombre entre cabine et tender, main courante, marchepied
    p.R(52, 0, 4, 42, cabH); p.R(52, 0, 1, 42, shade(cabH, 0.25)); p.R(55, 0, 1, 42, cabD);
    p.R(56, 0, 8, 42, '#16120f'); p.R(56, 0, 1, 42, '#0a0807');
    p.R(59, 0, 1, 42, '#c49a38'); p.R(60, 0, 1, 42, '#6a4a18');
    for (const y of [14, 36]) p.R(56, y, 3, 1, '#3a3a40');
    p.R(56, 48, 2, 10, '#2a2a2e'); p.R(62, 48, 2, 10, '#2a2a2e');
    p.R(55, 57, 9, 2, '#5a5a60'); p.R(55, 57, 9, 1, '#9a9aa0');
    p.R(56, 52, 8, 1, '#3a3a40');
  }
}
TX_WALLS.loco = (p, rand, c, v) => (v === 0 ? tw2LocoFront(p, rand, c) : v >= 3 ? tw2LocoCab(p, rand, c, v) : tw2LocoBoiler(p, rand, c, v));

// =================================================================== 4. fausse façade : bardage sous corniche
function tw2PlankUp(p, rand, c, v) {
  const paint = TX_PAINT[v], trim = TX_TRIM[v], th = shade(trim, 0.25), tm = shade(trim, 0.1), td = shade(trim, -0.4), ws = shade(paint, -0.45);
  txSiding(p, rand, c, paint, [10, 9, 13, 16][v]);
  // chapeau de corniche (lignes 0-6) : larmier éclairé, doucine, ombre, denticules, consoles, ombre portée sur le bardage
  p.R(0, 0, 64, 1, th); p.R(0, 1, 64, 2, trim); p.R(0, 1, 64, 1, tm); p.R(0, 3, 64, 1, td);
  p.R(0, 4, 64, 3, ws);
  for (let x = 1; x < 64; x += 4) { p.R(x, 4, 2, 2, trim); p.P(x, 4, th); p.P(x + 1, 5, td); }
  p.R(0, 6, 64, 1, td);
  p.R(0, 7, 64, 1, shade(paint, -0.32));
  for (const x of [6, 38]) { p.R(x, 4, 4, 5, trim); p.R(x, 4, 1, 5, th); p.R(x + 3, 4, 1, 5, td); p.R(x + 1, 8, 2, 1, td); p.R(x + 4, 5, 1, 4, ws); }
  // moulure mince (lignes 58-60)
  p.R(0, 58, 64, 1, th); p.R(0, 59, 64, 1, trim); p.R(0, 60, 64, 1, td); p.R(0, 61, 64, 1, shade(paint, -0.3));
  tw2Grain(c, 0, 0, 64, 8, rand, 0.05, 0.4);
}

// =================================================================== abords : grange, mausolée, barrière, mur bas
// Grange v2 : pignon à porte de fenil (même bardage rouge et même graine que v0/v1), poutre de levage et poulie
const tw2Barn = TX_WALLS.barn;
function tw2BarnLoft(p, rand, c) {
  tw2Barn(p, rand, c, 1);
  const red = '#9a2c22', wh = '#e6ddcc', wd = '#a89c88', wl = '#fffaf0', sh = '#3a0e0a';
  const x0 = 18, x1 = 46, y0 = 10, y1 = 45, f = 4;
  // ombre portée du chambranle
  p.R(x0 + 1, y1, x1 - x0, 1, sh); p.R(x1, y0 + 1, 1, y1 - y0, sh);
  // ouverture sombre (tiers haut), foin dedans et brins qui dépassent
  const oy1 = y0 + f + 9;
  p.R(x0 + f, y0 + f, x1 - x0 - 2 * f, oy1 - y0 - f, '#160806');
  p.R(x0 + f, y0 + f, x1 - x0 - 2 * f, 2, '#0a0403');
  for (let x = x0 + f; x < x1 - f; x++) {
    const hh = 3 + ((x * 7) % 5 === 0 ? 2 : (x * 3) % 4 === 0 ? 1 : 0);
    p.R(x, oy1 - hh, 1, hh, x % 3 ? '#a88830' : '#7a6020');
    if (x % 2) p.P(x, oy1 - hh, '#d8b860');
  }
  for (const [sx, sy, dx] of [[x0 + f + 2, oy1 - 1, -1], [x0 + f + 7, oy1, 1], [x0 + f + 13, oy1, -1], [x1 - f - 4, oy1 - 1, 1]]) {
    p.P(sx, sy, '#d8b860'); p.P(sx + dx, sy + 1, '#d8b860'); p.P(sx + dx * 2, sy + 2, '#a88830');
  }
  // vantail bas (porte hollandaise) : planches rouges, traverse haute blanche, une seule écharpe
  const dy0 = oy1, dy1 = y1 - f;
  for (let x = x0 + f; x < x1 - f; x++) p.R(x, dy0, 1, dy1 - dy0, (x - x0) % 5 === 0 ? '#5a1810' : shade(red, -0.06));
  p.R(x0 + f, dy0, x1 - x0 - 2 * f, 3, wh); p.R(x0 + f, dy0, x1 - x0 - 2 * f, 1, wl); p.R(x0 + f, dy0 + 2, x1 - x0 - 2 * f, 1, wd);
  for (let k = -1; k <= 1; k++) p.line(x0 + f, dy1 - 1 + k, x1 - f - 1, dy0 + 3 + k, k === 1 ? wd : wh);
  p.R(x1 - f - 4, dy0 + 10, 2, 4, '#2a2624'); p.P(x1 - f - 4, dy0 + 10, '#6a6460');
  // chambranle blanc de 4 px, pentures
  p.R(x0, y0, x1 - x0, f, wh); p.R(x0, y1 - f, x1 - x0, f, wh); p.R(x0, y0, f, y1 - y0, wh); p.R(x1 - f, y0, f, y1 - y0, wh);
  p.R(x0, y0, x1 - x0, 1, wl); p.R(x0, y0, 1, y1 - y0, wl);
  p.R(x1 - 1, y0, 1, y1 - y0, wd); p.R(x0, y1 - 1, x1 - x0, 1, wd);
  p.R(x0 + f - 1, y0 + f - 1, x1 - x0 - 2 * f + 2, 1, wd); p.R(x0 + f - 1, y0 + f, 1, y1 - y0 - 2 * f, wd);
  for (const hy of [dy0 + 5, dy1 - 4]) { p.R(x0 + f, hy, 9, 2, '#2a2624'); p.R(x0 + f, hy, 9, 1, '#4a4440'); p.P(x0 + f + 7, hy, '#8a8480'); p.P(x0 + f + 3, hy + 1, '#8a8480'); }
  // poutre de levage (bout vu de face), poulie de fer, corde et crochet
  p.R(29, 9, 9, 1, sh);
  p.R(28, 4, 8, 5, '#5a3a22'); p.R(28, 4, 8, 1, '#8a6040'); p.R(28, 4, 1, 5, '#7a5634'); p.R(28, 8, 8, 1, '#2a1a10'); p.R(35, 5, 1, 4, '#3a2414');
  p.P(31, 6, '#3a2414'); p.P(32, 6, '#7a5634'); p.P(32, 7, '#4a2e1a');
  p.R(31, 9, 3, 3, '#3a3634'); p.P(31, 9, '#8a8480'); p.P(32, 10, '#141210'); p.P(33, 11, '#1e1c1a');
  p.R(32, 12, 1, 4, '#b89a60'); p.P(32, 13, '#8a7040');
  p.R(31, 15, 3, 1, '#4a4440'); p.P(31, 16, '#4a4440');
}
TX_WALLS.barn = (p, rand, c, v) => (v === 2 ? tw2BarnLoft(p, rand, c) : tw2Barn(p, rand, c, v));
TX_VARS.barn = 3;

// Mausolée v1 : fronton (vu à mi-hauteur en jeu, donc dessiné deux fois plus haut), toit d'ardoise dans les coins
const tw2Tomb = TX_WALLS.tomb;
function tw2TombCap(p, rand, c) {
  const S = ['#b8b4ac', '#c4c0b8', '#aca8a0', '#bcb8b0'];
  txBlocks(c, rand, { y0: 40, y1: 64, ch: 12, cols: S, mortar: '#5e5a54', bev: 0.18, lens: () => [32, 32], off: (r) => (r % 2) * 16 + 8 });
  const slate = txRGB('#6e6a64'), stone = txRGB('#c4c0b8'), rake = txRGB('#8a867e'), nz = txFbm(rand, [16, 8, 4]), nz2 = txNoise(rand, 2);
  const tri = (x, y, g = 0) => y + 0.5 >= 8 - g && y + 0.5 <= 40 && Math.abs(x + 0.5 - 32) <= ((y + 0.5 - 8) * 28) / 32 + g;
  txField(c, (x, y) => {
    if (tri(x, y)) {
      // tympan de calcaire, bord rampant de 2 px plus sombre, filet clair dessous côté lumière
      if (!tri(x, y, -2.2)) return txK(rake, x < 32 ? 1.08 : 0.9);
      if (!tri(x, y, -3.3)) return txK(stone, x < 32 ? 1.12 : 0.94);
      return txK(stone, 0.92 + nz(x, y) * 0.12 + (nz2(x, y) - 0.5) * 0.05);
    }
    // ardoises : rangs de 4 lignes à joints décalés ; pan gauche au soleil, pan droit à l'ombre
    const row = Math.floor(y / 4), u = txMod(x + (row % 2) * 5, 10);
    let k = (y < 8 ? 1.04 : x < 32 ? 1.1 : 0.84) * (0.93 + nz2(x * 2, y) * 0.12);
    if (y % 4 === 3) k *= 0.7; else if (y % 4 === 0) k *= 1.1;
    if (u === 0 && y % 4 !== 3) k *= 0.78;
    return txK(slate, k);
  }, 0, 0, 64, 40);
  // faîtage, corniche au pied du fronton et son ombre
  p.R(0, 0, 64, 2, '#5a5650'); p.R(0, 0, 64, 1, '#8a867e');
  p.R(0, 38, 64, 2, '#d4d0c8'); p.R(0, 38, 64, 1, '#e8e4dc'); p.R(0, 40, 64, 2, '#6e6a64');
  // petite croix gravée (en creux : paroi gauche et haut dans l'ombre, droite et bas éclairés)
  p.R(31, 20, 1, 15, '#7a766e'); p.R(32, 20, 1, 15, '#dcd8d0'); p.R(31, 20, 2, 1, '#6e6a64');
  p.R(29, 24, 6, 2, '#7a766e'); p.R(29, 26, 6, 2, '#dcd8d0'); p.R(29, 24, 1, 4, '#6e6a64');
  // lichen et coulures
  for (let i = 0; i < 8; i++) p.P(6 + rand() * 52, 42 + rand() * 20, txPick(rand, ['#8a9a6a', '#9aa06a', '#7a7a60']));
  for (const x of [12, 51]) p.R(x, 42, 1, 6, '#9a968e');
  grain(c, 0, 0, 64, 64, rand, 0.05, 0.45);
}
TX_WALLS.tomb = (p, rand, c, v) => (v === 1 ? tw2TombCap(p, rand, c) : tw2Tomb(p, rand, c, v));
TX_VARS.tomb = 2;

// Barrière v1 : mêmes poteaux et même bois que v0 ; lisse du milieu cassée qui pend, un poteau penché, bois grisé
const tw2Fence = TX_WALLS.fence;
function tw2FenceBroken(p, rand, c) {
  txVBoards(p, rand, c, 0, 0, 64, 64, '#3e2c1e', 8, '#20160e');
  const w = txWP(p);
  const wood = '#9a8264', wh = shade(wood, 0.2), wdk = shade(wood, -0.35), wg = shade(wood, -0.15);
  const grey = '#a8a49c', fresh = '#d0b48a';
  const lean = (y) => Math.round(2 * (1 - (y - 2) / 61));
  // poteaux : celui du milieu penche de 2 px vers la droite en haut
  for (const x of [-3, 29]) {
    const L = x === 29;
    for (let y = 2; y < 64; y++) {
      const X = x + (L ? lean(y) : 0);
      if (y >= 6) w.R(X + 6, y, 2, 1, '#1a120a');
      if (y === 2) { w.R(X + 1, 2, 4, 1, shade(wood, 0.25)); continue; }
      if (y === 3) { w.R(X, 3, 6, 1, shade(wood, 0.35)); continue; }
      w.R(X, y, 6, 1, wood); w.P(X, y, wh); w.P(X + 1, y, shade(wood, 0.1)); w.P(X + 5, y, wdk);
    }
    for (let i = 0; i < 6; i++) { const y = 6 + rand() * 54; w.R(x + (L ? lean(y) : 0) + 2 + Math.floor(rand() * 3), y, 1, 3 + rand() * 6, wg); }
  }
  // lisses : haut (grisée par le soleil), milieu (cassée à x 38, la moitié droite pend de 4 px), bas
  const bl = txNoise(rand, 8);
  const rail = (x0, x1, ry, drop, bleach) => {
    for (let x = x0; x <= x1; x++) {
      const y = ry + (drop ? Math.max(0, Math.round(drop(x))) : 0), b = bleach ? bleach(x) : 0;
      const tint = (col) => (b > 0 ? mix(col, grey, b) : col);
      w.R(x, y + 5, 1, 2, '#1a120a');
      w.R(x, y, 1, 5, tint(wood)); w.P(x, y, tint(wh)); w.P(x, y + 4, tint(wdk));
    }
    for (let i = 0; i < Math.ceil((x1 - x0) / 9); i++) {
      const x = x0 + rand() * (x1 - x0 - 4);
      w.R(x, ry + 1 + Math.floor(rand() * 3) + (drop ? Math.max(0, Math.round(drop(x))) : 0), 2 + rand() * 5, 1, wg);
    }
  };
  const sag = (x) => (4 * (61 - x)) / 21;
  rail(0, 63, 12, null, (x) => clamp((bl(x, 3) - 0.25) * 1.5, 0, 0.75));
  rail(0, 63, 44, null, null);
  rail(0, 37, 28, null, null);
  rail(40, 63, 28, sag, null);
  // cassure : bouts éclatés en bois frais, échardes
  p.R(37, 28, 2, 1, fresh); p.P(38, 29, fresh); p.P(37, 30, shade(fresh, -0.2)); p.P(38, 31, '#1a120a'); p.P(36, 32, fresh);
  p.P(39, 28, shade(wood, 0.1));
  p.R(40, 32, 1, 3, fresh); p.P(41, 32, fresh); p.P(40, 36, shade(fresh, -0.25)); p.P(41, 37, fresh); p.P(39, 33, fresh);
  p.line(30, 30, 36, 31, wdk);
  // clous (le poteau penché entraîne les siens), noeuds en plus
  for (const ry of [12, 28, 44]) for (const x of [0, 32]) { const dx = x === 32 ? lean(ry + 2) : 0; w.P(x - 1 + dx, ry + 2, '#2a221a'); w.P(x + 1 + dx, ry + 2, '#2a221a'); }
  for (const [kx, ky] of [[18, 46], [52, 14]]) { p.ell(kx, ky, 2, 1, '#5a4430'); p.P(kx, ky, '#2a1e14'); p.P(kx - 1, ky - 1, wh); }
  for (const ry of [12, 44]) w.R(8 + Math.floor(rand() * 16), ry, 1, 5, wdk);
  grain(c, 0, 0, 64, 64, rand, 0.05, 0.4);
}
TX_WALLS.fence = (p, rand, c, v) => (v === 1 ? tw2FenceBroken(p, rand, c) : tw2Fence(p, rand, c, v));
TX_VARS.fence = 2;

// Mur bas du cimetière : chaperon plat (lignes 0-6) et deux rangs de gros moellons bruts (même pierre que stone v1).
// Chaque moellon est un polygone à coins abattus, joints en biais de 2 px ; facettes éclairées d'en haut à gauche.
function tw2StoneLow(p, rand, c) {
  const S = TX_STONE[1], mortar = txRGB(S.mortar), nz = txFbm(rand, [16, 8, 4]), nz2 = txNoise(rand, 2);
  const LX = -0.6, LY = -0.8;
  const stones = [];
  for (const [y0, y1] of [[7, 36], [36, 64]]) {
    const s0 = Math.floor(rand() * 64), joints = [];
    for (let t = 0; t < 64;) {
      let L = 14 + Math.floor(rand() * 12);
      if (64 - t - L < 12) L = 64 - t;
      joints.push({ x: s0 + t, a: Math.round((rand() - 0.5) * 6), b: Math.round((rand() - 0.5) * 6) });
      t += L;
    }
    joints.push({ x: joints[0].x + 64, a: joints[0].a, b: joints[0].b });
    for (let i = 0; i + 1 < joints.length; i++) {
      const jl = joints[i], jr = joints[i + 1];
      const top = y0 + Math.floor(rand() * 2), bot = y1 - 1 - Math.floor(rand() * 2), cut = 2 + Math.floor(rand() * 4), cut2 = 2 + Math.floor(rand() * 4);
      const A = [jl.x + jl.a + 1, top], B = [jr.x + jr.a - 1, top + Math.round((rand() - 0.5) * 3)], C = [jr.x + jr.b - 1, bot], D = [jl.x + jl.b + 1, bot - Math.round(rand() * 2)];
      const toward = (P, Q, d) => { const l = Math.hypot(Q[0] - P[0], Q[1] - P[1]) || 1; return [P[0] + ((Q[0] - P[0]) * d) / l, P[1] + ((Q[1] - P[1]) * d) / l]; };
      const pts = [toward(A, B, cut), toward(B, A, cut2), toward(B, C, cut2), toward(C, B, cut), toward(C, D, cut), toward(D, C, cut2), toward(D, A, cut2), toward(A, D, cut)];
      // arêtes : normale sortante, pour l'éclairage et la distance au bord
      const edges = pts.map((P, k) => {
        const Q = pts[(k + 1) % pts.length], dx = Q[0] - P[0], dy = Q[1] - P[1], l = Math.hypot(dx, dy) || 1;
        return { P, nx: dy / l, ny: -dx / l };
      });
      const cx = pts.reduce((s, q) => s + q[0], 0) / pts.length, cy = pts.reduce((s, q) => s + q[1], 0) / pts.length;
      stones.push({ edges, cx, cy, hw: (B[0] - A[0]) / 2, hh: (bot - top) / 2, col: txRGB(txPick(rand, S.cols)), k: 0.88 + rand() * 0.2, crease: rand() < 0.4 ? (rand() - 0.5) * 1.4 : null });
    }
  }
  // polygone convexe parcouru dans le sens horaire (y vers le bas) : dedans si toutes les distances signées sont positives
  const hit = (x, y) => {
    for (const st of stones) for (const X of [x + 0.5, x + 64.5, x - 63.5]) {
      let dmin = 1e9, e0 = null;
      for (const e of st.edges) { const d = -((X - e.P[0]) * e.nx + (y + 0.5 - e.P[1]) * e.ny); if (d < dmin) { dmin = d; e0 = e; } }
      if (dmin >= 0) return { st, d: dmin, e: e0, X };
    }
    return null;
  };
  txField(c, (x, y) => {
    const h = hit(x, y);
    if (!h) {
      const up = hit(x, y - 1), up2 = hit(x, y - 2);
      return txK(mortar, up ? 0.5 : up2 ? 0.66 : 0.78 + nz2(x, y) * 0.18);
    }
    const { st, d, e, X } = h;
    const nx = (X - st.cx) / Math.max(4, st.hw), ny = (y + 0.5 - st.cy) / Math.max(4, st.hh);
    let k = st.k * (1.04 - 0.16 * ny - 0.07 * nx) * (0.9 + nz(x + st.cx * 3, y) * 0.2) + (nz2(x, y) - 0.5) * 0.07;
    const lit = e.nx * LX + e.ny * LY;
    if (d < 1.2) k *= 1 + 0.42 * lit; else if (d < 2.4) k *= 1 + 0.2 * lit;
    // arête de facette : un ressaut sombre en biais sur un moellon sur deux
    if (st.crease !== null) { const t = (X - st.cx) - st.crease * (y + 0.5 - st.cy); if (t > -0.5 && t < 0.7 && d > 2.5) k *= 0.88; else if (t >= 0.7 && t < 1.7 && d > 2.5) k *= 1.05; }
    return txK(st.col, k);
  }, 0, 7, 64, 57);
  // éclats, lichen
  for (let i = 0; i < 22; i++) { const x = Math.floor(rand() * 64), y = 9 + Math.floor(rand() * 52), h = hit(x, y); if (h && h.d > 2) { p.P(x, y, shade(S.cols[0], -0.32)); p.P(x + 1, y + 1, shade(S.cols[1], 0.18)); } }
  for (let i = 0; i < 12; i++) { const x = Math.floor(rand() * 64), y = 9 + Math.floor(rand() * 52), h = hit(x, y); if (h && h.d < 3) p.P(x, y, txPick(rand, ['#8a9a6a', '#7a8a5a', '#9a9a6a'])); }
  grain(c, 0, 7, 64, 57, rand, 0.05, 0.4);
  // chaperon : grandes dalles plates, dessus clair (couleur du dessus du mur bas), nez éclairé, ombre portée
  const cap = '#d4bc94';
  p.R(0, 0, 64, 7, cap);
  p.R(0, 0, 64, 2, shade(cap, 0.12)); p.R(0, 2, 64, 1, shade(cap, 0.22)); p.R(0, 5, 64, 1, shade(cap, -0.2)); p.R(0, 6, 64, 1, shade(cap, -0.45));
  for (const jx of [13, 45]) { p.R(jx, 0, 1, 6, shade(S.mortar, -0.1)); p.R(jx + 1, 2, 1, 4, shade(cap, 0.2)); }
  grain(c, 0, 0, 64, 7, rand, 0.06, 0.5);
  tw2Dim(c, 0, 7, 64, 2, (x, y) => (y === 7 ? 0.62 : 0.82));
}

// =================================================================== mine et fort
// Blockhaus : rondins de logs v1 et une meurtrière (v1 : 2 px plus bas, pour que deux voisines ne s'alignent pas)
const tw2Logs = TX_WALLS.logs;
function tw2LogsWindow(p, rand, c, v) {
  tw2Logs(p, rand, c, 1);
  const dy = v ? 2 : 0, y0 = 22 + dy;
  // ombre portée sous l'appui et à droite du cadre, puis cadre, ouverture noire, appui clair
  tw2Dim(c, 15, y0 + 9, 36, 2, (x, y) => (y === y0 + 9 ? 0.55 : 0.78));
  tw2Dim(c, 50, y0 + 1, 1, 8, 0.6);
  p.R(14, y0, 36, 8, '#3a2616');
  p.R(15, y0 + 1, 34, 6, '#0e0a08');
  p.R(15, y0 + 1, 34, 1, '#050403');
  p.P(16, y0 + 5, '#1a1410'); p.P(30, y0 + 5, '#1a1410'); p.P(44, y0 + 4, '#1a1410');
  p.R(14, y0 + 8, 36, 1, '#9a744a'); p.P(14, y0 + 8, '#b08a5a');
  // volet à gauche, rabattu contre le mur : planches, traverses, pentures jusqu'au cadre, clous
  const sx = 6, sy = y0 - 2, sw = 8, sh = 12;
  tw2Dim(c, sx + 1, sy + sh, sw, 1, 0.55);
  for (let x = sx; x < sx + sw; x++) {
    const pl = Math.floor((x - sx) / 3);
    p.R(x, sy, 1, sh, (x - sx) % 3 === 0 ? shade('#5c3e26', -0.35) : shade('#5c3e26', [0, -0.08, 0.05][pl]));
  }
  p.R(sx, sy, sw, 1, shade('#5c3e26', 0.2)); p.R(sx, sy + sh - 1, sw, 1, shade('#5c3e26', -0.4));
  for (const y of [sy + 2, sy + sh - 4]) { p.R(sx, y, sw, 2, '#4a3220'); p.R(sx, y, sw, 1, '#6a4a30'); }
  for (const y of [sy + 3, sy + sh - 3]) { p.R(sx + 2, y, 7, 1, '#2a1a10'); p.P(sx + 8, y, '#5a4a3a'); }
  for (const [nx, ny] of [[sx + 1, sy + 1], [sx + 6, sy + 1], [sx + 1, sy + sh - 2], [sx + 6, sy + sh - 2]]) p.P(nx, ny, '#2a1a10');
  // cale qui tient le volet ouvert
  p.line(sx + 1, sy + sh, sx + 4, sy + sh + 3, '#7a5636');
}

// Mine v1 (au-dessus de 1, étirée sur 1,6 unité) : rock v0 rangée par rangée, telle que les cases voisines de la
// falaise (h 2,6) la montrent entre z 1 et 2,6 (40 lignes par unité) : aucun raccord avec elles. Graine de rock v0.
const tw2Mine = TX_WALLS.mineEntrance;
function tw2MineUp(p, rand, c) {
  const src = canvas(TEX, TEX), sp = pen(src);
  sp.R(0, 0, TEX, TEX, '#000000');
  TX_WALLS.rock(sp, rng(hash('w:rock:0')), src, 0);
  opaque(hardAlpha(src));
  const d = src.getContext('2d').getImageData(0, 0, TEX, TEX).data, H = 1.6;
  txField(c, (x, y) => {
    const z = 1 + (1 - (y + 0.5) / TEX) * H, fz = z - Math.floor(z);
    const i = (((((1 - fz) * TEX) | 0) & 63) * TEX + x) * 4;
    return [d[i], d[i + 1], d[i + 2]];
  });
}
TX_WALLS.mineEntrance = (p, rand, c, v) => (v === 1 ? tw2MineUp(p, rand, c) : tw2Mine(p, rand, c, v));
TX_VARS.mineEntrance = 2;

// =================================================================== enregistrement
Object.assign(TX_WALLS, {
  signAdobe: tw2SignAdobe,
  signBrick: tw2SignBrick,
  stationWall: tw2StationWall,
  stationUp: tw2StationUp,
  trainCarUp: tw2TrainCarUp,
  freightCarUp: tw2FreightCarUp,
  locoUp: tw2LocoUp,
  plankUp: tw2PlankUp,
  stoneLow: tw2StoneLow,
  logsWindow: tw2LogsWindow,
});
Object.assign(TX_VARS, { signAdobe: 16, signBrick: 16, trainCarUp: 2, freightCarUp: 2, locoUp: 5, loco: 5, plankUp: 4, logsWindow: 2 });

// ------------------------------------------------------------------ 3) personnages  9) visage du HUD
// Hommes vus de face (ou de dos) posés sur un squelette : hanches, épaules, tête, genoux, pieds, coudes, mains.
// On dessine en « unités » multipliées par k (El Diablo : k = 1.5), origine aux pieds, y vers le haut négatif.
// De face, la main armée est à gauche de l'écran ; la vue de dos est dessinée pareil puis retournée.

const PP_WHITE = '#f4ecd8';
const PP_BLOOD = ['#4a0808', '#8a1410', '#c02a20', '#e8503a'];
const PP_FIRE = ['#ffffff', '#fff6b0', '#ffd040', '#ff9020', '#e04a10'];
const PP_STEEL = ['#34383f', '#666c76', '#a2a8b2', '#e4e8ee']; // sombre → clair
const PP_NICKEL = ['#4e545e', '#969ca6', '#cdd2da', '#fafcff'];
const PP_BRASS = ['#6e4a14', '#b08428', '#e0b850', '#fff0a0'];
const PP_WOOD = ['#3e220e', '#6e3e1c', '#9a602c', '#c48a4a'];
const PP_SILVER = ['#7a808a', '#c8ccd4', '#f4f6fa'];
const PP_BELT = '#2e1c10', PP_LEATHER = '#5a3820', PP_BOOT = '#3a2414', PP_TNT = ['#7a1410', '#c0302a', '#e8604a'];

// Gabarits (unités) : hanches, épaules, centre de la tête ; demi-largeurs épaules/taille ; jambes, bras, tête
// Proportions façon Doom : tête, mains et carrure exagérées pour rester lisibles de loin
const PP_BUILD = {
  man: { hy: -24, sy: -41, ey: -48, sh: 10, wa: 7, lx: 3, lw: 6, aw: 5, W: 5, belly: 0, fist: 4 },
  brute: { hy: -25, sy: -43, ey: -50, sh: 13, wa: 10, lx: 4, lw: 8, aw: 7, W: 6, belly: 4, fist: 5 },
};
const PP_POSES = { idle: 1, walk: 4, shoot: 2, hurt: 1, die: 4, melee: 2, throw: 2 };

// Pinceau en unités : chaque coordonnée est multipliée par k puis arrondie (les rectangles restent jointifs)
function ppPen(c, k) {
  const p = pen(c, c.width >> 1, c.height - 1);
  const s = (v) => rd(v * k);
  const R = (x, y, w, h, col) => { const x0 = s(x), y0 = s(y); p.R(x0, y0, s(x + w) - x0, s(y + h) - y0, col); };
  return {
    ctx: p.ctx, k, R,
    P: (x, y, col) => R(x, y, 1, 1, col),
    line: (x0, y0, x1, y1, col, w = 1) => p.line(x0 * k, y0 * k, x1 * k, y1 * k, col, Math.max(1, rd(w * k))),
    ell: (cx, cy, rx, ry, col) => p.ell(cx * k, cy * k, rx * k, ry * k, col),
    poly: (pts, col) => p.poly(pts.map(([x, y]) => [x * k, y * k]), col),
  };
}
// Rectangles cernés d'un pixel sombre (contour intérieur au sprite)
function ppOl(q, rects, col) {
  for (const [x, y, w, h] of rects) q.R(x - 1, y - 1, w + 2, h + 2, OUT);
  for (const [x, y, w, h, c] of rects) q.R(x, y, w, h, c || col);
}
// Polygone cerné
function ppPolyOl(q, pts, col) {
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) q.poly(pts.map(([x, y]) => [x + dx, y + dy]), OUT);
  q.poly(pts, col);
}
// Membre : trait épais cerné, ombré côté droit
function ppLimb(q, a, b, w, col, dark) {
  q.line(a[0], a[1], b[0], b[1], OUT, w + 2);
  q.line(a[0], a[1], b[0], b[1], col, w);
  if (dark) q.line(a[0] + (w >> 1), a[1], b[0] + (w >> 1), b[1], dark);
}
// Ombres qui tirent vers le violet, lumières vers le jaune chaud (lumière du soleil en haut à gauche)
const ppD = (c, a = 0.28) => mix(shade(c, -a), '#2a1648', a * 0.4), ppL = (c, a = 0.18) => mix(c, '#fff0c4', a);
const ppLerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
// Liseré de lumière d'un pixel sur les bords haut et gauche de la silhouette (avant le contour) : les vêtements
// sombres restent lisibles la nuit. Les pixels presque noirs (traits OUT) sont sautés : on éclaire le pixel d'après.
function ppRim(c, t = 0.48) {
  const ctx = c.getContext('2d'), w = c.width, h = c.height, img = ctx.getImageData(0, 0, w, h), d = img.data, s = new Uint8ClampedArray(d);
  const A = (x, y) => x >= 0 && y >= 0 && x < w && y < h && s[(y * w + x) * 4 + 3] > 0;
  const dark = (x, y) => { const i = (y * w + x) * 4; return s[i] + s[i + 1] + s[i + 2] < 75; };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    if (!s[i + 3] || dark(x, y)) continue;
    const top = !A(x, y - 1) || (dark(x, y - 1) && !A(x, y - 2));
    const left = !A(x - 1, y) || (dark(x - 1, y) && !A(x - 2, y));
    if (!top && !left) continue;
    const k = top && left ? t * 1.35 : t;
    d[i] += (255 - d[i]) * k; d[i + 1] += (238 - d[i + 1]) * k; d[i + 2] += (196 - d[i + 2]) * k;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

// ------------------------------------------------------------------ fiches des personnages
const PP_V = { // variantes 0..5 des bandits
  skin: [1, 3, 0, 4, 2, 5].map((i) => SKIN[i]),
  hair: [0, 1, 5, 8, 2, 6].map((i) => HAIR_COLORS[i]),
  shirt: ['#d9c49a', '#5a7a9a', '#a83a3a', '#e8e0cc', '#6a7a3a', '#8a8a92'],
  vest: ['#4e3424', '#3c3632', '#6a4426', '#55566a', '#7c3024', '#3a4c34'],
  mask: ['#b02a20', '#c8402a', '#2f4a7e', '#d03a2a', '#8a1a1a', '#e09a2a'],
  hat: ['#3a3430', '#5c3a24', '#6a4a34', '#302a2c', '#7a5c44', '#4a3c38'],
  pants: ['#5a4632', '#44506a', '#6a5640', '#3c3836', '#5a4c40', '#4a4234'],
  coat: ['#8a7050', '#6e5438', '#4c4c54', '#7a6848', '#544842', '#8a7a62'],
  beard: ['stubble', 'mustache', 'full', 'none', 'horseshoe', 'goatee'],
  hairStyle: ['short', 'long', 'short', 'wild', 'long', 'short'],
};
function ppBase(v) {
  const p = (k) => PP_V[k][v % 6];
  return {
    k: 1, dim: [48, 64], B: PP_BUILD.man, skin: p('skin'), hair: p('hair'), hairStyle: p('hairStyle'), beard: p('beard'),
    hat: 'cowboy', hatC: p('hat'), band: ppD(p('hat'), 0.45), shirt: p('shirt'), top: 'vest', vest: p('vest'),
    pants: p('pants'), boots: PP_BOOT, metal: PP_STEEL, gun: 'revolver', mood: 'angry', eye: OUT,
    scarf: null, mask: null, bando: null, gunbelt: true, rolled: false, star: false, sash: null,
  };
}
function ppSpec(kind, v) {
  const s = ppBase(v), p = (k) => PP_V[k][v % 6];
  switch (kind) {
    case 'bandit':
      return { ...s, mask: p('mask'), beard: 'none', hat: 'outlaw' };
    case 'rifleman':
      return { ...s, top: 'coat', vest: p('coat'), hat: v % 2 ? 'gambler' : 'cowboy', scarf: p('mask'), gun: 'rifle',
        beard: ['mustache', 'horseshoe', 'walrus', 'stubble', 'handlebar', 'chops'][v % 6] };
    case 'brute':
      return { ...s, B: PP_BUILD.brute, hat: 'bowler', hatC: ['#2a2622', '#3d2a1c', '#4a4038'][v % 3], band: '#14100e',
        top: 'undershirt', shirt: ['#b8463a', '#7a8a96', '#5a6e84', '#8a3a2a', '#5a7a5a', '#a8402e'][v % 6],
        vest: ['#3a4a6a', '#4a3a2a', '#2f4a5e', '#3a3a3e', '#5a4632', '#2a3a4a'][v % 6], rolled: true,
        hairStyle: 'short', beard: v % 2 ? 'full' : 'prospector', gun: 'shotgun', gunbelt: false };
    case 'dynamiter':
      return { ...s, hat: 'slouch', hatC: ['#6a5a40', '#5a4632', '#7a6a50', '#4a4038', '#8a7050', '#5a5048'][v % 6],
        top: 'shirt', shirt: ['#8a3a2a', '#c8b898', '#6a7a8a', '#a8642a', '#7a2a2a', '#b8a888'][v % 6], bando: 'dyn',
        hairStyle: 'wild', beard: 'stubble', gun: 'dynamite', mood: 'grin', gunbelt: false, goggles: true };
    case 'diablo':
      return { ...s, k: 1.5, dim: [72, 96], B: { ...PP_BUILD.man, ey: -47 }, skin: SKIN[3], hair: '#14121a', hairStyle: 'long', beard: 'handlebar',
        hat: 'sombrero', hatC: '#1c181c', band: '#2a2228', conchos: true, top: 'charro', shirt: '#5a1a20', vest: '#34303e',
        pants: '#2e2a38', sash: '#c0201c', bando: 'x', gun: 'dual', metal: PP_NICKEL, eye: '#ff3a1a', scar: true, cape: ['#a81c1c', '#1e1a24'] };
  }
  return null;
}
const PP_HAIRSTYLE = { long: 'long', bob: 'long', braids: 'long', mullet: 'long', bald: 'bald', afro: 'wild', messy: 'wild', curly: 'wild', mohawk: 'wild' };
// Le cowboy du joueur : riderLook + sa couleur au foulard et au ruban du chapeau
function ppCowboySpec(look) {
  const o = look.outfit || 'shirt', cl = look.cloth;
  const s = {
    ...ppBase(0), skin: look.skin, hair: look.hair, hairStyle: PP_HAIRSTYLE[look.hairStyle] || 'short', beard: look.beard || 'none', hat: look.hat || 'cowboy',
    hatC: look.hatC, band: look.color, scarf: look.color, mood: 'calm', pants: '#3e3a44', shirt: '#d8c8a0', vest: cl, top: 'shirt',
  };
  if (o === 'shirt' || o === 'plaid' || o === 'bandolier') { s.shirt = cl; s.top = o === 'plaid' ? 'plaid' : 'shirt'; if (o === 'bandolier') s.bando = 'one'; }
  else if (o === 'vest' || o === 'sheriff') { s.top = 'vest'; s.star = o === 'sheriff'; }
  else if (o === 'duster') { s.top = 'coat'; s.shirt = '#e2d2a6'; }
  else if (o === 'suit') { s.top = 'suit'; s.shirt = '#ece4d0'; }
  else if (o === 'overalls') { s.top = 'overalls'; s.shirt = '#c8b48a'; s.gunbelt = false; }
  else if (o === 'fringe') s.top = 'fringe';
  else if (o === 'poncho') { s.top = 'shirt'; s.poncho = cl; }
  return s;
}

// ------------------------------------------------------------------ poses
// Squelette (unités) : J.hip, J.neck (milieu des épaules), J.head, J.legs[i] {h, k, f}, J.arms[i] {s, e, h}
function ppRig(sp, pose, f) {
  const B = sp.B, { sh, lx } = B;
  const long = sp.gun === 'rifle' || sp.gun === 'shotgun';
  const J = { face: sp.mood, hold: long ? 'port' : sp.gun === 'dynamite' ? 'stick' : sp.gun === 'dual' ? 'low2' : 'low',
    flash: false, kneel: false, blood: 0, spurt: false, hatOff: null, sway: 0, glow: [] };
  let bob = 0, lean = 0, sink = 0, drop = 0, hd = [0, 0], lift = -1, sw = 0;
  let feet = [[-lx - 1, 0], [lx + 1, 0]];
  if (pose === 'walk') { lift = [0, -1, 1, -1][f]; bob = f % 2 ? -1 : 0; sw = [1, 0, -1, 0][f]; J.sway = sw; lean = sw; hd = [sw, 0]; }
  else if (pose === 'shoot') { J.hold = long ? 'aimL' : sp.gun === 'dual' ? 'aim2' : 'aim'; J.face = 'angry'; J.flash = f === 1; if (f) hd = [0, -1]; if (long) hd = [-1, f ? 0 : 1]; }
  else if (pose === 'hurt') { lean = 2; sink = 1; hd = [1, -1]; J.face = 'pain'; J.spurt = true; J.blood = 1; J.hatOff = [1, -2]; feet = [[-lx - 2, 0], [lx + 2, 0]]; J.hold = long ? 'flail' : sp.gun === 'dynamite' ? 'none' : 'flail1'; }
  else if (pose === 'die' && f === 0) { sink = 2; drop = 2; hd = [0, 2]; J.face = 'pain'; J.blood = 2; J.hold = 'drop'; feet = [[-lx - 2, 0], [lx + 1, 0]]; }
  else if (pose === 'die') { J.kneel = true; J.face = 'dead'; J.blood = 2; J.hold = 'none'; J.hatOff = [sp.hat === 'sombrero' ? 3 : 6, -9]; }
  else if (pose === 'melee') { lean = f ? 1 : -1; hd = f ? [1, 1] : [-1, 0]; J.face = 'shout'; J.hold = long ? (f ? 'clubDown' : 'clubUp') : (f ? 'knifeDown' : 'knifeUp'); if (f) feet = [[-lx - 2, 0], [lx + 2, 0]]; }
  else if (pose === 'throw') { lean = f ? 1 : -1; hd = f ? [1, 1] : [-1, 0]; J.face = 'grin'; J.hold = f ? 'dynOut' : 'dynUp'; if (f) feet = [[-lx - 2, 0], [lx + 2, 0]]; }

  let py = B.hy + sink + bob, ny = B.sy + sink + bob + drop;
  if (J.kneel) { py = -12; ny = py - (B.hy - B.sy) + 2; hd = [1, 3]; }
  J.hip = [0, py]; J.neck = [lean, ny]; J.head = [lean + hd[0], ny + (B.ey - B.sy) + hd[1]];
  J.legs = [0, 1].map((i) => {
    const s = i ? 1 : -1, h = [s * lx, py];
    if (J.kneel) return { h, k: [s * (lx + 1), -2], f: null };
    const fo = i === lift ? [s * lx, -5] : feet[i];
    const k = [(h[0] + fo[0]) / 2 + s * (i === lift ? 2 : 0.5), (h[1] + fo[1]) / 2 - (i === lift ? 3 : 0)];
    return { h, k, f: fo };
  });
  // mains selon la prise
  const lowL = [-(sh + 1), py - 1], lowR = [sh + 1, py - 1];
  let H = [lowL, lowR], E = [null, null];
  switch (J.hold) {
    case 'low': case 'low2': if (pose === 'walk') { H = [[lowL[0] + (sw < 0 ? 1 : 0), lowL[1] - (sw < 0 ? 3 : 0) + (sw > 0 ? 1 : 0)], [lowR[0] - (sw > 0 ? 1 : 0), lowR[1] - (sw > 0 ? 3 : 0) + (sw < 0 ? 1 : 0)]]; } break;
    case 'stick': H = [[-(sh + 2), ny + 5], lowR]; E = [[-(sh + 1), ny + 10], null]; break;
    case 'port': H = [[-3, py - 3], [4, ny + 6]]; E = [[-sh, ny + 9], [sh + 1, ny + 8]]; break;
    case 'aim': H = [[-3, ny + 8 - (J.flash ? 2 : 0)], [sh + 1, py - 2]]; E = [[-sh, ny + 6], null]; break;
    case 'aim2': H = [[-5, ny + 8 - (J.flash ? 2 : 0)], [5, ny + 8 - (J.flash ? 2 : 0)]]; E = [[-sh, ny + 6], [sh, ny + 6]]; break;
    case 'aimL': H = [[-(sh - 3), ny + 3 - (J.flash ? 1 : 0)], [1, ny + 9 - (J.flash ? 2 : 0)]]; E = [[-(sh + 1), ny + 7], [sh - 1, ny + 10]]; break;
    case 'flail': H = [[-(sh + 4), ny], [sh + 3, ny + 3]]; E = [[-(sh + 2), ny + 5], [sh + 2, ny + 7]]; break;
    case 'flail1': case 'none': if (pose === 'hurt') { H = [[-(sh + 4), ny + 1], [sh + 4, ny + 2]]; E = [[-(sh + 2), ny + 5], [sh + 2, ny + 6]]; } break;
    case 'drop': H = [[-2, py - 4], [2, py - 5]]; E = [[-(sh + 1), ny + 7], [sh + 1, ny + 7]]; break;
    case 'knifeUp': H = [[-(sh + 2), ny - 7], [sh + 2, ny + 6]]; E = [[-(sh + 3), ny - 1], [sh + 2, ny + 9]]; break;
    case 'knifeDown': H = [[sh - 2, py - 3], [sh + 2, py - 1]]; E = [[-1, ny + 7], null]; break;
    case 'clubUp': H = [[-(sh + 1), ny - 5], [-(sh - 4), ny - 8]]; E = [[-(sh + 3), ny], [-(sh - 2), ny - 2]]; break;
    case 'clubDown': H = [[1, ny + 6], [4, ny + 9]]; E = [[-(sh - 2), ny + 6], [sh - 1, ny + 8]]; break;
    case 'dynUp': H = [[-(sh + 3), ny - 8], [sh + 3, ny + 3]]; E = [[-(sh + 4), ny - 2], [sh + 2, ny + 6]]; break;
    case 'dynOut': H = [[-1, ny + 6], [sh + 2, py - 1]]; E = [[-(sh - 1), ny + 5], null]; break;
  }
  if (J.kneel) { H = [[-sh, -9], [sh, -8]]; E = [null, null]; }
  J.arms = [0, 1].map((i) => {
    const s = i ? 1 : -1, sa = [s * (sh - 1) + lean, ny + 2], h = H[i];
    const e = E[i] || [(sa[0] + h[0]) / 2 + s * 2, (sa[1] + h[1]) / 2 + 1];
    return { s: sa, e, h, i };
  });
  return J;
}

// ------------------------------------------------------------------ corps
// Torse ligne par ligne : bornes [gauche, droite, centre] à la ligne y (épaules arrondies, taille, panse)
function ppSpan(B, J, y) {
  const [nx, ny] = J.neck, [px, py] = J.hip, wy = py - 2;
  const t = (y - ny) / Math.max(1, py - ny);
  const cx = nx + (px - nx) * t;
  let hw = y <= ny ? B.sh - 1 : y < ny + 4 ? B.sh : y < wy ? B.sh + ((B.wa - B.sh) * (y - ny - 4)) / Math.max(1, wy - ny - 4) : B.wa;
  if (B.belly) hw += B.belly * Math.max(0, 1 - Math.abs(y - (wy - 4)) / 6);
  return [rd(cx - hw), rd(cx + hw), rd(cx)];
}
// Couleur du vêtement au pixel (u : écart au milieu, r : ligne depuis les épaules, dl/dr : distance aux bords)
function ppCloth(sp, u, r, dl, dr, y, wy, py, back) {
  const sd = (c) => (dr <= 1 ? ppD(c) : dr === 2 && (u + y) & 1 ? ppD(c, 0.14) : dl === 0 ? ppL(c) : dl === 1 && (y & 1) ? ppL(c, 0.08) : c);
  if (y >= py) return sd(sp.pants);
  if (y >= wy) {
    if (sp.sash) return (u + y) % 3 ? sp.sash : ppD(sp.sash);
    return !back && Math.abs(u) <= 1 ? (y === wy ? PP_BRASS[2] : PP_BRASS[1]) : PP_BELT;
  }
  const t = sp.top, shirt = sp.shirt, au = Math.abs(u);
  if (t === 'plaid') {
    const v = (dl % 4) === 1, hz = (r % 4) === 2;
    return sd(v && hz ? ppD(shirt, 0.45) : v || hz ? ppD(shirt, 0.22) : shirt);
  }
  if (t === 'shirt') {
    if (back) return sd(r === 3 ? ppD(shirt, 0.15) : shirt);
    if (u === 0 && r >= 2) return r % 3 === 1 ? ppL(shirt, 0.4) : ppD(shirt, 0.18);
    if (r <= 1 && au >= 1 && au <= 2) return ppL(shirt, 0.25);
    return sd(shirt);
  }
  if (t === 'undershirt') {
    const su = Math.round(sp.B.sh * 0.4);
    if (au >= su - 1 && au <= su && !(back && r > 6)) return au === su - 1 ? ppL(sp.vest, 0.15) : sp.vest;
    if (back && Math.abs(au - su + 0.5 - (r - 6) * 0.35) < 1 && r > 6) return sp.vest;
    if (!back && au === su + 1 && r > 2) return ppD(shirt, 0.18); // ombre de la bretelle
    if (!back && u === 0 && r <= 4) return r % 2 ? PP_WHITE : ppD(shirt, 0.2);
    return sd(shirt);
  }
  if (t === 'overalls') {
    if (r >= 6 && au <= 4) return au === 4 ? ppD(sp.vest) : r === 6 ? ppL(sp.vest) : sp.vest;
    if (au >= 3 && au <= 4) return sp.vest;
    return sd(shirt);
  }
  if (t === 'charro') {
    if (r <= 9 && !(au <= 1 && !back)) {
      if (!back && au === 2) return r % 2 ? PP_SILVER[2] : PP_SILVER[0];
      if (r === 9) return PP_SILVER[1];
      return sd(sp.vest);
    }
    return !back && u === 0 && r % 2 ? PP_SILVER[1] : sd(shirt);
  }
  // gilet, manteau, costume, veste à franges : ouverture en V au milieu
  const open = back ? -1 : t === 'vest' ? (r <= 3 ? 3 - r * 0.5 : 1.2) : r <= 5 ? 3 - r * 0.45 : 0.6;
  if (au < open) {
    if (t === 'suit' && u === 0 && r >= 1) return '#5a1a1a';
    return au < open - 1 ? shirt : ppD(shirt, 0.25);
  }
  const c = sp.vest;
  if (back && r === 4 && dl > 0 && dr > 1) return ppL(c, 0.12); // empiècement
  if (back && u === 0 && r > 4) return ppD(c, 0.2); // couture du dos
  if (!back && au < open + 1 && t !== 'vest') return ppL(c, 0.22); // revers
  if (t === 'fringe' && r === 5) return ppD(c, 0.3);
  if (t === 'fringe' && r === 6) return (dl % 2) ? ppL(c, 0.3) : c;
  if (!back && t === 'vest' && r > 3 && au === 4 && r % 4 === 0) return PP_BRASS[2];
  return sd(c);
}
function ppTorso(q, sp, J, back) {
  const { R, P } = q, B = sp.B, [, ny] = J.neck, [, py] = J.hip, wy = py - 2;
  for (let y = ny - 1; y <= py + 2; y++) { const [a, b] = ppSpan(B, J, clamp(y, ny, py + 1)); R(a - 1, y, b - a + 3, 1, OUT); }
  for (let y = ny; y <= py + 1; y++) {
    const [a, b, cx] = ppSpan(B, J, y);
    for (let x = a; x <= b; x++) P(x, y, ppCloth(sp, x - cx, y - ny, x - a, b - x, y, wy, py, back));
  }
  // taches de sang sur la poitrine / le ventre
  if (J.blood && !back) {
    const [, , cx] = ppSpan(B, J, wy - 4);
    const by = J.blood > 1 ? wy - 4 : ny + 6;
    q.ell(cx + 1, by, 2 + J.blood * 0.5, 1.5 + J.blood * 0.5, PP_BLOOD[1]);
    P(cx + 1, by, PP_BLOOD[2]); P(cx, by - 1, PP_BLOOD[3]);
    if (J.blood > 1) { R(cx + 2, by + 2, 1, 3, PP_BLOOD[1]); R(cx - 1, by + 2, 1, 4, PP_BLOOD[1]); }
  }
}
// Pans du cache-poussière (de face : deux pans ouverts sur les jambes ; de dos : un pan fendu)
function ppTails(q, sp, J, back) {
  const B = sp.B, [px, py] = J.hip, wy = py - 2, tb = rd(B.hy * 0.4), c = sp.vest, s = J.sway;
  if (J.kneel) return;
  if (back) {
    const pts = [[px - B.wa, wy], [px + B.wa, wy], [px + B.wa + 3 - s, tb], [px - B.wa - 3 - s, tb]];
    ppPolyOl(q, pts, c);
    q.line(px, py + 3, px - s, tb, ppD(c, 0.4));
    q.line(px + B.wa + 2 - s, tb + 3, px + B.wa, wy + 2, ppD(c));
    q.R(px - B.wa - 3 - s, tb - 1, 2 * B.wa + 7, 1, ppD(c));
    return;
  }
  for (const side of [-1, 1]) {
    const pts = [[px + side * B.wa, wy], [px + side, wy], [px + side * 3 - s, tb], [px + side * (B.wa + 3) - s, tb]];
    ppPolyOl(q, pts, c);
    q.line(px + side * 2, wy + 1, px + side * 3 - s, tb, ppL(c, 0.2)); // bord intérieur clair
    q.line(px + side * (B.wa + 2) - s, tb, px + side * (B.wa - 1), wy + 3, ppD(c));
    q.R(Math.min(px + side * 3, px + side * (B.wa + 3)) - s, tb, B.wa + 1, 1, ppD(c, 0.4));
  }
}
// Cape du boss : de face on voit sa doublure rouge qui déborde des épaules, de dos le drap noir bordé d'or
function ppCape(q, sp, J, back) {
  const B = sp.B, [nx, ny] = J.neck, s = J.sway, bot = J.kneel ? J.hip[1] + 4 : -9;
  const top = ny + 1, L = nx - B.sh - 1, Rr = nx + B.sh + 1, bl = -B.sh - 5 - s, br = B.sh + 5 - s;
  const pts = [[L, top], [Rr, top], [br, bot], [bl, bot]];
  ppPolyOl(q, pts, back ? sp.cape[1] : sp.cape[0]);
  if (back) {
    const c = sp.cape[1];
    for (let i = -2; i <= 2; i++) q.line(nx + i * 3, top + 3, i * 4 - s, bot - 1, i % 2 ? ppD(c, 0.3) : ppL(c, 0.08));
    q.line(bl, bot, br, bot, PP_BRASS[2]); q.line(bl + 1, bot - 1, br - 1, bot - 1, PP_BRASS[1]);
    for (let x = bl + 2; x < br - 1; x += 3) q.P(x, bot - 1, sp.cape[0]);
    q.line(L, top, bl, bot, ppL(c, 0.2));
  } else {
    const c = sp.cape[0];
    q.line(L + 1, top + 1, bl + 1, bot - 1, ppL(c, 0.25)); q.line(Rr - 1, top + 1, br - 2, bot - 1, ppD(c, 0.35));
    q.line(bl, bot, br, bot, PP_BRASS[2]);
    for (const f of [-0.6, 0.6]) q.line(nx + f * B.sh, top + 4, f * (B.sh + 4) - s, bot - 1, ppD(c, 0.25));
  }
}
// Poncho rayé par-dessus le torse
function ppPoncho(q, sp, J) {
  const [nx, ny] = J.neck, [, py] = J.hip, c = sp.poncho, B = sp.B;
  const top = ny - 1, bot = py - 4, rows = bot - top;
  for (let y = top - 1; y <= bot + 1; y++) {
    const t = clamp((y - top) / rows, 0, 1), hw = 4 + (B.sh + 3 - 4) * Math.min(1, t * 1.6), cx = nx * (1 - t);
    q.R(cx - hw - 1, y, hw * 2 + 3, 1, OUT);
  }
  for (let y = top; y <= bot; y++) {
    const t = (y - top) / rows, hw = 4 + (B.sh + 3 - 4) * Math.min(1, t * 1.6), cx = nx * (1 - t), r = y - top;
    for (let x = rd(cx - hw); x <= rd(cx + hw); x++) {
      let col = r === 6 || r === 7 ? '#e8c070' : r === 10 ? ppD(c, 0.4) : (r === 8 && (x + r) % 3 === 0) ? '#2a5a7a' : c;
      if (x >= cx + hw - 1) col = ppD(col);
      if (y === bot && (x & 1)) col = OUT;
      q.P(x, y, col);
    }
  }
}
// Accessoires : foulard, cartouchières, étoile, poncho
function ppExtras(q, sp, J, back) {
  const { R, P } = q, B = sp.B, [nx, ny] = J.neck, [px, py] = J.hip, wy = py - 2;
  if (sp.bando) {
    const strap = (x0, x1, dyn) => {
      q.line(x0, ny, x1, wy - 1, OUT, 4);
      q.line(x0, ny, x1, wy - 1, PP_LEATHER, 2);
      const n = wy - 1 - ny;
      for (let i = 1; i < n; i += dyn ? 3 : 2) {
        const x = rd(x0 + ((x1 - x0) * i) / n), y = ny + i;
        if (back) { P(x, y, ppD(PP_LEATHER)); continue; }
        if (dyn) { R(x - 1, y - 1, 2, 3, OUT); R(x, y - 2, 1, 3, PP_TNT[1]); P(x, y - 2, PP_TNT[2]); }
        else { P(x, y, PP_BRASS[2]); P(x, y - 1, PP_BRASS[3]); }
      }
    };
    strap(nx - B.sh + 2, px + B.wa - 1, sp.bando === 'dyn');
    if (sp.bando === 'x') strap(nx + B.sh - 2, px - B.wa + 1, false);
  }
  if (sp.poncho) ppPoncho(q, sp, J);
  if (sp.star && !back) { const x = nx - 4, y = ny + 5; P(x, y - 1, PP_BRASS[3]); R(x - 2, y, 5, 1, PP_BRASS[2]); R(x - 1, y + 1, 3, 1, PP_BRASS[2]); P(x - 1, y + 2, PP_BRASS[1]); P(x + 1, y + 2, PP_BRASS[1]); P(x, y, PP_WHITE); }
  if (sp.sash && !back) { R(px + B.wa - 2, wy + 1, 2, 7, OUT); R(px + B.wa - 1, wy + 1, 1, 6, ppD(sp.sash)); }
  if (sp.gunbelt && !J.kneel) {
    // ceinturon bas sur la hanche + étui sur la cuisse côté arme
    const [, , cx] = ppSpan(B, J, py);
    for (let x = cx - B.wa; x <= cx + B.wa; x++) P(x, py + ((x - cx) < 0 ? 1 : 0), (x & 1) ? PP_LEATHER : PP_BRASS[1]);
    const hx = -(B.lx + 3) + cx;
    ppOl(q, [[hx - 1, py + 1, 3, 6]], PP_LEATHER);
    P(hx - 1, py + 1, ppL(PP_LEATHER));
  }
  if (sp.scarf) {
    if (!back) {
      ppOl(q, [[nx - 3, ny - 1, 7, 2], [nx - 2, ny + 1, 5, 1], [nx - 1, ny + 2, 3, 1], [nx, ny + 3, 1, 1]], sp.scarf);
      R(nx - 3, ny, 7, 1, ppD(sp.scarf, 0.2)); P(nx, ny + 1, ppL(sp.scarf, 0.3)); P(nx - 2, ny - 1, ppL(sp.scarf, 0.3));
    } else {
      ppOl(q, [[nx - 3, ny - 1, 7, 2], [nx, ny + 1, 2, 3]], sp.scarf);
      P(nx + 1, ny + 2, ppD(sp.scarf)); P(nx, ny - 1, ppL(sp.scarf, 0.3));
    }
  }
}
// Jambes : cuisse, tibia, botte (avec éperon) ; à genoux : cuisses vues de face, genoux au sol
function ppLegs(q, sp, J) {
  const B = sp.B, pc = sp.pants, pd = ppD(pc);
  for (const L of J.legs) {
    if (!L.f) {
      ppLimb(q, L.h, L.k, B.lw, pc, pd);
      q.R(L.k[0] - (B.lw >> 1), L.k[1], B.lw, 2 - L.k[1], ppD(pc, 0.4));
      continue;
    }
    const an = [L.f[0], L.f[1] - 5];
    ppLimb(q, L.h, L.k, B.lw, pc, pd);
    ppLimb(q, L.k, an, B.lw - 1, pc, pd);
    const [fx, fy] = L.f, bw = B.lw;
    ppOl(q, [[fx - (bw >> 1), fy - 6, bw, 4], [fx - (bw >> 1) - 1, fy - 2, bw + 1, 3]], sp.boots);
    q.R(fx - (bw >> 1), fy - 6, bw, 1, ppL(sp.boots, 0.15));
    q.P(fx - (bw >> 1), fy - 2, ppL(sp.boots, 0.3));
    q.R(fx + (bw >> 1) - 1, fy - 5, 1, 3, ppD(sp.boots));
    const sx = fx + (fx < 0 ? -(bw >> 1) - 2 : (bw >> 1) + 1);
    q.P(sx, fy - 2, PP_SILVER[1]); // éperon
    if (sp.conchos) for (let t = 0.15; t < 1; t += 0.22) { const m = ppLerp(L.h, an, t), o = fx < 0 ? -(bw >> 1) : bw >> 1; q.P(m[0] + o, m[1], PP_SILVER[2]); } // boutons d'argent du charro
  }
}
// Bras : manche (ou avant-bras nu), le poing est posé après l'arme
function ppArm(q, sp, A) {
  const B = sp.B, c = sp.top === 'coat' || sp.top === 'suit' || sp.top === 'fringe' || sp.top === 'charro' ? sp.vest : sp.shirt;
  if (!sp.poncho) ppLimb(q, A.s, A.e, B.aw, c, ppD(c));
  const fore = sp.rolled ? sp.skin : c;
  const w = ppLerp(A.e, A.h, 0.8);
  ppLimb(q, A.e, w, B.aw - 1, fore, ppD(fore));
  if (sp.rolled) { const m = ppLerp(A.e, A.h, 0.1); q.line(m[0], m[1], m[0], m[1], ppL(c, 0.1), B.aw - 1); }
  if (sp.top === 'charro') { const m = ppLerp(A.e, A.h, 0.7); q.line(m[0], m[1], m[0], m[1], PP_SILVER[1], 2); }
}
function ppFist(q, sp, h, big = 0) {
  const n = sp.B.fist + big, x = rd(h[0] - (n >> 1)), y = rd(h[1] - (n >> 1));
  ppOl(q, [[x, y, n, n]], sp.skin);
  const sk = sp.skin;
  q.R(x + n - 1, y, 1, n, ppD(sk, 0.22)); q.R(x, y + n - 1, n, 1, ppD(sk, 0.3)); q.R(x, y, n - 1, 1, ppL(sk, 0.25));
  if (n >= 4) for (let i = 1; i < n - 1; i += 2) q.P(x + i, y + 1, ppD(sk, 0.15)); // jointures
}

// ------------------------------------------------------------------ armes
function ppFlash(q, x, y, r) {
  const [W, Y1, Y2, O1, O2] = PP_FIRE;
  for (let a = 0; a < 8; a++) {
    const t = (a * Math.PI) / 4 + 0.2, L = a % 2 ? r * 0.55 : r;
    q.line(x, y, x + Math.cos(t) * L, y + Math.sin(t) * L, a % 2 ? O2 : O1, a % 2 ? 1 : 2);
  }
  q.ell(x, y, r * 0.5, r * 0.45, Y2);
  q.ell(x, y, r * 0.3, r * 0.28, Y1);
  q.R(x - 1, y, 3, 1, W); q.R(x, y - 1, 1, 3, W);
}
function ppSpark(q, x, y) {
  q.P(x, y, PP_FIRE[0]);
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) q.P(x + dx, y + dy, PP_FIRE[2]);
  for (const [dx, dy] of [[2, -2], [-2, -1], [1, 2], [-1, -2]]) q.P(x + dx, y + dy, PP_FIRE[3]);
}
// Revolver le long de la jambe (canon vers le bas) : chien, barillet, long canon
function ppGunLow(q, sp, h, s) {
  const g = sp.metal, [x, y] = [rd(h[0]), rd(h[1])], bx = x + (s < 0 ? -1 : 0);
  ppOl(q, [[x - 2, y + 1, 4, 3, g[1]], [bx, y + 4, 2, 5, g[2]], [x, y - 3, 1, 1, g[1]]]);
  q.P(x - 1, y + 1, g[3]); q.P(x - 1, y + 2, g[2]); q.P(x + 1, y + 3, g[0]); q.P(x, y + 2, g[0]);
  q.R(bx, y + 4, 1, 5, g[2]); q.R(bx + 1, y + 4, 1, 5, g[0]); q.P(bx, y + 4, g[3]); q.P(bx, y + 8, g[1]); q.P(bx + 1, y + 8, OUT);
}
// Revolver braqué sur la caméra, en raccourci : barillet large, gros canon dont on voit l'âme noire, guidon
function ppGunAim(q, sp, h) {
  const g = sp.metal, [x, y] = [rd(h[0]), rd(h[1])];
  ppOl(q, [[x - 3, y - 5, 7, 3, g[1]], [x - 1, y - 8, 3, 3, g[2]], [x + 2, y - 7, 1, 2, g[1]]]);
  q.R(x - 3, y - 5, 7, 1, g[2]); q.P(x - 3, y - 5, g[3]); q.P(x - 2, y - 4, g[0]); q.P(x, y - 4, g[0]); q.P(x + 2, y - 4, g[0]); q.R(x - 3, y - 3, 7, 1, g[0]);
  q.R(x - 1, y - 8, 3, 1, g[3]); q.P(x - 1, y - 7, g[3]); q.P(x, y - 7, OUT); q.P(x + 1, y - 6, g[0]);
  return [x, y - 7];
}
// Arme longue du point a (crosse) au point b (bouche) : bois, boîte de culasse, canon
function ppLongGun(q, sp, a, b, thick = 0) {
  const sg = sp.gun === 'shotgun', rec = sg ? PP_STEEL : PP_BRASS;
  const m1 = ppLerp(a, b, 0.32), m2 = ppLerp(a, b, 0.48), m3 = ppLerp(a, b, sg ? 0.75 : 0.7);
  q.line(a[0], a[1], b[0], b[1], OUT, 4 + thick);
  q.line(a[0], a[1], m1[0], m1[1], PP_WOOD[2], 2 + thick);
  q.line(a[0], a[1], m1[0], m1[1], PP_WOOD[1], 1);
  q.line(m1[0], m1[1], m2[0], m2[1], rec[2], 2 + thick);
  q.P(m1[0], m1[1], rec[3]);
  q.line(m2[0], m2[1], b[0], b[1], PP_STEEL[2], 2 + thick);
  q.line(m2[0], m2[1], b[0], b[1], PP_STEEL[1], 1);
  if (sg || thick) q.line(m2[0], m2[1], m3[0], m3[1], PP_WOOD[2], 2 + thick); // garde-main
  return b;
}
// Arme longue épaulée vers la caméra (raccourci) : bouche(s) énormes, on regarde dans le canon
function ppLongAim(q, sp, J, under = false) {
  const [h0, h1] = [J.arms[0].h, J.arms[1].h], sg = sp.gun === 'shotgun';
  const a = [h0[0] - 2, h0[1] - 2], b = [h1[0] + 1, h1[1] - 1];
  const g = PP_STEEL, x = rd(b[0]), y = rd(b[1]);
  if (under) { ppLongGun(q, sp, a, b, 1); return [x, y - 1]; }
  // par-dessus les mains : bout du canon (garde-main bois pour le fusil de chasse) et bouche
  const m = ppLerp(a, b, 0.62);
  q.line(m[0], m[1], b[0], b[1], OUT, 5); q.line(m[0], m[1], b[0], b[1], sg ? PP_WOOD[2] : g[1], 3); q.line(m[0] - 1, m[1], b[0] - 1, b[1], sg ? PP_WOOD[3] : g[2]);
  if (sg) {
    ppOl(q, [[x - 3, y - 3, 7, 4, g[2]]]);
    q.R(x - 3, y - 3, 7, 1, g[3]); q.R(x - 3, y - 3, 1, 4, g[3]); q.R(x + 3, y - 2, 1, 3, g[0]);
    q.R(x - 2, y - 2, 2, 2, OUT); q.R(x + 1, y - 2, 2, 2, OUT); q.P(x, y - 1, g[1]);
    return [x, y - 1];
  }
  ppOl(q, [[x - 2, y - 3, 4, 4, g[2]], [x - 1, y - 4, 1, 1, g[3]]]);
  q.R(x - 2, y - 3, 4, 1, g[3]); q.P(x - 2, y - 2, g[3]); q.R(x + 1, y - 2, 1, 2, g[0]);
  q.R(x - 1, y - 2, 2, 2, OUT);
  return [x, y - 1];
}
// Bâton de dynamite (vertical), mèche et étincelle
function ppStick(q, x, y, big, glow, lit = true) {
  x = rd(x); y = rd(y);
  const w = big ? 3 : 2, h = big ? 8 : 6;
  ppOl(q, [[x - (w >> 1), y - h, w, h, PP_TNT[1]]]);
  q.R(x - (w >> 1), y - h, 1, h, PP_TNT[2]); q.R(x - (w >> 1) + w - 1, y - h, 1, h, PP_TNT[0]);
  q.R(x - (w >> 1), y - h + 2, w, 1, '#e8d8b0');
  q.P(x, y - h - 1, '#d8c8a0'); q.P(x + 1, y - h - 2, '#d8c8a0');
  if (lit) glow.push((p) => ppSpark(p, x + 1, y - h - 3));
}
function ppKnife(q, h, down) {
  const [x, y] = [rd(h[0]), rd(h[1])];
  if (!down) {
    ppOl(q, [[x, y - 7, 1, 6, PP_STEEL[3]], [x - 1, y - 2, 3, 1, PP_BRASS[2]]]);
    q.P(x, y - 7, PP_STEEL[2]);
  } else {
    q.line(x + 1, y + 1, x + 6, y + 5, OUT, 3);
    q.line(x + 1, y + 1, x + 6, y + 5, PP_STEEL[3]);
    q.P(x + 1, y + 2, PP_BRASS[2]);
  }
}
// Arme(s) en main selon la prise ; renvoie la liste des bouches à feu
function ppWeapon(q, sp, J, back) {
  const [A0, A1] = J.arms, muz = [];
  switch (J.hold) {
    case 'low': ppGunLow(q, sp, A0.h, -1); break;
    case 'low2': ppGunLow(q, sp, A0.h, -1); ppGunLow(q, sp, A1.h, 1); break;
    case 'aim': muz.push(back ? [-sp.B.sh + 1, J.neck[1] + 2] : ppGunAim(q, sp, A0.h)); break;
    case 'aim2': if (!back) { muz.push(ppGunAim(q, sp, A0.h)); muz.push(ppGunAim(q, sp, A1.h)); } else muz.push([-sp.B.sh + 1, J.neck[1] + 2], [sp.B.sh - 1, J.neck[1] + 2]); break;
    case 'flail1': ppGunLow(q, sp, [A0.h[0], A0.h[1] - 7], -1); break;
    case 'port': { const d = [A1.h[0] - A0.h[0], A1.h[1] - A0.h[1]]; ppLongGun(q, sp, [A0.h[0] - d[0] * 0.5, A0.h[1] - d[1] * 0.5], [A1.h[0] + d[0] * (sp.gun === 'shotgun' ? 0.7 : 0.95), A1.h[1] + d[1] * (sp.gun === 'shotgun' ? 0.7 : 0.95)]); break; }
    case 'aimL': if (!back) muz.push(ppLongAim(q, sp, J, true)); else muz.push([-sp.B.sh + 2, J.neck[1]]); break;
    case 'flail': ppLongGun(q, sp, [A0.h[0] + 2, A0.h[1] + 6], [A0.h[0] - 3, A0.h[1] - 12]); break;
    case 'clubUp': ppLongGun(q, sp, [A1.h[0] + 1, A1.h[1] - 9], [A0.h[0] - 2, A0.h[1] + 9]); break;
    case 'clubDown': ppLongGun(q, sp, [A1.h[0] + 8, A1.h[1] + 8], [A0.h[0] - 7, A0.h[1] - 9]); break;
    case 'knifeUp': ppKnife(q, A0.h, false); break;
    case 'knifeDown': ppKnife(q, A0.h, true); break;
    case 'stick': ppStick(q, A0.h[0], A0.h[1] - 1, false, J.glow); break;
    case 'dynUp': ppStick(q, A0.h[0], A0.h[1] - 1, false, J.glow); break;
    case 'drop': {
      const g = sp.metal, x = -sp.B.sh - 3, y = J.hip[1] + 10;
      if (sp.gun === 'rifle' || sp.gun === 'shotgun') ppLongGun(q, sp, [x - 2, y + 8], [x + 4, y - 10]);
      else if (sp.gun !== 'dynamite') { q.line(x, y, x + 4, y - 3, OUT, 3); q.line(x - 1, y + 3, x, y, OUT, 3); q.line(x, y, x + 4, y - 3, g[2]); q.line(x - 1, y + 3, x, y + 1, PP_WOOD[2]); q.R(x, y - 1, 2, 2, g[1]); q.P(x + 1, y - 2, g[3]); }
      break;
    }
  }
  return muz;
}

// ------------------------------------------------------------------ tête
const PP_HEADROWS = (W) => [[-6, W - 2], [-5, W - 1], [-4, W], [-3, W], [-2, W], [-1, W], [0, W], [1, W], [2, W], [3, W - 1], [4, W - 2]];
// Pilosité du visage (de face), sous le nez ; (x, y) = centre de la tête
function ppBeard(q, sp, x, y, W) {
  const { R, P } = q, b = sp.beard, h = sp.hair, hd = ppD(h, 0.3), hl = ppL(h, 0.2);
  if (!b || b === 'none') return;
  if (b === 'stubble') { const st = mix(sp.skin, h, 0.45); for (let dy = 1; dy <= 4; dy++) for (let dx = -W + 1; dx <= W - 1; dx++) if ((dx + dy) % 2 === 0 && (Math.abs(dx) > 1 || dy >= 3) && Math.abs(dx) <= W - (dy > 2 ? dy - 2 : 0)) P(x + dx, y + dy, st); return; }
  if (b === 'full' || b === 'prospector') {
    const low = b === 'prospector' ? 9 : 6;
    for (let dy = 0; dy <= low; dy++) {
      const hw = dy <= 2 ? W : Math.max(1, W - Math.round((dy - 2) * (b === 'prospector' ? 0.5 : 0.9)));
      for (let dx = -hw; dx <= hw; dx++) if (dy > 0 || Math.abs(dx) >= W - 1) P(x + dx, y + dy, (dx + dy * 3) % 4 === 0 ? hd : (dx * 7 + dy) % 5 === 0 ? hl : h);
    }
    R(x - 1, y + 3, 3, 1, OUT); R(x - 2, y + 2, 5, 1, hl);
    return;
  }
  if (b === 'goatee') { R(x - 1, y + 4, 3, 2, h); P(x, y + 6, h); R(x - 2, y + 2, 5, 1, h); return; }
  if (b === 'chops' || b === 'chinstrap') { R(x - W, y - 2, 2, 5, h); R(x + W - 1, y - 2, 2, 5, h); if (b === 'chinstrap') R(x - W + 1, y + 3, W * 2 - 1, 2, h); else { R(x - W, y + 2, 3, 1, h); R(x + W - 2, y + 2, 3, 1, h); } return; }
  if (b === 'pencil') { P(x - 2, y + 2, hd); P(x - 1, y + 2, hd); P(x + 1, y + 2, hd); P(x + 2, y + 2, hd); return; }
  // moustaches
  if (b === 'walrus') { R(x - 3, y + 2, 7, 2, h); R(x - 2, y + 2, 2, 1, hl); P(x - 3, y + 4, h); P(x + 3, y + 4, h); return; }
  R(x - 2, y + 2, 5, 1, h); P(x - 1, y + 2, hl);
  if (b === 'handlebar') { P(x - 3, y + 2, h); P(x + 3, y + 2, h); P(x - 4, y + 1, h); P(x + 4, y + 1, h); }
  if (b === 'horseshoe') { R(x - 3, y + 2, 1, 3, h); R(x + 3, y + 2, 1, 3, h); }
  if (b === 'imperial') { P(x - 3, y + 1, h); P(x + 3, y + 1, h); R(x, y + 4, 1, 2, h); }
}
function ppHead(q, sp, J, back) {
  const { R, P } = q, W = sp.B.W, [x, y] = J.head.map(rd), mood = J.face;
  const sk = sp.skin, skD = ppD(sk, 0.22), skDD = ppD(sk, 0.45), skL = ppL(sk, 0.2);
  const hr = sp.hair, hrD = ppD(hr, 0.35), hrL = ppL(hr, 0.22);
  const hatOn = sp.hat !== 'none' && !J.hatOff;
  const rows = PP_HEADROWS(W);
  // cou (large et ombré sous le menton)
  const nw = W >> 1;
  ppOl(q, [[x - nw, y + 3, nw * 2 + 1, J.neck[1] - y - 2]], skD);
  R(x - nw, y + 5, nw * 2 + 1, 1, skDD);
  // cheveux longs derrière la tête
  if (sp.hairStyle === 'long' && !back) { ppOl(q, [[x - W - 1, y - 4, 2, 10], [x + W, y - 4, 2, 10]], hr); R(x + W + 1, y - 4, 1, 10, hrD); }
  for (const [dy, hw] of rows) R(x - hw - 1, y + dy - 1, hw * 2 + 3, 3, OUT);
  // oreilles
  ppOl(q, [[x - W - 1, y - 2, 1, 3], [x + W + 1, y - 2, 1, 3]], back ? skD : sk);
  if (!back) { P(x - W - 1, y - 1, skD); P(x + W + 1, y - 1, skDD); }
  for (const [dy, hw] of rows) R(x - hw, y + dy, hw * 2 + 1, 1, sk);
  if (back) {
    // arrière du crâne : cheveux (ou crâne chauve)
    const bald = sp.hairStyle === 'bald', long = sp.hairStyle === 'long';
    for (const [dy, hw] of rows) for (let dx = -hw; dx <= hw; dx++) {
      const edge = dx >= hw - 1 ? 1 : dx <= -hw + 1 ? -1 : 0;
      let col;
      if (bald) col = dy >= 0 && dy <= 2 ? (edge > 0 ? hrD : (dx + dy) % 3 === 0 ? hrD : hr) : dy > 2 ? (edge > 0 ? skD : sk) : edge > 0 ? skD : edge < 0 ? skL : dx === -1 && dy === -3 ? ppL(sk, 0.35) : sk;
      else if (dy > 2 && !long) col = edge > 0 ? skD : sk; // nuque
      else col = edge > 0 ? hrD : edge < 0 || (dy === -5 && dx < 0) ? hrL : (dx * 2 + dy * 3) % 7 === 0 ? hrD : hr;
      P(x + dx, y + dy, col);
    }
    if (!bald && !long) R(x - W + 2, y + 3, W * 2 - 3, 1, hrD); // ligne de la nuque
    if (bald) R(x - 2, y + 3, 5, 1, skD); // pli de la nuque
    if (long) { ppOl(q, [[x - W + 1, y + 4, W * 2 - 1, 3]], hr); for (let i = -W + 2; i < W; i += 2) R(x + i, y + 4, 1, 3, hrD); }
    if (sp.hairStyle === 'wild') { P(x - W - 1, y - 3, hr); P(x + W + 1, y - 2, hr); P(x - W - 1, y + 1, hr); P(x + W + 1, y + 2, hr); }
    if (sp.beard === 'full' || sp.beard === 'prospector') { R(x - W - 1, y + 1, 1, 3, hr); R(x + W + 1, y + 1, 1, 3, hr); }
    if (sp.mask) {
      // nœud du bandana sur la nuque, deux pans qui pendent
      R(x - W, y + 1, W * 2 + 1, 1, ppD(sp.mask, 0.2)); R(x - W, y + 1, 2, 1, sp.mask);
      ppOl(q, [[x, y + 1, 2, 1], [x, y + 2, 1, 4], [x + 2, y + 2, 1, 3]], sp.mask);
      P(x, y + 1, ppL(sp.mask, 0.35)); P(x, y + 5, ppD(sp.mask)); P(x + 2, y + 4, ppD(sp.mask));
    }
    if (hatOn) ppHat(q, sp, x, y, true);
    return;
  }
  // modelé : lumière à gauche, ombre à droite, menton
  for (const [dy, hw] of rows) R(x + hw - 1, y + dy, 2, 1, skD);
  for (const [dy, hw] of rows) if (dy >= -2 && dy <= 2) P(x + hw, y + dy, skDD);
  R(x - W + 1, y - 3, 1, 4, skL); P(x - W + 2, y - 3, skL);
  R(x - W + 2, y + 4, W * 2 - 3, 1, skD); R(x - 2, y + 2, 1, 1, skD);
  // cheveux visibles
  if (sp.hairStyle === 'bald') { if (!hatOn) { R(x - 2, y - 5, 2, 1, ppL(sk, 0.45)); R(x - W, y - 2, 1, 2, hr); R(x + W, y - 2, 1, 2, hr); } }
  else {
    if (!hatOn) {
      R(x - W + 2, y - 6, W * 2 - 3, 1, hr); R(x - W + 1, y - 5, W * 2 - 1, 2, hr); R(x - W, y - 4, 2, 3, hr); R(x + W - 1, y - 4, 2, 3, hr);
      R(x - 3, y - 3, 3, 1, hr); P(x + 1, y - 3, hr);
      R(x - W + 2, y - 6, 3, 1, hrL); P(x - W + 1, y - 5, hrL); P(x + 2, y - 5, hrD); R(x + W - 1, y - 5, 1, 3, hrD);
    }
    R(x - W, y - 3, 1, 3, hr); R(x + W, y - 3, 1, 3, hrD);
    if (sp.hairStyle === 'wild') { P(x - W - 1, y - 3, hr); P(x + W + 1, y - 2, hr); P(x - W - 1, y, hr); }
  }
  // ombre du bord du chapeau sur le front
  if (hatOn) { R(x - W + 1, y - 4, W * 2 - 1, 1, skDD); R(x - W + 1, y - 3, W * 2 - 1, 1, skD); }
  // yeux et sourcils
  const br = sp.hairStyle === 'bald' ? ppD(sk, 0.6) : ppD(hr, 0.45), ey = y - 1;
  const eye = (ex, s) => {
    if (mood === 'pain' || mood === 'dead') {
      R(ex - (s < 0 ? 1 : 0), ey, 2, 1, mood === 'dead' ? skDD : OUT);
      if (mood === 'pain') { P(ex + s, ey - 1, br); P(ex, ey - 2, br); }
      return;
    }
    P(ex + s, ey, sp.eye === OUT ? '#fffaf0' : sp.eye); P(ex, ey, OUT); P(ex - s, ey, sp.eye === OUT ? skD : ppD(sp.eye, 0.3));
    if (mood === 'angry' || mood === 'shout' || mood === 'grin') { P(ex + s, ey - 2, br); P(ex + s, ey - 1, br); P(ex, ey - 1, br); P(ex - s, ey - 1, br); }
    else R(ex + (s < 0 ? -1 : 0), ey - 2, 2, 1, br);
  };
  eye(x - 2, -1); eye(x + 2, 1);
  P(x, ey - 1, skDD); // pli du front entre les sourcils
  // nez : arête claire, ombre portée à droite
  P(x, y - 1, skL); P(x, y, skL); P(x + 1, y, skD); R(x, y + 1, 2, 1, skDD); P(x - 1, y + 1, skD);
  if (sp.scar) { P(x - 3, y - 2, '#f0b090'); P(x - 3, y - 1, '#e0a080'); P(x - 3, y, '#e0a080'); P(x - 2, y + 1, '#c07060'); }
  // bouche
  const mo = sp.mask ? null : mood;
  if (mo) {
    const lip = ppD(sk, 0.55);
    if (mo === 'shout' || mo === 'pain') { ppOl(q, [[x - 1, y + 3, 3, 1 + (mo === 'shout' ? 1 : 0), '#6a1010']]); if (mo === 'pain') R(x - 1, y + 3, 3, 1, PP_WHITE); }
    else if (mo === 'grin') { R(x - 2, y + 2, 5, 2, OUT); R(x - 2, y + 2, 5, 1, PP_WHITE); P(x + 1, y + 2, '#f0c040'); }
    else if (mo === 'dead') { R(x - 1, y + 3, 3, 1, OUT); P(x, y + 4, '#6a1010'); }
    else if (mo === 'angry') { R(x - 2, y + 3, 5, 1, lip); P(x - 2, y + 4, lip); P(x + 2, y + 4, lip); }
    else R(x - 1, y + 3, 3, 1, lip);
    ppBeard(q, sp, x, y, W);
    if (mo === 'grin') { R(x - 2, y + 3, 5, 1, OUT); R(x - 2, y + 2, 5, 1, PP_WHITE); P(x + 1, y + 2, '#f0c040'); }
    if (mo === 'shout') R(x - 1, y + 3, 3, 2, '#6a1010');
  }
  // bandana sur le nez
  if (sp.mask) {
    const m = sp.mask, mD = ppD(m, 0.3), mL = ppL(m, 0.3);
    ppOl(q, [[x - W, y + 1, W * 2 + 1, 4], [x - W + 1, y + 5, W * 2 - 1, 1], [x - 2, y + 6, 5, 1], [x - 1, y + 7, 3, 1], [x, y + 8, 1, 1]], m);
    R(x - W + 1, y, W * 2 - 1, 1, sk); P(x + W - 1, y, skD); P(x, y, skL); P(x + 1, y, skD); // l'arête du nez au-dessus du bandana
    R(x - W, y + 1, W * 2 + 1, 1, mL); R(x + W - 1, y + 2, 2, 3, mD); P(x - 1, y + 3, mD); P(x + 1, y + 4, mD); P(x, y + 6, mD);
    P(x, y + 1, ppL(m, 0.5)); // le nez pousse le tissu
    for (const [dx, dy] of [[-3, 2], [2, 2], [-1, 4], [3, 4], [0, 6], [-2, 5], [-4, 4]]) if (Math.abs(dx) <= W) P(x + dx, y + dy, PP_WHITE);
  }
  if (hatOn) ppHat(q, sp, x, y, false);
}
// Chapeau ; (x, y) = centre de la tête, bord du chapeau à y - 5, calottes au-dessus
function ppHat(q, sp, x, y, back) {
  const { R, P } = q, c = sp.hatC, cD = ppD(c, 0.3), cDD = ppD(c, 0.5), cL = ppL(c, 0.28), W = sp.B.W, band = sp.band;
  const h = sp.hat;
  if (h === 'none') return;
  const by = y - 5;
  const crown = (top, w = W) => [x - w, top, w * 2 + 1, by - top];
  const shadeCrown = (top, w = W) => { R(x - w, top, 1, by - top, cL); R(x + w - 1, top, 2, by - top, cD); };
  // bord : largeur e de part et d'autre, dessous sombre, dessus clair
  const brim = (e, tips) => {
    const parts = [[x - e, by, e * 2 + 1, 1], [x - e + 1, by + 1, e * 2 - 1, 1, cDD]];
    if (tips === 'up') parts.push([x - e - 1, by - 1, 2, 1], [x + e, by - 1, 2, 1]);
    if (tips === 'down') parts.push([x - e - 1, by + 1, 2, 1, cD], [x + e, by + 1, 2, 1, cD]);
    return parts;
  };
  switch (h) {
    case 'sombrero': {
      const e = W + 8;
      ppOl(q, [[x - W + 2, by - 8, W * 2 - 3, 1], [x - W + 1, by - 7, W * 2 - 1, 3], crown(by - 4), [x - e, by, e * 2 + 1, 1], [x - e - 1, by - 2, 2, 2], [x + e, by - 2, 2, 2], [x - e + 1, by + 1, e * 2 - 1, 1, cDD]], c);
      shadeCrown(by - 7, W - 1); P(x, by - 8, cL); R(x - W + 2, by - 8, 2, 1, cL);
      R(x - W, by - 3, W * 2 + 1, 3, band); R(x - W, by - 3, W * 2 + 1, 1, ppL(band, 0.2));
      R(x - e, by, e * 2 + 1, 1, cL); P(x - e - 1, by - 2, cL);
      const dot = sp.conchos ? PP_SILVER[2] : '#e0b040';
      for (let i = -e + 1; i <= e; i += 3) P(x + i, by, dot);
      for (let i = -W + 1; i <= W; i += 2) P(x + i, by - 2, dot);
      if (sp.conchos) { P(x, by - 3, PP_SILVER[2]); P(x - e - 1, by - 2, PP_SILVER[1]); P(x + e + 1, by - 2, PP_SILVER[1]); for (let i = -e + 2; i < e; i += 3) P(x + i, by + 1, ppD(sp.sash || '#c0201c', 0.1)); }
      break;
    }
    case 'bowler':
      ppOl(q, [[x - W + 2, by - 6, W * 2 - 3, 1], [x - W + 1, by - 5, W * 2 - 1, 1], crown(by - 4), ...brim(W + 2, 'up')], c);
      shadeCrown(by - 4); R(x - W + 2, by - 5, 2, 1, cL); P(x - W + 1, by - 4, cL); R(x - W, by - 2, W * 2 + 1, 2, band); R(x - W - 2, by, W * 2 + 5, 1, cD);
      break;
    case 'tophat':
      ppOl(q, [[x - W, by - 11, W * 2 + 1, 11], ...brim(W + 2, 'up')], c);
      shadeCrown(by - 11); R(x - W, by - 3, W * 2 + 1, 2, band); R(x - W - 2, by, W * 2 + 5, 1, cD); R(x - W, by - 11, W * 2 + 1, 1, cL);
      break;
    case 'gambler': {
      const e = W + 5;
      ppOl(q, [crown(by - 4), ...brim(e)], c);
      shadeCrown(by - 4); R(x - W, by - 4, W * 2 + 1, 1, cL); R(x - W, by - 2, W * 2 + 1, 2, band); R(x - e, by, e * 2 + 1, 1, cL);
      break;
    }
    case 'bandana':
      ppOl(q, [[x - W + 1, by - 1, W * 2 - 1, 1], [x - W, by, W * 2 + 1, 2], [x + W + 1, by + 1, 2, 2], [x + W + 2, by + 3, 1, 2]], c);
      R(x - W, by + 1, W * 2 + 1, 1, cD); P(x - 2, by, PP_WHITE); P(x + 2, by - 1, PP_WHITE); P(x + 1, by + 1, PP_WHITE);
      break;
    case 'coonskin': {
      const f = '#8a6a48', fD = '#4a3420', fL = '#b89068';
      ppOl(q, [[x - W + 1, by - 4, W * 2 - 1, 1], [x - W, by - 3, W * 2 + 1, 4], [x + W + 1, by - 1, 2, 9]], f);
      for (let i = -W; i <= W; i += 2) P(x + i, by - 3 + (i & 1), fL);
      R(x - W, by, W * 2 + 1, 1, fD); for (let i = 1; i < 9; i += 3) R(x + W + 1, by - 1 + i, 2, 1, fD);
      break;
    }
    case 'kepi':
      ppOl(q, [[x - W, by - 6, W * 2 + 1, 6], [x - W + 1, by, W * 2 - 1, 1, '#2a2226']], c);
      R(x - W, by - 6, W * 2 + 1, 1, cL); R(x - W, by - 2, W * 2 + 1, 1, '#e0b040'); P(x, by - 4, '#e0b040'); shadeCrown(by - 6);
      break;
    case 'slouch': {
      const e = W + 3;
      ppOl(q, [[x - W + 1, by - 5, W * 2 - 1, 1], crown(by - 4), [x - e, by, e * 2 + 1, 1], [x - e - 1, by + 1, 3, 2], [x + e - 1, by + 1, 2, 1]], c);
      shadeCrown(by - 4); R(x - W, by - 1, W * 2 + 1, 1, band); R(x - e, by, e * 2 + 1, 1, cD); R(x - W + 1, by - 5, 3, 1, cL); P(x - e - 1, by + 1, cL);
      if (sp.goggles && back) { R(x - W, by - 2, W * 2 + 1, 1, '#4a3424'); R(x - 1, by - 3, 3, 1, PP_BRASS[1]); }
      else if (sp.goggles) {
        ppOl(q, [[x - 4, by - 3, 3, 2], [x + 1, by - 3, 3, 2]], '#6a9ab0');
        R(x - 1, by - 3, 2, 1, PP_BRASS[1]); P(x - 4, by - 3, PP_WHITE); P(x + 1, by - 3, PP_WHITE); P(x - 3, by - 3, '#bce4f0'); P(x + 2, by - 3, '#bce4f0');
      }
      break;
    }
    case 'outlaw': {
      // feutre de bandit : calotte haute et plate, bord large tombant, ruban à conchos
      const e = W + 5;
      ppOl(q, [[x - W + 1, by - 7, W * 2 - 1, 1], crown(by - 6), ...brim(e, 'down')], c);
      shadeCrown(by - 6); R(x - W + 1, by - 7, W * 2 - 1, 1, cL); P(x, by - 6, cD);
      R(x - W, by - 2, W * 2 + 1, 2, band);
      R(x - 3, by - 2, 2, 2, PP_SILVER[1]); P(x - 3, by - 2, PP_SILVER[2]);
      R(x - e, by, e * 2 + 1, 1, cL); R(x + 1, by, e, 1, c);
      break;
    }
    default: { // stetson et variantes
      const straw = h === 'straw', e = W + 4;
      ppOl(q, [[x - W + 1, by - 7, W - 1, 1], [x + 1, by - 7, W - 1, 1], crown(by - 6), ...brim(e, 'up')], c);
      shadeCrown(by - 6); P(x, by - 6, cDD); P(x, by - 5, cD); R(x - W + 1, by - 7, 2, 1, cL);
      R(x - W, by - 2, W * 2 + 1, 2, h === 'cavalry' ? '#e0b040' : band);
      R(x - W, by - 2, W * 2 + 1, 1, ppL(h === 'cavalry' ? '#e0b040' : band, 0.25));
      if (h === 'cavalry') R(x - W, by - 1, W * 2 + 1, 1, '#a07a20');
      R(x - e, by, e * 2 + 1, 1, cL); P(x - e - 1, by - 1, cL);
      if (straw) for (let i = -W; i <= W; i += 2) { P(x + i, by - 4, cD); P(x + i + 1, by - 3, cD); }
      if (h === 'feather') { ppOl(q, [[x + W - 1, by - 10, 1, 6], [x + W, by - 11, 1, 2]], '#ece4d0'); P(x + W - 1, by - 9, '#a8302a'); }
    }
  }
}

// ------------------------------------------------------------------ assemblage
const PP_HIDDEN = ['aim', 'aim2', 'dynOut', 'knifeDown', 'port', 'aimL', 'flail', 'clubDown'];
function ppBody(q, sp, J, back) {
  const B = sp.B, [A0, A1] = J.arms;
  const inFront = (A) => Math.abs(A.h[0] - J.neck[0]) < B.sh && A.h[1] > J.neck[1] - 1 && A.h[1] < J.hip[1] + 3;
  let muz = [];
  if (back) {
    // de dos : ce qui est tenu devant le corps est caché par lui
    for (const A of J.arms) if (inFront(A)) ppArm(q, sp, A);
    if (PP_HIDDEN.includes(J.hold)) {
      muz = ppWeapon(q, sp, J, back);
      if (J.flash) for (const m of muz) ppFlash(q, m[0], m[1], 8);
    }
    for (const A of J.arms) if (inFront(A)) ppFist(q, sp, A.h);
  }
  if (sp.cape && !back) ppCape(q, sp, J, false);
  ppLegs(q, sp, J);
  if (sp.top === 'coat') ppTails(q, sp, J, back);
  ppTorso(q, sp, J, back);
  ppExtras(q, sp, J, back);
  if (sp.cape && back) ppCape(q, sp, J, true);
  if (back) {
    for (const A of J.arms) if (!inFront(A)) ppArm(q, sp, A);
    if (!PP_HIDDEN.includes(J.hold)) ppWeapon(q, sp, J, back);
    for (const A of J.arms) if (!inFront(A)) ppFist(q, sp, A.h);
    ppHead(q, sp, J, true);
  } else {
    ppHead(q, sp, J, false);
    // bras tenus loin du corps d'abord, puis ceux devant la poitrine
    const order = [A0, A1].sort((a, b) => (inFront(a) ? 1 : 0) - (inFront(b) ? 1 : 0));
    for (const A of order) ppArm(q, sp, A);
    muz = ppWeapon(q, sp, J, back);
    for (const A of order) ppFist(q, sp, A.h, (J.hold === 'aim' && A.i === 0) || J.hold === 'aim2' ? 1 : 0);
    if (J.hold === 'aim') muz = [ppGunAim(q, sp, A0.h)];
    if (J.hold === 'aim2') muz = [ppGunAim(q, sp, A0.h), ppGunAim(q, sp, A1.h)];
    if (J.hold === 'aimL') muz = [ppLongAim(q, sp, J)];
    if (J.flash) for (const m of muz) J.glow.push((p) => ppFlash(p, m[0], m[1], 7));
  }
  if (J.hold === 'dynOut' && !back) {
    const [x, y] = [A0.h[0] + 4, A0.h[1] - 6];
    ppStick(q, x, y, true, J.glow);
    J.glow.push((p) => { p.P(x - 4, y + 2, PP_FIRE[2]); p.P(x - 6, y + 4, PP_FIRE[3]); p.P(x - 3, y + 5, PP_FIRE[3]); });
  }
  if (J.hold === 'knifeDown' && !back) J.glow.push((p) => {
    const S = [-B.sh - 4, J.neck[1] - 8], C = [-B.sh - 3, J.hip[1] + 2], E = [A0.h[0] + 4, A0.h[1] + 4];
    for (let i = 0; i <= 14; i++) {
      const t = i / 14, u = 1 - t, x = u * u * S[0] + 2 * u * t * C[0] + t * t * E[0], y = u * u * S[1] + 2 * u * t * C[1] + t * t * E[1];
      p.P(x, y, t > 0.5 ? '#f4f0e4' : '#a8acb8'); if (t > 0.4) p.P(x, y - 1, t > 0.7 ? '#ffffff' : '#c8ccd4');
    }
  });
  if (J.spurt) {
    const [nx, ny] = J.neck;
    J.glow.push((p) => {
      const pts = [[2, 5], [3, 3], [5, 2], [6, 0], [8, -1], [9, 1], [7, -3], [10, -2], [4, 1]];
      pts.forEach(([dx, dy], i) => p.R(nx + dx, ny + dy, i < 3 ? 2 : 1, i < 3 ? 2 : 1, PP_BLOOD[(i % 3) + 1]));
    });
  }
  if (J.hatOff && sp.hat !== 'none') {
    const [x, y] = J.head.map(rd);
    ppHat(q, sp, x + J.hatOff[0], y + J.hatOff[1], back);
  }
}

// Mort, image 3 : corps étendu sur le dos, tête à droite, chapeau tombé derrière les jambes, arme au sol
function ppCorpse(q, sp, back) {
  const { R, P } = q, big = sp.B.belly ? 1 : 0, T = 9 + big * 2, lw = sp.B.lw;
  const sk = sp.skin, skD = ppD(sk, 0.22), pc = sp.pants, bt = sp.boots;
  const top = ['coat', 'suit', 'charro', 'fringe'].includes(sp.top) ? sp.vest : sp.shirt;
  const sleeve = sp.rolled ? sk : top;
  // arme lointaine
  if (sp.gun === 'rifle' || sp.gun === 'shotgun') ppLongGun(q, sp, [-6, -T - 2], [16, -T + 1]);
  // jambe lointaine, puis jambe proche ; bottes pointe en l'air
  ppLimb(q, [-8, -T + 2], [-19, -5], lw - 1, ppD(pc, 0.3));
  ppOl(q, [[-20, -8, 3, 4], [-22, -12, 3, 8]], ppD(bt, 0.15)); R(-22, -12, 1, 8, ppD(bt, 0.4));
  ppLimb(q, [-8, -3], [-19, -3], lw, pc, ppD(pc));
  ppOl(q, [[-20, -5, 3, 5], [-23, -9, 3, 9], [-22, -10, 2, 1]], bt); R(-23, -9, 1, 9, ppD(bt, 0.45)); R(-22, -10, 2, 1, ppL(bt, 0.25)); R(-20, -5, 3, 1, ppL(bt, 0.15)); P(-19, -2, PP_SILVER[1]);
  // torse : poitrine bombée vers le ciel
  ppOl(q, [[-8, -T, 16, T], [-3, -T - 1, 9, 1]], top);
  R(-8, -T, 16, 1, ppL(top)); R(-3, -T - 1, 9, 1, ppL(top, 0.3)); R(-8, -2, 16, 2, ppD(top));
  if (sp.top === 'vest' || sp.top === 'overalls' || sp.top === 'undershirt' || sp.top === 'coat') { R(-6, -T, 13, 3, sp.vest); R(-6, -T, 13, 1, ppL(sp.vest)); }
  if (sp.top === 'shirt' || sp.top === 'plaid') for (let i = -6; i < 8; i += 3) P(i, -T + 1, ppD(top, 0.25));
  if (sp.top === 'charro') for (let i = -6; i < 8; i += 2) P(i, -T + 3, PP_SILVER[1]);
  R(-8, -T, 2, T, sp.sash || PP_BELT); P(-8, -T + 3, sp.sash ? ppL(sp.sash) : PP_BRASS[2]); P(-7, -T + 3, sp.sash ? ppL(sp.sash) : PP_BRASS[1]);
  if (sp.bando) for (let i = -5; i < 7; i += 2) P(i, -T + 1 + ((i + 5) >> 2), sp.bando === 'dyn' ? PP_TNT[1] : PP_BRASS[2]);
  if (sp.poncho) { R(-3, -T - 1, 11, T - 1, sp.poncho); R(-3, -T + 2, 11, 1, '#e8c070'); }
  if (sp.scarf) ppOl(q, [[6, -T, 2, 4]], sp.scarf);
  if (!back) { R(-1, -T - 1, 5, 1, PP_BLOOD[1]); R(0, -T, 4, 2, PP_BLOOD[1]); P(1, -T - 1, PP_BLOOD[3]); P(2, -T, PP_BLOOD[2]); R(1, -T + 2, 1, 2, PP_BLOOD[1]); }
  // tête de profil, visage vers le ciel (de dos : face contre terre)
  const hx = 13, hy = -5 - big, hair = sp.hairStyle === 'bald' ? ppD(sk, 0.15) : sp.hair;
  R(8, hy - 1, 3, 4, skD);
  ppOl(q, [[hx - 3, hy - 5, 7, 9], [hx - 4, hy - 4, 9, 7]].concat(back ? [] : [[hx - 1, hy - 6, 1, 1]]), sk);
  R(hx - 3, hy - 5, 6, 1, ppL(sk, 0.2)); R(hx + 3, hy - 4, 1, 6, skD);
  if (back) { R(hx - 3, hy - 5, 7, 7, hair); R(hx - 4, hy - 4, 9, 5, hair); R(hx + 2, hy - 3, 2, 4, ppD(hair)); P(hx - 2, hy - 3, ppL(hair)); }
  else {
    R(hx + 2, hy - 3, 3, 6, hair); R(hx - 3, hy + 3, 7, 1, hair); P(hx + 1, hy - 4, hair); // nuque, cheveux vers le sol
    R(hx - 2, hy + 1, 4, 2, skD);
    R(hx, hy - 3, 2, 1, ppD(sk, 0.5)); P(hx + 1, hy - 2, ppD(sk, 0.3)); // œil fermé
    if (sp.mask) { R(hx - 4, hy - 2, 4, 6, sp.mask); P(hx - 3, hy, PP_WHITE); P(hx - 2, hy + 2, PP_WHITE); }
    else {
      if (sp.beard && !['none', 'stubble', 'pencil'].includes(sp.beard)) R(hx - 4, hy - 1, 2, 4, sp.hair);
      R(hx - 3, hy - 3, 1, 2, OUT); // bouche ouverte
    }
  }
  // bras proche le long du corps, main ouverte près de l'arme
  ppLimb(q, [6, -3], [-1, -2], 3, sleeve, ppD(sleeve));
  ppOl(q, [[-4, -3, 2, 2]], sk);
  if (sp.gun === 'revolver' || sp.gun === 'dual') { const g = sp.metal; ppOl(q, [[-11, -2, 5, 1, g[2]], [-7, -1, 2, 1, PP_WOOD[2]], [-8, -3, 2, 1, g[1]]]); P(-11, -2, g[3]); }
  else if (sp.gun === 'dynamite') ppStick(q, -5, 0, false, [], false);
  // chapeau tombé à plat devant les jambes
  if (sp.hat !== 'none') {
    const c = sp.hatC, wd = sp.hat === 'sombrero' ? 9 : 6, cx = -13;
    ppOl(q, [[cx - 3, -5, 7, 3], [cx - wd, -2, wd * 2 + 1, 2]], c);
    R(cx - 3, -5, 7, 1, ppL(c)); R(cx - 3, -3, 7, 1, sp.hat === 'straw' || sp.hat === 'cavalry' ? sp.band : ppD(c, 0.45)); R(cx - wd, -2, wd * 2 + 1, 1, ppL(c, 0.12)); R(cx + 2, -5, 2, 2, ppD(c));
    if (sp.band && sp.hat !== 'bandana' && sp.hat !== 'coonskin') R(cx - 3, -3, 7, 1, sp.band);
    if (sp.conchos) for (let i = -wd + 1; i < wd; i += 3) P(cx + i, -1, PP_SILVER[2]);
  }
}

function ppFrame(sp, pose, f, back) {
  const [w, h] = sp.dim, c = canvas(w, h), q = ppPen(c, sp.k);
  if (pose === 'die' && f === 3) {
    ppCorpse(q, sp, back);
    finish(ppRim(hardAlpha(c)));
    // flaque de sang au sol, devant le corps (sans contour)
    q.ell(3, 0, 12, 1.2, PP_BLOOD[1]); q.ell(4, 0, 7, 0.6, PP_BLOOD[0]); q.R(-2, -1, 3, 1, PP_BLOOD[2]); q.P(9, -1, PP_BLOOD[2]);
    return hardAlpha(c);
  }
  if (pose === 'die' && f === 2) {
    // à genoux puis basculé sur le côté : on fait pivoter l'image 1 autour des genoux
    const tmp = canvas(w, h), J = ppRig(sp, 'die', 1);
    J.hatOff = null;
    ppBody(ppPen(tmp, sp.k), { ...sp, hat: 'none' }, J, back);
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.save(); ctx.translate((w >> 1) - rd(11 * sp.k), h - 1); ctx.rotate(0.9); ctx.drawImage(tmp, -(w >> 1), -(h - 1)); ctx.restore();
    if (sp.hat !== 'none') ppHat(q, sp, -sp.B.sh - 8, 4, back);
    finish(ppRim(hardAlpha(c)));
    return back ? mirror(c) : c;
  }
  const J = ppRig(sp, pose, f);
  ppBody(q, sp, J, back);
  finish(ppRim(hardAlpha(c)));
  for (const g of J.glow) g(q);
  return back ? mirror(hardAlpha(c)) : hardAlpha(c);
}

export function cowboyFrame(look, pose, frame, back = false) {
  const n = PP_POSES[pose];
  if (!look || !n) return checker(48, 64);
  const f = ((frame | 0) % n + n) % n;
  const key = `ppc|${look.key}|${look.skin}${look.hair}${look.cloth}${look.hatC}${look.hat}${look.beard}${look.outfit}${look.color}${look.hairStyle}${look.eyes}${look.eyeC}${look.mouth}${look.extra}|${pose}${f}${back ? 'b' : ''}`;
  return memo(key, () => ppFrame(ppCowboySpec(look), pose, f, back));
}

export function banditFrame(kind, look, pose, frame, back = false) {
  const v = (((look | 0) % 6) + 6) % 6, sp = ppSpec(kind, v), n = PP_POSES[pose];
  if (!sp || !n) return kind === 'diablo' ? checker(72, 96) : checker(48, 64);
  const f = ((frame | 0) % n + n) % n;
  return memo(`ppb|${kind}|${v}|${pose}${f}${back ? 'b' : ''}`, () => ppFrame(sp, pose, f, back));
}

// ------------------------------------------------------------------ 9) visage du HUD (24 x 28, opaque)
// Portrait de face façon Doom : plus le joueur est blessé, plus il est amoché (bleus, coupures, sang).
// Lignes de la tête : [y, x0, x1]
const PP_FACE_ROWS = [[4, 8, 15], [5, 6, 17], ...Array.from({ length: 11 }, (_, i) => [6 + i, 5, 18]), [17, 6, 17], [18, 7, 16], [19, 8, 15], [20, 9, 14]];
function ppFace(ch, dmg, mood) {
  const c = canvas(24, 28), { R, P } = pen(c);
  const dead = mood === 'dead', hurt = mood === 'hurt', grin = mood === 'grin';
  let sk = SKIN[ch.skin] || SKIN[1];
  if (dead) sk = mix(sk, '#98a49a', 0.5);
  const skD = ppD(sk, 0.2), skDD = ppD(sk, 0.42), skL = ppL(sk, 0.15);
  const hr = HAIR_COLORS[ch.hairColor] ?? HAIR_COLORS[1], hrD = ppD(hr, 0.35), hrL = ppL(hr, 0.2);
  const hatC = hatColorOf(ch), hatD = ppD(hatC, 0.3), hatDD = ppD(hatC, 0.5), hatL = ppL(hatC, 0.2);
  const cl = CLOTH_COLORS[ch.outfitColor] ?? CLOTH_COLORS[2], clL = ppL(cl, 0.2);
  const pupil = EYE_COLORS[ch.eyeColor] || OUT, wh = dead ? '#d8d8cc' : '#f4ecd8';
  const hat = ch.hat || 'none', hatOn = hat !== 'none', h = ch.hair || 'short', o = ch.outfit, beard = ch.beard;
  const bruise = mix(sk, '#5a2a6a', 0.45), bl = PP_BLOOD;
  const ol = (rects, col) => { for (const [x, y, w, hh] of rects) R(x - 1, y - 1, w + 2, hh + 2, OUT); for (const [x, y, w, hh, cc] of rects) R(x, y, w, hh, cc || col); };
  // fond sombre, un peu plus chaud en haut
  for (let y = 0; y < 28; y++) R(0, y, 24, 1, mix('#3e5a66', '#141c26', y / 27));
  for (let y = 0; y < 14; y++) R(0, y, 3 - (y >> 3), 1, mix('#5a7480', '#3e5a66', y / 13)); // lumière en haut à gauche
  // cheveux longs derrière les épaules
  if (['long', 'bob', 'braids', 'mullet'].includes(h)) ol([[3, 8, 4, h === 'bob' ? 10 : 14], [17, 8, 4, h === 'bob' ? 10 : 14]], hr);
  if (h === 'afro' && !hatOn) ol([[2, 2, 20, 12]], hr);
  // épaules et tenue
  const shirt = ['shirt', 'plaid', 'bandolier', 'fringe', 'poncho'].includes(o) ? cl : o === 'suit' ? '#ece4d0' : '#d8c8a0';
  ol([[3, 23, 18, 1], [0, 24, 24, 4]], shirt);
  R(0, 27, 24, 1, ppD(shirt, 0.3)); R(0, 24, 2, 4, ppD(shirt, 0.2)); R(22, 24, 2, 4, ppD(shirt, 0.3));
  if (o === 'plaid') for (let x = 1; x < 24; x += 3) R(x, 23, 1, 5, ppD(cl, 0.3));
  if (['vest', 'sheriff', 'duster', 'suit', 'fringe'].includes(o)) { ol([[0, 24, 8, 4], [16, 24, 8, 4]], cl); R(7, 24, 1, 4, clL); R(16, 24, 1, 4, clL); }
  if (o === 'sheriff') { R(3, 25, 3, 1, PP_BRASS[2]); P(4, 24, PP_BRASS[3]); P(4, 26, PP_BRASS[2]); }
  if (o === 'suit') R(11, 24, 2, 4, '#5a1a1a');
  if (o === 'overalls') { R(6, 23, 2, 5, cl); R(16, 23, 2, 5, cl); P(6, 26, PP_BRASS[2]); P(17, 26, PP_BRASS[2]); }
  if (o === 'poncho') { ol([[0, 24, 24, 4]], cl); R(0, 25, 24, 1, '#e8c070'); for (let x = 0; x < 24; x += 3) P(x, 26, '#2a5a7a'); }
  if (o === 'bandolier') for (let x = 0; x < 24; x++) { const y = 23 + ((x * 5) / 24 | 0); P(x, y, PP_LEATHER); if (x % 2) P(x, y - 1, PP_BRASS[2]); }
  if (o === 'fringe') for (let x = 1; x < 24; x += 2) P(x, 26, clL);
  // cou
  ol([[9, 20, 6, 4]], skD); R(9, 22, 6, 1, skDD);
  if (ch.extra === 'scarf') ol([[7, 22, 10, 2], [9, 24, 6, 1], [10, 25, 4, 1], [11, 26, 2, 1]], hatC);
  if (ch.extra === 'bolo') { R(10, 23, 1, 4, OUT); R(13, 23, 1, 4, OUT); ol([[11, 23, 2, 2]], '#3aa8a0'); }
  if (ch.extra === 'medal') ol([[18, 25, 2, 2]], PP_BRASS[2]);
  // tête : contour, oreilles, peau, modelé
  for (const [y, a, b] of PP_FACE_ROWS) R(a - 1, y - 1, b - a + 3, 3, OUT);
  ol([[3, 11, 2, 4], [19, 11, 2, 4]], sk); P(4, 12, skD); P(19, 12, skD);
  for (const [y, a, b] of PP_FACE_ROWS) { R(a, y, b - a + 1, 1, sk); R(b - 1, y, 2, 1, skD); }
  R(6, 9, 1, 6, skL); R(8, 19, 8, 1, skD); R(9, 20, 6, 1, skDD);
  // modelé : front et pommette éclairés à gauche, joue droite et tempe dans l'ombre
  R(7, 8, 4, 1, skL); P(7, 13, skL); P(8, 14, skL); R(16, 13, 2, 3, skD); P(15, 16, skD); R(17, 8, 1, 4, skD);
  if (!dead && dmg < 3) { R(6, 15, 2, 1, mix(sk, '#e06850', 0.25)); R(16, 15, 2, 1, mix(sk, '#e06850', 0.25)); }
  // cheveux sur le front (sans chapeau) ou favoris (avec)
  if (!hatOn && h !== 'bald' && h !== 'afro') {
    ol([[6, 3, 12, 3], [5, 5, 14, 2], [5, 7, 2, 3], [17, 7, 2, 3]], hr);
    R(7, 3, 5, 1, hrL); P(10, 6, hrD); P(14, 5, hrD); R(5, 7, 1, 3, hrD);
    if (h === 'mohawk') { R(5, 3, 14, 4, sk); ol([[10, 0, 4, 7]], hr); P(11, 1, hrL); }
    if (h === 'messy' || h === 'curly') { P(7, 2, hr); P(11, 1, hr); P(15, 2, hr); P(12, 7, hr); P(8, 7, hr); }
    if (h === 'slick') R(6, 4, 8, 1, ppL(hr, 0.4));
    if (h === 'bun') ol([[9, 0, 6, 3]], hr);
  }
  if (!hatOn && h === 'bald') { R(8, 5, 3, 1, ppL(sk, 0.35)); R(5, 10, 1, 3, hr); R(18, 10, 1, 3, hr); }
  if (!hatOn && h === 'afro') { R(4, 3, 16, 5, hr); P(6, 4, hrL); P(12, 3, hrL); P(17, 5, hrD); }
  if (hatOn && h !== 'bald') { R(5, 8, 1, 4, hr); R(18, 8, 1, 4, hr); }
  // sourcils
  const br = h === 'bald' ? ppD(sk, 0.55) : hrD;
  const angry = grin || ch.eyes === 'angry';
  if (hurt || dead) { R(6, 9, 3, 1, br); P(9, 8, br); R(15, 9, 3, 1, br); P(14, 8, br); }
  else if (angry) { P(6, 8, br); P(7, 8, br); R(8, 9, 2, 1, br); R(14, 9, 2, 1, br); P(16, 8, br); P(17, 8, br); }
  else { R(6, 8, 4, 1, br); R(14, 8, 4, 1, br); }
  // yeux
  const eye = (x, right) => {
    if (dead) { P(x, 10, OUT); P(x + 2, 10, OUT); P(x + 1, 11, OUT); P(x, 12, OUT); P(x + 2, 12, OUT); return; }
    if (hurt) { R(x, 11, 3, 1, OUT); P(x + (right ? 0 : 2), 10, skDD); P(x + (right ? 0 : 2), 12, skDD); return; }
    if (ch.eyes === 'patch' && right) { ol([[x - 1, 9, 5, 4]], '#2a2420'); return; }
    if (ch.eyes === 'wink' && right && !grin) { R(x, 11, 3, 1, OUT); return; }
    const narrow = grin || ch.eyes === 'squint' || ch.eyes === 'tired';
    if (!narrow) R(x, 10, 3, 1, OUT);
    R(x, 11, 3, 1, wh); P(x + 1, 11, pupil);
    if (narrow) R(x, 10, 3, 1, ch.eyes === 'tired' ? skDD : OUT);
    if (!narrow && ch.eyes === 'wide') { R(x, 10, 3, 1, wh); P(x + 1, 10, pupil); R(x, 9, 3, 1, OUT); }
    if (ch.eyes === 'lashes') P(right ? x + 3 : x - 1, 10, OUT);
    R(x, 12, 3, 1, ch.eyes === 'tired' ? skDD : ppD(sk, 0.1));
  };
  eye(6, false); eye(15, true);
  if (ch.eyes === 'patch') R(5, 8, 14, 1, OUT);
  if (!dead && !hurt && ch.eyes === 'glasses') { for (const x of [5, 14]) { R(x, 10, 5, 1, '#5a4434'); R(x, 12, 5, 1, '#5a4434'); P(x, 11, '#5a4434'); P(x + 4, 11, '#5a4434'); } R(10, 11, 4, 1, '#5a4434'); }
  if (!dead && ch.eyes === 'shades') { R(5, 10, 5, 3, '#1c1a24'); R(14, 10, 5, 3, '#1c1a24'); R(10, 10, 4, 1, '#2a2622'); P(6, 10, '#6a7a8a'); P(15, 10, '#6a7a8a'); }
  if (!dead && ch.eyes === 'monocle') { R(14, 9, 5, 1, PP_BRASS[2]); R(14, 13, 5, 1, PP_BRASS[2]); R(14, 10, 1, 3, PP_BRASS[2]); R(18, 10, 1, 3, PP_BRASS[2]); P(18, 14, PP_BRASS[1]); P(18, 16, PP_BRASS[1]); }
  // nez
  const n = ch.nose;
  if (n === 'big' || n === 'round' || n === 'wide') { R(10, 13, 4, 3, skD); R(10, 13, 1, 2, skL); R(n === 'wide' ? 9 : 10, 15, n === 'wide' ? 6 : 4, 1, skDD); }
  else if (n === 'red') { R(10, 13, 4, 3, '#c84a3a'); P(10, 13, '#f08070'); R(10, 15, 4, 1, '#8a2a20'); }
  else if (n === 'hooked' || n === 'long') { R(12, 11, 1, 3, skD); R(11, 14, 3, 1, skD); P(13, 15, skDD); P(11, 15, skDD); }
  else if (n === 'broken') { P(11, 11, skD); P(12, 12, skD); P(11, 13, skD); R(11, 14, 3, 1, skD); P(12, 15, skDD); P(10, 12, bruise); }
  else { P(12, 12, skD); R(11, 14, 2, 1, skD); P(10, 15, skDD); P(13, 15, skDD); }
  if (n === 'plaster') { R(10, 13, 4, 1, '#efe0c0'); R(11, 12, 2, 3, '#efe0c0'); }
  if (n === 'ring') { P(11, 16, PP_BRASS[2]); P(12, 16, PP_BRASS[2]); }
  // détails de peau
  if (ch.extra === 'freckles') for (const [x, y] of [[7, 14], [8, 15], [6, 15], [16, 14], [17, 15], [15, 15]]) P(x, y, mix(sk, '#8a4a20', 0.45));
  if (ch.extra === 'scar') for (let i = 0; i < 5; i++) P(15 + (i >> 1), (9 + i * 1.4) | 0, mix(sk, '#a03020', 0.5));
  if (ch.extra === 'mole') P(15, 17, ppD(sk, 0.6));
  if (ch.extra === 'earring') { P(4, 15, PP_BRASS[2]); P(4, 16, PP_BRASS[3]); }
  // barbe de trois jours (ou mal rasé quand on est à bout)
  if (beard === 'stubble' || dmg >= 3) {
    const st = mix(sk, beard === 'stubble' ? hr : '#4a3a30', 0.4);
    for (const [y, a, b] of PP_FACE_ROWS) if (y >= 15) for (let x = a; x <= b; x++) if ((x + y) % 2 === 0 && (y > 17 || x < 9 || x > 14)) P(x, y, st);
  }
  // bouche selon l'humeur, sinon selon le personnage
  const lip = ppD(sk, 0.55), mo = ch.mouth;
  if (dead) ol([[10, 17, 4, 2]], '#4a0a0a');
  else if (hurt) { R(8, 17, 8, 3, OUT); R(9, 18, 6, 1, wh); for (let x = 10; x < 15; x += 2) P(x, 18, ppD(wh, 0.3)); }
  else if (grin) { R(7, 17, 10, 3, OUT); R(8, 18, 8, 1, wh); P(7, 16, OUT); P(16, 16, OUT); P(6, 15, OUT); P(17, 15, OUT); if (mo === 'grin') P(13, 18, '#f0c040'); if (mo === 'gap') P(11, 18, OUT); }
  else if (mo === 'smile') { R(9, 18, 6, 1, lip); P(8, 17, lip); P(15, 17, lip); }
  else if (mo === 'frown') { R(9, 17, 6, 1, lip); P(8, 18, lip); P(15, 18, lip); }
  else if (mo === 'grin' || mo === 'gap') { R(8, 17, 8, 2, OUT); R(9, 17, 6, 1, wh); P(mo === 'grin' ? 13 : 11, 17, mo === 'grin' ? '#f0c040' : OUT); }
  else if (mo === 'smirk') { R(9, 17, 5, 1, lip); P(14, 16, lip); }
  else if (mo === 'open') ol([[10, 17, 4, 2]], '#6a1818');
  else if (mo === 'lipstick') { R(10, 17, 4, 1, '#d04a52'); R(9, 18, 6, 1, '#8a1a24'); }
  else R(9, 17, 6, 1, lip);
  // pilosité
  const fh = (rects) => { for (const [x, y, w, hh] of rects) R(x, y + hh, w, 1, mix(sk, hrD, 0.5)); for (const [x, y, w, hh] of rects) { R(x, y, w, hh, hr); R(x, y + hh - 1, w, 1, hrD); } };
  if (beard === 'full' || beard === 'prospector') {
    const low = beard === 'prospector' ? 24 : 21, span = (y) => { const a = y < 18 ? 5 : 5 + (y - 17) - (beard === 'prospector' ? 1 : 0); return [a, 23 - a]; };
    for (let y = 14; y <= low; y++) { const [a, b] = span(y); R(a - 1, y, b - a + 3, 1, OUT); }
    R(4, low + 1, 16, 1, OUT);
    for (let y = 14; y <= low; y++) { const [a, b] = span(y); R(a, y, b - a + 1, 1, hr); for (let x = a; x <= b; x++) if ((x * 3 + y) % 5 === 0) P(x, y, hrD); }
    R(9, 14, 6, 1, sk); R(8, 15, 8, 1, hr); P(9, 15, hrL);
    if (dead) ol([[10, 17, 4, 2]], '#4a0a0a'); else if (grin || hurt) { R(8, 16, 8, 2, OUT); R(9, 16, 6, 1, wh); } else R(9, 17, 6, 1, hrD);
  } else if (beard === 'goatee') fh([[11, 19, 3, 2], [10, 16, 5, 1]]);
  else if (beard === 'chops' || beard === 'chinstrap') { fh([[5, 9, 2, 8], [17, 9, 2, 8]]); if (beard === 'chinstrap') fh([[7, 18, 10, 2]]); }
  else if (beard === 'pencil') { R(9, 16, 2, 1, hrD); R(13, 16, 2, 1, hrD); }
  else if (beard === 'walrus') fh([[8, 15, 8, 2], [7, 17, 2, 2], [15, 17, 2, 2]]);
  else if (['mustache', 'handlebar', 'horseshoe', 'imperial'].includes(beard)) {
    fh([[8, 16, 8, 1]]); P(9, 16, hrL);
    if (beard === 'handlebar') fh([[6, 15, 2, 1], [16, 15, 2, 1]]);
    if (beard === 'horseshoe') fh([[7, 17, 1, 3], [16, 17, 1, 3]]);
    if (beard === 'imperial') fh([[11, 19, 2, 2]]);
  }
  // objets en bouche
  if (!dead && !hurt && !grin) {
    if (mo === 'cigar') { ol([[14, 17, 5, 1]], '#7a4a24'); P(18, 17, '#f87818'); P(19, 15, '#b8b0a8'); P(18, 14, '#a8a098'); }
    if (mo === 'pipe') { ol([[14, 17, 4, 1], [17, 15, 2, 2]], '#5a3420'); P(17, 15, '#f87818'); }
    if (mo === 'toothpick' || mo === 'straw') for (let i = 0; i < 4; i++) P(14 + i, 17 - (i >> 1), mo === 'straw' ? '#c8a030' : '#e8d090');
  }
  // blessures : bleus, coupures, filets de sang
  if (dmg >= 1) { R(15, 13, 3, 1, bruise); P(16, 14, bruise); R(6, 7, 2, 1, bl[2]); }
  if (dmg >= 2) {
    R(5, 10, 1, 3, bruise); R(6, 12, 3, 1, bruise); // œil au beurre noir
    for (let y = 7; y < 14; y++) P(7 + (y > 10 ? 1 : 0), y, y % 3 ? bl[2] : bl[1]); // filet de sang du front
    P(12, 16, bl[2]); P(12, 17, bl[1]); // lèvre fendue
  }
  if (dmg >= 3) {
    R(14, 10, 1, 3, bruise); R(15, 12, 3, 1, bruise); R(16, 9, 2, 1, bl[2]);
    for (let y = 15; y < 21; y++) P(13 + (y > 18 ? 1 : 0), y, bl[1 + (y & 1)]); // sang du nez
    R(4, 13, 2, 2, bl[1]); P(17, 10, bl[3]); R(15, 7, 3, 1, bl[1]); P(10, 21, bl[1]); P(14, 21, bl[2]);
  }
  // chapeau, coupé en haut du cadre
  if (hatOn) {
    const by = 6;
    switch (hat) {
      case 'sombrero':
        ol([[8, 0, 8, by - 1], [0, by - 1, 24, 2]], hatC); R(8, 0, 1, by - 1, hatL); R(14, 0, 2, by - 1, hatD);
        R(8, by - 2, 8, 1, PP_BRASS[2]); for (let x = 1; x < 24; x += 3) P(x, by - 1, PP_BRASS[2]); R(0, by, 24, 1, hatDD);
        break;
      case 'bowler':
        ol([[7, 0, 10, by], [4, by, 16, 1]], hatC); R(7, by - 1, 10, 1, '#14100e'); R(8, 1, 2, 3, hatL); R(4, by, 16, 1, hatD);
        break;
      case 'tophat':
        ol([[6, 0, 12, by], [3, by, 18, 1]], hatC); R(6, by - 2, 12, 2, '#7a2a1e'); R(7, 0, 1, by - 2, hatL); R(16, 0, 2, by, hatD);
        break;
      case 'bandana':
        ol([[5, 2, 14, 5], [19, 5, 2, 3], [20, 8, 1, 2]], hatC); R(5, 6, 14, 1, hatD);
        for (const [x, y] of [[7, 3], [11, 4], [15, 3], [9, 5], [13, 2], [17, 5]]) P(x, y, PP_WHITE);
        break;
      case 'coonskin':
        ol([[5, 0, 14, 7], [19, 4, 3, 14]], '#8a6a48'); for (let x = 5; x < 19; x += 2) P(x, 1 + (x & 2 ? 1 : 0), '#b89068');
        R(5, 6, 14, 1, '#4a3420'); for (let y = 6; y < 18; y += 3) R(19, y, 3, 1, '#4a3420');
        break;
      case 'kepi':
        ol([[6, 0, 12, by], [6, by, 12, 1]], hatC); R(6, by - 2, 12, 1, PP_BRASS[2]); P(11, 2, PP_BRASS[2]); R(6, by, 12, 1, '#2a2226'); R(16, 0, 2, by - 1, hatD);
        break;
      case 'gambler':
        ol([[6, 1, 12, by - 1], [0, by, 24, 1]], hatC); R(6, by - 2, 12, 1, hatDD); R(6, 1, 12, 1, hatL); R(0, by, 24, 1, hatL);
        break;
      default: { // stetson, plume, paille, cavalerie
        ol([[6, 0, 12, by - 1], [0, by - 1, 24, 2]], hatC);
        R(6, 0, 2, by - 1, hatL); R(16, 0, 2, by - 1, hatD); R(11, 0, 2, 2, hatD);
        R(6, by - 3, 12, 2, hat === 'cavalry' ? PP_BRASS[2] : hat === 'straw' ? CLOTH_COLORS[ch.hatColor] || '#a8302a' : hatDD);
        if (hat === 'straw') for (let x = 6; x < 18; x += 2) P(x + 1, 1, ppD(hatC, 0.25));
        R(0, by - 1, 24, 1, hatL); R(0, by, 24, 1, hatDD);
        if (hat === 'feather') ol([[18, 0, 1, 4], [19, 0, 1, 2]], '#ece4d0');
      }
    }
    R(5, 7, 14, 1, mix(sk, OUT, 0.35)); // ombre du bord sur le front
  }
  return c;
}
export function hudFace(character, hp01, mood) {
  const ch = character || {}, hp = hp01 == null ? 1 : hp01;
  const md = ['idle', 'hurt', 'grin', 'dead'].includes(mood) ? mood : 'idle';
  const dmg = md === 'dead' ? 3 : hp > 0.75 ? 0 : hp > 0.45 ? 1 : hp > 0.2 ? 2 : 3;
  const f = ['skin', 'hair', 'hairColor', 'eyes', 'eyeColor', 'nose', 'mouth', 'beard', 'hat', 'hatColor', 'outfit', 'outfitColor', 'extra'].map((k) => ch[k]);
  return memo(`ppf|${JSON.stringify(f)}|${dmg}|${md}`, () => ppFace(ch, dmg, md));
}

// ------------------------------------------------------------------ 4) montures
// Cheval (de côté, de face, de dos ; 4 temps de galop ; sellé ou monté) et wagonnet de mine sur ses rails.
// Les volumes sont posés en aplat sur des calques puis modelés d'un coup par mtShade : chaque pixel reçoit une
// normale estimée d'après sa place dans la masse (bord haut-gauche éclairé, bas-droite dans l'ombre, comme les autres
// familles) et un trait de séparation sombre là où la masse passe devant une autre déjà peinte.

const mtHex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
// palette 4 tons [clair, base, sombre, très sombre] autour d'une couleur
const mtPal = (c, k = 1) => [shade(c, 0.24 * k), c, shade(c, -0.27 * k), shade(c, -0.5 * k)];
// la même un cran plus sombre (membres et flanc du côté loin)
const mtFar = (p) => [p[1], p[2], p[3], shade(p[3], -0.35)];
const MT_WHITE = ['#fffcf4', '#ebe5d8', '#c0b6a4', '#8e8474'];
const MT_LEATHER = ['#b0703e', '#80482a', '#562c14', '#36190a'];
const MT_IRON = ['#9aa0aa', '#6a7079', '#4a4f58', '#30343b'];
const MT_WOOD = ['#b07a48', '#875630', '#5e3a1e', '#3e2412'];
const MT_INK = '#160c08';
const MT_PANTS = '#4a5a7a', MT_BOOT = '#3a2214', MT_BELT = '#2e1c10';

// robes : corps, crins, sabots, marques (liste, étoile, balzanes [arrière loin, arrière près, avant loin, avant près])
const MT_COATS = [
  { body: ['#dc8a4a', '#a85826', '#743618', '#4a200c'], mane: mtPal('#5e2a12'), hoof: '#3a2a20', blaze: 1, socks: [0, 1, 0, 1] }, // alezan
  { body: ['#7a7288', '#463e50', '#2c2634', '#1a1520'], mane: ['#5a5266', '#282230', '#18131c', '#0c090e'], hoof: '#2a2426', star: 1, socks: [0, 0, 0, 0] }, // noir (reflets bleutés : lisible la nuit)
  { body: ['#fbf9f3', '#dcd8ce', '#aaa498', '#7a746a'], mane: ['#f4f2ec', '#c9c4ba', '#98928a', '#6c665e'], hoof: '#5a5450', dapple: 1, alt: ['#e2ddd4', '#b4aea4', '#88827a', '#625c56'], socks: [0, 0, 0, 0] }, // gris pommelé
  { body: ['#f6d080', '#d8a24c', '#a8742c', '#74501c'], mane: ['#fffcf2', '#f2e8cc', '#cfc09c', '#a09070'], hoof: '#6a5038', blaze: 1, socks: [1, 0, 1, 0] }, // palomino
  { body: MT_WHITE, mane: mtPal('#6a3a1c'), hoof: '#7a6450', patches: 1, alt: ['#c87c42', '#96502a', '#68341a', '#46200e'], socks: [0, 0, 0, 0] }, // pie
];

// calque de travail de la taille du sprite, même origine (bas, centre)
const mtLayer = (c) => { const k = canvas(c.width, c.height); return { c: k, p: pen(k, c.width >> 1, c.height - 1) }; };

// Lumière haut-gauche, un peu de face (normalisée)
const MT_LIGHT = (() => { const v = [-0.52, -0.66, 0.54], n = Math.hypot(...v); return v.map((x) => x / n); })();

// Modelé d'un calque peint en aplat. Pour chaque pixel, X/Y = place dans l'empan horizontal/vertical (-1 bord gauche
// ou haut, +1 bord droit ou bas) ; l'axe le plus long compte moins (une patte est un cylindre, un ventre une sphère
// aplatie). On en tire une normale, éclairée de haut-gauche, lissée sur 3x3 puis ramenée à 4 tons.
// mark : calque de marques (balzanes, taches) peintes avec la palette alt.
// ol : trait sombre là où la masse passe devant un pixel déjà peint (séparation des volumes).
function mtShade(dst, L, pal, mark = null, alt = null, ol = true) {
  const w = dst.width, h = dst.height, n = w * h;
  const s = L.c.getContext('2d').getImageData(0, 0, w, h).data;
  const m = mark && mark.c.getContext('2d').getImageData(0, 0, w, h).data;
  const ctx = dst.getContext('2d');
  const img = ctx.getImageData(0, 0, w, h), d = img.data;
  const on = new Uint8Array(n);
  for (let i = 0; i < n; i++) on[i] = s[i * 4 + 3] > 127;
  const up = new Int16Array(n), dn = new Int16Array(n), lf = new Int16Array(n), rt = new Int16Array(n);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (!on[i]) continue;
    up[i] = y && on[i - w] ? up[i - w] + 1 : 0;
    lf[i] = x && on[i - 1] ? lf[i - 1] + 1 : 0;
  }
  for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) {
    const i = y * w + x;
    if (!on[i]) continue;
    dn[i] = y < h - 1 && on[i + w] ? dn[i + w] + 1 : 0;
    rt[i] = x < w - 1 && on[i + 1] ? rt[i + 1] + 1 : 0;
  }
  const [lx, ly, lz] = MT_LIGHT, I = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    if (!on[i]) continue;
    const sv = up[i] + dn[i] + 1, sh = lf[i] + rt[i] + 1;
    let X = ((lf[i] - rt[i]) / sh) * Math.min(1, (sv / sh) ** 0.7);
    let Y = ((up[i] - dn[i]) / sv) * Math.min(1, (sh / sv) ** 0.7);
    // bords : la normale tourne vite (forme ronde plutôt que coussin)
    X = Math.sign(X) * Math.abs(X) ** 0.8; Y = Math.sign(Y) * Math.abs(Y) ** 0.8;
    const q = X * X + Y * Y;
    if (q > 1) { const k = 1 / Math.sqrt(q); X *= k; Y *= k; }
    I[i] = X * lx + Y * ly + Math.sqrt(Math.max(0, 1 - X * X - Y * Y)) * lz;
  }
  // contour intérieur (avant d'écrire : on lit ce qui est déjà peint dessous)
  const edge = new Uint8Array(n);
  if (ol) for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (!on[i]) continue;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const X = x + dx, Y = y + dy;
      if (X < 0 || Y < 0 || X >= w || Y >= h) continue;
      const j = Y * w + X;
      if (!on[j] && d[j * 4 + 3] > 127) { edge[i] = 1; break; }
    }
  }
  const P = pal.map(mtHex), A = alt && alt.map(mtHex), E = mtHex(shade(pal[3], -0.45));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (!on[i]) continue;
    let t = I[i] * 2, k = 2;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const X = x + dx, Y = y + dy;
      if (X < 0 || Y < 0 || X >= w || Y >= h || !on[Y * w + X]) continue;
      t += I[Y * w + X]; k++;
    }
    t /= k;
    const tone = t > 0.8 ? 0 : t > 0.36 ? 1 : t > -0.05 ? 2 : 3;
    const c = edge[i] ? E : (m && m[i * 4 + 3] > 127 ? A : P)[tone];
    d[i * 4] = c[0]; d[i * 4 + 1] = c[1]; d[i * 4 + 2] = c[2]; d[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
}

// tampon carré et trait épais qui s'affine de w0 à w1
const mtStamp = (p, x, y, w, col) => p.R(Math.round(x - w / 2), Math.round(y - w / 2), w, w, col);
function mtTaper(p, x0, y0, x1, y1, w0, w1, col) {
  const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
  for (let k = 0; k <= n; k++) mtStamp(p, x0 + ((x1 - x0) * k) / n, y0 + ((y1 - y0) * k) / n, rd(w0 + ((w1 - w0) * k) / n), col);
}
// courbe de Bézier quadratique épaisse (queue, mèches)
function mtCurve(p, a, c, b, w0, w1, col) {
  const n = 14;
  let q = a;
  for (let k = 1; k <= n; k++) {
    const t = k / n, u = 1 - t;
    const r = [u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1]];
    mtTaper(p, q[0], q[1], r[0], r[1], w0 + ((w1 - w0) * (k - 1)) / n, w0 + ((w1 - w0) * k) / n, col);
    q = r;
  }
}
// rectangles cernés d'un pixel sombre (même facture que les personnages)
function mtOl(p, rects, col) {
  for (const [x, y, w, h] of rects) p.R(x - 1, y - 1, w + 2, h + 2, OUT);
  for (const [x, y, w, h, c] of rects) p.R(x, y, w, h, c || col);
}

// Patte de profil : ancrage (hanche/épaule) → genou/jarret (cinématique à 2 segments) → boulet → sabot posé en
// (fx, fy) (fy = 0 au sol). Genou vers l'avant pour les antérieurs, jarret vers l'arrière pour les postérieurs.
function mtLeg(p, hx, hy, fx, fy, fore, w, col) {
  const Fx = fx - (fore ? 1 : 0), Fy = fy - 4;
  let L1 = fore ? 16 : 17, L2 = fore ? 14 : 15;
  const dx = Fx - hx, dy = Fy - hy, d = Math.hypot(dx, dy);
  if (d > L1 + L2 - 0.5) { const k = d / (L1 + L2 - 0.5); L1 *= k; L2 *= k; }
  const a = (L1 * L1 - L2 * L2 + d * d) / (2 * d), hh = Math.sqrt(Math.max(0, L1 * L1 - a * a));
  const sg = fore ? -1 : 1;
  const kx = hx + (a * dx) / d + sg * hh * (-dy / d), ky = hy + (a * dy) / d + sg * hh * (dx / d);
  mtTaper(p, hx, hy, kx, ky, w, 4, col);
  mtStamp(p, kx, ky, 5, col);
  mtTaper(p, kx, ky, Fx, Fy, 3, 3, col);
  mtStamp(p, Fx, Fy, 4, col);
  mtTaper(p, Fx, Fy, fx, fy - 2, 3, 3, col);
  return [fx, fy];
}
// sabot (et fer qui brille quand il est levé)
function mtHoof(p, x, y, col, lifted) {
  p.R(x - 2, y - 2, 6, 3, col);
  p.R(x - 2, y - 2, 6, 1, shade(col, 0.3));
  if (lifted) p.R(x - 2, y, 6, 1, '#a8acb4');
}

// pieds [x, levée] : arrière loin, arrière près, avant loin, avant près ; b = rebond, hx/hy = tête, tl = queue
const MT_GAIT = [
  { b: 0, hx: 0, hy: 0, tl: 0.15, L: [[-22, 0], [-14, 0], [11, 0], [18, 0]] }, // à l'arrêt / appui
  { b: -1, hx: -1, hy: -2, tl: 0.55, L: [[-9, -1], [-3, 0], [3, -11], [9, -14]] }, // ramassé : postérieurs sous la masse
  { b: 0, hx: 1, hy: 1, tl: 0.8, L: [[-31, -4], [-25, 0], [16, 0], [25, -6]] }, // poussée : diagonale au sol
  { b: -1, hx: 2, hy: 2, tl: 1, L: [[-37, -9], [-33, -4], [22, -3], [29, 0]] }, // détente : antérieur loin devant
];
const MT_ANCH = [[-15, -34, 0], [-12, -34, 0], [11, -34, 1], [14, -34, 1]];
// assise du cavalier selon le temps de galop (plafonnée : le chapeau ne sort jamais du cadre de 80 px)
const MT_SEAT = [-46, -46, -45, -46];

// ------------------------------------------------------------------ cavalier (même gabarit que les personnages)
const MT_ROWS = (W) => [[-5, W - 2], [-4, W - 1], [-3, W], [-2, W], [-1, W], [0, W], [1, W], [2, W], [3, W - 1], [4, W - 2]];

// Chapeau ; (x, y) = centre de la tête, bord du chapeau à y - 5 ; v : 1 de profil (vers la droite), 0 de face, -1 de dos
function mtHat(p, r, x, y, v) {
  const { R, P } = p, c = r.hatC, cD = shade(c, -0.3), cDD = shade(c, -0.5), cL = shade(c, 0.22);
  const W = v === 1 ? 4 : 5, by = y - 5, side = v === 1, band = shade(c, -0.42);
  const crown = (top, w = W) => [x - w, top, w * 2 + 1, by - top];
  const shadeCrown = (top, w = W) => { R(x - w, top, 1, by - top, cL); R(x + w - 1, top, 2, by - top, cD); };
  // bord : de profil il dépasse surtout vers l'avant
  const brim = (hw, col = c) => side ? [x - hw + 1, by, hw * 2 + 1, 1, col] : [x - hw, by, hw * 2 + 1, 1, col];
  switch (r.hat) {
    case 'none': {
      const h = r.hair, hD = shade(h, -0.35);
      mtOl(p, [[x - W + 1, y - 6, W * 2 - 1, 2], [x - W, y - 5, W * 2 + 1, 3]], h);
      R(x - W, y - 4, W * 2 + 1, 1, hD); P(x - 2, y - 6, shade(h, 0.25));
      if (side) mtOl(p, [[x - W, y - 4, 4, 5]], h);
      break;
    }
    case 'sombrero':
      mtOl(p, [[x - W + 2, by - 7, W * 2 - 3, 2], crown(by - 5, W - 1), [x - 12, by, 25, 1], [x - 13, by - 2, 2, 2], [x + 12, by - 2, 2, 2], [x - 11, by + 1, 23, 1, cDD]], c);
      shadeCrown(by - 5, W - 1); P(x - 1, by - 7, cL);
      R(x - W + 1, by - 2, W * 2 - 1, 2, band);
      R(x - 12, by, 25, 1, cL);
      for (let i = -11; i <= 11; i += 3) P(x + i, by, '#e0b040');
      for (let i = -W + 2; i <= W - 2; i += 2) P(x + i, by - 1, '#e0b040');
      break;
    case 'bowler':
      mtOl(p, [[x - W + 2, by - 6, W * 2 - 3, 1], [x - W + 1, by - 5, W * 2 - 1, 1], crown(by - 4), brim(W + 2)], c);
      shadeCrown(by - 4); P(x - W + 2, by - 5, cL); R(x - W, by - 1, W * 2 + 1, 1, band); R(x - W - 2 + (side ? 1 : 0), by, W * 2 + 5, 1, cD);
      break;
    case 'tophat':
      mtOl(p, [[x - W, by - 7, W * 2 + 1, 7], brim(W + 2)], c);
      shadeCrown(by - 7); R(x - W, by - 2, W * 2 + 1, 1, band); R(x - W - 2 + (side ? 1 : 0), by, W * 2 + 5, 1, cD);
      break;
    case 'gambler':
      mtOl(p, [crown(by - 4), brim(9), [x - 8 + (side ? 1 : 0), by + 1, 17, 1, cDD]], c);
      shadeCrown(by - 4); R(x - W, by - 2, W * 2 + 1, 2, band); R(x - 9 + (side ? 1 : 0), by, 19, 1, cL);
      break;
    case 'kepi':
      mtOl(p, [[x - W, by - 6, W * 2 + 1, 6]], c);
      R(x - W, by - 6, W * 2 + 1, 1, cL); R(x - W, by - 2, W * 2 + 1, 1, '#e0b040'); shadeCrown(by - 6);
      if (v === 0) { P(x, by - 4, '#e0b040'); mtOl(p, [[x - W + 1, by, W * 2 - 1, 1, '#2a2226']]); }
      if (side) mtOl(p, [[x + W - 1, by, 4, 1, '#2a2226']]);
      break;
    case 'bandana':
      mtOl(p, [[x - W + 1, by - 1, W * 2 - 1, 1], [x - W, by, W * 2 + 1, 2]], c);
      R(x - W, by + 1, W * 2 + 1, 1, cD); P(x - 2, by, '#f4ecd8'); P(x + 2, by - 1, '#f4ecd8'); P(x + 1, by + 1, '#f4ecd8');
      if (side) mtOl(p, [[x - W - 2, by + 1, 2, 2], [x - W - 3, by + 3, 2, 2]], c);
      if (v === -1) mtOl(p, [[x - 1, by + 2, 3, 2], [x - 2, by + 4, 2, 2], [x + 1, by + 4, 2, 2]], cD);
      break;
    case 'coonskin': {
      const f = '#8a6a48', fD = '#4a3420', fL = '#b89068', tx = side ? x - W - 2 : v === 0 ? x + W + 1 : x - 1;
      mtOl(p, [[x - W + 1, by - 4, W * 2 - 1, 1], [x - W, by - 3, W * 2 + 1, 4], [tx, by - 1, 2, 10]], f);
      for (let i = -W; i <= W; i += 2) P(x + i, by - 3 + (i & 1), fL);
      R(x - W, by, W * 2 + 1, 1, fD); for (let i = 1; i < 10; i += 3) R(tx, by - 1 + i, 2, 1, fD);
      break;
    }
    default: { // stetson et variantes (plume, paille, cavalerie)
      mtOl(p, [[x - W + 1, by - 6, W - 1, 1], [x + 1, by - 6, W - 1, 1], crown(by - 5), brim(8), [x - 9 + (side ? 1 : 0), by - 1, 2, 1], [x + 8 + (side ? 1 : 0), by - 1, 2, 1], [x - 7 + (side ? 1 : 0), by + 1, 15, 1, cDD]], c);
      shadeCrown(by - 5); P(x, by - 5, cD); P(x, by - 4, cD);
      R(x - W, by - 2, W * 2 + 1, 2, r.hat === 'cavalry' ? '#e0b040' : r.hat === 'straw' ? '#a8302a' : band);
      R(x - 8 + (side ? 1 : 0), by, 17, 1, cL);
      if (r.hat === 'straw') for (let i = -W; i <= W; i += 2) { P(x + i, by - 4, cD); P(x + i + 1, by - 3, cD); }
      if (r.hat === 'feather') { const fx = side ? x - W : x + W - 1; mtOl(p, [[fx, by - 9, 1, 5], [fx + (side ? -1 : 1), by - 10, 1, 2]], '#ece4d0'); P(fx, by - 8, '#a8302a'); }
    }
  }
}

// Tête : (x, y) = centre ; v comme mtHat. Visage de face, profil vers la droite ou nuque.
function mtHead(p, r, x, y, v) {
  const { R, P } = p, sk = r.skin, skD = shade(sk, -0.22), skDD = shade(sk, -0.45), skL = shade(sk, 0.15);
  const hr = r.hair, hrD = shade(hr, -0.35), hrL = shade(hr, 0.2);
  const W = v === 1 ? 4 : 5, rows = MT_ROWS(W), hat = r.hat !== 'none', bd = r.beard || 'none';
  const chin = beardHasChin(bd), mus = beardHasMustache(bd);
  mtOl(p, [[x - 2, y + 4, 5, 3]], skD); // cou
  if (v !== 1) { R(x - W - 2, y - 2, 3, 4, OUT); R(x + W, y - 2, 3, 4, OUT); }
  for (const [dy, hw] of rows) R(x - hw - 1, y + dy - 1, hw * 2 + 3, 3, OUT);
  if (v !== 1) { R(x - W - 1, y - 1, 1, 2, v ? skD : sk); R(x + W + 1, y - 1, 1, 2, skD); } // oreilles
  for (const [dy, hw] of rows) R(x - hw, y + dy, hw * 2 + 1, 1, sk);
  if (v === -1) { // nuque : cheveux, col
    for (const [dy, hw] of rows) if (dy < 3) for (let dx = -hw; dx <= hw; dx++) P(x + dx, y + dy, dx >= hw - 1 ? hrD : dx <= -hw + 1 ? hrL : (dx * 2 + dy * 3) % 7 === 0 ? hrD : hr);
    R(x - 3, y + 3, 7, 1, skD);
    if (chin) { R(x - W - 1, y + 1, 1, 3, hr); R(x + W + 1, y + 1, 1, 3, hr); }
  } else if (v === 0) {
    for (const [dy, hw] of rows) R(x + hw - 1, y + dy, 2, 1, skD);
    R(x - W + 1, y - 1, 1, 3, skL); R(x - W + 2, y + 4, W * 2 - 3, 1, skD);
    R(x - W, y - 3, 1, 3, hr); R(x + W, y - 3, 1, 3, hrD);
    if (hat) R(x - W + 1, y - 3, W * 2 - 1, 1, skD); // ombre du bord
    for (const s of [-1, 1]) { const ex = x + s * 2; P(ex + s, y - 1, '#fffaf0'); P(ex, y - 1, OUT); R(ex + (s < 0 ? -1 : 0), y - 2, 2, 1, hrD); }
    P(x, y, skL); P(x + 1, y, skD); R(x, y + 1, 2, 1, skDD); // nez
    R(x - 1, y + 3, 3, 1, shade(sk, -0.55)); // bouche
    if (chin) {
      for (let dy = 1; dy <= 5; dy++) { const hw = dy <= 2 ? W : Math.max(1, W - (dy - 2)); for (let dx = -hw; dx <= hw; dx++) if (dy > 1 || Math.abs(dx) >= W - 1) P(x + dx, y + dy, (dx + dy * 3) % 4 === 0 ? hrD : hr); }
      R(x - 1, y + 3, 3, 1, OUT);
    }
    if (mus) { R(x - 2, y + 2, 5, 1, hr); P(x - 1, y + 2, hrL); if (bd === 'handlebar') { P(x - 3, y + 1, hr); P(x + 3, y + 1, hr); } }
    if (bd === 'goatee') R(x - 1, y + 4, 3, 2, hr);
    if (r.mouth === 'cigar') { R(x + 1, y + 3, 4, 1, '#7a5030'); P(x + 5, y + 3, '#ff8a3a'); }
  } else { // profil vers la droite : nez, œil, oreille, cheveux derrière
    R(x + W + 1, y - 1, 1, 2, sk); P(x + W + 1, y + 1, skD);
    for (let dy = -5; dy <= 1; dy++) { const hw = rows[dy + 5][1]; R(x - hw, y + dy, Math.max(1, hw - 1), 1, dy === -5 ? hrL : hr); }
    R(x - W, y + 2, 2, 2, hrD); // nuque
    P(x - 1, y - 1, skD); R(x - 1, y, 2, 2, skD); P(x - 1, y, skDD); // oreille
    P(x + 2, y - 1, OUT); R(x + 2, y - 2, 2, 1, hrD); // œil, sourcil
    if (hat) R(x, y - 3, W + 1, 1, skD);
    R(x + 1, y + 4, W - 1, 1, skD); P(x + W, y + 3, skDD); // mâchoire, bouche
    if (chin) { R(x, y + 1, W + 1, 4, hr); R(x + 1, y + 5, W - 1, 1, hr); P(x + 2, y + 3, hrD); }
    if (mus) { R(x + 2, y + 2, W, 1, hr); P(x + W + 1, y + 2, hr); }
    if (bd === 'goatee') R(x + 2, y + 4, 3, 2, hr);
    if (r.mouth === 'cigar') { R(x + W + 1, y + 3, 3, 1, '#7a5030'); P(x + W + 4, y + 3, '#ff8a3a'); }
  }
  mtHat(p, r, x, y, v);
}

// détails de la tenue par-dessus le buste (x0..x0+w-1, y0..y0+h-1) ; v comme mtHat
function mtOutfit(p, r, x0, y0, w, h, v) {
  const R = p.R, c = r.cloth, dk = shade(c, -0.35), lt = shade(c, 0.3), mid = x0 + (w >> 1);
  switch (r.outfit) {
    case 'vest': if (v === 0) { R(mid - 1, y0 + 1, 3, h - 2, '#e8dcc0'); R(mid, y0 + 3, 1, h - 5, '#c8b898'); } else if (v === 1) R(x0 + w - 3, y0 + 2, 2, h - 3, '#e8dcc0'); break;
    case 'sheriff': if (v !== -1) { const sx = v === 0 ? x0 + 3 : x0 + w - 4; R(sx, y0 + 5, 3, 1, '#f0c840'); R(sx + 1, y0 + 4, 1, 3, '#f0c840'); p.P(sx + 1, y0 + 5, '#fff0a0'); } break;
    case 'suit': if (v === 0) { R(mid - 2, y0, 5, 5, '#f0ece0'); R(mid, y0 + 1, 1, 5, '#5a1a1a'); R(mid - 3, y0, 1, 7, dk); R(mid + 3, y0, 1, 7, dk); } break;
    case 'overalls': R(x0 + 1, y0 + 6, w - 2, h - 6, '#4a6a9a'); R(x0 + 2, y0, 2, 6, '#4a6a9a'); R(x0 + w - 4, y0, 2, 6, '#4a6a9a'); break;
    case 'plaid': for (let y = y0 + 1; y < y0 + h; y += 3) R(x0, y, w, 1, dk); for (let x = x0 + 1; x < x0 + w; x += 3) R(x, y0, 1, h, dk); break;
    case 'bandolier': for (let k = 0; k < h; k++) { const x = x0 + rd((k * (w - 2)) / h); R(x, y0 + k, 2, 1, '#5a3a1c'); if (k % 2) R(x, y0 + k, 1, 1, '#e8c040'); } break;
    case 'fringe': R(x0, y0 + 4, w, 1, lt); for (let x = x0; x < x0 + w; x += 2) R(x, y0 + 5, 1, 2, lt); break;
    case 'poncho': for (let x = x0; x < x0 + w; x++) R(x, y0 + 5 + ((x - x0) % 3 === 0 ? 1 : 0), 1, 1, (x - x0) % 4 < 2 ? r.color : lt); R(x0, y0 + 9, w, 1, dk); break;
    case 'duster': if (v === 0) { R(mid - 1, y0, 1, h, dk); R(mid - 3, y0, 2, 3, lt); R(mid + 1, y0, 2, 3, lt); } break;
    default: if (v === 0) for (let y = y0 + 2; y < y0 + h - 1; y += 3) R(mid, y, 1, 1, dk);
  }
}

// Cavalier de profil : (sx, sy) = assise ; penché en avant au galop ; renvoie la position de la main
function mtRiderSide(c, r, sx, sy, f, legs = true) {
  const p = pen(c, c.width >> 1, c.height - 1), ln = f ? 1 : 0, tx = sx + ln, W = '#fff';
  const pants = mtLayer(c), cloth = mtLayer(c), arm = mtLayer(c);
  const poncho = r.outfit === 'poncho', duster = r.outfit === 'duster';
  if (legs) { // cuisse vers l'avant, mollet le long du flanc
    mtTaper(pants.p, sx - 1, sy - 2, sx + 7, sy + 2, 8, 6, W);
    mtTaper(pants.p, sx + 7, sy + 2, sx + 5, sy + 11, 6, 5, W);
  }
  if (duster) cloth.p.poly([[sx - 5, sy - 4], [sx, sy], [sx - 9 - (f % 2), sy + 11], [sx - 15 - (f % 2) * 2, sy + 8]], W);
  cloth.p.poly([[sx - 5, sy + 1], [sx + 5, sy + 1], [tx + 5, sy - 12], [tx + 3, sy - 15], [tx - 4, sy - 15], [tx - 6, sy - 12]], W);
  if (poncho) cloth.p.poly([[tx - 6, sy - 14], [tx + 5, sy - 14], [tx + 10, sy - 2], [tx - 8, sy - 1]], W);
  mtTaper(arm.p, tx + 1, sy - 12, tx + 4, sy - 5, 5, 4, W); // bras vers les rênes
  mtTaper(arm.p, tx + 4, sy - 5, sx + 11, sy - 7, 4, 4, W);
  mtShade(c, pants, mtPal(MT_PANTS));
  mtShade(c, cloth, mtPal(r.cloth));
  if (!poncho) mtOutfit(p, r, tx - 4, sy - 14, 9, 15, 1);
  mtOl(p, [[sx - 5, sy - 1, 10, 2, MT_BELT]]); p.R(sx + 2, sy - 1, 2, 2, '#e0c060'); // ceinture
  mtOl(p, [[sx - 6, sy, 3, 6, MT_LEATHER[1]]]); p.R(sx - 6, sy, 3, 1, MT_LEATHER[0]); p.R(sx - 6, sy - 2, 2, 2, '#5a5e68'); // étui
  mtShade(c, arm, mtPal(r.cloth));
  mtOl(p, [[sx + 10, sy - 9, 3, 3, r.skin]]); // main
  if (legs) { // botte et éperon
    mtOl(p, [[sx + 2, sy + 10, 6, 6, MT_BOOT], [sx + 8, sy + 13, 2, 3, MT_BOOT]]); p.R(sx + 2, sy + 10, 6, 1, '#5a3a24'); p.R(sx + 3, sy + 11, 1, 3, '#5a3a24');
    p.R(sx, sy + 14, 2, 1, '#7a7e88'); p.R(sx - 1, sy + 13, 1, 3, '#c8ccd4');
  }
  const hx = tx + 1, hy = sy - 21;
  // foulard au vent
  mtOl(p, [[hx - 3, hy + 5, 6, 2, r.color], [hx - 6, hy + 5 + (f % 2), 3, 2, shade(r.color, -0.2)], [hx - 8, hy + 6 - (f % 2), 2, 1, r.color]]);
  mtHead(p, r, hx, hy, 1);
  return [sx + 12, sy - 8];
}

// botte vue de face ou de dos, pointe tournée vers l'extérieur, dans l'étrier ; éperon de dos
function mtBootFB(p, s, sy, v) {
  const x = s * 19;
  mtOl(p, [[x - 3, sy + 10, 6, 5, MT_BOOT], [s > 0 ? x + 3 : x - 5, sy + 12, 2, 3, MT_BOOT]]);
  p.R(x - 3, sy + 10, 6, 1, '#5a3a24'); p.R(x - 2, sy + 11, 1, 3, '#5a3a24');
  mtOl(p, [[x - 4, sy + 15, 9, 1, MT_WOOD[1]]]);
  if (v === -1) { p.R(x - 1, sy + 13, 3, 1, '#7a7e88'); p.P(x, sy + 13, '#c8ccd4'); }
}

// Cavalier de face (v = 0) ou de dos (v = -1), assis en (0, sy) : jambes écartées sur les flancs, buste, tête
function mtRiderFB(c, r, sy, f, v, legs = true) {
  const p = pen(c, c.width >> 1, c.height - 1), W = '#fff';
  const pants = mtLayer(c), cloth = mtLayer(c), arms = mtLayer(c);
  if (legs) for (const s of [-1, 1]) {
    mtTaper(pants.p, s * 5, sy - 1, s * 16, sy + 2, 8, 7, W); // cuisse
    mtTaper(pants.p, s * 17, sy + 2, s * 19, sy + 11, 7, 5, W); // mollet
  }
  cloth.p.poly([[-7, sy + 1], [7, sy + 1], [8, sy - 9], [9, sy - 12], [7, sy - 15], [-7, sy - 15], [-9, sy - 12], [-8, sy - 9]], W);
  if (r.outfit === 'poncho') cloth.p.poly([[-7, sy - 15], [7, sy - 15], [13, sy - 3], [-13, sy - 3]], W);
  for (const s of [-1, 1]) {
    mtTaper(arms.p, s * 9, sy - 12, s * 12, sy - 5, 5, 4, W);
    mtTaper(arms.p, s * 12, sy - 5, s * 8, sy - 3, 4, 4, W);
  }
  mtShade(c, pants, mtPal(MT_PANTS));
  mtShade(c, cloth, mtPal(r.cloth));
  mtOutfit(p, r, -7, sy - 14, 15, 15, v);
  mtOl(p, [[-7, sy - 1, 15, 2, MT_BELT]]); if (v === 0) p.R(-1, sy - 1, 3, 2, '#e0c060');
  mtShade(c, arms, mtPal(r.cloth));
  for (const s of [-1, 1]) mtOl(p, [[s * 8 - 1, sy - 4, 3, 3, r.skin]]); // mains (rênes)
  if (legs) for (const s of [-1, 1]) mtBootFB(p, s, sy, v);
  const hy = sy - 21;
  // foulard : nœud devant, pointe dans le dos qui flotte
  if (v === 0) mtOl(p, [[-3, hy + 6, 7, 2, r.color], [-1, hy + 8, 3, 2, shade(r.color, -0.2)]]);
  else mtOl(p, [[-3, hy + 6, 7, 1, r.color], [-1, hy + 7, 3, 2, shade(r.color, -0.2)], [1 + (f % 2), hy + 9, 2, 2, r.color]]);
  mtHead(p, r, 0, hy, v);
}

// petit nuage de poussière posé au sol (dir = -1 / 1 : traîne vers la gauche ou la droite, 0 : des deux côtés)
function mtDust(p, x, f, dir) {
  const D = ['#c8ac80', '#e2cca2'];
  for (const s of dir ? [-dir] : [-1, 1]) {
    p.ell(x + s * (2 + f), -1.5, 3, 1.5, D[0]); p.R(x + s * (2 + f) - 1, -3, 3, 1, D[1]);
    if (f > 1) p.ell(x + s * (7 + f), -2, 1.5, 1, D[0]);
  }
}
// queue : un tronçon épais puis des mèches qui s'écartent vers le bout
function mtTail(p, T0, T1, T2, tl, tw) {
  const M = [T1[0] * 0.3 + T2[0] * 0.7, T1[1] * 0.3 + T2[1] * 0.7];
  mtCurve(p, T0, T1, M, 5, 6, '#fff');
  for (let o = -2; o <= 2; o++) {
    const e = [T2[0] + o * 0.8 * tl + (o & 1) * tw, T2[1] + o * (1.2 - 0.8 * tl) + Math.abs(o) * tl];
    mtCurve(p, [T0[0], T0[1] + 1], [T1[0] + o * 0.5, T1[1] + o * 0.5], e, 4, o ? 1 : 3, '#fff');
  }
}
// rêne qui pend un peu entre le mors et la main
function mtRein(p, a, b) {
  p.R(a[0] - 1, a[1] - 1, 2, 2, '#c8ccd2');
  const m = [(a[0] + b[0]) / 2, Math.max(a[1], b[1]) + 3];
  let q = a;
  for (let k = 1; k <= 10; k++) {
    const t = k / 10, u = 1 - t;
    const r = [u * u * a[0] + 2 * u * t * m[0] + t * t * b[0], u * u * a[1] + 2 * u * t * m[1] + t * t * b[1]];
    p.line(q[0], q[1], r[0], r[1], MT_LEATHER[3]);
    q = r;
  }
}

// ------------------------------------------------------------------ cheval de profil
function mtHorseSide(c, co, f, r) {
  const g = MT_GAIT[f], b = g.b, p = pen(c, c.width >> 1, c.height - 1);
  const far = mtLayer(c), farMk = mtLayer(c), body = mtLayer(c), mark = mtLayer(c), mane = mtLayer(c), tail = mtLayer(c), head = mtLayer(c), headMk = mtLayer(c);
  const W = '#fff', alt = co.alt || MT_WHITE;
  // pattes
  const feet = MT_ANCH.map(([ax, ay, fore], i) => {
    const near = i % 2, L = near ? body : far, M = near ? mark : farMk, [fx, fy] = g.L[i];
    mtLeg(L.p, ax, ay + b, fx, fy, fore, fore ? 8 : 10, W);
    if (co.socks[i]) M.p.R(fx - 4, fy - 9, 9, 9, W);
    return [fx, fy];
  });
  // queue : part du haut de la croupe, flotte en arrière avec l'allure
  const tl = g.tl, tw = [0, 2, -1, 1][f], T0 = [-26, -46 + b];
  const T1 = [-31 - 8 * tl, -46 + b - 6 * tl], T2 = [-32 - 15 * tl, -22 + b - 16 * tl + tw];
  mtTail(tail.p, T0, T1, T2, tl, tw);
  // corps : poitrail, ventre, croupe ronde
  const B = body.p;
  B.ell(-2, -38 + b, 19, 10, W);
  B.ell(13, -40 + b, 10, 10, W);
  B.ell(-17, -40 + b, 11, 11, W);
  B.ell(-20, -45 + b, 7, 5, W); // haut de la croupe
  B.ell(5, -46 + b, 8, 4, W); // garrot
  mtTaper(B, -21, -40 + b, -15, -30 + b, 11, 8, W); mtTaper(B, 15, -40 + b, 14, -30 + b, 9, 7, W); // cuisse, avant-bras
  // encolure (nuque N) puis tête sur son calque (la ganache se détache de l'encolure)
  const N = [27 + g.hx, -61 + g.hy + b];
  B.poly([[0, -46 + b], [9, -53 + b], [N[0] - 4, N[1] + 1], [N[0] + 2, N[1] - 1], [N[0] + 5, N[1] + 7], [N[0] + 1, N[1] + 14], [25, -40 + b], [21, -31 + b]], W);
  const hd = [[0, 0], [3, -2], [6, -1], [10, 3], [15, 8], [17, 11], [17, 13], [15, 15], [11, 15], [7, 12], [3, 11], [0, 6]];
  const H = head.p;
  H.poly(hd.map(([x, y]) => [N[0] + x, N[1] + y]), W);
  H.ell(N[0] + 4, N[1] + 7, 4.5, 4.5, W); // ganache
  H.poly([[N[0], N[1] + 1], [N[0] + 1, N[1] - 6], [N[0] + 4, N[1] - 1]], W); // oreille
  // marques
  if (co.blaze) { headMk.p.line(N[0] + 4, N[1] - 1, N[0] + 15, N[1] + 9, W, 2); headMk.p.R(N[0] + 13, N[1] + 10, 4, 4, W); }
  if (co.star) headMk.p.R(N[0] + 4, N[1], 2, 2, W);
  if (co.patches) {
    for (const [x, y, rx, ry] of [[-15, -42, 8, 6], [8, -36, 6, 5], [20, -48, 4, 6], [-3, -47, 6, 3]]) mark.p.ell(x, y + b, rx, ry, W);
    headMk.p.ell(N[0] + 3, N[1] + 4, 4, 4, W);
    farMk.p.ell(-15, -41 + b, 8, 6, W);
  }
  if (co.dapple) for (let y = -50; y < -30; y += 3) for (let x = -28; x < 24; x += 3) if (((x * 7 + y * 5) & 7) < 3 && Math.hypot((x + 14) / 14, (y + 41) / 10) < 1.2) mark.p.R(x + ((y / 3) & 1), y + b, 2, 1, W);
  // crinière : mèches le long du bord de l'encolure, qui battent au galop
  const wv = [0, 1, 2, 1][f];
  for (let k = 0; k <= 10; k++) {
    const t = k / 10, x = N[0] - 1 + (4 - (N[0] - 1)) * t, y = N[1] + 1 + (-48 + b - N[1] - 1) * t;
    const lg = 4 + ((k * 5) % 3) + (k > 2 && k < 9 ? 2 : 0), fl = f ? 2 + ((k + wv) % 3) : 1; // mèches qui tombent sur l'encolure
    mtTaper(mane.p, x - 1, y, x - fl - 1, y + lg - (f ? 1 : 0), 3, 1, W);
  }
  mtTaper(mane.p, N[0] + 1, N[1] - 1, N[0] + 6, N[1] + 3, 3, 1, W); // toupet
  // rendu des calques, du plus loin au plus proche ; poussière soulevée derrière le sabot qui pousse
  if (f) { const k = feet.reduce((a, q, i) => (q[1] === 0 && q[0] < feet[a][0] ? i : a), 3); if (!feet[k][1]) mtDust(p, feet[k][0] - 5, f, 1); }
  mtShade(c, far, mtFar(co.body), farMk, mtFar(alt), false);
  for (const i of [0, 2]) mtHoof(p, feet[i][0], feet[i][1], shade(co.hoof, -0.2), feet[i][1] < 0);
  mtShade(c, tail, co.mane);
  mtShade(c, body, co.body, mark, alt);
  for (const i of [1, 3]) mtHoof(p, feet[i][0], feet[i][1], co.socks[i] ? '#8a7a64' : co.hoof, feet[i][1] < 0);
  mtShade(c, mane, co.mane);
  mtShade(c, head, co.body, headMk, MT_WHITE, false);
  // tête : œil, naseau, bouche, oreille
  const dk = co.body[3];
  p.R(N[0] + 5, N[1] + 3, 3, 2, MT_INK); p.R(N[0] + 6, N[1] + 3, 1, 1, '#f0e8d8'); p.R(N[0] + 4, N[1] + 2, 4, 1, co.body[2]);
  p.R(N[0] + 14, N[1] + 10, 2, 2, MT_INK); p.R(N[0] + 12, N[1] + 14, 4, 1, dk);
  p.R(N[0] + 1, N[1] - 4, 1, 3, dk);
  // harnachement
  const L = MT_LEATHER, sx = -1, sy = -49 + b;
  p.line(N[0] + 2, N[1] + 1, N[0] + 7, N[1] + 12, L[2]); p.line(N[0] + 9, N[1] + 6, N[0] + 12, N[1] + 13, L[2]); // têtière, muserolle
  p.line(N[0] + 7, N[1] + 12, N[0] + 12, N[1] + 13, L[2]);
  const bit = [N[0] + 12, N[1] + 14];
  const blanket = r ? r.color : '#b03a2a';
  mtOl(p, [[-14, sy, 25, 9, blanket]]);
  p.R(-14, sy + 2, 25, 1, r ? shade(blanket, 0.45) : '#e8d8b0'); p.R(-14, sy + 5, 25, 1, shade(blanket, -0.35));
  for (let x = -14; x <= 10; x += 2) p.R(x, sy + 9, 1, 1, shade(blanket, -0.2));
  // selle western : troussequin haut derrière, siège creusé, fourche et corne devant, quartier arrondi
  p.line(4, sy + 7, 5, sy + 19, L[3], 2); // sangle
  if (!r) { mtOl(p, [[-18, sy - 5, 7, 4, '#8a7a64']]); p.R(-18, sy - 5, 7, 1, '#a8987e'); p.R(-15, sy - 5, 1, 4, L[3]); } // couverture roulée
  const sad = mtLayer(c);
  sad.p.poly([[-12, sy - 5], [-9, sy - 5], [-7, sy - 1], [0, sy], [3, sy - 2], [5, sy - 4], [7, sy - 3], [8, sy + 1], [9, sy + 4], [8, sy + 7], [-11, sy + 7], [-13, sy + 4]], '#fff');
  if (!r) sad.p.R(-3, sy + 6, 5, 7, '#fff'); // quartier d'étrivière
  mtShade(c, sad, L);
  p.R(-9, sy - 1, 9, 1, L[0]); p.R(-12, sy - 5, 3, 1, L[0]); // bord du siège, du troussequin
  mtOl(p, [[4, sy - 6, 2, 3, L[2]], [3, sy - 7, 4, 1, L[0]]]); // corne
  for (let x = -10; x <= 7; x += 3) p.P(x, sy + 5, L[0]); // piqûre
  p.R(-7, sy + 2, 2, 2, '#d8b060'); p.P(-7, sy + 2, '#fff0a0'); p.R(5, sy + 2, 2, 2, '#d8b060'); p.P(5, sy + 2, '#fff0a0'); // conchos
  mtOl(p, [[-20, sy + 1, 6, 6, L[2]]]); p.R(-20, sy + 1, 6, 1, L[1]); p.R(-18, sy + 3, 2, 2, '#c8a050'); // sacoche
  if (!r) {
    mtOl(p, [[-3, sy + 13, 6, 3, MT_WOOD[1]]]); p.R(-2, sy + 14, 4, 1, MT_INK); p.R(-3, sy + 13, 6, 1, MT_WOOD[0]); // étrier
    mtRein(p, bit, [5, sy - 5]);
  } else {
    const hand = mtRiderSide(c, r, sx, MT_SEAT[f], f);
    mtOl(p, [[sx + 2, MT_SEAT[f] + 16, 8, 1, MT_WOOD[1]]]); // étrier sous la botte
    mtRein(p, bit, hand);
  }
}

// ------------------------------------------------------------------ cheval de face / de dos
// levées des pattes [loin gauche, loin droite, près gauche, près droite] (de face : postérieurs loin, antérieurs près)
const MT_FB = [
  { b: 0, hd: 0, tw: 0, up: [0, 0, 0, 0] },
  { b: -1, hd: -1, tw: 2, up: [0, 2, 10, 13] },
  { b: 0, hd: 1, tw: -1, up: [4, 8, 0, 6] },
  { b: -1, hd: 2, tw: -2, up: [9, 5, 6, 0] },
];
// patte vue de face ou de dos, du haut (hy, largeur w) au sabot ; raccourcie quand elle se lève
function mtLegV(p, x, hy, lift, w, col) {
  const fy = -lift - 4, ky = rd((hy + fy) / 2) + 1;
  for (let y = hy; y <= ky; y++) { const ww = rd(w + ((4 - w) * (y - hy)) / Math.max(1, ky - hy)) | 1; p.R(x - (ww >> 1), y, ww, 1, col); }
  p.R(x - 2, ky - 1, 5, 3, col); // genou / jarret
  p.R(x - 1, ky, 4, fy - ky + 3, col); // canon
  p.R(x - 2, fy - 1, 6, 3, col); // boulet
}
// sabot vu de face ; sole ferrée visible quand un postérieur se lève (vue de dos)
function mtHoofV(p, x, lift, col, sole) {
  const y = -lift;
  if (sole && lift) { p.R(x - 2, y - 3, 6, 4, '#a8acb4'); p.R(x - 1, y - 2, 4, 2, shade(col, -0.3)); p.R(x - 2, y - 3, 6, 1, '#d8dce4'); return; }
  p.R(x - 2, y - 2, 6, 3, col); p.R(x - 2, y - 2, 6, 1, shade(col, 0.3)); p.R(x + 2, y - 1, 2, 2, shade(col, -0.25));
}

// v = 0 de face (tête et poitrail vers nous), v = -1 de dos (croupe et queue)
function mtHorseFB(c, co, f, r, v) {
  const g = MT_FB[f], b = g.b, p = pen(c, c.width >> 1, c.height - 1), W = '#fff', alt = co.alt || MT_WHITE;
  const far = mtLayer(c), farMk = mtLayer(c), mane = mtLayer(c), head = mtLayer(c), headMk = mtLayer(c), tail = mtLayer(c);
  const front = v === 0, U = g.up, L = MT_LEATHER, sy = -49 + b, rs = MT_SEAT[f];
  const sk = front ? [co.socks[2], co.socks[3]] : [co.socks[0], co.socks[1]]; // balzanes des pattes proches
  const dapple = (M, x0, x1, y0, y1) => { for (let y = y0; y < y1; y += 3) for (let x = x0; x <= x1; x += 3) if (((x * 7 + y * 5) & 7) < 3) M.p.R(x + ((y / 3) & 1), y + b, 2, 1, W); };
  // côté loin : pattes du fond, ventre large qui déborde, et (de dos) encolure et tête qui dépassent
  const fx = front ? 11 : 8; // postérieurs (vus de face) plus écartés que les antérieurs
  for (const [i, s] of [[0, -1], [1, 1]]) mtLegV(far.p, s * fx, -34 + b, U[i], front ? 8 : 6, W);
  far.p.ell(0, -40 + b, 20, 11, W);
  if (!front) {
    far.p.poly([[-8, -47 + b], [8, -47 + b], [5, -59 + b], [-5, -59 + b]], W);
    far.p.ell(0, -59 + b + g.hd, 5, 4, W);
    for (const s of [-1, 1]) far.p.poly([[s * 2, -61 + b + g.hd], [s * 5, -67 + b + g.hd], [s * 6, -61 + b + g.hd]], W);
  }
  if (co.patches) farMk.p.ell(front ? 13 : -12, -40 + b, 7, 6, W);
  if (co.dapple) dapple(farMk, -19, 19, -48, -31);
  mtShade(c, far, mtFar(co.body), farMk, mtFar(alt), false);
  for (const [i, s] of [[0, -1], [1, 1]]) mtHoofV(p, s * fx, U[i], shade(co.hoof, -0.2), false);
  if (!front) {
    for (let k = -2; k <= 2; k++) mtTaper(mane.p, k + (f % 2), -60 + b + g.hd, k * 2 + 3, -48 + b + (k & 1) * 2, 3, 1, W);
    mtShade(c, mane, mtFar(co.mane), null, null, false);
  }
  // couverture et étriers sur les flancs
  const bl = r ? r.color : '#b03a2a';
  for (const s of [-1, 1]) {
    const x = s > 0 ? 15 : -19;
    if (front) { p.R(x, sy + 1, 4, 8, bl); p.R(x, sy + 4, 4, 1, r ? shade(bl, 0.45) : '#e8d8b0'); p.R(x, sy + 8, 4, 1, shade(bl, -0.3)); p.R(s > 0 ? x + 3 : x, sy + 1, 1, 8, shade(bl, -0.3)); }
    if (!r) { // étrivière et étrier (anneau ouvert) le long du ventre
      const ex = s * 19;
      mtOl(p, [[ex, sy + 8, 1, 9, L[2]]]);
      mtOl(p, [[ex - 1, sy + 17, 3, 1, MT_WOOD[1]], [ex - 2, sy + 18, 1, 3, MT_WOOD[1]], [ex + 2, sy + 18, 1, 3, MT_WOOD[1]], [ex - 1, sy + 20, 3, 1, MT_WOOD[2]]]);
    }
  }
  if (r) mtRiderFB(c, r, rs, f, v);
  // côté proche
  if (front) {
    const body = mtLayer(c), mark = mtLayer(c);
    body.p.poly([[-11, -45 + b], [11, -45 + b], [7, -59 + b], [-7, -59 + b]], W); // encolure
    body.p.ell(0, -38 + b, 14, 10, W); // poitrail
    for (const s of [-1, 1]) body.p.ell(s * 9, -43 + b, 7, 8, W); // pointes des épaules
    for (const [i, s] of [[2, -1], [3, 1]]) {
      mtTaper(body.p, s * 9, -37 + b, s * 7, -22 + b - U[i] * 0.4, 10, 6, W); // avant-bras musclé
      mtLegV(body.p, s * 7, -23 + b - U[i] * 0.4, U[i], 5, W);
    }
    if (co.patches) { mark.p.ell(-8, -37 + b, 6, 8, W); mark.p.ell(8, -51 + b, 4, 5, W); }
    if (co.dapple) dapple(mark, -12, 12, -50, -30);
    for (const [k, s] of [[0, -1], [1, 1]]) if (sk[k]) mark.p.R(s * 7 - 5, -11 - U[k + 2], 12, 11, W);
    mtShade(c, body, co.body, mark, alt);
    p.line(0, -40 + b, 0, -31 + b, co.body[3]); // sillon du poitrail
  } else {
    // fesses et gaskins modelés une à une (le sillon entre les deux se lit)
    for (const [i, s] of [[2, -1], [3, 1]]) {
      const bt = mtLayer(c), bm = mtLayer(c), up = U[i] * 0.4;
      bt.p.ell(s * 9, -40 + b, 11, 10, W);
      mtTaper(bt.p, s * 10, -35 + b, s * 8, -21 + b - up, 12, 6, W);
      mtLegV(bt.p, s * 8, -22 + b - up, U[i], 5, W);
      if (co.patches && s > 0) bm.p.ell(10, -45 + b, 7, 6, W);
      if (co.dapple) dapple(bm, s > 0 ? 0 : -19, s > 0 ? 19 : 0, -51, -32);
      if (sk[(s + 1) >> 1]) bm.p.R(s * 8 - 5, -11 - U[i], 12, 11, W);
      mtShade(c, bt, co.body, bm, alt);
    }
  }
  const dk = co.body[3];
  if (!front && f) for (const k of [0, 1]) if (!U[k + 2]) mtDust(p, (k ? 1 : -1) * 8, f, 0);
  for (const [k, s] of [[0, -1], [1, 1]]) mtHoofV(p, s * (front ? 7 : 8), U[k + 2], sk[k] ? '#8a7a64' : co.hoof, !front);
  if (r && !front) for (const s of [-1, 1]) mtBootFB(p, s, rs, v); // bottes qui dépassent des flancs
  if (front) {
    // crinière sur les côtés de l'encolure
    for (let k = 0; k < 6; k++) for (const s of [-1, 1]) mtTaper(mane.p, s * (6 + (k > 3)), -58 + b + k * 2, s * (9 + ((k + f) % 2)), -54 + b + k * 2, 2, 1, W);
    mtShade(c, mane, co.mane, null, null, false);
    // tête de face, longue, plus basse que le visage du cavalier ; yeux sur les côtés
    const H = -57 + b + g.hd;
    head.p.poly([[-7, H], [8, H], [9, H + 4], [8, H + 8], [5, H + 13], [5, H + 17], [-4, H + 17], [-4, H + 13], [-7, H + 8], [-8, H + 4]], W);
    head.p.ell(0.5, H + 18, 5.5, 3.5, W);
    for (const s of [-1, 1]) head.p.poly([[s * 3 + (s > 0), H + 1], [s * 7 + (s > 0), H - 6], [s * 8 + (s > 0), H + 1]], W);
    if (co.blaze || co.patches) { headMk.p.R(-1, H + 2, 3, 13, W); headMk.p.R(-2, H + 1, 5, 3, W); headMk.p.ell(0.5, H + 18, 3.5, 2.5, W); }
    if (co.star) headMk.p.R(-1, H + 3, 3, 3, W);
    mtShade(c, head, co.body, headMk, MT_WHITE);
    mtOl(p, [[-2, H - 1, 5, 3, co.mane[1]]]); p.R(-1, H + 2, 3, 1, co.mane[2]); p.P(-1, H - 1, co.mane[0]); // toupet
    for (const s of [-1, 1]) {
      const ex = s > 0 ? 8 : -8;
      p.R(ex, H + 5, 1, 3, MT_INK); p.P(ex, H + 5, '#f0e8d8'); p.R(ex - s, H + 4, 1, 1, dk); // œil
      p.R(s > 0 ? 3 : -3, H + 18, 2, 2, MT_INK); // naseaux
      p.R(s > 0 ? 5 : -5, H, 2, 3, dk); // creux de l'oreille
      p.R(s > 0 ? 6 : -6, H + 11, 2, 2, L[0]); // boucles du licol
    }
    p.R(-6, H + 1, 13, 1, L[2]); p.R(-4, H + 12, 10, 1, L[2]); // frontal, muserolle
    const bits = [[-4, H + 16], [5, H + 16]];
    for (const [i, s] of [[0, -1], [1, 1]]) mtRein(p, bits[i], r ? [s * 8, rs - 3] : [s * 9, -47 + b]);
  } else {
    // queue : tronc court puis crins qui s'évasent, se balancent et se relèvent au galop
    const lift = f ? 6 : 0, tx = g.tw * 2;
    mtTaper(tail.p, 0, -51 + b, 0, -44 + b, 7, 7, W);
    for (let o = -3; o <= 3; o++) mtCurve(tail.p, [o * 0.8, -45 + b], [g.tw * 0.5 + o * 1.1, -35 + b], [tx + o * 1.8, -19 + b - lift + Math.abs(o)], o % 2 ? 3 : 4, 2, W);
    mtShade(c, tail, co.mane);
    for (const o of [-1.5, 1.5]) mtCurve(p, [o * 0.8, -44 + b], [g.tw * 0.5 + o * 1.1, -35 + b], [tx + o * 1.8, -21 + b - lift + Math.abs(o)], 1, 1, co.mane[2]); // mèches
    if (!r) { // troussequin et couverture roulée derrière la selle
      mtOl(p, [[-7, -54 + b, 15, 3, L[1]]]); p.R(-7, -54 + b, 15, 1, L[0]);
      mtOl(p, [[-8, -58 + b, 17, 4, '#8a7a64']]); p.R(-8, -58 + b, 17, 1, '#a8987e'); for (const s of [-4, 4]) p.R(s, -58 + b, 1, 4, L[3]);
    }
  }
}

export function horseFrame(coat, frame, angle, rider = null) {
  const co = MT_COATS[coat];
  if (!co || !MT_GAIT[frame] || !['side', 'front', 'back'].includes(angle)) return checker(96, 80);
  return memo(`horse|${coat}|${frame}|${angle}|${rider ? rider.key : ''}`, () => {
    const c = canvas(96, 80);
    if (angle === 'side') mtHorseSide(c, co, frame, rider);
    else mtHorseFB(c, co, frame, rider, angle === 'front' ? 0 : -1);
    return finish(c);
  });
}

// ------------------------------------------------------------------ wagonnet
const MT_TUB = ['#b0a294', '#7e6e60', '#56483e', '#382e28']; // tôle rouillée
// tas de charbon et pépites qui dépasse du bord (cx, y = haut du bord, demi-largeur rx)
function mtOre(p, cx, y, rx) {
  const rnd = rng(hash('ore' + rx));
  p.ell(cx, y, rx, 6, '#2e2a28');
  for (let k = 0; k < rx * 1.8; k++) {
    const x = cx + (rnd() * 2 - 1) * (rx - 2), h = Math.sqrt(Math.max(0, 1 - ((x - cx) / rx) ** 2)) * 6;
    const yy = y - rnd() * h, r = 1 + rnd() * 1.8;
    p.disc(x, yy, r, rnd() < 0.5 ? '#45403c' : '#3a3532'); p.P(x - 1, yy - r + 0.5, '#6a645e');
  }
  for (const [dx, dy] of [[-0.5, 2], [0.3, 4], [0.65, 1], [-0.15, 5]]) { const x = cx + dx * rx, yy = y - dy; p.R(x - 1, yy - 1, 3, 2, '#d8a030'); p.P(x, yy - 1, '#fff0a0'); }
}
// roue de profil : jante, rayons, moyeu
function mtWheel(p, x, y) {
  p.disc(x, y, 6.5, MT_IRON[3]); p.disc(x, y, 5.5, MT_IRON[1]); p.disc(x, y, 4.5, MT_IRON[2]);
  p.line(x - 3, y - 3, x + 3, y + 3, MT_IRON[3]); p.line(x - 3, y + 3, x + 3, y - 3, MT_IRON[3]);
  p.line(x - 4, y, x + 4, y, MT_IRON[3]); p.line(x, y - 4, x, y + 4, MT_IRON[3]);
  p.disc(x, y, 1.5, MT_IRON[0]); p.P(x, y, MT_IRON[3]);
  p.R(x - 4, y - 6, 5, 1, MT_IRON[0]); p.P(x - 6, y - 2, MT_IRON[0]);
}
// v : 1 de profil (vers la droite), 0 de face, -1 de dos. Caisse haute d'une demi-unité : un passager y est
// enfoncé jusqu'à la poitrine, bras sur le bord.
// hauteur du chapeau au-dessus du centre de la tête
const MT_HAT_TOP = { none: 6, bandana: 6, coonskin: 9, gambler: 9, sombrero: 12, tophat: 12 };
function mtCart(c, v, r) {
  const p = pen(c, c.width >> 1, c.height - 1), W = '#fff', tub = mtLayer(c);
  const side = v === 1, top = -29, bot = -13, hw = side ? 28 : 25, bw = side ? 24 : 21; // demi-largeurs du bord et du fond
  // rails et traverses
  if (side) {
    for (const x of [-26, -9, 8, 25]) { p.R(x - 4, -1, 9, 2, MT_WOOD[2]); p.R(x - 4, -1, 9, 1, MT_WOOD[1]); }
    p.R(-32, -4, 64, 1, '#c8ccd4'); p.R(-32, -3, 64, 1, MT_IRON[1]); p.R(-32, -2, 64, 1, MT_IRON[3]);
  } else {
    p.R(-29, -2, 58, 3, MT_WOOD[1]); p.R(-29, -2, 58, 1, MT_WOOD[0]); p.R(-29, 0, 58, 1, MT_WOOD[2]);
    for (const s of [-1, 1]) { const x = s * 15; p.R(x - 2, -6, 5, 2, '#c8ccd4'); p.R(x - 1, -4, 3, 2, MT_IRON[2]); p.R(x - 3, -3, 7, 1, MT_IRON[1]); }
  }
  // passager (le bord de la caisse le coupe sous la poitrine)
  const sy = r ? -34 + (MT_HAT_TOP[r.hat] || 11) : 0; // le plus haut possible sans que le chapeau sorte du cadre
  if (r && side) mtRiderSide(c, r, -3, sy, 0, false);
  if (r && !side) mtRiderFB(c, r, sy, 0, v, false);
  if (!r) mtOre(p, 0, top - 1, hw - 3);
  // roues et châssis
  if (side) {
    for (const s of [-1, 1]) { mtWheel(p, s * 15, -8); p.R(s * 15 - 2, -15, 5, 4, MT_IRON[2]); p.R(s * 15 - 2, -15, 5, 1, MT_IRON[1]); }
    mtOl(p, [[-25, -15, 50, 3, MT_WOOD[1]]]); p.R(-25, -15, 50, 1, MT_WOOD[0]); p.R(-25, -13, 50, 1, MT_WOOD[2]);
    for (const s of [-1, 1]) mtOl(p, [[s > 0 ? 25 : -29, -15, 4, 2, MT_IRON[2]], [s > 0 ? 29 : -30, -16, 1, 4, MT_IRON[1]]]); // tampons
  } else {
    p.R(-15, -11, 30, 2, MT_IRON[3]); p.R(-15, -11, 30, 1, MT_IRON[2]); // essieu
    for (const s of [-1, 1]) { p.R(s * 15 - 3, -16, 7, 13, MT_IRON[3]); p.R(s * 15 - 4, -13, 9, 6, MT_IRON[3]); p.R(s * 15 - 2, -15, 4, 11, MT_IRON[2]); p.R(s * 15 - 1, -15, 1, 10, MT_IRON[0]); }
    mtOl(p, [[-23, -16, 46, 4, MT_WOOD[1]]]); p.R(-23, -16, 46, 1, MT_WOOD[0]); p.R(-23, -13, 46, 1, MT_WOOD[2]);
    mtOl(p, [[-2, -15, 5, 4, MT_IRON[3]]]); p.R(-1, -14, 3, 1, MT_IRON[1]); // attelage
  }
  // caisse en tôle, plus large en haut
  tub.p.poly([[-bw, bot], [bw + 1, bot], [hw + 1, top], [-hw, top]], W);
  mtShade(c, tub, MT_TUB);
  const xAt = (s, y) => s * (bw + ((hw - bw) * (bot - y)) / (bot - top));
  for (const y of [top + 3, bot - 3]) for (let x = -hw + 4; x <= hw - 4; x += 5) { p.P(x, y, MT_TUB[0]); p.P(x + 1, y + 1, MT_TUB[3]); } // rivets
  for (const s of side ? [-1, 0, 1] : [-1, 1]) { // bandes de fer
    const x0 = s * (side ? 15 : 12);
    p.R(x0 - 1, top, 4, bot - top, MT_IRON[2]); p.R(x0 - 1, top, 1, bot - top, MT_IRON[0]); p.R(x0 + 2, top, 1, bot - top, MT_IRON[3]);
    for (let y = top + 2; y < bot; y += 4) p.P(x0, y, MT_IRON[0]);
  }
  p.R(xAt(-1, bot - 4) + 2, bot - 6, 3, 5, '#8a4a2a'); p.R(xAt(1, top + 4) - 7, top + 3, 2, 7, '#7a3e22'); p.P(xAt(1, top + 4) - 6, top + 10, '#7a3e22'); // rouille
  if (r) { p.R(-hw + 3, top + 6, hw * 2 - 5, 2, r.color); p.R(-hw + 3, top + 8, hw * 2 - 5, 1, shade(r.color, -0.35)); }
  else { const t = side ? 'BSM' : '07', tw = textW(t); p.R(-((tw + 4) >> 1), top + 5, tw + 4, 9, MT_TUB[3]); text(p.R, t, -(tw >> 1), top + 7, '#e0d4b8'); }
  // bord renforcé
  mtOl(p, [[-hw - 1, top - 2, hw * 2 + 3, 3, MT_IRON[2]]]); p.R(-hw - 1, top - 2, hw * 2 + 3, 1, MT_IRON[0]);
  for (let x = -hw + 1; x < hw; x += 6) p.P(x, top - 1, MT_IRON[0]);
  if (v === 0) { // lanterne accrochée devant
    p.R(-19, top + 1, 1, 2, MT_IRON[3]); mtOl(p, [[-21, top + 3, 5, 8, MT_IRON[3]]]); p.R(-20, top + 4, 3, 6, '#f8d860'); p.P(-19, top + 5, '#fffbe0'); p.R(-21, top + 11, 5, 1, MT_IRON[2]);
  }
  if (v === -1) { p.line(22, bot - 1, 27, top - 12, MT_IRON[2], 2); mtOl(p, [[26, top - 15, 3, 4, MT_WOOD[2]]]); } // levier de frein
  if (r) { // mains sur le bord ; de face, revolver levé
    if (side) mtOl(p, [[8, top - 4, 4, 3, r.skin]]);
    else for (const s of [-1, 1]) {
      if (v === 0 && s > 0) {
        mtTaper(p, 8, sy - 12, 13, sy - 19, 5, 4, OUT); mtTaper(p, 8, sy - 12, 13, sy - 19, 3, 2, r.cloth);
        mtOl(p, [[12, sy - 22, 3, 3, r.skin], [13, sy - 28, 2, 6, MT_IRON[1]]]); p.R(13, sy - 28, 1, 6, MT_IRON[0]);
      } else { mtTaper(p, s * 10, sy - 10, s * 12, top - 2, 5, 4, OUT); mtTaper(p, s * 10, sy - 10, s * 12, top - 2, 3, 2, r.cloth); mtOl(p, [[s * 12 - 1, top - 4, 4, 3, r.skin]]); }
    }
  }
}

export function cartFrame(angle, rider = null) {
  const v = { side: 1, front: 0, back: -1 }[angle];
  if (v === undefined) return checker(64, 56);
  return memo(`cart|${angle}|${rider ? rider.key : ''}`, () => {
    const c = canvas(64, 56);
    mtCart(c, v, rider);
    return finish(c);
  });
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
function vmScene() {
  const sc = { tris: [], fxs: [], stack: [vmI()], id: 0 };
  sc.top = () => sc.stack[sc.stack.length - 1];
  sc.push = (m) => { sc.stack.push(vmMul(sc.top(), m)); return sc; };
  sc.pop = () => { sc.stack.pop(); return sc; };
  // Superposition 2D après le rendu ; proj() donne les coordonnées canvas d'un point du repère courant
  sc.fx = (fn) => { const m = sc.top(); sc.fxs.push((pen) => fn(pen, (p) => vmProj(vmP(m, p)))); };
  // Où tombe à l'écran (canvas) un point du repère courant
  sc.at = (p) => vmProj(vmP(sc.top(), p));
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
  const W = VM_W, H = VM_H, N = W * H;
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
      const curl = o.curl ?? 1;
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
  const arm = o.arm ? [o.arm[0] * side, o.arm[1], o.arm[2]] : vmAdd(wrist, [6, -30, -20]);
  const dir = vmUnit(vmSub(arm, wrist));
  sc.caps(skin, vmAdd(wrist, vmK(dir, -1.5)), vmAdd(wrist, vmK(dir, 3.5)), 2.5, 2.7);
  if (o.cuff !== false) {
    sc.caps(cloth, vmAdd(wrist, vmK(dir, 3.2)), vmAdd(wrist, vmK(dir, 6.2)), 3.4, 3.6);
    sc.caps(cloth, vmAdd(wrist, vmK(dir, 6.4)), arm, 3.5, 4.4);
  } else sc.caps(skin, vmAdd(wrist, vmK(dir, 3.5)), arm, 2.7, 3.6);
  sc.pop();
  return sc;
}

// Éclair de bouche : étoile chaude en 2D, centrée sur (x, y) en canvas, rayon r
function vmFlash(p, x, y, r, seed = 0) {
  const rand = rng(seed + 11);
  const cols = ['#c83418', '#f07818', '#f8c030', '#fff0a0', '#ffffff'];
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
function vmSmoke(p, x, y, seed = 0) {
  const rand = rng(seed + 5);
  for (let i = 0; i < 5; i++) {
    const r = 1.5 + i * 0.6;
    p.disc(x + Math.sin(i * 1.3 + seed) * 2, y - i * 3.2, r, i % 2 ? '#c8c4bc' : '#e4e0d8');
    if (rand() < 0.5) p.P(x + rand() * 4 - 2, y - i * 3.2 - r, '#f4f0ea');
  }
}
// VM3D READY

// ------------------------------------------------------------------ 8b) armes blanches en main (couteau Bowie…)
// Modèles 3D pour le moteur vm3d. Repère du couteau : garde à l'origine, lame vers +z, dos vers +y, tranchant
// vers -y, plats de lame en ±x ; unités en cm. La main droite serre le manche en prise marteau : paume et pouce
// sur le dos, dos de la main côté +x, doigts qui passent sous le tranchant et remontent sur le flanc gauche.
// knViewModel(id, state, frame, skin, cloth) → canvas 200x130 (mis en cache) ou null si l'id n'est pas géré.

// Repère posé en a, +z vers b, puis roulé de roll autour de +z
const knFrame = (a, b, roll = 0) => vmChain(vmAlong(a, b), vmRz(roll));
// Point p (caméra) ramené dans le repère rigide m
function knInv(m, p) {
  const v = [p[0] - m[3], p[1] - m[7], p[2] - m[11]];
  return [m[0] * v[0] + m[4] * v[1] + m[8] * v[2], m[1] * v[0] + m[5] * v[1] + m[9] * v[2], m[2] * v[0] + m[6] * v[1] + m[10] * v[2]];
}
// Maillage « loft » : anneaux de points [x, y, z] (même nombre par anneau, fermés), facettes plates ;
// o.tilt(j) → [d0, d1] bombe la face j (décalage de normale au début / à la fin de la face) ; o.capEnd ferme le bout
function knLoft(sc, mat, rings, o = {}) {
  const tris = [], groups = new Map();
  const nrm = (a, b, c) => vmUnit(vmCross(vmSub(b, a), vmSub(c, a)));
  for (let i = 0; i + 1 < rings.length; i++) {
    const A = rings[i], B = rings[i + 1], n = A.length;
    for (let j = 0; j < n; j++) {
      const k = (j + 1) % n;
      const p = [A[j], A[k], B[k], B[j]];
      let N = nrm(p[0], p[1], p[2]);
      if (!isFinite(N[0]) || vmLen(N) < 0.5) N = nrm(p[0], p[2], p[3]);
      const tl = o.tilt && o.tilt(j);
      const n0 = tl ? vmUnit(vmAdd(N, tl[0])) : N, n1 = tl ? vmUnit(vmAdd(N, tl[1])) : N;
      const m = (o.mats && o.mats(j)) || mat;
      if (!groups.has(m)) groups.set(m, []);
      groups.get(m).push([[p[0], p[1], p[2]], [n0, n1, n1]], [[p[0], p[2], p[3]], [n0, n1, n0]]);
    }
  }
  if (o.capEnd) {
    const R = rings[rings.length - 1], c = R.reduce((s, q) => vmAdd(s, vmK(q, 1 / R.length)), [0, 0, 0]);
    for (let j = 0; j < R.length; j++) {
      const a = R[j], b = R[(j + 1) % R.length], N = nrm(c, a, b);
      tris.push([[c, a, b], [N, N, N]]);
    }
  }
  if (!groups.has(mat)) groups.set(mat, []);
  groups.get(mat).push(...tris);
  // toutes les matières de la pièce partagent un même id : pas de trait de pli entre elles
  let first = true;
  for (const [m, t] of groups) { sc.emit(m, t, first ? o.same : true); first = false; }
  return sc;
}

// --- matières propres au couteau
const KN_STEEL = vmMatRamp(['#1a1f27', '#3a4250', '#626c7e', '#97a3b5', '#e4ecf6'], { spec: true });
const KN_STEEL_HI = vmMatRamp(['#222831', '#48515f', '#737f91', '#b0bbcb', '#f2f6fb'], { spec: true });
const KN_STEEL_LO = vmMatRamp(['#13171d', '#2a313c', '#4a5362', '#717d92', '#c4d0e0'], { spec: true });
const KN_STEELS = { rgb: [KN_STEEL, KN_STEEL_HI, KN_STEEL_LO].flatMap((m) => m.rgb) };
const KN_EDGE = '#f2f8ff', KN_FULLER = ['#3a4250', '#b4c0d0'];

// --- lame Bowie : contre-tranchant concave (clip) avec faux tranchant, ventre arrondi, émouture marquée
const KN_BLADE_L = 25.5;
function knBowieStation(z) {
  const L = KN_BLADE_L, u = z / L;
  const c0 = 0.6 * L, ys0 = 1.45, tipY = -0.3;
  const cu = z > c0 ? (z - c0) / (L - c0) : 0;
  const ys = z > c0 ? ys0 - (ys0 - tipY) * Math.pow(cu, 0.7) : ys0;
  const b0 = 0.52 * L;
  const bu = z > b0 ? (z - b0) / (L - b0) : 0;
  let ye = -2.7 - 0.15 * Math.min(1, z / b0);
  if (z > b0) ye = -2.85 + (2.85 + tipY) * Math.pow(bu, 1.7);
  if (z < 1.8) ye = -2.5 - 0.2 * Math.max(0, (z - 1.1) / 0.7);
  const t = 0.64 * (1 - 0.5 * u);
  const tf = z > c0 ? t * Math.max(0, 1 - cu * 1.8) : t;
  const yf = z > c0 ? ys - Math.min(1, cu * 2.2) * 0.32 * (ys - ye) : ys;
  const yb = ye + (0.44 * (yf - ye)) * Math.min(1, Math.max(0.12, (z - 0.6) / 1.6));
  return { ys, yf, yb, ye, t, tf };
}
function knBowieBlade(sc) {
  const rings = [], N = 24;
  for (let i = 0; i < N; i++) {
    const z = (i / N) * KN_BLADE_L, s = knBowieStation(z), h = s.t / 2, hf = s.tf / 2, ym = s.yb + 0.5 * (s.yf - s.yb);
    rings.push([[hf, s.ys, z], [h, s.yf, z], [h, ym, z], [h, s.yb, z], [0, s.ye, z], [-h, s.yb, z], [-h, ym, z], [-h, s.yf, z], [-hf, s.ys, z]]);
  }
  const tip = [0, -0.3, KN_BLADE_L];
  rings.push(rings[0].map(() => tip));
  rings.unshift(rings[0].map((p) => [p[0], p[1], -0.4]));
  // plats légèrement bombés : dégradé du dos (clair) vers l'émouture, émouture plus sombre vers le fil
  // faces : 0/7 faux tranchant, 1/6 haut du plat (clair), 2/5 bas du plat, 3/4 émouture (sombre), 8 dos (sombre)
  const up = [0, 0.35, 0], dn = [0, -0.25, 0];
  knLoft(sc, KN_STEEL, rings, {
    tilt: (j) => (j === 1 || j === 2 ? [up, dn] : j === 5 || j === 6 ? [dn, up] : null),
    mats: (j) => (j === 1 || j === 6 ? KN_STEEL_HI : j === 3 || j === 4 || j === 8 ? KN_STEEL_LO : KN_STEEL),
  });
  // détails 2D : fil brillant, gouttière (fuller) sur le plat visible
  sc.fx((p, proj) => {
    // tracés posés seulement sur les pixels d'acier déjà visibles (rien sur les doigts qui passent devant)
    const ln = knMasked(p, KN_STEELS);
    const side = sc.knSide || 1;
    const edge = [], fu = [], fl = [], gl = [];
    for (let z = 1.2; z <= KN_BLADE_L - 0.6; z += 0.6) {
      const s = knBowieStation(z);
      edge.push(proj([0, s.ye + 0.12, z]));
      if (z > 2.2 && z < 13.5) { fu.push(proj([side * s.t / 2, 0.8, z])); fl.push(proj([side * s.t / 2, 0.5, z])); }
      if (z > 15 && z < 21.5) gl.push(proj([side * s.t / 2, s.yb + 0.25, z]));
    }
    ln(fu, KN_FULLER[0]); ln(fl, KN_FULLER[1]);
    ln(gl, KN_STEEL.ramp[4]);
    ln(edge, KN_EDGE);
  });
}

// Tracé 2D masqué : renvoie ln(points canvas, couleur) qui ne colore que les pixels déjà peints dans la rampe mat
function knMasked(p, mat) {
  const c = p.ctx.canvas, W = c.width, H = c.height;
  const D = p.ctx.getImageData(0, 0, W, H).data;
  const ok = new Set(mat.rgb.map((q) => (q[0] << 16) | (q[1] << 8) | q[2]));
  const on = (x, y) => x >= 0 && y >= 0 && x < W && y < H && D[(y * W + x) * 4 + 3] && ok.has((D[(y * W + x) * 4] << 16) | (D[(y * W + x) * 4 + 1] << 8) | D[(y * W + x) * 4 + 2]);
  return (pts, col) => {
    for (let i = 0; i + 1 < pts.length; i++) {
      const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
      const n = Math.max(1, Math.abs(Math.round(x1) - Math.round(x0)), Math.abs(Math.round(y1) - Math.round(y0)));
      for (let k = 0; k <= n; k++) {
        const x = Math.round(x0 + ((x1 - x0) * k) / n), y = Math.round(y0 + ((y1 - y0) * k) / n);
        if (on(x, y)) p.P(x, y, col);
      }
    }
  };
}

// Mouchetures : assombrit au hasard (graine fixe) une part des pixels peints dans la rampe mat (bois de cerf, bois)
function knSpeckle(sc, mat, dens, seed) {
  sc.fx((p) => {
    const c = p.ctx.canvas, W = c.width, H = c.height, D = p.ctx.getImageData(0, 0, W, H).data, rand = rng(seed);
    const lv = new Map(mat.rgb.map((q, i) => [(q[0] << 16) | (q[1] << 8) | q[2], i]));
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4, k = lv.get((D[i] << 16) | (D[i + 1] << 8) | D[i + 2]);
      if (k > 0 && D[i + 3] && rand() < dens) p.P(x, y, mat.ramp[k - 1]);
    }
  });
}

// Garde en S en laiton, manche en bois de cerf (stag) à rivets, pommeau en laiton
const knGripY = (z) => -0.5 - 0.4 * Math.pow(Math.max(0, -z - 0.6) / 9.9, 2);
function knBowieHilt(sc) {
  sc.push(vmT(0, -0.45, -0.32)); sc.box(VM_BRASS, 1.35, 4.4, 0.62); sc.pop();
  // quillon haut court (le pouce s'y appuie), quillon bas en S qui se recourbe vers la pointe
  sc.tube(VM_BRASS, [[0, 1.4, -0.32], [0, 2.2, -0.32], [0, 2.6, -0.2]], 0.36);
  sc.push(vmT(0, 2.75, -0.15)); sc.ell(VM_BRASS, 0.5, 0.5, 0.5, { same: true }); sc.pop();
  sc.tube(VM_BRASS, [[0, -2.5, -0.32], [0, -3.3, -0.4], [0, -3.95, -0.1], [0, -4.25, 0.55]], 0.36);
  sc.push(vmT(0, -4.3, 0.8)); sc.ell(VM_BRASS, 0.5, 0.5, 0.5, { same: true }); sc.pop();
  // manche : section ovale, renflé au milieu, crosse qui plonge un peu vers le tranchant
  const rings = [], N = 10;
  for (let i = 0; i <= N; i++) {
    const u = i / N, z = -0.62 - u * 9.9;
    const w = 1.1 + 0.15 * Math.sin(u * Math.PI), hh = 1.45 + 0.2 * Math.sin(u * Math.PI * 0.8) + 0.12 * u;
    const yc = knGripY(z), ring = [];
    for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2; ring.push([Math.cos(a) * w, yc + Math.sin(a) * hh, z]); }
    rings.push(ring);
  }
  knLoft(sc, VM_STAG, rings, { capEnd: true });
  knSpeckle(sc, VM_STAG, 0.22, 11);
  // rivets de laiton (traversants)
  for (const z of [-3.0, -8.2]) { sc.push(vmChain(vmT(-1.45, knGripY(z), z), vmRy(Math.PI / 2))); sc.cyl(VM_BRASS, 0.3, 2.9, { segs: 8 }); sc.pop(); }
  // pommeau (cap de laiton)
  sc.push(vmT(0, knGripY(-10.6) - 0.1, -10.7)); sc.ell(VM_BRASS, 1.3, 1.85, 0.65); sc.pop();
}

// --- main droite en prise marteau (repère du couteau). o : { skin, cloth, arm (coude, repère du couteau), thumb: 'spine'|'wrap' }
const KN_FINGERS = [
  { z: -1.75, r: 0.88, len: [3.9, 2.4, 1.9], wrap: 0.95 },
  { z: -3.75, r: 0.92, len: [4.3, 2.75, 2.0], wrap: 1 },
  { z: -5.7, r: 0.88, len: [4.0, 2.55, 1.9], wrap: 1 },
  { z: -7.45, r: 0.76, len: [3.2, 1.95, 1.7], wrap: 1 },
];
function knHand(sc, o) {
  const base = o.skin || '#d19a6a';
  const skin = vmMat(base), cloth = vmMat(o.cloth || '#7a2a1e');
  const crease = vmMatRamp([shade(base, -0.62), shade(base, -0.55), shade(base, -0.48), shade(base, -0.42), shade(base, -0.36)]);
  const nail = vmMatRamp([shade(base, -0.3), shade(base, -0.12), mix(base, '#f0d8d0', 0.45), mix(base, '#fff0ea', 0.65), '#fff8f4']);
  const W = 1.22, HH = 1.62; // demi-section du manche sous la main
  // point du pourtour du manche à l'angle a (0 = flanc droit, π/2 = dos, -π/2 = tranchant), écarté de off
  const ring = (a, z, off) => [Math.cos(a) * (W + off), knGripY(z) + Math.sin(a) * (HH + off), z];
  const band = (p, d, r) => { sc.push(vmAlong(vmSub(p, vmK(d, 0.09)), vmAdd(p, vmK(d, 0.09)))); sc.cyl(crease, r, 0.18, { segs: 10 }); sc.pop(); };
  // doigts : jointure (MCP) en bas à droite, phalanges sous le tranchant puis sur le flanc gauche
  const knuckles = [];
  KN_FINGERS.forEach((f) => {
    const r = f.r;
    const knuckle = ring(-0.62, f.z + 0.1, r + 0.35);
    const pts = [knuckle];
    let a = -0.85, z = f.z, prev = knuckle;
    for (const L of f.len) {
      let acc = 0, p = prev;
      while (acc < L * f.wrap && a > -4.3) {
        a -= 0.03; z -= 0.004;
        const q = ring(a, z, r * 1.02);
        acc += vmLen(vmSub(q, p)); p = q;
      }
      pts.push(p); prev = p;
    }
    for (let j = 0; j < 3; j++) sc.caps(skin, pts[j], pts[j + 1], r * (1.04 - j * 0.07), r * (0.97 - j * 0.07));
    // jointure saillante et plis aux articulations
    sc.push(vmT(knuckle[0], knuckle[1], knuckle[2])); sc.ell(skin, r * 1.08, r * 1.08, r * 1.0); sc.pop();
    knuckles.push(vmAdd(knuckle, vmK(vmUnit([knuckle[0], knuckle[1] - knGripY(knuckle[2]), 0]), r * 1.0)));
    for (let j = 1; j < 3; j++) {
      const d = vmUnit(vmAdd(vmUnit(vmSub(pts[j], pts[j - 1])), vmUnit(vmSub(pts[j + 1], pts[j]))));
      band(pts[j], d, r * (1.0 - j * 0.07) + 0.04);
    }
    // ongle : côté extérieur de la dernière phalange
    const tip = pts[3], dir = vmUnit(vmSub(pts[3], pts[2]));
    const outw = vmUnit([tip[0], tip[1] - knGripY(tip[2]), 0]);
    const nb = vmAdd(vmSub(tip, vmK(dir, 0.95)), vmK(outw, r * 0.6)), ne = vmAdd(tip, vmK(outw, r * 0.45));
    sc.push(vmAlong(nb, ne)); sc.ell(nail, r * 0.55, r * 0.32, vmLen(vmSub(ne, nb)) * 0.55); sc.pop();
  });
  // reflets des jointures et sillons des tendons, posés seulement sur la peau visible (lisibles vue de dos)
  sc.fx((p, proj) => {
    const ln = knMasked(p, skin);
    knuckles.forEach((k, i) => {
      const [x, y] = proj(k), [bx, by] = proj(vmAdd(k, [-0.6, 0.9, -2.6]));
      ln([[x, y], [x, y]], skin.ramp[4]);
      if (i < 3) ln([[(x + bx) / 2, (y + by) / 2], [bx, by]], skin.ramp[1]);
    });
  });
  // dos de la main (côté +x) et paume (sur le dos du manche)
  const gy = knGripY(-5);
  sc.push(vmChain(vmT(1.55, gy + 0.9, -4.9), vmRz(0.55))); sc.ell(skin, 1.25, 2.35, 4.6); sc.pop();
  sc.push(vmT(0.5, gy + 1.85, -5.6)); sc.ell(skin, 1.7, 1.15, 4.0, { same: true }); sc.pop();
  // éminence du pouce, en haut à gauche
  sc.push(vmT(-0.75, gy + 1.7, -4.2)); sc.ell(skin, 1.35, 1.15, 2.6); sc.pop();
  // pouce couché le long du dos, la pulpe juste derrière la garde
  const t0 = [-0.4, gy + 2.0, -6.3], t1 = [0.1, gy + HH + 1.3, -4.0], t2 = [0.45, gy + HH + 1.35, -2.25], t3 = [0.6, gy + HH + 1.1, -1.1];
  const tj = o.thumb === 'wrap' ? [t0, ring(2.2, -3.4, 1.0), ring(2.75, -2.6, 0.9), ring(3.25, -2.2, 0.8)] : [t0, t1, t2, t3];
  sc.caps(skin, tj[0], tj[1], 1.12, 1.0);
  sc.caps(skin, tj[1], tj[2], 1.0, 0.9);
  sc.caps(skin, tj[2], tj[3], 0.9, 0.78);
  band(tj[2], vmUnit(vmSub(tj[3], tj[1])), 0.96);
  {
    const d = vmUnit(vmSub(tj[3], tj[2])), up = vmUnit([0.55, 1, 0]);
    const nb = vmAdd(vmSub(tj[3], vmK(d, 0.7)), vmK(up, 0.55)), ne = vmAdd(tj[3], vmK(up, 0.4));
    sc.push(vmAlong(nb, ne)); sc.ell(nail, 0.5, 0.3, 0.55); sc.pop();
  }
  // poignet puis avant-bras en manche de chemise, avec manchette
  const wrist = [0.9, gy + 1.6, -10.4];
  const arm = o.arm || vmAdd(wrist, [6, 20, -30]);
  const dir = vmUnit(vmSub(arm, wrist));
  sc.caps(skin, vmAdd(wrist, [-0.2, -0.2, 2.6]), vmAdd(wrist, vmK(dir, 1.4)), 2.45, 2.55);
  sc.caps(cloth, vmAdd(wrist, vmK(dir, o.cuff ?? 1.2)), vmAdd(wrist, vmK(dir, (o.cuff ?? 1.2) + 2.8)), 3.25, 3.4);
  sc.caps(cloth, vmAdd(wrist, vmK(dir, (o.cuff ?? 1.2) + 3.0)), arm, 3.35, 4.3);
}

// Poses (repère caméra, cm) : guard = garde, dir = direction de la lame, roll = rotation du poignet autour de la lame
// (0 : dos de la main vers la droite, tranchant en bas ; > 0 : main en pronation, dos de la main vers le haut),
// armCam = coude. La main droite reste vue de dos ou de trois quarts : jamais paume vers l'œil.
// Coup : armé en haut à droite (tranchant vers la gauche), taille en diagonale à travers le centre, fin en bas à gauche.
const KN_POSES = {
  tomahawk: {
    // manche dressé vers l'avant, tête en haut au centre, tranchant vers l'avant-gauche, plumes qui pendent
    idle: [{ guard: [6, -10, 46], dir: [-16, 42, 91], roll: -0.6, thumb: 'wrap', armCam: [16, -60, 20] }],
    swing: [
      { guard: [8, -9, 52], dir: [0.12, 0.32, 0.94], roll: -0.2, thumb: 'wrap', armCam: [20, -60, 24] },
      { guard: [2, -10, 48], dir: [-0.45, 0.12, 0.88], roll: -0.6, thumb: 'wrap', armCam: [14, -60, 18], streak: true },
      { guard: [-1, -7.5, 52], dir: [-0.45, -0.16, 0.86], roll: -0.5, thumb: 'wrap', armCam: [12, -60, 18] },
    ],
  },
  saber: {
    // en garde : lame qui monte vers le centre haut, tranchant devant, branche de garde autour des doigts
    idle: [{ guard: [6, -12, 50], dir: [-18, 10, 90], roll: -1.1, thumb: 'wrap', armCam: [16, -60, 22] }],
    swing: [
      { guard: [8, -11, 56], dir: [0.06, 0.05, 1], roll: -0.5, thumb: 'wrap', armCam: [20, -60, 24] },
      { guard: [3, -11, 54], dir: [-0.4, -0.02, 0.92], roll: -0.4, thumb: 'wrap', armCam: [14, -60, 18], streak: true },
      { guard: [-1, -12, 56], dir: [-0.38, -0.22, 0.9], roll: -0.4, thumb: 'wrap', armCam: [12, -60, 18] },
    ],
  },
  bowie: {
    // repos : main en bas à droite vue de dos, pouce sur le dos de la lame, pointe vers le viseur (fuyante), tranchant en bas
    idle: [{ at: [3, -14.3, 31], roll: 0.95, yaw: -0.08, pitch: -0.28, armCam: [10, -55, 12] }],
    swing: [
      { guard: [6, -9, 34], dir: [0.12, 0.45, 0.88], roll: 0.2, armCam: [16, -55, 14] },
      { guard: [0, -9, 37], dir: [-0.6, 0.05, 0.8], roll: 0.05, armCam: [-2, -60, 34], streak: true },
      { guard: [-1, -10, 40], dir: [-0.5, -0.3, 0.81], roll: 0.0, armCam: [6, -60, 24] },
    ],
  },
};

// Repère du couteau pour une pose : vmHold (lame parallèle au regard), lacet vers l'intérieur, tangage, dévers
const knHold = (P) => vmChain(vmRx(-VM_TILT), vmT(P.at[0], P.at[1], P.at[2]), vmRz(P.roll || 0), vmRy(P.yaw || 0), vmRx(P.pitch || 0)); // sans VM_DIP : les lames ne visent pas

// Repère du couteau pour une pose (garde + direction de lame, ou tenue vmHold)
const knPoseFrame = (P) => (P.guard ? knFrame(P.guard, vmAdd(P.guard, vmK(vmUnit(P.dir), 100)), P.roll) : knHold(P));

// Points de la lame (repère de l'arme) qui laissent une traînée, de la pointe vers la garde
function knStreakPts(id) {
  if (id === 'tomahawk') return [[0, -8.6, 27.8], [0, -8.4, 26.2], [0, -8.2, 24.6], [0, -8.6, 22.6], [0, -5.5, 22.2], [0, -2.5, 22.2]];
  if (id === 'saber') return [51, 47, 42, 36, 30, 24].map((z) => [0, 0.0028 * z * z, z]);
  return [1, 3, 6, 9.5, 13.5, 18].map((d) => { const z = KN_BLADE_L - d, s = knBowieStation(z); return [0, (s.ye + s.ys) / 2, z]; });
}
// Traînée du coup : arcs pâles qui relient l'ancienne position de la lame (pose from) à l'actuelle,
// posés seulement sur le vide (jamais sur la main ni la lame), loin des bords haut et côtés
function knStreak(sc, K0, K1, id) {
  sc.fx((p, proj) => {
    const c = p.ctx.canvas, W = c.width, H = c.height, D = p.ctx.getImageData(0, 0, W, H).data;
    const free = (x, y) => x >= 2 && y >= 2 && x < W - 2 && y < H && !D[(y * W + x) * 4 + 3];
    const cols = ['#fffaf0', '#ece4d4', '#d2c8b4'];
    const gaps = [[0, 0], [0, 1], [1, 1], [1, 2], [2, 2], [2, 3]];
    knStreakPts(id).forEach((q, r) => {
      const [ci, gap] = gaps[r];
      const a = vmP(K0, q), b = vmP(K1, q);
      const pts = [];
      for (let k = 0; k <= 14; k++) {
        const t = 0.05 + (0.95 * k) / 14;
        // arc : léger bombé vers le haut entre les deux positions
        const m = vmLerp(a, b, t);
        pts.push(proj(vmAdd(m, [0, Math.sin(t * Math.PI) * 2, 0])));
      }
      for (let i = 0; i + 1 < pts.length; i++) {
        const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
        const n = Math.max(1, Math.round(Math.hypot(x1 - x0, y1 - y0)));
        for (let k = 0; k < n; k++) {
          const x = Math.round(x0 + ((x1 - x0) * k) / n), y = Math.round(y0 + ((y1 - y0) * k) / n);
          // pointillés plus lâches vers la queue de la traînée
          if (i < 5 && (x + y + r) % (gap + 1)) continue;
          if (free(x, y)) p.P(x, y, cols[i < 4 ? 2 : i < 9 ? Math.min(2, ci + 1) : ci]);
        }
      }
    });
  });
}

// --- tomahawk : manche de noyer droit, tête d'acier (tranchant vers -y comme le couteau), pic à l'arrière, lanière à plumes
const KN_HAFT_Y = -0.65;
function knTomahawk(sc) {
  sc.push(vmT(0, KN_HAFT_Y, -11.2)); sc.cyl(VM_WALNUT, 1.12, 38.5, { r2: 0.95, segs: 12 }); sc.pop();
  // bagues de cuir sous la tête et au bout du manche
  for (const [z, l] of [[18.2, 1.6], [-11.4, 1.2]]) { sc.push(vmT(0, KN_HAFT_Y, z)); sc.cyl(VM_LEATHER, 1.22, l, { segs: 12 }); sc.pop(); }
  // tête : œil autour du manche, lame qui s'évase vers le tranchant, pic court à l'arrière
  sc.ext(KN_STEEL, [[21.4, 1.2], [26.6, 1.2], [26.4, -1.9], [28.4, -7.4], [27.6, -8.7], [24.6, -8.2], [21.8, -8.9], [20.6, -7.6], [22.2, -1.9]], 1.25);
  sc.ext(KN_STEEL_HI, [[28.0, -7.3], [28.5, -7.6], [27.7, -8.95], [24.6, -8.45], [21.7, -9.15], [20.4, -7.8], [20.9, -7.6], [21.9, -8.6], [24.6, -7.9], [27.5, -8.4]], 1.3, { same: true });
  sc.ext(KN_STEEL_LO, [[22.6, 1.2], [25.4, 1.2], [24.9, 4.2], [23.6, 4.9]], 0.9);
  // lanière de cuir et deux plumes qui pendent sous la tête
  sc.tube(VM_LEATHER, [[0.2, -1.6, 19.2], [0.9, -4.6, 18.4], [1.2, -7.4, 18.0]], 0.22);
  const FEATHER = vmMatRamp(['#5a4a40', '#a89880', '#e0d6c4', '#f6f0e4', '#ffffff']), RED = vmMat('#b03022');
  sc.push(vmChain(vmT(1.2, -7.4, 18.0), vmRx(0.15))); sc.ext(FEATHER, [[0, 0], [0.9, -0.6], [0.8, -4.6], [0, -5.6], [-0.6, -3.6], [-0.4, -0.6]], 0.2); sc.pop();
  sc.push(vmChain(vmT(1.3, -7.0, 17.0), vmRx(-0.2))); sc.ext(RED, [[0, 0], [0.7, -0.5], [0.6, -3.6], [0, -4.4], [-0.5, -2.8]], 0.2); sc.pop();
}

// --- sabre de cavalerie : lame courbe (tranchant convexe vers -y), gouttière, garde à branche en laiton, poignée de cuir
const KN_SABER_L = 52;
function knSaber(sc) {
  const yc = (z) => 0.0028 * z * z, w = (z) => 1.55 - 0.45 * (z / KN_SABER_L);
  const up = [], dn = [], hi = [], fu = [];
  for (let z = 0; z <= KN_SABER_L - 3; z += 3) { up.push([z, yc(z) + w(z)]); dn.push([z, yc(z) - w(z)]); }
  const tipZ = KN_SABER_L + 0.5, tip = [tipZ, yc(tipZ) - 0.6];
  sc.ext(KN_STEEL, [...up, tip, ...dn.reverse()], 0.5);
  // fil du tranchant (clair) et gouttière (sombre) le long du dos
  for (let z = 1; z <= KN_SABER_L - 3; z += 3) { hi.push([z, yc(z) - w(z) + 0.35]); fu.push([z, yc(z) + w(z) * 0.35]); }
  sc.ext(KN_STEEL_HI, [...dn.reverse().map(([z, y]) => [z, y - 0.05]), tip, ...hi.reverse()], 0.56, { same: true });
  if (fu.length > 2) sc.ext(KN_STEEL_LO, [...fu.slice(0, -2), ...fu.slice(0, -2).reverse().map(([z, y]) => [z, y + 0.45])], 0.58, { same: true });
  // garde : plateau, branche de garde qui protège les doigts (côté tranchant), pommeau
  sc.push(vmT(0, -0.5, -0.3)); sc.ell(VM_BRASS, 1.5, 2.6, 0.55); sc.pop();
  sc.tube(VM_BRASS, [[0, -2.6, -0.3], [0.2, -3.9, -1.8], [0.25, -4.2, -4.8], [0.2, -3.9, -7.8], [0, -2.7, -10.0], [0, -1.4, -10.9]], 0.32);
  sc.tube(VM_BRASS, [[0, -2.2, -0.4], [0.9, -3.2, -2.4], [1.0, -3.4, -5.0]], 0.2, { same: true });
  const rings = [];
  for (let i = 0; i <= 10; i++) {
    const u = i / 10, z = -0.6 - u * 9.9, r = [];
    for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2; r.push([Math.cos(a) * (1.05 + 0.12 * Math.sin(u * Math.PI)), knGripY(z) + Math.sin(a) * (1.4 + 0.15 * Math.sin(u * Math.PI)), z]); }
    rings.push(r);
  }
  knLoft(sc, vmMatRamp(['#0e0a0a', '#1e1614', '#30241e', '#4a3a2e', '#7a6450']), rings, { capEnd: true });
  sc.push(vmT(0, knGripY(-10.6) - 0.1, -10.8)); sc.ell(VM_BRASS, 1.25, 1.7, 0.7); sc.pop();
}

function knBowie(P, skin, cloth) {
  const sc = vmScene();
  const TU = (globalThis.__TUNE && globalThis.__TUNE[skin]) || {};
  if (TU.P) P = { ...P, ...TU.P };
  const K = knPoseFrame(P);
  if (P.from) knStreak(sc, knPoseFrame(P.from), K, P.id);
  sc.push(K);
  // face de lame tournée vers l'œil (pour les détails 2D)
  sc.knSide = vmDot([K[0], K[4], K[8]], vmUnit([-K[3], -K[7], -K[11]])) > 0 ? 1 : -1;
  if (P.id === 'tomahawk') knTomahawk(sc);
  else if (P.id === 'saber') knSaber(sc);
  else { knBowieBlade(sc); knBowieHilt(sc); }
  knHand(sc, { skin, cloth, arm: P.armCam ? knInv(K, P.armCam) : P.arm, thumb: P.thumb || 'spine' });
  sc.pop();
  return vmRender(sc);
}

function knPose(id, state, frame) {
  const L = KN_POSES[id] || KN_POSES.bowie, P = (L[state] || L.idle)[frame] || L.idle[0];
  // la traînée part de la pose précédente du coup
  return P.streak ? { ...P, id, from: L.swing[frame - 1] } : { ...P, id };
}

function knViewModel(id, state, frame, skin, cloth) {
  if (id !== 'bowie' && id !== 'tomahawk' && id !== 'saber') return null;
  return memo(`kn:${id}:${state}:${frame}:${skin}:${cloth}`, () => knBowie(knPose(id, state, frame), skin, cloth));
}

// ------------------------------------------------------------------ 8c) armes longues en main (moteur vm3d)
// Winchester 1873 (et sa version dorée gravée), fusil à pompe, Sharps 1874 à bloc tombant, canon scié juxtaposé.
// Repère de chaque arme (cm) : axe du canon selon +z en x = 0, y = 0 ; origine à la culasse (face arrière du canon).
// Tenue « Doom » : arme au centre, tenue droite, canon parallèle au regard qui file vers le viseur ; on la voit de
// dessus-arrière (boîte de culasse, bande, hausse, guidon). Les sections (x, y) sont épaissies de LG_K (comme les
// sprites de Doom), les longueurs restent vraies. Main droite au poignet de crosse (index sur la détente, pouce
// par-dessus), main gauche qui berce le garde-main par-dessous (pouce sur un flanc, doigts enroulés sur l'autre).
// lgViewModel(id, state, frame, skin, cloth) → canvas 200x130 (vmRender) ou null si l'id n'est pas une arme longue.

const LG_IDS = ['winchester', 'goldwin', 'pump', 'sharps', 'sawed'];
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
  const L = LG_WIN.L;
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
  const L = LG_PUMP.L, s = o.slide || 0;
  const RS = [[-1.3, -0.85, 2.05, 1.42], [0.0, -0.85, 2.85, 1.58], [14.6, -0.85, 2.85, 1.58], [15.6, -0.8, 2.3, 1.42]];
  lgLoft(sc, LG_BLACK, RS, { p: 3.4, n: 22 });
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
  lgAt(sc, 0, 0, 15.4, () => sc.cyl(VM_BLUED, 1.34, L - 15.4, { segs: 18, r2: 1.24 }));
  lgAt(sc, 0, 0, L - 0.05, () => sc.cyl(VM_DARK, 0.95, 0.14, { segs: 14 }));
  lgAt(sc, 0, 0, L - 0.5, () => sc.cyl(VM_STEEL, 1.29, 0.45, { segs: 18 }));
  lgAt(sc, 0, 1.42, L - 1.0, () => sc.ell(VM_BRASS, 0.36, 0.36, 0.36));
  lgAt(sc, 0, -2.5, 15.4, () => sc.cyl(VM_BLUED, 1.0, L - 19, { segs: 14 }));
  lgAt(sc, 0, -2.5, L - 3.6, () => sc.cyl(VM_STEEL, 1.1, 1.2, { segs: 14 }));
  lgAt(sc, 0, -1.3, L - 5.8, () => sc.box(VM_BLUED, 2.4, 4.0, 1.1));
  // pompe : barres d'action + garde-main rainuré (coulisse de s cm vers l'arrière)
  sc.push(vmT(0, 0, -s));
  for (const x of [-1.05, 1.05]) lgAt(sc, x, -2.0, 18.5, () => sc.box(VM_STEEL, 0.3, 0.5, 8.0));
  const st = [];
  for (let k = 0; k <= 14; k++) {
    const z = 22.5 + k * 1.1, rib = k % 2 ? 0.88 : 1, end = k === 0 || k === 14 ? 0.9 : 1;
    st.push([z, -2.3, 1.95 * end * rib, 2.15 * end * rib]);
  }
  lgLoft(sc, LG_WOOD, st, { n: 18 });
  sc.pop();
  // crosse, pontet, détente
  const SS = [[-1.0, -1.0, 2.6, 1.5], [-3.5, -2.2, 2.2, 1.42], [-8.5, -3.3, 2.2, 1.46], [-13, -4.4, 3.0, 1.66], [-19, -5.8, 4.2, 1.86], [-24, -6.9, 5.2, 1.96]];
  lgLoft(sc, LG_WOOD, SS, { n: 18 });
  lgGrain(sc, SS, -1.3, -23, 21, { n: 10 });
  sc.tube(VM_BLUED, [[0, -3.5, 3.4], [0, -5.0, 3.0], [0, -6.0, 1.6], [0, -6.0, -0.4], [0, -5.2, -1.6], [0, -4.0, -2.0]], 0.3);
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
  const L = LG_SAWED.L, op = o.open || 0;
  // bascule : canons et garde-main pivotent ensemble autour de la charnière
  sc.push(lgPivot(-1.9, 6.4, vmRx(0.62 * op)));
  for (const x of [-1.22, 1.22]) {
    lgAt(sc, x, 0, 0, () => sc.cyl(VM_BLUED, 1.24, L, { segs: 18, r2: 1.18 }));
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
  lgAt(sc, 0, 0.98, L / 2, () => sc.box(VM_BLUED, 0.9, 0.5, L - 0.6));
  lgAt(sc, 0, 1.24, L / 2, () => sc.box(LG_GUNMETAL, 0.62, 0.06, L - 1.2));
  lgAt(sc, 0, 1.55, L - 0.8, () => sc.ell(VM_BRASS, 0.32, 0.32, 0.32));
  lgAt(sc, 0, -1.0, L / 2, () => sc.box(VM_BLUED, 0.9, 0.9, L - 1));
  // pièces de culasse sous les canons + garde-main
  sc.ext(LG_CASE, [[0, -0.6], [6.4, -0.6], [6.6, -1.8], [6.0, -2.5], [0.4, -2.5]], 2.3);
  const FS = [[6.6, -1.55, 1.15, 2.35], [9, -1.6, 1.22, 2.4], [15, -1.5, 1.0, 2.2], [16.5, -1.38, 0.78, 1.9]];
  lgLoft(sc, LG_WOOD, FS, { n: 18 });
  lgGrain(sc, FS, 6.8, 16.3, 51, { n: 6 });
  sc.pop();
  // boîte : bascule jaspée, flasques arrondies derrière les canons
  const RS = [[-1.9, -0.8, 1.9, 2.3], [0.2, -0.9, 2.05, 2.45]], RL = [[0.2, -1.6, 1.25, 2.3], [6.6, -1.6, 1.2, 2.3]];
  lgLoft(sc, LG_CASE, RS, { p: 4, n: 20 });
  lgLoft(sc, LG_CASE, RL, { p: 5, n: 16 });
  lgMottle(sc, RL, 0.4, 6.4, 61, 5, 8);
  lgMottle(sc, RS, -1.8, 0.1, 62, 4, 5);
  for (const x of [-1.22, 1.22]) lgAt(sc, x, 0, -0.9, () => sc.ell(LG_CASE, 1.18, 1.18, 1.0));
  for (const x of [-2.32, 2.32]) lgAt(sc, x, -1.6, 4.0, () => sc.ell(VM_STEEL, 0.1, 0.33, 0.33));
  // clé d'ouverture sur la queue de culasse
  lgAt(sc, 0, 1.2, -2.2, () => lgLoft(sc, LG_CASE, [[0.2, 0, 0.26, 0.42], [-2.2, 0, 0.24, 0.36], [-2.8, 0.05, 0.28, 0.42]], { p: 3, n: 12 }));
  // deux chiens extérieurs, crêtes striées
  for (const [x, k] of [[-1.35, 0], [1.35, 1]]) {
    const down = o.hammerDown && (o.hammerDown === 2 || k === 1);
    sc.push(vmChain(vmT(x, 0, 0), lgPivot(-0.2, -2.6, vmRx(down ? 0.85 : 0))));
    sc.ext(LG_CASE, [[-1.8, -0.4], [-2.2, 1.0], [-3.2, 2.2], [-4.2, 2.6], [-4.45, 2.1], [-3.4, 1.4], [-3.0, -0.2], [-2.0, -1.4]], 0.85);
    for (let j = 0; j < 3; j++) lgAt(sc, 0, 2.55 - j * 0.12, -4.0 + j * 0.3, () => sc.box(VM_DARK, 0.9, 0.08, 0.12));
    sc.pop();
  }
  // crosse courte à poignée pistolet, pontet, deux détentes
  const SS = [[-1.7, -0.9, 2.3, 1.9], [-3.8, -1.9, 2.1, 1.55], [-7.5, -3.1, 2.3, 1.52], [-11, -4.6, 3.2, 1.66], [-15.5, -6.0, 4.0, 1.8]];
  lgLoft(sc, LG_WOOD, SS, { n: 18 });
  lgGrain(sc, SS, -2.0, -15, 52, { n: 9 });
  sc.tube(VM_BLUED, [[0, -2.8, 3.4], [0, -4.4, 2.9], [0, -5.4, 1.4], [0, -5.4, -0.6], [0, -4.6, -1.8], [0, -3.4, -2.2]], 0.3);
  sc.ext(VM_STEEL, [[1.6, -2.8], [1.4, -3.9], [0.9, -4.5], [1.1, -3.8], [1.0, -2.8]], 0.4);
  sc.ext(VM_STEEL, [[0.4, -2.8], [0.2, -3.8], [-0.3, -4.4], [-0.1, -3.7], [-0.2, -2.8]], 0.4);
}

// --- tenue : culasse posée sur le point b du canvas à la profondeur zb, bouche visée sur le point m du canvas (la
// longueur du canon fixe sa profondeur) ; m est choisi pour que le canon reste à peu près parallèle au regard (il file
// vers le viseur comme dans Doom et laisse voir le dessus de l'arme)
const LG_POSE = {
  winchester: { b: [89, 116], zb: 25, m: [88, 52] },
  pump: { b: [89, 116], zb: 25, m: [88, 52] },
  sharps: { b: [89, 118], zb: 31, m: [88, 54] },
  sawed: { b: [89, 120], zb: 28, m: [88, 66] },
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
};
// Cartouche ou douille (taille réelle) dont la base est au point p du repère F de l'arme, axe d (repère arme)
function lgCart(sc, F, p, d, kind) {
  const c0 = vmP(F, p), ax = vmUnit(vmSub(vmP(F, vmAdd(p, d)), c0));
  sc.stack.push(vmAlong(c0, vmAdd(c0, ax)));
  lgRound(sc, kind);
  sc.stack.pop();
}

function lgView(id, state, frame, skin, cloth) {
  const kind = id === 'goldwin' ? 'winchester' : id;
  const P = LG_POSE[kind], spec = { winchester: LG_WIN, pump: LG_PUMP, sharps: LG_SHARPS, sawed: LG_SAWED }[kind];
  const fire = state === 'fire', rel = state === 'reload';
  const kick = fire ? (frame === 0 ? 1 : 0.3) : 0;
  const sc = vmScene();
  const S = vmS(LG_K, LG_K, 1), G = spec.grip.t, gy = G[1] * LG_K, gz = G[2];
  // recul : la bouche se relève autour de la main droite et l'arme recule
  let hold = vmChain(lgPose(P, spec.L), vmT(0, 0, -2.2 * kick), lgPivot(gy, gz, vmRx(-0.11 * kick)));
  const R = rel ? LG_REL[kind][frame] : null;
  if (R) hold = vmChain(vmT(0, R.lift, 0), hold, lgPivot(gy, gz, vmChain(vmRx(-R.pitch), vmRz(R.roll))));
  sc.push(hold).push(S);
  const o = { gold: id === 'goldwin' };
  if (kind === 'winchester') { o.lever = rel ? [0.6, 1.0, 0.25][frame] : 0; o.cycle = rel ? [0.6, 1, 0.25][frame] : 0; }
  if (kind === 'pump') o.slide = rel ? [5, 8.5, 2.5][frame] : 0;
  if (kind === 'sharps') o.open = rel ? [1, 1, 0.35][frame] : 0;
  if (kind === 'sawed') {
    o.open = rel ? [0.85, 1, 0.5][frame] : 0;
    o.shells = rel && frame > 0 ? 'new' : 'old';
    o.seat = frame === 1 ? 0.45 : 1;
    o.hammerDown = fire && frame === 0 ? 2 : 0;
  } else o.hammerDown = fire && frame === 0;
  ({ winchester: lgWinchester, pump: lgPump, sharps: lgSharps, sawed: lgSawed })[kind](sc, o);
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
  const L = spec.L;
  if (fire) sc.fx((p) => {
    const pts = (kind === 'sawed' ? [[-1.22, 0, L + 0.8], [1.22, 0, L + 0.8]] : [[0, 0, L + 0.8]]).map((q) => vmP(F, q));
    const m = pts.map(vmProj).reduce((a, q) => [a[0] + q[0] / pts.length, a[1] + q[1] / pts.length], [0, 0]);
    if (frame === 0) vmFlash(p, m[0], m[1], kind === 'sawed' ? 19 : kind === 'pump' ? 17 : kind === 'sharps' ? 16 : 14, kind.length);
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

// ================================================================== Gatling 1874 à manivelle, tenue à la hanche
// Repère : axe du faisceau selon +z en x = y = 0 ; face avant du carter de culasse en z = 0 (cm).
// Carter de laiton, faisceau de 6 canons en fer sombre (un canon repère bagué de laiton pour lire la rotation),
// chargeur vertical court posé sur la trémie, manivelle sur le flanc droit, poignée de noyer sur le flanc gauche.
const MS_GAT_R = 2.9, MS_GAT_L = 38, MS_GAT_HR = 5.0, MS_GAT_HZ = -13;
// poignée de soutien : x, y, début et fin en z (sur le flanc gauche du carter, dans l'axe du tir)
const MS_GAT_FORE = [-7.2, -2.2, -11, -3.5];
const MS_GAT_CRANK = [MS_GAT_HR + 0.6, -0.8, -8.5], MS_GAT_ARM = 4.6;
function msGatling(sc, o = {}) {
  const rot = o.rot || 0, R = MS_GAT_R, HR = MS_GAT_HR, HZ = MS_GAT_HZ;
  // carter de culasse : cylindre de laiton, deux cerclages, plaque arrière de fer et bouton de culasse
  sc.push(vmT(0, 0, HZ)); sc.cyl(VM_BRASS, HR, -HZ, { segs: 24 }); sc.pop();
  for (const z of [HZ + 0.2, -1.4]) { sc.push(vmT(0, 0, z)); sc.cyl(VM_GOLD, HR + 0.28, 1.2, { segs: 24 }); sc.pop(); }
  sc.push(vmT(0, 0, HZ - 0.9)); sc.cyl(MS_IRON, HR - 0.5, 0.9, { segs: 24 }); sc.pop();
  for (let k = 0; k < 6; k++) {
    // têtes de vis de la plaque arrière
    const a = Math.PI / 6 + (k * Math.PI) / 3;
    sc.push(vmT(Math.cos(a) * (HR - 1.4), Math.sin(a) * (HR - 1.4), HZ - 1.0)); sc.ell(VM_BRASS, 0.42, 0.42, 0.25); sc.pop();
  }
  sc.push(vmT(0, 0, HZ - 2.2)); sc.cyl(MS_IRON, 0.8, 1.4, { segs: 10 }); sc.pop();
  sc.push(vmT(0, 0, HZ - 2.9)); sc.ell(MS_IRON, 1.55, 1.55, 1.3); sc.pop();
  // faisceau tournant : bague arrière, arbre, 6 canons, deux plaques-guides (milieu et bouche)
  sc.push(vmRz(rot));
  sc.cyl(MS_IRON, R + 1.25, 1.4, { segs: 18 });
  sc.push(vmT(0, 0, 1.4)); sc.cyl(MS_IRON, 0.9, MS_GAT_L - 1.2, { segs: 10 }); sc.pop();
  for (let k = 0; k < 6; k++) {
    const a = Math.PI / 2 + (k * Math.PI) / 3, bx = Math.cos(a) * R, by = Math.sin(a) * R;
    sc.push(vmT(bx, by, 1.4));
    sc.cyl(VM_BLUED, 0.82, MS_GAT_L - 1.4, { segs: 12 });
    sc.push(vmT(0, 0, MS_GAT_L - 1.38)); sc.cyl(VM_DARK, 0.42, 0.05, { segs: 10 }); sc.pop();
    // un canon sur deux bagué de laiton : le motif alterne à chaque coup (rotation de 60°)
    if (k % 2 === 0) for (const z of [19.5, 28.5]) { sc.push(vmT(0, 0, z)); sc.cyl(VM_GOLD, 0.98, 1.6, { segs: 12 }); sc.pop(); }
    sc.pop();
  }
  for (const [z, w, m] of [[15, 1.4, VM_BRASS], [MS_GAT_L - 3.2, 1.8, VM_BRASS]]) {
    sc.push(vmT(0, 0, z)); sc.cyl(m, R + 1.05, w, { segs: 18 }); sc.pop();
    for (let k = 0; k < 6; k++) {
      const a = (k * Math.PI) / 3;
      sc.push(vmT(Math.cos(a) * (R + 1.0), Math.sin(a) * (R + 1.0), z + w / 2)); sc.ell(MS_IRON, 0.36, 0.36, 0.36); sc.pop();
    }
  }
  sc.pop();
  // trémie de laiton sur le dessus, puis chargeur court (o.mag : repère du chargeur, null = retiré)
  sc.push(vmChain(vmRz(MS_MAG_A), vmT(0, HR + 0.3, -7.2))); sc.box(VM_BRASS, 3.0, 1.6, 7.0); sc.pop();
  sc.push(vmChain(vmRz(MS_MAG_A), vmT(0, HR + 1.15, -7.2))); sc.box(VM_DARK, 2.2, 0.3, 6.2); sc.pop();
  if (o.mag) { sc.push(o.mag); msGatMag(sc); sc.pop(); }
  // manivelle : moyeu sur le flanc droit, bras qui tourne dans le plan y-z, maneton vers l'extérieur
  const ph = o.crank || 0, ca = MS_GAT_CRANK, arm = MS_GAT_ARM;
  sc.push(vmChain(vmT(ca[0] - 1.0, ca[1], ca[2]), vmRy(Math.PI / 2))); sc.cyl(MS_IRON, 1.4, 1.2, { segs: 12 }); sc.pop();
  sc.push(vmChain(vmT(ca[0] + 0.2, ca[1], ca[2]), vmRx(-ph)));
  sc.push(vmT(0.35, 0, arm / 2)); sc.box(MS_IRON, 0.7, 1.2, arm + 1.2); sc.pop();
  sc.push(vmChain(vmT(0.4, 0, 0), vmRy(Math.PI / 2))); sc.cyl(MS_IRON, 0.75, 0.9, { segs: 10 }); sc.pop();
  sc.push(vmChain(vmT(0.7, 0, arm), vmRy(Math.PI / 2))); sc.cyl(MS_IRON, 0.45, 1.0, { segs: 8 }); sc.pop();
  sc.pop();
  // poignée de soutien sur le flanc gauche : manche de noyer dans l'axe du tir, deux pattes de fer vers le carter
  const [FX, FY, F0, F1] = MS_GAT_FORE;
  for (const z of [F0 + 0.8, F1 - 0.8]) { sc.push(vmT((FX - HR) / 2 + 0.3, FY, z)); sc.box(MS_IRON, -FX - HR + 0.6, 1.1, 1.2); sc.pop(); }
  sc.push(vmT(FX, FY, F0 - 0.6)); sc.cyl(VM_WALNUT, 1.2, F1 - F0 + 1.2, { segs: 12 }); sc.pop();
  for (const z of [F0 - 0.7, F1 + 0.7]) { sc.push(vmT(FX, FY, z)); sc.ell(MS_IRON, 1.3, 1.3, 0.45); sc.pop(); }
  const crank = (s) => vmP(vmChain(vmT(ca[0] + 0.2, ca[1], ca[2]), vmRx(-ph), vmT(0.7 + s, 0, arm)), [0, 0, 0]);
  return { crank, fore: { b: [FX, FY, F0], t: [FX, FY, F1] } };
}
// Chargeur court : boîte de tôle (épaisseur x, profondeur z) bordée de laiton, culots visibles par la fente arrière,
// anse de transport ; origine au pied du chargeur
const MS_MAG_H = 5.2;
function msGatMag(sc) {
  const H = MS_MAG_H;
  sc.push(vmT(0, H / 2, 0)); sc.box(MS_IRON, 2.0, H, 6.0); sc.pop();
  sc.push(vmT(0, H + 0.25, 0)); sc.box(VM_BRASS, 2.4, 0.5, 6.4, { same: true }); sc.pop();
  sc.push(vmT(0, 0.25, 0)); sc.box(VM_BRASS, 2.4, 0.5, 6.4); sc.pop();
  // fente arrière : culots de laiton empilés
  sc.push(vmT(0, H / 2 + 0.2, -3.02)); sc.box(VM_DARK, 1.0, H - 1.4, 0.1); sc.pop();
  for (let i = 0; i < 3; i++) { sc.push(vmT(0, 1.4 + i * 1.15, -3.1)); sc.cyl(VM_BRASS, 0.42, 0.12, { segs: 8 }); sc.pop(); }
  // anse de transport
  sc.tube(MS_IRON, [[0, H + 0.4, -2.0], [0, H + 1.7, -1.3], [0, H + 1.7, 1.3], [0, H + 0.4, 2.0]], 0.3);
}
// trémie et chargeur penchés vers la gauche : vu de derrière, ils ne cachent pas le faisceau de canons
const MS_MAG_A = 0.62, MS_MAG_SEAT = vmChain(vmRz(MS_MAG_A), vmT(0, MS_GAT_HR + 1.3, -7.2));

function msGatlingView(state, frame, skin, cloth) {
  const sc = vmScene();
  const fire = state === 'fire', rel = state === 'reload';
  const f = fire ? frame : 0;
  const jit = fire ? [[0.3, -0.25], [-0.25, 0.2], [0.25, 0.1], [-0.3, -0.2]][f] : [0, 0];
  let hold = vmChain(vmHold(GAT_P[0] + jit[0], GAT_P[1] + jit[1], GAT_P[2], 0), vmRx(GAT_P[3] + (fire ? -0.015 * (f % 2 ? 0.5 : 1) : 0)));
  if (rel) {
    const t = [1, 1, 0.6][frame] ?? 1;
    hold = vmChain(vmHold(GAT_P[0] + 2.5 * t, GAT_P[1] - 7 * t, GAT_P[2] + 3 * t, -0.12 * t), vmRy(-0.08 * t), vmRx(GAT_P[3] + 0.06 * t));
  }
  sc.push(hold);
  // chargeur : en place, soulevé (ancien), nouveau tenu au-dessus de la trémie, puis enfoncé
  let mag = MS_MAG_SEAT;
  // 0 : l'ancien chargeur sort de la trémie (tiré vers le haut) ; 1 : le nouveau arrive de la gauche, penché ; 2 : enfoncé
  if (rel) mag = [vmChain(MS_MAG_SEAT, vmT(-0.8, 4.6, -0.5), vmRz(0.15), vmRx(-0.12)), vmChain(MS_MAG_SEAT, vmT(-3.5, 3.0, -2.0), vmRz(0.5), vmRx(0.2)), MS_MAG_SEAT][frame];
  const g = msGatling(sc, { rot: (f * Math.PI) / 3, crank: (f * Math.PI) / 2, mag });
  // main droite sur le maneton de la manivelle : poignée de bois horizontale vers la droite
  const kn = g.crank(0);
  sc.push(vmChain(vmT(kn[0], kn[1], kn[2]), vmRy(Math.PI / 2))); sc.cyl(VM_WALNUT, 0.95, 4.0, { segs: 10 }); sc.pop();
  const TU = msTune(skin);
  vmGrip(sc, vmAdd(kn, [3.9, 0, 0]), vmAdd(kn, [0.4, 0, 0]), { skin, cloth, side: 1, fwd: TU.fwd || GAT_RH.fwd, rx: 1.0, rz: 1.0, web: 0.3, arm: vmAdd(kn, TU.arm || GAT_RH.arm), thumb: TU.thumb });
  // main gauche : poignée latérale, ou anse du chargeur pendant le rechargement
  if (!rel) {
    // berce la poignée avant par-dessous : pouce sur le flanc gauche, doigts qui remontent sur le flanc droit
    const F = g.fore;
    vmGrip(sc, F.b, F.t, { skin, cloth, side: -1, rx: 1.25, rz: 1.25, fwd: [0.87, 0.5, 0], curl: 0.6,
      thumb: [F.t[0] - 1.4, F.t[1] + 1.5, F.t[2] + 2.5], arm: GAT_LH.arm });
  } else {
    sc.push(mag);
    vmGrip(sc, [0, MS_MAG_H + 1.7, 1.6], [0, MS_MAG_H + 1.7, -1.6], { skin, cloth, side: -1, fwd: [-1, 0.4, 0], rx: 0.45, rz: 0.45, web: 0.2, arm: msToLocal(sc.top(), TU.rarm || [-18, -48, 62]) });
    sc.pop();
  }
  if (fire) sc.fx((p, proj) => {
    // le canon du haut tire : éclair alterné grand / petit, douilles éjectées à droite sous le carter
    const [mx, my] = proj([0, MS_GAT_R, MS_GAT_L + 0.8]);
    vmFlash(p, mx, my, msFlashR(mx, my, f % 2 ? 10 : 15), 7 + f * 3);
    const [ex, ey] = proj([MS_GAT_HR, -2.5, -4]);
    const rand = rng(40 + f);
    for (let i = 0; i < 2; i++) {
      const x = Math.round(ex + 4 + i * 7 + rand() * 4), y = Math.round(ey + 2 + i * 5 + rand() * 4);
      if (msIn(x, y) && msIn(x + 2, y + 1)) { p.R(x, y, 3, 2, '#ab7622'); p.P(x, y, '#fff0b0'); p.P(x + 2, y + 1, '#744a12'); }
    }
  });
  sc.pop();
  return vmRender(sc);
}
const GAT_P = [0.4, -27, 62, 0.03], GAT_RH = { fwd: [0, -0.55, 1], arm: [8, -32, -18] }, GAT_LH = { arm: [-12, -42, -26] };

// ================================================================== dynamite allumée tenue dans la main droite
// Bâton de papier rouge (rayon 1.45), bandeau d'étiquette crème bordé de noir, bouts sertis, mèche torsadée qui sort du haut.
const MS_PAPER_END = vmMat('#7a1814');
const MS_INK = vmMatRamp(['#1a1010', '#2a1a16', '#3a2620', '#4a3428', '#5a4434']);
function msStick(sc, a, b, o = {}) {
  const L = vmLen(vmSub(b, a)), R = 1.45;
  sc.push(vmAlong(a, b));
  sc.cyl(VM_PAPER, R, L, { segs: 16 });
  // étiquette : bandeau crème, deux filets d'encre, pavé de texte sombre (« DYNAMITE ») côté œil
  const l0 = L * 0.5, lw = L * 0.3;
  sc.push(vmT(0, 0, l0)); sc.cyl(MS_LABEL, R + 0.05, lw, { segs: 16 }); sc.pop();
  for (const z of [l0 + 0.25, l0 + lw - 0.45]) { sc.push(vmT(0, 0, z)); sc.cyl(MS_INK, R + 0.08, 0.2, { segs: 16 }); sc.pop(); }
  for (let i = 0; i < 3; i++) {
    sc.push(vmChain(vmRz(o.face ?? 2.75), vmT(R + 0.06, 0, l0 + lw * (0.28 + i * 0.22)))); sc.box(MS_INK, 0.1, 1.5 - (i % 2) * 0.5, 0.36); sc.pop();
  }
  // bouts sertis (papier replié, plus sombre), bouchon de cire en haut
  for (const z of [-0.05, L - 0.7]) { sc.push(vmT(0, 0, z)); sc.cyl(MS_PAPER_END, R - 0.08, 0.75, { segs: 16 }); sc.pop(); }
  sc.push(vmT(0, 0, L + 0.05)); sc.ell(MS_PAPER_END, R - 0.25, R - 0.25, 0.35); sc.pop();
  // mèche : courbe qui part du centre du bout, torsade claire / sombre
  const fz = L + 0.2, fuse = [[0, 0, L - 0.2], [0.1, 0.25, fz + 0.9], [0.5, 0.8, fz + 1.9], [1.3, 1.1, fz + 2.6], [2.0, 0.9, fz + 3.0]];
  sc.tube(VM_FUSE, fuse, 0.26);
  const tip = vmP(sc.top(), fuse[fuse.length - 1]);
  sc.pop();
  return tip;
}
// Main droite qui serre le bâton (prise de torche) : repère courant, bâton dressé, mèche en haut
function msDynHold(sc, skin, cloth, o) {
  const b = [0, -6.8, 0], t = [0, 7.2, 0.4];
  const tip = msStick(sc, b, t, o);
  vmGrip(sc, [0, -6.6, 0.15], [0, -0.9, 0.3], { skin, cloth, fwd: [-1, 0, -0.25], rx: 1.5, rz: 1.5, web: 0.4, arm: [12, -22, -16] });
  return tip;
}
// Halo chaud et gerbe d'étincelles de la mèche (2 frames bien différentes)
function msFuseFx(p, x, y, f) {
  const P = (px, py, col) => { if (msIn(px, py)) p.P(Math.round(px), Math.round(py), col); };
  const rand = rng(90 + f * 13);
  for (let i = 0; i < 26; i++) {
    const a = rand() * MS_TAU, r = 2 + rand() * (f ? 5 : 4);
    if (rand() < 0.5) P(x + Math.cos(a) * r, y + Math.sin(a) * r * 0.8, rand() < 0.5 ? '#ff9a30' : '#e05a18');
  }
  msSparks(p, x, y, 3 + f * 7, f ? 1.35 : 1.0);
  // escarbilles qui retombent
  for (let i = 0; i < 4; i++) P(x + (rand() * 2 - 1) * 10, y + 3 + rand() * 9, rand() < 0.5 ? '#ffb030' : '#c85a18');
}
function msDynamiteView(state, frame, skin, cloth) {
  const sc = vmScene(), TU = msTune(skin);
  if (state === 'throw') {
    // lancer : bras tendu vers l'avant, main ouverte vue de dos (doigts vers l'avant), le bâton file au loin en tournoyant
    // main qui vient de lâcher : même prise que le repos, basculée vers l'avant, doigts entrouverts
    const T = TU.t || [5, -14, 40, -0.5, 0.6, 0.15];
    const H = vmChain(vmHold(T[0], T[1], T[2], T[3]), vmRx(T[4]), vmRy(T[5]));
    sc.push(H);
    vmGrip(sc, [0, -6.6, 0.15], [0, -0.9, 0.3], { skin, cloth, fwd: [-1, 0, -0.25], rx: 1.5, rz: 1.5, web: 0.4, curl: TU.curl ?? 0.5, arm: msToLocal(H, TU.arm || [16, -50, 4]) });
    sc.pop();
    const c = TU.c || [-8, -1.5, 120];
    sc.push(vmChain(vmT(c[0], c[1], c[2]), vmRz(-0.9), vmRx(0.6)));
    const tip = msStick(sc, [0, -6.8, 0], [0, 7.2, 0]);
    sc.pop();
    sc.fx((p) => {
      // traînée d'étincelles de la main au bâton, en arc
      const [hx, hy] = vmProj(vmP(H, [0, 1.5, 0])), [sx, sy] = vmProj(tip);
      const rand = rng(77);
      for (let i = 1; i < 22; i++) {
        const t = i / 22, x = hx + (sx - hx) * t + Math.sin(t * 11) * 1.2, y = hy + (sy - hy) * t - Math.sin(t * Math.PI) * 8;
        if (rand() < 0.8 && msIn(x, y)) p.P(Math.round(x), Math.round(y), t > 0.75 ? '#fff0a0' : t > 0.4 ? '#ffb030' : '#c85a18');
        if (rand() < 0.3 && msIn(x + 1, y + 2)) p.P(Math.round(x + 1), Math.round(y + 2), '#9a9088');
      }
      msFuseFx(p, sx, sy, 1);
    });
    return vmRender(sc);
  }
  const lit = state === 'lit';
  const f = lit ? frame % 2 : 0;
  const H = vmChain(vmHold(5.4, -18.8, 35, -0.2), vmRy(-0.12), vmRz(0.18 + (lit ? f * 0.02 : 0)), vmRx(-0.15 + (lit ? f * 0.02 : 0)));
  sc.push(H);
  const tip = msDynHold(sc, skin, cloth, {});
  sc.pop();
  sc.fx((p) => {
    const [x, y] = vmProj(tip);
    if (lit) {
      msFuseFx(p, x, y, f);
      msPuff(p, x - 2 + f * 2, y - 7, 4 + f, 4);
    } else {
      // mèche éteinte : bout noirci et filet de fumée froide
      p.P(Math.round(x), Math.round(y), '#2a2420'); p.P(Math.round(x) + 1, Math.round(y), '#4a3a30');
      for (let i = 0; i < 4; i++) { const px = Math.round(x + Math.sin(i * 1.7) * 1.2), py = Math.round(y - 3 - i * 2); if (msIn(px, py)) p.P(px, py, i % 2 ? '#bcb8b0' : '#d8d4cc'); }
    }
  });
  return vmRender(sc);
}

// ================================================================== rênes : deux poings, lanières de cuir, encolure du cheval
const MS_COAT = vmMat('#7a4626'), MS_MANE = vmMatRamp(['#0e0806', '#1c120c', '#2c1e14', '#40301e', '#5a4630']);
// Encolure, crinière et oreilles du cheval, vues de la selle (repère tenue) ; renvoie les deux anneaux du mors
function msHorse(sc, o = {}) {
  const dz = o.dz ?? 8, dy = o.dy ?? -7;
  const P = (x, y, z) => [x, y + dy, z + dz];
  // encolure qui fuit vers l'avant, puis le haut de la tête (nuque) entre les oreilles
  sc.caps(MS_COAT, P(0, -40, 34), P(0, -30.5, 76), 7.4, 5.8);
  sc.push(vmT(...P(0, -27.6, 80))); sc.ell(MS_COAT, 4.4, 3.4, 5.2, { same: true }); sc.pop();
  // crinière : mèches sombres le long du dessus de l'encolure, rabattues à droite
  for (let i = 0; i < 16; i++) {
    const t = i / 15, z = 38 + t * 38, y = -33.0 + t * 9.0;
    sc.push(vmChain(vmT(...P(1.6 + Math.sin(i * 2.3) * 0.5, y, z)), vmRz(-0.7 + Math.sin(i * 1.7) * 0.2)));
    sc.ell(MS_MANE, 1.9 - t * 0.6, 0.9, 1.8, { same: i > 0 });
    sc.pop();
  }
  // toupet entre les oreilles
  sc.push(vmChain(vmT(...P(0.3, -24.6, 81.5)), vmRx(-0.5))); sc.ell(MS_MANE, 1.4, 0.8, 2.0); sc.pop();
  // oreilles : cônes dressés, légèrement écartés et tournés vers l'avant, intérieur sombre
  for (const s of [-1, 1]) {
    const base = P(s * 2.5, -25.2, 82.5);
    sc.push(vmChain(vmT(...base), vmRz(-s * 0.32), vmRx(-Math.PI / 2 + 0.3)));
    sc.cyl(MS_COAT, 1.25, 5.2, { r2: 0.15, segs: 10 });
    sc.push(vmT(0, -0.55, 0.4)); sc.cyl(MS_MANE, 0.7, 3.6, { r2: 0.1, segs: 8 }); sc.pop();
    sc.pop();
  }
  return [P(-4.6, -31, 84), P(4.6, -31, 84)];
}
function msReinsView(state, frame, skin, cloth) {
  const sc = vmScene(), TU = msTune(skin);
  const H = vmHold(0.4, -13.5, 34);
  sc.push(H);
  const bits = msHorse(sc, TU.horse || {});
  // chaque poing : prise verticale autour de la rêne, pouce au-dessus, dos de main vers l'extérieur
  const fist = (s) => ({ b: [s * 6.6, -5.6, -0.6], t: [s * 5.9, -0.6, 0.4] });
  const R = fist(1), L = fist(-1);
  // rênes : sortent sous le poing (côté auriculaire) et filent vers l'anneau du mors de leur côté
  for (const [F, s, bit] of [[R, 1, bits[1]], [L, -1, bits[0]]]) {
    const low = vmLerp(F.b, F.t, -0.15);
    const mid = vmLerp(vmAdd(low, [-s * 0.6, -2.4, 1.6]), bit, 0.45);
    msStrap(sc, MS_REIN, [vmAdd(low, [0, 1.2, 0]), vmAdd(low, [-s * 0.6, -2.4, 1.6]), vmAdd(mid, [0, -3, 0]), bit], 1.4, 0.4);
  }
  // le bout libre passe sur l'index et pend entre les deux mains
  const topR = vmLerp(R.b, R.t, 1.12), topL = vmLerp(L.b, L.t, 1.12);
  msStrap(sc, MS_REIN, msSag(vmAdd(topR, [-0.4, 0.4, 0]), vmAdd(topL, [0.4, 0.4, 0]), 6.5, 10, -2.0), 1.4, 0.4);
  for (const [F, s] of [[R, 1], [L, -1]]) {
    vmGrip(sc, F.b, F.t, { skin, cloth, side: s, rx: 0.75, rz: 0.85, web: 0.3, fwd: [-s * 0.25, 0, 1], arm: [s * 13, -32, -22] });
  }
  sc.pop();
  return vmRender(sc);
}

// DEBUG (dev) : modèle seul vu sous un angle quelconque (TU.dbg = [lacet, tangage, zoom, distance])
function msDbgView(build, d) {
  const sc = vmScene();
  sc.push(vmChain(vmT(0, 0, d[3] || 80), vmS(d[2], d[2], d[2]), vmRx(d[1]), vmRy(d[0])));
  build(sc);
  sc.pop();
  return vmRender(sc);
}
function msViewModel(id, state, frame, skin, cloth) {
  try {
    const f = Number.isFinite(frame) ? Math.max(0, Math.floor(frame)) : 0;
    switch (id) {
      case 'derringer': {
        const st = state === 'fire' || state === 'reload' ? state : 'idle';
        return msDerringerView(st, st === 'fire' ? f % 2 : st === 'reload' ? f % 3 : 0, skin, cloth);
      }
      case 'gatling': {
        const st = state === 'fire' || state === 'reload' ? state : 'idle';
        return msGatlingView(st, st === 'fire' ? f % 4 : st === 'reload' ? f % 3 : 0, skin, cloth);
      }
      case 'dynamite': {
        const st = state === 'lit' || state === 'throw' ? state : 'idle';
        return msDynamiteView(st, st === 'lit' ? f % 2 : 0, skin, cloth);
      }
      case 'reins': return msReinsView('idle', 0, skin, cloth);
      default: return null;
    }
  } catch (e) {
    console.error('msViewModel', id, state, frame, e);
    return null;
  }
}

// ------------------------------------------------------------------ 8) armes en main : modèles
// Chaque arme est construite dans son propre repère (cm) : axe du canon selon +z, en y = 0, x = 0 ; origine au
// niveau de l'arrière du barillet ou de la culasse. vmAim() la place devant l'œil, canon vers le viseur.

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

// --- revolvers : Colt Single Action Army (acier bleui, carcasse jaspée, pontet laiton, crosse noyer)
//     et Smith & Wesson Schofield (nickelé, cadre à bascule, plaquettes noires)
const VM_CASE = vmMatRamp(['#262030', '#4e4452', '#7a6c72', '#ae9682', '#f4e0c4'], { spec: true });
// taches de trempe (bleu, paille) sur la carcasse jaspée du Colt
const VM_CASE_B = vmMatRamp(['#141a2a', '#2a3656', '#4a6090', '#7a98c8', '#e0ecff'], { spec: true });
const VM_CASE_S = vmMatRamp(['#2a1c0e', '#5a3e1c', '#967036', '#cca45c', '#fff4cc'], { spec: true });
function vmRevolver(sc, kind, o) {
  const nick = kind === 'schofield';
  const steel = nick ? VM_NICKEL : VM_BLUED, frame = nick ? VM_NICKEL : VM_CASE, hammerM = nick ? VM_NICKEL : VM_CASE;
  const guard = nick ? VM_NICKEL : VM_BRASS, strap = nick ? VM_NICKEL : VM_BRASS, grip = nick ? VM_RUBBER : VM_WALNUT;
  const L = nick ? 17.5 : 16.4;
  // barillet (sorti du cadre pendant le rechargement du Schofield)
  sc.push(vmChain(vmT(0, -1.15, 0.3), vmRz(o.spin || 0)));
  // barillet : arrière chanfreiné (prend la lumière vu de derrière), bague avant un peu plus large
  sc.cyl(steel, 1.75, 0.5, { segs: 24, r2: 2.24 });
  sc.push(vmT(0, 0, 0.5)).cyl(steel, 2.2, 3.5, { segs: 24, same: true }).pop();
  sc.push(vmT(0, 0, 3.6)).cyl(steel, 2.26, 0.4, { segs: 24, same: true }).pop();
  for (let k = 0; k < 6; k++) {
    // cannelures : sillons sombres entre les chambres, avec un liseré clair sur le bord éclairé
    const a = (k / 6) * Math.PI * 2 + Math.PI / 6;
    sc.push(vmChain(vmT(Math.cos(a) * 2.12, Math.sin(a) * 2.12, 2.05), vmRz(a)));
    sc.box(VM_DARK, 0.3, 0.72, 2.5);
    sc.pop();
    sc.push(vmChain(vmT(Math.cos(a + 0.2) * 2.2, Math.sin(a + 0.2) * 2.2, 2.05), vmRz(a + 0.2)));
    sc.box(nick ? VM_NICKEL : VM_STEEL, 0.06, 0.14, 2.5);
    sc.pop();
  }
  if (o.rounds) for (let k = 0; k < 6; k++) {
    // culots des cartouches à l'arrière du barillet
    const a = (k / 6) * Math.PI * 2;
    sc.push(vmT(Math.cos(a) * 1.25, Math.sin(a) * 1.25, -0.25));
    sc.cyl(k < o.rounds ? VM_BRASS : VM_DARK, 0.55, 0.3, { segs: 10 });
    sc.pop();
  }
  sc.pop();
  // carcasse : bouclier derrière le barillet, pont supérieur, avant du cadre
  sc.ext(frame, [[0.3, 1.25], [-0.7, 1.25], [-1.4, 0.45], [-2.2, -2.6], [-1.6, -3.5], [0.3, -3.6]], 2.7);
  sc.push(vmT(0, 1.0, 2.1)); sc.box(frame, 1.5, 0.75, 4.6, { same: true }); sc.pop();
  sc.push(vmT(0, -0.75, 4.75)); sc.box(frame, 2.4, 2.7, 0.9); sc.pop();
  sc.push(vmT(0, -3.55, 2.2)); sc.box(frame, 1.9, 0.75, 4.4, { same: true }); sc.pop();
  if (nick) {
    // loquet du cadre à bascule, devant le chien, avec la hausse (cran) dessus
    sc.push(vmT(0, 1.55, -0.2)); sc.box(VM_NICKEL, 1.6, 0.6, 1.1); sc.pop();
    for (const x of [-0.42, 0.42]) { sc.push(vmT(x, 1.98, -0.3)); sc.box(VM_NICKEL, 0.42, 0.34, 0.5); sc.pop(); }
  } else {
    // taches de trempe sur le dessus et l'arrière du cadre, hausse à cran au bout du pont
    for (const [x, y, z, w, d, m] of [[-0.35, 1.39, 1.2, 0.6, 1.2, VM_CASE_B], [0.4, 1.39, 3.1, 0.5, 1.0, VM_CASE_S], [0.1, 1.39, 3.9, 0.7, 0.6, VM_CASE_B]]) {
      sc.push(vmT(x, y, z)); sc.box(m, w, 0.02, d, { same: true }); sc.pop();
    }
    for (const x of [-0.45, 0.45]) { sc.push(vmT(x, 1.5, -0.35)); sc.box(VM_CASE, 0.4, 0.3, 0.5); sc.pop(); }
  }
  // canon, logement de la baguette d'éjection (plus fin, plus court, sous le canon à droite), guidon
  sc.push(vmT(0, 0, 4.4)); sc.cyl(steel, 0.8, L - 4.4, { segs: 14 }); sc.pop();
  sc.push(vmT(0, 0, L - 0.05)); sc.cyl(VM_DARK, 0.42, 0.12, { segs: 10 }); sc.pop();
  if (!nick) {
    sc.push(vmT(0.7, -1.0, 5.0)); sc.cyl(steel, 0.38, 8.4, { segs: 10 }); sc.pop();
    sc.push(vmT(0.7, -1.0, 13.4)); sc.ell(steel, 0.5, 0.5, 0.4); sc.pop();
  } else {
    sc.push(vmT(0, -0.95, 4.4)); sc.cyl(steel, 0.45, 2.6, { segs: 10 }); sc.pop();
  }
  sc.ext(steel, [[L - 1.3, 0.6], [L - 0.4, 0.6], [L - 0.5, 1.45], [L - 1.0, 1.45]], 0.3);
  // chien (relevé), détente, pontet
  if (o.hammer) sc.ext(hammerM, [[-0.5, 0.6], [-0.9, 1.9], [-1.8, 2.5], [-2.15, 2.15], [-1.5, 1.4], [-1.2, 0], [-0.5, -0.2]], 0.85);
  else sc.ext(hammerM, [[-0.4, 1.0], [-0.6, 1.75], [-1.5, 2.0], [-1.9, 1.7], [-1.5, 1.2], [-1.4, 0.2], [-0.5, 0.2]], 0.85);
  sc.ext(VM_STEEL, [[0.9, -3.6], [0.7, -4.6], [0.15, -5.15], [0.35, -4.3], [0.25, -3.6]], 0.45);
  sc.tube(guard, [[0, -3.75, 2.9], [0, -4.95, 2.65], [0, -5.7, 1.7], [0, -5.75, 0.2], [0, -5.1, -0.8], [0, -4.2, -1.15]], 0.34);
  // crosse : plaquettes et dos de crosse
  sc.ext(grip, [[-0.5, -3.5], [-1.9, -3.5], [-2.9, -4.7], [-3.9, -7.4], [-4.5, -10.4], [-4.3, -11.6], [-2.2, -11.9],
    [-1.1, -10.8], [-0.85, -8.0], [-0.4, -5.6], [0.4, -4.4]], 2.9);
  sc.ext(strap, [[-1.9, -3.4], [-2.4, -3.4], [-3.3, -4.6], [-4.4, -7.4], [-5.0, -10.4], [-4.8, -12.1],
    [-4.2, -12.0], [-4.4, -10.4], [-3.8, -7.4], [-2.8, -4.7]], 1.9);
  sc.push(vmT(0, -11.95, -3.2)); sc.box(strap, 1.9, 0.5, 2.6, { same: true }); sc.pop();
  if (o.gate) {
    // portière ouverte (dessinée du côté que montre le rechargement) : encoche sombre dans le bouclier, culot de la
    // cartouche dans la chambre, volet rabattu vers l'extérieur
    sc.push(vmT(-1.2, -1.15, -1.95)); sc.box(VM_DARK, 1.15, 1.2, 0.3); sc.pop();
    if (o.gate === 'full') { sc.push(vmT(-1.2, -1.15, -2.14)); sc.cyl(VM_BRASS, 0.5, 0.06, { segs: 10 }); sc.pop(); }
    sc.push(vmChain(vmT(-1.8, -1.15, -1.9), vmRy(-1.1))); sc.box(frame, 0.2, 1.1, 1.0); sc.pop();
  }
}
// Repère de la crosse du revolver, vu par la main (bas → haut) et points utiles
const VM_REV_GRIP = { b: [0, -11.0, -3.1], t: [0, -4.9, -1.25], trigger: [0, -4.75, 0.45], thumb: [-1.75, -2.4, 1.6] };

function vmRevolverView(id, state, frame, skin, cloth) {
  const sc = vmScene();
  const fire = state === 'fire', rel = state === 'reload';
  const kick = fire ? (frame === 0 ? 1 : 0.35) : 0;
  // tenue : main droite basse à droite, canon vers le viseur ; recul = le canon se relève autour de la main
  let hold = vmChain(vmHold(0.27, -10.9, 22.6, 0), vmRx(0.08), vmT(0, -8, -2), vmRx(-0.13 * kick), vmT(0, 8, 2 - 0.5 * kick));
  if (rel) {
    // rechargement : l'arme se relève canon en l'air et bascule vers le centre, flanc gauche et barillet face à nous
    const t = [0.75, 0.9, 0.4][frame] ?? 1;
    hold = vmChain(vmHold(0.27 - 0.9 * t, -11.8 - 2.5 * t, 23.5 + 3.6 * t, -0.55 * t), vmRy(-0.2 * t), vmT(0, -8, -2), vmRx(-0.3 * t), vmT(0, 8, 2));
  }
  sc.push(hold);
  const G = VM_REV_GRIP;
  if (id === 'schofield' && rel) {
    // cadre basculé : canon et barillet pivotent vers le bas autour de la charnière avant
    sc.push(vmChain(vmT(0, -3.4, 4.8), vmRx(0.6 * (frame === 1 ? 1 : 0.7)), vmT(0, 3.4, -4.8)));
    vmRevolver(sc, id, { rounds: frame + 3 });
    sc.pop();
  } else vmRevolver(sc, id, { rounds: rel ? 2 + frame * 2 : 0, spin: rel ? frame * 0.5 : 0, hammer: fire && frame === 1, gate: rel ? (frame === 0 ? 'empty' : 'full') : null });
  vmGrip(sc, G.b, G.t, { skin, cloth, rx: 1.45, rz: 1.35, web: 2.2, trigger: G.trigger, thumb: G.thumb, arm: [1, -36, -16] });
  if (fire) sc.fx((p, proj) => {
    const [mx, my] = proj([0, 0, (id === 'schofield' ? 17.5 : 16.4) + 0.6]);
    if (frame === 0) vmFlash(p, mx, my, 15, 3);
    else vmSmoke(p, mx, my - 2, 1);
  });
  sc.pop();
  if (rel && frame < 2) {
    // main gauche : une cartouche entre le pouce et l'index, poussée dans la chambre de gauche du barillet
    const back = frame === 0 ? 4.5 : 1.2;
    const cart = vmP(hold, [-1.25, -1.15, -back]), ax = vmUnit(vmSub(vmP(hold, [-1.25, -1.15, 1]), vmP(hold, [-1.25, -1.15, 0])));
    sc.push(vmAlong(cart, vmAdd(cart, ax)));
    sc.cyl(VM_BRASS, 0.55, 2.4, { segs: 10 });
    sc.push(vmT(0, 0, -0.15)).cyl(VM_BRASS, 0.68, 0.18, { segs: 10 }).pop();
    sc.pop();
    const side = vmUnit(vmCross(ax, [0, 1, 0]));
    vmGrip(sc, vmSub(cart, vmK(ax, 2.6)), vmSub(cart, vmK(ax, 0.6)), {
      skin, cloth, side: -1, rx: 0.75, rz: 0.75, fwd: side, curl: 0.8, arm: [-16, -40, 6],
    });
  }
  return vmRender(sc);
}

export function viewModel(id, state, frame, skin, cloth) {
  return memo(`vm3:${id}:${state}:${frame}:${skin}:${cloth}`, () => {
    // armes blanches (melee.js), armes longues (longguns3d.js), divers (misc3d.js) : null si l'id n'est pas à eux
    for (const f of [typeof knViewModel === 'function' && knViewModel, typeof lgViewModel === 'function' && lgViewModel,
      typeof msViewModel === 'function' && msViewModel]) {
      const k = f && f(id, state, frame, skin, cloth);
      if (k) return k;
    }
    switch (id) {
      case 'colt': case 'schofield':
        return vmRevolverView(id, state === 'fire' || state === 'reload' ? state : 'idle', state === 'fire' ? frame % 2 : state === 'reload' ? frame % 3 : 0, skin, cloth);
      default: return checker(160, 120);
    }
  });
}

// ------------------------------------------------------------------ 5) objets à ramasser  6) décor  7) effets
// Origine des sprites au centre du bas (x vers la droite, y négatif vers le haut ; la rangée y = 0 est le sol).

// Rampes de couleurs, de la plus sombre à la plus claire
const PR_WOOD = ['#3a2010', '#5a3418', '#7a4a24', '#a8703c', '#c8925a', '#e8b880'];
const PR_GREY = ['#2a2018', '#43362a', '#62503c', '#806a50', '#a08a6a', '#c4ae8a']; // bois délavé
const PR_DARKW = ['#1e120a', '#32200f', '#4a2e18', '#644024', '#7e5434', '#9a6c48']; // bois de cercueil
const PR_IRON = ['#24282e', '#3e434c', '#5c626c', '#8a8f98', '#b8bec6', '#e8ecf0'];
const PR_GOLD = ['#5a3408', '#8a5a10', '#c08818', '#e0b040', '#f8e08a', '#fffbe0'];
const PR_RED = ['#3a0a08', '#6a1410', '#9a2418', '#c0392b', '#e8604c', '#ffa080'];
const PR_AMBER = ['#2e1404', '#5a2a06', '#8a4a0c', '#b86e14', '#e09a30', '#f8d070'];
const PR_STONE = ['#2e2e34', '#4a4a52', '#6a6a72', '#8e8e94', '#b4b2b0', '#d8d4cc'];
const PR_GREEN = ['#16301a', '#244a24', '#36662e', '#4a823a', '#6aa04a', '#9ac868'];
const PR_AGAVE = ['#1a3430', '#2a5048', '#407060', '#5a9078', '#80b090', '#b0d4a8'];
const PR_STRAW = ['#5a4018', '#8a6428', '#b08a38', '#d0aa48', '#e8c868', '#f8e8a0'];
const PR_BURLAP = ['#3a2a14', '#5e4422', '#866434', '#ac8a4c', '#ccaa6a', '#e8cc90'];
const PR_CREAM = ['#6a5a40', '#9a8a68', '#c0b090', '#ddd0b0', '#efe6cc', '#fffaf0'];
const PR_LEATHER = ['#24100a', '#3e1c0e', '#5e2c14', '#80401e', '#a2582c', '#c47c48'];
const PR_TERRA = ['#3a140a', '#6a2c14', '#9a4422', '#c0602e', '#dc8048', '#f0a870'];
const PR_TEAL = ['#1a2a30', '#2a4048', '#3e5a62', '#56767a', '#729294', '#98b4b0'];
const PR_SMOKE = ['#2a2624', '#46403c', '#6a625c', '#8e8680', '#b4aca4', '#dcd6cc'];
const PR_FIRE = ['#4a0c06', '#8a1a0a', '#d03a0c', '#f87818', '#f8b830', '#fff070', '#fffbe8'];
const PR_BLOOD = ['#2a0404', '#520808', '#7a0e0c', '#a81812', '#d02a1c', '#f05038'];
const PR_SAND = ['#5a4628', '#7e6640', '#a88a5a', '#c8aa76', '#e0c896', '#f4e4bc'];

const prPick = (ramp, t) => ramp[clamp(Math.round(t * (ramp.length - 1)), 0, ramp.length - 1)];
// Lumière d'un cylindre vertical éclairé en haut à gauche : t ∈ [0,1] sur la largeur → 0..1
const prLit = (t) => clamp(1 - Math.abs(t - 0.3) * 1.6, 0, 1) * 0.92 + 0.04;
// Colonnes d'un cylindre vertical (k : décalage de lumière)
function prCyl(p, x, y, w, h, ramp, k = 0) {
  for (let i = 0; i < w; i++) p.R(x + i, y, 1, h, prPick(ramp, prLit((i + 0.5) / w) + k));
}
// Anneau (ellipse si sx ≠ 1) entre les rayons r0 et r1 ; col(angle, rayon) donne la couleur (null : rien)
function prRing(p, cx, cy, r0, r1, col, sx = 1) {
  const n = Math.ceil(r1) + 1;
  for (let dy = -n; dy <= n; dy++) for (let dx = -n; dx <= n; dx++) {
    const d = Math.hypot(dx / sx, dy);
    if (d < r0 || d >= r1) continue;
    const k = col(Math.atan2(dy, dx / sx), d);
    if (k) p.P(cx + dx, cy + dy, k);
  }
}
// Halo de lumière tramé autour de (cx, cy) dans les pixels encore vides (après le contour)
function prGlow(c, cx, cy, r, cols, dens = 0.5) {
  const ctx = c.getContext('2d');
  const img = ctx.getImageData(0, 0, c.width, c.height);
  const d = img.data;
  const X = (c.width >> 1) + cx, Y = c.height - 1 + cy;
  for (let y = Math.max(0, Math.floor(Y - r)); y <= Math.min(c.height - 1, Y + r); y++) for (let x = Math.max(0, Math.floor(X - r)); x <= Math.min(c.width - 1, X + r); x++) {
    const i = (y * c.width + x) * 4, t = Math.hypot(x - X, y - Y) / r;
    if (d[i + 3] || t >= 1 || prB(x, y) > (1 - t) * dens) continue;
    const n = parseInt(prPick(cols, 1 - t).slice(1), 16);
    d[i] = n >> 16; d[i + 1] = (n >> 8) & 255; d[i + 2] = n & 255; d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}
// Bruit reproductible par pixel
const prN = (x, y, s = 0) => {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 982451653)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
};
// Seuils de Bayer 4x4 (tramage : l'alpha est tout ou rien)
const PR_BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const prB = (x, y) => (PR_BAYER[(((y % 4) + 4) % 4) * 4 + (((x % 4) + 4) % 4)] + 0.5) / 16;
// Scintillement : petite croix claire qui attire l'œil sur les objets à ramasser
function prTwinkle(p, x, y, big = false) {
  const s = '#fffbe8';
  p.R(x - 1, y, 3, 1, s); p.R(x, y - 1, 1, 3, s); p.P(x, y, '#ffffff');
  if (big) { p.P(x - 2, y, '#f8e08a'); p.P(x + 2, y, '#f8e08a'); p.P(x, y - 2, '#f8e08a'); p.P(x, y + 2, '#f8e08a'); }
}
// Grille de pixels locale (pour les objets tournés) : g.R(x, y, w, h, ch) remplit des cases
function prGrid(w, h) {
  const a = Array.from({ length: h }, () => new Array(w).fill(null));
  const R = (x, y, ww, hh, ch) => { for (let j = y; j < y + hh; j++) for (let i = x; i < x + ww; i++) if (a[j] && i >= 0 && i < w) a[j][i] = ch; };
  return { a, w, h, R, P: (x, y, ch) => R(x, y, 1, 1, ch) };
}
// Échantillonne la grille tournée de ang autour du pivot (px, py) → liste de pixels [x, y, couleur] autour de (cx, cy)
function prRot(g, pal, cx, cy, ang, px = g.w / 2, py = g.h / 2) {
  const out = [];
  const r = Math.ceil(Math.hypot(Math.max(px, g.w - px), Math.max(py, g.h - py))) + 1;
  const co = Math.cos(ang), si = Math.sin(ang);
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    const u = co * dx + si * dy, v = -si * dx + co * dy;
    const lx = Math.floor(px + u), ly = Math.floor(py + v);
    if (ly < 0 || ly >= g.h || lx < 0 || lx >= g.w) continue;
    const ch = g.a[ly][lx];
    if (ch && pal[ch]) out.push([cx + dx, cy + dy, pal[ch]]);
  }
  return out;
}
// Pose des listes de pixels ; ground : décale pour que le pixel le plus bas tombe sur y = 0
function prBlit(p, lists, ground = false, dx = 0) {
  const all = lists.flat();
  const dy = ground ? -Math.max(...all.map((q) => q[1])) : 0;
  for (const [x, y, col] of all) p.P(x + dx, y + dy, col);
}
// Champ de « boules » (fumée, feu, sang) : somme de bosses lisses
function prField(blobs, x, y) {
  let v = 0;
  for (const [bx, by, br, k = 1] of blobs) {
    const d = ((x - bx) ** 2 + (y - by) ** 2) / (br * br);
    if (d < 1) v += (1 - d) ** 2 * k;
  }
  return v;
}

// ================================================================== 5) OBJETS À RAMASSER
// Caisse de ravitaillement : planches, bande rouge et or, médaillon « ? »
function prCrate() {
  return sprite(32, 28, (p, c) => {
    const { R, P, line, disc, poly } = p;
    // dessus (vue légèrement plongeante) et flanc droit
    poly([[-14, -22], [12, -22], [15, -25], [-11, -25]], PR_WOOD[4]);
    for (const x of [-7, 0, 6]) line(x, -22, x + 3, -25, PR_WOOD[3]);
    R(-11, -25, 25, 1, PR_WOOD[5]);
    poly([[12, -22], [15, -25], [15, -3], [12, 1]], PR_WOOD[1]);
    line(13, -21, 13, -1, PR_WOOD[2]);
    // face avant : planches horizontales
    R(-14, -22, 26, 23, PR_WOOD[3]);
    for (let y = -19; y <= -2; y += 4) { R(-14, y, 26, 1, PR_WOOD[2]); R(-14, y + 1, 26, 1, PR_WOOD[4]); }
    grain(c, 0, 0, c.width, c.height, rng(31), 0.1, 0.4);
    // cadre de planches épaisses
    for (const [x, y, w, h] of [[-14, -22, 26, 3], [-14, -2, 26, 3], [-14, -22, 3, 23], [9, -22, 3, 23]]) {
      R(x, y, w, h, PR_WOOD[4]); R(x, y + h - 1, w, 1, PR_WOOD[2]); R(x + w - 1, y, 1, h, PR_WOOD[2]);
    }
    R(-14, -22, 26, 1, PR_WOOD[5]); R(-14, -22, 1, 23, PR_WOOD[5]);
    // bande rouge bordée d'or
    R(-14, -14, 26, 7, PR_RED[3]); R(-14, -14, 26, 1, PR_RED[4]); R(-14, -8, 26, 1, PR_RED[2]);
    R(-14, -15, 26, 1, PR_GOLD[3]); R(-14, -7, 26, 1, PR_GOLD[2]);
    R(12, -14, 1, 7, PR_RED[1]); R(13, -15, 2, 7, PR_RED[1]);
    // clous aux coins
    for (const [x, y] of [[-13, -21], [10, -21], [-13, -1], [10, -1]]) P(x, y, PR_IRON[4]);
    // médaillon or avec « ? »
    disc(-1, -11, 7, PR_GOLD[1]); disc(-1, -11, 6, PR_GOLD[3]); disc(-2, -12, 5, PR_GOLD[4]); disc(-1, -11, 4, PR_GOLD[3]);
    text(R, '?', -4, -16, PR_RED[1], 2);
    P(-5, -16, PR_GOLD[5]); P(-6, -14, PR_GOLD[5]);
    prTwinkle(p, -9, -20, true);
  });
}

// Boîte de cartouches ouverte, balles de laiton qui dépassent
function prAmmo() {
  return sprite(24, 24, (p) => {
    const { R, P, poly } = p;
    // couvercle rabattu en arrière (intérieur carton)
    poly([[-9, -11], [9, -11], [10, -19], [-7, -19]], '#c8a070');
    poly([[-9, -11], [-7, -19], [-5, -19], [-7, -11]], '#e0c090');
    R(-7, -19, 17, 1, PR_RED[3]);
    // intérieur sombre
    R(-9, -13, 18, 2, '#3a1a0e');
    // balles
    [-8, -5, -2, 1, 4, 7].forEach((x, i) => {
      const top = -15 - (i % 2) - (i === 3 ? 1 : 0);
      R(x, top + 2, 2, -top - 12, PR_GOLD[3]); R(x, top + 2, 1, -top - 12, PR_GOLD[4]);
      R(x, top, 2, 2, '#c07038'); P(x, top, '#f0b080');
    });
    // boîte rouge
    R(-9, -10, 18, 11, PR_RED[3]); R(-9, -10, 18, 1, PR_RED[4]); R(-9, -10, 1, 11, PR_RED[4]); R(8, -10, 1, 11, PR_RED[2]); R(-9, 0, 18, 1, PR_RED[1]);
    // étiquette crème « AMMO »
    R(-8, -8, 16, 7, PR_CREAM[4]); R(-8, -2, 16, 1, PR_CREAM[2]);
    text(R, 'AMMO', -7, -7, '#2a1410');
    // cartouche couchée devant
    R(-11, -1, 4, 2, PR_GOLD[3]); R(-11, -1, 4, 1, PR_GOLD[4]); R(-7, -1, 2, 2, '#c07038');
    prTwinkle(p, -6, -21);
  });
}

// Bouteille de whisky ambrée, étiquette « XXX »
function prWhisky() {
  return sprite(24, 24, (p) => {
    const { R, P } = p;
    // bouchon, goulot, épaules
    R(-2, -22, 4, 2, '#c8925a'); R(-2, -22, 4, 1, '#e8b880'); P(1, -21, '#8a5a2c');
    prCyl(p, -2, -20, 4, 5, PR_AMBER);
    for (let y = -16, w = 6; y <= -13; y++, w += 2) prCyl(p, -(w >> 1), y, w, 1, PR_AMBER, -0.1);
    // panse : verre vide en haut, liquide dessous
    prCyl(p, -6, -12, 12, 13, PR_AMBER);
    prCyl(p, -6, -12, 12, 3, PR_AMBER, -0.25);
    R(-6, -9, 12, 1, PR_AMBER[5]);
    // étiquette
    prCyl(p, -6, -8, 12, 7, PR_CREAM);
    R(-6, -8, 12, 1, '#c0392b'); R(-6, -2, 12, 1, '#c0392b');
    text(R, 'XXX', -5, -7, '#8a1a14');
    R(-6, 0, 12, 1, PR_AMBER[1]);
    // reflets
    R(-4, -12, 1, 3, '#fff0c0'); R(-1, -19, 1, 3, '#f8e0a0'); P(-4, -1, '#f8d070');
    prTwinkle(p, -8, -16);
  });
}

// Trousse de soins : boîte en fer blanc à croix rouge + rouleau de bande
function prBandage() {
  return sprite(24, 24, (p) => {
    const { R, P, disc } = p;
    // boîte
    R(-10, -12, 15, 13, PR_CREAM[4]); R(-10, -12, 15, 1, PR_CREAM[5]); R(4, -12, 1, 13, PR_CREAM[2]); R(-10, 0, 15, 1, PR_CREAM[2]);
    R(-10, -12, 15, 3, PR_IRON[4]); R(-10, -12, 15, 1, PR_IRON[5]); R(-10, -10, 15, 1, PR_IRON[2]); // couvercle
    R(-4, -13, 3, 1, PR_IRON[2]); // fermoir
    R(-4, -8, 3, 7, PR_RED[3]); R(-7, -6, 9, 3, PR_RED[3]); R(-4, -8, 3, 1, PR_RED[4]); R(-7, -6, 3, 1, PR_RED[4]); R(-1, -4, 3, 1, PR_RED[2]);
    // rouleau de bande vu par la tranche, la bande déroulée par terre
    R(2, -1, 9, 2, PR_CREAM[4]); R(2, -1, 9, 1, PR_CREAM[5]); P(10, -1, PR_CREAM[2]);
    disc(5, -5, 5, PR_CREAM[3]); disc(5, -5, 4, PR_CREAM[4]); disc(4, -6, 3, PR_CREAM[5]);
    disc(5, -5, 2, PR_CREAM[2]); disc(5, -5, 1, '#8a7a60');
    P(2, -8, '#ffffff'); P(3, -9, '#ffffff');
    P(6, -9, PR_CREAM[2]); P(8, -7, PR_CREAM[2]);
    prTwinkle(p, -8, -15);
  });
}

// Gilet de cuir clouté : boutons de laiton, chaîne de montre
const PR_VEST = ['#3a1a0c', '#62321a', '#8e5028', '#b4723a', '#d49456', '#f0b878'];
function prVest() {
  return sprite(24, 24, (p) => {
    const { R, P, poly, line } = p;
    // cuir fauve plus clair que le parquet, doublure de satin rouge : l'objet ressort même la nuit
    R(-4, -21, 8, 14, '#8a1e16'); R(-4, -21, 8, 2, '#b8301e'); R(-1, -19, 2, 10, '#5a100c'); // doublure rouge dans l'encolure
    const half = [[-0.5, -8], [-3.5, -21], [-6.5, -21], [-6.5, -19], [-7.5, -16], [-10, -14], [-10.5, -12], [-10.5, -1], [-9, 0.5], [-1.5, 1.5], [-0.5, -1]];
    poly(half, PR_VEST[3]);
    poly(half.map(([x, y]) => [-x - 1, y]), PR_VEST[2]);
    // modelé : bords clairs à gauche, sombres à droite
    for (let y = -12; y <= -1; y++) { P(-10, y, PR_VEST[4]); P(-9, y, PR_VEST[4]); P(9, y, PR_VEST[1]); }
    line(-6, -20, -9, -14, PR_VEST[5]); line(5, -20, 8, -14, PR_VEST[1]);
    R(-6, -21, 3, 1, PR_VEST[5]); R(3, -21, 3, 1, PR_VEST[4]);
    line(-1, -9, -3, -20, PR_VEST[5]); line(-2, -9, -4, -18, PR_VEST[4]); line(0, -9, 2, -20, PR_VEST[1]);
    R(-1, -8, 1, 9, PR_VEST[1]); R(0, -8, 1, 9, PR_VEST[0]);
    // revers
    line(-3, -18, -6, -13, PR_VEST[2]); line(2, -18, 5, -13, PR_VEST[1]);
    // clous de laiton le long de l'ourlet
    for (let x = -8; x <= 7; x += 3) P(x, -1, x < 0 ? PR_GOLD[4] : PR_GOLD[2]);
    // poches à rabat
    R(-8, -7, 5, 4, PR_VEST[2]); R(-8, -7, 5, 1, PR_VEST[5]); P(-6, -6, PR_GOLD[3]);
    R(3, -7, 5, 4, PR_VEST[1]); R(3, -7, 5, 1, PR_VEST[3]); P(5, -6, PR_GOLD[2]);
    // chaîne de montre en or
    for (const [x, y] of [[-2, -10], [-3, -9], [-4, -9], [-5, -8], [-6, -8]]) P(x, y, PR_GOLD[(x & 1) ? 4 : 3]);
    // boutons
    for (const y of [-14, -10, -6]) { P(-1, y, PR_GOLD[5]); P(-1, y + 1, PR_GOLD[2]); }
    prTwinkle(p, -8, -20);
  });
}

// Fagot de trois bâtons de dynamite, bande « TNT », mèche
function prDynamite() {
  return sprite(24, 24, (p) => {
    const { R, P, line } = p;
    for (const x of [-8, 3]) { prCyl(p, x, -15, 5, 15, PR_RED); R(x, -15, 5, 1, '#e8c8a0'); R(x + 1, -15, 3, 1, '#f8e0c0'); }
    prCyl(p, -3, -16, 6, 17, PR_RED, 0.05); R(-3, -16, 6, 1, '#e8c8a0'); R(-2, -16, 4, 1, '#f8e0c0'); P(0, -16, '#5a4a3a');
    // ficelle et bande de papier
    R(-8, -12, 16, 1, '#c8a060'); R(-8, -2, 16, 1, '#c8a060');
    prCyl(p, -8, -9, 16, 6, PR_CREAM);
    text(R, 'TNT', -5, -8, '#2a1410');
    // mèche en boucle
    line(0, -17, 1, -19, '#7a6a58'); line(1, -19, 3, -20, '#7a6a58'); line(3, -20, 2, -22, '#7a6a58');
    P(2, -18, '#a89880'); P(3, -21, '#a89880'); P(1, -22, '#2a2018');
    prTwinkle(p, -7, -19);
  });
}

// Étoile de shérif à six branches boulées, facettes en relief
function prStar() {
  return sprite(24, 24, (p) => {
    const { P, disc, poly, R } = p;
    const cx = -0.5, cy = -10.5, RO = 9, RI = 4.5;
    for (let i = 0; i < 6; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 3;
      const T = [cx + Math.cos(a) * RO, cy + Math.sin(a) * RO];
      for (const s of [-1, 1]) {
        const b = a + (s * Math.PI) / 6;
        const V = [cx + Math.cos(b) * RI, cy + Math.sin(b) * RI];
        const n = a + s * 0.9; // normale de la facette, lumière en haut à gauche
        const lum = 0.5 + 0.55 * (Math.cos(n) * -0.7 + Math.sin(n) * -0.7);
        poly([[cx, cy], T, V], prPick(PR_GOLD, 0.25 + lum * 0.7));
      }
    }
    for (let i = 0; i < 6; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 3;
      const x = cx + Math.cos(a) * (RO + 0.6), y = cy + Math.sin(a) * (RO + 0.6);
      disc(x, y, 1.6, PR_GOLD[2]); P(Math.round(x) - 1, Math.round(y) - 1, PR_GOLD[4]); P(Math.round(x), Math.round(y) - 1, PR_GOLD[3]);
    }
    disc(cx, cy, 3.2, PR_GOLD[1]); disc(cx, cy, 2.3, PR_GOLD[3]); P(-2, -12, PR_GOLD[5]); P(-1, -12, PR_GOLD[4]);
    R(-1, -11, 1, 1, PR_GOLD[1]);
    prTwinkle(p, -6, -17, true);
  });
}

// Roue à rayons (cx, cy, rayon) : bandage de fer, jante, rayons, moyeu
function prSpokeWheel(p, cx, cy, r, wood = PR_WOOD, spokes = 8, sx = 1) {
  prRing(p, cx, cy, r - 1, r + 0.5, (a) => (a > 2.2 || a < -2.4 ? PR_IRON[4] : PR_IRON[2]), sx);
  prRing(p, cx, cy, r - 2.2, r - 1, (a) => (a > -2.6 && a < -0.6 ? wood[4] : wood[2]), sx);
  for (let k = 0; k < spokes; k++) {
    const a = (k * 2 * Math.PI) / spokes + 0.2;
    p.line(cx, cy, cx + Math.cos(a) * (r - 2) * sx, cy + Math.sin(a) * (r - 2), wood[3]);
  }
  p.disc(cx, cy, Math.max(1, r * 0.22), wood[1]); p.P(cx - 1, cy - 1, wood[4]); p.P(cx, cy, PR_IRON[3]);
}

// Mitrailleuse Gatling miniature sur son affût à roue
function prGatling() {
  return sprite(32, 26, (p) => {
    const { R, P, line } = p;
    // affût : roue derrière le canon (le carter la masque en partie), flèche posée au sol
    line(-6, -9, -14, 0, PR_WOOD[1], 3); line(-7, -10, -14, -2, PR_WOOD[3]); // flèche d'affût
    prSpokeWheel(p, -3, -8, 7.5, PR_WOOD, 8);
    p.disc(-3, -8, 1.5, PR_GOLD[2]); P(-4, -9, PR_GOLD[5]);
    for (const [y, k] of [[-17, 0.15], [-15, 0], [-13, -0.15]]) { R(-2, y, 16, 1, prPick(PR_IRON, 0.7 + k)); R(-2, y + 1, 16, 1, PR_IRON[1]); }
    R(-2, -17, 16, 1, PR_IRON[5]);
    for (const x of [4, 11]) { R(x, -18, 2, 7, PR_GOLD[3]); R(x, -18, 2, 1, PR_GOLD[5]); R(x + 1, -18, 1, 7, PR_GOLD[2]); }
    R(14, -17, 1, 6, PR_IRON[1]); P(14, -16, '#000000'); P(14, -14, '#000000'); P(14, -12, '#000000');
    // carter de laiton, chargeur, manivelle
    R(-11, -18, 9, 8, PR_GOLD[3]); R(-11, -18, 9, 1, PR_GOLD[5]); R(-11, -18, 1, 8, PR_GOLD[4]); R(-3, -18, 1, 8, PR_GOLD[1]); R(-11, -11, 9, 1, PR_GOLD[1]);
    R(-9, -16, 5, 4, PR_GOLD[2]); R(-9, -16, 5, 1, PR_GOLD[4]);
    R(-8, -24, 4, 6, PR_GOLD[2]); R(-8, -24, 4, 1, PR_GOLD[5]); R(-8, -24, 1, 6, PR_GOLD[4]);
    line(-12, -14, -14, -17, PR_IRON[3]); R(-15, -19, 2, 3, PR_WOOD[3]);
    prTwinkle(p, 9, -21, true);
  });
}

// Colt dessiné à 45° (crosse en bas à gauche, canon vers le haut à droite), décalé de dx
function prColt(p, grip, dx = 0) {
  const { R, P, line, poly, disc } = p;
  const X = (x) => x + dx;
  const st = PR_COLT_PAL;
  poly([[X(-14), -2], [X(-11), 1], [X(-7), -3], [X(-10), -6]], grip[1]);
  line(X(-13), -2, X(-10), -5, grip[2]); line(X(-10), 0, X(-7), -3, grip[0]);
  P(X(-12), -1, grip[2]);
  poly([[X(-10), -6], [X(-7), -3], [X(-4), -6], [X(-7), -9]], st.M);
  line(X(-9), -7, X(-7), -9, st.L);
  // pontet et détente
  P(X(-6), -3, st.B); P(X(-5), -3, st.B); P(X(-4), -4, st.B); P(X(-6), -4, st.D);
  // chien
  line(X(-8), -10, X(-10), -12, st.D); P(X(-11), -12, st.D);
  // canon
  line(X(-3), -12, X(8), -23, st.L); line(X(-3), -11, X(8), -22, st.M); line(X(-2), -11, X(9), -22, st.M); line(X(-2), -10, X(5), -17, st.D);
  P(X(9), -23, st.D); P(X(7), -24, st.D);
  // barillet
  disc(X(-5), -9, 2.6, st.C); P(X(-6), -11, st.L); P(X(-7), -10, st.L); P(X(-5), -9, st.D); P(X(-4), -8, st.D); P(X(-6), -8, st.D); P(X(-4), -10, st.D);
}
const PR_COLT_PAL = { L: '#f0f4f8', M: '#a4aab2', D: '#30343c', C: '#7a8088', B: '#e0b040' };

// Deux colts croisés : le second en miroir, un liseré sombre les sépare
function prAkimbo() {
  const W = 30, H = 28;
  const a = canvas(W, H), b = canvas(W, H);
  prColt(pen(a, W >> 1, H - 1), ['#b8a888', '#f0e6cc', '#ffffff']);
  prColt(pen(b, W >> 1, H - 1), ['#6a3a1a', '#a8703c', '#d09a62']);
  const bm = mirror(b);
  const c = canvas(W, H), ctx = c.getContext('2d');
  ctx.drawImage(bm, 0, 0);
  const da = a.getContext('2d').getImageData(0, 0, W, H).data;
  const img = ctx.getImageData(0, 0, W, H), d = img.data;
  const on = (x, y) => x >= 0 && y >= 0 && x < W && y < H && da[(y * W + x) * 4 + 3] > 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    if (d[i + 3] && !on(x, y) && (on(x + 1, y) || on(x - 1, y) || on(x, y + 1) || on(x, y - 1))) { d[i] = 26; d[i + 1] = 15; d[i + 2] = 10; }
  }
  ctx.putImageData(img, 0, 0);
  ctx.drawImage(a, 0, 0);
  prTwinkle(pen(c, W >> 1, H - 1), -11, -22, true);
  return finish(c);
}

// Winchester dorée (grille 34x9, canon vers la droite)
function prGoldWin() {
  return sprite(32, 28, (p) => {
    const g = prGrid(34, 9);
    g.R(16, 1, 18, 1, 'Y'); g.R(16, 2, 18, 1, 'G'); g.P(33, 1, 'D'); g.P(33, 2, 'D'); g.P(31, 0, 'D');
    g.R(16, 3, 15, 1, 'g'); g.R(31, 3, 2, 1, 'G');
    g.R(16, 3, 8, 2, 'w'); g.R(16, 3, 8, 1, 'v'); g.R(16, 4, 8, 1, 'W');
    g.R(10, 1, 7, 5, 'G'); g.R(10, 1, 7, 1, 'Y'); g.R(10, 5, 7, 1, 'g'); g.P(11, 2, 'H'); g.P(12, 3, 'e'); g.P(14, 3, 'e'); g.P(13, 4, 'e'); g.P(15, 2, 'e');
    g.P(10, 0, 'D'); g.P(9, 0, 'D');
    g.R(10, 6, 5, 1, 'G'); g.P(9, 7, 'G'); g.P(14, 7, 'G'); g.R(10, 8, 4, 1, 'G'); g.P(12, 6, 'D');
    for (let x = 0; x <= 9; x++) {
      const t = 1 + Math.round(x * 0.12), b = 7 - Math.round(x * 0.22);
      g.R(x, t, 1, b - t + 1, 'w'); g.P(x, t, 'v'); g.P(x, b, 'W');
    }
    g.R(0, 1, 1, 7, 'G');
    const pal = { Y: '#fff0a0', G: '#e8b838', g: '#a87010', D: '#5a3408', e: '#a87010', H: '#ffffff', w: '#8a4a20', v: '#b86e34', W: '#5a2a10' };
    prBlit(p, [prRot(g, pal, 0, -12, -0.62, 17, 4)], true);
    prTwinkle(p, 4, -20, true); prTwinkle(p, -6, -6);
  });
}

// Sac de pièces « $ », pièces renversées
function prGold() {
  return sprite(24, 24, (p) => {
    const { R, P, ell, disc } = p;
    ell(0, -8, 9, 8, PR_BURLAP[2]); ell(-1, -9, 8, 7, PR_BURLAP[3]); ell(-2, -10, 6, 5, PR_BURLAP[4]); ell(-3, -12, 3, 2, PR_BURLAP[5]);
    R(-3, -18, 6, 3, PR_BURLAP[3]); R(-3, -18, 2, 3, PR_BURLAP[4]);
    for (let x = -5; x <= 4; x++) R(x, -21 + (x & 1), 1, 3 - (x & 1), x < 0 ? PR_BURLAP[4] : PR_BURLAP[2]);
    R(-4, -17, 8, 2, PR_RED[3]); R(-4, -17, 8, 1, PR_RED[4]); P(4, -16, PR_RED[2]); P(5, -15, PR_RED[3]); P(5, -14, PR_RED[2]);
    for (let y = -14; y < 0; y += 2) for (let x = -7; x < 8; x += 3) P(x + (y & 2 ? 1 : 0), y, PR_BURLAP[1]);
    // « $ » peint
    ['...#...', '.#####.', '##.#...', '##.#...', '.#####.', '...#.##', '...#.##', '.#####.', '...#...'].forEach((row, j) => {
      for (let i = 0; i < 7; i++) if (row[i] === '#') P(i - 4, j - 14, '#2a1a0a');
    });
    const coin = (x, y) => { R(x - 2, y, 5, 2, PR_GOLD[2]); R(x - 2, y, 5, 1, PR_GOLD[4]); P(x - 1, y, PR_GOLD[5]); };
    for (const [x, y] of [[6, -1], [8, -1], [7, -3], [-8, -1], [-6, -1], [3, -1], [8, -5]]) coin(x, y);
    disc(-9, -4, 2, PR_GOLD[3]); P(-10, -5, PR_GOLD[5]); P(-9, -4, PR_GOLD[1]);
    prTwinkle(p, 6, -9, true);
  });
}

const PR_PICKUPS = {
  crate: prCrate, ammo: prAmmo, whisky: prWhisky, bandage: prBandage, vest: prVest, dynamite: prDynamite,
  star: prStar, gatling: prGatling, akimbo: prAkimbo, goldwin: prGoldWin, gold: prGold,
};
export function pickupSprite(id) {
  const make = PR_PICKUPS[id];
  return make ? memo('pk:' + id, make) : checker(24, 24);
}

// ================================================================== 6) DÉCOR
// Corps de tonneau bombé : douelles ombrées, cerclages de fer, couvercle vu d'en haut
// Demi-largeur du tonneau à la rangée y (bombé au milieu)
const prBarrelHW = (y, H, rx) => Math.round(rx + 1.7 * Math.sin((Math.PI * -y) / H));
function prBarrelBody(p, ramp, hoopR, H = 28, rx = 7.5) {
  // cerclages de fer de 2 px : rangée haute éclairée, rangée basse dans l'ombre (comme les douelles qui rentrent dessous)
  const hoops = { 1: 1, 2: 0, 7: 1, 8: 0, [H - 8]: 1, [H - 7]: 0, [H - 2]: 1, [H - 1]: 0 };
  for (let y = -H; y <= 0; y++) {
    const hw = prBarrelHW(y, H, rx);
    for (let x = -hw; x <= hw; x++) {
      const u = (x + hw + 0.5) / (2 * hw + 1), k = prLit(u);
      const h = hoops[-y];
      if (h !== undefined) p.P(x, y, prPick(hoopR, h ? k * 0.95 + 0.1 : k * 0.55));
      else {
        const seam = (x + hw) % 4 === 3, under = hoops[-y - 1] === 0; // ombre portée sous chaque cerclage
        p.P(x, y, prPick(ramp, k - (seam ? 0.2 : 0) - (under ? 0.22 : 0) + (Math.abs(y + H / 2) < 3 ? 0.05 : 0)));
      }
    }
    // rivets des cerclages
    if (hoops[-y] === 1) { p.P(-hw + 2, y, hoopR[5]); p.P(Math.round(hw * 0.4), y, hoopR[4]); }
  }
  // couvercle vu d'en haut : jable clair, fond sombre en planches, bonde
  const tw = prBarrelHW(-H, H, rx);
  p.ell(0, -H, tw, 2.4, hoopR[2]); p.ell(0, -H, tw - 1, 1.8, ramp[4]); p.ell(0, -H + 0.4, tw - 2, 1.2, ramp[2]);
  p.R(-tw + 1, -H - 2, tw - 2, 1, hoopR[4]);
  p.R(-tw + 3, -H, 2 * tw - 5, 1, ramp[1]);
  p.P(2, -H - 1, ramp[0]); p.P(3, -H - 1, ramp[0]); p.P(2, -H, ramp[1]);
}
function prBarrel() {
  return sprite(22, 32, (p, c) => {
    prBarrelBody(p, PR_WOOD, PR_IRON);
    grain(c, 0, 0, c.width, c.height, rng(5), 0.08, 0.35);
    // bonde de perce et coulure
    p.R(-1, -14, 2, 2, PR_WOOD[0]); p.P(-1, -14, PR_WOOD[1]); p.R(0, -12, 1, 3, PR_WOOD[1]); p.P(-2, -15, PR_WOOD[4]);
  });
}
// Tonneau de poudre rouge : bande « TNT », mèche, gare !
function prBarrelTnt() {
  return sprite(22, 36, (p) => {
    const { R, P, line } = p;
    prBarrelBody(p, PR_RED, PR_IRON);
    for (let y = -18; y <= -10; y++) { const hw = prBarrelHW(y, 28, 7.5); prCyl(p, -hw, y, 2 * hw + 1, 1, y === -18 ? PR_GOLD : y === -10 ? PR_AMBER : PR_CREAM); }
    text(R, 'TNT', -5, -16, '#2a0a06');
    // tête de mort au pochoir
    R(-2, -25, 5, 2, PR_CREAM[4]); P(-1, -24, PR_RED[1]); P(1, -24, PR_RED[1]); R(-1, -23, 3, 1, PR_CREAM[3]); P(0, -23, PR_CREAM[2]);
    // mèche qui grésille
    line(2, -29, 3, -31, '#7a6a58'); line(3, -31, 2, -33, '#7a6a58'); P(2, -34, '#2a2018'); P(3, -30, '#a89880');
    // coulures de poudre noire
    P(-6, -19, '#2a1410'); P(5, -3, '#2a1410'); P(6, -2, '#2a1410'); P(-4, -6, '#2a1410');
  });
}

// Capsule verticale de cactus (côtes, épines) : colonnes x0..x1, rangées yTop..yBot
function prCapV(p, x0, x1, yTop, yBot, capTop = true, capBot = false) {
  const w = x1 - x0 + 1, rr = w / 2, cx = (x0 + x1) / 2;
  for (let y = yTop; y <= yBot; y++) {
    let half = rr + 1;
    if (capTop && y < yTop + rr) half = Math.sqrt(Math.max(0, rr * rr - (yTop + rr - y - 0.5) ** 2));
    if (capBot && y > yBot - rr) half = Math.min(half, Math.sqrt(Math.max(0, rr * rr - (y - (yBot - rr) - 0.5) ** 2)));
    for (let x = x0; x <= x1; x++) {
      if (Math.abs(x - cx) > half + 0.25) continue;
      const i = x - x0, rib = i % 3;
      const k = prLit((i + 0.5) / w) + (rib === 1 ? 0.14 : rib === 2 ? -0.1 : 0);
      p.P(x, y, prPick(PR_GREEN, k));
      if (rib === 1 && (y + i * 2) % 4 === 0) p.P(x, y, '#e8e0b0');
    }
  }
}
// Capsule horizontale (coude d'un bras) : éclairée par le haut
function prCapH(p, x0, x1, y0, y1) {
  const h = y1 - y0 + 1;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const j = y - y0;
    p.P(x, y, prPick(PR_GREEN, 0.85 - (j / h) * 0.75 + (j % 3 === 1 ? 0.1 : 0)));
  }
}
function prCactus() {
  return sprite(40, 62, (p) => {
    const { R, P, ell } = p;
    ell(0, 0, 9, 1, PR_SAND[2]); R(-6, -1, 12, 1, PR_SAND[3]); P(-9, 0, PR_STONE[3]); P(8, 0, PR_STONE[2]); P(7, -1, PR_STONE[4]);
    prCapH(p, -12, -4, -28, -23); prCapV(p, -16, -10, -44, -23, true, true);
    prCapH(p, 4, 11, -37, -32); prCapV(p, 8, 13, -51, -32, true, true);
    prCapV(p, -4, 4, -58, 0);
    // fleurs
    for (const [x, y] of [[-1, -59], [1, -59], [-14, -45], [10, -52]]) { P(x, y, '#f8f0e0'); P(x, y - 1, '#f070a0'); }
    P(0, -59, '#f8d040');
  });
}

// Réverbère à pétrole ; lit = 1 : flamme et halo
function prLamp(lit) {
  const c = sprite(16, 80, (p) => {
    const { R, P } = p;
    const T = -16; // tout ce qui est au-dessus du fût est remonté de 16 px (réverbère de ~2,5 m)
    // socle
    R(-4, -4, 9, 5, PR_IRON[2]); R(-4, -4, 9, 1, PR_IRON[4]); R(-4, -4, 1, 5, PR_IRON[3]); R(4, -4, 1, 5, PR_IRON[1]);
    R(-3, -6, 7, 2, PR_IRON[2]); R(-3, -6, 7, 1, PR_IRON[3]);
    // fût cannelé
    prCyl(p, -1, -44 + T, 3, 38 - T, PR_IRON);
    for (const y of [-12, -28, -40 + T]) { R(-2, y, 5, 2, PR_IRON[3]); R(-2, y, 5, 1, PR_IRON[4]); }
    // barre d'appui de l'allumeur
    R(-5, -45 + T, 11, 1, PR_IRON[2]); P(-5, -44 + T, PR_IRON[3]); P(5, -44 + T, PR_IRON[3]);
    // lanterne : fond en cône, vitres, toit
    R(-2, -47 + T, 5, 2, PR_IRON[2]); R(-3, -48 + T, 7, 1, PR_IRON[3]);
    const glass = lit ? ['#c86018', '#f8a030', '#f8d870', '#fff8d0'] : ['#3a4048', '#56606a', '#7a8690', '#a8b4bc'];
    R(-4, -56 + T, 9, 8, glass[1]); R(-3, -56 + T, 3, 8, glass[2]); R(1, -56 + T, 3, 8, glass[1]);
    if (lit) { R(-1, -54 + T, 3, 4, glass[2]); R(0, -54 + T, 1, 3, glass[3]); P(0, -55 + T, '#ffffff'); }
    else { R(0, -51 + T, 1, 2, '#2a2018'); P(-3, -55 + T, glass[3]); P(-2, -54 + T, glass[3]); }
    R(-4, -56 + T, 1, 8, PR_IRON[1]); R(4, -56 + T, 1, 8, PR_IRON[1]); R(0, -56 + T, 1, 8, PR_IRON[1]);
    R(-6, -58 + T, 13, 2, PR_IRON[2]); R(-6, -58 + T, 13, 1, PR_IRON[3]);
    R(-4, -59 + T, 9, 1, PR_IRON[2]); R(-2, -60 + T, 5, 1, PR_IRON[2]); R(0, -62 + T, 1, 2, PR_IRON[3]);
    if (lit) { R(-5, -57 + T, 11, 1, '#f8c060'); R(-3, -48 + T, 7, 1, '#a86020'); }
  });
  return lit ? prGlow(c, 0, -68, 8, ['#c87020', '#f8c050', '#fff0a0'], 0.55) : c;
}

// Barre d'attache pour les chevaux
function prHitch() {
  return sprite(40, 24, (p, c) => {
    const { R, P, line } = p;
    R(-18, -1, 36, 2, PR_SAND[2]);
    for (const x of [-16, 12]) { prCyl(p, x, -20, 4, 21, PR_GREY); R(x + 1, -21, 2, 1, PR_GREY[4]); }
    R(-18, -17, 37, 3, PR_GREY[3]); R(-18, -17, 37, 1, PR_GREY[5]); R(-18, -15, 37, 1, PR_GREY[1]);
    grain(c, 0, 0, c.width, c.height, rng(9), 0.1, 0.4);
    for (const x of [-15, 13]) { P(x, -16, PR_IRON[4]); P(x + 1, -16, PR_IRON[4]); }
    // anneau de fer et corde nouée
    prRing(p, -5, -11, 1.4, 2.6, (a) => (a < 0 ? PR_IRON[4] : PR_IRON[2]));
    R(5, -15, 3, 2, '#c8a060'); line(6, -13, 7, -8, '#c8a060'); line(7, -8, 6, -5, '#b08a48'); P(5, -4, '#c8a060'); P(7, -4, '#c8a060');
  });
}

// Abreuvoir : planches cerclées, eau qui miroite
function prTrough() {
  return sprite(40, 18, (p, c) => {
    const { R, P } = p;
    R(-17, -16, 34, 1, PR_WOOD[2]); R(-17, -16, 34, 1, PR_WOOD[4]); // bord arrière, vu d'en haut
    // eau : plus sombre au fond, reflets du ciel en tirets (lisible de l'œil du joueur, à 0,5 unité)
    R(-17, -15, 34, 1, '#24485e'); R(-17, -14, 34, 1, '#346282'); R(-17, -13, 34, 1, '#4a80a2');
    R(-15, -14, 6, 1, '#9ad0f0'); R(-13, -13, 3, 1, '#c8ecff'); R(-3, -13, 4, 1, '#7ab0d0'); R(6, -14, 5, 1, '#9ad0f0'); R(8, -15, 2, 1, '#7ab0d0');
    R(-17, -12, 34, 10, PR_WOOD[3]); R(-17, -12, 34, 1, PR_WOOD[5]); R(-17, -7, 34, 1, PR_WOOD[2]); R(-17, -6, 34, 1, PR_WOOD[4]); R(-17, -3, 34, 1, PR_WOOD[1]);
    grain(c, 0, 0, c.width, c.height, rng(12), 0.09, 0.4);
    for (const x of [-19, 16]) { R(x, -16, 3, 17, PR_WOOD[2]); R(x, -16, 1, 17, PR_WOOD[4]); R(x, -16, 3, 1, PR_WOOD[5]); }
    for (const x of [-10, 9]) { R(x, -12, 2, 10, PR_IRON[2]); R(x, -12, 1, 10, PR_IRON[3]); P(x, -10, PR_IRON[5]); P(x, -5, PR_IRON[5]); }
    // flaque et gouttes
    R(-6, 0, 10, 1, '#3a6a8a'); P(-3, 0, '#9ad0f0'); P(2, -1, '#7ab0d0');
  });
}

// Botte de foin : faces avant, dessus, côté ; ficelles ; brins rebelles
function prHayBale() {
  return sprite(30, 22, (p, c) => {
    const { R, P, poly, line } = p;
    poly([[-14, -13], [9, -13], [13, -17], [-10, -17]], PR_STRAW[4]);
    poly([[9, -13], [13, -17], [13, -4], [9, 1]], PR_STRAW[1]);
    R(-14, -13, 23, 14, PR_STRAW[3]);
    const r = rng(41);
    for (let k = 0; k < 70; k++) {
      const x = -14 + Math.floor(r() * 22), y = -12 + Math.floor(r() * 13), l = 2 + Math.floor(r() * 4);
      R(x, y, Math.min(l, 9 - x), 1, r() < 0.5 ? PR_STRAW[2] : PR_STRAW[4]);
    }
    for (let k = 0; k < 18; k++) { const x = -12 + r() * 22, y = -16 + r() * 3; line(x, y, x + 2, y - 1, r() < 0.5 ? PR_STRAW[5] : PR_STRAW[3]); }
    R(-14, -13, 23, 1, PR_STRAW[5]); R(-14, 0, 23, 1, PR_STRAW[1]);
    // ficelles
    for (const x of [-8, 3]) { R(x, -13, 1, 14, '#8a3a20'); line(x, -13, x + 4, -17, '#8a3a20'); }
    // brins qui dépassent
    for (const [x0, y0, x1, y1] of [[-12, -13, -14, -15], [-2, -13, -1, -16], [12, -8, 13, -10], [-4, -17, -5, -19], [6, -17, 8, -19]]) line(x0, y0, x1, y1, PR_STRAW[5]);
  });
}

// Pierre tombale « R.I.P », fêlure, mousse, herbes
function prTombstone() {
  return sprite(20, 28, (p, c) => {
    const { R, P, line, disc } = p;
    R(-9, -2, 18, 3, PR_STONE[2]); R(-9, -2, 18, 1, PR_STONE[3]);
    disc(0, -18, 7.4, PR_STONE[3]); R(-7, -18, 15, 17, PR_STONE[3]);
    grain(c, 0, 0, c.width, c.height, rng(13), 0.1, 0.5);
    for (let y = -24; y <= -3; y++) { P(-7, y, PR_STONE[4]); P(7, y, PR_STONE[1]); P(6, y, PR_STONE[2]); }
    R(-4, -25, 7, 1, PR_STONE[5]); R(-6, -23, 2, 1, PR_STONE[4]);
    // gravure : ombre en haut à gauche, lumière en bas à droite
    const carve = (draw) => { draw(0, 1, PR_STONE[5]); draw(0, 0, PR_STONE[0]); };
    carve((dx, dy, col) => {
      text((x, y, w, h) => R(x + dx, y + dy, w, h, col), 'R', -6, -15, col);
      P(-2 + dx, -11 + dy, col);
      text((x, y, w, h) => R(x + dx, y + dy, w, h, col), 'I', -1, -15, col);
      P(3 + dx, -11 + dy, col);
      text((x, y, w, h) => R(x + dx, y + dy, w, h, col), 'P', 4, -15, col);
      R(-1 + dx, -22 + dy, 1, 5, col); R(-2 + dx, -21 + dy, 3, 1, col);
      R(-5 + dx, -7 + dy, 10, 1, col);
    });
    line(4, -5, 6, -2, PR_STONE[0]); P(5, -6, PR_STONE[0]);
    for (const [x, y] of [[-6, -3], [-5, -3], [-6, -4], [-4, -2], [6, -8]]) P(x, y, '#5a7a3a');
    for (const [x, h] of [[-9, 3], [-8, 2], [7, 2], [8, 3], [-3, 1], [3, 1]]) R(x, 1 - h, 1, h, h > 2 ? '#7a9a48' : '#5a7a3a');
  });
}

// Croix de bois sur un tertre, chapeau du défunt posé dessus
function prCross() {
  return sprite(20, 40, (p, c) => {
    const { R, P, ell } = p;
    ell(0, 0, 8, 2, '#5a3a20'); ell(-1, -1, 6, 1, '#7a5030');
    prCyl(p, -2, -32, 4, 33, PR_GREY);
    R(-8, -26, 17, 4, PR_GREY[3]); R(-8, -26, 17, 1, PR_GREY[5]); R(-8, -23, 17, 1, PR_GREY[1]);
    grain(c, 0, 0, c.width, c.height, rng(17), 0.12, 0.5);
    R(-2, -26, 4, 4, PR_GREY[2]);
    for (const [x, y] of [[-2, -26], [1, -25], [-2, -23], [1, -22]]) P(x, y, '#c8a060');
    P(-1, -25, PR_IRON[4]); P(0, -24, PR_IRON[4]);
    // chapeau
    R(-6, -33, 13, 2, '#5a3a20'); R(-6, -33, 13, 1, '#7a5030'); R(-7, -32, 2, 1, '#5a3a20'); R(6, -32, 2, 1, '#5a3a20');
    R(-3, -38, 7, 5, '#6a4426'); R(-3, -38, 7, 1, '#8a5c34'); P(0, -38, '#4a2e18'); R(-3, -34, 7, 1, '#2a1a10');
    // cailloux
    for (const [x, y] of [[-7, -1], [6, 0], [4, -1]]) { P(x, y, PR_STONE[4]); P(x + 1, y, PR_STONE[2]); }
  });
}

// Roue de chariot appuyée (ovale : vue de biais)
function prWheel() {
  return sprite(30, 30, (p) => {
    prRing(p, 2, -14, 12.4, 14.5, () => PR_IRON[1], 0.8);
    prSpokeWheel(p, 0, -14, 14, PR_WOOD, 12, 0.8);
    p.disc(0, -14, 3, PR_WOOD[2]); p.disc(-1, -15, 1.5, PR_WOOD[4]); p.P(0, -14, PR_IRON[2]);
  });
}

// Table ronde de saloon : cartes, jetons, bouteille, verre
// Plateau à hauteur de hanche (~0,45 unité) : on le voit presque par la tranche, l'œil du joueur est à 0,5 unité
function prTable() {
  return sprite(32, 38, (p, c) => {
    const { R, P, ell, line } = p;
    const top = -28;
    // pied tripode : patins en griffe, fût tourné
    line(-1, -6, -11, 0, PR_WOOD[1], 2); line(1, -6, 11, 0, PR_WOOD[2], 2); R(-12, -1, 3, 2, PR_WOOD[1]); R(10, -1, 3, 2, PR_WOOD[1]);
    line(-2, -6, -10, -1, PR_WOOD[3]); R(-1, -4, 3, 5, PR_WOOD[2]); P(-1, -4, PR_WOOD[4]);
    prCyl(p, -2, top + 2, 5, -top - 7, PR_WOOD);
    for (const [y, hw] of [[-7, 3], [-6, 3], [-12, 3], [-20, 2]]) prCyl(p, -hw, y, 2 * hw + 1, 1, PR_WOOD, y === -7 ? 0.15 : 0);
    // plateau : chant épais (ombre dessous), dessus en ellipse aplatie, tapis vert
    ell(0, top + 2, 14, 2.4, PR_WOOD[0]);
    for (let x = -14; x <= 14; x++) { const k = prLit((x + 14.5) / 29); P(x, top + 1, prPick(PR_WOOD, k - 0.1)); P(x, top + 2, prPick(PR_WOOD, k - 0.35)); }
    ell(0, top, 14, 2.6, PR_WOOD[4]); ell(0, top, 12, 1.7, '#2e6a3a'); ell(-1, top - 0.3, 10, 1.1, '#3a7e46');
    R(-12, top - 2, 9, 1, PR_WOOD[5]);
    grain(c, 0, c.height + top - 3, c.width, 6, rng(23), 0.08, 0.4);
    // cartes, piles de jetons, verre de whisky (la bouteille est un objet à part)
    R(-8, top - 1, 3, 2, '#f4ecd8'); P(-7, top - 1, '#c0392b'); R(-4, top, 3, 1, '#f4ecd8');
    R(3, top, 4, 1, '#f4ecd8'); P(4, top, '#1a1418');
    for (let k = 0; k < 4; k++) R(-12, top - 1 - k, 3, 1, k % 2 ? '#f4ecd8' : '#c0392b');
    for (let k = 0; k < 2; k++) R(-9, top - k, 2, 1, k % 2 ? '#f8e08a' : '#3a6ec0');
    R(8, top - 1, 3, 1, '#3a6ec0'); R(8, top - 2, 3, 1, '#f4ecd8');
    for (let k = 0; k < 3; k++) R(4, top - 1 - k, 2, 1, k % 2 ? '#f4ecd8' : '#1a1418'); // pile de jetons noirs
    R(-2, top - 4, 3, 4, '#c8d8e0'); R(-2, top - 2, 3, 2, '#e09a30'); P(-2, top - 4, '#ffffff'); P(0, top - 3, '#8a9aa4');
  });
}

// Chaise de saloon à barreaux : assise à ~0,3 unité, haut du dossier au niveau de la table
function prChair() {
  return sprite(16, 38, (p, c) => {
    const { R, P } = p;
    const seat = -19;
    // montants arrière (du sol au haut du dossier, derrière l'assise)
    for (const x of [-6, 4]) { R(x, -34, 2, 34, PR_WOOD[2]); R(x, -34, 1, 34, PR_WOOD[3]); }
    // dossier : traverse cintrée, trois barreaux, traverse basse
    R(-6, -35, 12, 4, PR_WOOD[3]); R(-5, -36, 10, 1, PR_WOOD[4]); R(-6, -35, 12, 1, PR_WOOD[5]); R(-6, -32, 12, 1, PR_WOOD[1]);
    R(-6, -34, 1, 3, PR_WOOD[4]);
    R(-2, -31, 4, 9, PR_WOOD[3]); R(-2, -31, 1, 9, PR_WOOD[4]); R(1, -31, 1, 9, PR_WOOD[2]); R(-2, -31, 4, 1, PR_WOOD[1]); // planchette
    R(-6, -25, 12, 2, PR_WOOD[3]); R(-6, -25, 12, 1, PR_WOOD[4]);
    grain(c, 0, 0, c.width, c.height - 20, rng(29), 0.08, 0.35);
    // assise vue du dessus (l'œil est au-dessus) puis son chant
    R(-7, seat - 2, 14, 2, PR_WOOD[4]); R(-7, seat - 2, 8, 1, PR_WOOD[5]);
    R(-7, seat, 14, 2, PR_WOOD[3]); R(-7, seat + 1, 14, 1, PR_WOOD[1]); P(6, seat, PR_WOOD[2]);
    // pieds avant, entretoises
    for (const x of [-7, 5]) { R(x, seat + 2, 2, -seat - 1, PR_WOOD[3]); R(x, seat + 2, 1, -seat - 1, PR_WOOD[4]); R(x, seat + 2, 2, 1, PR_WOOD[1]); }
    R(-5, -7, 10, 1, PR_WOOD[3]); R(-5, -6, 10, 1, PR_WOOD[1]);
  });
}

// Agave en pot de terre cuite peint
function prPlant() {
  return sprite(26, 30, (p) => {
    const { R, P, poly, line } = p;
    const leaves = [[-2.75, 11, 0], [-0.35, 11, 0], [-2.2, 13, 1], [-0.9, 13, 1], [-1.57, 15, 1], [-2.6, 10, 2], [-0.55, 10, 2], [-1.9, 12, 2], [-1.25, 12, 2]];
    for (const [a, len, layer] of leaves) {
      const bx = 0, by = -10, ca = Math.cos(a), sa = Math.sin(a);
      const nx = -sa, ny = ca, w = 2.4;
      const tip = [bx + ca * len, by + sa * len];
      const ramp = layer === 0 ? 0.25 : layer === 1 ? 0.5 : 0.75;
      poly([[bx + nx * w, by + ny * w], tip, [bx - nx * w, by - ny * w]], prPick(PR_AGAVE, ramp));
      line(bx, by, bx + ca * (len - 2), by + sa * (len - 2), prPick(PR_AGAVE, ramp + 0.25));
      P(tip[0], tip[1], '#8a3a20');
    }
    // pot
    for (let y = -7; y <= 0; y++) { const hw = 6 - Math.round((y + 7) / 5); prCyl(p, -hw, y, 2 * hw + 1, 1, PR_TERRA); }
    prCyl(p, -7, -10, 15, 3, PR_TERRA, 0.1); R(-7, -10, 15, 1, PR_TERRA[5]);
    R(-6, -5, 13, 2, PR_CREAM[3]);
    for (let x = -6; x <= 6; x++) P(x, -5 + (x & 1), '#2a5a8a');
    R(-5, 0, 11, 1, PR_TERRA[1]);
  });
}

// Château d'eau de la voie ferrée, sur pilotis, bec verseur relevé
function prWaterTower() {
  return sprite(64, 128, (p, c) => {
    const { R, P, line, poly } = p;
    const deck = -70;
    // pieds arrière, puis contreventements et pieds avant
    for (const s of [-1, 1]) line(s * 11, 0, s * 9, deck, PR_WOOD[1], 2);
    const legX = (y) => 24 - (6 * -y) / -deck;
    for (const [yb, yt] of [[0, -24], [-24, -48], [-48, deck]]) {
      line(-legX(yb), yb, legX(yt), yt, PR_IRON[1]); line(legX(yb), yb, -legX(yt), yt, PR_IRON[1]);
    }
    for (const y of [-24, -48]) { const xo = Math.round(legX(y)); R(-xo, y - 1, 2 * xo + 1, 2, PR_WOOD[2]); R(-xo, y - 1, 2 * xo + 1, 1, PR_WOOD[4]); }
    for (const s of [-1, 1]) { line(s * 24, 0, s * 18, deck, PR_WOOD[2], 3); line(s * 24 - 1, 0, s * 18 - 1, deck, s < 0 ? PR_WOOD[4] : PR_WOOD[3]); }
    for (const s of [-1, 1]) { R(s * 24 - 3, -2, 6, 3, PR_STONE[3]); R(s * 24 - 3, -2, 6, 1, PR_STONE[4]); }
    // plancher
    R(-27, deck - 3, 55, 4, PR_WOOD[3]); R(-27, deck - 3, 55, 1, PR_WOOD[5]); R(-27, deck, 55, 1, PR_WOOD[1]);
    for (let x = -26; x < 27; x += 6) R(x, deck - 2, 2, 2, PR_WOOD[1]);
    // cuve en douelles cerclée
    const top = -106, bot = deck - 4;
    for (let y = top; y <= bot; y++) for (let x = -22; x <= 22; x++) {
      const u = (x + 22.5) / 45;
      P(x, y, prPick(PR_WOOD, prLit(u) - ((x + 22) % 4 === 3 ? 0.18 : 0) - 0.05));
    }
    grain(c, 0, 0, c.width, c.height, rng(64), 0.07, 0.3);
    for (const y of [-77, -84, -91, -98, -104]) for (let x = -22; x <= 22; x++) {
      P(x, y, prPick(PR_IRON, prLit((x + 22.5) / 45) * 0.9)); P(x, y + 1, PR_WOOD[1]);
    }
    for (const y of [-84, -98]) { R(-1, y - 1, 3, 3, PR_IRON[2]); P(0, y, PR_IRON[4]); }
    for (const [dx, col] of [[1, PR_WOOD[1]], [0, PR_CREAM[4]]]) {
      ['10001', '10001', '10101', '10101', '01010'].forEach((row, j) => { for (let i = 0; i < 5; i++) if (row[i] === '1') P(-11 + i + dx, -94 + j + dx, col); });
      text(R, 'ATER', -5 + dx, -94 + dx, col);
    }
    // toit conique en bardeaux
    poly([[-26, -105], [27, -105], [0.5, -124]], PR_GREY[2]);
    poly([[-26, -105], [0.5, -105], [0.5, -124]], PR_GREY[4]);
    for (let y = -121; y <= -106; y += 3) { const hw = ((y + 124) / 19) * 26.5; R(-hw, y, 2 * hw + 1, 1, PR_GREY[1]); }
    R(-26, -105, 53, 1, PR_GREY[1]); R(-26, -106, 53, 1, PR_GREY[5]);
    R(0, -125, 1, 2, PR_IRON[3]); P(0, -126, PR_IRON[4]);
    // échelle
    for (const x of [-15, -12]) R(x, top, 1, -top + 1, PR_WOOD[1]);
    for (let y = top + 2; y < 0; y += 4) R(-15, y, 4, 1, PR_WOOD[4]);
    // bec verseur relevé, chaîne, manche de cuir
    line(20, -76, 29, -92, PR_IRON[2], 3); line(19, -77, 28, -93, PR_IRON[4]);
    line(29, -93, 25, -104, PR_IRON[3]);
    R(28, -92, 3, 6, '#5a3a20'); R(28, -92, 1, 6, '#7a5030'); P(29, -86, '#3a2010');
    R(18, -78, 4, 4, PR_IRON[1]);
  });
}

// Éolienne de ranch à pales multiples (vue de trois quarts), frames 0..3 : rotation
function prWindmill(f) {
  return sprite(64, 128, (p) => {
    const { R, P, line, poly } = p;
    const top = -84;
    // pylône en treillis
    for (const s of [-1, 1]) line(s * 10, 0, s * 2, top, PR_IRON[1]);
    const lx = (y) => 19 - (15 * -y) / -top;
    for (let k = 0; k < 6; k++) {
      const yb = Math.round((top * k) / 6), yt = Math.round((top * (k + 1)) / 6);
      line(-lx(yb), yb, lx(yt), yt, PR_IRON[2]); line(lx(yb), yb, -lx(yt), yt, PR_IRON[2]);
      R(-lx(yt), yt, 2 * lx(yt) + 1, 1, PR_IRON[3]);
    }
    for (const s of [-1, 1]) { line(s * 19, 0, s * 4, top, PR_IRON[3], 2); line(s * 19 - 1, 0, s * 4 - 1, top, PR_IRON[4]); R(s * 19 - 3, -2, 6, 3, PR_STONE[3]); R(s * 19 - 3, -2, 6, 1, PR_STONE[4]); }
    // tige de pompe et tête de puits
    R(0, top, 1, -top - 5, PR_IRON[2]);
    R(-3, -6, 7, 7, PR_IRON[2]); R(-3, -6, 7, 1, PR_IRON[4]); R(4, -3, 5, 2, PR_IRON[2]); P(9, -2, '#5aa0d0');
    R(-6, top - 2, 13, 2, PR_WOOD[3]); R(-6, top - 2, 13, 1, PR_WOOD[5]);
    // gouvernail (derrière la roue)
    const cy = -102;
    line(0, cy, 22, cy - 2, PR_IRON[2], 2);
    poly([[17, cy - 12], [30, cy - 10], [30, cy + 5], [17, cy + 1]], PR_CREAM[3]);
    poly([[17, cy - 12], [30, cy - 10], [30, cy - 6], [17, cy - 8]], PR_RED[3]);
    R(17, cy - 11, 1, 12, PR_CREAM[1]);
    // roue : 18 pales galvanisées dont 3 paires peintes en rouge, 3 bras de fer. Elle tourne de 30° par image : les
    // repères rouges (symétrie d'ordre 3) font un tiers de tour en 4 images, la boucle est donc continue.
    const RO = 23, RI = 5, n = 18, off = (f * Math.PI) / 6, sx = 0.82;
    for (let dy = -RO - 1; dy <= RO + 1; dy++) for (let dx = -RO; dx <= RO; dx++) {
      const u = dx / sx, rr = Math.hypot(u, dy);
      if (rr > RO + 0.5 || rr < RI) continue;
      const ang = Math.atan2(dy, u), rel = (((ang - off) / (2 * Math.PI)) % 1 + 1) % 1;
      const ph = (rel * n) % 1, k = Math.floor(rel * n);
      const lit = -Math.cos(ang + Math.PI / 4) * 0.12; // le haut-gauche de la roue prend la lumière
      // bras : 3 rayons sombres qui tournent avec la roue
      const arm = Math.abs((((rel - 0.5 / n) * 3 + 0.5) % 1 + 1) % 1 - 0.5) * ((2 * Math.PI) / 3) * rr < 0.8;
      let col = null;
      if (rr > RO - 0.8 || Math.abs(rr - 13) < 0.55) col = PR_IRON[1];
      else if (arm && rr > RI + 1) col = PR_IRON[0];
      else if (k % 6 < 2 ? ph < 0.85 : ph < 0.62) {
        const t = 0.95 - ph * 1.1 + lit;
        col = k % 6 < 2 ? prPick(PR_RED, t + 0.1) : prPick(PR_IRON, t);
        if (k % 6 < 2 && rr > RO - 4) col = prPick(PR_CREAM, t + 0.25); // bout blanc des pales rouges
      }
      if (col) P(dx, cy + dy, col);
    }
    p.disc(0, cy, 4, PR_IRON[1]); p.disc(-1, cy - 1, 2.4, PR_IRON[3]); P(-2, cy - 2, PR_IRON[5]); P(0, cy, PR_IRON[0]);
  });
}

// Vache longhorn (profil), f 0 : broute, f 1 : tête levée
// Volume modelé par un champ de boules : lumière en haut à gauche tirée de la pente du champ
function prBlobBody(p, blobs, thr, x0, x1, y0, y1, color, gk = 1.8) {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const v = prField(blobs, x, y);
    if (v < thr) continue;
    const g = prField(blobs, x + 1, y + 1) - prField(blobs, x - 1, y - 1);
    const col = color(clamp(0.52 + g * gk - (v < thr + 0.05 ? 0.1 : 0) - ((y - y0) / (y1 - y0) - 0.5) * 0.3, 0.12, 1), x, y);
    if (col) p.P(x, y, col);
  }
}
// Vache longhorn (profil, ~1,4 m au garrot), f 0 : broute, f 1 : tête levée
function prCow(f) {
  return sprite(64, 48, (p) => {
    const { R, P, line, poly } = p;
    const C = ['#2a1006', '#4e220e', '#7a3818', '#9c4e22', '#be6c38', '#dc8c54'];
    const W = ['#7a6a50', '#a8987a', '#cfc2a2', '#e6dcc0', '#f4ecd8', '#fffaf0'];
    const HOOF = '#22160e';
    // pattes : arrière avec jarret, avant droite ; far = côté caché (plus sombre)
    const hind = (x, far) => {
      const [d, m, l] = far ? [C[0], C[1], C[2]] : [C[1], C[3], C[4]];
      poly([[x - 2, -22], [x + 4, -22], [x + 3, -12], [x + 3, -1], [x, -1], [x, -9], [x - 1, -12]], m);
      line(x - 1, -20, x - 1, -13, l); line(x, -9, x, -2, l); line(x + 3, -18, x + 2, -11, d);
      R(x, -1, 4, 2, HOOF); P(x + 2, 0, '#4a3a2a'); P(x + 1, -6, d);
    };
    const fore = (x, far) => {
      const [d, m, l] = far ? [C[0], C[1], C[2]] : [C[1], C[3], C[4]];
      poly([[x, -22], [x + 4, -22], [x + 4, -9], [x + 3, -1], [x, -1], [x, -9]], m);
      line(x, -20, x, -2, l); line(x + 3, -20, x + 3, -10, d); R(x, -9, 4, 1, d);
      R(x, -1, 4, 2, HOOF); P(x + 2, 0, '#4a3a2a');
    };
    hind(-14, true); fore(12, true);
    // queue à touffe
    line(-23, -34, -26, -24, C[2]); line(-26, -24, -26, -14, C[1]); R(-27, -15, 3, 4, C[0]); P(-26, -12, C[0]);
    // corps : barrique, garrot, croupe, ventre ; cou selon la pose ; taches crème
    const neck = f ? [[13, -33, 9], [16, -36, 6], [14, -27, 5]] : [[13, -29, 9], [15, -24, 7], [17, -20, 5]];
    const body = [[-4, -29, 14], [8, -29, 11], [-16, -30, 11], [-3, -24, 12], [7, -34, 8], ...neck];
    const spots = [[-9, -31, 7], [1, -22, 5], [-19, -24, 5], [10, -35, 4]];
    prBlobBody(p, body, 0.25, -30, 28, -46, -12, (L, x, y) => {
      const ramp = prField(spots, x, y) + (prN(x >> 1, y >> 1, 5) - 0.5) * 0.35 > 0.3 ? W : C;
      return prPick(ramp, L - (y > -18 ? 0.15 : 0));
    });
    R(-6, -15, 4, 2, '#e0a090'); P(-6, -15, '#b87060'); // pis
    hind(-20, false); fore(7, false);
    // tête : repère local (u le long du chanfrein, v vers la gorge) autour de la nuque
    const [hx, hy, a] = f ? [16, -35, 0.8] : [16, -19, 1.25];
    const ca = Math.cos(a), sa = Math.sin(a);
    const H = (pts) => pts.map(([u, v]) => [hx + (ca * u - sa * v) * 1.3, hy + (sa * u + ca * v) * 1.3]);
    const hp = (u, v, col) => { const [[x, y]] = H([[u, v]]); P(x, y, col); };
    // oreille, corne arrière (derrière la tête)
    poly(H([[0, 0], [-5, 1], [-6, 3], [-1, 2.5]]), C[2]);
    const horn = (s, base, tip) => { const pts = [[0, 0], [5 * s, -1], [10 * s, -2], [13 * s, -5], [14 * s, -7]]; for (let i = 0; i + 1 < pts.length; i++) line(hx + pts[i][0], hy - 1 + pts[i][1], hx + pts[i + 1][0], hy - 1 + pts[i + 1][1], i < 3 ? base : tip, i < 2 ? 2 : 1); };
    horn(-1, '#a89878', '#3a2a1a');
    poly(H([[-1, -3], [4, -3.6], [10, -2.6], [13.4, -1], [13.8, 2], [12, 4.2], [8, 4.6], [3, 4.4], [-1, 3]]), C[3]);
    poly(H([[-1, -3], [4, -3.6], [10, -2.6], [13.4, -1], [13, 0], [9, -1], [4, -1.4], [-1, -1]]), C[4]);
    poly(H([[5, -3.4], [10, -2.6], [13.4, -1], [13.8, 1.4], [11, 0.4], [7, -1.6]]), W[4]); // liste blanche
    poly(H([[11.5, 0.4], [13.8, 1.4], [13.6, 3], [12, 4.2], [10.6, 3]]), '#c88a78'); // mufle
    hp(13, 2, '#3a1a10'); hp(4, 0, '#140a06'); hp(4, -1, C[1]); hp(3, 0, '#140a06');
    // corne avant, claire
    horn(0.92, '#ece2c8', '#4a3a2a');
    R(hx + 1, hy - 2, 7, 1, '#fff8e8');
    if (!f) for (const [x, h] of [[17, 3], [19, 4], [21, 3], [23, 2], [15, 2]]) { R(x, 1 - h, 1, h, '#5a8a32'); P(x, 1 - h, '#8ab850'); }
  });
}

// Poule blanche, f 0 : debout, f 1 : picore
function prChicken(f) {
  return sprite(12, 12, (p) => {
    const { R, P, ell, disc } = p;
    R(-1, -2, 1, 3, '#e0a020'); R(1, -2, 1, 3, '#e0a020'); P(-2, 0, '#e0a020'); P(2, 0, '#e0a020');
    if (!f) {
      R(-5, -8, 2, 4, '#e8e4dc'); P(-5, -9, '#f8f4ec');
      ell(-1, -4, 3.5, 2.5, '#f4f0e8'); ell(-1, -4, 2, 1.4, '#c8c0b8'); R(-3, -2, 5, 1, '#c8c0b8');
      disc(2, -7, 1.6, '#f8f4ec'); R(1, -10, 3, 1, '#d83020'); P(2, -9, '#e83a28');
      P(4, -7, '#f0a020'); P(3, -5, '#d83020'); P(2, -7, '#1a0f0a');
    } else {
      R(-5, -7, 2, 3, '#e8e4dc'); P(-5, -8, '#f8f4ec');
      ell(-1, -3, 3.5, 2.5, '#f4f0e8'); ell(-1, -4, 2, 1.4, '#c8c0b8');
      disc(2, -2, 1.6, '#f8f4ec'); R(1, -5, 2, 1, '#d83020'); P(4, -1, '#f0a020'); P(2, -2, '#1a0f0a'); P(3, 0, '#d83020');
    }
  });
}

// Arbre mort tordu, corde de pendu, corbeau
function prDeadTree() {
  return sprite(48, 66, (p) => {
    const { R, P, line } = p;
    const B = ['#241e1a', '#3e342c', '#5e5044', '#7e6e5e', '#a0907c'];
    const r = rng(1881);
    const branch = (x, y, a, len, w, d) => {
      const x1 = x + Math.cos(a) * len, y1 = y + Math.sin(a) * len;
      line(x, y, x1, y1, B[2], w);
      if (w > 1) line(x - 1, y, x1 - 1, y1, B[3]);
      if (d <= 0) return [x1, y1];
      const n = d > 1 ? 2 : 2 + (r() < 0.5 ? 1 : 0);
      for (let k = 0; k < n; k++) branch(x1, y1, a + (k - (n - 1) / 2) * 0.75 + (r() - 0.5) * 0.4, len * (0.55 + r() * 0.2), Math.max(1, w - 1), d - 1);
      return [x1, y1];
    };
    // tronc évasé
    for (let y = 0; y >= -28; y--) {
      const hw = 2 + (y > -4 ? (4 + y) * 0.9 : 0) + Math.max(0, (y + 28) / 28);
      const xc = Math.sin(y / 9) * 1.5;
      for (let x = Math.round(xc - hw); x <= Math.round(xc + hw); x++) P(x, y, prPick(B, prLit((x - xc + hw + 0.5) / (2 * hw + 1)) * 0.9));
    }
    for (const [x, y] of [[-1, -8], [1, -15], [0, -22]]) P(x, y, B[0]);
    branch(0, -27, -1.95, 15, 3, 2);
    branch(1, -27, -1.05, 14, 3, 2);
    branch(-1, -15, -2.8, 9, 2, 1);
    // branche de la potence, et le pendu
    line(1, -20, 17, -24, B[2], 2); line(1, -21, 17, -25, B[3]); line(17, -24, 21, -28, B[2]);
    R(13, -24, 2, 2, '#c8a060');
    R(13, -22, 1, 9, '#c8a060');
    prRing(p, 13, -10, 1.6, 2.7, (a) => (a < 0 ? '#c8a060' : '#a07a40'));
    // corbeau perché
    R(-12, -50, 4, 2, '#1a1418'); R(-10, -52, 2, 2, '#1a1418'); P(-8, -51, '#e0b040'); P(-13, -51, '#1a1418');
  });
}

// Cercueil debout « HERE LIES », main squelettique qui dépasse
function prCoffin() {
  // à la taille d'un homme (~56 px) : épaules au quart haut, pied plus étroit
  return sprite(24, 58, (p, c) => {
    const { R, P, poly, line } = p;
    const T = -55, S = -42; // haut, épaules
    // caisse (chant visible à droite), couvercle décalé qui laisse une fente noire
    poly([[-6, T], [6, T], [11, S], [7, 1], [-7, 1], [-11, S]], PR_DARKW[1]);
    poly([[-6, T], [5, T], [10, S], [6, 1], [-7, 1], [-11, S]], PR_DARKW[2]);
    poly([[-6, T], [0, T], [0, 1], [-7, 1], [-11, S]], PR_DARKW[3]);
    // planches du couvercle
    for (const y of [-46, -30, -14]) R(-9, y, 18, 1, PR_DARKW[1]);
    grain(c, 0, 0, c.width, c.height, rng(46), 0.1, 0.4);
    // fente du couvercle entrouvert
    line(8, -34, 6, -6, '#0a0604'); line(9, -34, 7, -10, '#0a0604');
    // arêtes : lumière à gauche, ombre à droite
    line(-6, T, -11, S, PR_DARKW[5]); line(-11, S, -7, 0, PR_DARKW[4]); R(-5, T, 10, 1, PR_DARKW[5]);
    line(5, T, 10, S, PR_DARKW[1]); line(10, S, 6, 0, PR_DARKW[0]);
    // clous et croix de laiton
    for (const [x, y] of [[-4, -53], [4, -53], [-8, -42], [8, -42], [-5, -2], [5, -2]]) { P(x, y, PR_GOLD[3]); P(x - 1, y - 1, PR_GOLD[5]); }
    R(-1, -52, 2, 8, PR_GOLD[3]); R(-3, -50, 6, 2, PR_GOLD[3]); R(-1, -52, 1, 8, PR_GOLD[4]); R(-3, -50, 6, 1, PR_GOLD[4]); P(-1, -52, PR_GOLD[5]);
    // épitaphe peinte
    text(R, 'HERE', -7, -38, '#e8dcc0'); text(R, 'LIES', -7, -31, '#e8dcc0');
    R(-5, -24, 9, 1, '#e8dcc0'); R(-3, -22, 5, 1, PR_DARKW[1]);
    // main squelettique qui sort de la fente
    for (const [x, y] of [[6, -22], [7, -22], [8, -23], [9, -24], [7, -20], [8, -20], [9, -21], [10, -21], [8, -18], [9, -18]]) P(x, y, '#ece4cc');
    P(7, -21, '#a89c80'); P(9, -23, '#a89c80'); P(8, -19, '#a89c80');
  });
}

// Petite bouteille verte
function prBottle() {
  return sprite(10, 16, (p) => {
    const { R, P } = p;
    const G = ['#0e2614', '#1a4024', '#2a6036', '#3e7e48', '#6aa868', '#a8d898'];
    prCyl(p, -3, -8, 7, 9, G);
    R(-2, -10, 5, 2, G[2]); R(-1, -13, 3, 3, G[2]); P(-1, -12, G[4]);
    R(-1, -14, 3, 1, '#c8925a');
    R(-3, -6, 7, 4, '#e8dcb0'); R(-3, -6, 7, 1, '#b8a880'); P(-1, -4, '#c0392b'); P(1, -4, '#c0392b');
    P(-2, -8, G[5]); P(-2, -1, G[5]);
  });
}

// Chariot bâché en ruine : roue cassée, arceaux, toile déchirée
function prWagonWreck() {
  return sprite(64, 46, (p, c) => {
    const { R, P, line, ell } = p;
    const RED = ['#2e0e06', '#4a1a0c', '#6e2a16', '#8e3e22', '#ae5634', '#c8744c'];
    const r = rng(1849);
    const bedTop = (x) => Math.round(-21 + ((x + 25) * 10) / 46);
    // arceaux du fond
    const ribs = [-19, -6, 8];
    // planche par terre, roue cassée couchée derrière
    line(2, 0, 14, -1, PR_GREY[3], 2); line(2, -1, 14, -2, PR_GREY[4]);
    // caisse inclinée
    for (let x = -25; x <= 20; x++) {
      const t = bedTop(x);
      for (let j = 0; j < 9; j++) {
        const seam = j === 3 || j === 6;
        P(x, t + j, j === 0 ? PR_TEAL[5] : seam ? PR_TEAL[1] : prPick(PR_TEAL, 0.65 - j * 0.04 + (prN(x, j, 3) - 0.5) * 0.25));
      }
      P(x, t + 9, RED[1]); P(x, t + 10, RED[2]);
    }
    for (let x = -3; x <= 3; x++) for (let j = 4; j <= 5 + (x & 1); j++) P(x, bedTop(x) + j, '#1a1410');
    // toile déchirée sur les deux premiers arceaux
    // toile tendue sur les arceaux : creuse entre deux arceaux, plis verticaux ombrés, bas en lambeaux, salie de poussière
    for (let x = ribs[0] - 4; x <= ribs[1] + 6; x++) {
      const t = bedTop(x);
      const fr = clamp((x - ribs[0]) / (ribs[1] - ribs[0]), -0.4, 1.4);
      const inside = fr >= 0 && fr <= 1;
      const sag = inside ? Math.round(Math.sin(fr * Math.PI) * 2) : Math.round(-Math.abs(fr < 0 ? fr : fr - 1) * 3); // bonnet relevé aux bouts
      const top = t - 18 + sag;
      // lambeaux : longueur qui varie, déchirure en diagonale côté droit
      const tear = x > ribs[1] ? (x - ribs[1]) * 2 : 0;
      const lo = t - 3 - Math.floor(r() * 4) - ((x * 7) % 3) - tear;
      const fold = Math.cos(((x - ribs[0]) / (ribs[1] - ribs[0])) * Math.PI * 4); // plis
      for (let y = top; y <= lo; y++) {
        if (prN(x, y, 9) < 0.04 && y > top + 2) continue; // trous
        const depth = (y - top) / 17;
        let k = 0.78 - depth * 0.3 + fold * 0.1 + (y === top ? 0.18 : 0) - (x === ribs[1] + 1 || x === ribs[0] + 1 ? 0.15 : 0);
        if (y > lo - 2 && prN(x, y, 4) < 0.5) k -= 0.2; // ourlet sali
        P(x, y, prPick(PR_CREAM, k));
      }
    }
    for (const x of ribs) {
      const t = bedTop(x), broken = x === ribs[2];
      const h = broken ? 10 : 17;
      R(x - 3, t - h, 1, h, PR_GREY[3]); if (!broken) R(x + 3, t - h, 1, h, PR_GREY[2]);
      if (!broken) { R(x - 2, t - h - 1, 5, 1, PR_GREY[4]); P(x - 3, t - h, PR_GREY[4]); P(x + 3, t - h, PR_GREY[3]); }
      else { line(x - 3, t - h, x + 1, t - h - 4, PR_GREY[3]); for (let y = t - h + 2; y < t - 2; y += 2) P(x - 2, y, PR_CREAM[3]); P(x - 1, t - h + 2, PR_CREAM[2]); }
    }
    // roue cassée appuyée à droite
    prRing(p, 18, -7, 5.2, 7.2, (a) => (a < -0.2 && a > -2.8 ? (a < -1.6 ? RED[4] : RED[3]) : a > 2 ? RED[2] : null));
    for (const a of [-2.4, -1.5, -0.6]) line(18, -7, 18 + Math.cos(a) * 5, -7 + Math.sin(a) * 5, RED[3]);
    line(18, -7, 22, -2, RED[3]); P(18, -7, PR_IRON[3]);
    // roue intacte à gauche
    prSpokeWheel(p, -17, -11, 11, RED, 12);
    grain(c, 0, 0, c.width, c.height, rng(77), 0.08, 0.3);
  });
}

// Lanterne suspendue à sa chaîne ; lit = 1 : allumée
function prLantern(lit) {
  const c = sprite(16, 44, (p) => {
    const { R, P, ell } = p;
    R(-2, -43, 5, 1, PR_IRON[2]);
    for (let y = -42; y <= -21; y++) {
      if (y % 3 === 0) R(-1, y, 3, 1, PR_IRON[2]); else P(0, y, y % 3 === 1 ? PR_IRON[4] : PR_IRON[3]);
    }
    prRing(p, 0, -17, 3.2, 4.3, (a) => (a < 0 ? PR_IRON[3] : null));
    // chapeau conique, cheminée
    R(-1, -19, 3, 1, PR_IRON[2]); R(-3, -18, 7, 1, PR_IRON[3]); R(-4, -17, 9, 2, PR_IRON[2]); R(-4, -17, 9, 1, PR_IRON[4]); R(4, -16, 1, 1, PR_IRON[1]);
    // globe de verre
    const g = lit ? ['#c86018', '#f8a030', '#f8d870', '#fff8d0'] : ['#3a4048', '#5a6670', '#7e8a94', '#b0bcc4'];
    ell(0, -9, 4, 5.4, g[1]); ell(-1, -10, 2.4, 4, g[2]);
    if (lit) { ell(0, -8, 1.2, 2.4, g[3]); P(0, -10, '#ffffff'); P(0, -9, '#ffffff'); }
    else { R(0, -7, 1, 2, '#2a2018'); P(-2, -12, g[3]); P(-2, -11, g[3]); }
    // cage de fil de fer
    for (const x of [-4, 4]) R(x, -13, 1, 9, PR_IRON[1]);
    R(-3, -10, 7, 1, PR_IRON[1]);
    // réservoir
    R(-4, -4, 9, 5, PR_IRON[2]); R(-4, -4, 9, 1, PR_IRON[4]); R(-4, -3, 1, 4, PR_IRON[3]); R(4, -3, 1, 4, PR_IRON[1]);
    R(5, -3, 1, 2, PR_GOLD[2]); // molette de mèche
  });
  return lit ? prGlow(c, 0, -9, 8, ['#c87020', '#f8c050', '#fff0a0'], 0.55) : c;
}

// Virevoltant : boule lâche de brindilles en 3D (arcs de cercles sur des sphères de rayons variés), ombrée selon la
// profondeur (arrière sombre, avant clair) et la lumière haut-gauche. f 0..3 : roule de 22,5° par image autour d'un
// axe oblique ; chaque brindille est répétée 4 fois à 90°, la boucle est donc continue.
const prTwigs = (() => {
  const r = rng(321), out = [];
  for (let k = 0; k < 8; k++) {
    // axe au hasard → base (e1, e2) du grand cercle qui porte la brindille
    const z = r() * 2 - 1, t = r() * Math.PI * 2, q = Math.sqrt(1 - z * z);
    const n = [q * Math.cos(t), q * Math.sin(t), z];
    const h = Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
    const cr = (u, v) => [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const nz = (u) => { const l = Math.hypot(...u); return u.map((c) => c / l); };
    const e1 = nz(cr(n, h)), e2 = cr(n, e1);
    out.push({ e1, e2, R: 6.5 + r() * 2.8, t0: r() * Math.PI * 2, span: 0.55 + r() * 0.6, wob: 0.5 + r() * 0.7, spur: r() < 0.7 });
  }
  return out;
})();
const PR_TW_AXIS = (() => { const v = [0.75, 0.25, 0.6], l = Math.hypot(...v); return v.map((c) => c / l); })();
function prTumbleweed(f) {
  return sprite(24, 24, (p) => {
    const cy = -10, pts = [];
    const cols = ['#3a2810', '#5a4020', '#7a5a30', '#9a7a44', '#bc9a5c', '#dcc084'];
    for (let q = 0; q < 4; q++) {
      // rotation autour d'un axe oblique (Rodrigues) : les 4 copies partent dans la profondeur, pas de rosace plate
      const rot = (q * Math.PI) / 2 + (f * Math.PI) / 8, co = Math.cos(rot), si = Math.sin(rot), K = PR_TW_AXIS;
      const turn = ([x, y, z]) => {
        const d = K[0] * x + K[1] * y + K[2] * z, c = [K[1] * z - K[2] * y, K[2] * x - K[0] * z, K[0] * y - K[1] * x];
        return [0, 1, 2].map((j) => [x, y, z][j] * co + c[j] * si + K[j] * d * (1 - co));
      };
      for (const tw of prTwigs) {
        const n = Math.ceil(tw.span * tw.R * 1.6);
        for (let i = 0; i <= n; i++) {
          const t = tw.t0 + (tw.span * i) / n, R = tw.R + Math.sin(t * 3 + tw.t0) * tw.wob;
          pts.push(turn([0, 1, 2].map((j) => R * (Math.cos(t) * tw.e1[j] + Math.sin(t) * tw.e2[j]))));
        }
        // brindille cassée qui dépasse de la boule (silhouette hérissée)
        if (tw.spur) {
          const t = tw.t0 + tw.span, R = tw.R;
          const [x, y, z] = turn([0, 1, 2].map((j) => R * (Math.cos(t) * tw.e1[j] + Math.sin(t) * tw.e2[j])));
          for (const k of [1.12, 1.22]) if (Math.hypot(x * k, y * k) < 9.6) pts.push([x * k, y * k, z * k]);
        }
      }
    }
    // de l'arrière vers l'avant ; clarté = profondeur + éclairage haut-gauche
    pts.sort((a, b) => a[2] - b[2]);
    for (const [x, y, z] of pts) {
      const R = Math.hypot(x, y, z) || 1;
      const k = 0.5 + (z / R) * 0.42 + ((-x - y) / R) * 0.18;
      p.P(Math.round(x), Math.round(cy + y), prPick(cols, k));
    }
    // cœur dense et sombre, vu à travers les brindilles
    for (const [x, y] of [[0, 0], [1, 0], [0, 1], [-1, 1], [1, -1], [-1, -1]]) p.P(x, cy + y, cols[1]);
    // brindilles qui touchent le sol (elles tournent avec la boule)
    for (let x = -1; x <= 1; x++) p.P(x, 0, cols[(x + 5 + f) % 3 + 1]);
  });
}

// Portes battantes de saloon (« batwing »), panneau vu à travers dans une porte de 1 unité (64 px) : deux vantaux à
// persiennes entre ~0,2 et ~0,75 unité, accrochés à deux montants peints en vert ; tout le reste est transparent.
// f 0 : fermées, f 1 : entrouvertes (~50°), f 2 : grandes ouvertes (~78°) — les vantaux se raccourcissent en tournant,
// le bord libre (plus proche de l'œil) grandit un peu et la face s'assombrit.
const PR_BAT = { wood: '#8a3a22', lite: '#b05a3a', dark: '#521f12', slat: '#c89a5a', slatD: '#6e5432', panel: '#7a3220',
  trim: '#2e4a34', trimL: '#4e6e52', trimD: '#1a2c1e', brass: '#c8a040', brassL: '#f0d070' };
function prBatLeaf(u, y, W, mir) {
  const B = PR_BAT;
  const top = -50 + Math.round(6 * (u / W) ** 2); // haut chantourné : plus haut côté gond
  if (y < top || y > -16) return null;
  if (u < 1) return mir ? B.dark : B.lite; // arêtes : lumière à gauche dans les deux vantaux
  if (u >= W - 1) return mir ? B.lite : B.dark;
  if (u < 2.5 || u >= W - 2.5) return B.wood;
  if (y < top + 2) return y === top ? B.lite : B.wood;
  if (y > -19) return y === -16 ? B.dark : B.wood;
  if (y >= -31 && y <= -29) return y === -31 ? B.dark : y === -29 ? B.lite : B.wood; // traverse du milieu
  if (y < -31) return (y - top) % 2 ? B.slatD : B.slat; // persiennes
  // panneau bas en relief, liseré doré
  if (y === -28 || y === -20 || u < 3.5 || u >= W - 3.5) return B.brass;
  if (y === -27 || u < 4.5) return B.lite;
  if (y === -21 || u >= W - 4.5) return B.dark;
  return B.panel;
}
function prBatwing(f) {
  return sprite(64, 64, (p) => {
    const { R, P } = p;
    const B = PR_BAT, W = 28, th = [0, 0.87, 1.36][f];
    const co = Math.cos(th), si = Math.sin(th), Ws = Math.max(3, Math.round(W * co));
    // montants peints (ils portent les gonds et posent le sprite au sol)
    for (const x of [-31, 29]) { R(x, -56, 2, 57, B.trim); R(x, -56, 1, 57, B.trimL); R(x, -57, 2, 1, B.trimL); R(x, 0, 2, 1, B.trimD); }
    for (const side of [-1, 1]) {
      for (let i = 0; i <= Ws; i++) for (let y = -60; y <= -10; y++) {
        const u = ((i + 0.5) / Ws) * W, s = 1 + 0.1 * si * Math.min(1, u / W);
        const yl = Math.floor(-33 + (y + 33.5) / s);
        let col;
        if (i === Ws) col = th > 0 && yl >= -50 + 6 && yl <= -16 ? B.dark : null; // épaisseur du bord libre
        else col = prBatLeaf(Math.min(u, W - 0.01), yl, W, side > 0);
        if (!col) continue;
        if (th > 0) col = shade(col, -0.28 * si);
        const x = side < 0 ? -29 + i : 28 - i;
        P(x, y, col);
      }
      // gonds de laiton
      const hx = side < 0 ? -29 : 28;
      for (const y of [-47, -20]) { R(hx, y, 1, 3, B.brass); P(hx, y, B.brassL); }
    }
  });
}

// ------------------------------------------------------------------ 6b) décor, passe 2 : intérieurs, chapelle, fort et mine
const PR_SAFE = ['#0a120e', '#132019', '#1c2e23', '#284030', '#385642', '#527658']; // fonte vert bouteille
const PR_STOVE = ['#0e0e10', '#1a1a1e', '#28282e', '#3a3a42', '#54545e', '#7c7c88']; // fonte noire
const PR_NICKEL = ['#2e3036', '#4a4c54', '#7a7e88', '#b4b8c0', '#e4e6ea', '#ffffff'];
const PR_GUN = ['#1a1a1e', '#2a2a30', '#3a3a40', '#4e4e56', '#6a6a74', '#9a9aa4']; // fer de canon
const PR_CAST = ['#111316', '#1c2026', '#2a3036', '#3c444c', '#56606a', '#7c8892']; // fonte peinte
const PR_TIMBER = ['#22160c', '#3a2818', '#4a3220', '#6e4c2e', '#8a6440', '#a8805a']; // charpente de mine
const PR_PEW = ['#1a100a', '#2e1e12', '#44301c', '#5a3a22', '#7a5232', '#9a7048']; // chêne verni sombre
const PR_ORE = ['#2a241e', '#463e36', '#5e544a', '#6a5e52', '#74685a', '#8a7e6e', '#a09482'];
const PR_BRASS = ['#3e2a0c', '#6a4a14', '#9a7024', '#c49a38', '#e2c060', '#f8e8a8'];

// Reflet : éclaircit (k > 0) les pixels déjà peints le long du segment (x0, y0)–(x1, y1), demi-largeur hw
function prSheen(c, x0, y0, x1, y1, hw, k) {
  const ctx = c.getContext('2d'), img = ctx.getImageData(0, 0, c.width, c.height), d = img.data;
  const ox = c.width >> 1, oy = c.height - 1, dx = x1 - x0, dy = y1 - y0, L2 = dx * dx + dy * dy || 1;
  for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
    const i = (y * c.width + x) * 4;
    if (!d[i + 3]) continue;
    const px = x - ox, py = y - oy, t = clamp(((px - x0) * dx + (py - y0) * dy) / L2, 0, 1);
    if (Math.hypot(px - x0 - t * dx, py - y0 - t * dy) > hw) continue;
    for (let j = 0; j < 3; j++) d[i + j] = clamp(d[i + j] * (1 + k) + 8 * k, 0, 255);
  }
  ctx.putImageData(img, 0, 0);
}
const prFrame = (R, x0, y0, x1, y1, col) => {
  R(x0, y0, x1 - x0 + 1, 1, col); R(x0, y1, x1 - x0 + 1, 1, col); R(x0, y0, 1, y1 - y0 + 1, col); R(x1, y0, 1, y1 - y0 + 1, col);
};

// Coffre-fort de banque (~0,8 unité) : fonte vert bouteille à filets d'or, porte « BANK », cadran et levier de laiton
function prSafe() {
  return sprite(44, 52, (p, c) => {
    const { R, P } = p;
    const S = PR_SAFE, G = PR_GOLD;
    const L = -19, X = 12, T = -44, B = -9; // face avant : colonnes L..X, rangées T..B
    // bloc : face avant rangée par rangée (col(y)), flanc droit en fuite de 6 px qui reprend les mêmes rangées assombries
    // (le bas remonte de 2 px : sous l'œil ; le haut descend de 1 px : au-dessus de l'œil)
    const block = (x0, x1, y0, y1, col) => {
      for (let y = y0; y <= y1; y++) R(x0, y, x1 - x0 + 1, 1, col(y));
      for (let i = 1; i <= 6; i++) {
        const t = Math.round(i / 6), b = Math.round((i * 2) / 6);
        for (let y = y0 + t; y <= y1 - b; y++) {
          const src = y0 + Math.round(((y - y0 - t) * (y1 - y0)) / Math.max(1, y1 - y0 - t - b));
          P(x1 + i, y, shade(col(src), i === 6 ? -0.55 : i === 1 ? -0.25 : -0.4));
        }
      }
    };
    // pieds en boule : un au fond à droite, deux devant
    R(16, -4, 3, 3, S[0]); P(16, -4, S[2]);
    for (const x of [-18, 8]) {
      R(x, -3, 5, 3, S[2]); R(x + 1, -3, 3, 1, S[4]); P(x, -2, S[3]); R(x + 4, -2, 1, 2, S[0]); R(x, 0, 5, 1, S[1]); P(x + 1, -2, G[3]);
    }
    // socle mouluré, caisse, corniche ; filets d'or sur la corniche et le socle
    block(L - 1, X + 1, B + 1, B + 5, (y) => [S[4], S[3], G[2], S[2], S[1]][y - B - 1]);
    block(L, X, T, B, (y) => (y === T ? S[1] : y === T + 1 ? S[3] : y > B - 3 ? S[1] : S[2]));
    block(L - 2, X + 2, T - 5, T - 1, (y) => [S[2], S[4], G[2], S[3], S[1]][y - T + 5]);
    R(L, T + 1, 1, B - T - 1, S[3]); R(X, T + 1, 1, B - T - 1, S[3]);
    grain(c, 0, 0, c.width, c.height, rng(4407), 0.06, 0.3);
    // filets d'or : pourtour de la caisse et panneau du flanc
    prFrame(R, L + 1, T + 1, X - 1, B - 1, G[1]);
    R(X + 2, T + 3, 1, B - T - 6, G[1]); R(X + 5, T + 4, 1, B - T - 8, G[1]);
    for (let i = 0; i < 4; i++) { P(X + 2 + i, T + 3 + (i > 2 ? 1 : 0), G[1]); P(X + 2 + i, B - 3 - (i > 1 ? 1 : 0), G[1]); }
    // porte : joint sombre, chant biseauté
    const dx0 = -15, dx1 = 8, dy0 = -40, dy1 = -12;
    prFrame(R, dx0 - 1, dy0 - 1, dx1 + 1, dy1 + 1, S[0]);
    R(dx0, dy0, dx1 - dx0 + 1, dy1 - dy0 + 1, S[2]);
    R(dx0, dy0, dx1 - dx0 + 1, 1, S[4]); R(dx0, dy0, 1, dy1 - dy0 + 1, S[4]);
    R(dx0 + 1, dy0 + 1, dx1 - dx0 - 1, 1, S[3]); R(dx0 + 1, dy0 + 1, 1, dy1 - dy0 - 1, S[3]);
    R(dx0, dy1, dx1 - dx0 + 1, 1, S[0]); R(dx1, dy0, 1, dy1 - dy0 + 1, S[0]);
    R(dx0 + 1, dy1 - 1, dx1 - dx0 - 1, 1, S[1]); R(dx1 - 1, dy0 + 1, 1, dy1 - dy0 - 1, S[1]);
    // « BANK » en lettres d'or ombrées, deux rosettes
    text(R, 'BANK', -10, -36, S[0]); text(R, 'BANK', -11, -37, G[3]);
    text((x, y, w, h) => y === -37 && R(x, y, w, h, G[5]), 'BANK', -11, -37, G[5]);
    for (const x of [-13, 6]) { P(x, -35, G[3]); P(x, -36, G[4]); P(x + 1, -35, G[1]); }
    // panneau en creux (ombre en haut à gauche, lumière en bas à droite), filet d'or et fleurons
    const px0 = -12, px1 = 5, py0 = -31, py1 = -15;
    R(px0, py0, px1 - px0 + 1, 1, S[1]); R(px0, py0, 1, py1 - py0 + 1, S[1]); R(px0, py1, px1 - px0 + 1, 1, S[3]); R(px1, py0, 1, py1 - py0 + 1, S[3]);
    prFrame(R, px0 + 1, py0 + 1, px1 - 1, py1 - 1, G[2]);
    for (const [x, y] of [[px0 + 2, py0 + 2], [px1 - 2, py0 + 2], [px0 + 2, py1 - 2], [px1 - 2, py1 - 2]]) P(x, y, G[3]);
    // cadran à combinaison : lunette de laiton, graduations, bouton, repère rouge
    const ox = -5, oy = -23;
    prRing(p, ox, oy, 3.4, 4.6, (a) => (a < -0.6 && a > -2.8 ? G[4] : a > 0.6 && a < 2.6 ? G[1] : G[2]));
    p.disc(ox, oy, 3.2, '#cbb27a');
    for (let k = 0; k < 8; k++) { const a = (k * Math.PI) / 4; P(ox + Math.round(Math.cos(a) * 2.6), oy + Math.round(Math.sin(a) * 2.6), '#4a3410'); }
    p.disc(ox, oy, 1.4, G[2]); P(ox - 1, oy - 1, G[5]); P(ox, oy, G[1]);
    P(ox, oy - 5, '#c0392b');
    // levier de manœuvre
    p.disc(2, -26, 1.2, G[2]); P(1, -27, G[5]);
    R(2, -25, 1, 6, G[3]); R(3, -25, 1, 6, G[1]); R(1, -19, 3, 2, G[3]); P(1, -19, G[5]); R(1, -18, 3, 1, G[1]);
    // gonds en laiton
    for (const y of [-38, -18]) { R(-18, y, 2, 5, G[3]); R(-18, y, 1, 5, G[4]); P(-17, y + 4, G[1]); P(-18, y - 1, G[5]); P(-17, y + 5, G[1]); }
    // reflet d'émail en biais
    prSheen(c, -17, -12, -7, -43, 1.3, 0.2); prSheen(c, -12, -12, -2, -43, 0.6, 0.12);
  });
}

// Lustre roue de chariot à 6 bougies, pendu à 3 chaînes réunies en une seule qui monte au plafond (comme 'lantern') ;
// lit = 1 : bougies allumées, halos, jante réchauffée
function prChandelier(lit) {
  const flames = [];
  const c = sprite(56, 40, (p) => {
    const { R, P, line } = p;
    const I = PR_IRON, Wd = PR_WOOD, G = PR_BRASS;
    const cy = -13, rx = 23, ry = 4.6;
    const at = (deg) => { const a = (deg * Math.PI) / 180; return [Math.cos(a) * rx, cy + Math.sin(a) * ry, Math.sin(a)]; };
    // rosace du plafond, chaîne unique, anneau de répartition
    R(-3, -39, 7, 1, I[1]); R(-2, -38, 5, 1, I[2]); P(-2, -38, I[4]);
    for (let y = -37; y <= -29; y++) { const m = ((y % 3) + 3) % 3; if (m === 0) R(-1, y, 3, 1, I[2]); else P(0, y, m === 1 ? I[4] : I[3]); }
    prRing(p, 0, -27, 1.1, 2.4, (a) => (a < -0.5 && a > -2.8 ? I[4] : I[2]));
    const chain = (deg, dark) => {
      const [x, y] = at(deg), n = Math.max(Math.abs(x), Math.abs(y + 25));
      for (let i = 0; i <= n; i++) {
        const t = i / n, m = i % 3;
        P(Math.round(x * t), Math.round(-25 + (y + 25) * t), dark ? (m ? I[1] : I[2]) : m === 0 ? I[1] : m === 1 ? I[4] : I[3]);
      }
    };
    // jante : dessus en bois, face intérieure (moitié du fond) ou bandage de fer (moitié avant)
    const rim = (front) => {
      for (const k of [2, 1, 0]) for (let d = 0; d < 360; d += 0.5) {
        const [x, y, s] = at(d);
        if (s > 0 !== front) continue;
        const lx = clamp(0.5 - x / (rx * 2.2), 0, 1);
        const col = k === 0 ? prPick(Wd, 0.55 + lx * 0.35 + (lit ? 0.12 : 0)) : front ? (k === 1 ? prPick(I, 0.2 + lx * 0.55) : I[1]) : Wd[k === 1 ? 1 : 0];
        P(Math.round(x), Math.round(y) + k, col);
      }
    };
    const candle = (deg) => {
      const [x, y] = at(deg), X = Math.round(x), Y = Math.round(y);
      R(X - 1, Y - 1, 4, 1, G[3]); P(X - 1, Y - 1, G[5]); P(X + 2, Y - 1, G[1]); // bobèche
      R(X, Y - 7, 2, 6, PR_CREAM[3]); R(X, Y - 7, 1, 6, PR_CREAM[5]); P(X + 1, Y - 3, PR_CREAM[2]); P(X, Y - 4, PR_CREAM[4]);
      P(X + 1, Y - 7, PR_CREAM[4]);
      if (lit) {
        P(X, Y - 8, '#f8b830'); P(X + 1, Y - 8, '#e09020');
        P(X, Y - 9, '#fffbe8'); P(X + 1, Y - 9, '#fff070');
        P(X, Y - 10, '#fff070'); P(X + 1, Y - 10, '#f8c050'); P(X, Y - 11, '#f8d070');
        P(X, Y - 7, '#fff0c0'); // cire éclairée par la flamme
        flames.push([X + 0.5, Y - 9.5]);
      } else P(X, Y - 8, '#2a2018');
    };
    const cand = [15, 75, 135, 195, 255, 315];
    rim(false);
    chain(285, true);
    for (const d of cand) if (Math.sin((d * Math.PI) / 180) < 0) candle(d);
    // rayons et moyeu
    for (let k = 0; k < 8; k++) {
      const a = (k * Math.PI) / 4 + Math.PI / 8;
      line(0, cy + 1, Math.cos(a) * (rx - 1.5), cy + 1 + Math.sin(a) * (ry - 0.6), Math.sin(a) < 0 ? Wd[2] : Wd[3]);
    }
    p.ell(0, cy + 1, 4, 2, Wd[2]); p.ell(-0.5, cy, 3, 1.2, lit ? Wd[5] : Wd[4]); R(-4, cy + 2, 9, 1, I[2]); P(-3, cy + 2, I[4]);
    chain(45, false); chain(165, false);
    rim(true);
    for (const d of cand) if (Math.sin((d * Math.PI) / 180) >= 0) candle(d);
    // nave et pendeloque de laiton jusqu'au bas du sprite
    R(-2, cy + 3, 5, 2, Wd[1]); P(-2, cy + 3, Wd[3]);
    [[-8, 0], [-7, 1], [-6, 2], [-5, 1], [-4, 2], [-3, 2], [-2, 1], [-1, 1], [0, 0]].forEach(([y, hw]) => prCyl(p, -hw, y, 2 * hw + 1, 1, G, y === -6 ? 0.1 : 0));
    P(-1, -4, G[5]);
  });
  if (lit) for (const [x, y] of flames) prGlow(c, x, y, 5, ['#c87020', '#f8c050', '#fff0a0'], 0.62);
  return c;
}

// Banc de salle d'attente (vu de face) : lattes de chêne verni sur deux flasques de fonte à volutes et un pied central
function prBench() {
  return sprite(64, 28, (p, c) => {
    const { R, P } = p;
    const Wd = PR_WOOD, K = PR_CAST;
    // pieds arrière (dans l'ombre, un peu plus haut : plus loin sur le sol)
    for (const x of [-25, 23]) { R(x, -13, 2, 12, K[1]); R(x - 1, -2, 4, 1, K[0]); }
    // montants du dossier (derrière les lattes) et support central
    for (const x of [-28, 26]) { R(x, -26, 2, 13, K[2]); R(x, -26, 1, 13, K[3]); }
    R(-1, -26, 2, 7, K[1]);
    // dossier : deux lattes ; les interstices (dossier / dossier / assise) laissent voir le mur
    for (const [y, k] of [[-26, 0.05], [-23, -0.05]]) { R(-30, y, 60, 1, prPick(Wd, 0.8 + k)); R(-30, y + 1, 60, 1, prPick(Wd, 0.45 + k)); }
    // assise vue d'en haut (lattes qui fuient, dessus éclairé), puis le chant arrondi de la latte avant
    R(-30, -20, 60, 1, Wd[4]); R(-30, -19, 60, 1, Wd[1]); R(-30, -18, 60, 1, Wd[4]); R(-30, -17, 60, 1, Wd[2]); R(-30, -16, 60, 1, Wd[5]);
    R(-30, -15, 60, 2, Wd[3]); R(-30, -13, 60, 1, Wd[1]);
    grain(c, 0, 0, c.width, c.height - 12, rng(6402), 0.09, 0.4);
    // bouts des lattes, reflets du vernis, boulons
    for (const x of [-30, 29]) { for (const y of [-26, -23]) R(x, y, 1, 2, Wd[2]); R(x, -15, 1, 3, Wd[2]); }
    for (const [x, y, w] of [[-22, -26, 9], [6, -26, 5], [-14, -23, 6], [-24, -15, 7], [10, -15, 4]]) R(x, y, w, 1, Wd[5]);
    for (const x of [-28, 26, -1]) for (const y of [-26, -23, -14]) P(x + 1, y, K[4]);
    // flasques : accoudoir en volute vu de face, pied galbé, patin roulé
    for (const s of [-1, 1]) {
      const x0 = s < 0 ? -28 : 26;
      prRing(p, x0 + 0.5, -19, 0.7, 2.1, (a) => (a < -0.3 && a > -2.6 ? K[4] : K[2]));
      for (let y = -17; y <= -1; y++) {
        const o = y > -7 ? Math.round(((y + 7) / 6) ** 2 * 2) : 0, x = x0 + s * o;
        P(x, y, y < -12 ? K[4] : K[3]); P(x + 1, y, K[1]);
      }
      const fx = x0 + 2 * s;
      R(fx - 1, 0, 4, 1, K[1]); P(fx + (s < 0 ? -1 : 2), -1, K[3]);
    }
    // pied central
    R(-1, -12, 2, 12, K[3]); R(-1, -12, 1, 12, K[4]); R(-1, -12, 2, 1, K[1]); R(-3, 0, 6, 1, K[1]); P(-3, -1, K[3]); P(2, -1, K[2]);
  });
}

// Poêle ventru du bureau du shérif : tuyau qui monte jusqu'au plafond (83 px ≈ 1,3 unité), cafetière émaillée qui fume,
// fenêtres de mica qui rougeoient ; f 0 / 1 : le feu vacille
function prStove(f) {
  const c = sprite(24, 83, (p) => {
    const { R, P, line } = p;
    const K = PR_STOVE, N = PR_NICKEL;
    const fire = f ? ['#8a2a0c', '#d0501a', '#f88a24', '#f8c050', '#fff0a0'] : ['#5a1608', '#9a3010', '#d05a18', '#f08a2a', '#f8c060'];
    const row = (y, hw, k = 0, ramp = K) => prCyl(p, -hw, y, 2 * hw + 1, 1, ramp, k);
    // pieds galbés (le troisième, au fond, dépasse au milieu)
    R(-1, -4, 3, 4, K[0]);
    for (const s of [-1, 1]) for (const [x, y] of [[5, -4], [5, -3], [6, -3], [6, -2], [7, -1], [7, 0], [8, 0]]) P(s * x, y, s < 0 ? K[4] : K[2]);
    // cendrier et sa porte à fentes
    row(-5, 7, 0.05);
    for (let y = -11; y <= -6; y++) row(y, 6);
    row(-12, 7, 0.12);
    R(-3, -10, 7, 4, K[0]); R(-3, -10, 7, 1, K[3]);
    for (const y of [-9, -7]) { R(-2, y, 5, 1, fire[f ? 2 : 1]); P(-2, y, fire[0]); P(2, y, fire[0]); }
    // panse
    for (let y = -29; y <= -13; y++) row(y, Math.round(6.5 + 3.6 * Math.sin((Math.PI * (y + 29.5)) / 17.5)), y > -17 ? -0.12 : 0.02);
    row(-14, 7, 0, N); row(-28, 7, 0, N);
    // porte : la fonte rougit autour ; cadre ; deux fenêtres de mica en ogive
    R(-5, -27, 11, 12, f ? '#6a1e10' : '#3e1610');
    R(-4, -26, 9, 10, K[3]); R(-4, -26, 9, 1, K[4]); R(-4, -26, 1, 10, K[4]); R(4, -26, 1, 10, K[1]); R(-4, -17, 9, 1, K[1]);
    for (const wx of [-3, 1]) for (let y = -24; y <= -18; y++) for (let x = wx; x < wx + 3; x++) {
      if (y === -24 && x !== wx + 1) continue;
      const n = prN(x, y, 7 + f);
      P(x, y, fire[clamp(Math.round(0.6 + (y + 24) / 2.4 + n * 1.6 - (x === wx + 2 ? 0.8 : 0)), 0, 4)]);
    }
    R(0, -24, 1, 7, K[2]);
    P(5, -21, N[4]); P(5, -20, N[2]); // loquet
    R(-5, -25, 1, 2, N[3]); R(-5, -19, 1, 2, N[3]); // gonds
    // collet, plateau de cuisson à jonc nickelé
    for (let y = -33; y <= -30; y++) row(y, 6, y === -33 ? 0.1 : 0);
    row(-30, 7, 0, N);
    for (let y = -36; y <= -34; y++) row(y, 8, y === -36 ? 0.25 : y === -34 ? -0.15 : 0);
    row(-34, 8, -0.1, N);
    // tuyau jusqu'au plafond : emboîtures, clé de tirage, collerette
    prCyl(p, -1, -82, 5, 46, K);
    for (const y of [-49, -61, -73]) { prCyl(p, -2, y, 7, 1, K, 0.15); prCyl(p, -2, y + 1, 7, 1, K, -0.12); }
    prCyl(p, -3, -82, 9, 2, K, 0.05);
    R(-4, -45, 4, 1, N[3]); R(-6, -46, 2, 3, N[2]); P(-6, -46, N[4]); P(4, -45, N[1]);
    // cafetière en tôle émaillée bleue mouchetée
    const E = ['#0e1a30', '#1a2c4c', '#2a4470', '#3c5e92', '#5a80b4', '#8aaad4'];
    line(-8, -40, -10, -44, E[2], 2); P(-11, -45, E[3]);
    for (let y = -42; y <= -37; y++) prCyl(p, y < -40 ? -7 : -8, y, y < -40 ? 5 : 7, 1, E, y === -37 ? -0.2 : 0);
    prCyl(p, -7, -43, 5, 1, E, 0.2); prCyl(p, -6, -44, 3, 1, E, 0.1); P(-5, -45, E[2]);
    for (const [x, y] of [[-7, -39], [-4, -41], [-3, -38], [-6, -37], [-5, -42]]) P(x, y, '#dfe8f4');
    for (const [x, y] of [[-1, -42], [0, -41], [0, -40], [-1, -39]]) P(x, y, E[3]);
  });
  // vapeur qui sort du bec (sans contour), lueur du feu par terre entre les pieds
  const q = pen(c, 12, 82);
  for (const [x, y, k] of f ? [[-11, -47, 1], [-10, -49, 0], [-11, -51, 0]] : [[-10, -47, 1], [-11, -48, 0], [-10, -50, 0], [-10, -52, 0]]) q.P(x, y, k ? '#f0f2f4' : '#c8ccd0');
  return prGlow(c, 0, -1, f ? 5 : 4, ['#5a1a08', '#a83a10', '#f07a20'], f ? 0.6 : 0.4);
}

// Crachoir de laiton
function prSpittoon() {
  return sprite(12, 10, (p) => {
    const { R, P } = p;
    const G = PR_BRASS;
    // large cuvette évasée en haut, col pincé, panse trapue, pied plat
    for (const [y, x0, x1, k] of [[0, -4, 3, -0.3], [-1, -5, 4, -0.12], [-2, -5, 4, 0.02], [-3, -4, 3, 0.08], [-4, -2, 1, -0.3], [-5, -3, 2, -0.2], [-6, -5, 4, 0.18], [-7, -5, 4, 0.1], [-8, -4, 3, 0.15]]) {
      prCyl(p, x0, y, x1 - x0 + 1, 1, G, k);
    }
    R(-4, -7, 8, 1, '#2a1606'); R(-3, -8, 6, 1, '#4a2a0a'); P(1, -7, '#5a3a10'); // embouchure
    P(-4, -6, G[5]); P(-3, -2, G[5]); P(-4, -1, G[4]); R(-4, 0, 8, 1, G[1]);
  });
}

// Banc d'église vu de dos : dossier à trois lisses, casier à cantiques, assise, prie-Dieu, joues arrondies
function prPew() {
  return sprite(56, 22, (p, c) => {
    const { R, P } = p;
    const Wd = PR_PEW, LEG = '#2e1e12';
    // pied central et prie-Dieu bas (vus sous l'assise, le reste du dessous est vide)
    R(-1, -5, 2, 6, LEG); P(-1, -5, Wd[2]);
    R(-21, -2, 42, 2, Wd[2]); R(-21, -2, 42, 1, Wd[4]); for (const x of [-20, 18]) R(x, 0, 2, 1, LEG);
    // dossier : lisse haute à chapeau, deux lisses, fond sombre ; puis tranche de l'assise
    R(-24, -18, 48, 12, Wd[1]);
    R(-24, -18, 48, 1, Wd[5]); R(-24, -17, 48, 1, Wd[4]); R(-24, -16, 48, 1, Wd[2]);
    for (const y of [-14, -10]) { R(-24, y, 48, 1, Wd[4]); R(-24, y + 1, 48, 1, Wd[3]); R(-24, y + 2, 48, 1, Wd[2]); }
    R(-24, -7, 48, 1, Wd[0]); R(-24, -6, 48, 1, Wd[4]); R(-24, -5, 48, 1, Wd[2]);
    grain(c, 0, 0, c.width, c.height, rng(1517), 0.08, 0.35);
    for (const [x, y, w] of [[-19, -18, 9], [3, -18, 6], [-12, -14, 5], [14, -14, 4], [-16, -6, 7], [8, -6, 4]]) R(x, y, w, 1, '#b08458'); // vernis
    // casier à cantiques : rangées de livres debout derrière un rebord
    const BK = ['#6a1c16', '#2a2420', '#34442a', '#7a3a1e', '#24304a', '#4a1410'];
    for (const [x0, n] of [[-20, 9], [5, 7]]) for (let i = 0; i < n; i++) {
      const h = 3 + ((i * 7 + (x0 & 7)) % 3 === 0 ? 1 : 0), col = BK[(i * 3 + (x0 & 5)) % BK.length];
      R(x0 + i, -10 - h, 1, h, col); P(x0 + i, -10 - h, shade(col, 0.25));
    }
    P(5 + 7, -12, '#34442a'); P(5 + 8, -11, '#34442a'); // livre penché
    R(-22, -10, 44, 1, Wd[5]); R(-22, -9, 44, 1, Wd[3]); R(-22, -8, 44, 1, Wd[1]);
    // joues : oreilles arrondies au-dessus du dossier, croix sculptée, pieds échancrés
    for (const x0 of [-27, 23]) {
      for (let y = -20; y <= 0; y++) for (let i = 0; i < 4; i++) {
        if (y === -20 && (i === 0 || i === 3)) continue;
        if (y >= -2 && (i === 1 || i === 2)) continue;
        P(x0 + i, y, y > -5 ? (i === 0 ? Wd[2] : LEG) : [Wd[4], Wd[3], Wd[3], Wd[1]][i]);
      }
      P(x0 + 1, -20, Wd[5]); P(x0 + 2, -20, Wd[4]); P(x0, -19, Wd[5]); P(x0 + 3, -19, Wd[2]);
      R(x0 + 1, -15, 1, 5, Wd[1]); R(x0, -14, 3, 1, Wd[1]); P(x0 + 2, -13, Wd[5]); P(x0 + 1, -10, Wd[5]);
    }
  });
}

// Croix d'autel dorée (sans chapeau) sur l'autel drapé : nappe blanche, chemin rouge, deux chandeliers
function prAltarCross() {
  return sprite(24, 44, (p) => {
    const { R, P } = p;
    const G = PR_GOLD, D = PR_DARKW;
    const CL = ['#8a8270', '#b0a894', '#d0c8b4', '#e8e0d0', '#f6f0e4'];
    const RU = ['#4a120e', '#6a1a14', '#8a2a22', '#a83a2e', '#c45a48'];
    // socle de bois sombre
    R(-11, -2, 22, 3, D[2]); R(-11, -2, 22, 1, D[4]); R(-11, 0, 22, 1, D[1]); R(10, -2, 1, 3, D[1]); R(-11, -1, 1, 2, D[3]);
    // nappe : dessus vu d'en haut, pan drapé à plis, dentelle
    R(-10, -13, 20, 2, CL[4]); R(-10, -13, 20, 1, CL[3]);
    for (let x = -10; x <= 9; x++) for (let y = -11; y <= -4; y++) {
      const fold = Math.sin((x + 10) * 1.15);
      P(x, y, CL[clamp(3 + (fold > 0.35 ? 1 : fold < -0.35 ? -1 : 0) + (x < -6 ? 1 : 0) - (x >= 7 ? 1 : 0) - (y === -4 ? 1 : 0), 0, 4)]);
    }
    for (let x = -10; x <= 9; x += 2) P(x, -3, CL[4]);
    // chemin d'autel rouge bordé d'or, frange, losange brodé
    for (let y = -13; y <= -2; y++) for (let x = -3; x <= 2; x++) P(x, y, y <= -12 ? RU[4] : x === -3 || x === 2 ? G[2] : RU[x === -2 ? 3 : x === 1 ? 1 : 2]);
    for (let x = -3; x <= 2; x++) P(x, -1, x & 1 ? G[3] : G[1]);
    P(-1, -9, G[4]); P(0, -9, G[3]); P(-2, -8, G[3]); P(1, -8, G[2]); P(-1, -7, G[3]); P(0, -7, G[2]);
    // chandeliers de laiton
    for (const x of [-8, 7]) {
      R(x - 1, -14, 3, 1, G[2]); P(x - 1, -14, G[4]); R(x, -17, 1, 3, G[3]); R(x - 1, -18, 3, 1, G[3]); P(x - 1, -18, G[5]);
      R(x, -21, 1, 3, CL[4]); P(x, -22, '#fff070'); P(x, -23, '#f8b830');
    }
    // degrés dorés
    R(-4, -15, 8, 2, G[2]); R(-4, -15, 8, 1, G[4]); P(3, -14, G[1]);
    R(-3, -17, 6, 2, G[2]); R(-3, -17, 6, 1, G[4]); P(2, -16, G[1]);
    // croix pattée à boules : biseau (moitié éclairée en haut à gauche), arêtes claires / sombres
    const set = new Set(), add = (x, y) => set.add(x + ',' + y), has = (x, y) => set.has(x + ',' + y);
    for (let y = -40; y <= -18; y++) for (let x = -2; x <= 1; x++) add(x, y);
    for (let x = -8; x <= 7; x++) for (let y = -35; y <= -32; y++) add(x, y);
    for (let x = -3; x <= 2; x++) for (const y of [-40, -39, -19, -18]) add(x, y);
    for (let y = -36; y <= -31; y++) for (const x of [-8, -7, 6, 7]) add(x, y);
    for (const [x, y] of [[-1, -42], [0, -42], [-1, -41], [0, -41], [-10, -34], [-10, -33], [-9, -34], [-9, -33], [8, -34], [8, -33], [9, -34], [9, -33]]) add(x, y);
    for (const k of set) {
      const [x, y] = k.split(',').map(Number);
      const l = !has(x - 1, y) || !has(x, y - 1), d = !has(x + 1, y) || !has(x, y + 1);
      const bar = y >= -36 && y <= -31 && Math.abs(x + 0.5) > 2.5, mid = y >= -36 && y <= -31;
      const lit = bar ? y < -33.5 : !mid ? x < -0.5 : x + 0.5 + (y + 33.5) < 0;
      P(x, y, l && !d ? G[5] : d && !l ? G[1] : l && d ? G[3] : lit ? G[4] : G[2]);
    }
    // cabochon de rubis au croisement
    R(-2, -35, 4, 4, G[3]); P(-2, -35, G[5]); R(-1, -34, 2, 2, '#9a2418'); P(-1, -34, '#f05038'); P(1, -32, G[1]);
  });
}

// Canon de campagne (profil, bouche à droite) : fût de fer à renforts, affût à flèche, roue à 8 rais, boulets
function prCannon() {
  return sprite(56, 36, (p) => {
    const { R, P, line } = p;
    const W = ['#2e1e10', '#4a3220', '#6e4c2e', '#8a6440', '#a8805a'], I = PR_GUN;
    const hx = 2, hy = -13;
    // roue de l'autre côté : on n'en voit que le bandage
    prRing(p, hx + 3, hy - 1, 11.4, 12.8, () => '#1e1a18');
    // flèche d'affût : remonte de la crosse (au sol, à gauche) jusqu'aux flasques sous les tourillons
    for (let x = -27; x <= 8; x++) {
      const top = Math.round(-4 - ((x + 26) * 15) / 31), bot = x <= -22 ? 0 : Math.round(-((x + 22) * 13) / 31);
      for (let y = top; y <= bot; y++) P(x, y, y === top ? W[4] : y === top + 1 ? W[3] : y >= bot - 1 ? W[1] : W[2]);
    }
    R(-27, -2, 4, 3, '#2a2624'); P(-27, -2, '#5a504a'); // sabot de crosse
    prRing(p, -22, -8, 0.8, 2, (a) => (a < 0 ? I[4] : I[1])); // anneau de manœuvre
    for (const x of [-16, -5]) { const t = Math.round(-4 - ((x + 26) * 15) / 31); line(x, t, x + 1, t + 6, '#2a2624'); P(x, t + 1, I[4]); } // ferrures
    R(-11, -16, 1, 4, I[3]); P(-12, -14, I[4]); // vis de pointage
    // fût : renfort de culasse, astragale, bourrelet de bouche ; lumière du haut
    const yc = (x) => -19.5 - (x + 15) * 0.07, rr = (x) => 4.6 - ((x + 15) / 40) * 1.1;
    for (let x = -15; x <= 25; x++) {
      let r = rr(x);
      if (x <= -12) r += 0.9; else if (x === -1 || x === 0) r += 0.6; else if (x >= 22) r += 0.5 + (x === 25 ? 0.3 : 0);
      const c0 = yc(x);
      for (let y = Math.round(c0 - r); y <= Math.round(c0 + r); y++) {
        const v = (y - c0) / r;
        P(x, y, prPick(I, 0.95 - Math.abs(v + 0.45) * 0.75 - (x === -11 || x === 1 || x === 21 ? 0.18 : 0) + (x === 25 ? 0.1 : 0)));
      }
    }
    const cb = Math.round(yc(-15));
    R(-17, cb - 1, 2, 3, I[2]); P(-17, cb - 1, I[3]); p.disc(-19, cb, 1.8, I[2]); P(-20, cb - 1, I[4]); P(-19, cb + 1, I[1]); // bouton de culasse
    // roue : bandage, jante, rais, moyeu
    prRing(p, hx, hy, 11.8, 13.5, (a) => (a > -2.6 && a < -0.9 ? '#5a524c' : '#2a2624'));
    prRing(p, hx, hy, 9.8, 11.8, (a) => (a > -2.6 && a < -0.6 ? W[4] : a > 0.4 && a < 2.2 ? W[1] : W[2]));
    for (let k = 0; k < 8; k++) {
      const a = (k * Math.PI) / 4 + 0.39, ca = Math.cos(a), sa = Math.sin(a);
      line(hx + ca * 2.5 + 0.7, hy + sa * 2.5 + 0.7, hx + ca * 10 + 0.7, hy + sa * 10 + 0.7, W[0]); // ombre du rai
      line(hx + ca * 2.5, hy + sa * 2.5, hx + ca * 10, hy + sa * 10, sa < 0.2 && ca < 0.6 ? W[4] : W[3]);
    }
    p.disc(hx, hy, 3, W[1]); p.disc(hx - 0.5, hy - 0.5, 2.2, W[3]); p.disc(hx, hy, 1.2, I[2]); P(hx - 1, hy - 1, I[5]); P(hx, hy, I[1]);
    // pile de boulets
    const ball = (bx, by) => {
      for (let y = by - 3; y <= by + 3; y++) for (let x = bx - 3; x <= bx + 3; x++) {
        const nx = (x - bx) / 2.5, ny = (y - by) / 2.5, d = Math.hypot(nx, ny);
        if (d > 1.02) continue;
        P(x, y, prPick(PR_GUN, 0.32 - nx * 0.28 - ny * 0.38 - (d > 0.8 ? 0.12 : 0) + (nx < -0.2 && ny < -0.2 && d < 0.75 ? 0.35 : 0)));
      }
    };
    ball(18, -2); ball(24, -2); ball(21, -6);
  });
}

// Fanion de cavalerie à queue d'aronde (rouge sur blanc, « US » / « C ») en haut d'un mât ; f 0..2 : le vent l'agite
const PR_FLAG_R = ['#4a0c06', '#6e140c', '#8a1c12', '#a42418', '#c43a28', '#e05a40'];
const PR_FLAG_W = ['#6a6250', '#9a9078', '#c4b89c', '#e8dcc0', '#f8f0dc', '#fffaf0'];
function prFlag(f) {
  return sprite(24, 96, (p) => {
    const { R, P } = p;
    const W = 18, H = 21, nd = 7, y0 = -89, x0 = -8;
    // mât, pommeau doré, taquet de drisse
    R(-10, -90, 1, 91, '#b08a5a'); R(-9, -90, 1, 91, '#8a6440');
    for (const y of [-64, -38, -14]) P(-9, y, '#6a4a2c');
    R(-10, -91, 2, 1, '#a07820'); R(-11, -93, 3, 2, '#d8b040'); P(-11, -93, '#f8e08a'); P(-10, -94, '#f8e08a'); P(-9, -92, '#a07820');
    R(-8, -40, 2, 1, PR_IRON[2]); P(-8, -41, PR_IRON[4]);
    // tertre et pierres de calage
    R(-11, -1, 6, 2, '#5e4a32'); R(-10, -2, 4, 1, '#7a6040'); P(-11, 0, PR_STONE[3]); P(-6, 0, PR_STONE[2]); P(-7, -1, PR_STONE[4]); P(-11, -1, PR_STONE[2]);
    // fanion : grille plate (u le long, v en hauteur), plissée par une onde qui grandit vers le bout libre
    const flat = (u, v) => {
      if (u > W - nd - 1 && Math.abs(v - 10) < (u - (W - nd - 1)) * (8.6 / nd)) return null;
      const red = v < 10, g = red ? 'US' : 'C', gu = red ? 2 : 3, gv = red ? 2 : 13;
      let ink = false;
      for (let k = 0; k < g.length; k++) { const i = u - gu - k * 4, j = v - gv; if (i >= 0 && i < 3 && j >= 0 && j < 5 && GLYPHS[g[k]][j * 3 + i] === '1') ink = true; }
      return red !== ink ? 'r' : 'w';
    };
    const Wf = W + [0, 1, -1][f], ph = (f * 2 * Math.PI) / 3;
    for (let i = 0; i < Wf; i++) {
      const u = Math.min(W - 1, Math.round((i * (W - 1)) / (Wf - 1))), s = u / (W - 1);
      const dy = Math.round(Math.sin(u * 0.62 - ph) * (0.15 + 1.75 * s ** 1.7)); // la guindante reste droite (lettres lisibles)
      const k = Math.cos(u * 0.62 - ph) * 0.2 * Math.min(1, s * 3);
      for (let v = 0; v < H; v++) {
        const t = flat(u, v);
        if (!t) continue;
        const e = v === 0 ? 0.12 : v === H - 1 ? -0.14 : 0;
        P(x0 + i, y0 + v + dy, prPick(t === 'r' ? PR_FLAG_R : PR_FLAG_W, 0.6 + k + e - (u === 0 ? 0.2 : 0)));
      }
    }
  });
}

// Tas de minerai : blocs taillés en facettes (lumière en haut à gauche), paillettes d'or, pic appuyé à droite
function prOrePile() {
  return sprite(36, 22, (p, c) => {
    const { R, P, line, poly } = p;
    const O = PR_ORE, r = rng(2187);
    const chunks = [[-1, -12, 5.5], [-8, -9, 5], [6, -9, 5], [-13, -4, 4], [13, -4, 4], [-4, -5, 5], [3, -4, 5.5], [-9, -2, 3.5], [9, -2, 3.5], [-15, -1.5, 2.5], [0, -1.5, 3], [15, -1.5, 2]];
    chunks.sort((a, b) => a[1] - b[1]);
    for (const [cx, cy, rad] of chunks) {
      const n = 6 + Math.floor(r() * 2), a0 = r() * Math.PI, pts = [];
      for (let i = 0; i < n; i++) {
        const a = a0 + (i / n) * Math.PI * 2 + (r() - 0.5) * 0.5, rr = rad * (0.78 + r() * 0.3);
        pts.push([cx + Math.cos(a) * rr * 1.15, Math.min(0.5, cy + Math.sin(a) * rr * 0.9)]);
      }
      poly(pts.map(([x, y]) => [cx + (x - cx) * (1 + 1.3 / rad), cy + (y - cy) * (1 + 1.3 / rad)]), O[0]); // joint sombre
      const pk = [cx - rad * 0.25, cy - rad * 0.3];
      for (let i = 0; i < n; i++) {
        const a = pts[i], b = pts[(i + 1) % n], mx = (a[0] + b[0]) / 2 - pk[0], my = (a[1] + b[1]) / 2 - pk[1], l = Math.hypot(mx, my) || 1;
        poly([pk, a, b], prPick(O, 0.12 + (0.5 + (0.5 * (-mx * 0.55 - my * 0.85)) / l) * 0.85 - (cy > -3 ? 0.05 : 0)));
      }
    }
    grain(c, 0, 0, c.width, c.height, rng(77), 0.1, 0.3);
    // paillettes d'or
    for (const [x, y, w] of [[-3, -14, 1], [7, -10, 0], [-8, -5, 1], [3, -4, 0]]) { P(x, y, '#e8c048'); P(x + 1, y, '#a87a20'); if (w) P(x, y - 1, '#fff4c0'); else P(x + 1, y - 1, '#e8c048'); }
    // pic : manche de 1 px appuyé sur le tas, fer recourbé
    line(16, -1, 8, -18, '#7a5634'); P(15, -2, '#9a7448'); P(12, -10, '#9a7448');
    line(3, -14, 6, -17, '#4a4a52'); line(7, -18, 10, -19, '#4a4a52', 2); line(11, -19, 14, -17, '#4a4a52');
    line(4, -16, 6, -18, '#8a8a94'); R(7, -19, 4, 1, '#9a9aa4'); P(12, -19, '#8a8a94'); P(3, -13, '#2e2e34'); P(14, -16, '#2e2e34');
  });
}

// Chevalement de mine en A : charpente à croix de Saint-André, molette sous un auvent, câble, cage
function prHeadframe() {
  return sprite(64, 128, (p, c) => {
    const { R, P, line, poly } = p;
    const T = PR_TIMBER, I = PR_GUN, BOLT = '#2a2624', CAB = '#1a1612';
    const deck = -98, legX = (y) => 28 - (18 * -y) / -deck;
    const bolt = (x, y) => { R(x, y, 2, 2, BOLT); P(x, y, '#5a504a'); };
    // sole
    R(-31, -2, 62, 3, T[3]); R(-31, -2, 62, 1, T[4]); R(-31, 0, 62, 1, T[1]);
    // jambes arrière
    for (const s of [-1, 1]) line(s * 23, -2, s * 8, deck, T[1], 2);
    // câble du puits (au milieu de la tour : derrière la charpente de devant)
    R(-10, -101, 1, 74, CAB);
    // croix de Saint-André sur 3 étages
    const lv = [0, -33, -66, deck];
    for (let k = 0; k < 3; k++) {
      const yb = lv[k] - 2, yt = lv[k + 1] + 2, xb = legX(yb) - 2, xt = legX(yt) - 2;
      line(-xb, yb, xt, yt, T[1], 2);
      line(xb, yb, -xt, yt, T[2], 2); line(xb, yb - 1, -xt, yt - 1, T[4]);
      bolt(-1, Math.round((yb + yt) / 2) - 1);
    }
    // moises horizontales
    for (const y of [-33, -66]) { const xo = Math.round(legX(y)); R(-xo, y - 1, 2 * xo + 1, 3, T[3]); R(-xo, y - 1, 2 * xo + 1, 1, T[4]); R(-xo, y + 1, 2 * xo + 1, 1, T[1]); }
    grain(c, 0, 0, c.width, c.height, rng(1878), 0.09, 0.35);
    // jambes avant (arête claire à gauche)
    for (const s of [-1, 1]) for (let y = deck; y <= 0; y++) {
      const x = Math.round(s * legX(y));
      P(x - 2, y, T[4]); R(x - 1, y, 2, 1, T[3]); P(x + 1, y, T[1]);
    }
    for (const s of [-1, 1]) for (const y of [-34, -67, -96]) bolt(Math.round(s * legX(y)) - 1, y);
    // semelles de pierre
    for (const s of [-1, 1]) { R(s * 28 - 2, -3, 5, 3, PR_STONE[3]); R(s * 28 - 2, -3, 5, 1, PR_STONE[4]); R(s * 28 + 2, -2, 1, 2, PR_STONE[1]); }
    // chapeau du chevalement, poteaux et poutre de la molette
    R(-16, deck - 3, 33, 4, T[3]); R(-16, deck - 3, 33, 1, T[4]); R(-16, deck, 33, 1, T[1]);
    for (const x of [-15, 14]) { R(x, -123, 2, 22, T[3]); R(x, -123, 1, 22, T[4]); R(x + 1, -123, 1, 22, T[2]); }
    R(-14, -112, 28, 3, T[2]); R(-14, -112, 28, 1, T[3]);
    // auvent de planches
    poly([[-18, -123], [18.5, -123], [0.5, -127]], T[2]);
    poly([[-18, -123], [0.5, -123], [0.5, -127]], T[3]);
    for (let x = -14; x <= 14; x += 4) R(x, -125 + Math.round(Math.abs(x) / 9), 1, 3, T[1]);
    R(-18, -124, 37, 1, T[4]); R(-18, -123, 37, 1, T[1]);
    // molette : flasque éclairée en haut à gauche, gorge sombre, 6 rais, moyeu
    const wy = -111;
    const lit = (a) => (a > -2.6 && a < -0.6 ? 1 : a > 0.6 && a < 2.4 ? -1 : 0);
    prRing(p, 0, wy, 8.6, 11.3, (a, d) => (d < 9.6 ? I[3 + lit(a)] : d < 10.4 ? I[0] : I[2 + lit(a) * 2]));
    for (let k = 0; k < 6; k++) {
      const a = (k * Math.PI) / 3 + 0.26, ca = Math.cos(a), sa = Math.sin(a);
      line(ca * 2.5 + 0.6, wy + sa * 2.5 + 0.6, ca * 8.6 + 0.6, wy + sa * 8.6 + 0.6, I[0]); // ombre du rai
      line(ca * 2.5, wy + sa * 2.5, ca * 8.6, wy + sa * 8.6, I[3]);
    }
    p.disc(0, wy, 2.6, I[1]); p.disc(-0.5, wy - 0.5, 1.6, I[3]); P(-1, wy - 1, I[5]); P(0, wy, I[0]);
    // câble : sur la gorge, vers le treuil (hors champ à droite) et dans le puits
    prRing(p, 0, wy, 9.6, 10.4, (a) => (a < -0.65 || a > 3 ? CAB : null));
    line(8.4, wy - 7, 31, wy + 20, CAB);
    R(-10, wy, 1, 10, CAB);
    // cage : barreaux du fond, puis cadre, barreaux et plancher de devant ; brides et manille
    const cx0 = -18, cx1 = -3, cy0 = -22, cy1 = -3;
    for (let x = cx0 + 4; x <= cx1; x += 3) R(x, cy0 + 1, 1, 18, I[1]);
    R(cx0 + 2, cy0 - 1, 16, 1, I[1]);
    R(cx0, cy0, 16, 2, I[3]); R(cx0, cy0, 16, 1, I[4]);
    R(cx0, cy1 - 1, 16, 2, I[2]); R(cx0, cy1 - 1, 16, 1, I[4]);
    for (const x of [cx0, cx1]) { R(x, cy0, 1, 20, x === cx0 ? I[4] : I[2]); }
    for (let x = cx0 + 3; x < cx1; x += 3) R(x, cy0 + 2, 1, 16, I[3]);
    R(cx0, -13, 16, 1, I[3]);
    line(cx0, cy0 - 1, -10, -27, I[2]); line(cx1, cy0 - 1, -10, -27, I[2]);
    R(-11, -28, 2, 2, I[4]); P(-10, -28, I[2]);
  });
}

const PR_DECO = {
  barrel: [1, prBarrel], barrelTnt: [1, prBarrelTnt], cactus: [1, prCactus], lamp: [2, prLamp], hitch: [1, prHitch], trough: [1, prTrough],
  hayBale: [1, prHayBale], tombstone: [1, prTombstone], cross: [1, prCross], wheel: [1, prWheel], table: [1, prTable], chair: [1, prChair],
  plant: [1, prPlant], watertower: [1, prWaterTower], windmill: [4, prWindmill], cow: [2, prCow], chicken: [2, prChicken], deadtree: [1, prDeadTree],
  coffin: [1, prCoffin], bottle: [1, prBottle], wagonWreck: [1, prWagonWreck], lantern: [2, prLantern], tumbleweed: [4, prTumbleweed], batwing: [3, prBatwing],
  safe: [1, prSafe], chandelier: [2, prChandelier], bench: [1, prBench], stove: [2, prStove], spittoon: [1, prSpittoon],
  pew: [1, prPew], altarCross: [1, prAltarCross], cannon: [1, prCannon], flag: [3, prFlag], orePile: [1, prOrePile], headframe: [1, prHeadframe],
};
export function decoSprite(id, frame = 0) {
  const d = PR_DECO[id];
  if (!d) return checker(32, 48);
  const f = (((frame | 0) % d[0]) + d[0]) % d[0];
  return memo(`dc:${id}:${f}`, () => d[1](f));
}

// ================================================================== 7) EFFETS
// Remplit un champ de boules : couleur(v, x, y) → couleur ou null ; centre de la toile = (0, cy)
function prFill(p, w, h, blobs, color) {
  for (let y = -h + 1; y <= 0; y++) for (let x = -(w >> 1); x < w - (w >> 1); x++) {
    const v = prField(blobs, x, y);
    if (v <= 0) continue;
    const col = color(v, x, y);
    if (col) p.P(x, y, col);
  }
}
// Bandes de couleur tramées : v ∈ [0,1] → rampe, avec transition en Bayer
const prBand = (ramp, v, x, y) => {
  const t = clamp(v, 0, 0.999) * (ramp.length - 1), i = Math.floor(t);
  return ramp[Math.min(ramp.length - 1, i + (t - i > prB(x, y) ? 1 : 0))];
};
// Couleur de fumée éclairée par le haut-gauche (relief tiré de la pente du champ)
const prSmokeCol = (blobs, v, x, y, base = 2, ramp = PR_SMOKE, gk = 5) => {
  const g = prField(blobs, x + 1, y + 1) - prField(blobs, x - 1, y - 1);
  return prBand(ramp, clamp((base + g * gk + v * 0.8) / (ramp.length - 1), 0, 1), x, y);
};

// Bâton de dynamite allumé qui tournoie (14x14, centré)
function prDynFly(f) {
  return sprite(14, 14, (p) => {
    const g = prGrid(3, 11);
    g.R(1, 0, 1, 3, 'f'); g.R(0, 3, 3, 8, 'r'); g.R(0, 3, 1, 8, 'l'); g.R(2, 3, 1, 8, 'd'); g.R(0, 3, 3, 1, 'e'); g.R(0, 10, 3, 1, 'e'); g.R(0, 6, 3, 1, 'b');
    const a = (f * Math.PI) / 4 + 0.3;
    prBlit(p, [prRot(g, { f: '#8a7a68', r: PR_RED[3], l: PR_RED[4], d: PR_RED[2], e: '#e8c8a0', b: '#f4ecd8' }, 0, -6, a, 1.5, 6)]);
    // étincelle au bout de la mèche
    const sx = Math.round(Math.sin(a) * 5), sy = Math.round(-6 - Math.cos(a) * 5);
    p.P(sx, sy, '#ffffff');
    const arms = f % 2 ? [[1, 1], [-1, -1], [1, -1], [-1, 1]] : [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (const [dx, dy] of arms) p.P(sx + dx, sy + dy, f % 2 ? '#f8b830' : '#fff070');
  });
}

// Explosion 64x64 (base en bas), mise en scène à la Doom / Duke 3D :
//  f0 éclair : boule blanche compacte, bord déchiqueté, gerbe d'étincelles, flash au sol
//  f1 boule de feu : cœur blanc-jaune, orange, liseré rouge sombre, étincelles
//  f2 la boule s'étouffe : poches de feu dans une fumée de suie qui gonfle, débris qui volent
//  f3 champignon de suie aux braises rougeoyantes ; f4 fumée claire qui se dissipe en trame
const PR_SOOT = ['#1c1410', '#30241e', '#463830', '#5e5048', '#7a6c62', '#9a8c80'];
const PR_EMBER = ['#3a0c06', '#5e1608', '#86240a', '#b03a0c', '#d85a10'];
function prSparks(p, r, n, cx, cy, d0, d1, up = 0.85) {
  for (let k = 0; k < n; k++) {
    const a = -Math.PI / 2 + (r() - 0.5) * Math.PI * 2 * up, d = d0 + r() * (d1 - d0), l = 2 + r() * 3;
    const x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d * 0.9;
    if (y > -1) continue;
    p.line(x, y, x - Math.cos(a) * l, y - Math.sin(a) * l * 0.9, PR_FIRE[4]);
    p.P(x, y, k % 3 ? PR_FIRE[6] : PR_FIRE[5]);
  }
}
function prBoom(f) {
  return sprite(64, 64, (p) => {
    const { P, line, ell } = p;
    const r = rng(500 + f);
    if (f === 0) {
      const bl = [[0, -15, 12], [-6, -11, 8], [6, -12, 8], [-1, -22, 8], [-4, -6, 8], [5, -6, 7], [-9, -17, 5], [9, -19, 5]];
      prFill(p, 64, 64, bl, (v, x, y) => {
        const n = v + (prN(x, y, 3) - 0.5) * 0.35;
        return n > 0.18 ? prBand(PR_FIRE.slice(2), clamp((n - 0.18) * 0.95, 0, 1), x, y) : null;
      });
      prSparks(p, r, 14, 0, -14, 13, 22, 0.9);
      ell(0, 0, 21, 0.6, PR_FIRE[3]); ell(0, 0, 14, 0.5, PR_FIRE[5]); ell(0, 0, 7, 0.5, PR_FIRE[6]);
      return;
    }
    if (f === 1) {
      const bl = [[0, -22, 17], [-11, -15, 11], [11, -16, 11], [-6, -32, 11], [7, -30, 11], [0, -8, 13], [-17, -5, 8], [17, -5, 8], [-3, -40, 7]];
      prFill(p, 64, 64, bl, (v, x, y) => {
        const n = v + (prN(x, y, 11) - 0.5) * 0.3;
        if (n < 0.2) return null;
        if (n < 0.3) return prBand(PR_EMBER, (n - 0.2) * 9, x, y); // liseré rouge sombre
        return prBand(PR_FIRE, clamp((n - 0.24) * 0.85, 0, 1), x, y);
      });
      prSparks(p, r, 12, 0, -24, 23, 30, 0.95);
      return;
    }
    if (f === 2) {
      const smoke = [[0, -33, 16], [-13, -27, 12], [13, -28, 12], [-6, -44, 11], [7, -43, 11], [0, -17, 11], [-17, -9, 9], [17, -9, 9], [0, -6, 9]];
      const heat = [[-2, -31, 10], [6, -24, 7], [-7, -20, 6], [2, -42, 6], [0, -12, 5]];
      prFill(p, 64, 64, smoke, (v, x, y) => {
        const n = v + (prN(x, y, 22) - 0.5) * 0.28;
        if (n < 0.22) return null;
        const h = prField(heat, x, y) + (prN(x, y, 21) - 0.5) * 0.3;
        if (h > 0.55) return prBand(PR_FIRE.slice(2), clamp((h - 0.55) * 1.4, 0, 1), x, y);
        if (h > 0.3) return prBand(PR_EMBER, (h - 0.3) * 4, x, y);
        return prSmokeCol(smoke, n, x, y, 1.9, PR_SOOT, 6);
      });
      // débris qui retombent, traînée de fumée
      for (let k = 0; k < 10; k++) {
        const a = -Math.PI * (0.08 + r() * 0.84), d = 24 + r() * 6, x = Math.cos(a) * d, y = -16 + Math.sin(a) * d;
        line(x - Math.cos(a) * 3, y - Math.sin(a) * 3, x, y, PR_SOOT[3]);
        p.R(x, y, 2, 2, k % 3 ? PR_WOOD[1] : PR_IRON[1]); P(x, y, k % 2 ? PR_WOOD[3] : PR_FIRE[4]);
      }
      return;
    }
    // f 3 et 4 : champignon de suie, puis fumée qui s'effiloche
    const k = f === 3 ? 1 : 1.18;
    const smoke = [[0, -40 * k, 16 * k], [-12 * k, -36 * k, 12 * k], [12 * k, -37 * k, 12 * k], [0, -27 * k, 9 * k], [0, -15, 9 * k], [0, -5, 10], [-14 * k, -5, 10 * k], [14 * k, -5, 10 * k]];
    prFill(p, 64, 64, smoke, (v, x, y) => {
      const n = v + (prN(x, y, 30 + f) - 0.5) * 0.3;
      if (n < 0.2) return null;
      if (f === 4 && prB(x, y) > clamp((n - 0.15) * 1.6, 0, 0.75)) return null;
      if (f === 3) {
        // braises : le dessous de la colonne est encore éclairé par le feu
        const g = prField(smoke, x, y - 2) - prField(smoke, x, y + 2);
        if (n > 0.5 && g > 0.16 && prB(x, y) < (g - 0.16) * 4) return prBand(PR_EMBER, 0.15 + g * 1.4, x, y);
        if (n > 0.95 && prN(x, y, 7) < 0.06) return PR_FIRE[3 + (prN(x, y, 8) < 0.5 ? 1 : 0)];
        return prSmokeCol(smoke, n, x, y, 2.1, PR_SOOT, 6);
      }
      return prSmokeCol(smoke, n, x, y, 1.9);
    });
  }, { outlined: false });
}

// Gerbe de sang 16x16 (centrée) : jet → éclaboussure → gouttes
function prBlood(f) {
  return sprite(16, 16, (p) => {
    const { P, line } = p;
    const r = rng(90 + f), cy = -7;
    if (f === 0) {
      prFill(p, 16, 16, [[0, cy, 3]], (v, x, y) => prBand(PR_BLOOD.slice(2), v * 2, x, y));
      for (let k = 0; k < 7; k++) {
        const a = -Math.PI / 2 + (k - 3) * 0.55 + (r() - 0.5) * 0.3, l = 3 + r() * 3;
        line(Math.cos(a) * 2, cy + Math.sin(a) * 2, Math.cos(a) * l, cy + Math.sin(a) * l, PR_BLOOD[3]);
        P(Math.cos(a) * (l + 1), cy + Math.sin(a) * (l + 1), PR_BLOOD[4]);
      }
      P(-1, cy - 1, PR_BLOOD[5]);
      return;
    }
    if (f === 1) {
      const bl = [[0, cy, 4.2]];
      for (let k = 0; k < 7; k++) { const a = (k / 7) * Math.PI * 2 + r() * 0.5, d = 3.5 + r() * 2; bl.push([Math.cos(a) * d, cy + Math.sin(a) * d, 1.4 + r() * 1.4]); }
      prFill(p, 16, 16, bl, (v, x, y) => (v > 0.15 ? prBand(PR_BLOOD.slice(1), v * 1.1, x, y) : null));
      for (let k = 0; k < 6; k++) { const a = r() * Math.PI * 2, d = 5.5 + r() * 1; P(Math.cos(a) * d, cy + Math.sin(a) * d, PR_BLOOD[3]); }
      P(-2, cy - 2, PR_BLOOD[5]); P(-1, cy - 2, PR_BLOOD[5]);
      return;
    }
    for (let k = 0; k < 9; k++) {
      const x = Math.round((r() - 0.5) * 12), y = Math.round(cy - 3 + r() * 10), big = r() < 0.4;
      p.R(x, y, 1, big ? 3 : 2, PR_BLOOD[3]); P(x, y, PR_BLOOD[4]); if (big) P(x, y + 2, PR_BLOOD[2]);
    }
    for (let k = 0; k < 5; k++) P(Math.round((r() - 0.5) * 8), Math.round(cy + (r() - 0.5) * 6), PR_BLOOD[1]);
  }, { outlined: false });
}

// Impact de balle dans le sable 12x12 (centré)
function prDust(f) {
  return sprite(12, 12, (p) => {
    const r = rng(60 + f), cy = -5;
    const rad = [3.4, 4.4, 5.2][f];
    const bl = [[0, cy + 1, rad], [-rad * 0.5, cy, rad * 0.7], [rad * 0.5, cy - 0.5, rad * 0.7], [0, cy - rad * 0.5, rad * 0.6]];
    prFill(p, 12, 12, bl, (v, x, y) => {
      if (v < 0.15) return null;
      if (f === 2 && prB(x, y) > 0.45) return null;
      return prSmokeCol(bl, v, x, y, f === 0 ? 2.6 : 2.2, PR_SAND, 1.6);
    });
    for (let k = 0; k < 6; k++) {
      const a = -Math.PI * (0.1 + r() * 0.8), d = Math.min(4.6, rad + 0.5 + r() * 1.2 + f * 0.5);
      p.P(Math.cos(a) * d, cy + Math.sin(a) * d + f * 1.2, k % 2 ? PR_SAND[1] : PR_WOOD[1]);
    }
  }, { outlined: false });
}

// Bouffée de fumée grise 16x16 (centrée) qui grossit et se dissout
function prSmoke(f) {
  return sprite(16, 16, (p) => {
    const cy = -7, s = [0.78, 0.92, 1.05][f];
    const bl = [[0, cy + 1, 5 * s], [-3 * s, cy, 4 * s], [3 * s, cy - 1, 4 * s], [0, cy - 3 * s, 4 * s]];
    prFill(p, 16, 16, bl, (v, x, y) => {
      const n = v + (prN(x, y, 40 + f) - 0.5) * 0.2;
      if (n < 0.18) return null;
      if (f === 1 && prB(x, y) > 0.8) return null;
      if (f === 2 && prB(x, y) > 0.45) return null;
      return prSmokeCol(bl, n, x, y, 2.2 + f * 0.4, PR_SMOKE, 1.6);
    });
  }, { outlined: false });
}

// Éclair de bouche 16x16 (centré)
function prFlash(f) {
  return sprite(16, 16, (p) => {
    const cy = -7, rays = f ? 4 : 8;
    for (let i = 0; i < rays; i++) {
      const a = (i / rays) * Math.PI * 2 + (f ? Math.PI / 4 : 0.2), len = f ? 6 : i % 2 ? 5 : 6.8;
      for (let k = 0; k <= len; k++) {
        const x = Math.cos(a) * k, y = cy + Math.sin(a) * k, w = k < len * 0.4 ? 2 : 1;
        p.R(x - (w >> 1), y - (w >> 1), w, w, k < len * 0.35 ? PR_FIRE[6] : k < len * 0.7 ? PR_FIRE[5] : PR_FIRE[3]);
      }
    }
    if (f) for (const [dx, dy] of [[0, -4], [0, 4], [-4, 0], [4, 0]]) p.P(dx, cy + dy, PR_FIRE[4]);
    p.disc(0, cy, f ? 2 : 2.6, PR_FIRE[5]); p.disc(0, cy, f ? 1 : 1.6, PR_FIRE[6]);
  }, { outlined: false });
}

// Flammes 24x32 (base en bas) : langues qui ondulent d'une image à l'autre, cœur blanc-jaune, liseré rouge sombre,
// escarbilles au-dessus (feu de lanterne, d'huile ou de foin)
function prFlame(f) {
  return sprite(24, 32, (p) => {
    const r = rng(700 + f);
    const sw = [0, 1.6, 0.6, -1.2][f];
    const bl = [[0, -5, 7.5], [-5, -4, 5], [5, -4, 5], [sw * 0.6, -12, 6], [-3 + sw, -18, 3.8], [3 + sw * 0.5, -17, 3.2], [sw * 1.5, -24, 2.6], [-sw, -27, 1.6]];
    prFill(p, 24, 32, bl, (v, x, y) => {
      const n = v + (prN(x, y + f * 5, 50 + f) - 0.5) * 0.4;
      if (n < 0.2) return null;
      if (n < 0.3) return prBand(PR_EMBER, (n - 0.2) * 9, x, y);
      return prBand(PR_FIRE.slice(1), clamp((n - 0.26) * 0.9 + (y > -8 ? 0.12 : 0), 0, 1), x, y);
    });
    for (let k = 0; k < 4; k++) p.P(Math.round((r() - 0.5) * 14), Math.round(-21 - r() * 10), k % 2 ? PR_FIRE[5] : PR_FIRE[4]);
  }, { outlined: false });
}

// Boulet de canon 10x10 (centré) : fonte noire, reflet
function prBall() {
  return sprite(10, 10, (p) => {
    p.disc(0, -4, 3.6, PR_IRON[0]); p.disc(-0.5, -4.5, 2.6, PR_IRON[1]); p.disc(-1, -5, 1.4, PR_IRON[2]);
    p.P(-2, -6, PR_IRON[4]);
  });
}

const PR_FX = { dynFly: [4, prDynFly], boom: [5, prBoom], blood: [3, prBlood], dust: [3, prDust], smoke: [3, prSmoke], flash: [2, prFlash], flame: [4, prFlame], ball: [1, prBall] };
export function fxSprite(id, frame = 0) {
  const d = PR_FX[id];
  if (!d) return checker(16, 16);
  const f = (((frame | 0) % d[0]) + d[0]) % d[0];
  return memo(`fx:${id}:${f}`, () => d[1](f));
}

// ------------------------------------------------------------------ outils pour les dessins des autres cartes
// fpsart<Carte>.js (une carte du FPS en plus de la ville) dessine ses murs, sols et objets avec ces outils et les
// enregistre dans TX_WALLS / TX_VARS / TX_FLATS / PR_DECO : wallTex, flatTex et decoSprite les trouvent seuls.
// On y retrouve aussi OUT, shade et mix (sprites.js).
// Murs intérieurs dessinés pour toute la hauteur de la pièce (frise sous le plafond, soubassement au sol) : fps.js étire
// la texture du sol au plafond au lieu de répéter ses lignes 43-63 au-dessus de 1. Les dessins des cartes y ajoutent leurs ids.
const TX_TALL = {};
export { TX_TALL, PR_AGAVE, PR_AMBER, PR_BAT, PR_BAYER, PR_BLOOD, PR_BRASS, PR_BURLAP, PR_CAST, PR_COLT_PAL, PR_CREAM, PR_DARKW, PR_DECO, PR_EMBER, PR_FIRE, PR_FLAG_R, PR_FLAG_W, PR_FX, PR_GOLD, PR_GREEN, PR_GREY, PR_GUN, PR_IRON, PR_LEATHER, PR_NICKEL, PR_ORE, PR_PEW, PR_PICKUPS, PR_RED, PR_SAFE, PR_SAND, PR_SMOKE, PR_SOOT, PR_STONE, PR_STOVE, PR_STRAW, PR_TEAL, PR_TERRA, PR_TIMBER, PR_TW_AXIS, PR_VEST, PR_WOOD, TW2_CAB, TW2_IRON, TW2_SEE, TW2_ST_PAINT, TX_ADOBE, TX_BARE, TX_BRICK, TX_DOOR, TX_FLATS, TX_GL, TX_GLN, TX_LOOK, TX_OCH, TX_PAINT, TX_SHUT, TX_SIGNS, TX_STONE, TX_STRATA, TX_TALAVERA, TX_TRIM, TX_VARS, TX_WALLS, canvas, checker, clamp, deaccent, finish, grain, hardAlpha, hash, memo, mirror, opaque, pen, prAkimbo, prAltarCross, prAmmo, prB, prBall, prBand, prBandage, prBarrel, prBarrelBody, prBarrelHW, prBarrelTnt, prBatLeaf, prBatwing, prBench, prBlit, prBlobBody, prBlood, prBoom, prBottle, prCactus, prCannon, prCapH, prCapV, prChair, prChandelier, prChicken, prCoffin, prColt, prCow, prCrate, prCross, prCyl, prDeadTree, prDust, prDynFly, prDynamite, prField, prFill, prFlag, prFlame, prFlash, prFrame, prGatling, prGlow, prGold, prGoldWin, prGrid, prHayBale, prHeadframe, prHitch, prLamp, prLantern, prLit, prN, prOrePile, prPew, prPick, prPlant, prRing, prRot, prSafe, prSheen, prSmoke, prSmokeCol, prSparks, prSpittoon, prSpokeWheel, prStar, prStove, prTable, prTombstone, prTrough, prTumbleweed, prTwigs, prTwinkle, prVest, prWagonWreck, prWaterTower, prWheel, prWhisky, prWindmill, rd, rng, sprite, text, textW, texture, tw2Barn, tw2BarnLoft, tw2CabWindow, tw2Chip, tw2Dim, tw2Fence, tw2FenceBroken, tw2FreightCarUp, tw2Grain, tw2IsSee, tw2LocoBase, tw2LocoBoiler, tw2LocoCab, tw2LocoFront, tw2LocoUp, tw2Logs, tw2LogsWindow, tw2Mine, tw2MineUp, tw2PlankUp, tw2SignAdobe, tw2SignBoard, tw2SignBrick, tw2Solid, tw2StationUp, tw2StationWall, tw2StoneLow, tw2Tomb, tw2TombCap, tw2TrainCarUp, tw2Wheel, txAdobeWall, txBackbarCantina, txBackbarGuitar, txBackbarRegister, txBackbarSaloon, txBarCantina, txBarDesk, txBarTeller, txBarTicket, txBevel, txBlocks, txBrickWall, txCellInside, txCellLight, txCellMap, txCrack, txCrate, txDaylight, txFace, txFbm, txField, txFloorBoards, txGW, txGlassShade, txGlint, txGrade, txGravel, txK, txLayer, txLerp, txMineRock, txMod, txNoise, txPick, txPoster, txRGB, txRevealWin, txRifle, txShutter, txSiding, txStencil, txStoneWall, txStrata, txTall, txText, txTextW, txTimber, txVBoards, txVigaEnds, txWP, txWindowFrame, txWindowPane, OUT, shade, mix };
