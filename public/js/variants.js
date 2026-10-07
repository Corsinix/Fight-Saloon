// Variantes (abords, région, carte, salle…) que l'hôte peut imposer depuis le lobby, en format « Un jeu ».
// null (« Aléatoire ») : tirée de la graine, comme avant. La roue et le championnat tirent toujours au hasard.
// L'arbitre met la variante dans l'état (view().variant) : chaque navigateur reconstruit le même monde.
import { EDGES, LASSO_BIOME_NAMES, FORT_MAPS, COURSE_VARIANTS, RTS_BIOMES } from './worlds.js';
import { ROOM_NAMES } from './room.js';

const list = (o, name = (v) => v) => Object.entries(o).map(([id, v]) => ({ id, name: name(v) }));

// label : intitulé du choix dans le lobby ; any : nom du choix par défaut (tiré de la graine)
export const VARIANTS = {
  shooter: { label: 'Abords', list: list(EDGES, (e) => e.name) },
  lasso: { label: 'Parcours', any: 'Le grand tour', list: list(LASSO_BIOME_NAMES) },
  fort: { label: 'Champ de bataille', list: list(FORT_MAPS, (m) => m.name) },
  pinte: { label: 'Salle', list: list(ROOM_NAMES) },
  course: { label: 'Terrain', list: list(COURSE_VARIANTS) },
  rts: { label: 'Carte', list: list(RTS_BIOMES, (b) => b.name) },
};

export const variantOk = (mode, id) => !!VARIANTS[mode]?.list.some((v) => v.id === id);
export const variantName = (mode, id) => VARIANTS[mode]?.list.find((v) => v.id === id)?.name || null;
