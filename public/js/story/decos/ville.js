// Décors des épisodes du mode histoire, groupe « ville » : épisode (id d'episodes.js ou de jobs.js) -> réglages lus par
// la scène du mini-jeu (hooks.story.deco), pour que le mini-jeu se joue dans le lieu et au moment de l'histoire.
//   roulette (room.js)  room : salle imposée ('buckshot' : le Buckshot Saloon ; 'bouche' : la table du Diable au bord
//                       du cratère), env : l'heure (env.js), puisque ces épisodes n'en imposent pas
//   fusillade (shooter) variant : abords et repaire imposés à l'arbitre (worlds.js SHOOTER_STORY : 'gulch', 'joe') ;
//                       signs : enseignes renommées dans la grand-rue ; town : nom de la gare et du panneau d'entrée
//   Charlie             fair : la ville un jour de foire, avec ce texte sur la banderole
//   duel                set : décor du mode histoire en fond (story/sets), cam : sa position, vultures : vautours
export const DECOS = {
  // ---------------------------------------------------------------- acte I : Dusty Gulch
  'roulette-bart': { room: 'buckshot', env: 'nuit' }, // le Buckshot Saloon, à minuit
  'fusillade-rue': { variant: 'gulch', signs: { SALOON: 'BUCKSHOT SALOON' } }, // El Diablo au balcon du Buckshot
  'fusillade-surprise': { variant: 'gulch', signs: { SALOON: 'BUCKSHOT SALOON' } },
  'charlie-foire': { fair: 'FOIRE DE DUSTY GULCH' },
  'boothill-duel': { set: 'boothill', cam: 110, vultures: true }, // les tertres et l'arbre mort, au soleil couchant
  // ---------------------------------------------------------------- primes
  'job-abords': { variant: 'joe', town: 'RED ROCK' }, // de la gare de Red Rock jusqu'au fond de la mine du Vieux Joe
  // ---------------------------------------------------------------- acte IV : la Bouche de l'Enfer, à l'aube
  'final-duel': { set: 'bouche', cam: 40 }, // El Diablo dos au gouffre d'or
  'final-duel-2': { set: 'bouche', cam: 40 },
  'final-roulette': { room: 'bouche', env: 'aube' },
  'final-roulette-2': { room: 'bouche', env: 'aube' },
};
