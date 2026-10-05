// Mini-jeux en temps réel, arbitrés par le navigateur de l'hôte (comme game.js pour la roulette).
// Le monde vient d'une graine ; l'hôte valide les coups (premier arrivé, premier servi),
// déclenche les tirs des bandits et fait jouer les bots du mode solo.
import {
  MODES, COUNTDOWN, W, H, SHOOTER_PTS, BONUSES, BONUS_MS, SAND_MS, DYNAMITE_BOSS, camAt, shooterWorld, targetSec, targetAim, targetX,
  WAGER, shooterEventAt,
  LASSO, lassoWorld, animalPos, lassoHand, lassoStart, lassoRush, lassoTrailing, LASSO_BET, LASSO_CATCHUP, OUTLAW, DUEL, CHARLIE, charlieWorld, npcPos,
} from './worlds.js';

const rnd = (a, b) => a + Math.random() * (b - a);

export class MiniGame {
  constructor(kind, players) {
    this.kind = kind;
    this.seed = Math.floor(Math.random() * 2 ** 31);
    this.duration = MODES[kind].duration;
    const n = players.length;
    this.p = players.map((pl, i) => ({
      key: pl.key, name: pl.name, character: pl.character, bot: !!pl.bot,
      score: 0, left: false, stats: { throws: 0, catches: 0, hits: 0, hurt: 0 },
      power: null, powerUntil: 0, sandUntil: 0, gunAmmo: 0, // bonus de la fusillade
      ai: pl.bot ? this.newBot(i, n) : null,
    }));
    this.world = kind === 'shooter' ? shooterWorld(this.seed, n) : kind === 'lasso' ? lassoWorld(this.seed) : null;
    this.hp = new Map(); // fusillade : PV restants des cibles touchées
    this.claimed = new Map(); // id -> joueur (cible abattue ou bête attrapée)
    this.fires = kind === 'shooter'
      ? this.world.targets.flatMap((tg) => tg.fire.map((at, k) => ({ at, id: tg.id, k }))).sort((a, b) => a.at - b.at)
      : [];
    this.nextFire = 0;
    // fusillade : bâtons de dynamite, dans l'ordre où ils touchent le sol
    this.tnts = kind === 'shooter' ? this.world.targets.filter((tg) => tg.kind === 'tnt').sort((a, b) => a.t1 - b.t1) : [];
    this.nextTnt = 0;
    this.nextAim = 0; // fusillade : désignation de la cible ~0,7 s avant chaque tir
    this.aims = new Map(); // `${id}:${k}` -> joueur visé
    this.wagerDone = false;
    this.phase = 'playing';
    this.winner = null;
    this.ranking = null;
    this.events = [];
    this.liveOut = []; // positions des bots à diffuser
    this.startAt = 0;
    this.cur = null; // duel, Charlie : manche en cours
  }

  get t() { return Date.now() - this.startAt; }

  start() {
    this.startAt = Date.now() + COUNTDOWN;
    this.push({ type: 'mgStart', kind: this.kind, seed: this.seed, countdown: COUNTDOWN, duration: this.duration });
    if (this.kind === 'duel') this.duelRound(0);
    if (this.kind === 'charlie') this.charlieRound(0);
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

  // État complet pour un joueur qui se reconnecte en cours de partie.
  syncView(i) {
    return {
      ...this.view(i), seed: this.seed, duration: this.duration, elapsed: this.t, claimed: [...this.claimed], hp: [...this.hp],
      round: this.cur && this.publicRound(),
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
    if (t < -300 || t > this.duration + 600 || this.p[i].left) return { events: [] };
    const num = (...k) => k.every((x) => Number.isFinite(a[x]));
    if (this.kind === 'shooter' && a.kind === 'hit' && Number.isInteger(a.id)) this.hit(i, a.id, t);
    else if (this.kind === 'shooter' && a.kind === 'wager') this.wager(i, t);
    else if (this.kind === 'lasso' && a.kind === 'catch' && Number.isInteger(a.id)) this.catch(i, a.id, t, a.bet === true);
    else if (this.kind === 'lasso' && a.kind === 'miss') this.lassoMiss(i, a.bet === true);
    else if (this.kind === 'duel' && a.kind === 'draw' && num('n', 'rt')) this.duelDraw(i, a.n, a.rt, t);
    else if (this.kind === 'charlie' && a.kind === 'find' && num('n', 'x', 'y', 't')) this.charlieFind(i, a, t);
    else return { error: 'Action inconnue.' };
    return { events: this.flush() };
  }

  // ------------------------------------------------------------ fusillade
  hit(i, id, t) {
    const tg = this.world.targets[id];
    if (!tg || this.claimed.has(id)) return;
    if (t < tg.t0 - 300 || t > tg.t1 + (tg.kind === 'tnt' ? 100 : 600)) return;
    const hp = (this.hp.get(id) ?? tg.hp) - 1;
    this.hp.set(id, hp);
    let pts = tg.pts;
    const kill = hp <= 0;
    if (kill) this.claimed.set(id, i);
    if (kill && this.defused(tg, t)) this.defuse(tg);
    if (kill && tg.kind === 'boss') pts += SHOOTER_PTS.bossKill;
    pts *= this.bountyX(tg, t);
    const p = this.p[i];
    p.score += pts;
    if (tg.kind !== 'civil' && tg.kind !== 'supply') p.stats.hits++;
    this.push({ type: 'hit', id, by: i, pts, hp, kill, bonus: kill ? tg.bonus : undefined, defused: kill && this.defused(tg, t) });
    if (kill && tg.bonus) this.giveBonus(i, tg.bonus, t);
    if (kill && tg.kind === 'boss') this.settleWager(i);
  }

  // lanceur abattu avant d'avoir lancé : son bâton de dynamite ne part jamais
  defused(tg, t) { return !!tg.throwAt && t < tg.throwAt; }
  defuse(tg) { for (const d of this.tnts) if (d.from === tg.id) this.claimed.set(d.id, -1); }

  // « Prime doublée » : les bandits (et El Diablo) rapportent deux fois plus pendant l'événement.
  bountyX(tg, t) {
    return (tg.kind === 'bandit' || tg.kind === 'rider' || tg.kind === 'boss') && shooterEventAt(this.world.events || [], 'bounty', t) ? 2 : 1;
  }

  // Pari sur El Diablo : on mise à son arrivée ; celui qui l'abat empoche le gros lot, les autres parieurs perdent leur mise.
  wager(i, t) {
    const p = this.p[i];
    if (p.wager || this.wagerDone || !shooterEventAt(this.world.events || [], 'wager', t)) return;
    p.wager = true;
    this.push({ type: 'wager', by: i, stake: WAGER.stake });
  }

  settleWager(killer) {
    if (this.wagerDone) return;
    this.wagerDone = true;
    const results = [];
    this.p.forEach((p, j) => {
      if (!p.wager) return;
      const d = j === killer ? WAGER.prize : -WAGER.stake;
      p.score += d;
      results.push([j, d]);
    });
    if (results.length) this.push({ type: 'wagerEnd', killer, results });
  }

  // Joueur visé par un bandit : si quelqu'un mène nettement, il a une chance sur deux d'être pris pour cible.
  pickVictim(tg, k) {
    const n = this.p.length;
    let v = tg.victims[k] % n;
    for (let s = 0; s < n && this.p[v].left; s++) v = (v + 1) % n;
    const alive = this.p.map((p, j) => j).filter((j) => !this.p[j].left);
    if (alive.length > 1) {
      const lead = alive.reduce((a, b) => (this.p[b].score > this.p[a].score ? b : a));
      const second = Math.max(...alive.filter((j) => j !== lead).map((j) => this.p[j].score));
      if (this.p[lead].score - second >= 150 && Math.random() < 0.5) v = lead;
    }
    return v;
  }

  giveBonus(i, bonus, t) {
    const p = this.p[i];
    const gun = BONUSES[bonus]?.gun;
    if (gun || bonus === 'shield') {
      p.power = bonus;
      p.powerUntil = t + (gun ? gun.ms : BONUS_MS);
      p.gunAmmo = gun ? gun.mag || Infinity : 0;
    } else if (bonus === 'sand') {
      this.p.forEach((o, j) => { if (j !== i) o.sandUntil = t + SAND_MS; });
    } else if (bonus === 'dynamite') {
      // tous les bandits à l'écran sautent ; El Diablo encaisse quelques dégâts
      const cam = camAt(t);
      for (const tg of this.world.targets) {
        if (tg.kind !== 'bandit' && tg.kind !== 'rider' && tg.kind !== 'boss') continue;
        if (this.claimed.has(tg.id) || tg.sec !== cam.sec || t < tg.t0 || t > tg.t1) continue;
        const x = targetX(tg, t, this.world.spots) - cam.x;
        if (x < -10 || x > W + 10) continue;
        if (tg.kind !== 'boss') {
          this.claimed.set(tg.id, i);
          if (this.defused(tg, t)) this.defuse(tg);
          const pts = tg.pts * this.bountyX(tg, t);
          p.score += pts;
          this.push({ type: 'hit', id: tg.id, by: i, pts, hp: 0, kill: true, boom: true, defused: this.defused(tg, t) });
        } else if (tg.kind === 'boss') {
          const hp = Math.max(0, (this.hp.get(tg.id) ?? tg.hp) - DYNAMITE_BOSS);
          this.hp.set(tg.id, hp);
          let pts = SHOOTER_PTS.bossHit * DYNAMITE_BOSS;
          if (!hp) { this.claimed.set(tg.id, i); pts += SHOOTER_PTS.bossKill; }
          pts *= this.bountyX(tg, t);
          p.score += pts;
          this.push({ type: 'hit', id: tg.id, by: i, pts, hp, kill: !hp, boom: true });
          if (!hp) this.settleWager(i);
        }
      }
    }
  }

  shooterTick(t) {
    // ~0,7 s avant chaque tir, on annonce qui est visé (cercle de la couleur du joueur)
    while (this.nextAim < this.fires.length && this.fires[this.nextAim].at - 700 <= t) {
      const f = this.fires[this.nextAim++];
      if (this.claimed.has(f.id)) continue;
      const v = this.pickVictim(this.world.targets[f.id], f.k);
      this.aims.set(`${f.id}:${f.k}`, v);
      this.push({ type: 'aim', id: f.id, k: f.k, victim: v });
    }
    while (this.nextFire < this.fires.length && this.fires[this.nextFire].at <= t) {
      const f = this.fires[this.nextFire++];
      if (this.claimed.has(f.id)) continue;
      const tg = this.world.targets[f.id];
      let v = this.aims.get(`${f.id}:${f.k}`) ?? this.pickVictim(tg, f.k);
      for (let k = 0; k < this.p.length && this.p[v].left; k++) v = (v + 1) % this.p.length;
      const p = this.p[v];
      if (p.power === 'shield' && f.at < p.powerUntil) {
        this.push({ type: 'fire', id: f.id, k: f.k, victim: v, pts: 0, blocked: true });
        continue;
      }
      p.score += SHOOTER_PTS.shot;
      p.stats.hurt++;
      this.push({ type: 'fire', id: f.id, k: f.k, victim: v, pts: SHOOTER_PTS.shot });
    }
    // bâton de dynamite qui touche le sol sans avoir été abattu : tout le monde encaisse l'explosion
    while (this.nextTnt < this.tnts.length && this.tnts[this.nextTnt].t1 <= t) {
      const tg = this.tnts[this.nextTnt++];
      if (this.claimed.has(tg.id)) continue;
      this.claimed.set(tg.id, -1);
      const hurt = [];
      this.p.forEach((p, j) => {
        if (p.left) return;
        if (p.power === 'shield' && tg.t1 < p.powerUntil) { hurt.push([j, 0]); return; }
        p.score += SHOOTER_PTS.tntBoom;
        p.stats.hurt++;
        hurt.push([j, SHOOTER_PTS.tntBoom]);
      });
      this.push({ type: 'tntBoom', id: tg.id, hurt });
    }
  }

  // ------------------------------------------------------------ lasso
  // bet : lasso doré (capture x2, raté -2). Pendant la ruée vers l'or, toutes les captures valent double.
  catch(i, id, t, bet = false) {
    const a = this.world.animals[id];
    const x = a && animalPos(a, t).x;
    if (!a || this.claimed.has(id) || t < a.t0 - 300 || t > a.t1 + 400 || x < -40 || x > W + 40) {
      this.lassoMiss(i, bet); // quelqu'un l'a attrapée avant : le pari est perdu
      return;
    }
    this.claimed.set(id, i);
    const rush = lassoRush(this.world, t, 300);
    const pts = a.pts * (rush ? 2 : 1) * (bet ? LASSO_BET.mult : 1);
    const p = this.p[i];
    p.score += pts;
    p.stats.catches++;
    this.push({ type: 'catch', id, by: i, pts, rush, bet });
  }

  lassoMiss(i, bet) {
    if (!bet) return;
    this.p[i].score += LASSO_BET.miss;
    this.push({ type: 'betMiss', by: i, pts: LASSO_BET.miss });
  }

  // Le hors-la-loi sort de l'écran sans avoir été attrapé : il vole le premier.
  lassoTick(t) {
    this.lassoDone ??= new Set();
    for (const tw of this.world.twists) {
      if (tw.kind !== 'outlaw' || this.lassoDone.has(tw.id) || t < tw.end + 450) continue;
      this.lassoDone.add(tw.id);
      if (this.claimed.has(tw.id)) continue;
      const live = this.p.map((_, j) => j).filter((j) => !this.p[j].left);
      const top = live.sort((a, b) => this.p[b].score - this.p[a].score)[0];
      const p = this.p[top];
      const pts = p && p.score > 0 ? Math.min(p.score, Math.max(OUTLAW.min, Math.round(p.score * OUTLAW.steal))) : 0;
      if (pts) p.score -= pts;
      this.push({ type: 'steal', id: tw.id, from: pts ? top : -1, pts });
    }
  }

  // ------------------------------------------------------------ manches (duel, Charlie)
  publicRound() {
    const { draws, first, bots, world, ...pub } = this.cur;
    return pub;
  }

  // ------------------------------------------------------------ duel
  // L'hôte annonce l'heure du signal ; chaque joueur mesure son temps de réaction sur sa propre
  // horloge et l'envoie. Le plus petit temps gagne, quelle que soit la latence de chacun.
  duelRound(t) {
    const n = (this.cur?.n ?? 0) + 1;
    const at = t;
    const fireAt = at + DUEL.intro + Math.round(rnd(...DUEL.wait));
    // faux signaux à partir de la 2e manche
    const decoys = [];
    const nd = n === 1 ? 0 : Math.floor(Math.random() * (n >= 3 ? 3 : 2));
    for (let k = 0, t0 = at + DUEL.intro + 700; k < nd && t0 < fireAt - 900; k++) {
      const dt = Math.round(rnd(t0, fireAt - 900));
      decoys.push({ at: dt, w: DUEL.decoys[Math.floor(Math.random() * DUEL.decoys.length)] });
      t0 = dt + 900;
    }
    const bots = {};
    this.p.forEach((p, i) => {
      if (!p.ai) return;
      const fooled = decoys.find(() => Math.random() < 0.1);
      if (fooled) bots[i] = { at: fooled.at + Math.round(rnd(200, 320)), rt: -1 };
      else {
        const rt = Math.round(Math.random() < 0.15 ? rnd(420, 650) : rnd(235, 420));
        bots[i] = { at: fireAt + rt, rt };
      }
    });
    this.cur = { n, at, fireAt, decoys, draws: {}, first: null, bots, done: false, nextAt: 0 };
    this.push({ type: 'dRound', round: this.publicRound() });
  }

  duelDraw(i, n, rt, t) {
    const c = this.cur;
    if (!c || c.done || c.n !== n || i in c.draws || t < c.at - 300) return;
    c.draws[i] = Math.round(rt);
    this.p[i].stats.throws++;
    if (rt < 0) return this.duelEnd(this.p.findIndex((p, j) => j !== i && !p.left), 'early', i);
    c.first ??= t;
    if (this.p.every((p, j) => p.left || j in c.draws)) this.duelResolve();
  }

  duelResolve() {
    const c = this.cur;
    let best = -1;
    for (const [i, rt] of Object.entries(c.draws)) if (rt >= 0 && (best < 0 || rt < c.draws[best])) best = +i;
    this.duelEnd(best, best < 0 ? 'none' : 'fast');
  }

  duelEnd(winner, reason, early = -1) {
    const c = this.cur;
    c.done = true;
    c.nextAt = this.t + DUEL.pause;
    if (winner >= 0) { this.p[winner].score++; this.p[winner].stats.hits++; }
    c.result = { winner, reason, early, rts: this.p.map((_, i) => c.draws[i] ?? null) };
    this.push({ type: 'dEnd', round: this.publicRound() });
  }

  duelTick(t) {
    const c = this.cur;
    if (!c) return;
    if (!c.done) {
      for (const [i, b] of Object.entries(c.bots)) if (t >= b.at && !(i in c.draws)) this.duelDraw(+i, c.n, b.rt, t);
      if (c.done) return;
      if (c.first != null && t >= c.first + DUEL.grace) this.duelResolve();
      else if (c.first == null && t > c.fireAt + DUEL.timeout) this.duelEnd(-1, 'none');
    } else if (t >= c.nextAt) {
      if (this.p.some((p) => p.score >= DUEL.wins)) this.finish();
      else this.duelRound(t);
    }
  }

  // ------------------------------------------------------------ où est Charlie
  charlieRound(t) {
    const n = (this.cur?.n ?? 0) + 1;
    // la première manche démarre au GO, les suivantes après l'annonce de la manche
    const at = n === 1 ? 0 : t + 2600;
    const bots = {};
    this.p.forEach((p, i) => { if (p.ai) bots[i] = at + Math.round(rnd(13000, 42000)); });
    this.cur = { n, at, end: at + CHARLIE.round, world: charlieWorld(this.seed, n), bots, done: false, nextAt: 0 };
    this.push({ type: 'cRound', round: this.publicRound() });
  }

  charlieFind(i, a, t) {
    const c = this.cur;
    if (!c || c.done || c.n !== a.n) return;
    // le temps annoncé doit être plausible (l'horloge de l'invité est décalée de sa latence)
    if (a.t < c.at - 200 || a.t > c.end + 300 || Math.abs(a.t - t) > 4000) return;
    const p = npcPos(c.world.charlie, a.t - c.at);
    if (Math.abs(a.x - p.x) > 10 || a.y < p.y - 30 || a.y > p.y + 6) return;
    this.charlieEnd(i, a.t);
  }

  charlieEnd(by, t) {
    const c = this.cur;
    c.done = true;
    c.nextAt = this.t + CHARLIE.pause;
    let pts = 0;
    if (by >= 0) {
      const left = Math.max(0, Math.min(1, (c.end - t) / CHARLIE.round));
      pts = 100 + Math.round(left * 10) * 10;
      this.p[by].score += pts;
      this.p[by].stats.catches++;
    }
    c.result = { by, pts, t: Math.round(Math.max(c.at, Math.min(c.end, t))) };
    this.push({ type: 'cEnd', round: this.publicRound() });
  }

  charlieTick(t) {
    const c = this.cur;
    if (!c) return;
    if (!c.done) {
      const bot = Object.entries(c.bots).filter(([i, at]) => t >= at && !this.p[i].left).sort((a, b) => a[1] - b[1])[0];
      if (bot) this.charlieEnd(+bot[0], bot[1]);
      else if (t >= c.end) this.charlieEnd(-1, c.end);
    } else if (t >= c.nextAt) {
      if (c.n >= CHARLIE.rounds) this.finish();
      else this.charlieRound(t);
    }
  }

  // ------------------------------------------------------------ horloge de l'hôte
  tick() {
    if (this.phase !== 'playing') return [];
    const t = this.t;
    if (t >= 0) {
      if (this.kind === 'shooter') this.shooterTick(Math.min(t, this.duration));
      if (this.kind === 'lasso') this.lassoTick(t);
      if (this.kind === 'duel') this.duelTick(t);
      else if (this.kind === 'charlie') this.charlieTick(t);
      else this.p.forEach((p, i) => { if (p.ai && !p.left && t < this.duration) this.botThink(i, t); });
    }
    if (this.phase === 'playing' && t >= this.duration + 400) this.finish();
    return this.flush();
  }

  finish() {
    if (this.kind === 'shooter') this.settleWager(-1); // El Diablo court toujours : les parieurs perdent leur mise
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
  newBot(i, n) {
    if (this.kind === 'shooter') return { next: rnd(900, 1800), aim: null, cx: 192, cy: 120 };
    const s = lassoStart(i, n);
    // chaque bot garde son couloir et sa distance, pour ne pas galoper tous au même endroit
    return { x: s.x, y: s.y, lane: s.y, back: 55 + (i % 3) * 28, target: null, cd: 0, pending: null };
  }

  botThink(i, t) {
    if (this.kind === 'shooter') this.shooterBot(i, t);
    else this.lassoBot(i, t);
  }

  shooterBot(i, t) {
    const me = this.p[i];
    const b = me.ai;
    // arme ramassée : elle tire plus vite que le revolver tant qu'il reste du temps et des balles
    const gun = t < me.powerUntil && me.gunAmmo > 0 ? BONUSES[me.power]?.gun : null;
    const blind = t < me.sandUntil;
    const cam = camAt(t);
    // un bot sur deux tente sa chance sur El Diablo
    if (!me.wager && !this.wagerDone && shooterEventAt(this.world.events || [], 'wager', t) && (me.key.length + i) % 2 === 0 && Math.random() < 0.08) this.wager(i, t);
    const screenOf = (tg) => {
      const p = targetAim(tg, t, this.world.spots);
      return { x: Math.round(p.x), y: Math.round(p.y) };
    };
    if (b.aim != null) {
      const tg = this.world.targets[b.aim];
      if (t < b.aimAt) return;
      b.aim = null;
      b.next = t + (gun ? rnd(gun.rate * 2, gun.rate * 4) : rnd(1000, 2200));
      if (!tg || this.claimed.has(tg.id) || t > tg.t1) return;
      const p = screenOf(tg);
      this.liveOut.push({ key: this.p[i].key, d: { c: [p.x, p.y], s: 1 } });
      if (gun) me.gunAmmo -= gun.dual ? 2 : 1;
      // la mitrailleuse arrose, l'akimbo double ses chances ; la vieille Gatling est imprécise
      const aim = blind ? 0.2 : !gun ? 0.6 : gun.dual ? 0.8 : gun.spread > 8 ? 0.65 : gun.mag ? 0.75 : 0.85;
      if (Math.random() < aim) this.hit(i, tg.id, t);
      return;
    }
    if (t < b.next) return;
    const live = this.world.targets.filter((tg) => {
      if (targetSec(tg) !== cam.sec || this.claimed.has(tg.id)) return false;
      if (t < tg.t0 + 550 || t > tg.t1 - 250) return false;
      if ((tg.kind === 'civil' || tg.kind === 'supply') && Math.random() > 0.06) return false;
      const { x, y } = targetAim(tg, t + 500, this.world.spots);
      return x > 0 && x < W && y > 0 && y < H;
    });
    if (!live.length) { b.next = t + 300; return; }
    live.sort((a, c) => (a.fire[0] ?? a.t1) - (c.fire[0] ?? c.t1));
    const tg = Math.random() < 0.6 ? live[0] : live[Math.floor(Math.random() * live.length)];
    const p = screenOf(tg);
    b.aim = tg.id;
    b.aimAt = t + (gun ? rnd(80, 180) : rnd(350, 700));
    this.liveOut.push({ key: this.p[i].key, d: { c: [p.x + Math.round(rnd(-6, 6)), p.y + Math.round(rnd(-6, 6))] } });
  }

  lassoBot(i, t) {
    const b = this.p[i].ai;
    const out = { x: Math.round(b.x), y: Math.round(b.y) };
    if (b.pending && t >= b.pending.at) {
      if (b.pending.ok) this.catch(i, b.pending.id, t, b.pending.bet);
      else this.lassoMiss(i, b.pending.bet);
      b.pending = null;
      b.cd = t + rnd(1100, 2000);
    }
    const giant = lassoTrailing(this.p, i);
    const range = LASSO.range + (giant ? LASSO_CATCHUP.range : 0);
    const tg = b.target != null ? this.world.animals[b.target] : null;
    if (!tg || this.claimed.has(tg.id) || t > tg.t1 || (tg.kind !== 'outlaw' && animalPos(tg, t).x < b.x - 30)) {
      const cands = this.world.animals.filter((a) => {
        if (this.claimed.has(a.id) || t < a.t0 || t > a.t1) return false;
        if (a.kind === 'skunk' && Math.random() > 0.05) return false;
        const { x } = animalPos(a, t);
        // le hors-la-loi arrive par la gauche : on le guette même s'il est encore derrière
        return (a.kind === 'outlaw' ? x > -20 : x > b.x - 10) && x < W - 8;
      });
      const cost = (a) => {
        const y = animalPos(a, t).y;
        // un bot sur deux se lance aux trousses du hors-la-loi
        return Math.abs(y - b.y) + Math.abs(y - b.lane) * 0.8 - (a.kind === 'outlaw' && (i + a.id) % 2 ? 150 : 0);
      };
      b.target = cands.length ? cands.sort((a, c) => cost(a) - cost(c))[0].id : null;
    }
    if (b.target != null) {
      const a = this.world.animals[b.target];
      const fut = animalPos(a, t + 400);
      const step = LASSO.horse * 100;
      const dy = fut.y - b.y, dx = (fut.x - b.back) - b.x;
      b.y += Math.max(-step, Math.min(step, dy));
      b.x += Math.max(-step * 0.6, Math.min(step * 0.6, dx));
      b.x = Math.max(LASSO.minX, Math.min(LASSO.maxX, b.x));
      b.y = Math.max(LASSO.top, Math.min(LASSO.bottom, b.y));
      if (!b.pending && t >= b.cd) {
        const h = lassoHand(b.x, b.y);
        const aim = animalPos(a, t + 260);
        const dist = Math.hypot(aim.x - h.x, aim.y - a.r - h.y);
        if (dist < range * 0.9) {
          const fly = dist / LASSO.rope;
          const p = animalPos(a, t + fly);
          // de temps en temps, un lasso doré sur une bête bien placée
          const bet = a.pts > 0 && dist < range * 0.55 && Math.random() < 0.25;
          const skill = a.kind === 'outlaw' ? 0.12 : bet ? 0.65 : 0.5; // le hors-la-loi esquive
          b.pending = { id: a.id, at: t + fly, bet, ok: Math.random() < skill + (giant ? 0.1 : 0) };
          this.p[i].stats.throws++;
          out.th = [Math.round(p.x), Math.round(p.y - a.r)];
          if (bet) out.gb = 1;
        }
      }
    }
    this.liveOut.push({ key: this.p[i].key, d: out });
  }
}
