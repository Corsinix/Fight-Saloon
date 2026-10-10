// Le désert ouvert : chaîne lointaine délavée, buttes de Monument Valley sur leurs éboulis, saline pâle à l'horizon,
// sol de sable rouge piqueté de buissons, saguaros, ocotillos, chollas et oponces, piste aux ornières.
// (Générique, légende des trois croix, chevauchée, salines.) Tout est peint une fois (kit-nature.js).
import { H } from '../../worlds.js';
import {
  P, Pix, hex, ramp, pick, vnoise, fbm, butte, range, ground, pebbles, ruts, sow,
  saguaro, ocotillo, cholla, pear, bush, tuft, boulder, skull, juniper,
} from './kit-nature.js';

const HZ = 128;
const HAZE = hex('#e2bcae'); // brume de chaleur : les lointains tirent vers ce rose pâle
const LOIN = ramp('8a6e8a 9a7c94 aa8a9c b89aa4 c6a8ac d2b6b2');

export default {
  w: 768, horizon: HZ, ground: 186, outdoor: true,
  far: [
    // la chaîne du fond, mauve et sans détail
    { k: 0.08, draw(g, w) {
      const Pp = new Pix(g);
      range(Pp, { base: HZ + 1, top: (x) => HZ - 6 - fbm(x / 70, 0.5, 4, 4) * 22 - Math.max(0, Math.sin(x / 61) * 6), R: LOIN, l0: 3.2, k: 3, seed: 4 });
      Pp.put();
    } },
    // mesas plates et petites buttes, très loin
    { k: 0.22, draw(g, w) {
      const Pp = new Pix(g);
      for (const [cx, cw, ch, tw, th, s] of [[30, 70, 8, 52, 5, 1], [150, 26, 16, 30, 6, 2], [330, 110, 9, 76, 5, 3], [420, 18, 14, 22, 5, 5]]) {
        butte(Pp, { cx, base: HZ + 1, cw, ch, tw, th, haze: 0.58, hcol: HAZE, seed: s });
      }
      Pp.put();
    } },
    // les grandes buttes, à mi-distance
    { k: 0.45, draw(g, w) {
      const Pp = new Pix(g);
      // la « mitaine » : un chapeau et son pouce
      butte(Pp, { cx: 96, base: HZ + 1, cw: 46, ch: 36, tw: 82, th: 18, haze: 0.18, hcol: HAZE, seed: 11,
        tops: (x) => (x > 112 && x < 118 ? -8 - Math.round(vnoise(x, 1, 3) * 3) : x >= 108 && x <= 112 ? 4 : Math.round((vnoise(x / 3, 7, 11) - 0.5) * 3)) });
      butte(Pp, { cx: 300, base: HZ + 1, cw: 92, ch: 22, tw: 104, th: 14, haze: 0.24, hcol: HAZE, seed: 12 });
      butte(Pp, { cx: 470, base: HZ + 1, cw: 30, ch: 42, tw: 52, th: 16, haze: 0.2, hcol: HAZE, seed: 13 });
      // genévriers et buissons au pied, minuscules
      sow(Pp, { y0: HZ - 2, y1: HZ + 1, n: 70, seed: 14, haze: 0.3, hcol: HAZE, make: (d, s) => bush(1, s, P.olive) });
      Pp.put();
    } },
  ],
  back(g, w) {
    const Pp = new Pix(g);
    ground(Pp, { y0: HZ, y1: H, R: P.sable, lf: 7.6, ln: 4.6, amp: 1.8, seed: 21 });
    // la saline : une nappe blanche qui tremble à l'horizon
    for (let x = 0; x < w; x++) {
      const on = Math.sin(x / 83) + Math.sin(x / 31) * 0.4;
      if (on < 0.35) continue;
      const hh = Math.round((on - 0.35) * 3.2);
      for (let y = HZ + 1; y < HZ + 2 + hh; y++) Pp.set(x, y, pick(ramp('d4b0a0 e2c8b8 eedcd0 f6ece4'), 2.4 + vnoise(x / 4, y, 2) * 1.4 - (y - HZ) * 0.3, x, y));
    }
    // ondulations du terrain : petites croupes plus claires côté soleil
    for (let x = 0; x < w; x++) {
      const y = Math.round(150 + Math.sin(x / 57) * 4 + Math.sin(x / 23) * 2);
      if (Math.sin(x / 57) > 0.2) for (let k = 0; k < 3; k++) Pp.set(x, y + k, pick(P.sable, 7.4 - k, x, y + k));
    }
    pebbles(Pp, { y0: HZ + 4, n: w * 1.3, R: P.sable, seed: 22, grass: 0.25 });
    // la piste : deux ornières qui ondulent
    const path = (x) => 172 + Math.sin(x / 110) * 6 + Math.sin(x / 41) * 1.5;
    ruts(Pp, 0, w, path, () => 9, P.sable, 2.2);
    for (let x = 0; x < w; x++) { const y = Math.round(path(x)) + 3; for (let k = 0; k < 4; k++) if (vnoise(x / 3, k, 9) > 0.45) Pp.set(x, y + k, pick(P.sable, 6.6, x, y + k)); }
    // végétation lointaine (buissons-points), puis à mi-distance
    sow(Pp, { y0: HZ + 2, y1: 150, n: 220, seed: 23, haze: 0.45, hcol: HAZE, make: (d, s) => bush(d < 0.5 ? 1 : 2, s, d < 0.6 ? P.olive : P.sauge) });
    sow(Pp, { y0: 140, y1: 166, n: 26, seed: 24, haze: 0.3, hcol: HAZE, make: (d, s) => [saguaro(18 + Math.round(d * 22 + (s % 9)), s, hex('#3a2422')), ocotillo(14 + Math.round(d * 14), s), cholla(6 + Math.round(d * 5), s, null), bush(2 + Math.round(d), s)][s % 4] });
    // les grands saguaros, derrière la piste
    for (const [x, h, s] of [[54, 52, 3], [236, 40, 8], [418, 58, 5], [586, 44, 2], [712, 36, 9]]) {
      const y = Math.round(path(x)) - 6;
      Pp.shadow(x + 6, y, 8, 2);
      saguaro(h, s).blit(Pp, x, y);
    }
    for (const [x, s] of [[150, 1], [516, 4], [660, 7]]) ocotillo(30, s, null).blit(Pp, x, Math.round(path(x)) - 4);
    for (const [x, s] of [[300, 3], [468, 6], [640, 2], [110, 8]]) { const y = Math.round(path(x)) - 3; Pp.shadow(x + 3, y, 6, 2); cholla(12, s).blit(Pp, x, y); }
    // premier plan : buissons, oponces, rochers, touffes d'herbe et de yucca
    sow(Pp, { y0: 192, y1: H + 4, n: 46, seed: 25, make: (d, s) => [bush(3 + Math.round(d * 2), s, P.sauge, hex('#2a2a1e')), tuft(5 + Math.round(d * 6), s, P.herbe), tuft(6 + Math.round(d * 5), s, P.olive, null, true), boulder(3 + Math.round(d * 3), s, P.sable)][s % 4] });
    for (const [x, y, sz, s] of [[22, 210, 5, 1], [348, 214, 6, 2], [560, 208, 5, 4], [740, 212, 6, 6]]) { Pp.shadow(x + 6, y, sz * 2, 2); pear(sz, s).blit(Pp, x, y); }
    for (const [x, y, sz, s] of [[188, 207, 7, 3], [610, 213, 9, 5]]) { Pp.shadow(x + 5, y + 1, sz + 4, 3); boulder(sz, s, P.sable).blit(Pp, x, y); }
    juniper(4, 3).blit(Pp, 264, 162);
    skull().blit(Pp, 384, 200);
    Pp.put();
  },
};
