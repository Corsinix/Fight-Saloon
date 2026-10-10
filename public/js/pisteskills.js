// Arbre d'expérience de « La piste » : chaque passage de niveau donne un point de compétence, que l'on place dans
// l'arbre du personnage pour débloquer un bonus ou une compétence. Trois branches de quatre crans (on débloque un cran
// quand le précédent de la même branche est pris), et au sommet la maîtrise du talent du personnage (il faut un cran 3).
// Sans navigateur : pistekit.js lit les bonus (statsOf), piste.js applique les compétences en combat.

// fx : bonus de caractéristiques (hp, arm : armure maximale, mv, prec, esq, crit, dmg, cran, range) ou compétence
// (skill : 'oeil' le demi-couvert ne protège plus ses cibles, 'souffle' un coup mortel le laisse à 1 PV une fois par
// combat, 'riposte' il rend un tir quand on lui tire dessus, une fois par tour, 'maitrise' son talent coûte 1 cran de moins)
export const BRANCHES = {
  tir: {
    name: 'TIREUR', col: '#e8604c', icon: 'viseur',
    nodes: [
      { id: 't1', short: '+10 précision', name: 'MAIN SÛRE', icon: 'viseur', text: '+10 de précision : mieux toucher une cible à couvert', fx: { prec: 10 } },
      { id: 't2', short: '+1 portée', name: 'BON ŒIL', icon: 'longuevue', text: '+1 case de portée', fx: { range: 1 } },
      { id: 't3', short: '+10 % critiques', name: 'COUP MORTEL', icon: 'crit', text: '+10 % de coups critiques (× 1,5)', fx: { crit: 10 } },
      { id: 't4', short: 'Demi-couvert ignoré', name: 'ŒIL DE LYNX', icon: 's_mark', text: 'Compétence : le demi-couvert ne protège plus ses cibles', fx: { skill: 'oeil' } },
    ],
  },
  dur: {
    name: 'DUR À CUIRE', col: '#9ad060', icon: 'coeur',
    nodes: [
      { id: 'd1', short: '+10 PV', name: 'CUIR ÉPAIS', icon: 'coeur', text: '+10 PV maximum', fx: { hp: 10 } },
      { id: 'd2', short: '+4 armure', name: 'BLINDÉ', icon: 'armure', text: '+4 d\'armure maximale (avec une armure portée)', fx: { arm: 4 } },
      { id: 'd3', short: '+1 cran', name: 'SANG-FROID', icon: 'cran', text: '+1 de cran maximal, et un de plus au début des combats', fx: { cran: 1 } },
      { id: 'd4', short: 'Survit à 1 PV', name: 'SECOND SOUFFLE', icon: 's_shield', text: 'Compétence : une fois par combat, un coup mortel le laisse à 1 PV', fx: { skill: 'souffle' } },
    ],
  },
  vif: {
    name: 'ÉCLAIREUR', col: '#7ab0f0', icon: 'botte',
    nodes: [
      { id: 'v1', short: '+1 déplacement', name: 'PIED LÉGER', icon: 'botte', text: '+1 case de déplacement par tour', fx: { mv: 1 } },
      { id: 'v2', short: '+8 % esquive', name: 'INSAISISSABLE', icon: 'esquive', text: '+8 % d\'esquive', fx: { esq: 8 } },
      { id: 'v3', short: '+3 dégâts', name: 'FINE GÂCHETTE', icon: 'revolver', text: '+3 dégâts à chaque coup', fx: { dmg: 3 } },
      { id: 'v4', short: 'Rend les tirs', name: 'RIPOSTE', icon: 'double', text: 'Compétence : rend un tir quand on lui tire dessus (une fois par tour)', fx: { skill: 'riposte' } },
    ],
  },
};
export const BRANCH_IDS = Object.keys(BRANCHES);
export const MASTERY = { id: 'm1', short: 'Talent : -1 cran', name: 'MAÎTRISE', icon: 'cran', text: 'Son talent coûte 1 cran de moins (1 au moins)', fx: { skill: 'maitrise' } };
const NODE = {};
for (const b of BRANCH_IDS) BRANCHES[b].nodes.forEach((n, i) => { NODE[n.id] = { ...n, branch: b, tier: i }; });
NODE.m1 = { ...MASTERY, branch: null, tier: 4 };
export const nodeOf = (id) => NODE[id] || null;

// les crans pris par un membre (tableau d'ids) ; les points gagnés : un par niveau au-delà du premier
export const owned = (m) => (m.tree || []);
export const pointsOf = (m) => Math.max(0, (m.lvl || 1) - 1 - owned(m).length);
// peut-on prendre ce cran ? renvoie null, ou la raison
export function whyNot(m, id) {
  const n = NODE[id], own = owned(m);
  if (!n) return 'INCONNU';
  if (own.includes(id)) return 'DÉJÀ APPRIS';
  if (n.tier === 4) { if (!own.some((o) => NODE[o]?.tier >= 2)) return 'IL FAUT UN CRAN 3 DANS UNE BRANCHE'; }
  else if (n.tier > 0 && !own.includes(BRANCHES[n.branch].nodes[n.tier - 1].id)) return 'IL FAUT LE CRAN PRÉCÉDENT';
  if (pointsOf(m) <= 0) return 'PAS DE POINT À DÉPENSER';
  return null;
}
export function learn(m, id) {
  if (whyNot(m, id)) return false;
  (m.tree ||= []).push(id);
  return true;
}
// la somme des bonus de l'arbre d'un membre, et ses compétences
export function treeFx(m) {
  const out = { hp: 0, arm: 0, mv: 0, prec: 0, esq: 0, crit: 0, dmg: 0, cran: 0, range: 0, skills: [] };
  for (const id of owned(m)) {
    const fx = NODE[id]?.fx || {};
    for (const [k, v] of Object.entries(fx)) if (k === 'skill') out.skills.push(v); else out[k] += v;
  }
  return out;
}
