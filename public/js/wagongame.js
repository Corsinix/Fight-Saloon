// Mini-jeu « Défends la roulotte » : la roulotte fait route de Dusty Gulch à Red Rock, et une bande de
// hors-la-loi l'attaque en chemin. Ce fichier contient les règles partagées (le monde vient d'une graine,
// chaque navigateur le recalcule) et l'arbitre qui tourne chez l'hôte, avec la même interface que MiniGame (mini.js).
// Tout est compté par rapport à la roulotte, qui reste au même endroit de l'écran pendant que le décor défile.
import { MODES, COUNTDOWN, W, rng } from './worlds.js';

const rnd = (a, b) => a + Math.random() * (b - a);

export const WAGON = {
  x: 160, base: 176, // la roulotte : centre à l'écran, sol
  half: 56, front: 104, // où s'arrêtent les pillards : contre la caisse à l'arrière, contre l'attelage à l'avant
  scroll: 0.03, // vitesse du voyage (px/ms) : le décor défile d'autant
  from: 'DUSTY GULCH', to: 'RED ROCK',
  hp: 34, ammo: 6, reload: 900,
  top: 140, bottom: 206, // pieds des assaillants
  atkEvery: 3000, // un pillard accroché au convoi frappe toutes les 3 s
  throwEvery: 3400, fly: 1100, // dynamite : un bâton toutes les 3,4 s, 1,1 s de vol
  dynDmg: 2, dynPts: 50,
  survive: 300, // tous les défenseurs, si la roulotte arrive à bon port
};

// pts : pour le coup fatal ; hit : pour chaque balle qui ne tue pas.
// v : vitesse par rapport à la roulotte. Les piétons tendent des embuscades devant le convoi (run + défilement),
// les cavaliers et les dynamiteurs (à cheval) arrivent des deux côtés.
export const BANDITS = {
  walker: { name: 'Bandit', hp: 1, pts: 100, run: [0.012, 0.018], dmg: 1, box: [-6, -36, 14, 36], ahead: true },
  rider: { name: 'Cavalier', hp: 1, pts: 150, v: [0.05, 0.065], dmg: 1, box: [-18, -48, 40, 46] },
  brute: { name: 'Gros bras', hp: 3, pts: 250, hit: 25, run: [0.004, 0.008], dmg: 1, box: [-8, -40, 18, 40], ahead: true },
  dyn: { name: 'Dynamiteur', hp: 1, pts: 150, v: [0.04, 0.05], dmg: 0, box: [-18, -48, 40, 46], range: [96, 140] },
  boss: { name: 'Black Bart', hp: 8, pts: 800, hit: 50, run: [0.005, 0.005], dmg: 2, box: [-9, -44, 20, 44], ahead: true },
};
export const BANDIT_LOOKS = 6;

// Les assaillants de la partie : même graine, mêmes bandits aux mêmes endroits, partout.
// Plus il y a de défenseurs, plus la bande est nombreuse (n = nombre de joueurs).
export function wagonWorld(seed, n = 4) {
  const density = (n + 1) / 5;
  const R = rng((seed ^ 0x2c1b3c6d) >>> 0);
  const between = (a, b) => a + R() * (b - a);
  const dur = MODES.wagon.duration;
  const targets = [];
  const add = (kind, t0) => {
    const k = BANDITS[kind];
    // -1 : arrive par la gauche (il rattrape le convoi), +1 : par la droite (devant la roulotte)
    const side = k.ahead || R() < 0.5 ? 1 : -1;
    const y = Math.round(between(WAGON.top, WAGON.bottom));
    const v = k.run ? WAGON.scroll + between(k.run[0], k.run[1]) : between(k.v[0], k.v[1]);
    const x0 = side < 0 ? -24 : W + 24;
    const stop = kind === 'dyn' ? between(k.range[0], k.range[1])
      : (side > 0 ? WAGON.front : WAGON.half) + (kind === 'rider' ? 18 : 0) + R() * 6;
    const stopX = Math.round(WAGON.x + side * stop);
    targets.push({
      id: targets.length, kind, side, y, t0: Math.round(t0), v, x0, stopX,
      reach: Math.round(t0 + Math.abs(stopX - x0) / v), hp: k.hp, look: Math.floor(R() * BANDIT_LOOKS),
    });
  };
  for (let t = 1800; t < dur - 6000;) {
    const p = t / dur;
    const r = R();
    let kind = 'walker';
    if (p > 0.15 && r < 0.12) kind = 'dyn';
    else if (p > 0.22 && r < 0.32) kind = 'brute';
    else if (r < 0.62) kind = 'rider';
    add(kind, t);
    if (p > 0.45 && R() < 0.3) add(R() < 0.5 ? 'walker' : 'rider', t + 250); // ils arrivent parfois à deux
    t += (between(2000, 2900) * (1 - 0.45 * p)) / density;
  }
  add('boss', 68000);
  targets[targets.length - 1].hp = Math.round(4 + 1.5 * n);
  targets.sort((a, b) => a.t0 - b.t0).forEach((b, i) => { b.id = i; });
  return { targets };
}

// Position d'un assaillant (il s'arrête contre la roulotte, ou à portée de lancer pour le dynamiteur)
export function banditX(b, t) {
  const d = Math.min(Math.max(0, t - b.t0), b.reach - b.t0);
  return b.x0 - b.side * b.v * d;
}
export const banditOn = (b, t) => t >= b.t0;

// Rectangle touchable (x, y, w, h), retourné quand il arrive par la droite
export function banditBox(b, t) {
  const [x0, y0, w, h] = BANDITS[b.kind].box;
  const x = banditX(b, t);
  return b.side < 0 ? { x: x + x0, y: b.y + y0, w, h } : { x: x - x0 - w, y: b.y + y0, w, h };
}

// Lancers de dynamite d'un dynamiteur mort à deadAt (Infinity s'il est vivant)
export function dynThrows(b, deadAt = Infinity, until = MODES.wagon.duration) {
  if (b.kind !== 'dyn') return [];
  const out = [];
  for (let k = 0, at = b.reach + 500; at < Math.min(deadAt, until); k++, at += WAGON.throwEvery) out.push({ k, at });
  return out;
}

// Bâton de dynamite en vol : parabole de la main du lanceur jusqu'à la bâche
export function dynPos(b, k, at, t) {
  const u = Math.max(0, Math.min(1, (t - at) / WAGON.fly));
  const fx = b.stopX + b.side * -4, fy = b.y - 46; // la main du cavalier
  const tx = WAGON.x + b.side * (12 + ((b.id * 7 + k * 13) % 24)), ty = WAGON.base - 34;
  return { x: fx + (tx - fx) * u, y: fy + (ty - fy) * u - Math.sin(u * Math.PI) * 46, u };
}

// ------------------------------------------------------------ arbitre (navigateur de l'hôte)
export class WagonGame {
  constructor(players) {
    this.kind = 'wagon';
    this.seed = Math.floor(Math.random() * 2 ** 31);
    this.duration = MODES.wagon.duration;
    this.p = players.map((pl) => ({
      key: pl.key, name: pl.name, character: pl.character, bot: !!pl.bot,
      score: 0, left: false, stats: { throws: 0, catches: 0, hits: 0, hurt: 0 },
      ai: pl.bot ? { next: rnd(800, 1600), aim: null } : null,
    }));
    this.world = wagonWorld(this.seed, players.length);
    this.hp = new Map(); // PV restants des assaillants touchés
    this.dead = new Map(); // id -> { by, at }
    this.nextAtk = new Map(); // id -> prochain coup porté à la roulotte
    this.dyn = new Map(); // `${id}:${k}` -> 'shot' | 'boom'
    this.wagonHp = WAGON.hp;
    this.result = null; // 'saved' | 'lost'
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
      kind: this.kind, me: i, phase: this.phase, winner: this.winner, ranking: this.ranking, wagonHp: this.wagonHp,
      players: this.p.map((p) => ({ key: p.key, name: p.name, character: p.character, score: p.score, left: p.left, bot: p.bot })),
    };
  }

  // État complet pour un joueur qui se reconnecte en cours de partie.
  syncView(i) {
    return {
      ...this.view(i), seed: this.seed, duration: this.duration, elapsed: this.t, result: this.result,
      dead: [...this.dead], hp: [...this.hp], dyn: [...this.dyn],
    };
  }

  push(ev) {
    ev.dur = 0;
    ev.states = this.p.map((_, i) => this.view(i));
    this.events.push(ev);
  }

  act(i, a) {
    if (this.phase !== 'playing') return { error: 'La partie est terminée.' };
    if (!a || typeof a !== 'object' || a.kind !== 'hit' || !Number.isInteger(a.id)) return { error: 'Action invalide.' };
    const t = this.t;
    if (t < -300 || t > this.duration + 600 || this.p[i].left) return { events: [] };
    if (Number.isInteger(a.k)) this.hitDyn(i, a.id, a.k, t);
    else this.hit(i, a.id, t);
    return { events: this.flush() };
  }

  hit(i, id, t) {
    const b = this.world.targets[id];
    if (!b || this.dead.has(id) || t < b.t0 - 200) return;
    const k = BANDITS[b.kind];
    const hp = (this.hp.get(id) ?? b.hp) - 1;
    this.hp.set(id, hp);
    const kill = hp <= 0;
    const pts = kill ? k.pts : k.hit || 0;
    if (kill) this.dead.set(id, { by: i, at: t });
    this.p[i].score += pts;
    this.p[i].stats.hits++;
    this.push({ type: 'hit', id, by: i, pts, hp, kill, at: t });
  }

  hitDyn(i, id, k, t) {
    const b = this.world.targets[id];
    const key = `${id}:${k}`;
    if (!b || this.dyn.has(key)) return;
    const th = dynThrows(b, this.dead.get(id)?.at).find((x) => x.k === k);
    if (!th || t < th.at - 150 || t > th.at + WAGON.fly + 250) return;
    this.dyn.set(key, 'shot');
    this.p[i].score += WAGON.dynPts;
    this.p[i].stats.catches++;
    this.push({ type: 'dynHit', id, k, by: i, pts: WAGON.dynPts });
  }

  damage(dmg, ev) {
    this.wagonHp = Math.max(0, this.wagonHp - dmg);
    this.push({ ...ev, dmg, wagonHp: this.wagonHp });
  }

  tick() {
    if (this.phase !== 'playing') return [];
    const t = this.t;
    if (t >= 0 && t < this.duration) {
      for (const b of this.world.targets) {
        if (b.t0 > t) break;
        if (this.dead.has(b.id)) continue;
        if (b.kind === 'dyn') {
          for (const th of dynThrows(b, Infinity, t)) {
            const key = `${b.id}:${th.k}`;
            if (this.dyn.has(key) || t < th.at + WAGON.fly) continue;
            this.dyn.set(key, 'boom');
            this.damage(WAGON.dynDmg, { type: 'boom', id: b.id, k: th.k });
          }
        } else if (t >= b.reach) {
          let next = this.nextAtk.get(b.id) ?? b.reach;
          while (next <= t) {
            this.damage(BANDITS[b.kind].dmg, { type: 'atk', id: b.id });
            next += WAGON.atkEvery;
          }
          this.nextAtk.set(b.id, next);
        }
      }
      // les bâtons déjà en l'air quand leur lanceur tombe explosent quand même
      for (const [id, d] of this.dead) {
        const b = this.world.targets[id];
        for (const th of dynThrows(b, d.at, t)) {
          const key = `${id}:${th.k}`;
          if (this.dyn.has(key) || t < th.at + WAGON.fly) continue;
          this.dyn.set(key, 'boom');
          this.damage(WAGON.dynDmg, { type: 'boom', id, k: th.k });
        }
      }
      this.p.forEach((p, i) => { if (p.ai && !p.left) this.botThink(i, t); });
      if (this.wagonHp <= 0) this.finish('lost');
    }
    if (this.phase === 'playing' && t >= this.duration + 400) this.finish('saved');
    return this.flush();
  }

  finish(result) {
    this.phase = 'over';
    this.result = result;
    if (result === 'saved') for (const p of this.p) if (!p.left) p.score += WAGON.survive;
    const order = this.p.map((_, i) => i).sort((a, b) => (this.p[a].left - this.p[b].left) || (this.p[b].score - this.p[a].score));
    this.ranking = order;
    this.winner = order[0];
    const tie = order.length > 1 && this.p[order[1]].score === this.p[order[0]].score && !this.p[order[1]].left;
    this.push({ type: 'matchEnd', winner: this.winner, ranking: order, tie, result, bonus: result === 'saved' ? WAGON.survive : 0 });
  }

  leave(i) {
    if (this.phase !== 'playing' || !this.p[i]) return [];
    this.p[i].left = true;
    this.push({ type: 'left', who: i });
    return this.flush();
  }

  forfeit(i) {
    if (this.phase !== 'playing' || !this.p[i]) return [];
    this.p[i].left = true;
    this.finish(this.wagonHp > 0 ? 'saved' : 'lost');
    return this.flush();
  }

  // ------------------------------------------------------------ bots (mode solo)
  // Ils visent d'abord ce qui menace la roulotte : bâtons en l'air, pillards au contact, puis les plus proches.
  botThink(i, t) {
    const b = this.p[i].ai;
    if (b.aim) {
      if (t < b.aim.at) return;
      const a = b.aim;
      b.aim = null;
      b.next = t + rnd(650, 1300);
      this.liveOut.push({ key: this.p[i].key, d: { c: [a.x, a.y], s: 1 } });
      if (Math.random() < 0.62) {
        if (a.k != null) this.hitDyn(i, a.id, a.k, t);
        else this.hit(i, a.id, t);
      }
      return;
    }
    if (t < b.next) return;
    const cands = [];
    for (const tg of this.world.targets) {
      if (tg.t0 > t) break;
      if (this.dead.has(tg.id)) continue;
      for (const th of dynThrows(tg, Infinity, t)) {
        if (this.dyn.has(`${tg.id}:${th.k}`) || t > th.at + WAGON.fly - 400) continue;
        const p = dynPos(tg, th.k, th.at, t + 450);
        cands.push({ id: tg.id, k: th.k, x: p.x, y: p.y, w: 0 });
      }
      const box = banditBox(tg, t + 400);
      const cx = box.x + box.w / 2;
      if (cx < 4 || cx > W - 4) continue;
      cands.push({ id: tg.id, x: cx, y: box.y + box.h / 2, w: Math.abs(cx - WAGON.x) + (t >= tg.reach ? -200 : 0) });
    }
    if (!cands.length) { b.next = t + 300; return; }
    cands.sort((a, c) => a.w - c.w);
    const a = Math.random() < 0.7 ? cands[0] : cands[Math.floor(Math.random() * cands.length)];
    b.aim = { ...a, x: Math.round(a.x + rnd(-5, 5)), y: Math.round(a.y + rnd(-5, 5)), at: t + rnd(320, 620) };
    this.liveOut.push({ key: this.p[i].key, d: { c: [b.aim.x, b.aim.y] } });
  }
}
