// Mini-jeu « Conquête de l'Ouest » (scène) : la carte vue de haut, les forts, les bâtiments et les unités
// de chaque joueur, et le panneau de commandes en bas de l'écran.
// Clic sur un bouton de bâtiment puis sur la carte : construire (dans son territoire ; une mine sur un filon).
// Boutons d'unités : recruter. Clic sur la carte : l'armée s'y rend ; clic sur un ennemi : l'attaquer ;
// DÉFENDRE : retour au fort. L'hôte simule la partie et envoie un instantané 4 fois par seconde :
// on lisse les déplacements entre deux instantanés.
import * as S from './sprites.js';
import { sfx } from './audio.js';
import { canvasText } from './scene.js';
import { MiniScene, pixelSprite } from './miniscene.js';
import { W, H } from './worlds.js';
import {
  RTS, T, BUILDINGS, BUILD_IDS, UNITS, UNIT_IDS, KIND_IDS, VEINS, rtsWorld, canBuild, inTerritory, bCenter, tileAt,
} from './rtsgame.js';

const TS = RTS.tile, MH = RTS.mapH, COLS = RTS.cols, ROWS = RTS.rows;
const OUT = S.OUT;
const rd = Math.round;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const hash = (n) => {
  let t = (n * 0x6d2b79f5) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const h2 = (x, y) => hash(x * 7919 + y * 104729 + 13);

const cache = new Map();
const cached = (key, make) => {
  let c = cache.get(key);
  if (!c) { c = make(); cache.set(key, c); }
  return c;
};

// Textes courts des boutons (le panneau d'aide en bas de la carte)
const INFO = {
  mine: 'SUR UN FILON : OR +2.6/S (MINERAI +1.4/S)',
  ranch: 'BÉTAIL : VIVRES +1.6/S',
  farm: 'COTON ET MAÏS : OR +0.7/S, VIVRES +0.9/S',
  stable: 'DÉBLOQUE LES CAVALIERS',
  armory: 'DÉBLOQUE TIREURS ET DYNAMITEURS',
  tower: 'TIRE SUR LES ENNEMIS QUI APPROCHENT',
  gunman: 'POLYVALENT, SORT DU FORT',
  rider: 'RAPIDE ET SOLIDE (ÉCURIE)',
  rifle: 'TIRE DE LOIN, FRAGILE (ARMURERIE)',
  dyn: 'RASE LES BÂTIMENTS (ARMURERIE)',
};
const BUILD_KEYS = ['1', '2', '3', '4', '5', '6'];
const UNIT_KEYS = [['a', 'q'], ['z', 'w'], ['e'], ['r']];

// ------------------------------------------------------------ sprites des bâtiments
// Vue de trois quarts : le bâtiment occupe sa base (w cases) et déborde vers le haut.
const WOOD = '#8a5a32', WOOD_D = '#5e3a1e', WOOD_L = '#a8743e';
function buildingSprite(kind, col) {
  return cached(`b:${kind}:${col}`, () => {
    if (kind === 'fort') {
      return pixelSprite(30, 34, 15, 30, (R) => {
        // palissade en rondins : quatre côtés, tours d'angle, cour intérieure
        R(-12, -22, 24, 20, '#9a8a5a'); // cour
        for (let x = -12; x < 12; x += 2) { R(x, -24, 2, 5, x % 4 ? WOOD : WOOD_L); R(x, -4, 2, 5, x % 4 ? WOOD : WOOD_L); }
        for (let y = -22; y < -3; y += 2) { R(-13, y, 3, 2, WOOD_D); R(10, y, 3, 2, WOOD_D); }
        R(-12, -25, 24, 1, WOOD_L);
        for (let x = -12; x < 12; x += 2) { R(x, -25, 1, 1, '#c8945a'); R(x, -5, 1, 1, '#c8945a'); }
        for (const [tx, ty] of [[-14, -28], [9, -28], [-14, -8], [9, -8]]) {
          R(tx, ty, 6, 7, WOOD_D); R(tx, ty, 6, 2, '#6a4426'); R(tx + 1, ty + 3, 4, 1, '#2a1a10');
        }
        R(-3, -3, 6, 4, '#3a2416'); R(-3, -3, 6, 1, WOOD_L); // porte
        // bâtisse et réserve
        R(-8, -18, 9, 7, '#c8a878'); R(-9, -20, 11, 3, col); R(-9, -20, 11, 1, S.shade(col, 0.25));
        R(-6, -15, 2, 2, '#3a2416'); R(-2, -15, 2, 4, '#5e3a1e');
        R(4, -16, 5, 4, '#7a5a3a'); R(4, -17, 5, 1, '#a8743e');
        R(3, -10, 2, 2, '#6a4a2a'); R(6, -10, 2, 2, '#6a4a2a');
      });
    }
    if (kind === 'mine') {
      return pixelSprite(20, 22, 10, 19, (R) => {
        // butte rocheuse, galerie étayée, rails et wagonnet
        R(-8, -12, 16, 11, '#8a7258'); R(-7, -14, 14, 3, '#9a826a'); R(-5, -16, 10, 2, '#a8907a');
        R(-6, -6, 3, 2, '#6a5644'); R(4, -9, 3, 2, '#6a5644');
        R(-3, -11, 6, 8, '#1a0f0a'); R(-4, -12, 8, 1, WOOD_L); R(-4, -11, 1, 8, WOOD); R(3, -11, 1, 8, WOOD);
        R(-1, -3, 2, 3, '#6a6a6a'); R(-2, -1, 4, 1, '#4a4a4a');
        R(3, -4, 5, 3, '#5a5a62'); R(3, -5, 5, 1, '#7a7a82'); R(4, -1, 1, 1, '#2a2a2a'); R(7, -1, 1, 1, '#2a2a2a');
        R(-7, -3, 1, 3, col); R(-7, -5, 3, 2, col);
      });
    }
    if (kind === 'ranch') {
      return pixelSprite(20, 22, 10, 19, (R) => {
        // grange rouge, enclos
        R(-8, -15, 9, 9, '#a8382a'); R(-9, -17, 11, 3, '#6a2a20'); R(-9, -17, 11, 1, col);
        R(-6, -11, 5, 5, '#5a1a14'); R(-6, -11, 5, 1, '#e8d8b8'); R(-4, -11, 1, 5, '#e8d8b8');
        R(2, -12, 7, 1, WOOD_L); R(2, -7, 7, 1, WOOD_L); R(2, -2, 7, 1, WOOD_L);
        R(-8, -2, 10, 1, WOOD_L); R(8, -12, 1, 11, WOOD); R(-8, -5, 1, 4, WOOD);
        R(1, -6, 1, 5, WOOD);
      });
    }
    if (kind === 'farm') {
      return pixelSprite(20, 22, 10, 19, (R) => {
        // rangs de maïs et de coton, petite remise
        for (let k = 0; k < 4; k++) {
          R(-8, -12 + k * 3, 10, 2, k % 2 ? '#c8a838' : '#6a8a32');
          for (let x = -8; x < 2; x += 2) R(x, -12 + k * 3, 1, 1, k % 2 ? '#f0d860' : '#e8e8d8');
        }
        R(3, -14, 6, 7, '#c8a878'); R(2, -16, 8, 3, col); R(2, -16, 8, 1, S.shade(col, 0.25)); R(5, -10, 2, 3, '#5e3a1e');
        R(3, -5, 6, 4, '#9a7a4a'); R(4, -4, 1, 2, '#f0d860'); R(6, -4, 1, 2, '#f0d860');
      });
    }
    if (kind === 'stable') {
      return pixelSprite(20, 22, 10, 19, (R) => {
        // écurie en planches, deux box, une tête de cheval, du foin
        R(-8, -14, 16, 10, WOOD); R(-9, -17, 18, 4, WOOD_D); R(-9, -17, 18, 1, col);
        for (let x = -8; x < 8; x += 3) R(x, -14, 1, 10, WOOD_D);
        R(-6, -10, 4, 6, '#2a1a10'); R(2, -10, 4, 6, '#2a1a10');
        R(-5, -10, 3, 3, '#8a5a3a'); R(-5, -8, 2, 2, '#6a4026'); R(-4, -11, 1, 1, '#8a5a3a');
        R(-9, -4, 5, 3, '#d8c060'); R(-8, -5, 3, 1, '#e8d070');
      });
    }
    if (kind === 'armory') {
      return pixelSprite(20, 22, 10, 19, (R) => {
        // bâtisse en pierre, enseigne aux fusils croisés, tonneaux de poudre
        R(-8, -14, 15, 11, '#8a8a8a'); R(-9, -16, 17, 3, '#4a4a52'); R(-9, -16, 17, 1, col);
        for (let y = -13; y < -3; y += 2) for (let x = -8 + ((y / 2) % 2 ? 1 : 0); x < 7; x += 3) R(x, y, 2, 1, '#9e9e9e');
        R(-2, -9, 4, 6, '#3a2416');
        R(-7, -12, 4, 3, '#c8a878'); R(-7, -12, 1, 1, '#3a2416'); R(-5, -11, 1, 1, '#3a2416'); R(-4, -10, 1, 1, '#3a2416'); R(-6, -11, 1, 1, '#3a2416');
        R(3, -12, 3, 3, '#f8d070');
        R(4, -4, 3, 4, '#6a4426'); R(4, -3, 3, 1, '#3a2416'); R(-9, -3, 3, 3, '#6a4426'); R(-9, -2, 3, 1, '#d83020');
      });
    }
    // tour de guet : quatre poteaux, plate-forme, toit, fanion
    return pixelSprite(14, 28, 7, 25, (R) => {
      R(-4, -12, 1, 12, WOOD_D); R(3, -12, 1, 12, WOOD_D); R(-3, -12, 1, 11, WOOD); R(2, -12, 1, 11, WOOD);
      R(-3, -8, 6, 1, WOOD_D); R(-3, -4, 6, 1, WOOD_D);
      R(-5, -14, 10, 3, WOOD_L); R(-5, -12, 10, 1, WOOD_D);
      R(-4, -18, 1, 4, WOOD_D); R(3, -18, 1, 4, WOOD_D);
      R(-6, -20, 12, 2, '#6a4426'); R(-5, -21, 10, 1, '#8a5a32');
      R(0, -24, 1, 4, '#3a2416'); R(1, -24, 3, 2, col);
    });
  });
}

// ------------------------------------------------------------ sprites des unités
// Vus de trois quarts, pieds à l'origine ; f : image de la marche (0 ou 1)
const SKIN = '#e0a878';
function unitSprite(kind, col, f) {
  return cached(`u:${kind}:${col}:${f}`, () => {
    if (kind === 'rider') {
      return pixelSprite(18, 18, 9, 15, (R) => {
        const leg = f ? 1 : 0;
        R(-6, -6, 11, 4, '#7a4a2a'); R(-5, -7, 9, 1, '#8a5a3a'); // cheval
        R(4, -9, 3, 4, '#7a4a2a'); R(6, -10, 2, 2, '#6a3a20'); R(4, -10, 1, 1, '#3a2416');
        R(-7, -6, 1, 3, '#3a2416');
        R(-5, -2, 1, 2 + leg, '#5a3420'); R(-3, -2, 1, 3 - leg, '#5a3420'); R(1, -2, 1, 2 + leg, '#5a3420'); R(3, -2, 1, 3 - leg, '#5a3420');
        R(-2, -11, 4, 4, col); R(-2, -8, 1, 2, '#4a3a5a'); // cavalier
        R(-1, -13, 3, 2, SKIN); R(-3, -14, 6, 1, '#5a3a22'); R(-2, -16, 4, 2, '#5a3a22');
      });
    }
    return pixelSprite(12, 15, 6, 13, (R) => {
      const hat = kind === 'rifle' ? '#3a2a1e' : kind === 'dyn' ? '#8a7a5a' : '#6a4426';
      R(-2, -3, 2, 3 - f, '#3a3a5a'); R(1, -3, 2, 2 + f, '#3a3a5a'); // jambes
      R(-2, -7, 5, 4, col); R(-2, -4, 5, 1, '#3a2416'); // chemise, ceinture
      R(-3, -7, 1, 3, col); R(3, -7, 1, 3, col);
      R(-1, -9, 3, 2, SKIN);
      R(-3, -10, 7, 1, hat); R(-2, -12, 5, 2, hat);
      if (kind === 'gunman') R(4, -5, 2, 1, '#4a4a4a');
      else if (kind === 'rifle') { R(3, -7, 1, 1, '#5a3a1a'); R(4, -8, 1, 1, '#5a3a1a'); R(5, -9, 1, 1, '#4a4a4a'); R(-3, -6, 5, 1, '#c8a878'); }
      else { R(4, -8, 1, 3, '#d83020'); R(4, -9, 1, 1, '#f8d070'); }
    });
  });
}

// petites icônes du panneau
function iconGold() { return cached('i:gold', () => pixelSprite(8, 8, 1, 1, (R) => { R(0, 2, 6, 3, '#e8b030'); R(1, 1, 4, 1, '#f8d070'); R(1, 2, 2, 1, '#fff0b0'); })); }
function iconFood() { return cached('i:food', () => pixelSprite(8, 8, 1, 1, (R) => { R(1, 1, 4, 4, '#a8382a'); R(2, 1, 2, 1, '#c85a3a'); R(3, 0, 1, 1, '#5a8a32'); R(0, 4, 6, 1, '#e8d8b8'); })); }
function swords(ctx, x, y, col) {
  ctx.fillStyle = col;
  for (let k = 0; k < 5; k++) { ctx.fillRect(x + k, y + k, 1, 1); ctx.fillRect(x + 4 - k, y + k, 1, 1); }
  ctx.fillRect(x, y + 3, 2, 1); ctx.fillRect(x + 3, y + 3, 2, 1);
}

// ------------------------------------------------------------ la carte (rendue une fois)
const GROUND = {
  [T.grass]: ['#8c9a4a', '#84924a', '#94a252', '#7c8a42'],
  [T.sand]: ['#d8b878', '#d0b072', '#e0c084', '#c8a86a'],
  [T.scrub]: ['#c4ac70', '#bca468', '#ccb478', '#b49c62'],
};
function renderMap(world) {
  const c = S.makeCanvas(W, MH);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(W, MH);
  const d = img.data;
  const rgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const pal = {};
  for (const k of Object.keys(GROUND)) pal[k] = GROUND[k].map(rgb);
  const ROCK = ['#b0644a', '#a85c44', '#bc6e52', '#9a5440'].map(rgb), RIM = rgb('#d08a66');
  const FACE = ['#9a5038', '#7a3e2e', '#8a4632', '#6a3426', '#5a2c20'].map(rgb);
  const WATER = ['#3a7aa8', '#3672a0', '#4282b0'].map(rgb), FORD = ['#6aa0b8', '#78acc0', '#609ab0'].map(rgb), STONE = rgb('#a8a090');
  const BANK = rgb('#b8a070');
  const tileJ = (x, y) => {
    // bords irréguliers entre prairie, désert et broussailles
    const jx = x + (h2(x >> 1, y >> 1) - 0.5) * 7, jy = y + (h2((y >> 1) + 91, (x >> 1) + 37) - 0.5) * 7;
    return tileAt(world, Math.floor(jx / TS), Math.floor(jy / TS));
  };
  // mesas aux bords arrondis : indicateur « rocher » interpolé entre les centres des cases, seuil bruité
  const rockT = (c, r) => (tileAt(world, c, r) === T.rock ? 1 : 0);
  const isRock = (x, y) => {
    if (y < 0) y = 0;
    const fx = x / TS - 0.5, fy = y / TS - 0.5, c0 = Math.floor(fx), r0 = Math.floor(fy), kx = fx - c0, ky = fy - r0;
    const a = rockT(c0, r0) + (rockT(c0 + 1, r0) - rockT(c0, r0)) * kx, b = rockT(c0, r0 + 1) + (rockT(c0 + 1, r0 + 1) - rockT(c0, r0 + 1)) * kx;
    return a + (b - a) * ky + (h2(x >> 1, (y >> 1) + 77) - 0.5) * 0.3 > 0.5;
  };
  for (let y = 0; y < MH; y++) {
    for (let x = 0; x < W; x++) {
      const tile = tileAt(world, Math.floor(x / TS), Math.floor(y / TS));
      const n = h2(x, y);
      let px;
      if (tile === T.water || tile === T.ford) {
        const left = tileAt(world, Math.floor((x - 2) / TS), Math.floor(y / TS)), right = tileAt(world, Math.floor((x + 2) / TS), Math.floor(y / TS));
        const edge = (left !== T.water && left !== T.ford) || (right !== T.water && right !== T.ford);
        if (edge && n < 0.6) px = BANK;
        else if (tile === T.ford) px = n < 0.12 ? STONE : FORD[Math.floor(n * 3) % 3];
        else px = WATER[(Math.floor(y / 3) + Math.floor(n * 1.6)) % 3];
      } else if (isRock(x, y)) {
        // mesa : dessus clair et craquelé, falaise en strates au sud, rebord éclairé au nord
        let k = 0;
        while (k < 6 && isRock(x, y + k + 1)) k++;
        if (k < 6) px = FACE[Math.min(4, k + (n < 0.2 ? 1 : 0))];
        else if (!isRock(x, y - 1) || !isRock(x - 1, y)) px = RIM;
        else px = ROCK[Math.floor(n * 4)];
      } else {
        let t = tileJ(x, y);
        if (!pal[t]) t = tile in pal ? tile : T.grass;
        px = pal[t][Math.floor(n * 4)];
        // ombre portée des mesas (vers le sud)
        if (isRock(x - 3, y - 1) || isRock(x - 2, y - 3)) px = px.map((v) => v * 0.7);
      }
      const i = (y * W + x) * 4;
      d[i] = px[0]; d[i + 1] = px[1]; d[i + 2] = px[2]; d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  // touffes, cailloux, fleurs, cactus et buissons
  for (let r = 0; r < ROWS; r++) for (let cc = 0; cc < COLS; cc++) {
    const tile = tileAt(world, cc, r), n = h2(cc + 500, r + 300), x0 = cc * TS, y0 = r * TS;
    const px = (x, y, col) => { ctx.fillStyle = col; ctx.fillRect(x0 + x, y0 + y, 1, 1); };
    if (tile === T.grass) {
      if (n < 0.5) { const x = 1 + Math.floor(n * 11), y = 2 + Math.floor(n * 37) % 5; px(x, y, '#6a7a38'); px(x + 1, y - 1, '#6a7a38'); px(x + 2, y, '#6a7a38'); }
      if (n > 0.9) { px(3, 3, '#f0e070'); px(5, 6, '#e8e8f0'); }
    } else if (tile === T.sand) {
      if (n < 0.25) { px(2 + Math.floor(n * 16), 4, '#a88a58'); px(3 + Math.floor(n * 16), 4, '#b89a68'); }
      if (n > 0.97) { ctx.fillStyle = '#e8e0d0'; ctx.fillRect(x0 + 2, y0 + 3, 3, 2); ctx.fillRect(x0 + 1, y0 + 5, 1, 1); ctx.fillRect(x0 + 5, y0 + 5, 1, 1); px(3, 4, '#3a2a1e'); }
    } else if (tile === T.scrub) {
      if (n < 0.55) {
        // saguaro
        const x = x0 + 2 + Math.floor(n * 6), y = y0 + 1;
        ctx.fillStyle = OUT; ctx.fillRect(x - 1, y - 1, 4, 9); ctx.fillRect(x - 3, y + 1, 7, 4);
        ctx.fillStyle = '#4a7a3a'; ctx.fillRect(x, y, 2, 7); ctx.fillRect(x - 2, y + 2, 1, 2); ctx.fillRect(x + 3, y + 1, 1, 2);
        ctx.fillRect(x - 2, y + 3, 2, 1); ctx.fillRect(x + 2, y + 2, 1, 1);
        ctx.fillStyle = '#6a9a4a'; ctx.fillRect(x, y, 1, 6);
      } else {
        // buisson d'armoise
        const x = x0 + 1 + Math.floor(n * 4), y = y0 + 2;
        ctx.fillStyle = OUT; ctx.fillRect(x - 1, y - 1, 7, 6);
        ctx.fillStyle = '#7a8a4a'; ctx.fillRect(x, y, 5, 4);
        ctx.fillStyle = '#9aa860'; ctx.fillRect(x + 1, y, 2, 1); ctx.fillRect(x + 3, y + 1, 1, 1);
      }
    } else if (tile === T.rock && n < 0.4 && tileAt(world, cc, r + 1) === T.rock && tileAt(world, cc, r - 1) === T.rock) {
      px(2 + Math.floor(n * 12), 3, '#8a4a36'); px(3 + Math.floor(n * 12), 4, '#8a4a36');
    }
  }
  // filons
  for (const v of world.veins) drawVein(ctx, v);
  return c;
}

function drawVein(ctx, v) {
  const x0 = v.x * TS, y0 = v.y * TS;
  const gold = v.kind === 'gold';
  const R = (x, y, w, h, col) => { ctx.fillStyle = col; ctx.fillRect(x0 + x, y0 + y, w, h); };
  const rocks = [[2, 5, 6, 5], [8, 3, 6, 6], [5, 10, 7, 4], [11, 9, 4, 4]];
  for (const [x, y, w, h] of rocks) R(x - 1, y - 1, w + 2, h + 2, OUT);
  for (const [x, y, w, h] of rocks) {
    R(x, y, w, h, gold ? '#8a7a62' : '#5a5a62');
    R(x, y, w, 1, gold ? '#a8987a' : '#7a7a82');
    R(x, y + h - 1, w, 1, gold ? '#6a5a48' : '#42424a');
  }
  const specks = gold ? ['#f8d040', '#fff0a0', '#e8b030'] : ['#c8743a', '#8a9ab0', '#b86a3a'];
  for (let k = 0; k < 9; k++) {
    const [x, y, w, h] = rocks[k % 4];
    R(x + Math.floor(h2(v.id, k) * w), y + 1 + Math.floor(h2(k, v.id + 9) * (h - 1)), 1, 1, specks[k % 3]);
  }
}

// ------------------------------------------------------------ scène
export class RtsScene extends MiniScene {
  constructor(canvas, hooks) {
    super(canvas, hooks);
    this.kind = 'rts';
    this.showEnv = true;
    this.world = null;
    this.snapA = null;
    this.snapB = null;
  }

  title() { return 'CONQUÊTE DE L\'OUEST'; }
  help() {
    return this.touch ? [
      'BÂTIMENT EN BAS PUIS TOUCHE LA CARTE : CONSTRUIRE',
      'UNE MINE SE POSE SUR UN FILON D\'OR OU DE MINERAI',
      'UNITÉS : RECRUTER (IL FAUT L\'OR ET LES VIVRES)',
      'TOUCHE LA CARTE : TON ARMÉE Y VA - UN ENNEMI : ATTAQUE',
      'RASE LES FORTS ADVERSES : LE DERNIER DEBOUT GAGNE',
    ] : [
      'BÂTIMENT (1-6) PUIS CLIC SUR LA CARTE : CONSTRUIRE',
      'UNE MINE SE POSE SUR UN FILON D\'OR OU DE MINERAI',
      'UNITÉS (A Z E R) : RECRUTER AVEC L\'OR ET LES VIVRES',
      'CLIC : TON ARMÉE Y VA - CLIC SUR UN ENNEMI : ATTAQUE',
      'RASE LES FORTS ADVERSES : LE DERNIER DEBOUT GAGNE',
    ];
  }
  goText() { return 'À LA CONQUÊTE !'; }

  setup(seed) {
    this.world = rtsWorld(seed, this.n);
    this.map = renderMap(this.world);
    this.waterPx = [];
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (tileAt(this.world, c, r) === T.water) this.waterPx.push([c * TS, r * TS]);
    this.placing = null; // bâtiment en cours de placement
    this.hover = null; // bouton survolé
    this.fx = []; // poussière, explosions, bâtons de dynamite
    this.tracers = [];
    this.pendingShots = [];
    this.banner = null;
    this.alertAt = -1e9;
    this.lastHp = new Map();
    this.weeds = [0, 1].map((k) => ({ x: -20 - k * 200, y: 30 + hash(seed + k) * 120, sp: 10 + k * 4 }));
    this.snapA = this.snapB = null;
    if (!this.snapB) this.applySnap(this.emptySnap());
  }

  emptySnap() {
    return {
      t: 0, P: this.state.players.map(() => [RTS.start.gold, RTS.start.food, 1, 0, -1]),
      B: this.world.forts.map(([fx, fy], i) => [i + 1, i, 0, fx - 1, fy - 1, RTS.fortHp, RTS.fortHp, 0, '', 0]),
      U: [], S: [],
    };
  }

  applySync(st) { if (st.snap) { this.snapA = null; this.applySnap(st.snap); } }

  // ---------------------------------------------------------- instantanés de l'hôte
  applySnap(s) {
    const blds = s.B.map(([id, owner, k, x, y, hp, maxHp, build, queue, prog]) => ({
      id, owner, kind: KIND_IDS[k], x, y, w: k === 0 ? 3 : BUILDINGS[KIND_IDS[k]].w, hp, maxHp, build, queue, prog,
    }));
    const units = new Map(s.U.map(([id, owner, k, x, y, hp, face]) => [id, { id, owner, kind: UNIT_IDS[k], x: x / 2, y: y / 2, hp, face }]));
    const prev = this.snapB;
    this.snapA = prev;
    this.snapB = { t: s.t, P: s.P, blds, units, at: this.now };
    this.veinsTaken = new Set(blds.filter((b) => b.kind === 'mine').map((b) => this.world.veins.find((v) => v.x === b.x && v.y === b.y)?.id));
    if (!prev) return;
    // unités tombées : un peu de poussière et le chapeau qui roule
    for (const [id, u] of prev.units) {
      if (!units.has(id)) {
        this.fx.push({ k: 'dust', x: u.x, y: u.y, t: 0, life: 500 });
        this.fx.push({ k: 'hat', x: u.x, y: u.y - 8, vx: (Math.random() - 0.5) * 20, t: 0, life: 900, col: u.kind === 'rifle' ? '#3a2a1e' : '#6a4426' });
      }
    }
    // nouvelles recrues chez moi
    let fresh = 0;
    for (const [id, u] of units) if (!prev.units.has(id) && u.owner === this.me) { fresh++; this.fx.push({ k: 'dust', x: u.x, y: u.y, t: 0, life: 400 }); }
    if (fresh && this.playing) sfx('coin');
    // tirs de ces 250 ms, étalés dans le temps
    for (const sh of s.S || []) this.pendingShots.push({ at: this.now + Math.random() * RTS.snapMs, sh });
    // alerte : mes bâtiments perdent des PV
    let hurt = false;
    for (const b of blds) {
      const was = this.lastHp.get(b.id);
      if (b.owner === this.me && was != null && b.hp < was - 0.5) hurt = b.kind === 'fort' ? 'fort' : hurt || 'bld';
      this.lastHp.set(b.id, b.hp);
    }
    if (hurt && this.now - this.alertAt > 9000 && this.playing) {
      this.alertAt = this.now;
      this.say(hurt === 'fort' ? 'TON FORT EST ATTAQUÉ !' : 'ON ATTAQUE TES BÂTIMENTS !', '#f0705a');
      sfx('bad');
    }
  }

  onEvent(ev) {
    if (ev.type === 'snap') { this.applySnap(ev); return; }
    if (ev.type === 'razed') {
      this.boom(ev.x, ev.y, ev.kind === 'fort' ? 2 : 1);
      if (ev.owner === this.me && ev.kind !== 'fort') this.say(`TU AS PERDU : ${BUILDINGS[ev.kind]?.name.toUpperCase() || ''}`, '#f0705a');
      else if (ev.by === this.me && ev.kind !== 'fort') this.popup(ev.x, ev.y - 10, `+${40}`, '#f8d070');
    } else if (ev.type === 'fortDown') {
      if (ev.who === this.me) { this.say('TON FORT EST TOMBÉ…', '#f0705a', 5000); sfx('defeat'); } else {
        this.say(`LE FORT DE ${this.name(ev.who).toUpperCase()} EST TOMBÉ !`, this.color(ev.who), 4000);
        sfx(ev.by === this.me ? 'victory' : 'boom');
      }
    } else if (ev.type === 'order' && ev.by === this.me) {
      if (ev.order.mode === 'rally') this.rally = { x: ev.order.x, y: ev.order.y };
      sfx('click');
    }
  }

  say(text, col = '#f8d070', ms = 2600) { this.banner = { text, col, at: this.now, ms }; }

  boom(x, y, big = 1) {
    sfx('boom');
    this.shake = Math.max(this.shake, 3 * big);
    for (let k = 0; k < 10 * big; k++) {
      const a = Math.random() * Math.PI * 2, v = 10 + Math.random() * 30 * big;
      this.fx.push({ k: 'spark', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 10, t: 0, life: 400 + Math.random() * 400 });
    }
    this.fx.push({ k: 'blast', x, y, t: 0, life: 450, r: 8 * big });
    this.fx.push({ k: 'smoke', x, y, t: 0, life: 1600, r: 6 * big });
  }

  // ---------------------------------------------------------- état local
  get my() { return this.snapB?.P[this.me] || [0, 0, 0, 0, -1]; }
  get alive() { return !!this.my[2]; }
  myBlds(kind) { return this.snapB.blds.filter((b) => b.owner === this.me && (!kind || b.kind === kind)); }
  hasReady(kind) { return this.myBlds(kind).some((b) => b.build <= 0); }
  queued(u) {
    const k = String(UNIT_IDS.indexOf(u));
    return this.myBlds().reduce((s, b) => s + [...b.queue].filter((c) => c === k).length, 0);
  }

  // Disposition du panneau de commandes (y 184 à 216)
  buttons() {
    if (this._btns && this._btnsN === this.snapB?.P.length) return this._btns;
    const list = [];
    BUILD_IDS.forEach((k, i) => list.push({ type: 'build', id: k, x: 2 + i * 25, y: 186, w: 24, h: 28 }));
    UNIT_IDS.forEach((k, i) => list.push({ type: 'unit', id: k, x: 157 + i * 25, y: 186, w: 24, h: 28 }));
    list.push({ type: 'defend', x: 260, y: 186, w: 122, h: 13 });
    const foes = this.state.players.map((_, j) => j).filter((j) => j !== this.me);
    const bw = Math.floor(122 / foes.length);
    foes.forEach((j, k) => list.push({ type: 'attack', target: j, x: 260 + k * bw, y: 201, w: bw - (k < foes.length - 1 ? 1 : 0), h: 13 }));
    this._btnsN = this.snapB?.P.length;
    this._btns = list;
    return list;
  }

  btnAt(m) { return this.buttons().find((b) => m.x >= b.x && m.x < b.x + b.w && m.y >= b.y && m.y < b.y + b.h); }

  // ---------------------------------------------------------- commandes
  press(b) {
    if (!this.playing || !this.alive) return;
    if (b.type === 'build') {
      if (this.placing === b.id) { this.placing = null; return; }
      this.placing = b.id;
      sfx('click');
      if (this.my[0] < BUILDINGS[b.id].cost) this.say(`IL FAUT ${BUILDINGS[b.id].cost} OR`, '#f0705a', 1500);
    } else if (b.type === 'unit') this.train(b.id);
    else if (b.type === 'defend') this.order({ mode: 'defend' });
    else if (b.type === 'attack' && this.snapB.P[b.target]?.[2]) this.order({ mode: 'attack', target: b.target });
  }

  train(u) {
    const U = UNITS[u];
    if (!this.hasReady(U.from)) { sfx('dry'); this.say(U.from === 'stable' ? 'IL FAUT UNE ÉCURIE' : 'IL FAUT UNE ARMURERIE', '#f0705a', 1500); return; }
    if (this.my[0] < U.gold || this.my[1] < U.food) { sfx('dry'); this.say(`${U.name.toUpperCase()} : ${U.gold} OR ET ${U.food} VIVRES`, '#f0705a', 1500); return; }
    sfx('click');
    this.hooks.send({ kind: 'train', u });
  }

  order(o) { this.hooks.send({ kind: 'order', ...o }); }

  // case (coin haut-gauche) visée pour le bâtiment en cours ; une mine s'aimante sur le filon le plus proche
  spotFor(kind, m) {
    const B = BUILDINGS[kind];
    if (kind === 'mine') {
      let best = null, bd = 16;
      for (const v of this.world.veins) {
        const d = Math.hypot(v.x * TS + TS - m.x, v.y * TS + TS - m.y);
        if (d < bd) { bd = d; best = v; }
      }
      if (best) return { c: best.x, r: best.y };
    }
    return { c: clamp(Math.round(m.x / TS - B.w / 2), 0, COLS - B.w), r: clamp(Math.round(m.y / TS - B.w / 2), 0, ROWS - B.w) };
  }

  placeCheck(kind, c, r) {
    if (this.my[0] < BUILDINGS[kind].cost) return `IL FAUT ${BUILDINGS[kind].cost} OR`;
    const why = canBuild(this.world, this.snapB.blds, this.me, kind, c, r, this.veinsTaken);
    return why ? why.toUpperCase().replace(/\.$/, '') : null;
  }

  // ennemi (unité ou bâtiment) sous le pointeur
  foeAt(m) {
    for (const u of this.drawUnits || []) if (u.owner !== this.me && Math.hypot(u.x - m.x, u.y - 5 - m.y) < 7) return u.owner;
    for (const b of this.snapB.blds) {
      if (b.owner === this.me) continue;
      if (m.x >= b.x * TS - 2 && m.x < (b.x + b.w) * TS + 2 && m.y >= b.y * TS - (b.kind === 'fort' ? 8 : 6) && m.y < (b.y + b.w) * TS + 2) return b.owner;
    }
    return -1;
  }

  onFire(m) {
    if (!this.snapB) return;
    if (m.y >= MH) { const b = this.btnAt(m); if (b) this.press(b); return; }
    if (!this.playing || !this.alive) return;
    if (this.placing) {
      const k = this.placing;
      const { c, r } = this.spotFor(k, m);
      const why = this.placeCheck(k, c, r);
      if (why) { sfx('dry'); this.say(why, '#f0705a', 1800); return; }
      sfx('clank');
      this.hooks.send({ kind: 'build', b: k, x: c, y: r });
      this.fx.push({ k: 'dust', x: (c + BUILDINGS[k].w / 2) * TS, y: (r + BUILDINGS[k].w) * TS, t: 0, life: 500 });
      if (!this.keys.has('shift')) this.placing = null;
      return;
    }
    const foe = this.foeAt(m);
    if (foe >= 0) { this.order({ mode: 'attack', target: foe }); return; }
    const f = this.snapB.blds.find((b) => b.kind === 'fort' && b.owner === this.me);
    if (f && Math.hypot(bCenter(f).x - m.x, bCenter(f).y - m.y) < 14) { this.order({ mode: 'defend' }); return; }
    this.order({ mode: 'rally', x: rd(m.x), y: rd(m.y) });
    this.fx.push({ k: 'ping', x: m.x, y: m.y, t: 0, life: 600 });
  }

  onAlt() {
    if (this.placing) { this.placing = null; return; }
    if (this.playing && this.alive && this.mouse.y < MH) {
      this.order({ mode: 'rally', x: rd(this.mouse.x), y: rd(this.mouse.y) });
      this.fx.push({ k: 'ping', x: this.mouse.x, y: this.mouse.y, t: 0, life: 600 });
    }
  }

  onKey(k) {
    if (k === 'escape') { this.placing = null; return; }
    const bi = BUILD_KEYS.indexOf(k);
    if (bi >= 0) return this.press({ type: 'build', id: BUILD_IDS[bi] });
    const ui = UNIT_KEYS.findIndex((ks) => ks.includes(k));
    if (ui >= 0) return this.press({ type: 'unit', id: UNIT_IDS[ui] });
    if (k === 'd') this.press({ type: 'defend' });
  }

  hudStats() {
    const [gold, food, , army] = this.my;
    return [['OR', gold, 'yellow'], ['VIVRES', food, 'cream'], ['ARMÉE', `${army}/${RTS.popCap}`, 'salmon']];
  }

  // ---------------------------------------------------------- animation
  update(dt) {
    if (!this.world) return;
    const s = dt / 1000;
    for (const p of this.pendingShots) if (p.at <= this.now) this.fire(p.sh);
    this.pendingShots = this.pendingShots.filter((p) => p.at > this.now);
    for (const f of this.fx) {
      f.t += dt;
      if (f.vx != null) { f.x += f.vx * s; f.y += (f.vy || 0) * s; if (f.vy != null) f.vy += 60 * s; }
    }
    this.fx = this.fx.filter((f) => f.t < f.life);
    for (const tr of this.tracers) tr.t += dt;
    this.tracers = this.tracers.filter((tr) => tr.t < 120);
    for (const w of this.weeds) {
      w.x += w.sp * s;
      if (w.x > W + 30) { w.x = -30 - Math.random() * 300; w.y = 20 + Math.random() * 140; }
    }
  }

  fire([x, y, tx, ty, k]) {
    if (k === 3) {
      // un bâton de dynamite lancé en cloche
      this.fx.push({ k: 'stick', x0: x, y0: y - 6, x1: tx, y1: ty, t: 0, life: 420 });
      return;
    }
    this.tracers.push({ x, y: y - 5, tx: tx + (Math.random() - 0.5) * 4, ty: ty - 4 + (Math.random() - 0.5) * 4, t: 0, big: k === 4 });
    if (this.now - (this.lastShotSfx || 0) > 140) {
      this.lastShotSfx = this.now;
      sfx(k === 2 ? 'rifle' : k === 4 ? 'far' : 'revolver');
    }
  }

  // ---------------------------------------------------------- dessin
  render(out) {
    const now = this.now;
    if (!this.world || !this.snapB) { out.fillStyle = OUT; out.fillRect(0, 0, W, H); return; }
    const ctx = this.amb.begin(out);
    ctx.drawImage(this.map, 0, 0);
    this.drawWater(ctx, now);
    this.drawGround(ctx, now);
    // bâtiments et unités, du haut vers le bas de la carte
    const k = this.snapA ? clamp((now - this.snapB.at) / RTS.snapMs, 0, 1) : 1;
    const units = [];
    for (const u of this.snapB.units.values()) {
      const a = this.snapA?.units.get(u.id);
      const x = a ? a.x + (u.x - a.x) * k : u.x, y = a ? a.y + (u.y - a.y) * k : u.y;
      units.push({ ...u, x, y, moving: a ? Math.hypot(u.x - a.x, u.y - a.y) > 0.3 : false });
    }
    this.drawUnits = units;
    const items = [
      ...this.snapB.blds.map((b) => ({ y: (b.y + b.w) * TS, b })),
      ...units.map((u) => ({ y: u.y, u })),
    ].sort((a, b) => a.y - b.y);
    for (const it of items) if (it.b) this.drawBuilding(ctx, it.b, now); else this.drawUnit(ctx, it.u, now);
    for (const w of this.weeds) S.tumbleweed(ctx, rd(w.x), rd(w.y), now);
    this.drawFx(ctx, now);
    // ombres des vautours qui tournent
    ctx.fillStyle = 'rgba(26,15,10,0.25)';
    for (let v = 0; v < 2; v++) {
      const a = now / (5200 + v * 900) + v * 2.4, vx = 192 + Math.cos(a) * (90 + v * 40), vy = 92 + Math.sin(a) * (50 + v * 14);
      const fl = Math.floor(now / 260 + v) % 2;
      ctx.fillRect(rd(vx) - 3, rd(vy) - fl, 3, 1); ctx.fillRect(rd(vx) + 1, rd(vy) - fl, 3, 1); ctx.fillRect(rd(vx), rd(vy), 1, 1);
    }
    this.amb.end(out, now);
    for (const b of this.snapB.blds) if (b.kind === 'fort') { const c = bCenter(b); this.amb.glow(out, c.x, c.y - 10, 22); }
    this.amb.weather(out, now);
    // tirs (lumineux, par-dessus la teinte)
    for (const tr of this.tracers) {
      const a = 1 - tr.t / 120;
      out.fillStyle = tr.big ? `rgba(255,220,140,${a})` : `rgba(255,240,190,${a})`;
      const n = Math.max(1, Math.ceil(Math.hypot(tr.tx - tr.x, tr.ty - tr.y) / 2));
      for (let i = Math.floor(n * 0.3); i <= n; i++) out.fillRect(rd(tr.x + ((tr.tx - tr.x) * i) / n), rd(tr.y + ((tr.ty - tr.y) * i) / n), 1, 1);
      if (tr.t < 60) { out.fillStyle = '#fff8d0'; out.fillRect(rd(tr.x) - 1, rd(tr.y) - 1, 3, 3); }
    }
    this.drawBars(out);
    this.drawOrders(out, now);
    if (this.placing && this.playing && this.alive) this.drawPlacing(out, now);
    this.drawPanel(out, now);
    this.drawBanner(out, now);
  }

  drawWater(ctx, now) {
    ctx.fillStyle = 'rgba(200,230,255,0.55)';
    for (const [x, y] of this.waterPx) {
      const ph = (now / 900 + h2(x, y) * 8) % 8;
      const yy = y + ((h2(y, x) * 8) | 0);
      ctx.fillRect(x + (ph | 0), yy, 2, 1);
    }
  }

  // reflets d'or sur les filons libres
  drawGround(ctx, now) {
    for (const v of this.world.veins) {
      if (this.veinsTaken.has(v.id)) continue;
      const ph = (now / 700 + v.id * 1.7) % 5;
      if (ph < 1) {
        ctx.fillStyle = v.kind === 'gold' ? '#fff8c0' : '#e8c0a0';
        const x = v.x * TS + 4 + ((v.id * 5) % 8), y = v.y * TS + 5 + ((v.id * 3) % 6);
        ctx.fillRect(x, y - 1, 1, 3); ctx.fillRect(x - 1, y, 3, 1);
      }
    }
  }

  drawBuilding(ctx, b, now) {
    const col = this.color(b.owner);
    const spr = buildingSprite(b.kind, col);
    const cx = (b.x + b.w / 2) * TS, by = (b.y + b.w) * TS;
    // ombre
    ctx.fillStyle = 'rgba(26,15,10,0.22)';
    ctx.fillRect(b.x * TS + 2, by - 2, b.w * TS, 3);
    if (b.build > 0) {
      // chantier : charpente qui se monte
      const k = 1 - b.build / RTS.buildTime;
      const h = rd(spr.height * k);
      ctx.globalAlpha = 0.45;
      ctx.drawImage(spr, rd(cx - spr.ox), rd(by - spr.oy));
      ctx.globalAlpha = 1;
      ctx.drawImage(spr, 0, spr.height - h, spr.width, h, rd(cx - spr.ox), rd(by - spr.oy) + spr.height - h, spr.width, h);
      ctx.fillStyle = WOOD_L;
      const x0 = b.x * TS, w = b.w * TS;
      ctx.fillRect(x0, by - 12, 1, 12); ctx.fillRect(x0 + w - 1, by - 12, 1, 12); ctx.fillRect(x0, by - 12, w, 1);
      if (Math.floor(now / 300) % 2) { ctx.fillStyle = '#e8d8b8'; ctx.fillRect(rd(cx) + ((now / 150) % 6 | 0) - 3, by - 13, 1, 1); }
      return;
    }
    ctx.drawImage(spr, rd(cx - spr.ox), rd(by - spr.oy));
    // détails animés
    if (b.kind === 'fort') {
      // drapeau au couleur du joueur, fumée de la cheminée
      const fx = rd(cx) + 4, fy = by - 37;
      ctx.fillStyle = OUT; ctx.fillRect(fx - 1, fy - 1, 3, 14);
      ctx.fillStyle = '#d8c8a8'; ctx.fillRect(fx, fy, 1, 13);
      const wv = Math.floor(now / 220) % 3;
      ctx.fillStyle = OUT; ctx.fillRect(fx + 1, fy - 1, 9, 7);
      ctx.fillStyle = col;
      for (let i = 0; i < 8; i++) ctx.fillRect(fx + 1 + i, fy + ((i + wv) % 3 === 0 ? 1 : 0), 1, 5);
      ctx.fillStyle = S.shade(col, 0.3); ctx.fillRect(fx + 2, fy + 1, 2, 1);
      this.smoke(ctx, rd(cx) - 6, by - 26, now, b.id);
    } else if (b.kind === 'armory') this.smoke(ctx, rd(cx) + 4, by - 18, now, b.id);
    else if (b.kind === 'mine') {
      const v = this.world.veins.find((x) => x.x === b.x && x.y === b.y);
      ctx.fillStyle = v?.kind === 'gold' ? '#f8d040' : '#c8743a';
      ctx.fillRect(rd(cx) + 4, by - 6, 3, 1);
      if (Math.floor(now / 400 + b.id) % 4 === 0) { ctx.fillStyle = '#fff8c0'; ctx.fillRect(rd(cx) + 5, by - 7, 1, 1); }
    } else if (b.kind === 'ranch') {
      // deux vaches qui broutent dans l'enclos
      for (let k = 0; k < 2; k++) {
        const x = rd(cx) + 3 + ((Math.sin(now / 1700 + k * 3 + b.id) * 2) | 0) + k * 2, y = by - 10 + k * 4;
        ctx.fillStyle = OUT; ctx.fillRect(x - 1, y - 1, 6, 4);
        ctx.fillStyle = '#e8e0d0'; ctx.fillRect(x, y, 4, 2); ctx.fillStyle = '#3a2416'; ctx.fillRect(x + 1, y, 1, 1); ctx.fillRect(x + (k ? -1 : 4), y, 1, 1);
      }
    }
    // recrutement en cours : petite roue de progression
    if (b.queue.length && b.owner === this.me) {
      const k = b.prog / 100;
      const x = b.x * TS, y = by + 1;
      ctx.fillStyle = OUT; ctx.fillRect(x, y, b.w * TS, 2);
      ctx.fillStyle = '#f8d070'; ctx.fillRect(x, y, rd(b.w * TS * k), 2);
    }
  }

  smoke(ctx, x, y, now, seed) {
    for (let k = 0; k < 3; k++) {
      const ph = (now / 1400 + k / 3 + seed * 0.13) % 1;
      ctx.fillStyle = `rgba(220,214,200,${0.5 * (1 - ph)})`;
      const r = 1 + ph * 2.5;
      ctx.fillRect(rd(x + Math.sin(ph * 5 + seed) * 2 - r), rd(y - ph * 14 - r), rd(r * 2), rd(r * 2));
    }
  }

  drawUnit(ctx, u, now) {
    const f = u.moving ? Math.floor(now / 160 + u.id) % 2 : 0;
    const spr = unitSprite(u.kind, this.color(u.owner), f);
    ctx.fillStyle = 'rgba(26,15,10,0.25)';
    ctx.fillRect(rd(u.x) - 3, rd(u.y) - 1, u.kind === 'rider' ? 10 : 6, 2);
    const x = rd(u.x - (u.face < 0 ? spr.width - spr.ox : spr.ox)), y = rd(u.y - spr.oy);
    if (u.face < 0) {
      ctx.save();
      ctx.translate(x + spr.width, y);
      ctx.scale(-1, 1);
      ctx.drawImage(spr, 0, 0);
      ctx.restore();
    } else ctx.drawImage(spr, x, y);
  }

  drawFx(ctx, now) {
    for (const f of this.fx) {
      const k = f.t / f.life;
      if (f.k === 'dust') {
        ctx.fillStyle = `rgba(216,192,140,${0.7 * (1 - k)})`;
        for (let i = 0; i < 5; i++) ctx.fillRect(rd(f.x + Math.cos(i * 1.3) * k * 8), rd(f.y - 1 + Math.sin(i * 1.3) * k * 3), 2, 1);
      } else if (f.k === 'hat') {
        ctx.globalAlpha = 1 - k;
        ctx.fillStyle = f.col;
        ctx.fillRect(rd(f.x) - 2, rd(f.y + Math.min(8, k * 30)), 5, 1); ctx.fillRect(rd(f.x) - 1, rd(f.y + Math.min(8, k * 30)) - 1, 3, 1);
        ctx.globalAlpha = 1;
      } else if (f.k === 'spark') {
        ctx.fillStyle = k < 0.4 ? '#fff0a0' : '#f08030';
        ctx.fillRect(rd(f.x), rd(f.y), 1, 1);
      } else if (f.k === 'blast') {
        S.disc(ctx, rd(f.x), rd(f.y), Math.max(1, rd(f.r * (0.4 + k))), k < 0.3 ? '#fff0b0' : k < 0.6 ? '#f8a040' : '#a84a2a');
      } else if (f.k === 'smoke') {
        S.disc(ctx, rd(f.x + k * 6), rd(f.y - k * 16), Math.max(1, rd(f.r * (0.6 + k))), `rgba(90,80,70,${0.5 * (1 - k)})`);
      } else if (f.k === 'stick') {
        const x = f.x0 + (f.x1 - f.x0) * k, y = f.y0 + (f.y1 - f.y0) * k - Math.sin(k * Math.PI) * 14;
        ctx.fillStyle = '#d83020'; ctx.fillRect(rd(x), rd(y), 2, 1);
        ctx.fillStyle = '#f8d070'; ctx.fillRect(rd(x) + 2, rd(y) - 1, 1, 1);
        if (f.t + 20 >= f.life && !f.done) {
          f.done = true;
          this.fx.push({ k: 'blast', x: f.x1, y: f.y1, t: 0, life: 300, r: 5 }, { k: 'smoke', x: f.x1, y: f.y1, t: 0, life: 900, r: 3 });
          if (this.now - (this.lastBoom || 0) > 200) { this.lastBoom = this.now; sfx('boom'); }
        }
      } else if (f.k === 'ping') {
        ctx.fillStyle = this.color(this.me);
        const r = 2 + k * 6;
        for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; ctx.fillRect(rd(f.x + Math.cos(a) * r), rd(f.y + Math.sin(a) * r * 0.6), 1, 1); }
      }
    }
  }

  // barres de vie (bâtiments abîmés, unités blessées)
  drawBars(ctx) {
    for (const b of this.snapB.blds) {
      if (b.hp >= b.maxHp || b.build > 0) continue;
      const w = b.w * TS, x = b.x * TS, y = b.y * TS - (b.kind === 'fort' ? 16 : b.kind === 'tower' ? 18 : 12);
      ctx.fillStyle = OUT; ctx.fillRect(x - 1, y - 1, w + 2, 4);
      ctx.fillStyle = '#5a2a20'; ctx.fillRect(x, y, w, 2);
      ctx.fillStyle = b.hp / b.maxHp > 0.35 ? '#7ac860' : '#f0705a'; ctx.fillRect(x, y, Math.max(1, rd((w * b.hp) / b.maxHp)), 2);
    }
    for (const u of this.drawUnits) {
      const max = UNITS[u.kind].hp;
      if (u.hp >= max) continue;
      const x = rd(u.x) - 3, y = rd(u.y) - (u.kind === 'rider' ? 18 : 15);
      ctx.fillStyle = OUT; ctx.fillRect(x - 1, y - 1, 8, 3);
      ctx.fillStyle = this.color(u.owner); ctx.fillRect(x, y, Math.max(1, rd((6 * u.hp) / max)), 1);
    }
  }

  // repère de l'ordre en cours de mon armée
  drawOrders(ctx, now) {
    const o = this.my[4];
    const bob = Math.floor(now / 300) % 2;
    const col = this.color(this.me);
    if (o >= 0) {
      const f = this.snapB.blds.find((b) => b.kind === 'fort' && b.owner === o);
      if (f) {
        const c = bCenter(f);
        ctx.fillStyle = OUT; ctx.fillRect(rd(c.x) - 4, rd(c.y) - 30 - bob, 9, 9);
        swords(ctx, rd(c.x) - 2, rd(c.y) - 28 - bob, col);
      }
    } else if (o === -2 && this.rally) {
      const { x, y } = this.rally;
      ctx.fillStyle = OUT; ctx.fillRect(x - 1, y - 9, 3, 10); ctx.fillRect(x, y - 10, 6, 5);
      ctx.fillStyle = '#d8c8a8'; ctx.fillRect(x, y - 8, 1, 8);
      ctx.fillStyle = col; ctx.fillRect(x + 1, y - 9 + bob, 4, 3);
    }
  }

  drawPlacing(ctx, now) {
    const kind = this.placing;
    const B = BUILDINGS[kind];
    // territoire : contour pointillé autour du fort et des bâtiments
    const key = this.myBlds().map((b) => b.id).join(',');
    if (this.terrKey !== key) {
      this.terrKey = key;
      const fort = this.myBlds('fort')[0];
      const c = (this.terr ||= S.makeCanvas(W, MH));
      const x = c.getContext('2d');
      x.clearRect(0, 0, W, MH);
      if (fort) {
        const fc = bCenter(fort), G = 3, gw = Math.ceil(W / G), gh = Math.ceil(MH / G);
        const inside = new Uint8Array(gw * gh);
        for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) inside[j * gw + i] = inTerritory(fc, this.snapB.blds, this.me, i * G + 1, j * G + 1) ? 1 : 0;
        x.fillStyle = 'rgba(253,246,224,0.10)';
        for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) if (inside[j * gw + i]) x.fillRect(i * G, j * G, G, G);
        x.fillStyle = this.color(this.me);
        for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
          if (!inside[j * gw + i]) continue;
          const edge = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => !inside[(j + dy) * gw + i + dx]);
          if (edge && (i + j) % 2) x.fillRect(i * G + 1, j * G + 1, 1, 1);
        }
      }
    }
    ctx.drawImage(this.terr, 0, 0);
    // filons libres : anneau qui pulse quand on pose une mine
    if (kind === 'mine') {
      for (const v of this.world.veins) {
        if (this.veinsTaken.has(v.id)) continue;
        const r = 10 + (Math.floor(now / 200) % 3);
        ctx.fillStyle = v.kind === 'gold' ? '#f8d070' : '#e8a070';
        for (let i = 0; i < 20; i++) { const a = (i / 20) * Math.PI * 2; ctx.fillRect(rd(v.x * TS + TS + Math.cos(a) * r), rd(v.y * TS + TS + Math.sin(a) * r * 0.8), 1, 1); }
      }
    }
    if (!this.mouse.in || this.mouse.y >= MH) return;
    const { c, r } = this.spotFor(kind, this.mouse);
    const why = this.placeCheck(kind, c, r);
    const spr = buildingSprite(kind, this.color(this.me));
    ctx.globalAlpha = 0.6;
    ctx.drawImage(spr, rd((c + B.w / 2) * TS - spr.ox), rd((r + B.w) * TS - spr.oy));
    ctx.globalAlpha = 1;
    ctx.fillStyle = why ? 'rgba(240,112,90,0.45)' : 'rgba(122,200,96,0.45)';
    ctx.fillRect(c * TS, r * TS, B.w * TS, B.w * TS);
    if (why) this.info = why;
  }

  // panneau de commandes
  drawPanel(ctx, now) {
    const y0 = MH;
    ctx.fillStyle = '#3a2416'; ctx.fillRect(0, y0, W, H - y0);
    ctx.fillStyle = '#6a4426'; ctx.fillRect(0, y0, W, 1);
    ctx.fillStyle = OUT; ctx.fillRect(0, y0 + 1, W, 1);
    for (let x = 0; x < W; x += 31) { ctx.fillStyle = '#331f12'; ctx.fillRect(x, y0 + 2, 1, H - y0 - 2); }
    ctx.fillStyle = '#5e3a1e'; ctx.fillRect(154, y0 + 3, 1, 28); ctx.fillRect(257, y0 + 3, 1, 28);
    const [gold, food] = this.my;
    const can = this.playing && this.alive;
    const hov = this.mouse.in && this.mouse.y >= MH ? this.btnAt(this.mouse) : null;
    const o = this.my[4];
    let info = null;
    for (const b of this.buttons()) {
      let on = false, ok = can, label = null, sub = null, subCol = '#fdf6e0';
      if (b.type === 'build') {
        const B = BUILDINGS[b.id];
        on = this.placing === b.id;
        ok = can && gold >= B.cost;
        sub = String(B.cost); subCol = ok ? '#f8d070' : '#a87a6a';
        if (hov === b) info = `${B.name.toUpperCase()} - ${B.cost} OR : ${INFO[b.id]}`;
      } else if (b.type === 'unit') {
        const U = UNITS[b.id];
        const unlocked = this.hasReady(U.from);
        ok = can && unlocked && gold >= U.gold && food >= U.food;
        sub = String(U.gold); subCol = ok ? '#f8d070' : '#a87a6a';
        if (hov === b) info = unlocked ? `${U.name.toUpperCase()} - ${U.gold} OR ${U.food} VIVRES : ${INFO[b.id]}` : `${U.name.toUpperCase()} : IL FAUT ${U.from === 'stable' ? 'UNE ÉCURIE' : 'UNE ARMURERIE'}`;
        b.locked = !unlocked;
      } else if (b.type === 'defend') {
        on = o === -1; label = 'DÉFENDRE LE FORT';
        if (hov === b) info = 'TON ARMÉE RENTRE PROTÉGER LE FORT (D)';
      } else {
        const alive = !!this.snapB.P[b.target]?.[2];
        on = o === b.target; ok = can && alive;
        label = this.name(b.target).toUpperCase().slice(0, Math.max(3, Math.floor((b.w - 12) / 6)));
        if (hov === b) info = alive ? `ATTAQUER LE FORT DE ${this.name(b.target).toUpperCase()}` : `${this.name(b.target).toUpperCase()} EST ÉLIMINÉ`;
      }
      // cadre du bouton
      ctx.fillStyle = OUT; ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.fillStyle = on ? '#8a6a3a' : hov === b && ok ? '#6a4a2a' : '#4e3220';
      ctx.fillRect(b.x + 1, b.y + 1, b.w - 2, b.h - 2);
      ctx.fillStyle = on ? '#f8d070' : '#7a5434'; ctx.fillRect(b.x + 1, b.y + 1, b.w - 2, 1);
      if (on) { ctx.fillStyle = '#f8d070'; ctx.fillRect(b.x, b.y, b.w, 1); ctx.fillRect(b.x, b.y + b.h - 1, b.w, 1); ctx.fillRect(b.x, b.y, 1, b.h); ctx.fillRect(b.x + b.w - 1, b.y, 1, b.h); }
      if (!ok) ctx.globalAlpha = 0.45;
      if (b.type === 'build') {
        const spr = buildingSprite(b.id, this.color(this.me));
        ctx.save(); ctx.beginPath(); ctx.rect(b.x + 1, b.y + 1, b.w - 2, 18); ctx.clip();
        ctx.drawImage(spr, rd(b.x + b.w / 2 - spr.ox), rd(b.y + 19 - spr.oy + (b.id === 'tower' ? 4 : 2)));
        ctx.restore();
      } else if (b.type === 'unit') {
        const spr = unitSprite(b.id, this.color(this.me), 0);
        ctx.drawImage(spr, rd(b.x + b.w / 2 - spr.ox), rd(b.y + 17 - spr.oy));
      } else if (b.type === 'attack') {
        swords(ctx, b.x + 3, b.y + 4, this.color(b.target));
        canvasText(ctx, label, b.x + 10, b.y + 3, { align: 'left', color: this.color(b.target) });
      } else canvasText(ctx, label, b.x + b.w / 2, b.y + 3, { color: on ? '#fdf6e0' : '#e8d8b8' });
      if (sub) {
        ctx.drawImage(iconGold(), b.x + 2, b.y + 19);
        canvasText(ctx, sub, b.x + b.w - 2, b.y + 19, { align: 'right', color: subCol });
      }
      ctx.globalAlpha = 1;
      if (b.type === 'unit') {
        if (b.locked) { ctx.fillStyle = 'rgba(26,15,10,0.5)'; ctx.fillRect(b.x + 1, b.y + 1, b.w - 2, b.h - 2); this.lock(ctx, b.x + b.w - 7, b.y + 3); }
        const q = this.queued(b.id);
        if (q) {
          ctx.fillStyle = OUT; ctx.fillRect(b.x + b.w - 9, b.y + 1, 8, 9);
          ctx.fillStyle = '#a8382a'; ctx.fillRect(b.x + b.w - 8, b.y + 2, 6, 7);
          canvasText(ctx, String(q), b.x + b.w - 5, b.y + 2, { color: '#fdf6e0' });
        }
      }
      if (b.type === 'build' && b.id === 'mine' && ok) {
        const free = this.world.veins.some((v) => !this.veinsTaken.has(v.id) && !this.placeCheck('mine', v.x, v.y));
        if (free && Math.floor(now / 500) % 2) { ctx.fillStyle = '#fff8c0'; ctx.fillRect(b.x + b.w - 4, b.y + 3, 1, 3); ctx.fillRect(b.x + b.w - 5, b.y + 4, 3, 1); }
      }
    }
    // bande d'aide au-dessus du panneau
    if (this.placing && !info) info = this.info || `${BUILDINGS[this.placing].name.toUpperCase()} : ${INFO[this.placing]} - CLIC DROIT OU ÉCHAP : ANNULER`;
    this.info = null;
    if (!this.alive && this.t >= 0) info = 'TON FORT EST TOMBÉ : TU REGARDES LA FIN DE LA PARTIE';
    if (info) {
      ctx.fillStyle = 'rgba(26,15,10,0.78)'; ctx.fillRect(0, MH - 11, W, 11);
      canvasText(ctx, info, W / 2, MH - 9, { color: '#fdf6e0' });
    }
  }

  lock(ctx, x, y) {
    ctx.fillStyle = OUT; ctx.fillRect(x - 1, y - 1, 7, 8);
    ctx.fillStyle = '#c8b898'; ctx.fillRect(x, y + 2, 5, 4); ctx.fillRect(x + 1, y, 1, 2); ctx.fillRect(x + 3, y, 1, 2); ctx.fillRect(x + 1, y, 3, 1);
    ctx.fillStyle = '#3a2416'; ctx.fillRect(x + 2, y + 3, 1, 2);
  }

  drawBanner(ctx, now) {
    const b = this.banner;
    if (!b || now - b.at > b.ms || this.t < 0) return;
    const k = now - b.at;
    ctx.globalAlpha = k > b.ms - 400 ? (b.ms - k) / 400 : 1;
    ctx.fillStyle = 'rgba(26,15,10,0.7)'; ctx.fillRect(0, 8, W, 14);
    canvasText(ctx, b.text, W / 2, 11, { color: b.col });
    ctx.globalAlpha = 1;
  }
}
