// Mini-jeu « La pinte » : chacun à son tour fait glisser sa chope le long du comptoir. La plus proche du bout
// gagne la manche, mais une chope lancée trop fort (ou de travers) tombe et ne rapporte rien. Les chopes
// restent sur le comptoir pendant la manche : on peut pousser celles des autres dans le vide.
// Chaque manche a aussi son comptoir : droit, à rambardes, en chicane, en coude ou en goulet (il faut ricocher).
// Chaque lancer a sa bière (plus ou moins lourde, grosse, glissante, qui tourne ou qui fait gicler) et chaque
// manche ses surprises (flaque, sciure, courant d'air, bouteilles, chat, sous-bock, pièce d'or…), selon la salle et la météo.
// Ce fichier contient les règles partagées (la glissade est simulée pas à pas, de la même façon partout)
// et l'arbitre qui tourne chez l'hôte, avec la même interface que MiniGame (mini.js).
import { MODES, COUNTDOWN, rng } from './worlds.js';
import { pickEnv } from './env.js';
import { roomIdFor } from './room.js';

const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export const PINTE = {
  L: 320, // longueur du comptoir (unités = pixels à l'écran ; 1 unité = 2 cm)
  D: 26, // profondeur du comptoir
  R: 4, // rayon d'une chope
  START: 12, // la chope part du bout gauche, au milieu
  MU: 1.2e-4, // freinage (unités/ms²)
  WET: 0.35, // dans une flaque de bière, le freinage tombe à 35 %
  SAW: 5, // dans la sciure, il est 5 fois plus fort (la jauge en tient compte : voir speedFor)
  BOTTLE_R: 3, // rayon d'une bouteille oubliée
  TAP_R: 5, // rayon d'une tireuse à bière (comptoir à rambardes)
  RAIL_E: 0.8, // rebond sur une rambarde ou une cloison
  CAT_R: 6, // rayon du chat endormi
  COIN_R: 3, COIN: 30, // pièce d'or : rayon, et points pour celui qui l'empoche
  MAT_R: 6, MAT: 50, // sous-bock : rayon, et points pour la chope qui s'y arrête
  CURL: 0.06, // tord-boyaux : poussée de côté, en part du freinage
  REACH: 1.25, // à pleine puissance, sur bois sec, la chope irait 25 % plus loin que le bout
  MAXA: 0.1, // direction : ±0,1 rad (plus sur les comptoirs à rambardes)
  E: 0.9, // rebond entre deux chopes
  DT: 8, // pas de la simulation (ms)
  AIM: 15000, // temps pour lancer
  INTRO: 1800, // annonce de la manche
  BONUS: 50, // la chope la plus proche du bout
  CM: 2,
  dirMs: 1800, powMs: 1400, // aller-retour de l'aiguille et de la jauge
};
// 5 manches, quel que soit le nombre de joueurs (10 à 30 lancers, plus avec le double service)
export const pinteRounds = () => 5;
// décalage de l'ordre de passage d'une manche à l'autre : un cran, ou plus quand il y a moins de manches que de
// joueurs, pour que la dernière place (l'avantage) tombe chaque fois sur quelqu'un de différent et bien réparti
export const pinteShift = (n, rounds) => Math.max(1, Math.round(n / rounds));

// vitesse de départ pour une puissance 0..1 (distance parcourue sur bois sec proportionnelle à la puissance).
// La sciure freine dur : la jauge donne de quoi la traverser, pour qu'à fond on dépasse toujours le bout.
// Un comptoir où le chemin est plus long (ricochets) donne un peu plus aussi.
export function speedFor(power, mods) {
  const P = PINTE, saw = mods?.saw ? (P.SAW - 1) * mods.saw.w : 0;
  return Math.sqrt(2 * P.MU * (P.REACH * (P.L - P.START) * counterOf(mods).reach + saw) * power);
}

// ------------------------------------------------------------ comptoirs
// Chaque manche a son comptoir (le droit à la 1re). Un comptoir, c'est son bord arrière et son bord avant :
// deux lignes brisées de gauche à droite, en points [x, y, rambarde]. Si le 3e chiffre vaut 1, le tronçon qui part
// de ce point a une rambarde en laiton : la chope ricoche dessus au lieu de tomber. S'y ajoutent des cloisons
// [x1, y1, x2, y2] (rambardes posées en travers) et des tireuses à bière (obstacles ronds).
// Le départ (x < 70) est toujours le même : 26 de profondeur, la chope au milieu.
// maxa : l'aiguille de direction va plus loin, pour viser les rambardes ; reach : la jauge donne plus.
export const COUNTERS = {
  droit: { name: 'LE BON VIEUX COMPTOIR DROIT', label: 'COMPTOIR DROIT', col: '#e8c890', w: 2.2,
    back: [[0, 0], [320, 0]], front: [[0, 26], [320, 26]] },
  rambardes: { name: 'COMPTOIR À RAMBARDES : ÇA RICOCHE, ET LA TIREUSE BARRE LE MILIEU', label: 'RAMBARDES', col: '#f0d070', w: 2,
    back: [[0, 0, 1], [60, 0, 1], [90, -8, 1], [320, -8]], front: [[0, 26, 1], [60, 26, 1], [90, 34, 1], [320, 34]],
    taps: [{ x: 176, y: 13 }], maxa: 0.24 },
  chicane: { name: 'LA CHICANE : DEUX CLOISONS, IL FAUT RICOCHER POUR PASSER', label: 'CHICANE', col: '#f0a860', w: 1.6,
    back: [[0, 0, 1], [320, 0]], front: [[0, 26, 1], [320, 26]], walls: [[100, 0, 100, 12], [250, 26, 250, 14]], maxa: 0.26, reach: 1.15 },
  coude: { name: 'LE COMPTOIR FAIT UN COUDE : RICOCHE SUR LE MUR DU FOND', label: 'COUDE', col: '#d8b0f0', w: 1.6,
    back: [[0, 0], [150, 0], [175, -30, 1], [320, -30]], front: [[0, 26], [130, 26, 1], [230, -2], [320, -2]], maxa: 0.26, reach: 1.15 },
  goulet: { name: 'LE GOULET : LE COMPTOIR SE RESSERRE, LES RAMBARDES TE GUIDENT', label: 'GOULET', col: '#a8e0c8', w: 1.6,
    back: [[0, 0], [70, 0], [100, -10, 1], [175, -14, 1], [215, -14, 1], [250, -4], [320, -4]],
    front: [[0, 26], [70, 26], [100, 34, 1], [175, 4, 1], [215, 4, 1], [250, 30], [320, 30]], maxa: 0.22 },
  banquet: { name: 'LA TABLE DU BANQUET : BIEN LARGE, MAIS SANS RAMBARDE', label: 'BANQUET', col: '#f8e0a0', w: 1.6,
    back: [[0, 0], [70, 0], [110, -10], [320, -10]], front: [[0, 26], [70, 26], [110, 36], [320, 36]], maxa: 0.14 },
  pointe: { name: 'LA POINTE : LE BOUT DU COMPTOIR RÉTRÉCIT, VISE BIEN DROIT', label: 'POINTE', col: '#f0c0a0', w: 1.4,
    back: [[0, 0], [200, 0], [320, 5]], front: [[0, 26], [200, 26], [320, 21]] },
  serpent: { name: 'LE COMPTOIR EN S : DEUX VIRAGES, LES RAMBARDES TE RENVOIENT', label: 'EN S', col: '#c8e070', w: 1.4,
    back: [[0, 0], [80, 0, 1], [130, -12, 1], [190, -12, 1], [240, -4], [320, -4]],
    front: [[0, 26], [80, 26, 1], [130, 18, 1], [190, 18, 1], [240, 30], [320, 30]], maxa: 0.22 },
  tireuses: { name: 'TROIS TIREUSES : PASSE ENTRE LES DEUX, PUIS CONTOURNE LA TROISIÈME', label: 'TIREUSES', col: '#f8b070', w: 1.4,
    back: [[0, 0, 1], [60, 0, 1], [90, -8, 1], [320, -8]], front: [[0, 26, 1], [60, 26, 1], [90, 34, 1], [320, 34]],
    taps: [{ x: 140, y: -2 }, { x: 140, y: 28 }, { x: 240, y: 13 }], maxa: 0.24 },
  slalom: { name: 'LE SLALOM : TROIS CLOISONS, ZIGZAGUE DE RICOCHET EN RICOCHET', label: 'SLALOM', col: '#a0c8f0', w: 1.2,
    back: [[0, 0, 1], [320, 0]], front: [[0, 26, 1], [320, 26]],
    walls: [[110, 0, 110, 7], [180, 26, 180, 19], [250, 0, 250, 7]], maxa: 0.3, reach: 1.2 },
};

// hauteur d'une ligne brisée en x, et la rambarde du tronçon sous x
const yOn = (pts, x) => {
  if (x <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    if (x > pts[i][0]) continue;
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
    return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
  }
  return pts[pts.length - 1][1];
};
const railOn = (pts, x) => {
  for (let i = 1; i < pts.length; i++) if (x <= pts[i][0]) return !!pts[i - 1][2];
  return false;
};

// Géométrie prête à l'emploi (gardée en mémoire) : bords, rambardes en segments, tireuses
const geoms = new Map();
export function counterOf(mods) {
  const id = COUNTERS[mods?.lay] ? mods.lay : 'droit';
  let g = geoms.get(id);
  if (g) return g;
  const def = COUNTERS[id];
  const segs = [];
  for (const [pts, side] of [[def.back, 1], [def.front, -1]]) {
    for (let i = 0; i + 1 < pts.length; i++) if (pts[i][2]) segs.push({ ax: pts[i][0], ay: pts[i][1], bx: pts[i + 1][0], by: pts[i + 1][1], side });
  }
  for (const [ax, ay, bx, by] of def.walls || []) segs.push({ ax, ay, bx, by, wall: true });
  // mur invisible derrière le lanceur : une chope repoussée ne sort pas de l'écran par la gauche
  segs.push({ ax: -24, ay: -80, bx: -24, by: 80 });
  g = {
    ...def, id, segs, taps: def.taps || [], maxa: def.maxa || PINTE.MAXA, reach: def.reach || 1,
    rails: segs.some((w) => w.side || w.wall),
    backAt: (x) => yOn(def.back, x), frontAt: (x) => yOn(def.front, x),
    railBack: (x) => railOn(def.back, x), railFront: (x) => railOn(def.front, x),
    mid: (x) => (yOn(def.back, x) + yOn(def.front, x)) / 2,
  };
  geoms.set(id, g);
  return g;
}

// 1re manche : le comptoir droit ; ensuite tiré de la graine, jamais deux fois le même de suite
export function counterFor(seed, n) {
  if (n <= 1) return 'droit';
  const prev = counterFor(seed, n - 1);
  const R = rng((seed ^ Math.imul(n, 0x27d4eb2f)) >>> 0);
  const list = Object.entries(COUNTERS).filter(([id]) => id !== prev);
  let x = R() * list.reduce((t, [, c]) => t + c.w, 0);
  for (const [id, c] of list) if ((x -= c.w) <= 0) return id;
  return list[0][0];
}

// ------------------------------------------------------------ bières
// Le barman sert une bière différente à chaque lancer (la même pour toute la table, tirée de la graine).
// r : rayon ; m : masse dans les chocs ; mu : freinage (moins de freinage = elle va plus loin à puissance égale) ;
// e : rebond dans les chocs (le piment fait gicler les autres) ; curl : le tord-boyaux tourne vers toi (+1) ou vers le mur (-1).
export const BEERS = {
  blonde: { name: 'UNE BLONDE', desc: 'LA CLASSIQUE', r: 4, m: 1, mu: 1, w: 6, col: '#f0c858' },
  brune: { name: 'UNE BRUNE', desc: 'LOURDE : ELLE POUSSE FORT', r: 4, m: 1.9, mu: 1, w: 2.5, col: '#d89a68' },
  shot: { name: 'UN PETIT WHISKY', desc: 'PETIT ET LÉGER', r: 3, m: 0.5, mu: 1, w: 2, col: '#e8a048' },
  mousse: { name: 'UNE MOUSSEUSE', desc: 'ELLE GLISSE PLUS LOIN', r: 4, m: 1, mu: 0.8, w: 2, col: '#fdf6e0' },
  geante: { name: 'LA CHOPE DU MINEUR', desc: 'ÉNORME ET LOURDE : UN VRAI MUR', r: 6, m: 2.6, mu: 1, w: 1.2, col: '#f8d070' },
  tordt: { name: 'UN TORD-BOYAUX', desc: 'IL TOURNE VERS TOI', r: 4, m: 1, mu: 1, curl: 1, w: 0.9, art: 'tord', col: '#c8d070' },
  tordm: { name: 'UN TORD-BOYAUX', desc: 'IL TOURNE VERS LE MUR', r: 4, m: 1, mu: 1, curl: -1, w: 0.9, art: 'tord', col: '#c8d070' },
  piment: { name: 'LE PIMENT D\'EL DIABLO', desc: 'ÇA BRÛLE : AU CHOC, ELLE FAIT GICLER', r: 4, m: 1.2, mu: 1, e: 1.6, w: 1.4, col: '#f0705a' },
};
export const beerOf = (q) => BEERS[q?.b] || BEERS.blonde;

// 1re manche : des blondes pour tout le monde, le temps de prendre la main
export function beerFor(seed, n, turn) {
  if (n <= 1) return 'blonde';
  const R = rng((seed ^ Math.imul(n * 8 + turn + 1, 0x85ebca6b)) >>> 0);
  const list = Object.entries(BEERS);
  let x = R() * list.reduce((s, [, b]) => s + b.w, 0);
  for (const [id, b] of list) if ((x -= b.w) <= 0) return id;
  return 'blonde';
}

// écart entre le bord de la chope et le bout du comptoir, en cm (0 si elle dépasse déjà)
export const gapCm = (q) => Math.max(0, Math.round((PINTE.L - q.x - beerOf(q).r) * PINTE.CM));
export const ptsFor = (cm) => Math.max(0, 100 - cm);

// ------------------------------------------------------------ modificateurs de manche
// Tirés de la graine (les mêmes pour toute la table), selon la salle et la météo : rien à la 1re manche,
// un ou deux ensuite, et la dernière tournée compte double.
export const MODS = {
  flaque: { label: 'FLAQUE', name: 'DE LA BIÈRE A COULÉ : LA CHOPE Y GLISSE', col: '#e8a830' },
  sciure: { label: 'SCIURE', name: 'DE LA SCIURE SUR LE COMPTOIR : ÇA FREINE DUR', col: '#e0c890' },
  vent: { label: 'COURANT D\'AIR', name: 'LA FENÊTRE S\'OUVRE : UN COURANT D\'AIR POUSSE DE CÔTÉ', col: '#c8dcf8' },
  souffle: { label: 'VENT', name: 'LES PORTES BATTANTES CLAQUENT : DU VENT', col: '#c8dcf8' },
  cire: { label: 'CIRE', name: 'LE BARMAN A CIRÉ LE COMPTOIR : TOUT GLISSE PLUS', col: '#fdf6e0' },
  gel: { label: 'GEL', name: 'LE COMPTOIR EST GELÉ : TOUT GLISSE BIEN PLUS', col: '#d8f0ff' },
  virage: { label: 'VIRAGE', name: 'LE TRAIN PREND UN VIRAGE : TOUT PENCHE', col: '#f0c890' },
  bouteille: { label: 'BOUTEILLES', name: 'LE BARMAN A OUBLIÉ DES BOUTEILLES SUR LE COMPTOIR', col: '#b8e070' },
  piece: { label: 'PIÈCE D\'OR', name: `UNE PIÈCE D'OR : +${PINTE.COIN} À LA CHOPE QUI PASSE DESSUS`, col: '#f8d070' },
  chat: { label: 'CHAT', name: 'LE CHAT DU SALOON DORT SUR LE COMPTOIR : IL AMORTIT TOUT', col: '#f0b070' },
  sousbock: { label: 'SOUS-BOCK', name: `UN SOUS-BOCK : +${PINTE.MAT} À LA CHOPE QUI S'Y ARRÊTE`, col: '#e87858' },
  double: { label: 'POINTS X2', name: 'DERNIÈRE TOURNÉE : LES POINTS COMPTENT DOUBLE', col: '#f0907a' },
};

// ------------------------------------------------------------ événements du saloon
// Ils changent les règles de la manche (et pas le comptoir) : tirés de la graine, jamais à la 1re ni à la dernière
// manche, au moins un par partie, jamais deux fois le même de suite. Annoncés avec les surprises.
export const METAS = {
  patron: { title: 'LE PATRON EST DE BONNE HUMEUR', name: 'LA CHOPE LA PLUS PROCHE GAGNE +150 AU LIEU DE +50', label: 'TOURNÉE +150', col: '#f8d070', w: 2 },
  seul: { title: 'TOUT OU RIEN', name: 'SEULE LA CHOPE LA PLUS PROCHE MARQUE (TOURNÉE +100)', label: 'TOUT OU RIEN', col: '#f0907a', w: 1.5 },
  deux: { title: 'DOUBLE SERVICE', name: 'CHACUN LANCE DEUX CHOPES CETTE MANCHE', label: 'DEUX CHOPES', col: '#e8c890', w: 1.6 },
  bagarre: { title: 'BAGARRE AU SALOON', name: 'À MI-MANCHE, QUELQU\'UN BOUSCULE LE COMPTOIR', label: 'BAGARRE', col: '#f0705a', w: 1.6 },
  casse: { title: 'LE PATRON COMPTE LA CASSE', name: 'CHAQUE CHOPE BRISÉE COÛTE 30 PTS À SON PROPRIÉTAIRE', label: 'CASSE : -30', col: '#c8a0f0', w: 1.3 },
  chasse: { title: 'PRIME DU SHÉRIF', name: '+40 PAR CHOPE ADVERSE POUSSÉE DANS LE VIDE', label: 'PRIME : +40', col: '#b8e070', w: 1.3 },
  noir: { title: 'LES LAMPES S\'ÉTEIGNENT', name: 'PAS DE TRAIT DE CRAIE POUR VISER', label: 'À L\'AVEUGLE', col: '#a8b8e0', w: 1.2 },
};
export const META = { CASSE: 30, PRIME: 40, PATRON: 150, SEUL: 100, BRAWL: 1400 };

export function metaFor(seed, n, rounds) {
  if (n <= 1 || n >= rounds) return null;
  // la manche qui en a un à coup sûr ; les autres, à peu près une fois sur deux
  const sure = 2 + Math.floor(rng((seed ^ 0x2545f491) >>> 0)() * (rounds - 2));
  const R = rng((seed ^ Math.imul(n, 0x51ed270b)) >>> 0);
  if (n !== sure && R() >= 0.45) return null;
  const prev = metaFor(seed, n - 1, rounds);
  const list = Object.entries(METAS).filter(([id]) => id !== prev);
  let x = R() * list.reduce((s, [, e]) => s + e.w, 0);
  for (const [id, e] of list) if ((x -= e.w) <= 0) return id;
  return list[0][0];
}

// libellé d'un modificateur (le vent change de nom selon son sens)
export function modName(id, m) {
  if (id === 'souffle') return m.push > 0 ? 'PORTES BATTANTES : VENT DANS LE DOS, ÇA VA PLUS LOIN' : 'PORTES BATTANTES : VENT DE FACE, ÇA FREINE';
  if (id === 'virage') return `LE TRAIN PREND UN VIRAGE : TOUT PENCHE VERS ${m.tilt > 0 ? 'TOI' : 'LE MUR'}`;
  return MODS[id].name;
}
export function modLabel(id, m) {
  if (id === 'souffle') return m.push > 0 ? 'VENT DANS LE DOS' : 'VENT DE FACE';
  return MODS[id].label;
}

// Trajet du meilleur lancer d'une blonde sur ce comptoir nu (gardé en mémoire) : on n'y pose pas de bouteille
const lines = new Map();
function lineOf(G) {
  let pts = lines.get(G.id);
  if (pts) return pts;
  const mods = { lay: G.id }, { power, angle } = bestThrow(PINTE.L - 9, mods, 'blonde'), v = speedFor(power, mods);
  const s = new Slide([{ id: 0, b: 'blonde', x: PINTE.START, y: PINTE.D / 2, vx: v * Math.cos(angle), vy: v * Math.sin(angle) }], mods);
  pts = [];
  while (!s.done && s.t < 20000) { s.step(); pts.push({ x: s.p[0].x, y: s.p[0].y }); }
  lines.set(G.id, pts);
  return pts;
}

// Une bouteille posée à l'écart de ce trajet (une chope passe sans la frôler), ni sur une cloison ou une tireuse
function bottleSpot(G, R, taken) {
  const pts = lineOf(G), clear = PINTE.BOTTLE_R + PINTE.R + (G.rails ? 5 : 2), pad = PINTE.BOTTLE_R + 1;
  for (let k = 0; k < 40; k++) {
    const x = Math.round(110 + R() * (PINTE.L - 175));
    if (taken.some((t) => Math.abs(t - x) < 24)) continue;
    const near = pts.filter((p) => Math.abs(p.x - x) < clear), ok = [];
    for (let y = Math.ceil(G.backAt(x) + pad); y <= G.frontAt(x) - pad; y++) {
      if (near.every((p) => Math.hypot(p.x - x, p.y - y) >= clear)) ok.push(y);
    }
    if (!ok.length) continue;
    taken.push(x);
    return { x, y: ok[Math.floor(R() * ok.length)] };
  }
  return null;
}

// roomId : salle imposée par l'hôte (lobby), sinon tirée de la graine
export function modsFor(seed, n, rounds, roomId = null) {
  const m = { list: [], mult: 1, lay: counterFor(seed, n), meta: metaFor(seed, n, rounds) };
  if (n <= 1) return m;
  const { L, MU } = PINTE;
  const G = counterOf(m);
  const R = rng((seed ^ Math.imul(n, 0x9e3779b1)) >>> 0);
  const room = roomIdFor(seed, roomId), env = pickEnv(seed, 'roulette').id;
  const windy = env === 'poussiere' || env === 'orage' || env === 'neige';
  const pool = [
    ['flaque', 3], ['sciure', 2], ['vent', windy ? 4 : 2], ['souffle', windy ? 2 : 1.2],
    [env === 'neige' ? 'gel' : 'cire', env === 'neige' ? 3 : 1.2], ['piece', 2.2],
    ['chat', 1.6], ['sousbock', 1.8],
  ];
  if (room === 'train') pool.push(['virage', 4]);
  // le goulet est déjà trop étroit pour y semer des bouteilles
  if (G.id !== 'goulet') pool.push(['bouteille', 2]);
  // deux poussées de côté à la fois, ce serait injouable
  const clash = { vent: 'virage', virage: 'vent', cire: 'gel', gel: 'cire' };
  const count = R() < 0.35 ? 2 : 1;
  while (m.list.length < count) {
    const left = pool.filter(([id]) => !m.list.includes(id) && !m.list.includes(clash[id]));
    let x = R() * left.reduce((s, [, w]) => s + w, 0);
    const pick = left.find(([, w]) => (x -= w) <= 0) || left[0];
    m.list.push(pick[0]);
  }
  const zone = (min, max) => { const w = Math.round(min + R() * (max - min)); return { a: Math.round(70 + R() * (L - 110 - w)), w }; };
  const side = () => (R() < 0.5 ? -1 : 1);
  // objets posés sur le comptoir : jamais l'un sur l'autre, ni sur une cloison ou une tireuse
  const taken = [...G.taps.map((o) => o.x), ...(G.walls || []).map((w) => w[0])];
  const spot = (x0, x1, pad, keep = true) => {
    let x, k = 0;
    do x = Math.round(x0 + R() * (x1 - x0)); while (taken.some((t) => Math.abs(t - x) < 24) && ++k < 40);
    if (keep) taken.push(x);
    const b = G.backAt(x) + pad, f = G.frontAt(x) - pad;
    return { x, y: Math.round(b + R() * Math.max(0, f - b)) };
  };
  for (const id of m.list) {
    if (id === 'flaque') m.puddle = zone(24, 58);
    else if (id === 'sciure') m.saw = zone(28, 52);
    else if (id === 'vent') m.wind = { ...zone(50, 90), fy: side() * MU * (0.2 + R() * 0.12) };
    else if (id === 'souffle') m.push = (R() < 0.55 ? 1 : -1) * MU * (0.1 + R() * 0.06);
    else if (id === 'cire') m.slick = 0.75;
    else if (id === 'gel') m.slick = 0.6;
    else if (id === 'virage') m.tilt = side() * MU * (0.1 + R() * 0.06);
    else if (id === 'bouteille') {
      // jamais en travers du meilleur lancer : il reste toujours un passage (une seule sur les comptoirs à ricochets)
      m.bottles = [];
      for (let k = !G.rails && R() < 0.45 ? 2 : 1; k > 0; k--) {
        const o = bottleSpot(G, R, taken);
        if (o) m.bottles.push(o);
      }
    } else if (id === 'chat') m.cat = { ...spot(100, L - 70, 7), face: side() };
    else if (id === 'sousbock') m.mat = spot(L - 110, L - 40, PINTE.MAT_R + 2);
    else if (id === 'piece') m.coin = { ...spot(140, L - 40, 5, false), by: null };
  }
  // aucune place à l'écart du passage : pas de bouteille cette manche
  if (m.bottles && !m.bottles.length) { delete m.bottles; m.list = m.list.filter((id) => id !== 'bouteille'); }
  if (n === rounds) { m.mult = 2; m.list.push('double'); }
  return m;
}

const inZone = (z, x) => !!z && x >= z.a && x <= z.a + z.w;
const E0 = PINTE.E;

// la chope s'est arrêtée sur le sous-bock (son centre dessus)
export const onMat = (m, q) => !!m?.mat && Math.hypot(q.x - m.mat.x, q.y - m.mat.y) <= PINTE.MAT_R;

// Glissade : toutes les chopes du comptoir, avançées par pas fixes (même résultat chez tout le monde).
// Une chope tombe quand son centre passe le bout (end), l'arrière (back) ou l'avant (front) du comptoir.
export class Slide {
  constructor(pints, mods) {
    this.p = pints.map((q) => { const B = beerOf(q); return { vx: 0, vy: 0, ...q, r: B.r, m: B.m, mu: B.mu, e: B.e ?? E0, curl: B.curl || 0 }; });
    this.m = mods || {};
    this.g = counterOf(this.m);
    // obstacles fixes : bouteilles oubliées et tireuses du comptoir
    this.obs = [...(this.m.bottles || []).map((o) => ({ ...o, r: PINTE.BOTTLE_R })), ...this.g.taps.map((o) => ({ ...o, r: PINTE.TAP_R }))];
    this.coin = this.m.coin && this.m.coin.by == null ? this.m.coin : null;
    this.coinBy = null;
    this.t = 0;
    this.log = []; // { t, type: 'clink' | 'spicy' | 'bonk' | 'rail' | 'meow' | 'coin' | 'fall', id, edge, v }
    this.done = false;
  }

  // freinage là où se trouve la chope (bière, flaque, sciure, cire ou gel)
  fric(q) {
    const m = this.m, P = PINTE;
    return P.MU * q.mu * (m.slick || 1) * (inZone(m.puddle, q.x) ? P.WET : 1) * (inZone(m.saw, q.x) ? P.SAW : 1);
  }

  // rambardes et cloisons : la chope ricoche (elle ne les traverse jamais)
  rails(q) {
    for (const w of this.g.segs) {
      const ex = w.bx - w.ax, ey = w.by - w.ay;
      const u = clamp(((q.x - w.ax) * ex + (q.y - w.ay) * ey) / (ex * ex + ey * ey), 0, 1);
      const cx = w.ax + u * ex, cy = w.ay + u * ey, dx = q.x - cx, dy = q.y - cy, d2 = dx * dx + dy * dy;
      if (d2 >= q.r * q.r) continue;
      let d = Math.sqrt(d2), nx = dx / d, ny = dy / d;
      if (!(d > 1e-6)) { d = 0; nx = 0; ny = w.side || 1; } // pile sur le bord : on la renvoie vers le comptoir
      q.x = cx + nx * q.r; q.y = cy + ny * q.r;
      const vn = q.vx * nx + q.vy * ny;
      if (vn < 0) {
        q.vx -= (1 + PINTE.RAIL_E) * vn * nx; q.vy -= (1 + PINTE.RAIL_E) * vn * ny;
        this.log.push({ t: this.t, type: 'rail', id: q.id, v: -vn });
      }
    }
  }

  step() {
    const { DT, L, CAT_R, COIN_R, MU, CURL } = PINTE;
    const g = this.g;
    const m = this.m;
    let moving = false;
    for (const q of this.p) {
      if (q.out) continue;
      if (!q.vx && !q.vy) continue; // au repos, le frottement la retient : le vent ne la déplace pas
      const fr = this.fric(q);
      // vent, pente, tord-boyaux : jamais plus fort que le frottement, pour que toute chope finisse par s'arrêter
      let fx = m.push || 0, fy = (m.tilt || 0) + (inZone(m.wind, q.x) ? m.wind.fy : 0) + q.curl * CURL * MU;
      const f = Math.hypot(fx, fy);
      if (f > 0.9 * fr) { fx *= (0.9 * fr) / f; fy *= (0.9 * fr) / f; }
      q.vx += fx * DT;
      q.vy += fy * DT;
      const s = Math.sqrt(q.vx * q.vx + q.vy * q.vy);
      const ns = Math.max(0, s - fr * DT);
      q.vx *= ns / s;
      q.vy *= ns / s;
      // à petits pas contre les rambardes, pour qu'une chope lancée fort ne passe pas au travers
      const sub = g.segs.length > 1 ? Math.max(1, Math.ceil((ns * DT) / 1.5)) : 1;
      for (let k = 0; k < sub; k++) {
        q.x += (q.vx * DT) / sub;
        q.y += (q.vy * DT) / sub;
        if (g.segs.length) this.rails(q);
      }
      if (ns > 0) moving = true;
    }
    // chocs entre chopes : la plus lourde pousse plus fort, et le piment fait gicler
    for (let i = 0; i < this.p.length; i++) {
      const a = this.p[i];
      if (a.out) continue;
      for (let j = i + 1; j < this.p.length; j++) {
        const b = this.p[j];
        if (b.out) continue;
        const rr = a.r + b.r;
        const dx = b.x - a.x, dy = b.y - a.y, d2 = dx * dx + dy * dy;
        if (d2 >= rr * rr) continue;
        const d = Math.sqrt(d2) || 1e-6, nx = dx / d, ny = dy / d;
        const ia = 1 / a.m, ib = 1 / b.m, over = (rr - d) / (ia + ib);
        a.x -= nx * over * ia; a.y -= ny * over * ia; b.x += nx * over * ib; b.y += ny * over * ib;
        const rel = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
        if (rel <= 0) continue;
        const k = (rel * (1 + Math.max(a.e, b.e))) / (ia + ib);
        a.vx -= k * ia * nx; a.vy -= k * ia * ny; b.vx += k * ib * nx; b.vy += k * ib * ny;
        this.log.push({ t: this.t, type: a.e > E0 || b.e > E0 ? 'spicy' : 'clink', id: b.id, v: rel });
        moving = true;
      }
    }
    for (const q of this.p) {
      if (q.out) continue;
      this.rails(q); // une chope poussée par une autre reste derrière la rambarde
      // bouteilles oubliées et tireuses : elles ne bougent pas, la chope rebondit dessus
      for (const o of this.obs) {
        const rr = q.r + o.r, dx = q.x - o.x, dy = q.y - o.y, d2 = dx * dx + dy * dy;
        if (d2 >= rr * rr) continue;
        const d = Math.sqrt(d2) || 1e-6, nx = dx / d, ny = dy / d;
        q.x = o.x + nx * rr; q.y = o.y + ny * rr;
        const vn = q.vx * nx + q.vy * ny;
        if (vn < 0) {
          q.vx -= 1.6 * vn * nx; q.vy -= 1.6 * vn * ny;
          this.log.push({ t: this.t, type: 'bonk', id: q.id, v: -vn });
        }
      }
      // chat endormi : il ne bouge pas, la chope s'enfonce dans sa fourrure et perd presque tout son élan
      const ct = m.cat;
      if (ct) {
        const rr = q.r + CAT_R, dx = q.x - ct.x, dy = q.y - ct.y, d2 = dx * dx + dy * dy;
        if (d2 < rr * rr) {
          const d = Math.sqrt(d2) || 1e-6, nx = dx / d, ny = dy / d;
          q.x = ct.x + nx * rr; q.y = ct.y + ny * rr;
          const vn = q.vx * nx + q.vy * ny;
          if (vn < 0) {
            q.vx = (q.vx - 1.15 * vn * nx) * 0.5; q.vy = (q.vy - 1.15 * vn * ny) * 0.5;
            this.log.push({ t: this.t, type: 'meow', id: q.id, v: -vn });
          }
        }
      }
      // pièce d'or : la première chope qui passe dessus l'empoche pour son propriétaire
      const c = this.coin;
      if (c && this.coinBy == null && Math.hypot(q.x - c.x, q.y - c.y) < q.r + COIN_R) {
        this.coinBy = q.o;
        this.log.push({ t: this.t, type: 'coin', id: q.id });
      }
      const edge = q.x > L ? 'end' : q.y < g.backAt(q.x) ? 'back' : q.y > g.frontAt(q.x) ? 'front' : null;
      if (!edge) continue;
      q.out = edge;
      this.log.push({ t: this.t, type: 'fall', id: q.id, edge });
    }
    this.t += DT;
    if (!moving) this.done = true;
  }

  run() {
    while (!this.done && this.t < 20000) this.step();
    return this;
  }
}

// Une chope lancée seule : où elle s'arrête (null si elle tombe)
function solo(power, angle, mods, b) {
  const v = speedFor(power, mods);
  const s = new Slide([{ id: 0, b, x: PINTE.START, y: PINTE.D / 2, vx: v * Math.cos(angle), vy: v * Math.sin(angle) }], mods).run();
  return s.p[0].out ? null : s.p[0];
}

// Puissance qui amène une chope seule au plus près de x (dans cette direction), sans la faire tomber
export function powerFor(x, mods, b = 'blonde', angle = 0) {
  let lo = 0, hi = 1;
  for (let k = 0; k < 20; k++) {
    const p = (lo + hi) / 2;
    const q = solo(p, angle, mods, b);
    if (!q || q.x > x) hi = p;
    else lo = p;
  }
  return lo;
}

// directions essayées par les bots : tout l'éventail quand il y a des rambardes sur lesquelles ricocher
function angles(mods, fine) {
  const g = counterOf(mods), n = (g.rails ? 13 : 4) * (fine ? 2 : 1), out = [];
  for (let k = -n; k <= n; k++) out.push((0.8 + (g.rails ? 0.15 : 0)) * g.maxa * (k / n));
  return out;
}

// Meilleur lancer vers x : on essaie plusieurs directions (courant d'air, virage, bouteilles, ricochets) et on
// garde celle qui s'arrête le plus près, puis le plus au milieu du comptoir.
export function bestThrow(x, mods, b) {
  const g = counterOf(mods);
  let best = { power: powerFor(x, mods, b, 0), angle: 0, score: -1e9 };
  for (const a of angles(mods)) {
    const power = powerFor(x, mods, b, a);
    const q = solo(power, a, mods, b);
    if (!q) continue;
    const score = q.x - 3 * Math.abs(q.y - g.mid(q.x));
    if (score > best.score) best = { power, angle: a, score };
  }
  return best;
}

// Lancer qui arrête une chope seule au plus près d'un point (le sous-bock) : on balaie les directions.
function aimAt(pt, mods, b) {
  let best = { power: 0, angle: 0, d: 1e9 };
  for (const a of angles(mods, true)) {
    const power = powerFor(pt.x, mods, b, a);
    const q = solo(power, a, mods, b);
    const d = q ? Math.hypot(q.x - pt.x, q.y - pt.y) : 1e9;
    if (d < best.d) best = { power, angle: a, d };
  }
  return best;
}

// ------------------------------------------------------------ arbitre (navigateur de l'hôte)
export class PinteGame {
  // variant : salle imposée par l'hôte (lobby), sinon tirée de la graine
  constructor(players, variant = null) {
    this.kind = 'pinte';
    this.seed = Math.floor(Math.random() * 2 ** 31);
    this.variant = variant;
    this.duration = MODES.pinte.duration;
    this.rounds = pinteRounds(players.length);
    this.p = players.map((pl) => ({
      key: pl.key, name: pl.name, character: pl.character, bot: !!pl.bot,
      score: 0, left: false, stats: { throws: 0, falls: 0, knocks: 0, best: null, coins: 0, mats: 0 },
    }));
    // ordre de passage tiré au sort, puis décalé à chaque manche (le dernier à lancer a l'avantage) : voir pinteShift
    this.base = this.p.map((_, i) => i).sort(() => Math.random() - 0.5);
    this.shift = pinteShift(this.p.length, this.rounds);
    this.cur = null;
    this.phase = 'playing';
    this.winner = null;
    this.ranking = null;
    this.events = [];
    this.liveOut = [];
    this.startAt = 0;
  }

  get t() { return Date.now() - this.startAt; }

  start() {
    this.startAt = Date.now() + COUNTDOWN;
    this.push({ type: 'mgStart', kind: this.kind, seed: this.seed, countdown: COUNTDOWN, duration: this.duration });
    return this.flush();
  }

  flush() {
    const e = this.events;
    this.events = [];
    return e;
  }

  view(i) {
    return {
      kind: this.kind, me: i, phase: this.phase, winner: this.winner, ranking: this.ranking, variant: this.variant,
      players: this.p.map((p) => ({ key: p.key, name: p.name, character: p.character, score: p.score, left: p.left, bot: p.bot })),
    };
  }

  publicRound() {
    if (!this.cur) return null;
    const { bot, ...pub } = this.cur;
    return pub;
  }

  // État complet pour un joueur qui se reconnecte en cours de partie.
  syncView(i) {
    return { ...this.view(i), seed: this.seed, duration: this.duration, elapsed: this.t, round: this.publicRound() };
  }

  push(ev) {
    ev.dur = 0;
    ev.states = this.p.map((_, i) => this.view(i));
    this.events.push(ev);
  }

  act(i, a) {
    if (this.phase !== 'playing') return { error: 'La partie est terminée.' };
    if (!a || typeof a !== 'object' || a.kind !== 'throw') return { error: 'Action invalide.' };
    const c = this.cur, t = this.t;
    if (!c || c.phase !== 'aim' || a.n !== c.n || a.turn !== c.turn || c.order[c.turn] !== i) return { events: [] };
    if (!Number.isFinite(a.power) || !Number.isFinite(a.angle) || t < c.turnAt - 300) return { events: [] };
    this.slide(i, a.power, a.angle, t);
    return { events: this.flush() };
  }

  slide(i, power, angle, t) {
    const c = this.cur, P = PINTE;
    power = clamp(power, 0, 1);
    const maxa = counterOf(c.mods).maxa;
    angle = clamp(angle, -maxa, maxa);
    const v = speedFor(power, c.mods);
    const start = [...c.pints, { id: c.turn, o: i, b: c.beers[c.turn], x: P.START, y: P.D / 2, vx: v * Math.cos(angle), vy: v * Math.sin(angle) }];
    const mods = structuredClone(c.mods); // état avant le lancer (pièce encore là) : les joueurs rejouent la glissade avec
    const { sim, fell } = this.settle(start, i);
    const st = this.p[i].stats;
    st.throws++;
    for (const q of fell) {
      if (q.o === i) st.falls++;
      else st.knocks++;
    }
    c.phase = 'slide';
    c.nextAt = t + sim.t + (fell.length ? 1500 : 900);
    this.push({ type: 'pThrow', who: i, start, mods, dur: sim.t, round: this.publicRound() });
  }

  // Glissade jouée jusqu'au bout (who : le lanceur, null pour la bagarre) : chopes restantes, pièce d'or,
  // et la casse ou la prime de la manche
  settle(start, who) {
    const c = this.cur, meta = c.mods.meta;
    const sim = new Slide(start, c.mods).run();
    c.pints = sim.p.filter((q) => !q.out).map(({ id, o, b, x, y }) => ({ id, o, b, x, y }));
    if (sim.coinBy != null) {
      c.mods.coin.by = sim.coinBy;
      this.p[sim.coinBy].score += PINTE.COIN;
      this.p[sim.coinBy].stats.coins++;
    }
    const fell = sim.p.filter((q) => q.out);
    for (const q of fell) {
      if (meta === 'casse') c.extra[q.o] = (c.extra[q.o] || 0) - META.CASSE;
      if (meta === 'chasse' && who != null && q.o !== who) c.extra[who] = (c.extra[who] || 0) + META.PRIME;
    }
    return { sim, fell };
  }

  // Bagarre (à mi-manche) : le comptoir est bousculé, toutes les chopes glissent d'un coup vers le bout,
  // plus ou moins loin (les lourdes bougent moins). Annoncée, puis rejouée telle quelle chez chacun.
  brawl(t) {
    const c = this.cur;
    c.brawled = true;
    if (!c.pints.length) return this.resume(t);
    const R = rng((this.seed ^ Math.imul(c.n, 0x632be5ab)) >>> 0);
    const a = (R() - 0.5) * 0.5;
    const start = c.pints.map((q) => {
      const v = Math.sqrt(2 * PINTE.MU * (8 + R() * 22) / Math.sqrt(beerOf(q).m));
      return { ...q, vx: v * Math.cos(a), vy: v * Math.sin(a) };
    });
    const mods = structuredClone(c.mods);
    const { sim, fell } = this.settle(start, null);
    c.phase = 'brawl';
    c.nextAt = t + META.BRAWL + sim.t + (fell.length ? 1500 : 900);
    this.push({ type: 'pBrawl', start, mods, delay: META.BRAWL, dur: sim.t, round: this.publicRound() });
  }

  tick() {
    if (this.phase !== 'playing') return [];
    const t = this.t;
    if (t < 0) return [];
    const c = this.cur;
    if (!c) this.newRound(t);
    else if (c.phase === 'aim') {
      const who = c.order[c.turn];
      if (this.p[who].left) this.nextTurn(t);
      else if (t > c.turnAt + PINTE.AIM + 300) {
        c.phase = 'wait';
        c.nextAt = t + 1000;
        this.push({ type: 'pSkip', who, round: this.publicRound() });
      } else if (this.p[who].bot) this.botThink(who, t);
    } else if (c.phase === 'brawl') {
      if (t >= c.nextAt) this.resume(t);
    } else if (c.phase === 'score') {
      if (t >= c.nextAt) {
        if (c.n >= this.rounds) this.finish();
        else this.newRound(t);
      }
    } else if (t >= c.nextAt) this.nextTurn(t);
    return this.flush();
  }

  newRound(t) {
    const n = (this.cur?.n || 0) + 1;
    const k = ((n - 1) * this.shift) % this.base.length;
    const mods = modsFor(this.seed, n, this.rounds, this.variant);
    let order = [...this.base.slice(k), ...this.base.slice(0, k)].filter((i) => !this.p[i].left);
    // double service : on refait un tour de table, dans le même ordre
    if (mods.meta === 'deux') order = [...order, ...order];
    const beers = order.map((_, k) => beerFor(this.seed, n, k));
    // plus de surprises à annoncer (le comptoir et l'événement comptent pour une) : l'annonce dure un peu plus
    const intro = PINTE.INTRO + 900 * (mods.list.length + (mods.lay !== 'droit') + !!mods.meta);
    this.cur = { n, rounds: this.rounds, order, turn: 0, turnAt: t + intro, phase: 'aim', pints: [], mods, beers, res: null, extra: {}, bot: null };
    this.push({ type: 'pRound', round: this.publicRound() });
  }

  nextTurn(t) {
    const c = this.cur;
    c.turn++;
    c.bot = null;
    if (c.turn >= c.order.length) return this.score(t);
    if (c.mods.meta === 'bagarre' && !c.brawled && c.turn >= Math.floor(c.order.length / 2)) return this.brawl(t);
    this.resume(t);
  }

  resume(t) {
    const c = this.cur;
    c.phase = 'aim';
    c.turnAt = t + 300;
    this.push({ type: 'pTurn', round: this.publicRound() });
  }

  // Fin de manche : chaque chope encore sur le comptoir rapporte 100 pts moins son écart en cm,
  // et la plus proche du bout (ex aequo compris) offre la tournée : +50. Celle qui s'est arrêtée sur le sous-bock :
  // +50 aussi. Dernière tournée : tout compte double. Les événements changent la tournée (patron, tout ou rien)
  // et ajoutent la casse ou la prime (c.extra) ; un score ne descend jamais sous zéro.
  score(t) {
    const c = this.cur, meta = c.mods.meta;
    const res = c.pints.map((q) => ({ id: q.id, o: q.o, cm: gapCm(q), mat: onMat(c.mods, q) }));
    const best = res.length ? Math.min(...res.map((r) => r.cm)) : null;
    const bonus = meta === 'patron' ? META.PATRON : meta === 'seul' ? META.SEUL : PINTE.BONUS;
    for (const r of res) {
      r.best = r.cm === best;
      r.pts = meta === 'seul' && !r.best ? 0 : (ptsFor(r.cm) + (r.best ? bonus : 0) + (r.mat ? PINTE.MAT : 0)) * (c.mods.mult || 1);
      const p = this.p[r.o];
      if (r.mat) p.stats.mats++;
      p.score += r.pts;
      if (p.stats.best == null || r.cm < p.stats.best) p.stats.best = r.cm;
    }
    for (const [o, v] of Object.entries(c.extra)) this.p[o].score = Math.max(0, this.p[o].score + v);
    c.res = res;
    c.phase = 'score';
    c.nextAt = t + 4200;
    this.push({ type: 'pScore', round: this.publicRound() });
  }

  finish() {
    this.phase = 'over';
    const order = this.p.map((_, i) => i).sort((a, b) => (this.p[a].left - this.p[b].left) || (this.p[b].score - this.p[a].score));
    this.ranking = order;
    this.winner = order[0];
    const tie = order.length > 1 && this.p[order[1]].score === this.p[order[0]].score && !this.p[order[1]].left;
    this.push({ type: 'matchEnd', winner: this.winner, ranking: order, tie });
  }

  leave(i) {
    if (this.phase !== 'playing' || !this.p[i]) return [];
    this.p[i].left = true;
    this.push({ type: 'left', who: i });
    return this.flush();
  }

  // Il ne reste qu'un joueur : la partie s'arrête, le partant finit dernier.
  forfeit(i) {
    if (this.phase !== 'playing' || !this.p[i]) return [];
    this.p[i].left = true;
    this.finish();
    return this.flush();
  }

  // ------------------------------------------------------------ bots (mode solo)
  // Le bot vise un écart de quelques cm. Si un adversaire est tout près du bout et qu'il ne fait pas mieux,
  // il tente parfois de le pousser dans le vide. Sa main tremble un peu : il lui arrive de faire tomber sa chope.
  // Les autres voient son aiguille puis sa jauge, comme pour un joueur.
  botThink(i, t) {
    const c = this.cur, P = PINTE;
    if (!c.bot) {
      const b = c.beers[c.turn], B = BEERS[b];
      const gap = (q) => P.L - q.x - beerOf(q).r;
      const lead = [...c.pints].sort((a, b) => gap(a) - gap(b))[0];
      // avec une bière lourde (ou pimentée), il tente plus souvent de dégager la chope de tête ;
      // la prime du shérif et le tout ou rien le rendent plus hargneux
      const meta = c.mods.meta, mean = meta === 'chasse' || meta === 'seul';
      let angle = 0, power;
      const mat = c.mods.mat, free = mat && !c.pints.some((q) => onMat(c.mods, q));
      const odds = (B.m > 1.5 || B.e > P.E ? 0.75 : B.m < 1 ? 0.3 : 0.55) + (mean ? 0.2 : 0);
      if (lead && lead.o !== i && gap(lead) < (mean ? 60 : 30) && Math.random() < odds) {
        angle = Math.atan2(lead.y - P.D / 2, lead.x - P.START);
        power = powerFor(Math.min(P.L - B.r - 1, lead.x + 40), c.mods, b, angle);
      } else if (free && Math.random() < 0.35) {
        // le sous-bock est libre : il tente de s'y arrêter
        ({ power, angle } = aimAt(mat, c.mods, b));
      } else ({ power, angle } = bestThrow(P.L - B.r - (meta === 'casse' ? rnd(8, 20) : rnd(3, 14)), c.mods, b));
      // dans le noir, sa main tremble plus
      const tri = () => (Math.random() + Math.random() - 1) * (meta === 'noir' ? 1.6 : 1);
      c.bot = {
        angle: clamp(angle + tri() * 0.025, -counterOf(c.mods).maxa, counterOf(c.mods).maxa), power: clamp(power + tri() * 0.04, 0, 1),
        dirAt: c.turnAt + rnd(500, 900), stage: 0,
      };
      c.bot.powAt = c.bot.dirAt + rnd(900, 1700);
      c.bot.goAt = c.bot.powAt + rnd(700, 1300);
    }
    const b = c.bot;
    const live = (d) => this.liveOut.push({ key: this.p[i].key, d: { n: c.n, turn: c.turn, ...d } });
    if (b.stage === 0 && t >= b.dirAt) { b.stage = 1; live({ s: 'dir', t }); }
    if (b.stage === 1 && t >= b.powAt) { b.stage = 2; live({ s: 'pow', a: b.angle, t }); }
    if (b.stage === 2 && t >= b.goAt) { b.stage = 3; this.slide(i, b.power, b.angle, t); }
  }
}
