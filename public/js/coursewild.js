// Décor et obstacles de la chevauchée sauvage (variante de la course de chevaux, voir coursegame.js) :
// la prairie vue de côté, sans couloirs. Tout ce qui est sur la prairie défile à la vitesse des chevaux ;
// le lointain et la lisière défilent plus lentement.
import * as S from './sprites.js';
import { canvasText } from './scene.js';
import { pixelSprite } from './miniscene.js';
import { W, H } from './worlds.js';
import { WILD } from './coursegame.js';

const OUT = S.OUT;
const rd = Math.round;
const hash = (n) => {
  let t = (n * 0x6d2b79f5) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

export const FIELD = WILD.y0 - 10; // bord du fond de la prairie (à l'écran)
const M = 5; // px par mètre

const cache = new Map();
const cached = (key, make) => {
  let c = cache.get(key);
  if (!c) { c = make(); cache.set(key, c); }
  return c;
};

// ------------------------------------------------------------ sprites (origine : bord gauche de l'emprise, au sol)
const SPRITES = {
  rock: () => pixelSprite(28, 20, 3, 17, (R) => {
    R(0, -8, 22, 8, '#8a8478'); R(2, -11, 18, 3, '#8a8478'); R(5, -14, 11, 3, '#9a9488');
    R(4, -12, 7, 2, '#b0aa9c'); R(2, -8, 5, 2, '#a8a294'); R(7, -14, 4, 1, '#c0baac');
    R(14, -11, 6, 9, '#6a6458'); R(1, -2, 21, 2, '#5a5448');
    R(11, -10, 1, 4, '#5a5448'); R(12, -6, 1, 3, '#5a5448'); R(17, -4, 2, 1, '#7a8a5a');
  }),
  cactus: () => pixelSprite(18, 36, 5, 33, (R) => {
    R(1, -28, 6, 28, '#4a7a3a'); R(2, -29, 4, 1, '#4a7a3a');
    R(2, -28, 1, 27, '#6a9a4a'); R(6, -28, 1, 28, '#2e5228');
    R(-3, -17, 4, 3, '#4a7a3a'); R(-3, -24, 3, 8, '#4a7a3a'); R(-3, -24, 1, 7, '#6a9a4a');
    R(7, -13, 4, 3, '#4a7a3a'); R(8, -21, 3, 9, '#4a7a3a'); R(10, -21, 1, 8, '#2e5228');
    for (let y = -26; y < -2; y += 5) { R(0, y, 1, 1, '#d8e0a0'); R(7, y + 2, 1, 1, '#d8e0a0'); }
    R(3, -30, 1, 1, '#f08ab0'); // une fleur au sommet
  }),
  bush: () => pixelSprite(20, 14, 3, 11, (R) => {
    R(0, -6, 14, 6, '#7a8a5a'); R(2, -9, 10, 3, '#7a8a5a'); R(4, -10, 5, 1, '#7a8a5a');
    R(3, -9, 3, 2, '#9aaa78'); R(8, -7, 3, 1, '#9aaa78'); R(1, -5, 2, 1, '#9aaa78');
    R(0, -2, 14, 2, '#5a6a40'); R(10, -5, 3, 3, '#5a6a40');
    R(5, -6, 1, 1, '#c8b8d8'); R(11, -9, 1, 1, '#c8b8d8');
  }),
};
const sprite = (k) => cached(`w${k}`, SPRITES[k]);

// petit arbre (peuplier) du lointain
function farTree(ctx, x, y, s) {
  ctx.fillStyle = '#5a4a30'; ctx.fillRect(x, y - 3 - s, 1, 3 + s);
  S.disc(ctx, x, y - 5 - s, 3 + rd(s / 2), '#5a7040');
  ctx.fillStyle = '#6a8048'; ctx.fillRect(x - 2, y - 7 - s, 2, 2);
}

// Le fond : lointain, lisière, la prairie (herbe, fleurs, sentier de terre), départ, poteaux et arrivée.
export function drawField(ctx, cam, now, len) {
  // lointain : peupliers et rochers, très lents
  const far = cam * 0.3;
  for (let x = Math.floor(far / 46) * 46; x < far + W + 46; x += 46) {
    const k = Math.floor(x / 46), sx = rd(x - far + hash(k) * 30);
    if (hash(k + 3) < 0.5) farTree(ctx, sx, 98, rd(hash(k + 5) * 4));
    else if (hash(k + 3) < 0.62) { ctx.fillStyle = '#8a7a64'; ctx.fillRect(sx, 95, 6, 3); ctx.fillRect(sx + 1, 94, 3, 1); }
  }
  // lisière : herbes hautes et armoise, un peu plus lentes que la prairie
  ctx.fillStyle = '#a89a58'; ctx.fillRect(0, 96, W, FIELD - 96);
  ctx.fillStyle = '#c0b068'; ctx.fillRect(0, 96, W, 1);
  const mid = cam * 0.7;
  for (let x = Math.floor(mid / 11) * 11; x < mid + W + 11; x += 11) {
    const k = Math.floor(x / 11), sx = rd(x - mid);
    if (hash(k) < 0.35) S.disc(ctx, sx, 100 + rd(hash(k + 1) * (FIELD - 106)), 2 + rd(hash(k + 2) * 2), hash(k + 4) < 0.5 ? '#8a9258' : '#7a8a50');
    else if (hash(k) < 0.7) { ctx.fillStyle = '#8a7e44'; ctx.fillRect(sx, 99 + rd(hash(k + 1) * (FIELD - 103)), 2, 1); }
  }
  // la prairie
  ctx.fillStyle = '#b4a45e'; ctx.fillRect(0, FIELD, W, H - FIELD);
  ctx.fillStyle = '#9a8c4c'; ctx.fillRect(0, FIELD, W, 1);
  ctx.fillStyle = '#c4b470'; ctx.fillRect(0, FIELD + 1, W, 1);
  // sentier de terre qui serpente
  for (let sx = 0; sx < W; sx += 3) {
    const x = sx + cam;
    const cy = rd((WILD.y0 + WILD.y1) / 2 + Math.sin(x / 380) * 22 + Math.sin(x / 127) * 5);
    const hw = 6 + rd(Math.sin(x / 90) * 2);
    ctx.fillStyle = '#c8aa70'; ctx.fillRect(sx, cy - hw, 3, hw * 2);
    ctx.fillStyle = '#b89a60'; ctx.fillRect(sx, cy - hw, 3, 1); ctx.fillRect(sx, cy + hw - 1, 3, 1);
    if (hash(Math.floor(x / 3)) < 0.2) { ctx.fillStyle = '#a88a58'; ctx.fillRect(sx + 1, cy - hw + 2 + rd(hash(Math.floor(x / 3) + 7) * (hw * 2 - 4)), 1, 1); }
  }
  // touffes d'herbe et fleurs
  for (let x = Math.floor(cam / 8) * 8; x < cam + W + 8; x += 8) {
    const xi = Math.floor(x / 8);
    for (let row = 0, y = FIELD + 4; y < H; row++, y += 6) {
      const k = hash(xi * 131 + row * 17);
      if (k > 0.24) continue;
      const sx = rd(x - cam + hash(xi + row * 7) * 6), yy = y + rd(hash(xi * 3 + row) * 4);
      if (k < 0.02) { ctx.fillStyle = k < 0.01 ? '#f0d060' : '#ece4f0'; ctx.fillRect(sx, yy - 1, 1, 1); ctx.fillStyle = '#6a8040'; ctx.fillRect(sx, yy, 1, 1); }
      else { ctx.fillStyle = '#8a7e44'; ctx.fillRect(sx, yy - 1, 1, 2); ctx.fillRect(sx + 1, yy, 1, 1); ctx.fillRect(sx - 1, yy, 1, 1); }
    }
  }
  // la ligne de départ, tracée à la chaux, et son fanion
  const s0 = rd(-cam);
  if (s0 > -30 && s0 < W + 30) {
    ctx.fillStyle = '#f4f0e4';
    for (let y = FIELD + 2; y < H; y += 2) ctx.fillRect(s0, y, 2, 1);
    ctx.fillStyle = OUT; ctx.fillRect(s0 - 1, FIELD - 30, 3, 32);
    ctx.fillStyle = '#7a5a34'; ctx.fillRect(s0, FIELD - 29, 1, 30);
    const f = Math.floor(now / 220) % 2;
    ctx.fillStyle = '#f4ecd8'; ctx.fillRect(s0 + 1, FIELD - 29 + f, 10, 6);
    canvasText(ctx, 'DÉPART', s0, FIELD - 42, { color: '#fdf6e0' });
  }
  // poteaux indicateurs (mètres restants), plantés à la lisière
  for (let x = Math.ceil(cam / 1000) * 1000; x < cam + W + 40; x += 1000) {
    if (x <= 0 || x >= len) continue;
    const sx = rd(x - cam);
    ctx.fillStyle = OUT; ctx.fillRect(sx - 1, FIELD - 18, 3, 20); ctx.fillRect(sx - 12, FIELD - 27, 25, 11);
    ctx.fillStyle = '#5a3a20'; ctx.fillRect(sx, FIELD - 17, 1, 18);
    ctx.fillStyle = '#c8a070'; ctx.fillRect(sx - 11, FIELD - 26, 23, 9);
    canvasText(ctx, `${(len - x) / M}`, sx + 1, FIELD - 26, { color: '#3a2214', shadow: '' });
  }
  // l'arrivée : le ranch derrière sa clôture, un damier au sol et le poteau du drapeau
  const s1 = rd(len - cam);
  if (s1 > -260 && s1 < W + 60) {
    ranch(ctx, s1 + 30, FIELD, now);
    for (let y = FIELD + 1; y < H; y++) for (let c = 0; c < 2; c++) {
      ctx.fillStyle = (Math.floor((y - FIELD) / 3) + c) % 2 ? '#1a0f0a' : '#f4f0e4';
      ctx.fillRect(s1 + c * 3, y, 3, 1);
    }
    ctx.fillStyle = OUT; ctx.fillRect(s1 - 1, FIELD - 54, 5, 56);
    ctx.fillStyle = '#f4ecd8'; ctx.fillRect(s1, FIELD - 53, 3, 54);
    const f = Math.floor(now / 160) % 3;
    for (let k = 0; k < 4; k++) for (let j = 0; j < 3; j++) {
      ctx.fillStyle = (k + j) % 2 ? '#1a0f0a' : '#f4f0e4';
      ctx.fillRect(s1 + 3 + k * 4, FIELD - 53 + j * 4 + (k > 1 ? (f + k) % 2 : 0), 4, 4);
    }
    canvasText(ctx, 'ARRIVÉE', s1, FIELD - 70, { color: '#f8d070' });
  }
}

// le ranch de l'arrivée : la maison, la grange et la clôture, avec ses curieux qui agitent leur chapeau
function ranch(ctx, x, base, now) {
  x = rd(x);
  ctx.fillStyle = OUT; ctx.fillRect(x + 20, base - 37, 82, 38); ctx.fillRect(x + 14, base - 46, 94, 10);
  ctx.fillStyle = '#a8703c'; ctx.fillRect(x + 21, base - 36, 80, 36);
  for (let y = base - 33; y < base; y += 4) { ctx.fillStyle = '#8a5a34'; ctx.fillRect(x + 21, y, 80, 1); }
  ctx.fillStyle = '#7a2a1e'; ctx.fillRect(x + 15, base - 45, 92, 8);
  ctx.fillStyle = '#5a1a14'; ctx.fillRect(x + 15, base - 38, 92, 1);
  ctx.fillStyle = OUT; ctx.fillRect(x + 54, base - 22, 14, 22);
  ctx.fillStyle = '#3a2214'; ctx.fillRect(x + 55, base - 21, 12, 21);
  for (const wx of [30, 82]) {
    ctx.fillStyle = OUT; ctx.fillRect(wx + x - 1, base - 29, 12, 10);
    ctx.fillStyle = '#f8d070'; ctx.fillRect(wx + x, base - 28, 10, 8);
    ctx.fillStyle = '#8a5a34'; ctx.fillRect(wx + x + 4, base - 28, 1, 8);
  }
  ctx.fillStyle = OUT; ctx.fillRect(x + 38, base - 58, 46, 11);
  ctx.fillStyle = '#e8d8b0'; ctx.fillRect(x + 39, base - 57, 44, 9);
  canvasText(ctx, 'RANCH', x + 61, base - 57, { color: '#7a1a14', shadow: '' });
  // grange
  ctx.fillStyle = OUT; ctx.fillRect(x + 118, base - 31, 52, 32);
  ctx.fillStyle = '#9a2a1e'; ctx.fillRect(x + 119, base - 30, 50, 30);
  ctx.fillStyle = '#e8dcc8'; ctx.fillRect(x + 133, base - 20, 22, 20);
  ctx.fillStyle = '#9a2a1e'; ctx.fillRect(x + 135, base - 18, 18, 18);
  ctx.fillStyle = '#e8dcc8'; for (let k = 0; k < 18; k++) ctx.fillRect(x + 135 + k, base - 18 + k, 1, 1);
  // clôture et curieux
  for (let px = -10; px < 190; px += 12) {
    ctx.fillStyle = OUT; ctx.fillRect(x + px - 1, base - 11, 4, 12);
    ctx.fillStyle = '#8a5a34'; ctx.fillRect(x + px, base - 10, 2, 10);
  }
  ctx.fillStyle = '#a8703c'; ctx.fillRect(x - 10, base - 9, 200, 2); ctx.fillRect(x - 10, base - 5, 200, 2);
  for (let k = 0; k < 5; k++) {
    const px = x + 4 + k * 22 + (k > 2 ? 70 : 0), up = Math.floor(now / 180 + k) % 2;
    ctx.fillStyle = ['#7a2a1e', '#3a6ec0', '#4a7a3a', '#e0b040', '#7a3a7a'][k]; ctx.fillRect(px, base - 15, 5, 6);
    ctx.fillStyle = '#e0b088'; ctx.fillRect(px + 1, base - 18, 3, 3);
    ctx.fillStyle = '#3a2214'; ctx.fillRect(px - (up ? 1 : 0), base - 19 - (up ? 3 : 0), 5, 1); ctx.fillRect(px + 1, base - 20 - (up ? 3 : 0), 3, 1);
  }
}

// ------------------------------------------------------------ obstacles à plat (sous tout le reste)
export function drawFlat(ctx, o, sx, now) {
  if (o.kind === 'creek') {
    // le ruisseau traverse toute la prairie ; au gué, l'eau est basse et les galets affleurent
    for (let y = FIELD; y < H; y++) {
      const off = rd(Math.sin(y * 0.07 + o.id) * 2), x = sx + off;
      const ford = Math.abs(y - o.fy) <= o.fd;
      ctx.fillStyle = ford ? S.mix('#9ac0c8', '#c8e0e0', 0.5 + 0.5 * Math.sin(now / 300 + y)) : S.mix('#2a5a8a', '#7ab0f0', 0.3 + 0.25 * Math.sin(now / 250 + y * 0.8));
      ctx.fillRect(x, y, o.w, 1);
      ctx.fillStyle = '#6a5030'; ctx.fillRect(x - 1, y, 1, 1); ctx.fillRect(x + o.w, y, 1, 1);
      if (ford && (y + o.id) % 3 === 0) {
        ctx.fillStyle = '#a8a294';
        ctx.fillRect(x + 2 + ((y * 7) % (o.w - 6)), y, 3, 1);
      } else if (!ford && (y * 13 + Math.floor(now / 200)) % 23 === 0) { ctx.fillStyle = '#c8e8f8'; ctx.fillRect(x + ((y * 5) % (o.w - 4)) + 1, y, 3, 1); }
    }
    // le gué est balisé par deux piquets
    for (const py of [o.fy - o.fd - 2, o.fy + o.fd + 2]) {
      const px = sx + o.w + 3 + rd(Math.sin(py * 0.07 + o.id) * 2);
      ctx.fillStyle = OUT; ctx.fillRect(px - 1, py - 9, 3, 10);
      ctx.fillStyle = '#f4ecd8'; ctx.fillRect(px, py - 8, 1, 8);
      ctx.fillStyle = '#c0392b'; ctx.fillRect(px, py - 8, 1, 2);
    }
  } else if (o.kind === 'hole') {
    const y = o.y;
    ctx.fillStyle = '#9a7a48'; ctx.fillRect(sx - 2, y - 1, 10, 3); ctx.fillRect(sx - 1, y - 2, 8, 1);
    ctx.fillStyle = '#2a1a10'; ctx.fillRect(sx, y - 1, 6, 2); ctx.fillRect(sx + 1, y - 2, 4, 1);
  }
}

// le chien de prairie qui sort de temps en temps de son terrier (dessiné à sa profondeur)
function prairieDog(ctx, o, sx, now) {
  const ph = ((now / 1000 + o.id * 0.37) % 3.2);
  if (ph > 1.1) return;
  const up = Math.min(1, ph / 0.15, (1.1 - ph) / 0.15);
  const hgt = rd(5 * up);
  if (hgt <= 0) return;
  const x = sx + 2, y = o.y - 1;
  ctx.fillStyle = OUT; ctx.fillRect(x - 1, y - hgt - 1, 4, hgt + 1);
  ctx.fillStyle = '#b08850'; ctx.fillRect(x, y - hgt, 2, hgt);
  if (hgt >= 4) { ctx.fillStyle = '#1a0f0a'; ctx.fillRect(x + 1, y - hgt + 1, 1, 1); }
}

// ------------------------------------------------------------ obstacles debout (triés par profondeur avec les chevaux)
// Renvoie la profondeur de tri d'un obstacle à l'instant t (son bord proche).
export const sortY = (o, oy) => (o.kind === 'log' ? oy + o.d : oy);

export function drawStanding(ctx, o, sx, oy, now, down) {
  ctx.globalAlpha = down ? 0.5 : 1;
  if (o.kind === 'log') {
    // tronc couché en travers, vu de trois quarts : l'écorce dessus, la coupe vers nous
    const y0 = oy - o.d, y1 = oy + o.d;
    ctx.fillStyle = OUT; ctx.fillRect(sx - 1, y0 - 6, o.w + 2, y1 - y0 + 7);
    ctx.fillStyle = '#6a4a2a'; ctx.fillRect(sx, y0 - 5, o.w, y1 - y0 + 5);
    ctx.fillStyle = '#8a6238'; ctx.fillRect(sx + 1, y0 - 5, 2, y1 - y0 + 5);
    ctx.fillStyle = '#4a3018'; ctx.fillRect(sx + o.w - 2, y0 - 5, 2, y1 - y0 + 5);
    for (let y = y0; y < y1 - 5; y += 5) { ctx.fillStyle = '#4a3018'; ctx.fillRect(sx + 2 + ((y * 3) % 4), y, 2, 1); }
    // un moignon de branche
    const by = y0 + ((o.id * 7) % Math.max(1, y1 - y0 - 8)) + 2;
    ctx.fillStyle = OUT; ctx.fillRect(sx + o.w, by - 4, 4, 4);
    ctx.fillStyle = '#6a4a2a'; ctx.fillRect(sx + o.w, by - 3, 3, 2);
    // la coupe
    ctx.fillStyle = '#d8b080'; ctx.fillRect(sx, y1 - 5, o.w, 5);
    ctx.fillStyle = '#a88050'; ctx.fillRect(sx + 2, y1 - 4, o.w - 4, 3);
    ctx.fillStyle = '#d8b080'; ctx.fillRect(sx + 3, y1 - 3, o.w - 6, 1);
  } else if (o.kind === 'tumble') {
    const b = rd(Math.abs(Math.sin(now / 140 + o.id)) * 4);
    ctx.fillStyle = 'rgba(40,20,10,0.3)'; ctx.fillRect(sx + 1, oy - 1, 9, 2);
    S.tumbleweed(ctx, sx + 5, oy - 6 - b, now);
  } else if (o.kind === 'hole') {
    prairieDog(ctx, o, sx, now);
  } else {
    const s = sprite(o.kind);
    ctx.fillStyle = 'rgba(40,20,10,0.25)'; ctx.fillRect(sx - 1, oy - 1, o.w + 3, 2);
    ctx.drawImage(s, sx - s.ox, oy - s.oy);
  }
  ctx.globalAlpha = 1;
}
