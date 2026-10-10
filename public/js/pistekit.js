// Règles de « La piste » : tactique au tour par tour façon Pathway, dans l'Ouest d'El Diablo.
// On forme sa bande (son cowboy et deux recrues, une quatrième en chemin), on l'équipe (une arme, une armure, un objet
// chacun ; balles, vivres et fournitures en commun), puis on traverse le territoire étape par étape jusqu'au repaire.
// Chaque étape coûte des vivres ; on y tombe sur un combat, un événement (des choix, que certains talents débloquent),
// un comptoir, un campement, une recrue ou une cache. Les combats se jouent sur une grille : un déplacement et une
// action par personnage et par tour, à couvert (demi ou plein), touché à coup sûr à découvert, l'armure encaisse avant
// la vie, le cran paie les coups spéciaux. Tout ici est sans navigateur (testable sous Node) : piste.js dessine et joue.
import { rng } from './worlds.js';
import { C } from './brawlkit.js';
import { treeFx } from './pisteskills.js';
import { blocksMove, blocksSight, coverValue, makeBattle, themeFor } from './pistemaps.js';

export const PISTE = {
  steps: 10, // étapes jusqu'au repaire d'El Diablo (le repaire est la dixième)
  open: 10000, // durée de la cinématique d'ouverture (pisteopen.js) ; le compte à rebours de l'arbitre l'attend
  cols: 9, // colonnes du territoire avant le repaire
  W: 24, H: 11, // grille des combats (cases de 16 px : 384 × 176)
  party: 2, // recrues au départ (en plus de son propre cowboy)
  maxParty: 4,
  stash: 10, // place dans le chariot
  start: { vivres: 4, balles: 40, fourn: 3, dollars: 380 },
  max: { vivres: 15, balles: 120, fourn: 15 },
  price: { vivres: 25, balles: 15, fourn: 30, recrue: 150, soins: 40 }, // balles : le paquet de 10
  walkHurt: 8, // sans vivres, on marche : chacun perd 8 PV par étape (jamais sous 1)
  meal: 5, // avec des vivres, le repas du soir : +5 PV chacun par étape
  dress: 30, // panser une blessure hors combat (1 fourniture) : +30 PV, +50 % avec un médecin dans la bande
  cran: 3, // cran maximal de base ; on commence chaque combat à 1
  bleed: 8, // saignement : PV perdus au début de chaque tour
  levels: [0, 60, 140, 240, 360, 500, 660, 840], // XP cumulée pour chaque niveau (8 au plus : un point d'arbre par niveau)
  upHp: 5, // PV max en plus à chaque niveau
  koRise: 10, // à terre en fin de combat gagné : on se relève avec 10 PV
};

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const shuffle = (arr, R) => { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; };
const pickR = (arr, R) => arr[Math.floor(R() * arr.length)];
export const randInt = (a, b, R = Math.random) => a + Math.floor(R() * (b - a + 1));

// ------------------------------------------------------------ talents (ouvrent des choix dans les événements)
export const PERKS = {
  medecin: 'MÉDECIN', costaud: 'COSTAUD', filou: 'FILOU', ombre: 'OMBRE', sixieme: 'SIXIÈME SENS', intimidation: 'INTIMIDATION',
  pisteur: 'PISTEUR', polyglotte: 'POLYGLOTTE', mecano: 'MÉCANO', cassecou: 'CASSE-COU', esprits: 'ESPRITS',
};

// ------------------------------------------------------------ armes, armures, objets
// q : qualité (0 ordinaire, 1 fine, 2 de légende) : dégâts × QMUL, +1 de portée pour la légende, prix × QPRICE
export const QUAL = ['', 'DE CHOIX', 'DE LÉGENDE'];
export const QUAL_SHORT = ['', '+', '++']; // dans les listes étroites (la couleur dit aussi la qualité)
export const QCOL = ['#e8dcc0', '#7ab0f0', '#f8b040'];
const QMUL = [1, 1.15, 1.3];
const QPRICE = [1, 2.2, 4];

// kit : le dessin de l'arme (brawlart.js) ; acc : précision en plus contre une cible à couvert ; clip : coups avant de
// recharger (null : pas de munitions) ; sp : coup spécial (cran)
export const WEAPONS = {
  revolver: { name: 'COLT', kit: 'colts', dmg: [20, 25], range: 6, clip: 6, acc: 0, crit: 10, sfx: 'colt', price: 60, sp: 'double' },
  winchester: { name: 'WINCHESTER', kit: 'sniper', dmg: [24, 32], range: 8, clip: 4, acc: -5, crit: 5, sfx: 'winchester', price: 90, sp: 'feu' },
  fusil: { name: 'FUSIL DE CHASSE', short: 'FUSIL', kit: 'pompe', dmg: [30, 38], range: 3, clip: 2, acc: 15, crit: 5, sfx: 'shotgun', price: 80, sp: 'volee' },
  sharps: { name: 'SHARPS', kit: 'sniper', dmg: [26, 32], range: 11, clip: 3, acc: 10, crit: 15, sfx: 'sharps', price: 110, sp: 'affut' },
  arc: { name: 'ARC', kit: 'arc', dmg: [18, 24], range: 7, clip: null, acc: 5, crit: 10, sfx: 'bow', price: 70, sp: 'barbelee' },
};
export const ARMORS = {
  cuir: { name: 'VESTE DE CUIR', short: 'VESTE', cls: 0, arm: 8, mv: 0, price: 40, sp: 'sprint' },
  duster: { name: 'CACHE-POUSSIÈRE', short: 'DUSTER', cls: 1, arm: 14, mv: 0, price: 80, sp: 'profil' },
  plastron: { name: 'PLASTRON D\'ACIER', short: 'PLASTRON', cls: 2, arm: 20, mv: -1, price: 130, sp: 'retranche' },
};
// use : objet qui sert en combat (uses : par combat ; fourn : coûte une fourniture) ; sinon, effet permanent
export const ITEMS = {
  couteau: { name: 'COUTEAU', short: 'COUTEAU', price: 30, text: 'Au contact : ignore l\'armure, peut faire saigner', melee: [18, 22] },
  bandages: { name: 'BANDAGES', short: 'BANDAGES', price: 30, use: 'heal', heal: 30, uses: 2, fourn: true, text: 'Soigne 30 PV (ou relève) au contact' },
  trousse: { name: 'TROUSSE DE MÉDECIN', short: 'TROUSSE', price: 70, use: 'heal', heal: 50, uses: 2, fourn: true, text: 'Soigne 50 PV (ou relève) au contact' },
  dynamite: { name: 'DYNAMITE', short: 'DYNAMITE', price: 50, use: 'boom', dmg: [20, 30], range: 6, uses: 2, fourn: true, text: 'Lancée jusqu\'à 6 cases : 3 × 3 cases, ignore le couvert' },
  graisse: { name: 'KIT DE RAFISTOLAGE', short: 'RAFISTOLAGE', price: 40, use: 'fix', fix: 12, uses: 2, fourn: true, text: 'Répare 12 points d\'armure au contact' },
  whisky: { name: 'FLASQUE DE WHISKY', short: 'WHISKY', price: 35, use: 'cran', uses: 2, text: '+2 de cran' },
  fer: { name: 'FER À CHEVAL', short: 'FER À CHEVAL', price: 140, esq: 15, crit: 5, text: 'Porte-bonheur : +15 % d\'esquive, +5 % de critiques' },
  etoile: { name: 'ÉTOILE DE SHÉRIF', short: 'ÉTOILE', price: 120, cran: 1, perk: 'intimidation', text: '+1 de cran maximal, INTIMIDATION' },
  longuevue: { name: 'LONGUE-VUE', short: 'LONGUE-VUE', price: 90, range: 1, prec: 10, text: '+1 de portée, +10 de précision' },
};
// nom court d'un objet (listes étroites)
export const gearShort = (g) => { const d = WEAPONS[g.id] || ARMORS[g.id] || ITEMS[g.id]; return d ? d.short || d.name : ''; };
export const GEAR_KIND = (id) => (WEAPONS[id] ? 'w' : ARMORS[id] ? 'a' : 'it');
export const gearDef = (g) => (g ? WEAPONS[g.id] || ARMORS[g.id] || ITEMS[g.id] : null);
export function gearName(g) {
  const d = gearDef(g);
  if (!d) return '';
  return g.q ? `${d.name} ${QUAL[g.q]}` : d.name;
}
export const gearPrice = (g) => Math.round((gearDef(g)?.price || 0) * QPRICE[g.q || 0]);
export const sellPrice = (g) => Math.round(gearPrice(g) * 0.45);

// ------------------------------------------------------------ coups spéciaux (cran)
// short : nom sur les boutons du combat ; free : ne prend pas l'action du tour ; aim : ce qu'on vise (enemy, ally, tile, self)
export const SPECIALS = {
  // armes
  double: { name: 'COUP DOUBLE', short: 'DOUBLE', cost: 2, aim: 'enemy', text: 'Deux balles, sur une ou deux cibles' },
  feu: { name: 'FEU ROULANT', short: 'RAFALE', cost: 2, aim: 'enemy', text: 'Touche chaque ennemi sur la ligne de tir, jusqu\'à portée (1 balle chacun)' },
  volee: { name: 'VOLÉE', short: 'VOLÉE', cost: 1, aim: 'enemy', text: 'Deux canons en éventail : tous les ennemis du cône, -20 % de dégâts' },
  affut: { name: 'À L\'AFFÛT', short: 'AFFÛT', cost: 2, aim: 'tile', text: 'Guette un cône : tire sur le premier ennemi qui y bouge ou y tire' },
  barbelee: { name: 'FLÈCHE BARBELÉE', short: 'BARBELÉE', cost: 1, aim: 'enemy', text: 'La cible touchée saigne 3 tours' },
  // armures
  sprint: { name: 'SPRINT', short: 'SPRINT', cost: 1, aim: 'self', free: true, text: '+3 cases de déplacement ce tour' },
  profil: { name: 'PROFIL BAS', short: 'PROFIL BAS', cost: 1, aim: 'self', text: '+40 % d\'esquive jusqu\'à ton prochain tour' },
  retranche: { name: 'RETRANCHÉ', short: 'RETRANCHÉ', cost: 2, aim: 'self', text: '-75 % de dégâts jusqu\'à ton prochain tour' },
  // personnages
  ralliement: { name: 'RALLIEMENT', short: 'RALLIEMENT', cost: 2, aim: 'ally', text: 'Un allié retrouve son déplacement, avec +2 cases' },
  roulade: { name: 'ROULÉ-BOULÉ', short: 'ROULADE', cost: 1, aim: 'tile', free: true, text: 'Bond de 2 cases en ligne, sans prendre le déplacement' },
  soins: { name: 'PREMIERS SOINS', short: 'SOINS', cost: 1, aim: 'ally', text: 'Au contact : +25 % de PV, arrête le saignement, relève (sans fourniture)' },
  epaule: { name: 'COUP D\'ÉPAULE', short: 'ÉPAULE', cost: 1, aim: 'enemy', text: 'Au contact : repousse de 2 cases, +12 dégâts contre un obstacle' },
  jugement: { name: 'JUGEMENT DERNIER', short: 'JUGEMENT', cost: 2, aim: 'enemy', text: 'Si la balle laisse la cible sous 35 % de PV, elle tombe' },
  traque: { name: 'MARQUER LA PROIE', short: 'MARQUER', cost: 1, aim: 'enemy', free: true, text: 'Jusqu\'à ton prochain tour, la cible n\'a plus de couvert' },
  meche: { name: 'MÈCHE COURTE', short: 'MÈCHE', cost: 2, aim: 'tile', text: 'Un bâton de dynamite sans fourniture (6 cases, 3 × 3)' },
  fondu: { name: 'SE FONDRE', short: 'SE FONDRE', cost: 2, aim: 'self', free: true, text: 'Les ennemis t\'ignorent jusqu\'à ton prochain tour, ou jusqu\'à ton prochain coup' },
  semonce: { name: 'TIRS DE SEMONCE', short: 'SEMONCE', cost: 2, aim: 'tile', text: 'Cône de 5 cases : les ennemis touchés ne bougent plus au prochain tour' },
};

// ------------------------------------------------------------ la bande
// look : l'allure (même format que le personnage des joueurs, data.js) ; arm : classe d'armure la plus lourde portée
// (0 cuir, 1 cache-poussière, 2 plastron) ; weapons : armes qu'il sait manier ; endu : tours à terre avant de mourir
export const LEADER = {
  id: 'chef', name: 'TOI', role: 'Chef de bande', hp: 50, mv: 5, prec: 20, esq: 10, endu: 3, arm: 1,
  weapons: ['revolver', 'winchester', 'fusil'], perks: ['filou'], talent: 'ralliement',
  gear: { w: 'revolver', a: 'cuir', it: 'bandages' },
  bio: 'C\'est ta bande, et ta tête qui est mise à prix.',
};
export const ROSTER = {
  gamin: {
    name: 'JESSE COLE', short: 'JESSE', nick: 'LE GAMIN', role: 'Pistolero', hp: 40, mv: 6, prec: 30, esq: 20, endu: 2, arm: 0,
    weapons: ['revolver'], perks: ['cassecou'], talent: 'roulade', gear: { w: 'revolver', a: 'cuir', it: 'whisky' },
    look: { skin: 0, hat: 'cowboy', hatColor: 7, hair: 'messy', hairColor: 3, eyes: 'squint', nose: 'small', mouth: 'toothpick', beard: 'none', outfit: 'vest', outfitColor: 0, extra: 'scarf' },
    bio: 'Dix-neuf ans, la gâchette la plus rapide du comté.',
  },
  doc: {
    name: 'DOC HOLLOWAY', short: 'DOC', nick: 'LE TOUBIB', role: 'Médecin', hp: 40, mv: 5, prec: 15, esq: 10, endu: 3, arm: 0,
    weapons: ['revolver', 'fusil'], perks: ['medecin', 'polyglotte'], talent: 'soins', gear: { w: 'revolver', a: 'cuir', it: 'trousse' },
    look: { skin: 6, hat: 'bowler', hatColor: 7, hair: 'slick', hairColor: 6, eyes: 'glasses', nose: 'long', mouth: 'neutral', beard: 'pencil', outfit: 'suit', outfitColor: 7, extra: 'bolo' },
    bio: 'Il recoud mieux qu\'il ne vise. Parle latin, espagnol et comanche.',
  },
  martha: {
    f: true, name: 'BIG MARTHA', short: 'MARTHA', nick: 'LA MONTAGNE', role: 'Costaude', hp: 60, mv: 4, prec: 10, esq: 0, endu: 4, arm: 2, tough: 0.15,
    weapons: ['fusil', 'winchester'], perks: ['costaud'], talent: 'epaule', gear: { w: 'fusil', a: 'plastron', it: 'couteau' },
    look: { skin: 2, hat: 'straw', hatColor: 0, hair: 'braids', hairColor: 5, eyes: 'angry', nose: 'broken', mouth: 'grin', beard: 'none', outfit: 'overalls', outfitColor: 3, extra: 'freckles' },
    bio: 'Coriace : 15 % de dégâts en moins. A tenu un ranch seule.',
  },
  reverend: {
    name: 'RÉVÉREND CAIN', short: 'CAIN', nick: 'LE PRÊCHEUR', role: 'Tireur d\'élite', hp: 45, mv: 4, prec: 30, esq: 10, endu: 3, arm: 0,
    weapons: ['sharps', 'winchester'], perks: ['intimidation', 'esprits'], talent: 'jugement', gear: { w: 'sharps', a: 'cuir', it: 'longuevue' },
    look: { skin: 1, hat: 'tophat', hatColor: 7, hair: 'long', hairColor: 7, eyes: 'tired', nose: 'hooked', mouth: 'frown', beard: 'imperial', outfit: 'duster', outfitColor: 7, extra: 'none' },
    bio: 'Il prêche le dimanche et règle les comptes la semaine.',
  },
  tala: {
    f: true, name: 'TALA', short: 'TALA', nick: 'L\'ÉCLAIREUSE', role: 'Pisteuse', hp: 45, mv: 6, prec: 25, esq: 20, endu: 3, arm: 0,
    weapons: ['arc', 'winchester'], perks: ['pisteur', 'polyglotte'], talent: 'traque', gear: { w: 'arc', a: 'cuir', it: 'couteau' },
    look: { skin: 3, hat: 'none', hatColor: 2, hair: 'braids', hairColor: 8, eyes: 'normal', nose: 'small', mouth: 'neutral', beard: 'none', outfit: 'fringe', outfitColor: 2, extra: 'earring' },
    bio: 'Lit une piste vieille de trois jours. Son arc ne coûte pas de balles.',
  },
  rosita: {
    f: true, name: 'ROSITA VARGAS', short: 'ROSITA', nick: 'LA MÈCHE', role: 'Artificière', hp: 50, mv: 5, prec: 15, esq: 10, endu: 3, arm: 1,
    weapons: ['winchester', 'fusil'], perks: ['mecano', 'cassecou'], talent: 'meche', gear: { w: 'winchester', a: 'duster', it: 'dynamite' },
    look: { skin: 2, hat: 'sombrero', hatColor: 10, hair: 'ponytail', hairColor: 0, eyes: 'lashes', nose: 'small', mouth: 'smile', beard: 'none', outfit: 'bandolier', outfitColor: 4, extra: 'none' },
    bio: 'A dynamité trois coffres et un pont. Répare tout ce qui roule.',
  },
  silas: {
    name: 'SILAS CROW', short: 'SILAS', nick: 'LE FANTÔME', role: 'Assassin', hp: 40, mv: 6, prec: 20, esq: 30, endu: 2, arm: 0,
    weapons: ['revolver'], perks: ['ombre', 'sixieme'], talent: 'fondu', gear: { w: 'revolver', a: 'cuir', it: 'couteau' },
    look: { skin: 6, hat: 'gambler', hatColor: 7, hair: 'long', hairColor: 8, eyes: 'shades', nose: 'hooked', mouth: 'smirk', beard: 'stubble', outfit: 'duster', outfitColor: 7, extra: 'scar' },
    bio: 'Personne ne l\'entend venir. 30 % d\'esquive.',
  },
  omalley: {
    name: 'SERGENT O\'MALLEY', short: 'O\'MALLEY', nick: 'LE VÉTÉRAN', role: 'Soldat', hp: 55, mv: 5, prec: 20, esq: 5, endu: 4, arm: 1,
    weapons: ['winchester', 'revolver', 'fusil'], perks: ['intimidation', 'pisteur'], talent: 'semonce', gear: { w: 'winchester', a: 'duster', it: 'bandages' },
    look: { skin: 0, hat: 'cavalry', hatColor: 3, hair: 'short', hairColor: 5, eyes: 'squint', nose: 'red', mouth: 'pipe', beard: 'walrus', outfit: 'sheriff', outfitColor: 3, extra: 'medal' },
    bio: 'Vingt ans de cavalerie. Il gueule, et on se baisse.',
  },
};
export const ROSTER_IDS = Object.keys(ROSTER);
export const defOf = (m) => (m.id === 'chef' ? LEADER : ROSTER[m.id]);

// améliorations au passage de niveau (deux tirées au sort, on en choisit une)
export const UPGRADES = {
  mv: { name: '+1 DÉPLACEMENT', text: 'Une case de plus par tour' },
  prec: { name: '+10 PRÉCISION', text: 'Mieux toucher une cible à couvert' },
  esq: { name: '+8 ESQUIVE', text: 'Plus de chances d\'esquiver' },
  dmg: { name: '+3 DÉGÂTS', text: 'Chaque coup porte plus fort' },
  hp: { name: '+10 PV', text: 'Dix points de vie maximum en plus' },
  cran: { name: '+1 CRAN', text: 'Un cran de plus, au maximum et au départ' },
  crit: { name: '+8 CRITIQUES', text: 'Plus de coups critiques (× 1,5)' },
};
export const UPGRADE_IDS = Object.keys(UPGRADES);

export function newMember(id, look = null) {
  const d = id === 'chef' ? LEADER : ROSTER[id];
  return {
    id, look: look || d.look, hp: d.hp, arm: ARMORS[d.gear.a].arm, xp: 0, lvl: 1, ups: {}, alive: true,
    gear: { w: { id: d.gear.w, q: 0 }, a: { id: d.gear.a, q: 0 }, it: d.gear.it ? { id: d.gear.it, q: 0 } : null },
  };
}

// Caractéristiques d'un membre, avec son équipement et ses niveaux
export function statsOf(m) {
  const d = defOf(m), u = m.ups || {}, tf = treeFx(m); // ups : améliorations des anciennes sauvegardes ; tf : l'arbre
  const w = m.gear.w ? WEAPONS[m.gear.w.id] : null, wq = m.gear.w?.q || 0;
  const a = m.gear.a ? ARMORS[m.gear.a.id] : null, aq = m.gear.a?.q || 0;
  const it = m.gear.it ? ITEMS[m.gear.it.id] : null;
  const perks = [...d.perks];
  if (it?.perk && !perks.includes(it.perk)) perks.push(it.perk);
  return {
    maxHp: d.hp + (m.lvl - 1) * PISTE.upHp + (u.hp || 0) * 10 + tf.hp,
    armMax: a ? a.arm + aq * 3 + tf.arm : 0,
    mv: d.mv + (a?.mv || 0) + (u.mv || 0) + tf.mv,
    prec: d.prec + (u.prec || 0) * 10 + (it?.prec || 0) + tf.prec,
    esq: d.esq + (u.esq || 0) * 8 + (it?.esq || 0) + tf.esq,
    crit: (w?.crit || 0) + (u.crit || 0) * 8 + (it?.crit || 0) + tf.crit,
    dmgUp: (u.dmg || 0) * 3 + tf.dmg,
    cranMax: PISTE.cran + (u.cran || 0) + (it?.cran || 0) + tf.cran,
    range: w ? w.range + (wq >= 2 ? 1 : 0) + (it?.range || 0) + tf.range : 1,
    endu: d.endu, tough: d.tough || 0, perks, talent: d.talent, skills: tf.skills, cranStart: 1 + (u.cran || 0) + tf.cran,
  };
}
export const levelOf = (xp) => { let l = 1; while (l < PISTE.levels.length && xp >= PISTE.levels[l]) l++; return l; };
export const canWield = (m, wid) => defOf(m).weapons.includes(wid);
export const canWear = (m, aid) => ARMORS[aid].cls <= defOf(m).arm;
export const partyPerks = (party) => new Set(party.filter((m) => m.alive).flatMap((m) => statsOf(m).perks));

// ------------------------------------------------------------ ennemis
// ai : shooter (cherche le couvert et le meilleur tir), rusher (fonce au contact), beast (bête : au contact, sans couvert),
// sniper (de loin, guette s'il ne voit rien), grenadier (dynamite sur les groupes), boss (El Diablo)
export const ENEMIES = {
  bandit: { name: 'HORS-LA-LOI', hp: 30, arm: 0, mv: 5, prec: 10, esq: 5, w: 'revolver', ai: 'shooter', xp: 20 },
  carabinier: { name: 'CARABINIER', hp: 34, arm: 6, mv: 4, prec: 10, esq: 5, w: 'winchester', ai: 'shooter', xp: 25 },
  brute: { name: 'BRUTE', hp: 46, arm: 10, mv: 5, prec: 5, esq: 0, w: 'fusil', ai: 'rusher', xp: 30 },
  coyote: { name: 'COYOTE', hp: 20, arm: 0, mv: 7, prec: 0, esq: 15, bite: [10, 14], ai: 'beast', xp: 12 },
  embusque: { name: 'TIREUR EMBUSQUÉ', hp: 28, arm: 0, mv: 3, prec: 20, esq: 5, w: 'sharps', ai: 'sniper', xp: 30 },
  dynamiteur: { name: 'DYNAMITEUR', hp: 30, arm: 6, mv: 4, prec: 5, esq: 5, w: 'revolver', ai: 'grenadier', boom: [16, 22], xp: 30 },
  lieutenant: { name: 'LIEUTENANT', hp: 50, arm: 12, mv: 4, prec: 15, esq: 5, w: 'revolver', ai: 'shooter', aura: 10, xp: 45 },
  diablo: { name: 'EL DIABLO', hp: 120, arm: 15, mv: 5, prec: 20, esq: 10, w: 'revolver', ai: 'boss', dmg: [20, 26], xp: 250, boss: true },
};
// allures (format des personnages) : les bandits d'El Diablo et El Diablo lui-même (celui de la fusillade)
export const ENEMY_LOOKS = [
  { skin: 1, hat: 'cowboy', hatColor: 7, hair: 'short', hairColor: 0, eyes: 'angry', nose: 'big', mouth: 'frown', beard: 'stubble', outfit: 'duster', outfitColor: 1 },
  { skin: 3, hat: 'sombrero', hatColor: 1, hair: 'long', hairColor: 0, eyes: 'squint', nose: 'hooked', mouth: 'cigar', beard: 'mustache', outfit: 'poncho', outfitColor: 4 },
  { skin: 0, hat: 'bandana', hatColor: 0, hair: 'messy', hairColor: 5, eyes: 'angry', nose: 'broken', mouth: 'grin', beard: 'full', outfit: 'vest', outfitColor: 7 },
  { skin: 2, hat: 'gambler', hatColor: 7, hair: 'ponytail', hairColor: 1, eyes: 'patch', nose: 'small', mouth: 'toothpick', beard: 'goatee', outfit: 'duster', outfitColor: 7 },
  { skin: 4, hat: 'cowboy', hatColor: 1, hair: 'curly', hairColor: 0, eyes: 'squint', nose: 'round', mouth: 'frown', beard: 'chops', outfit: 'shirt', outfitColor: 0 },
  { skin: 1, hat: 'coonskin', hatColor: 1, hair: 'mullet', hairColor: 2, eyes: 'angry', nose: 'red', mouth: 'neutral', beard: 'horseshoe', outfit: 'vest', outfitColor: 4 },
  { skin: 5, hat: 'bowler', hatColor: 7, hair: 'short', hairColor: 0, eyes: 'tired', nose: 'big', mouth: 'cigar', beard: 'handlebar', outfit: 'duster', outfitColor: 1 },
];
export const DIABLO_LOOK = { skin: 3, hat: 'sombrero', hatColor: 7, hair: 'long', hairColor: 0, eyes: 'patch', nose: 'hooked', mouth: 'cigar', beard: 'handlebar', outfit: 'poncho', outfitColor: 0 };

// Les groupes d'ennemis : un budget qui grandit avec la colonne
const ENC_COST = { bandit: 2, carabinier: 3, brute: 3, coyote: 1, embusque: 3, dynamiteur: 3, lieutenant: 4 };
export function encounter(R, col, kind = 'combat') {
  if (kind === 'repaire') return ['diablo', 'carabinier', 'bandit', 'dynamiteur'];
  if (kind === 'coyotes') return Array.from({ length: 2 + Math.min(3, Math.floor(col / 2)) }, () => 'coyote');
  let budget = 4 + col * 1.1;
  const pool = col < 2 ? ['bandit', 'bandit', 'coyote', 'carabinier'] : col < 5
    ? ['bandit', 'carabinier', 'brute', 'coyote', 'embusque', 'dynamiteur']
    : ['bandit', 'carabinier', 'brute', 'embusque', 'dynamiteur', 'lieutenant'];
  const out = [];
  if (col >= 7 && R() < 0.5) { out.push('lieutenant'); budget -= ENC_COST.lieutenant; }
  while (budget >= 1 && out.length < 7) {
    const opts = pool.filter((id) => ENC_COST[id] <= budget && !(id === 'lieutenant' && out.includes('lieutenant')));
    if (!opts.length) break;
    const id = pickR(opts, R);
    out.push(id);
    budget -= ENC_COST[id];
  }
  if (out.length < 2) out.push('bandit');
  return out;
}
// plus on avance, plus ils sont solides : PV et dégâts × (1 + 4 % par colonne)
export const tierMul = (col) => 1 + 0.04 * Math.max(0, col - 1);

// ------------------------------------------------------------ le territoire
// Colonnes 1 à 9 (2 à 4 lieux chacune), puis le repaire en colonne 10. Chaque lieu mène à un ou deux lieux de la
// colonne suivante. On voit la nature des lieux deux colonnes en avant (trois avec un pisteur) ; au-delà, « ? ».
export const NODES = {
  depart: { name: 'DUSTY GULCH', text: 'Le point de départ' },
  combat: { name: 'HORS-LA-LOI', text: 'Des hommes d\'El Diablo barrent la piste' },
  event: { name: 'RENCONTRE', text: 'Quelque chose vous attend… à vous de choisir' },
  comptoir: { name: 'COMPTOIR', text: 'Acheter, vendre, se faire soigner' },
  camp: { name: 'CAMPEMENT', text: 'Une nuit au calme : PV et armures au maximum' },
  recrue: { name: 'RECRUE', text: 'Quelqu\'un veut se joindre à la bande' },
  cache: { name: 'CACHE', text: 'Un butin caché… peut-être piégé' },
  prisonnier: { name: 'OTAGE', text: 'Un otage aux mains des bandits : délivré, il rejoint la bande' },
  repaire: { name: 'LE REPAIRE', text: 'La hacienda d\'El Diablo' },
};
const NODE_W = { combat: 34, event: 30, cache: 8, recrue: 7, comptoir: 7, camp: 5, prisonnier: 6 };
// régions : trois actes, chacun son décor (environnements de brawlart.js)
const ACTS = [['desert'], ['canyon', 'prairie'], ['foret', 'neige']];
export const REGION_NAMES = { desert: 'DÉSERT DES MORTS', canyon: 'CANYONS ROUGES', prairie: 'GRANDE PRAIRIE', foret: 'BOIS NOIRS', neige: 'SIERRA BLANCHE' };
export const actOf = (col) => (col <= 3 ? 0 : col <= 6 ? 1 : 2);

export function territory(seed, eventIds) {
  const R = rng((seed ^ 0x7a3d1c55) >>> 0);
  const regions = ACTS.map((list) => pickR(list, R));
  const cols = [[{ c: 0, i: 0, y: 0.5, type: 'depart', next: [] }]];
  for (let c = 1; c <= PISTE.cols; c++) {
    const n = c === 1 ? 2 + Math.floor(R() * 2) : 2 + Math.floor(R() * 3);
    const col = [];
    for (let i = 0; i < n; i++) {
      const y = (i + 0.5) / n + (R() - 0.5) * (0.5 / n);
      col.push({ c, i, y: clamp(y, 0.08, 0.92), type: 'combat', next: [] });
    }
    cols.push(col);
  }
  cols.push([{ c: PISTE.cols + 1, i: 0, y: 0.5, type: 'repaire', next: [] }]);
  // les chemins : chacun vers le lieu le plus proche de la colonne suivante (parfois aussi le deuxième),
  // et tout lieu a au moins un chemin qui y mène
  for (let c = 0; c < cols.length - 1; c++) {
    const A = cols[c], B = cols[c + 1];
    for (const a of A) {
      const order = B.map((b, j) => [Math.abs(b.y - a.y), j]).sort((p, q) => p[0] - q[0]).map((p) => p[1]);
      a.next.push(order[0]);
      if (order.length > 1 && (A.length === 1 || R() < 0.45)) a.next.push(order[1]);
    }
    B.forEach((b, j) => {
      if (A.some((a) => a.next.includes(j))) return;
      let best = 0;
      A.forEach((a, k) => { if (Math.abs(a.y - b.y) < Math.abs(A[best].y - b.y)) best = k; });
      A[best].next.push(j);
    });
    for (const a of A) a.next.sort((p, q) => p - q);
  }
  // la nature des lieux, tirée au sort par colonne avec quelques garanties
  const types = Object.keys(NODE_W);
  for (let c = 1; c <= PISTE.cols; c++) {
    for (const nd of cols[c]) {
      let x = R() * types.reduce((s, t) => s + NODE_W[t], 0);
      nd.type = types.find((t) => (x -= NODE_W[t]) <= 0) || 'combat';
      if (c === 1 && !['combat', 'event'].includes(nd.type)) nd.type = R() < 0.5 ? 'combat' : 'event';
      if (nd.type === 'recrue' && (c < 2 || c > 7)) nd.type = 'event';
    }
  }
  const ensure = (cs, type) => {
    if (cs.some((c) => cols[c].some((nd) => nd.type === type))) return;
    const c = pickR(cs, R);
    pickR(cols[c], R).type = type;
  };
  ensure([3, 4], 'comptoir');
  ensure([6, 7], 'comptoir');
  ensure([5], 'camp');
  ensure([8], 'camp');
  ensure([2, 3, 4, 5], 'recrue');
  // les événements, sans répétition, dans l'ordre d'un tirage
  const evs = shuffle([...eventIds], R);
  let k = 0;
  cols.forEach((col) => col.forEach((nd) => {
    if (nd.type === 'event') nd.ev = evs[k++ % evs.length];
    nd.seed = Math.floor(R() * 2 ** 31);
  }));
  return { regions, cols };
}
export const regionOf = (terr, col) => terr.regions[actOf(Math.min(col, PISTE.cols))];

// ------------------------------------------------------------ cartes de combat (pistemaps.js : de 22 × 16 à 36 × 26 cases)
// Les cases de la mêlée (brawlkit.js C : sol, chemin, rocher, caisse, buisson, eau, tonneau de poudre, sacs de sable),
// plus le vide (VOID : les bords découpés), les tables, le comptoir, les rails, les barrières et les poteaux.
// Un thème par combat (désert, canyon, prairie, forêt, neige, mine, saloon, ville ; la hacienda pour le repaire).
export { blocksMove, blocksSight, coverValue, CELL, THEMES } from './pistemaps.js';

export const inMap = (m, x, y) => x >= 0 && y >= 0 && x < m.w && y < m.h;
export const cellOf = (m, x, y) => (inMap(m, x, y) ? m.cells[y * m.w + x] : C.WALL);

// la carte d'un combat : seed (celle du lieu), runSeed (celle de la partie : la ronde des thèmes), region, col, kind
// ('combat', 'embuscade', 'coyotes', 'repaire'), i (rang du lieu dans sa colonne)
export function battleMap(seed, { runSeed = seed, region = 'desert', col = 1, kind = 'combat', i = 0 } = {}) {
  const theme = themeFor(runSeed, region, col, kind === 'embuscade' ? 'combat' : kind, i);
  return makeBattle(seed, { region, col, kind: kind === 'embuscade' ? 'combat' : kind, theme });
}
export const DIRS4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];

// Cases de départ (préparées par la carte) : la bande d'un côté, les ennemis de l'autre, les places d'embuscade tout
// autour de la bande ; au repaire, El Diablo (le premier ennemi) sur sa place. S'il en manque : les cases libres voisines.
export function deploySpots(m, side, n, ambush = false) {
  const D = m.deploy || { p: [], e: [], amb: [] };
  let list = side === 'p' ? D.p : ambush ? D.amb : D.e;
  if (side === 'e' && !ambush && m.lair && D.boss) list = [D.boss, ...list];
  const out = [];
  for (const s of list) if (out.length < n && !out.some((o) => o.x === s.x && o.y === s.y)) out.push({ x: s.x, y: s.y });
  // au pire : les cases libres les plus proches des premières places
  const ref = list[0] || { x: side === 'p' ? 1 : m.w - 2, y: m.h >> 1 };
  if (out.length < n) {
    const free = [];
    for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) if (!blocksMove(cellOf(m, x, y))) free.push({ x, y, d: Math.abs(x - ref.x) + Math.abs(y - ref.y) });
    free.sort((a, b) => a.d - b.d);
    for (const f of free) if (out.length < n && !out.some((o) => o.x === f.x && o.y === f.y)) out.push({ x: f.x, y: f.y });
  }
  return out;
}

// ------------------------------------------------------------ le combat
// Une unité (membre de la bande ou ennemi) pendant un combat
export function memberUnit(m, uid) {
  const s = statsOf(m), w = m.gear.w ? WEAPONS[m.gear.w.id] : null;
  return {
    uid, side: 'p', mid: m, kind: m.id, name: m.id === 'chef' ? 'TOI' : ROSTER[m.id].name, look: m.look,
    x: 0, y: 0, hp: Math.min(m.hp, s.maxHp), max: s.maxHp, arm: Math.min(m.arm, s.armMax), armMax: s.armMax,
    mv: s.mv, prec: s.prec, esq: s.esq, crit: s.crit, dmgUp: s.dmgUp, range: s.range, tough: s.tough,
    w: w ? { id: m.gear.w.id, q: m.gear.w.q || 0 } : null, ammo: w?.clip ?? 0,
    a: m.gear.a ? m.gear.a.id : null, it: m.gear.it ? m.gear.it.id : null, itUses: m.gear.it && ITEMS[m.gear.it.id]?.uses || 0,
    talent: s.talent, cran: Math.min(s.cranStart, s.cranMax), cranMax: s.cranMax, endu: s.endu, skills: new Set(s.skills),
    moved: false, acted: false, mvBonus: 0, st: {}, ko: null, dead: false, kills: 0, xpGain: 0,
  };
}
export function enemyUnit(type, uid, col) {
  const e = ENEMIES[type], k = e.boss ? 1 : tierMul(col);
  const hp = Math.round(e.hp * k);
  return {
    uid, side: 'e', kind: type, name: e.name, boss: !!e.boss, ai: e.ai,
    x: 0, y: 0, hp, max: hp, arm: Math.round(e.arm * k), armMax: Math.round(e.arm * k),
    mv: e.mv, prec: e.prec, esq: e.esq, crit: e.w ? WEAPONS[e.w].crit : 5, dmgUp: 0, range: e.w ? WEAPONS[e.w].range : 1, tough: 0,
    w: e.w ? { id: e.w, q: 0 } : null, ammo: 99, dmgMul: k, it: null, itUses: 0, cran: 0, cranMax: 0,
    moved: false, acted: false, mvBonus: 0, st: {}, ko: null, dead: false, boomCd: 0, calls: 0,
  };
}
export const alive = (u) => !u.dead && u.ko == null;
export const unitAt = (B, x, y) => B.units.find((u) => !u.dead && u.x === x && u.y === y) || null;
export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export const adjacent = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) === 1;

// Cases atteignables : déplacement en 4 directions, à travers ses alliés mais pas ses ennemis, sans s'arrêter sur
// une case occupée (occ : on y passe, on ne s'y arrête pas). Renvoie Map(index -> { x, y, d, prev, occ }).
export function reach(B, u, maxD = u.mv + u.mvBonus) {
  const m = B.map, out = new Map();
  const k0 = u.y * m.w + u.x;
  out.set(k0, { x: u.x, y: u.y, d: 0, prev: -1 });
  const q = [k0];
  for (let h = 0; h < q.length; h++) {
    const c = out.get(q[h]);
    if (c.d >= maxD) continue;
    for (const [dx, dy] of DIRS4) {
      const X = c.x + dx, Y = c.y + dy, k = Y * m.w + X;
      if (!inMap(m, X, Y) || out.has(k) || blocksMove(m.cells[k])) continue;
      const o = unitAt(B, X, Y);
      if (o && (o.side !== u.side || o.dead)) continue;
      out.set(k, { x: X, y: Y, d: c.d + 1, prev: q[h] });
      q.push(k);
    }
  }
  // on ne s'arrête pas sur un allié (la case reste pour les chemins qui le traversent)
  for (const [k, c] of out) if (k !== k0 && unitAt(B, c.x, c.y)) c.occ = true;
  return out;
}
export function pathTo(R, k) {
  const path = [];
  for (let c = R.get(k); c; c = c.prev >= 0 ? R.get(c.prev) : null) path.unshift({ x: c.x, y: c.y });
  return path;
}

// Ligne de vue : seuls les rochers (et le bord) la coupent. On tire depuis le centre de sa case vers le centre de
// la cible ou un peu sur ses bords (on « penche la tête » d'un rocher collé) : une seule ligne dégagée suffit.
export function sees(m, ax, ay, bx, by) {
  if (ax === bx && ay === by) return true;
  const offs = [[0, 0], [0.32, 0.32], [-0.32, 0.32], [0.32, -0.32], [-0.32, -0.32]];
  for (const [ox, oy] of offs) if (clearLine(m, ax + 0.5, ay + 0.5, bx + 0.5 + ox, by + 0.5 + oy, ax, ay, bx, by)) return true;
  return false;
}
function clearLine(m, x0, y0, x1, y1, ax, ay, bx, by) {
  const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 4);
  for (let i = 1; i < n; i++) {
    const x = Math.floor(x0 + ((x1 - x0) * i) / n), y = Math.floor(y0 + ((y1 - y0) * i) / n);
    if ((x === ax && y === ay) || (x === bx && y === by)) continue;
    if (blocksSight(cellOf(m, x, y))) return false;
  }
  return true;
}

// Couvert de la cible face au tireur : l'obstacle collé à la cible (pas en diagonale) du côté d'où vient le tir.
// 0 : à découvert, 1 : demi-couvert (caisse, tonneau, sacs), 2 : plein couvert (rocher). On le perd en se faisant
// prendre de flanc. Les buissons ne protègent pas des balles mais cachent un peu (voir hitInfo).
export function coverOf(m, tx, ty, fx, fy) {
  const dx = Math.sign(fx - tx), dy = Math.sign(fy - ty);
  let c = 0;
  if (dx && Math.abs(fx - tx) >= 1) c = Math.max(c, coverValue(cellOf(m, tx + dx, ty)));
  if (dy && Math.abs(fy - ty) >= 1) c = Math.max(c, coverValue(cellOf(m, tx, ty + dy)));
  return c;
}
// les quatre côtés d'une case : le couvert qu'elle offre (pour l'aperçu en se déplaçant)
export const coverSides = (m, x, y) => DIRS4.map(([dx, dy]) => coverValue(cellOf(m, x + dx, y + dy)));

const COVER_BASE = [100, 50, 25]; // chances de toucher à découvert, à demi-couvert, à plein couvert (avant précision)
export const COVER_NAMES = ['À DÉCOUVERT', 'DEMI-COUVERT', 'PLEIN COUVERT'];

export function weaponOf(u) { return u.w ? WEAPONS[u.w.id] : null; }
export function dmgRange(u, special = null) {
  const w = weaponOf(u);
  let [a, b] = u.kind === 'diablo' ? ENEMIES.diablo.dmg : w ? w.dmg : [6, 10];
  const k = (u.w ? QMUL[u.w.q] : 1) * (u.dmgMul || 1) * (special === 'volee' ? 0.8 : 1);
  return [Math.round(a * k) + u.dmgUp, Math.round(b * k) + u.dmgUp];
}
export function meleeRange(u) {
  if (u.ai === 'beast') return ENEMIES[u.kind].bite.map((v) => Math.round(v * (u.dmgMul || 1)));
  if (u.it === 'couteau') return ITEMS.couteau.melee.map((v) => v + u.dmgUp);
  return [6 + u.dmgUp, 10 + u.dmgUp]; // à mains nues
}

// Peut-on tirer sur t, et avec quelles chances ? opts.melee : coup au contact ; opts.from : depuis une autre case
export function hitInfo(B, a, t, opts = {}) {
  const ax = opts.from ? opts.from.x : a.x, ay = opts.from ? opts.from.y : a.y;
  const m = B.map;
  const d = Math.hypot(t.x - ax, t.y - ay);
  const esq = clamp(t.esq + (t.st.profil ? 40 : 0), 0, 80);
  if (opts.melee) {
    if (Math.max(Math.abs(t.x - ax), Math.abs(t.y - ay)) !== 1) return { ok: false, why: 'TROP LOIN' };
    return { ok: true, hit: 100, esq: Math.round(esq / 2), cover: 0, d };
  }
  if (!a.w && a.ai !== 'boss') return { ok: false, why: 'PAS D\'ARME' };
  if (d > a.range + 0.5) return { ok: false, why: 'HORS DE PORTÉE' };
  if (!sees(m, ax, ay, t.x, t.y)) return { ok: false, why: 'PAS EN VUE' };
  let cover = t.st.mark ? 0 : coverOf(m, t.x, t.y, ax, ay);
  if (cover === 1 && a.skills?.has('oeil')) cover = 0; // œil de lynx : le demi-couvert ne protège plus
  const bush = cellOf(m, t.x, t.y) === C.BUSH && d > 1.5;
  const w = weaponOf(a);
  let hit = COVER_BASE[cover];
  if (cover) hit += a.prec + (w?.acc || 0) + (opts.aura || 0);
  if (bush) hit -= 15;
  hit = cover || bush ? clamp(hit, 5, 95) : 100;
  return { ok: true, hit, esq, cover, bush, d };
}

// Lance un coup : renvoie { hit, evade, crit, dmg (aux PV), armDmg, killed, ko } sans rien appliquer
export function rollAttack(a, t, info, { range = null, pierce = false, R = Math.random } = {}) {
  if (R() * 100 >= info.hit) return { hit: false };
  if (R() * 100 < info.esq) return { hit: false, evade: true };
  const [lo, hi] = range || dmgRange(a);
  let dmg = randInt(lo, hi, R);
  const crit = R() * 100 < a.crit;
  if (crit) dmg = Math.round(dmg * 1.5);
  return { hit: true, crit, ...damage(t, dmg, { pierce }) };
}
// les dégâts sur t (sans les appliquer) : coriace, retranché, puis l'armure encaisse avant la vie
export function damage(t, raw, { pierce = false } = {}) {
  let dmg = raw;
  if (t.tough) dmg *= 1 - t.tough;
  if (t.st.retranche) dmg *= 0.25;
  dmg = Math.round(dmg);
  const armDmg = pierce ? 0 : Math.min(t.arm, dmg);
  return { dmg: dmg - armDmg, armDmg, raw };
}
// applique un résultat (PV, armure) ; renvoie 'ko', 'dead' ou null
export function applyHit(t, res) {
  t.arm = Math.max(0, t.arm - (res.armDmg || 0));
  t.hp = Math.max(0, t.hp - (res.dmg || 0));
  // second souffle : une fois par combat, le coup mortel le laisse à 1 PV
  if (t.hp <= 0 && t.skills?.has('souffle') && !t.souffleUsed) { t.hp = 1; t.souffleUsed = true; t.saved = true; }
  if (t.hp > 0) return null;
  if (t.side === 'p') { t.ko = t.endu; t.st = {}; return 'ko'; }
  t.dead = true;
  return 'dead';
}

// Cases d'un cône (volée, tirs de semonce, affût) : depuis (x, y) vers (tx, ty), demi-angle en radians
export function coneCells(m, x, y, tx, ty, range, half = 0.5) {
  const a0 = Math.atan2(ty - y, tx - x), out = [];
  for (let Y = 0; Y < m.h; Y++) for (let X = 0; X < m.w; X++) {
    if (X === x && Y === y) continue;
    const d = Math.hypot(X - x, Y - y);
    if (d > range + 0.5) continue;
    let da = Math.atan2(Y - y, X - x) - a0;
    while (da > Math.PI) da -= Math.PI * 2;
    while (da < -Math.PI) da += Math.PI * 2;
    if (Math.abs(da) <= half + 0.12 / Math.max(1, d) && sees(m, x, y, X, Y)) out.push({ x: X, y: Y });
  }
  return out;
}
// cases d'une ligne, de (x, y) exclu jusqu'à la portée (feu roulant), arrêtée par les rochers
export function lineCells(m, x, y, tx, ty, range) {
  const out = [], n = Math.ceil(range * 4), dx = tx - x, dy = ty - y, L = Math.hypot(dx, dy) || 1;
  let last = -1;
  for (let i = 1; i <= n; i++) {
    const px = x + 0.5 + (dx / L) * (i / 4), py = y + 0.5 + (dy / L) * (i / 4);
    const X = Math.floor(px), Y = Math.floor(py);
    if (!inMap(m, X, Y) || blocksSight(cellOf(m, X, Y))) break;
    const k = Y * m.w + X;
    if (k !== last && !(X === x && Y === y)) { out.push({ x: X, y: Y }); last = k; }
  }
  return out;
}
export const blastCells = (m, x, y) => {
  const out = [];
  for (let Y = y - 1; Y <= y + 1; Y++) for (let X = x - 1; X <= x + 1; X++) if (inMap(m, X, Y)) out.push({ x: X, y: Y });
  return out;
};

// ------------------------------------------------------------ l'IA des ennemis
// Choisit où aller et quoi faire. Renvoie { path, act } où act = { kind: 'shoot' | 'melee' | 'boom' | 'affut' | 'call', ... }
// (écrit pour les ennemis, mais marche pour les deux camps : le banc d'essai fait jouer la bande par la même IA)
export function planEnemy(B, u) {
  const m = B.map;
  const foes = B.units.filter((o) => o.side !== u.side && alive(o) && !o.st.fondu);
  const allFoes = B.units.filter((o) => o.side !== u.side && alive(o));
  const R0 = u.st.pinned ? new Map([[u.y * m.w + u.x, { x: u.x, y: u.y, d: 0, prev: -1 }]]) : reach(B, u);
  if (!allFoes.length) return { path: [], act: null };
  const aura = auraOf(B, u);
  const wDmg = u.w || u.boss ? dmgRange(u) : meleeRange(u);
  const avg = (wDmg[0] + wDmg[1]) / 2;

  // El Diablo siffle ses hommes une fois, au troisième tour
  if (u.ai === 'boss' && B.turn % 3 === 0 && u.calls < 1 && B.units.filter((o) => o.side === u.side && !o.dead).length < 7) {
    return { path: [], act: { kind: 'call' }, then: true };
  }
  // les bêtes et les brutes : au plus près, au contact (ou à portée de fusil)
  if (u.ai === 'beast' || u.ai === 'rusher') {
    let best = null;
    for (const [k, c] of R0) {
      if (c.occ) continue;
      const from = { x: c.x, y: c.y };
      for (const t of foes) {
        let score;
        if (u.ai === 'beast') {
          if (!adjacent(from, t)) { score = -dist(from, t) * 3 - c.d * 0.1; } else score = 100 - t.hp * 0.3 - c.d * 0.1;
        } else {
          const hi = hitInfo(B, u, t, { from });
          score = hi.ok ? 60 + hi.hit * 0.4 - t.hp * 0.2 + (hi.cover ? 0 : 10) : -dist(from, t) * 3;
          score += coverAt(B, from, allFoes) * 4;
        }
        if (!best || score > best.score) best = { score, k, t };
      }
    }
    if (!best) return { path: [], act: null };
    const path = pathTo(R0, best.k);
    const end = path[path.length - 1] || u;
    const t = best.t;
    if (u.ai === 'beast') return { path, act: adjacent(end, t) ? { kind: 'melee', t } : null };
    const hi = hitInfo(B, u, t, { from: end });
    return { path, act: hi.ok ? { kind: 'shoot', t } : null };
  }
  // la dynamite : sur deux membres de la bande ou plus, ou un seul bien à couvert
  if (u.ai === 'grenadier' && u.boomCd <= 0) {
    let best = null;
    for (const [k, c] of R0) {
      if (c.occ) continue;
      for (const t of allFoes) {
        if (Math.hypot(t.x - c.x, t.y - c.y) > ITEMS.dynamite.range + 0.5) continue;
        for (let Y = t.y - 1; Y <= t.y + 1; Y++) for (let X = t.x - 1; X <= t.x + 1; X++) {
          if (!inMap(m, X, Y) || !sees(m, c.x, c.y, X, Y)) continue;
          const hits = allFoes.filter((o) => Math.abs(o.x - X) <= 1 && Math.abs(o.y - Y) <= 1).length;
          const mates = B.units.filter((o) => o.side === u.side && !o.dead && o !== u && Math.abs(o.x - X) <= 1 && Math.abs(o.y - Y) <= 1).length;
          if (Math.abs(c.x - X) <= 1 && Math.abs(c.y - Y) <= 1) continue;
          const sc = hits * 10 - mates * 12 + coverAt(B, c, allFoes) * 2 - c.d * 0.2;
          if (hits && (!best || sc > best.sc)) best = { sc, k, X, Y, hits };
        }
      }
    }
    if (best && (best.hits >= 2 || Math.random() < 0.5)) return { path: pathTo(R0, best.k), act: { kind: 'boom', x: best.X, y: best.Y } };
  }
  // les tireurs : la meilleure case entre le tir espéré et le danger encouru
  let best = null;
  for (const [k, c] of R0) {
    if (c.occ) continue;
    const from = { x: c.x, y: c.y };
    let atk = 0, tgt = null;
    for (const t of foes) {
      const hi = hitInfo(B, u, t, { from, aura });
      if (!hi.ok) continue;
      const ev = (hi.hit / 100) * (1 - hi.esq / 100) * avg * (t.hp <= avg ? 1.6 : 1) * (t.st.affut ? 1.2 : 1);
      if (ev > atk) { atk = ev; tgt = t; }
    }
    let danger = 0;
    for (const f of allFoes) {
      const fw = f.w ? WEAPONS[f.w.id] : null;
      if (!fw) continue;
      const d = Math.hypot(f.x - c.x, f.y - c.y);
      if (d > f.range + f.mv * 0.6) continue;
      const cov = coverOf(m, c.x, c.y, f.x, f.y);
      const seen = sees(m, f.x, f.y, c.x, c.y);
      danger += (seen ? 1 : 0.4) * (cov === 2 ? 0.3 : cov === 1 ? 0.6 : 1) * ((fw.dmg[0] + fw.dmg[1]) / 2);
    }
    const nearest = Math.min(...allFoes.map((f) => Math.hypot(f.x - c.x, f.y - c.y)));
    const want = u.ai === 'sniper' ? 8 : u.range * 0.7;
    const hurt = u.hp < u.max * 0.35 ? 1.6 : 1;
    let score = atk * 1.4 - danger * 0.35 * hurt - Math.abs(nearest - want) * 0.8 - c.d * 0.05;
    if (!tgt) score -= 8 + nearest * 0.6; // rien à tirer d'ici : on se rapproche
    if (!best || score > best.score) best = { score, k, tgt };
  }
  const path = best ? pathTo(R0, best.k) : [];
  // El Diablo tire deux fois un tour sur deux (coup double)
  if (best?.tgt) return { path, act: { kind: 'shoot', t: best.tgt, double: u.ai === 'boss' && B.turn % 2 === 1 } };
  // le tireur embusqué qui ne voit personne guette la direction de la bande
  if (u.ai === 'sniper' || u.ai === 'shooter') {
    const end = path[path.length - 1] || u;
    const t = allFoes.reduce((p, f) => (Math.hypot(f.x - end.x, f.y - end.y) < Math.hypot(p.x - end.x, p.y - end.y) ? f : p));
    if (u.ai === 'sniper' || Math.random() < 0.25) return { path, act: { kind: 'affut', x: t.x, y: t.y } };
  }
  return { path, act: null };
}
// le couvert qu'a la case face à ceux qui la menacent (pour l'IA)
function coverAt(B, c, foes) {
  let s = 0;
  for (const f of foes) s += coverOf(B.map, c.x, c.y, f.x, f.y);
  return foes.length ? s / foes.length : 0;
}
// un lieutenant à 4 cases ou moins : +10 de précision pour ses hommes
export function auraOf(B, u) {
  if (u.side !== 'e') return 0;
  return B.units.some((o) => o !== u && o.side === 'e' && !o.dead && ENEMIES[o.kind].aura && Math.hypot(o.x - u.x, o.y - u.y) <= 4) ? 10 : 0;
}
// L'affût : la première case d'un chemin (ou la case d'où il tire) qu'un guetteur surveille. Renvoie { k, by } ou null.
export function ambushOn(B, mover, path) {
  const watchers = B.units.filter((o) => o.side !== mover.side && alive(o) && o.st.affut);
  if (!watchers.length) return null;
  const steps = path.length ? path : [{ x: mover.x, y: mover.y }];
  for (let k = 0; k < steps.length; k++) {
    const s = steps[k];
    for (const w of watchers) if (w.st.affut.cells.some((c) => c.x === s.x && c.y === s.y)) return { k, by: w };
  }
  return null;
}

// ------------------------------------------------------------ butin
export function lootRoll(R, col, kind = 'combat') {
  const out = { dollars: 0, balles: 0, vivres: 0, fourn: 0, gear: null };
  out.dollars = Math.round((25 + col * 9) * (0.6 + R() * 0.8));
  if (R() < 0.6) out.balles = 5 * randInt(2, 4, R);
  if (R() < 0.25) out.vivres = 1;
  if (R() < 0.3) out.fourn = 1;
  if (kind === 'cache' || R() < 0.33) out.gear = gearRoll(R, col, kind === 'cache' ? 0.3 : 0.12);
  if (kind === 'repaire') { out.dollars += 400; out.gear = gearRoll(R, col, 1); }
  return out;
}
export function gearRoll(R, col, legend = 0.1) {
  const all = [...Object.keys(WEAPONS), ...Object.keys(ARMORS), ...Object.keys(ITEMS)];
  const id = pickR(all, R);
  const q = R() < legend + col * 0.015 ? 2 : R() < 0.3 + col * 0.04 ? 1 : 0;
  return { id, q: ITEMS[id] ? 0 : q };
}
// l'étal d'un comptoir (ou du magasin général au départ)
export function shopStock(R, col, start = false) {
  const out = [];
  const add = (id, q = 0) => out.push({ id, q });
  if (start) {
    ['revolver', 'winchester', 'fusil', 'sharps', 'arc'].forEach((id) => add(id));
    ['duster', 'plastron'].forEach((id) => add(id));
    ['couteau', 'bandages', 'trousse', 'dynamite', 'graisse', 'whisky'].forEach((id) => add(id));
    return out;
  }
  const n = 6 + Math.floor(R() * 3);
  while (out.length < n) {
    const g = gearRoll(R, col, 0.05);
    if (!out.some((o) => o.id === g.id && o.q === g.q)) out.push(g);
  }
  return out;
}

// ------------------------------------------------------------ événements
// need : talent qui ouvre le choix ; cost : ce qu'il coûte d'avance ; out : issues possibles (w : poids), chacune avec
// son texte et ses effets : vivres, balles, fourn, dollars, hp (toute la bande), hurt (un membre au hasard), heal,
// arm (réparation), gear (objet trouvé : 'roll', 'legend' ou { id, q }), xp, fight ('combat', 'coyotes', 'embuscade'),
// first (on frappe en premier), reveal (le territoire se dévoile), recruit (une recrue gratuite)
export const EVENTS = {
  diligence: {
    title: 'LA DILIGENCE RENVERSÉE',
    text: 'Une diligence gît sur le flanc, les chevaux ont fui. Des malles éventrées traînent dans la poussière.',
    choices: [
      { label: 'Fouiller les malles', out: [
        { w: 6, text: 'Des dollars et des cartouches oubliés par les pillards.', fx: { dollars: 60, balles: 15 } },
        { w: 4, text: 'Les pillards étaient encore là, cachés derrière les rochers !', fx: { fight: 'embuscade' } },
      ] },
      { label: 'Remettre la diligence sur ses roues', need: 'costaud', out: [
        { w: 1, text: 'D\'un coup de reins, la diligence repart. Le cocher, caché, vous paie et partage ses vivres.', fx: { dollars: 80, vivres: 2, xp: 20 } },
      ] },
      { label: 'Passer son chemin', out: [{ w: 1, text: 'Pas la peine de risquer une balle perdue. Vous reprenez la piste.', fx: {} }] },
    ],
  },
  poker: {
    title: 'LA PARTIE DE POKER',
    text: 'Autour d\'un feu, trois joueurs de cartes vous invitent à leur table. Les mises sont grosses.',
    choices: [
      { label: 'Plumer ces pigeons', need: 'filou', out: [
        { w: 8, text: 'As dans la manche, sourire en coin : vous ramassez le pot.', fx: { dollars: 140 } },
        { w: 2, text: 'Un joueur repère la carte de trop. Les colts sortent !', fx: { fight: 'combat', first: true } },
      ] },
      { label: 'Jouer honnêtement (40 $)', cost: { dollars: 40 }, out: [
        { w: 5, text: 'Belle main ! Vous doublez la mise et plus encore.', fx: { dollars: 110 } },
        { w: 5, text: 'Ils vous lessivent poliment.', fx: {} },
      ] },
      { label: 'Partager le feu et le café', out: [{ w: 1, text: 'Une nuit au chaud. Tout le monde reprend des forces.', fx: { heal: 12 } }] },
    ],
  },
  puits: {
    title: 'LE PUITS DU DÉSERT',
    text: 'Un puits de pierre au milieu de nulle part. L\'eau sent un peu le soufre.',
    choices: [
      { label: 'Remplir les gourdes', out: [
        { w: 6, text: 'L\'eau est bonne. Vous remplissez tout ce qui peut l\'être.', fx: { vivres: 2 } },
        { w: 4, text: 'Mauvaise eau : la bande passe la nuit à se tordre de douleur.', fx: { hp: -10 } },
      ] },
      { label: 'Suivre les traces des bêtes jusqu\'à la source', need: 'pisteur', out: [
        { w: 1, text: 'Les traces mènent à une source claire, et à un gibier facile.', fx: { vivres: 3, xp: 15 } },
      ] },
      { label: 'Faire bouillir l\'eau', need: 'medecin', out: [
        { w: 1, text: 'Bouillie et filtrée, l\'eau se boit sans risque.', fx: { vivres: 2, xp: 15 } },
      ] },
    ],
  },
  charlatan: {
    title: 'LE MARCHAND D\'ÉLIXIRS',
    text: '« Le Tonique Miraculeux du Professeur Bunsen ! Guérit tout, même la mort ! » Sa roulotte est couverte de fioles.',
    choices: [
      { label: 'Acheter un flacon (30 $)', cost: { dollars: 30 }, out: [
        { w: 5, text: 'Étonnamment, ça marche. Tout le monde se sent revigoré.', fx: { heal: 20 } },
        { w: 5, text: 'Du whisky coupé à la térébenthine. Ouille.', fx: { hurt: 12 } },
      ] },
      { label: 'Démasquer l\'escroc', need: 'medecin', out: [
        { w: 1, text: 'Pris la main dans le sac, il vous cède une vraie trousse pour que vous vous taisiez.', fx: { gear: { id: 'trousse', q: 0 }, xp: 15 } },
      ] },
      { label: 'Le faire déguerpir', need: 'intimidation', out: [
        { w: 1, text: 'Il file en abandonnant une caisse de fournitures.', fx: { fourn: 2, xp: 15 } },
      ] },
      { label: 'Ignorer le boniment', out: [{ w: 1, text: 'Ses cris vous suivent longtemps sur la piste.', fx: {} }] },
    ],
  },
  pont: {
    title: 'LE PONT DE CORDE',
    text: 'Un pont de corde enjambe une gorge vertigineuse. Les planches grincent rien qu\'à les regarder.',
    choices: [
      { label: 'Traverser avec précaution', out: [
        { w: 7, text: 'Pas à pas, tout le monde passe.', fx: {} },
        { w: 3, text: 'Une planche cède : un membre de la bande se rattrape de justesse, une sacoche tombe.', fx: { hurt: 15, balles: -10 } },
      ] },
      { label: 'Passer en premier et tendre une corde', need: 'cassecou', out: [
        { w: 1, text: 'Un saut, une corde, et tout le monde traverse en sécurité.', fx: { xp: 25 } },
      ] },
      { label: 'Faire le grand détour', out: [{ w: 1, text: 'Deux jours de plus dans les rochers.', fx: { vivres: -2 } }] },
    ],
  },
  traces: {
    title: 'LES TRACES D\'EL DIABLO',
    text: 'Des empreintes de fers marqués d\'une fourche : des éclaireurs d\'El Diablo sont passés par ici il y a peu.',
    choices: [
      { label: 'Remonter la piste jusqu\'à leur camp', need: 'pisteur', out: [
        { w: 1, text: 'Leurs traces vous en apprennent long : vous savez maintenant ce qui vous attend.', fx: { reveal: true, xp: 20 } },
      ] },
      { label: 'Leur tendre une embuscade', out: [
        { w: 7, text: 'Ils arrivent sans se douter de rien. À vous de tirer les premiers !', fx: { fight: 'combat', first: true } },
        { w: 3, text: 'Ils vous ont repérés les premiers…', fx: { fight: 'embuscade' } },
      ] },
      { label: 'Effacer ses traces', out: [{ w: 1, text: 'Prudence. Mieux vaut qu\'ils ne vous voient pas venir.', fx: {} }] },
    ],
  },
  comanches: {
    title: 'LES CAVALIERS COMANCHES',
    text: 'Une troupe de chasseurs comanches vous encercle au galop, puis s\'arrête. Leur chef vous observe.',
    choices: [
      { label: 'Parlementer dans leur langue', need: 'polyglotte', out: [
        { w: 1, text: 'Ils détestent El Diablo autant que vous. Ils partagent viande séchée et nouvelles.', fx: { vivres: 3, fourn: 1, reveal: true, xp: 20 } },
      ] },
      { label: 'Offrir des cartouches (15 balles)', cost: { balles: 15 }, out: [
        { w: 1, text: 'Ils acceptent et vous laissent de la viande séchée.', fx: { vivres: 3 } },
      ] },
      { label: 'Passer au large', out: [{ w: 1, text: 'Ils vous escortent du regard jusqu\'à l\'horizon.', fx: {} }] },
    ],
  },
  mine: {
    title: 'LA MINE ABANDONNÉE',
    text: 'Une galerie s\'enfonce dans la colline. Des rails rouillés, une lanterne éteinte, et un silence épais.',
    choices: [
      { label: 'Descendre avec une lanterne', out: [
        { w: 4, text: 'Un ancien coffre de mineur, oublié au fond d\'une galerie.', fx: { gear: 'roll' } },
        { w: 3, text: 'Quelques pépites dans un seau renversé.', fx: { dollars: 90 } },
        { w: 3, text: 'Le plafond s\'effondre ! Un membre de la bande est pris sous les gravats.', fx: { hurt: 18 } },
      ] },
      { label: 'Écouter les murmures de la mine', need: 'esprits', out: [
        { w: 1, text: 'Les voix vous guident vers une niche murée. Ce qui y dort était fait pour vous.', fx: { gear: 'legend', xp: 25 } },
      ] },
      { label: 'Reboucher l\'entrée et repartir', out: [{ w: 1, text: 'Certains trous sont faits pour rester fermés.', fx: {} }] },
    ],
  },
  sherif: {
    title: 'LE SHÉRIF DE BOUE-SÈCHE',
    text: 'Un shérif ventru bloque le gué avec ses adjoints. « Péage : quatre-vingts dollars. Ordre du conseil. » Son étoile est tordue.',
    choices: [
      { label: 'Payer (80 $)', cost: { dollars: 80 }, out: [{ w: 1, text: 'Il empoche l\'argent en souriant. Vous passez.', fx: {} }] },
      { label: 'Le regarder droit dans les yeux', need: 'intimidation', out: [
        { w: 1, text: 'Il blêmit, s\'écarte… et vous offre une boîte de cartouches « pour la route ».', fx: { balles: 20, xp: 20 } },
      ] },
      { label: 'Refuser de payer', out: [
        { w: 1, text: 'Les adjoints dégainent : le shérif est à la solde d\'El Diablo !', fx: { fight: 'combat' } },
      ] },
    ],
  },
  caravane: {
    title: 'LA CARAVANE ATTAQUÉE',
    text: 'Des chariots de colons encerclés par une bande de hors-la-loi. Les colons tiennent à peine.',
    choices: [
      { label: 'Charger à leur secours', out: [
        { w: 1, text: 'Vous prenez les bandits à revers ! Les colons vous couvrent.', fx: { fight: 'combat', first: true, reward: { dollars: 100, fourn: 1 } } },
      ] },
      { label: 'Attendre, puis ramasser les restes', out: [
        { w: 5, text: 'Les bandits partis, vous récupérez ce qu\'ils ont laissé. Vous n\'en êtes pas fiers.', fx: { dollars: 50, balles: 10 } },
        { w: 5, text: 'Les bandits vous ont vus guetter. Ils se retournent contre vous !', fx: { fight: 'embuscade' } },
      ] },
      { label: 'Contourner le combat', out: [{ w: 1, text: 'Un long détour, la conscience lourde.', fx: { vivres: -1 } }] },
    ],
  },
  serpent: {
    title: 'LE SERPENT À SONNETTE',
    text: 'Au bivouac, un crotale mord l\'un de vous à la cheville. La jambe enfle déjà.',
    choices: [
      { label: 'Inciser et aspirer le venin', out: [
        { w: 6, text: 'Le venin sort à temps. Une belle frayeur.', fx: { hurt: 5 } },
        { w: 4, text: 'Trop tard : une nuit de fièvre terrible.', fx: { hurt: 22 } },
      ] },
      { label: 'Soigner la morsure', need: 'medecin', out: [{ w: 1, text: 'Garrot, cataplasme, repos : il s\'en remet sans mal.', fx: { xp: 15 } }] },
      { label: 'Utiliser une fourniture', cost: { fourn: 1 }, out: [{ w: 1, text: 'Un bon pansement et de l\'alcool : ça ira.', fx: {} }] },
    ],
  },
  tempete: {
    title: 'LA TEMPÊTE DE SABLE',
    text: 'Un mur ocre avale l\'horizon. Le vent hurle, le sable fouette les visages.',
    choices: [
      { label: 'Avancer coûte que coûte', out: [{ w: 1, text: 'Vous passez, écorchés et à moitié aveuglés.', fx: { hp: -8 } }] },
      { label: 'Attendre que ça passe', out: [{ w: 1, text: 'Deux jours terrés sous les couvertures.', fx: { vivres: -2 } }] },
      { label: 'Trouver un abri dans les rochers', need: 'pisteur', out: [
        { w: 1, text: 'Une grotte sèche… où quelqu\'un avait caché son magot.', fx: { dollars: 70, xp: 15 } },
      ] },
    ],
  },
  train: {
    title: 'LE TRAIN EN PANNE',
    text: 'Une locomotive fume, immobile, au milieu de la plaine. Le wagon postal est fermé par un gros cadenas.',
    choices: [
      { label: 'Réparer la chaudière', need: 'mecano', out: [
        { w: 1, text: 'Le mécanicien, reconnaissant, vous emmène un bout de chemin et vous paie.', fx: { dollars: 90, vivres: 2, xp: 20 } },
      ] },
      { label: 'Forcer le wagon postal', out: [
        { w: 6, text: 'Des billets et un paquet bien emballé.', fx: { dollars: 150, gear: 'roll' } },
        { w: 4, text: 'Des agents Pinkerton sortent du wagon, fusils pointés !', fx: { fight: 'combat' } },
      ] },
      { label: 'Laisser le train à ses ennuis', out: [{ w: 1, text: 'Le sifflet s\'éloigne derrière vous.', fx: {} }] },
    ],
  },
  chapelle: {
    title: 'LA CHAPELLE EN RUINE',
    text: 'Une petite mission espagnole, à moitié écroulée. Une cloche fêlée pend encore au clocher.',
    choices: [
      { label: 'Se recueillir un moment', out: [{ w: 1, text: 'Un calme étrange vous apaise. Tout le monde se sent mieux.', fx: { heal: 15 } }] },
      { label: 'Lire les inscriptions de l\'autel', need: 'esprits', out: [
        { w: 1, text: 'Les mots anciens indiquent une dalle creuse. Dessous, un objet béni.', fx: { gear: { id: 'fer', q: 0 }, xp: 25 } },
      ] },
      { label: 'Fouiller la crypte', out: [
        { w: 5, text: 'Des offrandes oubliées.', fx: { dollars: 70, fourn: 1 } },
        { w: 5, text: 'Une meute de coyotes y avait sa tanière !', fx: { fight: 'coyotes' } },
      ] },
    ],
  },
  deserteur: {
    title: 'LE DÉSERTEUR',
    text: 'Un soldat en uniforme déchiré vous fait signe. « De l\'eau… et je vous dis où se cachent les hommes d\'El Diablo. »',
    choices: [
      { label: 'Lui donner des vivres', cost: { vivres: 1 }, out: [
        { w: 7, text: 'Il tient parole : il vous dessine le territoire, et vous laisse ses cartouches.', fx: { reveal: true, balles: 15 } },
        { w: 3, text: 'Il file avec vos vivres sans rien dire. Bien joué, l\'ami.', fx: {} },
      ] },
      { label: 'Sentir le piège', need: 'sixieme', out: [
        { w: 1, text: 'Il ment : c\'est un appât. Vous surprenez ses complices dans leur cachette.', fx: { fight: 'combat', first: true, xp: 15 } },
      ] },
      { label: 'Le laisser là', out: [{ w: 1, text: 'Il vous maudit en espagnol.', fx: {} }] },
    ],
  },
  ranch: {
    title: 'LE ROI DU BÉTAIL',
    text: 'Un éleveur à cheval vous hèle. « Des bras solides ? J\'ai un troupeau à marquer avant la nuit. »',
    choices: [
      { label: 'Travailler pour lui', out: [{ w: 1, text: 'Une journée de sueur, payée rubis sur l\'ongle.', fx: { dollars: 70, vivres: -1 } }] },
      { label: 'Maîtriser les taureaux à mains nues', need: 'costaud', out: [
        { w: 1, text: 'L\'éleveur n\'en revient pas. Prime, viande et estime.', fx: { dollars: 90, vivres: 2, xp: 20 } },
      ] },
      { label: 'Lui fourguer de la camelote', need: 'filou', out: [
        { w: 1, text: 'Vous lui vendez trois fois rien au prix fort.', fx: { dollars: 120 } },
      ] },
      { label: 'Décliner', out: [{ w: 1, text: 'Il hausse les épaules et repart au galop.', fx: {} }] },
    ],
  },
};
export const EVENT_IDS = Object.keys(EVENTS);
// tire une issue (pondérée)
export function pickOutcome(choice, R = Math.random) {
  const tot = choice.out.reduce((s, o) => s + o.w, 0);
  let x = R() * tot;
  return choice.out.find((o) => (x -= o.w) <= 0) || choice.out[0];
}
