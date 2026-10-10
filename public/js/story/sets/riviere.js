// La rivière (le chapeau d'El Diablo y dérive : fx 'chapeau', vers y 150) : falaises rouges au loin, rive d'en face
// plantée de peupliers et de saules, eau qui reflète la rive (bande sombre) puis le ciel (bande claire), rochers
// et remous, grève de galets au premier plan avec roseaux, massettes et bois flotté.
import { H } from '../../worlds.js';
import { R, O } from './kit.js';
import {
  P, Pix, hex, ramp, pick, vnoise, fbm, butte, range, ground, pebbles, sow,
  bush, tuft, boulder, cottonwood, reeds,
} from './kit-nature.js';

const HZ = 118;
const BANK = 133; // bord de l'eau, côté rive d'en face
const SHORE = 170; // bord de l'eau, de notre côté
const HAZE = hex('#d4b0b0');
const LOIN = ramp('7e6a86 8c7690 9c8498 ac929e baa0a4 c8aeaa');
const GALET = ramp('3a3430 524a42 6a6056 847868 9c907e b4a894 cac0ac');
const CIEL = ramp('5a86a4 7aa0b8 9cbccc c0d4d8 e0e4d8 f2ecd8');
const RIVE = ramp('1c2010 283016 36401a 465222 58642a 6c7634 848a42 a0a256 bcb872'); // feuillage des peupliers, vert olive doré

export default {
  w: 480, horizon: HZ, ground: 190, outdoor: true,
  far: [
    { k: 0.12, draw(g, w) {
      const Pp = new Pix(g);
      range(Pp, { base: HZ + 2, top: (x) => HZ - 8 - fbm(x / 50, 0.5, 37, 3) * 18, R: LOIN, l0: 3, k: 3, seed: 37 });
      Pp.put();
    } },
    { k: 0.3, draw(g, w) {
      const Pp = new Pix(g);
      butte(Pp, { cx: 70, base: HZ + 2, cw: 84, ch: 22, tw: 74, th: 12, haze: 0.32, hcol: HAZE, seed: 38 });
      butte(Pp, { cx: 330, base: HZ + 2, cw: 44, ch: 30, tw: 54, th: 12, haze: 0.3, hcol: HAZE, seed: 39 });
      butte(Pp, { cx: 430, base: HZ + 2, cw: 70, ch: 14, tw: 56, th: 9, haze: 0.4, hcol: HAZE, seed: 40 });
      sow(Pp, { y0: HZ - 3, y1: HZ + 2, n: 60, seed: 41, haze: 0.35, hcol: HAZE, make: (d, s) => bush(1, s, P.pin) });
      Pp.put();
    } },
  ],
  back(g, w) {
    const Pp = new Pix(g);
    // la rive d'en face : grève et herbe sèche
    ground(Pp, { y0: HZ, y1: BANK, R: P.terre, lf: 7.4, ln: 6, amp: 1.4, seed: 51 });
    // l'eau : reflet sombre de la rive, puis le ciel, puis le bleu profond de notre côté
    for (let y = BANK; y < SHORE; y++) {
      const d = (y - BANK) / (SHORE - BANK);
      for (let x = 0; x < w; x++) {
        const ripple = Math.sin(x / 9 + y * 1.7) * 0.5 + (vnoise(x / 14, y / 2, 52) - 0.5) * 1.6;
        let c;
        if (d < 0.22 + Math.sin(x / 23) * 0.05) c = pick(P.eau, 1.6 + ripple * 0.6 + d * 6, x, y); // reflet de la rive
        else if (d < 0.6) c = pick(CIEL, 3.8 - (d - 0.22) * 6 + ripple, x, y); // reflet du ciel
        else c = pick(P.eau, 4.6 - (d - 0.6) * 4 + ripple, x, y);
        Pp.set(x, y, c);
      }
    }
    // reflets des peupliers d'en face, brisés par les rides
    for (const x0 of [30, 132, 238, 300, 410]) for (let y = BANK + 1; y < BANK + 16; y++) for (let x = x0 - 10; x < x0 + 12; x++) {
      if (vnoise(x / 3, y, 53) > 0.45 && ((y - BANK) & 1) === 0) Pp.set(x + Math.round(Math.sin(y) * 2), y, pick(P.feuille, 1.2 + vnoise(x, y, 4), x, y));
    }
    // la grève de notre côté : sable mouillé, puis galets
    ground(Pp, { y0: SHORE, y1: H, R: GALET, lf: 3.4, ln: 4.4, amp: 2, seed: 54 });
    for (let x = 0; x < w; x++) {
      const e = SHORE + Math.round(Math.sin(x / 31) * 1.5);
      for (let y = SHORE - 2; y < e + 3; y++) Pp.set(x, y, y < e ? pick(P.eau, 6.5 - (e - y), x, y) : pick(GALET, 1.6 + (y - e) * 0.4, x, y)); // l'écume au bord, le sable mouillé
    }
    // galets ronds de la grève
    sow(Pp, { y0: SHORE + 4, y1: H + 2, n: 70, seed: 55, make: (d, s) => boulder(1 + Math.round(d * 2.2), s, GALET, GALET[0]) });
    pebbles(Pp, { y0: SHORE + 3, n: 500, R: GALET, seed: 56, grass: 0.25 });
    // rochers dans le courant, avec leur remous (l'eau vient de la gauche)
    for (const [x, y, sz, s] of [[48, 158, 6, 1], [214, 152, 8, 2], [388, 160, 5, 3], [150, 142, 3, 4], [330, 140, 3, 5]]) {
      boulder(sz, s, GALET, hex('#1e2a30')).blit(Pp, x, y);
      for (let k = 0; k < sz + 3; k++) { Pp.set(x - sz - 3 + k, y - 1 + (k & 1), hex('#e8f0f0')); Pp.set(x + sz + 2 + k * 2, y + (k % 3), hex('#c8dce0')); }
    }
    // peupliers et saules de la rive d'en face, roseaux au bord
    for (const [x, h, s] of [[30, 40, 1], [70, 26, 2], [132, 46, 3], [238, 34, 4], [300, 42, 5], [356, 24, 6], [410, 38, 7], [470, 30, 8]]) {
      cottonwood(h, s, hex('#1a2410'), RIVE).blit(Pp, x, BANK - 2);
    }
    // saulaie : un cordon de buissons serrés le long de l'eau, roseaux devant
    sow(Pp, { y0: BANK - 3, y1: BANK, n: 90, seed: 59, make: (d, s) => bush(2 + (s % 3), s, s % 2 ? RIVE : P.feuille, hex('#1a2410')) });
    sow(Pp, { y0: BANK - 1, y1: BANK + 2, n: 40, seed: 57, make: (d, s) => reeds(5 + (s % 5), s) });
    Pp.put();
    // bois flotté échoué sur la grève : un tronc blanchi, ses racines
    O(g, 290, 197, [[0, -5, 46, 5, '#9a8a74'], [44, -8, 3, 8, '#9a8a74'], [47, -10, 2, 3, '#9a8a74'], [44, -2, 6, 2, '#9a8a74'], [12, -8, 2, 3, '#9a8a74']]);
    R(g, 290, 192, 46, 1, '#c8baa0'); R(g, 290, 196, 46, 1, '#6a5c4a'); R(g, 300, 194, 2, 1, '#5a4c3e'); R(g, 318, 194, 3, 1, '#5a4c3e');
    R(g, 292, 198, 50, 1, 'rgba(30,20,16,0.35)');
    const Q = new Pix(g);
    // roseaux et massettes de notre côté, touffes au premier plan
    for (const [x, h, s] of [[8, 24, 1], [118, 14, 2], [196, 18, 3], [452, 26, 4], [376, 12, 5]]) reeds(h, s).blit(Q, x, SHORE + 6 + (s % 3) * 3);
    sow(Q, { y0: 196, y1: H + 4, n: 26, seed: 58, make: (d, s) => [tuft(6 + Math.round(d * 6), s, P.herbe), tuft(6 + Math.round(d * 5), s, P.olive), bush(3, s, P.sauge, hex('#2a2a1e'))][s % 3] });
    Q.put();
  },
  anim(ctx, t, fx, el, lt) {
    for (let i = 0; i < 30; i++) { // reflets qui filent avec le courant
      const x = ((i * 53 + t * 0.03) % 500) - 10, y = BANK + 4 + (i % 7) * 5;
      R(ctx, x, y, 4 + (i % 3) * 3, 1, i % 4 ? 'rgba(220,236,244,0.5)' : 'rgba(255,250,230,0.7)');
    }
    if (fx.has('chapeau')) {
      const x = Math.round(-30 + (lt || 0) * 0.035), y = 150 + Math.round(Math.sin((lt || 0) / 400) * 1.5);
      // le sombrero d'El Diablo, retourné par le courant
      O(ctx, x, y, [[-16, 0, 34, 3, '#2a2622'], [-6, -8, 14, 8, '#2a2622'], [-4, -10, 10, 2, '#2a2622']]);
      for (let k = -15; k < 17; k += 3) R(ctx, x + k, y + 1, 1, 1, '#e0b040');
      R(ctx, x - 6, y - 3, 14, 1, '#e0b040');
      R(ctx, x - 20, y + 3, 42, 1, 'rgba(200,220,240,0.5)');
      R(ctx, x - 26 - Math.round(Math.sin((lt || 0) / 300) * 2), y + 5, 12, 1, 'rgba(200,220,240,0.35)');
    }
  },
};
