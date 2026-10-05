// Mini-jeu « La mine » : une course en wagonnet jusqu'à la sortie de la mine, en quatre étapes
// (les galeries, la descente, le gouffre, la sortie), chacune filmée autrement (mine.js).
// Trois voies reliées par des embranchements : on prépare l'aiguillage et le wagonnet change de voie au
// prochain embranchement. Sur les rails : de l'or, des obstacles, des accélérateurs, de la boue et des tremplins.
// Chaque wagonnet a sa propre vitesse (accélérateur, boue, chocs) : le premier sorti gagne un gros bonus.
// Ce fichier contient les règles partagées (le parcours vient d'une graine, chaque navigateur le recalcule,
// et le wagonnet est simulé de la même façon partout) et l'arbitre qui tourne chez l'hôte, avec la même
// interface que MiniGame (mini.js). Les autres joueurs sont des « fantômes » (positions envoyées en direct).
import { MODES, COUNTDOWN, rng } from './worlds.js';

const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smooth = (k) => (k <= 0 ? 0 : k >= 1 ? 1 : k * k * (3 - 2 * k));

export const MINE = {
  len: 8400, // longueur du parcours (px) jusqu'à la sortie
  v0: 0.1, v1: 0.17, // vitesse de base (px/ms) au départ et à la sortie : plus on descend, plus ça va vite
  slope: 0.02, // en plus, dans la descente
  jLen: 80, // longueur d'un embranchement
  stun: 900, stunMult: 0.45, // après un choc, le wagonnet tangue, freine et l'aiguillage ne répond plus
  boost: { mult: 1.6, ms: 2600 }, // accélérateur
  mud: { mult: 0.55, ms: 2000 }, // flaque de boue
  jump: 140, // un tremplin fait sauter le wagonnet sur 140 px : il passe par-dessus tout
  fallWarn: 170, // un éboulement tombe du plafond quand le wagonnet arrive à cette distance
  tolerance: 70, // écart (px) toléré par l'hôte entre la position annoncée et l'objet touché
  arrival: [150, 100, 60, 30], // bonus d'arrivée selon le rang
};

// Les étapes (début en fraction du parcours) et leur caméra (mine.js)
export const STAGES = [
  { id: 'galeries', name: 'LES GALERIES', from: 0, cam: 'side' },
  { id: 'descente', name: 'LA DESCENTE', from: 0.3, cam: 'back' },
  { id: 'gouffre', name: 'LE GOUFFRE', from: 0.6, cam: 'wide' },
  { id: 'sortie', name: 'LA SORTIE', from: 0.9, cam: 'back' },
];
export function stageAt(wx) {
  let s = 0;
  for (let i = 1; i < STAGES.length; i++) if (wx >= STAGES[i].from * MINE.len) s = i;
  return s;
}

// Ce qu'on ramasse, ce qu'on percute, et ce qui change la vitesse
export const GOLD = {
  gold: { name: 'Pépite', pts: 10 },
  nugget: { name: 'Grosse pépite', pts: 25 },
  gem: { name: 'Diamant', pts: 50 },
};
export const OBSTACLES = {
  rock: { name: 'Éboulis', pts: -20 },
  beam: { name: 'Poutre', pts: -20 },
  barrel: { name: 'Tonneau', pts: -20 },
  cart: { name: 'Wagonnet renversé', pts: -20 },
  tnt: { name: 'TNT', pts: -40 },
  fall: { name: 'Éboulement', pts: -20 }, // tombe du plafond au dernier moment
  gap: { name: 'Rail cassé', pts: -30 }, // dans le gouffre
};
export const PADS = {
  boost: { name: 'Accélérateur' },
  mud: { name: 'Flaque de boue' },
  ramp: { name: 'Tremplin' },
};

// Vitesse de base à un endroit du parcours (la même pour tout le monde)
export const baseSpeed = (wx) => MINE.v0 + (MINE.v1 - MINE.v0) * clamp(wx / MINE.len, 0, 1) + (stageAt(wx) === 1 ? MINE.slope : 0);
// Distance maximale atteignable à l'instant t (contrôle de l'hôte)
export const maxReach = (t) => Math.max(0, t) * (MINE.v1 + MINE.slope) * MINE.boost.mult + 200;

// Le parcours : des embranchements entre deux voies voisines, chacun suivi d'un obstacle sur l'une
// des deux voies (à toi de prendre la bonne), de l'or sur l'autre, puis une ligne droite avec de l'or en vrac,
// des accélérateurs et de la boue. Rien autour des changements d'étape (la caméra change à ce moment-là).
export function mineWorld(seed) {
  const R = rng((seed ^ 0x1f123bb5) >>> 0);
  const between = (a, b) => a + R() * (b - a);
  const pick = (a) => a[Math.floor(R() * a.length)];
  const L = MINE.len;
  const junctions = [], obstacles = [], gold = [], pads = [], bats = [];
  const bounds = STAGES.slice(1).map((s) => s.from * L);
  const blocked = (a, b) => bounds.some((B) => b > B - 220 && a < B + 220);
  const addGold = (x, lane, kind = 'gold') => gold.push({ id: gold.length, x: Math.round(x), lane, kind });
  const addObs = (x, lane, kind) => obstacles.push({ id: obstacles.length, x: Math.round(x), lane, kind });
  const addPad = (x, lane, kind) => pads.push({ id: pads.length, x: Math.round(x), lane, kind });
  const obsKind = (st, p) => {
    if (R() < 0.08 + 0.12 * p) return 'tnt';
    if (st === 'gouffre') return R() < 0.6 ? 'gap' : pick(['rock', 'barrel', 'cart']);
    if (st === 'galeries' && R() < 0.3) return 'fall';
    return pick(['rock', 'beam', 'barrel', 'cart']);
  };
  const end = STAGES[3].from * L - 220; // la sortie est une ligne droite
  let x = 560, prev = null;
  while (x < end) {
    const p = x / L;
    const st = STAGES[stageAt(x)].id;
    const span = 520 * (1 - 0.3 * p);
    if (blocked(x, x + span)) { x += 40; continue; }
    const a = Math.floor(R() * 2); // embranchement entre la voie a et la voie a + 1
    const bad = a + (R() < 0.5 ? 0 : 1);
    const good = bad === a ? a + 1 : a;
    const other = a === 0 ? 2 : 0;
    junctions.push({ id: junctions.length, x: Math.round(x), a });
    const after = x + MINE.jLen;
    const ox = after + between(60, 110);
    const kind = obsKind(st, p);
    // dans le gouffre (et parfois ailleurs), un tremplin permet de sauter par-dessus l'obstacle
    if (R() < (st === 'gouffre' ? 0.45 : 0.12)) addPad(ox - 45, bad, 'ramp');
    addObs(ox, bad, kind);
    // la troisième voie se bouche aussi, mais seulement si l'embranchement d'avant obligeait à la quitter
    if (prev && prev.bad === other && R() < 0.3 + 0.4 * p) addObs(ox + between(-16, 16), other, obsKind(st, p));
    // une traînée d'or sur la bonne voie
    const n = 3 + Math.floor(R() * 3);
    for (let k = 0; k < n; k++) addGold(after + 14 + k * 18, good, k === n - 1 && R() < 0.3 ? 'nugget' : 'gold');
    if (R() < 0.18) addGold(ox + between(-30, 30), other, 'gem');
    const next = ox + between(170, 290) * (1 - 0.3 * p);
    // ligne droite : or en vrac, accélérateur, boue
    const lanes = [0, 1, 2].sort(() => R() - 0.5);
    if (next - ox > 150) {
      const gl = lanes[0];
      if (R() < 0.6) for (let gx = ox + 40; gx < next - 40; gx += 20) addGold(gx, gl);
      if (R() < (st === 'descente' ? 0.6 : 0.42)) addPad(between(ox + 40, next - 60), lanes[1], 'boost');
      if (R() < (st === 'descente' ? 0.25 : 0.35)) addPad(between(ox + 40, next - 60), lanes[2], 'mud');
      if (st !== 'gouffre' && R() < 0.12) bats.push(Math.round(ox + 40));
    }
    prev = { bad, a };
    x = next;
  }
  // la sortie : une rangée d'or sur chaque voie, et un diamant au bout
  for (let gx = end + 480; gx < L - 120; gx += 26) addGold(gx, Math.floor((gx - end) / 26) % 3);
  addGold(L - 80, 1, 'gem');
  return { junctions, obstacles, gold, pads, bats, len: L };
}

// ------------------------------------------------------------ le wagonnet (même simulation partout)
export function newCart(lane = 1) {
  return { lane, arm: 0, tr: null, wx: 0, ji: 0, stunUntil: -1e9, boostUntil: -1e9, slowUntil: -1e9, air: null, done: false };
}

export function cartSpeed(c, t) {
  let v = baseSpeed(c.wx);
  if (t < c.boostUntil) v *= MINE.boost.mult;
  if (t < c.slowUntil) v *= MINE.mud.mult;
  if (t < c.stunUntil) v *= MINE.stunMult;
  return v;
}

// Voie du wagonnet (0 à 2, fractionnaire pendant un changement de voie)
export function cartLane(c) {
  if (!c.tr) return c.lane;
  return c.tr.from + (c.tr.to - c.tr.from) * smooth((c.wx - c.tr.x0) / MINE.jLen);
}
// Hauteur du saut (px) au-dessus des rails
export const airH = (c) => (c.air ? Math.sin(Math.PI * clamp((c.wx - c.air.x0) / MINE.jump, 0, 1)) * 28 : 0);

// Fait avancer le wagonnet de dt ms. Renvoie ce qu'il a croisé : { gold, hits, pads, took, landed, finished }.
export function stepCart(c, world, dt, t, got, crashed) {
  const out = { gold: [], hits: [], pads: [], took: null, landed: false, finished: false };
  if (c.done || dt <= 0) return out;
  const from = c.wx;
  const wx = Math.min(world.len, from + cartSpeed(c, t) * dt);
  // embranchements franchis : on bifurque si l'aiguillage est préparé dans le bon sens
  const J = world.junctions;
  while (c.ji < J.length && J[c.ji].x <= wx) {
    const j = J[c.ji++];
    if (j.x <= from || c.tr || t < c.stunUntil || !c.arm) continue;
    const to = c.lane + c.arm;
    if ((c.lane === j.a && to === j.a + 1) || (c.lane === j.a + 1 && to === j.a)) {
      c.tr = { from: c.lane, to, x0: j.x };
      c.arm = 0;
      out.took = j;
    }
  }
  if (c.tr && wx >= c.tr.x0 + MINE.jLen) { c.lane = c.tr.to; c.tr = null; }
  if (c.air && wx >= c.air.x1) { c.air = null; out.landed = true; }
  c.wx = wx;
  if (wx >= world.len) { c.done = true; out.finished = true; }
  if (c.tr || c.air) return out; // rien sur les embranchements, et en l'air on passe au-dessus de tout
  const on = (o) => o.x > from && o.x <= wx && o.lane === c.lane;
  for (const p of world.pads) {
    if (!on(p)) continue;
    out.pads.push(p);
    if (p.kind === 'ramp') { c.air = { x0: p.x, x1: p.x + MINE.jump }; return out; }
    if (p.kind === 'boost') { c.boostUntil = t + MINE.boost.ms; c.slowUntil = -1e9; }
    if (p.kind === 'mud') { c.slowUntil = t + MINE.mud.ms; c.boostUntil = -1e9; }
  }
  for (const g of world.gold) if (on(g) && !got.has(g.id)) out.gold.push(g);
  for (const o of world.obstacles) if (on(o) && !crashed.has(o.id)) out.hits.push(o);
  return out;
}

// ------------------------------------------------------------ arbitre (navigateur de l'hôte)
export class MineGame {
  constructor(players) {
    this.kind = 'mine';
    this.seed = Math.floor(Math.random() * 2 ** 31);
    this.duration = MODES.mine.duration;
    this.p = players.map((pl) => ({
      key: pl.key, name: pl.name, character: pl.character, bot: !!pl.bot,
      score: 0, left: false, stats: { throws: 0, catches: 0, hits: 0, hurt: 0 },
      got: new Set(), crashed: new Set(), wx: 0, rank: 0, time: null,
      ai: pl.bot ? { cart: newCart(), plan: -1, lastT: 0, lastL: null } : null,
    }));
    this.world = mineWorld(this.seed);
    this.arrived = 0;
    this.phase = 'playing';
    this.winner = null;
    this.ranking = null;
    this.events = [];
    this.liveOut = [];
    this.startAt = 0;
  }

  get t() { return Date.now() - this.startAt; }

  start() {
    this.startAt = Date.now() + COUNTDOWN;
    this.push({ type: 'mgStart', kind: this.kind, seed: this.seed, countdown: COUNTDOWN, duration: this.duration });
    return this.flush();
  }

  flush() {
    const e = this.events;
    this.events = [];
    return e;
  }

  view(i) {
    return {
      kind: this.kind, me: i, phase: this.phase, winner: this.winner, ranking: this.ranking,
      players: this.p.map((p) => ({ key: p.key, name: p.name, character: p.character, score: p.score, left: p.left, bot: p.bot, rank: p.rank, time: p.time })),
    };
  }

  // État complet pour un joueur qui se reconnecte en cours de partie.
  syncView(i) {
    const p = this.p[i];
    return { ...this.view(i), seed: this.seed, duration: this.duration, elapsed: this.t, got: [...p.got], crashed: [...p.crashed], wx: p.wx };
  }

  push(ev) {
    ev.dur = 0;
    ev.states = this.p.map((_, i) => this.view(i));
    this.events.push(ev);
  }

  act(i, a) {
    if (this.phase !== 'playing') return { error: 'La partie est terminée.' };
    if (!a || typeof a !== 'object') return { error: 'Action invalide.' };
    const t = this.t;
    const p = this.p[i];
    if (t < -300 || t > this.duration + 600 || p.left || p.rank) return { events: [] };
    if (a.kind === 'switch') { p.stats.throws++; return { events: [] }; }
    // la position annoncée doit être plausible : pas plus loin que le plus rapide possible, pas en arrière
    if (!Number.isFinite(a.wx) || a.wx > maxReach(t) || a.wx < p.wx - 120) return { events: [] };
    p.wx = Math.max(p.wx, a.wx);
    if (a.kind === 'gold' && Number.isInteger(a.id)) this.gold(i, a.id, a.wx);
    else if (a.kind === 'crash' && Number.isInteger(a.id)) this.crash(i, a.id, a.wx);
    else if (a.kind === 'finish') { if (a.wx >= this.world.len - 40) this.arrive(i, t); }
    else return { error: 'Action inconnue.' };
    return { events: this.flush() };
  }

  gold(i, id, wx) {
    const g = this.world.gold[id];
    const p = this.p[i];
    if (!g || p.got.has(id) || Math.abs(g.x - wx) > MINE.tolerance) return;
    p.got.add(id);
    const pts = GOLD[g.kind].pts;
    p.score += pts;
    p.stats.catches++;
    this.push({ type: 'gold', id, by: i, pts });
  }

  crash(i, id, wx) {
    const o = this.world.obstacles[id];
    const p = this.p[i];
    if (!o || p.crashed.has(id) || Math.abs(o.x - wx) > MINE.tolerance) return;
    p.crashed.add(id);
    const pts = -Math.min(Math.max(0, p.score), -OBSTACLES[o.kind].pts); // le score ne descend pas sous 0
    p.score += pts;
    p.stats.hurt++;
    this.push({ type: 'crash', id, by: i, pts });
  }

  // Sortie de la mine : bonus selon le rang d'arrivée ; la partie s'arrête quand tout le monde est sorti.
  arrive(i, t) {
    const p = this.p[i];
    if (p.rank) return;
    p.rank = ++this.arrived;
    p.time = Math.round(Math.max(0, t));
    p.wx = this.world.len;
    const pts = MINE.arrival[p.rank - 1] || 0;
    p.score += pts;
    p.stats.hits++;
    this.push({ type: 'arrive', by: i, rank: p.rank, time: p.time, pts });
    if (this.p.every((q) => q.left || q.rank)) this.finish();
  }

  tick() {
    if (this.phase !== 'playing') return [];
    const t = this.t;
    if (t >= 0 && t < this.duration) this.p.forEach((p, i) => { if (p.ai && !p.left && !p.rank) this.botThink(i, t); });
    if (this.phase === 'playing' && t >= this.duration + 400) this.finish();
    return this.flush();
  }

  finish() {
    if (this.phase !== 'playing') return;
    this.phase = 'over';
    const order = this.p.map((_, i) => i).sort((a, b) => (this.p[a].left - this.p[b].left) || (this.p[b].score - this.p[a].score));
    this.ranking = order;
    this.winner = order[0];
    const tie = order.length > 1 && this.p[order[1]].score === this.p[order[0]].score && !this.p[order[1]].left;
    this.push({ type: 'matchEnd', winner: this.winner, ranking: order, tie });
  }

  leave(i) {
    if (this.phase !== 'playing' || !this.p[i]) return [];
    this.p[i].left = true;
    this.push({ type: 'left', who: i });
    if (this.p.every((q) => q.left || q.rank)) this.finish();
    return this.flush();
  }

  forfeit(i) {
    if (this.phase !== 'playing' || !this.p[i]) return [];
    this.p[i].left = true;
    this.finish();
    return this.flush();
  }

  // ------------------------------------------------------------ bots (mode solo)
  // À l'approche d'un embranchement, le bot compare les deux voies (obstacles, or, accélérateurs, boue)
  // et prépare l'aiguillage ; il se trompe ou réagit trop tard de temps en temps.
  botThink(i, t) {
    const p = this.p[i];
    const b = p.ai;
    const c = b.cart;
    const dt = Math.min(250, t - b.lastT);
    b.lastT = t;
    const j = this.world.junctions[c.ji];
    if (j && !c.tr && b.plan !== j.id && (j.a === c.lane || j.a + 1 === c.lane)) {
      const dist = j.x - c.wx;
      if (dist < (b.react ??= rnd(60, 190))) {
        b.plan = j.id;
        b.react = null;
        const other = c.lane === j.a ? j.a + 1 : j.a;
        const value = (lane) => {
          const x0 = j.x + MINE.jLen, x1 = x0 + 260;
          const ramp = this.world.pads.find((q) => q.kind === 'ramp' && q.lane === lane && q.x > x0 && q.x < x1);
          const air = (x) => ramp && x > ramp.x && x < ramp.x + MINE.jump;
          let v = 0;
          for (const o of this.world.obstacles) if (o.lane === lane && o.x > x0 && o.x < x1 && !air(o.x)) v += OBSTACLES[o.kind].pts * 5;
          for (const g of this.world.gold) if (g.lane === lane && g.x > x0 && g.x < x1 && !air(g.x)) v += GOLD[g.kind].pts;
          for (const q of this.world.pads) if (q.lane === lane && q.x > x0 && q.x < x1) v += q.kind === 'boost' ? 30 : q.kind === 'mud' ? -25 : 10;
          return v;
        };
        let go = value(other) > value(c.lane);
        if (Math.random() < 0.14) go = !go; // erreur d'aiguillage
        c.arm = go ? other - c.lane : 0;
        if (go) p.stats.throws++;
      }
    }
    const res = stepCart(c, this.world, dt, t, p.got, p.crashed);
    p.wx = c.wx;
    for (const g of res.gold) this.gold(i, g.id, c.wx);
    for (const o of res.hits) {
      this.crash(i, o.id, c.wx);
      c.stunUntil = t + MINE.stun;
    }
    const l = Math.round(cartLane(c) * 100);
    this.liveOut.push({ key: p.key, d: { x: Math.round(c.wx), l, ...(c.air ? { a: 1 } : {}), ...(res.hits.length ? { hit: 1 } : {}) } });
    if (res.finished) this.arrive(i, t);
  }
}
