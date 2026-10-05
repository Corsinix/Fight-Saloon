// Mini-jeu « Conquête de l'Ouest » : un petit jeu de stratégie en temps réel. Chaque joueur tient un fort,
// bâtit des mines (sur les filons), des ranchs et des plantations pour gagner de l'or et des vivres, recrute
// des unités (il faut les ressources, et elles mettent du temps à sortir) et les envoie prendre les forts
// adverses. Le dernier fort debout gagne ; au bout du temps, c'est le meilleur score.
// La carte (terrains variés, rivière et gués, filons) vient d'une graine : chaque navigateur la recalcule.
// L'hôte simule tout (économie, unités, combats) et envoie un instantané de la partie 4 fois par seconde.
// Même interface que MiniGame (mini.js) pour net.js.
import { MODES, COUNTDOWN, rng } from './worlds.js';

const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export const RTS = {
  tile: 8, cols: 48, rows: 23, // la carte fait 384 × 184 px ; le bas de l'écran est réservé aux commandes
  mapH: 184,
  snapMs: 250, // un instantané toutes les 250 ms
  territory: 60, // rayon constructible autour du fort (px)…
  reach: 34, // …et autour de chacun de ses bâtiments : on s'étend de proche en proche
  popCap: 24,
  start: { gold: 170, food: 60 },
  fortHp: 900, fortIncome: 1.2, fortRange: 50, fortDps: 9,
  buildTime: 3000, // chantier avant qu'un bâtiment fonctionne
  queueMax: 5,
};

// Terrains : vitesse de déplacement (0 = infranchissable) et constructible ou non
export const TERRAIN = [
  { id: 'grass', name: 'Prairie', speed: 1, build: true },
  { id: 'sand', name: 'Désert', speed: 0.85, build: true },
  { id: 'scrub', name: 'Cactus et broussailles', speed: 0.55, build: false },
  { id: 'rock', name: 'Rochers', speed: 0, build: false },
  { id: 'water', name: 'Rivière', speed: 0, build: false },
  { id: 'ford', name: 'Gué', speed: 0.5, build: false },
];
export const T = { grass: 0, sand: 1, scrub: 2, rock: 3, water: 4, ford: 5 };

export const VEINS = { gold: { name: "Filon d'or", rate: 2.6 }, ore: { name: 'Filon de minerai', rate: 1.4 } };

// w : côté en cases (8 px)
export const BUILDINGS = {
  mine: { name: 'Mine', cost: 60, hp: 220, w: 2, desc: "Sur un filon. Or : beaucoup sur un filon d'or, moins sur du minerai." },
  ranch: { name: 'Ranch', cost: 45, hp: 200, w: 2, food: 1.6, desc: 'Élève du bétail : des vivres.' },
  farm: { name: 'Plantation', cost: 55, hp: 180, w: 2, food: 0.9, gold: 0.7, desc: "Coton et maïs : un peu d'or et de vivres." },
  stable: { name: 'Écurie', cost: 90, hp: 260, w: 2, desc: 'Permet de recruter des cavaliers.' },
  armory: { name: 'Armurerie', cost: 110, hp: 260, w: 2, desc: 'Permet de recruter des tireurs et des dynamiteurs.' },
  tower: { name: 'Tour de guet', cost: 80, hp: 320, w: 1, range: 52, dps: 7, desc: 'Tire sur les ennemis qui approchent.' },
};
export const BUILD_IDS = Object.keys(BUILDINGS);

// speed en px/s, dps contre les unités ; siege = dps contre les bâtiments
export const UNITS = {
  gunman: { name: 'Pistolero', gold: 25, food: 10, time: 5000, hp: 40, dps: 6, siege: 3, range: 24, speed: 16, from: 'fort' },
  rider: { name: 'Cavalier', gold: 45, food: 22, time: 7000, hp: 62, dps: 8, siege: 3, range: 12, speed: 30, from: 'stable' },
  rifle: { name: 'Tireur', gold: 40, food: 12, time: 7000, hp: 28, dps: 8, siege: 2, range: 54, speed: 13, from: 'armory' },
  dyn: { name: 'Dynamiteur', gold: 55, food: 16, time: 8000, hp: 32, dps: 3, siege: 34, range: 16, speed: 14, from: 'armory' },
};
export const UNIT_IDS = Object.keys(UNITS);
export const KIND_IDS = ['fort', ...BUILD_IDS]; // index des sortes de bâtiments dans les instantanés

export const RTS_PTS = { build: 10, kill: 10, raze: 40, fort: 300, minePer: 0.1 };

// Emplacement des forts (case du centre ; le fort fait 3 × 3 cases)
export function fortSpots(n) {
  if (n <= 2) return [[4, 11], [43, 11]];
  if (n === 3) return [[4, 11], [43, 4], [43, 18]];
  return [[4, 4], [43, 4], [4, 18], [43, 18]];
}

const COLS = RTS.cols, ROWS = RTS.rows;
export const tileAt = (w, c, r) => (c < 0 || r < 0 || c >= COLS || r >= ROWS ? T.rock : w.tiles[r * COLS + c]);
export const speedAt = (w, c, r) => TERRAIN[tileAt(w, c, r)].speed;
export const buildable = (w, c, r) => TERRAIN[tileAt(w, c, r)].build;
export const center = (c) => c * RTS.tile + RTS.tile / 2;
export const bCenter = (b) => ({ x: (b.x + b.w / 2) * RTS.tile, y: (b.y + b.w / 2) * RTS.tile });

// ------------------------------------------------------------ la carte
// Bruit de valeur (grille grossière interpolée) : de grandes plaques de désert et de broussailles.
function valueNoise(R, step) {
  const gw = Math.ceil(COLS / step) + 2, gh = Math.ceil(ROWS / step) + 2;
  const g = Array.from({ length: gw * gh }, () => R());
  return (c, r) => {
    const x = c / step, y = r / step, x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
    const v = (i, j) => g[(y0 + j) * gw + (x0 + i)];
    const s = (k) => k * k * (3 - 2 * k);
    const a = v(0, 0) + (v(1, 0) - v(0, 0)) * s(fx), b = v(0, 1) + (v(1, 1) - v(0, 1)) * s(fx);
    return a + (b - a) * s(fy);
  };
}

export function rtsWorld(seed, n) {
  const R = rng((seed ^ 0x6a09e667) >>> 0);
  const ri = (a, b) => a + Math.floor(R() * (b - a + 1));
  const forts = fortSpots(n);
  const tiles = new Uint8Array(COLS * ROWS);
  const set = (c, r, v) => { if (c >= 0 && r >= 0 && c < COLS && r < ROWS) tiles[r * COLS + c] = v; };
  const get = (c, r) => tiles[r * COLS + c];
  const sandN = valueNoise(R, 7), scrubN = valueNoise(R, 5);
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      let v = sandN(c, r) > 0.56 ? T.sand : T.grass;
      if (scrubN(c, r) > 0.72) v = T.scrub;
      tiles[r * COLS + c] = v;
    }
  }
  // massifs rocheux aux bords irréguliers
  const nRocks = ri(6, 9);
  for (let k = 0; k < nRocks; k++) {
    const cx = ri(8, COLS - 9), cy = ri(1, ROWS - 2), rad = 1.4 + R() * 1.8;
    for (let r = cy - 4; r <= cy + 4; r++) for (let c = cx - 5; c <= cx + 5; c++) {
      const d = Math.hypot((c - cx) / 1.25, r - cy);
      if (d < rad + (R() - 0.5) * 0.9) set(c, r, T.rock);
    }
  }
  // la rivière serpente du nord au sud, avec des gués pour traverser
  let rx = ri(20, 27);
  const fordRows = new Set();
  const nf = 3;
  for (let k = 0; k < nf; k++) fordRows.add(Math.round(((k + 0.5) * ROWS) / nf) + ri(-1, 1));
  for (let r = 0; r < ROWS; r++) {
    if (R() < 0.45) rx = clamp(rx + (R() < 0.5 ? -1 : 1), 18, 29);
    const ford = fordRows.has(r) || fordRows.has(r - 1);
    for (const c of [rx, rx + 1]) set(c, r, ford ? T.ford : T.water);
  }
  // places dégagées autour des forts
  for (const [fx, fy] of forts) {
    for (let r = fy - 4; r <= fy + 4; r++) for (let c = fx - 4; c <= fx + 4; c++) {
      if (Math.hypot(c - fx, r - fy) <= 4.3 && get(clamp(c, 0, COLS - 1), clamp(r, 0, ROWS - 1)) !== T.water) set(c, r, T.grass);
    }
  }
  const world = { seed, n, tiles, forts, veins: [] };
  // tous les forts doivent être reliés (sinon on dégage les rochers qui gênent)
  const reach = flowField(world, [forts[0][1] * COLS + forts[0][0]]);
  if (forts.some(([fx, fy]) => !Number.isFinite(reach[fy * COLS + fx]))) for (let i = 0; i < tiles.length; i++) if (tiles[i] === T.rock) tiles[i] = T.grass;

  // filons : un d'or et un de minerai près de chaque fort (départ équitable), d'autres au hasard, plus disputés
  const free2 = (c, r) => [[0, 0], [1, 0], [0, 1], [1, 1]].every(([dx, dy]) => buildable(world, c + dx, r + dy))
    && !world.veins.some((v) => Math.abs(v.x - c) < 4 && Math.abs(v.y - r) < 4)
    && !forts.some(([fx, fy]) => Math.abs(c + 0.5 - fx) < 3 && Math.abs(r + 0.5 - fy) < 3);
  const place = (kind, test, tries = 300) => {
    for (let k = 0; k < tries; k++) {
      const c = ri(0, COLS - 2), r = ri(0, ROWS - 2);
      if (free2(c, r) && test(c, r)) { world.veins.push({ id: world.veins.length, x: c, y: r, kind }); return true; }
    }
    return false;
  };
  for (const [fx, fy] of forts) {
    for (const kind of ['gold', 'ore']) place(kind, (c, r) => { const d = Math.hypot(c + 1 - fx, r + 1 - fy); return d > 3.5 && d < 6.5; });
  }
  const extra = ri(4, 6);
  for (let k = 0; k < extra; k++) place(k < 3 ? 'gold' : 'ore', (c) => c > 9 && c < COLS - 11);
  for (let k = 0; k < 3; k++) place('ore', () => true);
  return world;
}

// ------------------------------------------------------------ chemins
// Distance (en secondes de marche, terrain compris) de chaque case jusqu'au but : les unités descendent la pente.
const DIRS = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]];
export function flowField(world, goals) {
  const N = COLS * ROWS;
  const dist = new Float64Array(N).fill(Infinity);
  const heap = [];
  const push = (d, i) => {
    heap.push([d, i]);
    let k = heap.length - 1;
    while (k > 0) { const p = (k - 1) >> 1; if (heap[p][0] <= heap[k][0]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; k = p; }
  };
  const pop = () => {
    const top = heap[0], last = heap.pop();
    if (heap.length) {
      heap[0] = last;
      let k = 0;
      for (;;) {
        const l = 2 * k + 1, r = l + 1;
        let m = k;
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
        if (m === k) break;
        [heap[m], heap[k]] = [heap[k], heap[m]];
        k = m;
      }
    }
    return top;
  };
  for (const g of goals) { dist[g] = 0; push(0, g); }
  while (heap.length) {
    const [d, i] = pop();
    if (d > dist[i]) continue;
    const c = i % COLS, r = (i - c) / COLS;
    for (const [dx, dy, len] of DIRS) {
      const nc = c + dx, nr = r + dy;
      const sp = speedAt(world, nc, nr);
      if (!sp) continue;
      if (dx && dy && (!speedAt(world, c + dx, r) || !speedAt(world, c, r + dy))) continue; // pas de coin coupé
      const nd = d + len / sp;
      const j = nr * COLS + nc;
      if (nd < dist[j]) { dist[j] = nd; push(nd, j); }
    }
  }
  return dist;
}

// ------------------------------------------------------------ règles de construction
// Territoire d'un joueur : autour de son fort et de chacun de ses bâtiments.
export function inTerritory(fort, blds, owner, px, py) {
  if (Math.hypot(px - fort.x, py - fort.y) <= RTS.territory) return true;
  return blds.some((b) => b.owner === owner && b.kind !== 'fort' && Math.hypot(px - bCenter(b).x, py - bCenter(b).y) <= RTS.reach);
}

// Peut-on bâtir `kind` avec le coin haut-gauche en (c, r) ? Renvoie null ou la raison du refus.
export function canBuild(world, blds, owner, kind, c, r, veinsTaken) {
  const B = BUILDINGS[kind];
  if (!B) return 'Bâtiment inconnu.';
  for (let dy = 0; dy < B.w; dy++) for (let dx = 0; dx < B.w; dx++) if (!buildable(world, c + dx, r + dy)) return 'Terrain impossible (rochers, rivière ou broussailles).';
  for (const b of blds) if (c < b.x + b.w && c + B.w > b.x && r < b.y + b.w && r + B.w > b.y) return 'La place est déjà prise.';
  const fortB = blds.find((b) => b.kind === 'fort' && b.owner === owner);
  if (!fortB) return 'Ton fort est tombé.';
  const cx = (c + B.w / 2) * RTS.tile, cy = (r + B.w / 2) * RTS.tile;
  if (!inTerritory(bCenter(fortB), blds, owner, cx, cy)) return 'Hors de ton territoire : bâtis plus près de tes bâtiments.';
  if (kind === 'mine') {
    const v = world.veins.find((x) => x.x === c && x.y === r);
    if (!v) return 'Une mine se pose sur un filon.';
    if (veinsTaken.has(v.id)) return 'Ce filon est déjà exploité.';
  } else if (world.veins.some((v) => c < v.x + 2 && c + B.w > v.x && r < v.y + 2 && r + B.w > v.y)) return 'Garde les filons pour les mines.';
  return null;
}

// ------------------------------------------------------------ arbitre (navigateur de l'hôte)
export class RtsGame {
  constructor(players) {
    this.kind = 'rts';
    this.seed = Math.floor(Math.random() * 2 ** 31);
    this.duration = MODES.rts.duration;
    const n = players.length;
    this.world = rtsWorld(this.seed, n);
    this.p = players.map((pl, i) => ({
      key: pl.key, name: pl.name, character: pl.character, bot: !!pl.bot,
      score: 0, left: false, alive: true, out: null,
      gold: RTS.start.gold, food: RTS.start.food, order: { mode: 'defend' },
      stats: { throws: 0, catches: 0, hits: 0, hurt: 0 },
      ai: pl.bot ? { next: 1500 + i * 400, wave: 6 + Math.floor(Math.random() * 4) } : null,
    }));
    this.nextId = 1;
    this.blds = this.world.forts.map(([fx, fy], i) => ({
      id: this.nextId++, owner: i, kind: 'fort', x: fx - 1, y: fy - 1, w: 3, hp: RTS.fortHp, maxHp: RTS.fortHp, build: 0, queue: [], prog: 0, cd: 0,
    }));
    this.units = [];
    this.shots = [];
    this.veinsTaken = new Map(); // filon -> bâtiment
    this.flows = new Map();
    this.phase = 'playing';
    this.winner = null;
    this.ranking = null;
    this.events = [];
    this.liveOut = [];
    this.startAt = 0;
    this.lastT = 0;
    this.lastSnap = -1e9;
  }

  get t() { return Date.now() - this.startAt; }

  start() {
    this.startAt = Date.now() + COUNTDOWN;
    this.push({ type: 'mgStart', kind: this.kind, seed: this.seed, countdown: COUNTDOWN, duration: this.duration });
    this.push(this.snap());
    return this.flush();
  }

  flush() { const e = this.events; this.events = []; return e; }

  view(i) {
    return {
      kind: this.kind, me: i, phase: this.phase, winner: this.winner, ranking: this.ranking, n: this.p.length,
      players: this.p.map((p) => ({ key: p.key, name: p.name, character: p.character, score: Math.round(p.score), left: p.left, bot: p.bot, alive: p.alive })),
    };
  }

  syncView(i) { return { ...this.view(i), seed: this.seed, duration: this.duration, elapsed: this.t, snap: this.snap() }; }

  push(ev) {
    ev.dur = 0;
    ev.states = this.p.map((_, i) => this.view(i));
    this.events.push(ev);
  }

  fortOf(i) { return this.blds.find((b) => b.kind === 'fort' && b.owner === i); }

  // ---------------------------------------------------------- commandes des joueurs
  act(i, a) {
    if (this.phase !== 'playing') return { error: 'La partie est terminée.' };
    if (!a || typeof a !== 'object') return { error: 'Action invalide.' };
    const p = this.p[i];
    if (!p || p.left) return { events: [] };
    if (!p.alive) return { error: 'Ton fort est tombé : tu regardes la fin de la partie.' };
    if (this.t < 0) return { error: 'Patience, la partie commence…' };
    let err = null;
    if (a.kind === 'build') err = this.build(i, a.b, a.x, a.y);
    else if (a.kind === 'train') err = this.train(i, a.u);
    else if (a.kind === 'order') err = this.order(i, a);
    else err = 'Action inconnue.';
    if (err) return { error: err };
    return { events: this.flush() };
  }

  build(i, kind, c, r) {
    if (!Number.isInteger(c) || !Number.isInteger(r)) return 'Emplacement invalide.';
    const B = BUILDINGS[kind];
    if (!B) return 'Bâtiment inconnu.';
    const p = this.p[i];
    if (p.gold < B.cost) return `Pas assez d'or : ${B.name} coûte ${B.cost}.`;
    const why = canBuild(this.world, this.blds, i, kind, c, r, this.veinsTaken);
    if (why) return why;
    p.gold -= B.cost;
    const b = { id: this.nextId++, owner: i, kind, x: c, y: r, w: B.w, hp: B.hp, maxHp: B.hp, build: RTS.buildTime, queue: [], prog: 0, cd: 0 };
    if (kind === 'mine') { const v = this.world.veins.find((x) => x.x === c && x.y === r); b.vein = v.id; this.veinsTaken.set(v.id, b.id); }
    this.blds.push(b);
    p.score += RTS_PTS.build;
    return null;
  }

  train(i, u) {
    const U = UNITS[u];
    if (!U) return 'Unité inconnue.';
    const p = this.p[i];
    const from = this.blds.filter((b) => b.owner === i && b.kind === U.from && b.build <= 0);
    if (!from.length) return `Il faut ${U.from === 'stable' ? 'une écurie' : 'une armurerie'} pour recruter des ${U.name.toLowerCase()}s.`;
    if (p.gold < U.gold || p.food < U.food) return `${U.name} : ${U.gold} or et ${U.food} vivres.`;
    const b = from.reduce((a, x) => (x.queue.length < a.queue.length ? x : a));
    if (b.queue.length >= RTS.queueMax) return 'File de recrutement pleine.';
    p.gold -= U.gold;
    p.food -= U.food;
    b.queue.push(u);
    return null;
  }

  order(i, a) {
    const p = this.p[i];
    if (a.mode === 'defend') p.order = { mode: 'defend' };
    else if (a.mode === 'attack' && Number.isInteger(a.target) && this.p[a.target]?.alive && a.target !== i) p.order = { mode: 'attack', target: a.target };
    else if (a.mode === 'rally' && Number.isFinite(a.x) && Number.isFinite(a.y)) p.order = { mode: 'rally', x: clamp(a.x, 4, 380), y: clamp(a.y, 4, RTS.mapH - 4) };
    else return 'Ordre invalide.';
    this.push({ type: 'order', by: i, order: p.order });
    return null;
  }

  // ---------------------------------------------------------- simulation
  flowTo(c, r) {
    c = clamp(c, 0, COLS - 1); r = clamp(r, 0, ROWS - 1);
    const key = r * COLS + c;
    let f = this.flows.get(key);
    if (!f) {
      if (this.flows.size > 300) this.flows.delete(this.flows.keys().next().value); // les plus anciens buts partent
      f = flowField(this.world, [key]);
      this.flows.set(key, f);
    }
    return f;
  }

  // but de l'unité selon l'ordre de son joueur
  goalOf(u) {
    const o = this.p[u.owner].order;
    if (o.mode === 'attack' && this.p[o.target]?.alive) { const f = bCenter(this.fortOf(o.target)); return { x: f.x, y: f.y, fort: o.target }; }
    if (o.mode === 'rally') return { x: o.x, y: o.y };
    const f = bCenter(this.fortOf(u.owner));
    return { x: f.x + ((u.id * 37) % 40) - 20, y: f.y + 18 + ((u.id * 17) % 16) - 8, home: true };
  }

  step(u, tx, ty, dt) {
    const c = Math.floor(u.x / RTS.tile), r = Math.floor(u.y / RTS.tile);
    const sp = UNITS[u.kind].speed * Math.max(0.35, speedAt(this.world, c, r) || 0.35) * dt;
    const gc = Math.floor(tx / RTS.tile), gr = Math.floor(ty / RTS.tile);
    let nx = tx, ny = ty;
    if (Math.abs(gc - c) + Math.abs(gr - r) > 1) {
      // on suit la pente de la carte des distances vers la case du but
      const f = this.flowTo(gc, gr);
      let best = f[r * COLS + c], bc = c, br = r;
      for (const [dx, dy] of DIRS) {
        const nc = c + dx, nr = r + dy;
        if (nc < 0 || nr < 0 || nc >= COLS || nr >= ROWS) continue;
        if (dx && dy && (!speedAt(this.world, c + dx, r) || !speedAt(this.world, c, r + dy))) continue;
        const d = f[nr * COLS + nc];
        if (d < best) { best = d; bc = nc; br = nr; }
      }
      nx = center(bc); ny = center(br);
    }
    const d = Math.hypot(nx - u.x, ny - u.y);
    if (d < 0.01) return true;
    const k = Math.min(1, sp / d);
    const x2 = u.x + (nx - u.x) * k, y2 = u.y + (ny - u.y) * k;
    if (speedAt(this.world, Math.floor(x2 / RTS.tile), Math.floor(y2 / RTS.tile))) { u.x = x2; u.y = y2; }
    u.face = nx < u.x ? -1 : 1;
    return d <= sp;
  }

  tick() {
    if (this.phase !== 'playing') return [];
    const t = this.t;
    if (t < 0) return this.flush();
    const dt = Math.min(0.25, Math.max(0, (t - this.lastT) / 1000));
    this.lastT = t;
    this.economy(dt);
    this.production(dt * 1000);
    this.combat(dt, t);
    this.p.forEach((p, i) => { if (p.ai && p.alive && !p.left && t >= p.ai.next) this.botThink(i, t); });
    if (t - this.lastSnap >= RTS.snapMs) { this.lastSnap = t; this.push(this.snap()); this.shots = []; }
    const alive = this.p.filter((p) => p.alive && !p.left);
    if (alive.length <= 1 && this.p.length > 1) this.finish();
    else if (t >= this.duration + 400) this.finish();
    return this.flush();
  }

  economy(dt) {
    this.p.forEach((p, i) => {
      if (!p.alive) return;
      let gold = RTS.fortIncome, food = 0;
      for (const b of this.blds) {
        if (b.owner !== i || b.build > 0) continue;
        if (b.kind === 'mine') gold += VEINS[this.world.veins[b.vein].kind].rate;
        const B = BUILDINGS[b.kind];
        if (B?.food) food += B.food;
        if (B?.gold) gold += B.gold;
      }
      p.gold += gold * dt;
      p.food += food * dt;
      p.score += gold * dt * RTS_PTS.minePer;
    });
  }

  production(ms) {
    for (const b of this.blds) {
      if (b.build > 0) { b.build -= ms; continue; }
      if (!b.queue.length) { b.prog = 0; continue; }
      const U = UNITS[b.queue[0]];
      if (this.units.filter((u) => u.owner === b.owner).length >= RTS.popCap) continue; // armée au complet : on attend
      b.prog += ms;
      if (b.prog >= U.time) {
        const kind = b.queue.shift();
        b.prog = 0;
        const c = bCenter(b);
        const a = Math.random() * Math.PI * 2;
        let x = c.x + Math.cos(a) * (b.w * 5 + 4), y = c.y + Math.sin(a) * (b.w * 5 + 4);
        if (!speedAt(this.world, Math.floor(x / RTS.tile), Math.floor(y / RTS.tile))) { x = c.x; y = c.y + b.w * 4 + 2; }
        this.units.push({ id: this.nextId++, owner: b.owner, kind, x, y, hp: UNITS[kind].hp, face: 1, target: null, shotAt: 0 });
      }
    }
  }

  // ennemi le plus proche (unité, sinon bâtiment) à portée de regard
  nearestFoe(u, look, preferBld) {
    let best = null, bd = look;
    if (!preferBld) {
      for (const v of this.units) {
        if (v.owner === u.owner) continue;
        const d = Math.hypot(v.x - u.x, v.y - u.y);
        if (d < bd) { bd = d; best = v; }
      }
      if (best) return best;
    }
    bd = look + 10;
    for (const b of this.blds) {
      if (b.owner === u.owner || !this.p[b.owner].alive) continue;
      const c = bCenter(b);
      const d = Math.hypot(c.x - u.x, c.y - u.y) - b.w * 4;
      if (d < bd) { bd = d; best = b; }
    }
    if (!best && preferBld) return this.nearestFoe(u, look, false);
    return best;
  }

  combat(dt, t) {
    const dead = new Set();
    for (const u of this.units) {
      const U = UNITS[u.kind];
      const foe = this.nearestFoe(u, U.range + 26, u.kind === 'dyn');
      if (foe) {
        const isB = !!foe.kind && foe.w;
        const fc = isB ? bCenter(foe) : foe;
        const reachD = U.range + (isB ? foe.w * 4 : 0);
        const d = Math.hypot(fc.x - u.x, fc.y - u.y);
        if (d > reachD) this.step(u, fc.x, fc.y, dt);
        else {
          u.face = fc.x < u.x ? -1 : 1;
          this.damage(foe, (isB ? U.siege : U.dps) * dt, u.owner, isB);
          if (t - u.shotAt > (u.kind === 'dyn' && isB ? 900 : 550)) { u.shotAt = t; this.shots.push([Math.round(u.x), Math.round(u.y), Math.round(fc.x), Math.round(fc.y), UNIT_IDS.indexOf(u.kind)]); }
        }
        continue;
      }
      const g = this.goalOf(u);
      if (Math.hypot(g.x - u.x, g.y - u.y) > (g.home ? 3 : 10)) this.step(u, g.x, g.y, dt);
    }
    // les forts et les tours tirent sur l'unité ennemie la plus proche
    for (const b of this.blds) {
      if (b.build > 0 || (b.kind !== 'fort' && b.kind !== 'tower') || !this.p[b.owner].alive) continue;
      const range = b.kind === 'fort' ? RTS.fortRange : BUILDINGS.tower.range, dps = b.kind === 'fort' ? RTS.fortDps : BUILDINGS.tower.dps;
      const c = bCenter(b);
      let best = null, bd = range;
      for (const v of this.units) { if (v.owner === b.owner) continue; const d = Math.hypot(v.x - c.x, v.y - c.y); if (d < bd) { bd = d; best = v; } }
      if (best) {
        this.damage(best, dps * dt, b.owner, false);
        if (t - b.cd > 650) { b.cd = t; this.shots.push([Math.round(c.x), Math.round(c.y - b.w * 4), Math.round(best.x), Math.round(best.y), 4]); }
      }
    }
    // séparation : les unités ne s'empilent pas
    for (let a = 0; a < this.units.length; a++) {
      const u = this.units[a];
      for (let b = a + 1; b < this.units.length; b++) {
        const v = this.units[b];
        const dx = v.x - u.x, dy = v.y - u.y, d = Math.hypot(dx, dy);
        if (d > 0 && d < 5) {
          const k = (5 - d) / 2 / d;
          const tryMove = (w, sx, sy) => { if (speedAt(this.world, Math.floor((w.x + sx) / RTS.tile), Math.floor((w.y + sy) / RTS.tile))) { w.x += sx; w.y += sy; } };
          tryMove(u, -dx * k, -dy * k);
          tryMove(v, dx * k, dy * k);
        }
      }
    }
    for (const u of this.units) if (u.hp <= 0) dead.add(u);
    if (dead.size) this.units = this.units.filter((u) => !dead.has(u));
    // bâtiments détruits
    const razed = this.blds.filter((b) => b.hp <= 0);
    for (const b of razed) this.raze(b, t);
  }

  damage(target, amount, by, isB) {
    const was = target.hp;
    target.hp -= amount;
    if (was > 0 && target.hp <= 0) {
      const p = this.p[by];
      if (!p) return;
      if (isB) { target.razedBy = by; p.score += target.kind === 'fort' ? RTS_PTS.fort : RTS_PTS.raze; } else p.score += RTS_PTS.kill;
    }
  }

  raze(b, t) {
    this.blds = this.blds.filter((x) => x !== b);
    if (b.vein != null) this.veinsTaken.delete(b.vein);
    this.push({ type: 'razed', kind: b.kind, owner: b.owner, by: b.razedBy ?? -1, x: bCenter(b).x, y: bCenter(b).y });
    if (b.kind !== 'fort') return;
    // fort tombé : le joueur est éliminé, ce qui lui reste disparaît
    const p = this.p[b.owner];
    p.alive = false;
    p.out = t;
    this.blds = this.blds.filter((x) => x.owner !== b.owner);
    for (const [v, id] of [...this.veinsTaken]) if (!this.blds.some((x) => x.id === id)) this.veinsTaken.delete(v);
    this.units = this.units.filter((u) => u.owner !== b.owner);
    for (const q of this.p) if (q.order.mode === 'attack' && q.order.target === b.owner) q.order = { mode: 'defend' };
    this.push({ type: 'fortDown', who: b.owner, by: b.razedBy ?? -1 });
  }

  // Instantané compact de la partie, pour tous les joueurs (les autres navigateurs l'affichent en le lissant).
  snap() {
    return {
      type: 'snap', t: Math.round(this.t),
      P: this.p.map((p, i) => [Math.floor(p.gold), Math.floor(p.food), p.alive ? 1 : 0, this.units.filter((u) => u.owner === i).length,
        p.order.mode === 'attack' ? p.order.target : p.order.mode === 'rally' ? -2 : -1]),
      B: this.blds.map((b) => [b.id, b.owner, KIND_IDS.indexOf(b.kind), b.x, b.y, Math.max(0, Math.round(b.hp)), b.maxHp, b.build > 0 ? Math.round(b.build) : 0,
        b.queue.map((u) => UNIT_IDS.indexOf(u)).join(''), b.queue.length ? Math.round((b.prog / UNITS[b.queue[0]].time) * 100) : 0]),
      U: this.units.map((u) => [u.id, u.owner, UNIT_IDS.indexOf(u.kind), Math.round(u.x * 2), Math.round(u.y * 2), Math.max(0, Math.round(u.hp)), u.face]),
      S: this.shots.slice(-24),
    };
  }

  finish() {
    if (this.phase !== 'playing') return;
    this.phase = 'over';
    const order = this.p.map((_, i) => i).sort((a, b) => {
      const A = this.p[a], B = this.p[b];
      if (A.left !== B.left) return A.left - B.left;
      if (A.alive !== B.alive) return B.alive - A.alive;
      if (!A.alive) return (B.out ?? 0) - (A.out ?? 0); // éliminé plus tard = mieux classé
      return B.score - A.score;
    });
    this.p.forEach((p) => { p.score = Math.round(p.score); });
    this.ranking = order;
    this.winner = order[0];
    const tie = order.length > 1 && this.p[order[1]].alive && this.p[order[0]].alive && this.p[order[1]].score === this.p[order[0]].score;
    this.push(this.snap());
    this.push({ type: 'matchEnd', winner: this.winner, ranking: order, tie });
  }

  leave(i) {
    if (this.phase !== 'playing' || !this.p[i]) return [];
    this.p[i].left = true;
    this.p[i].order = { mode: 'defend' };
    this.push({ type: 'left', who: i });
    return this.flush();
  }

  forfeit(i) {
    if (this.phase !== 'playing' || !this.p[i]) return [];
    this.p[i].left = true;
    this.finish();
    return this.flush();
  }

  // ---------------------------------------------------------- bots (mode solo)
  // Un bot développe son économie (mines sur les filons proches, ranchs, plantation), puis écurie, armurerie,
  // une tour ; il recrute sans cesse et lance l'assaut quand son armée est assez grosse, ou défend son fort.
  findSpot(i, kind, near) {
    const f = this.fortOf(i);
    if (!f) return null;
    const fc = bCenter(f);
    const ox = near ? near.x : fc.x, oy = near ? near.y : fc.y;
    let best = null, bd = Infinity;
    for (let r = 0; r < ROWS - 1; r++) for (let c = 0; c < COLS - 1; c++) {
      const d = Math.hypot(center(c) - ox, center(r) - oy);
      if (d >= bd || d > 90) continue;
      if (!canBuild(this.world, this.blds, i, kind, c, r, this.veinsTaken)) { bd = d; best = { c, r }; }
    }
    return best;
  }

  botThink(i, t) {
    const p = this.p[i];
    const b = p.ai;
    b.next = t + rnd(1100, 1800);
    const mine = this.blds.filter((x) => x.owner === i);
    const count = (k) => mine.filter((x) => x.kind === k).length;
    const fc = bCenter(this.fortOf(i));
    // 1. une mine sur le filon libre le plus proche, dans le territoire
    if (p.gold >= BUILDINGS.mine.cost) {
      const veins = this.world.veins.filter((v) => !this.veinsTaken.has(v.id) && !canBuild(this.world, this.blds, i, 'mine', v.x, v.y, this.veinsTaken))
        .sort((a, c) => Math.hypot(center(a.x) - fc.x, center(a.y) - fc.y) - Math.hypot(center(c.x) - fc.x, center(c.y) - fc.y));
      if (veins.length && this.build(i, 'mine', veins[0].x, veins[0].y) === null) return;
    }
    // 2. économie, puis bâtiments militaires
    const want = count('ranch') < 1 ? 'ranch' : count('mine') >= 1 && count('farm') < 1 ? 'farm' : count('ranch') < 2 && count('mine') >= 2 ? 'ranch'
      : count('stable') < 1 && count('mine') >= 2 ? 'stable' : count('armory') < 1 && count('stable') >= 1 ? 'armory' : count('tower') < 1 && t > 90000 ? 'tower' : null;
    if (want && p.gold >= BUILDINGS[want].cost + 20) {
      // vers le filon libre le plus proche hors territoire : on s'étend pour l'atteindre
      const s = this.findSpot(i, want, null);
      if (s && this.build(i, want, s.c, s.r) === null) return;
    }
    // 3. recruter
    const can = UNIT_IDS.filter((k) => this.blds.some((x) => x.owner === i && x.kind === UNITS[k].from && x.build <= 0));
    const pick = can[Math.floor(Math.random() * can.length)];
    if (pick && p.gold >= UNITS[pick].gold + 25 && p.food >= UNITS[pick].food) this.train(i, pick);
    // 4. ordres : défendre si le fort est menacé, attaquer quand l'armée est prête
    const army = this.units.filter((u) => u.owner === i);
    const threat = this.units.some((u) => u.owner !== i && Math.hypot(u.x - fc.x, u.y - fc.y) < 80);
    if (threat) p.order = { mode: 'defend' };
    else if (army.length >= b.wave) {
      const foes = this.p.map((q, j) => j).filter((j) => j !== i && this.p[j].alive);
      if (foes.length) {
        const target = foes.sort((a, c) => this.fortOf(a).hp - this.fortOf(c).hp)[0];
        if (p.order.mode !== 'attack') { p.order = { mode: 'attack', target }; b.wave = 7 + Math.floor(Math.random() * 6); }
      }
    } else if (p.order.mode === 'attack' && army.length < 3) p.order = { mode: 'defend' };
  }
}
