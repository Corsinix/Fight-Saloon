// Texte fin de « La piste » : la police VT323 (casse mixte), dessinée au quart de pixel du jeu. VT323 est tracée sur
// une grille de 35 unités par em (traits de 3 unités, 14 unités de chasse) : rendue à 35 px puis affichée au quart,
// chaque unité tombe sur un pixel d'écran du canevas ×4 de la piste. Les lettres sont aussi hautes que Silkscreen
// (gardée pour les titres et les étiquettes courtes), plus étroites, nettes et avec leurs minuscules.
// Même méthode que scene.js : le texte est dessiné 8 fois plus grand, puis lu au centre de chaque unité ; en cache.
const SIZE = 35; // taille de rendu : une unité de la police = un pixel du sprite
const K = 4; // pixels du sprite par pixel du jeu
const UP = 8;
const MAX = 700; // textes gardés en cache (les plus anciens partent)
const cache = new Map();
let work = null;
const FONT = `${SIZE}px VT323, monospace`;
const rgb = (hex) => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };

function mask(str) {
  if (!work) { work = document.createElement('canvas'); work.width = 1024; work.height = 256; }
  const b = work.getContext('2d', { willReadFrequently: true });
  const big = `${SIZE * UP}px VT323, monospace`;
  b.font = big;
  const adv = b.measureText(str).width;
  const bw = Math.ceil(adv) + UP * 4, bh = Math.ceil(SIZE * UP * 1.4) + UP * 4;
  if (bw > work.width || bh > work.height) { work.width = Math.max(work.width, bw); work.height = Math.max(work.height, bh); }
  else b.clearRect(0, 0, bw, bh);
  b.font = big;
  b.textBaseline = 'top';
  b.fillStyle = '#fff';
  b.fillText(str, UP * 2, UP * 2);
  const d = b.getImageData(0, 0, bw, bh).data;
  // la grille de la police : une case de UP pixels depuis le coin du texte (le haut de la ligne, pas des lettres),
  // pour que toutes les lignes partagent la même ligne de base
  const w = Math.max(1, Math.ceil(adv / UP)), h = Math.ceil(SIZE * 1.4);
  const m = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const sx = Math.min(bw - 1, UP * 2 + Math.floor((x + 0.5) * UP)), sy = Math.min(bh - 1, UP * 2 + Math.floor((y + 0.5) * UP));
    m[y * w + x] = d[(sy * bw + sx) * 4 + 3] >= 128 ? 1 : 0;
  }
  return { w, h, m };
}

// le sprite d'un texte (en pixels fins) : couleur, ombre portée d'un pixel fin en bas à droite
export function hdSprite(str, col = '#f4ead0', shadow = '#1a0f0a') {
  str = String(str);
  const key = `${col}|${shadow}|${str}`;
  const hit = cache.get(key);
  if (hit && !(hit.fallback && document.fonts.check(FONT))) { cache.delete(key); cache.set(key, hit); return hit; }
  const k = mask(str);
  const w = k.w + 2, h = k.h + 2;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  const img = g.createImageData(w, h), o = img.data;
  const put = (i, p) => { o[i * 4] = p[0]; o[i * 4 + 1] = p[1]; o[i * 4 + 2] = p[2]; o[i * 4 + 3] = 255; };
  const fg = rgb(col), sh = shadow ? rgb(shadow) : null;
  // l'ombre : deux pixels d'écran en bas à droite (un demi-pixel du jeu)
  if (sh) for (let y = 0; y < k.h; y++) for (let x = 0; x < k.w; x++) if (k.m[y * k.w + x]) { put((y + 2) * w + x + 2, sh); put((y + 1) * w + x + 2, sh); put((y + 2) * w + x + 1, sh); }
  for (let y = 0; y < k.h; y++) for (let x = 0; x < k.w; x++) if (k.m[y * k.w + x]) put(y * w + x, fg);
  g.putImageData(img, 0, 0);
  const fallback = !document.fonts.check(FONT);
  if (fallback) document.fonts.load(FONT).catch(() => {});
  const s = { c, w: k.w / K, fallback };
  cache.set(key, s);
  while (cache.size > MAX) cache.delete(cache.keys().next().value);
  return s;
}

// largeur d'un texte, en pixels du jeu
export const hdW = (str) => hdSprite(str, '#ffffff', '').w;

// dessine un texte fin ; (x, y) : le haut des majuscules, en pixels du jeu (arrondis au quart de pixel)
export function hd(ctx, str, x, y, col = '#f4ead0', align = 'left', shadow = '#1a0f0a') {
  const s = hdSprite(str, col, shadow);
  const left = align === 'center' ? x - s.w / 2 : align === 'right' ? x - s.w : x;
  ctx.drawImage(s.c, Math.round(left * K) / K, Math.round((y - TOP) * K) / K, s.c.width / K, s.c.height / K);
}
// distance (pixels du jeu) entre le haut de la ligne de la police et le haut des majuscules
const TOP = 2.5;

// coupe un texte en lignes d'au plus maxW pixels du jeu
export function hdWrap(str, maxW) {
  const out = [];
  for (const para of String(str).split('\n')) {
    let line = '';
    for (const word of para.split(' ')) {
      const next = line ? `${line} ${word}` : word;
      if (line && hdW(next) > maxW) { out.push(line); line = word; } else line = next;
    }
    out.push(line);
  }
  return out;
}

// raccourcit un texte (…) pour qu'il tienne dans maxW pixels du jeu
export function hdFit(str, maxW) {
  str = String(str);
  if (hdW(str) <= maxW) return str;
  while (str.length > 1 && hdW(`${str}…`) > maxW) str = str.slice(0, -1);
  return `${str.trimEnd()}…`;
}

// interligne du texte fin, en pixels du jeu
export const HD_LH = 8;

// un paragraphe coupé et dessiné ; renvoie la hauteur occupée
export function hdPara(ctx, str, x, y, maxW, col, { lh = HD_LH, align = 'left', shadow = '#1a0f0a', max = 99 } = {}) {
  const lines = hdWrap(str, maxW).slice(0, max);
  lines.forEach((l, i) => hd(ctx, l, align === 'center' ? x + maxW / 2 : x, y + i * lh, col, align, shadow));
  return lines.length * lh;
}
