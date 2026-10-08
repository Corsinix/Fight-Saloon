// « La mêlée » : jeu de combat en vue de dessus façon arène, un seul jeu en cinq modes (chacun pour soi, roi de la colline,
// chasse à la prime, ruée vers les gemmes, au meilleur des 3), choisis par l'hôte comme une variante (ou tirés au hasard). Ce fichier contient les règles partagées par l'arbitre
// (brawlgame.js, chez l'hôte) et la scène (brawl.js, chez chaque joueur) : kits, objets, modes, carte, déplacements,
// projectiles et visibilité dans les buissons.
// Coordonnées en cases (1 case = 16 px à l'écran), x vers la droite, y vers le bas, angles en radians (0 = +x).
// Chaque joueur simule ses déplacements et ses propres tirs, et annonce ce qu'il touche ; l'hôte vérifie,
// applique les dégâts, fait vivre les bots, les tourelles, les gemmes, la tempête…
import { rng } from './worlds.js';
import { BRAWL_MAPS, MAP_SYM, expandMap, mapList, findMap, mapName, BRAWL_ENVS } from './brawlmaps/index.js';

export { mapList, findMap, mapName, BRAWL_ENVS };

export const BRAWL_KINDS = ['survie', 'colline', 'prime', 'gemmes', 'manches'];
// La variante de l'hôte : un mode (« gemmes »), ou un mode et sa carte (« gemmes:desert-veine », pour les essais) ; sinon au hasard
export function modeOf(variant, rand = Math.random) {
  const [mode, map] = String(variant || '').split(':');
  return BRAWL_KINDS.includes(mode) ? { mode, map: map || null } : { mode: BRAWL_KINDS[Math.floor(rand() * BRAWL_KINDS.length)], map: null };
}

// Constantes générales (durées en ms, distances en cases)
export const BR = {
  body: 0.33, // rayon du corps
  reveal: 2.6, // un ennemi caché dans un buisson se voit à cette distance
  lynx: 4.6, // … ou à celle-ci pour le tireur d'élite (talent)
  ambush: 1.25, // … la lame (talent) reste cachée jusqu'à cette distance
  atkShow: 1100, // après une attaque, on reste visible même dans un buisson
  regenWait: 3000, regenRate: 0.13, // récupération : 13 % des PV par seconde, 3 s après le dernier coup donné ou reçu
  spawnShield: 1800,
  pick: 15000, // choix du kit (pendant le compte à rebours, après la cinématique)
  uses: 3, gadgetCd: 2500, // chaque objet sert 3 fois, 2,5 s entre deux objets
  power: { hp: 350, dmg: 0.1, max: 8 }, // fioles de poudre (chacun pour soi) : PV max et dégâts en plus, par fiole
  chestHp: 2600,
  turret: 12000,
};

// Modes : respawn (ms) ou false, ce qui fait gagner, durée (ms) et unité du score
export const BRAWL_MODES = {
  survie: { name: 'CHACUN POUR SOI', respawn: false, storm: true, chests: true, duration: 180000, unit: 'élim.', goal: 'Sois le dernier debout. La tempête se resserre !' },
  colline: { name: 'ROI DE LA COLLINE', respawn: 3000, hill: 2.5, target: 60, duration: 150000, unit: 's', goal: 'Reste seul sur la colline : 1 pt par seconde, 60 pour gagner' },
  prime: { name: 'CHASSE À LA PRIME', respawn: 3000, bounty: true, duration: 150000, unit: 'étoiles', goal: 'Abats les autres : chaque victime rapporte sa prime en étoiles' },
  gemmes: { name: 'RUÉE VERS LES GEMMES', team: true, respawn: 4000, gems: true, target: 10, hold: 15000, every: 7000, duration: 180000, unit: 'gemmes', goal: 'Garde 10 gemmes pendant 15 s avec ton équipe' },
  manches: { name: 'AU MEILLEUR DES 3', team: true, respawn: false, rounds: 2, roundMs: 75000, brk: 4500, duration: 420000, unit: 'élim.', goal: 'Élimine l\'équipe adverse : 2 manches pour gagner' },
};
export const TEAM_COLORS = ['#f0705a', '#7ab0f0'];
export const TEAM_LABELS = ['ROUGES', 'BLEUS'];

// ------------------------------------------------------------ kits
// atk : attaque de base, sup : super-attaque (chargée par les dégâts infligés : superDmg points pour la remplir).
// t : forme du coup : shot (balles), ring (balles tout autour), lob (en cloche, par-dessus les murs), melee (arc
// au corps à corps), dash (charge), leap (bond), slam (onde autour de soi), zone (pluie qui frappe plusieurs fois),
// turret (tourelle posée). range en cases, speed en cases/s, dmg par balle (ou par impact).
// ammo : charges, reload : ms pour recharger une charge, cd : ms au moins entre deux attaques.
// pref : distance que les bots cherchent à garder.
export const KITS = {
  dynamite: {
    name: 'LE DYNAMITEUR', weapon: 'DYNAMITE', role: 'Artilleur', col: '#e05a38',
    hp: 2800, speed: 2.85, ammo: 3, reload: 2000, cd: 450, superDmg: 3600, pref: 5.5,
    atk: { t: 'lob', range: 7, rad: 1.25, dmg: 1050, fly: 620, text: 'Bâton lancé en cloche, par-dessus les murs' },
    sup: { t: 'lob', name: 'CAISSE DE TNT', range: 7.5, rad: 2.3, dmg: 2000, fly: 780, breaks: true, big: true, text: 'Énorme explosion qui pulvérise caisses et tonneaux' },
    talent: { name: 'POUDRE NOIRE', text: 'Explosions 20 % plus larges' },
  },
  colts: {
    name: 'LE PISTOLERO', weapon: 'DOUBLE COLT', role: 'Tireur', col: '#f8d070',
    hp: 3200, speed: 3.1, ammo: 3, reload: 1450, cd: 300, superDmg: 3200, pref: 5.5,
    atk: { t: 'shot', n: 2, gap: 100, side: 0.18, speed: 18, range: 8, r: 0.15, dmg: 450, text: 'Deux balles, une par revolver' },
    sup: { t: 'ring', name: 'TOURBILLON', n: 12, waves: 2, gap: 200, speed: 15, range: 6.5, r: 0.15, dmg: 380, text: 'Vide ses barillets tout autour de lui' },
    talent: { name: 'GÂCHETTE FACILE', text: 'Recharge 25 % plus vite' },
  },
  pompe: {
    name: 'LE BISON', weapon: 'FUSIL À POMPE', role: 'Costaud', col: '#c8a070',
    hp: 4800, speed: 3.0, ammo: 3, reload: 1750, cd: 500, superDmg: 5000, pref: 2.6,
    atk: { t: 'shot', n: 5, fan: 0.5, speed: 19, range: 4.6, r: 0.16, dmg: 340, text: 'Cinq plombs en éventail : dévastateur de près' },
    sup: { t: 'dash', name: 'CHARGE DU TAUREAU', range: 6, speed: 12, dmg: 1300, breaks: true, knock: 2.2, text: 'Fonce, renverse et défonce les caisses' },
    talent: { name: 'CUIR TANNÉ', text: '-30 % de dégâts sous 40 % de PV' },
  },
  sniper: {
    name: 'L\'ŒIL DE FAUCON', weapon: 'FUSIL SHARPS', role: 'Tireur d\'élite', col: '#a0c8e8',
    hp: 2300, speed: 2.9, ammo: 3, reload: 2500, cd: 900, superDmg: 4200, pref: 8,
    atk: { t: 'shot', n: 1, speed: 23, range: 10.5, r: 0.12, dmg: 980, far: 0.4, text: 'Une balle lourde : +40 % de dégâts au loin' },
    sup: { t: 'shot', name: 'BALLE PERFORANTE', n: 1, speed: 34, range: 13, r: 0.2, dmg: 2300, pierce: true, walls: true, breaks: true, text: 'Traverse les murs et tous ceux qu\'elle croise' },
    talent: { name: 'ŒIL DE LYNX', text: 'Voit dans les buissons jusqu\'à 4,5 cases' },
  },
  couteau: {
    name: 'LA LAME', weapon: 'COUTEAU', role: 'Assassin', col: '#d0d8e0',
    hp: 3200, speed: 3.8, ammo: 3, reload: 1000, cd: 300, superDmg: 3000, pref: 0.9,
    atk: { t: 'melee', range: 1.65, arc: 2.0, dmg: 960, text: 'Coup de lame rapide, au corps à corps' },
    sup: { t: 'leap', name: 'BOND DU PUMA', range: 6, rad: 1.5, dmg: 1500, fly: 420, text: 'Bondit par-dessus les murs et retombe sur sa proie' },
    talent: { name: 'EMBUSCADE', text: 'Invisible dans les buissons, même de près' },
  },
  arc: {
    name: 'LE CHASSEUR', weapon: 'ARC', role: 'Pisteur', col: '#9ac060',
    hp: 2900, speed: 3.1, ammo: 3, reload: 1600, cd: 420, superDmg: 4000, pref: 6.5,
    atk: { t: 'shot', n: 1, speed: 15, range: 8.5, r: 0.15, dmg: 1000, text: 'Une flèche à longue portée' },
    sup: { t: 'zone', name: 'PLUIE DE FLÈCHES', range: 8, rad: 2.1, dmg: 380, ticks: 5, every: 450, fly: 500, text: 'Une volée de flèches s\'abat sur une zone' },
    talent: { name: 'PISTEUR', text: 'Les ennemis touchés restent visibles 4 s' },
  },
  forgeron: {
    name: 'LE FORGERON', weapon: 'MARTEAU', role: 'Colosse', col: '#b0a090',
    hp: 5400, speed: 2.9, ammo: 3, reload: 1450, cd: 550, superDmg: 4400, pref: 1.1,
    atk: { t: 'melee', range: 1.8, arc: 2.2, dmg: 1100, text: 'Grand coup de marteau, au corps à corps' },
    sup: { t: 'slam', name: 'COUP DE TONNERRE', rad: 2.6, dmg: 1400, stun: 1300, breaks: true, text: 'Frappe le sol : sonne et repousse tout autour' },
    talent: { name: 'CUIR ÉPAIS', text: 'Récupère ses PV 50 % plus vite, et plus tôt' },
  },
  docteur: {
    name: 'LE DOCTEUR', weapon: 'ÉLIXIRS', role: 'Soigneur', col: '#c890f0',
    hp: 3200, speed: 3.0, ammo: 3, reload: 1700, cd: 450, superDmg: 3000, pref: 5,
    atk: { t: 'lob', range: 6.5, rad: 1.35, dmg: 820, heal: 600, fly: 500, text: 'Fiole en cloche : blesse l\'ennemi, soigne les alliés' },
    sup: { t: 'zone', name: 'GRAND REMÈDE', range: 6.5, rad: 2.4, dmg: 320, heal: 450, ticks: 5, every: 550, fly: 520, text: 'Nuage qui soigne les alliés et ronge les ennemis' },
    talent: { name: 'AUTOMÉDICATION', text: 'Se soigne d\'un quart des dégâts infligés' },
  },
  gatling: {
    name: 'LA GATLING', weapon: 'GATLING', role: 'Arroseur', col: '#90a8b8',
    hp: 3700, speed: 2.8, ammo: 3, reload: 1700, cd: 650, superDmg: 4500, pref: 5,
    atk: { t: 'shot', n: 7, gap: 60, jitter: 0.13, speed: 18, range: 7.2, r: 0.13, dmg: 210, text: 'Rafale de sept balles' },
    sup: { t: 'turret', name: 'TOURELLE', range: 3, hp: 3200, life: 12000, every: 420, srange: 7, dmg: 240, speed: 16, text: 'Pose une Gatling qui tire toute seule 12 s' },
    talent: { name: 'TRÉPIED', text: '+20 % de dégâts quand il tire immobile' },
  },
};
export const KIT_IDS = Object.keys(KITS);

// ------------------------------------------------------------ objets (2 au choix, 3 utilisations chacun)
export const GADGETS = {
  whisky: { name: 'WHISKY', text: 'Soigne 1500 PV d\'un coup' },
  etoile: { name: 'ÉTOILE DU SHÉRIF', text: 'Bouclier : -70 % de dégâts pendant 3 s' },
  eperons: { name: 'ÉPERONS', text: 'Vitesse +60 % pendant 3 s' },
  longuevue: { name: 'LONGUE-VUE', text: 'Voit les ennemis cachés, et loin dans le noir, 6 s' },
  piege: { name: 'PIÈGE À LOUP', text: 'Caché à tes pieds : bloque 1,5 s et blesse (700)' },
  fumigene: { name: 'FUMIGÈNE', text: 'Invisible 3 s, sauf tout près' },
  cartouches: { name: 'CARTOUCHIÈRE', text: 'Recharge aussitôt toutes tes munitions' },
  sacs: { name: 'SACS DE SABLE', text: 'Un muret de 3 sacs devant toi, 8 s' },
};
export const GADGET_IDS = Object.keys(GADGETS);
export const GAD = {
  heal: 1500, shield: 3000, shieldTake: 0.3, speed: 3000, speedMul: 1.6, scope: 6000,
  trap: { dmg: 700, root: 1500, r: 0.55, life: 60000 }, smoke: 3000, sand: 8000,
};

export const DEFAULT_PICK = { kit: 'colts', g: ['whisky', 'eperons'] };
export function cleanPick(p) {
  const kit = KITS[p?.kit] ? p.kit : DEFAULT_PICK.kit;
  const g = (Array.isArray(p?.g) ? p.g : []).filter((x, i, a) => GADGETS[x] && a.indexOf(x) === i).slice(0, 2);
  for (const d of [...DEFAULT_PICK.g, ...GADGET_IDS]) if (g.length < 2 && !g.includes(d)) g.push(d);
  return { kit, g };
}

// Valeurs qui dépendent du talent
export const reloadOf = (kit) => KITS[kit].reload * (kit === 'colts' ? 0.75 : 1);
export const radOf = (kit, spec) => (spec.rad || 0) * (kit === 'dynamite' ? 1.2 : 1);
export const specOf = (kit, sup) => (sup ? KITS[kit].sup : KITS[kit].atk);

// Dégâts d'un coup (base, avant bouclier et talent de la cible) ; d : distance parcourue (fusil Sharps), still : immobile (Gatling)
export function dmgOf(kit, sup, { d = 0, still = false, power = 0, tick = false } = {}) {
  const sp = specOf(kit, sup);
  let dmg = sp.dmg || 0;
  if (sp.far && sp.range) dmg *= 1 + sp.far * Math.min(1, d / sp.range);
  if (kit === 'gatling' && still) dmg *= 1.2;
  if (sup && kit === 'gatling' && tick) dmg = sp.dmg; // balles de la tourelle
  return Math.round(dmg * (1 + BR.power.dmg * power));
}

// ------------------------------------------------------------ carte
export const C = { FLOOR: 0, PATH: 1, WALL: 2, CRATE: 3, BUSH: 4, WATER: 5, CHEST: 6, SAND: 7 };
const CHAR = { '.': C.FLOOR, ',': C.PATH, '#': C.WALL, x: C.CRATE, '*': C.BUSH, '~': C.WATER, S: C.FLOOR, P: C.CHEST };

// Le monde d'une partie : la carte du mode (imposée par l'hôte, ou tirée de la graine)
export function mapIdOf(kind, seed, variant) {
  const list = mapList(kind);
  if (variant && list.some((m) => m.id === variant)) return variant;
  if (!list.length) return null;
  return list[(Math.imul((seed ^ 0x2545f491) >>> 0, 0x9e3779b1) >>> 0) % list.length].id;
}

export function brawlWorld(kind, mapId) {
  const entry = findMap(kind, mapId) || mapList(kind)[0];
  const m = expandMap(kind, entry);
  const { w, h } = m;
  const cells = new Uint8Array(w * h);
  const spawns = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const ch = m.rows[y][x];
    cells[y * w + x] = CHAR[ch] ?? C.FLOOR;
    if (ch === 'S') spawns.push({ x: x + 0.5, y: y + 0.5 });
  }
  const sym = MAP_SYM[kind];
  // équipes : à gauche l'équipe 0, à droite l'équipe 1 (même ordre de haut en bas, retourné)
  const teamSpawns = sym === 'half'
    ? [spawns.filter((s) => s.x < w / 2).sort((a, b) => a.y - b.y), spawns.filter((s) => s.x > w / 2).sort((a, b) => b.y - a.y)]
    : null;
  return {
    kind, id: entry.id, env: entry.env, name: entry.name, w, h, rows: m.rows, cells, base: cells.slice(),
    spawns, teamSpawns, cx: w / 2, cy: h / 2,
  };
}

export const cellAt = (w, x, y) => {
  const cx = Math.floor(x), cy = Math.floor(y);
  return cx < 0 || cy < 0 || cx >= w.w || cy >= w.h ? -1 : cy * w.w + cx;
};
export const typeAt = (w, x, y) => { const i = cellAt(w, x, y); return i < 0 ? C.WALL : w.cells[i]; };
export const blocksMove = (c) => c === C.WALL || c === C.CRATE || c === C.WATER || c === C.CHEST || c === C.SAND;
export const blocksShot = (c) => c === C.WALL || c === C.CRATE || c === C.CHEST || c === C.SAND;
export const breakable = (c) => c === C.CRATE || c === C.CHEST || c === C.SAND;
export const inBush = (w, x, y) => typeAt(w, x, y) === C.BUSH;
export const walkable = (w, i) => i >= 0 && !blocksMove(w.cells[i]);

// Le corps (cercle de rayon r) touche-t-il une case qui bloque ?
export function overlaps(w, x, y, r = BR.body) {
  const x0 = Math.floor(x - r), x1 = Math.floor(x + r), y0 = Math.floor(y - r), y1 = Math.floor(y + r);
  for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
    if (cx < 0 || cy < 0 || cx >= w.w || cy >= w.h) { if (circleBox(x, y, r, cx, cy)) return true; continue; }
    if (blocksMove(w.cells[cy * w.w + cx]) && circleBox(x, y, r, cx, cy)) return true;
  }
  return false;
}
function circleBox(x, y, r, cx, cy) {
  const nx = Math.max(cx, Math.min(x, cx + 1)), ny = Math.max(cy, Math.min(y, cy + 1));
  return (x - nx) ** 2 + (y - ny) ** 2 < r * r - 1e-6;
}

// Déplacement avec glissement le long des murs (un axe après l'autre, par petits pas)
export function move(w, x, y, dx, dy, r = BR.body) {
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 0.2));
  const sx = dx / steps, sy = dy / steps;
  const stuck = overlaps(w, x, y, r); // coincé (sacs de sable posés dessus…) : on se dégage librement
  for (let k = 0; k < steps; k++) {
    if (sx && (stuck || !overlaps(w, x + sx, y, r))) x += sx;
    if (sy && (stuck || !overlaps(w, x, y + sy, r))) y += sy;
  }
  return { x: Math.max(r, Math.min(w.w - r, x)), y: Math.max(r, Math.min(w.h - r, y)) };
}

// Ligne de tir dégagée (rien qui arrête une balle entre les deux points)
export function clearShot(w, x0, y0, x1, y1) {
  const d = Math.hypot(x1 - x0, y1 - y0);
  const n = Math.ceil(d / 0.15);
  for (let k = 1; k < n; k++) {
    const t = k / n;
    if (blocksShot(typeAt(w, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t))) return false;
  }
  return true;
}

// Case libre la plus proche (atterrissage du bond, tourelle, retour en jeu)
export function freeSpot(w, x, y, r = BR.body) {
  if (!overlaps(w, x, y, r)) return { x, y };
  for (let rad = 0.25; rad < 6; rad += 0.25) {
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      const nx = x + Math.cos(a) * rad, ny = y + Math.sin(a) * rad;
      if (nx > r && ny > r && nx < w.w - r && ny < w.h - r && !overlaps(w, nx, ny, r)) return { x: nx, y: ny };
    }
  }
  return { x, y };
}

// Point visé ramené à la portée
export function clampAim(x, y, tx, ty, range) {
  const d = Math.hypot(tx - x, ty - y);
  if (d <= range) return { x: tx, y: ty, d };
  return { x: x + ((tx - x) / d) * range, y: y + ((ty - y) / d) * range, d: range };
}

// Fin de la charge (dash) : jusqu'au premier mur qu'on ne peut pas défoncer
export function dashEnd(w, x, y, a, range) {
  const step = 0.1;
  let d = 0;
  while (d < range) {
    const nx = x + Math.cos(a) * (d + step), ny = y + Math.sin(a) * (d + step);
    const c = typeAt(w, nx + Math.cos(a) * BR.body, ny + Math.sin(a) * BR.body);
    if (c === C.WALL || c === C.WATER) break;
    d += step;
  }
  return { x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, d };
}

// ------------------------------------------------------------ tempête (chacun pour soi) et colline
// La zone sûre se resserre de 40 s à 140 s, jusqu'à un carré de 3 cases de demi-côté autour du centre.
export const STORM = { t0: 40000, t1: 140000, min: 3, dmg0: 450, dmg1: 1100 };
export function stormRect(w, t) {
  const k = Math.max(0, Math.min(1, (t - STORM.t0) / (STORM.t1 - STORM.t0)));
  const hw = w.w / 2 + 1 - k * (w.w / 2 + 1 - STORM.min), hh = w.h / 2 + 1 - k * (w.h / 2 + 1 - STORM.min);
  return { x0: w.cx - hw, x1: w.cx + hw, y0: w.cy - hh, y1: w.cy + hh, k };
}
export const inStorm = (w, t, x, y) => {
  if (t < STORM.t0) return false;
  const r = stormRect(w, t);
  return x < r.x0 || x > r.x1 || y < r.y0 || y > r.y1;
};
export const stormDmg = (t) => Math.round(STORM.dmg0 + (STORM.dmg1 - STORM.dmg0) * Math.max(0, Math.min(1, (t - STORM.t0) / (STORM.t1 - STORM.t0))));

// ------------------------------------------------------------ visibilité
// Le joueur cible (target) est-il visible pour l'équipe de l'observateur ? viewers : membres vivants de cette équipe
// (positions + kit + longue-vue). Hors buisson et sans fumigène, on voit tout le monde.
// target : { x, y, kit, atkAt, trackUntil, smokeUntil }
export function seen(w, t, target, viewers) {
  const smoke = t < (target.smokeUntil || 0);
  const bush = inBush(w, target.x, target.y);
  if (!smoke && !bush) return true;
  if (t - (target.atkAt ?? -1e9) < BR.atkShow || t < (target.trackUntil || 0)) return true;
  for (const v of viewers) {
    if (t < (v.scopeUntil || 0)) return true;
    let r = v.kit === 'sniper' ? BR.lynx : BR.reveal;
    if (smoke || target.kit === 'couteau') r = Math.min(r, BR.ambush);
    if (Math.hypot(v.x - target.x, v.y - target.y) <= r) return true;
  }
  return false;
}

// ------------------------------------------------------------ attaques et projectiles
// Une attaque se résume à un enregistrement rec, envoyé aux autres pour qu'ils voient la même chose :
// { id, o : lanceur (index du joueur), k : kit, s : super (1/0), x, y : départ, a : angle, tx, ty : point visé
//   (cloche, zone, bond), r : graine (dispersion), tu : tourelle qui tire, st : immobile }.
// Chaque navigateur crée les mêmes projectiles avec launch() et les fait avancer avec stepShots().
// Seul le « propriétaire » du tir (le joueur qui l'a lancé, ou l'hôte pour les bots et les tourelles) compte les touches.
export function launch(rec, t0) {
  const sp = rec.tu != null ? turretSpec(rec) : specOf(rec.k, rec.s);
  const out = [];
  const base = { rec, t0, hit: new Set(), done: false };
  if (sp.t === 'shot' || sp.t === 'ring') {
    const R = rng(rec.r >>> 0);
    const waves = sp.waves || 1, n = sp.n || 1;
    for (let wv = 0; wv < waves; wv++) for (let i = 0; i < n; i++) {
      let a = rec.a;
      if (sp.t === 'ring') a += ((i + wv * 0.5) / n) * Math.PI * 2;
      else {
        if (n > 1 && sp.fan) a += (i / (n - 1) - 0.5) * sp.fan;
        if (sp.jitter) a += (R() - 0.5) * sp.jitter;
      }
      const side = sp.side ? (i % 2 ? 1 : -1) * sp.side : 0;
      const ox = rec.x + Math.cos(rec.a) * 0.3 - Math.sin(rec.a) * side, oy = rec.y + Math.sin(rec.a) * 0.3 + Math.cos(rec.a) * side;
      const at = t0 + (sp.gap ? (sp.t === 'ring' ? wv : i) * sp.gap : 0);
      out.push({
        ...base, hit: new Set(), kind: 'b', b: wv * n + i, x: ox, y: oy, x0: ox, y0: oy, a, vx: Math.cos(a) * sp.speed, vy: Math.sin(a) * sp.speed,
        left: sp.range, r: sp.r || 0.15, pierce: !!sp.pierce, walls: !!sp.walls, breaks: !!sp.breaks, at, tl: at,
      });
    }
  } else if (sp.t === 'lob' || sp.t === 'zone') {
    const fly = sp.fly || 600;
    out.push({ ...base, kind: 'bomb', b: 0, x0: rec.x, y0: rec.y, x: rec.tx, y: rec.ty, at: t0, t1: t0 + fly, rad: radOf(rec.k, sp), zone: sp.t === 'zone', breaks: !!sp.breaks, big: !!sp.big });
  }
  return out;
}

// Balles de la tourelle de la Gatling
const turretSpec = () => {
  const s = KITS.gatling.sup;
  return { t: 'shot', n: 1, speed: s.speed, range: s.srange, r: 0.13, dmg: s.dmg };
};

// Fait avancer les projectiles jusqu'à l'instant t. hooks :
//   targets(p) : cibles touchables [{ tg: 'p'|'t', id, x, y, r }] (les ennemis du tireur)
//   hit(p, target) : touche (balle) ; wall(p, i, c) : la balle heurte une case cassable (i) de type c
//   boom(p) : la cloche retombe ; zoneTick(z, k) : la zone frappe (k-ième fois) ; end(p) : le projectile disparaît
export function stepShots(list, t, w, hooks) {
  let n = 0;
  for (const p of list) {
    if (!p.done) stepOne(p, t, w, hooks);
    if (!p.done) list[n++] = p;
    else hooks.end?.(p);
  }
  list.length = n;
}

function stepOne(p, t, w, hooks) {
  if (p.kind === 'b') {
    if (t <= p.at) return;
    const speed = Math.hypot(p.vx, p.vy);
    let dt = (t - p.tl) / 1000;
    p.tl = t;
    while (dt > 0 && !p.done) {
      const h = Math.min(dt, 0.12 / speed);
      dt -= h;
      const mv = Math.min(speed * h, p.left);
      p.x += (p.vx / speed) * mv;
      p.y += (p.vy / speed) * mv;
      p.left -= mv;
      const i = cellAt(w, p.x, p.y);
      const c = i < 0 ? C.WALL : w.cells[i];
      if (i < 0) { p.done = true; break; }
      if (blocksShot(c)) {
        if (breakable(c)) hooks.wall?.(p, i, c);
        // la case a pu être cassée par wall() ; la balle perforante passe à travers tout
        if (blocksShot(w.cells[i]) && !p.walls) { p.done = true; p.wallHit = true; break; }
      }
      for (const tg of hooks.targets(p)) {
        const key = `${tg.tg}${tg.id}`;
        if (p.hit.has(key)) continue;
        if (Math.hypot(tg.x - p.x, tg.y - p.y) < tg.r + p.r) {
          p.hit.add(key);
          hooks.hit(p, tg);
          if (!p.pierce) { p.done = true; break; }
        }
      }
      if (p.left <= 1e-6) p.done = true;
    }
  } else if (p.kind === 'bomb') {
    if (t < p.t1) return;
    hooks.boom?.(p);
    if (p.zone) {
      const sp = specOf(p.rec.k, true);
      Object.assign(p, { kind: 'zone', next: p.t1, k: 0, ticks: sp.ticks, every: sp.every });
    } else p.done = true;
  }
  if (p.kind === 'zone') {
    while (!p.done && t >= p.next) {
      hooks.zoneTick?.(p, p.k);
      p.k++;
      p.next += p.every;
      if (p.k >= p.ticks) p.done = true;
    }
  }
}

// Cibles dans un rayon (explosion, zone, onde) : distance au centre <= rad + un peu du corps
export const inBlast = (x, y, rad, tg) => Math.hypot(tg.x - x, tg.y - y) <= rad + tg.r * 0.6;

// Cibles d'un coup au corps à corps : à portée, dans l'arc devant soi, sans mur entre les deux
export function meleeHits(w, x, y, a, range, arc, targets) {
  return targets.filter((tg) => {
    const d = Math.hypot(tg.x - x, tg.y - y);
    if (d > range + tg.r) return false;
    const da = Math.abs(((Math.atan2(tg.y - y, tg.x - x) - a + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
    return (d < tg.r * 1.5 || da <= arc / 2) && clearShot(w, x, y, tg.x, tg.y);
  });
}

// Cases cassables touchées par un coup au corps à corps ou une onde (rayon autour de x, y)
export function cellsInRadius(w, x, y, rad, pred = breakable) {
  const out = [];
  for (let cy = Math.floor(y - rad); cy <= Math.floor(y + rad); cy++) for (let cx = Math.floor(x - rad); cx <= Math.floor(x + rad); cx++) {
    if (cx < 0 || cy < 0 || cx >= w.w || cy >= w.h) continue;
    const i = cy * w.w + cx;
    if (pred(w.cells[i]) && Math.hypot(cx + 0.5 - x, cy + 0.5 - y) <= rad + 0.5) out.push(i);
  }
  return out;
}

// Les sacs de sable : 3 cases en travers du regard, à 1,5 case devant soi (seulement sur du sol libre)
export function sandCells(w, x, y, a) {
  const fx = x + Math.cos(a) * 1.6, fy = y + Math.sin(a) * 1.6;
  const px = -Math.sin(a), py = Math.cos(a);
  const out = [];
  for (const k of [-1, 0, 1]) {
    const i = cellAt(w, fx + px * k, fy + py * k);
    if (i >= 0 && (w.cells[i] === C.FLOOR || w.cells[i] === C.PATH) && !out.includes(i)) out.push(i);
  }
  return out;
}

// Position du joueur sur le fil (live) : x, y, a en centièmes ; m : en mouvement ; at : attaque lancée à l'instant
export const liveOfPos = (p) => ({ x: Math.round(p.x * 100), y: Math.round(p.y * 100), a: Math.round((p.a || 0) * 100), ...(p.mv ? { m: 1 } : {}) });

// Choix des bots : un kit au hasard, sans doublon tant que possible, et deux objets qui lui vont
export function botPick(i, taken = []) {
  const free = KIT_IDS.filter((k) => !taken.includes(k));
  const kit = (free.length ? free : KIT_IDS)[Math.floor(Math.random() * (free.length || KIT_IDS.length))];
  const pref = {
    dynamite: ['etoile', 'eperons', 'sacs'], colts: ['whisky', 'cartouches', 'eperons'], pompe: ['eperons', 'whisky', 'etoile'],
    sniper: ['sacs', 'longuevue', 'fumigene'], couteau: ['eperons', 'fumigene', 'piege'], arc: ['longuevue', 'piege', 'whisky'],
    forgeron: ['eperons', 'etoile', 'whisky'], docteur: ['whisky', 'etoile', 'sacs'], gatling: ['cartouches', 'sacs', 'etoile'],
  }[kit];
  const g = [...pref].sort(() => Math.random() - 0.5).slice(0, 2);
  return { kit, g };
}
