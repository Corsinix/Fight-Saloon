// Boot Hill, le cimetière sur la colline au-dessus de Dusty Gulch : tombes en tertres de pierres (comme à Tombstone)
// avec croix de bois penchées, planches et quelques stèles, l'arbre mort sur la crête, oponces et ocotillos, clôture
// de piquets blanchis et arche de l'entrée ; en bas, la ville et la chaîne lointaine.
// cross : la première des trois croix (fx 'croix'), sur le versant juste devant l'arbre mort.
import * as S from '../../sprites.js';
import { canvasText } from '../../scene.js';
import { H } from '../../worlds.js';
import { OUT, R, O } from './kit.js';
import {
  P, Pix, Spr, hex, ramp, mixc, pick, vnoise, fbm, hsh, range, butte, ground, pebbles, sow,
  bush, tuft, boulder, pear, ocotillo, cholla, deadTree,
} from './kit-nature.js';

const HZ = 134;
const HAZE = hex('#d4b0aa');
const LOIN = ramp('766a88 857692 94849a a492a0 b2a0a6 c0aeac');
const PIERRE = ramp('3a3230 544a44 6e6258 887a6c a29482 b8ac9a cec4b2');
const BOIS = ramp('2a1c14 3e2a1c 584030 72563e 8c6e50 a68864');

// la crête de la colline
const top = (x) => Math.round(160 - 50 * Math.exp(-(((x - 300) / 200) ** 2)) + Math.sin(x / 37) * 1.5 + Math.sin(x / 13) * 0.6);

// croix de bois (penchée de lean pixels sur sa hauteur), en sprite avec contour
function cross(h, lean, seed) {
  const w = Math.round(h * 0.7) + 6, s = new Spr(w, h + 2, w >> 1, h + 1);
  const th = h > 14 ? 2 : 1, arm = Math.round(h * 0.28), ay = Math.round(h * 0.3);
  for (let y = 0; y < h; y++) {
    const x = (w >> 1) + Math.round((lean * (h - y)) / h);
    for (let k = 0; k < th; k++) s.set(x + k, y, BOIS[k === 0 ? 4 : 2]);
    if (y === ay || (th > 1 && y === ay + 1)) for (let k = -arm; k <= arm; k++) s.set(x + k, y, BOIS[y === ay ? 4 : 2]);
  }
  if (hsh(seed, 1) < 0.5) s.set((w >> 1) + Math.round(lean * 0.7), ay + 1, BOIS[1]); // un clou
  return s.outline(OUT);
}
// planche funéraire (marqueur de bois à sommet arrondi)
function board(h, lean) {
  const w = 9, s = new Spr(w + 4, h + 2, (w + 4) >> 1, h + 1);
  for (let y = 0; y < h; y++) for (let k = 0; k < w - 2; k++) {
    if (y === 0 && (k === 0 || k === w - 3)) continue;
    s.set(2 + k + Math.round((lean * (h - y)) / h), y + 1, BOIS[k === 0 ? 5 : k > w - 5 ? 2 : 3]);
  }
  for (let k = 1; k < w - 4; k += 2) s.set(3 + k, Math.round(h * 0.45), BOIS[1]); // l'épitaphe effacée
  return s.outline(OUT);
}
// stèle de pierre
function stele(h) {
  const w = Math.round(h * 0.75), s = new Spr(w + 2, h + 2, (w + 2) >> 1, h + 1);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dy = y - w / 2, dx = x + 0.5 - w / 2;
    if (y < w / 2 && dx * dx + dy * dy > (w / 2) ** 2) continue;
    s.set(x + 1, y + 1, pick(PIERRE, 5.2 - (x / w) * 2.6 + (y < 2 ? 1 : 0), x, y));
  }
  s.rect(Math.round(w / 2) - 1, Math.round(h * 0.4), 3, 1, PIERRE[2]); s.rect(Math.round(w / 2) - 2, Math.round(h * 0.55), 5, 1, PIERRE[2]);
  return s.outline(OUT);
}
// tertre de pierres allongé : un tas de cailloux ronds
function cairn(Pp, x, y, len, seed) {
  for (let i = 0; i < len * 2.2; i++) {
    const u = (hsh(i, 1, seed) - 0.5) * len, v = (1 - (2 * u / len) ** 2) * 4 * hsh(i, 2, seed);
    boulder(1 + Math.round(hsh(i, 3, seed) * 1.6), seed * 31 + i, PIERRE, PIERRE[0]).blit(Pp, Math.round(x + u), Math.round(y - v));
  }
}

const GRAVES = [ // [x, profondeur sous la crête, taille, genre]
  [40, 10, 0.7, 'c'], [92, 6, 0.75, 'b'], [150, 4, 0.8, 'c'], [196, 10, 0.85, 's'], [236, 2, 0.8, 'c'], [266, 18, 0.95, 'b'],
  [372, 3, 0.8, 'c'], [410, 14, 0.9, 's'], [444, 4, 0.75, 'c'], [500, 8, 0.8, 'b'], [540, 6, 0.75, 'c'],
  [120, 26, 1.1, 'c'], [222, 30, 1.15, 'b'], [356, 30, 1.2, 'c'], [64, 32, 1.1, 's'],
];

export default {
  w: 560, horizon: HZ, ground: 186, outdoor: true, cross: [318, 150],
  far: [
    { k: 0.1, draw(g, w) {
      const Pp = new Pix(g);
      range(Pp, { base: HZ + 1, top: (x) => HZ - 10 - fbm(x / 46, 0.5, 13, 4) * 20, R: LOIN, l0: 3, k: 3, seed: 13 });
      Pp.put();
    } },
    // la vallée et Dusty Gulch, tout en bas
    { k: 0.3, draw(g, w) {
      const Pp = new Pix(g);
      butte(Pp, { cx: 420, base: HZ + 1, cw: 60, ch: 12, tw: 50, th: 8, haze: 0.45, hcol: HAZE, seed: 14 });
      ground(Pp, { y0: HZ - 4, y1: HZ + 1, R: P.terre, lf: 6.6, ln: 6, amp: 1, seed: 15 });
      Pp.put();
      const r = (n) => hsh(n, 4, 4);
      for (let x = 40, i = 0; x < 240; i++) {
        const hh = 4 + Math.floor(r(i) * 6), bw = 6 + Math.floor(r(i + 50) * 6);
        R(g, x, HZ - 2 - hh, bw, hh, i % 3 ? '#7a5a46' : '#8a6a52'); R(g, x, HZ - 2 - hh, 1, hh, '#a07a5a'); R(g, x, HZ - 2 - hh, bw, 1, '#5a4034');
        if (r(i + 9) < 0.6) R(g, x + 2, HZ - hh + 1, 1, 1, '#d8b070');
        x += bw + 1 + Math.floor(r(i + 7) * 4);
      }
      R(g, 250, HZ - 22, 2, 20, '#7a5a46'); R(g, 248, HZ - 12, 6, 10, '#8a6a52'); R(g, 247, HZ - 18, 8, 1, '#7a5a46'); // le clocher
    } },
  ],
  back(g, w) {
    const Pp = new Pix(g);
    // la colline : gravier beige, plus clair sur la crête
    for (let x = 0; x < w; x++) {
      const t0 = top(x);
      for (let y = HZ; y < t0; y++) Pp.set(x, y, mixc(pick(P.terre, 6.2 - (y - HZ) * 0.12 + vnoise(x / 6, y / 2, 80), x, y), HAZE, 0.4)); // la vallée, en contrebas
      for (let y = t0; y < H; y++) {
        const d = (y - t0) / 60, nz = fbm(x / (6 + d * 18), y / (3 + d * 8), 81, 3) - 0.5;
        Pp.set(x, y, pick(P.terre, 6.6 - Math.min(1, d) * 2 + nz * 2.2 + (y - t0 < 1 ? 1.4 : 0), x, y));
      }
    }
    pebbles(Pp, { y0: 128, n: w * 2, R: P.terre, seed: 82, grass: 0.35 });
    // le sentier qui monte de l'arche vers la crête
    for (let i = 0; i < 400; i++) {
      const t = i / 400, x = Math.round(500 - t * 150 + Math.sin(t * 5) * 10), y = Math.round(188 - t * (188 - top(350) - 4));
      const hw = 2 + (1 - t) * 6;
      for (let k = -hw; k <= hw; k++) Pp.set(x + k, y, pick(P.terre, 7.4 + vnoise(x + k, y, 3) - Math.abs(k) / hw, x + k, y));
    }
    // buissons, oponces et ocotillos sur la colline
    sow(Pp, { y0: 116, y1: 178, n: 70, seed: 83, avoid: (x, y) => y < top(x) + 2 || (x > 296 && x < 340), make: (d, s) => [bush(2 + Math.round(d * 2), s, P.sauge), tuft(4 + Math.round(d * 4), s, P.herbe), tuft(4 + Math.round(d * 3), s, P.herbe), bush(2, s, P.olive), pear(2 + Math.round(d), s)][s % 5] });
    // les tombes, du fond vers nous
    const graves = GRAVES.map(([x, dd, sz, k]) => [top(x) + 4 + dd, x, sz, k]).sort((a, b) => a[0] - b[0]);
    for (const [y, x, sz, k] of graves) {
      const len = Math.round(20 * sz);
      Pp.shadow(x + 3, y + 1, len / 2 + 2, 2);
      cairn(Pp, x, y, len, x);
      const lean = Math.round((hsh(x, 9) - 0.5) * 6 * sz);
      const hx = x - Math.round(len / 2) + 1, hy = y - 1;
      if (k === 'c') cross(Math.round(26 * sz), lean, x).blit(Pp, hx, hy);
      else if (k === 'b') board(Math.round(18 * sz), lean).blit(Pp, hx, hy);
      else stele(Math.round(17 * sz)).blit(Pp, hx, hy);
    }
    // l'arbre mort sur la crête, et des ocotillos qui se découpent sur le ciel
    deadTree(66, 3).blit(Pp, 288, top(288) + 6);
    ocotillo(34, 2).blit(Pp, 176, top(176) + 3); ocotillo(28, 5).blit(Pp, 470, top(470) + 4);
    cholla(12, 4).blit(Pp, 404, top(404) + 6);
    pear(4, 7).blit(Pp, 18, top(18) + 30); pear(5, 2).blit(Pp, 300, 178);
    Pp.put();
    // la clôture de piquets blanchis qui mène à l'arche
    for (let x = 372; x < 466; x += 5) {
      if (hsh(x, 5) < 0.12) continue; // un piquet manquant
      const hh = 12 + (x % 3), lean = hsh(x, 6) < 0.15 ? 1 : 0;
      O(g, x, 182, [[lean, -hh, 2, hh, '#d8d0bc']]); R(g, x + lean, 182 - hh - 1, 1, 1, '#d8d0bc'); R(g, x + 1 + lean, 182 - hh, 1, hh, '#a49c8a');
    }
    R(g, 372, 172, 94, 1, '#8a8270'); R(g, 372, 177, 94, 1, '#8a8270');
    // l'arche de l'entrée
    O(g, 470, 188, [[0, -60, 4, 60, '#5a3a22'], [60, -60, 4, 60, '#5a3a22']]);
    R(g, 470, 128, 1, 60, '#7a5232'); R(g, 530, 128, 1, 60, '#7a5232');
    O(g, 464, 128, [[0, 0, 76, 12, '#8a6038']]);
    R(g, 464, 128, 76, 1, '#b08458'); R(g, 464, 139, 76, 1, '#5a3a22');
    canvasText(g, 'BOOT HILL', 502, 130, { color: '#f0dca0', shadow: '#3a2214' });
    // clôture brisée au premier plan : piquets gris, une traverse tombée
    for (let x = 4; x < 160; x += 14) if (hsh(x, 3) < 0.8) { const hh = 18 + (x % 3) * 2; O(g, x, 197, [[0, -hh, 3, hh, '#7a6a58']]); R(g, x, 197 - hh, 1, hh, '#a49480'); R(g, x + 2, 197 - hh, 1, hh, '#54483a'); }
    R(g, 0, 182, 112, 1, OUT); R(g, 0, 183, 112, 2, '#8a7a66'); R(g, 0, 183, 112, 1, '#a89884');
    O(g, 112, 200, [[0, -2, 44, 2, '#7a6a58']]);
    const Q = new Pix(g);
    sow(Q, { y0: 196, y1: H + 4, n: 30, seed: 84, make: (d, s) => [tuft(6 + Math.round(d * 6), s, P.herbe), boulder(3 + Math.round(d * 3), s, PIERRE), bush(3, s, P.sauge, hex('#2a2a1e'))][s % 3] });
    Q.put();
  },
  anim(ctx, t, fx) {
    S.vulture(ctx, Math.round(150 + Math.sin(t / 2000) * 80), Math.round(60 + Math.cos(t / 1700) * 8), t);
    S.vulture(ctx, Math.round(380 + Math.cos(t / 2300) * 60), Math.round(48 + Math.sin(t / 1500) * 6), t + 120);
    if (fx.has('vent')) S.tumbleweed(ctx, Math.round(560 - ((t * 0.08) % 640)), Math.round(190 - Math.abs(Math.sin(t / 160)) * 6), t);
  },
};
