// Le fusil de la roulette en pixels fins, et les mains qui le tiennent (rlart.js s'en sert) : de profil (pris, levé,
// incliné vers l'adversaire, retourné sous son menton) ou de face (la bouche vers l'écran).
// Le profil est décrit pièce par pièce dans le repère du fusil de la table (sprites.js : gunSprite ; u de la crosse à
// la bouche, v vers le dessous), puis dessiné directement à l'angle voulu (gunMap) : pas d'image tournée, des bords
// nets à tous les angles. Chaque pièce (crosse, poignée, carcasse, canon, magasin, pompe, doigt, paume, pouce…) est une
// silhouette pleine, ombrée à plat d'après ses bords à l'écran (reflet en haut à gauche, ombre en bas à droite : la
// lumière reste la même quel que soit l'angle) et cernée d'un pixel sombre posé sur les pièces d'avant ; les détails
// (veines du bois, quadrillage de la poignée, vis, fenêtre d'éjection, rainures de la pompe, ongles) viennent dessus.
import { OUT, shade, makeCanvas, freeCanvas, gunEnd, GUNS, WOODS, METALS } from './sprites.js';

const rd = Math.round;
const lerp = (a, b, t) => a + (b - a) * t;
const hexRgb = (hex) => { const n = parseInt(hex.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
const OUT_RGB = hexRgb(OUT);

// ------------------------------------------------------------------ rampes
const ramps = new Map();
export function ramp(col) {
  let r = ramps.get(col);
  if (!r) { r = { l: shade(col, 0.2), b: col, d: shade(col, -0.22), k: shade(col, -0.4) }; ramps.set(col, r); }
  return r;
}
export const woodR = (W) => ({ l: W.l, b: W.b, d: W.d, k: W.dd });
export const metR = (M) => ({ l: M.l, b: M.b, d: M.d, k: shade(M.d, -0.38) });
const PAD = ramp('#2e2622');
const BRASS = { l: '#f8e08a', b: '#c8901c', d: '#7a5010', k: '#4a3008' };
const rgbOf = new WeakMap();
const rgbs = (R) => { let v = rgbOf.get(R); if (!v) { v = { l: hexRgb(R.l), b: hexRgb(R.b), d: hexRgb(R.d), k: hexRgb(R.k) }; rgbOf.set(R, v); } return v; };

// ------------------------------------------------------------------ pinceau de silhouettes
function brush(ctx, W, H) {
  const box = [1e9, 1e9, -1e9, -1e9];
  function scan(bx0, by0, bx1, by1, inside) {
    const x0 = Math.max(0, Math.floor(bx0)), y0 = Math.max(0, Math.floor(by0));
    const x1 = Math.min(W - 1, Math.ceil(bx1)), y1 = Math.min(H - 1, Math.ceil(by1));
    for (let y = y0; y <= y1; y++) {
      let run = -1;
      for (let x = x0; x <= x1 + 1; x++) {
        const ins = x <= x1 && inside(x + 0.5, y + 0.5);
        if (ins && run < 0) run = x;
        else if (!ins && run >= 0) {
          ctx.fillRect(run, y, x - run, 1);
          if (run < box[0]) box[0] = run;
          if (x - 1 > box[2]) box[2] = x - 1;
          if (y < box[1]) box[1] = y;
          if (y > box[3]) box[3] = y;
          run = -1;
        }
      }
    }
  }
  return {
    box,
    // trait épais aux bouts ronds, de rayon ra à rb
    cap(ax, ay, bx, by, ra, rb = ra) {
      ra = Math.max(0.6, ra); rb = Math.max(0.6, rb);
      const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1e-9, m = Math.max(ra, rb);
      scan(Math.min(ax, bx) - m, Math.min(ay, by) - m, Math.max(ax, bx) + m, Math.max(ay, by) + m, (px, py) => {
        let t = ((px - ax) * dx + (py - ay) * dy) / L2;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const r = ra + (rb - ra) * t, ex = px - ax - dx * t, ey = py - ay - dy * t;
        return ex * ex + ey * ey <= r * r;
      });
    },
    ell(cx, cy, rx, ry, ang = 0) {
      rx = Math.max(0.6, rx); ry = Math.max(0.6, ry);
      const c = Math.cos(ang), s = Math.sin(ang), m = Math.max(rx, ry);
      scan(cx - m, cy - m, cx + m, cy + m, (px, py) => {
        const u = ((px - cx) * c + (py - cy) * s) / rx, v = (-(px - cx) * s + (py - cy) * c) / ry;
        return u * u + v * v <= 1;
      });
    },
    poly(pts) {
      const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
      scan(Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys), (px, py) => {
        let ins = false;
        for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
          const [xi, yi] = pts[i], [xj, yj] = pts[j];
          if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) ins = !ins;
        }
        return ins;
      });
    },
  };
}
function line(ctx, x0, y0, x1, y1) {
  const n = Math.max(1, Math.abs(rd(x1) - rd(x0)), Math.abs(rd(y1) - rd(y0)));
  for (let i = 0; i <= n; i++) ctx.fillRect(rd(x0 + ((x1 - x0) * i) / n), rd(y0 + ((y1 - y0) * i) / n), 1, 1);
}
// Ombrage à plat d'une silhouette : à nl px d'un bord haut ou gauche le reflet, à nd px d'un bord bas ou droit l'ombre
// (le tout dernier, l'ombre profonde, si nd ≥ 2), sinon la teinte ; puis le cerne. Hors du canvas compte comme plein.
function cel(x, box, W, H, R, o) {
  const x0 = Math.max(0, box[0] - 1), y0 = Math.max(0, box[1] - 1), x1 = Math.min(W - 1, box[2] + 1), y1 = Math.min(H - 1, box[3] + 1);
  const w = x1 - x0 + 1, h = y1 - y0 + 1, img = x.getImageData(x0, y0, w, h), d = img.data, n = w * h;
  const A = new Uint8Array(n);
  for (let i = 0; i < n; i++) A[i] = d[i * 4 + 3] > 127 ? 1 : 0;
  const on = (i, j) => {
    const gx = x0 + i, gy = y0 + j;
    if (gx < 0 || gy < 0 || gx >= W || gy >= H) return true;
    return i >= 0 && j >= 0 && i < w && j < h && A[j * w + i] === 1;
  };
  const nl = o.nl ?? 1, nd = o.nd ?? 1, C = rgbs(R), out = o.out === false ? null : OUT_RGB, m = Math.max(nl, nd);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const q = j * w + i, p = q * 4;
    let c = null;
    if (A[q]) {
      let dl = 99, dr = 99;
      for (let s = 1; s <= m; s++) {
        if (dl === 99 && (!on(i - s, j) || !on(i, j - s))) dl = s;
        if (dr === 99 && (!on(i + s, j) || !on(i, j + s))) dr = s;
      }
      c = dr <= nd ? (nd >= 2 && dr === 1 ? C.k : C.d) : dl <= nl ? C.l : C.b;
    } else if (out && ((i > 0 && A[q - 1]) || (i < w - 1 && A[q + 1]) || (j > 0 && A[q - w]) || (j < h - 1 && A[q + w]))) c = out;
    if (c) { d[p] = c[0]; d[p + 1] = c[1]; d[p + 2] = c[2]; d[p + 3] = 255; } else d[p + 3] = 0;
  }
  x.putImageData(img, x0, y0);
}
// Feuille de dessin : part(R, draw, o) trace une pièce (draw(b) : sa silhouette au pinceau b), l'ombre, la cerne, et
// la pose sur ce qui est déjà là ; paint, line, px : détails à plat par-dessus.
export function sheet(W, H) {
  const c = makeCanvas(W, H, true), ctx = c.getContext('2d', { willReadFrequently: true });
  const t = makeCanvas(W, H, true), tx = t.getContext('2d', { willReadFrequently: true });
  return {
    c, ctx, W, H,
    part(R, draw, o = {}) {
      tx.fillStyle = '#fff';
      const b = brush(tx, W, H);
      draw(b);
      if (b.box[2] < b.box[0]) return;
      cel(tx, b.box, W, H, R, o);
      ctx.drawImage(t, 0, 0);
      tx.clearRect(b.box[0] - 2, b.box[1] - 2, b.box[2] - b.box[0] + 5, b.box[3] - b.box[1] + 5);
    },
    paint(col, draw) { ctx.fillStyle = col; draw(brush(ctx, W, H)); },
    line(col, x0, y0, x1, y1) { ctx.fillStyle = col; line(ctx, x0, y0, x1, y1); },
    px(col, x, y, w = 1, h = 1) { ctx.fillStyle = col; ctx.fillRect(rd(x), rd(y), w, h); },
    done() { freeCanvas(t); return c; },
  };
}

// ------------------------------------------------------------------ repère du fusil
// Point (u, v) du profil → écran : O (où tombe u = v = 0), a (angle de l'axe crosse → bouche), K (px par unité),
// flip : profil retourné (on voit l'autre flanc ; le dessous reste en bas) ; th : le fusil épaissi d'autant (plus
// trapu, lisible de loin).
export function gunMap(O, a, K, flip = false, th = 1) {
  const d = [Math.cos(a), Math.sin(a)], f = flip ? -1 : 1, n = [-Math.sin(a) * f * th, Math.cos(a) * f * th];
  const P = (u, v) => [O[0] + (d[0] * u + n[0] * v) * K, O[1] + (d[1] * u + n[1] * v) * K];
  const G = {
    P, K, a, f, d, n,
    // à l'écran, l'angle d'un axe local tourné de ang
    ang: (ang) => a + ang * f,
    cap: (b, u0, v0, u1, v1, r0, r1 = r0) => b.cap(...P(u0, v0), ...P(u1, v1), r0 * K, r1 * K),
    ell: (b, u, v, ru, rv, ang = 0) => b.ell(...P(u, v), ru * K, rv * K, a + ang * f),
    poly: (b, pts) => b.poly(pts.map(([u, v]) => P(u, v))),
    line: (S, col, u0, v0, u1, v1) => S.line(col, ...P(u0, v0), ...P(u1, v1)),
    lines: (S, col, pts) => { for (let i = 1; i < pts.length; i++) S.line(col, ...P(...pts[i - 1]), ...P(...pts[i])); },
    px: (S, col, u, v) => S.px(col, ...P(u, v)),
  };
  return G;
}
// Le fusil braqué vers l'écran, un peu de biais, en perspective : la bouche en M (tout près, grossie de Zm), le flanc
// qui fuit derrière elle le long de a (angle à l'écran, de la crosse vers la bouche), raccourci par le biais tilt (0 :
// pile de face) et rapetissant avec la distance (Dm : à combien d'unités la taille de la bouche a diminué de moitié…
// à peu près). end, vm : bout du canon et hauteur de l'âme dans le profil. Mêmes outils que gunMap.
export function gunMapPersp(M, a, K, o) {
  const { tilt, Zm, Dm, end, vm = 5.6, flip = false, th = 1 } = o;
  const d = [Math.cos(a), Math.sin(a)], f = flip ? -1 : 1, n = [-Math.sin(a) * f, Math.cos(a) * f];
  const sT = Math.sin(tilt), cT = Math.cos(tilt);
  const z = (u) => Zm / (1 + ((end - u) * cT) / Dm);
  const P = (u, v) => { const k = K * z(u); return [M[0] + (d[0] * (u - end) * sT + n[0] * (v - vm) * th) * k, M[1] + (d[1] * (u - end) * sT + n[1] * (v - vm) * th) * k]; };
  return {
    P, z, a, f, d, n, tilt, th, K: K * z(end - 30),
    cap: (b, u0, v0, u1, v1, r0, r1 = r0) => b.cap(...P(u0, v0), ...P(u1, v1), r0 * K * z(u0), r1 * K * z(u1)),
    ell: (b, u, v, ru, rv, ang = 0) => b.ell(...P(u, v), ru * K * z(u) * Math.max(0.45, sT), rv * K * z(u), a + ang * f),
    poly: (b, pts) => b.poly(pts.map(([u, v]) => P(u, v))),
    line: (S, col, u0, v0, u1, v1) => S.line(col, ...P(u0, v0), ...P(u1, v1)),
    lines: (S, col, pts) => { for (let i = 1; i < pts.length; i++) S.line(col, ...P(...pts[i - 1]), ...P(...pts[i])); },
    px: (S, col, u, v) => S.px(col, ...P(u, v)),
    // rayon (px) d'une section ronde de rayon r (unités) en u, et l'écrasement de sa face vue de biais
    rad: (u, r) => r * K * z(u) * th, squash: cT,
  };
}
// Bouches tournées vers l'écran (repère en perspective) : la face du magasin, puis l'anneau du canon, sa couronne
// éclairée en haut à gauche et l'âme qui s'enfonce dans le noir (deux bouches pour le deux-coups)
export function drawMuzzles(S, G, kind, sawed) {
  const g = GUNS[kind] || GUNS.pump, M = metR(METALS[g.metal]), end = gunEnd(sawed, kind), act = g.action;
  const face = (u, v, r, bore) => {
    const c = G.P(u, v), R = G.rad(u, r), Q = R * G.squash, ang = G.a;
    S.part(M, (b) => b.ell(c[0], c[1], Q, R, ang), R >= 5 ? { nl: 2, nd: 2 } : {});
    if (!bore) { S.paint(M.k, (b) => b.ell(c[0] + 0.5, c[1] + 0.5, Q * 0.45, R * 0.45, ang)); return; }
    if (R >= 4) for (let t = 3.3; t < 4.9; t += 0.06) S.px(M.l, c[0] + Math.cos(t) * (R - 1.6), c[1] + Math.sin(t) * (R - 1.6));
    S.paint('#24242c', (b) => b.ell(c[0], c[1], Q * 0.74, R * 0.74, ang));
    S.paint('#121216', (b) => b.ell(c[0] + R * 0.05, c[1] + R * 0.05, Q * 0.6, R * 0.6, ang));
    S.paint('#000000', (b) => b.ell(c[0] + R * 0.12, c[1] + R * 0.12, Q * 0.4, R * 0.4, ang));
    if (R >= 4) S.px('#ffffff', c[0] - R * 0.55, c[1] - R * 0.5);
  };
  if (act === 'double') { face(end, 7.7, 1.7, true); face(end, 4.1, 1.7, true); return G.P(end, 5.9); }
  const thin = act === 'lever', me = (sawed ? end - 2 : end - 8) - (thin ? 4 : 0), mv = thin ? 7.6 : 8.8, bv = thin ? 5.2 : 5.6;
  face(me, mv, thin ? 1 : 1.2, false);
  face(end, bv, thin ? 1.25 : 1.6, true);
  return G.P(end, bv);
}
// La même pièce tournée autour de (cu, cv) dans le plan du profil (canons cassés, levier ouvert)
const turned = (G, cu, cv, a) => {
  if (!a) return G;
  const c = Math.cos(a), s = Math.sin(a), T = (u, v) => [cu + (u - cu) * c - (v - cv) * s, cv + (u - cu) * s + (v - cv) * c];
  const P = (u, v) => G.P(...T(u, v));
  return { ...G, P, cap: (b, u0, v0, u1, v1, r0, r1 = r0) => b.cap(...P(u0, v0), ...P(u1, v1), r0 * G.K, r1 * G.K),
    ell: (b, u, v, ru, rv, ang = 0) => b.ell(...P(u, v), ru * G.K, rv * G.K, G.a + (ang + a) * G.f),
    poly: (b, pts) => b.poly(pts.map(([u, v]) => P(u, v))),
    line: (S, col, u0, v0, u1, v1) => S.line(col, ...P(u0, v0), ...P(u1, v1)),
    lines: (S, col, pts) => { for (let i = 1; i < pts.length; i++) S.line(col, ...P(...pts[i - 1]), ...P(...pts[i])); },
    px: (S, col, u, v) => S.px(col, ...P(u, v)) };
};

// ------------------------------------------------------------------ le fusil de profil
// o : { pump (pompe tirée vers la carcasse, en unités ; levier ouvert ; canons cassés : 0 → 1), hd (chien abattu),
// front (braqué vers l'écran : pas de guidon, il flotterait à côté de la bouche) }.
// Renvoie les repères à l'écran : bouche, fenêtre d'éjection, poignée, pompe (u et le manche tenu par la main avant).
export function drawGun(S, G, kind, sawed, o = {}) {
  const g = GUNS[kind] || GUNS.pump, Wd = woodR(WOODS[g.wood]), M = metR(METALS[g.metal]), X = metR(METALS[g.recv]);
  const end = gunEnd(sawed, kind), act = g.action, K = G.K, fine = K >= 1.6, big = K >= 1.6 ? { nl: 2, nd: 2 } : {};
  const open = act === 'double' ? o.pump || 0 : 0, slide = act === 'pump' ? o.pump || 0 : 0, lever = act === 'lever' ? o.pump || 0 : 0;
  // crosse, plaque de couche (et son liseré), veines du bois
  S.part(Wd, (b) => G.poly(b, [[0.4, 8], [10, 7.3], [22, 6.5], [29, 6], [29, 10.6], [20, 12.2], [10, 14.2], [0.4, 16]]), big);
  if (fine) {
    G.lines(S, Wd.d, [[3, 9.4], [12, 8.7], [20, 8.1], [27, 7.5]]);
    G.lines(S, Wd.d, [[4, 12], [11, 11.2], [18, 10.4], [24, 9.6]]);
    G.lines(S, Wd.d, [[7, 14], [14, 12.6], [19, 11.6]]);
    G.lines(S, Wd.l, [[5, 10.6], [13, 10], [21, 9.2]]);
  }
  S.part(PAD, (b) => G.poly(b, [[-1.2, 7.7], [0.5, 7.7], [0.5, 16.3], [-1.2, 16.3]]));
  if (fine) G.line(S, '#d8cfc0', 0.7, 8.1, 0.7, 15.9);
  // poignée, quadrillée
  S.part(Wd, (b) => G.poly(b, [[27, 6], [35, 6], [35, 11], [27.5, 10.8]]), big);
  if (fine) for (let u = 28.2; u < 33.6; u += 1.3) { G.line(S, Wd.d, u, 6.8, u + 1.6, 10.2); G.line(S, Wd.d, u + 1.6, 6.8, u, 10.2); }
  // carcasse
  S.part(X, (b) => G.poly(b, [[33.5, 3], [50, 3], [50, 11], [33.5, 11]]), big);
  if (fine) G.line(S, X.l, 34.6, 3.9, 49.2, 3.9);
  if (act === 'pump') {
    // fenêtre d'éjection
    S.paint(OUT, (b) => G.poly(b, [[38, 4.9], [45.2, 4.9], [45.2, 7.8], [38, 7.8]]));
    S.paint('#30343c', (b) => G.poly(b, [[38.6, 5.4], [44.6, 5.4], [44.6, 7.3], [38.6, 7.3]]));
    if (fine) G.line(S, X.l, 38.4, 7.8, 45, 7.8);
  } else if (act === 'lever') {
    // portière de chargement, gravure
    S.paint(X.d, (b) => G.poly(b, [[40, 6.4], [46.4, 6.4], [46.4, 8.8], [40, 8.8]]));
    if (fine) { G.lines(S, X.d, [[35.5, 5.2], [37, 4.6], [38.5, 5.4], [37.2, 6.4]]); G.px(S, X.l, 43, 7.4); }
  } else if (fine) {
    // jaspé de la trempe
    let s = 7;
    for (let i = 0; i < 26; i++) { s = (s * 9301 + 49297) % 233280; const r = s / 233280; s = (s * 9301 + 49297) % 233280; const t = s / 233280; G.px(S, i % 2 ? X.l : X.d, 35 + r * 13.5, 4.4 + t * 5.8); }
  }
  for (const u of [36.4, 47.6]) { S.paint(X.k, (b) => G.ell(b, u, 9, 0.6, 0.6)); if (fine) G.px(S, X.l, u - 0.2, 8.7); }
  // pontet et détente, ou levier (il s'ouvre vers le bas au réarmement)
  if (act === 'lever') {
    const L = turned(G, 47.5, 11, lever * 0.55);
    S.part(X, (b) => { L.cap(b, 35.6, 11, 35.6, 16.4, 0.6); L.cap(b, 35.6, 16.4, 43, 16.6, 0.6); L.cap(b, 43, 16.6, 46.8, 13.4, 0.6); L.cap(b, 46.8, 13.4, 47.5, 11, 0.6); L.cap(b, 38.6, 11, 39.4, 13.8, 0.45); });
  } else {
    S.part(M, (b) => { G.cap(b, 37, 11, 37.4, 13.5, 0.5); G.cap(b, 37.4, 13.5, 43.4, 13.9, 0.5); G.cap(b, 43.4, 13.9, 44.6, 11, 0.5); });
    S.part(M, (b) => G.cap(b, 40.2, 11, 40.9, 12.9, 0.42));
  }
  // chiens
  const hammer = (u) => S.part(M, (b) => (o.hd ? G.cap(b, u, 3, u + 0.8, 1.9, 0.62) : G.cap(b, u, 3, u - 1.4, 0.5, 0.62, 0.75)));
  if (act === 'lever') hammer(35);
  if (act === 'double') { hammer(35); hammer(38.4); }
  let muz, fore;
  if (act === 'double') {
    // deux canons l'un sur l'autre, le fût dessous ; cassés, ils basculent autour de la charnière
    const B = turned(G, 48.5, 9.5, open * 0.3);
    S.part(Wd, (b) => B.cap(b, 50.2, 10.9, 63, 10.9, 1.9), big);
    for (const [v0, v1] of [[6, 9.4], [2.4, 5.8]]) {
      S.part(M, (b) => B.poly(b, [[48, v0], [end, v0], [end, v1], [48, v1]]), big);
      if (fine) B.line(S, '#eef2f8', 49, v0 + 0.9, end - 1, v0 + 0.9);
      B.line(S, M.k, end - 0.5, v0 + 0.3, end - 0.5, v1 - 0.3);
    }
    if (!sawed && !o.front) S.paint(BRASS.b, (b) => B.ell(b, end - 1.6, 1.9, 0.55, 0.55));
    if (open && fine) for (const v of [4.1, 7.7]) S.paint(o.spent ? '#1a1a1e' : BRASS.b, (b) => B.ell(b, 48.4, v, 0.4, 1.3));
    muz = B.P(end + 0.3, 6); fore = { u: 56, vt: 9, vb: 12.7, G: B };
  } else {
    // magasin sous le canon, collier, canon (reflet, couronne, guidon)
    const thin = act === 'lever', me = (sawed ? end - 2 : end - 8) - (thin ? 4 : 0);
    const mv = thin ? [6.6, 8.6] : [7.6, 10];
    S.part(M, (b) => G.poly(b, [[48, mv[0]], [me, mv[0]], [me, mv[1]], [48, mv[1]]]));
    S.paint(M.k, (b) => G.poly(b, [[me - 0.5, mv[0] + 0.3], [me, mv[0] + 0.3], [me, mv[1] - 0.3], [me - 0.5, mv[1] - 0.3]]));
    const bv = thin ? [4, 6.4] : [4, 7.2];
    S.part(M, (b) => G.poly(b, [[48, bv[0]], [end, bv[0]], [end, bv[1]], [48, bv[1]]]), K >= 2 ? big : {});
    if (fine) G.line(S, '#eef2f8', 49, bv[0] + 0.9, end - 1.2, bv[0] + 0.9);
    G.line(S, M.k, end - 0.45, bv[0] + 0.3, end - 0.45, bv[1] - 0.3);
    if (!sawed) {
      S.part(M, (b) => G.poly(b, [[end - 10.4, bv[0] - 0.2], [end - 9, bv[0] - 0.2], [end - 9, mv[1] + 0.2], [end - 10.4, mv[1] + 0.2]]));
      if (!o.front) S.paint(BRASS.b, (b) => G.ell(b, end - 1.6, bv[0] - 0.5, 0.6, 0.6));
    } else if (fine) { G.px(S, OUT, end - 0.3, bv[0] + 0.6); G.px(S, OUT, end - 0.2, bv[1] - 0.8); }
    if (act === 'pump') {
      // pompe rainurée (tirée vers la carcasse au réarmement)
      const px = 58 - slide;
      S.part(Wd, (b) => G.cap(b, px + 1.4, 9.6, px + 16.6, 9.6, 2.6), big);
      for (let u = px + 3; u < px + 16; u += fine ? 1.5 : 3) { G.line(S, Wd.k, u, 7.8, u, 11.4); if (fine) G.line(S, Wd.l, u + 0.55, 7.9, u + 0.55, 11.3); }
      fore = { u: px + 9, vt: 7, vb: 12.2 };
    } else {
      S.part(Wd, (b) => G.cap(b, 55.4, 8.1, 66.6, 8.1, 2.1), big);
      fore = { u: 61, vt: 6, vb: 10.2 };
    }
    muz = G.P(end + 0.3, (bv[0] + bv[1]) / 2);
  }
  return { end, muz, port: G.P(41.5, 6.3), grip: G.P(31.5, 8.5), fore };
}

// ------------------------------------------------------------------ mains de profil
// Main avant, enroulée sous la pompe (ou sous le canon) : la paume dessous, les quatre doigts qui remontent sur le
// flanc (de l'auriculaire, côté crosse, à l'index), les ongles au bout ; uc : milieu de la main le long du fusil, vt,
// vb : dessus et dessous du manche tenu. Renvoie le poignet (écran).
const NAIL = (skin) => shade(skin, 0.42);
export function foreHand(S, G, skin, uc, vt, vb) {
  const R = ramp(skin), fine = G.K >= 1.4;
  S.part(R, (b) => G.ell(b, uc - 0.6, vb + 1.9, 6.6, 2.9), fine ? { nd: 2 } : {});
  const tips = [2.3, 1.1, 0.6, 1.2];
  for (let i = 0; i < 4; i++) {
    const u = uc - 4.95 + 3.3 * i, tip = vt + tips[i];
    S.part(R, (b) => G.cap(b, u, vb + 1.6, u, tip, 1.5));
    if (fine) {
      S.paint(NAIL(skin), (b) => G.ell(b, u + 0.15, tip + 0.75, 0.75, 0.62));
      G.line(S, R.k, u - 0.8, tip + 3.2, u + 0.8, tip + 3.2);
    }
  }
  return G.P(uc - 3.4, vb + 4.2);
}
// Main à la poignée : les doigts repliés dessous, le dos de la main sur la poignée, le pouce par-dessus (son ongle
// vers la carcasse), l'index tendu jusqu'à la détente. Renvoie le poignet (écran).
export function gripHand(S, G, skin) {
  const R = ramp(skin), fine = G.K >= 1.4;
  for (const u of [29.6, 32.2, 34.6]) S.part(R, (b) => G.cap(b, u, 9.8, u + 0.2, 12.6, 1.35));
  S.part(R, (b) => { G.ell(b, 30.6, 8.4, 5.6, 3.7, -0.12); G.cap(b, 28, 10, 25.8, 12.8, 2.7, 2.5); }, fine ? { nd: 2 } : {});
  if (fine) { G.px(S, R.l, 30.4, 10.9); G.px(S, R.l, 32.8, 11.1); G.px(S, R.l, 35, 10.9); G.line(S, R.k, 26.6, 9.6, 28.4, 8.2); }
  S.part(R, (b) => G.cap(b, 28.6, 5.6, 36, 4.5, 1.45, 1.25));
  if (fine) S.paint(NAIL(skin), (b) => G.ell(b, 35.6, 4.3, 0.7, 0.5));
  S.part(R, (b) => { G.cap(b, 35.6, 10.6, 39.4, 12, 1.2); G.cap(b, 39.4, 12, 40.2, 13.1, 1.05); });
  return G.P(25.6, 13.4);
}
// Avant-bras (pour mes mains), du poignet w vers dir, jusqu'à hors champ : la peau, la manchette, la manche ; k : px
// par unité (comme le fusil)
export function forearm(S, w, dir, k, skin, cloth, SHIRT = '#e8e0d0') {
  const l = Math.hypot(dir[0], dir[1]), u = [dir[0] / l, dir[1] / l], n = [-u[1], u[0]];
  const band = (a, b, w0, w1) => {
    const p = [w[0] + u[0] * a * k, w[1] + u[1] * a * k], q = [w[0] + u[0] * b * k, w[1] + u[1] * b * k];
    return (B) => B.poly([[p[0] + n[0] * w0 * k, p[1] + n[1] * w0 * k], [q[0] + n[0] * w1 * k, q[1] + n[1] * w1 * k], [q[0] - n[0] * w1 * k, q[1] - n[1] * w1 * k], [p[0] - n[0] * w0 * k, p[1] - n[1] * w0 * k]]);
  };
  const o = k >= 1.4 ? { nl: 2, nd: 2 } : {};
  S.part(ramp(skin), band(-3, 7.5, 2.6, 3), o);
  S.part(ramp(cloth), band(9, 90, 3.8, 5.2), o);
  S.part(ramp(SHIRT), band(7, 9.4, 3.3, 3.4));
}

// ------------------------------------------------------------------ le fusil de face (la bouche vers l'écran)
// Autour de la bouche C, à l'échelle s (1 : ma vue, la bouche fait 30 px) : la crosse et la carcasse loin derrière
// (vers stock : en bas pour moi, vers son épaule pour lui), la pompe (ou le fût) sous le canon, le bout du magasin,
// le collier, la bouche et son âme noire. slide : pompe ramenée vers la carcasse (elle s'éloigne). Renvoie la pompe.
export function drawGunFront(S, kind, C, s, o = {}) {
  const g = GUNS[kind] || GUNS.pump, Wd = woodR(WOODS[g.wood]), M = metR(METALS[g.metal]), X = metR(METALS[g.recv]);
  const dbl = g.action === 'double', lever = g.action === 'lever', st = o.stock || [0, 1], slide = o.slide || 0;
  const P = (dx, dy) => [C[0] + dx * s, C[1] + dy * s];
  const big = s >= 0.6 ? { nl: 2, nd: 2 } : {};
  const rect = (b, cx, cy, w, h) => { const p = P(cx, cy); b.poly([[p[0] - (w * s) / 2, p[1] - (h * s) / 2], [p[0] + (w * s) / 2, p[1] - (h * s) / 2], [p[0] + (w * s) / 2, p[1] + (h * s) / 2], [p[0] - (w * s) / 2, p[1] + (h * s) / 2]]); };
  const rrect = (b, cx, cy, w, h, r) => { const p = P(cx, cy), W = (w * s) / 2 - r * s, Hh = (h * s) / 2 - r * s; b.cap(p[0] - W, p[1] - Hh, p[0] + W, p[1] - Hh, r * s); b.cap(p[0] - W, p[1] + Hh, p[0] + W, p[1] + Hh, r * s); rect(b, cx, cy, w, h - 2 * r); rect(b, cx, cy, w - 2 * r, h); };
  // crosse et carcasse, loin derrière (la carcasse : son dessus éclairé, le pontet dessous)
  S.part(Wd, (b) => rect(b, st[0] * 64, st[1] * 64, 18, 26), big);
  S.part(X, (b) => rrect(b, st[0] * 44, st[1] * 44, 32, 24, 3), big);
  S.part(M, (b) => b.ell(...P(st[0] * 44 + 1, st[1] * 44 + 14), 5 * s, 3.5 * s));
  // pompe (ou fût) : sa face avant, rainurée sur le pourtour
  const py = (dbl ? 25 : 27) - slide * 4, pw = dbl ? 44 : lever ? 36 : 46, ph = dbl ? 18 : 24;
  S.part(Wd, (b) => rrect(b, 0, py, pw, ph, 6), big);
  S.part(ramp(Wd.l), (b) => rrect(b, -1, py - 1, pw - 10, ph - 9, 4), s >= 0.6 ? { nd: 2 } : {});
  if (s >= 0.6 && !dbl && !lever) for (let i = -2; i <= 2; i++) { const a = P(-pw / 2 + 2, py + i * 4.4), q = P(-pw / 2 + 5.5, py + i * 4.4); S.line(Wd.k, ...a, ...q); const a2 = P(pw / 2 - 5.5, py + i * 4.4), q2 = P(pw / 2 - 2, py + i * 4.4); S.line(Wd.k, ...a2, ...q2); }
  // collier qui tient canon et magasin
  if (!dbl) S.part(M, (b) => rrect(b, 0, lever ? 10 : 11, lever ? 14 : 16, lever ? 20 : 24, 5));
  // bout du magasin
  if (!dbl) {
    const m = P(0, lever ? 17 : 19);
    S.part(M, (b) => b.ell(m[0], m[1], 6.5 * s, 6.5 * s));
    S.paint(M.d, (b) => b.ell(m[0] + 0.5, m[1] + 0.5, 3.6 * s, 3.6 * s));
    if (s >= 0.6) S.line(M.k, m[0] - 2 * s, m[1], m[0] + 2 * s, m[1]);
  }
  // bouche(s) : l'anneau, la couronne éclairée en haut à gauche, l'âme qui s'enfonce dans le noir
  const bores = dbl ? [P(-12, 0), P(12, 0)] : [P(0, 0)], r = (dbl ? 11.5 : lever ? 13 : 15) * s;
  for (const p of bores) {
    S.part(M, (b) => b.ell(p[0], p[1], r, r), big);
    if (s >= 0.6) for (let a = 3.3; a < 4.9; a += 0.05) S.px(M.l, p[0] + Math.cos(a) * (r - 2.2), p[1] + Math.sin(a) * (r - 2.2));
    S.paint('#24242c', (b) => b.ell(p[0], p[1], r * 0.72, r * 0.72));
    S.paint('#121216', (b) => b.ell(p[0] + 0.6 * s, p[1] + 0.6 * s, r * 0.6, r * 0.6));
    S.paint('#000000', (b) => b.ell(p[0] + 1.4 * s, p[1] + 1.4 * s, r * 0.4, r * 0.4));
    if (s >= 0.6) S.px('#ffffff', p[0] - r * 0.62, p[1] - r * 0.5);
  }
  if (dbl && s >= 0.6) S.line(M.k, ...P(0, -9), ...P(0, 9));
  return { pump: P(0, py), pw: pw * s, ph: ph * s, r };
}
// Main serrée sur le flanc de la pompe, vue de face : le dos de la main dehors, quatre doigts qui passent sur la face
// avant (les ongles au bout), le pouce par-dessus ; side -1 : flanc gauche (main gauche). Renvoie le poignet.
export function sideHand(S, x, y, side, k, skin) {
  const R = ramp(skin), P = (dx, dy) => [x + dx * side * k, y + dy * k], o = k >= 0.6 ? { nd: 2 } : {};
  S.part(R, (b) => b.ell(...P(-9, 3), 8 * k, 11 * k), o);
  for (let i = 3; i >= 0; i--) {
    const yy = -7 + i * 4.6, len = [7, 8, 7.4, 6][i];
    S.part(R, (b) => b.cap(...P(-6, yy), ...P(-6 + len, yy + 0.4), 2.25 * k));
    if (k >= 0.6) { S.paint(NAIL(skin), (b) => b.ell(...P(-6 + len - 0.6, yy - 0.3), 1.3 * k, 1.1 * k)); S.line(R.k, ...P(-6 + len - 4, yy - 1.6), ...P(-6 + len - 4, yy + 1.6)); }
  }
  S.part(R, (b) => b.cap(...P(-13, -2), ...P(-6, -12), 2.6 * k, 2.3 * k));
  return P(-11, 13);
}
export { lerp };
