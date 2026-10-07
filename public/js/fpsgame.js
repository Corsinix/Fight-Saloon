// Mini-jeu « Règlement de comptes » : FPS façon Doom dans une ville western en fausse 3D (lancer de rayons).
// Chacun pour soi : les joueurs se tirent dessus, et des bandits rôdent en ville et attaquent tout le monde.
// Ce fichier contient les règles partagées (armes, équipement, caisses, montures, carte tirée de la graine :
// chaque navigateur recalcule la même) et l'arbitre qui tourne chez l'hôte, avec la même interface que
// MiniGame (mini.js). La scène (rendu, entrées) est dans fps.js.
// Coordonnées : en cases de la grille (1 case = 1 hauteur de mur), x vers la droite, y vers le bas,
// angle a en radians (0 = +x). L'hôte fait vivre les bandits, les caisses, la dynamite et les bots ;
// chaque joueur simule son propre déplacement et ses tirs, et annonce ce qu'il touche.
import { MODES, HELP_MS, rng } from './worlds.js';
import { mapKit, MW, MH } from './fpskit.js';
import { EXTRA_MAPS } from './fpsmaps/index.js';
import { fpsEvents, fpsMods, fpsStarted, fpsSpot, fpsSpots, fpsCrowd, FpsEventLedger, FPS_GOLD, FPS_DIABLO } from './fpsevents.js';

const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const pick = (list) => list[Math.floor(Math.random() * list.length)];

// cinématique d'ouverture tournée dans le moteur (fpscut.js) : plus longue que celle des autres mini-jeux,
// et un peu plus encore au-delà de 4 joueurs (chacun garde le temps d'être présenté) ; n : joueurs, bots compris
export const FPS_CUT = 11000;
const FPS_CUT_EXTRA = 800; // ms de plus par joueur au-delà de 4
export const fpsCutLen = (n) => FPS_CUT + Math.max(0, n - 4) * FPS_CUT_EXTRA;

export const FPS = {
  hp: 100, maxArmor: 50,
  speed: 3.3, sprint: 1.35, radius: 0.24,
  // hauteur des yeux (rendu seulement : les balles volent toujours à 0,5, d'où le tir par-dessus les murets)
  eye: 0.62, eyeHorse: 0.84, eyeCart: 0.72, ceil: 1.3,
  respawn: 3000, autoSpawn: 12000, // délai avant de pouvoir revenir ; retour automatique si on traîne dans l'armurerie
  shield: 9000, shieldTake: 0.35, // étoile du shérif : on n'encaisse plus qu'un tiers des dégâts
  regen: { wait: 3500, per: 3 }, // gourde (équipement) : +3 PV/s quand on n'a pas été touché depuis 3,5 s
  crateEvery: [11000, 17000], crateMax: 2, crateLife: 45000,
  horse: { speed: 6.4, hp: 120, back: 20000, trample: 38, share: 0.55 },
  cart: { max: 8.5, accel: 4.5, brake: 7, share: 0.5 },
  dyn: { fuse: 1500, range: 6.5, radius: 2.7, dmg: 85, min: 20, self: 0.6 },
  barrel: { radius: 3.0, dmg: 100, min: 25, self: 0.6 }, // baril de poudre (ou caisse de TNT) qui saute
  // canon (E pour le servir) : un coup toutes les 8 s, portée réglée par la hausse de near à range cases
  cannon: { radius: 2.4, dmg: 90, min: 20, self: 0.6, near: 3, range: 22, every: 8000 },
  // mortier Coehorn (arme de caisse) : l'obus part en cloche, la portée suit le regard (levé : loin, baissé : près)
  mortar: { radius: 2.2, dmg: 80, min: 18, self: 0.6, near: 3, range: 16 },
  // cocktail de tord-boyaux : la bouteille éclate et laisse une grande flaque de feu (pas de souffle)
  mol: { fire: 7000, r: 1.25 },
  // pièges à loup (équipement) : posés au sol ; qui marche dessus est bloqué snare ms et perd dmg PV
  trap: { dmg: 25, snare: 2200, r: 0.42, life: 90000, max: 3 },
  fire: { life: 6000, r: 0.8, dmg: 8, every: 450, hay: 8000, lamp: 3500 }, // flaques de feu : dégâts toutes les 450 ms
  prop: { back: 45000, fall: 380, crush: 70, loot: 0.3 }, // décor détruit : il revient au bout de 45 s
  // accroupi (C) : l'œil et le corps passent sous le haut des barrières, murets et sacs de sable (0,5) ; on avance au pas
  crouch: { eye: 0.3, z: 0.3, speed: 0.45 },
  // braquage : qui fait sauter le coffre à la dynamite empoche le magot d'El Diablo (pts), des sacs d'or roulent
  // autour (au premier qui passe, bagLife ms), et les hommes d'El Diablo (posse) traquent le braqueur pendant hunt ms
  heist: { pts: 100, bags: 4, bagLife: 20000, hunt: 15000, posse: 2 },
  bar: { hp: 25, every: 25000 }, // un whisky au comptoir du saloon ou de la cantina (E), toutes les 25 s
  // bandits simultanés : base + per par joueur (au-delà de 4 joueurs, la moitié : voir fpsCrowd)
  npc: { base: 4, per: 2, every: [2200, 3600], first: 4000 },
};

// ------------------------------------------------------------ armes
// slot : 1 arme blanche, 2 arme de poing, 3 arme d'épaule, 5 arme de caisse (temporaire).
// dmg par balle (ou par plomb : pellets), rate : ms entre deux tirs, mag : chargeur, reserve : munitions de départ,
// reload : ms (rl : son de recharge), spread : dispersion (rad), range : portée utile (au-delà, dégâts divisés par deux).
// Particularités : breaks (la pioche casse le décor), tether (lasso, harpon : la cible touchée reste au bout de la corde
// et ne peut plus avancer ; tant que le tir est maintenu, elle est ramenée vers le tireur à speed cases/s, au plus max ms ;
// relâchée, elle reste encore entravée keep ms), alt (second canon au clic droit, ses propres munitions), fan (clic
// droit maintenu : on vide le barillet en tapant le chien), charge (ms : l'arc se bande en maintenant le tir, pleine
// tension : flèche enflammée), lob (le mortier tire en cloche), kick (cases de recul du tireur), leech (part des
// dégâts rendue en PV), quiet (on ne l'entend que de près), swing (ms de chaque image du geste, 110 sinon ; le coup porte
// à hitAt, sinon à la fin de la première).
export const WEAPONS = {
  bowie: { slot: 1, name: 'COUTEAU BOWIE', melee: true, dmg: 34, rate: 380, range: 1.35, sfx: 'swish' },
  tomahawk: { slot: 1, name: 'TOMAHAWK', melee: true, dmg: 55, rate: 720, range: 1.35, sfx: 'swish' },
  saber: { slot: 1, name: 'SABRE', melee: true, dmg: 42, rate: 560, range: 1.8, sfx: 'swish' },
  pickaxe: { slot: 1, name: 'PIOCHE', melee: true, dmg: 62, rate: 950, range: 1.45, sfx: 'swish', breaks: true, swing: [240, 120, 290] },
  lasso: { slot: 1, name: 'LASSO', melee: true, dmg: 12, rate: 1500, range: 5, cone: 0.32, sfx: 'whip', tether: { speed: 3.2, max: 4500, keep: 2500 }, swing: [200, 200, 200], hitAt: 260 },
  colt: { slot: 2, name: 'COLT', dmg: 24, rate: 300, mag: 6, reserve: 30, reload: 1300, spread: 0.012, range: 22, sfx: 'colt', rl: 'reload' },
  schofield: { slot: 2, name: 'SCHOFIELD', dmg: 21, rate: 270, mag: 6, reserve: 30, reload: 650, spread: 0.018, range: 20, sfx: 'schofield', rl: 'reload' },
  derringer: { slot: 2, name: 'DERRINGER', dmg: 48, rate: 260, mag: 2, reserve: 16, reload: 900, spread: 0.03, range: 10, sfx: 'derringer', rl: 'breakopen' },
  lemat: {
    slot: 2, name: 'LEMAT', dmg: 22, rate: 320, mag: 9, reserve: 27, reload: 1800, spread: 0.014, range: 20, sfx: 'colt', rl: 'reload',
    alt: { dmg: 9, pellets: 8, rate: 700, spread: 0.1, range: 9, mag: 1, reserve: 6, sfx: 'sawed' },
  },
  peacemaker: { slot: 2, name: 'PEACEMAKER', dmg: 26, rate: 380, mag: 6, reserve: 30, reload: 1400, spread: 0.01, range: 22, sfx: 'colt', rl: 'reload', fan: { rate: 85, spread: 0.09 } },
  winchester: { slot: 3, name: 'WINCHESTER', dmg: 30, rate: 480, mag: 12, reserve: 36, reload: 2000, spread: 0.006, range: 30, sfx: 'winchester', rl: 'shells' },
  pump: { slot: 3, name: 'FUSIL À POMPE', dmg: 10, pellets: 8, rate: 850, mag: 6, reserve: 24, reload: 2200, spread: 0.075, range: 12, sfx: 'shotgun', rl: 'shells' },
  sawed: { slot: 3, name: 'CANON SCIÉ', dmg: 11, pellets: 10, rate: 280, mag: 2, reserve: 20, reload: 1600, spread: 0.13, range: 8, sfx: 'sawed', rl: 'breakopen' },
  sharps: { slot: 3, name: 'CARABINE SHARPS', dmg: 95, rate: 1300, mag: 1, reserve: 15, reload: 1100, spread: 0.002, range: 45, zoom: true, sfx: 'sharps', rl: 'breakopen' },
  bow: { slot: 3, name: 'ARC', dmg: 72, rate: 300, mag: 1, reserve: 20, reload: 420, spread: 0.003, range: 30, charge: 850, quiet: true, sfx: 'bow', rl: 'nock' },
  harpoon: { slot: 3, name: 'FUSIL À HARPON', dmg: 70, rate: 1400, mag: 1, reserve: 10, reload: 1500, spread: 0.003, range: 16, tether: { speed: 4.2, max: 3500, keep: 0 }, sfx: 'harpoon', rl: 'breakopen' },
  // armes de caisse : elles remplacent le reste jusqu'à la fin de leur temps ou de leur chargeur
  gatling: { slot: 5, temp: true, name: 'GATLING', dmg: 9, rate: 85, mag: 90, spread: 0.05, range: 24, auto: true, ms: 15000, slow: 0.7, sfx: 'gatling' },
  akimbo: { slot: 5, temp: true, name: 'DEUX COLTS', dmg: 24, rate: 210, mag: 32, spread: 0.02, range: 22, dual: true, ms: 15000, sfx: 'akimbo' },
  goldwin: { slot: 5, temp: true, name: 'WINCHESTER DORÉE', dmg: 45, rate: 340, mag: 15, spread: 0.004, range: 40, pierce: true, ms: 20000, sfx: 'goldwin' },
  coehorn: { slot: 5, temp: true, name: 'MORTIER', dmg: 0, rate: 1200, mag: 4, spread: 0, range: 16, lob: true, ms: 25000, slow: 0.8, sfx: 'mortar' },
  puntgun: { slot: 5, temp: true, name: 'CANARDIÈRE', dmg: 8, pellets: 22, rate: 1500, mag: 3, spread: 0.16, range: 14, kick: 2.6, ms: 20000, slow: 0.75, sfx: 'punt' },
  diablo: { slot: 5, temp: true, name: 'PISTOLET DU DIABLE', dmg: 32, rate: 250, mag: 24, spread: 0.01, range: 26, leech: 0.4, ms: 25000, sfx: 'diablo' },
};
export const MELEE = ['bowie', 'tomahawk', 'saber', 'pickaxe', 'lasso'];
export const PISTOLS = ['colt', 'schofield', 'derringer', 'lemat', 'peacemaker'];
export const LONGS = ['winchester', 'pump', 'sawed', 'sharps', 'bow', 'harpoon'];
export const TEMPS = Object.keys(WEAPONS).filter((id) => WEAPONS[id].temp);
// dégâts maximum annoncés en un tir (vérifiés par l'hôte)
export const maxShot = (id) => {
  const w = WEAPONS[id];
  if (id === 'horse') return FPS.horse.trample;
  if (!w) return 0;
  const alt = w.alt ? w.alt.dmg * (w.alt.pellets || 1) : 0;
  return Math.max(w.dmg * (w.pellets || 1) * (w.dual ? 2 : 1), alt) * 2;
};

// Équipement (un seul, choisi à l'armurerie). Dynamite, cocktails et pièges se lancent ou se posent (G) ; le reste
// est passif. THROWN : ce qui se tient en main à l'emplacement 4 (n : nombre au départ, clé du compteur).
export const EQUIP = {
  dynamite: { name: 'DYNAMITE', desc: '3 BÂTONS À LANCER (G)', dyn: 3 },
  molotov: { name: 'COCKTAIL', desc: '3 BOUTEILLES DE FEU À LANCER (G)', mol: 3 },
  traps: { name: 'PIÈGES À LOUP', desc: '2 PIÈGES À POSER AU SOL (G)', traps: 2 },
  vest: { name: 'GILET DE CUIR', desc: `+${FPS.maxArmor} D'ARMURE`, armor: FPS.maxArmor },
  flask: { name: 'GOURDE', desc: 'REGAGNE DES PV À L\'ABRI' },
  spurs: { name: 'ÉPERONS', desc: 'COURT 15 % PLUS VITE' },
  bandolier: { name: 'CARTOUCHIÈRE', desc: 'MUNITIONS x1,6' },
};
export const THROWN = { dynamite: { key: 'dyn', name: 'DYNAMITE' }, molotov: { key: 'mol', name: 'COCKTAIL' }, trap: { key: 'traps', name: 'PIÈGE À LOUP' } };
export const EQUIPS = Object.keys(EQUIP);
export const DEFAULT_LOADOUT = { m: 'bowie', p: 'colt', l: 'winchester', e: 'dynamite' };
export function cleanLoadout(lo = {}) {
  return {
    m: MELEE.includes(lo.m) ? lo.m : DEFAULT_LOADOUT.m,
    p: PISTOLS.includes(lo.p) ? lo.p : DEFAULT_LOADOUT.p,
    l: LONGS.includes(lo.l) ? lo.l : DEFAULT_LOADOUT.l,
    e: EQUIPS.includes(lo.e) ? lo.e : DEFAULT_LOADOUT.e,
  };
}

// Caisses de ravitaillement : elles apparaissent au hasard sur la carte, le contenu est tiré à l'ouverture.
// Rien de décisif : des soins, des munitions, un peu d'armure, et de temps en temps une arme de caisse.
export const LOOT = {
  ammo: { name: 'MUNITIONS', w: 30 },
  whisky: { name: 'WHISKY : +35 PV', w: 22, hp: 35 },
  armor: { name: 'GILET : +25 ARMURE', w: 14, armor: 25 },
  dynamite: { name: 'DYNAMITE x2', w: 10, dyn: 2 },
  star: { name: 'ÉTOILE DU SHÉRIF', w: 6 },
  gatling: { name: 'GATLING !', w: 6, gun: 'gatling' },
  akimbo: { name: 'DEUX COLTS !', w: 7, gun: 'akimbo' },
  goldwin: { name: 'WINCHESTER DORÉE !', w: 5, gun: 'goldwin' },
  coehorn: { name: 'MORTIER ! LÈVE LES YEUX POUR TIRER LOIN', w: 5, gun: 'coehorn' },
  puntgun: { name: 'CANARDIÈRE ! GARE AU RECUL', w: 5, gun: 'puntgun' },
  // le pistolet d'El Diablo : seulement dans la caisse qu'il lâche en tombant
  diablo: { name: 'LE PISTOLET DU DIABLE !', w: 0, gun: 'diablo' },
};
const LOOT_SETS = { power: ['gatling', 'akimbo', 'goldwin', 'coehorn', 'puntgun', 'star'], heal: ['whisky', 'armor'], ammo: ['ammo', 'dynamite'], diablo: ['diablo'] };
function rollLoot(force) {
  const ids = force && LOOT_SETS[force] ? LOOT_SETS[force] : Object.keys(LOOT);
  let x = Math.random() * ids.reduce((s, id) => s + LOOT[id].w, 0);
  for (const id of ids) if ((x -= LOOT[id].w) <= 0) return id;
  return ids[0];
}

// Bandits (PNJ de l'hôte). range : distance de tir, acc : précision de près, aim : temps de visée (ms).
export const NPCS = {
  bandit: { name: 'BANDIT', hp: 50, pts: 100, speed: 2.2, range: 12, dmg: 8, acc: 0.62, aim: 520, every: 1500, r: 0.3 },
  rifleman: { name: 'TIREUR', hp: 60, pts: 150, speed: 2.0, range: 20, dmg: 13, acc: 0.6, aim: 800, every: 2200, r: 0.3, keep: 8 },
  brute: { name: 'GROS BRAS', hp: 130, pts: 200, speed: 1.7, range: 6, dmg: 22, acc: 0.7, aim: 600, every: 1800, r: 0.38 },
  dynamiter: { name: 'DYNAMITEUR', hp: 40, pts: 150, speed: 2.4, range: 9, dmg: 0, acc: 1, aim: 700, every: 3200, r: 0.3, throws: true, keep: 5 },
  diablo: { name: 'EL DIABLO', hp: FPS_DIABLO.hp, pts: 100, speed: 2.0, range: 16, dmg: 12, acc: 0.7, aim: 380, every: 650, r: 0.45, boss: true },
};
export const FPS_PTS = { frag: 250, death: -50, self: -50 };
// « Mort ou vif » (sans bandits) : un point par rival abattu, un de moins pour un suicide, la mort ne coûte rien
export const FPS_DM = { frag: 1, self: -1, bounty: 1 };
export const isDm = (kind) => kind === 'fpsdm';
// événements qui n'ont pas de sens sans bandits (ou qui donnent des points sans frag)
const npcEvent = (e) => !!(e.mods && (e.mods.npcRate || e.mods.npcMax || e.mods.npcKinds || e.mods.npcPts || e.mods.boss || e.mods.gold));

// ------------------------------------------------------------ décor interactif
// Ce qui réagit aux balles, aux explosions et au feu : des objets du décor (clé `d<k>`, k = rang dans world.deco)
// et des murs bas de la grille (clé `c<i>`, i = case). L'hôte tient leur état et l'annonce (événement 'prop') ;
// chaque navigateur l'applique à sa copie de la carte (applyProp).
// hp : points de vie face aux balles (sans hp, seuls les explosions et le feu l'atteignent) ; r : rayon touché par
// une balle ; pass : la balle continue (objet suspendu ou fin) ; blast : portée d'une explosion qui l'atteint.
export const PROPS = {
  tnt: { hp: 20, r: 0.3, blast: 3 }, // baril de poudre, caisse de TNT : saute (et fait sauter les voisins)
  barrel: { hp: 60, r: 0.3, blast: 1.8 }, // tonneau : vole en éclats, parfois une caisse dedans
  hay: { blast: 2.4 }, // foin : prend feu, brûle, puis il n'en reste rien
  crates: { blast: 1.6 }, // pile de caisses : soufflée par les explosions
  boulder: { blast: 1.5 }, // rocher (canyon) : la dynamite ou un boulet le fait voler en éclats
  safe: { blast: 2.2 }, // coffre de la banque : la dynamite l'éventre, le butin s'en échappe
  lantern: { hp: 1, r: 0.16, pass: true, blast: 2.4 }, // lanterne suspendue : tombe, l'huile prend feu
  // lustre : s'écrase sur ceux qui sont dessous ; au milieu de la salle, il faut le viser (rayon serré, 3 balles de colt)
  // pour qu'il ne tombe pas à chaque échange de tirs
  chandelier: { hp: 70, r: 0.18, pass: true, blast: 2 },
  lamp: { hp: 1, r: 0.12, pass: true, blast: 2 }, // réverbère : la vitre éclate, l'huile flambe au pied
  bottle: { hp: 1, r: 0.1, pass: true, blast: 2.4 }, // bouteille : en mille morceaux
};
// ce que la pioche casse d'un coup (pas le coffre : il faut de la dynamite ; pas le foin : il prendrait feu)
export const PICKABLE = new Set(['tnt', 'barrel', 'crates', 'boulder', 'bottle', 'lamp', 'lantern']);
const PROP_DECO = { barrelTnt: 'tnt', barrel: 'barrel', hayBale: 'hay', safe: 'safe', lantern: 'lantern', chandelier: 'chandelier', lamp: 'lamp', bottle: 'bottle' };
const PROP_CELL = { tnt: 'tnt', crates: 'crates', hay: 'hay', canyonBoulder: 'boulder', ghostRubble: 'crates', portCotton: 'hay', portCordwood: 'crates' };

// État d'un objet du décor : 'ok' (ou rien), 'gone' (détruit), 'burn' (en feu), 'broken' (réverbère sans vitre),
// 'fallen' (lustre au sol), 'open' (coffre éventré). Un objet détruit n'arrête plus personne ; un mur bas détruit
// laisse sa case vide (et praticable pour les bandits et les bots).
export function applyProp(w, pr, st) {
  pr.st = st;
  if (pr.k != null) { w.deco[pr.k].gone = st === 'gone'; return; }
  const C = w.cells, i = pr.i;
  if (st === 'gone') { C.h[i] = 0; C.wall[i] = C.up[i] = C.inn[i] = 0; } else [C.h[i], C.wall[i], C.up[i], C.inn[i]] = pr.orig;
  if (w.pass) w.pass[i] = st === 'gone' ? 1 : 0;
}
// ================================================================ cartes
// Carte tirée de la graine (chaque navigateur recalcule la même) : la ville (townWorld, ci-dessous) ou une
// des autres cartes (fpsmaps/*.js). Outils communs et description rendue par un générateur : fpskit.js.
export { MW, MH };
const ZONE_POOL = ['boothill', 'ranch', 'mine', 'fort'];
// emplacements des quartiers autour de la ville (la gare est toujours au nord, la grand-rue au milieu)
const SLOTS = [
  { id: 'W', x0: 1, y0: 14, x1: 12, y1: 33, out: 'w' },
  { id: 'E', x0: 47, y0: 14, x1: 58, y1: 33, out: 'e' },
  { id: 'SW', x0: 1, y0: 35, x1: 29, y1: 46, out: 's' },
  { id: 'SE', x0: 30, y0: 35, x1: 58, y1: 46, out: 's' },
];
export const STREET = { y0: 21, y1: 25 };

// Les cartes : id -> générateur (seed) => { kit, spec } (voir MAP_SPEC dans fpskit.js)
export const FPS_MAPS = { town: townWorld, ...EXTRA_MAPS };
export const MAP_IDS = Object.keys(FPS_MAPS);
// la carte d'une partie : tirée de la graine (hachée : indépendante des tirages du générateur)
export const mapOf = (seed) => MAP_IDS[(Math.imul((seed ^ 0x7f4a7c15) >>> 0, 0x2c1b3c6d) >>> 0) % MAP_IDS.length];

// ?fpsmap=fort dans l'adresse : impose la carte (pour l'essayer en solo ; en ligne, chacun doit avoir la même adresse)
const FORCED_MAP = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('fpsmap') : null;

export function fpsWorld(seed, n = 4, kind = 'fps', map = FORCED_MAP || mapOf(seed)) {
  const id = FPS_MAPS[map] ? map : 'town';
  const { kit, spec } = FPS_MAPS[id](seed);
  return finishWorld(kit, spec, seed, n, kind, id);
}

// ---------------------------------------------------------------- la ville
function townWorld(seed) {
  const zoneIds = ['street', 'station', 'saloon', 'cantina', 'sheriff', 'bank', ...ZONE_POOL];
  const kit = mapKit(seed, zoneIds);
  const { R, between, ri, rp, C, texList, tex, flatList, at, deco, horses, rails, carts, wallAt, clear, floorAt, roofAt, zoneAt, fill, isWall, put,
    nearDoor, taken, railCell, spot, hashXY, poster, pickSpread, building } = kit;
  const freeFor = (x, y) => !isWall(x, y) && !nearDoor(x, y) && (y < STREET.y0 || y > STREET.y1);
  const jails = []; // murs du bureau du shérif où coller une affiche (posées à la fin)

  // ---------------------------------------------------------- sol et bords
  fill(0, 0, MW - 1, MH - 1, (x, y) => { floorAt(x, y, 'sand'); zoneAt(x, y, 'street'); });
  const border = (x, y) => wallAt(x, y, 2.4, ['rock', 0]);
  for (let x = 0; x < MW; x++) { border(x, 0); border(x, MH - 1); }
  for (let y = 0; y < MH; y++) { border(0, y); border(MW - 1, y); }
  // ---------------------------------------------------------- la gare (nord)
  fill(1, 1, MW - 2, 12, (x, y) => zoneAt(x, y, 'station'));
  fill(1, 3, MW - 2, 4, (x, y) => floorAt(x, y, 'railsX'));
  fill(1, 5, MW - 2, 6, (x, y) => floorAt(x, y, 'boardwalk'));
  // le train à quai : locomotive puis wagons, avec des passages entre eux
  const cars = [];
  let tx = ri(3, 8);
  const loco = R() < 0.5;
  const carKinds = ['trainCar', 'freightCar'];
  while (tx < MW - 8) {
    const len = cars.length === 0 && loco ? 5 : ri(4, 5);
    const kind = cars.length === 0 && loco ? 'loco' : rp(carKinds);
    // une seule couleur par voiture (le tirage de chaque case est gardé, seul le premier sert) ; au-dessus de 1, le toit
    // (trainCarUp... : fps.js le compose en attendant fpsart) plutôt que le bas de la voiture répété ; pour la locomotive,
    // les variantes du bas et du haut sont le rang de la case depuis l'avant (boîte à fumée, chaudière, cabine ;
    // cheminée, cloche, dôme, toit de cabine)
    let cv = -1;
    fill(tx, 3, tx + len - 1, 4, (x, y) => {
      const v = ri(0, 2) % 2;
      if (cv < 0) cv = v;
      const lv = kind === 'loco' ? x - tx : cv;
      wallAt(x, y, kind === 'loco' ? 1.7 : 1.45, [kind, lv], { up: [`${kind}Up`, lv] });
    });
    cars.push({ x0: tx, x1: tx + len - 1, kind });
    tx += len + ri(1, 3);
    if (R() < 0.2) tx += ri(3, 6);
  }
  // gare : guichet, bancs, deux portes (quai et ville)
  const sx0 = ri(20, 28), sx1 = sx0 + 10;
  building(sx0, 7, sx1, 11, { wall: 'stationWall', face: 's', open: true, inn: ['wallpaper', 1], h: 1.9, sign: null, winTex: 'station', zone: 'station',
    doors: [[sx0 + 5, 7], [sx0 + 5, 11], [sx0 + 2, 11]], floor: 'boardwalk' });
  // vue du dehors : bardage nu entre les fenêtres (le tableau des départs à chaque case, c'était trop), fenêtres et
  // tableaux aussi côté quai, et au-dessus de 1 un bardage sous corniche plutôt que la texture répétée (deux rangées
  // de fenêtres) ; stationWall / stationUp : fps.js les compose en attendant fpsart
  fill(sx0, 7, sx1, 11, (x, y) => {
    const i = at(x, y);
    if (!C.h[i]) return;
    C.up[i] = tex('stationUp', 0);
    if (y === 7 && !C.b[i] && x > sx0 && x < sx1 && (x - sx0) % 2 === 1) C.wall[i] = tex('station', 0);
  });
  // vue du dedans, les fenêtres côté quai sont des fenêtres aussi
  for (let x = sx0 + 1; x < sx1; x++) { const i = at(x, 7); if (!C.b[i] && texList[C.wall[i]]?.[0] === 'station') C.inn[i] = tex('wallpaperWin', 1); }
  // le guichet (bar v4, à dessiner : en attendant le comptoir du saloon), et derrière, des bagages en souffrance
  fill(sx0 + 7, 8, sx0 + 7, 9, (x, y) => wallAt(x, y, 0.5, ['bar', 4]));
  wallAt(sx0 + 9, 8, 0.6, ['crates', 0]);
  // le banc de la salle d'attente (une unité de long, à cheval sur deux cases), contre le mur côté quai
  put('bench', sx0 + 3, 8.5, { solid: 0.4 }); put('lantern', sx0 + 5.5, 9.5, { hang: true });
  put('plant', sx0 + 1.5, 8.5); // au bout du banc de la salle d'attente
  put('watertower', ri(4, 12) + 0.5, 9.5, { solid: 0.9, big: true });
  for (let k = 0; k < 4; k++) {
    const x = ri(2, MW - 4);
    if (x >= sx0 - 1 && x <= sx1 + 1) continue;
    wallAt(x, 6, 0.85, [hashXY(x, 6) < 0.35 ? 'tnt' : 'crates', 0]); // parfois une caisse de TNT (sans tirage R() en plus)
  }
  for (let x = 4; x < MW - 4; x += ri(6, 9)) if (x < sx0 - 1 || x > sx1 + 1) put('lamp', x + 0.5, 5.2, { solid: 0.12, lamp: true });
  const ca = ri(2, 10), wh = ri(30, 50), cb = ri(40, 56); // la roue ne se plante pas dans le second cactus
  put('cactus', ca + 0.5, 1.6, { solid: 0.25 }); put('wheel', (Math.abs(wh - cb) < 2 ? cb - 2 : wh) + 0.5, 1.5); put('cactus', cb + 0.5, 1.7, { solid: 0.25 });

  // ---------------------------------------------------------- la grand-rue
  // la rue traverse toute la carte, d'un quartier à l'autre
  fill(1, STREET.y0, MW - 2, STREET.y1, (x, y) => { floorAt(x, y, 'sand'); zoneAt(x, y, 'street'); });
  fill(14, STREET.y0 - 1, 45, STREET.y0 - 1, (x, y) => floorAt(x, y, 'boardwalk'));
  fill(14, STREET.y1 + 1, 45, STREET.y1 + 1, (x, y) => floorAt(x, y, 'boardwalk'));
  // les bâtiments ouverts : le saloon (toujours), la cantina, le bureau du shérif, la banque
  const north = [], south = [];
  const plan = (row, want) => {
    let x = 14;
    const out = [];
    // les bâtiments ouverts ont leur place réservée (avec une ruelle chacun) : ils ne tombent jamais du bout de la rue
    const list = want.map((kind) => ({ kind, w: kind === 'saloon' ? 9 : ri(7, 8) }));
    const need = () => list.reduce((n, b) => n + b.w + 1, 0);
    while (x <= 45) {
      const spare = 46 - x - need(); // place libre en plus des bâtiments ouverts qui restent
      let kind = null, w;
      if (list.length && (spare < 6 || R() < 0.55)) ({ kind, w } = list.shift());
      else w = Math.min(ri(4, 7), spare - 1);
      if (w < 3 || x + w - 1 > 45) { if (45 - x >= 3) out.push({ x0: x, x1: 45, kind: null }); break; }
      out.push({ x0: x, x1: x + w - 1, kind });
      x += w + (R() < 0.55 && 46 - x - w - need() >= 8 ? 2 : 1); // ruelle de 1 ou 2 cases
    }
    row.push(...out);
  };
  const insides = ['saloon', 'cantina', 'sheriff', 'bank'];
  const sal = R() < 0.5;
  plan(north, sal ? ['saloon', R() < 0.5 ? 'sheriff' : 'bank'] : ['cantina', R() < 0.5 ? 'sheriff' : 'bank']);
  plan(south, sal ? ['cantina', north.some((b) => b.kind === 'sheriff') ? 'bank' : 'sheriff'] : ['saloon', north.some((b) => b.kind === 'sheriff') ? 'bank' : 'sheriff']);
  const SIGN = { saloon: 0, bank: 1, sheriff: 2, hotel: 3, guns: 4, cantina: 5, jail: 6, stable: 7 };
  // façades fermées : [mur, enseigne] (HOTEL, GUNS, STABLE, JAIL ou rien)
  const solids = [['plank', SIGN.hotel], ['plank', SIGN.guns], ['brick', SIGN.hotel], ['plank', SIGN.stable], ['plank', null], ['adobe', null], ['brick', SIGN.jail]];
  const rooms = [];
  let extraSigns = 0; // façades fermées qui gardent leur enseigne (au plus une, sans tirage de plus)
  // Bâtiment à enseigne : building() peint sa fausse façade de la couleur du fond de l'enseigne. Sur des planches,
  // tout le bâtiment prend cette couleur (pas de rez-de-chaussée rouge sous un étage ocre) ; sur la brique ou
  // l'adobe, l'étage reste du même mur (pas de planches rouges sur l'adobe de la cantina) et l'enseigne y est
  // accrochée : signBrick / signAdobe, v = enseigne * 2 + variante du mur (fps.js la compose en attendant fpsart).
  // Rend la variante des murs.
  const harmonize = (bd, wall, fy) => {
    let paint = -1;
    for (let x = bd.x0; x <= bd.x1; x++) { const u = texList[C.up[at(x, fy)]]; if (u && u[0] === 'plank') paint = u[1]; }
    if (paint < 0 || (wall === 'plank' && paint === bd.v)) return bd.v;
    if (wall === 'plank') {
      fill(bd.x0, bd.y0, bd.x1, bd.y1, (x, y) => { const i = at(x, y), t = texList[C.wall[i]]; if (C.h[i] > 0 && t && /^plank(Window|Door)?$/.test(t[0])) C.wall[i] = tex(t[0], paint); });
      return paint;
    }
    for (let x = bd.x0; x <= bd.x1; x++) {
      const i = at(x, fy), u = texList[C.up[i]];
      if (u) C.up[i] = u[0] === 'sign' ? tex(wall === 'adobe' ? 'signAdobe' : 'signBrick', u[1] * 2 + (bd.v & 1)) : tex(wall, bd.v);
    }
    return bd.v;
  };
  const facade = (b, side) => {
    const y0 = side === 'n' ? 14 : STREET.y1 + 2, y1 = side === 'n' ? STREET.y0 - 2 : 32;
    const fy = side === 'n' ? y1 : y0; // rangée de la façade (côté rue)
    const by = side === 'n' ? y0 : y1; // rangée du fond
    const face = side === 'n' ? 's' : 'n';
    const mid = Math.floor((b.x0 + b.x1) / 2);
    if (!b.kind) {
      const [wall, sign0] = rp(solids);
      // les enseignes sont réservées aux lieux importants : une façade fermée n'en a que rarement une
      const sign = sign0 != null && extraSigns < 1 && (b.x0 + (side === 'n' ? 0 : 1)) % 5 === 0 ? (extraSigns++, sign0) : undefined;
      const bd = building(b.x0, y0, b.x1, y1, { wall, face, sign, upper: true, h: between(1.5, 2.3) });
      // une porte condamnée sur la façade (pour le décor : la case reste un mur plein), de la couleur du mur
      // (brickDoor pas encore dessinée dans fpsart.js : fps.js la compose en attendant, brique + porte de plankDoor)
      const i = at(mid, fy), v = harmonize(bd, wall, fy);
      if (i >= 0) C.wall[i] = tex(`${wall}Door`, v);
      return;
    }
    const k = b.kind;
    const cfg = {
      saloon: { wall: 'plank', v: 0, face, inn: ['wallpaper', 0], sign: SIGN.saloon, floor: 'saloonFloor', ceil: 'woodCeil', h: 2.3 },
      cantina: { wall: 'adobe', face, inn: ['cantinaIn', 0], sign: SIGN.cantina, floor: 'tiles', ceil: 'beamCeil', h: 1.7 },
      sheriff: { wall: 'plank', face, inn: ['plank', 1], sign: SIGN.sheriff, floor: 'flagstone', ceil: 'woodCeil', h: 1.9, v: 1 },
      bank: { wall: 'brick', face, inn: ['wallpaper', 1], sign: SIGN.bank, floor: 'bankFloor', ceil: 'woodCeil', h: 2.1 },
    }[k];
    const doors = [[mid, fy], [b.x0 + 1 + Math.floor(R() * (b.x1 - b.x0 - 1)), by]];
    if (k === 'saloon') doors.push([mid + 1, fy]);
    // bureau du shérif : la porte de derrière donne dans la cellule ouverte (la cellule close est pleine, voir plus bas)
    if (k === 'sheriff') { const s = Math.floor((b.x0 + b.x1) / 2) + 1; if (doors[1][0] >= s) doors[1][0] = b.x0 + 1 + ((doors[1][0] - s) % (s - b.x0 - 1)); }
    harmonize(building(b.x0, y0, b.x1, y1, { ...cfg, open: true, zone: k, doors }), cfg.wall, fy);
    // les portes battantes du saloon, dans ses deux portes sur la rue
    if (k === 'saloon') for (const dx of [mid, mid + 1]) put('batwing', dx + 0.5, fy + 0.5, { batwing: true });
    const ix0 = b.x0 + 1, ix1 = b.x1 - 1, iy0 = y0 + 1, iy1 = y1 - 1;
    const back = side === 'n' ? iy0 : iy1, front = side === 'n' ? iy1 : iy0;
    rooms.push({ kind: k, x0: ix0, y0: iy0, x1: ix1, y1: iy1 });
    if (k === 'saloon' || k === 'cantina') {
      // le comptoir, le long d'un mur de côté, avec les bouteilles derrière
      const left = R() < 0.5;
      const cx = left ? ix0 + 1 : ix1 - 1;
      // (pas devant la porte de derrière : le comptoir s'arrête une case plus tôt)
      for (let y = Math.min(back, front); y <= Math.max(back, front); y++) if (y !== front && !(y === back && doors[1][0] === cx)) wallAt(cx, y, 0.48, ['bar', k === 'cantina' ? 1 : 0]);
      const wx = left ? b.x0 : b.x1;
      // l'étagère du fond, derrière le comptoir seulement (devant, le mur nu de la pièce) : une case sur deux,
      // un autre module (v2/v3, à dessiner : en attendant wallTex retombe sur v0/v1)
      for (let y = iy0; y <= iy1; y++) if (y !== front) C.inn[at(wx, y)] = tex('backbar', (k === 'cantina' ? 1 : 0) + ((y - iy0) % 2) * 2);
      // le piano dans le coin du fond (à côté si la porte de derrière y donne)
      const px = left ? ix1 : ix0;
      if (k === 'saloon') wallAt(doors[1][0] === px ? px + (left ? -1 : 1) : px, back, 0.75, ['piano', 0]);
      for (let t = 0; t < 3; t++) {
        const x = ri(left ? ix0 + 3 : ix0 + 1, left ? ix1 - 1 : ix1 - 3), y = ri(iy0, iy1);
        if (C.h[at(x, y)] || doors.some(([dx, dy]) => Math.abs(dx - x) + Math.abs(dy - y) < 2)) continue;
        // deux tirages sur la même case : une seule table (les tirages R() sont gardés pour ne pas décaler la suite)
        // (de même si la chaise d'une table voisine est déjà là)
        const dup = deco.some((o) => (o.id === 'table' && o.x === x + 0.5 && o.y === y + 0.5) || (o.id === 'chair' && Math.hypot(o.x - x - 0.5, o.y - y - 0.5) < 0.75));
        if (!dup) put('table', x + 0.5, y + 0.5, { solid: 0.3 });
        // la chaise : d'un côté de la table, ni dans un mur (piano, comptoir), ni dans une table ou une chaise voisine
        const cs = rp([-0.6, 0.6]);
        const seat = (dx, dy) => { const sx = x + 0.5 + dx, sy = y + 0.5 + dy; return !isWall(Math.floor(sx), Math.floor(sy)) && !deco.some((o) => (o.id === 'table' && Math.hypot(o.x - x - 0.5, o.y - y - 0.5) > 0.1 && Math.hypot(o.x - sx, o.y - sy) < 0.75) || (o.id === 'chair' && Math.hypot(o.x - sx, o.y - sy) < 0.5)); };
        const [cdx, cdy] = [[cs, 0], [-cs, 0], [0, cs], [0, -cs]].find(([a, c]) => seat(a, c)) || [cs, 0];
        if (!dup) put('chair', x + 0.5 + cdx, y + 0.5 + cdy);
        // la table a déjà sa bouteille et son verre (sur le sprite) : la bouteille en plus va sur le comptoir (z = sa hauteur), à l'échelle
        let yb = y === front ? y + (back > front ? 1 : -1) : y;
        if (!C.h[at(cx, yb)]) yb += back > front ? -1 : 1; // pas de comptoir devant la porte de derrière
        if (R() < 0.6 && !deco.some((o) => o.id === 'bottle' && o.x === cx + 0.5 && o.y === yb + 0.5)) put('bottle', cx + 0.5, yb + 0.5, { z: C.h[at(cx, yb)], sc: 0.75 });
      }
      // saloon : le lustre (roue de chariot, allumé : lamp) au milieu de la salle ; cantina : la lanterne
      put(k === 'saloon' ? 'chandelier' : 'lantern', (ix0 + ix1) / 2 + 0.5, (iy0 + iy1) / 2 + 0.5, { hang: true, ...(k === 'saloon' && { lamp: true }) });
      // un crachoir au pied du comptoir, côté clients, devant une case de comptoir choisie par hachage (aucun tirage R())
      const bars = [];
      for (let y = iy0; y <= iy1; y++) if (C.h[at(cx, y)] > 0 && texList[C.wall[at(cx, y)]]?.[0] === 'bar') bars.push(y);
      if (bars.length) put('spittoon', cx + (left ? 1.2 : -0.2), bars[Math.floor(hashXY(cx, iy0) * bars.length)] + 0.5);
      // cantina : un agave en pot dans le coin côté rue, à l'opposé du comptoir (si une table n'y est pas déjà)
      const qx = left ? ix1 : ix0;
      if (k === 'cantina' && !nearDoor(qx, front) && !deco.some((o) => !o.hang && Math.hypot(o.x - qx - 0.5, o.y - front - 0.5) < 0.9)) put('plant', qx + 0.5, front + 0.5);
    } else if (k === 'sheriff') {
      // le bureau sur les deux rangées côté rue ; au fond, derrière les barreaux, deux cellules d'une rangée :
      // celle de gauche est ouverte (la porte de derrière y donne), celle de droite est close et pleine (rien à murer)
      const d = back > front ? 1 : -1, cy = back - d, f1 = front + d;
      for (let x = ix0; x <= ix1; x++) if (x !== ix0 + 1) wallAt(x, cy, 1.3, ['cell', 0], { inn: ['cell', 0] });
      const split = Math.floor((ix0 + ix1) / 2) + 1;
      for (let x = split; x <= ix1; x++) wallAt(x, back, 1.3, ['cell', 0]);
      // le bureau (bar v2, à dessiner) tourné vers la pièce, la chaise du shérif entre lui et la façade
      wallAt(ix1 - 1, f1, 0.5, ['bar', 2]);
      put('chair', ix1 - 0.5, front + 0.5);
      put('bottle', ix1 - 0.5, f1 + 0.5, { z: 0.5, sc: 0.75 }); // la bouteille du shérif, sur le bureau
      put('lantern', (ix0 + ix1) / 2 + 0.5, (front + f1) / 2 + 0.5, { hang: true });
      // le poêle (son tuyau monte au plafond) dans le coin du bureau opposé au bureau du shérif, pas devant la porte ;
      // solid 0,35 : sa case n'est pas « accessible », les affiches et le râtelier ne vont pas sur le mur derrière lui
      const sv = [front, f1].find((y) => !C.h[at(ix0, y)] && !nearDoor(ix0, y) && !taken(ix0, y));
      if (sv != null) put('stove', ix0 + 0.4, sv + 0.5 - (sv === front ? 0.1 * d : 0), { solid: 0.35, spin: true }); // spin : le feu vacille (2 images)
      // murs du bureau qui peuvent porter une affiche (ni coin, ni porte, ni fenêtre) : [x, y, case intérieure devant]
      const spots = [];
      for (let y = Math.min(cy, front); y <= Math.max(cy, front); y++) if (y !== cy) spots.push([b.x0, y, b.x0 + 1, y], [b.x1, y, b.x1 - 1, y]);
      for (let x = ix0; x <= ix1; x++) { const t = texList[C.wall[at(x, fy)]]; if (!C.b[at(x, fy)] && t && t[0] === 'plank') spots.push([x, fy, x, front]); }
      jails.push(spots);
    } else if (k === 'bank') {
      // le guichet (bar v3, à dessiner : en attendant le comptoir du saloon) ; au fond, les caisses et l'or,
      // dans le coin qui n'est pas devant la porte de derrière
      for (let x = ix0; x <= ix1; x++) if (x !== ix0 + 1) wallAt(x, side === 'n' ? iy0 + 1 : iy1 - 1, 0.55, ['bar', 3]);
      const vx = doors[1][0] === ix1 ? ix0 : ix1;
      wallAt(vx, back, 0.9, ['crates', 0]);
      // le lustre (allumé : lamp) au-dessus de la salle du public, entre ses deux rangées
      put('gold', vx === ix1 ? ix1 - 0.5 : ix0 + 1.5, back + 0.5, { pk: true }); put('chandelier', (ix0 + ix1) / 2 + 0.5, front + (back > front ? 1 : 0), { hang: true, lamp: true });
      // la porte du coffre (vault) sur le mur du fond, derrière le guichet : vers le milieu, ni porte ni caisses devant
      const kx = [0, 1, -1, 2, -2].map((d) => mid + d).find((x) => x >= ix0 && x <= ix1 && x !== vx && !C.b[at(x, by)]);
      if (kx != null) C.inn[at(kx, by)] = tex('vault', 0);
      // le coffre-fort au fond, derrière le guichet, contre le mur : le plus loin possible de la porte de derrière (ni devant
      // elle, ni dans le passage du guichet en ix0 + 1, ni devant la porte du coffre, ni sur l'or), le coin d'abord
      const sfx = [...Array(ix1 - ix0 + 1)].map((_, j) => ix0 + j).filter((x) => x !== ix0 + 1 && x !== doors[1][0] && !C.h[at(x, back)] && !taken(x, back) && texList[C.inn[at(x, by)]]?.[0] !== 'vault')
        .sort((a, c) => Math.abs(c - doors[1][0]) - Math.abs(a - doors[1][0]) || a - c)[0];
      if (sfx != null) put('safe', sfx + 0.5, back + 0.5 + (back > front ? 0.1 : -0.1), { solid: 0.3 });
      for (const qx of [ix0, ix1]) if (!nearDoor(qx, front)) put('plant', qx + 0.5, front + 0.5); // des plantes en pot dans les coins côté rue
    }
  };
  north.forEach((b) => facade(b, 'n'));
  south.forEach((b) => facade(b, 's'));
  // ruelles entre les bâtiments
  // dans la rue : abreuvoirs, tonneaux, chariots, poteaux d'attache et chevaux, réverbères
  const streetDeco = ['barrel', 'trough', 'hayBale', 'barrel', 'wagonWreck', 'barrelTnt', 'barrelTnt'];
  // une porte (vraie, ou condamnée : mur plein peint d'une porte) en (x, y)
  const doorCell = (x, y) => { const i = at(x, y); return i >= 0 && (C.b[i] > 0 || /Door$/.test(texList[C.wall[i]]?.[0] || '')); };
  const nearAnyDoor = (x, y) => [-1, 0, 1].some((dy) => [-1, 0, 1].some((dx) => doorCell(x + dx, y + dy)));
  for (let x = 16; x < 44; x += ri(3, 5)) {
    const y = R() < 0.5 ? STREET.y0 + 0.4 : STREET.y1 + 0.6;
    const id = rp(streetDeco);
    // pas en plein devant une porte : décalé d'une ou deux cases (sans tirage R() en plus)
    const fy = y < STREET.y0 + 1 ? STREET.y0 - 2 : STREET.y1 + 2;
    const d = [0, 1, -1, 2, -2].find((d) => !doorCell(x + d, fy) && !taken(x + d, Math.floor(y))) ?? 0;
    put(id, x + d + 0.5, y, { solid: id === 'wagonWreck' ? 0.6 : 0.3, ...(id === 'barrelTnt' && { tnt: true }) });
  }
  // réverbères : décalés sur le côté s'ils tombent devant une porte, même condamnée (sans tirage R() en plus)
  const lampAt = (x, y) => { const d = [0, 1, -1, 2, -2, 3, -3].find((d) => !nearAnyDoor(Math.floor(x) + d, Math.floor(y))) ?? 0; put('lamp', x + d, y, { solid: 0.12, lamp: true }); };
  for (let x = 15; x < 45; x += ri(7, 10)) { lampAt(x + 0.5, STREET.y0 - 0.2); lampAt(x + 3.5, STREET.y1 + 1.2); }
  // couverts au milieu de la rue (caisses, charrette renversée) : de quoi se cacher
  for (let k = 0; k < 4; k++) {
    const x = ri(16, 43), y = ri(STREET.y0 + 1, STREET.y1 - 1);
    if (!nearDoor(x, y)) wallAt(x, y, rp([0.6, 0.85]), rp([['crates', 0], ['hay', 0], ['crates', 0], ['tnt', 0]])); // la TNT : un abri qui peut sauter
  }
  // chevaux à l'attache devant le saloon et le bureau du shérif
  const hitchFor = (b, side) => {
    const x0 = Math.floor((b.x0 + b.x1) / 2) + 3;
    const y = side === 'n' ? STREET.y0 + 0.7 : STREET.y1 + 0.3, hy = Math.floor(y + (side === 'n' ? 0.9 : -0.9));
    // pas à travers un tonneau ou un abreuvoir de la rue, ni le cheval dans une pile de caisses
    const x = [0, 1, -1, 2, -2].map((d) => x0 + d).find((x) => !isWall(x, hy) && !deco.some((o) => o.solid && Math.abs(o.x - x - 0.5) < 1 && Math.abs(o.y - y) < 0.8)) ?? x0;
    put('hitch', x + 0.5, y, { solid: 0.15 });
    horses.push({ x: x + 0.5, y: y + (side === 'n' ? 0.9 : -0.9), a: R() < 0.5 ? 0 : Math.PI, coat: ri(0, 4) });
  };
  north.concat(south).forEach((b) => { if (b.kind === 'saloon' || b.kind === 'sheriff') hitchFor(b, north.includes(b) ? 'n' : 's'); });
  if (horses.length < 2) horses.push({ x: 30.5, y: 23.5, a: 0, coat: ri(0, 4) });

  // ---------------------------------------------------------- les quartiers autour
  const order = [...ZONE_POOL];
  for (let k = order.length - 1; k > 0; k--) { const j = Math.floor(R() * (k + 1)); [order[k], order[j]] = [order[j], order[k]]; }
  const districts = SLOTS.map((s, k) => ({ ...s, zone: order[k] }));
  for (const d of districts) {
    fill(d.x0, d.y0, d.x1, d.y1, (x, y) => zoneAt(x, y, d.zone));
    const W2 = d.x1 - d.x0 + 1, H2 = d.y1 - d.y0 + 1;
    const wide = W2 > H2;
    // côté extérieur (contre le bord de la carte) et côté ville
    const inX = (fx) => Math.round(d.x0 + fx * (W2 - 1));
    const inY = (fy) => Math.round(d.y0 + fy * (H2 - 1));
    if (d.zone === 'boothill') {
      fill(d.x0, d.y0, d.x1, d.y1, (x, y) => floorAt(x, y, 'grass'));
      // la chapelle de pierre, ouverte
      const cw = 6, ch = 5;
      const cx0 = d.out === 'w' ? d.x0 + 1 : d.out === 'e' ? d.x1 - cw : inX(between(0.15, 0.55));
      const cy0 = wide ? d.y1 - ch : inY(0.1);
      const doorX = cx0 + Math.floor(cw / 2), doorY = wide ? cy0 : cy0 + ch - 1;
      // pierre blonde (stone v1, celle du vitrail 'chapel') partout dehors, quelle que soit la variante tirée par building() ;
      // les vitraux en hauteur (C.up, étiré de 1 à 2,4 : une haute lancette) de part et d'autre de la porte et sur les flancs,
      // au lieu de deux vitraux empilés sur la façade
      building(cx0, cy0, cx0 + cw - 1, cy0 + ch - 1, { wall: 'stone', face: wide ? 'n' : 's', open: true, inn: ['stone', 0], floor: 'flagstone', ceil: 'woodCeil', h: 2.4,
        zone: 'boothill', doors: [[doorX, doorY]], wallTex: () => ['stone', 1] });
      C.wall[at(doorX, doorY)] = tex('stone', 1);
      for (const [x, y] of [[cx0 + 2, doorY], [cx0 + 4, doorY], [cx0, cy0 + 2], [cx0 + cw - 1, cy0 + 2]]) C.up[at(x, y)] = tex('chapel', 0);
      // la croix de l'autel au fond (à l'opposé de la porte), la lanterne au milieu de la nef
      put('altarCross', cx0 + cw / 2, wide ? cy0 + ch - 1.35 : cy0 + 1.35, { solid: 0.2 }); put('lantern', cx0 + cw / 2, cy0 + ch / 2, { hang: true });
      // les bancs (deux rangées de deux) tournés vers l'autel, de part et d'autre de l'allée qui mène de la porte (cx0 + 3) à l'autel
      const al = wide ? 1 : -1; // côté de l'autel
      for (const py of [cy0 + ch / 2 + 0.05 * al, cy0 + ch / 2 - 0.9 * al]) for (const px of [cx0 + 2, cx0 + 4.55]) put('pew', px, py, { solid: 0.3 });
      // le mausolée (au-dessus de 1 : un fronton, tomb v1, sinon la texture se répète et montre un étage de portes)
      const mx = d.out === 'e' ? d.x0 + 2 : d.x1 - 4, my = wide ? d.y0 + 2 : inY(0.75);
      fill(mx, my, mx + 1, my + 1, (x, y) => wallAt(x, y, 1.5, ['tomb', 0], { up: ['tomb', 1] }));
      // les tombes, en rangées
      for (let y = d.y0 + 1; y <= d.y1 - 1; y += 2) for (let x = d.x0 + 1; x <= d.x1 - 1; x += 2) {
        if (isWall(x, y) || isWall(x, y - 1) || isWall(x, y + 1) || R() < 0.45) continue;
        if (y >= STREET.y0 - 1 && y <= STREET.y1 + 1) continue; // la rue traverse le cimetière
        // pas une grille parfaite : chaque rangée glisse un peu, chaque tombe aussi (hachage de la case, sans tirage R() de plus),
        // jamais vers un mur voisin (chapelle, mausolée) ni vers le muret (posé plus bas, en d.x0 ou d.x1), ni dans l'allée
        // qui mène à la porte de la chapelle (quartier du sud : la porte regarde le nord) ; le type est tiré avant, comme toujours
        const id = R() < 0.6 ? 'tombstone' : 'cross';
        const aisle = (xx) => wide && xx === doorX && y < cy0;
        if (aisle(x)) continue;
        const jx = Math.max(isWall(x - 1, y) || x - 1 <= d.x0 || aisle(x - 1) ? 0 : -0.4, Math.min(isWall(x + 1, y) || x + 1 >= d.x1 || aisle(x + 1) ? 0 : 0.4, (hashXY(d.x0, y) - 0.5) * 0.6 + (hashXY(x, y) - 0.5) * 0.35));
        put(id, x + 0.5 + jx, y + 0.5 + (hashXY(y, x) - 0.5) * 0.4, { solid: 0.22 });
      }
      // spot : ni dans la chapelle ou le mausolée, ni devant leur porte, ni sur une tombe
      put('deadtree', ...spot(inX(0.5) + 0.5, inY(d.out === 's' ? 0.5 : 0.25) + 0.5), { solid: 0.25 }); put('coffin', ...spot(inX(0.3) + 0.5, inY(0.7) + 0.5));
      // muret de pierre (on tire par-dessus) : stoneLow, deux rangs de moellons dessinés pour un mur bas
      const wy = d.out === 's' ? d.y0 : null;
      if (wy != null) {
        for (let x = d.x0; x <= d.x1; x++) if ((x - d.x0) % 7 > 1 && !nearDoor(x, wy)) wallAt(x, wy, 0.5, ['stoneLow', 0]);
      } else {
        for (let y = d.y0; y <= d.y1; y++) if ((y < STREET.y0 - 1 || y > STREET.y1 + 1) && (y - d.y0) % 6 > 1) wallAt(d.out === 'w' ? d.x1 : d.x0, y, 0.5, ['stoneLow', 0]);
      }
    } else if (d.zone === 'ranch') {
      fill(d.x0, d.y0, d.x1, d.y1, (x, y) => floorAt(x, y, (x + y) % 5 ? 'grass' : 'dirt'));
      // la grange (ouverte, du foin à l'intérieur)
      const bw = wide ? 8 : 7, bh = wide ? 6 : 7;
      const bx0 = d.out === 'w' ? d.x0 + 1 : d.out === 'e' ? d.x1 - bw : inX(0.08);
      const by0 = wide ? d.y1 - bh : d.y0 + 1;
      const bdy = wide ? by0 : by0 + bh - 1;
      // bardage nu (barn v1) partout ; barn v0 (porte à croix blanche) seulement sur les deux cases qui encadrent
      // l'entrée : les portes coulissantes poussées de côté, sous le rail (au-dessus de 1, le bardage nu)
      building(bx0, by0, bx0 + bw - 1, by0 + bh - 1, { wall: 'barn', face: wide ? 'n' : 's', open: true, inn: ['barn', 1], floor: 'dirt', ceil: 'woodCeil', h: 2.3, win: false,
        zone: 'ranch', doors: [[bx0 + 3, bdy], [bx0 + 4, bdy], [bx0, by0 + 2]], wallTex: () => ['barn', 1] });
      for (const [x, y] of [[bx0 + 3, bdy], [bx0 + 4, bdy], [bx0, by0 + 2]]) C.wall[at(x, y)] = tex('barn', 1); // linteaux
      for (const x of [bx0 + 3, bx0 + 4]) C.up[at(x, bdy)] = tex('barn', 2); // au-dessus de l'entrée (de 1 au toit) : les portes du fenil
      for (const x of [bx0 + 2, bx0 + 5]) { C.wall[at(x, bdy)] = tex('barn', 0); C.up[at(x, bdy)] = tex('barn', 1); }
      wallAt(bx0 + 1, wide ? by0 + bh - 2 : by0 + 1, 0.6, ['hay', 0]); wallAt(bx0 + bw - 2, wide ? by0 + bh - 2 : by0 + 1, 0.6, ['hay', 0]); wallAt(bx0 + bw - 2, wide ? by0 + bh - 3 : by0 + 2, 0.6, ['hay', 0]);
      // l'enclos : une barrière basse, deux chevaux et des vaches
      const ex0 = wide ? (d.out === 's' && bx0 < inX(0.4) ? inX(0.5) : inX(0.15)) : d.x0 + 2;
      const ey0 = wide ? d.y0 + 2 : inY(0.63);
      const ew = wide ? 9 : W2 - 4, eh = wide ? 6 : 6;
      // une case sur quatre environ (hachage de la case, sans tirage R()) : barrière usée, une traverse cassée (fence v1)
      for (let x = ex0; x < ex0 + ew; x++) for (const y of [ey0, ey0 + eh - 1]) if (x !== ex0 + 2 && x !== ex0 + 3) wallAt(x, y, 0.5, ['fence', hashXY(x, y) < 0.25 ? 1 : 0]);
      for (let y = ey0; y < ey0 + eh; y++) for (const x of [ex0, ex0 + ew - 1]) wallAt(x, y, 0.5, ['fence', hashXY(x, y) < 0.25 ? 1 : 0]);
      horses.push({ x: ex0 + 2.5, y: ey0 + 2.5, a: 0, coat: ri(0, 4), pen: true });
      horses.push({ x: ex0 + ew - 2.5, y: ey0 + eh - 2.5, a: Math.PI, coat: ri(0, 4), pen: true });
      // sc : à l'échelle du cheval (la vache de fpsart.js fait la moitié de sa hauteur)
      put('cow', ex0 + ew / 2, ey0 + eh / 2, { solid: 0.45, sc: 1.25 }); put('cow', ex0 + 1.8, ey0 + eh - 1.8, { solid: 0.45, sc: 1.25 });
      put('trough', ex0 + ew - 2, ey0 + 1.6, { solid: 0.3 });
      // spot / taken : l'éolienne et les poules pas dans la barrière ou la grange, le foin pas sur une vache ou l'abreuvoir
      // (à l'ouest, la colonne d.x1 - 2 est la barrière de l'enclos : on vise celle d'à côté, sinon spot la pose dans l'enclos)
      // sc : plus haute que la grange (2,3)
      put('windmill', ...spot(d.out === 'e' ? d.x0 + 1.5 : d.out === 'w' ? d.x1 - 0.5 : d.x1 - 1.5, wide ? d.y0 + 1.5 : d.y1 - 1.5), { solid: 0.4, big: true, spin: true, sc: 1.45 });
      for (let k = 0; k < 3; k++) put('chicken', ...spot(inX(between(0.2, 0.8)) + 0.5, inY(between(0.2, 0.8)) + 0.5), { peck: true });
      for (let k = 0; k < 3; k++) { const x = inX(between(0.1, 0.9)), y = inY(between(0.1, 0.9)); if (freeFor(x, y) && !taken(x, y) && !(x >= ex0 - 1 && x <= ex0 + ew && y >= ey0 - 1 && y <= ey0 + eh)) wallAt(x, y, 0.6, ['hay', 0]); } // ni dans l'enclos ni devant sa barrière
    } else if (d.zone === 'mine') {
      fill(d.x0, d.y0, d.x1, d.y1, (x, y) => floorAt(x, y, 'gravel'));
      // la falaise, côté extérieur, percée de galeries
      const depth = 3;
      const cliff = (x, y) => (d.out === 'w' ? x < d.x0 + depth : d.out === 'e' ? x > d.x1 - depth : y > d.y1 - depth);
      // dehors, toute la falaise en roche litée (comme le bord de la carte) : tirées au hasard case par case, les deux
      // roches faisaient un damier ; le tirage ri() est gardé pour ne pas décaler la suite
      fill(d.x0, d.y0, d.x1, d.y1, (x, y) => { if (cliff(x, y) && (y < STREET.y0 || y > STREET.y1 || d.out === 's')) { ri(0, 1); wallAt(x, y, 2.6, ['rock', 0], { inn: ['rock', 1] }); } });
      // la boucle de rails du wagonnet, qui passe sous la falaise (galerie couverte)
      const m = 1;
      const lx0 = d.out === 'w' ? d.x0 + 1 : d.x0 + m + 1, lx1 = d.out === 'e' ? d.x1 - 1 : d.x1 - m - 1;
      const ly0 = d.y0 + 1, ly1 = d.out === 's' ? d.y1 - 1 : d.y1 - 1;
      const loop = [];
      for (let x = lx0; x < lx1; x++) loop.push([x, ly0]);
      for (let y = ly0; y < ly1; y++) loop.push([lx1, y]);
      for (let x = lx1; x > lx0; x--) loop.push([x, ly1]);
      for (let y = ly1; y > ly0; y--) loop.push([lx0, y]);
      for (const [x, y] of loop) {
        const i = at(x, y);
        const inside = C.h[i] > 0; // sous la falaise : on creuse une galerie
        clear(x, y);
        floorAt(x, y, y === ly0 || y === ly1 ? 'railsX' : 'railsY');
        if (inside) {
          roofAt(x, y, 'rockCeil');
          for (const [ax, ay] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const j = at(x + ax, y + ay);
            // dans la galerie (vue de dedans) : roche de mine et un boisage toutes les trois cases ; la face extérieure
            // de la falaise garde sa roche litée (le boisage y faisait des échafaudages plantés dans la falaise)
            if (j >= 0 && C.h[j] > 0) C.inn[j] = (x + y) % 3 ? tex('rock', 1) : tex('mineProp', 0);
          }
        }
      }
      rails.push(...loop.map(([x, y]) => ({ x: x + 0.5, y: y + 0.5 })));
      carts.push({ s: 0 }, { s: Math.floor(loop.length / 2) });
      // le bureau des essais, les caisses de TNT, les tonneaux
      const ox = Math.round((lx0 + lx1) / 2) - 2, oy = Math.round((ly0 + ly1) / 2) - 1;
      if (lx1 - lx0 >= 7 && ly1 - ly0 >= 5) {
        building(ox, oy, ox + 4, oy + 3, { wall: 'plank', v: 2, face: 'n', open: true, inn: ['plank', 2], floor: 'boardwalk', ceil: 'woodCeil', h: 1.6, zone: 'mine', doors: [[ox + 2, oy]], sign: null, upper: true }); // upper : planches nues au-dessus de 1 (pas une demi-rangée de fenêtres)
        put('lantern', ox + 2.5, oy + 2, { hang: true });
      }
      for (let k = 0; k < 4; k++) {
        const x = ri(lx0 + 1, lx1 - 1), y = ri(ly0 + 1, ly1 - 1);
        // pas dans le bureau (case couverte) : on tire quand même rp() pour ne pas décaler les tirages
        if (freeFor(x, y) && !loop.some(([lx, ly]) => lx === x && ly === y)) { const t = rp([['tnt', 0], ['crates', 0]]); if (!C.ceil[at(x, y)]) wallAt(x, y, 0.8, t); }
      }
      // spot : le tonneau pas devant la porte du bureau, la roue pas dans une caisse
      put('barrelTnt', ...spot(inX(0.5) + 0.5, inY(0.5) + 0.5), { solid: 0.3, tnt: true });
      put('wheel', ...spot(inX(0.3) + 0.5, inY(0.3) + 0.5));
      // le chevalement (repère vu de la ville) côté falaise, et deux tas de minerai sur le carreau ; spot : hors des rails
      put('headframe', ...spot(inX(0.7) + 0.5, inY(0.7) + 0.5), { solid: 0.45, big: true });
      put('orePile', ...spot(inX(0.7) + 0.5, inY(0.3) + 0.5), { solid: 0.25 }); put('orePile', ...spot(inX(0.3) + 0.5, inY(0.7) + 0.5), { solid: 0.25 });
      for (const [x, y] of loop) if ((x + y) % 7 === 0 && C.ceil[at(x, y)]) put('lantern', x + 0.5, y + 0.5, { hang: true });
      // entrées des galeries : un linteau de roche au-dessus des rails, à hauteur du plafond (sans lui, on voyait le ciel
      // par-dessus le plafond de la galerie) ; fps.js encadre l'ouverture de bois. Sous 1,4 : on n'y entre pas à cheval
      for (const [x, y] of loop) {
        const i = at(x, y);
        if (C.ceil[i] && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([ax, ay]) => { const j = at(x + ax, y + ay); return j >= 0 && !C.h[j] && !C.ceil[j]; })) {
          C.h[i] = 2.6; C.b[i] = FPS.ceil + 0.02; C.wall[i] = tex('rock', 0); C.inn[i] = tex('rock', 1);
        }
      }
      // une vieille galerie condamnée (DANGER) dans la face de la falaise côté carreau, loin des entrées, devant une case
      // libre ; choisie par hachage de la case (aucun tirage R() en plus). Au-dessus de 1, la roche litée.
      const [fx, fy] = d.out === 'w' ? [1, 0] : d.out === 'e' ? [-1, 0] : [0, -1];
      const adits = [];
      fill(d.x0, d.y0, d.x1, d.y1, (x, y) => {
        const i = at(x, y), t = texList[C.wall[i]];
        if (Math.abs(C.h[i] - 2.6) > 1e-3) return; // la falaise (pas le bord de la carte)
        if (C.b[i] || !t || t[0] !== 'rock' || isWall(x + fx, y + fy) || C.ceil[at(x + fx, y + fy)] || railCell(x + fx, y + fy) || taken(x + fx, y + fy)) return;
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const j = at(x + dx, y + dy); if (j >= 0 && C.b[j] > 0) return; }
        adits.push([x, y]);
      });
      for (const [x, y] of pickSpread(adits, 1, 0)) { const i = at(x, y); C.wall[i] = tex('mineEntrance', 0); C.up[i] = tex('mineEntrance', 1); } // au-dessus : la roche, strates raccordées
    } else if (d.zone === 'fort') {
      fill(d.x0, d.y0, d.x1, d.y1, (x, y) => floorAt(x, y, 'dirt'));
      // la palissade (avec deux portes) et le blockhaus au milieu
      const px0 = d.x0 + 1, px1 = d.x1 - 1, py0 = d.y0 + 1, py1 = d.y1 - 1;
      const gates = new Set();
      const gate = (x, y) => gates.add(at(x, y));
      // portes : côté ville et côté opposé. Celle qui donne sur la rangée de barrières du sud (y = 34, plus bas : ouverte
      // où x % 8 vaut 6, 7, 0 ou 1) se met en face d'un passage, la plus proche du milieu (sinon, une barrière devant la porte)
      const gateX = (x0, n) => [0, 1, -1, 2, -2, 3, -3, 4, -4].map((k) => x0 + k).find((x) => [...Array(n)].every((_, j) => (x + j) % 8 < 2 || (x + j) % 8 > 5)) ?? x0;
      if (d.out === 'w' || d.out === 'e') {
        const gx = d.out === 'w' ? px1 : px0;
        for (let y = STREET.y0 + 1; y <= STREET.y0 + 3; y++) gate(gx, y);
        const ox = d.out === 'w' ? px0 : px1;
        gate(ox, py0 + 2); gate(ox, py0 + 3);
        const sx = gateX(Math.round((px0 + px1) / 2), 2);
        gate(sx, py1); gate(sx + 1, py1);
      } else {
        const mx = gateX(Math.round((px0 + px1) / 2) - 1, 3) + 1;
        for (let x = mx - 1; x <= mx + 1; x++) gate(x, py0);
        gate(px0, py0 + 4); gate(px1, py0 + 4); gate(px0, py0 + 5); gate(px1, py0 + 5);
      }
      for (let x = px0; x <= px1; x++) for (const y of [py0, py1]) if (!gates.has(at(x, y))) wallAt(x, y, 2.0, ['logs', 1], { up: ['logs', 0] });
      for (let y = py0; y <= py1; y++) for (const x of [px0, px1]) if (!gates.has(at(x, y))) wallAt(x, y, 2.0, ['logs', 1], { up: ['logs', 0] });
      const bx = Math.round((px0 + px1) / 2) - 2, by = Math.round((py0 + py1) / 2) - 2;
      // meurtrières (logsWindow v0 puis v1, de part et d'autre de la porte) par wallTex : avec win, l'intérieur voudrait
      // un 'logsWin' qui n'existe pas ; upper : rondins nus au-dessus de 1 (pas une 2e rangée de meurtrières) ; vues aussi du dedans
      building(bx, by, bx + 4, by + 3, { wall: 'logs', v: 1, face: 'n', open: true, inn: ['logs', 1], floor: 'boardwalk', ceil: 'woodCeil', h: 1.8, win: false, upper: true, zone: 'fort',
        doors: [[bx + 2, by], [bx + 2, by + 3]], wallTex: (x, y, front) => (front && (x - bx) % 2 === 1 ? ['logsWindow', (x - bx) >> 1] : ['logs', 1]) });
      for (const x of [bx + 1, bx + 3]) C.inn[at(x, by)] = C.wall[at(x, by)];
      put('lantern', bx + 2.5, by + 2, { hang: true });
      // caisses, canon (roue), drapeau
      for (let k = 0; k < 5; k++) {
        const x = ri(px0 + 1, px1 - 1), y = ri(py0 + 1, py1 - 1);
        // pas juste derrière une porte de la palissade (on la bouchait) : le tirage rp() est gardé pour ne pas décaler la suite
        if (freeFor(x, y) && !(x >= bx - 1 && x <= bx + 5 && y >= by - 1 && y <= by + 4)) {
          const hc = rp([0.6, 0.9]);
          if (![[1, 0], [-1, 0], [0, 1], [0, -1]].some(([ax, ay]) => gates.has(at(x + ax, y + ay)))) wallAt(x, y, hc, ['crates', 0]);
        }
      }
      // spot ne voit pas encore les portes de la palissade (posées plus bas) : le canon et le drapeau vont à la première de
      // leurs places qui n'est ni dans une porte ni juste devant
      const yard = (...ts) => ts.map(([x, y]) => spot(x, y)).find(([x, y]) => ![-1, 0, 1].some((ay) => [-1, 0, 1].some((ax) => gates.has(at(Math.floor(x) + ax, Math.floor(y) + ay)))));
      const cn = yard([px0 + 1.5, py1 - 1.5], [px0 + 2.5, py1 - 2.5], [px0 + 1.5, py0 + 1.5]);
      if (cn) put('cannon', ...cn, { solid: 0.4 });
      put('barrel', ...spot(px1 - 1.5, py0 + 1.5), { solid: 0.3 }); put('barrelTnt', ...spot(px1 - 1.5, py1 - 1.5), { solid: 0.3, tnt: true }); // spot : pas dans les caisses
      // le drapeau devant le coin du blockhaus (hors de l'allée de la porte) ; le mât est au bord gauche du sprite, à 0,16 de
      // son pied : + 0,16 en x pour le planter sur la case ; spin : fps.js fait défiler ses 3 images (le vent)
      const fl = yard([bx + 0.5, by - 1.5], [bx + 4.5, by - 1.5], [bx + 0.5, by + 5.5], [bx + 4.5, by + 5.5]);
      if (fl) put('flag', fl[0] + 0.16, fl[1], { solid: 0.2, spin: true });
      // les portes de la palissade : une poutre en travers (linteau à 1,45 : on y passe à cheval), les pointes au-dessus ;
      // fps.js pose la traverse et les montants de bois. Après les caisses et spot : nearDoor ne change pas leurs tirages
      for (const i of gates) { C.h[i] = 2.0; C.b[i] = 1.45; C.wall[i] = tex('logs', 1); C.up[i] = tex('logs', 0); C.inn[i] = 0; }
    }
  }
  // la rue traverse les quartiers de côté : on dégage son passage
  for (const d of districts) if (d.out === 'w' || d.out === 'e') {
    for (let x = d.x0; x <= d.x1; x++) for (let y = STREET.y0 + 1; y <= STREET.y1 - 1; y++) {
      const i = at(x, y);
      if (C.h[i] > 0 && C.h[i] < 2.5 && !rails.some((r) => Math.floor(r.x) === x && Math.floor(r.y) === y)) {
        if (d.zone !== 'fort' && !C.inn[i]) clear(x, y); // pas les murs d'un bâtiment ouvert (bureau de la mine) : sa façade et son toit resteraient troués
      }
    }
  }
  // entre la ville et les quartiers du sud : une rangée de barrières percée de passages
  for (let x = 1; x < MW - 1; x++) if (x % 8 >= 2 && x % 8 <= 5 && !isWall(x, 34) && !nearDoor(x, 34)) wallAt(x, 34, 0.5, ['fence', hashXY(x, 34) < 0.25 ? 1 : 0]); // fence v1 : usée (1 sur 4)
  // affiches « WANTED » : après les recoins murés (qui recopient le mur voisin), une fois les cases accessibles connues
  const after = (reach) => {
    // ---------------------------------------------------------- affiches « WANTED » (après les recoins murés, qui recopient le mur voisin)
    // bureau du shérif : trois affiches seulement (deux portraits, un tableau), face à une case où l'on peut aller
    for (const spots of jails) {
      const ok = spots.filter(([, , ix, iy]) => reach[at(ix, iy)] && !C.h[at(ix, iy)]);
      pickSpread(ok, 3, 2).forEach(([x, y], n) => { C.inn[at(x, y)] = n === 2 ? tex('wanted', 0) : poster(['plank', 1]); });
    }
    // le râtelier (gunrack) : sur un mur de côté du bureau resté nu (sans affiche), choisi par hachage de (x, y)
    for (const spots of jails) {
      const g = spots.filter(([x, y, ix, iy]) => ix !== x && reach[at(ix, iy)] && !C.h[at(ix, iy)] && texList[C.inn[at(x, y)]]?.[0] === 'plank').sort((a, b) => hashXY(a[0], a[1]) - hashXY(b[0], b[1]))[0];
      if (g) C.inn[at(g[0], g[1])] = tex('gunrack', 0);
    }
    // quelques-unes sur les façades, côté rue : murs pleins seulement (ni porte, ni fenêtre, ni coin)
    const fronts = [];
    for (const [fy, dy] of [[STREET.y0 - 2, 1], [STREET.y1 + 2, -1]]) for (let x = 14; x <= 45; x++) {
      const i = at(x, fy), t = texList[C.wall[i]];
      if (C.h[i] > 0 && !C.b[i] && t && ['plank', 'brick', 'adobe'].includes(t[0]) && isWall(x - 1, fy) && isWall(x + 1, fy) && !isWall(x, fy + dy)) fronts.push([x, fy]);
    }
    for (const [x, y] of pickSpread(fronts, 4, 6)) {
      const i = at(x, y);
      if (!C.up[i]) C.up[i] = C.wall[i]; // au-dessus de 1, le mur nu (sinon l'affiche se répète)
      C.wall[i] = poster(texList[C.wall[i]]);
    }
  };
  return {
    kit,
    spec: {
      name: 'LA VILLE', center: [30, 23], zones: ['street', 'station', ...insides.filter((k) => rooms.some((r) => r.kind === k)), ...ZONE_POOL],
      districts, rooms, cars,
      labels: [{ text: 'GARE', x: 12, y: 9.5 }],
      noSpawn: (x, y) => y >= 3 && y <= 4, // pas sur la voie ferrée
      edge: (c) => c.x < 4 || c.x > MW - 4 || c.y < 7 || c.y > MH - 4, // les bandits arrivent par les bords de la carte (et par le quai)
      cut: { y: 23.5, x0: 14, x1: 46, open: 'station' },
      after,
    },
  };
}

// Termine le monde d'une carte : cases accessibles (les recoins fermés sont murés), points d'apparition, caisses,
// bandits, décor interactif, ce qu'on actionne avec E, calendrier des événements.
function finishWorld(kit, spec, seed, n, kind, map) {
  const { W: MW, H: MH, N, R, C, tex, texList, at, deco, horses, carts, rails, lamps, innOf, isWall, zoneIds } = kit;
  // ---------------------------------------------------------- cases accessibles, points d'apparition
  const pass = new Uint8Array(N);
  const solidDeco = deco.filter((o) => o.solid);
  for (let i = 0; i < N; i++) pass[i] = C.h[i] === 0 || C.b[i] >= 0.9 ? 1 : 0;
  for (const o of solidDeco) if (o.solid >= 0.35) pass[at(Math.floor(o.x), Math.floor(o.y))] = 0;
  const reach = new Uint8Array(N);
  const start = at(...spec.center);
  const q = [start];
  reach[start] = 1;
  while (q.length) {
    const i = q.pop();
    const x = i % MW, y = (i / MW) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const j = at(x + dx, y + dy);
      if (j >= 0 && pass[j] && !reach[j]) { reach[j] = 1; q.push(j); }
    }
  }
  // une case vide qu'on ne peut pas atteindre devient de la roche : personne n'y apparaîtra
  // (sous un toit : recoin fermé d'une pièce, cellule close du shérif... on mure jusqu'au plafond avec le mur intérieur
  // de la pièce, et le toit reste : sinon un bloc de roche trop bas et un trou de ciel)
  for (let i = 0; i < N; i++) if (!reach[i] && C.h[i] === 0 && pass[i]) {
    if (!C.ceil[i]) { C.h[i] = 1.2; C.wall[i] = tex('rock', 0); continue; }
    const x = i % MW, y = (i / MW) | 0;
    // le mur nu de la pièce (pas le comptoir du fond, une porte ou une fenêtre recopiés du mur voisin) ;
    // hors d'un bâtiment (galerie, tunnel...), le mur le plus proche
    let t = innOf[i];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) for (let k = 1; k < 12 && !t; k++) {
      const j = at(x + dx * k, y + dy * k);
      if (j < 0) break;
      if (C.h[j] >= 1.5) { t = C.inn[j]; break; } // le mur de la pièce (les cloisons sont plus basses)
    }
    C.h[i] = FPS.ceil + 0.05; C.wall[i] = C.inn[i] = t || tex('rock', 0);
  }
  spec.after?.(reach);
  const ZONES = zoneIds;
  const freeCells = [];
  for (let i = 0; i < N; i++) {
    if (!reach[i] || C.h[i] > 0) continue;
    const x = i % MW, y = (i / MW) | 0;
    if (deco.some((o) => o.solid && Math.abs(o.x - x - 0.5) < 0.9 && Math.abs(o.y - y - 0.5) < 0.9)) continue;
    if (rails.some((r) => Math.floor(r.x) === x && Math.floor(r.y) === y)) continue;
    if (spec.noSpawn?.(x, y)) continue;
    let open = 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (!isWall(x + dx, y + dy)) open++;
    if (open >= 3) freeCells.push({ x: x + 0.5, y: y + 0.5, zone: ZONES[C.zone[i]] });
  }
  const spread = (list, n, minD) => {
    const out = [];
    const src = [...list];
    for (let k = src.length - 1; k > 0; k--) { const j = Math.floor(R() * (k + 1)); [src[k], src[j]] = [src[j], src[k]]; }
    for (const c of src) {
      if (out.length >= n) break;
      if (out.every((o) => Math.hypot(o.x - c.x, o.y - c.y) >= minD)) out.push(c);
    }
    return out;
  };
  const [cx, cy] = spec.center;
  const spawns = spread(freeCells, 22, 6).map((c) => ({ ...c, a: Math.atan2(cy - c.y, cx - c.x) }));
  const crateSpots = spread(freeCells, 34, 4);
  // les bandits arrivent par les bords de la carte (ou par où la carte le dit)
  const edge = freeCells.filter(spec.edge || ((c) => c.x < 4 || c.x > MW - 4 || c.y < 4 || c.y > MH - 4));
  const npcSpots = spread(edge.length >= 6 ? edge : freeCells, 12, 7);
  horses.forEach((h, k) => { h.id = k; h.hx = h.x; h.hy = h.y; h.ha = h.a; });
  carts.forEach((c, k) => { c.id = k; });
  const zones = spec.zones || [zoneIds[0]];
  const world = {
    seed, map, name: spec.name || '', center: [cx + 0.5, cy + 0.5], w: MW, h: MH, cells: C, tex: texList, flats: kit.flatList, zoneNames: ZONES,
    // (un lustre ou une lanterne sous un trou du toit pendrait à rien : le regard levé montrerait sa chaîne dans le ciel)
    deco: deco.filter((o) => !o.hang || C.ceil[at(Math.floor(o.x), Math.floor(o.y))]).map((o, k) => ({ ...o, k })), horses, carts, rails, lamps, rooms: spec.rooms || [], districts: spec.districts || [], cars: spec.cars || [],
    labels: spec.labels || [], cut: spec.cut || null, radar: spec.radar || null, upBack: spec.upBack || null, bare: spec.bare || null,
    spawns, crateSpots, npcSpots, zones, pass, reach,
  };
  // décor interactif (voir PROPS) : objets du décor, puis murs bas (caisses, TNT, foin) ; orig : la case intacte
  const props = [];
  for (const o of world.deco) if (PROP_DECO[o.id] && !o.pk) props.push(o.pr = { key: `d${o.k}`, kind: PROP_DECO[o.id], x: o.x, y: o.y, k: o.k });
  for (let i = 0; i < N; i++) {
    const kind = C.h[i] > 0 && C.h[i] < 1 && !C.b[i] && PROP_CELL[texList[C.wall[i]]?.[0]];
    if (kind) props.push({ key: `c${i}`, kind, x: (i % MW) + 0.5, y: Math.floor(i / MW) + 0.5, i, orig: [C.h[i], C.wall[i], C.up[i], C.inn[i]] });
  }
  world.props = props;
  world.propOf = new Map(props.map((p) => [p.key, p]));
  // ce qu'on actionne avec E : le canon du fort, le comptoir du saloon et de la cantina (bar v0 et v1)
  world.uses = [
    ...world.deco.filter((o) => o.id === 'cannon').map((o) => ({ key: `d${o.k}`, kind: 'cannon', x: o.x, y: o.y })),
    ...[...C.wall.keys()].filter((i) => C.h[i] > 0 && texList[C.wall[i]]?.[0] === 'bar' && texList[C.wall[i]][1] <= 1)
      .map((i) => ({ key: `c${i}`, kind: 'bar', x: (i % MW) + 0.5, y: Math.floor(i / MW) + 0.5 })),
  ];
  world.events = fpsEvents(seed, MODES[kind].duration, n, zones);
  if (isDm(kind)) world.events = world.events.filter((e) => !npcEvent(e));
  return world;
}

// ================================================================ géométrie partagée
export const cellAt = (w, x, y) => {
  const cx = Math.floor(x), cy = Math.floor(y);
  return cx < 0 || cy < 0 || cx >= w.w || cy >= w.h ? -1 : cy * w.w + cx;
};
// la case arrête-t-elle quelqu'un ? (à cheval, on ne passe pas sous les linteaux)
export function blocks(w, i, tall = false) {
  if (i < 0) return true;
  const C = w.cells;
  if (C.h[i] === 0) return false;
  return C.b[i] < (tall ? 1.4 : 0.9);
}
// la case arrête-t-elle une balle tirée à hauteur z ?
export function stopsBullet(w, i, z = 0.5) {
  if (i < 0) return true;
  const C = w.cells;
  return C.h[i] > z && C.b[i] < z;
}
export const roofed = (w, x, y) => { const i = cellAt(w, x, y); return i >= 0 && w.cells.ceil[i] > 0; };
export const onRails = (w, x, y) => {
  const i = cellAt(w, x, y);
  if (i < 0) return false;
  const f = w.flats[w.cells.floor[i]];
  return (f === 'railsX' && Math.floor(y) >= 3 && Math.floor(y) <= 4);
};

// Déplacement d'un cercle (rayon r) avec glissement le long des murs et des objets du décor.
export function move(w, x, y, dx, dy, r = FPS.radius, tall = false) {
  const free = (px, py) => {
    for (const [ox, oy] of [[-r, -r], [r, -r], [-r, r], [r, r]]) if (blocks(w, cellAt(w, px + ox, py + oy), tall)) return false;
    return true;
  };
  let nx = x + dx, ny = y;
  if (!free(nx, ny)) nx = x;
  ny = y + dy;
  if (!free(nx, ny)) ny = y;
  // objets massifs : on est repoussé hors de leur cercle
  for (const o of w.solids || (w.solids = w.deco.filter((d) => d.solid))) {
    if (o.gone) continue; // détruit (baril, tonneau)
    const ddx = nx - o.x, ddy = ny - o.y;
    const min = o.solid + r;
    const d2 = ddx * ddx + ddy * ddy;
    if (d2 < min * min && d2 > 1e-6) {
      const d = Math.sqrt(d2);
      const px = o.x + (ddx / d) * min, py = o.y + (ddy / d) * min;
      if (free(px, py)) { nx = px; ny = py; }
    }
  }
  return { x: nx, y: ny };
}

// Point de chute d'un boulet tiré de la pièce en (x, y) vers a, à la portée voulue (la hausse) : il passe par-dessus
// les murs bas, pas au travers d'un mur plein. Le même calcul chez l'hôte (le tir) et chez le servant (la mire).
export function cannonReach(w, x, y, a, want = FPS.cannon.range) {
  const { near, range } = FPS.cannon;
  return Math.max(1.5, Math.min(clamp(want, near, range), rayWall(w, x, y, a, range + 1, 0.95) - 0.35));
}
// Mortier : de même, la portée voulue (bornée) s'arrête devant le premier grand mur ; l'obus passe les murets
export function mortarReach(w, x, y, a, want = FPS.mortar.range) {
  const { near, range } = FPS.mortar;
  return Math.max(1.5, Math.min(clamp(want, near, range), rayWall(w, x, y, a, range + 1, 0.95) - 0.35));
}

// Lancer de rayon sur la grille : distance jusqu'au premier mur qui arrête une balle (à hauteur z).
// RAY.i : la case de ce mur (-1 si aucun), pour savoir si la balle a fini dans une caisse de TNT.
export const RAY = { i: -1 };
export function rayWall(w, x, y, a, max = 60, z = 0.5) {
  RAY.i = -1;
  const dx = Math.cos(a), dy = Math.sin(a);
  let cx = Math.floor(x), cy = Math.floor(y);
  const sx = dx < 0 ? -1 : 1, sy = dy < 0 ? -1 : 1;
  const ddx = Math.abs(1 / (dx || 1e-9)), ddy = Math.abs(1 / (dy || 1e-9));
  let tx = (dx < 0 ? x - cx : cx + 1 - x) * ddx, ty = (dy < 0 ? y - cy : cy + 1 - y) * ddy;
  let d = 0;
  while (d < max) {
    if (tx < ty) { d = tx; tx += ddx; cx += sx; } else { d = ty; ty += ddy; cy += sy; }
    if (cx < 0 || cy < 0 || cx >= w.w || cy >= w.h) return d;
    if (stopsBullet(w, cy * w.w + cx, z)) { RAY.i = cy * w.w + cx; return d; }
  }
  return max;
}

// Hauteur à laquelle une balle atteint quelqu'un : accroupi (à pied), il passe sous le haut des barrières
export const bodyZ = (p) => (p?.c && !p.m ? FPS.crouch.z : 0.5);

// Ligne de vue dégagée entre deux points ?
export function los(w, x0, y0, x1, y1, z = 0.5) {
  const d = Math.hypot(x1 - x0, y1 - y0);
  return rayWall(w, x0, y0, Math.atan2(y1 - y0, x1 - x0), d + 0.01, z) >= d - 0.05;
}

// Distance le long d'un rayon jusqu'à un cercle (centre cx, cy, rayon r), ou null.
export function rayCircle(x, y, a, cx, cy, r) {
  const dx = Math.cos(a), dy = Math.sin(a);
  const fx = cx - x, fy = cy - y;
  const t = fx * dx + fy * dy;
  if (t < 0) return null;
  const px = fx - dx * t, py = fy - dy * t;
  const d2 = px * px + py * py;
  if (d2 > r * r) return null;
  return t - Math.sqrt(r * r - d2);
}

// La boucle de rails : position et cap à l'abscisse s (en cases).
export function railAt(w, s) {
  const R = w.rails;
  const n = R.length;
  if (!n) return { x: 0, y: 0, a: 0 };
  s = ((s % n) + n) % n;
  const i = Math.floor(s), f = s - i;
  const p = R[i], q = R[(i + 1) % n];
  return { x: p.x + (q.x - p.x) * f, y: p.y + (q.y - p.y) * f, a: Math.atan2(q.y - p.y, q.x - p.x) };
}

// Dynamite lancée : point de chute (s'arrête devant un mur)
export function dynLanding(w, x, y, a, pow = 1) {
  const d = Math.min(FPS.dyn.range * clamp(pow, 0.3, 1), rayWall(w, x, y, a, 20, 0.3) - 0.35);
  return { x: x + Math.cos(a) * Math.max(0.3, d), y: y + Math.sin(a) * Math.max(0.3, d) };
}

// Le joueur mis à prix (avis de recherche) : le premier au score, s'il mène vraiment
// (score positif, sans ex aequo) ; -1 sinon. players : [{ score, left }].
export function bountyLeader(players) {
  let best = -1, tie = false;
  players.forEach((p, i) => {
    if (p.left) return;
    if (best < 0 || p.score > players[best].score) { best = i; tie = false; } else if (p.score === players[best].score) tie = true;
  });
  return best >= 0 && !tie && players[best].score > 0 ? best : -1;
}

// Points d'un tir : on peut perdre des points en mourant, mais le score ne descend pas sous zéro
const addPts = (p, pts) => { p.score = Math.max(0, p.score + pts); return pts; };

// Ce que les autres voient d'un joueur (live) : x, y, a en centièmes ; w arme ; f compteur de tirs ;
// m monture ('h3' cheval n° 3, 'c1' wagonnet n° 1) ; s abscisse sur les rails ; z vise à la lunette ; v vitesse ;
// c accroupi.
export function liveOf(p) {
  const d = { x: Math.round(p.x * 100), y: Math.round(p.y * 100), a: Math.round(p.a * 100) };
  if (p.w) d.w = p.w;
  if (p.f) d.f = p.f;
  if (p.m) d.m = p.m;
  if (p.m && p.m[0] === 'c') d.s = Math.round(p.s * 100);
  if (p.v) d.v = Math.round(p.v * 10);
  if (p.c && !p.m) d.c = 1;
  if (p.dead) d.dead = 1;
  return d;
}

// ================================================================ l'arbitre (chez l'hôte)
export class FpsGame {
  // seed : imposée (essais : fps-test.html?seed=), sinon tirée au hasard
  constructor(players, kind = 'fps', seed = Math.floor(Math.random() * 2 ** 31)) {
    this.kind = kind;
    this.dm = isDm(kind); // « Mort ou vif » : pas de bandits, seuls les frags comptent
    this.seed = seed >>> 0;
    this.duration = MODES[kind].duration;
    this.countdown = fpsCutLen(players.length) + HELP_MS; // la cinématique, puis le panneau des règles
    this.world = fpsWorld(this.seed, players.length, kind);
    this.p = players.map((pl, i) => ({
      key: pl.key, name: pl.name, character: pl.character, bot: !!pl.bot,
      score: 0, left: false, stats: { throws: 0, catches: 0, hits: 0, hurt: 0 },
      k: 0, d: 0, hp: FPS.hp, armor: 0, alive: false, deadAt: -1e9, spawnedAt: -1e9, hurtAt: -1e9,
      x: 30, y: 23, a: 0, m: null, s: 0, lo: null, shieldUntil: 0, lastBy: null,
      ai: pl.bot ? this.newBot(i) : null,
    }));
    this.npcs = [];
    this.npcId = 0;
    this.crates = [];
    this.crateId = 0;
    this.nextCrate = 9000;
    this.dyns = [];
    this.dynId = 0;
    this.horses = this.world.horses.map((h) => ({ id: h.id, x: h.x, y: h.y, a: h.a, hp: FPS.horse.hp, rider: -1, deadAt: 0 }));
    this.carts = this.world.carts.map((c) => ({ id: c.id, s: c.s, rider: -1 }));
    this.gold = []; // sacs d'or des événements
    this.fires = []; // flaques de feu (lanterne, réverbère, foin, lustre)
    this.fireId = 0;
    this.tethers = []; // cordes tendues (lasso, harpon) : { by, tg, w, until, release, next }
    this.traps = []; // pièges à loup posés
    this.trapId = 0;
    this.later = []; // ce qui arrive un instant plus tard : barils voisins qui sautent en chaîne, lustre qui touche le sol
    this.ledger = new FpsEventLedger();
    this.lastTick = 0;
    this.nextNpc = FPS.npc.first;
    this.phase = 'playing';
    this.winner = null;
    this.ranking = null;
    this.events = [];
    this.liveOut = [];
    this.startAt = 0;
    this.flow = new Map(); // champs de distance vers chaque joueur (navigation des bandits et des bots)
  }

  get t() { return Date.now() - this.startAt; }
  mods(t = this.t) { return fpsMods(this.world.events, t); }

  start() {
    this.startAt = Date.now() + this.countdown;
    this.push({ type: 'mgStart', kind: this.kind, seed: this.seed, countdown: this.countdown, duration: this.duration });
    return this.flush();
  }

  flush() {
    const e = this.events;
    this.events = [];
    return e;
  }

  view(i) {
    return {
      kind: this.kind, me: i, phase: this.phase, winner: this.winner, ranking: this.ranking,
      players: this.p.map((p) => ({ key: p.key, name: p.name, character: p.character, score: p.score, left: p.left, bot: p.bot, k: p.k, d: p.d, alive: p.alive, hp: p.hp, armor: p.armor })),
    };
  }

  syncView(i) {
    const p = this.p[i];
    return {
      ...this.view(i), seed: this.seed, duration: this.duration, elapsed: this.t,
      npcs: this.npcs.filter((n) => n.alive).map((n) => this.npcPub(n)),
      crates: this.crates.map((c) => ({ id: c.id, x: c.x, y: c.y })),
      horses: this.horses.map((h) => ({ id: h.id, x: h.x, y: h.y, a: h.a, hp: h.hp, rider: h.rider, dead: !!h.deadAt })),
      carts: this.carts.map((c) => ({ id: c.id, s: c.s, rider: c.rider })),
      gold: this.gold.filter((g) => !g.taken).map((g) => ({ id: g.id, x: g.x, y: g.y })),
      pos: this.p.map((q) => ({ x: q.x, y: q.y, a: q.a, alive: q.alive, m: q.m })),
      props: this.world.props.filter((pr) => pr.st && pr.st !== 'ok').map((pr) => [pr.key, pr.st]),
      fires: this.fires.map((f) => ({ id: f.id, x: f.x, y: f.y, r: f.r, t1: f.t1 })),
      traps: this.traps.map((q) => ({ id: q.id, x: q.x, y: q.y, by: q.by })),
      mine: { hp: p.hp, armor: p.armor, alive: p.alive, x: p.x, y: p.y, a: p.a },
    };
  }

  push(ev) {
    ev.dur = 0;
    ev.states = this.p.map((_, i) => this.view(i));
    this.events.push(ev);
  }

  // ---------------------------------------------------------- positions des joueurs (live)
  onLive(key, d) {
    const i = this.p.findIndex((p) => p.key === key);
    const p = this.p[i];
    if (!p || p.bot || !d || !p.alive) return;
    if (Number.isFinite(d.x) && Number.isFinite(d.y)) { p.x = clamp(d.x / 100, 0, this.world.w); p.y = clamp(d.y / 100, 0, this.world.h); }
    if (Number.isFinite(d.a)) p.a = d.a / 100;
    p.v = Number.isFinite(d.v) ? d.v / 10 : 0;
    p.c = !!d.c && !p.m;
    if (p.m) {
      if (p.m[0] === 'h') { const h = this.horses[+p.m.slice(1)]; if (h) { h.x = p.x; h.y = p.y; h.a = p.a; } }
      else if (Number.isFinite(d.s)) { const c = this.carts[+p.m.slice(1)]; if (c) c.s = d.s / 100; p.s = d.s / 100; }
    }
    // le train écrase ceux qui traînent sur la voie
    if (this.mods().train && onRails(this.world, p.x, p.y)) this.damage(i, 999, { train: true });
  }

  // ---------------------------------------------------------- actions des joueurs
  act(i, a) {
    if (this.phase !== 'playing') return { error: 'La partie est terminée.' };
    if (!a || typeof a !== 'object') return { error: 'Action invalide.' };
    const t = this.t;
    const p = this.p[i];
    if (t < -this.countdown || t > this.duration + 600 || p.left) return { events: [] };
    const num = (...k) => k.every((x) => Number.isFinite(a[x]));
    if (a.kind === 'spawn') {
      this.spawn(i, a.lo, t);
      return { events: this.flush() };
    }
    if (!p.alive) return { events: [] };
    // la position jointe à l'action est plus fraîche que la dernière reçue (live, toutes les 150 ms) : prise si plausible
    if (!p.m && num('x', 'y') && Math.hypot(a.x - p.x, a.y - p.y) < 2.5) { p.x = a.x; p.y = a.y; }
    if (a.kind === 'hit' && (a.tg === 'n' || a.tg === 'p') && Number.isInteger(a.id) && num('dmg')) this.playerHit(i, a, t);
    else if (a.kind === 'pick' && Number.isInteger(a.id)) this.pickCrate(i, a.id, t);
    else if (a.kind === 'gold' && Number.isInteger(a.id)) this.pickGold(i, a.id);
    else if (a.kind === 'mount' && typeof a.m === 'string') this.mount(i, a.m);
    else if (a.kind === 'dismount') this.dismount(i);
    else if (a.kind === 'throw' && num('x', 'y', 'a')) this.throwDyn(i, a, t);
    else if (a.kind === 'trap' && num('tx', 'ty')) this.setTrap(i, { x: a.tx, y: a.ty }, t);
    else if (a.kind === 'ignite' && num('tx', 'ty')) this.ignite(i, { x: a.tx, y: a.ty }, t);
    else if (a.kind === 'reel') this.reel(i, !!a.on, t);
    else if (a.kind === 'prop' && typeof a.key === 'string' && num('dmg')) this.playerProp(i, a, t);
    else if (a.kind === 'use' && typeof a.key === 'string') this.use(i, a, t);
    else if (a.kind === 'shot') p.stats.throws++; // simple compteur (statistiques)
    else return { error: 'Action inconnue.' };
    return { events: this.flush() };
  }

  // Apparition (ou retour) : loin des autres joueurs et des bandits.
  spawn(i, lo, t) {
    const p = this.p[i];
    if (p.alive || t < -500 || t - p.deadAt < FPS.respawn - 300) return;
    p.lo = cleanLoadout(lo);
    const sp = this.spawnPoint(i);
    Object.assign(p, { alive: true, hp: FPS.hp, armor: p.lo.e === 'vest' ? FPS.maxArmor : 0, x: sp.x, y: sp.y, a: sp.a, m: null, spawnedAt: t, shieldUntil: t + 1500, lastBy: null });
    this.push({ type: 'spawn', who: i, x: sp.x, y: sp.y, a: sp.a, lo: p.lo, hp: p.hp, armor: p.armor });
  }

  spawnPoint(i) {
    const foes = [...this.p.filter((q, j) => j !== i && q.alive), ...this.npcs.filter((n) => n.alive)];
    let best = null, bestD = -1;
    for (const s of this.world.spawns) {
      const d = foes.length ? Math.min(...foes.map((f) => Math.hypot(f.x - s.x, f.y - s.y))) : 0;
      const score = d + Math.random() * 4;
      if (score > bestD) { bestD = score; best = s; }
    }
    return best || { x: this.world.center[0], y: this.world.center[1], a: 0 };
  }

  // Le joueur annonce ce qu'il a touché ; l'hôte vérifie que c'est plausible et applique les dégâts.
  playerHit(i, a, t) {
    const p = this.p[i];
    const w = a.w;
    const max = maxShot(w);
    if (!max) return;
    const mods = this.mods(t);
    if (mods.melee && !WEAPONS[w]?.melee && w !== 'horse') return;
    let dmg = clamp(a.dmg, 0, max) * mods.dmgMult;
    const range = (WEAPONS[w]?.range || 2) * 2 + 4;
    if (a.tg === 'n') {
      const n = this.npcs.find((q) => q.id === a.id && q.alive);
      if (!n || Math.hypot(n.x - p.x, n.y - p.y) > range) return;
      this.npcDamage(n, dmg, i, w, t);
      this.onHit(i, { n }, w, dmg, t, !!a.hold);
    } else {
      const j = a.id;
      const q = this.p[j];
      if (!q || j === i || !q.alive || Math.hypot(q.x - p.x, q.y - p.y) > range) return;
      if (t - q.spawnedAt < 1500) return; // un instant d'invulnérabilité au retour
      p.stats.hits++;
      this.damage(j, dmg, { by: i, w });
      this.onHit(i, { p: j }, w, dmg, t, !!a.hold);
    }
  }

  // Ce que fait le coup en plus des dégâts (joueur i, cible { p } ou { n }) : le lasso et le harpon attachent la cible
  // au bout de leur corde (le cavalier est désarçonné) ; hold : le tireur maintenait le tir quand le coup a porté (sinon
  // la corde est lâchée aussitôt). Le pistolet du Diable rend au tireur une part des dégâts.
  onHit(i, tg, w, dmg, t, hold = false) {
    const W8 = WEAPONS[w], p = this.p[i];
    if (!W8 || !p) return;
    if (W8.leech && p.alive && p.hp < FPS.hp) {
      p.hp = Math.min(FPS.hp, Math.round(p.hp + dmg * W8.leech));
      this.push({ type: 'regen', who: i, hp: p.hp, leech: true });
    }
    const T = W8.tether;
    if (!T || !p.alive) return;
    const q = tg.p != null ? this.p[tg.p] : tg.n;
    if (!q?.alive) return;
    if (tg.p != null && q.m) this.dismount(tg.p);
    for (const x of this.tethers.filter((x) => x.by === i)) this.untether(x, t); // une seule corde par tireur
    // les bots tiennent la corde un moment puis la lâchent
    if (p.bot) hold = true;
    if (!hold) { if (T.keep) this.snare(tg, T.keep, t, w, i); return; }
    this.tethers.push({ by: i, tg, w, until: t + T.max, release: p.bot ? t + rnd(700, 2000) : Infinity, next: 0 });
    this.snare(tg, 450, t, w, i);
    this.push({ type: 'tether', by: i, who: tg.p ?? -1, npc: tg.n ? tg.n.id : -1, w });
  }

  // Le tireur relâche le tir (on = false) : la corde est lâchée
  reel(i, on, t) {
    if (on) return;
    for (const x of this.tethers.filter((x) => x.by === i)) this.untether(x, t);
  }

  // Corde lâchée (ou rompue) : le harpon libère la cible, le lasso la laisse ligotée encore keep ms
  untether(x, t) {
    const k = this.tethers.indexOf(x);
    if (k < 0) return;
    this.tethers.splice(k, 1);
    const q = x.tg.p != null ? this.p[x.tg.p] : x.tg.n;
    if (q?.alive) this.snare(x.tg, WEAPONS[x.w].tether.keep, t, x.w, x.by, true);
    this.push({ type: 'untether', by: x.by });
  }

  // Cordes tendues : la cible est ramenée vers le tireur (sans le coller), et reste entravée ; la corde se rompt si
  // l'un des deux tombe, si elle passe derrière un mur, ou au bout de max ms. La position de la cible est annoncée
  // toutes les 150 ms (le joueur tiré la suit en douceur).
  tetherTick(t, dt) {
    for (const x of [...this.tethers]) {
      const p = this.p[x.by], q = x.tg.p != null ? this.p[x.tg.p] : x.tg.n, W8 = WEAPONS[x.w];
      if (!p?.alive || !q?.alive || t >= x.until || t >= x.release) { this.untether(x, t); continue; }
      const d = Math.hypot(q.x - p.x, q.y - p.y);
      if (d > W8.range + 3 || !los(this.world, p.x, p.y, q.x, q.y)) { this.untether(x, t); continue; }
      if (d > 1.3) {
        const step = Math.min(W8.tether.speed * dt, d - 1.3);
        const r = move(this.world, q.x, q.y, ((p.x - q.x) / d) * step, ((p.y - q.y) / d) * step, x.tg.n ? 0.26 : FPS.radius);
        q.x = r.x; q.y = r.y;
      }
      q.snareUntil = t + 450;
      if (t >= x.next) { x.next = t + 150; this.snare(x.tg, 450, t, x.w, x.by, true); }
    }
  }

  // Une cible entravée (lasso, harpon, piège) : elle ne peut plus avancer pendant ms (elle tire encore) ; quiet : mise à
  // jour d'une corde déjà tendue (pas d'annonce ni de bruit chez les joueurs)
  snare(tg, ms, t, w, by = -1, quiet = false) {
    if (tg.n) {
      tg.n.snareUntil = t + ms;
      this.push({ type: 'snare', npc: tg.n.id, ms, x: tg.n.x, y: tg.n.y, w, by, quiet: quiet || undefined });
    } else {
      const q = this.p[tg.p];
      q.snareUntil = t + ms;
      this.push({ type: 'snare', who: tg.p, ms, x: q.x, y: q.y, w, by, quiet: quiet || undefined });
    }
  }


  // Dégâts subis par un joueur (by : joueur, npc : bandit, train, dyn).
  damage(j, dmg, src = {}) {
    const q = this.p[j];
    const t = this.t;
    if (!q.alive) return;
    if (t < q.shieldUntil) dmg *= t - q.spawnedAt < 1600 ? 0 : FPS.shieldTake;
    let horse = null; // la part du cheval, annoncée avec le coup (sa barre de vie, chez le cavalier et chez le tireur)
    if (q.m) {
      // la monture encaisse sa part
      if (q.m[0] === 'h') {
        const h = this.horses[+q.m.slice(1)];
        const hd = dmg * FPS.horse.share;
        dmg -= hd;
        if (h) {
          h.hp -= hd;
          horse = { id: h.id, hp: Math.max(0, Math.round(h.hp)), dmg: Math.round(hd) };
          if (h.hp <= 0) this.horseDown(h, t, src.by ?? -1);
        }
      } else dmg *= 1 - FPS.cart.share;
    }
    if (src.train) dmg = 999;
    const soak = Math.min(q.armor, dmg * 0.66);
    q.armor = Math.round(q.armor - soak);
    q.hp = Math.round(q.hp - (dmg - soak));
    q.hurtAt = t;
    q.stats.hurt++;
    if (src.by != null) q.lastBy = src.by;
    if (q.hp <= 0) return this.kill(j, src);
    this.push({ type: 'hurt', who: j, dmg: Math.round(dmg), hp: q.hp, armor: q.armor, by: src.by ?? -1, npc: src.npc ?? -1, fx: src.fx, fy: src.fy, horse });
  }

  kill(j, src) {
    const q = this.p[j];
    const t = this.t;
    if (q.m) this.dismount(j, true);
    q.alive = false;
    q.hp = 0;
    q.deadAt = t;
    q.d++;
    const by = src.by ?? -1;
    const mods = this.mods(t);
    let pts = 0, bounty = 0;
    if (by >= 0 && by !== j) {
      const k = this.p[by];
      k.k++;
      pts = addPts(k, Math.round((this.dm ? FPS_DM.frag : FPS_PTS.frag) * mods.fragPts));
      // avis de recherche : le meneur abattu rapporte une prime
      if (mods.bounty === 'leader' && this.leader() === j) bounty = addPts(k, this.dm ? FPS_DM.bounty : mods.bountyPts);
    }
    const lost = this.dm ? (by === j ? addPts(q, FPS_DM.self) : 0) : addPts(q, by === j ? FPS_PTS.self : FPS_PTS.death);
    this.push({ type: 'kill', who: j, by, npc: src.npc ?? -1, w: src.w || (src.train ? 'train' : src.dyn ? 'dynamite' : null), pts, bounty, lost, x: q.x, y: q.y });
  }

  leader() { return bountyLeader(this.p); }

  // ---------------------------------------------------------- caisses
  pickCrate(i, id, t) {
    const p = this.p[i];
    const k = this.crates.findIndex((c) => c.id === id);
    if (k < 0) return;
    const c = this.crates[k];
    if (Math.hypot(c.x - p.x, c.y - p.y) > 1.6) return;
    this.crates.splice(k, 1);
    const loot = rollLoot(c.set || this.mods(t).crateLoot); // set : butin du coffre de la banque
    const L = LOOT[loot];
    if (L.hp) p.hp = Math.min(FPS.hp, p.hp + L.hp);
    if (L.armor) p.armor = Math.min(FPS.maxArmor, p.armor + L.armor);
    if (loot === 'star') p.shieldUntil = t + FPS.shield;
    p.stats.catches++;
    this.push({ type: 'picked', id, by: i, loot, hp: p.hp, armor: p.armor });
  }

  spawnCrate(t) {
    const max = FPS.crateMax + Math.floor(this.p.length / 2);
    if (this.crates.length >= max) return;
    const busy = (s) => this.crates.some((c) => Math.hypot(c.x - s.x, c.y - s.y) < 3)
      || this.p.some((p) => p.alive && Math.hypot(p.x - s.x, p.y - s.y) < 5);
    const spots = this.world.crateSpots.filter((s) => !busy(s));
    if (!spots.length) return;
    const s = pick(spots);
    const c = { id: this.crateId++, x: s.x, y: s.y, t1: t + FPS.crateLife };
    this.crates.push(c);
    this.push({ type: 'crate', id: c.id, x: c.x, y: c.y });
  }

  pickGold(i, id) {
    const p = this.p[i];
    const g = this.gold.find((q) => q.id === id && !q.taken);
    if (!g || Math.hypot(g.x - p.x, g.y - p.y) > 1.6) return;
    if (!this.ledger.claim(g.ev, g.n, i)) return;
    g.taken = true;
    const pts = addPts(p, FPS_GOLD.pts);
    this.push({ type: 'goldTaken', id, by: i, pts });
  }

  // ---------------------------------------------------------- montures
  mount(i, m) {
    const p = this.p[i];
    if (p.m) return;
    if (m[0] === 'h') {
      const h = this.horses[+m.slice(1)];
      if (!h || h.rider >= 0 || h.deadAt || Math.hypot(h.x - p.x, h.y - p.y) > 2) return;
      h.rider = i;
      p.m = m;
      p.x = h.x; p.y = h.y;
      this.push({ type: 'mount', who: i, m, x: h.x, y: h.y, a: h.a, hp: h.hp });
    } else if (m[0] === 'c') {
      const c = this.carts[+m.slice(1)];
      if (!c || c.rider >= 0) return;
      const pos = railAt(this.world, c.s);
      if (Math.hypot(pos.x - p.x, pos.y - p.y) > 2) return;
      c.rider = i;
      p.m = m;
      p.s = c.s;
      this.push({ type: 'mount', who: i, m, s: c.s });
    }
  }

  dismount(i, silent = false) {
    const p = this.p[i];
    if (!p.m) return;
    const m = p.m;
    p.m = null;
    let x = p.x, y = p.y;
    if (m[0] === 'h') {
      const h = this.horses[+m.slice(1)];
      if (h) { h.rider = -1; h.x = p.x; h.y = p.y; }
    } else {
      const c = this.carts[+m.slice(1)];
      if (c) c.rider = -1;
    }
    // on descend à côté de la monture
    for (const [dx, dy] of [[0.8, 0], [-0.8, 0], [0, 0.8], [0, -0.8]]) {
      if (!blocks(this.world, cellAt(this.world, p.x + dx, p.y + dy))) { x = p.x + dx; y = p.y + dy; break; }
    }
    p.x = x; p.y = y;
    if (!silent) this.push({ type: 'dismount', who: i, m, x, y });
    else this.push({ type: 'dismount', who: i, m, x, y, silent: true });
  }

  // by : qui l'a abattu (-1 : un bandit, une explosion) ; rider : qui le montait (il se retrouve à pied)
  horseDown(h, t, by = -1) {
    h.hp = 0;
    h.deadAt = t;
    const r = h.rider;
    if (r >= 0) this.dismount(r);
    h.rider = -1;
    this.push({ type: 'horseDown', id: h.id, x: h.x, y: h.y, by, rider: r });
  }

  // ---------------------------------------------------------- dynamite
  // a.item : 'molotov' (cocktail : il éclate en touchant le sol), 'mortar' (obus du mortier, a.d : portée voulue),
  // sinon un bâton de dynamite
  throwDyn(i, a, t) {
    const p = this.p[i];
    if (Math.hypot(a.x - p.x, a.y - p.y) > 3 || this.mods(t).melee) return;
    if (a.item === 'mortar') {
      const d = mortarReach(this.world, a.x, a.y, a.a, Number.isFinite(a.d) ? a.d : FPS.mortar.range);
      this.addDyn({ by: i, x0: a.x, y0: a.y, x1: a.x + Math.cos(a.a) * d, y1: a.y + Math.sin(a.a) * d, at: t, ball: true, mortar: true, fuse: 450 + d * 55 });
      return;
    }
    const to = dynLanding(this.world, a.x, a.y, a.a, Number.isFinite(a.pow) ? a.pow : 1);
    if (a.item === 'molotov') this.addDyn({ by: i, x0: a.x, y0: a.y, x1: to.x, y1: to.y, at: t, mol: true, fuse: 650 });
    else this.addDyn({ by: i, x0: a.x, y0: a.y, x1: to.x, y1: to.y, at: t });
    p.stats.throws++;
  }

  // d.ball : boulet de canon ou obus de mortier (vole d.fuse ms, sans mèche) ; d.mol : cocktail (éclate à l'arrivée)
  addDyn(d) {
    d.id = this.dynId++;
    d.boomAt = d.at + (d.fuse || FPS.dyn.fuse);
    this.dyns.push(d);
    this.push({ type: 'dyn', id: d.id, by: d.by, npc: d.npc ?? -1, x0: d.x0, y0: d.y0, x1: d.x1, y1: d.y1, at: d.at, boomAt: d.boomAt, ball: d.ball || undefined, mortar: d.mortar || undefined, mol: d.mol || undefined });
  }

  explode(d, t) {
    if (d.mol) {
      // le verre éclate, le tord-boyaux s'enflamme : une grande flaque de feu (le foin et les barils voisins s'en chargent)
      this.push({ type: 'boom', id: d.id, x: d.x1, y: d.y1, mol: true });
      this.addFire(d.x1, d.y1, { by: d.by, npc: d.npc }, t, FPS.mol.fire, FPS.mol.r);
      return;
    }
    const w = d.mortar ? 'coehorn' : d.ball ? 'cannon' : 'dynamite';
    this.blast(d.x1, d.y1, { by: d.by, npc: d.npc, id: d.id, w, power: d.mortar ? FPS.mortar : d.ball ? FPS.cannon : FPS.dyn }, t);
  }

  // ---------------------------------------------------------- pièges à loup et flèches enflammées
  setTrap(i, a, t) {
    const p = this.p[i];
    if (Math.hypot(a.x - p.x, a.y - p.y) > 2 || blocks(this.world, cellAt(this.world, a.x, a.y))) return;
    // au-delà de max pièges posés par le même joueur, le plus ancien est ramassé
    const mine = this.traps.filter((q) => q.by === i);
    if (mine.length >= FPS.trap.max) this.dropTrap(mine[0]);
    const q = { id: this.trapId++, x: a.x, y: a.y, by: i, t1: t + FPS.trap.life };
    this.traps.push(q);
    this.push({ type: 'trap', id: q.id, x: q.x, y: q.y, by: i });
  }

  dropTrap(q, ev = { type: 'trapGone' }) {
    this.traps.splice(this.traps.indexOf(q), 1);
    this.push({ ...ev, id: q.id, x: q.x, y: q.y });
  }

  // Le piège se referme sur le premier qui marche dessus (son poseur l'enjambe) ; il disparaît au bout de life ms
  trapTick(t) {
    for (const q of [...this.traps]) {
      if (t >= q.t1) { this.dropTrap(q); continue; }
      const j = this.p.findIndex((p, k) => p.alive && k !== q.by && !p.m && Math.hypot(p.x - q.x, p.y - q.y) < FPS.trap.r + FPS.radius);
      const n = j < 0 ? this.npcs.find((m) => m.alive && Math.hypot(m.x - q.x, m.y - q.y) < FPS.trap.r + 0.3) : null;
      if (j < 0 && !n) continue;
      this.dropTrap(q, { type: 'trapped', who: j, npc: n ? n.id : -1, by: q.by });
      const v = FPS.trap.dmg * this.mods(t).dmgMult;
      if (n) { this.npcDamage(n, v, q.by, 'trap', t); if (n.alive) this.snare({ n }, FPS.trap.snare, t, 'trap', q.by); }
      else { this.damage(j, v, { by: q.by >= 0 && q.by !== j ? q.by : undefined, w: 'trap', fx: q.x, fy: q.y }); if (this.p[j].alive) this.snare({ p: j }, FPS.trap.snare, t, 'trap', q.by); }
    }
  }

  // Flèche enflammée (arc bandé à fond) : une petite flamme là où elle s'est plantée
  ignite(i, a, t) {
    const p = this.p[i];
    if (Math.hypot(a.x - p.x, a.y - p.y) > WEAPONS.bow.range * 2 + 4 || this.mods(t).melee) return;
    if (t - (p.igniteAt || -1e9) < 250) return;
    p.igniteAt = t;
    this.addFire(a.x, a.y, { by: i }, t, 2600, 0.45);
  }

  // Une explosion (dynamite, boulet, baril) : dégâts dégressifs à ceux qu'elle voit, puis le décor alentour.
  blast(x, y, o, t) {
    const { radius, dmg, min, self } = o.power;
    const fall = (dist) => (dist > radius ? 0 : min + (dmg - min) * (1 - dist / radius));
    const dmgM = this.mods(t).dmgMult;
    const by = o.by ?? -1;
    this.push({ type: 'boom', id: o.id, x, y, big: o.w === 'barrel' || undefined });
    this.p.forEach((q, j) => {
      if (!q.alive) return;
      const dist = Math.hypot(q.x - x, q.y - y);
      let v = fall(dist) * dmgM;
      if (!v || !los(this.world, x, y, q.x, q.y, 0.3)) return;
      if (j === by) v *= self;
      this.damage(j, v, { by: by >= 0 ? by : undefined, npc: o.npc, w: o.w, dyn: true, fx: x, fy: y });
    });
    for (const n of this.npcs) {
      if (!n.alive) continue;
      const dist = Math.hypot(n.x - x, n.y - y);
      const v = fall(dist) * dmgM;
      if (v && los(this.world, x, y, n.x, n.y, 0.3)) this.npcDamage(n, v, by, o.w, t);
    }
    for (const h of this.horses) {
      if (h.deadAt || h.rider >= 0) continue;
      if (Math.hypot(h.x - x, h.y - y) < radius * 0.6) this.horseDown(h, t, by);
    }
    // le décor : les barils voisins sautent à leur tour (un instant après : la réaction en chaîne se voit),
    // les caisses volent, le foin s'embrase, lanternes et bouteilles éclatent, le coffre s'ouvre
    const src = { by, npc: o.npc };
    for (const pr of this.world.props) {
      if ((pr.st && pr.st !== 'ok') || pr.armed) continue;
      if (Math.hypot(pr.x - x, pr.y - y) >= Math.min(radius + 0.3, PROPS[pr.kind].blast)) continue;
      if (pr.kind === 'tnt') this.arm(pr, src, t, rnd(140, 320));
      else this.propBreak(pr, src, t);
    }
  }

  // ---------------------------------------------------------- décor interactif
  // Le joueur annonce une balle dans le décor : l'hôte vérifie la portée, comme pour un tir sur quelqu'un.
  playerProp(i, a, t) {
    const p = this.p[i];
    const pr = this.world.propOf.get(a.key);
    const max = maxShot(a.w);
    if (!pr || !max || (this.mods(t).melee && !WEAPONS[a.w]?.melee)) return;
    if (Math.hypot(pr.x - p.x, pr.y - p.y) > (WEAPONS[a.w]?.range || 2) * 2 + 4) return;
    // la pioche : un coup suffit (tonneaux, caisses, rochers, murets de caisses... et barils de poudre, gare !)
    if (WEAPONS[a.w]?.breaks) {
      if (!PICKABLE.has(pr.kind) || (pr.st && pr.st !== 'ok') || pr.armed) return;
      if (pr.kind === 'tnt') this.arm(pr, { by: i }, t, 0);
      else this.propBreak(pr, { by: i }, t);
      return;
    }
    this.propHit(pr, clamp(a.dmg, 0, max), { by: i }, t);
  }

  propHit(pr, dmg, src, t) {
    const P = PROPS[pr.kind];
    if (!P.hp || (pr.st && pr.st !== 'ok') || pr.armed) return;
    pr.hp = (pr.hp ?? P.hp) - dmg;
    if (pr.hp > 0) return;
    if (pr.kind === 'tnt') this.arm(pr, src, t, 0);
    else this.propBreak(pr, src, t);
  }

  // un baril qui va sauter (tout de suite, ou après un délai : chaîne, flammes)
  arm(pr, src, t, delay) {
    pr.armed = true;
    this.later.push({ at: t + delay, fn: (t2) => { pr.armed = false; this.propBreak(pr, src, t2); } });
  }

  setProp(pr, st, t, extra = {}) {
    applyProp(this.world, pr, st);
    pr.hp = undefined;
    pr.back = st === 'ok' || st === 'burn' ? 0 : t + FPS.prop.back;
    if (pr.i != null) this.flow.clear(); // une case s'ouvre ou se referme : les chemins changent
    this.push({ type: 'prop', key: pr.key, st, x: pr.x, y: pr.y, ...extra });
  }

  propBreak(pr, src, t) {
    if (pr.st && pr.st !== 'ok') return;
    const by = src.by ?? -1;
    switch (pr.kind) {
      case 'tnt':
        this.setProp(pr, 'gone', t, { by });
        this.blast(pr.x, pr.y, { by, npc: src.npc, w: 'barrel', power: FPS.barrel }, t);
        break;
      case 'barrel':
        this.setProp(pr, 'gone', t, { by });
        if (Math.random() < FPS.prop.loot) this.dropCrate(pr.x, pr.y, t);
        break;
      case 'hay':
        this.setProp(pr, 'burn', t);
        pr.burnOut = t + FPS.fire.hay;
        this.addFire(pr.x, pr.y, src, t, FPS.fire.hay, 0.9);
        break;
      case 'lantern':
        this.setProp(pr, 'gone', t, { by });
        this.addFire(pr.x, pr.y, src, t);
        break;
      case 'lamp':
        this.setProp(pr, 'broken', t, { by });
        this.addFire(pr.x, pr.y, src, t, FPS.fire.lamp, 0.6);
        break;
      case 'chandelier':
        this.setProp(pr, 'fallen', t, { by });
        this.later.push({ at: t + FPS.prop.fall, fn: (t2) => this.crush(pr, src, t2) });
        break;
      case 'safe': {
        this.setProp(pr, 'open', t, { by });
        // le butin s'échappe : une arme de caisse (ou l'étoile), puis des munitions et des soins
        ['power', 'heal', 'ammo'].forEach((set, k) => this.dropCrate(pr.x, pr.y, t, set, k));
        if (by >= 0 && this.p[by] && !this.dm) this.heist(pr, by, t);
        break;
      }
      default: this.setProp(pr, 'gone', t, { by }); // caisses, rochers, bouteilles
    }
  }

  // Braquage : le magot d'El Diablo pour le dynamiteur, des sacs d'or qui roulent autour du coffre (au premier
  // arrivé), et ses hommes de main qui débarquent et traquent le braqueur un moment.
  heist(pr, by, t) {
    const H = FPS.heist, w = this.world;
    const pts = addPts(this.p[by], H.pts);
    const ev = { k: `heist${(this.heists = (this.heists || 0) + 1)}` }; // pour le registre : chaque sac ne se ramasse qu'une fois
    // le coffre est contre un mur : on cherche autour, de plus en plus loin, des places libres et en vue du coffre
    const bags = [];
    for (const d of [0.75, 1.15, 1.55, 1.95, 2.4, 2.85]) {
      for (let s = 0; s < 16 && bags.length < H.bags; s++) {
        const a = (s / 16) * Math.PI * 2 + d;
        const x = pr.x + Math.cos(a) * d, y = pr.y + Math.sin(a) * d;
        if (blocks(w, cellAt(w, x, y)) || !los(w, pr.x, pr.y, x, y, 0.3) || bags.some((b) => Math.hypot(b.x - x, b.y - y) < 0.6)) continue;
        const g = { id: this.gold.length, ev, n: bags.length, x, y, t1: t + H.bagLife };
        this.gold.push(g);
        bags.push({ id: g.id, x, y });
      }
    }
    this.hunt = { p: by, until: t + H.hunt };
    for (let k = 0; k < H.posse; k++) {
      const n = this.spawnNpc(t, k ? 'rifleman' : 'bandit');
      if (n) n.target = { p: by };
    }
    this.push({ type: 'heist', by, pts, x: pr.x, y: pr.y, gold: bags });
  }

  // le lustre touche le sol : ceux qui sont dessous sont écrasés, les bougies mettent le feu
  crush(pr, src, t) {
    const by = src.by ?? -1;
    const v = FPS.prop.crush * this.mods(t).dmgMult;
    this.p.forEach((q, j) => {
      if (q.alive && Math.hypot(q.x - pr.x, q.y - pr.y) < 0.9) this.damage(j, j === by ? v * 0.5 : v, { by: by >= 0 ? by : undefined, w: 'crush', fx: pr.x, fy: pr.y });
    });
    for (const n of this.npcs) if (n.alive && Math.hypot(n.x - pr.x, n.y - pr.y) < 0.9) this.npcDamage(n, v * 1.5, by, 'crush', t);
    this.addFire(pr.x, pr.y, src, t, 3000, 0.7);
  }

  // une caisse qui tombe du décor (tonneau, coffre) : à côté, sur une case libre ; set : butin imposé
  dropCrate(x, y, t, set = null, k = 0) {
    const w = this.world;
    const spots = [[0, 0], [0.8, 0], [-0.8, 0], [0, 0.8], [0, -0.8], [0.8, 0.8], [-0.8, -0.8], [0.8, -0.8], [-0.8, 0.8]];
    const s = spots.slice(k ? 1 : 0).map(([dx, dy]) => ({ x: x + dx, y: y + dy }))
      .find((q) => !blocks(w, cellAt(w, q.x, q.y)) && !this.crates.some((c) => Math.hypot(c.x - q.x, c.y - q.y) < 0.6));
    if (!s) return;
    const c = { id: this.crateId++, x: s.x, y: s.y, t1: t + FPS.crateLife, set };
    this.crates.push(c);
    this.push({ type: 'crate', id: c.id, x: c.x, y: c.y, drop: true });
  }

  addFire(x, y, src, t, life = FPS.fire.life, r = FPS.fire.r) {
    const f = { id: this.fireId++, x, y, r, t1: t + life, by: src.by ?? -1, npc: src.npc ?? -1, next: t + 250 };
    this.fires.push(f);
    this.push({ type: 'fire', id: f.id, x, y, r, t1: f.t1 });
  }

  // Le feu brûle ceux qui y restent, et gagne le foin et les barils tout proches.
  fireTick(t) {
    this.fires = this.fires.filter((f) => t < f.t1);
    const dmgM = this.mods(t).dmgMult;
    for (const f of this.fires) {
      if (t < f.next) continue;
      f.next = t + FPS.fire.every;
      const src = { by: f.by >= 0 ? f.by : undefined, npc: f.npc >= 0 ? f.npc : undefined, w: 'fire', fx: f.x, fy: f.y };
      this.p.forEach((q, j) => {
        if (q.alive && Math.hypot(q.x - f.x, q.y - f.y) < f.r + FPS.radius) this.damage(j, FPS.fire.dmg * dmgM * (j === f.by ? 0.5 : 1), src);
      });
      for (const n of this.npcs) if (n.alive && Math.hypot(n.x - f.x, n.y - f.y) < f.r + 0.3) this.npcDamage(n, FPS.fire.dmg * 1.5 * dmgM, f.by, 'fire', t);
      for (const pr of this.world.props) {
        if ((pr.st && pr.st !== 'ok') || pr.armed) continue;
        const d = Math.hypot(pr.x - f.x, pr.y - f.y);
        if (pr.kind === 'hay' && d < f.r + 0.8) this.propBreak(pr, f, t);
        else if (pr.kind === 'tnt' && d < f.r + 0.45) this.arm(pr, f, t, 700); // la mèche grésille un instant
      }
    }
  }

  // Le décor détruit revient (personne dessus), le foin qui a brûlé disparaît.
  propTick(t) {
    for (const pr of this.world.props) {
      if (!pr.st || pr.st === 'ok') continue;
      if (pr.st === 'burn') { if (t >= pr.burnOut) this.setProp(pr, 'gone', t); continue; }
      if (t < pr.back) continue;
      const o = pr.k != null ? this.world.deco[pr.k] : null;
      const room = pr.i != null ? 0.75 : (o?.solid || 0) + 0.35;
      const busy = [...this.p.filter((q) => q.alive), ...this.npcs.filter((n) => n.alive), ...this.horses.filter((h) => !h.deadAt)]
        .some((q) => Math.hypot(q.x - pr.x, q.y - pr.y) < room + 0.25);
      if (busy) pr.back = t + 2000;
      else this.setProp(pr, 'ok', t);
    }
  }

  // E : le canon (vers où regarde le servant, à la hausse choisie : a.d cases) ou le comptoir
  use(i, a, t) {
    const p = this.p[i];
    const u = this.world.uses.find((q) => q.key === a.key);
    if (!u || p.m || Math.hypot(u.x - p.x, u.y - p.y) > 2) return;
    if (u.kind === 'cannon') {
      if (t < (u.readyAt || 0) || this.mods(t).melee || !Number.isFinite(a.a)) return;
      u.readyAt = t + FPS.cannon.every;
      const d = cannonReach(this.world, u.x, u.y, a.a, Number.isFinite(a.d) ? a.d : FPS.cannon.range);
      const x1 = u.x + Math.cos(a.a) * d, y1 = u.y + Math.sin(a.a) * d;
      this.push({ type: 'cannon', key: u.key, by: i, ready: u.readyAt });
      this.addDyn({ by: i, x0: u.x, y0: u.y, x1, y1, at: t, ball: true, fuse: 180 + d * 35 });
    } else if (u.kind === 'bar') {
      if (t < (p.drinkAt || 0)) return;
      p.drinkAt = t + FPS.bar.every;
      p.hp = Math.min(FPS.hp, p.hp + FPS.bar.hp);
      this.push({ type: 'drink', who: i, hp: p.hp, next: p.drinkAt });
    }
  }

  // ---------------------------------------------------------- bandits
  npcPub(n) { return { id: n.id, kind: n.kind, look: n.look, x: n.x, y: n.y, a: n.a, hp: n.hp }; }

  spawnNpc(t, kind = null, at = null) {
    const mods = this.mods(t);
    const kinds = mods.npcKinds || ['bandit', 'bandit', 'bandit', 'rifleman', 'rifleman', 'brute', 'dynamiter'];
    kind ||= pick(kinds);
    const humans = this.p.filter((p) => p.alive);
    const spots = this.world.npcSpots.filter((s) => humans.every((p) => Math.hypot(p.x - s.x, p.y - s.y) > 7));
    const s = at || pick(spots.length ? spots : this.world.npcSpots);
    if (!s) return null;
    const k = NPCS[kind];
    const n = {
      id: this.npcId++, kind, look: Math.floor(Math.random() * 6), x: s.x, y: s.y, a: Math.random() * 6.28,
      hp: k.hp, alive: true, st: 1, target: null, aimAt: 0, nextShot: t + rnd(800, 1600), goal: null, think: 0, hitAt: -1e9, bornAt: t,
    };
    this.npcs.push(n);
    this.push({ type: 'npc', n: this.npcPub(n) });
    return n;
  }

  npcDamage(n, dmg, by, w, t) {
    if (!n.alive) return;
    n.hp -= dmg;
    n.hitAt = t;
    // il se retourne vers celui qui l'a touché
    if (by >= 0 && this.p[by]?.alive) n.target = { p: by };
    if (n.hp > 0) {
      this.push({ type: 'nhit', id: n.id, hp: Math.max(0, Math.round(n.hp)), by });
      return;
    }
    n.alive = false;
    const k = NPCS[n.kind];
    let pts = 0;
    if (by >= 0 && this.p[by]) {
      const mods = this.mods(t);
      pts = Math.round(k.pts * mods.npcPts);
      if (n.kind === 'diablo' && n.ev && this.ledger.claim(n.ev, 'boss', by)) pts += FPS_DIABLO.pts;
      addPts(this.p[by], pts);
      this.p[by].stats.hits++;
    }
    this.push({ type: 'nkill', id: n.id, by, w, pts, x: n.x, y: n.y, kind: n.kind });
    // El Diablo lâche son pistolet (dans une caisse) ; un bandit sur six lâche une caisse en tombant
    if (n.kind === 'diablo') this.dropCrate(n.x, n.y, t, 'diablo');
    else if (Math.random() < 0.16) {
      const c = { id: this.crateId++, x: n.x, y: n.y, t1: t + FPS.crateLife };
      this.crates.push(c);
      this.push({ type: 'crate', id: c.id, x: c.x, y: c.y, drop: true });
    }
  }

  // Champ de distances (BFS) vers une case : les bandits et les bots le descendent pour rejoindre leur cible.
  flowTo(x, y, t) {
    const key = `${Math.floor(x)},${Math.floor(y)}`;
    const f = this.flow.get(key);
    if (f && t - f.t < 1500) return f.d;
    const w = this.world;
    const N = w.w * w.h;
    const d = new Int16Array(N).fill(-1);
    const s = cellAt(w, x, y);
    if (s < 0) return d;
    d[s] = 0;
    const q = [s];
    for (let h = 0; h < q.length; h++) {
      const i = q[h];
      const cx = i % w.w, cy = (i / w.w) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= w.w || ny >= w.h) continue;
        const j = ny * w.w + nx;
        if (d[j] >= 0 || !w.pass[j]) continue;
        d[j] = d[i] + 1;
        q.push(j);
      }
    }
    if (this.flow.size > 40) this.flow.clear();
    this.flow.set(key, { t, d });
    return d;
  }

  // un pas vers la cible en suivant le champ (centre de la case voisine la plus proche du but)
  stepFlow(e, d, speed, dt) {
    const w = this.world;
    const i = cellAt(w, e.x, e.y);
    if (i < 0 || d[i] < 0) return false;
    const cx = i % w.w, cy = (i / w.w) | 0;
    let best = null, bv = d[i];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      const j = (cy + dy) * w.w + cx + dx;
      if (d[j] < 0 || d[j] >= bv) continue;
      if (dx && dy && (!w.pass[cy * w.w + cx + dx] || !w.pass[(cy + dy) * w.w + cx])) continue;
      bv = d[j];
      best = [cx + dx + 0.5, cy + dy + 0.5];
    }
    if (!best) return false;
    const a = Math.atan2(best[1] - e.y, best[0] - e.x);
    const r = move(w, e.x, e.y, Math.cos(a) * speed * dt, Math.sin(a) * speed * dt, 0.26);
    e.x = r.x; e.y = r.y;
    e.a = a;
    return true;
  }

  // Cibles possibles d'un bandit : les joueurs vivants (y compris les bots)
  npcTarget(n) {
    let best = null, bd = 1e9;
    const hunted = this.hunt && this.t < this.hunt.until ? this.hunt.p : -1;
    this.p.forEach((p, j) => {
      if (!p.alive || p.left) return;
      const d = Math.hypot(p.x - n.x, p.y - n.y);
      const seen = d < 18 && los(this.world, n.x, n.y, p.x, p.y, bodyZ(p));
      const score = d - (seen ? 6 : 0) - (n.target?.p === j ? 3 : 0) - (j === hunted ? 10 : 0);
      if (score < bd) { bd = score; best = j; }
    });
    return best;
  }

  npcTick(n, t, dt) {
    const k = NPCS[n.kind];
    if (n.kind === 'diablo' && n.leaveAt && t >= n.leaveAt) {
      n.alive = false;
      this.push({ type: 'nleave', id: n.id });
      return;
    }
    if (t >= n.think) {
      n.think = t + rnd(400, 800);
      const j = this.npcTarget(n);
      n.target = j == null ? null : { p: j };
    }
    const tg = n.target && this.p[n.target.p];
    if (!tg || !tg.alive) { n.st = 0; n.target = null; return; }
    const dist = Math.hypot(tg.x - n.x, tg.y - n.y);
    const seen = dist < k.range + 4 && los(this.world, n.x, n.y, tg.x, tg.y, bodyZ(tg));
    const aimA = Math.atan2(tg.y - n.y, tg.x - n.x);
    if (n.aimAt) {
      // il vise, puis tire (ou lance son bâton)
      n.a = aimA;
      n.st = 2;
      if (t < n.aimAt) return;
      n.aimAt = 0;
      n.nextShot = t + k.every * rnd(0.8, 1.3);
      if (!seen) return;
      if (k.throws) {
        const to = dynLanding(this.world, n.x, n.y, aimA + rnd(-0.15, 0.15), clamp(dist / FPS.dyn.range, 0.3, 1));
        this.addDyn({ by: -1, npc: n.id, x0: n.x, y0: n.y, x1: to.x, y1: to.y, at: t });
        n.st = 3;
        return;
      }
      n.st = 3;
      // précision : baisse avec la distance et si la cible court ou galope
      const speed = tg.m ? 0.7 : (tg.v || 0) > 2 ? 0.85 : 1;
      const chance = k.acc * (1 - 0.55 * clamp(dist / k.range, 0, 1)) * speed;
      const hit = Math.random() < chance;
      const dmg = hit ? k.dmg * this.mods(t).dmgMult * (n.kind === 'brute' ? clamp(1.4 - dist / 8, 0.4, 1.2) : 1) : 0;
      this.push({ type: 'nshot', id: n.id, to: n.target.p, hit, x: n.x, y: n.y });
      if (hit) this.damage(n.target.p, dmg, { npc: n.id, w: n.kind, fx: n.x, fy: n.y });
      return;
    }
    if (seen && dist <= k.range && t >= n.nextShot) {
      n.aimAt = t + k.aim;
      n.st = 2;
      return;
    }
    // pris au lasso, cloué par un harpon, pied dans un piège : il se débat sur place
    if (t < (n.snareUntil || 0)) { n.st = 0; if (seen) n.a = aimA; return; }
    // déplacement : il approche jusqu'à sa distance de tir (le tireur garde ses distances)
    n.st = 1;
    const keep = k.keep || (n.kind === 'brute' ? 1.6 : 5);
    if (seen && dist < keep) {
      // pas de côté
      const side = (n.id % 2 ? 1 : -1) * (Math.floor(t / 1800) % 2 ? 1 : -1);
      const a = aimA + side * Math.PI / 2;
      const r = move(this.world, n.x, n.y, Math.cos(a) * k.speed * 0.6 * dt, Math.sin(a) * k.speed * 0.6 * dt, 0.26);
      n.x = r.x; n.y = r.y;
      n.a = aimA;
      return;
    }
    const d = this.flowTo(tg.x, tg.y, t);
    if (!this.stepFlow(n, d, k.speed, dt)) n.st = 0;
    if (seen) n.a = aimA;
  }

  // ---------------------------------------------------------- horloge de l'hôte
  tick() {
    if (this.phase !== 'playing') return [];
    const t = this.t;
    const dt = clamp((t - this.lastTick) / 1000, 0, 0.25);
    const prev = this.lastTick;
    this.lastTick = t;
    if (t >= 0 && t < this.duration) {
      const mods = this.mods(t);
      // événements qui commencent
      for (const ev of fpsStarted(this.world.events, prev, t)) this.startEvent(ev, t);
      // bandits
      const alive = this.npcs.filter((n) => n.alive && n.kind !== 'diablo').length;
      const crowd = fpsCrowd(this.p.filter((p) => !p.left).length);
      const max = FPS.npc.base + FPS.npc.per * crowd + (mods.npcMax || 0);
      if (t >= this.nextNpc && !this.dm) {
        if (alive < max) this.spawnNpc(t);
        this.nextNpc = t + rnd(...FPS.npc.every) / (mods.npcRate || 1);
      }
      for (const n of this.npcs) if (n.alive) this.npcTick(n, t, dt);
      if (this.npcs.length > 80) this.npcs = this.npcs.filter((n) => n.alive);
      // caisses (à 5 ou 6 joueurs, elles tombent un peu plus souvent : il y a plus de monde pour se les disputer)
      if (t >= this.nextCrate) {
        this.spawnCrate(t);
        this.nextCrate = t + rnd(...FPS.crateEvery) / ((mods.crateRate || 1) * Math.max(1, crowd / 4));
      }
      for (const c of [...this.crates]) if (t >= c.t1) {
        this.crates.splice(this.crates.indexOf(c), 1);
        this.push({ type: 'crateGone', id: c.id });
      }
      // dynamite
      for (const d of [...this.dyns]) if (t >= d.boomAt) {
        this.dyns.splice(this.dyns.indexOf(d), 1);
        this.explode(d, t);
      }
      // décor interactif : réactions en chaîne, feu, décor qui revient
      if (this.later.length) {
        const due = this.later.filter((l) => t >= l.at);
        this.later = this.later.filter((l) => t < l.at);
        for (const l of due) l.fn(t);
      }
      this.fireTick(t);
      this.trapTick(t);
      this.tetherTick(t, dt);
      this.propTick(t);
      // chevaux abattus : un autre revient à l'écurie
      for (const h of this.horses) if (h.deadAt && t - h.deadAt > FPS.horse.back) {
        const w = this.world.horses[h.id];
        Object.assign(h, { x: w.hx, y: w.hy, a: w.ha, hp: FPS.horse.hp, deadAt: 0, rider: -1 });
        this.push({ type: 'horseBack', id: h.id, x: h.x, y: h.y, a: h.a });
      }
      // sacs d'or des événements : ils disparaissent à la fin
      for (const g of this.gold) if (!g.taken && t >= g.t1) { g.taken = true; this.push({ type: 'goldGone', id: g.id }); }
      // le train : ceux qui sont sur la voie
      if (mods.train) this.p.forEach((p, j) => { if (p.alive && onRails(this.world, p.x, p.y)) this.damage(j, 999, { train: true }); });
      // bots
      this.p.forEach((p, i) => { if (p.ai && !p.left) this.botThink(i, t, dt); });
      // gourde : les PV reviennent doucement à l'abri
      if (Math.floor(t / 1000) !== Math.floor(prev / 1000)) {
        this.p.forEach((p, j) => {
          if (p.alive && p.lo?.e === 'flask' && t - p.hurtAt > FPS.regen.wait && p.hp < FPS.hp) {
            p.hp = Math.min(FPS.hp, p.hp + FPS.regen.per);
            this.push({ type: 'regen', who: j, hp: p.hp });
          }
        });
      }
      // positions des bandits et des bots, pour tout le monde, en un seul message tous les deux ticks (5 par seconde) :
      // en multijoueur, chaque message passe par Supabase Realtime, dont le débit est limité
      if ((this.liveTick = (this.liveTick || 0) + 1) % 2 === 0) {
        const live = this.npcs.filter((n) => n.alive).map((n) => [n.id, Math.round(n.x * 100), Math.round(n.y * 100), Math.round(n.a * 100), n.st]);
        const bots = {};
        this.p.forEach((p, i) => { if (p.ai && p.alive && !p.left) bots[i] = liveOf(p); });
        this.liveOut.push({ key: 'fps:npc', d: { n: live, b: bots } });
      }
    }
    if (this.phase === 'playing' && t >= this.duration + 400) this.finish();
    return this.flush();
  }

  // Début d'un événement (fpsevents.js) : effets ponctuels, puis annonce.
  startEvent(ev, t) {
    const m = ev.mods || {};
    if (m.heal) this.p.forEach((p) => { if (p.alive) p.hp = Math.min(FPS.hp, p.hp + m.heal); });
    if (m.gold) {
      fpsSpots(ev, this.world.crateSpots, m.gold).forEach((s, k) => {
        const g = { id: this.gold.length, ev, n: k, x: s.x, y: s.y, t1: ev.t1 };
        this.gold.push(g);
      });
    }
    if (m.swap) {
      const spots = fpsSpots(ev, this.world.spawns, this.p.length);
      this.p.forEach((p, j) => {
        if (!p.alive || !spots[j]) return;
        if (p.m) this.dismount(j, true);
        p.x = spots[j].x; p.y = spots[j].y;
      });
    }
    if (m.boss === 'diablo') {
      const s = fpsSpot(ev, this.world.npcSpots);
      const n = this.spawnNpc(t, 'diablo', s);
      if (n) { n.ev = ev; n.leaveAt = ev.t1; }
    }
    this.push({
      type: 'fpsEvent', k: ev.k, id: ev.id,
      hp: m.heal ? this.p.map((p) => p.hp) : undefined,
      gold: m.gold ? this.gold.filter((g) => g.ev === ev).map((g) => ({ id: g.id, x: g.x, y: g.y })) : undefined,
      swap: m.swap ? this.p.map((p) => ({ x: p.x, y: p.y })) : undefined,
    });
  }

  finish() {
    if (this.phase !== 'playing') return;
    this.phase = 'over';
    const order = this.p.map((_, i) => i).sort((a, b) => (this.p[a].left - this.p[b].left) || (this.p[b].score - this.p[a].score) || (this.p[b].k - this.p[a].k));
    this.ranking = order;
    this.winner = order[0];
    const tie = order.length > 1 && this.p[order[1]].score === this.p[order[0]].score && !this.p[order[1]].left;
    this.push({ type: 'matchEnd', winner: this.winner, ranking: order, tie });
  }

  leave(i) {
    if (this.phase !== 'playing' || !this.p[i]) return [];
    const p = this.p[i];
    if (p.m) this.dismount(i, true);
    p.left = true;
    p.alive = false;
    this.push({ type: 'left', who: i });
    return this.flush();
  }

  forfeit(i) {
    if (this.phase !== 'playing' || !this.p[i]) return [];
    this.p[i].left = true;
    this.finish();
    return this.flush();
  }

  // ------------------------------------------------------------ bots (mode solo)
  // Un bot choisit un équipement au hasard, va chercher les caisses proches, et tire sur ce qu'il voit :
  // bandits et joueurs. Ses tirs sont tirés au sort (précision selon la distance et l'arme).
  newBot(i) {
    return { next: 0, goal: null, think: 0, w: null, lastShot: 0, strafe: i % 2 ? 1 : -1, react: rnd(250, 500), seenAt: 0, seenId: null, dyn: 0 };
  }

  // un baril de poudre du décor près de la cible, que le bot voit, à portée, et assez loin de lui
  kegNear(p, tgt, W8) {
    return this.world.props.find((pr) => {
      if (pr.kind !== 'tnt' || pr.k == null || (pr.st && pr.st !== 'ok') || pr.armed) return false;
      const d = Math.hypot(pr.x - p.x, pr.y - p.y);
      return Math.hypot(pr.x - tgt.x, pr.y - tgt.y) < 1.8 && d > 4.5 && d < W8.range && los(this.world, p.x, p.y, pr.x, pr.y, 0.3);
    }) || null;
  }

  botThink(i, t, dt) {
    const p = this.p[i];
    const b = p.ai;
    if (!p.alive) {
      if (t >= 0 && t - p.deadAt > FPS.respawn + rnd(200, 1500)) {
        const lo = { m: pick(MELEE), p: pick(PISTOLS), l: pick(LONGS), e: pick(EQUIPS) };
        this.spawn(i, lo, t);
        b.w = p.lo?.l;
        b.dyn = p.lo?.e === 'dynamite' ? EQUIP.dynamite.dyn : 0;
        b.mol = p.lo?.e === 'molotov' ? EQUIP.molotov.mol : 0;
        b.traps = p.lo?.e === 'traps' ? EQUIP.traps.traps : 0;
        b.temp = null;
      }
      return;
    }
    const mods = this.mods(t);
    const w = this.world;
    // le train siffle : on quitte la voie (vers le quai ou vers le nord, au plus près)
    if ((mods.warn === 'train' || mods.train) && onRails(w, p.x, p.y)) {
      const safeY = p.y < 4 ? 1.6 : 5.6;
      const r = move(w, p.x, p.y, 0, Math.sign(safeY - p.y) * FPS.speed * FPS.sprint * dt);
      p.x = r.x; p.y = r.y;
      p.a = safeY > p.y ? Math.PI / 2 : -Math.PI / 2;
      b.goal = null;
      return;
    }
    // cible : le plus proche en vue (bandit ou joueur)
    if (t >= b.think) {
      b.think = t + rnd(300, 600);
      let best = null, bd = 1e9;
      for (const n of this.npcs) {
        if (!n.alive) continue;
        const d = Math.hypot(n.x - p.x, n.y - p.y);
        if (d < 20 && d < bd && los(w, p.x, p.y, n.x, n.y)) { bd = d; best = { n: n.id }; }
      }
      this.p.forEach((q, j) => {
        if (j === i || !q.alive) return;
        const d = Math.hypot(q.x - p.x, q.y - p.y) + 1.5; // les bandits d'abord, à distance égale
        if (d < 20 && d < bd && los(w, p.x, p.y, q.x, q.y, bodyZ(q))) { bd = d; best = { p: j }; }
      });
      if (best && (best.n !== b.seenId?.n || best.p !== b.seenId?.p)) b.seenAt = t;
      b.seenId = best;
      b.tg = best;
      // but de déplacement : une caisse proche, l'or, sinon un point au hasard
      const crate = this.crates.find((c) => Math.hypot(c.x - p.x, c.y - p.y) < 12);
      const gold = this.gold.find((g) => !g.taken && Math.hypot(g.x - p.x, g.y - p.y) < 14);
      // de temps en temps, un canon prêt pas trop loin : le bot va s'y poster (sur une case libre à côté de la pièce)
      const gun = !best && !gold && !b.camp && Math.random() < 0.15 && w.uses.find((u) => u.kind === 'cannon' && t >= (u.readyAt || 0) && Math.hypot(u.x - p.x, u.y - p.y) < 10);
      const post = gun && [[-1, 0], [1, 0], [0, -1], [0, 1]].map(([dx, dy]) => ({ x: Math.floor(gun.x) + dx + 0.5, y: Math.floor(gun.y) + dy + 0.5 }))
        .find((c) => w.pass[cellAt(w, c.x, c.y)]);
      if (b.camp && (t >= b.camp.until || gold)) b.camp = null;
      if (gold) b.goal = { x: gold.x, y: gold.y, gold: gold.id };
      else if (b.camp) b.goal = null; // au canon : on y reste un moment, à guetter
      else if (post) b.goal = { ...post, gun: gun.key };
      else if (crate) b.goal = { x: crate.x, y: crate.y, crate: crate.id };
      else if (!b.goal || Math.hypot(b.goal.x - p.x, b.goal.y - p.y) < 1.2 || Math.random() < 0.02) {
        // vers l'adversaire le plus proche de temps en temps, sinon au hasard
        const foes = this.p.filter((q, j) => j !== i && q.alive);
        b.goal = foes.length && Math.random() < (this.dm ? 0.85 : 0.4) ? (({ x, y }) => ({ x, y }))(pick(foes)) : pick(w.crateSpots);
      }
    }
    const tgt = b.tg?.n != null ? this.npcs.find((n) => n.id === b.tg.n && n.alive) : b.tg?.p != null ? this.p[b.tg.p] : null;
    const temp = b.temp && t < b.temp.until && b.temp.ammo > 0 ? WEAPONS[b.temp.id] : null;
    const wid = mods.melee ? p.lo.m : temp ? b.temp.id : b.w || p.lo.l;
    const W8 = WEAPONS[wid];
    p.w = wid;
    // entravé (lasso, harpon, piège) : il ne bouge plus, mais tire encore
    let speed = t < (p.snareUntil || 0) ? 0 : FPS.speed * (p.lo.e === 'spurs' ? 1.15 : 1) * (mods.speed || 1) * (W8.slow || 1);
    // pièges : posés en chemin, de temps en temps, loin de la cible
    if (b.traps > 0 && !tgt && !p.m && Math.random() < dt * 0.25) { b.traps--; this.setTrap(i, { x: p.x, y: p.y }, t); }
    if (tgt && tgt.alive !== false) {
      const dist = Math.hypot(tgt.x - p.x, tgt.y - p.y);
      const aimA = Math.atan2(tgt.y - p.y, tgt.x - p.x);
      p.a = aimA;
      // pas de côté pendant le combat, et on s'approche si l'arme est courte (le lasso se lance de loin)
      const want = W8.melee ? (W8.range > 2 ? W8.range * 0.7 : 0.9) : Math.min(W8.range * 0.7, 9);
      let mx = 0, my = 0;
      if (dist > want) { mx = Math.cos(aimA); my = Math.sin(aimA); } else if (dist < want * 0.5) { mx = -Math.cos(aimA) * 0.6; my = -Math.sin(aimA) * 0.6; }
      const side = aimA + (b.strafe * Math.PI) / 2 * (Math.floor(t / 1300 + i) % 2 ? 1 : -1);
      mx += Math.cos(side) * 0.6; my += Math.sin(side) * 0.6;
      if (b.camp && dist > 4) mx = my = 0; // au canon : on ne quitte pas la pièce (sauf si on vient au contact)
      const r = move(w, p.x, p.y, mx * speed * 0.75 * dt, my * speed * 0.75 * dt);
      p.x = r.x; p.y = r.y;
      // un canon prêt à portée de main et la cible assez loin : le bot le sert (hausse et pointage approximatifs)
      const gun = !mods.melee && t - b.seenAt > b.react && w.uses.find((u) => u.kind === 'cannon' && t >= (u.readyAt || 0) && Math.hypot(u.x - p.x, u.y - p.y) < 1.6);
      const gd = gun ? Math.hypot(tgt.x - gun.x, tgt.y - gun.y) : 0;
      if (gun && gd > FPS.cannon.near + 1.5 && gd < FPS.cannon.range && Math.random() < 0.4) {
        this.use(i, { key: gun.key, a: Math.atan2(tgt.y - gun.y, tgt.x - gun.x) + rnd(-0.05, 0.05), d: gd + rnd(-1.2, 1.2) }, t);
        b.lastShot = t;
        return;
      }
      // tir, après un temps de réaction
      if (t - b.seenAt > b.react && t - b.lastShot >= W8.rate * rnd(1.05, 1.6)) {
        const throwing = b.dyn > 0 ? 'dyn' : b.mol > 0 ? 'mol' : null;
        if (throwing && dist > 4 && dist < FPS.dyn.range && Math.random() < 0.08) {
          b[throwing]--;
          this.throwDyn(i, { x: p.x, y: p.y, a: aimA + rnd(-0.1, 0.1), pow: dist / FPS.dyn.range, item: throwing === 'mol' ? 'molotov' : undefined }, t);
          b.lastShot = t;
        } else if (W8.lob) {
          // mortier : l'obus en cloche vers la cible (portée approximative)
          if (dist < FPS.mortar.near + 0.5) return;
          b.lastShot = t;
          p.f = (p.f || 0) + 1;
          if (temp) b.temp.ammo--;
          this.throwDyn(i, { x: p.x, y: p.y, a: aimA + rnd(-0.06, 0.06), d: dist + rnd(-1.5, 1.5), item: 'mortar' }, t);
        } else if (!W8.melee || dist < W8.range) {
          b.lastShot = t;
          p.f = (p.f || 0) + 1;
          if (temp) b.temp.ammo -= W8.dual ? 2 : 1;
          // canardière : le recul repousse le bot
          if (W8.kick) { const r = move(w, p.x, p.y, -Math.cos(aimA) * W8.kick, -Math.sin(aimA) * W8.kick); p.x = r.x; p.y = r.y; }
          // un baril de poudre tout près de la cible : le bot tire dedans
          const keg = !W8.melee && Math.random() < 0.6 ? this.kegNear(p, tgt, W8) : null;
          if (keg) { this.propHit(keg, PROPS.tnt.hp, { by: i }, t); return; }
          const fall = dist > W8.range ? 0.5 : 1;
          const acc = W8.melee ? 0.8 : clamp(0.75 - dist * 0.025 - (W8.spread || 0) * 1.5, 0.25, 0.8);
          let dmg = 0;
          for (let k = 0; k < (W8.pellets || 1) * (W8.dual ? 2 : 1); k++) if (Math.random() < acc) dmg += W8.dmg * fall;
          if (dmg > 0) {
            dmg *= mods.dmgMult;
            if (b.tg.n != null) { this.npcDamage(tgt, dmg, i, wid, t); this.onHit(i, { n: tgt }, wid, dmg, t); }
            else if (t - tgt.spawnedAt >= 1500) { this.damage(b.tg.p, dmg, { by: i, w: wid }); this.onHit(i, { p: b.tg.p }, wid, dmg, t); }
          }
        }
      }
    } else if (b.camp) {
      p.a = (p.a + dt * 0.9) % (Math.PI * 2); // posté au canon : on guette alentour
    } else if (b.goal) {
      if (b.goal.gun && Math.hypot(b.goal.x - p.x, b.goal.y - p.y) < 0.7) { b.camp = { until: t + rnd(7000, 14000) }; b.goal = null; return; }
      const d = this.flowTo(b.goal.x, b.goal.y, t);
      if (!this.stepFlow(p, d, speed, dt)) b.goal = null;
      if (b.goal?.crate != null && Math.hypot(b.goal.x - p.x, b.goal.y - p.y) < 0.8) {
        const id = b.goal.crate;
        const before = this.events.length;
        this.pickCrate(i, id, t);
        const ev = this.events[before];
        if (ev?.type === 'picked') {
          const L = LOOT[ev.loot];
          if (L.gun) b.temp = { id: L.gun, until: t + WEAPONS[L.gun].ms, ammo: WEAPONS[L.gun].mag };
          if (L.dyn) b.dyn += L.dyn;
        }
        b.goal = null;
      }
      if (b.goal?.gold != null && Math.hypot(b.goal.x - p.x, b.goal.y - p.y) < 0.8) { this.pickGold(i, b.goal.gold); b.goal = null; }
    }
  }
}
