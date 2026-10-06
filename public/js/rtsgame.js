// Mini-jeu « Conquête de l'Ouest » : un petit jeu de stratégie en temps réel. Chaque joueur tient un fort,
// bâtit des mines (sur les filons), des ranchs et des plantations pour gagner de l'or et des vivres, recrute
// des unités (il faut les ressources, et elles mettent du temps à sortir) et les envoie prendre les forts
// adverses. Pas de limite de temps : le dernier fort debout gagne, seul (les alliances finissent par tomber).
// Diplomatie : on s'allie, on se trahit (le trahi est affaibli 1 min), on s'envoie de l'or, des vivres et des messages.
// Pas de spam de bâtiments : chaque bâtiment de plus du même type coûte plus cher, leur nombre est limité,
// bâtir ne rapporte pas de points, un seul chantier à la fois (construction ou amélioration), et seuls le fort,
// les mines et les tours étendent le territoire. La population maximale dépend des ranchs.
// Chaque bâtiment s'améliore deux fois (niveaux 2 et 3), chaque type d'unité s'entraîne deux fois (au bâtiment
// qui la recrute), et les unités prennent du galon en combattant (vétéran, élite, légende).
// On peut commander toute l'armée (ordres généraux) ou une sélection d'unités (aller, charger, tenir, attaquer
// une cible précise). Les collines allongent la portée des tireurs, les bois protègent des balles.
// La carte vient d'une graine (chaque navigateur la recalcule) : un décor tiré au hasard parmi plusieurs
// (prairie et rivière, canyon, sierra enneigée, bayou, salines), chacun avec ses terrains et sa disposition.
// L'hôte simule tout (économie, unités, combats) et envoie un instantané de la partie 2 fois par seconde.
// Même interface que MiniGame (mini.js) pour net.js.
import { MODES, COUNTDOWN, rng } from './worlds.js';

const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export const RTS = {
  tile: 8, cols: 96, rows: 54, // la carte fait 768 × 432 px : l'écran n'en montre qu'une partie (caméra, rts.js)
  mapW: 768, mapH: 432,
  snapMs: 500, // un instantané toutes les 500 ms (un message par joueur : Supabase limite à ~10 envois par seconde)
  territory: 76, // rayon constructible autour du fort (px) ; les mines et les tours l'étendent (BUILDINGS.reach)
  popCap: 40, popBase: 10, popRanch: 5, // population : 10, +5 par ranch terminé (+2 par niveau du ranch), 40 au plus
  regen: { fort: 3, other: 1.5, calm: 8000 }, // PV/s regagnés après 8 s sans dégâts
  start: { gold: 200, food: 80 },
  fortIncome: 1.5, fortRange: 52, fortDps: 7,
  queueMax: 5,
  counter: 1.6, // dégâts d'une unité contre celle qu'elle contre (UNITS.strong)
  leash: 64, // une unité postée poursuit un ennemi jusqu'à cette distance de son poste
  maxSel: 80, // unités par ordre
};

// Terrains : vitesse de déplacement (0 = infranchissable), constructible ou non ;
// cover : dégâts reçus par une unité qui s'y trouve ; range : portée en plus pour un tireur qui s'y poste
export const TERRAIN = [
  { id: 'grass', name: 'Prairie', speed: 1, build: true },
  { id: 'sand', name: 'Désert', speed: 0.85, build: true },
  { id: 'scrub', name: 'Cactus et broussailles', speed: 0.55, build: false },
  { id: 'rock', name: 'Rochers', speed: 0, build: false },
  { id: 'water', name: 'Eau', speed: 0, build: false },
  { id: 'ford', name: 'Gué', speed: 0.5, build: false },
  { id: 'forest', name: 'Bois', speed: 0.6, build: false, cover: 0.65 },
  { id: 'hill', name: 'Colline', speed: 0.75, build: true, range: 10 },
  { id: 'snow', name: 'Neige', speed: 0.75, build: true },
  { id: 'swamp', name: 'Marais', speed: 0.45, build: false },
  { id: 'salt', name: 'Croûte de sel', speed: 1.2, build: true },
  { id: 'bridge', name: 'Pont', speed: 1, build: false },
];
export const T = { grass: 0, sand: 1, scrub: 2, rock: 3, water: 4, ford: 5, forest: 6, hill: 7, snow: 8, swamp: 9, salt: 10, bridge: 11 };

// Décors de carte, tirés au hasard à chaque partie ; envs : ambiances (env.js) qui leur vont
export const BIOMES = {
  prairie: { name: 'LA PRAIRIE', envs: null },
  canyon: { name: 'LE GRAND CANYON', envs: ['midi', 'aube', 'crepuscule', 'nuit', 'orage', 'poussiere'] },
  sierra: { name: 'LA SIERRA ENNEIGÉE', envs: ['neige', 'midi', 'aube', 'crepuscule', 'nuit'] },
  bayou: { name: 'LE BAYOU', envs: ['midi', 'aube', 'crepuscule', 'nuit', 'orage'] },
  salines: { name: 'LES SALINES', envs: ['midi', 'aube', 'crepuscule', 'nuit', 'poussiere'] },
};
export const BIOME_IDS = Object.keys(BIOMES);

export const VEINS = { gold: { name: "Filon d'or", rate: 2.6 }, ore: { name: 'Filon de minerai', rate: 1.4 } };

// Niveaux des bâtiments (1 à 3) : multiplicateurs de PV, de production (or, vivres), de tir (forts et tours),
// portée en plus (px), durée de recrutement, places en plus dans l'armée (ranch)
export const LV = { max: 3, hp: [1, 1.35, 1.75], prod: [1, 1.4, 1.8], fire: [1, 1.45, 1.9], range: [0, 8, 16], train: [1, 0.8, 0.65], pop: [0, 2, 4] };

// w : côté en cases (8 px) ; prix : cost + step × nombre déjà bâti ; max par joueur ; time : durée du chantier (ms) ;
// reach : rayon de territoire gagné autour du bâtiment (seules la mine et la tour en donnent) ;
// up : prix (or) et durée (ms) des améliorations vers les niveaux 2 et 3
export const FORT = { name: 'Fort', hp: 1100, w: 3, up: [[160, 12000], [300, 16000]] };
export const BUILDINGS = {
  mine: { name: 'Mine', cost: 60, step: 15, max: 8, time: 6000, hp: 240, w: 2, reach: 44, up: [[70, 7000], [130, 9000]], desc: "Sur un filon. Or : beaucoup sur un filon d'or, moins sur du minerai." },
  ranch: { name: 'Ranch', cost: 50, step: 25, max: 4, time: 5000, hp: 200, w: 2, food: 1.1, pop: 5, up: [[60, 6000], [110, 8000]], desc: 'Élève du bétail : des vivres, et 5 places dans ton armée.' },
  farm: { name: 'Plantation', cost: 60, step: 30, max: 4, time: 5000, hp: 180, w: 2, food: 0.6, gold: 0.9, up: [[60, 6000], [110, 8000]], desc: "Coton et maïs : un peu d'or et de vivres." },
  stable: { name: 'Écurie', cost: 100, step: 80, max: 2, time: 8000, hp: 280, w: 2, up: [[90, 9000], [170, 12000]], desc: 'Permet de recruter des cavaliers.' },
  armory: { name: 'Armurerie', cost: 120, step: 90, max: 2, time: 9000, hp: 280, w: 2, up: [[100, 9000], [180, 12000]], desc: 'Permet de recruter des tireurs et des dynamiteurs.' },
  tower: { name: 'Tour de guet', cost: 80, step: 30, max: 5, time: 7000, hp: 340, w: 1, range: 58, dps: 6, reach: 60, up: [[70, 7000], [130, 9000]], desc: 'Tire sur les ennemis qui approchent et étend le territoire.' },
};
export const BUILD_IDS = Object.keys(BUILDINGS);
export const bDef = (kind) => (kind === 'fort' ? FORT : BUILDINGS[kind]);
export const maxHpOf = (kind, lv = 1) => Math.round(bDef(kind).hp * LV.hp[lv - 1]);
// amélioration suivante d'un bâtiment : [or, ms], ou null au niveau maximal
export const upNext = (b) => ((b.lv || 1) < LV.max ? bDef(b.kind).up[(b.lv || 1) - 1] : null);
// portée et tir des forts et des tours selon leur niveau
export const guardOf = (kind, lv = 1) => (kind === 'fort'
  ? { range: RTS.fortRange + LV.range[lv - 1], dps: RTS.fortDps * LV.fire[lv - 1] }
  : { range: BUILDINGS.tower.range + LV.range[lv - 1], dps: BUILDINGS.tower.dps * LV.fire[lv - 1] });

// speed en px/s, dps contre les unités ; siege = dps contre les bâtiments ; strong : l'unité qu'elle contre
// (dégâts × RTS.counter) : le pistolero abat les chevaux, le cavalier fond sur les tireurs, le tireur arrose les pistoleros.
// tech : noms des deux entraînements (au bâtiment qui recrute l'unité)
export const UNITS = {
  gunman: { name: 'Pistolero', gold: 25, food: 15, time: 5000, hp: 44, dps: 6, siege: 4, range: 26, speed: 24, from: 'fort', strong: 'rider', tech: ['Colts nickelés', 'Tir en éventail'] },
  rider: { name: 'Cavalier', gold: 45, food: 30, time: 7000, hp: 70, dps: 8, siege: 5, range: 12, speed: 42, from: 'stable', strong: 'rifle', tech: ['Selles de cuir', 'Mustangs sauvages'] },
  rifle: { name: 'Tireur', gold: 40, food: 20, time: 7000, hp: 30, dps: 8, siege: 2, range: 58, speed: 20, from: 'armory', strong: 'gunman', tech: ['Lunettes de visée', 'Winchester'] },
  dyn: { name: 'Dynamiteur', gold: 55, food: 25, time: 8000, hp: 34, dps: 3, siege: 40, range: 18, speed: 21, from: 'armory', strong: null, tech: ['Mèches courtes', 'Nitroglycérine'] },
};
export const UNIT_IDS = Object.keys(UNITS);
export const KIND_IDS = ['fort', ...BUILD_IDS]; // index des sortes de bâtiments dans les instantanés

// Entraînements : [or, vivres, ms] des niveaux 1 et 2 ; le niveau 2 demande le bâtiment au niveau 2.
// Chaque niveau : +18 % de PV et de dégâts, plus un bonus propre (cavalier plus rapide, tireur plus loin, dynamite plus forte)
export const TECH = { max: 2, cost: [[90, 40, 12000], [170, 80, 18000]], hp: 0.18, dps: 0.18 };
// Galons gagnés au combat (points d'expérience : dégâts infligés, ennemis abattus)
export const RANKS = { xp: [0, 6, 15, 30], name: ['Recrue', 'Vétéran', 'Élite', 'Légende'], hp: 0.12, dps: 0.15 };
export const rankOf = (xp) => (xp >= RANKS.xp[3] ? 3 : xp >= RANKS.xp[2] ? 2 : xp >= RANKS.xp[1] ? 1 : 0);

// Caractéristiques d'une unité selon l'entraînement de son joueur et ses galons
export function uStats(kind, tech = 0, rank = 0) {
  const U = UNITS[kind];
  const kh = 1 + TECH.hp * tech + RANKS.hp * rank, kd = 1 + TECH.dps * tech + RANKS.dps * rank;
  return {
    hp: Math.round(U.hp * kh),
    dps: U.dps * kd,
    siege: U.siege * kd * (kind === 'dyn' ? 1 + 0.25 * tech : 1),
    range: U.range + (kind === 'rifle' ? 6 * tech : 0),
    speed: U.speed * (kind === 'rider' ? 1 + 0.08 * tech : 1) * (1 + 0.03 * rank),
  };
}

export const RTS_PTS = { kill: 10, raze: 40, fort: 300, minePer: 0.1 }; // bâtir ne rapporte rien : pas de spam

// Diplomatie : alliances (on ne se tire plus dessus), trahisons, dons et messages.
// Le joueur trahi est affaibli pendant 1 min : ses unités font moins de dégâts et en prennent plus,
// ses bâtiments sont plus fragiles. Un seul joueur gagne : une alliance demande au moins 3 joueurs en lice et
// ne peut pas allier tout le monde (il faut un ennemi commun) ; quand il ne reste que des alliés (l'ennemi est tombé),
// les alliances se rompent d'elles-mêmes au bout de 30 s, sans malus. Trahir avant, c'est frapper le premier.
export const DIPLO = {
  betray: 60000, // durée du malus du joueur trahi
  weak: { dps: 0.7, hurt: 1.3, bld: 1.6 }, // ses unités : -30 % de dégâts, +30 % de dégâts reçus ; ses bâtiments : +60 %
  offerMs: 25000, // une proposition d'alliance sans réponse tombe
  gift: { gold: 50, food: 30 },
  sayMs: 1500, // un message à la fois
  lastStand: 30000, // plus que des alliés : délai avant la fin des alliances
};
// Messages tout faits (au doigt, pas de clavier) ; help : montre son fort, join : nomme le fort que son armée attaque
export const WORDS = [
  { id: 'help', text: 'AU SECOURS !' },
  { id: 'join', text: 'ATTAQUONS ENSEMBLE !' },
  { id: 'ok', text: "J'ARRIVE !" },
  { id: 'thanks', text: "MERCI, L'AMI !" },
  { id: 'peace', text: 'FAISONS LA PAIX' },
  { id: 'threat', text: 'TU VAS LE PAYER !' },
];
export const WORD_IDS = WORDS.map((w) => w.id);
export const pairKey = (a, b) => (a < b ? `${a}${b}` : `${b}${a}`); // alliance entre deux joueurs (index à un chiffre)

// Nombre de bâtiments d'un type (chantiers compris) et prix du suivant
export const countOf = (blds, owner, kind) => blds.reduce((n, b) => n + (b.owner === owner && b.kind === kind ? 1 : 0), 0);
export const costOf = (blds, owner, kind) => BUILDINGS[kind].cost + BUILDINGS[kind].step * countOf(blds, owner, kind);

// Population maximale d'un joueur : la base, plus chaque ranch terminé (et ses niveaux)
export const popOf = (blds, owner) => Math.min(RTS.popCap, RTS.popBase + blds.reduce((n, b) => n + (b.owner === owner && b.kind === 'ranch' && b.build <= 0 ? RTS.popRanch + LV.pop[(b.lv || 1) - 1] : 0), 0));
// Chantier en cours d'un joueur (un seul à la fois : construction ou amélioration)
export const siteOf = (blds, owner) => blds.find((b) => b.owner === owner && (b.build > 0 || b.up > 0)) || null;

// Revenus par seconde d'un joueur (bâtiments terminés) : le même calcul chez l'hôte et dans l'interface
export function incomeOf(world, blds, owner) {
  let gold = 0, food = 0;
  for (const b of blds) {
    if (b.owner !== owner || b.build > 0) continue;
    const k = LV.prod[(b.lv || 1) - 1];
    if (b.kind === 'fort') { gold += RTS.fortIncome * k; continue; }
    const B = BUILDINGS[b.kind];
    if (b.kind === 'mine') { const v = world.veins.find((x) => x.x === b.x && x.y === b.y); if (v) gold += VEINS[v.kind].rate * k; }
    if (B.food) food += B.food * k;
    if (B.gold) gold += B.gold * k;
  }
  return { gold, food };
}

// Emplacement des forts (case du centre ; le fort fait 3 × 3 cases), qui varie d'une partie à l'autre
export function fortSpots(n, R = Math.random) {
  if (n <= 2) {
    const v = Math.floor(R() * 3);
    return v === 0 ? [[7, 27], [88, 27]] : v === 1 ? [[8, 9], [87, 44]] : [[8, 44], [87, 9]];
  }
  if (n === 3) return R() < 0.5 ? [[7, 27], [88, 9], [88, 45]] : [[88, 27], [7, 9], [7, 45]];
  return [[8, 8], [87, 8], [8, 45], [87, 45]];
}

const COLS = RTS.cols, ROWS = RTS.rows;
export const tileAt = (w, c, r) => (c < 0 || r < 0 || c >= COLS || r >= ROWS ? T.rock : w.tiles[r * COLS + c]);
export const speedAt = (w, c, r) => TERRAIN[tileAt(w, c, r)].speed;
export const buildable = (w, c, r) => TERRAIN[tileAt(w, c, r)].build;
export const terrainPx = (w, x, y) => TERRAIN[tileAt(w, Math.floor(x / RTS.tile), Math.floor(y / RTS.tile))];
export const center = (c) => c * RTS.tile + RTS.tile / 2;
export const bCenter = (b) => ({ x: (b.x + b.w / 2) * RTS.tile, y: (b.y + b.w / 2) * RTS.tile });

// Case franchissable la plus proche d'un point (px), pour qu'un ordre sur l'eau ou un rocher reste atteignable
export function passableNear(w, x, y) {
  const c0 = Math.floor(x / RTS.tile), r0 = Math.floor(y / RTS.tile);
  if (speedAt(w, c0, r0)) return { x, y };
  for (let rad = 1; rad < 12; rad++) {
    let best = null, bd = Infinity;
    for (let r = r0 - rad; r <= r0 + rad; r++) for (let c = c0 - rad; c <= c0 + rad; c++) {
      if (Math.max(Math.abs(c - c0), Math.abs(r - r0)) !== rad || !speedAt(w, c, r)) continue;
      const d = Math.hypot(center(c) - x, center(r) - y);
      if (d < bd) { bd = d; best = { x: center(c), y: center(r) }; }
    }
    if (best) return best;
  }
  return { x, y };
}

// ------------------------------------------------------------ la carte
// Bruit de valeur (grille grossière interpolée) : de grandes plaques de terrain.
function valueNoise(R, step) {
  const gw = Math.ceil(COLS / step) + 2, gh = Math.ceil(ROWS / step) + 2;
  const g = Array.from({ length: gw * gh }, () => R());
  return (c, r) => {
    const x = c / step, y = r / step, x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
    const v = (i, j) => g[(y0 + j) * gw + (x0 + i)];
    const s = (k) => k * k * (3 - 2 * k);
    const a = v(0, 0) + (v(1, 0) - v(0, 0)) * s(fx), b = v(0, 1) + (v(1, 1) - v(0, 1)) * s(fx);
    return a + (b - a) * s(fy);
  };
}

// Outils de dessin du terrain, partagés par les décors
function mapKit(R, tiles) {
  const ri = (a, b) => a + Math.floor(R() * (b - a + 1));
  const ok = (c, r) => c >= 0 && r >= 0 && c < COLS && r < ROWS;
  const set = (c, r, v) => { if (ok(c, r)) tiles[r * COLS + c] = v; };
  const get = (c, r) => (ok(c, r) ? tiles[r * COLS + c] : T.rock);
  const fill = (f) => { for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) tiles[r * COLS + c] = f(c, r); };
  // tache aux bords irréguliers (ax : étirement horizontal) ; keep(t) : seulement sur ces terrains
  const blob = (cx, cy, rad, v, ax = 1.25, jag = 0.9, keep = null) => {
    const ex = Math.ceil(rad * ax + 2), ey = Math.ceil(rad + 2);
    for (let r = Math.floor(cy - ey); r <= cy + ey; r++) for (let c = Math.floor(cx - ex); c <= cx + ex; c++) {
      if (!ok(c, r) || (keep && !keep(get(c, r)))) continue;
      if (Math.hypot((c - cx) / ax, r - cy) < rad + (R() - 0.5) * jag) set(c, r, v);
    }
  };
  const dry = (t) => t !== T.water && t !== T.ford && t !== T.bridge;
  // rivière du nord au sud (w cases de large) avec des passages : gués, ou ponts (proportion bridges)
  const river = (x0, xmin, xmax, w, crossings, bridges = 0, r0 = 0, r1 = ROWS - 1) => {
    let rx = x0;
    const rows = new Map();
    for (let k = 0; k < crossings; k++) rows.set(Math.round(r0 + ((k + 0.5) * (r1 - r0 + 1)) / crossings) + ri(-1, 1), R() < bridges ? T.bridge : T.ford);
    for (let r = r0; r <= r1; r++) {
      if (R() < 0.45) rx = clamp(rx + (R() < 0.5 ? -1 : 1), xmin, xmax);
      const cross = rows.get(r) ?? rows.get(r - 1);
      for (let k = 0; k < w; k++) set(rx + k, r, cross ?? T.water);
    }
  };
  return { R, ri, ok, set, get, fill, blob, dry, river };
}

// Chaque décor remplit la grille ; base : le terrain dégagé autour des forts
const GEN = {
  // la prairie et sa rivière : herbe, désert, broussailles, mesas, bosquets et collines ; une rivière à gués et à ponts
  prairie(K) {
    const sandN = valueNoise(K.R, 12), scrubN = valueNoise(K.R, 8);
    K.fill((c, r) => (scrubN(c, r) > 0.72 ? T.scrub : sandN(c, r) > 0.56 ? T.sand : T.grass));
    const nRocks = K.ri(18, 26);
    for (let k = 0; k < nRocks; k++) K.blob(K.ri(12, COLS - 13), K.ri(1, ROWS - 2), 1.4 + K.R() * 2.4, T.rock);
    for (let k = K.ri(4, 7); k > 0; k--) K.blob(K.ri(10, COLS - 11), K.ri(2, ROWS - 3), 1.4 + K.R() * 1.8, T.forest, 1.4, 1, (t) => t !== T.rock);
    for (let k = K.ri(3, 5); k > 0; k--) K.blob(K.ri(14, COLS - 15), K.ri(4, ROWS - 5), 2.5 + K.R() * 1.8, T.hill, 1.3, 0.6, (t) => t !== T.rock);
    K.river(K.ri(44, 50), 40, 55, 2, 6, 0.35);
    return T.grass;
  },
  // le grand canyon : terre rouge, longues crêtes rocheuses percées de défilés, buttes et collines, pas d'eau
  canyon(K) {
    const sandN = valueNoise(K.R, 10), scrubN = valueNoise(K.R, 7);
    K.fill((c, r) => (scrubN(c, r) > 0.8 ? T.scrub : sandN(c, r) > 0.48 ? T.sand : T.grass));
    const nR = K.ri(5, 7);
    for (let k = 0; k < nR; k++) {
      let x = (k + 0.5) * ((COLS - 36) / nR) + 18 + K.ri(-3, 3), y = K.ri(0, ROWS - 1);
      let a = Math.PI / 2 * (K.R() < 0.5 ? 1 : -1) + (K.R() - 0.5) * 0.8;
      const len = K.ri(16, 32), gap = K.ri(4, len - 6), rad = 1.1 + K.R() * 0.9;
      for (let s = 0; s < len; s++) {
        if (s < gap || s > gap + 3) K.blob(x, y, rad, T.rock, 1.1, 0.5);
        a += (K.R() - 0.5) * 0.45;
        x += Math.cos(a); y += Math.sin(a);
        if (y < 0 || y >= ROWS) { a = -a; y = clamp(y, 0, ROWS - 1); }
      }
    }
    for (let k = K.ri(8, 12); k > 0; k--) K.blob(K.ri(12, COLS - 13), K.ri(1, ROWS - 2), 0.9 + K.R() * 0.9, T.rock, 1.1, 0.4);
    for (let k = K.ri(5, 8); k > 0; k--) K.blob(K.ri(14, COLS - 15), K.ri(3, ROWS - 4), 2.4 + K.R() * 2, T.hill, 1.3, 0.6, (t) => t !== T.rock);
    return T.grass;
  },
  // la sierra enneigée : neige et prairies d'altitude, forêts de pins, montagnes ; un lac gelé au milieu,
  // d'où partent deux torrents qu'on ne passe qu'aux ponts et aux gués
  sierra(K) {
    const snowN = valueNoise(K.R, 11), forestN = valueNoise(K.R, 7);
    K.fill((c, r) => (forestN(c, r) > 0.63 ? T.forest : snowN(c, r) > 0.5 ? T.snow : T.grass));
    for (let k = K.ri(10, 14); k > 0; k--) K.blob(K.ri(10, COLS - 11), K.ri(1, ROWS - 2), 1.8 + K.R() * 2, T.rock, 1.1, 0.9);
    for (let k = K.ri(4, 6); k > 0; k--) K.blob(K.ri(14, COLS - 15), K.ri(4, ROWS - 5), 2.4 + K.R() * 1.6, T.hill, 1.3, 0.6, (t) => t !== T.rock);
    const lx = COLS / 2 + K.ri(-3, 3), ly = ROWS / 2 + K.ri(-2, 2);
    K.blob(lx, ly, 5 + K.R() * 1.2, T.water, 1.5, 0.8);
    K.river(Math.round(lx) - 1, lx - 6, lx + 4, 2, 2, 0.6, 0, Math.round(ly) - 4);
    K.river(Math.round(lx) - 1, lx - 4, lx + 6, 2, 2, 0.6, Math.round(ly) + 4, ROWS - 1);
    return T.grass;
  },
  // le bayou : herbe grasse, marais, cyprès, mares ; un large bras d'eau boueuse aux ponts de bois
  bayou(K) {
    const swampN = valueNoise(K.R, 8), forestN = valueNoise(K.R, 6);
    K.fill((c, r) => (forestN(c, r) > 0.66 ? T.forest : swampN(c, r) > 0.58 ? T.swamp : T.grass));
    for (let k = K.ri(6, 9); k > 0; k--) K.blob(K.ri(18, COLS - 19), K.ri(2, ROWS - 3), 1.3 + K.R() * 1.7, T.water, 1.4, 0.9);
    for (let k = K.ri(2, 3); k > 0; k--) K.blob(K.ri(14, COLS - 15), K.ri(4, ROWS - 5), 2.2 + K.R() * 1.2, T.hill, 1.3, 0.6);
    K.river(K.ri(44, 50), 39, 54, 3, 5, 0.6);
    return T.grass;
  },
  // les salines : croûte de sel (on y file), sable, aiguilles rocheuses ; un grand lac salé au milieu
  salines(K) {
    const saltN = valueNoise(K.R, 9), scrubN = valueNoise(K.R, 7);
    K.fill((c, r) => {
      const mid = 1 - Math.abs(c - COLS / 2) / (COLS / 2);
      return scrubN(c, r) > 0.78 ? T.scrub : saltN(c, r) + mid * 0.35 > 0.62 ? T.salt : T.sand;
    });
    const lx = COLS / 2 + K.ri(-4, 4), ly = ROWS / 2 + K.ri(-3, 3);
    K.blob(lx, ly, 6 + K.R() * 1.5, T.water, 1.6, 1.2);
    K.blob(lx + K.ri(-2, 2), ly, 1.4, T.rock, 1.3, 0.4); // îlot
    for (let k = K.ri(14, 20); k > 0; k--) K.blob(K.ri(10, COLS - 11), K.ri(1, ROWS - 2), 0.8 + K.R() * 0.9, T.rock, 1.1, 0.4, K.dry);
    for (let k = K.ri(3, 5); k > 0; k--) K.blob(K.ri(14, COLS - 15), K.ri(3, ROWS - 4), 2.4 + K.R() * 1.6, T.hill, 1.3, 0.6, K.dry);
    return T.sand;
  },
};

export function rtsWorld(seed, n) {
  const R = rng((seed ^ 0x6a09e667) >>> 0);
  const biome = BIOME_IDS[Math.floor(R() * BIOME_IDS.length)];
  const forts = fortSpots(n, R);
  const tiles = new Uint8Array(COLS * ROWS);
  const K = mapKit(R, tiles);
  const base = GEN[biome](K);
  // places dégagées autour des forts
  for (const [fx, fy] of forts) {
    for (let r = fy - 7; r <= fy + 7; r++) for (let c = fx - 7; c <= fx + 7; c++) {
      const d = Math.hypot(c - fx, r - fy);
      if (d <= 3.5 || (d <= 6.3 && K.dry(K.get(c, r)))) K.set(c, r, base);
    }
  }
  const world = { seed, n, biome, tiles, forts, veins: [] };
  // tous les forts doivent être reliés au premier : sinon on taille un passage (pont sur l'eau, rocher dégagé)
  for (let pass = 0; pass < 3; pass++) {
    const reach = flowField(world, [forts[0][1] * COLS + forts[0][0]]);
    const cut = forts.filter(([fx, fy]) => !Number.isFinite(reach[fy * COLS + fx]));
    if (!cut.length) break;
    for (const [fx, fy] of cut) {
      const [gx, gy] = forts[0], steps = Math.ceil(Math.hypot(gx - fx, gy - fy) * 2);
      for (let s = 0; s <= steps; s++) {
        const c = Math.round(fx + ((gx - fx) * s) / steps), r = Math.round(fy + ((gy - fy) * s) / steps);
        for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
          const t = K.get(c + dx, r + dy);
          if (t === T.water) K.set(c + dx, r + dy, T.bridge);
          else if (!TERRAIN[t].speed) K.set(c + dx, r + dy, base);
        }
      }
    }
  }

  // filons : un d'or et un de minerai près de chaque fort (départ équitable), d'autres au hasard, plus disputés
  const free2 = (c, r) => [[0, 0], [1, 0], [0, 1], [1, 1]].every(([dx, dy]) => buildable(world, c + dx, r + dy))
    && !world.veins.some((v) => Math.abs(v.x - c) < 4 && Math.abs(v.y - r) < 4)
    && !forts.some(([fx, fy]) => Math.abs(c + 0.5 - fx) < 3 && Math.abs(r + 0.5 - fy) < 3);
  const place = (kind, test, tries = 400) => {
    for (let k = 0; k < tries; k++) {
      const c = K.ri(0, COLS - 2), r = K.ri(0, ROWS - 2);
      if (free2(c, r) && test(c, r)) { world.veins.push({ id: world.veins.length, x: c, y: r, kind }); return true; }
    }
    return false;
  };
  for (const [fx, fy] of forts) {
    for (const kind of ['gold', 'ore']) place(kind, (c, r) => { const d = Math.hypot(c + 1 - fx, r + 1 - fy); return d > 4.5 && d < 8; });
  }
  // plus loin, des filons à conquérir : il faut étendre son territoire (mines, tours) pour les atteindre
  for (const [fx, fy] of forts) place('ore', (c, r) => { const d = Math.hypot(c + 1 - fx, r + 1 - fy); return d > 11 && d < 16; });
  const extra = K.ri(8, 11);
  for (let k = 0; k < extra; k++) place(k < 5 ? 'gold' : 'ore', (c) => c > 22 && c < COLS - 24);
  for (let k = 0; k < 4; k++) place('ore', () => true);
  return world;
}

// ------------------------------------------------------------ chemins
// Distance (en secondes de marche, terrain compris) de chaque case jusqu'au but : les unités descendent la pente.
const DIRS = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]];
export function flowField(world, goals) {
  const N = COLS * ROWS;
  const dist = new Float64Array(N).fill(Infinity);
  const heap = [];
  const push = (d, i) => {
    heap.push([d, i]);
    let k = heap.length - 1;
    while (k > 0) { const p = (k - 1) >> 1; if (heap[p][0] <= heap[k][0]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; k = p; }
  };
  const pop = () => {
    const top = heap[0], last = heap.pop();
    if (heap.length) {
      heap[0] = last;
      let k = 0;
      for (;;) {
        const l = 2 * k + 1, r = l + 1;
        let m = k;
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
        if (m === k) break;
        [heap[m], heap[k]] = [heap[k], heap[m]];
        k = m;
      }
    }
    return top;
  };
  for (const g of goals) { dist[g] = 0; push(0, g); }
  while (heap.length) {
    const [d, i] = pop();
    if (d > dist[i]) continue;
    const c = i % COLS, r = (i - c) / COLS;
    for (const [dx, dy, len] of DIRS) {
      const nc = c + dx, nr = r + dy;
      const sp = speedAt(world, nc, nr);
      if (!sp) continue;
      if (dx && dy && (!speedAt(world, c + dx, r) || !speedAt(world, c, r + dy))) continue; // pas de coin coupé
      const nd = d + len / sp;
      const j = nr * COLS + nc;
      if (nd < dist[j]) { dist[j] = nd; push(nd, j); }
    }
  }
  return dist;
}

// ------------------------------------------------------------ règles de construction
// Territoire d'un joueur : autour de son fort et de chacun de ses bâtiments.
export function inTerritory(fort, blds, owner, px, py) {
  if (Math.hypot(px - fort.x, py - fort.y) <= RTS.territory) return true;
  return blds.some((b) => b.owner === owner && BUILDINGS[b.kind]?.reach && Math.hypot(px - bCenter(b).x, py - bCenter(b).y) <= BUILDINGS[b.kind].reach);
}

// Peut-on bâtir `kind` avec le coin haut-gauche en (c, r) ? Renvoie null ou la raison du refus.
export function canBuild(world, blds, owner, kind, c, r, veinsTaken) {
  const B = BUILDINGS[kind];
  if (!B) return 'Bâtiment inconnu.';
  for (let dy = 0; dy < B.w; dy++) for (let dx = 0; dx < B.w; dx++) if (!buildable(world, c + dx, r + dy)) return 'Terrain impossible (rochers, eau, bois, marais ou broussailles).';
  for (const b of blds) if (c < b.x + b.w && c + B.w > b.x && r < b.y + b.w && r + B.w > b.y) return 'La place est déjà prise.';
  const fortB = blds.find((b) => b.kind === 'fort' && b.owner === owner);
  if (!fortB) return 'Ton fort est tombé.';
  if (countOf(blds, owner, kind) >= B.max) return `Pas plus de ${B.max} : ${B.name.toLowerCase()}.`;
  if (siteOf(blds, owner)) return 'Un seul chantier à la fois : attends la fin des travaux.';
  const cx = (c + B.w / 2) * RTS.tile, cy = (r + B.w / 2) * RTS.tile;
  if (!inTerritory(bCenter(fortB), blds, owner, cx, cy)) return 'Hors de ton territoire : bâtis plus près de tes bâtiments.';
  if (kind === 'mine') {
    const v = world.veins.find((x) => x.x === c && x.y === r);
    if (!v) return 'Une mine se pose sur un filon.';
    if (veinsTaken.has(v.id)) return 'Ce filon est déjà exploité.';
  } else if (world.veins.some((v) => c < v.x + 2 && c + B.w > v.x && r < v.y + 2 && r + B.w > v.y)) return 'Garde les filons pour les mines.';
  return null;
}

// File de recrutement : une unité ('gunman') ou un entraînement ('+gunman') ; durée selon le niveau du bâtiment
export const isTech = (q) => q[0] === '+';
export const qChar = (q) => (isTech(q) ? String.fromCharCode(97 + UNIT_IDS.indexOf(q.slice(1))) : String(UNIT_IDS.indexOf(q)));
export const qOf = (ch) => (ch >= 'a' ? `+${UNIT_IDS[ch.charCodeAt(0) - 97]}` : UNIT_IDS[+ch]);

// ------------------------------------------------------------ arbitre (navigateur de l'hôte)
export class RtsGame {
  constructor(players) {
    this.kind = 'rts';
    this.seed = Math.floor(Math.random() * 2 ** 31);
    this.duration = MODES.rts.duration;
    const n = players.length;
    this.world = rtsWorld(this.seed, n);
    this.p = players.map((pl, i) => ({
      key: pl.key, name: pl.name, character: pl.character, bot: !!pl.bot,
      score: 0, left: false, alive: true, out: null,
      gold: RTS.start.gold, food: RTS.start.food, order: { mode: 'defend' },
      tech: Object.fromEntries(UNIT_IDS.map((k) => [k, 0])),
      stats: { throws: 0, catches: 0, hits: 0, hurt: 0 },
      weakUntil: -1, saidAt: -1e9, // fin du malus de trahison ; dernier message
      ai: pl.bot ? { next: 1500 + i * 400, wave: 6 + Math.floor(Math.random() * 4), pactAt: 60000 + Math.random() * 60000, grudge: new Set(), inbox: [] } : null,
    }));
    this.pacts = new Set(); // alliances (pairKey)
    this.pactAt = new Map(); // alliance -> moment où elle a été conclue
    this.offers = new Map(); // 'i>j' (i propose à j) -> fin de la proposition
    this.endPact = null; // plus que des alliés : moment où leurs alliances tombent
    this.nextId = 1;
    this.blds = this.world.forts.map(([fx, fy], i) => ({
      id: this.nextId++, owner: i, kind: 'fort', x: fx - 1, y: fy - 1, w: 3, lv: 1, up: 0, hp: FORT.hp, maxHp: FORT.hp, build: 0, queue: [], prog: 0, cd: 0,
    }));
    this.units = [];
    this.shots = [];
    this.veinsTaken = new Map(); // filon -> bâtiment
    this.flows = new Map();
    this.phase = 'playing';
    this.winner = null;
    this.ranking = null;
    this.events = [];
    this.liveOut = [];
    this.startAt = 0;
    this.lastT = 0;
    this.lastSnap = -1e9;
  }

  get t() { return Date.now() - this.startAt; }

  start() {
    this.startAt = Date.now() + COUNTDOWN;
    this.push({ type: 'mgStart', kind: this.kind, seed: this.seed, countdown: COUNTDOWN, duration: this.duration });
    this.push(this.snap());
    return this.flush();
  }

  flush() { const e = this.events; this.events = []; return e; }

  view(i) {
    return {
      kind: this.kind, me: i, phase: this.phase, winner: this.winner, ranking: this.ranking, n: this.p.length,
      players: this.p.map((p) => ({ key: p.key, name: p.name, character: p.character, score: Math.round(p.score), left: p.left, bot: p.bot, alive: p.alive })),
    };
  }

  syncView(i) { return { ...this.view(i), seed: this.seed, duration: this.duration, elapsed: this.t, snap: this.snap() }; }

  push(ev) {
    ev.dur = 0;
    ev.states = this.p.map((_, i) => this.view(i));
    this.events.push(ev);
  }

  fortOf(i) { return this.blds.find((b) => b.kind === 'fort' && b.owner === i); }
  statsOf(u) { return uStats(u.kind, this.p[u.owner].tech[u.kind], u.rank); }
  allied(a, b) { return a !== b && this.pacts.has(pairKey(a, b)); }
  foe(a, b) { return a !== b && !this.pacts.has(pairKey(a, b)); }
  weak(i) { return this.t < (this.p[i]?.weakUntil ?? -1); } // trahi depuis moins d'une minute
  inPlay(j) { return !!this.p[j]?.alive && !this.p[j].left; }
  aliveIdx() { return this.p.map((_, j) => j).filter((j) => this.inPlay(j)); }

  // ---------------------------------------------------------- commandes des joueurs
  act(i, a) {
    if (this.phase !== 'playing') return { error: 'La partie est terminée.' };
    if (!a || typeof a !== 'object') return { error: 'Action invalide.' };
    const p = this.p[i];
    if (!p || p.left) return { events: [] };
    if (!p.alive) return { error: 'Ton fort est tombé : tu regardes la fin de la partie.' };
    if (this.t < 0) return { error: 'Patience, la partie commence…' };
    let err = null;
    if (a.kind === 'build') err = this.build(i, a.b, a.x, a.y);
    else if (a.kind === 'train') err = this.train(i, a.u, a.bid);
    else if (a.kind === 'research') err = this.research(i, a.u, a.bid);
    else if (a.kind === 'upgrade') err = this.upgrade(i, a.bid);
    else if (a.kind === 'order') err = this.order(i, a);
    else if (a.kind === 'cmd') err = this.command(i, a);
    else if (a.kind === 'diplo') err = this.diplo(i, a);
    else if (a.kind === 'gift') err = this.gift(i, a);
    else if (a.kind === 'say') err = this.say(i, a);
    else err = 'Action inconnue.';
    if (err) return { error: err };
    return { events: this.flush() };
  }

  build(i, kind, c, r) {
    if (!Number.isInteger(c) || !Number.isInteger(r)) return 'Emplacement invalide.';
    const B = BUILDINGS[kind];
    if (!B) return 'Bâtiment inconnu.';
    const p = this.p[i];
    const why = canBuild(this.world, this.blds, i, kind, c, r, this.veinsTaken);
    if (why) return why;
    const cost = costOf(this.blds, i, kind);
    if (p.gold < cost) return `Pas assez d'or : ${B.name} coûte ${cost}.`;
    p.gold -= cost;
    const b = { id: this.nextId++, owner: i, kind, x: c, y: r, w: B.w, lv: 1, up: 0, hp: B.hp, maxHp: B.hp, build: B.time, queue: [], prog: 0, cd: 0 };
    if (kind === 'mine') { const v = this.world.veins.find((x) => x.x === c && x.y === r); b.vein = v.id; this.veinsTaken.set(v.id, b.id); }
    this.blds.push(b);
    return null;
  }

  // bâtiment de recrutement : celui demandé s'il convient, sinon celui dont la file est la plus courte
  producer(i, kind, bid) {
    const from = this.blds.filter((b) => b.owner === i && b.kind === kind && b.build <= 0);
    return from.find((b) => b.id === bid) || from.reduce((a, x) => (!a || x.queue.length < a.queue.length ? x : a), null);
  }

  train(i, u, bid) {
    const U = UNITS[u];
    if (!U) return 'Unité inconnue.';
    const p = this.p[i];
    const b = this.producer(i, U.from, bid);
    if (!b) return `Il faut ${U.from === 'stable' ? 'une écurie' : 'une armurerie'} pour recruter des ${U.name.toLowerCase()}s.`;
    if (p.gold < U.gold || p.food < U.food) return `${U.name} : ${U.gold} or et ${U.food} vivres.`;
    if (b.queue.length >= RTS.queueMax) return 'File de recrutement pleine.';
    p.gold -= U.gold;
    p.food -= U.food;
    b.queue.push(u);
    return null;
  }

  // entraînement d'un type d'unité (deux niveaux), au bâtiment qui la recrute
  research(i, u, bid) {
    const U = UNITS[u];
    if (!U) return 'Unité inconnue.';
    const p = this.p[i];
    const lv = p.tech[u];
    if (lv >= TECH.max) return `${U.name} : entraînement au maximum.`;
    if (this.blds.some((b) => b.owner === i && b.queue.includes(`+${u}`))) return 'Cet entraînement est déjà en cours.';
    const b = this.producer(i, U.from, bid);
    if (!b) return `Il faut ${U.from === 'stable' ? 'une écurie' : U.from === 'fort' ? 'ton fort' : 'une armurerie'}.`;
    const need = lv + 1;
    const at = (b.lv || 1) >= need ? b : this.blds.find((x) => x.owner === i && x.kind === U.from && x.build <= 0 && (x.lv || 1) >= need);
    if (!at) return `Améliore d'abord ${U.from === 'fort' ? 'ton fort' : U.from === 'stable' ? "l'écurie" : "l'armurerie"} au niveau ${need}.`;
    const [gold, food] = TECH.cost[lv];
    if (p.gold < gold || p.food < food) return `${U.tech[lv]} : ${gold} or et ${food} vivres.`;
    if (at.queue.length >= RTS.queueMax) return 'File pleine.';
    p.gold -= gold;
    p.food -= food;
    at.queue.push(`+${u}`);
    return null;
  }

  upgrade(i, bid) {
    const b = this.blds.find((x) => x.id === bid && x.owner === i);
    if (!b) return 'Bâtiment introuvable.';
    if (b.build > 0) return 'Le chantier n\'est pas fini.';
    const nx = upNext(b);
    if (!nx) return 'Déjà au niveau maximal.';
    if (siteOf(this.blds, i)) return 'Un seul chantier à la fois : attends la fin des travaux.';
    const p = this.p[i];
    if (p.gold < nx[0]) return `Pas assez d'or : l'amélioration coûte ${nx[0]}.`;
    p.gold -= nx[0];
    b.up = nx[1];
    return null;
  }

  // ordre général à toute l'armée (les ordres particuliers sont oubliés)
  order(i, a) {
    const p = this.p[i];
    if (a.mode === 'defend') p.order = { mode: 'defend' };
    else if (a.mode === 'attack' && this.allied(i, a.target)) return "Vous êtes alliés : romps d'abord l'alliance (Pactes).";
    else if (a.mode === 'attack' && Number.isInteger(a.target) && this.p[a.target]?.alive && a.target !== i) p.order = { mode: 'attack', target: a.target };
    else if (a.mode === 'rally' && Number.isFinite(a.x) && Number.isFinite(a.y)) {
      const g = passableNear(this.world, clamp(a.x, 4, RTS.mapW - 4), clamp(a.y, 4, RTS.mapH - 4));
      p.order = { mode: 'rally', x: g.x, y: g.y };
    } else return 'Ordre invalide.';
    for (const u of this.units) if (u.owner === i) u.cmd = null;
    this.push({ type: 'order', by: i, order: p.order });
    return null;
  }

  // ordre à une sélection d'unités : aller (sans s'arrêter pour tirer), charger (en combattant), tenir la position,
  // attaquer une cible, rentrer au fort, marcher sur un fort ennemi
  command(i, a) {
    if (!Array.isArray(a.ids)) return 'Ordre invalide.';
    const ids = new Set(a.ids.slice(0, RTS.maxSel));
    const mine = this.units.filter((u) => u.owner === i && ids.has(u.id));
    if (!mine.length) return null; // tombées entre-temps
    const m = a.mode;
    if (m === 'move' || m === 'amove') {
      if (!Number.isFinite(a.x) || !Number.isFinite(a.y)) return 'Ordre invalide.';
      const x = clamp(a.x, 4, RTS.mapW - 4), y = clamp(a.y, 4, RTS.mapH - 4);
      // en formation autour du point visé (les plus rapides devant)
      const cx = mine.reduce((s, u) => s + u.x, 0) / mine.length, cy = mine.reduce((s, u) => s + u.y, 0) / mine.length;
      const ang = Math.atan2(y - cy, x - cx);
      mine.sort((u, v) => UNITS[u.kind].range - UNITS[v.kind].range);
      mine.forEach((u, k) => {
        const [ox, oy] = slot(k, ang);
        const g = passableNear(this.world, clamp(x + ox, 4, RTS.mapW - 4), clamp(y + oy, 4, RTS.mapH - 4));
        u.cmd = { mode: m, x: g.x, y: g.y, at: this.t };
      });
    } else if (m === 'hold') mine.forEach((u) => { u.cmd = { mode: 'hold', x: u.x, y: u.y }; });
    else if (m === 'stop') mine.forEach((u) => { u.cmd = { mode: 'guard', x: u.x, y: u.y }; });
    else if (m === 'attack') {
      if (!Number.isInteger(a.target)) return 'Ordre invalide.';
      const tu = this.units.find((u) => u.id === a.target && u.owner !== i);
      const tb = !tu && this.blds.find((b) => b.id === a.target && b.owner !== i);
      if (!tu && !tb) return null;
      if (this.allied(i, (tu || tb).owner)) return "Vous êtes alliés : romps d'abord l'alliance (Pactes).";
      mine.forEach((u) => { u.cmd = { mode: 'attack', id: a.target }; });
    } else if (m === 'home') mine.forEach((u) => { u.cmd = { mode: 'home' }; });
    else if (m === 'fort') {
      if (!Number.isInteger(a.target) || a.target === i || !this.p[a.target]?.alive) return 'Ordre invalide.';
      if (this.allied(i, a.target)) return "Vous êtes alliés : romps d'abord l'alliance (Pactes).";
      mine.forEach((u) => { u.cmd = { mode: 'fort', target: a.target }; });
    } else return 'Ordre invalide.';
    return null;
  }

  // ---------------------------------------------------------- diplomatie
  // op : offer (proposer une alliance), accept, refuse, betray (rompre l'alliance : le trahi est affaibli 1 min)
  diplo(i, a) {
    const j = a.to;
    if (!Number.isInteger(j) || j === i || !this.inPlay(j)) return 'Ce joueur n\'est plus là.';
    const k = pairKey(i, j), q = this.p[j];
    if (a.op === 'offer' || a.op === 'accept') {
      if (this.pacts.has(k)) return 'Vous êtes déjà alliés.';
      if (this.aliveIdx().length < 3) return 'Vous n\'êtes plus que deux : un seul fort restera debout.';
      if (this.allAllied([k])) return 'Vous seriez tous alliés : il faut un ennemi commun, un seul fort gagnera.';
      const theirs = this.offers.has(`${j}>${i}`);
      if (a.op === 'accept' && !theirs) return 'Sa proposition est tombée.';
      if (a.op === 'offer' && !theirs) {
        if (this.offers.has(`${i}>${j}`)) return 'Proposition déjà envoyée : attends sa réponse.';
        this.offers.set(`${i}>${j}`, this.t + DIPLO.offerMs);
        this.push({ type: 'diplo', op: 'offer', by: i, to: j });
        return null;
      }
      // on accepte (ou chacun l'a proposée à l'autre) : cessez-le-feu entre les deux
      this.offers.delete(`${i}>${j}`);
      this.offers.delete(`${j}>${i}`);
      this.pacts.add(k);
      this.pactAt.set(k, this.t);
      this.calm(i, j);
      this.calm(j, i);
      this.push({ type: 'diplo', op: 'ally', by: i, to: j });
    } else if (a.op === 'refuse') {
      if (!this.offers.delete(`${j}>${i}`)) return null;
      this.push({ type: 'diplo', op: 'refuse', by: i, to: j });
    } else if (a.op === 'betray') {
      if (!this.pacts.has(k)) return 'Vous n\'êtes pas alliés.';
      this.pacts.delete(k);
      q.weakUntil = this.t + DIPLO.betray;
      this.push({ type: 'diplo', op: 'betray', by: i, to: j });
      if (q.ai) { q.ai.grudge.add(i); q.ai.inbox.push({ at: this.t + rnd(1200, 2500), from: i, w: 'betrayed' }); }
    } else return 'Ordre invalide.';
    return null;
  }

  // tous les joueurs en lice seraient-ils alliés entre eux (avec, en plus, ces alliances) ?
  allAllied(extra = []) {
    const alive = this.aliveIdx(), has = (k) => this.pacts.has(k) || extra.includes(k);
    return alive.length > 1 && alive.every((a) => alive.every((b) => a === b || has(pairKey(a, b))));
  }

  // plus que des alliés en lice (leur ennemi commun est tombé) : un seul doit gagner, les alliances
  // tombent d'elles-mêmes au bout de 30 s (sans malus) ; d'ici là, chacun peut trahir pour frapper le premier
  lastStand(t, alive) {
    if (!this.allAllied()) { this.endPact = null; return; }
    if (this.endPact == null) {
      this.endPact = t + DIPLO.lastStand;
      this.offers.clear();
      this.push({ type: 'diplo', op: 'lastStand', ms: DIPLO.lastStand });
      return;
    }
    if (t < this.endPact) return;
    this.endPact = null;
    for (const a of alive) for (const b of alive) if (a < b) this.pacts.delete(pairKey(a, b));
    this.push({ type: 'diplo', op: 'dissolve' });
  }

  // alliance conclue : i cesse d'attaquer j (ordre général et ordres particuliers)
  calm(i, j) {
    const p = this.p[i];
    if (p.order.mode === 'attack' && p.order.target === j) p.order = { mode: 'defend' };
    for (const u of this.units) {
      const c = u.cmd;
      if (u.owner !== i || !c) continue;
      if (c.mode === 'fort' && c.target === j) u.cmd = null;
      else if (c.mode === 'attack' && (this.units.find((v) => v.id === c.id) || this.blds.find((b) => b.id === c.id))?.owner === j) u.cmd = { mode: 'guard', x: u.x, y: u.y };
    }
  }

  // un peu d'or ou de vivres pour un autre joueur (allié, ou ennemi qu'on veut amadouer)
  gift(i, a) {
    const j = a.to;
    if (!Number.isInteger(j) || j === i || !this.inPlay(j)) return 'Ce joueur n\'est plus là.';
    const p = this.p[i], q = this.p[j];
    const gold = a.res === 'food' ? 0 : DIPLO.gift.gold, food = a.res === 'food' ? DIPLO.gift.food : 0;
    if (p.gold < gold) return `Il te faut ${gold} or.`;
    if (p.food < food) return `Il te faut ${food} vivres.`;
    p.gold -= gold; p.food -= food;
    q.gold += gold; q.food += food;
    this.push({ type: 'gift', by: i, to: j, gold, food });
    if (q.ai) q.ai.inbox.push({ at: this.t + rnd(1000, 2500), from: i, w: 'gift' });
    return null;
  }

  // message tout fait à un joueur (WORDS)
  say(i, a) {
    const j = a.to, w = WORDS[a.w];
    if (!Number.isInteger(j) || j === i || !this.p[j] || this.p[j].left) return 'Ce joueur n\'est plus là.';
    if (!w) return 'Message inconnu.';
    const p = this.p[i];
    if (this.t - p.saidAt < DIPLO.sayMs) return 'Pas si vite, cowboy.';
    p.saidAt = this.t;
    const ev = { type: 'say', by: i, to: j, w: a.w };
    if (w.id === 'help') Object.assign(ev, bCenter(this.fortOf(i)));
    if (w.id === 'join' && p.order.mode === 'attack') ev.on = p.order.target;
    this.push(ev);
    if (this.p[j].ai) this.p[j].ai.inbox.push({ at: this.t + rnd(1200, 2600), from: i, w: w.id, on: ev.on });
    return null;
  }

  // ---------------------------------------------------------- simulation
  flowTo(c, r) {
    c = clamp(c, 0, COLS - 1); r = clamp(r, 0, ROWS - 1);
    const key = r * COLS + c;
    let f = this.flows.get(key);
    if (!f) {
      if (this.flows.size > 200) this.flows.delete(this.flows.keys().next().value); // les plus anciens buts partent
      f = flowField(this.world, [key]);
      this.flows.set(key, f);
    } else { this.flows.delete(key); this.flows.set(key, f); } // les buts servis restent en tête
    return f;
  }

  homeSpot(u) {
    const f = bCenter(this.fortOf(u.owner));
    return { x: f.x + ((u.id * 37) % 40) - 20, y: f.y + 18 + ((u.id * 17) % 16) - 8, home: true };
  }

  // but de l'unité : son ordre particulier, sinon l'ordre général de son joueur
  goalOf(u) {
    const c = u.cmd;
    if (c) {
      if (c.mode === 'amove' || c.mode === 'guard') return { x: c.x, y: c.y };
      if (c.mode === 'home') return this.homeSpot(u);
      if (c.mode === 'fort' && this.p[c.target]?.alive && this.foe(u.owner, c.target)) { const f = bCenter(this.fortOf(c.target)); return { x: f.x, y: f.y }; }
    }
    const o = this.p[u.owner].order;
    if (o.mode === 'attack' && this.p[o.target]?.alive && this.foe(u.owner, o.target)) { const f = bCenter(this.fortOf(o.target)); return { x: f.x, y: f.y }; }
    if (o.mode === 'rally') return { x: o.x, y: o.y };
    return this.homeSpot(u);
  }

  step(u, tx, ty, dt, speed) {
    const c = Math.floor(u.x / RTS.tile), r = Math.floor(u.y / RTS.tile);
    const sp = speed * Math.max(0.35, speedAt(this.world, c, r) || 0.35) * dt;
    const gc = Math.floor(tx / RTS.tile), gr = Math.floor(ty / RTS.tile);
    let nx = tx, ny = ty;
    if (Math.abs(gc - c) + Math.abs(gr - r) > 1) {
      // on suit la pente de la carte des distances vers la case du but
      const f = this.flowTo(gc, gr);
      let best = f[r * COLS + c], bc = c, br = r;
      for (const [dx, dy] of DIRS) {
        const nc = c + dx, nr = r + dy;
        if (nc < 0 || nr < 0 || nc >= COLS || nr >= ROWS) continue;
        if (dx && dy && (!speedAt(this.world, c + dx, r) || !speedAt(this.world, c, r + dy))) continue;
        const d = f[nr * COLS + nc];
        if (d < best) { best = d; bc = nc; br = nr; }
      }
      nx = center(bc); ny = center(br);
    }
    const d = Math.hypot(nx - u.x, ny - u.y);
    if (d < 0.01) return true;
    const k = Math.min(1, sp / d);
    const x2 = u.x + (nx - u.x) * k, y2 = u.y + (ny - u.y) * k;
    if (speedAt(this.world, Math.floor(x2 / RTS.tile), Math.floor(y2 / RTS.tile))) { u.x = x2; u.y = y2; }
    u.face = nx < u.x ? -1 : 1;
    return d <= sp;
  }

  tick() {
    if (this.phase !== 'playing') return [];
    const t = this.t;
    if (t < 0) return this.flush();
    const dt = Math.min(0.25, Math.max(0, (t - this.lastT) / 1000));
    this.lastT = t;
    for (const [k, until] of this.offers) if (t > until) this.offers.delete(k);
    this.economy(dt);
    this.production(dt * 1000);
    this.combat(dt, t);
    this.repair(dt, t);
    this.p.forEach((p, i) => { if (p.ai && p.alive && !p.left && t >= p.ai.next) this.botThink(i, t); });
    if (t - this.lastSnap >= RTS.snapMs) { this.lastSnap = t; this.push(this.snap()); this.shots = []; }
    // pas de limite de temps : la partie s'arrête quand il ne reste qu'un fort debout (un seul gagnant)
    const alive = this.aliveIdx();
    if (this.p.length > 1 && alive.length <= 1) this.finish();
    else this.lastStand(t, alive);
    return this.flush();
  }

  // hors combat, les bâtiments se réparent doucement (le fort plus vite)
  repair(dt, t) {
    for (const b of this.blds) {
      if (b.build > 0 || b.hp >= b.maxHp || t - (b.hitAt ?? -1e9) < RTS.regen.calm) continue;
      b.hp = Math.min(b.maxHp, b.hp + (b.kind === 'fort' ? RTS.regen.fort : RTS.regen.other) * LV.hp[b.lv - 1] * dt);
    }
  }

  economy(dt) {
    this.p.forEach((p, i) => {
      if (!p.alive) return;
      const { gold, food } = incomeOf(this.world, this.blds, i);
      p.gold += gold * dt;
      p.food += food * dt;
      p.score += gold * dt * RTS_PTS.minePer;
    });
  }

  // durée de l'élément en tête de file
  qTime(b, q) {
    if (isTech(q)) return TECH.cost[Math.min(TECH.max - 1, this.p[b.owner].tech[q.slice(1)])][2];
    return UNITS[q].time * LV.train[b.lv - 1];
  }

  production(ms) {
    for (const b of this.blds) {
      if (b.build > 0) { b.build -= ms; continue; }
      if (b.up > 0) {
        b.up -= ms;
        if (b.up <= 0) {
          b.up = 0;
          b.lv++;
          const max = maxHpOf(b.kind, b.lv);
          b.hp += max - b.maxHp;
          b.maxHp = max;
        }
      }
      if (!b.queue.length) { b.prog = 0; continue; }
      const q = b.queue[0];
      const tech = isTech(q);
      if (!tech && this.units.filter((u) => u.owner === b.owner).length >= popOf(this.blds, b.owner)) continue; // armée au complet : on attend (un ranch de plus ?)
      b.prog += ms;
      if (b.prog < this.qTime(b, q)) continue;
      b.queue.shift();
      b.prog = 0;
      if (tech) { this.learn(b.owner, q.slice(1)); continue; }
      const c = bCenter(b);
      const a = Math.random() * Math.PI * 2;
      let x = c.x + Math.cos(a) * (b.w * 5 + 4), y = c.y + Math.sin(a) * (b.w * 5 + 4);
      if (!speedAt(this.world, Math.floor(x / RTS.tile), Math.floor(y / RTS.tile))) ({ x, y } = passableNear(this.world, c.x, c.y + b.w * 4 + 2));
      const hp = uStats(q, this.p[b.owner].tech[q], 0).hp;
      this.units.push({ id: this.nextId++, owner: b.owner, kind: q, x, y, hp, face: 1, shotAt: 0, xp: 0, rank: 0, cmd: null });
    }
  }

  // entraînement terminé : les unités déjà sur pied en profitent aussitôt
  learn(i, kind) {
    const p = this.p[i];
    if (p.tech[kind] >= TECH.max) return;
    const before = uStats(kind, p.tech[kind], 0).hp;
    p.tech[kind]++;
    const gain = uStats(kind, p.tech[kind], 0).hp - before;
    for (const u of this.units) if (u.owner === i && u.kind === kind) u.hp += gain;
  }

  // ennemi le plus proche (unité, sinon bâtiment) à portée de regard
  nearestFoe(u, look, preferBld) {
    let best = null, bd = look;
    if (!preferBld) {
      for (const v of this.units) {
        if (!this.foe(v.owner, u.owner)) continue;
        const d = Math.hypot(v.x - u.x, v.y - u.y);
        if (d < bd) { bd = d; best = v; }
      }
      if (best) return best;
    }
    bd = look + 10;
    for (const b of this.blds) {
      if (!this.foe(b.owner, u.owner) || !this.p[b.owner].alive) continue;
      const c = bCenter(b);
      const d = Math.hypot(c.x - u.x, c.y - u.y) - b.w * 4;
      if (d < bd) { bd = d; best = b; }
    }
    if (!best && preferBld) return this.nearestFoe(u, look, false);
    return best;
  }

  // portée d'une unité, colline comprise (seulement pour ceux qui tirent de loin)
  reachOf(u, st) {
    return st.range + (UNITS[u.kind].range >= 20 ? terrainPx(this.world, u.x, u.y).range || 0 : 0);
  }

  // marcher vers l'ennemi (sauf si on tient la position), puis tirer
  engage(u, foe, st, dt, t, still = false) {
    const isB = foe.w != null;
    const fc = isB ? bCenter(foe) : foe;
    const reach = this.reachOf(u, st) + (isB ? foe.w * 4 : 0);
    const d = Math.hypot(fc.x - u.x, fc.y - u.y);
    if (d > reach) { if (!still) this.step(u, fc.x, fc.y, dt, st.speed); return; }
    u.face = fc.x < u.x ? -1 : 1;
    const amt = isB ? st.siege : st.dps * (UNITS[u.kind].strong === foe.kind ? RTS.counter : 1) * (terrainPx(this.world, foe.x, foe.y).cover || 1);
    this.damage(foe, amt * dt * (this.weak(u.owner) ? DIPLO.weak.dps : 1), u.owner, isB, u);
    if (t - u.shotAt > (u.kind === 'dyn' && isB ? 900 : 550)) { u.shotAt = t; this.shots.push([Math.round(u.x), Math.round(u.y), Math.round(fc.x), Math.round(fc.y), UNIT_IDS.indexOf(u.kind)]); }
  }

  unitAct(u, dt, t) {
    const st = this.statsOf(u);
    const c = u.cmd;
    if (c?.mode === 'move') {
      // on file sans s'arrêter (pour se replier ou contourner) ; arrivée : on garde la place
      const x0 = u.x, y0 = u.y;
      this.step(u, c.x, c.y, dt, st.speed);
      u.stuck = Math.hypot(u.x - x0, u.y - y0) < st.speed * dt * 0.1 ? (u.stuck || 0) + dt : 0;
      if (Math.hypot(c.x - u.x, c.y - u.y) < 5 || u.stuck > 1.2) u.cmd = { mode: 'guard', x: u.x, y: u.y };
      return;
    }
    if (c?.mode === 'attack') {
      const tg = this.units.find((v) => v.id === c.id) || this.blds.find((b) => b.id === c.id && this.p[b.owner].alive);
      if (tg && this.foe(u.owner, tg.owner)) { this.engage(u, tg, st, dt, t); return; }
      u.cmd = { mode: 'guard', x: u.x, y: u.y };
    }
    if (c?.mode === 'fort' && (!this.p[c.target]?.alive || this.allied(u.owner, c.target))) u.cmd = null;
    const reach = this.reachOf(u, st);
    if (c?.mode === 'hold') {
      const foe = this.nearestFoe(u, reach + 2, u.kind === 'dyn');
      if (foe) this.engage(u, foe, st, dt, t, true);
      return;
    }
    const foe = this.nearestFoe(u, reach + 26, u.kind === 'dyn');
    const anchor = u.cmd?.mode === 'guard' ? u.cmd : null;
    if (foe && (!anchor || Math.hypot((foe.w != null ? bCenter(foe).x : foe.x) - anchor.x, (foe.w != null ? bCenter(foe).y : foe.y) - anchor.y) < RTS.leash)) {
      this.engage(u, foe, st, dt, t);
      return;
    }
    const g = this.goalOf(u);
    const d = Math.hypot(g.x - u.x, g.y - u.y);
    if (d > (g.home || anchor ? 3 : 10)) this.step(u, g.x, g.y, dt, st.speed);
    else if (u.cmd?.mode === 'amove') u.cmd = { mode: 'guard', x: u.cmd.x, y: u.cmd.y };
  }

  combat(dt, t) {
    const dead = new Set();
    for (const u of this.units) this.unitAct(u, dt, t);
    // les forts et les tours tirent sur l'unité ennemie la plus proche
    for (const b of this.blds) {
      if (b.build > 0 || (b.kind !== 'fort' && b.kind !== 'tower') || !this.p[b.owner].alive) continue;
      const c = bCenter(b);
      const g = guardOf(b.kind, b.lv);
      const range = g.range + (terrainPx(this.world, c.x, c.y).range || 0);
      let best = null, bd = range;
      for (const v of this.units) { if (!this.foe(v.owner, b.owner)) continue; const d = Math.hypot(v.x - c.x, v.y - c.y); if (d < bd) { bd = d; best = v; } }
      if (best) {
        this.damage(best, g.dps * (terrainPx(this.world, best.x, best.y).cover || 1) * dt, b.owner, false);
        if (t - b.cd > 650) { b.cd = t; this.shots.push([Math.round(c.x), Math.round(c.y - b.w * 4), Math.round(best.x), Math.round(best.y), 4]); }
      }
    }
    // séparation : les unités ne s'empilent pas (celles qui tiennent leur position bougent moins)
    for (let a = 0; a < this.units.length; a++) {
      const u = this.units[a];
      for (let b = a + 1; b < this.units.length; b++) {
        const v = this.units[b];
        const dx = v.x - u.x, dy = v.y - u.y, d = Math.hypot(dx, dy);
        if (d > 0 && d < 5) {
          const k = (5 - d) / 2 / d;
          const tryMove = (w, sx, sy) => {
            if (w.cmd?.mode === 'hold') { sx *= 0.3; sy *= 0.3; }
            if (speedAt(this.world, Math.floor((w.x + sx) / RTS.tile), Math.floor((w.y + sy) / RTS.tile))) { w.x += sx; w.y += sy; }
          };
          tryMove(u, -dx * k, -dy * k);
          tryMove(v, dx * k, dy * k);
        }
      }
    }
    for (const u of this.units) if (u.hp <= 0) dead.add(u);
    if (dead.size) this.units = this.units.filter((u) => !dead.has(u));
    // bâtiments détruits
    const razed = this.blds.filter((b) => b.hp <= 0);
    for (const b of razed) this.raze(b, t);
  }

  // src : l'unité qui tire (elle gagne de l'expérience, et du galon)
  damage(target, amount, by, isB, src = null) {
    if (this.weak(target.owner)) amount *= isB ? DIPLO.weak.bld : DIPLO.weak.hurt; // trahi : il encaisse plus
    const was = target.hp;
    target.hp -= amount;
    target.hitAt = this.t;
    if (src) src.xp += amount / (isB ? 40 : 12);
    if (was > 0 && target.hp <= 0) {
      const p = this.p[by];
      if (!p) return;
      if (isB) { target.razedBy = by; p.score += target.kind === 'fort' ? RTS_PTS.fort : RTS_PTS.raze; } else {
        p.score += RTS_PTS.kill;
        if (src) src.xp += 2 + (target.rank || 0);
      }
    }
    if (src && src.hp > 0) {
      const r = rankOf(src.xp);
      if (r > src.rank) {
        // nouveau galon : plus de PV (et un peu de soin), plus de dégâts
        const tech = this.p[src.owner].tech[src.kind];
        const before = uStats(src.kind, tech, src.rank).hp;
        src.rank = r;
        const after = uStats(src.kind, tech, r).hp;
        src.hp = Math.min(after, src.hp + (after - before) + after * 0.25);
      }
    }
  }

  raze(b, t) {
    this.blds = this.blds.filter((x) => x !== b);
    if (b.vein != null) this.veinsTaken.delete(b.vein);
    this.push({ type: 'razed', kind: b.kind, owner: b.owner, by: b.razedBy ?? -1, x: bCenter(b).x, y: bCenter(b).y });
    if (b.kind !== 'fort') return;
    // fort tombé : le joueur est éliminé, ce qui lui reste disparaît
    const p = this.p[b.owner];
    p.alive = false;
    p.out = t;
    this.blds = this.blds.filter((x) => x.owner !== b.owner);
    for (const [v, id] of [...this.veinsTaken]) if (!this.blds.some((x) => x.id === id)) this.veinsTaken.delete(v);
    this.units = this.units.filter((u) => u.owner !== b.owner);
    for (const q of this.p) if (q.order.mode === 'attack' && q.order.target === b.owner) q.order = { mode: 'defend' };
    this.dropOffers(b.owner);
    this.push({ type: 'fortDown', who: b.owner, by: b.razedBy ?? -1 });
  }

  // Instantané compact de la partie, pour tous les joueurs (les autres navigateurs l'affichent en le lissant).
  snap() {
    return {
      type: 'snap', t: Math.round(this.t),
      P: this.p.map((p, i) => [Math.floor(p.gold), Math.floor(p.food), p.alive ? 1 : 0, this.units.filter((u) => u.owner === i).length,
        p.order.mode === 'attack' ? p.order.target : p.order.mode === 'rally' ? -2 : -1, UNIT_IDS.map((k) => p.tech[k]).join(''),
        p.weakUntil > this.t ? Math.ceil((p.weakUntil - this.t) / 1000) : 0]), // secondes de malus (trahi)
      B: this.blds.map((b) => [b.id, b.owner, KIND_IDS.indexOf(b.kind), b.x, b.y, Math.max(0, Math.round(b.hp)), b.maxHp, b.build > 0 ? Math.round(b.build) : 0,
        b.queue.map(qChar).join(''), b.queue.length ? Math.round((b.prog / this.qTime(b, b.queue[0])) * 100) : 0, b.lv, b.up > 0 ? Math.round(b.up) : 0]),
      U: this.units.map((u) => [u.id, u.owner, UNIT_IDS.indexOf(u.kind), Math.round(u.x * 2), Math.round(u.y * 2), Math.max(0, Math.round(u.hp)), u.face, u.rank, Math.floor(u.xp)]),
      S: this.shots.slice(-32),
      A: [...this.pacts], O: [...this.offers.keys()], // alliances ('01') et propositions ('0>1' : 0 propose à 1)
      E: this.endPact != null ? Math.max(0, Math.ceil((this.endPact - this.t) / 1000)) : 0, // secondes avant la fin des alliances
    };
  }

  finish() {
    if (this.phase !== 'playing') return;
    this.phase = 'over';
    const order = this.p.map((_, i) => i).sort((a, b) => {
      const A = this.p[a], B = this.p[b];
      if (A.left !== B.left) return A.left - B.left;
      if (A.alive !== B.alive) return B.alive - A.alive;
      if (!A.alive) return (B.out ?? 0) - (A.out ?? 0); // éliminé plus tard = mieux classé
      return B.score - A.score;
    });
    this.p.forEach((p) => { p.score = Math.round(p.score); });
    this.ranking = order;
    this.winner = order[0];
    const tie = order.length > 1 && this.p[order[1]].alive && this.p[order[0]].alive && this.p[order[1]].score === this.p[order[0]].score;
    this.push(this.snap());
    this.push({ type: 'matchEnd', winner: this.winner, ranking: order, tie });
  }

  dropOffers(i) { for (const k of [...this.offers.keys()]) if (k.split('>').includes(String(i))) this.offers.delete(k); }

  leave(i) {
    if (this.phase !== 'playing' || !this.p[i]) return [];
    this.p[i].left = true;
    this.p[i].order = { mode: 'defend' };
    for (const u of this.units) if (u.owner === i) u.cmd = null;
    this.dropOffers(i);
    this.push({ type: 'left', who: i });
    return this.flush();
  }

  forfeit(i) {
    if (this.phase !== 'playing' || !this.p[i]) return [];
    this.p[i].left = true;
    this.finish();
    return this.flush();
  }

  // ---------------------------------------------------------- bots (mode solo)
  // Un bot suit les mêmes règles que les joueurs : un chantier à la fois, prix croissants, territoire.
  // Il pose des mines sur les filons à sa portée, un ranch dès que son armée manque de place, une plantation,
  // l'écurie puis l'armurerie ; quand il n'a plus de filon libre chez lui, il pose une tour vers le plus proche
  // pour étendre son territoire. Ensuite il améliore son fort, ses mines et entraîne ses unités.
  // Il recrute sans cesse et lance l'assaut quand son armée est assez grosse.
  // Case libre pour ce bâtiment la plus proche de (ox, oy), dans un rayon de rad px (on ne balaie qu'autour).
  findSpot(i, kind, ox, oy, rad = 90) {
    const T0 = RTS.tile;
    const c0 = clamp(Math.floor((ox - rad) / T0), 0, COLS - 2), c1 = clamp(Math.ceil((ox + rad) / T0), 0, COLS - 2);
    const r0 = clamp(Math.floor((oy - rad) / T0), 0, ROWS - 2), r1 = clamp(Math.ceil((oy + rad) / T0), 0, ROWS - 2);
    let best = null, bd = rad;
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
      const d = Math.hypot(center(c) - ox, center(r) - oy);
      if (d >= bd) continue;
      if (!canBuild(this.world, this.blds, i, kind, c, r, this.veinsTaken)) { bd = d; best = { c, r }; }
    }
    return best;
  }

  // améliorations : le fort, puis les mines sur filon d'or, l'écurie et l'armurerie, les ranchs
  botUpgrade(i, t) {
    const p = this.p[i];
    const mine = (k) => this.blds.filter((b) => b.owner === i && b.kind === k && b.build <= 0 && b.lv < LV.max);
    const gold = (b) => this.world.veins[b.vein]?.kind === 'gold';
    const cands = [];
    const fort = this.fortOf(i);
    if (fort.lv < LV.max && t > 90000 + (fort.lv - 1) * 100000) cands.push(fort);
    cands.push(...mine('mine').filter((b) => b.lv === 1 && gold(b)));
    if (t > 150000) cands.push(...mine('stable'), ...mine('armory'), ...mine('ranch'), ...mine('mine'));
    for (const b of cands) {
      const nx = upNext(b);
      if (nx && p.gold >= nx[0] + 30) return this.upgrade(i, b.id) === null;
    }
    return false;
  }

  botBuild(i, t) {
    const p = this.p[i];
    if (siteOf(this.blds, i)) return 0;
    const fc = bCenter(this.fortOf(i));
    const count = (k) => countOf(this.blds, i, k);
    const afford = (k, extra = 0) => count(k) < BUILDINGS[k].max && p.gold >= costOf(this.blds, i, k) + extra;
    const dist = (v) => Math.hypot(center(v.x) - fc.x, center(v.y) - fc.y);
    const free = this.world.veins.filter((v) => !this.veinsTaken.has(v.id)).sort((a, c) => dist(a) - dist(c));
    // 1. une mine sur le filon libre le plus proche, s'il est dans le territoire
    if (afford('mine')) {
      const v = free.find((x) => !canBuild(this.world, this.blds, i, 'mine', x.x, x.y, this.veinsTaken));
      if (v && this.build(i, 'mine', v.x, v.y) === null) return 0;
    }
    const army = this.units.filter((u) => u.owner === i).length;
    const queued = this.blds.reduce((n, b) => n + (b.owner === i ? b.queue.length : 0), 0);
    // 2. ce qui manque, dans l'ordre
    let want = null;
    if (count('ranch') < 1 || (army + queued >= popOf(this.blds, i) - 2 && count('ranch') < BUILDINGS.ranch.max)) want = 'ranch';
    else if (count('mine') >= 1 && count('farm') < 1) want = 'farm';
    else if (count('stable') < 1 && count('mine') >= 2) want = 'stable';
    else if (count('armory') < 1 && count('stable') >= 1) want = 'armory';
    else if (count('farm') < 2 && t > 120000) want = 'farm';
    let need = 0; // or mis de côté pour le prochain bâtiment
    if (want && count(want) < BUILDINGS[want].max) {
      need = costOf(this.blds, i, want);
      if (p.gold >= need) {
        const s = this.findSpot(i, want, fc.x, fc.y);
        if (s && this.build(i, want, s.c, s.r) === null) return 0;
      }
    }
    if (free.some((x) => !canBuild(this.world, this.blds, i, 'mine', x.x, x.y, this.veinsTaken)) && count('mine') < BUILDINGS.mine.max) need = Math.max(need, costOf(this.blds, i, 'mine'));
    // 3. s'étendre : une tour dans le territoire, au plus près du filon libre le plus proche qu'on ne peut pas encore exploiter
    if (afford('tower', 40) && count('mine') >= 1) {
      const v = free.find((x) => dist(x) < 260 && canBuild(this.world, this.blds, i, 'mine', x.x, x.y, this.veinsTaken));
      if (v) {
        const vx = center(v.x) + 4, vy = center(v.y) + 4;
        const s = this.findSpot(i, 'tower', vx, vy, 140);
        if (s && Math.hypot(center(s.c) - vx, center(s.r) - vy) < dist(v) - 10 && this.build(i, 'tower', s.c, s.r) === null) return 0;
      }
    }
    // 4. une tour près du fort quand la partie avance
    if (count('tower') < 2 && t > 150000 && afford('tower', 60)) {
      const s = this.findSpot(i, 'tower', fc.x + (Math.random() - 0.5) * 60, fc.y + (Math.random() - 0.5) * 60, 50);
      if (s && this.build(i, 'tower', s.c, s.r) === null) return 0;
    }
    // 5. rien à bâtir d'urgent : on améliore
    if (!want && count('stable') >= 1 && this.botUpgrade(i, t)) return 0;
    // pas de filon à portée : on économise aussi pour la tour qui étendra le territoire
    if (!need && count('mine') >= 1 && count('mine') < 4 && count('tower') < BUILDINGS.tower.max) need = costOf(this.blds, i, 'tower');
    return need;
  }

  botThink(i, t) {
    const p = this.p[i];
    const b = p.ai;
    b.next = t + rnd(1100, 1800);
    const fc = bCenter(this.fortOf(i));
    const need = this.botBuild(i, t);
    const threat = this.units.some((u) => this.foe(u.owner, i) && Math.hypot(u.x - fc.x, u.y - fc.y) < 100);
    if (this.botDiplo(i, t, threat)) return; // il vient de trahir (et d'attaquer) ou de voler au secours d'un allié
    // recruter (selon la place dans l'armée), en mélangeant les unités pour profiter des contres
    const army = this.units.filter((u) => u.owner === i);
    const queued = this.blds.reduce((n, x) => n + (x.owner === i ? x.queue.length : 0), 0);
    // on garde de quoi bâtir, sauf si l'armée est maigre ou le fort menacé
    const spare = threat || army.length < 4 ? 0 : need;
    // entraînement des unités les plus nombreuses, avant de recruter encore (l'armée est déjà là)
    let saving = false;
    if (t > 110000 && !threat && army.length >= 5) {
      const counts = UNIT_IDS.map((k) => [k, army.filter((u) => u.kind === k).length]).sort((a, c) => c[1] - a[1]);
      const [k, n] = counts[0];
      if (n >= 3 && p.tech[k] < TECH.max && !this.blds.some((x) => x.owner === i && x.queue.includes(`+${k}`))) {
        const [g, f] = TECH.cost[p.tech[k]];
        if (p.gold >= g + spare && p.food >= f) this.research(i, k);
        else saving = army.length >= 8 && Math.random() < 0.6; // on met de côté une fois sur deux à peu près
      }
    }
    if (!saving && army.length + queued < popOf(this.blds, i)) {
      const can = UNIT_IDS.filter((k) => this.blds.some((x) => x.owner === i && x.kind === UNITS[k].from && x.build <= 0));
      const w = { gunman: 4, rider: 3, rifle: 2, dyn: t > 180000 ? 3 : 1 };
      let x = Math.random() * can.reduce((s2, k) => s2 + w[k], 0), pick = can[0];
      for (const k of can) if ((x -= w[k]) <= 0) { pick = k; break; }
      if (pick && p.gold >= UNITS[pick].gold + spare && p.food >= UNITS[pick].food) this.train(i, pick);
    }
    // ordres : défendre si le fort est menacé, attaquer quand l'armée est prête
    if (threat) p.order = { mode: 'defend' };
    else if (army.length >= b.wave && t > 150000) { // 2 min 30 de répit pour s'installer
      const foes = this.p.map((q, j) => j).filter((j) => this.foe(i, j) && this.p[j].alive);
      if (foes.length) {
        // le fort le plus proche, ou un fort déjà bien entamé (pas tous sur le même joueur)
        const cost = (j) => { const f = bCenter(this.fortOf(j)); return Math.hypot(f.x - fc.x, f.y - fc.y) + this.fortOf(j).hp * 0.15 + Math.random() * 60; };
        const target = foes.sort((a, c) => cost(a) - cost(c))[0];
        if (p.order.mode !== 'attack') { p.order = { mode: 'attack', target }; b.wave = 8 + Math.floor(Math.random() * 5) + Math.floor(t / 90000); }
      }
    } else if (p.order.mode === 'attack' && army.length < 3) p.order = { mode: 'defend' };
  }

  // Diplomatie d'un bot : il répond aux propositions (pas au plus fort, ni à qui l'a trahi ; un seul allié),
  // en propose de temps en temps, remercie des dons, vient en aide à un allié, se venge d'une trahison,
  // et trahit parfois un allié affaibli ou bien plus faible que lui. Renvoie true s'il vient de lancer son armée.
  botDiplo(i, t, threat) {
    const p = this.p[i], ai = p.ai;
    const others = this.aliveIdx().filter((j) => j !== i);
    const army = (j) => this.units.reduce((n, u) => n + (u.owner === j ? 1 : 0), 0);
    const power = (j) => army(j) * 12 + this.fortOf(j).hp * 0.05 + this.p[j].score * 0.05;
    const leader = others.reduce((a, j) => (a < 0 || power(j) > power(a) ? j : a), -1);
    const allies = others.filter((j) => this.allied(i, j));
    const mine = army(i);
    const go = (target) => { p.order = { mode: 'attack', target }; ai.wave = 8 + Math.floor(Math.random() * 5) + Math.floor(t / 90000); };
    const tell = (j, id) => this.say(i, { to: j, w: WORD_IDS.indexOf(id) });
    // propositions reçues : il réfléchit un peu avant de répondre
    for (const [k, until] of [...this.offers]) {
      const [from, to] = k.split('>').map(Number);
      if (to !== i || t < until - DIPLO.offerMs + 2500) continue;
      const ok = !ai.grudge.has(from) && !allies.length && Math.random() < (from === leader ? 0.3 : 0.75);
      this.diplo(i, { op: ok ? 'accept' : 'refuse', to: from });
      if (!ok && ai.grudge.has(from)) tell(from, 'threat');
    }
    // messages, dons et trahisons reçus
    let launched = false;
    for (const m of ai.inbox.filter((x) => x.at <= t)) {
      if (!this.inPlay(m.from)) continue;
      if (m.w === 'gift') tell(m.from, 'thanks');
      else if (m.w === 'betrayed') {
        tell(m.from, 'threat');
        if (mine >= 4 && !threat) { go(m.from); launched = true; }
      } else if (m.w === 'peace' && !this.allied(i, m.from) && !ai.grudge.has(m.from) && !allies.length && Math.random() < 0.6) {
        this.diplo(i, { op: 'offer', to: m.from });
      } else if (this.allied(i, m.from) && mine >= 4 && !threat) {
        // un allié appelle à l'aide (on file sur celui qui l'assiège) ou propose une attaque commune
        let target = m.w === 'join' ? m.on : null;
        if (m.w === 'help') {
          const f = bCenter(this.fortOf(m.from)), near = new Map();
          for (const u of this.units) if (this.foe(i, u.owner) && u.owner !== m.from && Math.hypot(u.x - f.x, u.y - f.y) < 110) near.set(u.owner, (near.get(u.owner) || 0) + 1);
          target = [...near].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
        }
        if (target != null && this.inPlay(target) && this.foe(i, target)) { go(target); tell(m.from, 'ok'); launched = true; }
      }
    }
    ai.inbox = ai.inbox.filter((x) => x.at > t);
    if (launched) return true;
    // trahison : un allié depuis un moment, dont le fort est bien entamé ou l'armée bien plus maigre
    for (const j of allies) {
      const last = this.endPact != null; // les alliances vont tomber : autant frapper le premier
      if (!last && (t - (this.pactAt.get(pairKey(i, j)) ?? t) < 90000 || threat)) continue;
      const f = this.fortOf(j);
      const tempting = last ? mine >= 4 : f.hp < f.maxHp * 0.45 || (mine >= 10 && mine > army(j) * 2);
      if (tempting && Math.random() < (last ? 0.12 : 0.05)) {
        this.diplo(i, { op: 'betray', to: j });
        go(j); // il frappe pendant que l'autre est affaibli
        return true;
      }
    }
    // proposer une alliance, de temps en temps, à un joueur qui n'est pas le plus fort
    if (!allies.length && t >= ai.pactAt && others.length >= 2) {
      ai.pactAt = t + rnd(45000, 90000);
      const cands = others.filter((j) => j !== leader && !ai.grudge.has(j) && !this.offers.has(`${i}>${j}`));
      if (cands.length && Math.random() < 0.6) this.diplo(i, { op: 'offer', to: cands[Math.floor(Math.random() * cands.length)] });
    }
    return false;
  }
}

// Place de la k-ième unité d'une formation (rangs serrés, face à la direction de marche)
function slot(k, ang) {
  const row = Math.floor(k / 5), col = [0, 1, -1, 2, -2][k % 5];
  const fx = -row * 7, fy = col * 7; // derrière et sur les côtés
  const c = Math.cos(ang), s = Math.sin(ang);
  return [fx * c - fy * s, fx * s + fy * c];
}
