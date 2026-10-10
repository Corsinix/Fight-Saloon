// Dessins de « La piste » : icônes pixel art (armes, armures, objets, ressources, lieux du territoire), le coyote,
// panneaux de bois et de parchemin, boutons, texte coupé en lignes. Une lettre = une couleur, '.' = transparent.
import * as S from './sprites.js';
import { textSprite, canvasText } from './scene.js';
import { hasItemArt, drawItem } from './pisteicons.js';
import { W, H } from './worlds.js';

const PAL = {
  k: '#1a0f0a', w: '#f4ecd8', g: '#8a8f98', G: '#c9ced6', d: '#4a4f58', y: '#e0b040', Y: '#f8e08a', o: '#a06a20',
  b: '#7a4a24', B: '#a8703c', n: '#4a2a14', r: '#c0392b', R: '#e8604c', m: '#7a1a14', a: '#b08850', A: '#d8b880',
  u: '#3a6ec0', U: '#7ab0f0', p: '#eadcb0', P: '#c8b480', e: '#4a8a3a', E: '#8ac060', s: '#e2dccd', S: '#a39a88', c: '#6a4a8a',
};

const GRIDS = {
  // ---- armes
  revolver: [
    '.kkkkkkkkk..',
    'kGGGGGGGGgk.',
    'kgdgkkkkkk..',
    'kbBbk.......',
    'kbbBk.......',
    '.kbbk.......',
    '..kk........',
  ],
  winchester: [
    '.kkkkkkkkkkk',
    'kBBkgGGGGGGk',
    'kbbbkkkkkkk.',
    '.kbbkyk.....',
    '..kkkyk.....',
    '.....kk.....',
  ],
  fusil: [
    '.kkkkkkkkkkk',
    'kBBkgGGGGGGk',
    'kbbbkgggggGk',
    '.kbbkkkkkkk.',
    '..kk........',
  ],
  sharps: [
    '...kkkk.....',
    '..kgGGgk....',
    'kkkkkkkkkkkk',
    'kBBBkgGGGGGk',
    '.kbbkkkkkkk.',
    '..kk........',
  ],
  arc: [
    '..kk......',
    '.kBk......',
    '.kbkk.....',
    'kbk.wk....',
    'kbkkkkkkkk',
    'kbk.wk..kk',
    '.kbkk.....',
    '.kBk......',
    '..kk......',
  ],
  // ---- armures
  cuir: [
    '.kk..kk.',
    'kBBkkBBk',
    'kBbBBbBk',
    'kBbbbbBk',
    'kBbBBbBk',
    'kBbbbbBk',
    '.kkkkkk.',
  ],
  duster: [
    '.kk..kk.',
    'kSSkkSSk',
    'kSdSSdSk',
    'kSdyydSk',
    'kSdSSdSk',
    'kSdSSdSk',
    'kSdkkdSk',
    '.kk..kk.',
  ],
  plastron: [
    '.kk..kk.',
    'kGGkkGGk',
    'kGgGGgGk',
    'kGgggggk',
    'kgGgGgGk',
    'kGgggggk',
    '.kkkkkk.',
  ],
  // ---- objets
  couteau: [
    '.......kk',
    '......kGk',
    '.....kGk.',
    '....kGk..',
    '.k.kGk...',
    '.kbkk....',
    'kbbk.....',
    'kkk......',
  ],
  bandages: [
    '.kkkkkk.',
    'kwwwwwwk',
    'kwSwwSwk',
    'kwwwwwwk',
    '.kkwwkk.',
    '...kwk..',
    '...kk...',
  ],
  trousse: [
    '..kkkk..',
    '.kkkkkk.',
    'kwwwwwwk',
    'kwwrrwwk',
    'kwrrrrwk',
    'kwwrrwwk',
    'kwwwwwwk',
    '.kkkkkk.',
  ],
  dynamite: [
    '....y...',
    '...Y....',
    '..kk....',
    '.krRk...',
    'krRrk...',
    'kmRrk...',
    'kmrk....',
    '.kk.....',
  ],
  graisse: [
    '..kkk...',
    '..kGk...',
    '.kkGkk..',
    'kGGGGGk.',
    'kgGGGgk.',
    'kgggggk.',
    '.kkkkk..',
  ],
  whisky: [
    '..kk...',
    '..kbk..',
    '.kkkkk.',
    'kooooyk',
    'kowwoyk',
    'kooooyk',
    'kooooyk',
    '.kkkkk.',
  ],
  fer: [
    '.kkk.kkk.',
    'kGGk.kGGk',
    'kGk...kGk',
    'kGk...kGk',
    'kGGk.kGGk',
    '.kGGkGGk.',
    '..kkkkk..',
  ],
  etoile: [
    '...kk...',
    '..kYYk..',
    'kkkYYkkk',
    'kYYyyYYk',
    '.kYyyYk.',
    '.kYkkYk.',
    'kYk..kYk',
    'kk....kk',
  ],
  longuevue: [
    '.........',
    'kk.......',
    'kykkkk...',
    'kyGGGgkkk',
    'kyGGGgkuk',
    'kykkkkkkk',
    'kk.......',
  ],
};

// Icônes en pixels fins (deux par pixel du jeu, comme les personnages) : ressources, caractéristiques, lieux, états.
// Elles occupent la moitié de leur grille en pixels du jeu, avec deux fois plus de détail.
const HD = {
  dollars: [
    '....kkkkkk....',
    '..kkYYYYYYkk..',
    '.kYYyyyoyyyyk.',
    '.kYyyoooooyyk.',
    'kYyyoyyoyyyyok',
    'kYyyoyyoyyyyok',
    'kYyyyoooooyyok',
    'kYyyyyyoyyoyok',
    'kYyyyyyoyyoyok',
    'kyyyoooooyyyok',
    '.kyyyyyoyyyok.',
    '.kyyyyyyyyook.',
    '..kkooooookk..',
    '....kkkkkk....',
  ],
  vivres: [
    '....kkkkkk....',
    '..kkAAAAAAkk..',
    '.kAAAbAAAbAAk.',
    'kAAAbAAAbAAAak',
    'kAAbAAAbAAAaak',
    'kaaaaaaaaaaaak',
    'kaaaaaaaaaaabk',
    '.kbaaaaaaaabk.',
    '..kkkkkkkkkk..',
  ],
  balles: [
    '.kk...kk...kk.',
    'kYBk.kYBk.kYBk',
    'kYBk.kYBk.kYBk',
    'kkkk.kkkk.kkkk',
    'kYyk.kYyk.kYyk',
    'kYyk.kYyk.kYyk',
    'kYyk.kYyk.kYyk',
    'kYok.kYok.kYok',
    'kkkk.kkkk.kkkk',
  ],
  fourn: [
    'kkkkkkkkkkkk',
    'kBBBBBBBBBBk',
    'kBkkkkkkkkBk',
    'kBkbbbbBBkBk',
    'kBkbbbBBbkBk',
    'kBknnBBnnkBk',
    'kBkbBBbbbkBk',
    'kBkBBbbbbkBk',
    'kBkBbbbbbkBk',
    'kBkkkkkkkkBk',
    'kBBBBBBBBBBk',
    'kkkkkkkkkkkk',
  ],
  cran: [
    '....k.....',
    '...kRk....',
    '...kRRk.k.',
    '..kRYRkkRk',
    '..kRYRRRRk',
    '.kRYYYRRk.',
    '.kRYYYYRk.',
    'kRYYwYYYRk',
    'kRYwwwYYRk',
    'kRYwwwwYRk',
    '.kRYwwYRk.',
    '..kRRRRk..',
    '...kkkk...',
  ],
  cran_s: [
    '...k...',
    '..kRk..',
    '..kRRk.',
    '.kRYRk.',
    'kRYYRRk',
    'kRYwYRk',
    'kRYwYRk',
    '.kRYRk.',
    '..kkk..',
  ],
  coeur: [
    '..kkk...kkk..',
    '.kRRRk.kRrrk.',
    'kRwRRrkRrrrrk',
    'kRRRrrrrrrrrk',
    'kRRrrrrrrrrrk',
    '.krrrrrrrrrk.',
    '..krrrrrrrk..',
    '...krrrrmk...',
    '....krrmk....',
    '.....kmk.....',
    '......k......',
  ],
  botte: [
    '..kkkkkk....',
    '..kBBBBk....',
    '..kbBBbk....',
    '..kBbbBk....',
    '..kBBBBk....',
    '..kbBBBk....',
    '..kbBBBBk...',
    '..kbbBBBBkk.',
    '.kkbbbBBBBBk',
    'kGkbbbbbbbbk',
    '.kkkkkkkkkkk',
    '..kkk.......',
  ],
  viseur: [
    '....kkkkk....',
    '..kkRRRRRkk..',
    '.kRRkkwkkRRk.',
    '.kRk.kwk.kRk.',
    'kRk...k...kRk',
    'kRk..kkk..kRk',
    'kRwwkkRkkwwRk',
    'kRk..kkk..kRk',
    'kRk...k...kRk',
    '.kRk.kwk.kRk.',
    '.kRRkkwkkRRk.',
    '..kkRRRRRkk..',
    '....kkkkk....',
  ],
  esquive: [
    'kk....kk....',
    'kUk...kUk...',
    '.kUk...kUk..',
    '..kUk...kUk.',
    '...kUk...kUk',
    '..kUk...kUk.',
    '.kUk...kUk..',
    'kUk...kUk...',
    'kk....kk....',
  ],
  armure: [
    'kkkkkkkkkkk',
    'kGGGGGGGGgk',
    'kGwGGGGGGgk',
    'kGGGGGGGGgk',
    'kGGGGGGGGgk',
    'kGGGGGGGggk',
    '.kGGGGGGgk.',
    '.kGGGGGggk.',
    '..kGGGGgk..',
    '..kgGGggk..',
    '...kgggk...',
    '....kgk....',
    '.....k.....',
  ],
  xp: [
    '.....k.....',
    '....kYk....',
    '....kYk....',
    'kkkkYYYkkkk',
    'kYYYYYYYYyk',
    '.kyYYYYYyk.',
    '..kYYYYYk..',
    '..kYYkYYk..',
    '.kYyk.kyYk.',
    '.kyk...kyk.',
    '.kk.....kk.',
  ],
  // ---- lieux du territoire
  n_combat: [
    '.....kkkk.....',
    '....knnnnk....',
    '....knnnnk....',
    '.kkkknnnnkkkk.',
    'knnnnnnnnnnnnk',
    '.kkkkkkkkkkkk.',
    '...kaaaaaak...',
    '...kakaakak...',
    '...kaaaaaak...',
    '...krrrrrrk...',
    '..krRrrrrRrk..',
    '..krrrrrrrrk..',
    '...krrkkrrk...',
    '....kk..kk....',
  ],
  n_event: [
    '..kkkk..',
    '.kkkkkk.',
    'kkk..kkk',
    '.....kkk',
    '....kkk.',
    '...kkk..',
    '...kk...',
    '...kk...',
    '........',
    '...kk...',
    '...kk...',
  ],
  n_comptoir: [
    '...kk..kk...',
    '....kkkk....',
    '.....kk.....',
    '....kbbk....',
    '..kkAAAAkk..',
    '.kAAAoAAAAk.',
    'kAAAoooAAAAk',
    'kAAoAoAAAAak',
    'kAAAoooAAAak',
    'kAAAAoAoAAak',
    'kAAAoooAAaak',
    '.kAAAoAAaak.',
    '..kkkkkkkk..',
  ],
  n_camp: [
    '.....k......',
    '....kRk.....',
    '....kRk.k...',
    '...kRYRkRk..',
    '...kRYYRRk..',
    '..kRYwYYRk..',
    '..kRYwwYRk..',
    '...kRYYRk...',
    '.kkkkkkkkkk.',
    'kBbBbBbBbBbk',
    '.kkkkkkkkkk.',
  ],
  n_recrue: [
    '...kkkk......',
    '..knnnnk.....',
    'kknnnnnnkk...',
    '..kaaaak.....',
    '..kakaak..e..',
    '..kaaaak.eee.',
    '...kaak...e..',
    '.kkbbbbkk....',
    'kbbbbbbbbk...',
    'kbbkbbkbbk...',
    'kbbkbbkbbk...',
    'kkkkkkkkkk...',
  ],
  n_cache: [
    '..kkkkkkkkkk..',
    '.kBBBBBBBBBBk.',
    'kBbbbbbbbbbbBk',
    'kBbbbbbbbbbbBk',
    'kkkkkkYYkkkkkk',
    'kbbbbkYYkbbbbk',
    'kBbbbbkkbbbbBk',
    'kBbbbbbbbbbbBk',
    'kBbbbbbbbbbbBk',
    'kkkkkkkkkkkkkk',
  ],
  n_prisonnier: [
    '..kkk....kkk..',
    '.kGGGk..kGGGk.',
    'kGk.kGkkGk.kGk',
    'kGk.kGGGGk.kGk',
    'kGk.kGkkGk.kGk',
    '.kGGGk..kGGGk.',
    '..kkk....kkk..',
  ],
  n_repaire: [
    'k............k',
    'kRk........kRk',
    '.kRk.kkkk.kRk.',
    '.kRkkwwwwkkRk.',
    '..kkwwwwwwkk..',
    '..kwwwwwwwwk..',
    '..kwkkwwkkwk..',
    '..kwkRwwkRwk..',
    '..kwwwwwwwwk..',
    '..kwwwkkwwwk..',
    '...kwkwwkwk...',
    '....kkkkkk....',
  ],
  n_depart: [
    '.....kk.....',
    '....kRRk....',
    '...kRRRRk...',
    '..kRRRRRRk..',
    '.kkkkkkkkkk.',
    '..kBBBBBBk..',
    '..kBYYBkkk..',
    '..kBYYBknk..',
    '..kBBBBknk..',
    '..kBBBBknk..',
    '.kkkkkkkkkk.',
  ],
  n_unknown: [
    'SS..SS..SS',
    'SS..SS..SS',
  ],
  // ---- états en combat (au-dessus de la tête)
  s_bleed: ['..kk..', '.kRRk.', '.kRRk.', 'kRRRRk', 'kRwRRk', 'kRRRrk', '.krrk.', '..kk..'],
  s_mark: ['..kkk..', '.kRRRk.', 'kRkwkRk', 'kRwRwRk', 'kRkwkRk', '.kRRRk.', '..kkk..'],
  s_affut: ['..kkkkk..', '.kwwkwwk.', 'kwwkukwwk', '.kwwkwwk.', '..kkkkk..'],
  s_shield: ['kkkkkk', 'kGGGgk', 'kGwGgk', 'kGGGgk', '.kGgk.', '..kk..'],
  s_pin: ['kk...kk', 'kYk.kYk', '.kYkYk.', '..kYk..', '.kYkYk.', 'kYk.kYk', 'kk...kk'],
  s_ghost: ['.kkkkk.', 'kwwwwwk', 'kwkwkwk', 'kwwwwwk', 'kwwwwwk', 'kwkwkwk', 'k.k.k.k'],
};

const cache = {};
// Une icône (canevas) : id d'une grille ci-dessus ; pal : couleurs à remplacer. c.hd : grille en pixels fins.
export function icon(id, pal = null) {
  const key = pal ? `${id}|${JSON.stringify(pal)}` : id;
  if (cache[key]) return cache[key];
  const rows = HD[id] || GRIDS[id];
  if (!rows) return null;
  const P = pal ? { ...PAL, ...pal } : PAL;
  const c = S.makeCanvas(Math.max(...rows.map((r) => r.length)), rows.length);
  const g = c.getContext('2d');
  rows.forEach((row, y) => [...row].forEach((ch, x) => {
    if (ch === '.' || !P[ch]) return;
    g.fillStyle = P[ch];
    g.fillRect(x, y, 1, 1);
  }));
  c.hd = !!HD[id];
  return (cache[key] = c);
}
// largeur d'une icône en pixels du jeu
export function iconW(id) { const c = icon(id); return c ? c.width / (c.hd ? 2 : 1) : 0; }
// dessine une icône centrée en (x, y) ; k : agrandissement (2 : une icône fine en pixels pleins)
// (les objets, ressources, coups et états ont des sprites détaillés, pisteicons.js : on les prend à la taille la plus
// proche, un peu plus grands que les anciennes icônes pour rester lisibles)
const ART_SIZES = [8, 10, 12, 16, 24, 32];
export function drawIcon(ctx, id, x, y, pal = null, k = 1) {
  const c = icon(id, pal);
  if (!pal && hasItemArt(id)) {
    const want = Math.max(c ? Math.max(c.width, c.height) / (c.hd ? 2 : 1) : 8, 8) * k * 1.25;
    const size = ART_SIZES.reduce((a, b) => (Math.abs(b - want) < Math.abs(a - want) ? b : a));
    drawItem(ctx, id, x, y, size);
    return;
  }
  if (!c) return;
  const s = k / (c.hd ? 2 : 1), w = c.width * s, h = c.height * s;
  ctx.drawImage(c, Math.round((x - w / 2) * 2) / 2, Math.round((y - h / 2) * 2) / 2, w, h);
}

// ------------------------------------------------------------ le coyote (de profil, tourné vers la droite)
const COYOTE = [
  [
    '...............k.k...',
    '..............kAkAk..',
    'kk...........kaaaaak.',
    'kak.kkkkkkkkkaakaaakk',
    '.kakaaaaaaaaaaaaaaaak',
    '..kaaaAAAAAAAaaakkkk.',
    '...kaaaaaaaaaaak.....',
    '...kak.kak..kak.kak..',
    '...kak.kak..kak.kak..',
    '...kk..kk...kk..kk...',
  ],
  [
    '...............k.k...',
    '..............kAkAk..',
    'kk...........kaaaaak.',
    'kak.kkkkkkkkkaakaaakk',
    '.kakaaaaaaaaaaaaaaaak',
    '..kaaaAAAAAAAaaakkkk.',
    '...kaaaaaaaaaaak.....',
    '..kak...kak.kak...kak',
    '.kak.....kakak.....kk',
    '.kk.......kk.........',
  ],
];
const COYOTE_PAL = { a: '#a8804c', A: '#dcc090' };
const coyCache = {};
export function coyoteSprite(frame, hurt = false) {
  const key = `${frame}|${hurt}`;
  if (coyCache[key]) return coyCache[key];
  const rows = COYOTE[frame % 2];
  const c = S.makeCanvas(rows[0].length, rows.length);
  const g = c.getContext('2d');
  const P = { ...PAL, ...COYOTE_PAL };
  rows.forEach((row, y) => [...row].forEach((ch, x) => {
    if (ch === '.') return;
    g.fillStyle = hurt ? '#ffffff' : P[ch];
    g.fillRect(x, y, 1, 1);
  }));
  return (coyCache[key] = c);
}

// ------------------------------------------------------------ texte
export const textW = (str, size = 8) => textSprite(String(str), size, '#ffffff', '').w;
// coupe un texte en lignes d'au plus maxW pixels
export function wrapText(str, maxW, size = 8) {
  const out = [];
  let line = '';
  for (const w of String(str).split(' ')) {
    const next = line ? `${line} ${w}` : w;
    if (line && textW(next, size) > maxW) { out.push(line); line = w; } else line = next;
  }
  if (line) out.push(line);
  return out;
}
// raccourcit un texte (…) pour qu'il tienne dans maxW pixels
export function fitText(str, maxW, size = 8) {
  str = String(str);
  if (textW(str, size) <= maxW) return str;
  while (str.length > 1 && textW(`${str}.`, size) > maxW) str = str.slice(0, -1);
  return `${str.trimEnd()}.`;
}
export const txt = (ctx, str, x, y, col = '#f8e8c0', align = 'left', size = 8, shadow = '#1a0f0a') => canvasText(ctx, str, x, y, { size, color: col, align, shadow });

// ------------------------------------------------------------ panneaux et boutons
export const INK = '#3a2414', CREAM = '#fdf6e0', GOLD = '#f8d070', SALMON = '#f0705a', GREEN = '#b8e070', BLUE = '#7ab0f0', GREY = '#a39a88';
// panneau de bois sombre (style : 'wood') ou de parchemin ('paper')
export function panel(ctx, x, y, w, h, style = 'wood') {
  if (style === 'paper') {
    ctx.fillStyle = '#5a3a1e'; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#e6d4a8'; ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
    ctx.fillStyle = '#efe0b8'; ctx.fillRect(x + 2, y + 2, w - 4, 1);
    ctx.fillStyle = '#cdb88a'; ctx.fillRect(x + 2, y + h - 3, w - 4, 1);
    return;
  }
  ctx.fillStyle = '#120a06'; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = '#2e1e14'; ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
  ctx.fillStyle = '#3e2a1c'; ctx.fillRect(x + 1, y + 1, w - 2, 1);
  ctx.fillStyle = '#5a3e26'; ctx.fillRect(x, y, w, 1);
}
// bouton : st = 'on' (survolé), 'off' (grisé), 'sel' (choisi), 'gold' (mis en avant)
export function button(ctx, x, y, w, h, label, st = '', size = 8) {
  const off = st === 'off';
  const base = st === 'sel' ? '#6a4a1a' : st === 'gold' ? '#7a5a18' : off ? '#2a221c' : '#4a3020';
  ctx.fillStyle = '#120a06'; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = st === 'on' ? '#6a4628' : base; ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
  ctx.fillStyle = off ? '#3a3028' : st === 'gold' || st === 'sel' ? '#c8a040' : '#7a5434'; ctx.fillRect(x + 1, y + 1, w - 2, 1);
  const col = off ? '#8a7e70' : st === 'gold' || st === 'sel' ? GOLD : CREAM;
  // deux lignes : coupé à la main ('\n'), ou au mieux si le bouton est assez haut et le libellé trop long
  const lines = String(label).includes('\n') ? String(label).split('\n') : size === 8 && h >= 17 ? split2(label, w - 4) : [label];
  if (lines.length > 1) {
    lines.slice(0, 2).forEach((l, i) => canvasText(ctx, fitText(l, w - 4), x + w / 2, y + Math.round(h / 2) - 7 + i * 8, { size, color: col }));
    return;
  }
  canvasText(ctx, fitText(label, w - 4, size), x + w / 2, y + Math.round((h - (size === 16 ? 12 : 6)) / 2), { size, color: col });
}
// coupe un libellé trop long en deux lignes à peu près égales (au mot), ou le laisse entier
function split2(str, maxW) {
  str = String(str);
  if (textW(str) <= maxW || !str.includes(' ')) return [str];
  const words = str.split(' ');
  let best = null;
  for (let k = 1; k < words.length; k++) {
    const a = words.slice(0, k).join(' '), b = words.slice(k).join(' ');
    const m = Math.max(textW(a), textW(b));
    if (!best || m < best.m) best = { m, l: [a, b] };
  }
  return best.l;
}

// infobulle : le texte en lignes dans un cadre sombre, au-dessus de l'élément (ax : son milieu, ay : son haut, ah : sa
// hauteur), au-dessous s'il n'y a pas la place, sans sortir de la zone [top, bottom] de l'écran
export function tipBox(ctx, text, ax, ay, { ah = 0, maxW = 230, top = 0, bottom = H, gap = 3 } = {}) {
  const lines = wrapText(text, maxW);
  const w = Math.max(...lines.map((l) => textW(l))) + 8, h = lines.length * 9 + 4;
  const x = Math.round(Math.max(2, Math.min(W - w - 2, ax - w / 2)));
  let y = ay - gap - h;
  if (y < top + 1) y = ay + ah + gap;
  y = Math.round(Math.max(top, Math.min(bottom - h, y)));
  tipFrame(ctx, x, y, w, h);
  lines.forEach((l, i) => txt(ctx, l, x + 4, y + 3 + i * 9, CREAM));
}
// bandeau d'aide sur toute la largeur, posé sur la ligne bottom (au-dessus d'un pied de page)
export function tipBar(ctx, text, bottom, col = CREAM) {
  const lines = wrapText(text, W - 14);
  const h = lines.length * 9 + 4, y = bottom - h;
  tipFrame(ctx, 1, y, W - 2, h);
  lines.forEach((l, i) => txt(ctx, l, 6, y + 3 + i * 9, col));
}
function tipFrame(ctx, x, y, w, h) {
  ctx.fillStyle = '#c8a040'; ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
  ctx.fillStyle = 'rgba(18,10,6,0.94)'; ctx.fillRect(x, y, w, h);
}
// médaillon des lieux (carte, écrans de récit) : un disque de parchemin cerclé, l'icône au milieu
// (le disque est tracé au demi-pixel une fois pour toutes, en cache : un arc lissé à chaque image serait flou)
const discs = {};
function medalDisc(r, fill, ring) {
  const key = `${r}|${fill}|${ring}`;
  if (discs[key]) return discs[key];
  const R = (r + 1) * 2, c = S.makeCanvas(R * 2, R * 2), g = c.getContext('2d');
  for (const [rr, col] of [[R, ring], [r * 2, fill]]) {
    g.fillStyle = col;
    for (let y = 0; y < R * 2; y++) for (let x = 0; x < R * 2; x++) if (Math.hypot(x + 0.5 - R, y + 0.5 - R) <= rr) g.fillRect(x, y, 1, 1);
  }
  return (discs[key] = c);
}
export function medal(ctx, x, y, id, r = 6, { fill = '#f0e2b8', ring = '#3a2414', pal = null } = {}) {
  const c = medalDisc(r, fill, ring);
  ctx.drawImage(c, Math.round((x - r - 1) * 2) / 2, Math.round((y - r - 1) * 2) / 2, c.width / 2, c.height / 2);
  drawIcon(ctx, id, x, y, pal);
}
// caractéristiques en icônes : list = [[icône, valeur], …], le texte en haut à y ; renvoie le x de fin
export function statIcons(ctx, x, y, list, col = CREAM, shadow = '#1a0f0a', gap = 4) {
  for (const [id, v] of list) {
    const iw = iconW(id);
    drawIcon(ctx, id, x + iw / 2, y + 3);
    x += iw + 1.5;
    txt(ctx, String(v), x, y, col, 'left', 8, shadow);
    x += textW(String(v)) + gap;
  }
  return x;
}
// barre (PV, armure…)
export function bar(ctx, x, y, w, h, k, col, back = '#1a0f0a') {
  ctx.fillStyle = back; ctx.fillRect(x, y, w, h);
  const f = Math.round(Math.max(0, Math.min(1, k)) * (w - 2));
  if (f > 0) { ctx.fillStyle = col; ctx.fillRect(x + 1, y + 1, f, h - 2); }
}
