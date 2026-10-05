// Fusillade : les abords de Dusty Gulch, entre la gare et la grand-rue. Trois variantes tirées au sort
// (worlds.js, EDGES) : le cimetière de Boot Hill, le ranch, la mine d'or. Décor dessiné une fois par partie.
import * as S from './sprites.js';
import { canvasText } from './scene.js';
import { W, H, GROUND, PROP_BASE, EDGE_W, EDGE_COVER } from './worlds.js';
import { paint, seeded, drawWindow, drawDoor, drawProp, gable } from './shooter.js';

const OUT = S.OUT;
const hash = (n) => {
  let t = (n * 0x6d2b79f5) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

// trait épais d'un point à un autre (branches, poutres, haubans)
function line(R, x0, y0, x1, y1, w, col) {
  const n = Math.max(1, Math.abs(Math.round(x1 - x0)), Math.abs(Math.round(y1 - y0)));
  for (let i = 0; i <= n; i++) R(x0 + ((x1 - x0) * i) / n - w / 2, y0 + ((y1 - y0) * i) / n - w / 2, w, w, col);
}

const signW = (t) => t.length * 7 + 12;

// ------------------------------------------------------------ sols et fonds
const GROUNDS = {
  // la colline de Boot Hill : herbe sèche, petites tombes au loin, grille en fer forgé
  boothill(ctx, { R, box }, E, rnd) {
    for (let x = 0; x < EDGE_W; x++) {
      const top = Math.round(128 + 8 * Math.sin(x / 150) + 4 * Math.sin(x / 47));
      R(x, top, 1, GROUND - top, '#8a8a52');
      R(x, top, 1, 1, '#6a6a3a');
    }
    for (let i = 0; i < 500; i++) R(rnd() * EDGE_W, 130 + rnd() * 36, 1, 2, rnd() < 0.5 ? '#a0a060' : '#72723e');
    const taken = (x) => E.houses.some((h) => h.w && x > h.x - 12 && x < h.x + h.w + 6);
    for (let x = 10; x < EDGE_W; x += 22 + Math.floor(rnd() * 22)) {
      if (taken(x)) continue;
      const y = 146 + Math.floor(rnd() * 8);
      if (rnd() < 0.4) { R(x + 2, y - 3, 2, 10, '#6a5a48'); R(x, y - 1, 6, 2, '#6a5a48'); } else { box(x, y, 6, 7, '#8a8680'); R(x + 1, y - 1, 4, 1, '#8a8680'); }
    }
    for (let x = 0; x < EDGE_W; x += 4) { R(x, GROUND - 16, 1, 16, '#3a3436'); R(x, GROUND - 18, 1, 1, '#3a3436'); }
    R(0, GROUND - 13, EDGE_W, 1, '#3a3436'); R(0, GROUND - 4, EDGE_W, 1, '#3a3436');
    const bands = ['#9a9258', '#a09a60', '#948c52', '#a49e66'];
    bands.forEach((c, i) => R(0, GROUND + i * 13, EDGE_W, 14, c));
    for (let i = 0; i < 1800; i++) R(rnd() * EDGE_W, GROUND + rnd() * 50, 1, rnd() < 0.3 ? 2 : 1, rnd() < 0.5 ? '#b8b070' : '#76703e');
  },
  // le ranch : prairie, clôture au loin, chemin de terre
  ranch(ctx, { R }, E, rnd) {
    R(0, 140, EDGE_W, GROUND - 140, '#9aa058');
    for (let i = 0; i < 700; i++) R(rnd() * EDGE_W, 140 + rnd() * 26, 1, 2, rnd() < 0.5 ? '#b0b468' : '#7a8044');
    for (let x = 6; x < EDGE_W; x += 30) R(x, 140, 2, 12, '#7a5a3a');
    R(0, 143, EDGE_W, 1, '#7a5a3a'); R(0, 148, EDGE_W, 1, '#7a5a3a');
    const bands = ['#a89a5a', '#b4a066', '#a4965a', '#ae9e64'];
    bands.forEach((c, i) => R(0, GROUND + i * 13, EDGE_W, 14, c));
    for (const y of [186, 204]) for (let x = 0; x < EDGE_W; x += 3) R(x, y + (x % 7 === 0 ? 1 : 0), 2, 1, '#8a7a44');
    for (let i = 0; i < 1600; i++) R(rnd() * EDGE_W, GROUND + rnd() * 50, 1, 1, rnd() < 0.5 ? '#c8b878' : '#7a6a3a');
  },
  // la mine : falaise ocre en strates, éboulis, rails des wagonnets
  mine(ctx, { R }, E, rnd) {
    const tops = [];
    for (let x = 0; x < EDGE_W; x++) {
      const top = Math.round(36 + 16 * Math.sin(x / 210) + 7 * Math.sin(x / 61 + 1) + 3 * Math.sin(x / 17));
      tops.push(top);
      R(x, top, 1, GROUND - top, '#a8704a');
      R(x, top, 1, 2, '#c8905e'); R(x, top - 1, 1, 1, OUT);
    }
    for (const y0 of [64, 88, 112, 136, 156]) {
      for (let x = 0; x < EDGE_W; x++) {
        const y = y0 + Math.round(3 * Math.sin(x / 90 + y0));
        if (y > tops[x] + 3) R(x, y, 1, 2, '#8a5636');
      }
    }
    for (let i = 0; i < 90; i++) {
      const x = rnd() * EDGE_W, y = tops[Math.floor(x)] + 8 + rnd() * 90;
      for (let k = 0; k < 6; k++) R(x + k * (rnd() < 0.5 ? 1 : -1) * 0.6, y + k, 1, 1, '#6a4028');
    }
    for (let i = 0; i < 400; i++) { const x = rnd() * EDGE_W; R(x, tops[Math.floor(x)] + rnd() * 120, 2, 1, rnd() < 0.5 ? '#c08a5a' : '#94603e'); }
    const bands = ['#b09070', '#a88868', '#b4946e', '#ac8c6a'];
    bands.forEach((c, i) => R(0, GROUND + i * 13, EDGE_W, 14, c));
    for (let i = 0; i < 2000; i++) R(rnd() * EDGE_W, GROUND + rnd() * 50, rnd() < 0.3 ? 2 : 1, 1, rnd() < 0.5 ? '#d0b08a' : '#7a5a40');
    for (let x = 0; x < EDGE_W; x += 9) R(x, 195, 6, 5, '#5a3a22');
    R(0, 196, EDGE_W, 1, '#c8ccd0'); R(0, 199, EDGE_W, 1, '#c8ccd0'); R(0, 197, EDGE_W, 1, '#6a6e74');
  },
};

// ------------------------------------------------------------ bâtiments
function siding(R, x, y, w, h, col, step = 6) {
  for (let px = x + 3; px < x + w; px += step) R(px, y + 1, 1, h - 1, col);
}
function cornice(R, x, w, top, dk, lt) {
  R(x - 3, top - 4, w + 6, 5, dk); R(x - 3, top - 4, w + 6, 1, lt); R(x - 4, top - 5, w + 8, 1, OUT); R(x - 4, top + 1, w + 8, 1, OUT);
}
// mausolée (fronton triangulaire et colonnes) ou crypte (fronton arrondi)
function mausoleum(ctx, { R, box }, h, arch) {
  const { x, w, top } = h;
  const col = '#b4b0a4', dk = '#8a867c', lt = '#d0ccc0';
  const ph = top - h.roof;
  for (let dy = 1; dy <= ph; dy++) {
    const u = dy / (ph + 1);
    const hw = Math.round(arch ? (w / 2 + 2) * Math.sqrt(1 - u * u) : (w / 2 + 4) * (1 - u));
    R(x + w / 2 - hw - 1, top - dy, hw * 2 + 2, 1, OUT);
    R(x + w / 2 - hw, top - dy, hw * 2, 1, dy % 4 ? col : dk);
  }
  box(x, top, w, GROUND - top, col);
  for (let y = top + 6, r = 0; y < GROUND; y += 8, r++) {
    R(x, y, w, 1, dk);
    for (let px = x + (r % 2) * 9; px < x + w; px += 18) R(px, y, 1, 8, dk);
  }
  R(x - 4, top - 2, w + 8, 4, lt); R(x - 5, top - 3, w + 10, 1, OUT); R(x - 5, top + 2, w + 10, 1, OUT);
  if (!arch) for (const px of [x + 8, x + 22, x + w - 30, x + w - 16]) { box(px, top + 4, 8, GROUND - top - 8, lt); R(px + 2, top + 4, 1, GROUND - top - 8, col); }
  R(x - 6, GROUND - 4, w + 12, 4, dk); R(x - 6, GROUND - 4, w + 12, 1, lt);
  drawDoor(ctx, h.door, lt, '#4a4f58', arch);
  R(x + w / 2 - 16, top + 7, 32, 3, dk);
}

const HOUSES = {
  gate(ctx, { R, box }, h, E) {
    const post = E.kind === 'ranch' ? '#7a5a3a' : '#5a4a40';
    for (const px of [h.x + 4, h.x + h.w - 10]) box(px, 86, 6, GROUND - 86, post);
    box(h.x - 2, h.sign.y - 2, h.w + 4, 13, '#d8bc80');
    R(h.x - 2, h.sign.y + 9, h.w + 4, 2, '#b89a60');
    if (E.kind === 'ranch') {
      // crâne de bœuf au-dessus de l'arche
      const cx = h.x + h.w / 2;
      R(cx - 12, h.sign.y - 8, 7, 2, '#f4ecd8'); R(cx + 6, h.sign.y - 8, 7, 2, '#f4ecd8'); R(cx - 14, h.sign.y - 11, 2, 3, '#f4ecd8'); R(cx + 13, h.sign.y - 11, 2, 3, '#f4ecd8');
      box(cx - 4, h.sign.y - 10, 9, 8, '#f4ecd8'); R(cx - 2, h.sign.y - 8, 2, 2, OUT); R(cx + 1, h.sign.y - 8, 2, 2, OUT);
    } else for (const px of [h.x + 7, h.x + h.w - 7]) { R(px - 1, 72, 2, 12, '#3a3436'); R(px - 4, 75, 8, 2, '#3a3436'); }
  },
  chapel(ctx, { R, box }, h, E, rnd) {
    const { x, w, top } = h;
    const col = '#d8d0c0', dk = S.shade(col, -0.2);
    gable(R, null, h, '#6a5a6a');
    box(x, top, w, GROUND - top, col);
    siding(R, x, top, w, GROUND - top, dk);
    const b = h.belfry, cx = x + w / 2, ty = b.y - 6;
    box(cx - 15, ty, 30, top - ty, col);
    siding(R, cx - 15, ty, 30, top - ty, dk);
    for (let dy = 0; dy < 12; dy++) {
      const hw = Math.round(17 * (1 - dy / 12));
      R(cx - hw - 1, ty - dy - 1, hw * 2 + 2, 1, OUT);
      R(cx - hw, ty - dy, hw * 2, 1, dy % 3 ? '#6a5a6a' : '#5a4a5a');
    }
    R(cx - 1, ty - 22, 3, 10, OUT); R(cx - 4, ty - 19, 9, 3, OUT); R(cx, ty - 21, 1, 8, '#e0b040'); R(cx - 3, ty - 18, 7, 1, '#e0b040');
    R(b.x - 2, b.y - 2, b.w + 4, b.h + 2, OUT); R(b.x, b.y, b.w, b.h, '#24140c');
    S.disc(ctx, cx, b.y + 7, 5, OUT); S.disc(ctx, cx, b.y + 7, 4, '#c8a040'); R(cx - 6, b.y + 11, 13, 2, '#c8a040');
    for (const wn of h.wins) drawWindow(ctx, wn, '#f4ecd8', rnd, true);
    drawDoor(ctx, h.door, '#f4ecd8', '#6a4a2a', true);
  },
  tomb(ctx, P, h) { mausoleum(ctx, P, h, false); },
  crypt(ctx, P, h) { mausoleum(ctx, P, h, true); },
  // l'arbre aux pendus, mort et tordu
  tree(ctx, { R }, h) {
    const x = h.x, col = '#4a3a30';
    for (let y = GROUND; y > 70; y--) {
      const ww = 3 + Math.round((y - 70) / 26);
      R(x - ww / 2 + Math.round(Math.sin(y / 14) * 2), y, ww, 1, col);
    }
    line(R, x + 1, 104, x + 34, 78, 3, col); line(R, x + 22, 88, x + 30, 70, 2, col); line(R, x + 30, 81, x + 46, 82, 2, col);
    line(R, x - 1, 96, x - 28, 74, 3, col); line(R, x - 18, 82, x - 22, 64, 2, col); line(R, x - 26, 76, x - 40, 70, 2, col);
    line(R, x + 2, 72, x + 8, 56, 2, col); line(R, x, 72, x - 6, 58, 2, col);
    // la corde
    R(x + 26, 85, 1, 22, '#c8a868'); R(x + 24, 107, 5, 1, '#c8a868'); R(x + 23, 108, 1, 6, '#c8a868'); R(x + 29, 108, 1, 6, '#c8a868'); R(x + 24, 114, 5, 1, '#c8a868');
  },
  // tombe fraîchement creusée : trou, monticule de terre, pelle plantée
  grave(ctx, { R }, h) {
    const x = h.x;
    R(x - 1, GROUND - 4, 36, 5, OUT); R(x, GROUND - 3, 34, 4, '#2a1a10');
    S.disc(ctx, x + 50, GROUND, 13, OUT); S.disc(ctx, x + 50, GROUND, 12, '#7a5a3a'); R(x + 36, GROUND, 30, 2, '#7a5a3a');
    for (let k = 0; k < 8; k++) R(x + 42 + k * 2, GROUND - 8 + (k % 3), 1, 1, '#5a3a22');
    R(x + 54, GROUND - 30, 2, 22, '#7a5a3a'); R(x + 51, GROUND - 31, 8, 2, '#7a5a3a'); R(x + 52, GROUND - 10, 6, 6, '#8a8f98');
  },
  lodge(ctx, { R, box }, h, E, rnd) {
    const { x, w, top } = h;
    const col = E.col, dk = S.shade(col, -0.25), lt = S.shade(col, 0.14), trim = S.mix(col, '#f4ecd8', 0.55);
    box(x + w - 34, top - 16, 10, 14, '#6a4a3a');
    box(x, top, w, GROUND - top, col);
    siding(R, x, top, w, GROUND - top, dk);
    cornice(R, x, w, top, dk, lt);
    R(x, 96, w, 13, S.shade(col, -0.35)); R(x, 96, w, 1, lt); R(x, 108, w, 1, OUT);
    for (const wn of h.wins) drawWindow(ctx, wn, trim, rnd);
    drawDoor(ctx, h.door, trim, col);
    // cercueils debout contre le mur
    for (const cx of [x + w - 14]) {
      R(cx - 6, 120, 12, 46, OUT); R(cx - 5, 121, 10, 44, '#4a2c18'); R(cx - 6, 132, 12, 4, OUT); R(cx - 5, 133, 10, 2, '#5e3822');
      R(cx - 1, 126, 2, 10, '#c8b07c'); R(cx - 3, 129, 6, 2, '#c8b07c');
    }
  },
  farm(ctx, { R, box }, h, E, rnd) {
    const { x, w, top } = h;
    const col = '#d8c8a0', dk = S.shade(col, -0.2), lt = S.shade(col, 0.1);
    box(x + 30, top - 18, 12, 16, '#8a4a3a'); R(x + 30, top - 18, 12, 2, '#6a3a2a');
    box(x, top, w, GROUND - top, col);
    for (let y = top + 4; y < GROUND; y += 5) R(x, y, w, 1, dk); // planches horizontales
    cornice(R, x, w, top, '#8a4a2a', '#a8603a');
    for (const wn of h.wins) {
      drawWindow(ctx, wn, '#f4ecd8', rnd);
      for (const sx of [wn.x - 9, wn.x + wn.w + 4]) { box(sx, wn.y - 1, 5, wn.h + 2, E.col); for (let y = wn.y + 1; y < wn.y + wn.h; y += 3) R(sx, y, 5, 1, S.shade(E.col, -0.25)); }
    }
    drawDoor(ctx, h.door, '#f4ecd8', E.col);
    R(x - 6, GROUND - 6, w + 12, 6, '#8a6a48'); R(x - 6, GROUND - 6, w + 12, 1, '#a8885a'); // plancher du porche
  },
  windmill(ctx, { R, box }, h) {
    const cx = h.x + h.w / 2, top = h.top, col = '#5a4a40';
    const leg = (y) => Math.round(7 + ((y - top) / (GROUND - top)) * (h.w / 2 - 7));
    for (let y = top; y < GROUND; y++) { const hw = leg(y); R(cx - hw - 1, y, 3, 1, col); R(cx + hw - 1, y, 3, 1, col); }
    for (let k = 0; k < 5; k++) {
      const y0 = top + 6 + k * 20, y1 = y0 + 20;
      line(R, cx - leg(y0), y0, cx + leg(y1), y1, 1, col); line(R, cx + leg(y0), y0, cx - leg(y1), y1, 1, col);
      R(cx - leg(y1), y1, leg(y1) * 2, 1, col);
    }
    box(cx - 14, top, 28, 3, '#6a4a2a');
    // citerne à côté
    const tx = h.x + h.w + 16;
    for (const lx of [tx + 3, tx + 33]) box(lx, 128, 3, GROUND - 128, '#5a3a20');
    box(tx, 100, 40, 28, '#7a5a3a'); for (let k = 0; k < 40; k += 5) R(tx + k, 100, 1, 28, '#5a3a20');
    R(tx, 106, 40, 2, '#4a4f58'); R(tx, 120, 40, 2, '#4a4f58');
    R(tx + 18, 128, 3, 26, '#4a4f58'); R(tx + 14, 154, 11, 3, '#4a4f58');
  },
  barn(ctx, { R }, h, E, rnd) {
    const { x, w, top } = h;
    const col = E.col, dk = S.shade(col, -0.25), roof = '#4a2a20', trim = '#f4ecd8';
    const cx = x + w / 2, half = w / 2 + 6, knee = top - 28;
    // pignon en mansarde : pente raide jusqu'au genou, puis douce jusqu'au faîte
    const roofY = (px) => {
      const d = Math.abs(px - cx);
      if (d > half - 34) return Math.round(top - ((half - d) * 28) / 34);
      return Math.round(knee - ((half - 34 - d) * (knee - h.roof)) / (half - 34));
    };
    for (let px = x - 6; px < x + w + 6; px++) {
      const y = roofY(px);
      R(px, y - 4, 1, 1, OUT); R(px, y - 3, 1, 4, roof);
      if (px >= x && px < x + w) { R(px, y + 1, 1, GROUND - y - 1, (px - x) % 6 === 3 ? dk : col); }
    }
    R(x - 1, top, 1, GROUND - top, OUT); R(x + w, top, 1, GROUND - top, OUT);
    R(x, knee + 30, w, 2, trim); // bande blanche
    const loft = h.wins[0];
    R(cx - 2, loft.y - 10, 4, 6, '#3a2214'); R(cx - 1, loft.y - 4, 1, 4, '#c8a868'); // poulie du grenier à foin
    for (const wn of h.wins) drawWindow(ctx, wn, trim, rnd);
    const d = h.door;
    drawDoor(ctx, d, trim, col);
    R(d.x + 4, d.y + d.h - 12, 22, 12, '#d8b048'); R(d.x + 26, d.y + d.h - 8, 16, 8, '#c8a040'); // foin
    for (const lx of [d.x - 24, d.x + d.w + 4]) {
      R(lx - 1, d.y - 1, 22, d.h + 1, OUT); R(lx, d.y, 20, d.h, col);
      R(lx, d.y, 20, 2, trim); R(lx, d.y + d.h - 2, 20, 2, trim); R(lx, d.y, 2, d.h, trim); R(lx + 18, d.y, 2, d.h, trim);
      line(R, lx + 2, d.y + 2, lx + 18, d.y + d.h - 2, 2, trim); line(R, lx + 18, d.y + 2, lx + 2, d.y + d.h - 2, 2, trim);
    }
  },
  silo(ctx, { R, box }, h) {
    const { x, w, top } = h;
    box(x, top, w, GROUND - top, '#b0aca0');
    R(x, top, 6, GROUND - top, '#c8c4b8'); R(x + w - 8, top, 8, GROUND - top, '#8a867c');
    for (let y = top + 10; y < GROUND; y += 12) R(x, y, w, 1, '#6a6660');
    for (let dy = 0; dy < 12; dy++) {
      const hw = Math.round((w / 2 + 1) * Math.sqrt(1 - (dy / 12) ** 2));
      R(x + w / 2 - hw - 1, top - dy - 1, hw * 2 + 2, 1, OUT); R(x + w / 2 - hw, top - dy, hw * 2, 1, '#8a8a90');
    }
  },
  shed(ctx, { R, box }, h, E, rnd) {
    const { x, w, top } = h;
    const col = '#8a6a48', dk = S.shade(col, -0.25), lt = S.shade(col, 0.14);
    box(x, top, w, GROUND - top, col);
    siding(R, x, top, w, GROUND - top, dk);
    cornice(R, x, w, top, dk, lt);
    for (const wn of h.wins) drawWindow(ctx, wn, '#d8c8a0', rnd);
    drawDoor(ctx, h.door, '#d8c8a0', col);
    // fourche et roue de charrette contre le mur
    R(x + w - 12, 120, 2, 44, '#7a5a3a'); for (const dx of [-3, 0, 3]) R(x + w - 11 + dx, 116, 1, 6, '#8a8f98'); R(x + w - 14, 121, 7, 1, '#8a8f98');
    S.disc(ctx, x + 100, 152, 12, OUT); S.disc(ctx, x + 100, 152, 11, '#8a5a34'); S.disc(ctx, x + 100, 152, 8, col);
    for (let a = 0; a < 6; a++) line(R, x + 100, 152, x + 100 + Math.cos(a) * 9, 152 + Math.sin(a) * 9, 1, '#8a5a34');
  },
  office(ctx, { R, box }, h, E, rnd) {
    const { x, w, top } = h;
    const col = '#9a8460', dk = S.shade(col, -0.25), lt = S.shade(col, 0.14);
    box(x, top, w, GROUND - top, col);
    siding(R, x, top, w, GROUND - top, dk);
    cornice(R, x, w, top, dk, lt);
    for (const wn of h.wins) drawWindow(ctx, wn, '#d8c8a0', rnd);
    drawDoor(ctx, h.door, '#d8c8a0', col);
    // balance et pépites dans la vitrine
    R(h.wins[0].x + 6, h.wins[0].y + h.wins[0].h - 6, 10, 2, '#c8a040'); R(h.wins[0].x + 10, h.wins[0].y + h.wins[0].h - 12, 2, 6, '#c8a040');
  },
  tunnel(ctx, { R, box }, h) {
    const d = h.door;
    R(d.x - 3, d.y - 3, d.w + 6, GROUND - d.y + 3, '#2a1a10');
    R(d.x, d.y, d.w, GROUND - d.y, '#0e0806');
    for (let k = 0; k < 4; k++) R(d.x + 4 + k * 3, d.y + 8 + k * 6, d.w - 8 - k * 6, 1, '#1a100a');
    box(d.x - 8, d.y - 6, 6, GROUND - d.y + 6, '#7a5a3a'); box(d.x + d.w + 2, d.y - 6, 6, GROUND - d.y + 6, '#7a5a3a');
    box(d.x - 11, d.y - 12, d.w + 22, 7, '#8a6a48'); R(d.x - 11, d.y - 12, d.w + 22, 1, '#a8885a');
    for (const lx of [d.x + 10, d.x + d.w - 12]) R(lx, GROUND - 1, 2, 1, '#c8ccd0');
  },
  headframe(ctx, { R, box }, h) {
    const cx = h.x + h.w / 2, top = h.top, col = '#6a4a2a';
    line(R, h.x, GROUND, cx - 8, top, 3, col); line(R, h.x + h.w, GROUND, cx + 8, top, 3, col);
    line(R, h.x + h.w + 20, GROUND, cx + 6, top + 4, 2, col); // jambe de force
    for (let k = 1; k < 5; k++) {
      const y = top + k * 22, u = (y - top) / (GROUND - top);
      const l = cx - 8 - u * (cx - 8 - h.x), r = cx + 8 + u * (h.x + h.w - cx - 8);
      R(l, y, r - l, 2, col);
      if (k < 4) line(R, l, y, cx + 8 + ((y + 22 - top) / (GROUND - top)) * (h.x + h.w - cx - 8), y + 22, 1, col);
    }
    box(cx - 16, top, 32, 3, '#7a5a3a');
    line(R, cx - 9, top - 12, 520, 112, 1, '#3a3436'); // câble vers la galerie
  },
  mill(ctx, { R, box }, h, E, rnd) {
    const { x, w, top } = h;
    const col = E.col, dk = S.shade(col, -0.25), lt = S.shade(col, 0.14);
    box(x + w - 22, 18, 9, top - 18, '#4a4644'); R(x + w - 24, 18, 13, 3, '#3a3436'); // cheminée
    box(x + 90, 46, 80, top - 46, col); siding(R, x + 90, 46, 80, top - 46, dk); cornice(R, x + 90, 80, 46, dk, lt);
    drawWindow(ctx, { x: x + 120, y: 52, w: 18, h: 12 }, '#d8c8a0', rnd);
    box(x, top, w, GROUND - top, col);
    siding(R, x, top, w, GROUND - top, dk);
    cornice(R, x, w, top, dk, lt);
    for (const wn of h.wins) drawWindow(ctx, wn, '#d8c8a0', rnd);
    drawDoor(ctx, h.door, '#d8c8a0', col);
  },
  // baraquement en rondins
  bunk(ctx, { R, box }, h, E, rnd) {
    const { x, w, top } = h;
    const col = '#8a5a34', dk = '#5a3a20';
    box(x + 24, top - 18, 5, 16, '#3a3436');
    box(x, top, w, GROUND - top, col);
    for (let y = top + 1; y < GROUND; y += 6) { R(x, y + 4, w, 1, dk); S.disc(ctx, x + 1, y + 2, 2, '#a8784a'); S.disc(ctx, x + w - 2, y + 2, 2, '#a8784a'); }
    R(x - 6, top - 3, w + 12, 4, '#5a4a40'); R(x - 7, top - 4, w + 14, 1, OUT);
    for (const wn of h.wins) drawWindow(ctx, wn, '#c8a878', rnd);
    drawDoor(ctx, h.door, '#c8a878', col);
  },
};

// ------------------------------------------------------------ abris du premier plan
function drawCover(ctx, c) {
  const { R, box } = paint(ctx);
  const [w, h] = EDGE_COVER[c.kind];
  const x = c.x, top = PROP_BASE - h;
  switch (c.kind) {
    case 'stone': {
      const col = '#9a968c';
      for (let dy = 0; dy < 6; dy++) {
        const hw = Math.round((w / 2) * Math.sqrt(1 - ((6 - dy) / 6.5) ** 2));
        R(x + w / 2 - hw - 1, top + dy - 1, hw * 2 + 2, 1, OUT); R(x + w / 2 - hw, top + dy, hw * 2, 1, col);
      }
      box(x, top + 6, w, h - 6, col);
      R(x + 2, top + 4, 2, h - 6, '#b4b0a6');
      R(x + 6, top + 10, 12, 1, '#6a665c'); R(x + 8, top + 14, 8, 1, '#6a665c'); R(x + 7, top + 18, 10, 1, '#6a665c');
      R(x - 3, PROP_BASE - 2, w + 6, 2, '#6a6a3a');
      break;
    }
    case 'cross':
      R(x - 4, PROP_BASE - 3, w + 8, 3, '#7a6a3a');
      box(x + 8, top, 4, h, '#8a6a48'); box(x, top + 8, w, 4, '#8a6a48');
      R(x + 9, top, 1, h, '#a8885a');
      break;
    case 'tomb':
      box(x, top + 4, w, h - 4, '#a8a49a');
      box(x - 2, top, w + 4, 5, '#c0bcb0');
      R(x + w / 2 - 1, top + 7, 2, 11, '#8a867c'); R(x + w / 2 - 5, top + 10, 10, 2, '#8a867c');
      break;
    case 'hearse': {
      // corbillard noir vitré, plumets aux coins
      const ty = PROP_BASE - h;
      for (const px of [x + 6, x + 76]) { R(px, ty - 10, 4, 6, OUT); R(px + 1, ty - 9, 2, 5, '#2a2628'); }
      box(x + 2, ty - 4, 82, 4, '#1a1618');
      box(x + 6, ty, 74, 26, '#2a2628');
      for (const gx of [x + 12, x + 46]) { R(gx, ty + 4, 28, 15, '#6a7a80'); R(gx + 2, ty + 5, 6, 1, '#a8b8c0'); }
      R(x + 14, ty + 13, 58, 5, '#5a3a22'); // le cercueil, derrière la vitre
      R(x + 6, ty + 22, 74, 1, '#c8a040');
      for (const cx of [x + 16, x + 70]) {
        S.disc(ctx, cx, 190, 10, OUT); S.disc(ctx, cx, 190, 9, '#2a2628'); S.disc(ctx, cx, 190, 7, '#4a4644');
        R(cx - 7, 190, 15, 1, '#2a2628'); R(cx, 183, 1, 15, '#2a2628'); S.disc(ctx, cx, 190, 2, '#c8a040');
      }
      break;
    }
    case 'ore': {
      for (const cx of [x + 9, x + w - 9]) { S.disc(ctx, cx, PROP_BASE - 4, 4, OUT); S.disc(ctx, cx, PROP_BASE - 4, 3, '#3a3436'); }
      S.disc(ctx, x + 10, top + 5, 6, OUT); S.disc(ctx, x + 22, top + 3, 7, OUT); S.disc(ctx, x + 32, top + 6, 5, OUT);
      S.disc(ctx, x + 10, top + 5, 5, '#8a7a6a'); S.disc(ctx, x + 22, top + 3, 6, '#9a8a7a'); S.disc(ctx, x + 32, top + 6, 4, '#7a6a5a');
      R(x + 19, top, 2, 2, '#e0b040'); R(x + 9, top + 3, 2, 1, '#e0b040'); R(x + 30, top + 4, 1, 1, '#f8d070');
      box(x, top + 6, w, h - 12, '#5a5a62');
      R(x, top + 6, w, 2, '#7a7a82'); R(x, top + h - 9, w, 1, '#3a3a40');
      for (const px of [x + 3, x + w - 4]) for (const py of [top + 10, top + 15]) R(px, py, 1, 1, '#9a9aa2');
      break;
    }
    case 'rock':
      // éboulis (sans la terre battue de la grand-rue dessous)
      S.disc(ctx, x + 14, 190, 13, OUT); S.disc(ctx, x + 28, 188, 14, OUT); S.disc(ctx, x + 37, 194, 8, OUT);
      S.disc(ctx, x + 14, 190, 12, '#9a7a5a'); S.disc(ctx, x + 28, 188, 13, '#a8886a'); S.disc(ctx, x + 37, 194, 7, '#8a6a4a');
      R(x + 20, 178, 10, 2, '#c8a888'); R(x + 8, 184, 6, 1, '#c8a888');
      break;
    case 'tnt':
      drawProp(ctx, { x, kind: 'crates' });
      box(x + 5, top + 10, 22, 11, '#c0392b');
      // « TNT » en lettres claires
      R(x + 7, top + 12, 5, 1, '#f4ecd8'); R(x + 9, top + 12, 1, 7, '#f4ecd8');
      R(x + 13, top + 12, 1, 7, '#f4ecd8'); R(x + 17, top + 12, 1, 7, '#f4ecd8'); for (let k = 0; k < 3; k++) R(x + 14 + k, top + 13 + k * 2, 1, 2, '#f4ecd8');
      R(x + 19, top + 12, 6, 1, '#f4ecd8'); R(x + 21, top + 12, 1, 7, '#f4ecd8');
      break;
    default:
      drawProp(ctx, c);
  }
}

// porche du ranch (premier plan) : auvent et poteaux
function drawFront(ctx, E) {
  const { R, box } = paint(ctx);
  for (const h of E.houses) {
    if (h.kind !== 'farm') continue;
    R(h.x - 6, 107, h.w + 12, 8, OUT);
    for (let x = h.x - 5; x < h.x + h.w + 5; x += 8) R(x, 108, Math.min(8, h.x + h.w + 5 - x), 6, ((x - h.x) >> 3) & 1 ? '#8a4a2a' : '#a8603a');
    for (const px of [h.x - 3, h.x + 64, h.x + 140, h.x + h.w]) box(px, 115, 3, GROUND - 121, '#7a5a3a');
  }
}

export function renderEdge(E) {
  const bg = S.makeCanvas(EDGE_W, H);
  const front = S.makeCanvas(EDGE_W, H);
  const ctx = bg.getContext('2d');
  const P = paint(ctx);
  const rnd = seeded(53 + (E.seed % 991));
  GROUNDS[E.kind](ctx, P, E, rnd);
  for (const h of E.houses) {
    HOUSES[h.kind](ctx, P, h, E, rnd);
    if (h.sign && h.kind !== 'gate') {
      const sw = signW(h.sign.t), cx = h.x + h.w / 2;
      P.box(cx - sw / 2, h.sign.y - 2, sw, 12, '#e8d4a0');
      P.R(cx - sw / 2, h.sign.y + 8, sw, 2, '#c8b07c');
    }
  }
  const fx = front.getContext('2d');
  for (const c of E.covers) drawCover(fx, c);
  drawFront(fx, E);
  return { bg, front };
}

// enseignes (texte par-dessus le décor)
export function edgeSigns(w, camX, E) {
  for (const h of E.houses) {
    if (!h.sign) continue;
    const x = h.x + h.w / 2 - camX;
    if (x < -80 || x > W + 80) continue;
    canvasText(w, h.sign.t, x, h.sign.y, { size: 8, color: '#3a2214', shadow: '#c8b07c' });
  }
}

// La nuit : une partie des fenêtres éclairées, lueur au fond des galeries de mine
export function edgeLights(ctx, camX, E, amb) {
  if (!amb.env.lights) return;
  for (const h of E.houses) {
    if (!h.w || h.x - camX > W || h.x + h.w - camX < 0) continue;
    (h.wins || []).forEach((wn, k) => { if (h.kind === 'chapel' || hash(h.x * 7 + k) < 0.6) amb.window(ctx, wn.x - camX, wn.y, wn.w, wn.h); });
    if (h.kind === 'tunnel') amb.glow(ctx, h.door.x + h.door.w / 2 - camX, h.door.y + 24, 20, '255,190,110');
    if (h.belfry) amb.glow(ctx, h.belfry.x + h.belfry.w / 2 - camX, h.belfry.y + 8, 14);
  }
}
