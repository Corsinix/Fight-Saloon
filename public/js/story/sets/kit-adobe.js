// Outils des décors en adobe et en rondins (mission San Rosario, hacienda d'El Diablo, Fort Saint-Jude) :
// crépi taché, coulé et écaillé sur briques d'adobe, tuiles canal, vigas, arcs à claveaux, portes cloutées, grilles,
// pieux de palissade, bardeaux, végétation du désert et des berges. Lumière du soleil en haut à gauche : faces de
// droite et ombres portées vers la droite. Tout est dessiné une seule fois, dans les canvas statiques des décors.
import * as S from '../../sprites.js';
import { OUT, R, O, rnd, hash } from './kit.js';

const sh = S.shade, mix = S.mix;
// teinte des ombres (froide, lavande) : une ombre = la couleur du mur mêlée à SHADOW
export const SHADOW = '#4a3a58';
export const shadowOf = (col, k = 0.38) => mix(col, SHADOW, k);

// ---------------------------------------------------------------- formes de base
// Tache irrégulière : lignes [y, x0, x1] autour de (cx, cy), rayons rx, ry
export function blob(r, cx, cy, rx, ry) {
  const rows = [];
  let wob = 0;
  for (let dy = -ry; dy <= ry; dy++) {
    const k = 1 - (dy / (ry + 0.5)) ** 2;
    if (k <= 0) continue;
    wob = Math.max(-0.35, Math.min(0.35, wob + (r() - 0.5) * 0.5));
    const half = rx * Math.sqrt(k);
    const a = Math.round(cx - half * (1 + wob * 0.6) - r()), b = Math.round(cx + half * (1 - wob * 0.6) + r());
    if (b > a) rows.push([Math.round(cy + dy), a, b]);
  }
  return rows;
}
export function fillRows(g, rows, col, dx = 0, dy = 0) {
  g.fillStyle = col;
  for (const [y, a, b] of rows) g.fillRect(a + dx, y + dy, b - a, 1);
}
// Ouverture en plein cintre : lignes de (x, base) sur w × h (rayon w / 2)
export function archRows(x, base, w, h, rise = null) {
  const r = w / 2, cx = x + r, top = base - h, k = rise == null ? 1 : rise / r;
  const rows = [];
  for (let y = top; y < base; y++) {
    const dy = top + r * k - y - 0.5;
    if (dy > 0) {
      const half = Math.sqrt(Math.max(0, r * r - (dy / k) ** 2));
      if (half < 0.5) continue;
      rows.push([y, Math.round(cx - half), Math.round(cx + half)]);
    } else rows.push([y, x, x + w]);
  }
  return rows;
}
// Silhouette en colonnes [[x, haut], …] (x croissants, trous permis) jusqu'à base : lignes [y, x0, x1]
export function colRows(cols, base) {
  const rows = [];
  const top = Math.min(...cols.map((c) => c[1]));
  for (let y = top; y < base; y++) {
    let a = null, prev = null;
    for (const [x, t] of cols) {
      if (y < t) continue;
      if (a != null && x !== prev + 1) { rows.push([y, a, prev + 1]); a = null; }
      if (a == null) a = x;
      prev = x;
    }
    if (a != null) rows.push([y, a, prev + 1]);
  }
  return rows;
}
// Contour d'un ensemble de lignes (1 px autour)
export function outlineRows(g, rows, col = OUT) {
  g.fillStyle = col;
  for (const [y, a, b] of rows) g.fillRect(a - 1, y - 1, b - a + 2, 3);
}
// Ombre portée en biais (parallélogramme pixel) : chaque ligne décalée de dx
export function skew(g, x, y, w, h, dx, col) {
  g.fillStyle = col;
  for (let i = 0; i < h; i++) g.fillRect(Math.round(x + i * dx), y + i, w, 1);
}
// Dessine draw(t) dans un canvas temporaire puis ne garde que les lignes rows (silhouette chantournée)
export function masked(g, x, y, w, h, rows, draw) {
  const c = S.makeCanvas(w, h), t = c.getContext('2d');
  t.translate(-x, -y);
  draw(t);
  t.setTransform(1, 0, 0, 1, 0, 0);
  t.globalCompositeOperation = 'destination-in';
  t.fillStyle = '#000';
  t.beginPath(); // un seul chemin : chaque remplissage en destination-in effacerait les lignes précédentes
  for (const [yy, a, b] of rows) t.rect(a - x, yy - y, b - a, 1);
  t.fill();
  g.drawImage(c, x, y);
  S.freeCanvas(c);
}
// Voile d'ombre (rgba, dessiné une fois)
export function veil(g, x, y, w, h, a = 0.3, rgb = '40,22,48') {
  g.fillStyle = `rgba(${rgb},${a})`;
  g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}
export function veilRows(g, rows, a = 0.3, rgb = '40,22,48') {
  g.fillStyle = `rgba(${rgb},${a})`;
  for (const [y, a0, b] of rows) g.fillRect(a0, y, b - a0, 1);
}

// ---------------------------------------------------------------- matières
// Briques d'adobe (7 × 4 avec le joint) dans des lignes ; oy : origine des assises
export function brickRows(g, rows, brick = '#a87250', oy = 0, ox = 0) {
  const mortar = sh(brick, -0.32), top = sh(brick, 0.1);
  for (const [y, a, b] of rows) {
    const c = Math.floor((y - oy) / 4), m = (((y - oy) % 4) + 4) % 4;
    if (m === 3) { R(g, a, y, b - a, 1, mortar); continue; }
    const off = (c % 2 ? 3 : 0) + ox;
    let x = a;
    while (x < b) {
      const id = Math.floor((x + off) / 7), end = Math.min(b, id * 7 - off + 6);
      const v = hash(c * 977 + id * 131) - 0.5;
      R(g, x, y, Math.max(0, end - x), 1, m === 0 ? top : v > 0.25 ? sh(brick, 0.06) : v < -0.25 ? sh(brick, -0.1) : brick);
      if (end < b) R(g, end, y, 1, 1, mortar);
      x = end + 1;
    }
  }
}
export function bricks(g, x, y, w, h, brick, oy = y) {
  const rows = [];
  for (let yy = y; yy < y + h; yy++) rows.push([yy, x, x + w]);
  brickRows(g, rows, brick, oy, x % 7);
}
// Plaque d'enduit tombée : les briques apparaissent, le bord de l'enduit (épais) fait une ombre en haut à gauche
// dans le trou et attrape la lumière en bas à droite
export function peel(g, r, cx, cy, rx, ry, wall, brick = '#a87250') {
  const rows = blob(r, cx, cy, rx, ry);
  fillRows(g, rows, sh(wall, 0.14), 1, 1);
  brickRows(g, rows, brick, cy % 4);
  const dark = shadowOf(brick, 0.55);
  let prev = null;
  for (const [y, a, b] of rows) {
    R(g, a, y, 1, 1, dark);
    if (!prev) R(g, a, y, b - a, 1, dark);
    else { if (a < prev[1]) R(g, a, y, prev[1] - a, 1, dark); if (b > prev[2]) R(g, prev[2], y, b - prev[2], 1, dark); }
    prev = [y, a, b];
  }
}
// Crépi à la chaux : taches de truelle, piqûres, coulures sous les corniches, pied sali par la terre, plaques
// écaillées. opt : seed, peel (nombre de plaques), grime (hauteur du pied sali), streak (coulures), brick, earth
export function plaster(g, x, y, w, h, col, opt = {}) {
  const { seed = 1, peel: np = 2, grime = 8, streak = 1, brick = '#a87250', earth = '#8a6a48', mottle = 1, pits = 1 } = opt;
  const r = rnd(seed * 17 + 3);
  g.save();
  g.beginPath(); g.rect(x, y, w, h); g.clip();
  R(g, x, y, w, h, col);
  const lo = sh(col, -0.045), hi = sh(col, 0.05);
  for (let i = 0; i < (w * h * mottle) / 240; i++) {
    fillRows(g, blob(r, x + r() * w, y + r() * h, 3 + r() * 7, 2 + r() * 4), r() < 0.6 ? lo : hi);
  }
  const p1 = sh(col, -0.1), p2 = sh(col, 0.08);
  for (let i = 0; i < (w * h * pits) / 45; i++) R(g, x + Math.floor(r() * w), y + Math.floor(r() * h), r() < 0.3 ? 2 : 1, 1, r() < 0.65 ? p1 : p2);
  // coulures (pluie, chaux lessivée)
  const st = sh(col, -0.09);
  for (let i = 0; i < (w / 7) * streak; i++) {
    const sx = x + Math.floor(r() * w), len = 3 + Math.floor(r() * r() * h * 0.5);
    R(g, sx, y, 1, len, st);
    if (r() < 0.3) R(g, sx + 1, y, 1, Math.round(len * 0.6), st);
  }
  // pied sali par les éclaboussures de terre
  if (grime) {
    const gc = mix(col, earth, 0.38), gl = mix(col, earth, 0.2);
    let gh = grime * 0.6;
    for (let xx = x; xx < x + w; xx++) {
      gh = Math.max(2, Math.min(grime * 1.3, gh + (r() - 0.5) * 2.2));
      const hh = Math.round(gh);
      R(g, xx, y + h - hh, 1, hh, gc);
      R(g, xx, y + h - hh - 1, 1, 1, gl);
      if (r() < 0.12) R(g, xx, y + h - hh - 2 - Math.floor(r() * 4), 1, 1, gc);
    }
  }
  for (let i = 0; i < np; i++) {
    const rx = 2 + Math.floor(r() * 6), ry = 2 + Math.floor(r() * 4);
    peel(g, r, x + rx + 2 + r() * Math.max(1, w - rx * 2 - 4), y + ry + 3 + r() * Math.max(1, h - ry * 2 - grime - 6), rx, ry, col, brick);
  }
  g.restore();
}
// Pierre volcanique (tezontle) : rouge-noir, poreuse
export function tezontle(g, x, y, w, h, col = '#6a3430', seed = 1) {
  const r = rnd(seed * 7 + 11);
  R(g, x, y, w, h, col);
  const d = sh(col, -0.35), l = sh(col, 0.16);
  for (let i = 0; i < (w * h) / 9; i++) R(g, x + Math.floor(r() * w), y + Math.floor(r() * h), 1, 1, r() < 0.6 ? d : l);
}
// Bloc de pierre taillée (pilastre, claveau, chaîne d'angle) éclairé en haut à gauche
export function stone(g, x, y, w, h, col) {
  R(g, x, y, w, h, col);
  R(g, x, y, w, 1, sh(col, 0.18)); R(g, x, y, 1, h, sh(col, 0.1));
  R(g, x + w - 1, y, 1, h, shadowOf(col, 0.4)); R(g, x, y + h - 1, w, 1, shadowOf(col, 0.3));
}
// Corniche moulurée : listel clair, gorge sombre, ombre portée sous elle sur le mur
export function cornice(g, x, y, w, col, wall = col, deep = 3) {
  R(g, x - 1, y - 1, w + 2, deep + 3, OUT);
  R(g, x, y, w, deep, col);
  R(g, x, y, w, 1, sh(col, 0.2));
  R(g, x, y + deep - 1, w, 1, shadowOf(col, 0.35));
  R(g, x, y + deep + 2, w, 2, shadowOf(wall, 0.32));
}

// ---------------------------------------------------------------- toitures
// Tuiles canal vues de face (bande de x, y sur w × h) : rangs de tuiles bombées, rives arrondies en bas
export function tiles(g, x, y, w, h, col = '#b4583a', seed = 1) {
  const r = rnd(seed * 13 + 5);
  const ch = sh(col, -0.45), lt = sh(col, 0.22), dk = sh(col, -0.22);
  R(g, x - 1, y - 1, w + 2, h + 4, OUT);
  R(g, x, y, w, h, ch);
  for (let tx = x; tx < x + w - 1; tx += 5) {
    const v = r(), c = v < 0.15 ? sh(col, 0.1) : v < 0.3 ? sh(col, -0.12) : v < 0.36 ? mix(col, '#6a7a4a', 0.35) : col;
    R(g, tx, y, 4, h, c);
    R(g, tx, y, 1, h, lt); R(g, tx + 3, y, 1, h, dk);
    for (let yy = y + 3 + Math.floor(r() * 3); yy < y + h - 2; yy += 6) { R(g, tx, yy, 4, 1, ch); R(g, tx, yy + 1, 4, 1, lt); }
    R(g, tx, y + h, 4, 2, c); R(g, tx + 1, y + h, 2, 1, ch); R(g, tx, y + h + 1, 1, 1, lt);
  }
}
// Bardeaux de bois (toit) : rangs décalés
export function shingles(g, x, y, w, h, col = '#6a5a4a', seed = 1) {
  const r = rnd(seed * 3 + 1);
  R(g, x, y, w, h, col);
  const d = sh(col, -0.3), l = sh(col, 0.12);
  for (let yy = y; yy < y + h; yy += 3) {
    R(g, x, yy + 2, w, 1, d);
    for (let xx = x + ((yy / 3) % 2 ? 2 : 0) + Math.floor(r() * 3); xx < x + w; xx += 4 + Math.floor(r() * 3)) {
      R(g, xx, yy, 1, 2, d);
      if (r() < 0.3) R(g, xx + 1, yy, 2, 1, l);
    }
  }
}
// Bout de viga (poutre ronde qui dépasse du mur) et son ombre portée
export function viga(g, x, y, wall, col = '#6a4a2c') {
  const s = shadowOf(wall, 0.42);
  R(g, x + 3, y + 4, 3, 1, s); R(g, x + 4, y + 5, 3, 1, s); R(g, x + 5, y + 6, 2, 1, s);
  O(g, x, y, [[0, 0, 4, 4, col]]);
  R(g, x + 1, y + 1, 2, 2, sh(col, 0.25)); R(g, x + 1, y + 1, 1, 1, sh(col, 0.45));
  R(g, x + 3, y, 1, 4, sh(col, -0.3));
}
// Gargouille (canal de terre cuite) et la tache qu'elle laisse sur le mur
export function canal(g, x, y, wall, len = 18) {
  const st = sh(wall, -0.16);
  for (let k = 0; k < len; k++) R(g, x + 1 + Math.round(Math.sin(k / 3) * 0.6), y + 3 + k, k < len * 0.6 ? 3 : 2, 1, st);
  O(g, x, y, [[-1, 0, 6, 3, '#9a4a2c']]);
  R(g, x - 1, y, 6, 1, '#c8704a'); R(g, x + 3, y + 1, 1, 1, '#5a2414');
}

// ---------------------------------------------------------------- ouvertures
// Arc (porte, arcade) : anneau de claveaux facultatif, intérieur sombre (plus noir en haut), tableau de droite
// éclairé. Renvoie les lignes de l'ouverture.
export function opening(g, x, base, w, h, { fill = '#2a1a16', ring = 0, ringCol = '#d8c8a8', wall = '#e0d4bc', reveal = 2, rise = null } = {}) {
  if (ring) {
    const outer = archRows(x - ring, base, w + ring * 2, h + ring, rise == null ? null : rise + ring);
    outlineRows(g, outer);
    fillRows(g, outer, ringCol);
    const r0 = w / 2 + ring / 2, cx = x + w / 2, sy = base - h + (rise == null ? w / 2 : rise);
    const kk = rise == null ? 1 : (rise + ring / 2) / r0;
    const jd = shadowOf(ringCol, 0.45);
    for (let a = 0; a <= Math.PI + 0.01; a += Math.PI / Math.max(5, Math.round(w / 5))) {
      for (let t = -ring / 2; t <= ring / 2; t++) R(g, cx + Math.cos(a) * (r0 + t), sy - Math.sin(a) * (r0 + t) * kk, 1, 1, jd);
    }
    R(g, x - ring, base - h + w / 2, ring, h - w / 2, ringCol);
  }
  const rows = archRows(x, base, w, h, rise);
  if (!ring) outlineRows(g, rows);
  fillRows(g, rows, fill);
  // l'intérieur s'éclaircit vers le bas (lumière réfléchie par le sol)
  const n = rows.length;
  rows.forEach(([y, a, b], i) => { if (i > n * 0.55) R(g, a, y, b - a, 1, sh(fill, 0.08 + (i / n - 0.55) * 0.25)); });
  if (reveal) for (const [y, a, b] of rows) R(g, b - reveal, y, reveal, 1, shadowOf(wall, 0.5));
  return rows;
}
// Porte de bois (planches, pentures, clous) dans des lignes (archRows) ou un rectangle
export function door(g, rows, { col = '#6a4024', studs = true, split = true } = {}) {
  if (!rows.length) return;
  const d = sh(col, -0.3), l = sh(col, 0.16), xs = rows.map((q) => q[1]), x0 = Math.min(...xs), x1 = Math.max(...rows.map((q) => q[2]));
  const y0 = rows[0][0], y1 = rows[rows.length - 1][0];
  const mid = Math.round((x0 + x1) / 2);
  for (const [y, a, b] of rows) {
    R(g, a, y, b - a, 1, col);
    for (let x = x0 + 4; x < b; x += 4) if (x > a) { R(g, x, y, 1, 1, d); if (x + 1 < b) R(g, x + 1, y, 1, 1, l); }
    if (split) R(g, mid, y, 1, 1, OUT);
    R(g, a, y, 1, 1, d);
  }
  const iron = '#2e2a2a', ihi = '#7a7470';
  for (const k of [0.22, 0.72]) {
    const y = Math.round(y0 + (y1 - y0) * k);
    const row = rows.find((q) => q[0] === y) || rows[rows.length - 1];
    R(g, row[1] + 1, y, row[2] - row[1] - 2, 2, iron); R(g, row[1] + 1, y, row[2] - row[1] - 2, 1, '#4a4440');
  }
  if (studs) for (const [y, a, b] of rows) {
    if ((y - y0) % 7 !== 4) continue;
    for (let x = a + 2; x < b - 1; x += 4) { R(g, x, y, 1, 1, iron); R(g, x, y - 1, 1, 1, ihi); }
  }
  R(g, mid - 3, Math.round((y0 + y1) / 2) + 4, 2, 2, '#c8a040'); R(g, mid + 2, Math.round((y0 + y1) / 2) + 4, 2, 2, '#c8a040');
}
// Fenêtre à grille de fer forgé (reja), appui en saillie et coulure dessous
export function grille(g, x, y, w, h, wall = '#e0d4bc', back = '#1e1416') {
  O(g, x, y, [[0, 0, w, h, back]]);
  R(g, x, y, w, 2, sh(back, 0.12));
  for (let bx = x + 1; bx < x + w - 1; bx += 3) { R(g, bx, y - 1, 1, h + 2, '#2a2626'); R(g, bx, y, 1, h, '#5a5452'); }
  R(g, x - 1, y + Math.round(h / 2), w + 2, 1, '#2a2626');
  R(g, x - 2, y + h + 1, w + 4, 2, OUT); R(g, x - 1, y + h + 1, w + 2, 1, sh(wall, 0.12));
  for (let k = 0; k < 6; k++) R(g, x + 1 + (k % 2), y + h + 3 + k, w - 2 - (k % 2) * 2, 1, sh(wall, -0.08 - k * 0.005));
}
// Fenêtre à volets de bois
export function shutters(g, x, y, w, h, col = '#5a6a5a', wall = '#e0d4bc', open = true) {
  O(g, x, y, [[0, 0, w, h, '#1e1416']]);
  R(g, x + 1, y + 1, w - 2, 1, '#3a2a26');
  if (open) for (const sx of [x - 5, x + w + 1]) {
    O(g, sx, y, [[0, 0, 4, h, col]]);
    for (let yy = y + 2; yy < y + h - 1; yy += 2) R(g, sx, yy, 4, 1, sh(col, -0.25));
    R(g, sx, y, 1, h, sh(col, 0.15));
  }
  R(g, x - 1, y + h + 1, w + 2, 1, sh(wall, 0.12));
}

// ---------------------------------------------------------------- bois de la palissade
// Pieu rond de palissade (de top à base), pointe taillée
export function stake(g, x, top, base, w = 7, col = '#8a7058', seed = 1) {
  const r = rnd(seed * 29 + 1);
  const tip = Math.round(w * 0.8) + Math.floor(r() * 2);
  const lit = sh(col, 0.18), lit2 = sh(col, 0.08), dk = shadowOf(col, 0.42), dk2 = shadowOf(col, 0.25);
  for (let i = 0; i < tip; i++) {
    const half = Math.max(0, Math.round(((i + 1) / tip) * (w / 2)));
    R(g, x + Math.floor(w / 2) - half - 1, top + i, half * 2 + 2, 1, OUT);
  }
  R(g, x - 1, top + tip, w + 2, base - top - tip, OUT);
  for (let i = 0; i < tip; i++) {
    const half = Math.max(0, Math.round(((i + 1) / tip) * (w / 2)) - 1);
    if (half <= 0) continue;
    R(g, x + Math.floor(w / 2) - half, top + i, half, 1, sh(col, 0.3)); // la taille fraîche, claire
    R(g, x + Math.floor(w / 2), top + i, half, 1, sh(col, -0.05));
  }
  const y0 = top + tip, hh = base - y0;
  R(g, x, y0, w, hh, col);
  R(g, x, y0, 1, hh, lit2); R(g, x + 1, y0, 1, hh, lit);
  R(g, x + w - 2, y0, 1, hh, dk2); R(g, x + w - 1, y0, 1, hh, dk);
  // fentes, nœuds, pied humide et sali
  for (let k = 0; k < 2; k++) { const cy = y0 + 6 + Math.floor(r() * (hh - 14)); R(g, x + 2 + Math.floor(r() * (w - 4)), cy, 1, 4 + Math.floor(r() * 8), sh(col, -0.28)); }
  if (r() < 0.6) { const ky = y0 + 4 + Math.floor(r() * (hh - 10)); R(g, x + 2, ky, 2, 2, sh(col, -0.35)); R(g, x + 2, ky, 1, 1, sh(col, 0.1)); }
  R(g, x, base - 6, w, 6, mix(col, '#4a3424', 0.45)); R(g, x, base - 7, w, 1, mix(col, '#4a3424', 0.25));
}
// Rondin couché (vu en long), éclairé dessus
export function logH(g, x, y, w, h = 5, col = '#7a5a40') {
  O(g, x, y, [[0, 0, w, h, col]]);
  R(g, x, y, w, 1, sh(col, 0.22)); R(g, x, y + h - 1, w, 1, shadowOf(col, 0.4));
  for (let k = x + 6; k < x + w - 3; k += 11) R(g, k, y + 1 + (k % 3 === 0 ? 1 : 0), 4, 1, sh(col, -0.2));
  R(g, x - 1, y, 2, h, sh(col, 0.32)); R(g, x, y + 1, 1, h - 2, sh(col, -0.15));
}
// Planches horizontales d'une façade de rondins équarris (blockhaus) : face éclairée ou à l'ombre
export function logWall(g, x, y, w, h, col, seed = 1) {
  const r = rnd(seed * 5 + 9);
  R(g, x, y, w, h, col);
  const d = sh(col, -0.32), l = sh(col, 0.14);
  for (let yy = y; yy < y + h; yy += 4) {
    R(g, x, yy + 3, w, 1, d); R(g, x, yy, w, 1, l);
    for (let k = 0; k < w / 12; k++) R(g, x + Math.floor(r() * w), yy + 1 + Math.floor(r() * 2), 3 + Math.floor(r() * 4), 1, sh(col, -0.12));
  }
}

// ---------------------------------------------------------------- végétation et sol
export function agave(g, x, base, s = 1, col = '#6a8a6a') {
  const lt = sh(col, 0.2), dk = sh(col, -0.3);
  const leaves = [[-7, -4], [-5, -8], [-2, -11], [1, -12], [4, -10], [6, -7], [8, -3], [-9, -1], [9, -1]];
  for (const [ex, ey] of leaves) {
    const n = Math.max(Math.abs(ex), Math.abs(ey)) * s;
    for (let i = 0; i <= n; i++) {
      const px = Math.round(x + (ex * s * i) / n), py = Math.round(base + (ey * s * i) / n);
      R(g, px - 1, py - 1, 3, 3, OUT);
    }
  }
  for (const [ex, ey] of leaves) {
    const n = Math.max(Math.abs(ex), Math.abs(ey)) * s;
    for (let i = 0; i <= n; i++) {
      const px = Math.round(x + (ex * s * i) / n), py = Math.round(base + (ey * s * i) / n);
      R(g, px, py, i < n * 0.7 ? 2 : 1, 1, ex < 0 ? lt : ex > 2 ? dk : col);
    }
    R(g, Math.round(x + ex * s), Math.round(base + ey * s), 1, 1, '#8a5a3a');
  }
}
export function pricklyPear(g, x, base, col = '#5a8a4a') {
  const pads = [[0, -9, 8, 10], [-7, -17, 7, 8], [5, -19, 7, 9], [-1, -26, 6, 8], [10, -11, 6, 7]];
  for (const [dx, dy, w, h] of pads) {
    const rows = [];
    for (let i = 0; i < h; i++) { const k = 1 - ((i - h / 2 + 0.5) / (h / 2)) ** 2; const hw = Math.max(1, Math.round((w / 2) * Math.sqrt(Math.max(0, k)))); rows.push([base + dy + i, x + dx + Math.round(w / 2) - hw, x + dx + Math.round(w / 2) + hw]); }
    outlineRows(g, rows);
    fillRows(g, rows, col);
    fillRows(g, rows.slice(0, Math.ceil(h / 2)), sh(col, 0.14));
    R(g, x + dx + w - 2, base + dy + 2, 1, h - 4, sh(col, -0.25));
    R(g, x + dx + 2, base + dy + 3, 1, 1, '#e8e0a0'); R(g, x + dx + w - 3, base + dy + h - 4, 1, 1, '#e8e0a0');
  }
  R(g, x + 6, base - 28, 2, 2, '#d84a5a'); R(g, x - 4, base - 19, 2, 2, '#e8c040');
}
export function ocotillo(g, x, base, h = 34) {
  const col = '#5a4a3a', gr = '#6a8a4a';
  for (const [ang, len] of [[-0.35, 1], [-0.15, 0.9], [0.05, 1.05], [0.25, 0.85], [0.42, 0.7]]) {
    const L = Math.round(h * len);
    for (let i = 0; i < L; i++) {
      const px = Math.round(x + Math.sin(ang) * i + Math.sin(i / 5 + ang * 9) * 0.6), py = base - Math.round(Math.cos(ang) * i);
      R(g, px, py, 1, 1, col);
      if (i > 4 && i % 3 === 0) R(g, px + (i % 2 ? 1 : -1), py, 1, 1, gr);
    }
    R(g, Math.round(x + Math.sin(ang) * L), base - Math.round(Math.cos(ang) * L) - 1, 1, 2, '#d8402a');
  }
}
// Arbre mort tordu
export function deadTree(g, x, base, h = 50, col = '#3a2a26', seed = 1) {
  const r = rnd(seed * 41 + 3);
  const branch = (bx, by, ang, len, w) => {
    let px = bx, py = by;
    for (let i = 0; i < len; i++) {
      ang += (r() - 0.5) * 0.25;
      px += Math.sin(ang); py -= Math.cos(ang);
      R(g, Math.round(px) - 1, Math.round(py) - 1, w + 2, 3, OUT);
      R(g, Math.round(px), Math.round(py), w, 1, col);
      if (w > 1 && i === Math.floor(len * 0.45)) branch(px, py, ang - 0.7 - r() * 0.4, Math.round(len * 0.6), w - 1);
      if (w > 1 && i === Math.floor(len * 0.7)) branch(px, py, ang + 0.6 + r() * 0.4, Math.round(len * 0.5), w - 1);
    }
  };
  branch(x, base, -0.08, Math.round(h * 0.55), 3);
  R(g, x - 2, base - 2, 8, 3, col); R(g, x - 3, base - 1, 10, 2, OUT);
}
// Peuplier des berges (cottonwood) : houppier en touffes
export function cottonwood(g, cx, base, w = 34, h = 44, seed = 1, col = '#6a7a3a') {
  const r = rnd(seed * 23 + 7);
  const trunk = '#5a4434';
  O(g, cx - 2, base, [[0, -Math.round(h * 0.45), 4, Math.round(h * 0.45), trunk]]);
  R(g, cx - 2, base - Math.round(h * 0.45), 1, Math.round(h * 0.45), sh(trunk, 0.2));
  const tufts = [];
  for (let i = 0; i < 9; i++) tufts.push([cx + (r() - 0.5) * w * 0.75, base - h * 0.55 - r() * h * 0.4, 6 + r() * 7, 5 + r() * 5]);
  for (const [tx, ty, rx, ry] of tufts) outlineRows(g, blob(r, tx, ty, rx, ry));
  const lt = sh(col, 0.2), dk = shadowOf(col, 0.35);
  for (const [tx, ty, rx, ry] of tufts) {
    fillRows(g, blob(r, tx, ty, rx, ry), dk);
    fillRows(g, blob(r, tx - 1, ty - 1, rx - 1.5, ry - 1.5), col);
    fillRows(g, blob(r, tx - rx * 0.35, ty - ry * 0.35, rx * 0.45, ry * 0.4), lt);
  }
}
// Touffes d'herbe sèche et cailloux sur un sol
export function scatter(g, x0, y0, w, h, n, seed, cols = ['#a8884e', '#8a6a3a', '#c8a868']) {
  const r = rnd(seed * 19 + 2);
  for (let i = 0; i < n; i++) {
    const x = x0 + Math.floor(r() * w), y = y0 + Math.floor(r() * h), k = r();
    if (k < 0.45) { R(g, x, y, 1, 1, cols[0]); R(g, x + 1, y - 1, 1, 2, cols[0]); R(g, x + 2, y, 1, 1, cols[1]); R(g, x - 1, y - 1, 1, 1, cols[1]); }
    else if (k < 0.8) { R(g, x, y, 2, 1, cols[1]); R(g, x, y - 1, 1, 1, cols[2]); }
    else { R(g, x - 1, y - 1, 5, 4, OUT); R(g, x, y - 1, 3, 2, cols[2]); R(g, x, y, 3, 2, cols[1]); R(g, x, y - 1, 1, 1, '#ece0c0'); }
  }
}
// Sol en bandes tramées plus taches et traces
export function ground(g, x0, y0, w, h, cols, seed = 1, specks = ['#ecd0a0', '#9a7a52']) {
  const n = cols.length;
  for (let i = 0; i < n; i++) {
    const ya = y0 + Math.round((i * h) / n), yb = y0 + Math.round(((i + 1) * h) / n);
    R(g, x0, ya, w, yb - ya, cols[i]);
    if (i) { g.fillStyle = cols[i - 1]; for (let x = x0 + (i % 2); x < x0 + w; x += 2) g.fillRect(x, ya, 1, 1); for (let x = x0 + 1; x < x0 + w; x += 4) g.fillRect(x, ya + 1, 1, 1); }
  }
  const r = rnd(seed * 31 + 5);
  for (let i = 0; i < (w * h) / 26; i++) {
    const y = y0 + Math.floor(r() * h), len = 1 + Math.floor(r() * (1 + (y - y0) / 14));
    R(g, x0 + Math.floor(r() * w), y, len, 1, r() < 0.5 ? specks[0] : specks[1]);
  }
}
