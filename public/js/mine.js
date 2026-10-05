// Mini-jeu « La mine » : course en wagonnet jusqu'à la sortie, en quatre étapes filmées chacune autrement :
// les galeries (de côté), la descente (de derrière, en fausse 3D comme dans les vieux jeux de wagonnet),
// le gouffre (de côté, plan large, sur des ponts de bois) et la sortie (de derrière, vers la lumière).
// Puis l'arrivée, dehors au soleil. ↑ / ↓ (ou ← / →, Z / S, Q / D) ou clic : préparer l'aiguillage ;
// le wagonnet change de voie au prochain embranchement. Espace ou clic droit : aiguillage au neutre.
// Les autres joueurs roulent sur le même parcours, chacun à sa vitesse : on les voit en fantômes.
import * as S from './sprites.js';
import { sfx } from './audio.js';
import { canvasText } from './scene.js';
import { MiniScene, pixelSprite } from './miniscene.js';
import { riderLook, drawHat } from './lasso.js';
import { beardHasMustache, beardHasChin } from './data.js';
import { W, H } from './worlds.js';
import { desertOpts } from './env.js';
import { MINE, STAGES, stageAt, GOLD, OBSTACLES, baseSpeed, cartSpeed, mineWorld, newCart, cartLane, airH, stepCart } from './minegame.js';

const OUT = S.OUT;
const UP = 33, DN = 4; // une galerie va de rail - 33 à rail + 4
const rd = Math.round;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smooth = (k) => (k <= 0 ? 0 : k >= 1 ? 1 : k * k * (3 - 2 * k));
const STAGE_FX = 2200; // durée du bandeau de changement d'étape

// Vues de côté : hauteur des trois voies et colonne du wagonnet
const SIDE = {
  side: { lanes: [92, 140, 188], px: 112 },
  wide: { lanes: [88, 138, 188], px: 80 }, // le gouffre : plan plus large, on voit plus loin devant
};
const laneYf = (L, l) => {
  const i = clamp(Math.floor(l), 0, 1);
  return L.lanes[i] + (L.lanes[i + 1] - L.lanes[i]) * clamp(l - i, 0, 1);
};

// Vue de derrière : horizon, hauteur de la caméra, demi-largeur du tunnel, écart des voies (à la profondeur du
// wagonnet) et profondeur de référence. Un objet à d px devant le wagonnet est réduit d'un facteur 1 / (1 + d / DEPTH).
const BK = { hz: 84, floor: 106, ceil: 150, half: 176, lane: 96, depth: 90, fog: 1100, far: 1000 };
const bkScale = (d) => 1 / (1 + Math.max(-60, d) / BK.depth);
const bkProj = (lane, d) => { const s = bkScale(d); return { x: W / 2 + (lane - 1) * BK.lane * s, y: BK.hz + BK.floor * s, s }; };
const fogAt = (d) => Math.pow(clamp(d / BK.fog, 0, 1), 0.7);

// ------------------------------------------------------------ outils de dessin
const cache = new Map();
const cached = (key, make) => {
  let c = cache.get(key);
  if (!c) { c = make(); cache.set(key, c); }
  return c;
};
function blob(R, cx, cy, rx, ry, col) {
  for (let dy = -ry; dy <= ry; dy++) {
    const half = rd(rx * Math.sqrt(Math.max(0, 1 - (dy / (ry + 0.5)) ** 2)));
    R(rd(cx) - half, rd(cy) + dy, half * 2 + 1, 1, col);
  }
}
// petit générateur pseudo-aléatoire pour les textures (identiques à chaque partie)
const lcg = (s) => () => ((s = (s * 9301 + 49297) % 233280) / 233280);

// Paroi rocheuse (plan des voies) et fond des galeries (plus sombre, défile moins vite)
function rockTile(back) {
  return cached(back ? 'back' : 'rock', () => {
    const c = S.makeCanvas(512, H);
    const x = c.getContext('2d');
    const r = lcg(back ? 71 : 13);
    x.fillStyle = back ? '#241810' : '#4a3426';
    x.fillRect(0, 0, 512, H);
    const put = (px, py, w, h, col) => { x.fillStyle = col; x.fillRect(px, py, w, h); x.fillRect(px - 512, py, w, h); };
    const cols = back ? ['#1c120c', '#2e2016', '#33241a'] : ['#3e2a1e', '#5a4030', '#634634', '#3a2a20'];
    for (let i = 0; i < (back ? 260 : 520); i++) {
      const px = Math.floor(r() * 512), py = Math.floor(r() * H), w = 2 + Math.floor(r() * (back ? 10 : 14)), h = 2 + Math.floor(r() * 5);
      put(px, py, w, h, cols[Math.floor(r() * cols.length)]);
    }
    if (back) {
      // planches de soutènement au fond des galeries
      for (let px = 0; px < 512; px += 64) { put(px, 0, 3, H, '#3a2618'); put(px + 3, 0, 1, H, '#4a3220'); }
    } else {
      // strates et filons d'or
      for (let i = 0; i < 18; i++) { const py = Math.floor(r() * H); put(Math.floor(r() * 512), py, 20 + Math.floor(r() * 40), 1, '#6a4c38'); }
      for (let i = 0; i < 40; i++) put(Math.floor(r() * 512), Math.floor(r() * H), 1 + Math.floor(r() * 2), 1, r() < 0.7 ? '#c8a040' : '#f0d878');
      for (let i = 0; i < 6; i++) { // cristaux
        const px = Math.floor(r() * 500), py = Math.floor(r() * H);
        put(px, py, 2, 3, '#7ab0f0'); put(px + 2, py + 1, 2, 2, '#4a7ac0'); put(px, py, 1, 1, '#d8ecff');
      }
    }
    return c;
  });
}

// Le gouffre : la grande caverne au loin (stalactites, parois), qui défile lentement
function chasmTile() {
  return cached('chasm', () => {
    const c = S.makeCanvas(512, H);
    const x = c.getContext('2d');
    const r = lcg(29);
    const g = x.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#0e0a0c'); g.addColorStop(0.6, '#1a1216'); g.addColorStop(1, '#2a1410');
    x.fillStyle = g;
    x.fillRect(0, 0, 512, H);
    const put = (px, py, w, h, col) => { x.fillStyle = col; x.fillRect(px, py, w, h); x.fillRect(px - 512, py, w, h); };
    // piliers rocheux au loin
    for (let i = 0; i < 7; i++) {
      const px = Math.floor(r() * 512), w = 18 + Math.floor(r() * 30);
      for (let y = 0; y < H; y += 2) put(px + Math.round(Math.sin(y / 17 + i) * 4), y, w, 2, i % 2 ? '#1e161a' : '#241a1c');
    }
    // stalactites
    for (let i = 0; i < 40; i++) {
      const px = Math.floor(r() * 512), h = 6 + Math.floor(r() * 26);
      for (let k = 0; k < h; k++) put(px + Math.floor(k / 3), k, Math.max(1, 6 - Math.floor((k * 6) / h)), 1, '#2e2226');
    }
    for (let i = 0; i < 30; i++) put(Math.floor(r() * 512), Math.floor(r() * 150), 1, 1, r() < 0.5 ? '#7ab0f0' : '#c8a040');
    return c;
  });
}

// ------------------------------------------------------------ sprites
// wagonnet et son passager, vus de côté (rail en y = 0) ; f : image des roues
function cartSprite(r, f) {
  return cached(`c${r.key}|${f}`, () => pixelSprite(40, 42, 20, 40, (R) => {
    const b = 11; // la tête du cavalier (lasso.js) descend dans le wagonnet
    R(-7, -23, 8, 8, r.cloth); R(-7, -23, 8, 1, S.shade(r.cloth, 0.2));
    R(-6, -40 + b, 6, 7, r.skin); R(0, -37 + b, 1, 1, r.skin);
    R(-6, -39 + b, 1, 5, r.hair); R(-2, -38 + b, 1, 1, '#1a0f0a');
    if (beardHasMustache(r.beard)) R(-2, -35 + b, 3, 1, r.hair);
    if (beardHasChin(r.beard)) R(-4, -34 + b, 4, 1, r.hair);
    R(-6, -22, 6, 1, r.color); R(-9, -22 + (f % 2), 3, 1, r.color); // foulard au vent
    drawHat(R, r, b);
    R(2, -21, 2, 5, r.cloth); R(3, -17, 2, 2, r.skin); // main sur le rebord
    // caisse en tôle, plus large en haut
    for (let y = -16; y <= -5; y++) {
      const k = Math.floor((y + 16) / 4);
      R(-14 + k, y, 28 - 2 * k, 1, y === -16 ? '#a8acb4' : y < -12 ? '#7a7e88' : '#5e626c');
    }
    R(-13, -13, 26, 2, r.color); // bande aux couleurs du joueur
    for (const x of [-11, -4, 3, 10]) R(x, -15, 1, 1, '#2a2e34');
    R(-12, -6, 24, 1, '#3e424a');
    // roues
    for (const wx of [-8, 8]) {
      blob(R, wx, -3, 3, 3, '#2a2e34');
      blob(R, wx, -3, 2, 2, '#6a6e78');
      if (f % 2) R(wx - 2, -3, 5, 1, '#2a2e34'); else R(wx, -5, 1, 5, '#2a2e34');
    }
  }));
}

// le même, vu de derrière (dos du passager, chapeau, arrière de la caisse)
function cartBackSprite(r, f) {
  return cached(`b${r.key}|${f}`, () => pixelSprite(36, 40, 18, 38, (R) => {
    const brim = { sombrero: 22, tophat: 12, bowler: 10, gambler: 14, kepi: 10, bandana: 0, coonskin: 0, none: 0 }[r.hat] ?? 16;
    // buste et tête de dos
    R(-7, -26, 14, 10, r.cloth); R(-7, -26, 14, 1, S.shade(r.cloth, 0.2));
    R(-6, -22, 12, 1, r.color); R(5 + (f % 2), -21, 3, 1, r.color); // foulard au vent
    R(-4, -33, 8, 7, r.hair); R(-5, -31, 1, 3, r.skin); R(4, -31, 1, 3, r.skin); // oreilles
    if (brim) R(-brim / 2, -34, brim, 2, r.hatC);
    if (r.hat === 'tophat') R(-4, -42, 8, 8, r.hatC);
    else if (r.hat === 'sombrero') R(-4, -39, 8, 5, r.hatC);
    else if (r.hat === 'coonskin') { R(-4, -37, 8, 4, '#8a6a48'); R(-1, -33, 2, 8, '#8a6a48'); }
    else if (r.hat === 'bandana') R(-4, -35, 8, 3, r.hatC);
    else if (r.hat !== 'none') R(-4, -37, 8, 3, r.hatC);
    // arrière de la caisse, plus large en haut
    for (let y = -17; y <= -4; y++) {
      const k = Math.floor((y + 17) / 5);
      R(-15 + k, y, 30 - 2 * k, 1, y === -17 ? '#a8acb4' : y < -13 ? '#7a7e88' : '#5e626c');
    }
    R(-14, -13, 28, 2, r.color);
    R(-3, -10, 6, 3, '#3e424a'); // attelage
    for (const wx of [-12, 12]) { blob(R, wx, -3, 2, 3, '#2a2e34'); R(wx, -5 + (f % 2) * 2, 1, 1, '#6a6e78'); }
  }));
}

const OBS_DRAW = {
  rock(R) {
    blob(R, -4, -5, 8, 5, '#5a5048'); blob(R, 5, -4, 6, 4, '#6a6058'); blob(R, 0, -9, 5, 4, '#7a7068');
    R(-2, -12, 4, 1, '#9a9088'); R(-9, -6, 3, 1, '#8a8078'); R(7, -6, 2, 1, '#8a8078');
  },
  fall(R) { // rochers tombés du plafond
    blob(R, -3, -6, 9, 6, '#6a5a4a'); blob(R, 6, -4, 5, 4, '#7a6a58'); blob(R, -1, -11, 5, 4, '#8a7a68');
    R(-3, -14, 4, 1, '#a89888'); R(-11, -1, 3, 1, '#5a4a3a'); R(9, -1, 3, 1, '#5a4a3a');
  },
  beam(R) {
    for (let k = 0; k < 24; k++) R(-12 + k, -14 + rd(k * 0.5), 3, 3, k % 6 ? '#8a5a34' : '#6a4024');
    R(-12, -14, 2, 1, '#c8a070'); blob(R, -8, -2, 3, 2, '#5a5048'); blob(R, 6, -2, 4, 2, '#6a6058');
  },
  barrel(R) {
    R(-6, -16, 12, 16, '#8a5a34'); R(-4, -16, 2, 16, '#a8703c'); R(3, -16, 2, 16, '#6a4024');
    for (const y of [-14, -8, -3]) R(-6, y, 12, 1, '#4a4f58');
    R(-5, -17, 10, 1, '#5a3a20');
  },
  cart(R) { // wagonnet renversé
    for (let y = -14; y <= -4; y++) { const k = Math.floor((-4 - y) / 4); R(-13 + k, y, 26 - 2 * k, 1, y === -4 ? '#8a8e96' : '#5e626c'); }
    blob(R, -7, -16, 2, 2, '#2a2e34'); blob(R, 7, -16, 2, 2, '#2a2e34');
    R(-14, -3, 28, 3, '#4a3e34');
  },
  tnt(R) {
    R(-8, -14, 16, 14, '#a8302a'); R(-8, -14, 16, 2, '#c8483a'); R(-8, -2, 16, 2, '#7a1a14');
    R(-8, -14, 1, 14, '#6a4024'); R(7, -14, 1, 14, '#6a4024');
    // « TNT » en pixels
    for (const [x, y, w, h] of [[-6, -10, 3, 1], [-5, -9, 1, 4], [-2, -10, 1, 5], [-1, -9, 1, 1], [0, -8, 1, 1], [1, -10, 1, 5], [3, -10, 3, 1], [4, -9, 1, 4]]) R(x, y, w, h, '#f4ecd8');
    R(5, -18, 1, 4, '#3a2a20');
  },
  gap(R) { // rail cassé (vu de derrière)
    R(-13, -2, 26, 3, '#0a0604'); R(-14, -3, 4, 2, '#6a4024'); R(10, -3, 4, 2, '#6a4024'); R(-9, -4, 2, 1, '#8a8f98'); R(7, -4, 2, 1, '#8a8f98');
  },
};
const obsSprite = (k) => cached(`o${k}`, () => pixelSprite(32, 26, 16, 23, OBS_DRAW[k]));

const GOLD_DRAW = {
  gold(R) { blob(R, 0, -3, 3, 2, '#c8902a'); blob(R, 0, -4, 2, 2, '#e8b840'); R(-1, -5, 1, 1, '#fff0a0'); },
  nugget(R) { blob(R, 0, -4, 5, 4, '#c8902a'); blob(R, -1, -5, 4, 3, '#e8b840'); R(-2, -7, 2, 1, '#fff0a0'); R(2, -4, 1, 1, '#a87020'); },
  gem(R) {
    R(-3, -9, 7, 2, '#a8e0f8'); R(-4, -7, 9, 2, '#7ac0f0'); R(-3, -5, 7, 1, '#4a90d0'); R(-2, -4, 5, 1, '#4a90d0'); R(-1, -3, 3, 1, '#3a70b0'); R(0, -2, 1, 1, '#3a70b0');
    R(-2, -9, 1, 1, '#ffffff');
  },
};
const goldSprite = (k) => cached(`g${k}`, () => pixelSprite(16, 14, 8, 12, GOLD_DRAW[k]));

// accélérateur, boue, tremplin : vus de côté (side) et de derrière (back)
const PAD_DRAW = {
  boost: {
    side(R, on) {
      R(-12, -2, 24, 2, '#6a5020');
      for (const ox of [-9, -2, 5]) for (let k = 0; k < 4; k++) { R(ox + k, -9 + k, 2, 1, on); R(ox + k, -3 - k, 2, 1, on); }
    },
    back(R, on) {
      R(-11, -2, 22, 2, '#6a5020');
      for (const oy of [-14, -9, -4]) for (let k = 0; k < 4; k++) { R(-k - 2, oy + k, 2, 1, on); R(k, oy + k, 2, 1, on); }
    },
  },
  mud: {
    side(R) { blob(R, 0, -1, 13, 2, '#4a2e18'); blob(R, -2, -2, 8, 1, '#6a4428'); R(4, -3, 2, 1, '#8a6a40'); R(-6, -3, 1, 1, '#8a6a40'); },
    back(R) { blob(R, 0, -2, 12, 3, '#4a2e18'); blob(R, -2, -3, 7, 1, '#6a4428'); R(3, -4, 2, 1, '#8a6a40'); R(-5, -3, 1, 1, '#8a6a40'); },
  },
  ramp: {
    side(R) {
      for (let k = 0; k < 18; k++) { const h = 1 + Math.floor(k * 0.6); R(-9 + k, -h, 1, h, k % 4 ? '#8a5a34' : '#6a4024'); R(-9 + k, -h, 1, 1, '#c8a070'); }
      R(6, -11, 2, 11, '#5a3a20');
    },
    back(R) {
      for (let y = -12; y <= -1; y++) R(-11 + Math.floor((y + 12) / 4), y, 22 - 2 * Math.floor((y + 12) / 4), 1, y % 3 ? '#8a5a34' : '#6a4024');
      R(-11, -12, 22, 1, '#c8a070');
    },
  },
};
const padSprite = (k, view, on = '#f8d070') => cached(`p${k}${view}${on}`, () => pixelSprite(32, 20, 16, 17, (R) => PAD_DRAW[k][view](R, on)));

// chauve-souris (2 images)
function bat(ctx, x, y, f) {
  ctx.fillStyle = '#1a1014';
  ctx.fillRect(x - 1, y, 3, 2);
  if (f) { ctx.fillRect(x - 4, y - 2, 3, 1); ctx.fillRect(x + 2, y - 2, 3, 1); ctx.fillRect(x - 2, y - 1, 1, 1); ctx.fillRect(x + 2, y - 1, 1, 1); }
  else { ctx.fillRect(x - 4, y + 1, 3, 1); ctx.fillRect(x + 2, y + 1, 3, 1); ctx.fillRect(x - 5, y + 2, 1, 1); ctx.fillRect(x + 5, y + 2, 1, 1); }
}

// ------------------------------------------------------------ tunnel de la vue de derrière
// Pour chaque pixel de l'écran, on calcule une fois pour toutes la surface vue (sol, paroi, plafond), sa
// profondeur et son brouillard ; à chaque image il ne reste qu'à décaler la texture selon la distance parcourue.
const hexToAbgr = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return (255 << 24) | ((n & 255) << 16) | (((n >> 8) & 255) << 8) | ((n >> 16) & 255);
};
const FOGS = 32;
const SURF_PAL = [
  ['#3a2a1e', '#33251a', '#3e2c20', '#2e2016', '#3a2a1e'], // sol
  ['#4a3426', '#523a2a', '#44302a', '#3e2a1e', '#6a4428'], // parois (le dernier : étais de bois)
  ['#2e2016', '#33241a', '#281c12', '#2a1e14', '#5a3a20'], // plafond (le dernier : poutres)
];
// q : 1 = un calcul par pixel ; 2 = un par bloc de 2 × 2 (téléphones : 4 fois moins de pixels à calculer
// et à envoyer à la carte graphique à chaque image). Les rails restent dessinés en pleine résolution.
const TUN = {};
function tunnelTables(q = 1) {
  if (TUN[q]) return TUN[q];
  const TW = W / q, TH = H / q, N = TW * TH;
  const D = new Float32Array(N), V = new Int32Array(N), surf = new Uint8Array(N), F = new Uint8Array(N);
  for (let ty = 0; ty < TH; ty++) for (let tx = 0; tx < TW; tx++) {
    const i = ty * TW + tx, x = tx * q + (q - 1) / 2, y = ty * q + (q - 1) / 2, dx = x - W / 2 + 0.5;
    const sF = y > BK.hz ? (y - BK.hz) / BK.floor : 0;
    const sC = y < BK.hz ? (BK.hz - y) / BK.ceil : 0;
    const sW = Math.abs(dx) / BK.half;
    let s, t;
    if (sW >= Math.max(sF, sC)) { s = sW; t = 1; V[i] = Math.floor((BK.hz - y) / Math.max(0.02, s) / 8); }
    else if (sF > sC) { s = sF; t = 0; V[i] = Math.floor(dx / s / 8); }
    else { s = sC; t = 2; V[i] = Math.floor(dx / s / 8); }
    surf[i] = t;
    D[i] = s < 0.02 ? 1e9 : BK.depth * (1 / s - 1);
    F[i] = Math.min(FOGS - 1, Math.floor(FOGS * fogAt(D[i])));
  }
  const PAL = new Uint32Array(3 * FOGS * 5);
  for (let t = 0; t < 3; t++) for (let f = 0; f < FOGS; f++) for (let k = 0; k < 5; k++) {
    PAL[(t * FOGS + f) * 5 + k] = hexToAbgr(S.mix(SURF_PAL[t][k], '#070403', f / (FOGS - 1)));
  }
  // dehors (au bout du tunnel de la sortie) : ciel clair et sable
  const SKY = new Uint32Array(TH);
  for (let ty = 0; ty < TH; ty++) SKY[ty] = hexToAbgr(S.mix('#f8e8c0', '#fff8e0', clamp((BK.hz - ty * q) / 80, 0, 1)));
  const SAND = hexToAbgr('#e0b080');
  // couleurs des rails et traverses selon la ligne (brouillard compris)
  const row = (col, y) => S.mix(col, '#070403', y > BK.hz ? fogAt(BK.depth * (BK.floor / (y - BK.hz) - 1)) : 1);
  const RAIL = [], RAILHI = [], SLEEP = [];
  for (let y = 0; y < H; y++) { RAIL[y] = row('#8a8f98', y); RAILHI[y] = row('#c9ced6', y); SLEEP[y] = row('#5a3a20', y); }
  TUN[q] = { D, V, surf, F, PAL, SKY, SAND, RAIL, RAILHI, SLEEP, TW, TH };
  return TUN[q];
}

// ------------------------------------------------------------ scène
export class MineScene extends MiniScene {
  constructor(canvas, hooks) {
    super(canvas, hooks);
    this.kind = 'mine';
    this.showEnv = false; // sous terre, ni heure ni météo (sauf dehors, à l'arrivée)
    this.world = null;
    this.dark = S.makeCanvas(W, H);
    this.tun = S.makeCanvas(W, H);
    this.tunImg = null;
    this.tunQ = 0;
  }

  title() { return 'LA MINE'; }
  help() {
    return [
      this.touch ? 'BOUTONS HAUT / BAS : PRÉPARER L\'AIGUILLAGE' : 'FLÈCHES (Z Q S D) OU CLIC : PRÉPARER L\'AIGUILLAGE',
      'LE WAGONNET CHANGE DE VOIE AU PROCHAIN EMBRANCHEMENT',
      'ACCÉLÉRATEUR : TURBO - BOUE : FREINE - TREMPLIN : SAUT',
      'OR 10 / 25 / 50 - CHOCS -20, TNT -40 - LE 1ER SORTI : +150',
      '4 ÉTAPES : GALERIES, DESCENTE, GOUFFRE, SORTIE',
    ];
  }
  goText() { return 'EN VOITURE !'; }

  setup(seed) {
    this.world = mineWorld(seed);
    this.got = new Set();
    this.crashed = new Set();
    this.fallen = new Set();
    this.goldN = 0;
    this.crashN = 0;
    this.cart = newCart();
    this.stage = 0;
    this.stageT = -1e9;
    this.batI = 0;
    this.flocks = [];
    this.finishT = null; // temps de course à l'arrivée (ms)
    this.finishNow = null;
    this.remote = {};
    for (let i = 0; i < this.n; i++) if (i !== this.me) this.remote[i] = { x: 0, tx: 0, l: 1, tl: 1, air: false, hitAt: -1e9, outAt: null };
    this.riders = this.state.players.map((p, i) => riderLook(p.character, this.color(i), `${i}:${JSON.stringify(p.character || {})}`));
    this.fx = []; // étincelles, poussière (coordonnées de l'écran)
    this.booms = [];
    this.lastL = null;
    this.outside = null;
  }

  applySync(st) {
    for (const id of st.got || []) this.got.add(id);
    for (const id of st.crashed || []) this.crashed.add(id);
    this.goldN = this.got.size;
    this.crashN = this.crashed.size;
    // reconnexion : on reprend là où l'hôte nous a vus pour la dernière fois
    const c = this.cart;
    c.wx = st.wx || 0;
    c.ji = this.world.junctions.findIndex((j) => j.x > c.wx);
    if (c.ji < 0) c.ji = this.world.junctions.length;
    this.stage = stageAt(c.wx);
    this.batI = this.world.bats.findIndex((b) => b > c.wx);
    if (this.batI < 0) this.batI = this.world.bats.length;
    const me = st.players[this.me];
    if (me?.rank) { c.done = true; c.wx = this.world.len; this.finishT = me.time; this.finishNow = -1e9; }
    st.players.forEach((p, i) => { const r = this.remote[i]; if (r && p.rank) { r.x = r.tx = this.world.len; r.outAt = -1e9; } });
  }

  get view() {
    if (this.cart?.done) return 'out';
    return STAGES[this.stage].cam;
  }

  // ---------------------------------------------------------- entrées
  setArm(d) {
    if (!this.playing || this.cart.done) return;
    const c = this.cart;
    if (d && (c.lane + d < 0 || c.lane + d > 2) && !c.tr) { sfx('dry'); return; }
    if (c.arm === d) return;
    c.arm = d;
    sfx('click');
  }
  onKey(k) {
    if (['arrowup', 'arrowleft', 'z', 'w', 'q', 'a'].includes(k)) this.setArm(-1);
    else if (['arrowdown', 'arrowright', 's', 'd'].includes(k)) this.setArm(1);
    else if (k === ' ') this.setArm(0);
  }
  onFire(m) {
    if (!this.cart) return;
    const p = this.cartScreen();
    if (this.view === 'back') this.setArm(m.x < p.x ? -1 : 1);
    else this.setArm(m.y < p.y - 14 ? -1 : 1);
  }
  onAlt() { this.setArm(0); }

  // position du wagonnet à l'écran, selon la vue
  cartScreen() {
    const c = this.cart, v = this.view;
    if (v === 'back') return { x: W / 2 + (cartLane(c) - 1) * BK.lane, y: BK.hz + BK.floor - airH(c) * 2 };
    const L = SIDE[v] || SIDE.side;
    return { x: L.px, y: laneYf(L, cartLane(c)) - airH(c) };
  }

  remoteLive(i, d) {
    const r = this.remote[i];
    if (!r) return;
    if (typeof d.x === 'number') {
      r.tx = d.x;
      if (Math.abs(r.x - d.x) > 300) r.x = d.x;
    }
    if (typeof d.l === 'number') r.tl = d.l / 100;
    r.air = !!d.a;
    if (d.hit) r.hitAt = this.t;
  }

  onEvent(ev) {
    const r = this.remote[ev.by];
    if (ev.type === 'crash' && r) r.hitAt = this.t;
    else if (ev.type === 'arrive') {
      if (r) { r.x = r.tx = this.world.len; r.outAt = this.now; }
      const who = ev.by === this.me ? 'TU SORS' : `${this.name(ev.by).toUpperCase()} SORT`;
      this.popup(W / 2, 46, `${who} ${ev.rank}${ev.rank === 1 ? 'ER' : 'E'} ! +${ev.pts}`, this.color(ev.by), ev.by === this.me);
      if (ev.by !== this.me) sfx('ding');
    } else if (ev.type === 'left' && this.remote[ev.who]) this.remote[ev.who].left = true;
  }

  // ---------------------------------------------------------- simulation
  update(dt) {
    if (!this.world) return;
    const t = this.t, now = this.now;
    const c = this.cart;
    if (t >= 0 && !this.over && !c.done && t < this.duration) {
      const gdt = Math.min(dt, t); // le premier pas commence pile au GO
      const res = stepCart(c, this.world, gdt, t, this.got, this.crashed);
      const p = this.cartScreen();
      if (res.took) { sfx('clank'); this.hooks.send({ kind: 'switch', id: res.took.id }); }
      for (const pad of res.pads) {
        if (pad.kind === 'boost') { sfx('rope'); sfx('coin'); this.popup(p.x, p.y - 44, 'TURBO !', '#f8d070', true); this.spark(p.x - 10, p.y - 4, 12, '#fff070'); }
        else if (pad.kind === 'mud') { sfx('puff'); this.popup(p.x, p.y - 44, 'BOUE !', '#c8a070', true); this.splash(p.x, p.y); }
        else if (pad.kind === 'ramp') { sfx('whip'); this.popup(p.x, p.y - 50, 'HOP !', '#fdf6e0', true); }
      }
      if (res.landed) { sfx('clank'); this.dust(p.x, p.y, 8); this.shake = 3; }
      for (const g of res.gold) {
        this.got.add(g.id);
        this.goldN++;
        const pts = GOLD[g.kind].pts;
        this.popup(p.x, p.y - 30, `+${pts}`, g.kind === 'gem' ? '#a8e0f8' : '#f8d070', g.kind !== 'gold');
        this.spark(p.x + 6, p.y - 14, g.kind === 'gold' ? 4 : 10, g.kind === 'gem' ? '#d8f0ff' : '#fff0a0');
        sfx(g.kind === 'gold' ? 'coin' : 'ding');
        this.hooks.send({ kind: 'gold', id: g.id, wx: Math.round(c.wx) });
      }
      for (const o of res.hits) {
        this.crashed.add(o.id);
        this.crashN++;
        c.stunUntil = t + MINE.stun;
        // comme chez l'hôte, le score ne descend pas sous 0
        const lost = Math.min(Math.max(0, this.state?.players[this.me]?.score ?? 0), -OBSTACLES[o.kind].pts);
        this.popup(p.x, p.y - 36, lost ? `-${lost}` : 'AÏE !', '#f0705a', true);
        this.spark(p.x + 12, p.y - 8, 14, '#f8d070');
        this.dust(p.x + 12, p.y - 4, 10);
        this.shake = o.kind === 'tnt' ? 9 : 6;
        if (o.kind === 'tnt') { this.booms.push({ x: p.x + 14, y: p.y - 10, at: t }); sfx('boom'); } else sfx('thud');
        this.hooks.send({ kind: 'crash', id: o.id, wx: Math.round(c.wx) });
      }
      if (res.finished) {
        this.finishT = t;
        this.finishNow = now;
        sfx('good');
        this.hooks.send({ kind: 'finish', wx: Math.round(c.wx) });
      }
      // changement d'étape : la caméra change, un bandeau annonce l'étape
      const st = stageAt(c.wx);
      if (st !== this.stage) { this.stage = st; this.stageT = now; sfx('whip'); }
      // nuée de chauves-souris
      while (this.batI < this.world.bats.length && this.world.bats[this.batI] <= c.wx) {
        this.batI++;
        this.flocks.push({ at: now });
        sfx('hover'); sfx('hover', 0.12); sfx('hover', 0.25);
      }
      // éboulements : le plafond lâche quand on arrive
      for (const o of this.world.obstacles) {
        if (o.kind !== 'fall' || this.fallen.has(o.id)) continue;
        const d = o.x - c.wx;
        if (d < MINE.fallWarn - 110 && d > -40) { this.fallen.add(o.id); sfx('thud'); this.shake = Math.max(this.shake, 2); }
      }
      const l = rd(cartLane(c) * 100);
      this.sendLive({ x: rd(c.wx), l, ...(c.air ? { a: 1 } : {}) });
      this.lastL = l;
    }
    // fantômes : on prolonge leur course entre deux nouvelles
    for (const r of Object.values(this.remote)) {
      if (t >= 0 && r.outAt == null && !this.over) r.tx = Math.min(this.world.len, r.tx + baseSpeed(r.tx) * dt);
      r.x += (r.tx - r.x) * Math.min(1, dt * 0.01);
      r.l += (r.tl - r.l) * Math.min(1, dt * 0.012);
    }
    for (const p of this.fx) { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += (p.g || 0) * dt; }
    this.fx = this.fx.filter((p) => p.t < p.max);
    this.booms = this.booms.filter((b) => t - b.at < 500);
    this.flocks = this.flocks.filter((f) => now - f.at < 1800);
    // poussière soulevée par les roues
    this.dustT = (this.dustT || 0) + dt;
    if (this.dustT > 90 && t >= 0 && !c.done && !c.air && this.view !== 'back') {
      this.dustT = 0;
      const p = this.cartScreen();
      this.dust(p.x - 12, p.y - 1, 1);
    }
  }

  spark(x, y, n, col) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = 0.03 + Math.random() * 0.07;
      this.fx.push({ x, y, vx: Math.cos(a) * v - 0.03, vy: Math.sin(a) * v - 0.03, g: 0.0002, t: 0, max: 300 + Math.random() * 300, col });
    }
  }

  dust(x, y, n) {
    for (let i = 0; i < n; i++) {
      this.fx.push({ x: x + (Math.random() - 0.5) * 6, y: y - Math.random() * 3, vx: -0.03 - Math.random() * 0.04, vy: -0.01 - Math.random() * 0.01, t: 0, max: 400 + Math.random() * 300, col: 'rgba(200,170,130,0.5)', puff: true });
    }
  }

  splash(x, y) {
    for (let i = 0; i < 14; i++) {
      const a = -Math.PI * (0.15 + Math.random() * 0.7), v = 0.04 + Math.random() * 0.06;
      this.fx.push({ x: x + (Math.random() - 0.5) * 16, y: y - 2, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 0.0003, t: 0, max: 500, col: i % 2 ? '#6a4428' : '#4a2e18' });
    }
  }

  // ---------------------------------------------------------- rendu
  render(ctx) {
    if (!this.world) return;
    const v = this.view;
    if (v === 'out') this.renderOut(ctx);
    else if (v === 'back') this.renderBack(ctx);
    else this.renderSide(ctx, SIDE[v], v === 'wide');
    if (v !== 'out') {
      for (const p of this.fx) {
        if (p.puff) S.disc(ctx, p.x, p.y, rd(1 + p.t / 250), p.col);
        else { ctx.fillStyle = p.col; ctx.fillRect(rd(p.x), rd(p.y), 1, 1); }
      }
      this.drawFlocks(ctx);
      this.drawSpeed(ctx);
      this.drawHud(ctx);
    }
    this.drawStageBanner(ctx);
  }

  // ---------- vues de côté (les galeries ; le gouffre en plan large)
  renderSide(ctx, L, chasm) {
    const t = this.t, now = this.now, c = this.cart;
    const cam = c.wx - L.px;
    const onScreen = (x, m = 40) => x - cam > -m && x - cam < W + m;
    const J = this.world.junctions.filter((j) => onScreen(j.x, 100));
    const gaps = this.world.obstacles.filter((o) => o.kind === 'gap' && onScreen(o.x, 30));
    const lamps = [];
    if (chasm) this.chasmBack(ctx, cam, L, J, gaps, lamps, now);
    else this.galleryBack(ctx, cam, L, J, lamps, now);
    // sol des galeries et rails (coupés aux rails cassés)
    L.lanes.forEach((y, l) => {
      if (!chasm) { ctx.fillStyle = '#3a2a1e'; ctx.fillRect(0, y + 1, W, DN); }
      let x0 = 0;
      const cuts = gaps.filter((o) => o.lane === l).map((o) => rd(o.x - cam)).sort((a, b) => a - b);
      for (const gx of cuts) {
        this.sleepers(ctx, cam, y, x0, gx - 18);
        this.rail(ctx, x0, gx - 18, y);
        x0 = gx + 18;
      }
      this.sleepers(ctx, cam, y, x0, W);
      this.rail(ctx, x0, W, y);
      for (const gx of cuts) { // bouts de rail tordus
        ctx.fillStyle = '#8a8f98'; ctx.fillRect(gx - 18, y - 3, 2, 1); ctx.fillRect(gx + 16, y - 1, 2, 1);
      }
    });
    for (const j of J) this.junction(ctx, j, cam, now, L);
    // accélérateurs, boue, tremplins
    for (const p of this.world.pads) {
      if (!onScreen(p.x)) continue;
      const spr = padSprite(p.kind, 'side', Math.floor(now / 120) % 2 ? '#fff070' : '#f8a030');
      ctx.drawImage(spr, rd(p.x - cam - spr.ox), L.lanes[p.lane] + 1 - spr.oy);
    }
    // or et obstacles
    for (const g of this.world.gold) {
      if (this.got.has(g.id) || !onScreen(g.x)) continue;
      const bob = rd(Math.sin(now / 200 + g.id) * 1.5);
      const spr = goldSprite(g.kind);
      ctx.drawImage(spr, rd(g.x - cam - spr.ox), L.lanes[g.lane] - 10 + bob - spr.oy);
      if (Math.floor(now / 140 + g.id) % 6 === 0) { ctx.fillStyle = '#ffffff'; ctx.fillRect(rd(g.x - cam) + 2, L.lanes[g.lane] - 22 + bob, 1, 1); }
    }
    for (const o of this.world.obstacles) {
      if (!onScreen(o.x) || o.kind === 'gap') continue;
      const spr = obsSprite(o.kind);
      const hit = this.crashed.has(o.id);
      const y = L.lanes[o.lane] + 1;
      let dy = 0;
      if (o.kind === 'fall' && !hit) {
        // le plafond lâche : des gravillons, puis les rochers tombent juste devant le wagonnet
        const k = clamp((MINE.fallWarn - (o.x - c.wx)) / 110, 0, 1);
        dy = -rd((1 - k * k) * (UP + 6));
        if (k <= 0) {
          ctx.fillStyle = '#8a7a68';
          if (Math.floor(now / 90 + o.id) % 3 === 0) ctx.fillRect(rd(o.x - cam) + (o.id % 5) - 2, y - UP + 2 + (Math.floor(now / 40) % 8), 1, 1);
          continue;
        }
      }
      ctx.globalAlpha = hit ? 0.45 : 1;
      ctx.drawImage(spr, rd(o.x - cam - spr.ox), y - spr.oy + dy);
      ctx.globalAlpha = 1;
      if (o.kind === 'tnt' && !hit && Math.floor(now / 70) % 2) { ctx.fillStyle = '#fff070'; ctx.fillRect(rd(o.x - cam) + 5, L.lanes[o.lane] - 18, 1, 1); }
    }
    // wagonnets : les fantômes des autres, puis le tien
    const frame = Math.floor(now / 90) % 2;
    for (const [i, r] of Object.entries(this.remote)) {
      if (r.left || r.outAt != null || !onScreen(r.x, 30)) continue;
      const wob = t - r.hitAt < MINE.stun ? rd(Math.sin(now / 30) * 2) : 0;
      ctx.globalAlpha = 0.42;
      const spr = cartSprite(this.riders[+i], frame);
      ctx.drawImage(spr, rd(r.x - cam) + wob - spr.ox, rd(laneYf(L, r.l) - (r.air ? 16 : 0)) + 1 - spr.oy);
      ctx.globalAlpha = 1;
    }
    const p = this.cartScreen();
    const stun = t < c.stunUntil;
    if (c.air) { ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(L.px - 12, rd(laneYf(L, cartLane(c))) - 1, 24, 2); }
    const spr = cartSprite(this.riders[this.me], frame);
    ctx.drawImage(spr, L.px + (stun ? rd(Math.sin(now / 25) * 2) : 0) - spr.ox, rd(p.y) + 1 - spr.oy + (stun ? rd(Math.abs(Math.sin(now / 40)) * -2) : 0));
    for (const b of this.booms) S.drawFlash(ctx, b.x, b.y, 24, b.at);
    // obscurité, percée par les lanternes et la lampe du wagonnet
    this.light(ctx, lamps, p, L, cam, chasm ? 0.42 : 0.62);
    for (const b of this.booms) S.drawFlash(ctx, b.x, b.y, 18, b.at + 1);
    this.drawNames(ctx, L, cam, p);
    this.drawArm(ctx, p);
  }

  // galeries creusées dans la roche, étais et lanternes
  galleryBack(ctx, cam, L, J, lamps, now) {
    this.tile(ctx, rockTile(false), cam);
    ctx.save();
    ctx.beginPath();
    for (const y of L.lanes) ctx.rect(0, y - UP, W, UP + DN);
    for (const j of J) {
      const ya = L.lanes[j.a], yb = L.lanes[j.a + 1];
      for (let k = 0; k <= MINE.jLen; k += 2) {
        const sx = j.x - cam + k, e = smooth(k / MINE.jLen);
        ctx.rect(sx, rd(ya + (yb - ya) * e) - UP, 3, UP + DN);
        ctx.rect(sx, rd(yb + (ya - yb) * e) - UP, 3, UP + DN);
      }
    }
    ctx.clip();
    this.tile(ctx, rockTile(true), cam * 0.6);
    ctx.restore();
    L.lanes.forEach((y, l) => {
      ctx.fillStyle = '#5a3a20'; ctx.fillRect(0, y - UP, W, 3);
      ctx.fillStyle = '#7a5230'; ctx.fillRect(0, y - UP, W, 1);
      for (let x = Math.floor((cam - 40) / 96) * 96 + l * 32; x < cam + W + 40; x += 96) {
        const sx = rd(x - cam);
        if (J.some((j) => sx > j.x - cam - 6 && sx < j.x - cam + MINE.jLen + 6)) continue;
        ctx.fillStyle = '#6a4428'; ctx.fillRect(sx, y - UP, 4, UP + 1);
        ctx.fillStyle = '#8a5a34'; ctx.fillRect(sx, y - UP, 1, UP + 1);
        ctx.fillStyle = '#4a2e18'; ctx.fillRect(sx - 3, y - UP + 2, 10, 2);
      }
      for (let x = Math.floor((cam - 40) / 160) * 160 + 70 + l * 53; x < cam + W + 40; x += 160) {
        const sx = rd(x - cam), ly = y - UP + 3;
        this.lantern(ctx, sx, ly, now, x, lamps);
      }
    });
  }

  // la caverne du gouffre : ponts sur tréteaux au-dessus d'une rivière souterraine
  chasmBack(ctx, cam, L, J, gaps, lamps, now) {
    this.tile(ctx, chasmTile(), cam * 0.25);
    // la rivière tout en bas, qui luit
    for (let y = 200; y < H; y++) {
      const k = (y - 200) / 16;
      ctx.fillStyle = S.mix('#2a6a7a', '#7ad0e0', 0.3 + 0.2 * Math.sin(now / 300 + y));
      ctx.globalAlpha = 0.5 + k * 0.4;
      ctx.fillRect(0, y, W, 1);
    }
    ctx.globalAlpha = 1;
    for (let i = 0; i < 12; i++) {
      const x = ((i * 53 - cam * 0.5 - now * 0.02) % (W + 20) + W + 20) % (W + 20) - 10;
      ctx.fillStyle = '#c8f0f8'; ctx.fillRect(rd(x), 203 + (i % 4) * 3, 4, 1);
    }
    // tréteaux sous chaque pont
    L.lanes.forEach((y, l) => {
      const inGap = (sx) => gaps.some((o) => o.lane === l && Math.abs(o.x - cam - sx) < 22);
      for (let x = Math.floor((cam - 40) / 48) * 48 + l * 16; x < cam + W + 40; x += 48) {
        const sx = rd(x - cam);
        if (inGap(sx) || J.some((j) => sx > j.x - cam - 4 && sx < j.x - cam + MINE.jLen + 4)) continue;
        const bottom = l < 2 ? L.lanes[l + 1] - UP + 6 : H;
        ctx.fillStyle = '#3a2414'; ctx.fillRect(sx, y + 4, 3, bottom - y - 4);
        ctx.fillStyle = '#5a3a20'; ctx.fillRect(sx, y + 4, 1, bottom - y - 4);
        for (let k = 0; k < Math.min(30, bottom - y - 8); k += 2) { ctx.fillStyle = '#3a2414'; ctx.fillRect(sx + rd(k * 0.8), y + 6 + k, 2, 1); }
      }
      // tablier du pont
      ctx.fillStyle = '#4a2e18';
      let x0 = 0;
      for (const o of gaps.filter((g) => g.lane === l).sort((a, b) => a.x - b.x)) { const gx = rd(o.x - cam); ctx.fillRect(x0, y + 1, Math.max(0, gx - 18 - x0), 4); x0 = gx + 18; }
      ctx.fillRect(x0, y + 1, W - x0, 4);
      for (let x = Math.floor((cam - 40) / 260) * 260 + 120 + l * 90; x < cam + W + 40; x += 260) {
        const sx = rd(x - cam);
        if (inGap(sx)) continue;
        ctx.fillStyle = '#4a2e18'; ctx.fillRect(sx, y - 30, 2, 31);
        this.lantern(ctx, sx + 1, y - 30, now, x, lamps);
      }
    });
  }

  lantern(ctx, sx, ly, now, seed, lamps) {
    ctx.fillStyle = '#2a2e34'; ctx.fillRect(sx, ly, 1, 4);
    ctx.fillStyle = OUT; ctx.fillRect(sx - 3, ly + 4, 7, 7);
    const fl = 0.85 + 0.15 * Math.sin(now / 90 + seed);
    ctx.fillStyle = fl > 0.92 ? '#fff0a0' : '#f8d070'; ctx.fillRect(sx - 2, ly + 5, 5, 5);
    ctx.fillStyle = '#c87a2a'; ctx.fillRect(sx - 2, ly + 9, 5, 1);
    lamps.push({ x: sx, y: ly + 7, r: 44 * fl });
  }

  // texture qui défile en boucle
  tile(ctx, img, off) {
    const o = ((Math.floor(off) % img.width) + img.width) % img.width;
    ctx.drawImage(img, -o, 0);
    ctx.drawImage(img, img.width - o, 0);
  }

  sleepers(ctx, cam, y, x0 = 0, x1 = W) {
    ctx.fillStyle = '#5a3a20';
    for (let x = Math.floor(cam / 8) * 8; x < cam + W + 8; x += 8) {
      const sx = rd(x - cam);
      if (sx >= x0 - 3 && sx < x1) ctx.fillRect(sx, y, 4, 2);
    }
  }

  rail(ctx, x0, x1, y) {
    x0 = Math.max(0, x0); x1 = Math.min(W, x1);
    if (x1 <= x0) return;
    ctx.fillStyle = OUT; ctx.fillRect(x0, y - 2, x1 - x0, 3);
    ctx.fillStyle = '#8a8f98'; ctx.fillRect(x0, y - 2, x1 - x0, 2);
    ctx.fillStyle = '#c9ced6'; ctx.fillRect(x0, y - 2, x1 - x0, 1);
  }

  // embranchement : deux rails en X entre les voies, et un levier d'aiguillage à l'entrée de chaque voie
  junction(ctx, j, cam, now, L) {
    const ya = L.lanes[j.a], yb = L.lanes[j.a + 1];
    for (let k = 0; k <= MINE.jLen; k += 2) {
      const sx = rd(j.x - cam + k), e = smooth(k / MINE.jLen);
      for (const y of [rd(ya + (yb - ya) * e), rd(yb + (ya - yb) * e)]) {
        ctx.fillStyle = '#5a3a20'; ctx.fillRect(sx, y, 2, 2);
        ctx.fillStyle = OUT; ctx.fillRect(sx, y - 2, 3, 3);
        ctx.fillStyle = '#8a8f98'; ctx.fillRect(sx, y - 2, 3, 2);
        ctx.fillStyle = '#c9ced6'; ctx.fillRect(sx, y - 2, 3, 1);
      }
    }
    // le levier s'allume quand ton aiguillage est prêt pour cet embranchement
    const c = this.cart;
    const mine = this.world.junctions[c.ji] === j && !c.tr;
    for (const [lane, dir] of [[j.a, 1], [j.a + 1, -1]]) {
      const y = L.lanes[lane], sx = rd(j.x - cam - 10);
      const set = mine && c.lane === lane && c.arm === dir;
      ctx.fillStyle = OUT; ctx.fillRect(sx - 3, y - 6, 7, 5);
      ctx.fillStyle = '#4a4f58'; ctx.fillRect(sx - 2, y - 5, 5, 3);
      const tip = set ? (dir > 0 ? [5, -10] : [5, -18]) : [0, -16];
      for (let k = 0; k <= 8; k++) {
        const lx = rd(sx + (tip[0] * k) / 8), ly = rd(y - 5 + ((tip[1] + 5) * k) / 8);
        ctx.fillStyle = OUT; ctx.fillRect(lx - 1, ly, 3, 1);
        ctx.fillStyle = '#a8acb4'; ctx.fillRect(lx, ly, 1, 1);
      }
      const blink = set && Math.floor(now / 160) % 2;
      ctx.fillStyle = set ? (blink ? '#fff070' : '#f8d070') : '#a8302a';
      ctx.fillRect(sx + tip[0] - 1, y + tip[1] - 1, 3, 3);
    }
  }

  light(ctx, lamps, p, L, cam, dark) {
    const d = this.dark.getContext('2d');
    d.globalCompositeOperation = 'source-over';
    d.clearRect(0, 0, W, H);
    d.fillStyle = `rgba(8,4,2,${dark})`;
    d.fillRect(0, 0, W, H);
    d.globalCompositeOperation = 'destination-out';
    const hole = (x, y, r) => {
      const g = d.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(0,0,0,1)');
      g.addColorStop(0.55, 'rgba(0,0,0,0.6)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      d.fillStyle = g;
      d.fillRect(x - r, y - r, r * 2, r * 2);
    };
    for (const l of lamps) hole(l.x, l.y + 10, l.r);
    hole(p.x + 34, p.y - 14, 66); // lampe du wagonnet, qui éclaire devant
    hole(p.x, p.y - 14, 30);
    for (const r of Object.values(this.remote)) if (!r.left && r.outAt == null) hole(r.x - cam, laneYf(L, r.l) - 14, 22);
    for (const b of this.booms) hole(b.x, b.y, 90);
    ctx.drawImage(this.dark, 0, 0);
    // halo chaud des lanternes
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const l of lamps) {
      const g = ctx.createRadialGradient(l.x, l.y, 0, l.x, l.y, l.r * 0.6);
      g.addColorStop(0, 'rgba(120,70,20,0.35)');
      g.addColorStop(1, 'rgba(120,70,20,0)');
      ctx.fillStyle = g;
      ctx.fillRect(l.x - l.r, l.y - l.r, l.r * 2, l.r * 2);
    }
    ctx.restore();
  }

  drawNames(ctx, L, cam, p) {
    // les noms des fantômes s'empilent à gauche de leur wagonnet pour rester lisibles
    const rows = {};
    for (const [i, r] of Object.entries(this.remote)) {
      if (r.left || r.outAt != null) continue;
      const sx = rd(r.x - cam);
      if (sx < -10 || sx > W + 10) continue;
      const lane = Math.round(r.l);
      const k = (rows[lane] = (rows[lane] ?? 0) + 1) - 1;
      canvasText(ctx, this.name(+i).slice(0, 8).toUpperCase(), clamp(sx - 18, 30, W - 4), rd(laneYf(L, r.l)) - 26 + k * 8, { color: this.color(+i), align: 'right' });
    }
    canvasText(ctx, 'TOI', p.x - 2, rd(p.y) - 42, { color: this.color(this.me) });
  }

  // ---------- vue de derrière (la descente, la sortie)
  renderBack(ctx) {
    const t = this.t, now = this.now, c = this.cart, wx = c.wx, len = this.world.len;
    const q = this.touch ? 2 : 1;
    const T = tunnelTables(q);
    const { D, V, surf, F, PAL, SKY, SAND, TW, TH } = T;
    if (this.tunQ !== q) {
      this.tunQ = q;
      this.tun.width = TW;
      this.tun.height = TH;
      this.tunImg = this.tun.getContext('2d').createImageData(TW, TH);
      this.tunBuf = new Uint32Array(this.tunImg.data.buffer);
    }
    const buf = this.tunBuf;
    for (let i = 0, N = TW * TH; i < N; i++) {
      const u = wx + D[i];
      if (u > len && D[i] < 1600) { buf[i] = surf[i] === 0 ? SAND : SKY[(i / TW) | 0]; continue; }
      const s = surf[i], ui = u | 0;
      let k;
      if (s !== 0 && ui % 96 < 6) k = 4;
      else k = (Math.imul(ui >> 3, 374761393) ^ Math.imul(V[i], 668265263)) >>> 30;
      buf[i] = PAL[(s * FOGS + F[i]) * 5 + k];
    }
    this.tun.getContext('2d').putImageData(this.tunImg, 0, 0);
    ctx.drawImage(this.tun, 0, 0, W, H);
    // la lumière au bout du tunnel
    const dExit = len - wx;
    if (dExit < 1600) {
      const e = bkProj(1, dExit);
      const r = BK.half * e.s * 2.2;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(W / 2, BK.hz, 0, W / 2, BK.hz, r);
      g.addColorStop(0, `rgba(255,236,190,${0.5 * (1 - dExit / 1600)})`);
      g.addColorStop(1, 'rgba(255,236,190,0)');
      ctx.fillStyle = g;
      ctx.fillRect(W / 2 - r, BK.hz - r, r * 2, r * 2);
      ctx.restore();
    }
    // traverses et rails, ligne par ligne (les embranchements croisent les voies)
    const J = this.world.junctions.filter((j) => j.x + MINE.jLen > wx - 60 && j.x < wx + BK.far);
    for (let y = BK.hz + 2; y < H; y++) {
      const s = (y - BK.hz) / BK.floor;
      const d = BK.depth * (1 / s - 1);
      const u = wx + d;
      if (d > BK.far) continue;
      const lats = [0, 1, 2];
      for (const j of J) {
        if (u < j.x || u > j.x + MINE.jLen) continue;
        const e = smooth((u - j.x) / MINE.jLen);
        lats.push(j.a + e, j.a + 1 - e);
      }
      const rw = Math.max(1, rd(3 * s));
      const sleeper = ((u | 0) % 14 + 14) % 14 < 4;
      for (const lat of lats) {
        const cx = W / 2 + (lat - 1) * BK.lane * s;
        if (sleeper) { ctx.fillStyle = T.SLEEP[y]; ctx.fillRect(rd(cx - 22 * s), y, Math.max(1, rd(44 * s)), 1); }
        for (const o of [-13, 13]) {
          ctx.fillStyle = T.RAIL[y]; ctx.fillRect(rd(cx + o * s - rw / 2), y, rw, 1);
          if (rw > 1) { ctx.fillStyle = T.RAILHI[y]; ctx.fillRect(rd(cx + o * s - rw / 2), y, 1, 1); }
        }
      }
    }
    // lanternes accrochées aux étais
    const lamps = [];
    for (let x = Math.ceil((wx - 20) / 192) * 192 + 48; x < wx + BK.far; x += 192) {
      const d = x - wx;
      if (x > len) break;
      const s = bkScale(d);
      const side = (x / 192) % 2 ? 1 : -1;
      lamps.push({ x: W / 2 + side * (BK.half - 14) * s, y: BK.hz - 96 * s, s, d });
    }
    // tout ce qui est sur les rails, du plus loin au plus proche
    const items = [];
    const ahead = (x) => x - wx > -8 && x - wx < BK.far;
    for (const p of this.world.pads) if (ahead(p.x)) items.push({ d: p.x - wx, lane: p.lane, spr: padSprite(p.kind, 'back', Math.floor(now / 120) % 2 ? '#fff070' : '#f8a030') });
    for (const g of this.world.gold) if (!this.got.has(g.id) && ahead(g.x)) items.push({ d: g.x - wx, lane: g.lane, spr: goldSprite(g.kind), lift: 10 + Math.sin(now / 200 + g.id) * 1.5 });
    for (const o of this.world.obstacles) {
      if (!ahead(o.x)) continue;
      const hit = this.crashed.has(o.id);
      items.push({ d: o.x - wx, lane: o.lane, spr: obsSprite(o.kind), alpha: hit ? 0.45 : 1, tnt: o.kind === 'tnt' && !hit });
    }
    const frame = Math.floor(now / 90) % 2;
    for (const [i, r] of Object.entries(this.remote)) {
      if (r.left || r.outAt != null || !ahead(r.x) || r.x - wx < 20) continue;
      items.push({ d: r.x - wx, lane: r.l, spr: cartBackSprite(this.riders[+i], frame), alpha: 0.5, lift: r.air ? 16 : 0, name: +i });
    }
    for (const l of lamps) items.push({ lamp: l, d: l.d });
    items.sort((a, b) => b.d - a.d);
    for (const it of items) {
      if (it.lamp) { this.backLamp(ctx, it.lamp, now); continue; }
      const p = bkProj(it.lane, it.d);
      const k = 2 * p.s;
      const fog = fogAt(it.d);
      ctx.globalAlpha = (it.alpha ?? 1) * (1 - fog * 0.9);
      const w = Math.max(1, rd(it.spr.width * k)), h = Math.max(1, rd(it.spr.height * k));
      ctx.drawImage(it.spr, rd(p.x - it.spr.ox * k), rd(p.y - it.spr.oy * k - (it.lift || 0) * k), w, h);
      ctx.globalAlpha = 1;
      if (it.tnt && Math.floor(now / 70) % 2) { ctx.fillStyle = '#fff070'; ctx.fillRect(rd(p.x + 5 * k), rd(p.y - 18 * k), Math.max(1, rd(k)), Math.max(1, rd(k))); }
      if (it.name != null && it.d < 320) canvasText(ctx, this.name(it.name).slice(0, 8).toUpperCase(), rd(p.x), rd(p.y - 44 * k), { color: this.color(it.name) });
    }
    // ton wagonnet, de dos
    const p = this.cartScreen();
    const stun = t < c.stunUntil;
    if (c.air) { ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(rd(p.x) - 24, BK.hz + BK.floor - 2, 48, 3); }
    const spr = cartBackSprite(this.riders[this.me], frame);
    const bump = Math.floor(now / 70) % 3 === 0 && !c.air ? 1 : 0;
    // un peu transparent : on voit la voie et les obstacles à travers le wagonnet
    ctx.globalAlpha = 0.6;
    ctx.drawImage(spr, rd(p.x - spr.ox * 2 + (stun ? Math.sin(now / 25) * 3 : 0)), rd(p.y - spr.oy * 2 - bump), spr.width * 2, spr.height * 2);
    ctx.globalAlpha = 1;
    // lampe frontale : un cône de lumière devant le wagonnet
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(p.x, BK.hz + 60, 0, p.x, BK.hz + 60, 90);
    g.addColorStop(0, 'rgba(120,90,40,0.25)');
    g.addColorStop(1, 'rgba(120,90,40,0)');
    ctx.fillStyle = g;
    ctx.fillRect(p.x - 90, BK.hz - 30, 180, 180);
    ctx.restore();
    for (const b of this.booms) S.drawFlash(ctx, b.x, b.y, 30, b.at);
    this.drawArm(ctx, p);
  }

  backLamp(ctx, l, now) {
    const k = Math.max(1, rd(2 * l.s * 2) / 2);
    const fl = 0.85 + 0.15 * Math.sin(now / 90 + l.d);
    const x = rd(l.x), y = rd(l.y);
    ctx.globalAlpha = 1 - fogAt(l.d) * 0.85;
    ctx.fillStyle = OUT; ctx.fillRect(x - rd(3 * k), y, rd(7 * k), rd(7 * k));
    ctx.fillStyle = fl > 0.92 ? '#fff0a0' : '#f8d070'; ctx.fillRect(x - rd(2 * k), y + rd(k), rd(5 * k), rd(5 * k));
    ctx.globalAlpha = 1;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const r = 70 * l.s * fl;
    const g = ctx.createRadialGradient(x, y + 4 * k, 0, x, y + 4 * k, r);
    g.addColorStop(0, `rgba(140,80,20,${0.4 * (1 - fogAt(l.d))})`);
    g.addColorStop(1, 'rgba(140,80,20,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y + 4 * k - r, r * 2, r * 2);
    ctx.restore();
  }

  // ---------- l'arrivée, dehors au soleil
  renderOut(ctx) {
    const now = this.now;
    if (!this.outside) {
      this.outside = S.makeCanvas(W, H);
      const o = this.outside.getContext('2d');
      S.drawDesert(o, 0, 0, W, H, desertOpts(this.env, { sunX: 0.8, sunY: 0.25 }));
      // la falaise et l'entrée de la mine
      for (let x = 0; x < 120; x += 2) {
        const top = 40 + rd(Math.abs(Math.sin(x / 19)) * 16 + x * 0.35);
        o.fillStyle = OUT; o.fillRect(x, top - 1, 2, H - top + 1);
        o.fillStyle = x % 6 ? '#8a5a40' : '#7a4a34'; o.fillRect(x, top, 2, H - top);
      }
      o.fillStyle = '#120a06'; o.fillRect(36, 128, 50, 52);
      o.fillStyle = '#8a5228'; o.fillRect(30, 124, 6, 56); o.fillRect(86, 124, 6, 56); o.fillRect(26, 120, 70, 6);
      o.fillStyle = '#c2643e'; o.fillRect(0, 180, W, 36);
      for (let x = 0; x < W; x += 9) { o.fillStyle = '#5a3a20'; o.fillRect(x, 181, 5, 3); }
      o.fillStyle = OUT; o.fillRect(0, 178, W, 3);
      o.fillStyle = '#8a8f98'; o.fillRect(0, 178, W, 2);
      // la ligne d'arrivée
      o.fillStyle = '#5a3a20'; o.fillRect(128, 110, 3, 70); o.fillRect(176, 110, 3, 70);
      for (let x = 128; x < 179; x++) { o.fillStyle = Math.floor((x - 128) / 6) % 2 ? '#fdf6e0' : '#1a0f0a'; o.fillRect(x, 108, 1, 10); }
      canvasText(o, 'SORTIE', 153, 96, { color: '#f8d070' });
    }
    ctx.drawImage(this.outside, 0, 0);
    // les wagonnets sortis, rangés par ordre d'arrivée (le premier tout au bout)
    const players = this.state?.players || [];
    const frame = Math.floor(now / 90) % 2;
    players.forEach((pl, i) => {
      const r = i === this.me ? null : this.remote[i];
      const out = i === this.me ? this.finishNow : r?.outAt;
      if (!pl.rank || out == null) return;
      const slot = W - 40 - (pl.rank - 1) * 56;
      const k = smooth(clamp((now - out) / 1600, 0, 1));
      const x = rd(60 + (slot - 60) * k);
      const spr = cartSprite(this.riders[i], k < 1 ? frame : 0);
      ctx.drawImage(spr, x - spr.ox, 179 - spr.oy);
      if (k >= 1) canvasText(ctx, `${pl.rank}`, x, 128, { size: 16, color: this.color(i) });
    });
    // classement de l'arrivée
    ctx.fillStyle = 'rgba(26,15,10,0.72)';
    ctx.fillRect(W / 2 - 110, 10, 220, 22 + players.length * 11);
    canvasText(ctx, 'ARRIVÉE', W / 2, 14, { color: '#f8d070' });
    const order = players.map((p, i) => i).sort((a, b) => (players[a].rank || 99) - (players[b].rank || 99));
    order.forEach((i, k) => {
      const pl = players[i];
      const r = this.remote[i];
      const prog = i === this.me ? 1 : clamp((r?.x || 0) / this.world.len, 0, 0.99);
      const txt = pl.rank
        ? `${pl.rank}. ${pl.name.toUpperCase()}  ${this.fmt(pl.time ?? (i === this.me ? this.finishT : 0))}  +${MINE.arrival[pl.rank - 1] || 0}`
        : `-  ${pl.name.toUpperCase()}  EN ROUTE ${rd(prog * 100)} %`;
      canvasText(ctx, txt, W / 2, 26 + k * 11, { color: this.color(i) });
    });
    if (!this.over && players.some((p) => !p.rank && !p.left)) canvasText(ctx, 'EN ATTENTE DES AUTRES WAGONNETS…', W / 2, H - 12, { color: '#fdf6e0' });
  }

  fmt(ms) {
    const s = Math.max(0, (ms || 0) / 1000);
    return `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;
  }

  // ---------- par-dessus toutes les vues
  // flèche de l'aiguillage préparé : au-dessus / au-dessous (de côté), à gauche / à droite (de derrière)
  drawArm(ctx, p) {
    const c = this.cart;
    if (!c.arm || !this.playing || c.done) return;
    const now = this.now;
    const col = Math.floor(now / 200) % 2 ? '#fff070' : '#f8d070';
    const px = (x, y, w, h) => { ctx.fillStyle = OUT; ctx.fillRect(x - 1, y - 1, w + 2, h + 2); ctx.fillStyle = col; ctx.fillRect(x, y, w, h); };
    if (this.view === 'back') {
      const x = rd(p.x + c.arm * 46), y = rd(p.y - 40);
      for (let k = 0; k < 6; k++) px(x - c.arm * k, y - k, 1, 2 * k + 1);
      px(x + c.arm * (c.arm > 0 ? -12 : 1), y - 2, 11, 5);
      return;
    }
    const x = rd(p.x + 18), y = c.arm < 0 ? rd(p.y) - 38 : rd(p.y) + 6;
    for (let k = 0; k < 5; k++) {
      const yy = c.arm < 0 ? y + k : y + 4 - k;
      ctx.fillStyle = OUT; ctx.fillRect(x - k - 1, yy, 2 * k + 3, 1);
      ctx.fillStyle = col; ctx.fillRect(x - k, yy, 2 * k + 1, 1);
    }
    ctx.fillStyle = OUT; ctx.fillRect(x - 2, c.arm < 0 ? y + 5 : y - 4, 5, 5);
    ctx.fillStyle = col; ctx.fillRect(x - 1, c.arm < 0 ? y + 5 : y - 4, 3, 4);
  }

  drawFlocks(ctx) {
    for (const f of this.flocks) {
      const k = (this.now - f.at) / 1800;
      for (let i = 0; i < 14; i++) {
        const x = W + 20 - k * (W + 80) - (i % 5) * 18 + Math.sin(i * 3.1) * 10;
        const y = 40 + (i * 23) % 120 + Math.sin(this.now / 120 + i) * 6;
        bat(ctx, rd(x), rd(y), Math.floor(this.now / 80 + i) % 2);
      }
    }
  }

  // traits de vitesse pendant le turbo, gouttes de boue
  drawSpeed(ctx) {
    const c = this.cart, t = this.t, now = this.now;
    if (c.done) return;
    if (t < c.boostUntil) {
      ctx.fillStyle = 'rgba(255,240,180,0.55)';
      for (let i = 0; i < 18; i++) {
        const ph = ((now / 160 + i * 0.37) % 1);
        if (this.view === 'back') {
          const a = i * 2.4, r0 = 40 + ph * 200;
          for (let k = 0; k < 6; k++) ctx.fillRect(rd(W / 2 + Math.cos(a) * (r0 + k * 3)), rd(BK.hz + Math.sin(a) * (r0 + k * 3) * 0.6), 1, 1);
        } else ctx.fillRect(rd(W - ph * (W + 60)), 30 + (i * 37) % 170, 16 + (i % 3) * 8, 1);
      }
    }
    if (t < c.slowUntil) {
      ctx.fillStyle = 'rgba(90,58,30,0.12)';
      ctx.fillRect(0, 0, W, H);
    }
  }

  drawStageBanner(ctx) {
    const el = this.now - this.stageT;
    if (el < 0 || el > STAGE_FX) return;
    if (el < 450) { ctx.fillStyle = `rgba(8,4,2,${1 - el / 450})`; ctx.fillRect(0, 0, W, H); }
    const k = el < 300 ? smooth(el / 300) : el > STAGE_FX - 300 ? smooth((STAGE_FX - el) / 300) : 1;
    const y = rd(70 - (1 - k) * 30);
    ctx.globalAlpha = k;
    ctx.fillStyle = 'rgba(26,15,10,0.8)';
    ctx.fillRect(0, y, W, 34);
    canvasText(ctx, `ÉTAPE ${this.stage + 1} / ${STAGES.length}`, W / 2, y + 4, { color: '#c8b8e8' });
    canvasText(ctx, STAGES[this.stage].name, W / 2, y + 15, { size: 16, color: '#f8d070' });
    ctx.globalAlpha = 1;
  }

  drawHud(ctx) {
    const t = this.t, c = this.cart, len = this.world.len;
    // le trajet jusqu'à la sortie, découpé en étapes, avec tous les wagonnets
    const x0 = W / 2 - 80, y0 = 12, w = 160;
    canvasText(ctx, 'PUITS', x0 - 5, y0 - 4, { align: 'right', color: '#e8d8b8' });
    canvasText(ctx, 'SORTIE', x0 + w + 5, y0 - 4, { align: 'left', color: '#e8d8b8' });
    ctx.fillStyle = OUT; ctx.fillRect(x0 - 1, y0 - 1, w + 2, 3);
    ctx.fillStyle = '#6a5a4a'; ctx.fillRect(x0, y0, w, 1);
    ctx.fillStyle = '#f8d070'; ctx.fillRect(x0, y0, rd((w * c.wx) / len), 1);
    for (const s of STAGES.slice(1)) { ctx.fillStyle = '#e8d8b8'; ctx.fillRect(rd(x0 + w * s.from), y0 - 2, 1, 5); }
    const mark = (x, col, big) => {
      const mx = rd(x0 + w * clamp(x / len, 0, 1));
      ctx.fillStyle = OUT; ctx.fillRect(mx - (big ? 3 : 2), y0 + 2, big ? 7 : 5, big ? 5 : 4);
      ctx.fillStyle = col; ctx.fillRect(mx - (big ? 2 : 1), y0 + 3, big ? 5 : 3, big ? 3 : 2);
    };
    for (const [i, r] of Object.entries(this.remote)) if (!r.left) mark(r.x, this.color(+i), false);
    mark(c.wx, this.color(this.me), true);
    // vitesse et effets en cours
    const kmh = rd(cartSpeed(c, Math.max(0, t)) * 260);
    const fx = t < c.boostUntil ? ' TURBO' : t < c.slowUntil ? ' BOUE' : c.air ? ' EN L\'AIR' : '';
    canvasText(ctx, `${t < 0 ? 0 : kmh} KM/H${fx}`, W - 6, 4, { align: 'right', color: t < c.boostUntil ? '#fff070' : kmh > 44 ? '#f0907a' : '#e8d8b8' });
    // position dans la course
    const pos = this.position();
    canvasText(ctx, `${pos}${pos === 1 ? 'ER' : 'E'} / ${this.n}`, 6, 4, { align: 'left', color: '#f8d070' });
    if (t >= this.duration && !this.over) canvasText(ctx, 'TERMINUS !', W / 2, 30, { size: 16, color: '#f8d070' });
    // au départ, rappel des commandes
    if (t > 0 && t < 5000 && !c.arm) {
      ctx.globalAlpha = t > 4000 ? (5000 - t) / 1000 : 1;
      canvasText(ctx, 'HAUT / BAS : AIGUILLAGE', SIDE.side.px + 30, SIDE.side.lanes[1] + 10, { align: 'left', color: '#fdf6e0' });
      ctx.globalAlpha = 1;
    }
  }

  // rang actuel : les sortis d'abord (dans l'ordre), puis les plus avancés
  position() {
    const players = this.state?.players || [];
    const prog = (i) => (players[i]?.rank ? 1e6 - players[i].rank : i === this.me ? this.cart.wx : this.remote[i]?.x || 0);
    const mine = prog(this.me);
    return 1 + players.filter((p, i) => i !== this.me && !p.left && prog(i) > mine).length;
  }

  clock() { return this.finishT ?? Math.max(0, this.t); }
  progress() { return this.world ? clamp(this.cart.wx / this.world.len, 0, 1) : 0; }

  hudStats() {
    return [['PÉPITES', this.goldN || 0, 'yellow'], ['CHOCS', this.crashN || 0, 'salmon']];
  }
}
