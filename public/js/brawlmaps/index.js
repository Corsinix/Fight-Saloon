// Cartes de « La mêlée » (vue de dessus, brawl.js / brawlgame.js), dessinées à la main, un fichier par mode de jeu.
// Chaque carte a son environnement (décor, buissons, eau…) ; on n'en dessine qu'une partie, le reste est tiré
// par symétrie pour que personne ne parte avantagé :
// - quad (chacun pour soi : survie, colline, prime) : 31 × 21 cases, on dessine le quart haut-gauche
//   (16 colonnes × 11 lignes, la colonne 15 et la ligne 10 sont celles du milieu), recopié en miroir sur les deux axes ;
// - half (en équipes : gemmes, manches) : 33 × 19 cases, on dessine la moitié gauche (17 colonnes × 19 lignes,
//   la colonne 16 est celle du milieu), recopiée par demi-tour autour du centre (l'équipe de droite a la même carte
//   que celle de gauche, retournée). La moitié basse de la colonne du milieu est tirée de sa moitié haute.
// Légende : . sol · , chemin (sol, décor seulement : piste, rails, neige tassée…) · # mur infranchissable
// x caisse, tonneau (bloque, cassé par certaines super-attaques) · * buisson (on s'y cache) · ~ eau (bloque
// le passage, pas les balles) · S départ (sol) · P coffre à poudre (chacun pour soi : se casse et lâche une fiole de puissance).
import SURVIE from './survie.js';
import COLLINE from './colline.js';
import PRIME from './prime.js';
import GEMMES from './gemmes.js';
import MANCHES from './manches.js';

export const BRAWL_MAPS = { survie: SURVIE, colline: COLLINE, prime: PRIME, gemmes: GEMMES, manches: MANCHES };
export const MAP_SYM = { survie: 'quad', colline: 'quad', prime: 'quad', gemmes: 'half', manches: 'half' };
export const MAP_DIM = { quad: [31, 21], half: [33, 19] };
// environnements : nom affiché (le décor est dans brawlart.js)
export const BRAWL_ENVS = {
  desert: 'DÉSERT', foret: 'FORÊT', prairie: 'PRAIRIE', mine: 'MINE DE GEMMES', canyon: 'CANYON', neige: 'MONTAGNE ENNEIGÉE',
};
export const mapName = (m) => `${BRAWL_ENVS[m.env] || m.env} - ${m.name}`;

// Carte complète : rows (h chaînes de w caractères)
export function expandMap(mode, m) {
  const sym = MAP_SYM[mode];
  const [w, h] = MAP_DIM[sym];
  const src = m.rows;
  const at = (x, y) => (src[y] && src[y][x]) || '#';
  const rows = [];
  for (let y = 0; y < h; y++) {
    let s = '';
    for (let x = 0; x < w; x++) {
      if (sym === 'quad') s += at(x < 16 ? x : w - 1 - x, y < 11 ? y : h - 1 - y);
      else if (x < 16) s += at(x, y);
      else if (x === 16) s += at(16, y <= 9 ? y : h - 1 - y);
      else s += at(w - 1 - x, h - 1 - y);
    }
    rows.push(s);
  }
  return { id: m.id, env: m.env, name: m.name, w, h, rows };
}

export const mapList = (mode) => BRAWL_MAPS[mode] || [];
export const findMap = (mode, id) => mapList(mode).find((m) => m.id === id) || null;
