// Mini-jeu « La pinte » : chacun à son tour fait glisser sa chope le long du comptoir. La plus proche du bout
// gagne la manche, mais une chope lancée trop fort (ou de travers) tombe et ne rapporte rien. Les chopes
// restent sur le comptoir pendant la manche : on peut pousser celles des autres dans le vide.
// Chaque lancer a sa bière (plus ou moins lourde, grosse ou glissante) et chaque manche ses surprises
// (flaque, sciure, courant d'air, bouteilles, pièce d'or…), selon la salle et la météo.
// Ce fichier contient les règles partagées (la glissade est simulée pas à pas, de la même façon partout)
// et l'arbitre qui tourne chez l'hôte, avec la même interface que MiniGame (mini.js).
import { MODES, COUNTDOWN, rng } from './worlds.js';
import { pickEnv } from './env.js';
import { roomIdFor } from './room.js';

const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export const PINTE = {
  L: 320, // longueur du comptoir (unités = pixels à l'écran ; 1 unité = 2 cm)
  D: 26, // profondeur du comptoir
  R: 4, // rayon d'une chope
  START: 12, // la chope part du bout gauche, au milieu
  MU: 1.2e-4, // freinage (unités/ms²)
  WET: 0.35, // dans une flaque de bière, le freinage tombe à 35 %
  SAW: 2.2, // dans la sciure, il est 2,2 fois plus fort
  BOTTLE_R: 3, // rayon d'une bouteille oubliée
  COIN_R: 3, COIN: 30, // pièce d'or : rayon, et points pour celui qui l'empoche
  REACH: 1.25, // à pleine puissance, sur bois sec, la chope irait 25 % plus loin que le bout
  MAXA: 0.1, // direction : ±0,1 rad
  E: 0.9, // rebond entre deux chopes
  DT: 8, // pas de la simulation (ms)
  AIM: 15000, // temps pour lancer
  INTRO: 1800, // annonce de la manche
  BONUS: 50, // la chope la plus proche du bout
  CM: 2,
  dirMs: 1800, powMs: 1400, // aller-retour de l'aiguille et de la jauge
};
export const pinteRounds = (n) => (n <= 2 ? 5 : n === 3 ? 4 : 3);

// vitesse de départ pour une puissance 0..1 (distance parcourue sur bois sec proportionnelle à la puissance)
export const speedFor = (power) => Math.sqrt(2 * PINTE.MU * PINTE.REACH * (PINTE.L - PINTE.START) * power);

// ------------------------------------------------------------ bières
// Le barman sert une bière différente à chaque lancer (la même pour toute la table, tirée de la graine).
// r : rayon ; m : masse dans les chocs ; mu : freinage (moins de freinage = elle va plus loin à puissance égale).
export const BEERS = {
  blonde: { name: 'UNE BLONDE', desc: 'LA CLASSIQUE', r: 4, m: 1, mu: 1, w: 6 },
  brune: { name: 'UNE BRUNE', desc: 'LOURDE : ELLE POUSSE FORT', r: 4, m: 1.9, mu: 1, w: 2.5 },
  shot: { name: 'UN PETIT WHISKY', desc: 'PETIT ET LÉGER', r: 3, m: 0.5, mu: 1, w: 2 },
  mousse: { name: 'UNE MOUSSEUSE', desc: 'ELLE GLISSE PLUS LOIN', r: 4, m: 1, mu: 0.8, w: 2 },
  geante: { name: 'LA CHOPE DU MINEUR', desc: 'ÉNORME ET LOURDE : UN VRAI MUR', r: 6, m: 2.6, mu: 1, w: 1.2 },
};
export const beerOf = (q) => BEERS[q?.b] || BEERS.blonde;

// 1re manche : des blondes pour tout le monde, le temps de prendre la main
export function beerFor(seed, n, turn) {
  if (n <= 1) return 'blonde';
  const R = rng((seed ^ Math.imul(n * 8 + turn + 1, 0x85ebca6b)) >>> 0);
  const list = Object.entries(BEERS);
  let x = R() * list.reduce((s, [, b]) => s + b.w, 0);
  for (const [id, b] of list) if ((x -= b.w) <= 0) return id;
  return 'blonde';
}

// écart entre le bord de la chope et le bout du comptoir, en cm (0 si elle dépasse déjà)
export const gapCm = (q) => Math.max(0, Math.round((PINTE.L - q.x - beerOf(q).r) * PINTE.CM));
export const ptsFor = (cm) => Math.max(0, 100 - cm);

// ------------------------------------------------------------ modificateurs de manche
// Tirés de la graine (les mêmes pour toute la table), selon la salle et la météo : rien à la 1re manche,
// un ou deux ensuite, et la dernière tournée compte double.
export const MODS = {
  flaque: { label: 'FLAQUE', name: 'DE LA BIÈRE A COULÉ : LA CHOPE Y GLISSE', col: '#e8a830' },
  sciure: { label: 'SCIURE', name: 'DE LA SCIURE SUR LE COMPTOIR : ELLE Y FREINE', col: '#e0c890' },
  vent: { label: 'COURANT D\'AIR', name: 'LA FENÊTRE S\'OUVRE : UN COURANT D\'AIR POUSSE DE CÔTÉ', col: '#c8dcf8' },
  souffle: { label: 'VENT', name: 'LES PORTES BATTANTES CLAQUENT : DU VENT', col: '#c8dcf8' },
  cire: { label: 'CIRE', name: 'LE BARMAN A CIRÉ LE COMPTOIR : TOUT GLISSE PLUS', col: '#fdf6e0' },
  gel: { label: 'GEL', name: 'LE COMPTOIR EST GELÉ : TOUT GLISSE BIEN PLUS', col: '#d8f0ff' },
  virage: { label: 'VIRAGE', name: 'LE TRAIN PREND UN VIRAGE : TOUT PENCHE', col: '#f0c890' },
  bouteille: { label: 'BOUTEILLES', name: 'LE BARMAN A OUBLIÉ DES BOUTEILLES SUR LE COMPTOIR', col: '#b8e070' },
  piece: { label: 'PIÈCE D\'OR', name: `UNE PIÈCE D'OR : +${PINTE.COIN} À LA CHOPE QUI PASSE DESSUS`, col: '#f8d070' },
  double: { label: 'POINTS X2', name: 'DERNIÈRE TOURNÉE : LES POINTS COMPTENT DOUBLE', col: '#f0907a' },
};

// libellé d'un modificateur (le vent change de nom selon son sens)
export function modName(id, m) {
  if (id === 'souffle') return m.push > 0 ? 'PORTES BATTANTES : VENT DANS LE DOS, ÇA VA PLUS LOIN' : 'PORTES BATTANTES : VENT DE FACE, ÇA FREINE';
  if (id === 'virage') return `LE TRAIN PREND UN VIRAGE : TOUT PENCHE VERS ${m.tilt > 0 ? 'TOI' : 'LE MUR'}`;
  return MODS[id].name;
}
export function modLabel(id, m) {
  if (id === 'souffle') return m.push > 0 ? 'VENT DANS LE DOS' : 'VENT DE FACE';
  return MODS[id].label;
}

export function modsFor(seed, n, rounds) {
  const m = { list: [], mult: 1 };
  if (n <= 1) return m;
  const { L, D, MU } = PINTE;
  const R = rng((seed ^ Math.imul(n, 0x9e3779b1)) >>> 0);
  const room = roomIdFor(seed), env = pickEnv(seed, 'roulette').id;
  const windy = env === 'poussiere' || env === 'orage' || env === 'neige';
  const pool = [
    ['flaque', 3], ['sciure', 2], ['vent', windy ? 4 : 2], ['souffle', windy ? 2 : 1.2],
    [env === 'neige' ? 'gel' : 'cire', env === 'neige' ? 3 : 1.2], ['bouteille', 2], ['piece', 2.2],
  ];
  if (room === 'train') pool.push(['virage', 4]);
  // deux poussées de côté à la fois, ce serait injouable
  const clash = { vent: 'virage', virage: 'vent', cire: 'gel', gel: 'cire' };
  const count = R() < 0.35 ? 2 : 1;
  while (m.list.length < count) {
    const left = pool.filter(([id]) => !m.list.includes(id) && !m.list.includes(clash[id]));
    let x = R() * left.reduce((s, [, w]) => s + w, 0);
    const pick = left.find(([, w]) => (x -= w) <= 0) || left[0];
    m.list.push(pick[0]);
  }
  const zone = (min, max) => { const w = Math.round(min + R() * (max - min)); return { a: Math.round(70 + R() * (L - 110 - w)), w }; };
  const side = () => (R() < 0.5 ? -1 : 1);
  for (const id of m.list) {
    if (id === 'flaque') m.puddle = zone(24, 58);
    else if (id === 'sciure') m.saw = zone(22, 46);
    else if (id === 'vent') m.wind = { ...zone(50, 90), fy: side() * MU * (0.2 + R() * 0.12) };
    else if (id === 'souffle') m.push = (R() < 0.55 ? 1 : -1) * MU * (0.1 + R() * 0.06);
    else if (id === 'cire') m.slick = 0.75;
    else if (id === 'gel') m.slick = 0.6;
    else if (id === 'virage') m.tilt = side() * MU * (0.1 + R() * 0.06);
    else if (id === 'bouteille') {
      m.bottles = [];
      for (let k = R() < 0.45 ? 2 : 1; k > 0; k--) {
        let x;
        do x = Math.round(110 + R() * (L - 175)); while (m.bottles.some((b) => Math.abs(b.x - x) < 24));
        m.bottles.push({ x, y: Math.round(6 + R() * (D - 12)) });
      }
    } else if (id === 'piece') m.coin = { x: Math.round(140 + R() * (L - 180)), y: Math.round(5 + R() * (D - 10)), by: null };
  }
  if (n === rounds) { m.mult = 2; m.list.push('double'); }
  return m;
}

const inZone = (z, x) => !!z && x >= z.a && x <= z.a + z.w;

// Glissade : toutes les chopes du comptoir, avançées par pas fixes (même résultat chez tout le monde).
// Une chope tombe quand son centre passe le bout (end), l'arrière (back) ou l'avant (front) du comptoir.
export class Slide {
  constructor(pints, mods) {
    this.p = pints.map((q) => { const B = beerOf(q); return { vx: 0, vy: 0, ...q, r: B.r, m: B.m, mu: B.mu }; });
    this.m = mods || {};
    this.coin = this.m.coin && this.m.coin.by == null ? this.m.coin : null;
    this.coinBy = null;
    this.t = 0;
    this.log = []; // { t, type: 'clink' | 'bonk' | 'coin' | 'fall', id, edge, v }
    this.done = false;
  }

  // freinage là où se trouve la chope (bière, flaque, sciure, cire ou gel)
  fric(q) {
    const m = this.m, P = PINTE;
    return P.MU * q.mu * (m.slick || 1) * (inZone(m.puddle, q.x) ? P.WET : 1) * (inZone(m.saw, q.x) ? P.SAW : 1);
  }

  step() {
    const { DT, L, D, E, BOTTLE_R, COIN_R } = PINTE;
    const m = this.m;
    let moving = false;
    for (const q of this.p) {
      if (q.out) continue;
      if (!q.vx && !q.vy) continue; // au repos, le frottement la retient : le vent ne la déplace pas
      const fr = this.fric(q);
      // vent, pente : jamais plus fort que le frottement, pour que toute chope finisse par s'arrêter
      let fx = m.push || 0, fy = (m.tilt || 0) + (inZone(m.wind, q.x) ? m.wind.fy : 0);
      const f = Math.hypot(fx, fy);
      if (f > 0.9 * fr) { fx *= (0.9 * fr) / f; fy *= (0.9 * fr) / f; }
      q.vx += fx * DT;
      q.vy += fy * DT;
      const s = Math.sqrt(q.vx * q.vx + q.vy * q.vy);
      const ns = Math.max(0, s - fr * DT);
      q.vx *= ns / s;
      q.vy *= ns / s;
      q.x += q.vx * DT;
      q.y += q.vy * DT;
      if (ns > 0) moving = true;
    }
    // chocs entre chopes : la plus lourde pousse plus fort
    for (let i = 0; i < this.p.length; i++) {
      const a = this.p[i];
      if (a.out) continue;
      for (let j = i + 1; j < this.p.length; j++) {
        const b = this.p[j];
        if (b.out) continue;
        const rr = a.r + b.r;
        const dx = b.x - a.x, dy = b.y - a.y, d2 = dx * dx + dy * dy;
        if (d2 >= rr * rr) continue;
        const d = Math.sqrt(d2) || 1e-6, nx = dx / d, ny = dy / d;
        const ia = 1 / a.m, ib = 1 / b.m, over = (rr - d) / (ia + ib);
        a.x -= nx * over * ia; a.y -= ny * over * ia; b.x += nx * over * ib; b.y += ny * over * ib;
        const rel = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
        if (rel <= 0) continue;
        const k = (rel * (1 + E)) / (ia + ib);
        a.vx -= k * ia * nx; a.vy -= k * ia * ny; b.vx += k * ib * nx; b.vy += k * ib * ny;
        this.log.push({ t: this.t, type: 'clink', id: b.id, v: rel });
        moving = true;
      }
    }
    for (const q of this.p) {
      if (q.out) continue;
      // bouteilles oubliées : elles ne bougent pas, la chope rebondit dessus
      for (const o of m.bottles || []) {
        const rr = q.r + BOTTLE_R, dx = q.x - o.x, dy = q.y - o.y, d2 = dx * dx + dy * dy;
        if (d2 >= rr * rr) continue;
        const d = Math.sqrt(d2) || 1e-6, nx = dx / d, ny = dy / d;
        q.x = o.x + nx * rr; q.y = o.y + ny * rr;
        const vn = q.vx * nx + q.vy * ny;
        if (vn < 0) {
          q.vx -= 1.6 * vn * nx; q.vy -= 1.6 * vn * ny;
          this.log.push({ t: this.t, type: 'bonk', id: q.id, v: -vn });
        }
      }
      // pièce d'or : la première chope qui passe dessus l'empoche pour son propriétaire
      const c = this.coin;
      if (c && this.coinBy == null && Math.hypot(q.x - c.x, q.y - c.y) < q.r + COIN_R) {
        this.coinBy = q.o;
        this.log.push({ t: this.t, type: 'coin', id: q.id });
      }
      const edge = q.x > L ? 'end' : q.y < 0 ? 'back' : q.y > D ? 'front' : null;
      if (!edge) continue;
      q.out = edge;
      this.log.push({ t: this.t, type: 'fall', id: q.id, edge });
    }
    this.t += DT;
    if (!moving) this.done = true;
  }

  run() {
    while (!this.done && this.t < 20000) this.step();
    return this;
  }
}

// Une chope lancée seule : où elle s'arrête (null si elle tombe)
function solo(power, angle, mods, b) {
  const v = speedFor(power);
  const s = new Slide([{ id: 0, b, x: PINTE.START, y: PINTE.D / 2, vx: v * Math.cos(angle), vy: v * Math.sin(angle) }], mods).run();
  return s.p[0].out ? null : s.p[0];
}

// Puissance qui amène une chope seule au plus près de x (dans cette direction), sans la faire tomber
export function powerFor(x, mods, b = 'blonde', angle = 0) {
  let lo = 0, hi = 1;
  for (let k = 0; k < 20; k++) {
    const p = (lo + hi) / 2;
    const q = solo(p, angle, mods, b);
    if (!q || q.x > x) hi = p;
    else lo = p;
  }
  return lo;
}

// Meilleur lancer vers x : on essaie plusieurs directions (courant d'air, virage, bouteilles) et on garde
// celle qui s'arrête le plus près, puis le plus au milieu du comptoir.
export function bestThrow(x, mods, b) {
  let best = { power: powerFor(x, mods, b, 0), angle: 0, score: -1e9 };
  for (let a = -0.08; a <= 0.0801; a += 0.02) {
    const power = powerFor(x, mods, b, a);
    const q = solo(power, a, mods, b);
    if (!q) continue;
    const score = q.x - 3 * Math.abs(q.y - PINTE.D / 2);
    if (score > best.score) best = { power, angle: a, score };
  }
  return best;
}

// ------------------------------------------------------------ arbitre (navigateur de l'hôte)
export class PinteGame {
  constructor(players) {
    this.kind = 'pinte';
    this.seed = Math.floor(Math.random() * 2 ** 31);
    this.duration = MODES.pinte.duration;
    this.rounds = pinteRounds(players.length);
    this.p = players.map((pl) => ({
      key: pl.key, name: pl.name, character: pl.character, bot: !!pl.bot,
      score: 0, left: false, stats: { throws: 0, falls: 0, knocks: 0, best: null, coins: 0 },
    }));
    // ordre de passage tiré au sort, puis décalé d'un cran à chaque manche (le dernier à lancer a l'avantage)
    this.base = this.p.map((_, i) => i).sort(() => Math.random() - 0.5);
    this.cur = null;
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
      players: this.p.map((p) => ({ key: p.key, name: p.name, character: p.character, score: p.score, left: p.left, bot: p.bot })),
    };
  }

  publicRound() {
    if (!this.cur) return null;
    const { bot, ...pub } = this.cur;
    return pub;
  }

  // État complet pour un joueur qui se reconnecte en cours de partie.
  syncView(i) {
    return { ...this.view(i), seed: this.seed, duration: this.duration, elapsed: this.t, round: this.publicRound() };
  }

  push(ev) {
    ev.dur = 0;
    ev.states = this.p.map((_, i) => this.view(i));
    this.events.push(ev);
  }

  act(i, a) {
    if (this.phase !== 'playing') return { error: 'La partie est terminée.' };
    if (!a || typeof a !== 'object' || a.kind !== 'throw') return { error: 'Action invalide.' };
    const c = this.cur, t = this.t;
    if (!c || c.phase !== 'aim' || a.n !== c.n || a.turn !== c.turn || c.order[c.turn] !== i) return { events: [] };
    if (!Number.isFinite(a.power) || !Number.isFinite(a.angle) || t < c.turnAt - 300) return { events: [] };
    this.slide(i, a.power, a.angle, t);
    return { events: this.flush() };
  }

  slide(i, power, angle, t) {
    const c = this.cur, P = PINTE;
    power = clamp(power, 0, 1);
    angle = clamp(angle, -P.MAXA, P.MAXA);
    const v = speedFor(power);
    const start = [...c.pints, { id: c.turn, o: i, b: c.beers[c.turn], x: P.START, y: P.D / 2, vx: v * Math.cos(angle), vy: v * Math.sin(angle) }];
    const mods = structuredClone(c.mods); // état avant le lancer (pièce encore là) : les joueurs rejouent la glissade avec
    const sim = new Slide(start, c.mods).run();
    c.pints = sim.p.filter((q) => !q.out).map(({ id, o, b, x, y }) => ({ id, o, b, x, y }));
    if (sim.coinBy != null) {
      c.mods.coin.by = sim.coinBy;
      this.p[sim.coinBy].score += P.COIN;
      this.p[sim.coinBy].stats.coins++;
    }
    const fell = sim.p.filter((q) => q.out);
    const st = this.p[i].stats;
    st.throws++;
    for (const q of fell) {
      if (q.o === i) st.falls++;
      else st.knocks++;
    }
    c.phase = 'slide';
    c.nextAt = t + sim.t + (fell.length ? 1500 : 900);
    this.push({ type: 'pThrow', who: i, start, mods, dur: sim.t, round: this.publicRound() });
  }

  tick() {
    if (this.phase !== 'playing') return [];
    const t = this.t;
    if (t < 0) return [];
    const c = this.cur;
    if (!c) this.newRound(t);
    else if (c.phase === 'aim') {
      const who = c.order[c.turn];
      if (this.p[who].left) this.nextTurn(t);
      else if (t > c.turnAt + PINTE.AIM + 300) {
        c.phase = 'wait';
        c.nextAt = t + 1000;
        this.push({ type: 'pSkip', who, round: this.publicRound() });
      } else if (this.p[who].bot) this.botThink(who, t);
    } else if (c.phase === 'score') {
      if (t >= c.nextAt) {
        if (c.n >= this.rounds) this.finish();
        else this.newRound(t);
      }
    } else if (t >= c.nextAt) this.nextTurn(t);
    return this.flush();
  }

  newRound(t) {
    const n = (this.cur?.n || 0) + 1;
    const k = (n - 1) % this.base.length;
    const order = [...this.base.slice(k), ...this.base.slice(0, k)].filter((i) => !this.p[i].left);
    const mods = modsFor(this.seed, n, this.rounds);
    const beers = order.map((_, k) => beerFor(this.seed, n, k));
    // plus de surprises à annoncer : l'annonce de la manche dure un peu plus
    const intro = PINTE.INTRO + (mods.list.length ? 900 * mods.list.length : 0);
    this.cur = { n, rounds: this.rounds, order, turn: 0, turnAt: t + intro, phase: 'aim', pints: [], mods, beers, res: null, bot: null };
    this.push({ type: 'pRound', round: this.publicRound() });
  }

  nextTurn(t) {
    const c = this.cur;
    c.turn++;
    c.bot = null;
    if (c.turn >= c.order.length) return this.score(t);
    c.phase = 'aim';
    c.turnAt = t + 300;
    this.push({ type: 'pTurn', round: this.publicRound() });
  }

  // Fin de manche : chaque chope encore sur le comptoir rapporte 100 pts moins son écart en cm,
  // et la plus proche du bout (ex aequo compris) offre la tournée : +50. Dernière tournée : tout compte double.
  score(t) {
    const c = this.cur;
    const res = c.pints.map((q) => ({ id: q.id, o: q.o, cm: gapCm(q) }));
    const best = res.length ? Math.min(...res.map((r) => r.cm)) : null;
    for (const r of res) {
      r.pts = (ptsFor(r.cm) + (r.cm === best ? PINTE.BONUS : 0)) * (c.mods.mult || 1);
      r.best = r.cm === best;
      const p = this.p[r.o];
      p.score += r.pts;
      if (p.stats.best == null || r.cm < p.stats.best) p.stats.best = r.cm;
    }
    c.res = res;
    c.phase = 'score';
    c.nextAt = t + 4200;
    this.push({ type: 'pScore', round: this.publicRound() });
  }

  finish() {
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
    return this.flush();
  }

  // Il ne reste qu'un joueur : la partie s'arrête, le partant finit dernier.
  forfeit(i) {
    if (this.phase !== 'playing' || !this.p[i]) return [];
    this.p[i].left = true;
    this.finish();
    return this.flush();
  }

  // ------------------------------------------------------------ bots (mode solo)
  // Le bot vise un écart de quelques cm. Si un adversaire est tout près du bout et qu'il ne fait pas mieux,
  // il tente parfois de le pousser dans le vide. Sa main tremble un peu : il lui arrive de faire tomber sa chope.
  // Les autres voient son aiguille puis sa jauge, comme pour un joueur.
  botThink(i, t) {
    const c = this.cur, P = PINTE;
    if (!c.bot) {
      const b = c.beers[c.turn], B = BEERS[b];
      const gap = (q) => P.L - q.x - beerOf(q).r;
      const lead = [...c.pints].sort((a, b) => gap(a) - gap(b))[0];
      // avec une bière lourde, il tente plus souvent de dégager la chope de tête
      let angle = 0, power;
      if (lead && lead.o !== i && gap(lead) < 30 && Math.random() < (B.m > 1.5 ? 0.75 : B.m < 1 ? 0.3 : 0.55)) {
        angle = Math.atan2(lead.y - P.D / 2, lead.x - P.START);
        power = powerFor(Math.min(P.L - B.r - 1, lead.x + 40), c.mods, b, angle);
      } else ({ power, angle } = bestThrow(P.L - B.r - rnd(3, 14), c.mods, b));
      const tri = () => Math.random() + Math.random() - 1;
      c.bot = {
        angle: clamp(angle + tri() * 0.025, -P.MAXA, P.MAXA), power: clamp(power + tri() * 0.04, 0, 1),
        dirAt: c.turnAt + rnd(500, 900), stage: 0,
      };
      c.bot.powAt = c.bot.dirAt + rnd(900, 1700);
      c.bot.goAt = c.bot.powAt + rnd(700, 1300);
    }
    const b = c.bot;
    const live = (d) => this.liveOut.push({ key: this.p[i].key, d: { n: c.n, turn: c.turn, ...d } });
    if (b.stage === 0 && t >= b.dirAt) { b.stage = 1; live({ s: 'dir', t }); }
    if (b.stage === 1 && t >= b.powAt) { b.stage = 2; live({ s: 'pow', a: b.angle, t }); }
    if (b.stage === 2 && t >= b.goAt) { b.stage = 3; this.slide(i, b.power, b.angle, t); }
  }
}
