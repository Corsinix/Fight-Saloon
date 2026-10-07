// Mondes des mini-jeux. Tout est tiré d'une graine envoyée par l'hôte : chaque navigateur
// recalcule exactement les mêmes cibles et les mêmes animaux, seuls les coups passent par le réseau.
import { SKIN, HAIR_COLORS, CLOTH_COLORS } from './data.js';

export const W = 384, H = 216;
// Début de partie : cinématique d'ouverture (cutscene.js), puis les règles et le compte à rebours
export const CUT_MS = 5000;
export const HELP_MS = 3500;
export const COUNTDOWN = CUT_MS + HELP_MS;
export const PLAYER_COLORS = ['#f0705a', '#7ab0f0', '#b8e070', '#f8d070', '#c890f0', '#60d8c8'];
export const MAX_PLAYERS = 6;

export const MODES = {
  roulette: { name: 'Roulette', sub: 'Le duel au fusil à pompe', min: 2, max: 2 },
  shooter: { name: 'Fusillade', sub: 'Rail shooter : la gare, les abords, la ville puis le saloon', min: 2, max: 6, duration: 150000 },
  lasso: { name: 'Rodéo au lasso', sub: 'Au galop, attrape le plus de bêtes', min: 2, max: 6, duration: 60000 },
  duel: { name: 'Duel', sub: 'Le plus rapide à dégainer gagne', min: 2, max: 2, duration: 180000, unit: 'manches' },
  charlie: { name: 'Où est Charlie ?', sub: 'Repère-le dans la foule de la ville', min: 2, max: 6, duration: 260000 },
  // 2 manches de 45 s + 4 s de changement de camp (fortgame.js)
  fort: { name: 'Assaut du fort', sub: 'En équipes : attaque le fort, puis défends-le', min: 2, max: 6, duration: 94000 },
  // règles et arbitre dans wagongame.js
  wagon: { name: 'Défends la roulotte', sub: 'Escorte le chariot jusqu’à Red Rock malgré les hors-la-loi', min: 2, max: 6, duration: 90000 },
  // en manches, chacun son tour : la partie s'arrête après la dernière manche (pintegame.js)
  pinte: { name: 'La pinte', sub: 'Fais glisser ta chope au ras du bout du comptoir', min: 2, max: 6, duration: 900000 },
  // règles, parcours et arbitre dans minegame.js
  // course de 8 étapes ; s'arrête quand tout le monde est sorti, ou au bout de 2 min 15
  mine: { name: 'La mine', sub: 'Course en wagonnet : accélère, aiguille, sors le premier', min: 2, max: 6, duration: 135000 },
  // règles, piste et arbitre dans coursegame.js ; s'arrête quand tout le monde est arrivé, ou au bout de 90 s
  course: { name: 'La course de chevaux', sub: 'Saute les obstacles, cravache… sans épuiser ton cheval', min: 2, max: 6, duration: 90000 },
  // mini-RTS : carte, règles, arbitre et bots dans rtsgame.js
  // pas de limite de temps : la partie dure jusqu'au dernier fort debout (ou à la dernière alliance) ; 24 h pour l'horloge commune
  rts: { name: 'Conquête de l’Ouest', sub: 'Bâtis ton fort, recrute, fais et défais les alliances', min: 2, max: 6, duration: 86400000 },
  // FPS façon Doom dans la ville (fausse 3D) : carte, armes, règles, arbitre et bots dans fpsgame.js
  fps: { name: 'Règlement de comptes', sub: 'FPS en ville : choisis tes armes, abats bandits et rivaux', min: 2, max: 6, duration: 240000 },
  // la même ville sans bandits, entre joueurs (ou contre les bots) : seuls les frags comptent
  fpsdm: { name: 'Mort ou vif', sub: 'FPS entre joueurs, sans bandits : seuls les frags comptent', min: 2, max: 6, duration: 240000, unit: 'frags' },
};

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const smooth = (k) => (k <= 0 ? 0 : k >= 1 ? 1 : k * k * (3 - 2 * k));

// ================================================================ fusillade

export const GROUND = 166; // haut du trottoir en planches
export const STREET_W = 2592, SALOON_W = 768, STATION_W = 1152, EDGE_W = 1536;
// on arrive en train à la gare, on traverse les abords de la ville (cimetière, ranch ou mine, tiré au sort),
// puis la grand-rue, et on entre dans le saloon (qui ferme la rue) où attend El Diablo
export const STATION_START = 0, STATION_END = 23000, EDGE_START = 24000, EDGE_END = 56000;
export const STREET_START = 57000, STREET_END = 108000, SALOON_START = 109000;
export const BOSS_T0 = 130000;
// fondus au noir entre deux sections
export const FADES = [[STATION_END, EDGE_START], [EDGE_END, STREET_START], [STREET_END, SALOON_START]];

// Le repaire d'El Diablo, au bout de la grand-rue (la dernière section, 'saloon' dans le code) : le saloon (il arpente le
// balcon), la mine abandonnée (il roule en wagonnet sur la passerelle et lance de la dynamite) ou la poursuite à cheval
// (il s'enfuit au galop dans le désert, sa bande nous serre de près). Tiré de la graine (?lair=mine dans l'adresse :
// imposé, pour l'essayer ; en ligne, chacun doit avoir la même adresse).
export const LAIRS = { saloon: { name: 'LE SALOON' }, mine: { name: 'LA MINE ABANDONNÉE' }, chase: { name: 'LA POURSUITE' } };
const FORCED_LAIR = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('lair') : null;
export function lairOf(seed) {
  const R = rng((seed ^ 0x510e527f) >>> 0); // tirage à part : le reste du monde ne bouge pas
  const keys = Object.keys(LAIRS), drawn = keys[Math.floor(R() * keys.length)];
  return LAIRS[FORCED_LAIR] ? FORCED_LAIR : drawn;
}
// le repaire de la partie en cours : posé par shooterWorld (une seule fusillade à la fois par page), lu par camAt et bossX
let LAIR = 'saloon';
export const lairNow = () => LAIR;

// Le "rail" : position de la caméra dans le temps, avec des arrêts pendant les vagues.
const shift = (start, keys) => keys.map(([t, x]) => [t + start, x]);
const CAM = {
  station: [[STATION_START, 0], [5000, 0], [8500, 384], [14500, 384], [18000, 768], [STATION_END, 768]],
  edge: shift(EDGE_START, [[0, 0], [4500, 0], [8000, 384], [14000, 384], [17500, 768], [23500, 768], [27000, 1152], [EDGE_END - EDGE_START, 1152]]),
  street: shift(STREET_START, [[0, 0], [3000, 0], [6500, 250], [12500, 250], [16000, 630], [22500, 630], [26000, 1030], [32000, 1030], [35500, 1440], [41500, 1440], [45000, 1824], [48500, 2208], [STREET_END - STREET_START, 2208]]),
  saloon: shift(SALOON_START, [[0, 0], [11000, 0], [15000, 384], [999999, 384]]),
  // la poursuite : la caméra ne bouge pas dans la section, c'est le décor qui défile (le galop)
  chase: [[SALOON_START, 0]],
};

export function camAt(t) {
  const sec = t < (STATION_END + EDGE_START) / 2 ? 'station' : t < (EDGE_END + STREET_START) / 2 ? 'edge' : t < (STREET_END + SALOON_START) / 2 ? 'street' : 'saloon';
  const keys = sec === 'saloon' && LAIR === 'chase' ? CAM.chase : CAM[sec];
  if (t <= keys[0][0]) return { sec, x: keys[0][1] };
  for (let i = 1; i < keys.length; i++) {
    const [t1, x1] = keys[i];
    if (t <= t1) {
      const [t0, x0] = keys[i - 1];
      return { sec, x: x0 + (x1 - x0) * smooth((t - t0) / (t1 - t0)) };
    }
  }
  return { sec, x: keys[keys.length - 1][1] };
}

// Catalogue des façades de la grand-rue. À chaque partie, la graine tire une succession différente :
// choix et ordre des bâtiments, largeur, hauteur, couleur, fronton, auvent, ruelles et abris.
// [min, max] = tiré au hasard ; roof : flat (corniche), step (fronton à gradins), arch (fronton arrondi), gable (pignon).
export const KINDS = {
  stable: { sign: 'ECURIE', w: [160, 190], top: [58, 64], up: [1, 1], upY: 72, upH: 30, upW: 32, door: 50, low: 0, roof: ['gable'], cols: ['#8a4a2a', '#7a4428', '#965a30'] },
  bank: { sign: 'BANQUE', w: [150, 180], top: [36, 44], up: [2, 3], door: 34, low: 2, roof: ['flat', 'arch'], cols: ['#b89a6a', '#a89c88', '#c4a87a'] },
  store: { sign: 'BAZAR', w: [160, 200], top: [44, 52], up: [2, 3], door: 34, low: 2, awning: 1, roof: ['flat', 'step'], cols: ['#6a8a8a', '#7a8a6a', '#8a7a5a'] },
  hotel: { sign: 'HOTEL', w: [190, 226], top: [24, 32], up: [3, 4], door: 34, low: 2, balcony: 1, roof: ['flat', 'step'], cols: ['#a8584a', '#8a5a6a', '#b0684a'] },
  sheriff: { sign: 'SHERIF', w: [140, 170], top: [76, 84], up: [0, 0], door: 34, low: 1, roof: ['flat'], bars: true, cols: ['#9a7a4a', '#8a6a44'] },
  barber: { sign: 'BARBIER', w: [130, 150], top: [66, 74], up: [0, 0], door: 34, low: 1, awning: 1, roof: ['flat', 'arch'], cols: ['#c8b48a', '#d0bca0'] },
  undertaker: { sign: 'CROQUE-MORT', w: [140, 160], top: [48, 56], up: [2, 2], door: 34, low: 1, roof: ['flat', 'step'], cols: ['#5a5450', '#4c4a52'] },
  post: { sign: 'TELEGRAPHE', w: [140, 160], top: [52, 56], up: [2, 2], door: 34, low: 1, awning: 0.6, roof: ['flat', 'arch'], cols: ['#7a6a9a', '#6a7a9a'] },
  church: { sign: null, w: [132, 150], top: [62, 66], up: [2, 2], upY: 70, upH: 34, upW: 16, door: 30, low: 0, roof: ['gable'], steeple: true, cols: ['#d8d0c0', '#e0d4c4', '#c8c4b8'] },
  jail: { sign: 'PRISON', w: [130, 160], top: [50, 56], up: [2, 2], upH: 28, door: 34, low: 1, roof: ['flat'], bars: true, cols: ['#8a8478', '#9a8a70'] },
  gunsmith: { sign: 'ARMURIER', w: [150, 170], top: [44, 52], up: [2, 2], door: 34, low: 2, roof: ['flat', 'step'], cols: ['#4a6a4a', '#5a5a3a', '#3a5a5a'] },
  doctor: { sign: 'DOCTEUR', w: [130, 150], top: [50, 56], up: [2, 2], door: 34, low: 1, awning: 0.5, roof: ['flat', 'arch'], cols: ['#8aa0b0', '#a0b0a0'] },
  smithy: { sign: 'FORGE', w: [150, 170], top: [60, 64], up: [0, 0], door: 54, low: 0, roof: ['gable'], cols: ['#6a5a4a', '#5a4a40'] },
  theater: { sign: 'THEATRE', w: [190, 220], top: [22, 28], up: [3, 3], door: 34, low: 2, roof: ['arch', 'step'], cols: ['#8a3a5a', '#6a3a6a'] },
  laundry: { sign: 'LAVERIE', w: [130, 150], top: [50, 56], up: [2, 2], door: 34, low: 1, awning: 1, roof: ['flat'], cols: ['#a8b8b8', '#b8c0c8'] },
};
// Le saloon ferme toujours la rue : c'est là qu'on entre pour affronter El Diablo.
const SALOON_B = { x: 2264, w: 264, kind: 'saloon', sign: 'SALOON', col: '#9a4a2a', top: 22, up: 3, door: 42, low: 2, balcony: true, roof: 'flat' };
const TOWN_START = 300, TOWN_END = SALOON_B.x - 14;

export const PROP_DIM = { wagon: [86, 40], fence: [90, 20], rock: [44, 26], hay: [40, 24], barrels: [34, 28], crates: [32, 32], trough: [46, 18] };
export const PROP_BASE = 200;

export function streetLayout(seed) {
  const R = rng((seed ^ 0x2545f491) >>> 0);
  const ri = (a, b) => a + Math.floor(R() * (b - a + 1));
  const pick = (arr) => arr[Math.floor(R() * arr.length)];
  const buildings = [];
  const used = new Set();
  let x = TOWN_START + ri(-6, 10);
  for (;;) {
    const room = TOWN_END - x;
    const fits = Object.keys(KINDS).filter((k) => KINDS[k].w[0] <= room && k !== buildings[buildings.length - 1]?.kind);
    if (!fits.length) break;
    const fresh = fits.filter((k) => !used.has(k));
    const kind = pick(fresh.length ? fresh : fits);
    const K = KINDS[kind];
    used.add(kind);
    const w = Math.min(room, ri(K.w[0], K.w[1]));
    buildings.push({
      x, w, kind, sign: K.sign, col: pick(K.cols), top: ri(K.top[0], K.top[1]), up: ri(K.up[0], K.up[1]),
      upY: K.upY, upH: K.upH, upW: K.upW, door: K.door, low: K.low, roof: pick(K.roof),
      awning: R() < (K.awning || 0), balcony: R() < (K.balcony || 0), steeple: !!K.steeple, bars: !!K.bars,
      side: R() < 0.5 ? 0.2 : 0.8, // un fronton occupe le milieu du toit : le bandit se poste sur le côté
    });
    x += w + (R() < 0.2 ? ri(36, 60) : ri(14, 26)); // de temps en temps, une ruelle
  }
  buildings.push({ ...SALOON_B });
  // château d'eau dans la plus grande ruelle, poteaux télégraphiques dans les autres
  const gaps = [];
  for (let i = 0; i < buildings.length - 1; i++) gaps.push([buildings[i].x + buildings[i].w, buildings[i + 1].x]);
  const big = gaps.reduce((m, g) => (g[1] - g[0] > m[1] - m[0] ? g : m), [0, 0]);
  const tower = big[1] - big[0] >= 58 ? Math.round((big[0] + big[1]) / 2) : null;
  const poles = [270];
  for (const [a, b] of gaps) {
    const mid = Math.round((a + b) / 2);
    if (b - a >= 12 && (tower == null || Math.abs(mid - tower) > 40) && R() < 0.7) poles.push(mid - 1);
  }
  poles.push(STREET_W - 18);
  // abris le long de la rue (chariots, tonneaux, caisses…) : hors de la ville, plutôt des rochers et des clôtures
  const props = [];
  let px = ri(14, 40);
  while (px < STREET_W - 60) {
    const kind = pick(px < 240 ? ['wagon', 'fence', 'rock', 'rock', 'hay'] : ['barrels', 'barrels', 'crates', 'crates', 'hay', 'trough', 'trough', 'wagon', 'fence']);
    const [w] = PROP_DIM[kind];
    if (px + w > STREET_W - 8) break;
    props.push({ x: px, kind });
    px += w + ri(56, 140);
  }
  return { seed, buildings, props, poles, tower };
}

// Géométrie d'une façade : partagée entre le dessin et les emplacements des cibles.
export function facade(b) {
  const windows = [];
  const uw = b.upW ?? 28, uh = b.upH ?? 36, uy = b.upY ?? 60;
  for (let i = 0; i < b.up; i++) {
    const cx = b.x + (b.w * (i + 1)) / (b.up + 1);
    windows.push({ x: Math.round(cx - uw / 2), y: uy, w: uw, h: uh, up: true });
  }
  const lows = b.low === 2 ? [0.2, 0.8] : b.low === 1 ? [0.27] : [];
  for (const f of lows) windows.push({ x: Math.round(b.x + b.w * f - 15), y: 116, w: 30, h: 32, up: false });
  const dc = b.low === 1 ? 0.68 : 0.5;
  const door = { x: Math.round(b.x + b.w * dc - b.door / 2), y: GROUND - 56, w: b.door, h: 56 };
  return { ...b, windows, door };
}

// Ouverture du clocher de l'église
export function belfry(b) {
  const cx = Math.round(b.x + b.w / 2);
  return { x: cx - 9, y: b.top - 34, w: 18, h: 18 };
}

// Intérieur du saloon
export const SAL = {
  balcony: 96,
  upperDoors: [40, 190, 330, 560, 690],
  rails: [120, 262, 452, 630],
  bar: { x: 30, w: 300, top: 146 },
  bars: [70, 140, 210, 280],
  piano: { x: 410, w: 76, top: 140 },
  tables: [{ x: 352, w: 46, top: 172 }, { x: 706, w: 46, top: 172 }],
  shelves: [112, 136],
};
// La mine abandonnée : mêmes emplacements que le saloon, sous d'autres noms (pour buildSpots) : balcony, la passerelle
// où roule le wagonnet d'El Diablo ; upperDoors, les galeries de l'étage ; rails, les poteaux de la passerelle (bandits
// penchés par-dessus) ; bar / bars, la trémie à minerai ; piano, un wagonnet renversé ; tables, les tas de minerai ;
// shelves, la planche aux bouteilles des mineurs, au-dessus de la trémie
export const MINE = {
  balcony: 92,
  upperDoors: [52, 196, 344, 548, 700],
  rails: [132, 276, 460, 626],
  bar: { x: 36, w: 288, top: 148 },
  bars: [76, 146, 216, 286],
  piano: { x: 420, w: 66, top: 152 },
  tables: [{ x: 348, w: 52, top: 170 }, { x: 690, w: 58, top: 168 }],
  shelves: [116, 138],
  lamps: [120, 300, 470, 650], // lanternes pendues aux étais (on les casse)
};
// La poursuite : El Diablo galope au loin (pieds en y), ses hommes dans les couloirs du premier plan
export const CHASE = { y: 150, scale: 1.6, lanes: [170, 180, 190, 200], speed: 0.42 };

// La gare : bâtiment à gauche, quai, train à quai (3 wagons et la locomotive) sur la voie du fond.
export const STA = {
  platform: 170, // haut du quai
  building: { x: 30, w: 300, top: 44, door: { x: 226, y: 112, w: 36, h: 58 }, windows: [{ x: 60, y: 118, w: 30, h: 32 }, { x: 140, y: 118, w: 30, h: 32 }, { x: 72, y: 62, w: 26, h: 30 }, { x: 262, y: 62, w: 26, h: 30 }] },
  tower: 352, // château d'eau
  wagons: [384, 576, 768].map((x) => ({ x, w: 176 })), // voitures de voyageurs
  loco: { x: 960, w: 184 },
  wagonTop: 72, wagonBase: 152, // toit et bas de caisse
  covers: [{ x: 120, kind: 'crates' }, { x: 420, kind: 'cart' }, { x: 650, kind: 'bags' }, { x: 868, kind: 'barrels' }, { x: 1066, kind: 'crates' }],
};
export const STA_COVER = { crates: [32, 32], cart: [52, 24], bags: [40, 18], barrels: [34, 28] };
// Composition du train, tirée de la graine : voitures de voyageurs, wagons de marchandises, wagons à bestiaux
// (au moins une voiture de voyageurs).
const WAGON_TYPES = ['passenger', 'boxcar', 'cattle'];
export function stationTrain(seed) {
  const R = rng((seed ^ 0x1b873593) >>> 0);
  const types = STA.wagons.map(() => WAGON_TYPES[Math.floor(R() * WAGON_TYPES.length)]);
  if (!types.includes('passenger')) types[Math.floor(R() * types.length)] = 'passenger';
  return STA.wagons.map((wg, k) => ({ ...wg, type: types[k] }));
}
// fenêtres et portes des wagons, fenêtre de la cabine
export function wagonOpenings(wg) {
  const mid = wg.x + wg.w / 2;
  // marchandises : grande porte coulissante ouverte au milieu, deux lucarnes d'aération
  if (wg.type === 'boxcar') return { wins: [{ x: wg.x + 24, y: 86, w: 22, h: 20 }, { x: wg.x + wg.w - 46, y: 86, w: 22, h: 20 }], doors: [{ x: mid - 22, y: 86, w: 44, h: 56 }] };
  // bestiaux : claire-voie (deux jours entre les lattes), porte au milieu
  if (wg.type === 'cattle') return { wins: [{ x: wg.x + 18, y: 90, w: 44, h: 18 }, { x: wg.x + wg.w - 62, y: 90, w: 44, h: 18 }], doors: [{ x: mid - 18, y: 84, w: 36, h: 58 }] };
  const wins = [];
  for (let k = 0; k < 4; k++) wins.push({ x: wg.x + 30 + k * 32, y: 88, w: 20, h: 22 });
  return { wins, doors: [{ x: wg.x + 6, y: 84, w: 16, h: 56 }, { x: wg.x + wg.w - 22, y: 84, w: 16, h: 56 }] };
}
export const locoCab = (L) => ({ x: L.x + 18, y: 70, w: 26, h: 26 });

// Les abords de Dusty Gulch, entre la gare et la grand-rue : une variante tirée au sort à chaque partie.
// houses : bâtiments (wins/door : bandits aux fenêtres et aux portes ; roof : bandit sur le toit, au-dessus de roof ;
// belfry : clocher ; sign : enseigne). slots : abris au premier plan, [x, sortes possibles].
// Les caméras s'arrêtent en x = 0, 384, 768 et 1152 : chaque écran a ses fenêtres, ses portes et ses abris.
export const EDGE_COVER = { ...PROP_DIM, stone: [24, 30], cross: [20, 36], tomb: [40, 22], hearse: [86, 40], ore: [40, 26], tnt: [32, 32] };
export const EDGES = {
  boothill: {
    name: 'BOOT HILL',
    houses: [
      { kind: 'gate', x: 18, w: 100, sign: { t: 'BOOT HILL', y: 80 } },
      { kind: 'chapel', x: 196, w: 150, top: 78, wins: [{ x: 212, y: 104, w: 18, h: 30 }, { x: 312, y: 104, w: 18, h: 30 }], door: { x: 256, y: 120, w: 30, h: 46 }, belfry: { x: 262, y: 36, w: 18, h: 20 } },
      { kind: 'tomb', x: 520, w: 110, top: 96, door: { x: 560, y: 122, w: 30, h: 44 }, roof: 80 },
      { kind: 'tree', x: 760 },
      { kind: 'grave', x: 950 },
      { kind: 'crypt', x: 1010, w: 90, top: 104, door: { x: 1041, y: 126, w: 28, h: 40 }, roof: 90 },
      { kind: 'lodge', x: 1190, w: 170, top: 52, sign: { t: 'FOSSOYEUR', y: 98 }, wins: [{ x: 1210, y: 64, w: 22, h: 28 }, { x: 1318, y: 64, w: 22, h: 28 }, { x: 1210, y: 116, w: 22, h: 30 }], door: { x: 1300, y: 116, w: 32, h: 50 }, roof: 52 },
    ],
    slots: [[136, ['stone', 'cross', 'tomb']], [410, ['stone', 'cross']], [660, ['tomb', 'stone']], [790, ['stone', 'cross']], [850, ['hearse']], [1110, ['cross', 'stone']], [1390, ['tomb', 'stone']], [1470, ['stone', 'cross']]],
  },
  ranch: {
    name: 'LE RANCH',
    houses: [
      { kind: 'gate', x: 18, w: 100, sign: { t: 'RANCH', y: 80 } },
      { kind: 'farm', x: 140, w: 210, top: 60, wins: [{ x: 160, y: 70, w: 22, h: 26 }, { x: 308, y: 70, w: 22, h: 26 }, { x: 160, y: 120, w: 24, h: 30 }, { x: 306, y: 120, w: 24, h: 30 }], door: { x: 230, y: 116, w: 30, h: 50 }, roof: 60 },
      { kind: 'windmill', x: 400, w: 44, top: 62, roof: 62 },
      { kind: 'barn', x: 800, w: 230, top: 78, wins: [{ x: 900, y: 48, w: 30, h: 24 }, { x: 820, y: 112, w: 20, h: 22 }, { x: 990, y: 112, w: 20, h: 22 }], door: { x: 885, y: 108, w: 60, h: 58 }, roof: 30 },
      { kind: 'silo', x: 1150, w: 40, top: 46 },
      { kind: 'shed', x: 1240, w: 150, top: 86, wins: [{ x: 1262, y: 104, w: 22, h: 26 }], door: { x: 1330, y: 112, w: 28, h: 54 }, roof: 86 },
    ],
    slots: [[60, ['hay', 'barrels', 'crates']], [470, ['fence']], [640, ['hay']], [700, ['trough']], [1046, ['hay', 'crates']], [1100, ['barrels']], [1176, ['barrels', 'crates']], [1410, ['wagon']]],
  },
  mine: {
    name: 'LA MINE D\'OR',
    houses: [
      { kind: 'office', x: 40, w: 170, top: 70, sign: { t: 'ESSAIS', y: 76 }, wins: [{ x: 58, y: 112, w: 22, h: 28 }, { x: 170, y: 112, w: 22, h: 28 }], door: { x: 110, y: 114, w: 30, h: 52 }, roof: 70 },
      { kind: 'tunnel', x: 466, w: 64, sign: { t: 'MINE', y: 80 }, door: { x: 476, y: 106, w: 44, h: 60 } },
      { kind: 'headframe', x: 580, w: 60, top: 56, roof: 56 },
      { kind: 'mill', x: 800, w: 180, top: 70, wins: [{ x: 820, y: 96, w: 20, h: 24 }, { x: 940, y: 96, w: 20, h: 24 }], door: { x: 872, y: 112, w: 34, h: 54 }, roof: 70, roofX: 845 },
      { kind: 'tunnel', x: 1170, w: 64, door: { x: 1180, y: 106, w: 44, h: 60 } },
      { kind: 'bunk', x: 1290, w: 160, top: 80, wins: [{ x: 1306, y: 102, w: 20, h: 24 }, { x: 1412, y: 102, w: 20, h: 24 }], door: { x: 1356, y: 112, w: 30, h: 54 }, roof: 80 },
    ],
    slots: [[250, ['ore']], [320, ['crates', 'tnt']], [404, ['rock']], [680, ['ore']], [1010, ['tnt', 'crates']], [1080, ['barrels']], [1250, ['crates', 'rock']], [1460, ['ore']]],
  },
};
// force : abords imposés par l'hôte (lobby) ; le tirage est fait quand même, pour ne pas décaler la suite
export function edgeLayout(seed, force = null) {
  const R = rng((seed ^ 0x3c6ef372) >>> 0);
  const pick = (arr) => arr[Math.floor(R() * arr.length)];
  const drawn = pick(Object.keys(EDGES));
  const kind = EDGES[force] ? force : drawn;
  const E = EDGES[kind];
  return {
    kind, name: E.name, houses: E.houses, seed,
    covers: E.slots.map(([x, kinds]) => ({ x, kind: pick(kinds) })),
    col: pick({ boothill: ['#7a6a5a', '#6a6460'], ranch: ['#9a3a2a', '#8a4a2a', '#a8582a'], mine: ['#8a6a48', '#7a5a3a'] }[kind]),
  };
}

function buildSpots(L) {
  const spots = [];
  const add = (s) => { s.id = spots.length; spots.push(s); return s; };
  const frame = (sec, kind, r, base) => add({ sec, kind, x: r.x, y: r.y, w: r.w, h: r.h, cx: r.x + r.w / 2, base });
  const cover = (sec, x, w, top, h) => add({ sec, kind: 'cover', x: x - 8, y: top - 48, w: w + 16, h: 48 + h, cx: x + w / 2, base: top + 16 });
  const bottle = (sec, x, y) => add({ sec, kind: 'bottle', x: x - 4, y: y - 16, w: 8, h: 16, cx: x, base: y });

  for (const b of L.buildings) {
    const f = facade(b);
    for (const w of f.windows) frame('street', 'window', w, w.y + w.h + 16);
    frame('street', 'door', f.door, f.door.y + f.door.h + 6);
    if (b.steeple) frame('street', 'roof', belfry(b), belfry(b).y + 50); // bandit dans le clocher
    else if (f.top <= 60 && f.roof !== 'gable') {
      const cx = Math.round(f.roof === 'flat' ? b.x + b.w / 2 : b.x + b.w * b.side);
      add({ sec: 'street', kind: 'roof', x: cx - 26, y: f.top - 46, w: 52, h: 46, cx, base: f.top + 16 });
    }
  }
  for (const p of L.props) {
    const [w, h] = PROP_DIM[p.kind];
    const top = PROP_BASE - h;
    if (p.kind === 'fence') {
      for (let k = 0; k < 5; k++) bottle('street', p.x + 10 + k * 18, top);
      continue;
    }
    cover('street', p.x, w, p.kind === 'wagon' ? top - 6 : top, h);
    if (p.kind === 'barrels') { bottle('street', p.x + 8, top); bottle('street', p.x + 26, top); }
    if (p.kind === 'crates' || p.kind === 'hay') bottle('street', p.x + w / 2, top);
  }

  // la gare
  const B = STA.building;
  for (const w of B.windows) frame('station', 'window', w, w.y + w.h + 16);
  frame('station', 'door', B.door, B.door.y + B.door.h + 6);
  add({ sec: 'station', kind: 'roof', x: B.x + B.w * 0.75 - 26, y: B.top - 46, w: 52, h: 46, cx: B.x + B.w * 0.75, base: B.top + 16 });
  for (const wg of L.train) {
    const o = wagonOpenings(wg);
    for (const w of o.wins) frame('station', 'window', w, w.y + w.h + 14);
    for (const d of o.doors) frame('station', 'door', d, d.y + d.h + 4);
    add({ sec: 'station', kind: 'roof', x: wg.x + wg.w / 2 - 26, y: STA.wagonTop - 48, w: 52, h: 48, cx: wg.x + wg.w / 2, base: STA.wagonTop + 16 });
  }
  frame('station', 'window', locoCab(STA.loco), 70 + 26 + 14);
  for (const c of STA.covers) {
    const [w, h] = STA_COVER[c.kind];
    cover('station', c.x, w, PROP_BASE - h, h);
    if (c.kind === 'crates' || c.kind === 'barrels') bottle('station', c.x + w / 2, PROP_BASE - h);
  }

  // les abords de la ville
  for (const h of L.edge.houses) {
    for (const w of h.wins || []) frame('edge', 'window', w, w.y + w.h + 16);
    if (h.door) frame('edge', 'door', h.door, h.door.y + h.door.h + 6);
    if (h.belfry) frame('edge', 'roof', h.belfry, h.belfry.y + 50);
    if (h.roof != null) {
      const cx = h.roofX ?? h.x + h.w / 2;
      add({ sec: 'edge', kind: 'roof', x: cx - 26, y: h.roof - 46, w: 52, h: 46, cx, base: h.roof + 16 });
    }
  }
  for (const c of L.edge.covers) {
    const [w, h] = EDGE_COVER[c.kind];
    const top = PROP_BASE - h;
    if (c.kind === 'fence') {
      for (let k = 0; k < 5; k++) bottle('edge', c.x + 10 + k * 18, top);
      continue;
    }
    cover('edge', c.x, w, c.kind === 'wagon' || c.kind === 'hearse' ? top - 6 : top, h);
    if (c.kind !== 'cross' && c.kind !== 'wagon' && c.kind !== 'hearse') bottle('edge', c.x + w / 2, top);
  }

  // le repaire : le saloon ou la mine (mêmes emplacements) ; la poursuite n'en a pas (que des cavaliers)
  if (L.lair === 'chase') {
    add({ sec: 'saloon', kind: 'boss', x: 0, y: 0, w: W, h: H, cx: W / 2, base: CHASE.y });
    return spots;
  }
  const G = L.lair === 'mine' ? MINE : SAL;
  for (const x of G.upperDoors) frame('saloon', 'door', { x, y: G.balcony - 56, w: 34, h: 56 }, G.balcony + 6);
  for (const cx of G.rails) add({ sec: 'saloon', kind: 'rail', x: cx - 26, y: 26, w: 52, h: G.balcony - 26, cx, base: G.balcony + 4 });
  for (const cx of G.bars) add({ sec: 'saloon', kind: 'bar', x: cx - 26, y: G.bar.top - 50, w: 52, h: 64, cx, base: G.bar.top + 16 });
  cover('saloon', G.piano.x, G.piano.w, G.piano.top, 50);
  for (const t of G.tables) cover('saloon', t.x, t.w, t.top, 34);
  for (const y of G.shelves) for (let x = 56; x <= 296; x += 40) bottle('saloon', x, y);
  // El Diablo arpente tout le balcon, ou toute la passerelle (dessiné devant les portes de l'étage)
  add({ sec: 'saloon', kind: 'boss', x: 300, y: 0, w: 460, h: G.balcony, cx: 576, base: G.balcony + 14 });
  return spots;
}

// rider : bandit à cheval · tnt : bâton de dynamite abattu en vol · tntBoom : chacun, quand il explose au sol
export const SHOOTER_PTS = { bandit: 100, roof: 150, rider: 150, tnt: 75, tntBoom: -75, civil: -100, supply: -100, bottle: 50, crate: 25, bossHit: 50, bossKill: 500, shot: -50 };
export const RIDE_V = 0.13; // vitesse des cavaliers (px/ms)

// Bonus : le symbole sur la caisse (ou au-dessus du porteur) montre le contenu ; le premier qui l'abat le gagne.
// Le sac de sable, lui, brouille l'écran de tous les autres joueurs.
export const BONUS_MS = 10000;
export const SAND_MS = 6000;
// Les armes (gun) remplacent le revolver jusqu'à la fin du temps (ms) ou du chargeur (mag, 0 = illimité).
// rate : ms entre deux tirs · auto : clic maintenu · spread : dispersion (px) · dual : deux balles par clic (akimbo).
export const BONUSES = {
  gatling: { name: 'MITRAILLEUSE', w: 1, gun: { ms: 8000, mag: 0, rate: 85, auto: true, spread: 6, sfx: 'gatling' } },
  rusty: { name: 'VIEILLE GATLING', w: 1.5, gun: { ms: 12000, mag: 30, rate: 170, auto: true, spread: 12, sfx: 'gatling' } },
  winchester: { name: 'WINCHESTER', w: 2, gun: { ms: 15000, mag: 15, rate: 260, auto: true, spread: 0, sfx: 'rifle' } },
  akimbo: { name: 'DEUX COLTS', w: 1.5, gun: { ms: 12000, mag: 24, rate: 140, auto: false, spread: 0, dual: true, sfx: 'revolver' } },
  dynamite: { name: 'DYNAMITE', w: 2 },
  shield: { name: 'ÉTOILE DU SHÉRIF', w: 2 },
  sand: { name: 'TEMPÊTE DE SABLE', w: 3 },
};
export const DYNAMITE_BOSS = 5; // dégâts de la dynamite sur El Diablo
// Le ravitailleur (un vieux prospecteur, à ne pas abattre) surgit et lance une caisse à ces instants.
const SUPPLY_TIMES = [7000, 15000, 30000, 38500, 47000, 64000, 72000, 80000, 89000, 97000, 114000, 121000, 134000, 140000, 145500];
export const SUPPLY_LEAD = 900; // il apparaît, puis lance la caisse
export const BANDIT_LOOKS = 8, CIVIL_LOOKS = 5;

// El Diablo arpente le balcon : position (x dans le saloon) à l'instant t, la même pour tout le monde.
// Dans la mine, son wagonnet roule d'un bout à l'autre de la passerelle (plus loin, plus longtemps) ; dans la
// poursuite, il zigzague au galop devant nous (x à l'écran, la caméra ne bouge pas).
const BOSS_PATH = [576, 470, 690, 540, 700, 450, 620];
const MINE_PATH = [600, 380, 720, 450, 690, 520, 740, 400];
export function bossX(t) {
  const dt = Math.max(0, t - BOSS_T0);
  if (LAIR === 'chase') return 262 + 62 * Math.sin(dt / 1500) + 24 * Math.sin(dt / 560 + 1);
  const [path, P, M] = LAIR === 'mine' ? [MINE_PATH, 2300, 1400] : [BOSS_PATH, 2400, 900];
  const k = Math.floor(dt / P), u = (dt % P - (P - M)) / M;
  const a = path[k % path.length], b = path[(k + 1) % path.length];
  return a + (b - a) * smooth(u);
}
// hauteur (à l'écran) où l'on vise El Diablo
export const bossAimY = () => (LAIR === 'chase' ? CHASE.y - Math.round(30 * CHASE.scale) : LAIR === 'mine' ? MINE.balcony - 44 : 50);

export function shooterWorld(seed, n, edge = null) {
  const layout = streetLayout(seed);
  layout.train = stationTrain(seed);
  layout.edge = edgeLayout(seed, edge);
  LAIR = layout.lair = lairOf(seed);
  const spots = buildSpots(layout);
  const R = rng(seed);
  const ri = (a, b) => a + Math.floor(R() * (b - a + 1));
  const targets = [];
  const busy = {};
  const dur = MODES.shooter.duration;
  // à 5 ou 6 tireurs, les vagues sont un peu plus serrées et plus fournies (rien ne change jusqu'à 4)
  const crowd = Math.max(0, n - 4);
  const gapK = 1 - 0.07 * crowd;

  const onScreen = (spot, t) => {
    const c = camAt(t);
    if (c.sec !== spot.sec) return false;
    const sx = spot.x - c.x;
    return sx >= 6 && sx + spot.w <= W - 6;
  };

  const tryAdd = (kind, t0, progress, force = false, only = null) => {
    let t1, fire = [];
    if (kind === 'bandit') {
      const aim = Math.round(2100 - 800 * progress) + ri(-200, 200);
      fire = [t0 + aim];
      t1 = fire[0] + 350;
    } else if (kind === 'civil') t1 = t0 + ri(1300, 1900);
    else if (kind === 'supply') t1 = t0 + SUPPLY_LEAD + 800;
    else if (kind === 'crate') t1 = t0 + ri(3200, 4500);
    else t1 = t0 + ri(2600, 4000);
    const small = kind === 'bottle' || kind === 'crate';
    const ok = spots.filter((s) => {
      if (s.kind === 'boss' || (only && !only(s))) return false;
      if (small ? s.kind !== 'bottle' : s.kind === 'bottle') return false;
      if (kind === 'civil' && s.kind !== 'window' && s.kind !== 'door' && s.kind !== 'bar') return false;
      if (kind === 'supply' && s.kind !== 'door' && s.kind !== 'bar' && s.kind !== 'cover') return false;
      if ((busy[s.id] || []).some(([a, b]) => t0 < b + 250 && t1 > a - 250)) return false;
      return onScreen(s, t0) && onScreen(s, (t0 + t1) / 2) && onScreen(s, t1);
    });
    if (!ok.length) return null;
    const active = targets.filter((x) => x.t0 <= t0 && x.t1 > t0 && x.kind !== 'boss' && !x.arc).length;
    if (!force && kind !== 'supply' && active >= (kind === 'crate' ? 8 : 6 + crowd)) return null;
    const spot = ok[Math.floor(R() * ok.length)];
    if (spot.kind === 'roof' && kind === 'bandit') { fire[0] -= 200; t1 -= 200; }
    (busy[spot.id] ||= []).push([t0, t1]);
    const pts = kind === 'bandit' ? (spot.kind === 'roof' ? SHOOTER_PTS.roof : SHOOTER_PTS.bandit) : SHOOTER_PTS[kind];
    const tg = {
      id: targets.length, spot: spot.id, sec: spot.sec, kind, t0, t1, fire, victims: fire.map(() => Math.floor(R() * n)),
      hp: 1, pts, look: Math.floor(R() * (kind === 'civil' ? CIVIL_LOOKS : BANDIT_LOOKS)),
    };
    if (kind === 'crate') tg.bonus = pickBonus(R());
    targets.push(tg);
    return tg;
  };

  let lastLoot = -1e9;
  const wave = (from, to, fast, slow) => {
    let t = from;
    while (t < to) {
      const progress = t / dur;
      const moving = Math.abs(camAt(t + 1500).x - camAt(t).x) > 4;
      const r = R();
      // si aucun emplacement ne convient (caméra en mouvement), on retente un peu plus tard
      const tg = tryAdd(r < 0.64 ? 'bandit' : r < 0.78 ? 'civil' : 'bottle', t, progress);
      if (!tg) { t += 150; continue; }
      // porteur de butin : un sac au-dessus de la tête, le bonus revient à celui qui l'abat
      if (tg.kind === 'bandit' && t - lastLoot > 6500 && R() < 0.15) { tg.bonus = pickBonus(R()); tg.loot = true; lastLoot = t; }
      if (!moving) {
        const r2 = R();
        if (r2 < 0.3) tryAdd('bottle', t + 100, progress);
        else if (r2 < 0.36) tryAdd('crate', t + 150, progress); // caisse posée sur un abri ou une étagère
      }
      t += Math.round((moving ? ri(slow[0], slow[1]) : ri(fast[0], fast[1]) - Math.round(progress * 150)) * gapK);
    }
  };
  wave(STATION_START + 1500, STATION_END - 2000, [420, 740], [650, 1000]);
  wave(EDGE_START + 900, EDGE_END - 2000, [420, 740], [650, 1000]);
  wave(STREET_START + 900, STREET_END - 2500, [420, 760], [650, 1000]);
  // Le repaire : le saloon et la mine ont leurs emplacements (vagues ordinaires) ; dans la poursuite, la bande galope à
  // nos côtés : des cavaliers nous rattrapent par la gauche (ou se laissent distancer par la droite) dans les quatre
  // couloirs du premier plan, et tirent quand ils sont au milieu de l'écran.
  const lair = layout.lair;
  let lane = 0;
  const chase = (from, to, gap) => {
    for (let t = from; t < to;) {
      const progress = t / dur;
      const left = R() < 0.62, vx = (left ? 1 : -1) * (0.035 + R() * 0.03), x0 = left ? -44 : W + 44;
      const fire = [];
      for (let k = R() < 0.35 + progress * 0.3 ? 2 : 1; k > 0; k--) fire.push(t + Math.round((ri(70, W - 70) - x0) / vx));
      fire.sort((a, b) => a - b);
      if (fire.length === 2 && fire[1] - fire[0] < 1300) fire.pop();
      const tg = {
        id: targets.length, spot: -1, sec: 'saloon', kind: 'rider', t0: t, t1: t + Math.round((W + 88) / Math.abs(vx)), fire, victims: fire.map(() => Math.floor(R() * n)),
        hp: 1, pts: SHOOTER_PTS.rider, look: Math.floor(R() * BANDIT_LOOKS), ride: { x0, vx, y: CHASE.lanes[lane++ % CHASE.lanes.length] + ri(-2, 2) },
      };
      if (t - lastLoot > 6500 && R() < 0.18) { tg.bonus = pickBonus(R()); tg.loot = true; lastLoot = t; }
      targets.push(tg);
      t += Math.round(ri(gap[0], gap[1]) * gapK);
    }
  };
  if (lair === 'chase') chase(SALOON_START + 2500, BOSS_T0 - 1500, [1300, 2000]);
  else wave(SALOON_START + 900, BOSS_T0 - 500, [400, 700], [650, 1000]);

  // El Diablo : surgit au balcon (ou sur la passerelle, ou au galop devant nous) et tire régulièrement jusqu'à ce qu'on l'abatte.
  const bossFire = [];
  for (let t = BOSS_T0 + 1700; t < dur - 400; t += lair === 'chase' ? 1900 : 1700) bossFire.push(t);
  const v0 = Math.floor(R() * n);
  const bossSpot = spots.find((s) => s.kind === 'boss');
  const bossTg = {
    id: targets.length, spot: bossSpot.id, sec: 'saloon', kind: 'boss', t0: BOSS_T0, t1: dur, fire: bossFire,
    victims: bossFire.map((_, k) => (v0 + k) % n), hp: 8 + n * 4, pts: SHOOTER_PTS.bossHit, look: 0,
  };
  targets.push(bossTg);
  if (lair === 'chase') chase(BOSS_T0 + 1500, dur - 2500, [1900, 2800]);
  else wave(BOSS_T0 + 1000, dur - 1200, [800, 1200], [800, 1200]);
  // dans la mine et la poursuite, El Diablo lance aussi de la dynamite vers nous : abattue en vol, elle rapporte ;
  // sinon tout le monde encaisse (et s'il tombe avant, il ne la lance pas)
  if (lair !== 'saloon') {
    for (let tt = BOSS_T0 + 4200; tt < dur - 2500; tt += ri(5200, 6800)) {
      // au départ : le bâton qu'il brandit (au-dessus du wagonnet, ou au bout de son bras levé, à cheval)
      const cam = camAt(tt).x, x0 = bossX(tt) + (lair === 'chase' ? 13 : 27), y0 = lair === 'chase' ? CHASE.y - Math.round(31 * CHASE.scale) - 30 : MINE.balcony - 56;
      const g = 0.00016, vy = 0.08 + R() * 0.04, land = 206;
      const T = Math.round((vy + Math.sqrt(vy * vy + 2 * g * (land - y0))) / g);
      const vx = (cam + 60 + ri(0, W - 120) - x0) / T;
      targets.push({ id: targets.length, spot: -1, sec: 'saloon', kind: 'tnt', t0: tt, t1: tt + T, fire: [], victims: [], hp: 1, pts: SHOOTER_PTS.tnt, look: 0, arc: { x0, y0, vx, vy, g }, from: bossTg.id });
    }
  }

  // le ravitailleur surgit d'une porte, d'un abri ou de derrière le comptoir et lance une caisse en cloche
  for (const tt of SUPPLY_TIMES) {
    const sec = camAt(tt).sec;
    if (camAt(tt + 3500).sec !== sec) continue;
    const sup = tryAdd('supply', tt - SUPPLY_LEAD, tt / dur);
    const g = 0.00012;
    let c;
    if (sup) {
      const s = spots[sup.spot];
      sup.throwAt = tt;
      const y0 = Math.max(s.y + 4, s.base - 50);
      const sx = s.cx - camAt(tt).x;
      const dir = sx < W / 2 ? 1 : -1;
      c = { x0: s.cx, y0, vx: dir * (0.05 + R() * 0.03), vy: Math.sqrt(2 * g * Math.max(30, y0 - ri(18, 36))), g };
    } else {
      // personne pour la lancer : elle arrive du bord de l'écran
      const dir = R() < 0.5 ? 1 : -1;
      c = { x0: camAt(tt).x + (dir > 0 ? -10 : W + 10), y0: 150 + ri(0, 30), vx: dir * (0.12 + R() * 0.04), vy: 0.17 + R() * 0.04, g };
    }
    const tg = { id: targets.length, spot: -1, sec, kind: 'crate', t0: tt, t1: tt, fire: [], victims: [], hp: 1, pts: SHOOTER_PTS.crate, look: 0, arc: c, bonus: pickBonus(R()), from: sup?.id };
    for (let t = tt; t < tt + 7000; t += 20) {
      const p = crateAt(tg, t);
      tg.t1 = t;
      if (p.y > H + 12 || (t > tt + 300 && (p.x < -14 || p.x > W + 14))) break;
    }
    targets.push(tg);
  }

  // Retournements : embuscades, cavaliers, dynamite, prime doublée, panne de lumière au saloon,
  // et paris sur El Diablo à son arrivée. Tirés de la graine : toute la table vit les mêmes.
  const events = [];
  const free = (a, b) => !events.some((e) => a < e.t1 + 1500 && b > e.t0 - 1500);
  // instant tiré au hasard où la caméra reste immobile au moins `span` ms dans la section, loin des autres événements
  const stopAt = (sec, from, to, span) => {
    const stops = [];
    for (let t = from; t < to; t += 500) {
      if (camAt(t).sec === sec && camAt(t + span).sec === sec && Math.abs(camAt(t + span).x - camAt(t).x) < 2 && free(t, t + span)) stops.push(t);
    }
    return stops.length ? stops[Math.floor(R() * stops.length)] : null;
  };
  // on fait place nette : les cibles ordinaires prévues pendant l'événement sont retirées
  const clear = (sec, a, b) => {
    for (const tg of targets) {
      if (tg.arc || tg.ride || tg.kind === 'boss' || tg.kind === 'supply' || tg.sec !== sec) continue;
      if (tg.t1 < a || tg.t0 > b) continue;
      busy[tg.spot] = (busy[tg.spot] || []).filter(([x, y]) => !(x === tg.t0 && y === tg.t1));
      tg.t1 = tg.t0 - 1000; // jamais visible
      tg.fire = [];
      tg.victims = [];
      tg.bonus = undefined;
    }
  };
  // Salve de bandits pendant un arrêt de la caméra. roofs : combien d'entre eux sur les toits (attaque du train).
  const ambush = (id, sec, from, to, roofs = 0) => {
    const t = stopAt(sec, from, to, 4500);
    if (t == null) return null;
    const tA = t + 1200;
    clear(sec, tA - 400, tA + 2800);
    let made = 0;
    for (let k = 0; k < 12 && made < 5; k++) {
      const onRoof = made < roofs ? (s) => s.kind === 'roof' : null;
      const tg = tryAdd('bandit', tA + k * 140, tA / dur, true, onRoof);
      if (!tg) continue;
      tg.fire = [tg.t0 + 1150 + ri(0, 350)];
      tg.victims = [Math.floor(R() * n)];
      tg.t1 = tg.fire[0] + 350;
      tg.ambush = true;
      made++;
    }
    const ev = made ? { id, t0: tA - 1300, t1: tA + 2600 } : null;
    if (ev) events.push(ev);
    return ev;
  };
  // Cavaliers : des bandits à cheval traversent l'écran au galop, dans un sens puis dans l'autre, et tirent en passant.
  const riders = (sec, from, to, count, id = 'riders') => {
    const t = stopAt(sec, from, to, 4500);
    if (t == null) return null;
    const tR = t + 900, cam = camAt(tR).x;
    let dir = R() < 0.5 ? 1 : -1, end = tR;
    for (let k = 0; k < count; k++, dir = -dir) {
      const t0 = tR + k * ri(800, 1000);
      const t1 = t0 + Math.round((W + 80) / RIDE_V);
      const fire = [t0 + Math.round((W / 2 + 40 + ri(-50, 50)) / RIDE_V)]; // vers le milieu de l'écran
      targets.push({
        id: targets.length, spot: -1, sec, kind: 'rider', t0, t1, fire, victims: [Math.floor(R() * n)], hp: 1, pts: SHOOTER_PTS.rider,
        look: Math.floor(R() * BANDIT_LOOKS), ride: { x0: dir > 0 ? cam - 40 : cam + W + 40, vx: dir * RIDE_V, y: ri(186, 194) },
      });
      end = t1;
    }
    const ev = { id, t0: tR - 1300, t1: end };
    events.push(ev);
    return ev;
  };
  // Dynamite : des bandits surgissent et lancent un bâton allumé vers les joueurs. Abattu en vol, il rapporte ;
  // s'il touche le sol, il explose et tout le monde encaisse.
  const dynamite = (sec, from, to, count) => {
    const t = stopAt(sec, from, to, 4500);
    if (t == null) return null;
    const tD = t + 1000, cam = camAt(tD).x;
    clear(sec, tD - 1500, tD + count * 1300 + 2000);
    let end = tD;
    for (let k = 0; k < count; k++) {
      const tt = tD + k * ri(1100, 1300);
      const thrower = tryAdd('bandit', tt - 900, tt / dur, true, (s) => s.kind !== 'bottle' && s.kind !== 'rail');
      let x0, y0;
      if (thrower) {
        const s = spots[thrower.spot];
        thrower.fire = [];
        thrower.victims = [];
        thrower.t1 = tt + 450;
        thrower.throwAt = tt;
        x0 = s.cx;
        y0 = Math.max(s.y + 4, s.base - 50);
      } else {
        x0 = cam + (R() < 0.5 ? -10 : W + 10); // lancé depuis le bord de l'écran
        y0 = 120 + ri(0, 30);
      }
      // il retombe au premier plan, sur les joueurs
      const g = 0.00016, vy = 0.08 + R() * 0.04, land = 206;
      const T = Math.round((vy + Math.sqrt(vy * vy + 2 * g * (land - y0))) / g);
      const vx = (cam + 60 + ri(0, W - 120) - x0) / T;
      targets.push({ id: targets.length, spot: -1, sec, kind: 'tnt', t0: tt, t1: tt + T, fire: [], victims: [], hp: 1, pts: SHOOTER_PTS.tnt, look: 0, arc: { x0, y0, vx, vy, g }, from: thrower?.id });
      end = tt + T;
    }
    const ev = { id: 'tnt', t0: tD - 1600, t1: end + 400 };
    events.push(ev);
    return ev;
  };

  ambush('train', 'station', STATION_START + 3000, STATION_END - 6000, 3);
  // chaque variante des abords a son coup dur : embuscade au cimetière, cavaliers au ranch, dynamite à la mine
  const ek = layout.edge.kind;
  if (ek === 'boothill') ambush('graves', 'edge', EDGE_START + 3000, EDGE_END - 6000);
  else if (ek === 'ranch') riders('edge', EDGE_START + 3000, EDGE_END - 8000, 3);
  else dynamite('edge', EDGE_START + 3000, EDGE_END - 9000, 3);
  ambush('ambush', 'street', STREET_START + 9000, STREET_END - 6000);
  // et dans la grand-rue, l'autre (ou l'un des deux au cimetière)
  if (ek === 'mine' || (ek === 'boothill' && R() < 0.5)) riders('street', STREET_START + 4000, STREET_END - 8000, 3 + (n > 2 ? 1 : 0));
  else dynamite('street', STREET_START + 4000, STREET_END - 9000, 3);
  // prime doublée : aux abords ou dans la rue
  for (let k = 0; k < 40; k++) {
    const tb = R() < 0.35 ? EDGE_START + 6000 + ri(0, 18000) : STREET_START + 6000 + ri(0, 34000);
    if (!free(tb, tb + 8000) && k < 39) continue;
    events.push({ id: 'bounty', t0: tb, t1: tb + 8000 });
    break;
  }
  const tl = SALOON_START + 3500 + ri(0, Math.max(0, BOSS_T0 - SALOON_START - 12000));
  // au saloon, la panne de lumière ; dans la mine, les lampes s'éteignent ; dans la poursuite, la bande nous double au galop
  if (lair === 'chase') riders('saloon', SALOON_START + 4000, BOSS_T0 - 7000, 4, 'gang');
  else events.push({ id: lair === 'mine' ? 'lamps' : 'blackout', t0: tl, t1: tl + 6000 });
  events.push({ id: 'wager', t0: BOSS_T0, t1: BOSS_T0 + WAGER.window });
  events.sort((a, b) => a.t0 - b.t0);
  return { targets, layout, spots, events, lair };
}

// pari sur El Diablo : mise, gain de celui qui l'abat, fenêtre pour parier (touche B)
export const WAGER = { stake: 200, prize: 1000, window: 8000, banner: 2600 };
export const shooterEventAt = (events, id, t) => events.find((e) => e.id === id && t >= e.t0 && t < e.t1);

// position à l'écran d'une caisse lancée (trajectoire dans le monde, la caméra peut bouger)
export function crateAt(tg, t) {
  const c = tg.arc, dt = t - tg.t0;
  return { x: c.x0 + c.vx * dt - camAt(t).x, y: c.y0 - c.vy * dt + 0.5 * c.g * dt * dt };
}
export const targetSec = (tg) => tg.sec;
// position (x dans la section) d'un cavalier au galop
export const rideX = (tg, t) => tg.ride.x0 + tg.ride.vx * (t - tg.t0);
// position (x dans la section) de n'importe quelle cible
export function targetX(tg, t, spots) {
  if (tg.arc) return tg.arc.x0 + tg.arc.vx * (t - tg.t0);
  if (tg.ride) return rideX(tg, t);
  if (tg.kind === 'boss') return bossX(t);
  return spots[tg.spot].cx;
}

// point à viser (coordonnées écran) sur une cible à l'instant t
export function targetAim(tg, t, spots) {
  if (tg.arc) return crateAt(tg, t);
  const cam = camAt(t);
  if (tg.ride) return { x: rideX(tg, t) - cam.x, y: tg.ride.y - 48 };
  const s = spots[tg.spot];
  if (tg.kind === 'boss') return { x: bossX(t) - cam.x, y: bossAimY() };
  return { x: s.cx - cam.x, y: s.kind === 'bottle' ? s.base - 8 : Math.max(s.y + 6, s.base - 40) };
}

function pickBonus(r) {
  const list = Object.entries(BONUSES);
  let x = r * list.reduce((s, [, b]) => s + b.w, 0);
  for (const [id, b] of list) if ((x -= b.w) <= 0) return id;
  return list[0][0];
}

// ================================================================ lasso

export const LASSO = {
  speed: 0.16, // défilement du sol (px/ms)
  top: 116, bottom: 206, // le champ (pieds des chevaux)
  minX: 26, maxX: 260,
  range: 130, rope: 0.55, horse: 0.11,
};
export const lassoHand = (x, y) => ({ x: x + 3, y: y - 38 });
// départ en quinconce : deux couloirs voisins ne partent jamais du même x (jusqu'à 6 chevaux)
export const lassoStart = (i, n) => ({ x: [120, 66, 156, 96, 140, 74][i % 6], y: Math.round(LASSO.top + 12 + ((i + 0.5) * (LASSO.bottom - LASSO.top - 12)) / n) });

// bx / fx : petites accélérations d'avant en arrière (zigzags du lièvre, de la poule)
export const ANIMALS = {
  chicken: { name: 'Poule', pts: 1, vx: [-0.06, -0.075], amp: 10, freq: 0.012, r: 6, w: 22, bx: 5, fx: 0.009 },
  pig: { name: 'Cochon', pts: 2, vx: [-0.075, -0.09], amp: 4, freq: 0.004, r: 8, w: 17 },
  sheep: { name: 'Mouton', pts: 2, vx: [-0.08, -0.09], amp: 3, freq: 0.005, r: 8, w: 13 },
  goat: { name: 'Chèvre', pts: 2, vx: [-0.07, -0.085], amp: 9, freq: 0.007, r: 8, w: 10 },
  cow: { name: 'Vache', pts: 3, vx: [-0.09, -0.105], amp: 2, freq: 0.003, r: 11, w: 14 },
  rabbit: { name: 'Lièvre', pts: 4, vx: [0.03, 0.05], amp: 14, freq: 0.006, r: 5, w: 7, bx: 14, fx: 0.005 },
  mustang: { name: 'Mustang', pts: 5, vx: [0.05, 0.07], amp: 6, freq: 0.003, r: 11, w: 9 },
  goldbull: { name: 'Taureau d’or', pts: 10, vx: [0.085, 0.095], amp: 8, freq: 0.004, r: 11, w: 2.5 },
  skunk: { name: 'Mouffette', pts: -3, vx: [-0.08, -0.09], amp: 3, freq: 0.006, r: 6, w: 9 },
};

export function animalPos(a, t) {
  const dt = t - a.t0;
  return { x: a.x0 + a.vx * dt + (a.bx || 0) * Math.sin(dt * (a.fx || 0)), y: a.y0 + a.amp * Math.sin(dt * a.freq + a.ph) };
}
export const animalVisible = (a, t) => t >= a.t0 && t <= a.t1;

// Perspective : le sol défile plus vite au premier plan qu'à l'horizon.
export const LASSO_HORIZON = 100;
export const groundSpeed = (y) => LASSO.speed * (0.45 + 0.55 * Math.max(0, Math.min(1.2, (y - LASSO_HORIZON) / (H - LASSO_HORIZON))));
export const obstacleX = (o, t) => W + 16 - groundSpeed(o.y) * (t - o.t0);

// Le parcours traverse 4 régions (ordre tiré de la graine) ; chacune a ses obstacles.
export const LASSO_BIOMES = {
  desert: ['rock', 'cactus', 'rock', 'skull'],
  prairie: ['log', 'hay', 'rock', 'log'],
  canyon: ['boulder', 'rock', 'stump', 'boulder'],
  ranch: ['barrel', 'hay', 'fence', 'barrel'],
};
export const LASSO_BIOME_NAMES = { desert: 'LE DÉSERT', prairie: 'LA PRAIRIE', canyon: 'LE CANYON', ranch: 'LE RANCH' };
export const biomeAt = (biomes, t) => {
  let b = biomes[0];
  for (const x of biomes) if (t >= x.at) b = x;
  return b;
};

// route : une seule région imposée par l'hôte (lobby) ; sinon le grand tour des 4 régions
export function lassoWorld(seed, n = 4, route = null) {
  const R = rng(seed);
  const between = (a, b) => a + R() * (b - a);
  const dur = MODES.lasso.duration;
  // à 5 ou 6 cavaliers, les bêtes arrivent un peu plus serrées (rien ne change jusqu'à 4)
  const gapK = 1 - 0.08 * Math.max(0, n - 4);
  const kinds = Object.entries(ANIMALS);
  const total = kinds.reduce((s, [, k]) => s + k.w, 0);
  const animals = [];
  for (let t = 600; t < dur - 2500;) {
    let r = R() * total, kind = kinds[0][0];
    for (const [id, k] of kinds) { if ((r -= k.w) <= 0) { kind = id; break; } }
    const k = ANIMALS[kind];
    const vx = between(k.vx[0], k.vx[1]);
    const y0 = Math.round(between(LASSO.top + k.amp + 6, LASSO.bottom - k.amp));
    const bx = k.bx || 0;
    animals.push({
      id: animals.length, kind, t0: Math.round(t), x0: vx < 0 ? W + 24 + bx : -24 - bx, y0, vx, amp: k.amp, freq: k.freq,
      ph: R() * Math.PI * 2, t1: Math.round(t + (W + 48 + 2 * bx) / Math.abs(vx)), pts: k.pts, r: k.r,
      bx, fx: k.fx || 0, v: Math.floor(R() * 4), // v : variante de robe
    });
    t += between(450, 820) * (1 - (0.35 * t) / dur) * gapK;
  }
  const order = Object.keys(LASSO_BIOMES);
  for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  const biomes = LASSO_BIOMES[route] ? [{ id: route, at: -1e9 }]
    : order.map((id, i) => ({ id, at: i === 0 ? -1e9 : Math.round((i * dur) / order.length) }));
  const obstacles = [];
  for (let t = 2500; t < dur; t += between(1500, 2800)) {
    const list = LASSO_BIOMES[biomeAt(biomes, t).id];
    obstacles.push({ t0: Math.round(t), y: Math.round(between(LASSO.top + 6, LASSO.bottom - 2)), kind: list[Math.floor(R() * list.length)] });
  }
  const twists = lassoTwists(seed, animals);
  return { animals, obstacles, biomes, twists };
}

// Retournements de situation : 3 événements par partie (vers 15, 30 et 45 s), dans un ordre tiré de la graine.
export const TWISTS = {
  rush: { name: 'RUÉE VERS L\'OR', sub: 'TOUTES LES CAPTURES VALENT DOUBLE', ms: 7000, col: '#f8d040' },
  stampede: { name: 'STAMPEDE !', sub: 'GARE AU TROUPEAU - CHAQUE BÊTE VAUT 1', warn: 1500, col: '#f0705a' },
  outlaw: { name: 'HORS-LA-LOI !', sub: 'LASSO-LE : +8 - SINON IL VOLE LE PREMIER', col: '#f0705a' },
};
export const OUTLAW = { pts: 8, steal: 0.2, min: 3 };
export const LASSO_BET = { mult: 2, miss: -2 }; // lasso doré : capture x2, raté -2
export const LASSO_CATCHUP = { gap: 5, range: 30, radius: 5 }; // lasso géant du dernier
// Bêtes des événements (hors tirage normal)
export const TWIST_ANIMALS = {
  bison: { name: 'Bison', pts: 1, r: 11 },
  outlaw: { name: 'Hors-la-loi', pts: OUTLAW.pts, r: 11 },
};

function lassoTwists(seed, animals) {
  const R = rng((seed ^ 0x5bd1e995) >>> 0);
  const between = (a, b) => a + R() * (b - a);
  const order = Object.keys(TWISTS);
  for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  const add = (a) => { a.id = animals.length; animals.push(a); return a; };
  return order.map((kind, k) => {
    const at = Math.round(15000 * (k + 1) + between(-1500, 1500));
    if (kind === 'rush') return { kind, at, end: at + TWISTS.rush.ms };
    if (kind === 'stampede') {
      // un troupeau lancé à fond traverse une bande du champ, de droite à gauche
      const arrive = at + TWISTS.stampede.warn;
      const herd = R() < 0.5 ? 'cow' : 'bison';
      const mid = Math.round(between(LASSO.top + 16, LASSO.bottom - 14));
      const count = 8 + Math.floor(R() * 3);
      const ids = [];
      let end = arrive;
      for (let i = 0; i < count; i++) {
        const t0 = Math.round(arrive + (i * 2400) / count + between(0, 200));
        const vx = -between(0.17, 0.2);
        const a = add({
          kind: herd, herd: true, t0, x0: W + 24, y0: Math.round(between(mid - 12, mid + 12)), vx, amp: 1, freq: 0.006,
          ph: R() * Math.PI * 2, t1: Math.round(t0 + (W + 48) / -vx), pts: TWIST_ANIMALS.bison.pts, r: 11, bx: 0, fx: 0, v: Math.floor(R() * 4),
        });
        ids.push(a.id);
        end = Math.max(end, a.t1);
      }
      return { kind, at, arrive, end, band: [mid - 14, mid + 14], ids };
    }
    // le hors-la-loi double tout le monde par la gauche
    const vx = between(0.07, 0.08);
    const a = add({
      kind: 'outlaw', t0: at, x0: -24, y0: Math.round(between(LASSO.top + 12, LASSO.bottom - 6)), vx, amp: 3, freq: 0.003,
      ph: R() * Math.PI * 2, t1: Math.round(at + (W + 48) / vx), pts: OUTLAW.pts, r: 11, bx: 0, fx: 0, v: 0,
    });
    return { kind, at, end: a.t1, id: a.id };
  });
}

// Ruée vers l'or en cours à l'instant t (grace : retard réseau toléré par l'hôte)
export const lassoRush = (world, t, grace = 0) => world.twists.some((e) => e.kind === 'rush' && t >= e.at && t <= e.end + grace);

// Lasso géant : le dernier, s'il a au moins 5 pts de retard sur le premier
export function lassoTrailing(players, i) {
  const live = players.filter((p) => !p.left);
  if (!players[i] || players[i].left || live.length < 2) return false;
  const scores = live.map((p) => p.score);
  const lo = Math.min(...scores);
  return players[i].score === lo && Math.max(...scores) - lo >= LASSO_CATCHUP.gap;
}

// ================================================================ duel

// Les manches sont tirées au sort par l'hôte (pas de graine) : il annonce l'heure du signal et
// des faux signaux, chaque joueur mesure son temps de réaction sur sa propre horloge.
export const DUEL = {
  wins: 3, // manches à gagner
  intro: 1600, // gros plan sur les regards
  wait: [1800, 5200], // attente du vrai signal après le gros plan
  grace: 600, // délai laissé à l'autre pour annoncer son temps
  timeout: 3000, // personne n'a tiré : manche nulle
  pause: 3800, // entre deux manches
  decoys: ['DÉJEUNEZ !', 'DÉGAGEZ !', 'DANSEZ !', 'DÉGUSTEZ !', 'DÉMÉNAGEZ !', 'DÉCOIFFEZ !', 'DÉRAPEZ !', 'DIABLO !'],
};

// ================================================================ où est Charlie

export const CHARLIE = {
  rounds: 5,
  worldW: 768, // la ville fait deux écrans de large
  round: 45000, // durée max d'une manche
  pause: 4200, // Charlie reste éclairé avant la manche suivante
  lockout: 1400, // mauvais clic : viseur bloqué
  board: 100, // bas des façades / haut du trottoir
  walk: 108, // pieds des passants sur le trottoir
  top: 118, bottom: 211, // la rue (pieds des passants)
};

export const TOWN = [
  { x: 4, w: 86, h: 60, col: '#8a4a2a', sign: 'ECURIE' },
  { x: 98, w: 92, h: 74, col: '#b89a6a', sign: 'BANQUE' },
  { x: 198, w: 108, h: 84, col: '#a8584a', sign: 'HOTEL', balcony: true },
  { x: 314, w: 132, h: 88, col: '#9a4a2a', sign: 'SALOON', balcony: true },
  { x: 454, w: 84, h: 64, col: '#6a8a8a', sign: 'BAZAR' },
  { x: 546, w: 84, h: 70, col: '#9a7a4a', sign: 'SHERIF' },
  { x: 638, w: 62, h: 58, col: '#c8b48a', sign: 'BARBIER' },
  { x: 708, w: 56, h: 66, col: '#7a6a9a', sign: 'POSTE' },
];
export const balconyY = (b) => CHARLIE.board - b.h + 42;

// y = ligne du sol de l'objet (tri en profondeur avec les passants)
export const TOWN_PROPS = [
  { kind: 'barrels', x: 36, y: 128 },
  { kind: 'wagon', x: 118, y: 156 },
  { kind: 'stall', x: 196, y: 200 },
  { kind: 'well', x: 300, y: 178 },
  { kind: 'horse', x: 386, y: 132 },
  { kind: 'hay', x: 430, y: 206 },
  { kind: 'stall', x: 492, y: 142 },
  { kind: 'crates', x: 560, y: 190 },
  { kind: 'trough', x: 600, y: 124 },
  { kind: 'barrels', x: 660, y: 168 },
  { kind: 'horse', x: 724, y: 204 },
  { kind: 'cactus', x: 748, y: 140 },
];
// emprise au sol [x0, x1, profondeur] : les passants contournent les objets
export const PROP_FOOT = {
  wagon: [-44, 44, 10], well: [-15, 15, 8], stall: [-24, 24, 7], barrels: [-11, 11, 5], hay: [-15, 15, 5],
  trough: [-18, 18, 4], horse: [-22, 22, 5], cactus: [-5, 5, 3], crates: [-12, 12, 5],
};

export const NPC_HATS = ['cowboy', 'cowboy', 'cowboy', 'sombrero', 'bowler', 'tophat', 'bandana', 'beanie', 'none'];
export const NPC_TOPS = ['shirt', 'shirt', 'vest', 'poncho', 'stripes', 'duster'];
const ALL_HATS = [...new Set([...NPC_HATS, 'bonnet'])];
const ALL_TOPS = [...new Set([...NPC_TOPS, 'dress'])];

export const PANTS = ['#3a5a9a', '#4a3a2e', '#5a4a3a', '#2a2622', '#6a5a40', '#4a4a5a'];

// Écart entre deux couleurs tel que l'œil le perçoit (approximation « redmean »)
function colorDist(a, b) {
  const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [r1, g1, b1] = p(a), [r2, g2, b2] = p(b);
  const rm = (r1 + r2) / 2, dr = r1 - r2, dg = g1 - g2, db = b1 - b2;
  return Math.sqrt((2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db);
}
// en dessous, deux couleurs se confondent sur un passant de 20 pixels (brun foncé et noir : 31,
// rouge brique et prune : 86). Chaque couleur des palettes garde au moins une couleur « loin ».
const NEAR = 100;
const near = (pal, i, j) => i === j || colorDist(pal[i], pal[j]) < NEAR;
const solidTop = (l) => (l.top === 'stripes' && near(CLOTH_COLORS, l.topC, l.topC2) ? 'shirt' : l.top);
const beardShows = (l) => !!l.beard && colorDist(HAIR_COLORS[l.hair], SKIN[l.skin]) >= NEAR;

// Deux passants qu'on ne distingue pas à l'œil. La peau et la couleur des cheveux ne comptent pas :
// à cette taille, quelques pixels ne suffisent pas à reconnaître quelqu'un.
export function sameLook(a, b) {
  const top = solidTop(a);
  if (a.hat !== b.hat || top !== solidTop(b)) return false;
  if (!!a.kid !== !!b.kid || !!a.long !== !!b.long || !!a.glasses !== !!b.glasses || beardShows(a) !== beardShows(b)) return false;
  if (a.hat !== 'none' && !near(CLOTH_COLORS, a.hatC, b.hatC)) return false;
  if (!near(CLOTH_COLORS, a.topC, b.topC)) return false;
  if ((top === 'stripes' || top === 'poncho') && !near(CLOTH_COLORS, a.topC2, b.topC2)) return false;
  if (top !== 'dress' && !near(PANTS, a.pants, b.pants)) return false;
  return true;
}

function freeRange(y, x, R) {
  let lo = 6, hi = CHARLIE.worldW - 6;
  for (const p of TOWN_PROPS) {
    const [a, b, d] = PROP_FOOT[p.kind];
    if (y < p.y - d || y > p.y + 3) continue;
    const x0 = p.x + a - 5, x1 = p.x + b + 5;
    if (x >= x0 && x <= x1) return null;
    if (x1 < x) lo = Math.max(lo, x1);
    else hi = Math.min(hi, x0);
  }
  const len = 24 + R() * 150;
  const from = Math.max(lo, x - R() * len);
  return [Math.round(from), Math.round(Math.min(hi, from + len))];
}

// Position d'un passant au temps t (ms depuis le début de la manche) : aller-retour avec des pauses.
export function npcPos(n, t) {
  if (!n.v) return { x: n.x0, y: n.y, dir: Math.floor((t + n.ph) / n.pause) % 2 ? -1 : 1, walk: false, f: 0 };
  const T = (n.x1 - n.x0) / n.v, per = 2 * (T + n.pause);
  const u = (((t + n.ph) % per) + per) % per;
  const f = Math.floor((t + n.ph) / 130) % 4;
  if (u < T) return { x: n.x0 + n.v * u, y: n.y, dir: 1, walk: true, f };
  if (u < T + n.pause) return { x: n.x1, y: n.y, dir: 1, walk: false, f: 0 };
  if (u < 2 * T + n.pause) return { x: n.x1 - n.v * (u - T - n.pause), y: n.y, dir: -1, walk: true, f };
  return { x: n.x0, y: n.y, dir: -1, walk: false, f: 0 };
}

// La foule d'une manche : même graine + même manche = mêmes passants, aux mêmes endroits, partout.
export function charlieWorld(seed, round) {
  const R = rng((seed ^ Math.imul(round + 1, 0x9e3779b1)) >>> 0);
  const ri = (a, b) => a + Math.floor(R() * (b - a + 1));
  const pick = (arr) => arr[Math.floor(R() * arr.length)];
  const balconies = TOWN.filter((b) => b.balcony);
  const C = CHARLIE;

  const place = (walker) => {
    const r = R();
    let y, range;
    if (r < 0.1) {
      const b = pick(balconies);
      y = balconyY(b);
      range = [b.x + 8, b.x + b.w - 8];
    } else if (r < 0.3) {
      y = C.walk;
      const x = ri(8, C.worldW - 8);
      range = [Math.max(6, x - ri(20, 90)), Math.min(C.worldW - 6, x + ri(20, 90))];
    } else {
      for (let k = 0; k < 30 && !range; k++) {
        y = ri(C.top, C.bottom);
        range = freeRange(y, ri(8, C.worldW - 8), R);
      }
      if (!range) { y = C.walk; range = [6, C.worldW - 6]; }
    }
    const [a, b] = range;
    if (!walker || b - a < 14) {
      const x = ri(a, b);
      return { x0: x, x1: x, y, v: 0, pause: ri(1500, 4000), ph: ri(0, 9000) };
    }
    return { x0: a, x1: b, y, v: 0.01 + R() * 0.016, pause: ri(400, 2600), ph: ri(0, 60000) };
  };

  const look = () => {
    const dress = R() < 0.28;
    const l = {
      skin: ri(0, 5), hair: ri(0, 7), hatC: ri(0, 7), topC: ri(0, 7), topC2: ri(0, 7), pants: ri(1, 5),
      dress, kid: R() < 0.1, glasses: R() < 0.07, beard: !dress && R() < 0.35, long: dress || R() < 0.08,
      hat: dress ? (R() < 0.6 ? 'bonnet' : 'none') : pick(NPC_HATS),
      top: dress ? 'dress' : pick(NPC_TOPS),
    };
    if (l.topC2 === l.topC) l.topC2 = (l.topC + 3) % 8;
    if (R() < 0.12) l.pants = 0; // jean bleu
    return l;
  };

  const npcs = [];
  const count = 70 + round * 14;
  for (let k = 0; k < count; k++) npcs.push({ id: k, look: look(), ...place(R() < 0.72) });

  // Charlie change de tenue à chaque manche : l'affiche WANTED est la seule référence.
  const target = { ...look(), kid: false };
  const other = (arr, v) => { const o = arr.filter((x) => x !== v); return o[Math.floor(R() * o.length)]; };
  // une couleur que l'œil distingue nettement de la couleur i
  const farFrom = (pal, i) => {
    const o = pal.map((_, k) => k).filter((k) => !near(pal, i, k));
    return o[Math.floor(R() * o.length)];
  };
  // ce qui distingue un sosie : un seul détail, toujours visible (des détails plus fins à partir de la 3e manche)
  const MUTATE = [
    (l) => { l.hat = other(ALL_HATS, l.hat); },
    (l) => { l.top = other(ALL_TOPS, l.top); },
    (l) => { l.topC = farFrom(CLOTH_COLORS, l.topC); },
    (l) => { if (l.top === 'dress') return false; l.pants = farFrom(PANTS, l.pants); },
    (l) => { l.glasses = !l.glasses; },
    (l) => { if (colorDist(HAIR_COLORS[l.hair], SKIN[l.skin]) < NEAR) return false; l.beard = !l.beard; },
    (l) => { if (l.hat === 'none') return false; l.hatC = farFrom(CLOTH_COLORS, l.hatC); },
    (l) => { if (l.top !== 'stripes' && l.top !== 'poncho') return false; l.topC2 = farFrom(CLOTH_COLORS, l.topC2); },
  ];
  const pool = round < 3 ? 4 : MUTATE.length;
  const decoys = 4 + round * 2;
  const slice = Math.floor(npcs.length / decoys);
  for (let k = 0; k < decoys; k++) {
    const n = npcs[k * slice + ri(0, slice - 1)];
    let l;
    do {
      l = { ...target };
      while (MUTATE[ri(0, pool - 1)](l) === false);
    } while (sameLook(l, target)); // ex. un pull rayé de deux tons proches qui redevient une chemise unie
    n.look = l;
  }
  // personne d'autre ne doit lui ressembler à l'œil : sinon on change franchement la couleur de son haut
  for (const n of npcs) if (sameLook(n.look, target)) n.look = { ...n.look, topC: farFrom(CLOTH_COLORS, target.topC) };
  const charlie = npcs.length;
  npcs.push({ id: charlie, charlie: true, look: target, ...place(R() < 0.8) });
  // ordre de tirage mélangé, pour que Charlie ne soit pas toujours dessiné en dernier à profondeur égale
  for (let k = npcs.length - 1; k > 0; k--) {
    const j = ri(0, k);
    [npcs[k], npcs[j]] = [npcs[j], npcs[k]];
  }
  return { npcs, charlie: npcs.find((n) => n.charlie) };
}
