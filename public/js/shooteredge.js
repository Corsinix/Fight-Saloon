// Fusillade : les abords de Dusty Gulch, entre la gare et la grand-rue. Variantes tirées au sort (worlds.js, EDGES) :
// le cimetière de Boot Hill, le ranch, la mine d'or (dessinés ici, une fois par partie, avec les outils des décors du
// mode histoire : terrain tramé, végétation, bardages vieillis, roches à strates), et les décors du mode histoire
// repris tels quels (fort, mission, hacienda, mine du Vieux Joe : peints par storyset.js, seuls leurs abris sont ici).
// La géométrie (fenêtres, portes, toits, clocher, enseignes, abris) est celle des emplacements des cibles : les
// bandits surgissent dans ces rectangles, le dessin les suit au pixel près. Lumière en haut à gauche.
import * as S from './sprites.js';
import { canvasText } from './scene.js';
import { W, H, GROUND, PROP_BASE, EDGE_W, EDGE_COVER } from './worlds.js';
import { seeded, drawProp } from './shooterstreet.js';
import { R, O, rnd as lcg, sign as plank } from './story/sets/kit.js';
import { siding, battens, stone, cornice, shadow, box } from './story/sets/kit-ville.js';
import { shingles, logH, outlineRows, fillRows, colRows, shadowOf, veil } from './story/sets/kit-adobe.js';
import {
  P, Pix, Spr, hex, ramp, pick, vnoise, fbm, hsh, range, wall, ground, pebbles, ruts, sow,
  bush, tuft, boulder, pear, ocotillo, cholla, cottonwood, juniper,
} from './story/sets/kit-nature.js';

const OUT = S.OUT, OUTC = hex(OUT);
const sh = S.shade, mix = S.mix;
const hash = (n) => {
  let t = (n * 0x6d2b79f5) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

// palettes (Uint32 pour les tampons de pixels)
const PIERRE = ramp('3a3230 544a44 6e6258 887a6c a29482 b8ac9a cec4b2');
const MARBRE = ramp('4a4642 5e5a54 76716a 8e897e a6a092 bcb6a8 d0cabc e2ddd0');
const BOIS = ramp('2a1c14 3e2a1c 584030 72563e 8c6e50 a68864');
const PRE = ramp('3a3a1c 4a4a22 5e5c28 72702e 868236 9a9440 aea64e c0b660 d0c674');
const COLLINE = ramp('76705c 847c64 92886c a09476 ae9f80 bcab8c');
const DEBLAI = ramp('5a5048 746a5c 8e8470 a89e86 c0b69c d4ccb4');
const OCRE = ramp('2a1a1c 3a2422 4e3026 643c2c 7a4a32 905a3a a46a44 b47c50 c48e5e d2a070 dcb282 e6c49a');
const ROC = ramp('3a2620 52362a 6a4834 825c40 9a704e b28660 c69c76');
const FUMIER = ramp('2a1c14 3c2a1c 523a26 684a30 7e5c3a');

// ------------------------------------------------------------ petits outils
// trait épais d'un point à un autre (branches, poutres, haubans)
function line(g, x0, y0, x1, y1, w, col) {
  const n = Math.max(1, Math.abs(Math.round(x1 - x0)), Math.abs(Math.round(y1 - y0)));
  for (let i = 0; i <= n; i++) R(g, x0 + ((x1 - x0) * i) / n - w / 2, y0 + ((y1 - y0) * i) / n - w / 2, w, w, col);
}
// poutre cernée (contour d'abord, bois ensuite), éclairée dessus
function beam(g, x0, y0, x1, y1, w, col) {
  line(g, x0, y0, x1, y1, w + 2, OUT);
  line(g, x0, y0, x1, y1, w, col);
  line(g, x0, y0 - Math.floor(w / 2) + 0.5, x1, y1 - Math.floor(w / 2) + 0.5, 1, sh(col, 0.22));
}
// ne dessine draw() que dans les lignes [y, x0, x1]
function clipRows(g, rows, draw) {
  g.save(); g.beginPath();
  for (const [y, a, b] of rows) g.rect(a, y, b - a, 1);
  g.clip(); draw(); g.restore();
}
// ellipse d'ombre portée (rgba : se pose sur n'importe quel sol, celui des décors du mode histoire compris)
function dropShadow(g, cx, cy, rx, ry, a = 0.3) {
  g.fillStyle = `rgba(30,16,14,${a})`;
  for (let dy = -ry; dy <= ry; dy++) {
    const hw = Math.round(rx * Math.sqrt(1 - (dy / (ry + 0.5)) ** 2));
    g.fillRect(Math.round(cx - hw), Math.round(cy + dy), hw * 2 + 1, 1);
  }
}
const signW = (t) => t.length * 7 + 12;
const css = (u) => `#${[u & 255, (u >> 8) & 255, (u >> 16) & 255].map((v) => v.toString(16).padStart(2, '0')).join('')}`;

// L'intérieur d'une ouverture (fenêtre, porte) : sombre, plus noir en haut ; rideaux facultatifs (ils restent dans le
// rectangle : le bandit passe devant)
function room(g, x, y, w, h, cur = null) {
  R(g, x, y, w, h, '#2a1e18');
  R(g, x, y, w, Math.round(h * 0.45), '#221812');
  R(g, x, y, w, 3, '#160e0a');
  R(g, x + w - 3, y + 3, 3, h - 3, '#1c140f'); // le tableau, à l'ombre
  if (cur) {
    const cl = sh(cur, 0.2), cd = sh(cur, -0.35);
    for (let k = 0; k < h; k++) {
      const wv = Math.max(2, Math.round(4 - Math.abs(k - h * 0.55) / (h * 0.2)));
      R(g, x, y + k, wv, 1, cur); R(g, x + wv - 1, y + k, 1, 1, cd); R(g, x, y + k, 1, 1, cl);
      R(g, x + w - wv, y + k, wv, 1, cd); R(g, x + w - wv, y + k, 1, 1, cur);
    }
    R(g, x, y, w, 3, cur); R(g, x, y, w, 1, cl); R(g, x, y + 3, w, 1, cd);
  }
}
// Fenêtre autour de l'ouverture r : chambranle, linteau mouluré, appui, volets ; rien ne déborde dans r
function pane(g, r, o = {}) {
  const { x, y, w, h } = r;
  const fr = o.frame || '#d8ccb0', fl = sh(fr, 0.22), fd = sh(fr, -0.32);
  if (o.shutters) for (const sx of [x - 11, x + w + 4]) {
    const c = o.shutters;
    R(g, sx - 1, y - 3, 9, h + 6, OUT); R(g, sx, y - 2, 7, h + 4, c);
    for (let yy = y; yy < y + h + 1; yy += 3) R(g, sx + 1, yy, 5, 1, sh(c, -0.3));
    R(g, sx, y - 2, 1, h + 4, sh(c, 0.22)); R(g, sx + 6, y - 2, 1, h + 4, sh(c, -0.4));
    R(g, sx + 1, y + Math.round(h / 2), 5, 1, sh(c, 0.12));
  }
  if (o.cap !== false) {
    R(g, x - 6, y - 9, w + 12, 6, OUT); R(g, x - 5, y - 8, w + 10, 4, fr); R(g, x - 5, y - 8, w + 10, 1, fl); R(g, x - 5, y - 5, w + 10, 1, fd);
    shadow(g, x - 3, y - 3, w + 8, 1, 0.25);
  }
  R(g, x - 3, y - 3, w + 6, h + 6, OUT);
  R(g, x - 2, y - 2, w + 4, h + 4, fr);
  R(g, x - 2, y - 2, w + 4, 1, fl); R(g, x - 2, y - 2, 1, h + 4, fl); R(g, x + w + 1, y - 1, 1, h + 3, fd);
  room(g, x, y, w, h, o.curtain);
  R(g, x - 5, y + h + 2, w + 10, 3, OUT); R(g, x - 4, y + h + 2, w + 8, 2, fr); R(g, x - 4, y + h + 2, w + 8, 1, fl);
  shadow(g, x - 3, y + h + 5, w + 8, 2, 0.3);
}
// Porte ouverte (rectangle d : le bandit s'y montre) : chambranle, linteau, vantail rabattu dedans, seuil
function doorway(g, d, o = {}) {
  const { x, y, w, h } = d;
  const fr = o.frame || '#d8ccb0', col = o.col || '#5a3a22', fl = sh(fr, 0.22), fd = sh(fr, -0.32);
  if (o.cap !== false) {
    R(g, x - 7, y - 10, w + 14, 6, OUT); R(g, x - 6, y - 9, w + 12, 4, fr); R(g, x - 6, y - 9, w + 12, 1, fl); R(g, x - 6, y - 6, w + 12, 1, fd);
  }
  R(g, x - 4, y - 4, w + 8, h + 4, OUT);
  R(g, x - 3, y - 3, w + 6, h + 3, fr);
  R(g, x - 3, y - 3, w + 6, 1, fl); R(g, x - 3, y - 3, 1, h + 3, fl); R(g, x + w + 2, y - 2, 1, h + 2, fd);
  R(g, x, y, w, h, '#1e1410'); R(g, x, y, w, 5, '#140c08');
  for (let k = 0; k < 7; k++) R(g, x, y + h - 7 + k, w, 1, mix('#1e1410', '#4a3626', k / 7)); // le plancher
  R(g, x + w - 3, y + 5, 3, h - 12, '#170f0b');
  // le vantail rabattu contre l'embrasure gauche, en fuite
  for (let k = 0; k < 7; k++) {
    const yy = y + Math.round(k * 0.6);
    R(g, x + k, yy, 1, h - Math.round(k * 0.6) * 2, k === 0 ? sh(col, 0.2) : k === 6 ? OUT : sh(col, -0.08 * k));
  }
  R(g, x + 2, y + Math.round(h * 0.5), 2, 2, '#c8a040');
  R(g, x - 5, y + h, w + 10, 2, OUT); R(g, x - 4, y + h, w + 8, 1, sh(fr, -0.15));
}
// Ogive (fenêtre ou porte de chapelle) : demi-largeur half au départ, hauteur ah ; renvoie les lignes [y, x0, x1]
function ogive(cx, base, half, ah) {
  const rows = [];
  for (let dy = ah; dy >= 1; dy--) {
    const hw = half * (1 - (dy / (ah + 0.5)) ** 1.7);
    rows.push([base - dy, Math.round(cx - hw), Math.round(cx + hw)]);
  }
  return rows;
}
// Enseigne de planches claires : le texte est écrit par image (edgeSigns) en (cx, y)
function plate(g, cx, y, t) {
  const sw = signW(t), x = Math.round(cx - sw / 2);
  shadow(g, x + 2, y + 11, sw, 3, 0.3);
  R(g, x - 1, y - 4, sw + 2, 15, OUT);
  R(g, x, y - 3, sw, 13, '#dcc490');
  R(g, x, y - 3, sw, 1, '#f0dcac'); R(g, x, y + 3, sw, 1, '#c4a872'); R(g, x, y + 9, sw, 1, '#a88a58');
  R(g, x + 1, y - 2, 1, 11, '#b89c68'); R(g, x + sw - 2, y - 2, 1, 11, '#b89c68');
  for (const nx of [x + 3, x + sw - 4]) { R(g, nx, y - 1, 1, 1, '#5a4a40'); R(g, nx, y + 6, 1, 1, '#5a4a40'); }
}
// croix de bois penchée (sprite cerné), planche funéraire, stèle, tertre de cailloux (comme à Boot Hill)
function crossSpr(h, lean, seed) {
  const w = Math.round(h * 0.7) + 6, s = new Spr(w, h + 2, w >> 1, h + 1);
  const th = h > 14 ? 2 : 1, arm = Math.round(h * 0.28), ay = Math.round(h * 0.3);
  for (let y = 0; y < h; y++) {
    const x = (w >> 1) + Math.round((lean * (h - y)) / h);
    for (let k = 0; k < th; k++) s.set(x + k, y, BOIS[k === 0 ? 4 : 2]);
    if (y === ay || (th > 1 && y === ay + 1)) for (let k = -arm; k <= arm; k++) s.set(x + k, y, BOIS[y === ay ? 4 : 2]);
  }
  if (hsh(seed, 1) < 0.5) s.set((w >> 1) + Math.round(lean * 0.7), ay + 1, BOIS[1]);
  return s.outline(OUTC);
}
function boardSpr(h, lean) {
  const w = 9, s = new Spr(w + 4, h + 2, (w + 4) >> 1, h + 1);
  for (let y = 0; y < h; y++) for (let k = 0; k < w - 2; k++) {
    if (y === 0 && (k === 0 || k === w - 3)) continue;
    s.set(2 + k + Math.round((lean * (h - y)) / h), y + 1, BOIS[k === 0 ? 5 : k > w - 5 ? 2 : 3]);
  }
  for (let k = 1; k < w - 4; k += 2) s.set(3 + k, Math.round(h * 0.45), BOIS[1]);
  return s.outline(OUTC);
}
function steleSpr(h, Rm = PIERRE) {
  const w = Math.round(h * 0.75), s = new Spr(w + 2, h + 2, (w + 2) >> 1, h + 1);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dy = y - w / 2, dx = x + 0.5 - w / 2;
    if (y < w / 2 && dx * dx + dy * dy > (w / 2) ** 2) continue;
    s.set(x + 1, y + 1, pick(Rm, Rm.length - 1.8 - (x / w) * 2.6 + (y < 2 ? 1 : 0), x, y));
  }
  s.rect(Math.round(w / 2) - 1, Math.round(h * 0.4), 3, 1, Rm[2]); s.rect(Math.round(w / 2) - 2, Math.round(h * 0.55), 5, 1, Rm[2]);
  return s.outline(OUTC);
}
function cairn(Pp, x, y, len, seed, Rm = PIERRE, hh = 4) {
  for (let i = 0; i < len * 2.2; i++) {
    const u = (hsh(i, 1, seed) - 0.5) * len, v = (1 - (2 * u / len) ** 2) * hh * hsh(i, 2, seed);
    boulder(1 + Math.round(hsh(i, 3, seed) * 1.6), seed * 31 + i, Rm, Rm[0]).blit(Pp, Math.round(x + u), Math.round(y - v));
  }
}

// ------------------------------------------------------------ sols et fonds (tampon de pixels)
// les maisons : intervalles [x0, x1] à éviter pour les petites tombes et la végétation du fond
const spans = (E, pad = 0) => E.houses.filter((h) => h.w).map((h) => [h.x - pad, h.x + h.w + pad]);
const inSpans = (sp, x) => sp.some(([a, b]) => x > a && x < b);

const GROUNDS = {
  // la colline de Boot Hill : gravier beige tramé, tertres et croix sur le versant, grille de fer forgé
  boothill(g, E) {
    const Pp = new Pix(g);
    const crest = (x) => Math.round(122 + 6 * Math.sin(x / 170 + 1) + 3 * Math.sin(x / 53) + Math.sin(x / 17) * 0.8);
    for (let x = 0; x < EDGE_W; x++) {
      const t0 = crest(x);
      for (let y = t0; y < H; y++) {
        const d = Math.min(1, (y - t0) / 70), nz = fbm(x / (6 + d * 18), y / (3 + d * 8), 81, 3) - 0.5;
        let l = 6.4 - d * 2.4 + nz * 2.2 + (y - t0 < 1 ? 1.6 : y - t0 < 2 ? 0.6 : 0);
        if (y >= GROUND) l = 5 - Math.min(1, (y - GROUND) / 50) * 1.4 + nz * 2;
        Pp.set(x, y, pick(P.terre, l, x, y));
      }
    }
    // le chemin de terre battue, au pied de la grille
    const path = (x) => 180 + Math.sin(x / 140) * 4 + Math.sin(x / 47) * 1.5;
    for (let x = 0; x < EDGE_W; x++) {
      const y0 = Math.round(path(x)), hw = 7 + Math.round(Math.sin(x / 90) * 2);
      for (let k = -hw; k <= hw; k++) if (vnoise(x / 3, k, 7) > 0.2 + Math.abs(k) / hw * 0.5) Pp.set(x, y0 + k, pick(P.terre, 6.2 + vnoise(x / 2, (y0 + k) / 2, 8) - Math.abs(k) / hw, x, y0 + k));
    }
    ruts(Pp, 0, EDGE_W, path, () => 8, P.terre, 3.4);
    pebbles(Pp, { y0: 126, n: EDGE_W * 2.4, R: P.terre, seed: 82, grass: 0.35 });
    // petites tombes sur le versant, entre les bâtiments
    const sp = spans(E, 6);
    const graves = [];
    for (let x = 14, i = 0; x < EDGE_W; i++) {
      x += 18 + Math.floor(hsh(i, 1, 90) * 30);
      if (inSpans(sp, x)) continue;
      graves.push([crest(x) + 8 + Math.floor(hsh(i, 2, 90) * 20), x, 0.55 + hsh(i, 3, 90) * 0.3, hsh(i, 4, 90)]);
    }
    graves.sort((a, b) => a[0] - b[0]);
    for (const [y, x, sz, k] of graves) {
      const len = Math.round(20 * sz);
      Pp.shadow(x + 3, y + 1, len / 2 + 2, 2);
      cairn(Pp, x, y, len, x);
      const lean = Math.round((hsh(x, 9) - 0.5) * 6 * sz), hx = x - Math.round(len / 2) + 1;
      if (k < 0.5) crossSpr(Math.round(26 * sz), lean, x).blit(Pp, hx, y - 1);
      else if (k < 0.75) boardSpr(Math.round(18 * sz), lean).blit(Pp, hx, y - 1);
      else steleSpr(Math.round(17 * sz)).blit(Pp, hx, y - 1);
    }
    sow(Pp, { y0: 124, y1: 160, n: 150, seed: 83, avoid: (x, y) => y < crest(x) + 2 || inSpans(sp, x),
      make: (d, s) => [bush(1 + Math.round(d * 2), s, P.sauge), tuft(3 + Math.round(d * 4), s, P.herbe), tuft(3 + Math.round(d * 3), s, P.herbe), bush(2, s, P.olive), pear(2 + Math.round(d), s)][s % 5] });
    for (const [x, hh, s] of [[150, 30, 2], [470, 26, 5], [1150, 32, 7], [1480, 28, 3]]) ocotillo(hh, s, null).blit(Pp, x, crest(x) + 8);
    for (const [x, s] of [[700, 4], [905, 6], [1420, 1]]) cholla(11, s).blit(Pp, x, crest(x) + 12);
    Pp.put();
    // la grille de fer forgé du cimetière (derrière les bâtiments) : piliers, barreaux à pointes de lance, rouille
    const IRON = '#3a3438', ILT = '#6a6266', RUST = '#7a4a2e';
    for (let x = 0; x < EDGE_W; x += 6) {
      if (hash(x * 3 + 1) < 0.05) continue; // un barreau arraché
      const bent = hash(x * 7) < 0.06 ? 1 : 0, hh = 16;
      R(g, x - 1 + bent, GROUND - hh - 1, 3, hh + 1, OUT);
      R(g, x + bent, GROUND - hh, 1, hh, ILT);
      R(g, x - 1 + bent, GROUND - hh - 2, 3, 1, OUT); R(g, x + bent, GROUND - hh - 4, 1, 3, OUT); R(g, x + bent, GROUND - hh - 3, 1, 1, ILT);
      if (hash(x) < 0.2) R(g, x + 1, GROUND - 6 - Math.floor(hash(x + 5) * 8), 1, 2, RUST);
    }
    for (const y of [GROUND - 13, GROUND - 4]) { R(g, 0, y - 1, EDGE_W, 3, OUT); R(g, 0, y, EDGE_W, 1, '#5a5458'); }
    for (let x = 22; x < EDGE_W; x += 64) {
      box(g, x, GROUND - 20, 5, 20, '#4a4448'); R(g, x, GROUND - 20, 1, 20, '#7a7276');
      S.disc(g, x + 2, GROUND - 23, 3, OUT); S.disc(g, x + 2, GROUND - 23, 2, '#4a4448'); R(g, x + 1, GROUND - 24, 1, 1, '#9a9296');
    }
  },
  // le ranch : collines lointaines, prairie tramée, clôture de perches, peupliers ; la cour en terre battue
  ranch(g, E) {
    const Pp = new Pix(g);
    const hz = (x) => 132 + Math.round(Math.sin(x / 260) * 2);
    const hill = (x) => 126 - fbm(x / 70, 0.5, 31, 3) * 14 - Math.max(0, Math.sin(x / 300 + 2)) * 5;
    range(Pp, { base: 140, top: hill, R: COLLINE, l0: 3, k: 7, seed: 31, haze: 0.25, hcol: hex('#d8c4a4') });
    sow(Pp, { y0: 112, y1: 134, n: 260, seed: 30, haze: 0.35, hcol: hex('#d8c4a4'), make: (d, s, x, y) => (y > hill(x) + 2 ? bush(1, s, P.olive) : null) });
    for (let x = 0; x < EDGE_W; x++) {
      const t0 = hz(x);
      for (let y = t0; y < GROUND + 2; y++) {
        const d = (y - t0) / (GROUND - t0), nz = fbm(x / (4 + d * 14), y / (1.4 + d * 4), 32, 3) - 0.5;
        Pp.set(x, y, pick(PRE, 6.6 - d * 2.2 + nz * 2.6 + (y === t0 ? 1 : 0), x, y));
      }
      // la cour : terre battue claire, herbe aux bords
      for (let y = GROUND + 2; y < H; y++) {
        const d = (y - GROUND) / (H - GROUND), nz = fbm(x / (8 + d * 20), y / (3 + d * 6), 33, 3) - 0.5;
        const grass = y < GROUND + 7 + vnoise(x / 5, 1, 34) * 6 || y > H - 6 - vnoise(x / 6, 2, 35) * 8;
        Pp.set(x, y, grass ? pick(PRE, 4.6 + nz * 2.4, x, y) : pick(P.terre, 6.8 - d * 1.6 + nz * 2.2, x, y));
      }
    }
    pebbles(Pp, { y0: 134, y1: GROUND, n: EDGE_W * 2, R: PRE, seed: 36, grass: 0.8, G: PRE });
    // fleurs des champs
    for (let i = 0; i < 900; i++) { const x = Math.floor(hsh(i, 1, 37) * EDGE_W), y = 136 + Math.floor(hsh(i, 2, 37) ** 0.8 * 30); Pp.set(x, y, hex(['#e8c84a', '#f0e8d0', '#b86a9a', '#e0a040'][i % 4])); }
    const path = (x) => 186 + Math.sin(x / 160) * 4 + Math.sin(x / 61) * 1.5;
    ruts(Pp, 0, EDGE_W, path, () => 13, P.terre, 3.2);
    pebbles(Pp, { y0: GROUND + 2, n: EDGE_W * 1.3, R: P.terre, seed: 38, grass: 0.25 });
    // la clôture de perches qui ferme la prairie
    Pp.put();
    for (let x = 4; x < EDGE_W; x += 26) {
      const hh = 14 + (x % 3);
      O(g, x, 152, [[0, -hh, 3, hh, '#7a6248']]); R(g, x, 152 - hh, 1, hh, '#a08462'); R(g, x + 2, 152 - hh, 1, hh, '#54402c');
    }
    for (const y of [141, 147]) { R(g, 0, y - 1, EDGE_W, 3, OUT); R(g, 0, y, EDGE_W, 1, '#8a7052'); }
    for (let x = 0; x < EDGE_W; x += 3) if (hash(x + 11) < 0.3) R(g, x, 141, 2, 1, '#a88a64');
    const Q = new Pix(g);
    const sp = spans(E, 4);
    for (const [x, hh, s, by] of [[555, 46, 2, 150], [735, 38, 5, 146], [1100, 52, 3, 152], [1468, 44, 6, 150], [376, 30, 8, 144]]) {
      Q.shadow(x + 6, by, 14, 3);
      cottonwood(hh, s).blit(Q, x, by);
    }
    sow(Q, { y0: 140, y1: GROUND, n: 110, seed: 39, avoid: (x) => inSpans(sp, x), make: (d, s) => [bush(1 + Math.round(d * 2), s, P.feuille), tuft(3 + Math.round(d * 4), s, PRE), bush(2, s, P.olive)][s % 3] });
    Q.put();
  },
  // la mine : falaise de grès en strates (corniches, cannelures, coulures), éboulis, galeries de prospection,
  // déblais ; la terre du carreau et la voie des wagonnets
  mine(g, E) {
    const Pp = new Pix(g);
    const top = (x) => 50 + 14 * Math.sin(x / 210) + 7 * Math.sin(x / 61 + 1) + (fbm(x / 26, 0.5, 61, 3) - 0.5) * 16;
    // contreforts et ravines : de grandes facettes éclairées à gauche
    const relief = (x, y) => { const f = (xx) => fbm(xx / 40, y / 60, 66, 2); return (f(x - 2) - f(x + 2)) * 10 - 0.4; };
    wall(Pp, { top, bot: () => GROUND + 1, R: OCRE, lit: 6, band: 11, seed: 62, warp: 6, flute: 4, fade: 2.5, edge: relief });
    for (let x = 0; x < EDGE_W; x++) { const t = Math.round(top(x)); Pp.set(x, t - 1, pick(OCRE, 4, x, t)); }
    // l'entaille sombre de la roche autour des galeries, ses lèvres au soleil
    for (const h of E.houses) {
      if (h.kind !== 'tunnel') continue;
      const d = h.door, c0 = d.x + d.w / 2, rx = d.w / 2 + 20, y0 = d.y - 30;
      for (let y = y0; y <= GROUND; y++) for (let px = c0 - rx - 2; px <= c0 + rx + 2; px++) {
        const u = (px - c0) / rx, v = Math.max(0, (d.y + 6 - y) / 36), e = u * u + v * v + (vnoise(px / 3, y / 3, 67) - 0.5) * 0.3;
        if (e > 1.08) continue;
        if (e > 0.86) { Pp.set(px, y, pick(OCRE, px < c0 ? 8.4 - (e - 0.86) * 8 : 3.4, px, y)); continue; }
        Pp.shade(px, y, hex('#1a0e0c'), 0.5 - e * 0.2);
      }
      for (let i = 0; i < 7; i++) boulder(2 + (i % 3), i + d.x, ROC).blit(Pp, Math.round(d.x - 18 + hsh(i, 1, d.x) * 14 + (i > 3 ? d.w + 22 : 0)), GROUND + 1);
    }
    // les éboulis au pied de la falaise, entre les bâtiments
    const sp = spans(E, -10);
    for (const [cx, hw, hh, s] of [[300, 66, 22, 1], [712, 54, 18, 2], [1080, 64, 24, 3], [1500, 46, 16, 4], [384, 26, 10, 5]]) {
      for (let x = cx - hw; x <= cx + hw; x++) {
        const t = Math.abs(x - cx) / hw, tp = Math.round(GROUND - hh * (1 - t) ** 1.3 + (vnoise(x / 4, 1, s) - 0.5) * 5 * (1 - t));
        for (let y = tp; y <= GROUND; y++) Pp.set(x, y, pick(OCRE, (x < cx ? 6.4 : 4.4) - (y - tp) * 0.03 + (vnoise(x / 1.6, y / 5, s + 9) - 0.5) * 2.8 + (y === tp ? 1.2 : 0), x, y));
      }
      for (let i = 0; i < hw / 6; i++) boulder(1 + Math.round(hsh(i, 2, s) * 2), s * 50 + i, ROC).blit(Pp, Math.round(cx + (hsh(i, 1, s) - 0.5) * hw * 1.8), GROUND - Math.round(hsh(i, 3, s) * hh * 0.5));
    }
    // des galeries de prospection là-haut, et l'éventail de leurs déblais
    for (const [x, y, s] of [[352, 104, 1], [742, 96, 2], [1120, 90, 3]]) {
      for (let k = 0; k < 24; k++) {
        const hw = 3 + k * 0.75;
        for (let dx = -Math.ceil(hw); dx <= hw; dx++) {
          if (vnoise((x + dx) / 2, k / 2, s) < Math.abs(dx) / hw * 0.9 - 0.1) continue;
          Pp.set(x + dx + Math.round(k * 0.2), y + 8 + k, pick(DEBLAI, 3 - dx / hw * 0.9 - k * 0.05 + (vnoise(x + dx, k, s) - 0.5) * 1.6, x + dx, y + k));
        }
      }
      for (let yy = 0; yy < 10; yy++) for (let dx = -6; dx <= 6; dx++) {
        if (yy < 3 && Math.abs(dx) > 3 + yy) continue;
        Pp.set(x + dx, y + yy, Math.abs(dx) >= 5 ? hex(dx < 0 ? '#8a5a30' : '#5a3a1e') : yy === 0 ? OUTC : hex(yy < 4 ? '#0e0806' : '#1a100a'));
      }
    }
    // genévriers sur le rebord de la falaise
    for (const [x, s] of [[420, 2], [1010, 4], [1530, 6], [150, 1]]) juniper(2 + (s % 2), s).blit(Pp, x, Math.round(top(x)) + 4);
    sow(Pp, { y0: 140, y1: GROUND, n: 40, seed: 63, avoid: (x) => inSpans(sp, x), make: (d, s) => [bush(1 + Math.round(d * 2), s, P.sauge), boulder(2 + Math.round(d * 3), s, ROC), tuft(3 + Math.round(d * 3), s, P.herbe)][s % 3] });
    // le carreau : terre et gravier
    ground(Pp, { y0: GROUND, y1: H, R: P.terre, lf: 6.8, ln: 4.6, amp: 1.8, seed: 64 });
    for (let x = 0; x < EDGE_W; x++) for (let y = GROUND; y < GROUND + 3; y++) Pp.set(x, y, pick(P.talus, 3.4 - (y - GROUND) * 0.6 + vnoise(x / 3, y, 5), x, y));
    pebbles(Pp, { y0: GROUND + 2, n: EDGE_W * 1.6, R: P.terre, seed: 65, grass: 0.15 });
    Pp.put();
    // les embranchements qui sortent des galeries, en fuite vers nous
    for (const h of E.houses) {
      if (h.kind !== 'tunnel') continue;
      const c0 = h.door.x + h.door.w / 2;
      for (let y = GROUND, k = 0; y < 193; y += 3 + (k >> 2), k++) { const hw = Math.round(14 + ((y - GROUND) / 27) * 10); R(g, c0 - hw, y, hw * 2, 2, OUT); R(g, c0 - hw + 1, y, hw * 2 - 2, 1, '#5a3a22'); }
      for (let y = GROUND; y < 194; y++) { const t = (y - GROUND) / 28; R(g, Math.round(c0 - 11 - t * 8), y, 2, 1, '#a8acb4'); R(g, Math.round(c0 + 10 + t * 8), y, 2, 1, '#6a707a'); }
    }
    // la voie des wagonnets : ballast, traverses, deux rails
    for (let x = 0; x < EDGE_W; x++) if (hash(x * 5) < 0.5) R(g, x, 199 + (x % 3), 1, 1, hash(x) < 0.5 ? '#6a5a50' : '#9a8a7a');
    for (let x = 1; x < EDGE_W; x += 9) { R(g, x - 1, 193, 8, 7, OUT); R(g, x, 194, 6, 5, '#4a2e1c'); R(g, x, 194, 6, 1, '#6a4428'); }
    for (const ry of [194, 198]) { R(g, 0, ry - 1, EDGE_W, 3, OUT); R(g, 0, ry, EDGE_W, 1, '#c8ccd4'); R(g, 0, ry + 1, EDGE_W, 1, '#6a707a'); }
  },
};

// ------------------------------------------------------------ bâtiments
// mausolée (fronton à gradins, colonnes) ou crypte (fronton cintré, adossée à un tertre)
function mausoleum(g, h, arch) {
  const { x, w, top } = h;
  const col = '#b8b2a2', dk = shadowOf(col, 0.4), lt = sh(col, 0.2);
  const cx = x + w / 2;
  if (arch) {
    // le fronton cintré, en moellons
    const rows = [];
    for (let y = h.roof; y < top; y++) {
      const u = (top - y) / (top - h.roof + 0.5), hw = Math.round((w / 2 + 2) * Math.sqrt(1 - u * u));
      rows.push([y, Math.round(cx - hw), Math.round(cx + hw)]);
    }
    outlineRows(g, rows);
    clipRows(g, rows, () => stone(g, x - 4, h.roof, w + 8, top - h.roof, col, 5, 6));
    for (const [y, a, b] of rows) { R(g, a, y, 2, 1, lt); R(g, b - 2, y, 2, 1, dk); }
    for (let k = 0; k < rows.length; k++) { const [y, a, b] = rows[k]; if (k < rows.length - 1 && rows[k + 1][1] < a) R(g, rows[k + 1][1], y + 1, a - rows[k + 1][1], 1, lt); R(g, a, y, b - a, k === 0 ? 1 : 0, lt); }
    // la clé de voûte et la croix gravée
    O(g, cx - 4, h.roof + 2, [[0, 0, 8, 8, lt]]); R(g, cx - 1, h.roof + 3, 2, 6, dk); R(g, cx - 3, h.roof + 5, 6, 1, dk);
  }
  // les murs en pierre de taille
  R(g, x - 1, top - 1, w + 2, GROUND - top + 1, OUT);
  stone(g, x, top, w, GROUND - top, col, arch ? 7 : 3, 7);
  R(g, x, top, 2, GROUND - top, lt); veil(g, x + w - 6, top, 6, GROUND - top, 0.22);
  // coulures de pluie et mousse au pied
  const r = lcg(x);
  for (let i = 0; i < w / 6; i++) { const sx = x + Math.floor(r() * w), len = 6 + Math.floor(r() * 30); shadow(g, sx, top + 4, 1, len, 0.14); }
  for (let px = x; px < x + w; px++) { const mh = Math.round(2 + vnoise(px / 4, 0, 3) * 5); R(g, px, GROUND - mh, 1, mh, mix('#6a7048', col, vnoise(px, 1, 4) * 0.5)); }
  if (!arch) {
    // entablement, corniche, toit à gradins (dessus plat en h.roof : le bandit s'y penche), urnes aux angles
    const ent = top - 10;
    O(g, x - 2, ent, [[0, 0, w + 4, 10, col]]);
    R(g, x - 2, ent, w + 4, 1, lt); R(g, x - 2, ent + 6, w + 4, 1, dk);
    for (let px = x + 4; px < x + w - 2; px += 8) R(g, px, ent + 7, 3, 2, dk); // les denticules
    O(g, x - 6, ent - 4, [[0, 0, w + 12, 4, lt]]); R(g, x - 6, ent - 1, w + 12, 1, dk);
    let sy = ent - 4;
    for (let k = 0; sy > h.roof; k++) {
      const inset = 10 + k * 8, hh = Math.min(3, sy - h.roof);
      O(g, x + inset - 4, sy - hh, [[0, 0, w - inset * 2 + 8, hh, k % 2 ? col : sh(col, 0.08)]]);
      R(g, x + inset - 4, sy - hh, w - inset * 2 + 8, 1, lt);
      sy -= hh + 1;
    }
    for (const ux of [x - 2, x + w - 8]) {
      O(g, ux, ent - 4, [[1, -4, 8, 4, col], [2, -10, 6, 6, col], [3, -12, 4, 2, lt]]);
      R(g, ux + 2, ent - 10, 2, 6, lt); R(g, ux + 6, ent - 10, 2, 6, dk); R(g, ux + 4, ent - 14, 2, 2, col);
    }
    // les colonnes
    for (const px of [x + 8, x + 22, x + w - 30, x + w - 16]) {
      O(g, px - 1, ent + 10, [[0, 0, 10, 3, lt]]);
      O(g, px, ent + 13, [[0, 0, 8, GROUND - 8 - ent - 13, sh(col, 0.08)]]);
      for (let k = 0; k < 8; k++) R(g, px + k, ent + 13, 1, GROUND - 8 - ent - 13, k < 2 ? lt : k > 5 ? dk : k % 2 ? sh(col, 0.02) : sh(col, 0.12));
      O(g, px - 1, GROUND - 8, [[0, 0, 10, 3, lt]]);
    }
    // la plaque au-dessus de la porte
    O(g, cx - 18, top + 6, [[0, 0, 36, 9, sh(col, -0.08)]]);
    canvasText(g, 'R.I.P.', cx, top + 7, { size: 8, color: '#4a4640', shadow: lt });
  }
  // la porte : grille de fer ouverte, rabattue contre le mur
  const d = h.door;
  if (arch) {
    const rows = ogive(d.x + d.w / 2, d.y, d.w / 2 + 4, 14);
    outlineRows(g, rows); fillRows(g, rows, lt);
    fillRows(g, ogive(d.x + d.w / 2, d.y, d.w / 2, 11), '#1e1814');
  }
  doorway(g, d, { frame: lt, col: '#3a3438', cap: !arch });
  for (let k = 0; k < 9; k++) { const gx = d.x + d.w + 4 + k; if (k % 3 === 0) R(g, gx, d.y + 2 + k, 1, d.h - 4 - k * 2, '#2e2a2e'); }
  R(g, d.x + d.w + 4, d.y + 6, 9, 1, '#2e2a2e'); R(g, d.x + d.w + 4, d.y + d.h - 10, 9, 1, '#2e2a2e');
  // les marches
  O(g, x - 6, GROUND - 4, [[0, 0, w + 12, 4, sh(col, -0.06)]]); R(g, x - 6, GROUND - 4, w + 12, 1, lt);
  O(g, d.x - 10, GROUND, [[0, 0, d.w + 20, 3, sh(col, -0.1)]]); R(g, d.x - 10, GROUND, d.w + 20, 1, lt);
}

const HOUSES = {
  // l'arche de l'entrée : poteaux, planche du nom (texte par edgeSigns), crâne de bœuf ou ferronnerie et croix
  gate(g, h, E) {
    const { x, w } = h, sy = h.sign.y, ranch = E.kind === 'ranch', cx = x + w / 2;
    const posts = [x + 2, x + w - 10];
    if (ranch) {
      // rondins écorcés, traverse en rondin au-dessus, crâne de bœuf
      for (const px of posts) {
        O(g, px, GROUND, [[0, -GROUND + 64, 8, GROUND - 64, '#7a5a3a']]);
        for (let k = 0; k < 8; k++) R(g, px + k, 64, 1, GROUND - 64, k < 2 ? '#9a7650' : k > 5 ? '#4e3622' : k % 3 ? '#7a5a3a' : '#6a4c30');
        for (let y = 72; y < GROUND - 4; y += 9 + (y % 5)) R(g, px + 2 + (y % 3), y, 3, 1, '#4e3622');
        R(g, px - 2, GROUND - 3, 12, 3, OUT); R(g, px - 1, GROUND - 3, 10, 2, '#6a5a44');
      }
      logH(g, x - 10, 60, w + 20, 7, '#7e5e3e');
      for (const ex of [x - 11, x + w + 9]) { R(g, ex, 60, 3, 7, '#b08a5a'); R(g, ex + 1, 62, 1, 3, '#7a5a3a'); }
      for (const ch of [x + 8, x + w - 10]) for (let y = 68; y < sy - 3; y += 2) R(g, ch, y, 2, 1, '#3a3438');
      // le crâne
      const k = cx;
      O(g, k - 5, 50, [[0, 0, 11, 8, '#e8dcc0'], [2, 8, 7, 3, '#d8ccb0']]);
      R(g, k - 5, 50, 11, 1, '#f8f0dc'); R(g, k - 3, 53, 2, 2, OUT); R(g, k + 2, 53, 2, 2, OUT); R(g, k - 1, 58, 1, 1, '#8a8070'); R(g, k + 1, 58, 1, 1, '#8a8070');
      for (const s of [-1, 1]) {
        for (let i = 0; i < 9; i++) { const hx = k + s * (6 + i), hy = 52 - Math.round((i * i) / 14); R(g, hx - 1, hy - 1, 3, 4, OUT); }
        for (let i = 0; i < 9; i++) { const hx = k + s * (6 + i), hy = 52 - Math.round((i * i) / 14); R(g, hx, hy, 1, 2, i > 6 ? '#8a7a60' : '#e8dcc0'); }
      }
    } else {
      // poteaux équarris noircis, socles de pierre, ferronnerie en arc et croix
      for (const px of posts) {
        O(g, px, GROUND, [[0, -GROUND + 70, 8, GROUND - 70, '#5a4a3e']]);
        R(g, px, 70, 2, GROUND - 70, '#7a6a5a'); R(g, px + 6, 70, 2, GROUND - 70, '#3e322a');
        for (let y = 80; y < GROUND - 10; y += 13) R(g, px + 3, y, 2, 1, '#3e322a');
        O(g, px - 3, GROUND - 10, [[0, 0, 14, 10, '#9a9284']]); R(g, px - 3, GROUND - 10, 14, 1, '#bab2a2'); R(g, px + 8, GROUND - 9, 3, 9, '#7a7266');
        O(g, px + 3, 70, [[0, -12, 2, 12, '#3a3438'], [-3, -9, 8, 2, '#3a3438']]);
      }
      const IRON = '#2e2a2e';
      for (let px = posts[0] + 8; px < posts[1]; px++) {
        const u = (px - cx) / (posts[1] - posts[0]) * 2, y = Math.round(74 - 14 * (1 - u * u));
        R(g, px, y - 1, 1, 3, OUT); R(g, px, y, 1, 1, '#5a5458');
        const y2 = Math.round(78 - 8 * (1 - u * u)); R(g, px, y2, 1, 1, IRON);
        if (px % 7 === 0) R(g, px, y, 1, y2 - y, IRON);
      }
      for (const s of [-1, 1]) { const sx = cx + s * 22; S.disc(g, sx, 68, 3, IRON); S.disc(g, sx, 68, 2, '#8a7a5a'); S.disc(g, sx, 68, 1, IRON); }
      O(g, cx - 1, 60, [[0, -14, 3, 14, IRON], [-3, -11, 9, 3, IRON]]); R(g, cx - 1, 47, 1, 12, '#5a5458');
    }
    // la planche du nom, clouée sur les poteaux
    R(g, x - 3, sy - 4, w + 6, 16, OUT);
    R(g, x - 2, sy - 3, w + 4, 6, '#d8bc80'); R(g, x - 2, sy + 3, w + 4, 1, '#9a7a4a'); R(g, x - 2, sy + 4, w + 4, 7, '#ccb074');
    R(g, x - 2, sy - 3, w + 4, 1, '#f0d8a0'); R(g, x - 2, sy + 10, w + 4, 1, '#9a7a4a');
    for (let i = 0; i < 9; i++) R(g, x + 6 + ((i * 37) % (w - 12)), sy + (i % 2 ? 6 : -1), 6 + (i % 4), 1, i % 2 ? '#bca064' : '#e4cc94');
    for (const nx of [posts[0] + 3, posts[1] + 3]) { R(g, nx, sy - 1, 2, 2, '#4a3a30'); R(g, nx, sy + 6, 2, 2, '#4a3a30'); }
    shadow(g, x, sy + 12, w + 4, 3, 0.3);
  },
  // la chapelle : bardage blanchi écaillé, pignon, clocher à flèche, vitraux en ogive, porte ouverte
  chapel(g, h, E) {
    const { x, w, top } = h, cx = x + w / 2;
    const WALL = '#e2dacb', WOOD = '#9a8a72', ROOF = '#5a4a52', TRIM = '#f0ece0';
    const apex = 57, half = w / 2 + 6, eave = top + 2;
    const rake = (px) => Math.round(apex + (Math.abs(px - cx) / half) * (eave - apex));
    // le pignon et la façade
    const cols = [];
    for (let px = x; px < x + w; px++) cols.push([px, rake(px) + 4]);
    const rows = colRows(cols, GROUND);
    R(g, x - 1, top, w + 2, GROUND - top, OUT);
    clipRows(g, rows, () => siding(g, x, apex, w, GROUND - apex, WOOD, 11, { lap: 4, paint: WALL, peel: 0.3, stain: 1 }));
    // les rampants : bardeaux vus par la tranche, planche de rive blanche
    for (let px = cx - half; px <= cx + half; px++) {
      const y = rake(px);
      R(g, px, y - 2, 1, 1, OUT); R(g, px, y - 1, 1, 3, px < cx ? '#6a5a62' : ROOF); R(g, px, y + 2, 1, 1, sh(ROOF, -0.3));
      if (px >= x && px < x + w) { R(g, px, y + 3, 1, 2, TRIM); R(g, px, y + 5, 1, 1, shadowOf(WALL, 0.5)); }
      else R(g, px, y + 3, 1, 1, OUT);
    }
    // planches d'angle, soubassement de pierre
    for (const px of [x, x + w - 4]) { R(g, px, rake(px) + 5, 4, GROUND - rake(px) - 5, TRIM); R(g, px + 3, rake(px) + 5, 1, GROUND - rake(px) - 5, '#b8b0a0'); }
    R(g, x - 2, GROUND - 7, w + 4, 8, OUT); stone(g, x - 1, GROUND - 6, w + 2, 6, '#9a9284', 9, 3);
    veil(g, x + w - 18, top + 4, 14, GROUND - top - 10, 0.12);
    // les vitraux en ogive
    const GLASS = ['#3a5a9a', '#9a3a3a', '#c89a3a', '#4a7a5a', '#6a4a8a'];
    for (const wn of h.wins) {
      const wcx = wn.x + wn.w / 2;
      const outer = ogive(wcx, wn.y - 2, wn.w / 2 + 3, 12), inner = ogive(wcx, wn.y, wn.w / 2, 9);
      outlineRows(g, outer); fillRows(g, outer, TRIM);
      R(g, wn.x - 4, wn.y - 3, wn.w + 8, wn.h + 6, OUT); R(g, wn.x - 3, wn.y - 2, wn.w + 6, wn.h + 4, TRIM);
      R(g, wn.x - 3, wn.y - 2, 1, wn.h + 4, '#ffffff'); R(g, wn.x + wn.w + 2, wn.y - 2, 1, wn.h + 4, '#b8b0a0');
      fillRows(g, inner, '#2a1a10');
      const glass = (gx, gy) => {
        const k = (Math.floor((gx - wn.x + gy - wn.y) / 4) + Math.floor((gx - wn.x - gy + wn.y + 99) / 4)) % GLASS.length;
        return sh(GLASS[(k + GLASS.length) % GLASS.length], 0.1 - (gy - wn.y + 9) / (wn.h + 9) * 0.25 + ((gx - wn.x) < wn.w / 2 ? 0.06 : -0.04));
      };
      for (const [y, a, b] of [...inner, ...Array.from({ length: wn.h }, (_, k) => [wn.y + k, wn.x, wn.x + wn.w])]) {
        for (let gx = a; gx < b; gx++) {
          const lead = (gx - wn.x + y - wn.y + 400) % 4 === 0 || (gx - wn.x - y + wn.y + 400) % 4 === 0;
          R(g, gx, y, 1, 1, lead ? '#2a1e18' : glass(gx, y));
        }
      }
      R(g, Math.round(wcx), wn.y - 9, 1, wn.h + 9, '#2a1e18');
      R(g, wn.x - 5, wn.y + wn.h + 2, wn.w + 10, 3, OUT); R(g, wn.x - 4, wn.y + wn.h + 2, wn.w + 8, 1, '#ffffff');
      shadow(g, wn.x - 3, wn.y + wn.h + 5, wn.w + 6, 2, 0.25);
    }
    // la porte en ogive, vantaux ouverts sur la façade
    const d = h.door;
    const dOut = ogive(d.x + d.w / 2, d.y - 3, d.w / 2 + 4, 13);
    outlineRows(g, dOut); fillRows(g, dOut, TRIM);
    const dIn = ogive(d.x + d.w / 2, d.y, d.w / 2, 10);
    fillRows(g, dIn, '#3a5a9a');
    for (const [y, a, b] of dIn) for (let gx = a; gx < b; gx++) if ((gx + y) % 4 === 0) R(g, gx, y, 1, 1, '#c89a3a');
    R(g, d.x + d.w / 2, d.y - 10, 1, 10, '#2a1e18');
    doorway(g, d, { frame: TRIM, col: '#6a4a2a', cap: false });
    for (const [lx, s] of [[d.x - 12, 1], [d.x + d.w + 4, -1]]) {
      O(g, lx, d.y, [[0, 0, 8, d.h, '#6a4a2a']]);
      R(g, lx + (s > 0 ? 0 : 7), d.y, 1, d.h, '#8a6a42'); R(g, lx + 2, d.y + 6, 4, 14, '#5a3a20'); R(g, lx + 2, d.y + 26, 4, 14, '#5a3a20');
      R(g, lx, d.y + 4, 8, 1, '#2e2a2a'); R(g, lx, d.y + d.h - 6, 8, 1, '#2e2a2a');
    }
    O(g, d.x - 10, GROUND, [[0, 0, d.w + 20, 2, '#a8a090'], [4, 2, d.w + 12, 3, '#9a9284']]);
    R(g, d.x - 10, GROUND, d.w + 20, 1, '#c8c0b0');
    // le clocher : tour en planches, abat-son ouvert (le bandit s'y montre), cloche, flèche en bardeaux, croix
    const b = h.belfry, tx = cx - 15, tt = b.y - 8;
    R(g, tx - 1, tt - 1, 32, apex + 6 - tt, OUT);
    siding(g, tx, tt, 30, apex + 5 - tt, WOOD, 12, { lap: 4, paint: WALL, peel: 0.2 });
    R(g, tx, tt, 3, apex + 5 - tt, TRIM); R(g, tx + 27, tt, 3, apex + 5 - tt, '#b8b0a0');
    veil(g, tx + 18, tt, 12, apex + 5 - tt, 0.12);
    R(g, tx - 3, b.y + b.h + 2, 36, 3, OUT); R(g, tx - 2, b.y + b.h + 2, 34, 2, TRIM); // le larmier
    const bo = ogive(b.x + b.w / 2, b.y, b.w / 2 + 3, 7);
    outlineRows(g, bo); fillRows(g, bo, TRIM);
    fillRows(g, ogive(b.x + b.w / 2, b.y, b.w / 2, 5), '#1a120e');
    R(g, b.x - 3, b.y - 1, b.w + 6, b.h + 2, OUT); R(g, b.x - 2, b.y - 1, b.w + 4, b.h + 1, TRIM);
    R(g, b.x, b.y, b.w, b.h, '#1a120e'); R(g, b.x, b.y + b.h - 4, b.w, 4, '#2a1e16');
    // la cloche, pendue au mouton
    const bx = b.x + b.w / 2;
    R(g, b.x, b.y + 1, b.w, 2, '#4a3424');
    const bell = [[0, 3, 4], [1, 4, 4], [2, 5, 5], [3, 5, 5], [4, 5, 6], [5, 5, 6], [6, 5, 7], [7, 6, 8], [8, 6, 8]];
    for (const [k, l, rr] of bell) { R(g, bx - l - 1, b.y + 3 + k, l + rr + 2, 1, OUT); }
    for (const [k, l, rr] of bell) { R(g, bx - l, b.y + 3 + k, l + rr, 1, '#b8902e'); R(g, bx - l, b.y + 3 + k, 2, 1, '#e8c060'); R(g, bx + rr - 2, b.y + 3 + k, 2, 1, '#7a5a1e'); }
    R(g, bx - 7, b.y + 12, 16, 1, OUT); R(g, bx, b.y + 13, 2, 2, '#5a4a30');
    // la flèche
    const sp = [];
    for (let y = 12; y < tt; y++) { const hw = Math.round(((y - 12) / (tt - 12)) * 19); sp.push([y, cx - hw, cx + hw]); }
    outlineRows(g, sp);
    clipRows(g, sp, () => { shingles(g, cx - 20, 12, 41, tt - 12, '#6a5a64', 4); veil(g, cx, 12, 20, tt - 12, 0.3); });
    for (const [y, a] of sp) R(g, a, y, 1, 1, '#8a7a84');
    R(g, cx - 21, tt - 1, 42, 2, OUT); R(g, cx - 20, tt - 1, 40, 1, TRIM);
    O(g, cx - 1, 12, [[0, -12, 3, 12, '#c8a040'], [-3, -9, 9, 2, '#c8a040']]); R(g, cx - 1, 0, 1, 12, '#f0d070');
  },
  tomb(g, h) { mausoleum(g, h, false); },
  // la crypte adossée à un tertre herbu
  crypt(g, h) {
    const Pp = new Pix(g), cx = h.x + h.w / 2;
    const mound = (x) => Math.round(GROUND - 60 * Math.max(0, 1 - ((x - cx) / 84) ** 2) ** 0.9 + (vnoise(x / 4, 1, 12) - 0.5) * 3);
    for (let px = cx - 84; px <= cx + 84; px++) {
      const tp = mound(px);
      for (let y = tp; y <= GROUND; y++) { const gr = y - tp < 3 + vnoise(px / 3, 2, 15) * 5; Pp.set(px, y, pick(gr ? P.herbe : P.terre, (px < cx ? 5.6 : 4.2) - (y - tp) / 26 + (vnoise(px / 2, y / 3, 13) - 0.5) * 2.4 + (y === tp ? 1 : 0) - (gr ? 1.2 : 0), px, y)); }
    }
    sow(Pp, { x0: cx - 80, x1: cx + 80, y0: 110, y1: GROUND, n: 40, seed: 14, avoid: (x, y) => y < mound(x) + 3, make: (d, s) => [tuft(3 + Math.round(d * 4), s, P.herbe), bush(1 + Math.round(d * 2), s, P.sauge), tuft(4, s, P.olive)][s % 3] });
    Pp.put();
    mausoleum(g, h, true);
  },
  // l'arbre aux pendus, mort et tordu (corbeaux sur ses branches : shooterdeco, perchoirs en x+30/80, x-24/76, x+6/57)
  tree(g, h) {
    const x = h.x;
    const Pp = new Pix(g);
    const s = new Spr(150, 130, 75, 126);
    const M = P.mort;
    const col = (k, th) => M[Math.max(0, Math.min(M.length - 1, th > 1 ? (k === 0 ? 4 : k === th - 1 ? 1 : 3) : 3))];
    // le tronc, épaissi en racines au pied
    for (let yy = 70; yy <= GROUND; yy++) {
      const y = yy - 40, fl = yy > 154 ? (yy - 154) * 0.7 : 0;
      const ww = Math.round(3 + (yy - 70) / 16 + fl), xc = 75 + Math.round(Math.sin(yy / 14) * 2 + (yy < 100 ? (100 - yy) * 0.04 : 0));
      for (let k = 0; k < ww; k++) {
        const u = k / Math.max(1, ww - 1);
        let l = 4.6 - u * 3.4 + (hsh(k + xc, yy >> 2, 3) < 0.15 ? -1 : 0);
        if ((k + (yy >> 3)) % 4 === 0) l -= 0.8; // l'écorce fendue
        s.set(xc - (ww >> 1) + k, y, pick(M, l, k, y));
      }
    }
    const br = (pts, th) => { for (let i = 0; i + 1 < pts.length; i++) s.line(pts[i][0] + 75, pts[i][1] - 40, pts[i + 1][0] + 75, pts[i + 1][1] - 40, col, Math.max(1, th - i)); };
    const r = lcg(x);
    const twig = (px, py, a, len, th, dd) => {
      const x1 = px + Math.cos(a) * len, y1 = py + Math.sin(a) * len;
      s.line(px + 75, py - 40, x1 + 75, y1 - 40, col, th);
      if (dd > 0) { twig(x1, y1, a - 0.35 - r() * 0.5, len * 0.62, Math.max(1, th - 1), dd - 1); if (r() < 0.8) twig(x1, y1, a + 0.3 + r() * 0.5, len * 0.55, Math.max(1, th - 1), dd - 1); }
    };
    br([[1, 106], [18, 92], [34, 83], [48, 80]], 4); // la branche du pendu (corbeau en x+30)
    br([[-1, 98], [-14, 88], [-28, 80], [-42, 74]], 4); // à gauche (corbeau en x-24)
    br([[1, 74], [6, 62], [9, 50]], 3); // la cime (corbeau en x+6)
    twig(48, 80, -0.4, 10, 2, 2); twig(-42, 74, -2.6, 10, 2, 2); twig(9, 50, -1.4, 9, 2, 2);
    twig(34, 83, -0.9, 9, 1, 1); twig(-28, 80, -2.0, 9, 1, 1); twig(18, 92, 0.4, 8, 1, 1); twig(-14, 88, -1.2, 8, 1, 1);
    twig(3, 84, -1.0, 12, 2, 1); twig(-2, 80, -2.2, 10, 2, 1);
    s.outline(OUTC);
    Pp.shadow(x + 10, GROUND, 18, 3);
    s.blit(Pp, x, GROUND);
    Pp.put();
    // la corde et son nœud coulant
    const rx = x + 25;
    R(g, rx, 87, 1, 20, '#c8a868'); R(g, rx + 1, 87, 1, 20, '#7a6038');
    for (const [dx, dy] of [[-2, 0], [-3, 1], [-3, 2], [-3, 3], [-3, 4], [-3, 5], [-2, 6], [-1, 7], [0, 7], [1, 7], [2, 6], [3, 5], [3, 4], [3, 3], [3, 2], [3, 1], [2, 0]]) R(g, rx + dx, 107 + dy, 1, 1, dx < 0 ? '#c8a868' : '#8a7040');
    R(g, rx - 1, 104, 3, 3, '#a88a50');
  },
  // tombe fraîchement creusée : trou, déblais, pelle plantée, pioche, croix qui attend son nom
  grave(g, h) {
    const x = h.x;
    const Pp = new Pix(g);
    for (let k = 0; k < 6; k++) for (let px = x + k; px < x + 34 - k; px++) Pp.set(px, GROUND - 4 + k, k === 0 ? OUTC : hex(k < 3 ? '#1a100a' : '#2a1a10'));
    for (let px = x + 1; px < x + 33; px++) Pp.set(px, GROUND - 3, pick(FUMIER, 3, px, 0));
    const cx = x + 50, rr = 15;
    for (let dx = -rr; dx <= rr; dx++) {
      const t = Math.abs(dx) / rr, tp = Math.round(GROUND + 1 - 13 * (1 - t * t) ** 0.8 + (vnoise(dx / 2, 1, 5) - 0.5) * 2);
      Pp.set(x + 50 + dx, tp - 1, OUTC);
      for (let y = tp; y <= GROUND + 1; y++) Pp.set(cx + dx, y, pick(FUMIER, 3.6 - dx / rr * 1.4 + (vnoise((cx + dx) / 1.5, y / 2, 6) - 0.5) * 2.2 + (y === tp ? 1 : 0), cx + dx, y));
    }
    for (let i = 0; i < 12; i++) boulder(1, i + 3, P.terre, P.terre[0]).blit(Pp, cx - 14 + Math.round(hsh(i, 1, 7) * 30), GROUND + 1 - Math.round(hsh(i, 2, 7) * 4));
    Pp.put();
    // la pelle plantée dans les déblais, la pioche couchée
    beam(g, cx + 5, GROUND - 34, cx + 4, GROUND - 6, 2, '#8a6a44');
    O(g, cx + 1, GROUND - 37, [[0, 0, 8, 2, '#8a6a44']]);
    O(g, cx + 1, GROUND - 9, [[0, 0, 7, 7, '#8a8f98']]); R(g, cx + 1, GROUND - 9, 2, 7, '#b8bec6');
    beam(g, x + 6, GROUND - 7, x + 30, GROUND - 13, 2, '#7a5a3a');
    O(g, x + 26, GROUND - 19, [[0, 0, 3, 12, '#6a6e76']]);
  },
  // la maison du fossoyeur : deux étages à fausse façade, corniche sur consoles, enseigne, cercueils debout
  lodge(g, h, E) {
    const { x, w, top } = h;
    const col = E.col, trim = '#d8ccb0';
    O(g, x + w - 34, top - 16, [[0, 0, 10, 16, '#7a4a38']]); R(g, x + w - 35, top - 18, 12, 3, OUT); R(g, x + w - 34, top - 17, 10, 1, '#5a5458');
    for (let y = top - 14; y < top; y += 3) R(g, x + w - 34 + ((y / 3) % 2 ? 0 : 3), y, 4, 1, '#5a3426');
    R(g, x - 1, top - 1, w + 2, GROUND - top + 1, OUT);
    siding(g, x, top, w, GROUND - top, sh(col, 0.08), 21, { lap: 5, paint: mix(col, '#c8c0b0', 0.25), peel: 0.35, stain: 1.2 });
    for (const px of [x, x + w - 4]) { R(g, px, top, 4, GROUND - top, trim); R(g, px + 3, top, 1, GROUND - top, sh(trim, -0.3)); }
    veil(g, x + w - 24, top, 20, GROUND - top, 0.12);
    cornice(g, x, top, w, sh(col, -0.15), { brackets: 14 });
    // le bandeau entre les étages
    R(g, x - 2, 94, w + 4, 16, OUT); R(g, x - 1, 95, w + 2, 14, sh(col, -0.3)); R(g, x - 1, 95, w + 2, 1, sh(col, -0.05));
    shadow(g, x, 110, w, 2, 0.3);
    for (const wn of h.wins) pane(g, wn, { frame: trim, curtain: wn.y < 100 ? '#5a2a2a' : '#3a3a48', shutters: wn.y < 100 ? sh(col, -0.35) : null });
    doorway(g, h.door, { frame: trim, col: sh(col, -0.3) });
    // cercueils debout contre le mur, couvercle et croix
    for (const [cx, c] of [[x + w - 16, '#5a3a22'], [x + w - 4, '#4a2c18']]) {
      const ct = 122;
      const rows = [];
      for (let y = ct; y < GROUND; y++) { const k = y - ct, hw = k < 10 ? 4 + Math.round(k * 0.3) : 7 - Math.round((k - 10) * 0.07); rows.push([y, cx - hw, cx + hw]); }
      outlineRows(g, rows); fillRows(g, rows, c);
      for (const [y, a, b] of rows) { R(g, a, y, 1, 1, sh(c, 0.3)); R(g, b - 1, y, 1, 1, sh(c, -0.4)); }
      R(g, cx - 1, ct + 8, 2, 12, '#c8b07c'); R(g, cx - 3, ct + 11, 6, 2, '#c8b07c');
    }
    shadow(g, x + w - 22, GROUND - 2, 26, 2, 0.35);
  },
  // la ferme : bardage à clin crème écaillé, avant-toit sur consoles et toit en croupe (faîtage en h.roof),
  // volets, cheminée de brique ; le porche est au premier plan (drawFront)
  farm(g, h, E) {
    const { x, w, top } = h;
    const PAINT = '#dccca4', trim = '#f0e8d4', sh1 = E.col;
    // la cheminée de brique
    R(g, x + 29, top - 19, 14, 20, OUT);
    for (let y = top - 18; y < top; y++) for (let px = x + 30; px < x + 42; px++) R(g, px, y, 1, 1, (y % 3 === 2) ? '#7a5848' : ((px + (Math.floor(y / 3) % 2) * 3) % 6 === 0 ? '#7a5848' : px < x + 33 ? '#a85a40' : '#8a4632'));
    R(g, x + 28, top - 20, 16, 3, OUT); R(g, x + 29, top - 19, 14, 1, '#8a8478');
    // le toit en croupe, très plat : on n'en voit qu'une bande de bardeaux
    const rows = [];
    for (let y = top; y < top + 5; y++) { const k = y - top; rows.push([y, x - 6 + Math.round((4 - k) * 3), x + w + 6 - Math.round((4 - k) * 3)]); }
    outlineRows(g, rows);
    clipRows(g, rows, () => shingles(g, x - 8, top, w + 16, 5, '#6a4a3a', 2));
    // l'avant-toit et ses consoles
    R(g, x - 8, top + 5, w + 16, 4, OUT); R(g, x - 7, top + 5, w + 14, 2, trim); R(g, x - 7, top + 7, w + 14, 1, sh(trim, -0.3));
    R(g, x - 1, top + 9, w + 2, GROUND - top - 9, OUT);
    siding(g, x, top + 9, w, GROUND - top - 9, '#a8946c', 31, { lap: 5, paint: PAINT, peel: 0.3, stain: 0.8 });
    shadow(g, x, top + 9, w, 4, 0.35);
    for (let px = x + 4; px < x + w - 4; px += 14) {
      if (h.wins.some((wn) => px > wn.x - 16 && px < wn.x + wn.w + 13)) continue;
      R(g, px - 1, top + 9, 5, 6, OUT); R(g, px, top + 9, 3, 5, trim); R(g, px, top + 13, 3, 1, sh(trim, -0.3));
    }
    for (const px of [x, x + w - 4]) { R(g, px, top + 9, 4, GROUND - top - 9, trim); R(g, px + 3, top + 9, 1, GROUND - top - 9, '#b8ae96'); }
    veil(g, x + w - 30, top + 9, 26, GROUND - top - 9, 0.1);
    for (const wn of h.wins) pane(g, wn, { frame: trim, shutters: sh1, curtain: '#e8dcc4', cap: wn.y > 100 });
    doorway(g, h.door, { frame: trim, col: sh(sh1, -0.2) });
    // le plancher du porche, un banc et un seau
    R(g, x - 7, GROUND - 7, w + 14, 7, OUT);
    for (let px = x - 6; px < x + w + 6; px += 4) { R(g, px, GROUND - 6, 4, 5, (px / 4) % 3 ? '#8a6a48' : '#7a5c3c'); R(g, px, GROUND - 6, 1, 5, '#5a4028'); }
    R(g, x - 6, GROUND - 6, w + 12, 1, '#a8885a');
    const bx = h.door.x + h.door.w + 10;
    O(g, bx, GROUND - 7, [[0, -10, 26, 3, '#8a6038'], [1, -7, 2, 7, '#6a4428'], [22, -7, 2, 7, '#6a4428'], [0, -20, 2, 10, '#6a4428'], [0, -20, 26, 2, '#8a6038']]);
    O(g, x + 196, GROUND - 7, [[0, -9, 8, 9, '#8a8f98']]); R(g, x + 196, GROUND - 16, 1, 9, '#c8ccd0');
  },
  // l'éolienne de pompage : tour en treillis (plate-forme en h.top), pompe, citerne de bois sur tréteau
  windmill(g, h) {
    const cx = h.x + h.w / 2, top = h.top, col = '#6a5440';
    const leg = (y) => Math.round(7 + ((y - top) / (GROUND - top)) * (h.w / 2 - 6));
    for (const s of [-1, 1]) {
      for (let y = top + 3; y < GROUND; y++) { const hw = leg(y); R(g, cx + s * hw - 2, y, 4, 1, OUT); }
      for (let y = top + 3; y < GROUND; y++) { const hw = leg(y); R(g, cx + s * hw - 1, y, 2, 1, s < 0 ? '#8a7054' : col); }
    }
    for (let k = 0; k < 5; k++) {
      const y0 = top + 8 + k * 19, y1 = Math.min(GROUND - 2, y0 + 19);
      line(g, cx - leg(y0), y0, cx + leg(y1), y1, 1, '#4a3a2c'); line(g, cx + leg(y0), y0, cx - leg(y1), y1, 1, '#4a3a2c');
      R(g, cx - leg(y1), y1, leg(y1) * 2, 2, OUT); R(g, cx - leg(y1), y1, leg(y1) * 2, 1, '#8a7054');
    }
    for (let y = top + 6; y < GROUND; y += 4) R(g, cx - 4, y, 3, 1, '#9a8064'); // l'échelle
    R(g, cx, top + 2, 1, GROUND - top - 2, '#3a3436'); // la tige de pompe
    // la plate-forme (le bandit y monte)
    O(g, cx - 16, top, [[0, 0, 32, 3, '#8a6a44']]); R(g, cx - 16, top, 32, 1, '#a88a5a');
    for (let px = cx - 15; px < cx + 16; px += 4) R(g, px, top + 1, 1, 2, '#5a4028');
    // la pompe et l'auge au pied
    O(g, cx - 3, GROUND, [[0, -14, 6, 14, '#4a4e56'], [6, -11, 8, 2, '#4a4e56']]); R(g, cx - 3, GROUND - 14, 1, 14, '#7a7e86');
    O(g, cx + 12, GROUND + 2, [[0, -7, 26, 7, '#6a4c32']]); R(g, cx + 13, GROUND - 5, 24, 2, '#5a8aa0'); R(g, cx + 14, GROUND - 5, 6, 1, '#9ac0d0');
    // la citerne
    const tx = h.x + h.w + 16;
    for (const lx of [tx + 3, tx + 33]) { O(g, lx, GROUND, [[0, -GROUND + 128, 4, GROUND - 128, '#5a4028']]); R(g, lx, 128, 1, GROUND - 128, '#7a5a3a'); }
    line(g, tx + 5, 132, tx + 35, GROUND - 4, 1, '#4a3424'); line(g, tx + 35, 132, tx + 5, GROUND - 4, 1, '#4a3424');
    O(g, tx - 3, 128, [[0, 0, 46, 3, '#5a4028']]);
    R(g, tx - 1, 99, 42, 30, OUT);
    for (let k = 0; k < 40; k += 4) { const c = sh('#8a6440', ((k / 4) % 3 - 1) * 0.06 + (k < 8 ? 0.14 : k > 30 ? -0.22 : 0)); R(g, tx + k, 100, 4, 28, c); R(g, tx + k, 100, 1, 28, sh(c, -0.25)); }
    for (const yy of [104, 114, 124]) { R(g, tx - 1, yy, 42, 2, '#2e2e34'); R(g, tx, yy, 40, 1, '#6a6a72'); }
    for (let k = 0; k < 7; k++) R(g, tx - 3 + k * 2, 99 - k, 46 - k * 4, 1, k ? (k % 2 ? '#5a4a40' : '#4a3a34') : OUT);
    R(g, tx + 17, 92, 6, 1, OUT);
    line(g, cx + 6, top + 6, tx, 104, 1, '#3a3436'); // le tuyau de la pompe vers la citerne
    for (let k = 0; k < 6; k++) R(g, tx + 6 + k, 128 + k * 3, 1, 1, '#7ab0e0'); // une fuite
  },
  // la grange : pignon à la Dutch (mansarde) en bardeaux, planches et couvre-joints rouges, garnitures blanches
  barn(g, h, E) {
    const { x, w, top } = h;
    const col = E.col, roof = '#4a3a34', trim = '#ece4d0';
    const cx = x + w / 2, half = w / 2 + 6, knee = 42;
    const roofY = (px) => {
      const d = Math.abs(px - cx);
      if (d > half - 34) return Math.round(top - ((half - d) * (top - knee)) / 34);
      return Math.round(knee - ((half - 34 - d) * (knee - h.roof)) / (half - 34));
    };
    const cols = [];
    for (let px = x; px < x + w; px++) cols.push([px, roofY(px) + 4]);
    const rows = colRows(cols, GROUND);
    R(g, x - 1, top, w + 2, GROUND - top, OUT);
    clipRows(g, rows, () => {
      battens(g, x, h.roof, w, GROUND - h.roof, col, 41, 8);
      const r = lcg(41);
      for (let i = 0; i < w * 1.6; i++) R(g, x + Math.floor(r() * w), h.roof + Math.floor(r() * (GROUND - h.roof)), 2 + Math.floor(r() * 4), 1, r() < 0.5 ? sh(col, 0.18) : mix(col, '#8a7a6a', 0.5)); // la peinture passée
      veil(g, cx + 40, h.roof, half, GROUND - h.roof, 0.14);
    });
    for (let px = cx - half; px <= cx + half; px++) {
      const y = roofY(px);
      R(g, px, y - 2, 1, 1, OUT); R(g, px, y - 1, 1, 3, px < cx ? '#5a4a44' : roof); R(g, px, y + 2, 1, 1, sh(roof, -0.35));
      if (px >= x && px < x + w) { R(g, px, y + 3, 1, 2, trim); R(g, px, y + 5, 1, 1, sh(col, -0.4)); } else R(g, px, y + 3, 1, 1, OUT);
    }
    for (const px of [x, x + w - 4]) { R(g, px, roofY(px) + 5, 4, GROUND - roofY(px) - 5, trim); R(g, px + 3, roofY(px) + 5, 1, GROUND - roofY(px) - 5, '#b8b0a0'); }
    R(g, x, 96, w, 3, trim); R(g, x, 99, w, 1, sh(col, -0.4)); // la lisse blanche
    R(g, x - 2, GROUND - 8, w + 4, 9, OUT); stone(g, x - 1, GROUND - 7, w + 2, 7, '#9a8a78', 42, 4);
    // la porte du fenil : vantaux ouverts, poulie et corde
    const loft = h.wins[0];
    for (const lx of [loft.x - 9, loft.x + loft.w + 3]) { O(g, lx, loft.y - 1, [[0, 0, 6, loft.h + 2, col]]); R(g, lx, loft.y - 1, 6, 1, trim); R(g, lx, loft.y + loft.h, 6, 1, trim); line(g, lx, loft.y, lx + 5, loft.y + loft.h, 1, trim); }
    R(g, cx, 23, 1, 8, '#3a3436');
    O(g, cx - 1, loft.y - 12, [[0, 0, 3, 6, '#3a2214']]); O(g, cx - 6, loft.y - 13, [[0, 0, 13, 2, '#5a3a22']]);
    R(g, cx + 4, loft.y - 11, 1, 8, '#c8a868');
    for (const wn of h.wins) pane(g, wn, { frame: trim, cap: false });
    // la grande porte : rail, portes coulissantes en X, foin dedans
    const d = h.door;
    O(g, d.x - 28, d.y - 8, [[0, 0, d.w + 56, 3, '#3a3a42']]);
    doorway(g, d, { frame: trim, col, cap: false });
    R(g, d.x + 6, d.y + d.h - 14, 24, 14, OUT); R(g, d.x + 7, d.y + d.h - 13, 22, 13, '#d8b048'); R(g, d.x + 7, d.y + d.h - 13, 22, 2, '#f0d070');
    R(g, d.x + 29, d.y + d.h - 9, 18, 9, OUT); R(g, d.x + 30, d.y + d.h - 8, 16, 8, '#c8a040');
    for (let k = 0; k < 10; k++) R(g, d.x + 8 + ((k * 7) % 36), d.y + d.h - 12 + (k % 4) * 2, 2, 1, '#a8862e');
    for (const lx of [d.x - 25, d.x + d.w + 5]) {
      R(g, lx - 1, d.y - 5, 22, d.h + 5, OUT); battens(g, lx, d.y - 4, 20, d.h + 4, sh(col, -0.06), lx, 5);
      R(g, lx, d.y - 4, 20, 2, trim); R(g, lx, d.y + d.h - 2, 20, 2, trim); R(g, lx, d.y - 4, 2, d.h + 4, trim); R(g, lx + 18, d.y - 4, 2, d.h + 4, trim);
      line(g, lx + 2, d.y - 2, lx + 17, d.y + d.h - 3, 2, trim); line(g, lx + 17, d.y - 2, lx + 2, d.y + d.h - 3, 2, trim);
      R(g, lx + 2, d.y - 7, 3, 3, '#5a5a62'); R(g, lx + 15, d.y - 7, 3, 3, '#5a5a62');
    }
    // un fer à cheval au-dessus de la porte
    R(g, cx - 3, d.y - 16, 1, 5, '#6a6e76'); R(g, cx + 3, d.y - 16, 1, 5, '#6a6e76'); R(g, cx - 2, d.y - 12, 5, 1, '#6a6e76');
  },
  // le silo : douves de béton cerclées, coupole de tôle, échelle
  silo(g, h) {
    const { x, w, top } = h;
    const SIL = ramp('5a564e 6e6a60 828074 96938a aaa79c bcbab0 d0cec4');
    R(g, x - 1, top - 1, w + 2, GROUND - top + 1, OUT);
    for (let px = x; px < x + w; px++) {
      const u = (px - x + 0.5) / w, l = 5.6 - Math.abs(u - 0.28) * 7 - (u > 0.7 ? 1 : 0);
      for (let y = top; y < GROUND; y++) {
        let ll = l + (vnoise(px / 3, y / 9, 71) - 0.5) * 0.7;
        if ((y - top) % 7 === 0) ll -= 1; // les douves
        R(g, px, y, 1, 1, css(pick(SIL, ll, px, y)));
      }
    }
    for (let y = top + 10; y < GROUND; y += 14) { R(g, x - 1, y, w + 2, 2, '#2e2e34'); R(g, x, y, w, 1, '#7a7a82'); R(g, x + 6, y, 1, 1, '#c8c8d0'); }
    for (let y = top + 2; y < GROUND; y += 3) R(g, x + w - 9, y, 5, 1, '#3a3a40'); // l'échelle
    R(g, x + w - 10, top + 2, 1, GROUND - top - 2, '#3a3a40'); R(g, x + w - 4, top + 2, 1, GROUND - top - 2, '#3a3a40');
    for (let dy = 0; dy < 13; dy++) {
      const hw = Math.round((w / 2 + 1) * Math.sqrt(1 - (dy / 13) ** 2));
      R(g, x + w / 2 - hw - 1, top - dy - 1, hw * 2 + 2, 1, OUT);
      for (let px = -hw; px < hw; px++) R(g, x + w / 2 + px, top - dy, 1, 1, px < -hw / 3 ? '#a8acb4' : px < hw / 3 ? '#8a8e96' : '#6a6e76');
      if (dy % 3 === 0) R(g, x + w / 2 - hw, top - dy, hw * 2, 1, '#5a5e66');
    }
    O(g, x + w / 2 - 2, top - 16, [[0, 0, 4, 3, '#8a8e96']]);
    shadow(g, x + w, GROUND - 2, 14, 2, 0.3);
  },
  // la remise : planches verticales grisées, toit à un pan (faîtage en h.roof), outils, roue de charrette
  shed(g, h, E) {
    const { x, w, top } = h;
    const col = '#8a7458', trim = '#c8b894', eave = top + 8;
    const rows = [];
    for (let y = top; y < eave; y++) rows.push([y, x - 6, x + w + 6]);
    outlineRows(g, rows);
    shingles(g, x - 6, top, w + 12, eave - top, '#5a4a40', 51);
    R(g, x - 6, top, w + 12, 1, '#7a6a5c');
    R(g, x - 7, eave, w + 14, 3, OUT); R(g, x - 6, eave, w + 12, 2, '#6a5444');
    R(g, x - 1, eave + 3, w + 2, GROUND - eave - 3, OUT);
    battens(g, x, eave + 3, w, GROUND - eave - 3, col, 52, 7);
    shadow(g, x, eave + 3, w, 5, 0.35);
    veil(g, x + w - 20, eave + 3, 20, GROUND - eave - 3, 0.15);
    for (const wn of h.wins) pane(g, wn, { frame: trim, cap: false });
    doorway(g, h.door, { frame: trim, col });
    // fourche, fers à cheval, roue de charrette contre le mur
    beam(g, x + w - 12, 122, x + w - 10, GROUND - 2, 2, '#7a5a3a');
    for (const dx of [-3, 0, 3]) R(g, x + w - 13 + dx, 113, 1, 8, '#8a8f98');
    R(g, x + w - 16, 120, 9, 1, '#8a8f98');
    const wx = x + 68;
    S.disc(g, wx, 152, 13, OUT); S.disc(g, wx, 152, 12, '#5a3a20'); S.disc(g, wx, 152, 10, '#8a5a34'); S.disc(g, wx, 152, 9, sh(col, -0.15));
    for (let a = 0; a < 10; a++) line(g, wx, 152, wx + Math.cos((a * Math.PI) / 5) * 9, 152 + Math.sin((a * Math.PI) / 5) * 9, 1, '#9a6a3c');
    S.disc(g, wx, 152, 2, OUT); R(g, wx - 9, 146, 3, 1, '#b08050');
  },
  // le bureau des essais : fausse façade en planches, corniche courte (enseigne dessous), balance en vitrine
  office(g, h, E) {
    const { x, w, top } = h;
    const col = '#9a8462', trim = '#d8ccb0';
    O(g, x + w - 28, top - 12, [[0, 0, 4, 12, '#3a3a42']]); R(g, x + w - 30, top - 13, 8, 2, OUT);
    R(g, x - 1, top - 1, w + 2, GROUND - top + 1, OUT);
    battens(g, x, top, w, GROUND - top, col, 61, 8);
    const r = lcg(61);
    for (let i = 0; i < w; i++) R(g, x + Math.floor(r() * w), top + Math.floor(r() * (GROUND - top)), 1, 3 + Math.floor(r() * 8), sh(col, -0.2));
    for (const px of [x, x + w - 4]) { R(g, px, top, 4, GROUND - top, sh(col, 0.15)); R(g, px + 3, top, 1, GROUND - top, sh(col, -0.35)); }
    veil(g, x + w - 26, top, 22, GROUND - top, 0.12);
    R(g, x - 4, top - 2, w + 8, 5, OUT); R(g, x - 3, top - 1, w + 6, 3, sh(col, -0.2)); R(g, x - 3, top - 1, w + 6, 1, sh(col, 0.15));
    shadow(g, x, top + 3, w, 2, 0.35);
    R(g, x - 2, 102, w + 4, 3, OUT); R(g, x - 1, 102, w + 2, 2, sh(col, -0.25)); // la lisse
    for (const wn of h.wins) pane(g, wn, { frame: trim, curtain: wn.x < x + 60 ? '#7a2a24' : null });
    const w0 = h.wins[0];
    R(g, w0.x + 6, w0.y + w0.h - 5, 10, 2, '#c8a040'); R(g, w0.x + 10, w0.y + w0.h - 12, 2, 7, '#c8a040'); R(g, w0.x + 5, w0.y + w0.h - 12, 12, 1, '#c8a040');
    doorway(g, h.door, { frame: trim, col: sh(col, -0.3) });
    // un établi de minerai, le long du mur
    const bx = h.wins[1].x - 26;
    O(g, bx, GROUND, [[0, -14, 22, 3, '#7a5a3a'], [1, -11, 2, 11, '#5a3a22'], [18, -11, 2, 11, '#5a3a22']]);
    for (let k = 0; k < 4; k++) { S.disc(g, bx + 4 + k * 5, GROUND - 16, 2, OUT); S.disc(g, bx + 4 + k * 5, GROUND - 16, 1, k % 2 ? '#8a7a6a' : '#c89428'); }
  },
  // l'entrée d'une galerie : boisage (montants, chapeau, garnissage), noir où s'enfoncent les cadres et les rails
  tunnel(g, h) {
    const d = h.door;
    R(g, d.x - 3, d.y - 3, d.w + 6, GROUND - d.y + 3, '#1a100a');
    for (let y = d.y; y < GROUND; y++) {
      const k = (y - d.y) / (GROUND - d.y);
      R(g, d.x, y, d.w, 1, mix('#0a0604', '#2a1a10', Math.max(0, k - 0.4) * 1.2));
    }
    for (const [ins, c] of [[6, '#3a2616'], [11, '#24170e'], [15, '#170e08']]) {
      const x0 = d.x + ins, x1 = d.x + d.w - ins, y0 = d.y + Math.round(ins * 1.1), y1 = GROUND - Math.round(ins * 0.5);
      R(g, x0, y0, x1 - x0, 2, c); R(g, x0, y0, 2, y1 - y0, c); R(g, x1 - 2, y0, 2, y1 - y0, c);
    }
    for (let y = GROUND - 12; y < GROUND; y++) { const t = (GROUND - y) / 12; R(g, Math.round(d.x + 10 + t * 8), y, 1, 1, '#4a4e56'); R(g, Math.round(d.x + d.w - 11 - t * 8), y, 1, 1, '#4a4e56'); }
    for (let k = 0; k < 4; k++) { const y = GROUND - 1 - k * 3, hw = d.w / 2 - 6 - k * 3; R(g, d.x + d.w / 2 - hw, y, hw * 2, 1, '#3a2a1e'); }
    // le boisage
    const P0 = '#8a5a30', P1 = '#7a4a26';
    O(g, d.x - 8, GROUND, [[0, d.y - 6 - GROUND, 7, GROUND - d.y + 6, P0]]);
    O(g, d.x + d.w + 1, GROUND, [[0, d.y - 6 - GROUND, 7, GROUND - d.y + 6, P0]]);
    for (const px of [d.x - 8, d.x + d.w + 1]) { R(g, px, d.y - 6, 2, GROUND - d.y + 6, '#a87244'); R(g, px + 5, d.y - 6, 2, GROUND - d.y + 6, '#5a3a1e'); for (let y = d.y + 4; y < GROUND; y += 11) R(g, px + 3, y, 2, 1, '#5a3a1e'); }
    O(g, d.x - 12, d.y - 13, [[0, 0, d.w + 24, 8, P1]]);
    R(g, d.x - 12, d.y - 13, d.w + 24, 1, '#a87244'); R(g, d.x - 12, d.y - 6, d.w + 24, 1, '#4a2c16');
    for (const ex of [d.x - 12, d.x + d.w + 9]) { R(g, ex, d.y - 12, 3, 6, '#b08458'); R(g, ex + 1, d.y - 10, 1, 2, '#7a4a26'); }
    for (let px = d.x - 8; px < d.x + d.w + 8; px += 6) { R(g, px, d.y - 22, 5, 9, OUT); R(g, px, d.y - 21, 5, 8, '#6a4224'); R(g, px, d.y - 21, 5, 1, '#8a5a30'); R(g, px + 4, d.y - 21, 1, 8, '#3a2412'); }
    shadow(g, d.x, d.y, d.w, 6, 0.4);
    if (!h.sign) { // la galerie condamnée : un écriteau planté à côté
      const sx = d.x + d.w + 26;
      O(g, sx - 1, GROUND, [[0, -58, 3, 58, '#6a4224']]);
      plank(g, sx, 104, 'DANGER', { bg: '#eadcb0', fg: '#7a1a14' });
    }
  },
  // le chevalement : tréteau de poutres, plate-forme (le bandit y monte), jambe de force, carreau ; la salle du
  // treuil plus loin et son câble (la molette tourne : shooterdeco)
  headframe(g, h) {
    const cx = h.x + h.w / 2, top = h.top, col = '#7a4a26';
    // la salle du treuil
    const wx = 690;
    O(g, wx, GROUND, [[0, -40, 74, 40, '#7a5c40']]);
    battens(g, wx, GROUND - 40, 74, 40, '#7a5c40', 71, 6);
    const rr = [];
    for (let y = GROUND - 52; y < GROUND - 40; y++) { const k = (y - GROUND + 52) / 12; rr.push([y, Math.round(wx + 30 - k * 36), Math.round(wx + 44 + k * 36)]); }
    outlineRows(g, rr); clipRows(g, rr, () => shingles(g, wx - 8, GROUND - 52, 90, 12, '#5a4a44', 72));
    R(g, wx - 7, GROUND - 41, 88, 2, OUT);
    O(g, wx + 54, GROUND - 52, [[0, -18, 6, 18, '#3a3a42']]); R(g, wx + 53, GROUND - 72, 8, 2, '#2a2a30');
    R(g, wx + 10, GROUND - 26, 14, 26, OUT); R(g, wx + 11, GROUND - 25, 12, 25, '#2a1a12');
    R(g, wx + 42, GROUND - 32, 14, 10, OUT); R(g, wx + 43, GROUND - 31, 12, 8, '#2a3440'); R(g, wx + 44, GROUND - 30, 3, 1, '#6a7a88');
    shadow(g, wx + 74, GROUND - 2, 10, 2, 0.3);
    for (let k = 0; k <= 70; k++) { const t = k / 70; R(g, Math.round(cx + 8 + (wx + 6 - cx - 8) * t), Math.round(top - 12 + (GROUND - 30 - top + 12) * t + 10 * t * (1 - t)), 1, 1, '#2a2a30'); }
    // la jambe de force, derrière
    beam(g, cx + 6, top + 4, h.x + h.w + 26, GROUND, 3, '#5a361c');
    // les montants et leurs entretoises
    beam(g, h.x + 2, GROUND, cx - 9, top + 2, 4, col);
    beam(g, h.x + h.w - 2, GROUND, cx + 9, top + 2, 4, col);
    const hw = (y) => Math.round(9 + ((y - top) / (GROUND - top)) * (h.w / 2 - 11));
    for (let y = top + 22; y < GROUND - 4; y += 22) {
      R(g, cx - hw(y) - 1, y - 1, hw(y) * 2 + 3, 4, OUT); R(g, cx - hw(y), y, hw(y) * 2 + 1, 2, '#8a5a30'); R(g, cx - hw(y), y, hw(y) * 2 + 1, 1, '#a87244');
      if (y + 22 < GROUND - 4) { line(g, cx - hw(y) + 1, y + 2, cx + hw(y + 22) - 1, y + 21, 1, '#5a3a1e'); line(g, cx + hw(y) - 1, y + 2, cx - hw(y + 22) + 1, y + 21, 1, '#5a3a1e'); }
    }
    // la plate-forme et les paliers de la molette
    O(g, cx - 16, top, [[0, 0, 32, 4, '#8a5a30']]); R(g, cx - 16, top, 32, 1, '#b08050');
    for (let px = cx - 15; px < cx + 16; px += 5) R(g, px, top + 1, 1, 3, '#5a3a1e');
    O(g, cx - 8, top - 6, [[0, 0, 3, 6, '#5a3a1e'], [13, 0, 3, 6, '#5a3a1e']]);
    R(g, cx + 9, top - 2, 1, GROUND - top - 18, '#2a2a30'); // le câble qui descend dans le puits
    // le carreau : la cage remontée, le palier de planches
    O(g, cx + 2, GROUND, [[0, -18, 14, 18, '#5a5e66']]); R(g, cx + 3, GROUND - 17, 12, 1, '#8a8f98'); R(g, cx + 8, GROUND - 17, 1, 17, '#3a3e46');
    O(g, cx - 26, GROUND, [[0, -4, 56, 4, '#6a4224']]); R(g, cx - 26, GROUND - 4, 56, 1, '#8a5a30');
  },
  // le moulin à bocards : bâtiment en gradins (toit bas en h.roof, à gauche), étage du haut, cheminée de tôle
  // haubanée, goulotte de minerai qui descend de la falaise
  mill(g, h, E) {
    const { x, w, top } = h;
    const col = E.col, trim = '#c8b894';
    const ux = x + 90, uw = 80, ut = 46;
    // la cheminée haubanée
    R(g, x + w - 23, 17, 11, top - 17, OUT);
    for (let px = 0; px < 9; px++) R(g, x + w - 22 + px, 18, 1, top - 18, px < 2 ? '#6a6670' : px > 6 ? '#2a2830' : '#4a4652');
    for (let y = 26; y < top; y += 10) R(g, x + w - 23, y, 11, 1, '#2a2830');
    R(g, x + w - 25, 16, 15, 3, OUT); R(g, x + w - 24, 17, 13, 1, '#5a5662');
    line(g, x + w - 18, 24, x + w + 18, top + 10, 1, '#3a3436'); line(g, x + w - 18, 24, x + w - 50, ut - 2, 1, '#3a3436');
    // la goulotte de minerai, sur ses chevalets
    O(g, x + 18, 66, [[0, -14, 18, 14, '#1a100a']]);
    for (const px of [x + 16, x + 34]) { O(g, px, 66, [[0, -16, 3, 16, '#8a5a30']]); }
    O(g, x + 14, 49, [[0, 0, 26, 3, '#7a4a26']]); R(g, x + 14, 49, 26, 1, '#a87244');
    beam(g, ux + 4, ut + 8, x + 30, 60, 5, '#6a4a2c');
    beam(g, x + 64, 58, x + 64, top - 1, 2, '#5a3a20');
    // l'étage du haut (le broyeur)
    R(g, ux - 1, ut - 1, uw + 2, top - ut + 1, OUT);
    battens(g, ux, ut, uw, top - ut, sh(col, 0.05), 81, 7);
    R(g, ux - 4, ut - 4, uw + 8, 4, OUT); R(g, ux - 3, ut - 3, uw + 6, 2, '#5a4a44'); R(g, ux - 3, ut - 3, uw + 6, 1, '#7a6a5c');
    shadow(g, ux, ut, uw, 3, 0.35);
    pane(g, { x: ux + 30, y: ut + 6, w: 18, h: 12 }, { frame: trim, cap: false });
    // le bas
    R(g, x - 1, top - 1, w + 2, GROUND - top + 1, OUT);
    battens(g, x, top, w, GROUND - top, col, 82, 7);
    const r = lcg(82);
    for (let i = 0; i < w; i++) R(g, x + Math.floor(r() * w), top + Math.floor(r() * (GROUND - top)), 1, 3 + Math.floor(r() * 8), sh(col, -0.2));
    R(g, x - 5, top - 3, w + 10, 5, OUT); R(g, x - 4, top - 2, w + 8, 3, '#5a4a44'); R(g, x - 4, top - 2, w + 8, 1, '#7a6a5c');
    shadow(g, x, top + 2, w, 4, 0.35);
    veil(g, x + w - 24, top + 2, 24, GROUND - top - 2, 0.15);
    for (const wn of h.wins) pane(g, wn, { frame: trim, cap: false });
    doorway(g, h.door, { frame: trim, col: sh(col, -0.3) });
    // le canal des boues, au pied
    O(g, x + w - 60, GROUND, [[0, -6, 56, 4, '#6a4a2c']]); R(g, x + w - 59, GROUND - 6, 54, 1, '#6a8a8a');
  },
  // le baraquement en rondins : bouts croisés aux angles, toit de bardeaux (faîtage en h.roof), tuyau de poêle
  bunk(g, h, E) {
    const { x, w, top } = h;
    const eave = top + 12;
    const rows = [];
    for (let y = top; y < eave; y++) { const k = (y - top) / (eave - top); rows.push([y, Math.round(x - 2 - k * 8), Math.round(x + w + 2 + k * 8)]); }
    outlineRows(g, rows);
    clipRows(g, rows, () => { shingles(g, x - 12, top, w + 24, eave - top, '#5a4a40', 91); veil(g, x + w / 2 + 30, top, w, eave - top, 0.15); });
    R(g, x - 2, top, w + 4, 1, '#8a7a6a');
    O(g, x + 24, top, [[0, -16, 5, 16, '#3a3a42']]); R(g, x + 23, top - 17, 7, 2, '#2a2a30');
    R(g, x - 11, eave, w + 22, 2, OUT);
    R(g, x - 1, eave + 1, w + 2, GROUND - eave - 1, OUT);
    for (let y = eave + 2; y < GROUND; y += 5) {
      R(g, x, y, w, 5, OUT); R(g, x, y, w, 4, '#7a5432'); R(g, x, y, w, 1, '#9a6e44'); R(g, x, y + 3, w, 1, '#5a3a22');
      for (let k = 0; k < w / 16; k++) R(g, x + Math.floor(hash(y * 31 + k) * w), y + 1 + (k % 2), 4, 1, '#6a4a2c');
      for (const ex of [x - 3, x + w - 2]) { S.disc(g, ex + 2, y + 2, 3, OUT); S.disc(g, ex + 2, y + 2, 2, ex < x ? '#b08458' : '#8a6038'); R(g, ex + 2, y + 2, 1, 1, '#6a4a2c'); }
    }
    shadow(g, x, eave + 2, w, 5, 0.4);
    veil(g, x + w - 24, eave + 2, 24, GROUND - eave - 2, 0.14);
    for (const wn of h.wins) pane(g, wn, { frame: '#a8784a', cap: false, curtain: '#8a6a4a' });
    doorway(g, h.door, { frame: '#a8784a', col: '#5a3a22', cap: false });
    // le tas de bois, la scie
    for (let k = 0; k < 9; k++) { const lx = x + w - 30 + (k % 3) * 8 + (Math.floor(k / 3) % 2) * 4, ly = GROUND - 4 - Math.floor(k / 3) * 7; S.disc(g, lx, ly, 4, OUT); S.disc(g, lx, ly, 3, '#a88050'); R(g, lx, ly, 1, 1, '#6a4a2c'); }
  },
};

// ------------------------------------------------------------ abris du premier plan
// Posés sur PROP_BASE, aux tailles EDGE_COVER : le bandit se cache derrière, une bouteille se pose sur le haut
// (au milieu). Ils servent aussi sur les décors du mode histoire (fort, mission, hacienda, mine du Vieux Joe).
function drawCover(g, c, E, Q) {
  const [w, h] = EDGE_COVER[c.kind];
  const x = c.x, top = PROP_BASE - h, cx = x + w / 2;
  const rock = E.kind === 'vieuxjoe' ? P.granit : E.kind === 'hacienda' ? P.basalte : E.kind === 'mine' ? ROC : PIERRE;
  switch (c.kind) {
    case 'stone': {
      // stèle cintrée, épitaphe effacée, tertre de cailloux devant
      dropShadow(g, cx + 8, PROP_BASE, w / 2 + 12, 3);
      const rows = [];
      for (let y = top; y < PROP_BASE - 2; y++) {
        const dy = y - top, hw = dy < w / 2 ? Math.round(Math.sqrt((w / 2) ** 2 - (w / 2 - dy) ** 2)) : w / 2;
        rows.push([y, Math.round(cx - hw), Math.round(cx + hw)]);
      }
      outlineRows(g, rows);
      for (const [y, a, b] of rows) for (let px = a; px < b; px++) {
        const u = (px - a) / Math.max(1, b - a);
        R(g, px, y, 1, 1, css(pick(PIERRE, 5.4 - u * 3 + (y - top < 2 ? 0.8 : 0) + (vnoise(px / 2, y / 3, 9) - 0.5) * 1.2, px, y)));
      }
      R(g, cx - 4, top + 8, 9, 1, '#6a6258'); R(g, cx - 6, top + 12, 13, 1, '#6a6258'); R(g, cx - 5, top + 15, 11, 1, '#6a6258'); R(g, cx - 3, top + 18, 7, 1, '#6a6258');
      R(g, cx - 1, top + 3, 2, 3, '#7a6e62');
      for (let px = x; px < x + w; px++) if (vnoise(px / 3, 0, 5) > 0.45) R(g, px, PROP_BASE - 4 - Math.round(vnoise(px, 1, 6) * 5), 1, 3, '#6a7048');
      Q.push(cairnFront(c, x - 8, w + 16, rock));
      break;
    }
    case 'cross': {
      // croix de bois penchée, tertre de cailloux
      dropShadow(g, cx + 8, PROP_BASE, 16, 3);
      O(g, x + 8, top, [[0, 0, 4, h - 2, '#8a6a48']]);
      O(g, x - 1, top + 8, [[0, 0, w + 2, 4, '#8a6a48']]);
      R(g, x + 8, top, 1, h - 2, '#a8885a'); R(g, x + 11, top, 1, h - 2, '#5a4028'); R(g, x - 1, top + 8, w + 2, 1, '#a8885a'); R(g, x - 1, top + 11, w + 2, 1, '#5a4028');
      R(g, x + 9, top + 9, 2, 2, '#4a3424');
      O(g, x + 6, top + 14, [[0, 0, 8, 5, '#b8b0a0']]); R(g, x + 7, top + 16, 6, 1, '#7a7268'); // la plaque de fer-blanc
      Q.push(cairnFront(c, x - 10, w + 20, rock));
      break;
    }
    case 'tomb': {
      // tombeau-coffre : dalle débordante, croix sculptée, mousse
      dropShadow(g, cx + 6, PROP_BASE, w / 2 + 10, 3);
      R(g, x - 1, top + 3, w + 2, h - 3, OUT);
      for (let y = top + 4; y < PROP_BASE; y++) for (let px = x; px < x + w; px++) {
        const u = (px - x) / w;
        R(g, px, y, 1, 1, css(pick(MARBRE, 5.6 - u * 2.6 - (y > PROP_BASE - 4 ? 1 : 0) + (vnoise(px / 3, y / 2, 4) - 0.5), px, y)));
      }
      O(g, x - 3, top, [[0, 0, w + 6, 4, '#c8c2b4']]); R(g, x - 3, top, w + 6, 1, '#e2ddd0'); R(g, x - 3, top + 3, w + 6, 1, '#8e897e');
      R(g, cx - 1, top + 7, 2, 10, '#76716a'); R(g, cx - 5, top + 10, 10, 2, '#76716a'); R(g, cx, top + 7, 1, 10, '#a6a092');
      R(g, x + 4, top + 6, 4, 1, '#8e897e'); R(g, x + w - 8, top + 6, 4, 1, '#8e897e');
      for (let px = x; px < x + w; px++) if (vnoise(px / 2.5, 3, 7) > 0.5) R(g, px, PROP_BASE - 2 - Math.round(vnoise(px, 4, 8) * 4), 1, 2, '#6a7048');
      break;
    }
    case 'hearse': {
      // corbillard noir verni et vitré, plumets aux coins, lanternes, cercueil derrière la vitre
      const ty = top;
      dropShadow(g, cx + 6, PROP_BASE, 48, 3);
      for (const px of [x + 4, x + 74]) { O(g, px, ty - 13, [[0, 0, 7, 9, '#1a1618']]); R(g, px + 1, ty - 13, 2, 4, '#4a4446'); R(g, px + 2, ty - 15, 3, 2, '#1a1618'); }
      O(g, x + 2, ty - 4, [[0, 0, 82, 4, '#1a1618']]); R(g, x + 2, ty - 4, 82, 1, '#5a5456');
      for (let px = x + 4; px < x + 82; px += 6) R(g, px, ty - 1, 3, 2, '#c8a040'); // la frange dorée
      O(g, x + 6, ty, [[0, 0, 74, 28, '#2a2628']]);
      R(g, x + 6, ty, 2, 28, '#4a4446');
      for (const gx of [x + 11, x + 45]) {
        R(g, gx - 1, ty + 3, 32, 18, OUT); R(g, gx, ty + 4, 30, 16, '#4a5a64');
        for (let k = 0; k < 12; k++) if (k % 5 < 3) R(g, gx + 26 - k, ty + 5 + k, 1, 1, '#8aa0aa');
        R(g, gx, ty + 4, 30, 2, '#3a4850');
      }
      R(g, x + 12, ty + 13, 62, 6, OUT); R(g, x + 13, ty + 14, 60, 4, '#6a4a2a'); R(g, x + 13, ty + 14, 60, 1, '#8a6a3a');
      for (const hx of [x + 20, x + 40, x + 60]) R(g, hx, ty + 15, 3, 2, '#c8a040');
      R(g, x + 6, ty + 22, 74, 2, '#c8a040'); R(g, x + 6, ty + 23, 74, 1, '#8a6a20');
      for (const px of [x + 10, x + 43, x + 77]) R(g, px - 1, ty + 3, 3, 18, '#1a1618');
      O(g, x + 2, ty + 24, [[0, 0, 82, 6, '#1a1618']]); R(g, x + 2, ty + 24, 82, 1, '#4a4446');
      // les lanternes et le siège du cocher
      for (const lx of [x + 3, x + 81]) { O(g, lx, ty + 4, [[0, 0, 4, 6, '#c8a040']]); R(g, lx + 1, ty + 5, 2, 3, '#f8e8a0'); }
      for (const [wx, rr] of [[x + 18, 11], [x + 68, 9]]) {
        const wy = PROP_BASE - rr;
        S.disc(g, wx, wy, rr + 1, OUT); S.disc(g, wx, wy, rr, '#2a2628'); S.disc(g, wx, wy, rr - 2, OUT);
        for (let a = 0; a < 12; a++) { const an = (a / 12) * Math.PI * 2; for (let k = 2; k < rr - 2; k++) R(g, Math.round(wx + Math.cos(an) * k), Math.round(wy + Math.sin(an) * k), 1, 1, '#4a4446'); }
        S.disc(g, wx, wy, 3, OUT); S.disc(g, wx, wy, 2, '#c8a040');
        for (let a = 0; a < 24; a++) { const an = (a / 24) * Math.PI * 2; if (Math.sin(an) < -0.3) R(g, Math.round(wx + Math.cos(an) * rr), Math.round(wy + Math.sin(an) * rr), 1, 1, '#6a6466'); }
      }
      break;
    }
    case 'ore': {
      // wagonnet de minerai sur ses roues, chargé de pierres (des pépites y brillent)
      dropShadow(g, cx + 6, PROP_BASE, w / 2 + 6, 2);
      const by = top + 8;
      for (const wx of [x + 9, x + w - 9]) { S.disc(g, wx, PROP_BASE - 4, 4, OUT); S.disc(g, wx, PROP_BASE - 4, 3, '#3a3e46'); R(g, wx, PROP_BASE - 4, 1, 1, '#9aa0a8'); }
      const rows = [];
      for (let y = by; y < PROP_BASE - 6; y++) { const k = (y - by) / (PROP_BASE - 6 - by); rows.push([y, Math.round(x + k * 3), Math.round(x + w - k * 3)]); }
      outlineRows(g, rows);
      for (const [y, a, b] of rows) for (let px = a; px < b; px++) R(g, px, y, 1, 1, px - a < 3 ? '#8a8f98' : b - px < 4 ? '#3e424a' : y === by ? '#9aa0a8' : '#5e626a');
      R(g, x - 2, by - 1, w + 4, 3, OUT); R(g, x - 1, by, w + 2, 1, '#a8acb4');
      for (const px of [x + 4, x + w - 5]) for (const py of [by + 4, by + 9]) R(g, px, py, 1, 1, '#b8bcc4');
      R(g, x + w / 2 - 1, by + 3, 2, 8, '#4a4e56');
      Q.push(oreHeap(c, x + 3, w - 6, by, top));
      break;
    }
    case 'tnt': {
      // caisse de dynamite au pochoir, bâtons et mèche qui dépassent sur le côté
      dropShadow(g, cx + 8, PROP_BASE, w / 2 + 8, 3);
      const cc = '#a8783c';
      R(g, x - 1, top - 1, w + 2, h + 1, OUT);
      for (let k = 0; k < 4; k++) { const c2 = sh(cc, [0.06, -0.04, 0.02, -0.08][k]); R(g, x, top + k * 8, w, 8, c2); R(g, x, top + k * 8 + 7, w, 1, sh(cc, -0.35)); R(g, x, top + k * 8, w, 1, sh(c2, 0.15)); }
      R(g, x, top, 3, h, sh(cc, -0.2)); R(g, x + w - 3, top, 3, h, sh(cc, -0.3)); R(g, x, top, 1, h, sh(cc, 0.2));
      for (const ny of [top + 2, top + h - 4]) for (const nx of [x + 1, x + w - 2]) R(g, nx, ny, 1, 1, '#4a3a30');
      R(g, x + 5, top + 9, w - 10, 13, OUT); R(g, x + 6, top + 10, w - 12, 11, '#b8302a'); R(g, x + 6, top + 10, w - 12, 1, '#d8503a');
      canvasText(g, 'TNT', cx, top + 12, { size: 8, color: '#f4ecd8', shadow: '' });
      for (let k = 0; k < 3; k++) { O(g, x + w + 1, PROP_BASE - 4 - k * 4, [[0, 0, 9, 3, '#c0392b']]); R(g, x + w + 1, PROP_BASE - 4 - k * 4, 9, 1, '#e86048'); R(g, x + w + 1, PROP_BASE - 4 - k * 4, 1, 3, '#e8d8b0'); }
      for (let k = 0; k < 8; k++) R(g, x + w + 10 + Math.round(Math.sin(k / 2) * 2), PROP_BASE - 10 + k, 1, 1, '#3a3436');
      break;
    }
    case 'rock':
      // éboulis : gros blocs modelés (sans la terre de la grand-rue dessous)
      dropShadow(g, cx + 8, PROP_BASE - 2, w / 2 + 8, 3);
      Q.push(rocks(c, x, w, rock));
      break;
    default:
      drawProp(g, c);
  }
}
// (dans le tampon des abris) tertre de cailloux devant une tombe
function cairnFront(c, x, w, Rm) {
  return (Pp) => {
    for (let i = 0; i < w * 1.6; i++) {
      const u = hsh(i, 1, c.x), v = hsh(i, 2, c.x), t = Math.abs(u - 0.5) * 2;
      boulder(1 + Math.round(hsh(i, 3, c.x) * 2), c.x * 7 + i, Rm, OUTC).blit(Pp, Math.round(x + u * w), Math.round(PROP_BASE + 1 - (1 - t * t) * 9 * v));
    }
  };
}
function oreHeap(c, x, w, by, top) {
  return (Pp) => {
    for (let i = 0; i < 18; i++) {
      const u = hsh(i, 1, c.x), t = Math.abs(u - 0.5) * 2;
      boulder(2 + Math.round(hsh(i, 3, c.x) * 2), c.x + i, P.granit, OUTC).blit(Pp, Math.round(x + 2 + u * (w - 4)), Math.round(by + 1 - (1 - t * t) * (by - top - 2) * (0.5 + hsh(i, 2, c.x) * 0.5)));
    }
    for (let i = 0; i < 6; i++) { const gx = Math.round(x + 4 + hsh(i, 5, c.x) * (w - 8)), gy = Math.round(by - 2 - hsh(i, 6, c.x) * (by - top - 4)); if (Pp.get(gx, gy) >>> 24) { Pp.set(gx, gy, hex('#f8d070')); Pp.set(gx + 1, gy, hex('#c89428')); } }
  };
}
function rocks(c, x, w, Rm) {
  return (Pp) => {
    for (const [dx, by, sz, s] of [[14, PROP_BASE - 1, 9, 1], [30, PROP_BASE - 3, 10, 2], [38, PROP_BASE, 6, 3], [6, PROP_BASE, 5, 4]]) boulder(sz, c.x + s, Rm).blit(Pp, x + dx, by);
  };
}

// porche de la ferme (premier plan) : toit de bardeaux en appentis, poteaux tournés, garde-corps
function drawFront(g, E) {
  for (const h of E.houses) {
    if (h.kind !== 'farm') continue;
    const x0 = h.x - 8, x1 = h.x + h.w + 8;
    const rows = [];
    for (let y = 101; y < 108; y++) { const k = y - 101; rows.push([y, x0 + 6 - k, x1 - 6 + k]); }
    outlineRows(g, rows);
    clipRows(g, rows, () => shingles(g, x0 - 2, 101, x1 - x0 + 4, 7, '#6a4a3a', 8));
    R(g, x0 - 1, 108, x1 - x0 + 2, 7, OUT);
    R(g, x0, 108, x1 - x0, 5, '#f0e8d4'); R(g, x0, 108, x1 - x0, 1, '#ffffff'); R(g, x0, 112, x1 - x0, 1, '#b8ae96');
    for (let px = x0 + 2; px < x1 - 2; px += 4) R(g, px, 113, 2, 1, '#f0e8d4'); // la dentelle
    const posts = [h.x - 3, h.x + 64, h.x + 140, h.x + h.w];
    for (const px of posts) {
      R(g, px - 1, 114, 5, GROUND - 120, OUT); R(g, px, 114, 3, GROUND - 121, '#ece4d0'); R(g, px, 114, 1, GROUND - 121, '#ffffff'); R(g, px + 2, 114, 1, GROUND - 121, '#b8ae96');
      for (const s of [-1, 1]) for (let k = 0; k < 5; k++) R(g, px + 1 + s * (2 + k), 114 + k, 1, 1, k === 4 ? OUT : '#ece4d0');
    }
    // le garde-corps, ouvert devant la porte
    const d = h.door;
    for (const [a, b] of [[h.x - 2, d.x - 10], [d.x + d.w + 10, h.x + h.w]]) {
      R(g, a, 149, b - a, 3, OUT); R(g, a, 150, b - a, 1, '#ece4d0');
      for (let px = a + 2; px < b - 1; px += 4) { R(g, px - 1, 152, 3, 8, OUT); R(g, px, 152, 1, 8, '#ece4d0'); }
      R(g, a, 159, b - a, 2, OUT);
    }
    // les marches
    O(g, d.x - 8, GROUND, [[0, 0, d.w + 16, 3, '#8a6a48'], [-3, 3, d.w + 22, 3, '#7a5c3c']]);
    R(g, d.x - 8, GROUND, d.w + 16, 1, '#a8885a'); R(g, d.x - 11, GROUND + 3, d.w + 22, 1, '#9a7a50');
  }
}

// Abords dessinés une fois : le fond (bg) et les abris du premier plan (front). Ceux qui reprennent un décor du mode
// histoire (E.set) n'ont que leurs abris : le décor est peint par storyset.js.
export function renderEdge(E) {
  const front = S.makeCanvas(E.w, H);
  const fx = front.getContext('2d');
  const after = [];
  for (const c of E.covers) drawCover(fx, c, E, after);
  if (after.length) { const Q = new Pix(fx); for (const f of after) f(Q); Q.put(); }
  if (E.set) return { bg: null, front };
  const bg = S.makeCanvas(EDGE_W, H);
  const g = bg.getContext('2d');
  GROUNDS[E.kind](g, E);
  for (const h of E.houses) {
    HOUSES[h.kind](g, h, E, seeded(53 + (E.seed % 991)));
    if (h.sign && h.kind !== 'gate') plate(g, h.x + h.w / 2, h.sign.y, h.sign.t);
  }
  drawFront(fx, E);
  return { bg, front };
}

// enseignes (texte par-dessus le décor)
export function edgeSigns(w, camX, E) {
  for (const h of E.houses) {
    if (!h.sign) continue;
    const x = h.x + h.w / 2 - camX;
    if (x < -80 || x > W + 80) continue;
    canvasText(w, h.sign.t, x, h.sign.y, { size: 8, color: '#3a2214', shadow: '#c8b07c' });
  }
}

// La nuit : une partie des fenêtres éclairées, lueur au fond des galeries de mine
export function edgeLights(ctx, camX, E, amb) {
  if (!amb.env.lights) return;
  for (const h of E.houses) {
    if (!h.w || h.x - camX > W || h.x + h.w - camX < 0) continue;
    (h.wins || []).forEach((wn, k) => { if (h.kind === 'chapel' || hash(h.x * 7 + k) < 0.6) amb.window(ctx, wn.x - camX, wn.y, wn.w, wn.h); });
    if (h.kind === 'tunnel') amb.glow(ctx, h.door.x + h.door.w / 2 - camX, h.door.y + 24, 20, '255,190,110');
    if (h.belfry) amb.glow(ctx, h.belfry.x + h.belfry.w / 2 - camX, h.belfry.y + 8, 14);
  }
}
