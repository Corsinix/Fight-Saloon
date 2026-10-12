// Règles et données de « La ville » (gestion de ville western, façon Tropico 5) : bâtiments, marchandises, cultures,
// ressources de la carte, factions, édits, ères, événements, et la génération de la carte à partir de la graine.
// Aucun DOM ni import de dessin : la simulation (villesim.js), l'arbitre (villegame.js) et les outils node
// (tools/villesim-check.mjs) le lisent tel quel.
//
// Déterminisme : la carte est recalculée par chaque navigateur depuis la graine, et la simulation tourne en lockstep
// (voir villesim.js). Tout ce qui sort d'ici doit donc être identique partout : pas de Math.random, pas de Math.sin,
// cos, exp, log ni pow non entier (leur précision varie d'un moteur à l'autre) ; + - × ÷, floor, round et sqrt sont
// exacts (IEEE 754) et suffisent.

// ------------------------------------------------------------ hasard rejouable
// mulberry32 dont l'état (un entier) se sauvegarde avec la partie : rs = { s }.
export function rnext(rs) {
  rs.s = (rs.s + 0x6d2b79f5) >>> 0;
  let t = rs.s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return (t ^ (t >>> 14)) >>> 0;
}
export const rint = (rs, n) => (n <= 0 ? 0 : rnext(rs) % n); // entier de 0 à n - 1
export const rrange = (rs, a, b) => a + rint(rs, b - a + 1); // entier de a à b inclus
export const rpct = (rs, p) => rint(rs, 10000) < Math.round(p * 100); // vrai avec p % de chances
export const rfloat = (rs) => rnext(rs) / 4294967296;

// bruit de valeur sur une grille (pour la carte) : hachage entier, interpolation douce
const hsh = (x, y, s) => {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(s | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
function vnoise(x, y, s) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hsh(xi, yi, s), b = hsh(xi + 1, yi, s), c = hsh(xi, yi + 1, s), d = hsh(xi + 1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, y, s, oct = 3) {
  let t = 0, amp = 0.5, f = 1, n = 0;
  for (let i = 0; i < oct; i++) { t += vnoise(x * f, y * f, s + i * 7919) * amp; n += amp; amp *= 0.5; f *= 2; }
  return t / n;
}
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// ------------------------------------------------------------ le temps
// Un jour de simulation = 1/3 s à vitesse ×1 ; un mois = 30 jours (10 s) ; la partie va de 1870 à 1900.
export const TIME = {
  dayMs: 333, month: 30, year: 360, start: 1870, end: 1900,
  speeds: [0, 1, 2, 3], // pause, ×1, ×2, ×3
  electionEvery: 48, // mois
  electionWarn: 6,
};
export const MONTHS = ['JANV.', 'FÉVR.', 'MARS', 'AVRIL', 'MAI', 'JUIN', 'JUIL.', 'AOÛT', 'SEPT.', 'OCT.', 'NOV.', 'DÉC.'];
export const dateOf = (day) => {
  const m = Math.floor(day / TIME.month);
  return { year: TIME.start + Math.floor(m / 12), month: m % 12, m };
};

// ------------------------------------------------------------ terrains et ressources
export const TER = { DESERT: 0, PRAIRIE: 1, FOREST: 2, WATER: 3, MESA: 4, MOUNT: 5, MARSH: 6 };
export const TER_NAMES = ['DÉSERT', 'PRAIRIE', 'FORÊT', 'EAU', 'MESA', 'MONTAGNE', 'MARAIS'];
export const buildableTer = (t) => t === TER.DESERT || t === TER.PRAIRIE || t === TER.FOREST;
export const DEP_NAME = ['', 'OR', 'ARGENT', 'CUIVRE', 'CHARBON', 'PIERRE', 'PÉTROLE', 'FER', 'SEL', 'ARGILE'];

// gisements (couche dep) : quantité restante dans depQ
export const DEP = { NONE: 0, OR: 1, ARGENT: 2, CUIVRE: 3, CHARBON: 4, PIERRE: 5, PETROLE: 6, FER: 7, SEL: 8, ARGILE: 9 };
export const DEP_IDS = ['', 'or', 'argent', 'cuivre', 'charbon', 'pierre', 'petrole', 'fer', 'sel', 'argile'];

// cultures : ce qu'elles demandent au sol (eau idéale, chaleur idéale, poids de la richesse du sol)
export const CROPS = {
  mais: { name: 'MAÏS', water: 50, heat: 55, soil: 30, tol: 60 }, // tolérant
  ble: { name: 'BLÉ', water: 55, heat: 40, soil: 40, tol: 40 },
  coton: { name: 'COTON', water: 80, heat: 85, soil: 30, tol: 30 },
  tabac: { name: 'TABAC', water: 60, heat: 70, soil: 80, tol: 30 },
  legumes: { name: 'LÉGUMES', water: 70, heat: 50, soil: 50, tol: 45 },
  fruits: { name: 'FRUITS', water: 65, heat: 60, soil: 60, tol: 35 },
};
export const CROP_IDS = Object.keys(CROPS);

// fertilité (0 à 100) d'une case pour une culture, d'après l'eau (irrigation comprise), la chaleur et le sol
export function fertility(crop, water, heat, soil) {
  const c = CROPS[crop];
  const dw = Math.abs(water - c.water), dh = Math.abs(heat - c.heat);
  let f = 100 - Math.round((dw * 100) / (c.tol + 40)) - Math.round((dh * 60) / (c.tol + 40));
  f = Math.round((f * (100 - c.soil)) / 100 + (soil * c.soil) / 100);
  if (water < 15) f = Math.round(f / 3); // trop sec : rien ne pousse
  return clamp(f, 0, 100);
}

// Filtres de carte (bouton FILTRES) : ressources de la carte puis état de la ville. ramp : couleurs du plus faible au
// plus fort (palette du jeu).
const RAMP_GOOD = ['#5a3a22', '#8a5a34', '#c2a050', '#b8e070', '#5ac85a'];
export const FILTERS = [
  { id: 'eau', name: 'EAU', group: 'res', ramp: ['#6a4a2a', '#a08050', '#90b0c0', '#5a9ad8', '#2a6ad0'] },
  ...CROP_IDS.map((c) => ({ id: c, name: CROPS[c].name, group: 'res', crop: c, ramp: RAMP_GOOD })),
  { id: 'paturage', name: 'PÂTURAGE', group: 'res', ramp: RAMP_GOOD },
  { id: 'bois', name: 'BOIS', group: 'res', ramp: ['#6a4a2a', '#7a7040', '#4a8a3a', '#2a6a2a', '#1a4a1a'] },
  { id: 'or', name: 'OR', group: 'res', dep: DEP.OR, ramp: ['#3a2a1a', '#8a6a20', '#c89a20', '#f8d070', '#fff0a0'] },
  { id: 'argent', name: 'ARGENT', group: 'res', dep: DEP.ARGENT, ramp: ['#3a2a1a', '#6a6a70', '#9a9aa8', '#c8c8d8', '#f0f0ff'] },
  { id: 'cuivre', name: 'CUIVRE', group: 'res', dep: DEP.CUIVRE, ramp: ['#3a2a1a', '#7a3a1a', '#b05a2a', '#e0844a', '#f8b080'] },
  { id: 'charbon', name: 'CHARBON', group: 'res', dep: DEP.CHARBON, ramp: ['#5a4a3a', '#4a3a30', '#3a2e28', '#2a2220', '#141010'] },
  { id: 'pierre', name: 'PIERRE', group: 'res', dep: DEP.PIERRE, ramp: ['#3a2a1a', '#6a5a4a', '#8a7a68', '#b0a088', '#d8ccb8'] },
  { id: 'fer', name: 'FER', group: 'res', dep: DEP.FER, ramp: ['#3a2a1a', '#5a3a30', '#7a4a3a', '#9a5a48', '#c07a60'] },
  { id: 'sel', name: 'SEL', group: 'res', dep: DEP.SEL, ramp: ['#3a2a1a', '#8a8a88', '#b8b8b0', '#e0e0d8', '#ffffff'] },
  { id: 'argile', name: 'ARGILE', group: 'res', dep: DEP.ARGILE, ramp: ['#3a2a1a', '#7a4a2a', '#a8603a', '#c8784a', '#e0946a'] },
  { id: 'petrole', name: 'PÉTROLE', group: 'res', dep: DEP.PETROLE, hidden: true, ramp: ['#3a2a1a', '#3a3040', '#2a2030', '#1a1020', '#000000'] },
  { id: 'foi', name: 'FOI', group: 'ville', need: 3, ramp: ['#9a2a1c', '#c2643e', '#e0c070', '#c8d8f0', '#ffffff'] },
  { id: 'loi', name: 'LOI', group: 'ville', need: 4, ramp: ['#9a2a1c', '#c2643e', '#e0c070', '#90b0e0', '#4a7ad0'] },
  { id: 'sante', name: 'SANTÉ', group: 'ville', need: 5, ramp: ['#9a2a1c', '#c2643e', '#e0c070', '#b8e070', '#5ac85a'] },
  { id: 'loisirs', name: 'LOISIRS', group: 'ville', need: 6, ramp: ['#9a2a1c', '#c2643e', '#e0c070', '#f0a0d0', '#d050a0'] },
  { id: 'education', name: 'ÉDUCATION', group: 'ville', ramp: ['#9a2a1c', '#c2643e', '#e0c070', '#b0a0f0', '#7050d0'] },
  { id: 'crime', name: 'CRIME', group: 'ville', ramp: ['#5ac85a', '#b8e070', '#e0c070', '#c2643e', '#9a2a1c'] },
  { id: 'bonheur', name: 'BONHEUR', group: 'ville', ramp: ['#9a2a1c', '#c2643e', '#e0c070', '#b8e070', '#5ac85a'] },
  { id: 'valeur', name: 'VALEUR FONCIÈRE', group: 'ville', ramp: ['#5a3a22', '#8a5a34', '#c2a050', '#f8d070', '#fff0a0'] },
  { id: 'territoire', name: 'TERRITOIRE', group: 'ville', ramp: null },
];

// ------------------------------------------------------------ marchandises (prix de base en $ l'unité)
export const GOODS = {
  mais: { name: 'MAÏS', price: 2, food: true },
  ble: { name: 'BLÉ', price: 3 },
  legumes: { name: 'LÉGUMES', price: 3, food: true },
  fruits: { name: 'FRUITS', price: 4, food: true },
  boeuf: { name: 'BŒUF', price: 5, food: true },
  porc: { name: 'PORC', price: 4, food: true },
  coton: { name: 'COTON', price: 6 },
  tabac: { name: 'TABAC', price: 7 },
  laine: { name: 'LAINE', price: 5 },
  chevaux: { name: 'CHEVAUX', price: 30 },
  bois: { name: 'BOIS', price: 2 },
  planches: { name: 'PLANCHES', price: 6 },
  farine: { name: 'FARINE', price: 5, food: true },
  whisky: { name: 'WHISKY', price: 11 },
  biere: { name: 'BIÈRE', price: 7 },
  cigares: { name: 'CIGARES', price: 18 },
  tissu: { name: 'TISSU', price: 15 },
  cuir: { name: 'CUIR', price: 9 },
  selles: { name: 'SELLES', price: 32 },
  conserves: { name: 'CONSERVES', price: 11, food: true },
  or: { name: 'OR', price: 30 },
  argent: { name: 'ARGENT', price: 18 },
  cuivre: { name: 'CUIVRE', price: 9 },
  charbon: { name: 'CHARBON', price: 5 },
  pierre: { name: 'PIERRE', price: 3 },
  fer: { name: 'FER', price: 6 },
  sel: { name: 'SEL', price: 4 },
  briques: { name: 'BRIQUES', price: 5 },
  acier: { name: 'ACIER', price: 30 },
  petrole: { name: 'PÉTROLE', price: 7 },
  lingots: { name: 'LINGOTS', price: 75 },
  outils: { name: 'OUTILS', price: 28 },
  kerosene: { name: 'KÉROSÈNE', price: 20 },
};
export const GOOD_IDS = Object.keys(GOODS);
export const FOOD_IDS = GOOD_IDS.filter((g) => GOODS[g].food);

// ------------------------------------------------------------ besoins des habitants
// L'ordre compte (tableau need de chaque habitant). Poids : part dans le bonheur.
export const NEEDS = [
  { id: 'nourriture', name: 'NOURRITURE', w: 3 },
  { id: 'logement', name: 'LOGEMENT', w: 2 },
  { id: 'travail', name: 'TRAVAIL', w: 2 },
  { id: 'foi', name: 'FOI', w: 1 },
  { id: 'loi', name: 'LOI', w: 1 },
  { id: 'sante', name: 'SANTÉ', w: 2 },
  { id: 'loisirs', name: 'LOISIRS', w: 1 },
  { id: 'liberte', name: 'LIBERTÉ', w: 1 },
];
export const N = Object.fromEntries(NEEDS.map((n, i) => [n.id, i]));
export const NEED_W = NEEDS.reduce((s, n) => s + n.w, 0);

// ------------------------------------------------------------ factions
export const FACTIONS = [
  { id: 'eleveurs', name: 'ÉLEVEURS', col: '#c2643e', likes: 'LES RANCHS, LES TERRES LIBRES' },
  { id: 'mineurs', name: 'MINEURS', col: '#8a8a98', likes: 'LES EMPLOIS, LES SALAIRES, LE DOCTEUR' },
  { id: 'pieux', name: 'PIEUX', col: '#e0d8c0', likes: 'LES ÉGLISES, LA TEMPÉRANCE' },
  { id: 'rail', name: 'CHEMIN DE FER', col: '#4a4a5a', likes: 'LE COMMERCE, LA GARE, LA BANQUE' },
  { id: 'francs', name: 'FRANCS-TIREURS', col: '#9a2a1c', likes: 'LA LIBERTÉ, LES ARMES, PEU D\'IMPÔTS' },
  { id: 'notables', name: 'NOTABLES DE L\'EST', col: '#7050d0', likes: 'L\'ORDRE, LA CULTURE, L\'INSTRUCTION' },
];
export const F = Object.fromEntries(FACTIONS.map((f, i) => [f.id, i]));

// ------------------------------------------------------------ bâtiments
// cat : onglet de construction. era : ère de déblocage. w × d : emprise en cases. cost : prix. days : chantier.
// jobs : postes (edu : instruction demandée, 0 aucune, 1 école, 2 université). wage : salaire mensuel par poste.
// upkeep : entretien mensuel fixe.
// house : { cap, q, rent } logement (q : qualité 0-100, rent : loyer par habitant et par mois).
// prod : { good, rate, res, r } production mensuelle à plein effectif ; res : ressource du sol qui la règle
//   (une culture, 'paturage', 'bois', 'dep' pour un gisement, 'riviere') ; r : rayon des champs ou du filon.
// conv : { in: { bien: n }, out: { bien: n } } transformation mensuelle à plein effectif.
// svc : { need, r, cap, q, fee } service rendu aux logements dans le rayon r (cap habitants servis, fee : $ par
//   habitant servi et par mois).
// water : { add, r } irrigation. claim : rayon de territoire. fac : approbation des factions (par bâtiment, plafonnée).
// on : contrainte de terrain ('riviere' : au bord de l'eau, 'rail' : le long de la voie, 'dep:or' : sur un filon d'or,
//   'foret', 'prairie'). unique : un seul par ville. beauty : embellit les environs (valeur foncière).
export const CATS = [
  { id: 'loger', name: 'LOGER' },
  { id: 'cultiver', name: 'CULTIVER' },
  { id: 'extraire', name: 'EXTRAIRE' },
  { id: 'industrie', name: 'INDUSTRIE' },
  { id: 'services', name: 'SERVICES' },
  { id: 'ordre', name: 'ORDRE' },
  { id: 'commerce', name: 'COMMERCE' },
  { id: 'etat', name: 'ÉTAT' },
  { id: 'routes', name: 'ROUTES' },
  { id: 'demolir', name: 'DÉMOLIR' },
];

// entretien : environ 1 % du prix par mois ; salaire de base 4 $ (les postes qualifiés, plus : wage)
const B = (id, name, cat, era, w, d, cost, o = {}) => ({ id, name, cat, era, w, d, cost, days: o.days ?? Math.max(8, Math.min(60, Math.round(cost / 15))), jobs: 0, edu: 0, ...o, wage: o.wage ? Math.round(o.wage * 1.2) : 4, upkeep: o.upkeep ?? Math.round(cost / 100) });
const LIST = [
  // ---- logement
  B('tente', 'TENTE', 'loger', 1, 1, 1, 20, { house: { cap: 3, q: 8, rent: 0 }, days: 3 }),
  B('cabane', 'CABANE', 'loger', 1, 1, 1, 60, { house: { cap: 4, q: 25, rent: 2 } }),
  B('maison', 'MAISON', 'loger', 1, 1, 1, 150, { house: { cap: 5, q: 45, rent: 3 } }),
  B('pension', 'PENSION', 'loger', 1, 2, 1, 260, { house: { cap: 12, q: 32, rent: 2 } }),
  B('brique', 'MAISON DE BRIQUE', 'loger', 2, 1, 1, 320, { house: { cap: 6, q: 65, rent: 5 } }),
  B('immeuble', 'IMMEUBLE', 'loger', 3, 2, 2, 700, { house: { cap: 24, q: 55, rent: 4 } }),
  B('villa', 'VILLA', 'loger', 3, 2, 2, 900, { house: { cap: 4, q: 95, rent: 14 }, fac: { notables: 3 } }),
  B('cite', 'CITÉ OUVRIÈRE', 'loger', 4, 2, 2, 600, { house: { cap: 30, q: 40, rent: 2 }, fac: { mineurs: 3 } }),
  // ---- agriculture et élevage (les champs sont les cases libres dans le rayon r)
  B('ferme_mais', 'FERME DE MAÏS', 'cultiver', 1, 2, 2, 120, { jobs: 4, prod: { good: 'mais', rate: 60, res: 'mais', r: 2 }, fac: { eleveurs: 1 } }),
  B('ferme_ble', 'FERME DE BLÉ', 'cultiver', 1, 2, 2, 140, { jobs: 4, prod: { good: 'ble', rate: 40, res: 'ble', r: 2 } }),
  B('potager', 'POTAGER', 'cultiver', 1, 1, 1, 60, { jobs: 2, prod: { good: 'legumes', rate: 26, res: 'legumes', r: 1 } }),
  B('coton', 'PLANTATION DE COTON', 'cultiver', 2, 2, 2, 220, { jobs: 6, prod: { good: 'coton', rate: 30, res: 'coton', r: 2 } }),
  B('tabac', 'PLANTATION DE TABAC', 'cultiver', 2, 2, 2, 240, { jobs: 6, prod: { good: 'tabac', rate: 24, res: 'tabac', r: 2 } }),
  B('verger', 'VERGER', 'cultiver', 3, 2, 2, 260, { jobs: 4, prod: { good: 'fruits', rate: 30, res: 'fruits', r: 2 } }),
  B('ranch', 'RANCH DE BOVINS', 'cultiver', 1, 2, 2, 220, { jobs: 4, prod: { good: 'boeuf', rate: 32, res: 'paturage', r: 3 }, fac: { eleveurs: 5 }, on: 'prairie' }),
  B('haras', 'RANCH DE CHEVAUX', 'cultiver', 2, 2, 2, 300, { jobs: 4, prod: { good: 'chevaux', rate: 4, res: 'paturage', r: 3 }, fac: { eleveurs: 4 }, on: 'prairie' }),
  B('bergerie', 'BERGERIE', 'cultiver', 2, 2, 1, 200, { jobs: 3, prod: { good: 'laine', rate: 20, res: 'paturage', r: 2 }, fac: { eleveurs: 2 } }),
  B('porcherie', 'PORCHERIE', 'cultiver', 1, 1, 1, 90, { jobs: 2, conv: { in: { mais: 8 }, out: { porc: 14 } } }),
  B('puits', 'PUITS', 'cultiver', 1, 1, 1, 40, { water: { add: 25, r: 2 }, days: 5 }),
  B('eolienne', 'ÉOLIENNE', 'cultiver', 2, 1, 1, 120, { water: { add: 35, r: 3 } }),
  B('canal', 'CANAL D\'IRRIGATION', 'cultiver', 2, 1, 1, 90, { water: { add: 45, r: 2 }, on: 'pres_riviere' }),
  B('chateau_eau', 'CHÂTEAU D\'EAU', 'cultiver', 3, 1, 1, 300, { water: { add: 30, r: 5 }, fire: 6 }),
  // ---- extraction
  B('bucheron', 'CAMP DE BÛCHERONS', 'extraire', 1, 1, 1, 100, { jobs: 3, prod: { good: 'bois', rate: 26, res: 'bois', r: 3 } }),
  B('placer', 'PLACER D\'ORPAILLEURS', 'extraire', 1, 1, 1, 80, { jobs: 3, prod: { good: 'or', rate: 2, res: 'riviere', r: 1 }, on: 'riviere', fac: { mineurs: 1 } }),
  B('mine_or', 'MINE D\'OR', 'extraire', 2, 2, 2, 450, { jobs: 8, prod: { good: 'or', rate: 6, res: 'dep', r: 2 }, on: 'dep:or', fac: { mineurs: 4 } }),
  B('mine_argent', 'MINE D\'ARGENT', 'extraire', 2, 2, 2, 400, { jobs: 8, prod: { good: 'argent', rate: 9, res: 'dep', r: 2 }, on: 'dep:argent', fac: { mineurs: 4 } }),
  B('mine_cuivre', 'MINE DE CUIVRE', 'extraire', 3, 2, 2, 450, { jobs: 8, prod: { good: 'cuivre', rate: 16, res: 'dep', r: 2 }, on: 'dep:cuivre', fac: { mineurs: 4 } }),
  B('mine_charbon', 'MINE DE CHARBON', 'extraire', 3, 2, 2, 400, { jobs: 8, prod: { good: 'charbon', rate: 20, res: 'dep', r: 2 }, on: 'dep:charbon', fac: { mineurs: 4 } }),
  B('mine_fer', 'MINE DE FER', 'extraire', 2, 2, 2, 420, { jobs: 8, prod: { good: 'fer', rate: 18, res: 'dep', r: 2 }, on: 'dep:fer', fac: { mineurs: 4 } }),
  B('saline', 'SALINE', 'extraire', 1, 2, 2, 160, { jobs: 4, prod: { good: 'sel', rate: 22, res: 'dep', r: 2 }, on: 'dep:sel' }),
  B('carriere', 'CARRIÈRE', 'extraire', 2, 2, 2, 200, { jobs: 5, prod: { good: 'pierre', rate: 22, res: 'dep', r: 2 }, on: 'dep:pierre' }),
  B('derrick', 'DERRICK', 'extraire', 4, 1, 1, 600, { jobs: 4, prod: { good: 'petrole', rate: 22, res: 'dep', r: 1 }, on: 'dep:petrole', fac: { rail: 3 } }),
  B('geologue', 'CABANE DU GÉOLOGUE', 'extraire', 4, 1, 1, 300, { jobs: 2, edu: 1, wage: 6, reveal: 12 }),
  // ---- industrie
  B('scierie', 'SCIERIE', 'industrie', 2, 2, 1, 300, { jobs: 4, conv: { in: { bois: 14 }, out: { planches: 10 } } }),
  B('moulin', 'MOULIN', 'industrie', 2, 1, 1, 250, { jobs: 3, conv: { in: { ble: 14 }, out: { farine: 12 } } }),
  B('distillerie', 'DISTILLERIE', 'industrie', 1, 1, 1, 300, { jobs: 4, conv: { in: { mais: 14 }, out: { whisky: 7 } }, fac: { pieux: -2 } }),
  B('brasserie', 'BRASSERIE', 'industrie', 2, 2, 1, 320, { jobs: 4, conv: { in: { ble: 12 }, out: { biere: 10 } }, fac: { pieux: -1 } }),
  B('cigares', 'MANUFACTURE DE CIGARES', 'industrie', 3, 2, 1, 500, { jobs: 6, conv: { in: { tabac: 12 }, out: { cigares: 9 } } }),
  B('filature', 'FILATURE', 'industrie', 3, 2, 2, 700, { jobs: 10, conv: { in: { coton: 18 }, out: { tissu: 12 } }, fac: { rail: 2 } }),
  B('tannerie', 'TANNERIE', 'industrie', 2, 1, 1, 300, { jobs: 4, conv: { in: { boeuf: 6 }, out: { cuir: 7 } } }),
  B('sellerie', 'SELLERIE', 'industrie', 3, 1, 1, 400, { jobs: 4, edu: 1, wage: 5, conv: { in: { cuir: 7 }, out: { selles: 3 } }, fac: { eleveurs: 2 } }),
  B('conserverie', 'CONSERVERIE', 'industrie', 3, 2, 1, 600, { jobs: 8, conv: { in: { boeuf: 10, legumes: 6 }, out: { conserves: 16 } } }),
  B('fonderie', 'FONDERIE', 'industrie', 4, 2, 2, 900, { jobs: 10, edu: 1, wage: 5, conv: { in: { fer: 10, charbon: 10 }, out: { acier: 8 } }, fac: { rail: 3, mineurs: 2 } }),
  B('forge', 'FORGE', 'industrie', 2, 1, 1, 260, { jobs: 3, conv: { in: { fer: 6 }, out: { outils: 4 } }, fac: { mineurs: 1 } }),
  B('briqueterie', 'BRIQUETERIE', 'industrie', 2, 2, 1, 280, { jobs: 5, prod: { good: 'briques', rate: 18, res: 'dep', r: 2 }, on: 'dep:argile' }),
  B('raffinerie', 'RAFFINERIE', 'industrie', 4, 2, 2, 1200, { jobs: 8, edu: 2, wage: 9, conv: { in: { petrole: 16 }, out: { kerosene: 11 } }, fac: { rail: 4 } }),
  B('essai', 'BUREAU D\'ESSAI', 'industrie', 2, 1, 1, 500, { jobs: 3, edu: 1, wage: 6, conv: { in: { or: 6 }, out: { lingots: 4 } }, fac: { notables: 1 } }),
  // ---- services
  B('magasin', 'MAGASIN GÉNÉRAL', 'services', 1, 1, 1, 180, { jobs: 2, svc: { need: 'nourriture', r: 8, cap: 40, q: 50 } }),
  B('marche', 'MARCHÉ', 'services', 2, 2, 2, 350, { jobs: 4, svc: { need: 'nourriture', r: 11, cap: 90, q: 70 } }),
  B('boulangerie', 'BOULANGERIE', 'services', 2, 1, 1, 250, { jobs: 2, svc: { need: 'nourriture', r: 7, cap: 35, q: 85 }, uses: { farine: 6 } }),
  B('saloon', 'SALOON', 'services', 1, 1, 1, 220, { jobs: 3, svc: { need: 'loisirs', r: 7, cap: 25, q: 45, fee: 1 }, uses: { whisky: 4, biere: 4 }, fac: { pieux: -3, francs: 2 } }),
  B('jeu', 'SALLE DE JEU', 'services', 2, 1, 1, 300, { jobs: 3, svc: { need: 'loisirs', r: 8, cap: 30, q: 55, fee: 2 }, fac: { pieux: -4, francs: 2 }, crime: 6 }),
  B('bal', 'SALLE DE BAL', 'services', 2, 2, 1, 400, { jobs: 4, svc: { need: 'loisirs', r: 8, cap: 40, q: 62, fee: 1 }, fac: { pieux: -1 } }),
  B('theatre', 'THÉÂTRE', 'services', 3, 2, 2, 800, { jobs: 6, edu: 1, wage: 5, svc: { need: 'loisirs', r: 12, cap: 80, q: 80, fee: 2 }, fac: { notables: 5 }, beauty: 2 }),
  B('opera', 'OPÉRA', 'services', 4, 2, 2, 1500, { jobs: 8, edu: 2, wage: 8, svc: { need: 'loisirs', r: 14, cap: 120, q: 95, fee: 3 }, fac: { notables: 8 }, beauty: 3 }),
  B('kiosque', 'KIOSQUE À MUSIQUE', 'services', 2, 1, 1, 200, { jobs: 1, svc: { need: 'loisirs', r: 6, cap: 40, q: 30 }, beauty: 2 }),
  B('eglise', 'ÉGLISE', 'services', 1, 1, 2, 300, { jobs: 1, svc: { need: 'foi', r: 9, cap: 50, q: 60 }, fac: { pieux: 6 }, beauty: 1 }),
  B('mission', 'MISSION', 'services', 2, 2, 2, 500, { jobs: 3, svc: { need: 'foi', r: 12, cap: 90, q: 75 }, fac: { pieux: 8 }, beauty: 2 }),
  B('cimetiere', 'CIMETIÈRE', 'services', 1, 2, 2, 150, { jobs: 1, svc: { need: 'foi', r: 6, cap: 60, q: 30 }, health: 5 }),
  B('ecole', 'ÉCOLE', 'services', 2, 2, 1, 400, { jobs: 2, edu: 1, wage: 5, school: { level: 1, rate: 4 }, fac: { notables: 4 } }),
  B('universite', 'UNIVERSITÉ', 'services', 4, 2, 2, 1500, { jobs: 6, edu: 2, wage: 9, school: { level: 2, rate: 3 }, fac: { notables: 8 } }),
  B('docteur', 'DOCTEUR', 'services', 1, 1, 1, 300, { jobs: 1, edu: 1, wage: 6, svc: { need: 'sante', r: 8, cap: 30, q: 55 }, fac: { mineurs: 3 } }),
  B('pharmacie', 'PHARMACIE', 'services', 2, 1, 1, 250, { jobs: 2, edu: 1, wage: 5, svc: { need: 'sante', r: 6, cap: 25, q: 45 } }),
  B('barbier', 'BARBIER', 'services', 1, 1, 1, 120, { jobs: 1, svc: { need: 'sante', r: 5, cap: 20, q: 30, fee: 1 } }),
  B('bains', 'BAINS PUBLICS', 'services', 2, 2, 1, 300, { jobs: 2, svc: { need: 'sante', r: 8, cap: 40, q: 45, fee: 1 } }),
  B('hopital', 'HÔPITAL', 'services', 3, 2, 2, 900, { jobs: 6, edu: 2, wage: 9, svc: { need: 'sante', r: 14, cap: 120, q: 85 }, fac: { mineurs: 4, notables: 3 } }),
  // ---- ordre
  B('sherif', 'BUREAU DU SHÉRIF', 'ordre', 1, 1, 1, 250, { jobs: 2, wage: 4, svc: { need: 'loi', r: 9, cap: 60, q: 60 }, fac: { francs: -2, notables: 3 } }),
  B('prison', 'PRISON', 'ordre', 2, 2, 1, 500, { jobs: 3, wage: 4, svc: { need: 'loi', r: 12, cap: 120, q: 50 }, fac: { francs: -5, notables: 3 } }),
  B('tribunal', 'TRIBUNAL', 'ordre', 3, 2, 2, 800, { jobs: 3, edu: 2, wage: 9, svc: { need: 'loi', r: 14, cap: 150, q: 80 }, fac: { notables: 6 }, beauty: 1 }),
  B('fort', 'FORT DE CAVALERIE', 'ordre', 2, 2, 2, 900, { jobs: 8, wage: 4, svc: { need: 'loi', r: 10, cap: 80, q: 40 }, defense: 50, fac: { notables: 4, eleveurs: 3, francs: -3 } }),
  B('pinkerton', 'AGENCE PINKERTON', 'ordre', 3, 1, 1, 700, { jobs: 4, edu: 1, wage: 6, defense: 30, fac: { francs: -8, rail: 5, mineurs: -4 } }),
  B('pompiers', 'POMPIERS', 'ordre', 2, 1, 1, 350, { jobs: 3, fire: 10 }),
  // ---- commerce, transport, tourisme
  B('diligence', 'DÉPÔT DE DILIGENCE', 'commerce', 1, 2, 1, 200, { jobs: 2, unique: true }),
  B('entrepot', 'ENTREPÔT', 'commerce', 1, 2, 1, 150, { jobs: 2, store: 600 }),
  B('gare', 'GARE', 'commerce', 2, 3, 1, 600, { jobs: 4, unique: true, on: 'rail', fac: { rail: 10 } }),
  B('quai', 'QUAI À VAPEUR', 'commerce', 2, 2, 1, 500, { jobs: 4, unique: true, on: 'riviere', fac: { rail: 3 } }),
  B('telegraphe', 'TÉLÉGRAPHE', 'commerce', 2, 1, 1, 300, { jobs: 1, edu: 1, wage: 5, unique: true, fac: { rail: 3, notables: 2 } }),
  B('banque', 'BANQUE', 'commerce', 2, 2, 1, 1000, { jobs: 4, edu: 1, wage: 6, unique: true, fac: { rail: 6, notables: 6 }, beauty: 1 }),
  B('hotel', 'HÔTEL', 'commerce', 3, 2, 1, 600, { jobs: 3, hotel: { cap: 10, q: 50 } }),
  B('grand_hotel', 'GRAND HÔTEL', 'commerce', 3, 2, 2, 1400, { jobs: 6, hotel: { cap: 24, q: 85 }, beauty: 2 }),
  B('wildwest', 'SPECTACLE WILD WEST', 'commerce', 3, 2, 2, 1000, { jobs: 6, attraction: 40, svc: { need: 'loisirs', r: 8, cap: 40, q: 60, fee: 1 } }),
  B('source', 'SOURCE CHAUDE', 'commerce', 3, 1, 1, 500, { jobs: 2, attraction: 25, on: 'eau70' }),
  B('safari', 'GUIDE DE SAFARI', 'commerce', 3, 1, 1, 600, { jobs: 2, attraction: 30, on: 'prairie', fac: { eleveurs: -2 } }),
  B('tramway', 'TRAMWAY', 'commerce', 4, 1, 1, 400, { jobs: 2, tram: 2 }),
  // ---- l'État et le décor
  B('mairie', 'MAIRIE', 'etat', 9, 2, 2, 0, { jobs: 2, unique: true, claim: 11, store: 800, beauty: 1 }),
  B('foncier', 'BUREAU FONCIER', 'etat', 1, 1, 1, 300, { jobs: 1, claim: 6 }),
  B('journal', 'JOURNAL', 'etat', 2, 1, 1, 500, { jobs: 3, edu: 1, wage: 5, unique: true, press: true }),
  B('statue', 'STATUE DU FONDATEUR', 'etat', 1, 1, 1, 300, { beauty: 4, fac: { notables: 1 }, liberty: 2 }),
  B('parc', 'PARC', 'etat', 1, 1, 1, 80, { beauty: 3, svc: { need: 'loisirs', r: 4, cap: 30, q: 20 } }),
  B('fontaine', 'FONTAINE', 'etat', 2, 1, 1, 150, { beauty: 4 }),
  B('place', 'PLACE DU MARCHÉ', 'etat', 2, 2, 2, 250, { beauty: 5, svc: { need: 'loisirs', r: 6, cap: 40, q: 25 } }),
];
export const BUILDINGS = Object.fromEntries(LIST.map((b) => [b.id, b]));
export const BUILDING_IDS = LIST.map((b) => b.id);

// ------------------------------------------------------------ améliorations (niveau 2, façon Tropico 5)
// À partir de l'ère 2, pour 60 % du prix : logement +50 % de place et +12 de confort (et un loyer de plus),
// service +50 % de capacité, +10 de qualité et +2 de rayon, production +35 %, stockage et hôtels +50 %, irrigation +15.
export const UPGRADE = { era: 2, rate: 1.35, cost: 0.6 };
export const upgradable = (def) => !!(def.house || def.prod || def.conv || def.svc || def.hotel || def.store || def.water) && def.cost > 0;
export const upgradeCost = (def) => Math.round(def.cost * UPGRADE.cost);
const SVC2 = new Map();
export function svcUp(s) {
  let r = SVC2.get(s);
  if (!r) { r = { ...s, cap: Math.ceil(s.cap * 1.5), q: Math.min(100, s.q + 10), r: s.r + 2 }; SVC2.set(s, r); }
  return r;
}

// ------------------------------------------------------------ missions (objectifs du maire, dans l'ordre, payés)
export const MISSIONS = [
  { text: 'BÂTIR UNE FERME OU UN RANCH', test: 'has', of: ['ferme_mais', 'ferme_ble', 'potager', 'ranch'], reward: 300 },
  { text: 'RELIER UN CAMP DE BÛCHERONS OU UNE MINE', test: 'has', of: ['bucheron', 'placer', 'mine_or', 'mine_argent', 'carriere'], reward: 300 },
  { text: 'BÂTIR UNE ÉGLISE', test: 'has', of: ['eglise', 'mission'], reward: 300 },
  { text: 'ATTEINDRE 30 HABITANTS', test: 'pop', v: 30, reward: 400 },
  { text: 'BÂTIR UN BUREAU DU SHÉRIF', test: 'has', of: ['sherif'], reward: 300 },
  { text: 'EXPORTER POUR 1 000 $', test: 'exports', v: 1000, reward: 400 },
  { text: 'BÂTIR UN SALOON', test: 'has', of: ['saloon'], reward: 300 },
  { text: 'ATTEINDRE 55 % DE BONHEUR', test: 'hap', v: 55, reward: 500 },
  { text: 'ADOPTER UN ÉDIT', test: 'edict', reward: 300 },
  { text: 'ENTRER DANS L\'ÈRE 2', test: 'era', v: 2, reward: 600 },
  { text: 'BÂTIR UNE GARE', test: 'has', of: ['gare'], reward: 600 },
  { text: 'AMÉLIORER UN BÂTIMENT', test: 'upgrade', reward: 400 },
  { text: 'GAGNER UNE ÉLECTION', test: 'elections', v: 1, reward: 800 },
  { text: 'ATTEINDRE 100 HABITANTS', test: 'pop', v: 100, reward: 800 },
  { text: 'BÂTIR UNE BANQUE', test: 'has', of: ['banque'], reward: 1000 },
  { text: 'ENTRER DANS L\'ÈRE 3', test: 'era', v: 3, reward: 1200 },
  { text: 'EXPORTER POUR 3 000 $ EN UN AN', test: 'exportsYear', v: 3000, reward: 1200 },
  { text: 'AVOIR 10 000 $ EN CAISSE', test: 'money', v: 10000, reward: 1000 },
  { text: 'ENTRER DANS L\'ÈRE 4', test: 'era', v: 4, reward: 1500 },
  { text: 'ATTEINDRE 300 HABITANTS', test: 'pop', v: 300, reward: 2500 },
];

// les routes : un type de case, posé au glisser
export const ROADS = {
  1: { id: 'chemin', name: 'CHEMIN DE TERRE', era: 1, cost: 5 },
  2: { id: 'pavee', name: 'ROUTE PAVÉE', era: 3, cost: 15 },
};
export const BRIDGE_COST = 60;

// ------------------------------------------------------------ ères
export const ERAS = [
  null,
  { n: 1, name: 'LE CAMPEMENT' },
  { n: 2, name: 'LA RUÉE', pop: 60, year: 1876, text: 'LE RAIL ARRIVE ! LA COMPAGNIE POSE SES TRAVERSES : GARE, BANQUE ET TÉLÉGRAPHE S\'OUVRENT À VOUS.' },
  { n: 3, name: 'LA VILLE PROSPÈRE', pop: 150, need: 'banque', text: 'L\'EST REGARDE ENFIN VOTRE VILLE : HÔTELS, THÉÂTRE ET TOURISTES.' },
  { n: 4, name: 'L\'ÈRE INDUSTRIELLE', year: 1888, pop: 120, text: 'LES USINES FUMENT, LE PÉTROLE JAILLIT : PLACE À L\'INDUSTRIE.' },
];

// ------------------------------------------------------------ édits
// cost : prix pour l'adopter ; upkeep : par mois ; needs : bâtiment requis ; once : effet immédiat (pas d'état actif) ;
// fac : approbation des factions tant qu'il est actif (ou une fois pour once) ; text : effets annoncés.
export const EDICTS = {
  prohibition: { name: 'PROHIBITION', short: 'PROHIBITION', cost: 200, upkeep: 10, fac: { pieux: 20, mineurs: -10, francs: -15 }, text: 'PLUS DE WHISKY NI DE BIÈRE EN VILLE. LES SALOONS PERDENT LEUR ATTRAIT, LE CRIME MONTE.' },
  armes: { name: 'INTERDICTION DES ARMES', short: 'ARMES INTERDITES', cost: 300, upkeep: 15, needs: 'sherif', fac: { francs: -20, notables: 6 }, text: 'LES REVOLVERS RESTENT AU BUREAU DU SHÉRIF : CRIME -30 %.' },
  couvrefeu: { name: 'COUVRE-FEU', short: 'COUVRE-FEU', cost: 0, upkeep: 20, fac: { francs: -10 }, text: 'CRIME -20 %, MAIS LIBERTÉ ET LOISIRS EN PÂTISSENT.' },
  fete: { name: 'FÊTE DU 4 JUILLET', short: 'FÊTE DU 4 JUILLET', cost: 400, once: true, text: 'BAL, FEU D\'ARTIFICE ET DISCOURS : +10 DE BONHEUR PENDANT UN AN.' },
  ruee: { name: 'PRIME À LA RUÉE VERS L\'OR', short: 'PRIME AUX MINEURS', cost: 100, upkeep: 50, fac: { mineurs: 10 }, text: 'LES PROSPECTEURS AFFLUENT : IMMIGRATION +50 %.' },
  betail: { name: 'TAXE SUR LE BÉTAIL', short: 'TAXE SUR LE BÉTAIL', cost: 0, upkeep: 0, fac: { eleveurs: -15 }, text: '+2 $ PAR TÊTE DE BÉTAIL VENDUE.' },
  concession: { name: 'CONCESSION AU CHEMIN DE FER', short: 'CONCESSION DU RAIL', cost: 0, upkeep: 0, needs: 'gare', fac: { rail: 15, eleveurs: -10 }, text: 'UN TRAIN TOUS LES 2 MOIS AU LIEU DE 3.' },
  pret: { name: 'PRÊT BANCAIRE', short: 'PRÊT BANCAIRE', cost: 0, once: true, needs: 'banque', text: '+3 000 $ TOUT DE SUITE, REMBOURSÉS 120 $ PAR MOIS PENDANT 30 MOIS.' },
  bourrage: { name: 'BOURRAGE DES URNES', short: 'BOURRER LES URNES', cost: 500, once: true, text: '+10 % DE VOIX À LA PROCHAINE ÉLECTION. 30 % DE RISQUE DE SCANDALE.' },
  instruction: { name: 'INSTRUCTION OBLIGATOIRE', short: 'ÉCOLE OBLIGATOIRE', cost: 200, upkeep: 40, needs: 'ecole', fac: { notables: 10, francs: -5 }, text: 'LES ÉCOLES FORMENT 50 % D\'ÉLÈVES EN PLUS.' },
  journee: { name: 'JOURNÉE DE 10 HEURES', short: 'JOURNÉE DE 10 H', cost: 0, upkeep: 0, fac: { mineurs: 15, rail: -10 }, text: 'TRAVAIL +15, MAIS LA PRODUCTION BAISSE DE 10 %.' },
  minieres: { name: 'LOI SUR LES CONCESSIONS MINIÈRES', short: 'LOI MINIÈRE', cost: 500, upkeep: 0, fac: { mineurs: -5, rail: 10 }, text: 'LES MINES PRODUISENT 25 % DE PLUS.' },
  appel: { name: 'APPEL AUX PINKERTON', short: 'LES PINKERTON', cost: 600, once: true, fac: { mineurs: -20, rail: 10, francs: -10 }, text: 'FIN DES GRÈVES ET DES BANDES DANS LES COLLINES.' },
  impots: { name: 'IMPÔTS', tax: true, text: 'BAS : LOYERS ET TAXES ×0,5. MOYENS : ×1. HAUTS : ×1,5, MAIS TOUTES LES FACTIONS GRINCENT.' },
};
export const EDICT_IDS = Object.keys(EDICTS);

// ------------------------------------------------------------ discours de campagne (une faction flattée, sa rivale vexée)
export const SPEECHES = [
  { fac: 'eleveurs', rival: 'rail', text: 'LA TERRE À CEUX QUI LA TRAVAILLENT !' },
  { fac: 'mineurs', rival: 'notables', text: 'UN JUSTE SALAIRE POUR CHAQUE PIOCHE !' },
  { fac: 'pieux', rival: 'francs', text: 'UNE VILLE PROPRE, SOBRE ET CRAIGNANT DIEU !' },
  { fac: 'rail', rival: 'eleveurs', text: 'LE PROGRÈS ARRIVE PAR LE RAIL !' },
  { fac: 'francs', rival: 'pieux', text: 'CHACUN EST LIBRE CHEZ NOUS !' },
  { fac: 'notables', rival: 'mineurs', text: 'L\'ORDRE ET LA CULTURE, COMME À BOSTON !' },
];

// ------------------------------------------------------------ exigences des factions (tous les 18 mois)
// test(town) dans villesim.js ; months : délai
export const DEMANDS = {
  eleveurs: [{ id: 'ranchs', text: 'DEUX RANCHS DE PLUS', months: 24 }, { id: 'pas_taxe', text: 'PAS DE TAXE SUR LE BÉTAIL', months: 18 }],
  mineurs: [{ id: 'docteur', text: 'UN DOCTEUR (OU MIEUX) EN VILLE', months: 18 }, { id: 'chomage', text: 'MOINS DE 5 % DE CHÔMEURS', months: 18 }],
  pieux: [{ id: 'eglise', text: 'UNE ÉGLISE DE PLUS', months: 24 }, { id: 'saloons', text: 'PAS PLUS D\'UN SALOON PAR 30 HABITANTS', months: 18 }],
  rail: [{ id: 'export', text: 'EXPORTER POUR 3 000 $', months: 24 }, { id: 'gare', text: 'UNE GARE EN SERVICE', months: 24 }],
  francs: [{ id: 'pas_armes', text: 'PAS D\'INTERDICTION DES ARMES', months: 18 }, { id: 'impots_bas', text: 'DES IMPÔTS BAS OU MOYENS', months: 18 }],
  notables: [{ id: 'ecole', text: 'UNE ÉCOLE', months: 24 }, { id: 'loi', text: 'LA LOI À PLUS DE 50 EN MOYENNE', months: 24 }],
};

// ------------------------------------------------------------ événements à choix (effets dans villesim.js)
// global : touche toute la carte (en multijoueur aussi). Les choix : [{ label, text }]
export const EVENTS = {
  bandits: { title: 'ATTAQUE DE BANDITS', text: 'LA BANDE À MCCREE FOND SUR LA VILLE ET VISE LA CAISSE MUNICIPALE.', opts: [{ label: 'PAYER 300 $', text: 'ILS REPARTENT SANS TIRER.' }, { label: 'RÉSISTER', text: 'LE SHÉRIF ET LE FORT FONT LE TRAVAIL… OU PAS.' }] },
  gang: { title: 'UN GANG DANS LES COLLINES', text: 'DES HORS-LA-LOI SE SONT INSTALLÉS AU-DESSUS DE LA VILLE. ILS RECRUTENT LES MÉCONTENTS.', opts: [{ label: 'ENVOYER UN POSSE (400 $)', text: 'LE POSSE NETTOIE LES COLLINES.' }, { label: 'LAISSER FAIRE', text: 'LE CRIME MONTERA TANT QU\'ILS SERONT LÀ.' }] },
  secheresse: { global: true, title: 'SÉCHERESSE', text: 'PAS UNE GOUTTE DE PLUIE DEPUIS DES SEMAINES. LES CHAMPS JAUNISSENT.', opts: [{ label: 'PRIER', text: 'LES PIEUX APPRÉCIENT. LES RÉCOLTES BAISSENT DE MOITIÉ PENDANT 6 MOIS.' }, { label: 'CREUSER DES PUITS (300 $)', text: 'LES RÉCOLTES NE BAISSENT QUE D\'UN QUART.' }] },
  filon: { title: 'NOUVEAU FILON', text: 'UN PROSPECTEUR DÉBARQUE AU SALOON, LES POCHES PLEINES DE PÉPITES : IL A TROUVÉ UN FILON PRÈS DE LA VILLE.', opts: [{ label: 'FORMIDABLE', text: 'UN FILON D\'OR APPARAÎT SUR LA CARTE.' }] },
  epidemie: { title: 'ÉPIDÉMIE DE CHOLÉRA', text: 'LA FIÈVRE GAGNE LES MAISONS. IL FAUT AGIR.', opts: [{ label: 'QUARANTAINE', text: 'LA PRODUCTION RALENTIT 3 MOIS, PEU DE VICTIMES.' }, { label: 'NE RIEN FAIRE', text: 'LA SANTÉ DE LA VILLE DÉCIDERA.' }] },
  incendie: { title: 'AU FEU !', text: 'UN INCENDIE VIENT DE SE DÉCLARER EN VILLE.', opts: [{ label: 'CHAÎNE DE SEAUX', text: 'TOUT LE MONDE S\'Y MET.' }] },
  greve: { title: 'GRÈVE DES MINEURS', text: 'LES MINEURS POSENT LEURS PIOCHES : ILS VEULENT DE MEILLEURS SALAIRES.', opts: [{ label: 'CÉDER (+1 $ DE SALAIRE)', text: 'LES MINES REPRENNENT, LES SALAIRES MONTENT.' }, { label: 'TENIR BON', text: 'LES MINES S\'ARRÊTENT 3 MOIS. LE CHEMIN DE FER APPRÉCIE.' }] },
  sauterelles: { global: true, title: 'NUAGE DE SAUTERELLES', text: 'LE CIEL S\'ASSOMBRIT : DES MILLIONS DE SAUTERELLES S\'ABATTENT SUR LES CHAMPS.', opts: [{ label: 'BRÛLER LES CHAMPS', text: 'LA RÉCOLTE DU MOIS EST PERDUE, PAS LA SUIVANTE.' }, { label: 'ATTENDRE', text: 'LES RÉCOLTES BAISSENT PENDANT 3 MOIS.' }] },
  krach: { global: true, title: 'KRACH À NEW YORK', text: 'LES BANQUES DE L\'EST S\'EFFONDRENT. LES PRIX DE TOUT S\'ÉCROULENT.', opts: [{ label: 'SERRER LES DENTS', text: 'PRIX -30 % PENDANT UN AN.' }] },
  gouverneur: { title: 'VISITE DU GOUVERNEUR', text: 'LE GOUVERNEUR DU TERRITOIRE VIENT INSPECTER VOTRE VILLE.', opts: [{ label: 'GRAND BANQUET (500 $)', text: 'IL REPART CHARMÉ : SUBVENTION ET NOTABLES RAVIS.' }, { label: 'SIMPLE POIGNÉE DE MAIN', text: 'IL REPART SANS RIEN DIRE.' }] },
  inondation: { global: true, title: 'CRUE DE LA RIVIÈRE', text: 'LA RIVIÈRE SORT DE SON LIT APRÈS LES ORAGES.', opts: [{ label: 'DIGUES DE SACS (200 $)', text: 'PEU DE DÉGÂTS.' }, { label: 'TANT PIS', text: 'LES BÂTIMENTS AU BORD DE L\'EAU SOUFFRENT.' }] },
  predicateur: { title: 'UN PRÉDICATEUR', text: 'UN PRÉDICATEUR AMBULANT TONNE CONTRE LE WHISKY SUR LA GRAND-RUE.', opts: [{ label: 'L\'ÉCOUTER', text: 'LES PIEUX SONT CONTENTS, LES FRANCS-TIREURS BEAUCOUP MOINS.' }, { label: 'LE CHASSER', text: 'L\'INVERSE.' }] },
  vol_betail: { title: 'VOL DE BÉTAIL', text: 'DES VOLEURS ONT FILÉ VERS LE SUD AVEC UNE PARTIE DU TROUPEAU.', opts: [{ label: 'LES POURSUIVRE (150 $)', text: 'LE SHÉRIF RAMÈNE LES BÊTES.' }, { label: 'TANT PIS', text: 'LES ÉLEVEURS S\'EN SOUVIENDRONT.' }] },
  ruee: { title: 'LA RUÉE !', text: 'LA RUMEUR D\'UN FILON FABULEUX COURT JUSQU\'À SAN FRANCISCO : DES CENTAINES DE PROSPECTEURS ARRIVENT.', opts: [{ label: 'BIENVENUE !', text: 'BEAUCOUP D\'IMMIGRANTS D\'UN COUP.' }, { label: 'FERMER LA ROUTE', text: 'PERSONNE NE VIENT.' }] },
  rachat: { title: 'UNE COMPAGNIE VEUT LA VILLE', text: 'LA PACIFIC LAND COMPANY PROPOSE D\'ACHETER LES TERRES AUTOUR DE LA GARE.', opts: [{ label: 'VENDRE (+1 500 $)', text: 'LE CHEMIN DE FER EST RAVI, LES ÉLEVEURS FURIEUX.' }, { label: 'REFUSER', text: 'LES ÉLEVEURS APPLAUDISSENT.' }] },
};
export const EVENT_IDS = Object.keys(EVENTS);

// ------------------------------------------------------------ modes de jeu (variante choisie dans le lobby)
export const MODES_VILLE = {
  rivalite: { name: 'RIVALITÉ', text: 'LE MEILLEUR SCORE EN 1900 L\'EMPORTE.' },
  ruee: { name: 'RUÉE', text: 'LE PREMIER À 50 000 $ L\'EMPORTE.', money: 50000 },
  metropole: { name: 'MÉTROPOLE', text: 'LE PREMIER À 400 HABITANTS L\'EMPORTE.', pop: 400 },
  entraide: { name: 'ENTRAIDE', text: 'ENSEMBLE : 600 HABITANTS À VOUS TOUS AVANT 1890, ET UN SCORE COMMUN.', coop: true, pop: 600, year: 1890 },
};

// noms de villes (tirés au hasard pour chaque maire)
export const TOWN_NAMES = ['DUSTY SPRINGS', 'COPPER CREEK', 'RED BLUFF', 'SILVER BELL', 'LONE PINE', 'BUZZARD GULCH', 'DRY FORK',
  'TUMBLEWEED', 'COYOTE WELLS', 'SANTA ROSITA', 'GOLDEN BEND', 'RATTLESNAKE FLATS', 'IRON HORSE', 'PRAIRIE ROSE', 'BLACK MESA', 'SALT LICK'];

// ------------------------------------------------------------ la carte
// Biomes (grandes régions) : ils règlent le terrain, le sol, la chaleur, l'eau, les arbres et les gisements.
export const BIOMES = [
  { id: 'desert', name: 'DÉSERT' },
  { id: 'canyon', name: 'CANYON' },
  { id: 'prairie', name: 'PRAIRIE' },
  { id: 'collines', name: 'COLLINES' },
  { id: 'foret', name: 'FORÊT' },
  { id: 'marais', name: 'MARAIS' },
  { id: 'montagne', name: 'MONTAGNE' },
  { id: 'salines', name: 'SALINES' },
];
export const BIO = Object.fromEntries(BIOMES.map((b, i) => [b.id.toUpperCase(), i]));
// Taille selon le nombre de maires. Les couches sont des tableaux plats (index = y * n + x).
export const mapSize = (players) => (players <= 1 ? 96 : players === 2 ? 112 : 128);

// un champ de bruit étalé de 0 à 1 sur toute la carte (les seuils des biomes deviennent des proportions)
function field(n, f) {
  const a = new Float64Array(n * n);
  let lo = 1e9, hi = -1e9;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const v = f(x, y); a[y * n + x] = v; if (v < lo) lo = v; if (v > hi) hi = v; }
  for (let i = 0; i < a.length; i++) a[i] = (a[i] - lo) / (hi - lo || 1);
  return a;
}

export function worldgen(seed, players = 1) {
  const n = mapSize(players), nn = n * n;
  const rs = { s: (seed ^ 0x5bd1e995) >>> 0 };
  const S = Array.from({ length: 10 }, () => rnext(rs) & 0xffff);
  const ter = new Uint8Array(nn), bio = new Uint8Array(nn), soil = new Uint8Array(nn), heat = new Uint8Array(nn), water0 = new Uint8Array(nn);
  const wood0 = new Uint8Array(nn), dep = new Uint8Array(nn), depQ = new Uint16Array(nn), rail = new Uint8Array(nn), river = new Uint8Array(nn);
  // relief, humidité, rugosité, grandes régions (arides ou humides), détail fin
  const elev = field(n, (x, y) => {
    const e = Math.min(x, y, n - 1 - x, n - 1 - y);
    return fbm(x / 15, y / 15, S[0], 4) + (e < 5 ? (5 - e) * 0.05 : 0);
  });
  const moist = field(n, (x, y) => fbm(x / 20, y / 20, S[1], 3));
  const rug = field(n, (x, y) => fbm(x / 11, y / 11, S[2], 3));
  const arid = field(n, (x, y) => fbm(x / 30, y / 30, S[3], 2) * 0.7 + (y / n) * 0.3);
  const fine = (x, y) => vnoise(x / 2.7, y / 2.7, S[4]);
  const wetF = new Float64Array(nn);
  for (let i = 0; i < nn; i++) wetF[i] = moist[i] * 0.65 + (1 - arid[i]) * 0.35;
  // seuils en quantiles : chaque biome garde à peu près sa part de la carte, quelle que soit la graine
  const q = (arr, p) => { const s = Float64Array.from(arr).sort(); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
  const eHi = q(elev, 0.89), eMid = q(elev, 0.5), rHi = q(rug, 0.8), rMid = q(rug, 0.68), wLo = q(wetF, 0.24), wLo2 = q(wetF, 0.32), wHi = q(wetF, 0.8), mLo = q(moist, 0.07), eLo = q(elev, 0.45);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const i = y * n + x;
    heat[i] = clamp(Math.round(22 + (y * 58) / n + (fbm(x / 9, y / 9, S[5], 2) - 0.5) * 30), 0, 100);
    const e = elev[i], m = moist[i], r = rug[i], a = arid[i], h = heat[i];
    const wet = wetF[i];
    let b;
    if (e > eHi) b = h > 58 ? BIO.CANYON : BIO.MONTAGNE;
    else if (r > rHi && e > eMid) b = h > 55 ? BIO.CANYON : BIO.COLLINES;
    else if (wet < wLo) b = m < mLo * 1.25 && a > 0.5 ? BIO.SALINES : BIO.DESERT;
    else if (wet < wLo2) b = r > rMid ? (h > 55 ? BIO.CANYON : BIO.COLLINES) : BIO.DESERT;
    else if (wet > wHi) b = e < eLo ? BIO.MARAIS : BIO.FORET;
    else b = r > rMid ? BIO.COLLINES : BIO.PRAIRIE;
    bio[i] = b;
  }
  // deux rivières : du nord au sud, et une affluente d'ouest en est qui la rejoint
  const carve = (i) => { river[i] = 1; };
  let mainX = new Int32Array(n);
  {
    let x = rrange(rs, Math.floor(n * 0.3), Math.floor(n * 0.7)), dir = 0;
    for (let y = 0; y < n; y++) {
      if (rint(rs, 100) < 35) dir = clamp(dir + (rint(rs, 2) ? 1 : -1), -1, 1);
      x = clamp(x + dir, 6, n - 8);
      mainX[y] = x;
      const w = y % 11 < 6 ? 2 : 1 + (n > 100 ? 1 : 0);
      for (let k = 0; k < w; k++) carve(y * n + x + k);
      if (dir) carve(y * n + x - dir);
    }
  }
  {
    const fromLeft = rint(rs, 2) === 0;
    let y = rrange(rs, Math.floor(n * 0.25), Math.floor(n * 0.75)), dir = 0;
    for (let s = 0; s < n; s++) {
      const x = fromLeft ? s : n - 1 - s;
      if (rint(rs, 100) < 35) dir = clamp(dir + (rint(rs, 2) ? 1 : -1), -1, 1);
      y = clamp(y + dir, 6, n - 8);
      carve(y * n + x);
      if (dir) carve((y - dir) * n + x);
      if (Math.abs(x - mainX[y]) <= 1) break; // elle se jette dans la grande
    }
  }
  // des lacs dans les forêts, les prairies et les marais
  for (let k = 0, lakes = Math.round(n / 16); k < lakes * 6 && lakes > 0; k++) {
    const cx = rrange(rs, 8, n - 9), cy = rrange(rs, 8, n - 9), c = cy * n + cx;
    if (![BIO.FORET, BIO.MARAIS, BIO.PRAIRIE].includes(bio[c]) || elev[c] > 0.6) continue;
    lakes--;
    const rad = 2 + rint(rs, 3);
    for (let y = cy - rad - 1; y <= cy + rad + 1; y++) for (let x = cx - rad - 1; x <= cx + rad + 1; x++) {
      const d = Math.hypot((x - cx) / 1.3, y - cy) + (fine(x, y) - 0.5) * 1.6;
      if (d < rad && x > 2 && y > 2 && x < n - 3 && y < n - 3) river[y * n + x] = 2;
    }
  }
  // distance à l'eau (en cases, plafonnée)
  const dist = new Uint8Array(nn).fill(255);
  {
    const q = [];
    for (let i = 0; i < nn; i++) if (river[i]) { dist[i] = 0; q.push(i); }
    for (let h = 0; h < q.length; h++) {
      const i = q[h], x = i % n, y = (i - x) / n, d = dist[i] + 1;
      if (d > 24) continue;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const X = x + dx, Y = y + dy;
        if (X < 0 || Y < 0 || X >= n || Y >= n) continue;
        const j = Y * n + X;
        if (dist[j] > d) { dist[j] = d; q.push(j); }
      }
    }
  }
  const q95 = q(elev, 0.95);
  const SOIL = [-15, -25, 20, 0, 10, 15, -20, -40], WET = [-20, -10, 0, -5, 10, 30, 0, -30], HOT = [5, 8, 0, 0, -5, 5, -22, 6];
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const i = y * n + x, b = bio[i], f = fine(x, y), d = Math.min(dist[i], 24);
    heat[i] = clamp(heat[i] + HOT[b], 0, 100);
    soil[i] = clamp(Math.round(fbm(x / 7, y / 7, S[6], 3) * 100) + SOIL[b], 0, 100);
    water0[i] = clamp(Math.round(92 - d * 7 + (moist[i] - 0.5) * 40 + WET[b]), 0, 100);
    let t;
    if (river[i]) t = TER.WATER;
    else switch (b) {
      case BIO.MONTAGNE: t = elev[i] > q95 || (elev[i] > eHi && f > 0.45) ? TER.MOUNT : f > 0.55 ? TER.FOREST : f > 0.4 ? TER.MESA : TER.PRAIRIE; break;
      case BIO.CANYON: t = f > 0.56 || elev[i] > q95 ? TER.MESA : TER.DESERT; break;
      case BIO.DESERT: t = f > 0.9 ? TER.MESA : TER.DESERT; break;
      case BIO.SALINES: t = TER.DESERT; break;
      case BIO.PRAIRIE: t = f > 0.8 ? TER.FOREST : TER.PRAIRIE; break;
      case BIO.COLLINES: t = f > 0.86 ? TER.MESA : f > 0.68 ? TER.FOREST : f < 0.3 ? TER.DESERT : TER.PRAIRIE; break;
      case BIO.FORET: t = f < 0.24 ? TER.PRAIRIE : TER.FOREST; break;
      case BIO.MARAIS: t = f > 0.56 ? TER.MARSH : f > 0.34 ? TER.FOREST : TER.PRAIRIE; break;
      default: t = TER.PRAIRIE;
    }
    ter[i] = t;
    if (t === TER.FOREST) wood0[i] = clamp(Math.round(45 + f * 60), 40, 100);
  }
  // la voie ferrée : d'ouest en est, sur la rangée la plus praticable (on franchit l'eau sur des ponts)
  let railY = Math.floor(n / 2), best = 1e9;
  for (let y = Math.floor(n * 0.3); y <= Math.floor(n * 0.7); y++) {
    let c = 0;
    for (let x = 0; x < n; x++) { const t = ter[y * n + x]; c += t === TER.MOUNT ? 6 : t === TER.MESA ? 3 : t === TER.WATER || t === TER.MARSH ? 2 : 0; }
    c += rint(rs, 4);
    if (c < best) { best = c; railY = y; }
  }
  for (let x = 0; x < n; x++) {
    const i = railY * n + x;
    rail[i] = 1;
    if (ter[i] === TER.MESA || ter[i] === TER.MOUNT || ter[i] === TER.MARSH) ter[i] = TER.DESERT; // tranchée, remblai
    if (ter[i] === TER.FOREST) { ter[i] = TER.PRAIRIE; wood0[i] = 0; }
  }
  // gisements : des amas sur les terres praticables, selon les biomes
  const dry = (i) => ter[i] === TER.DESERT || ter[i] === TER.PRAIRIE;
  const cluster = (type, count, size, qty, pick) => {
    let placed = 0;
    for (let tries = 0; placed < count && tries < count * 120; tries++) {
      const cx = rrange(rs, 4, n - 5), cy = rrange(rs, 4, n - 5), c = cy * n + cx;
      if (!dry(c) || dep[c] || rail[c] || !pick(c)) continue;
      placed++;
      const sz = rrange(rs, size[0], size[1]);
      let x = cx, y = cy;
      for (let k = 0; k < sz * 3 && k < 50; k++) {
        const i = y * n + x;
        if (dry(i) && !dep[i] && !rail[i]) { dep[i] = type; depQ[i] = rrange(rs, qty[0], qty[1]); }
        x = clamp(x + rint(rs, 3) - 1, 1, n - 2);
        y = clamp(y + rint(rs, 3) - 1, 1, n - 2);
      }
    }
  };
  const k = (n * n) / (48 * 48) * 0.75; // plus de filons sur une grande carte
  const near = (i, set) => set.includes(bio[i]);
  const rough = (i) => elev[i] > 0.5 || rug[i] > 0.55;
  cluster(DEP.OR, Math.round(4 * k), [3, 5], [250, 500], (i) => near(i, [BIO.MONTAGNE, BIO.COLLINES, BIO.CANYON]) && rough(i));
  cluster(DEP.ARGENT, Math.round(3 * k), [3, 5], [300, 600], (i) => near(i, [BIO.MONTAGNE, BIO.CANYON]));
  cluster(DEP.CUIVRE, Math.round(3 * k), [3, 6], [500, 900], (i) => near(i, [BIO.CANYON, BIO.DESERT]) && rough(i));
  cluster(DEP.CHARBON, Math.round(3 * k), [4, 6], [600, 1000], (i) => near(i, [BIO.COLLINES, BIO.FORET, BIO.MONTAGNE]));
  cluster(DEP.FER, Math.round(3 * k), [3, 6], [600, 1000], (i) => near(i, [BIO.MONTAGNE, BIO.COLLINES]));
  cluster(DEP.PIERRE, Math.round(4 * k), [3, 5], [800, 1200], (i) => near(i, [BIO.CANYON, BIO.MONTAGNE, BIO.COLLINES]));
  cluster(DEP.PETROLE, Math.round(3 * k), [2, 4], [900, 1400], (i) => near(i, [BIO.DESERT, BIO.SALINES, BIO.PRAIRIE]));
  cluster(DEP.SEL, Math.round(2 * k), [4, 7], [800, 1400], (i) => near(i, [BIO.SALINES]) || (near(i, [BIO.DESERT]) && water0[i] < 25));
  cluster(DEP.ARGILE, Math.round(3 * k), [3, 6], [700, 1200], (i) => dist[i] <= 4 && near(i, [BIO.PRAIRIE, BIO.MARAIS, BIO.FORET]));
  // les points de départ des maires : loin les uns des autres, sur une terre dégagée près de l'eau et des ressources
  const starts = startSpots(n, players, ter, rail, dep, dist, bio, rs);
  const name = Array.from({ length: players }, () => TOWN_NAMES[rint(rs, TOWN_NAMES.length)]);
  for (let a = 1; a < name.length; a++) while (name.slice(0, a).includes(name[a])) name[a] = TOWN_NAMES[(TOWN_NAMES.indexOf(name[a]) + 1) % TOWN_NAMES.length];
  return { seed, n, ter, bio, soil, heat, water0, wood0, dep, depQ, rail, railY, river, dist, starts, names: name };
}

// Chaque maire part d'une zone dégagée (7 × 7 cases praticables), près de l'eau, avec des ressources variées autour ;
// seul, près du centre ; à plusieurs, chacun dans son coin, le plus loin possible des autres.
function startSpots(n, players, ter, rail, dep, dist, bio, rs) {
  const cands = [];
  for (let y = 8; y < n - 8; y += 3) for (let x = 8; x < n - 8; x += 3) {
    let s = 0;
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
      const i = (y + dy) * n + x + dx;
      if (rail[i] || dep[i]) s -= 3;
      else if (ter[i] === TER.DESERT || ter[i] === TER.PRAIRIE) s += 2;
      else if (ter[i] === TER.FOREST) s += 1;
      else s -= 5;
    }
    if (s < 60) continue;
    const i0 = y * n + x;
    if (dist[i0] <= 8) s += 15;
    if (dist[i0] <= 2) s -= 10;
    // la variété autour : gisements, forêts, prairies
    const kinds = new Set(), bios = new Set();
    let forest = 0, prairie = 0;
    for (let dy = -14; dy <= 14; dy += 2) for (let dx = -14; dx <= 14; dx += 2) {
      const X = x + dx, Y = y + dy;
      if (X < 0 || Y < 0 || X >= n || Y >= n) continue;
      const i = Y * n + X;
      if (dep[i] && dep[i] !== DEP.PETROLE) kinds.add(dep[i]);
      bios.add(bio[i]);
      if (ter[i] === TER.FOREST) forest++;
      if (ter[i] === TER.PRAIRIE) prairie++;
    }
    s += kinds.size * 7 + bios.size * 3 + Math.min(10, forest) + Math.min(14, prairie / 2);
    cands.push([s + rint(rs, 4), x, y]);
  }
  cands.sort((a, b) => b[0] - a[0]);
  const out = [];
  if (players === 1) {
    // seul : le meilleur endroit, sans s'écarter trop du centre
    let best = null, bs = -1e9;
    for (const [s, x, y] of cands) { const v = s - (Math.abs(x - n / 2) + Math.abs(y - n / 2)) * 0.4; if (v > bs) { bs = v; best = [x, y]; } }
    out.push(best || [n >> 1, n >> 1]);
    return out;
  }
  const corners = [[0.25, 0.25], [0.75, 0.75], [0.75, 0.25], [0.25, 0.75]];
  for (let p = 0; p < players; p++) {
    const [fx, fy] = corners[p];
    let best = null, bs = -1e9;
    for (const [s, x, y] of cands) {
      if (out.some(([ox, oy]) => Math.abs(ox - x) + Math.abs(oy - y) < n * 0.4)) continue;
      const v = s - (Math.abs(x - fx * n) + Math.abs(y - fy * n)) * 0.8;
      if (v > bs) { bs = v; best = [x, y]; }
    }
    out.push(best || [Math.round(fx * n), Math.round(fy * n)]);
  }
  return out;
}

// ------------------------------------------------------------ emprise et placement
// Les cases couvertes par un bâtiment posé en (x, y), coin nord ; rot : tourné d'un quart (w et d échangés).
export const dims = (def, rot = 0) => (rot & 1 ? [def.d, def.w] : [def.w, def.d]);
export function footprint(def, x, y, rot = 0) {
  const [w, d] = dims(def, rot), out = [];
  for (let dy = 0; dy < d; dy++) for (let dx = 0; dx < w; dx++) out.push([x + dx, y + dy]);
  return out;
}
// prix d'un bâtiment (les suivants du même type ne coûtent pas plus : c'est Tropico, pas le RTS)
export const costOf = (def) => def.cost;
// salaire d'un poste selon l'instruction demandée
export const wageOf = (def) => def.wage || 3;
