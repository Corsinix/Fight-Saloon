// Petits dessins des animations d'objets de la roulette : bras et poings, menottes et chaîne, lasso,
// cigare et allumette, carte, marteau, scie, manipulateur de télégraphe, longue-vue, derringer…
// Tout est posé en rectangles arrondis au pixel près, pour rester net une fois le canvas agrandi.
import { OUT, shade, disc, makeCanvas, lru } from './sprites.js';

const R = (ctx, x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };
const STEEL = '#8a909a', STEEL_L = '#d8dce4', STEEL_D = '#4a4f58';
const ROPE = '#c8a060', ROPE_D = '#7a5a30';
const SHIRT = '#e8e0d0';
const BRASS = '#c8901c', BRASS_L = '#f8e08a', BRASS_D = '#7a5010';

// Trait épais fait de carrés posés le long du segment (contour sombre d'abord), qui passe de w0 à w1 ;
// light : reflet plus clair, décalé vers le haut à gauche.
export function thick(ctx, x0, y0, x1, y1, w0, col, { w1 = w0, out = OUT, light = null } = {}) {
  const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
  const pass = (dw, c, off = 0) => {
    ctx.fillStyle = c;
    for (let i = 0; i <= n; i++) {
      const t = i / n, w = Math.max(1, Math.round(w0 + (w1 - w0) * t) + dw);
      ctx.fillRect(Math.round(x0 + (x1 - x0) * t - off - w / 2), Math.round(y0 + (y1 - y0) * t - off - w / 2), w, w);
    }
  };
  if (out) pass(2, out);
  pass(0, col);
  if (light && w0 >= 4) pass(-Math.ceil(w0 * 0.55), light, w0 * 0.22);
}

// ------------------------------------------------------------- bras et poings
// Poing vu à la première personne (≈ 20 × 16), centré sur x, y ; side > 0 : bras qui vient de la droite
export function fpFist(ctx, x, y, skin, side = 1) {
  const sd = shade(skin, -0.22), sl = shade(skin, 0.16);
  const L = Math.round(x) - 10, T = Math.round(y) - 8;
  const tx = side > 0 ? L - 3 : L + 15; // pouce, côté intérieur
  R(ctx, L - 1, T, 22, 16, OUT); R(ctx, L, T - 1, 20, 18, OUT);
  R(ctx, tx - 1, T + 4, 10, 9, OUT);
  R(ctx, L, T, 20, 16, skin);
  R(ctx, L + 1, T, 18, 2, sl);
  for (let k = 1; k < 4; k++) R(ctx, L + k * 5, T, 1, 7, sd);
  R(ctx, L + 1, T + 7, 18, 1, sd);
  R(ctx, L, T + 13, 20, 3, sd);
  R(ctx, tx, T + 5, 8, 7, skin); R(ctx, tx, T + 5, 8, 1, sl); R(ctx, tx + (side > 0 ? 0 : 7), T + 6, 1, 6, sd);
}

// Mon bras : la manche monte du bas de l'écran jusqu'au poing (x, y). hold : objet tenu, dessiné sous les doigts ;
// cuff : bracelet de menotte au poignet. Renvoie la position du poignet.
export function fpArm(ctx, x, y, skin, cloth, side = 1, { hold = null, cuff = false } = {}) {
  const ex = x + side * 46, ey = 262;
  const dx = ex - x, dy = ey - y, l = Math.hypot(dx, dy) || 1, ux = dx / l, uy = dy / l;
  thick(ctx, x + ux * 10, y + uy * 10, ex, ey, 18, cloth, { w1: 26, light: shade(cloth, 0.18) });
  thick(ctx, x + ux * 7, y + uy * 7, x + ux * 10, y + uy * 10, 17, SHIRT);
  const wx = x + ux * 13, wy = y + uy * 13;
  if (cuff) cuffBand(ctx, wx, wy, 24, 6);
  hold?.(ctx);
  fpFist(ctx, x, y, skin, side);
  return { x: wx, y: wy };
}

// Poing de l'adversaire (≈ 12 × 8)
export function smallFist(ctx, x, y, skin, side = 1) {
  const sd = shade(skin, -0.22), sl = shade(skin, 0.15);
  const L = Math.round(x) - 6, T = Math.round(y) - 4;
  const tx = side > 0 ? L - 2 : L + 10;
  R(ctx, L - 1, T - 1, 14, 10, OUT); R(ctx, tx - 1, T + 1, 6, 6, OUT);
  R(ctx, L, T, 12, 8, skin); R(ctx, L, T, 12, 1, sl);
  for (let k = 1; k < 4; k++) R(ctx, L + k * 3, T, 1, 3, sd);
  R(ctx, L, T + 6, 12, 2, sd);
  R(ctx, tx, T + 2, 4, 4, skin); R(ctx, tx, T + 2, 4, 1, sl);
}

// Bras à l'échelle de la table : du coude (ex, ey) au poing (x, y). reach : longueur du bras complet depuis
// l'épaule (ex, ey) — le coude se plie alors vers l'extérieur (bend : 1 à droite, -1 à gauche) au lieu d'un bras raide.
export function smallArm(ctx, ex, ey, x, y, skin, cloth, { hold = null, w = 10, reach = 0, bend = 1 } = {}) {
  if (reach) {
    const d = Math.hypot(x - ex, y - ey) || 1, half = reach / 2;
    const out = Math.sqrt(Math.max(0, half * half - (d / 2) * (d / 2)));
    let nx = -(y - ey) / d, ny = (x - ex) / d;
    if (nx * bend < 0) { nx = -nx; ny = -ny; }
    const jx = (ex + x) / 2 + nx * out, jy = (ey + y) / 2 + ny * out;
    thick(ctx, jx, jy, ex, ey, w + 2, cloth, { w1: w + 4, light: shade(cloth, 0.2) }); // haut du bras
    ex = jx; ey = jy;
  }
  const dx = ex - x, dy = ey - y, l = Math.hypot(dx, dy) || 1, ux = dx / l, uy = dy / l;
  thick(ctx, x + ux * 6, y + uy * 6, ex, ey, w, cloth, { w1: w + 2, light: shade(cloth, 0.2) });
  thick(ctx, x + ux * 4, y + uy * 4, x + ux * 6, y + uy * 6, w - 1, SHIRT);
  hold?.(ctx);
  smallFist(ctx, x, y, skin, ux < 0 ? -1 : 1);
}

// ------------------------------------------------------------- menottes
export function cuffBand(ctx, cx, cy, w, h = 4) {
  const L = Math.round(cx - w / 2), T = Math.round(cy - h / 2);
  R(ctx, L - 1, T - 1, w + 2, h + 2, OUT);
  R(ctx, L, T, w, h, STEEL); R(ctx, L, T, w, 1, STEEL_L); R(ctx, L, T + h - 1, w, 1, STEEL_D);
  R(ctx, Math.round(cx) - 1, T + 1, 2, Math.max(1, h - 2), STEEL_D); // serrure
}

// Chaîne entre deux bracelets, maillons à plat et de champ en alternance, un peu détendue au milieu
export function chain(ctx, x0, y0, x1, y1, sag = 2, big = false) {
  const n = Math.max(2, Math.round(Math.hypot(x1 - x0, y1 - y0) / (big ? 5 : 3)));
  for (let i = 0; i <= n; i++) {
    const t = i / n, x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t + Math.sin(t * Math.PI) * sag;
    if (big) {
      if (i % 2) { R(ctx, x - 3, y - 2, 7, 5, OUT); R(ctx, x - 2, y - 1, 5, 3, STEEL); R(ctx, x - 1, y, 3, 1, OUT); R(ctx, x - 2, y - 1, 5, 1, STEEL_L); }
      else { R(ctx, x - 1, y - 3, 3, 7, OUT); R(ctx, x, y - 2, 1, 5, STEEL_L); }
    } else if (i % 2) { R(ctx, x - 2, y - 1, 4, 3, OUT); R(ctx, x - 1, y, 2, 1, STEEL); }
    else { R(ctx, x - 1, y - 1, 2, 3, OUT); R(ctx, x, y, 1, 1, STEEL_L); }
  }
}

// ------------------------------------------------------------- lasso
// Corde en courbe (point de contrôle au milieu, abaissé de sag)
export function rope(ctx, x0, y0, x1, y1, sag = 0, w = 1) {
  const mx = (x0 + x1) / 2, my = (y0 + y1) / 2 + sag;
  const n = Math.max(2, Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 1.3));
  let px = null, py = null;
  for (let i = 0; i <= n; i++) {
    const t = i / n, a = (1 - t) * (1 - t), b = 2 * (1 - t) * t, c = t * t;
    const x = Math.round(a * x0 + b * mx + c * x1), y = Math.round(a * y0 + b * my + c * y1);
    if (x === px && y === py) continue;
    px = x; py = y;
    R(ctx, x, y + w, w, 1, ROPE_D); R(ctx, x, y, w, w, ROPE);
  }
}

// Boucle du lasso (ellipse vue de biais) : part 'back' = moitié arrière, 'front' = moitié avant (avec le nœud).
// Renvoie la position du nœud coulant, où la corde s'attache.
export function loop(ctx, cx, cy, rx, ry, phase, part = 'all', w = 1) {
  const n = Math.max(16, Math.ceil((rx + ry) * 3));
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2, front = Math.sin(a) >= 0;
    if ((part === 'back' && front) || (part === 'front' && !front)) continue;
    const x = Math.round(cx + Math.cos(a) * rx), y = Math.round(cy + Math.sin(a) * ry);
    R(ctx, x, y + w, w, 1, ROPE_D); R(ctx, x, y, w, w, front ? ROPE : shade(ROPE, -0.25));
  }
  const kx = cx + Math.cos(phase) * rx, ky = cy + Math.sin(phase) * ry;
  if (part !== 'back') { R(ctx, kx - 1, ky - 1, w + 2, w + 2, ROPE_D); R(ctx, kx - 1, ky - 1, w + 1, w + 1, ROPE); }
  return { x: kx, y: ky };
}

// ------------------------------------------------------------- cigare, allumette
// Du bout côté bouche (x0, y0) jusqu'au bout allumé (x1, y1) ; glow : 0 éteint, 1 braise au plus vif
export function cigar(ctx, x0, y0, x1, y1, w0, w1, glow) {
  thick(ctx, x0, y0, x1, y1, w0, '#6a3e1e', { w1, light: '#9a6034' });
  // bague rouge et or, côté bouche
  const bx = x0 + (x1 - x0) * 0.22, by = y0 + (y1 - y0) * 0.22, ex = x0 + (x1 - x0) * 0.3, ey = y0 + (y1 - y0) * 0.3;
  const bw = Math.round(w0 + (w1 - w0) * 0.26);
  thick(ctx, bx, by, ex, ey, bw, '#c0392b', { out: null });
  thick(ctx, (bx + ex) / 2, (by + ey) / 2, (bx + ex) / 2, (by + ey) / 2, Math.max(1, bw - 2), '#e0b040', { out: null });
  const r = Math.max(1, Math.round(w1 / 2));
  if (glow > 0.25) disc(ctx, x1, y1, r + 2 + Math.round(glow * 2), `rgba(255,140,40,${(0.3 * glow).toFixed(2)})`);
  disc(ctx, x1, y1, r, glow > 0.1 ? '#8a8078' : '#3a2a20'); // cendre (ou bout pas encore allumé)
  if (glow > 0.1) {
    disc(ctx, x1, y1, Math.max(0, r - 1), glow > 0.7 ? '#ffa030' : '#d8501a');
    if (glow > 0.6) R(ctx, x1, y1, 1, 1, '#fff070');
  }
}

// Petite flamme qui vacille (base au point x, y)
export function flame(ctx, x, y, t, s = 1) {
  const f = Math.sin(t / 40) * 0.5 + Math.sin(t / 23) * 0.5;
  const h = Math.max(3, Math.round((5 + f) * s)), w = Math.max(2, Math.round(3 * s));
  for (let j = 0; j < h; j++) {
    const k = 1 - j / h, ww = Math.max(1, Math.round(w * Math.sqrt(k)));
    R(ctx, x - ww / 2 + (j > h / 2 ? Math.round(f * 0.6) : 0), y - j, ww, 1, j < h * 0.3 ? '#fff4b0' : j < h * 0.65 ? '#f8b030' : '#e05a18');
  }
}

export function match(ctx, x0, y0, x1, y1, w = 2) {
  thick(ctx, x0, y0, x1, y1, w, '#e8c890');
  R(ctx, x1 - 1, y1 - 1, w + 1, w + 1, '#b03020');
}

// ------------------------------------------------------------- carte (l'as)
let cardFace = null, cardBack = null;
function cards() {
  if (cardFace) return;
  const grid = (c, rows, ox, oy, col) => rows.forEach((row, j) => [...row].forEach((ch, i) => ch === 'k' && R(c, ox + i, oy + j, 1, 1, col)));
  const frame = (c, fill) => { R(c, 0, 1, 20, 26, OUT); R(c, 1, 0, 18, 28, OUT); R(c, 1, 1, 18, 26, fill); };
  cardFace = makeCanvas(20, 28);
  let c = cardFace.getContext('2d');
  frame(c, '#f4ecd8'); R(c, 1, 25, 18, 2, '#d8c8a0');
  const A = ['.k.', 'k.k', 'kkk', 'k.k', 'k.k'];
  grid(c, A, 3, 3, OUT); grid(c, [...A].reverse(), 14, 20, OUT);
  grid(c, ['....k....', '...kkk...', '..kkkkk..', '.kkkkkkk.', 'kkkkkkkkk', 'kkkkkkkkk', '.kk.k.kk.', '....k....', '...kkk...'], 5, 9, OUT);
  R(c, 8, 11, 1, 1, '#8a8f98');
  cardBack = makeCanvas(20, 28);
  c = cardBack.getContext('2d');
  frame(c, '#f4ecd8');
  R(c, 2, 2, 16, 24, '#8a2a20');
  for (let y = 2; y < 26; y++) for (let x = 2; x < 18; x++) if ((x + y) % 4 === 0 || (x - y + 40) % 4 === 0) R(c, x, y, 1, 1, '#b8483a');
}

// sx : largeur apparente (cos de la rotation) — négatif, on voit le dos
export function card(ctx, cx, cy, scale, sx) {
  cards();
  const w = Math.max(1, Math.round(20 * scale * Math.abs(sx))), h = Math.round(28 * scale);
  ctx.drawImage(sx >= 0 ? cardFace : cardBack, Math.round(cx - w / 2), Math.round(cy - h / 2), w, h);
}

// ------------------------------------------------------------- outils
// Marteau : manche tenu en (px, py), orienté selon l'angle a ; la tête de fer au bout, en travers
export function hammer(ctx, px, py, a, len, s = 1) {
  const hx = px + Math.cos(a) * len, hy = py + Math.sin(a) * len;
  thick(ctx, px, py, hx, hy, Math.max(2, Math.round(3 * s)), '#a06a3a', { light: '#c8925a' });
  const nx = -Math.sin(a), ny = Math.cos(a), hw = 5 * s;
  thick(ctx, hx - nx * hw, hy - ny * hw, hx + nx * hw * 0.6, hy + ny * hw * 0.6, Math.max(3, Math.round(5 * s)), STEEL, { light: STEEL_L });
}

// Scie : lame de la pointe (x0, y0) au talon (x1, y1), dents d'un côté, poignée en bois après le talon
export function saw(ctx, x0, y0, x1, y1, w = 7) {
  const dx = x1 - x0, dy = y1 - y0, l = Math.hypot(dx, dy) || 1, ux = dx / l, uy = dy / l;
  const nx = -uy, ny = ux, sg = ny > 0 ? 1 : -1;
  thick(ctx, x0, y0, x1, y1, Math.round(w * 0.7), '#c9ced6', { w1: w, light: '#f0f2f6' });
  for (let i = 1; i < l; i += 2) {
    const half = (w * 0.7 + w * 0.3 * (i / l)) / 2 + 1;
    R(ctx, x0 + ux * i + nx * sg * half, y0 + uy * i + ny * sg * half, 1, 1, OUT);
  }
  thick(ctx, x1, y1, x1 + ux * 9, y1 + uy * 9, w + 2, '#7a4a24', { light: '#a8703c' });
}

// Morceaux de menottes qui sautent quand elles cèdent : un demi-bracelet et un maillon
let shards = null;
export function cuffShards() {
  if (shards) return shards;
  const band = makeCanvas(10, 6), link = makeCanvas(5, 4);
  let x = band.getContext('2d');
  R(x, 0, 0, 10, 6, OUT); R(x, 1, 1, 8, 4, STEEL); R(x, 1, 1, 8, 1, STEEL_L); R(x, 1, 4, 8, 1, STEEL_D); R(x, 8, 0, 2, 2, OUT);
  x = link.getContext('2d');
  R(x, 0, 0, 5, 4, OUT); R(x, 1, 1, 3, 2, STEEL); R(x, 2, 1, 1, 1, OUT); R(x, 1, 1, 3, 1, STEEL_L);
  shards = { band, link };
  return shards;
}

// Bout de canon scié qui tombe sur la table
const pieces = {};
export function barrelPiece(len) {
  if (pieces[len]) return pieces[len];
  const c = makeCanvas(len + 2, 7);
  const x = c.getContext('2d');
  R(x, 0, 0, len + 2, 5, OUT); R(x, 1, 1, len, 3, STEEL_D); R(x, 1, 1, len, 1, STEEL); R(x, len - 1, 0, 2, 1, '#e0b040');
  R(x, 1, 4, len - 6, 3, OUT); R(x, 2, 5, len - 8, 1, '#3a3e46');
  pieces[len] = c;
  return c;
}

// Manipulateur de télégraphe : socle en bois, levier en laiton qui bat le morse (down : appuyé)
export function telegraphKey(ctx, x, y, down, s = 1) {
  R(ctx, x - 12 * s - 1, y - 1, 24 * s + 2, 5 * s + 2, OUT); R(ctx, x - 12 * s, y, 24 * s, 5 * s, '#7a4a24'); R(ctx, x - 12 * s, y, 24 * s, s, '#a8703c');
  R(ctx, x - 10 * s, y - 5 * s, 3 * s, 5 * s, BRASS_D); // pivot
  R(ctx, x + 6 * s, y - 2 * s, 3 * s, 2 * s, BRASS); // plot de contact
  const tipY = y - (down ? 3 : 6) * s;
  thick(ctx, x - 9 * s, y - 5 * s, x + 9 * s, tipY, Math.max(2, 2 * s), BRASS, { light: BRASS_L });
  disc(ctx, x + 10 * s, tipY - s, 2 * s + 1, OUT); disc(ctx, x + 10 * s, tipY - s, 2 * s, '#2a2420');
  if (down) { R(ctx, x + 7 * s, y - 3 * s, s, s, '#c8f0ff'); R(ctx, x + 9 * s, y - 4 * s, s, s, '#80c8ff'); }
}

export function paper(ctx, x, y, w, h, back = false) {
  R(ctx, x + 2, y + 2, w, h, 'rgba(0,0,0,0.3)');
  R(ctx, x - 1, y - 1, w + 2, h + 2, OUT); R(ctx, x, y, w, h, '#f0e4c4'); R(ctx, x, y, w, 1, '#fff6dc'); R(ctx, x, y + h - 1, w, 1, '#d8c8a0');
  if (back) for (let j = 4; j < h - 3; j += 3) R(ctx, x + 3, y + j, w - 6, 1, '#d8c8a0');
}

// Longue-vue tenue par l'adversaire : de l'œil (x0, y0) à la lentille (x1, y1)
export function spyglassTube(ctx, x0, y0, x1, y1, glint = false) {
  thick(ctx, x0, y0, x1, y1, 4, BRASS, { w1: 6, light: BRASS_L });
  for (const t of [0.35, 0.68]) {
    const bx = x0 + (x1 - x0) * t, by = y0 + (y1 - y0) * t;
    thick(ctx, bx, by, bx + (x1 - x0) * 0.04, by + (y1 - y0) * 0.04, 5, BRASS_D, { out: null });
  }
  disc(ctx, x1, y1, 4, OUT); disc(ctx, x1, y1, 3, '#e0b040'); disc(ctx, x1, y1, 2, '#2a3a4a');
  R(ctx, x1 - 1, y1 - 1, 1, 1, glint ? '#ffffff' : '#8ab0d0');
}

// Vue dans la longue-vue : tout est noir sauf un disque (r) cerclé de laiton ; inside() dessine le contenu.
// Centre entier (le cas de la roulette) : le carré autour du disque vient d'un masque dessiné une fois par rayon,
// le reste de l'écran de quatre rectangles noirs (plutôt que quatre ou cinq traits par ligne à chaque image).
const lenses = lru(12);
function lensRows(ctx, cx, cy, r, y0, y1, W) {
  const ro = r + 4;
  for (let y = y0; y < y1; y++) {
    const dy = y + 0.5 - cy;
    if (Math.abs(dy) > ro) { R(ctx, 0, y, W, 1, '#0a0604'); continue; }
    const dxo = Math.floor(Math.sqrt(ro * ro - dy * dy));
    R(ctx, 0, y, Math.max(0, cx - dxo), 1, '#0a0604');
    R(ctx, cx + dxo, y, W - cx - dxo, 1, '#0a0604');
    const rim = dy < -r * 0.4 ? BRASS_L : dy > r * 0.4 ? BRASS_D : BRASS;
    if (Math.abs(dy) > r) R(ctx, cx - dxo, y, dxo * 2, 1, rim);
    else {
      const dxi = Math.floor(Math.sqrt(r * r - dy * dy));
      R(ctx, cx - dxo, y, dxo - dxi, 1, rim); R(ctx, cx + dxi, y, dxo - dxi, 1, rim);
    }
  }
}
export function lensView(ctx, cx, cy, r, W, H, inside) {
  inside();
  if (!Number.isInteger(cx) || !Number.isInteger(cy) || !Number.isInteger(r)) { lensRows(ctx, cx, cy, r, 0, H, W); return; }
  const ro = r + 4;
  let m = lenses.get(r);
  if (!m) {
    m = makeCanvas(ro * 2, ro * 2);
    lensRows(m.getContext('2d'), ro, ro, r, 0, ro * 2, ro * 2);
    lenses.set(r, m);
  }
  ctx.drawImage(m, cx - ro, cy - ro);
  if (cy - ro > 0) R(ctx, 0, 0, W, cy - ro, '#0a0604');
  if (cy + ro < H) R(ctx, 0, cy + ro, W, H - cy - ro, '#0a0604');
  if (cx - ro > 0) R(ctx, 0, cy - ro, cx - ro, ro * 2, '#0a0604');
  if (cx + ro < W) R(ctx, cx + ro, cy - ro, W - cx - ro, ro * 2, '#0a0604');
}

// Derringer vu à la première personne : crosse dans le poing (x, y), canons jusqu'à la bouche (mx, my)
export function derringerFP(ctx, x, y, mx, my) {
  thick(ctx, x + 2, y + 2, x + 8, y + 12, 6, '#7a4a24', { light: '#a8703c' });
  thick(ctx, x, y, mx, my, 7, '#3a3e46', { w1: 5, light: '#9aa0aa' });
  thick(ctx, x - 2, y - 4, x + 1, y - 7, 2, STEEL_D); // chien
  disc(ctx, mx, my, 2, OUT);
}

// Derringer pointé droit sur moi : les deux canons superposés, vus de face
export function derringerFront(ctx, x, y) {
  R(ctx, x - 5, y - 8, 10, 16, OUT); R(ctx, x - 4, y - 7, 8, 14, '#4a4f58'); R(ctx, x - 4, y - 7, 1, 14, '#9aa0aa'); R(ctx, x + 3, y - 7, 1, 14, '#2a2e36');
  disc(ctx, x, y - 3, 2, OUT); disc(ctx, x, y + 3, 2, OUT);
  R(ctx, x - 1, y - 4, 1, 1, '#6a6e76');
}
