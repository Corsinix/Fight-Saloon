// Mini-jeu « La course de chevaux » : chacun son couloir sur la piste du champ de courses, du départ au poteau.
// On saute les obstacles (haies, tonneaux, bottes de foin, fossés, boue) et on cravache son cheval pour aller plus
// vite. Chaque coup de cravache vide un peu la barre de résilience du cheval ; elle remonte avec le temps et en
// ramassant des carottes. Si elle tombe à zéro, le cheval est épuisé : il traîne la patte quelques secondes.
// Ce fichier contient les règles partagées (le parcours vient d'une graine, chaque navigateur le recalcule,
// et le cheval est simulé de la même façon partout) et l'arbitre qui tourne chez l'hôte, avec la même
// interface que MiniGame (mini.js). Les autres chevaux sont vus en direct (positions envoyées par chacun).
// Une fois sur deux (tiré de la graine), la course quitte le champ de courses pour la chevauchée sauvage :
// pas de couloirs, on traverse la prairie et on dirige son cheval librement (voir WILD plus bas).
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
  perfect: { win: 0.1, gain: 0.3 }, // saut parfait (sommet du saut pile au-dessus de l'obstacle) : élan gratuit
  reach: 14, // une carotte est ramassée si le cheval passe à moins de 14 px de sa hauteur
  tolerance: 80, // écart (px) toléré par l'hôte entre la position annoncée et l'objet touché
  arrival: [100, 60, 30, 10], // points selon le rang d'arrivée
};

// Obstacles : largeur au sol (px). La boue ne fait pas tomber : elle freine (slow), comme le ruisseau.
// Ceux de la chevauchée sauvage ont aussi une demi-profondeur (d) ; les grands (tall) ne se sautent pas.
export const OBSTACLES = {
  hurdle: { name: 'Haie', w: 8 },
  barrel: { name: 'Tonneau', w: 12 },
  hay: { name: 'Botte de foin', w: 18 },
  fence: { name: 'Barrière', w: 6 },
  ditch: { name: 'Fossé', w: 34 },
  mud: { name: 'Boue', w: 30, slow: true },
  rock: { name: 'Rocher', w: 22, d: 7, tall: true },
  cactus: { name: 'Cactus', w: 8, d: 3, tall: true },
  bush: { name: 'Buisson', w: 14, d: 5 },
  log: { name: 'Tronc', w: 8 }, // couché en travers : sa profondeur change d'un tronc à l'autre
  hole: { name: 'Terrier', w: 6, d: 3 },
  tumble: { name: 'Virevoltant', w: 10, d: 5 }, // roule d'un bord à l'autre de la prairie
  creek: { name: 'Ruisseau', w: 30, slow: true }, // toute la largeur, sauf le gué
};

// La chevauchée sauvage : la prairie fait toute la largeur, chacun dirige son cheval en profondeur (y, la hauteur
// de ses sabots à l'écran) et peut le retenir. Rochers et cactus sont trop hauts : il faut les contourner.
export const WILD = {
  len: 9800,
  y0: 128, y1: 206, // bord du fond et bord proche de la prairie (sabots)
  steer: 0.085, // vitesse en profondeur (px/ms)
  airSteer: 0.35, // en l'air, le cheval garde presque sa trajectoire
  brake: 0.6, // vitesse quand on retient le cheval
  hd: 3, // demi-épaisseur du cheval en profondeur
  reachY: 7, // une carotte est ramassée à moins de 7 px de profondeur
  ford: 11, // demi-largeur du gué
};

export const courseVariant = (seed) => (rng((seed ^ 0x2545f491) >>> 0)() < 0.5 ? 'wild' : 'track');
// profondeur de départ du cheval i (chevauchée sauvage)
export const startY = (i, n) => Math.round(WILD.y0 + ((i + 0.5) * (WILD.y1 - WILD.y0)) / Math.max(1, n));
// profondeur d'un obstacle à l'instant t (les virevoltants font des allers-retours d'un bord à l'autre)
export function obsY(o, t) {
  if (!o.vy) return o.y;
  const a = WILD.y0 - 6, span = WILD.y1 - WILD.y0 + 12;
  const p = (((o.y - a + o.vy * Math.max(0, t)) % (2 * span)) + 2 * span) % (2 * span);
  return a + (p < span ? p : 2 * span - p);
}

export const baseSpeed = (wx) => COURSE.v0 + (COURSE.v1 - COURSE.v0) * clamp(wx / COURSE.len, 0, 1);
// Distance maximale atteignable à l'instant t (contrôle de l'hôte)
export const maxReach = (t) => Math.max(0, t) * COURSE.v1 * (1 + COURSE.whip.gain) + 200;

// La piste : des obstacles de plus en plus rapprochés, des carottes au sol entre deux obstacles, et parfois une
// carotte en l'air au-dessus d'un obstacle (on l'attrape en sautant pile au bon moment). Les écarts laissent
// toujours le temps de retomber avant le prochain obstacle, même au grand galop.
export function courseWorld(seed) {
  return courseVariant(seed) === 'wild' ? wildWorld(seed) : trackWorld(seed);
}

function trackWorld(seed) {
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

// La prairie : des motifs posés les uns après les autres, de plus en plus serrés. Les grands obstacles laissent
// toujours un passage d'au moins 26 px en profondeur, et assez de place devant pour s'y engager au grand galop.
function wildWorld(seed) {
  const R = rng((seed ^ 0x6a09e667) >>> 0);
  const between = (a, b) => a + R() * (b - a);
  const pick = (a) => a[Math.floor(R() * a.length)];
  const { y0, y1, len: L } = WILD;
  const obstacles = [], carrots = [];
  const add = (kind, x, y, extra = {}) => obstacles.push({ kind, x: Math.round(x), y: Math.round(y), w: OBSTACLES[kind].w, d: OBSTACLES[kind].d || 0, ...extra });
  const addCarrot = (x, y, h = 4) => carrots.push({ x: Math.round(x), y: Math.round(clamp(y, y0, y1)), h });
  const Y = (m = 4) => between(y0 + m, y1 - m);
  let x = 650, lastCreek = 0;
  while (x < L - 450) {
    const p = x / L;
    const pat = pick(p < 0.2
      ? ['rock', 'cactus', 'bush', 'pass', 'carrots', 'log']
      : ['rock', 'cactus', 'pass', 'pass', 'patch', 'log', 'bush', 'holes', 'tumble', 'creek', 'carrots']);
    let span = 0;
    if (pat === 'rock') {
      add('rock', x, Y(6));
      if (R() < 0.4) addCarrot(x + 60, Y());
    } else if (pat === 'cactus') {
      add('cactus', x, Y());
      if (R() < 0.5) { add('cactus', x + between(50, 80), Y()); span = 80; }
    } else if (pat === 'pass') {
      // deux grands obstacles au même endroit, un passage entre les deux (et une carotte pour qui s'y faufile)
      const gy = between(y0 + 12, y1 - 12), gap = 15;
      const up = pick(['rock', 'cactus']), down = pick(['rock', 'cactus']);
      const yu = gy - gap - OBSTACLES[up].d, yd = gy + gap + OBSTACLES[down].d;
      if (yu >= y0 - 4) add(up, x, yu);
      if (yd <= y1 + 4) add(down, x + (down === 'cactus' ? 7 : 0), yd);
      addCarrot(x + 11, gy);
    } else if (pat === 'patch') {
      // un champ de cactus, en quinconce
      let far = R() < 0.5;
      for (let k = 0; k < 3; k++, far = !far) add('cactus', x + k * 75, far ? between(y0, y0 + 30) : between(y1 - 30, y1));
      span = 150;
    } else if (pat === 'log') {
      const d = Math.round(between(14, 26));
      const y = between(y0 + d - 8, y1 - d + 8);
      add('log', x, y, { d });
      if (R() < 0.35) addCarrot(x + 4, y + between(-d, d), 30); // la carotte du saut parfait
    } else if (pat === 'bush') {
      const n = 1 + Math.floor(R() * 3);
      for (let k = 0; k < n; k++) add('bush', x + k * between(28, 50), Y());
      span = n * 40;
    } else if (pat === 'holes') {
      const n = 3 + Math.floor(R() * 2);
      for (let k = 0; k < n; k++) add('hole', x + between(0, 90), Y());
      span = 90;
    } else if (pat === 'tumble') {
      const n = p > 0.5 && R() < 0.5 ? 2 : 1;
      for (let k = 0; k < n; k++) add('tumble', x + k * 90, Y(), { vy: (R() < 0.5 ? -1 : 1) * between(0.03, 0.05) });
      span = n * 90;
    } else if (pat === 'creek' && x - lastCreek > 1600) {
      add('creek', x, (y0 + y1) / 2, { fy: Math.round(between(y0 + 10, y1 - 10)), fd: WILD.ford });
      lastCreek = x;
    } else {
      // une file de carottes en biais
      const n = 4 + Math.floor(R() * 2), dy = between(-6, 6);
      let y = Y(12);
      for (let k = 0; k < n; k++, y += dy) addCarrot(x + k * 18, y);
      span = n * 18;
    }
    x += span + Math.max(150, between(210, 340) * (1 - 0.35 * p));
  }
  obstacles.sort((a, b) => a.x - b.x).forEach((o, i) => { o.id = i; });
  carrots.sort((a, b) => a.x - b.x).forEach((c, i) => { c.id = i; });
  return { obstacles, carrots, len: L, wild: true };
}

// ------------------------------------------------------------ le cheval (même simulation partout)
// y, dir (-1 vers le fond, 1 vers le bord proche) et brake (retenu) ne servent que dans la chevauchée sauvage
export function newHorse(y = 0) {
  return {
    wx: 0, y, dir: 0, brake: false, whip: 0, res: COURSE.res.max, lastWhip: -1e9, whipAt: -1e9,
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
  if (h.brake) v *= WILD.brake;
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

// Fait avancer le cheval de dt ms. Renvoie ce qu'il a croisé : { carrots, hits, mud, perfect, finished }.
// Un obstacle percuté entre dans crashed : on ne le percute qu'une fois, même en restant dessus.
export function stepHorse(h, world, dt, t, got, crashed) {
  const out = { carrots: [], hits: [], mud: null, perfect: null, finished: false };
  if (h.done || dt <= 0) return out;
  const wild = world.wild;
  if (wild) {
    // en l'air on ne dirige presque plus, et un cheval qui trébuche se dirige mal
    const k = (inAir(h, t) ? WILD.airSteer : 1) * (t < h.stunUntil ? 0.5 : 1);
    h.y = clamp(h.y + h.dir * WILD.steer * k * dt, WILD.y0, WILD.y1);
  }
  h.whip = Math.max(0, h.whip - COURSE.whip.decay * dt);
  h.res = Math.min(COURSE.res.max, h.res + COURSE.res.regen * dt);
  const from = h.wx;
  const to = Math.min(world.len, from + horseSpeed(h, t) * dt);
  h.wx = to;
  if (to >= world.len) { h.done = true; out.finished = true; }
  const y = airH(h, t);
  // dans la prairie, il faut aussi être à la bonne profondeur
  const near = (yy, d) => !wild || Math.abs(h.y - yy) <= d;
  for (const c of world.carrots) {
    if (c.x > from && c.x <= to && !got.has(c.id) && Math.abs(y - c.h) <= COURSE.reach && near(c.y, WILD.reachY)) out.carrots.push(c);
  }
  for (const o of world.obstacles) {
    if (o.x > to || o.x + o.w < from || crashed.has(o.id)) continue;
    const kind = OBSTACLES[o.kind];
    if (wild && o.kind !== 'creek' && !near(obsY(o, t), o.d + WILD.hd)) continue;
    if (y > 0 && !kind.tall) {
      // en l'air, on passe au-dessus ; le sommet du saut pile au-dessus du milieu : saut parfait
      const mid = o.x + o.w / 2;
      if (!out.perfect && o.kind !== 'mud' && mid > from && mid <= to && Math.abs((t - h.airT0) / COURSE.jump.ms - 0.5) <= COURSE.perfect.win) {
        h.whip = Math.min(1, h.whip + COURSE.perfect.gain);
        out.perfect = o;
      }
      continue;
    }
    if (kind.slow) {
      if (o.kind === 'creek' && Math.abs(h.y - o.fy) <= o.fd) continue; // au gué, l'eau ne freine pas
      if (t >= h.slowUntil) out.mud = o;
      h.slowUntil = t + COURSE.mud.ms;
      crashed.add(o.id);
      continue;
    }
    out.hits.push(o);
    crashed.add(o.id);
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
      got: new Set(), crashed: new Set(), wx: 0, y: 0, rank: 0, time: null,
      // le bot a son propre registre d'obstacles percutés : celui du joueur sert à l'arbitre
      ai: pl.bot ? { horse: newHorse(), lastT: 0, plan: null, keep: rnd(22, 55), crashed: new Set(), ty: 0, look: rnd(0.7, 1.1), cid: -1, cgo: false, creek: null, blind: new Map() } : null,
    }));
    this.world = courseWorld(this.seed);
    if (this.world.wild) {
      this.p.forEach((p, i) => {
        p.y = startY(i, players.length);
        if (p.ai) p.ai.horse.y = p.ai.ty = p.y;
      });
    }
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
      ...this.view(i), seed: this.seed, duration: this.duration, elapsed: this.t, wx: p.wx, y: p.y,
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
    if (this.world.wild && Number.isFinite(a.y)) p.y = clamp(a.y, WILD.y0, WILD.y1);
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
    if (!o || OBSTACLES[o.kind].slow || p.crashed.has(id) || Math.abs(o.x - wx) > COURSE.tolerance) return;
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
      // prochain obstacle à sauter : on prépare le saut (point de décollage visé, avec une erreur)
      while (h.oi < W.obstacles.length && W.obstacles[h.oi].x + W.obstacles[h.oi].w < h.wx) h.oi++;
      const o = W.wild ? this.botSteer(b, h, W, st, p.got) : W.obstacles[h.oi];
      if (o && b.plan?.id !== o.id) {
        const miss = Math.random() < 0.1;
        b.plan = { id: o.id, skip: o.kind === 'mud' && Math.random() < 0.35, err: miss ? (Math.random() < 0.5 ? -40 : 70) : rnd(-12, 12) };
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
      const res = stepHorse(h, W, dt, st, p.got, b.crashed);
      for (const c of res.carrots) { h.res = Math.min(COURSE.res.max, h.res + COURSE.carrot); this.carrot(i, c.id, h.wx); }
      for (const ob of res.hits) this.crash(i, ob.id, h.wx);
      p.wx = h.wx;
      p.y = h.y;
      if (res.finished) { this.arrive(i, st); break; }
    }
    b.lastT = t;
    this.liveOut.push({ key: p.key, d: horseLive(h, t) });
  }

  // Dans la prairie, le bot regarde devant lui (plus ou moins loin selon le bot) : il contourne les grands
  // obstacles par le passage libre le plus proche, prend le gué ou saute le ruisseau, et va chercher les
  // carottes quand la voie est libre. Règle h.dir et renvoie le prochain obstacle à sauter (ou null).
  botSteer(b, h, W, st, got) {
    const v = Math.max(0.05, horseSpeed(h, st));
    const look = (110 + v * 520) * b.look;
    const m = WILD.hd + 4;
    const blocked = [], hop = [];
    let creek = null;
    for (let k = h.oi; k < W.obstacles.length; k++) {
      const o = W.obstacles[k];
      if (o.x > h.wx + look) break;
      if (o.x + o.w < h.wx - 2 || b.crashed.has(o.id)) continue;
      if (o.kind === 'creek') { creek ||= o; hop.push(o); continue; }
      const oy = obsY(o, st + Math.max(0, o.x - h.wx) / v); // là où il sera quand on y arrivera
      if (OBSTACLES[o.kind].tall) {
        // de temps en temps, il ne voit pas un grand obstacle venir
        if (!b.blind.has(o.id)) b.blind.set(o.id, Math.random() < 0.06);
        if (!b.blind.get(o.id)) blocked.push([oy - o.d - m, oy + o.d + m]);
      } else if (Math.abs(oy - h.y) <= o.d + WILD.hd + 3) hop.push(o);
    }
    const free = (y) => !blocked.some(([a, c]) => y > a && y < c);
    if (creek && b.creek?.id !== creek.id) b.creek = { id: creek.id, ford: Math.random() < 0.6 };
    const ford = creek && b.creek.ford;
    // la voie visée : le gué, sinon une carotte devant (si la voie est libre), sinon on garde sa trajectoire
    let want = b.ty;
    if (ford && free(creek.fy)) want = creek.fy;
    else if (!blocked.length) {
      const c = W.carrots.find((q) => q.x > h.wx + 30 && q.x < h.wx + look + 60 && q.h < 10 && !got.has(q.id));
      if (c && c.id !== b.cid) { b.cid = c.id; b.cgo = Math.random() < 0.7; }
      if (c && b.cgo) want = c.y;
    }
    if (!free(want)) {
      // le passage libre le plus proche de là où on est
      want = h.y;
      for (let dd = 0; dd <= WILD.y1 - WILD.y0; dd += 2) {
        if (h.y - dd >= WILD.y0 && free(h.y - dd)) { want = h.y - dd; break; }
        if (h.y + dd <= WILD.y1 && free(h.y + dd)) { want = h.y + dd; break; }
      }
    }
    b.ty = clamp(want, WILD.y0, WILD.y1);
    h.dir = Math.abs(b.ty - h.y) < 1.5 ? 0 : Math.sign(b.ty - h.y);
    // le ruisseau ne se saute pas si l'on passe au gué
    return hop.find((o) => o.kind !== 'creek' || !ford || Math.abs(h.y - o.fy) > o.fd - 3) || null;
  }
}

// Ce que les autres voient d'un cheval : position (et profondeur dans la prairie), en l'air, coup de cravache, épuisé, trébuche
export function horseLive(h, t) {
  return {
    x: Math.round(h.wx),
    ...(h.y ? { y: Math.round(h.y) } : {}),
    ...(inAir(h, t) ? { a: 1 } : {}),
    ...(t - h.whipAt < 300 ? { w: 1 } : {}),
    ...(tired(h, t) ? { e: 1 } : {}),
    ...(t < h.stunUntil ? { s: 1 } : {}),
  };
}
