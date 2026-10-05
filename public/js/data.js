// Définitions partagées : options du personnage, objets, palettes.

// Les couleurs sont stockées par index dans les personnages sauvegardés : on n'ajoute qu'en fin de liste.
export const SKIN = ['#f7d7b5', '#eab78e', '#d19a6a', '#ad7346', '#7f4f2c', '#56331d', '#fbe3cf', '#c58a5c', '#6a4026', '#3f2516'];
export const HAIR_COLORS = [
  '#32261e', '#4a2c18', '#8a5428', '#c99a52', '#ecd79a', '#a8381c', '#8d8780', '#ece6da',
  '#14121a', '#6a3a1a', '#d06a2a', '#b8a888',
];
export const CLOTH_COLORS = [
  '#7a2a1e', '#3d2a1c', '#c26a2a', '#2f4a5e', '#4a5a2a', '#d9c49a', '#5a2a4a', '#2a2622',
  '#b08a30', '#2a5a5a', '#a83a3a', '#e8e0cc', '#6a6a72', '#3a2a5e',
];
export const EYE_COLORS = ['#1a0f0a', '#6a3e1e', '#3a6aa8', '#3f7a3a', '#7a8088', '#a07a2a'];

export const CHAR_PARTS = [
  { key: 'hat', label: 'Chapeau', options: [
    ['none', 'Aucun'], ['cowboy', 'Stetson'], ['sombrero', 'Sombrero'], ['bowler', 'Melon'],
    ['tophat', 'Haut-de-forme'], ['gambler', 'Plat de joueur'], ['bandana', 'Bandana'], ['coonskin', 'Toque de trappeur'],
    ['feather', 'Stetson à plume'], ['straw', 'Chapeau de paille'], ['cavalry', 'Chapeau de cavalerie'], ['kepi', 'Képi'],
  ] },
  { key: 'hair', label: 'Cheveux', options: [
    ['bald', 'Chauve'], ['short', 'Courts'], ['long', 'Longs'], ['ponytail', 'Queue de cheval'],
    ['curly', 'Bouclés'], ['messy', 'En bataille'], ['mullet', 'Nuque longue'],
    ['slick', 'Gominés'], ['sidepart', 'Mèche'], ['bob', 'Carré'], ['braids', 'Tresses'],
    ['bun', 'Chignon'], ['afro', 'Afro'], ['mohawk', 'Crête'],
  ] },
  { key: 'eyes', label: 'Yeux', options: [
    ['normal', 'Normaux'], ['squint', 'Plissés'], ['wide', 'Écarquillés'], ['angry', 'Furieux'],
    ['tired', 'Fatigués'], ['patch', 'Cache-œil'], ['wink', "Clin d'œil"], ['lashes', 'Cils de velours'],
    ['glasses', 'Lunettes rondes'], ['shades', 'Lunettes noires'], ['monocle', 'Monocle'],
  ] },
  { key: 'nose', label: 'Nez', options: [
    ['small', 'Petit'], ['big', 'Gros'], ['hooked', 'Crochu'], ['round', 'Rond'], ['red', 'Rouge (whisky)'], ['broken', 'Cassé'],
    ['long', 'Long'], ['snub', 'Retroussé'], ['wide', 'Épaté'], ['ring', 'Anneau'], ['plaster', 'Pansement'],
  ] },
  { key: 'mouth', label: 'Bouche', options: [
    ['neutral', 'Neutre'], ['smile', 'Sourire'], ['frown', 'Moue'], ['grin', 'Dent en or'],
    ['cigar', 'Cigarillo'], ['toothpick', 'Cure-dent'], ['smirk', 'Rictus'], ['open', 'Bouche bée'],
    ['gap', 'Dent manquante'], ['lipstick', 'Rouge à lèvres'], ['pipe', 'Pipe'], ['straw', 'Brin de paille'],
  ] },
  { key: 'beard', label: 'Moustache / barbe', options: [
    ['none', 'Rasé'], ['stubble', 'Barbe de 3 jours'], ['mustache', 'Moustache'], ['handlebar', 'Guidon'],
    ['horseshoe', 'Fer à cheval'], ['goatee', 'Bouc'], ['full', 'Barbe fournie'], ['chops', 'Rouflaquettes'],
    ['pencil', 'Fine moustache'], ['walrus', 'Morse'], ['imperial', 'Impériale'], ['chinstrap', 'Collier'],
    ['prospector', 'Barbe de prospecteur'],
  ] },
  { key: 'outfit', label: 'Tenue', options: [
    ['shirt', 'Chemise'], ['vest', 'Gilet'], ['poncho', 'Poncho'], ['duster', 'Cache-poussière'], ['sheriff', 'Étoile de shérif'],
    ['plaid', 'Chemise à carreaux'], ['suit', 'Costume'], ['overalls', 'Salopette'], ['fringe', 'Veste à franges'],
    ['bandolier', 'Cartouchière'],
  ] },
  { key: 'extra', label: 'Détail', options: [
    ['none', 'Aucun'], ['scarf', 'Foulard'], ['bolo', 'Cravate-ficelle'], ['earring', "Boucle d'oreille"],
    ['freckles', 'Taches de rousseur'], ['scar', 'Balafre'], ['mole', 'Grain de beauté'], ['medal', 'Médaille'],
  ] },
];

export const CHAR_COLORS = [
  { key: 'skin', label: 'Peau', colors: SKIN },
  { key: 'hairColor', label: 'Cheveux & barbe', colors: HAIR_COLORS },
  { key: 'eyeColor', label: 'Yeux', colors: EYE_COLORS },
  { key: 'hatColor', label: 'Chapeau & foulard', colors: CLOTH_COLORS },
  { key: 'outfitColor', label: 'Tenue', colors: CLOTH_COLORS },
];

// Le chapeau de paille garde sa couleur de paille : la couleur choisie ne teinte que son ruban.
export const STRAW = '#d8b860';
export const hatColorOf = (c = {}) => (c.hat === 'straw' ? STRAW : CLOTH_COLORS[c.hatColor] || CLOTH_COLORS[1]);

// Pour les petits sprites (cavaliers, duellistes) : ce qui se voit sous le nez et sur le menton.
export const beardHasMustache = (b) => ['mustache', 'handlebar', 'horseshoe', 'pencil', 'walrus', 'imperial'].includes(b);
export const beardHasChin = (b) => ['full', 'goatee', 'chops', 'chinstrap', 'imperial', 'prospector'].includes(b);

export function randomCharacter() {
  const r = (n) => Math.floor(Math.random() * n);
  const c = {};
  for (const p of CHAR_PARTS) c[p.key] = p.options[r(p.options.length)][0];
  for (const p of CHAR_COLORS) c[p.key] = r(p.colors.length);
  return c;
}

export const ITEMS = {
  spyglass: { name: 'Longue-vue', desc: 'Regarde la cartouche dans la chambre.' },
  cigar: { name: 'Cigare', desc: 'Rend 1 point de vie.' },
  whisky: { name: 'Whisky', desc: 'Actionne la pompe : éjecte la cartouche actuelle.' },
  saw: { name: 'Scie', desc: 'Scie le canon : le prochain tir fait 2 dégâts.' },
  cuffs: { name: 'Menottes', desc: "L'adversaire passe son prochain tour." },
  telegraph: { name: 'Télégramme', desc: 'Révèle une cartouche au hasard plus loin dans le fusil.' },
  coin: { name: 'Pièce truquée', desc: 'Inverse la cartouche actuelle (rouge ↔ blanche).' },
  remedy: { name: 'Élixir de charlatan', desc: '50 % : +2 PV. 50 % : -1 PV.' },
  lasso: { name: 'Lasso', desc: "Vole un objet de l'adversaire et l'utilise aussitôt." },
  horseshoe: { name: 'Fer à cheval', desc: 'Porte-bonheur : la prochaine balle qui te touche ne fait aucun dégât.' },
  ace: { name: 'As dans la manche', desc: 'Pioche deux objets au hasard.' },
  derringer: { name: 'Derringer', desc: "Un coup de pistolet de poche : 50 % de chances d'infliger 1 dégât à l'adversaire." },
};
