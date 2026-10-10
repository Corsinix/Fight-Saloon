// Le graphe de l'aventure : actes, lieux de la carte, fins. Données seulement (le moteur : engine.js).
// Carte : coordonnées en pixels de l'écran (384 × 216), lieux sur la carte illustrée de mapview.js.
// Un lieu : { act, name, place, x, y, icon, script, set / env (décor et ambiance des dialogues : story/sets.js, env.js ;
//   par défaut d'après le jeu du lieu), fx (effets du décor) et fxAfter (seulement une fois cette cinématique vue), unlock (condition : s'ouvre seul), lockIf, optional, repeat,
//   requires: ['jeu'] (lieu caché si le jeu manque), fallback: 'lieu' (montré à sa place), fallbackOnly, board }
// Une fin : { title, cut, music, when } — la première dont la condition passe est choisie par { ending: 'auto' }.
//
// Drapeaux de l'histoire (posés par les scripts, lus par les conditions) :
//   alliés : rosa, bison, ines, hollister, joe, charlie (campaign.allies)
//   croix1, croix2, croix3 : croix (ou calque) entre les mains de la bande ; diabloCarte : croix livrées au Rapt
//   saloonPerdu (Buckshot perdu à l'acte I), foirePerdue (Boot Hill obligatoire), vipereVaincue, ruePerdue,
//   diabloBlesse (El Diablo touché : seconde chance en finale), pisteBart, bartFuit (chevauchée à faire), mccoy,
//   roulottePerdue (mission brûlée), otageRosa / otageJoe (le Rapt), charlieParti (Charlie piste les ravisseurs),
//   verreRefus (défi du Dernier Verre décliné), surprise (hacienda prise à revers), fortTombe, armeeDispersee, chasseursDiablo, puebloFait, diabloVaincu.

export const CAMPAIGN = {
  id: 'diablo',
  version: 1,
  title: 'LE FILON DU DIABLE',
  start: 'gulch-saloon',
  // drapeaux des alliés gagnés en route (comptés pour la fin, retirent un rival par épisode : allyMods)
  allies: ['rosa', 'bison', 'ines', 'hollister', 'joe', 'charlie'],
  acts: {
    1: { title: 'ACTE I', sub: 'DUSTY GULCH BRÛLE', cut: 'acte1', music: 'story-act' },
    2: { title: 'ACTE II', sub: 'LA PISTE DES TROIS CROIX', cut: 'acte2', music: 'story-act' },
    3: { title: 'ACTE III', sub: 'LA GUERRE DU DÉSERT', cut: 'acte3', music: 'story-act' },
    4: { title: 'ACTE IV', sub: 'LA BOUCHE DE L’ENFER', cut: 'acte4', music: 'story-act' },
  },
  // régions de la carte (fond dessiné par mapview.js), révélées acte par acte
  regions: {
    gulch: { name: 'DUSTY GULCH', act: 1, x: 84, y: 154 },
    prairie: { name: 'GRANDE PRAIRIE', act: 2, x: 156, y: 86 },
    redrock: { name: 'RED ROCK', act: 2, x: 226, y: 142 },
    mine: { name: 'MINE DU VIEUX JOE', act: 2, x: 264, y: 46 },
    mission: { name: 'SAN ROSARIO', act: 2, x: 206, y: 186 },
    fort: { name: 'FORT SAINT-JUDE', act: 3, x: 74, y: 58 },
    plaine: { name: 'GRANDE PLAINE', act: 3, x: 214, y: 90 },
    pueblo: { name: 'PUEBLO', act: 3, x: 294, y: 122 },
    salines: { name: 'LES SALINES', act: 3, x: 296, y: 176 },
    canyon: { name: 'LE CANYON', act: 4, x: 344, y: 110 },
    hacienda: { name: 'BOUCHE DE L’ENFER', act: 4, x: 352, y: 40 },
  },
  nodes: {
    // ---------------------------------------------------------------- Acte I : Dusty Gulch brûle
    'gulch-saloon': { act: 1, name: 'Le Buckshot Saloon', place: 'DUSTY GULCH', x: 96, y: 160, icon: 'roulette', repeat: true, board: true, script: 'gulch-saloon' },
    'gulch-rue': { act: 1, name: 'La Grand-rue', place: 'DUSTY GULCH', x: 128, y: 142, icon: 'shooter', script: 'gulch-rue' },
    'gulch-foire': { act: 1, name: 'Le Champ de foire', place: 'DUSTY GULCH', x: 72, y: 134, icon: 'charlie', script: 'gulch-foire' },
    // obligatoire si la foire est perdue (la gare l'exige), optionnel sinon ; se ferme en quittant la ville
    'gulch-boothill': { act: 1, name: 'Boot Hill', place: 'DUSTY GULCH', x: 44, y: 124, icon: 'duel', optional: true,
      lockIf: { act: { gte: 2 } }, links: ['gulch-foire'], script: 'gulch-boothill' },
    'gulch-gare': { act: 1, name: 'La Gare', place: 'DUSTY GULCH', x: 116, y: 182, icon: 'wagon', links: ['gulch-saloon'],
      unlock: { all: [{ done: 'gulch-rue' }, { done: 'gulch-foire' }, { any: [{ done: 'gulch-boothill' }, '!foirePerdue'] }] },
      set: 'quai', env: 'nuit', fx: ['brasier'], fxAfter: 'gulch-brule', script: 'gulch-gare' },

    // ---------------------------------------------------------------- Acte II : la piste des trois croix
    'ranch-mccoy': { act: 2, name: 'Le Ranch McCoy', place: 'GRANDE PRAIRIE', x: 140, y: 80, icon: 'lasso', optional: true,
      // se ferme quand le Grand Prix est réglé (course gagnée, ou chevauchée faite) : ses chevaux ne servent qu'à ça
      lockIf: { any: [{ act: { gte: 3 } }, { all: [{ done: 'redrock-hippo' }, '!bartFuit'] }] }, links: ['redrock-hippo'], script: 'ranch-mccoy' },
    'redrock-hippo': { act: 2, name: 'L’Hippodrome', place: 'RED ROCK', x: 206, y: 142, icon: 'course', links: ['gulch-gare'], script: 'redrock-hippo' },
    // ouverte seulement si Bart a gagné le Grand Prix
    'redrock-chevauchee': { act: 2, name: 'La Chevauchée sauvage', place: 'GRANDE PRAIRIE', x: 180, y: 104, icon: 'course',
      links: ['redrock-hippo'], set: 'desert', script: 'redrock-chevauchee' },
    'redrock-verre': { act: 2, name: 'Le Dernier Verre', place: 'RED ROCK', x: 238, y: 124, icon: 'pinte', repeat: true, board: true,
      links: ['redrock-hippo'], script: 'redrock-verre' },
    'redrock-arene': { act: 2, name: 'L’Arène', place: 'RED ROCK', x: 224, y: 164, icon: 'bagarre', optional: true,
      unlock: { done: 'redrock-hippo' }, lockIf: { act: { gte: 3 } }, links: ['redrock-hippo'], script: 'redrock-arene' },
    'route-roulotte': { act: 2, name: 'La Route de la mission', place: 'SAN ROSARIO', x: 172, y: 184, icon: 'wagon',
      links: ['redrock-arene'], script: 'route-roulotte' },
    'mine-joe': { act: 2, name: 'La Mine du Vieux Joe', place: 'MONTAGNES', x: 262, y: 44, icon: 'mine', links: ['redrock-verre'], script: 'mine-joe' },
    // fin d'acte : le Rapt, quand les trois croix ont trouvé preneur
    'redrock-nuit': { act: 2, name: 'La Gare de Red Rock', place: 'RED ROCK', x: 254, y: 150, icon: 'roulette', links: ['redrock-verre'],
      unlock: { all: [{ done: 'redrock-hippo' }, { done: 'route-roulotte' }, { done: 'mine-joe' }, '!bartFuit'] },
      set: 'gare', env: 'nuit', script: 'redrock-nuit' },

    // ---------------------------------------------------------------- Acte III : la guerre du désert
    'fort-saintjude': { act: 3, name: 'Le Fort Saint-Jude', place: 'LA RIVIÈRE', x: 72, y: 56, icon: 'fort', script: 'fort-saintjude' },
    'mission': { act: 3, name: 'La Mission San Rosario', place: 'SAN ROSARIO', x: 206, y: 186, icon: 'melee', links: ['route-roulotte'], set: 'mission', script: 'mission' },
    'plaine': { act: 3, name: 'La Grande Plaine', place: 'GRANDE PLAINE', x: 214, y: 90, icon: 'rts', optional: true,
      unlock: { done: 'fort-saintjude' }, lockIf: { any: [{ act: { gte: 4 } }, { done: 'salines' }] }, links: ['redrock-verre'], script: 'plaine' },
    'salines': { act: 3, name: 'Les Salines', place: 'LES SALINES', x: 296, y: 174, icon: 'melee', optional: true,
      unlock: { done: 'mission' }, lockIf: { any: [{ act: { gte: 4 } }, { done: 'plaine' }] }, links: ['mission'], set: 'desert', env: 'midi', script: 'salines' },
    // fin d'acte ; reste ouvert ensuite pour son tableau des primes
    'pueblo': { act: 3, name: 'Le Pueblo des chasseurs', place: 'PUEBLO', x: 294, y: 122, icon: 'fpsdm', repeat: true, board: true,
      unlock: { all: [{ done: 'fort-saintjude' }, { done: 'mission' }] }, links: ['redrock-verre', 'salines'], script: 'pueblo' },

    // ---------------------------------------------------------------- Acte IV : la Bouche de l'Enfer
    // la piste (jeu long) si elle est chargeable, sinon une chevauchée sauvage ; facultative avec les galeries de Joe
    'canyon-piste': { act: 4, name: 'La Piste du canyon', place: 'LE CANYON', x: 340, y: 106, icon: 'piste', requires: ['piste'],
      fallback: 'canyon-chevauchee', lockIf: { done: 'hacienda' }, links: ['pueblo'], set: 'canyon', script: 'canyon-piste' },
    'canyon-chevauchee': { act: 4, name: 'Les Gorges du canyon', place: 'LE CANYON', x: 340, y: 106, icon: 'course', fallbackOnly: true,
      links: ['pueblo'], set: 'canyon', script: 'canyon-chevauchee' },
    'hacienda': { act: 4, name: 'L’Hacienda del Diablo', place: 'HACIENDA', x: 342, y: 54, icon: 'fps',
      unlock: { any: ['joe', { done: 'canyon-piste' }, { done: 'canyon-chevauchee' }] }, links: ['canyon-piste'], set: 'hacienda', env: 'crepuscule', script: 'hacienda' },
    'bouche': { act: 4, name: 'La Bouche de l’Enfer', place: 'LE VOLCAN', x: 366, y: 28, icon: 'duel', links: ['hacienda'], set: 'bouche', env: 'aube', script: 'bouche' },
  },
  // Le réseau des routes (dessinées en terre battue sur la carte, suivies par la bande quand elle voyage) :
  // les rues de Dusty Gulch, la route du nord (ranch, fort), la ligne de Red Rock, la route du sud (roulotte, mission),
  // la piste de la mine, la route de l'est (pueblo, salines, canyon) et le chemin de l'hacienda.
  roads: [
    ['gulch-saloon', 'gulch-rue'], ['gulch-saloon', 'gulch-foire'], ['gulch-foire', 'gulch-boothill'], ['gulch-saloon', 'gulch-gare'],
    ['gulch-rue', 'ranch-mccoy'], ['gulch-boothill', 'fort-saintjude'], ['ranch-mccoy', 'fort-saintjude'],
    ['ranch-mccoy', 'redrock-chevauchee'], ['redrock-chevauchee', 'redrock-hippo'], ['gulch-gare', 'redrock-hippo'],
    ['redrock-hippo', 'redrock-verre'], ['redrock-hippo', 'redrock-arene'], ['redrock-verre', 'redrock-nuit'], ['redrock-arene', 'redrock-nuit'],
    ['gulch-gare', 'route-roulotte'], ['redrock-arene', 'route-roulotte'], ['route-roulotte', 'mission'],
    ['redrock-verre', 'plaine'], ['plaine', 'mine-joe'], ['ranch-mccoy', 'plaine'],
    ['redrock-nuit', 'pueblo'], ['pueblo', 'salines'], ['mission', 'salines'],
    ['pueblo', 'canyon-piste'], ['canyon-piste', 'hacienda'], ['mine-joe', 'hacienda'], ['hacienda', 'bouche'],
  ],
  endings: {
    // El Diablo vaincu, épargné, avec au moins trois alliés à ses côtés
    legende: { title: 'LA LÉGENDE DES BUCKSHOTS', cut: 'fin-legende', music: 'story-end-good',
      when: { all: ['diabloVaincu', { allies: { gte: 3 } }, { not: { choice: ['clemence', 'tomber'] } }] } },
    // El Diablo vaincu, mais trop seuls, ou laissé tomber dans le filon
    cendres: { title: 'POUSSIÈRE ET OR MAUDIT', cut: 'fin-cendres', music: 'story-end-bitter', when: 'diabloVaincu' },
    // la finale perdue
    regne: { title: 'LE RÈGNE DU DIABLE', cut: 'fin-regne', music: 'story-end-bad', when: true },
  },
};
