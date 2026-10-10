// Le quai de la gare de Dusty Gulch, la nuit : la petite station ocre à gauche (planches et couvre-joints, avant-toit
// sur consoles, lucarne au nom de la ville), le quai, les rails ; au bout du quai, de l'autre côté de la plaine, la
// ville et sa grand-rue (fausses façades, fronton du saloon, château d'eau, clocher, éolienne ; fenêtres éclairées),
// plus pâle parce que lointaine. Les acteurs sont sur le quai (sol : 163).
// fx 'brasier' : la ville en flammes (feux sur les toits, colonnes de fumée, ciel rougi), qui gagne pendant 2 s.
import * as S from '../../sprites.js';
import { H } from '../../worlds.js';
import { bands, flames, smoke, halo, farMesas, lantern } from './kit.js';
import { OUT, R, rnd, hash, shadow, poster, sack, tuft, depot, platform, tracks, baggageCart, milkCan } from './kit-ville.js';

const BASE = 150, EAVE = 78;
const LAMPS = [[72, EAVE + 8], [164, EAVE + 8]];
const TB = 147; // pied de la ville lointaine
// la ville au loin : [x, largeur, hauteur, couleur, genre]
const TOWN = [
  [282, 22, 22, '#6a4a34'], [306, 28, 32, '#7a5038'], [336, 40, 44, '#7a3a2a', 'saloon'], [378, 24, 28, '#80604a'],
  [404, 16, 46, '#5a3a24', 'eau'], [424, 30, 36, '#6a4632'], [456, 26, 26, '#8a7a68'], [484, 28, 32, '#6a5040'],
  [514, 30, 28, '#c8bca0', 'eglise'], [550, 10, 52, '#3a2618', 'moulin'],
];
// les feux de la ville (fx 'brasier') : [x, y (pied des flammes), largeur, hauteur, retard, graine]
const FIRES = TOWN.filter((b) => !b[4] || b[4] === 'saloon').map(([x, bw, bh], i) => [x + 2, TB - bh + 2, bw - 4, Math.min(30, 12 + bh * 0.4), [400, 900, 0, 200, 700, 1300, 1000][i % 7], i + 1]);
const haze = (c) => S.mix(c, '#8a6048', 0.3);

export default {
  w: 560, horizon: 128, ground: 163, outdoor: true,
  far: [{ k: 0.3, draw: (g, w) => farMesas(g, w, 128, ['#7a4a3c', '#6a4034', '#865446'], 23) }],
  back(g, w) {
    bands(g, 0, 128, w, 24, ['#6e4632', '#7a5038', '#845a40']);
    const r = rnd(43);
    for (let i = 0; i < w * 0.3; i++) R(g, Math.floor(r() * w), 132 + Math.floor(r() * 18), 1, 1, r() < 0.5 ? '#8a6248' : '#5e3a2a');
    // la ville, au loin
    this.wins = [];
    for (const [x, bw, bh, col, kind] of TOWN) {
      const top = TB - bh, c = haze(col), d = haze('#2a1a12'), lt = S.shade(c, 0.15), dk = S.shade(c, -0.2);
      if (kind === 'eau') { // château d'eau sur tréteaux
        for (const lx of [x + 2, x + bw - 4]) R(g, lx, top + 14, 2, bh - 14, d);
        for (let k = 0; k < bw - 6; k++) R(g, x + 3 + k, top + 20 + Math.round((k * 10) / (bw - 6)), 1, 1, d);
        R(g, x - 1, top - 1, bw + 2, 16, d); R(g, x, top, bw, 14, c);
        for (let k = 3; k < 14; k += 5) R(g, x, top + k, bw, 1, dk);
        for (let k = 0; k < 4; k++) R(g, x + k * 2 - 1, top - 2 - k, bw - k * 4 + 2, 1, d);
        continue;
      }
      if (kind === 'moulin') { // éolienne sur son pylône
        for (let k = 0; k < bh - 8; k++) { R(g, x - 3 + Math.round(k * 0.08), TB - k, 1, 1, d); R(g, x + 3 - Math.round(k * 0.08), TB - k, 1, 1, d); }
        S.disc(g, x, top + 4, 6, d); S.disc(g, x, top + 4, 4, haze('#8a7a68'));
        for (let a = 0; a < 12; a++) { const an = (a / 12) * Math.PI * 2; for (let k = 1; k < 6; k++) R(g, Math.round(x + Math.cos(an) * k), Math.round(top + 4 + Math.sin(an) * k), 1, 1, d); }
        R(g, x + 4, top + 3, 8, 1, d); R(g, x + 10, top, 3, 6, d);
        continue;
      }
      R(g, x - 1, top - 1, bw + 2, bh + 1, d);
      R(g, x, top, bw, bh, c);
      for (let yy = top + 4; yy < TB; yy += 3) R(g, x, yy, bw, 1, dk); // le bardage
      R(g, x, top, 2, bh, lt);
      R(g, x - 2, top - 1, bw + 4, 2, d); R(g, x - 1, top + 1, bw + 2, 1, lt); // la corniche
      if (kind === 'saloon') { R(g, x + bw / 2 - 11, top - 7, 22, 7, d); R(g, x + bw / 2 - 10, top - 6, 20, 6, c); R(g, x + bw / 2 - 4, top - 10, 8, 4, d); R(g, x + 6, top + 4, bw - 12, 4, haze('#2a1810')); R(g, x + 8, top + 5, bw - 16, 2, haze('#c8a050')); }
      if (kind === 'eglise') { // le clocher et sa croix
        R(g, x + bw / 2 - 5, top - 17, 10, 18, d); R(g, x + bw / 2 - 4, top - 16, 8, 17, c);
        for (let k = 0; k < 6; k++) R(g, x + bw / 2 - 4 + k * 0.7, top - 22 + k, 8 - k * 1.4, 1, d);
        R(g, x + bw / 2 - 1, top - 29, 2, 8, d); R(g, x + bw / 2 - 3, top - 27, 6, 1, d);
        R(g, x + bw / 2 - 2, top - 12, 4, 5, d);
      }
      // l'auvent et ses poteaux, la porte
      R(g, x - 2, TB - 16, bw + 4, 2, d); R(g, x - 1, TB - 16, bw + 2, 1, lt);
      for (const px of [x - 1, x + bw - 1]) R(g, px, TB - 14, 1, 14, d);
      shadow(g, x, TB - 14, bw, 14, 0.18);
      R(g, x + Math.round(bw / 2) - 2, TB - 9, 4, 9, haze('#1e140e'));
      // les fenêtres de l'étage, et la vitrine
      const n = bw > 26 ? 3 : 2;
      for (let k = 0; k < n; k++) {
        const wx = Math.round(x + 4 + (k * (bw - 11)) / (n - 1)), wy = top + (kind === 'saloon' ? 12 : 6);
        if (wy + 5 > TB - 17) continue;
        R(g, wx, wy, 3, 5, haze('#1e2430'));
        this.wins.push([wx, wy, 3, 5]);
      }
      if (bw > 20) { R(g, x + 3, TB - 11, Math.round(bw / 2) - 6, 7, haze('#1e2430')); this.wins.push([x + 3, TB - 11, Math.round(bw / 2) - 6, 7]); }
    }
    for (const px of [226, 392, 540]) { R(g, px, TB - 40, 1, 40, haze('#3a2618')); R(g, px - 3, TB - 38, 7, 1, haze('#3a2618')); } // télégraphe
    for (let x = 226; x < 540; x++) R(g, x, TB - 38 + Math.round(Math.sin(((x - 226) % 166) / 166 * Math.PI) * 3), 1, 1, haze('#3a2618'));
    // la station
    this.wins.push(...depot(g, {
      x0: 20, x1: 196, base: BASE, eave: EAVE, roofTop: 46, col: '#b0783a', trim: '#3e4a2e', roof: '#5a3a2e',
      name: 'DUSTY GULCH', bay: [96, 40], door: 44, windows: [148, 172], chimney: 150, over: [12, 22], posts: [212], brackets: 30, seed: 13,
    }));
    poster(g, 72, 106, 12, 16, '#eadcb0', false); // l'horaire
    poster(g, 140, 108, 6, 9, '#d8c48a'); poster(g, 70, 126, 10, 13, '#e0cc98'); // El Diablo, recherché
    for (const [lx, ly] of LAMPS) { R(g, lx, EAVE + 4, 1, ly - EAVE - 4, OUT); lantern(g, lx, ly); }
    // le quai, les rails, la piste
    platform(g, 0, w, BASE, 5);
    tracks(g, 0, w, BASE + 22, 5);
    const y0 = BASE + 33;
    bands(g, 0, y0, w, H - y0, ['#7a4630', '#86503a', '#925a40', '#9a6244']);
    for (let i = 0; i < w * 0.5; i++) R(g, Math.floor(r() * w), y0 + 1 + Math.floor(r() * (H - y0 - 1)), r() < 0.3 ? 2 : 1, 1, r() < 0.5 ? '#b47a56' : '#5a3020');
    for (let x = 10; x < w; x += 40 + Math.floor(r() * 60)) tuft(g, x, y0 + 4, '#8a7a48');
    // malles et sacs de courrier qui attendent le train, bidons, chariot à bagages
    R(g, 283, BASE - 3, 20, 12, OUT); R(g, 284, BASE - 2, 18, 10, '#6a3a24'); R(g, 286, BASE - 4, 14, 2, '#4a2a18'); R(g, 284, BASE + 3, 18, 1, '#c8a050');
    sack(g, 306, BASE + 6); sack(g, 318, BASE + 7, '#b8a078');
    milkCan(g, 6, BASE + 6); milkCan(g, 15, BASE + 7);
    baggageCart(g, 222, BASE + 6);
    sack(g, 470, BASE + 6, '#c0a880'); sack(g, 481, BASE + 7);
  },
  lights() { return [...(this.wins || []), ...LAMPS.map(([x, y]) => [x + 1, y + 4, 16])]; },
  light(ctx, t, fx, lt) {
    if (!fx.has('brasier')) return;
    for (const [x, y, w, h, d, s] of FIRES) {
      const k = Math.max(0, Math.min(1, ((lt || 0) - d) / 1600 + 0.35)); // le feu gagne de toit en toit
      smoke(ctx, x + w / 2, y - h * k - 4, t + s * 900, { n: 9, life: 4200, rise: 0.022, drift: 0.006, r0: 3, grow: 0.0055, col: '34,26,26', a: 0.7 * k });
      flames(ctx, x, y, w, Math.round(h * k), t, s);
      for (let j = 0; j < 4; j++) { // des escarbilles qui montent
        const ph = (t * 0.0005 + hash(s * 9 + j)) % 1;
        if (ph < 0.8) R(ctx, x + hash(s * 3 + j) * w + Math.sin(t / 300 + j) * 2, y - h * k - ph * 34, 1, 1, ph < 0.4 ? '#fde870' : '#e8701c');
      }
    }
  },
  glow(ctx, t, fx) {
    for (const [lx, ly] of LAMPS) halo(ctx, lx + 1, ly + 4, 30, '255,190,100', 0.75 + 0.12 * Math.sin(t / 90 + lx));
    if (!fx.has('brasier')) return;
    halo(ctx, 420, 112, 120, '255,90,30', 0.65 + 0.06 * Math.sin(t / 130)); // le ciel rougi au-dessus de la ville
    for (const [x, y, w] of FIRES) halo(ctx, x + w / 2, y - 6, 34, '255,130,50', 0.9 + 0.2 * Math.sin(t / 80 + x));
  },
};
