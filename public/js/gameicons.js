// Icônes pixel art des jeux (cartes du menu solo). Une lettre = une couleur, '.' = transparent.
import { makeCanvas } from './sprites.js';

const PAL = {
  k: '#1a0f0a', w: '#f4ecd8', s: '#e2dccd', S: '#a39a88', g: '#8a8f98', G: '#c9ced6', d: '#4a4f58',
  y: '#e0b040', Y: '#f8e08a', o: '#a06a20', b: '#7a4a24', B: '#a8703c', n: '#4a2a14',
  r: '#c0392b', R: '#e8604c', m: '#7a1a14', a: '#d9822b', A: '#f2b25a', u: '#3a6ec0', U: '#7ab0f0',
  p: '#eadcb0', P: '#c8b480',
};

const GRIDS = {
  // une cartouche rouge, une blanche
  roulette: [
    '.kkkk...kkkk.',
    'kRRrmk.kwssSk',
    'kRrrmk.kwssSk',
    'kRrrmk.kwssSk',
    'kRrrmk.kwssSk',
    'kRrrmk.kwssSk',
    'kkkkkk.kkkkkk',
    'kYyyok.kYyyok',
    'kooook.kooook',
    'kkkkkk.kkkkkk',
  ],
  shooter: [
    '...kkkkkkkkkkk',
    '..kGGGGGGGGGGk',
    '.kkgggggggggdk',
    'kGGGGkkkkkkkk.',
    'kgddgkdk......',
    'kkddkk.dk.....',
    '.kBBk.kk......',
    '.kBBnk........',
    'kBBnnk........',
    'kBnnk.........',
    'kkkk..........',
  ],
  lasso: [
    '...kkkkkk...',
    '.kkppppppkk.',
    'kppkkkkkkppk',
    'kpk......kpk',
    'kppkk..kkppk',
    '.kkppkkppkk.',
    '...kkPPkk...',
    '.....kPk....',
    '....kpk.....',
    '...kpk......',
    '..kpk.......',
    '..kk........',
  ],
  // le chrono du plus rapide à dégainer
  duel: [
    '....kkkk....',
    '....kyyk....',
    '..kkkyykkk..',
    '.kyyyyyyyyk.',
    'kyywwwkwwyyk',
    'kywwwwkwwwyk',
    'kywwwwkkkwyk',
    'kywwwwwwwwyk',
    'kyywwwwwwyyk',
    '.kyyyyyyyyk.',
    '..kkkkkkkk..',
  ],
  charlie: [
    '..kkkk......',
    '.kGGGGk.....',
    'kGUUUUGk....',
    'kGUwUUGk....',
    'kGwUUUGk....',
    'kGUUUUGk....',
    '.kGGGGk.....',
    '..kkkkbk....',
    '......kbk...',
    '.......kbk..',
    '........kbk.',
    '.........kk.',
  ],
  fort: [
    '.......kRRk..',
    '.......kRRRk.',
    '.......kRk...',
    '.......k.....',
    '.kk.kk.kk.kk.',
    'kBBkBBkBBkBBk',
    'kBBkBBkBBkBBk',
    'kBbkBbkBbkBbk',
    'kBbkBbkBbkBbk',
    'kbbkbbkbbkbbk',
    'kkkkkkkkkkkkk',
  ],
  wagon: [
    '..kkkkkkkk..',
    '.kwwwwwwwwk.',
    'kwwPwwwPwwwk',
    'kwwPwwwPwwwk',
    'kwwPwwwPwwwk',
    'kkkkkkkkkkkk',
    'kBBBBBBBBBBk',
    'kkkkkkkkkkkk',
    '.kkk....kkk.',
    'kndnk..kndnk',
    '.kkk....kkk.',
  ],
  // wagonnet chargé d'or sur ses rails
  mine: [
    '...kkYk.kk...',
    '..kyYyykYyk..',
    'kkkkkkkkkkkkk',
    'kGGGGGGGGGGGk',
    '.kgggggggggk.',
    '.kgdgggggdgk.',
    '..kgggggggk..',
    '..kkkkkkkkk..',
    '..kdk...kdk..',
    '...k.....k...',
    'kkkkkkkkkkkkk',
  ],
  // tête de cheval de course, bride rouge (La course de chevaux)
  course: [
    '......k.k...',
    '.....kbkbk..',
    '....kbBBBnk.',
    '...kbBkBBnnk',
    '..kbBBBBBnnk',
    '.kbBrrrrrrnk',
    'kbBBBBBBrBnk',
    'kbbBkkkBBBnk',
    '.kkk...kBBnk',
    '.......kBBnk',
    '.......kBBnk',
    '.......kkkkk',
  ],
  // fort en rondins et son drapeau (Conquête de l'Ouest)
  rts: [
    '......nkkk...',
    '......nrrRk..',
    '......nrrrrk.',
    '......nkkkk..',
    'k.k.k.n.k.k.k',
    'kBkBkBnBkBkBk',
    'kBBBBBBBBBBBk',
    'kbBbBkkkbBbBk',
    'kbBbkynykbBbk',
    'kbBbknnnkbBbk',
    'kkkkkkkkkkkkk',
  ],
  // cadenas des cases « coming soon »
  soon: [
    '...kkkk...',
    '..kgGGgk..',
    '.kgk..kgk.',
    '.kgk..kgk.',
    'kkkkkkkkkk',
    'kyYYYYYYok',
    'kyyykkyyok',
    'kyyykkyyok',
    'kyyyykyyok',
    'kooooooook',
    'kkkkkkkkkk',
  ],
  pinte: [
    '.kkkkkkkk...',
    'kwwwwwwwwk..',
    'kwwwwwwwwkk.',
    'kAyyyyyyAkkk',
    'kAyYyyyyAk.k',
    'kAyYyyyyAk.k',
    'kAyYyyyyAk.k',
    'kAyyyyyyAkkk',
    'kAyyyyyyAkk.',
    'kAAAAAAAAk..',
    '.kkkkkkkk...',
  ],
};

const cache = {};
export function gameIcon(id) {
  const rows = GRIDS[id];
  if (!rows) return null;
  if (cache[id]) return cache[id];
  const c = makeCanvas(Math.max(...rows.map((r) => r.length)), rows.length);
  const ctx = c.getContext('2d');
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const col = PAL[row[x]];
      if (col) { ctx.fillStyle = col; ctx.fillRect(x, y, 1, 1); }
    }
  });
  return (cache[id] = c);
}
