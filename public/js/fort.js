// Mini-jeu « Assaut du fort » : une équipe fait sauter la porte du fort à la dynamite, l'autre la défend
// du haut de la palissade ; à la mi-temps, les camps s'échangent. Cinq champs de bataille, des caisses de bonus,
// des abris que la dynamite pulvérise, et une brèche par laquelle on s'engouffre dans le fort.
// ZQSD / flèches : bouger (S en défense : se baisser) · clic : tirer · R : recharger · clic droit / Espace : dynamite.
import * as S from './sprites.js';
import { sfx } from './audio.js';
import { canvasText } from './scene.js';
import { SKIN, HAIR_COLORS, CLOTH_COLORS, hatColorOf, beardHasMustache } from './data.js';
import { MiniScene, ring, pixelSprite } from './miniscene.js';
import { skyDeco } from './env.js';
import { W, H, rng } from './worlds.js';
import {
  FORT, FORT_MAPS, FORT_BONUS, TEAM_NAMES, TEAM_COLORS, COVERS, PARA_TOP, fortTeam, fortHalf, fortHalfStart, fortAttacking,
  fortSpawn, fortWorld, fortMaxHp, fortGateMul, fortTeamSize,coverFor, blocked, groundSpeed, onGate, inGateway, dynTarget, blastOf, crateLive, wallTop, defFeet,
} from './fortgame.js';

const HORIZON = 66;
const STAKE_TOP = FORT.wallY - FORT.stakeH;
const GATE_L = FORT.gateX - FORT.gateW / 2, GATE_R = FORT.gateX + FORT.gateW / 2;
const GATE_TOP = FORT.wallY - 34;
const OUT = S.OUT;
const MAX_PARTS = 280;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// trous dans la porte, un par planche arrachée
const HOLES = (() => {
  const r = rng(7);
  return Array.from({ length: FORT.gateHp }, () => ({
    x: GATE_L + 2 + Math.floor(r() * (FORT.gateW - 10)), y: GATE_TOP + 3 + Math.floor(r() * 24),
    w: 4 + Math.floor(r() * 5), h: 3 + Math.floor(r() * 4),
  }));
})();

// ------------------------------------------------------------ sprites
const cache = new Map();
const cached = (key, make) => {
  let c = cache.get(key);
  if (!c) { c = make(); cache.set(key, c); }
  return c;
};

function hatOn(R, r, s, back) {
  const { hatC, hat, hair } = r;
  const band = S.shade(hatC, -0.35);
  const y = -26 + s;
  switch (hat) {
    case 'sombrero': R(-8, y, 16, 2, hatC); R(-3, y - 4, 6, 4, hatC); R(-3, y - 1, 6, 1, band); break;
    case 'bowler': R(-5, y, 10, 1, hatC); R(-4, y - 3, 8, 3, hatC); R(-3, y - 4, 6, 1, hatC); break;
    case 'tophat': R(-5, y, 10, 1, hatC); R(-3, y - 6, 6, 6, hatC); R(-3, y - 1, 6, 1, band); break;
    case 'gambler': R(-6, y, 12, 1, hatC); R(-4, y - 2, 8, 2, hatC); break;
    case 'bandana': R(-3, y, 6, 2, hatC); if (back) R(1, y + 2, 2, 2, hatC); break;
    case 'coonskin': R(-4, y - 2, 8, 3, '#8a6a48'); R(back ? -1 : 3, y + 1, 2, 6, '#8a6a48'); R(back ? -1 : 3, y + 6, 2, 1, '#4a3420'); break;
    case 'none': R(-3, y, 6, 2, hair); break;
    default: R(-6, y, 12, 1, hatC); R(-4, y - 3, 8, 3, hatC); R(-4, y - 1, 8, 1, band); R(-4, y - 4, 2, 1, hatC); R(2, y - 4, 2, 1, hatC);
  }
}

// Petit cowboy en pied, vu de dos (assaillant) ou de face (défenseur).
// pose : stand, walk (f = 0..3), aim, throw, crouch, dead
function gunman(r, back, pose, f = 0) {
  return cached(`${r.key}|${back ? 'b' : 'f'}|${pose}|${f}`, () => pixelSprite(32, 40, 16, 37, (R) => {
    const { skin, hair, cloth, color, beard } = r;
    const pants = '#4a3a2a', boot = '#2a1a10', iron = '#2a2622', dark = S.shade(cloth, -0.3);
    if (pose === 'dead') {
      R(-12, -4, 2, 3, boot); R(-10, -4, 6, 3, pants); R(-4, -5, 9, 4, cloth); R(-4, -2, 9, 1, dark);
      R(5, -5, 1, 4, color); R(6, -5, 4, 4, back ? hair : skin); R(-2, -6, 3, 1, cloth);
      R(10, -2, 6, 2, r.hatC); // chapeau tombé
      return;
    }
    const s = pose === 'crouch' ? 5 : 0;
    if (s) {
      R(-5, -5, 4, 3, pants); R(1, -5, 4, 3, pants); R(-5, -2, 4, 2, boot); R(1, -2, 4, 2, boot);
    } else {
      const lu = pose === 'walk' && f === 1 ? 1 : 0, ru = pose === 'walk' && f === 3 ? 1 : 0;
      R(-4, -10, 3, 7 - lu, pants); R(-4, -3 - lu, 3, 3, boot);
      R(1, -10, 3, 7 - ru, pants); R(1, -3 - ru, 3, 3, boot);
    }
    R(-5, -18 + s, 10, 7, cloth);
    R(-5, -11 + s, 10, 1, boot);
    if (back) R(-5, -18 + s, 1, 7, dark);
    else R(-1, -11 + s, 2, 1, '#e0b040');
    // bras
    const swing = pose === 'walk' ? [0, 1, 0, -1][f] : 0;
    if (pose === 'aim' && back) {
      R(-7, -18 + s, 2, 6, cloth); R(-7, -12 + s, 2, 2, skin);
      R(5, -23 + s, 2, 6, cloth); R(5, -25 + s, 2, 2, skin); R(5, -28 + s, 2, 3, iron);
    } else if (pose === 'aim') {
      R(-6, -17 + s, 3, 3, cloth); R(3, -17 + s, 3, 3, cloth); R(-3, -15 + s, 6, 2, skin); R(-1, -16 + s, 2, 3, iron);
    } else if (pose === 'throw') {
      R(5, -18 + s, 2, 6, cloth); R(5, -12 + s, 2, 2, skin);
      R(-7, -25 + s, 2, 7, cloth); R(-7, -27 + s, 2, 2, skin); R(-7, -31 + s, 2, 4, '#c83828');
    } else {
      R(-7, -18 + s + swing, 2, 6, cloth); R(-7, -12 + s + swing, 2, 2, skin);
      R(5, -18 + s - swing, 2, 6, cloth); R(5, -12 + s - swing, 2, 2, skin); R(6, -10 + s - swing, 1, 2, iron);
    }
    // tête
    if (back) {
      R(-3, -25 + s, 6, 6, hair); R(-2, -19 + s, 4, 1, skin);
      R(-3, -19 + s, 6, 1, color); R(-1, -18 + s, 2, 2, color); // nœud du foulard
    } else {
      R(-3, -25 + s, 6, 6, skin); R(-3, -25 + s, 6, 1, hair); R(-3, -24 + s, 1, 2, hair); R(2, -24 + s, 1, 2, hair);
      R(-2, -23 + s, 1, 1, OUT); R(1, -23 + s, 1, 1, OUT);
      if (beardHasMustache(beard)) R(-2, -21 + s, 4, 1, hair);
      if (['full', 'chops', 'chinstrap', 'prospector'].includes(beard)) R(-3, -21 + s, 6, 2, hair);
      if (beard === 'goatee' || beard === 'imperial') R(-1, -20 + s, 2, 1, hair);
      R(-3, -19 + s, 6, 2, color);
    }
    hatOn(R, r, s, back);
  }));
}

const COVER_DRAW = {
  rock(R) {
    R(-12, -10, 24, 10, '#8a8478'); R(-10, -12, 18, 2, '#8a8478'); R(-9, -11, 10, 3, '#aaa496');
    R(-12, -3, 24, 3, '#6a6458'); R(3, -8, 1, 4, '#6a6458');
  },
  boulder(R) {
    R(-15, -16, 30, 16, '#9a6a4a'); R(-12, -20, 22, 4, '#9a6a4a'); R(-8, -22, 12, 2, '#9a6a4a');
    R(-10, -20, 12, 4, '#b8805a'); R(-13, -15, 6, 3, '#b8805a');
    R(-15, -4, 30, 4, '#7a4a32'); R(2, -14, 1, 8, '#7a4a32'); R(3, -7, 6, 1, '#7a4a32');
  },
  barrels(R) {
    for (const x of [-10, 0]) {
      R(x, -16, 10, 16, '#8a5a30'); R(x, -16, 10, 1, '#6a4020'); R(x + 1, -15, 8, 1, '#a87040');
      R(x, -12, 10, 1, '#4a4440'); R(x, -4, 10, 1, '#4a4440'); R(x + 2, -15, 1, 14, '#a87040'); R(x + 9, -16, 1, 16, '#5a3818');
    }
  },
  crates(R) {
    R(-9, -18, 18, 18, '#b08850'); R(-9, -18, 18, 2, '#c8a068'); R(-9, -2, 18, 2, '#8a6438');
    R(-9, -18, 2, 18, '#8a6438'); R(7, -18, 2, 18, '#8a6438');
    for (let k = 0; k < 14; k++) R(-7 + k, -16 + k, 2, 1, '#8a6438');
  },
  hay(R) {
    R(-12, -13, 24, 13, '#d8b858'); R(-12, -13, 24, 2, '#ecd078'); R(-12, -3, 24, 3, '#b09040');
    R(-6, -13, 1, 13, '#8a6a30'); R(5, -13, 1, 13, '#8a6a30');
    for (let x = -11; x < 12; x += 3) R(x, -9 + (x & 1), 1, 2, '#ecd078');
  },
  cactus(R) {
    const g = '#4a7a3a', d = '#2e5228';
    R(-2, -24, 4, 24, g); R(1, -24, 1, 24, d); R(-6, -16, 4, 2, g); R(-6, -21, 2, 5, g); R(2, -12, 4, 2, g); R(4, -18, 2, 6, g);
  },
  fence(R) {
    for (const x of [-15, -5, 5, 14]) { R(x, -12, 2, 12, '#7a5434'); R(x, -12, 1, 12, '#9a6e44'); }
    R(-16, -10, 32, 2, '#9a6e44'); R(-16, -5, 32, 2, '#8a5e38'); R(-16, -9, 32, 1, '#6a4428');
  },
  adobe(R) {
    R(-15, -14, 30, 14, '#d4b080'); R(-15, -14, 30, 2, '#e8cca0'); R(-15, -3, 30, 3, '#b08a5a');
    R(-15, -16, 7, 2, '#d4b080'); R(-3, -16, 7, 2, '#d4b080'); R(9, -16, 6, 2, '#d4b080');
    R(-9, -10, 1, 4, '#a8805a'); R(-8, -7, 3, 1, '#a8805a'); R(6, -11, 1, 3, '#a8805a');
  },
  wagon(R) {
    const w = '#8a5a30', d = '#5a3818';
    R(-21, -16, 40, 8, w); R(-21, -16, 40, 1, '#a87040'); R(-21, -9, 40, 1, d);
    for (const x of [-12, 0, 12]) R(x, -15, 1, 6, d);
    R(-19, -22, 34, 6, '#e8dcc0'); R(-17, -23, 30, 1, '#e8dcc0'); R(-19, -17, 34, 1, '#c8b898'); R(-4, -22, 5, 3, '#c8b898'); // bâche
    for (const x of [-15, 11]) { R(x - 5, -8, 10, 8, d); R(x - 4, -7, 8, 6, '#c8a070'); R(x - 4, -4, 8, 1, d); R(x, -7, 1, 6, d); R(x - 1, -5, 2, 2, d); }
    R(19, -12, 6, 1, d);
  },
};
const coverSprite = (kind) => cached(`c${kind}`, () => {
  const [w, h] = COVERS[kind];
  return pixelSprite(w + 14, h + 12, Math.ceil(w / 2) + 7, h + 8, COVER_DRAW[kind]);
});
// ce qu'il reste d'un abri pulvérisé
const rubbleSprite = (kind) => cached(`r${kind}`, () => {
  const [w] = COVERS[kind];
  const col = kind === 'hay' ? '#c8a848' : kind === 'cactus' ? '#3e6a30' : '#7a5030';
  return pixelSprite(w + 8, 10, Math.ceil(w / 2) + 4, 7, (R) => {
    for (let k = 0; k < Math.round(w / 4); k++) {
      const x = Math.round(-w / 2 + ((k * 37) % w)), y = -2 - ((k * 3) % 3);
      R(x, y, 3 + (k % 3), 1, k % 2 ? col : S.shade(col, -0.3));
    }
    R(-Math.round(w / 3), -1, Math.round(w / 1.5), 1, 'rgba(40,30,20,0.5)');
  });
});

// Icônes des bonus (au-dessus de la caisse, et dans l'interface)
const BONUS_DRAW = {
  keg(R) { R(-4, -5, 8, 10, '#6a4020'); R(-4, -3, 8, 1, '#2a2622'); R(-4, 2, 8, 1, '#2a2622'); R(-2, -1, 4, 2, '#f0d050'); R(-1, -7, 1, 2, '#f0f0d0'); },
  whisky(R) { R(-3, -2, 6, 7, '#c87828'); R(-3, 0, 6, 2, '#f4e4b8'); R(-1, -6, 2, 4, '#7a4a20'); R(-1, -7, 2, 1, '#2a1a10'); R(-2, -1, 1, 5, '#e8a050'); },
  rifle(R) { R(-6, -1, 12, 2, '#4a4440'); R(-6, 1, 4, 3, '#8a5a30'); R(2, -1, 5, 1, '#8a8478'); R(-2, 1, 2, 2, '#4a4440'); },
  star(R) { R(-1, -5, 2, 10, '#f0c040'); R(-5, -1, 10, 2, '#f0c040'); R(-3, -3, 6, 6, '#f0c040'); R(-1, -1, 2, 2, '#fff6c0'); },
  spurs(R) { R(-4, -1, 6, 2, '#a8a49c'); R(2, -3, 1, 6, '#d8d4cc'); R(1, -2, 3, 4, '#d8d4cc'); R(2, -1, 1, 2, '#6a6458'); },
  dynpack(R) { for (const x of [-4, -1, 2]) { R(x, -3, 2, 7, '#c83828'); R(x, -3, 2, 1, '#e86848'); } R(-3, 0, 6, 1, '#6a4020'); R(0, -5, 1, 2, '#f0f0d0'); },
};
const bonusIcon = (kind) => cached(`b${kind}`, () => pixelSprite(18, 18, 9, 9, BONUS_DRAW[kind]));
const crateSprite = () => cached('crate', () => pixelSprite(20, 18, 10, 15, (R) => {
  R(-7, -11, 14, 11, '#b08850'); R(-7, -11, 14, 2, '#d0a868'); R(-7, -2, 14, 2, '#8a6438');
  R(-7, -11, 2, 11, '#8a6438'); R(5, -11, 2, 11, '#8a6438'); R(-2, -9, 4, 6, '#f4e4b8'); R(-1, -8, 2, 4, '#c83828');
}));
const chute = () => cached('chute', () => pixelSprite(26, 20, 13, 18, (R) => {
  R(-10, -16, 20, 3, '#f4ecd8'); R(-8, -17, 16, 1, '#f4ecd8'); R(-10, -13, 4, 2, '#e8604c'); R(-2, -13, 4, 2, '#e8604c'); R(6, -13, 4, 2, '#e8604c');
  for (const [x0, x1] of [[-9, -1], [9, 1]]) for (let k = 0; k < 12; k++) R(Math.round(x0 + ((x1 - x0) * k) / 12), -12 + k, 1, 1, '#8a7a68');
}));

// ------------------------------------------------------------ décors (dessinés une fois par carte)
// Ciel de l'ambiance (heure du jour, météo : env.js), seul élément du décor qui n'est pas teinté
const SKIES = new Map();
function skyFor(env) {
  let sky = SKIES.get(env.id);
  if (sky) return sky;
  sky = S.makeCanvas(W, HORIZON);
  const g = sky.getContext('2d');
  const R = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
  const cols = env.sky || ['#5a8ac8', '#6a98d0', '#7ea6d6', '#94b4d8', '#aec2d4', '#c8d0c8', '#e0d8b8'];
  const bh = HORIZON / cols.length;
  cols.forEach((c, i) => {
    R(0, Math.round(i * bh), W, Math.ceil(bh) + 1, c);
    if (i) for (let x = (i % 2); x < W; x += 2) R(x, Math.round(i * bh), 1, 1, cols[i - 1]);
  });
  if (env.sky) skyDeco(env, 0.78, 0.3)(g, 0, 0, W, HORIZON);
  else { S.disc(g, 300, 20, 9, '#fbecc4'); S.disc(g, 300, 20, 8, '#fdf6e0'); }
  SKIES.set(env.id, sky);
  return sky;
}

const tri = (u) => 1 - 2 * Math.abs((((u % 1) + 1) % 1) - 0.5);

function drawBack(R, M) {
  if (M.back === 'hills') {
    for (let x = 0; x < W; x++) {
      const m = Math.round(8 + 14 * tri(x / 170 + 0.2) ** 2 + 5 * tri(x / 70 + 0.5) ** 2);
      R(x, HORIZON - m, 1, m, '#8a9ab0'); R(x, HORIZON - m, 1, 1, '#a8b6c8');
      const h = Math.round(3 + 7 * tri(x / 120 + 0.65) ** 2 + 3 * tri(x / 50 + 0.1) ** 2);
      R(x, HORIZON - h, 1, h, '#6a8a48'); if ((x + h) % 3 === 0) R(x, HORIZON - h, 1, 1, '#82a258');
    }
    for (const x of [24, 52, 118, 140, 236, 262, 330, 356]) {
      const y = HORIZON - 6 - (x % 5);
      R(x - 3, y - 6, 7, 6, '#3e5a2e'); R(x - 2, y - 8, 5, 2, '#3e5a2e'); R(x - 1, y - 6, 2, 2, '#4e6e3a'); R(x, y, 1, 4, '#4a3420');
    }
  } else if (M.back === 'cliffs') {
    const cliff = (x0, x1, top, dir) => {
      for (let x = x0; x < x1; x++) {
        const edge = dir > 0 ? x - x0 : x1 - x;
        const y = Math.round(top + Math.max(0, 22 - edge * 0.6) + 3 * tri(x / 13));
        R(x, y, 1, HORIZON - y, '#a85a38');
        for (let s = y + 4 + (x % 2); s < HORIZON; s += 6) R(x, s, 1, 1, '#8a4a2e');
        R(x, y, 1, 1, '#c8784a');
      }
    };
    for (let x = 90; x < 300; x++) {
      const k = Math.min(x - 140, 250 - x) * 1.5;
      if (k <= 0) continue;
      const h = Math.round(Math.min(k, 16));
      R(x, HORIZON - h, 1, h, k < 16 ? '#9a6448' : '#b8805a');
    }
    cliff(0, 110, 8, -1);
    cliff(280, W, 12, 1);
  } else {
    const MESAS = [[-10, 70, 20], [96, 136, 12], [222, 300, 26], [318, 396, 16]];
    for (let x = 0; x < W; x++) {
      let h = 0, edge = false;
      for (const [a, b, mh] of MESAS) {
        const k = Math.min(x - a, b - x) * 1.6;
        if (k > 0 && Math.min(k, mh) > h) { h = Math.min(k, mh); edge = k < mh; }
      }
      if (!h) continue;
      h = Math.round(h);
      R(x, HORIZON - h, 1, h, edge ? '#9a6448' : '#b8805a');
      R(x, HORIZON - h, 1, 1, edge ? '#b8805a' : '#d09a6a');
      if (!edge && x % 7 === 0) R(x, HORIZON - h + 3, 1, h - 3, '#a87050');
    }
  }
}

// cour du fort, au loin : bâtiments derrière la palissade
function drawYard(R, M) {
  R(0, HORIZON, W, FORT.wallY - HORIZON, M.yard);
  if (M.fort === 'adobe') {
    for (let x = 30; x < W - 30; x += 1) R(x, HORIZON - 5, 1, 6, '#c8a878');
    for (let x = 30; x < W - 30; x += 8) R(x, HORIZON - 7, 4, 2, '#c8a878');
    // l'église de la mission et son clocher
    R(244, 40, 50, 28, '#e0c8a0'); R(244, 40, 50, 2, '#f0dcb8'); R(258, 22, 22, 18, '#e0c8a0');
    R(262, 16, 14, 6, '#e0c8a0'); R(265, 13, 8, 3, '#e0c8a0'); R(268, 9, 2, 4, '#5a3818'); R(266, 10, 6, 1, '#5a3818');
    R(265, 26, 8, 8, '#3a2414'); R(267, 28, 4, 4, '#c8a040'); R(262, 52, 14, 16, '#5a3818'); R(263, 53, 12, 1, '#7a4a28');
    R(66, 52, 44, 16, '#d8bc90'); R(66, 50, 44, 2, '#e8d0a8'); R(76, 57, 6, 6, '#3a2414'); R(94, 57, 6, 6, '#3a2414');
    for (const x of [70, 86, 102]) R(x, 54, 3, 1, '#7a4a28');
  } else {
    for (let x = 30; x < W - 30; x += 3) R(x, HORIZON - 8 + (x % 2), 2, 9 - (x % 2), x % 6 ? '#7a5434' : '#6a4428');
    R(62, 52, 56, 16, '#8a5a30'); R(58, 48, 64, 5, '#5a3818'); R(60, 46, 60, 2, '#6a4020');
    for (const x of [72, 90, 104]) R(x, 57, 6, 5, '#2a1a10');
    R(270, 34, 22, 14, '#8a5a30'); R(268, 32, 26, 3, '#5a3818'); R(272, 48, 2, 20, '#5a3818'); R(288, 48, 2, 20, '#5a3818'); // réservoir
  }
}

function drawField(R, M, world) {
  const sand = M.ground;
  const fh = (H - FORT.wallY) / sand.length;
  sand.forEach((c, i) => {
    const y = Math.round(FORT.wallY + i * fh);
    R(0, y, W, Math.ceil(fh) + 1, c);
    if (i) for (let x = (i % 2); x < W; x += 2) R(x, y, 1, 1, sand[i - 1]);
  });
  // chemin vers la porte, avec ornières
  const dark = S.shade(M.path, -0.12), rut = S.shade(M.path, -0.2);
  for (let y = FORT.wallY; y < H; y++) {
    const hw = Math.round(20 + (y - FORT.wallY) * 0.38);
    R(FORT.gateX - hw, y, hw * 2, 1, M.path);
    if (y % 2) { R(FORT.gateX - hw, y, 1, 1, dark); R(FORT.gateX + hw - 1, y, 1, 1, dark); }
    const r = Math.round(9 + (y - FORT.wallY) * 0.2);
    R(FORT.gateX - r, y, 1, 1, rut); R(FORT.gateX + r, y, 1, 1, rut);
  }
  let sd = 11;
  const r = () => ((sd = (sd * 9301 + 49297) % 233280) / 233280);
  const light = S.shade(sand[2], 0.25), pebble = S.shade(sand[2], -0.3);
  for (let i = 0; i < 280; i++) {
    const x = Math.floor(r() * W), y = Math.floor(FORT.wallY + 4 + r() * (H - FORT.wallY - 4)), k = r();
    if (k < 0.4) R(x, y, 1, 1, light);
    else if (k < (M.grass ? 0.5 : 0.7)) R(x, y, 2, 1, pebble);
    else if (k < (M.grass ? 0.55 : 0.85)) { R(x, y, 2, 2, '#8a8478'); R(x, y, 2, 1, '#aaa496'); }
    else { R(x, y, 1, 2, '#5a7a32'); R(x + 2, y, 1, 2, '#5a7a32'); R(x + 1, y - 1, 1, 3, '#6e8e3e'); }
  }
  R(0, FORT.wallY, W, 3, 'rgba(60,40,20,0.3)');
  const rv = world.river;
  if (rv) {
    R(0, rv.y0 - 1, W, rv.y1 - rv.y0 + 3, '#6a6040');
    R(0, rv.y0, W, rv.y1 - rv.y0 + 1, '#3e6a98');
    R(0, rv.y0, W, 2, '#5a88b8');
    R(0, rv.y1 - 1, W, 2, '#2e5478');
    for (let x = 3; x < W; x += 7) R(x, rv.y0 + 4 + (x % 3) * 3, 3, 1, '#6a98c8');
    for (let x = 0; x < W; x += 5) if ((x * 7) % 11 < 4) { R(x, rv.y0 - 4, 1, 4, '#4e7030'); R(x + 1, rv.y0 - 3, 1, 3, '#6a8a3e'); }
    for (const b of rv.bridges) {
      const x0 = Math.round(b - rv.bw / 2);
      R(x0 - 1, rv.y0 - 4, rv.bw + 2, rv.y1 - rv.y0 + 9, OUT);
      for (let y = rv.y0 - 3; y < rv.y1 + 4; y += 2) { R(x0, y, rv.bw, 2, '#9a6a3a'); R(x0, y + 1, rv.bw, 1, '#7a4e28'); }
      for (const px of [x0 - 1, x0 + rv.bw - 1]) { R(px, rv.y0 - 8, 2, 6, '#5a3818'); R(px, rv.y1 + 2, 2, 6, '#5a3818'); }
      R(x0 - 1, rv.y0 - 8, rv.bw + 1, 1, '#7a4e28');
    }
  }
}

// palissade (ou mur d'adobe), tours, porche et parapet au-dessus de la porte : par-dessus les défenseurs
function drawWall(P, M) {
  const adobe = M.fort === 'adobe';
  const plaster = '#d8b888', plasterL = '#ecd0a4', plasterD = '#b8966a';
  if (adobe) {
    for (const [x0, x1] of [[30, GATE_L - 12], [GATE_R + 12, W - 30]]) {
      P(x0, STAKE_TOP - 1, x1 - x0, FORT.wallY - STAKE_TOP + 1, OUT);
      P(x0, STAKE_TOP, x1 - x0, FORT.wallY - STAKE_TOP, plaster);
      P(x0, STAKE_TOP, x1 - x0, 1, plasterL);
      P(x0, FORT.wallY - 4, x1 - x0, 4, plasterD);
      for (let x = x0 + 2; x < x1 - 6; x += 12) { P(x - 1, STAKE_TOP - 6, 9, 6, OUT); P(x, STAKE_TOP - 5, 7, 5, plaster); P(x, STAKE_TOP - 5, 7, 1, plasterL); }
      for (let x = x0 + 8; x < x1 - 4; x += 24) P(x, STAKE_TOP + 5, 4, 2, '#6a4020');
      for (let x = x0 + 15; x < x1 - 10; x += 37) { P(x, STAKE_TOP + 9, 1, 4, plasterD); P(x + 1, STAKE_TOP + 12, 3, 1, plasterD); }
    }
  } else {
    for (let x = 30; x < W - 30; x += 6) {
      if (x + 6 > GATE_L - 12 && x < GATE_R + 12) continue;
      const top = STAKE_TOP + ((x * 7) % 3);
      const h = FORT.wallY - top;
      P(x, top, 6, h, '#3a2414');
      P(x, top, 5, h, '#8a5a30'); P(x, top, 1, h, '#a87040'); P(x + 4, top, 1, h, '#5a3818');
      P(x + 1, top - 1, 3, 1, '#8a5a30'); P(x + 2, top - 2, 1, 1, '#a87040');
      P(x + 1, top + 9 + (x % 4), 2, 1, '#6a4020');
    }
    for (const y of [STAKE_TOP + 6, FORT.wallY - 7]) {
      P(30, y, GATE_L - 42, 2, '#5a3818'); P(GATE_R + 12, y, W - 42 - GATE_R, 2, '#5a3818');
      P(30, y, GATE_L - 42, 1, '#7a4a28'); P(GATE_R + 12, y, W - 42 - GATE_R, 1, '#7a4a28');
    }
  }
  const tower = (x0) => {
    if (adobe) {
      P(x0 - 1, 37, 34, FORT.wallY - 37, OUT);
      P(x0, 38, 32, FORT.wallY - 38, plaster); P(x0, 38, 32, 1, plasterL); P(x0 + 26, 38, 6, FORT.wallY - 38, plasterD);
      for (let x = x0; x < x0 + 32; x += 8) { P(x, 32, 5, 6, OUT); P(x + 1, 33, 3, 5, plaster); }
      P(x0 + 12, 46, 8, 9, OUT); P(x0 + 13, 48, 6, 7, '#2a1a10'); P(x0 + 14, 47, 4, 1, '#2a1a10');
      for (const y of [42, 62]) { P(x0 - 2, y, 3, 2, '#6a4020'); P(x0 + 31, y, 3, 2, '#6a4020'); }
      return;
    }
    P(x0 - 1, 43, 34, FORT.wallY - 43, OUT);
    P(x0, 44, 32, FORT.wallY - 44, '#7a4a28');
    for (let y = 46; y < FORT.wallY; y += 4) { P(x0, y, 32, 1, '#5a3818'); P(x0, y + 1, 32, 1, '#946036'); }
    P(x0 - 3, 39, 38, 14, OUT);
    P(x0 - 2, 40, 36, 12, '#8a5a30');
    for (let y = 42; y < 52; y += 4) { P(x0 - 2, y, 36, 1, '#5a3818'); P(x0 - 2, y + 1, 36, 1, '#a87040'); }
    P(x0 + 13, 44, 6, 3, OUT);
    for (let k = 0; k < 14; k++) P(x0 - 4 + k, 39 - k, 40 - 2 * k, 1, k % 2 ? '#6a3a20' : '#7a4428');
    P(x0 + 15, 22, 2, 4, '#5a3818');
  };
  tower(-2);
  tower(W - 30);
  // porche : montants, linteau et parapet (le chemin de ronde passe au-dessus de la porte)
  const pl = GATE_L - 12, pw = FORT.gateW + 24, ph = GATE_TOP - 7 - PARA_TOP;
  if (adobe) {
    P(pl - 1, PARA_TOP - 1, pw + 2, FORT.wallY - PARA_TOP + 1, OUT);
    P(pl, PARA_TOP, pw, FORT.wallY - PARA_TOP, plaster); P(pl, PARA_TOP, pw, 1, plasterL);
    for (let x = pl + 1; x < pl + pw - 4; x += 10) { P(x - 1, PARA_TOP - 6, 7, 6, OUT); P(x, PARA_TOP - 5, 5, 5, plaster); }
    P(GATE_L - 2, GATE_TOP - 4, FORT.gateW + 4, 4, plasterD); // arc
    P(pl + 4, PARA_TOP + 4, 3, 2, '#6a4020'); P(pl + pw - 7, PARA_TOP + 4, 3, 2, '#6a4020');
  } else {
    P(pl - 1, PARA_TOP - 3, pw + 2, ph + 4, OUT);
    for (let y = PARA_TOP; y < PARA_TOP + ph; y += 3) { P(pl, y, pw, 3, '#8a5a30'); P(pl, y, pw, 1, '#a87040'); P(pl, y + 2, pw, 1, '#6a4020'); }
    for (let x = pl; x < pl + pw; x += 5) { P(x + 1, PARA_TOP - 2, 3, 2, '#8a5a30'); P(x + 2, PARA_TOP - 3, 1, 1, '#a87040'); }
    P(GATE_L - 6, PARA_TOP, 6, FORT.wallY - PARA_TOP, '#6a4020'); P(GATE_L - 6, PARA_TOP, 1, FORT.wallY - PARA_TOP, '#8a5a30');
    P(GATE_R, PARA_TOP, 6, FORT.wallY - PARA_TOP, '#6a4020'); P(GATE_R + 5, PARA_TOP, 1, FORT.wallY - PARA_TOP, '#4a2a14');
    P(GATE_L - 10, GATE_TOP - 7, FORT.gateW + 20, 6, OUT);
    P(GATE_L - 9, GATE_TOP - 6, FORT.gateW + 18, 4, '#7a4a28'); P(GATE_L - 9, GATE_TOP - 6, FORT.gateW + 18, 1, '#a87040');
    P(pl, GATE_TOP - 7, 6, FORT.wallY - GATE_TOP + 7, '#7a4a28'); P(pl + pw - 6, GATE_TOP - 7, 6, FORT.wallY - GATE_TOP + 7, '#7a4a28');
  }
  for (const x of [GATE_L - 5, GATE_R + 2]) { P(x - 1, GATE_TOP + 4, 5, 7, OUT); P(x, GATE_TOP + 5, 3, 5, '#e0b040'); P(x + 1, GATE_TOP + 6, 1, 3, '#fff6c0'); } // lanternes
}

const DECORS = new Map();
function decor(world) {
  let D = DECORS.get(world);
  if (D) return D;
  const M = FORT_MAPS[world.map];
  const bg = S.makeCanvas(W, H);
  const g = bg.getContext('2d');
  const R = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
  drawBack(R, M);
  drawYard(R, M);
  drawField(R, M, world);
  const wall = S.makeCanvas(W, H);
  const w = wall.getContext('2d');
  drawWall((x, y, ww, hh, col) => { w.fillStyle = col; w.fillRect(x, y, ww, hh); }, M);
  D = { bg, wall };
  if (DECORS.size > 4) DECORS.clear();
  DECORS.set(world, D);
  return D;
}

// ------------------------------------------------------------ scène
export class FortScene extends MiniScene {
  constructor(canvas, hooks) {
    super(canvas, hooks);
    this.kind = 'fort';
    this.showEnv = true;
    this.cv.style.cursor = 'none';
    this.world = null;
    this.pl = null;
  }

  get attacking() { return fortAttacking(this.me, this.rh); }
  get mapInfo() { return FORT_MAPS[this.world?.map || this.state?.map] || FORT_MAPS.desert; }

  title() { return 'ASSAUT DU FORT'; }
  help() {
    const team = fortTeam(this.me);
    // équipe en infériorité numérique : on annonce son avantage
    const mine = fortTeamSize(this.me, this.n);
    const odds = fortGateMul(this.me, this.n) > 1 ? ' - SEUL : DYNAMITE X2'
      : mine < this.n - mine ? ` - ${mine} CONTRE ${this.n - mine} : ${fortMaxHp(this.me, this.n)} PV` : '';
    return [
      `CARTE : ${this.mapInfo.name}${odds}`,
      `TU ES CHEZ LES ${TEAM_NAMES[team]} : ${team ? 'DÉFENSE' : 'ATTAQUE'} D'ABORD`,
      'ATTAQUE : FAIS SAUTER LA PORTE ET ENTRE',
      ...(this.touch
        ? ['STICK : BOUGER - TOUCHE L\'ÉCRAN : TIRER', 'BOUTON DYNAMITE PUIS TOUCHE LA CIBLE']
        : ['ZQSD BOUGER - CLIC TIRER - R RECHARGER', 'CLIC DROIT OU ESPACE : DYNAMITE']),
      'CAISSES : MARCHE DESSUS OU TIRE DESSUS',
    ];
  }
  goText() { return this.attacking ? 'À L\'ASSAUT !' : 'TENEZ LE FORT !'; }

  // horloge du HUD : temps restant de la manche (ou du changement de camp)
  clock() {
    const t = Math.max(0, this.t);
    if (this.t0 == null) return FORT.half;
    if (t < FORT.half) return FORT.half - t;
    if (t < FORT.half + FORT.brk) return FORT.half + FORT.brk - t;
    return Math.max(0, this.duration - t);
  }
  progress() {
    const t = Math.max(0, this.t);
    if (this.t0 == null) return 1;
    if (t < FORT.half) return 1 - t / FORT.half;
    if (t < FORT.half + FORT.brk) return 0;
    return Math.max(0, (this.duration - t) / FORT.half);
  }

  setup(seed) {
    this.world = fortWorld(seed, this.state.map, this.n);
    this.pl = this.state.players.map((p) => ({
      x: 0, y: 0, tx: 0, ty: 0, c: 0, hp: p.hp ?? FORT.hp, maxHp: p.maxHp ?? FORT.hp, dead: 0, safe: 0, left: p.left,
      power: null, powerUntil: 0, keg: 0, dynFast: 0, shotAt: -1e9, throwAt: -1e9, hurtAt: -1e9, moving: false,
    }));
    this.my = { ammo: FORT.ammo, reloadUntil: 0, lastShot: -1e9, lastThrow: -1e9, nextDyn: 0, spawnK: 0, wasDead: false, lastEnter: -1e9 };
    this.dyns = new Map();
    this.booms = [];
    this.tracers = [];
    this.marks = [];
    this.wrecked = new Set();
    this.taken = new Set();
    this.pending = new Map(); // caisse -> instant de la demande
    this.gate = FORT.gateHp;
    this.gateDown = 0;
    this.riders = this.state.players.map((p, i) => {
      const c = p.character || {};
      return {
        key: `${i}:${JSON.stringify(c)}`,
        skin: SKIN[c.skin] || SKIN[1], hair: HAIR_COLORS[c.hairColor] || HAIR_COLORS[1],
        cloth: CLOTH_COLORS[c.outfitColor] || CLOTH_COLORS[2], hatC: hatColorOf(c),
        hat: c.hat || 'cowboy', beard: c.beard, color: this.color(i),
      };
    });
    this.place(0);
    this.readState(this.state);
  }

  applySync(st) {
    if (this.t >= FORT.half) this.place(1);
    this.readState(st);
  }

  // chacun à son poste pour la manche h
  place(h) {
    this.rh = h;
    this.pl.forEach((q, i) => {
      const s = fortSpawn(i, this.n, fortAttacking(i, h));
      Object.assign(q, { x: s.x, y: s.y, tx: s.x, ty: s.y, c: 0 });
    });
    Object.assign(this.my, { ammo: FORT.ammo, reloadUntil: 0, nextDyn: fortHalfStart(h) + 1500, spawnK: 0, wasDead: false });
    this.dyns.clear();
    this.pending.clear();
    this.wrecked.clear();
  }

  setState(st) {
    super.setState(st);
    this.readState(st);
  }

  readState(st) {
    if (!this.pl || !st) return;
    st.players.forEach((p, i) => {
      const q = this.pl[i];
      if (!q) return;
      Object.assign(q, {
        hp: p.hp, maxHp: p.maxHp, dead: p.dead || 0, safe: p.safe || 0, left: p.left,
        power: p.power, powerUntil: p.powerUntil || 0, keg: p.keg || 0, dynFast: p.dynFast || 0,
      });
    });
    this.gate = st.gate ?? this.gate;
    this.gateDown = st.gateDown || 0;
    if (st.wrecked) this.wrecked = new Set(st.wrecked);
    if (st.taken) this.taken = new Set(st.taken);
  }

  isDead(i) {
    const q = this.pl[i];
    return q.left || (q.dead > 0 && this.t < q.dead);
  }
  hpOf(i) {
    const q = this.pl[i];
    return q.dead && this.t >= q.dead ? q.maxHp : q.hp;
  }
  powered(i, kind) { const q = this.pl[i]; return q.power === kind && this.t < q.powerUntil; }
  safe(i) { return (this.pl[i].safe > 0 && this.t < this.pl[i].safe) || this.powered(i, 'star'); }
  gateBroken() { return this.gate <= 0 || (this.gateDown > 0 && this.t < this.gateDown); }
  covers() { return this.world.covers.filter((c) => !this.wrecked.has(c.id)); }
  liveCrates(t) { return this.world.crates.filter((c) => !this.taken.has(c.id) && crateLive(c, t)); }
  defY(i) { return defFeet(this.pl[i].x) + (this.pl[i].c ? 11 : 0); }

  liveData() {
    const q = this.pl[this.me];
    return { x: Math.round(q.x), y: Math.round(q.y), c: q.c };
  }

  addPart(p) { if (this.parts.length < MAX_PARTS) this.parts.push(p); }

  // ---------------------------------------------------------- entrées
  canAct() {
    return this.playing && fortHalf(this.t) >= 0 && !this.isDead(this.me);
  }

  onFire(m) {
    const t = this.t, my = this.my, me = this.pl[this.me];
    if (!this.canAct()) return;
    if (!this.attacking && me.c) { sfx('dry'); return; } // baissé derrière les pieux
    const rifle = this.powered(this.me, 'rifle');
    if ((my.reloadUntil && !rifle) || t - my.lastShot < (rifle ? FORT.rifleRof : FORT.rof)) return;
    if (my.ammo <= 0 && !rifle) { sfx('dry'); this.reload(); return; }
    if (!rifle) my.ammo--;
    my.lastShot = t;
    me.shotAt = t;
    if (this.attacking) me.c = 0;
    sfx(rifle ? 'gatling' : 'revolver');
    this.shake = Math.max(this.shake, 1.5);
    const x = Math.round(m.x), y = Math.round(m.y);
    this.tracer(this.me, x, y, rifle);
    const hit = this.targetAt(x, y);
    const crate = hit.v < 0 && !this.attacking ? this.crateAt(x, y, t) : null;
    if (hit.v >= 0) this.hooks.send({ kind: 'shot', v: hit.v, head: hit.head });
    else if (crate) this.grab(crate);
    this.mark(x, y, hit.v >= 0 || !!crate);
    this.sendLive({ ...this.liveData(), sh: [x, y] }, true);
    if (!my.ammo && !rifle) this.reload();
  }

  onAlt(m) { this.throwDyn(m); }

  onKey(k) {
    if (k === 'r') this.reload();
    else if (k === ' ' && this.mouse.in) this.throwDyn(this.mouse);
  }

  reload() {
    const my = this.my;
    if (!this.canAct() || my.reloadUntil || my.ammo === FORT.ammo || this.powered(this.me, 'rifle')) return;
    my.reloadUntil = this.t + FORT.reload;
    sfx('reload');
  }

  throwDyn(m) {
    const t = this.t, my = this.my, me = this.pl[this.me];
    if (!this.canAct()) return;
    if (t < my.nextDyn || (!this.attacking && me.c)) { sfx('dry'); return; }
    const to = dynTarget(this.attacking, me, m.x, m.y);
    my.nextDyn = t + (me.dynFast > 0 ? FORT.dynFastCd : FORT.dynCd);
    my.lastThrow = t;
    me.throwAt = t;
    if (this.attacking) me.c = 0;
    sfx('whip');
    this.hooks.send({ kind: 'dyn', x: to.x, y: to.y });
    this.sendLive(this.liveData(), true);
  }

  grab(c) {
    const p = this.pending.get(c.id);
    if (p && this.t - p < 1500) return;
    this.pending.set(c.id, this.t);
    this.hooks.send({ kind: 'grab', id: c.id });
  }

  // Zone touchable d'un joueur (null : à l'abri). La tête : les 8 pixels du haut.
  body(i) {
    const q = this.pl[i];
    if (q.c) return null;
    if (fortAttacking(i, this.rh)) return { x0: q.x - 5, x1: q.x + 5, y0: q.y - 27, y1: q.y };
    const f = defFeet(q.x);
    return { x0: q.x - 6, x1: q.x + 6, y0: f - 31, y1: wallTop(q.x) + 1 };
  }

  // L'ennemi visé, s'il n'est pas caché derrière un abri dessiné devant lui
  targetAt(x, y) {
    let best = -1, depth = -1e9, head = false;
    for (let i = 0; i < this.n; i++) {
      if (fortTeam(i) === fortTeam(this.me) || this.isDead(i)) continue;
      const b = this.body(i);
      if (!b || x < b.x0 || x > b.x1 || y < b.y0 || y > b.y1) continue;
      const d = fortAttacking(i, this.rh) ? this.pl[i].y : FORT.walkY;
      if (d > depth) { depth = d; best = i; head = y < b.y0 + 9; }
    }
    if (best >= 0 && fortAttacking(best, this.rh)) {
      const q = this.pl[best];
      if (this.covers().some((c) => c.y > q.y && x >= c.x - c.w / 2 && x <= c.x + c.w / 2 && y >= c.y - c.h && y <= c.y)) return { v: -1 };
    }
    return { v: best, head };
  }

  crateAt(x, y, t) {
    return this.liveCrates(t).find((c) => t - c.at > 500 && Math.abs(x - c.x) <= 9 && y >= c.y - 26 && y <= c.y + 1) || null;
  }

  gunPos(i) {
    const q = this.pl[i];
    return fortAttacking(i, this.rh) ? { x: q.x + 6, y: q.y - 28 } : { x: q.x, y: wallTop(q.x) - 2 };
  }

  remoteLive(i, d) {
    const q = this.pl?.[i];
    if (!q) return;
    if (Number.isFinite(d.x)) q.tx = d.x;
    if (Number.isFinite(d.y)) q.ty = d.y;
    if (d.c != null) q.c = d.c ? 1 : 0;
    if (Array.isArray(d.sh) && this.t0 != null) {
      q.shotAt = this.t;
      const rifle = this.powered(i, 'rifle');
      this.tracer(i, d.sh[0], d.sh[1], rifle);
      this.mark(d.sh[0], d.sh[1], false);
      sfx(rifle ? 'gatling' : fortTeam(i) === fortTeam(this.me) ? 'far' : 'revolver');
    }
  }

  // ---------------------------------------------------------- événements de l'hôte
  onEvent(ev) {
    if (!this.pl) return;
    const t = this.t;
    switch (ev.type) {
      case 'dyn': {
        const q = this.pl[ev.by];
        if (!q) return;
        q.throwAt = t;
        const atk = fortAttacking(ev.by, this.rh);
        const from = atk ? { x: q.x - 6, y: q.y - 30, gy: q.y } : { x: q.x - 6, y: wallTop(q.x) - 10, gy: FORT.wallY };
        this.dyns.set(ev.id, { ...from, tx: ev.x, ty: ev.y, t0: t, at: t + (ev.fly || 600), big: ev.big });
        if (ev.by !== this.me) sfx('whip');
        break;
      }
      case 'boom': {
        this.dyns.delete(ev.id);
        this.explosion(ev.x, ev.y, ev.dmg, ev.big);
        for (const id of ev.wrecked || []) {
          const c = this.world.covers[id];
          this.wrecked.add(id);
          for (let k = 0; k < 10; k++) this.debris(c.x + (Math.random() - 0.5) * c.w, c.y - c.h / 2, k % 2 ? '#8a5a30' : '#c8a070');
        }
        if (ev.dmg) this.popup(FORT.gateX, GATE_TOP + 6, `+${ev.pts}`, this.color(ev.by), ev.by === this.me);
        if (ev.breach) {
          this.popup(W / 2, 108, 'BRÈCHE ! ENTREZ !', '#f8d070', true);
          sfx('good');
          for (let k = 0; k < 24; k++) this.debris(FORT.gateX + (Math.random() - 0.5) * FORT.gateW, FORT.wallY - 16, '#8a5a30');
        }
        break;
      }
      case 'shot': {
        const q = this.pl[ev.v];
        if (!q) return;
        const atk = fortAttacking(ev.v, this.rh);
        const x = q.x, y = atk ? q.y - 36 : defFeet(q.x) - 44;
        if (ev.blocked) {
          if (ev.by === this.me || ev.v === this.me) { this.popup(x, y, 'PARÉ !', '#f8d070'); sfx('clank'); }
          break;
        }
        q.hurtAt = t;
        if (ev.v === this.me) {
          sfx('hurt');
          this.shake = Math.max(this.shake, ev.dyn ? 7 : 4);
        }
        if (ev.kill) {
          this.popup(x, y, ev.by === this.me ? `+${ev.pts}` : 'À TERRE !', this.color(ev.by), ev.by === this.me);
          if (ev.by === this.me) sfx('coin');
          if (!atk) for (let k = 0; k < 6; k++) this.debris(x, wallTop(x) - 6, this.riders[ev.v].hatC);
        } else if (ev.by === this.me || ev.v === this.me) this.popup(x, y, ev.head ? 'TÊTE ! -2' : '-1', '#f0705a');
        break;
      }
      case 'bonus': {
        const c = this.world.crates[ev.id];
        const b = FORT_BONUS[ev.kind];
        this.taken.add(ev.id);
        this.pending.delete(ev.id);
        if (!c || !b) break;
        const mine = ev.by === this.me;
        this.popup(c.x, c.y - 34, b.name, this.color(ev.by), mine);
        if (mine) {
          this.popup(c.x, c.y - 20, b.desc, '#fdf6e0');
          sfx('power');
          if (ev.kind === 'dynpack') this.my.nextDyn = t;
          if (ev.kind === 'rifle') { this.my.ammo = FORT.ammo; this.my.reloadUntil = 0; }
        } else sfx('crate');
        for (let k = 0; k < 8; k++) this.debris(c.x, c.y - 6, k % 2 ? '#b08850' : '#d0a868');
        break;
      }
      case 'enter': {
        const q = this.pl[ev.who];
        if (!q) break;
        this.popup(FORT.gateX, GATE_TOP - 4, ev.who === this.me ? `DANS LE FORT ! +${ev.pts}` : 'ILS SONT ENTRÉS !', this.color(ev.who), true);
        sfx(ev.who === this.me || fortTeam(ev.who) === fortTeam(this.me) ? 'good' : 'bad');
        if (ev.who === this.me) {
          const s = fortSpawn(this.me, this.n, true, ++this.my.spawnK);
          Object.assign(q, { x: s.x, y: s.y, c: 0 });
          this.sendLive(this.liveData(), true);
        }
        break;
      }
      case 'halfEnd':
        if (ev.pts) this.popup(FORT.gateX, GATE_TOP - 26, `PORTE TENUE +${ev.pts}`, TEAM_COLORS[1 - ev.half], true);
        sfx('ding');
        break;
      case 'halfStart':
        if (ev.half > 0) sfx('go');
        break;
      case 'rebuilt':
        this.popup(FORT.gateX, GATE_TOP - 4, 'PORTE REBARRICADÉE', '#fdf6e0');
        sfx('clank');
        break;
    }
  }

  // ---------------------------------------------------------- effets
  tracer(i, x, y, gold = false) {
    const g = this.gunPos(i);
    this.tracers.push({ x0: g.x, y0: g.y, x1: x, y1: y, t: 0, gold });
  }

  mark(x, y, hit) {
    this.marks.push({ x, y, hit, t: 0 });
    const col = hit ? '#f0705a' : y > FORT.wallY ? '#e8d8a0' : '#c8a070';
    for (let k = 0; k < (hit ? 5 : 3); k++) {
      this.addPart({ x, y, vx: (Math.random() - 0.5) * 0.08, vy: -0.03 - Math.random() * 0.05, g: 0.0003, t: 0, max: 300 + Math.random() * 200, col, s: 1 });
    }
  }

  debris(x, y, col) {
    this.addPart({ x, y, vx: (Math.random() - 0.5) * 0.18, vy: -0.08 - Math.random() * 0.12, g: 0.0005, t: 0, max: 700 + Math.random() * 400, col, s: 2 });
  }

  explosion(x, y, gate, big) {
    sfx('boom');
    this.shake = Math.max(this.shake, big ? 12 : 8);
    this.booms.push({ x, y, t: 0, seed: Math.random() * 6, big });
    const col = gate ? '#8a5a30' : y > FORT.wallY ? S.shade(this.mapInfo.ground[2], -0.1) : '#7a4a28';
    for (let k = 0; k < (big ? 22 : 14); k++) this.debris(x, y - 4, k % 3 ? col : '#4a3a2a');
  }

  // ---------------------------------------------------------- simulation
  update(dt) {
    if (!this.world) return;
    const t = this.t;
    const rh = t < FORT.half ? 0 : 1;
    if (rh !== this.rh) this.place(rh);
    const my = this.my, me = this.pl[this.me];
    const attack = this.attacking;
    // réapparition
    if (this.isDead(this.me)) my.wasDead = true;
    else if (my.wasDead) {
      my.wasDead = false;
      const s = fortSpawn(this.me, this.n, attack, ++my.spawnK);
      Object.assign(me, { x: s.x, y: s.y, c: 0 });
      my.ammo = FORT.ammo;
      my.reloadUntil = 0;
      this.sendLive(this.liveData(), true);
    }
    if (my.reloadUntil && t >= my.reloadUntil) { my.reloadUntil = 0; my.ammo = FORT.ammo; }
    me.moving = false;
    const covers = this.covers();
    if (this.canAct()) {
      const k = this.keys;
      const up = k.has('arrowup') || k.has('z') || k.has('w'), down = k.has('arrowdown') || k.has('s');
      const left = k.has('arrowleft') || k.has('q') || k.has('a'), right = k.has('arrowright') || k.has('d');
      const ox = me.x, oy = me.y, oc = me.c;
      const boost = this.powered(this.me, 'spurs') ? 1.6 : 1;
      if (attack) {
        const vx = right - left, vy = down - up;
        const len = Math.hypot(vx, vy) || 1;
        const sp = FORT.speed * dt * boost * groundSpeed(this.world, me.x, me.y);
        // porte enfoncée : on peut avancer jusque sous le porche
        const open = this.gateBroken();
        const gateway = (x) => open && Math.abs(x - FORT.gateX) < FORT.gateW / 2 - 4;
        let nx = clamp(me.x + (vx / len) * sp, FORT.minX, FORT.maxX);
        const ny = clamp(me.y + (vy / len) * sp, gateway(me.x) ? FORT.wallY : FORT.top, FORT.bottom);
        if (me.y < FORT.top && !gateway(nx)) nx = me.x; // pas de sortie latérale sous le porche
        if (!blocked(covers, nx, me.y)) me.x = nx;
        if (!blocked(covers, me.x, ny)) me.y = ny;
        if (!open && me.y < FORT.top) me.y = FORT.top;
        me.c = coverFor(covers, me.x, me.y) && t - my.lastShot > FORT.expose && t - my.lastThrow > FORT.expose ? 1 : 0;
        if (open && inGateway(me.x, me.y) && t - my.lastEnter > 1500) {
          my.lastEnter = t;
          this.hooks.send({ kind: 'enter' });
        }
        // ramasser une caisse en passant dessus
        for (const c of this.liveCrates(t)) if (t - c.at > 500 && Math.hypot(c.x - me.x, c.y - me.y) < 13) this.grab(c);
        if (boost > 1 && (me.x !== ox || me.y !== oy) && Math.random() < dt / 40) this.dustAt(me.x, me.y);
      } else {
        me.c = down ? 1 : 0;
        me.x = clamp(me.x + (right - left) * FORT.defSpeed * dt * boost * (me.c ? 0.5 : 1), FORT.defMin, FORT.defMax);
      }
      me.moving = ox !== me.x || oy !== me.y;
      if (me.moving || oc !== me.c) this.sendLive(this.liveData(), oc !== me.c);
    }
    // les autres
    this.pl.forEach((q, i) => {
      if (i === this.me) return;
      const ox = q.x, oy = q.y;
      if (Math.hypot(q.tx - q.x, q.ty - q.y) > 60) { q.x = q.tx; q.y = q.ty; }
      else {
        const k = Math.min(1, dt * 0.012);
        q.x += (q.tx - q.x) * k;
        q.y += (q.ty - q.y) * k;
      }
      q.moving = Math.abs(q.x - ox) + Math.abs(q.y - oy) > 0.04;
      if (q.moving && this.powered(i, 'spurs') && fortAttacking(i, rh) && Math.random() < dt / 40) this.dustAt(q.x, q.y);
    });
    for (const [id, d] of this.dyns) if (t > d.at + 800) this.dyns.delete(id);
    for (const p of this.parts) { p.t += dt; p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; }
    this.parts = this.parts.filter((p) => p.t < p.max);
    for (const b of this.booms) b.t += dt;
    this.booms = this.booms.filter((b) => b.t < 1400);
    for (const x of this.tracers) x.t += dt;
    this.tracers = this.tracers.filter((x) => x.t < 70);
    for (const x of this.marks) x.t += dt;
    this.marks = this.marks.filter((x) => x.t < 180);
    // fumée de la porte enfoncée
    this.smokeT = (this.smokeT || 0) + dt;
    if (this.gateBroken() && this.smokeT > 90) {
      this.smokeT = 0;
      this.addPart({ x: GATE_L + Math.random() * FORT.gateW, y: FORT.wallY - 4, vx: 0, vy: -0.02, g: 0, t: 0, max: 600, col: 'rgba(90,80,70,0.5)', s: 2 });
    }
  }

  dustAt(x, y) {
    this.addPart({ x: x + (Math.random() - 0.5) * 6, y: y - 1, vx: (Math.random() - 0.5) * 0.02, vy: -0.01, g: 0, t: 0, max: 400, col: 'rgba(236,220,170,0.6)', s: 2 });
  }

  // ---------------------------------------------------------- rendu
  render(out) {
    const t = this.t, now = this.now;
    const amb = this.amb;
    out.drawImage(skyFor(amb.env), 0, 0);
    amb.sky(out, now);
    if (!this.world) return;
    const D = decor(this.world);
    // tout le reste du décor passe par le calque teinté de l'ambiance
    const ctx = amb.begin(out);
    ctx.drawImage(D.bg, 0, 0);
    this.drawWater(ctx, now);
    this.drawFlag(ctx, now);
    for (let i = 0; i < this.n; i++) if (!fortAttacking(i, this.rh)) this.drawDefender(ctx, i, t, now);
    ctx.drawImage(D.wall, 0, 0);
    this.drawGate(ctx);

    // ombres des dynamites en vol
    for (const d of this.dyns.values()) {
      const k = clamp((t - d.t0) / (d.at - d.t0), 0, 1);
      const sy = d.gy + (d.ty - d.gy) * k;
      if (sy > FORT.wallY) { ctx.fillStyle = 'rgba(70,50,20,0.3)'; ctx.fillRect(Math.round(d.x + (d.tx - d.x) * k) - 2, Math.round(sy), 5, 1); }
    }
    // champ de bataille, trié par profondeur
    const items = [];
    for (const c of this.world.covers) {
      const spr = this.wrecked.has(c.id) ? rubbleSprite(c.kind) : coverSprite(c.kind);
      items.push({ y: this.wrecked.has(c.id) ? c.y - 30 : c.y, draw: () => this.drawAt(ctx, spr, c.x, c.y, 1, !this.wrecked.has(c.id)) });
    }
    for (const c of this.liveCrates(t)) items.push({ y: c.y, draw: () => this.drawCrate(ctx, c, t, now) });
    for (let i = 0; i < this.n; i++) {
      if (!fortAttacking(i, this.rh) || this.pl[i].left) continue;
      items.push({ y: this.pl[i].y + (this.isDead(i) ? -40 : 0), draw: () => this.drawAttacker(ctx, i, t, now) });
    }
    items.sort((a, b) => a.y - b.y);
    for (const it of items) it.draw();

    for (const d of this.dyns.values()) this.drawDyn(ctx, d, t, now);
    for (const p of this.parts) { ctx.fillStyle = p.col; ctx.fillRect(Math.round(p.x), Math.round(p.y), p.s, p.s); }
    amb.end(out, now);
    amb.weather(out, now);
    // la nuit : meurtrières des tours et lanternes de la porte allumées
    if (this.mapInfo.fort === 'adobe') for (const x of [11, W - 17]) amb.window(out, x + 2, 48, 6, 7);
    else for (const x of [11, W - 17]) amb.window(out, x, 44, 6, 3);
    for (const x of [GATE_L - 3, GATE_R + 3]) amb.glow(out, x, GATE_TOP + 8, 16);

    // le feu, les balles, les bonus et l'interface ne sont pas teintés
    for (const b of this.booms) {
      this.drawBoom(out, b);
      if (b.t < 400) amb.glow(out, b.x, b.y - 6, b.big ? 60 : 40, '255,170,70');
    }
    for (const c of this.liveCrates(t)) this.drawCrateIcon(out, c, t, now);
    for (let i = 0; i < this.n; i++) this.drawAura(out, i, t, now);
    for (const x of this.tracers) this.drawTracer(out, x);
    for (const m of this.marks) {
      if (!m.hit) continue;
      out.fillStyle = '#fdf6e0';
      for (const [dx, dy] of [[-3, -3], [-2, -2], [2, 2], [3, 3], [-3, 3], [-2, 2], [2, -2], [3, -3]]) out.fillRect(m.x + dx, m.y + dy, 1, 1);
    }
    this.drawTags(out, t);
    this.drawHud(out, t, now);
    this.drawCrosshair(out, t);
  }

  drawAt(ctx, spr, x, y, alpha = 1, shadow = true) {
    if (shadow) {
      ctx.fillStyle = 'rgba(70,50,20,0.28)';
      const w = Math.round(spr.width * 0.42);
      ctx.fillRect(Math.round(x - w / 2), Math.round(y) - 1, w, 2);
    }
    ctx.globalAlpha = alpha;
    ctx.drawImage(spr, Math.round(x - spr.ox), Math.round(y - spr.oy));
    ctx.globalAlpha = 1;
  }

  drawWater(ctx, now) {
    const rv = this.world.river;
    if (!rv) return;
    ctx.fillStyle = 'rgba(200,226,248,0.7)';
    for (let k = 0; k < 18; k++) {
      const x = Math.round((k * 53 + now * 0.02 * (1 + (k % 3) * 0.4)) % (W + 10)) - 5;
      const y = rv.y0 + 3 + ((k * 5) % (rv.y1 - rv.y0 - 4));
      if (rv.bridges.some((b) => Math.abs(x - b) < rv.bw / 2 + 2)) continue;
      ctx.fillRect(x, y, 3, 1);
    }
  }

  pose(i, t, now) {
    const q = this.pl[i];
    if (this.isDead(i)) return ['dead', 0];
    if (t - q.throwAt < 320) return ['throw', 0];
    if (t - q.shotAt < 280) return ['aim', 0];
    if (q.c && fortAttacking(i, this.rh)) return ['crouch', 0];
    if (q.moving) return ['walk', Math.floor(now / (this.powered(i, 'spurs') ? 70 : 110) + i) % 4];
    return ['stand', 0];
  }

  alpha(i, t, now) {
    if (t - this.pl[i].hurtAt < 260 && Math.floor(now / 50) % 2) return 0.35;
    if (this.pl[i].safe > 0 && t < this.pl[i].safe && Math.floor(now / 90) % 2) return 0.5; // vient de revenir : invulnérable
    return 1;
  }

  drawAttacker(ctx, i, t, now) {
    const q = this.pl[i];
    const [pose, f] = this.pose(i, t, now);
    const spr = gunman(this.riders[i], true, pose, f);
    if (pose === 'dead') return this.drawAt(ctx, spr, q.x, q.y, 0.85, false);
    const wading = groundSpeed(this.world, q.x, q.y) < 1;
    this.drawAt(ctx, spr, q.x, q.y + (wading ? 4 : 0), this.alpha(i, t, now), !wading);
    if (wading) {
      ctx.fillStyle = '#3e6a98';
      ctx.fillRect(Math.round(q.x) - 7, Math.round(q.y), 14, 4);
      ctx.fillStyle = '#8ab8d8';
      ctx.fillRect(Math.round(q.x) - 7 + (Math.floor(now / 150) % 2), Math.round(q.y), 13, 1);
    }
  }

  drawDefender(ctx, i, t, now) {
    const q = this.pl[i];
    if (q.left || this.isDead(i)) return;
    const [pose, f] = this.pose(i, t, now);
    const bob = pose === 'walk' ? (f % 2) : 0;
    this.drawAt(ctx, gunman(this.riders[i], false, pose === 'walk' ? 'stand' : pose, 0), q.x, this.defY(i) + bob, this.alpha(i, t, now), false);
  }

  // halo des bonus actifs (étoile, Winchester, baril)
  drawAura(ctx, i, t, now) {
    const q = this.pl[i];
    if (q.left || this.isDead(i)) return;
    const atk = fortAttacking(i, this.rh);
    const x = Math.round(q.x), y = atk ? Math.round(q.y) - 14 : defFeet(q.x) - 24;
    if (this.powered(i, 'star')) {
      for (let k = 0; k < 6; k++) {
        const a = now / 180 + (k * Math.PI) / 3;
        if (Math.sin(a * 2.3) > -0.2) { ctx.fillStyle = k % 2 ? '#fff6c0' : '#f0c040'; ctx.fillRect(Math.round(x + Math.cos(a) * 10), Math.round(y + Math.sin(a) * 13), 1, 1); }
      }
    }
    if (q.keg && Math.floor(now / 200) % 2) { ctx.fillStyle = '#f87818'; ctx.fillRect(x - 8, y - 2, 2, 2); }
  }

  // noms et PV, décalés vers le haut quand ils se chevauchent
  drawTags(ctx, t) {
    const tags = [];
    for (let i = 0; i < this.n; i++) {
      const q = this.pl[i];
      if (q.left || this.isDead(i)) continue;
      const atk = fortAttacking(i, this.rh);
      tags.push({ i, x: Math.round(q.x), y: atk ? Math.round(q.y) - 44 : this.defY(i) - 46 });
    }
    tags.sort((a, b) => b.y - a.y);
    const placed = [];
    for (const g of tags) {
      while (placed.some((p) => Math.abs(p.x - g.x) < 40 && Math.abs(p.y - g.y) < 14)) g.y -= 14;
      g.y = Math.max(2, g.y);
      placed.push(g);
      const { i, x, y } = g;
      canvasText(ctx, i === this.me ? 'TOI' : this.name(i).slice(0, 9).toUpperCase(), x, y, { size: 8, color: this.color(i) });
      const hp = this.hpOf(i), max = this.pl[i].maxHp;
      for (let k = 0; k < max; k++) {
        const px = x - max * 2 + k * 4;
        ctx.fillStyle = OUT; ctx.fillRect(px - 1, y + 9, 5, 4);
        ctx.fillStyle = k < hp ? (this.safe(i) ? '#f0c040' : '#e8604c') : '#5a4a40'; ctx.fillRect(px, y + 10, 3, 2);
      }
    }
  }

  drawFlag(ctx, now) {
    const col = TEAM_COLORS[1 - this.rh];
    const x0 = FORT.gateX;
    ctx.fillStyle = '#5a3818';
    ctx.fillRect(x0, 6, 2, PARA_TOP - 6);
    ctx.fillStyle = '#e0b040';
    ctx.fillRect(x0, 5, 2, 2);
    // drapeau de l'équipe qui défend, avec une étoile
    for (let k = 0; k < 18; k++) {
      const dy = Math.round(Math.sin(now / 180 - k / 3) * 1.5 * (k / 18));
      ctx.fillStyle = OUT;
      ctx.fillRect(x0 + 2 + k, 7 + dy, 1, 12);
      ctx.fillStyle = col;
      ctx.fillRect(x0 + 2 + k, 8 + dy, 1, 10);
      ctx.fillStyle = S.shade(col, -0.3);
      ctx.fillRect(x0 + 2 + k, 17 + dy, 1, 1);
      ctx.fillStyle = '#fdf6e0';
      if (k === 5 || k === 7) ctx.fillRect(x0 + 2 + k, 12 + dy, 1, 1);
      if (k === 6) ctx.fillRect(x0 + 2 + k, 11 + dy, 1, 3);
    }
  }

  drawGate(ctx) {
    const R = (x, y, w, h, col) => { ctx.fillStyle = col; ctx.fillRect(x, y, w, h); };
    const h = FORT.wallY - GATE_TOP;
    if (this.gateBroken()) {
      R(GATE_L, GATE_TOP, FORT.gateW, h, '#1a0f0a');
      R(GATE_L + 4, GATE_TOP + 4, FORT.gateW - 8, h - 10, S.shade(this.mapInfo.yard, -0.45)); // la cour, au fond
      R(GATE_L, GATE_TOP + h - 6, FORT.gateW, 6, '#2a1a10');
      for (const [x, y, w, hh] of [[0, 14, 5, 20], [6, 24, 4, 10], [34, 18, 5, 16], [40, 8, 4, 26], [18, 28, 7, 6]]) R(GATE_L + x, GATE_TOP + y, w, hh, '#6a4020');
      return;
    }
    for (let x = GATE_L; x < GATE_R; x += 4) {
      R(x, GATE_TOP, 4, h, (x - GATE_L) % 8 ? '#8a5a30' : '#7a4a28');
      R(x, GATE_TOP, 1, h, '#5a3818');
    }
    R(FORT.gateX - 1, GATE_TOP, 2, h, '#3a2414');
    for (const y of [GATE_TOP + 6, FORT.wallY - 9]) {
      R(GATE_L, y, FORT.gateW, 2, '#4a4440');
      for (let x = GATE_L + 3; x < GATE_R; x += 8) R(x, y, 1, 1, '#8a8478');
    }
    R(FORT.gateX - 4, GATE_TOP + 15, 2, 3, '#e0b040'); R(FORT.gateX + 2, GATE_TOP + 15, 2, 3, '#e0b040');
    const missing = FORT.gateHp - this.gate;
    for (let k = 0; k < missing; k++) {
      const o = HOLES[k];
      R(o.x - 1, o.y - 1, o.w + 2, o.h + 2, '#c8a070');
      R(o.x, o.y, o.w, o.h, '#1a0f0a');
      R(o.x + 1, o.y + o.h - 1, Math.max(1, o.w - 2), 1, '#3a2414');
    }
  }

  drawCrate(ctx, c, t, now) {
    const age = t - c.at;
    const fall = clamp(1 - age / 600, 0, 1); // largage en parachute
    const y = Math.round(c.y - fall * fall * 70);
    if (c.t1 - t < 2000 && Math.floor(now / 120) % 2) return; // va disparaître
    ctx.fillStyle = 'rgba(70,50,20,0.3)';
    ctx.fillRect(Math.round(c.x) - 6 + Math.round(fall * 3), c.y - 1, 12 - Math.round(fall * 6), 2);
    if (fall > 0) this.drawAt(ctx, chute(), c.x, y - 12, 1, false);
    this.drawAt(ctx, crateSprite(), c.x, y, 1, false);
  }

  drawCrateIcon(ctx, c, t, now) {
    if (t - c.at < 600 || (c.t1 - t < 2000 && Math.floor(now / 120) % 2)) return;
    const bob = Math.round(Math.sin(now / 220 + c.id) * 1.5);
    S.disc(ctx, c.x, c.y - 22 + bob, 6, 'rgba(255,240,180,0.35)');
    this.drawAt(ctx, bonusIcon(c.kind), c.x, c.y - 22 + bob, 1, false);
  }

  drawDyn(ctx, d, t, now) {
    const k = clamp((t - d.t0) / (d.at - d.t0), 0, 1);
    const dist = Math.hypot(d.tx - d.x, d.ty - d.y);
    const x = Math.round(d.x + (d.tx - d.x) * k);
    const y = Math.round(d.y + (d.ty - d.y) * k - Math.sin(k * Math.PI) * (16 + dist * 0.3));
    if (d.big) {
      this.drawAt(ctx, bonusIcon('keg'), x, y, 1, false);
      return;
    }
    const flip = Math.floor(now / 70) % 2;
    ctx.fillStyle = OUT;
    if (flip) ctx.fillRect(x - 3, y - 2, 7, 4); else ctx.fillRect(x - 2, y - 3, 4, 7);
    ctx.fillStyle = '#c83828';
    if (flip) ctx.fillRect(x - 2, y - 1, 5, 2); else ctx.fillRect(x - 1, y - 2, 2, 5);
    ctx.fillStyle = Math.floor(now / 40) % 2 ? '#fff070' : '#fdf6e0';
    if (flip) ctx.fillRect(x + 3, y - 2, 1, 1); else ctx.fillRect(x, y - 4, 1, 1);
  }

  drawBoom(ctx, b) {
    const a = b.t, s = b.big ? 1.6 : 1;
    if (a < 160) {
      S.drawFlash(ctx, b.x, b.y - 6, (10 + a / 12) * s, b.seed);
      S.disc(ctx, b.x, b.y - 4, Math.round((5 + a / 30) * s), '#f87818');
      S.disc(ctx, b.x, b.y - 4, Math.round((3 + a / 40) * s), '#fff070');
    }
    for (let k = 0; k < 6; k++) {
      const u = a / 1400;
      const ang = b.seed + k * 1.05;
      const r = Math.round((4 + u * 7) * s);
      const sx = b.x + Math.cos(ang) * (6 + u * 10) * s, sy = b.y - 6 - u * 22 + Math.sin(ang) * 4;
      S.disc(ctx, sx, sy, r, `rgba(${a < 300 ? '90,70,50' : '120,110,100'},${0.6 * (1 - u)})`);
    }
  }

  drawTracer(ctx, x) {
    const n = Math.max(2, Math.ceil(Math.hypot(x.x1 - x.x0, x.y1 - x.y0) / 2));
    ctx.fillStyle = x.gold ? 'rgba(255,214,100,0.95)' : 'rgba(255,246,192,0.85)';
    for (let k = Math.floor(n * 0.2); k <= n; k++) {
      const u = k / n;
      ctx.fillRect(Math.round(x.x0 + (x.x1 - x.x0) * u), Math.round(x.y0 + (x.y1 - x.y0) * u), 1, 1);
    }
    S.disc(ctx, x.x0, x.y0, 2, '#fff070');
  }

  // ---------------------------------------------------------- interface
  teamAvg(team) {
    const ps = (this.state?.players || []).filter((_, i) => fortTeam(i) === team);
    return ps.length ? Math.round(ps.reduce((s, p) => s + p.score, 0) / ps.length) : 0;
  }

  band(ctx, y, h) {
    ctx.fillStyle = 'rgba(26,15,10,0.55)';
    ctx.fillRect(0, y, W, h);
  }

  drawHud(ctx, t, now) {
    const R = (x, y, w, h, col) => { ctx.fillStyle = col; ctx.fillRect(x, y, w, h); };
    // scores des équipes (moyenne par joueur)
    for (const team of [0, 1]) {
      const left = team === 0;
      const x = left ? 4 : W - 4;
      const role = fortAttacking(team, this.rh) ? 'ATTAQUE' : 'DÉFENSE';
      canvasText(ctx, `${TEAM_NAMES[team]} ${this.teamAvg(team)}`, x, 3, { align: left ? 'left' : 'right', color: TEAM_COLORS[team] });
      canvasText(ctx, role, x, 13, { align: left ? 'left' : 'right', color: '#fdf6e0' });
    }
    // solidité de la porte, sous le drapeau
    const segW = 4, bx = Math.round(FORT.gateX - 4 - (FORT.gateHp * segW) / 2);
    const broken = this.gateBroken();
    R(bx - 2, 22, FORT.gateHp * segW + 3, 6, OUT);
    for (let k = 0; k < FORT.gateHp; k++) R(bx + k * segW, 23, segW - 1, 4, k < this.gate && !broken ? (this.gate <= 3 ? '#f0a050' : '#b8e070') : '#5a4a40');
    canvasText(ctx, broken ? 'BRÈCHE' : 'PORTE', bx - 4, 21, { align: 'right', color: broken ? '#f0705a' : '#fdf6e0' });
    if (!this.world || this.t0 == null) return;

    // mes PV et mes bonus
    const me = this.pl[this.me], my = this.my;
    const hp = this.hpOf(this.me);
    for (let k = 0; k < me.maxHp; k++) {
      R(5 + k * 8, H - 11, 7, 7, OUT);
      R(6 + k * 8, H - 10, 5, 5, k < hp ? '#e8604c' : '#5a4a40');
      if (k < hp) R(7 + k * 8, H - 9, 1, 1, '#f8b0a0');
    }
    let ix = 12 + me.maxHp * 8;
    const showPower = (kind, frac) => {
      this.drawAt(ctx, bonusIcon(kind), ix, H - 7, 1, false);
      if (frac != null) { R(ix - 6, H - 2, 12, 2, OUT); R(ix - 6, H - 2, Math.round(12 * frac), 2, '#f8d070'); }
      ix += 16;
    };
    if (me.power && t < me.powerUntil) showPower(me.power, (me.powerUntil - t) / (FORT_BONUS[me.power].ms || 1));
    if (me.keg) showPower('keg', null);
    if (me.dynFast > 0) showPower('dynpack', null);

    // balles et dynamite
    const rifle = this.powered(this.me, 'rifle');
    for (let k = 0; k < FORT.ammo; k++) {
      const x = W - 8 - k * 5, full = rifle || (k < my.ammo && !my.reloadUntil);
      R(x - 1, H - 13, 4, 10, OUT);
      R(x, H - 12, 2, 8, full ? (rifle ? '#f8d070' : '#e0b040') : '#5a4a40');
      if (full) R(x, H - 12, 2, 2, '#a87040');
    }
    if (my.reloadUntil && !rifle) canvasText(ctx, 'RECHARGE', W - 34, H - 24, { color: '#fdf6e0' });
    else if (!my.ammo && !rifle) canvasText(ctx, 'R : RECHARGER', W - 52, H - 24, { color: Math.floor(now / 250) % 2 ? '#f0705a' : '#fdf6e0' });
    const ready = t >= my.nextDyn;
    const dx = W - 46, dy = H - 13;
    if (me.keg) this.drawAt(ctx, bonusIcon('keg'), dx + 1, dy + 5, ready ? 1 : 0.5, false);
    else {
      R(dx - 1, dy - 1, 5, 11, OUT);
      R(dx, dy, 3, 9, ready ? '#c83828' : '#5a4a40');
      if (!ready) {
        const cd = me.dynFast > 0 ? FORT.dynFastCd : FORT.dynCd;
        const k = clamp(1 - (my.nextDyn - t) / cd, 0, 1);
        R(dx, dy + 9 - Math.round(9 * k), 3, Math.round(9 * k), '#8a3a2a');
      } else if (Math.floor(now / 90) % 2) R(dx + 1, dy - 3, 1, 2, '#fff070');
    }
    if (!this.attacking && fortHalf(t) >= 0 && !this.isDead(this.me)) {
      canvasText(ctx, me.c ? 'BAISSÉ' : 'S : SE BAISSER', W / 2, H - 11, { color: me.c ? '#f8d070' : 'rgba(253,246,224,0.7)' });
    }

    // bandeau de début de manche
    const h = fortHalf(t);
    const since = h >= 0 ? t - fortHalfStart(h) : 1e9;
    if (since < 2600 && !this.over) {
      if (h > 0 && since < 900) {
        ctx.globalAlpha = 1 - since / 900;
        canvasText(ctx, this.goText(), W / 2, 90, { size: 24, color: '#f8d070' });
        ctx.globalAlpha = 1;
      }
      const sub = this.attacking ? 'FAIS SAUTER LA PORTE À LA DYNAMITE !' : 'ABATS-LES AVANT QU\'ILS N\'ARRIVENT !';
      this.band(ctx, 117, 13);
      canvasText(ctx, sub, W / 2, 120, { color: '#fdf6e0' });
    } else if (broken && this.attacking && !this.isDead(this.me) && Math.floor(now / 300) % 2) {
      this.band(ctx, 117, 13);
      canvasText(ctx, 'LA PORTE EST OUVERTE : FONCE DEDANS !', W / 2, 120, { color: '#f8d070' });
    }
    // mort : retour au point de départ
    if (this.isDead(this.me) && h >= 0) {
      this.band(ctx, 98, 30);
      canvasText(ctx, 'TOUCHÉ !', W / 2, 102, { size: 8, color: '#f0705a' });
      canvasText(ctx, `RETOUR DANS ${Math.max(1, Math.ceil((me.dead - t) / 1000))}`, W / 2, 114, { color: '#fdf6e0' });
    }
  }

  drawOverlay(ctx) {
    super.drawOverlay(ctx);
    const t = this.t;
    if (this.t0 == null || this.over || t < FORT.half || t >= FORT.half + FORT.brk) return;
    ctx.fillStyle = 'rgba(26,15,10,0.72)';
    ctx.fillRect(0, 60, W, 86);
    canvasText(ctx, 'CHANGEMENT DE CAMP !', W / 2, 68, { size: 16, color: '#f8d070' });
    canvasText(ctx, `LES ${TEAM_NAMES[1]} ATTAQUENT, LES ${TEAM_NAMES[0]} DÉFENDENT`, W / 2, 92, { color: '#fdf6e0' });
    canvasText(ctx, this.attacking ? 'À TOI D\'ATTAQUER LE FORT !' : 'À TOI DE DÉFENDRE LE FORT !', W / 2, 106, { color: this.color(this.me) });
    canvasText(ctx, String(Math.ceil((FORT.half + FORT.brk - t) / 1000)), W / 2, 120, { size: 16, color: '#f0705a' });
  }

  drawCrosshair(ctx, t) {
    if (!this.mouse.in || this.t0 == null) return;
    const m = this.mouse, me = this.pl[this.me], my = this.my;
    const can = this.canAct();
    // point de chute de la dynamite (rouge s'il touche la porte)
    if (can && t >= my.nextDyn && !(me.c && !this.attacking)) {
      const to = dynTarget(this.attacking, me, m.x, m.y);
      const hot = this.attacking && onGate(to.x, to.y);
      const r = blastOf(me.keg > 0);
      ring(ctx, to.x, to.y, r, Math.round(r * 0.6), hot ? '#f0705a' : 'rgba(253,246,224,0.45)', 3, t / 120);
    }
    const rifle = this.powered(this.me, 'rifle');
    const ok = can && (rifle || (!my.reloadUntil && my.ammo > 0)) && !(me.c && !this.attacking);
    const x = Math.round(m.x), y = Math.round(m.y);
    const tg = ok ? this.targetAt(x, y) : { v: -1 };
    const col = !ok ? '#8a8478' : tg.v >= 0 ? (tg.head ? '#f8d070' : '#f0705a') : !this.attacking && this.crateAt(x, y, t) ? '#b8e070' : '#fdf6e0';
    const seg = (dx, dy, w, hh) => {
      ctx.fillStyle = OUT; ctx.fillRect(x + dx + 1, y + dy + 1, w, hh);
      ctx.fillStyle = col; ctx.fillRect(x + dx, y + dy, w, hh);
    };
    seg(-8, 0, 4, 1); seg(5, 0, 4, 1); seg(0, -8, 1, 4); seg(0, 5, 1, 4);
    ctx.fillStyle = this.color(this.me);
    ctx.fillRect(x, y, 1, 1);
  }

  hudStats() {
    if (!this.world || !this.pl) return [];
    return [
      [this.attacking ? 'ATTAQUE' : 'DÉFENSE', '', 'yellow'],
      ['PORTE', this.gateBroken() ? 'BRÈCHE' : `${this.gate}/${FORT.gateHp}`, 'cream'],
      [TEAM_NAMES[0], this.teamAvg(0), 'salmon'],
      [TEAM_NAMES[1], this.teamAvg(1), 'cream'],
    ];
  }
}
