// Décors des cinématiques du mode histoire (joués par stage.js) : un fichier par décor dans story/sets/, réunis ici. Chaque décor est dessiné une fois dans des
// canvas hors écran (lointain en parallaxe, fond, accessoires triés en profondeur avec les acteurs), puis recopié ;
// seuls les éléments animés (flammes, fumée, drapeau, or qui scintille…) sont redessinés à chaque image.
// Le ciel vient de l'ambiance (env.js) et n'est pas teinté ; tout le reste passe par le calque teinté de l'Ambience.
//
// Un décor : { w (largeur, ≥ 384 : la caméra le parcourt), horizon, ground (sol des acteurs), outdoor,
//   far: [{ k (parallaxe 0..1), draw(g, w) }], back(g, w), props: [{ x, y (profondeur), draw(R, O, g) … }],
//   lights: [[x, y, w, h] fenêtre | [x, y, r] lanterne], anim(ctx, t, fx, el) (coordonnées du décor),
//   light(ctx, t, fx, lt) (feux et lumières vives NON teintés, mais derrière les acteurs : flammes la nuit),
//   glow(ctx, t, fx, amb) (lumières ajoutées après la teinte), cross: [x, y] (une des trois croix, fx 'croix') }
// fx : liste d'effets du décor (cut.fx / beat.fx) : 'feu', 'fumee', 'vent', 'croix', 'breche', 'eboulement', 'chapeau',
//   'train' (redrock : le train entre en gare), 'lettre' (gare : la lettre clouée), 'tombe' (fort : drapeau d'El Diablo
//   hissé), 'sombrero' (bouche : son chapeau au bord du gouffre), 'regne' (rue : ses bannières aux balcons),
//   'brasier' (quai : Dusty Gulch en flammes au loin)…
import * as S from '../sprites.js';
import { W, H } from '../worlds.js';
import { skyDeco } from '../env.js';
import { bands, halo, legendCross, flames, smoke } from './sets/kit.js';
import rue from './sets/rue.js';
import saloon from './sets/saloon.js';
import desert from './sets/desert.js';
import boothill from './sets/boothill.js';
import redrock from './sets/redrock.js';
import gare from './sets/gare.js';
import quai from './sets/quai.js';
import mine from './sets/mine.js';
import fort from './sets/fort.js';
import mission from './sets/mission.js';
import canyon from './sets/canyon.js';
import hacienda from './sets/hacienda.js';
import bouche from './sets/bouche.js';
import riviere from './sets/riviere.js';
import noir from './sets/noir.js';

export { halo, legendCross, flames, smoke };

// ---------------------------------------------------------------- les décors
export const SETS = { rue, saloon, desert, boothill, redrock, gare, quai, mine, fort, mission, canyon, hacienda, bouche, riviere, noir };



// ---------------------------------------------------------------- cache
const built = new Map();
// Décor prêt à dessiner : canvas du lointain, du fond et des accessoires (une fois par décor)
export function getSet(id) {
  let s = built.get(id);
  if (s) return s;
  const def = SETS[id] || SETS.noir;
  const w = Math.max(W, def.w || W);
  const back = S.makeCanvas(w, H);
  def.back?.call(def, back.getContext('2d'), w);
  const far = (def.far || []).map((f) => {
    const fw = Math.round(W + (w - W) * f.k);
    const c = S.makeCanvas(fw, H);
    f.draw.call(def, c.getContext('2d'), fw);
    return { k: f.k, c };
  });
  const props = (def.props || []).map((p) => {
    const c = S.makeCanvas(p.w, p.h, true);
    p.draw(c.getContext('2d', { willReadFrequently: true }));
    return { x: p.x, y: p.y, top: p.y - p.oy, c };
  });
  s = { id, def, w, back, far, props, lights: def.lights ? def.lights.call(def) : [] };
  built.set(id, s);
  return s;
}

// Ciel d'une ambiance pour un horizon donné (dessiné une fois)
const skies = new Map();
export function skyFor(env, horizon) {
  const key = `${env.id || 'midi'}|${horizon}`;
  let c = skies.get(key);
  if (c) return c;
  c = S.makeCanvas(W, H);
  const g = c.getContext('2d');
  bands(g, 0, 0, W, horizon + 4, env.sky || ['#d4ae7e', '#dcb98a', '#e3c697', '#ebd2a5', '#f0dcb0']);
  skyDeco(env, 0.72, 0.32)(g, 0, 0, W, horizon);
  if (skies.size > 16) { for (const old of skies.values()) S.freeCanvas(old); skies.clear(); }
  skies.set(key, c);
  return c;
}
