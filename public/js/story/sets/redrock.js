// Red Rock : les grandes buttes et les aiguilles de grès rouge (Sedona, Monument Valley), la ville d'adobe et de
// planches au bout de la ligne, la voie ferrée et ses poteaux télégraphiques, la lice de l'hippodrome.
// fx 'train' : le train entre en gare (rail : y 157) ; cross : la deuxième croix, plantée dans son cairn.
import * as S from '../../sprites.js';
import { canvasText } from '../../scene.js';
import { H } from '../../worlds.js';
import { R, O, train } from './kit.js';
import {
  P, Pix, hex, ramp, pick, vnoise, fbm, butte, range, ground, pebbles, sow,
  bush, tuft, boulder, juniper, pear, deadTree,
} from './kit-nature.js';

const HZ = 138;
const HAZE = hex('#dcb0a4');
const LOIN = ramp('8a6a84 9a788e a88696 b69498 c4a2a0 d0b0a8');
const RAIL = 157;

// aiguilles de Sedona : plusieurs colonnes serrées aux sommets arrondis (décalage du sommet selon x)
const spires = (cols) => (x) => {
  let best = 40;
  for (const [cx, hw, dh] of cols) { const d = Math.abs(x - cx); if (d <= hw) best = Math.min(best, dh + Math.round((d / hw) ** 2 * 4)); }
  return best;
};

export default {
  w: 680, horizon: HZ, ground: 186, outdoor: true, cross: [210, 160],
  far: [
    { k: 0.12, draw(g, w) {
      const Pp = new Pix(g);
      range(Pp, { base: HZ + 1, top: (x) => HZ - 4 - fbm(x / 60, 0.5, 17, 3) * 14, R: LOIN, l0: 3.4, k: 3, seed: 17 });
      for (const [cx, cw, ch, tw, s] of [[60, 80, 10, 60, 1], [250, 40, 18, 40, 2], [390, 90, 12, 64, 3]]) butte(Pp, { cx, base: HZ + 1, cw, ch, tw, th: 6, haze: 0.55, hcol: HAZE, seed: s });
      Pp.put();
    } },
    // les buttes géantes : la butte ronde, la cathédrale d'aiguilles, la grande mesa, la tour, la table
    { k: 0.35, draw(g, w) {
      const Pp = new Pix(g);
      butte(Pp, { cx: 44, base: HZ + 1, cw: 56, ch: 60, tw: 76, th: 26, haze: 0.12, hcol: HAZE, seed: 21 });
      butte(Pp, { cx: 156, base: HZ + 1, cw: 58, ch: 70, tw: 66, th: 30, haze: 0.1, hcol: HAZE, seed: 22,
        tops: spires([[133, 6, 8], [145, 5, 0], [157, 6, 12], [170, 6, 3], [183, 5, 20]]) });
      butte(Pp, { cx: 268, base: HZ + 1, cw: 120, ch: 38, tw: 96, th: 22, haze: 0.16, hcol: HAZE, seed: 23 });
      butte(Pp, { cx: 404, base: HZ + 1, cw: 38, ch: 74, tw: 58, th: 24, haze: 0.1, hcol: HAZE, seed: 24,
        tops: spires([[395, 8, 0], [413, 7, 10]]) });
      butte(Pp, { cx: 474, base: HZ + 1, cw: 64, ch: 30, tw: 60, th: 18, haze: 0.2, hcol: HAZE, seed: 25 });
      // genévriers sur les éboulis
      sow(Pp, { y0: HZ - 22, y1: HZ, n: 160, seed: 26, make: (d, s, x, y) => (Pp.get(x, y - 5) >>> 24 && Pp.get(x - 4, y - 3) >>> 24 && Pp.get(x + 4, y - 3) >>> 24 ? bush(1, s, P.pin) : null) });
      Pp.put();
    } },
  ],
  back(g, w) {
    const Pp = new Pix(g);
    ground(Pp, { y0: HZ, y1: H, R: P.sable, lf: 7.2, ln: 4.4, amp: 1.8, seed: 31 });
    pebbles(Pp, { y0: HZ + 3, n: w * 1.2, R: P.sable, seed: 32, grass: 0.3 });
    // genévriers et buissons au loin, derrière la ville
    sow(Pp, { y0: HZ + 1, y1: 150, n: 140, seed: 33, haze: 0.4, hcol: HAZE, make: (d, s) => bush(1 + Math.round(d), s, s % 3 ? P.pin : P.sauge) });
    // le ballast de la voie
    for (let x = 0; x < w; x++) for (let y = RAIL - 2; y < RAIL + 6; y++) {
      const e = y < RAIL || y > RAIL + 3 ? 0.55 : 1;
      if (vnoise(x / 2, y, 5) < e) Pp.set(x, y, pick(ramp('5a4038 76564a 94705e b08a74 c8a48a'), 2 + vnoise(x, y * 3, 6) * 2.4 - (y > RAIL + 3 ? 1 : 0), x, y));
    }
    Pp.put();
    // traverses et rails
    for (let x = 0; x < w; x += 6) { R(g, x, RAIL - 1, 4, 5, '#4a2c1a'); R(g, x, RAIL - 1, 4, 1, '#6a4428'); }
    R(g, 0, RAIL, w, 1, '#a8acb4'); R(g, 0, RAIL + 1, w, 1, '#4a4c54');
    R(g, 0, RAIL + 3, w, 1, '#a8acb4'); R(g, 0, RAIL + 4, w, 1, '#4a4c54');
    // la ville au loin : adobe ocre aux poutres saillantes, façades de planches, église, château d'eau
    const town = [
      [300, 22, 13, 'a'], [324, 30, 18, 'f'], [356, 20, 11, 'a'], [378, 26, 22, 'c'], [406, 34, 16, 'f'], [442, 22, 12, 'a'],
      [466, 28, 20, 'f'], [496, 16, 26, 'e'], [514, 30, 14, 'a'], [546, 18, 17, 'f'],
    ];
    const BASE = 147;
    for (const [x, bw, bh, k] of town) {
      if (k === 'a') { // adobe : toit plat, vigas, porte sombre
        O(g, x, BASE, [[0, -bh, bw, bh, '#c89670']]);
        R(g, x, BASE - bh, bw, 1, '#e0b48a'); R(g, x + bw - 3, BASE - bh, 3, bh, '#a8764e');
        for (let p = 3; p < bw - 2; p += 5) R(g, x + p, BASE - bh + 2, 2, 1, '#4a2a18');
        R(g, x + 4, BASE - 6, 3, 6, '#3a2018'); R(g, x + bw - 10, BASE - bh + 5, 3, 3, '#3a2a2a');
      } else if (k === 'f') { // fausse façade de planches et auvent
        O(g, x, BASE, [[0, -bh, bw, bh, '#8a5a3a'], [2, -bh - 4, bw - 4, 4, '#8a5a3a']]);
        for (let p = x + 2; p < x + bw; p += 3) R(g, p, BASE - bh - 3, 1, bh + 3, '#7a4e32');
        R(g, x + 2, BASE - bh - 4, bw - 4, 1, '#a87650');
        R(g, x - 1, BASE - 8, bw + 2, 2, '#5a3a24'); R(g, x + 1, BASE - 6, 1, 6, '#5a3a24'); R(g, x + bw - 2, BASE - 6, 1, 6, '#5a3a24');
        R(g, x + 4, BASE - bh + 3, 4, 3, '#2a2a30'); R(g, x + bw - 8, BASE - bh + 3, 4, 3, '#2a2a30');
      } else if (k === 'c') { // l'église et son clocher
        O(g, x, BASE, [[0, -bh, bw, bh, '#d8c0a0'], [bw / 2 - 4, -bh - 10, 8, 10, '#d8c0a0']]);
        R(g, x + bw / 2 - 1, BASE - bh - 15, 2, 5, '#5a3a24'); R(g, x + bw / 2 - 3, BASE - bh - 13, 6, 1, '#5a3a24');
        R(g, x + bw / 2 - 2, BASE - bh - 7, 4, 4, '#3a2a2a'); R(g, x + bw / 2 - 3, BASE - 8, 6, 8, '#4a2a18');
        R(g, x + bw - 4, BASE - bh, 4, bh, '#b89e80');
      } else { // le château d'eau sur pilotis
        O(g, x, BASE, [[1, -bh + 9, 2, bh - 9, '#5a3a24'], [bw - 3, -bh + 9, 2, bh - 9, '#5a3a24'], [0, -bh, bw, 10, '#7a5232'], [-1, -bh - 2, bw + 2, 2, '#5a3a24']]);
        for (let p = x + 2; p < x + bw; p += 3) R(g, p, BASE - bh, 1, 10, '#6a4428');
        R(g, x, BASE - bh + 3, bw, 1, '#3a3a42');
      }
    }
    // l'arche de l'entrée de la ville
    O(g, 418, 120, [[0, 0, 2, 27, '#5a3a22'], [60, 0, 2, 27, '#5a3a22'], [-2, 0, 66, 9, '#8a6038']]);
    R(g, 416, 120, 66, 1, '#b08458');
    canvasText(g, 'RED ROCK', 449, 121, { color: '#f0dca0', shadow: '' });
    // poteaux télégraphiques le long de la voie, de plus en plus petits vers la gauche
    for (let x = 18; x < w; x += 72) {
      O(g, x, RAIL - 2, [[0, -26, 2, 26, '#5a3a24'], [-4, -24, 10, 2, '#5a3a24']]);
      R(g, x, RAIL - 28, 1, 26, '#7a5232');
    }
    for (let x = 18; x < w - 72; x += 72) for (let k = 0; k < 72; k++) R(g, x + 1 + k, RAIL - 27 + Math.round(Math.sin((k / 72) * Math.PI) * 3), 1, 1, '#2a2020');
    // la lice blanche de l'hippodrome
    R(g, 560, 165, w - 560, 1, '#2a2020'); R(g, 560, 166, w - 560, 2, '#f4f0e4'); R(g, 560, 168, w - 560, 1, '#b8b2a4');
    for (let x = 562; x < w; x += 14) O(g, x, 177, [[0, -11, 2, 11, '#e8e4d8']]);

    const Q = new Pix(g);
    // végétation à mi-distance (entre la voie et les acteurs)
    sow(Q, { y0: 164, y1: 178, n: 22, seed: 34, haze: 0.25, hcol: HAZE, avoid: (x) => x > 196 && x < 228, make: (d, s) => [juniper(3 + Math.round(d * 2), s), bush(2 + Math.round(d), s), tuft(5 + Math.round(d * 3), s, P.olive, null, true), pear(2 + Math.round(d), s)][s % 4] });
    // le cairn de la deuxième croix et son gros rocher
    Q.shadow(194, 163, 14, 3); boulder(10, 3, P.grès).blit(Q, 188, 162);
    for (const [x, y, sz] of [[204, 162, 3], [216, 162, 3], [210, 161, 2], [207, 158, 2], [214, 159, 2]]) boulder(sz, x + y, P.grès).blit(Q, x, y);
    juniper(5, 7).blit(Q, 70, 172); juniper(4, 9).blit(Q, 612, 170);
    deadTree(28, 4).blit(Q, 640, 174);
    // premier plan : rochers rouges, touffes d'herbe et de yucca, oponces
    sow(Q, { y0: 194, y1: H + 4, n: 40, seed: 35, make: (d, s) => [tuft(6 + Math.round(d * 6), s, P.herbe), boulder(3 + Math.round(d * 4), s, P.grès), tuft(7 + Math.round(d * 4), s, P.olive, null, true), bush(3, s, P.sauge, hex('#2a2a1e'))][s % 4] });
    for (const [x, y, sz, s] of [[34, 212, 11, 2], [330, 216, 8, 5], [520, 210, 10, 8]]) { Q.shadow(x + 7, y + 1, sz + 5, 3); boulder(sz, s, P.grès).blit(Q, x, y); }
    pear(5, 3).blit(Q, 116, 206); pear(4, 9).blit(Q, 456, 212);
    Q.put();
  },
  anim(ctx, t, fx, el, lt) {
    S.vulture(ctx, Math.round(260 + Math.sin(t / 2100) * 90), Math.round(58 + Math.cos(t / 1300) * 6), t);
    if (fx.has('train')) train(ctx, Math.round(250 - 520 * (1 - Math.min(1, (lt || 0) / 4200)) ** 2), RAIL, t, (lt || 0) < 4200);
  },
};
