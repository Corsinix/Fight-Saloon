// Le canyon : on chemine au fond de la gorge. Au loin, le rebord du plateau accroche le soleil au-dessus d'une brume
// bleutée ; plus près, une aiguille jumelle (Spider Rock) et des parois étagées ; devant, les grandes parois rouges
// dans l'ombre, à corniches et coulures, une maison troglodyte dans une alcôve, éboulis au pied, lit de rivière à sec.
import * as S from '../../sprites.js';
import { H } from '../../worlds.js';
import { R } from './kit.js';
import {
  P, Pix, hex, ramp, pick, vnoise, fbm, hsh, wall, ground, pebbles, sow,
  bush, tuft, boulder, juniper, cottonwood, skull, deadTree,
} from './kit-nature.js';

const HZ = 100;
const FLOOR = 102; // le fond de la gorge, au loin
const HAZE = hex('#d8aca8');
const MIST = hex('#e8c4b8');
const SABLE = ramp('6a3a2a 84482e 9c5834 b26a3e c47c4a d28e58 dca068 e6b27c eec494');

// silhouette en gradins d'une paroi entre a et b : le rebord descend par paliers vers les arêtes
const stepped = (a, b, top, run = 34, drop = 12, seed = 1) => (x) => {
  const left = x - a < b - x, e = Math.min(x - a, b - x);
  let y = top;
  // trois paliers de largeur et de hauteur inégales, différents de chaque côté
  for (let k = 0, r = run; k < 3; k++) {
    if (e < r) y += Math.round(drop * (0.6 + hsh(k, left ? 3 : 4, seed) * 0.9));
    r -= r * (0.25 + hsh(k, left ? 1 : 2, seed) * 0.3);
  }
  return y + Math.round((vnoise(x / 5, 0, seed) - 0.5) * 3);
};
// brume du fond de la gorge : les pixels bas d'un calque tirent vers MIST
function mist(Pp, y0, y1, k) {
  for (let y = y0; y < y1; y++) for (let x = 0; x < Pp.w; x++) Pp.shade(x, y, MIST, k * ((y - y0) / (y1 - y0)) ** 1.2);
}

const WALLS = [ // [a, b, rebord, pied] des parois proches
  [-12, 196, -30, 158],
  [342, 470, 40, 148],
  [548, 692, -24, 160],
];

export default {
  w: 680, horizon: HZ, ground: 188, outdoor: true,
  far: [
    // le rebord lointain du plateau, liseré doré, et la brume
    { k: 0.12, draw(g, w) {
      const Pp = new Pix(g);
      wall(Pp, { top: (x) => 42 + Math.round(fbm(x / 40, 1, 3, 2) * 10) + (Math.sin(x / 33) > 0.85 ? 8 : 0), bot: () => FLOOR + 3, R: P.grès, lit: 7.6, band: 6, haze: 0.5, hcol: HAZE, seed: 3, warp: 2 });
      mist(Pp, 64, FLOOR + 3, 0.75);
      Pp.put();
    } },
    // les parois étagées du milieu de la gorge et l'aiguille jumelle
    { k: 0.3, draw(g, w) {
      const Pp = new Pix(g);
      wall(Pp, { x0: 0, x1: 150, top: stepped(-20, 150, 52, 44, 10, 5), bot: () => FLOOR + 3, R: P.grès, lit: 6.4, band: 7, haze: 0.3, hcol: HAZE, seed: 5 });
      wall(Pp, { x0: 330, x1: w, top: stepped(330, w + 40, 56, 54, 9, 6), bot: () => FLOOR + 3, R: P.grès, lit: 6.2, band: 7, haze: 0.32, hcol: HAZE, seed: 6 });
      // Spider Rock : deux aiguilles serrées, l'une plus haute, sur leur socle d'éboulis
      const spire = (x) => (x >= 236 && x < 248 ? 16 + Math.round((Math.abs(x - 242) / 6) ** 2 * 3) : x >= 248 && x < 257 ? 32 + Math.round((Math.abs(x - 252) / 4.5) ** 2 * 3) : 999);
      wall(Pp, { x0: 236, x1: 257, top: spire, bot: () => FLOOR - 6, R: P.grès, lit: 7, band: 8, haze: 0.22, hcol: HAZE, seed: 7, warp: 1,
        edge: (x) => (x < 239 ? 1.6 : x > 253 ? -1.6 : 0) });
      wall(Pp, { x0: 214, x1: 280, top: (x) => FLOOR - 8 + Math.round((Math.abs(x - 246) / 33) ** 1.6 * 8), bot: () => FLOOR + 3, R: P.talus, lit: 6, band: 4, haze: 0.28, hcol: HAZE, seed: 8 });
      mist(Pp, 74, FLOOR + 3, 0.5);
      Pp.put();
    } },
  ],
  back(g, w) {
    const Pp = new Pix(g);
    // le fond de la gorge : sable pâle, plus chaud et plus grenu vers nous
    ground(Pp, { y0: FLOOR, y1: H, R: SABLE, lf: 7.6, ln: 5, amp: 1.6, seed: 71 });
    // le lit de la rivière à sec, qui serpente depuis le fond
    for (let i = 0; i <= 600; i++) {
      const t = i / 600, y = FLOOR + 1 + t ** 1.6 * (H - FLOOR), cx = 268 + Math.sin(t * 3.1) * 70 + t * 150, hw = 1 + t * 22;
      for (let x = Math.round(cx - hw); x <= cx + hw; x++) {
        const e = Math.abs(x - cx) / hw;
        Pp.set(x, Math.round(y), pick(SABLE, e > 0.82 ? 6.8 : 3.4 + vnoise(x / 2, y / 2, 4) * 1.4 + (hsh(x, Math.round(y), 5) < 0.06 ? 3 : 0), x, Math.round(y))); // berges claires, lit humide et galets
      }
    }
    pebbles(Pp, { y0: FLOOR + 3, n: w * 1.5, R: SABLE, seed: 72, grass: 0.15 });
    // peupliers et buissons au loin, le long du lit
    sow(Pp, { y0: FLOOR + 1, y1: 140, n: 60, seed: 73, haze: 0.5, hcol: HAZE, make: (d, s) => (s % 3 ? bush(1 + Math.round(d * 2), s, P.olive) : cottonwood(8 + Math.round(d * 10), s, null)) });
    // les parois proches, dans l'ombre de la gorge
    for (const [a, b, top, foot] of WALLS) {
      const tf = stepped(a, b, top, 36, 14, a + 9);
      wall(Pp, { x0: Math.max(0, a), x1: Math.min(w, b), top: tf, bot: () => foot, R: P.grès, lit: 4.6, band: 10, seed: a + 50, fade: 1.6,
        edge: (x, y) => { const e = x - a, f = b - x; return e < 5 ? 2.2 - e * 0.4 : f < 6 ? -1.6 : 0; } });
      // éboulis au pied : un tablier de blocs qui déborde de part et d'autre
      for (let x = a - 30; x < b + 30; x++) {
        const out = x < a ? (a - x) / 30 : x > b ? (x - b) / 30 : 0;
        const top = Math.round(foot - 14 * (1 - out) ** 1.4 + (vnoise(x / 3, 2, a) - 0.5) * 4);
        for (let y = top; y < foot + 8 - out * 6; y++) {
          const l = 3.6 + (x < (a + b) / 2 ? 1 : 0) + (vnoise(x / 2, y / 2, a + 1) - 0.5) * 3 + (y === top ? 1.4 : 0) - (y - top) * 0.05;
          Pp.set(x, y, pick(P.talus, l, x, y));
        }
      }
    }
    // la maison troglodyte, dans une alcôve de la paroi du milieu
    const ax = 404, ay = 92;
    for (let y = -8; y <= 7; y++) for (let x = -22; x <= 22; x++) {
      const d = (x * x) / 484 + (y * y) / (y < 0 ? 64 : 49);
      if (d <= 1) Pp.set(ax + x, ay + y, pick(P.grès, d > 0.75 ? 2 : y < -2 ? 1 : 1.6, ax + x, ay + y));
    }
    for (const [x, y, bw, bh] of [[-14, 1, 10, 6], [-3, -2, 8, 9], [6, 2, 9, 5]]) {
      for (let j = 0; j < bh; j++) for (let i = 0; i < bw; i++) Pp.set(ax + x + i, ay + y + j, pick(ramp('6a4232 8a5a42 a8765a c4946e'), i === 0 || j === 0 ? 3 : 2, ax + x + i, ay + y + j));
    }
    Pp.rect(ax - 1, ay + 1, 2, 3, hex('#1e0e0e')); Pp.rect(ax + 9, ay + 3, 2, 2, hex('#1e0e0e')); Pp.rect(ax - 11, ay + 3, 2, 2, hex('#1e0e0e'));
    // un genévrier accroché à une corniche, des buissons au pied des parois
    juniper(4, 2).blit(Pp, 520, 100); juniper(3, 6).blit(Pp, 120, 64);
    sow(Pp, { y0: 150, y1: 176, n: 24, seed: 74, haze: 0.2, hcol: HAZE, make: (d, s) => [bush(2 + Math.round(d), s, P.sauge), tuft(5 + Math.round(d * 3), s, P.herbe), boulder(3 + Math.round(d * 3), s, P.grès)][s % 3] });
    for (const [x, y, sz, s] of [[210, 166, 9, 1], [486, 160, 12, 2], [60, 172, 7, 3], [612, 170, 8, 4]]) { Pp.shadow(x + 7, y + 1, sz + 4, 3); boulder(sz, s, P.grès).blit(Pp, x, y); }
    cottonwood(46, 5).blit(Pp, 300, 158);
    deadTree(30, 8).blit(Pp, 640, 178);
    // premier plan
    sow(Pp, { y0: 196, y1: H + 4, n: 34, seed: 75, make: (d, s) => [tuft(6 + Math.round(d * 6), s, P.herbe), boulder(3 + Math.round(d * 4), s, P.grès), bush(3, s, P.sauge, hex('#2a2a1e'))][s % 3] });
    skull().blit(Pp, 334, 200);
    Pp.put();
  },
  anim(ctx, t) {
    for (let i = 0; i < 3; i++) { // petits cailloux qui roulent de la paroi
      const k = ((t / 1800 + i * 0.37) % 1);
      if (k < 0.45) R(ctx, [150, 420, 600][i] + Math.round(k * 8), Math.round(60 + k * 210), 2, 2, '#6a2a18');
    }
    S.vulture(ctx, Math.round(300 + Math.sin(t / 1800) * 120), 30 + Math.round(Math.cos(t / 1400) * 3), t);
  },
};
