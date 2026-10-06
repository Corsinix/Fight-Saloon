// Mini-jeu « La mine » : une course en wagonnet jusqu'à la sortie de la mine, en huit étapes (les galeries,
// la descente, la caverne de cristal, la galerie inondée, le gouffre, le filon d'or, la galerie en feu,
// la sortie), chacune filmée autrement (mine.js).
// Trois voies reliées par des embranchements : on prépare l'aiguillage et le wagonnet change de voie au
// prochain embranchement. Il y a aussi des carrefours à trois voies, des embranchements longs (entre les
// voies du haut et du bas), des sens uniques et des déviations (aiguillage bloqué, qui emmène tout le
// monde de force). Sur les rails : de l'or, des obstacles, des accélérateurs, de la boue
// et des tremplins.
// Chaque wagonnet a sa propre vitesse (accélérateur, boue, chocs) : le premier sorti gagne un gros bonus.
// Ce fichier contient les règles partagées (le parcours vient d'une graine, chaque navigateur le recalcule,
// et le wagonnet est simulé de la même façon partout) et l'arbitre qui tourne chez l'hôte, avec la même
// interface que MiniGame (mini.js). Les autres joueurs sont des « fantômes » (positions envoyées en direct).
import { MODES, COUNTDOWN, rng } from './worlds.js';

const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smooth = (k) => (k <= 0 ? 0 : k >= 1 ? 1 : k * k * (3 - 2 * k));

export const MINE = {
  len: 14400, // longueur du parcours (px) jusqu'à la sortie
  v0: 0.1, v1: 0.19, // vitesse de base (px/ms) au départ et à la sortie : plus on descend, plus ça va vite
  slope: 0.02, // en plus, dans la descente
  jLen: 80, // longueur d'un embranchement
  stun: 900, stunMult: 0.45, // après un choc, le wagonnet tangue, freine et l'aiguillage ne répond plus
  boost: { mult: 1.6, ms: 2600 }, // accélérateur
  mud: { mult: 0.55, ms: 2000 }, // flaque de boue
  jump: 140, // un tremplin fait sauter le wagonnet sur 140 px : il passe par-dessus tout
  fallWarn: 170, // un éboulement tombe du plafond quand le wagonnet arrive à cette distance
  // wagonnet fou : il attend 70 px avant l'embranchement, se met à dévaler quand on arrive à 300 px de
  // l'embranchement, prend l'aiguillage vers l'autre voie et s'y renverse (le temps que l'on parcoure 130 px)
  runaway: { start: 70, wake: 300, roll: 130 },
  tolerance: 70, // écart (px) toléré par l'hôte entre la position annoncée et l'objet touché
  arrival: [150, 100, 60, 30, 15, 5], // bonus d'arrivée selon le rang (jusqu'à 6 joueurs)
};

// Les étapes (début en fraction du parcours) et leur caméra (mine.js)
// slope : ça descend, on va plus vite ; drag : l'eau freine le wagonnet
export const STAGES = [
  { id: 'galeries', name: 'LES GALERIES', from: 0, cam: 'side' },
  { id: 'descente', name: 'LA DESCENTE', from: 0.13, cam: 'back', slope: true },
  { id: 'cristaux', name: 'LA CAVERNE DE CRISTAL', from: 0.26, cam: 'side' },
  { id: 'inonde', name: 'LA GALERIE INONDÉE', from: 0.39, cam: 'back', drag: 0.88 },
  { id: 'gouffre', name: 'LE GOUFFRE', from: 0.52, cam: 'wide' },
  { id: 'filon', name: 'LE FILON D\'OR', from: 0.65, cam: 'back', slope: true },
  { id: 'grisou', name: 'LA GALERIE EN FEU', from: 0.78, cam: 'back' },
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
  crystal: { name: 'Cristal géant', pts: -20 }, // dans la caverne de cristal
  flame: { name: 'Jet de grisou', pts: -30 }, // dans la galerie en feu
  runaway: { name: 'Wagonnet fou', pts: -30 }, // change de voie sous tes yeux
  barrier: { name: 'Voie barrée', pts: -30 }, // après une déviation
  cascade: { name: 'Cascade', pts: -20 }, // dans la galerie inondée, l'eau tombe de la voûte
  ore: { name: 'Tas de minerai', pts: -20 }, // dans le filon d'or
};
export const PADS = {
  boost: { name: 'Accélérateur' },
  mud: { name: 'Flaque de boue' },
  ramp: { name: 'Tremplin' },
};

// Vitesse de base à un endroit du parcours (la même pour tout le monde)
export const baseSpeed = (wx) => {
  const s = STAGES[stageAt(wx)];
  return (MINE.v0 + (MINE.v1 - MINE.v0) * clamp(wx / MINE.len, 0, 1) + (s.slope ? MINE.slope : 0)) * (s.drag || 1);
};
// Distance maximale atteignable à l'instant t (contrôle de l'hôte)
export const maxReach = (t) => Math.max(0, t) * (MINE.v1 + MINE.slope) * MINE.boost.mult + 200;

// Ce que chaque étape met sur les rails : chances de chaque sorte d'embranchement (carrefour, déviation,
// sens unique, long), d'un wagonnet fou (à la place de l'obstacle), d'un tremplin devant l'obstacle,
// d'un diamant sur la voie libre ; dans les lignes droites : chances d'une rangée d'or, d'une grosse pépite
// dans la rangée, d'un accélérateur et d'une flaque de boue.
const STAGE_MIX = {
  galeries: { triple: 0.06, force: 0.06, oneway: 0.08, long: 0.05, runaway: 0.16, ramp: 0.12, gem: 0.18, row: 0.6, nugget: 0, boost: 0.42, mud: 0.35 },
  descente: { triple: 0.1, force: 0.08, oneway: 0.1, long: 0.1, runaway: 0.2, ramp: 0.12, gem: 0.18, row: 0.6, nugget: 0, boost: 0.6, mud: 0.25 },
  cristaux: { triple: 0.14, force: 0.08, oneway: 0.1, long: 0.08, runaway: 0.18, ramp: 0.12, gem: 0.45, row: 0.6, nugget: 0.15, boost: 0.4, mud: 0.3 },
  inonde: { triple: 0.1, force: 0.08, oneway: 0.12, long: 0.1, runaway: 0.16, ramp: 0.12, gem: 0.18, row: 0.6, nugget: 0, boost: 0.55, mud: 0 },
  gouffre: { triple: 0.1, force: 0.06, oneway: 0.1, long: 0.08, runaway: 0, ramp: 0.45, gem: 0.18, row: 0.6, nugget: 0, boost: 0.42, mud: 0.35 },
  filon: { triple: 0.12, force: 0.08, oneway: 0.1, long: 0.12, runaway: 0.2, ramp: 0.12, gem: 0.25, row: 1, nugget: 0.3, boost: 0.45, mud: 0.2 },
  grisou: { triple: 0.14, force: 0.12, oneway: 0.1, long: 0.1, runaway: 0.2, ramp: 0.15, gem: 0.18, row: 0.6, nugget: 0, boost: 0.5, mud: 0.2 },
};

// Voies où l'on peut partir à un embranchement depuis la voie lane, en préparant l'aiguillage
// (une déviation emmène de force : voir stepCart).
export function junctionMoves(j, lane) {
  if (j.kind === 'force') return [];
  if (j.kind === 'oneway') return lane === j.from ? [j.to] : [];
  if (j.kind === 'long') return lane === 0 ? [2] : lane === 2 ? [0] : [];
  if (lane < j.a || lane > j.b) return [];
  return [lane - 1, lane + 1].filter((l) => l >= j.a && l <= j.b);
}

// Le parcours : des embranchements, chacun suivi d'obstacles (à toi de prendre la bonne voie) et d'or sur
// la voie libre, puis une ligne droite avec de l'or en vrac, des accélérateurs et de la boue.
// Cinq sortes d'embranchements :
// - simple (a, a + 1) : deux rails en X entre deux voies voisines ; une des deux est bouchée ensuite ;
// - carrefour (0 à 2) : les trois voies se croisent, deux sont bouchées ensuite ;
// - long (0 et 2) : deux rails en X entre les voies du haut et du bas, qui traversent la voie du milieu ;
// - sens unique (from → to, voisines ou non) : un seul rail, on ne peut aller que de from vers to ;
//   la voie from est bouchée ensuite ;
// - déviation (from → to) : l'aiguillage est bloqué, tout wagonnet sur la voie from passe de force sur
//   la voie to (la voie from est barrée juste après).
// On suit les voies qu'un pilote parfait peut occuper (reach) : une voie n'est bouchée que si ceux qui y
// sont peuvent la quitter à cet embranchement (ou si personne ne peut y être sans avoir rien touché).
// Rien autour des changements d'étape (la caméra change à ce moment-là).
export function mineWorld(seed) {
  const R = rng((seed ^ 0x1f123bb5) >>> 0);
  const between = (a, b) => a + R() * (b - a);
  const pick = (a) => a[Math.floor(R() * a.length)];
  const L = MINE.len;
  const junctions = [], obstacles = [], gold = [], pads = [], bats = [];
  const bounds = STAGES.slice(1).map((s) => s.from * L);
  const blocked = (a, b) => bounds.some((B) => b > B - 220 && a < B + 220);
  const addGold = (x, lane, kind = 'gold') => blocked(x, x) || gold.push({ id: gold.length, x: Math.round(x), lane, kind });
  const addObs = (x, lane, kind, more) => blocked(x, x) || obstacles.push({ id: obstacles.length, x: Math.round(x), lane, kind, ...more });
  const addPad = (x, lane, kind) => blocked(x, x) || pads.push({ id: pads.length, x: Math.round(x), lane, kind });
  const obsKind = (st, p) => {
    if (R() < (st === 'grisou' || st === 'filon' ? 0.18 : 0.08) + 0.12 * p) return 'tnt';
    if (st === 'gouffre') return R() < 0.6 ? 'gap' : pick(['rock', 'barrel', 'cart']);
    if (st === 'galeries' && R() < 0.4) return 'fall';
    if (st === 'cristaux' && R() < 0.55) return 'crystal';
    if (st === 'inonde') return R() < 0.5 ? 'cascade' : pick(['rock', 'barrel', 'cart']);
    if (st === 'filon' && R() < 0.45) return 'ore';
    if (st === 'grisou' && R() < 0.5) return 'flame';
    return pick(['rock', 'beam', 'barrel', 'cart']);
  };
  const end = STAGES[STAGES.length - 1].from * L - 220; // la sortie est une ligne droite
  let x = 560, reach = [1], n = 0;
  while (x < end) {
    const p = x / L;
    const st = STAGES[stageAt(x)].id;
    const mix = STAGE_MIX[st];
    if (blocked(x - 40, x + MINE.jLen + 40)) { x += 30; continue; }
    const jx = Math.round(x);
    const after = x + MINE.jLen;
    const ox = after + between(60, 110);
    // les premiers embranchements sont simples
    let r = n > 2 ? R() : 1;
    const kind = ['triple', 'force', 'oneway', 'long'].find((k) => (r -= mix[k]) < 0) || 'simple';
    let j, good, shut;
    if (kind === 'triple') {
      // carrefour : la voie libre doit être à portée de toutes les voies possibles
      j = { a: 0, b: 2, kind };
      good = pick([0, 1, 2].filter((l) => reach.every((q) => Math.abs(q - l) <= 1)));
      shut = [0, 1, 2].filter((l) => l !== good);
      for (const l of shut) {
        if (R() < mix.ramp * 0.5) addPad(ox - 45, l, 'ramp');
        addObs(ox + between(-12, 12), l, obsKind(st, p));
      }
    } else {
      let bad, other;
      if (kind === 'long') {
        bad = R() < 0.5 ? 0 : 2;
        good = 2 - bad;
        other = 1;
        j = { a: 0, b: 2, kind };
      } else {
        const a = Math.floor(R() * 2); // entre la voie a et la voie a + 1
        bad = a + (R() < 0.5 ? 0 : 1);
        good = bad === a ? a + 1 : a;
        other = a === 0 ? 2 : 0;
        // sens unique : parfois entre les voies du haut et du bas, en traversant celle du milieu
        if (kind === 'oneway' && R() < 0.3) { bad = R() < 0.5 ? 0 : 2; good = 2 - bad; other = 1; }
        j = kind === 'simple' ? { a, b: a + 1 } : { a: Math.min(bad, good), b: Math.max(bad, good), kind, from: bad, to: good };
      }
      shut = [bad];
      if (kind === 'force') {
        // déviation : la voie from est barrée, l'aiguillage bloqué envoie tout le monde sur l'autre
        addObs(after + 24, bad, 'barrier');
      } else if (kind !== 'oneway' && R() < mix.runaway) {
        // le wagonnet fou attend sur la bonne voie, puis prend l'aiguillage vers la mauvaise
        addObs(ox, bad, 'runaway', { from: good, jx, x0: Math.round(x - MINE.runaway.start), wake: Math.round(x - MINE.runaway.wake) });
      } else {
        // un tremplin permet de sauter par-dessus l'obstacle
        if (R() < mix.ramp) addPad(ox - 45, bad, 'ramp');
        addObs(ox, bad, obsKind(st, p));
      }
      // la troisième voie se bouche aussi, mais seulement si personne ne peut y être sans rien avoir touché
      if (!reach.includes(other) && R() < 0.3 + 0.4 * p) {
        shut.push(other);
        addObs(ox + between(-16, 16), other, obsKind(st, p));
      }
      if (!shut.includes(other) && R() < mix.gem) addGold(ox + between(-30, 30), other, 'gem');
    }
    junctions.push({ id: junctions.length, x: jx, ...j });
    const ex = j.kind === 'force' ? reach.map((l) => (l === j.from ? j.to : l)) : reach.flatMap((l) => [l, ...junctionMoves(j, l)]);
    reach = [...new Set(ex)].filter((l) => !shut.includes(l));
    // une traînée d'or sur la bonne voie
    const ng = 3 + Math.floor(R() * 3);
    for (let k = 0; k < ng; k++) addGold(after + 14 + k * 18, good, k === ng - 1 && R() < 0.3 ? 'nugget' : 'gold');
    const next = ox + between(130, 240) * (1 - 0.3 * p);
    // ligne droite : or en vrac, accélérateur, boue
    const lanes = [0, 1, 2].sort(() => R() - 0.5);
    if (next - ox > 110) {
      const gl = lanes[0];
      if (R() < mix.row) for (let gx = ox + 40; gx < next - 40; gx += 20) addGold(gx, gl, R() < mix.nugget ? 'nugget' : 'gold');
      if (R() < mix.boost) addPad(between(ox + 30, next - 40), lanes[1], 'boost');
      if (R() < mix.mud) addPad(between(ox + 30, next - 40), lanes[2], 'mud');
      if (st !== 'gouffre' && st !== 'grisou' && R() < 0.12) bats.push(Math.round(ox + 40));
    }
    n++;
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

// Où l'on voit un wagonnet fou quand on est en wx : { x, lane, k } (k = 1 : il s'est renversé à sa place).
// Il ne dépend que de notre position : chacun le voit partir au même endroit, quelle que soit sa vitesse.
export function runawayAt(o, wx) {
  const k = clamp((wx - o.wake) / MINE.runaway.roll, 0, 1);
  const x = o.x0 + (o.x - o.x0) * k * k; // il prend de la vitesse en dévalant
  const lane = o.from + (o.lane - o.from) * smooth((x - o.jx) / MINE.jLen);
  return { x, lane, k };
}

// Les rails d'un embranchement : chaque paire [voie au début, voie au bout]
export function junctionRails(j) {
  if (j.kind === 'force' || j.kind === 'oneway') return [[j.from, j.to]];
  if (j.kind === 'triple') return [[0, 1], [1, 0], [1, 2], [2, 1]];
  if (j.kind === 'long') return [[0, 2], [2, 0]];
  return [[j.a, j.a + 1], [j.a + 1, j.a]];
}

// Fait avancer le wagonnet de dt ms. Renvoie ce qu'il a croisé : { gold, hits, pads, took, forced, landed, finished }.
export function stepCart(c, world, dt, t, got, crashed) {
  const out = { gold: [], hits: [], pads: [], took: null, forced: null, landed: false, finished: false };
  if (c.done || dt <= 0) return out;
  const from = c.wx;
  const wx = Math.min(world.len, from + cartSpeed(c, t) * dt);
  // embranchements franchis : on bifurque si l'aiguillage est préparé dans le bon sens
  // (une déviation emmène de force, même sonné, et sans toucher à l'aiguillage préparé)
  const J = world.junctions;
  while (c.ji < J.length && J[c.ji].x <= wx) {
    const j = J[c.ji++];
    if (j.x <= from || c.tr) continue;
    if (j.kind === 'force') {
      if (c.lane === j.from) { c.tr = { from: c.lane, to: j.to, x0: j.x }; out.forced = j; }
      continue;
    }
    if (t < c.stunUntil || !c.arm) continue;
    // la voie d'arrivée du côté préparé (au-dessus / à gauche, ou au-dessous / à droite)
    const to = junctionMoves(j, c.lane).find((l) => Math.sign(l - c.lane) === c.arm);
    if (to != null) {
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
    const moves = j ? junctionMoves(j, c.lane) : [];
    if (j && !c.tr && b.plan !== j.id && moves.length) {
      const dist = j.x - c.wx;
      if (dist < (b.react ??= rnd(60, 190))) {
        b.plan = j.id;
        b.react = null;
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
        // au carrefour, depuis la voie du milieu, on compare les deux voisines
        const other = moves.reduce((m, l) => (value(l) > value(m) ? l : m));
        let go = value(other) > value(c.lane);
        if (Math.random() < 0.14) go = !go; // erreur d'aiguillage
        c.arm = go ? Math.sign(other - c.lane) : 0;
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
