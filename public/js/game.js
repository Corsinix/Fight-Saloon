// Logique d'une partie, exécutée dans le navigateur de l'hôte de la table.
// Chaque action produit une liste d'événements ; chaque événement embarque l'état
// vu par chaque joueur juste après lui, pour que le client puisse l'animer puis l'appliquer.
import { CUT_MS } from './worlds.js';

const ITEMS = ['spyglass', 'cigar', 'whisky', 'saw', 'cuffs', 'telegraph', 'coin', 'remedy', 'lasso', 'horseshoe', 'ace', 'derringer'];
const ROUNDS = [
  { hp: 3, items: 2 },
  { hp: 4, items: 3 },
  { hp: 5, items: 4 },
];
const MAX_ITEMS = 4;
const WINS_NEEDED = 2;
// Événements de saloon : ils tombent au hasard à un rechargement et changent la donne pour les deux.
const EVENTS = ['tournee', 'sherif', 'bagarre', 'pianiste', 'poker', 'crieur', 'canicule', 'ivrogne'];
const EVENT_CHANCE = 0.4;

const rand = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

class Game {
  constructor(players) {
    this.p = players.map((pl) => ({
      key: pl.key,
      name: pl.name,
      character: pl.character,
      hp: 0, maxHp: 0, items: [], cuffed: false, lucky: false, wins: 0,
      betLoad: -1, mercy: false, // dernier chargement où il a parié ; fer à cheval offert dans la manche
      stats: { shots: 0, selfShots: 0, hits: 0 },
    }));
    this.round = -1;
    this.loadNo = 0;
    this.cuffLock = -1; // a menotté l'adversaire, qui vient de passer son tour : pas de nouvelles menottes avant qu'il ait rejoué
    this.bets = []; // paris en cours : { by, live, shot } (shot = n° absolu de la cartouche visée)
    this.shells = [];
    this.spent = [];
    this.load = { live: 0, blank: 0 };
    this.turn = 0;
    this.sawed = false;
    this.phase = 'playing';
    this.winner = null;
    this.events = [];
    this.seed = Math.floor(Math.random() * 2 ** 31); // lieu et ambiance de la partie (room.js)
  }

  start() {
    this.push({ type: 'intro', dur: CUT_MS }); // cinématique d'ouverture (cutscene.js)
    this.startRound();
    return this.flush();
  }

  flush() {
    const e = this.events;
    this.events = [];
    return e;
  }

  view(i) {
    return {
      me: i,
      players: this.p.map((p, j) => ({
        name: p.name, character: p.character, hp: p.hp, maxHp: p.maxHp,
        items: [...p.items], cuffed: p.cuffed, lucky: p.lucky, wins: p.wins,
        canBet: p.betLoad !== this.loadNo,
        bet: this.bets.find((b) => b.by === j)?.live ?? null,
      })),
      turn: this.turn,
      round: this.round + 1,
      sawed: this.sawed,
      cuffLock: this.cuffLock,
      shellsLeft: this.shells.length,
      spent: [...this.spent],
      load: { ...this.load },
      phase: this.phase,
      winner: this.winner,
      seed: this.seed,
    };
  }

  push(ev) {
    ev.states = [this.view(0), this.view(1)];
    this.events.push(ev);
  }

  // first : le perdant de la manche précédente commence ; à la première manche, pile ou face.
  startRound(first = null) {
    this.round++;
    const cfg = ROUNDS[Math.min(this.round, ROUNDS.length - 1)];
    for (const p of this.p) {
      p.maxHp = cfg.hp;
      p.hp = cfg.hp;
      p.items = [];
      p.cuffed = false;
      p.lucky = false;
      p.mercy = false;
    }
    this.cuffLock = -1;
    this.bets = [];
    const loserStarts = first != null;
    this.turn = loserStarts ? first : Math.random() < 0.5 ? 0 : 1;
    this.push({ type: 'roundStart', round: this.round + 1, first: this.turn, loserStarts, dur: loserStarts ? 2600 : 3600 });
    this.newLoad();
  }

  newLoad() {
    const cfg = ROUNDS[Math.min(this.round, ROUNDS.length - 1)];
    const total = rand(2, 8);
    const live = rand(Math.max(1, Math.floor(total / 3)), Math.min(total - 1, Math.ceil((total * 2) / 3)));
    this.shells = shuffle([...Array(live).fill(true), ...Array(total - live).fill(false)]);
    this.spent = [];
    this.load = { live, blank: total - live };
    this.sawed = false;
    this.loadNo++;
    this.bets = [];
    const gave = this.p.map((p) => {
      const n = Math.min(cfg.items, MAX_ITEMS - p.items.length);
      const got = [];
      for (let k = 0; k < n; k++) got.push(pick(ITEMS));
      p.items.push(...got);
      return got;
    });
    // Coup de pouce : celui qui est à la traîne reçoit un objet de plus ; à 1 PV, un fer à cheval (une fois par manche).
    const help = this.underdog();
    if (help >= 0) {
      const p = this.p[help];
      if (p.items.length < MAX_ITEMS) {
        const it = p.hp === 1 && !p.mercy && !p.lucky ? 'horseshoe' : pick(ITEMS);
        if (it === 'horseshoe' && p.hp === 1) p.mercy = true;
        p.items.push(it);
        gave[help].push(it);
      }
    }
    this.push({ type: 'load', live, blank: total - live, gave, help, dur: 1800 + total * 380 + 1400 });
    if (this.loadNo > 1 && Math.random() < EVENT_CHANCE) this.saloonEvent();
  }

  // Joueur à la traîne (moins de manches gagnées, puis moins de PV), ou -1 si égalité.
  underdog() {
    const [a, b] = this.p;
    const gap = (b.wins - a.wins) * 2 + (b.hp - a.hp);
    return gap >= 1 ? 0 : gap <= -1 ? 1 : -1;
  }

  eventOk(id) {
    const [a, b] = this.p;
    switch (id) {
      case 'tournee': return a.hp < a.maxHp || b.hp < b.maxHp;
      case 'sherif': return a.items.length + b.items.length > 0;
      case 'bagarre': return a.items.join() !== b.items.join();
      case 'poker': return a.items.length < MAX_ITEMS || b.items.length < MAX_ITEMS;
      case 'crieur': case 'ivrogne': return this.shells.length >= 2;
      default: return true;
    }
  }

  saloonEvent() {
    const id = pick(EVENTS.filter((e) => this.eventOk(e)));
    const ev = { type: 'saloon', id, dur: 3400 };
    switch (id) {
      case 'tournee': for (const p of this.p) p.hp = Math.min(p.maxHp, p.hp + 1); break;
      case 'sherif': ev.taken = this.p.map((p) => (p.items.length ? p.items.splice(Math.floor(Math.random() * p.items.length), 1)[0] : null)); break;
      case 'bagarre': [this.p[0].items, this.p[1].items] = [this.p[1].items, this.p[0].items]; break;
      case 'pianiste': this.turn = 1 - this.turn; this.cuffLock = -1; break; // la main change : l'adversaire rejoue
      case 'poker': ev.drew = this.p.map((p) => { if (p.items.length >= MAX_ITEMS) return null; const it = pick(ITEMS); p.items.push(it); return it; }); break;
      case 'crieur': { const pos = rand(0, this.shells.length - 1); ev.pos = pos + 1; ev.live = this.shells[pos]; break; }
      case 'canicule': this.sawed = true; break;
      case 'ivrogne': { const live = this.shells.shift(); this.spent.push(live); ev.ejected = live; break; }
    }
    this.push(ev);
  }

  // Pari sur la cartouche dans la chambre : une fois par chargement, ne coûte pas le tour.
  bet(i, live) {
    const p = this.p[i];
    if (!this.shells.length) return 'Le fusil est vide.';
    if (p.betLoad === this.loadNo) return 'Un seul pari par chargement, cowboy.';
    // pas de pari gagné d'avance : il faut qu'il reste des deux couleurs (d'après ce qui a été annoncé)
    const liveSpent = this.spent.filter(Boolean).length;
    if (this.load.live - liveSpent <= 0 || this.load.blank - (this.spent.length - liveSpent) <= 0) return 'Pas de pari quand toutes les cartouches restantes sont de la même couleur.';
    p.betLoad = this.loadNo;
    this.bets.push({ by: i, live: !!live, shot: this.spent.length });
    this.push({ type: 'bet', by: i, live: !!live, dur: 1700 });
    return null;
  }

  // Une cartouche vient de quitter le fusil (tir ou éjection) : on règle les paris qui la visaient.
  settleBets(live) {
    const idx = this.spent.length - 1;
    for (const b of this.bets.filter((x) => x.shot === idx)) {
      const p = this.p[b.by];
      const win = b.live === live;
      let gain = null;
      if (win) {
        if (p.hp < p.maxHp) { p.hp++; gain = 'hp'; } else if (p.items.length < MAX_ITEMS) { gain = pick(ITEMS); p.items.push(gain); }
      } else p.hp = Math.max(0, p.hp - 1);
      this.push({ type: 'betResult', by: b.by, win, live, gain, dur: 2300 });
    }
    this.bets = this.bets.filter((x) => x.shot !== idx);
  }

  // Quelqu'un est tombé (tir ou pari perdu) ? first : celui à départager en priorité.
  checkDead(first = -1) {
    const dead = first >= 0 && this.p[first].hp <= 0 ? first : this.p.findIndex((p) => p.hp <= 0);
    if (dead < 0) return false;
    this.endRound(1 - dead);
    return true;
  }

  // Passe le tour à l'adversaire, sauf s'il est menotté : il passe alors son tour, et on ne pourra pas
  // le remenotter avant qu'il ait rejoué (pas de menottes à la chaîne).
  passTurn(i) {
    const o = 1 - i;
    if (this.p[o].cuffed) {
      this.p[o].cuffed = false;
      this.cuffLock = i;
      this.turn = i;
      return true;
    }
    this.cuffLock = -1;
    this.turn = o;
    return false;
  }

  endRound(winner) {
    const w = this.p[winner];
    w.wins++;
    if (w.wins >= WINS_NEEDED) {
      this.phase = 'over';
      this.winner = winner;
      this.push({ type: 'matchEnd', winner, dur: 1200 });
    } else {
      this.push({ type: 'roundEnd', winner, dur: 3400 });
      this.startRound(1 - winner);
    }
  }

  forfeit(loser) {
    if (this.phase !== 'playing') return [];
    this.phase = 'over';
    this.winner = 1 - loser;
    this.push({ type: 'matchEnd', winner: this.winner, forfeit: true, dur: 800 });
    return this.flush();
  }

  act(i, a) {
    if (this.phase !== 'playing') return { error: 'La partie est terminée.' };
    if (this.turn !== i) return { error: "Ce n'est pas ton tour, cowboy." };
    if (!a || typeof a !== 'object') return { error: 'Action invalide.' };
    let err = null;
    if (a.kind === 'shoot') err = this.shoot(i, a.target === 'self' ? i : 1 - i);
    else if (a.kind === 'item') err = this.useItem(i, a.slot, a.steal);
    else if (a.kind === 'bet') err = this.bet(i, a.live);
    else err = 'Action inconnue.';
    if (err) {
      this.events = [];
      return { error: err };
    }
    return { events: this.flush() };
  }

  shoot(i, t) {
    if (!this.shells.length) return 'Le fusil est vide.';
    const live = this.shells.shift();
    let dmg = live ? (this.sawed ? 2 : 1) : 0;
    // fer à cheval : la balle ne fait rien, et le porte-bonheur est usé
    const lucky = dmg > 0 && this.p[t].lucky;
    if (lucky) { this.p[t].lucky = false; dmg = 0; }
    const sawed = this.sawed;
    this.sawed = false;
    this.spent.push(live);
    const shooter = this.p[i];
    shooter.stats.shots++;
    if (t === i) shooter.stats.selfShots++;
    if (live && t !== i) shooter.stats.hits++;
    this.p[t].hp = Math.max(0, this.p[t].hp - dmg);

    // on garde le fusil sur un blanc contre soi ou une balle réelle dans l'adversaire
    const keep = t === i ? !live : live;
    let skipped = false;
    if (!keep) skipped = this.passTurn(i);
    const suspense = rand(500, 1500);
    this.push({ type: 'shoot', by: i, target: t, live, dmg, lucky, sawed, skipped, suspense, dur: 3000 + suspense });
    this.settleBets(live);

    if (!this.checkDead(t) && !this.shells.length) this.newLoad();
    return null;
  }

  useItem(i, slot, steal) {
    const me = this.p[i];
    const opp = this.p[1 - i];
    const item = me.items[slot];
    if (!item) return 'Objet introuvable.';

    if (item === 'lasso') {
      const stolen = opp.items[steal];
      if (!stolen) return "Choisis un objet de l'adversaire à attraper au lasso.";
      if (stolen === 'lasso') return 'Impossible de voler un lasso avec un lasso !';
      const err = this.checkItem(i, stolen);
      if (err) return err;
      me.items.splice(slot, 1);
      opp.items.splice(steal, 1);
      this.push({ type: 'item', by: i, item: 'lasso', stolen, stealSlot: steal, dur: 2400 });
      this.applyItem(i, stolen, true);
      return null;
    }

    const err = this.checkItem(i, item);
    if (err) return err;
    me.items.splice(slot, 1);
    this.applyItem(i, item, false);
    return null;
  }

  checkItem(i, item) {
    if (item === 'saw' && this.sawed) return 'Le canon est déjà scié.';
    if (item === 'cuffs' && this.p[1 - i].cuffed) return "L'adversaire est déjà menotté.";
    if (item === 'cuffs' && this.cuffLock === i) return "Pas de menottes deux fois de suite : laisse d'abord rejouer ton adversaire.";
    if (item === 'horseshoe' && this.p[i].lucky) return 'Ton fer à cheval te protège déjà.';
    return null;
  }

  applyItem(i, item, viaLasso) {
    const me = this.p[i];
    const base = { type: 'item', by: i, item, viaLasso };
    switch (item) {
      case 'spyglass':
        this.push({ ...base, private: { to: i, data: { live: this.shells[0] } }, dur: 3000 });
        break;
      case 'cigar': {
        const healed = me.hp < me.maxHp;
        if (healed) me.hp++;
        this.push({ ...base, healed, dur: 3000 });
        break;
      }
      case 'whisky': {
        const live = this.shells.shift();
        this.spent.push(live);
        this.push({ ...base, ejected: live, dur: 3000 });
        this.settleBets(live);
        if (!this.checkDead() && !this.shells.length) this.newLoad();
        break;
      }
      case 'saw':
        this.sawed = true;
        this.push({ ...base, dur: 2600 });
        break;
      case 'cuffs':
        this.p[1 - i].cuffed = true;
        this.push({ ...base, dur: 2800 });
        break;
      case 'telegraph': {
        let data;
        if (this.shells.length < 2) data = { none: true };
        else {
          const pos = rand(1, this.shells.length - 1);
          data = { pos: pos + 1, live: this.shells[pos] };
        }
        this.push({ ...base, private: { to: i, data }, dur: 3400 });
        break;
      }
      case 'coin':
        this.shells[0] = !this.shells[0];
        this.push({ ...base, dur: 2600 });
        break;
      case 'remedy': {
        const ok = Math.random() < 0.5;
        if (ok) me.hp = Math.min(me.maxHp, me.hp + 2);
        else me.hp = Math.max(0, me.hp - 1);
        this.push({ ...base, ok, dur: 3200 });
        if (me.hp <= 0) this.endRound(1 - i);
        break;
      }
      case 'horseshoe':
        me.lucky = true;
        this.push({ ...base, dur: 2600 });
        break;
      case 'ace': {
        const n = Math.min(2, MAX_ITEMS - me.items.length);
        const drew = [];
        for (let k = 0; k < n; k++) drew.push(pick(ITEMS.filter((x) => x !== 'ace')));
        me.items.push(...drew);
        this.push({ ...base, drew, dur: 2800 });
        break;
      }
      case 'derringer': {
        const opp = this.p[1 - i];
        const hit = Math.random() < 0.5;
        if (hit) opp.hp = Math.max(0, opp.hp - 1);
        this.push({ ...base, hit, dur: 2800 });
        if (opp.hp <= 0) this.endRound(i);
        break;
      }
    }
  }
}

// Version d'un événement envoyée au joueur j : son état + ses infos secrètes uniquement.
function personalize(ev, j) {
  const { states, private: priv, ...rest } = ev;
  const out = { ...rest, state: states[j] };
  if (priv) {
    if (priv.to === j) Object.assign(out, priv.data, { secret: true });
    else out.hidden = true;
  }
  return out;
}

export { Game, personalize, ITEMS };
