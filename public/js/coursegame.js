// Mini-jeu « La course de chevaux » : chacun son couloir sur la piste du champ de courses, du départ au poteau.
// On saute les obstacles (haies, tonneaux, bottes de foin, fossés, boue) et on cravache son cheval pour aller plus
// vite. Chaque coup de cravache vide un peu la barre de résilience du cheval ; elle remonte avec le temps et en
// ramassant des carottes. Si elle tombe à zéro, le cheval est épuisé : il traîne la patte quelques secondes.
// Ce fichier contient les règles partagées (le parcours vient d'une graine, chaque navigateur le recalcule,
// et le cheval est simulé de la même façon partout) et l'arbitre qui tourne chez l'hôte, avec la même
// interface que MiniGame (mini.js). Les autres chevaux sont vus en direct (positions envoyées par chacun).
import { MODES, COUNTDOWN, rng } from './worlds.js';

const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export const COURSE = {
  len: 10500, // longueur de la piste (px) jusqu'au poteau d'arrivée ; 5 px = 1 m
  v0: 0.15, v1: 0.17, // vitesse de base (px/ms) au départ et à la fin : le cheval s'échauffe
  whip: { gain: 0.8, add: 0.3, decay: 0.0004, cost: 12, cd: 220 }, // cravache : jusqu'à ×1,8, retombe en 2,5 s
  res: { max: 100, regen: 0.009 }, // résilience : +9 par seconde
  tired: { ms: 2800, mult: 0.45 }, // à zéro : le cheval est épuisé
  stun: { ms: 900, mult: 0.35 }, // après un obstacle percuté, le cheval trébuche
  mud: { ms: 1200, mult: 0.6 }, // la boue colle aux sabots
  jump: { ms: 520, h: 30 }, // durée et hauteur du saut
  carrot: 25, // une carotte rend 25 de résilience
  reach: 14, // une carotte est ramassée si le cheval passe à moins de 14 px de sa hauteur
  tolerance: 80, // écart (px) toléré par l'hôte entre la position annoncée et l'objet touché
  arrival: [100, 60, 30, 10], // points selon le rang d'arrivée
};

// Obstacles : largeur au sol (px). La boue ne fait pas tomber : elle freine.
export const OBSTACLES = {
  hurdle: { name: 'Haie', w: 8 },
  barrel: { name: 'Tonneau', w: 12 },
  hay: { name: 'Botte de foin', w: 18 },
  fence: { name: 'Barrière', w: 6 },
  ditch: { name: 'Fossé', w: 34 },
  mud: { name: 'Boue', w: 30 },
};

export const baseSpeed = (wx) => COURSE.v0 + (COURSE.v1 - COURSE.v0) * clamp(wx / COURSE.len, 0, 1);
// Distance maximale atteignable à l'instant t (contrôle de l'hôte)
export const maxReach = (t) => Math.max(0, t) * COURSE.v1 * (1 + COURSE.whip.gain) + 200;

// La piste : des obstacles de plus en plus rapprochés, des carottes au sol entre deux obstacles, et parfois une
// carotte en l'air au-dessus d'un obstacle (on l'attrape en sautant pile au bon moment). Les écarts laissent
// toujours le temps de retomber avant le prochain obstacle, même au grand galop.
export function courseWorld(seed) {
  const R = rng((seed ^ 0x3c6ef372) >>> 0);
  const between = (a, b) => a + R() * (b - a);
  const pick = (a) => a[Math.floor(R() * a.length)];
  const L = COURSE.len;
  const obstacles = [], carrots = [];
  const addCarrot = (x, h) => carrots.push({ id: carrots.length, x: Math.round(x), h });
  let x = 620;
  while (x < L - 420) {
    const p = x / L;
    const kind = pick(p < 0.25 ? ['hurdle', 'hurdle', 'hay', 'fence', 'barrel'] : ['hurdle', 'barrel', 'hay', 'fence', 'ditch', 'ditch', 'mud']);
    const o = { id: obstacles.length, x: Math.round(x), w: OBSTACLES[kind].w, kind };
    obstacles.push(o);
    if (kind !== 'mud' && kind !== 'ditch' && R() < 0.22) addCarrot(o.x + o.w / 2, 30); // la carotte du saut parfait
    const next = x + Math.max(250, between(320, 560) * (1 - 0.35 * p));
    // carottes au sol, entre deux obstacles
    if (next - x > 330 && R() < 0.45) {
      const n = 2 + Math.floor(R() * 3), x0 = between(x + 150, next - 90 - n * 16);
      for (let k = 0; k < n; k++) addCarrot(x0 + k * 16, 4);
    } else if (next - x > 300 && R() < 0.15) addCarrot(between(x + 150, next - 120), 26); // une carotte suspendue
    x = next;
  }
  return { obstacles, carrots, len: L };
}

// ------------------------------------------------------------ le cheval (même simulation partout)
export function newHorse() {
  return {
    wx: 0, whip: 0, res: COURSE.res.max, lastWhip: -1e9, whipAt: -1e9,
    airT0: -1e9, stunUntil: -1e9, slowUntil: -1e9, tiredUntil: -1e9, oi: 0, done: false,
  };
}

export const inAir = (h, t) => t - h.airT0 < COURSE.jump.ms;
export const tired = (h, t) => t < h.tiredUntil;
// Hauteur du saut (px) au-dessus de la piste
export const airH = (h, t) => (inAir(h, t) ? Math.sin((Math.PI * (t - h.airT0)) / COURSE.jump.ms) * COURSE.jump.h : 0);

export function horseSpeed(h, t) {
  let v = baseSpeed(h.wx) * (1 + COURSE.whip.gain * h.whip);
  if (t < h.tiredUntil) v *= COURSE.tired.mult;
  if (t < h.stunUntil) v *= COURSE.stun.mult;
  if (t < h.slowUntil) v *= COURSE.mud.mult;
  return v;
}

// Saut : seulement les quatre fers au sol, et pas pendant qu'il trébuche
export function jump(h, t) {
  if (h.done || inAir(h, t) || t < h.stunUntil) return false;
  h.airT0 = t;
  return true;
}

// Coup de cravache. Renvoie 'whip', 'tired' (la barre vient de tomber à zéro), ou null (sans effet).
export function whip(h, t) {
  const W = COURSE.whip;
  if (h.done || t < h.tiredUntil || t - h.lastWhip < W.cd) return null;
  h.lastWhip = h.whipAt = t;
  h.res -= W.cost;
  if (h.res <= 0) {
    h.res = 0;
    h.whip = 0;
    h.tiredUntil = t + COURSE.tired.ms;
    return 'tired';
  }
  h.whip = Math.min(1, h.whip + W.add);
  return 'whip';
}

// Fait avancer le cheval de dt ms. Renvoie ce qu'il a croisé : { carrots, hits, mud, finished }.
export function stepHorse(h, world, dt, t, got, crashed) {
  const out = { carrots: [], hits: [], mud: null, finished: false };
  if (h.done || dt <= 0) return out;
  h.whip = Math.max(0, h.whip - COURSE.whip.decay * dt);
  h.res = Math.min(COURSE.res.max, h.res + COURSE.res.regen * dt);
  const from = h.wx;
  const to = Math.min(world.len, from + horseSpeed(h, t) * dt);
  h.wx = to;
  if (to >= world.len) { h.done = true; out.finished = true; }
  const y = airH(h, t);
  for (const c of world.carrots) if (c.x > from && c.x <= to && !got.has(c.id) && Math.abs(y - c.h) <= COURSE.reach) out.carrots.push(c);
  if (y > 0) return out; // en l'air, on passe au-dessus de tout
  for (const o of world.obstacles) {
    if (o.x > to || o.x + o.w < from || crashed.has(o.id)) continue;
    if (o.kind === 'mud') {
      if (t >= h.slowUntil) out.mud = o;
      h.slowUntil = t + COURSE.mud.ms;
      crashed.add(o.id);
      continue;
    }
    out.hits.push(o);
    h.stunUntil = t + COURSE.stun.ms;
    h.whip = 0;
  }
  return out;
}

// ------------------------------------------------------------ arbitre (navigateur de l'hôte)
export class CourseGame {
  constructor(players) {
    this.kind = 'course';
    this.seed = Math.floor(Math.random() * 2 ** 31);
    this.duration = MODES.course.duration;
    this.p = players.map((pl) => ({
      key: pl.key, name: pl.name, character: pl.character, bot: !!pl.bot,
      score: 0, left: false, stats: { throws: 0, catches: 0, hits: 0, hurt: 0 },
      got: new Set(), crashed: new Set(), wx: 0, rank: 0, time: null,
      ai: pl.bot ? { horse: newHorse(), lastT: 0, plan: null, keep: rnd(22, 55), mud: new Set(), lastL: 0 } : null,
    }));
    this.world = courseWorld(this.seed);
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
    return {
      ...this.view(i), seed: this.seed, duration: this.duration, elapsed: this.t, wx: p.wx,
      got: this.p.map((q) => [...q.got]), crashed: [...p.crashed],
    };
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
    if (a.kind === 'whip') { p.stats.throws++; return { events: [] }; }
    // la position annoncée doit être plausible : pas plus loin que le plus rapide possible, pas en arrière
    if (!Number.isFinite(a.wx) || a.wx > maxReach(t) || a.wx < p.wx - 120) return { events: [] };
    p.wx = Math.max(p.wx, a.wx);
    if (a.kind === 'carrot' && Number.isInteger(a.id)) this.carrot(i, a.id, a.wx);
    else if (a.kind === 'crash' && Number.isInteger(a.id)) this.crash(i, a.id, a.wx);
    else if (a.kind === 'finish') { if (a.wx >= this.world.len - 40) this.arrive(i, t); }
    else return { error: 'Action inconnue.' };
    return { events: this.flush() };
  }

  carrot(i, id, wx) {
    const c = this.world.carrots[id];
    const p = this.p[i];
    if (!c || p.got.has(id) || Math.abs(c.x - wx) > COURSE.tolerance) return;
    p.got.add(id);
    p.stats.catches++;
    this.push({ type: 'carrot', id, by: i });
  }

  crash(i, id, wx) {
    const o = this.world.obstacles[id];
    const p = this.p[i];
    if (!o || o.kind === 'mud' || p.crashed.has(id) || Math.abs(o.x - wx) > COURSE.tolerance) return;
    p.crashed.add(id);
    p.stats.hurt++;
    this.push({ type: 'crash', id, by: i });
  }

  // Passage du poteau : points selon le rang ; la course s'arrête quand tout le monde est arrivé.
  arrive(i, t) {
    const p = this.p[i];
    if (p.rank) return;
    p.rank = ++this.arrived;
    p.time = Math.round(Math.max(0, t));
    p.wx = this.world.len;
    const pts = COURSE.arrival[p.rank - 1] || 0;
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

  // Classement : d'abord les arrivés (dans l'ordre), puis les plus avancés ; ceux qui sont partis à la fin.
  finish() {
    if (this.phase !== 'playing') return;
    this.phase = 'over';
    const key = (p) => (p.left ? -1e9 : p.rank ? 1e9 - p.rank : p.wx);
    const order = this.p.map((_, i) => i).sort((a, b) => key(this.p[b]) - key(this.p[a]));
    this.ranking = order;
    this.winner = order[0];
    this.push({ type: 'matchEnd', winner: this.winner, ranking: order, tie: false });
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
  // Le bot vise le milieu de chaque obstacle pour sauter, avec un peu d'imprécision (et de temps en temps
  // un saut raté). Il cravache tant que la barre reste au-dessus de son seuil de prudence, plus fort à la fin.
  botThink(i, t) {
    const p = this.p[i];
    const b = p.ai;
    const h = b.horse;
    const W = this.world;
    for (let st = b.lastT; st < t;) {
      const dt = Math.min(20, t - st);
      st += dt;
      // prochain obstacle : on prépare le saut (point de décollage visé, avec une erreur)
      while (h.oi < W.obstacles.length && W.obstacles[h.oi].x + W.obstacles[h.oi].w < h.wx) h.oi++;
      const o = W.obstacles[h.oi];
      if (o && b.plan?.id !== o.id) {
        const miss = Math.random() < 0.1;
        b.plan = { id: o.id, skip: o.kind === 'mud' && Math.random() < 0.35, err: miss ? (Math.random() < 0.5 ? -40 : 70) : rnd(-10, 10) };
      }
      if (o && !b.plan.skip && !inAir(h, st)) {
        const L = horseSpeed(h, st) * COURSE.jump.ms;
        if (o.x - h.wx <= (L - o.w) / 2 + b.plan.err && o.x - h.wx > -o.w) jump(h, st);
      }
      // cravache
      const end = h.wx > W.len * 0.82;
      const keep = end ? 14 : b.keep;
      if (!tired(h, st) && h.whip < (end ? 0.8 : 0.55) && h.res - COURSE.whip.cost > keep && Math.random() < 0.08) {
        if (whip(h, st)) p.stats.throws++;
      }
      const res = stepHorse(h, W, dt, st, p.got, p.crashed);
      for (const c of res.carrots) { h.res = Math.min(COURSE.res.max, h.res + COURSE.carrot); this.carrot(i, c.id, h.wx); }
      for (const ob of res.hits) this.crash(i, ob.id, h.wx);
      p.wx = h.wx;
      if (res.finished) { this.arrive(i, st); break; }
    }
    b.lastT = t;
    this.liveOut.push({ key: p.key, d: horseLive(h, t) });
  }
}

// Ce que les autres voient d'un cheval : position, en l'air, coup de cravache, épuisé, trébuche
export function horseLive(h, t) {
  return {
    x: Math.round(h.wx),
    ...(inAir(h, t) ? { a: 1 } : {}),
    ...(t - h.whipAt < 300 ? { w: 1 } : {}),
    ...(tired(h, t) ? { e: 1 } : {}),
    ...(t < h.stunUntil ? { s: 1 } : {}),
  };
}
