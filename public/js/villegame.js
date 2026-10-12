// Arbitre de « La ville » (navigateur de l'hôte) : la simulation tourne en lockstep. L'arbitre a sa propre World (celle
// qui fait foi) ; il reçoit les commandes des joueurs (act), les date, et envoie des « tours » à toute la table :
//   { type: 'turn', seq, d, upTo, cmds: [[joueur, commande]…], sp }
// Chaque navigateur applique les commandes quand sa World arrive au jour d, puis avance jusqu'à upTo. Tous les mois,
// chacun renvoie l'empreinte de sa World (hash) ; si elle diffère, l'arbitre lui envoie un instantané (en morceaux).
// La vitesse est la plus lente demandée (la pause, seulement si tout le monde la veut) ; seul, une décision en
// attente (événement, campagne) met le jeu en pause. Les bots (et les villes dont le maire est parti ou a été battu)
// sont joués par villeai.js, dont les commandes passent dans les tours comme les autres.
import { MODES, CUT_MS, HELP_MS } from './worlds.js';
import { World, summary } from './villesim.js';
import { aiCommands } from './villeai.js';
import { MODES_VILLE, TIME } from './villekit.js';

const TURN_SOLO = 100, TURN_MP = 400; // un tour toutes les … ms
const MAX_DAYS = 24; // au plus tant de jours par tour (rattrapage après une pause de l'onglet)
const CHUNK = 24000; // taille d'un morceau d'instantané (caractères)
const CMDS = new Set(['build', 'road', 'demolish', 'toggle', 'upgrade', 'edict', 'tax', 'sell', 'choose', 'press', 'contract', 'offer', 'answer', 'gift']);

export class VilleGame {
  constructor(players, variant = null) {
    this.kind = 'ville';
    this.seed = Math.floor(Math.random() * 2 ** 31);
    this.variant = MODES_VILLE[variant] ? variant : 'rivalite';
    this.humans = players.map((p, i) => (p.bot ? -1 : i)).filter((i) => i >= 0);
    this.solo = this.humans.length <= 1;
    // seul : pas de vraie limite (la partie s'arrête en 1900, ou quand on la quitte) ; à plusieurs, 60 min au plus
    this.duration = this.solo ? 86400000 : MODES.ville.duration;
    this.p = players.map((pl) => ({ key: pl.key, name: pl.name, character: pl.character, bot: !!pl.bot, score: 0, pop: 0, done: false, left: false }));
    this.world = new World(this.seed, players.map((pl) => ({ key: pl.key, name: pl.name, bot: !!pl.bot })), this.variant);
    this.phase = 'playing';
    this.winner = null;
    this.ranking = null;
    this.events = [];
    this.liveOut = [];
    this.startAt = 0;
    this.seq = 0;
    this.queue = []; // [joueur, commande] reçues depuis le dernier tour
    this.speeds = players.map(() => 1);
    this.acc = 0; // temps de jeu écoulé (ms × vitesse)
    this.last = 0;
    this.nextTurn = 0;
    this.hashes = new Map(); // jour (début de mois) -> empreinte
    this.snapFor = new Set(); // joueurs à qui envoyer un instantané
    this.snapAt = new Map(); // joueur -> dernier envoi (pas plus d'un toutes les 5 s)
    this.aiDay = -1;
  }

  get t() { return Date.now() - this.startAt; }

  start() {
    const countdown = CUT_MS + HELP_MS;
    this.startAt = Date.now() + countdown;
    this.push({ type: 'mgStart', kind: this.kind, seed: this.seed, countdown, duration: this.duration });
    return this.flush();
  }

  flush() { const e = this.events; this.events = []; return e; }

  view(i) {
    return {
      kind: this.kind, me: i, phase: this.phase, winner: this.winner, ranking: this.ranking, variant: this.variant,
      players: this.p.map((p) => ({ key: p.key, name: p.name, character: p.character, bot: p.bot, score: p.score, pop: p.pop, done: p.done, left: p.left })),
    };
  }
  syncView(i) {
    // arrivée en cours de partie : l'instantané suit (le navigateur le demande en recevant ceci)
    return { ...this.view(i), seed: this.seed, duration: this.duration, elapsed: this.t, day: this.world.day };
  }
  push(ev) {
    ev.dur = 0;
    ev.states = this.p.map((_, i) => this.view(i));
    this.events.push(ev);
  }

  // ---------------------------------------------------------- actions des joueurs
  act(i, a) {
    if (this.phase !== 'playing') return { error: 'La partie est terminée.' };
    if (!a || typeof a !== 'object') return { error: 'Action invalide.' };
    const p = this.p[i];
    if (!p || p.left) return { events: [] };
    switch (a.kind) {
      case 'ready': return { events: [] };
      case 'cmd': {
        const c = a.c;
        if (!c || typeof c !== 'object' || !CMDS.has(c.c)) return { error: 'Commande inconnue.' };
        if (JSON.stringify(c).length > 4000) return { error: 'Commande trop longue.' };
        this.queue.push([i, c]);
        if (this.solo) this.nextTurn = 0; // seul : la commande part tout de suite
        return { events: [] };
      }
      case 'speed': this.speeds[i] = Math.max(0, Math.min(3, a.v | 0)); return { events: [] };
      case 'hash': {
        const h = this.hashes.get(a.d | 0);
        if (h != null && h !== a.h >>> 0) this.snapFor.add(i);
        return { events: [] };
      }
      case 'snap': this.snapFor.add(i); return { events: [] };
      case 'load': {
        // seul (ou l'hôte, s'il a la même table) : charger une sauvegarde remplace la World de tout le monde
        if (i !== this.humans[0]) return { error: 'Seul l\'hôte peut charger une partie.' };
        try {
          const w = World.load(JSON.parse(a.data));
          if (w.players.length !== this.p.length) return { error: 'Cette sauvegarde n\'a pas le même nombre de maires.' };
          // les maires de la sauvegarde reprennent leur ville par leur pseudo ; les autres places, dans l'ordre
          w.players = w.players.map((pl, k) => ({ ...pl, key: this.p[k].key, name: this.p[k].name, bot: this.p[k].bot }));
          this.world = w;
          this.acc = w.day * TIME.dayMs;
          this.hashes.clear();
          this.queue = [];
          this.aiDay = -1;
          this.p.forEach((_, k) => this.snapFor.add(k));
          this.snapAt.clear();
          this.updateScores();
        } catch (e) { return { error: 'Sauvegarde illisible.' }; }
        return { events: this.flush() };
      }
      default: return { error: 'Action inconnue.' };
    }
  }

  // vitesse commune : seul, la sienne ; à plusieurs, la plus lente de celles qui ne sont pas « pause »,
  // et la pause seulement si tous les présents la demandent
  speed() {
    const alive = this.humans.filter((i) => !this.p[i].left);
    if (!alive.length) return 1;
    const sp = alive.map((i) => this.speeds[i]);
    let v = sp.every((s) => s === 0) ? 0 : Math.min(...sp.filter((s) => s > 0));
    // seul : une décision à prendre (événement, campagne) met en pause
    if (this.solo && this.world.towns[alive[0]]?.pending.length) v = 0;
    return v;
  }

  // ---------------------------------------------------------- horloge
  tick() {
    if (this.phase !== 'playing') return [];
    const now = Date.now();
    const t = this.t;
    if (t < 0) { this.last = now; return this.flush(); }
    const dt = Math.min(1000, Math.max(0, now - (this.last || now)));
    this.last = now;
    const sp = this.speed();
    this.acc += dt * sp;
    const w = this.world;
    if (now >= this.nextTurn) {
      this.nextTurn = now + (this.solo ? TURN_SOLO : TURN_MP);
      const from = w.day;
      const cmds = this.queue.splice(0);
      // les maires IA jouent en début de mois
      if (from % TIME.month === 0 && this.aiDay !== from) {
        this.aiDay = from;
        w.towns.forEach((town, p) => {
          if (!this.p[p].bot && !this.p[p].left && !town.ghost) return;
          for (const c of aiCommands(w, p)) cmds.push([p, c]);
        });
      }
      for (const [p, c] of cmds) w.apply(p, c);
      const target = Math.floor(this.acc / TIME.dayMs);
      const upTo = Math.min(Math.max(from, target), from + MAX_DAYS);
      if (upTo - from === MAX_DAYS) this.acc = Math.min(this.acc, (upTo + 2) * TIME.dayMs);
      while (w.day < upTo && !w.result) {
        // le premier jour de chaque mois : les commandes de l'IA tombent pile au jour où elles ont été décidées
        w.step();
        if (w.day % TIME.month === 0) {
          this.hashes.set(w.day, w.hash());
          if (this.hashes.size > 30) this.hashes.delete(this.hashes.keys().next().value);
          this.updateScores();
          break; // on s'arrête en début de mois : l'IA joue au tour suivant, au même jour pour tout le monde
        }
      }
      w.ev.length = 0;
      if (cmds.length || w.day !== from || this.seq === 0 || now - (this.lastSent || 0) > 1500) {
        this.lastSent = now;
        this.push({ type: 'turn', seq: ++this.seq, d: from, upTo: w.day, cmds, sp });
      }
      this.sendSnaps(now);
      if (w.result) this.finish();
    }
    if (this.phase === 'playing' && t >= this.duration + 400) this.finish();
    return this.flush();
  }

  updateScores() {
    const w = this.world;
    this.p.forEach((p, i) => { p.score = w.score(i); p.pop = w.towns[i].stat.pop; p.done = !!w.towns[i].lost; });
  }

  // instantané en morceaux, chacun privé au joueur concerné (les autres n'en voient qu'une coquille vide)
  sendSnaps(now) {
    for (const i of [...this.snapFor]) {
      if (now - (this.snapAt.get(i) || 0) < 5000) continue;
      this.snapFor.delete(i);
      this.snapAt.set(i, now);
      const data = JSON.stringify(this.world.serialize());
      const n = Math.ceil(data.length / CHUNK);
      const id = `${this.seq}:${i}:${now}`;
      for (let k = 0; k < n; k++) {
        this.push({ type: 'snap', private: { to: i, data: { id, k, n, seq: this.seq, part: data.slice(k * CHUNK, (k + 1) * CHUNK) } } });
      }
    }
  }

  // ---------------------------------------------------------- fin
  finish() {
    if (this.phase !== 'playing') return;
    this.phase = 'over';
    this.updateScores();
    const w = this.world, P = this.p;
    const res = w.result;
    const order = res?.ranking?.length === P.length ? res.ranking
      : P.map((_, i) => i).sort((a, b) => (P[a].left - P[b].left) || (!!w.towns[a].lost - !!w.towns[b].lost) || (P[b].score - P[a].score) || a - b);
    this.ranking = order;
    this.winner = order[0];
    let winners;
    if (res) winners = res.winners;
    else if (P.length === 1) winners = []; // seul, arrêté avant 1900 : pas de victoire
    else winners = !P[order[0]].left && !w.towns[order[0]].lost ? [order[0]] : [];
    if (MODES_VILLE[this.variant].coop && res) winners = res.winners;
    this.push({ type: 'matchEnd', winner: this.winner, ranking: order, winners, tie: false, reason: res?.reason || 'temps', summary: summary(w, 0) });
  }

  leave(i) {
    if (this.phase !== 'playing' || !this.p[i]) return [];
    this.p[i].left = true;
    // sa ville continue, gérée par l'IA
    if (this.world.towns[i]) this.world.towns[i].ghost = true;
    this.push({ type: 'left', who: i });
    if (this.humans.every((k) => this.p[k].left)) this.finish();
    return this.flush();
  }

  forfeit(i) {
    if (this.phase !== 'playing' || !this.p[i]) return [];
    this.p[i].left = true;
    if (this.solo || this.humans.every((k) => this.p[k].left)) this.finish();
    else if (this.world.towns[i]) this.world.towns[i].ghost = true;
    return this.flush();
  }
}
