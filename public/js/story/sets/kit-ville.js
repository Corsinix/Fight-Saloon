// Outils des décors de ville (rue, saloon, gares de Red Rock et de Dusty Gulch) : bardages vieillis, brique, pierre,
// corniches sur consoles, fenêtres à guillotine, portes à imposte, vitrines à carreaux, auvents et balcons à balustres,
// trottoir de planches, enseignes peintes, chevaux attachés, chariot, abreuvoir, tonneaux…
// Tout est dessiné une fois dans les canvas du décor (back/far/props) : rien ici n'est appelé à chaque image, sauf les
// petites fonctions d'animation (queue de cheval, poteau de barbier).
// Échelle (d'après les photos de Tombstone, Bodie, Virginia City) : un acteur fait ~70 px du chapeau aux bottes ;
// rez-de-chaussée 60 px, porte 50 px + imposte, étage 54 px, tonneau 22 px.
import * as S from '../../sprites.js';
import { canvasText } from '../../scene.js';
import { textW } from '../../uikit.js';
import { OUT, R, rnd, hash } from './kit.js';

export { OUT, R, rnd, hash };
const sh = S.shade;

// Ombre posée sur ce qui est déjà dessiné (auvent, corniche, avant-toit)
export function shadow(g, x, y, w, h, a = 0.36) {
  g.fillStyle = `rgba(28,14,8,${a})`;
  g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}
// Rectangle cerné d'un contour sombre
export function box(g, x, y, w, h, col) { R(g, x - 1, y - 1, w + 2, h + 2, OUT); R(g, x, y, w, h, col); }

// ---------------------------------------------------------------- matières
// Planches à clin : chaque planche a son ton, une arête éclairée, l'ombre du recouvrement, des aboutements, des nœuds.
// paint : couleur de la peinture (le bois col apparaît là où elle s'écaille, peel 0..1)
export function siding(g, x, y, w, h, col, seed = 1, { lap = 5, paint = null, peel = 0, stain = 0 } = {}) {
  const r = rnd(seed * 17 + 3);
  const face = paint || col;
  for (let yy = 0; yy < h; yy += lap) {
    const hh = Math.min(lap, h - yy);
    const c = sh(face, (r() - 0.5) * 0.14);
    R(g, x, y + yy, w, hh, c);
    R(g, x, y + yy, w, 1, sh(c, 0.12));
    if (hh > 2) R(g, x, y + yy + hh - 1, w, 1, sh(c, -0.32));
    for (let xx = x + Math.floor(r() * 36); xx < x + w - 2; xx += 26 + Math.floor(r() * 44)) R(g, xx, y + yy + 1, 1, Math.max(1, hh - 2), sh(c, -0.25));
    for (let i = 0; i < w / 14; i++) R(g, x + Math.floor(r() * (w - 6)), y + yy + 1 + Math.floor(r() * Math.max(1, hh - 2)), 2 + Math.floor(r() * 5), 1, sh(c, r() < 0.55 ? -0.09 : 0.07));
    if (r() < 0.35) R(g, x + Math.floor(r() * (w - 3)), y + yy + 2, 2, 1, sh(c, -0.35)); // un nœud
  }
  if (paint && peel) { // la peinture écaillée : du bois nu par plaques, surtout vers le bas
    for (let i = 0; i < (w * h * peel) / 46; i++) {
      const pw = 2 + Math.floor(r() * 6), px = x + Math.floor(r() * (w - pw)), py = y + Math.floor(Math.sqrt(r()) * (h - 3));
      R(g, px, py, pw, 2, sh(col, (r() - 0.5) * 0.12)); R(g, px, py + 2, pw, 1, sh(col, -0.3));
    }
  }
  if (stain) for (let i = 0; i < w / 10; i++) { // coulures de pluie, plus sombres
    const px = x + Math.floor(r() * w), len = 6 + Math.floor(r() * h * 0.5);
    shadow(g, px, y + Math.floor(r() * 6), 1, Math.min(len, h - 6), 0.12 * stain);
  }
}
// Planches verticales et couvre-joints (gares, granges)
export function battens(g, x, y, w, h, col, seed = 1, bw = 7) {
  const r = rnd(seed * 13 + 1);
  for (let xx = x; xx < x + w; xx += bw) {
    const c = sh(col, (r() - 0.5) * 0.12), ww = Math.min(bw, x + w - xx);
    R(g, xx, y, ww, h, c);
    for (let i = 0; i < h / 9; i++) R(g, xx + 1 + Math.floor(r() * Math.max(1, ww - 3)), y + Math.floor(r() * h), 1, 3 + Math.floor(r() * 6), sh(c, r() < 0.6 ? -0.1 : 0.06));
  }
  for (let xx = x + bw - 1; xx < x + w - 2; xx += bw) { R(g, xx, y, 2, h, sh(col, 0.16)); R(g, xx + 2, y, 1, h, sh(col, -0.34)); }
}
// Brique : rangs de 3 px (2 de brique, 1 de joint), briques décalées, quelques-unes plus sombres
export function brick(g, x, y, w, h, col = '#9a4a30', mortar = '#b89878', seed = 1) {
  const r = rnd(seed * 7 + 5);
  R(g, x, y, w, h, mortar);
  for (let yy = 0, row = 0; yy < h; yy += 3, row++) {
    for (let xx = -(row % 2) * 3; xx < w; xx += 6) {
      const x0 = Math.max(0, xx), x1 = Math.min(w, xx + 5);
      if (x1 <= x0) continue;
      const c = sh(col, (r() - 0.5) * 0.18 + (r() < 0.07 ? -0.18 : 0));
      R(g, x + x0, y + yy, x1 - x0, Math.min(2, h - yy), c);
      if (r() < 0.25) R(g, x + x0, y + yy, 1, 1, sh(c, 0.15));
    }
  }
}
// Pierre de taille : assises de 7 px, blocs de 10 à 18 px, arête claire en haut, ombre en bas
export function stone(g, x, y, w, h, col = '#b0a088', seed = 1, course = 7) {
  const r = rnd(seed * 11 + 9);
  R(g, x, y, w, h, sh(col, -0.35));
  for (let yy = 0; yy < h; yy += course) {
    const hh = Math.min(course - 1, h - yy);
    for (let xx = -Math.floor(r() * 10); xx < w; ) {
      const bw = 10 + Math.floor(r() * 9), x0 = Math.max(0, xx), x1 = Math.min(w, xx + bw - 1);
      if (x1 > x0) {
        const c = sh(col, (r() - 0.5) * 0.16);
        R(g, x + x0, y + yy, x1 - x0, hh, c);
        R(g, x + x0, y + yy, x1 - x0, 1, sh(c, 0.18));
        if (hh > 2) R(g, x + x0, y + yy + hh - 1, x1 - x0, 1, sh(c, -0.18));
        if (r() < 0.3) R(g, x + x0 + 2 + Math.floor(r() * Math.max(1, x1 - x0 - 4)), y + yy + 2, 1, 1, sh(c, -0.25));
      }
      xx += bw;
    }
  }
}
// Crépi (adobe) : enduit taché, fissures, briques crues qui apparaissent
export function plaster(g, x, y, w, h, col = '#c8a87e', seed = 1) {
  const r = rnd(seed * 5 + 2);
  R(g, x, y, w, h, col);
  for (let i = 0; i < (w * h) / 22; i++) R(g, x + Math.floor(r() * w), y + Math.floor(r() * h), 1 + Math.floor(r() * 3), 1, sh(col, (r() - 0.5) * 0.14));
  for (let i = 0; i < w / 30; i++) { // l'enduit tombé : les briques crues dessous
    const px = x + Math.floor(r() * (w - 12)), py = y + Math.floor(r() * (h - 8));
    R(g, px - 1, py - 1, 12, 7, sh(col, -0.12));
    for (let k = 0; k < 2; k++) for (let j = 0; j < 2; j++) R(g, px + j * 5 + (k ? 2 : 0), py + k * 3, 4, 2, sh(col, -0.28));
  }
  for (let i = 0; i < w / 40; i++) { // fissures
    let px = x + Math.floor(r() * w), py = y + Math.floor(r() * h * 0.6);
    for (let k = 0; k < 6; k++) { R(g, px, py, 1, 2, sh(col, -0.35)); px += r() < 0.5 ? -1 : 1; py += 2; }
  }
}

// ---------------------------------------------------------------- éléments de façade
// Corniche saillante sur consoles (le haut d'une fausse façade) : y = dessus du chapeau ; renvoie sa hauteur
export function cornice(g, x, y, w, col, { brackets = 12, over = 3 } = {}) {
  const dk = sh(col, -0.35), lt = sh(col, 0.22);
  shadow(g, x, y + 9, w, 3, 0.4); // l'ombre portée sur le mur
  R(g, x - over - 1, y - 1, w + over * 2 + 2, 5, OUT);
  R(g, x - over, y, w + over * 2, 3, col); R(g, x - over, y, w + over * 2, 1, lt);
  R(g, x - over + 1, y + 3, w + over * 2 - 2, 2, OUT); R(g, x - over + 2, y + 3, w + over * 2 - 4, 1, dk);
  R(g, x, y + 5, w, 4, sh(col, -0.12)); R(g, x, y + 8, w, 1, OUT); // la frise
  if (brackets) {
    const n = Math.max(2, Math.round(w / brackets));
    for (let k = 0; k <= n; k++) {
      const bx = Math.round(x + 1 + (k * (w - 4)) / n);
      R(g, bx - 1, y + 3, 4, 8, OUT); R(g, bx, y + 4, 2, 6, col); R(g, bx, y + 4, 1, 6, lt); R(g, bx, y + 9, 2, 1, dk);
    }
  }
  return 10;
}
// Fenêtre à guillotine : chambranle, deux châssis à carreaux, appui ; rideaux / store facultatifs.
// Renvoie le rectangle vitré [x, y, w, h] (pour les fenêtres éclairées la nuit)
export function sash(g, x, y, w, h, o = {}) {
  const fr = o.frame || '#ddd0b0', gl = o.glass || '#26303c';
  if (o.shutters) for (const sx of [x - 7, x + w + 1]) { // volets à lames
    box(g, sx, y - 1, 6, h + 2, o.shutters);
    for (let yy = y + 1; yy < y + h; yy += 3) R(g, sx, yy, 6, 1, sh(o.shutters, -0.3));
    R(g, sx, y - 1, 1, h + 2, sh(o.shutters, 0.2));
  }
  if (o.cap !== false) { // le linteau mouluré
    R(g, x - 3, y - 5, w + 6, 4, OUT); R(g, x - 2, y - 4, w + 4, 2, fr); R(g, x - 2, y - 4, w + 4, 1, sh(fr, 0.25));
    shadow(g, x - 1, y - 1, w + 2, 1, 0.3);
  }
  R(g, x - 1, y - 1, w + 2, h + 2, OUT);
  R(g, x, y, w, h, fr);
  const ix = x + 1, iy = y + 1, iw = w - 2, ih = h - 2;
  R(g, ix, iy, iw, ih, gl);
  for (let k = 0; k < ih && k < iw + ih; k++) { // reflets en biais
    const a = ix + iw - 1 - Math.floor(k * 0.6), b = a - 3;
    if (a >= ix && a < ix + iw && (k % 9) < 5) R(g, a, iy + k, 1, 1, sh(gl, 0.18));
    if (b >= ix && b < ix + iw && (k % 13) < 3) R(g, b, iy + k, 1, 1, sh(gl, 0.28));
  }
  if (o.blind) { R(g, ix, iy, iw, Math.round(ih * 0.3), o.blind); R(g, ix, iy + Math.round(ih * 0.3), iw, 1, sh(o.blind, -0.3)); }
  if (o.curtain) { // rideaux noués
    const c = o.curtain, cl = sh(c, 0.2), cd = sh(c, -0.3);
    for (let k = 0; k < ih * 0.75; k++) {
      const wv = Math.max(1, Math.round(3 - Math.abs(k - ih * 0.4) / (ih * 0.2)) + (k < 3 ? 1 : 0));
      R(g, ix, iy + k, wv, 1, c); R(g, ix + iw - wv, iy + k, wv, 1, c);
    }
    R(g, ix, iy, iw, 2, c); R(g, ix, iy, iw, 1, cl); R(g, ix, iy + 2, iw, 1, cd);
  }
  const mid = iy + Math.floor(ih / 2);
  R(g, ix, mid - 1, iw, 2, fr); R(g, ix, mid + 1, iw, 1, sh(fr, -0.35)); // la traverse des deux châssis
  const panes = o.panes || (iw > 9 ? 2 : 1);
  for (let k = 1; k < panes; k++) R(g, ix + Math.round((k * iw) / panes), iy, 1, ih, fr);
  if (o.rows) for (const yy of [iy + Math.floor(ih / 4), mid + Math.floor(ih / 4)]) R(g, ix, yy, iw, 1, fr);
  if (o.sill !== false) { R(g, x - 3, y + h, w + 6, 3, OUT); R(g, x - 2, y + h + 1, w + 4, 1, sh(fr, 0.15)); shadow(g, x - 2, y + h + 3, w + 4, 2, 0.3); }
  if (o.bars) for (let xx = ix + 1; xx < ix + iw; xx += 3) R(g, xx, iy, 1, ih, o.bars);
  return [ix, iy, iw, ih];
}
// Porte à panneaux ou vitrée, avec chambranle et imposte : (x, base) = coin bas gauche du cadre ; renvoie les vitres
export function door(g, x, base, w, h, o = {}) {
  const col = o.col || '#5a3420', fr = o.frame || '#ddd0b0', tr = o.transom ?? 7;
  const top = base - h - tr;
  const lights = [];
  R(g, x - 3, top - 4, w + 6, h + tr + 4, OUT);
  R(g, x - 2, top - 3, w + 4, h + tr + 3, fr); R(g, x - 2, top - 3, w + 4, 1, sh(fr, 0.25)); R(g, x - 2, top - 3, 1, h + tr + 3, sh(fr, 0.15));
  if (tr) { // l'imposte vitrée
    R(g, x, top, w, tr - 1, '#26303c');
    for (let k = 1; k < 4; k++) R(g, x + Math.round((k * w) / 4), top, 1, tr - 1, fr);
    lights.push([x, top, w, tr - 1]);
  }
  const dy = base - h;
  R(g, x, dy, w, h, OUT);
  const leaves = o.double ? 2 : 1, lw = (w - (leaves - 1)) / leaves;
  for (let i = 0; i < leaves; i++) {
    const lx = Math.round(x + i * (lw + 1)), lww = Math.round(lw);
    R(g, lx, dy, lww, h, col); R(g, lx, dy, 1, h, sh(col, 0.18));
    if (o.glass) { // vitrée en haut, panneaux en bas
      const gh = Math.round(h * 0.5);
      R(g, lx + 2, dy + 3, lww - 4, gh, OUT); R(g, lx + 3, dy + 4, lww - 6, gh - 2, '#26303c');
      if (o.blind) R(g, lx + 3, dy + 4, lww - 6, Math.round(gh * 0.35), o.blind);
      R(g, lx + 3 + Math.floor((lww - 6) / 2), dy + 4, 1, gh - 2, col);
      lights.push([lx + 3, dy + 4, lww - 6, gh - 2]);
      R(g, lx + 3, dy + gh + 7, lww - 6, h - gh - 11, sh(col, -0.2)); R(g, lx + 3, dy + gh + 7, lww - 6, 1, sh(col, -0.4));
    } else {
      const ph = Math.floor((h - 9) / 2);
      for (const py of [dy + 3, dy + 6 + ph]) { R(g, lx + 3, py, lww - 6, ph, sh(col, -0.18)); R(g, lx + 3, py, lww - 6, 1, sh(col, -0.4)); R(g, lx + 3, py + ph - 1, lww - 6, 1, sh(col, 0.15)); }
    }
  }
  R(g, o.double ? x + Math.round(w / 2) - 3 : x + w - 4, dy + Math.round(h * 0.55), 2, 2, '#e0b040'); // la poignée
  if (o.double) R(g, x + Math.round(w / 2) + 2, dy + Math.round(h * 0.55), 2, 2, '#e0b040');
  return lights;
}
// Vitrine de boutique à petits carreaux sur soubassement à panneaux : (x, base) ; renvoie la vitre
export function shopWindow(g, x, base, w, h, o = {}) {
  const fr = o.frame || '#ddd0b0', col = o.col || '#5a3420';
  const top = base - h;
  R(g, x - 1, top - 1, w + 2, h + 1, OUT);
  R(g, x, top, w, h, fr);
  const kick = 9;
  R(g, x + 1, base - kick, w - 2, kick - 1, col); R(g, x + 1, base - kick, w - 2, 1, sh(col, 0.2)); // le soubassement
  for (let px = x + 3; px < x + w - 6; px += 12) { R(g, px, base - kick + 2, Math.min(9, x + w - 3 - px), kick - 5, sh(col, -0.2)); R(g, px, base - kick + 2, Math.min(9, x + w - 3 - px), 1, sh(col, -0.4)); }
  const gx = x + 2, gy = top + 2, gw = w - 4, gh = h - kick - 3;
  R(g, gx, gy, gw, gh, '#26303c');
  for (let k = 0; k < gh; k++) if ((k % 11) < 6) { const a = gx + gw - 2 - Math.floor(k * 0.7); if (a > gx) R(g, a, gy + k, 1, 1, '#3c4a58'); }
  if (o.goods) o.goods(g, gx, gy, gw, gh); // l'étalage
  if (o.blind) { R(g, gx, gy, gw, 5, o.blind); for (let px = gx; px < gx + gw; px += 2) R(g, px, gy + 5, 1, 1, o.blind); }
  const cols = o.cols || Math.max(2, Math.round(gw / 9)), rows = o.rows || 3;
  for (let k = 1; k < cols; k++) R(g, gx + Math.round((k * gw) / cols), gy, 1, gh, fr);
  for (let k = 1; k < rows; k++) R(g, gx, gy + Math.round((k * gh) / rows), gw, 1, fr);
  R(g, gx, gy + gh, gw, 1, sh(fr, -0.3));
  return [gx, gy, gw, gh];
}
// Auvent sur poteaux devant la façade (de x0 à x1) : bord du toit en y, poteaux jusqu'au bord du trottoir (deck),
// ombre portée sur la façade et le trottoir ; posts : abscisses des poteaux
export function porch(g, x0, x1, y, deck, posts, o = {}) {
  const col = o.col || '#7a5232', post = o.post || sh(col, 0.12);
  shadow(g, x0, y + 5, x1 - x0, deck - y - 5, 0.16); // tout le dessous de l'auvent
  shadow(g, x0, y + 5, x1 - x0, 7, 0.26);              // et plus fort juste dessous
  R(g, x0 - 1, y - 1, x1 - x0 + 2, 7, OUT);
  R(g, x0, y, x1 - x0, 5, col); R(g, x0, y, x1 - x0, 1, sh(col, 0.25)); R(g, x0, y + 4, x1 - x0, 1, sh(col, -0.35));
  for (let px = x0 + 3; px < x1 - 2; px += 9) R(g, px, y + 1, 1, 3, sh(col, -0.18)); // les bouts de chevrons
  for (const px of posts) {
    R(g, px - 1, y + 5, 5, deck - y - 5, OUT);
    R(g, px, y + 5, 3, deck - y - 5, post); R(g, px, y + 5, 1, deck - y - 5, sh(post, 0.2)); R(g, px + 2, y + 5, 1, deck - y - 5, sh(post, -0.3));
    for (const s of [-1, 1]) for (let k = 0; k < 6; k++) R(g, px + 1 + s * (2 + k), y + 5 + k, 1, 2, k === 5 ? OUT : sh(post, -0.1)); // jambes de force
    shadow(g, px + 3, deck - 2, 7, 2, 0.35); // l'ombre du poteau sur le trottoir
  }
}
// Balcon à balustres posé sur l'auvent (plancher en y)
export function balcony(g, x0, x1, y, o = {}) {
  const col = o.col || '#d8c8a0', dk = sh(col, -0.35);
  R(g, x0 - 1, y - 14, x1 - x0 + 2, 4, OUT); R(g, x0, y - 13, x1 - x0, 2, col); R(g, x0, y - 13, x1 - x0, 1, sh(col, 0.25)); // main courante
  R(g, x0, y - 3, x1 - x0, 2, OUT); R(g, x0, y - 3, x1 - x0, 1, dk); // lisse basse
  for (let px = x0 + 1; px < x1 - 1; px += 3) { R(g, px, y - 11, 2, 8, OUT); R(g, px, y - 11, 1, 8, col); }
  for (const px of [x0, x1 - 3]) { R(g, px - 1, y - 17, 5, 17, OUT); R(g, px, y - 16, 3, 16, col); R(g, px, y - 16, 1, 16, sh(col, 0.25)); }
}
// Trottoir de planches (deck) de x0 à x1 : planches perpendiculaires à la rue, bord avant, ombre sur la rue
export function boardwalk(g, x0, x1, base, seed = 1, depth = 7) {
  const r = rnd(seed * 3 + 1);
  for (let x = x0; x < x1; ) {
    const bw = 3 + Math.floor(r() * 3), c = r() < 0.12 ? '#8a6a48' : r() < 0.5 ? '#7a5434' : '#70492c';
    R(g, x, base, Math.min(bw, x1 - x), depth, c);
    R(g, x, base, 1, depth, sh(c, -0.3));
    if (r() < 0.3) R(g, x + 1, base + 1 + Math.floor(r() * (depth - 2)), 1, 1, '#3a2414'); // un clou
    if (r() < 0.08) R(g, x + 1, base + 2, Math.min(bw, x1 - x) - 1, 2, '#4a2e1c'); // une planche fendue
    x += bw;
  }
  R(g, x0, base - 1, x1 - x0, 1, OUT);
  R(g, x0, base + depth - 1, x1 - x0, 1, '#a8784c'); // le nez de la planche
  R(g, x0, base + depth, x1 - x0, 4, '#4e321e'); R(g, x0, base + depth, x1 - x0, 1, '#6a4428'); // la planche de rive
  for (let x = x0 + 5; x < x1; x += 22) R(g, x, base + depth + 1, 3, 3, '#3a2414'); // les solives
  R(g, x0, base + depth + 4, x1 - x0, 1, OUT);
  shadow(g, x0, base + depth + 5, x1 - x0, 2, 0.32);
}
// Marches pour descendre du trottoir dans la rue
export function steps(g, x, base, w, depth = 7) {
  for (let k = 0; k < 2; k++) {
    const sy = base + depth + 1 + k * 3, sx = x - k * 2, sw = w + k * 4;
    R(g, sx - 1, sy - 1, sw + 2, 5, OUT); R(g, sx, sy, sw, 3, '#7a5434'); R(g, sx, sy, sw, 1, '#a8784c');
  }
}

// ---------------------------------------------------------------- enseignes
// Enseigne de planches peinte, à double filet : centre cx, haut y ; renvoie sa largeur
export function signboard(g, cx, y, text, { bg = '#2a2622', fg = '#f8d070', frame = '#c8a050', pad = 6, h = 13, w = 0 } = {}) {
  const ww = w || textW(text) + pad * 2 + 2;
  const x = Math.round(cx - ww / 2);
  R(g, x - 1, y - 1, ww + 2, h + 2, OUT);
  R(g, x, y, ww, h, bg);
  R(g, x + 1, y + 1, ww - 2, 1, frame); R(g, x + 1, y + h - 2, ww - 2, 1, frame); R(g, x + 1, y + 1, 1, h - 2, frame); R(g, x + ww - 2, y + 1, 1, h - 2, frame);
  R(g, x, y + h, ww, 1, sh(bg, -0.4));
  canvasText(g, text, cx, y + Math.round((h - 9) / 2) + 1, { color: fg, shadow: sh(bg, -0.5) });
  return ww;
}
// Lettres peintes à même les planches (délavées : alpha)
export function ghostText(g, text, cx, y, col, a = 0.55, size = 8) {
  g.globalAlpha = a;
  canvasText(g, text, cx, y, { size, color: col, shadow: '' });
  g.globalAlpha = 1;
}
// Enseigne pendue sous l'auvent par deux chaînettes
export function hangSign(g, cx, y, text, o = {}) {
  const ww = textW(text) + 10;
  for (const dx of [-ww / 2 + 3, ww / 2 - 4]) R(g, Math.round(cx + dx), y - 4, 1, 4, '#3a3a40');
  return signboard(g, cx, y, text, { h: 11, pad: 4, ...o });
}

// ---------------------------------------------------------------- objets de la rue
export function barrel(g, x, base, col = '#8a5228', h = 22) {
  const w = Math.round(h * 0.72);
  R(g, x, base - h - 1, w, h + 2, OUT); R(g, x - 1, base - h + 1, w + 2, h - 2, OUT);
  R(g, x, base - h, w, h, col); R(g, x + 1, base - h, w - 2, 1, sh(col, 0.25));
  for (let k = 0; k < w; k += 3) R(g, x + k, base - h + 1, 1, h - 1, sh(col, -0.15)); // les douelles
  R(g, x + 1, base - h + 1, 2, h - 2, sh(col, 0.2)); R(g, x + w - 2, base - h + 1, 2, h - 2, sh(col, -0.3));
  for (const yy of [base - h + 3, base - 4]) { R(g, x - 1, yy, w + 2, 2, '#3a3a42'); R(g, x, yy, w, 1, '#6a6a72'); }
  shadow(g, x + w, base - 2, 5, 2, 0.3);
}
export function crate(g, x, base, s = 18, col = '#a8783c', label = '') {
  R(g, x - 1, base - s - 1, s + 2, s + 2, OUT);
  R(g, x, base - s, s, s, col);
  R(g, x, base - s, s, 2, sh(col, -0.25)); R(g, x, base - 2, s, 2, sh(col, -0.25)); R(g, x, base - s, 2, s, sh(col, -0.25)); R(g, x + s - 2, base - s, 2, s, sh(col, -0.25));
  R(g, x, base - s, s, 1, sh(col, 0.25));
  for (let k = 2; k < s - 2; k++) R(g, x + k, base - s + k, 1, 1, sh(col, -0.35)); // l'écharpe
  for (let k = 5; k < s - 2; k += 4) R(g, x + 2, base - s + k, s - 4, 1, sh(col, -0.1));
  if (label) { R(g, x + 3, base - s + 5, s - 6, 7, '#eadcb0'); canvasText(g, label, x + s / 2, base - s + 5, { color: '#7a1a14', shadow: '' }); }
  shadow(g, x + s + 1, base - 2, 5, 2, 0.3);
}
export function sack(g, x, base, col = '#c8b088') {
  R(g, x - 1, base - 13, 14, 14, OUT); R(g, x + 2, base - 16, 8, 4, OUT);
  R(g, x, base - 12, 12, 12, col); R(g, x + 3, base - 15, 6, 4, col); R(g, x + 3, base - 13, 6, 1, sh(col, -0.35));
  R(g, x + 1, base - 11, 2, 9, sh(col, 0.2)); R(g, x + 9, base - 11, 2, 10, sh(col, -0.2));
}
// Barre d'attache en rondins
export function hitchRail(g, x, base, w) {
  for (const px of [x, x + w - 4]) { R(g, px - 1, base - 23, 6, 24, OUT); R(g, px, base - 22, 4, 22, '#6a4428'); R(g, px, base - 22, 1, 22, '#8a6038'); }
  R(g, x - 3, base - 22, w + 6, 5, OUT); R(g, x - 2, base - 21, w + 4, 3, '#8a6038'); R(g, x - 2, base - 21, w + 4, 1, '#b08050');
  for (let k = 6; k < w - 6; k += 9) R(g, x + k, base - 20, 3, 1, '#6a4428');
  shadow(g, x + 4, base - 1, w, 2, 0.3);
}
// Abreuvoir de planches, plein d'eau
export function trough(g, x, base, w = 34) {
  R(g, x - 1, base - 13, w + 2, 14, OUT);
  R(g, x, base - 12, w, 12, '#6a4428'); R(g, x, base - 12, w, 1, '#9a6a3c');
  for (let k = 0; k < 3; k++) R(g, x, base - 9 + k * 4, w, 1, '#4e321e');
  R(g, x + 2, base - 12, w - 4, 2, '#4a7090'); R(g, x + 4, base - 12, 6, 1, '#8ab0c8');
  for (const px of [x - 2, x + w - 2]) { R(g, px - 1, base - 15, 5, 16, OUT); R(g, px, base - 14, 3, 14, '#5a3a22'); }
  shadow(g, x + 4, base, w, 2, 0.3);
}
// Cheval attaché, vu de profil (dir 1 : tête à droite) : (x, base) = l'arrière-train au sol, ~64 × 50 px.
// Silhouette faite de formes simples (ellipses, polygones) dans un masque, contour et modelé automatiques
// (arête claire en haut, ventre sombre), mis en cache par robe. La queue est à part (horseTail), elle bat dans anim().
const horseCache = new Map();
function horseSprite(coat, blanket, saddle) {
  const key = `${coat}|${blanket}|${saddle}`;
  let c = horseCache.get(key);
  if (c) return c;
  const W2 = 70, H2 = 54, ox = 2, oy = 5;
  const M = new Uint8Array(W2 * H2);
  const set = (x, y, v) => { x = Math.round(x) + ox; y = Math.round(y) + oy; if (x >= 0 && y >= 0 && x < W2 && y < H2) M[y * W2 + x] = v; };
  const get = (x, y) => (x < 0 || y < 0 || x >= W2 || y >= H2 ? 0 : M[y * W2 + x]);
  const ell = (cx, cy, rx, ry, v) => { for (let y = -ry; y <= ry; y++) for (let x = -rx; x <= rx; x++) if ((x * x) / (rx * rx) + (y * y) / (ry * ry) <= 1) set(cx + x, cy + y, v); };
  const poly = (pts, v) => {
    const ys = pts.map((p) => p[1]);
    for (let y = Math.min(...ys); y <= Math.max(...ys); y++) {
      const xs = [];
      for (let i = 0; i < pts.length; i++) {
        const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % pts.length];
        if ((ay <= y + 0.5 && by > y + 0.5) || (by <= y + 0.5 && ay > y + 0.5)) xs.push(ax + ((y + 0.5 - ay) * (bx - ax)) / (by - ay));
      }
      xs.sort((a, b) => a - b);
      for (let i = 0; i + 1 < xs.length; i += 2) for (let x = Math.round(xs[i]); x < Math.round(xs[i + 1]); x++) set(x, y, v);
    }
  };
  const rect = (x, y, w, h, v) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) set(x + i, y + j, v); };
  // 2 : pattes du côté caché ; 1 : robe ; 3 : crinière ; 4 : sabots ; 5 : œil ; 6 : couverture ; 7 : selle ; 8 : étrier
  poly([[14, 28], [19, 28], [18, 44], [15, 44]], 2); rect(14, 44, 5, 2, 4);
  rect(45, 28, 3, 16, 2); rect(44, 44, 5, 2, 4);
  ell(13, 22, 9, 9, 1); ell(27, 23, 17, 8, 1); ell(41, 23, 7, 8, 1);
  poly([[5, 23], [19, 26], [14, 37], [9, 37]], 1); rect(10, 36, 3, 8, 1); rect(9, 44, 5, 2, 4);
  poly([[37, 25], [46, 25], [43, 34], [40, 34]], 1); rect(40, 34, 3, 10, 1); rect(39, 44, 5, 2, 4);
  poly([[33, 17], [47, 3], [53, 12], [46, 29]], 1);
  poly([[46, 4], [51, 0], [55, 2], [62, 12], [61, 16], [57, 17], [52, 13]], 1);
  rect(49, -3, 2, 4, 1); rect(52, -2, 2, 3, 1); // les oreilles
  for (let t = 0; t <= 1; t += 0.02) { const mx = 34 + t * 14, my = 15 - t * 13; for (let k = 0; k < 3; k++) if (get(Math.round(mx + k * 0.7) + ox, Math.round(my + k) + oy) === 1) set(mx + k * 0.7, my + k, 3); }
  rect(50, 1, 2, 4, 3); // le toupet
  if (blanket) rect(21, 14, 13, 12, 6);
  if (saddle) { rect(22, 12, 11, 4, 7); rect(30, 9, 2, 3, 7); rect(27, 16, 1, 12, 7); rect(25, 28, 5, 2, 8); }
  set(54, 6, 5); set(61, 14, 5); set(59, 16, 5);
  c = S.makeCanvas(W2, H2);
  const g = c.getContext('2d');
  const lt = sh(coat, 0.2), dk = sh(coat, -0.3), far = sh(coat, -0.42), mane = sh(coat, -0.62);
  for (let y = 0; y < H2; y++) for (let x = 0; x < W2; x++) {
    const v = M[y * W2 + x];
    if (!v) { if (get(x - 1, y) || get(x + 1, y) || get(x, y - 1) || get(x, y + 1)) R(g, x, y, 1, 1, OUT); continue; }
    const up = get(x, y - 1), dn = get(x, y + 1);
    let col = coat;
    if (v === 1) col = !up ? lt : !dn || dn === 2 || dn === 4 ? dk : coat;
    else if (v === 2) col = far;
    else if (v === 3) col = up === 3 || !up ? mane : sh(mane, 0.25);
    else if (v === 4) col = '#2a1e18';
    else if (v === 5) col = OUT;
    else if (v === 6) col = up !== 6 ? sh(blanket, 0.3) : (y % 4 === 0 ? sh(blanket, -0.2) : blanket);
    else if (v === 7) col = up !== 7 ? sh(saddle, 0.3) : saddle;
    else if (v === 8) col = '#8a8f98';
    R(g, x, y, 1, 1, col);
  }
  horseCache.set(key, c);
  return c;
}
export function horse(g, x, base, dir, coat = '#7a4a2a', { blanket = '#9a2a1c', saddle = '#4a2a18' } = {}) {
  const c = horseSprite(coat, blanket, saddle);
  if (dir > 0) g.drawImage(c, x - 2, base - 51);
  else { g.save(); g.translate(x + 2, 0); g.scale(-1, 1); g.drawImage(c, 0, base - 51); g.restore(); }
  shadow(g, dir > 0 ? x + 4 : x - 60, base, 56, 2, 0.3);
}
// La queue du cheval (animée) : t en ms
export function horseTail(g, x, base, dir, coat, t, seed = 0) {
  const mane = sh(coat, -0.6);
  const sw = Math.sin(t / 380 + seed) > 0.85 ? Math.round(Math.sin(t / 60 + seed) * 2) : 0; // un coup de queue de temps en temps
  for (let k = 0; k < 22; k++) {
    const dx = 2 - Math.round((k * k) / 140) - (k > 8 ? Math.round((sw * (k - 8)) / 10) : 0);
    const px = dir > 0 ? x + dx : x - dx - 3;
    R(g, px - 1, base - 34 + k, 5, 1, OUT);
    R(g, px, base - 34 + k, 3, 1, k % 5 === 0 ? sh(mane, 0.3) : mane);
  }
}
// Chariot (buckboard) garé, timon au sol : (x, base) = le bas de la roue arrière à gauche
export function wagon(g, x, base, col = '#7a5232') {
  const wheel = (cx, cy, r) => {
    const ring = (rr, col) => { for (let a = 0; a < 64; a++) { const an = (a / 64) * Math.PI * 2; R(g, Math.round(cx + Math.cos(an) * rr), Math.round(cy + Math.sin(an) * rr), 1, 1, col); } };
    for (let a = 0; a < 12; a++) { // rayons, cernés
      const an = (a / 12) * Math.PI * 2;
      for (let k = 2; k < r - 1; k++) R(g, Math.round(cx + Math.cos(an) * k) - 1, Math.round(cy + Math.sin(an) * k) - 1, 3, 3, OUT);
    }
    for (let a = 0; a < 12; a++) {
      const an = (a / 12) * Math.PI * 2;
      for (let k = 2; k < r - 1; k++) R(g, Math.round(cx + Math.cos(an) * k), Math.round(cy + Math.sin(an) * k), 1, 1, '#a87a48');
    }
    ring(r + 1, OUT); ring(r - 2, OUT); ring(r, '#4a4a52'); ring(r - 1, '#8a6038'); // le bandage de fer, la jante
    S.disc(g, cx, cy, 3, OUT); S.disc(g, cx, cy, 2, '#3a3a42'); R(g, cx, cy, 1, 1, '#8a8f98');
  };
  // timon posé au sol, vers l'avant
  for (let k = 0; k < 34; k++) R(g, x + 58 + k, base - 14 + Math.round(k * 0.38), 2, 2, k % 6 ? '#6a4428' : OUT);
  // la caisse
  R(g, x - 3, base - 31, 66, 12, OUT); R(g, x - 2, base - 30, 64, 10, col); R(g, x - 2, base - 30, 64, 1, sh(col, 0.25));
  for (let px = x + 6; px < x + 60; px += 12) R(g, px, base - 29, 1, 8, sh(col, -0.3));
  R(g, x - 2, base - 22, 64, 1, sh(col, -0.35));
  // le siège et son dossier, le marchepied
  R(g, x + 40, base - 41, 14, 11, OUT); R(g, x + 41, base - 40, 12, 9, sh(col, -0.1)); R(g, x + 41, base - 40, 12, 1, sh(col, 0.2));
  R(g, x + 39, base - 36, 3, 6, OUT);
  // la bâche roulée et des sacs dans la caisse
  R(g, x + 2, base - 36, 30, 6, OUT); R(g, x + 3, base - 35, 28, 5, '#d8c8a0'); R(g, x + 3, base - 35, 28, 1, '#f0e4c4');
  for (let px = x + 8; px < x + 30; px += 8) R(g, px, base - 35, 1, 5, '#a89878');
  wheel(x + 10, base - 11, 11); wheel(x + 50, base - 9, 9);
  shadow(g, x - 2, base, 70, 2, 0.32);
}
// Poteau de barbier (la spirale tourne : t en ms ; t = 0 au dessin du fond)
export function barberPole(g, x, y, h, t = 0) {
  R(g, x - 1, y - 1, 7, h + 2, OUT);
  R(g, x, y, 5, h, '#f0e8d8');
  const off = Math.floor(t / 120) % 6;
  for (let k = 0; k < h; k++) for (let i = 0; i < 5; i++) {
    const p = (k + i + off) % 6;
    if (p < 2) R(g, x + i, y + k, 1, 1, '#c0302a'); else if (p === 3) R(g, x + i, y + k, 1, 1, '#2a4a8a');
  }
  R(g, x, y, 1, h, 'rgba(255,255,255,0.35)');
}
// Lanterne murale (potence et verre)
export function wallLamp(g, x, y) {
  R(g, x - 4, y - 1, 6, 1, OUT); R(g, x - 4, y - 1, 1, 4, OUT); // la potence
  R(g, x - 2, y, 5, 2, OUT); R(g, x - 3, y + 2, 7, 7, OUT);
  R(g, x - 2, y + 3, 5, 5, '#f8d070'); R(g, x - 1, y + 4, 3, 3, '#fff4c0');
  R(g, x - 2, y + 9, 5, 1, OUT);
}
// Affiche clouée (avis de recherche, horaire)
export function poster(g, x, y, w = 11, h = 14, col = '#e0cc98', wanted = true) {
  R(g, x - 1, y - 1, w + 2, h + 2, OUT); R(g, x, y, w, h, col);
  R(g, x + w - 2, y, 2, 2, sh(col, -0.2)); // un coin corné
  if (wanted) {
    R(g, x + 2, y + 2, w - 4, 1, '#5a2a14');
    R(g, x + 3, y + 4, w - 6, Math.round(h * 0.38), '#8a6a4a'); R(g, x + 4, y + 5, w - 8, 2, '#5a3a2a');
    R(g, x + 2, y + h - 4, w - 4, 1, '#7a1a14'); R(g, x + 3, y + h - 2, w - 6, 1, '#8a7a5a');
  } else for (let k = 2; k < h - 1; k += 2) R(g, x + 2, y + k, w - 4 - (k % 4 ? 2 : 0), 1, '#8a7a5a');
  R(g, x + Math.floor(w / 2), y + 1, 1, 1, '#3a3a40');
}
// Poteau du télégraphe (traverses et isolateurs) ; renvoie les points d'accroche des fils
export function telePole(g, x, base, h, col = '#5a3a22') {
  R(g, x - 1, base - h - 1, 5, h + 1, OUT); R(g, x, base - h, 3, h, col); R(g, x, base - h, 1, h, sh(col, 0.2));
  const ys = [base - h + 4, base - h + 10];
  for (const yy of ys) {
    R(g, x - 9, yy - 1, 21, 4, OUT); R(g, x - 8, yy, 19, 2, col);
    for (const ix of [x - 7, x - 2, x + 4, x + 9]) { R(g, ix, yy - 2, 1, 2, '#8ab0a0'); }
  }
  return ys.flatMap((yy) => [[x - 7, yy - 2], [x + 9, yy - 2]]);
}
// Fil qui pend entre deux points (chaînette approchée)
export function wire(g, x0, y0, x1, y1, sag = 6, col = '#2a1a12') {
  const n = Math.abs(x1 - x0);
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    R(g, Math.round(x0 + (x1 - x0) * t), Math.round(y0 + (y1 - y0) * t + sag * 4 * t * (1 - t)), 1, 1, col);
  }
}
// Touffe d'herbe sèche
export function tuft(g, x, base, col = '#9a8a4a') {
  for (const [dx, h] of [[0, 3], [1, 5], [2, 4], [3, 6], [4, 3], [5, 4]]) R(g, x + dx, base - h, 1, h, dx % 2 ? col : sh(col, -0.25));
}

// ---------------------------------------------------------------- gares
// Toit de bardeaux à croupes (vu du long pan) : de x0 à x1 au bas (y1), rentré de inset px par côté en haut (y0)
export function shingleRoof(g, x0, x1, y0, y1, col = '#4a3a36', inset = 18, seed = 1) {
  const r = rnd(seed * 19 + 4);
  const h = y1 - y0;
  for (let yy = 0; yy <= h; yy++) {
    const k = Math.round((inset * (h - yy)) / h);
    R(g, x0 + k - 1, y0 + yy, x1 - x0 - k * 2 + 2, 1, OUT);
  }
  for (let yy = 1; yy < h; yy++) {
    const k = Math.round((inset * (h - yy)) / h), row = Math.floor(yy / 3);
    const c = yy % 3 === 2 ? sh(col, -0.3) : sh(col, (row % 2 ? 0.04 : -0.02) + (yy % 3 === 0 ? 0.1 : 0));
    R(g, x0 + k, y0 + yy, x1 - x0 - k * 2, 1, c);
    if (yy % 3 === 1) for (let xx = x0 + k + (row % 2) * 3; xx < x1 - k; xx += 6) R(g, xx, y0 + yy, 1, 2, sh(col, -0.25));
  }
  for (let i = 0; i < ((x1 - x0) * h) / 60; i++) {
    const yy = 1 + Math.floor(r() * (h - 2)), k = Math.round((inset * (h - yy)) / h);
    R(g, x0 + k + Math.floor(r() * (x1 - x0 - 2 * k - 4)), y0 + yy, 3, 1, sh(col, r() < 0.5 ? 0.14 : -0.2));
  }
  R(g, x0 + inset, y0, x1 - x0 - inset * 2, 1, sh(col, 0.3)); // le faîtage
}
// La gare : murs en planches et couvre-joints sur un soubassement à clin, grand avant-toit sur consoles (il abrite
// le quai), avancée vitrée du télégraphe sous une lucarne à pignon qui porte le nom, portes, fenêtres, porte de fret.
// o : { x0, x1, base, eave, roofTop, col, trim, roof, name, bay: [x, w], door, windows: [x…], freight, chimney,
//       over: [gauche, droite] (avant-toit qui dépasse), posts: [x…] (poteaux sous l'avant-toit qui dépasse), seed }
// Renvoie les vitres (fenêtres éclairées la nuit)
export function depot(g, o) {
  const { x0, x1, base, eave, roofTop, col, trim, roof = '#4a3a36', seed = 1 } = o;
  const [ovL, ovR] = o.over || [10, 10];
  const wins = [];
  // le toit, la cheminée
  shingleRoof(g, x0 - ovL, x1 + ovR, roofTop, eave, roof, Math.round((eave - roofTop) * 0.8), seed);
  if (o.chimney) {
    const cx = o.chimney, ch = eave - roofTop - 14;
    R(g, cx - 1, roofTop - 11, 10, ch + 2, OUT);
    brick(g, cx, roofTop - 10, 8, ch, '#8a4030', '#a88a70', seed);
    R(g, cx - 2, roofTop - 13, 12, 3, OUT); R(g, cx - 1, roofTop - 12, 10, 1, '#6a6a6a');
  }
  // les murs : planches et couvre-joints, lisse, soubassement à clin, planches d'angle
  R(g, x0 - 1, eave, x1 - x0 + 2, base - eave, OUT);
  battens(g, x0, eave, x1 - x0, base - eave - 24, col, seed);
  siding(g, x0, base - 22, x1 - x0, 22, sh(col, -0.08), seed + 3, { lap: 4 });
  R(g, x0, base - 25, x1 - x0, 3, trim); R(g, x0, base - 25, x1 - x0, 1, sh(trim, 0.25)); R(g, x0, base - 22, x1 - x0, 1, OUT);
  for (const px of [x0, x1 - 4]) { R(g, px, eave, 4, base - eave, trim); R(g, px, eave, 1, base - eave, sh(trim, 0.25)); R(g, px + 3, eave, 1, base - eave, sh(trim, -0.3)); }
  // l'avancée du télégraphe (bow-window) et sa lucarne à pignon
  if (o.bay) {
    const [bx, bw] = o.bay, gx = Math.round(bx + bw / 2);
    const half0 = Math.round((bw + 12) / 2), gh = Math.round(half0 / 1.1);
    for (let k = 0; k <= gh; k++) { const half = Math.round(half0 * (k / gh)); R(g, gx - half - 1, roofTop - 8 + k, half * 2 + 2, 1, OUT); }
    battens(g, gx - half0 + 3, roofTop - 8 + Math.round(gh * 0.3), half0 * 2 - 6, gh - Math.round(gh * 0.3), col, seed + 5, 5);
    for (let k = 1; k <= gh; k++) {
      const half = Math.round(half0 * (k / gh)) - 1;
      if (k < Math.round(gh * 0.3) + 1) R(g, gx - half, roofTop - 8 + k, half * 2, 1, col);
      R(g, gx - half, roofTop - 8 + k, 2, 1, trim); R(g, gx + half - 2, roofTop - 8 + k, 2, 1, trim);
    }
    if (o.name) signboard(g, gx, roofTop - 8 + gh - 16, o.name, { bg: '#2a2622', fg: '#f8d070', frame: trim, h: 13 });
    // la caisse de l'avancée, trois pans vitrés
    R(g, bx - 1, eave + 6, bw + 2, base - eave - 6, OUT);
    R(g, bx, eave + 7, bw, base - eave - 7, sh(col, 0.05));
    R(g, bx, eave + 7, 5, base - eave - 7, sh(col, -0.25)); R(g, bx + bw - 5, eave + 7, 5, base - eave - 7, sh(col, -0.12)); // les pans de biais
    R(g, bx - 3, eave + 3, bw + 6, 5, OUT); R(g, bx - 2, eave + 4, bw + 4, 3, roof); R(g, bx - 2, eave + 4, bw + 4, 1, sh(roof, 0.3));
    const wy = eave + 18, wh = base - eave - 46;
    wins.push(sash(g, bx + 1, wy, 3, wh, { frame: trim, cap: false, sill: false, panes: 1 }));
    wins.push(sash(g, bx + bw - 4, wy, 3, wh, { frame: trim, cap: false, sill: false, panes: 1 }));
    wins.push(sash(g, bx + 8, wy, bw - 16, wh, { frame: trim, cap: false, panes: 3 }));
    siding(g, bx + 1, base - 22, bw - 2, 22, sh(col, -0.08), seed + 7, { lap: 4 });
    R(g, bx, base - 25, bw, 3, trim); R(g, bx, base - 22, bw, 1, OUT);
  }
  // fenêtres, porte, porte de fret
  for (const wx of o.windows || []) wins.push(sash(g, wx, eave + 24, 14, 34, { frame: trim, rows: true }));
  if (o.door != null) wins.push(...door(g, o.door, base, 22, 46, { double: true, glass: true, col: sh(col, -0.35), transom: 7, frame: trim }));
  if (o.freight != null) {
    const fx = o.freight, fw = 34, ft = base - 52;
    R(g, fx - 4, ft - 4, fw + 8, 3, '#3a3a42'); // le rail de la porte coulissante
    R(g, fx - 1, ft - 1, fw + 2, base - ft + 1, OUT);
    battens(g, fx, ft, fw, base - ft, sh(col, -0.1), seed + 9, 5);
    R(g, fx, ft, fw, 3, trim); R(g, fx, base - 3, fw, 3, trim); R(g, fx, ft, 3, base - ft, trim); R(g, fx + fw - 3, ft, 3, base - ft, trim);
    for (let k = 0; k < base - ft - 6; k++) R(g, fx + 3 + Math.round((k * (fw - 7)) / (base - ft - 6)), ft + 3 + k, 2, 1, trim); // l'écharpe
    R(g, fx + 2, ft - 3, 3, 3, '#5a5a62'); R(g, fx + fw - 5, ft - 3, 3, 3, '#5a5a62');
  }
  // les consoles sous l'avant-toit, son ombre sur le mur, sa planche de rive
  shadow(g, x0, eave + 4, x1 - x0, 12, 0.3);
  for (let px = x0 + 8; px < x1 - 6; px += o.brackets || 30) {
    if (o.bay && px > o.bay[0] - 8 && px < o.bay[0] + o.bay[1] + 6) continue;
    R(g, px - 1, eave + 4, 4, 22, OUT); R(g, px, eave + 4, 2, 21, trim);
    for (let k = 0; k < 14; k++) { R(g, px + 2 + Math.round(k * 0.6), eave + 24 - k, 2, 1, OUT); R(g, px - 2 - Math.round(k * 0.6), eave + 24 - k, 2, 1, OUT); }
    for (let k = 1; k < 13; k++) { R(g, px + 2 + Math.round(k * 0.6), eave + 24 - k, 1, 1, trim); R(g, px - 1 - Math.round(k * 0.6), eave + 24 - k, 1, 1, trim); }
  }
  R(g, x0 - ovL - 1, eave - 1, x1 - x0 + ovL + ovR + 2, 6, OUT);
  R(g, x0 - ovL, eave, x1 - x0 + ovL + ovR, 4, trim); R(g, x0 - ovL, eave, x1 - x0 + ovL + ovR, 1, sh(trim, 0.25)); R(g, x0 - ovL, eave + 3, x1 - x0 + ovL + ovR, 1, sh(trim, -0.3));
  for (const px of o.posts || []) { // les poteaux sous l'avant-toit qui dépasse, avec leurs jambes de force
    R(g, px - 1, eave + 4, 5, base - eave - 4, OUT); R(g, px, eave + 4, 3, base - eave - 4, trim); R(g, px, eave + 4, 1, base - eave - 4, sh(trim, 0.25)); R(g, px + 2, eave + 4, 1, base - eave - 4, sh(trim, -0.3));
    for (const s of [-1, 1]) for (let k = 0; k < 9; k++) R(g, px + 1 + s * (2 + k), eave + 4 + k, 1, 2, k === 8 ? OUT : trim);
  }
  return wins;
}
// Le quai de planches (base : son dessus, profond de 18 px), sa rive, ses pilotis
export function platform(g, x0, x1, base, seed = 1) {
  const r = rnd(seed * 23 + 2);
  for (let yy = 0; yy < 18; yy += 3) { // planches le long de la voie
    const c = ['#7a5434', '#70492c', '#76502f'][(yy / 3) % 3];
    R(g, x0, base + yy, x1 - x0, 3, c); R(g, x0, base + yy + 2, x1 - x0, 1, sh(c, -0.3));
    for (let x = x0 + Math.floor(r() * 30); x < x1; x += 20 + Math.floor(r() * 40)) R(g, x, base + yy, 1, 2, '#3a2414');
    for (let i = 0; i < (x1 - x0) / 25; i++) R(g, x0 + Math.floor(r() * (x1 - x0)), base + yy + 1, 3 + Math.floor(r() * 5), 1, sh(c, r() < 0.5 ? 0.12 : -0.15));
  }
  R(g, x0, base - 1, x1 - x0, 1, OUT); R(g, x0, base, x1 - x0, 1, '#a8784c');
  R(g, x0, base + 18, x1 - x0, 4, '#4e321e'); R(g, x0, base + 18, x1 - x0, 1, '#a8784c'); R(g, x0, base + 22, x1 - x0, 1, OUT); // la rive
  for (let x = x0 + 6; x < x1; x += 24) R(g, x, base + 23, 4, 4, '#2e1c10');
  shadow(g, x0, base + 23, x1 - x0, 3, 0.4);
}
// Le ballast, les traverses et les deux rails (y : haut du ballast, 11 px)
export function tracks(g, x0, x1, y, seed = 1) {
  const r = rnd(seed * 29 + 7);
  R(g, x0, y, x1 - x0, 11, '#6a5a50');
  for (let i = 0; i < (x1 - x0) * 1.2; i++) R(g, x0 + Math.floor(r() * (x1 - x0)), y + Math.floor(r() * 11), 1, 1, r() < 0.5 ? '#8a7a6e' : '#4a3e38');
  for (let x = x0 + 2; x < x1; x += 9) { R(g, x - 1, y + 2, 8, 7, OUT); R(g, x, y + 3, 6, 5, '#4a2e1c'); R(g, x, y + 3, 6, 1, '#6a4428'); }
  for (const ry of [y + 2, y + 6]) { R(g, x0, ry, x1 - x0, 3, OUT); R(g, x0, ry, x1 - x0, 1, '#c8ccd4'); R(g, x0, ry + 1, x1 - x0, 1, '#6a707a'); }
}
// Château d'eau sur tréteaux et son bec verseur relevé (x : gauche de la cuve ; top : haut de la cuve ; base : pied)
export function waterTower(g, x, top, base, col = '#7a4a2c') {
  const w = 52, th = 40;
  for (const lx of [x + 4, x + 22, x + 42]) { R(g, lx - 1, top + th, 6, base - top - th, OUT); R(g, lx, top + th, 4, base - top - th, '#5a3a22'); R(g, lx, top + th, 1, base - top - th, '#7a5232'); }
  for (let yy = top + th + 8; yy < base - 10; yy += 20) for (let k = 0; k < 38; k++) { R(g, x + 6 + k, yy + Math.round((k * 16) / 38), 1, 1, '#3a2414'); R(g, x + 6 + k, yy + 16 - Math.round((k * 16) / 38), 1, 1, '#3a2414'); }
  R(g, x - 3, top + th, w + 6, 4, OUT); R(g, x - 2, top + th + 1, w + 4, 2, '#5a3a22');
  R(g, x - 1, top - 1, w + 2, th + 2, OUT);
  for (let xx = 0; xx < w; xx += 4) { const c = sh(col, (((xx / 4) % 3) - 1) * 0.06 + (xx < 10 ? 0.12 : xx > w - 12 ? -0.2 : 0)); R(g, x + xx, top, 4, th, c); R(g, x + xx, top, 1, th, sh(c, -0.25)); }
  for (const yy of [top + 6, top + 18, top + 30]) { R(g, x - 1, yy, w + 2, 2, '#2e2e34'); R(g, x, yy, w, 1, '#6a6a72'); }
  for (let k = 0; k < 9; k++) R(g, x - 4 + k * 3, top - 1 - Math.round(k * 1.5), w + 8 - k * 6, 2, k ? '#4a3a36' : OUT); // le toit conique
  R(g, x + w / 2 - 1, top - 16, 2, 3, OUT);
  R(g, x + w - 6, top + th - 10, 18, 4, OUT); R(g, x + w - 5, top + th - 9, 16, 2, '#4a4a52');
  R(g, x + w + 10, top + th - 9, 4, 12, OUT); R(g, x + w + 11, top + th - 8, 2, 10, '#4a4a52');
  for (let k = 0; k < 20; k += 2) R(g, x + w + 2, top + th - 6 + k, 1, 1, '#2e2e34'); // la chaîne
}
// Sémaphore (mât, échelle, deux bras, lanterne) : x, base
export function semaphore(g, x, base, h = 96) {
  R(g, x - 1, base - h - 1, 5, h + 1, OUT); R(g, x, base - h, 3, h, '#d8d0c0'); R(g, x, base - h, 1, h, '#f0ece0');
  for (let yy = base - h + 12; yy < base - 4; yy += 6) R(g, x - 3, yy, 9, 1, '#3a3a42');
  for (const [yy, d] of [[base - h + 4, 1], [base - h + 16, -1]]) {
    const ax = d > 0 ? x + 3 : x - 21;
    R(g, ax - 1, yy - 1, 21, 5, OUT); R(g, ax, yy, 19, 3, '#b8302a'); R(g, d > 0 ? ax + 14 : ax + 2, yy, 3, 3, '#f0e8d8');
  }
  R(g, x - 3, base - h - 6, 9, 6, OUT); R(g, x - 2, base - h - 5, 7, 4, '#3a3a42'); R(g, x, base - h - 4, 3, 2, '#f8d070');
}
// Chariot à bagages chargé de malles : x, base
export function baggageCart(g, x, base) {
  R(g, x - 1, base - 13, 46, 5, OUT); R(g, x, base - 12, 44, 3, '#7a4a2a'); R(g, x, base - 12, 44, 1, '#a8703c');
  for (const wx of [x + 8, x + 36]) { S.disc(g, wx, base - 4, 5, OUT); S.disc(g, wx, base - 4, 4, '#3a3a42'); S.disc(g, wx, base - 4, 1, '#8a8f98'); }
  R(g, x + 44, base - 22, 2, 12, OUT); R(g, x + 44, base - 23, 6, 2, OUT); // le timon relevé
  box(g, x + 3, base - 25, 20, 12, '#5a3a24'); R(g, x + 3, base - 21, 20, 1, '#c8a050'); R(g, x + 3, base - 25, 20, 1, '#7a5a3a'); R(g, x + 11, base - 22, 3, 3, '#c8a050');
  box(g, x + 25, base - 21, 16, 8, '#3a4a5a'); R(g, x + 25, base - 18, 16, 1, '#8a8f98');
  box(g, x + 6, base - 33, 14, 7, '#7a2a1a'); R(g, x + 6, base - 30, 14, 1, '#c8a050');
}
// Bidon de lait : x, base
export function milkCan(g, x, base) {
  R(g, x - 1, base - 15, 10, 16, OUT); R(g, x, base - 14, 8, 14, '#a8aeb6'); R(g, x + 1, base - 14, 2, 14, '#d8dce0'); R(g, x + 6, base - 14, 2, 14, '#7a8088');
  R(g, x + 1, base - 18, 6, 4, OUT); R(g, x + 2, base - 17, 4, 3, '#a8aeb6'); R(g, x, base - 10, 8, 1, '#6a7078');
}
