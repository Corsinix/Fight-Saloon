// Définitions partagées : options du personnage, objets, palettes.

export const SKIN = ['#f7d7b5', '#eab78e', '#d19a6a', '#ad7346', '#7f4f2c', '#56331d'];
export const HAIR_COLORS = ['#32261e', '#4a2c18', '#8a5428', '#c99a52', '#ecd79a', '#a8381c', '#8d8780', '#ece6da'];
export const CLOTH_COLORS = ['#7a2a1e', '#3d2a1c', '#c26a2a', '#2f4a5e', '#4a5a2a', '#d9c49a', '#5a2a4a', '#2a2622'];

export const CHAR_PARTS = [
  { key: 'hat', label: 'Chapeau', options: [
    ['none', 'Aucun'], ['cowboy', 'Stetson'], ['sombrero', 'Sombrero'], ['bowler', 'Melon'],
    ['tophat', 'Haut-de-forme'], ['gambler', 'Plat de joueur'], ['bandana', 'Bandana'], ['coonskin', 'Toque de trappeur'],
  ] },
  { key: 'hair', label: 'Cheveux', options: [
    ['bald', 'Chauve'], ['short', 'Courts'], ['long', 'Longs'], ['ponytail', 'Queue de cheval'],
    ['curly', 'Bouclés'], ['messy', 'En bataille'], ['mullet', 'Nuque longue'],
  ] },
  { key: 'eyes', label: 'Yeux', options: [
    ['normal', 'Normaux'], ['squint', 'Plissés'], ['wide', 'Écarquillés'], ['angry', 'Furieux'],
    ['tired', 'Fatigués'], ['patch', 'Cache-œil'],
  ] },
  { key: 'nose', label: 'Nez', options: [
    ['small', 'Petit'], ['big', 'Gros'], ['hooked', 'Crochu'], ['round', 'Rond'], ['red', 'Rouge (whisky)'], ['broken', 'Cassé'],
  ] },
  { key: 'mouth', label: 'Bouche', options: [
    ['neutral', 'Neutre'], ['smile', 'Sourire'], ['frown', 'Moue'], ['grin', 'Dent en or'],
    ['cigar', 'Cigarillo'], ['toothpick', 'Cure-dent'],
  ] },
  { key: 'beard', label: 'Moustache / barbe', options: [
    ['none', 'Rasé'], ['stubble', 'Barbe de 3 jours'], ['mustache', 'Moustache'], ['handlebar', 'Guidon'],
    ['horseshoe', 'Fer à cheval'], ['goatee', 'Bouc'], ['full', 'Barbe fournie'], ['chops', 'Rouflaquettes'],
  ] },
  { key: 'outfit', label: 'Tenue', options: [
    ['shirt', 'Chemise'], ['vest', 'Gilet'], ['poncho', 'Poncho'], ['duster', 'Cache-poussière'], ['sheriff', 'Étoile de shérif'],
  ] },
];

export const CHAR_COLORS = [
  { key: 'skin', label: 'Peau', colors: SKIN },
  { key: 'hairColor', label: 'Cheveux & barbe', colors: HAIR_COLORS },
  { key: 'hatColor', label: 'Chapeau', colors: CLOTH_COLORS },
  { key: 'outfitColor', label: 'Tenue', colors: CLOTH_COLORS },
];

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
