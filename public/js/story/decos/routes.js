// Décors des épisodes du mode histoire, groupe « routes » : épisode (id d'episodes.js ou de jobs.js) -> réglages lus par
// la scène du mini-jeu (hooks.story.deco), pour que le mini-jeu se joue dans le lieu et au moment de l'histoire.
// set : le décor, peint par public/js/routesdeco.js (chargé à la demande, seulement en mode histoire) ; la variante
// de l'épisode ne change pas (le parcours, la piste, la salle restent ceux de l'arbitre).
export const DECOS = {
  // ---------------------------------------------------------------- le lasso (lasso.js)
  // l'arche « RANCH McCOY », la grange rouge au fer des McCoy, les enclos que Bart a ouverts
  'ranch-lasso': { set: 'mccoy' },
  // les buttes et les aiguilles de Red Rock à l'horizon, la ville et sa voie ferrée
  'job-betail': { set: 'redrock' },

  // ---------------------------------------------------------------- la course (course.js, coursewild.js)
  // l'hippodrome de Red Rock : les buttes, la ville et son arche, les tribunes à enseignes, les réclames de la lice
  'hippo-course': { set: 'redrock' },
  // la Grande Prairie : la chaîne du nord, les collines dorées, les peupliers, le troupeau et la clôture des McCoy,
  // l'arrivée au gué
  'chevauchee-bart': { set: 'prairie' },
  'chevauchee-mccoy': { set: 'prairie' },
  // les gorges rouges sous l'orage : parois de grès, sentinelles et leurs feux sur les crêtes, l'écriteau de l'hacienda
  'canyon-chevauchee': { set: 'gorges' },

  // ---------------------------------------------------------------- la roulotte (wagon.js, trail.js)
  // de Red Rock à la Mission San Rosario : la croix rouge sur la bâche, les croix du chemin, la mission au bout
  'roulotte-ines': { set: 'mission' },

  // ---------------------------------------------------------------- la mine (mine.js)
  // la galerie huit du Vieux Joe : planches peintes, « GALERIE 8 », et dehors le chevalement et la dynamite de Bart
  'mine-joe': { set: 'joe' },

  // ---------------------------------------------------------------- la pinte (pinte.js ; salles de room.js)
  // Le Dernier Verre : son enseigne, « RED ROCK » au fronton de l'étagère, El Diablo sur l'avis de recherche
  'verre-pinte': { set: 'verre' },
  // le Buckshot de Rosa (salle « buckshot » de room.js) : son enseigne et le portrait de la patronne
  'job-tournee': { room: 'buckshot', set: 'buckshot' },
  // le bureau du shérif Pike : la plaque, l'étoile de Dusty Gulch, El Diablo parmi les avis de recherche
  'job-cellule': { set: 'pike' },

  // ---------------------------------------------------------------- la bagarre (bagarre.js)
  // l'arène de Red Rock la nuit : ciel étoilé et buttes, cage de planches, lanternes, torches, ardoises des paris
  'arene-bison': { set: 'arene' },
};
