// Mini-jeu « Assaut du fort » : deux équipes, l'une attaque le fort, l'autre défend depuis la palissade,
// puis on échange les rôles à la mi-temps. Ce fichier contient les règles partagées (le monde vient d'une graine)
// et l'arbitre qui tourne dans le navigateur de l'hôte, avec la même interface que MiniGame (mini.js).
import { MODES, COUNTDOWN, W, rng, FORT_MAPS } from './worlds.js';

const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

const BREAK = 4000; // changement de camp
export const FORT = {
  brk: BREAK,
  half: (MODES.fort.duration - BREAK) / 2,
  wallY: 96, stakeH: 22, walkY: 90, // pied de la palissade, hauteur des pieux, pieds des défenseurs
  gateX: 192, gateW: 44, gateHp: 10, rebuild: 6000, // après une brèche, la porte reste ouverte 6 s
  top: 114, bottom: 208, minX: 12, maxX: 372, // champ des assaillants (pieds)
  defMin: 40, defMax: 344, // chemin de ronde
  speed: 0.055, defSpeed: 0.075, // px/ms
  hp: 3, respawn: 3000, loneRespawn: 2000, safe: 1200, // invulnérable un instant en revenant (infériorité numérique : fortMaxHp, fortGateMul)
  ammo: 6, reload: 1100, rof: 240, rifleRof: 110,
  dynRange: 64, defDynRange: 100, dynCd: 4000, dynFastCd: 1100, dynDmg: 2, blast: 22, big: 1.7,
  expose: 600, // après un tir ou un lancer, l'assaillant reste à découvert
  wade: 0.45, // dans la rivière, hors des ponts
  crateLife: 9000,
};
export const FORT_PTS = { gate: 60, breach: 250, enter: 150, kill: 50, defKill: 60, hold: 20, bonus: 20 };
export { TEAM_NAMES } from './worlds.js';
export const TEAM_COLORS = ['#e8604c', '#5a8ad8'];

// Caisses de ravitaillement : les assaillants passent dessus, les défenseurs tirent dessus.
export const FORT_BONUS = {
  keg: { name: 'BARIL DE POUDRE', desc: 'PROCHAINE DYNAMITE GÉANTE', w: 3 },
  whisky: { name: 'WHISKY', desc: 'SANTÉ AU MAX', w: 3 },
  rifle: { name: 'WINCHESTER', desc: 'TIR RAPIDE SANS RECHARGER', w: 3, ms: 8000 },
  star: { name: 'ÉTOILE DU SHÉRIF', desc: 'INVULNÉRABLE', w: 2, ms: 6000 },
  spurs: { name: 'ÉPERONS', desc: 'VITESSE +60 %', w: 2, ms: 8000 },
  dynpack: { name: 'CAISSE DE DYNAMITE', desc: '3 DYNAMITES EN RAFALE', w: 2 },
};

export { FORT_MAPS }; // champs de bataille : dans worlds.js, lus aussi par le lobby

export const COVERS = {
  rock: [24, 12], barrels: [20, 16], wagon: [46, 22], crates: [18, 18], hay: [24, 13], cactus: [12, 24],
  fence: [32, 12], boulder: [32, 22], adobe: [30, 14],
};
// ce que la dynamite pulvérise (les rochers et les murets d'adobe tiennent bon)
export const FRAGILE = new Set(['barrels', 'wagon', 'crates', 'hay', 'cactus', 'fence']);

export const fortTeam = (i) => i % 2;
// manche en cours : 0, 1, ou -1 avant, pendant le changement de camp et après
export function fortHalf(t) {
  if (t < 0) return -1;
  if (t < FORT.half) return 0;
  if (t < FORT.half + FORT.brk) return -1;
  return t < 2 * FORT.half + FORT.brk ? 1 : -1;
}
export const fortHalfStart = (h) => h * (FORT.half + FORT.brk);
// les Rouges attaquent en premier
export const fortAttacking = (i, h) => fortTeam(i) === h;

// Au-dessus de la porte, le chemin de ronde monte sur le parapet du porche.
export const PARA_TOP = 44;
export const overGate = (x) => Math.abs(x - FORT.gateX) <= FORT.gateW / 2 + 12;
export const wallTop = (x) => (overGate(x) ? PARA_TOP : FORT.wallY - FORT.stakeH);
export const defFeet = (x) => wallTop(x) + 16;

export function fortTeamSize(i, n) {
  let mine = 0;
  for (let j = 0; j < n; j++) if (fortTeam(j) === fortTeam(i)) mine++;
  return mine;
}
// Joueur seul contre deux : sa dynamite compte double sur la porte (sinon il n'en vient presque jamais à bout)
// et il revient plus vite au combat (FORT.loneRespawn). Réglé sur des parties entre bots : 51 % / 49 %.
export function fortGateMul(i, n) {
  const mine = fortTeamSize(i, n);
  return Math.max(1, Math.floor((n - mine) / mine));
}
// Deux contre trois : un PV de plus suffit (le joueur seul contre deux a déjà fortGateMul).
export function fortMaxHp(i, n) {
  const mine = fortTeamSize(i, n);
  return mine < n - mine && fortGateMul(i, n) === 1 ? FORT.hp + 1 : FORT.hp;
}

// Point de départ (k = nombre de réapparitions, pour varier un peu).
// Les assaillants s'étalent autour du chemin, les défenseurs au milieu de leur secteur du chemin de ronde.
export function fortSpawn(i, n, attack, k = 0) {
  const mates = [];
  for (let j = 0; j < n; j++) if (fortTeam(j) === fortTeam(i)) mates.push(j);
  const m = mates.indexOf(i), s = mates.length;
  const x = (attack
    ? FORT.gateX + (m - (s - 1) / 2) * 130
    : Math.round(FORT.defMin + ((m + 0.5) * (FORT.defMax - FORT.defMin)) / s)) + (k ? ((k * 47) % 90) - 45 : 0);
  return attack
    ? { x: clamp(x, FORT.minX, FORT.maxX), y: FORT.bottom - 2 }
    : { x: clamp(x, FORT.defMin, FORT.defMax), y: FORT.walkY };
}

function pick(R, weights) {
  const list = Object.entries(weights);
  let x = R() * list.reduce((s, [, w]) => s + (w.w ?? w), 0);
  for (const [id, w] of list) if ((x -= w.w ?? w) <= 0) return id;
  return list[0][0];
}

// Carte, abris, rivière et caisses de ravitaillement, tirés de la graine.
// n : nombre de joueurs (à 5 ou 6, plus d'abris et des caisses plus fréquentes ; le même monde jusqu'à 4).
export function fortWorld(seed, mapId = null, n = 4) {
  const R = rng(seed);
  const drawn = pick(R, FORT_MAPS); // toujours tiré, pour que la suite de la graine ne dépende pas d'une carte imposée
  const map = mapId && FORT_MAPS[mapId] ? mapId : drawn;
  const M = FORT_MAPS[map];
  let river = null;
  if (M.river) {
    const y = 150 + Math.round(R() * 12);
    const b1 = Math.round(60 + R() * 70), b2 = Math.round(250 + R() * 70);
    river = { y0: y, y1: y + 14, bridges: [b1, b2], bw: 28 };
  }
  const inRiver = (y, pad) => river && y > river.y0 - pad && y < river.y1 + pad + 6;
  const covers = [];
  const nCovers = n > 4 ? 11 : 9; // trois assaillants : deux abris de plus
  for (let tries = 0; covers.length < nCovers && tries < 400; tries++) {
    let kind = pick(R, M.covers);
    if (kind === 'wagon' && covers.some((c) => c.kind === 'wagon')) kind = 'barrels';
    if (!COVERS[kind]) continue;
    const [w, h] = COVERS[kind];
    const x = Math.round(20 + w / 2 + R() * (W - 40 - w));
    const y = Math.round(132 + R() * 58);
    if (inRiver(y, 8)) continue;
    if (covers.some((c) => Math.abs(c.x - x) < (c.w + w) / 2 + 18 && Math.abs(c.y - y) < 28)) continue;
    covers.push({ id: covers.length, kind, x, y, w, h, fragile: FRAGILE.has(kind) });
  }
  // une caisse toutes les ~8 s dans chaque manche (~7 s à 5 joueurs, ~6 s à 6)
  const crates = [];
  const gap = Math.min(1, 5 / (n + 1));
  for (let h = 0; h < 2; h++) {
    const end = fortHalfStart(h) + FORT.half - 4000;
    for (let at = fortHalfStart(h) + 5000 + R() * 2000; at < end; at += (7000 + R() * 2500) * gap) {
      let x = 0, y = 0;
      for (let k = 0; k < 30; k++) {
        x = Math.round(30 + R() * (W - 60));
        y = Math.round(FORT.top + 12 + R() * (FORT.bottom - FORT.top - 24));
        if (inRiver(y, 4)) continue;
        if (!covers.some((c) => Math.abs(c.x - x) < c.w / 2 + 10 && y > c.y - c.h - 6 && y < c.y + 8)) break;
      }
      crates.push({ id: crates.length, half: h, x, y, at: Math.round(at), t1: Math.round(Math.min(at + FORT.crateLife, end + 4000)), kind: pick(R, FORT_BONUS) });
    }
  }
  return { map, covers, river, crates };
}

// L'abri qui protège un assaillant des tirs du fort : juste devant lui, entre lui et la palissade.
export function coverFor(covers, x, y) {
  return covers.find((c) => c.y < y && y - c.y <= 14 && Math.abs(x - c.x) <= c.w / 2 - 1) || null;
}
// On ne traverse pas les abris.
export const blocked = (covers, x, y) => covers.some((c) => Math.abs(x - c.x) < c.w / 2 + 2 && y > c.y - 7 && y < c.y + 3);
// La rivière ralentit, sauf sur les ponts.
export function groundSpeed(world, x, y) {
  const r = world.river;
  if (!r || y < r.y0 || y > r.y1 + 4) return 1;
  return r.bridges.some((b) => Math.abs(x - b) < r.bw / 2 - 3) ? 1 : FORT.wade;
}

// Une dynamite tombée au pied de la porte l'abîme.
export const onGate = (x, y) => Math.abs(x - FORT.gateX) <= FORT.gateW / 2 + 8 && y <= FORT.wallY + 12;
// Porte enfoncée : on peut s'y engouffrer.
export const inGateway = (x, y) => Math.abs(x - FORT.gateX) <= FORT.gateW / 2 - 4 && y <= FORT.wallY + 6;

// Point de chute d'une dynamite, ramené à portée du lanceur
export function dynTarget(attack, from, x, y) {
  const o = attack ? from : { x: from.x, y: FORT.wallY + 6 };
  const range = attack ? FORT.dynRange : FORT.defDynRange;
  let dx = x - o.x, dy = y - o.y;
  const d = Math.hypot(dx, dy) || 1;
  if (d > range) { dx *= range / d; dy *= range / d; }
  return {
    x: Math.round(clamp(o.x + dx, 4, W - 4)),
    y: Math.round(clamp(o.y + dy, attack ? FORT.wallY - 2 : FORT.top - 6, FORT.bottom + 4)),
  };
}
export const dynFly = (from, to) => Math.round(450 + Math.hypot(to.x - from.x, to.y - from.y) * 3);
export const blastOf = (big) => FORT.blast * (big ? FORT.big : 1);
export const inBlast = (bx, by, r, x, y) => ((x - bx) / r) ** 2 + ((y - by) / (r * 0.6)) ** 2 <= 1;
export const crateLive = (c, t) => t >= c.at && t <= c.t1;

// ================================================================ arbitre (navigateur de l'hôte)

export class FortGame {
  constructor(players, mapId = null) {
    this.kind = 'fort';
    this.seed = Math.floor(Math.random() * 2 ** 31);
    this.mapId = mapId;
    this.duration = MODES.fort.duration;
    const n = players.length;
    this.world = fortWorld(this.seed, mapId, n);
    // équipes tirées au hasard à chaque partie : la place à la table ne décide plus du camp (fortTeam : index pair
    // ou impair). net.js retrouve chaque joueur par sa clé, l'ordre de la partie peut différer de celui de la table.
    players = [...players];
    for (let k = n - 1; k > 0; k--) { const j = Math.floor(Math.random() * (k + 1)); [players[k], players[j]] = [players[j], players[k]]; }
    this.p = players.map((pl, i) => {
      const maxHp = fortMaxHp(i, n);
      return {
        key: pl.key, name: pl.name, character: pl.character, bot: !!pl.bot,
        score: 0, left: false, stats: { hits: 0, hurt: 0 },
        maxHp, hp: maxHp, deadUntil: 0, safeUntil: 0, spawnK: 0, pos: { ...fortSpawn(i, n, fortAttacking(i, 0)), c: 0 },
        lastShot: -1e9, lastThrow: -1e9, nextDyn: 0, lastEnter: -1e9,
        power: null, powerUntil: 0, keg: 0, dynFast: 0,
        ai: pl.bot ? { next: rnd(900, 1800), wp: null, wait: 0, off: rnd(-30, 30), duckUntil: 0 } : null,
      };
    });
    this.gate = FORT.gateHp;
    this.gateDownUntil = 0;
    this.wrecked = new Set(); // abris pulvérisés pendant la manche
    this.taken = new Set(); // caisses ramassées
    this.dyns = [];
    this.dynId = 0;
    this.curHalf = -1;
    this.phase = 'playing';
    this.winner = null;
    this.ranking = null;
    this.events = [];
    this.liveOut = []; // positions et tirs des bots à diffuser
    this.startAt = 0;
  }

  get t() { return Date.now() - this.startAt; }
  get n() { return this.p.length; }

  // Choix de la carte avant le départ (tests, ou lobby plus tard)
  forceMap(id) {
    if (!FORT_MAPS[id]) return;
    this.mapId = id;
    this.world = fortWorld(this.seed, id, this.n);
  }

  start() {
    this.world = fortWorld(this.seed, this.mapId, this.n);
    this.startAt = Date.now() + COUNTDOWN;
    this.push({ type: 'mgStart', kind: this.kind, seed: this.seed, map: this.world.map, countdown: COUNTDOWN, duration: this.duration });
    return this.flush();
  }

  flush() {
    const e = this.events;
    this.events = [];
    return e;
  }

  view(i) {
    const t = this.t;
    return {
      kind: this.kind, me: i, phase: this.phase, winner: this.winner, ranking: this.ranking, map: this.world.map,
      gate: this.gate, gateDown: this.gateDownUntil, wrecked: [...this.wrecked], taken: [...this.taken],
      players: this.p.map((p) => ({
        key: p.key, name: p.name, character: p.character, score: p.score, left: p.left, bot: p.bot,
        hp: p.hp, maxHp: p.maxHp, dead: p.deadUntil, safe: p.safeUntil,
        power: p.powerUntil > t ? p.power : null, powerUntil: p.powerUntil, keg: p.keg, dynFast: p.dynFast,
      })),
    };
  }

  // État complet pour un joueur qui se reconnecte en cours de partie.
  syncView(i) {
    return { ...this.view(i), seed: this.seed, duration: this.duration, elapsed: this.t };
  }

  push(ev) {
    ev.dur = 0;
    ev.states = this.p.map((_, i) => this.view(i));
    this.events.push(ev);
  }

  covers() { return this.world.covers.filter((c) => !this.wrecked.has(c.id)); }

  // Positions envoyées par les joueurs (net.js) : servent aux explosions et à la visée des bots.
  onLive(key, d) {
    const p = this.p.find((x) => x.key === key);
    if (!p || p.bot || !d) return;
    if (Number.isFinite(d.x)) p.pos.x = d.x;
    if (Number.isFinite(d.y)) p.pos.y = d.y;
    if (d.c != null) p.pos.c = d.c ? 1 : 0;
  }

  act(i, a) {
    if (this.phase !== 'playing') return { error: 'La partie est terminée.' };
    if (!a || typeof a !== 'object') return { error: 'Action invalide.' };
    const t = this.t;
    if (t < -300 || t > this.duration + 600 || this.p[i].left) return { events: [] };
    const h = fortHalf(t);
    const ok = h >= 0;
    if (a.kind === 'shot' && Number.isInteger(a.v) && this.p[a.v]) { if (ok) this.shot(i, a.v, !!a.head, t, h); }
    else if (a.kind === 'dyn' && Number.isFinite(a.x) && Number.isFinite(a.y)) { if (ok) this.throwDyn(i, a.x, a.y, t, h); }
    else if (a.kind === 'grab' && Number.isInteger(a.id)) { if (ok) this.grab(i, a.id, t, h); }
    else if (a.kind === 'enter') { if (ok) this.enter(i, t, h); }
    else return { error: 'Action inconnue.' };
    return { events: this.flush() };
  }

  alive(i, t) {
    const p = this.p[i];
    if (p.left) return false;
    if (p.deadUntil && t >= p.deadUntil) {
      p.safeUntil = p.deadUntil + FORT.safe;
      p.deadUntil = 0;
      p.hp = p.maxHp;
      p.pos = { ...fortSpawn(i, this.n, fortAttacking(i, fortHalf(t)), ++p.spawnK), c: 0 };
    }
    return !p.deadUntil;
  }

  powered(p, kind, t) { return p.power === kind && t < p.powerUntil; }

  shot(i, v, head, t, h) {
    const p = this.p[i];
    if (fortTeam(i) === fortTeam(v) || !this.alive(i, t) || !this.alive(v, t)) return;
    const rof = this.powered(p, 'rifle', t) ? FORT.rifleRof : FORT.rof;
    if (t - p.lastShot < rof - 80) return;
    p.lastShot = t;
    this.hurt(v, head ? 2 : 1, i, t, h, false, head);
  }

  hurt(v, dmg, by, t, h, dyn = false, head = false) {
    const p = this.p[v];
    if (t < p.safeUntil || this.powered(p, 'star', t)) {
      this.push({ type: 'shot', by, v, hp: p.hp, blocked: true, dyn });
      return;
    }
    p.hp = Math.max(0, p.hp - dmg);
    const kill = p.hp === 0;
    let pts = 0;
    if (kill) {
      p.deadUntil = t + (fortGateMul(v, this.n) > 1 ? FORT.loneRespawn : FORT.respawn);
      p.power = null;
      p.stats.hurt++;
      pts = fortAttacking(by, h) ? FORT_PTS.kill : FORT_PTS.defKill;
      this.p[by].score += pts;
      this.p[by].stats.hits++;
    }
    if (p.ai) p.ai.duckUntil = t + rnd(700, 1500);
    this.push({ type: 'shot', by, v, hp: p.hp, kill, until: p.deadUntil, pts, dyn, head });
  }

  throwDyn(i, x, y, t, h) {
    const p = this.p[i];
    if (!this.alive(i, t) || t < p.nextDyn - 250) return;
    const attack = fortAttacking(i, h);
    const from = attack ? p.pos : { x: p.pos.x, y: FORT.wallY + 6 };
    const to = dynTarget(attack, from, x, y);
    const big = p.keg > 0;
    p.keg = 0;
    p.nextDyn = t + (p.dynFast > 0 ? FORT.dynFastCd : FORT.dynCd);
    if (p.dynFast > 0) p.dynFast--;
    p.lastThrow = t;
    const d = { id: this.dynId++, by: i, x: to.x, y: to.y, at: t + dynFly(from, to), half: h, big };
    this.dyns.push(d);
    this.push({ type: 'dyn', id: d.id, by: i, x: d.x, y: d.y, fly: d.at - t, big });
  }

  explode(d, t) {
    const h = d.half;
    const attack = fortAttacking(d.by, h);
    const r = blastOf(d.big);
    let dmg = 0, breach = false, pts = 0;
    if (attack && !this.gateDownUntil && onGate(d.x, d.y)) {
      const hit = d.big ? 3 : 1;
      dmg = Math.min(this.gate, hit * fortGateMul(d.by, this.n));
      this.gate -= dmg;
      pts = FORT_PTS.gate * Math.min(dmg, hit); // les points suivent le bâton, pas le bonus de l'assaillant seul
      this.p[d.by].score += pts;
      if (this.gate <= 0) {
        breach = true;
        this.gateDownUntil = t + FORT.rebuild;
        this.p.forEach((p, j) => { if (!p.left && fortAttacking(j, h)) p.score += FORT_PTS.breach; });
      }
    }
    const wrecked = [];
    for (const c of this.covers()) {
      if (c.fragile && ((c.x - d.x) / (r + c.w / 2)) ** 2 + ((c.y - c.h / 2 - d.y) / (r * 0.6 + c.h / 2)) ** 2 <= 1) {
        this.wrecked.add(c.id);
        wrecked.push(c.id);
      }
    }
    this.push({ type: 'boom', id: d.id, by: d.by, x: d.x, y: d.y, big: d.big, dmg, breach, pts, wrecked });
    for (let j = 0; j < this.n; j++) {
      if (fortTeam(j) === fortTeam(d.by) || !this.alive(j, t)) continue;
      const pos = this.p[j].pos;
      const py = fortAttacking(j, h) ? pos.y : FORT.walkY;
      if (inBlast(d.x, d.y, r, pos.x, py)) this.hurt(j, d.big ? 3 : FORT.dynDmg, d.by, t, h, true);
    }
  }

  grab(i, id, t, h) {
    const c = this.world.crates[id];
    const p = this.p[i];
    if (!c || c.half !== h || this.taken.has(id) || t < c.at - 300 || t > c.t1 + 500 || !this.alive(i, t)) return;
    if (fortAttacking(i, h) && Math.hypot(p.pos.x - c.x, p.pos.y - c.y) > 30) return;
    this.taken.add(id);
    p.score += FORT_PTS.bonus;
    const b = FORT_BONUS[c.kind];
    if (c.kind === 'keg') p.keg = 1;
    else if (c.kind === 'whisky') p.hp = p.maxHp;
    else if (c.kind === 'dynpack') { p.nextDyn = t; p.dynFast = 3; }
    else { p.power = c.kind; p.powerUntil = t + b.ms; }
    this.push({ type: 'bonus', id, by: i, kind: c.kind, until: b.ms ? t + b.ms : 0, pts: FORT_PTS.bonus });
  }

  enter(i, t, h) {
    const p = this.p[i];
    if (!fortAttacking(i, h) || !this.gateDownUntil || !this.alive(i, t) || t - p.lastEnter < 1500) return;
    if (Math.abs(p.pos.x - FORT.gateX) > FORT.gateW / 2 + 6 || p.pos.y > FORT.wallY + 16) return;
    p.lastEnter = t;
    p.score += FORT_PTS.enter;
    p.safeUntil = t + FORT.safe;
    p.pos = { ...fortSpawn(i, this.n, true, ++p.spawnK), c: 0 };
    this.push({ type: 'enter', who: i, pts: FORT_PTS.enter });
  }

  // ------------------------------------------------------------ horloge de l'hôte
  tick() {
    if (this.phase !== 'playing') return [];
    const t = this.t;
    if (t >= 0) {
      const tt = Math.min(t, this.duration);
      const h = fortHalf(tt);
      if (h !== this.curHalf) this.switchHalf(h, tt);
      if (h >= 0) {
        for (const d of this.dyns.filter((x) => x.at <= tt)) this.explode(d, tt);
        this.dyns = this.dyns.filter((x) => x.at > tt);
        if (this.gateDownUntil && tt >= this.gateDownUntil) {
          this.gateDownUntil = 0;
          this.gate = FORT.gateHp;
          this.push({ type: 'rebuilt' });
        }
        this.p.forEach((p, i) => { if (p.ai && !p.left) this.botThink(i, tt, h); });
      }
    }
    if (this.phase === 'playing' && t >= this.duration + 400) this.finish();
    return this.flush();
  }

  switchHalf(h, t) {
    const prev = this.curHalf;
    this.curHalf = h;
    if (prev >= 0) {
      // fin de manche : les défenseurs marquent pour chaque planche encore debout
      const pts = this.gateDownUntil ? 0 : this.gate * FORT_PTS.hold;
      this.p.forEach((p, i) => { if (!p.left && !fortAttacking(i, prev)) p.score += pts; });
      this.dyns = [];
      this.push({ type: 'halfEnd', half: prev, gate: this.gate, pts });
    }
    if (h >= 0) {
      this.gate = FORT.gateHp;
      this.gateDownUntil = 0;
      this.wrecked.clear(); // les deux équipes attaquent le même terrain
      this.p.forEach((p, i) => {
        Object.assign(p, {
          hp: p.maxHp, deadUntil: 0, safeUntil: 0, spawnK: 0, nextDyn: t + 1500, lastEnter: -1e9,
          power: null, powerUntil: 0, keg: 0, dynFast: 0,
          pos: { ...fortSpawn(i, this.n, fortAttacking(i, h)), c: 0 },
        });
        if (p.ai) Object.assign(p.ai, { next: t + rnd(900, 1800), wp: null, wait: 0, duckUntil: 0 });
      });
      this.push({ type: 'halfStart', half: h });
    }
  }

  // Équipe gagnante : meilleure moyenne par joueur (pour rester juste à 2 contre 1).
  finish() {
    this.phase = 'over';
    const avg = [0, 1].map((team) => {
      const m = this.p.filter((_, i) => fortTeam(i) === team);
      return m.length ? Math.round(m.reduce((s, p) => s + p.score, 0) / m.length) : 0;
    });
    const present = [0, 1].map((team) => this.p.some((p, i) => fortTeam(i) === team && !p.left));
    let win = avg[0] > avg[1] ? 0 : avg[1] > avg[0] ? 1 : -1;
    if (present[0] !== present[1]) win = present[0] ? 0 : 1; // toute une équipe est partie
    const order = this.p.map((_, i) => i).sort((a, b) => (this.p[a].left - this.p[b].left)
      || ((fortTeam(b) === win) - (fortTeam(a) === win)) || (this.p[b].score - this.p[a].score));
    this.ranking = order;
    this.winner = order[0];
    const winners = win < 0 ? [] : order.filter((i) => fortTeam(i) === win && !this.p[i].left);
    this.push({ type: 'matchEnd', winner: this.winner, ranking: order, tie: win < 0, winners, teams: avg });
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
  enemies(i, t) {
    const out = [];
    for (let j = 0; j < this.n; j++) if (fortTeam(j) !== fortTeam(i) && this.alive(j, t)) out.push(j);
    return out;
  }

  liveCrates(t, h) {
    return this.world.crates.filter((c) => c.half === h && !this.taken.has(c.id) && crateLive(c, t));
  }

  botThink(i, t, h) {
    const p = this.p[i];
    if (!this.alive(i, t)) return;
    if (fortAttacking(i, h)) this.attackerBot(i, p, t, h);
    else this.defenderBot(i, p, t, h);
    const pos = p.pos;
    this.liveOut.push({ key: p.key, d: { x: Math.round(pos.x), y: Math.round(pos.y), c: pos.c, ...(p.ai.out || {}) } });
    p.ai.out = null;
  }

  botShoot(i, p, v, x, y, chance, t, h) {
    p.lastShot = t;
    const ok = Math.random() < chance;
    const head = ok && Math.random() < 0.15;
    p.ai.out = { sh: [Math.round(x + (ok ? rnd(-2, 2) : rnd(-14, 14))), Math.round(y + (ok ? rnd(-3, 3) : rnd(-6, 10)))] };
    if (ok) this.hurt(v, head ? 2 : 1, i, t, h, false, head);
  }

  attackerBot(i, p, t, h) {
    const b = p.ai, pos = p.pos;
    const covers = this.covers();
    const gate = { x: FORT.gateX, y: FORT.wallY + 4 };
    const inRange = Math.hypot(gate.x - pos.x, gate.y - pos.y) <= FORT.dynRange - 4;
    // porte enfoncée : on fonce dans le fort
    if (this.gateDownUntil) {
      if (!b.rush) b.wp = { x: gate.x + rnd(-8, 8), y: FORT.wallY + 2, rush: true };
      b.rush = true;
    } else if (b.rush) { b.rush = false; b.wp = null; }
    // une caisse pas trop loin : on va la chercher
    const crate = this.liveCrates(t, h).find((c) => Math.hypot(c.x - pos.x, c.y - pos.y) < 90);
    if (crate && !b.rush && (!b.wp || !b.wp.crate)) b.wp = { x: crate.x, y: crate.y, crate: crate.id };
    if (b.wp?.crate != null && this.taken.has(b.wp.crate)) b.wp = null;
    // sinon le prochain abri, de plus en plus près du fort, puis un poste de tir à portée de la porte
    if (!b.wp && t >= b.wait) {
      const ahead = covers.filter((c) => c.y < pos.y - 10 && c.y > FORT.top);
      const near = ahead.map((c) => ({ c, s: Math.abs(c.x - FORT.gateX) * 0.6 + (pos.y - c.y) * 0.4 + rnd(0, 40) })).sort((a, c) => a.s - c.s);
      if (near.length && !inRange && Math.random() < 0.75) {
        const c = near[0].c;
        b.wp = { x: c.x + rnd(-c.w / 4, c.w / 4), y: c.y + 9 };
      } else {
        const dx = rnd(-30, 30);
        b.wp = { x: gate.x + dx, y: gate.y + Math.sqrt((FORT.dynRange - 10) ** 2 - dx * dx) };
      }
    }
    if (b.wp) {
      const dx = b.wp.x - pos.x, dy = b.wp.y - pos.y, d = Math.hypot(dx, dy);
      const step = FORT.speed * 100 * groundSpeed(this.world, pos.x, pos.y) * (this.powered(p, 'spurs', t) ? 1.6 : 1);
      const minY = this.gateDownUntil && Math.abs(pos.x - FORT.gateX) < FORT.gateW / 2 ? FORT.wallY : FORT.top;
      if (d <= step) {
        Object.assign(pos, { x: clamp(b.wp.x, FORT.minX, FORT.maxX), y: clamp(b.wp.y, minY, FORT.bottom) });
        if (b.wp.crate != null) this.grab(i, b.wp.crate, t, h);
        if (b.wp.rush) this.enter(i, t, h);
        b.wp = null;
        b.rush = false;
        b.wait = t + rnd(1200, 2600);
      } else {
        const nx = pos.x + (dx / d) * step, ny = pos.y + (dy / d) * step;
        if (!blocked(covers, nx, ny)) Object.assign(pos, { x: nx, y: ny });
        else if (!blocked(covers, nx, pos.y)) pos.x = nx;
        else b.wp = { x: clamp(pos.x + (pos.x < FORT.gateX ? -30 : 30), FORT.minX, FORT.maxX), y: pos.y };
        pos.x = clamp(pos.x, FORT.minX, FORT.maxX);
        pos.y = clamp(pos.y, minY, FORT.bottom);
      }
    }
    // dynamite dès que la porte est à portée
    if (t >= p.nextDyn && Math.hypot(gate.x - pos.x, gate.y - pos.y) <= FORT.dynRange && !this.gateDownUntil) {
      this.throwDyn(i, gate.x + rnd(-12, 12), gate.y + rnd(-4, 6), t, h);
    } else if (t >= b.next) {
      const foes = this.enemies(i, t).filter((j) => !this.p[j].pos.c);
      const rifle = this.powered(p, 'rifle', t);
      b.next = t + (rifle ? rnd(250, 450) : rnd(1000, 1800));
      if (foes.length) {
        const v = foes[Math.floor(Math.random() * foes.length)];
        const close = clamp((190 - pos.y) / 80, 0, 1);
        const vx = this.p[v].pos.x;
        this.botShoot(i, p, v, vx, defFeet(vx) - 22, 0.22 + 0.2 * close, t, h);
      }
    }
    pos.c = coverFor(covers, pos.x, pos.y) && t - p.lastShot > FORT.expose && t - p.lastThrow > FORT.expose ? 1 : 0;
  }

  defenderBot(i, p, t, h) {
    const b = p.ai, pos = p.pos;
    const foes = this.enemies(i, t);
    // chacun garde son secteur du chemin de ronde, en penchant vers l'assaillant le plus avancé
    const mates = this.p.map((_, j) => j).filter((j) => !fortAttacking(j, h) && !this.p[j].left);
    const m = Math.max(0, mates.indexOf(i)), s = Math.max(1, mates.length);
    const span = FORT.defMax - FORT.defMin;
    const home = FORT.defMin + ((m + 0.5) * span) / s;
    const lead = foes.map((j) => this.p[j].pos).filter((q) => Math.abs(q.x - home) < span / s).sort((a, c) => a.y - c.y)[0];
    if (Math.random() < 0.01) b.off = rnd(-30, 30);
    const tx = clamp((lead ? (lead.x + home) / 2 : home) + b.off, FORT.defMin, FORT.defMax);
    const step = FORT.defSpeed * 100 * (this.powered(p, 'spurs', t) ? 1.6 : 1);
    pos.x += clamp(tx - pos.x, -step, step);
    pos.y = FORT.walkY;
    pos.c = t < b.duckUntil ? 1 : 0;
    if (pos.c) return;
    const exposed = foes.filter((j) => !this.p[j].pos.c);
    // dynamite sur un groupe ou sur un assaillant planqué derrière son abri
    const near = foes.filter((j) => Math.hypot(this.p[j].pos.x - pos.x, this.p[j].pos.y - FORT.wallY - 6) <= FORT.defDynRange);
    if (t >= p.nextDyn && near.length && (near.length > 1 || this.p[near[0]].pos.c || Math.random() < 0.3)) {
      const v = this.p[near[Math.floor(Math.random() * near.length)]].pos;
      this.throwDyn(i, v.x + rnd(-10, 10), v.y + rnd(-6, 6), t, h);
    } else if (t >= b.next) {
      const rifle = this.powered(p, 'rifle', t);
      b.next = t + (rifle ? rnd(250, 450) : rnd(850, 1600));
      const crate = this.liveCrates(t, h)[0];
      if (crate && (!exposed.length || Math.random() < 0.3)) {
        p.lastShot = t;
        p.ai.out = { sh: [crate.x, crate.y - 6] };
        if (Math.random() < 0.6) this.grab(i, crate.id, t, h);
      } else if (exposed.length) {
        const v = exposed.sort((a, c) => this.p[a].pos.y - this.p[c].pos.y)[Math.random() < 0.7 ? 0 : exposed.length - 1];
        const q = this.p[v].pos;
        const close = clamp((200 - q.y) / 90, 0, 1);
        this.botShoot(i, p, v, q.x, q.y - 13, 0.2 + 0.32 * close, t, h);
      }
    }
  }
}
