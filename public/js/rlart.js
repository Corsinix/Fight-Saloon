// Ce que l'on tient à la roulette, en pixel art 2D : mes poings, mon fusil, mon derringer (vue subjective), et chez
// l'adversaire ses poings, son fusil (pris, levé, braqué sur moi ou retourné contre lui) et son derringer.
// Le fusil est tenu comme à Buckshot Roulette : de profil, une main à la poignée, l'autre enroulée sous la pompe (en
// 3/4 vers lui quand je tire, la crosse en bas à droite), ou de face quand il est braqué vers l'écran (contre moi, ou
// sur moi) ; fusil et mains qui le tiennent sont dessinés en pixels fins à leur angle par rlgun.js. Les poings (dos du
// poing pour les miens, de face pour les siens) et le derringer sont des grilles faites main ; le derringer incliné est
// tourné à la manière de RotSprite (agrandi ×8 en Scale2x, tourné, réduit), qui garde les traits nets.
// Chaque image est dessinée une fois (cache) ; scene.js la recopie, décalée au pixel près (montée, tremblement, recul).
import { OUT, shade, makeCanvas, freeCanvas, lru, disc, gunEnd, GUNS } from './sprites.js';
import { sheet, gunMap, gunMapPersp, drawGun, drawMuzzles, foreHand, gripHand, forearm } from './rlgun.js';

const rd = Math.round;
const lerp = (a, b, t) => a + (b - a) * t;
const sm = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
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
const cv = (w, h) => makeCanvas(Math.max(1, Math.ceil(w)), Math.max(1, Math.ceil(h)), true);
const ctxOf = (c) => c.getContext('2d', { willReadFrequently: true });

// ------------------------------------------------------------------ couleurs
const SHIRT = '#e8e0d0';
// Rampe d'une matière : reflet l, teinte b, ombre d, pli k
const ramps = new Map();
export function ramp(col) {
  let r = ramps.get(col);
  if (!r) { r = { l: shade(col, 0.2), b: col, d: shade(col, -0.22), k: shade(col, -0.4) }; ramps.set(col, r); }
  return r;
}
const BORE = '#0e0e12';
const NICKEL = { l: '#f4f6f8', b: '#b4b8c0', d: '#7a808a', x: '#5a606a' };
const IVORY = { l: '#f4ecd8', b: '#dccfb0', d: '#a8987a' };
const BRASS = { l: '#f8e08a', b: '#c8901c', d: '#7a5010' };

// ------------------------------------------------------------------ outils de pixels
// Contour sombre d'un pixel autour de tout ce qui est plein (4 voisins)
function outline(c) {
  const x = ctxOf(c), w = c.width, h = c.height, img = x.getImageData(0, 0, w, h), d = img.data, src = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) src[i] = d[i * 4 + 3] > 0 ? 1 : 0;
  for (let y = 0; y < h; y++) for (let X = 0; X < w; X++) {
    const i = y * w + X;
    if (src[i]) continue;
    if ((X > 0 && src[i - 1]) || (X < w - 1 && src[i + 1]) || (y > 0 && src[i - w]) || (y < h - 1 && src[i + w])) {
      d[i * 4] = 26; d[i * 4 + 1] = 15; d[i * 4 + 2] = 10; d[i * 4 + 3] = 255;
    }
  }
  x.putImageData(img, 0, 0);
  return c;
}
// Sprite fait main : une grille de lettres (pal : lettre → couleur ; '.' vide), contour ajouté autour, marge de 1 px.
// flip : retourné gauche-droite.
function grid(rows, pal, flip = false) {
  const w = Math.max(...rows.map((r) => r.length)), h = rows.length, c = cv(w + 2, h + 2), x = ctxOf(c);
  rows.forEach((row, j) => {
    for (let i = 0; i < row.length; i++) {
      const col = pal[row[i]];
      if (!col) continue;
      x.fillStyle = col;
      x.fillRect(1 + (flip ? w - 1 - i : i), 1 + j, 1, 1);
    }
  });
  return outline(c);
}
const skinPal = (skin) => { const R = ramp(skin); return { L: R.l, s: R.b, d: R.d, k: R.k, n: shade(skin, 0.38) }; };
// Agrandit sans lissage
function scaleUp(src, k) {
  if (k === 1) return src;
  const c = cv(src.width * k, src.height * k), x = ctxOf(c);
  x.imageSmoothingEnabled = false;
  x.drawImage(src, 0, 0, c.width, c.height);
  return c;
}
// Tourne un sprite autour de (px, py) d'un angle a (radians, sens horaire à l'écran), à la manière de RotSprite :
// agrandi ×8 par Scale2x (les diagonales restent des marches propres), échantillonné tourné, au centre de chaque pixel.
// Renvoie le canvas et map(x, y) : où tombe un point du sprite d'origine dans le nouveau canvas.
function scale2x(d, w, h) {
  const o = new Uint32Array(w * h * 4), W = w * 2;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const P = d[y * w + x], A = y > 0 ? d[(y - 1) * w + x] : P, B = x < w - 1 ? d[y * w + x + 1] : P;
    const C = x > 0 ? d[y * w + x - 1] : P, D = y < h - 1 ? d[(y + 1) * w + x] : P;
    const i = y * 2 * W + x * 2;
    o[i] = C === A && C !== D && A !== B ? A : P;
    o[i + 1] = A === B && A !== C && B !== D ? B : P;
    o[i + W] = D === C && D !== B && C !== A ? C : P;
    o[i + W + 1] = B === D && B !== A && D !== C ? D : P;
  }
  return o;
}
function rotate(src, a, px, py) {
  if (Math.abs(a) < 1e-3) return { c: src, map: (x, y) => [x, y] };
  const w = src.width, h = src.height;
  let d = new Uint32Array(ctxOf(src).getImageData(0, 0, w, h).data.buffer.slice(0)), sw = w, sh = h;
  for (let k = 0; k < 3; k++) { d = scale2x(d, sw, sh); sw *= 2; sh *= 2; }
  const co = Math.cos(a), si = Math.sin(a);
  const fw = (x, y) => [px + (x - px) * co - (y - py) * si, py + (x - px) * si + (y - py) * co];
  const cs = [fw(0, 0), fw(w, 0), fw(0, h), fw(w, h)];
  const x0 = Math.floor(Math.min(...cs.map((p) => p[0]))), y0 = Math.floor(Math.min(...cs.map((p) => p[1])));
  const W = Math.ceil(Math.max(...cs.map((p) => p[0]))) - x0, H = Math.ceil(Math.max(...cs.map((p) => p[1]))) - y0;
  const c = cv(W, H), x = ctxOf(c), img = x.createImageData(W, H), o = new Uint32Array(img.data.buffer);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const X = x0 + i + 0.5 - px, Y = y0 + j + 0.5 - py;
    const sx = px + X * co + Y * si, sy = py - X * si + Y * co;
    const u = Math.floor(sx * 8), v = Math.floor(sy * 8);
    if (u < 0 || v < 0 || u >= sw || v >= sh) continue;
    o[j * W + i] = d[v * sw + u];
  }
  x.putImageData(img, 0, 0);
  return { c, map: (X, Y) => { const p = fw(X, Y); return [p[0] - x0, p[1] - y0]; } };
}
function mirror(src) {
  const c = cv(src.width, src.height), x = ctxOf(c);
  x.translate(src.width, 0); x.scale(-1, 1); x.drawImage(src, 0, 0);
  return c;
}
function fillPoly(x, pts, col) {
  const ys = pts.map((p) => p[1]), y0 = Math.floor(Math.min(...ys)), y1 = Math.ceil(Math.max(...ys));
  x.fillStyle = col;
  for (let y = y0; y <= y1; y++) {
    const yc = y + 0.5, xs = [];
    for (let i = 0; i < pts.length; i++) {
      const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % pts.length];
      if ((ay <= yc && by > yc) || (by <= yc && ay > yc)) xs.push(ax + ((yc - ay) / (by - ay)) * (bx - ax));
    }
    xs.sort((a, b) => a - b);
    for (let i = 0; i + 1 < xs.length; i += 2) x.fillRect(rd(xs[i]), y, rd(xs[i + 1]) - rd(xs[i]), 1);
  }
}

// ------------------------------------------------------------------ éclair et fumée
function flash(x, cx, cy, r, seed = 0, squash = 0.85) {
  const rand = rng(seed + 11), cols = ['#c83418', '#f07818', '#f8c030', '#fff0a0', '#ffffff'];
  for (let k = 0; k < 5; k++) {
    const rr = r * (1 - k * 0.19), n = 8, pts = [];
    for (let i = 0; i < n * 2; i++) {
      const a = (i / (n * 2)) * Math.PI * 2 + seed * 0.4;
      const l = i % 2 ? rr * (0.36 + rand() * 0.1) : rr * (0.75 + rand() * 0.3);
      pts.push([cx + Math.cos(a) * l, cy + Math.sin(a) * l * squash]);
    }
    fillPoly(x, pts, cols[k]);
  }
}
function smoke(x, cx, cy, seed = 0, n = 5, big = 1) {
  const rand = rng(seed + 5);
  for (let i = 0; i < n; i++) {
    const r = Math.max(1, rd((1.5 + i * 0.7) * big)), px = cx + Math.sin(i * 1.3 + seed) * 2 * big, py = cy - i * 3.4 * big;
    disc(x, px, py + 1, r + 1, '#8a847a');
    disc(x, px, py, r, i % 2 ? '#c8c4bc' : '#e4e0d8');
    if (rand() < 0.6) { x.fillStyle = '#f8f4ee'; x.fillRect(rd(px - r * 0.4), rd(py - r * 0.5), 1, 1); }
  }
}

// ------------------------------------------------------------------ mains (grilles faites main, main droite)
// L reflet, s peau, d ombre, k pli entre les doigts. Le contour sombre est ajouté autour.
// Dos du poing, vu d'au-dessus (mes mains) : les doigts repliés en haut, la rangée des jointures, le dos de la main,
// le pouce sur le côté intérieur (à gauche pour la main droite) ; le poignet en bas, au milieu.
const FIST_BACK = [
  '......dd..dd..dd...',
  '.....LsskLsskLss...',
  '..Ls.LsdkLsdkLsdkLs',
  '.LskLLsdLLsdLLsdLsd',
  'LsskLsssssssssssssd',
  'LsskLsssssssssssssd',
  'LsdkLsssssssssssssd',
  '.sdk.ssssssssssssd.',
  '..d...sssssssssssd.',
  '......dssssssssdd..',
];
const FIST_BACK_WRIST = [12, 11];
// Poing de face, les jointures vers moi (ses poings) : quatre doigts repliés côte à côte, le pouce en travers dessous
// (côté intérieur, à gauche) ; le doigt `lift` levé d'un pixel (il pianote).
const FIST_FRONT = [
  '.Ls.Ls.Ls...',
  '.LskLskLskLs',
  '.sskssksskss',
  '.ddkddkddkdd',
  'LLLLLLsdkssd',
  'Lssssssdksdd',
  '.ddddddd.dd.',
];
const FRONT_FINGERS = [[1, 2], [4, 5], [7, 8], [10, 11]];
// Main à la poignée, de profil : le pouce par-dessus, le dos de la main sur la poignée, les doigts repliés dessous,
// l'index tendu vers la détente, le poignet qui part en bas à gauche.
const GRIP = [
  '......LLLLLLL.......',
  '.....Lsssssssd......',
  '...LLsskkkkkk.......',
  '..Lssssssssssd......',
  '.Lsssssssssssd......',
  '.Lsssssssssssd......',
  'LsLsdLsdLsdLd.......',
  'Lssdksdksdk.Lssssd..',
  'Lsdd.dd.dd...dddd...',
  'Lsd.................',
  'sd..................',
];
const GRIP_WRIST = [1, 11];
const hands = new Map();
function handSprite(kind, skin, o = {}) {
  const key = `${kind}|${skin}|${o.flip ? 1 : 0}|${o.lift ?? -1}`;
  let c = hands.get(key);
  if (c) return c;
  let rows = { back: FIST_BACK, front: FIST_FRONT, grip: GRIP }[kind];
  if (kind === 'front' && o.lift >= 0) {
    // doigt levé : ses quatre lignes du haut remontent d'un pixel
    const [a, b] = FRONT_FINGERS[o.lift], R = ['.'.repeat(rows[0].length), ...rows];
    rows = R.map((row, j) => [...row].map((ch, i) => (i >= a && i <= b ? (j < 4 ? (R[j + 1] || '.')[i] : j === 4 ? 'd' : ch) : ch)).join(''));
  }
  c = grid(rows, skinPal(skin), o.flip);
  hands.set(key, c);
  return c;
}

// ------------------------------------------------------------------ derringer de profil (pixels simples)
// Deux canons nickelés superposés, la carcasse, la crosse d'ivoire en bec d'oiseau, le chien ; pointe à droite.
function derSide(hd = false) {
  const c = cv(26, 16), x = ctxOf(c);
  const R = (a, b, w, h, col) => { x.fillStyle = col; x.fillRect(a, b, w, h); };
  // crosse en bec
  const grip = [[2, 7, 5], [2, 8, 5], [1, 9, 5], [1, 10, 5], [1, 11, 4], [2, 12, 3]];
  for (const [a, b, w] of grip) R(a - 1, b, w + 2, 1, OUT);
  R(1, 13, 4, 1, OUT);
  for (const [a, b, w] of grip) { R(a, b, w, 1, IVORY.b); R(a, b, 1, 1, IVORY.l); R(a + w - 1, b, 1, 1, IVORY.d); }
  // carcasse et canons
  R(4, 2, 7, 7, OUT); R(10, 1, 13, 7, OUT);
  R(5, 3, 5, 5, NICKEL.b); R(5, 3, 5, 1, NICKEL.l); R(9, 3, 1, 5, NICKEL.d);
  R(11, 2, 11, 2, NICKEL.b); R(11, 2, 11, 1, NICKEL.l); R(11, 4, 11, 1, OUT); R(11, 5, 11, 2, NICKEL.b); R(11, 5, 11, 1, NICKEL.l); R(11, 6, 11, 1, NICKEL.d);
  // chien, détente
  const hy = hd ? 2 : 0; R(4, hy, 3, 3 - hy, OUT); R(5, hy + 1, 1, 2 - hy, NICKEL.d);
  R(8, 9, 1, 2, OUT);
  return { c, muz: [22.5, 3], grip: [3, 7] };
}

// Mains sur le fusil (et mes avant-bras) : retirées, le fusil se tient seul ; rl-test.html?hands les remet
export const RL_OPT = { hands: false };

// ------------------------------------------------------------------ caches
const CACHE = lru(70), OCACHE = lru(170);
function memo(cache, key, make) { let c = cache.get(key); if (!c) { c = make(); cache.set(key, c); } return c; }

// Mon avant-bras (en demi-pixels de l'écran : il sera agrandi ×2), du poignet w vers dir jusqu'à hors champ : la
// peau, la manchette de chemise, la manche de la tenue (plus large) ; reflet à gauche, ombre à droite
function myForearm(x, w, dir, skin, cloth, len = 70) {
  const l = Math.hypot(dir[0], dir[1]), u = [dir[0] / l, dir[1] / l];
  let n = [-u[1], u[0]];
  if (n[0] > 0) n = [-n[0], -n[1]];
  // n : vers la gauche de l'écran
  // (tous les contours d'abord, puis les couleurs : pas de trait entre la peau, la manchette et la manche)
  const band = (a, b, w0, w1, R, out) => {
    const p = [w[0] + u[0] * a, w[1] + u[1] * a], q = [w[0] + u[0] * b, w[1] + u[1] * b];
    const at = (pt, e) => [pt[0] + n[0] * e, pt[1] + n[1] * e];
    const quad = (e0, e1, f0, f1) => [at(p, e0), at(q, f0), at(q, f1), at(p, e1)];
    if (out) { fillPoly(x, quad(w0 + 1, -w0 - 1, w1 + 1, -w1 - 1), OUT); return; }
    fillPoly(x, quad(w0, -w0, w1, -w1), R.b);
    fillPoly(x, quad(w0, w0 - 1.2, w1, w1 - 1.2), R.l);
    fillPoly(x, quad(-w0 + 1.4, -w0, -w1 + 1.4, -w1), R.d);
  };
  for (const out of [true, false]) {
    band(-2, 7, 3.5, 4, ramp(skin), out);
    band(6, 8.5, 4.4, 4.6, ramp(SHIRT), out);
    band(8.5, len, 5, 6.5, ramp(cloth), out);
  }
  // ourlet de la manche
  const h = [w[0] + u[0] * 8.5, w[1] + u[1] * 8.5];
  x.fillStyle = ramp(cloth).k;
  for (let e = -5; e <= 5; e++) x.fillRect(rd(h[0] + n[0] * e), rd(h[1] + n[1] * e), 1, 1);
}

// ================================================================== moi (vue subjective, pixels doubles)
// Les images de mes armes couvrent le bas de l'écran (384 × 130), posées en (RL_X, RL_Y) ; dessinées en demi-pixels.
export const RL_X = 0, RL_Y = 86;
const HW = 192, HH = 65, VW = 384, VH = 130;
const toScreen = (p) => [p[0] * 2 + RL_X, p[1] * 2 + RL_Y];

// Mon poing pour les objets : le dos de la main, les jointures en haut (l'objet tenu se dessine dessous, il dépasse),
// l'avant-bras et la manche qui filent vers le bas de l'écran. side : 1 main droite, -1 main gauche ; far : poing
// lointain (posé sur la table). c.ax, c.ay : milieu du poing ; c.wx, c.wy : le poignet (bracelet des menottes).
export function rlFist(side, skin, cloth, far = false) {
  return memo(CACHE, `fist|${side}|${skin}|${cloth}|${far ? 1 : 0}`, () => {
    const h = handSprite('back', skin, { flip: side < 0 }), k = far ? 1 : 2;
    const W = 32, H = far ? 50 : 85, c = cv(W, H), x = ctxOf(c);
    const fx = rd(W / 2 - h.width / 2), fy = 4, wx = fx + (side < 0 ? h.width - 1 - FIST_BACK_WRIST[0] : FIST_BACK_WRIST[0]), wy = fy + FIST_BACK_WRIST[1];
    myForearm(x, [wx, wy - 2], [0.12 * side, 1], skin, cloth);
    x.drawImage(h, fx, fy);
    const out = scaleUp(c, k);
    if (out !== c) freeCanvas(c);
    out.ax = (fx + h.width / 2) * k; out.ay = (fy + h.height / 2 + 1) * k; out.wx = wx * k; out.wy = (wy + 1) * k;
    return out;
  });
}

// Mon fusil braqué sur lui, en 3/4 : de profil (l'autre flanc : la bouche à gauche), la crosse qui sort en bas à
// droite vers mon épaule, le canon qui monte vers lui ; main gauche enroulée sous la pompe, main droite à la poignée,
// avant-bras qui sortent par le bas. États : 'idle', 'fire' (0 éclair, 1 fumée), 'reload' (0, 1, 2 : pompe tirée,
// douille éjectée, pompe renvoyée ; levier ouvert ; canons cassés). c.muz : la bouche sur l'écran.
const ME_AIM = { muz: [190, 130], a: 0.42, K: 2.4, th: 1.25 };
export function rlGunView(kind, state, frame, skin, cloth, sawed = false) {
  return memo(CACHE, `gun|${kind}|${state}|${frame}|${skin}|${cloth}|${sawed ? 1 : 0}`, () => {
    const g = GUNS[kind] || GUNS.pump, fired = state === 'fire', act = state === 'reload' ? [0.6, 1, 0.35][frame] || 0 : 0;
    const pump = g.action === 'pump' ? act * 9 : act;
    const T = ME_AIM, a = Math.PI + T.a, end = gunEnd(sawed, kind);
    const G0 = gunMap([0, 0], a, T.K, true, T.th), m0 = G0.P(end + 0.3, 5.6);
    const G = gunMap([T.muz[0] - RL_X - m0[0], T.muz[1] - RL_Y - m0[1]], a, T.K, true, T.th);
    const S = sheet(VW, VH);
    // le bras droit passe sous la crosse ; le gauche vient d'en bas, sous la pompe
    const hands = RL_OPT.hands;
    if (hands) forearm(S, G.P(25.6, 13.4), [0.32, 1], T.K, skin, cloth);
    const A = drawGun(S, G, kind, sawed, { pump, hd: fired, spent: frame === 1 });
    const F = A.fore, FG = F.G || G;
    if (hands) {
      forearm(S, FG.P(F.u - 3.4, F.vb + 4.2), [-0.12, 1], T.K, skin, cloth);
      foreHand(S, FG, skin, F.u, F.vt, F.vb);
      gripHand(S, G, skin);
    }
    const m = A.muz;
    if (fired && frame === 0) flash(S.ctx, m[0] - 8, m[1] - 4, 18, 3);
    if (fired && frame === 1) smoke(S.ctx, m[0] - 3, m[1] - 6, 3, 5, 1.4);
    if (state === 'reload' && frame === 1) for (let i = 0; i < (g.action === 'double' ? 2 : 1); i++) shell(S.ctx, A.port[0] + 6 + i * 10, A.port[1] - 22 - i * 8, g.action === 'lever', 2);
    const c = S.done();
    c.muz = [m[0] + RL_X, m[1] + RL_Y];
    return c;
  });
}
// Cartouche en l'air : étui rouge (ou laiton), culot de laiton ; k : taille du pixel
function shell(x, cx, cy, brass = false, k = 1) {
  const px = rd(cx), py = rd(cy), R = (a, b, w, h, col) => { x.fillStyle = col; x.fillRect(px + a * k, py + b * k, w * k, h * k); };
  R(-1, -1, 4, 7, OUT);
  R(0, 0, 2, 4, brass ? BRASS.b : '#a8281c'); R(0, 0, 1, 4, brass ? BRASS.l : '#d84a34');
  R(0, 4, 2, 1, BRASS.b);
}

// Fusil retourné contre moi : la bouche juste sous mes yeux, vue de face (l'anneau, l'âme noire, le magasin dessous),
// et le fusil qui fuit derrière elle en perspective, en biais vers le bas à droite (le flanc, la pompe rainurée, la
// carcasse, la crosse de plus en plus petites) ; ma main gauche enroulée sous la pompe, la droite à la poignée, les
// avant-bras qui sortent par le bas. f : 0 tenu, 1 éclair, 2 fumée, 3, 4, 5 réarmement.
const ME_SELF = { muz: [196, 130], a: -2.05, K: 2.4, tilt: 0.62, Zm: 3.4, Dm: 24, th: 1.15 };
const boreV = (kind) => ({ double: 5.9, lever: 5.2 })[(GUNS[kind] || GUNS.pump).action] ?? 5.6;
export function rlSelfView(kind, f, skin, cloth, sawed = false) {
  return memo(CACHE, `self|${kind}|${f}|${skin}|${cloth}|${sawed ? 1 : 0}`, () => {
    const g = GUNS[kind] || GUNS.pump, act = f >= 3 ? [0.6, 1, 0.35][f - 3] : 0, T = ME_SELF;
    const end = gunEnd(sawed, kind), S = sheet(VW, VH);
    // (on ne casse pas le deux-coups tourné vers soi)
    const G = gunMapPersp([T.muz[0] - RL_X, T.muz[1] - RL_Y], T.a, T.K, { tilt: T.tilt, Zm: T.Zm, Dm: T.Dm, end, vm: boreV(kind), flip: true, th: T.th });
    const hands = RL_OPT.hands;
    if (hands) forearm(S, G.P(25.6, 13.4), [0.15, 1], T.K * G.z(26), skin, cloth);
    // (la main à la poignée, loin derrière la bouche : dessinée avant le fusil, qui passe devant)
    if (hands) gripHand(S, G, skin);
    const A = drawGun(S, G, kind, sawed, { pump: g.action === 'pump' ? act * 9 : g.action === 'lever' ? act : 0, hd: f === 1, front: true });
    if (hands) {
      const F = A.fore;
      forearm(S, G.P(F.u - 3.4, F.vb + 4.2), [-0.45, 1], T.K * G.z(F.u), skin, cloth);
      foreHand(S, G, skin, F.u, F.vt, F.vb);
    }
    const m = drawMuzzles(S, G, kind, sawed);
    if (f === 1) flash(S.ctx, m[0], m[1] - 3, 34, 3);
    if (f === 2) smoke(S.ctx, m[0], m[1] - 12, 3, 5, 1.8);
    const c = S.done();
    c.muz = [m[0] + RL_X, m[1] + RL_Y];
    return c;
  });
}

// Mon derringer braqué sur lui : tenu de profil dans ma main droite, incliné vers lui, l'avant-bras qui sort en bas à
// droite. États : 'idle', 'fire' 0 éclair, 1 fumée ; c.muz : la bouche.
export function rlDerringerView(state, frame, skin, cloth) {
  return memo(CACHE, `der|${state}|${frame}|${skin}|${cloth}`, () => {
    const fired = state === 'fire', D = derSide(fired), grip = handSprite('grip', skin);
    // la main à la poignée, posée sur la crosse en bec du derringer
    const comp = cv(D.c.width + 8, D.c.height + 12), xc = ctxOf(comp), gx = 6 + D.grip[0] - 9, gy = D.grip[1] - 6;
    xc.drawImage(D.c, 6, 0);
    xc.drawImage(grip, gx, gy);
    freeCanvas(D.c);
    const H = { c: comp, muz: [D.muz[0] + 6, D.muz[1]], gripW: [gx + 1 + GRIP_WRIST[0], gy + 1 + GRIP_WRIST[1]] };
    const M = [100, 22];
    const { c } = myHeldOne(H, M, 0.3, skin, cloth, (x) => {
      if (fired && frame === 0) flash(x, M[0] - 3, M[1] - 1, 7, 5);
      if (fired && frame === 1) smoke(x, M[0] - 1, M[1] - 3, 2, 4, 0.7);
    });
    freeCanvas(comp);
    const out = scaleUp(c, 2);
    freeCanvas(c);
    out.muz = toScreen(M);
    return out;
  });
}
// (une seule main : celle de la poignée)
function myHeldOne(H, M, a, skin, cloth, after) {
  const c = cv(HW, HH), x = ctxOf(c);
  const src = mirror(H.c), fl = (p) => [src.width - p[0], p[1]];
  const r = rotate(src, a, ...fl(H.muz)), m = r.map(...fl(H.muz)), ox = rd(M[0] - m[0]), oy = rd(M[1] - m[1]);
  const w = r.map(...fl(H.gripW));
  myForearm(x, [w[0] + ox, w[1] + oy], [0.4, 1], skin, cloth);
  x.drawImage(r.c, ox, oy);
  after?.(x);
  if (r.c !== src) freeCanvas(r.c);
  freeCanvas(src);
  return { c };
}

// ================================================================== l'adversaire, en face (pixels simples)
// Son fusil, son derringer et ses poings sont dessinés ici, une fois par image clé ; ses avant-bras et ses bras, qui
// suivent ses mains à chaque image, sont dessinés à part (itemfx.js : oppLimb) du poignet que donne chaque image (c.wr)
// jusqu'au coude (rlOppElbow), derrière l'arme et les mains.
// Épaules de l'adversaire à l'écran (assis à sa place, oy = 40 : scene.js, oppShoulder) ; s = 1 à ma droite (sa gauche)
export const RL_SH = { '-1': { x: 166, y: 130 }, 1: { x: 218, y: 130 } };
// Coude de l'adversaire (écran) pour l'épaule sh et la main h ({ x, y }) : posé sur la table près de son flanc. Main
// sur la table, l'avant-bras file vers lui (le coude au bord, au-dessus de la main) ; main levée, le coude reste sur la
// table, sous elle ; avant-bras de RL_FA px au plus (le coude suit une main qui monte haut ou s'avance loin).
export const RL_FA = 30;
export function rlOppElbow(sh, h) {
  const k = Math.max(0, Math.min(1, (sh.y + 2 - h.y) / 14)), up = k * k * (3 - 2 * k);
  let x = sh.x + (h.x - sh.x) * (0.8 - 0.4 * up), y = sh.y - 6 + 12 * up;
  // main avancée loin sur la table, vers moi : il se penche, le coude s'écarte (le bras se plie au lieu de tomber droit)
  const below = h.y - sh.y - 8;
  if (below > 0) { x += Math.sign(sh.x - 192) * Math.min(10, below * 0.5); y += Math.min(8, below * 0.4); }
  const dx = x - h.x, dy = y - h.y, l = Math.hypot(dx, dy);
  if (l > RL_FA) { x = h.x + (dx * RL_FA) / l; y = h.y + (dy * RL_FA) / l; }
  return { x, y };
}

// --- poings : son poing de face, les jointures vers moi ; a : direction de son avant-bras (de la main vers le coude,
// en RL_FIST_N pas ; posé sur la table : vers le haut) ; lift : doigt levé (il pianote). c.ax, c.ay : milieu du poing ;
// c.wx, c.wy, c.wr : poignet et sa demi-largeur (itemfx.js : oppArm)
export const RL_FIST_N = 16;
export function rlOppFist(s, a, skin, lift = -1) {
  a = ((a % RL_FIST_N) + RL_FIST_N) % RL_FIST_N;
  return memo(OCACHE, `fist|${s}|${a}|${skin}|${lift}`, () => {
    // (sa main gauche, à ma droite : le pouce vers le milieu, à gauche)
    const h = handSprite('front', skin, { flip: s < 0, lift });
    const c = cv(h.width, h.height), ang = (a / RL_FIST_N) * Math.PI * 2;
    ctxOf(c).drawImage(h, 0, 0);
    c.ax = h.width / 2; c.ay = h.height / 2 + (lift >= 0 ? 0.5 : 0);
    c.wx = c.ax + Math.cos(ang) * 3; c.wy = c.ay + Math.sin(ang) * 3; c.wr = 3.4;
    return c;
  });
}

// --- son fusil
// Tenu de profil (pris sur la table, levé, ou retourné contre lui : la bouche sous son menton, en biais devant son
// torse), ou de face quand il le braque sur moi. f = { u : 0 posé → 1 tenu, s : (contre lui) sa main gauche de la
// bouche (0) à la pompe (1), pump : pompe tirée / canons cassés / levier (0 → 1), kick : recul (0 → 1), fire : 0
// éclair, 1 fumée (-1 rien), hd : chien abattu }. Renvoie le canvas recadré (c.x, c.y à l'écran), c.muz, c.port, c.wr
// (poignets { s, x, y, r } et coudes e, pour ses bras) et c.hc (milieu de chaque main : où ses poings viennent prendre
// le fusil posé).
const GUN_REST = { x: 142, y: 156 };
// poses de profil : le milieu de sa main à la poignée à l'écran, l'angle ; contre lui, la bouche sous son menton
const OPP_SELF = { muz: [205, 116], a: -0.56 }, OPP_K = 1.15;
// braqué sur moi : en perspective, la bouche de face (gunMapPersp)
const OPP_AIM = { a: -0.5, K: 1.15, tilt: 0.5, Zm: 3.4, Dm: 26, th: 1.1 };
function oppSidePose(mode, u, end) {
  const rest = { gx: GUN_REST.x + 31.5, gy: GUN_REST.y + 8.5, a: 0 };
  let hold;
  if (mode === 'self') {
    const a = OPP_SELF.a, l = (end - 31.5) * OPP_K;
    hold = { gx: OPP_SELF.muz[0] - Math.cos(a) * l, gy: OPP_SELF.muz[1] - Math.sin(a) * l, a };
  } else hold = { gx: 168, gy: 136, a: -0.3 };
  const e = sm(u);
  return { gx: lerp(rest.gx, hold.gx, e), gy: lerp(rest.gy, hold.gy, e) - 6 * Math.sin(Math.PI * Math.min(1, u)), a: lerp(rest.a, hold.a, e) };
}
// braqué sur moi, il est vu de face à partir de cette prise
const AIM_FRONT = 0.7;
export function rlOppGunView(kind, sawed, mode, f, skin) {
  const q = (v) => Math.round((v || 0) * 100);
  const key = `ogun|${kind}|${sawed ? 1 : 0}|${mode}|${q(f.u ?? 1)}|${mode === 'self' ? q(f.s) : 100}|${q(f.pump)}|${q(f.kick)}|${f.fire ?? -1}|${f.hd ? 1 : 0}|${skin}`;
  return memo(OCACHE, key, () => {
    const self = mode === 'self', u = f.u ?? 1, act = f.pump || 0, g = GUNS[kind] || GUNS.pump;
    const hu = mode === 'aim' ? u * u : 0;
    const elbow = (s, h) => {
      const e = rlOppElbow(RL_SH[s], { x: h[0], y: h[1] });
      const k = s > 0 ? { x: h[0] + 3, y: Math.min(h[1] + 16, 138) } : { x: h[0] - 13, y: h[1] + 8 };
      return { x: lerp(e.x, k.x, hu), y: lerp(e.y, k.y, hu) };
    };
    if (u < AIM_FRONT || self) {
      // de profil : le fusil dessiné à son angle ; sa main gauche (à ma droite) sous la pompe, ou (contre lui)
      // remontée serrer le canon sous la bouche
      const end = gunEnd(sawed, kind), p = oppSidePose(mode, u, end), a = p.a - (self ? 0.1 : 0.2) * (f.kick || 0);
      const S = sheet(240, 150), O0 = [p.gx - 120, p.gy - 75];
      const G1 = gunMap([0, 0], a, OPP_K, false, 1.15), g0 = G1.P(31.5, 8.5);
      const G = gunMap([120 - g0[0], 75 - g0[1]], a, OPP_K, false, 1.15), L = (pt) => [pt[0] + O0[0], pt[1] + O0[1]];
      const A = drawGun(S, G, kind, sawed, { pump: g.action === 'pump' ? act * 9 : act, hd: f.hd });
      const F = A.fore, FG = F.G || G, sl = self ? f.s ?? 0 : 1, end2 = A.end;
      const fu = lerp(end2 - 13, F.u, sl), fvt = lerp(3.4, F.vt, sl), fvb = lerp(10.4, F.vb, sl);
      const FH = sl > 0.5 ? FG : G;
      const fw = RL_OPT.hands ? foreHand(S, FH, skin, fu, fvt, fvb) : FH.P(fu - 3.4, fvb + 4.2);
      const gw = RL_OPT.hands ? gripHand(S, G, skin) : G.P(25.6, 13.4);
      const m = A.muz;
      if (f.fire === 0) flash(S.ctx, m[0] + (self ? 1 : 3), m[1], self ? 8 : 12, kind.length);
      if (f.fire === 1) smoke(S.ctx, m[0], m[1] - 3, kind.length, 4, 0.8);
      const c = crop(S.done());
      c.x += O0[0]; c.y += O0[1];
      const hc = { '-1': L(A.grip), 1: L((sl > 0.5 ? FG : G).P(fu, (fvt + fvb) / 2)) };
      c.muz = L(m); c.port = L(A.port); c.hc = hc;
      c.wr = [{ s: -1, ...xy(L(gw)), r: 2.2, e: elbow(-1, hc[-1]) }, { s: 1, ...xy(L(fw)), r: 2.2, e: elbow(1, hc[1]) }];
      return c;
    }
    // braqué sur moi : la bouche de face, devant son menton, et le fusil qui fuit derrière elle en perspective vers son
    // épaule droite (à ma gauche) ; sa main gauche enroulée sous la pompe, la droite à la poignée
    const k = sm((u - AIM_FRONT) / (1 - AIM_FRONT)), C = [lerp(186, 192, k), lerp(122, 113, k) - (f.kick || 0) * 3];
    const T = OPP_AIM, end = gunEnd(sawed, kind), S = sheet(140, 100), O = [rd(C[0]) - 90, rd(C[1]) - 40];
    const G = gunMapPersp([C[0] - O[0], C[1] - O[1]], T.a + (f.kick || 0) * 0.15, T.K, { tilt: T.tilt, Zm: lerp(1.6, T.Zm, k), Dm: T.Dm, end, vm: boreV(kind), th: T.th });
    // (sa main à la poignée, loin derrière la bouche : dessinée avant le fusil, qui passe devant)
    const gw = RL_OPT.hands ? gripHand(S, G, skin) : G.P(25.6, 13.4);
    const A = drawGun(S, G, kind, sawed, { pump: g.action === 'pump' ? act * 9 : g.action === 'lever' ? act : 0, hd: f.hd, front: true });
    const F = A.fore, L = (pt) => [pt[0] + O[0], pt[1] + O[1]];
    const fw = RL_OPT.hands ? foreHand(S, G, skin, F.u, F.vt, F.vb) : G.P(F.u - 3.4, F.vb + 4.2);
    const m = drawMuzzles(S, G, kind, sawed);
    if (f.fire === 0) flash(S.ctx, m[0], m[1], g.action === 'double' ? 18 : 15, kind.length);
    if (f.fire === 1) smoke(S.ctx, m[0], m[1] - 4, kind.length);
    const c = crop(S.done());
    c.x += O[0]; c.y += O[1];
    const hc = { '-1': L(A.grip), 1: L(G.P(F.u, (F.vt + F.vb) / 2)) };
    c.muz = L(m); c.port = L(A.port); c.hc = hc;
    c.wr = [{ s: -1, ...xy(L(gw)), r: 2.2, e: elbow(-1, hc[-1]) }, { s: 1, ...xy(L(fw)), r: 2.2, e: elbow(1, hc[1]) }];
    return c;
  });
}
// Recadre un canvas sur ce qui est dessiné : c.x, c.y = décalage du coin gardé
function crop(src) {
  const w = src.width, h = src.height, d = ctxOf(src).getImageData(0, 0, w, h).data;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) { x0 = y0 = x1 = y1 = 0; }
  const c = cv(x1 - x0 + 1, y1 - y0 + 1);
  ctxOf(c).drawImage(src, -x0, -y0);
  freeCanvas(src);
  c.x = x0; c.y = y0;
  return c;
}
const xy = (p) => ({ x: p[0], y: p[1] });

// --- son derringer : dans son poing droit (à ma gauche), braqué sur moi (on voit ses deux bouches superposées), le
// bras tendu vers moi. f : 'r0', 'r1' (sorti de la botte, encore levé vers le plafond), 'aim', 'fire0' (éclair,
// recul), 'fire1' (fumée). Dessiné autour de la main ; c.ax, c.ay : milieu du poing dans le canvas (scene.js le recopie
// où est la main), c.mx, c.my : la bouche, c.wx, c.wy, c.wr : le poignet.
export function rlOppDerringerView(f, skin) {
  return memo(OCACHE, `oder|${f}|${skin}`, () => {
    const c = cv(40, 44), x = ctxOf(c), h = handSprite('front', skin, { flip: true });
    const hx = 20, hy = 30, fx = rd(hx - h.width / 2), fy = rd(hy - h.height / 2);
    let mx, my;
    if (f === 'r0' || f === 'r1') {
      // de profil, la bouche vers le plafond (r0) ou en biais (r1), la crosse dans le poing
      const D = derSide(false), a = f === 'r0' ? -Math.PI / 2 : -Math.PI / 4;
      const r = rotate(D.c, a, ...D.grip), g = r.map(...D.grip), ox = rd(hx - g[0] - 1), oy = rd(hy - g[1] - 2);
      x.drawImage(r.c, ox, oy);
      const m = r.map(...D.muz); mx = m[0] + ox; my = m[1] + oy;
      if (r.c !== D.c) freeCanvas(r.c);
      freeCanvas(D.c);
    } else {
      // de face : la carcasse nickelée au-dessus du poing, ses deux bouches l'une sur l'autre
      const kick = f === 'fire0' ? 2 : f === 'fire1' ? 1 : 0, bx = hx - 3, by = fy - 9 - kick;
      x.fillStyle = OUT; x.fillRect(bx - 1, by - 1, 8, 12);
      x.fillStyle = NICKEL.b; x.fillRect(bx, by, 6, 10);
      x.fillStyle = NICKEL.l; x.fillRect(bx, by, 6, 1); x.fillRect(bx, by, 1, 10);
      x.fillStyle = NICKEL.d; x.fillRect(bx + 5, by, 1, 10); x.fillRect(bx, by + 9, 6, 1);
      for (const yy of [by + 1, by + 5]) { x.fillStyle = OUT; x.fillRect(bx + 1, yy, 4, 3); x.fillStyle = BORE; x.fillRect(bx + 2, yy + 1, 2, 1); }
      mx = bx + 3; my = by + 2;
      if (f === 'fire0') flash(x, mx, my, 9, 5);
      if (f === 'fire1') smoke(x, mx, my - 3, 2, 4, 0.7);
    }
    x.drawImage(h, fx, fy);
    c.ax = hx; c.ay = hy; c.mx = rd(mx); c.my = rd(my); c.wx = hx - 2; c.wy = hy + 2; c.wr = 3.4;
    return c;
  });
}
