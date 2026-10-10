// Décors des épisodes du mode histoire, groupe « batailles » : épisode (id d'episodes.js ou de jobs.js) -> réglages lus par
// la scène du mini-jeu (hooks.story.deco), pour que le mini-jeu se joue dans le lieu et au moment de l'histoire.
// variant : imposée à l'arbitre de l'hôte (variants.js ; « mode:carte » pour la mêlée, cartes story de brawlmaps/).
//   fort    sign : enseigne clouée sur la palissade ; flags : drapeau de chaque équipe (0 : la bande, 1 : les rivaux),
//           'fort' (fanion de la cavalerie) ou 'diablo' (drapeau noir au crâne) ; cannons : canons aux meurtrières
//   rts     camps : nombre de bivouacs de l'armée d'El Diablo peints sur la carte ; env : heure si l'épisode n'en a pas
//   fps     map : carte imposée (fpsmaps/ : pueblo = San Miguel) ; hacienda : le village devient l'hacienda d'El Diablo
//           (murs ocre, bannières au crâne) ; volcano : la Bouche de l'Enfer fume au nord du ciel
const PUEBLO = { map: 'pueblo' };
const HACIENDA = { map: 'pueblo', hacienda: true, volcano: true };

export const DECOS = {
  // ACTE III — la guerre du désert
  'fort-assaut': { variant: 'riviere', sign: 'FORT SAINT-JUDE', flags: ['fort', 'diablo'], cannons: true },
  'mission-colline': { variant: 'colline:mission-clocher' }, // le parvis, l'église et son clocher, le cloître
  'mission-ruines': { variant: 'prime:mission-cendres' }, // la même mission, calcinée
  'salines-gemmes': { variant: 'gemmes:salines-tresor' }, // sel blanc, saumure, chariots du trésor
  'plaine-rts': { variant: 'prairie', camps: 6, env: 'aube' }, // « au lever du jour », les feux de camp d'El Diablo
  'pueblo-chasseurs': PUEBLO,
  'pueblo-vipere': PUEBLO,
  'pueblo-paye': PUEBLO,
  'pueblo-vipere-seule': PUEBLO,
  'job-tournoi': { variant: 'manches:pueblo-place' }, // la place du pueblo, son puits
  'job-mortouvif': PUEBLO,
  // ACTE IV — l'hacienda
  'hacienda-fps': HACIENDA,
  'hacienda-nuit': HACIENDA,
  'hacienda-renforts': HACIENDA,
};
