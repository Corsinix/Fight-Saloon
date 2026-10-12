// Vue isométrique de « La ville » : la carte partagée (losanges de 32 × 16 pixels du jeu), sa caméra, ses filtres.
//   - Le sol est dessiné en pixels fins (2 par pixel du jeu, comme La piste) par morceaux de 8 × 8 cases : le terrain
//     de chaque biome (sable, terre rouge, herbe, herbe sèche, sous-bois, vase, roche, croûte de sel) avec ses détails
//     (touffes, fleurs, cailloux, fissures, aiguilles, flaques), des frontières de biome irrégulières, les rives, les
//     champs, les routes, la voie ferrée, les filons, les frontières des territoires et le bord de la maquette ; puis
//     ce qui se dresse sur les cases (arbres du biome, cactus, buissons, rochers, mesas, montagnes), d'arrière en avant.
//     Un morceau n'est refait que si ses cases ont changé ; les morceaux vivent dans un cache à mémoire bornée.
//   - Les filtres (ressources, services, crime, bonheur, territoire…) sont des voiles de losanges teintés, par morceau.
//   - À chaque image : les morceaux visibles, puis les objets triés en profondeur (bâtiments, arbres qui passent devant
//     un bâtiment, habitants, train, fumées), le fantôme de placement, et la lumière de l'heure (aube, nuit…).
// Coordonnées « monde » : pixels du jeu au zoom 1 ; la case (i, j) a son coin du haut en ((i - j) × 16 + OX, (i + j) × 8 + OY).
import * as S from './sprites.js';
import * as I from './isokit.js';
import * as K from './villekit.js';
import { buildingSprite, siteSprite, treeSprite } from './villeart.js';
import { PLAYER_COLORS } from './worlds.js';

const { hex, tone, dither, hsh, dTop, dBot } = I;
const { TER, BIO, BUILDINGS: BD } = K;
const KF = I.K; // pixels fins par pixel du jeu
const CH = 8; // cases par côté d'un morceau de sol
const HTOP = 44; // ce qui dépasse au-dessus du sol (arbres, montagnes)
const DEPTH = 12; // épaisseur de la maquette sous le bord de la carte
const MAX_CHUNKS = 64; // morceaux gardés en mémoire
const BUILD_PER_FRAME = 4; // morceaux dessinés au plus par image (le reste à l'image suivante)
const BUILD_MS = 5; // budget partagé entre les morceaux, interrompus entre deux cases

// ------------------------------------------------------------ couleurs du sol, par biome
const R = (s) => s.split(' ').map(hex);
const GROUND = [
  R('a8804e b8905a c8a070 d8b888 e3c697 ecd6a8'), // désert
  R('8a4a2a 9a5a34 aa6a40 b87a4c c88a5a d49a68'), // canyon
  R('4a6228 5a7230 6a8238 7a9442 8aa44c 9ab45a'), // prairie
  R('7a7038 8a7c40 9a884a aa9656 b8a462 c4b06e'), // collines (herbe sèche)
  R('283e1c 32481f 3c5424 4a6230 587038 668040'), // forêt (sous-bois)
  R('3a4228 485030 56603a 646e44 707a4a 7c8652'), // marais
  R('5a5248 6a6258 7a7266 8a8274 9a9282 aaa294'), // montagne
  R('b8b0a0 c8c0b0 d8d0c0 e4dcce eee8dc f6f2ea'), // salines
];
const MESA_RED = R('6a3220 7a3a24 8a4a2a a85a3a b86a44 c87a50 d48a5c');
const MESA_ORANGE = R('7a4a2a 8a5a34 a8703c b8804a c8905a d8a46a e0b07a');
const ROCK_GREY = R('4a4440 5a544e 6a645c 7a746a 8a8478 9a9488 aaa498');
// bruit de valeur lissé (pour les frontières, les rives, le relief)
function sn(x, y, s) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const a = hsh(xi, yi, s), b = hsh(xi + 1, yi, s), c = hsh(xi, yi + 1, s), d = hsh(xi + 1, yi + 1, s);
  const uu = xf * xf * (3 - 2 * xf), vv = yf * yf * (3 - 2 * yf);
  return a + (b - a) * uu + (c - a) * vv + (a - b - c + d) * uu * vv;
}
const EAU = R('1e4a78 245484 2e5e90 3a6aa0 4a7ab8 6a9ad0 9ac0e0');
const VASE = R('3a3a24 44442a 4e5032 5a5c3a');
const CHEMIN = R('7a5a38 8a6a44 9a7850 a8865c b89468');
const PAVE = R('6a6058 7a7068 8a8078 9a9088 aaa098');
const BALLAST = R('5a5048 6a6058 7a7068 8a8078');
const CROP = {
  mais: { soil: R('4a3020 5a3a22 6a4428'), a: R('4a7a28 5a8a30 6a9a38 7aaa40'), tip: hex('#d8c050') },
  ble: { soil: R('7a5a30 8a6a3a 9a7840'), a: R('b8983a c8a848 d8b858 e8c868'), tip: hex('#f0d880') },
  coton: { soil: R('4a3020 5a3a22 6a4428'), a: R('3a6a2a 4a7a32 5a8a3a 6a9a44'), tip: hex('#f4f0e8') },
  tabac: { soil: R('3a2414 4a2e1a 5a3a22'), a: R('2a5a22 3a6a2a 4a7a32 5a8a3a'), tip: hex('#6a9a44') },
  legumes: { soil: R('4a2e1a 5a3a22 6a4428'), a: R('3a7a32 4a8a3a 5a9a44 6aaa4c'), tip: hex('#c2643e') },
  fruits: { soil: R('5a7230 6a8238 7a9442'), a: R('2a5a22 3a6a2a 4a7a32'), tip: hex('#e0844a') },
};
const DEP_COL = ['', '#f8d070', '#e8e8f8', '#e0844a', '#1a1414', '#d8d0c0', '#141018', '#b06048', '#ffffff', '#c87048'];
const STEEL = hex('#a8a8b8'), STEEL_D = hex('#6a6a78'), SLEEPER = hex('#4a3020'), OUT = hex('#1a0f0a');
const PCOL = PLAYER_COLORS.map(hex);
// rampe d'un biome, rangée entière (n niveaux) -> niveau 0..1
const lev = (R2, l, x, y) => dither(R2, l, x, y);

export class IsoView {
  constructor(world, me = 0) {
    this.zoom = 0.5;
    this.cam = { x: 0, y: 0 };
    this.filter = null;
    this.filterVer = 0;
    this.fx = []; // trains, fumées
    this.folk = null; // les habitants animés (villefolk.js), branchés par la scène
    this.hour = 10; // l'heure du jour (0-24), pour la lumière
    this.setWorld(world, me);
  }

  setWorld(world, me = this.me) {
    this.invalidate();
    this.fx.length = 0;
    this.w = world;
    this.me = me;
    this.n = world.n;
    this.OX = world.n * 16;
    this.OY = HTOP;
    this.nc = Math.ceil(world.n / CH);
    this.chunks = new Map(); // "ci:cj" -> { cv, sig }, dans l'ordre d'usage (le plus ancien en premier)
    this.overlays = new Map();
    this.chunkJobs = new Map();
    this.folk?.setWorld?.(world);
  }
  invalidate() {
    for (const cache of [this.chunks, this.overlays]) {
      if (!cache) continue;
      for (const c of cache.values()) S.freeCanvas(c.cv);
      cache.clear();
    }
    this.chunkJobs?.clear();
  }
  get worldW() { return this.n * 32; }
  get worldH() { return this.n * 16 + HTOP + DEPTH; }

  // ---------------------------------------------------------- caméra
  center(tx, ty, vw, vh) {
    const [x, y] = this.tileTop(tx, ty);
    this.cam.x = x - vw / (2 * this.zoom);
    this.cam.y = y - vh / (2 * this.zoom);
  }
  clampCam(vw, vh) {
    const mw = vw / this.zoom, mh = vh / this.zoom;
    this.cam.x = Math.max(-mw / 2, Math.min(this.worldW - mw / 2, this.cam.x));
    this.cam.y = Math.max(-mh / 2, Math.min(this.worldH - mh / 2, this.cam.y));
  }
  setZoom(z, px, py) {
    if (z === this.zoom) return;
    const wx = this.cam.x + px / this.zoom, wy = this.cam.y + py / this.zoom;
    this.zoom = z;
    this.cam.x = wx - px / z;
    this.cam.y = wy - py / z;
  }
  tileTop(i, j) { return [(i - j) * 16 + this.OX, (i + j) * 8 + this.OY]; }
  toTile(px, py) {
    const wx = this.cam.x + px / this.zoom - this.OX, wy = this.cam.y + py / this.zoom - this.OY;
    const a = wx / 16, b = wy / 8;
    return [(a + b) / 2, (b - a) / 2];
  }
  toView(wx, wy) { return [Math.round((wx - this.cam.x) * this.zoom), Math.round((wy - this.cam.y) * this.zoom)]; }

  // la case, ou le bâtiment dont le dessin couvre ce point (le plus en avant)
  pick(px, py) {
    const [fi, fj] = this.toTile(px, py);
    const i = Math.floor(fi), j = Math.floor(fj);
    const w = this.w;
    const wx = this.cam.x + px / this.zoom, wy = this.cam.y + py / this.zoom;
    let best = null, bk = -1;
    for (const b of w.B) {
      const [bw, bd] = w.dimsOf(b);
      if (Math.abs(b.x - i) > 6 || Math.abs(b.y - j) > 6) continue;
      const s = this.spriteOf(b), k = s.k || 1;
      const left = (b.x - b.y - bd) * 16 + this.OX - s.ox / k, top = (b.x + b.y) * 8 + this.OY - s.oy / k;
      if (wx < left || wy < top || wx >= left + s.width / k || wy >= top + s.height / k) continue;
      if (!hitMask(s, Math.floor((wx - left) * k), Math.floor((wy - top) * k))) continue;
      const kk = b.x + bw + b.y + bd;
      if (kk > bk) { bk = kk; best = b; }
    }
    const tb = w.inMap(i, j) ? w.bAt(i, j) : null;
    if (tb && (!best || tb === best)) best = tb;
    return { x: i, y: j, b: best, in: w.inMap(i, j) };
  }

  spriteOf(b) {
    const def = BD[b.t];
    if (b.site > 0) return siteSprite(b.t, 1 - b.site / def.days, b.rot);
    return buildingSprite(b.t, b.id, b.rot, b.lvl || 1);
  }

  // ---------------------------------------------------------- empreinte d'un morceau (pour savoir s'il faut le refaire)
  sig(ci, cj) {
    const w = this.w, n = this.n;
    let h = 0x811c9dc5;
    // Les raccords de route et de territoire dépendent aussi des cases du morceau voisin.
    for (let j = Math.max(0, cj * CH - 1); j < Math.min(n, cj * CH + CH + 1); j++) for (let i = Math.max(0, ci * CH - 1); i < Math.min(n, ci * CH + CH + 1); i++) {
      const k = j * n + i;
      const f = w.fieldOf[k];
      const v = w.road[k] | ((w.owner[k] + 1) << 2) | ((w.wood[k] > 0 ? 1 + (w.wood[k] > 55) : 0) << 6) | (w.dep[k] << 8) | ((w.tileB[k] >= 0) << 12)
        | ((f >= 0 ? (FIELD_ID[w.byId.get(f)?.t] || 0) : 0) << 13) | ((w.reveal[k] >> this.me & 1) << 17) | ((w.depQ[k] > 0) << 18);
      h ^= v; h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
  }

  // ---------------------------------------------------------- dessin d'un morceau de sol
  chunk(ci, cj, budget) {
    const key = ci + ':' + cj;
    const c = this.chunks.get(key);
    if (c) { this.chunks.delete(key); this.chunks.set(key, c); }
    if (budget.n <= 0 || performance.now() >= budget.deadline) return c?.cv || null;
    const sig = this.sig(ci, cj);
    if (c && c.sig === sig) { this.chunkJobs.delete(key); return c.cv; }
    let job = this.chunkJobs.get(key);
    if (!job || job.sig !== sig) {
      job = { sig, steps: this.paintChunkSteps(ci, cj) };
      this.chunkJobs.set(key, job);
    }
    let result;
    do {
      result = job.steps.next();
      if (result.done) break;
    } while (budget.deadline == null || performance.now() < budget.deadline);
    if (!result.done) return c?.cv || null;
    budget.n--;
    this.chunkJobs.delete(key);
    if (c) S.freeCanvas(c.cv);
    const cv = result.value;
    this.chunks.set(key, { cv, sig });
    if (!budget.deferEviction) this.trimChunks();
    return cv;
  }

  trimChunks() {
    while (this.chunks.size > MAX_CHUNKS) {
      const [key, entry] = this.chunks.entries().next().value;
      S.freeCanvas(entry.cv); this.chunks.delete(key);
    }
  }

  paintChunk(ci, cj) {
    const steps = this.paintChunkSteps(ci, cj);
    let result;
    do { result = steps.next(); } while (!result.done);
    return result.value;
  }

  *paintChunkSteps(ci, cj) {
    const n = this.n;
    const W = CH * 32 * KF, Hh = (CH * 16 + HTOP + DEPTH) * KF;
    const px = new I.Pix(W, Hh);
    const i0 = ci * CH, j0 = cj * CH;
    const tall = [];
    for (let s = 0; s < 2 * CH - 1; s++) for (let li = 0; li < CH; li++) {
      const lj = s - li;
      if (lj < 0 || lj >= CH) continue;
      const i = i0 + li, j = j0 + lj;
      if (i >= n || j >= n) continue;
      const ox = (li - lj + CH - 1) * 16 * KF, oy = (li * 8 + lj * 8 + HTOP) * KF;
      this.paintTile(px, ox, oy, i, j);
      if (this.tallOf(i, j).length) tall.push([i, j, ox, oy]);
      yield;
    }
    yield* this.reliefSteps(px, i0, j0);
    const cv = px.canvas();
    const g = cv.getContext('2d');
    // Les sprites peuvent avoir été évincés du cache pendant une interruption.
    for (const [i, j, ox, oy] of tall) for (const t of this.tallOf(i, j)) g.drawImage(t.s, ox - t.s.ox + t.dx * KF, oy - t.s.oy + t.dy * KF);
    return cv;
  }

  // Le relief d'un morceau (mesas, rochers, montagnes) : un seul champ de hauteur continu sur tout le morceau, rastérisé
  // dans le sol avec un sprite de la taille du morceau ; strates des mesas, roche et neige des sommets ; un contour d'un
  // pixel fin tout autour de la silhouette (pas entre les cases : une mesa est une seule masse).
  *reliefSteps(px, i0, j0) {
    const w = this.w, n = this.n, map = w.map;
    const isR = (t) => t === TER.MESA || t === TER.MOUNT;
    let any = false;
    for (let lj = 0; lj < CH && !any; lj++) for (let li = 0; li < CH; li++) { const i = i0 + li, j = j0 + lj; if (i < n && j < n && isR(map.ter[j * n + i])) { any = true; break; } }
    if (!any) return;
    const sp = new I.Sprite(CH, CH, HTOP, 0, KF);
    sp.px = px; sp.mask = new Uint8Array(px.w * px.h); sp.zb = new Float32Array(px.w * px.h).fill(-1e9);
    const tileOf = (u, v) => { const i = i0 + Math.floor(u / 16), j = j0 + Math.floor(v / 16); return i < n && j < n ? j * n + i : -1; };
    const Hf = (u, v) => {
      const k = tileOf(u, v);
      if (k < 0 || !isR(map.ter[k])) return -1e9;
      const gu = i0 * 16 + u, gv = j0 * 16 + v;
      if (map.ter[k] === TER.MESA) return 11 + 3 * hsh(k, 0, 7) + (sn(gu / 3, gv / 3, 5) - 0.5) * 1.4;
      return 14 + 17 * sn(gu / 22, gv / 22, 11) + 7 * sn(gu / 7, gv / 7, 13);
    };
    yield* sp.volSteps(0, 0, CH * 16, CH * 16, Hf, (u, v, z, f, s, U, V, Z) => {
      const k = tileOf(u + 0.5, v + 0.5);
      const b = k >= 0 ? map.bio[k] : 0, mount = k >= 0 && map.ter[k] === TER.MOUNT;
      const gu = (i0 * 16) * KF + U, gv = (j0 * 16) * KF + V;
      const Rr = b === BIO.CANYON ? MESA_RED : b === BIO.DESERT || b === BIO.SALINES ? MESA_ORANGE : ROCK_GREY;
      if (mount && b !== BIO.CANYON && z > 26 + sn(gu / 9, gv / 9, 17) * 5) return f === 2 ? hex('#c8ccd8') : f === 1 ? hex('#e4e8f0') : hex('#f2f4f8');
      if (f === 0) return dither(Rr, 0.66 + (sn(gu / 5, gv / 5, 3) - 0.5) * 0.35 + (hsh(gu, gv, 4) < 0.04 ? -0.25 : 0), gu, gv);
      const T = f === 1 ? gu : gv;
      const band = !mount && Math.floor((Z + (sn(T / 12, 0, 9) * 4 | 0)) / 5) % 2 ? 0.1 : -0.05;
      return dither(Rr, (f === 1 ? 0.5 : 0.18) + band + (hsh(T >> 2, Z >> 1, 6) - 0.5) * 0.18 + (hsh(T, Z, 8) < 0.03 ? -0.25 : 0), T, Z);
    });
    // contour de la silhouette
    const { w: W, h: Hh, d } = px, zb = sp.zb;
    for (let y = 1; y < Hh - 1; y++) for (let x = 1; x < W - 1; x++) {
      const q = y * W + x;
      if (zb[q] > -1e8) continue;
      if (zb[q - 1] > -1e8 || zb[q + 1] > -1e8 || zb[q - W] > -1e8) d[q] = OUT;
    }
  }

  // ce qui se dresse sur une case, selon le biome : arbres, cactus, buissons, rochers (le relief est à part)
  tallOf(i, j) {
    const w = this.w, n = this.n, k = j * n + i, t = w.map.ter[k], b = w.map.bio[k];
    if (w.tileB[k] >= 0 || w.road[k] || w.map.rail[k] || w.fieldOf[k] >= 0) return NONE;
    const r = hsh(i, j, 77), r2 = hsh(i, j, 91);
    if (t === TER.MESA || t === TER.MOUNT) return NONE;
    if (t === TER.FOREST && w.wood[k] > 0) {
      const kind = b === BIO.MARAIS ? 'cypres' : b === BIO.MONTAGNE || (b === BIO.FORET && r2 < 0.6) ? 'pin' : 'feuillu';
      const s = treeSprite(kind, (r * 16) | 0);
      return w.wood[k] > 55 ? [offs(s, -4, -2), offs(treeSprite(kind, (r2 * 16) | 0), 4, 1)] : [T0(s)];
    }
    if (t === TER.MARSH) return r < 0.2 ? [T0(treeSprite('cypres', (r * 40) | 0))] : r < 0.45 ? [T0(treeSprite('buisson', (r * 40) | 0))] : NONE;
    if (t === TER.DESERT) {
      if (b === BIO.SALINES) return r < 0.02 ? [T0(treeSprite('mort', (r * 99) | 0))] : NONE;
      if (r < (b === BIO.CANYON ? 0.03 : 0.05)) return [T0(treeSprite('cactus', (r * 80) | 0))];
      if (r > 0.95) return [T0(rockSprite('caillou', (r * 400) | 0, b))];
      if (r2 < 0.06) return [T0(treeSprite('buisson', (r2 * 50) | 0))];
      return NONE;
    }
    if (t === TER.PRAIRIE) {
      if (r < (b === BIO.COLLINES ? 0.07 : 0.035)) return [T0(treeSprite(b === BIO.MONTAGNE ? 'pin' : 'feuillu', (r * 100) | 0))];
      if (r2 < (b === BIO.COLLINES ? 0.1 : 0.05)) return [T0(treeSprite('buisson', (r2 * 60) | 0))];
      if (b === BIO.COLLINES && r > 0.96) return [T0(rockSprite('caillou', (r * 400) | 0, b))];
    }
    return NONE;
  }

  // biome et terrain vus d'un pixel fin : les frontières sont irrégulières (on tire au bruit la case voisine)
  bioAt(fi, fj, gx, gy) {
    const n = this.n;
    const jx = (sn(gx / 9, gy / 5, 51) - 0.5) * 1.3 + (hsh(gx >> 1, gy, 53) - 0.5) * 0.12, jy = (sn(gx / 9, gy / 5, 52) - 0.5) * 1.3;
    const i = Math.max(0, Math.min(n - 1, Math.floor(fi + jx))), j = Math.max(0, Math.min(n - 1, Math.floor(fj + jy)));
    return j * n + i;
  }

  paintTile(px, ox, oy, i, j) {
    const w = this.w, n = this.n, k = j * n + i, map = w.map;
    const t = map.ter[k];
    const road = w.road[k], rail = map.rail[k];
    const f = w.fieldOf[k];
    const fb = f >= 0 ? w.byId.get(f) : null;
    const fres = fb ? BD[fb.t].prod.res : null;
    const own = this.w.solo ? -1 : w.owner[k];
    const nOwn = (di, dj) => { const a = i + di, b = j + dj; return a < 0 || b < 0 || a >= n || b >= n ? -2 : w.owner[b * n + a]; };
    const at = (di, dj, arr) => { const a = i + di, b = j + dj; return a >= 0 && b >= 0 && a < n && b < n ? arr[b * n + a] : 0; };
    const rd = (di, dj) => at(di, dj, w.road) > 0;
    const nb = road ? [rd(-1, 0), rd(1, 0), rd(0, -1), rd(0, 1)] : null;
    const edges = own >= 0 ? [nOwn(-1, 0) !== own, nOwn(1, 0) !== own, nOwn(0, -1) !== own, nOwn(0, 1) !== own] : null;
    const dep = w.dep[k] && w.depQ[k] > 0 && (w.dep[k] !== K.DEP.PETROLE || (w.reveal[k] >> this.me) & 1) ? w.dep[k] : 0;
    const water = t === TER.WATER;
    // rives : quelles voisines sont de l'eau ?
    const wet = (di, dj) => { const a = i + di, b = j + dj; return a >= 0 && b >= 0 && a < n && b < n && map.ter[b * n + a] === TER.WATER; };
    const shore = water ? null : [wet(-1, 0), wet(1, 0), wet(0, -1), wet(0, 1)];
    const anyShore = shore && shore.some(Boolean);
    const dw = map.dist[k];
    const TW2 = 32 * KF, HU = 16; // largeur fine d'une case ; unités par case
    for (let x = 0; x < TW2; x++) {
      const tp = dTop(x, 16 * KF, 16 * KF), bt = dBot(x, 16 * KF, 16 * KF);
      for (let y = tp; y <= bt; y++) {
        const gx = ox + x, gy = oy + y;
        const u = (y + 0.5) / KF + ((x + 0.5) / KF - 16) / 2, v = (y + 0.5) / KF - ((x + 0.5) / KF - 16) / 2; // 0..16
        let c;
        const nz = hsh(gx >> 2, gy >> 1, 3) * 0.3 + hsh(i, j, 9) * 0.12;
        if (water) {
          // l'eau : plus claire près des rives, des rides qui accrochent la lumière
          const edge = Math.min(u, v, HU - u, HU - v);
          const near = (wet(-1, 0) || u > 3) && (wet(1, 0) || u < 13) && (wet(0, -1) || v > 3) && (wet(0, 1) || v < 13) ? 0 : 1;
          let l = 0.3 + nz * 0.5 + (near && edge < 3 ? 0.25 : 0);
          if ((gx + 3 * gy + (hsh(gx >> 4, gy >> 3, 8) * 9 | 0)) % 17 === 0) l += 0.4;
          c = dither(EAU, l, gx, gy);
          const dl = Math.min(wet(-1, 0) ? 99 : u, wet(1, 0) ? 99 : HU - u, wet(0, -1) ? 99 : v, wet(0, 1) ? 99 : HU - v);
          const jit = 0.6 + sn(gx / 7, gy / 3.5, 61) * 2.2;
          if (dl < jit) c = dl > jit - 0.8 ? dither(VASE, 0.45 + nz, gx, gy) : dither(GROUND[BIO.DESERT], 0.45 + nz * 0.6, gx, gy);
        } else {
          const kb = this.bioAt(i + u / HU, j + v / HU, gx, gy);
          const b = map.bio[kb], tb = map.ter[kb];
          c = this.groundPx(b, tb === TER.WATER ? t : tb, gx, gy, nz, i, j);
          // la rive : sable mouillé le long de l'eau
          if (anyShore) {
            const ds = Math.min(shore[0] ? u : 99, shore[1] ? HU - u : 99, shore[2] ? v : 99, shore[3] ? HU - v : 99);
            const jit = sn(gx / 7, gy / 3.5, 62) * 1.8;
            if (ds < jit) c = dither(EAU, 0.4 + nz * 0.5, gx, gy);
            else if (ds < jit + 0.8) c = dither(VASE, 0.5 + nz, gx, gy);
            else if (ds < jit + 2.4 + hsh(gx >> 1, gy, 5)) c = dither(GROUND[BIO.DESERT], 0.45 + nz * 0.6, gx, gy);
          }
        }
        // champs : des rangs de cultures, au pixel fin
        if (fres) c = cropPx(fres, u, v, gx, gy, nz, c);
        // filon : des pierres qui brillent
        if (dep && !road && !fres) {
          const r = hsh(gx >> 1, gy >> 1, 21);
          if (r < 0.05) c = hex(DEP_COL[dep]);
          else if (r < 0.11) c = tone(hex('#6a5a4a'), (r - 0.08) * 4);
          else if (dep === K.DEP.SEL && r < 0.4) c = hex('#f0f0ea');
          else if (dep === K.DEP.ARGILE && r < 0.35) c = hex('#b8683a');
          else if (dep === K.DEP.PETROLE && r < 0.2) c = hex('#2a2028');
        }
        // voie ferrée (d'ouest en est, le long de u)
        if (rail) {
          if (v > 3 && v < 13) c = dither(BALLAST, 0.4 + nz, gx, gy);
          if (v > 4 && v < 12 && Math.floor(u * 2) % 8 < 2) c = SLEEPER;
          if (Math.abs(v - 5.5) < 0.5 || Math.abs(v - 10.5) < 0.5) c = (Math.abs(v - 5.5) < 0.25 || Math.abs(v - 10.5) < 0.25) ? STEEL : STEEL_D;
        }
        // route : un carré au centre, et des bras vers les cases voisines qui ont une route ; ornières et bas-côtés
        if (road && !water) {
          const inC = Math.abs(u - 8) < 5 && Math.abs(v - 8) < 5;
          const armU = (nb[0] && u < 8) || (nb[1] && u >= 8), armV = (nb[2] && v < 8) || (nb[3] && v >= 8);
          const onU = armU && Math.abs(v - 8) < 5, onV = armV && Math.abs(u - 8) < 5;
          if (inC || onU || onV) {
            const across = onU && !onV ? Math.abs(v - 8) : onV && !onU ? Math.abs(u - 8) : Math.min(Math.abs(u - 8), Math.abs(v - 8));
            if (road === 2) {
              c = dither(PAVE, 0.45 + nz * 0.6, gx, gy);
              if ((Math.floor(u * 1.5) + Math.floor(v * 1.5)) % 3 === 0 || Math.floor(u * 1.5) % 4 === 0) c = tone(c, -0.18);
              if (across > 4.3) c = hex('#8a8078');
            } else {
              c = dither(CHEMIN, 0.45 + nz * 0.7, gx, gy);
              if (Math.abs(across - 2.2) < 0.45) c = tone(c, -0.22); // ornières
              if (across > 4.4) c = tone(c, 0.12);
              if (hsh(gx, gy, 31) < 0.03) c = tone(c, -0.3);
            }
          }
        }
        if (road && water && (Math.abs(v - 8) < 5 || Math.abs(u - 8) < 5)) {
          // pont : des planches et deux garde-corps
          c = Math.floor((u + v) * 1.2) % 2 ? hex('#8a6040') : hex('#6a4428');
          if (Math.abs(Math.abs(v - 8) - 4.6) < 0.4 || Math.abs(Math.abs(u - 8) - 4.6) < 0.4) c = hex('#4a2e1a');
        }
        // frontière du territoire (à plusieurs) : tirets de la couleur du maire
        if (edges && ((edges[0] && u < 1) || (edges[1] && u > 15) || (edges[2] && v < 1) || (edges[3] && v > 15))) {
          if (Math.floor((u + v) * 0.8) % 3 !== 0) c = PCOL[own % PCOL.length];
        }
        px.set(gx, gy, c);
      }
      // bord de la maquette : l'épaisseur du terrain sous les cases du bord, en strates
      const edgeR = i === n - 1 && x >= TW2 / 2, edgeL = j === n - 1 && x < TW2 / 2;
      if (edgeR || edgeL) {
        for (let d = 1; d <= DEPTH * KF; d++) {
          const gx = ox + x, gy = oy + bt + d;
          const strata = Math.floor((d + (hsh(i + j, d >> 3, 4) * 3 | 0)) / 7) % 3;
          const base = water ? EAU[1] : [hex('#7a5232'), hex('#8a6040'), hex('#6a4428')][strata];
          px.set(gx, gy, d >= DEPTH * KF - 1 ? OUT : edgeR ? tone(base, -0.3) : base);
        }
      }
    }
    void dw;
  }

  // un pixel de terrain d'un biome, avec ses détails
  groundPx(b, t, gx, gy, nz, i, j) {
    const G = GROUND[b];
    let l = 0.35 + nz;
    const h1 = hsh(gx, gy, 13), h2 = hsh(gx >> 1, gy >> 1, 17);
    switch (b) {
      case BIO.PRAIRIE: case BIO.COLLINES: {
        if (t === TER.DESERT) return dither(GROUND[b === BIO.COLLINES ? BIO.DESERT : BIO.COLLINES], l, gx, gy);
        // touffes d'herbe : un trait sombre et sa pointe claire
        if (h2 < 0.08) l -= 0.3; else if (hsh(gx, gy + 1, 17) < 0.06) l += 0.35;
        if (b === BIO.PRAIRIE && h1 < 0.006) return hex(['#f0d060', '#e8e8f0', '#d07090'][(h1 * 500) | 0 % 3] || '#f0d060');
        break;
      }
      case BIO.FORET: if (h2 < 0.1) l -= 0.25; else if (h1 < 0.03) return hex('#7a5a30'); break; // aiguilles, brindilles
      case BIO.MARAIS: {
        if (t === TER.MARSH) { const p = hsh(gx >> 3, gy >> 2, 23); if (p < 0.45) return dither(EAU, 0.25 + h1 * 0.3, gx, gy); }
        if (h2 < 0.12) l -= 0.25;
        break;
      }
      case BIO.DESERT: case BIO.CANYON: {
        // rides de sable, cailloux
        if (((gx + 2 * gy + (hsh(gx >> 4, gy >> 4, 3) * 8 | 0)) % 13) === 0) l += 0.18;
        if (h1 < 0.012) return tone(G[1], -0.35);
        break;
      }
      case BIO.MONTAGNE: if (h2 < 0.14) l -= 0.3; else if (h1 < 0.05) l += 0.3; break;
      case BIO.SALINES: {
        // croûte de sel craquelée
        const cell = hsh(gx >> 3, gy >> 2, 29);
        if ((gx + (cell * 7 | 0)) % 15 === 0 || (gy + (cell * 5 | 0)) % 10 === 0) return tone(G[3], -0.12);
        l = 0.55 + nz * 0.5;
        break;
      }
    }
    return dither(G, l, gx, gy);
  }

  // ---------------------------------------------------------- filtres
  filterValue(f, i, j) {
    const w = this.w, n = this.n, k = j * n + i, me = this.me;
    if (f.group === 'res') {
      if (f.dep === K.DEP.PETROLE) return w.dep[k] === K.DEP.PETROLE && (w.reveal[k] >> me) & 1 ? Math.min(100, w.depQ[k] / 12) : null;
      if (f.dep) return w.dep[k] === f.dep && w.depQ[k] ? Math.min(100, w.depQ[k] / 8) : null;
      const t = w.map.ter[k];
      if (t === TER.WATER || t === TER.MESA || t === TER.MOUNT || t === TER.MARSH) return f.id === 'eau' && (t === TER.WATER || t === TER.MARSH) ? 100 : null;
      return w.resource(f.id, k, me);
    }
    if (f.id === 'territoire') return w.owner[k] >= 0 ? w.owner[k] : null;
    if (w.owner[k] !== me) return null;
    if (f.need != null) return w.coverAt(me, K.NEEDS[f.need].id, i, j);
    if (f.id === 'valeur') return w.landValue(i, j);
    if (f.id === 'education') {
      let best = 0;
      for (const b of w.B) { const sc = BD[b.t].school; if (sc && b.p === me && !b.site && w.near(b, i, j, sc.level === 2 ? 14 : 10)) best = Math.max(best, sc.level * 50); }
      return best;
    }
    if (f.id === 'crime') return Math.max(0, w.towns[me].stat.crime - w.coverAt(me, 'loi', i, j) * 0.6);
    if (f.id === 'bonheur') {
      const b = w.bAt(i, j);
      if (!b || !BD[b.t].house || b.p !== me) return null;
      let s = 0, c = 0;
      for (const p of w.C) if (p.home === b.id) { s += p.hap; c++; }
      return c ? s / c : null;
    }
    return null;
  }

  overlay(ci, cj) {
    const f = K.FILTERS.find((x) => x.id === this.filter);
    if (!f) return null;
    const key = ci + ':' + cj;
    const o = this.overlays.get(key);
    if (o && o.id === f.id && o.ver === this.filterVer) {
      this.overlays.delete(key); this.overlays.set(key, o);
      return o.cv;
    }
    if (o) S.freeCanvas(o.cv);
    const n = this.n;
    const px = new I.Pix(CH * 32, CH * 16 + HTOP + DEPTH);
    const ramp = f.ramp ? f.ramp.map(hex) : null;
    for (let lj = 0; lj < CH; lj++) for (let li = 0; li < CH; li++) {
      const i = ci * CH + li, j = cj * CH + lj;
      if (i >= n || j >= n) continue;
      const val = this.filterValue(f, i, j);
      if (val == null) continue;
      let c = ramp ? ramp[Math.max(0, Math.min(ramp.length - 1, Math.floor((val / 100) * ramp.length)))] : PCOL[val % PCOL.length];
      c = (c & 0x00ffffff) | (150 << 24);
      const ox = (li - lj + CH - 1) * 16, oy = (li + lj) * 8 + HTOP;
      I.diamond(px, ox, oy, 16, 16, (x, y) => ((x + y) % 2 === 0 || !ramp ? c : (c & 0x00ffffff) | (110 << 24)));
    }
    const cv = px.canvas();
    this.overlays.delete(key);
    this.overlays.set(key, { cv, ver: this.filterVer, id: f.id });
    while (this.overlays.size > MAX_CHUNKS) {
      const [old, entry] = this.overlays.entries().next().value;
      S.freeCanvas(entry.cv); this.overlays.delete(old);
    }
    return cv;
  }

  // ---------------------------------------------------------- animation (train, fumées)
  update(dt, now, speed = 1) {
    const w = this.w;
    for (const e of this.fx) e.t += dt;
    this.fx = this.fx.filter((e) => e.t < e.len);
    if (now - (this.lastSmoke || 0) > 260) {
      this.lastSmoke = now;
      for (const b of w.B) {
        if (b.site) continue;
        const def = BD[b.t];
        if (b.fire) this.fx.push({ k: 'smoke', b: b.id, t: 0, len: 2400, dx: Math.random() * 10 - 5, fire: true });
        else if ((def.conv || def.prod?.res === 'dep') && b.eff > 20 && Math.random() < 0.35) this.fx.push({ k: 'smoke', b: b.id, t: 0, len: 2600, dx: Math.random() * 6 - 3 });
      }
      if (this.fx.length > 240) this.fx.splice(0, this.fx.length - 240);
    }
    this.folk?.update(dt, speed, now);
  }
  // un train qui traverse la carte et s'arrête à la gare de p
  train(p) {
    const g = this.w.B.find((b) => b.p === p && b.t === 'gare' && !b.site);
    if (!g) return;
    this.fx.push({ k: 'train', stop: g.x + 1, t: 0, len: 16000 });
  }

  // ---------------------------------------------------------- dessin de toute la vue
  // g : contexte déjà placé (0, 0 = coin haut-gauche de la vue) ; vw × vh : taille de la vue en pixels du jeu
  draw(g, vw, vh, now, o = {}) {
    const w = this.w, z = this.zoom;
    if (w.dirty) w.refresh();
    g.fillStyle = '#2a1e16';
    g.fillRect(0, 0, vw, vh);
    const vis = [];
    for (let cj = 0; cj < this.nc; cj++) for (let ci = 0; ci < this.nc; ci++) {
      const wx = (ci * CH - cj * CH - CH) * 16 + this.OX, wy = (ci + cj) * CH * 8 + this.OY - HTOP;
      const [sx, sy] = this.toView(wx, wy);
      if (sx > vw || sy > vh || sx + CH * 32 * z < 0 || sy + (CH * 16 + HTOP + DEPTH) * z < 0) continue;
      vis.push([ci, cj, sx, sy]);
    }
    vis.sort((a, b) => a[0] + a[1] - b[0] - b[1] || a[0] - b[0]);
    // les morceaux du centre de la vue d'abord (s'il faut en dessiner beaucoup, ils viennent en premier)
    const budget = { n: o.budget ?? BUILD_PER_FRAME, deadline: o.budget == null ? performance.now() + BUILD_MS : Infinity, deferEviction: true };
    const order = [...vis].sort((a, b) => Math.hypot(a[2] - vw / 2, a[3] - vh / 2) - Math.hypot(b[2] - vw / 2, b[3] - vh / 2));
    const got = new Map();
    for (const [ci, cj] of order) got.set(ci + ':' + cj, this.chunk(ci, cj, budget));
    for (const key of this.chunkJobs.keys()) if (!got.has(key)) this.chunkJobs.delete(key);
    this.pending = this.chunkJobs.size > 0 || budget.n <= 0 || performance.now() >= budget.deadline;
    for (const [ci, cj, sx, sy] of vis) {
      const cv = got.get(ci + ':' + cj);
      if (!cv) continue;
      g.drawImage(cv, sx, sy, Math.round((cv.width / KF) * z), Math.round((cv.height / KF) * z));
    }
    // L'atelier peut montrer plus de morceaux que le cache : les libérer après leur copie.
    this.trimChunks();
    if (this.filter) {
      for (const [ci, cj, sx, sy] of vis) {
        const ov = this.overlay(ci, cj);
        if (ov) g.drawImage(ov, sx, sy, Math.round(ov.width * z), Math.round(ov.height * z));
      }
    }
    if (o.radius) this.drawRadius(g, o.radius);
    if (o.sel) this.drawFoot(g, o.sel.x, o.sel.y, ...w.dimsOf(o.sel), '#f8d070');
    if (o.hover && !o.ghost) this.drawFoot(g, o.hover.x, o.hover.y, 1, 1, '#fdf6e0', true);
    if (o.roadPath) for (const [x, y, ok] of o.roadPath) this.fillTile(g, x, y, ok ? 'rgba(184,224,112,0.55)' : 'rgba(240,112,90,0.55)');
    // objets triés en profondeur
    const objs = [];
    const [ti0, tj0] = this.toTile(0, 0), [ti1, tj1] = this.toTile(vw, vh), [ti2, tj2] = this.toTile(vw, 0), [ti3, tj3] = this.toTile(0, vh);
    const minS = Math.floor(ti0 + tj0) - 3, maxS = Math.ceil(ti1 + tj1) + 6, minD = Math.floor(ti3 - tj3) - 4, maxD = Math.ceil(ti2 - tj2) + 4;
    const visible = (i, j) => i + j >= minS && i + j <= maxS && i - j >= minD && i - j <= maxD;
    this.visible = visible;
    const front = new Set();
    for (const b of w.B) {
      const [bw, bd] = w.dimsOf(b);
      if (!visible(b.x, b.y) && !visible(b.x + bw - 1, b.y + bd - 1)) continue;
      objs.push({ d: b.x + bw - 1 + b.y + bd - 1 + 0.5, x: b.x, b });
      for (let j = b.y; j <= b.y + bd + 2; j++) for (let i = b.x; i <= b.x + bw + 2; i++) {
        if ((i < b.x + bw && j < b.y + bd) || !w.inMap(i, j)) continue;
        const key = j * this.n + i;
        if (front.has(key)) continue;
        const ts = this.tallOf(i, j);
        if (ts.length) { front.add(key); objs.push({ d: i + j + 0.6, x: i, tall: ts, i, j }); }
      }
    }
    if (this.folk) for (const a of this.folk.outside()) { if (visible(a.fi, a.fj)) objs.push({ d: a.fi + a.fj + 0.55, x: a.fi, folk: a }); }
    for (const e of this.fx) if (e.k === 'train') objs.push({ d: 1e5, x: 0, train: e });
    objs.sort((a, b) => a.d - b.d || a.x - b.x);
    for (const ob of objs) {
      if (ob.b) this.drawBuilding(g, ob.b, now, o);
      else if (ob.tall) { const [wx, wy] = this.tileTop(ob.i, ob.j); for (const t of ob.tall) this.blit(g, t.s, wx - 16 + t.dx, wy + t.dy); }
      else if (ob.folk) this.folk.draw(g, this, ob.folk, now);
      else if (ob.train) this.drawTrain(g, ob.train);
    }
    for (const e of this.fx) if (e.k === 'smoke') this.drawSmoke(g, e);
    if (o.ghost) this.drawGhost(g, o.ghost);
    if (o.pending) for (const p of o.pending) this.drawGhost(g, { ...p, ok: true }, 0.45);
    this.drawLight(g, vw, vh);
  }

  // la lumière de l'heure : aube rosée, midi franc, crépuscule orangé, nuit bleue
  drawLight(g, vw, vh) {
    const h = this.hour;
    let col = null, a = 0;
    if (h < 5 || h >= 21) { col = '20,24,64'; a = 0.38; }
    else if (h < 7) { col = h < 6 ? '40,30,80' : '240,150,120'; a = h < 6 ? 0.28 : 0.12; }
    else if (h >= 18.5) { col = h < 20 ? '240,130,60' : '60,40,90'; a = h < 20 ? 0.14 : 0.26; }
    if (!col) return;
    g.fillStyle = `rgba(${col},${a})`;
    g.fillRect(0, 0, vw, vh);
  }

  blit(g, s, wx, wy) {
    const k = s.k || 1, z = this.zoom;
    const [sx, sy] = this.toView(wx - s.ox / k, wy - s.oy / k);
    g.drawImage(s, sx, sy, Math.round((s.width / k) * z), Math.round((s.height / k) * z));
  }

  drawBuilding(g, b, now, o) {
    const w = this.w, [bw, bd] = w.dimsOf(b);
    const s = this.spriteOf(b), k = s.k || 1;
    const wx = (b.x - b.y - bd) * 16 + this.OX, wy = (b.x + b.y) * 8 + this.OY;
    this.blit(g, s, wx, wy);
    // de nuit, les fenêtres des maisons et des saloons s'allument
    if (this.hour >= 19.5 || this.hour < 6) {
      const def = BD[b.t];
      if ((def.house || def.svc) && !b.site && (b.id * 7) % 5 !== 0) {
        const [sx, sy] = this.toView(wx + (bw + bd) * 8 - 4, wy - s.oy / k * 0.35);
        g.fillStyle = 'rgba(248,208,112,0.85)';
        const z = this.zoom;
        g.fillRect(sx, sy, Math.max(1, Math.round(2 * z)), Math.max(1, Math.round(2 * z)));
        g.fillRect(sx + Math.round(6 * z), sy + Math.round(3 * z), Math.max(1, Math.round(2 * z)), Math.max(1, Math.round(2 * z)));
      }
    }
    if (b.fire) {
      const fl = flameFrames();
      for (let q = 0; q < 3; q++) {
        const f = fl[(Math.floor(now / 110) + q) % fl.length];
        const [sx, sy] = this.toView(wx + (bw + bd) * 8 - 10 + q * 7, wy - 14 + (q % 2) * 4);
        g.drawImage(f, sx, sy, Math.round(f.width * this.zoom), Math.round(f.height * this.zoom));
      }
    }
    if (b.p === this.me && !b.site && (b.note || (BD[b.t].jobs && b.w + b.ex === 0)) && Math.floor(now / 600) % 2 === 0) {
      const [sx, sy] = this.toView(wx + (bw + bd) * 8, wy - s.oy / k + 4);
      g.drawImage(alertMark(), sx - 3, sy - 10);
    }
  }

  drawTrain(g, e) {
    const w = this.w, y = w.map.railY;
    const k = e.t / e.len;
    const stop = e.stop;
    let x;
    if (k < 0.35) x = -6 + (stop + 6) * (k / 0.35) ** 0.7;
    else if (k < 0.65) x = stop;
    else x = stop + (w.n + 12 - stop) * ((k - 0.65) / 0.35) ** 1.4;
    const cars = trainSprites();
    for (let c = 0; c < 4; c++) {
      const s = c === 0 ? cars.loco : cars.car;
      const [wx, wy] = this.tileTop(x - c * 1.15, y);
      this.blit(g, s, wx - 16, wy);
    }
    if (k < 0.65 || k > 0.7) {
      const [wx, wy] = this.tileTop(x, y);
      const [sx, sy] = this.toView(wx + 6, wy - 30);
      g.fillStyle = 'rgba(220,220,220,0.6)';
      for (let i = 0; i < 4; i++) g.fillRect(sx - i * 3 * this.zoom, sy - i * 3 * this.zoom, Math.max(2, 4 * this.zoom), Math.max(2, 3 * this.zoom));
    }
  }

  drawSmoke(g, e) {
    const b = this.w.byId.get(e.b);
    if (!b) { e.t = e.len; return; }
    const [bw, bd] = this.w.dimsOf(b);
    const s = this.spriteOf(b), k = s.k || 1;
    const wx = (b.x - b.y - bd) * 16 + this.OX + (bw + bd) * 16 * 0.62, wy = (b.x + b.y) * 8 + this.OY - s.oy / k + 6;
    const q = e.t / e.len;
    const [sx, sy] = this.toView(wx + e.dx * q * 3, wy - q * 26);
    const r = Math.max(1, Math.round((2 + q * 4) * this.zoom));
    g.fillStyle = e.fire ? `rgba(${60 + (1 - q) * 80 | 0},40,30,${0.55 * (1 - q)})` : `rgba(200,195,190,${0.5 * (1 - q)})`;
    g.fillRect(sx - r, sy - r, r * 2, r * 2);
  }

  drawFoot(g, x, y, bw, bd, col, thin = false) {
    const [ax, ay] = this.toView(...this.tileTop(x, y));
    const [bx, by] = this.toView(...this.tileTop(x + bw, y));
    const [cx, cy] = this.toView(...this.tileTop(x + bw, y + bd));
    const [dx, dy] = this.toView(...this.tileTop(x, y + bd));
    g.fillStyle = col;
    const line = (x0, y0, x1, y1) => {
      const n = Math.max(Math.abs(x1 - x0), 1);
      for (let k = 0; k <= n; k += thin ? 2 : 1) g.fillRect(Math.round(x0 + ((x1 - x0) * k) / n), Math.round(y0 + ((y1 - y0) * k) / n), 1, 1);
    };
    line(ax, ay, bx, by); line(bx, by, cx, cy); line(cx, cy, dx, dy); line(dx, dy, ax, ay);
  }
  fillTile(g, x, y, col) {
    const z = this.zoom;
    const [sx, sy] = this.toView(...this.tileTop(x, y));
    g.fillStyle = col;
    for (let r = 0; r < 16; r++) {
      const hw = (r < 8 ? 2 * (r + 1) : 2 * (16 - r)) * z;
      g.fillRect(Math.round(sx - hw), Math.round(sy + r * z), Math.max(1, Math.round(hw * 2)), Math.max(1, Math.ceil(z)));
    }
  }
  drawRadius(g, { x, y, bw, bd, r }) {
    const w = this.w;
    for (let j = y - r - 1; j <= y + bd + r; j++) for (let i = x - r - 1; i <= x + bw + r; i++) {
      if (!w.inMap(i, j)) continue;
      const dx = (2 * i + 1) - (2 * x + bw), dy = (2 * j + 1) - (2 * y + bd), R2 = 2 * r + Math.max(bw, bd) - 1;
      if (dx * dx + dy * dy <= R2 * R2) this.fillTile(g, i, j, 'rgba(248,208,112,0.16)');
    }
  }

  drawGhost(g, gh, alpha = 0.72) {
    const def = BD[gh.t];
    const [bw, bd] = K.dims(def, gh.rot);
    if (alpha > 0.5) for (let j = gh.y; j < gh.y + bd; j++) for (let i = gh.x; i < gh.x + bw; i++) this.fillTile(g, i, j, gh.ok ? 'rgba(184,224,112,0.45)' : 'rgba(240,112,90,0.5)');
    const s = buildingSprite(gh.t, 0, gh.rot);
    g.globalAlpha = alpha;
    this.blit(g, s, (gh.x - gh.y - bd) * 16 + this.OX, (gh.x + gh.y) * 8 + this.OY);
    g.globalAlpha = 1;
  }
}

// ------------------------------------------------------------ petits sprites de la vue
const NONE = [];
const FIELD_ID = { ferme_mais: 1, ferme_ble: 2, coton: 3, tabac: 4, potager: 5, verger: 6, ranch: 7, haras: 7, bergerie: 7 };
// ce qui se dresse sur une case : un sprite et son décalage (deux arbres sur une case de forêt dense)
const T0 = (s) => ({ s, dx: 0, dy: 0 });
const offs = (s, dx, dy) => ({ s, dx, dy });

// rangs de culture d'un champ, au pixel fin (u, v de 0 à 16 dans la case)
function cropPx(res, u, v, gx, gy, nz, base) {
  if (res === 'paturage') return dither(GROUND[BIO.PRAIRIE], 0.62 + nz * 0.6 + (hsh(gx >> 1, gy, 19) < 0.08 ? -0.3 : 0), gx, gy);
  const c = CROP[res] || CROP.mais;
  const row = (v * 2) % 4; // un rang toutes les 2 unités
  if (u < 0.6 || v < 0.6) return tone(c.soil[1], -0.15); // sillon de bordure
  if (row < 1.1) return dither(c.soil, 0.4 + nz, gx, gy);
  const h = hsh(gx, gy, 41);
  if (h < 0.1) return c.tip;
  return dither(c.a, 0.35 + (row - 1.1) * 0.25 + nz * 0.5, gx, gy);
}

// masque de pixels pleins d'un sprite (pour le clic sur un bâtiment), calculé une fois par canvas
const MASKS = new WeakMap();
function hitMask(c, x, y) {
  let m = MASKS.get(c);
  if (!m) {
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    m = new Uint8Array(c.width * c.height);
    for (let k = 0; k < m.length; k++) m[k] = d[k * 4 + 3] > 200 ? 1 : 0;
    MASKS.set(c, m);
  }
  return x >= 0 && y >= 0 && x < c.width && y < c.height && m[y * c.width + x] === 1;
}

// mesas (strates rouges), rochers, montagnes (neige au sommet), cailloux — en pixels fins
function rockSprite(kind, s, bio = 0) {
  return I.isoSprite(`roc:${kind}:${s % 4}:${bio}`, () => {
    const sp = new I.Sprite(1, 1, 44, 2);
    if (kind === 'mesa') {
      const Rr = I.ramp(bio === BIO.DESERT ? '#b87a4c' : '#a85a3a', 7, 0.45);
      const h = 14 + (s % 3) * 2;
      sp.vol(0, 0, 16, 16, (u, v) => h + (hsh(Math.floor(u / 3), Math.floor(v / 3), s) - 0.5) * 1.5, (u, v, z, f, s2, U, V, Z) => {
        if (f === 0) return dither(Rr, 0.66 + (hsh(U >> 1, V >> 1, s) - 0.5) * 0.25, U, V);
        const band = Math.floor(Z / 5) % 2 ? 0.08 : -0.06;
        const T = f === 1 ? U : V;
        return dither(Rr, (f === 1 ? 0.5 : 0.2) + band + (hsh(T >> 2, Z >> 1, s) - 0.5) * 0.18 + (hsh(T, Z, s + 3) < 0.04 ? -0.25 : 0), T, Z);
      });
    } else if (kind === 'roc') {
      const Rr = I.ramp('#8a8070', 6, 0.45);
      sp.vol(1, 1, 14, 14, (u, v) => 8 + 4 * (1 - Math.max(Math.abs(u - 7), Math.abs(v - 7)) / 7) + hsh(Math.floor(u / 2), Math.floor(v / 2), s) * 3, (u, v, z, f, s2, U, V, Z) => dither(Rr, (f === 0 ? 0.68 : f === 1 ? 0.45 : 0.15) + (hsh(U >> 1, (f === 0 ? V : Z) >> 1, s) - 0.5) * 0.3, U, f === 0 ? V : Z));
    } else if (kind === 'mont') {
      const Rr = I.ramp(bio === BIO.CANYON ? '#9a5a3a' : '#7a6a5a', 7, 0.5);
      const snow = bio !== BIO.CANYON;
      sp.vol(0, 0, 16, 16, (u, v) => 18 + (s % 3) * 4 + 9 * (1 - Math.max(Math.abs(u - 8), Math.abs(v - 8)) / 8) + hsh(Math.floor(u / 2), Math.floor(v / 2), s) * 4, (u, v, z, f, s2, U, V, Z) => {
        if (snow && z > 27 + hsh(U >> 2, V >> 2, s) * 3) return f === 2 ? hex('#c8ccd8') : hex('#eef0f4');
        if (f === 0) return dither(Rr, 0.62 + (hsh(U >> 1, V >> 1, s) - 0.5) * 0.35, U, V);
        const T = f === 1 ? U : V;
        return dither(Rr, (f === 1 ? 0.45 : 0.15) + (hsh(T >> 1, Z >> 1, s) - 0.5) * 0.25, T, Z);
      });
    } else {
      const Rr = I.ramp('#9a8a78', 5, 0.42);
      sp.vol(5, 5, 6, 5, (u, v) => 3 - Math.abs(u - 3) * 0.5, (u, v, z, f, s2, U, V) => dither(Rr, (f === 0 ? 0.7 : f === 1 ? 0.45 : 0.15) + (hsh(U, V, s) - 0.5) * 0.2, U, V));
      sp.vol(9, 8, 3, 3, 1.5, (u, v, z, f, s2, U, V) => dither(Rr, f === 0 ? 0.6 : 0.3, U, V));
    }
    return sp.done();
  });
}

let FLAMES = null;
function flameFrames() {
  if (FLAMES) return FLAMES;
  const pal = { r: '#c2281c', o: '#f0843a', y: '#f8d070' };
  FLAMES = I.anim([
    ['..r...', '.ror..', '.oyo.r', 'roy.or', 'royyor', '.oyyo.'],
    ['...r..', '..ror.', 'r.oyo.', 'ro.yor', 'royyor', '.oyyo.'],
    ['.r....', '.ro.r.', 'royor.', 'r.yyor', 'royyor', '.oyyo.'],
  ], pal);
  return FLAMES;
}
let ALERT = null;
function alertMark() { return ALERT || (ALERT = I.grid2d(['.yy.', '.yy.', '.yy.', '....', '.yy.'], { y: '#f8d070' })); }

let TRAIN = null;
function trainSprites() {
  if (TRAIN) return TRAIN;
  const loco = new I.Sprite(1, 1, 30, 2);
  loco.box(1, 4, 14, 8, 8, { left: (t, z) => (z > 6 ? hex('#3a3a3a') : hex('#2a2a2a')), right: () => hex('#1a1a1a'), top: () => hex('#4a4a4a') });
  loco.cyl(9, 8, 3, 8, 6, { top: () => hex('#2a2a2a'), side: (k) => tone(hex('#3a3a3a'), 0.1 - k * 0.3) }, 0);
  loco.box(1, 4, 5, 8, 14, { left: () => hex('#7a1a1a'), right: () => hex('#5a1414'), top: () => hex('#3a3a3a') });
  const car = new I.Sprite(1, 1, 24, 2);
  car.box(1, 4, 14, 8, 10, { left: (t, z) => (t % 4 === 0 && z > 3 && z < 8 ? hex('#3a3a4a') : hex('#8a5a34')), right: () => hex('#5a3a22'), top: () => hex('#6a4a30') });
  TRAIN = { loco: loco.done(), car: car.done() };
  return TRAIN;
}
