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
// robes des chevaux de course, une par cavalier (6 au plus)
const ROBES = ['#8a4a24', '#3a2c26', '#e8dcc8', '#d8a850', '#b0582a', '#8a8c90'];

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

// Bouteille posée sur une étagère, fond en (x, base) ; kind : 0 whisky, 1 flasque ronde, 2 vin, 3 cruchon.
// Renvoie sa largeur.
function bottle(ctx, x, base, kind, col) {
  const hi = S.shade(col, 0.35), label = '#e8dcbc';
  const shapes = [
    [[0, -14, 5, 14, col], [1, -19, 3, 5, col], [1, -20, 3, 1, '#c89a40']],
    [[0, -9, 8, 9, col], [3, -13, 2, 4, col]],
    [[0, -12, 6, 12, col], [1, -14, 4, 2, col], [2, -19, 2, 5, col]],
    [[0, -8, 7, 8, col], [2, -10, 3, 2, col], [7, -7, 2, 4, col]],
  ];
  outlined(ctx, x, base, shapes[kind]);
  const w = [5, 8, 6, 7][kind];
  R(ctx, x + 1, base - [12, 7, 10, 6][kind], 1, [9, 5, 7, 4][kind], hi); // reflet
  if (kind !== 1) R(ctx, x, base - [8, 0, 7, 5][kind], w, 3, label); // étiquette
  return w;
}

// Client assis au comptoir, vu de dos ; (x, y) : le siège du tabouret. turn : -1 / 1, il tourne la tête de ce côté.
// arm (bras droit) : 0 posé sur le comptoir, 1 levé (poing serré), 2 qui s'abat sur le comptoir, 3 tendu vers la droite
function patronBack(ctx, x, y, { coat, hat, skin }, turn = 0, arm = 0) {
  const dark = '#3a2414';
  R(ctx, x - 7, y + 3, 2, H - y, dark); R(ctx, x + 5, y + 3, 2, H - y, dark); R(ctx, x - 7, y + 15, 14, 1, dark);
  outlined(ctx, x, y, [[-10, 0, 20, 3, '#7a4a28']]);
  const right = [
    [[7, -28, 5, 15, coat]],
    [[7, -44, 5, 18, coat], [7, -49, 6, 5, skin]],
    [[7, -30, 6, 10, coat], [8, -32, 7, 5, skin]],
    [[7, -28, 18, 5, coat], [25, -29, 5, 5, skin]],
  ][arm];
  outlined(ctx, x, y, [
    [-8, -30, 16, 31, coat], [-12, -28, 5, 15, coat], ...right,
    [-3, -34, 6, 4, skin], [-5, -42, 10, 9, '#3a2a1e'],
    [-9, -43, 18, 2, hat], [-5, -49, 10, 6, hat],
  ]);
  R(ctx, x - 8, y - 30, 16, 1, S.shade(coat, 0.18));
  R(ctx, x, y - 28, 1, 28, S.shade(coat, -0.28)); // couture du dos
  R(ctx, x - 5, y - 45, 10, 1, S.shade(hat, -0.4)); // ruban du chapeau
  R(ctx, x - 9, y - 4, 18, 2, '#2a1a10'); // ceinture
  if (turn) { R(ctx, x + (turn > 0 ? 4 : -6), y - 40, 2, 6, skin); R(ctx, x + (turn > 0 ? 5 : -6), y - 38, 1, 1, S.OUT); } // la joue et l'œil
}

// Le comptoir du saloon, plan large (cinématique de la pinte). o :
//   slam : le premier client lève le bras (1) puis frappe le comptoir (2) ; shake : tout tremble sous le coup
//   bubble : 0 à 1, sa réplique s'écrit dans une bulle ; grab : il tend la main vers la chope
//   bart : { look : -1 / 0 / 1, rub : il essuie son verre, throw : bras tendu, il vient de lancer la chope }
//   mug : { x, from, moving, wob, spill } la chope qui glisse vers la gauche (null : pas de chope)
function saloonBar(ctx, el, players, o) {
  ctx.save();
  if (o.shake) ctx.translate(Math.floor(el / 30) % 2 ? 1 : -1, 1);
  // le mur : papier peint bordeaux à motifs dorés, cimaise, lambris
  R(ctx, 0, 0, W, 104, '#4e1a18');
  for (let y = 4; y < 100; y += 12) for (let x = (y / 12) % 2 < 1 ? 0 : 6; x < W; x += 12) {
    R(ctx, x + 5, y, 2, 1, '#7a3a26'); R(ctx, x + 4, y + 1, 4, 1, '#6a3020'); R(ctx, x + 5, y + 2, 2, 1, '#7a3a26');
  }
  R(ctx, 0, 100, W, 3, '#2a140c'); R(ctx, 0, 100, W, 1, '#8a5a34');
  plank(ctx, 0, 103, W, 37, '#3e2214');
  // l'affiche de Black Bart, punaisée au mur
  outlined(ctx, 6, 40, [[0, 0, 15, 20, '#e8d8a8']]);
  R(ctx, 7, 41, 13, 3, '#a8302a'); R(ctx, 10, 46, 7, 7, '#8a7a5a'); R(ctx, 11, 47, 5, 3, '#3a2a1e'); R(ctx, 9, 55, 9, 1, '#6a5a3a'); R(ctx, 9, 57, 6, 1, '#6a5a3a');
  // le buffet derrière le bar : corniche, colonnes, fonds en miroir, étagères de bouteilles
  R(ctx, 26, 24, 214, 117, S.OUT);
  R(ctx, 27, 25, 212, 115, '#2e1810');
  for (const [x0, x1] of [[33, 130], [136, 233]]) {
    R(ctx, x0, 33, x1 - x0, 102, '#232a30');
    for (let s = 0; s < 3; s++) for (let d = 0; d < 26; d++) R(ctx, x0 + 8 + s * 30 + d, 34 + d * 3, 2, 3, 'rgba(190,210,220,0.07)');
  }
  R(ctx, 27, 25, 212, 8, '#6a4024'); R(ctx, 27, 25, 212, 1, '#a8784a'); R(ctx, 27, 31, 212, 1, '#3a2014');
  for (const cx of [27, 130, 233]) { R(ctx, cx, 33, 6, 107, '#5a3420'); R(ctx, cx + 1, 33, 1, 107, '#8a5a34'); R(ctx, cx - 1, 33, 8, 3, '#7a4a28'); }
  for (const sy of [66, 104]) {
    R(ctx, 33, sy, 200, 3, '#7a4a28'); R(ctx, 33, sy, 200, 1, '#a8784a');
    let x = 36;
    for (let b = 0; x < 228; b++) {
      if (x > 121 && x < 140) x = 140;
      if (sy === 104 && x > 150 && x < 196) { // une pyramide de verres retournés
        for (let r = 0; r < 3; r++) for (let g = 0; g < 4 - r; g++) {
          const gx = 152 + r * 4 + g * 9, gy = sy - 8 - r * 8 - (o.shake && g % 2 ? 1 : 0);
          R(ctx, gx - 1, gy - 1, 8, 9, S.OUT); R(ctx, gx, gy, 6, 7, '#9ab4bc'); R(ctx, gx + 1, gy + 1, 1, 5, '#e0f0f4'); R(ctx, gx, gy, 6, 1, '#c8dce0');
        }
        x = 198;
      }
      x += bottle(ctx, x, sy, Math.floor(hash(b * 3 + sy) * 4), ['#3a6a2a', '#7a2a1e', '#c89a40', '#2a4a8a', '#6a3a1a', '#d8d0b8'][Math.floor(hash(b * 5 + sy) * 6)]) + 3;
    }
  }
  // l'horloge et son balancier
  outlined(ctx, 244, 34, [[0, 0, 16, 40, '#5a3420']]);
  S.disc(ctx, 252, 44, 7, S.OUT); S.disc(ctx, 252, 44, 6, '#e8dcbc');
  R(ctx, 252, 40, 1, 4, INK); R(ctx, 252, 44, 3, 1, INK);
  R(ctx, 246, 53, 12, 18, '#2a1810');
  const pend = Math.round(Math.sin(el / 320) * 3);
  R(ctx, 252 + Math.round(pend / 2), 54, 1, 11, '#c89a40'); S.disc(ctx, 252 + pend, 66, 2, '#e0b040');
  // le grand miroir au cadre doré
  R(ctx, 266, 26, 96, 80, S.OUT);
  R(ctx, 267, 27, 94, 78, '#c89a40'); R(ctx, 267, 27, 94, 1, '#f4d47a');
  R(ctx, 271, 31, 86, 70, '#4a5a62');
  for (let d = 0; d < 40; d++) R(ctx, 280 + d, 32 + d, 3, 1, 'rgba(220,235,240,0.12)');
  for (let d = 0; d < 26; d++) R(ctx, 318 + d, 32 + d, 2, 1, 'rgba(220,235,240,0.1)');
  S.disc(ctx, 296, 40, 4, 'rgba(255,220,150,0.5)');
  // le barman : moustache en guidon, gilet rouge, nœud papillon
  const bart = o.bart || {};
  const look = bart.look || 0;
  const bx = 312, sk = SKIN[1];
  outlined(ctx, bx, 140, [
    [-13, -38, 26, 38, '#e8e0cc'], [12, -36, 4, 18, '#e8e0cc'],
    bart.throw ? [-34, -24, 22, 5, '#e8e0cc'] : [-16, -36, 4, 18, '#e8e0cc'], // le bras qui vient de lancer la chope
    [-6, -52, 12, 13, sk],
  ]);
  R(ctx, bx - 13, 102, 7, 38, '#8a2a20'); R(ctx, bx + 6, 102, 7, 38, '#8a2a20');
  R(ctx, bx - 7, 110, 1, 1, '#e0b040'); R(ctx, bx - 7, 118, 1, 1, '#e0b040'); R(ctx, bx - 7, 126, 1, 1, '#e0b040');
  R(ctx, bx + 12, 112, 4, 2, '#a8302a');
  if (!bart.throw) R(ctx, bx - 16, 112, 4, 2, '#a8302a'); else R(ctx, bx - 28, 116, 2, 5, '#a8302a');
  R(ctx, bx - 4, 102, 8, 3, INK); R(ctx, bx - 1, 102, 2, 3, '#3a3a3a');
  R(ctx, bx - 6, 88, 12, 2, S.shade(sk, 0.25));
  R(ctx, bx - 7, 92, 2, 6, '#5a4a3a'); R(ctx, bx + 5, 92, 2, 6, '#5a4a3a');
  R(ctx, bx - 4 + look, 93, 2, 1, INK); R(ctx, bx + 2 + look, 93, 2, 1, INK);
  R(ctx, bx - 4, 91, 3, 1, '#5a4a3a'); R(ctx, bx + 2, 91, 3, 1, '#5a4a3a');
  R(ctx, bx - 6, 97, 12, 2, '#4a3a2a'); R(ctx, bx - 8, 95, 2, 3, '#4a3a2a'); R(ctx, bx + 6, 95, 2, 3, '#4a3a2a');
  if (bart.throw) outlined(ctx, bx - 38, 115, [[0, 0, 5, 5, sk]]); // la main ouverte
  else {
    const rub = bart.rub ? Math.round(Math.sin(el / 110) * 2) : 0;
    outlined(ctx, bx - 4, 118, [[0, 0, 8, 10, '#a8c4cc'], [1, 1, 2, 8, '#e0f0f4']]);
    outlined(ctx, bx - 8 + rub, 122, [[0, 0, 7, 5, sk], [9, 0, 7, 5, sk], [2, -2, 12, 4, '#f4ecd8']]);
  }
  // deux lampes à pétrole suspendues
  for (const lx of [100, 206]) {
    R(ctx, lx, 0, 1, 34, '#3a3a3a');
    outlined(ctx, lx - 7, 34, [[0, 0, 15, 3, '#c89a40'], [3, 3, 9, 8, '#fff0b0'], [1, 11, 13, 2, '#c89a40']]);
    R(ctx, lx - 2, 38, 5, 5, '#fffbe0');
  }
  // le comptoir : plateau ciré, reflets des lampes
  R(ctx, 0, 139, 354, 1, S.OUT);
  R(ctx, 0, 140, 354, 10, '#9a6234'); R(ctx, 0, 140, 354, 2, '#c8905a'); R(ctx, 0, 148, 354, 2, '#6a3e1e');
  for (const lx of [100, 206]) R(ctx, lx - 14, 143, 28, 1, 'rgba(255,230,170,0.35)');
  R(ctx, 354, 139, 30, 77, '#140c08'); R(ctx, 352, 139, 2, 11, S.OUT);
  // la chope qui glisse vers le client, et la traînée mouillée qu'elle laisse
  const m = o.mug;
  if (m) {
    const mx = m.x;
    if (m.from - mx > 4) R(ctx, mx + 12, 141, m.from - mx, 1, 'rgba(253,246,224,0.22)');
    if (m.moving) for (let s = 1; s < 6; s++) R(ctx, mx + 10 + s * 8, 141, 5, 1, `rgba(253,246,224,${0.3 - s * 0.05})`);
    outlined(ctx, mx, 140, [[0, -16, 12, 16, '#d8902a'], [12, -13, 4, 9, '#b8c8cc'], [-1 + m.wob, -20, 14, 5, CREAM]]);
    R(ctx, mx + 2, 127, 2, 11, '#f8d070'); R(ctx, mx + 8, 129, 1, 9, '#a8681e');
    for (let b = 0; b < 4; b++) R(ctx, mx + 3 + b * 2, 136 - ((el / 60 + b * 5) % 9), 1, 1, '#fff2b0');
    R(ctx, mx + 1 + m.wob, 120, 3, 1, '#ffffff');
    if (m.spill > 0 && m.spill < 1) for (let d = 0; d < 5; d++) R(ctx, mx + 4 + (d - 2) * 8 * m.spill, 120 - Math.sin(m.spill * Math.PI) * (6 + d), 2, 2, CREAM);
  }
  // sur le bord du comptoir : la bouteille et les petits verres, les cartes, le bol de cacahuètes
  const hop = o.shake ? -1 : 0; // ils sautent quand le poing s'abat
  outlined(ctx, 22, 149 + hop, [[0, -16, 6, 16, '#6a3a1a'], [2, -21, 2, 5, '#6a3a1a'], [0, -10, 6, 5, '#e8d8a8']]);
  for (const gx of [32, 39]) outlined(ctx, gx, 149 + (gx === 39 ? hop * 2 : hop), [[0, -5, 4, 5, '#c8a050']]);
  outlined(ctx, 160, 149, [[0, -2, 8, 2, CREAM], [5, -3, 8, 2, '#e8d8b8']]); R(ctx, 172, 147, 3, 2, '#a8302a'); R(ctx, 175, 146, 3, 3, '#3a6ec0');
  outlined(ctx, 214, 149, [[0, -4, 12, 4, '#8a5a34'], [2, -6, 8, 2, '#c8905a']]);
  // le devant du comptoir : panneaux moulurés et barre de cuivre pour les pieds
  R(ctx, 0, 150, 354, 66, '#4a2814');
  for (let x = 0; x < 354; x += 50) {
    R(ctx, x, 150, 5, 66, '#5a3420'); R(ctx, x + 1, 150, 1, 66, '#7a4a28');
    R(ctx, x + 10, 158, 34, 22, '#3a1e0e'); R(ctx, x + 10, 158, 34, 1, '#6a3e1e'); R(ctx, x + 10, 179, 34, 1, '#6a3e1e');
  }
  R(ctx, 0, 186, 354, 3, '#c89a40'); R(ctx, 0, 186, 354, 1, '#f4d47a');
  for (let x = 25; x < 354; x += 50) R(ctx, x, 182, 2, 5, '#a87a28');
  // les clients au comptoir, de dos : les joueurs d'abord ; le premier réclame à boire
  const nb = Math.max(4, players.length);
  for (let i = 0; i < nb; i++) {
    const px = 74 + i * (nb > 4 ? 46 : 62);
    const lk = i < players.length ? looks(players[i].character) : crowdLook(i + 21);
    const turn = m && Math.abs(m.x - px) < 34 && m.moving ? Math.sign(m.x - px) || 1 : i === 0 && o.bubble ? 1 : 0;
    patronBack(ctx, px, 168, lk, turn, i === 0 ? (o.grab ? 3 : o.slam || 0) : 0);
  }
  if (o.slam === 2) for (const [dx, dy] of [[-8, -4], [0, -8], [8, -4]]) R(ctx, 74 + 14 + dx, 136 + dy, 1, 3, CREAM); // l'impact
  puffs(ctx, 6, 260, 1500, el % 1560 + 1500, () => ({ x: 146, y: 124 }), { vx: 0.006, vy: -0.025, r0: 1, grow: 0.004, col: '220,214,200', a0: 0.45 });
  // la lumière des lampes et la poussière qui y danse
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const lx of [100, 206]) {
    const fl = 0.16 + 0.04 * Math.sin(el / 80 + lx);
    const g = ctx.createRadialGradient(lx, 40, 0, lx, 40, 90);
    g.addColorStop(0, `rgba(255,190,110,${fl})`);
    g.addColorStop(1, 'rgba(255,190,110,0)');
    ctx.fillStyle = g;
    ctx.fillRect(lx - 90, 0, 180, 140);
  }
  for (let i = 0; i < 18; i++) {
    const x = 70 + hash(i) * 170 + Math.sin(el / 700 + i) * 6, y = 50 + ((hash(i + 40) * 90 + el * 0.008 * (1 + (i % 3))) % 90);
    R(ctx, x, y, 1, 1, 'rgba(255,230,180,0.5)');
  }
  ctx.restore();
  const v = ctx.createRadialGradient(W / 2, 110, 90, W / 2, 110, 240);
  v.addColorStop(0, 'rgba(10,5,3,0)');
  v.addColorStop(1, 'rgba(10,5,3,0.6)');
  ctx.fillStyle = v;
  ctx.fillRect(-4, -4, W + 8, H + 8);
  // la réplique, dans une bulle au-dessus du client
  if (o.bubble > 0) {
    const txt = 'UN VERRE, BARMAN !', n = Math.ceil(o.bubble * txt.length);
    const bw = 112, bx0 = 30, by0 = 56;
    R(ctx, bx0 - 1, by0 - 1, bw + 2, 17, S.OUT); R(ctx, bx0, by0, bw, 15, CREAM);
    R(ctx, bx0 + 1, by0 + 14, bw - 2, 1, '#d8c8a0');
    for (let k = 0; k < 9; k++) { R(ctx, 70 + k * 0.4 - 1, by0 + 15 + k, 4 - k * 0.35 + 2, 1, S.OUT); R(ctx, 70 + k * 0.4, by0 + 15 + k, Math.max(1, 4 - k * 0.35), 1, CREAM); }
    canvasText(ctx, txt.slice(0, n), bx0 + 6, by0 + 4, { align: 'left', color: INK, shadow: '' });
  }
  ctx.restore();
}

// Très gros plan sur les yeux du barman, comme dans les vieux jeux d'aventure : peau unie, traits noirs d'un
// pixel, yeux en amande mi-clos. Il glisse un regard vers le client, hausse un sourcil, sue, sa moustache
// frémit, puis il plisse les yeux. e : ms depuis le début du plan (≈ 950). Dessiné en pleine résolution,
// avec un lent zoom avant (on recalcule les tracés, les traits restent fins).
const FACE_SKIN = '#f8b07a';
function bartenderCloseUp(ctx, e) {
  const z = 1 + 0.1 * ease(e / 950), cx = W / 2, cy = 100;
  const X = (x) => Math.round(cx + (x - cx) * z), Y = (y) => Math.round(cy + (y - cy) * z);
  const dot = (x, y, s = 1) => ctx.fillRect(X(x), Y(y), s, s);
  // courbe de Bézier quadratique, tracée point par point (t de from à to)
  const curve = (x0, y0, qx, qy, x1, y1, th = 1, from = 0, to = 1) => {
    const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * z * 1.4 * (to - from)) + 2;
    for (let i = 0; i <= n; i++) {
      const t = from + ((to - from) * i) / n, u = 1 - t;
      dot(u * u * x0 + 2 * u * t * qx + t * t * x1, u * u * y0 + 2 * u * t * qy + t * t * y1, th);
    }
  };
  const line = (x0, y0, x1, y1, th = 1) => curve(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2, x1, y1, th);
  const seg = (x, y0, y1, col) => { if (y1 > y0) { ctx.fillStyle = col; ctx.fillRect(X(x), Y(y0), Math.ceil(z), Math.max(1, Y(y1) - Y(y0))); } };

  const look = e < 250 ? 0 : e < 450 ? -30 * ease((e - 250) / 200) : -30; // le regard glisse vers le client
  const raise = e > 300 && e < 640 ? 5 * ease((e - 300) / 150) : 0; // un sourcil qui monte
  const squint = e > 640 ? ease((e - 640) / 180) : 0; // les yeux qui se plissent
  const frown = squint * 5;
  const tw = (e > 460 && e < 540) || (e > 760 && e < 820) ? 3 : 0; // la moustache frémit
  R(ctx, 0, 0, W, H, FACE_SKIN);
  ctx.fillStyle = INK;

  // les sourcils, broussailleux, en haut du cadre (le gauche se fronce, le droit monte puis se fronce aussi)
  for (let i = 0; i < 170; i++) {
    const left = i % 2 === 0, u = hash(i + 300), v = hash(i + 700);
    const bx = left ? 8 + u * 156 : 220 + u * 156;
    const inner = left ? u : 1 - u; // 1 : du côté du nez
    const by = 40 - v * 16 - (left ? 0 : raise) + inner * frown + (1 - inner) * 4;
    const dx = (left ? 1 : -1) * (5 + hash(i + 900) * 7);
    line(bx, by, bx + dx, by - 5 - hash(i + 950) * 5, i % 5 ? 1 : 2);
  }
  // les plis du front entre les sourcils
  line(187, 22, 184 - frown * 0.4, 46);
  line(198, 22, 201 + frown * 0.4, 44);

  // un œil en amande : coins xa (côté gauche de l'image) et xb, ouverture open
  const eye = (xa, xb, ey, open, outer) => {
    const mid = (xa + xb) / 2;
    const uq = ey - 34 * open, lq = ey + 8 + 8 * open;
    const yU = (t) => (1 - t) * (1 - t) * ey + 2 * t * (1 - t) * uq + t * t * ey;
    const yL = (t) => (1 - t) * (1 - t) * ey + 2 * t * (1 - t) * lq + t * t * ey;
    const icx = mid + look, icy = ey - 3, ir = 18, pr = 8;
    for (let x = xa; x <= xb; x += 1 / z) {
      const t = (x - xa) / (xb - xa), top = yU(t) + 1, bot = yL(t);
      seg(x, top, bot, '#f2eee6');
      const dx = x - icx;
      if (Math.abs(dx) < ir) {
        const h = Math.sqrt(ir * ir - dx * dx);
        seg(x, Math.max(top, icy - h), Math.min(bot, icy + h), Math.abs(dx) > ir - 4 ? '#3e2a0c' : '#5a3e14');
      }
      if (Math.abs(dx) < pr) { const h = Math.sqrt(pr * pr - dx * dx); seg(x, Math.max(top, icy - h), Math.min(bot, icy + h), INK); }
    }
    // reflet dans l'œil, s'il n'est pas caché par la paupière
    const tr = (icx - 6 - xa) / (xb - xa);
    if (tr > 0 && tr < 1 && icy - 7 > yU(tr) + 1) { ctx.fillStyle = '#ffffff'; dot(icx - 6, icy - 7, 2); }
    ctx.fillStyle = '#e89282'; dot(outer ? xb - 3 : xa + 1, ey - 1, 3); // le coin de l'œil, côté nez
    ctx.fillStyle = INK;
    curve(xa, ey, mid, uq, xb, ey, 2); // paupière supérieure, épaisse
    curve(xa, ey, mid, lq, xb, ey, 1);
    // les plis de la paupière, les poches sous les yeux
    curve(xa + 8, ey - 7, mid, uq - 12, xb - 6, ey - 6, 1, 0.05, 0.95);
    curve(xa + 18, ey - 12, mid, uq - 22, xb - 16, ey - 12, 1, 0.15, 0.8);
    curve(xa + 10, ey + 7, mid, lq + 12, xb - 8, ey + 6, 1, 0.08, 0.92);
    curve(xa + 22, ey + 15, mid, lq + 22, xb - 18, ey + 13, 1, 0.2, 0.75);
  };
  const open = 0.85 - 0.5 * squint;
  eye(28, 160, 102, open, true);
  eye(224, 356, 102, open + raise * 0.03, false);
  // les pattes d'oie, au coin extérieur de chaque œil
  for (const [x0, s] of [[28, -1], [356, 1]]) {
    line(x0 + s * 4, 98, x0 + s * 22, 90 - squint * 3);
    line(x0 + s * 6, 102, x0 + s * 26, 101);
    line(x0 + s * 4, 106, x0 + s * 20, 113 + squint * 3);
    line(x0 + s * 14, 94, x0 + s * 24, 86);
  }

  // le nez : l'arête qui descend entre les yeux, l'aile et la narine en bas du cadre
  curve(180, 50, 168, 128, 150, 192);
  curve(205, 52, 210, 70, 208, 94, 1, 0, 1);
  curve(196, 158, 216, 156, 219, 188);
  curve(150, 176, 160, 172, 167, 188);

  // la moustache, qui déborde en bas du cadre
  for (let i = 0; i < 120; i++) {
    const left = i % 2 === 0, u = hash(i + 1300);
    const bx = left ? 60 + u * 100 : 222 + u * 100;
    const by = 176 + hash(i + 1500) * 12 - tw;
    line(bx, by, bx + (left ? -1 : 1) * (2 + hash(i + 1700) * 5), by + 8, i % 3 ? 1 : 2);
  }

  // une grosse goutte de sueur qui coule sur la tempe
  if (e > 350) {
    const sy = 46 + Math.min(40, (e - 350) / 12);
    ctx.fillStyle = INK; dot(345, sy - 1); dot(344, sy, 3); dot(343, sy + 2, 5); dot(344, sy + 6, 3);
    ctx.fillStyle = '#bfe4f4'; dot(345, sy + 1); dot(344, sy + 3, 3);
    ctx.fillStyle = '#ffffff'; dot(344, sy + 3);
  }
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

  // « Un verre, barman ! » : le client tape sur le comptoir, très gros plan sur la tête du barman (façon
  // western spaghetti), puis la chope file le long du comptoir jusqu'à lui
  pinte: {
    caption: 'LE COMPTOIR DU SALOON, SAMEDI SOIR',
    indoor: true,
    len: 2800, // plan d'ensemble plus long que les autres : il raconte une petite scène
    cues: [[0, 'rope'], [250, 'thud'], [960, 'whip'], [1150, 'heartbeat'], [1450, 'heartbeat'], [1640, 'ding'], [1960, 'rope'], [2390, 'glass']],
    draw(ctx, el, players) {
      if (el < 950) {
        saloonBar(ctx, el, players, {
          slam: el > 110 && el < 250 ? 1 : el >= 250 && el < 360 ? 2 : 0,
          shake: el >= 250 && el < 330,
          bubble: el > 300 ? clamp01((el - 300) / 450) : 0,
          bart: { look: el > 380 ? -1 : 0, rub: el < 300 },
        });
      } else if (el < 1900) bartenderCloseUp(ctx, el - 950);
      else {
        const e = el - 1900, k = ease(e / 480);
        saloonBar(ctx, el, players, {
          mug: { x: Math.round(296 - 200 * k), from: 296, moving: k < 0.99, wob: e > 480 && e < 760 ? (Math.floor(e / 50) % 2 ? 1 : -1) : 0, spill: e > 480 ? (e - 480) / 400 : 0 },
          bart: { look: -1, throw: e < 320 },
          grab: e > 640,
        });
      }
      // coupes franches entre les trois plans
      const cut = Math.min(Math.abs(el - 950), Math.abs(el - 1900));
      if (cut < 50) { ctx.fillStyle = `rgba(10,5,3,${0.7 * (1 - cut / 50)})`; ctx.fillRect(0, 0, W, H); }
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
      const nh = Math.max(4, players.length), gap = nh > 4 ? 11 : 15, y0 = nh > 4 ? 136 : 140;
      for (let i = 0; i < nh; i++) {
        const y = y0 + i * gap;
        R(ctx, 34, y - 26, 36, 3, '#7a8a9a');
        if (!open) R(ctx, 68, y - 24, 2, 22, '#c9ced6');
        else R(ctx, 68, y - 24, 8, 2, '#c9ced6');
      }
      // les chevaux (ceux des joueurs, puis des chevaux de course)
      for (let i = 0; i < nh; i++) {
        const y = y0 + i * gap;
        const run = Math.max(0, el - 720 - i * 40);
        const x = 54 + run * (0.15 + hash(i + 3) * 0.04) + (run * run) * 0.00003;
        if (run > 0) puffs(ctx, 3, 110, 330, (el % 330) + 330, () => ({ x: x - 12, y: y - 2 }), { vx: -0.03, vy: -0.01, r0: 2, col: '214,170,120', a0: 0.5 });
        horse(ctx, x, y, ROBES[i], run > 0 ? el + i * 37 : 0, 1, i < players.length ? looks(players[i].character) : crowdLook(i + 11));
      }
      // le starter et son pistolet, de la fumée au coup de feu
      person(ctx, 96, 128, { coat: '#3a2a22', hat: '#1a0f0a', skin: SKIN[1] });
      R(ctx, 99, 103, 1, 3, '#3a2a22');
      if (el > 700) puffs(ctx, 1, 0, 600, el - 700, () => ({ x: 100, y: 101 }), { vx: 0.005, vy: -0.02, r0: 2, a0: 0.8 });
    },
  },

  // La chevauchée sauvage (variante de la course) : les cavaliers filent dans la prairie entre rochers et cactus
  'course-wild': {
    caption: 'LA CHEVAUCHÉE SAUVAGE',
    cues: [[200, 'neigh'], [900, 'whip'], [1400, 'neigh']],
    draw(ctx, el, players) {
      R(ctx, 0, 128, W, H - 128, '#b4a45e');
      R(ctx, 0, 128, W, 1, '#9a8c4c');
      for (let i = 0; i < 70; i++) R(ctx, hash(i) * W, 132 + hash(i + 9) * 84, 1, 2, '#8a7e44');
      // le décor défile : rochers et cactus
      const cam = el * 0.12;
      for (let k = 0; k < 9; k++) {
        const x = ((hash(k + 40) * 520 - cam) % 520 + 520) % 520 - 60, y = 140 + hash(k + 50) * 70;
        if (k % 3) outlined(ctx, x, y, [[0, -9, 16, 9, '#8a8478'], [3, -12, 9, 3, '#9a9488'], [3, -10, 5, 2, '#b0aa9c'], [10, -9, 6, 9, '#6a6458']]);
        else outlined(ctx, x, y, [[0, -22, 5, 22, '#4a7a3a'], [-3, -15, 3, 2, '#4a7a3a'], [-3, -20, 2, 6, '#4a7a3a'], [5, -12, 3, 2, '#4a7a3a'], [6, -18, 2, 7, '#4a7a3a']]);
      }
      // les cavaliers, qui louvoient entre les obstacles
      const nh = Math.max(4, players.length), gap = nh > 4 ? 11 : 16;
      for (let i = 0; i < nh; i++) {
        const x = -40 + el * (0.16 + hash(i + 3) * 0.03) - i * 22;
        const y = 150 + i * gap + Math.sin(el / 260 + i * 1.7) * 7;
        puffs(ctx, 3, 110, 330, (el % 330) + 330, () => ({ x: x - 12, y: y - 2 }), { vx: -0.03, vy: -0.01, r0: 2, col: '214,170,120', a0: 0.5 });
        horse(ctx, x, y, ROBES[i], el + i * 37, 1, i < players.length ? looks(players[i].character) : crowdLook(i + 11));
      }
      // un virevoltant traverse le plan
      S.tumbleweed(ctx, Math.round(W - el * 0.09), Math.round(196 - Math.abs(Math.sin(el / 160)) * 6), el);
    },
  },

  // Plan par défaut (jeu sans plan à lui) : les cavaliers des joueurs traversent le désert
  default: {
    caption: 'QUELQUE PART DANS L\'OUEST',
    cues: [[200, 'neigh'], [1200, 'neigh']],
    draw(ctx, el, players) {
      const gap = Math.min(14, 52 / Math.max(1, players.length - 1));
      players.forEach((p, i) => {
        const x = -30 + el * (0.17 - i * 0.012) - i * 26, y = 158 + Math.round(i * gap);
        puffs(ctx, 3, 120, 360, (el % 360) + 360, () => ({ x: x - 12, y: y - 3 }), { vx: -0.02, vy: -0.012, r0: 3, col: '214,170,110', a0: 0.5 });
        horse(ctx, x, y, ['#8a5228', '#5a3a20', '#a8703c', '#3a2a22', '#e8dcc8', '#6a4a3a'][i % 6], el + i * 50, 1, looks(p.character));
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
    // plan d'ensemble : SHOT1 ms, ou plus si le jeu a une petite scène à raconter (les gros plans sont alors plus serrés)
    this.s1 = this.shot?.len || SHOT1;
    const per = Math.min(160, (SHOT2 - this.s1 - 400) / Math.max(1, players.length));
    this.faceAt = players.map((_, i) => this.s1 + 120 + i * per);
    this.cues = [
      ...(extra.cues || this.shot?.cues || []),
      [this.s1, 'whip'],
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
    if (el < this.s1) this.establishing(ctx, el, now);
    else if (el < SHOT2) this.faces(ctx, el - this.s1, now);
    else this.titleCard(ctx, el - SHOT2);
    if (el < SHOT2) this.bars(ctx, el);
    // ouverture au noir et coupe franche entre les plans
    const cut = el < 250 ? 1 - el / 250 : Math.abs(el - this.s1) < 60 || Math.abs(el - SHOT2) < 60 ? 0.6 : 0;
    if (cut > 0) { ctx.fillStyle = `rgba(10,5,3,${cut})`; ctx.fillRect(0, 0, W, H); }
    if (el > 400 && el < CUT_MS - CUT_FADE) canvasText(ctx, 'CLIC : PASSER', W - 6, 7, { color: '#8a7a68', align: 'right' });
    ctx.restore();
  }

  bars(ctx, el) {
    const b = Math.round(BAR * ease(el / 300));
    R(ctx, 0, 0, W, b, '#0a0503');
    R(ctx, 0, H - b, W, b, '#0a0503');
    if (el < this.s1 && this.caption) {
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

  // Gros plans des joueurs, côte à côte, chacun sur un fond à sa couleur (sur deux rangées à 5 ou 6)
  faces(ctx, el, now) {
    const n = this.players.length;
    R(ctx, 0, 0, W, H, INK);
    const cols = n >= 5 ? Math.ceil(n / 2) : n, rows = Math.ceil(n / cols);
    const ch = (H - BAR * 2) / rows;
    const scale = rows > 1 ? 2 : n >= 4 ? 3 : 4;
    const sw = 28, sh = 36, sx = 10, sy = 4; // cadrage du visage dans le sprite 48×56
    this.players.forEach((p, i) => {
      const k = ease((el + this.s1 - this.faceAt[i]) / 260);
      if (k <= 0) return;
      const r = Math.floor(i / cols), c = i - r * cols, cw = W / Math.min(cols, n - r * cols);
      const x0 = Math.round(c * cw), x1 = Math.round((c + 1) * cw);
      const y0 = Math.round(BAR + r * ch), y1 = Math.round(BAR + (r + 1) * ch);
      const dir = i % 2 ? -1 : 1;
      const off = Math.round((1 - k) * 60 * dir);
      ctx.save();
      ctx.beginPath();
      ctx.rect(x0, y0, x1 - x0, y1 - y0);
      ctx.clip();
      const bands = [-0.75, -0.62, -0.5, -0.4];
      bands.forEach((a, b) => R(ctx, x0, y0 + off + (b * (y1 - y0)) / 4, x1 - x0, (y1 - y0) / 4 + 1, S.shade(p.color, a)));
      const spr = S.characterSprite(p.character || {}, { blink: (now + i * 900) % 3100 < 130, t: now });
      const fw = sw * scale, fh = sh * scale;
      const fx = Math.round((x0 + x1) / 2 - fw / 2), fy = y0 + (rows > 1 ? 2 : 6) + off;
      ctx.drawImage(spr, sx, sy, sw, sh, fx, fy, fw, fh);
      ctx.restore();
      const label = i === this.me ? `${p.name} (TOI)` : p.name;
      canvasText(ctx, label.toUpperCase(), (x0 + x1) / 2, y1 - 14 + Math.round((1 - k) * 20 / rows), { color: p.color });
      if (c) R(ctx, x0 - 1, y0, 2, y1 - y0, INK);
      if (r && !c) R(ctx, 0, y0 - 1, W, 2, INK);
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
