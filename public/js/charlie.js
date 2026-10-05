// Mini-jeu « Où est Charlie ? » : la foule se promène dans la ville, le premier qui clique sur Charlie
// gagne la manche. Sa tenue change à chaque manche (affiche WANTED) et des sosies n'en diffèrent que d'un détail. La ville fait deux écrans :
// flèches / ZQSD / molette / bords de l'écran pour la parcourir. Mauvais clic : viseur bloqué un instant.
import * as S from './sprites.js';
import { sfx } from './audio.js';
import { canvasText } from './scene.js';
import { SKIN, HAIR_COLORS, CLOTH_COLORS } from './data.js';
import { MiniScene, ring, pixelSprite } from './miniscene.js';
import { desertOpts } from './env.js';
import { horseSprite } from './lasso.js';
import { W, H, CHARLIE, TOWN, TOWN_PROPS, balconyY, charlieWorld, npcPos, PANTS } from './worlds.js';

const WW = CHARLIE.worldW, BOARD = CHARLIE.board;
const OUT = S.OUT;
const RED = '#d8382a', WHITE = '#f6f0e2';
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ------------------------------------------------------------ passants (tournés vers la droite, pieds en 0,0)
// Chaque passant a sa planche : ses 5 poses côte à côte (immobile + 4 pas de marche), et la même en miroir.
// Une planche par passant plutôt qu'un canvas par pose, et un contour tracé par le GPU (sans getImageData) :
// la foule d'une manche se prépare en quelques millisecondes, étalées sur l'annonce de la manche.
const FW = 16, FH = 30, FOX = 8, FOY = 28, POSES = 5;
let sheets = new Map();
// on oublie la foule précédente : ses planches sont libérées tout de suite (2 canvas par passant)
function freeSheets() {
  for (const s of sheets.values()) { S.freeCanvas(s.right); S.freeCanvas(s.left); }
  sheets = new Map();
}

// contour sombre d'un pixel : la silhouette en noir, décalée dans les 4 directions, sous le dessin
function outlineFast(src) {
  const { width: w, height: h } = src;
  const sil = S.makeCanvas(w, h);
  const s = sil.getContext('2d');
  s.drawImage(src, 0, 0);
  s.globalCompositeOperation = 'source-in';
  s.fillStyle = OUT;
  s.fillRect(0, 0, w, h);
  const out = S.makeCanvas(w, h);
  const o = out.getContext('2d');
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) o.drawImage(sil, dx, dy);
  o.drawImage(src, 0, 0);
  S.freeCanvas(sil);
  return out;
}

function npcSheet(look, key) {
  let s = sheets.get(key);
  if (s) return s;
  const raw = S.makeCanvas(FW * POSES, FH);
  const rc = raw.getContext('2d');
  for (let p = 0; p < POSES; p++) {
    const R = (dx, dy, w, h, col) => { rc.fillStyle = col; rc.fillRect(p * FW + FOX + dx, FOY + dy, w, h); };
    drawNpc(R, look, p - 1);
  }
  const right = outlineFast(raw);
  S.freeCanvas(raw);
  const left = S.makeCanvas(right.width, FH);
  const lc = left.getContext('2d');
  lc.scale(-1, 1);
  lc.drawImage(right, -right.width, 0);
  s = { right, left };
  sheets.set(key, s);
  return s;
}

// une pose (frame -1 = immobile) : morceau de planche à dessiner en (x - ox, y - oy)
function npcFrame(look, key, frame, dir) {
  const s = npcSheet(look, key);
  const p = frame + 1;
  return dir < 0
    ? { img: s.left, sx: (POSES - 1 - p) * FW, w: FW, h: FH, ox: FW - FOX, oy: FOY }
    : { img: s.right, sx: p * FW, w: FW, h: FH, ox: FOX, oy: FOY };
}

// frame : -1 = immobile, 0..3 = pas de marche
function drawNpc(R, l, frame) {
  const legH = l.kid ? 3 : 5, bodyH = l.kid ? 5 : 7;
  const skin = SKIN[l.skin] || SKIN[1], skinD = S.shade(skin, -0.2);
  const hair = HAIR_COLORS[l.hair] || HAIR_COLORS[1];
  const tc = CLOTH_COLORS[l.topC] || CLOTH_COLORS[2];
  const tc2 = CLOTH_COLORS[l.topC2] || CLOTH_COLORS[5];
  const hc = CLOTH_COLORS[l.hatC] || CLOTH_COLORS[1], band = S.shade(hc, -0.35);
  const pants = PANTS[l.pants] || PANTS[1], shoe = '#2a1a10';
  const sw = frame < 0 ? 0 : [0, 1, 0, -1][frame];
  const top = -legH - bodyH, hy = top - 5;
  // jambes (ou jupe)
  if (l.top === 'dress') {
    R(-3, -legH - 1, 6, legH, tc); R(-4, -3, 8, 2, tc); R(-4, -2, 8, 1, S.shade(tc, -0.25));
    R(-2 + sw, -1, 2, 1, shoe); R(1 - sw, -1, 2, 1, shoe);
  } else {
    R(-2 - sw, -legH, 2, legH, S.shade(pants, -0.15)); R(sw, -legH, 2, legH, pants);
    R(-2 - sw, -1, 3, 1, shoe); R(sw, -1, 3, 1, shoe);
  }
  // buste
  switch (l.top) {
    case 'stripes': for (let k = 0; k < bodyH; k++) R(-3, top + k, 6, 1, k % 2 ? tc2 : tc); break;
    case 'vest': R(-3, top, 6, bodyH, '#e8dcc0'); R(-3, top, 2, bodyH - 1, tc); R(2, top, 1, bodyH - 1, tc); break;
    case 'poncho': R(-3, top, 6, bodyH, tc2); R(-4, top, 8, bodyH - 2, tc); R(-4, top + 2, 8, 1, tc2); break;
    case 'duster': R(-4, top + 1, 2, bodyH + legH - 3, S.shade(tc, -0.3)); R(-3, top, 6, bodyH, tc); break;
    default: R(-3, top, 6, bodyH, tc);
  }
  // bras qui balance
  const arm = frame < 0 ? 0 : [0, 1, 0, -1][frame];
  R(arm, top + 1, 2, bodyH - 3, l.top === 'poncho' ? tc : S.shade(tc, -0.12));
  R(arm, top + bodyH - 2, 2, 1, skin);
  // tête
  R(-2, hy, 5, 5, skin);
  R(3, hy + 2, 1, 1, skinD);
  R(1, hy + 1, 1, 1, '#1a0f0a');
  R(-2, hy, 2, 3, hair);
  if (l.long) R(-3, hy + 1, 2, 6, hair);
  if (l.beard) R(0, hy + 3, 3, 2, hair);
  if (l.glasses) { R(-1, hy + 1, 4, 1, '#1a0f0a'); R(1, hy + 1, 1, 1, '#cfe4f0'); }
  switch (l.hat) {
    case 'cowboy': R(-4, hy - 1, 9, 1, hc); R(-2, hy - 3, 5, 2, hc); R(-2, hy - 2, 5, 1, band); break;
    case 'sombrero': R(-5, hy - 1, 11, 1, hc); R(-1, hy - 4, 4, 3, hc); R(-1, hy - 2, 4, 1, band); break;
    case 'bowler': R(-3, hy - 1, 7, 1, hc); R(-2, hy - 3, 5, 2, hc); break;
    case 'tophat': R(-3, hy - 1, 7, 1, hc); R(-2, hy - 5, 5, 4, hc); R(-2, hy - 2, 5, 1, band); break;
    case 'bandana': R(-2, hy - 1, 5, 2, hc); R(-3, hy, 1, 2, hc); break;
    case 'bonnet': R(-3, hy - 2, 6, 2, hc); R(-3, hy, 2, 3, hc); R(3, hy - 2, 1, 2, band); break;
    case 'beanie': R(0, hy - 4, 2, 2, hc); R(-2, hy - 2, 5, 1, hc); R(-2, hy - 1, 5, 1, WHITE); R(-2, hy, 5, 1, hc); break;
    default: R(-2, hy - 1, 5, 1, hair);
  }
}

// ------------------------------------------------------------ objets de la rue (base au sol en 0,0)
const PROP_DRAW = {
  wagon(R, ctx, ox, oy) {
    R(-40, -18, 80, 10, '#7a4a24'); R(-40, -14, 80, 1, '#5a3418');
    for (let i = 0; i <= 64; i++) {
      const h = Math.round(20 * Math.sin((Math.PI * i) / 64));
      R(-32 + i, -18 - h, 1, h, i % 13 < 2 ? '#c8bca0' : '#ece2c8');
    }
    R(40, -14, 10, 2, '#5a3418');
    for (const cx of [-26, 26]) {
      S.disc(ctx, ox + cx, oy - 8, 8, '#8a5a34'); S.disc(ctx, ox + cx, oy - 8, 6, '#c08850');
      R(cx - 6, -8, 13, 1, '#8a5a34'); R(cx, -14, 1, 13, '#8a5a34'); R(cx - 1, -9, 3, 3, OUT);
    }
  },
  well(R) {
    R(-14, -12, 28, 12, '#8a8478'); R(-14, -12, 28, 2, '#aaa496');
    for (let y = -8; y < 0; y += 4) for (let x = -14 + ((y / 4) % 2 ? 0 : 3); x < 12; x += 6) R(x, y, 1, 3, '#6a6458');
    R(-12, -32, 2, 20, '#5a3a20'); R(10, -32, 2, 20, '#5a3a20');
    R(-17, -36, 34, 4, '#7a4a24'); R(-15, -38, 30, 2, '#8a5a34');
    R(-10, -28, 20, 1, '#5a3a20'); R(0, -27, 1, 7, '#e8d8a0'); R(-2, -20, 5, 4, '#5a3a20');
  },
  stall(R, ctx, ox, oy, alt) {
    const a = alt ? '#3a6a8a' : '#4a7a3a';
    R(-22, -14, 44, 14, '#8a5a34'); R(-22, -14, 44, 2, '#a8703c'); R(-20, -8, 40, 1, '#6a4024');
    for (let x = -18; x < 18; x += 4) { R(x, -17, 3, 3, alt ? '#e0b040' : '#c86a2a'); R(x + 1, -18, 1, 1, '#4a7a3a'); }
    R(-22, -34, 2, 20, '#5a3a20'); R(20, -34, 2, 20, '#5a3a20');
    for (let x = -26; x < 26; x += 6) { R(x, -38, 6, 5, (x / 6) % 2 ? a : '#ece2c8'); R(x, -33, 6, 1, (x / 6) % 2 ? S.shade(a, -0.3) : '#c8bca0'); }
  },
  barrels(R) {
    for (const bx of [-11, 1]) {
      R(bx, -14, 10, 14, '#8a5a34'); R(bx + 2, -14, 2, 14, '#a8703c');
      for (const yy of [-12, -7, -3]) R(bx, yy, 10, 1, '#4a4f58');
    }
  },
  hay(R) {
    R(-15, -12, 30, 12, '#d8b048');
    for (let k = -13; k < 15; k += 4) R(k, -11, 1, 10, '#c09838');
    R(-15, -8, 30, 1, '#8a6a30'); R(-15, -4, 30, 1, '#8a6a30');
  },
  trough(R) {
    R(-18, -8, 36, 6, '#7a5a3a'); R(-16, -8, 32, 2, '#5a8ab0');
    R(-16, -2, 3, 2, '#5a3a20'); R(13, -2, 3, 2, '#5a3a20');
  },
  cactus(R) {
    const g = '#4a7a3a', d = '#2e5228';
    R(-2, -24, 4, 24, g); R(1, -24, 1, 24, d);
    R(-6, -15, 4, 2, g); R(-6, -20, 2, 5, g); R(2, -11, 4, 2, g); R(4, -18, 2, 7, g);
  },
  crates(R) {
    for (const [x, y] of [[-12, -12], [0, -12], [-6, -24]]) {
      R(x, y, 12, 12, '#a8783c'); R(x + 1, y + 1, 10, 10, '#b88848');
      for (let k = 0; k < 10; k++) R(x + 1 + k, y + 1 + k, 1, 1, '#7a5428');
    }
  },
};

const propCache = new Map();
// la moitié est de la ville a ses variantes (cheval noir tourné vers la gauche, étal bleu)
const eastSide = (p) => p.x > WW / 2;
function propSprite(p, idx) {
  let c = propCache.get(idx);
  if (c) return c;
  if (p.kind === 'horse') {
    const [coat, mane] = eastSide(p) ? ['#3a2c26', '#120c08'] : ['#8a4a24', '#2e1a10'];
    c = horseSprite(coat, mane, 1, null);
  } else {
    c = pixelSprite(100, 64, 50, 60, (R, ctx) => PROP_DRAW[p.kind](R, ctx, 50, 60, eastSide(p)));
  }
  propCache.set(idx, c);
  return c;
}

// ------------------------------------------------------------ la ville (dessinée une fois)
function paint(ctx) {
  const R = (x, y, w, h, col) => { ctx.fillStyle = col; ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };
  const box = (x, y, w, h, col) => { R(x - 1, y - 1, w + 2, h + 2, OUT); R(x, y, w, h, col); };
  return { R, box };
}

function signRect(b) {
  const w = Math.min(b.w - 10, b.sign.length * 7 + 10);
  return { x: Math.round(b.x + b.w / 2 - w / 2), y: BOARD - b.h + 4, w, h: 10 };
}

function drawWindow(R, box, x, y, w, h, trim, k) {
  box(x - 1, y - 1, w + 2, h + 2, trim);
  R(x, y, w, h, '#24140c');
  const cur = k % 2 ? '#a8403a' : '#c8a060';
  R(x, y, 3, h, cur); R(x + w - 3, y, 3, h, cur);
  R(x - 2, y + h + 1, w + 4, 2, S.shade(trim, -0.2));
}

// désert et ciel derrière la ville, selon l'ambiance
const SKIES = new Map();
function skyFor(env) {
  let c = SKIES.get(env.id);
  if (c) return c;
  c = S.makeCanvas(WW, H);
  S.drawDesert(c.getContext('2d'), 0, 0, WW, H, desertOpts(env, { sunX: 0.82, sunY: 0.12 }));
  SKIES.set(env.id, c);
  return c;
}

let TOWN_IMG = null;
function town() {
  if (TOWN_IMG) return TOWN_IMG;
  const bg = S.makeCanvas(WW, H);
  const ctx = bg.getContext('2d');
  const lights = []; // fenêtres éclairées la nuit
  const { R, box } = paint(ctx);
  let s = 41;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  // rue en terre battue
  ['#c89058', '#c48c58', '#c08850', '#c48c58', '#ca945e'].forEach((c, i) => R(0, BOARD + i * 24, WW, 25, c));
  for (let i = 0; i < 2600; i++) R(rnd() * WW, BOARD + 12 + rnd() * 104, rnd() < 0.2 ? 2 : 1, 1, rnd() < 0.5 ? '#e0a870' : '#9a6a3a');
  for (const y of [150, 172, 196]) for (let x = 0; x < WW; x += 3) R(x, y + (x % 7 === 0 ? 1 : 0), 2, 1, '#a87040');
  // façades
  TOWN.forEach((b, bi) => {
    const top = BOARD - b.h, x = b.x, w = b.w;
    const col = b.col, dk = S.shade(col, -0.25), lt = S.shade(col, 0.14), trim = S.mix(col, '#f4ecd8', 0.55);
    box(x, top, w, b.h, col);
    for (let px = x + 3; px < x + w; px += 5) R(px, top + 1, 1, b.h - 1, dk);
    R(x - 2, top - 3, w + 4, 4, dk); R(x - 2, top - 3, w + 4, 1, lt); R(x - 3, top - 4, w + 6, 1, OUT);
    const sr = signRect(b);
    box(sr.x, sr.y, sr.w, sr.h, '#e8d4a0');
    const upY = b.balcony ? top + 18 : top + 18, upH = b.balcony ? 20 : 12, upW = b.balcony ? 12 : 11;
    const nUp = Math.max(1, Math.floor(w / (b.balcony ? 30 : 32)));
    if (b.h >= 64) for (let k = 0; k < nUp; k++) {
      const wx = Math.round(x + (w * (k + 1)) / (nUp + 1) - upW / 2);
      drawWindow(R, box, wx, upY, upW, upH, trim, k + bi);
      lights.push({ x: wx, y: upY, w: upW, h: upH });
    }
    // rez-de-chaussée : porte et vitrines
    const dw = b.sign === 'SALOON' ? 20 : 14, dx = Math.round(x + w / 2 - dw / 2);
    box(dx, BOARD - 24, dw, 24, '#1e1008'); R(dx, BOARD - 24, 3, 24, S.shade(col, -0.45));
    if (b.sign === 'SALOON') for (const hx of [dx + 1, dx + dw / 2 + 1]) { box(hx, BOARD - 18, dw / 2 - 2, 10, '#a8703c'); R(hx + 1, BOARD - 14, dw / 2 - 4, 1, '#7a4a28'); }
    for (const f of [0.2, 0.8]) {
      drawWindow(R, box, Math.round(x + w * f - 7), BOARD - 22, 14, 12, trim, bi);
      lights.push({ x: Math.round(x + w * f - 7), y: BOARD - 22, w: 14, h: 12 });
    }
    if (b.balcony) {
      const by = balconyY(b);
      box(x - 2, by, w + 4, 3, '#8a5a34');
      for (const px of [x, x + w - 3]) box(px, by + 3, 3, BOARD - by - 3, dk);
    }
  });
  // trottoir en planches
  R(0, BOARD, WW, 12, '#8a5a34'); R(0, BOARD, WW, 1, '#a8703c');
  for (let x = 0; x < WW; x += 8) R(x, BOARD, 1, 12, '#5a3418');
  R(0, BOARD + 12, WW, 2, '#5a3418');
  // rambardes des balcons, devant les passants qui s'y promènent
  const front = S.makeCanvas(WW, H);
  const F = paint(front.getContext('2d'));
  for (const b of TOWN) {
    if (!b.balcony) continue;
    const by = balconyY(b);
    F.box(b.x - 2, by - 9, b.w + 4, 2, '#8a5a34');
    for (let x = b.x; x < b.x + b.w; x += 5) F.R(x, by - 7, 2, 7, '#7a4a28');
  }
  TOWN_IMG = { bg, front, lights };
  return TOWN_IMG;
}

// ------------------------------------------------------------ scène
export class CharlieScene extends MiniScene {
  constructor(canvas, hooks) {
    super(canvas, hooks);
    this.kind = 'charlie';
    this.showEnv = true;
    this.cv.style.cursor = 'none';
    this.cur = null;
    this.world = null;
    this.cam = (WW - W) / 2;
    this.camTo = null;
    this.cv.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.camTo = null;
      this.cam = clamp(this.cam + (Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY) * 0.35, 0, WW - W);
    }, { passive: false, signal: this.abort.signal });
  }

  destroy() {
    super.destroy();
    freeSheets();
  }

  title() { return 'OÙ EST CHARLIE ?'; }
  help() {
    return [
      'CHARLIE CHANGE DE TENUE À CHAQUE MANCHE :',
      'REGARDE BIEN L\'AFFICHE, GARE AUX SOSIES !',
      'LE PLUS RAPIDE MARQUE 100 À 200 PTS',
      this.touch ? 'GLISSE LE DOIGT : PARCOURIR LA VILLE' : 'FLÈCHES, ZQSD OU MOLETTE : PARCOURIR LA VILLE',
    ];
  }

  // au doigt : glisser fait défiler la ville (un simple toucher désigne Charlie)
  onDrag(dx) {
    this.camTo = null;
    this.cam = clamp(this.cam - dx, 0, WW - W);
  }
  goText() { return 'CHERCHEZ !'; }

  setup(seed) {
    this.seed = seed;
    this.cur = null;
    this.world = null;
    this.finds = 0;
    this.misses = 0;
    this.lockUntil = -1e9;
    this.pendingUntil = -1e9;
    this.cam = (WW - W) / 2;
  }

  applySync(st) {
    if (!st.round) return;
    this.newRound(st.round);
    if (st.round.result) this.cur.result = { ...st.round.result, at: -1e9 };
  }

  newRound(r) {
    this.cur = r;
    this.world = charlieWorld(this.seed, r.n);
    for (const n of this.world.npcs) n.key = JSON.stringify(n.look);
    // nouvelle foule : on oublie les planches de la précédente et on prépare celles-ci (Charlie d'abord, pour l'affiche)
    freeSheets();
    this.warmQueue = this.world.npcs.filter((n) => !n.charlie);
    this.warmQueue.push(this.world.charlie);
    this.cam = (WW - W) / 2;
    this.camTo = null;
    this.lockUntil = -1e9;
    this.pendingUntil = -1e9;
  }

  // la manche est-elle en cours (foule visible, clics comptés) ?
  get hunting() {
    const c = this.cur, t = this.t;
    return !!c && !c.result && !this.over && t >= c.at && t < c.end && this.playing;
  }

  // temps de la foule : figé au moment où Charlie est trouvé
  crowdTime() {
    const c = this.cur;
    return (c.result ? c.result.t : Math.min(this.t, c.end)) - c.at;
  }

  clock() { return this.hunting ? this.cur.end - this.t : null; }
  // la chasse s'emballe quand le temps de la manche file
  mood() {
    const ms = this.clock();
    if (ms == null || this.over) return this.t < 0 ? { level: 0.3 } : { level: 0.45 };
    return { level: ms < 10000 ? 0.85 : 0.55, tick: ms < 5000 };
  }
  progress() { return this.hunting ? (this.cur.end - this.t) / CHARLIE.round : null; }

  // ---------------------------------------------------------- entrées
  onFire(m) {
    if (m.y >= H - 6) { this.camTo = null; this.cam = clamp((m.x / W) * WW - W / 2, 0, WW - W); return; }
    if (!this.hunting) return;
    const t = this.t, c = this.cur;
    if (t < this.lockUntil || t < this.pendingUntil) { sfx('dry'); return; }
    const wx = m.x + Math.round(this.cam), wy = m.y;
    if (this.pick(wx, wy, t - c.at)) {
      this.pendingUntil = t + 1500;
      sfx('coin');
      this.hooks.send({ kind: 'find', n: c.n, x: Math.round(wx), y: Math.round(wy), t: Math.round(t) });
    } else {
      this.misses++;
      this.lockUntil = t + CHARLIE.lockout;
      sfx('bad');
      this.popup(m.x, m.y - 14, 'RATÉ !', '#f0705a');
    }
  }

  onKey(k) {
    if (k === 'home') this.cam = 0;
    if (k === 'end') this.cam = WW - W;
  }

  // Prépare les planches de la foule par petits paquets (4 ms max par image), pendant le compte à rebours
  // ou l'annonce de la manche. Renvoie true s'il en reste.
  warm(budget = 4) {
    const q = this.warmQueue;
    if (!q?.length) return false;
    const t0 = performance.now();
    while (q.length && performance.now() - t0 < budget) {
      const n = q.pop();
      npcSheet(n.look, n.key);
    }
    return q.length > 0;
  }

  // ce qui est dessiné, de l'arrière vers l'avant
  layout(rt) {
    const items = TOWN_PROPS.map((p, i) => this.propItem(p, i));
    for (const n of this.world.npcs) {
      const p = npcPos(n, rt);
      items.push({ y: p.y, x: Math.round(p.x), npc: n, ...npcFrame(n.look, n.key, p.walk ? p.f : -1, p.dir) });
    }
    return items.sort((a, b) => a.y - b.y);
  }

  propItem(p, i) {
    const spr = propSprite(p, i);
    const img = p.kind === 'horse' && eastSide(p) ? this.flipped(spr) : spr;
    return { y: p.y, x: p.x, img, sx: 0, w: img.width, h: img.height, ox: img.ox, oy: img.oy };
  }

  // pixel opaque de l'objet sous le point (x, y) du monde ?
  opaque(it, x, y) {
    const cx = Math.floor(x) - (it.x - it.ox), cy = Math.floor(y) - (it.y - it.oy);
    if (cx < 0 || cy < 0 || cx >= it.w || cy >= it.h) return false;
    return it.img.getContext('2d').getImageData(it.sx + cx, cy, 1, 1).data[3] > 0;
  }

  pick(x, y, rt) {
    const items = this.layout(rt);
    const ch = items.find((it) => it.npc?.charlie);
    for (let k = items.length - 1; k >= 0; k--) {
      if (this.opaque(items[k], x, y)) return items[k] === ch;
    }
    // clic juste à côté de Charlie (sur le fond) : accepté
    return Math.abs(x - ch.x) <= 5 && y >= ch.y - 26 && y <= ch.y + 2;
  }

  flipped(spr) {
    if (!spr.flip) {
      const c = S.makeCanvas(spr.width, spr.height);
      const x = c.getContext('2d');
      x.scale(-1, 1);
      x.drawImage(spr, -spr.width, 0);
      c.ox = spr.width - spr.ox;
      c.oy = spr.oy;
      spr.flip = c;
    }
    return spr.flip;
  }

  // le Charlie de cette manche, immobile, pour les affiches
  suspect() {
    const w = this.world;
    if (!w) return null;
    if (!w.poster) {
      const f = npcFrame(w.charlie.look, w.charlie.key, -1, 1);
      const c = S.makeCanvas(FW, FH);
      c.getContext('2d').drawImage(f.img, f.sx, 0, FW, FH, 0, 0, FW, FH);
      c.ox = FOX;
      c.oy = FOY;
      w.poster = c;
    }
    return w.poster;
  }

  // ---------------------------------------------------------- événements de l'hôte
  onEvent(ev) {
    if (ev.type === 'cRound') {
      this.newRound(ev.round);
      if (ev.round.n > 1) sfx('ding');
    } else if (ev.type === 'cEnd') {
      if (this.cur?.n !== ev.round.n) this.newRound(ev.round);
      const res = { ...ev.round.result, at: this.t };
      this.cur = { ...ev.round, result: res };
      const p = npcPos(this.world.charlie, res.t - this.cur.at);
      this.camTo = clamp(p.x - W / 2, 0, WW - W);
      if (res.by === this.me) { this.finds++; sfx('good'); sfx('coin', 0.15); }
      else sfx(res.by >= 0 ? 'bad' : 'whip');
    }
  }

  // ---------------------------------------------------------- simulation
  update(dt) {
    this.warm();
    const k = this.keys;
    let v = 0;
    if (k.has('arrowleft') || k.has('q') || k.has('a')) v -= 1;
    if (k.has('arrowright') || k.has('d')) v += 1;
    const m = this.mouse;
    if (m.in && m.y < H - 6 && m.y > 12) {
      if (m.x < 12) v -= 0.6;
      else if (m.x > W - 12) v += 0.6;
    }
    if (v) { this.camTo = null; this.cam += v * dt * 0.28; }
    if (this.camTo != null) {
      this.cam += (this.camTo - this.cam) * Math.min(1, dt * 0.006);
      if (Math.abs(this.camTo - this.cam) < 0.5) { this.cam = this.camTo; this.camTo = null; }
    }
    this.cam = clamp(this.cam, 0, WW - W);
  }

  // ---------------------------------------------------------- rendu
  render(out) {
    const T = town();
    const cx = Math.round(this.cam);
    const amb = this.amb, now = this.now;
    out.drawImage(skyFor(amb.env), -cx, 0);
    amb.sky(out, now);
    // ville et foule teintées par l'ambiance, en plus doux pour que Charlie reste repérable
    const ctx = amb.begin(out, amb.env.tint && S.mix(amb.env.tint, '#ffffff', 0.4));
    ctx.drawImage(T.bg, -cx, 0);
    for (const b of TOWN) {
      const sr = signRect(b);
      if (sr.x + sr.w < cx || sr.x > cx + W) continue;
      canvasText(ctx, b.sign, sr.x + sr.w / 2 - cx, sr.y + 1, { size: 8, color: '#3a2214', shadow: '#c8b07c' });
    }
    const c = this.cur, t = this.t;
    const crowd = c && this.world && (t >= c.at || c.result);
    if (crowd) {
      const items = this.layout(this.crowdTime());
      let k = 0;
      for (; k < items.length && items[k].y < BOARD; k++) this.drawItem(ctx, items[k], cx);
      ctx.drawImage(T.front, -cx, 0);
      for (; k < items.length; k++) this.drawItem(ctx, items[k], cx);
    } else {
      TOWN_PROPS.forEach((p, i) => this.drawItem(ctx, this.propItem(p, i), cx));
      ctx.drawImage(T.front, -cx, 0);
    }
    amb.end(out, now);
    T.lights.forEach((l, k) => { if (l.x - cx > -20 && l.x - cx < W && (k * 7919) % 10 < 6) amb.window(out, l.x - cx, l.y, l.w, l.h); });
    amb.weather(out, now);
    if (!c) return;
    if (c.result) this.drawFound(out, c, cx, t);
    else if (t < c.at && c.n > 1) this.drawPoster(out, c.n);
    this.drawMap(out, cx);
    if (t >= 0) this.drawWanted(out);
    if (this.mouse.in && this.mouse.y < H - 6) this.drawLoupe(out, t);
  }

  drawItem(ctx, it, cx) {
    const x = it.x - cx;
    if (x + it.w < 0 || x - it.w > W) return;
    ctx.drawImage(it.img, it.sx, 0, it.w, it.h, x - it.ox, it.y - it.oy, it.w, it.h);
  }

  drawFound(ctx, c, cx, t) {
    const res = c.result;
    const el = t - res.at;
    const p = npcPos(this.world.charlie, res.t - c.at);
    const sx = Math.round(p.x - cx), sy = Math.round(p.y - 11);
    const r = Math.round(Math.max(18, 90 - el * 0.12));
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, W, H);
    ctx.arc(sx, sy, r, 0, Math.PI * 2, true);
    ctx.fillStyle = 'rgba(10,5,3,0.72)';
    ctx.fill('evenodd');
    ctx.restore();
    const col = res.by >= 0 ? this.color(res.by) : '#f8d070';
    ring(ctx, sx, sy, r, r, col, 3, this.now / 90);
    const title = res.by < 0 ? 'CHARLIE S\'EST ÉCLIPSÉ…'
      : res.by === this.me ? `TU AS TROUVÉ CHARLIE ! +${res.pts}` : `${this.name(res.by).toUpperCase()} L'A TROUVÉ ! +${res.pts}`;
    const ty = sy > 110 ? 26 : 160;
    ctx.fillStyle = 'rgba(26,15,10,0.8)';
    ctx.fillRect(0, ty - 6, W, 26);
    canvasText(ctx, title, W / 2, ty, { size: title.length > 26 ? 8 : 16, color: col });
  }

  drawPoster(ctx, n) {
    ctx.fillStyle = 'rgba(10,5,3,0.55)';
    ctx.fillRect(0, 0, W, H);
    const x = W / 2 - 46, y = 34;
    ctx.fillStyle = OUT; ctx.fillRect(x - 2, y - 2, 96, 148);
    ctx.fillStyle = '#e8d4a0'; ctx.fillRect(x, y, 92, 144);
    ctx.fillStyle = '#c8b07c'; ctx.fillRect(x + 3, y + 3, 86, 2); ctx.fillRect(x + 3, y + 139, 86, 2);
    canvasText(ctx, 'WANTED', W / 2, y + 8, { size: 16, color: '#5a2a14', shadow: '#c8b07c' });
    const spr = this.suspect();
    if (spr) ctx.drawImage(spr, 0, 0, spr.width, spr.height, W / 2 - spr.ox * 3, y + 108 - spr.oy * 3, spr.width * 3, spr.height * 3);
    canvasText(ctx, 'CHARLIE', W / 2, y + 114, { color: '#5a2a14', shadow: '#c8b07c' });
    canvasText(ctx, `MANCHE ${n}/${CHARLIE.rounds}`, W / 2, y + 126, { color: '#8a4a24', shadow: '#c8b07c' });
  }

  // rappel du suspect en haut à gauche
  drawWanted(ctx) {
    const spr = this.suspect();
    if (!spr) return;
    // en double taille : c'est la seule référence pendant la manche
    // (s'efface sous la loupe pour ne pas cacher les passants derrière)
    const top = spr.oy - 25;
    const m = this.mouse;
    ctx.globalAlpha = m.in && m.x < 52 && m.y < 70 ? 0.2 : 1;
    ctx.fillStyle = OUT; ctx.fillRect(2, 2, 38, 56);
    ctx.fillStyle = '#e8d4a0'; ctx.fillRect(3, 3, 36, 54);
    ctx.drawImage(spr, 0, top, spr.width, 26, 21 - spr.ox * 2, 4, spr.width * 2, 52);
    ctx.globalAlpha = 1;
  }

  // barre du bas : où est la caméra dans la ville
  drawMap(ctx, cx) {
    ctx.fillStyle = 'rgba(26,15,10,0.55)';
    ctx.fillRect(0, H - 4, W, 4);
    ctx.fillStyle = 'rgba(248,208,112,0.85)';
    ctx.fillRect(Math.round((cx / WW) * W), H - 3, Math.round((W * W) / WW), 2);
    const c = this.cur;
    if (c?.result && this.world) {
      const p = npcPos(this.world.charlie, c.result.t - c.at);
      ctx.fillStyle = RED;
      ctx.fillRect(Math.round((p.x / WW) * W) - 1, H - 5, 3, 5);
    }
    if (this.hunting && this.t - this.cur.at < 3000 && Math.floor(this.now / 300) % 2) {
      canvasText(ctx, '◄', 8, H / 2, { color: '#f8d070' });
      canvasText(ctx, '►', W - 8, H / 2, { color: '#f8d070' });
    }
  }

  drawLoupe(ctx, t) {
    const x = Math.round(this.mouse.x), y = Math.round(this.mouse.y);
    const locked = t < this.lockUntil || t < this.pendingUntil;
    const col = locked ? '#8a8478' : this.color(this.me);
    ring(ctx, x + 1, y + 1, 7, 7, OUT);
    ring(ctx, x, y, 7, 7, col);
    for (let k = 0; k < 5; k++) {
      ctx.fillStyle = OUT; ctx.fillRect(x + 6 + k, y + 6 + k, 2, 2);
      ctx.fillStyle = '#8a5a34'; ctx.fillRect(x + 6 + k, y + 6 + k, 1, 1);
    }
    if (locked && t < this.lockUntil) canvasText(ctx, 'X', x, y - 3, { color: '#f0705a' });
    else { ctx.fillStyle = '#fdf6e0'; ctx.fillRect(x, y, 1, 1); }
  }

  // aperçu de Charlie pendant le compte à rebours
  drawOverlay(ctx) {
    super.drawOverlay(ctx);
    const spr = this.suspect();
    if (this.t0 == null || this.t >= 0 || !spr || this.cutEl() != null) return;
    for (const x of [30, W - 30]) ctx.drawImage(spr, 0, 0, spr.width, spr.height, x - spr.ox * 3, 160 - spr.oy * 3, spr.width * 3, spr.height * 3);
  }

  hudStats() {
    return [['MANCHE', `${this.cur?.n || 1}/${CHARLIE.rounds}`, 'yellow'], ['TROUVÉS', this.finds || 0, 'green'], ['RATÉS', this.misses || 0, 'salmon']];
  }
}
