// Mini-jeu « La pinte » : chacun son tour, on fait glisser sa chope le long du comptoir.
// Premier clic : on bloque l'aiguille de direction ; second clic : on bloque la jauge de puissance.
// La glissade est simulée ici pas à pas, exactement comme chez l'hôte (pintegame.js).
import * as S from './sprites.js';
import { sfx } from './audio.js';
import { canvasText } from './scene.js';
import { MiniScene, pixelSprite } from './miniscene.js';
import { Room } from './room.js';
import { W } from './worlds.js';
import { PINTE, Slide, gapCm, BEERS, beerOf, modName, modLabel, MODS } from './pintegame.js';

const P = PINTE;
const OUT = S.OUT;
const X0 = 30, TOP = 122; // bout gauche du comptoir et bord arrière, à l'écran
const EDGE = X0 + P.L, FRONT = TOP + P.D, FLOOR = 206;
const sx = (x) => Math.round(X0 + x), sy = (y) => Math.round(TOP + y);
const SAFE = Math.atan((P.D / 2) / (P.L - P.START)); // au-delà, la chope finit par tomber sur le côté
const GRAV = 0.0009; // chute (px/ms²)
const pingpong = (el, period) => { const k = ((el / period) * 2) % 2; return k < 1 ? k : 2 - k; };
const dirAt = (el) => P.MAXA * (2 * pingpong(el + P.dirMs / 4, P.dirMs) - 1); // l'aiguille part du milieu
const powAt = (el) => pingpong(el, P.powMs);

// ------------------------------------------------------------ décor
let counterArt = null;
function counter() {
  if (counterArt) return counterArt;
  const c = S.makeCanvas(W, 216);
  const ctx = c.getContext('2d');
  const R = (x, y, w, h, col) => { ctx.fillStyle = col; ctx.fillRect(x, y, w, h); };
  let s = 7;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  // au-delà du bout : lambris, puis le plancher où s'écrasent les chopes (et un crachoir)
  R(EDGE, TOP - 8, W - EDGE, FLOOR - 26 - TOP + 8, '#4a2c18');
  R(EDGE, TOP - 8, W - EDGE, 2, '#8a5a34'); R(EDGE, TOP - 6, W - EDGE, 1, '#3a2214');
  R(EDGE + 10, TOP + 2, W - EDGE - 14, FLOOR - 38 - TOP, '#3e2414'); R(EDGE + 10, TOP + 2, W - EDGE - 14, 1, '#5a3a22');
  R(EDGE, FLOOR - 26, W - EDGE, 2, '#2a180c');
  for (let y = FLOOR - 24; y < FLOOR; y += 4) { R(EDGE, y, W - EDGE, 4, y % 8 ? '#5a3a22' : '#62402a'); R(EDGE, y, W - EDGE, 1, '#3a2212'); }
  const spx = W - 12, spy = FLOOR - 6;
  R(spx - 5, spy - 6, 11, 7, OUT); R(spx - 4, spy - 5, 9, 5, '#c8a040'); R(spx - 4, spy - 5, 9, 1, '#f0d070');
  R(spx - 6, spy - 8, 13, 2, OUT); R(spx - 5, spy - 8, 11, 1, '#e0b850'); R(spx - 2, spy - 3, 2, 2, '#8a6a2a');
  // plancher
  for (let y = FLOOR; y < 216; y += 5) {
    R(0, y, W, 5, y % 10 ? '#4a2e1a' : '#52331d');
    R(0, y, W, 1, '#3a2212');
    for (let x = Math.floor(rnd() * 60); x < W; x += 50 + Math.floor(rnd() * 40)) R(x, y, 1, 5, '#3a2212');
  }
  // dessus en bois verni, rebord arrière
  R(0, TOP - 4, EDGE + 4, 1, OUT);
  R(0, TOP - 3, EDGE, 3, '#5a3018'); R(0, TOP - 3, EDGE, 1, '#7a4424');
  R(0, TOP, EDGE, P.D, '#9a5a30');
  for (let y = TOP; y < FRONT; y++) {
    for (let x = Math.floor(rnd() * 20); x < EDGE; x += 12 + Math.floor(rnd() * 30)) {
      R(x, y, 4 + Math.floor(rnd() * 14), 1, rnd() < 0.5 ? '#8a4e28' : '#a8683a');
    }
  }
  R(0, TOP + 5, EDGE, 1, 'rgba(255,220,170,0.18)');
  // repères à la craie : 10, 25, 50 et 100 cm du bout
  for (const cm of [10, 25, 50, 100]) {
    const x = Math.round(EDGE - cm / P.CM);
    R(x, TOP, 1, 3, 'rgba(240,235,220,0.6)'); R(x, FRONT - 3, 1, 3, 'rgba(240,235,220,0.6)');
  }
  // rebord avant en laiton
  R(0, FRONT, EDGE, 2, '#c8a040'); R(0, FRONT, EDGE, 1, '#f0d070'); R(0, FRONT + 2, EDGE, 1, OUT);
  // façade à panneaux
  R(0, FRONT + 3, EDGE, FLOOR - FRONT - 3, '#6a3a1e');
  for (let x = 4; x < EDGE - 30; x += 46) {
    R(x, FRONT + 9, 40, FLOOR - FRONT - 25, '#4a2612');
    R(x + 1, FRONT + 10, 38, FLOOR - FRONT - 27, '#74422a');
    R(x + 1, FRONT + 10, 38, 1, '#8a5434'); R(x + 1, FRONT + 10, 1, FLOOR - FRONT - 27, '#8a5434');
  }
  R(0, FLOOR - 8, EDGE, 8, '#3a2010'); R(0, FLOOR - 8, EDGE, 1, '#5a3018');
  // barre de pied en laiton
  for (let x = 20; x < EDGE - 10; x += 64) { R(x, FLOOR - 15, 2, 5, '#8a6a2a'); }
  R(0, FLOOR - 13, EDGE - 6, 2, '#c8a040'); R(0, FLOOR - 13, EDGE - 6, 1, '#f0d070');
  // bout du comptoir (le vide commence ici)
  R(EDGE, TOP - 4, 4, FLOOR - TOP + 4, '#4a2612'); R(EDGE + 1, TOP - 3, 2, FLOOR - TOP + 2, '#5a3018');
  R(EDGE, FRONT, 4, 2, '#c8a040');
  R(EDGE + 4, TOP - 4, 1, FLOOR - TOP + 4, OUT);
  counterArt = c;
  return c;
}

// Chope aux couleurs du joueur (pieds en 0,0), selon la bière servie
const GLASS = '#d8e8f0';
const BEER_ART = {
  // blonde : la chope classique
  blonde: () => pixelSprite(16, 18, 8, 16, (R) => mugBody(R, '#e0a030', '#f0c858', '#c08020', '#fdf6e0', '#f0e4c8')),
  // brune : bière sombre, mousse crème
  brune: () => pixelSprite(16, 18, 8, 16, (R) => mugBody(R, '#5a2a12', '#7a3e1c', '#3a1a0a', '#ecd6aa', '#d8bc8a')),
  // mousseuse : la mousse déborde et coule sur le verre
  mousse: () => pixelSprite(16, 20, 8, 18, (R) => {
    mugBody(R, '#e8b040', '#f8d070', '#c89028', '#fdf6e0', '#f0e4c8');
    R(-5, -15, 10, 3, '#fdf6e0'); R(-3, -16, 5, 1, '#fdf6e0'); R(-5, -10, 1, 4, '#fdf6e0'); R(4, -10, 1, 3, '#fdf6e0');
  }),
  // petit verre de whisky : pas d'anse, pas de mousse
  shot: () => pixelSprite(10, 12, 5, 10, (R) => {
    R(-3, -8, 6, 8, GLASS);
    R(-2, -6, 4, 5, '#c87a20'); R(-2, -6, 4, 1, '#e8a048');
    R(-3, -1, 6, 1, '#b8c8d0');
  }),
  // la chope du mineur : énorme
  geante: () => pixelSprite(22, 26, 11, 24, (R) => {
    R(-10, -16, 4, 2, GLASS); R(-10, -16, 2, 10, GLASS); R(-10, -8, 4, 2, GLASS);
    R(-6, -18, 12, 18, GLASS);
    R(-5, -15, 10, 14, '#d89428'); R(-5, -15, 2, 14, '#f0c050'); R(3, -15, 2, 14, '#b07018');
    R(-6, -21, 12, 5, '#fdf6e0'); R(-7, -20, 2, 3, '#fdf6e0'); R(2, -22, 4, 1, '#fdf6e0'); R(-3, -17, 7, 1, '#f0e4c8');
    R(-6, -1, 12, 1, '#b8c8d0');
  }),
};
function mugBody(R, beer, hi, lo, foam, foamLo) {
  R(-7, -10, 3, 1, GLASS); R(-7, -10, 1, 6, GLASS); R(-7, -5, 3, 1, GLASS); // anse
  R(-4, -11, 8, 11, GLASS);
  R(-3, -9, 6, 8, beer); R(-3, -9, 1, 8, hi); R(2, -9, 1, 8, lo);
  R(-4, -13, 8, 4, foam); R(-5, -12, 2, 2, foam); R(1, -14, 3, 1, foam); R(-2, -11, 5, 1, foamLo);
  R(-4, -1, 8, 1, '#b8c8d0');
}
// bande à la couleur du joueur, posée par-dessus le sprite de la bière
const LABEL = { blonde: [-3, -5, 6, 2], brune: [-3, -5, 6, 2], mousse: [-3, -5, 6, 2], shot: [-2, -3, 4, 1], geante: [-5, -8, 10, 3] };
const mugs = new Map();
function mug(col, b = 'blonde') {
  const key = `${b}${col}`;
  let m = mugs.get(key);
  if (m) return m;
  const base = (BEER_ART[b] || BEER_ART.blonde)();
  m = S.makeCanvas(base.width, base.height);
  const g = m.getContext('2d');
  g.drawImage(base, 0, 0);
  const [x, y, w, h] = LABEL[b] || LABEL.blonde;
  g.fillStyle = col;
  g.fillRect(base.ox + x, base.oy + y, w, h);
  m.ox = base.ox;
  m.oy = base.oy;
  mugs.set(key, m);
  return m;
}

// bouteille de whisky oubliée sur le comptoir
let bottleArt = null;
const bottle = () => (bottleArt ||= pixelSprite(10, 22, 5, 20, (R) => {
  R(-3, -10, 6, 10, '#2e5a24'); R(-2, -12, 4, 2, '#2e5a24'); R(-1, -17, 2, 5, '#2e5a24');
  R(-1, -18, 2, 1, '#c8a060');
  R(-2, -10, 1, 8, '#5a9a4a'); R(-1, -16, 1, 3, '#5a9a4a');
  R(-3, -7, 6, 3, '#e8d8a8'); R(-2, -6, 4, 1, '#8a3a24');
}));

function drawMug(ctx, x, y, col, rot = 0, b = 'blonde') {
  const m = mug(col, b);
  if (!rot) return ctx.drawImage(m, Math.round(x) - m.ox, Math.round(y) - m.oy);
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y) - 6);
  ctx.rotate(rot);
  ctx.drawImage(m, -m.ox, -m.oy + 6);
  ctx.restore();
}

const hash = (n) => { const x = Math.sin(n * 127.1) * 43758.5453; return x - Math.floor(x); };

// Décor des modificateurs posé sur le comptoir (sciure, vent, cire, gel, virage)
function drawMods(ctx, m, now, env) {
  if (!m) return;
  const R = (x, y, w, h, col) => { ctx.fillStyle = col; ctx.fillRect(Math.round(x), Math.round(y), w, h); };
  if (m.slick) {
    // gel : givre bleuté ; cire : le comptoir brille et un reflet passe
    if (m.slick < 0.7) {
      R(0, TOP, EDGE, P.D, 'rgba(200,230,255,0.28)');
      for (let k = 0; k < 90; k++) R(hash(k) * EDGE, TOP + hash(k + 50) * P.D, 1, 1, 'rgba(255,255,255,0.75)');
      for (let x = 0; x < EDGE; x += 3) R(x, TOP, 2, 1 + Math.floor(hash(x) * 3), 'rgba(240,250,255,0.6)');
    } else R(0, TOP, EDGE, P.D, 'rgba(255,240,210,0.1)');
    const gx = ((now * 0.12) % (EDGE + 160)) - 80;
    for (let y = TOP; y < FRONT; y++) R(gx + (y - TOP) * 0.6, y, 5, 1, 'rgba(255,255,255,0.22)');
  }
  if (m.saw) {
    const x0 = sx(m.saw.a);
    R(x0, TOP + 1, m.saw.w, P.D - 2, 'rgba(216,192,136,0.22)');
    for (let k = 0; k < m.saw.w * 2.2; k++) {
      const h = hash(k + m.saw.a);
      R(x0 + h * m.saw.w, TOP + 1 + hash(k * 3.1 + 7) * (P.D - 2), 1 + (h > 0.8), 1, h < 0.5 ? '#e0c890' : '#b8925a');
    }
  }
  // courant d'air (zone) ou vent qui traverse toute la salle : poussière, neige ou pluie qui file
  const speck = env === 'neige' ? 'rgba(255,255,255,0.85)' : env === 'poussiere' ? 'rgba(200,150,90,0.8)' : env === 'orage' ? 'rgba(170,190,230,0.7)' : 'rgba(225,235,250,0.6)';
  if (m.wind) {
    const x0 = sx(m.wind.a), dir = Math.sign(m.wind.fy), span = P.D + 40;
    for (let k = 0; k < Math.round(m.wind.w / 3); k++) {
      const ph = ((now * 0.07 + hash(k) * span) % span);
      const y = dir > 0 ? TOP - 20 + ph : FRONT + 20 - ph;
      R(x0 + hash(k + 9) * m.wind.w, y, 1, 3, speck);
    }
    // chevrons à la craie sur le rebord : sens de la poussée
    const cx = Math.round(x0 + m.wind.w / 2), y0 = dir > 0 ? FRONT - 5 : TOP + 4;
    if (Math.floor(now / 300) % 2) for (let k = 0; k < 3; k++) R(cx - 2 + k, y0 + dir * k, 5 - 2 * k, 1, 'rgba(240,235,220,0.8)');
  }
  if (m.push) {
    const dir = Math.sign(m.push);
    for (let k = 0; k < 26; k++) {
      const ph = (now * 0.16 + hash(k) * (W + 40)) % (W + 40);
      R(dir > 0 ? ph - 20 : W + 20 - ph, 30 + hash(k + 3) * (FLOOR - 40), 4, 1, speck);
    }
  }
  if (m.tilt) {
    // le comptoir penche : des flèches à la craie montrent de quel côté
    const dir = Math.sign(m.tilt), y0 = dir > 0 ? FRONT - 4 : TOP + 3;
    for (let x = 40; x < EDGE - 20; x += 60) {
      const off = Math.floor(now / 250) % 2;
      for (let k = 0; k < 3; k++) R(x - 2 + k, y0 + dir * (off + (k === 1 ? 1 : 0)), 1, 1, 'rgba(240,235,220,0.7)');
    }
  }
}

// la fenêtre de la salle bat au vent quand il y a un courant d'air
function drawShutters(ctx, room, now) {
  const w = room?.def.windows[0];
  if (!w) return;
  const R = (x, y, ww, h, col) => { ctx.fillStyle = col; ctx.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(ww)), h); };
  const half = w.w / 2;
  [[w.x, 1], [w.x + w.w, -1]].forEach(([hx, d], i) => {
    const open = Math.abs(Math.sin(now / 170 + i * 1.3)) * 0.85 + 0.15; // 1 = rabattu contre le mur
    const ww = half * (1 - open) + 3;
    const x = d > 0 ? hx - (open > 0.6 ? ww : 0) : hx - (open > 0.6 ? 0 : ww);
    R(x, w.y, ww, w.h, '#6a4022');
    for (let y = w.y + 3; y < w.y + w.h; y += 5) R(x, y, ww, 1, '#4a2a14');
    R(x, w.y, 1, w.h, '#2a180c'); R(x + ww - 1, w.y, 1, w.h, '#2a180c');
  });
}

// pièce d'or posée à plat sur le comptoir
function drawCoin(ctx, c, now) {
  const x = sx(c.x), y = sy(c.y);
  const R = (xx, yy, w, h, col) => { ctx.fillStyle = col; ctx.fillRect(xx, yy, w, h); };
  R(x - 3, y - 2, 7, 4, OUT); R(x - 2, y - 3, 5, 6, OUT);
  R(x - 2, y - 2, 5, 4, '#f0c040'); R(x - 1, y - 2, 3, 1, '#fff0a0'); R(x - 2, y + 1, 5, 1, '#b08020');
  if (Math.floor(now / 120) % 9 === 0) { R(x + 2, y - 5, 1, 3, '#fff8d0'); R(x + 1, y - 4, 3, 1, '#fff8d0'); }
}

function drawPuddle(ctx, pd, now) {
  if (!pd) return;
  const x0 = sx(pd.a), w = Math.round(pd.w);
  for (let y = TOP + 2; y < FRONT - 1; y++) {
    const k = y - TOP;
    const l = Math.round(Math.sin(k * 0.9 + pd.a) * 2 + Math.sin(k * 0.4) * 2);
    const r = Math.round(Math.cos(k * 0.7 + pd.w) * 2 + Math.sin(k * 0.3 + 1) * 2);
    ctx.fillStyle = 'rgba(232,168,48,0.5)';
    ctx.fillRect(x0 + l + 2, y, w - l + r - 4, 1);
  }
  ctx.fillStyle = 'rgba(255,240,200,0.7)';
  for (let k = 0; k < 4; k++) {
    const gx = x0 + 5 + ((k * 17 + Math.floor(now / 90)) % Math.max(1, w - 10));
    ctx.fillRect(gx, TOP + 4 + ((k * 7) % (P.D - 8)), 2, 1);
  }
}

// ------------------------------------------------------------ scène
export class PinteScene extends MiniScene {
  constructor(canvas, hooks) {
    super(canvas, hooks);
    this.kind = 'pinte';
    this.cur = null;
  }

  title() { return 'LA PINTE'; }
  help() {
    return [
      'FAIS GLISSER TA CHOPE AU RAS DU BOUT DU COMPTOIR',
      this.touch ? 'TOUCHE L\'ÉCRAN : BLOQUE LA DIRECTION, PUIS LA PUISSANCE' : 'CLIC OU ESPACE : BLOQUE LA DIRECTION, PUIS LA PUISSANCE',
      'TROP FORT OU DE TRAVERS, ELLE TOMBE : 0 PT',
      'POUSSE LES CHOPES DES AUTRES DANS LE VIDE !',
      'CHAQUE MANCHE SES SURPRISES, ET LE BARMAN CHANGE DE BIÈRE',
    ];
  }
  goText() { return ''; }

  clock() {
    const c = this.cur;
    return c && c.phase === 'aim' && this.t >= c.turnAt ? Math.max(0, c.turnAt + P.AIM - this.t) : null;
  }
  progress() { const ms = this.clock(); return ms == null ? 0 : ms / P.AIM; }

  setup(seed) {
    this.showEnv = true;
    this.room = new Room(seed);
    // le comptoir est celui de la salle : son ambiance (météo) est celle qu'on annonce et qui choisit les surprises
    this.env = this.room.env;
    this.amb = this.room.amb;
    this.cur = null;
    this.slide = null;
    this.falls = [];
    this.aim = null;
    this.remoteAim = null;
    this.best = null;
  }

  applySync(st) {
    if (st.round) this.cur = st.round;
  }

  popup(...args) { if (this.cur?.phase !== 'score') super.popup(...args); }

  get thrower() { const c = this.cur; return c && c.phase === 'aim' ? c.order[c.turn] : null; }
  get myTurn() { return this.thrower === this.me && this.t >= this.cur.turnAt && this.playing; }

  // ---------------------------------------------------------- entrées
  onFire() { this.press(); }
  onKey(k) { if (k === ' ' || k === 'enter') this.press(); }

  press() {
    const a = this.aim, c = this.cur, t = this.t;
    if (!a || !this.myTurn) return;
    if (a.stage === 'dir') {
      a.a = dirAt(t - a.t0);
      a.stage = 'pow';
      a.t0 = t;
      sfx('tick');
      this.sendLive({ n: c.n, turn: c.turn, s: 'pow', a: a.a, t }, true);
    } else if (a.stage === 'pow') {
      a.p = powAt(t - a.t0);
      a.stage = 'sent';
      sfx('click');
      this.hooks.send({ kind: 'throw', n: c.n, turn: c.turn, power: a.p, angle: a.a });
    }
  }

  remoteLive(i, d) {
    const c = this.cur;
    if (c && d.n === c.n && d.turn === c.turn && c.order[c.turn] === i) this.remoteAim = d;
  }

  // ---------------------------------------------------------- événements de l'hôte
  onEvent(ev) {
    const c = ev.round;
    if (ev.type === 'pRound') {
      this.cur = c;
      this.slide = null;
      this.aim = null;
      this.remoteAim = null;
      sfx('ding');
    } else if (ev.type === 'pTurn') {
      this.cur = c;
      this.aim = null;
      this.remoteAim = null;
    } else if (ev.type === 'pThrow') {
      this.cur = c;
      this.aim = null;
      this.remoteAim = null;
      this.slide = { sim: new Slide(ev.start, ev.mods || c.mods), at: this.t, seen: 0, who: ev.who, id: ev.start[ev.start.length - 1].id };
      sfx('rope');
    } else if (ev.type === 'pSkip') {
      this.cur = c;
      this.aim = null;
      this.popup(X0 + 20, TOP - 30, ev.who === this.me ? 'TROP LENT !' : `${this.name(ev.who).toUpperCase()} HÉSITE…`, '#f0705a');
      sfx('bad');
    } else if (ev.type === 'pScore') {
      this.cur = c;
      // le bandeau de fin de manche prend le relais : une glissade en retard se termine d'un coup
      this.slide = null;
      this.popups = [];
      const mine = c.res.filter((r) => r.o === this.me);
      for (const r of mine) if (this.best == null || r.cm < this.best) this.best = r.cm;
      sfx(mine.some((r) => r.best) ? 'coin' : 'tick');
    }
  }

  // ---------------------------------------------------------- simulation
  update(dt) {
    const t = this.t;
    for (const p of this.parts) { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += (p.g || 0) * dt; }
    this.parts = this.parts.filter((p) => p.t < p.max);
    // la glissade avance au rythme de l'horloge de la partie
    const sl = this.slide;
    if (sl) {
      const el = t - sl.at;
      while (!sl.sim.done && sl.sim.t <= el) sl.sim.step();
      for (; sl.seen < sl.sim.log.length; sl.seen++) this.slideEvent(sl.sim.log[sl.seen], sl);
      if (sl.sim.done && el >= sl.sim.t) {
        const q = sl.sim.p.find((x) => x.id === sl.id);
        if (q && !q.out) {
          const cm = gapCm(q);
          this.popup(sx(q.x), sy(q.y) - 22, cm === 0 ? 'AU RAS !' : `${cm} CM`, this.color(q.o), cm <= 5);
          if (cm <= 5) sfx('good');
        }
        this.slide = null;
      }
    }
    // chopes qui tombent : elles se brisent en touchant le plancher
    for (const f of this.falls) {
      if (f.broken) continue;
      const el = t - f.at;
      const pos = this.fallPos(f, el);
      if (pos.y >= f.floor) {
        f.broken = true;
        sfx('glass');
        if (f.edge !== 'back') this.smash(pos.x, f.floor);
      }
    }
    this.falls = this.falls.filter((f) => !f.broken);
    // mon tour : l'aiguille de direction se met en marche
    if (this.myTurn && !this.aim) {
      this.aim = { stage: 'dir', t0: t };
      sfx('go');
      this.sendLive({ n: this.cur.n, turn: this.cur.turn, s: 'dir', t }, true);
    }
  }

  slideEvent(e, sl) {
    const q = sl.sim.p.find((x) => x.id === e.id);
    if (e.type === 'clink') {
      sfx('dry');
      if (e.v > 0.05) sfx('ding', 0.02);
      // un seul « TCHIN ! » par vrai choc (les chopes serrées se frôlent plusieurs fois)
      if (q && e.v > 0.02 && sl.sim.t - (sl.tchin ?? -1e9) > 400) {
        sl.tchin = sl.sim.t;
        this.popup(sx(q.x), sy(q.y) - 20, 'TCHIN !', '#fdf6e0');
      }
    } else if (e.type === 'bonk') {
      sfx('clank', 0.05);
      if (q && e.v > 0.03) this.popup(sx(q.x), sy(q.y) - 20, 'BONK !', '#b8e070');
    } else if (e.type === 'coin' && q) {
      sl.coinGone = true;
      sfx('coin');
      this.popup(sx(q.x), sy(q.y) - 22, `+${P.COIN}`, '#f8d070', true);
      this.sparkle(sx(sl.sim.m.coin.x), sy(sl.sim.m.coin.y));
    } else if (e.type === 'fall' && q) {
      this.falls.push({
        x: q.x, y: q.y, vx: q.vx, vy: q.vy, o: q.o, b: q.b, edge: e.edge, at: sl.at + e.t,
        floor: e.edge === 'back' ? FRONT + 6 : e.edge === 'front' ? FLOOR + 6 : FLOOR + 3,
      });
      const mine = q.o === this.me;
      const by = sl.who !== q.o ? (sl.who === this.me ? 'DANS LE VIDE !' : 'POUSSÉE !') : 'TOMBÉE !';
      this.popup(Math.min(W - 56, sx(q.x)), TOP - 44, by, mine ? '#f0705a' : '#f8d070', true);
    }
  }

  // position à l'écran d'une chope qui tombe, el ms après avoir quitté le comptoir
  fallPos(f, el) {
    const slow = Math.min(el, 400);
    const x = sx(f.x + f.vx * slow * 0.7) + (f.edge === 'end' ? Math.round(el * 0.02) : 0);
    const y = sy(f.y + f.vy * slow * 0.7) + 0.5 * GRAV * el * el;
    return { x, y, rot: (el / 140) * (f.edge === 'back' ? -1 : 1) };
  }

  sparkle(x, y) {
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      this.parts.push({ x, y, vx: Math.cos(a) * 0.06, vy: Math.sin(a) * 0.06 - 0.03, g: 0.0002, t: 0, max: 500, col: i % 2 ? '#fff0a0' : '#f0c040', r: 1 });
    }
  }

  smash(x, y) {
    for (let i = 0; i < 16; i++) {
      const glass = i % 2;
      this.parts.push({
        x, y: y - 2, vx: (Math.random() - 0.5) * 0.16, vy: -0.05 - Math.random() * 0.12, g: 0.0005,
        t: 0, max: 500 + Math.random() * 400, col: glass ? '#e8f4fa' : '#e8a830', r: glass ? 1 : 2,
      });
    }
    this.shake = 3;
  }

  // ---------------------------------------------------------- rendu
  render(ctx) {
    if (!this.state || !this.room) return;
    const now = this.now, t = this.t, c = this.cur;
    const m = c?.mods;
    this.room.drawBack(ctx, now);
    if (m?.wind && t >= 0) drawShutters(ctx, this.room, now);
    for (const f of this.falls) if (f.edge === 'back') this.drawFall(ctx, f, t);
    this.drawThrower(ctx);
    ctx.drawImage(counter(), 0, 0);
    drawPuddle(ctx, m?.puddle, now);
    drawMods(ctx, m, now, this.env?.id);
    this.drawGuide(ctx);
    // pièce d'or : encore là tant que personne ne l'a empochée (pendant une glissade, jusqu'au passage de la chope)
    const sl = this.slide;
    const coin = sl ? (!sl.coinGone && sl.sim.coin) : m?.coin && m.coin.by == null ? m.coin : null;
    if (coin) drawCoin(ctx, coin, now);
    // chopes et bouteilles du comptoir, de l'arrière vers l'avant
    const pints = sl ? sl.sim.p.filter((q) => !q.out) : (c?.pints || []).slice();
    if (c && c.phase === 'aim' && t >= c.turnAt - 300) pints.push({ x: P.START, y: P.D / 2, o: c.order[c.turn], b: c.beers?.[c.turn] });
    const items = [...pints, ...(m?.bottles || []).map((o) => ({ ...o, bottle: true }))];
    items.sort((a, b) => a.y - b.y);
    for (const q of items) {
      const r = q.bottle ? P.BOTTLE_R : beerOf(q).r;
      ctx.fillStyle = 'rgba(40,20,10,0.35)';
      ctx.fillRect(sx(q.x) - r, sy(q.y) - 1, 2 * r + 1, 2);
      if (q.bottle) { const bt = bottle(); ctx.drawImage(bt, sx(q.x) - bt.ox, sy(q.y) - bt.oy); } else drawMug(ctx, sx(q.x), sy(q.y), this.color(q.o), 0, q.b);
    }
    for (const f of this.falls) if (f.edge !== 'back') this.drawFall(ctx, f, t);
    for (const p of this.parts) {
      ctx.globalAlpha = Math.min(1, 2 * (1 - p.t / p.max));
      ctx.fillStyle = p.col;
      ctx.fillRect(Math.round(p.x), Math.min(FLOOR + 8, Math.round(p.y)), p.r, p.r);
    }
    ctx.globalAlpha = 1;
    this.room.drawOverlay(ctx, now);
    if (!c || t < 0) return;
    if (c.phase === 'score') this.drawScore(ctx, c);
    else { this.drawGauges(ctx); this.drawLegend(ctx, c); }
    this.drawBanner(ctx, c, t);
  }

  drawFall(ctx, f, t) {
    const p = this.fallPos(f, t - f.at);
    drawMug(ctx, p.x, Math.min(p.y, f.floor), this.color(f.o), p.rot, f.b);
  }

  // le lanceur se tient derrière le bout gauche du comptoir
  drawThrower(ctx) {
    const i = this.thrower ?? (this.slide ? this.slide.who : null);
    const p = i != null && this.state.players[i];
    if (!p) return;
    const spr = S.characterSprite(p.character || {}, { t: this.now, blink: this.now % 3200 < 140 });
    ctx.drawImage(spr, -6, TOP - 54);
    canvasText(ctx, i === this.me ? 'TOI' : p.name.slice(0, 10).toUpperCase(), 18, TOP - 64, { color: this.color(i) });
  }

  // aiguille et jauge du lanceur (moi, ou celles qu'il diffuse)
  aimNow() {
    const t = this.t, c = this.cur;
    if (!c || c.phase !== 'aim') return null;
    if (this.myTurn && this.aim) {
      const a = this.aim;
      if (a.stage === 'dir') return { a: dirAt(t - a.t0), p: null, mine: true };
      if (a.stage === 'pow') return { a: a.a, p: powAt(t - a.t0), mine: true };
      return { a: a.a, p: a.p, mine: true };
    }
    const d = this.remoteAim;
    if (!d) return null;
    return d.s === 'dir' ? { a: dirAt(t - d.t), p: null } : { a: d.a, p: powAt(t - d.t) };
  }

  // trajectoire visée : quelques points à la craie sur le comptoir
  drawGuide(ctx) {
    const g = this.aimNow();
    if (!g) return;
    ctx.fillStyle = Math.abs(g.a) > SAFE ? 'rgba(240,112,90,0.8)' : 'rgba(253,246,224,0.7)';
    for (let k = 14; k < 120; k += 7) {
      ctx.fillRect(sx(P.START + k * Math.cos(g.a)), sy(P.D / 2 + k * Math.sin(g.a)), 2, 1);
    }
  }

  drawGauges(ctx) {
    const g = this.aimNow();
    if (!g) return;
    const R = (x, y, w, h, col) => { ctx.fillStyle = col; ctx.fillRect(Math.round(x), Math.round(y), w, h); };
    // direction : cadran, zone verte = la chope reste sur le comptoir jusqu'au bout
    const cx = 64, cy = 192, r = 20, k = 7;
    R(cx - r - 4, cy - r - 4, 2 * r + 9, r + 6, 'rgba(26,15,10,0.7)');
    for (let s = -1; s <= 1; s += 0.02) {
      const ang = s * P.MAXA;
      const v = -Math.PI / 2 + ang * k;
      R(cx + Math.cos(v) * r, cy + Math.sin(v) * r, 2, 2, Math.abs(ang) > SAFE ? '#f0705a' : '#b8e070');
    }
    const v = -Math.PI / 2 + g.a * k;
    for (let d = 0; d < r - 2; d++) R(cx + Math.cos(v) * d, cy + Math.sin(v) * d, 1, 1, '#fdf6e0');
    R(cx - 1, cy - 1, 3, 3, '#f8d070');
    canvasText(ctx, 'DIRECTION', cx, cy - r - 14, { color: g.p == null ? '#fdf6e0' : '#a89880' });
    // puissance : la jauge fait l'aller-retour
    const bx = 112, by = 182, bw = 180, bh = 8;
    R(bx - 2, by - 2, bw + 4, bh + 4, OUT);
    for (let x = 0; x < bw; x++) {
      const u = x / bw;
      R(bx + x, by, 1, bh, u < 0.5 ? '#6a8a3a' : u < 0.8 ? '#c8a040' : '#b04030');
    }
    if (g.p != null) {
      const px = bx + Math.round(g.p * (bw - 1));
      R(px - 1, by - 4, 3, bh + 8, '#fdf6e0');
      R(px - 2, by - 5, 5, 1, '#fdf6e0');
    } else {
      R(bx, by, bw, bh, 'rgba(26,15,10,0.55)');
    }
    canvasText(ctx, 'PUISSANCE', bx + bw / 2, by - 14, { color: g.p != null ? '#fdf6e0' : '#a89880' });
  }

  drawBanner(ctx, c, t) {
    const list = c.mods?.list || [];
    if (t < c.turnAt && c.turn === 0 && c.phase === 'aim') {
      // annonce de la manche et de ses surprises, une ligne après l'autre
      ctx.fillStyle = 'rgba(26,15,10,0.78)';
      ctx.fillRect(0, 50, W, 32 + (list.length ? 6 + list.length * 12 : 0));
      canvasText(ctx, `MANCHE ${c.n} / ${c.rounds}`, W / 2, 56, { size: 16, color: '#f8d070' });
      const shown = Math.floor((t - (c.turnAt - P.INTRO - 900 * list.length)) / 700) + 1;
      list.slice(0, Math.max(1, shown)).forEach((id, k) => canvasText(ctx, modName(id, c.mods), W / 2, 82 + k * 12, { color: MODS[id].col }));
      return;
    }
    const who = this.thrower;
    if (who == null || t < c.turnAt - 300) return;
    const B = BEERS[c.beers?.[c.turn]] || BEERS.blonde;
    if (who === this.me) {
      canvasText(ctx, 'À TOI !', W / 2, 8, { size: 16, color: this.color(who) });
      const st = this.aim?.stage;
      const tap = this.touch ? 'TOUCHE' : 'CLIC';
      const help = st === 'dir' ? `${tap} : BLOQUE LA DIRECTION` : st === 'pow' ? `${tap} : BLOQUE LA PUISSANCE` : '';
      if (help && Math.floor(this.now / 400) % 3) canvasText(ctx, help, W / 2, 28, { color: '#fdf6e0' });
      canvasText(ctx, `ON TE SERT ${B.name} : ${B.desc}`, W / 2, 40, { color: '#e8c890' });
    } else {
      canvasText(ctx, `AU TOUR DE ${this.name(who).toUpperCase()}`, W / 2, 10, { color: this.color(who) });
      canvasText(ctx, `${B.name} : ${B.desc}`, W / 2, 22, { color: '#e8c890' });
    }
  }

  // rappel des surprises de la manche, en haut à droite
  drawLegend(ctx, c) {
    const list = c.mods?.list || [];
    if (!list.length || this.t < c.turnAt) return;
    list.forEach((id, k) => canvasText(ctx, modLabel(id, c.mods), W - 4, 4 + k * 10, { align: 'right', color: MODS[id].col }));
  }

  // fin de manche : écart de chaque chope, et la tournée pour la plus proche
  drawScore(ctx, c) {
    // petite flèche dorée au-dessus de la chope gagnante
    for (const r of c.res) {
      const q = r.best && c.pints.find((x) => x.id === r.id);
      if (!q) continue;
      const bob = Math.round(Math.sin(this.now / 150) * 2);
      ctx.fillStyle = '#f8d070';
      for (let k = 0; k < 4; k++) ctx.fillRect(sx(q.x) - 3 + k, sy(q.y) - 26 + k + bob, 7 - 2 * k, 1);
    }
    const mult = c.mods?.mult || 1;
    ctx.fillStyle = 'rgba(26,15,10,0.75)';
    ctx.fillRect(0, 40, W, mult > 1 ? 72 : 62);
    if (mult > 1) canvasText(ctx, 'DERNIÈRE TOURNÉE : POINTS DOUBLÉS', W / 2, 99, { color: MODS.double.col });
    const best = c.res.filter((r) => r.best);
    if (!best.length) {
      canvasText(ctx, 'TOUTES LES CHOPES SONT TOMBÉES !', W / 2, 46, { size: 16, color: '#f0705a' });
      return;
    }
    const names = [...new Set(best.map((r) => (r.o === this.me ? 'TOI' : this.name(r.o).toUpperCase())))].join(' ET ');
    canvasText(ctx, `${names} : LA PLUS PROCHE !`, W / 2, 46, { size: names.length > 12 ? 8 : 16, color: '#f8d070' });
    // une colonne par joueur : son écart (ou TOMBÉE) et ses points de la manche
    const players = this.state.players, cw = W / players.length;
    players.forEach((p, i) => {
      const mine = c.res.filter((r) => r.o === i);
      const x = cw * (i + 0.5);
      const threw = c.order.includes(i);
      const cm = mine.length ? `${Math.min(...mine.map((r) => r.cm))} CM` : threw ? 'TOMBÉE' : '—';
      const pts = mine.reduce((s, r) => s + r.pts, 0);
      canvasText(ctx, i === this.me ? 'TOI' : p.name.slice(0, 10).toUpperCase(), x, 66, { color: this.color(i) });
      canvasText(ctx, cm, x, 77, { color: mine.length ? '#fdf6e0' : '#f0705a' });
      canvasText(ctx, `+${pts}`, x, 88, { color: mine.some((r) => r.best) ? '#f8d070' : '#a89880' });
    });
  }

  hudStats() {
    const c = this.cur;
    return [['MANCHE', c ? `${c.n}/${c.rounds}` : '—', 'yellow'], ['MEILLEUR', this.best == null ? '—' : `${this.best} cm`, 'green']];
  }
}
