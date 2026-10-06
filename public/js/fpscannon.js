// Au canon (FPS) : la pièce vue par le servant, à la place de l'arme en main, et le point de chute du boulet.
// cannonView(hausse, feu) : le fût de fonte vu de la culasse, qui file vers le milieu de l'image (plus la hausse
// est forte, plus la bouche monte), les flasques de l'affût et le haut des roues sur les côtés.
// aimMark(f) : la mire posée au point de chute ; aimDot() : un point du cercle de souffle, au sol.
import { canvas, memo } from './fpsart.js';

const IRON = ['#0e1013', '#1a1d22', '#2a2e35', '#3e434c', '#5c626c', '#8a8f98', '#b8bec6'];
const WOOD = ['#24140a', '#3a2010', '#5a3418', '#7a4a24', '#9a6434', '#b8804a'];
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const band = (ramp, v, x, y) => {
  const t = Math.max(0, Math.min(0.999, v)) * (ramp.length - 1), i = Math.floor(t);
  return ramp[Math.min(ramp.length - 1, i + (t - i > (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16 ? 1 : 0))];
};

export const VIEW_W = 384, VIEW_H = 128;

// hausse : 0 (tir tendu) à 1 (portée maximale) ; flash : la bouche crache le feu (juste après le coup)
export function cannonView(hausse, flash = false) {
  const q = Math.round(Math.max(0, Math.min(1, hausse)) * 8);
  return memo(`cn:${q}:${flash ? 1 : 0}`, () => drawView(q / 8, flash));
}

function drawView(e, flash) {
  const c = canvas(VIEW_W, VIEW_H), ctx = c.getContext('2d');
  const P = (x, y, col) => { ctx.fillStyle = col; ctx.fillRect(x, y, 1, 1); };
  const R = (x, y, w, h, col) => { ctx.fillStyle = col; ctx.fillRect(x, y, w, h); };
  const cx = VIEW_W / 2, yb = VIEW_H, ym = Math.round(64 - e * 12); // bas de l'image (culasse), bouche : elle monte un peu avec la hausse, sans jamais cacher la mire
  const half = (s) => 31 * (1 - s) ** 1.3 + 11 * (1 - (1 - s) ** 1.3); // demi-largeur du fût à la profondeur s (0 culasse, 1 bouche)
  const sOf = (y) => (yb - y) / (yb - ym);

  // --- les roues, de part et d'autre : bandage de fer, jante de bois et quelques rais (seul le haut dépasse)
  for (const side of [-1, 1]) {
    const wx = cx + side * 168, wy = VIEW_H + 34, r0 = 74, r1 = 84;
    for (let y = wy - r1; y < VIEW_H; y++) for (let x = Math.max(0, wx - r1); x < Math.min(VIEW_W, wx + r1); x++) {
      const d = Math.hypot(x - wx, y - wy);
      if (d > r1 || d < r0 - 9) continue;
      const lit = 0.55 - ((x - wx) * 0.4 + (y - wy) * 0.6) / r1 * 0.5;
      if (d > r1 - 4) P(x, y, band(IRON, lit * 0.8, x, y));
      else if (d > r0) P(x, y, band(WOOD, lit, x, y));
      else if (d > r0 - 9) {
        const a = Math.atan2(y - wy, x - wx), k = ((a / (Math.PI / 6)) % 1 + 1) % 1; // les rais, tous les 30°
        if (k < 0.16) P(x, y, band(WOOD, lit * 0.85, x, y));
      }
    }
  }
  // --- les flasques de l'affût : deux joues de bois de chaque côté du fût, ferrées, qui montent jusqu'aux tourillons
  const st = 0.36, yt = Math.round(yb - st * (yb - ym)); // tourillons
  for (const side of [-1, 1]) {
    for (let y = yt - 4; y < VIEW_H; y++) {
      const s = sOf(y), h = half(Math.max(0, s));
      const xin = cx + side * (h + 2), xout = cx + side * (h + 22 + (VIEW_H - y) * 0.05);
      const [a, b] = side < 0 ? [Math.round(xout), Math.round(xin)] : [Math.round(xin), Math.round(xout)];
      for (let x = a; x <= b; x++) {
        const u = (x - a) / Math.max(1, b - a); // 0 côté gauche de la joue, 1 côté droit
        let v = 0.42 + (side < 0 ? (1 - u) * 0.25 : u * -0.1) + (y === yt - 4 ? 0.35 : 0) + ((x * 7 + y * 3) % 11 === 0 ? -0.08 : 0);
        if ((side < 0 && x === a) || (side > 0 && x === b)) v = 0.1;
        P(x, y, band(WOOD, v, x, y));
      }
      // ferrures : bandes de fer et boulons
      if ((y - yt) % 22 === 6 || (y - yt) % 22 === 7) for (let x = a; x <= b; x++) P(x, y, band(IRON, (y - yt) % 22 === 6 ? 0.62 : 0.3, x, y));
      if ((y - yt) % 22 === 14) { const bx = Math.round((a + b) / 2); R(bx - 1, y - 1, 3, 3, IRON[2]); P(bx - 1, y - 1, IRON[5]); }
    }
  }
  // --- le fût : un cylindre de fonte éclairé d'en haut à gauche, frettes, grain de lumière tramé
  for (let y = ym; y < VIEW_H; y++) {
    const s = sOf(y), h = half(s);
    for (let x = Math.floor(cx - h); x <= Math.ceil(cx + h); x++) {
      const u = (x + 0.5 - cx) / h;
      if (u < -1 || u > 1) continue;
      const nz = Math.sqrt(1 - u * u);
      let v = 0.12 + 0.78 * Math.max(0, -0.42 * u + 0.9 * nz) ** 1.4;
      if (Math.abs(u) > 0.94) v = 0.04; // contour
      P(x, y, band(IRON, v, x, y));
    }
  }
  // frettes (renforts) : une rangée claire, une sombre, un peu plus larges que le fût
  for (const s of [0.1, 0.38, 0.62, 0.88]) {
    const y = Math.round(yb - s * (yb - ym)), h = half(s) + 1.5;
    for (let x = Math.floor(cx - h); x <= Math.ceil(cx + h); x++) {
      const u = (x + 0.5 - cx) / h;
      if (Math.abs(u) > 1) continue;
      const lit = 0.25 + 0.7 * Math.max(0, -0.42 * u + 0.9 * Math.sqrt(1 - u * u));
      P(x, y - 1, band(IRON, lit + 0.12, x, y)); P(x, y, band(IRON, lit - 0.05, x, y)); P(x, y + 1, IRON[0]);
    }
  }
  // tourillons : les bouts qui reposent dans les flasques, sous leur chapeau de fer
  for (const side of [-1, 1]) {
    const x = Math.round(cx + side * (half(st) + 2)) - (side < 0 ? 6 : 0);
    R(x, yt - 3, 7, 7, IRON[1]); R(x, yt - 3, 7, 1, IRON[5]); R(x, yt - 2, 7, 1, IRON[4]); R(x, yt + 3, 7, 1, IRON[0]);
  }
  // lumière (trou de mise à feu) près de la culasse, et le guidon sur la frette de bouche
  const yl = Math.round(yb - 0.05 * (yb - ym));
  R(cx - 2, yl - 1, 4, 3, IRON[0]); P(cx - 1, yl - 1, IRON[2]);
  const yg = Math.round(yb - 0.9 * (yb - ym));
  R(cx - 1, yg - 4, 2, 3, IRON[1]); P(cx - 1, yg - 4, IRON[5]);
  // --- la bouche : le bourrelet vu en raccourci, l'âme noire
  const rx = half(1) + 3, ry = 3 + Math.round((1 - e) * 2);
  for (let y = -ry - 1; y <= ry + 1; y++) for (let x = -Math.ceil(rx); x <= Math.ceil(rx); x++) {
    const d = (x / rx) ** 2 + (y / ry) ** 2;
    if (d > 1) continue;
    const di = (x / (rx * 0.62)) ** 2 + (y / (ry * 0.62)) ** 2;
    P(cx + x, ym + y, di < 1 ? (di < 0.5 ? '#050505' : IRON[0]) : band(IRON, y < 0 ? 0.85 - (x / rx) * 0.2 : 0.35, cx + x, ym + y));
  }
  // --- le coup part : une gerbe de feu et de fumée à la bouche
  if (flash) {
    const fl = ['#fff8d0', '#ffe070', '#ffa030', '#e05010'];
    for (let y = -26; y <= 2; y++) for (let x = -24; x <= 24; x++) {
      const d = Math.hypot(x / 1.1, (y + 9) / 1.3) + Math.sin(x * 1.7 + y) * 1.4;
      if (d < 16) P(cx + x, ym + y, fl[Math.min(3, Math.floor(d / 4))]);
    }
  }
  return c;
}

// La mire au point de chute : un cercle rouge cerclé de crème, une croix au milieu ; f : battement (0 ou 1)
export function aimMark(f = 0) {
  return memo(`cn:mark:${f}`, () => {
    const c = canvas(24, 24), ctx = c.getContext('2d');
    const P = (x, y, col) => { ctx.fillStyle = col; ctx.fillRect(x, y, 1, 1); };
    const r = f ? 9.5 : 8.5;
    for (let y = 0; y < 24; y++) for (let x = 0; x < 24; x++) {
      const d = Math.hypot(x + 0.5 - 12, y + 0.5 - 12);
      if (Math.abs(d - r) < 0.9) P(x, y, '#e8402a');
      else if (Math.abs(d - r) < 1.8) P(x, y, '#2a0a06');
    }
    for (let k = -5; k <= 5; k++) { P(12 + k, 12, '#fdf6e0'); P(12, 12 + k, '#fdf6e0'); }
    P(12, 12, '#e8402a');
    return c;
  });
}

export function aimDot() {
  return memo('cn:dot', () => {
    const c = canvas(4, 4), ctx = c.getContext('2d');
    ctx.fillStyle = '#2a0a06'; ctx.fillRect(0, 1, 4, 2); ctx.fillRect(1, 0, 2, 4);
    ctx.fillStyle = '#ff6040'; ctx.fillRect(1, 1, 2, 2);
    return c;
  });
}
