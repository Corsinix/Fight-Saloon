// Le mode histoire côté hôte : il tient l'état de l'aventure, fait avancer le moteur (engine.js) quand la table
// est prête, lance les épisodes (mini-jeux) et sauvegarde dans son navigateur (save.js). Chargé à la demande par net.js.
//
// À plusieurs : chacun lit les dialogues et regarde les cinématiques à son rythme, puis se dit prêt (storyReady) ;
// on avance quand tous les humains connectés le sont (ou 60 s après le premier, ou quand l'hôte passe pour tous).
// Les choix et les voyages se votent (storyVote) : clos quand tout le monde a voté ou 20 s après le premier vote ;
// la majorité l'emporte, l'hôte départage, puis l'ordre des options. Seul : tout est immédiat.
import { DATA } from './data.js';
import { next, episodeOf, allies } from './engine.js';
import { context, evaluate } from './outcomes.js';
import * as SAVE from './save.js';
import { MODES } from '../worlds.js';
import { randomCharacter } from '../data.js';
import { DECOS } from './decos/index.js';

const READY_MS = 60000;
const VOTE_MS = 20000;
const RESULT_DELAY = 4500; // fin d'un épisode : le temps de voir le classement avant le carton de l'histoire
const READY_KINDS = ['talk', 'cut', 'result', 'act', 'ending'];

export class StoryHost {
  // slot : la sauvegarde (null : table reprise d'un autre hôte, on en crée une au premier enregistrement)
  constructor(net, l, { slot = null, state }) {
    this.net = net;
    this.l = l;
    this.slot = slot;
    this.state = state;
    this.wait = null;
    this.ready = new Set();
    this.votes = new Map();
    this.deadline = 0;
    this.timer = 0;
    this.missing = new Set(); // jeux qui n'ont pas pu se charger : leurs épisodes prennent leur résultat par défaut
    this.champ = 0; // tournante du champion (jeux à deux)
    this.playing = null; // épisode en cours { ep, seq }
    this.t0 = Date.now();
    this.stopped = false;
  }

  humans() { return this.l.players.filter((p) => !p.bot && (p.key === this.l.host || p.connected)); }
  env() { return { humans: Math.max(1, this.humans().length), has: (g) => !!MODES[g] && !this.missing.has(g) }; }

  begin() { this.step(null); }

  stop() {
    this.stopped = true;
    clearTimeout(this.timer);
    this.persist();
  }

  // Fait avancer le moteur (input null : relit l'attente en cours) ; false si l'entrée ne correspond plus.
  step(input) {
    if (this.stopped) return false;
    const r = next(this.state, input, DATA, this.env());
    if (input && !r.ok) return false;
    this.state = r.state;
    this.wait = r.wait;
    this.ready.clear();
    this.votes.clear();
    this.deadline = 0;
    clearTimeout(this.timer);
    const label = r.fx.filter((f) => f.save).pop()?.save || null;
    this.persist(label);
    this.broadcast();
    if (this.wait.kind === 'play') this.launch();
    return true;
  }

  persist(label = null) {
    const now = Date.now();
    const party = this.humans().map((p) => p.name);
    try {
      if (!this.slot) {
        const name = `${this.state.bande} (reprise)`;
        this.slot = SAVE.createSlot({ name, state: this.state, party });
      } else SAVE.saveSlot(this.slot, this.state, { label, party, playMs: now - this.t0 });
      this.t0 = now;
    } catch (e) {
      this.net.deliver(this.l.host, { t: 'error', text: e.message });
    }
  }

  // ---------------------------------------------------------------- messages des joueurs
  handle(from, m, isHost) {
    if (this.stopped || !this.wait) return;
    if (m.t === 'storySkip') {
      if (!isHost) return;
      if (READY_KINDS.includes(this.wait.kind)) return this.step({ type: 'next' });
      if (this.wait.kind === 'choice' || this.wait.kind === 'map') return this.resolve(true);
      return;
    }
    if (m.seq !== this.state.seq) return; // réponse à une attente déjà passée
    if (m.t === 'storyReady' && READY_KINDS.includes(this.wait.kind)) {
      this.ready.add(from);
      if (!this.timer) this.arm(READY_MS, () => this.step({ type: 'next' }));
      return this.check();
    }
    if (m.t === 'storyVote') {
      const w = this.wait;
      const ok = w.kind === 'choice' ? w.opts.some((o) => o.id === m.id) : w.kind === 'map' && w.nodes.includes(m.id);
      if (!ok) return;
      this.votes.set(from, m.id);
      if (!this.timer) this.arm(VOTE_MS, () => this.resolve(true));
      return this.check();
    }
  }

  arm(ms, fn) {
    clearTimeout(this.timer);
    this.deadline = Date.now() + ms;
    this.timer = setTimeout(() => { this.timer = 0; if (!this.stopped) fn(); }, ms);
  }

  // Un joueur est parti ou s'est déconnecté : ceux qui restent sont peut-être tous prêts
  recount() { if (this.wait) this.check(); }

  check() {
    const keys = this.humans().map((p) => p.key);
    if (READY_KINDS.includes(this.wait.kind)) {
      if (keys.every((k) => this.ready.has(k))) return this.step({ type: 'next' });
    } else if (this.wait.kind === 'choice' || this.wait.kind === 'map') {
      if (keys.every((k) => this.votes.has(k))) return this.resolve(false);
    }
    this.broadcast();
  }

  // Dépouillement : majorité, puis le vote de l'hôte, puis l'ordre des options. force : même sans voix (minuterie, hôte)
  resolve(force) {
    const w = this.wait;
    const ids = w.kind === 'choice' ? w.opts.map((o) => o.id) : w.nodes;
    const tally = new Map();
    for (const id of this.votes.values()) tally.set(id, (tally.get(id) || 0) + 1);
    if (!tally.size) {
      // personne n'a voté : un choix prend la première option (l'hôte a passé), une destination attend
      if (force && w.kind === 'choice') this.choose(ids[0]);
      return;
    }
    const best = Math.max(...tally.values());
    const top = ids.filter((id) => tally.get(id) === best);
    const hostVote = this.votes.get(this.l.host);
    this.choose(top.includes(hostVote) ? hostVote : top[0]);
  }

  choose(id) {
    if (this.wait.kind === 'map') this.step({ type: 'travel', node: id });
    else this.step({ type: 'choose', id });
  }

  // ---------------------------------------------------------------- épisodes
  launch() {
    const id = this.wait.ep;
    const ep = episodeOf(DATA, id);
    const seq = this.state.seq;
    this.playing = { ep: id, seq };
    const { players, watchers } = this.seats(ep);
    // deco : réglages de décor propres à l'histoire, lus par la scène du mini-jeu (hooks.story.deco ; voir episodes.js)
    const meta = { ep: id, watchers, title: ep.title || '', caption: ep.caption || '', rumor: ep.rumor || '', env: ep.env || null, deco: ep.deco || DECOS[id] || null };
    // la variante : celle du décor de l'épisode s'il en impose une (story/decos), sinon celle de l'épisode
    this.net.playStory(this.l, ep.game, players, meta.deco?.variant ?? ep.variant ?? null, meta).then((ok) => {
      if (ok || this.stopped || this.playing?.seq !== seq) return;
      // l'arbitre n'a pas pu se charger : l'épisode prend son résultat par défaut
      this.playing = null;
      this.missing.add(ep.game);
      this.step(null);
    });
    this.broadcast();
  }

  // Joueurs de l'épisode : les humains (ou un champion pour les jeux à deux), puis les rivaux (bots du casting).
  seats(ep) {
    const M = MODES[ep.game];
    const H = this.humans().map((p) => ({ key: p.key, name: p.name, character: p.character, bot: false }));
    let mode = ep.seats?.mode || 'all';
    if (H.length >= M.max && mode !== 'champion' && M.max <= 2) mode = 'champion';
    let seated = H, watchers = [];
    if (mode === 'champion' && H.length > 1) {
      const k = this.champ++ % H.length;
      seated = [H[k]];
      watchers = H.filter((_, i) => i !== k).map((p) => p.key);
    } else if (mode === 'team' && H.length > Math.floor(M.max / 2)) {
      // assaut du fort : les humains forment une équipe (places paires) ; au-delà d'une demi-table, ils regardent
      const k = Math.floor(M.max / 2);
      seated = H.slice(0, k);
      watchers = H.slice(k).map((p) => p.key);
    } else if (H.length > M.max) {
      seated = H.slice(0, M.max);
      watchers = H.slice(M.max).map((p) => p.key);
    }
    const free = M.max - seated.length;
    let rivals = this.rivals(ep, mode === 'team' ? Math.min(free, seated.length) : free, seated);
    // il faut assez de joueurs pour lancer la partie : des troupes en renfort
    const pool = (ep.rivals || []).find((r) => r.pool)?.pool || 'bandit';
    while (seated.length + rivals.length < M.min) rivals.push(this.bot(pool, rivals.length, [...seated, ...rivals]));
    let players;
    if (mode === 'team') { // assaut du fort : équipes par parité de place (fortgame.js), humains d'un côté
      players = [];
      for (let i = 0; i < Math.max(seated.length, rivals.length); i++) {
        if (seated[i]) players.push(seated[i]);
        if (rivals[i]) players.push(rivals[i]);
      }
    } else players = [...seated, ...rivals];
    return { players, watchers };
  }

  rivals(ep, free, taken) {
    const out = [];
    for (const r of ep.rivals || []) {
      if (out.length >= free) break;
      if (r.cast) {
        const c = DATA.cast[r.cast];
        out.push({ key: `bot:story:${r.cast}`, name: c.short, character: { ...c.look }, bot: true, cast: true });
        continue;
      }
      let n = r.n === 'fill' || r.n == null ? free - out.length : r.n;
      n = Math.min(n, r.max ?? n, free - out.length);
      for (let k = 0; k < n; k++) out.push(this.bot(r.pool, k, [...taken, ...out]));
    }
    // chaque allié retire un rival anonyme (au moins un adversaire reste)
    const cut = (ep.allyMods?.rivals || 0) * allies(this.state, DATA).length;
    for (let k = 0; k < -cut; k++) {
      const i = out.map((b) => !b.cast).lastIndexOf(true);
      if (i < 0 || out.length <= 1) break;
      out.splice(i, 1);
    }
    return out;
  }

  bot(pool, k, taken) {
    const P = DATA.pools[pool] || DATA.pools.bandit;
    const used = new Set(taken.map((p) => p.name));
    const name = P.names.find((n, i) => !used.has(n) && i >= k % P.names.length) || P.names.find((n) => !used.has(n)) || `${P.names[0]} ${k + 2}`;
    return { key: `bot:story:${pool}:${this.state.seq}:${k}`, name, character: { ...randomCharacter(), ...P.look }, bot: true };
  }

  // Fin de l'épisode (appelé par net.js) : son résultat, après le temps de voir le classement
  onMatchEnd(g, end) {
    const p = this.playing;
    if (!p) return;
    this.playing = null;
    const ep = episodeOf(DATA, p.ep);
    const ctx = context(g, end);
    const rule = !ctx.bots.length && ep.fallback ? ep.fallback : ep.outcome;
    let label;
    try { label = evaluate(rule, ctx); } catch (e) { console.error(e); label = 'lose'; }
    setTimeout(() => {
      if (this.stopped || this.state.seq !== p.seq) return;
      this.step({ type: 'outcome', ep: p.ep, label });
    }, RESULT_DELAY);
  }

  // L'épisode a été interrompu (partie abandonnée) : on le relance
  replay() {
    if (this.wait?.kind !== 'play' || this.stopped) return;
    this.playing = null;
    this.launch();
  }

  // ---------------------------------------------------------------- vue pour les joueurs
  view() {
    const host = this.l.players.find((p) => p.key === this.l.host);
    return {
      seq: this.state.seq, wait: this.wait, playing: !!this.playing,
      ready: [...this.ready], votes: Object.fromEntries(this.votes), deadline: this.deadline ? Math.max(0, this.deadline - Date.now()) : 0,
      chef: host?.name || '', slot: this.slot?.name || this.state.bande, snap: this.state,
    };
  }

  broadcast() { this.net.deliverAll(this.l, { t: 'story', s: this.view() }); }

  // ce que l'héritier de la table reçoit (passation d'hôte)
  snapshot() { return { state: this.state, name: this.slot?.name || this.state.bande }; }
}
