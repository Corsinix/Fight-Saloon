// La gare de Red Rock, la nuit : la station en planches et couvre-joints peinte sang-de-bœuf (d'après les gares de
// Gold Hill et de Cle Elum), son grand avant-toit sur consoles qui abrite le quai, l'avancée vitrée du télégraphe
// sous la lucarne au nom de la ville, le château d'eau, le sémaphore, les rails, la piste de terre devant.
// Les acteurs du quai : y ≈ 163 ; les cavaliers sur la piste : y par défaut 190. fx 'lettre' : la lettre d'El Diablo
// clouée par un poignard au poteau de l'avant-toit (x 383).
import * as S from '../../sprites.js';
import { H } from '../../worlds.js';
import { O, bands, smoke, halo, farMesas, mesa, lantern } from './kit.js';
import {
  OUT, R, rnd, signboard, poster, crate, sack, barrel, telePole, wire, tuft,
  depot, platform, tracks, waterTower, semaphore, baggageCart, milkCan,
} from './kit-ville.js';

const BASE = 150, EAVE = 76;
const LAMPS = [[150, EAVE + 8], [292, EAVE + 8]];
const CHIMNEY = 330;

export default {
  w: 640, horizon: 128, ground: 190, outdoor: true,
  far: [
    { k: 0.3, draw: (g, w) => farMesas(g, w, 128, ['#9a5a48', '#8a4a3a', '#a86a54'], 19) },
    { k: 0.55, draw(g, w) { // les buttes rouges plus proches, et les toits de Red Rock au loin
      mesa(g, 30, 132, 120, 30, '#8a4436', '#a05442', 4); mesa(g, 420, 132, 150, 38, '#7e3e32', '#965040', 8); mesa(g, 250, 132, 70, 18, '#8a4a3a', null, 6);
      R(g, 0, 130, w, 6, '#7a4a38');
      const r = rnd(5);
      for (let x = 160; x < 300; x += 12 + Math.floor(r() * 10)) { const h = 6 + Math.floor(r() * 8); R(g, x, 131 - h, 9, h, '#6a3e30'); R(g, x + 2, 133 - h + 3, 2, 2, '#4a2a22'); }
    } },
  ],
  back(g, w) {
    bands(g, 0, 128, w, 24, ['#8a5a40', '#946448', '#9e6e50']);
    const r = rnd(29);
    for (let i = 0; i < w * 0.3; i++) R(g, Math.floor(r() * w), 130 + Math.floor(r() * 20), 1, 1, r() < 0.5 ? '#a87a58' : '#7a4a34');
    for (let x = 4; x < w; x += 26 + Math.floor(r() * 40)) tuft(g, x, 150, '#8a7a48');
    // le château d'eau et le sémaphore au bout du quai, les poteaux du télégraphe
    waterTower(g, 492, 38, 152);
    semaphore(g, 440, 152, 100);
    const pts = [40, 470, 620].map((px) => telePole(g, px, 152, 98));
    for (let i = 0; i < 2; i++) for (const k of [0, 3]) wire(g, pts[i][k][0], pts[i][k][1], pts[i + 1][k][0], pts[i + 1][k][1], 8, '#3a2618');
    for (const k of [0, 3]) wire(g, -4, pts[0][k][1] + 4, pts[0][k][0], pts[0][k][1], 2, '#3a2618');
    // la station
    this.wins = depot(g, {
      x0: 104, x1: 372, base: BASE, eave: EAVE, roofTop: 40, col: '#8a3428', trim: '#e4d8bc', roof: '#3e3432',
      name: 'RED ROCK', bay: [214, 44], door: 162, windows: [124, 272], freight: 322, chimney: CHIMNEY,
      over: [14, 30], posts: [381], brackets: 32, seed: 7,
    });
    signboard(g, 236, EAVE + 7, 'GUICHET', { bg: '#2a2622', fg: '#f0dca0', frame: '#8a7a5a', h: 9, pad: 2 });
    poster(g, 192, 108, 12, 16, '#eadcb0', false); // l'horaire
    poster(g, 292, 108, 12, 15, '#d8c48a');          // un avis de recherche
    poster(g, 306, 112, 10, 13, '#e0cc98');
    for (const [lx, ly] of LAMPS) { R(g, lx, EAVE + 4, 1, ly - EAVE - 4, OUT); lantern(g, lx, ly); }
    // le quai, les rails, la piste
    platform(g, 0, w, BASE, 3);
    tracks(g, 0, w, BASE + 22, 3);
    const y0 = BASE + 33;
    bands(g, 0, y0, w, H - y0, ['#86503a', '#925a40', '#9a6244', '#a26a4a']);
    for (let i = 0; i < w * 0.6; i++) R(g, Math.floor(r() * w), y0 + 1 + Math.floor(r() * (H - y0 - 1)), r() < 0.3 ? 2 : 1, 1, r() < 0.5 ? '#b47a56' : '#5a3020');
    for (const yy of [196, 200]) for (let x = 0; x < w; x += 2) if (r() < 0.7) R(g, x, yy + Math.round(Math.sin(x / 70) * 1.2), 2, 1, '#7a4430');
    for (let x = 10; x < w; x += 40 + Math.floor(r() * 60)) tuft(g, x, y0 + 4, '#8a7a48');
    // caisses, sacs de courrier, chariot à bagages, bidons
    crate(g, 386, BASE + 4, 18); crate(g, 388, BASE - 14, 14, '#9a6a34');
    baggageCart(g, 406, BASE + 6);
    sack(g, 60, BASE + 5); sack(g, 72, BASE + 6, '#b8a078'); sack(g, 64, BASE - 6, '#d0bc94');
    milkCan(g, 96, BASE + 6); milkCan(g, 86, BASE + 7);
    barrel(g, 360, BASE + 6, '#7a4a24', 20);
  },
  props: [
    { // le banc du quai, devant l'avancée du télégraphe
      y: 160, x: 236, w: 48, h: 22, oy: 20,
      draw(g) {
        O(g, 2, 8, [[0, 0, 44, 3, '#8a5a34'], [0, -6, 44, 3, '#7a4a2a'], [2, -6, 2, 6, '#5a3420'], [40, -6, 2, 6, '#5a3420'], [2, 3, 3, 9, '#5a3420'], [39, 3, 3, 9, '#5a3420']]);
        R(g, 2, 8, 44, 1, '#b07a48'); R(g, 2, 2, 44, 1, '#a06a3a');
      },
    },
  ],
  lights() { return [...(this.wins || []), ...LAMPS.map(([x, y]) => [x + 1, y + 4, 16]), [441, 48, 6]]; },
  anim(ctx, t, fx) {
    smoke(ctx, CHIMNEY + 4, 26, t, { n: 6, life: 3600, rise: 0.012, drift: 0.006, r0: 2, grow: 0.003, col: '200,190,180', a: 0.35 });
    if (fx.has('lettre')) {
      // le poignard planté dans le poteau de l'avant-toit, la lettre et son cachet de cire noire
      const px = 383, py = 122;
      O(ctx, px - 4, py, [[0, 0, 11, 8, '#f0e6cc']]);
      R(ctx, px - 3, py + 1, 9, 1, '#d8cca8'); R(ctx, px, py + 3, 3, 3, '#1a1012'); R(ctx, px + 1, py + 4, 1, 1, '#9a2a1c');
      O(ctx, px + 1, py - 6, [[0, 0, 2, 9, '#c8ccd4']]); R(ctx, px, py - 9, 4, 3, '#5a3a22'); R(ctx, px - 1, py - 6, 6, 1, '#8a8f98');
    }
  },
  glow(ctx, t) {
    for (const [lx, ly] of LAMPS) halo(ctx, lx + 1, ly + 4, 30, '255,190,100', 0.75 + 0.12 * Math.sin(t / 90 + lx));
    halo(ctx, 441, 48, 10, '255,200,110', 0.5);
  },
};
