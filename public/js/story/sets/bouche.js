// La Bouche de l'Enfer : le cratère du volcan, à ciel ouvert (à l'aube ou de nuit). Parois de basalte en strates
// de scories, éclairées par en dessous, fumerolles, fond de cendre ; devant, la corniche de roche noire où l'on se
// tient, et le gouffre (PIT, kit.js) dont le fond d'or en fusion luit dans un réseau de fissures. L'or vif est
// dessiné hors de la teinte (light) : il brille même la nuit. fx 'sombrero' (son chapeau au bord), 'eboulement'.
import * as S from '../../sprites.js';
import { H } from '../../worlds.js';
import { OUT, R, O, halo, smoke, PIT } from './kit.js';
import {
  P, Pix, hex, ramp, mixc, pick, vnoise, fbm, hsh, wall, ground, sow, boulder, deadTree,
} from './kit-nature.js';

const HZ = 120;
const [P0, P1] = PIT;
const LIP = 170; // le bord d'en face du gouffre
const EMBRASE = hex('#c8581c'); // la lueur du filon sur la roche
const CENDRE = ramp('16121a 221a20 2e2228 3c2c30 4c383a 5e4644 72564e');
const VENTS = [[96, 128], [214, 134], [470, 126], [548, 140]]; // fumerolles du fond du cratère

// ouverture du gouffre à la hauteur y : il se resserre en descendant
const openL = (y) => P0 + 4 + Math.max(0, y - LIP) * 1.25;
const openR = (y) => P1 - 4 - Math.max(0, y - LIP) * 1.05;

// la lueur qui monte du filon : les pixels bas d'un calque rougeoient
function underglow(Pp, y0, y1, k, x0 = 0, x1 = Pp.w) {
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) Pp.shade(x, y, EMBRASE, k * ((y - y0) / (y1 - y0)) ** 1.5);
}

// le fond d'or (deux états pour le miroitement) : seulement les pixels qui brillent, le reste transparent
let GOLD = null;
function gold() {
  if (GOLD) return GOLD;
  GOLD = [0, 1].map((ph) => {
    const c = S.makeCanvas(P1 - P0, H - LIP, true), Pp = new Pix(c.getContext('2d', { willReadFrequently: true }));
    for (let y = LIP + 28; y < H; y++) {
      const a = openL(y), b = openR(y), d = (y - LIP - 24) / (H - LIP - 24);
      for (let x = Math.ceil(a); x < b; x++) {
        const n = fbm(x / 9 + ph * 0.35, y / 3.5, 7, 3), crack = Math.abs(n - 0.5);
        const e = Math.min(x - a, b - x);
        if (n > 0.7 - d * 0.1) Pp.set(x - P0, y - LIP, pick(P.or, 4.4 + (n - 0.7) * 18 + d * 1.5 - (e < 3 ? 1.5 : 0), x, y)); // mares d'or fondu
        else if (crack < 0.014 + d * 0.016) Pp.set(x - P0, y - LIP, pick(P.or, 3.4 + d * 2 - crack * 30, x, y)); // fissures
      }
    }
    Pp.put();
    return c;
  });
  return GOLD;
}
// les fissures du fond du cratère, où l'or affleure en rougeoyant (vives elles aussi)
let CRACKS = null;
function cracks(w) {
  if (CRACKS) return CRACKS;
  CRACKS = S.makeCanvas(w, 152 - HZ, true);
  const Pp = new Pix(CRACKS.getContext('2d', { willReadFrequently: true })), F = ramp('6a2410 a0401a d06a24 f0a040 f8d070');
  for (let y = HZ + 6; y < 150; y++) for (let x = 0; x < w; x++) {
    const n = Math.abs(fbm(x / 22, y / 2.4, 95, 2) - 0.5);
    if (n < 0.011 && vnoise(x / 40, y / 10, 94) > 0.58) Pp.set(x, y - HZ, pick(F, 1.4 + (y - HZ) * 0.05 + (0.011 - n) * 120, x, y));
  }
  Pp.put();
  return CRACKS;
}

export default {
  w: 560, horizon: HZ, ground: 186, outdoor: true,
  far: [
    // la paroi d'en face du cratère, lointaine
    { k: 0.15, draw(g, w) {
      const Pp = new Pix(g);
      wall(Pp, { top: (x) => 40 + fbm(x / 38, 0.5, 91, 3) * 26 + (Math.abs(Math.sin(x / 57)) > 0.93 ? 10 : 0), bot: () => HZ + 3, R: P.basalte, lit: 4.6, band: 6, seed: 91, warp: 3, haze: 0.16, hcol: hex('#6a5a6a') });
      underglow(Pp, 70, HZ + 3, 0.4);
      Pp.put();
    } },
    // les pans plus proches, de part et d'autre
    { k: 0.4, draw(g, w) {
      const Pp = new Pix(g);
      const top = (x) => (x < 150 ? 8 + x * 0.5 : 8 + (w - x) * 0.45) + (fbm(x / 20, 1.5, 92, 3) - 0.5) * 18; // les pans descendent vers le milieu
      wall(Pp, { x0: 0, x1: 150, top, bot: () => HZ + 3, R: P.basalte, lit: 3.2, band: 8, seed: 92, warp: 4, edge: (x) => (x > 144 ? -1.4 : 0) });
      wall(Pp, { x0: w - 150, x1: w, top, bot: () => HZ + 3, R: P.basalte, lit: 4, band: 8, seed: 93, warp: 4, edge: (x) => (x < w - 144 ? 2 : 0) });
      underglow(Pp, 60, HZ + 3, 0.45);
      Pp.put();
    } },
  ],
  back(g, w) {
    const Pp = new Pix(g);
    // le fond du cratère : cendre et croûte, qui rougeoie au loin
    ground(Pp, { y0: HZ, y1: 152, R: CENDRE, lf: 3, ln: 4, amp: 1.6, seed: 94 });
    underglow(Pp, HZ, 150, -0.4); // (le fond s'éteint vers nous)
    // éboulis au pied des parois : un bourrelet de blocs qui cache leur base
    for (let x = 0; x < w; x++) {
      const t0 = Math.round(HZ - 3 - vnoise(x / 9, 3, 86) * 7);
      for (let y = t0; y < HZ + 7; y++) {
        const c = pick(CENDRE, 2.4 + (vnoise(x / 2, y / 2, 85) - 0.5) * 2.6 + (y === t0 ? 1.2 : 0) - (y - t0) * 0.08, x, y);
        Pp.set(x, y, mixc(c, EMBRASE, 0.18));
      }
    }
    sow(Pp, { y0: HZ + 1, y1: 150, n: 50, seed: 96, make: (d, s) => boulder(1 + Math.round(d * 2), s, P.basalte, P.basalte[0]) });
    // la corniche où l'on se tient : basalte bulleux, scories rouges
    for (let x = 0; x < w; x++) {
      const t0 = Math.round(148 + Math.sin(x / 41) * 3 + (vnoise(x / 6, 1, 97) - 0.5) * 4);
      for (let y = t0; y < H; y++) {
        const d = (y - t0) / (H - t0), nz = fbm(x / (5 + d * 14), y / (3 + d * 6), 98, 3);
        let c = pick(P.basalte, 4.8 - d * 1.6 + (nz - 0.5) * 3 + (y - t0 < 1 ? 1.6 : 0), x, y);
        if (vnoise(x / 12, y / 5, 99) > 0.8) c = pick(P.scorie, 3.4 + (nz - 0.5) * 3 - d, x, y); // plaques de scories
        if (hsh(x, y, 9) < 0.04) c = P.basalte[1]; // bulles
        Pp.set(x, y, c);
      }
    }
    // le gouffre : paroi d'en face qui plonge, flancs qui se resserrent, lueur grandissante vers le fond
    for (let x = P0; x < P1; x++) {
      const lip = Math.round(LIP + (vnoise(x / 5, 2, 90) - 0.5) * 5 + Math.sin(((x - P0) / (P1 - P0)) * Math.PI) * -4);
      for (let y = lip; y < H; y++) {
        const t = (y - lip) / (H - lip), a = openL(y), b = openR(y);
        const side = x < a || x > b;
        const band = Math.floor((y + vnoise(x / 18, 0, 89) * 4) / 5) % 3;
        let l = side ? 2.6 + (x < a ? 0.8 : -0.4) : 3.4 - t * 1.2 + (band === 0 ? 0.9 : band === 1 ? -0.5 : 0);
        if (y - lip < 1) l += 2.4; // l'arête du bord d'en face
        else if (y - lip < 4) l -= 1.6; // l'ombre sous l'arête
        let c = pick(P.basalte, l + (vnoise(x / 3, y / 3, 88) - 0.5) * 1.2, x, y);
        c = mixc(c, EMBRASE, Math.min(0.8, (side ? 0.12 : 0.18) + t ** 1.6 * 0.7));
        Pp.set(x, y, c);
      }
    }
    // le bord du gouffre, de notre côté, qui s'effrite ; blocs sur les lèvres
    for (const [x, y, sz, s] of [[P0 - 6, 184, 7, 1], [P0 + 2, 178, 4, 2], [P1 + 4, 182, 8, 3], [P1 - 6, 176, 4, 4], [P0 + 40, LIP + 1, 3, 5], [P1 - 50, LIP, 3, 6]]) boulder(sz, s, P.basalte, OUT).blit(Pp, x, y);
    // rochers noirs de la corniche, et des pépites tombées
    for (const [x, y, sz, s] of [[60, 186, 10, 7], [250, 186, 8, 8], [20, 210, 12, 9], [176, 214, 9, 10], [548, 212, 9, 11]]) { Pp.shadow(x + 6, y + 1, sz + 4, 3); boulder(sz, s, P.basalte, OUT).blit(Pp, x, y); }
    sow(Pp, { y0: 154, y1: H + 2, n: 60, seed: 87, avoid: (x, y) => x > P0 - 4 && x < P1 + 4 && y > LIP - 6, make: (d, s) => boulder(1 + Math.round(d * 3), s, s % 3 ? P.basalte : P.scorie, P.basalte[0]) });
    // la racine noire tordue qui surplombe le gouffre (celle où s'accroche El Diablo)
    deadTree(34, 6, OUT, P.basalte).blit(Pp, P0 - 2, 182);
    Pp.put();
    for (const [x, y] of [[90, 182], [212, 184], [544, 184], [140, 186]]) { R(g, x, y, 3, 2, '#f8d070'); R(g, x, y, 1, 1, '#fffbe0'); R(g, x + 1, y + 2, 2, 1, '#8a5a18'); }
    // l'échelle de bois qui descend dans le gouffre
    for (let k = 0; k < 7; k++) R(g, P0 + 12, 184 + k * 5, 12, 1, '#6a4a2a');
    R(g, P0 + 11, 180, 1, 40, '#6a4a2a'); R(g, P0 + 24, 180, 1, 40, '#6a4a2a');
    R(g, P0 + 10, 180, 1, 40, OUT); R(g, P0 + 25, 180, 1, 40, OUT);
  },
  // l'or du fond, vif, hors de la teinte (derrière les acteurs)
  light(ctx, t, fx) {
    const G = gold();
    ctx.globalAlpha = fx.has('eboulement') ? 0.55 : 1;
    ctx.drawImage(G[Math.floor(t / 420) % 2], P0, LIP);
    ctx.globalAlpha *= 0.75 + 0.25 * Math.sin(t / 700);
    ctx.drawImage(cracks(this.w), 0, HZ);
    ctx.globalAlpha = 1;
  },
  anim(ctx, t, fx) {
    // fumerolles du fond du cratère, et la vapeur dorée qui monte du gouffre
    for (const [i, [x, y]] of VENTS.entries()) smoke(ctx, x, y, t + i * 700, { n: 6, life: 4200, rise: 0.012, drift: 0.004, r0: 2, grow: 0.004, col: '190,176,170', a: 0.3 });
    smoke(ctx, (P0 + P1) / 2, LIP + 6, t, { n: 8, life: 5000, rise: 0.014, drift: 0.003, r0: 4, grow: 0.006, col: '240,190,120', a: 0.18 });
    // le sombrero d'El Diablo, resté au bord du gouffre (fx 'sombrero')
    if (fx.has('sombrero')) { // éclairé par l'or du gouffre : bord clair, galon doré qui scintille
      const x = P0 - 22, y = 181;
      O(ctx, x, y, [[-15, -3, 32, 3, '#4a3e36'], [-6, -10, 14, 7, '#3a302a'], [-4, -12, 10, 2, '#3a302a']]);
      R(ctx, x - 15, y - 3, 32, 1, '#8a6a4a'); R(ctx, x - 6, y - 10, 14, 1, '#6a5444');
      for (let k = -14; k < 16; k += 3) R(ctx, x + k, y - 2, 1, 1, '#f8d070');
      R(ctx, x - 6, y - 6, 14, 2, '#e0b040');
      if (Math.floor(t / 160) % 9 === 0) { R(ctx, x + 6, y - 8, 1, 3, '#fffbe0'); R(ctx, x + 5, y - 7, 3, 1, '#fffbe0'); }
    }
    // l'or qui remonte en étincelles
    const dim = fx.has('eboulement') ? 0.5 : 1;
    for (let i = 0; i < 40; i++) {
      const life = 2600 + (i % 5) * 300, age = (t + i * 211) % life, k = age / life;
      const x = P0 + 10 + hash(i) * (P1 - P0 - 20) + Math.sin(age / 300 + i) * 4, y = 210 - age * 0.06;
      if (y < 40) continue;
      R(ctx, x, y, 1, 1, k < 0.6 ? `rgba(255,232,140,${dim})` : `rgba(240,170,60,${(1 - k) * dim})`);
    }
    if (fx.has('eboulement')) {
      for (let i = 0; i < 16; i++) {
        const life = 1200 + (i % 4) * 200, age = (t + i * 157) % life;
        const x = 30 + hash(i + 3) * 500, y = -10 + (age / life) ** 2 * 230;
        O(ctx, x, y, [[0, 0, 4 + (i % 3) * 2, 3 + (i % 2) * 2, '#4a3634']]);
      }
      for (let i = 0; i < 8; i++) S.disc(ctx, Math.round(40 + i * 70 + Math.sin(t / 500 + i) * 10), 170, 14, 'rgba(120,100,90,0.22)');
    }
  },
  glow(ctx, t, fx) {
    const k = fx.has('eboulement') ? 0.45 : 1;
    const cx = (P0 + P1) / 2;
    halo(ctx, cx, 214, 160, '255,190,70', k * (1 + 0.1 * Math.sin(t / 300)));
    halo(ctx, cx, 204, 70, '255,220,120', k * 0.75);
    for (let i = 0; i < 6; i++) if (Math.floor(t / 150 + i * 3) % 7 === 0) halo(ctx, 40 + hash(i) * 480, 30 + hash(i + 7) * 120, 6, '255,220,120', 1.5);
  },
};
const hash = (n) => hsh(n, 0, 77);
