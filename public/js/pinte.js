// Mini-jeu « La pinte » : chacun son tour, on fait glisser sa chope le long du comptoir.
// Premier clic : on bloque l'aiguille de direction ; second clic : on bloque la jauge de puissance.
// La glissade est simulée ici pas à pas, exactement comme chez l'hôte (pintegame.js).
import * as S from './sprites.js';
import { sfx } from './audio.js';
import { canvasText, textSprite } from './scene.js';
import { MiniScene, pixelSprite } from './miniscene.js';
import { textW as measureW, wrap } from './uikit.js';
import { Room } from './room.js';
import { W, H } from './worlds.js';
import {
  PINTE, PROPS, Slide, gapCm, BEERS, beerOf, modName, modLabel, MODS, METAS, META, onMat, COUNTERS, counterOf, speedFor,
  dirAt, powAt, solo, reachesAt,
} from './pintegame.js';

const P = PINTE;
const OUT = S.OUT;
const X0 = 30, TOP = 122; // bout gauche du comptoir et bord arrière, à l'écran
const EDGE = X0 + P.L, FLOOR = 206;
const sx = (x) => Math.round(X0 + x), sy = (y) => Math.round(TOP + y);
const GRAV = 0.0009; // chute (px/ms²)
const clampI = (v, a, b) => Math.max(a, Math.min(b, v));
const inBox = (z, x, y) => x >= z.x && x < z.x + z.w && y >= z.y && y < z.y + z.h;
// la glissade démarre à l'instant du lancer chez l'hôte (ev.at) ; un message très en retard rattrape au plus 400 ms
const startAt = (ev, now) => (ev.at == null ? now : clampI(ev.at, now - 400, now));

// ------------------------------------------------------------ jauges
// Elles disent la vérité de la manche : le comptoir, ses surprises (chat, bouteilles, vent, sciure, cire…) et la bière
// servie, calculés par la même glissade que le jeu, pour une chope seule (celles déjà posées ne comptent pas).
// Cadran : une direction est verte si une puissance au moins y amène la chope à 50 cm du bout ou moins.
// Jauge (une fois la direction bloquée) : rouge, elle tombe ; vert, elle reste sur le comptoir ; or, à 20 cm ou moins.
const DIRS = 50, NEAR = 25, CLOSE = 10, POWS = 90, MIN_RUN = 3;
class Zones {
  constructor(mods, b) {
    this.mods = mods;
    this.b = b;
    this.g = counterOf(mods);
    this.dir = new Array(DIRS + 1).fill(null);
    this.k = 0;
    this.bar = null;
  }

  get done() { return this.k > DIRS; }
  // quelques directions à chaque image, pour ne jamais figer l'écran
  work(n) {
    for (; n > 0 && this.k <= DIRS; n--, this.k++) this.dir[this.k] = reachesAt(this.g.maxa * (2 * this.k / DIRS - 1), this.mods, this.b, NEAR);
    if (this.k > DIRS && !this.clean) this.smooth();
  }

  // une fenêtre de moins de MIN_RUN crans (verte dans le rouge, ou l'inverse) prend la couleur de ses voisines :
  // sur le cadran, ça faisait des pixels isolés, et une direction si étroite, l'aiguille ne s'y arrête pas exprès
  smooth() {
    // (sauf la seule fenêtre verte du cadran : tout rouge, on croirait la manche injouable)
    const d = this.dir, greens = d.filter(Boolean).length;
    this.clean = true;
    for (let i = 0; i <= DIRS;) {
      let j = i;
      while (j < DIRS && d[j + 1] === d[i]) j++;
      const only = d[i] && j - i + 1 === greens;
      if (j - i + 1 < MIN_RUN && (i > 0 || j < DIRS) && !only) d.fill(i > 0 ? d[i - 1] : d[j + 1], i, j + 1);
      i = j + 1;
    }
  }

  // true / false, ou null si pas encore calculé
  dirOk(a) { return this.dir[clampI(Math.round((a / this.g.maxa + 1) * DIRS / 2), 0, DIRS)]; }

  // la jauge de puissance pour la direction a : une colonne de couleur par puissance (gardée tant que a ne change pas)
  barFor(a) {
    if (this.bar?.a === a) return this.bar.c;
    const { bw, bh } = BAR, c = this.bar?.c || S.makeCanvas(bw + 4, bh + 4), ctx = c.getContext('2d');
    ctx.fillStyle = OUT; ctx.fillRect(0, 0, bw + 4, bh + 4);
    const r = BEERS[this.b]?.r || P.R;
    for (let j = 0; j < POWS; j++) {
      const q = solo((j + 0.5) / POWS, a, this.mods, this.b);
      ctx.fillStyle = !q ? '#b04030' : P.L - q.x - r <= CLOSE ? '#e8b838' : '#6a8a3a';
      const x0 = Math.round((j * bw) / POWS), x1 = Math.round(((j + 1) * bw) / POWS);
      ctx.fillRect(2 + x0, 2, x1 - x0, bh);
    }
    // reflet en haut de la jauge
    ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(2, 2, bw, 1);
    this.bar = { a, c };
    return c;
  }
}

// contour du dessus du comptoir, à l'écran (pour y limiter flaque, sciure, givre…)
function surfacePath(ctx, g) {
  ctx.beginPath();
  ctx.moveTo(0, sy(g.backAt(0)));
  for (const [x, y] of g.back) ctx.lineTo(sx(x), sy(y));
  ctx.lineTo(EDGE, sy(g.backAt(P.L)));
  ctx.lineTo(EDGE, sy(g.frontAt(P.L)));
  for (const [x, y] of [...g.front].reverse()) ctx.lineTo(sx(x), sy(y));
  ctx.lineTo(0, sy(g.frontAt(0)));
  ctx.closePath();
}
// haut et bas du comptoir à l'écran
// (gardés par comptoir : demandés à chaque image)
const spans = new Map();
const spanOf = (g) => {
  let s = spans.get(g.id);
  if (!s) spans.set(g.id, (s = { top: sy(Math.min(...g.back.map((q) => q[1]))), bot: sy(Math.max(...g.front.map((q) => q[1]))) }));
  return s;
};

// ------------------------------------------------------------ décor
// Le comptoir est dessiné colonne par colonne d'après sa forme (bords, rambardes) : un dessin par comptoir.
// Les rambardes avant passent devant les chopes : elles ont leur propre calque (front).
// Le dessus du comptoir : bois verni (par défaut), pin clair, marbre veiné, zinc, tapis de billard
const LOOKS = {
  acajou: { top: '#9a5a30', grain: ['#8a4e28', '#a8683a'], lip: '#5a3018', lipHi: '#7a4424', shine: 'rgba(255,220,170,0.18)' },
  pin: { top: '#b8844a', grain: ['#a6723c', '#c8985c'], lip: '#6a4220', lipHi: '#8a5a30', shine: 'rgba(255,230,190,0.2)' },
  marbre: { top: '#d8d0c2', grain: ['#b4aca0', '#ece6da'], lip: '#6a5a4a', lipHi: '#8a7a6a', shine: 'rgba(255,255,255,0.3)' },
  zinc: { top: '#8c969c', grain: ['#7e888e', '#a2acb2'], lip: '#4a5054', lipHi: '#6a7276', shine: 'rgba(255,255,255,0.28)' },
  tapis: { top: '#2e6a3c', grain: ['#296236', '#347244'], lip: '#5a3018', lipHi: '#7a4424', shine: 'rgba(200,255,200,0.08)' },
};
const counterArts = new Map();
function counter(g) {
  let art = counterArts.get(g.id);
  if (art) return art;
  const look = LOOKS[g.look] || LOOKS.acajou;
  const c = S.makeCanvas(W, 216), fc = S.makeCanvas(W, 216);
  const ctx = c.getContext('2d'), fx = fc.getContext('2d');
  const R = (x, y, w, h, col, k = ctx) => { k.fillStyle = col; k.fillRect(x, y, w, h); };
  let sd = 7;
  const rnd = () => ((sd = (sd * 9301 + 49297) % 233280) / 233280);
  const bAt = (X) => sy(g.backAt(Math.max(0, X - X0))), fAt = (X) => sy(g.frontAt(Math.max(0, X - X0)));
  // au-delà du bout : lambris, puis le plancher où s'écrasent les chopes (et un crachoir)
  const top = Math.min(TOP, bAt(EDGE - 1)) - 8;
  R(EDGE, top, W - EDGE, FLOOR - 26 - top, '#4a2c18');
  R(EDGE, top, W - EDGE, 2, '#8a5a34'); R(EDGE, top + 2, W - EDGE, 1, '#3a2214');
  R(EDGE + 10, top + 10, W - EDGE - 14, FLOOR - 38 - top - 8, '#3e2414'); R(EDGE + 10, top + 10, W - EDGE - 14, 1, '#5a3a22');
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
  // colonne par colonne : rebord arrière, dessus en bois verni, rebord avant en laiton, façade à panneaux
  for (let X = 0; X < EDGE; X++) {
    const b = bAt(X), f = fAt(X), x = Math.max(0, X - X0);
    R(X, b - 4, 1, 1, OUT); R(X, b - 3, 1, 3, look.lip); R(X, b - 3, 1, 1, look.lipHi);
    R(X, b, 1, f - b, look.top);
    R(X, b + 5, 1, 1, look.shine);
    R(X, f, 1, 2, '#c8a040'); R(X, f, 1, 1, '#f0d070'); R(X, f + 2, 1, 1, OUT);
    R(X, f + 3, 1, FLOOR - f - 3, '#6a3a1e');
    const px = (X - 4) % 46, pt = f + 9, pb = FLOOR - 16;
    if (X >= 4 && X < EDGE - 30 && px < 40 && pb - pt > 4) {
      R(X, pt, 1, pb - pt, '#4a2612');
      if (px > 0 && px < 39) { R(X, pt + 1, 1, pb - pt - 2, '#74422a'); R(X, pt + 1, 1, 1, '#8a5434'); }
      if (px === 1) R(X, pt + 1, 1, pb - pt - 2, '#8a5434');
    }
    R(X, FLOOR - 8, 1, 8, '#3a2010'); R(X, FLOOR - 8, 1, 1, '#5a3018');
    if (X < EDGE - 6) { R(X, FLOOR - 13, 1, 2, '#c8a040'); R(X, FLOOR - 13, 1, 1, '#f0d070'); }
    if (X % 64 >= 20 && X % 64 < 22 && X < EDGE - 10) R(X, FLOOR - 15, 1, 5, '#8a6a2a');
    // rambardes en laiton : une barre sur des poteaux, un peu au-dessus du bord
    if (g.railBack(x)) {
      R(X, b - 8, 1, 2, '#c8a040'); R(X, b - 8, 1, 1, '#f0d070'); R(X, b - 9, 1, 1, OUT);
      if (X % 14 === 0) R(X, b - 6, 1, 4, '#8a6a2a');
    }
    if (g.railFront(x)) {
      R(X, f - 7, 1, 2, '#c8a040', fx); R(X, f - 7, 1, 1, '#f0d070', fx); R(X, f - 8, 1, 1, OUT, fx); R(X, f - 5, 1, 1, OUT, fx);
      if (X % 14 === 0) R(X, f - 5, 1, 5, '#8a6a2a', fx);
    }
  }
  // veines du bois, limitées au dessus du comptoir
  ctx.save();
  surfacePath(ctx, g);
  ctx.clip();
  const { top: st, bot: sb } = spanOf(g);
  for (let y = st; y < sb; y++) {
    for (let x = Math.floor(rnd() * 20); x < EDGE; x += 12 + Math.floor(rnd() * 30)) {
      R(x, y, 4 + Math.floor(rnd() * 14), 1, look.grain[rnd() < 0.5 ? 0 : 1]);
    }
  }
  ctx.restore();
  // marbre : quelques veines en biais ; billard : les mouches blanches du tapis
  if (g.look === 'marbre' || g.look === 'tapis') {
    ctx.save();
    surfacePath(ctx, g);
    ctx.clip();
    for (let k = 0; k < (g.look === 'marbre' ? 14 : 6); k++) {
      const x0 = X0 + 40 + Math.floor(rnd() * (P.L - 60)), y0 = st + Math.floor(rnd() * (sb - st));
      if (g.look === 'tapis') { R(x0, y0, 1, 1, 'rgba(240,250,240,0.5)'); continue; }
      for (let j = 0; j < 8 + rnd() * 10; j++) R(x0 + j, y0 + Math.round(j * 0.5 + Math.sin(j) * 0.8), 1, 1, 'rgba(120,110,100,0.45)');
    }
    ctx.restore();
  }
  // repères à la craie : 10, 25, 50 et 100 cm du bout
  for (const cm of [10, 25, 50, 100]) {
    const X = Math.round(EDGE - cm / P.CM);
    R(X, bAt(X), 1, 3, 'rgba(240,235,220,0.6)'); R(X, fAt(X) - 3, 1, 3, 'rgba(240,235,220,0.6)');
  }
  // bout du comptoir (le vide commence ici)
  const eb = bAt(EDGE - 1), ef = fAt(EDGE - 1);
  R(EDGE, eb - 4, 4, FLOOR - eb + 4, '#4a2612'); R(EDGE + 1, eb - 3, 2, FLOOR - eb + 2, '#5a3018');
  R(EDGE, ef, 4, 2, '#c8a040');
  R(EDGE + 4, eb - 4, 1, FLOOR - eb + 4, OUT);
  art = { back: c, front: fc };
  counterArts.set(g.id, art);
  return art;
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
  // tord-boyaux : verre trouble, alcool verdâtre, trois croix sur l'étiquette
  tord: () => pixelSprite(14, 16, 7, 14, (R) => {
    R(-4, -11, 8, 11, '#c8d8c0');
    R(-3, -9, 6, 8, '#7a8a2a'); R(-3, -9, 1, 8, '#9aaa40'); R(2, -9, 1, 8, '#5a6a1a');
    R(-3, -10, 6, 1, '#b8c060');
    R(-2, -7, 1, 1, '#2a180c'); R(0, -7, 1, 1, '#2a180c'); R(2, -7, 1, 1, '#2a180c');
    // bulles dans l'alcool (au-dessus du verre, elles flottaient seules, cerclées de noir)
    R(-2, -9, 1, 1, '#d8e8b0'); R(1, -8, 1, 1, '#d8e8b0');
    R(-4, -1, 8, 1, '#a8b8a0');
  }),
  // bière au piment : rousse, un piment rouge accroché au bord
  piment: () => pixelSprite(18, 18, 8, 16, (R) => {
    mugBody(R, '#c84a1a', '#e8702a', '#902a10', '#fde0c0', '#f0c8a0');
    R(4, -15, 2, 1, '#3a8a2a'); R(5, -14, 2, 2, '#d02a1a'); R(6, -12, 2, 3, '#d02a1a'); R(7, -9, 1, 2, '#a01a10');
    R(5, -14, 1, 1, '#f06a50');
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
const LABEL = { blonde: [-3, -5, 6, 2], brune: [-3, -5, 6, 2], mousse: [-3, -5, 6, 2], shot: [-2, -3, 4, 1], geante: [-5, -8, 10, 3], tord: [-3, -4, 6, 2], piment: [-3, -5, 6, 2] };
const mugs = new Map();
function mug(col, beer = 'blonde') {
  const b = BEERS[beer]?.art || beer; // les deux tord-boyaux ont le même verre
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

// obstacles des comptoirs (pieds en 0,0), dessinés une fois ; h : hauteur, pour la bulle d'aide au survol
const PROP_ART = {
  // tireuse à bière en laiton
  tap: () => pixelSprite(16, 30, 8, 28, (R) => {
    R(-6, -3, 12, 3, '#8a6a2a'); R(-6, -3, 12, 1, '#c8a040');
    R(-2, -20, 4, 17, '#c8a040'); R(-2, -20, 1, 17, '#f0d070'); R(1, -20, 1, 17, '#8a6a2a');
    R(-5, -22, 10, 3, '#c8a040'); R(-5, -22, 10, 1, '#f0d070');
    R(-4, -27, 2, 5, '#2a180c'); R(-4, -28, 2, 1, '#d02a1a'); R(2, -27, 2, 5, '#2a180c'); R(2, -28, 2, 1, '#e8a830');
    R(-5, -17, 3, 1, '#8a6a2a'); R(-5, -16, 1, 2, '#8a6a2a'); R(3, -17, 3, 1, '#8a6a2a'); R(5, -16, 1, 2, '#8a6a2a');
  }),
  // tonneau debout, cerclé de fer, la bonde sur le côté
  fut: () => pixelSprite(18, 20, 9, 18, (R) => {
    R(-6, -15, 12, 15, '#8a5a30'); R(-7, -13, 14, 11, '#8a5a30');
    R(-5, -15, 1, 15, '#a8743e'); R(-6, -13, 1, 11, '#a8743e'); R(-2, -15, 1, 15, '#6a4220'); R(2, -15, 1, 15, '#6a4220');
    R(4, -15, 2, 15, '#6a4220'); R(5, -13, 2, 11, '#5a3418');
    R(-7, -12, 14, 2, '#3a3438'); R(-7, -12, 14, 1, '#6a6268'); R(-7, -5, 14, 2, '#3a3438'); R(-7, -5, 14, 1, '#6a6268');
    R(-6, -16, 12, 1, '#5a3a22'); R(-5, -17, 10, 1, '#a8743e');
    R(1, -9, 2, 2, '#3a2214');
  }),
  // caisse enregistreuse en laiton : clavier, fenêtre du prix, manivelle
  caisse: () => pixelSprite(26, 28, 12, 26, (R) => {
    R(-10, -9, 20, 9, '#b08830'); R(-10, -9, 20, 1, '#f0d070'); R(-10, -1, 20, 1, '#7a5a20');
    R(-8, -7, 16, 3, '#3a2214');
    for (let k = 0; k < 5; k++) { R(-7 + k * 3, -7, 2, 1, '#fdf6e0'); R(-7 + k * 3, -5, 2, 1, '#e8d8b0'); }
    R(-7, -18, 14, 9, '#c8a040'); R(-7, -18, 14, 1, '#f0d070'); R(-7, -18, 1, 9, '#f0d070'); R(6, -18, 1, 9, '#8a6a2a');
    R(-5, -16, 10, 1, '#8a6a2a'); R(-5, -13, 10, 1, '#8a6a2a');
    R(-4, -23, 8, 5, '#c8a040'); R(-3, -22, 6, 3, '#fdf6e0'); R(-2, -21, 1, 1, '#2a180c'); R(1, -21, 1, 1, '#2a180c');
    R(-4, -24, 8, 1, '#f0d070');
    R(7, -14, 3, 1, '#8a6a2a'); R(9, -18, 1, 4, '#8a6a2a'); R(9, -20, 2, 2, '#d02a1a');
  }),
  // plot de billard : poteau de laiton, anneau de caoutchouc rouge
  plot: () => pixelSprite(12, 14, 6, 12, (R) => {
    R(-4, -4, 8, 4, '#c03a2a'); R(-4, -4, 8, 1, '#f06a50'); R(-4, -1, 8, 1, '#802018');
    R(-2, -9, 4, 5, '#c8a040'); R(-2, -9, 1, 5, '#f0d070'); R(1, -9, 1, 5, '#8a6a2a');
    R(-3, -10, 6, 1, '#f0d070');
  }),
};
const PROP_H = { tap: 28, fut: 17, caisse: 24, plot: 10 };
const propArts = new Map();
const propArt = (k) => propArts.get(k) || propArts.set(k, PROP_ART[k]()).get(k);

// cloison en travers du comptoir : une planche coiffée de laiton
function drawWall(ctx, w) {
  const [x1, y1, x2, y2] = w;
  const n = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1));
  for (let k = 0; k <= n; k++) {
    const X = sx(x1 + ((x2 - x1) * k) / n), Y = sy(y1 + ((y2 - y1) * k) / n);
    ctx.fillStyle = OUT; ctx.fillRect(X - 2, Y - 8, 5, 9);
  }
  for (let k = 0; k <= n; k++) {
    const X = sx(x1 + ((x2 - x1) * k) / n), Y = sy(y1 + ((y2 - y1) * k) / n);
    ctx.fillStyle = '#6a3a1e'; ctx.fillRect(X - 1, Y - 7, 3, 7);
    ctx.fillStyle = '#c8a040'; ctx.fillRect(X - 1, Y - 7, 3, 1);
  }
  const X = sx(Math.max(x1, x2)), Y = sy(Math.max(y1, y2));
  ctx.fillStyle = '#4a2612'; ctx.fillRect(X - 1, Y - 6, 3, 6);
  ctx.fillStyle = '#f0d070'; ctx.fillRect(X - 1, Y - 7, 3, 1);
}

// le chat du saloon, roulé en boule (face : de quel côté dort sa tête)
let catArt = null;
const cat = () => (catArt ||= pixelSprite(20, 14, 10, 12, (R) => {
  R(-8, -7, 14, 7, '#d8883a'); R(-7, -8, 12, 1, '#d8883a');
  R(-6, -6, 3, 5, '#b86a24'); R(-1, -7, 2, 6, '#b86a24'); R(3, -6, 2, 5, '#b86a24'); // rayures
  R(-8, -2, 14, 2, '#f0b070');
  R(4, -10, 6, 6, '#d8883a'); R(4, -12, 2, 2, '#d8883a'); R(8, -12, 2, 2, '#d8883a'); // tête et oreilles
  R(5, -11, 1, 1, '#f0a0a0'); R(9, -11, 1, 1, '#f0a0a0');
  R(5, -8, 2, 1, '#2a180c'); R(8, -8, 2, 1, '#2a180c'); R(7, -6, 1, 1, '#f07070'); // yeux fermés, truffe
  R(-9, -3, 2, 3, '#d8883a'); R(-9, -1, 8, 1, '#b86a24'); // queue enroulée
}));

// sous-bock en carton, posé à plat
function drawMat(ctx, mt) {
  const x = sx(mt.x), y = sy(mt.y), r = P.MAT_R;
  for (let k = -r; k <= r; k++) {
    const w = Math.round(Math.sqrt(r * r - k * k) * 1.6);
    ctx.fillStyle = Math.abs(k) === r ? OUT : '#e87858';
    ctx.fillRect(x - w, y + Math.round(k * 0.7), 2 * w + 1, 1);
  }
  ctx.fillStyle = '#fdf6e0';
  ctx.fillRect(x - 5, y - 1, 11, 1); ctx.fillRect(x - 3, y + 1, 7, 1);
  ctx.fillStyle = OUT;
  ctx.fillRect(x - Math.round(r * 1.6) - 1, y, 1, 1); ctx.fillRect(x + Math.round(r * 1.6) + 1, y, 1, 1);
}

// rot : la chope qui tombe tourne par quarts de tour (une rotation quelconque déforme les pixels)
const QUARTS = [[1, 0], [0, 1], [-1, 0], [0, -1]];
function drawMug(ctx, x, y, col, rot = 0, b = 'blonde') {
  const m = mug(col, b);
  const k = ((Math.round(rot / (Math.PI / 2)) % 4) + 4) % 4;
  if (!k) return ctx.drawImage(m, Math.round(x) - m.ox, Math.round(y) - m.oy);
  const [c, s] = QUARTS[k];
  ctx.save();
  ctx.transform(c, s, -s, c, Math.round(x), Math.round(y) - 6);
  ctx.drawImage(m, -m.ox, -m.oy + 6);
  ctx.restore();
}

// cartouche sombre bordé d'une couleur : le texte posé dessus se lit sur n'importe quel décor
function plate(ctx, x, y, w, h, col) {
  ctx.fillStyle = OUT; ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
  ctx.fillStyle = 'rgba(26,15,10,0.9)'; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = col; ctx.fillRect(x, y, w, 1); ctx.fillRect(x, y + h - 1, w, 1);
}
const textW = (str, size = 8) => textSprite(String(str), size, '#fdf6e0', '#1a0f0a').w;

const hash = (n) => { const x = Math.sin(n * 127.1) * 43758.5453; return x - Math.floor(x); };

// Ce qui ne bouge pas (flaque, sciure, givre, cire) est dessiné une fois par manche, limité au dessus du comptoir
const modsArts = S.lru(4);
function modsArt(m, g) {
  if (!m || !(m.puddle || m.saw || m.slick)) return null;
  const key = `${g.id}|${m.puddle ? `${m.puddle.a},${m.puddle.w}` : ''}|${m.saw ? `${m.saw.a},${m.saw.w}` : ''}|${m.slick || ''}`;
  let c = modsArts.get(key);
  if (c) return c;
  c = S.makeCanvas(W, H);
  const ctx = c.getContext('2d');
  surfacePath(ctx, g);
  ctx.clip();
  drawPuddle(ctx, m.puddle, 0, g, true);
  drawMods(ctx, m, 0, null, g, true);
  modsArts.set(key, c);
  return c;
}

// Décor des modificateurs posé sur le comptoir (sciure, vent, cire, gel, virage) ;
// still : seulement la partie fixe (voir modsArt), sinon seulement ce qui bouge ; wide : le vent qui traverse la salle
function drawMods(ctx, m, now, env, g, still = false, wide = false) {
  if (!m) return;
  const R = (x, y, w, h, col) => { ctx.fillStyle = col; ctx.fillRect(Math.round(x), Math.round(y), w, h); };
  const { top: TOP, bot: FRONT } = spanOf(g), D = FRONT - TOP;
  if (m.slick) {
    // gel : givre bleuté ; cire : le comptoir brille et un reflet passe
    if (!still) {
      const gx = ((now * 0.12) % (EDGE + 160)) - 80;
      for (let y = TOP; y < FRONT; y++) R(gx + (y - TOP) * 0.6, y, 5, 1, 'rgba(255,255,255,0.22)');
    } else if (m.slick < 0.7) {
      R(0, TOP, EDGE, D, 'rgba(200,230,255,0.28)');
      for (let k = 0; k < 90; k++) R(hash(k) * EDGE, TOP + hash(k + 50) * D, 1, 1, 'rgba(255,255,255,0.75)');
      for (let x = 0; x < EDGE; x += 3) R(x, TOP, 2, 1 + Math.floor(hash(x) * 3), 'rgba(240,250,255,0.6)');
    } else R(0, TOP, EDGE, D, 'rgba(255,240,210,0.1)');
  }
  if (still) {
    if (m.saw) drawSaw(R, m.saw, TOP, FRONT, D);
    return;
  }
  // courant d'air (zone) ou vent qui traverse toute la salle : poussière, neige ou pluie qui file
  const speck = env === 'neige' ? 'rgba(255,255,255,0.85)' : env === 'poussiere' ? 'rgba(200,150,90,0.8)' : env === 'orage' ? 'rgba(170,190,230,0.7)' : 'rgba(225,235,250,0.6)';
  if (m.wind) {
    const x0 = sx(m.wind.a), dir = Math.sign(m.wind.fy), span = D + 40;
    for (let k = 0; k < Math.round(m.wind.w / 3); k++) {
      const ph = ((now * 0.07 + hash(k) * span) % span);
      const y = dir > 0 ? TOP - 20 + ph : FRONT + 20 - ph;
      R(x0 + hash(k + 9) * m.wind.w, y, 1, 3, speck);
    }
    // chevrons à la craie sur le rebord : sens de la poussée
    const cx = Math.round(x0 + m.wind.w / 2), y0 = dir > 0 ? sy(g.frontAt(m.wind.a + m.wind.w / 2)) - 5 : sy(g.backAt(m.wind.a + m.wind.w / 2)) + 4;
    if (Math.floor(now / 300) % 2) for (let k = 0; k < 3; k++) R(cx - 2 + k, y0 + dir * k, 5 - 2 * k, 1, 'rgba(240,235,220,0.8)');
  }
  if (m.push && wide) {
    const dir = Math.sign(m.push);
    for (let k = 0; k < 26; k++) {
      const ph = (now * 0.16 + hash(k) * (W + 40)) % (W + 40);
      R(dir > 0 ? ph - 20 : W + 20 - ph, 30 + hash(k + 3) * (FLOOR - 40), 4, 1, speck);
    }
  }
  if (m.tilt) {
    // le comptoir penche : des flèches à la craie montrent de quel côté
    const dir = Math.sign(m.tilt);
    for (let x = 40; x < EDGE - 20; x += 60) {
      const y0 = dir > 0 ? sy(g.frontAt(x - X0)) - 4 : sy(g.backAt(x - X0)) + 3;
      const off = Math.floor(now / 250) % 2;
      for (let k = 0; k < 3; k++) R(x - 2 + k, y0 + dir * (off + (k === 1 ? 1 : 0)), 1, 1, 'rgba(240,235,220,0.7)');
    }
  }
}

// sciure répandue sur le comptoir (partie fixe)
function drawSaw(R, saw, TOP, FRONT, D) {
  const x0 = sx(saw.a), w = saw.w;
  R(x0, TOP + 1, w, D - 2, 'rgba(216,192,136,0.4)');
  // bords irréguliers : la sciure déborde un peu de sa zone
  for (let y = TOP + 1; y < FRONT - 1; y += 2) {
    const l = Math.round(hash(y + saw.a) * 3), r = Math.round(hash(y * 1.7 + w) * 3);
    R(x0 - l, y, l, 2, 'rgba(216,192,136,0.4)'); R(x0 + w, y, r, 2, 'rgba(216,192,136,0.4)');
  }
  for (let k = 0; k < w * 5; k++) {
    const h = hash(k + saw.a);
    R(x0 + h * w, TOP + 1 + hash(k * 3.1 + 7) * (D - 2), 1 + (h > 0.75), 1, h < 0.4 ? '#f0dca0' : h < 0.75 ? '#d0aa6a' : '#9a7444');
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
    // le volet pivote sur ses gonds : il s'amincit jusqu'à n'être plus qu'une tranche, puis passe côté mur
    // (sans ce passage par la tranche, il sautait d'un côté à l'autre du gond)
    const sw = Math.cos(open * Math.PI), wall = sw < 0;
    const ww = Math.round(wall ? -sw * half * 0.2 : sw * half) + 2;
    const x = d > 0 ? hx - (wall ? ww : 0) : hx - (wall ? 0 : ww);
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

// flaque de bière : la nappe (still, partie fixe, voir modsArt), sinon ses reflets qui courent
function drawPuddle(ctx, pd, now, g, still = false) {
  if (!pd) return;
  const x0 = sx(pd.a), w = Math.round(pd.w);
  const { top: TOP, bot: FRONT } = spanOf(g);
  for (let y = TOP + 2; still && y < FRONT - 1; y++) {
    const k = y - TOP;
    const l = Math.round(Math.sin(k * 0.9 + pd.a) * 2 + Math.sin(k * 0.4) * 2);
    const r = Math.round(Math.cos(k * 0.7 + pd.w) * 2 + Math.sin(k * 0.3 + 1) * 2);
    ctx.fillStyle = 'rgba(232,168,48,0.5)';
    ctx.fillRect(x0 + l + 2, y, w - l + r - 4, 1);
  }
  if (still) return;
  ctx.fillStyle = 'rgba(255,240,200,0.7)';
  for (let k = 0; k < 4; k++) {
    const gx = x0 + 5 + ((k * 17 + Math.floor(now / 90)) % Math.max(1, w - 10));
    ctx.fillRect(gx, sy(g.mid(gx - X0)) - 8 + ((k * 7) % 16), 2, 1);
  }
}

// cadran de direction et jauge de puissance (couleurs : voir Zones)
const DIAL = { cx: 64, cy: 192, r: 20, k: (G) => (G.rails ? 1.3 : 0.7) / G.maxa };
const BAR = { bx: 112, by: 182, bw: 180, bh: 8 };
// l'arc du cadran, pixel par pixel : un anneau de 2 pixels d'épaisseur, chaque pixel avec sa direction
// (des carrés 2×2 posés le long de l'arc se chevauchaient en escalier et laissaient des pixels qui dépassaient)
const rings = new Map();
function dialRing(maxa, kk) {
  const key = `${maxa}|${kk}`;
  let ring = rings.get(key);
  if (ring) return ring;
  const { cx, cy, r } = DIAL;
  ring = [];
  for (let y = cy - r - 2; y <= cy + 1; y++) {
    for (let x = cx - r - 2; x <= cx + r + 2; x++) {
      const dx = x - cx, dy = y - cy, d = Math.sqrt(dx * dx + dy * dy);
      if (d < r - 0.5 || d >= r + 1.5) continue;
      const ang = (Math.atan2(dy, dx) + Math.PI / 2) / kk;
      if (Math.abs(ang) <= maxa) ring.push([x, y, ang]);
    }
  }
  rings.set(key, ring);
  return ring;
}
// jauge éteinte : avant de bloquer la direction, ou dans le noir
let barOff = null;
function barDark() {
  if (barOff) return barOff;
  const { bw, bh } = BAR;
  barOff = S.makeCanvas(bw + 4, bh + 4);
  const ctx = barOff.getContext('2d');
  ctx.fillStyle = OUT; ctx.fillRect(0, 0, bw + 4, bh + 4);
  ctx.fillStyle = '#4a3020'; ctx.fillRect(2, 2, bw, bh);
  ctx.fillStyle = '#5a3a26'; ctx.fillRect(2, 2, bw, 1);
  return barOff;
}

// flèche courbe du tord-boyaux (vers le bas ; retournée quand il tourne vers le haut)
const CURL_ARROW = [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [5, 1], [6, 2], [7, 3], [7, 4], [7, 5], [7, 6], [6, 5], [8, 5], [5, 4], [9, 4]];

// ------------------------------------------------------------ bulles d'aide (survol, ou toucher la légende)
const TIP_W = 196;
const TIP_DIR = { title: 'DIRECTION', body: 'VERT : UNE PUISSANCE AU MOINS AMÈNE TA CHOPE PRÈS DU BOUT. ROUGE : ELLE TOMBE OU RESTE LOIN, QUOI QUE TU FASSES', col: '#b8e070' };
const TIP_POW = { title: 'PUISSANCE', body: 'OR : AU RAS DU BOUT. VERT : ELLE RESTE SUR LE COMPTOIR. ROUGE : ELLE TOMBE. (LES CHOPES DÉJÀ POSÉES NE COMPTENT PAS)', col: '#e8b838' };
const wraps = new Map();
const wrapped = (text) => {
  let l = wraps.get(text);
  if (!l) { if (wraps.size > 200) wraps.clear(); wraps.set(text, (l = wrap(text, TIP_W - 10))); }
  return l;
};
// « TITRE : EXPLICATION » coupé en deux (le titre en couleur)
const split = (txt, col) => {
  const k = txt.indexOf(' : ');
  return k < 0 ? { title: txt, col } : { title: txt.slice(0, k), body: txt.slice(k + 3), col };
};

// ------------------------------------------------------------ scène
export class PinteScene extends MiniScene {
  constructor(canvas, hooks) {
    super(canvas, hooks);
    this.kind = 'pinte';
    this.cur = null;
    this.falls = []; // la boucle d'animation tourne avant le début de la partie
  }

  title() { return 'LA PINTE'; }
  variantName() { return this.room?.def.name; }
  help() {
    return [
      'FAIS GLISSER TA CHOPE AU RAS DU BOUT DU COMPTOIR',
      this.touch ? 'TOUCHE L\'ÉCRAN : BLOQUE LA DIRECTION, PUIS LA PUISSANCE' : 'CLIC OU ESPACE : BLOQUE LA DIRECTION, PUIS LA PUISSANCE',
      'TROP FORT OU DE TRAVERS, ELLE TOMBE : 0 PT',
      'POUSSE LES CHOPES DES AUTRES DANS LE VIDE !',
      'CHAQUE MANCHE SES SURPRISES, ET LE BARMAN CHANGE DE BIÈRE',
      'GARE AUX ÉVÉNEMENTS : BAGARRE, DOUBLE SERVICE, TOUT OU RIEN…',
    ];
  }
  goText() { return ''; }

  clock() {
    const c = this.cur;
    return c && c.phase === 'aim' && this.t >= c.turnAt ? Math.max(0, c.turnAt + P.AIM - this.t) : null;
  }
  progress() { const ms = this.clock(); return ms == null ? 0 : ms / P.AIM; }
  // le tic-tac presse le joueur qui vise
  mood() {
    if (this.over || this.t < 0) return super.mood();
    const ms = this.clock();
    return { level: 0.5, tick: ms != null && ms < 4000 };
  }

  setup(seed) {
    this.showEnv = true;
    // mode histoire : la salle peut être celle de l'épisode (deco.room : le Buckshot de Rosa, room.js), et un calque
    // propre au lieu se pose sur le décor (deco.set : Le Dernier Verre de Red Rock, le bureau du shérif ; routesdeco.js)
    const deco = this.hooks.story?.deco;
    this.room = new Room(seed, this.state.variant, deco?.room ? { room: deco.room } : null);
    this.sd = null;
    if (deco?.set) {
      const room = this.room;
      import('./routesdeco.js').then((m) => m.pinteDeco(deco, room.tint)).then((c) => { if (this.room === room) this.sd = c; })
        .catch((e) => console.warn('décor de l’épisode', e));
    }
    // le comptoir est celui de la salle : son ambiance (météo) est celle qu'on annonce et qui choisit les surprises
    this.env = this.room.env;
    this.amb = this.room.amb;
    this.cur = null;
    this.slide = null;
    this.falls = [];
    this.aim = null;
    this.remoteAim = null;
    this.best = null;
    this.zones = null; // jauges de la manche et de la bière servie (voir Zones)
    this.hits = []; // zones de l'écran qui ont une bulle d'aide (légende, cadran, jauge), refaites à chaque image
    this.pinned = null; // bulle ouverte d'un toucher sur la légende
  }

  applySync(st) {
    if (st.round) this.cur = st.round;
  }

  // texte flottant gardé dans l'écran (au bout du comptoir, « DANS LE VIDE ! » débordait à droite)
  popup(x, y, text, col, big = false) {
    if (this.cur?.phase === 'score') return;
    const half = Math.ceil(measureW(text, big ? 16 : 8) / 2) + 2;
    super.popup(clampI(Math.round(x), half, W - half), y, text, col, big);
  }

  get g() { return counterOf(this.cur?.mods); }
  get thrower() { const c = this.cur; return c && c.phase === 'aim' ? c.order[c.turn] : null; }
  get myTurn() { return this.thrower === this.me && this.t >= this.cur.turnAt && this.playing; }

  // ---------------------------------------------------------- entrées
  // un clic (ou un toucher) sur la légende ne lance pas. À la souris, le survol montre déjà la bulle : on n'épingle
  // rien (épinglée, elle restait affichée après avoir quitté la légende). Au doigt, le toucher ouvre la bulle,
  // et le suivant (n'importe où, ou sur la même ligne) la referme.
  onFire(pos) {
    const h = pos && this.hits.find((z) => z.legend && inBox(z, pos.x, pos.y));
    const was = this.pinned;
    this.pinned = null;
    if (h) {
      if (this.touch && was?.tip !== h.tip) this.pinned = { tip: h.tip, x: pos.x, y: pos.y, until: this.now + 3500 };
      return;
    }
    if (!was) this.press();
  }
  onKey(k) { if (k === ' ' || k === 'enter') this.press(); }

  press() {
    const a = this.aim, c = this.cur, t = this.t;
    if (!a || !this.myTurn) return;
    if (a.stage === 'dir') {
      a.a = dirAt(t - a.t0, this.g);
      a.stage = 'pow';
      a.t0 = t;
      sfx('tick');
      this.sendLive({ n: c.n, turn: c.turn, s: 'pow', a: a.a, t }, true);
    } else if (a.stage === 'pow') {
      a.p = powAt(t - a.t0);
      a.stage = 'sent';
      sfx('click');
      this.hooks.send({ kind: 'throw', n: c.n, turn: c.turn, power: a.p, angle: a.a });
      // les autres voient la jauge s'arrêter tout de suite, sans attendre le lancer renvoyé par l'hôte
      this.sendLive({ n: c.n, turn: c.turn, s: 'go', a: a.a, p: a.p, t }, true);
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
      this.slide = { sim: new Slide(ev.start, ev.mods || c.mods), at: startAt(ev, this.t), seen: 0, who: ev.who, id: ev.start[ev.start.length - 1].id };
      sfx('rope');
    } else if (ev.type === 'pBrawl') {
      // la bagarre est annoncée, puis le comptoir est bousculé (même glissade que chez l'hôte)
      this.cur = c;
      this.aim = null;
      this.remoteAim = null;
      this.slide = { sim: new Slide(ev.start, ev.mods || c.mods), at: startAt(ev, this.t) + (ev.delay || 0), seen: 0, who: null, id: null, brawl: true };
      sfx('yell');
      sfx('crate', 0.25);
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
    // compactées sur place (pas de nouveau tableau à chaque image)
    let np = 0;
    for (const p of this.parts) {
      p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += (p.g || 0) * dt;
      if (p.t < p.max) this.parts[np++] = p;
    }
    this.parts.length = np;
    // la glissade avance au rythme de l'horloge de la partie
    const sl = this.slide;
    if (sl) {
      const el = t - sl.at;
      if (sl.brawl && el >= 0 && !sl.shook) { sl.shook = true; this.shake = 5; sfx('thud'); sfx('glass', 0.05); }
      // la simulation avance par pas de P.DT ms : chaque chope garde sa position du pas d'avant (px, py),
      // pour être dessinée entre les deux (sans quoi elle avance de 2 ou 3 pas selon l'image, par saccades)
      while (!sl.sim.done && sl.sim.t <= el) {
        for (const q of sl.sim.p) { q.px = q.x; q.py = q.y; }
        sl.sim.step();
      }
      for (; sl.seen < sl.sim.log.length; sl.seen++) this.slideEvent(sl.sim.log[sl.seen], sl);
      const saw = sl.sim.m.saw;
      if (saw) {
        for (const q of sl.sim.p) {
          const v = Math.hypot(q.vx, q.vy);
          if (q.out || v < 0.01 || q.x < saw.a || q.x > saw.a + saw.w || Math.random() > v * 4 * dt / 16) continue;
          this.parts.push({
            x: sx(q.x) - q.r + Math.random() * 2 * q.r, y: sy(q.y) - 1, vx: -q.vx * (0.2 + Math.random() * 0.3) + (Math.random() - 0.5) * 0.04,
            vy: -0.03 - Math.random() * 0.05, g: 0.00025, t: 0, max: 300 + Math.random() * 300, col: Math.random() < 0.5 ? '#f0dca0' : '#c8a060', r: 1,
          });
          if (!sl.sawAt || this.now - sl.sawAt > 260) { sl.sawAt = this.now; sfx('sand'); }
        }
      }
      if (sl.sim.done && el >= sl.sim.t) {
        // l'écart annoncé est celui de l'hôte (c'est lui qui compte les points), pas celui de la glissade rejouée ici
        const q = sl.id == null ? null : this.cur?.pints?.find((x) => x.id === sl.id);
        if (q) {
          const cm = gapCm(q);
          this.popup(sx(q.x), sy(q.y) - 22, cm === 0 ? 'AU RAS !' : `${cm} CM`, this.color(q.o), cm <= 5);
          if (cm <= 5) sfx('good');
          if (onMat(this.cur.mods, q)) {
            this.popup(sx(q.x), sy(q.y) - 34, `SOUS-BOCK : +${P.MAT}`, MODS.sousbock.col, true);
            sfx('coin');
          }
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
        // tombée derrière le comptoir : on ne la voit pas se briser, mais des éclats et de la mousse jaillissent
        else this.splash(pos.x, sy(this.g.backAt(f.x)) - 4);
      }
    }
    this.falls = this.falls.filter((f) => !f.broken);
    // jauges de la bière servie à ce tour (ou au suivant, pendant la glissade) : quelques directions par image
    const c = this.cur, turn = c && (c.phase === 'aim' ? c.turn : c.turn + 1), b = c?.beers?.[turn];
    if (b && c.phase !== 'score') {
      if (this.zones?.n !== c.n || this.zones.b !== b) this.zones = Object.assign(new Zones(c.mods, b), { n: c.n });
      if (!this.zones.done) this.zones.work(4);
    }
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
    } else if (e.type === 'spicy') {
      sfx('puff');
      sfx('dry', 0.02);
      if (q && e.v > 0.02 && sl.sim.t - (sl.tchin ?? -1e9) > 400) {
        sl.tchin = sl.sim.t;
        this.popup(sx(q.x), sy(q.y) - 20, 'CARAMBA !', '#f0705a', e.v > 0.08);
        this.spark(sx(q.x), sy(q.y) - 6, ['#f0705a', '#f8d070', '#d02a1a']);
      }
    } else if (e.type === 'meow') {
      if (e.v > 0.01) sfx('meow');
      if (q && e.v > 0.02) this.popup(sx(sl.sim.m.cat.x), sy(sl.sim.m.cat.y) - 20, 'MIAOU !', '#f0b070', e.v > 0.1);
      sl.catAt = this.now;
    } else if (e.type === 'rail') {
      sfx('clank', 0.02);
      // la chope lancée : RICOCHET, puis DOUBLE, TRIPLE… (une seule fois par choc franc)
      if (q && q.id === sl.id && e.v > 0.025 && sl.sim.t - (sl.railAt ?? -1e9) > 200) {
        sl.railAt = sl.sim.t;
        sl.rico = (sl.rico || 0) + 1;
        const txt = ['RICOCHET !', 'DOUBLE !', 'TRIPLE !'][sl.rico - 1] || `${sl.rico} BANDES !`;
        this.popup(sx(q.x), sy(q.y) - 20, txt, '#f0d070', sl.rico > 1);
      }
    } else if (e.type === 'bonk') {
      sfx('clank', 0.05);
      if (q && e.v > 0.03) this.popup(sx(q.x), sy(q.y) - 20, 'BONK !', '#b8e070');
    } else if (e.type === 'boing') {
      sfx('smack');
      sfx('ding', 0.03);
      if (q && e.v > 0.02) this.popup(sx(q.x), sy(q.y) - 20, 'BOING !', '#f06a50', e.v > 0.12);
      // le plot heurté (le plus proche de la chope) rougeoie un instant : voir drawProp
      const o = q && this.g.props.filter((p) => p.k === 'plot').sort((a, b) => Math.abs(a.x - q.x) + Math.abs(a.y - q.y) - Math.abs(b.x - q.x) - Math.abs(b.y - q.y))[0];
      if (o) (sl.boing ||= []).push({ x: o.x, y: o.y, at: this.now });
    } else if (e.type === 'coin' && q) {
      sl.coinGone = true;
      sfx('coin');
      this.popup(sx(q.x), sy(q.y) - 22, `+${P.COIN}`, '#f8d070', true);
      this.sparkle(sx(sl.sim.m.coin.x), sy(sl.sim.m.coin.y));
    } else if (e.type === 'fall' && q && !this.cur?.pints?.some((x) => x.id === q.id)) {
      // (l'hôte l'a gardée sur le comptoir : on ne montre pas une chute qui n'a pas eu lieu)
      // q.x, q.y : position à la fin du pas (e.t est son début) ; la chute part de là, sans à-coup
      this.falls.push({
        x: q.x, y: q.y, vx: q.vx, vy: q.vy, o: q.o, b: q.b, edge: e.edge, at: sl.at + e.t + P.DT,
        floor: e.edge === 'back' ? sy(this.g.backAt(q.x)) + 32 : e.edge === 'front' ? FLOOR + 6 : FLOOR + 3,
      });
      const mine = q.o === this.me;
      const by = sl.who == null || sl.who === q.o ? 'TOMBÉE !' : sl.who === this.me ? 'DANS LE VIDE !' : 'POUSSÉE !';
      const px = Math.min(W - 56, sx(q.x));
      this.popup(px, TOP - 44, by, mine ? '#f0705a' : '#f8d070', true);
      // casse payante, ou prime du shérif pour le lanceur
      const meta = sl.sim.m.meta;
      if (meta === 'casse') this.popup(px, TOP - 32, `-${META.CASSE}`, METAS.casse.col);
      else if (meta === 'chasse' && sl.who != null && sl.who !== q.o) {
        this.popup(px, TOP - 32, `PRIME +${META.PRIME}`, METAS.chasse.col);
        sfx('coin', 0.1);
      }
    }
  }

  // position d'une chope pendant la glissade, à l'instant de l'image : entre le pas d'avant et le pas en cours
  slidePos(q) {
    const sl = this.slide;
    if (q.px == null || (q.px === q.x && q.py === q.y)) return q;
    const k = Math.max(0, Math.min(1, (this.t - sl.at - (sl.sim.t - P.DT)) / P.DT));
    return { ...q, x: q.px + (q.x - q.px) * k, y: q.py + (q.y - q.py) * k };
  }

  // position à l'écran d'une chope qui tombe, el ms après avoir quitté le comptoir
  fallPos(f, el) {
    const slow = Math.min(el, 400);
    const drift = (e) => f.vx * Math.min(e, 400) * 0.7 + (f.edge === 'end' ? e * 0.02 : 0);
    // lancée fort, elle sortait de l'écran par la droite avant de toucher le plancher (et s'y brisait sans qu'on
    // le voie) : son élan est réduit juste assez pour qu'elle atterrisse dans l'image
    if (f.k == null) {
      const d = drift(Math.sqrt((2 * Math.max(0, f.floor - sy(f.y))) / GRAV));
      f.k = d > 0 ? clampI((W - 10 - (X0 + f.x)) / d, 0, 1) : 1;
    }
    const x = Math.round(X0 + f.x + drift(el) * f.k);
    const y = sy(f.y + f.vy * slow * 0.7) + 0.5 * GRAV * el * el;
    return { x, y, rot: (el / 140) * (f.edge === 'back' ? -1 : 1) };
  }

  spark(x, y, cols) {
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      this.parts.push({ x, y, vx: Math.cos(a) * 0.09, vy: Math.sin(a) * 0.07 - 0.04, g: 0.0003, t: 0, max: 450, col: cols[i % cols.length], r: 1 + (i % 3 === 0) });
    }
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

  // éclats de verre et mousse qui sautent par-dessus le rebord arrière, puis s'éteignent avant de retomber
  splash(x, y) {
    for (let i = 0; i < 10; i++) {
      this.parts.push({
        x: x - 4 + Math.random() * 8, y, vx: (Math.random() - 0.5) * 0.1, vy: -0.08 - Math.random() * 0.06, g: 0.0006,
        t: 0, max: 260 + Math.random() * 120, col: ['#e8f4fa', '#fdf6e0', '#e8a830'][i % 3], r: 1,
      });
    }
  }

  // ---------------------------------------------------------- rendu
  render(ctx) {
    if (!this.state || !this.room) return;
    this.hits.length = 0;
    const now = this.now, t = this.t, c = this.cur;
    const m = c?.mods;
    this.room.drawBack(ctx, now);
    if (this.sd) ctx.drawImage(this.sd, 0, 0);
    if (m?.wind && t >= 0) drawShutters(ctx, this.room, now);
    for (const f of this.falls) if (f.edge === 'back') this.drawFall(ctx, f, t);
    this.drawThrower(ctx);
    const g = this.g, art = counter(g);
    ctx.drawImage(art.back, 0, 0);
    const still = modsArt(m, g);
    if (still) ctx.drawImage(still, 0, 0);
    ctx.save();
    surfacePath(ctx, g);
    ctx.clip();
    drawPuddle(ctx, m?.puddle, now, g);
    drawMods(ctx, m, now, this.env?.id, g);
    ctx.restore();
    if (m?.push) drawMods(ctx, { push: m.push }, now, this.env?.id, g, false, true);
    if (m?.mat) drawMat(ctx, m.mat);
    this.drawGuide(ctx);
    // pièce d'or : encore là tant que personne ne l'a empochée (pendant une glissade, jusqu'au passage de la chope)
    const sl = this.slide;
    const coin = sl ? (!sl.coinGone && sl.sim.coin) : m?.coin && m.coin.by == null ? m.coin : null;
    if (coin) drawCoin(ctx, coin, now);
    // chopes et bouteilles du comptoir, de l'arrière vers l'avant
    const pints = sl ? sl.sim.p.filter((q) => !q.out).map((q) => this.slidePos(q)) : (c?.pints || []).slice();
    if (c && c.phase === 'aim' && t >= c.turnAt - 300) pints.push({ x: P.START, y: P.D / 2, o: c.order[c.turn], b: c.beers?.[c.turn] });
    const items = [...pints, ...(m?.bottles || []).map((o) => ({ ...o, bottle: true }))];
    if (m?.cat) items.push({ ...m.cat, cat: true });
    for (const o of g.props) items.push({ ...o, prop: o.k });
    for (const w of g.walls || []) items.push({ y: Math.max(w[1], w[3]), x: w[0], wall: w });
    items.sort((a, b) => a.y - b.y);
    for (const q of items) {
      if (q.wall) { drawWall(ctx, q.wall); continue; }
      const r = q.bottle ? P.BOTTLE_R : q.cat ? P.CAT_R : q.prop ? q.r : beerOf(q).r;
      // ombre portée au pied, un peu vers la droite (lumière en haut à gauche) : plus haut, le sprite la cachait toute
      ctx.fillStyle = 'rgba(40,20,10,0.35)';
      ctx.fillRect(sx(q.x) - r, sy(q.y), 2 * r + 2, 2);
      if (q.prop) this.drawProp(ctx, q, now);
      else if (q.bottle) { const bt = bottle(); ctx.drawImage(bt, sx(q.x) - bt.ox, sy(q.y) - bt.oy); } else if (q.cat) this.drawCat(ctx, q, now);
      else drawMug(ctx, sx(q.x), sy(q.y), this.color(q.o), 0, q.b);
    }
    ctx.drawImage(art.front, 0, 0);
    for (const f of this.falls) if (f.edge !== 'back') this.drawFall(ctx, f, t);
    for (const p of this.parts) {
      ctx.globalAlpha = Math.min(1, 2 * (1 - p.t / p.max));
      ctx.fillStyle = p.col;
      ctx.fillRect(Math.round(p.x), Math.min(FLOOR + 8, Math.round(p.y)), p.r, p.r);
    }
    ctx.globalAlpha = 1;
    this.room.drawOverlay(ctx, now);
    // les lampes sont éteintes : toute la salle plonge dans la pénombre
    if (m?.meta === 'noir' && c.phase !== 'score' && t >= c.turnAt - 300) { ctx.fillStyle = 'rgba(6,4,18,0.55)'; ctx.fillRect(0, 0, W, H); }
    if (!c || t < 0) return;
    if (c.phase === 'score') this.drawScore(ctx, c);
    else { this.drawGauges(ctx); this.drawLegend(ctx, c); }
    this.drawBanner(ctx, c, t);
    this.drawTip(ctx);
  }

  // obstacle du comptoir ; le plot de billard rougeoie un instant quand une chope rebondit dessus
  drawProp(ctx, o, now) {
    const a = propArt(o.prop), x = sx(o.x), y = sy(o.y);
    ctx.drawImage(a, x - a.ox, y - a.oy);
    const hit = o.prop === 'plot' && this.slide?.boing?.find((h) => h.x === o.x && h.y === o.y);
    if (hit && now - hit.at < 200) {
      ctx.fillStyle = 'rgba(255,200,160,0.7)';
      ctx.fillRect(x - 5, y - 5, 10, 1); ctx.fillRect(x - 5, y - 1, 10, 1);
    }
  }

  // ---------------------------------------------------------- bulles d'aide
  // Sous le pointeur (souris) : la légende, le cadran, la jauge, puis ce qui est posé sur le comptoir.
  tipAt(mx, my) {
    for (const z of this.hits) if (inBox(z, mx, my)) return z.tip;
    const c = this.cur, m = c?.mods;
    if (!c || c.phase === 'score' || (c.turn === 0 && this.t < c.turnAt)) return null;
    const g = this.g;
    // un objet dont le pied est en (x, y) : r de demi-largeur, h de haut
    const on = (o, r, h) => Math.abs(mx - sx(o.x)) <= r + 1 && my <= sy(o.y) + 2 && my >= sy(o.y) - h;
    if (!this.slide) {
      for (const q of c.pints || []) {
        if (!on(q, beerOf(q).r + 1, 15)) continue;
        const who = q.o === this.me ? 'TA CHOPE' : `LA CHOPE DE ${this.name(q.o).toUpperCase()}`, cm = gapCm(q);
        return { title: who, body: `${beerOf(q).name} : ${cm ? `À ${cm} CM DU BOUT` : 'AU RAS DU BOUT !'}`, col: this.color(q.o) };
      }
    }
    if (m?.cat && on(m.cat, 9, 13)) return { title: 'LE CHAT DU SALOON', body: 'IL DORT SUR LE BORD. UNE CHOPE QUI LE HEURTE PERD PRESQUE TOUT SON ÉLAN : PASSE DE L\'AUTRE CÔTÉ', col: MODS.chat.col };
    for (const o of m?.bottles || []) if (on(o, 4, 18)) return { title: 'BOUTEILLE OUBLIÉE', body: 'ELLE NE BOUGE PAS : LA CHOPE REBONDIT DESSUS', col: MODS.bouteille.col };
    for (const o of g.props) if (on(o, o.r + 1, PROP_H[o.k])) return { title: PROPS[o.k].name, body: PROPS[o.k].desc, col: COUNTERS[g.id].col };
    for (const w of g.walls || []) {
      if (mx >= sx(Math.min(w[0], w[2])) - 2 && mx <= sx(Math.max(w[0], w[2])) + 2 && my >= sy(Math.min(w[1], w[3])) - 8 && my <= sy(Math.max(w[1], w[3])) + 1) {
        return { title: 'CLOISON', body: 'LA CHOPE RICOCHE DESSUS : SERS-T\'EN POUR CONTOURNER', col: COUNTERS[g.id].col };
      }
    }
    if (m?.mat && on(m.mat, 10, 6)) return { title: 'SOUS-BOCK', body: `ARRÊTE TA CHOPE DESSUS : +${P.MAT} PTS`, col: MODS.sousbock.col };
    const coin = m?.coin && m.coin.by == null && m.coin;
    if (coin && on(coin, 4, 6)) return { title: 'PIÈCE D\'OR', body: `LA PREMIÈRE CHOPE QUI PASSE DESSUS : +${P.COIN} PTS`, col: MODS.piece.col };
    // zones du comptoir, sous le pointeur
    const x = mx - X0;
    if (x < 0 || x > P.L || my < sy(g.backAt(x)) || my > sy(g.frontAt(x))) return null;
    const inZ = (z) => z && x >= z.a && x <= z.a + z.w;
    if (inZ(m?.puddle)) return { title: 'FLAQUE DE BIÈRE', body: 'LA CHOPE Y GLISSE : ELLE VA PLUS LOIN', col: MODS.flaque.col };
    if (inZ(m?.saw)) return { title: 'SCIURE', body: 'ÇA FREINE DUR : IL FAUT LANCER PLUS FORT POUR LA TRAVERSER', col: MODS.sciure.col };
    if (inZ(m?.wind)) return { title: 'COURANT D\'AIR', body: `IL POUSSE LA CHOPE VERS ${m.wind.fy > 0 ? 'TOI' : 'LE MUR'}`, col: MODS.vent.col };
    return null;
  }

  drawTip(ctx) {
    let tip = null, mx = 0, my = 0;
    if (this.pinned && this.now < this.pinned.until) ({ tip, x: mx, y: my } = this.pinned);
    else {
      this.pinned = null;
      if (this.touch || !this.mouse.in) return;
      ({ x: mx, y: my } = this.mouse);
      tip = this.tipAt(mx, my);
    }
    if (!tip) return;
    const head = wrapped(tip.title), lines = tip.body ? wrapped(tip.body) : [];
    const w = Math.min(TIP_W + 6, Math.max(...head.map((l) => measureW(l)), ...lines.map((l) => measureW(l))) + 14);
    const h = 3 + head.length * 10 + lines.length * 10;
    // à côté du pointeur, sans sortir de l'écran (au-dessus quand il est bas)
    const x = clampI(Math.round(mx + 8), 3, W - w - 4);
    const y = my + 12 + h > H - 2 ? Math.max(2, Math.round(my - h - 6)) : Math.round(my + 12);
    plate(ctx, x, y, w, h, tip.col || '#fdf6e0');
    head.forEach((l, k) => canvasText(ctx, l, x + 5, y + 3 + k * 10, { color: tip.col || '#fdf6e0', align: 'left' }));
    lines.forEach((l, k) => canvasText(ctx, l, x + 5, y + 3 + (head.length + k) * 10, { color: '#fdf6e0', align: 'left' }));
  }

  // le chat dort (il respire, des Z montent) ; heurté, il sursaute un instant
  drawCat(ctx, ct, now) {
    const sl = this.slide, jolt = sl?.catAt && now - sl.catAt < 300 ? -2 : 0;
    const spr = cat(), x = sx(ct.x), y = sy(ct.y) + jolt - (Math.floor(now / 700) % 2);
    if (ct.face < 0) {
      ctx.save();
      ctx.translate(x, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(spr, -spr.ox, y - spr.oy);
      ctx.restore();
    } else ctx.drawImage(spr, x - spr.ox, y - spr.oy);
    if (!jolt) {
      const ph = (now % 2100) / 2100;
      ctx.globalAlpha = 1 - ph;
      canvasText(ctx, 'z', x + ct.face * 8 + Math.round(ph * 4) * ct.face, y - 16 - Math.round(ph * 10), { color: '#fdf6e0' });
      ctx.globalAlpha = 1;
    }
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
      if (a.stage === 'dir') return { a: dirAt(t - a.t0, this.g), p: null, mine: true };
      if (a.stage === 'pow') return { a: a.a, p: powAt(t - a.t0), mine: true };
      return { a: a.a, p: a.p, mine: true };
    }
    const d = this.remoteAim;
    if (!d) return null;
    if (d.s === 'dir') return { a: dirAt(t - d.t, this.g), p: null };
    return d.s === 'go' ? { a: d.a, p: d.p } : { a: d.a, p: powAt(t - d.t) };
  }

  // la direction a mène-t-elle près du bout ? (null : pas encore calculé, ou pas de jauge pour cette bière)
  dirOk(a) {
    const z = this.zones, c = this.cur;
    return z && c && z.n === c.n && z.b === c.beers?.[c.turn] ? z.dirOk(a) : null;
  }

  // trajectoire visée : des points à la craie sur le comptoir, qui suivent les ricochets sur les rambardes
  // (avec tout ce qui est posé sur le comptoir et souffle dessus : chat, bouteilles, vent, pente…)
  drawGuide(ctx) {
    const aim = this.aimNow();
    if (!aim || this.cur.mods?.meta === 'noir') return;
    const g = this.g;
    // (sur le marbre et le zinc, clairs, la craie blanche ne se voyait pas : trait de crayon sombre)
    const pale = g.look === 'marbre' || g.look === 'zinc';
    ctx.fillStyle = this.dirOk(aim.a) === false ? (pale ? 'rgba(176,48,32,0.9)' : 'rgba(240,112,90,0.8)') : pale ? 'rgba(40,26,18,0.65)' : 'rgba(253,246,224,0.7)';
    // points gardés tant que la direction ne change pas (toute la phase de puissance)
    let gd = this.guide;
    const b = this.cur.beers?.[this.cur.turn] || 'blonde';
    if (!gd || gd.a !== aim.a || gd.cur !== this.cur || gd.b !== b) {
      // le tord-boyaux tourne surtout en fin de course : son guide va jusqu'au bout, à la puissance qui y mène
      // (à pleine puissance et sur 120 unités, la courbe ne se voyait pas)
      const curl = BEERS[b]?.curl, mods = this.cur.mods || { lay: g.id }, v = speedFor(curl ? 1 / P.REACH : 1, mods);
      const sim = new Slide([{ id: 0, b, x: P.START, y: P.D / 2, vx: v * Math.cos(aim.a), vy: v * Math.sin(aim.a) }], mods);
      const q = sim.p[0], len = curl ? P.L : g.rails ? 200 : 120, pts = [];
      let run = 0, next = 14, px = q.x, py = q.y;
      while (run < len && !sim.done && !q.out) {
        sim.step();
        run += Math.hypot(q.x - px, q.y - py);
        px = q.x; py = q.y;
        if (run >= next) { next += 7; pts.push(sx(q.x), sy(q.y)); }
      }
      gd = this.guide = { a: aim.a, cur: this.cur, b, pts };
    }
    for (let i = 0; i < gd.pts.length; i += 2) ctx.fillRect(gd.pts[i], gd.pts[i + 1], 2, 1);
  }

  drawGauges(ctx) {
    const g = this.aimNow();
    if (!g) return;
    const R = (x, y, w, h, col) => { ctx.fillStyle = col; ctx.fillRect(Math.round(x), Math.round(y), w, h); };
    // dans le noir, pas de couleurs : on vise au jugé
    const dark = this.cur.mods?.meta === 'noir';
    // direction : cadran, vert là où une puissance au moins amène la chope près du bout, l'aiguille par-dessus
    const G = this.g, { cx, cy, r, k } = DIAL, kk = k(G);
    R(cx - r - 4, cy - r - 4, 2 * r + 9, r + 6, 'rgba(26,15,10,0.7)');
    for (const [x, y, ang] of dialRing(G.maxa, kk)) {
      const ok = dark ? null : this.dirOk(ang);
      R(x, y, 1, 1, ok == null ? '#8a7a64' : ok ? '#b8e070' : '#f0705a');
    }
    const v = -Math.PI / 2 + g.a * kk;
    for (let d = 0; d < r - 2; d++) R(cx + Math.cos(v) * d, cy + Math.sin(v) * d, 1, 1, '#fdf6e0');
    R(cx - 1, cy - 1, 3, 3, '#f8d070');
    canvasText(ctx, 'DIRECTION', cx, cy - r - 14, { color: g.p == null ? '#fdf6e0' : '#a89880' });
    // puissance : la jauge s'allume une fois la direction bloquée (ses couleurs dépendent de la direction), puis
    // l'index fait l'aller-retour
    const { bx, by, bw, bh } = BAR, z = this.zones, c = this.cur;
    const live = g.p != null && !dark && z && z.n === c.n && z.b === c.beers?.[c.turn];
    ctx.drawImage(live ? z.barFor(g.a) : barDark(), bx - 2, by - 2);
    if (g.p != null) {
      const px = bx + Math.round(g.p * (bw - 1));
      R(px - 2, by - 4, 5, bh + 8, OUT);
      R(px - 1, by - 4, 3, bh + 8, '#fdf6e0');
      R(px - 2, by - 5, 5, 1, '#fdf6e0');
    }
    canvasText(ctx, 'PUISSANCE', bx + bw / 2, by - 14, { color: g.p != null ? '#fdf6e0' : '#a89880' });
    // bulles d'aide du cadran et de la jauge
    this.hits.push(
      { x: cx - r - 4, y: cy - r - 16, w: 2 * r + 9, h: r + 18, tip: dark ? { title: 'DIRECTION', body: 'LES LAMPES SONT ÉTEINTES : TU VISES AU JUGÉ', col: METAS.noir.col } : TIP_DIR },
      { x: bx - 2, y: by - 16, w: bw + 4, h: bh + 20, tip: dark ? { title: 'PUISSANCE', body: 'DANS LE NOIR, LA JAUGE NE DIT RIEN', col: METAS.noir.col } : TIP_POW },
    );
  }

  drawBanner(ctx, c, t) {
    if (t < c.turnAt && c.turn === 0 && c.phase === 'aim') {
      // annonce de la manche, de son comptoir, de ses surprises et de son événement, une ligne après l'autre
      const lay = c.mods?.lay && c.mods.lay !== 'droit' ? COUNTERS[c.mods.lay] : null;
      const ev = c.mods?.meta && METAS[c.mods.meta];
      const lines = [...(lay ? [[lay.name, lay.col]] : []), ...(c.mods?.list || []).map((id) => [modName(id, c.mods), MODS[id].col])];
      const items = lines.length + !!ev;
      if (ev) lines.push([`ÉVÉNEMENT : ${ev.title} !`, ev.col], [ev.name, '#fdf6e0']);
      ctx.fillStyle = 'rgba(26,15,10,0.85)';
      ctx.fillRect(0, 50, W, 32 + (lines.length ? 6 + lines.length * 12 : 0));
      canvasText(ctx, `MANCHE ${c.n} / ${c.rounds}`, W / 2, 56, { size: 16, color: '#f8d070' });
      const shown = Math.floor((t - (c.turnAt - P.INTRO - 900 * items)) / 700) + 1;
      // l'événement (titre et effet) arrive d'un bloc
      const n = ev && shown >= lines.length - 1 ? lines.length : shown;
      lines.slice(0, Math.max(1, n)).forEach(([txt, col], k) => canvasText(ctx, txt, W / 2, 82 + k * 12, { color: col }));
      return;
    }
    // bagarre : annoncée en grand avant que le comptoir ne soit bousculé
    const sl = this.slide;
    if (c.phase === 'brawl' && sl?.brawl && t < sl.at + 600) {
      const j = t < sl.at ? 0 : Math.round(Math.sin(this.now / 30) * 2);
      plate(ctx, 40, 44, W - 80, 36, METAS.bagarre.col);
      canvasText(ctx, 'BAGARRE !', W / 2 + j, 48, { size: 16, color: METAS.bagarre.col });
      canvasText(ctx, 'QUELQU\'UN BOUSCULE LE COMPTOIR…', W / 2, 67, { color: '#fdf6e0' });
      return;
    }
    const who = this.thrower;
    if (who == null || t < c.turnAt - 300) return;
    // double service : 1re ou 2e chope
    const two = c.mods?.meta === 'deux' ? (c.turn >= c.order.length / 2 ? '2E CHOPE : ' : '1RE CHOPE : ') : '';
    if (who === this.me) {
      const w = textW('À TOI !', 16) + 14;
      plate(ctx, Math.round(W / 2 - w / 2), 3, w, 20, this.color(who));
      canvasText(ctx, 'À TOI !', W / 2, 6, { size: 16, color: this.color(who) });
      this.drawBeer(ctx, c.beers?.[c.turn], 26, true, two);
      const st = this.aim?.stage;
      const tap = this.touch ? 'TOUCHE' : 'CLIC';
      const help = st === 'dir' ? `${tap} : BLOQUE LA DIRECTION` : st === 'pow' ? `${tap} : BLOQUE LA PUISSANCE` : '';
      if (help && Math.floor(this.now / 400) % 3) {
        const w = textW(help) + 10;
        plate(ctx, Math.round(W / 2 - w / 2), 56, w, 12, '#fdf6e0');
        canvasText(ctx, help, W / 2, 58, { color: '#fdf6e0' });
      }
    } else {
      const title = `AU TOUR DE ${this.name(who).toUpperCase()}`, w = textW(title) + 10;
      plate(ctx, Math.round(W / 2 - w / 2), 5, w, 12, this.color(who));
      canvasText(ctx, title, W / 2, 7, { color: this.color(who) });
      this.drawBeer(ctx, c.beers?.[c.turn], 21, false, two);
    }
  }

  // la bière servie et son effet, sur un cartouche bien lisible, avec la chope à gauche
  drawBeer(ctx, b, y, mine, pre = '') {
    const B = BEERS[b] || BEERS.blonde;
    const head = pre + (mine ? `ON TE SERT ${B.name}` : B.name);
    const tw = Math.max(textW(head), textW(B.desc)), w = tw + (B.curl ? 48 : 36), x = Math.round(W / 2 - w / 2);
    plate(ctx, x, y, w, 26, B.col);
    // tord-boyaux : une flèche qui part tout droit puis tourne vers le bas (ou le haut), comme la chope
    if (B.curl) {
      ctx.fillStyle = B.col;
      const ox = x + w - 15, oy = y + 13;
      for (const [dx, dy] of CURL_ARROW) ctx.fillRect(ox + dx, oy + B.curl * (dy - 3), 1, 1);
    }
    // la chope du mineur, plus haute, est posée plus bas : sa mousse dépassait du cartouche
    const col = this.color(this.thrower);
    drawMug(ctx, x + 13, y + Math.max(22, mug(col, b).oy), col, 0, b);
    const cx = x + 28 + tw / 2;
    canvasText(ctx, head, cx, y + 4, { color: B.col });
    canvasText(ctx, B.desc, cx, y + 15, { color: '#fdf6e0' });
  }

  // rappel du comptoir, des surprises et de l'événement de la manche, en haut à droite ; chaque ligne a sa bulle
  // d'aide (survol, ou toucher) qui dit exactement ce qu'il y a
  drawLegend(ctx, c) {
    const m = c.mods, lay = m?.lay && m.lay !== 'droit' ? COUNTERS[m.lay] : null;
    const ev = m?.meta && METAS[m.meta];
    const lines = [
      ...(lay ? [[lay.label, lay.col, split(lay.name, lay.col)]] : []),
      ...(m?.list || []).map((id) => [modLabel(id, m), MODS[id].col, { title: modLabel(id, m), body: modName(id, m), col: MODS[id].col }]),
    ];
    if (ev) lines.push([ev.label, ev.col, { title: ev.title, body: ev.name, col: ev.col }]);
    // caché pendant l'annonce de la manche seulement (entre deux lancers, il disparaissait 300 ms : clignotement)
    if (!lines.length || (c.turn === 0 && this.t < c.turnAt)) return;
    const w = Math.max(...lines.map(([txt]) => textW(txt))) + 8;
    const hover = !this.touch && this.mouse.in ? this.mouse : null;
    plate(ctx, W - 2 - w, 2, w, lines.length * 10 + 3, '#8a5a34');
    lines.forEach(([txt, col, tip], k) => {
      const z = { x: W - 2 - w, y: 3 + k * 10, w, h: 10, tip, legend: true };
      this.hits.push(z);
      if (hover && inBox(z, hover.x, hover.y)) { ctx.fillStyle = 'rgba(253,246,224,0.15)'; ctx.fillRect(z.x, z.y, w, 10); }
      canvasText(ctx, txt, W - 6, 4 + k * 10, { align: 'right', color: col });
    });
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
    for (const r of c.res) {
      const q = r.mat && c.pints.find((x) => x.id === r.id);
      if (q) canvasText(ctx, `+${P.MAT}`, sx(q.x), sy(q.y) - 30, { color: MODS.sousbock.col });
    }
    const mult = c.mods?.mult || 1, ev = c.mods?.meta && METAS[c.mods.meta];
    const foot = mult > 1 ? ['DERNIÈRE TOURNÉE : POINTS DOUBLÉS', MODS.double.col] : ev ? [`${ev.title} : ${ev.label}`, ev.col] : null;
    ctx.fillStyle = 'rgba(26,15,10,0.85)';
    ctx.fillRect(0, 40, W, foot ? 72 : 62);
    if (foot) canvasText(ctx, foot[0], W / 2, 99, { color: foot[1] });
    const best = c.res.filter((r) => r.best);
    if (!best.length) {
      canvasText(ctx, 'TOUTES LES CHOPES SONT TOMBÉES !', W / 2, 46, { size: 16, color: '#f0705a' });
      return;
    }
    const names = [...new Set(best.map((r) => (r.o === this.me ? 'TOI' : this.name(r.o).slice(0, 10).toUpperCase())))].join(' ET ');
    canvasText(ctx, `${names} : LA PLUS PROCHE !`, W / 2, 46, { size: names.length > 12 ? 8 : 16, color: '#f8d070' });
    // une colonne par joueur : son écart (ou TOMBÉE) et ses points de la manche, casse et prime comprises
    // (à six, 64 px chacune : noms plus courts)
    const players = this.state.players, cw = W / players.length, nl = cw < 70 ? 8 : 10;
    players.forEach((p, i) => {
      const mine = c.res.filter((r) => r.o === i);
      const x = cw * (i + 0.5);
      const threw = c.order.includes(i);
      const cm = mine.length ? `${Math.min(...mine.map((r) => r.cm))} CM` : threw ? 'TOMBÉE' : '—';
      const pts = mine.reduce((s, r) => s + r.pts, 0) + (c.extra?.[i] || 0);
      canvasText(ctx, i === this.me ? 'TOI' : p.name.slice(0, nl).toUpperCase(), x, 66, { color: this.color(i) });
      canvasText(ctx, cm, x, 77, { color: mine.length ? '#fdf6e0' : '#f0705a' });
      canvasText(ctx, pts < 0 ? `${pts}` : `+${pts}`, x, 88, { color: pts < 0 ? '#f0705a' : mine.some((r) => r.best) ? '#f8d070' : '#a89880' });
    });
  }

  hudStats() {
    const c = this.cur;
    return [['MANCHE', c ? `${c.n}/${c.rounds}` : '—', 'yellow'], ['MEILLEUR', this.best == null ? '—' : `${this.best} cm`, 'green']];
  }
}
