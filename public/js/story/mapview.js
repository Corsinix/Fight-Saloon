// Carte du territoire (mode histoire « Le Filon du Diable ») : le même paysage vu de dessus que la carte de La piste
// (pistemap.js : relief ombré par région, rivière, pistes de terre battue et leurs ponts, ville, repaire, milliers de
// détails, nuages et reflets animés), dessiné au pixel fin (F pixels d'écran par pixel du jeu : la scène passe le
// canvas en haute résolution pendant la carte). Par-dessus : les nuées sur les régions des actes à venir, le nom des
// régions, les lieux en médaillons (gameIcon), les pistes en pointillés, le pion de la bande, les votes, le survol.
//   const mv = new MapView(campaign)
//   mv.draw(ctx, now, { act, nodes: { id: 'open' | 'done' | 'hidden' }, here, hover, votes: [{ node, color }], regionsAct })
//   mv.hit(x, y, openIds) -> id du lieu ouvert le plus proche (à moins de 11 px) ou null
// Performance : le paysage est calculé une fois (≈ 0,6 s, gardé pour toute la session), les nuées et les noms une fois
// par acte, les pistes et les lieux terminés une fois par état des lieux ; par image, des copies et quelques pixels.
import { makeCanvas, freeCanvas, disc } from '../sprites.js';
import { gameIcon } from '../gameicons.js';
import { TOK, plate, textW } from '../uikit.js';
import { canvasText } from '../scene.js';
import { W, H } from '../worlds.js';
import { worldMap, drawMapFx, mistCanvas, F } from '../pistemap.js';
import { pawn as horsePawn, drawFine } from '../pistepawn.js';

export const MAP_RES = F; // pixels d'écran par pixel du jeu pendant la carte

// ---------------------------------------------------------------- géographie
// Zones des régions (x0, y0, x1, y1) : celles du tableau de la bible ; act : acte à partir duquel la région est révélée ;
// biome : le terrain de pistemap.js (desert, canyon, prairie, foret, neige).
// Les régions de campaign.regions (même id, ou nom reconnu) peuvent changer le nom, l'acte et l'ancre de l'étiquette.
const REGIONS = [
  { id: 'gulch', biome: 'desert', act: 1, name: 'DUSTY GULCH', zone: [30, 120, 140, 190], town: true, keys: ['GULCH', 'BOOT HILL'] },
  { id: 'ranch', biome: 'prairie', act: 2, name: 'RANCH MCCOY', zone: [110, 60, 200, 115], keys: ['RANCH', 'MCCOY', 'PRAIRIE'] },
  { id: 'redrock', biome: 'canyon', act: 2, name: 'RED ROCK', zone: [190, 115, 260, 170], town: true, keys: ['RED ROCK'] },
  { id: 'mine', biome: 'neige', act: 2, name: 'MINE DU VIEUX JOE', zone: [230, 24, 300, 70], keys: ['MINE', 'JOE'] },
  { id: 'mission', biome: 'desert', act: 2, name: 'SAN ROSARIO', zone: [150, 172, 260, 196], keys: ['MISSION', 'ROSARIO', 'ROUTE'] },
  { id: 'fort', biome: 'foret', act: 3, name: 'FORT SAINT-JUDE', zone: [40, 30, 110, 85], keys: ['FORT', 'JUDE'] },
  { id: 'plaine', biome: 'prairie', act: 3, name: 'GRANDE PLAINE', zone: [190, 70, 240, 110], keys: ['PLAINE'] },
  { id: 'pueblo', biome: 'desert', act: 3, name: 'PUEBLO', zone: [270, 100, 320, 145], keys: ['PUEBLO'] },
  { id: 'salines', biome: 'desert', act: 3, name: 'LES SALINES', zone: [280, 160, 345, 196], keys: ['SALINE'] },
  { id: 'canyon', biome: 'canyon', act: 4, name: 'LE CANYON', zone: [315, 70, 376, 150], keys: ['CANYON'] },
  { id: 'hacienda', biome: 'canyon', act: 4, name: 'HACIENDA', zone: [330, 20, 376, 65], keys: ['HACIENDA', 'ENFER', 'DIABLO'] },
];
// Rivière : du nord-ouest (le long du Fort Saint-Jude) au sud-est (près de la mission), points de passage
const RIVER = [[-6, 12], [20, 22], [46, 30], [72, 36], [90, 46], [98, 62], [108, 80], [126, 94], [148, 104], [162, 118],
  [168, 136], [174, 152], [184, 166], [198, 172], [216, 176], [232, 186], [242, 200], [248, 222]];

// Couleurs (médaillons, pion, votes)
const C = {
  ink: TOK.ink, sepia: '#5a3a22', sepiaL: '#8a6a48', label: '#4a2a14', town: '#8a2a1c',
  grass: '#8a9a48', grassD: '#5a6a2a', grassL: '#b0b868',
  water: '#4a7a9a', waterL: '#8ab8c8', waterD: '#2e5a78',
  rock: '#c2643e', rockL: '#e08a5a', rockD: '#8a3a24', rockDD: '#5a2014',
  mtn: '#9a8670', mtnL: '#c8b494', mtnD: '#62523f', snow: '#f4ecd8',
  wood: TOK.wood, woodL: TOK.woodL, woodD: TOK.woodD, plank: '#a8784a',
  adobe: '#d8a870', adobeD: '#a87848', adobeL: '#ecc890',
  white: '#f4ecd8', whiteD: '#c8bca4', salt: '#f8f4e8', saltD: '#d4cbb8',
  black: '#2a2220', blackL: '#4e423b', lava: '#e8604c', lavaL: '#f8d070', lavaD: '#9a2a1c',
  cactus: '#5a8a3a', cactusL: '#8ab858', pine: '#3e5a2e', pineL: '#5e7e3e', roof: '#9a3a24',
};

// ---------------------------------------------------------------- petits outils
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const rgb = (hex) => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
function rng(seed) { // mulberry32 : la même carte à chaque fois
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hash2(x, y, s) {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 982451653)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise(x, y, s) { // bruit de valeur lissé
  const ix = Math.floor(x), iy = Math.floor(y);
  let fx = x - ix, fy = y - iy;
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy, s), b = hash2(ix + 1, iy, s), c = hash2(ix, iy + 1, s), d = hash2(ix + 1, iy + 1, s);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}
const fbm = (x, y, s) => vnoise(x / 48, y / 48, s) * 0.5 + vnoise(x / 17, y / 17, s + 1) * 0.3 + vnoise(x / 6, y / 6, s + 2) * 0.2;
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
const bayer = (x, y) => BAYER[(y & 3) * 4 + (x & 3)];
function distRect(x, y, z) { // distance d'un point à une zone (0 dedans)
  const dx = x < z[0] ? z[0] - x : x > z[2] ? x - z[2] : 0;
  const dy = y < z[1] ? z[1] - y : y > z[3] ? y - z[3] : 0;
  return Math.hypot(dx, dy);
}
// Courbe lisse (Catmull-Rom) passant par les points, échantillonnée environ tous les demi-pixels
function spline(pts) {
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    const n = Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) * 2);
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}
const fontReady = () => !globalThis.document?.fonts || document.fonts.check('8px Silkscreen');
const norm = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
export class MapView {
  constructor(campaign = {}) {
    this.campaign = campaign;
    this.nodes = campaign.nodes || {};
    this.ids = Object.keys(this.nodes);
    this.regions = mergeRegions(campaign.regions);
    this.volcanoAct = this.regions.find((r) => r.id === 'hacienda')?.act ?? 4;
    this.bg = null; this.bgKey = null; // paysage + nuées et noms des régions (par acte), en pixels fins
    this.layer = null; this.layerSig = null; // + pistes et lieux terminés (par état des lieux)
    this.medals = new Map();
    this.view = null;
    this.t0 = 0;
  }
  // ------------------------------------------------------------ fond statique
  // Le paysage (pistemap.js), calculé une fois pour la campagne et gardé pour toute la session
  world() {
    const key = this.campaign.id || 'carte';
    let w = worlds.get(key);
    if (!w) {
      const pos = (id) => ({ x: this.nodes[id].x, y: this.nodes[id].y });
      const seen = new Set();
      const nodes = this.ids.map(pos).filter((p) => { const k = `${p.x},${p.y}`; return !seen.has(k) && seen.add(k); });
      const segs = this.links().map(([a, b]) => ({ ax: this.nodes[a].x, ay: this.nodes[a].y, bx: this.nodes[b].x, by: this.nodes[b].y }));
      const lairR = this.regions.find((r) => r.id === 'hacienda');
      const start = this.nodes[this.campaign.start];
      w = worldMap(null, 1878, null, {
        regionAt: (u, v) => regionAt(this.regions, u, v),
        nodes, segs,
        start: start ? { x: start.x, y: start.y } : null,
        lair: lairR ? { x: lairR.anchor[0], y: lairR.anchor[1] } : nodes[nodes.length - 1],
        rivers: [{ pts: spline(RIVER).map(([x, y]) => ({ x, y })), width: 2.6 }],
      });
      worlds.set(key, w);
    }
    return w;
  }

  // Calcul d'avance (pendant un dialogue) : la première carte s'affiche sans à-coup
  prepare() { this.world(); }

  buildBackground(act) {
    const w = this.world();
    this.occ ||= new Uint8Array(W * H);
    const cv = makeCanvas(W * F, H * F);
    const g = cv.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.drawImage(w.bg, 0, 0);
    const mist = paintMist(this.regions, act);
    if (mist) { g.drawImage(mist.c, 0, 0, W * F, H * F); freeCanvas(mist.c); }
    const fogMask = mist ? mist.mask : new Uint8Array(W * H);
    // noms des régions révélées, sur un bandeau sombre comme ceux de La piste
    g.setTransform(F, 0, 0, F, 0, 0);
    const taken = [[0, 0, W, 16], [0, H - 34, 34, H]]; // bandeau de l'acte, rose des vents
    for (const r of this.regions) {
      if (r.act > act || !r.name) continue;
      const pos = this.placeLabel(r, taken, fogMask);
      if (!pos) continue;
      const tw = textW(r.name) + 6;
      g.fillStyle = 'rgba(26,15,10,0.62)';
      g.fillRect(pos[0] - 3, pos[1] - 2, tw, 9);
      g.fillStyle = 'rgba(248,208,112,0.5)';
      g.fillRect(pos[0] - 3, pos[1] - 2, tw, 0.5);
      g.fillRect(pos[0] - 3, pos[1] + 6.5, tw, 0.5);
      canvasText(g, r.name, pos[0], pos[1] - 1, { color: r.town ? TOK.gold : TOK.cream, align: 'left' });
      taken.push([pos[0] - 7, pos[1] - 5, pos[0] + tw + 4, pos[1] + 10]);
    }
    return cv;
  }
  // Position d'une étiquette de région : près de son ancre, dans sa zone, loin des lieux et des autres étiquettes
  placeLabel(r, taken, fog) {
    const w = textW(r.name), h = 6;
    if (!this.trailPts) { // points des pistes (évitées : les pointillés couperaient les lettres)
      this.trailPts = [];
      for (const [ia, ib] of this.links()) {
        const a = this.nodes[ia], b = this.nodes[ib], [mx, my] = bendOf(a, b, ia, ib);
        for (let t = 0; t <= 1; t += 0.03) {
          const u = 1 - t;
          this.trailPts.push([u * u * a.x + 2 * u * t * mx + t * t * b.x, u * u * a.y + 2 * u * t * my + t * t * b.y]);
        }
      }
    }
    const [ax, ay] = r.anchor;
    let best = null, bestS = Infinity;
    for (let dy = -36; dy <= 36; dy += 2) for (let dx = -48; dx <= 48; dx += 2) {
      const x = Math.round(ax + dx - w / 2), y = Math.round(ay + dy);
      if (x < 8 || y < 20 || x + w > W - 8 || y + h > H - 12) continue;
      const cx = x + w / 2, cy = y + 2;
      let s = Math.hypot(dx, dy * 1.4) + distRect(cx, cy, r.zone) * 14 + distRect(x, y, r.zone) * 4 + distRect(x + w, y + h, r.zone) * 4;
      const over = (x0, y0, x1, y1) => x < x1 && x + w > x0 && y < y1 && y + h > y0;
      for (const id of this.ids) {
        const n = this.nodes[id];
        const d = Math.hypot(clamp(n.x, x, x + w) - n.x, clamp(n.y, y, y + h) - n.y);
        if (d < 15) s += 400 - d * 10;
        // place du pion (au-dessus) et des pastilles de vote (en dessous) quand le lieu les reçoit
        if (over(n.x - 9, n.y - 27, n.x + 9, n.y - 9)) s += 40;
        if (over(n.x - 15, n.y + 8, n.x + 15, n.y + 19)) s += 40;
      }
      for (const [px, py] of this.trailPts) if (px > x - 2 && px < x + w + 2 && py > y - 2 && py < y + h + 2) s += 30;
      let busy = 0; // relief sous l'étiquette
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) busy += this.occ[(y + j) * W + x + i];
      s += busy * 0.6;
      for (const t of taken) if (x < t[2] && x + w > t[0] && y < t[3] && y + h > t[1]) s += 900;
      if (fog[(y + 2) * W + Math.round(cx)]) s += 300;
      if (s < bestS) { bestS = s; best = [x, y]; }
    }
    return best;
  }

  // « TERRA INCOGNITA » au milieu de chaque grande étendue de brouillard (deux au plus)

  // ------------------------------------------------------------ lieux
  medal(icon, state) {
    const key = `${icon}|${state}`;
    let c = this.medals.get(key);
    if (c) return c;
    c = makeCanvas(23, 23);
    const g = c.getContext('2d');
    const done = state === 'done';
    const rim = done ? ['#c8b490', '#a89070', '#7a6448'] : ['#f8d070', '#d8a040', '#8a5a20'];
    disc(g, 11, 11, 9, C.ink);
    for (let y = 0; y < 23; y++) for (let x = 0; x < 23; x++) { // anneau : clair en haut à gauche, sombre en bas à droite
      const dx = x - 11, dy = y - 11, d = Math.hypot(dx, dy);
      if (d > 8.4 || d < 6.6) continue;
      const k = (-dx - dy) / (d || 1);
      g.fillStyle = k > 0.55 ? rim[0] : k < -0.55 ? rim[2] : rim[1];
      g.fillRect(x, y, 1, 1);
    }
    disc(g, 11, 11, 6, done ? '#d8c8a0' : TOK.cream);
    g.fillStyle = done ? '#c4b088' : '#ecdcb4'; // ombre intérieure sous l'anneau
    for (let y = 0; y < 23; y++) for (let x = 0; x < 23; x++) {
      const d = Math.hypot(x - 11, y - 11);
      if (d <= 6.6 && d > 5.6 && x + y > 24) g.fillRect(x, y, 1, 1);
    }
    const ic = gameIcon(icon) || gameIcon('soon');
    if (ic) {
      if (done) g.globalAlpha = 0.55;
      g.drawImage(ic, 11 - Math.floor(ic.width / 2), 11 - Math.floor(ic.height / 2));
      g.globalAlpha = 1;
    }
    if (done) { // coche à l'encre rouge, en bas à droite
      const P = [[0, 2], [1, 3], [2, 4], [3, 3], [4, 2], [5, 1], [6, 0]];
      g.fillStyle = C.ink;
      for (const [x, y] of P) g.fillRect(13 + x, 13 + y - 1, 2, 4);
      g.fillStyle = TOK.red;
      for (const [x, y] of P) g.fillRect(14 + x - 1, 13 + y, 2, 2);
    }
    this.medals.set(key, c);
    return c;
  }

  // Pistes et lieux terminés : peints une fois par état des lieux
  buildLayer(view) {
    const cv = this.layer && this.layer.width ? this.layer : makeCanvas(W, H);
    const g = cv.getContext('2d');
    g.clearRect(0, 0, W, H);
    const st = view.nodes || {};
    const shown = (id) => this.nodes[id] && (st[id] || 'hidden') !== 'hidden';
    for (const id of this.ids) {
      if (st[id] !== 'done') continue;
      const n = this.nodes[id];
      g.drawImage(this.medal(n.icon, 'done'), Math.round(n.x) - 11, Math.round(n.y) - 11);
    }
    return cv;
  }

  // Les routes : campaign.roads, plus les links des lieux ; un lieu de remplacement (fallback) prend les routes du lieu
  // qu'il remplace
  links() {
    if (this._links) return this._links;
    const seen = new Set(), out = [];
    const pairs = [...(this.campaign.roads || []), ...this.ids.flatMap((id) => (this.nodes[id].links || []).map((to) => [id, to]))];
    for (const id of this.ids) {
      const fb = this.nodes[id].fallback;
      if (fb) for (const [a, b] of [...pairs]) { if (a === id) pairs.push([fb, b]); if (b === id) pairs.push([a, fb]); }
    }
    for (const [id, to] of pairs) {
      if (!this.nodes[to] || !this.nodes[id] || id === to) continue;
      const k = id < to ? `${id}|${to}` : `${to}|${id}`;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(id < to ? [id, to] : [to, id]);
    }
    return (this._links = out);
  }

  // Itinéraire par les routes, d'un lieu à un autre (le plus court) : liste d'ids, ou [from, to] s'il n'y a pas de route
  route(from, to) {
    if (!this.nodes[from] || !this.nodes[to] || from === to) return [from, to].filter((id) => this.nodes[id]);
    const adj = new Map();
    for (const [a, b] of this.links()) {
      if (!adj.has(a)) adj.set(a, []);
      if (!adj.has(b)) adj.set(b, []);
      adj.get(a).push(b);
      adj.get(b).push(a);
    }
    const dist = new Map([[from, 0]]), prev = new Map(), todo = new Set([from]);
    while (todo.size) {
      let u = null;
      for (const v of todo) if (u == null || dist.get(v) < dist.get(u)) u = v;
      todo.delete(u);
      if (u === to) break;
      for (const v of adj.get(u) || []) {
        const d = dist.get(u) + Math.hypot(this.nodes[u].x - this.nodes[v].x, this.nodes[u].y - this.nodes[v].y);
        if (d < (dist.get(v) ?? Infinity)) { dist.set(v, d); prev.set(v, u); todo.add(v); }
      }
    }
    if (!prev.has(to)) return [from, to];
    const path = [to];
    while (path[0] !== from) path.unshift(prev.get(path[0]));
    return path;
  }

  sameNodes(a) {
    const b = this.layerNodes;
    if (!b || !a) return false;
    for (const id of this.ids) if ((a[id] || 'hidden') !== (b[id] || 'hidden')) return false;
    return true;
  }

  // ------------------------------------------------------------ par image
  draw(ctx, now, view = {}) {
    this.view = view;
    const act = view.act || 1;
    const fogAct = view.regionsAct ?? act;
    const key = `${fogAct}|${act}`;
    // fond peint avec la police de secours (Silkscreen pas encore chargée) : refait dès qu'elle l'est
    if (this.bgKey === key && !this.bgFont && fontReady()) this.bgKey = null;
    if (this.bgKey !== key) {
      freeCanvas(this.bg);
      this.bgFont = fontReady();
      this.bg = this.buildBackground(fogAct);
      this.bgKey = key;
    }
    ctx.drawImage(this.bg, 0, 0, W, H); // (le ctx est à l'échelle des pixels fins : voir MAP_RES)
    drawMapFx(ctx, this.world(), now); // ombres des nuages, reflets, fumées, feux

    const st = view.nodes || {};
    if (!this.sameNodes(st)) {
      this.layer = this.buildLayer(view);
      this.layerNodes = { ...st };
    }
    ctx.drawImage(this.layer, 0, 0);

    // les routes, comme sur la carte de La piste : pointillés clairs sur la terre battue, rouges sur celles déjà
    // parcourues, et l'itinéraire vers le lieu montré en or, qui avance vers lui
    const shown = (id) => this.nodes[id] && (st[id] || 'hidden') !== 'hidden';
    const visited = new Set(view.visited || []);
    const rk = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);
    const rt = view.route || [];
    const onRoute = new Set();
    for (let i = 0; i + 1 < rt.length; i++) onRoute.add(rk(rt[i], rt[i + 1]));
    const march = Math.floor(now / 110) % 2;
    for (const [a, b] of this.links()) {
      if (!shown(a) || !shown(b)) continue;
      if (onRoute.has(rk(a, b))) {
        const fwd = rt.indexOf(a) < rt.indexOf(b);
        roadDots(ctx, this.nodes[fwd ? a : b], this.nodes[fwd ? b : a], TOK.gold, 2, 1 - march, true);
      } else if (visited.has(a) && visited.has(b)) roadDots(ctx, this.nodes[a], this.nodes[b], '#c8301c', 1, 0);
      else roadDots(ctx, this.nodes[a], this.nodes[b], 'rgba(253,246,224,0.8)', 2, 0);
    }

    // lieux ouverts : médaillon + onde qui pulse
    for (const id of this.ids) {
      if (st[id] !== 'open') continue;
      const n = this.nodes[id];
      const x = Math.round(n.x), y = Math.round(n.y);
      const ph = ((now + hash2(x, y, 1) * 1600) % 1600) / 1600;
      ring(ctx, x, y, 10 + Math.round(ph * 5), TOK.gold, 0.85 * (1 - ph));
      const lift = ph < 0.12 ? -1 : 0; // petit sursaut au départ de l'onde
      ctx.drawImage(this.medal(n.icon, 'open'), x - 11, y - 11 + lift);
      if (id === view.hover) ring(ctx, x, y + lift, 10, TOK.cream, 1);
    }
    if (view.hover && st[view.hover] === 'done') {
      const n = this.nodes[view.hover];
      ring(ctx, Math.round(n.x), Math.round(n.y), 10, '#c8b490', 1);
    }

    this.drawVotes(ctx, now, view.votes || []);
    // le pion de la bande : sur le lieu courant, ou en route (view.pawn : { x, y }, voyage animé par la scène)
    if (view.pawn) this.drawPawn(ctx, now, view.pawn, true, view.pawnLook);
    else if (view.here && this.nodes[view.here]) this.drawPawn(ctx, now, this.nodes[view.here], false, view.pawnLook);
    if (view.hover && this.nodes[view.hover] && shown(view.hover)) this.drawLabel(ctx, this.nodes[view.hover]);
  }

  drawVotes(ctx, now, votes) {
    const by = new Map();
    for (const v of votes) {
      if (!v || !this.nodes[v.node]) continue;
      if (!by.has(v.node)) by.set(v.node, []);
      by.get(v.node).push(v.color || TOK.cream);
    }
    for (const [id, cols] of by) {
      const n = this.nodes[id];
      const step = cols.length > 4 ? 0.42 : 0.55;
      cols.forEach((col, i) => {
        const a = Math.PI / 2 + (i - (cols.length - 1) / 2) * step;
        const hop = Math.floor((now / 120 + i * 2) % 12) === 0 ? -1 : 0;
        const px = Math.round(n.x + Math.cos(a) * 13) - 2, py = Math.round(n.y + Math.sin(a) * 13) - 2 + hop;
        ctx.fillStyle = C.ink; ctx.fillRect(px - 1, py, 7, 5); ctx.fillRect(px, py - 1, 5, 7);
        ctx.fillStyle = col; ctx.fillRect(px, py, 5, 5);
        ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.fillRect(px, py, 2, 1); ctx.fillRect(px, py, 1, 2);
      });
    }
  }

  // Pion de la bande : chapeau de cow-boy et fanion, qui rebondit au-dessus du lieu courant
  // look : l'allure du chef de la bande — son cowboy à cheval, au grain de la carte (pistepawn.js, comme dans La piste)
  drawPawn(ctx, now, n, gallop = false, look = null) {
    if (look) {
      drawFine(ctx, horsePawn(look, gallop ? Math.floor(now / 90) % 4 : -1), n.x - 1, n.y - (gallop ? 2 : 7));
      return;
    }
    const hop = Math.round(Math.abs(Math.sin(now / (gallop ? 90 : 280))) * 3); // au galop, il saute plus vite
    const x = Math.round(n.x), y = Math.round(n.y);
    // ombre portée sur le haut du médaillon, plus petite quand le pion saute
    ctx.fillStyle = 'rgba(26,15,10,0.4)';
    ctx.fillRect(x - 6 + hop, y - 9, 13 - hop * 2, 2);
    pawnSprite ||= makePawn();
    ctx.drawImage(pawnSprite, x - 8, y - 9 - pawnSprite.height - hop + 1);
  }

  drawLabel(ctx, n) {
    const name = String(n.name || '').toUpperCase();
    const place = n.place ? String(n.place).toUpperCase() : '';
    const w = Math.max(textW(name) + 8, place ? textW(place) + 8 : 0);
    const h = place ? 21 : 11;
    let x = Math.round(n.x - w / 2), y = Math.round(n.y) - 15 - h;
    if (this.view?.here && this.nodes[this.view.here] === n) y -= 13; // au-dessus du pion
    if (y < 2) y = Math.round(n.y) + 13;
    x = clamp(x, 3, W - w - 3);
    if (place) {
      ctx.fillStyle = TOK.ink; ctx.fillRect(x, y + 10, w, 11);
      canvasText(ctx, place, x + w / 2, y + 12, { color: TOK.sand });
    }
    plate(ctx, name, x + Math.round((w - textW(name) - 8) / 2), y, TOK.gold);
  }

  // id du lieu ouvert le plus proche du point (à moins de 11 px)
  hit(x, y, openIds) {
    let ids = openIds;
    if (!ids) { const st = this.view?.nodes || {}; ids = this.ids.filter((id) => st[id] === 'open'); }
    let best = null, bd = 11;
    for (const id of ids) {
      const n = this.nodes[id];
      if (!n) continue;
      const d = Math.hypot(n.x - x, n.y - y);
      if (d < bd) { bd = d; best = id; }
    }
    return best;
  }
}


// ---------------------------------------------------------------- régions (bible + campaign.regions)
function mergeRegions(extra) {
  const list = REGIONS.map((r) => ({ ...r, anchor: [(r.zone[0] + r.zone[2]) / 2, (r.zone[1] + r.zone[3]) / 2] }));
  for (const [id, e] of Object.entries(extra || {})) {
    const nm = norm(e.name);
    let r = list.find((q) => q.id === id) || list.find((q) => q.keys.some((k) => nm.includes(k)));
    if (!r) {
      if (!Number.isFinite(e.x) || !Number.isFinite(e.y)) continue;
      r = { id, act: 1, name: '', zone: [e.x - 24, e.y - 18, e.x + 24, e.y + 18], keys: [], anchor: [e.x, e.y] };
      list.push(r);
    }
    if (e.name) r.name = norm(e.name);
    if (Number.isFinite(e.act)) r.act = e.act;
    if (Number.isFinite(e.x) && Number.isFinite(e.y)) r.anchor = [e.x, e.y];
  }
  return list;
}


// Cercle d'un pixel (onde des lieux ouverts, survol)
const ringCache = new Map();
function ring(ctx, x, y, r, col, alpha) {
  if (alpha <= 0.02) return;
  const key = `${r}|${col}`;
  let c = ringCache.get(key);
  if (!c) {
    const s = r * 2 + 3;
    c = makeCanvas(s, s);
    const g = c.getContext('2d');
    g.fillStyle = col;
    for (let j = 0; j < s; j++) for (let i = 0; i < s; i++) {
      const d = Math.hypot(i - r - 1, j - r - 1);
      if (d > r - 0.5 && d <= r + 0.5) g.fillRect(i, j, 1, 1);
    }
    ringCache.set(key, c);
  }
  ctx.globalAlpha = alpha;
  ctx.drawImage(c, x - r - 1, y - r - 1);
  ctx.globalAlpha = 1;
}

// Piste en pointillés entre deux lieux : légère courbe (toujours la même pour une paire), arrêtée au bord des médaillons
// Point de contrôle de la courbe (quadratique) d'une piste : penchée d'un côté ou de l'autre selon la paire d'ids
function bendOf(a, b, ida, idb) {
  const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
  let h = 0;
  for (const ch of ida < idb ? `${ida}${idb}` : `${idb}${ida}`) h = (h * 31 + ch.charCodeAt(0)) | 0;
  const bend = 0 * (h & 1 ? 1 : -1); // droites, le long des pistes de terre battue du paysage
  return [(a.x + b.x) / 2 - (dy / len) * bend, (a.y + b.y) / 2 + (dx / len) * bend, len];
}
function trail(ctx, a, b, ida, idb, col, phase = 0, halo = null) {
  const [mx, my, len] = bendOf(a, b, ida, idb);
  if (len < 24) return;
  const n = Math.ceil(len * 2);
  let dist = 0, px = a.x, py = a.y, lx = -1, ly = -1;
  const dots = [];
  for (let k = 1; k <= n; k++) {
    const t = k / n, u = 1 - t;
    const x = u * u * a.x + 2 * u * t * mx + t * t * b.x, y = u * u * a.y + 2 * u * t * my + t * t * b.y;
    dist += Math.hypot(x - px, y - py); px = x; py = y;
    if (Math.hypot(x - a.x, y - a.y) < 11 || Math.hypot(x - b.x, y - b.y) < 11) continue;
    if ((Math.floor(dist) + phase) % 4 >= 2) continue;
    const ix = Math.round(x), iy = Math.round(y);
    if (ix === lx && iy === ly) continue;
    lx = ix; ly = iy;
    dots.push(ix, iy);
  }
  if (halo) {
    ctx.fillStyle = halo;
    for (let i = 0; i < dots.length; i += 2) ctx.fillRect(dots[i], dots[i + 1] + 1, 1, 1);
  }
  ctx.fillStyle = col;
  for (let i = 0; i < dots.length; i += 2) ctx.fillRect(dots[i], dots[i + 1], 1, 1);
  // second pixel pour épaissir le trait (un pointillé de 2 px de large)
  for (let i = 0; i < dots.length; i += 2) ctx.fillRect(dots[i] + 1, dots[i + 1], 1, 1);
}

// Pion de la bande : chapeau de cow-boy marron à ruban doré, fanion rouge planté dessus
let pawnSprite = null;
function makePawn() {
  const rows = [
    '........kk.......',
    '........kMkk.....',
    '........kMmmkk...',
    '........kMmmmmk..',
    '........kmmmkk...',
    '........kmkk.....',
    '........kk.......',
    '........kk.......',
    '....kkkkkkkkk....',
    '...kLBBBBBBnnk...',
    '...kLBBkkBBnnk...',
    '...kyyyyyyyYyk...',
    'kkkLBBBBBBBBnnkkk',
    'kLLBBBBBBBBBBBnnk',
    '.kkkkkkkkkkkkkkk.',
  ];
  const pal = { k: C.ink, L: '#c08a54', B: '#9a6a3c', n: '#5a3a22', y: TOK.gold, Y: '#fff0b0', m: '#d8402c', M: '#f0806a' };
  const c = makeCanvas(17, rows.length);
  const g = c.getContext('2d');
  rows.forEach((row, y) => { for (let x = 0; x < row.length; x++) if (pal[row[x]]) { g.fillStyle = pal[row[x]]; g.fillRect(x, y, 1, 1); } });
  return c;
}

// ---------------------------------------------------------------- régions du paysage et nuées des actes à venir
const worlds = new Map(); // campagne -> paysage calculé (pistemap.worldMap)

// Biome d'un point : celui de la région la plus proche (zones de la bible) ; hors des zones, le désert
function regionAt(regions, u, v) {
  let best = null, bd = Infinity;
  for (const r of regions) {
    const d = distRect(u, v, r.zone) - (r.zone[2] - r.zone[0] + r.zone[3] - r.zone[1]) * 0.02;
    if (d < bd) { bd = d; best = r; }
  }
  return best && bd < 40 ? best.biome || 'desert' : 'desert';
}

// Nuées sur les régions des actes à venir : le brouillard de La piste (pistemap.mistCanvas), dont la frontière suit les
// régions (chaque point appartient à la région la plus proche). Renvoie { c, mask } (mask : W × H, pour les étiquettes), ou null.
function paintMist(regions, act) {
  const fogged = regions.filter((r) => r.act > act), seen = regions.filter((r) => r.act <= act);
  if (!fogged.length) return null;
  const depth = (u, v) => {
    let dF = Infinity, dS = Infinity;
    for (const r of fogged) dF = Math.min(dF, distRect(u, v, r.zone));
    for (const r of seen) dS = Math.min(dS, distRect(u, v, r.zone));
    return (dS - dF) * 0.7;
  };
  const mask = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (depth(x + 0.5, y + 0.5) > 8) mask[y * W + x] = 1;
  return { c: mistCanvas(1878, depth), mask };
}

// Une route en pointillés au demi-pixel (comme La piste), arrêtée au bord des médaillons ; step 1 : trait continu
// (route parcourue), 2 : un point sur deux ; phase : décalage qui fait avancer les points ; big : points plus gros
function roadDots(ctx, a, b, col, step, phase, big = false) {
  const n = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 3);
  const s = big ? 1.5 : 1;
  ctx.fillStyle = col;
  for (let k = 1; k < n; k++) {
    if (step > 1 && (k + phase) % step) continue;
    const x = a.x + ((b.x - a.x) * k) / n, y = a.y + ((b.y - a.y) * k) / n;
    if (Math.hypot(x - a.x, y - a.y) < 10 || Math.hypot(x - b.x, y - b.y) < 10) continue;
    ctx.fillRect(Math.round(x * 2) / 2 - s / 2, Math.round(y * 2) / 2 - s / 2, s, s);
  }
}
