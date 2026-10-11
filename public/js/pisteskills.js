// Arbres d'expérience de « La piste », un par classe (comme les métiers d'Empire of Sin) : chaque passage de niveau donne
// un point de compétence, que l'on place dans l'arbre du personnage pour débloquer un bonus ou une compétence. Trois
// branches de quatre crans propres à sa classe (on débloque un cran quand le précédent de la même branche est pris), et
// au sommet la maîtrise de son talent (il faut un cran 3). Sans navigateur : pistekit.js lit les bonus (statsOf),
// piste.js applique les compétences en combat.

// fx : bonus de caractéristiques (hp, arm : armure maximale, mv, prec, esq, crit, dmg, cran, range, init : initiative,
// nerve : sang-froid contre la panique, tough : part des dégâts encaissée en moins, uses : un usage d'objet de plus par
// combat) ou compétence (skill, voir SKILLS)
export const SKILLS = {
  oeil: 'le demi-couvert ne protège plus ses cibles',
  souffle: 'une fois par combat, un coup mortel le laisse à 1 PV',
  riposte: 'il rend un tir quand on lui tire dessus (une fois par manche)',
  maitrise: 'son talent coûte 1 cran de moins',
  gachette: 'gâchette sensible : quand un allié tombe sous 25 % de PV, il tire sur l\'agresseur (une fois par manche)',
  enchaine: 'enchaînement : abattre un ennemi lui rend 1 PA (une fois par tour)',
  boucher: 'boucher : toutes ses victimes tombent d\'un coup brutal (panique alentour)',
  sangfroid: 'inébranlable : il ne panique jamais',
  medic: 'médecin de campagne : ses soins rendent 50 % de plus',
  boom: 'artificière : ses explosions font 10 dégâts de plus',
  fantome: 'fantôme : après une victime, il se fond dans le décor',
  chasseur: 'chasseresse : +25 % de dégâts sur une cible marquée ou prise de flanc',
  meneur: 'meneur d\'hommes : les alliés à 4 cases ou moins ont +10 de précision',
  vigie: 'sentinelle : ses tirs de guet n\'ont pas de malus',
};

// les crans tout faits, réutilisés d'une classe à l'autre
const N = {
  prec: { name: 'MAIN SÛRE', icon: 'viseur', short: '+10 précision', text: '+10 de précision : mieux toucher une cible à couvert', fx: { prec: 10 } },
  range: { name: 'BON ŒIL', icon: 'longuevue', short: '+1 portée', text: '+1 case de portée', fx: { range: 1 } },
  crit: { name: 'COUP MORTEL', icon: 'crit', short: '+10 % critiques', text: '+10 % de coups critiques (× 1,5)', fx: { crit: 10 } },
  dmg: { name: 'FINE GÂCHETTE', icon: 'revolver', short: '+3 dégâts', text: '+3 dégâts à chaque coup', fx: { dmg: 3 } },
  hp: { name: 'CUIR ÉPAIS', icon: 'coeur', short: '+10 PV', text: '+10 PV maximum', fx: { hp: 10 } },
  hp15: { name: 'CARCASSE', icon: 'coeur', short: '+15 PV', text: '+15 PV maximum', fx: { hp: 15 } },
  arm: { name: 'BLINDÉ', icon: 'armure', short: '+4 armure', text: '+4 d\'armure maximale (avec une armure portée)', fx: { arm: 4 } },
  cran: { name: 'SANG-FROID', icon: 'cran', short: '+1 cran', text: '+1 de cran maximal, et un de plus au début des combats', fx: { cran: 1 } },
  mv: { name: 'PIED LÉGER', icon: 'botte', short: '+1 déplacement', text: '+1 case de déplacement (zone bleue)', fx: { mv: 1 } },
  esq: { name: 'INSAISISSABLE', icon: 'esquive', short: '+8 % esquive', text: '+8 % d\'esquive', fx: { esq: 8 } },
  init: { name: 'PREMIER À DÉGAINER', icon: 's_affut', short: '+4 initiative', text: '+4 d\'initiative : il joue plus tôt dans la manche', fx: { init: 4 } },
  nerve: { name: 'NERFS D\'ACIER', icon: 's_shield', short: '+20 sang-froid', text: '+20 de sang-froid : panique bien moins souvent', fx: { nerve: 20 } },
  tough: { name: 'PEAU DE BUFFLE', icon: 'armure', short: '-10 % de dégâts', text: 'Encaisse 10 % de dégâts en moins', fx: { tough: 0.1 } },
  uses: { name: 'BESACE PLEINE', icon: 'trousse', short: '+1 usage d\'objet', text: 'Son objet sert une fois de plus à chaque combat', fx: { uses: 1 } },
  // compétences
  oeil: { name: 'ŒIL DE LYNX', icon: 's_mark', short: 'Demi-couvert ignoré', fx: { skill: 'oeil' } },
  souffle: { name: 'SECOND SOUFFLE', icon: 's_shield', short: 'Survit à 1 PV', fx: { skill: 'souffle' } },
  riposte: { name: 'RIPOSTE', icon: 'double', short: 'Rend les tirs', fx: { skill: 'riposte' } },
  gachette: { name: 'GÂCHETTE SENSIBLE', icon: 'revolver', short: 'Couvre les blessés', fx: { skill: 'gachette' } },
  enchaine: { name: 'ENCHAÎNEMENT', icon: 'xp', short: 'Victime : +1 PA', fx: { skill: 'enchaine' } },
  boucher: { name: 'BOUCHER', icon: 'couteau', short: 'Victimes brutales', fx: { skill: 'boucher' } },
  sangfroid: { name: 'INÉBRANLABLE', icon: 's_shield', short: 'Jamais de panique', fx: { skill: 'sangfroid' } },
  medic: { name: 'MÉDECIN DE CAMPAGNE', icon: 'trousse', short: 'Soins +50 %', fx: { skill: 'medic' } },
  boom: { name: 'ARTIFICIÈRE', icon: 'dynamite', short: 'Explosions +10', fx: { skill: 'boom' } },
  fantome: { name: 'FANTÔME', icon: 's_ghost', short: 'Victime : invisible', fx: { skill: 'fantome' } },
  chasseur: { name: 'CHASSERESSE', icon: 'arc', short: '+25 % sur proie', fx: { skill: 'chasseur' } },
  meneur: { name: 'MENEUR D\'HOMMES', icon: 'ralliement', short: 'Alliés +10 préc.', fx: { skill: 'meneur' } },
  vigie: { name: 'SENTINELLE', icon: 's_affut', short: 'Guet sans malus', fx: { skill: 'vigie' } },
};
for (const n of Object.values(N)) if (n.fx.skill && !n.text) n.text = `Compétence : ${SKILLS[n.fx.skill]}`;

// les arbres : par classe, trois branches [clé, nom, couleur, icône, quatre crans]
const T = (key, name, col, icon, nodes) => ({ key, name, col, icon, nodes });
const TREES = {
  chef: { name: 'CHEF DE BANDE', branches: [
    T('meneur', 'MENEUR', '#f8c048', 'ralliement', [N.prec, N.cran, N.init, N.meneur]),
    T('dur', 'DUR À CUIRE', '#9ad060', 'coeur', [N.hp, N.arm, N.nerve, N.souffle]),
    T('tir', 'FINE GÂCHETTE', '#e8604c', 'viseur', [N.range, N.crit, N.dmg, N.gachette]),
  ] },
  gamin: { name: 'PISTOLERO', branches: [
    T('vif', 'VIF-ARGENT', '#7ab0f0', 'botte', [N.mv, N.init, N.esq, N.enchaine]),
    T('gachette', 'GÂCHETTE', '#e8604c', 'revolver', [N.prec, N.crit, N.dmg, N.gachette]),
    T('cassecou', 'CASSE-COU', '#9ad060', 'coeur', [N.hp, N.cran, N.esq, N.riposte]),
  ] },
  doc: { name: 'MÉDECIN', branches: [
    T('chirurgien', 'CHIRURGIEN', '#9ad060', 'trousse', [N.hp, N.uses, N.cran, N.medic]),
    T('calme', 'SANG-FROID', '#7ab0f0', 's_shield', [N.nerve, N.arm, N.esq, N.souffle]),
    T('tir', 'TIREUR', '#e8604c', 'viseur', [N.prec, N.range, N.dmg, N.oeil]),
  ] },
  martha: { name: 'COSTAUDE', branches: [
    T('roc', 'ROC', '#9ad060', 'armure', [N.hp15, N.arm, N.tough, N.souffle]),
    T('bouchere', 'BOUCHÈRE', '#e8604c', 'couteau', [N.dmg, N.crit, N.mv, { ...N.boucher, name: 'BOUCHÈRE' }]),
    T('poule', 'MÈRE POULE', '#f8c048', 'coeur', [N.nerve, N.cran, N.prec, N.riposte]),
  ] },
  reverend: { name: 'TIREUR D\'ÉLITE', branches: [
    T('precheur', 'PRÉDICATEUR', '#e8604c', 'viseur', [N.prec, N.range, N.crit, N.oeil]),
    T('foi', 'LA FOI', '#f8c048', 'cran', [N.nerve, N.hp, N.cran, N.sangfroid]),
    T('vigie', 'VIGIE', '#7ab0f0', 's_affut', [N.init, N.esq, N.dmg, N.vigie]),
  ] },
  tala: { name: 'PISTEUSE', branches: [
    T('chasse', 'CHASSERESSE', '#e8604c', 'arc', [N.prec, N.range, N.dmg, N.chasseur]),
    T('eclaireuse', 'ÉCLAIREUSE', '#7ab0f0', 'botte', [N.mv, N.init, N.esq, N.enchaine]),
    T('esprit', 'ESPRIT LIBRE', '#9ad060', 'coeur', [N.hp, N.cran, N.nerve, N.riposte]),
  ] },
  rosita: { name: 'ARTIFICIÈRE', branches: [
    T('poudre', 'POUDRE', '#f8a040', 'dynamite', [N.uses, N.cran, N.dmg, N.boom]),
    T('tete', 'TÊTE BRÛLÉE', '#9ad060', 'coeur', [N.hp, N.arm, N.esq, N.souffle]),
    T('tir', 'FINE GÂCHETTE', '#e8604c', 'viseur', [N.prec, N.crit, N.range, N.gachette]),
  ] },
  silas: { name: 'ASSASSIN', branches: [
    T('ombre', 'OMBRE', '#a890d8', 's_ghost', [N.esq, N.mv, N.init, N.fantome]),
    T('lame', 'LAME', '#e8604c', 'couteau', [N.dmg, N.crit, N.prec, N.boucher]),
    T('survie', 'SURVIE', '#9ad060', 'coeur', [N.hp, N.cran, N.nerve, N.enchaine]),
  ] },
  omalley: { name: 'SOLDAT', branches: [
    T('veteran', 'VÉTÉRAN', '#9ad060', 'armure', [N.hp, N.arm, N.nerve, N.sangfroid]),
    T('sentinelle', 'SENTINELLE', '#7ab0f0', 's_affut', [N.prec, N.range, N.init, N.vigie]),
    T('sergent', 'SERGENT', '#f8c048', 'ralliement', [N.cran, N.dmg, N.crit, N.meneur]),
  ] },
};
export const MASTERY = { id: 'm1', short: 'Talent : -1 cran', name: 'MAÎTRISE', icon: 'cran', text: 'Son talent coûte 1 cran de moins (1 au moins)', fx: { skill: 'maitrise' } };

// chaque cran a son identifiant : classe_branche + rang (« gamin_vif2 ») ; NODE les retrouve tous
const NODE = {};
for (const [cls, t] of Object.entries(TREES)) {
  t.branches = t.branches.map((b) => ({ ...b, nodes: b.nodes.map((n, i) => ({ ...n, id: `${cls}_${b.key}${i + 1}` })) }));
  for (const b of t.branches) b.nodes.forEach((n, i) => { NODE[n.id] = { ...n, cls, branch: b.key, tier: i }; });
}
NODE.m1 = { ...MASTERY, cls: null, branch: null, tier: 4 };
export const nodeOf = (id) => NODE[id] || null;
// l'arbre d'un membre (celui de sa classe)
export const treeOf = (m) => TREES[m.id] || TREES.chef;
// compatibilité : les branches du chef
export const BRANCH_IDS = [0, 1, 2];
export const BRANCHES = TREES.chef.branches;

// les crans pris par un membre (ceux de sa classe seulement : ceux d'une ancienne version de l'arbre sont rendus) ;
// les points gagnés : un par niveau au-delà du premier
const mine = (m, id) => id === 'm1' || NODE[id]?.cls === (TREES[m.id] ? m.id : 'chef');
export const owned = (m) => (m.tree || []).filter((id) => mine(m, id));
export const pointsOf = (m) => Math.max(0, (m.lvl || 1) - 1 - owned(m).length);
// peut-on prendre ce cran ? renvoie null, ou la raison
export function whyNot(m, id) {
  const n = NODE[id], own = owned(m);
  if (!n || !mine(m, id)) return 'INCONNU';
  if (own.includes(id)) return 'DÉJÀ APPRIS';
  if (n.tier === 4) { if (!own.some((o) => NODE[o]?.tier >= 2)) return 'IL FAUT UN CRAN 3 DANS UNE BRANCHE'; }
  else if (n.tier > 0 && !own.includes(`${n.cls}_${n.branch}${n.tier}`)) return 'IL FAUT LE CRAN PRÉCÉDENT';
  if (pointsOf(m) <= 0) return 'PAS DE POINT À DÉPENSER';
  return null;
}
export function learn(m, id) {
  if (whyNot(m, id)) return false;
  m.tree = owned(m);
  m.tree.push(id);
  return true;
}
// la somme des bonus de l'arbre d'un membre, et ses compétences
export function treeFx(m) {
  const out = { hp: 0, arm: 0, mv: 0, prec: 0, esq: 0, crit: 0, dmg: 0, cran: 0, range: 0, init: 0, nerve: 0, tough: 0, uses: 0, skills: [] };
  for (const id of owned(m)) {
    const fx = NODE[id]?.fx || {};
    for (const [k, v] of Object.entries(fx)) if (k === 'skill') out.skills.push(v); else out[k] += v;
  }
  return out;
}
