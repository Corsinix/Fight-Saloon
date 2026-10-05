// Tout le pixel art est dessiné en code : personnages, objets, fusil, décors.
import { SKIN, HAIR_COLORS, CLOTH_COLORS } from './data.js';

export const OUT = '#1a0f0a';

export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  return c;
}

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const toHex = (r, g, b) => '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');

// amt < 0 assombrit, amt > 0 éclaircit
export function shade(hex, amt) {
  const [r, g, b] = hexToRgb(hex);
  if (amt < 0) return toHex(r * (1 + amt), g * (1 + amt), b * (1 + amt));
  return toHex(r + (255 - r) * amt, g + (255 - g) * amt, b + (255 - b) * amt);
}
export function mix(a, b, t) {
  const A = hexToRgb(a), B = hexToRgb(b);
  return toHex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t);
}

// Petits utilitaires de dessin
function painter(ctx) {
  const R = (x, y, w, h, col) => { ctx.fillStyle = col; ctx.fillRect(x, y, w, h); };
  const outlined = (rects, col) => {
    for (const r of rects) R(r[0] - 1, r[1] - 1, r[2] + 2, r[3] + 2, OUT);
    for (const r of rects) R(r[0], r[1], r[2], r[3], r[4] || col);
  };
  return { R, outlined };
}

export function disc(ctx, cx, cy, r, col) {
  ctx.fillStyle = col;
  for (let dy = -r; dy <= r; dy++) {
    const dx = Math.floor(Math.sqrt(r * r - dy * dy + r * 0.8));
    ctx.fillRect(Math.round(cx - dx), Math.round(cy + dy), dx * 2 + 1, 1);
  }
}

// ------------------------------------------------------------- Sprites "texte"
const PAL = {
  k: OUT, w: '#f4ecd8', g: '#8a8f98', G: '#c9ced6', d: '#4a4f58', y: '#e0b040', Y: '#f8e08a',
  o: '#a06a20', b: '#7a4a24', B: '#a8703c', n: '#4a2a14', r: '#c0392b', R: '#e8604c', m: '#7a1a14',
  a: '#d9822b', A: '#f2b25a', u: '#3a6ec0', U: '#7ab0f0', p: '#eadcb0', P: '#c8b480', f: '#f87818',
  F: '#fff070', s: '#c8c0b8', e: '#2a6a3a', E: '#5aa05a',
};

function fromGrid(rows, pal = PAL) {
  const w = Math.max(...rows.map((r) => r.length));
  const c = makeCanvas(w, rows.length);
  const ctx = c.getContext('2d');
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const col = pal[row[x]];
      if (col) { ctx.fillStyle = col; ctx.fillRect(x, y, 1, 1); }
    }
  });
  return c;
}

const ICON_GRIDS = {
  spyglass: [
    '.........kkkkkkk',
    '....kkkkkYYYYYYk',
    'kkkkGGGGkyyyyyUk',
    'kYYkggggkyyyyyUk',
    'kyykggggkyyyyyyk',
    'kookddddkooooook',
    'kkkkddddkooooook',
    '....kkkkkooooook',
    '.........kkkkkkk',
  ],
  cigar: [
    '................',
    '..............s.',
    '.............s..',
    '..............s.',
    '.............s..',
    '..............s.',
    '................',
    '.kkkkkkkkkkkkkk.',
    'kBBBBrYrBBBBBBsk',
    'kbbbbmrmbbbbbbfk',
    'knnnnmmmnnnnnnFk',
    '.kkkkkkkkkkkkkk.',
  ],
  whisky: [
    '......kkkk......',
    '......kBBk......',
    '......kddk......',
    '......kaAk......',
    '.....kkaakk.....',
    '....kaAaaaak....',
    '...kaAaaaaaak...',
    '...kaApppppak...',
    '...kaAprrrpak...',
    '...kaAppPppak...',
    '...kaApppppak...',
    '...kaAaaaaaak...',
    '...kaAaaaaaak...',
    '...koaaaaaaok...',
    '....kkkkkkkk....',
  ],
  saw: [
    '................',
    '................',
    '.kkkkk..........',
    'kBBBBBk.........',
    'kBkkkBkkkkkkkkkk',
    'kBk.kBkGGGGGGGGk',
    'kBkkkBkgggggggGk',
    'kBBBBBkggggggggk',
    'knBBBnkggggggggk',
    '.kkkkkkgdgdgdgdk',
    '......kdkdkdkdk.',
    '.......k.k.k.k..',
  ],
  cuffs: [
    '................',
    '...kkkk..kkkk...',
    '..kGGGGkkGGGGk..',
    '.kGk..kGGk..kGk.',
    '.kgk..kggk..kgk.',
    '.kgk..kkkk..kgk.',
    '.kgk..k..k..kgk.',
    '.kgk..k..k..kgk.',
    '.kgk..k..k..kgk.',
    '..kgkkg..gkkgk..',
    '...kggk..kggk...',
    '....kk....kk....',
  ],
  telegraph: [
    '................',
    '..kkkkkkkkkkk...',
    '..kpppppppppkk..',
    '..kpkkkkkkpkPk..',
    '..kppppppppkkkk.',
    '..kpkkkkkkkkppk.',
    '..kpppppppppppk.',
    '..kpkkkkkpppppk.',
    '..kpppppppppppk.',
    '..kpkkkkkkkkppk.',
    '..kpppppprrrppk.',
    '..kPPPPPPPrrPPk.',
    '..kkkkkkkkkkkkk.',
  ],
  coin: [
    '................',
    '....kkkkkk......',
    '...kYYYYYYk.....',
    '..kYyyyyyyyk....',
    '.kYyyykyyyyok...',
    '.kYyykkkkyyok...',
    '.kYyykyyyyyok...',
    '.kYyyykkkyyok...',
    '.kYyyyyyykyok...',
    '.kYyykkkkyyok...',
    '.kYyyykyyyyok...',
    '..kyyyyyyyook...',
    '...koooooook....',
    '....kkkkkkk.....',
  ],
  remedy: [
    '......kkk.......',
    '.....kBBBk......',
    '......kUk.......',
    '......kuk.......',
    '.....kuuuk......',
    '....kUuuuuk.....',
    '...kUuuuuuuk....',
    '...kUpppppuk....',
    '...kUpkpkpuk....',
    '...kUppkppuk....',
    '...kUpkpkpuk....',
    '...kUpppppuk....',
    '...kuuuuuuuk....',
    '....kkkkkkk.....',
  ],
  horseshoe: [
    '................',
    '....kkkkkkkk....',
    '...kGGGGGGGGk...',
    '..kGgkkkkkkgGk..',
    '.kGgk......kgGk.',
    '.kGgk......kgGk.',
    '.kGkk......kkGk.',
    '.kgk........kgk.',
    '.kgk........kgk.',
    '.kgk........kgk.',
    '.kgk........kgk.',
    'kddk........kddk',
    'kkkk........kkkk',
  ],
  ace: [
    '..kkkkkkkkkkk...',
    '..kwkwwwwwwwk...',
    '..kkkwwwwwwwk...',
    '..kwkwwkwwwwk...',
    '..kwwwkkkwwwk...',
    '..kwwkkkkkwwk...',
    '..kwkkkkkkkwk...',
    '..kwkkkkkkkwk...',
    '..kwwkwkwkwwk...',
    '..kwwwwkwwwwk...',
    '..kwwwkkkwwwk...',
    '..kwwwwwwwkwk...',
    '..kwwwwwwkwkk...',
    '..kwwwwwwwkwk...',
    '..kkkkkkkkkkk...',
  ],
  derringer: [
    '................',
    '................',
    '..kk............',
    '.kdkkkkkkkkkkkk.',
    '.kGGGGGGGGGGGGYk',
    '.kggggggggggggk.',
    '.kddddddddddkk..',
    '.kwwkkdkdk......',
    '.kwwk.kkk.......',
    'kwwPk...........',
    'kwwPk...........',
    'kwwwk...........',
    '.kkk............',
  ],
  lasso: [
    '................',
    '....kkkkkk......',
    '...kBBBBBBk.....',
    '..kBkkkkkkBk....',
    '.kBk......kBk...',
    '.kBk......kBk...',
    '.kBk......kBk...',
    '..kBk....kBk....',
    '...kBkkkkBk.....',
    '....kBBBBk......',
    '.....kBk........',
    '......kBk.......',
    '.......kBk......',
    '........kBkk....',
    '.........kBBk...',
    '..........kk....',
  ],
};

const iconCache = {};
export function itemIcon(id) {
  if (!iconCache[id]) {
    const src = fromGrid(ICON_GRIDS[id] || ICON_GRIDS.coin);
    const c = makeCanvas(16, 16);
    c.getContext('2d').drawImage(src, Math.floor((16 - src.width) / 2), Math.floor((16 - src.height) / 2));
    iconCache[id] = c;
  }
  return iconCache[id];
}

// Icônes détaillées (32×32) : tes objets, l'objet qu'on utilise, la pièce du pile ou face.
// Dessinées sans contour, puis un contour sombre d'un pixel est ajouté tout autour.
function outlineCanvas(c) {
  const ctx = c.getContext('2d');
  const { width: w, height: h } = c;
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data, out = new Uint8ClampedArray(d);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    if (d[i + 3]) continue;
    const near = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
      const X = x + dx, Y = y + dy;
      return X >= 0 && Y >= 0 && X < w && Y < h && d[(Y * w + X) * 4 + 3] > 0;
    });
    if (near) { out[i] = 26; out[i + 1] = 15; out[i + 2] = 10; out[i + 3] = 255; }
  }
  img.data.set(out);
  ctx.putImageData(img, 0, 0);
  return c;
}

const HD = {
  spyglass(R) {
    const brass = '#d0a040', brassL = '#f4d47a', brassD = '#8a6420';
    R(2, 13, 7, 6, brassD); R(2, 13, 7, 1, brass); R(3, 14, 1, 4, '#3a2a1a'); // oculaire
    R(9, 12, 9, 8, brass); R(9, 12, 9, 2, brassL); R(9, 18, 9, 2, brassD); R(12, 12, 3, 8, '#7a4a24'); R(12, 12, 3, 1, '#a8703c'); // cuir
    R(18, 11, 11, 10, brass); R(18, 11, 11, 2, brassL); R(18, 19, 11, 2, brassD); R(18, 11, 1, 10, brassD);
    R(29, 10, 2, 12, brassD); R(30, 12, 1, 8, '#9ad0f0'); R(30, 13, 1, 2, '#e8f8ff');
    R(5, 20, 1, 6, '#7a4a24'); R(6, 25, 5, 1, '#7a4a24'); // cordon
  },
  cigar(R) {
    const s = 'rgba(220,214,204,0.9)';
    R(14, 4, 1, 2, s); R(15, 6, 1, 2, s); R(14, 8, 1, 2, s); R(20, 2, 1, 2, s); R(21, 4, 1, 2, s); R(20, 6, 1, 3, s);
    for (let x = 2; x < 27; x++) { R(x, 15, 1, 7, x % 5 ? '#8a5228' : '#7a4420'); R(x, 15, 1, 1, '#b07038'); R(x, 21, 1, 1, '#5a3218'); }
    R(2, 16, 1, 5, '#5a3218');
    R(8, 15, 5, 7, '#c0392b'); R(8, 15, 5, 1, '#e86848'); R(9, 17, 3, 3, '#e0b040'); R(10, 18, 1, 1, '#fff0a0');
    R(27, 15, 2, 7, '#c8c0b8'); R(27, 15, 2, 1, '#e8e4e0'); R(29, 16, 2, 5, '#f87818'); R(30, 17, 1, 3, '#fff070');
  },
  whisky(R) {
    R(14, 1, 5, 4, '#a8703c'); R(14, 1, 5, 1, '#d09858');
    R(14, 5, 5, 6, '#7a4a1a'); R(15, 5, 1, 6, '#c08040');
    R(12, 11, 9, 2, '#8a5020'); R(10, 13, 13, 17, '#a86018'); R(10, 13, 13, 4, '#7a4410');
    R(11, 14, 2, 15, '#e0a040'); R(20, 14, 2, 15, '#6a3a10');
    R(11, 19, 11, 8, '#efe0b8'); R(11, 19, 11, 1, '#c8b88a'); R(11, 26, 11, 1, '#c8b88a');
    for (const x of [13, 16, 19]) { R(x, 21, 1, 3, '#c0392b'); R(x + 1, 21, 1, 3, '#c0392b'); }
    R(10, 29, 13, 1, '#5a3010');
  },
  saw(R) {
    R(2, 8, 10, 17, '#a8703c'); R(2, 8, 10, 2, '#d09858'); R(2, 23, 10, 2, '#6a3a1a');
    R(5, 12, 4, 8, 'transparent');
    R(12, 10, 18, 11, '#b8bec6'); R(12, 10, 18, 2, '#e8ecf0'); R(12, 19, 18, 2, '#7a808a');
    R(28, 10, 2, 9, '#8a9098');
    for (let x = 12; x < 30; x += 3) { R(x, 21, 2, 1, '#9aa0a8'); R(x + 1, 22, 1, 1, '#9aa0a8'); }
    for (const y of [13, 18]) R(10, y, 3, 2, '#e0b040');
  },
  cuffs(R) {
    const steel = '#a4a8b0', steelL = '#e4e8ec', steelD = '#5c626c';
    for (const cx of [9, 23]) {
      for (let a = 0; a < 64; a++) {
        const t = (a / 64) * Math.PI * 2;
        for (const rr of [6, 7, 8]) R(Math.round(cx + Math.cos(t) * rr), Math.round(19 + Math.sin(t) * rr), 1, 1, rr === 6 ? steelD : t > 3.6 && t < 5.4 ? steelL : steel);
      }
      R(cx - 2, 10, 4, 3, steelD);
    }
    for (const x of [13, 16, 19]) { R(x, 8, 3, 2, steel); R(x, 8, 3, 1, steelL); }
    R(15, 11, 3, 2, steelD);
  },
  telegraph(R) {
    R(4, 6, 24, 20, '#efe4c4'); R(4, 6, 24, 2, '#c8b88a'); R(24, 6, 4, 4, '#c8b88a'); R(25, 6, 3, 3, 'transparent');
    R(7, 9, 12, 2, '#3a2a1a');
    for (const [y, w] of [[13, 18], [16, 15], [19, 17], [22, 9]]) R(7, y, w, 1, '#7a6a5a');
    R(19, 20, 6, 4, '#c0392b'); R(20, 21, 4, 2, '#e86848');
    R(4, 25, 24, 1, '#a89878');
  },
  coin(R, disc) {
    disc(16, 16, 13, '#a87018'); disc(15, 15, 12, '#e0b040'); disc(15, 15, 10, '#c89020'); disc(14, 14, 9, '#e8c050');
    const g = '#8a5a10';
    R(14, 8, 2, 14, g); R(11, 10, 7, 2, g); R(10, 12, 2, 2, g); R(11, 14, 6, 2, g); R(16, 16, 2, 2, g); R(10, 18, 7, 2, g);
    R(9, 7, 3, 1, '#fff6c0'); R(8, 8, 1, 3, '#fff6c0');
  },
  remedy(R) {
    R(13, 1, 6, 3, '#a8703c'); R(14, 4, 4, 5, '#9ab8c8'); R(14, 4, 1, 5, '#e0f0f8');
    R(10, 9, 12, 21, '#3a6ec0'); R(10, 9, 12, 3, '#7ab0f0'); R(11, 12, 2, 16, '#9ad0f8'); R(20, 12, 2, 16, '#2a4e90');
    R(10, 17, 12, 8, '#efe0b8'); R(10, 17, 12, 1, '#c8b88a');
    R(12, 19, 8, 1, '#5a2a4a'); R(13, 21, 6, 1, '#5a2a4a'); R(14, 23, 4, 1, '#c0392b');
    R(16, 13, 1, 1, '#e0f8ff'); R(18, 15, 1, 1, '#e0f8ff'); R(15, 27, 1, 1, '#e0f8ff');
    R(10, 29, 12, 1, '#1a3a70');
  },
  lasso(R) {
    const a = '#c8a060', b = '#8a6a3a';
    for (let k = 0; k < 90; k++) {
      const t = (k / 90) * Math.PI * 2;
      for (const rr of [9, 10, 11]) R(Math.round(14 + Math.cos(t) * (rr + 1)), Math.round(13 + Math.sin(t) * rr * 0.75), 1, 1, (k + rr) % 4 < 2 ? a : b);
    }
    R(20, 19, 5, 4, b); R(21, 20, 3, 2, a);
    for (let k = 0; k < 9; k++) R(23 + k * 0.6, 23 + k, 2, 1, k % 2 ? a : b);
    R(27, 31, 3, 1, b);
  },
  horseshoe(R) {
    const ir = '#8a8f98', irL = '#d0d4da', irD = '#4a4f58';
    for (let k = 0; k <= 60; k++) {
      const t = Math.PI * (k / 60);
      for (const rr of [8, 9, 10, 11]) R(Math.round(16 + Math.cos(t) * rr), Math.round(13 - Math.sin(t) * rr), 1, 1, rr === 8 ? irD : rr === 11 ? irL : ir);
    }
    for (const x of [5, 24]) { R(x, 13, 4, 14, ir); R(x, 13, 1, 14, irL); R(x + 3, 13, 1, 14, irD); R(x - 1, 26, 6, 3, irD); }
    for (const [x, y] of [[7, 17], [7, 22], [26, 17], [26, 22], [11, 6], [21, 6]]) R(x, y, 1, 2, '#1a0f0a');
    R(14, 1, 1, 3, '#fff6c0'); R(13, 2, 3, 1, '#fff6c0'); R(28, 4, 1, 1, '#fff6c0');
  },
  ace(R) {
    R(7, 2, 19, 28, '#f4ecd8'); R(7, 2, 19, 1, '#ffffff'); R(25, 3, 1, 27, '#c8bca0'); R(7, 29, 19, 1, '#c8bca0');
    const k = '#1a1418';
    R(9, 4, 1, 4, k); R(11, 4, 1, 4, k); R(10, 3, 1, 1, k); R(10, 5, 1, 1, k); // A
    R(22, 24, 1, 4, k); R(24, 24, 1, 4, k); R(23, 23, 1, 1, k); R(23, 25, 1, 1, k);
    // pique
    for (let y = 0; y < 8; y++) { const w = y < 4 ? 1 + y * 2 : 9 - (y - 4) * 0; R(16 - Math.floor(w / 2), 10 + y, w, 1, k); }
    R(12, 17, 4, 2, k); R(17, 17, 4, 2, k); R(13, 19, 2, 1, k); R(18, 19, 2, 1, k);
    R(16, 18, 1, 4, k); R(14, 22, 5, 1, k);
  },
  derringer(R) {
    const st = '#8a8f98', stL = '#d0d4da', stD = '#4a4f58';
    R(10, 10, 19, 6, st); R(10, 10, 19, 2, stL); R(10, 15, 19, 1, stD); R(27, 9, 2, 2, '#e0b040');
    R(10, 16, 14, 3, stD); R(28, 11, 2, 4, '#1a0f0a');
    R(6, 9, 6, 9, '#a8a0b8'); R(6, 9, 6, 2, '#e8e0f0');
    R(6, 7, 3, 4, stD); // chien
    R(3, 16, 9, 12, '#e8e0f0'); R(3, 16, 2, 12, '#ffffff'); R(10, 18, 2, 10, '#b8b0c8'); R(5, 20, 3, 3, '#c8c0d8'); // crosse nacrée
    R(13, 19, 1, 4, stD); R(13, 22, 5, 1, stD); R(17, 19, 1, 4, stD); R(15, 19, 1, 3, st); // pontet, détente
  },
};

const hdCache = {};
export function itemIconHD(id) {
  if (hdCache[id]) return hdCache[id];
  const draw = HD[id];
  if (!draw) return itemIcon(id);
  const c = makeCanvas(32, 32);
  const ctx = c.getContext('2d');
  const R = (x, y, w, h, col) => {
    if (col === 'transparent') { ctx.clearRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); return; }
    ctx.fillStyle = col; ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  };
  draw(R, (x, y, r, col) => disc(ctx, x, y, r, col));
  hdCache[id] = outlineCanvas(c);
  return hdCache[id];
}

const HEART = [
  '.kk.kk.',
  'kRRkrrk',
  'kRrrrrk',
  'krrrrmk',
  '.krrmk.',
  '..kmk..',
  '...k...',
];
export const heartFull = () => fromGrid(HEART);
export const heartEmpty = () => fromGrid(HEART, { ...PAL, R: '#5a4a40', r: '#3a2e28', m: '#2a201c' });
export const starIcon = (on = true) => fromGrid([
  '...k...',
  '..kyk..',
  'kkkYkkk',
  'kyyYyyk',
  '.kyyyk.',
  '.kykyk.',
  'kk...kk',
], on ? PAL : { ...PAL, y: '#4a3a30', Y: '#5a4a40' });

// Icônes d'interface (barre de titre, menus) à la place des emojis
const UI_GRIDS = {
  hat: [
    '.....kkkkkk.....',
    '....kBBBBBBk....',
    '...kBBBnnBBBk...',
    '...kBBBBBBBBk...',
    '...kBBBBBBBBk...',
    '...kmmrrrrmmk...',
    'kk.kkkkkkkkkk.kk',
    'kBkkBBBBBBBBkkBk',
    'kbBBBBBBBBBBBBbk',
    '.kbbbbbbbbbbbbk.',
    '..kkkkkkkkkkkk..',
  ],
  soundOn: [
    '.....kk......',
    '....kGk...p..',
    '...kGgk.p..p.',
    'kkkkGgk..p..p',
    'kGGGggk..p..p',
    'kGgggdk..p..p',
    'kGgggdk..p..p',
    'kkkkddk..p..p',
    '...kddk.p..p.',
    '....kdk...p..',
    '.....kk......',
  ],
  soundOff: [
    '.....kk......',
    '....kGk......',
    '...kGgk......',
    'kkkkGgk.R...R',
    'kGGGggk..R.R.',
    'kGgggdk...R..',
    'kGgggdk..R.R.',
    'kkkkddk.R...R',
    '...kddk......',
    '....kdk......',
    '.....kk......',
  ],
  next: [
    'kk...kk...kk',
    'kpk..kpk..kp',
    'kppk.kppk.kp',
    'kpppkkpppkkp',
    'kppppkppppkp',
    'kpppkkpppkkp',
    'kppk.kppk.kp',
    'kpk..kpk..kp',
    'kk...kk...kk',
  ],
  close: [
    'kk.....kk',
    'kpk...kpk',
    '.kpk.kpk.',
    '..kpkpk..',
    '...kpk...',
    '..kpkpk..',
    '.kpk.kpk.',
    'kpk...kpk',
    'kk.....kk',
  ],
  // plein écran : quatre coins
  full: [
    'kkkkk.kkkkk',
    'kpppk.kpppk',
    'kpkkk.kkkpk',
    'kpk.....kpk',
    'kkk.....kkk',
    '...........',
    'kkk.....kkk',
    'kpk.....kpk',
    'kpkkk.kkkpk',
    'kpppk.kpppk',
    'kkkkk.kkkkk',
  ],
  dice: [
    '.kkkkkkkkk.',
    'kwwwwwwwwwk',
    'kwkkwwwwwsk',
    'kwkkwwwwwsk',
    'kwwwwkkwwsk',
    'kwwwwkkwwsk',
    'kwwwwwwkksk',
    'kwwwwwwkksk',
    'ksssssssssk',
    '.kkkkkkkkk.',
  ],
  trophy: [
    '..kkkkkkkkk..',
    'kkkYYYyyyokkk',
    'kYkYYyyyyokYk',
    'kYkYyyyyyokYk',
    '.kkkyyyyyokk.',
    '...kyyyyyok..',
    '....kyyyok...',
    '.....kyok....',
    '.....kyok....',
    '...kkyyyokk..',
    '...kooooook..',
    '...kkkkkkkk..',
  ],
  skull: [
    '..kkkkkkk..',
    '.kwwwwwwwk.',
    'kwwwwwwwwsk',
    'kwkkkwkkksk',
    'kwkkkwkkksk',
    'kwwwwkwwwsk',
    '.kwwwwwwsk.',
    '..kwkwkwk..',
    '..kkkkkkk..',
  ],
};
const uiCache = {};
export function uiIcon(name) {
  return (uiCache[name] ||= fromGrid(UI_GRIDS[name]));
}

const SHELL_LIVE ={ R: '#ee6a50', r: '#c0392b', m: '#7a1a14' };
const SHELL_BLANK = { R: '#ffffff', r: '#e2dccd', m: '#a39a88' };
const shellCache = {};
export function shellSprite(live, lying = false) {
  const k = `${live}${lying}`;
  if (!shellCache[k]) {
    const pal = { ...PAL, ...(live ? SHELL_LIVE : SHELL_BLANK) };
    shellCache[k] = fromGrid(lying ? [
      'kkkkkkkkkk.',
      'kYoRRRRRRmk',
      'kyorrrrrrmk',
      'kooommmmmmk',
      'kkkkkkkkkk.',
    ] : [
      '.kkkk.',
      'kRRrmk',
      'kRrrmk',
      'kRrrmk',
      'kRrrmk',
      'kRrrmk',
      'kRrrmk',
      'kkkkkk',
      'kYyyok',
      'kooook',
      'kkkkkk',
    ], pal);
  }
  return shellCache[k];
}

// ------------------------------------------------------------- Personnage
export const CHAR_W = 48;
export const CHAR_H = 56;

const HEAD = [[17, 14, 14, 1], [15, 15, 18, 1], [14, 16, 20, 16], [15, 32, 18, 2], [16, 34, 16, 1], [17, 35, 14, 1], [19, 36, 10, 1]];

function inHead(x, y) {
  return HEAD.some(([hx, hy, hw, hh]) => x >= hx && x < hx + hw && y >= hy && y < hy + hh);
}

export function drawCharacter(ctx, c, opts = {}) {
  const { R, outlined } = painter(ctx);
  const skin = SKIN[c.skin] || SKIN[1];
  const skinD = shade(skin, -0.18);
  const skinDD = shade(skin, -0.4);
  const skinL = shade(skin, 0.18);
  const hair = HAIR_COLORS[c.hairColor] ?? HAIR_COLORS[1];
  const hairD = shade(hair, -0.35);
  const hairL = shade(hair, 0.22);
  const cloth = CLOTH_COLORS[c.outfitColor] ?? CLOTH_COLORS[2];
  const clothD = shade(cloth, -0.3);
  const clothL = shade(cloth, 0.2);
  const hatC = CLOTH_COLORS[c.hatColor] ?? CLOTH_COLORS[1];
  const hatD = shade(hatC, -0.32);
  const hatL = shade(hatC, 0.2);
  const cream = '#e2d2a6';

  // Avec un chapeau, les cheveux ne dépassent pas au-dessus du bord : on coupe tout ce qui est plus haut que HAT_CLIP.
  const hat = c.hat;
  const hatOn = hat && hat !== 'none';
  const HAT_CLIP = 17;
  const hairShape = (rects, col = hair) => {
    if (!hatOn) return outlined(rects, col);
    const cut = rects
      .map(([x, y, w, hh, cc]) => { const y2 = Math.max(y, HAT_CLIP); return [x, y2, w, y + hh - y2, cc]; })
      .filter((r) => r[3] > 0);
    for (const r of cut) { const top = r[1] === HAT_CLIP ? r[1] : r[1] - 1; R(r[0] - 1, top, r[2] + 2, r[1] + r[3] + 1 - top, OUT); }
    for (const r of cut) R(r[0], r[1], r[2], r[3], r[4] || col);
  };
  const inFace = (x, y) => inHead(x, y) || (y >= 22 && y < 27 && (x === 12 || x === 13 || x === 34 || x === 35));
  // Pilosité du visage : contour noir seulement hors du visage, ombre portée sur la peau.
  const faceHair = (rects) => {
    const mask = new Set();
    for (const [x, y, w, hh] of rects) for (let j = y; j < y + hh; j++) for (let i = x; i < x + w; i++) mask.add(i * 100 + j);
    const has = (x, y) => mask.has(x * 100 + y);
    for (const k of mask) {
      const x = Math.floor(k / 100), y = k % 100;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (has(nx, ny)) continue;
        if (!inFace(nx, ny)) R(nx, ny, 1, 1, OUT);
        else if (dx === 0 && dy === 1) R(nx, ny, 1, 1, skinD);
      }
    }
    for (const k of mask) { const x = Math.floor(k / 100), y = k % 100; R(x, y, 1, 1, has(x, y + 1) ? hair : hairD); }
  };

  // Cheveux arrière (derrière le torse)
  const h = c.hair;
  if (h === 'long') {
    hairShape([[12, 16, 24, 16], [11, 28, 7, 14], [30, 28, 7, 14]]);
    R(13, 30, 1, 10, hairL); R(33, 30, 1, 10, hairL); R(16, 34, 1, 7, hairD); R(31, 34, 1, 7, hairD);
  }
  if (h === 'ponytail') { hairShape([[33, 18, 4, 18]]); R(33, 22, 4, 1, hairD); R(34, 26, 1, 8, hairL); }
  if (h === 'mullet') { hairShape([[13, 20, 22, 20]]); R(14, 30, 1, 8, hairL); R(33, 30, 1, 8, hairL); }

  // Cou
  outlined([[20, 34, 8, 9]], skinD);
  R(20, 36, 8, 2, skinDD);

  // Torse / tenue
  const o = c.outfit;
  if (o === 'poncho') {
    outlined([[9, 42, 30, 2], [4, 44, 40, 12]], cloth);
    for (let x = 4; x < 44; x++) {
      if ((x >> 1) % 2 === 0) R(x, 47, 1, 1, clothL); else R(x, 48, 1, 1, clothL);
      if ((x >> 1) % 2 === 0) R(x, 52, 1, 1, '#e8c070'); else R(x, 51, 1, 1, '#e8c070');
    }
    R(4, 49, 40, 1, clothD);
    R(20, 41, 8, 2, skinD);
    R(19, 42, 10, 1, clothD);
  } else {
    const shirtCol = o === 'shirt' ? cloth : (o === 'duster' ? cream : '#d8c8a0');
    outlined([[10, 42, 28, 2], [6, 44, 36, 12]], shirtCol);
    if (o === 'shirt') {
      R(22, 42, 4, 3, skinD);
      R(18, 42, 4, 2, clothL); R(26, 42, 4, 2, clothL);
      R(23, 47, 1, 1, OUT); R(23, 51, 1, 1, OUT);
      R(6, 52, 36, 1, clothD);
    } else if (o === 'duster') {
      R(6, 44, 15, 12, cloth); R(27, 44, 15, 12, cloth);
      R(10, 42, 10, 2, cloth); R(28, 42, 10, 2, cloth);
      R(16, 38, 4, 9, clothL); R(28, 38, 4, 9, clothL);
      R(15, 38, 1, 10, OUT); R(32, 38, 1, 10, OUT);
      R(20, 42, 1, 14, clothD); R(27, 42, 1, 14, clothD);
      R(21, 42, 6, 3, '#8a2a1e');
    } else {
      // gilet ou shérif
      R(6, 44, 14, 12, cloth); R(28, 44, 14, 12, cloth);
      R(10, 42, 10, 2, cloth); R(28, 42, 10, 2, cloth);
      R(19, 44, 1, 12, clothD); R(28, 44, 1, 12, clothD);
      R(20, 41, 8, 3, '#a8302a'); R(22, 44, 4, 2, '#a8302a');
      R(17, 48, 1, 1, '#e0b040'); R(17, 52, 1, 1, '#e0b040');
      if (o === 'sheriff') {
        const sx = 10, sy = 46;
        R(sx + 2, sy, 1, 1, '#f8e08a');
        R(sx, sy + 1, 5, 1, '#e0b040');
        R(sx + 1, sy + 2, 3, 1, '#e0b040');
        R(sx + 1, sy + 3, 1, 1, '#a06a20'); R(sx + 3, sy + 3, 1, 1, '#a06a20');
        R(sx + 2, sy + 1, 1, 1, '#fff6c0');
      }
    }
    R(6, 55, 36, 1, shade(shirtCol, -0.3));
  }

  // Oreilles + tête
  outlined([[12, 22, 2, 5], [34, 22, 2, 5]], skin);
  R(13, 23, 1, 3, skinD); R(34, 23, 1, 3, skinD);
  outlined(HEAD, skin);
  R(31, 17, 2, 15, skinD);
  R(32, 32, 1, 2, skinD);
  R(16, 16, 2, 1, skinL);
  const blush = mix(skin, '#e06850', 0.22);
  R(16, 27, 2, 1, blush); R(29, 27, 2, 1, blush);

  // Cheveux devant
  const cap = [[15, 11, 18, 3], [13, 13, 22, 4]];
  if (h === 'short' || h === 'ponytail' || h === 'mullet') hairShape([...cap, [13, 17, 3, 5], [32, 17, 3, 5]]);
  else if (h === 'long') hairShape([...cap, [12, 17, 4, 15], [32, 17, 4, 15]]);
  else if (h === 'curly') {
    hairShape([[14, 10, 4, 3], [19, 9, 4, 3], [24, 9, 4, 3], [29, 10, 4, 3], [12, 12, 24, 5], [12, 17, 4, 7], [32, 17, 4, 7]]);
    for (const [x, y] of [[15, 10], [20, 9], [25, 9], [30, 10], [13, 14], [17, 13], [22, 14], [27, 13], [32, 14], [13, 19], [33, 20]]) {
      if (!hatOn || y >= HAT_CLIP) R(x, y, 1, 1, hairL);
    }
  } else if (h === 'messy') {
    hairShape([[13, 12, 22, 5], [14, 10, 2, 2], [18, 9, 2, 3], [23, 8, 2, 4], [28, 9, 2, 3], [32, 10, 2, 2], [13, 17, 3, 4], [32, 17, 3, 4], [20, 17, 3, 1]]);
  } else if (h === 'bald') {
    outlined([[13, 19, 2, 5], [33, 19, 2, 5]], hair);
    R(18, 15, 3, 1, skinL);
  }
  if (!hatOn) {
    if (h !== 'bald' && h !== 'curly') R(17, 12, 7, 1, hairL);
    if (h === 'short' || h === 'ponytail' || h === 'mullet' || h === 'long') R(16, 16, 16, 1, hairD);
  }

  // Yeux
  const brow = h === 'bald' ? shade(skin, -0.55) : hairD;
  const EY = 23;
  const eye = (x, right) => {
    if (opts.hurt) {
      R(x, EY - 1, 1, 1, OUT); R(x + 2, EY - 1, 1, 1, OUT); R(x + 1, EY, 1, 1, OUT);
      R(x, EY + 1, 1, 1, OUT); R(x + 2, EY + 1, 1, 1, OUT);
      return;
    }
    if (c.eyes === 'patch' && right) {
      R(x - 1, EY - 1, 5, 4, OUT); R(x, EY - 1, 2, 1, '#3a2e28');
      return;
    }
    if (opts.blink) { R(x, EY + 1, 3, 1, OUT); R(x - 1, EY - 2, 4, 1, brow); return; }
    switch (c.eyes) {
      case 'squint':
        R(x - 1, EY, 5, 1, skinD); R(x, EY + 1, 3, 1, OUT); R(x - 1, EY - 1, 5, 1, brow);
        break;
      case 'wide':
        R(x, EY - 1, 3, 3, '#f4ecd8'); R(x + 1, EY, 1, 1, OUT); R(x, EY - 3, 3, 1, brow);
        break;
      case 'angry':
        R(x, EY, 3, 2, '#f4ecd8'); R(x + 1, EY, 1, 2, OUT);
        if (!right) { R(x - 1, EY - 3, 2, 1, brow); R(x + 1, EY - 2, 2, 1, brow); }
        else { R(x + 2, EY - 3, 2, 1, brow); R(x, EY - 2, 2, 1, brow); }
        break;
      case 'tired':
        R(x, EY, 3, 2, '#f4ecd8'); R(x + 1, EY + 1, 1, 1, OUT); R(x, EY, 3, 1, skinD);
        R(x, EY + 2, 3, 1, skinD); R(x - 1, EY - 2, 4, 1, brow);
        break;
      default:
        R(x, EY, 3, 2, '#f4ecd8'); R(x + 1, EY, 1, 2, OUT); R(x - 1, EY - 2, 4, 1, brow);
    }
  };
  eye(18, false);
  eye(27, true);
  if (c.eyes === 'patch') { R(15, 20, 11, 1, OUT); R(31, 20, 3, 1, OUT); }

  // Nez (s'arrête en y=27 pour laisser la place à la moustache)
  switch (c.nose) {
    case 'big': R(22, 24, 4, 3, skinD); R(22, 27, 4, 1, skinDD); R(23, 24, 1, 1, skinL); break;
    case 'hooked': R(23, 22, 2, 5, skinD); R(24, 25, 2, 2, skinD); R(23, 27, 3, 1, skinDD); break;
    case 'round': R(22, 24, 4, 3, skinD); R(21, 25, 6, 1, skinD); R(22, 27, 4, 1, skinDD); R(23, 24, 1, 1, skinL); break;
    case 'red': R(22, 24, 4, 3, '#c84a3a'); R(21, 25, 6, 1, '#c84a3a'); R(22, 27, 4, 1, '#8a2a20'); R(23, 24, 1, 1, '#f08070'); break;
    case 'broken': R(23, 23, 1, 2, skinD); R(24, 25, 1, 2, skinD); R(23, 27, 2, 1, skinDD); break;
    default: R(23, 25, 2, 2, skinD); R(23, 27, 2, 1, skinDD);
  }

  // Bouche
  const b = c.beard;
  const m = c.mouth;
  if (b === 'stubble') {
    const st = mix(skin, hair, 0.45);
    for (let y = 28; y < 37; y++) for (let x = 14; x < 34; x++) {
      if ((x + y) % 2 === 0 && inHead(x, y) && (x < 20 || x > 27 || y >= 33)) R(x, y, 1, 1, st);
    }
  }
  const drawMouth = (lip) => {
    if (m === 'smile') { R(21, 32, 6, 1, lip); R(20, 31, 1, 1, lip); R(27, 31, 1, 1, lip); }
    else if (m === 'frown') { R(21, 31, 6, 1, lip); R(20, 32, 1, 1, lip); R(27, 32, 1, 1, lip); }
    else if (m === 'grin') { R(20, 31, 8, 2, OUT); R(21, 31, 6, 1, '#f4ecd8'); R(25, 31, 1, 1, '#f0c040'); }
    else R(21, 31, 6, 1, lip);
  };
  drawMouth(shade(skin, -0.55));

  // Barbe et moustaches
  if (b === 'full') {
    faceHair([[14, 25, 3, 9], [31, 25, 3, 9], [15, 28, 18, 7], [16, 35, 16, 2], [18, 37, 12, 2], [20, 39, 8, 1]]);
    R(20, 30, 8, 1, hairD);
    R(21, 28, 3, 1, hairL); R(17, 33, 1, 1, hairL); R(29, 32, 1, 1, hairL); R(23, 37, 1, 1, hairL);
    drawMouth(shade(hair, -0.6));
  } else if (b === 'chops') {
    faceHair([[14, 19, 3, 8], [31, 19, 3, 8], [14, 27, 5, 3], [29, 27, 5, 3], [19, 28, 10, 2]]);
    R(15, 21, 1, 4, hairL); R(32, 21, 1, 4, hairL); R(21, 28, 3, 1, hairL);
  } else if (b === 'goatee') {
    faceHair([[21, 28, 6, 1], [22, 33, 4, 4], [23, 37, 2, 1]]);
    R(23, 33, 1, 2, hairL);
  } else if (b === 'horseshoe') {
    faceHair([[19, 28, 10, 2], [19, 30, 2, 6], [27, 30, 2, 6]]);
    R(21, 28, 3, 1, hairL);
  } else if (b === 'mustache') {
    faceHair([[20, 28, 8, 2]]);
    R(21, 28, 3, 1, hairL);
  } else if (b === 'handlebar') {
    faceHair([[19, 28, 10, 2], [17, 27, 2, 2], [29, 27, 2, 2], [16, 26, 1, 1], [31, 26, 1, 1]]);
    R(21, 28, 3, 1, hairL);
  }
  if (opts.hurt) { R(21, 31, 6, 2, OUT); }

  // Accessoires en bouche (par-dessus la moustache)
  if (m === 'cigar') {
    R(26, 30, 7, 3, OUT);
    R(26, 31, 6, 1, '#7a4a24'); R(28, 31, 1, 1, '#c0392b'); R(32, 31, 1, 1, '#f87818');
    const t = opts.t || 0;
    for (let k = 0; k < 3; k++) {
      const yy = 28 - k * 2 - Math.floor((t / 400) % 2);
      R(33 + ((k + Math.floor(t / 300)) % 2), yy, 1, 1, 'rgba(220,210,200,0.7)');
    }
  }
  if (m === 'toothpick') for (const [x, y] of [[27, 31], [28, 31], [29, 30], [30, 30], [31, 29]]) R(x, y, 1, 1, '#e8d090');

  // Chapeau
  if (hat === 'cowboy') {
    outlined([[17, 5, 6, 2], [25, 5, 6, 2], [16, 7, 16, 9]], hatC);
    R(22, 5, 4, 2, hatD); R(23, 7, 2, 3, hatD); R(17, 7, 2, 6, hatL);
    R(16, 13, 16, 2, shade(hatC, -0.5));
    R(18, 13, 2, 2, '#c8a050');
    outlined([[5, 13, 4, 3], [39, 13, 4, 3], [7, 15, 34, 3]], hatC);
    R(9, 15, 30, 1, hatL); R(6, 13, 2, 1, hatL); R(40, 13, 2, 1, hatL); R(7, 17, 34, 1, hatD);
  } else if (hat === 'sombrero') {
    outlined([[20, 1, 8, 2], [18, 3, 12, 10]], hatC);
    R(19, 4, 2, 6, hatL); R(28, 4, 1, 8, hatD);
    for (let x = 18; x < 30; x++) R(x, 10 + (x % 2), 1, 1, '#e0b040');
    R(18, 12, 12, 1, hatD);
    outlined([[1, 11, 3, 3], [44, 11, 3, 3], [3, 13, 42, 4]], hatC);
    R(4, 13, 40, 1, hatL); R(2, 11, 1, 2, hatL); R(45, 11, 1, 2, hatL);
    R(3, 16, 42, 1, hatD);
    for (let x = 5; x < 44; x += 3) R(x, 14 + ((x >> 1) % 2), 1, 1, '#e0b040');
  } else if (hat === 'bowler') {
    outlined([[18, 6, 12, 2], [16, 8, 16, 8]], hatC);
    R(18, 8, 2, 4, hatL); R(19, 7, 4, 1, hatL); R(16, 13, 16, 2, hatD);
    outlined([[13, 15, 22, 2]], hatC);
    R(13, 15, 22, 1, hatL);
  } else if (hat === 'tophat') {
    outlined([[17, 1, 14, 14]], hatC);
    R(18, 2, 2, 9, hatL); R(29, 2, 1, 13, hatD); R(17, 11, 14, 2, '#7a2a1e');
    outlined([[12, 15, 24, 2]], hatC);
    R(12, 16, 24, 1, hatD);
  } else if (hat === 'gambler') {
    outlined([[16, 8, 16, 7]], hatC);
    R(16, 12, 16, 2, hatD); R(17, 8, 14, 1, hatL);
    outlined([[8, 15, 32, 2]], hatC);
    R(8, 15, 32, 1, hatL);
  } else if (hat === 'bandana') {
    outlined([[14, 11, 20, 6], [33, 13, 4, 3], [35, 16, 2, 4], [37, 15, 2, 3]], hatC);
    for (const [x, y] of [[16, 12], [20, 14], [24, 12], [28, 14], [31, 12], [18, 15], [26, 15]]) R(x, y, 1, 1, '#f4ecd8');
    R(14, 16, 20, 1, hatD);
  } else if (hat === 'coonskin') {
    const fur = '#8a6a48', furD = '#4a3420', furL = '#b89068';
    outlined([[15, 8, 18, 2], [14, 10, 20, 7], [33, 13, 4, 20]], fur);
    for (let y = 15; y < 33; y += 4) R(33, y, 4, 2, furD);
    R(33, 31, 4, 2, furD);
    for (let x = 15; x < 33; x += 3) R(x, 9 + (x % 2), 1, 1, furL);
    R(14, 16, 20, 1, furD);
  }
}

const charCache = new Map();
export function characterSprite(c, opts = {}) {
  const key = JSON.stringify(c) + (opts.blink ? 'b' : '') + (opts.hurt ? 'h' : '') + (opts.tint || '') +
    (c.mouth === 'cigar' ? Math.floor((opts.t || 0) / 300) % 4 : '');
  let s = charCache.get(key);
  if (!s) {
    s = makeCanvas(CHAR_W, CHAR_H);
    const ctx = s.getContext('2d');
    drawCharacter(ctx, c, opts);
    if (opts.tint) {
      ctx.globalCompositeOperation = 'source-atop';
      ctx.fillStyle = opts.tint;
      ctx.fillRect(0, 0, CHAR_W, CHAR_H);
    }
    if (charCache.size > 200) charCache.clear();
    charCache.set(key, s);
  }
  return s;
}

// Portrait encadré pour l'interface (fond désert)
export function portrait(c, scale = 3, opts = {}) {
  const w = CHAR_W + 8, hh = CHAR_H + 4;
  const base = makeCanvas(w, hh);
  const ctx = base.getContext('2d');
  const bands = ['#d9b88a', '#e3c697', '#ebd2a5', '#f0dcb0'];
  bands.forEach((col, i) => { ctx.fillStyle = col; ctx.fillRect(0, (i * hh) / 4, w, hh / 4 + 1); });
  ctx.fillStyle = '#9a6448';
  ctx.fillRect(0, hh - 18, w, 18);
  ctx.drawImage(characterSprite(c, opts), 4, 4);
  const out = makeCanvas(w * scale, hh * scale);
  const o = out.getContext('2d');
  o.imageSmoothingEnabled = false;
  o.drawImage(base, 0, 0, out.width, out.height);
  return out;
}

// ------------------------------------------------------------- Fusils
// Un modèle par partie, tiré de la graine (scene.js) : mécanisme (pompe, levier, deux coups), bois et métal.
const WOODS = {
  walnut: { b: '#8a5228', l: '#b07038', d: '#5a3218', dd: '#3e2010' },
  cherry: { b: '#9a3e22', l: '#c4623a', d: '#6a2614', dd: '#4a180c' },
  dark: { b: '#5a3420', l: '#7c4c30', d: '#3a2014', dd: '#26140a' },
  blond: { b: '#b88a48', l: '#dcb070', d: '#8a6030', dd: '#5a3c1c' },
};
const METALS = {
  blued: { b: '#5c626c', l: '#b8bec6', d: '#3a3e46', x: '#2e3136' },
  nickel: { b: '#a4a8b0', l: '#eceff2', d: '#6a707a', x: '#868c96' },
  brass: { b: '#c89a40', l: '#f4d47a', d: '#8a6420', x: '#a87a28' },
  case: { b: '#6e6478', l: '#c8b0d8', d: '#463c50', x: '#564a62' },
};
export const GUNS = {
  pump: { name: 'un fusil à pompe', action: 'pump', wood: 'walnut', metal: 'blued', recv: 'blued' },
  nickel: { name: 'un fusil à pompe nickelé', action: 'pump', wood: 'dark', metal: 'nickel', recv: 'nickel' },
  lever: { name: 'un fusil à levier', action: 'lever', wood: 'cherry', metal: 'blued', recv: 'brass' },
  double: { name: 'un fusil à deux coups', action: 'double', wood: 'walnut', metal: 'blued', recv: 'case' },
  coach: { name: 'un fusil de diligence à deux coups', action: 'double', short: true, wood: 'blond', metal: 'blued', recv: 'nickel' },
};
const gunDef = (kind) => GUNS[kind] || GUNS.pump;
export function pickGun(seed) {
  const ids = Object.keys(GUNS);
  return ids[(Math.imul(seed >>> 0, 2654435761) >>> 9) % ids.length];
}
// bout du canon dans le sprite de profil (gunSprite)
export function gunEnd(sawed, kind = 'pump') {
  const g = gunDef(kind);
  const full = g.short ? 84 : g.action === 'pump' ? 98 : 96;
  return sawed ? full - 24 : full;
}

export const GUN_W = 100;
export const GUN_H = 18;
const gunCache = {};
// Fusil de profil (sur la table, ou tenu par l'adversaire). pump > 0 : pompe tirée, levier ouvert ou fusil cassé.
export function gunSprite(sawed = false, pump = 0, kind = 'pump') {
  const key = `${kind}-${sawed}-${pump}`;
  if (gunCache[key]) return gunCache[key];
  const c = makeCanvas(GUN_W, GUN_H);
  const ctx = c.getContext('2d');
  const { R, outlined } = painter(ctx);
  const g = gunDef(kind), Wd = WOODS[g.wood], M = METALS[g.metal], X = METALS[g.recv];
  const end = gunEnd(sawed, kind);

  if (g.action === 'double') {
    // deux canons (de profil, l'un derrière l'autre) ; cassé : ils basculent autour de la charnière
    const dy = (x) => (pump ? Math.round((x - 48) * 0.12) : 0);
    for (let x = 48; x < end; x++) R(x, 2 + dy(x), 1, 8, OUT);
    for (let x = 49; x < end - 1; x++) {
      R(x, 3 + dy(x), 1, 2, M.b); R(x, 3 + dy(x), 1, 1, M.l); R(x, 5 + dy(x), 1, 1, M.d); R(x, 6 + dy(x), 1, 3, M.b); R(x, 8 + dy(x), 1, 1, M.d);
    }
    if (!sawed) R(end - 3, 1 + dy(end), 2, 1, '#e0b040');
    for (let x = 50; x < 64; x++) { R(x, 9 + dy(x), 1, 3, OUT); R(x, 9 + dy(x), 1, 2, x === 50 || x === 63 ? Wd.d : Wd.b); }
  } else {
    outlined([[48, 4, end - 48, 3]], M.b);
    R(48, 4, end - 48, 1, M.l);
    outlined([[48, 8, end - 56 + (sawed ? 2 : 0), 2]], M.d);
    if (sawed) { R(end - 1, 3, 1, 1, OUT); R(end, 7, 1, 1, OUT); }
    else R(end - 2, 3, 2, 1, '#e0b040');
  }

  // crosse
  const cols = [];
  for (let x = 1; x <= 30; x++) {
    const top = Math.round(8 - (2 * x) / 30);
    const bot = Math.round(16 - (6 * x) / 30);
    cols.push([x, top, 1, bot - top]);
  }
  outlined(cols, Wd.b);
  for (let x = 3; x <= 28; x++) R(x, Math.round(8 - (2 * x) / 30), 1, 1, Wd.l);
  for (let x = 6; x <= 26; x += 5) R(x, 11 - Math.round(x / 15), 3, 1, Wd.d); // veines
  R(1, 8, 2, 8, Wd.dd);
  // poignée
  outlined([[28, 6, 8, 5]], Wd.b);
  R(29, 6, 6, 1, Wd.l);
  // carcasse
  outlined([[34, 3, 16, 8]], X.x);
  R(35, 4, 14, 1, X.b);
  if (g.recv === 'brass' || g.recv === 'nickel' || g.recv === 'case') { R(36, 6, 11, 3, X.b); R(36, 6, 11, 1, X.l); }
  if (g.action === 'double') {
    // deux chiens
    for (const hx of [35, 39]) { R(hx - 1, 0, 4, 4, OUT); R(hx, 1, 2, 3, M.d); R(hx, 1, 1, 1, M.l); }
  } else if (g.action === 'pump') R(38, 6, 6, 1, '#1e2024');
  // pontet + détente, ou levier (ouvert quand on recharge)
  if (g.action === 'lever') {
    const o = pump ? 3 : 0;
    R(36 - o, 11 + o, 12, 1, OUT); R(36 - o, 11 + o, 1, 6, OUT); R(47 - o, 11 + o, 1, 4, OUT); R(36 - o, 16 + o, 8, 1, OUT);
    R(37 - o, 12 + o, 10, 1, X.b); R(37 - o, 12 + o, 1, 4, X.b); R(37 - o, 15 + o, 6, 1, X.b);
    outlined([[56, 7, 12, 4]], Wd.b); R(56, 7, 12, 1, Wd.l);
  } else {
    R(37, 11, 8, 1, OUT); R(37, 11, 1, 4, OUT); R(44, 11, 1, 4, OUT); R(37, 14, 8, 1, OUT);
    R(40, 11, 1, 3, M.b);
  }
  // pompe
  if (g.action === 'pump') {
    const px = 58 - pump;
    outlined([[px, 7, 18, 5]], Wd.b);
    R(px, 7, 18, 1, Wd.l);
    for (let x = px + 2; x < px + 17; x += 3) R(x, 9, 1, 2, Wd.d);
  }
  gunCache[key] = c;
  return c;
}

// Fusil vu de face (canon pointé vers la caméra)
export function drawGunFront(ctx, cx, cy, r, skin, sawed, kind = 'pump') {
  const { R } = painter(ctx);
  const g = gunDef(kind), Wd = WOODS[g.wood], M = METALS[g.metal];
  const bore = sawed ? mix(M.b, '#8a6a50', 0.35) : M.b;
  const dbl = g.action === 'double';
  // fût en bois sous le canon
  const py = cy + Math.round(r * (dbl ? 1.45 : 1.7));
  const pr = Math.round(r * (dbl ? 0.95 : 1.15));
  // main de devant, vue de face : elle tient le fût par en dessous (u = échelle, 1 pour le petit fusil)
  const u = r / 9;
  const hp = (pts) => pts.map(([x, y]) => [cx + x * u, py + y * u]);
  const sd = skin && shade(skin, -0.25), sl = skin && shade(skin, 0.18);
  if (skin) {
    // paume et poignet qui dépassent sous le fût (dessinés avant lui)
    const palm = fillPoly(R, hp([[-8, 2], [8, 2], [7, 10], [4, 17], [-4, 17], [-7, 10]]), skin);
    for (const [y, a, b] of palm) { R(b - Math.max(1, Math.round(u)) + 1, y, Math.max(1, Math.round(u)), 1, sd); R(a, y, 1, 1, sl); }
    R(Math.round(cx - 3 * u), Math.round(py + 12 * u), Math.round(6 * u), Math.max(1, Math.round(u * 0.6)), sd); // pli du poignet
  }
  disc(ctx, cx, py, pr + 1, OUT);
  disc(ctx, cx, py, pr, Wd.b);
  disc(ctx, cx - 1, py - 1, Math.round(pr * 0.7), Wd.l);
  disc(ctx, cx, py, Math.round(pr * 0.62), Wd.d);
  if (!dbl) {
    disc(ctx, cx, py, Math.round(r * 0.5), M.x);
    disc(ctx, cx, py, Math.round(r * 0.28), '#0c0a0a');
  }
  const muzzle = (x, y, rr) => {
    disc(ctx, x + 1, y + 1, rr + 1, OUT);
    disc(ctx, x, y, rr + 1, OUT);
    disc(ctx, x, y, rr, bore);
    disc(ctx, x - Math.round(rr * 0.15), y - Math.round(rr * 0.15), Math.round(rr * 0.82), M.l);
    disc(ctx, x, y, Math.round(rr * 0.72), M.d);
    disc(ctx, x, y, Math.round(rr * 0.6), '#120c0c');
    disc(ctx, x + Math.round(rr * 0.1), y + Math.round(rr * 0.1), Math.round(rr * 0.42), '#000');
  };
  if (dbl) {
    // deux canons côte à côte, et la bande entre eux
    const off = Math.round(r * 0.92), rr = Math.round(r * 0.88);
    muzzle(cx - off, cy, rr);
    muzzle(cx + off, cy, rr);
    R(cx - 1, cy - rr, 3, Math.round(rr * 0.6), M.b); R(cx, cy - rr, 1, Math.round(rr * 0.6), M.l);
    if (!sawed) R(cx - 1, cy - rr - 3, 3, 2, '#e0b040');
  } else {
    muzzle(cx, cy, r);
    if (!sawed) R(cx - 1, cy - r - 3, 3, 2, '#e0b040');
  }
  // doigts repliés sur le flanc droit du fût, pouce sur le flanc gauche (dessinés par-dessus)
  if (skin) {
    const e = pr / u; // bord du fût, en unités
    for (let k = 0; k < 4; k++) {
      const y = -4.6 + k * 2.4;
      const w = [3.2, 3.8, 3.8, 3.2][k];
      const f = fillPoly(R, hp([[e - w, y], [e + 1.6, y], [e + 2.4, y + 0.8], [e + 2.4, y + 1.4], [e + 1.6, y + 2.2], [e - w, y + 2.2]]), skin);
      if (f.length) { const [fy, fa, fb] = f[0]; R(fa, fy, fb - fa + 1, 1, sl); R(fa, fy + 1, 1, Math.max(1, f.length - 1), shade(skin, 0.3)); }
    }
    const th = fillPoly(R, hp([[-e - 2.6, -1.5], [-e + 3.4, -2.2], [-e + 3.8, -0.6], [-e + 3.2, 0.6], [-e - 2.6, 0.8]]), skin);
    if (th.length) { const [ty, ta, tb] = th[0]; R(ta, ty, tb - ta + 1, 1, sl); }
    const nx = Math.round(cx + (-e + 2.4) * u), ny = Math.round(py - 1.6 * u);
    R(nx, ny, Math.max(1, Math.round(u)), Math.max(1, Math.round(u)), shade(skin, 0.32)); // ongle du pouce
  }
}

// Polygone convexe rempli ligne par ligne (bords nets, sans anticrénelage), contour d'un pixel en option.
// Renvoie les lignes [y, x0, x1] pour ombrer ensuite.
function fillPoly(R, pts, col, outline = true) {
  const ys = pts.map((p) => p[1]);
  const y0 = Math.ceil(Math.min(...ys)), y1 = Math.floor(Math.max(...ys));
  const rows = [];
  for (let y = y0; y <= y1; y++) {
    let a = Infinity, b = -Infinity;
    for (let i = 0; i < pts.length; i++) {
      const [xa, ya] = pts[i], [xb, yb] = pts[(i + 1) % pts.length];
      if (y < Math.min(ya, yb) || y > Math.max(ya, yb)) continue;
      if (ya === yb) { a = Math.min(a, xa, xb); b = Math.max(b, xa, xb); continue; }
      const x = xa + ((xb - xa) * (y - ya)) / (yb - ya);
      a = Math.min(a, x); b = Math.max(b, x);
    }
    if (a <= b) rows.push([y, Math.round(a), Math.round(b)]);
  }
  if (outline) for (const [y, a, b] of rows) R(a - 1, y - 1, b - a + 3, 3, OUT);
  for (const [y, a, b] of rows) R(a, y, b - a + 1, 1, col);
  return rows;
}

// Fusil vu de dos (première personne), pointé vers (tx, ty), tenu à deux mains. cloth : couleur des manches.
// La main gauche est sous le fût : on ne voit que la paume d'un côté, le bout des doigts qui s'enroulent
// sur le flanc gauche et le pouce sur le flanc droit, jamais par-dessus le canon.
export function drawGunFirstPerson(ctx, tx, ty, skin, sawed, recoil = 0, cloth = '#7a2a1e', kind = 'pump') {
  const { R } = painter(ctx);
  const g = gunDef(kind), Wd = WOODS[g.wood], M = METALS[g.metal], X = METALS[g.recv];
  const dbl = g.action === 'double';
  const topY = ty + recoil + (sawed ? 26 : 0) + (g.short ? 14 : 0);
  const nearY = 176 + recoil; // arrière du canon, contre la carcasse
  const span = nearY - topY;
  const cxAt = (t) => tx + (192 - tx) * t;
  const yAt = (t) => topY + span * t;
  const band = (t0, t1, hw0, hw1, dx0 = 0, dx1 = 0) => [[cxAt(t0) + dx0 - hw0, yAt(t0)], [cxAt(t0) + dx0 + hw0, yAt(t0)], [cxAt(t1) + dx1 + hw1, yAt(t1)], [cxAt(t1) + dx1 - hw1, yAt(t1)]];
  // ombre / reflet sur les bords de chaque ligne
  const sides = (rows, lo, hi, loW = 1, hiW = 1) => {
    for (const [y, a, b] of rows) {
      if (b - a < 2) continue;
      R(a, y, hiW, 1, hi);
      R(b - loW + 1, y, loW, 1, lo);
    }
  };
  const sd = skin && shade(skin, -0.22), sdd = skin && shade(skin, -0.42), sl = skin && shade(skin, 0.18);
  const cl = shade(cloth, 0.15), cd = shade(cloth, -0.32);
  const bottom = 216 + recoil + 40;

  // fût (pompe rainurée, devant fixe ou fût de deux coups) : position et demi-largeur
  const fT0 = g.action === 'pump' ? 0.4 : dbl ? 0.5 : 0.55, fT1 = g.action === 'pump' ? 0.74 : dbl ? 0.8 : 0.78;
  const fw = (t) => (dbl ? 8 + 12 * t : 7 + 17 * t);
  const gripT = (fT0 + fT1) / 2;
  const hy = Math.round(yAt(gripT));
  const fl = Math.round(cxAt(gripT) - fw(gripT)), fr = Math.round(cxAt(gripT) + fw(gripT));
  // bords gauche / droit du fût à la ligne y (il s'élargit vers soi)
  const tOf = (y) => (y - topY) / span;
  const edgeL = (y) => Math.round(cxAt(tOf(y)) - fw(tOf(y)));
  const edgeR = (y) => Math.round(cxAt(tOf(y)) + fw(tOf(y)));

  // main gauche, sous le fût (dessinée avant le fusil) : l'avant-bras arrive d'en bas à gauche,
  // le poignet s'engage sous le fût, la tranche de la main dépasse à peine à droite sous les doigts.
  if (skin) {
    const sleeveL = fillPoly(R, [[fl - 20, hy + 8], [fl - 2, hy + 15], [fl - 22, bottom], [fl - 68, bottom]], cloth);
    sides(sleeveL, cd, cl, 3, 2);
    fillPoly(R, [[fl - 21, hy + 6], [fl - 2, hy + 13], [fl - 4, hy + 18], [fl - 23, hy + 11]], cd); // revers de la manche
    const heel = fillPoly(R, [[fl - 12, hy - 1], [fl + 8, hy - 4], [fl + 12, hy + 9], [fl - 2, hy + 13], [fl - 14, hy + 7]], skin);
    sides(heel, sd, sl, 2, 1);
    R(fl - 9, hy + 5, 6, 1, sd); // pli du poignet
    fillPoly(R, [[fr - 2, hy - 10], [fr + 3, hy - 8], [fr + 4, hy + 8], [fr - 2, hy + 10]], sd); // tranche de la main
  }

  // tube magasin, sous le canon : on n'en voit que les flancs
  if (!dbl && !sawed) fillPoly(R, band(0.06, 1, 3.4, 9.5), M.x);
  // fût
  const y0 = yAt(fT0), y1 = yAt(fT1), ph0 = fw(fT0), ph1 = fw(fT1);
  const fore = fillPoly(R, [
    [cxAt(fT0) - ph0 + 1, y0], [cxAt(fT0) + ph0 - 1, y0], [cxAt(fT0) + ph0, y0 + 2],
    [cxAt(fT1) + ph1, y1 - 2], [cxAt(fT1) + ph1 - 1, y1], [cxAt(fT1) - ph1 + 1, y1], [cxAt(fT1) - ph1, y1 - 2], [cxAt(fT0) - ph0, y0 + 2],
  ], Wd.b);
  if (g.action === 'pump') {
    for (const [y, a, b] of fore) {
      const k = y - Math.round(y0);
      if (k > 2 && k < Math.round(y1 - y0) - 2 && k % 3 === 0) R(a + 1, y, b - a - 1, 1, Wd.d);
    }
  } else {
    for (const [y, a, b] of fore) if ((y + a) % 7 === 0) R(Math.round((a + b) / 2) + ((y % 5) - 2), y, 2, 1, Wd.d); // veines
  }
  sides(fore, Wd.d, Wd.l, 2, 2);

  // canon(s)
  const tube = (dx0, dx1, hw0, hw1) => {
    const rows = fillPoly(R, band(0, 1, hw0, hw1, dx0, dx1), sawed ? mix(M.b, '#8a6a50', 0.3) : M.b);
    for (const [y, a, b] of rows) {
      const c = Math.round((a + b) / 2);
      if (b - a >= 2) { R(a, y, 1, 1, mix(M.b, M.l, 0.3)); R(b - 1, y, 2, 1, M.d); }
      R(c - 1, y, 1, 1, M.l);
    }
    return rows;
  };
  if (dbl) {
    // deux canons côte à côte, qui se rapprochent vers la bouche ; bande plate entre les deux
    tube(-2, -7, 1.4, 5.5);
    tube(2, 7, 1.4, 5.5);
    fillPoly(R, band(0.02, 1, 0.6, 1.8), M.d, false);
    for (const dx of [-2, 2]) { R(Math.round(tx + dx) - 1, Math.round(topY) - 1, 3, 2, OUT); R(Math.round(tx + dx), Math.round(topY), 1, 1, '#000'); }
    if (!sawed) { R(Math.round(tx) - 1, topY - 3, 2, 3, OUT); R(Math.round(tx) - 1, topY - 2, 2, 2, '#e0b040'); }
  } else {
    const barrel = tube(0, 0, 1.6, 7);
    for (const [y, a, b] of barrel) {
      const c = Math.round((a + b) / 2);
      if (b - a >= 6 && (y - Math.round(topY)) % 5 === 0 && g.action === 'pump') R(c, y, 1, 1, M.d); // bande ventilée
    }
    if (sawed) {
      R(tx - 2, topY, 5, 1, M.d); R(tx - 1, topY - 1, 1, 1, M.l); // coupe à la scie, brute
    } else {
      R(Math.round(tx) - 2, topY, 5, 2, M.d);
      R(Math.round(tx) - 1, topY - 3, 2, 3, OUT); R(Math.round(tx) - 1, topY - 2, 2, 2, '#e0b040'); R(Math.round(tx) - 1, topY - 2, 1, 1, '#fff0a0');
    }
  }

  // la main gauche tient le fût par en dessous : pouce allongé le long du flanc gauche (pointé vers l'avant),
  // bouts des quatre doigts repliés par-dessus le flanc droit, empilés le long du fût.
  if (skin) {
    const yT = hy - 13, yB = hy + 8;
    const thumb = fillPoly(R, [[edgeL(yT) - 1, yT + 1], [edgeL(yT) + 1, yT], [edgeL(yT) + 3, yT + 2], [edgeL(yB) + 4, yB], [edgeL(yB) - 3, yB + 2], [edgeL(yB) - 4, yB]], skin);
    sides(thumb, sd, sl, 1, 1);
    R(edgeL(yT), yT + 1, 2, 2, shade(skin, 0.32)); // ongle
    R(edgeL(yT + 4) + 2, yT + 4, 1, 4, sd); // jointure
    for (let k = 0; k < 4; k++) {
      const y = hy - 10 + k * 4;
      const e = edgeR(y + 1);
      const w = [4, 5, 5, 4][k];
      fillPoly(R, [[e - w, y], [e + 1, y], [e + 2, y + 1], [e + 2, y + 2], [e + 1, y + 3], [e - w, y + 3], [e - w - 1, y + 2], [e - w - 1, y + 1]], skin);
      R(e - w, y, w + 1, 1, sl); // dessus éclairé
      R(e - w - 1, y + 1, 1, 2, shade(skin, 0.28)); // ongle, côté fût
      R(e + 1, y + 2, 1, 1, sd);
    }
  }

  // carcasse
  const rx = 192;
  const recv = fillPoly(R, [[rx - 17, nearY - 4], [rx + 17, nearY - 4], [rx + 21, nearY + 18], [rx - 21, nearY + 18]], X.x);
  R(rx - 16, nearY - 4, 33, 3, X.b); R(rx - 15, nearY - 4, 31, 1, X.l);
  sides(recv, shade(X.x, -0.4), X.b, 2, 1);
  if (g.action === 'pump') {
    // fenêtre d'éjection et cartouche rouge
    R(rx + 7, nearY + 2, 9, 11, '#0e0f12'); R(rx + 8, nearY + 3, 7, 5, '#c83828'); R(rx + 8, nearY + 3, 7, 1, '#e86848'); R(rx + 8, nearY + 8, 7, 3, '#e0b040'); R(rx + 8, nearY + 8, 7, 1, '#fff0a0');
  } else if (g.action === 'lever') {
    // carcasse en laiton gravée, porte de chargement
    for (let k = 0; k < 4; k++) R(rx - 12 + k * 7, nearY + 4 + (k % 2) * 4, 4, 1, X.l);
    R(rx + 8, nearY + 8, 8, 5, X.d); R(rx + 8, nearY + 8, 8, 1, X.b);
  } else {
    // clé d'ouverture et deux chiens armés
    fillPoly(R, [[rx - 2, nearY - 2], [rx + 8, nearY - 1], [rx + 8, nearY + 2], [rx - 2, nearY + 3]], M.b);
    for (const dx of [-13, 13]) {
      fillPoly(R, [[rx + dx - 3, nearY - 9], [rx + dx + 2, nearY - 10], [rx + dx + 3, nearY + 2], [rx + dx - 3, nearY + 2]], M.d);
      R(rx + dx - 2, nearY - 9, 4, 1, M.l);
    }
    for (let k = 0; k < 5; k++) R(rx - 12 + k * 6, nearY + 6 + (k % 2) * 5, 3, 1, X.l); // trempe jaspée
  }
  R(rx - 13, nearY + 5, 2, 2, '#8a9098'); R(rx - 14, nearY + 13, 2, 2, '#8a9098');
  // crosse veinée, qui s'élargit vers soi
  const stock = fillPoly(R, [[rx - 18, nearY + 17], [rx + 18, nearY + 17], [rx + 34, nearY + 70], [rx - 34, nearY + 70]], Wd.b);
  sides(stock, Wd.dd, Wd.l, 3, 3);
  for (const [y, a, b] of stock) {
    const w = b - a;
    for (const f of [0.3, 0.55, 0.78]) R(Math.round(a + w * f + Math.sin(y / 5 + f * 9) * 1.5), y, 1, 1, Wd.d);
  }

  if (!skin) return;
  // main droite : sur la poignée, le pouce passe par-dessus, les jointures sur le flanc droit
  const gy = nearY + 22;
  if (g.action === 'lever') {
    // boucle du levier sous la main
    for (const [x, y, w, h] of [[rx + 14, gy + 2, 3, 20], [rx + 14, gy + 20, 26, 3], [rx + 37, gy + 6, 3, 17]]) { R(x - 1, y - 1, w + 2, h + 2, OUT); R(x, y, w, h, X.b); R(x, y, 1, h, X.l); }
  }
  const sleeveR = fillPoly(R, [[rx + 20, gy + 10], [rx + 36, gy + 2], [rx + 76, bottom], [rx + 30, bottom]], cloth);
  sides(sleeveR, cd, cl, 2, 3);
  fillPoly(R, [[rx + 20, gy + 8], [rx + 35, gy], [rx + 37, gy + 5], [rx + 22, gy + 13]], cd);
  // dos de la main droite, arrondi, sur le flanc droit de la poignée
  const back = fillPoly(R, [[rx + 7, gy - 6], [rx + 19, gy - 10], [rx + 28, gy - 6], [rx + 33, gy + 3], [rx + 31, gy + 9], [rx + 21, gy + 13], [rx + 9, gy + 9], [rx + 5, gy + 2]], skin);
  sides(back, sd, sl, 2, 1);
  // jointures : quatre bosses le long du bord haut, séparées par un creux
  for (let k = 0; k < 4; k++) {
    const kx = rx + 8 + k * 5, ky = gy - 6 - (k < 2 ? k * 2 : 4 - (k - 2));
    R(kx, ky, 3, 1, sl); R(kx, ky + 1, 3, 1, shade(skin, 0.1));
    if (k) R(kx - 1, ky + 1, 1, 2, sd);
  }
  for (let k = 0; k < 3; k++) R(rx + 13 + k * 5, gy + 1 + k, 1, 5, sd); // tendons
  R(rx + 6, gy + 3, 4, 6, sd); // index replié vers la détente
  // pouce qui passe par-dessus la poignée, effilé, ongle au bout
  const th = fillPoly(R, [[rx + 9, gy - 6], [rx - 4, gy - 11], [rx - 8, gy - 10], [rx - 8, gy - 7], [rx - 4, gy - 5], [rx + 9, gy]], skin);
  sides(th, sd, sl, 1, 1);
  R(rx - 4, gy - 10, 12, 1, sl);
  R(rx - 7, gy - 9, 3, 2, shade(skin, 0.32)); // ongle
  R(rx + 2, gy - 6, 1, 3, sd); // jointure du pouce
}

export function drawFlash(ctx, x, y, size, seed = 0) {
  const { R } = painter(ctx);
  const rays = 8;
  for (let i = 0; i < rays; i++) {
    const a = (i / rays) * Math.PI * 2 + seed;
    const len = size * (0.6 + ((i * 37 + seed * 13) % 10) / 15);
    for (let k = 0; k < len; k += 1) {
      const px = Math.round(x + Math.cos(a) * k), py = Math.round(y + Math.sin(a) * k);
      const s = Math.max(1, Math.round((len - k) / 4));
      R(px - (s >> 1), py - (s >> 1), s, s, k < len * 0.4 ? '#fffbe0' : k < len * 0.7 ? '#fff070' : '#f87818');
    }
  }
  disc(ctx, x, y, Math.round(size * 0.45), '#fffbe0');
}

// ------------------------------------------------------------- Décors
function ditherBands(ctx, x0, y0, w, h, colors) {
  const n = colors.length;
  for (let i = 0; i < n; i++) {
    const ya = y0 + Math.round((i * h) / n), yb = y0 + Math.round(((i + 1) * h) / n);
    ctx.fillStyle = colors[i];
    ctx.fillRect(x0, ya, w, yb - ya);
    if (i > 0) {
      ctx.fillStyle = colors[i - 1];
      for (let x = x0; x < x0 + w; x += 2) ctx.fillRect(x, ya, 1, 1);
      for (let x = x0 + 1; x < x0 + w; x += 4) ctx.fillRect(x, ya + 1, 1, 1);
    }
  }
}

function mesa(ctx, x, base, w, h, col, seed) {
  ctx.fillStyle = col;
  let top = base - h;
  for (let i = 0; i < w; i++) {
    const edge = Math.min(i, w - 1 - i);
    let yy = top;
    if (edge < 6) yy = top + (6 - edge) * 2 + ((i + seed) % 2);
    ctx.fillRect(x + i, yy, 1, base - yy);
  }
}

// opts.sky : dégradé du ciel ; opts.skyDeco(ctx, x0, y0, w, horizon) remplace le soleil (lune, étoiles…) ;
// opts.land : teinte (multiplication) des mesas et du sol, pour les ambiances des mini-jeux (env.js).
export function drawDesert(ctx, x0, y0, w, h, opts = {}) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x0, y0, w, h);
  ctx.clip();
  const horizon = y0 + Math.round(h * 0.6);
  ditherBands(ctx, x0, y0, w, horizon - y0, opts.sky || ['#d4ae7e', '#dcb98a', '#e3c697', '#ebd2a5', '#f0dcb0']);
  if (opts.skyDeco) opts.skyDeco(ctx, x0, y0, w, horizon);
  else {
    const sunX = x0 + Math.round(w * (opts.sunX ?? 0.74)), sunY = y0 + Math.round(h * (opts.sunY ?? 0.3));
    const sr = Math.max(4, Math.round(h * 0.11));
    disc(ctx, sunX, sunY, sr + 2, '#fbecc4');
    disc(ctx, sunX, sunY, sr, '#fdf6e0');
  }
  const landCv = opts.land ? makeCanvas(x0 + w, y0 + h) : null;
  const top = ctx;
  ctx = landCv ? landCv.getContext('2d') : ctx;
  const mh = h * 0.6;
  const layers = [
    ['#c08a68', 0.42, [[0.02, 0.18, 0.5], [0.22, 0.25, 0.75], [0.6, 0.16, 0.6], [0.8, 0.22, 0.42]]],
    ['#a06a50', 0.3, [[0.1, 0.12, 0.55], [0.36, 0.3, 0.5], [0.7, 0.28, 0.6]]],
    ['#7a4a36', 0.2, [[0.0, 0.1, 0.3], [0.3, 0.09, 0.45], [0.48, 0.24, 0.6], [0.83, 0.2, 0.5]]],
  ];
  layers.forEach(([col, hh, list], li) => {
    for (const [px, pw, ph] of list) {
      mesa(ctx, x0 + Math.round(px * w), horizon, Math.round(pw * w), Math.round(mh * hh * ph * 2), col, li);
    }
  });
  ditherBands(ctx, x0, horizon, w, y0 + h - horizon, ['#b8583a', '#c2643e', '#cc7046', '#d47c50']);
  // cailloux
  let s = 7;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  for (let i = 0; i < w * (h - (horizon - y0)) / 90; i++) {
    const px = x0 + Math.floor(rnd() * w), py = horizon + 2 + Math.floor(rnd() * (y0 + h - horizon));
    ctx.fillStyle = rnd() < 0.5 ? '#e8a070' : '#8a3a24';
    ctx.fillRect(px, py, rnd() < 0.2 ? 2 : 1, 1);
  }
  if (opts.cacti !== false) {
    for (const [fx, fh] of [[0.18, 0.16], [0.86, 0.12]]) cactus(ctx, x0 + Math.round(fx * w), horizon + 3, Math.round(h * fh));
  }
  if (landCv) top.drawImage(tintCanvas(landCv, opts.land), 0, 0);
  top.restore();
}

// Copie teintée (multiplication) d'un calque, transparence conservée. Réutilise `into` s'il est fourni.
export function tintCanvas(src, col, into = null) {
  const out = into || makeCanvas(src.width, src.height);
  const x = out.getContext('2d');
  x.setTransform(1, 0, 0, 1, 0, 0);
  x.globalCompositeOperation = 'copy';
  x.drawImage(src, 0, 0);
  x.globalCompositeOperation = 'multiply';
  x.fillStyle = col;
  x.fillRect(0, 0, out.width, out.height);
  x.globalCompositeOperation = 'destination-in';
  x.drawImage(src, 0, 0);
  x.globalCompositeOperation = 'source-over';
  return out;
}

function cactus(ctx, x, base, hgt) {
  const { R } = painter(ctx);
  const g = '#4a7a3a', gd = '#2e5228';
  R(x - 1, base - hgt - 1, 5, hgt + 1, OUT);
  R(x, base - hgt, 3, hgt, g);
  R(x + 2, base - hgt, 1, hgt, gd);
  const a = Math.round(hgt * 0.5);
  R(x - 4, base - a - 1, 5, 3, OUT); R(x - 4, base - a - Math.round(hgt * 0.3) - 1, 3, Math.round(hgt * 0.3) + 2, OUT);
  R(x - 3, base - a, 3, 1, g); R(x - 3, base - a - Math.round(hgt * 0.3), 1, Math.round(hgt * 0.3) + 1, g);
  R(x + 3, base - a + 2, 4, 3, OUT); R(x + 5, base - a - 3, 3, 7, OUT);
  R(x + 3, base - a + 3, 3, 1, g); R(x + 6, base - a - 2, 1, 5, g);
}

export function vulture(ctx, x, y, t) {
  const { R } = painter(ctx);
  const up = Math.floor(t / 250) % 2 === 0;
  const col = '#4a2e20';
  R(x, y, 2, 1, col);
  if (up) { R(x - 3, y - 1, 3, 1, col); R(x + 2, y - 1, 3, 1, col); R(x - 4, y - 2, 1, 1, col); R(x + 5, y - 2, 1, 1, col); }
  else { R(x - 3, y, 3, 1, col); R(x + 2, y, 3, 1, col); R(x - 4, y + 1, 1, 1, col); R(x + 5, y + 1, 1, 1, col); }
}

export function tumbleweed(ctx, x, y, t) {
  const { R } = painter(ctx);
  const f = Math.floor(t / 120) % 4;
  disc(ctx, x, y, 5, '#8a6a3a');
  disc(ctx, x, y, 3, '#a8844a');
  const pts = [[-3, -3], [3, -2], [-2, 3], [2, 3], [0, -4], [4, 1], [-4, 0]];
  pts.forEach(([dx, dy], i) => { if ((i + f) % 2) R(x + dx, y + dy, 1, 1, '#5a4020'); });
}

// Intérieur du saloon (mur du fond), 384×216
export function renderSaloon() {
  const c = makeCanvas(384, 216);
  const ctx = c.getContext('2d');
  const { R, outlined } = painter(ctx);
  let s = 3;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);

  // planches
  for (let x = 0; x < 384; x += 16) {
    const col = (x / 16) % 2 ? '#6a4028' : '#5e3822';
    R(x, 0, 16, 140, col);
    R(x, 0, 1, 140, '#3a2214');
    R(x + 1, 0, 1, 140, shade(col, 0.1));
    for (let k = 0; k < 2; k++) {
      const ky = 10 + Math.floor(rnd() * 80);
      R(x + 4 + Math.floor(rnd() * 8), ky, 2, 1, '#3a2214');
    }
    for (let y = 0; y < 140; y += 3) if (rnd() < 0.15) R(x + 2 + Math.floor(rnd() * 13), y, 1, 2, shade(col, -0.12));
  }
  // lambris bas
  R(0, 92, 384, 4, '#3a2214'); R(0, 92, 384, 1, '#8a5a34');
  R(0, 96, 384, 44, '#4a2c18');
  for (let x = 6; x < 384; x += 42) { R(x, 100, 34, 30, '#3e2414'); R(x + 1, 101, 32, 1, '#5e3a22'); }
  // poutre
  R(0, 0, 384, 7, '#2a1810'); R(0, 7, 384, 1, '#1a0f0a'); R(0, 5, 384, 1, '#4a2c18');

  // étagères + bouteilles
  const bottleCols = ['#c07a2a', '#4a7a3a', '#7a3a1a', '#9ab8c8', '#d9a040', '#6a2a2a', '#3a5a2a'];
  for (const sy of [38, 66]) {
    for (let bx = 10; bx < 118;) {
      const bw = 4 + Math.floor(rnd() * 3), bh = 10 + Math.floor(rnd() * 8);
      const col = bottleCols[Math.floor(rnd() * bottleCols.length)];
      R(bx - 1, sy - bh - 1, bw + 2, bh + 1, OUT);
      R(bx, sy - bh + 4, bw, bh - 4, col);
      R(bx + Math.floor(bw / 2) - 1, sy - bh, 2, 4, col);
      R(bx, sy - bh + 4, bw, 1, OUT);
      R(bx + 1, sy - bh + 5, 1, bh - 6, shade(col, 0.35));
      if (rnd() < 0.6) R(bx, sy - bh + 8, bw, 3, '#e8d8b0');
      bx += bw + 3 + Math.floor(rnd() * 3);
    }
    outlined([[6, sy, 116, 3]], '#7a4a28');
    R(6, sy, 116, 1, '#a8703c');
    R(10, sy + 4, 2, 6, '#3a2214'); R(114, sy + 4, 2, 6, '#3a2214');
  }

  // fenêtre + désert
  outlined([[282, 16, 80, 66]], '#4a2c18');
  drawDesert(ctx, 286, 20, 72, 58, { sunX: 0.7, sunY: 0.35 });
  R(320, 20, 2, 58, '#4a2c18'); R(286, 48, 72, 2, '#4a2c18');
  R(282, 82, 80, 4, '#7a4a28'); R(282, 82, 80, 1, '#a8703c');

  // affiche WANTED
  outlined([[246, 22, 26, 34]], '#e3cf9a');
  R(247, 23, 24, 32, '#d8c088');
  R(249, 25, 20, 3, '#5a3a20');
  for (let x = 250; x < 268; x += 2) R(x, 26, 1, 1, '#d8c088');
  R(253, 31, 12, 12, '#a88a5a'); R(255, 33, 8, 8, '#7a5a38'); R(256, 30, 6, 3, '#5a3a20');
  R(250, 46, 18, 2, '#5a3a20'); R(252, 50, 14, 1, '#7a5a38');
  R(259, 21, 1, 2, '#888'); R(256, 52, 6, 1, '#c84a3a');

  // crâne de bœuf
  const bx = 184, by = 12;
  outlined([[bx, by, 16, 9], [bx + 3, by + 9, 10, 6], [bx - 10, by - 2, 10, 3], [bx + 16, by - 2, 10, 3], [bx - 12, by - 6, 3, 4], [bx + 25, by - 6, 3, 4]], '#e8dcc0');
  R(bx + 3, by + 3, 3, 3, OUT); R(bx + 10, by + 3, 3, 3, OUT); R(bx + 6, by + 11, 1, 2, OUT); R(bx + 9, by + 11, 1, 2, OUT);
  R(bx, by + 8, 16, 1, '#b8a888');

  // lampes
  for (const lx of [140, 236]) {
    R(lx, 7, 1, 12, '#2a1810');
    outlined([[lx - 4, 19, 9, 3], [lx - 3, 22, 7, 8], [lx - 4, 30, 9, 2]], '#a06a20');
    R(lx - 2, 23, 5, 6, '#f8e08a'); R(lx - 1, 24, 3, 3, '#fffbe0');
  }

  // horloge
  outlined([[338, 98, 14, 30]], '#6a3a1a');
  disc(ctx, 345, 106, 4, '#f0e0b0'); R(345, 103, 1, 3, OUT); R(345, 106, 2, 1, OUT);
  R(344, 114, 3, 10, '#3a2214'); disc(ctx, 345, 122, 2, '#e0b040');
  return c;
}

// Table de poker (premier plan)
export const TABLE_Y = 134;
export function renderTable() {
  const c = makeCanvas(384, 216);
  const ctx = c.getContext('2d');
  const { R } = painter(ctx);
  let s = 11;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  for (let y = TABLE_Y - 6; y < 216; y++) {
    const t = (y - TABLE_Y) / (216 - TABLE_Y);
    const l = Math.round(30 - Math.max(0, t) * 80), r = Math.round(354 + Math.max(0, t) * 80);
    if (y < TABLE_Y) {
      R(l - 1, y, r - l + 2, 1, y === TABLE_Y - 6 ? OUT : y < TABLE_Y - 3 ? '#a8703c' : '#6a3a1a');
      continue;
    }
    R(l - 8, y, 9, 1, '#6a3a1a'); R(l - 9, y, 1, 1, OUT);
    R(r - 1, y, 9, 1, '#6a3a1a'); R(r + 8, y, 1, 1, OUT);
    R(l, y, r - l, 1, '#2a4a30');
    const cx = 192, half = (r - l) / 2;
    for (let x = l; x < r; x++) {
      const d = Math.abs(x - cx) / half;
      if (d < 0.75 && t > 0.05 && t < 0.95 && (x + y) % 2 === 0) R(x, y, 1, 1, '#33583a');
      if (d < 0.45 && t > 0.15 && t < 0.85) R(x, y, 1, 1, (x + y) % 2 ? '#33583a' : '#3a6040');
    }
  }
  R(30, TABLE_Y, 324, 1, '#1a2a1c');
  for (let i = 0; i < 40; i++) R(40 + Math.floor(rnd() * 300), TABLE_Y + 4 + Math.floor(rnd() * 70), 1, 1, '#24402a');

  // jetons
  const chips = [['#c0392b', '#f4ecd8'], ['#2f4a8e', '#f4ecd8'], ['#f4ecd8', '#c0392b']];
  for (const [x, y, n] of [[46, 146, 4], [58, 150, 2], [326, 146, 3]]) {
    for (let k = 0; k < n; k++) {
      const [a, b] = chips[(k + x) % 3];
      R(x - 6, y - k * 2 - 1, 13, 4, OUT); R(x - 5, y - k * 2, 11, 2, a); R(x - 1, y - k * 2, 2, 2, b);
    }
  }
  // cartes
  R(98, 157, 12, 16, OUT); R(99, 158, 10, 14, '#f4ecd8'); R(101, 160, 2, 2, '#c0392b'); R(105, 168, 2, 2, '#c0392b');
  R(111, 159, 12, 16, OUT); R(112, 160, 10, 14, '#8a2a20'); R(114, 162, 6, 10, '#a8403a');
  return c;
}

export function renderVignette() {
  const c = makeCanvas(384, 216);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(384, 216);
  const bayer = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  for (let y = 0; y < 216; y++) for (let x = 0; x < 384; x++) {
    const dx = (x - 192) / 230, dy = (y - 110) / 150;
    const d = Math.sqrt(dx * dx + dy * dy);
    const v = Math.max(0, d - 0.55) * 2.2;
    const th = bayer[(y % 4) * 4 + (x % 4)] / 16;
    const level = Math.floor(v * 4 + th) / 4;
    const i = (y * 384 + x) * 4;
    img.data[i] = 20; img.data[i + 1] = 10; img.data[i + 2] = 6;
    img.data[i + 3] = Math.min(220, level * 120);
  }
  ctx.putImageData(img, 0, 0);
  return c;
}
