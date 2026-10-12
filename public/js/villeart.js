// Sprites de « La ville », dessinés avec isokit.js en pixels fins (2 par pixel du jeu, comme les combats de La piste) :
// chaque bâtiment est une petite recette (volumes, toit, enseigne, détails), à partir d'une douzaine de modèles
// (cabane, maison, boutique à fausse façade, grange, église, mine, atelier, tour, édifice public, fort, gare…).
// Les variantes (couleur, bardage) viennent du numéro du bâtiment ; un bâtiment amélioré (niveau 2) gagne un détail
// qui se voit (étage, silo, wagonnet, girouette…).
// Coordonnées : u descend vers la droite, v vers la gauche, 16 unités par case ; la face gauche (plan v = v0 + dv)
// regarde le joueur, c'est la façade ; cyl(cu, cv, r…) prend le CENTRE du cylindre ; sx / sy rendent des pixels fins.
// Planche de tout ce qui est dessiné ici : iso-art-test.html.
import * as I from './isokit.js';
import { BUILDINGS } from './villekit.js';

const { hex, tone, Sprite } = I;

// ------------------------------------------------------------ couleurs
const WOOD = ['#8a5a34', '#a8783c', '#7a4a2a', '#9a6a3a'];
const PAINT = ['#e8dcc0', '#c8b890', '#9aa8b0', '#b8c8a0', '#d8c070', '#c88a6a', '#a8b8c8'];
const ROOF = ['#5a4038', '#4a3a36', '#6a4a3a', '#5a5048'];
const pick = (arr, s) => arr[Math.abs(s) % arr.length];

// murs d'une matière : les trois faces d'une boîte (le détail des matières se fait au pixel fin : T, Z)
function walls(fn, topCol = '#8a7a6a') {
  const T = I.flatTop(topCol);
  return { left: (t, z, len, Tf, Zf, f) => fn(t, z, len, f ?? 1, Tf, Zf), right: (t, z, len, Tf, Zf, f) => fn(t, z, len, f ?? 2, Tf, Zf), top: T };
}
function roofOf(roofFn, wallFn, edgeCol = '#3a2414') {
  const E = [0, hex(edgeCol), tone(hex(edgeCol), -0.2)];
  return { roof: roofFn, gable: (t, z, f, Tf, Zf) => wallFn(t, z, 0, f, Tf, Zf), edge: (f) => E[f] || E[1] };
}
const solid = (h) => { const L = I.plain(h); return { left: (t, z) => L(t, z, 0, 1), right: (t, z) => L(t, z, 0, 2), top: (u, v) => L(u, v, 0, 0), side: (k) => tone(hex(h), 0.1 - k * 0.4), edge: (f) => L(0, 0, 0, f || 1) }; };
// planches d'un plancher (trottoir, quai, estrade)
const deck = (col = '#8a6a44') => { const R = I.ramp(col, 5, 0.3); return { top: (u, v, U, V) => (V % 5 === 0 ? tone(hex(col), -0.3) : I.dither(R, 0.5 + (I.hsh(Math.floor((U + (Math.floor(V / 5) & 1) * 9) / 18), Math.floor(V / 5), 7) - 0.5) * 0.4, U, V)), edge: (f) => tone(hex(col), f === 2 ? -0.45 : -0.3) }; };
// auvent rayé (deux couleurs en bandes le long de u)
const stripes = (a, b) => ({ top: (u, v, U) => ((U ?? u * 2) % 8 < 4 ? hex(a) : hex(b)), edge: (f) => tone(hex(a), f === 2 ? -0.45 : -0.3) });
// un cylindre de couleur unie, à dégradé lisse
const tube = (col, top = null) => ({ top: () => hex(top || col), side: (k) => tone(hex(col), 0.14 - k * 0.48) });

// ------------------------------------------------------------ accessoires
function barrel(sp, u, v, z0 = 0, col = '#8a5228') {
  const C = hex(col), Band = hex('#3a3a3a');
  sp.cyl(u, v, 2, z0, 5, { top: (a, b, z, U, V) => ((U + V) % 3 === 0 ? tone(C, -0.1) : tone(C, 0.22)), side: (k, z, Z) => (Z === 2 || Z === 7 ? Band : tone(C, 0.15 - k * 0.5 + ((Z % 4) === 0 ? -0.05 : 0))) });
}
function crate(sp, u, v, s = 3, z0 = 0, col = '#a8783c') {
  const C = hex(col), k = sp.k, S2 = s * k;
  const face = (T, Z, d) => tone(C, d + ((T === 0 || T === S2 - 1 || Z === 0 || Z === S2 - 1 || T === Z || T === S2 - 1 - Z) ? -0.22 : 0));
  sp.box(u, v, s, s, s, { left: (t, z, l, T, Z) => face(T, Z, 0), right: (t, z, l, T, Z) => face(T, Z, -0.3), top: (a, b, U, V) => tone(C, ((U === 0 || V === 0 || U === S2 - 1 || V === S2 - 1) ? -0.05 : 0.18)) }, z0);
}
function sacks(sp, u, v, col = '#c8b088') {
  for (const [du, dv] of [[0, 0], [3, 0], [1, 2]]) sp.vol(u + du, v + dv, 3, 2, (uu) => 2.5 - Math.abs(uu - 1.5) * 0.6, (uu, vv, z, f, s, U, V) => tone(hex(col), (f === 0 ? 0.12 : f === 1 ? -0.08 : -0.35) + ((U + V) % 4 === 0 ? -0.06 : 0)));
}
function hitch(sp, u, v, len = 8) {
  const C = hex('#6a4428');
  sp.post(u, v, 4, C); sp.post(u + len, v, 4, C);
  sp.seg(u, v, 4, u + len, v, 4, tone(C, 0.15));
}
function bench(sp, u, v) { sp.box(u, v, 6, 2, 2, walls(I.planks('#7a5232', 3)), 1); sp.post(u, v + 2, 1, hex('#4a2e1a')); sp.post(u + 6, v + 2, 1, hex('#4a2e1a')); }
// une vache (ou un cheval, un mouton) : corps tacheté, pattes, tête
function cow(sp, u, v, col = '#8a5a34', spots = '#e8dcc0', dir = 1) {
  const C = hex(col), Sp = hex(spots);
  sp.post(u + 0.5, v + 2, 2, tone(C, -0.3)); sp.post(u + 4, v + 2, 2, tone(C, -0.3));
  sp.vol(u, v, 5, 2, (uu) => 4 + (uu > 1 && uu < 4 ? 0.3 : 0), (uu, vv, z, f, s, U, V, Z) => {
    const spot = I.hsh(U >> 1, (f === 0 ? V : Z) >> 1, 3) < 0.28;
    return spot ? Sp : f === 0 ? tone(C, 0.15) : f === 1 ? C : tone(C, -0.35);
  }, 2);
  const hu = dir > 0 ? u + 5 : u - 2;
  sp.box(hu, v, 2, 2, 5.5, walls(I.plain(col), col), 3);
}
function railing(sp, u, v, len, axis, z, col = '#7a5232') {
  const C = hex(col);
  if (axis === 'u') sp.seg(u, v, z + 3, u + len, v, z + 3, tone(C, 0.15)); else sp.seg(u, v, z + 3, u, v + len, z + 3, tone(C, 0.15));
  for (let t = 0; t <= len; t += 2) sp.post(axis === 'u' ? u + t : u, axis === 'u' ? v : v + t, 3, C, z);
}
function flag(sp, u, v, col, z = 0, h = 16) {
  sp.post(u, v, h, hex('#3a3a3a'), z);
  const X = sp.sx(u, v) + 2, Y = sp.sy(u, v, z + h), k = sp.k;
  for (let i = 0; i < 6 * k; i++) for (let j = 0; j < 4 * k; j++) {
    const wave = Math.round(Math.sin(i / 3) * 1);
    sp.dot(X + i, Y + j + wave + (i > 4 * k ? 1 : 0), j >= k && j < 2 * k ? hex('#e8dcc0') : (i + j) % 7 === 0 ? tone(hex(col), -0.2) : hex(col));
  }
}
function poster(sp, wall, u0, v0, du, dv, t, z) {
  I.paint(sp, wall, u0, v0, du, dv, t, z, 3, 4, (i, j, W, H) => (j === 0 ? hex('#3a2414') : j > 2 && j < 6 && i > 1 && i < W - 2 ? hex('#5a4a3a') : (i + j) % 5 === 0 ? hex('#c8b080') : hex('#e0cc98')));
}
function logs(sp, u, v) {
  const end = (U, V, Z) => ((U + Z) % 4 === 0 ? hex('#a87850') : hex('#c8a070'));
  for (let k = 0; k < 3; k++) sp.vol(u, v + k * 2, 7, 2, (uu, vv) => 2 + (k === 1 ? 1.5 : 0) - Math.abs(vv - 1) * 0.6, (uu, vv, z, f, s, U, V, Z) => (f === 0 ? I.dither(I.ramp('#7a4a2a', 4, 0.3), 0.5 + (V % 3 === 0 ? -0.3 : 0), U, V) : f === 1 ? (uu === 0 ? end(U, V, Z) : hex('#6a4428')) : end(U, V, Z)));
}
function crates(sp, u, v) { crate(sp, u, v, 4); crate(sp, u + 5, v, 4); crate(sp, u + 2, v + 1, 3, 4, '#c8a050'); }
function smokestack(sp, u, v, h, col = '#5a5a60', r = 2) { sp.cyl(u, v, r, 0, h, { top: () => hex('#1a1a1a'), side: (k, z, Z) => tone(hex(col), 0.12 - k * 0.48 - (z > h - 3 ? 0.3 : 0) + (Z % 6 === 0 ? -0.08 : 0)) }); }
function tank(sp, u, v, r = 4, h = 9, col = '#9a9aa0') { sp.cyl(u, v, r, 0, h, { top: (a, b, z, U, V) => tone(hex(col), 0.15 + ((U + V) % 6 === 0 ? -0.1 : 0)), side: (k, z, Z) => tone(hex(col), 0.15 - k * 0.48 - (Z % 7 === 0 ? 0.12 : 0)) }, 2); }

// ------------------------------------------------------------ modèles
// tente (et tipi) : un cône de toile à coutures, l'ouverture sombre côté joueur
function tent(sp, cu, cv, r, h, col = '#e0d0a8') {
  const C = hex(col), D = tone(C, -0.62), R = I.ramp(col, 6, 0.4);
  sp.cyl(cu, cv, r, 0, 0.5, {
    top: (u, v, z, U, V) => {
      if (v > r && Math.abs(u - r) < (h - z) * 0.35 && z < h * 0.55) return D;
      const ang = Math.atan2(V - r * sp.k, U - r * sp.k);
      const seam = Math.floor(ang * 4) !== Math.floor((ang + 0.06) * 4);
      return I.dither(R, 0.62 - (U > V ? 0.3 : 0) + (seam ? -0.18 : 0) + z * 0.012, U, V);
    },
    side: (k) => tone(C, 0.1 - k * 0.45),
  }, h - 0.5);
  sp.seg(cu - 1, cv - 1, h + 2, cu + 1, cv + 1, h - 1, hex('#5a3a22'));
  sp.seg(cu + 1, cv - 1, h + 2, cu - 1, cv + 1, h - 1, hex('#5a3a22'));
  return sp;
}
function campfire(sp, u, v) {
  for (const [a, b] of [[0, 1], [1, 0], [2, 1], [1, 2]]) sp.box(u + a, v + b, 1, 1, 1, walls(I.plain('#8a8a8a')));
  const X = sp.sx(u + 1.5, v + 1.5), Y = sp.sy(u + 1.5, v + 1.5, 1);
  for (const [dx, dy, c] of [[0, -1, '#f8d070'], [0, -2, '#f8d070'], [1, -1, '#f0843a'], [-1, -1, '#f0843a'], [0, -3, '#f0843a'], [1, -2, '#c2281c'], [0, -4, '#c2281c']]) sp.dot(X + dx, Y + dy, hex(c));
}

// maison de bois : murs, toit à deux pans, porte, fenêtres, cheminée et porche en option
function house(sp, o) {
  const { u = 3, v = 3, du = 10, dv = 10, h = 9, rise = 6, axis = 'u', mat, roof, porch = false, chimney = false, door = true, win = 1, stories = 1, lit = false, shadow = true } = o;
  if (shadow) sp.shadow(u, v, du, dv + (porch ? 4 : 0));
  sp.box(u, v, du, dv, h, walls(mat));
  if (door) I.door(sp, 'L', u, v, du, dv, Math.floor(du / 2) - 1, 3, Math.min(6, h - 2));
  for (let k = 0; k < win; k++) {
    I.window(sp, 'R', u, v, du, dv, 2 + k * 5, 3, 2.5, 3, '#e0c890', '#2a2a3a', lit);
    if (stories > 1) I.window(sp, 'L', u, v, du, dv, 2 + k * 5, h - 6, 2.5, 3, '#e0c890', '#2a2a3a', lit);
  }
  if (du >= 12 && door) I.window(sp, 'L', u, v, du, dv, du - 4, 3, 2.5, 3);
  sp.gable(u, v, du, dv, h, rise, roofOf(roof, mat), axis, 2);
  if (porch) {
    sp.slab(u, v + dv, du, 4, 0, 1, deck('#7a5a3a'));
    sp.post(u + 1, v + dv + 3, 6, hex('#5a3a22'));
    sp.post(u + du - 1, v + dv + 3, 6, hex('#5a3a22'));
    sp.slab(u - 1, v + dv, du + 2, 4, 6, 1, { top: I.flatTop('#5a4a42'), edge: () => hex('#3a2414') });
  }
  if (chimney) { sp.box(u + du - 4, v + 2, 3, 3, h + rise + 2, walls(I.stone('#8a7a6a'))); sp.box(u + du - 4.5, v + 1.5, 4, 4, 1, walls(I.plain('#6a5a4a')), h + rise + 2); }
  return sp;
}

// boutique western (1 case) : trottoir de planches, corps à toit à deux pans caché derrière une haute fausse façade en
// gradins, une porte et deux vitrines, une enseigne à pictogramme, un auvent sur poteaux, des accessoires
function shop(sp, o) {
  const { mat, sign = '#2a2622', glyph = null, glyphCol = '#f8d070', awning = null, front = 18, h = 10, stories = 1, top = '#6a5a4a', props = null, roof = '#5a4a42', lit = false, balcony = false } = o;
  const u = 2, v = 1, du = 12, dv = 10;
  sp.shadow(u, v, du, dv + 4);
  sp.box(u, v, du, dv, h, walls(mat, top));
  sp.gable(u, v, du, dv - 1, h, 5, roofOf(I.shingles(roof), mat), 'v', 1);
  // fausse façade en gradins (le haut monte au milieu), corniche sombre
  const ff = (uu) => front + (uu >= 4 && uu < du - 4 ? 2 : 0) - (uu < 1 || uu >= du - 1 ? 3 : 0);
  sp.vol(u, v + dv - 1, du, 2, ff, (uu, vv, z, f, s, U, V, Z) => (f === 0 ? hex('#4a2e1a') : z > ff(uu) - 1.5 ? tone(mat(uu, z, du, f, U, Z), -0.3) : mat(uu, z, du, f, U, Z)));
  const V = v + 1, DV = dv; // le plan de la façade : v = 11
  I.door(sp, 'L', u, V, du, DV, 5, 2, 6, '#3a2414');
  I.window(sp, 'L', u, V, du, DV, 1, 2, 3, 4, '#e0c890', lit ? '#f8d070' : '#3a3a4a', lit);
  I.window(sp, 'L', u, V, du, DV, 8, 2, 3, 4, '#e0c890', lit ? '#f8d070' : '#3a3a4a', lit);
  if (stories > 1) { I.window(sp, 'L', u, V, du, DV, 2, h - 3, 2, 3, '#e0c890', '#2a2a3a', lit); I.window(sp, 'L', u, V, du, DV, du - 4, h - 3, 2, 3, '#e0c890', '#2a2a3a', lit); }
  I.sign(sp, 'L', u, V, du, DV, 2, front - 6, du - 4, 4, sign, glyph, glyphCol);
  I.window(sp, 'R', u, v, du, dv, 3, 3, 2, 3);
  sp.slab(0, 11, 16, 5, 0, 1, deck());
  if (balcony) { sp.slab(u, 11, du, 3, 9, 1, deck('#6a4a30')); railing(sp, u, 14, du, 'u', 10); }
  if (awning) {
    sp.post(u, 14, 7, hex('#5a3a22'));
    sp.post(u + du - 1, 14, 7, hex('#5a3a22'));
    sp.slab(u - 1, 11, du + 2, 4, 7, 1, typeof awning === 'string' ? { top: I.flatTop(awning), edge: () => tone(hex(awning), -0.4) } : stripes(awning[0], awning[1]));
  }
  if (props) props(sp);
  return sp;
}

// édifice en dur (brique ou pierre), corniche, toit plat ou à quatre pans
function hall(sp, o) {
  const { u = 2, v = 2, du = 28, dv = 28, h = 18, mat, top = '#7a6a5a', hipRoof = null, rise = 8, wins = 4, rows = 2, door = true, cornice = '#d8c8a8', lit = false, steps = true } = o;
  sp.shadow(u, v, du, dv);
  sp.box(u, v, du, dv, h, walls(mat, top));
  const C = hex(cornice);
  sp.slab(u - 1, v - 1, du + 2, dv + 2, h, 2, { top: hipRoof ? () => C : I.flatTop(top), edge: (f) => tone(C, f === 2 ? -0.3 : 0) });
  // bandeau entre les étages
  if (rows > 1) for (let r = 1; r < rows; r++) sp.slab(u - 0.5, v + dv - 0.5, du + 0.5, 0.5, Math.floor((r * (h - 2)) / rows) + 1, 0.5, solid(cornice));
  const step = Math.max(4, Math.floor(du / (wins + 1)));
  for (let r = 0; r < rows; r++) for (let k = 1; k <= wins; k++) {
    const z = 3 + r * Math.floor((h - 2) / rows);
    if (door && r === 0 && Math.abs(k * step - du / 2) < 3) continue;
    I.window(sp, 'L', u, v, du, dv, k * step - 1, z, 2.5, 4, '#e0d0b0', '#2a2a3a', lit);
    if (k * step < dv - 2) I.window(sp, 'R', u, v, du, dv, k * step - 1, z, 2.5, 4, '#e0d0b0', '#2a2a3a', lit);
  }
  if (door) {
    I.door(sp, 'L', u, v, du, dv, Math.floor(du / 2) - 2, 4, 7, '#4a2a18');
    if (steps) sp.slab(u + Math.floor(du / 2) - 3, v + dv, 6, 2, 0, 1, solid(cornice));
  }
  if (hipRoof) sp.hip(u, v, du, dv, h + 2, rise, roofOf(hipRoof, mat), 1);
  return sp;
}

// grange (fermes, ranchs) : grande porte à croisillon, lucarne du fenil, toit raide, silos à côté
function barn(sp, o) {
  const { col = '#a83a28', silo = true, roof = '#5a5048', trim = '#e8dcc0', seed = 1, silos = 1 } = o;
  const u = 2, v = 4, du = 16, dv = 20, h = 12;
  const mat = I.battens(col, seed);
  sp.shadow(u, v, du + 10, dv);
  sp.box(u, v, du, dv, h, walls(mat));
  const T = hex(trim), Dd = tone(hex(col), -0.3);
  I.paint(sp, 'L', u, v, du, dv, 5, 0, 6, 8, (i, j, W, H) => {
    const d1 = Math.abs(i * H - j * W) < W * 1.2, d2 = Math.abs(i * H - (H - 1 - j) * W) < W * 1.2;
    return i < 1 || i >= W - 1 || j < 1 || j >= H - 1 || i === W / 2 || d1 || d2 ? T : Dd;
  });
  I.window(sp, 'L', u, v, du, dv, 6.5, 12.5, 3, 2.5, trim, '#3a2a1a');
  sp.gable(u, v, du, dv, h, 9, roofOf(I.tin(roof), mat), 'v', 1);
  if (silo) for (let k = 0; k < silos; k++) {
    const S2 = { top: (a, b, z, U, V) => ((U + V) % 5 === 0 ? hex('#8a8a90') : hex('#a8a8b0')), side: (kk, z, Z) => tone(hex('#c8c0b0'), 0.12 - kk * 0.5 - (Z % 9 === 0 ? 0.12 : 0)) };
    sp.cyl(u + du + 6, v + 5 + k * 9, 4, 0, 20 - k * 3, S2, 4);
  }
  return sp;
}

// enclos : barrière de piquets autour d'un rectangle (ranchs, cimetière, villa)
function fence(sp, u0, v0, du, dv, h = 3, col = '#7a5232', every = 4) {
  const C = hex(col), Cr = tone(C, 0.2);
  for (const zr of [h - 0.6, h * 0.45]) {
    sp.seg(u0, v0, zr, u0 + du, v0, zr, Cr); sp.seg(u0, v0 + dv, zr, u0 + du, v0 + dv, zr, Cr);
    sp.seg(u0, v0, zr, u0, v0 + dv, zr, Cr); sp.seg(u0 + du, v0, zr, u0 + du, v0 + dv, zr, Cr);
  }
  for (let t = 0; t <= du; t += every) { sp.post(u0 + t, v0, h, C); sp.post(u0 + t, v0 + dv, h, C); }
  for (let t = 0; t <= dv; t += every) { sp.post(u0, v0 + t, h, C); sp.post(u0 + du, v0 + t, h, C); }
}

// chevalement de mine : deux jambes, une poulie, un hangar, une entrée de galerie, un tas de minerai, un wagonnet
function mine(sp, o) {
  const { ore = '#c89a20', lvl = 1 } = o;
  sp.shadow(4, 4, 24, 24);
  sp.vol(2, 2, 12, 10, (u, v) => 7 - Math.max(0, u - 6) * 0.6 - Math.max(0, v - 6) * 0.6, (u, v, z, f, s, U, V, Z) => (f === 0 ? I.dither(I.ramp('#8a7a68', 5, 0.32), 0.6 + (I.hsh(U >> 1, V >> 1, 4) - 0.5) * 0.4, U, V) : I.dither(I.ramp(f === 1 ? '#7a6a58' : '#5a4a3a', 4, 0.25), 0.5 + (I.hsh(U >> 1, Z >> 1, 2) - 0.5) * 0.4, U, Z)));
  // entrée de galerie boisée
  I.paint(sp, 'L', 3, 2, 10, 10, 2, 0, 5, 5, (i, j, W, H) => (i < 2 || i >= W - 2 || j < 2 ? hex(i < 1 || i >= W - 1 || j < 1 ? '#4a2e1a' : '#7a5232') : hex('#140c08')));
  // tas de minerai
  sp.vol(19, 19, 10, 9, (u, v) => 6 - Math.abs(u - 5) * 0.8 - Math.abs(v - 4.5) * 0.8, (u, v, z, f, s, U, V, Z) => {
    const r = I.hsh(U, f === 0 ? V : Z, 3);
    return r < 0.22 ? hex(ore) : r < 0.3 ? tone(hex(ore), -0.3) : f === 0 ? hex('#6a5a4a') : f === 1 ? hex('#5a4a3a') : hex('#4a3a2e');
  });
  house(sp, { u: 4, v: 16, du: 12, dv: 10, h: 8, rise: 5, mat: I.planks('#7a4a2a', 3), roof: I.tin('#6a6a70'), door: true, win: 1 });
  // chevalement : deux jambes en A, des traverses, une poulie
  const L = hex('#4a2e1a'), L2 = tone(L, 0.25);
  for (const d of [-1, 1]) { sp.seg(18 + d * 3, 8 - d * 3, 0, 18, 8, 26, L); sp.seg(18 + d * 3 + 0.5, 8 - d * 3, 0, 18.5, 8, 26, L2); }
  for (let z = 4; z < 26; z += 6) { const w = 3 * (1 - z / 27); sp.seg(18 - w, 8 + w, z, 18 + w, 8 - w, z, L); }
  sp.cyl(18, 8, 1.5, 26, 1, tube('#2a2a2a', '#8a8a90'));
  sp.seg(18, 8, 26, 18, 8, 6, hex('#8a8a90'));
  for (let k = 0; k < (lvl > 1 ? 2 : 1); k++) {
    const uu = 16 + k * 6;
    sp.box(uu, 26, 5, 3, 3, walls(I.plain('#5a5a60')), 1);
    sp.vol(uu + 1, 26, 3, 3, (a) => 5 - Math.abs(a - 1.5) * 0.5, (a, b, z, f) => (f === 0 ? hex(ore) : hex('#5a4a3a')), 3);
  }
  return sp;
}

// atelier (industrie) : grand corps, haute cheminée qui fume, tas de matière, cuves
function works(sp, o) {
  const { a = 2, b = 1, col = '#7a4a2a', brickWall = false, stack = true, roof = '#5a5048', pile = null, tanks = 0, seed = 1, glyph = null, lvl = 1 } = o;
  const du = a * 16 - 6, dv = b * 16 - 6;
  const mat = brickWall ? I.brick(col, '#b89878', seed) : I.planks(col, seed);
  sp.shadow(3, 3, du, dv);
  sp.box(3, 3, du, dv, 12, walls(mat));
  I.door(sp, 'L', 3, 3, du, dv, 2, 4, 7, '#3a2414');
  for (let k = 8; k < du - 2; k += 6) I.window(sp, 'L', 3, 3, du, dv, k, 5, 3, 3, '#c8b890', '#3a3a4a');
  sp.gable(3, 3, du, dv, 12, 6, roofOf(I.tin(roof), mat), 'u', 1);
  if (glyph) I.sign(sp, 'R', 3, 3, du, dv, Math.floor(dv / 2) - 3, 13, 6, 5, '#2a2622', glyph);
  if (stack) smokestack(sp, du - 3, 6, lvl > 1 ? 36 : 30, brickWall ? '#8a3a28' : '#5a5a60');
  if (lvl > 1 && a > 1) smokestack(sp, du - 9, 6, 26, brickWall ? '#8a3a28' : '#5a5a60');
  for (let k = 0; k < tanks; k++) tank(sp, 8 + k * 10, dv + 7, 4, 10);
  if (pile) sp.vol(du - 8, dv + 4, 8, 5, (u) => 4 - Math.abs(u - 4) * 0.6, (u, v, z, f, s, U, V) => tone(hex(pile), (f === 0 ? 0.1 : f === 1 ? -0.1 : -0.35) + (I.hsh(U, V, 5) < 0.2 ? -0.12 : 0)));
  return sp;
}

// église (et mission) : nef, clocher sur la façade, croix
function church(sp, o) {
  const { mat, roof, du = 12, dv = 22, adobeStyle = false, cross = true } = o;
  const u = 2, v = 5;
  sp.shadow(u, v - 3, du, dv + 3);
  sp.box(u, v, du, dv, 13, walls(mat));
  if (adobeStyle) {
    sp.slab(u, v, du, dv - 2, 13, 1, { top: I.flatTop('#a08060'), edge: () => hex('#6a4a30') });
    sp.vol(u, v + dv - 2, du, 2, (uu) => 22 - Math.abs(uu - du / 2) * 0.7, (uu, vv, z, f, s, U, V, Z) => (f === 0 ? hex('#b8906a') : mat(uu, z, du, f, U, Z)));
    const bx = Math.floor(du / 2) - 2;
    I.paint(sp, 'L', u, v, du, dv, bx, 15, 4, 4, (i, j, W, H) => (i < 1 || i >= W - 1 || j < 1 ? hex('#8a6a4a') : j > H / 2 && i > 2 && i < W - 3 ? hex('#c89a40') : hex('#2a1a10')));
    for (let k = 3; k < du - 4; k += 7) I.paint(sp, 'L', u, v, du, dv, k, 1, 4, 7, (i, j, W) => ((j < 3 && (i < 2 - j || i > W - 3 + j)) ? 0 : hex('#4a2a1e')));
  } else {
    sp.gable(u, v, du, dv, 13, 7, roofOf(roof, mat), 'v', 1);
    sp.box(u + 3, v + dv - 6, 6, 6, 24, walls(mat));
    I.window(sp, 'L', u + 3, v + dv - 6, 6, 6, 2, 17, 2, 4, '#e0c890', '#2a2a3a');
    sp.hip(u + 3, v + dv - 6, 6, 6, 24, 9, roofOf(roof, mat), 1);
  }
  I.door(sp, 'L', u, v, du, dv, Math.floor(du / 2) - 2, 4, 8, '#5a2a18');
  for (let k = 3; k < dv - 6; k += 6) I.window(sp, 'R', u, v, du, dv, k, 5, 2, 5, '#e0c890', '#5a7ab0');
  if (cross) {
    const cu = u + 6, cv = v + dv - 3, zc = adobeStyle ? 24 : 35, Cc = hex('#e8dcc0');
    sp.seg(cu, cv, zc, cu, cv, zc + 6, Cc); sp.seg(cu - 1.5, cv + 1.5, zc + 4, cu + 1.5, cv - 1.5, zc + 4, Cc);
  }
  return sp;
}

// château d'eau sur pilotis
function waterTower(sp) {
  const L = hex('#4a2e1a');
  for (const [du, dv] of [[4, 4], [12, 4], [4, 12], [12, 12]]) sp.post(du, dv, 15, L);
  sp.seg(4, 12, 7, 12, 12, 7, L); sp.seg(12, 4, 7, 12, 12, 7, tone(L, -0.2)); sp.seg(4, 12, 0, 12, 12, 14, L); sp.seg(12, 4, 0, 12, 12, 14, tone(L, -0.2));
  sp.cyl(8, 8, 6, 15, 10, { top: () => hex('#6a4a2a'), side: (k, z, Z) => tone(hex('#8a5a34'), 0.15 - k * 0.48 - (Z % 6 === 0 ? 0.14 : 0)) }, 4);
  return sp;
}
// éolienne de ranch : pylône en treillis, roue à pales, gouvernail, abreuvoir
function windmill(sp) {
  const L = hex('#5a3a22');
  for (const [a, b] of [[-3, 3], [3, -3], [-2, -2], [2, 2]]) sp.seg(8 + a, 8 + b, 0, 8, 8, 24, a + b > 0 ? tone(L, -0.2) : L);
  for (let z = 4; z < 24; z += 5) { const w = 3 * (1 - z / 25); sp.seg(8 - w, 8 + w, z, 8 + w, 8 - w, z, L); }
  const X = sp.sx(7, 9), Y = sp.sy(7, 9, 27), B = hex('#d8d0c0'), Bd = hex('#9a9288'), k = sp.k;
  for (let a = 0; a < 18; a++) {
    const ang = (a / 18) * 6.2832, cs = Math.cos(ang), sn = Math.sin(ang);
    for (let r = 2 * k; r <= 6 * k; r++) sp.dot(X + Math.round(cs * r * 0.6), Y + Math.round(sn * r), a % 2 ? B : Bd);
  }
  sp.dot2(X - 1, Y - 1, hex('#3a3a3a'));
  sp.seg(8, 8, 27, 13, 6, 26, hex('#7a3a28'));
  sp.box(1, 11, 6, 3, 2, { left: (t, z, l, T, Z) => (Z > 2 ? hex('#5a8ab0') : hex('#7a5232')), right: () => hex('#5a3a22'), top: () => hex('#4a7ab8') });
  return sp;
}
function well(sp) {
  sp.shadow(3, 3, 10, 10);
  sp.cyl(8, 8, 5, 0, 5, { top: (u, v) => ((u - 5) ** 2 + (v - 5) ** 2 < 10 ? hex('#1a2a3a') : hex('#9a8a78')), side: (k, z, Z) => tone(hex('#9a8a78'), 0.12 - k * 0.45 - (Z % 3 === 0 ? 0.1 : 0)) });
  const L = hex('#5a3a22');
  sp.post(4, 8, 12, L); sp.post(12, 8, 12, L);
  sp.gable(3, 5, 10, 6, 12, 4, roofOf(I.shingles('#5a4038'), I.planks('#7a5232')), 'u', 1);
  sp.seg(8, 8, 11, 8, 8, 7, hex('#c8b088'));
  sp.box(7, 8, 2, 2, 2, walls(I.plain('#7a5232')), 6);
  return sp;
}

// ------------------------------------------------------------ recettes de chaque bâtiment
// H : marge du haut (ce qui dépasse) ; draw(sp, seed, lvl)
const R = {};
const def = (id, H, draw) => { R[id] = { H, draw }; };

// ---- logement
def('tente', 28, (sp, s) => { sp.shadow(2, 2, 12, 12); tent(sp, 7, 6, 6, 14, pick(['#e0d0a8', '#d8c098', '#e8dcc0'], s)); campfire(sp, 11, 12); return sp; });
def('cabane', 30, (sp, s, lvl) => { house(sp, { mat: I.planks(pick(WOOD, s), s), roof: I.shingles(pick(ROOF, s), s), chimney: s % 2 === 0 || lvl > 1, porch: lvl > 1, axis: s % 3 ? 'u' : 'v' }); if (lvl < 2) barrel(sp, 13, 14); return sp; });
def('maison', 36, (sp, s, lvl) => house(sp, { u: 2, v: 2, du: 12, dv: 10, h: lvl > 1 ? 15 : 10, rise: 7, mat: I.planks(pick(PAINT, s), s), roof: I.shingles(pick(ROOF, s + 1), s), porch: true, win: 2, stories: lvl > 1 ? 2 : 1, chimney: s % 2 === 1 }));
def('pension', 42, (sp, s) => { house(sp, { u: 2, v: 2, du: 28, dv: 10, h: 17, rise: 7, mat: I.planks(pick(PAINT, s + 2), s), roof: I.shingles(pick(ROOF, s), s), porch: true, win: 5, stories: 2, chimney: true }); I.sign(sp, 'L', 2, 2, 28, 10, 18, 11, 7, 3, '#2a2622', 'bed'); return sp; });
def('brique', 40, (sp, s) => hall(sp, { u: 2, v: 2, du: 12, dv: 12, h: 16, mat: I.brick(pick(['#9a4a30', '#8a3a28', '#a85a3a'], s), '#c8a888', s), hipRoof: I.shingles('#4a3a36', s), rise: 6, wins: 2, rows: 2 }));
def('immeuble', 52, (sp, s) => hall(sp, { u: 2, v: 2, du: 28, dv: 28, h: 26, mat: I.brick(pick(['#9a4a30', '#a85a3a'], s), '#c8a888', s), wins: 5, rows: 3 }));
def('villa', 48, (sp, s) => { fence(sp, 1, 1, 30, 29, 3, '#e8e0d0', 3); house(sp, { u: 5, v: 4, du: 20, dv: 16, h: 18, rise: 9, mat: I.planks(pick(['#f0e8d8', '#e8d8c8', '#d8e0e8'], s), s), roof: I.shingles('#5a3a3a', s), porch: true, win: 3, stories: 2, chimney: true }); tree(sp, 24, 22, s); return sp; });
def('cite', 46, (sp, s) => { house(sp, { u: 2, v: 2, du: 28, dv: 10, h: 15, rise: 5, mat: I.battens('#8a7a6a', s), roof: I.tin('#6a6a70'), win: 5, stories: 2 }); house(sp, { u: 2, v: 18, du: 28, dv: 10, h: 15, rise: 5, mat: I.battens('#7a6a5a', s + 1), roof: I.tin('#6a6a70'), win: 5, stories: 2 }); return sp; });

// ---- cultures et élevage (les champs sont dessinés au sol)
def('ferme_mais', 42, (sp, s, lvl) => barn(sp, { col: '#a83a28', seed: s, silos: lvl > 1 ? 2 : 1 }));
def('ferme_ble', 42, (sp, s, lvl) => barn(sp, { col: '#c8a050', seed: s, roof: '#6a4a3a', silos: lvl > 1 ? 2 : 1 }));
def('potager', 30, (sp, s) => {
  for (let k = 0; k < 3; k++) sp.box(2 + k * 4, 6, 3, 9, 1, { left: () => hex('#5a3a22'), right: () => hex('#4a2a18'), top: (u, v, U, V) => (V % 4 < 2 ? (I.hsh(U >> 1, V >> 1, k) < 0.35 ? hex('#c2643e') : I.hsh(U, V, k + 3) < 0.5 ? hex('#4a8a3a') : hex('#6aa84a')) : hex('#6a4428')) });
  house(sp, { u: 2, v: 1, du: 7, dv: 4, h: 6, rise: 3, mat: I.planks('#7a5232', s), roof: I.tin('#6a6a70'), win: 0, door: false, shadow: false });
  // épouvantail
  const W = hex('#6a4428');
  sp.seg(13, 4, 0, 13, 4, 10, W); sp.seg(11.5, 5.5, 7, 14.5, 2.5, 7, hex('#c8a050'));
  sp.cyl(13, 4, 1, 10, 1.5, tube('#e0b090')); sp.cyl(13, 4, 1.5, 11.5, 0.6, tube('#7a5232'), 1);
  return sp;
});
def('coton', 42, (sp, s) => { barn(sp, { col: '#e8dcc0', trim: '#7a4a2a', seed: s, silo: false }); sacks(sp, 22, 8, '#f0ece0'); sacks(sp, 22, 14, '#f0ece0'); return sp; });
def('tabac', 42, (sp, s) => {
  barn(sp, { col: '#7a5232', trim: '#c8a050', seed: s, silo: false });
  // le séchoir : des lattes ouvertes sur le côté
  for (let k = 0; k < 5; k++) sp.seg(18, 4 + 3 + k * 4, 2, 18, 4 + 3 + k * 4, 10, hex('#2a1a0e'));
  return sp;
});
def('verger', 36, (sp, s) => { house(sp, { u: 2, v: 2, du: 12, dv: 10, h: 8, rise: 6, mat: I.planks('#b8c8a0', s), roof: I.shingles('#6a4a3a', s), porch: true }); for (const [u, v] of [[18, 4], [26, 4], [18, 14], [26, 14], [18, 24], [26, 24], [6, 22]]) tree(sp, u, v, s + u, 'fruitier'); crate(sp, 10, 26, 4, 0, '#c8a050'); return sp; });
def('ranch', 42, (sp, s) => { fence(sp, 1, 1, 30, 30, 3); house(sp, { u: 3, v: 3, du: 14, dv: 12, h: 9, rise: 7, mat: I.planks('#8a5a34', s), roof: I.shingles('#4a3a36', s), porch: true, chimney: true }); barnLite(sp, 20, 4, s); cow(sp, 8, 22, '#8a5a34', '#e8dcc0'); cow(sp, 18, 24, '#1a1414', '#e8dcc0', -1); cow(sp, 24, 18, '#c8a070', '#8a5a34'); return sp; });
def('haras', 42, (sp, s) => { fence(sp, 1, 1, 30, 30, 3, '#e8dcc0'); barn(sp, { col: '#7a3a28', seed: s, silo: false }); cow(sp, 22, 24, '#5a3a22', '#5a3a22'); cow(sp, 26, 6, '#e8dcc0', '#c8b890', -1); return sp; });
def('bergerie', 36, (sp, s) => { fence(sp, 1, 1, 30, 14, 3); house(sp, { u: 3, v: 2, du: 14, dv: 10, h: 7, rise: 5, mat: I.battens('#9a8a6a', s), roof: I.tin('#7a7a80') }); for (const [u, v] of [[20, 4], [24, 9], [21, 11]]) sheep(sp, u, v); return sp; });
def('porcherie', 28, (sp, s) => { fence(sp, 1, 1, 14, 14, 2); house(sp, { u: 2, v: 2, du: 8, dv: 6, h: 5, rise: 3, mat: I.planks('#7a5a3a', s), roof: I.tin('#7a7a80'), win: 0 }); sp.vol(3, 10, 8, 4, 0.5, (u, v, z, f, s2, U, V) => (I.hsh(U, V, 2) < 0.3 ? hex('#5a3a22') : hex('#6a4a2a'))); pig(sp, 9, 10); pig(sp, 4, 11); return sp; });
def('puits', 32, (sp) => well(sp));
def('eolienne', 44, (sp) => windmill(sp));
def('canal', 22, (sp) => {
  sp.box(0, 4, 16, 8, 2, walls(I.stone('#8a7a6a'), '#9a8a78'));
  sp.box(0, 6, 16, 4, 1, { left: () => hex('#3a6aa0'), right: () => hex('#2a5a90'), top: (u, v, U, V) => ((U + V * 3) % 11 === 0 ? hex('#8ab8e0') : (U + V) % 7 === 0 ? hex('#5a8ac8') : hex('#4a7ab8')) }, 1);
  sp.post(7, 6, 6, hex('#5a3a22')); sp.post(7, 10, 6, hex('#5a3a22'));
  sp.box(7, 5, 1, 6, 1, walls(I.plain('#6a4428')), 6);
  return sp;
});
def('chateau_eau', 46, (sp) => waterTower(sp));

// ---- extraction
def('bucheron', 32, (sp, s) => { house(sp, { u: 2, v: 2, du: 9, dv: 8, h: 7, rise: 5, mat: I.planks('#6a4428', s), roof: I.shingles('#4a3a36', s), win: 0 }); logs(sp, 7, 11); sp.cyl(13.5, 4.5, 1.5, 0, 2, { top: (u, v, z, U, V) => ((U - 3) ** 2 + (V - 3) ** 2) % 5 === 0 ? hex('#a87850') : hex('#c8a070'), side: (k) => tone(hex('#6a4428'), -k * 0.4) }); return sp; });
def('placer', 28, (sp, s) => {
  tent(sp, 5, 4, 3, 9, '#e0d0a8');
  sp.vol(1, 9, 15, 4, (u) => 4 - u * 0.2, (u, v, z, f, s2, U, V) => (f === 0 ? (v > 0 && v < 3 ? ((U + V) % 6 === 0 ? hex('#8ab8e0') : hex('#5a8ab0')) : hex('#8a6040')) : hex(f === 1 ? '#7a5232' : '#5a3a22')));
  for (let k = 2; k < 15; k += 3) sp.post(k, 13, 2, hex('#5a3a22'));
  sp.cyl(12, 5, 2, 0, 0.5, { top: (u, v, z, U, V) => ((U + V) % 3 ? hex('#7a6a5a') : hex('#f8d070')), side: () => hex('#5a4a3a') });
  return sp;
});
def('mine_or', 50, (sp, s, lvl) => mine(sp, { ore: '#f8d070', lvl }));
def('mine_argent', 50, (sp, s, lvl) => mine(sp, { ore: '#d8d8e8', lvl }));
def('mine_cuivre', 50, (sp, s, lvl) => mine(sp, { ore: '#e0844a', lvl }));
def('mine_charbon', 50, (sp, s, lvl) => mine(sp, { ore: '#2a2220', lvl }));
def('mine_fer', 50, (sp, s, lvl) => mine(sp, { ore: '#9a5a48', lvl }));
def('saline', 30, (sp, s) => {
  // bassins d'évaporation blancs et un tas de sel, une cabane
  for (const [u, v] of [[2, 2], [16, 2], [2, 16]]) sp.box(u, v, 12, 12, 1, { left: () => hex('#9a8a78'), right: () => hex('#7a6a5a'), top: (a, b, U, V) => (U < 2 || V < 2 ? hex('#b0a088') : (U * 3 + V) % 13 === 0 ? hex('#c8d8e0') : hex('#f0f0ec')) });
  sp.vol(18, 18, 10, 10, (u, v) => 7 - Math.hypot(u - 5, v - 5) * 1.3, (u, v, z, f, s2, U, V) => tone(hex('#f4f4f0'), f === 0 ? (I.hsh(U, V, 1) < 0.2 ? -0.08 : 0.02) : f === 1 ? -0.1 : -0.3));
  house(sp, { u: 22, v: 4, du: 8, dv: 7, h: 6, rise: 4, mat: I.planks('#8a7a6a', s), roof: I.tin('#7a7a80'), win: 0, shadow: false });
  return sp;
});
def('carriere', 30, (sp, s) => {
  sp.vol(2, 2, 28, 28, (u, v) => (u > 6 && u < 22 && v > 6 && v < 22 ? -3 + (Math.floor((u + v) / 3) % 2) : 3), (u, v, z, f, s2, U, V, Z) => (f === 0 ? I.dither(I.ramp(z < 0 ? '#b0a088' : '#c8b8a0', 4, 0.25), 0.5 + (I.hsh(U >> 1, V >> 1, 6) - 0.5) * 0.5, U, V) : hex(f === 1 ? '#9a8a78' : '#7a6a5a')), -4);
  house(sp, { u: 22, v: 2, du: 8, dv: 7, h: 6, rise: 4, mat: I.planks('#7a5232', s), roof: I.tin('#7a7a80'), win: 0 });
  for (const [u, v] of [[24, 14], [26, 19], [23, 21]]) sp.box(u, v, 4, 3, 3, walls(I.stone('#c8b8a0')));
  const L = hex('#5a3a22');
  sp.seg(10, 24, 0, 10, 24, 18, L); sp.seg(10, 24, 18, 20, 24, 15, L); sp.seg(20, 24, 15, 20, 24, 8, hex('#c8b088'));
  return sp;
});
def('derrick', 52, (sp, s, lvl) => {
  const L = hex('#3a2a20');
  for (const [a, b] of [[-5, 5], [5, -5], [-4, -4], [4, 4]]) sp.seg(7 + a, 7 + b, 0, 7, 7, 34, a + b > 0 ? tone(L, -0.2) : L);
  for (let z = 4; z < 34; z += 5) { const w = 5 * (1 - z / 35); sp.seg(7 - w, 7 + w, z, 7 + w, 7 - w, z, L); sp.seg(7 - w, 7 - w, z, 7 + w, 7 + w, z, tone(L, -0.2)); }
  sp.vol(1, 10, 7, 5, 0.3, (u, v, z, f, s2, U, V) => ((U + V) % 9 === 0 ? hex('#3a3040') : hex('#140c10')));
  tank(sp, 12, 11, 3, lvl > 1 ? 10 : 7, '#5a5a60');
  return sp;
});
def('geologue', 34, (sp, s) => {
  tent(sp, 5, 5, 4, 11, '#d8c098');
  const L = hex('#5a3a22');
  for (const [a, b] of [[-2, 2], [2, -2], [2, 2]]) sp.seg(12 + a, 11 + b, 0, 12, 11, 12, L);
  sp.seg(12, 11, 12, 12, 11, 2, hex('#8a8a90'));
  crate(sp, 2, 11, 3, 0, '#8a6a4a');
  flag(sp, 14, 3, '#c2643e', 0, 10);
  return sp;
});

// ---- industrie
def('scierie', 50, (sp, s, lvl) => { works(sp, { a: 2, b: 1, col: '#8a5a34', seed: s, glyph: 'hammer', lvl }); logs(sp, 22, 9); return sp; });
def('moulin', 50, (sp, s) => {
  sp.shadow(3, 3, 10, 10);
  sp.cyl(8, 8, 5, 0, 18, { top: () => hex('#5a4038'), side: (k, z, Z) => I.dither(I.ramp('#b0a088', 6, 0.42), 0.72 - k * 0.62 + (Z % 5 === 0 ? -0.15 : 0) + (I.hsh(Math.round(k * 20), Z >> 2, 4) - 0.5) * 0.15, Math.round(k * 40), Z) }, 6);
  I.door(sp, 'L', 5, 5, 6, 6, 2, 3, 5, '#4a2a18');
  // les ailes, en croix devant le chapeau : un longeron et la toile tendue d'un côté
  const X = sp.sx(4, 12), Y = sp.sy(4, 12, 19), B = hex('#e8dcc0'), Bd = hex('#b8a888'), F = hex('#5a3a22'), k = sp.k;
  for (const [dx, dy] of [[1, 1], [-1, -1], [1, -1], [-1, 1]]) for (let r = 1; r <= 13 * k; r++) {
    const x = Math.round(X + (dx * r * 0.75)), y = Math.round(Y + (dy * r * 0.75));
    if (r > 3 * k) for (let w = 1; w <= 3 * k; w++) sp.dot(x + (dx === dy ? -w * dx : 0), y + (dx !== dy ? w * dy : 0), (r + w) % 4 ? B : Bd);
    sp.dot(x, y, F);
  }
  sp.dot2(X - 1, Y - 1, hex('#2a2a2a'));
  sacks(sp, 11, 12, '#e0d0b0');
  return sp;
});
def('distillerie', 48, (sp, s) => { works(sp, { a: 1, b: 1, col: '#6a4428', seed: s, glyph: 'bottle', stack: false }); const C = hex('#c2743e'); sp.cyl(4, 13, 2, 0, 6, { top: () => tone(C, 0.2), side: (k, z, Z) => tone(C, 0.3 - k * 0.55 + (Z % 4 === 0 ? -0.1 : 0)) }, 3); barrel(sp, 12, 13); smokestack(sp, 12, 5, 24, '#5a5a60', 1); return sp; });
def('brasserie', 50, (sp, s, lvl) => { works(sp, { a: 2, b: 1, col: '#9a4a30', brickWall: true, seed: s, lvl }); barrel(sp, 22, 13); barrel(sp, 26, 13); barrel(sp, 24, 9, 0, '#7a4a20'); return sp; });
def('cigares', 50, (sp, s, lvl) => works(sp, { a: 2, b: 1, col: '#a85a3a', brickWall: true, seed: s, glyph: 'hat', lvl }));
def('filature', 56, (sp, s, lvl) => works(sp, { a: 2, b: 2, col: '#9a4a30', brickWall: true, seed: s, pile: '#e8e0d0', lvl }));
def('tannerie', 46, (sp, s) => { works(sp, { a: 1, b: 1, col: '#7a5232', seed: s, stack: false, glyph: 'cow' }); sp.post(3, 15, 6, hex('#5a3a22')); sp.post(10, 15, 6, hex('#5a3a22')); sp.seg(3, 15, 6, 10, 15, 6, hex('#5a3a22')); sp.box(4, 14, 5, 1, 4, walls(I.plain('#c8a070')), 1); return sp; });
def('sellerie', 42, (sp, s) => shop(sp, { mat: I.planks('#8a5a34', s), sign: '#3a2414', glyph: 'hat', glyphCol: '#e8dcc0', awning: '#5a3a22', props: (sp2) => { hitch(sp2, 1, 15, 6); } }));
def('conserverie', 50, (sp, s, lvl) => { works(sp, { a: 2, b: 1, col: '#8a8a90', seed: s, roof: '#5a5a60', lvl }); crates(sp, 20, 8); return sp; });
def('fonderie', 60, (sp, s, lvl) => works(sp, { a: 2, b: 2, col: '#5a4a48', brickWall: true, seed: s, roof: '#3a3a3a', pile: '#2a2220', lvl }));
def('forge', 44, (sp, s) => { works(sp, { a: 1, b: 1, col: '#5a4a48', brickWall: true, seed: s, stack: false, glyph: 'anvil' }); smokestack(sp, 11, 5, 22, '#8a3a28', 1.5); sp.box(4, 13, 3, 2, 2, walls(I.plain('#3a3a3a')), 0); return sp; });
def('briqueterie', 48, (sp, s, lvl) => { works(sp, { a: 2, b: 1, col: '#a85a3a', brickWall: true, seed: s, lvl }); for (const [u, v] of [[20, 9], [25, 9], [22, 12]]) sp.box(u, v, 4, 2, 3, walls(I.brick('#b8603a', '#d8b898'))); return sp; });
def('raffinerie', 56, (sp, s, lvl) => works(sp, { a: 2, b: 2, col: '#7a7a80', seed: s, roof: '#4a4a50', tanks: 3, lvl }));
def('essai', 42, (sp, s) => shop(sp, { mat: I.stone('#a09080', s), sign: '#2a2622', glyph: 'dollar', top: '#7a6a5a', front: 16, props: (sp2) => { crate(sp2, 13, 12, 3, 1, '#7a7a7a'); } }));

// ---- services
def('magasin', 42, (sp, s) => shop(sp, { mat: I.planks(pick(['#a8783c', '#c8a050', '#8a5a34'], s), s), sign: '#2a4a2a', glyph: 'bread', awning: ['#3a6a3a', '#e8dcc0'], props: (sp2) => { crate(sp2, 0, 12, 3, 1); sacks(sp2, 12, 12); } }));
def('marche', 36, (sp, s) => { sp.slab(1, 1, 30, 30, 0, 1, { top: (u, v, U, V) => (((U >> 3) + (V >> 3)) % 2 ? hex('#b0a088') : hex('#a09078')), edge: () => hex('#7a6a5a') }); for (const [u, v, c] of [[3, 3, '#c2643e'], [17, 3, '#e8dcc0'], [3, 17, '#5a8ab0'], [17, 17, '#c8a050']]) stall(sp, u, v, c, s); return sp; });
def('boulangerie', 44, (sp, s) => { shop(sp, { mat: I.planks('#e8dcc0', s), sign: '#7a4a2a', glyph: 'bread', glyphCol: '#f8e0a0', awning: ['#c2643e', '#e8dcc0'], front: 17 }); sp.box(11, 2, 3, 3, 19, walls(I.brick('#9a4a30'))); return sp; });
def('saloon', 48, (sp, s) => shop(sp, { mat: I.planks(pick(['#9a4a30', '#8a5a34', '#a85a3a'], s), s), sign: '#2a2622', glyph: 'bottle', stories: 2, h: 16, front: 22, balcony: true, lit: true, props: (sp2) => { barrel(sp2, 1, 13); hitch(sp2, 6, 16, 7); } }));
def('jeu', 48, (sp, s) => shop(sp, { mat: I.planks('#5a3a5a', s), sign: '#1a3a1a', glyph: 'card', glyphCol: '#f0705a', stories: 2, h: 15, front: 21, awning: '#3a2a3a', lit: true }));
def('bal', 48, (sp, s) => { shop2(sp, { mat: I.planks('#a83a48', s), sign: '#2a2622', glyph: 'note', h: 15, front: 21, awning: ['#a83a48', '#f0d8a0'] }); return sp; });
def('theatre', 56, (sp, s) => { hall(sp, { mat: I.brick('#a85a3a', '#d8c8a8', s), h: 22, wins: 4, rows: 2, top: '#6a5a4a' }); I.sign(sp, 'L', 2, 2, 28, 28, 8, 22, 12, 5, '#7a1a1a', 'note'); sp.slab(8, 30, 16, 2, 9, 1, stripes('#7a1a1a', '#f8d070')); return sp; });
def('opera', 62, (sp, s) => { hall(sp, { mat: I.stone('#d8ccb8', s), h: 24, wins: 5, rows: 2, hipRoof: I.tin('#5a8a7a'), rise: 10, cornice: '#f0e8d8' }); for (let k = 6; k < 28; k += 5) sp.cyl(k + 1, 30.5, 1, 0, 14, tube('#f0e8d8')); return sp; });
def('kiosque', 34, (sp) => {
  sp.shadow(2, 2, 12, 12);
  sp.cyl(8, 8, 6, 0, 2, { top: (u, v, z, U, V) => ((U + V) % 6 === 0 ? hex('#a08060') : hex('#c8a878')), side: (k) => tone(hex('#e8dcc0'), 0.05 - k * 0.4) });
  for (let a = 0; a < 8; a++) { const ang = (a / 8) * 6.2832; sp.post(8 + Math.cos(ang) * 5, 8 + Math.sin(ang) * 5, 8, hex('#e8dcc0'), 2); }
  sp.cyl(8, 8, 7, 10, 0.5, { top: (u, v, z, U, V) => (Math.floor((Math.atan2(V - 14, U - 14) + 3.2) * 2.5) % 2 ? hex('#c2643e') : hex('#e8dcc0')), side: (k) => tone(hex('#c2643e'), -k * 0.4) }, 6);
  return sp;
});
def('eglise', 58, (sp, s) => church(sp, { mat: I.planks('#e8e4d8', s), roof: I.shingles('#5a4038', s) }));
def('mission', 48, (sp, s) => church(sp, { mat: I.adobe('#d8b088', s), roof: null, du: 26, dv: 24, adobeStyle: true }));
def('cimetiere', 28, (sp, s) => {
  sp.vol(1, 1, 30, 30, 0.5, (u, v, z, f, s2, U, V) => (I.hsh(U >> 2, V >> 2, s) < 0.18 ? hex('#7a8c44') : I.hsh(U, V, s) < 0.1 ? hex('#6a5a3a') : hex('#8a7a58')));
  fence(sp, 1, 1, 30, 30, 4, '#3a3a3a', 2);
  for (let k = 0; k < 9; k++) grave(sp, 5 + (k % 3) * 9, 5 + Math.floor(k / 3) * 9, k + s);
  tree(sp, 24, 4, s, 'mort');
  return sp;
});
def('ecole', 46, (sp, s) => { house(sp, { u: 2, v: 2, du: 26, dv: 11, h: 11, rise: 7, mat: I.planks('#a83a28', s), roof: I.shingles('#4a3a36', s), win: 4, porch: true }); sp.box(14, 5, 4, 4, 22, walls(I.planks('#e8dcc0', s))); sp.hip(14, 5, 4, 4, 22, 5, roofOf(I.shingles('#4a3a36'), I.planks('#e8dcc0'))); flag(sp, 4, 18, '#3a5ab0', 0, 14); return sp; });
def('universite', 62, (sp, s) => { hall(sp, { mat: I.brick('#8a3a28', '#d8c8a8', s), h: 22, wins: 5, rows: 2, hipRoof: I.shingles('#3a3a3a', s), rise: 9 }); sp.box(13, 13, 6, 6, 40, walls(I.brick('#8a3a28'))); sp.hip(13, 13, 6, 6, 40, 8, roofOf(I.tin('#5a8a7a'), I.brick('#8a3a28'))); return sp; });
def('docteur', 42, (sp, s) => shop(sp, { mat: I.planks('#e8e4d8', s), sign: '#e8dcc0', glyph: 'cross', glyphCol: '#9a2a1c', front: 16, props: (sp2) => { bench(sp2, 9, 12); } }));
def('pharmacie', 42, (sp, s) => shop(sp, { mat: I.planks('#5a8a7a', s), sign: '#2a2622', glyph: 'plus', glyphCol: '#b8e070', awning: ['#3a6a5a', '#e8dcc0'] }));
def('barbier', 42, (sp, s) => { shop(sp, { mat: I.planks('#c8b890', s), sign: '#2a2622', glyph: 'scissors', glyphCol: '#e8dcc0', front: 15, awning: ['#3a5ab0', '#e8dcc0'] }); barberPole(sp, 1, 14); return sp; });
def('bains', 42, (sp, s) => { shop2(sp, { mat: I.planks('#7aa0b0', s), sign: '#e8dcc0', glyph: 'drop', glyphCol: '#3a6aa0', front: 17 }); barrel(sp, 30, 14, 0, '#6a6a70'); return sp; });
def('hopital', 54, (sp, s) => { hall(sp, { mat: I.planks('#f0ece0', s), h: 20, wins: 5, rows: 2, hipRoof: I.shingles('#4a4a50', s), rise: 7 }); I.sign(sp, 'L', 2, 2, 28, 28, 11, 15, 6, 5, '#f0ece0', 'cross', '#9a2a1c'); flag(sp, 28, 4, '#e8dcc0', 27, 10); return sp; });

// ---- ordre
def('sherif', 42, (sp, s) => shop(sp, { mat: I.planks('#8a6a4a', s), sign: '#2a2622', glyph: 'star', top: '#5a4a3a', awning: '#4a3a2a', props: (sp2) => { poster(sp2, 'L', 2, 1, 12, 10, 10, 9); hitch(sp2, 1, 16, 5); } }));
def('prison', 42, (sp, s) => {
  hall(sp, { u: 2, v: 2, du: 28, dv: 12, h: 13, mat: I.stone('#8a7a6a', s), wins: 0, rows: 1, top: '#6a5a4a', cornice: '#9a8a78' });
  for (let k = 4; k < 26; k += 5) I.paint(sp, 'L', 2, 2, 28, 12, k, 5, 3, 4, (i, j, W) => (i % 2 === 1 ? hex('#4a4a50') : hex('#140c0c')));
  fence(sp, 1, 16, 30, 14, 5, '#5a5a60', 2);
  return sp;
});
def('tribunal', 62, (sp, s) => { hall(sp, { mat: I.stone('#d0c4b0', s), h: 20, wins: 4, rows: 2, top: '#8a7a6a', cornice: '#f0e8d8' }); sp.box(12, 12, 8, 8, 36, walls(I.stone('#d0c4b0'))); sp.hip(12, 12, 8, 8, 36, 8, roofOf(I.tin('#5a8a7a'), I.stone('#d0c4b0'))); for (let k = 8; k < 26; k += 4) sp.cyl(k + 1, 30.5, 1, 0, 16, tube('#f0e8d8')); return sp; });
def('fort', 46, (sp, s) => { palisade(sp, s); return sp; });
def('pinkerton', 42, (sp, s) => shop(sp, { mat: I.brick('#5a4a48', '#a89888', s), sign: '#1a1a1a', glyph: 'key', glyphCol: '#e8dcc0', top: '#4a4a4a', front: 17 }));
def('pompiers', 52, (sp, s) => { shop(sp, { mat: I.planks('#a8281c', s), sign: '#e8dcc0', glyph: 'bolt', glyphCol: '#a8281c', front: 18 }); sp.box(3, 2, 4, 4, 26, walls(I.planks('#a8281c', s))); sp.hip(3, 2, 4, 4, 26, 5, roofOf(I.shingles('#3a3a3a'), I.planks('#a8281c'))); sp.cyl(5, 4, 1, 23, 1.5, tube('#c89a40')); return sp; });

// ---- commerce, transport, tourisme
def('diligence', 42, (sp, s) => { shop2(sp, { mat: I.planks('#8a5a34', s), sign: '#7a1a1a', glyph: 'wheel', glyphCol: '#f8d070', awning: '#5a3a22' }); stagecoach(sp, 18, 2); return sp; });
def('entrepot', 42, (sp, s) => { house(sp, { u: 2, v: 2, du: 28, dv: 11, h: 13, rise: 6, mat: I.battens('#7a6a5a', s), roof: I.tin('#7a7a80'), win: 0 }); for (const t of [6, 18]) I.paint(sp, 'L', 2, 2, 28, 11, t, 0, 6, 9, (i, j, W, H) => (i < 1 || i >= W - 1 || j < 1 ? hex('#5a4a3a') : Math.abs(i - j * W / H) < 1.2 || Math.abs(i - (H - j) * W / H) < 1.2 ? hex('#6a5a48') : hex('#3a2a1a'))); crates(sp, 4, 16); barrel(sp, 26, 18); return sp; });
def('gare', 52, (sp, s) => { sp.slab(1, 2, 46, 13, 0, 2, deck('#8a6a4a')); house(sp, { u: 8, v: 3, du: 22, dv: 9, h: 12, rise: 7, mat: I.planks('#c8a050', s), roof: I.shingles('#5a3a3a', s), win: 3 }); I.sign(sp, 'L', 8, 3, 22, 9, 6, 12, 10, 3, '#2a2622', 'wheel'); sp.slab(4, 12, 34, 4, 9, 1, { top: I.flatTop('#5a3a3a'), edge: () => hex('#3a2414') }); for (let k = 5; k < 38; k += 8) sp.post(k, 15, 9, hex('#5a3a22')); waterTowerMini(sp, 40, 4); crates(sp, 32, 12); return sp; });
def('quai', 32, (sp, s) => { sp.slab(1, 1, 30, 14, 0, 2, deck('#8a6a4a')); for (let k = 2; k < 30; k += 6) sp.post(k, 15, 4, hex('#4a2e1a')); crates(sp, 4, 3); barrel(sp, 13, 6); house(sp, { u: 16, v: 2, du: 12, dv: 9, h: 9, rise: 5, mat: I.planks('#8a8a90', s), roof: I.tin('#6a6a70'), win: 1 }); return sp; });
def('telegraphe', 48, (sp, s) => { shop(sp, { mat: I.planks('#c8b890', s), sign: '#2a2622', glyph: 'bolt' }); const L = hex('#4a2e1a'); sp.post(14, 2, 28, L); sp.seg(12, 4, 26, 16, 0, 26, L); for (const d of [-2, 0, 2]) sp.dot2(sp.sx(14 + d * 0.7, 2 - d * 0.7), sp.sy(14 + d * 0.7, 2 - d * 0.7, 27), hex('#5ab0c8')); return sp; });
def('banque', 50, (sp, s) => { hall(sp, { u: 2, v: 2, du: 28, dv: 12, h: 18, mat: I.stone('#d8ccb8', s), wins: 4, rows: 2, top: '#8a7a6a', cornice: '#f0e8d8' }); I.sign(sp, 'L', 2, 2, 28, 12, 9, 13, 10, 5, '#1a3a1a', 'dollar', '#f8d070'); for (let k = 5; k < 28; k += 6) sp.cyl(k + 1, 14.5, 1, 0, 12, tube('#f0e8d8')); return sp; });
def('hotel', 52, (sp, s) => { shop2(sp, { mat: I.planks(pick(PAINT, s), s), sign: '#2a2622', glyph: 'bed', h: 18, front: 24, balcony: true, lit: true }); return sp; });
def('grand_hotel', 62, (sp, s) => { hall(sp, { mat: I.brick('#a85a3a', '#e8dcc0', s), h: 28, wins: 5, rows: 3, hipRoof: I.shingles('#3a3a4a', s), rise: 8, cornice: '#f0e8d8', lit: true }); sp.slab(6, 30, 20, 2, 10, 1, stripes('#3a5a3a', '#e8dcc0')); flag(sp, 4, 4, '#c2643e', 38, 10); return sp; });
def('wildwest', 36, (sp, s) => { fence(sp, 1, 1, 30, 30, 4, '#c8a050', 3); sp.vol(1, 1, 30, 30, 0.5, (u, v, z, f, s2, U, V) => (I.hsh(U >> 1, V >> 1, 5) < 0.1 ? hex('#a08050') : hex('#c8a070'))); sp.vol(20, 4, 10, 24, (u) => 2 + u * 0.7, (u, v, z, f, s2, U, V) => (f === 0 ? ((V >> 1) % 3 ? hex('#c2643e') : hex('#e8dcc0')) : hex(f === 1 ? '#8a5a34' : '#5a3a22'))); flag(sp, 4, 4, '#c2643e'); flag(sp, 4, 26, '#3a5ab0'); cow(sp, 10, 14, '#3a2a1a', '#3a2a1a'); return sp; });
def('source', 30, (sp, s) => {
  sp.cyl(8, 8, 7, 0, 2, { top: (u, v, z, U, V) => ((U - 14) ** 2 + (V - 14) ** 2 < 100 ? ((U + V) % 7 === 0 ? hex('#b8e0e8') : hex('#7ab8c8')) : I.hsh(U >> 1, V >> 1, 3) < 0.3 ? hex('#9a8a78') : hex('#b0a088')), side: (k) => tone(hex('#9a8a78'), 0.1 - k * 0.4) });
  for (const [dx, dy] of [[-2, -6], [1, -9], [-1, -12], [2, -14]]) sp.dot2(sp.sx(8, 8) + dx * 2, sp.sy(8, 8, 2) + dy * 2, hex('#f0f0f0'));
  sp.box(1, 12, 6, 3, 4, walls(I.planks('#c8a070')));
  return sp;
});
def('safari', 36, (sp, s) => { tent(sp, 6, 6, 5, 12, '#c8b890'); flag(sp, 13, 13, '#5a8a3a'); sp.box(11, 2, 4, 2, 5, walls(I.plain('#e8e0d0')), 0); for (const d of [-1.5, 1.5]) sp.seg(13 + d, 3, 6, 13 + d * 1.6, 3, 8, hex('#e8e0d0')); return sp; });
def('tramway', 32, (sp, s) => {
  sp.seg(0, 6, 0, 16, 6, 0, hex('#8a8a98')); sp.seg(0, 10, 0, 16, 10, 0, hex('#8a8a98'));
  sp.box(2, 4, 9, 6, 7, { left: (t, z, l, T, Z) => (Z > 5 && Z < 12 && T % 6 > 1 ? hex('#e8dcc0') : hex('#3a7a5a')), right: () => hex('#2a5a4a'), top: () => hex('#5a5a5a') }, 1);
  sp.post(12, 13, 9, hex('#3a3a3a')); sp.post(15, 13, 9, hex('#3a3a3a'));
  sp.slab(11, 11, 5, 4, 9, 1, { top: I.flatTop('#5a8a7a'), edge: () => hex('#2a4a3a') });
  return sp;
});

// ---- État et décor
def('mairie', 62, (sp, s) => { hall(sp, { mat: I.brick('#9a4a30', '#e8dcc0', s), h: 20, wins: 4, rows: 2, top: '#6a5a4a', cornice: '#f0e8d8' }); sp.cyl(16, 16, 5, 22, 8, tube('#e8dcc0')); sp.cyl(16, 16, 5, 30, 0.5, tube('#5a8a7a'), 6); flag(sp, 16, 16, '#c2643e', 37); for (let k = 9; k < 24; k += 5) sp.cyl(k + 1, 30.5, 1, 0, 12, tube('#f0e8d8')); return sp; });
def('foncier', 42, (sp, s) => shop(sp, { mat: I.planks('#b8a070', s), sign: '#2a2622', glyph: 'book', awning: '#5a4a3a', props: (sp2) => { poster(sp2, 'L', 2, 1, 12, 10, 10, 9); } }));
def('journal', 42, (sp, s) => shop(sp, { mat: I.planks('#e8dcc0', s), sign: '#1a1a1a', glyph: 'book', glyphCol: '#e8dcc0', awning: ['#2a2a2a', '#e8dcc0'], props: (sp2) => { crate(sp2, 13, 12, 3, 1, '#e8e0d0'); } }));
def('statue', 36, (sp) => { sp.shadow(3, 3, 10, 10); sp.box(4, 4, 8, 8, 6, walls(I.stone('#b0a088'), '#c8b8a0')); sp.box(6, 6, 4, 3, 7, walls(I.plain('#6a8a7a'), '#7a9a8a'), 6); sp.cyl(8, 7.5, 1.5, 13, 3, tube('#6a8a7a')); sp.cyl(8, 7.5, 2.2, 16, 0.5, tube('#4a6a5a')); sp.seg(9.5, 7, 13, 12, 6, 17, hex('#6a8a7a')); return sp; });
def('parc', 36, (sp, s) => { sp.box(0, 0, 16, 16, 1, { left: () => hex('#4a7a3a'), right: () => hex('#3a6a2a'), top: (u, v, U, V) => I.dither(I.ramp('#5a8a3a', 5, 0.3), 0.55 + (I.hsh(U >> 1, V >> 1, s) - 0.5) * 0.6, U, V) }); sp.vol(0, 7, 16, 2, 1.5, (u, v, z, f, s2, U, V) => (I.hsh(U, V, 2) < 0.2 ? hex('#b0a080') : hex('#c8b088'))); for (const [u, v] of [[2, 11], [5, 13], [12, 3], [3, 4]]) for (let k = 0; k < 3; k++) sp.dot2(sp.sx(u + k, v), sp.sy(u + k, v, 1.5), hex(['#f0705a', '#f8d070', '#e8dcc0'][k])); tree(sp, 1, 1, s); tree(sp, 9, 10, s + 3); bench(sp, 9, 3); return sp; });
def('fontaine', 34, (sp) => { sp.shadow(1, 1, 14, 14); sp.cyl(8, 8, 7, 0, 3, { top: (u, v, z, U, V) => ((U - 14) ** 2 + (V - 14) ** 2 < 110 ? ((U * 3 + V) % 11 === 0 ? hex('#a8d0f0') : hex('#5a9ad8')) : hex('#b0a088')), side: (k, z, Z) => tone(hex('#b0a088'), 0.1 - k * 0.4 + (Z % 3 === 0 ? -0.06 : 0)) }); sp.cyl(8, 8, 1.5, 3, 6, tube('#b0a088')); sp.cyl(8, 8, 3, 9, 1, tube('#c8b8a0')); const X = sp.sx(8, 8), Y = sp.sy(8, 8, 12); for (const [dx, dy] of [[0, 0], [-2, 2], [2, 2], [-3, 5], [3, 5], [-4, 8], [4, 8]]) sp.dot2(X + dx * 2, Y + dy * 2, hex('#a8d0f0')); return sp; });
def('place', 32, (sp, s) => { sp.box(1, 1, 30, 30, 1, { left: () => hex('#9a8a78'), right: () => hex('#7a6a5a'), top: (u, v, U, V) => (U % 8 === 0 || V % 8 === 0 ? hex('#a89880') : ((U >> 3) + (V >> 3)) % 2 ? hex('#c8b8a0') : hex('#b8a890')) }); for (const [u, v] of [[3, 3], [25, 25], [3, 25], [25, 3]]) tree(sp, u, v, s + u); sp.cyl(16, 16, 4, 1, 4, tube('#b0a088')); flag(sp, 16, 16, '#c2643e', 5, 14); bench(sp, 8, 12); bench(sp, 18, 22); return sp; });

// ------------------------------------------------------------ modèles secondaires
// boutique de deux cases de large (bal, bains, hôtel, dépôt de diligence)
function shop2(sp, o) {
  const { mat, sign, glyph, glyphCol = '#f8d070', awning = null, front = 18, h = 12, balcony = false, lit = false } = o;
  const u = 2, v = 1, du = 28, dv = 10;
  sp.shadow(u, v, du, dv + 4);
  sp.box(u, v, du, dv, h, walls(mat));
  sp.gable(u, v, du, dv - 1, h, 6, roofOf(I.shingles('#5a4a42'), mat), 'u', 1);
  const ff = (uu) => front + (uu >= 10 && uu < du - 10 ? 3 : 0) - (uu < 2 || uu >= du - 2 ? 3 : 0);
  sp.vol(u, v + dv - 1, du, 2, ff, (uu, vv, z, f, s, U, V, Z) => (f === 0 ? hex('#4a2e1a') : z > ff(uu) - 1.5 ? tone(mat(uu, z, du, f, U, Z), -0.3) : mat(uu, z, du, f, U, Z)));
  const V = v + 1;
  for (const t of [3, 20]) I.window(sp, 'L', u, V, du, dv, t, 2, 4, 4, '#e0c890', lit ? '#f8d070' : '#3a3a4a', lit);
  I.door(sp, 'L', u, V, du, dv, 12, 4, 6, '#3a2414');
  if (h > 13) for (const t of [3, 10, 17, 23]) I.window(sp, 'L', u, V, du, dv, t, h - 4, 2, 3, '#e0c890', '#2a2a3a', lit);
  I.sign(sp, 'L', u, V, du, dv, 6, front - 6, du - 12, 4, sign, glyph, glyphCol);
  sp.slab(0, 11, 32, 5, 0, 1, deck());
  if (balcony) { sp.slab(u, 11, du, 3, 9, 1, deck('#6a4a30')); railing(sp, u, 14, du, 'u', 10); }
  if (awning) {
    for (const t of [0, 9, 18, 27]) sp.post(u + t, 14, 7, hex('#5a3a22'));
    sp.slab(u - 1, 11, du + 2, 4, 7, 1, typeof awning === 'string' ? { top: I.flatTop(awning), edge: () => tone(hex(awning), -0.4) } : stripes(awning[0], awning[1]));
  }
  return sp;
}
function barnLite(sp, u, v, s) { house(sp, { u, v, du: 10, dv: 10, h: 7, rise: 6, mat: I.battens('#a83a28', s), roof: I.tin('#6a6a70'), door: false, win: 0, axis: 'v', shadow: false }); }
function stall(sp, u, v, col, s) { sp.box(u, v, 10, 8, 4, walls(I.planks('#8a6a4a', s))); sacks(sp, u + 2, v + 2, s % 2 ? '#c2643e' : '#7a9a38'); sp.post(u, v + 8, 8, hex('#5a3a22')); sp.post(u + 10, v + 8, 8, hex('#5a3a22')); sp.slab(u - 1, v - 1, 12, 10, 8, 1, stripes(col, '#e8dcc0')); }
function grave(sp, u, v, s) {
  sp.vol(u - 1, v + 1, 4, 5, (a, b) => 0.8 - Math.abs(b - 2.5) * 0.15, (a, b, z, f, s2, U, V) => (I.hsh(U, V, s) < 0.2 ? hex('#5a4a2a') : hex('#6a5a3a')));
  if (s % 3) sp.box(u, v, 2, 1, 5, walls(I.stone('#a09888')));
  else { const C = hex('#e8e0d0'); sp.seg(u + 1, v, 0, u + 1, v, 6, C); sp.seg(u, v + 1, 4.5, u + 2, v - 1, 4.5, C); }
}
function barberPole(sp, u, v) { const X = sp.sx(u, v), Y = sp.sy(u, v, 0); for (let y = 0; y < 9 * sp.k; y++) for (let x = 0; x < 3; x++) sp.dot(X + x, Y - y, hex([['#c2281c', '#f0ece0', '#3a5ab0'][Math.floor((y + x * 2) / 3) % 3]][0])); }
function sheep(sp, u, v) { sp.post(u + 1, v + 2, 1, hex('#3a3a3a')); sp.post(u + 3, v + 2, 1, hex('#3a3a3a')); sp.vol(u, v, 4, 2, (a) => 3 + Math.sin(a * 3) * 0.2, (uu, vv, z, f, s, U, V) => tone(hex('#f0ece0'), (f === 0 ? 0 : f === 1 ? -0.1 : -0.3) + (I.hsh(U, V, 4) < 0.3 ? -0.08 : 0)), 1); sp.box(u + 4, v, 1, 1, 3, walls(I.plain('#3a3a3a')), 2); }
function pig(sp, u, v) { sp.vol(u, v, 4, 2, 2.5, (uu, vv, z, f) => tone(hex('#e8a8a0'), f === 0 ? 0.05 : f === 1 ? -0.1 : -0.35), 0.5); }
function waterTowerMini(sp, u, v) { const L = hex('#4a2e1a'); for (const [a, b] of [[0, 0], [5, 0], [0, 5], [5, 5]]) sp.post(u + a, v + b, 10, L); sp.cyl(u + 3, v + 3, 4, 10, 7, { top: () => hex('#6a4a2a'), side: (k, z, Z) => tone(hex('#8a5a34'), 0.15 - k * 0.48 - (Z % 6 === 0 ? 0.14 : 0)) }, 3); }
function stagecoach(sp, u, v) {
  sp.box(u, v, 9, 5, 6, { left: (t, z, l, T, Z) => (Z > 5 && T > 5 && T < 12 ? hex('#3a2a2a') : (Z === 1 ? hex('#c89a40') : hex('#8a2a1c'))), right: () => hex('#5a1a14'), top: () => hex('#3a2414') }, 3);
  crate(sp, u + 2, v + 1, 3, 9, '#8a6a44');
  for (const t of [1, 7]) sp.cyl(u + t, v + 5, 1.6, 0, 0.5, { top: (a, b, z, U, V) => (Math.abs(U - 3) < 1 || Math.abs(V - 3) < 1 || (U - 3) ** 2 + (V - 3) ** 2 > 7 ? hex('#c89a40') : 0), side: () => hex('#8a6a20') });
}
function palisade(sp, s) {
  const mat = I.planks('#7a5232', s, 99);
  const logW = (u, v, du, dv) => sp.vol(u, v, du, dv, (uu, vv) => 12 + (Math.floor(uu + vv) % 2 === 0 ? 1.5 : 0), (uu, vv, z, f, s2, U, V, Z) => (f === 0 ? hex('#a8783c') : I.dither(I.ramp('#7a5232', 5, 0.38), 0.5 + (f === 1 ? 0.05 : -0.3) + (((f === 1 ? U : V) % 4) < 1 ? -0.3 : 0) + (I.hsh((f === 1 ? U : V) >> 2, 0, s) - 0.5) * 0.2, f === 1 ? U : V, Z)));
  sp.shadow(1, 1, 30, 30);
  logW(2, 2, 28, 2); logW(2, 2, 2, 28);
  house(sp, { u: 9, v: 7, du: 14, dv: 10, h: 8, rise: 5, mat: I.planks('#8a6a4a', s), roof: I.shingles('#4a3a36', s), win: 2, shadow: false });
  flag(sp, 6, 6, '#3a5ab0', 0, 22);
  sp.box(1, 1, 6, 6, 16, walls(mat)); sp.hip(1, 1, 6, 6, 16, 4, roofOf(I.shingles('#4a3a36'), mat));
  logW(28, 2, 2, 28); logW(2, 28, 28, 2);
  I.paint(sp, 'L', 2, 28, 28, 2, 12, 0, 7, 9, (i, j, W) => (i === Math.floor(W / 2) ? hex('#3a2414') : j % 6 === 0 ? hex('#4a2e1a') : hex('#5a3a22')));
  sp.box(25, 25, 6, 6, 16, walls(mat)); sp.hip(25, 25, 6, 6, 16, 4, roofOf(I.shingles('#4a3a36'), mat));
}

// ------------------------------------------------------------ végétation (pixels fins) : feuillus, pins, cyprès, arbres
// fruitiers et morts, cactus saguaro, buissons, touffes
export function tree(sp, u, v, s = 0, kind = 'feuillu') {
  if (kind === 'mort') {
    const L = hex('#5a4a3a');
    sp.seg(u + 2, v + 2, 0, u + 2, v + 2, 12, L);
    sp.seg(u + 2, v + 2, 7, u, v + 4, 11, L); sp.seg(u + 2, v + 2, 9, u + 4, v, 13, L); sp.seg(u + 1, v + 3, 9.5, u + 0.5, v + 3.5, 12, L);
    return sp;
  }
  const trunk = (h) => sp.cyl(u + 2.5, v + 2.5, 0.8, 0, h, { top: () => hex('#4a2e1a'), side: (k, z, Z) => tone(hex('#6a4428'), 0.1 - k * 0.45 + (Z % 3 === 0 ? -0.08 : 0)) });
  if (kind === 'pin' || kind === 'cypres') {
    // pin : trois étages de branches ; cyprès des marais : haut et étroit, vert-gris
    const base = kind === 'pin' ? '#2a5a3a' : '#4a6a48', R2 = I.ramp(base, 6, 0.48);
    trunk(4);
    const tiers = kind === 'pin' ? [[3.5, 3, 5], [2.8, 6, 5], [1.9, 9, 5]] : [[2.4, 3, 6], [2, 7, 6], [1.4, 11, 5]];
    for (const [r, z0, h] of tiers) sp.cyl(u + 2.5, v + 2.5, r, z0, 0.6, { top: (a, b, z, U, V) => { const n = I.hsh(U >> 1, V >> 1, s + z0); return I.dither(R2, 0.6 + (n - 0.5) * 0.5 - (U - V) * 0.03 - (n < 0.15 ? 0.3 : 0), U, V); }, side: (k) => R2[Math.max(0, 3 - Math.round(k * 3))] }, h);
    return sp;
  }
  const base = kind === 'fruitier' ? '#5a8a3a' : kind === 'buisson' ? '#5a7a3a' : '#4a7a3a';
  const R2 = I.ramp(base, 7, 0.5);
  if (kind !== 'buisson') trunk(4);
  const rad = kind === 'buisson' ? 2.6 : 3.4, z0 = kind === 'buisson' ? 0 : 3, top = kind === 'buisson' ? 4 : 9.5;
  // la ramure : des grappes de feuilles (bruit au pixel fin), éclairées en haut à gauche
  sp.vol(u + 2.5 - rad - 0.5, v + 2.5 - rad - 0.5, 2 * rad + 1, 2 * rad + 1, (uu, vv) => {
    const du = uu - rad - 0.5, dv = vv - rad - 0.5, d2 = du * du + dv * dv;
    if (d2 > rad * rad) return -1e9;
    return z0 + (top - z0) * Math.sqrt(1 - d2 / (rad * rad + 0.5)) + I.hsh(Math.floor(uu * 2), Math.floor(vv * 2), s) * 1.2;
  }, (uu, vv, z, f, s2, U, V) => {
    if (kind === 'fruitier' && f === 0 && I.hsh(U, V, s + 9) < 0.07) return hex('#e0844a');
    const leaf = I.hsh(U >> 1, V >> 1, s + 1);
    const l = f === 0 ? 0.62 - (U - V) * 0.012 + (leaf - 0.5) * 0.45 : f === 1 ? 0.42 + (leaf - 0.5) * 0.3 : 0.18 + (leaf - 0.5) * 0.2;
    return I.dither(R2, l, U, V);
  }, z0);
  return sp;
}
function saguaro(sp, s) {
  const C = I.ramp('#5a8a3a', 6, 0.42);
  const rib = { top: () => C[4], side: (k, z, Z, U) => C[Math.max(0, Math.min(5, 4 - Math.round(k * 4) + ((U ?? 0) % 3 === 0 ? -1 : 0)))] };
  sp.cyl(8, 8, 1.4, 0, 12, rib, 1);
  const a = s % 2 ? 1 : -1;
  sp.seg(8 + 1.2 * a, 8 - 1.2 * a, 4.5, 8 + 2.6 * a, 8 - 2.6 * a, 5, C[2]);
  sp.cyl(8 + 3 * a, 8 - 3 * a, 0.9, 5, 5, rib, 0.6);
  if (s % 3) { sp.seg(8 - 1.2 * a, 8 + 1.2 * a, 6.5, 8 - 2.4 * a, 8 + 2.4 * a, 7, C[2]); sp.cyl(8 - 2.6 * a, 8 + 2.6 * a, 0.8, 7, 3.5, rib, 0.5); }
}
export function treeSprite(kind, s) {
  return I.isoSprite(`arbre:${kind}:${s % 4}`, () => {
    const sp = new Sprite(1, 1, 24, 2);
    if (kind === 'cactus') saguaro(sp, s);
    else if (kind === 'buisson') { tree(sp, 3 + (s % 3) * 2, 3 + ((s >> 2) % 3) * 2, s, 'buisson'); if (s % 2) tree(sp, 8, 6, s + 5, 'buisson'); }
    else tree(sp, 4 + (s % 3) * 2, 4 + ((s >> 2) % 3) * 2, s, kind);
    return sp.done();
  });
}

// ------------------------------------------------------------ chantier
function site(sp, a, b, k) {
  sp.slab(2, 2, a * 16 - 4, b * 16 - 4, 0, 2, deck('#a8783c'));
  const h = 4 + Math.round(10 * k), L = hex('#7a5232');
  for (let u = 3; u < a * 16 - 2; u += 6) for (let v = 3; v < b * 16 - 2; v += 6) if (u === 3 || v === 3 || u + 6 >= a * 16 - 2 || v + 6 >= b * 16 - 2) sp.post(u, v, h, L, 2);
  if (k > 0.5) { sp.seg(3, 3, h + 2, a * 16 - 3, 3, h + 2, L); sp.seg(3, 3, h + 2, 3, b * 16 - 3, h + 2, L); }
  logs(sp, a * 16 - 9, b * 16 - 7);
  return sp;
}

// ------------------------------------------------------------ accès
// Sprite d'un bâtiment : canvas en pixels fins (c.k par pixel du jeu ; ox, oy : coin gauche de la boîte du losange au
// sol). rot : quart de tour (0 : façade à gauche, 1 et 2 : de côté et de dos, 3 : façade à droite). lvl : niveau 1 ou 2.
export function buildingSprite(t, seed = 0, rot = 0, lvl = 1) {
  const d = BUILDINGS[t], r = R[t];
  const variant = Math.abs(seed) % 4;
  return I.isoSprite(`b:${t}:${variant}:${rot}:${lvl}`, () => {
    const sp = new Sprite(d.w, d.d, r ? r.H + (lvl > 1 ? 6 : 0) : 40, 2, I.K, rot);
    if (r) r.draw(sp, variant + 1, lvl); else hall(sp, { du: d.w * 16 - 4, dv: d.d * 16 - 4, h: 12, mat: I.planks('#8a6a4a'), wins: 2, rows: 1 });
    if (lvl > 1) vane(sp, d.w * 8, d.d * 8);
    return sp.done();
  });
}
// girouette dorée posée sur le plus haut pixel au-dessus du centre (bâtiment amélioré)
function vane(sp, u, v) {
  const X = Math.round(sp.sx(u, v)), k = sp.k;
  let y = 0;
  while (y < sp.px.h && !sp.px.get(X, y)) y++;
  const G = hex('#f8d070'), D = hex('#a8783c');
  for (let i = 1; i <= 4 * k; i++) sp.px.set(X, y - i, D);
  for (let i = -2 * k; i <= 2 * k; i++) sp.px.set(X + i, y - 4 * k, G);
  sp.px.set(X + 2 * k, y - 4 * k - 1, G); sp.px.set(X + 2 * k - 1, y - 4 * k - 2, G);
}
export function siteSprite(t, k, rot = 0) {
  const d = BUILDINGS[t];
  const step = Math.min(3, Math.floor(k * 4));
  return I.isoSprite(`site:${d.w}:${d.d}:${step}:${rot}`, () => {
    const sp = new Sprite(d.w, d.d, 24, 2, I.K, rot);
    site(sp, d.w, d.d, step / 3);
    return sp.done();
  });
}
export const ART_IDS = Object.keys(R);
