// Personnages récurrents du mode histoire. look : un personnage de l'éditeur (data.js : ids des parties,
// index des couleurs), dessiné par sprites.js comme ceux des joueurs. voice : babillage des répliques (audio.js).
// color : plaque du nom et bandes des gros plans. Les « troupes » (pool) fournissent les bots adversaires anonymes.

export const CAST = {
  diablo: {
    name: 'El Diablo', short: 'El Diablo', voice: 'talkLo', color: '#e04838', role: 'Le grand méchant',
    look: { skin: 3, hat: 'sombrero', hatColor: 7, hair: 'long', hairColor: 0, eyes: 'patch', eyeColor: 0, nose: 'hooked', mouth: 'cigar', beard: 'handlebar', outfit: 'poncho', outfitColor: 0, extra: 'scar' },
  },
  bart: {
    name: 'Black Bart', short: 'Black Bart', voice: 'talkLo', color: '#a8a8b8', role: 'Lieutenant d’El Diablo',
    look: { skin: 3, hat: 'cowboy', hatColor: 7, hair: 'messy', hairColor: 0, eyes: 'angry', eyeColor: 0, nose: 'broken', mouth: 'smirk', beard: 'stubble', outfit: 'duster', outfitColor: 7, extra: 'scar' },
  },
  rosa: {
    name: 'Rosa Calderón', short: 'Rosa', voice: 'talkHi', color: '#f0907a', role: 'Patronne du Buckshot Saloon',
    look: { skin: 2, hat: 'none', hatColor: 0, hair: 'bun', hairColor: 0, eyes: 'lashes', eyeColor: 1, nose: 'small', mouth: 'lipstick', beard: 'none', outfit: 'vest', outfitColor: 10, extra: 'earring' },
  },
  pike: {
    name: 'Shérif Amos Pike', short: 'Shérif Pike', voice: 'talkMid', color: '#f8d070', role: 'Shérif de Dusty Gulch',
    look: { skin: 0, hat: 'cowboy', hatColor: 1, hair: 'short', hairColor: 6, eyes: 'tired', eyeColor: 2, nose: 'big', mouth: 'frown', beard: 'walrus', outfit: 'sheriff', outfitColor: 1, extra: 'none' },
  },
  joe: {
    name: 'Le Vieux Joe', short: 'Vieux Joe', voice: 'talkMid', color: '#d8a850', role: 'Prospecteur',
    look: { skin: 1, hat: 'coonskin', hatColor: 1, hair: 'messy', hairColor: 7, eyes: 'squint', eyeColor: 0, nose: 'red', mouth: 'gap', beard: 'prospector', outfit: 'overalls', outfitColor: 3, extra: 'none' },
  },
  bison: {
    name: 'Le Grand Bison', short: 'Grand Bison', voice: 'talkLo', color: '#c2643e', role: 'Champion de boxe',
    // comme dans la bagarre (bagarre.js) : le colosse barbu, coiffe à cornes et peau de bison
    look: { skin: 2, hat: 'horns', hatColor: 1, hair: 'messy', hairColor: 1, eyes: 'angry', eyeColor: 0, nose: 'broken', mouth: 'grin', beard: 'full', outfit: 'fur', outfitColor: 1, extra: 'none' },
  },
  ines: {
    name: 'Sœur Inès', short: 'Sœur Inès', voice: 'talkHi', color: '#e8e0cc', role: 'Ancienne pistolera, mission San Rosario',
    look: { skin: 3, hat: 'none', hatColor: 7, hair: 'bob', hairColor: 0, eyes: 'glasses', eyeColor: 1, nose: 'small', mouth: 'neutral', beard: 'none', outfit: 'suit', outfitColor: 7, extra: 'medal' },
  },
  hollister: {
    name: 'Capitaine Hollister', short: 'Cpt. Hollister', voice: 'talkMid', color: '#7ab0f0', role: 'Commandant du Fort Saint-Jude',
    look: { skin: 6, hat: 'cavalry', hatColor: 3, hair: 'short', hairColor: 3, eyes: 'normal', eyeColor: 2, nose: 'long', mouth: 'neutral', beard: 'imperial', outfit: 'sheriff', outfitColor: 3, extra: 'scar' },
  },
  charlie: {
    name: 'Charlie le Furet', short: 'Charlie', voice: 'talkHi', color: '#b8e070', role: 'Indic insaisissable',
    look: { skin: 0, hat: 'bowler', hatColor: 10, hair: 'curly', hairColor: 2, eyes: 'wink', eyeColor: 3, nose: 'snub', mouth: 'toothpick', beard: 'none', outfit: 'plaid', outfitColor: 10, extra: 'freckles' },
  },
  // Personnages secondaires du « Filon du Diable »
  vipere: {
    name: 'Lupe « la Vipère » Ortega', short: 'La Vipère', voice: 'talkHi', color: '#c890f0', role: 'Pistolera d’El Diablo',
    look: { skin: 2, hat: 'gambler', hatColor: 7, hair: 'braids', hairColor: 8, eyes: 'lashes', eyeColor: 3, nose: 'small', mouth: 'smirk', beard: 'none', outfit: 'bandolier', outfitColor: 6, extra: 'mole' },
  },
  crowe: {
    name: 'Silas Crowe', short: 'Silas Crowe', voice: 'talkLo', color: '#8d8780', role: 'Croque-mort de Boot Hill',
    look: { skin: 6, hat: 'tophat', hatColor: 7, hair: 'slick', hairColor: 8, eyes: 'tired', eyeColor: 4, nose: 'long', mouth: 'neutral', beard: 'chops', outfit: 'suit', outfitColor: 7, extra: 'bolo' },
  },
  mccoy: {
    name: 'Ma McCoy', short: 'Ma McCoy', voice: 'talkMid', color: '#d06a2a', role: 'Matriarche du Ranch McCoy',
    look: { skin: 1, hat: 'straw', hatColor: 0, hair: 'ponytail', hairColor: 7, eyes: 'squint', eyeColor: 2, nose: 'round', mouth: 'pipe', beard: 'none', outfit: 'plaid', outfitColor: 0, extra: 'scarf' },
  },
};

// Troupes : adversaires anonymes des épisodes (bots). Chaque bot prend un nom de la liste ; son allure est tirée
// de la graine (looks : quelques traits imposés, le reste au hasard).
export const POOLS = {
  bandit: {
    names: ['Pedro le Borgne', 'Slim Jim', 'Le Crotale', 'Mad Dog Mike', 'Gros Bill', 'Tex la Gâchette', 'El Zopilote', 'Cactus Jack', 'Sam Six-Coups', 'La Fouine'],
    look: { outfitColor: 7, hatColor: 7 },
  },
  rancher: {
    names: ['Billy McCoy', 'Ma McCoy', 'Jed McCoy', 'Cousin Hank', 'Lulu McCoy'],
    look: { hat: 'straw', outfit: 'plaid' },
  },
  soiffard: {
    names: ['Pancho', 'Doc Whisky', 'Big Lou', 'Le Belge', 'Molly Mousse', 'Old Tom'],
    look: { nose: 'red' },
  },
  soldat: {
    names: ['Sergent Kowalski', 'Caporal Dunn', 'Soldat Mills', 'Clairon Petey', 'Lieutenant Gray'],
    look: { hat: 'kepi', outfitColor: 3, hatColor: 3 },
  },
  chasseur: {
    names: ['Le Vautour', 'Dakota Kid', 'Mama Kane', 'Le Fossoyeur', 'Two-Guns Lee', 'La Veuve Noire'],
    look: { outfit: 'duster' },
  },
  // novices de la mission San Rosario (escorte de la roulotte)
  novice: {
    names: ['Frère Tobias', 'Sœur Marta', 'Frère Anselme', 'Sœur Pilar', 'Petit Mateo'],
    look: { hat: 'none', outfit: 'suit', outfitColor: 11 },
  },
  // la garde personnelle d'El Diablo (hacienda)
  diablero: {
    names: ['El Cuchillo', 'Chuy Calavera', 'Paco Dinamita', 'La Sombra', 'El Gringo Loco', 'Hermano Vega', 'El Tuerto'],
    look: { hat: 'sombrero', outfit: 'poncho', outfitColor: 7, hatColor: 0 },
  },
};
