// Arbitre de « La mêlée » (navigateur de l'hôte, ou banc d'essai mini-test.html), pour ses cinq modes : la variante
// de l'hôte dit le mode (« gemmes », ou « gemmes:desert-veine » avec la carte), sinon il est tiré au hasard.
// Même interface que les autres arbitres (start, act, tick, view, syncView, leave, forfeit, liveOut).
// Les joueurs simulent leurs déplacements et leurs tirs et annoncent ce qu'ils touchent ; l'hôte vérifie que c'est
// plausible, applique dégâts, soins, super-attaques et objets, et fait vivre les bots, les tourelles, les gemmes,
// les coffres à poudre, la tempête et les manches. Les dégâts d'un pas d'horloge partent en un seul événement (hits).
import { CUT_MS } from './worlds.js';
import {
  BR, BRAWL_MODES, modeOf, KITS, GADGETS, GAD, C, STORM, cleanPick, botPick, reloadOf, radOf, specOf, dmgOf, mapIdOf, brawlWorld,
  cellAt, typeAt, blocksMove, breakable, overlaps, move, clearShot, freeSpot, clampAim, dashEnd, stormRect, inStorm, stormDmg,
  seen, launch, stepShots, inBlast, meleeHits, cellsInRadius, sandCells, liveOfPos,
} from './brawlkit.js';

const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const angTo = (a, b) => Math.atan2(b.y - a.y, b.x - a.x);
const fin = (...v) => v.every(Number.isFinite);

export const brawlCountdown = () => CUT_MS + BR.pick;

export class BrawlGame {
  constructor(players, variant = null) {
    this.kind = 'melee';
    const pick = modeOf(variant);
    this.mode = pick.mode;
    this.cfg = BRAWL_MODES[this.mode];
    this.seed = Math.floor(Math.random() * 2 ** 31);
    this.mapId = mapIdOf(this.mode, this.seed, pick.map);
    this.world = brawlWorld(this.mode, this.mapId);
    this.duration = this.cfg.duration;
    this.unit = this.cfg.unit; // unité du score (écran de fin, historique)
    this.countdown = brawlCountdown();
    const n = players.length;
    // équipes tirées au hasard (en nombre impair, l'équipe la moins nombreuse a plus de PV et frappe plus fort)
    const team = players.map((_, i) => i);
    if (this.cfg.team) {
      const order = players.map((_, i) => i).sort(() => Math.random() - 0.5);
      order.forEach((i, k) => { team[i] = k < Math.ceil(n / 2) ? 0 : 1; });
    }
    const size = [0, 1].map((tm) => team.filter((x) => x === tm).length);
    this.p = players.map((pl, i) => {
      const small = this.cfg.team && size[team[i]] < size[1 - team[i]];
      const gap = small ? (size[1 - team[i]] - size[team[i]]) / Math.max(1, size[team[i]]) : 0;
      return {
        key: pl.key, name: pl.name, character: pl.character, bot: !!pl.bot, team: team[i],
        hpMul: 1 + 0.5 * gap, dmgMul: 1 + 0.25 * gap,
        kit: null, g: null, uses: [BR.uses, BR.uses], ready: false,
        alive: false, hp: 0, maxHp: 0, x: this.world.cx, y: this.world.cy, a: 0, mv: false, vx: 0, vy: 0, liveAt: 0,
        sup: 0, power: 0, score: 0, k: 0, d: 0, stars: 2, gems: 0, hillMs: 0,
        hurtAt: -1e9, atkAt: -1e9, shieldUntil: 0, smokeUntil: 0, trackUntil: 0, trackTeam: -1, scopeUntil: 0,
        stunUntil: 0, rootUntil: 0, speedUntil: 0, gadAt: -1e9, deadAt: -1e9, place: 0, left: false,
        supIds: new Set(), hits: new Map(), ammo: 3, lastAtk: -1e9, ai: null,
      };
    });
    // les bots choisissent tout de suite (sans doubler un kit de leur équipe tant que possible)
    this.p.forEach((p, i) => {
      if (!p.bot) return;
      const taken = this.p.filter((q, j) => j !== i && q.kit && (!this.cfg.team || q.team === p.team)).map((q) => q.kit);
      Object.assign(p, botPick(i, taken), { ready: true });
      p.ai = this.newBot(i);
    });
    this.items = new Map(); // gemmes et fioles au sol : id -> { id, kind, x, y }
    this.itemId = 0;
    this.turrets = [];
    this.turretId = 0;
    this.traps = [];
    this.trapId = 0;
    this.sands = [];
    this.sandId = 0;
    this.chestHp = new Map();
    this.world.cells.forEach((c, i) => { if (c === C.CHEST) this.chestHp.set(i, BR.chestHp); });
    this.shots = []; // projectiles des bots et des tourelles (simulés ici)
    this.recN = 0;
    this.hitsBuf = { l: [], h: [], tu: [] };
    this.fx = []; // attaques des bots et des tourelles, à montrer à tout le monde
    this.flows = new Map();
    this.started = false;
    this.lastTick = 0;
    this.nextSlow = 0; // récupération, tempête : toutes les 500 ms
    this.nextGem = 5000;
    this.hold = { team: -1, until: 0 };
    this.round = 1;
    this.wins = [0, 0];
    this.roundAt = 0;
    this.brkUntil = 0;
    this.phase = 'playing';
    this.winner = null;
    this.ranking = null;
    this.events = [];
    this.liveOut = [];
    this.startAt = 0;
    this.liveTick = 0;
  }

  get t() { return Date.now() - this.startAt; }
  enemy(i, j) { return this.p[i].team !== this.p[j].team; }
  teamOf(i) { return this.p[i].team; }
  alivePl() { return this.p.filter((p) => p.alive && !p.left); }

  start() {
    this.startAt = Date.now() + this.countdown;
    this.push({ type: 'mgStart', kind: this.kind, seed: this.seed, countdown: this.countdown, duration: this.duration });
    return this.flush();
  }

  flush() {
    const e = this.events;
    this.events = [];
    return e;
  }

  pub(p) {
    return {
      key: p.key, name: p.name, character: p.character, bot: p.bot, score: p.score, left: p.left,
      team: p.team, kit: p.kit, g: p.g, uses: p.uses, ready: p.ready, alive: p.alive, hp: Math.round(p.hp), maxHp: Math.round(p.maxHp),
      sup: Math.round(p.sup * 100) / 100, power: p.power, gems: p.gems, stars: p.stars, k: p.k, d: p.d, place: p.place,
      sh: p.shieldUntil, sm: p.smokeUntil, tr: p.trackUntil, trT: p.trackTeam, sc: p.scopeUntil, hpMul: p.hpMul,
    };
  }

  view(i) {
    return {
      kind: this.kind, mode: this.mode, me: i, phase: this.phase, winner: this.winner, ranking: this.ranking, variant: this.mapId,
      players: this.p.map((p) => this.pub(p)),
      gems: this.cfg.gems ? this.teamGems() : undefined, hold: this.cfg.gems ? this.hold : undefined,
      round: this.cfg.rounds ? this.round : undefined, wins: this.cfg.rounds ? this.wins : undefined,
      roundAt: this.cfg.rounds ? this.roundAt : undefined, brk: this.cfg.rounds ? this.brkUntil : undefined,
    };
  }

  syncView(i) {
    const w = this.world;
    const cells = [];
    w.cells.forEach((c, k) => { if (c !== w.base[k] && c !== C.SAND) cells.push(k); });
    return {
      ...this.view(i), seed: this.seed, duration: this.duration, elapsed: this.t, started: this.started,
      pos: this.p.map((p) => ({ x: p.x, y: p.y, a: p.a })),
      broken: cells, chests: [...this.chestHp], items: [...this.items.values()],
      turrets: this.turrets.map((u) => ({ id: u.id, o: u.o, team: u.team, x: u.x, y: u.y, hp: u.hp, t1: u.t1 })),
      sands: this.sands.map((s) => ({ id: s.id, cells: s.cells, t1: s.t1 })),
      traps: this.traps.filter((q) => q.team === this.p[i].team).map((q) => ({ id: q.id, x: q.x, y: q.y, team: q.team })),
    };
  }

  push(ev) {
    ev.dur = 0;
    ev.states = this.p.map((_, i) => this.view(i));
    this.events.push(ev);
  }

  // ---------------------------------------------------------- positions des joueurs (live)
  onLive(key, d) {
    const p = this.p.find((q) => q.key === key);
    if (!p || p.bot || !d) return;
    const t = this.t;
    if (p.alive && fin(d.x, d.y)) {
      const nx = clamp(d.x / 100, 0, this.world.w), ny = clamp(d.y / 100, 0, this.world.h);
      const dt = Math.max(0.05, (t - p.liveAt) / 1000);
      if (p.liveAt) { p.vx = clamp((nx - p.x) / dt, -6, 6); p.vy = clamp((ny - p.y) / dt, -6, 6); }
      p.x = nx;
      p.y = ny;
      p.liveAt = t;
    }
    if (Number.isFinite(d.a)) p.a = d.a / 100;
    p.mv = !!d.m;
    if (d.at) p.atkAt = t;
  }

  // ---------------------------------------------------------- actions des joueurs
  act(i, a) {
    if (this.phase !== 'playing') return { error: 'La partie est terminée.' };
    if (!a || typeof a !== 'object') return { error: 'Action invalide.' };
    const p = this.p[i];
    const t = this.t;
    if (p.left) return { events: [] };
    switch (a.kind) {
      case 'pick': this.pick(i, a, t); break;
      case 'hit': if (p.kit && typeof a.id === 'string') this.playerHit(i, a, t); break;
      case 'sup': if (p.alive && typeof a.id === 'string') this.useSuper(i, a, t); break;
      case 'gad': if (p.alive && (a.n === 0 || a.n === 1)) this.gadget(i, a.n, a, t); break;
      case 'take': if (p.alive && Number.isInteger(a.id)) this.take(i, a.id); break;
      default: return { error: 'Action inconnue.' };
    }
    return { events: this.flush() };
  }

  // Choix du kit et des objets, pendant le compte à rebours. Tout le monde prêt : la partie démarre plus tôt.
  pick(i, a, t) {
    const p = this.p[i];
    if (t >= 0 || this.started) return;
    Object.assign(p, cleanPick(a), { ready: !!a.ready });
    const humans = this.p.filter((q) => !q.bot && !q.left);
    let go;
    if (humans.every((q) => q.ready) && t < -3200) {
      // le compte à rebours saute à 3 s
      this.startAt = Date.now() + 3000;
      go = 3000;
    }
    this.push({ type: 'pick', who: i, ...(go ? { go } : {}) });
  }

  // ---------------------------------------------------------- dégâts et soins
  // Coup annoncé par un joueur : { id (attaque), b (balle ou vague), s (super), tg : 'p' | 't' | 'c', j, ox, oy (départ), d, st }
  playerHit(i, a, t) {
    const p = this.p[i];
    const sup = !!a.s;
    if (sup && !p.supIds.has(a.id)) return;
    if (!p.alive && t - p.deadAt > 1500) return; // les balles en vol touchent encore un instant après la mort
    if (this.brkUntil && t < this.brkUntil) return;
    const key = `${a.id}|${a.b | 0}|${a.tg}${a.j}`;
    if (p.hits.has(key)) return;
    p.hits.set(key, t);
    if (p.hits.size > 400) for (const [k, at] of p.hits) if (t - at > 15000) p.hits.delete(k);
    const sp = specOf(p.kit, sup);
    const ox = fin(a.ox, a.oy) && Math.hypot(a.ox - p.x, a.oy - p.y) < 4 ? a.ox : p.x;
    const oy = fin(a.ox, a.oy) && Math.hypot(a.ox - p.x, a.oy - p.y) < 4 ? a.oy : p.y;
    const reach = (sp.range || 0) + radOf(p.kit, sp) + (sp.t === 'leap' || sp.t === 'dash' ? 2 : 0) + 3;
    const o = { x: ox, y: oy };
    const extra = { d: Number.isFinite(a.d) ? clamp(a.d, 0, sp.range || 13) : 0, still: !!a.st, tick: a.b > 0 && sp.t === 'zone' };
    if (a.tg === 'p') {
      const j = a.j, q = this.p[j];
      if (!q || j === i || !q.alive || dist(o, q) > reach + 1.5) return;
      if (!this.enemy(i, j)) { if (sp.heal) this.heal(i, j, sp.heal, !sup); return; }
      this.strike(i, j, sup, extra, { ox, oy, kn: sup && sp.knock ? sp.knock : 0 });
    } else if (a.tg === 't') {
      const u = this.turrets.find((x) => x.id === a.j);
      if (!u || u.team === p.team || dist(o, u) > reach + 1.5) return;
      this.hurtTurret(u, this.dmgBy(i, sup, extra));
    } else if (a.tg === 'c' && Number.isInteger(a.j)) {
      const w = this.world, c = w.cells[a.j];
      if (c == null || !breakable(c)) return;
      const cx = (a.j % w.w) + 0.5, cy = Math.floor(a.j / w.w) + 0.5;
      if (Math.hypot(cx - ox, cy - oy) > reach + 1) return;
      this.hitCell(i, a.j, sup, this.dmgBy(i, sup, extra));
    }
  }

  dmgBy(i, sup, extra = {}) {
    const p = this.p[i];
    return Math.round(dmgOf(p.kit, sup, { ...extra, power: p.power }) * p.dmgMul);
  }

  // Le joueur i touche j avec son attaque (sup) : dégâts, charge de la super, talents, effets
  strike(i, j, sup, extra, fx = {}) {
    const p = this.p[i], q = this.p[j];
    const t = this.t;
    const dmg = this.dmgBy(i, sup, extra);
    const done = this.damage(j, dmg, i, fx);
    if (done > 0) {
      if (!sup) p.sup = Math.min(1, p.sup + done / KITS[p.kit].superDmg);
      if (p.kit === 'arc') { q.trackUntil = t + 4000; q.trackTeam = p.team; }
      if (p.kit === 'docteur') this.heal(i, i, Math.round(done * 0.25), false);
    }
    const sp = specOf(p.kit, sup);
    if (sup && sp.stun && q.alive) {
      q.stunUntil = t + sp.stun;
      this.push({ type: 'stun', who: j, until: q.stunUntil });
    }
    if (fx.kn && q.alive) this.knock(j, Math.atan2(q.y - fx.oy, q.x - fx.ox), fx.kn);
  }

  // Dégâts subis par j (by : joueur, -1 : tempête / piège sans propriétaire) ; renvoie les dégâts encaissés
  damage(j, dmg, by = -1, src = {}) {
    const q = this.p[j];
    const t = this.t;
    if (!q.alive || dmg <= 0) return 0;
    if (t < q.shieldUntil) dmg *= t - (q.spawnAt || 0) < BR.spawnShield ? 0 : GAD.shieldTake;
    if (q.kit === 'pompe' && q.hp < q.maxHp * 0.4) dmg *= 0.7;
    dmg = Math.round(dmg);
    if (dmg <= 0) return 0;
    q.hp -= dmg;
    q.hurtAt = t;
    if (by >= 0) q.lastBy = by;
    this.hitsBuf.l.push([j, dmg, Math.max(0, Math.round(q.hp)), by, src.storm ? 1 : 0]);
    if (q.hp <= 0) this.kill(j, by >= 0 ? by : (t - (q.lastHurtBy || -1e9) < 3000 ? q.lastBy ?? -1 : -1));
    else if (by >= 0) q.lastHurtBy = t;
    return dmg;
  }

  heal(by, j, amount, charge = true) {
    const q = this.p[j];
    if (!q.alive || amount <= 0 || q.hp >= q.maxHp) return;
    const got = Math.min(amount, q.maxHp - q.hp);
    q.hp += got;
    this.hitsBuf.h.push([j, Math.round(got), Math.round(q.hp)]);
    if (charge && by >= 0 && by !== j) {
      const p = this.p[by];
      p.sup = Math.min(1, p.sup + got / KITS[p.kit].superDmg);
    }
  }

  knock(j, a, d) {
    const q = this.p[j];
    const to = move(this.world, q.x, q.y, Math.cos(a) * d, Math.sin(a) * d);
    q.x = to.x;
    q.y = to.y;
    this.push({ type: 'knock', who: j, x: Math.round(to.x * 100) / 100, y: Math.round(to.y * 100) / 100 });
  }

  kill(j, by) {
    const q = this.p[j];
    const t = this.t;
    q.alive = false;
    q.hp = 0;
    q.deadAt = t;
    q.d++;
    const drop = this.dropGems(j);
    let gain = 0;
    if (by >= 0 && by !== j && this.p[by]) {
      const k = this.p[by];
      k.k++;
      if (this.cfg.bounty) {
        gain = q.stars;
        k.score += gain;
        k.stars = Math.min(7, k.stars + 1);
      } else if (!this.cfg.hill && !this.cfg.gems) k.score = k.k;
    }
    if (this.cfg.bounty) q.stars = 2;
    if (this.mode === 'survie') q.place = this.alivePl().length + 1;
    this.push({ type: 'kill', who: j, by, x: Math.round(q.x * 100) / 100, y: Math.round(q.y * 100) / 100, gain, drop });
    if (this.mode === 'survie' && this.alivePl().length <= 1) this.finish();
    if (this.cfg.rounds) this.checkRound();
  }

  hurtTurret(u, dmg) {
    u.hp -= dmg;
    this.hitsBuf.tu.push([u.id, Math.max(0, Math.round(u.hp)), dmg]);
    if (u.hp <= 0) this.removeTurret(u);
  }

  removeTurret(u) {
    const k = this.turrets.indexOf(u);
    if (k < 0) return;
    this.turrets.splice(k, 1);
    this.push({ type: 'turretGone', id: u.id, x: u.x, y: u.y });
  }

  // Case cassable touchée : coffre à poudre (tout le fait céder), caisse ou sacs (seulement ce qui défonce)
  hitCell(i, ci, sup, dmg) {
    const w = this.world, c = w.cells[ci];
    const sp = specOf(this.p[i].kit, sup);
    if (c === C.CHEST) {
      const hp = (this.chestHp.get(ci) ?? BR.chestHp) - dmg;
      if (hp > 0) {
        this.chestHp.set(ci, hp);
        this.push({ type: 'chest', i: ci, hp });
        return;
      }
      this.chestHp.delete(ci);
      this.breakCells([ci]);
      this.addItem('vial', (ci % w.w) + 0.5, Math.floor(ci / w.w) + 0.5);
    } else if (sup && sp.breaks) this.breakCells([ci]);
  }

  breakCells(list) {
    const w = this.world;
    const out = [];
    for (const ci of list) {
      if (!breakable(w.cells[ci])) continue;
      const was = w.cells[ci];
      w.cells[ci] = C.FLOOR;
      if (was === C.SAND) for (const s of this.sands) s.cells = s.cells.filter((x) => x !== ci);
      out.push([ci, was]);
    }
    if (out.length) this.push({ type: 'break', cells: out });
  }

  // ---------------------------------------------------------- super-attaques
  useSuper(i, a, t) {
    const p = this.p[i];
    if (p.sup < 0.999 || t < 0 || (this.brkUntil && t < this.brkUntil)) return;
    p.sup = 0;
    p.supIds.add(a.id);
    if (p.supIds.size > 30) p.supIds.delete(p.supIds.values().next().value);
    p.atkAt = t;
    if (p.kit === 'gatling' && fin(a.tx, a.ty)) this.addTurret(i, a.tx, a.ty, t);
    this.push({ type: 'super', who: i });
  }

  addTurret(i, tx, ty, t) {
    const p = this.p[i], sp = KITS.gatling.sup;
    const aim = clampAim(p.x, p.y, tx, ty, sp.range);
    const s = freeSpot(this.world, aim.x, aim.y, 0.4);
    // une tourelle à la fois par joueur
    for (const u of this.turrets.filter((x) => x.o === i)) this.removeTurret(u);
    const u = { id: ++this.turretId, o: i, team: p.team, x: s.x, y: s.y, hp: sp.hp, t1: t + sp.life, next: t + 500, n: 0 };
    this.turrets.push(u);
    this.push({ type: 'turret', id: u.id, o: i, team: u.team, x: u.x, y: u.y, hp: u.hp, t1: u.t1 });
  }

  // ---------------------------------------------------------- objets
  gadget(i, n, a, t) {
    const p = this.p[i];
    const g = p.g?.[n];
    if (!g || p.uses[n] <= 0 || t - p.gadAt < BR.gadgetCd || t < 0 || t < p.stunUntil) return;
    p.uses[n]--;
    p.gadAt = t;
    const ev = { type: 'gadget', who: i, g, n };
    if (g === 'whisky') this.heal(i, i, GAD.heal, false);
    else if (g === 'etoile') ev.until = p.shieldUntil = t + GAD.shield;
    else if (g === 'eperons') ev.until = p.speedUntil = t + GAD.speed;
    else if (g === 'longuevue') ev.until = p.scopeUntil = t + GAD.scope;
    else if (g === 'fumigene') ev.until = p.smokeUntil = t + GAD.smoke;
    else if (g === 'piege') {
      const q = { id: ++this.trapId, by: i, team: p.team, x: p.x, y: p.y, t1: t + GAD.trap.life };
      this.traps.push(q);
      Object.assign(ev, { id: q.id, x: q.x, y: q.y, team: q.team });
    } else if (g === 'sacs') {
      const ang = Number.isFinite(a.a) ? a.a : p.a;
      const cells = sandCells(this.world, p.x, p.y, ang).filter((ci) => !this.p.some((q) => q.alive && cellAt(this.world, q.x, q.y) === ci));
      for (const ci of cells) this.world.cells[ci] = C.SAND;
      const s = { id: ++this.sandId, cells, t1: t + GAD.sand };
      this.sands.push(s);
      Object.assign(ev, { id: s.id, cells, t1: s.t1 });
    }
    this.push(ev);
  }

  // ---------------------------------------------------------- objets au sol (gemmes, fioles)
  addItem(kind, x, y) {
    const it = { id: ++this.itemId, kind, x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100 };
    this.items.set(it.id, it);
    this.push({ type: 'item', it });
    return it;
  }

  take(i, id) {
    const p = this.p[i], it = this.items.get(id);
    if (!it || dist(p, it) > 1.6) return;
    this.items.delete(id);
    if (it.kind === 'gem') p.gems++;
    else if (it.kind === 'vial' && p.power < BR.power.max) {
      p.power++;
      p.maxHp += BR.power.hp;
      p.hp += BR.power.hp;
    }
    this.push({ type: 'took', id, who: i, kind: it.kind });
  }

  dropGems(j) {
    const q = this.p[j];
    if (!q.gems) return null;
    const out = [];
    for (let k = 0; k < q.gems; k++) {
      const a = (k / q.gems) * Math.PI * 2 + Math.random();
      const s = freeSpot(this.world, q.x + Math.cos(a) * rnd(0.4, 1.3), q.y + Math.sin(a) * rnd(0.4, 1.3), 0.2);
      const it = { id: ++this.itemId, kind: 'gem', x: Math.round(s.x * 100) / 100, y: Math.round(s.y * 100) / 100 };
      this.items.set(it.id, it);
      out.push(it);
    }
    q.gems = 0;
    return out;
  }

  teamGems() { return [0, 1].map((tm) => this.p.reduce((s, p) => s + (p.team === tm && p.alive ? p.gems : 0), 0)); }

  // ---------------------------------------------------------- apparition
  spawnAll(t) {
    const w = this.world;
    if (this.cfg.team) {
      for (const tm of [0, 1]) {
        const list = w.teamSpawns[tm];
        this.p.filter((p) => p.team === tm).forEach((p, k) => this.spawn(this.p.indexOf(p), list[k % list.length], t));
      }
    } else {
      // chacun pour soi : des départs aussi éloignés que possible les uns des autres
      const pool = [...w.spawns].sort(() => Math.random() - 0.5);
      const chosen = [pool.shift()];
      while (chosen.length < this.p.length && pool.length) {
        pool.sort((a, b) => Math.min(...chosen.map((c) => dist(c, b))) - Math.min(...chosen.map((c) => dist(c, a))));
        chosen.push(pool.shift());
      }
      this.p.forEach((p, i) => this.spawn(i, chosen[i % chosen.length], t));
    }
  }

  spawn(i, at, t) {
    const p = this.p[i];
    if (p.left) return;
    if (!p.kit) Object.assign(p, cleanPick(p));
    const kit = KITS[p.kit];
    const s = freeSpot(this.world, at.x, at.y);
    Object.assign(p, {
      alive: true, x: s.x, y: s.y, a: s.x < this.world.cx ? 0 : Math.PI, vx: 0, vy: 0,
      maxHp: Math.round(kit.hp * p.hpMul) + p.power * BR.power.hp, hurtAt: -1e9, spawnAt: t, shieldUntil: t + BR.spawnShield,
      stunUntil: 0, rootUntil: 0, smokeUntil: 0, gems: 0, ammo: kit.ammo,
    });
    p.hp = p.maxHp;
    if (p.ai) Object.assign(p.ai, { path: null, goal: null, seenAt: -1e9, last: null });
    this.push({ type: 'spawn', who: i, x: Math.round(p.x * 100) / 100, y: Math.round(p.y * 100) / 100, hp: p.hp, maxHp: p.maxHp });
  }

  respawnPoint(i) {
    const p = this.p[i];
    const w = this.world;
    const list = this.cfg.team ? w.teamSpawns[p.team] : w.spawns;
    const foes = this.p.filter((q, j) => q.alive && this.enemy(i, j));
    let best = list[0], bestS = -1;
    for (const s of list) {
      const score = (foes.length ? Math.min(...foes.map((f) => dist(f, s))) : 0) + Math.random() * 3;
      if (score > bestS) { bestS = score; best = s; }
    }
    return best;
  }

  // ---------------------------------------------------------- horloge de l'hôte
  tick() {
    if (this.phase !== 'playing') return [];
    const t = this.t;
    const dt = clamp((t - this.lastTick) / 1000, 0, 0.25);
    this.lastTick = t;
    if (t >= 0 && !this.started) {
      this.started = true;
      this.roundAt = 0;
      this.spawnAll(t);
    }
    if (this.started && t < this.duration) {
      this.flows.clear();
      const w = this.world;
      // réapparitions
      if (this.cfg.respawn) {
        this.p.forEach((p, i) => { if (!p.alive && !p.left && t - p.deadAt >= this.cfg.respawn) this.spawn(i, this.respawnPoint(i), t); });
      }
      // manches : pause entre deux manches, puis tout le monde repart de son camp
      if (this.cfg.rounds) {
        if (this.brkUntil && t >= this.brkUntil) {
          this.brkUntil = 0;
          this.round++;
          this.roundAt = t;
          this.shots = [];
          for (const u of [...this.turrets]) this.removeTurret(u);
          this.resetCells();
          this.p.forEach((p) => { p.alive = false; p.sup = Math.max(p.sup, 0); });
          this.spawnAll(t);
          this.push({ type: 'round', n: this.round });
        } else if (!this.brkUntil && t - this.roundAt >= this.cfg.roundMs) this.roundTimeout();
      }
      // bots, tourelles, projectiles
      this.p.forEach((p, i) => { if (p.ai && !p.left) this.botThink(i, t, dt); });
      for (const u of [...this.turrets]) this.turretTick(u, t);
      this.stepHostShots(t);
      // pièges
      for (const q of [...this.traps]) {
        if (t >= q.t1) { this.traps.splice(this.traps.indexOf(q), 1); this.push({ type: 'trapGone', id: q.id }); continue; }
        const j = this.p.findIndex((p) => p.alive && p.team !== q.team && dist(p, q) < GAD.trap.r + BR.body);
        if (j < 0) continue;
        this.traps.splice(this.traps.indexOf(q), 1);
        const v = this.p[j];
        v.rootUntil = t + GAD.trap.root;
        this.push({ type: 'trap', id: q.id, who: j, x: q.x, y: q.y, until: v.rootUntil });
        this.damage(j, GAD.trap.dmg, q.by);
      }
      // sacs de sable
      for (const s of [...this.sands]) if (t >= s.t1) {
        this.sands.splice(this.sands.indexOf(s), 1);
        for (const ci of s.cells) if (w.cells[ci] === C.SAND) w.cells[ci] = C.FLOOR;
        this.push({ type: 'sandGone', id: s.id, cells: s.cells });
      }
      // ramassage par les bots
      for (const it of [...this.items.values()]) {
        const j = this.p.findIndex((p) => p.ai && p.alive && dist(p, it) < 0.75);
        if (j >= 0) this.take(j, it.id);
      }
      this.modeTick(t, dt);
      // toutes les 500 ms : récupération et tempête
      if (t >= this.nextSlow) {
        this.nextSlow = t + 500;
        this.p.forEach((p, j) => {
          if (!p.alive) return;
          const wait = p.kit === 'forgeron' ? BR.regenWait * 0.65 : BR.regenWait;
          if (p.hp < p.maxHp && t - p.hurtAt > wait && t - p.atkAt > wait && !inStorm(w, t, p.x, p.y)) {
            this.heal(-1, j, Math.round(p.maxHp * BR.regenRate * 0.5 * (p.kit === 'forgeron' ? 1.5 : 1)), false);
          }
          if (this.cfg.storm && inStorm(w, t, p.x, p.y)) this.damage(j, Math.round(stormDmg(t) / 2), -1, { storm: 1 });
        });
      }
    }
    this.flushHits();
    // positions des bots pour tout le monde (5 par seconde) et leurs attaques (tout de suite)
    this.liveTick++;
    const bots = {};
    if (this.liveTick % 2 === 0) this.p.forEach((p, i) => { if (p.ai && p.alive) bots[i] = liveOfPos(p); });
    if (this.fx.length || Object.keys(bots).length) {
      this.liveOut.push({ key: 'brawl:b', d: { b: bots, at: this.fx.length ? this.fx.splice(0) : undefined } });
    }
    if (this.phase === 'playing' && t >= this.duration + 400) this.finish();
    return this.flush();
  }

  flushHits() {
    const b = this.hitsBuf;
    if (!b.l.length && !b.h.length && !b.tu.length) return;
    this.hitsBuf = { l: [], h: [], tu: [] };
    // un kill a pu partir avant : les dégâts restent annoncés (popups), l'état suit
    this.push({ type: 'hits', l: b.l, h: b.h, tu: b.tu });
  }

  resetCells() {
    const w = this.world;
    w.cells.set(w.base);
    this.sands = [];
    this.chestHp.clear();
    w.cells.forEach((c, i) => { if (c === C.CHEST) this.chestHp.set(i, BR.chestHp); });
    this.push({ type: 'reset' });
  }

  // Objectifs du mode
  modeTick(t, dt) {
    const w = this.world, cfg = this.cfg;
    if (cfg.hill) {
      const inside = this.alivePl().filter((p) => Math.hypot(p.x - w.cx, p.y - w.cy) <= cfg.hill);
      const king = inside.length === 1 ? this.p.indexOf(inside[0]) : inside.length ? -2 : -1;
      if (king !== this.king) { this.king = king; this.push({ type: 'hill', king }); }
      if (king >= 0) {
        const p = this.p[king];
        p.hillMs += dt * 1000;
        const s = Math.floor(p.hillMs / 1000);
        if (s !== p.score) {
          p.score = s;
          this.push({ type: 'score' });
          if (s >= cfg.target) this.finish();
        }
      }
    }
    if (cfg.gems) {
      if (t >= this.nextGem) {
        this.nextGem = t + cfg.every;
        const ground = [...this.items.values()].filter((it) => it.kind === 'gem').length;
        if (ground < 14) {
          const a = Math.random() * Math.PI * 2, r = rnd(0.3, 1.1);
          const s = freeSpot(w, w.cx + Math.cos(a) * r, w.cy + Math.sin(a) * r, 0.2);
          this.addItem('gem', s.x, s.y);
        }
      }
      const g = this.teamGems();
      const lead = g[0] >= cfg.target && g[0] > g[1] ? 0 : g[1] >= cfg.target && g[1] > g[0] ? 1 : -1;
      if (lead !== this.hold.team) {
        this.hold = { team: lead, until: lead >= 0 ? t + cfg.hold : 0 };
        this.push({ type: 'hold', ...this.hold });
      } else if (lead >= 0 && t >= this.hold.until) this.finish();
      // le score de chacun : les gemmes qu'il porte (les gemmes de l'équipe font gagner)
      this.p.forEach((p) => { p.score = p.gems; });
    }
  }

  // ---------------------------------------------------------- manches
  checkRound() {
    if (this.brkUntil || this.phase !== 'playing') return;
    const up = [0, 1].map((tm) => this.p.some((p) => p.team === tm && p.alive && !p.left));
    if (up[0] && up[1]) return;
    this.endRound(up[0] ? 0 : up[1] ? 1 : -1);
  }

  roundTimeout() {
    // temps écoulé : l'équipe qui a gardé le plus de vie (en part de ses PV) l'emporte
    const life = [0, 1].map((tm) => this.p.filter((p) => p.team === tm && p.alive).reduce((s, p) => s + p.hp / p.maxHp, 0));
    this.endRound(Math.abs(life[0] - life[1]) < 0.01 ? -1 : life[0] > life[1] ? 0 : 1);
  }

  endRound(win) {
    if (win >= 0) this.wins[win]++;
    const done = win >= 0 && this.wins[win] >= this.cfg.rounds;
    this.push({ type: 'roundEnd', win, wins: [...this.wins], n: this.round });
    if (done || this.round >= 5) { this.finish(); return; }
    this.brkUntil = this.t + this.cfg.brk;
    // pendant la pause, plus personne ne se bat
    this.p.forEach((p) => { if (p.alive) p.shieldUntil = this.brkUntil; });
  }

  // ---------------------------------------------------------- fin
  finish() {
    if (this.phase !== 'playing') return;
    this.flushHits();
    this.phase = 'over';
    const P = this.p;
    const idx = P.map((_, i) => i);
    let order, winners, tie = false;
    if (this.mode === 'survie') {
      // les survivants (par PV), puis du dernier tombé au premier
      order = idx.sort((a, b) => (P[a].left - P[b].left) || (P[b].alive - P[a].alive) || (P[a].alive ? P[b].hp - P[a].hp : P[b].deadAt - P[a].deadAt));
      order.forEach((i, k) => { P[i].place = k + 1; P[i].time = k; });
    } else if (this.cfg.team) {
      let win = -1;
      if (this.cfg.gems) {
        const g = this.teamGems();
        win = this.hold.team >= 0 && this.t >= this.hold.until ? this.hold.team : g[0] > g[1] ? 0 : g[1] > g[0] ? 1 : -1;
      } else win = this.wins[0] > this.wins[1] ? 0 : this.wins[1] > this.wins[0] ? 1 : -1;
      tie = win < 0;
      winners = tie ? [] : idx.filter((i) => P[i].team === win && !P[i].left);
      if (!tie && !winners.length) winners = idx.filter((i) => P[i].team === win);
      order = idx.sort((a, b) => (P[a].left - P[b].left) || ((P[b].team === win) - (P[a].team === win)) || (P[b].score - P[a].score) || (P[b].k - P[a].k));
      if (this.cfg.gems) this.p.forEach((p) => { p.score = p.gems; });
    } else {
      order = idx.sort((a, b) => (P[a].left - P[b].left) || (P[b].score - P[a].score) || (P[b].k - P[a].k) || (P[a].d - P[b].d));
      tie = order.length > 1 && P[order[0]].score === P[order[1]].score && !P[order[1]].left;
    }
    this.ranking = order;
    this.winner = order[0];
    this.push({ type: 'matchEnd', winner: this.winner, ranking: order, ...(winners ? { winners } : {}), tie });
  }

  leave(i) {
    if (this.phase !== 'playing' || !this.p[i]) return [];
    const p = this.p[i];
    const was = p.alive;
    p.left = true;
    p.alive = false;
    const drop = this.dropGems(i);
    this.push({ type: 'left', who: i, drop });
    if (was && this.mode === 'survie' && this.started && this.alivePl().length <= 1) this.finish();
    if (this.cfg.rounds && this.started) this.checkRound();
    if (this.p.every((q) => q.left || q.bot)) this.finish();
    return this.flush();
  }

  forfeit(i) {
    if (this.phase !== 'playing' || !this.p[i]) return [];
    this.p[i].left = true;
    this.p[i].alive = false;
    this.finish();
    return this.flush();
  }

  // ---------------------------------------------------------- projectiles des bots et des tourelles
  fire(rec) {
    const t = this.t;
    rec.id = `b${rec.o}:${++this.recN}`;
    rec.r = Math.floor(Math.random() * 2 ** 31);
    for (const k of ['x', 'y', 'tx', 'ty']) if (Number.isFinite(rec[k])) rec[k] = Math.round(rec[k] * 100) / 100;
    rec.a = Math.round(rec.a * 1000) / 1000;
    this.fx.push(rec);
    this.shots.push(...launch(rec, t));
    if (rec.tu == null) this.p[rec.o].atkAt = t;
  }

  targetsOf(team) {
    const out = [];
    this.p.forEach((q, j) => { if (q.alive && q.team !== team) out.push({ tg: 'p', id: j, x: q.x, y: q.y, r: BR.body }); });
    for (const u of this.turrets) if (u.team !== team) out.push({ tg: 't', id: u.id, x: u.x, y: u.y, r: 0.42 });
    return out;
  }

  // la cible (joueur ou tourelle) prend le coup de l'attaque rec, envoyée par le bot (ou la tourelle) o
  recHit(rec, tg, extra = {}) {
    const i = rec.o;
    if (tg.tg === 'p') {
      if (rec.tu != null) this.damage(tg.id, Math.round(dmgOf('gatling', true, { tick: true, power: this.p[i].power }) * this.p[i].dmgMul), i);
      else this.strike(i, tg.id, !!rec.s, extra, extra.fx || {});
    } else {
      const u = this.turrets.find((x) => x.id === tg.id);
      if (u) this.hurtTurret(u, rec.tu != null ? KITS.gatling.sup.dmg : this.dmgBy(i, !!rec.s, extra));
    }
  }

  stepHostShots(t) {
    const w = this.world;
    const ally = (rec) => this.p[rec.o].team;
    stepShots(this.shots, t, w, {
      targets: (p) => this.targetsOf(ally(p.rec)),
      hit: (p, tg) => this.recHit(p.rec, tg, { d: Math.hypot(p.x - p.x0, p.y - p.y0), still: !!p.rec.st }),
      wall: (p, ci) => {
        const key = `${p.rec.id}|${p.b}|c${ci}`;
        if (p.hit.has(key)) return;
        p.hit.add(key);
        this.hitCell(p.rec.o, ci, !!p.rec.s, p.rec.tu != null ? KITS.gatling.sup.dmg : this.dmgBy(p.rec.o, !!p.rec.s));
      },
      boom: (p) => { if (!p.zone) this.area(p.rec, p.x, p.y, p.rad, false); },
      zoneTick: (z, k) => this.area(z.rec, z.x, z.y, z.rad, k > 0),
    });
  }

  // Explosion ou zone d'un bot : ennemis touchés, alliés soignés (élixirs), caisses
  area(rec, x, y, rad, tick) {
    const i = rec.o, p = this.p[i];
    const sp = specOf(p.kit, !!rec.s);
    for (const tg of this.targetsOf(p.team)) if (inBlast(x, y, rad, tg)) this.recHit(rec, tg, { tick });
    if (sp.heal) this.p.forEach((q, j) => { if (q.alive && q.team === p.team && j !== i && Math.hypot(q.x - x, q.y - y) <= rad + 0.2) this.heal(i, j, sp.heal, !rec.s); });
    for (const ci of cellsInRadius(this.world, x, y, rad)) this.hitCell(i, ci, !!rec.s, this.dmgBy(i, !!rec.s));
  }

  turretTick(u, t) {
    if (t >= u.t1 || !this.p[u.o]) { this.removeTurret(u); return; }
    if (t < u.next || (this.brkUntil && t < this.brkUntil)) return;
    const sp = KITS.gatling.sup;
    const team = u.team;
    const viewers = this.viewersOf(team);
    let best = null, bd = sp.srange;
    this.p.forEach((q) => {
      if (!q.alive || q.team === team) return;
      const d = dist(u, q);
      if (d < bd && clearShot(this.world, u.x, u.y, q.x, q.y) && seen(this.world, t, this.pubSeen(q, team), viewers)) { bd = d; best = q; }
    });
    if (!best) { u.next = t + 200; return; }
    u.next = t + sp.every;
    const a = Math.atan2(best.y + best.vy * (bd / sp.speed) - u.y, best.x + best.vx * (bd / sp.speed) - u.x) + rnd(-0.05, 0.05);
    this.fire({ o: u.o, tu: u.id, k: 'gatling', s: 1, x: u.x, y: u.y, a });
  }

  // ce que voit l'équipe team d'un joueur q (pour seen())
  pubSeen(q, team) {
    return { x: q.x, y: q.y, kit: q.kit, atkAt: q.atkAt, trackUntil: q.trackTeam === team ? q.trackUntil : 0, smokeUntil: q.smokeUntil };
  }
  viewersOf(team) {
    const v = this.p.filter((p) => p.alive && p.team === team).map((p) => ({ x: p.x, y: p.y, kit: p.kit, scopeUntil: p.scopeUntil }));
    for (const u of this.turrets) if (u.team === team) v.push({ x: u.x, y: u.y, kit: null });
    return v;
  }

  // ================================================================ bots
  newBot(i) {
    return {
      react: rnd(220, 480), seenAt: -1e9, sawJ: -1, last: null, goal: null, goalAt: 0, strafe: i % 2 ? 1 : -1, strafeAt: 0,
      stuckAt: 0, sx: 0, sy: 0, err: rnd(0.05, 0.11), keep: Math.random() < 0.5,
    };
  }

  // Champ de distances (en cases) vers la case de (tx, ty), pour contourner les murs
  flow(tx, ty) {
    const w = this.world;
    const ci = cellAt(w, tx, ty);
    if (ci < 0) return null;
    let f = this.flows.get(ci);
    if (f) return f;
    f = new Int16Array(w.w * w.h).fill(-1);
    const q = [ci];
    f[ci] = 0;
    for (let h = 0; h < q.length; h++) {
      const c = q[h], x = c % w.w, y = (c - x) / w.w;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w.w || ny >= w.h) continue;
        const n = ny * w.w + nx;
        if (f[n] >= 0 || blocksMove(w.cells[n])) continue;
        f[n] = f[c] + 1;
        q.push(n);
      }
    }
    this.flows.set(ci, f);
    return f;
  }

  // Direction (unitaire) pour aller vers (tx, ty) en contournant les obstacles
  steer(p, tx, ty) {
    const w = this.world;
    if (Math.hypot(tx - p.x, ty - p.y) < 0.3) return null;
    if (clearShot(w, p.x, p.y, tx, ty) && !this.waterBetween(p.x, p.y, tx, ty)) {
      const d = Math.hypot(tx - p.x, ty - p.y);
      return { x: (tx - p.x) / d, y: (ty - p.y) / d };
    }
    const f = this.flow(tx, ty);
    const ci = cellAt(w, p.x, p.y);
    if (!f || ci < 0) return null;
    const cx = ci % w.w, cy = (ci - cx) / w.w;
    let best = null, bv = f[ci] >= 0 ? f[ci] : 1e9;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= w.w || ny >= w.h) continue;
      const n = ny * w.w + nx;
      if (f[n] < 0) continue;
      if (dx && dy && (blocksMove(w.cells[cy * w.w + nx]) || blocksMove(w.cells[ny * w.w + cx]))) continue;
      const v = f[n] + (dx && dy ? 0.4 : 0);
      if (v < bv) { bv = v; best = [nx + 0.5, ny + 0.5]; }
    }
    if (!best) {
      const d = Math.hypot(cx + 0.5 - p.x, cy + 0.5 - p.y);
      return d > 0.05 ? { x: (cx + 0.5 - p.x) / d, y: (cy + 0.5 - p.y) / d } : null;
    }
    const d = Math.hypot(best[0] - p.x, best[1] - p.y) || 1;
    return { x: (best[0] - p.x) / d, y: (best[1] - p.y) / d };
  }

  waterBetween(x0, y0, x1, y1) {
    const d = Math.hypot(x1 - x0, y1 - y0), n = Math.ceil(d / 0.3);
    for (let k = 1; k <= n; k++) {
      const c = typeAt(this.world, x0 + ((x1 - x0) * k) / n, y0 + ((y1 - y0) * k) / n);
      if (c === C.WATER) return true;
    }
    return false;
  }

  randomGoal(near, spread) {
    const w = this.world;
    for (let k = 0; k < 30; k++) {
      const x = clamp(near.x + rnd(-spread, spread), 1, w.w - 1), y = clamp(near.y + rnd(-spread, spread), 1, w.h - 1);
      if (!overlaps(w, x, y)) return { x, y };
    }
    return { x: w.cx, y: w.cy };
  }

  botThink(i, t, dt) {
    const p = this.p[i], ai = p.ai, kit = KITS[p.kit], w = this.world;
    if (!p.alive) return;
    p.ammo = Math.min(kit.ammo, p.ammo + (dt * 1000) / reloadOf(p.kit));
    // super en cours (charge, bond)
    if (p.dash) return this.botDash(i, t, dt);
    if (p.leap) return this.botLeap(i, t);
    if (t < p.stunUntil || (this.brkUntil && t < this.brkUntil)) { p.mv = false; return; }
    // ce que voit le bot (et son équipe)
    const viewers = this.viewersOf(p.team);
    let tgt = null, td = 1e9;
    // mêlée : au début, on fait le plein de poudre plutôt que d'aller chercher la bagarre (sauf si on est attaqué)
    const range = this.cfg.chests && t < STORM.t0 && p.power < 3 && t - p.hurtAt > 3000 && this.chestHp.size ? 4 : 13;
    this.p.forEach((q, j) => {
      if (!q.alive || !this.enemy(i, j)) return;
      const d = dist(p, q);
      if (d > range || !seen(w, t, this.pubSeen(q, p.team), viewers)) return;
      const score = d - (1 - q.hp / q.maxHp) * 3 - (j === ai.sawJ ? 1.5 : 0);
      if (score < td) { td = score; tgt = q; }
    });
    const tj = tgt ? this.p.indexOf(tgt) : -1;
    if (tgt) {
      if (ai.sawJ !== tj || t - ai.seenAt > 1500) ai.reactAt = t + ai.react;
      ai.sawJ = tj;
      ai.seenAt = t;
      ai.last = { x: tgt.x, y: tgt.y };
    }
    const d = tgt ? dist(p, tgt) : 1e9;
    const hpK = p.hp / p.maxHp;
    const sp = kit.atk;
    // ------------------------------------------------ où aller
    let dir = null;
    const low = hpK < 0.33 && tgt && d < 7;
    const turret = this.turrets.find((u) => u.team !== p.team && dist(u, p) < 9);
    if (this.cfg.storm && (inStorm(w, t + 6000, p.x, p.y))) {
      dir = this.steer(p, w.cx + rnd(-1, 1), w.cy + rnd(-1, 1));
    } else if (low) {
      const home = this.cfg.team ? w.teamSpawns[p.team][0] : this.farFrom(tgt);
      dir = this.steer(p, home.x, home.y);
      if (!dir && tgt) dir = { x: (p.x - tgt.x) / d, y: (p.y - tgt.y) / d };
    } else if (tgt) {
      const pref = kit.pref;
      const los = clearShot(w, p.x, p.y, tgt.x, tgt.y);
      const needLos = sp.t === 'shot' || sp.t === 'melee';
      if (d > pref + 0.8 || (needLos && !los)) dir = this.steer(p, tgt.x, tgt.y);
      else if (d < pref - 1.4 && pref > 2) dir = this.away(p, tgt);
      else dir = this.strafeDir(p, tgt, t);
      // objectif plus important que le combat à distance
      if (this.cfg.hill && Math.hypot(p.x - w.cx, p.y - w.cy) > this.cfg.hill - 0.3 && d > 3) {
        const g = this.steer(p, w.cx, w.cy);
        if (g) dir = g;
      }
    } else {
      dir = this.objectiveDir(i, t);
    }
    if (!tgt && turret && kit.atk.range >= dist(p, turret) - 0.5) { /* on tire sur la tourelle plus bas */ }
    // ------------------------------------------------ déplacement
    const speed = kit.speed * (t < p.speedUntil ? GAD.speedMul : 1) * (t < p.rootUntil ? 0 : 1);
    if (dir && speed > 0) {
      const to = move(w, p.x, p.y, dir.x * speed * dt, dir.y * speed * dt);
      const moved = Math.hypot(to.x - p.x, to.y - p.y);
      p.vx = (to.x - p.x) / dt;
      p.vy = (to.y - p.y) / dt;
      p.x = to.x;
      p.y = to.y;
      p.mv = moved > 0.01;
      if (moved < speed * dt * 0.3) {
        if (!ai.stuckAt) ai.stuckAt = t;
        if (t - ai.stuckAt > 600) { ai.strafe *= -1; ai.goal = this.randomGoal(p, 4); ai.goalAt = t + 2500; ai.stuckAt = 0; }
      } else ai.stuckAt = 0;
    } else { p.mv = false; p.vx = p.vy = 0; }
    if (tgt) p.a = angTo(p, tgt);
    else if (dir) p.a = Math.atan2(dir.y, dir.x);
    // ------------------------------------------------ objets
    this.botGadgets(i, t, tgt, d, low);
    // ------------------------------------------------ attaque
    if (!tgt || t < (ai.reactAt || 0)) {
      // rien en vue : on tape les coffres à poudre et les tourelles
      if (turret && t - p.lastAtk > kit.cd && p.ammo >= 1 && dist(p, turret) <= this.reach(p.kit, false) && clearShot(w, p.x, p.y, turret.x, turret.y)) this.botAttack(i, turret, false, t);
      else if (this.cfg.chests && ai.chest != null && t - p.lastAtk > kit.cd && p.ammo >= 1.5) {
        const cx = (ai.chest % w.w) + 0.5, cy = Math.floor(ai.chest / w.w) + 0.5;
        if (w.cells[ai.chest] === C.CHEST && Math.hypot(cx - p.x, cy - p.y) <= this.reach(p.kit, false) - 0.3) this.botAttack(i, { x: cx, y: cy, vx: 0, vy: 0 }, false, t);
      }
      return;
    }
    if (p.sup >= 1 && this.superOk(i, tgt, d)) { this.botAttack(i, tgt, true, t); return; }
    if (t - p.lastAtk < kit.cd || p.ammo < 1) return;
    if (d > this.reach(p.kit, false)) return;
    if ((sp.t === 'shot' || sp.t === 'melee') && !clearShot(w, p.x, p.y, tgt.x, tgt.y)) return;
    if (p.ammo < 2 && Math.random() < 0.35 && d > 2) return; // garde une charge de côté
    this.botAttack(i, tgt, false, t);
  }

  reach(kit, sup) {
    const sp = specOf(kit, sup);
    if (sp.t === 'melee') return sp.range + 0.15;
    if (sp.t === 'slam') return sp.rad * 0.85;
    if (sp.t === 'turret') return sp.srange;
    return (sp.range || 6) * 0.95;
  }

  superOk(i, q, d) {
    const p = this.p[i], sp = KITS[p.kit].sup;
    switch (sp.t) {
      case 'slam': return d < sp.rad * 0.8;
      case 'ring': return d < 4;
      case 'dash': return d < sp.range - 0.5 && dashEnd(this.world, p.x, p.y, angTo(p, q), sp.range).d > d - 0.8;
      case 'leap': return d < sp.range && d > 1.5;
      case 'turret': return d < 8;
      case 'shot': return d < sp.range - 1;
      default: return d < (sp.range || 6);
    }
  }

  strafeDir(p, q, t) {
    const ai = p.ai;
    if (t > ai.strafeAt) { ai.strafe = Math.random() < 0.5 ? 1 : -1; ai.strafeAt = t + rnd(500, 1400); }
    const a = angTo(p, q) + (Math.PI / 2) * ai.strafe;
    // un peu vers la cible ou en arrière pour garder la distance voulue
    const d = dist(p, q), pref = KITS[p.kit].pref;
    const k = clamp((d - pref) / 3, -0.6, 0.6);
    const x = Math.cos(a) + Math.cos(angTo(p, q)) * k, y = Math.sin(a) + Math.sin(angTo(p, q)) * k;
    const n = Math.hypot(x, y) || 1;
    return { x: x / n, y: y / n };
  }

  away(p, q) {
    const d = dist(p, q) || 1;
    let x = (p.x - q.x) / d, y = (p.y - q.y) / d;
    if (overlaps(this.world, p.x + x * 0.5, p.y + y * 0.5)) { const s = p.ai.strafe; [x, y] = [-y * s, x * s]; }
    return { x, y };
  }

  farFrom(q) {
    const list = this.world.spawns;
    return list.reduce((b, s) => (dist(s, q) > dist(b, q) ? s : b), list[0]);
  }

  objectiveDir(i, t) {
    const p = this.p[i], ai = p.ai, w = this.world, cfg = this.cfg;
    const near = (kind) => {
      let best = null, bd = 1e9;
      for (const it of this.items.values()) if (it.kind === kind) { const d = dist(p, it); if (d < bd) { bd = d; best = it; } }
      return best;
    };
    if (cfg.hill) {
      if (Math.hypot(p.x - w.cx, p.y - w.cy) > 1.4) return this.steer(p, w.cx, w.cy);
      if (!ai.goal || t > ai.goalAt) { ai.goal = this.randomGoal({ x: w.cx, y: w.cy }, 1.2); ai.goalAt = t + rnd(800, 1600); }
      return this.steer(p, ai.goal.x, ai.goal.y);
    }
    if (cfg.gems) {
      const g = this.teamGems();
      const carrier = p.gems >= 3 && g[p.team] >= g[1 - p.team];
      if (carrier) {
        const home = w.teamSpawns[p.team][1] || w.teamSpawns[p.team][0];
        const bx = home.x + (p.team ? -5 : 5);
        if (!ai.goal || t > ai.goalAt) { ai.goal = this.randomGoal({ x: bx, y: home.y }, 3); ai.goalAt = t + rnd(1500, 3000); }
        return this.steer(p, ai.goal.x, ai.goal.y);
      }
      const gem = near('gem');
      if (gem) return this.steer(p, gem.x, gem.y);
      if (!ai.goal || t > ai.goalAt) { ai.goal = this.randomGoal({ x: w.cx + (p.team ? 2 : -2), y: w.cy }, 3); ai.goalAt = t + rnd(1500, 3000); }
      return this.steer(p, ai.goal.x, ai.goal.y);
    }
    if (cfg.chests) {
      const vial = near('vial');
      if (vial && dist(p, vial) < 10) return this.steer(p, vial.x, vial.y);
      if (ai.chest == null || w.cells[ai.chest] !== C.CHEST) {
        ai.chest = null;
        let bd = 12;
        for (const ci of this.chestHp.keys()) {
          const cx = (ci % w.w) + 0.5, cy = Math.floor(ci / w.w) + 0.5;
          const d = Math.hypot(cx - p.x, cy - p.y);
          if (d < bd && !inStorm(w, t + 8000, cx, cy)) { bd = d; ai.chest = ci; }
        }
      }
      if (ai.chest != null) {
        const cx = (ai.chest % w.w) + 0.5, cy = Math.floor(ai.chest / w.w) + 0.5;
        const want = Math.min(this.reach(p.kit, false) - 0.6, 3);
        if (Math.hypot(cx - p.x, cy - p.y) > want) {
          // on vise une case libre voisine du coffre
          const s = freeSpot(w, cx + (p.x - cx) * 0.35, cy + (p.y - cy) * 0.35);
          return this.steer(p, s.x, s.y);
        }
        return null;
      }
    }
    // ailleurs : on va voir là où on a vu quelqu'un, sinon on rôde vers le milieu
    if (ai.last && t - ai.seenAt < 6000) return this.steer(p, ai.last.x, ai.last.y);
    if (!ai.goal || t > ai.goalAt || dist(p, ai.goal) < 0.6) {
      const r = this.cfg.storm ? Math.max(3, (stormRect(w, t + 5000).x1 - w.cx) * 0.7) : 6;
      const toward = this.cfg.team ? { x: w.cx + (p.team ? -3 : 3), y: w.cy } : { x: w.cx, y: w.cy };
      ai.goal = this.randomGoal(toward, r);
      ai.goalAt = t + rnd(3000, 6000);
    }
    return this.steer(p, ai.goal.x, ai.goal.y);
  }

  botGadgets(i, t, tgt, d, low) {
    const p = this.p[i], ai = p.ai, kit = KITS[p.kit];
    if (t - p.gadAt < BR.gadgetCd + 500) return;
    const hpK = p.hp / p.maxHp;
    const want = (g) => {
      switch (g) {
        case 'whisky': return hpK < 0.4;
        case 'etoile': return hpK < 0.6 && tgt && d < 5;
        case 'eperons': return low || (tgt && kit.pref < 3 && d > 2.5 && d < 7);
        case 'longuevue': return !tgt && t - ai.seenAt > 3500 && t - ai.seenAt < 12000;
        case 'piege': return tgt && d < 2.5;
        case 'fumigene': return low;
        case 'cartouches': return tgt && p.ammo < 1 && d < this.reach(p.kit, false);
        case 'sacs': return tgt && kit.pref > 4 && d > 3.5 && d < 9 && hpK < 0.75;
        default: return false;
      }
    };
    for (const n of [0, 1]) {
      if (p.uses[n] > 0 && want(p.g[n]) && Math.random() < 0.5) {
        if (p.g[n] === 'cartouches') p.ammo = kit.ammo;
        this.gadget(i, n, { a: tgt ? angTo(p, tgt) : p.a }, t);
        return;
      }
    }
  }

  // Le bot attaque q (joueur, tourelle ou coffre) : visée avec un peu d'avance et d'erreur
  botAttack(i, q, sup, t) {
    const p = this.p[i], kit = KITS[p.kit], sp = specOf(p.kit, sup), w = this.world;
    const d = dist(p, q);
    const travel = sp.t === 'lob' || sp.t === 'zone' ? (sp.fly || 600) / 1000 : sp.speed ? d / sp.speed : 0;
    const lead = Math.random() < 0.75 ? 1 : 0;
    let ax = q.x + (q.vx || 0) * travel * lead, ay = q.y + (q.vy || 0) * travel * lead;
    const a = Math.atan2(ay - p.y, ax - p.x) + (Math.random() - 0.5) * 2 * p.ai.err;
    if (!sup) { p.ammo -= 1; p.lastAtk = t; } else p.sup = 0;
    p.a = a;
    const rec = { o: i, k: p.kit, s: sup ? 1 : 0, x: p.x, y: p.y, a, st: p.mv ? 0 : 1 };
    switch (sp.t) {
      case 'shot': case 'ring':
        this.fire(rec);
        break;
      case 'lob': case 'zone': {
        const err = (Math.random() - 0.5) * 0.9;
        const aim = clampAim(p.x, p.y, ax + err, ay - err, sp.range);
        Object.assign(rec, { tx: aim.x, ty: aim.y });
        this.fire(rec);
        break;
      }
      case 'melee': {
        this.fire(rec);
        for (const tg of meleeHits(w, p.x, p.y, a, sp.range, sp.arc, this.targetsOf(p.team))) this.recHit(rec, tg, {});
        for (const ci of cellsInRadius(w, p.x + Math.cos(a) * sp.range * 0.6, p.y + Math.sin(a) * sp.range * 0.6, sp.range * 0.5, (c) => c === C.CHEST)) this.hitCell(i, ci, false, this.dmgBy(i, false));
        break;
      }
      case 'slam': {
        p.supIds.add('slam');
        this.fire(rec);
        for (const tg of this.targetsOf(p.team)) if (inBlast(p.x, p.y, sp.rad, tg)) this.recHit(rec, tg, {});
        for (const ci of cellsInRadius(w, p.x, p.y, sp.rad)) this.hitCell(i, ci, true, this.dmgBy(i, true));
        break;
      }
      case 'dash': {
        const end = dashEnd(w, p.x, p.y, a, sp.range);
        Object.assign(rec, { tx: end.x, ty: end.y });
        this.fire(rec);
        p.dash = { a, left: end.d, hit: new Set(), rec };
        break;
      }
      case 'leap': {
        const aim = clampAim(p.x, p.y, ax, ay, sp.range);
        const land = freeSpot(w, aim.x, aim.y);
        Object.assign(rec, { tx: land.x, ty: land.y });
        this.fire(rec);
        p.leap = { x0: p.x, y0: p.y, x1: land.x, y1: land.y, t0: t, t1: t + sp.fly, rec };
        break;
      }
      case 'turret': {
        const aim = clampAim(p.x, p.y, p.x + Math.cos(a) * 2, p.y + Math.sin(a) * 2, sp.range);
        Object.assign(rec, { tx: aim.x, ty: aim.y });
        this.fire(rec);
        this.addTurret(i, aim.x, aim.y, t);
        break;
      }
      default: break;
    }
    p.atkAt = t;
  }

  botDash(i, t, dt) {
    const p = this.p[i], sp = KITS.pompe.sup, w = this.world, ds = p.dash;
    const step = Math.min(ds.left, sp.speed * dt);
    // défonce les caisses sur son passage
    const ci = cellAt(w, p.x + Math.cos(ds.a) * (BR.body + 0.3), p.y + Math.sin(ds.a) * (BR.body + 0.3));
    if (ci >= 0 && breakable(w.cells[ci])) this.hitCell(i, ci, true, this.dmgBy(i, true));
    const to = move(w, p.x, p.y, Math.cos(ds.a) * step, Math.sin(ds.a) * step);
    const moved = Math.hypot(to.x - p.x, to.y - p.y);
    p.x = to.x;
    p.y = to.y;
    p.mv = true;
    ds.left -= step;
    for (const tg of this.targetsOf(p.team)) {
      if (ds.hit.has(tg.tg + tg.id) || Math.hypot(tg.x - p.x, tg.y - p.y) > BR.body + tg.r + 0.25) continue;
      ds.hit.add(tg.tg + tg.id);
      this.recHit(ds.rec, tg, { fx: { ox: p.x - Math.cos(ds.a), oy: p.y - Math.sin(ds.a), kn: sp.knock } });
    }
    if (ds.left <= 0.01 || moved < step * 0.3) p.dash = null;
  }

  botLeap(i, t) {
    const p = this.p[i], L = p.leap;
    const k = clamp((t - L.t0) / (L.t1 - L.t0), 0, 1);
    p.x = L.x0 + (L.x1 - L.x0) * k;
    p.y = L.y0 + (L.y1 - L.y0) * k;
    p.mv = true;
    if (k < 1) return;
    p.leap = null;
    const sp = KITS.couteau.sup;
    for (const tg of this.targetsOf(p.team)) if (inBlast(p.x, p.y, sp.rad, tg)) this.recHit(L.rec, tg, {});
  }
}
