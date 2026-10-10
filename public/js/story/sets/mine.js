// La mine du Vieux Joe : sommets enneigés au loin, contreforts plantés de pins, flanc de granit où s'ouvre la galerie
// boisée (cadres de bois, cadres successifs dans le noir, rails qui s'enfoncent), terril de déblais, chevalement en
// tréteau avec sa molette et ses jambes de force vers la salle du treuil, cabane en rondins du Vieux Joe.
// cross : la troisième croix, au fond de la galerie (fx 'croix'). Lanternes : (386, 108) et (470, 108).
import * as S from '../../sprites.js';
import { H } from '../../worlds.js';
import { OUT, R, O, sign, windowPane, crate, lantern, halo, smoke } from './kit.js';
import {
  P, Pix, Spr, hex, ramp, mixc, pick, vnoise, fbm, hsh, range, ground, pebbles, sow,
  bush, tuft, boulder,
} from './kit-nature.js';

const HZ = 124;
const HAZE = hex('#b8b4c4');
const NEIGE = ramp('7a84a0 98a2bc b6c0d4 d4dce8 eef2f8');
const MONT = ramp('4a4660 5a5670 6c667e 7e788c 908a9a a29ca8');
const DEBLAI = ramp('5a5048 746a5c 8e8470 a89e86 c0b69c d4ccb4');
const ROND = ramp('3a2414 54361e 6e4a2a 8a6038 a47648 bc8e5c');
const CX = 190; // l'axe du chevalement

// pin sombre en sprite (étages de branches)
function pine(h, seed, out = OUT) {
  const w = Math.round(h * 0.6) + 4, s = new Spr(w, h + 2, w >> 1, h + 1);
  const cx = w >> 1;
  s.rect(cx, h - 3, 1, 4, P.mort[2]);
  for (let y = 0; y < h - 3; y++) {
    const k = y / (h - 3), hw = Math.round(1 + k * w * 0.42 * (0.75 + 0.25 * Math.sin(y * 1.9 + seed)));
    for (let x = -hw; x <= hw; x++) s.set(cx + x, y, pick(P.pin, 4.4 - (x + hw) / (hw * 2 + 1) * 3.4 + (y % 3 === 0 ? -0.6 : 0), cx + x, y));
  }
  return out ? s.outline(out) : s;
}

export default {
  w: 600, horizon: HZ, ground: 186, outdoor: true, cross: [452, 128],
  far: [
    // les sommets enneigés
    { k: 0.1, draw(g, w) {
      const Pp = new Pix(g);
      const top = (x) => 96 - fbm(x / 34, 0.5, 9, 4) * 52 - Math.max(0, Math.sin(x / 70 + 1)) * 14;
      range(Pp, { base: HZ + 1, top, R: MONT, l0: 3.2, k: 7, seed: 9, haze: 0.15, hcol: HAZE, snow: (x) => top(x) + 10 + Math.max(0, 60 - top(x)) * 0.5, S: NEIGE });
      Pp.put();
    } },
    // les contreforts boisés
    { k: 0.3, draw(g, w) {
      const Pp = new Pix(g);
      const top = (x) => 104 - fbm(x / 40, 2.5, 19, 3) * 22;
      range(Pp, { base: HZ + 1, top, R: ramp('2a3430 34403a 3e4c44 4a5a4e 566858'), l0: 2.6, k: 4, seed: 19 });
      sow(Pp, { y0: 84, y1: HZ, n: 340, seed: 20, haze: 0.2, hcol: HAZE, make: (d, s, x, y) => (y > top(x) + 1 ? pine(5 + Math.round(d * 6), s, null) : null) });
      Pp.put();
    } },
  ],
  back(g, w) {
    const Pp = new Pix(g);
    ground(Pp, { y0: HZ, y1: H, R: P.terre, lf: 6.4, ln: 4.4, amp: 1.8, seed: 41 });
    pebbles(Pp, { y0: HZ + 2, n: w * 1.4, R: P.terre, seed: 42, grass: 0.3 });
    // pins et rochers au pied des contreforts
    sow(Pp, { x0: 0, x1: 300, y0: HZ - 2, y1: 140, n: 24, seed: 43, haze: 0.25, hcol: HAZE, make: (d, s) => (s % 3 ? pine(10 + Math.round(d * 12), s) : boulder(2 + Math.round(d * 2), s, P.granit)) });
    // le flanc de granit, de plus en plus haut vers la droite
    const cliff = (x) => 92 - (x - 290) * 0.16 + (fbm(x / 22, 0.5, 44, 3) - 0.5) * 30 + (x < 340 ? ((340 - x) / 60) ** 2 * 70 : 0);
    range(Pp, { x0: 280, x1: w, base: 179, top: cliff, R: P.granit, l0: 4.4, k: 5, seed: 45 });
    for (let x = 280; x < w; x++) for (let y = 176; y < 182; y++) if (vnoise(x / 2, y, 52) < 0.5 + (y - 176) * 0.1) Pp.set(x, y, pick(P.granit, 2.6 + vnoise(x, y, 53) * 2, x, y)); // éboulis au pied
    // diaclases : fissures sombres et arêtes claires
    for (let i = 0; i < 40; i++) {
      let x = 300 + hsh(i, 1, 46) * 300, y = cliff(Math.round(x)) + 6 + hsh(i, 2, 46) * 50;
      for (let k = 0; k < 10 + hsh(i, 3, 46) * 18; k++) { Pp.shade(x, y, hex('#141018'), 0.5); Pp.shade(x - 1, y, hex('#d8d0d8'), 0.18); y++; x += hsh(i, k, 47) < 0.3 ? 1 : hsh(i, k, 48) < 0.3 ? -1 : 0; }
    }
    for (const [x, h, s] of [[316, 18, 1], [352, 14, 2], [500, 20, 3], [560, 16, 4], [586, 22, 5]]) pine(h, s).blit(Pp, x, Math.round(cliff(x)) + 4);
    // le terril : déblais clairs en cône, ravinés
    for (let x = 470; x < w; x++) {
      const t = Math.abs(x - 540) / 72, top = Math.round(140 + 38 * t ** 1.3 + (vnoise(x / 3, 1, 49) - 0.5) * 3);
      for (let y = top; y < 178; y++) Pp.set(x, y, pick(DEBLAI, (x < 540 ? 3.2 : 1.8) + (vnoise(x / 1.5, y / 6, 50) - 0.5) * 2.4 + (y === top ? 1.2 : 0), x, y));
    }
    // l'ouverture de la galerie : le noir, des cadres qui s'enfoncent, les rails qui convergent
    for (let y = 102; y < 176; y++) for (let x = 398; x < 458; x++) Pp.set(x, y, mixc(hex('#0c0806'), hex('#2a1a10'), Math.max(0, 1 - Math.hypot(x - 428, (y - 168) * 1.4) / 46) * 0.8));
    Pp.put();
    for (const [ins, col] of [[9, '#3a2616'], [17, '#24170e'], [23, '#170e08']]) {
      const x0 = 398 + ins, x1 = 458 - ins, y0 = 102 + ins * 1.3, y1 = 176 - Math.round(ins * 0.5);
      R(g, x0, y0, x1 - x0, 3, col); R(g, x0, y0, 3, y1 - y0, col); R(g, x1 - 3, y0, 3, y1 - y0, col);
    }
    for (let k = 0; k < 6; k++) { const y = 175 - k * 3, hw = 26 - k * 4; R(g, 428 - hw, y, hw * 2, 1, '#3a2a1e'); }
    R(g, 400, 175, 1, 1, '#6a707a');
    for (let y = 160; y < 176; y++) { const t = (176 - y) / 16; R(g, Math.round(414 + t * 9), y, 1, 1, '#4a4e56'); R(g, Math.round(442 - t * 9), y, 1, 1, '#4a4e56'); }
    // le boisage de l'entrée : montants, chapeau, planches de garnissage au-dessus
    O(g, 390, 176, [[0, -76, 8, 76, '#8a5a30'], [68, -76, 8, 76, '#8a5a30'], [-6, -84, 88, 9, '#7a4a26']]);
    R(g, 390, 100, 2, 76, '#a87244'); R(g, 458, 100, 2, 76, '#a87244'); R(g, 396, 100, 2, 76, '#5a3a1e'); R(g, 464, 100, 2, 76, '#5a3a1e');
    R(g, 384, 92, 88, 1, '#a87244'); R(g, 384, 99, 88, 1, '#4a2c16');
    for (let x = 386; x < 470; x += 7) { R(g, x, 84, 6, 8, '#6a4224'); R(g, x, 84, 6, 1, '#8a5a30'); R(g, x + 5, 84, 1, 8, '#3a2412'); }
    sign(g, 428, 72, 'DANGER', { bg: '#eadcb0', fg: '#7a1a14' });
    // rails et traverses jusqu'à la galerie
    for (let x = 0; x < 460; x += 9) { R(g, x, 176, 6, 3, '#4a2a14'); R(g, x, 176, 6, 1, '#6a4428'); }
    R(g, 0, 175, 460, 1, '#a8acb4'); R(g, 0, 178, 460, 1, '#6a707a');
    // le wagonnet chargé de minerai doré
    O(g, 300, 0, [[0, 156, 34, 15, '#6a707a'], [-2, 154, 38, 3, '#8a8f98']]);
    R(g, 300, 157, 34, 1, '#9aa0a8'); R(g, 300, 160, 1, 10, '#8a8f98'); R(g, 316, 157, 1, 14, '#4a4e56');
    for (let k = 0; k < 6; k++) R(g, 302 + k * 5, 151 - (k % 2) * 2, 5, 4, k % 2 ? '#f8d070' : '#c89428');
    R(g, 304, 150, 2, 1, '#fffbe0'); R(g, 319, 148, 2, 1, '#fffbe0');
    for (const wx of [306, 326]) { S.disc(g, wx, 173, 3, OUT); S.disc(g, wx, 173, 2, '#3a3e46'); R(g, wx, 173, 1, 1, '#9aa0a8'); }
    // le chevalement : quatre montants en tréteau, croix de Saint-André, molette, jambes de force vers le treuil
    const leg = (x0, y0, x1, y1, col, th = 4) => {
      const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
      for (let k = 0; k <= n; k++) { const x = Math.round(x0 + ((x1 - x0) * k) / n), y = Math.round(y0 + ((y1 - y0) * k) / n); R(g, x - 1, y - 1, th + 2, 3, OUT); }
      for (let k = 0; k <= n; k++) { const x = Math.round(x0 + ((x1 - x0) * k) / n), y = Math.round(y0 + ((y1 - y0) * k) / n); R(g, x, y, th, 1, col); R(g, x, y, 1, 1, '#a87244'); }
    };
    // les jambes de force, derrière, qui descendent vers la salle du treuil
    leg(CX - 4, 58, 132, 168, '#6a4224', 4);
    leg(CX + 4, 62, 150, 170, '#5a361c', 3);
    // les montants
    leg(CX - 26, 172, CX - 9, 58, '#7a4a26'); leg(CX + 26, 172, CX + 9, 58, '#7a4a26');
    for (let y = 152; y > 62; y -= 22) { // entretoises et croix de Saint-André
      const hw = (yy) => Math.round(9 + ((yy - 58) / 114) * 17);
      R(g, CX - hw(y) - 1, y - 1, hw(y) * 2 + 6, 4, OUT); R(g, CX - hw(y), y, hw(y) * 2 + 4, 2, '#8a5a30'); R(g, CX - hw(y), y, hw(y) * 2 + 4, 1, '#a87244');
      if (y - 22 > 60) for (let k = 0; k < 22; k++) {
        const ya = y - k, a = hw(ya);
        R(g, CX - a + Math.round(((a * 2 + 2) * k) / 22), ya, 2, 1, '#5a3a1e'); R(g, CX + a + 2 - Math.round(((a * 2 + 2) * k) / 22), ya, 2, 1, '#5a3a1e');
      }
    }
    // la plate-forme et la molette
    O(g, CX - 14, 52, [[0, 0, 32, 5, '#7a4a26']]); R(g, CX - 14, 52, 32, 1, '#a87244');
    S.disc(g, CX + 2, 42, 14, OUT); S.disc(g, CX + 2, 42, 12, '#5a3a22'); S.disc(g, CX + 2, 42, 10, '#1a120c');
    for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; for (let s = 2; s < 10; s++) R(g, CX + 2 + Math.round(Math.cos(a) * s), 42 + Math.round(Math.sin(a) * s), 1, 1, '#7a5a3a'); }
    S.disc(g, CX + 2, 42, 2, '#c8c8d0'); R(g, CX - 9, 37, 3, 2, '#8a6a4a');
    R(g, CX + 14, 42, 1, 130, '#2a2a30'); // le câble qui descend dans le puits
    for (let k = 0; k < 60; k++) R(g, CX - 10 - k, 42 + Math.round(k * 1.55 + (k * (60 - k)) / 120), 1, 1, '#2a2a30'); // le câble vers le treuil
    // la cage au jour et le carreau du puits
    O(g, CX + 8, 172, [[0, -18, 12, 18, '#5a5e66']]); R(g, CX + 9, 159, 10, 1, '#8a8f98'); R(g, CX + 13, 155, 2, 17, '#3a3e46');
    O(g, CX - 30, 176, [[0, -4, 64, 4, '#6a4224']]); R(g, CX - 30, 172, 64, 1, '#8a5a30');
    // la salle du treuil, sa cheminée
    O(g, 112, 172, [[0, -26, 44, 26, '#6a4a32'], [-3, -31, 50, 5, '#4a3a34'], [34, -46, 5, 15, '#3a3a42']]);
    for (let x = 114; x < 156; x += 5) R(g, x, 147, 1, 25, '#5a3a24');
    R(g, 126, 156, 10, 16, '#2a1a12'); R(g, 142, 152, 8, 6, '#2a3440'); R(g, 143, 153, 2, 1, '#6a7a88');
    // la cabane en rondins du Vieux Joe
    for (let y = 130; y < 172; y += 4) { R(g, 22, y - 1, 94, 5, OUT); R(g, 23, y, 92, 3, '#7a5432'); R(g, 23, y, 92, 1, '#9a6e44'); R(g, 23, y + 2, 92, 1, '#5a3a22'); S.disc(g, 22, y + 1, 2, '#a87c50'); S.disc(g, 115, y + 1, 2, '#8a6038'); }
    for (let k = 0; k < 14; k++) { R(g, 18 + k, 130 - k, 102 - k * 2, 1, k === 0 ? OUT : k % 3 === 0 ? '#3a2a22' : '#5a4434'); }
    R(g, 18, 117, 102, 1, OUT); R(g, 30, 116, 78, 1, OUT);
    windowPane(g, 36, 140, 16, 12);
    R(g, 76, 144, 18, 28, OUT); R(g, 77, 145, 16, 27, '#3a2214'); R(g, 78, 146, 1, 25, '#5a3a22'); R(g, 90, 158, 2, 2, '#c8a040');
    O(g, 64, 116, [[0, -10, 2, 10, '#5a3a22']]); O(g, 74, 116, [[0, -10, 2, 10, '#5a3a22']]);
    sign(g, 69, 96, 'MINE DU VIEUX JOE');
    crate(g, 236, 172, 14, 'TNT'); crate(g, 252, 172, 12); crate(g, 244, 160, 10);
    // la pioche et la pelle contre les caisses
    for (let k = 0; k < 16; k++) R(g, 268 + Math.round(k * 0.3), 156 + k, 2, 1, '#8a5a30');
    R(g, 264, 155, 10, 2, '#8a8f98');
    for (let k = 0; k < 18; k++) R(g, 278 - Math.round(k * 0.25), 154 + k, 1, 1, '#7a5228');
    R(g, 272, 170, 5, 3, '#8a8f98');
    lantern(g, 386, 108); lantern(g, 470, 108);
    // premier plan
    const Q = new Pix(g);
    sow(Q, { y0: 196, y1: H + 4, n: 34, seed: 51, make: (d, s) => [tuft(6 + Math.round(d * 6), s, P.herbe), boulder(3 + Math.round(d * 4), s, P.granit), bush(3, s, P.sauge, hex('#2a2a1e'))][s % 3] });
    for (const [x, y, sz, s] of [[560, 210, 9, 1], [40, 214, 7, 2]]) { Q.shadow(x + 6, y + 1, sz + 4, 3); boulder(sz, s, P.granit).blit(Q, x, y); }
    Q.put();
  },
  lights() { return [[388, 112, 18], [472, 112, 18], [37, 141, 14, 10]]; },
  anim(ctx, t) {
    smoke(ctx, 148, 124, t, { n: 7, life: 3400, rise: 0.016, drift: 0.008, r0: 2, grow: 0.003, col: '200,196,190', a: 0.35 }); // la cheminée du treuil
    for (let i = 0; i < 4; i++) S.disc(ctx, 428 + Math.round(Math.sin(t / 900 + i) * 20), 140 + i * 8, 2, 'rgba(120,110,100,0.15)');
  },
  glow(ctx, t) { for (const lx of [388, 472]) halo(ctx, lx, 112, 36, '255,190,100', 0.7 + 0.15 * Math.sin(t / 80 + lx)); },
};
