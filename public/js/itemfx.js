// Petits dessins des animations d'objets de la roulette : bras et poings, menottes et chaîne, lasso,
// cigare et allumette, carte, marteau, scie, manipulateur de télégraphe, longue-vue…
// Tout est posé en rectangles arrondis au pixel près, pour rester net une fois le canvas agrandi.
import { OUT, shade, disc, makeCanvas, lru } from './sprites.js';
import { rlFist } from './vmguns.js';

const R = (ctx, x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };
const STEEL = '#8a909a', STEEL_L = '#d8dce4', STEEL_D = '#4a4f58';
const ROPE = '#c8a060', ROPE_D = '#7a5a30', ROPE_B = shade(ROPE, -0.25); // ROPE_B : moitié arrière de la boucle (calculée une fois)
const SHIRT = '#e8e0d0';
const BRASS = '#c8901c', BRASS_L = '#f8e08a', BRASS_D = '#7a5010';

// Trait épais fait de carrés posés le long du segment (contour sombre d'abord), qui passe de w0 à w1 ;
// light : reflet plus clair, décalé vers le haut à gauche.
export function thick(ctx, x0, y0, x1, y1, w0, col, { w1 = w0, out = OUT, light = null } = {}) {
  const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
  const pass = (dw, c, off = 0) => {
    ctx.fillStyle = c;
    for (let i = 0; i <= n; i++) {
      const t = i / n, w = Math.max(1, Math.round(w0 + (w1 - w0) * t) + dw);
      ctx.fillRect(Math.round(x0 + (x1 - x0) * t - off - w / 2), Math.round(y0 + (y1 - y0) * t - off - w / 2), w, w);
    }
  };
  if (out) pass(2, out);
  pass(0, col);
  if (light && w0 >= 4) pass(-Math.ceil(w0 * 0.55), light, w0 * 0.22);
}

// ------------------------------------------------------------- matières et coudes
// Matière : teinte de base, reflet, ombre (calculés une fois par couleur)
const mats = new Map();
export function mat(col) {
  let m = mats.get(col);
  if (!m) { m = { b: col, l: shade(col, 0.18), d: shade(col, -0.28) }; mats.set(col, m); }
  return m;
}
// Coude d'un bras de l'épaule sh au poignet wr ({ x, y }), pour un bras (up) et un avant-bras (fore) de ces longueurs,
// plié du côté bend (-1 : à gauche, 1 : à droite) ; trop loin, le bras se tend.
// raised : coude levé sur le côté (bras qui frappe) plutôt que retombant
export function elbow(sh, wr, up, fore, bend = 1, raised = false) {
  const dx = wr.x - sh.x, dy = wr.y - sh.y, d = Math.hypot(dx, dy) || 1;
  if (d >= up + fore - 0.01) return { x: sh.x + (dx * up) / (up + fore), y: sh.y + (dy * up) / (up + fore) };
  const a = (up * up - fore * fore + d * d) / (2 * d), hh = Math.sqrt(Math.max(0, up * up - a * a));
  let nx = -dy / d, ny = dx / d;
  // le coude retombe plutôt vers le bas, du côté bend
  if (raised ? nx * bend < 0 : ny + nx * bend * 0.6 < 0) { nx = -nx; ny = -ny; }
  return { x: sh.x + (dx / d) * a + nx * hh, y: sh.y + (dy / d) * a + ny * hh };
}

// ------------------------------------------------------------- bras et poings
// Mon bras (vue subjective) : la main des armes en main du FPS (vmguns.js : rlFist), refermée, l'avant-bras et la
// manche qui filent vers le bas de l'écran, avec les mêmes proportions et le même modelé qu'au FPS. Le poing est centré
// sur (x, y) ; side > 0 : main droite. hold : objet tenu, dessiné avant la main (les doigts se referment dessus) ;
// cuff : bracelet de menotte au poignet ; small : poing lointain (posé sur le fusil au milieu de la table).
// Renvoie la position du poignet.
export function fpArm(ctx, x, y, skin, cloth, side = 1, { hold = null, cuff = false, small = false } = {}) {
  const f = rlFist(side > 0 ? 1 : -1, skin, cloth, small);
  const L = Math.round(x) - f.ax, T = Math.round(y) - f.ay;
  hold?.(ctx);
  ctx.drawImage(f, L, T);
  const wx = L + f.wx, wy = T + f.wy;
  if (cuff) cuffBand(ctx, wx, wy, small ? 12 : 22, small ? 4 : 6);
  return { x: wx, y: wy };
}

// ------------------------------------------------------------- bras de l'adversaire, en gros pixels du buste
// Comme les cow-boys du FPS (fpsart.js : ppLimb, ppFist) : bras et avant-bras en traits épais cernés, ombrés du côté
// opposé à la lumière, poing carré. Tout est compté en unités du buste (characterSprite, agrandi ×2 à l'écran) :
// g = { x, y, s } pose l'unité (u, v) en (x + s·u, y + s·v) ; s = 2 à l'écran (pixels calés sur ceux du buste),
// s = 1 dans un calque en unités qu'on agrandit ensuite. Épaisseurs : celles des côtés du torse du buste.
export const BUST_UP = 5, BUST_FORE = 4, BUST_FIST = 5;
function uLine(ctx, g, a, b, w, col) {
  const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) * 2)), h = Math.floor(w / 2);
  ctx.fillStyle = col;
  for (let i = 0; i <= n; i++) {
    const u = Math.round(a[0] + ((b[0] - a[0]) * i) / n) - h, v = Math.round(a[1] + ((b[1] - a[1]) * i) / n) - h;
    ctx.fillRect(g.x + g.s * u, g.y + g.s * v, g.s * w, g.s * w);
  }
}
// liseré d'ombre (bas droite) et de lumière (haut gauche) le long d'un segment de largeur w
function uShade(ctx, g, a, b, w, col) {
  const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
  let nx = -dy / l, ny = dx / l;
  if (nx + ny < 0) { nx = -nx; ny = -ny; }
  const k = Math.max(0, w / 2 - 0.7);
  uLine(ctx, g, [a[0] + nx * k, a[1] + ny * k], [b[0] + nx * k, b[1] + ny * k], 1, mat(col).d);
  if (w >= 4) uLine(ctx, g, [a[0] - nx * k, a[1] - ny * k], [b[0] - nx * k, b[1] - ny * k], 1, mat(col).l);
}
// Bras : épaule sh → coude el → poignet wr (points [u, v]) ; sl : { up, fore } (manche, avant-bras : manche ou peau).
// Contours d'abord, puis les couleurs : pas de trait au pli du coude.
export function bustArm(ctx, g, sh, el, wr, sl) {
  uLine(ctx, g, sh, el, BUST_UP + 2, OUT);
  uLine(ctx, g, el, wr, BUST_FORE + 2, OUT);
  uLine(ctx, g, sh, el, BUST_UP, sl.up);
  uShade(ctx, g, sh, el, BUST_UP, sl.up);
  uLine(ctx, g, el, wr, BUST_FORE, sl.fore);
  uShade(ctx, g, el, wr, BUST_FORE, sl.fore);
  // manchette de chemise au poignet (pas sur un avant-bras nu)
  if (sl.fore !== sl.skin) {
    const dx = wr[0] - el[0], dy = wr[1] - el[1], l = Math.hypot(dx, dy) || 1;
    uLine(ctx, g, [wr[0] - (dx / l) * 0.6, wr[1] - (dy / l) * 0.6], wr, BUST_FORE, SHIRT);
  }
}
// Poing carré (vu du dos, jointures en haut), centré sur p = [u, v]
export function bustFist(ctx, g, p, skin, n = BUST_FIST) {
  const x = Math.round(p[0] - n / 2), y = Math.round(p[1] - n / 2), m = mat(skin);
  const Q = (u, v, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(g.x + g.s * u, g.y + g.s * v, g.s * w, g.s * h); };
  Q(x - 1, y - 1, n + 2, n + 2, OUT);
  Q(x, y, n, n, skin);
  Q(x + n - 1, y, 1, n, m.d); Q(x, y + n - 1, n, 1, m.d); Q(x, y, n - 1, 1, m.l);
  for (let i = 1; i < n - 1; i += 2) Q(x + i, y + 1, 1, 1, m.d); // jointures
}
// Main refermée sur ce qu'elle tient, vue de dos : dos des doigts éclairé en haut, plis des jointures, bout des doigts
// repliés en bas, pouce du côté intérieur (vers le milieu de son torse) qui passe par-dessus. Dessinée pour une main à
// ma droite (sa main gauche, pouce à gauche), retournée pour l'autre. L : reflet, s : peau, k : pli, d : ombre,
// T / t : pouce. Contour d'une unité tout autour (comme bras et buste).
const HAND = [
  '.LLLL.',
  'TskskD',
  'TssssD',
  '.dkdk.',
];
const hands = new Map();
function handImg(skin, side) {
  const key = `${skin}|${side}`;
  let c = hands.get(key);
  if (c) return c;
  const m = mat(skin), w = HAND[0].length, h = HAND.length;
  const col = { L: m.l, s: skin, k: shade(skin, -0.14), d: shade(skin, -0.2), D: m.d, T: shade(skin, 0.08), t: shade(skin, -0.1) };
  c = makeCanvas(w + 2, h + 2);
  const x = c.getContext('2d');
  const at = (i, j) => { const r = HAND[j]; return r && r[side > 0 ? i : w - 1 - i]; };
  const full = (i, j) => { const ch = at(i, j); return !!ch && ch !== '.'; };
  // contour : toute case vide qui touche (aussi en diagonale) une case pleine
  x.fillStyle = OUT;
  for (let j = -1; j <= h; j++) for (let i = -1; i <= w; i++) {
    if (full(i, j)) continue;
    let near = false;
    for (let dj = -1; dj <= 1 && !near; dj++) for (let di = -1; di <= 1; di++) if (full(i + di, j + dj)) { near = true; break; }
    if (near) x.fillRect(i + 1, j + 1, 1, 1);
  }
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (full(i, j)) { x.fillStyle = col[at(i, j)]; x.fillRect(i + 1, j + 1, 1, 1); }
  hands.set(key, c);
  return c;
}
export const BUST_HAND = { w: HAND[0].length, h: HAND.length };
// Main posée en p = [u, v] (son centre) ; side > 0 : main à ma droite (pouce vers ma gauche)
export function bustHand(ctx, g, p, skin, side = 1) {
  const img = handImg(skin, side > 0 ? 1 : -1);
  const u = Math.round(p[0] - BUST_HAND.w / 2) - 1, v = Math.round(p[1] - BUST_HAND.h / 2) - 1;
  ctx.drawImage(img, g.x + g.s * u, g.y + g.s * v, img.width * g.s, img.height * g.s);
}
// Couleurs d'un bras : chaîne (manche et avant-bras de la même couleur) ou { up, fore, skin }
const sleeve = (cloth, skin) => (typeof cloth === 'string' ? { up: cloth, fore: cloth, skin } : { ...cloth, skin });

// Coude d'un bras de l'adversaire vu de face (unités du buste), de l'épaule sh à la main h ([u, v]) : comme les cow-boys
// du FPS qui visent (fpsart.js : ppRig), il reste près du flanc (à peine décalé vers la main, jamais écarté vers
// l'extérieur) et se pose sur la table (BUST_TABLE) tant que la main est plus haut ; une main levée haut l'emmène avec
// elle (avant-bras de BUST_FA au plus : le bras se tend vers moi, raccourci), bras de BUST_UA au plus.
export const BUST_TABLE = 50, BUST_FA = 12, BUST_UA = 10;
export function bustElbow(sh, h) {
  let e = [sh[0] + (h[0] - sh[0]) * 0.1, Math.min(BUST_TABLE, Math.max(sh[1] + 3, h[1] + 8))];
  let dx = e[0] - h[0], dy = e[1] - h[1], l = Math.hypot(dx, dy);
  if (l > BUST_FA) e = [h[0] + (dx * BUST_FA) / l, h[1] + (dy * BUST_FA) / l];
  dx = e[0] - sh[0]; dy = e[1] - sh[1]; l = Math.hypot(dx, dy);
  if (l > BUST_UA) e = [sh[0] + (dx * BUST_UA) / l, sh[1] + (dy * BUST_UA) / l];
  return e;
}
// Bras entier d'un seul tenant, en unités du buste : épaule sh → coude (el, sinon bustElbow) → poignet → main en h.
// L'avant-bras finit sous la main (le poignet est caché par elle) : on suit le bras de l'épaule jusqu'aux doigts.
// hold : objet tenu, dessiné entre le bras et la main (les doigts se referment dessus).
export function bustLimb(ctx, g, sh, h, skin, sl, side = 1, { el = null, hold = null } = {}) {
  const e = el || bustElbow(sh, h);
  const dx = e[0] - h[0], dy = e[1] - h[1], l = Math.hypot(dx, dy) || 1;
  const wr = l > 3 ? [h[0] + (dx / l) * 3, h[1] + (dy / l) * 3] : h;
  bustArm(ctx, g, sh, e, wr, sl);
  hold?.(ctx);
  bustHand(ctx, g, h, skin, side);
  return e;
}

// Bras de l'adversaire, de son épaule sh ({ x, y } à l'écran, sh.g : repère du buste) au poing (x, y), coude près du
// flanc (bustElbow) ; hold : objet tenu, dessiné sous les doigts. Renvoie le coude (à l'écran).
export function oppArm(ctx, sh, x, y, skin, cloth, side = 1, hold = null) {
  const g = sh.g || { x: 0, y: 0, s: 2 }, U = (px, py) => [(px - g.x) / g.s, (py - g.y) / g.s];
  const e = bustLimb(ctx, g, U(sh.x, sh.y), U(x, y), skin, sleeve(cloth, skin), side, { hold });
  return { x: g.x + g.s * e[0], y: g.y + g.s * e[1] };
}

// ------------------------------------------------------------- menottes
export function cuffBand(ctx, cx, cy, w, h = 4) {
  const L = Math.round(cx - w / 2), T = Math.round(cy - h / 2);
  R(ctx, L - 1, T - 1, w + 2, h + 2, OUT);
  R(ctx, L, T, w, h, STEEL); R(ctx, L, T, w, 1, STEEL_L); R(ctx, L, T + h - 1, w, 1, STEEL_D);
  R(ctx, Math.round(cx) - 1, T + 1, 2, Math.max(1, h - 2), STEEL_D); // serrure
}

// Chaîne entre deux bracelets, maillons à plat et de champ en alternance, un peu détendue au milieu
export function chain(ctx, x0, y0, x1, y1, sag = 2, big = false) {
  const n = Math.max(2, Math.round(Math.hypot(x1 - x0, y1 - y0) / (big ? 5 : 3)));
  for (let i = 0; i <= n; i++) {
    const t = i / n, x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t + Math.sin(t * Math.PI) * sag;
    if (big) {
      if (i % 2) { R(ctx, x - 3, y - 2, 7, 5, OUT); R(ctx, x - 2, y - 1, 5, 3, STEEL); R(ctx, x - 1, y, 3, 1, OUT); R(ctx, x - 2, y - 1, 5, 1, STEEL_L); }
      else { R(ctx, x - 1, y - 3, 3, 7, OUT); R(ctx, x, y - 2, 1, 5, STEEL_L); }
    } else if (i % 2) { R(ctx, x - 2, y - 1, 4, 3, OUT); R(ctx, x - 1, y, 2, 1, STEEL); }
    else { R(ctx, x - 1, y - 1, 2, 3, OUT); R(ctx, x, y, 1, 1, STEEL_L); }
  }
}

// ------------------------------------------------------------- lasso
// Corde en courbe (point de contrôle au milieu, abaissé de sag)
export function rope(ctx, x0, y0, x1, y1, sag = 0, w = 1) {
  const mx = (x0 + x1) / 2, my = (y0 + y1) / 2 + sag;
  const n = Math.max(2, Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 1.3));
  let px = null, py = null;
  for (let i = 0; i <= n; i++) {
    const t = i / n, a = (1 - t) * (1 - t), b = 2 * (1 - t) * t, c = t * t;
    const x = Math.round(a * x0 + b * mx + c * x1), y = Math.round(a * y0 + b * my + c * y1);
    if (x === px && y === py) continue;
    px = x; py = y;
    R(ctx, x, y + w, w, 1, ROPE_D); R(ctx, x, y, w, w, ROPE);
  }
}

// Boucle du lasso (ellipse vue de biais) : part 'back' = moitié arrière, 'front' = moitié avant (avec le nœud).
// Renvoie la position du nœud coulant, où la corde s'attache.
export function loop(ctx, cx, cy, rx, ry, phase, part = 'all', w = 1) {
  const n = Math.max(16, Math.ceil((rx + ry) * 3));
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2, front = Math.sin(a) >= 0;
    if ((part === 'back' && front) || (part === 'front' && !front)) continue;
    const x = Math.round(cx + Math.cos(a) * rx), y = Math.round(cy + Math.sin(a) * ry);
    R(ctx, x, y + w, w, 1, ROPE_D); R(ctx, x, y, w, w, front ? ROPE : ROPE_B);
  }
  const kx = cx + Math.cos(phase) * rx, ky = cy + Math.sin(phase) * ry;
  if (part !== 'back') { R(ctx, kx - 1, ky - 1, w + 2, w + 2, ROPE_D); R(ctx, kx - 1, ky - 1, w + 1, w + 1, ROPE); }
  return { x: kx, y: ky };
}

// ------------------------------------------------------------- cigare, allumette
// Du bout côté bouche (x0, y0) jusqu'au bout allumé (x1, y1) ; glow : 0 éteint, 1 braise au plus vif
export function cigar(ctx, x0, y0, x1, y1, w0, w1, glow) {
  thick(ctx, x0, y0, x1, y1, w0, '#6a3e1e', { w1, light: '#9a6034' });
  // bague rouge et or, côté bouche
  const bx = x0 + (x1 - x0) * 0.22, by = y0 + (y1 - y0) * 0.22, ex = x0 + (x1 - x0) * 0.3, ey = y0 + (y1 - y0) * 0.3;
  const bw = Math.round(w0 + (w1 - w0) * 0.26);
  thick(ctx, bx, by, ex, ey, bw, '#c0392b', { out: null });
  thick(ctx, (bx + ex) / 2, (by + ey) / 2, (bx + ex) / 2, (by + ey) / 2, Math.max(1, bw - 2), '#e0b040', { out: null });
  const r = Math.max(1, Math.round(w1 / 2));
  if (glow > 0.25) disc(ctx, x1, y1, r + 2 + Math.round(glow * 2), `rgba(255,140,40,${(0.3 * glow).toFixed(2)})`);
  disc(ctx, x1, y1, r, glow > 0.1 ? '#8a8078' : '#3a2a20'); // cendre (ou bout pas encore allumé)
  if (glow > 0.1) {
    disc(ctx, x1, y1, Math.max(0, r - 1), glow > 0.7 ? '#ffa030' : '#d8501a');
    if (glow > 0.6) R(ctx, x1, y1, 1, 1, '#fff070');
  }
}

// Petite flamme qui vacille (base au point x, y)
export function flame(ctx, x, y, t, s = 1) {
  const f = Math.sin(t / 40) * 0.5 + Math.sin(t / 23) * 0.5;
  const h = Math.max(3, Math.round((5 + f) * s)), w = Math.max(2, Math.round(3 * s));
  for (let j = 0; j < h; j++) {
    const k = 1 - j / h, ww = Math.max(1, Math.round(w * Math.sqrt(k)));
    R(ctx, x - ww / 2 + (j > h / 2 ? Math.round(f * 0.6) : 0), y - j, ww, 1, j < h * 0.3 ? '#fff4b0' : j < h * 0.65 ? '#f8b030' : '#e05a18');
  }
}

export function match(ctx, x0, y0, x1, y1, w = 2) {
  thick(ctx, x0, y0, x1, y1, w, '#e8c890');
  R(ctx, x1 - 1, y1 - 1, w + 1, w + 1, '#b03020');
}

// ------------------------------------------------------------- carte (l'as)
let cardFace = null, cardBack = null;
function cards() {
  if (cardFace) return;
  const grid = (c, rows, ox, oy, col) => rows.forEach((row, j) => [...row].forEach((ch, i) => ch === 'k' && R(c, ox + i, oy + j, 1, 1, col)));
  const frame = (c, fill) => { R(c, 0, 1, 20, 26, OUT); R(c, 1, 0, 18, 28, OUT); R(c, 1, 1, 18, 26, fill); };
  cardFace = makeCanvas(20, 28);
  let c = cardFace.getContext('2d');
  frame(c, '#f4ecd8'); R(c, 1, 25, 18, 2, '#d8c8a0');
  const A = ['.k.', 'k.k', 'kkk', 'k.k', 'k.k'];
  grid(c, A, 3, 3, OUT); grid(c, [...A].reverse(), 14, 20, OUT);
  grid(c, ['....k....', '...kkk...', '..kkkkk..', '.kkkkkkk.', 'kkkkkkkkk', 'kkkkkkkkk', '.kk.k.kk.', '....k....', '...kkk...'], 5, 9, OUT);
  R(c, 8, 11, 1, 1, '#8a8f98');
  cardBack = makeCanvas(20, 28);
  c = cardBack.getContext('2d');
  frame(c, '#f4ecd8');
  R(c, 2, 2, 16, 24, '#8a2a20');
  for (let y = 2; y < 26; y++) for (let x = 2; x < 18; x++) if ((x + y) % 4 === 0 || (x - y + 40) % 4 === 0) R(c, x, y, 1, 1, '#b8483a');
}

// sx : largeur apparente (cos de la rotation) — négatif, on voit le dos
export function card(ctx, cx, cy, scale, sx) {
  cards();
  const w = Math.max(1, Math.round(20 * scale * Math.abs(sx))), h = Math.round(28 * scale);
  ctx.drawImage(sx >= 0 ? cardFace : cardBack, Math.round(cx - w / 2), Math.round(cy - h / 2), w, h);
}

// ------------------------------------------------------------- outils
// Marteau : manche tenu en (px, py), orienté selon l'angle a ; la tête de fer au bout, en travers
export function hammer(ctx, px, py, a, len, s = 1) {
  const hx = px + Math.cos(a) * len, hy = py + Math.sin(a) * len;
  thick(ctx, px, py, hx, hy, Math.max(2, Math.round(3 * s)), '#a06a3a', { light: '#c8925a' });
  const nx = -Math.sin(a), ny = Math.cos(a), hw = 5 * s;
  thick(ctx, hx - nx * hw, hy - ny * hw, hx + nx * hw * 0.6, hy + ny * hw * 0.6, Math.max(3, Math.round(5 * s)), STEEL, { light: STEEL_L });
}

// Scie : lame de la pointe (x0, y0) au talon (x1, y1), dents d'un côté, poignée en bois après le talon
export function saw(ctx, x0, y0, x1, y1, w = 7) {
  const dx = x1 - x0, dy = y1 - y0, l = Math.hypot(dx, dy) || 1, ux = dx / l, uy = dy / l;
  const nx = -uy, ny = ux, sg = ny > 0 ? 1 : -1;
  thick(ctx, x0, y0, x1, y1, Math.round(w * 0.7), '#c9ced6', { w1: w, light: '#f0f2f6' });
  for (let i = 1; i < l; i += 2) {
    const half = (w * 0.7 + w * 0.3 * (i / l)) / 2 + 1;
    R(ctx, x0 + ux * i + nx * sg * half, y0 + uy * i + ny * sg * half, 1, 1, OUT);
  }
  thick(ctx, x1, y1, x1 + ux * 9, y1 + uy * 9, w + 2, '#7a4a24', { light: '#a8703c' });
}

// Morceaux de menottes qui sautent quand elles cèdent : un demi-bracelet et un maillon
let shards = null;
export function cuffShards() {
  if (shards) return shards;
  const band = makeCanvas(10, 6), link = makeCanvas(5, 4);
  let x = band.getContext('2d');
  R(x, 0, 0, 10, 6, OUT); R(x, 1, 1, 8, 4, STEEL); R(x, 1, 1, 8, 1, STEEL_L); R(x, 1, 4, 8, 1, STEEL_D); R(x, 8, 0, 2, 2, OUT);
  x = link.getContext('2d');
  R(x, 0, 0, 5, 4, OUT); R(x, 1, 1, 3, 2, STEEL); R(x, 2, 1, 1, 1, OUT); R(x, 1, 1, 3, 1, STEEL_L);
  shards = { band, link };
  return shards;
}

// Bout de canon scié qui tombe sur la table
const pieces = {};
export function barrelPiece(len) {
  if (pieces[len]) return pieces[len];
  const c = makeCanvas(len + 2, 7);
  const x = c.getContext('2d');
  R(x, 0, 0, len + 2, 5, OUT); R(x, 1, 1, len, 3, STEEL_D); R(x, 1, 1, len, 1, STEEL); R(x, len - 1, 0, 2, 1, '#e0b040');
  R(x, 1, 4, len - 6, 3, OUT); R(x, 2, 5, len - 8, 1, '#3a3e46');
  pieces[len] = c;
  return c;
}

// Manipulateur de télégraphe : socle en bois, levier en laiton qui bat le morse (down : appuyé)
export function telegraphKey(ctx, x, y, down, s = 1) {
  R(ctx, x - 12 * s - 1, y - 1, 24 * s + 2, 5 * s + 2, OUT); R(ctx, x - 12 * s, y, 24 * s, 5 * s, '#7a4a24'); R(ctx, x - 12 * s, y, 24 * s, s, '#a8703c');
  R(ctx, x - 10 * s, y - 5 * s, 3 * s, 5 * s, BRASS_D); // pivot
  R(ctx, x + 6 * s, y - 2 * s, 3 * s, 2 * s, BRASS); // plot de contact
  const tipY = y - (down ? 3 : 6) * s;
  thick(ctx, x - 9 * s, y - 5 * s, x + 9 * s, tipY, Math.max(2, 2 * s), BRASS, { light: BRASS_L });
  disc(ctx, x + 10 * s, tipY - s, 2 * s + 1, OUT); disc(ctx, x + 10 * s, tipY - s, 2 * s, '#2a2420');
  if (down) { R(ctx, x + 7 * s, y - 3 * s, s, s, '#c8f0ff'); R(ctx, x + 9 * s, y - 4 * s, s, s, '#80c8ff'); }
}

export function paper(ctx, x, y, w, h, back = false) {
  R(ctx, x + 2, y + 2, w, h, 'rgba(0,0,0,0.3)');
  R(ctx, x - 1, y - 1, w + 2, h + 2, OUT); R(ctx, x, y, w, h, '#f0e4c4'); R(ctx, x, y, w, 1, '#fff6dc'); R(ctx, x, y + h - 1, w, 1, '#d8c8a0');
  if (back) for (let j = 4; j < h - 3; j += 3) R(ctx, x + 3, y + j, w - 6, 1, '#d8c8a0');
}

// Longue-vue tenue par l'adversaire : de l'œil (x0, y0) à la lentille (x1, y1)
export function spyglassTube(ctx, x0, y0, x1, y1, glint = false) {
  thick(ctx, x0, y0, x1, y1, 4, BRASS, { w1: 6, light: BRASS_L });
  for (const t of [0.35, 0.68]) {
    const bx = x0 + (x1 - x0) * t, by = y0 + (y1 - y0) * t;
    thick(ctx, bx, by, bx + (x1 - x0) * 0.04, by + (y1 - y0) * 0.04, 5, BRASS_D, { out: null });
  }
  disc(ctx, x1, y1, 4, OUT); disc(ctx, x1, y1, 3, '#e0b040'); disc(ctx, x1, y1, 2, '#2a3a4a');
  R(ctx, x1 - 1, y1 - 1, 1, 1, glint ? '#ffffff' : '#8ab0d0');
}

// Vue dans la longue-vue : tout est noir sauf un disque (r) cerclé de laiton ; inside() dessine le contenu.
// Centre entier (le cas de la roulette) : le carré autour du disque vient d'un masque dessiné une fois par rayon,
// le reste de l'écran de quatre rectangles noirs (plutôt que quatre ou cinq traits par ligne à chaque image).
const lenses = lru(12);
function lensRows(ctx, cx, cy, r, y0, y1, W) {
  const ro = r + 4;
  for (let y = y0; y < y1; y++) {
    const dy = y + 0.5 - cy;
    if (Math.abs(dy) > ro) { R(ctx, 0, y, W, 1, '#0a0604'); continue; }
    const dxo = Math.floor(Math.sqrt(ro * ro - dy * dy));
    R(ctx, 0, y, Math.max(0, cx - dxo), 1, '#0a0604');
    R(ctx, cx + dxo, y, W - cx - dxo, 1, '#0a0604');
    const rim = dy < -r * 0.4 ? BRASS_L : dy > r * 0.4 ? BRASS_D : BRASS;
    if (Math.abs(dy) > r) R(ctx, cx - dxo, y, dxo * 2, 1, rim);
    else {
      const dxi = Math.floor(Math.sqrt(r * r - dy * dy));
      R(ctx, cx - dxo, y, dxo - dxi, 1, rim); R(ctx, cx + dxi, y, dxo - dxi, 1, rim);
    }
  }
}
export function lensView(ctx, cx, cy, r, W, H, inside) {
  inside();
  if (!Number.isInteger(cx) || !Number.isInteger(cy) || !Number.isInteger(r)) { lensRows(ctx, cx, cy, r, 0, H, W); return; }
  const ro = r + 4;
  let m = lenses.get(r);
  if (!m) {
    m = makeCanvas(ro * 2, ro * 2);
    lensRows(m.getContext('2d'), ro, ro, r, 0, ro * 2, ro * 2);
    lenses.set(r, m);
  }
  ctx.drawImage(m, cx - ro, cy - ro);
  if (cy - ro > 0) R(ctx, 0, 0, W, cy - ro, '#0a0604');
  if (cy + ro < H) R(ctx, 0, cy + ro, W, H - cy - ro, '#0a0604');
  if (cx - ro > 0) R(ctx, 0, cy - ro, cx - ro, ro * 2, '#0a0604');
  if (cx + ro < W) R(ctx, cx + ro, cy - ro, W - cx - ro, ro * 2, '#0a0604');
}
