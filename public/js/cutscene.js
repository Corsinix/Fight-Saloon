// Courtes cinématiques d'ouverture (≈ 5 s), jouées en local au début de chaque partie :
// un plan d'ensemble propre au jeu, les gros plans des joueurs façon western spaghetti,
// puis le titre frappé comme un tampon sur une affiche. Un clic (ou une touche) la passe.
// Mini-jeux : elle occupe le début du compte à rebours (miniscene.js) ; roulette : l'événement « intro » (scene.js).
import * as S from './sprites.js';
import { canvasText } from './scene.js';
import { sfx } from './audio.js';
import { W, H, CUT_MS } from './worlds.js';
import { desertOpts, Ambience } from './env.js';
import { SKIN, CLOTH_COLORS } from './data.js';

export const CUT_FADE = 300; // fondu de sortie, pendant lequel le panneau des règles apparaît dessous
const SHOT1 = 2000; // fin du plan d'ensemble
const SHOT2 = 3500; // fin des gros plans ; ensuite le titre jusqu'à CUT_MS
const BAR = 22; // bandes noires du format cinéma
const INK = '#1a0f0a', CREAM = '#fdf6e0', GOLD = '#f8d070';

const clamp01 = (k) => (k < 0 ? 0 : k > 1 ? 1 : k);
const ease = (k) => 1 - (1 - clamp01(k)) ** 3;
const hash = (n) => {
  let t = (n * 0x6d2b79f5) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const R = (ctx, x, y, w, h, col) => { ctx.fillStyle = col; ctx.fillRect(Math.round(x), Math.round(y), w, h); };
// rectangles cernés d'un contour sombre (comme les sprites du jeu)
function outlined(ctx, x, y, rects) {
  x = Math.round(x); y = Math.round(y);
  for (const [dx, dy, w, h] of rects) R(ctx, x + dx - 1, y + dy - 1, w + 2, h + 2, S.OUT);
  for (const [dx, dy, w, h, col] of rects) R(ctx, x + dx, y + dy, w, h, col);
}
const flipX = (rects, dir) => (dir > 0 ? rects : rects.map(([dx, dy, w, h, c]) => [-dx - w, dy, w, h, c]));

// Silhouettes : couleurs de tenue et de chapeau d'un personnage de l'éditeur
const looks = (c = {}) => ({
  coat: CLOTH_COLORS[c.outfitColor] ?? CLOTH_COLORS[2],
  hat: CLOTH_COLORS[c.hatColor] ?? CLOTH_COLORS[1],
  skin: SKIN[c.skin] || SKIN[1],
});
const crowdLook = (i) => ({
  coat: CLOTH_COLORS[Math.floor(hash(i * 7 + 1) * CLOTH_COLORS.length)],
  hat: CLOTH_COLORS[Math.floor(hash(i * 7 + 2) * CLOTH_COLORS.length)],
  skin: SKIN[Math.floor(hash(i * 7 + 3) * SKIN.length)] || SKIN[1],
});

// Petit cowboy debout, pieds en (x, y)
function person(ctx, x, y, { coat, hat, skin }, step = 0) {
  const a = step % 2;
  outlined(ctx, x, y, [
    [-3, -8, 2, 8 - a, '#3a2e28'], [1, -8, 2, 7 + a, '#3a2e28'],
    [-4, -16, 8, 9, coat], [-5, -15, 1, 6, coat], [4, -15, 1, 6, coat],
    [-2, -20, 5, 4, skin],
    [-5, -21, 11, 1, hat], [-3, -24, 7, 3, hat],
  ]);
}

// Cheval au galop (avec cavalier si rider), pieds en (x, y), tourné vers dir
function horse(ctx, x, y, col, t, dir = 1, rider = null) {
  const f = Math.floor(t / 90) % 2;
  const d = S.shade(col, -0.3);
  const legs = f ? [[-7, -6, 2, 6, d], [-3, -6, 2, 5, d], [4, -6, 2, 5, d], [8, -6, 2, 6, d]]
    : [[-8, -6, 2, 5, d], [-4, -6, 2, 6, d], [5, -6, 2, 6, d], [7, -6, 2, 5, d]];
  outlined(ctx, x, y, flipX([
    ...legs,
    [-9, -13, 19, 7, col], [8, -18, 4, 7, col], [11, -19, 5, 4, col], [-11, -13, 2, 6, d],
    [9, -19, 1, 2, d],
  ], dir));
  if (!rider) return;
  outlined(ctx, x, y, flipX([
    [-2, -21, 6, 8, rider.coat], [-1, -25, 4, 4, rider.skin],
    [-4, -26, 10, 1, rider.hat], [-2, -29, 6, 3, rider.hat],
  ], dir));
}

function cow(ctx, x, y, t, i) {
  const f = Math.floor(t / 80 + i) % 2;
  const col = ['#6a4028', '#3a2a22', '#a8703c', '#e8dcc8'][i % 4];
  const patch = col === '#e8dcc8' ? '#3a2a22' : '#e8dcc8';
  outlined(ctx, x, y, [
    [-7, -5, 2, 5 - f, '#2a201c'], [-3, -5, 2, 4 + f, '#2a201c'], [3, -5, 2, 5 - f, '#2a201c'], [6, -5, 2, 4 + f, '#2a201c'],
    [-8, -12, 17, 7, col], [8, -13, 5, 5, col], [12, -14, 1, 2, '#e8dcc8'], [9, -15, 1, 2, '#e8dcc8'],
    [-10, -12, 2, 4, col],
  ]);
  R(ctx, x - 4, y - 11, 4, 3, patch);
}

function wheel(ctx, cx, cy, r, a, col = '#5a3218') {
  S.disc(ctx, cx, cy, r + 1, S.OUT);
  S.disc(ctx, cx, cy, r, col);
  S.disc(ctx, cx, cy, r - 2, '#c8a070');
  ctx.fillStyle = col;
  for (let k = 0; k < 4; k++) {
    const an = a + (k * Math.PI) / 4;
    for (let s = -r + 2; s <= r - 2; s++) ctx.fillRect(Math.round(cx + Math.cos(an) * s), Math.round(cy + Math.sin(an) * s), 1, 1);
  }
  S.disc(ctx, cx, cy, 1, S.OUT);
}

// Bouffées de fumée ou de poussière qui montent puis s'effacent
function puffs(ctx, n, every, life, el, at, { vx = 0.01, vy = -0.03, r0 = 2, grow = 0.005, col = '230,226,220', a0 = 0.7 } = {}) {
  for (let i = 0; i < n; i++) {
    const born = i * every;
    const age = el - born;
    if (age < 0 || age > life) continue;
    const p = at(born, i);
    if (!p) continue;
    S.disc(ctx, p.x + age * vx, p.y + age * vy, Math.round(r0 + age * grow), `rgba(${col},${a0 * (1 - age / life)})`);
  }
}

function plank(ctx, x, y, w, h, col) {
  R(ctx, x, y, w, h, col);
  for (let yy = y + 4; yy < y + h; yy += 5) R(ctx, x, yy, w, 1, S.shade(col, -0.25));
}

function facade(ctx, x, w, h, col, sign, base = 172) {
  const top = base - h;
  R(ctx, x - 1, top - 1, w + 2, h + 1, S.OUT);
  plank(ctx, x, top, w, h, col);
  R(ctx, x - 2, top + 22, w + 4, 3, S.shade(col, -0.4)); // auvent
  for (let k = 0; k < 2; k++) {
    const wx = x + 8 + k * (w - 28);
    R(ctx, wx - 1, top + 6, 14, 12, S.OUT);
    R(ctx, wx, top + 7, 12, 10, '#3a4a5a');
    R(ctx, wx + 5, top + 7, 1, 10, S.OUT);
  }
  R(ctx, x + w / 2 - 6, base - 18, 12, 18, S.OUT);
  R(ctx, x + w / 2 - 5, base - 17, 10, 17, '#4a2a14');
  if (sign) {
    R(ctx, x + 4, top - 9, w - 8, 9, '#eadcb0');
    R(ctx, x + 4, top - 1, w - 8, 1, S.OUT);
    canvasText(ctx, sign, x + w / 2, top - 8, { color: '#4a2a14', shadow: '' });
  }
}

// ---------------------------------------------------------------- plans d'ensemble
// Chaque plan dessine sur le calque du décor (teinté ensuite selon l'ambiance). el : ms depuis le début.
const SHOTS = {
  // La locomotive entre en gare de Dusty Gulch
  shooter: {
    caption: 'DUSTY GULCH, GARE DU PACIFIQUE',
    cues: [[0, 'puff'], [600, 'puff'], [1500, 'clank']],
    draw(ctx, el) {
      const lx = (e) => W + 10 - (W - 120) * ease(Math.min(1, e / 1500));
      const x = lx(el);
      R(ctx, 0, 166, W, 3, '#5a5a62');
      for (let tx = 0; tx < W; tx += 8) R(ctx, tx, 169, 5, 2, '#4a2a14');
      // wagons
      for (let k = 0; k < 2; k++) {
        const wx = x + 122 + k * 78;
        outlined(ctx, wx, 0, [[0, 124, 72, 36, '#7a2a1e'], [-2, 120, 76, 4, '#3a2014']]);
        for (let j = 0; j < 4; j++) R(ctx, wx + 6 + j * 17, 132, 10, 10, '#f0c070');
        wheel(ctx, wx + 14, 162, 5, -el / 60);
        wheel(ctx, wx + 58, 162, 5, -el / 60);
      }
      // locomotive
      outlined(ctx, x, 0, [
        [0, 150, 8, 10, '#5a5a62'], [6, 134, 54, 20, '#2a2622'], [14, 116, 8, 18, '#2a2622'], [12, 112, 12, 5, '#2a2622'],
        [58, 120, 26, 40, '#4a2a22'], [55, 116, 32, 4, '#2a2622'], [86, 136, 34, 24, '#3a2e28'],
      ]);
      R(ctx, x + 6, 134, 54, 2, '#5a5652');
      for (const bx of [20, 36, 50]) R(ctx, x + bx, 134, 2, 20, '#c89a40');
      R(ctx, x + 63, 126, 14, 10, '#f0c070');
      S.disc(ctx, x + 4, 140, 3, '#fff070');
      wheel(ctx, x + 18, 162, 5, -el / 60);
      wheel(ctx, x + 38, 158, 9, -el / 90, '#7a2a1e');
      wheel(ctx, x + 66, 158, 9, -el / 90, '#7a2a1e');
      puffs(ctx, 14, 140, 1500, el, (b) => ({ x: lx(b) + 18, y: 108 }), { vx: 0.012, vy: -0.035, r0: 3, grow: 0.007 });
      // gare et quai, devant
      facade(ctx, 6, 100, 66, '#9a6a40', 'DUSTY GULCH', 176);
      plank(ctx, 0, 176, W, 40, '#7a5236');
      R(ctx, 0, 176, W, 2, '#a8784c');
    },
  },

  // Le troupeau traverse la plaine, un cavalier fait tourner son lasso
  lasso: {
    caption: 'LA GRANDE PLAINE, À LA SAISON DU RODÉO',
    cues: [[200, 'moo'], [900, 'rope'], [1500, 'moo']],
    draw(ctx, el, players) {
      for (let i = 0; i < 10; i++) {
        const y = 136 + Math.round(hash(i + 3) * 60);
        const x = -40 - hash(i) * 120 + el * (0.12 + hash(i + 9) * 0.05) + (i % 3) * 30;
        if (x > W + 30) continue;
        puffs(ctx, 3, 120, 360, (el % 360) + 360, () => ({ x: x - 10, y: y - 3 }), { vx: -0.02, vy: -0.01, r0: 2, col: '214,170,110', a0: 0.5 });
        cow(ctx, x, y, el, i);
      }
      const rx = 50 + el * 0.04 + Math.sin(el / 400) * 4, ry = 190;
      horse(ctx, rx, ry, '#8a5228', el, 1, looks(players[0]?.character));
      // la boucle du lasso tourne au-dessus du chapeau
      const a = el / 120;
      ctx.fillStyle = '#d9b070';
      for (let k = 0; k < 28; k++) {
        if ((k + Math.floor(a * 3)) % 7 === 0) continue;
        const an = (k / 28) * Math.PI * 2 + a;
        ctx.fillRect(Math.round(rx + 2 + Math.cos(an) * 11), Math.round(ry - 36 + Math.sin(an) * 4), 1, 1);
      }
      R(ctx, rx + 2, ry - 34, 1, 6, '#d9b070');
    },
  },

  // La grand-rue à l'heure du duel : deux silhouettes, un virevoltant passe entre elles
  duel: {
    caption: 'GRAND-RUE, L\'HEURE DU DUEL',
    cues: [[0, 'ding'], [900, 'ding']],
    draw(ctx, el, players) {
      facade(ctx, -10, 92, 80, '#8a5a38', 'BANQUE');
      facade(ctx, W - 82, 92, 88, '#7a4a30', 'SALOON');
      R(ctx, 0, 172, W, 44, '#c2643e');
      const pos = [120, 264];
      pos.forEach((x, i) => {
        const look = looks(players[i]?.character);
        ctx.fillStyle = 'rgba(60,20,10,0.35)';
        ctx.fillRect(x - (i ? 22 : -2), 172, 22, 3); // ombre courte de midi
        person(ctx, x, 172, look);
        // la main frémit au-dessus de l'étui
        const tw = el > 1300 && Math.floor(el / 110 + i) % 3 === 0 ? 1 : 0;
        R(ctx, x + (i ? -6 : 5), 158 + tw, 2, 2, look.skin);
      });
      const tx = -20 + (el / SHOT1) * (W + 40);
      S.tumbleweed(ctx, Math.round(tx), Math.round(176 - Math.abs(Math.sin(el / 160)) * 8), el);
    },
  },

  // La foule de la ville ; l'avis de recherche tombe au milieu
  charlie: {
    caption: 'UN JOUR DE MARCHÉ EN VILLE',
    cues: [[1150, 'thud']],
    draw(ctx, el, players, extra) {
      ['HÔTEL', 'BANQUE', 'SALOON', 'ÉPICERIE'].forEach((s, i) => facade(ctx, 4 + i * 96, 88, 70 + (i % 2) * 14, ['#9a6a40', '#7a4a30', '#8a5a38', '#a87a4a'][i], s));
      plank(ctx, 0, 172, W, 6, '#7a5236');
      R(ctx, 0, 178, W, 38, '#c2643e');
      for (let i = 0; i < 18; i++) {
        const dir = hash(i + 40) < 0.5 ? -1 : 1;
        const v = 0.015 + hash(i + 50) * 0.02;
        const x = (((hash(i + 60) * (W + 40) + dir * el * v) % (W + 40)) + W + 40) % (W + 40) - 20;
        person(ctx, x, 186 + Math.round(hash(i + 70) * 26), crowdLook(i), Math.floor(el / 160 + i));
      }
      const k = ease((el - 700) / 450);
      if (k <= 0) return;
      const py = Math.round(-110 + k * 140), px = W / 2 - 44;
      R(ctx, px - 1, py - 1, 90, 102, S.OUT);
      R(ctx, px, py, 88, 100, '#eadcb0');
      R(ctx, px + 3, py + 3, 82, 94, '#e0d0a0');
      canvasText(ctx, 'RECHERCHÉ', W / 2, py + 6, { color: '#7a1a14', shadow: '' });
      const spr = extra?.suspect?.();
      if (spr) ctx.drawImage(spr, 0, 0, spr.width, spr.height, W / 2 - spr.ox * 2, py + 78 - spr.oy * 2, spr.width * 2, spr.height * 2);
      else canvasText(ctx, '?', W / 2, py + 34, { size: 24, color: '#4a2a14', shadow: '' });
      canvasText(ctx, 'CHARLIE', W / 2, py + 86, { color: '#4a2a14', shadow: '' });
      for (const [nx, ny] of [[3, 3], [84, 3]]) R(ctx, px + nx, py + ny, 2, 2, '#5a5a62');
    },
  },

  // Le fort sur la mesa, des cavaliers approchent dans la poussière
  fort: {
    caption: 'FORT SAINT-JUDE, AUX MARCHES DU TERRITOIRE',
    cues: [[200, 'neigh'], [900, 'far'], [1500, 'far']],
    draw(ctx, el, players) {
      const x0 = 150, x1 = 360, top = 118, base = 172;
      R(ctx, x0 - 1, top - 1, x1 - x0 + 2, base - top + 1, S.OUT);
      for (let x = x0; x < x1; x += 6) {
        R(ctx, x, top + 3, 5, base - top - 3, x % 12 ? '#8a5228' : '#7a4620');
        R(ctx, x + 1, top, 3, 3, '#7a4620');
        R(ctx, x + 2, top - 2, 1, 2, '#5a3218');
      }
      R(ctx, 241, 138, 28, 34, S.OUT);
      plank(ctx, 242, 139, 26, 33, '#5a3218');
      for (const tx of [x0 - 4, x1 - 22]) {
        outlined(ctx, tx, 0, [[0, 98, 26, 20, '#7a4620'], [-2, 94, 30, 4, '#4a2a14'], [3, 118, 3, 20, '#5a3218'], [20, 118, 3, 20, '#5a3218']]);
        R(ctx, tx + 6, 104, 14, 6, '#2a1a10');
      }
      // drapeau qui claque au vent
      R(ctx, x1 - 9, 66, 1, 28, S.OUT);
      for (let c = 0; c < 16; c++) {
        const dy = Math.round(Math.sin(el / 140 - c / 2.5) * 1.5);
        R(ctx, x1 - 8 + c, 67 + dy, 1, 10, c < 6 ? '#3a5a9a' : Math.floor(c / 2) % 2 ? '#c0392b' : '#eadcb0');
      }
      // coups de feu depuis les tours
      for (const [at, tx] of [[900, x0 + 9], [1500, x1 - 15]]) {
        if (el > at && el < at + 500) S.disc(ctx, tx, 106 - (el - at) * 0.02, Math.round(2 + (el - at) * 0.006), `rgba(230,226,220,${0.8 * (1 - (el - at) / 500)})`);
        if (el > at && el < at + 60) R(ctx, tx - 3, 105, 4, 2, '#fff070');
      }
      for (let i = 0; i < 3; i++) {
        const rx = -30 + el * 0.06 - i * 34, ry = 196 + i * 6;
        puffs(ctx, 3, 120, 360, (el % 360) + 360, () => ({ x: rx - 12, y: ry - 3 }), { vx: -0.02, vy: -0.012, r0: 3, col: '214,170,110', a0: 0.5 });
        horse(ctx, rx, ry, ['#5a3a20', '#3a2a22', '#a8703c'][i], el + i * 40, 1, i < players.length ? looks(players[i].character) : crowdLook(i + 5));
      }
    },
  },

  // Le chariot bâché file sur la piste, des bandits paraissent sur la crête
  wagon: {
    caption: 'LA PISTE DE RED ROCK',
    cues: [[100, 'neigh'], [500, 'whip'], [1300, 'far']],
    draw(ctx, el) {
      const scroll = (p, sp) => ((((p * 137) - el * sp) % (W + 80)) + W + 80) % (W + 80) - 40;
      for (let p = 0; p < 6; p++) {
        const x = scroll(p, 0.08);
        R(ctx, x, 150, 2, 10, '#5a3a20');
      }
      for (let p = 0; p < 10; p++) R(ctx, scroll(p * 3 + 1, 0.2), 190 + (p % 3) * 7, 4, 2, '#8a3a24');
      // bandits sur la crête
      if (el > 900) for (let i = 0; i < 3; i++) horse(ctx, W - 30 - (el - 900) * 0.03 - i * 22, 132, S.OUT, el + i * 70, -1, { coat: S.OUT, skin: S.OUT, hat: S.OUT });
      const wx = 120, wy = 178;
      puffs(ctx, 4, 100, 400, (el % 400) + 400, () => ({ x: wx - 6, y: wy - 3 }), { vx: -0.04, vy: -0.01, r0: 3, col: '214,170,110', a0: 0.5 });
      for (let i = 0; i < 2; i++) horse(ctx, wx + 104 + i * 26, wy, ['#8a5228', '#5a3a20'][i], el + i * 45, 1);
      R(ctx, wx + 78, wy - 12, 22, 1, '#4a2a14');
      const bob = Math.floor(el / 140) % 2;
      outlined(ctx, wx, wy - bob, [[0, -26, 80, 14, '#8a5228'], [76, -32, 6, 8, '#6a4020']]);
      // bâche
      for (let c = 0; c < 72; c += 1) {
        const h = Math.round(22 * Math.sin((c / 72) * Math.PI) ** 0.5);
        R(ctx, wx + 4 + c, wy - bob - 26 - h, 1, h, c % 18 < 2 ? '#c8b480' : '#eadcb0');
      }
      R(ctx, wx + 3, wy - bob - 27, 74, 1, S.OUT);
      wheel(ctx, wx + 14, wy - 6, 9, el / 70);
      wheel(ctx, wx + 66, wy - 6, 9, el / 70);
    },
  },

  // Au comptoir, une chope glisse et s'arrête au ras du bout
  pinte: {
    caption: 'LE COMPTOIR DU SALOON, SAMEDI SOIR',
    indoor: true,
    cues: [[0, 'rope'], [1500, 'glass']],
    draw(ctx, el) {
      plank(ctx, 0, 0, W, 140, '#5a3420');
      for (const sy of [46, 86]) {
        R(ctx, 30, sy, 200, 4, '#3a2014');
        for (let b = 0; b < 12; b++) {
          const col = ['#4a7a3a', '#7a2a1e', '#c89a40', '#3a5a9a'][b % 4];
          const bh = 14 + (b % 3) * 3;
          outlined(ctx, 36 + b * 16, sy - bh, [[0, 4, 8, bh - 4, col], [2, 0, 4, 4, col]]);
          R(ctx, 37 + b * 16, sy - bh + 6, 2, bh - 8, S.shade(col, 0.3));
        }
      }
      // miroir et lampe
      R(ctx, 262, 24, 96, 72, S.OUT);
      R(ctx, 264, 26, 92, 68, '#7a8a8a');
      R(ctx, 264, 26, 92, 4, '#a8b4b4');
      const fl = 0.08 + 0.03 * Math.sin(el / 90);
      S.disc(ctx, 310, 16, 30, `rgba(255,200,120,${fl})`);
      outlined(ctx, 306, 8, [[0, 0, 8, 8, '#c89a40']]);
      // comptoir
      R(ctx, 0, 140, W, 10, '#a06a38');
      R(ctx, 0, 140, W, 2, '#c8905a');
      plank(ctx, 0, 150, W, 66, '#5a3218');
      R(ctx, 352, 140, 2, 10, S.OUT);
      R(ctx, 354, 140, 30, 76, INK);
      const k = ease(el / 1500);
      const mx = Math.round(10 + 322 * k);
      const wob = el > 1500 && el < 1800 ? (Math.floor(el / 50) % 2 ? 1 : -1) : 0;
      if (k < 1) for (let s = 1; s < 6; s++) R(ctx, mx - s * 8, 141, 5, 1, `rgba(253,246,224,${0.25 - s * 0.04})`);
      outlined(ctx, mx, 140, [[0, -16, 12, 16, '#e0a030'], [12, -12, 3, 8, '#c89a40'], [-1 + wob, -19, 14, 4, CREAM]]);
      R(ctx, mx + 2, 140 - 13, 2, 11, '#f8d070');
    },
  },

  // L'entrée de la mine, un wagonnet chargé d'or s'y enfonce
  mine: {
    caption: 'LA MINE DU VIEUX JOE',
    cues: [[150, 'clank'], [1100, 'clank']],
    draw(ctx, el) {
      // falaise
      for (let x = 150; x < W; x += 2) {
        const top = 60 + Math.round(Math.abs(Math.sin(x / 23)) * 18 + Math.abs(Math.sin(x / 7)) * 4);
        R(ctx, x, top - 1, 2, H - top + 1, S.OUT);
        R(ctx, x + (x === 150 ? 1 : 0), top, 2, H - top, x % 6 ? '#7a5a48' : '#6a4a3a');
      }
      for (let i = 0; i < 40; i++) R(ctx, 152 + hash(i) * 230, 80 + hash(i + 1) * 100, 3, 1, '#5a3a2e');
      // entrée
      R(ctx, 214, 104, 64, 72, '#120a06');
      R(ctx, 0, 176, W, 40, '#9a6a48');
      for (let tx = 0; tx < 280; tx += 9) R(ctx, tx, 176, 5, 3, '#4a2a14');
      R(ctx, 0, 175, 278, 1, '#8a8f98');
      const cx = Math.round(-40 + 270 * ease(el / 1800));
      outlined(ctx, cx, 0, [[0, 156, 30, 14, '#6a707a'], [-2, 154, 34, 3, '#8a8f98']]);
      for (let g = 0; g < 5; g++) R(ctx, cx + 3 + g * 5, 151 - (g % 2) * 2, 5, 4, g % 2 ? '#f8d070' : '#e0b040');
      wheel(ctx, cx + 7, 172, 3, el / 40, '#3a3e46');
      wheel(ctx, cx + 23, 172, 3, el / 40, '#3a3e46');
      // l'obscurité avale le wagonnet
      ctx.fillStyle = 'rgba(18,10,6,0.85)';
      ctx.fillRect(218, 108, 56, 68);
      outlined(ctx, 208, 0, [[0, 100, 6, 76, '#8a5228'], [70, 100, 6, 76, '#8a5228'], [-4, 96, 84, 6, '#7a4620']]);
      R(ctx, 226, 84, 40, 11, '#eadcb0');
      canvasText(ctx, 'DANGER', 246, 86, { color: '#7a1a14', shadow: '' });
      for (const lx of [204, 290]) {
        const sw = Math.round(Math.sin(el / 300 + lx) * 2);
        R(ctx, lx + sw, 104, 1, 8, S.OUT);
        outlined(ctx, lx - 2 + sw, 112, [[0, 0, 5, 6, '#f8d070']]);
        S.disc(ctx, lx + sw, 115, 9, `rgba(255,200,100,${0.12 + 0.05 * Math.sin(el / 70 + lx)})`);
      }
    },
  },

  // Le champ de courses : la tribune est pleine, les stalles s'ouvrent, les chevaux s'élancent
  course: {
    caption: 'LE GRAND PRIX DE DUSTY GULCH',
    cues: [[200, 'neigh'], [700, 'gunshot'], [800, 'whip'], [1300, 'neigh']],
    draw(ctx, el, players) {
      // tribune et sa foule
      R(ctx, 150, 62, 222, 6, S.OUT);
      for (let x = 0; x < 220; x += 11) R(ctx, 151 + x, 63, 11, 4, (x / 11) % 2 ? CREAM : '#c0392b');
      R(ctx, 151, 68, 220, 46, '#7a4a28');
      for (let row = 0; row < 3; row++) {
        for (let k = 0; k < 26; k++) {
          const id = row * 29 + k;
          const jump = el > 700 && Math.floor(el / 150 + hash(id) * 4) % 2 ? -2 : 0;
          const px = 155 + k * 8 + (row % 2) * 4, py = 74 + row * 13 + jump;
          R(ctx, px, py + 3, 5, 5, ['#c0392b', '#3a6ec0', '#e0b040', '#4a7a3a', CREAM][Math.floor(hash(id) * 5)]);
          R(ctx, px + 1, py, 3, 3, ['#f0c8a0', '#c89060', '#8a5a3a'][Math.floor(hash(id + 1) * 3)]);
        }
      }
      // lisse blanche et piste
      R(ctx, 0, 126, W, 90, '#c08050');
      for (let i = 0; i < 40; i++) R(ctx, hash(i) * W, 130 + hash(i + 9) * 80, 2, 1, '#a87040');
      for (let x = 4; x < W; x += 30) R(ctx, x, 114, 2, 14, '#e8e4d8');
      R(ctx, 0, 115, W, 2, '#f4f0e4');
      // stalles de départ : les portes s'ouvrent au coup de pistolet
      const open = el > 700;
      for (let i = 0; i < 4; i++) {
        const y = 140 + i * 15;
        R(ctx, 34, y - 26, 36, 3, '#7a8a9a');
        if (!open) R(ctx, 68, y - 24, 2, 22, '#c9ced6');
        else R(ctx, 68, y - 24, 8, 2, '#c9ced6');
      }
      // les chevaux (ceux des joueurs, puis des chevaux de course)
      for (let i = 0; i < 4; i++) {
        const y = 140 + i * 15;
        const run = Math.max(0, el - 720 - i * 40);
        const x = 54 + run * (0.15 + hash(i + 3) * 0.04) + (run * run) * 0.00003;
        if (run > 0) puffs(ctx, 3, 110, 330, (el % 330) + 330, () => ({ x: x - 12, y: y - 2 }), { vx: -0.03, vy: -0.01, r0: 2, col: '214,170,120', a0: 0.5 });
        horse(ctx, x, y, ['#8a4a24', '#3a2c26', '#e8dcc8', '#d8a850'][i], run > 0 ? el + i * 37 : 0, 1, i < players.length ? looks(players[i].character) : crowdLook(i + 11));
      }
      // le starter et son pistolet, de la fumée au coup de feu
      person(ctx, 96, 128, { coat: '#3a2a22', hat: '#1a0f0a', skin: SKIN[1] });
      R(ctx, 99, 103, 1, 3, '#3a2a22');
      if (el > 700) puffs(ctx, 1, 0, 600, el - 700, () => ({ x: 100, y: 101 }), { vx: 0.005, vy: -0.02, r0: 2, a0: 0.8 });
    },
  },

  // Plan par défaut (jeu sans plan à lui) : les cavaliers des joueurs traversent le désert
  default: {
    caption: 'QUELQUE PART DANS L\'OUEST',
    cues: [[200, 'neigh'], [1200, 'neigh']],
    draw(ctx, el, players) {
      players.forEach((p, i) => {
        const x = -30 + el * (0.17 - i * 0.012) - i * 26, y = 158 + i * 14;
        puffs(ctx, 3, 120, 360, (el % 360) + 360, () => ({ x: x - 12, y: y - 3 }), { vx: -0.02, vy: -0.012, r0: 3, col: '214,170,110', a0: 0.5 });
        horse(ctx, x, y, ['#8a5228', '#5a3a20', '#a8703c', '#3a2a22'][i % 4], el + i * 50, 1, looks(p.character));
      });
    },
  },
};

// ---------------------------------------------------------------- cinématique
// players : [{ name, character, color }] ; extra.establish(ctx, el) remplace le plan d'ensemble (roulette).
export class Cutscene {
  constructor({ kind, players, me, env, title, sub, caption, extra = {} }) {
    this.kind = kind;
    this.shot = SHOTS[kind] || SHOTS.default;
    this.players = players;
    this.me = me;
    this.env = env;
    this.title = title;
    this.sub = sub;
    this.caption = (caption || this.shot?.caption || '').toUpperCase();
    this.extra = extra;
    this.amb = env ? new Ambience(env) : null;
    this.fired = null;
    const per = Math.min(160, 700 / Math.max(1, players.length));
    this.faceAt = players.map((_, i) => SHOT1 + 120 + i * per);
    this.cues = [
      ...(extra.cues || this.shot?.cues || []),
      [SHOT1, 'whip'],
      ...this.faceAt.map((at) => [at + 160, 'thud']),
      [SHOT2, 'revolver'],
    ];
  }

  draw(ctx, el, now) {
    // les sons déjà passés (reconnexion en pleine cinématique) ne sont pas rejoués
    if (!this.fired) this.fired = new Set(this.cues.filter(([at]) => at < el - 150));
    for (const c of this.cues) if (el >= c[0] && !this.fired.has(c)) { this.fired.add(c); sfx(c[1]); }

    ctx.save();
    ctx.globalAlpha = el > CUT_MS - CUT_FADE ? clamp01((CUT_MS - el) / CUT_FADE) : 1;
    if (el < SHOT1) this.establishing(ctx, el, now);
    else if (el < SHOT2) this.faces(ctx, el - SHOT1, now);
    else this.titleCard(ctx, el - SHOT2);
    if (el < SHOT2) this.bars(ctx, el);
    // ouverture au noir et coupe franche entre les plans
    const cut = el < 250 ? 1 - el / 250 : Math.abs(el - SHOT1) < 60 || Math.abs(el - SHOT2) < 60 ? 0.6 : 0;
    if (cut > 0) { ctx.fillStyle = `rgba(10,5,3,${cut})`; ctx.fillRect(0, 0, W, H); }
    if (el > 400 && el < CUT_MS - CUT_FADE) canvasText(ctx, 'CLIC : PASSER', W - 6, 7, { color: '#8a7a68', align: 'right' });
    ctx.restore();
  }

  bars(ctx, el) {
    const b = Math.round(BAR * ease(el / 300));
    R(ctx, 0, 0, W, b, '#0a0503');
    R(ctx, 0, H - b, W, b, '#0a0503');
    if (el < SHOT1 && this.caption) {
      const n = Math.floor(clamp01((el - 300) / 900) * this.caption.length);
      if (n > 0) canvasText(ctx, this.caption.slice(0, n), 10, H - 15, { color: '#e2d2a6', align: 'left' });
    }
  }

  layerCtx() {
    const L = (this.layer ||= S.makeCanvas(W, H));
    const l = L.getContext('2d');
    l.setTransform(1, 0, 0, 1, 0, 0);
    l.clearRect(0, 0, W, H);
    l.imageSmoothingEnabled = false;
    return l;
  }

  establishing(ctx, el, now) {
    if (this.extra.establish) return this.extra.establish(ctx, el);
    const shot = this.shot;
    if (!shot) { R(ctx, 0, 0, W, H, INK); return; }
    const env = this.env || {};
    if (!shot.indoor) {
      const key = env.id || 'midi';
      if (this.bgKey !== key) {
        this.bg = S.makeCanvas(W, H);
        S.drawDesert(this.bg.getContext('2d'), 0, 0, W, H, { ...desertOpts(env, { sunX: 0.7, sunY: 0.28 }), cacti: false });
        this.bgKey = key;
      }
      ctx.drawImage(this.bg, 0, 0);
      this.amb?.sky(ctx, now);
    }
    // le décor passe par un calque teinté selon l'heure (comme dans les jeux)
    const tint = !shot.indoor && env.tint;
    const l = tint ? this.layerCtx() : ctx;
    shot.draw(l, el, this.players, this.extra);
    if (tint) {
      this.tinted = S.tintCanvas(this.layer, tint, this.tinted);
      ctx.drawImage(this.tinted, 0, 0);
    }
    if (!shot.indoor && this.kind !== 'mine') this.amb?.weather(ctx, now);
  }

  // Gros plans des joueurs, côte à côte, chacun sur un fond à sa couleur
  faces(ctx, el, now) {
    const n = this.players.length;
    R(ctx, 0, 0, W, H, INK);
    const cw = W / n;
    const scale = n >= 4 ? 3 : 4;
    const sw = 28, sh = 36, sx = 10, sy = 4; // cadrage du visage dans le sprite 48×56
    this.players.forEach((p, i) => {
      const k = ease((el + SHOT1 - this.faceAt[i]) / 260);
      if (k <= 0) return;
      const x0 = Math.round(i * cw), x1 = Math.round((i + 1) * cw);
      const dir = i % 2 ? -1 : 1;
      const off = Math.round((1 - k) * 60 * dir);
      ctx.save();
      ctx.beginPath();
      ctx.rect(x0, BAR, x1 - x0, H - BAR * 2);
      ctx.clip();
      const bands = [-0.75, -0.62, -0.5, -0.4];
      bands.forEach((a, b) => R(ctx, x0, BAR + off + (b * (H - BAR * 2)) / 4, x1 - x0, (H - BAR * 2) / 4 + 1, S.shade(p.color, a)));
      const spr = S.characterSprite(p.character || {}, { blink: (now + i * 900) % 3100 < 130, t: now });
      const fw = sw * scale, fh = sh * scale;
      const fx = Math.round((x0 + x1) / 2 - fw / 2), fy = BAR + 6 + off;
      ctx.drawImage(spr, sx, sy, sw, sh, fx, fy, fw, fh);
      ctx.restore();
      const label = i === this.me ? `${p.name} (TOI)` : p.name;
      canvasText(ctx, label.toUpperCase(), (x0 + x1) / 2, H - BAR - 14 + Math.round((1 - k) * 20), { color: p.color });
      if (i) R(ctx, x0 - 1, BAR, 2, H - BAR * 2, INK);
    });
    if (n === 2 && el > 600) {
      const k = ease((el - 600) / 200);
      canvasText(ctx, 'VS', W / 2, H / 2 - 12 - Math.round((1 - k) * 10), { size: 24, color: GOLD });
    }
  }

  // Le titre tamponné sur une affiche clouée
  titleCard(ctx, el) {
    R(ctx, 0, 0, W, H, '#3a2014');
    for (let y = 0; y < H; y += 9) R(ctx, 0, y, W, 1, '#2a160c');
    const pw = 300, ph = 120, px = (W - pw) / 2, py = (H - ph) / 2;
    const shake = el < 220 ? Math.round((Math.random() - 0.5) * 4 * (1 - el / 220)) : 0;
    ctx.save();
    ctx.translate(shake, shake);
    R(ctx, px - 1, py - 1, pw + 2, ph + 2, S.OUT);
    R(ctx, px, py, pw, ph, '#eadcb0');
    R(ctx, px + 4, py + 4, pw - 8, ph - 8, '#e0d0a0');
    for (let i = 0; i < 14; i++) R(ctx, px + hash(i) * pw, py + (i % 2 ? ph - 1 : 0), 3, 1, '#3a2014'); // bords écornés
    for (const [nx, ny] of [[5, 5], [pw - 7, 5], [5, ph - 7], [pw - 7, ph - 7]]) R(ctx, px + nx, py + ny, 2, 2, '#5a5a62');
    if (this.env?.name) canvasText(ctx, this.env.name, W / 2, py + 14, { color: '#8a6a48', shadow: '' });
    const size = this.title.length > 15 ? 16 : 24;
    // tampon : le titre arrive deux fois trop grand puis s'écrase sur l'affiche
    const k = ease(el / 160);
    const big = this.stamp ||= (() => {
      const c = S.makeCanvas(W, 40);
      canvasText(c.getContext('2d'), this.title, W / 2, 4, { size, color: '#9a2a1c', shadow: '#c8b480' });
      return c;
    })();
    const z = 2 - k;
    ctx.globalAlpha *= 0.4 + 0.6 * k;
    ctx.drawImage(big, Math.round(W / 2 - (W * z) / 2), Math.round(py + 36 - 4 * z), Math.round(W * z), Math.round(40 * z));
    ctx.globalAlpha /= 0.4 + 0.6 * k;
    if (el > 250) {
      R(ctx, px + 40, py + 72, pw - 80, 1, '#a08a60');
      canvasText(ctx, this.sub.toUpperCase(), W / 2, py + 80, { color: '#4a2a14', shadow: '' });
    }
    if (el > 450) canvasText(ctx, `${this.players.length} JOUEURS`, W / 2, py + 96, { color: '#8a6a48', shadow: '' });
    ctx.restore();
    if (el < 70) { ctx.fillStyle = 'rgba(255,251,232,0.5)'; ctx.fillRect(0, 0, W, H); }
  }
}
