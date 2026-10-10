// Arbitre de « La piste » (navigateur de l'hôte). Chaque joueur mène son expédition dans son propre navigateur
// (piste.js) : l'hôte ne reçoit que sa progression (étapes franchies, dollars, bande décimée ou repaire tombé),
// tient le tableau, fait avancer les bots (une étape de temps en temps, et le risque de tomber grandit en chemin)
// et arrête la partie quand tout le monde a fini.
// Classement : étapes franchies (le repaire d'El Diablo compte pour une), puis les dollars, puis le temps.
import { MODES, HELP_MS } from './worlds.js';
import { PISTE } from './pistekit.js';

const rnd = (a, b) => a + Math.random() * (b - a);

export class PisteGame {
  constructor(players) {
    this.kind = 'piste';
    this.seed = Math.floor(Math.random() * 2 ** 31);
    this.variant = null;
    this.duration = MODES.piste.duration;
    this.p = players.map((pl) => ({
      key: pl.key, name: pl.name, character: pl.character, bot: !!pl.bot,
      score: 0, gold: 0, ms: 0, done: false, champ: false, left: false,
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
    // le compte à rebours laisse passer la cinématique d'ouverture (plus longue que celle des autres jeux), puis les règles
    const countdown = PISTE.open + HELP_MS;
    this.startAt = Date.now() + countdown;
    this.p.forEach((p) => { if (p.ai) this.botNext(p, 0); });
    this.push({ type: 'mgStart', kind: this.kind, seed: this.seed, countdown, duration: this.duration });
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
        score: p.score, gold: p.gold, done: p.done, champ: p.champ, left: p.left,
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

  // { kind: 'step', n, gold, ms } : l'étape n est franchie (n = étapes franchies depuis le départ) ;
  // { kind: 'end', n, gold, ms, champ } : l'expédition s'arrête (repaire tombé, ou bande décimée).
  act(i, a) {
    if (this.phase !== 'playing') return { error: 'La partie est terminée.' };
    if (!a || typeof a !== 'object') return { error: 'Action invalide.' };
    const p = this.p[i];
    if (p.left || p.done) return { events: [] };
    if ((a.kind !== 'step' && a.kind !== 'end') || !Number.isInteger(a.n)) return { error: 'Action inconnue.' };
    // l'étape suivante seulement (un message en double ou hors d'ordre ne compte pas) ; la fin, à l'étape où l'on est
    const n = Math.max(0, Math.min(PISTE.steps, a.n));
    if (a.kind === 'step' && n !== p.score + 1) return { events: [] };
    p.score = Math.max(p.score, n);
    p.gold = Number.isFinite(a.gold) ? Math.max(0, Math.min(99999, Math.round(a.gold))) : p.gold;
    if (Number.isFinite(a.ms)) p.ms = Math.max(0, Math.min(this.duration, Math.round(a.ms)));
    if (a.kind === 'end') {
      p.done = true;
      p.champ = !!a.champ && p.score >= PISTE.steps;
    }
    this.push({ type: a.kind, by: i, n: p.score, champ: p.champ });
    if (this.p.every((x) => x.done || x.left)) this.finish();
    return { events: this.flush() };
  }

  // Bots : une étape toutes les 50 à 110 s ; plus ils avancent, plus la bande risque d'y rester.
  botNext(p, t) {
    p.ai.at = t + rnd(50000, 110000);
  }

  tick() {
    if (this.phase !== 'playing') return [];
    const t = this.t;
    if (t >= 0) {
      this.p.forEach((p, i) => {
        if (!p.ai || p.done || p.left || t < p.ai.at) return;
        p.ms = t;
        if (Math.random() < 0.05 + p.score * 0.022) {
          p.done = true;
          this.push({ type: 'end', by: i, n: p.score, champ: false });
        } else {
          p.score++;
          p.gold += Math.round(rnd(10, 60));
          const champ = p.score >= PISTE.steps;
          if (champ) { p.done = true; p.champ = true; }
          this.push({ type: champ ? 'end' : 'step', by: i, n: p.score, champ });
          if (!champ) this.botNext(p, t);
        }
        if (this.p.every((x) => x.done || x.left)) this.finish();
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
      || (P[b].gold - P[a].gold) || (P[a].ms - P[b].ms));
    this.ranking = order;
    this.winner = order[0];
    const top = P[order[0]];
    // seul : il faut faire tomber le repaire pour gagner ; à plusieurs, le premier du classement (s'il a avancé)
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
