// Mini-jeu « Conquête de l'Ouest » (scène) : la carte vue de haut (plus grande que l'écran : on la parcourt
// avec une caméra et une mini-carte), les forts, les bâtiments et les unités de chaque joueur.
// En haut : les ressources (or, vivres, population, PV du fort) avec leurs revenus. En bas : le panneau
// de commandes, qui suit la sélection : sans sélection, les bâtiments et les recrues ; avec des unités,
// leurs fiches et les ordres (charger, tenir, halte) ; avec un bâtiment, sa fiche, son amélioration,
// ses recrues et ses entraînements. À droite : les ordres à toute l'armée et la mini-carte.
// Souris : clic ou cadre pour choisir ses unités (double-clic : toutes celles de ce type à l'écran),
// clic droit pour les envoyer (sur un ennemi : l'attaquer ; Maj : en chargeant). Sans sélection,
// le clic droit commande toute l'armée. Au doigt : on touche ses unités, puis la carte.
// Caméra : flèches, bord de l'écran, molette, bouton du milieu, mini-carte ; au doigt, on glisse.
// Diplomatie : le bouton PACTES (en haut, ou P) ouvre une ligne par joueur : alliance (proposer, accepter,
// refuser, trahir), dons d'or et de vivres, messages tout faits. Pas de limite de temps : l'horloge compte.
// L'hôte simule la partie et envoie un instantané 2 fois par seconde : on lisse les déplacements entre deux.
import * as S from './sprites.js';
import { sfx } from './audio.js';
import { canvasText, canvasPos } from './scene.js';
import { MiniScene, pixelSprite } from './miniscene.js';
import { W, H, rng } from './worlds.js';
import { ENVS, Ambience } from './env.js';
import {
  RTS, T, TERRAIN, BIOMES, FORT, BUILDINGS, BUILD_IDS, UNITS, UNIT_IDS, KIND_IDS, VEINS, LV, TECH, RANKS,
  rtsWorld, canBuild, inTerritory, bCenter, tileAt, terrainPx, costOf, countOf, incomeOf, popOf, siteOf,
  maxHpOf, upNext, guardOf, uStats, qOf, DIPLO, WORDS, pairKey,
} from './rtsgame.js';

const TS = RTS.tile, MW = RTS.mapW, MH = RTS.mapH, COLS = RTS.cols, ROWS = RTS.rows;
// écran : barre des ressources (0-12), vue sur la carte (12-178), panneau de commandes (178-216)
const TOP = 12, PY = 178, VH = PY - TOP, PW = 257;
const MM = { x: 323, y: 180, w: 60, h: 34 }; // mini-carte
const OUT = S.OUT;
const rd = Math.round;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const fmt = (v) => (Math.round(v * 10) / 10).toString().replace('.', ',');
const hash = (n) => {
  let t = (n * 0x6d2b79f5) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const h2 = (x, y) => hash(x * 7919 + y * 104729 + 13);
const tw = (s) => String(s).length * 5.2; // largeur approximative d'un texte (police pixel 8 px)

const cache = new Map();
const cached = (key, make) => {
  let c = cache.get(key);
  if (!c) { c = make(); cache.set(key, c); }
  return c;
};

const PLURAL = { gunman: 'PISTOLEROS', rider: 'CAVALIERS', rifle: 'TIREURS', dyn: 'DYNAMITEURS' };
const RANK_NAME = RANKS.name.map((n) => n.toUpperCase());
// bonus propre à chaque entraînement, en plus des PV et des dégâts
const TECH_EXTRA = { gunman: null, rider: 'PLUS RAPIDES', rifle: '+6 DE PORTÉE', dyn: 'DYNAMITE +25 %' };
// Lignes d'aide des boutons, tirées des règles (rtsgame.js) pour rester justes
function infoLines(id) {
  const B = BUILDINGS[id], U = UNITS[id];
  if (id === 'mine') return [`FILON D'OR : +${fmt(VEINS.gold.rate)} OR/S`, `MINERAI : +${fmt(VEINS.ore.rate)} OR/S`, 'ÉTEND TON TERRITOIRE'];
  if (id === 'ranch') return [`+${fmt(B.food)} VIVRES/S`, `+${RTS.popRanch} PLACES DANS L'ARMÉE`];
  if (id === 'farm') return [`+${fmt(B.gold)} OR/S ET +${fmt(B.food)} VIVRES/S`];
  if (id === 'stable') return ['DÉBLOQUE LES CAVALIERS'];
  if (id === 'armory') return ['DÉBLOQUE LES TIREURS', 'ET LES DYNAMITEURS'];
  if (id === 'tower') return ['TIRE SUR LES ENNEMIS PROCHES', 'ÉTEND TON TERRITOIRE'];
  const role = { gunman: 'POLYVALENT', rider: 'RAPIDE ET SOLIDE', rifle: 'TIRE DE LOIN, FRAGILE', dyn: 'RASE LES BÂTIMENTS' }[id];
  return [role, U.strong ? `FORT CONTRE LES ${PLURAL[U.strong]}` : 'FAIBLE CONTRE LES UNITÉS'];
}
const BUILD_KEYS = [['1', '&'], ['2', 'é'], ['3', '"'], ['4', "'"], ['5', '('], ['6', '-']]; // chiffres, ou la rangée du haut en AZERTY
const UNIT_KEYS = [['a', 'q'], ['z', 'w'], ['e'], ['r']];
const ARROWS = { arrowleft: [-1, 0], arrowright: [1, 0], arrowup: [0, -1], arrowdown: [0, 1] };
const ZOOMS = [0.5, 0.75, 1, 1.5, 2]; // crans de zoom (0,5 : presque toute la carte)
const CMDS = { amove: ['CHARGER', 'c'], hold: ['TENIR', 's'], stop: ['HALTE', 'x'], clear: ['AUCUNE', 'échap'] };
const WEAK_COL = '#c080f0'; // malus du joueur trahi
const pct = (k) => Math.round(Math.abs(k - 1) * 100);

// ------------------------------------------------------------ sprites des bâtiments
// Vue de trois quarts : le bâtiment occupe sa base (w cases) et déborde vers le haut.
const WOOD = '#8a5a32', WOOD_D = '#5e3a1e', WOOD_L = '#a8743e';
// lv : niveau du bâtiment (1 à 3) ; chaque niveau a son allure. top : premier rang dessiné (sous l'origine), pour placer
// les barres de vie et les étiquettes au-dessus du sprite.
function buildingSprite(kind, col, lv = 1) {
  return cached(`b:${kind}:${col}:${lv}`, () => {
    const spr = drawBuildingSprite(kind, col, lv);
    const d = spr.getContext('2d').getImageData(0, 0, spr.width, spr.height).data;
    let y = 0;
    while (y < spr.height && !d.subarray(y * spr.width * 4, (y + 1) * spr.width * 4).some((v, i) => i % 4 === 3 && v)) y++;
    spr.top = y - spr.oy;
    return spr;
  });
}
// drapeaux du fort selon son niveau : [dx, haut du mât, longueur du mât, largeur du drapeau]
const FORT_FLAGS = { 1: [[4, -37, 13, 8]], 2: [[4, -38, 14, 8], [-11, -40, 7, 5], [12, -40, 7, 5]], 3: [[0, -48, 14, 9], [-11, -38, 6, 5], [12, -38, 6, 5]] };
const STONE = '#a09a90', STONE_L = '#c0bab0', STONE_D = '#7a746a';
function drawBuildingSprite(kind, col, lv) {
  if (kind === 'fort') {
    // niveau 1 : palissade en rondins ; 2 : blockhaus d'angle à toit, maison à étage, soubassement de pierre ;
    // 3 : fort de pierre crénelé, tours rondes, donjon et canon au-dessus de la porte
    return pixelSprite(38, 46, 19, 40, (R) => {
      const stone = lv >= 3;
      const WA = stone ? STONE : WOOD, WB = stone ? STONE_L : WOOD_L, WS = stone ? STONE_D : WOOD_D;
      R(-12, -22, 24, 20, stone ? '#b0a488' : '#9a8a5a'); // cour
      for (let x = -12; x < 12; x += 2) R(x, -24, 2, 5, x % 4 ? WA : WB); // mur nord
      for (let y = -22; y < -3; y += 2) { R(-13, y, 3, 2, WS); R(10, y, 3, 2, WS); } // murs est et ouest
      if (stone) for (let x = -12; x < 12; x += 3) R(x, -26, 2, 2, WA); // créneaux
      else { R(-12, -25, 24, 1, WOOD_L); for (let x = -12; x < 12; x += 2) R(x, -25, 1, 1, '#c8945a'); }
      if (lv === 1) {
        // bâtisse et réserve
        R(-8, -18, 9, 7, '#c8a878'); R(-9, -20, 11, 3, col); R(-9, -20, 11, 1, S.shade(col, 0.25));
        R(-6, -15, 2, 2, '#3a2416'); R(-2, -15, 2, 4, '#5e3a1e');
        R(4, -16, 5, 4, '#7a5a3a'); R(4, -17, 5, 1, '#a8743e');
        R(3, -10, 2, 2, '#6a4a2a'); R(6, -10, 2, 2, '#6a4a2a');
      } else if (lv === 2) {
        // maison à étage, baraquement, tonneaux et foin
        R(-9, -21, 11, 10, '#c8a878'); R(-10, -23, 13, 3, col); R(-10, -23, 13, 1, S.shade(col, 0.25));
        R(-7, -19, 2, 2, '#3a2416'); R(-3, -19, 2, 2, '#3a2416'); R(-7, -15, 2, 2, '#3a2416'); R(-3, -15, 2, 4, '#5e3a1e');
        R(-9, -16, 11, 1, '#a8743e'); // balcon
        R(4, -18, 6, 6, '#8a6a42'); R(3, -19, 8, 1, '#5e3a1e'); R(5, -16, 1, 1, '#f8d070'); R(8, -16, 1, 1, '#f8d070');
        R(3, -10, 2, 2, '#6a4a2a'); R(6, -10, 2, 2, '#6a4a2a'); R(-11, -9, 3, 2, '#d8c060');
      } else {
        // donjon de pierre, bandeau à ses couleurs
        R(-6, -32, 12, 22, '#b4aea2'); R(-6, -32, 12, 1, '#d0cabe');
        for (let x = -6; x < 6; x += 3) R(x, -34, 2, 2, '#b4aea2');
        for (let y = -30; y < -11; y += 3) for (let x = -5 + (Math.abs(y) % 2); x < 5; x += 4) R(x, y, 2, 1, '#9a9488');
        R(-2, -28, 4, 3, '#2a2420'); R(-1, -29, 2, 1, '#2a2420');
        R(-6, -21, 12, 2, col); R(-6, -21, 12, 1, S.shade(col, 0.25));
        R(-2, -16, 4, 6, '#3a2416'); R(-2, -16, 4, 1, STONE_D);
        R(8, -15, 2, 3, '#6a4a2a'); R(-10, -15, 2, 3, '#6a4a2a');
      }
      for (let x = -12; x < 12; x += 2) R(x, -4, 2, 5, x % 4 ? WA : WB); // mur sud
      if (stone) for (let x = -12; x < 12; x += 3) R(x, -6, 2, 2, WA);
      else for (let x = -12; x < 12; x += 2) R(x, -5, 1, 1, '#c8945a');
      if (lv === 2) { R(-12, -1, 24, 2, '#8a8a8a'); for (let x = -12; x < 12; x += 3) R(x, -1, 2, 1, '#a8a8a8'); }
      if (stone) for (let x = -11; x < 12; x += 4) R(x, -2, 2, 1, STONE_D);
      // tours d'angle
      for (const [tx, ty] of [[-14, -28], [9, -28], [-14, -8], [9, -8]]) {
        if (lv === 1) { R(tx, ty, 6, 7, WOOD_D); R(tx, ty, 6, 2, '#6a4426'); R(tx + 1, ty + 3, 4, 1, '#2a1a10'); } else if (lv === 2) {
          R(tx - 1, ty - 1, 8, 9, WOOD_D); R(tx, ty + 2, 6, 1, '#2a1a10'); R(tx, ty + 5, 2, 1, '#2a1a10'); R(tx + 4, ty + 5, 2, 1, '#2a1a10');
          R(tx - 2, ty - 3, 10, 2, col); R(tx - 1, ty - 4, 8, 1, S.shade(col, 0.2)); R(tx + 1, ty - 5, 4, 1, S.shade(col, -0.2));
        } else {
          R(tx - 1, ty - 2, 8, 10, STONE); R(tx - 1, ty - 2, 8, 1, STONE_L); R(tx - 1, ty - 4, 2, 2, STONE); R(tx + 2, ty - 4, 2, 2, STONE); R(tx + 5, ty - 4, 2, 2, STONE);
          R(tx + 2, ty + 1, 2, 3, '#2a2420'); R(tx - 1, ty + 5, 8, 1, STONE_D); R(tx - 1, ty + 7, 8, 1, col);
        }
      }
      // porte
      if (lv === 1) { R(-3, -3, 6, 4, '#3a2416'); R(-3, -3, 6, 1, WOOD_L); } else if (lv === 2) {
        R(-3, -4, 6, 5, '#3a2416'); R(-4, -6, 8, 2, WOOD_D); R(0, -4, 1, 5, '#5e3a1e'); R(-5, -6, 1, 2, '#f8d070'); R(4, -6, 1, 2, '#f8d070');
      } else {
        R(-4, -6, 8, 7, STONE); R(-3, -4, 6, 5, '#2a1a10'); R(-2, -5, 4, 1, '#2a1a10'); R(-3, -2, 6, 1, '#5e3a1e');
        R(-2, -9, 6, 2, '#3a3a42'); R(3, -10, 3, 1, '#3a3a42'); R(-3, -8, 2, 2, '#5a3a1a'); // canon
      }
    });
  }
  if (kind === 'mine') {
    // 1 : galerie étayée ; 2 : chevalement en bois et sa molette ; 3 : chevalement d'acier, machine à vapeur et tas d'or
    return pixelSprite(24, 34, 12, 31, (R) => {
      R(-8, -12, 16, 11, '#8a7258'); R(-7, -14, 14, 3, '#9a826a'); R(-5, -16, 10, 2, '#a8907a');
      R(-6, -6, 3, 2, '#6a5644'); R(4, -9, 3, 2, '#6a5644');
      if (lv >= 2) {
        const F = lv >= 3 ? '#6a6a74' : WOOD, FL = lv >= 3 ? '#8a8a94' : WOOD_L;
        R(-4, -24, 1, 12, F); R(3, -24, 1, 12, F); R(-4, -24, 8, 1, FL); R(-3, -19, 6, 1, F); // pieds et traverses
        for (let k = 0; k < 5; k++) R(-3 + k, -18 + k, 1, 1, F); // croisillon
        const wy = lv >= 3 ? -30 : -29, wr = lv >= 3 ? 3 : 2; // molette
        R(-wr, wy, wr * 2 + 1, 1, '#3a3a42'); R(-wr, wy + wr * 2, wr * 2 + 1, 1, '#3a3a42');
        R(-wr - 1, wy + 1, 1, wr * 2 - 1, '#3a3a42'); R(wr + 1, wy + 1, 1, wr * 2 - 1, '#3a3a42');
        R(0, wy + wr, 1, 1, '#c8c8d0'); R(0, wy + wr * 2, 1, 6 - wr, '#5a5a5a'); // câble
      }
      R(-3, -11, 6, 8, '#1a0f0a'); R(-4, -12, 8, 1, WOOD_L); R(-4, -11, 1, 8, WOOD); R(3, -11, 1, 8, WOOD);
      R(-1, -3, 2, 3, '#6a6a6a'); R(-2, -1, 4, 1, '#4a4a4a');
      R(3, -4, 5, 3, '#5a5a62'); R(3, -5, 5, 1, '#7a7a82'); R(4, -1, 1, 1, '#2a2a2a'); R(7, -1, 1, 1, '#2a2a2a');
      R(-7, -3, 1, 3, col); R(-7, -5, 3, 2, col);
      if (lv >= 2) { R(5, -10, 1, 2, '#f8d070'); R(-11, -4, 3, 3, '#5a5a62'); R(-11, -5, 3, 1, '#7a7a82'); R(-10, -6, 1, 1, '#c8743a'); } // lampe, second wagonnet
      if (lv >= 3) {
        // machine à vapeur en briques, sa cheminée ; tas d'or
        R(6, -15, 6, 10, '#9a4a32'); R(6, -15, 6, 1, '#b85a3a'); for (let y = -13; y < -5; y += 2) R(6 + (Math.abs(y) % 4 ? 0 : 1), y, 6, 1, '#7a3a26');
        R(8, -11, 2, 2, '#f8d070'); R(9, -25, 2, 10, '#5a2a1e'); R(8, -26, 4, 1, '#3a1a12');
        R(-11, -2, 5, 2, '#e8b030'); R(-10, -3, 3, 1, '#f8d070'); R(-9, -4, 1, 1, '#fff0a0');
      }
    });
  }
  if (kind === 'ranch') {
    // 1 : grange et enclos ; 2 : silo, grenier à foin ; 3 : éolienne (ses pales tournent) et abreuvoir
    return pixelSprite(26, 34, 13, 31, (R) => {
      if (lv >= 3) { R(7, -27, 1, 15, '#6a6a72'); R(10, -27, 1, 15, '#6a6a72'); for (let y = -24; y < -12; y += 4) R(7, y, 4, 1, '#8a8a92'); R(8, -29, 2, 2, '#4a4a52'); R(10, -29, 3, 1, col); }
      if (lv >= 2) {
        R(-13, -19, 4, 17, '#c8c0b0'); R(-13, -19, 1, 17, '#e0d8c8'); R(-13, -21, 4, 2, '#8a8a92'); R(-12, -22, 2, 1, '#8a8a92');
        for (let y = -16; y < -2; y += 4) R(-13, y, 4, 1, '#9a9282');
      }
      R(-8, -12, 9, 9, '#a8382a'); R(-8, -12, 9, 1, '#c84a3a');
      R(-9, -13, 11, 1, '#5a2018'); R(-8, -14, 9, 1, '#6a2a20'); R(-7, -15, 7, 1, '#6a2a20'); R(-5, -16, 3, 1, '#6a2a20');
      R(-4, -15, 1, 1, col); R(-6, -14, 5, 1, col);
      R(-6, -8, 5, 5, '#5a1a14'); R(-6, -8, 5, 1, '#e8d8b8'); R(-6, -4, 5, 1, '#e8d8b8');
      for (let k = 0; k < 4; k++) { R(-6 + k, -7 + k, 1, 1, '#e8d8b8'); R(-2 - k, -7 + k, 1, 1, '#e8d8b8'); }
      if (lv >= 2) { R(-5, -12, 3, 3, '#3a1410'); R(-5, -11, 3, 1, '#d8c060'); } else R(-5, -11, 3, 2, '#3a1410');
      R(2, -12, 7, 1, WOOD_L); R(2, -7, 7, 1, WOOD_L); R(2, -2, 7, 1, WOOD_L);
      R(-8, -2, 10, 1, WOOD_L); R(8, -12, 1, 11, WOOD); R(-8, -5, 1, 4, WOOD);
      R(1, -6, 1, 5, WOOD);
      if (lv >= 2) { R(9, -4, 3, 2, '#d8c060'); R(9, -4, 3, 1, '#e8d070'); }
      if (lv >= 3) { R(-12, -1, 4, 2, '#6a4426'); R(-11, -1, 2, 1, '#5a9ac8'); }
    });
  }
  if (kind === 'farm') {
    // 1 : rangs de maïs et de coton, remise ; 2 : plus de rangs, épouvantail, grange ; 3 : château d'eau et irrigation
    return pixelSprite(26, 34, 13, 31, (R) => {
      if (lv >= 3) {
        R(-12, -27, 7, 6, '#8a5a32'); R(-12, -27, 7, 1, '#a8743e'); R(-12, -25, 7, 1, '#5e3a1e'); R(-12, -23, 7, 1, '#5e3a1e');
        R(-11, -21, 1, 9, WOOD_D); R(-7, -21, 1, 9, WOOD_D); R(-10, -17, 3, 1, WOOD_D);
      }
      const x0 = lv >= 2 ? -11 : -8;
      for (let k = 0; k < 4; k++) {
        R(x0, -12 + k * 3, 1 - x0 + 1, 2, k % 2 ? '#c8a838' : '#6a8a32');
        for (let x = x0; x < 2; x += 2) R(x, -12 + k * 3, 1, 1, k % 2 ? '#f0d860' : '#e8e8d8');
        if (lv >= 3 && k < 3) R(x0, -10 + k * 3, 1 - x0 + 1, 1, '#5a9ac8');
      }
      if (lv >= 2) { R(-4, -17, 1, 7, WOOD); R(-6, -15, 5, 1, WOOD); R(-5, -18, 3, 1, '#5a3a22'); R(-4, -17, 1, 1, '#d8c060'); R(-5, -14, 3, 2, col); }
      if (lv >= 2) {
        R(3, -17, 8, 10, '#c8a878'); R(2, -19, 10, 3, col); R(2, -19, 10, 1, S.shade(col, 0.25)); R(6, -15, 2, 2, '#3a2416'); R(5, -10, 4, 3, '#5e3a1e');
        R(9, -6, 3, 2, '#d8c060');
      } else { R(3, -14, 6, 7, '#c8a878'); R(2, -16, 8, 3, col); R(2, -16, 8, 1, S.shade(col, 0.25)); R(5, -10, 2, 3, '#5e3a1e'); }
      R(3, -5, 6, 4, '#9a7a4a'); R(4, -4, 1, 2, '#f0d860'); R(6, -4, 1, 2, '#f0d860');
    });
  }
  if (kind === 'stable') {
    // 1 : écurie en planches ; 2 : grenier à foin, selle sur la barrière ; 3 : soubassement de pierre, lanterneau, girouette
    return pixelSprite(26, 34, 13, 31, (R) => {
      R(-8, -14, 16, 10, WOOD); R(-9, -17, 18, 4, WOOD_D); R(-9, -17, 18, 1, col);
      for (let x = -8; x < 8; x += 3) R(x, -14, 1, 10, WOOD_D);
      if (lv >= 2) { R(-4, -21, 8, 4, WOOD_D); R(-3, -22, 6, 1, WOOD_D); R(-2, -23, 4, 1, col); R(-1, -21, 2, 3, '#2a1a10'); R(-1, -19, 2, 1, '#d8c060'); }
      if (lv >= 3) { R(-1, -26, 3, 3, '#e8e0d0'); R(-1, -26, 3, 1, col); R(0, -29, 1, 3, '#3a2416'); R(0, -29, 3, 1, col); R(-8, -6, 16, 2, '#8a8a8a'); for (let x = -8; x < 8; x += 3) R(x, -6, 2, 1, '#a8a8a8'); }
      R(-6, -10, 4, 6, '#2a1a10'); R(2, -10, 4, 6, '#2a1a10');
      R(-5, -10, 3, 3, '#8a5a3a'); R(-5, -8, 2, 2, '#6a4026'); R(-4, -11, 1, 1, '#8a5a3a');
      if (lv >= 3) { R(3, -10, 3, 3, '#e8e0d0'); R(4, -8, 2, 2, '#c8c0b0'); R(4, -11, 1, 1, '#e8e0d0'); }
      R(-9, -4, 5, 3, '#d8c060'); R(-8, -5, 3, 1, '#e8d070');
      if (lv >= 2) { R(8, -7, 4, 1, WOOD_L); R(8, -3, 4, 1, WOOD_L); R(11, -8, 1, 7, WOOD); R(9, -9, 2, 2, '#7a3a1a'); }
      if (lv >= 3) { R(-12, -3, 3, 2, '#6a4426'); R(-11, -3, 1, 1, '#5a9ac8'); }
    });
  }
  if (kind === 'armory') {
    // 1 : bâtisse en pierre ; 2 : forge et sa cheminée, caisses de fusils ; 3 : parapet crénelé, drapeau, canon devant
    return pixelSprite(26, 34, 13, 31, (R) => {
      if (lv >= 3) { R(-8, -27, 1, 9, '#3a2416'); R(-7, -27, 5, 3, col); R(-7, -27, 5, 1, S.shade(col, 0.25)); }
      if (lv >= 2) { R(5, -25, 3, 11, '#8a3a2a'); R(5, -25, 3, 1, '#a84a32'); for (let y = -23; y < -15; y += 2) R(5, y, 3, 1, '#6a2a1e'); }
      R(-8, -14, 15, 11, '#8a8a8a'); R(-9, -16, 17, 3, '#4a4a52'); R(-9, -16, 17, 1, col);
      for (let y = -13; y < -3; y += 2) for (let x = -8 + ((y / 2) % 2 ? 1 : 0); x < 7; x += 3) R(x, y, 2, 1, '#9e9e9e');
      if (lv >= 3) for (let x = -9; x < 8; x += 3) R(x, -18, 2, 2, '#8a8a8a');
      R(-2, -9, 4, 6, '#3a2416');
      R(-7, -12, 4, 3, '#c8a878'); R(-7, -12, 1, 1, '#3a2416'); R(-5, -11, 1, 1, '#3a2416'); R(-4, -10, 1, 1, '#3a2416'); R(-6, -11, 1, 1, '#3a2416');
      R(3, -12, 3, 3, '#f8d070');
      R(4, -4, 3, 4, '#6a4426'); R(4, -3, 3, 1, '#3a2416'); R(-9, -3, 3, 3, '#6a4426'); R(-9, -2, 3, 1, '#d83020');
      if (lv >= 2) { R(8, -5, 4, 3, '#8a6a42'); R(8, -4, 4, 1, '#5e3a1e'); R(9, -7, 3, 2, '#8a6a42'); R(-12, -4, 3, 1, '#4a4a52'); R(-11, -3, 1, 3, '#4a4a52'); }
      if (lv >= 3) { R(-6, 0, 6, 2, '#3a3a42'); R(-1, -1, 3, 1, '#3a3a42'); R(-5, 1, 2, 2, '#5a3a1a'); R(1, 1, 2, 2, '#6a4426'); R(2, 0, 1, 1, '#d83020'); }
    });
  }
  // tour de guet. 1 : poteaux, plate-forme, toit, fanion ; 2 : plus haute, lanterne, échelle ; 3 : base de pierre, sommet crénelé, mitrailleuse
  return pixelSprite(18, 40, 9, 37, (R) => {
    const h = lv >= 2 ? 6 : 0;
    if (lv >= 3) {
      R(-5, -12, 10, 12, STONE); R(-5, -12, 10, 1, STONE_L); for (let y = -10; y < 0; y += 3) R(-4 + (Math.abs(y) % 2), y, 8, 1, STONE_D);
      R(-1, -5, 2, 5, '#2a1a10');
    } else { R(-4, -12, 1, 12, WOOD_D); R(3, -12, 1, 12, WOOD_D); R(-3, -12, 1, 11, WOOD); R(2, -12, 1, 11, WOOD); R(-3, -8, 6, 1, WOOD_D); R(-3, -4, 6, 1, WOOD_D); }
    if (h) { R(-4, -12 - h, 1, h, WOOD_D); R(3, -12 - h, 1, h, WOOD_D); R(-3, -15, 6, 1, WOOD_D); }
    if (lv === 2) for (let y = -16; y < 0; y += 2) R(-1, y, 2, 1, WOOD_L); // échelle
    const p = -14 - h;
    if (lv >= 3) {
      R(-6, p, 12, 3, STONE); R(-6, p, 12, 1, STONE_L);
      for (let x = -6; x < 6; x += 3) R(x, p - 2, 2, 2, STONE);
      R(1, p - 3, 5, 1, '#3a3a42'); R(1, p - 2, 1, 2, '#3a3a42'); // mitrailleuse
      R(-4, p - 10, 1, 8, '#3a2416'); R(-3, p - 10, 4, 3, col);
      return;
    }
    R(-5, p, 10, 3, WOOD_L); R(-5, p + 2, 10, 1, WOOD_D);
    R(-4, p - 4, 1, 4, WOOD_D); R(3, p - 4, 1, 4, WOOD_D);
    if (lv === 2) { R(-5, p - 2, 10, 1, WOOD); R(0, p - 3, 1, 2, '#f8d070'); R(-6, p - 6, 12, 2, col); R(-5, p - 7, 10, 1, S.shade(col, 0.2)); R(-3, p - 8, 6, 1, S.shade(col, -0.2)); }
    else { R(-6, p - 6, 12, 2, '#6a4426'); R(-5, p - 7, 10, 1, '#8a5a32'); }
    R(0, p - 10 - (lv === 2 ? 1 : 0), 1, 4, '#3a2416'); R(1, p - 10 - (lv === 2 ? 1 : 0), 3, 2, col);
  });
}

// ------------------------------------------------------------ sprites des unités
// Vus de trois quarts, pieds à l'origine ; f : image de la marche (0 ou 1)
const SKIN = '#e0a878';
// tech : entraînement du joueur pour ce type (0 à 2), qui change la tenue et l'équipement ;
// rank : galons (élite : étoile sur la poitrine ; légende : en plus, bande dorée au chapeau)
const NICKEL = '#d8dce4', GOLD = '#f8d070';
function unitSprite(kind, col, f, tech = 0, rank = 0) {
  const rk = rank >= 3 ? 2 : rank >= 2 ? 1 : 0;
  return cached(`u:${kind}:${col}:${f}:${tech}:${rk}`, () => {
    if (kind === 'rider') {
      // 0 : cheval bai ; 1 (selles de cuir) : couverture à ses couleurs, selle, bride ; 2 (mustangs) : mustang pie, crinière, poncho
      return pixelSprite(20, 20, 10, 17, (R) => {
        const leg = f ? 1 : 0;
        const coat = tech >= 2 ? '#e8e0d0' : '#7a4a2a', back = tech >= 2 ? '#f4ece0' : '#8a5a3a', hoof = tech >= 2 ? '#6a5a4a' : '#5a3420';
        R(-6, -6, 11, 4, coat); R(-5, -7, 9, 1, back); // cheval
        R(4, -9, 3, 4, coat); R(6, -10, 2, 2, tech >= 2 ? '#d8d0c0' : '#6a3a20'); R(4, -10, 1, 1, '#3a2416');
        if (tech >= 2) { R(-5, -5, 3, 2, '#8a5a3a'); R(1, -4, 3, 2, '#8a5a3a'); R(5, -7, 2, 1, '#8a5a3a'); R(3, -10, 1, 4, '#2a2420'); R(-7, -7, 1, 5, '#2a2420'); } // taches, crinière, queue
        else R(-7, -6, 1, 3, '#3a2416');
        R(-5, -2, 1, 2 + leg, hoof); R(-3, -2, 1, 3 - leg, hoof); R(1, -2, 1, 2 + leg, hoof); R(3, -2, 1, 3 - leg, hoof);
        if (tech >= 1) { R(-4, -7, 6, 3, S.shade(col, -0.3)); R(-4, -5, 6, 1, S.shade(col, 0.2)); R(6, -9, 1, 1, '#c8a878'); R(-1, -4, 1, 2, '#3a2416'); } // couverture, bride, étrier
        R(-2, -11, 4, 4, col); R(-2, -8, 1, 2, '#4a3a5a'); // cavalier
        if (tech >= 2) { R(-3, -11, 6, 3, '#c8783a'); R(-3, -10, 6, 1, '#e8d070'); R(-3, -9, 6, 1, '#a83a2a'); } // poncho rayé
        R(-1, -13, 3, 2, SKIN);
        const hat = tech >= 1 ? '#3a2a1e' : '#5a3a22';
        R(-3, -14, 6, 1, hat); R(-2, -16, 4, 2, hat);
        if (rk >= 2) R(-2, -15, 4, 1, GOLD);
        if (rk >= 1) R(0, -10, 1, 1, GOLD);
      });
    }
    return pixelSprite(14, 17, 7, 15, (R) => {
      // chapeau : feutre du pistolero, chapeau sombre du tireur, chapeau de toile (puis casque de mineur) du dynamiteur
      let hat = kind === 'rifle' ? '#3a2a1e' : kind === 'dyn' ? '#8a7a5a' : '#6a4426';
      if (kind === 'gunman') hat = tech >= 2 ? '#2a2420' : tech >= 1 ? '#b88a50' : hat; // feutre clair, puis noir
      const coat = kind === 'gunman' ? '#8a6a42' : kind === 'rifle' ? '#4a4a5a' : null;
      if (coat && tech >= 2) { R(-3, -7, 7, 6, coat); R(-3, -2, 1, 1, coat); R(3, -2, 1, 1, coat); } // cache-poussière
      R(-2, -3, 2, 3 - f, '#3a3a5a'); R(1, -3, 2, 2 + f, '#3a3a5a'); // jambes
      R(-2, -7, 5, 4, col); R(-2, -4, 5, 1, '#3a2416'); // chemise, ceinture
      R(-3, -7, 1, 3, coat && tech >= 2 ? coat : col); R(3, -7, 1, 3, coat && tech >= 2 ? coat : col);
      R(-1, -9, 3, 2, SKIN);
      if (kind === 'dyn' && tech >= 1) {
        R(-2, -11, 5, 2, '#c8a838'); R(-3, -10, 7, 1, '#a88a28'); R(0, -12, 1, 1, '#fff0a0'); // casque et sa lampe
      } else { R(-3, -10, 7, 1, hat); R(-2, -12, 5, 2, hat); }
      if (kind === 'gunman') {
        if (tech >= 1) { R(-2, -7, 1, 3, '#6a4426'); R(2, -7, 1, 3, '#6a4426'); R(-1, -7, 3, 1, '#c83a2a'); } // gilet, foulard
        if (tech >= 2) R(-2, -11, 5, 1, '#c8c8d0'); // bande d'argent
        R(4, -5, 2, 1, tech >= 1 ? NICKEL : '#4a4a4a');
        if (tech >= 2) R(-5, -5, 2, 1, NICKEL); // deux revolvers
      } else if (kind === 'rifle') {
        const gun = tech >= 1 ? '#3a3a42' : '#4a4a4a';
        R(3, -7, 1, 1, '#5a3a1a'); R(4, -8, 1, 1, '#5a3a1a'); R(5, -9, 1, 1, gun);
        if (tech >= 2) R(6, -10, 1, 1, gun); // canon plus long (Winchester)
        if (tech >= 1) { R(4, -10, 2, 1, NICKEL); R(5, -11, 1, 1, '#a8e0f8'); } // lunette de visée
        if (tech >= 2) { R(-2, -7, 1, 1, '#c8a020'); R(-1, -6, 1, 1, '#c8a020'); R(0, -5, 1, 1, '#c8a020'); R(1, -4, 1, 1, '#c8a020'); } // cartouchière
        else R(-3, -6, 5, 1, '#c8a878');
      } else {
        if (tech >= 1) { R(-5, -5, 2, 2, '#7a5a3a'); R(-5, -5, 2, 1, '#9a7a4a'); } // sacoche
        if (tech >= 2) { R(-1, -9, 3, 1, '#3a3a42'); R(0, -9, 1, 1, '#8ad0e8'); R(-1, -7, 1, 2, '#d83020'); R(1, -7, 1, 2, '#d83020'); } // lunettes, bâtons sur la poitrine
        if (tech >= 2) { R(4, -8, 1, 2, '#5ab870'); R(4, -9, 1, 1, '#c8f0d0'); } // fiole de nitroglycérine
        else { R(4, -8, 1, 3, '#d83020'); R(4, -9, 1, 1, '#f8d070'); }
      }
      if (rk >= 2) R(-2, -11, 5, 1, GOLD);
      if (rk >= 1) R(0, -6, 1, 1, GOLD);
    });
  });
}

// petites icônes (ressources, temps, chantier), 7 × 7 px avec leur contour
const ICONS = {
  // pépites d'or
  gold: (R) => { R(0, 3, 7, 3, '#c89020'); R(1, 2, 5, 1, '#e8b030'); R(1, 3, 3, 2, '#f8d070'); R(2, 1, 2, 1, '#f8d070'); R(2, 2, 1, 1, '#fff8c0'); R(5, 4, 1, 1, '#a87018'); },
  // jambon (vivres)
  food: (R) => { R(1, 1, 4, 4, '#b84a3a'); R(0, 2, 6, 2, '#b84a3a'); R(1, 1, 2, 1, '#d8705a'); R(1, 2, 1, 1, '#e88a70'); R(4, 4, 2, 2, '#f0e0c8'); R(6, 5, 1, 2, '#f0e0c8'); },
  // chapeau de cowboy (population)
  pop: (R) => { R(0, 4, 7, 1, '#6a4426'); R(1, 5, 5, 1, '#5e3a1e'); R(2, 1, 3, 3, '#8a5a32'); R(1, 2, 1, 2, '#8a5a32'); R(5, 2, 1, 2, '#8a5a32'); R(2, 3, 3, 1, '#c84a3a'); R(3, 1, 1, 1, '#a8743e'); },
  // cœur (PV du fort)
  heart: (R) => { R(0, 1, 3, 3, '#d83a2a'); R(4, 1, 3, 3, '#d83a2a'); R(1, 4, 5, 1, '#d83a2a'); R(2, 5, 3, 1, '#d83a2a'); R(3, 6, 1, 1, '#d83a2a'); R(1, 1, 1, 1, '#f8a090'); },
  // horloge (durée)
  clock: (R) => { R(1, 0, 5, 7, '#e8e0d0'); R(0, 1, 7, 5, '#e8e0d0'); R(3, 1, 1, 3, '#3a2416'); R(4, 3, 2, 1, '#3a2416'); },
  // marteau (chantier)
  hammer: (R) => { R(0, 0, 5, 2, '#9a9aa2'); R(0, 0, 5, 1, '#c8c8d0'); R(2, 2, 1, 5, '#a8743e'); },
  // flèche vers le haut (amélioration)
  up: (R) => { R(3, 0, 1, 1, '#c8f0a0'); R(2, 1, 3, 1, '#8ad870'); R(1, 2, 5, 1, '#8ad870'); R(0, 3, 7, 1, '#6ab850'); R(2, 4, 3, 3, '#6ab850'); R(3, 1, 1, 3, '#c8f0a0'); },
  // galon (expérience)
  star: (R) => { R(3, 0, 1, 2, '#f8d070'); R(0, 2, 7, 1, '#f8d070'); R(1, 3, 5, 1, '#f8d070'); R(2, 4, 3, 1, '#e8b030'); R(1, 5, 2, 2, '#e8b030'); R(4, 5, 2, 2, '#e8b030'); R(3, 2, 1, 2, '#fff8c0'); },
  // poignée de main (alliance)
  pact: (R) => { R(0, 2, 2, 3, '#8a5a32'); R(5, 2, 2, 3, '#5e3a1e'); R(2, 2, 3, 3, '#e0a878'); R(2, 1, 2, 1, '#e0a878'); R(3, 5, 2, 1, '#e0a878'); R(2, 3, 1, 1, '#b07848'); R(4, 2, 1, 1, '#f0c8a0'); },
  // cœur brisé (trahi : affaibli)
  weak: (R) => { R(0, 1, 3, 3, '#a050d0'); R(4, 1, 3, 3, '#a050d0'); R(1, 4, 5, 1, '#a050d0'); R(2, 5, 3, 1, '#a050d0'); R(3, 6, 1, 1, '#a050d0'); R(3, 1, 1, 2, '#1a0f0a'); R(2, 3, 2, 1, '#1a0f0a'); R(3, 4, 1, 1, '#1a0f0a'); R(1, 1, 1, 1, '#d8a0f8'); },
  // bulle (message)
  talk: (R) => { R(0, 0, 7, 5, '#fdf6e0'); R(1, 5, 2, 1, '#fdf6e0'); R(1, 6, 1, 1, '#fdf6e0'); R(1, 2, 1, 1, '#6a4426'); R(3, 2, 1, 1, '#6a4426'); R(5, 2, 1, 1, '#6a4426'); },
};
const icon = (name) => cached(`i:${name}`, () => pixelSprite(9, 9, 1, 1, ICONS[name]));
function swords(ctx, x, y, col) {
  ctx.fillStyle = col;
  for (let k = 0; k < 5; k++) { ctx.fillRect(x + k, y + k, 1, 1); ctx.fillRect(x + 4 - k, y + k, 1, 1); }
  ctx.fillRect(x, y + 3, 2, 1); ctx.fillRect(x + 3, y + 3, 2, 1);
}
// galons d'une unité : un trait doré par rang, au-dessus de la tête
function chevrons(ctx, x, y, rank) {
  if (!rank) return;
  const w = rank * 3 - 1;
  ctx.fillStyle = OUT; ctx.fillRect(x - 1, y - 1, w + 2, 4);
  ctx.fillStyle = rank >= 3 ? '#fff0a0' : '#f8d070';
  for (let k = 0; k < rank; k++) ctx.fillRect(x + k * 3, y, 2, 2);
}
// petits carrés de niveau (entraînement, bâtiment)
function pips(ctx, x, y, n, max, col = '#8ad870') {
  for (let k = 0; k < max; k++) {
    ctx.fillStyle = OUT; ctx.fillRect(x - 1, y - 1 + k * 4, 4, 4);
    ctx.fillStyle = k < n ? col : '#4e3220'; ctx.fillRect(x, y + k * 4, 2, 2);
  }
}

// ------------------------------------------------------------ décors : couleurs des terrains
const BASE_PAL = {
  [T.grass]: ['#8c9a4a', '#84924a', '#94a252', '#7c8a42'],
  [T.sand]: ['#d8b878', '#d0b072', '#e0c084', '#c8a86a'],
  [T.scrub]: ['#c4ac70', '#bca468', '#ccb478', '#b49c62'],
  [T.forest]: ['#5e7a36', '#587232', '#66823c', '#506a2e'],
  [T.hill]: ['#a0ac5a', '#98a454', '#a8b462', '#909c4e'],
  [T.snow]: ['#e8eef4', '#e0e8f0', '#f2f6fa', '#d6e0ea'],
  [T.swamp]: ['#56603a', '#505a36', '#5e6840', '#4a5432'],
  [T.salt]: ['#eee8dc', '#e8e2d4', '#f4eee4', '#e2dacc'],
};
const LOOK_BASE = {
  rock: ['#b0644a', '#a85c44', '#bc6e52', '#9a5440'], rim: '#d08a66', face: ['#9a5038', '#7a3e2e', '#8a4632', '#6a3426', '#5a2c20'],
  water: ['#3a7aa8', '#3672a0', '#4282b0'], ford: ['#6aa0b8', '#78acc0', '#609ab0'], bank: '#b8a070', ripple: 'rgba(200,230,255,0.55)', tree: 'oak',
};
const LOOKS = {
  prairie: {},
  canyon: {
    pal: {
      [T.grass]: ['#b8784a', '#b07046', '#c08250', '#a86a42'], [T.sand]: ['#dc9e5e', '#d49658', '#e4a868', '#cc8e52'],
      [T.scrub]: ['#c89060', '#c08858', '#d09868', '#b88052'], [T.hill]: ['#c88c5c', '#c08456', '#d09464', '#b87c50'],
    },
    rock: ['#a8482e', '#a04228', '#b45234', '#943c24'], rim: '#d8784e', face: ['#8a3a24', '#6e2c1a', '#7a3220', '#5e2416', '#4e1c10'], tree: 'juniper',
  },
  sierra: {
    pal: {
      [T.grass]: ['#6a8a4a', '#64824a', '#729252', '#5c7a42'], [T.forest]: ['#c8d4dc', '#c0ccd6', '#d0dae2', '#b8c4ce'],
      [T.hill]: ['#d8e2ea', '#d0dae4', '#e0e8ee', '#c8d4de'],
    },
    rock: ['#8a8a94', '#82828c', '#94949e', '#7a7a84'], rim: '#f0f4f8', face: ['#6a6a74', '#56565e', '#60606a', '#4a4a52', '#3e3e46'],
    water: ['#9ac4dc', '#92bcd6', '#a8cce2'], ford: ['#b8d4e4', '#c0dae8', '#b0cee0'], bank: '#e8eef4', ripple: 'rgba(255,255,255,0.6)', tree: 'pine',
  },
  bayou: {
    pal: {
      [T.grass]: ['#5e7a3a', '#587236', '#668240', '#526c32'], [T.forest]: ['#44602e', '#3e5a2a', '#4a6632', '#3a5428'],
      [T.hill]: ['#728e46', '#6c8842', '#7a964c', '#66803e'],
    },
    water: ['#4a6a52', '#46664e', '#527258'], ford: ['#6a8a6a', '#748e70', '#628262'], bank: '#6a6a3a', ripple: 'rgba(200,220,180,0.4)', tree: 'cypress',
  },
  salines: {
    pal: { [T.sand]: ['#dcc89a', '#d4c092', '#e2d0a4', '#ccb88a'], [T.hill]: ['#d8c49a', '#d0bc92', '#e0cca4', '#c8b48a'] },
    rock: ['#b89a78', '#b09272', '#c0a482', '#a88a6a'], rim: '#dcc4a0', face: ['#9a7a5a', '#86684a', '#907052', '#745a40', '#644c36'],
    water: ['#5ab0c4', '#56a8be', '#64b8cc'], ford: ['#8accd8', '#94d2dc', '#80c4d2'], bank: '#f0ece0', ripple: 'rgba(240,255,255,0.6)', tree: 'juniper',
  },
};
const lookOf = (biome) => {
  const L = LOOKS[biome] || {};
  return { ...LOOK_BASE, ...L, pal: { ...BASE_PAL, ...(L.pal || {}) } };
};

// ------------------------------------------------------------ la carte (rendue une fois)
let SCRUB = null;
const scrubSprites = () => [
  pixelSprite(9, 12, 4, 11, (R) => {
    R(-1, -10, 2, 10, '#4a7a3a'); R(-1, -10, 1, 9, '#6a9a4a');
    R(-3, -7, 1, 3, '#4a7a3a'); R(-3, -5, 2, 1, '#4a7a3a'); R(2, -8, 1, 3, '#4a7a3a'); R(1, -6, 2, 1, '#4a7a3a');
  }),
  pixelSprite(8, 7, 4, 6, (R) => { R(-2, -4, 4, 4, '#4a7a3a'); R(-1, -5, 2, 1, '#5a8a42'); R(-1, -4, 1, 3, '#6a9a4a'); R(0, -6, 1, 1, '#e86a8a'); }),
  pixelSprite(9, 6, 4, 5, (R) => { R(-3, -3, 6, 3, '#7a8a4a'); R(-2, -4, 4, 1, '#8a9a52'); R(-2, -3, 2, 1, '#9aa860'); R(1, -2, 1, 1, '#6a7a3a'); }),
];
// arbres des bois, selon le décor (deux variantes chacun)
const treeSprite = (kind, v) => cached(`t:${kind}:${v}`, () => {
  if (kind === 'pine') {
    return pixelSprite(11, 16, 5, 15, (R) => {
      R(0, -3, 1, 3, '#4a3020');
      for (let k = 0; k < 4; k++) { const w = 2 + k * 2; R(-w / 2, -14 + k * 3, w + 1, 3, k % 2 ? '#2e5a3a' : '#36664a'); }
      R(0, -14, 1, 1, '#f4f8fc'); R(-2, -11, 2, 1, '#f4f8fc'); R(1 + v, -8, 2, 1, '#f4f8fc'); R(-4, -5, 2, 1, '#e8eef4'); // neige
    });
  }
  if (kind === 'cypress') {
    return pixelSprite(9, 18, 4, 17, (R) => {
      R(-2, -3, 5, 3, '#5a4a36'); R(-1, -4, 3, 1, '#5a4a36'); // pied évasé dans l'eau
      R(-2, -16, 5, 12, '#4a6a32'); R(-1, -17, 3, 1, '#4a6a32'); R(-2, -16, 2, 10, '#5a7a3a');
      R(-3, -12, 1, 4, '#9aa08a'); R(2 + v, -10, 1, 5, '#9aa08a'); R(0, -7, 1, 3, '#9aa08a'); // mousse espagnole
    });
  }
  if (kind === 'juniper') {
    return pixelSprite(10, 10, 5, 9, (R) => {
      R(-1, -3, 1, 3, '#5a3a22'); R(0, -4 + v, 1, 2, '#5a3a22');
      R(-4, -8, 7, 5, '#5a7a5a'); R(-3, -9, 5, 1, '#6a8a66'); R(-3, -8, 3, 2, '#7a9a72'); R(1, -5, 2, 1, '#4a6a4a');
    });
  }
  // peuplier (prairie)
  return pixelSprite(11, 14, 5, 13, (R) => {
    R(0, -4, 1, 4, '#5a3a22');
    R(-4, -11, 9, 7, '#4e7a30'); R(-3, -12, 7, 1, '#5a8a38'); R(-3, -11, 4, 3, '#6a9a42'); R(-3 + v, -6, 7, 1, '#3e6a26');
  });
});
const reedSprite = () => cached('reed', () => pixelSprite(7, 8, 3, 7, (R) => {
  R(-2, -5, 1, 5, '#6a7a3a'); R(0, -6, 1, 6, '#7a8a42'); R(2, -4, 1, 4, '#6a7a3a'); R(0, -7, 1, 2, '#6a4a2a'); R(-2, -6, 1, 1, '#6a4a2a');
}));

function renderMap(world) {
  SCRUB ||= scrubSprites();
  const L = lookOf(world.biome);
  const c = S.makeCanvas(MW, MH);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(MW, MH);
  const d = img.data;
  const rgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const pal = {};
  for (const k of Object.keys(L.pal)) pal[k] = L.pal[k].map(rgb);
  const ROCK = L.rock.map(rgb), RIM = rgb(L.rim), FACE = L.face.map(rgb);
  const WATER = L.water.map(rgb), FORD = L.ford.map(rgb), STONE = rgb('#a8a090'), BANK = rgb(L.bank);
  const PLANK = [rgb('#9a6a3a'), rgb('#8a5a32'), rgb('#a8743e')], SEAM = rgb('#5e3a1e'), RAIL = rgb('#3a2416');
  const MUD = rgb(world.biome === 'bayou' ? '#3e5040' : '#4a5a4a'), CRACK = rgb('#d6ccba');
  const wet = (t) => t === T.water || t === T.ford || t === T.bridge;
  const base = pal[world.biome === 'salines' ? T.sand : T.grass] ? (world.biome === 'salines' ? T.sand : T.grass) : T.grass;
  const tileJ = (x, y) => {
    // bords irréguliers entre les terrains
    const jx = x + (h2(x >> 1, y >> 1) - 0.5) * 7, jy = y + (h2((y >> 1) + 91, (x >> 1) + 37) - 0.5) * 7;
    return tileAt(world, Math.floor(jx / TS), Math.floor(jy / TS));
  };
  // mesas et collines aux bords arrondis : indicateur interpolé entre les centres des cases, seuil bruité
  const smooth = (kind, noise) => (x, y) => {
    if (y < 0) y = 0;
    const is = (cc, rr) => (tileAt(world, cc, rr) === kind ? 1 : 0);
    const fx = x / TS - 0.5, fy = y / TS - 0.5, c0 = Math.floor(fx), r0 = Math.floor(fy), kx = fx - c0, ky = fy - r0;
    const a = is(c0, r0) + (is(c0 + 1, r0) - is(c0, r0)) * kx, b = is(c0, r0 + 1) + (is(c0 + 1, r0 + 1) - is(c0, r0 + 1)) * kx;
    return a + (b - a) * ky + (h2(x >> 1, (y >> 1) + 77) - 0.5) * noise > 0.5;
  };
  const isRock = smooth(T.rock, 0.3), isHill = smooth(T.hill, 0.2);
  for (let y = 0; y < MH; y++) {
    for (let x = 0; x < MW; x++) {
      const tc = Math.floor(x / TS), tr = Math.floor(y / TS);
      const tile = tileAt(world, tc, tr);
      const n = h2(x, y);
      let px;
      if (wet(tile)) {
        const edge = [[-2, 0], [2, 0], [0, -2], [0, 2]].some(([dx, dy]) => !wet(tileAt(world, Math.floor((x + dx) / TS), Math.floor((y + dy) / TS))));
        if (tile === T.bridge) {
          // pont de planches : les planches en travers du courant, garde-fous sur les bords
          const flowV = tileAt(world, tc, tr - 1) === T.water || tileAt(world, tc, tr + 1) === T.water;
          const along = flowV ? x : y, across = flowV ? y : x;
          const e0 = flowV ? !wet(tileAt(world, tc, Math.floor((y - 1) / TS))) || tileAt(world, tc, Math.floor((y - 1) / TS)) === T.water
            : !wet(tileAt(world, Math.floor((x - 1) / TS), tr)) || tileAt(world, Math.floor((x - 1) / TS), tr) === T.water;
          const e1 = flowV ? tileAt(world, tc, Math.floor((y + 1) / TS)) === T.water : tileAt(world, Math.floor((x + 1) / TS), tr) === T.water;
          if ((e0 || e1) && across % 1 === 0) px = RAIL;
          else px = along % 3 === 0 ? SEAM : PLANK[Math.floor(n * 3)];
        } else if (edge && n < 0.6) px = BANK;
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
        const hill = isHill(x, y);
        let t = tileJ(x, y);
        if (t === T.hill && !hill) t = tile === T.hill ? base : tile;
        if (hill) t = T.hill;
        if (!pal[t]) t = pal[tile] ? tile : base;
        px = pal[t][Math.floor(n * 4)];
        if (hill) {
          // colline : flanc sud à l'ombre, crête éclairée, quelques hachures
          if (!isHill(x, y + 3)) px = px.map((v) => v * 0.8);
          else if (!isHill(x, y - 2)) px = px.map((v) => Math.min(255, v * 1.1));
          else if ((x + y * 2) % 11 === 0 && n < 0.5) px = px.map((v) => v * 0.9);
        } else if (t === T.swamp && n < 0.22) px = MUD;
        else if (t === T.salt && h2(x >> 2, (y >> 2) + 31) < 0.5 && ((x + Math.floor(h2(y >> 3, 5) * 8)) % 13 === 0 || (y + Math.floor(h2(x >> 3, 9) * 8)) % 11 === 0)) px = CRACK;
        else if (t === T.snow && n > 0.985) px = [255, 255, 255];
        // ombre portée des mesas (vers le sud)
        if (isRock(x - 3, y - 1) || isRock(x - 2, y - 3)) px = px.map((v) => v * 0.7);
      }
      const i = (y * MW + x) * 4;
      d[i] = px[0]; d[i + 1] = px[1]; d[i + 2] = px[2]; d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  // touffes, cailloux, fleurs, cactus, buissons, roseaux et arbres
  for (let r = 0; r < ROWS; r++) for (let cc = 0; cc < COLS; cc++) {
    const tile = tileAt(world, cc, r), n = h2(cc + 500, r + 300), x0 = cc * TS, y0 = r * TS;
    const px = (x, y, col) => { ctx.fillStyle = col; ctx.fillRect(x0 + x, y0 + y, 1, 1); };
    if (tile === T.grass) {
      const tuft = world.biome === 'canyon' ? '#8a5a38' : '#6a7a38';
      if (n < 0.5) { const x = 1 + Math.floor(n * 11), y = 2 + Math.floor(n * 37) % 5; px(x, y, tuft); px(x + 1, y - 1, tuft); px(x + 2, y, tuft); }
      if (n > 0.9 && world.biome !== 'canyon') { px(3, 3, '#f0e070'); px(5, 6, '#e8e8f0'); }
    } else if (tile === T.sand || tile === T.salt) {
      if (n < 0.25) { px(2 + Math.floor(n * 16), 4, tile === T.salt ? '#d8ccb8' : '#a88a58'); px(3 + Math.floor(n * 16), 4, tile === T.salt ? '#e0d6c4' : '#b89a68'); }
      if (n > 0.97) { ctx.fillStyle = '#e8e0d0'; ctx.fillRect(x0 + 2, y0 + 3, 3, 2); ctx.fillRect(x0 + 1, y0 + 5, 1, 1); ctx.fillRect(x0 + 5, y0 + 5, 1, 1); px(3, 4, '#3a2a1e'); }
    } else if (tile === T.scrub) {
      // saguaro, petit cactus tonneau ou buisson d'armoise, posés un peu au hasard dans la case
      const spr = SCRUB[Math.floor(n * 7) % 3];
      if (n < 0.8) ctx.drawImage(spr, x0 + Math.floor(h2(cc, r + 7) * 4) - 1, y0 + Math.floor(h2(r, cc + 3) * 3) - spr.height + 7);
    } else if (tile === T.forest) {
      // un ou deux arbres par case
      for (let k = 0; k < (n < 0.55 ? 2 : 1); k++) {
        const spr = treeSprite(L.tree, (k + Math.floor(n * 5)) % 2);
        ctx.drawImage(spr, x0 + Math.floor(h2(cc + k * 13, r + 7) * 7) - spr.ox + 1, y0 + Math.floor(h2(r + k * 5, cc + 3) * 6) - spr.oy + 4 + k * 3);
      }
    } else if (tile === T.swamp) {
      if (n < 0.3) ctx.drawImage(reedSprite(), x0 + Math.floor(n * 16), y0 + 1 + Math.floor(h2(cc, r) * 4));
    } else if (tile === T.snow && n < 0.15) {
      px(2 + Math.floor(n * 30), 4, '#c8d4e4'); px(3 + Math.floor(n * 30), 4, '#c8d4e4');
    } else if (tile === T.rock && n < 0.4 && tileAt(world, cc, r + 1) === T.rock && tileAt(world, cc, r - 1) === T.rock) {
      px(2 + Math.floor(n * 12), 3, L.face[0]); px(3 + Math.floor(n * 12), 4, L.face[0]);
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
    R(x, y, w, h, gold ? '#a08a62' : '#5a5a66');
    R(x, y, w, 1, gold ? '#c0a87a' : '#7a7a88');
    R(x, y + h - 1, w, 1, gold ? '#76603e' : '#40404a');
  }
  // pépites (or) ou veines de rouille et de plomb (minerai)
  const specks = gold ? ['#f8d040', '#fff0a0', '#e8b030'] : ['#d07a3a', '#9aaac0', '#b05a2a'];
  for (let k = 0; k < (gold ? 12 : 10); k++) {
    const [x, y, w, h] = rocks[k % 4];
    const px = x + Math.floor(h2(v.id, k) * (w - 1)), py = y + 1 + Math.floor(h2(k, v.id + 9) * (h - 2));
    R(px, py, gold && k % 3 === 0 ? 2 : 1, 1, specks[k % 3]);
    if (gold && k % 4 === 0) R(px, py - 1, 1, 1, '#fff8d0');
  }
}

// mini-carte : terrain réduit (rendu une fois)
function renderMini(world) {
  const L = lookOf(world.biome);
  const c = S.makeCanvas(MM.w, MM.h);
  const ctx = c.getContext('2d');
  const COL = {
    [T.rock]: L.rock[3], [T.water]: L.water[0], [T.ford]: L.ford[0], [T.bridge]: '#8a5a32',
    [T.forest]: world.biome === 'sierra' ? '#3e6a4a' : S.shade(L.pal[T.forest][3], -0.15),
  };
  for (let y = 0; y < MM.h; y++) for (let x = 0; x < MM.w; x++) {
    const t = tileAt(world, Math.floor(((x + 0.5) * COLS) / MM.w), Math.floor(((y + 0.5) * ROWS) / MM.h));
    ctx.fillStyle = COL[t] || L.pal[t]?.[3] || L.pal[T.grass][3];
    ctx.fillRect(x, y, 1, 1);
  }
  return c;
}

// ambiance (env.js) qui va au décor de la carte, tirée de la graine
function envFor(seed, ids) {
  const R = rng((seed ^ 0x2545f491) >>> 0);
  let x = R() * ids.reduce((s, id) => s + ENVS[id].w, 0);
  for (const id of ids) if ((x -= ENVS[id].w) <= 0) return { id, ...ENVS[id] };
  return { id: ids[0], ...ENVS[ids[0]] };
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
    this.cam = { x: 0, y: 0 };
    this.sel = new Set();
    this.selB = null;
    this.zoom = 1;
    this.wheelAcc = 0;
    this.touches = new Map(); // doigts posés (pincer pour zoomer)
    const sig = { signal: this.abort.signal, passive: false };
    // molette : zoomer vers le pointeur (un cran à la fois) ; de côté (pavé tactile) : faire défiler
    this.cv.addEventListener('wheel', (e) => {
      if (!this.world) return;
      e.preventDefault();
      const k = e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? 100 : 1;
      const p = canvasPos(this.cv, e, W, H);
      if (e.shiftKey) { this.scroll((e.deltaY || e.deltaX) * k * 0.6 / this.zoom, 0); return; }
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) { this.scroll((e.deltaX * k * 0.6) / this.zoom, 0); return; }
      this.wheelAcc += e.deltaY * k * (e.ctrlKey ? 3 : 1);
      if (Math.abs(this.wheelAcc) >= 60) { this.zoomStep(this.wheelAcc < 0 ? 1 : -1, p); this.wheelAcc = 0; }
    }, sig);
    // deux doigts : pincer pour zoomer
    this.cv.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'touch') return;
      this.touches.set(e.pointerId, canvasPos(this.cv, e, W, H));
      if (this.touches.size === 2) { this.pinch = { d: this.pinchDist() }; this.pinchAt = this.now; }
    }, sig);
    this.cv.addEventListener('pointermove', (e) => {
      if (!this.touches.has(e.pointerId)) return;
      this.touches.set(e.pointerId, canvasPos(this.cv, e, W, H));
      if (!this.pinch || this.touches.size < 2) return;
      this.pinchAt = this.now;
      const d = this.pinchDist(), r = d / Math.max(1, this.pinch.d);
      if (r > 1.3 || r < 0.77) { this.zoomStep(r > 1 ? 1 : -1, this.pinchMid()); this.pinch.d = d; }
    }, sig);
    const lift = (e) => { this.touches.delete(e.pointerId); if (this.touches.size < 2) this.pinch = null; };
    window.addEventListener('pointerup', lift, sig);
    window.addEventListener('pointercancel', lift, sig);
    // bouton du milieu : on attrape la carte et on la fait glisser
    this.cv.addEventListener('mousedown', (e) => { if (e.button === 1) e.preventDefault(); }, sig);
    this.cv.addEventListener('pointerdown', (e) => {
      if (e.button !== 1 || !this.world) return;
      e.preventDefault();
      this.pan = { id: e.pointerId, ...canvasPos(this.cv, e, W, H) };
    }, sig);
    this.cv.addEventListener('pointermove', (e) => {
      if (!this.pan || e.pointerId !== this.pan.id) return;
      const p = canvasPos(this.cv, e, W, H);
      this.scroll((this.pan.x - p.x) / this.zoom, (this.pan.y - p.y) / this.zoom);
      this.pan.x = p.x; this.pan.y = p.y;
    }, sig);
    window.addEventListener('pointerup', (e) => { if (e.button === 1) this.pan = null; }, sig);
  }

  title() { return 'CONQUÊTE DE L\'OUEST'; }
  variantName() { return this.world ? BIOMES[this.world.biome].name : null; }
  help() {
    return this.touch ? [
      'TOUCHE TES UNITÉS (DEUX FOIS : TOUTES CELLES-LÀ) OU « TOUS »',
      'PUIS TOUCHE LA CARTE : ELLES Y VONT - UN ENNEMI : ATTAQUE',
      'BÂTIMENT EN BAS PUIS LA CARTE : CONSTRUIRE - UN CHANTIER À LA FOIS',
      'TOUCHE UN BÂTIMENT : L\'AMÉLIORER, ENTRAÎNER TES UNITÉS',
      'GLISSE : VOIR AILLEURS - PINCE : ZOOM - BOIS : À COUVERT',
      'PACTES (EN HAUT) : ALLIANCES, TRAHISONS, DONS, MESSAGES',
    ] : [
      'CLIC : CHOISIR (MAJ + GLISSER : CADRE) - CLIC DROIT : ENVOYER',
      'CLIC DROIT SUR UN ENNEMI : L\'ATTAQUER - C : CHARGER - S : TENIR',
      'BÂTIR (1-6), RECRUTER (A Z E R) - CLIC SUR UN BÂTIMENT : AMÉLIORER',
      'GLISSER : DÉPLACER LA CARTE - MOLETTE : ZOOM - T : TOUTE L\'ARMÉE',
      'P : PACTES - ALLIANCES, TRAHISONS (LA VICTIME FAIBLIT 1 MIN), DONS',
    ];
  }

  // pas de limite de temps : l'horloge du haut compte le temps de jeu, sans barre de progression
  clock() { return Math.max(0, this.t); }
  progress() { return null; }
  mood() {
    if (this.over || this.t < 0) return super.mood();
    const hot = this.alert && this.now - this.alert.at < 6000 ? 0.15 : 0;
    return { level: Math.min(0.9, 0.5 + 0.25 * Math.min(1, this.t / 600000) + hot) };
  }
  goText() { return 'À LA CONQUÊTE !'; }

  setup(seed) {
    this.world = rtsWorld(seed, this.n, this.state.variant);
    // le décor de la carte décide des ambiances possibles (pas de neige dans le bayou…)
    const bi = BIOMES[this.world.biome];
    if (bi.envs && !bi.envs.includes(this.env.id)) { this.env = envFor(seed, bi.envs); this.amb = new Ambience(this.env); }
    this.env = { ...this.env, name: `${bi.name} - ${this.env.name}` };
    this.look = lookOf(this.world.biome);
    this.map = renderMap(this.world);
    this.mini = renderMini(this.world);
    this.waterPx = [];
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (tileAt(this.world, c, r) === T.water) this.waterPx.push([c * TS, r * TS]);
    this.placing = null; // bâtiment en cours de placement
    this.armed = null; // 'amove' : le prochain clic sur la carte lance la charge
    this.box = null; // cadre de sélection en cours
    this.sel = new Set(); // unités choisies
    this.selB = null; // bâtiment choisi
    this.cmdFx = new Map(); // ordres donnés à mes unités choisies (pour tracer leur chemin)
    this.lastClick = null;
    this.tip = null; // bulle d'aide d'un bouton (au doigt, après un appui)
    this.fx = []; // poussière, explosions, bâtons de dynamite
    this.tracers = [];
    this.pendingShots = [];
    this.banner = null;
    this.alert = null; // dernier endroit attaqué chez moi
    this.alertAt = -1e9;
    this.lastHp = new Map();
    this.rally = null;
    this.weeds = [0, 1, 2].map((k) => ({ x: -20 - k * 260, y: 30 + hash(seed + k) * (MH - 60), sp: 10 + k * 4 }));
    this.pending = []; // constructions et recrues envoyées, pas encore dans un instantané
    this.pendingTrain = {};
    this.pendingUp = null;
    this.terrKey = null;
    this.diplo = false; // panneau des pactes ouvert
    this.sayTo = null; // menu des messages ouvert pour ce joueur
    this.pacts = new Set();
    this.offers = new Set();
    this.snapA = this.snapB = null;
    this.applySnap(this.emptySnap());
    const [fx, fy] = this.world.forts[this.me] || this.world.forts[0];
    this.centerOn(fx * TS, fy * TS);
  }

  emptySnap() {
    return {
      t: 0, P: this.state.players.map(() => [RTS.start.gold, RTS.start.food, 1, 0, -1, '0000', 0]),
      B: this.world.forts.map(([fx, fy], i) => [i + 1, i, 0, fx - 1, fy - 1, FORT.hp, FORT.hp, 0, '', 0, 1, 0]),
      U: [], S: [], A: [], O: [],
    };
  }

  applySync(st) { if (st.snap) { this.snapA = null; this.applySnap(st.snap); } }

  // ---------------------------------------------------------- caméra
  // taille de la vue sur la carte (px de la carte) : plus grande quand on dézoome
  get vw() { return W / this.zoom; }
  get vh() { return VH / this.zoom; }
  scroll(dx, dy) {
    this.cam.x = clamp(this.cam.x + dx, 0, Math.max(0, MW - this.vw));
    this.cam.y = clamp(this.cam.y + dy, 0, Math.max(0, MH - this.vh));
  }
  centerOn(x, y) { this.cam.x = 0; this.cam.y = 0; this.scroll(x - this.vw / 2, y - this.vh / 2); }
  get cx() { return rd(this.cam.x); }
  get cy() { return rd(this.cam.y); }
  // haut du panneau : celui des pactes (une ligne par joueur) déborde sur la vue au-delà de 3 lignes (5 et 6 joueurs),
  // à gauche seulement (PW : sa largeur), la mini-carte et les ordres restent en place
  get panelY() { return this.diplo ? PY - Math.max(0, this.others().length - 3) * 12 : PY; }
  inPanel(m) { return m.y >= PY || (m.y >= this.panelY && m.x < PW); }
  inView(m) { return m.y >= TOP && m.y < PY && m.x >= 0 && m.x < W && !this.inPanel(m); }
  toWorld(m) { return { x: m.x / this.zoom + this.cx, y: (m.y - TOP) / this.zoom + this.cy }; }
  toScreen(x, y) { return { x: (x - this.cx) * this.zoom, y: (y - this.cy) * this.zoom + TOP }; }
  inMini(m) { return m.x >= MM.x && m.x < MM.x + MM.w && m.y >= MM.y && m.y < MM.y + MM.h; }
  fromMini(m) { return { x: ((m.x - MM.x) / MM.w) * MW, y: ((m.y - MM.y) / MM.h) * MH }; }

  // zoom par crans, en gardant sous le pointeur (ou au centre) le même point de la carte
  zoomStep(dir, at = { x: W / 2, y: TOP + VH / 2 }) {
    const i = ZOOMS.indexOf(this.zoom), j = clamp(i + dir, 0, ZOOMS.length - 1);
    if (j === i) return;
    const p = { x: clamp(at.x, 0, W), y: clamp(at.y, TOP, PY) };
    const w = this.toWorld(p);
    this.zoom = ZOOMS[j];
    this.cam.x = w.x - p.x / this.zoom;
    this.cam.y = w.y - (p.y - TOP) / this.zoom;
    this.scroll(0, 0);
    this.zoomShown = this.now;
  }
  pinchDist() { const [a, b] = [...this.touches.values()]; return Math.hypot(a.x - b.x, a.y - b.y); }
  pinchMid() { const [a, b] = [...this.touches.values()]; return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; }
  get pinching() { return this.touches.size >= 2 || this.now - (this.pinchAt ?? -1e9) < 350; }

  // au doigt : glisser fait défiler la carte (pas depuis le panneau, ni en pinçant)
  onDrag(dx) {
    const d = this.drag;
    if (!d || d.y0 < TOP || this.inPanel({ x: d.x0, y: d.y0 })) return;
    const py = d.py ?? d.y0;
    d.py = this.mouse.y;
    if (this.touches.size >= 2) return;
    this.scroll(-dx / this.zoom, -(this.mouse.y - py) / this.zoom);
  }

  // ---------------------------------------------------------- instantanés de l'hôte
  applySnap(s) {
    const blds = s.B.map(([id, owner, k, x, y, hp, maxHp, build, queue, prog, lv = 1, up = 0]) => ({
      id, owner, kind: KIND_IDS[k], x, y, w: k === 0 ? 3 : BUILDINGS[KIND_IDS[k]].w, hp, maxHp, build, queue, prog, lv, up,
    }));
    const units = new Map(s.U.map(([id, owner, k, x, y, hp, face, rank = 0, xp = 0]) => [id, { id, owner, kind: UNIT_IDS[k], x: x / 2, y: y / 2, hp, face, rank, xp }]));
    const prev = this.snapB;
    this.snapA = prev;
    // écart entre deux instantanés (500 ms, plus à 5 et 6 joueurs) : on lisse les déplacements sur cette durée
    const span = prev && s.t > prev.t ? clamp(s.t - prev.t, 100, 2000) : prev?.span || RTS.snapMs;
    this.snapB = { t: s.t, P: s.P, blds, units, at: this.now, span };
    this.pending = (this.pending || []).filter((p) => this.now - p.at < 1500 && !blds.some((b) => b.x === p.x && b.y === p.y));
    this.pendingTrain = {};
    if (this.pendingUp && (this.now - this.pendingUp.at > 1500 || blds.some((b) => b.id === this.pendingUp.id && (b.up > 0 || b.lv > this.pendingUp.lv)))) this.pendingUp = null;
    this.veinsTaken = new Set(blds.filter((b) => b.kind === 'mine').map((b) => this.world.veins.find((v) => v.x === b.x && v.y === b.y)?.id));
    this.income = incomeOf(this.world, blds, this.me);
    this.pacts = new Set(s.A || []);
    this.offers = new Set(s.O || []);
    this.endS = s.E || 0; // secondes avant la fin des alliances (plus que des alliés en lice)
    if (this.sayTo != null && !this.state.players[this.sayTo]) this.sayTo = null;
    // la sélection ne garde que ce qui existe encore
    for (const id of this.sel) if (!units.has(id)) { this.sel.delete(id); this.cmdFx.delete(id); }
    if (this.selB != null && !blds.some((b) => b.id === this.selB)) this.selB = null;
    if (!prev) return;
    // unités tombées : un peu de poussière et le chapeau qui roule
    for (const [id, u] of prev.units) {
      if (!units.has(id)) {
        this.fx.push({ k: 'dust', x: u.x, y: u.y, t: 0, life: 500 });
        this.fx.push({ k: 'hat', x: u.x, y: u.y - 8, vx: (Math.random() - 0.5) * 20, t: 0, life: 900, col: u.kind === 'rifle' ? '#3a2a1e' : '#6a4426' });
      }
    }
    // nouvelles recrues chez moi ; galons gagnés
    let fresh = 0, promoted = false;
    for (const [id, u] of units) {
      const was = prev.units.get(id);
      if (!was && u.owner === this.me) { fresh++; this.fx.push({ k: 'dust', x: u.x, y: u.y, t: 0, life: 400 }); }
      if (was && u.rank > was.rank && u.owner === this.me) {
        promoted = true;
        if (this.seen(u.x, u.y, 0)) { const p = this.toScreen(u.x, u.y); this.popup(p.x, p.y - 12 - 8 * this.zoom, RANK_NAME[u.rank], '#f8d070'); }
        this.fx.push({ k: 'promo', x: u.x, y: u.y, t: 0, life: 700 });
      }
    }
    if (fresh && this.playing) sfx('coin');
    if (promoted && this.playing) sfx('power');
    // chantier ou amélioration terminés chez moi
    for (const b of blds) {
      const was = prev.blds.find((x) => x.id === b.id);
      if (b.owner !== this.me || !was || !this.playing) continue;
      const name = (b.kind === 'fort' ? 'TON FORT' : BUILDINGS[b.kind].name.toUpperCase());
      if (was.build > 0 && b.build <= 0) { sfx('ding'); this.say(`${name} : TERMINÉ !`, '#7ac860', 1800); }
      if (b.lv > was.lv) { sfx('power'); this.say(`${name} PASSE AU NIVEAU ${b.lv} !`, '#8ad870', 2200); }
    }
    // entraînement terminé
    const t0 = prev.P[this.me]?.[5] || '0000', t1 = s.P[this.me]?.[5] || '0000';
    UNIT_IDS.forEach((k, i) => {
      if (+t1[i] > +t0[i] && this.playing) { sfx('power'); this.say(`${UNITS[k].tech[+t1[i] - 1].toUpperCase()} : ${PLURAL[k]} PLUS FORTS !`, '#8ad870', 2400); }
    });
    // tirs depuis l'instantané précédent, étalés dans le temps
    for (const sh of s.S || []) this.pendingShots.push({ at: this.now + Math.random() * span, sh });
    // alerte : mes bâtiments perdent des PV
    let hurt = null;
    for (const b of blds) {
      const was = this.lastHp.get(b.id);
      if (b.owner === this.me && was != null && b.hp < was - 0.5 && b.maxHp <= (prev.blds.find((x) => x.id === b.id)?.maxHp ?? b.maxHp) && (!hurt || b.kind === 'fort')) hurt = b;
      this.lastHp.set(b.id, b.hp);
    }
    if (hurt) {
      this.alert = { ...bCenter(hurt), at: this.now };
      const c = bCenter(hurt);
      const seen = this.seen(c.x, c.y, 0);
      if (this.now - this.alertAt > 9000 && this.playing) {
        this.alertAt = this.now;
        const go = seen ? '' : this.touch ? ' (MINI-CARTE)' : ' (ESPACE)';
        this.say((hurt.kind === 'fort' ? 'TON FORT EST ATTAQUÉ !' : 'ON ATTAQUE TES BÂTIMENTS !') + go, '#f0705a');
        sfx('bad');
      }
    }
  }

  onEvent(ev) {
    if (ev.type === 'snap') { this.applySnap(ev); return; }
    if (ev.type === 'razed') {
      this.boom(ev.x, ev.y, ev.kind === 'fort' ? 2 : 1);
      if (ev.owner === this.me && ev.kind !== 'fort') this.say(`TU AS PERDU : ${BUILDINGS[ev.kind]?.name.toUpperCase() || ''}`, '#f0705a');
      else if (ev.by === this.me && ev.kind !== 'fort') { const p = this.toScreen(ev.x, ev.y); this.popup(p.x, p.y - 10, '+40', '#f8d070'); }
    } else if (ev.type === 'fortDown') {
      if (ev.who === this.me) { this.say('TON FORT EST TOMBÉ…', '#f0705a', 5000); sfx('defeat'); } else {
        this.say(`LE FORT DE ${this.name(ev.who).toUpperCase()} EST TOMBÉ !`, this.color(ev.who), 4000);
        sfx(ev.by === this.me ? 'victory' : 'boom');
      }
    } else if (ev.type === 'order' && ev.by === this.me) {
      if (ev.order.mode === 'rally') this.rally = { x: ev.order.x, y: ev.order.y };
      this.cmdFx.clear();
      sfx('click');
    } else if (ev.type === 'diplo') this.onDiplo(ev);
    else if (ev.type === 'gift') {
      const what = ev.gold ? `${ev.gold} OR` : `${ev.food} VIVRES`;
      if (ev.to === this.me) { this.say(`${this.name(ev.by).toUpperCase()} T'ENVOIE ${what} !`, this.color(ev.by)); sfx('coin'); } else if (ev.by === this.me) { this.say(`${what} ENVOYÉS À ${this.name(ev.to).toUpperCase()}`, '#e8d8b8', 1600); sfx('coin'); }
    } else if (ev.type === 'say' && (ev.to === this.me || ev.by === this.me)) {
      const w = WORDS[ev.w];
      if (!w) return;
      const text = w.id === 'join' && ev.on != null ? `ATTAQUONS ${ev.on === this.me ? 'TOI' : this.name(ev.on).toUpperCase()} ENSEMBLE !` : w.text;
      if (ev.by === this.me) { this.say(`À ${this.name(ev.to).toUpperCase()} : ${text}`, '#e8d8b8', 1600); return; }
      // au secours : son fort clignote sur la mini-carte, Espace y mène
      if (w.id === 'help' && ev.x != null) this.alert = { x: ev.x, y: ev.y, at: this.now };
      this.say(`${this.name(ev.by).toUpperCase()} : ${text}${w.id === 'help' && !this.touch ? ' (ESPACE)' : ''}`, this.color(ev.by), 3200);
      sfx('ding');
    }
  }

  // alliances proposées, conclues, refusées, trahies
  onDiplo(ev) {
    // plus que des alliés : un seul gagnera, leurs alliances tombent au bout du compte à rebours
    if (ev.op === 'lastStand') { this.say(`PLUS QUE DES ALLIÉS : UN SEUL GAGNERA ! FIN DES ALLIANCES DANS ${ev.ms / 1000} S`, '#f8d070', 4500); sfx('bad'); return; }
    if (ev.op === 'dissolve') { this.say('LES ALLIANCES SONT ROMPUES : CHACUN POUR SOI !', '#f0705a', 4000); sfx('boom'); return; }
    const by = this.name(ev.by).toUpperCase(), to = this.name(ev.to).toUpperCase();
    const mine = ev.by === this.me || ev.to === this.me;
    const other = ev.by === this.me ? ev.to : ev.by, them = this.name(other).toUpperCase();
    if (ev.op === 'offer') {
      if (ev.to === this.me) { this.say(`${by} TE PROPOSE UNE ALLIANCE${this.touch ? ' (PACTES)' : ' (P)'}`, this.color(ev.by), 4000); sfx('ding'); } else if (ev.by === this.me) this.say(`ALLIANCE PROPOSÉE À ${to}`, '#e8d8b8', 1600);
    } else if (ev.op === 'ally') {
      if (mine) { this.say(`ALLIANCE AVEC ${them} : VOUS NE VOUS TIREZ PLUS DESSUS`, '#8ad870', 3200); sfx('power'); } else this.say(`${by} ET ${to} S'ALLIENT`, '#e8d8b8', 2400);
    } else if (ev.op === 'refuse') {
      if (ev.to === this.me) { this.say(`${by} REFUSE TON ALLIANCE`, '#f0705a', 2200); sfx('dry'); }
    } else if (ev.op === 'betray') {
      if (ev.to === this.me) {
        this.say(`${by} T'A TRAHI ! TES TROUPES FAIBLISSENT 1 MIN`, WEAK_COL, 4500);
        sfx('bad');
        this.shake = Math.max(this.shake, 4);
      } else if (ev.by === this.me) { this.say(`TU AS TRAHI ${to} : SES TROUPES FAIBLISSENT 1 MIN, FRAPPE !`, WEAK_COL, 3200); sfx('power'); } else { this.say(`${by} A TRAHI ${to} !`, WEAK_COL, 3000); sfx('bad'); }
    }
  }

  say(text, col = '#f8d070', ms = 2600) { this.banner = { text, col, at: this.now, ms }; }

  boom(x, y, big = 1) {
    const seen = this.seen(x, y, 20);
    if (seen) { sfx('boom'); this.shake = Math.max(this.shake, 3 * big); }
    for (let k = 0; k < 10 * big; k++) {
      const a = Math.random() * Math.PI * 2, v = 10 + Math.random() * 30 * big;
      this.fx.push({ k: 'spark', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 10, t: 0, life: 400 + Math.random() * 400 });
    }
    this.fx.push({ k: 'blast', x, y, t: 0, life: 450, r: 8 * big });
    this.fx.push({ k: 'smoke', x, y, t: 0, life: 1600, r: 6 * big });
  }

  // ---------------------------------------------------------- état local
  get my() { return this.snapB?.P[this.me] || [0, 0, 0, 0, -1, '0000', 0]; }
  get alive() { return !!this.my[2]; }
  get can() { return this.playing && this.alive; }
  // diplomatie
  allied(a, b) { return a !== b && this.pacts.has(pairKey(a, b)); }
  isFoe(o) { return o !== this.me && !this.allied(this.me, o); }
  weakS(j) { return +(this.snapB?.P[j]?.[6] || 0); } // secondes de malus qui restent au joueur trahi
  inPlay(j) { return !!this.snapB?.P[j]?.[2] && !this.state.players[j]?.left; }
  // où j'en suis avec ce joueur : gone, ally, in (il me propose), out (je lui ai proposé), none
  dState(j) {
    if (!this.inPlay(j)) return 'gone';
    if (this.allied(this.me, j)) return 'ally';
    if (this.offers.has(`${j}>${this.me}`)) return 'in';
    if (this.offers.has(`${this.me}>${j}`)) return 'out';
    return 'none';
  }
  offersToMe() { return this.state.players.reduce((n, _, j) => n + (this.offers.has(`${j}>${this.me}`) ? 1 : 0), 0); }
  // une alliance demande au moins 3 joueurs en lice
  canPact() { return this.state.players.filter((_, j) => this.inPlay(j)).length >= 3; }
  // cette alliance allierait-elle tout le monde ? (interdit : il faut un ennemi commun, un seul gagnera)
  allyAll(j) {
    const alive = this.state.players.map((_, k) => k).filter((k) => this.inPlay(k)), extra = pairKey(this.me, j);
    return alive.every((a) => alive.every((b) => a === b || this.pacts.has(pairKey(a, b)) || pairKey(a, b) === extra));
  }
  techOf(owner, kind) { return +(this.snapB?.P[owner]?.[5]?.[UNIT_IDS.indexOf(kind)] || 0); }
  uMax(u) { return uStats(u.kind, this.techOf(u.owner, u.kind), u.rank).hp; }
  myBlds(kind) { return this.snapB.blds.filter((b) => b.owner === this.me && (!kind || b.kind === kind)); }
  myUnits() { return [...this.snapB.units.values()].filter((u) => u.owner === this.me); }
  hasReady(kind) { return this.myBlds(kind).some((b) => b.build <= 0); }
  queued(u, b = null) {
    const k = String(UNIT_IDS.indexOf(u));
    return (b ? [b] : this.myBlds()).reduce((s, x) => s + [...x.queue].filter((c) => c === k).length, 0) + (b ? 0 : this.pendingTrain[u] || 0);
  }
  queuedAll() { return UNIT_IDS.reduce((s, u) => s + this.queued(u), 0); }
  // entraînement en cours pour ce type d'unité : [bâtiment, progression 0-1] ou null
  researching(u) {
    const ch = String.fromCharCode(97 + UNIT_IDS.indexOf(u));
    const b = this.myBlds().find((x) => x.queue.includes(ch));
    return b ? [b, b.queue[0] === ch ? b.prog / 100 : 0] : null;
  }
  pop() { return popOf(this.snapB.blds, this.me); }
  site() {
    const s = siteOf(this.snapB.blds, this.me);
    if (s) return s;
    if (this.pendingUp) { const b = this.snapB.blds.find((x) => x.id === this.pendingUp.id); if (b) return { ...b, up: upNext(b)?.[1] || 1 }; }
    const p = this.pending[0];
    return p ? { kind: p.kind, build: BUILDINGS[p.kind].time, x: p.x, y: p.y, w: BUILDINGS[p.kind].w } : null;
  }
  // bâtiments et chantiers, y compris ceux envoyés mais pas encore confirmés
  allBlds() { return [...this.snapB.blds, ...this.pending.map((p) => ({ ...p, owner: this.me, w: BUILDINGS[p.kind].w, build: 1 }))]; }
  cost(kind) { return costOf(this.allBlds(), this.me, kind); }
  selBld() { return this.selB != null ? this.snapB.blds.find((b) => b.id === this.selB) || null : null; }
  selUnits() { return [...this.sel].map((id) => this.snapB.units.get(id)).filter(Boolean); }
  get mode() { return this.diplo ? 'diplo' : this.selB != null ? 'bld' : this.sel.size ? 'units' : 'none'; }

  // ---------------------------------------------------------- sélection
  select(ids, add = false) {
    if (!add) this.sel.clear();
    for (const id of ids) if (this.sel.size < RTS.maxSel) this.sel.add(id);
    this.selB = null;
    this.armed = null;
    if (ids.length) this.closeDiplo();
    if (ids.length) sfx('ui');
  }
  clearSel() { this.sel.clear(); this.selB = null; this.armed = null; this.closeDiplo(); }
  selectBld(b) { this.sel.clear(); this.selB = b.id; this.armed = null; this.placing = null; this.closeDiplo(); sfx('ui'); }
  // panneau des pactes : il remplace celui des commandes (la sélection reste)
  toggleDiplo() {
    this.diplo = !this.diplo;
    this.sayTo = null;
    if (this.diplo) this.placing = null;
    sfx('ui');
  }
  closeDiplo() { this.diplo = false; this.sayTo = null; }
  // mes unités de ce type à l'écran
  selectType(kind, add) { this.select(this.myUnits().filter((u) => u.kind === kind && this.seen(u.x, u.y, 0)).map((u) => u.id), add); }
  selectAll() {
    const all = this.myUnits();
    if (all.length && all.every((u) => this.sel.has(u.id))) { this.clearSel(); return; }
    this.select(all.map((u) => u.id));
    if (!all.length) this.say('TU N\'AS PAS ENCORE D\'UNITÉS', '#f8d070', 1500);
  }

  // unité sous le pointeur (coordonnées de la carte) ; own : true (à moi), false (ennemie), null (n'importe)
  unitAt(w, own) {
    let best = null, bd = 7 / Math.min(1, this.zoom); // au moins 7 px à l'écran
    for (const u of this.drawUnits || []) {
      if (own != null && (u.owner === this.me) !== own) continue;
      const d = Math.hypot(u.x - w.x, u.y - 5 - w.y);
      if (d < bd) { bd = d; best = u; }
    }
    return best;
  }
  bldAt(w) {
    return this.snapB.blds.find((b) => w.x >= b.x * TS - 2 && w.x < (b.x + b.w) * TS + 2 && w.y >= Math.min(b.y * TS - 4, this.bldTop(b) + 6) && w.y < (b.y + b.w) * TS + 2);
  }
  // haut du bâtiment dessiné (px de la carte), drapeaux du fort compris
  bldTop(b) {
    const lv = b.build > 0 ? 1 : b.lv || 1;
    const top = (b.y + b.w) * TS + buildingSprite(b.kind, this.color(b.owner), lv).top;
    return b.kind === 'fort' ? Math.min(top, (b.y + b.w) * TS + Math.min(...FORT_FLAGS[lv].map((f) => f[1]))) : top;
  }

  clickAt(w, add) {
    const u = this.unitAt(w, true);
    if (u) {
      const dbl = this.lastClick && this.now - this.lastClick.at < 380 && this.lastClick.kind === u.kind;
      this.lastClick = { at: this.now, kind: u.kind };
      if (dbl) this.selectType(u.kind, add);
      else if (add && this.sel.has(u.id)) this.sel.delete(u.id);
      else this.select([u.id], add);
      return;
    }
    this.lastClick = null;
    const b = this.bldAt(w);
    if (b) { this.selectBld(b); return; }
    if (!add) this.clearSel();
  }

  boxSelect(a, b, add) {
    const x0 = Math.min(a.x, b.x) - 2, x1 = Math.max(a.x, b.x) + 2, y0 = Math.min(a.y, b.y) - 2, y1 = Math.max(a.y, b.y) + 8;
    const ids = (this.drawUnits || []).filter((u) => u.owner === this.me && u.x >= x0 && u.x <= x1 && u.y >= y0 && u.y <= y1).map((u) => u.id);
    if (ids.length || !add) this.select(ids, add);
  }

  // au doigt : toucher ses unités les choisit, puis toucher la carte les y envoie
  tap(w) {
    const u = this.unitAt(w, true);
    if (u) {
      const dbl = this.lastClick && this.now - this.lastClick.at < 450 && this.lastClick.kind === u.kind;
      this.lastClick = { at: this.now, kind: u.kind };
      if (dbl) this.selectType(u.kind, false);
      else if (this.sel.size && !this.sel.has(u.id)) this.select([u.id], true);
      else if (!this.sel.has(u.id)) this.select([u.id]);
      return;
    }
    const b = this.bldAt(w);
    if (this.sel.size && !(b && b.owner === this.me && b.kind !== 'fort')) { this.orderAt(w, false); return; }
    if (b) { this.selectBld(b); return; }
    this.clearSel();
  }

  // ---------------------------------------------------------- commandes
  // Disposition du panneau de commandes (selon la sélection), recalculée seulement quand elle change
  buttons() {
    const mode = this.mode;
    const units = mode === 'units' ? this.selUnits() : [];
    const types = UNIT_IDS.filter((k) => units.some((u) => u.kind === k));
    const b = mode === 'bld' ? this.selBld() : null;
    const others = this.others();
    const dip = mode === 'diplo' ? others.map((j) => this.dState(j)).join() : '';
    const key = `${mode}:${this.selB}:${types.join()}:${units.length === 1}:${b?.owner}:${this.snapB?.P.length}:${dip}`;
    if (this._btnKey === key) return this._btns;
    const list = [];
    // à droite : les ordres à toute l'armée (ou à la sélection)
    list.push({ type: 'all', x: 259, y: PY + 2, w: 62, h: 11 });
    list.push({ type: 'defend', x: 259, y: PY + 14, w: 62, h: 11 });
    const foes = this.state.players.map((_, j) => j).filter((j) => j !== this.me);
    const bw = Math.floor(63 / foes.length);
    foes.forEach((j, k) => list.push({ type: 'attack', target: j, x: 259 + k * bw, y: PY + 26, w: bw - 1, h: 11 }));
    if (mode === 'none') {
      BUILD_IDS.forEach((k, i) => list.push({ type: 'build', id: k, x: 2 + i * 25, y: PY + 2, w: 24, h: 34 }));
      UNIT_IDS.forEach((k, i) => list.push({ type: 'unit', id: k, x: 156 + i * 25, y: PY + 2, w: 24, h: 34 }));
    } else if (mode === 'units') {
      if (units.length === 1) list.push({ type: 'card', id: types[0], single: true, x: 2, y: PY + 2, w: 143, h: 34 });
      else types.forEach((k, i) => list.push({ type: 'card', id: k, x: 2 + i * 36, y: PY + 2, w: 35, h: 34 }));
      Object.entries(CMDS).forEach(([id, [label]], i) => list.push({ type: 'cmd', id, label, x: 148 + (i % 2) * 54, y: PY + 2 + Math.floor(i / 2) * 18, w: 53, h: 16 }));
    } else if (mode === 'diplo') {
      // une ligne par joueur : nom et état (dessinés à part), alliance, dons, message
      others.forEach((j, k) => {
        const y = this.panelY + 2 + k * 12, st = this.dState(j);
        if (st === 'gone') return;
        if (st === 'in') {
          list.push({ type: 'pact', op: 'accept', to: j, x: 110, y, w: 23, h: 11 });
          list.push({ type: 'refuse', to: j, x: 134, y, w: 22, h: 11 });
        } else list.push({ type: 'pact', op: st === 'ally' ? 'betray' : 'offer', to: j, x: 110, y, w: 46, h: 11 });
        list.push({ type: 'gift', res: 'gold', to: j, x: 158, y, w: 30, h: 11 });
        list.push({ type: 'gift', res: 'food', to: j, x: 190, y, w: 30, h: 11 });
        list.push({ type: 'say', to: j, x: 222, y, w: 32, h: 11 });
      });
    } else if (b && b.owner === this.me) {
      list.push({ type: 'up', x: 96, y: PY + 2, w: 40, h: 34 });
      const from = UNIT_IDS.filter((k) => UNITS[k].from === b.kind);
      let x = 140;
      for (const k of from) { list.push({ type: 'unit', id: k, x, y: PY + 2, w: 24, h: 34 }); x += 25; }
      for (const k of from) { list.push({ type: 'tech', id: k, x, y: PY + 2, w: 24, h: 34 }); x += 25; }
    }
    this._btnKey = key;
    this._btns = list;
    return list;
  }

  btnAt(m) {
    const hit = (b) => b && m.x >= b.x && m.x < b.x + b.w && m.y >= b.y && m.y < b.y + b.h;
    if (m.y < TOP) return hit(this.topBtn) ? this.topBtn : null;
    return this.buttons().find(hit);
  }
  others() { return this.state.players.map((_, j) => j).filter((j) => j !== this.me); }

  // menu des messages tout faits, au-dessus du panneau
  sayItems() {
    if (this.sayTo == null) return [];
    const w = 118, x = 254 - w, y0 = this.panelY - 2 - WORDS.length * 10;
    return WORDS.map((wd, k) => ({ w: k, x, y: y0 + k * 10, bw: w, h: 10 }));
  }

  press(b) {
    if (this.touch) this.tip = { b, until: this.now + 2200 };
    if (b.type === 'diplo') { this.toggleDiplo(); return; }
    if (b.type === 'card') {
      // ne garder que ce type (Maj : le retirer)
      const ids = this.selUnits().filter((u) => (u.kind === b.id) !== this.keys.has('shift')).map((u) => u.id);
      if (!b.single) this.select(ids);
      else { const u = this.selUnits()[0]; if (u) this.centerOn(u.x, u.y); }
      return;
    }
    if (b.type === 'cmd' && b.id === 'clear') { this.clearSel(); return; }
    if (!this.can) return;
    if (b.type === 'build') {
      if (this.placing === b.id) { this.placing = null; return; }
      sfx('click');
      const why = this.buildBlock(b.id);
      if (why) { this.say(why, '#f0705a', 1800); return; }
      this.closeDiplo();
      this.placing = b.id;
      this.armed = null;
      return;
    }
    if (b.type === 'pact') { this.pact(b); return; }
    if (b.type === 'refuse') { this.hooks.send({ kind: 'diplo', op: 'refuse', to: b.to }); sfx('click'); return; }
    if (b.type === 'gift') { this.gift(b); return; }
    if (b.type === 'say') { this.sayTo = this.sayTo === b.to ? null : b.to; sfx('ui'); return; }
    this.placing = null; // tout autre bouton annule la construction en cours
    if (b.type === 'unit') this.train(b.id);
    else if (b.type === 'tech') this.research(b.id);
    else if (b.type === 'up') this.upgrade();
    else if (b.type === 'all') this.selectAll();
    else if (b.type === 'cmd') {
      if (b.id === 'amove') { this.armed = this.armed ? null : 'amove'; sfx('click'); } else this.command(b.id);
    } else if (b.type === 'defend') {
      if (this.sel.size) this.command('home'); else this.order({ mode: 'defend' });
    } else if (b.type === 'attack' && this.allied(this.me, b.target)) {
      sfx('dry');
      this.say(`ALLIÉ DE ${this.name(b.target).toUpperCase()} : ROMPS D'ABORD L'ALLIANCE (PACTES)`, '#f8d070', 2000);
    } else if (b.type === 'attack' && this.snapB.P[b.target]?.[2]) {
      if (this.sel.size) this.command('fort', null, b.target); else this.order({ mode: 'attack', target: b.target });
    }
  }

  // alliance : proposer, accepter, trahir (il faut appuyer deux fois pour trahir)
  pact(b) {
    const who = this.name(b.to).toUpperCase();
    if (b.op !== 'betray' && !this.canPact()) { sfx('dry'); this.say('VOUS N\'ÊTES PLUS QUE DEUX : UN SEUL FORT RESTERA DEBOUT', '#f0705a', 2200); return; }
    if (b.op === 'offer' && this.dState(b.to) === 'out') { sfx('dry'); this.say(`${who} N'A PAS ENCORE RÉPONDU`, '#f8d070', 1600); return; }
    if (b.op !== 'betray' && this.allyAll(b.to)) { sfx('dry'); this.say('VOUS SERIEZ TOUS ALLIÉS : IL FAUT UN ENNEMI COMMUN', '#f0705a', 2200); return; }
    if (b.op === 'betray' && !(this.betrayArm?.to === b.to && this.now - this.betrayArm.at < 2500)) {
      this.betrayArm = { to: b.to, at: this.now };
      sfx('click');
      this.say(`ENCORE UNE FOIS POUR TRAHIR ${who}`, WEAK_COL, 2500);
      return;
    }
    this.betrayArm = null;
    this.hooks.send({ kind: 'diplo', op: b.op, to: b.to });
    sfx(b.op === 'betray' ? 'clank' : 'click');
  }

  gift(b) {
    const gold = b.res === 'gold' ? DIPLO.gift.gold : 0, food = b.res === 'food' ? DIPLO.gift.food : 0;
    if (this.my[0] < gold || this.my[1] < food) { sfx('dry'); this.say(`IL TE FAUT ${gold ? `${gold} OR` : `${food} VIVRES`}`, '#f0705a', 1500); return; }
    this.hooks.send({ kind: 'gift', to: b.to, res: b.res });
  }

  sayWord(k) {
    const to = this.sayTo;
    this.sayTo = null;
    if (to == null || !this.can) return;
    this.hooks.send({ kind: 'say', to, w: k });
    sfx('click');
  }

  // ce qui empêche de lancer ce bâtiment, où qu'on le pose (ou null)
  buildBlock(kind) {
    const B = BUILDINGS[kind];
    if (countOf(this.allBlds(), this.me, kind) >= B.max) return `PAS PLUS DE ${B.max} : ${B.name.toUpperCase()}`;
    if (this.site()) return 'UN SEUL CHANTIER À LA FOIS';
    if (this.my[0] < this.cost(kind)) return `IL FAUT ${this.cost(kind)} OR`;
    return null;
  }

  train(u) {
    const U = UNITS[u];
    if (!this.hasReady(U.from)) { sfx('dry'); this.say(U.from === 'stable' ? 'IL FAUT UNE ÉCURIE' : 'IL FAUT UNE ARMURERIE', '#f0705a', 1500); return; }
    if (this.my[0] < U.gold || this.my[1] < U.food) { sfx('dry'); this.say(`${U.name.toUpperCase()} : ${U.gold} OR ET ${U.food} VIVRES`, '#f0705a', 1500); return; }
    if (this.my[3] + this.queuedAll() >= this.pop()) this.say('ARMÉE PLEINE : BÂTIS OU AMÉLIORE UN RANCH', '#f8d070', 1800);
    sfx('click');
    const b = this.selBld();
    this.hooks.send({ kind: 'train', u, bid: b && b.owner === this.me && b.kind === U.from ? b.id : undefined });
    this.pendingTrain[u] = (this.pendingTrain[u] || 0) + 1;
  }

  // ce qui empêche l'entraînement de ce type d'unité (ou null)
  techBlock(u) {
    const U = UNITS[u], lv = this.techOf(this.me, u);
    if (lv >= TECH.max) return 'ENTRAÎNEMENT AU MAXIMUM';
    if (this.researching(u)) return 'DÉJÀ EN COURS';
    const where = U.from === 'fort' ? 'TON FORT' : U.from === 'stable' ? "L'ÉCURIE" : "L'ARMURERIE";
    if (!this.myBlds(U.from).some((b) => b.build <= 0 && b.lv >= lv + 1)) return `AMÉLIORE ${where} AU NIVEAU ${lv + 1}`;
    const [g, f] = TECH.cost[lv];
    if (this.my[0] < g) return `IL MANQUE ${g - this.my[0]} OR`;
    if (this.my[1] < f) return `IL MANQUE ${f - this.my[1]} VIVRES`;
    return null;
  }

  research(u) {
    const why = this.techBlock(u);
    if (why) { sfx('dry'); this.say(why, '#f0705a', 1600); return; }
    sfx('clank');
    const b = this.selBld();
    this.hooks.send({ kind: 'research', u, bid: b && b.owner === this.me ? b.id : undefined });
  }

  upBlock(b) {
    if (!b) return 'CHOISIS UN BÂTIMENT';
    const nx = upNext(b);
    if (!nx) return 'NIVEAU MAXIMAL';
    if (b.build > 0) return 'LE CHANTIER N\'EST PAS FINI';
    if (b.up > 0) return 'AMÉLIORATION EN COURS';
    if (this.site()) return 'UN SEUL CHANTIER À LA FOIS';
    if (this.my[0] < nx[0]) return `IL MANQUE ${nx[0] - this.my[0]} OR`;
    return null;
  }

  upgrade() {
    const b = this.selBld();
    if (!b || b.owner !== this.me) return;
    const why = this.upBlock(b);
    if (why) { sfx('dry'); this.say(why, '#f0705a', 1600); return; }
    sfx('clank');
    this.hooks.send({ kind: 'upgrade', bid: b.id });
    this.pendingUp = { id: b.id, lv: b.lv, at: this.now };
  }

  order(o) { this.hooks.send({ kind: 'order', ...o }); }

  // ordre à la sélection ; w : point visé (carte), target : unité, bâtiment ou joueur visé
  command(mode, w = null, target) {
    const ids = this.selUnits().map((u) => u.id);
    if (!ids.length || !this.can) return;
    this.hooks.send({ kind: 'cmd', ids, mode, x: w ? rd(w.x) : undefined, y: w ? rd(w.y) : undefined, target });
    sfx('click');
    if (w) this.fx.push({ k: 'ping', x: w.x, y: w.y, t: 0, life: 600, col: mode === 'move' ? '#9ae080' : '#f0705a' });
    for (const id of ids) {
      if (mode === 'move' || mode === 'amove') this.cmdFx.set(id, { mode, x: w.x, y: w.y });
      else if (mode === 'attack') this.cmdFx.set(id, { mode, tid: target });
      else this.cmdFx.delete(id);
    }
    if (mode === 'hold') this.say('ILS TIENNENT LA POSITION', '#e8d8b8', 1200);
  }

  // clic droit (ou toucher la carte avec une sélection) : envoyer les unités choisies, sinon toute l'armée
  orderAt(w, amove, fromMini = false) {
    // les unités et bâtiments des alliés ne sont pas des cibles : on y va, simplement
    let fu = !fromMini && this.unitAt(w, false);
    if (fu && !this.isFoe(fu.owner)) fu = null;
    const fb = !fromMini && !fu && this.bldAt(w);
    const foeB = fb && this.isFoe(fb.owner);
    if (!this.sel.size) {
      if (fu || foeB) { this.order({ mode: 'attack', target: (fu || fb).owner }); return; }
      if (fb && fb.kind === 'fort' && fb.owner === this.me) { this.order({ mode: 'defend' }); return; }
      this.rallyAt(w);
      return;
    }
    if (fu) { this.command('attack', w, fu.id); return; }
    if (foeB) { this.command('attack', w, fb.id); return; }
    if (fb && fb.kind === 'fort' && fb.owner === this.me) { this.command('home'); return; }
    this.command(amove ? 'amove' : 'move', w);
  }

  // case (coin haut-gauche) visée pour le bâtiment en cours ; une mine s'aimante sur le filon le plus proche
  spotFor(kind, w) {
    const B = BUILDINGS[kind];
    if (kind === 'mine') {
      let best = null, bd = 16;
      for (const v of this.world.veins) {
        const d = Math.hypot(v.x * TS + TS - w.x, v.y * TS + TS - w.y);
        if (d < bd) { bd = d; best = v; }
      }
      if (best) return { c: best.x, r: best.y };
    }
    return { c: clamp(Math.round(w.x / TS - B.w / 2), 0, COLS - B.w), r: clamp(Math.round(w.y / TS - B.w / 2), 0, ROWS - B.w) };
  }

  placeCheck(kind, c, r) {
    const block = this.buildBlock(kind);
    if (block) return block;
    const B = BUILDINGS[kind];
    if (this.pending.some((p) => c < p.x + BUILDINGS[p.kind].w && c + B.w > p.x && r < p.y + BUILDINGS[p.kind].w && r + B.w > p.y)) return 'LA PLACE EST DÉJÀ PRISE';
    const why = canBuild(this.world, this.snapB.blds, this.me, kind, c, r, this.veinsTaken);
    return why ? why.toUpperCase().replace(/\.$/, '') : null;
  }

  rallyAt(w) {
    this.order({ mode: 'rally', x: rd(w.x), y: rd(w.y) });
    this.fx.push({ k: 'ping', x: w.x, y: w.y, t: 0, life: 600 });
  }

  onFire(m, e) {
    if (!this.snapB) return;
    if (this.sayTo != null) {
      // menu des messages : un choix l'envoie, un clic ailleurs le ferme
      const it = this.sayItems().find((s) => m.x >= s.x && m.x < s.x + s.bw && m.y >= s.y && m.y < s.y + s.h);
      if (it) { this.sayWord(it.w); return; }
      const b = this.inPanel(m) && this.btnAt(m);
      if (!(b && b.type === 'say')) { this.sayTo = null; if (!this.inPanel(m)) return; }
    }
    if (this.inMini(m)) { this.miniDrag = true; const w = this.fromMini(m); this.centerOn(w.x, w.y); return; }
    if (this.inPanel(m) || m.y < TOP) { const b = this.btnAt(m); if (b) this.press(b); return; }
    if (!this.inView(m) || !this.can) return;
    const w = this.toWorld(m);
    if (e?.pointerType === 'touch') { if (!this.pinching) this.clickMap(w, false, true); return; }
    // souris : tout part au relâcher. Glisser déplace la carte ; Maj (ou Ctrl) + glisser tire un cadre de sélection
    const sel = this.keys.has('shift') || this.keys.has('control');
    this.box = { a: w, sx: m.x, sy: m.y, px: m.x, py: m.y, sel, add: this.keys.has('shift'), moved: false };
  }

  // clic (ou toucher) sur la carte : poser le bâtiment, lancer la charge, choisir ou envoyer des unités
  clickMap(w, add, touch) {
    if (this.placing) {
      const k = this.placing;
      const { c, r } = this.spotFor(k, w);
      const why = this.placeCheck(k, c, r);
      if (why) { sfx('dry'); this.say(why, '#f0705a', 1800); return; }
      sfx('clank');
      this.hooks.send({ kind: 'build', b: k, x: c, y: r });
      this.pending.push({ kind: k, x: c, y: r, at: this.now });
      this.fx.push({ k: 'dust', x: (c + BUILDINGS[k].w / 2) * TS, y: (r + BUILDINGS[k].w) * TS, t: 0, life: 500 });
      this.placing = null; // un chantier à la fois
      return;
    }
    if (this.armed === 'amove') { this.armed = null; this.orderAt(w, true); return; }
    if (touch) this.tap(w);
    else this.clickAt(w, add);
  }

  onMove(m) {
    if (this.miniDrag && this.inMini(m)) { const w = this.fromMini(m); this.centerOn(w.x, w.y); }
    const b = this.box;
    if (!b) return;
    if (!b.moved && Math.hypot(m.x - b.sx, m.y - b.sy) >= 4) { b.moved = true; if (!b.sel) this.cv.style.cursor = 'grabbing'; }
    if (b.moved && !b.sel) this.scroll((b.px - m.x) / this.zoom, (b.py - m.y) / this.zoom);
    b.px = m.x; b.py = m.y;
  }

  onRelease() {
    this.miniDrag = false;
    const b = this.box;
    if (!b) return;
    this.box = null;
    this.cv.style.cursor = '';
    if (!b.moved) { if (this.can) this.clickMap(b.a, b.add, false); return; }
    if (b.sel) {
      const m = { x: clamp(this.mouse.x, 0, W - 1), y: clamp(this.mouse.y, TOP, PY - 1) };
      this.boxSelect(b.a, this.toWorld(m), b.add);
    }
  }

  onAlt(m) {
    if (this.sayTo != null) { this.sayTo = null; return; }
    if (this.placing) { this.placing = null; return; }
    if (this.armed) { this.armed = null; return; }
    if (!this.can) return;
    const shift = this.keys.has('shift');
    if (this.inMini(m)) this.orderAt(this.fromMini(m), shift, true);
    else if (this.inView(m)) this.orderAt(this.toWorld(m), shift);
  }

  onKey(k) {
    if (k === 'escape') {
      if (this.sayTo != null) this.sayTo = null;
      else if (this.diplo) this.closeDiplo();
      else if (this.placing) this.placing = null;
      else if (this.armed) this.armed = null;
      else this.clearSel();
      return;
    }
    if (k === 'p') { this.toggleDiplo(); return; }
    if (k === ' ') { const a = this.alert && this.now - this.alert.at < 15000 ? this.alert : null; this.jumpHome(a); return; }
    if (k === 'h') { this.jumpHome(null); const f = this.myBlds('fort')[0]; if (f) this.selectBld(f); return; }
    if (k === 't') { this.press({ type: 'all' }); return; }
    if (k === 'c' && this.sel.size) { this.press({ type: 'cmd', id: 'amove' }); return; }
    if (k === 's' && this.sel.size) { this.press({ type: 'cmd', id: 'hold' }); return; }
    if (k === 'x' && this.sel.size) { this.press({ type: 'cmd', id: 'stop' }); return; }
    if (k === 'u' && this.mode === 'bld') { this.press({ type: 'up' }); return; }
    if (k === '+' || k === '=' || k === 'pageup') { this.zoomStep(1); return; }
    if (k === ')' || k === '_' || k === 'pagedown') { this.zoomStep(-1); return; }
    const bi = BUILD_KEYS.findIndex((ks) => ks.includes(k));
    if (bi >= 0) return this.press({ type: 'build', id: BUILD_IDS[bi] });
    const ui = UNIT_KEYS.findIndex((ks) => ks.includes(k));
    if (ui >= 0) return this.press({ type: 'unit', id: UNIT_IDS[ui] });
    if (k === 'd') this.press({ type: 'defend' });
  }

  jumpHome(at) {
    if (at) return this.centerOn(at.x, at.y);
    const f = this.myBlds('fort')[0];
    if (f) { const c = bCenter(f); this.centerOn(c.x, c.y); }
  }

  hudStats() { return []; } // les ressources s'affichent en haut de l'image, avec leurs icônes

  // ---------------------------------------------------------- animation
  update(dt) {
    if (!this.world) return;
    const s = dt / 1000;
    // caméra : flèches, bord de l'écran (à la souris)
    let dx = 0, dy = 0;
    for (const [k, [ax, ay]] of Object.entries(ARROWS)) if (this.keys.has(k)) { dx += ax; dy += ay; }
    const m = this.mouse;
    // bord de l'écran : seulement les vrais bords, après un court arrêt (pas en allant de la carte au panneau)
    let ex = 0, ey = 0;
    if (!this.touch && m.in && document.hasFocus() && !this.pan && !this.box) {
      if (m.x < 3) ex = -1; else if (m.x > W - 3) ex = 1;
      if (m.y < 3) ey = -1; else if (m.y > H - 2) ey = 1;
    }
    if (ex || ey) { this.edgeAt ??= this.now; if (this.now - this.edgeAt > 250) { dx += ex; dy += ey; } } else this.edgeAt = null;
    if (dx || dy) this.scroll((dx * 260 * s) / this.zoom, (dy * 260 * s) / this.zoom);
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
      if (w.x > MW + 30) { w.x = -30 - Math.random() * 300; w.y = 20 + Math.random() * (MH - 40); }
    }
  }

  fire([x, y, tx, ty, k]) {
    if (k === 3) {
      // un bâton de dynamite lancé en cloche
      this.fx.push({ k: 'stick', x0: x, y0: y - 6, x1: tx, y1: ty, t: 0, life: 420 });
      return;
    }
    this.tracers.push({ x, y: y - 5, tx: tx + (Math.random() - 0.5) * 4, ty: ty - 4 + (Math.random() - 0.5) * 4, t: 0, big: k === 4 });
    const seen = this.seen(x, y, 30);
    if (seen && this.now - (this.lastShotSfx || 0) > 140) {
      this.lastShotSfx = this.now;
      sfx(k === 2 ? 'rifle' : k === 4 ? 'far' : 'revolver');
    }
  }

  // ---------------------------------------------------------- dessin
  // dessin en coordonnées de la carte, limité à la vue
  inWorld(ctx, draw) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, TOP, W, VH);
    ctx.clip();
    ctx.imageSmoothingEnabled = false;
    ctx.translate(0, TOP);
    ctx.scale(this.zoom, this.zoom);
    ctx.translate(-this.cx, -this.cy);
    draw(ctx);
    ctx.restore();
  }
  seen(x, y, m = 24) { return x > this.cx - m && x < this.cx + this.vw + m && y > this.cy - m && y < this.cy + this.vh + m * 1.5; }

  render(out) {
    const now = this.now;
    if (!this.world || !this.snapB) { out.fillStyle = OUT; out.fillRect(0, 0, W, H); return; }
    const k = this.snapA ? clamp((now - this.snapB.at) / this.snapB.span, 0, 1) : 1;
    const units = [];
    for (const u of this.snapB.units.values()) {
      const a = this.snapA?.units.get(u.id);
      const x = a ? a.x + (u.x - a.x) * k : u.x, y = a ? a.y + (u.y - a.y) * k : u.y;
      units.push({ ...u, x, y, moving: a ? Math.hypot(u.x - a.x, u.y - a.y) > 0.3 : false });
    }
    this.drawUnits = units;
    const ctx = this.amb.begin(out);
    this.inWorld(ctx, (c) => {
      const vw = Math.min(MW - this.cx, Math.ceil(this.vw) + 1), vh = Math.min(MH - this.cy, Math.ceil(this.vh) + 1);
      c.drawImage(this.map, this.cx, this.cy, vw, vh, this.cx, this.cy, vw, vh);
      this.drawWater(c, now);
      this.drawGround(c, now);
      this.drawSelGround(c, now);
      // bâtiments et unités visibles, du haut vers le bas de la carte
      const items = [
        ...this.snapB.blds.filter((b) => this.seen(bCenter(b).x, bCenter(b).y, 40)).map((b) => ({ y: (b.y + b.w) * TS, b })),
        ...units.filter((u) => this.seen(u.x, u.y)).map((u) => ({ y: u.y, u })),
      ].sort((a, b) => a.y - b.y);
      for (const it of items) if (it.b) this.drawBuilding(c, it.b, now); else this.drawUnit(c, it.u, now);
      for (const p of this.pending) this.drawBuilding(c, { ...p, id: 0, owner: this.me, w: BUILDINGS[p.kind].w, build: BUILDINGS[p.kind].time, queue: '', lv: 1, up: 0 }, now);
      for (const w of this.weeds) if (this.seen(w.x, w.y)) S.tumbleweed(c, rd(w.x), rd(w.y), now);
      this.drawFx(c, now);
      // ombres des vautours qui tournent
      c.fillStyle = 'rgba(26,15,10,0.25)';
      for (let v = 0; v < 3; v++) {
        const a = now / (5200 + v * 900) + v * 2.4, vx = MW / 2 + Math.cos(a) * (140 + v * 70), vy = MH / 2 + Math.sin(a) * (90 + v * 30);
        const fl = Math.floor(now / 260 + v) % 2;
        c.fillRect(rd(vx) - 3, rd(vy) - fl, 3, 1); c.fillRect(rd(vx) + 1, rd(vy) - fl, 3, 1); c.fillRect(rd(vx), rd(vy), 1, 1);
      }
    });
    this.amb.end(out, now);
    this.inWorld(out, (c) => { for (const b of this.snapB.blds) if (b.kind === 'fort') { const p = bCenter(b); this.amb.glow(c, p.x, p.y - 10, 22); } });
    this.amb.weather(out, now);
    this.inWorld(out, (c) => {
      // tirs (lumineux, par-dessus la teinte)
      for (const tr of this.tracers) {
        const a = 1 - tr.t / 120;
        c.fillStyle = tr.big ? `rgba(255,220,140,${a})` : `rgba(255,240,190,${a})`;
        const n = Math.max(1, Math.ceil(Math.hypot(tr.tx - tr.x, tr.ty - tr.y) / 2));
        for (let i = Math.floor(n * 0.3); i <= n; i++) c.fillRect(rd(tr.x + ((tr.tx - tr.x) * i) / n), rd(tr.y + ((tr.ty - tr.y) * i) / n), 1, 1);
        if (tr.t < 60) { c.fillStyle = '#fff8d0'; c.fillRect(rd(tr.x) - 1, rd(tr.y) - 1, 3, 3); }
      }
      this.drawBars(c);
      this.drawOrders(c, now);
      if (this.placing && this.can) this.drawPlacing(c, now);
    });
    this.drawBox(out);
    this.drawHover(out);
    this.drawTop(out, now);
    this.drawPanel(out, now);
    this.drawMini(out, now);
    this.drawSayMenu(out);
    this.drawTip(out);
    this.drawBanner(out, now);
    if (now - (this.zoomShown ?? -1e9) < 900) {
      const txt = `ZOOM X${fmt(this.zoom)}`, w = rd(tw(txt)) + 8;
      out.fillStyle = 'rgba(26,15,10,0.75)'; out.fillRect(W - w - 3, this.panelY - 26, w, 11);
      canvasText(out, txt, W - 3 - w / 2, this.panelY - 24, { color: '#fdf6e0' });
    }
  }

  drawWater(ctx, now) {
    ctx.fillStyle = this.look.ripple;
    for (const [x, y] of this.waterPx) {
      if (!this.seen(x, y, 8)) continue;
      const ph = (now / 900 + h2(x, y) * 8) % 8;
      const yy = y + ((h2(y, x) * 8) | 0);
      ctx.fillRect(x + (ph | 0), yy, 2, 1);
    }
  }

  // reflets sur les filons libres
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

  // au sol, sous les sprites : cercles des unités choisies, cadre et portée du bâtiment choisi
  drawSelGround(ctx, now) {
    const ring = (x, y, rx, ry, col, dash = 1) => {
      ctx.fillStyle = col;
      const n = Math.max(12, rd((rx + ry) * 3));
      for (let i = 0; i < n; i++) {
        if (dash > 1 && Math.floor(i / dash) % 2) continue;
        const a = (i / n) * Math.PI * 2;
        ctx.fillRect(rd(x + Math.cos(a) * rx), rd(y + Math.sin(a) * ry), 1, 1);
      }
    };
    const sel = this.selUnits();
    for (const u of this.drawUnits) {
      if (!this.sel.has(u.id) || !this.seen(u.x, u.y)) continue;
      const rw = u.kind === 'rider' ? 7 : 5;
      ring(u.x, u.y, rw, 2.5, '#fdf6e0');
    }
    // une seule unité : sa portée (colline comprise)
    if (sel.length === 1) {
      const u = this.drawUnits.find((x) => x.id === sel[0].id);
      if (u) {
        const st = uStats(u.kind, this.techOf(u.owner, u.kind), u.rank);
        const r = st.range + (UNITS[u.kind].range >= 20 ? terrainPx(this.world, u.x, u.y).range || 0 : 0);
        ring(u.x, u.y - 3, r, r * 0.75, 'rgba(253,246,224,0.35)', 3);
      }
    }
    const b = this.selBld();
    if (b) {
      const x0 = b.x * TS - 1, y0 = b.y * TS - 1, w = b.w * TS + 2;
      // quatre coins en équerre
      ctx.fillStyle = b.owner === this.me ? '#fdf6e0' : '#f0705a';
      for (const [cx, cy, sx, sy] of [[x0, y0, 1, 1], [x0 + w - 1, y0, -1, 1], [x0, y0 + w - 1, 1, -1], [x0 + w - 1, y0 + w - 1, -1, -1]]) {
        ctx.fillRect(sx < 0 ? cx - 3 : cx, cy, 4, 1);
        ctx.fillRect(cx, sy < 0 ? cy - 3 : cy, 1, 4);
      }
      if ((b.kind === 'fort' || b.kind === 'tower') && b.build <= 0) {
        const c = bCenter(b), g = guardOf(b.kind, b.lv);
        const r = g.range + (terrainPx(this.world, c.x, c.y).range || 0);
        ring(c.x, c.y, r, r, b.owner === this.me ? 'rgba(253,246,224,0.4)' : 'rgba(240,112,90,0.5)', 3);
      }
    }
  }

  drawBuilding(ctx, b, now) {
    const col = this.color(b.owner);
    const spr = buildingSprite(b.kind, col, b.build > 0 ? 1 : b.lv || 1);
    const cx = (b.x + b.w / 2) * TS, by = (b.y + b.w) * TS;
    // ombre et socle à la couleur du joueur
    ctx.fillStyle = 'rgba(26,15,10,0.22)';
    ctx.fillRect(b.x * TS + 2, by - 2, b.w * TS, 3);
    ctx.fillStyle = col;
    ctx.fillRect(b.x * TS, by, b.w * TS, 1);
    if (b.build > 0) {
      // chantier : charpente qui se monte
      const k = 1 - b.build / BUILDINGS[b.kind].time;
      const h = rd(spr.height * clamp(k, 0, 1));
      ctx.globalAlpha = 0.45;
      ctx.drawImage(spr, rd(cx - spr.ox), rd(by - spr.oy));
      ctx.globalAlpha = 1;
      if (h > 0) ctx.drawImage(spr, 0, spr.height - h, spr.width, h, rd(cx - spr.ox), rd(by - spr.oy) + spr.height - h, spr.width, h);
      ctx.fillStyle = WOOD_L;
      const x0 = b.x * TS, w = b.w * TS;
      ctx.fillRect(x0, by - 12, 1, 12); ctx.fillRect(x0 + w - 1, by - 12, 1, 12); ctx.fillRect(x0, by - 12, w, 1);
      if (Math.floor(now / 300) % 2) { ctx.fillStyle = '#e8d8b8'; ctx.fillRect(rd(cx) + ((now / 150) % 6 | 0) - 3, by - 13, 1, 1); }
      return;
    }
    ctx.drawImage(spr, rd(cx - spr.ox), rd(by - spr.oy));
    const lv = b.lv || 1, X = rd(cx);
    // détails animés, selon le niveau
    if (b.kind === 'fort') {
      // drapeaux à la couleur du joueur : [dx, haut du mât, longueur du mât, largeur du drapeau]
      for (const [dx, dy, len, fw] of FORT_FLAGS[lv]) {
        const fx = X + dx, fy = by + dy, big = fw > 6;
        ctx.fillStyle = OUT; ctx.fillRect(fx - 1, fy - 1, 3, len + 1);
        ctx.fillStyle = '#d8c8a8'; ctx.fillRect(fx, fy, 1, len);
        const wv = Math.floor(now / 220 + dx) % 3;
        ctx.fillStyle = OUT; ctx.fillRect(fx + 1, fy - 1, fw + 1, big ? 7 : 5);
        ctx.fillStyle = col;
        for (let i = 0; i < fw; i++) ctx.fillRect(fx + 1 + i, fy + ((i + wv) % 3 === 0 ? 1 : 0), 1, big ? 5 : 3);
        ctx.fillStyle = S.shade(col, 0.3); ctx.fillRect(fx + 2, fy + 1, 2, 1);
      }
      if (lv < 3) this.smoke(ctx, X - 6, by - (lv === 2 ? 25 : 26), now, b.id);
      else this.smoke(ctx, X + 7, by - 17, now, b.id); // forge dans la cour
    } else if (b.kind === 'armory') {
      if (lv >= 2) { this.smoke(ctx, X + 6, by - 27, now, b.id); this.smoke(ctx, X + 7, by - 27, now + 700, b.id + 1); } else this.smoke(ctx, X + 4, by - 18, now, b.id);
    } else if (b.kind === 'mine') {
      const v = this.world.veins.find((x) => x.x === b.x && x.y === b.y);
      ctx.fillStyle = v?.kind === 'gold' ? '#f8d040' : '#c8743a';
      ctx.fillRect(X + 4, by - 6, 3, 1);
      if (Math.floor(now / (400 / lv) + b.id) % 4 === 0) { ctx.fillStyle = '#fff8c0'; ctx.fillRect(X + 5, by - 7, 1, 1); }
      if (lv >= 2) {
        // la molette du chevalement tourne
        const a = now / 180, r = lv >= 3 ? 2 : 1;
        ctx.fillStyle = '#c8c8d0'; ctx.fillRect(rd(X + Math.cos(a) * r), rd(by - 27 + Math.sin(a) * r), 1, 1);
        ctx.fillRect(rd(X - Math.cos(a) * r), rd(by - 27 - Math.sin(a) * r), 1, 1);
      }
      if (lv >= 3) this.smoke(ctx, X + 10, by - 27, now, b.id);
    } else if (b.kind === 'ranch') {
      if (lv >= 3) {
        // pales de l'éolienne
        const a0 = now / 260;
        for (let k = 0; k < 4; k++) {
          const a = a0 + (k * Math.PI) / 2;
          for (let r = 1; r <= 4; r++) { ctx.fillStyle = r === 4 ? OUT : '#e8e0d0'; ctx.fillRect(rd(X + 9 + Math.cos(a) * r), rd(by - 28 + Math.sin(a) * r), 1, 1); }
        }
      }
      // des vaches qui broutent dans l'enclos (une de plus par niveau)
      for (let k = 0; k < 1 + lv; k++) {
        const x = X + 3 + ((Math.sin(now / 1700 + k * 3 + b.id) * 2) | 0) + (k % 2) * 2, y = by - 10 + (k % 3) * 3;
        ctx.fillStyle = OUT; ctx.fillRect(x - 1, y - 1, 6, 4);
        ctx.fillStyle = k === 2 ? '#8a5a3a' : '#e8e0d0'; ctx.fillRect(x, y, 4, 2); ctx.fillStyle = '#3a2416'; ctx.fillRect(x + 1, y, 1, 1); ctx.fillRect(x + (k % 2 ? -1 : 4), y, 1, 1);
      }
    } else if (b.kind === 'stable' && lv >= 2) {
      // un cheval passe la tête et l'agite
      if (Math.floor(now / 900 + b.id) % 3 === 0) { ctx.fillStyle = '#8a5a3a'; ctx.fillRect(X - 6, by - 9, 1, 1); }
    } else if (b.kind === 'tower' && lv === 2 && Math.floor(now / 500) % 2) {
      ctx.fillStyle = '#fff0a0'; ctx.fillRect(X, by - 23, 1, 1); // la lanterne vacille
    }
    // amélioration en cours : échafaudage et coups de marteau
    if (b.up > 0) {
      const x0 = b.x * TS - 1, w = b.w * TS + 2, top = by - Math.min(spr.oy, 20);
      ctx.fillStyle = WOOD_L;
      ctx.fillRect(x0, top, 1, by - top); ctx.fillRect(x0 + w - 1, top, 1, by - top);
      for (let y = top + 3; y < by; y += 5) ctx.fillRect(x0, y, w, 1);
      if (Math.floor(now / 250) % 2) { ctx.fillStyle = '#fff0a0'; ctx.fillRect(x0 + 2 + ((now / 120) % (w - 4) | 0), top + 2, 1, 1); }
    }
    // recrutement ou amélioration en cours : barres sous le bâtiment
    if (b.owner === this.me) {
      const x = b.x * TS;
      let y = by + 2;
      if (b.queue.length) {
        ctx.fillStyle = OUT; ctx.fillRect(x, y, b.w * TS, 2);
        ctx.fillStyle = b.queue[0] >= 'a' ? '#8ad870' : '#f8d070'; ctx.fillRect(x, y, rd(b.w * TS * (b.prog / 100)), 2);
        y += 3;
      }
      const nx = upNext(b);
      if (b.up > 0 && nx) {
        ctx.fillStyle = OUT; ctx.fillRect(x, y, b.w * TS, 2);
        ctx.fillStyle = '#8ad870'; ctx.fillRect(x, y, rd(b.w * TS * clamp(1 - b.up / nx[1], 0, 1)), 2);
      }
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
    const col = this.color(u.owner);
    const spr = unitSprite(u.kind, col, f, this.techOf(u.owner, u.kind), u.rank);
    // pastille à la couleur du joueur sous les pieds : on voit d'un coup d'œil qui est qui
    const rw = u.kind === 'rider' ? 6 : 4;
    ctx.fillStyle = OUT;
    ctx.fillRect(rd(u.x) - rw - 1, rd(u.y) - 1, rw * 2 + 3, 3);
    ctx.fillStyle = col;
    ctx.fillRect(rd(u.x) - rw, rd(u.y) - 1, rw * 2 + 1, 2);
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
          if (this.seen(f.x1, f.y1) && this.now - (this.lastBoom || 0) > 200) { this.lastBoom = this.now; sfx('boom'); }
        }
      } else if (f.k === 'ping') {
        ctx.fillStyle = f.col || this.color(this.me);
        const r = 2 + k * 6;
        for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; ctx.fillRect(rd(f.x + Math.cos(a) * r), rd(f.y + Math.sin(a) * r * 0.6), 1, 1); }
      } else if (f.k === 'promo') {
        // galon gagné : des étincelles dorées qui montent
        ctx.fillStyle = k < 0.5 ? '#fff8c0' : '#f8d070';
        for (let i = 0; i < 6; i++) ctx.fillRect(rd(f.x + Math.cos(i * 1.05) * (3 + k * 5)), rd(f.y - 8 - k * 14 + Math.sin(i * 1.05) * 2), 1, 1);
      }
    }
  }

  // barres de vie (bâtiments abîmés, unités blessées ou choisies) et galons
  drawBars(ctx) {
    // joueurs trahis il y a moins d'une minute : un cœur brisé qui clignote au-dessus de leurs bâtiments et de leurs unités
    const weak = new Set(this.others().filter((j) => this.weakS(j)));
    if (this.weakS(this.me)) weak.add(this.me);
    const pulse = Math.floor(this.now / 350) % 2;
    if (weak.size && pulse) {
      for (const b of this.snapB.blds) if (weak.has(b.owner) && this.seen(bCenter(b).x, bCenter(b).y, 20)) ctx.drawImage(icon('weak'), rd(bCenter(b).x) - 4, this.bldTop(b) - 13);
    }
    for (const b of this.snapB.blds) {
      const chosen = b.id === this.selB;
      if ((b.hp >= b.maxHp && !chosen) || b.build > 0) continue;
      const w = b.w * TS, x = b.x * TS, y = this.bldTop(b) - 4;
      ctx.fillStyle = OUT; ctx.fillRect(x - 1, y - 1, w + 2, 4);
      ctx.fillStyle = '#5a2a20'; ctx.fillRect(x, y, w, 2);
      ctx.fillStyle = b.hp / b.maxHp > 0.35 ? '#7ac860' : '#f0705a'; ctx.fillRect(x, y, Math.max(1, rd((w * b.hp) / b.maxHp)), 2);
    }
    for (const u of this.drawUnits) {
      if (!this.seen(u.x, u.y)) continue;
      const max = this.uMax(u);
      const top = rd(u.y) - (u.kind === 'rider' ? 18 : 15);
      const chosen = this.sel.has(u.id);
      if (u.hp < max || chosen) {
        const x = rd(u.x) - 3;
        ctx.fillStyle = OUT; ctx.fillRect(x - 1, top - 1, 8, 3);
        ctx.fillStyle = u.hp / max > 0.4 ? '#7ac860' : '#f0705a'; ctx.fillRect(x, top, Math.max(1, rd((6 * u.hp) / max)), 1);
      }
      if (u.rank) chevrons(ctx, rd(u.x) - Math.floor((u.rank * 3 - 1) / 2), top - 4, u.rank);
      if (pulse && weak.has(u.owner)) {
        // petite flèche violette vers le bas : affaibli
        ctx.fillStyle = WEAK_COL;
        const x = rd(u.x) + 5;
        ctx.fillRect(x, top - 1, 3, 1); ctx.fillRect(x + 1, top, 1, 1);
      }
    }
  }

  // repère de l'ordre en cours de mon armée, et chemin des unités choisies
  drawOrders(ctx, now) {
    const o = this.my[4];
    const bob = Math.floor(now / 300) % 2;
    const col = this.color(this.me);
    // forts de mes alliés : la poignée de main au-dessus
    for (const f of this.snapB.blds) {
      if (f.kind !== 'fort' || !this.allied(this.me, f.owner)) continue;
      const c = bCenter(f);
      ctx.drawImage(icon('pact'), rd(c.x) - 4, rd(c.y) - 31);
    }
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
    // pointillés jusqu'au but (vert : aller, rouge : charger ou attaquer)
    const marks = new Set();
    for (const u of this.drawUnits) {
      const c = this.sel.has(u.id) && this.cmdFx.get(u.id);
      if (!c) continue;
      let tx = c.x, ty = c.y;
      if (c.mode === 'attack') {
        const tu = this.drawUnits.find((v) => v.id === c.tid), tb = !tu && this.snapB.blds.find((b) => b.id === c.tid);
        if (!tu && !tb) { this.cmdFx.delete(u.id); continue; }
        ({ x: tx, y: ty } = tu || bCenter(tb));
      } else if (Math.hypot(tx - u.x, ty - u.y) < 7) { this.cmdFx.delete(u.id); continue; }
      ctx.fillStyle = c.mode === 'move' ? 'rgba(154,224,128,0.7)' : 'rgba(240,112,90,0.7)';
      const n = Math.floor(Math.hypot(tx - u.x, ty - u.y) / 4);
      const ph = (now / 120) % 1;
      for (let i = 1; i < n; i++) { const kk = (i + ph) / n; ctx.fillRect(rd(u.x + (tx - u.x) * kk), rd(u.y - 2 + (ty - u.y) * kk), 1, 1); }
      marks.add(`${rd(tx)},${rd(ty)},${c.mode}`);
    }
    for (const m of marks) {
      const [x, y, mode] = m.split(',');
      ctx.fillStyle = mode === 'move' ? '#9ae080' : '#f0705a';
      ctx.fillRect(+x - 2, +y, 5, 1); ctx.fillRect(+x, +y - 2, 1, 5);
    }
  }

  drawPlacing(ctx, now) {
    const kind = this.placing;
    const B = BUILDINGS[kind];
    // territoire : contour pointillé autour du fort, des mines et des tours
    const key = this.myBlds().map((b) => b.id).join(',');
    if (this.terrKey !== key) {
      this.terrKey = key;
      const fort = this.myBlds('fort')[0];
      const c = (this.terr ||= S.makeCanvas(MW, MH));
      const x = c.getContext('2d');
      x.clearRect(0, 0, MW, MH);
      if (fort) {
        const fc = bCenter(fort), G = 4, gw = Math.ceil(MW / G), gh = Math.ceil(MH / G);
        const inside = new Uint8Array(gw * gh);
        for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) inside[j * gw + i] = inTerritory(fc, this.snapB.blds, this.me, i * G + 2, j * G + 2) ? 1 : 0;
        x.fillStyle = 'rgba(253,246,224,0.16)';
        for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) if (inside[j * gw + i]) x.fillRect(i * G, j * G, G, G);
        x.fillStyle = this.color(this.me);
        for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
          if (!inside[j * gw + i]) continue;
          const edge = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => !inside[(j + dy) * gw + i + dx]);
          if (edge) x.fillRect(i * G + 1, j * G + 1, 2, 2);
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
        for (let i = 0; i < 28; i++) { const a = (i / 28) * Math.PI * 2; ctx.fillRect(rd(v.x * TS + TS + Math.cos(a) * r), rd(v.y * TS + TS + Math.sin(a) * r * 0.8), 1, 1); }
      }
    }
    if (!this.mouse.in || !this.inView(this.mouse)) return;
    const { c, r } = this.spotFor(kind, this.toWorld(this.mouse));
    const why = this.placeCheck(kind, c, r);
    const spr = buildingSprite(kind, this.color(this.me));
    ctx.globalAlpha = 0.6;
    ctx.drawImage(spr, rd((c + B.w / 2) * TS - spr.ox), rd((r + B.w) * TS - spr.oy));
    ctx.globalAlpha = 1;
    ctx.fillStyle = why ? 'rgba(240,112,90,0.45)' : 'rgba(122,200,96,0.45)';
    ctx.fillRect(c * TS, r * TS, B.w * TS, B.w * TS);
    if (B.reach) { ctx.fillStyle = 'rgba(253,246,224,0.5)'; for (let i = 0; i < 40; i++) { const a = (i / 40) * Math.PI * 2; ctx.fillRect(rd((c + B.w / 2) * TS + Math.cos(a) * B.reach), rd((r + B.w / 2) * TS + Math.sin(a) * B.reach), 1, 1); } }
    this.info = why;
  }

  // cadre de sélection (à la souris) et viseur de la charge
  drawBox(ctx) {
    const b = this.box, m = this.mouse;
    if (b && b.sel && b.moved) {
      const a = this.toScreen(b.a.x, b.a.y);
      const x0 = rd(Math.min(a.x, m.x)), x1 = rd(Math.max(a.x, m.x)), y0 = rd(clamp(Math.min(a.y, m.y), TOP, PY - 1)), y1 = rd(clamp(Math.max(a.y, m.y), TOP, PY - 1));
      ctx.fillStyle = 'rgba(253,246,224,0.1)'; ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
      ctx.fillStyle = '#fdf6e0';
      for (let x = x0; x <= x1; x += 2) { ctx.fillRect(x, y0, 1, 1); ctx.fillRect(x, y1, 1, 1); }
      for (let y = y0; y <= y1; y += 2) { ctx.fillRect(x0, y, 1, 1); ctx.fillRect(x1, y, 1, 1); }
    }
    if (this.armed && m.in && this.inView(m)) {
      ctx.fillStyle = '#f0705a';
      const x = rd(m.x), y = rd(m.y);
      ctx.fillRect(x - 5, y, 3, 1); ctx.fillRect(x + 3, y, 3, 1); ctx.fillRect(x, y - 5, 1, 3); ctx.fillRect(x, y + 3, 1, 3);
    }
  }

  // étiquette de ce qui est survolé (à la souris) : bâtiment, unité, ou terrain particulier
  drawHover(ctx) {
    const m = this.mouse;
    this.terrHint = null;
    if (this.touch || !m.in || !this.inView(m) || this.placing || this.box?.moved) return;
    const w = this.toWorld(m);
    const u = this.unitAt(w, null);
    const b = !u && this.bldAt(w);
    let text, col, top;
    const tag = (o) => (o === this.me ? '' : this.allied(this.me, o) ? ' (ALLIÉ)' : this.weakS(o) ? ' (AFFAIBLI)' : '');
    if (u) {
      const who = u.owner === this.me ? '' : ` - ${this.name(u.owner).toUpperCase()}${tag(u.owner)}`;
      text = `${UNITS[u.kind].name.toUpperCase()}${u.rank ? ` ${RANK_NAME[u.rank]}` : ''} ${Math.ceil(u.hp)}/${this.uMax(u)}${who}`;
      col = this.color(u.owner); top = this.toScreen(u.x, u.y).y - 16 * this.zoom - 14;
    } else if (b) {
      const name = b.kind === 'fort' ? `FORT DE ${b.owner === this.me ? 'TOI' : this.name(b.owner).toUpperCase()}` : BUILDINGS[b.kind].name.toUpperCase();
      text = (b.build > 0 ? `${name} - CHANTIER` : `${name}${b.lv > 1 ? ` NIV. ${b.lv}` : ''} ${Math.ceil(b.hp)}/${b.maxHp}`) + tag(b.owner);
      col = this.color(b.owner); top = this.toScreen(0, this.bldTop(b)).y - 14;
    } else {
      // terrains qui comptent pour la bataille : la bande du bas les explique
      const t = terrainPx(this.world, w.x, w.y);
      const hint = { forest: 'BOIS : LES UNITÉS À COUVERT PRENNENT 35 % DE DÉGÂTS EN MOINS', hill: 'COLLINE : +10 DE PORTÉE POUR LES TIREURS ET LES TOURS',
        swamp: 'MARAIS : TRÈS LENT, ON N\'Y BÂTIT PAS', salt: 'CROÛTE DE SEL : ON Y FILE PLUS VITE', ford: 'GUÉ : ON PASSE, LENTEMENT', bridge: 'PONT : LE PASSAGE',
        snow: 'NEIGE : ON Y MARCHE MOINS VITE', scrub: 'BROUSSAILLES : LENT, ON N\'Y BÂTIT PAS', water: 'EAU : INFRANCHISSABLE', rock: 'ROCHERS : INFRANCHISSABLES' }[t.id];
      this.terrHint = hint || null;
      return;
    }
    const wd = rd(tw(text)) + 8, x = clamp(rd(m.x - wd / 2), 1, W - wd - 1), y = clamp(rd(top), TOP + 1, PY - 12);
    ctx.fillStyle = 'rgba(26,15,10,0.85)'; ctx.fillRect(x, y, wd, 11);
    ctx.fillStyle = col; ctx.fillRect(x, y + 10, wd, 1);
    canvasText(ctx, text, x + wd / 2, y + 2, { color: '#fdf6e0' });
  }

  // barre des ressources, en haut
  drawTop(ctx, now) {
    ctx.fillStyle = '#2a1a10'; ctx.fillRect(0, 0, W, TOP);
    ctx.fillStyle = '#5e3a1e'; ctx.fillRect(0, TOP - 1, W, 1);
    const [gold, food, , army] = this.my;
    const inc = this.income || { gold: 0, food: 0 };
    const pop = this.pop();
    let x = 2;
    const item = (ic, val, col, rate, rcol = '#a8c890') => {
      ctx.drawImage(icon(ic), x, 2);
      canvasText(ctx, String(val), x + 11, 3, { align: 'left', color: col });
      x += 11 + tw(val) + 3;
      if (rate != null) { canvasText(ctx, rate, x, 3, { align: 'left', color: rcol }); x += tw(rate) + 2; }
      x += 7;
    };
    item('gold', gold, '#f8d070', `+${fmt(inc.gold)}`);
    item('food', food, '#f0c8a8', `+${fmt(inc.food)}`);
    const full = army + this.queuedAll() >= pop;
    item('pop', `${army}/${pop}`, full ? '#f0705a' : '#fdf6e0');
    const fort = this.myBlds('fort')[0];
    if (fort) item('heart', Math.ceil(fort.hp), fort.hp / fort.maxHp > 0.35 ? '#fdf6e0' : '#f0705a');
    // bouton des pactes (P), qui clignote quand on me propose une alliance
    const inbox = this.offersToMe();
    const b = (this.topBtn = { type: 'diplo', x: rd(x), y: 1, w: 44, h: 10 });
    const hov = !this.touch && this.mouse.in && this.mouse.y < TOP && this.btnAt(this.mouse) === b;
    const blink = inbox && Math.floor(now / 400) % 2;
    ctx.fillStyle = OUT; ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = this.diplo || blink ? '#8a6a3a' : hov ? '#6a4a2a' : '#4e3220'; ctx.fillRect(b.x + 1, b.y + 1, b.w - 2, b.h - 2);
    ctx.drawImage(icon('pact'), b.x + 1, b.y + 1);
    canvasText(ctx, 'PACTES', b.x + 10, b.y + 2, { align: 'left', color: this.diplo || blink ? '#fdf6e0' : '#e8d8b8' });
    if (inbox) { ctx.fillStyle = OUT; ctx.fillRect(b.x + b.w - 1, b.y, 7, 9); ctx.fillStyle = '#a8382a'; ctx.fillRect(b.x + b.w, b.y + 1, 5, 7); canvasText(ctx, String(inbox), b.x + b.w + 3, b.y + 1, { color: '#fdf6e0' }); }
    // à droite : le malus si on vient d'être trahi, sinon le chantier en cours, sinon l'ordre de l'armée
    const site = this.site();
    const weak = this.weakS(this.me);
    let txt, col = '#e8d8b8', ic = null;
    if (weak) { ic = 'weak'; txt = `TRAHI : AFFAIBLI ${weak} S`; col = WEAK_COL; } else if (this.endS && this.alive) {
      ic = 'pact'; txt = `FIN DES ALLIANCES ${this.endS} S`; col = Math.floor(now / 400) % 2 ? '#f0705a' : '#f8d070';
    } else if (site) {
      const name = site.kind === 'fort' ? 'FORT' : BUILDINGS[site.kind].name.toUpperCase();
      if (site.up > 0) { ic = 'up'; txt = `${name} NIV. ${(site.lv || 1) + 1} ${Math.max(1, Math.ceil(site.up / 1000))} S`; } else { ic = 'hammer'; txt = `${name} ${Math.max(1, Math.ceil(site.build / 1000))} S`; }
      col = '#f8d070';
    } else {
      const o = this.my[4];
      txt = !this.alive ? 'ÉLIMINÉ' : o >= 0 ? `ATTAQUE ${this.name(o).toUpperCase()}` : o === -2 ? 'RALLIEMENT' : 'DÉFENSE DU FORT';
      if (o >= 0) col = this.color(o);
    }
    const tx = W - 3 - tw(txt);
    if (ic) ctx.drawImage(icon(ic), rd(tx) - 11, 2);
    canvasText(ctx, txt, W - 3, 3, { align: 'right', color: col });
  }

  // un bouton : cadre (enfoncé, survolé), contenu grisé s'il est indisponible
  btnFrame(ctx, b, on, ok, hov) {
    ctx.fillStyle = OUT; ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = on ? '#8a6a3a' : hov && ok ? '#6a4a2a' : '#4e3220';
    ctx.fillRect(b.x + 1, b.y + 1, b.w - 2, b.h - 2);
    ctx.fillStyle = on ? '#f8d070' : '#7a5434'; ctx.fillRect(b.x + 1, b.y + 1, b.w - 2, 1);
    if (on || hov) { ctx.fillStyle = on ? '#f8d070' : '#c8a878'; ctx.fillRect(b.x, b.y, b.w, 1); ctx.fillRect(b.x, b.y + b.h - 1, b.w, 1); ctx.fillRect(b.x, b.y, 1, b.h); ctx.fillRect(b.x + b.w - 1, b.y, 1, b.h); }
  }

  badge(ctx, b, n, col = '#a8382a') {
    if (!n) return;
    const bx = b.x + 1, by = b.y + 1;
    ctx.fillStyle = OUT; ctx.fillRect(bx, by, 8, 9);
    ctx.fillStyle = col; ctx.fillRect(bx + 1, by + 1, 6, 7);
    canvasText(ctx, String(n), bx + 4, by + 1, { color: '#fdf6e0' });
  }

  bar(ctx, x, y, w, k, col) {
    ctx.fillStyle = OUT; ctx.fillRect(x - 1, y - 1, w + 2, 4);
    ctx.fillStyle = '#2a1a10'; ctx.fillRect(x, y, w, 2);
    ctx.fillStyle = col; ctx.fillRect(x, y, rd(w * clamp(k, 0, 1)), 2);
  }

  // panneau de commandes
  drawPanel(ctx, now) {
    const y0 = PY, top = this.panelY;
    if (top < y0) {
      // pactes à 5 et 6 joueurs : le panneau monte sur la vue, à gauche
      ctx.fillStyle = '#3a2416'; ctx.fillRect(0, top, PW, y0 - top);
      ctx.fillStyle = '#6a4426'; ctx.fillRect(0, top, PW, 1);
      ctx.fillStyle = OUT; ctx.fillRect(0, top + 1, PW, 1); ctx.fillRect(PW, top, 1, y0 - top);
      for (let x = 0; x < PW; x += 31) { ctx.fillStyle = '#331f12'; ctx.fillRect(x, top + 2, 1, y0 - top); }
    }
    ctx.fillStyle = '#3a2416'; ctx.fillRect(0, y0, W, H - y0);
    ctx.fillStyle = '#6a4426'; ctx.fillRect(top < y0 ? PW : 0, y0, W, 1);
    ctx.fillStyle = OUT; ctx.fillRect(top < y0 ? PW : 0, y0 + 1, W, 1);
    for (let x = 0; x < W; x += 31) { ctx.fillStyle = '#331f12'; ctx.fillRect(x, y0 + 2, 1, H - y0 - 2); }
    ctx.fillStyle = '#5e3a1e'; ctx.fillRect(256, y0 + 3, 1, 33); ctx.fillRect(321, y0 + 3, 1, 33);
    const mode = this.mode;
    if (mode === 'none') ctx.fillRect(153, y0 + 3, 1, 33);
    const [gold, food] = this.my;
    const can = this.can;
    const hov = !this.touch && this.mouse.in && (this.inPanel(this.mouse) || this.mouse.y < TOP) ? this.btnAt(this.mouse) : null;
    this.hoverBtn = hov;
    const o = this.my[4];
    const site = this.site();
    const selN = this.sel.size;
    const selB = this.selBld();
    if (mode === 'bld' && selB) this.drawBldInfo(ctx, selB, now);
    if (mode === 'diplo') this.drawDiploRows(ctx);
    for (const b of this.buttons()) {
      let on = false, ok = can, label = null, sub = null, subCol = '#fdf6e0', badge = 0, block = null, lcol = null;
      if (b.type === 'build') {
        const B = BUILDINGS[b.id];
        const n = countOf(this.allBlds(), this.me, b.id), cost = this.cost(b.id);
        on = this.placing === b.id;
        ok = can && gold >= cost && n < B.max && !site;
        sub = n >= B.max ? 'MAX' : String(cost);
        subCol = n >= B.max ? '#a89a8a' : gold >= cost ? '#f8d070' : '#e08a7a';
        badge = n;
        if (site && n < B.max) block = 'hammer';
      } else if (b.type === 'unit') {
        const U = UNITS[b.id];
        const unlocked = this.hasReady(U.from);
        ok = can && unlocked && gold >= U.gold && food >= U.food;
        sub = String(U.gold);
        subCol = gold >= U.gold && food >= U.food ? '#f8d070' : '#e08a7a';
        b.locked = !unlocked;
        badge = mode === 'bld' && selB ? this.queued(b.id, selB) : this.queued(b.id);
      } else if (b.type === 'tech') {
        const lv = this.techOf(this.me, b.id);
        ok = can && !this.techBlock(b.id);
        sub = lv >= TECH.max ? 'MAX' : String(TECH.cost[lv][0]);
        subCol = lv >= TECH.max ? '#a89a8a' : ok ? '#8ad870' : '#e08a7a';
      } else if (b.type === 'up') {
        const nx = selB && upNext(selB);
        ok = can && !this.upBlock(selB);
        sub = nx ? String(nx[0]) : 'MAX';
        subCol = !nx ? '#a89a8a' : ok ? '#8ad870' : '#e08a7a';
        on = selB?.up > 0;
      } else if (b.type === 'defend') {
        on = o === -1 && !selN; label = 'DÉFENDRE';
      } else if (b.type === 'all') {
        const n = this.my[3];
        on = !!n && selN === n; ok = !!n; label = `TOUS (${n})`;
      } else if (b.type === 'cmd') {
        label = b.label; on = b.id === 'amove' && this.armed === 'amove';
        ok = b.id === 'clear' || can;
      } else if (b.type === 'card') ok = true;
      else if (b.type === 'pact') {
        const st = this.dState(b.to);
        label = b.op === 'accept' ? 'OUI' : b.op === 'betray' ? 'TRAHIR' : st === 'out' ? 'ENVOYÉE' : 'ALLIANCE';
        ok = can && (b.op === 'betray' || (this.canPact() && st !== 'out' && !this.allyAll(b.to)));
        on = b.op === 'betray' && this.betrayArm?.to === b.to && now - this.betrayArm.at < 2500;
        lcol = b.op === 'accept' ? '#8ad870' : b.op === 'betray' ? WEAK_COL : null;
      } else if (b.type === 'refuse') { label = 'NON'; lcol = '#e08a7a'; }
      else if (b.type === 'gift') ok = can && (b.res === 'gold' ? gold >= DIPLO.gift.gold : food >= DIPLO.gift.food);
      else if (b.type === 'say') on = this.sayTo === b.to;
      else {
        const alive = !!this.snapB.P[b.target]?.[2];
        on = o === b.target && !selN; ok = can && alive && !this.allied(this.me, b.target);
      }
      this.btnFrame(ctx, b, on, ok, hov === b);
      if (!ok) ctx.globalAlpha = 0.45;
      if (b.type === 'build') {
        const spr = buildingSprite(b.id, this.color(this.me));
        ctx.save(); ctx.beginPath(); ctx.rect(b.x + 1, b.y + 1, b.w - 2, 21); ctx.clip();
        ctx.drawImage(spr, rd(b.x + b.w / 2 - spr.ox), rd(b.y + 22 - spr.oy + (b.id === 'tower' ? 4 : 2)));
        ctx.restore();
      } else if (b.type === 'unit' || b.type === 'tech') {
        // recrue : sa tenue actuelle ; entraînement : l'aperçu de la tenue suivante
        const lv = this.techOf(this.me, b.id);
        const spr = unitSprite(b.id, this.color(this.me), 0, b.type === 'tech' ? Math.min(TECH.max, lv + 1) : lv);
        ctx.drawImage(spr, rd(b.x + b.w / 2 - spr.ox), rd(b.y + 20 - spr.oy));
        if (b.type === 'tech') ctx.drawImage(icon('up'), b.x + 1, b.y + 13);
      } else if (b.type === 'up') {
        // aperçu du bâtiment au niveau suivant
        const nx = selB && upNext(selB);
        if (selB) {
          const spr = buildingSprite(selB.kind, this.color(this.me), Math.min(LV.max, selB.lv + (nx ? 1 : 0)));
          ctx.save(); ctx.beginPath(); ctx.rect(b.x + 1, b.y + 1, b.w - 2, 22); ctx.clip();
          ctx.drawImage(spr, rd(b.x + b.w / 2 - spr.ox), rd(b.y + 22 - spr.oy + (selB.kind === 'tower' ? 3 : 1)));
          ctx.restore();
        }
        ctx.drawImage(icon('up'), b.x + 1, b.y + 1);
        canvasText(ctx, nx ? `NIV.${selB.lv + 1}` : 'MAX', b.x + b.w - 2, b.y + 2, { align: 'right', color: '#fdf6e0' });
        if (selB?.up > 0 && nx) this.bar(ctx, b.x + 4, b.y + 18, b.w - 8, 1 - selB.up / nx[1], '#8ad870');
      } else if (b.type === 'gift') {
        ctx.drawImage(icon(b.res), b.x + 2, b.y + 1);
        canvasText(ctx, `+${DIPLO.gift[b.res]}`, b.x + b.w - 2, b.y + 2, { align: 'right', color: b.res === 'gold' ? '#f8d070' : '#f0c8a8' });
      } else if (b.type === 'say') {
        ctx.drawImage(icon('talk'), b.x + 2, b.y + 1);
        canvasText(ctx, 'MOT', b.x + b.w - 3, b.y + 2, { align: 'right', color: on ? '#fdf6e0' : '#e8d8b8' });
      } else if (b.type === 'attack' && b.w < 18) {
        // 4 ou 5 adversaires (5 et 6 joueurs) : bouton étroit, un trait à sa couleur, ses sabres (allié : la poignée de main)
        ctx.fillStyle = OUT; ctx.fillRect(b.x + 2, b.y + 1, b.w - 4, 3);
        ctx.fillStyle = this.color(b.target); ctx.fillRect(b.x + 3, b.y + 2, b.w - 6, 1);
        if (this.allied(this.me, b.target)) ctx.drawImage(icon('pact'), b.x + Math.floor((b.w - 9) / 2), b.y + 2);
        else swords(ctx, b.x + Math.floor((b.w - 5) / 2), b.y + 4, this.color(b.target));
      } else if (b.type === 'attack' && this.allied(this.me, b.target)) {
        // allié : la poignée de main à la place des sabres
        ctx.drawImage(icon('pact'), b.x + 1, b.y + 1);
        ctx.fillStyle = OUT; ctx.fillRect(b.x + 10, b.y + 2, 7, 7);
        ctx.fillStyle = this.color(b.target); ctx.fillRect(b.x + 11, b.y + 3, 5, 5);
        if (b.w > 22) canvasText(ctx, this.name(b.target).toUpperCase().slice(0, Math.floor((b.w - 21) / 5.2)), b.x + 19, b.y + 2, { align: 'left', color: this.color(b.target) });
      } else if (b.type === 'attack') {
        swords(ctx, b.x + 3, b.y + 3, this.color(b.target));
        ctx.fillStyle = OUT; ctx.fillRect(b.x + 10, b.y + 2, 7, 7);
        ctx.fillStyle = this.color(b.target); ctx.fillRect(b.x + 11, b.y + 3, 5, 5);
        if (b.w > 22) canvasText(ctx, this.name(b.target).toUpperCase().slice(0, Math.floor((b.w - 21) / 5.2)), b.x + 19, b.y + 2, { align: 'left', color: this.color(b.target) });
      } else if (b.type === 'card') this.drawCard(ctx, b);
      else canvasText(ctx, label, b.x + b.w / 2, b.y + (b.h > 12 ? 4 : 2), { color: lcol || (on ? '#fdf6e0' : '#e8d8b8') });
      if (sub) {
        if (sub !== 'MAX') ctx.drawImage(icon('gold'), b.x + 1, b.y + 24);
        canvasText(ctx, sub, b.x + b.w - 2, b.y + 25, { align: 'right', color: subCol });
      }
      ctx.globalAlpha = 1;
      if (b.type === 'unit' && b.locked) { ctx.fillStyle = 'rgba(26,15,10,0.5)'; ctx.fillRect(b.x + 1, b.y + 1, b.w - 2, b.h - 2); this.lock(ctx, b.x + b.w - 7, b.y + 3); }
      if (b.type === 'unit' || b.type === 'tech') pips(ctx, b.x + b.w - 4, b.y + 3 + (b.locked ? 9 : 0), this.techOf(this.me, b.id), TECH.max);
      if (b.type === 'tech') { const r = this.researching(b.id); if (r) this.bar(ctx, b.x + 3, b.y + 21, b.w - 6, r[1], '#8ad870'); }
      if (block) ctx.drawImage(icon('hammer'), b.x + b.w - 10, b.y + 2);
      if (b.type === 'build' || b.type === 'unit') this.badge(ctx, b, badge, b.type === 'unit' ? '#a8382a' : '#5e3a1e');
      if (b.type === 'build' && b.id === 'mine' && ok) {
        const free = this.world.veins.some((v) => !this.veinsTaken.has(v.id) && !this.placeCheck('mine', v.x, v.y));
        if (free && Math.floor(now / 500) % 2) { ctx.fillStyle = '#fff8c0'; ctx.fillRect(b.x + b.w - 4, b.y + 3, 1, 3); ctx.fillRect(b.x + b.w - 5, b.y + 4, 3, 1); }
      }
    }
    // bande d'aide en bas de la vue
    let info = null;
    if (this.placing) info = this.info || `${BUILDINGS[this.placing].name.toUpperCase()} : ${this.touch ? 'TOUCHE LA CARTE (LE BOUTON ANNULE)' : 'CLIC SUR LA CARTE - CLIC DROIT : ANNULER'}`;
    else if (this.armed) info = this.touch ? 'CHARGE : TOUCHE LA CARTE (EN COMBATTANT EN CHEMIN)' : 'CHARGE : CLIC SUR LA CARTE (EN COMBATTANT EN CHEMIN) - CLIC DROIT : ANNULER';
    this.info = null;
    if (!this.alive && this.t >= 0) info = 'TON FORT EST TOMBÉ : TU REGARDES LA FIN DE LA PARTIE';
    if (info) {
      ctx.fillStyle = 'rgba(26,15,10,0.8)'; ctx.fillRect(0, top - 11, W, 11);
      canvasText(ctx, info, W / 2, top - 9, { color: '#fdf6e0' });
    }
    // terrain survolé : petite étiquette discrète en haut à droite de la vue
    if (this.terrHint && !info) {
      const wd = rd(tw(this.terrHint)) + 6;
      ctx.fillStyle = 'rgba(26,15,10,0.55)'; ctx.fillRect(W - wd - 2, TOP + 2, wd, 10);
      canvasText(ctx, this.terrHint, W - 5, TOP + 4, { align: 'right', color: '#c8b898' });
    }
  }

  // fiche d'un type d'unité choisi (nombre, galons), ou d'une seule unité (PV, expérience)
  drawCard(ctx, b) {
    const units = this.selUnits().filter((u) => u.kind === b.id);
    const spr = unitSprite(b.id, this.color(this.me), 0, this.techOf(this.me, b.id), b.single ? units[0]?.rank : 0);
    const best = units.reduce((m, u) => Math.max(m, u.rank), 0);
    if (!b.single) {
      ctx.drawImage(spr, rd(b.x + b.w / 2 - spr.ox), rd(b.y + 21 - spr.oy));
      canvasText(ctx, `X${units.length}`, b.x + b.w / 2, b.y + 24, { color: '#fdf6e0' });
      chevrons(ctx, b.x + 3, b.y + 4, best);
      pips(ctx, b.x + b.w - 4, b.y + 3, this.techOf(this.me, b.id), TECH.max);
      return;
    }
    const u = units[0];
    if (!u) return;
    ctx.drawImage(spr, rd(b.x + 12 - spr.ox), rd(b.y + 24 - spr.oy));
    chevrons(ctx, b.x + 4, b.y + 29, u.rank);
    const st = uStats(u.kind, this.techOf(this.me, u.kind), u.rank);
    const x = b.x + 25;
    canvasText(ctx, `${UNITS[u.kind].name.toUpperCase()} - ${RANK_NAME[u.rank]}`, x, b.y + 2, { align: 'left', color: '#f8d070' });
    canvasText(ctx, 'PV', x, b.y + 12, { align: 'left', color: '#c8b898' });
    this.bar(ctx, x + 14, b.y + 14, 50, u.hp / st.hp, u.hp / st.hp > 0.4 ? '#7ac860' : '#f0705a');
    canvasText(ctx, `${Math.ceil(u.hp)}/${st.hp}`, x + 68, b.y + 12, { align: 'left', color: '#fdf6e0' });
    const next = RANKS.xp[u.rank + 1];
    canvasText(ctx, 'XP', x, b.y + 22, { align: 'left', color: '#c8b898' });
    if (next != null) {
      const prev = RANKS.xp[u.rank];
      this.bar(ctx, x + 14, b.y + 24, 50, (u.xp - prev) / (next - prev), '#f8d070');
      canvasText(ctx, `${u.xp}/${next}`, x + 68, b.y + 22, { align: 'left', color: '#fdf6e0' });
    } else canvasText(ctx, 'AU SOMMET', x + 14, b.y + 22, { align: 'left', color: '#fff0a0' });
  }

  // fiche du bâtiment choisi : nom, niveau, PV, et ce qu'il produit
  drawBldInfo(ctx, b, now) {
    const spr = buildingSprite(b.kind, this.color(b.owner), b.lv || 1);
    ctx.save(); ctx.beginPath(); ctx.rect(2, PY + 3, 28, 33); ctx.clip();
    ctx.drawImage(spr, rd(16 - spr.ox), rd(PY + 35 - spr.oy));
    ctx.restore();
    const name = b.kind === 'fort' ? 'FORT' : BUILDINGS[b.kind].name.toUpperCase();
    canvasText(ctx, name, 32, PY + 3, { align: 'left', color: '#f8d070' });
    if (b.owner !== this.me) canvasText(ctx, this.name(b.owner).toUpperCase().slice(0, 11), 32, PY + 13, { align: 'left', color: this.color(b.owner) });
    else {
      canvasText(ctx, 'NIV.', 32, PY + 13, { align: 'left', color: '#c8b898' });
      for (let k = 0; k < LV.max; k++) { ctx.fillStyle = OUT; ctx.fillRect(54 + k * 5, PY + 13, 4, 4); ctx.fillStyle = k < b.lv ? '#f8d070' : '#4e3220'; ctx.fillRect(55 + k * 5, PY + 14, 2, 2); }
    }
    this.bar(ctx, 32, PY + 25, 58, b.hp / b.maxHp, b.hp / b.maxHp > 0.35 ? '#7ac860' : '#f0705a');
    canvasText(ctx, `${Math.ceil(b.hp)}/${b.maxHp}`, 32, PY + 28, { align: 'left', color: '#e8d8b8' });
    if (b.owner !== this.me) return;
    // à droite des boutons : ce que fait le bâtiment
    const lines = this.statLines(b);
    const x0 = b.kind === 'fort' || b.kind === 'stable' ? 192 : 140;
    if (b.kind !== 'armory') lines.forEach((l, i) => canvasText(ctx, l, x0, PY + 4 + i * 10, { align: 'left', color: i ? '#c8b898' : '#e8d8b8' }));
  }

  // pactes : une ligne par joueur, son nom (et ses alliés), puis où l'on en est avec lui ; les boutons suivent
  drawDiploRows(ctx) {
    const others = this.others();
    others.forEach((j, k) => {
      const y = this.panelY + 2 + k * 12, st = this.dState(j), col = this.color(j);
      ctx.fillStyle = OUT; ctx.fillRect(2, y + 2, 7, 7);
      ctx.fillStyle = col; ctx.fillRect(3, y + 3, 5, 5);
      canvasText(ctx, this.name(j).toUpperCase().slice(0, 7), 11, y + 2, { align: 'left', color: st === 'gone' ? '#7a6a5a' : col });
      // ses alliés (autres que moi) : de petits carrés à leurs couleurs
      let ax = 49;
      for (const o of this.state.players.keys()) {
        if (o === this.me || o === j || !this.allied(j, o) || !this.inPlay(o) || ax > 54) continue;
        ctx.fillStyle = OUT; ctx.fillRect(ax - 1, y + 3, 5, 5);
        ctx.fillStyle = this.color(o); ctx.fillRect(ax, y + 4, 3, 3);
        ax += 5;
      }
      const weak = this.weakS(j);
      const [txt, tc] = st === 'gone' ? [this.state.players[j]?.left ? 'PARTI' : 'ÉLIMINÉ', '#7a6a5a']
        : weak ? [`TRAHI ${weak}S`, WEAK_COL] : st === 'ally' ? ['ALLIÉ', '#8ad870'] : st === 'in' ? ['PROPOSE !', '#f8d070']
          : st === 'out' ? ['ATTENTE…', '#c8b898'] : ['ENNEMI', '#e08a7a'];
      canvasText(ctx, txt, 60, y + 2, { align: 'left', color: tc });
    });
    if (others.length === 1) {
      canvasText(ctx, 'À DEUX : PAS D\'ALLIANCE, UN SEUL FORT GAGNE', 4, PY + 16, { align: 'left', color: '#a89a8a' });
      canvasText(ctx, 'DONS ET MESSAGES RESTENT POSSIBLES', 4, PY + 26, { align: 'left', color: '#a89a8a' });
    }
  }

  // menu des messages tout faits, au-dessus du panneau
  drawSayMenu(ctx) {
    const items = this.sayItems();
    if (!items.length) return;
    const x = items[0].x, y = items[0].y - 11, w = items[0].bw, h = items.length * 10 + 12;
    ctx.fillStyle = OUT; ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
    ctx.fillStyle = '#2a1a10'; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#6a4426'; ctx.fillRect(x, y, w, 1);
    canvasText(ctx, `À ${this.name(this.sayTo).toUpperCase().slice(0, 14)} :`, x + 4, y + 2, { align: 'left', color: this.color(this.sayTo) });
    const m = this.mouse;
    for (const it of items) {
      const hov = !this.touch && m.in && m.x >= it.x && m.x < it.x + it.bw && m.y >= it.y && m.y < it.y + it.h;
      if (hov) { ctx.fillStyle = '#6a4a2a'; ctx.fillRect(it.x + 1, it.y, it.bw - 2, it.h); }
      canvasText(ctx, WORDS[it.w].text, it.x + 4, it.y + 1, { align: 'left', color: hov ? '#fdf6e0' : '#e8d8b8' });
    }
  }

  // ce que fait un bâtiment à son niveau (lv)
  statLines(b, lv = b.lv) {
    const k = LV.prod[lv - 1];
    if (b.kind === 'fort') { const g = guardOf('fort', lv); return [`TIR ${fmt(g.dps)}/S`, `PORTÉE ${g.range}`, `OR +${fmt(RTS.fortIncome * k)}/S`]; }
    if (b.kind === 'tower') { const g = guardOf('tower', lv); return [`TIR ${fmt(g.dps)}/S`, `PORTÉE ${g.range}`]; }
    if (b.kind === 'mine') {
      const v = this.world.veins.find((x) => x.x === b.x && x.y === b.y);
      return [`OR +${fmt((v ? VEINS[v.kind].rate : 0) * k)}/S`, v ? VEINS[v.kind].name.toUpperCase() : ''];
    }
    if (b.kind === 'ranch') return [`VIVRES +${fmt(BUILDINGS.ranch.food * k)}/S`, `+${RTS.popRanch + LV.pop[lv - 1]} PLACES DANS L'ARMÉE`];
    if (b.kind === 'farm') return [`OR +${fmt(BUILDINGS.farm.gold * k)}/S`, `VIVRES +${fmt(BUILDINGS.farm.food * k)}/S`];
    return lv > 1 ? ['RECRUES', `-${Math.round((1 - LV.train[lv - 1]) * 100)} % DE TEMPS`] : ['RECRUTE', 'ET ENTRAÎNE'];
  }

  // mini-carte : terrain, filons libres, bâtiments, unités, cadre de la vue, alerte
  drawMini(ctx, now) {
    const { x: X, y: Y, w: MWp, h: MHp } = MM;
    const kx = MWp / MW, ky = MHp / MH;
    ctx.fillStyle = OUT; ctx.fillRect(X - 1, Y - 1, MWp + 2, MHp + 2);
    ctx.drawImage(this.mini, X, Y);
    for (const v of this.world.veins) {
      if (this.veinsTaken.has(v.id)) continue;
      ctx.fillStyle = v.kind === 'gold' ? '#fff0a0' : '#e8a070';
      ctx.fillRect(X + rd((v.x + 1) * TS * kx), Y + rd((v.y + 1) * TS * ky), 1, 1);
    }
    for (const b of this.snapB.blds) {
      const s = b.kind === 'fort' ? 3 : 2;
      ctx.fillStyle = OUT; ctx.fillRect(X + rd(bCenter(b).x * kx) - 1, Y + rd(bCenter(b).y * ky) - 1, s + 1, s + 1);
      ctx.fillStyle = this.color(b.owner); ctx.fillRect(X + rd(bCenter(b).x * kx) - 1, Y + rd(bCenter(b).y * ky) - 1, s, s);
    }
    for (const u of this.drawUnits || []) { ctx.fillStyle = this.sel.has(u.id) ? '#fdf6e0' : this.color(u.owner); ctx.fillRect(X + rd(u.x * kx), Y + rd(u.y * ky), 1, 1); }
    if (this.alert && now - this.alert.at < 4000 && Math.floor(now / 250) % 2) {
      ctx.fillStyle = '#f0705a';
      const ax = X + rd(this.alert.x * kx), ay = Y + rd(this.alert.y * ky);
      ctx.fillRect(ax - 3, ay, 7, 1); ctx.fillRect(ax, ay - 3, 1, 7);
    }
    // cadre de la vue
    ctx.fillStyle = '#fdf6e0';
    const vx = X + rd(this.cx * kx), vy = Y + rd(this.cy * ky), vw = rd(Math.min(MW, this.vw) * kx), vh = rd(Math.min(MH, this.vh) * ky);
    ctx.fillRect(vx, vy, vw, 1); ctx.fillRect(vx, vy + vh - 1, vw, 1); ctx.fillRect(vx, vy, 1, vh); ctx.fillRect(vx + vw - 1, vy, 1, vh);
  }

  // bulle d'aide du bouton survolé (au doigt : du dernier bouton touché)
  drawTip(ctx) {
    const b = this.hoverBtn || (this.tip && this.now < this.tip.until ? this.tip.b : null);
    if (!b || this.sayTo != null) return;
    const lines = []; // [segments] ; segment : texte ou { icon }
    let title, status = null, stCol = '#f0705a';
    const [gold, food, , army] = this.my;
    const selN = this.sel.size;
    const selB = this.selBld();
    if (b.type === 'build') {
      const B = BUILDINGS[b.id];
      const n = countOf(this.allBlds(), this.me, b.id), cost = this.cost(b.id);
      title = `${B.name.toUpperCase()} (${BUILD_KEYS[BUILD_IDS.indexOf(b.id)][0]})`;
      lines.push([{ icon: 'gold' }, `${cost}`, { icon: 'clock' }, `${B.time / 1000} S`, `   ${n}/${B.max}`]);
      lines.push(...infoLines(b.id).map((l) => [l]));
      if (B.step && n < B.max) lines.push([`LE SUIVANT : +${B.step} OR`]);
      status = n >= B.max ? 'MAXIMUM ATTEINT' : this.site() ? 'UN SEUL CHANTIER À LA FOIS' : gold < cost ? `IL MANQUE ${cost - gold} OR` : null;
    } else if (b.type === 'unit') {
      const U = UNITS[b.id];
      const lv = this.techOf(this.me, b.id);
      title = `${U.name.toUpperCase()} (${UNIT_KEYS[UNIT_IDS.indexOf(b.id)][0].toUpperCase()})`;
      const time = selB && selB.kind === U.from ? (U.time * LV.train[selB.lv - 1]) / 1000 : U.time / 1000;
      lines.push([{ icon: 'gold' }, `${U.gold}`, { icon: 'food' }, `${U.food}`, { icon: 'clock' }, `${fmt(time)} S`]);
      lines.push(...infoLines(b.id).map((l) => [l]));
      if (lv) lines.push([`ENTRAÎNEMENT : ${U.tech[lv - 1].toUpperCase()}`]);
      status = !this.hasReady(U.from) ? (U.from === 'stable' ? 'IL FAUT UNE ÉCURIE' : 'IL FAUT UNE ARMURERIE')
        : army + this.queuedAll() >= this.pop() ? 'ARMÉE PLEINE : BÂTIS UN RANCH'
          : gold < U.gold ? `IL MANQUE ${U.gold - gold} OR` : food < U.food ? `IL MANQUE ${U.food - food} VIVRES` : null;
      if (status === 'ARMÉE PLEINE : BÂTIS UN RANCH') stCol = '#f8d070';
    } else if (b.type === 'tech') {
      const U = UNITS[b.id], lv = this.techOf(this.me, b.id);
      title = lv >= TECH.max ? `${PLURAL[b.id]} : ENTRAÎNÉS` : `ENTRAÎNEMENT ${lv + 1} : ${U.tech[lv].toUpperCase()}`;
      if (lv < TECH.max) {
        const [g, f, ms] = TECH.cost[lv];
        lines.push([{ icon: 'gold' }, `${g}`, { icon: 'food' }, `${f}`, { icon: 'clock' }, `${ms / 1000} S`]);
        lines.push([`${PLURAL[b.id]} : +${Math.round(TECH.hp * 100)} % DE PV ET DE DÉGÂTS`]);
        if (TECH_EXTRA[b.id]) lines.push([TECH_EXTRA[b.id]]);
        lines.push(['MÊME CEUX DÉJÀ RECRUTÉS']);
      }
      status = lv >= TECH.max ? null : this.techBlock(b.id);
    } else if (b.type === 'up') {
      const nx = selB && upNext(selB);
      const name = selB?.kind === 'fort' ? 'FORT' : BUILDINGS[selB?.kind]?.name.toUpperCase() || '';
      title = nx ? `AMÉLIORER : ${name} NIV. ${selB.lv + 1} (U)` : `${name} : NIVEAU MAXIMAL`;
      if (nx) {
        lines.push([{ icon: 'gold' }, `${nx[0]}`, { icon: 'clock' }, `${nx[1] / 1000} S`]);
        if (selB.kind === 'stable' || selB.kind === 'armory') lines.push([`RECRUES ${Math.round((1 - LV.train[selB.lv]) * 100)} % PLUS RAPIDES`]);
        else {
          const now2 = this.statLines(selB), next = this.statLines(selB, selB.lv + 1);
          next.forEach((l, i) => { if (l !== now2[i] && l) lines.push([l]); });
          if (selB.kind === 'fort') lines.push([`RECRUES ${Math.round((1 - LV.train[selB.lv]) * 100)} % PLUS RAPIDES`]);
        }
        lines.push([`PV ${selB.maxHp} -> ${maxHpOf(selB.kind, selB.lv + 1)}`]);
        if (UNIT_IDS.some((k) => UNITS[k].from === selB.kind) && selB.lv + 1 <= TECH.max) lines.push([`PERMET L'ENTRAÎNEMENT ${selB.lv + 1}`]);
        status = this.upBlock(selB);
        if (status === 'AMÉLIORATION EN COURS') stCol = '#8ad870';
      }
    } else if (b.type === 'defend') {
      title = 'DÉFENDRE LE FORT (D)';
      lines.push([selN ? 'LES UNITÉS CHOISIES RENTRENT AU FORT' : 'TOUTE TON ARMÉE RENTRE AU FORT']);
    } else if (b.type === 'all') {
      title = 'TOUTE L\'ARMÉE (T)';
      lines.push(['CHOISIR TOUTES TES UNITÉS']);
      if (!this.touch) lines.push(['DOUBLE-CLIC : TOUTES CELLES DE CE TYPE']);
    } else if (b.type === 'cmd') {
      const [label, key] = CMDS[b.id];
      title = `${label} (${key.toUpperCase()})`;
      lines.push([{
        amove: 'ELLES Y VONT EN TIRANT SUR TOUT CE QU\'ELLES CROISENT',
        hold: 'ELLES NE BOUGENT PLUS ET TIRENT À PORTÉE',
        stop: 'ELLES S\'ARRÊTENT ET GARDENT LA PLACE',
        clear: 'PLUS AUCUNE UNITÉ CHOISIE',
      }[b.id]]);
      if (b.id === 'amove') lines.push([this.touch ? 'PUIS TOUCHE LA CARTE' : 'PUIS CLIC SUR LA CARTE (OU MAJ + CLIC DROIT)']);
    } else if (b.type === 'card') {
      const n = this.selUnits().filter((u) => u.kind === b.id).length;
      title = `${b.single ? UNITS[b.id].name.toUpperCase() : PLURAL[b.id]} X${n}`;
      lines.push([b.single ? 'CLIC : LA RETROUVER SUR LA CARTE' : 'CLIC : NE GARDER QUE CEUX-LÀ']);
      if (!b.single && !this.touch) lines.push(['MAJ + CLIC : LES RETIRER']);
      lines.push([`GALONS : ${RANK_NAME.slice(1).join(', ')}`]);
    } else if (b.type === 'diplo') {
      title = `PACTES (${this.touch ? 'BOUTON DU HAUT' : 'P'})`;
      lines.push(['ALLIANCE : VOS ARMÉES NE SE TIRENT PLUS DESSUS']);
      lines.push([{ icon: 'weak' }, `TRAHISON : LA VICTIME FAIBLIT ${DIPLO.betray / 1000} S`]);
      lines.push([{ icon: 'gold' }, { icon: 'food' }, { icon: 'talk' }, 'DONS ET MESSAGES']);
      const n = this.offersToMe();
      if (n) { status = `${n} PROPOSITION${n > 1 ? 'S' : ''} D'ALLIANCE !`; stCol = '#8ad870'; }
    } else if (b.type === 'pact' || b.type === 'refuse') {
      const who = this.name(b.to).toUpperCase();
      if (b.type === 'refuse') title = `REFUSER L'ALLIANCE DE ${who}`;
      else if (b.op === 'accept') {
        title = `ACCEPTER L'ALLIANCE DE ${who}`;
        lines.push(['VOS ARMÉES NE SE TIRENT PLUS DESSUS']);
        lines.push(['UN SEUL GAGNANT : PLUS QUE DES ALLIÉS, ELLE TOMBE']);
      } else if (b.op === 'betray') {
        title = `TRAHIR ${who}`;
        lines.push(['L\'ALLIANCE EST ROMPUE SUR-LE-CHAMP, ET PENDANT 1 MIN :']);
        lines.push([{ icon: 'weak' }, `SES UNITÉS FONT ${pct(DIPLO.weak.dps)} % DE DÉGÂTS EN MOINS`]);
        lines.push([`ET EN PRENNENT ${pct(DIPLO.weak.hurt)} % DE PLUS`]);
        lines.push([`SES BÂTIMENTS PRENNENT ${pct(DIPLO.weak.bld)} % DE DÉGÂTS EN PLUS`]);
        status = this.touch ? 'TOUCHE DEUX FOIS POUR TRAHIR' : 'CLIQUE DEUX FOIS POUR TRAHIR';
        stCol = WEAK_COL;
      } else {
        title = `PROPOSER UNE ALLIANCE À ${who}`;
        lines.push(['VOS ARMÉES NE SE TIRENT PLUS DESSUS']);
        lines.push(['UN SEUL GAGNANT : PLUS QUE DES ALLIÉS, ELLE TOMBE']);
        lines.push([`SANS RÉPONSE, ELLE TOMBE AU BOUT DE ${DIPLO.offerMs / 1000} S`]);
        status = !this.canPact() ? 'À DEUX : UN SEUL FORT RESTERA DEBOUT' : this.allyAll(b.to) ? 'VOUS SERIEZ TOUS ALLIÉS : IL FAUT UN ENNEMI COMMUN'
          : this.dState(b.to) === 'out' ? 'EN ATTENTE DE SA RÉPONSE' : null;
        if (status === 'EN ATTENTE DE SA RÉPONSE') stCol = '#f8d070';
      }
    } else if (b.type === 'gift') {
      const n = DIPLO.gift[b.res], what = b.res === 'gold' ? 'OR' : 'VIVRES';
      title = `DONNER ${n} ${what} À ${this.name(b.to).toUpperCase()}`;
      lines.push(['POUR AIDER UN ALLIÉ… OU AMADOUER UN ENNEMI']);
      status = (b.res === 'gold' ? gold : food) < n ? `IL TE MANQUE ${n - (b.res === 'gold' ? gold : food)} ${what}` : null;
    } else if (b.type === 'say') {
      title = `MESSAGE À ${this.name(b.to).toUpperCase()}`;
      lines.push(['DES MOTS TOUT FAITS (ENTRÉE : LE CHAT)']);
      lines.push(['AU SECOURS : TON FORT CLIGNOTE SUR SA CARTE']);
      lines.push(['ATTAQUONS ENSEMBLE : NOMME LE FORT QUE TU ATTAQUES']);
      lines.push(['UN BOT ALLIÉ RÉPOND À L\'APPEL']);
    } else if (this.allied(this.me, b.target)) {
      title = `ALLIÉ : ${this.name(b.target).toUpperCase()}`;
      lines.push(['VOS ARMÉES NE SE TIRENT PAS DESSUS']);
      lines.push(['POUR L\'ATTAQUER : ROMPS L\'ALLIANCE (PACTES)']);
    } else {
      const alive = !!this.snapB.P[b.target]?.[2];
      title = `ATTAQUER ${this.name(b.target).toUpperCase()}`;
      lines.push([!alive ? 'DÉJÀ ÉLIMINÉ' : selN ? 'LES UNITÉS CHOISIES MARCHENT SUR SON FORT' : 'TON ARMÉE MARCHE SUR SON FORT']);
      if (alive && this.weakS(b.target)) lines.push([{ icon: 'weak' }, `TRAHI : AFFAIBLI ENCORE ${this.weakS(b.target)} S`]);
    }
    if (status) lines.push([status]);
    const segW = (s) => (typeof s === 'string' ? tw(s) + 3 : 11);
    const w = rd(Math.max(tw(title), ...lines.map((l) => l.reduce((a, s) => a + segW(s), 0)))) + 10;
    const h = 13 + lines.length * 9;
    const x = clamp(rd(b.x + b.w / 2 - w / 2), 1, W - w - 1), y = b.y < TOP ? TOP + 2 : this.panelY - h - 2;
    ctx.fillStyle = OUT; ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
    ctx.fillStyle = '#2a1a10'; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#6a4426'; ctx.fillRect(x, y, w, 1);
    canvasText(ctx, title, x + 5, y + 3, { align: 'left', color: '#f8d070' });
    lines.forEach((l, i) => {
      let lx = x + 5;
      const ly = y + 13 + i * 9;
      const last = status && i === lines.length - 1;
      for (const s of l) {
        if (typeof s === 'string') { canvasText(ctx, s, lx, ly, { align: 'left', color: last ? stCol : '#e8d8b8' }); lx += tw(s) + 3; } else { ctx.drawImage(icon(s.icon), lx, ly - 1); lx += 11; }
      }
    });
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
    ctx.fillStyle = 'rgba(26,15,10,0.75)'; ctx.fillRect(0, TOP + 4, W, 13);
    canvasText(ctx, b.text, W / 2, TOP + 7, { color: b.col });
    ctx.globalAlpha = 1;
  }
}
