// IA du mode solo. Elle ne triche pas : elle ne connaît que ce qu'un joueur verrait
// (chargement annoncé, cartouches éjectées) plus ses propres infos secrètes (longue-vue, télégramme).
import { randomCharacter } from './data.js';

const NAMES = ['Le Croque-mort', 'El Tuerto', 'Calamity Rose', 'Vieux Jeb', 'Hank la Gâchette', 'Señor Mezcal', 'Doc Vautour', 'Miss Dynamite'];

const LINES = {
  hitOpp: ['Rien de personnel, l’ami.', 'Un de moins.', 'Ça pique, hein ?', 'Le fusil m’aime bien ce soir.', 'Mes amitiés à El Diablo, là-dessous.'],
  selfBlank: ['Hé hé… encore à moi.', 'Je savais qu’elle était blanche.', 'El Diablo me sourit.', 'Même El Diablo n’a pas cette chance.'],
  gotHit: ['Argh ! Tu vas me le payer.', 'Ouch… joli coup.', 'Simple égratignure !', 'Tu commences à m’agacer.'],
  oppMiss: ['Raté, cowboy.', 'Pas de chance.', 'Tes mains tremblent ?'],
  win: ['Le saloon est à moi.', 'Reviens quand tu sauras tenir un fusil.', 'Un verre pour le vainqueur !', 'El Diablo lui-même n’aurait pas fait mieux.'],
  lose: ['Bien joué… pour cette fois.', 'Tu as eu de la chance, gamin.', 'Je veux ma revanche.', 'File, avant qu’El Diablo apprenne que j’ai perdu.'],
};

const rnd = (n) => Math.floor(Math.random() * n);
const pick = (arr) => arr[rnd(arr.length)];

function botPlayer(code) {
  const character = randomCharacter();
  return { key: `bot:${code}`, name: pick(NAMES), character, bot: true };
}

class Bot {
  constructor(idx) {
    this.idx = idx;
    this.known = {}; // index absolu de cartouche dans le chargement -> réelle ?
  }

  // Met à jour ce que le bot sait à partir des événements de la partie.
  observe(events) {
    for (const ev of events) {
      if (ev.type === 'load' || ev.type === 'roundStart') { this.known = {}; continue; }
      // le crieur du saloon annonce une cartouche à tout le monde
      if (ev.type === 'saloon' && ev.id === 'crieur') { this.known[ev.states[this.idx].spent.length + ev.pos - 1] = ev.live; continue; }
      if (ev.type !== 'item') continue;
      const base = ev.states[this.idx].spent.length;
      if (ev.private && ev.private.to === this.idx) {
        const d = ev.private.data;
        if (ev.item === 'spyglass') this.known[base] = d.live;
        else if (ev.item === 'telegraph' && !d.none) this.known[base + d.pos - 1] = d.live;
      }
      if (ev.item === 'coin' && base in this.known) this.known[base] = !this.known[base];
    }
  }

  decide(st) {
    const me = st.players[this.idx];
    const op = st.players[1 - this.idx];
    const base = st.spent.length;
    const liveSpent = st.spent.filter(Boolean).length;
    let live = st.load.live - liveSpent;
    let blank = st.load.blank - (st.spent.length - liveSpent);
    let cur = this.known[base];
    for (const [k, v] of Object.entries(this.known)) {
      if (+k > base) v ? live-- : blank--;
    }
    if (cur === undefined && live <= 0) cur = false;
    if (cur === undefined && blank <= 0) cur = true;
    const pLive = cur === undefined ? live / (live + blank) : cur ? 1 : 0;
    const unsure = pLive > 0 && pLive < 1;
    const hurt = me.maxHp - me.hp;

    // Objet à soi, sinon volé au lasso.
    const use = (item) => {
      if (item === 'saw' && st.sawed) return null;
      if (item === 'cuffs' && op.cuffed) return null;
      if (item === 'horseshoe' && me.lucky) return null;
      const slot = me.items.indexOf(item);
      if (slot >= 0) return { kind: 'item', slot };
      const lasso = me.items.indexOf('lasso');
      const steal = op.items.indexOf(item);
      if (lasso >= 0 && steal >= 0 && item !== 'lasso') return { kind: 'item', slot: lasso, steal };
      return null;
    };
    const shoot = (target) => ({ kind: 'shoot', target });
    let a;

    if (me.items.length <= 2 && (a = use('ace'))) return a;
    if (hurt >= 1 && (a = use('cigar'))) return a;
    if (!me.lucky && (me.hp <= 2 || pLive >= 0.5) && (a = use('horseshoe'))) return a;
    if ((op.hp <= 2 || Math.random() < 0.5) && (a = use('derringer'))) return a;
    if (unsure && (a = use('spyglass'))) return a;
    if (hurt >= 2 && me.hp >= 2 && (a = use('remedy'))) return a;
    if (st.shellsLeft >= 2 && (a = use('cuffs'))) return a;
    if (unsure && st.shellsLeft >= 3 && (a = use('telegraph'))) return a;
    // pari : seulement quand il est sûr de lui (et pas à 1 PV, sauf certitude)
    const pubLive = st.load.live - liveSpent, pubBlank = st.load.blank - (st.spent.length - liveSpent);
    if (me.canBet && pubLive > 0 && pubBlank > 0 && (pLive >= 0.85 || pLive <= 0.15) && (me.hp >= 2 || !unsure)) return { kind: 'bet', live: pLive > 0.5 };

    if (pLive === 0) return use('coin') || shoot('self');
    if (pLive === 1) return use('saw') || shoot('opp');
    if (pLive < 0.5) return use('whisky') || shoot('self');
    if (pLive >= 0.75 && (a = use('saw'))) return a;
    return shoot('opp');
  }

  // Petite réplique éventuelle après une série d'événements : { text, delay } ou null.
  react(events) {
    let t = 0;
    for (const ev of events) {
      t += ev.dur || 0;
      let key = null;
      if (ev.type === 'matchEnd' && !ev.forfeit) key = ev.winner === this.idx ? 'win' : 'lose';
      else if (ev.type === 'shoot' && Math.random() < 0.4) {
        const mine = ev.by === this.idx;
        if (mine && ev.live && ev.target !== this.idx) key = 'hitOpp';
        else if (mine && !ev.live && ev.target === this.idx) key = 'selfBlank';
        else if (!mine && ev.live && ev.target === this.idx) key = 'gotHit';
        else if (!mine && !ev.live && ev.target === this.idx) key = 'oppMiss';
      }
      if (key) return { text: pick(LINES[key]), delay: t };
    }
    return null;
  }
}

export { Bot, botPlayer };
