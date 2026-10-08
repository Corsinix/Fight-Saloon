// Arbitre de « La bagarre » (navigateur de l'hôte). Chaque joueur mène sa tournée de combats dans son propre
// navigateur (bagarre.js) et n'annonce que le résultat de chaque combat ; l'hôte tient le tableau, fait
// boxer les bots (une durée et une issue tirées au sort par combat) et arrête la partie quand tout le monde a fini.
// Classement : adversaires battus, puis le moins de défaites, puis le temps passé sur le ring.
import { MODES, COUNTDOWN, BAGARRE } from './worlds.js';

const rnd = (a, b) => a + Math.random() * (b - a);
const HOW = ['KO', 'TKO', 'DEC'];

export class BagarreGame {
  constructor(players) {
    this.kind = 'bagarre';
    this.seed = Math.floor(Math.random() * 2 ** 31);
    this.variant = null;
    this.duration = MODES.bagarre.duration;
    this.p = players.map((pl) => ({
      key: pl.key, name: pl.name, character: pl.character, bot: !!pl.bot,
      score: 0, losses: 0, ms: 0, done: false, champ: false, left: false,
      ai: pl.bot ? { at: 0 } : null,
    }));
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
    this.p.forEach((p, i) => { if (p.ai) this.botNext(i, 0); });
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
      kind: this.kind, me: i, phase: this.phase, winner: this.winner, ranking: this.ranking, variant: null,
      players: this.p.map((p) => ({
        key: p.key, name: p.name, character: p.character, bot: p.bot,
        score: p.score, losses: p.losses, ms: p.ms, done: p.done, champ: p.champ, left: p.left,
      })),
    };
  }

  syncView(i) {
    return { ...this.view(i), seed: this.seed, duration: this.duration, elapsed: this.t };
  }

  push(ev) {
    ev.dur = 0;
    ev.states = this.p.map((_, i) => this.view(i));
    this.events.push(ev);
  }

  // { kind: 'bout', n, win, how, ms } : fin du combat contre l'adversaire n (0 = le premier)
  act(i, a) {
    if (this.phase !== 'playing') return { error: 'La partie est terminée.' };
    if (!a || typeof a !== 'object') return { error: 'Action invalide.' };
    const p = this.p[i];
    if (p.left || p.done) return { events: [] };
    if (a.kind !== 'bout' || !Number.isInteger(a.n) || typeof a.win !== 'boolean') return { error: 'Action inconnue.' };
    if (a.n !== p.score) return { events: [] }; // combat déjà compté (message en double) ou hors d'ordre
    const ms = Number.isFinite(a.ms) ? Math.max(0, Math.min(BAGARRE.rounds * BAGARRE.round * 2, Math.round(a.ms))) : 0;
    this.bout(i, a.win, HOW.includes(a.how) ? a.how : 'DEC', ms);
    return { events: this.flush() };
  }

  bout(i, win, how, ms) {
    const p = this.p[i], n = p.score;
    p.ms += ms;
    if (win) p.score++;
    else p.losses++;
    if (p.score >= BAGARRE.fighters) { p.done = true; p.champ = true; }
    if (p.losses >= BAGARRE.lives) p.done = true;
    this.push({ type: 'bout', by: i, n, win, how });
    if (this.p.every((x) => x.done || x.left)) this.finish();
  }

  // Bots : un combat dure de 40 s à 2 min 30 ; plus l'adversaire est fort, plus le bot a de chances de tomber.
  botNext(i, t) {
    const p = this.p[i];
    p.ai.ms = Math.round(rnd(40000, 150000));
    p.ai.at = t + p.ai.ms + 9000; // présentation de l'adversaire et pauses entre les rounds
  }

  tick() {
    if (this.phase !== 'playing') return [];
    const t = this.t;
    if (t >= 0) {
      this.p.forEach((p, i) => {
        if (!p.ai || p.done || p.left || t < p.ai.at) return;
        const win = Math.random() < 0.88 - p.score * 0.13;
        const how = win ? (Math.random() < 0.6 ? 'KO' : Math.random() < 0.5 ? 'TKO' : 'DEC') : Math.random() < 0.7 ? 'KO' : 'DEC';
        this.bout(i, win, how, p.ai.ms);
        if (!p.done && this.phase === 'playing') this.botNext(i, t);
      });
    }
    if (this.phase === 'playing' && t >= this.duration + 400) this.finish();
    return this.flush();
  }

  finish() {
    if (this.phase !== 'playing') return;
    this.phase = 'over';
    const P = this.p;
    const order = P.map((_, i) => i).sort((a, b) => (P[a].left - P[b].left) || (P[b].score - P[a].score)
      || (P[a].losses - P[b].losses) || (P[a].ms - P[b].ms));
    this.ranking = order;
    this.winner = order[0];
    const top = P[order[0]];
    // seul : il faut être champion pour gagner ; à plusieurs, le premier du classement (s'il a battu quelqu'un)
    const winners = P.length === 1 ? (top.champ ? [0] : []) : !top.left && top.score > 0 ? [order[0]] : [];
    this.push({ type: 'matchEnd', winner: this.winner, ranking: order, winners, tie: false });
  }

  leave(i) {
    if (this.phase !== 'playing' || !this.p[i]) return [];
    this.p[i].left = true;
    this.push({ type: 'left', who: i });
    if (this.p.every((x) => x.done || x.left)) this.finish();
    return this.flush();
  }

  forfeit(i) {
    if (this.phase !== 'playing' || !this.p[i]) return [];
    this.p[i].left = true;
    this.finish();
    return this.flush();
  }
}
