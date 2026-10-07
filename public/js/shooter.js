// Mini-jeu « Fusillade » : rail shooter de la gare de Dusty Gulch au saloon, en passant par les abords de la ville
// (cimetière, ranch ou mine, tiré au sort, voir shooteredge.js) et la grand-rue.
// La caméra avance toute seule ; les bandits surgissent des fenêtres, des portes, des toits et des abris.
// La rue (succession de façades, abris) et l'ambiance (heure, météo) changent à chaque partie.
import * as S from './sprites.js';
import { sfx } from './audio.js';
import { canvasText } from './scene.js';
import { SKIN, CLOTH_COLORS } from './data.js';
import { MiniScene, ring } from './miniscene.js';
import { desertOpts } from './env.js';
import { Deco } from './shooterdeco.js';
import { renderEdge, edgeSigns, edgeLights } from './shooteredge.js';
import { horseSprite, riderLook } from './lasso.js';
import {
  W, H, GROUND, STREET_W, SALOON_W, SALOON_START, facade, belfry, PROP_DIM, PROP_BASE,
  SAL, camAt, shooterWorld, BONUSES, BONUS_MS, SAND_MS, crateAt, targetSec, bossX, BOSS_T0, SHOOTER_PTS,
  WAGER, shooterEventAt, STATION_START, STREET_START, STATION_W, STA, STA_COVER, wagonOpenings, locoCab,
  stationTrain, EDGE_START, FADES, rideX,
} from './worlds.js';

const AMMO = 6, RELOAD = 850;
// rattrapage : le dernier (300 pts de retard ou plus) a un barillet de 8 balles qui se recharge plus vite
const AMMO_BACK = 8, RELOAD_BACK = 550, BEHIND = 300;
const BANNER_MS = 1800; // durée des annonces (embuscade, bonus…)
const EVENT_TXT = {
  ambush: ['EMBUSCADE !', '#f0705a'],
  train: ['ATTAQUE DU TRAIN !', '#f0705a'],
  graves: ['EMBUSCADE AU CIMETIÈRE !', '#f0705a'],
  riders: ['CAVALIERS EN VUE !', '#f0a070'],
  tnt: ['DYNAMITE ! ABATS-LA EN VOL', '#f0705a'],
  bounty: ['PRIME DOUBLÉE : 8 S !', '#f8d070'],
  blackout: ['PANNE DE LUMIÈRE !', '#c8b8e8'],
  wager: [`PARI SUR EL DIABLO : TOUCHE B`, '#f8d070'],
};
const GUN_TXT = {
  gatling: 'MITRAILLEUSE ! (CLIC MAINTENU)',
  rusty: 'VIEILLE GATLING : 30 BALLES',
  winchester: 'WINCHESTER : 15 BALLES',
  akimbo: 'DEUX COLTS : 2 BALLES PAR CLIC',
};
const OUT = S.OUT;

const BANDITS = [
  { skin: 1, hat: 'cowboy', hatColor: 7, hair: 'short', hairColor: 0, eyes: 'angry', nose: 'big', mouth: 'frown', beard: 'stubble', outfit: 'duster', outfitColor: 1 },
  { skin: 3, hat: 'sombrero', hatColor: 1, hair: 'long', hairColor: 0, eyes: 'squint', nose: 'hooked', mouth: 'cigar', beard: 'mustache', outfit: 'poncho', outfitColor: 4 },
  { skin: 0, hat: 'bandana', hatColor: 0, hair: 'messy', hairColor: 5, eyes: 'angry', nose: 'broken', mouth: 'grin', beard: 'full', outfit: 'vest', outfitColor: 7 },
  { skin: 2, hat: 'gambler', hatColor: 7, hair: 'ponytail', hairColor: 1, eyes: 'patch', nose: 'small', mouth: 'toothpick', beard: 'goatee', outfit: 'duster', outfitColor: 7 },
  { skin: 4, hat: 'cowboy', hatColor: 1, hair: 'curly', hairColor: 0, eyes: 'squint', nose: 'round', mouth: 'frown', beard: 'chops', outfit: 'shirt', outfitColor: 0 },
  { skin: 1, hat: 'coonskin', hatColor: 1, hair: 'mullet', hairColor: 2, eyes: 'angry', nose: 'red', mouth: 'neutral', beard: 'horseshoe', outfit: 'vest', outfitColor: 4 },
  { skin: 5, hat: 'bowler', hatColor: 7, hair: 'short', hairColor: 0, eyes: 'tired', nose: 'big', mouth: 'cigar', beard: 'handlebar', outfit: 'duster', outfitColor: 1 },
  { skin: 2, hat: 'cowboy', hatColor: 0, hair: 'long', hairColor: 6, eyes: 'angry', nose: 'hooked', mouth: 'grin', beard: 'stubble', outfit: 'poncho', outfitColor: 7 },
];
const CIVILS = [
  { skin: 0, hat: 'none', hatColor: 5, hair: 'long', hairColor: 4, eyes: 'wide', nose: 'small', mouth: 'neutral', beard: 'none', outfit: 'shirt', outfitColor: 5 },
  { skin: 2, hat: 'bowler', hatColor: 3, hair: 'short', hairColor: 6, eyes: 'wide', nose: 'round', mouth: 'neutral', beard: 'mustache', outfit: 'vest', outfitColor: 3 },
  { skin: 1, hat: 'tophat', hatColor: 7, hair: 'short', hairColor: 7, eyes: 'wide', nose: 'big', mouth: 'neutral', beard: 'full', outfit: 'vest', outfitColor: 6 },
  { skin: 3, hat: 'none', hatColor: 5, hair: 'curly', hairColor: 0, eyes: 'wide', nose: 'small', mouth: 'smile', beard: 'none', outfit: 'shirt', outfitColor: 6 },
  { skin: 4, hat: 'none', hatColor: 5, hair: 'ponytail', hairColor: 2, eyes: 'wide', nose: 'small', mouth: 'neutral', beard: 'none', outfit: 'shirt', outfitColor: 3 },
];
// Le ravitailleur : un vieux prospecteur à barbe blanche, de notre côté (ne pas lui tirer dessus)
const SUPPLIER = { skin: 1, hat: 'cowboy', hatColor: 5, hair: 'messy', hairColor: 7, eyes: 'wide', nose: 'red', mouth: 'smile', beard: 'full', outfit: 'shirt', outfitColor: 4 };
const BOSS = { skin: 3, hat: 'sombrero', hatColor: 7, hair: 'long', hairColor: 0, eyes: 'patch', nose: 'hooked', mouth: 'cigar', beard: 'handlebar', outfit: 'poncho', outfitColor: 0 };
const BOSS_SCALE = 1.5;
const BOTTLES = ['#4a7a3a', '#8a4a1a', '#9ab8c8', '#6a2a2a'];
const HORSE_COATS = [['#8a5a34', '#3a2214'], ['#2a2220', '#1a1210'], ['#e8dcc8', '#8a7a68'], ['#a8683a', '#f4ecd8'], ['#5a4a40', '#2a2220']];
const RIDE_SCALE = 1.5; // cheval et cavalier agrandis, à l'échelle des bandits
const EVENT_SFX = { ambush: 'hurt', train: 'hurt', graves: 'hurt', tnt: 'hurt', riders: 'neigh', blackout: 'thud' };

// sprite retourné (les chevaux galopent vers la droite)
function flipped(spr) {
  if (!spr.flip) {
    const c = S.makeCanvas(spr.width, spr.height);
    const x = c.getContext('2d');
    x.scale(-1, 1);
    x.drawImage(spr, -spr.width, 0);
    c.ox = spr.width - spr.ox;
    c.oy = spr.oy;
    spr.flip = c;
  }
  return spr.flip;
}

const clamp01 = (k) => (k < 0 ? 0 : k > 1 ? 1 : k);
const hash = (n) => {
  let t = (n * 0x6d2b79f5) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

// ------------------------------------------------------------ décors (dessinés une fois par rue)
export function paint(ctx) {
  const R = (x, y, w, h, col) => { ctx.fillStyle = col; ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };
  const box = (x, y, w, h, col) => { R(x - 1, y - 1, w + 2, h + 2, OUT); R(x, y, w, h, col); };
  return { R, box };
}

export function seeded(s) { return () => ((s = (s * 9301 + 49297) % 233280) / 233280); }

function signRect(b, f) {
  const w = Math.min(b.w - 16, b.sign.length * 7 + 12);
  const y = f.roof === 'gable' ? f.top - 15 : f.up > 0 ? 98 : f.top + 5;
  return { x: Math.round(b.x + b.w / 2 - w / 2), y, w, h: 11 };
}

export function drawWindow(ctx, r, trim, rnd, glass = false) {
  const { R } = paint(ctx);
  R(r.x - 3, r.y - 3, r.w + 6, r.h + 6, OUT);
  R(r.x - 2, r.y - 2, r.w + 4, r.h + 4, trim);
  if (glass) {
    // vitrail en ogive
    for (let k = 1; k <= 4; k++) R(r.x - 2 + k, r.y - 2 - (5 - k), r.w + 4 - 2 * k, 1, k === 1 ? OUT : trim);
    const cols = ['#3a6ec0', '#c0392b', '#e0b040', '#4a7a3a'];
    for (let y = 0; y < r.h; y += 4) for (let x = 0; x < r.w; x += 4) R(r.x + x, r.y + y, 4, 4, cols[(x / 4 + y / 4) % 4]);
    for (let y = 0; y < r.h; y += 4) R(r.x, r.y + y, r.w, 1, '#2a1a10');
    R(r.x + r.w / 2, r.y, 1, r.h, '#2a1a10');
    return;
  }
  R(r.x, r.y, r.w, r.h, '#24140c');
  R(r.x, r.y, r.w, 3, '#160c06');
  const cur = rnd() < 0.5 ? '#a8403a' : rnd() < 0.5 ? '#c8a060' : '#5a7a9a';
  R(r.x, r.y, 4, r.h, cur); R(r.x + r.w - 4, r.y, 4, r.h, cur);
  R(r.x + 2, r.y, 1, r.h, S.shade(cur, -0.3)); R(r.x + r.w - 3, r.y, 1, r.h, S.shade(cur, -0.3));
  R(r.x - 4, r.y + r.h + 2, r.w + 8, 2, S.shade(trim, -0.2));
}

export function drawDoor(ctx, d, trim, col, arched = false) {
  const { R } = paint(ctx);
  if (arched) for (let k = 0; k < 6; k++) { R(d.x - 3 + k, d.y - 9 + k, d.w + 6 - 2 * k, 1, OUT); R(d.x - 2 + k, d.y - 8 + k, d.w + 4 - 2 * k, 1, k < 2 ? trim : '#1e1008'); }
  R(d.x - 3, d.y - 3, d.w + 6, d.h + 3, OUT);
  R(d.x - 2, d.y - 2, d.w + 4, d.h + 2, trim);
  R(d.x, d.y, d.w, d.h, '#1e1008');
  R(d.x, d.y, d.w, 4, '#140a04');
  R(d.x, d.y, 6, d.h, S.shade(col, -0.45)); R(d.x + 4, d.y + d.h / 2, 1, 2, '#e0b040');
}

// toit à pignon (écurie, forge, église)
export function gable(R, b, f, col) {
  const { x, w, top } = f;
  for (let dy = 0; dy <= 22; dy++) {
    const hw = (w / 2 + 4) * (1 - dy / 24);
    R(x + w / 2 - hw - 1, top - dy, hw * 2 + 2, 1, OUT);
    R(x + w / 2 - hw, top - dy, hw * 2, 1, dy % 4 === 0 ? S.shade(col, -0.2) : col);
  }
}

function drawBuilding(ctx, b, rnd) {
  const { R, box } = paint(ctx);
  const f = facade(b);
  const { x, w, top } = f;
  const col = b.col, dk = S.shade(col, -0.25), lt = S.shade(col, 0.14);
  const trim = S.mix(col, '#f4ecd8', 0.55);
  if (f.roof === 'gable') gable(R, b, f, b.kind === 'church' ? '#6a5a6a' : '#6a3a1a');
  if (b.kind === 'smithy') { box(x + w * 0.72, top - 30, 9, 22, '#5a4a40'); R(x + w * 0.72, top - 30, 9, 2, '#3a2a20'); }
  // fronton au-dessus de la corniche (dessiné avant, la corniche passe devant)
  const fw = Math.round(w * 0.3), fx = Math.round(x + (w - fw) / 2);
  if (f.roof === 'step') {
    box(fx, top - 10, fw, 10, col); box(fx + 7, top - 17, fw - 14, 7, col);
    R(fx, top - 10, fw, 1, lt); R(fx + 7, top - 17, fw - 14, 1, lt);
  } else if (f.roof === 'arch') {
    for (let i = -1; i <= fw; i++) {
      const u = (i - fw / 2) / (fw / 2 + 1);
      const h = Math.round(14 * Math.sqrt(Math.max(0, 1 - u * u)));
      R(fx + i, top - h - 1, 1, h + 1, OUT);
      if (i >= 0 && i < fw) R(fx + i, top - h, 1, h, i % 6 ? col : dk);
    }
  }
  box(x, top, w, GROUND - top, col);
  if (b.kind === 'jail') {
    for (let y = top + 2, r = 0; y < GROUND; y += 6, r++) {
      R(x, y, w, 1, dk);
      for (let px = x + (r % 2) * 7; px < x + w; px += 14) R(px, y, 1, 6, dk);
    }
  } else for (let px = x + 3; px < x + w; px += 6) R(px, top + 1, 1, GROUND - top - 1, dk);
  for (let k = 0; k < w / 10; k++) R(x + 2 + rnd() * (w - 4), top + 4 + rnd() * (GROUND - top - 8), 2, 1, dk);
  R(x - 3, top - 4, w + 6, 5, dk); R(x - 3, top - 4, w + 6, 1, lt); R(x - 4, top - 5, w + 8, 1, OUT); R(x - 4, top + 1, w + 8, 1, OUT);
  if (f.roof !== 'gable') { R(x - 4, top - 8, 3, 4, dk); R(x + w + 1, top - 8, 3, 4, dk); }
  if (b.steeple) {
    const r = belfry(b), cx = Math.round(x + w / 2), ty = r.y - 6;
    box(cx - 15, ty, 30, top - ty, col);
    for (let px = cx - 12; px < cx + 15; px += 6) R(px, ty + 1, 1, top - ty - 1, dk);
    for (let dy = 0; dy < 12; dy++) {
      const hw = Math.round(17 * (1 - dy / 12));
      R(cx - hw - 1, ty - dy - 1, hw * 2 + 2, 1, OUT);
      R(cx - hw, ty - dy, hw * 2, 1, dy % 3 ? '#6a5a6a' : '#5a4a5a');
    }
    R(cx - 1, ty - 22, 3, 10, OUT); R(cx - 4, ty - 19, 9, 3, OUT); R(cx, ty - 21, 1, 8, '#e0b040'); R(cx - 3, ty - 18, 7, 1, '#e0b040');
    R(r.x - 2, r.y - 2, r.w + 4, r.h + 2, OUT); R(r.x, r.y, r.w, r.h, '#24140c');
    S.disc(ctx, cx, r.y + 7, 5, OUT); S.disc(ctx, cx, r.y + 7, 4, '#c8a040'); R(cx - 6, r.y + 11, 13, 2, '#c8a040');
  }
  if (f.up > 0 && b.sign) { R(x, 96, w, 13, S.shade(col, -0.35)); R(x, 96, w, 1, lt); R(x, 108, w, 1, OUT); }
  if (b.sign) {
    const sr = signRect(b, f);
    box(sr.x, sr.y, sr.w, sr.h, '#e8d4a0');
    R(sr.x, sr.y + sr.h - 2, sr.w, 2, '#c8b07c');
  }
  for (const win of f.windows) drawWindow(ctx, win, trim, rnd, b.kind === 'church');
  const d = f.door;
  if (b.kind === 'smithy') {
    // grande porte ouverte sur le foyer de la forge
    drawDoor(ctx, d, trim, col);
    R(d.x + d.w - 20, d.y + 24, 16, 32, '#3a2a20'); R(d.x + d.w - 17, d.y + 34, 10, 8, '#f87818'); R(d.x + d.w - 15, d.y + 36, 6, 4, '#fff070');
    box(d.x - 24, 150, 18, 5, '#4a4f58'); box(d.x - 19, 155, 8, 9, '#3a3e44'); R(d.x - 24, 150, 18, 1, '#8a8f98');
  } else drawDoor(ctx, d, trim, col, b.kind === 'church');
  switch (b.kind) {
    case 'bank':
      S.disc(ctx, x + w / 2, top + 12, 6, OUT); S.disc(ctx, x + w / 2, top + 12, 5, '#e0b040');
      R(x + w / 2, top + 8, 1, 9, '#8a6a20'); R(x + w / 2 - 2, top + 10, 4, 1, '#8a6a20'); R(x + w / 2 - 2, top + 14, 4, 1, '#8a6a20');
      break;
    case 'sheriff': {
      const sx = x + w * 0.47, sy = 128;
      S.disc(ctx, sx, sy, 6, OUT); S.disc(ctx, sx, sy, 5, '#e0b040');
      for (const [dx, dy] of [[0, -7], [6, -2], [4, 6], [-4, 6], [-6, -2]]) { R(sx + dx - 1, sy + dy - 1, 3, 3, OUT); R(sx + dx, sy + dy, 1, 1, '#e0b040'); }
      break;
    }
    case 'barber': {
      const px = x + w * 0.47;
      box(px, 116, 5, 36, '#f4ecd8');
      for (let k = 0; k < 36; k += 6) { R(px, 116 + k, 5, 2, '#c0392b'); R(px, 119 + k, 5, 1, '#3a6ec0'); }
      R(px - 1, 114, 7, 2, '#e0b040'); R(px - 1, 152, 7, 2, '#e0b040');
      break;
    }
    case 'undertaker': {
      for (const cx of [x + w * 0.86, x + w * 0.95]) {
        const c = Math.round(cx);
        R(c - 6, 120, 12, 46, OUT); R(c - 5, 121, 10, 44, '#4a2c18'); R(c - 6, 132, 12, 4, OUT); R(c - 5, 133, 10, 2, '#5e3822');
        R(c - 1, 126, 2, 10, '#c8b07c'); R(c - 3, 129, 6, 2, '#c8b07c');
      }
      break;
    }
    case 'stable':
      R(d.x + 6, d.y + d.h - 12, 18, 12, '#d8b048'); R(d.x + 24, d.y + d.h - 9, 16, 9, '#c8a040');
      R(x + w / 2 - 1, f.windows[0].y - 10, 2, 8, '#3a2214'); R(x + w / 2 - 8, f.windows[0].y - 10, 16, 2, '#3a2214');
      break;
    case 'gunsmith': {
      // enseigne en forme de revolver, suspendue à une potence
      const gx = x + w - 2;
      R(gx, 112, 16, 2, OUT); R(gx + 14, 112, 2, 6, OUT);
      box(gx + 2, 118, 22, 5, '#6a6f78'); R(gx + 2, 118, 22, 1, '#9aa0a8'); box(gx + 4, 123, 6, 8, '#7a4a24'); box(gx + 10, 116, 4, 3, '#6a6f78');
      break;
    }
    case 'doctor':
      box(d.x + d.w + 5, 118, 13, 13, '#f4ecd8'); R(d.x + d.w + 10, 120, 3, 9, '#c0392b'); R(d.x + d.w + 7, 123, 9, 3, '#c0392b');
      break;
    case 'theater':
      for (let px = x + 3; px < x + w - 2; px += 6) { R(px, 92, 2, 2, OUT); R(px, 91, 2, 2, '#f8e08a'); }
      for (let py = top + 6; py < GROUND - 4; py += 8) { R(x + 1, py, 2, 2, '#f8e08a'); R(x + w - 3, py, 2, 2, '#f8e08a'); }
      for (const px of [d.x - 22, d.x + d.w + 6]) { box(px, 118, 16, 24, '#e8d4a0'); R(px + 2, 121, 12, 8, '#8a3a5a'); R(px + 2, 132, 12, 1, '#5a3a20'); R(px + 2, 135, 9, 1, '#5a3a20'); }
      break;
    case 'laundry': {
      R(x + 4, top + 7, w - 8, 1, '#e8dcc0');
      const cols = ['#f4ecd8', '#c0392b', '#3a6ec0', '#e0b040', '#f4ecd8'];
      for (let k = 0, px = x + 10; px < x + w - 16; px += 18, k++) {
        box(px, top + 8, 10, 9, cols[k % cols.length]); R(px - 2, top + 8, 3, 4, cols[k % cols.length]); R(px + 9, top + 8, 3, 4, cols[k % cols.length]);
      }
      break;
    }
    case 'saloon':
      for (const lx of [d.x - 10, d.x + d.w + 6]) { box(lx, 118, 4, 7, '#f8e08a'); R(lx + 1, 113, 2, 5, '#3a2214'); }
      break;
  }
  if (f.balcony) for (const px of [x + 1, x + w - 5]) box(px, 109, 4, GROUND - 109, dk);
}

export function drawProp(ctx, p) {
  const { R, box } = paint(ctx);
  const [w, h] = PROP_DIM[p.kind];
  const x = p.x, top = PROP_BASE - h;
  switch (p.kind) {
    case 'wagon': {
      for (let i = 0; i <= 70; i++) {
        const ah = Math.round(22 * Math.sin((Math.PI * i) / 70));
        R(x + 8 + i, 172 - ah - 1, 1, ah + 1, OUT);
      }
      for (let i = 1; i < 70; i++) {
        const ah = Math.round(22 * Math.sin((Math.PI * i) / 70));
        R(x + 8 + i, 172 - ah, 1, ah, i % 14 < 2 ? '#c8bca0' : '#ece2c8');
      }
      box(x + 2, 172, 82, 14, '#7a4a24');
      R(x + 2, 178, 82, 1, '#5a3418');
      for (const cx of [x + 16, x + 70]) {
        S.disc(ctx, cx, 190, 10, OUT); S.disc(ctx, cx, 190, 9, '#8a5a34'); S.disc(ctx, cx, 190, 7, '#c08850');
        R(cx - 7, 190, 15, 1, '#8a5a34'); R(cx, 183, 1, 15, '#8a5a34');
        S.disc(ctx, cx, 190, 2, OUT);
      }
      break;
    }
    case 'fence':
      for (const px of [0, 30, 60, 88]) box(x + px, top, 3, h, '#8a6a48');
      box(x, top + 4, 91, 3, '#9a7a52'); box(x, top + 12, 91, 3, '#9a7a52');
      break;
    case 'rock':
      S.disc(ctx, x + 14, 190, 13, OUT); S.disc(ctx, x + 28, 188, 14, OUT); S.disc(ctx, x + 37, 194, 8, OUT);
      S.disc(ctx, x + 14, 190, 12, '#9a7a5a'); S.disc(ctx, x + 28, 188, 13, '#a8886a'); S.disc(ctx, x + 37, 194, 7, '#8a6a4a');
      R(x + 20, 178, 10, 2, '#c8a888'); R(x + 8, 184, 6, 1, '#c8a888');
      R(x - 2, 200, 48, 16, '#c48c58');
      break;
    case 'hay':
      box(x, top, w, h, '#d8b048');
      for (let k = 2; k < w; k += 4) R(x + k, top + 1, 1, h - 2, '#c09838');
      R(x, top + 7, w, 2, '#8a6a30'); R(x, top + 16, w, 2, '#8a6a30');
      break;
    case 'barrels':
      for (const bx of [x, x + 18]) {
        box(bx, top, 16, h, '#8a5a34');
        R(bx + 3, top, 2, h, '#a8703c');
        for (const yy of [4, 13, 22]) R(bx, top + yy, 16, 2, '#4a4f58');
        R(bx + 1, top, 14, 2, '#6a4024');
      }
      break;
    case 'crates':
      box(x, top, w, h, '#a8783c');
      R(x + 2, top + 2, w - 4, h - 4, '#b88848');
      for (let k = 0; k < w - 4; k++) { R(x + 2 + k, top + 2 + Math.round((k * (h - 4)) / (w - 4)), 2, 1, '#7a5428'); }
      R(x, top + h / 2, w, 1, '#7a5428');
      break;
    case 'trough':
      box(x, top, w, h - 4, '#7a5a3a');
      R(x + 2, top, w - 4, 2, '#5a8ab0'); R(x + 4, top + 5, w - 8, 1, '#5a3a20');
      box(x + 3, top + h - 4, 3, 4, '#5a3a20'); box(x + w - 6, top + h - 4, 3, 4, '#5a3a20');
      break;
  }
}

function renderStreet(L) {
  const bg = S.makeCanvas(STREET_W, H);
  const front = S.makeCanvas(STREET_W, H);
  const ctx = bg.getContext('2d');
  const { R, box } = paint(ctx);
  const rnd = seeded(17 + (L.seed % 1000));
  // rue en terre battue
  const bands = ['#c89058', '#c08850', '#c48c58', '#ca945e'];
  bands.forEach((c, i) => R(0, GROUND + i * 13, STREET_W, 14, c));
  for (let i = 0; i < 2600; i++) R(rnd() * STREET_W, GROUND + rnd() * 50, rnd() < 0.2 ? 2 : 1, 1, rnd() < 0.5 ? '#e0a870' : '#8a5a34');
  for (const y of [186, 205]) for (let x = 0; x < STREET_W; x += 3) R(x, y + (x % 7 === 0 ? 1 : 0), 2, 1, '#a87040');
  // poteaux télégraphiques
  const poles = L.poles;
  for (let i = 0; i < poles.length; i++) {
    box(poles[i], 30, 3, GROUND - 30, '#5a3a20');
    box(poles[i] - 6, 34, 15, 2, '#5a3a20');
    if (i) for (let x = poles[i - 1] + 2; x < poles[i]; x += 2) {
      const u = (x - poles[i - 1]) / (poles[i] - poles[i - 1]);
      R(x, 35 + Math.sin(u * Math.PI) * 10, 1, 1, '#2a1a10');
    }
  }
  // château d'eau dans la plus grande ruelle
  if (L.tower != null) {
    const tx = L.tower - 26;
    for (const lx of [tx + 6, tx + 44]) box(lx, 92, 3, GROUND - 92, '#5a3a20');
    box(tx, 56, 52, 36, '#7a5a3a');
    for (let k = 0; k < 52; k += 5) R(tx + k, 56, 1, 36, '#5a3a20');
    R(tx, 64, 52, 2, '#4a4f58'); R(tx, 82, 52, 2, '#4a4f58');
    for (let k = 0; k < 14; k++) R(tx - 2 + k * 2, 56 - k, 56 - k * 4, 1, k ? '#6a3a1a' : OUT);
  }
  // panneau de bienvenue
  box(198, 120, 3, 46, '#5a3a20'); box(251, 120, 3, 46, '#5a3a20');
  box(186, 114, 80, 14, '#d8bc80');
  // bâtiments + trottoir
  for (const b of L.buildings) {
    drawBuilding(ctx, b, rnd);
    box(b.x - 4, GROUND - 4, b.w + 8, 6, '#8a5a34');
    for (let x = b.x - 4; x < b.x + b.w + 4; x += 8) R(x, GROUND - 4, 1, 6, '#5a3418');
    R(b.x - 4, GROUND + 2, b.w + 8, 3, '#5a3418');
  }
  // premier plan : abris, balcons, auvents, barreaux, portes battantes
  const fx = front.getContext('2d');
  const F = paint(fx);
  for (const p of L.props) drawProp(fx, p);
  for (const b of L.buildings) {
    const f = facade(b);
    if (f.balcony) {
      F.box(b.x - 2, 84, b.w + 4, 3, '#8a5a34');
      F.R(b.x - 2, 84, b.w + 4, 1, '#a8703c');
      for (let x = b.x; x < b.x + b.w; x += 7) F.R(x, 87, 2, 9, '#7a4a28');
    }
    if (f.awning) {
      const stripe = [S.mix(b.col, '#f4ecd8', 0.7), S.shade(b.col, -0.15)];
      F.R(b.x - 3, 109, b.w + 6, 7, OUT);
      for (let x = b.x - 2; x < b.x + b.w + 2; x += 8) F.R(x, 110, Math.min(8, b.x + b.w + 2 - x), 5, stripe[((x - b.x) >> 3) & 1]);
      for (let x = b.x - 2; x < b.x + b.w + 2; x += 4) F.R(x, 115, 2, 1, stripe[1]);
    }
    if (b.bars) for (const wn of f.windows) for (let x = wn.x + 4; x < wn.x + wn.w - 2; x += 5) F.box(x, wn.y, 1, wn.h, '#4a4f58');
    if (b.kind === 'saloon') {
      const d = f.door;
      for (const lx of [d.x + 1, d.x + d.w / 2 + 1]) {
        F.box(lx, d.y + 14, d.w / 2 - 2, 24, '#a8703c');
        for (let k = 3; k < 22; k += 4) F.R(lx + 2, d.y + 14 + k, d.w / 2 - 6, 1, '#7a4a28');
      }
    }
  }
  return { bg, front };
}

function renderSaloonRoom() {
  const bg = S.makeCanvas(SALOON_W, H);
  const front = S.makeCanvas(SALOON_W, H);
  const ctx = bg.getContext('2d');
  const { R, box } = paint(ctx);
  const rnd = seeded(29);
  const B = SAL.balcony;
  // papier peint de l'étage
  R(0, 0, SALOON_W, B, '#6a2a2a');
  for (let x = 0; x < SALOON_W; x += 8) R(x, 0, 2, B, '#5a2222');
  for (let y = 12; y < B; y += 12) for (let x = 4 + ((y / 12) % 2) * 4; x < SALOON_W; x += 8) R(x, y, 1, 1, '#9a5a3a');
  R(0, 0, SALOON_W, 7, '#2a1810'); R(0, 7, SALOON_W, 1, OUT);
  for (const x of SAL.upperDoors) {
    drawDoor(ctx, { x, y: B - 56, w: 34, h: 56 }, '#c8a070', '#6a2a2a');
    box(x + 13, B - 64, 8, 5, '#e0b040');
  }
  // (les lustres sont dessinés par shooterdeco.js : ils se balancent et peuvent tomber)
  // plancher du balcon
  box(0, B, SALOON_W, 8, '#5a3a20'); R(0, B, SALOON_W, 1, '#8a5a34');
  // mur du bas en planches
  for (let x = 0; x < SALOON_W; x += 16) {
    const col = (x / 16) % 2 ? '#6a4028' : '#5e3822';
    R(x, B + 8, 16, 196 - B - 8, col);
    R(x, B + 8, 1, 196 - B - 8, '#3a2214');
  }
  R(0, 160, SALOON_W, 3, '#3a2214'); R(0, 163, SALOON_W, 33, '#4a2c18');
  // arrière-bar et étagères
  box(36, B + 10, 288, 46, '#4a2a18');
  for (const y of SAL.shelves) { box(40, y, 280, 3, '#8a5a34'); R(40, y, 280, 1, '#a8703c'); }
  for (const y of SAL.shelves) for (let x = 76; x < 300; x += 40) { box(x, y - 5, 3, 5, '#c8d8e0'); box(x + 6, y - 4, 3, 4, '#e8d8b0'); }
  // affiche « WANTED » d'El Diablo, horloge, porte de l'arrière-salle
  box(520, 112, 30, 38, '#d8c088'); R(523, 115, 24, 3, '#5a3a20'); R(527, 121, 16, 14, '#a88a5a'); R(530, 124, 10, 3, '#3a2214');
  R(524, 138, 22, 2, '#5a3a20'); R(526, 143, 18, 2, '#c0392b');
  box(700, 112, 14, 30, '#6a3a1a'); S.disc(ctx, 707, 120, 4, '#f0e0b0'); R(707, 117, 1, 3, OUT);
  drawDoor(ctx, { x: 620, y: 140, w: 34, h: 56 }, '#c8a070', '#5e3822');
  for (const px of [342, 600]) box(px, B + 8, 6, 196 - B - 8, '#4a2c18');
  // plancher
  for (let y = 196; y < H; y += 5) { R(0, y, SALOON_W, 5, y % 10 ? '#5a3a22' : '#62402a'); R(0, y, SALOON_W, 1, '#3a2214'); }
  for (let i = 0; i < 60; i++) R(rnd() * SALOON_W, 197 + rnd() * 18, 3, 1, '#4a2c18');

  const fx = front.getContext('2d');
  const F = paint(fx);
  // rambarde du balcon
  F.box(0, B - 16, SALOON_W, 3, '#8a5a34'); F.R(0, B - 16, SALOON_W, 1, '#b07a44');
  for (let x = 2; x < SALOON_W; x += 8) F.R(x, B - 13, 2, 13, '#7a4a28');
  // comptoir
  const bar = SAL.bar;
  F.box(bar.x - 4, bar.top, bar.w + 8, 5, '#a8703c'); F.R(bar.x - 4, bar.top, bar.w + 8, 1, '#d09858');
  F.box(bar.x, bar.top + 5, bar.w, 196 - bar.top - 5, '#6a3a1a');
  for (let x = bar.x + 6; x < bar.x + bar.w - 30; x += 50) { F.box(x, bar.top + 11, 40, 26, '#5a3018'); F.R(x + 1, bar.top + 12, 38, 1, '#7a4a28'); }
  F.R(bar.x, 188, bar.w, 2, '#e0b040');
  // piano
  const p = SAL.piano;
  F.box(p.x, p.top, p.w, 50, '#3a2214'); F.R(p.x - 2, p.top, p.w + 4, 4, '#5a3422');
  F.box(p.x + 4, p.top + 22, p.w - 8, 5, '#f4ecd8');
  for (let k = 6; k < p.w - 8; k += 5) F.R(p.x + k, p.top + 22, 2, 3, OUT);
  F.box(p.x + 6, p.top + 6, p.w - 12, 12, '#4a2c18');
  F.box(p.x + 10, p.top - 6, 2, 6, '#f4ecd8'); F.R(p.x + 10, p.top - 8, 2, 2, '#f8d070');
  // tables renversées
  for (const tb of SAL.tables) {
    const cx = tb.x + tb.w / 2, cy = tb.top + 18;
    F.box(tb.x + 8, tb.top - 8, 2, 10, '#5a3a20'); F.box(tb.x + tb.w - 10, tb.top - 8, 2, 10, '#5a3a20');
    S.disc(fx, cx, cy, 18, OUT); S.disc(fx, cx, cy, 17, '#7a4a24'); S.disc(fx, cx, cy, 13, '#8a5a30');
    F.R(cx - 12, cy - 4, 24, 1, '#6a3a1a'); F.R(cx - 12, cy + 4, 24, 1, '#6a3a1a');
  }
  return { bg, front };
}

// La gare : bâtiment, château d'eau, train à quai sur la voie du fond, quai en planches au premier plan.
function renderStation(seed) {
  const bg = S.makeCanvas(STATION_W, H);
  const front = S.makeCanvas(STATION_W, H);
  const ctx = bg.getContext('2d');
  const { R, box } = paint(ctx);
  const rnd = seeded(41 + (seed % 997));
  const P = STA.platform;
  // ballast, traverses et rails de la voie du fond
  R(0, 146, STATION_W, P - 146, '#8a7a6a');
  for (let i = 0; i < 900; i++) R(rnd() * STATION_W, 146 + rnd() * (P - 146), 1, 1, rnd() < 0.5 ? '#a89888' : '#6a5a4c');
  for (let x = 0; x < STATION_W; x += 9) R(x, 160, 6, 4, '#5a3a22');
  R(0, 159, STATION_W, 1, '#c8ccd0'); R(0, 163, STATION_W, 1, '#c8ccd0'); R(0, 160, STATION_W, 1, '#6a6e74');
  // le train : voitures de voyageurs (couleur tirée de la graine), wagons de marchandises, wagons à bestiaux
  const livery = [['#7a2a22', '#e0b040'], ['#2f4a3a', '#d8c088'], ['#8a6a2a', '#4a2a1a']][Math.floor(rnd() * 3)];
  const top = STA.wagonTop, base = STA.wagonBase;
  for (const wg of stationTrain(seed)) {
    const { x, w } = wg;
    const o = wagonOpenings(wg);
    if (wg.type === 'boxcar') {
      const col = '#8a3a24', dk = S.shade(col, -0.25);
      box(x, top, w, base - top, col);
      for (let k = 3; k < w; k += 5) R(x + k, top + 1, 1, base - top - 2, dk);
      // croisillons de renfort et nom de la compagnie
      for (const px of [x + 4, x + w - 34]) { R(px, top + 4, 30, 1, dk); R(px, base - 6, 30, 1, dk); for (let k = 0; k < 30; k++) R(px + k, top + 4 + Math.round((k * (base - top - 10)) / 30), 1, 1, dk); }
      R(x + 4, top + 2, w - 8, 1, S.shade(col, 0.15));
      box(x - 3, top - 4, w + 6, 4, '#3a2a24');
      for (const wn of o.wins) { box(wn.x - 1, wn.y - 1, wn.w + 2, wn.h + 2, dk); R(wn.x, wn.y, wn.w, wn.h, '#1e1410'); for (let k = 3; k < wn.w; k += 5) R(wn.x + k, wn.y, 1, wn.h, '#4a2a1a'); }
      for (const d of o.doors) {
        R(d.x - 2, d.y - 2, d.w + 4, d.h + 2, OUT); R(d.x, d.y, d.w, d.h, '#1e1410');
        R(d.x + 4, d.y + d.h - 12, 14, 12, '#a8783c'); R(d.x + 20, d.y + d.h - 8, 10, 8, '#c8b890'); // caisses et sacs dans le wagon
        box(d.x + d.w + 2, d.y - 2, 18, d.h + 2, col); for (let k = 3; k < 18; k += 5) R(d.x + d.w + 2 + k, d.y, 1, d.h - 2, dk); // porte coulissante tirée
        R(d.x - 4, d.y - 4, d.w + 28, 2, '#3a3436'); // rail de la porte
      }
    } else if (wg.type === 'cattle') {
      const col = '#a8783c', dk = '#5a3a20';
      box(x, top, w, base - top, '#1e1410');
      for (let y = top + 2; y < base - 2; y += 7) R(x, y, w, 4, col); // lattes à claire-voie
      for (let k = 0; k < w; k += 22) R(x + k, top, 3, base - top, dk);
      R(x, top, w, 2, dk); R(x, base - 3, w, 3, dk);
      box(x - 3, top - 4, w + 6, 4, '#3a2a24');
      for (const wn of o.wins) {
        R(wn.x, wn.y, wn.w, wn.h, '#1e1410');
        // un bœuf derrière les lattes
        R(wn.x + 6, wn.y + 6, 22, 12, '#8a5a34'); R(wn.x + 26, wn.y + 4, 9, 8, '#8a5a34'); R(wn.x + 32, wn.y + 6, 2, 2, OUT);
        R(wn.x + 27, wn.y + 2, 2, 2, '#f4ecd8'); R(wn.x + 33, wn.y + 2, 2, 2, '#f4ecd8');
      }
      for (const d of o.doors) { R(d.x - 2, d.y - 2, d.w + 4, d.h + 2, OUT); R(d.x, d.y, d.w, d.h, '#1e1410'); for (let y = d.y + 10; y < d.y + d.h; y += 12) R(d.x, y, d.w, 2, '#3a2a1a'); R(d.x + 6, d.y + d.h - 10, 24, 10, '#c8a040'); }
    } else {
      box(x, top, w, base - top, livery[0]);
      R(x, top + 6, w, 2, livery[1]); R(x, base - 10, w, 2, livery[1]);
      for (let k = 0; k < w; k += 6) R(x + k, top + 9, 1, base - top - 20, S.shade(livery[0], -0.12));
      // toit bombé
      box(x - 4, top - 6, w + 8, 6, '#3a2a24'); R(x - 2, top - 7, w + 4, 1, '#3a2a24'); R(x - 4, top - 6, w + 8, 1, '#5a4a40');
      for (const wn of o.wins) { box(wn.x - 1, wn.y - 1, wn.w + 2, wn.h + 2, livery[1]); R(wn.x, wn.y, wn.w, wn.h, '#1e1410'); R(wn.x, wn.y, wn.w, 3, '#140c08'); }
      for (const d of o.doors) { box(d.x, d.y, d.w, d.h, S.shade(livery[0], -0.2)); R(d.x + 3, d.y + 4, d.w - 6, 14, '#1e1410'); R(d.x + d.w - 4, d.y + 30, 2, 3, '#e0b040'); }
    }
    // châssis, roues, attelage
    R(x + 4, STA.wagonBase, w - 8, 6, '#1e1c1a');
    for (const wx of [x + 22, x + 40, x + w - 40, x + w - 22]) { S.disc(ctx, wx, 158, 6, OUT); S.disc(ctx, wx, 158, 5, '#3a3436'); S.disc(ctx, wx, 158, 2, '#8a8478'); }
    R(x + w, STA.wagonBase - 6, 16, 3, '#3a3436');
  }
  // locomotive : cabine, chaudière, cheminée, phare, chasse-bestiaux
  const L = STA.loco;
  box(L.x, 58, 56, 94, '#2a2628'); box(L.x - 4, 52, 64, 7, '#4a2a1a');
  const cab = locoCab(L);
  R(cab.x, cab.y, cab.w, cab.h, '#1e1410'); box(cab.x - 1, cab.y - 1, cab.w + 2, 1, '#e0b040');
  box(L.x + 56, 92, 112, 52, '#2a2628'); R(L.x + 56, 92, 112, 4, '#4a4648');
  for (const bx of [L.x + 80, L.x + 112, L.x + 144]) R(bx, 92, 3, 52, '#c8a040');
  box(L.x + 98, 80, 16, 12, '#c8a040'); // dôme
  box(L.x + 140, 64, 14, 28, '#2a2628'); box(L.x + 136, 58, 22, 7, '#2a2628'); // cheminée
  box(L.x + 168, 100, 12, 30, '#3a3436');
  for (let k = 0; k < 14; k++) R(L.x + 166 + k, 138 + k * 0.6, 2, 152 - (138 + k * 0.6), '#7a2a22'); // chasse-bestiaux
  for (const wx of [L.x + 74, L.x + 112]) { S.disc(ctx, wx, 150, 13, OUT); S.disc(ctx, wx, 150, 12, '#a8302a'); for (let a = 0; a < 6; a++) R(wx + Math.cos(a) * 8, 150 + Math.sin(a) * 8, 2, 2, '#5a1a14'); S.disc(ctx, wx, 150, 3, '#3a3436'); }
  R(L.x + 60, 148, 64, 2, '#c8c0b8'); // bielle
  for (const wx of [L.x + 20, L.x + 40, L.x + 150]) { S.disc(ctx, wx, 156, 7, OUT); S.disc(ctx, wx, 156, 6, '#a8302a'); S.disc(ctx, wx, 156, 2, '#3a3436'); }
  // château d'eau
  const tx = STA.tower - 22;
  for (const lx of [tx + 4, tx + 38]) box(lx, 92, 3, P - 92, '#5a3a20');
  box(tx, 54, 44, 38, '#7a5a3a'); for (let k = 0; k < 44; k += 5) R(tx + k, 54, 1, 38, '#5a3a20');
  R(tx, 62, 44, 2, '#4a4f58'); R(tx, 82, 44, 2, '#4a4f58');
  for (let k = 0; k < 12; k++) R(tx - 2 + k * 2, 54 - k, 48 - k * 4, 1, k ? '#6a3a1a' : OUT);
  box(tx + 40, 70, 18, 3, '#5a3a20'); // bec verseur
  // bâtiment de la gare : bardage, auvent, enseigne, horloge
  const B = STA.building;
  box(B.x, B.top, B.w, P - B.top, '#b08a5a');
  for (let x = B.x + 3; x < B.x + B.w; x += 6) R(x, B.top + 1, 1, P - B.top - 1, '#9a744a');
  for (let k = 0; k < 10; k++) R(B.x - 8 + k * 2, B.top - 10 + k, B.w + 16 - k * 4, 1, k ? '#6a3a2a' : OUT); // toit
  box(B.x - 10, 100, B.w + 20, 6, '#6a3a2a'); // auvent sur le quai
  for (const px of [B.x - 6, B.x + B.w / 2, B.x + B.w + 4]) box(px, 106, 3, P - 106, '#5a3a20');
  box(B.x + 88, B.top + 30, 124, 12, '#e8d4a0');
  for (const wn of B.windows) drawWindow(ctx, wn, '#e8d4a0', rnd);
  drawDoor(ctx, B.door, '#e8d4a0', '#7a4a24');
  box(B.x + 100, 132, 40, 6, '#7a4a24'); for (const lx of [B.x + 103, B.x + 133]) R(lx, 138, 2, 10, '#5a3a20'); // banc
  // quai en planches
  R(0, P, STATION_W, H - P, '#9a7448');
  for (let y = P; y < H; y += 6) R(0, y, STATION_W, 1, '#6a4a2a');
  for (let x = 0; x < STATION_W; x += 23) R(x + ((x / 23) % 2) * 9, P + 1, 1, H - P, '#7a5a34');
  R(0, P, STATION_W, 2, '#e0c060'); // bande de sécurité
  // premier plan : caisses, chariot à bagages, sacs postaux, tonneaux
  const fx = front.getContext('2d');
  const F = paint(fx);
  for (const c of STA.covers) {
    const [w, h] = STA_COVER[c.kind];
    const top = PROP_BASE - h;
    if (c.kind === 'crates' || c.kind === 'barrels') drawProp(fx, { x: c.x, kind: c.kind });
    else if (c.kind === 'cart') {
      F.box(c.x, top + 14, w, 4, '#5a3a20');
      for (const wx of [c.x + 8, c.x + w - 8]) { S.disc(fx, wx, PROP_BASE - 3, 4, OUT); S.disc(fx, wx, PROP_BASE - 3, 3, '#3a3436'); }
      F.box(c.x + 2, top + 4, 22, 10, '#8a4a2a'); F.box(c.x + 26, top, 22, 14, '#4a5a6a'); F.R(c.x + 30, top + 2, 14, 1, '#e0b040');
      F.box(c.x + 8, top - 4, 12, 8, '#a8783c');
    } else if (c.kind === 'bags') {
      for (const [bx, bw] of [[0, 18], [14, 16], [26, 14]]) { F.box(c.x + bx, top + 2, bw, h - 2, '#c8b890'); F.R(c.x + bx + 3, top + 6, bw - 6, 1, '#8a7a5a'); F.R(c.x + bx + bw / 2 - 1, top, 3, 3, '#8a7a5a'); }
    }
  }
  return { bg, front };
}

// Panoramas : le ciel dépend de l'ambiance, la rue de la graine. On garde le dernier de chaque.
const CACHE = { sky: null, skyKey: null, street: null, streetKey: null, saloon: null, station: null, stationKey: null, edge: null, edgeKey: null };
function stationPano(seed) {
  if (CACHE.stationKey !== seed) { CACHE.station = renderStation(seed); CACHE.stationKey = seed; }
  return CACHE.station;
}
function edgePano(E) {
  if (CACHE.edgeKey !== E) { CACHE.edge = renderEdge(E); CACHE.edgeKey = E; }
  return CACHE.edge;
}
function backdrop(env) {
  if (CACHE.skyKey !== env.id) {
    const c = S.makeCanvas(700, H);
    S.drawDesert(c.getContext('2d'), 0, 0, 700, H, desertOpts(env, { sunX: 0.3, sunY: 0.2 }));
    CACHE.sky = c;
    CACHE.skyKey = env.id;
  }
  return CACHE.sky;
}
function streetPano(L) {
  if (CACHE.streetKey !== L) { CACHE.street = renderStreet(L); CACHE.streetKey = L; }
  return CACHE.street;
}
const saloonPano = () => (CACHE.saloon ||= renderSaloonRoom());

// Vue de la grand-rue depuis la position camX : le ciel est dessiné sur ctx, la rue sur le calque
// de l'ambiance, renvoyé pour la suite du décor (à refermer avec amb.end).
export function drawStreet(ctx, camX, L, amb, now) {
  const cx = Math.round(camX);
  ctx.drawImage(backdrop(amb.env), -Math.round(camX * 0.12), 0);
  amb.sky(ctx, now);
  const w = amb.begin(ctx);
  w.drawImage(streetPano(L).bg, -cx, 0);
  for (const b of L.buildings) {
    if (!b.sign) continue;
    const sr = signRect(b, facade(b));
    if (sr.x + sr.w < cx || sr.x > cx + W) continue;
    canvasText(w, b.sign, sr.x + sr.w / 2 - cx, sr.y + 2, { size: 8, color: '#3a2214', shadow: '#c8b07c' });
  }
  if (cx < 320) canvasText(w, 'DUSTY GULCH', 226 - cx, 117, { size: 8, color: '#3a2214', shadow: '#b89a60' });
  return w;
}

// La nuit (ou sous l'orage), une partie des fenêtres sont éclairées et les lanternes brillent.
export function streetLights(ctx, camX, L, amb) {
  if (!amb.env.lights) return;
  const cx = Math.round(camX);
  for (const b of L.buildings) {
    if (b.x - cx > W || b.x + b.w - cx < 0) continue;
    const f = facade(b);
    f.windows.forEach((wn, k) => { if (hash(b.x * 7 + k) < 0.6) amb.window(ctx, wn.x - cx, wn.y, wn.w, wn.h); });
    if (b.steeple) { const r = belfry(b); amb.glow(ctx, r.x + r.w / 2 - cx, r.y + 8, 14); }
    if (b.kind === 'saloon') {
      const d = f.door;
      for (const lx of [d.x - 8, d.x + d.w + 8]) amb.glow(ctx, lx - cx, 121, 26);
      amb.glow(ctx, d.x + d.w / 2 - cx, d.y + d.h / 2, 26);
    }
    if (b.kind === 'smithy') amb.glow(ctx, f.door.x + f.door.w - 12 - cx, f.door.y + 38, 22, '255,120,40');
    if (b.kind === 'theater') amb.glow(ctx, b.x + b.w / 2 - cx, 92, 40, '255,220,120');
  }
}

function drawBottle(ctx, x, base, look, k) {
  const { R, box } = paint(ctx);
  const col = BOTTLES[look % BOTTLES.length];
  const h = Math.round(15 * k);
  if (h < 2) return;
  const y = base - h;
  box(x - 3, y + Math.round(5 * k), 6, h - Math.round(5 * k), col);
  box(x - 1, y, 2, Math.round(5 * k), col);
  R(x - 2, y + Math.round(6 * k), 1, Math.max(1, h - Math.round(8 * k)), S.shade(col, 0.4));
  if (k > 0.8) R(x - 3, base - 7, 6, 3, '#e8d8b0');
}

// Symbole du contenu d'un bonus (8×7), coin haut-gauche en (x, y)
function bonusIcon(R, x, y, bonus) {
  R(x, y, 8, 7, '#e8d4a0');
  if (bonus === 'gatling' || bonus === 'rusty') {
    const c = bonus === 'rusty' ? '#9a5a30' : '#4a4f58';
    R(x + 1, y + 2, 4, 3, c); R(x + 5, y + 2, 3, 1, c); R(x + 5, y + 4, 3, 1, c);
    if (bonus === 'rusty') R(x + 2, y + 3, 1, 1, '#c87a3a');
  } else if (bonus === 'winchester') {
    R(x + 1, y + 4, 3, 2, '#7a4a24'); R(x + 3, y + 3, 2, 2, '#c8a040'); R(x + 4, y + 2, 4, 1, '#4a4f58'); R(x + 5, y + 5, 1, 1, '#4a4f58');
  } else if (bonus === 'akimbo') {
    R(x + 1, y + 1, 3, 1, '#4a4f58'); R(x + 1, y + 2, 1, 2, '#7a4a24');
    R(x + 4, y + 4, 3, 1, '#4a4f58'); R(x + 6, y + 5, 1, 2, '#7a4a24');
  }
  else if (bonus === 'dynamite') { R(x + 3, y + 2, 3, 5, '#c0392b'); R(x + 4, y + 1, 1, 1, '#5a3a20'); R(x + 5, y, 1, 1, '#f8d070'); }
  else if (bonus === 'sand') { R(x + 2, y + 1, 4, 5, '#c8a870'); R(x + 3, y, 2, 1, '#7a4a24'); R(x + 1, y + 6, 6, 1, '#e0c088'); }
  else { R(x + 3, y + 1, 2, 5, '#e0b040'); R(x + 1, y + 3, 6, 2, '#e0b040'); R(x + 2, y + 5, 1, 1, '#e0b040'); R(x + 5, y + 5, 1, 1, '#e0b040'); }
}

// Caisse bonus (symbole du contenu dessus) ou sac de sable
function drawCrate(ctx, x, base, bonus, k, now) {
  const { R, box } = paint(ctx);
  const h = Math.round(13 * k);
  if (h < 2) return;
  const y = base - h;
  if (bonus === 'sand') {
    box(x - 6, y + 2, 12, h - 2, '#c8a870');
    R(x - 7, y + 4, 1, Math.max(1, h - 6), OUT); R(x + 6, y + 4, 1, Math.max(1, h - 6), OUT);
    R(x - 6, y + 4, 2, Math.max(1, h - 5), '#a8884a');
    if (k > 0.8) {
      box(x - 2, y - 1, 4, 3, '#c8a870'); R(x - 3, y + 2, 6, 1, '#7a4a24');
      R(x - 3, y + 6, 6, 1, '#8a6a3a'); R(x - 2, y + 8, 4, 1, '#8a6a3a');
      R(x + 7, base - 2, 3, 1, '#e0c088'); R(x + 9, base - 1, 2, 1, '#e0c088');
    }
  } else {
    box(x - 8, y, 16, h, '#a8783c');
    R(x - 7, y + 1, 14, 1, '#c8984c'); R(x - 8, y + Math.round(h / 2), 16, 1, '#7a5428');
    if (k > 0.8) bonusIcon(R, x - 4, y + 3, bonus);
  }
  // halo doré qui tourne autour pour attirer l'œil
  if (k > 0.8) {
    ring(ctx, x, base - 7, 13, 11, Math.floor(now / 200) % 2 ? '#f8d070' : '#fff6c0', 2, now / 70);
    const a = now / 160;
    ctx.fillStyle = '#fffbe8';
    ctx.fillRect(Math.round(x + Math.cos(a) * 15), Math.round(base - 7 + Math.sin(a) * 13), 1, 1);
  }
}

// Sac de butin au-dessus d'un porteur : le bonus revient à celui qui l'abat
function drawLoot(ctx, x, y, bonus, now) {
  const { R, box } = paint(ctx);
  const bob = Math.round(Math.sin(now / 160) * 2);
  y += bob;
  R(x - 1, y + 12, 3, 3, OUT); R(x, y + 13, 1, 3, '#f8d070'); // petite flèche vers le porteur
  box(x - 7, y, 14, 11, '#c8a060');
  R(x - 4, y - 2, 8, 2, OUT); R(x - 3, y - 1, 6, 1, '#7a4a24');
  bonusIcon(R, x - 4, y + 2, bonus);
  if (Math.floor(now / 180) % 2) { R(x - 10, y - 2, 1, 1, '#fffbe8'); R(x + 9, y + 9, 1, 1, '#fffbe8'); }
  else { R(x + 10, y - 1, 1, 1, '#fffbe8'); R(x - 9, y + 10, 1, 1, '#fffbe8'); }
}

// El Diablo : personnage + cartouchière et deux revolvers, puis silhouette rouge pour son aura.
const bossCache = new Map();
function bossSprite(flash, blink, t) {
  const frame = Math.floor(t / 300) % 4;
  const key = `${flash}${blink}${frame}`;
  let c = bossCache.get(key);
  if (c) return c;
  const base = S.characterSprite(BOSS, { blink, t, tint: flash ? 'rgba(255,60,40,0.6)' : null });
  const img = S.makeCanvas(base.width, base.height);
  const x = img.getContext('2d');
  x.drawImage(base, 0, 0);
  const R = (a, b, w, h, col) => { x.fillStyle = col; x.fillRect(a, b, w, h); };
  for (let k = 0; k < 10; k++) { R(13 + k * 2, 35 + k * 2, 3, 2, OUT); if (k % 2) R(14 + k * 2, 35 + k * 2, 1, 2, '#e0b040'); }
  for (const dir of [1, -1]) {
    const gx = dir > 0 ? 28 : 20 - 10;
    R(gx, 40, 8, 7, OUT); R(gx + 1, 41, 6, 5, SKIN[BOSS.skin]);
    R(gx + (dir > 0 ? 1 : -1), 34, 9, 9, OUT); R(gx + (dir > 0 ? 2 : 0), 35, 7, 7, '#4a4f58'); R(gx + (dir > 0 ? 3 : 1), 36, 5, 5, '#c8a040'); R(gx + (dir > 0 ? 4 : 2), 37, 3, 3, OUT);
  }
  const sil = S.makeCanvas(base.width, base.height);
  const sx = sil.getContext('2d');
  sx.drawImage(img, 0, 0);
  sx.globalCompositeOperation = 'source-in';
  sx.fillStyle = '#ff3020';
  sx.fillRect(0, 0, sil.width, sil.height);
  c = { img, sil };
  if (bossCache.size > 40) bossCache.clear();
  bossCache.set(key, c);
  return c;
}

// ------------------------------------------------------------ scène
export class ShooterScene extends MiniScene {
  constructor(canvas, hooks) {
    super(canvas, hooks);
    this.kind = 'shooter';
    this.showEnv = true;
    this.cv.style.cursor = 'none';
    this.world = null;
    this.ammo = AMMO;
    this.reloadUntil = 0;
    this.red = 0;
  }

  title() { return 'FUSILLADE À DUSTY GULCH'; }
  variantName() { return this.world?.layout.edge.name; }
  help() {
    return [
      this.touch ? 'TOUCHE L\'ÉCRAN : TIRER À CET ENDROIT' : 'SOURIS : VISER - CLIC : TIRER',
      this.touch ? 'BOUTON RECHARGER' : 'CLIC DROIT, R OU ESPACE : RECHARGER',
      'BANDIT +100 - TOIT OU CAVALIER +150 - BOUTEILLE +50',
      'MAINS EN L\'AIR = CIVIL : -100 - TOUCHÉ : -50',
      'BONUS : CAISSES DU PROSPECTEUR, SACS DES BANDITS',
      'DYNAMITE EN VOL : ABATS-LA +75, SINON TOUS -75',
      this.touch ? 'GARE AUX EMBUSCADES - BOUTON PARIER : EL DIABLO' : 'GARE AUX EMBUSCADES - TOUCHE B : PARI SUR EL DIABLO',
    ];
  }

  // rattrapage du dernier : barillet plus grand, rechargement plus rapide
  get behind() {
    const ps = this.state?.players;
    if (!ps || ps.length < 2) return false;
    const alive = ps.filter((p) => !p.left);
    const mine = ps[this.me].score, best = Math.max(...alive.map((p) => p.score)), worst = Math.min(...alive.map((p) => p.score));
    return mine === worst && best - mine >= BEHIND;
  }
  get cap() { return this.behind ? AMMO_BACK : AMMO; }
  goText() { return 'DÉGAINEZ !'; }

  setup(seed) {
    this.world = shooterWorld(seed, this.n, this.state.variant);
    this.deco = new Deco(this.world, seed);
    this.spots = this.world.spots;
    this.boss = this.world.targets.find((tg) => tg.kind === 'boss');
    this.dead = new Map(); // id -> { by, at }
    this.hp = new Map();
    this.fireFx = [];
    this.holes = [];
    this.ammo = AMMO;
    this.reloadUntil = 0;
    this.shots = 0;
    this.kills = 0;
    this.bossFlash = -1e9;
    this.aims = new Map(); // `${cible}:${tir}` -> joueur visé (annoncé par l'hôte)
    this.seenEvents = new Set();
    this.wagered = false;
    this.lightFlash = -1e9; // éclair d'un coup de feu pendant la panne de lumière
    this.power = null; // bonus actif : une arme (BONUSES[...].gun) ou shield
    this.powerUntil = 0;
    this.powerMs = BONUS_MS;
    this.gunAmmo = 0;
    this.gunAt = -1e9; // dernier tir de l'arme (recul, éclair)
    this.sandUntil = -1e9;
    this.firing = false;
    this.nextShot = 0;
    this.powers = {}; // bonus des autres joueurs (pour l'affichage)
    this.booms = [];
    this.feed = []; // qui a ramassé quel bonus
    this.cues = new Set();
    this.remote = {};
    for (let i = 0; i < this.n; i++) if (i !== this.me) this.remote[i] = { x: W / 2, y: H / 2, tx: W / 2, ty: H / 2, shot: -1e9 };
  }

  applySync(st) {
    for (const [id, by] of st.claimed || []) this.dead.set(id, { by, at: -1e9 });
    for (const [id, hp] of st.hp || []) this.hp.set(id, hp);
  }

  // ---------------------------------------------------------- géométrie à l'écran
  rise(tg, t) {
    const d = this.dead.get(tg.id);
    if (d) return clamp01(1 - (t - d.at) / 260);
    return Math.min(clamp01((t - tg.t0) / 180), clamp01((tg.t1 - t) / 180));
  }

  bossRage() { return (this.hp.get(this.boss.id) ?? this.boss.hp) <= this.boss.hp / 2; }

  // haut de la silhouette d'El Diablo (il se relève de derrière la rambarde)
  bossTop(t) {
    const h = Math.round(56 * BOSS_SCALE);
    return SAL.balcony - h + Math.round((1 - clamp01((t - this.boss.t0) / 500)) * h);
  }

  hitRect(tg, cx, k) {
    if (tg.arc) {
      const p = crateAt(tg, this.t);
      return { x: p.x - 9, y: p.y - 8, w: 18, h: 16 };
    }
    if (tg.ride) {
      const x = rideX(tg, this.t) - cx;
      return { x: x - 30, y: tg.ride.y - 70, w: 62, h: 56 };
    }
    const s = this.spots[tg.spot];
    const sx = s.cx - cx;
    if (tg.kind === 'boss') {
      const bx = bossX(this.t) - cx, top = this.bossTop(this.t);
      return { x: bx - 20, y: top + 6, w: 40, h: Math.max(0, SAL.balcony - top - 10) };
    }
    if (tg.kind === 'bottle') return { x: sx - 4, y: s.base - 16, w: 8, h: 16 };
    if (tg.kind === 'crate') return { x: sx - 9, y: s.base - 15, w: 18, h: 15 };
    const y = s.base - 56 + (1 - k) * 56;
    const fig = { x: sx - 14, y: y + 6, w: 28, h: 50 };
    const clip = { x: s.x - cx, y: s.y, w: s.w, h: s.h };
    const x0 = Math.max(fig.x, clip.x), y0 = Math.max(fig.y, clip.y);
    const x1 = Math.min(fig.x + fig.w, clip.x + clip.w), y1 = Math.min(fig.y + fig.h, clip.y + clip.h);
    return x1 > x0 && y1 > y0 ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null;
  }

  visible(t, cam) {
    return this.world.targets.filter((tg) => {
      if (targetSec(tg) !== cam.sec || t < tg.t0) return false;
      if (this.defused(tg)) return false;
      const d = this.dead.get(tg.id);
      if (d && tg.ride) return t <= tg.t1 + 200; // le cheval s'enfuit sans son cavalier
      if (d) return t - d.at < (tg.kind === 'boss' ? 1600 : 600);
      return t <= tg.t1 + 200;
    });
  }

  // bâton de dynamite jamais lancé : son lanceur a été abattu avant
  defused(tg) {
    if (tg.kind !== 'tnt' || tg.from == null) return false;
    const d = this.dead.get(tg.from);
    return !!d && d.at < tg.t0;
  }

  // ---------------------------------------------------------- entrées
  onMove(m) {
    if (this.t0 != null) this.sendLive({ c: [Math.round(m.x), Math.round(m.y)] });
  }

  onAlt() { this.reload(); }
  onKey(k) {
    if (k === 'r' || k === ' ') this.reload();
    // pari sur El Diablo, pendant les 6 s qui suivent son arrivée
    if (k === 'b' && this.canWager()) {
      this.wagered = true;
      this.hooks.send({ kind: 'wager' });
    }
  }

  canWager() { return this.playing && !this.wagered && shooterEventAt(this.world.events || [], 'wager', this.t); }

  reload() {
    if (!this.playing || this.ammo >= this.cap || this.reloadUntil || this.gun) return;
    this.reloadUntil = this.t + (this.behind ? RELOAD_BACK : RELOAD);
    sfx('reload');
  }

  // arme ramassée (mitrailleuse, vieille Gatling, Winchester, deux colts) : tant qu'il reste du temps et des balles
  get gun() {
    const g = BONUSES[this.power]?.gun;
    return g && this.t < this.powerUntil && this.gunAmmo > 0 ? g : null;
  }
  get shielded() { return this.power === 'shield' && this.t < this.powerUntil; }

  onFire(m) {
    if (!this.playing) return;
    const gun = this.gun;
    if (gun) {
      // armes automatiques : on garde le bouton enfoncé ; les deux colts tirent à chaque clic
      if (gun.auto) this.firing = true;
      if (this.t >= this.nextShot) this.fireGun(m, gun);
      return;
    }
    if (this.reloadUntil) { sfx('dry'); return; }
    if (this.ammo <= 0) { sfx('dry'); this.reload(); return; }
    this.ammo--;
    this.shoot(m);
  }

  onRelease() { this.firing = false; }

  fireGun(m, gun) {
    this.nextShot = this.t + gun.rate;
    this.gunAt = this.now;
    if (gun.dual) {
      this.shoot({ x: m.x - 5, y: m.y }, gun);
      this.shoot({ x: m.x + 5, y: m.y }, gun, true);
    } else this.shoot(m, gun);
    if (!gun.mag) return;
    this.gunAmmo -= gun.dual ? 2 : 1;
    if (this.gunAmmo > 0) return;
    // chargeur vide : retour au revolver
    this.power = null;
    this.firing = false;
    this.banner = { text: 'PLUS DE BALLES : RETOUR AU REVOLVER', col: '#f0a070', at: this.t };
    sfx('dry', 0.15);
  }

  shoot(at, gun = null, quiet = false) {
    const t = this.t;
    const sp = gun?.spread || 0;
    const m = sp ? { x: at.x + (Math.random() - 0.5) * sp, y: at.y + (Math.random() - 0.5) * sp } : at;
    this.shots++;
    if (!quiet) sfx(gun ? gun.sfx : 'revolver');
    this.lightFlash = this.now;
    this.shake = gun?.auto ? (gun.sfx === 'rifle' ? 2.5 : 1.2) : 2;
    this.sendLive({ c: [Math.round(at.x), Math.round(at.y)], s: 1 }, !gun?.auto);
    const cam = camAt(t);
    let hit = null;
    for (const tg of this.visible(t, cam)) {
      if (this.dead.has(tg.id)) continue;
      const k = this.rise(tg, t);
      if (k < 0.35) continue;
      const r = this.hitRect(tg, cam.x, k);
      if (r && m.x >= r.x - 1 && m.x <= r.x + r.w + 1 && m.y >= r.y - 1 && m.y <= r.y + r.h + 1) hit = tg;
    }
    if (hit) {
      if (hit.kind === 'boss') this.bossFlash = t;
      else this.dead.set(hit.id, { by: this.me, at: t, local: true });
      if (hit.kind === 'bottle') { sfx('glass'); this.shards(m.x, m.y, BOTTLES[hit.look % BOTTLES.length]); }
      else if (hit.kind === 'crate') { sfx('crate'); this.shards(m.x, m.y, hit.bonus === 'sand' ? '#d8c088' : '#a8783c'); }
      else if (hit.kind === 'tnt') { sfx('boom'); this.explode(m.x, m.y); }
      else this.puff(m.x, m.y, '#c0392b', 5);
      this.hooks.send({ kind: 'hit', id: hit.id });
      this.deco.scare(cam.sec, m.x + cam.x, m.y);
    } else if (!this.deco.shoot(cam.sec, m.x + cam.x, m.y, t)) {
      // rien de cassable : un impact dans le mur
      this.holes.push({ wx: m.x + cam.x, y: m.y, sec: cam.sec });
      if (this.holes.length > 40) this.holes.shift();
      this.puff(m.x, m.y, '#d8c8a8', 4);
    }
  }

  remoteLive(i, d) {
    const r = this.remote[i];
    if (!r || !Array.isArray(d.c)) return;
    r.tx = d.c[0];
    r.ty = d.c[1];
    if (d.s) {
      r.shot = this.t;
      sfx('far');
      // les balles des autres cassent aussi le décor et font fuir les bêtes
      const cam = camAt(Math.max(0, this.t));
      if (this.deco) this.deco.shoot(cam.sec, d.c[0] + cam.x, d.c[1], this.t);
    }
  }

  // ---------------------------------------------------------- événements de l'hôte
  targetScreen(tg, t) {
    if (tg.arc) return crateAt(tg, t);
    const cam = camAt(t);
    if (tg.ride) return { x: rideX(tg, t) - cam.x, y: tg.ride.y - 68 };
    const s = this.spots[tg.spot];
    if (tg.kind === 'boss') return { x: bossX(t) - cam.x, y: this.bossTop(t) + 10 };
    return { x: s.cx - cam.x, y: s.kind === 'bottle' ? s.base - 22 : Math.max(s.y + 4, s.base - 50) };
  }

  onEvent(ev) {
    const t = this.t;
    if (ev.type === 'hit') {
      const tg = this.world.targets[ev.id];
      const p = this.targetScreen(tg, t);
      if (tg.kind === 'boss') {
        this.hp.set(ev.id, ev.hp);
        this.bossFlash = t;
      }
      if (ev.kill) {
        const d = this.dead.get(ev.id);
        this.dead.set(ev.id, { by: ev.by, at: d ? d.at : t });
        if (ev.by === this.me && tg.kind !== 'civil' && tg.kind !== 'supply') this.kills++;
      }
      const big = tg.kind === 'boss' && ev.kill;
      this.popup(p.x, p.y, `${ev.pts > 0 ? '+' : ''}${ev.pts}`, ev.pts < 0 ? '#f0705a' : this.color(ev.by), big || ev.by === this.me);
      if (ev.by === this.me) sfx(ev.pts < 0 ? 'bad' : big ? 'victory' : 'coin');
      if (big) { this.banner = { text: 'EL DIABLO EST TOMBÉ !', col: '#f8d070', at: t }; this.shake = 8; this.whiteUntil = this.now + 120; }
      if (tg.kind === 'civil' && ev.by === this.me) this.popup(p.x, p.y - 12, 'UN CIVIL !', '#f0705a');
      if (tg.kind === 'supply' && ev.by === this.me) this.popup(p.x, p.y - 12, 'LE PROSPECTEUR !', '#f0705a');
      if (ev.boom) this.explode(p.x, p.y + 20);
      if (tg.kind === 'tnt' && ev.by !== this.me) { sfx('boom'); this.explode(p.x, p.y); }
      // lanceur abattu à temps : sa dynamite ne part pas
      if (ev.defused) for (const d of this.world.targets) if (d.kind === 'tnt' && d.from === ev.id) this.dead.set(d.id, { by: -1, at: -1e9 });
      if (ev.bonus) {
        if (tg.loot && !ev.boom) { this.shards(p.x, p.y, '#e0b040'); sfx('crate'); }
        this.gotBonus(ev.bonus, ev.by, p);
      }
    } else if (ev.type === 'fire' && ev.blocked) {
      const tg = this.world.targets[ev.id];
      if (!this.dead.has(ev.id)) this.fireFx.push({ id: ev.id, at: t });
      if (ev.victim === this.me) {
        sfx('clank');
        this.popup(W / 2, 150, 'PROTÉGÉ !', '#f8d070', true);
      } else {
        const p = this.targetScreen(tg, t);
        this.popup(p.x, p.y, 'BLOQUÉ', this.color(ev.victim));
      }
    } else if (ev.type === 'tntBoom') {
      // la dynamite a touché le sol : tout le monde encaisse (sauf les protégés)
      const tg = this.world.targets[ev.id];
      this.dead.set(ev.id, { by: -1, at: t });
      const p = crateAt(tg, tg.t1);
      this.explode(p.x, Math.min(p.y, H - 12));
      sfx('boom');
      this.shake = 9;
      this.whiteUntil = this.now + 80;
      for (const [j, pts] of ev.hurt) {
        if (j === this.me) {
          if (pts < 0) { this.red = 0.75; sfx('hurt'); }
          this.popup(W / 2, 150, pts < 0 ? `${pts}` : 'PROTÉGÉ !', pts < 0 ? '#f0705a' : '#f8d070', true);
        } else if (pts) {
          const r = this.remote[j];
          if (r) this.popup(r.x, r.y - 10, `${pts}`, this.color(j));
        }
      }
    } else if (ev.type === 'aim') {
      this.aims.set(`${ev.id}:${ev.k}`, ev.victim);
    } else if (ev.type === 'wager') {
      const mine = ev.by === this.me;
      if (mine) this.wagered = true;
      sfx('coin');
      this.popup(mine ? W / 2 : this.remote[ev.by]?.x ?? W / 2, mine ? 130 : (this.remote[ev.by]?.y ?? 100) - 12, mine ? `TU MISES ${ev.stake} $` : `${this.name(ev.by).toUpperCase()} MISE`, this.color(ev.by), mine);
    } else if (ev.type === 'wagerEnd') {
      const mine = ev.results.find(([j]) => j === this.me);
      if (ev.killer >= 0 && ev.results.some(([j]) => j === ev.killer)) {
        this.banner = { text: `${ev.killer === this.me ? 'TU EMPOCHES' : `${this.name(ev.killer).toUpperCase()} EMPOCHE`} ${WAGER.prize} $ !`, col: '#f8d070', at: t };
      }
      if (mine) {
        sfx(mine[1] > 0 ? 'victory' : 'bad');
        this.popup(W / 2, 150, `${mine[1] > 0 ? '+' : ''}${mine[1]}`, mine[1] > 0 ? '#f8d070' : '#f0705a', true);
      }
    } else if (ev.type === 'fire') {
      if (!this.dead.has(ev.id)) this.fireFx.push({ id: ev.id, at: t });
      this.lightFlash = this.now;
      if (ev.victim === this.me) {
        this.red = 0.75;
        this.shake = 8;
        sfx('revolver');
        sfx('hurt');
        this.popup(W / 2, 150, `${ev.pts}`, '#f0705a', true);
      } else {
        sfx('far');
        const r = this.remote[ev.victim];
        if (r) this.popup(r.x, r.y - 10, `${ev.pts}`, this.color(ev.victim));
      }
    } else if (ev.type === 'left') {
      const r = this.remote[ev.who];
      if (r) r.left = true;
    }
  }

  gotBonus(bonus, by, p) {
    const t = this.t;
    const name = BONUSES[bonus]?.name || bonus;
    const mine = by === this.me;
    this.popup(p.x, p.y - 12, name, this.color(by), mine);
    this.feed.push({ by, bonus, at: t });
    if (this.feed.length > 3) this.feed.shift();
    const gun = BONUSES[bonus]?.gun;
    if (gun || bonus === 'shield') {
      const ms = gun ? gun.ms : BONUS_MS;
      if (mine) {
        this.power = bonus;
        this.powerUntil = t + ms;
        this.powerMs = ms;
        this.gunAmmo = gun ? gun.mag || Infinity : 0;
        this.nextShot = 0;
        this.reloadUntil = 0;
        this.ammo = this.cap;
        sfx(bonus === 'gatling' ? 'yeehaw' : 'power'); // la mitrailleuse : rafale et cri de Corsi
        this.banner = { text: GUN_TXT[bonus] || 'ÉTOILE DU SHÉRIF : PROTÉGÉ !', col: '#f8d070', at: t };
      } else this.powers[by] = { kind: bonus, until: t + ms };
    } else if (bonus === 'dynamite') {
      sfx('boom');
      this.shake = mine ? 10 : 6;
      this.whiteUntil = this.now + 90;
      this.banner = { text: mine ? 'DYNAMITE !' : `DYNAMITE DE ${this.name(by).toUpperCase()} !`, col: '#f0705a', at: t };
    } else if (bonus === 'sand') {
      sfx('sand');
      if (mine) this.banner = { text: 'TEMPÊTE DE SABLE ENVOYÉE !', col: '#f8d070', at: t };
      else {
        this.sandUntil = t + SAND_MS;
        this.banner = { text: 'TEMPÊTE DE SABLE !', col: '#f0a070', at: t };
      }
    }
  }

  explode(x, y) {
    this.booms.push({ x, y, at: this.t });
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * Math.PI * 2, v = 0.04 + Math.random() * 0.12;
      this.parts.push({ type: 'dot', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 0.05, g: 0.0003, col: i % 3 ? '#f87818' : '#fff070', t: 0, max: 500 + Math.random() * 300 });
    }
  }

  // ---------------------------------------------------------- effets
  puff(x, y, col, n) {
    for (let i = 0; i < n; i++) this.parts.push({ type: 'dot', x, y, vx: (Math.random() - 0.5) * 0.12, vy: -Math.random() * 0.1, g: 0.0004, col, t: 0, max: 300 + Math.random() * 200 });
  }

  shards(x, y, col) {
    for (let i = 0; i < 10; i++) this.parts.push({ type: 'dot', x, y, vx: (Math.random() - 0.5) * 0.2, vy: -Math.random() * 0.15, g: 0.0008, col: i % 3 ? col : '#f4ecd8', t: 0, max: 500 });
  }

  cue(name, at, fn) {
    if (this.t >= at && !this.cues.has(name)) { this.cues.add(name); if (this.t < at + 1500) fn(); }
  }

  update(dt) {
    if (!this.world) return;
    const t = this.t;
    this.deco.update(dt, this.now);
    if (this.reloadUntil && t >= this.reloadUntil) { this.reloadUntil = 0; this.ammo = this.cap; }
    // les annonces d'événements (embuscade, prime, panne, pari) arrivent toutes seules, au bon moment
    for (const e of this.world.events || []) {
      const at = e.t0 + (e.id === 'wager' ? WAGER.banner : 0); // le pari s'annonce après l'arrivée d'El Diablo
      if (t >= at && !this.seenEvents.has(e.id)) {
        this.seenEvents.add(e.id);
        if (t < at + 1500) {
          this.banner = { text: EVENT_TXT[e.id][0], col: EVENT_TXT[e.id][1], at: t };
          sfx(EVENT_SFX[e.id] || 'power');
          if (e.id === 'wager') this.popup(W / 2, 112, `MISE ${WAGER.stake} $ - CELUI QUI L'ABAT : ${WAGER.prize} $`, '#fdf6e0');
        }
      }
    }
    if (this.firing) {
      const gun = this.gun;
      if (!gun || !gun.auto || !this.playing) this.firing = false;
      else if (t >= this.nextShot) this.fireGun(this.mouse, gun);
    }
    // entrée d'El Diablo : cœur qui bat, puis il surgit dans un coup de tonnerre
    this.cue('bossBeat', BOSS_T0 - 1600, () => sfx('heartbeat'));
    this.cue('bossBeat2', BOSS_T0 - 800, () => sfx('heartbeat'));
    this.cue('bossIn', BOSS_T0, () => { sfx('thunder'); sfx('bad'); this.shake = 9; });
    // le ravitailleur lance sa caisse
    for (const tg of this.world.targets) {
      if (tg.kind !== 'supply' || this.dead.has(tg.id)) continue;
      this.cue(`sup${tg.id}`, tg.throwAt ?? 1e9, () => {
        const p = this.targetScreen(tg, t);
        this.popup(p.x, p.y - 18, 'ATTRAPEZ !', '#b8e070');
        sfx('whip');
      });
    }
    for (const tg of this.world.targets) {
      if (tg.throwAt && tg.kind === 'bandit' && !this.dead.has(tg.id)) this.cue(`tnt${tg.id}`, tg.throwAt, () => sfx('whip'));
    }
    this.booms = this.booms.filter((b) => t - b.at < 500);
    for (const r of Object.values(this.remote)) {
      const k = Math.min(1, dt * 0.015);
      r.x += (r.tx - r.x) * k;
      r.y += (r.ty - r.y) * k;
    }
    this.red = Math.max(0, this.red - dt * 0.0015);
    for (const p of this.parts) { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += (p.g || 0) * dt; }
    this.parts = this.parts.filter((p) => p.t < p.max);
    this.fireFx = this.fireFx.filter((f) => t - f.at < 160);
  }

  // ---------------------------------------------------------- rendu
  render(ctx) {
    if (!this.world) return;
    const t = Math.max(0, Math.min(this.t, this.duration));
    const cam = camAt(t);
    const cx = Math.round(cam.x);
    const amb = this.amb, now = this.now;
    const outdoor = cam.sec !== 'saloon';
    const L = this.world.layout;
    const pano = cam.sec === 'street' ? streetPano(L) : cam.sec === 'station' ? stationPano(L.seed) : cam.sec === 'edge' ? edgePano(L.edge) : saloonPano();
    // décor teinté par l'ambiance : façades, silhouettes, abris, bouteilles
    let w;
    if (cam.sec === 'street') w = drawStreet(ctx, cam.x, this.world.layout, amb, now);
    else if (cam.sec === 'station') {
      ctx.drawImage(backdrop(amb.env), -Math.round(cam.x * 0.12) - 120, 0);
      amb.sky(ctx, now);
      w = amb.begin(ctx);
      w.drawImage(pano.bg, -cx, 0);
      canvasText(w, 'GARE DE DUSTY GULCH', STA.building.x + 150 - cx, STA.building.top + 33, { size: 8, color: '#3a2214', shadow: '#c8b07c' });
    } else if (cam.sec === 'edge') {
      ctx.drawImage(backdrop(amb.env), -Math.round(cam.x * 0.12) - 40, 0);
      amb.sky(ctx, now);
      w = amb.begin(ctx);
      w.drawImage(pano.bg, -cx, 0);
      edgeSigns(w, cx, L.edge);
    } else {
      w = amb.begin(ctx, amb.env.inside);
      w.drawImage(pano.bg, -cx, 0);
    }
    for (const h of this.holes) {
      if (h.sec !== cam.sec) continue;
      w.fillStyle = OUT; w.fillRect(Math.round(h.wx - cx) - 1, Math.round(h.y) - 1, 2, 2);
    }
    this.deco.drawBack(w, cam.sec, cx, t, now);
    const depth = (tg) => (tg.arc ? 999 : tg.ride ? tg.ride.y : this.spots[tg.spot].base);
    const vis = this.visible(t, cam).sort((a, b) => depth(a) - depth(b));
    for (const tg of vis) {
      if (tg.kind === 'boss') this.drawBoss(w, tg, cx, t);
      else if (tg.kind === 'rider') this.drawRider(w, tg, cx, t);
      else if (tg.kind !== 'bottle' && tg.kind !== 'crate' && tg.kind !== 'tnt') this.drawFigure(w, tg, cx, t);
    }
    w.drawImage(pano.front, -cx, 0);
    for (const tg of vis) {
      if (tg.kind !== 'bottle') continue;
      const s = this.spots[tg.spot];
      drawBottle(w, Math.round(s.cx - cx), s.base, tg.look, this.rise(tg, t));
    }
    this.deco.drawFront(w, cam.sec, cx, t, now);
    amb.end(ctx, now);
    if (cam.sec === 'street') streetLights(ctx, cam.x, L, amb);
    else if (cam.sec === 'edge') edgeLights(ctx, cx, L.edge, amb);
    else if (cam.sec === 'station') {
      // la nuit : fenêtres de la gare et des voitures de voyageurs éclairées, lampes du quai
      if (amb.env.lights) {
        for (const wn of STA.building.windows) amb.window(ctx, wn.x - cx, wn.y, wn.w, wn.h);
        for (const wg of L.train) if (wg.type === 'passenger') for (const wn of wagonOpenings(wg).wins) amb.window(ctx, wn.x - cx, wn.y, wn.w, wn.h);
        for (const lx of [364, 564, 764, 1000]) amb.glow(ctx, lx - cx, 101, 22);
        amb.glow(ctx, STA.loco.x + STA.loco.w - 7 - cx, 97, 30, '255,230,150');
      }
    } else {
      ctx.globalCompositeOperation = 'lighter';
      for (const lx of [200, 520]) {
        if (!this.deco.lit(lx)) continue; // lustre abattu : plus de lumière
        const fl = Math.sin(now / 90 + lx) + Math.sin(now / 37);
        for (const [r, a] of [[44, 0.04], [28, 0.05], [14, 0.06]]) S.disc(ctx, lx - cx, 20, r + Math.round(fl), `rgba(255,170,70,${a})`);
      }
      ctx.globalCompositeOperation = 'source-over';
    }

    // bonus et repères par-dessus l'ambiance, pour rester bien visibles
    for (const tg of vis) {
      if (this.dead.has(tg.id) && tg.kind !== 'supply') continue;
      if (tg.kind === 'tnt') {
        if (t >= tg.t0) this.drawTnt(ctx, tg, t, now);
      } else if (tg.kind === 'crate') {
        if (tg.arc) {
          const p = crateAt(tg, t);
          if (t >= tg.t0) drawCrate(ctx, Math.round(p.x), Math.round(p.y + 7), tg.bonus, 1, now);
        } else {
          const s = this.spots[tg.spot];
          drawCrate(ctx, Math.round(s.cx - cx), s.base, tg.bonus, this.rise(tg, t), now);
        }
      } else if (tg.loot && this.rise(tg, t) > 0.6) {
        const p = this.targetScreen(tg, t);
        drawLoot(ctx, Math.round(p.x), Math.round(p.y - 22), tg.bonus, now);
      } else if (tg.kind === 'supply' && !this.dead.has(tg.id) && t < tg.throwAt && this.rise(tg, t) > 0.6) {
        const p = this.targetScreen(tg, t);
        drawCrate(ctx, Math.round(p.x), Math.round(p.y - 2), null, 1, 0);
        canvasText(ctx, 'AMI', p.x, p.y - 24, { size: 8, color: '#b8e070' });
      }
    }
    for (const tg of vis) this.drawLockOn(ctx, tg, cx, t);
    for (const p of this.parts) { ctx.fillStyle = p.col; ctx.fillRect(Math.round(p.x), Math.round(p.y), 1, 1); }
    for (const b of this.booms) {
      const k = (t - b.at) / 500;
      S.disc(ctx, b.x, b.y, Math.round(6 + k * 18), `rgba(248,120,24,${0.7 * (1 - k)})`);
      if (k < 0.4) S.drawFlash(ctx, b.x, b.y, 24, t / 30);
    }
    amb.weather(ctx, now, outdoor);
    const dark = shooterEventAt(this.world.events || [], 'blackout', t);
    if (dark && cam.sec === 'saloon') this.drawBlackout(ctx, t, dark);
    if (t < this.sandUntil) this.drawSand(ctx, t);

    // fondus entre la gare, les abords, la rue et le saloon
    for (const [a, b] of FADES) {
      if (t > a && t < b) {
        ctx.fillStyle = `rgba(10,5,3,${1 - Math.abs(t - (a + b) / 2) / ((b - a) / 2)})`;
        ctx.fillRect(0, 0, W, H);
      }
    }
    // noms des lieux (en plus grand) puis annonces : courtes, en haut de l'écran
    if (t >= STATION_START + 1000 && t < STATION_START + 1000 + BANNER_MS) this.drawBanner(ctx, 'LA GARE', '#f8d070', t - STATION_START - 1000, true);
    if (t >= EDGE_START && t < EDGE_START + BANNER_MS) this.drawBanner(ctx, L.edge.name, '#f8d070', t - EDGE_START, true);
    if (t >= STREET_START && t < STREET_START + BANNER_MS) this.drawBanner(ctx, 'LA GRAND-RUE', '#f8d070', t - STREET_START, true);
    if (t >= SALOON_START && t < SALOON_START + BANNER_MS) this.drawBanner(ctx, 'LE SALOON', '#f8d070', t - SALOON_START, true);
    this.drawBossHud(ctx, t);
    if (this.banner && t - this.banner.at < BANNER_MS) this.drawBanner(ctx, this.banner.text, this.banner.col, t - this.banner.at);

    if (this.red > 0) { ctx.fillStyle = `rgba(190,30,20,${this.red * 0.5})`; ctx.fillRect(0, 0, W, H); }
    if (this.now < (this.whiteUntil || 0)) { ctx.fillStyle = 'rgba(255,251,232,0.85)'; ctx.fillRect(0, 0, W, H); }
    if (this.gun) this.drawGun(ctx);
    if (this.shielded) {
      const a = 0.35 + 0.15 * Math.sin(this.now / 120);
      ctx.fillStyle = `rgba(248,208,112,${a})`;
      ctx.fillRect(0, 0, W, 2); ctx.fillRect(0, H - 2, W, 2); ctx.fillRect(0, 0, 2, H); ctx.fillRect(W - 2, 0, 2, H);
    }
    this.drawAmmo(ctx);
    this.drawFeed(ctx, t);
    for (const [i, r] of Object.entries(this.remote)) {
      if (r.left) continue;
      const col = this.color(+i);
      const shot = this.t - r.shot < 150;
      const pw = this.powers[i];
      if (pw && BONUSES[pw.kind]?.gun && t < pw.until) ring(ctx, Math.round(r.x), Math.round(r.y), 9, 9, col, 2, this.now / 50);
      ring(ctx, Math.round(r.x), Math.round(r.y), shot ? 6 : 4, shot ? 6 : 4, col);
      ctx.fillStyle = col; ctx.fillRect(Math.round(r.x), Math.round(r.y), 1, 1);
      canvasText(ctx, this.name(+i).slice(0, 3).toUpperCase(), r.x, r.y + 6, { size: 8, color: col });
    }
    if (this.mouse.in) this.drawCrosshair(ctx);
  }

  drawFigure(ctx, tg, cx, t) {
    const s = this.spots[tg.spot];
    const k = this.rise(tg, t);
    if (k <= 0) return;
    const friend = tg.kind === 'civil' || tg.kind === 'supply';
    const char = tg.kind === 'supply' ? SUPPLIER : tg.kind === 'civil' ? CIVILS[tg.look % CIVILS.length] : BANDITS[tg.look % BANDITS.length];
    const d = this.dead.get(tg.id);
    const flash = d && t - d.at < 120;
    const spr = S.characterSprite(char, { blink: (t + tg.id * 517) % 3100 < 120, hurt: !!d, t, tint: flash ? 'rgba(255,60,40,0.6)' : null });
    const x = Math.round(s.cx - cx - 24);
    const y = Math.round(s.base - 56 + (1 - k) * 56);
    ctx.save();
    ctx.beginPath();
    ctx.rect(s.x - cx, s.y, s.w, s.h);
    ctx.clip();
    ctx.drawImage(spr, x, y);
    const { R } = paint(ctx);
    const skin = SKIN[char.skin], sleeve = CLOTH_COLORS[char.outfitColor];
    if (tg.kind === 'supply' && t < tg.throwAt && !d) {
      // il tient la caisse à bout de bras au-dessus de sa tête
      for (const ax of [x + 9, x + 33]) { R(ax, y + 10, 6, 26, OUT); R(ax + 1, y + 11, 4, 24, sleeve); R(ax, y + 6, 6, 6, OUT); R(ax + 1, y + 7, 4, 4, skin); }
    } else if (tg.kind === 'supply') {
      // il salue de la main
      const wave = Math.floor(t / 150) % 2 ? 2 : 0;
      R(x + 37 + wave, y + 15, 6, 22, OUT); R(x + 38 + wave, y + 16, 4, 20, sleeve);
      R(x + 37 + wave, y + 9, 6, 8, OUT); R(x + 38 + wave, y + 10, 4, 6, skin);
    } else if (friend) {
      for (const ax of [x + 5, x + 37]) {
        R(ax, y + 22, 6, 20, OUT); R(ax + 1, y + 23, 4, 18, sleeve);
        R(ax, y + 15, 6, 8, OUT); R(ax + 1, y + 16, 4, 6, skin);
      }
    } else if (!d && tg.throwAt && t < tg.throwAt) {
      R(x + 33, y + 10, 6, 26, OUT); R(x + 34, y + 11, 4, 24, sleeve); R(x + 33, y + 6, 6, 6, OUT); R(x + 34, y + 7, 4, 4, skin);
      R(x + 34, y - 5, 5, 12, OUT); R(x + 35, y - 4, 3, 10, '#c0392b'); R(x + 35, y - 1, 3, 2, '#f4ecd8');
      const sp = Math.floor(t / 60) % 2;
      R(x + 36 + sp, y - 8, 2, 2, sp ? '#fff070' : '#f87818');
    } else if (!d) {
      R(x + 28, y + 40, 8, 7, OUT); R(x + 29, y + 41, 6, 5, skin);
      R(x + 29, y + 34, 9, 9, OUT); R(x + 30, y + 35, 7, 7, '#4a4f58'); R(x + 31, y + 36, 5, 5, '#8a8f98'); R(x + 32, y + 37, 3, 3, OUT);
      if (tg.loot) { R(x + 2, y + 30, 12, 16, OUT); R(x + 3, y + 31, 10, 14, '#c8a060'); R(x + 5, y + 29, 6, 2, '#7a4a24'); R(x + 6, y + 35, 4, 4, '#e0b040'); }
    }
    ctx.restore();
    for (const f of this.fireFx) if (f.id === tg.id) S.drawFlash(ctx, x + 33, y + 38, 14, t / 30);
  }

  // Cavalier au galop ; abattu, il vide les étriers et son cheval s'enfuit.
  drawRider(ctx, tg, cx, t) {
    const d = this.dead.get(tg.id);
    const dir = tg.ride.vx > 0 ? 1 : -1;
    const x = Math.round(rideX(tg, t) - cx), y = tg.ride.y;
    if (x < -60 || x > W + 60) return;
    const [coat, mane] = HORSE_COATS[tg.look % HORSE_COATS.length];
    const char = BANDITS[tg.look % BANDITS.length];
    const frame = Math.floor((t + tg.id * 97) / 90) % 4;
    let spr = horseSprite(coat, mane, frame, d ? null : riderLook(char, '#7a2a1e', `bandit${tg.look}`));
    if (dir < 0) spr = flipped(spr);
    ctx.fillStyle = 'rgba(40,24,10,0.3)';
    ctx.fillRect(x - 24, y - 1, 50, 3);
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.translate(x, y);
    ctx.scale(RIDE_SCALE, RIDE_SCALE);
    ctx.drawImage(spr, -spr.ox, -spr.oy);
    if (!d) {
      // revolver pointé vers les joueurs
      const gx = dir > 0 ? 2 : -8;
      ctx.fillStyle = OUT; ctx.fillRect(gx - 1, -42, 8, 4);
      ctx.fillStyle = '#8a8f98'; ctx.fillRect(gx, -41, 6, 2);
    } else {
      const k = clamp01((t - d.at) / 600);
      if (k < 1) {
        // il vide les étriers et bascule en arrière
        const body = S.characterSprite(char, { hurt: true, t });
        ctx.globalAlpha = 1 - k * 0.5;
        ctx.translate(-dir * (4 + 26 * k), -34 + 30 * k * k);
        ctx.rotate(-dir * k * 1.8);
        ctx.drawImage(body, -12, -14, 24, 28);
      }
    }
    ctx.restore();
    for (const f of this.fireFx) if (f.id === tg.id) S.drawFlash(ctx, x + dir * 15, y - 60, 14, t / 30);
  }

  // Bâton de dynamite qui tournoie, mèche qui crépite ; le cercle clignote de plus en plus vite avant l'impact.
  drawTnt(ctx, tg, t, now) {
    if (t > tg.t1 || this.defused(tg)) return;
    const p = crateAt(tg, t);
    const x = Math.round(p.x), y = Math.round(p.y);
    const fast = tg.t1 - t < 600 ? 60 : 140;
    ring(ctx, x, y, 11, 11, Math.floor(now / fast) % 2 ? '#f0705a' : '#f8d070', 2, now / 50);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate((t - tg.t0) / 110);
    ctx.fillStyle = OUT; ctx.fillRect(-3, -7, 6, 14);
    ctx.fillStyle = '#c0392b'; ctx.fillRect(-2, -6, 4, 12);
    ctx.fillStyle = '#e8604c'; ctx.fillRect(-2, -6, 1, 12);
    ctx.fillStyle = '#f4ecd8'; ctx.fillRect(-2, -1, 4, 2);
    ctx.fillStyle = '#5a3a20'; ctx.fillRect(0, -10, 1, 4); // mèche
    const sp = Math.floor(now / 50) % 2;
    ctx.fillStyle = sp ? '#fff070' : '#f87818'; ctx.fillRect(-1 + sp, -12, 2, 2);
    ctx.restore();
  }

  // El Diablo, une fois et demie plus grand, entouré d'une aura rouge, arpente le balcon.
  drawBoss(ctx, tg, cx, t) {
    const d = this.dead.get(tg.id);
    const rage = this.bossRage();
    const sc = BOSS_SCALE, w = Math.round(48 * sc), h = Math.round(56 * sc);
    const bx = Math.round(bossX(d && d.at > 0 ? d.at : t) - cx);
    const flash = t - this.bossFlash < 110 || (d && t - d.at < 150);
    const { img, sil } = bossSprite(!!flash, (t % 2900) < 120, t);
    let top = this.bossTop(t);
    ctx.save();
    if (d) {
      // il bascule par-dessus la rambarde
      const k = clamp01((t - d.at) / 1100);
      ctx.translate(bx, top + h / 2 - 30 * k + 300 * k * k);
      ctx.rotate(k * 2.2);
      ctx.drawImage(img, -w / 2, -h / 2, w, h);
      ctx.restore();
      return;
    }
    ctx.beginPath();
    ctx.rect(0, 0, W, SAL.balcony);
    ctx.clip();
    const pulse = 0.35 + 0.25 * Math.sin(t / (rage ? 70 : 140));
    ctx.globalAlpha = pulse + (rage ? 0.25 : 0);
    for (const [dx, dy] of [[-2, 0], [2, 0], [0, -2], [0, 2]]) ctx.drawImage(sil, bx - w / 2 + dx, top + dy, w, h);
    ctx.globalAlpha = 1;
    ctx.drawImage(img, bx - w / 2, top, w, h);
    ctx.restore();
    for (const f of this.fireFx) if (f.id === tg.id) for (const gx of [-18, 18]) S.drawFlash(ctx, bx + gx, top + 56, 16, t / 30 + gx);
  }

  drawLockOn(ctx, tg, cx, t) {
    if (!tg.fire.length || this.dead.has(tg.id)) return;
    const boss = tg.kind === 'boss';
    if (tg.ride) {
      for (let i = 0; i < tg.fire.length; i++) {
        const f = tg.fire[i];
        if (t < f - 700 || t > f) continue;
        const u = (f - t) / 700;
        const col = this.color(this.aims.get(`${tg.id}:${i}`) ?? tg.victims[i] % this.n);
        const x = Math.round(rideX(tg, t) - cx), y = tg.ride.y - 46;
        ring(ctx, x, y, 8 + u * 12, 8 + u * 12, col, 3, t / 80);
        if (u < 0.35) canvasText(ctx, '!', x, y - 28, { size: 8, color: col });
      }
      return;
    }
    const s = this.spots[tg.spot];
    const k = this.rise(tg, t);
    for (let i = 0; i < tg.fire.length; i++) {
      const f = tg.fire[i];
      if (t < f - 700 || t > f) continue;
      const u = (f - t) / 700;
      const col = this.color(this.aims.get(`${tg.id}:${i}`) ?? tg.victims[i] % this.n);
      const x = boss ? Math.round(bossX(t) - cx) : Math.round(s.cx - cx);
      const y = boss ? this.bossTop(t) + 40 : Math.round(s.base - 56 + (1 - k) * 56 + 26);
      ring(ctx, x, y, (boss ? 10 : 7) + u * 12, (boss ? 10 : 7) + u * 12, col, 3, t / 80);
      if (boss) ring(ctx, x, y, 22 + u * 14, 22 + u * 14, '#f0705a', 2, -t / 60);
      if (u < 0.35) canvasText(ctx, boss ? '!!' : '!', x, y - (boss ? 40 : 26), { size: boss ? 16 : 8, color: col });
    }
  }

  // Présentation d'El Diablo (bandes noires, affiche « WANTED »), puis sa jauge et l'aura rouge de l'écran.
  drawBossHud(ctx, t) {
    const boss = this.boss;
    const el = t - (boss.t0 - 1200);
    if (el > 0 && el < 4000 && !this.dead.has(boss.id)) {
      const k = Math.min(1, el / 300, (4000 - el) / 400);
      const bar = Math.round(22 * k);
      ctx.fillStyle = '#0a0503';
      ctx.fillRect(0, 0, W, bar); ctx.fillRect(0, H - bar, W, bar);
      if (el > 1200) {
        const e = el - 1200, a = Math.min(1, e / 250, (2800 - e) / 400);
        if (a > 0) {
          ctx.globalAlpha = a;
          const px = Math.round(W - 80 + (1 - Math.min(1, e / 300)) * 90);
          const P = (this.bossPoster ||= this.makePoster());
          ctx.drawImage(P, px, 40);
          ctx.fillStyle = 'rgba(26,15,10,0.75)';
          ctx.fillRect(0, 96, W - 90, 40);
          canvasText(ctx, 'EL DIABLO', (W - 90) / 2, 100, { size: 16, color: '#f0705a' });
          canvasText(ctx, `PRIME : ${SHOOTER_PTS.bossKill} PTS - ABATTEZ-LE !`, (W - 90) / 2, 121, { color: '#f8d070' });
          ctx.globalAlpha = 1;
        }
      }
    }
    if (t < boss.t0 || this.dead.has(boss.id)) return;
    const hp = this.hp.get(boss.id) ?? boss.hp;
    const rage = this.bossRage();
    // aura rouge sur les bords de l'écran
    const pulse = 0.5 + 0.5 * Math.sin(t / (rage ? 110 : 260));
    for (let i = 0; i < 8; i++) {
      ctx.fillStyle = `rgba(170,20,10,${(0.05 + (rage ? 0.05 : 0)) * (1 - i / 8) * (0.6 + 0.4 * pulse)})`;
      ctx.fillRect(i, i, W - 2 * i, 1); ctx.fillRect(i, H - 1 - i, W - 2 * i, 1);
      ctx.fillRect(i, i, 1, H - 2 * i); ctx.fillRect(W - 1 - i, i, 1, H - 2 * i);
    }
    // jauge : une case par point de vie
    const BW = 180, x0 = Math.round(W / 2 - BW / 2), y0 = 14;
    canvasText(ctx, rage && Math.floor(t / 250) % 2 ? 'EL DIABLO - ENRAGÉ !' : 'EL DIABLO', W / 2, 3, { color: '#f0705a' });
    ctx.fillStyle = OUT; ctx.fillRect(x0 - 2, y0 - 2, BW + 4, 10);
    ctx.fillStyle = '#5a1a14'; ctx.fillRect(x0, y0, BW, 6);
    const hit = t - this.bossFlash < 120;
    ctx.fillStyle = hit ? '#fdf6e0' : rage ? '#f87818' : '#e8604c';
    ctx.fillRect(x0, y0, Math.round((BW * hp) / boss.hp), 6);
    ctx.fillStyle = 'rgba(255,240,200,0.35)'; ctx.fillRect(x0, y0, Math.round((BW * hp) / boss.hp), 1);
    ctx.fillStyle = OUT;
    for (let k = 1; k < boss.hp; k++) ctx.fillRect(x0 + Math.round((BW * k) / boss.hp), y0, 1, 6);
    // tête de mort de part et d'autre
    for (const sx of [x0 - 12, x0 + BW + 4]) {
      S.disc(ctx, sx + 4, y0 + 2, 4, OUT); S.disc(ctx, sx + 4, y0 + 2, 3, '#f4ecd8');
      ctx.fillStyle = OUT; ctx.fillRect(sx + 2, y0 + 1, 2, 2); ctx.fillRect(sx + 5, y0 + 1, 2, 2); ctx.fillRect(sx + 3, y0 + 6, 3, 1);
    }
  }

  makePoster() {
    const p = S.makeCanvas(70, 90);
    const x = p.getContext('2d');
    x.fillStyle = OUT; x.fillRect(0, 0, 70, 90);
    x.fillStyle = '#e8d4a0'; x.fillRect(1, 1, 68, 88);
    x.fillStyle = '#c8b07c'; x.fillRect(1, 80, 68, 9);
    canvasText(x, 'WANTED', 35, 3, { color: '#7a2a1e', shadow: '#c8b07c' });
    const por = S.portrait(BOSS, 1);
    x.drawImage(por, 7, 14);
    x.fillStyle = OUT; x.strokeStyle = OUT; x.strokeRect(6.5, 13.5, por.width + 1, por.height + 1);
    canvasText(x, 'MORT OU VIF', 35, 78, { color: '#3a2214', shadow: '#c8b07c' });
    return p;
  }

  // Annonce en haut de l'écran, sur une petite étiquette à la taille du texte : le jeu reste visible.
  // Pendant le combat contre El Diablo, elle passe sous sa jauge de vie.
  drawBanner(ctx, text, col, el, big = false) {
    const a = el < 150 ? el / 150 : el > BANNER_MS - 300 ? (BANNER_MS - el) / 300 : 1;
    const size = big ? 16 : 8;
    ctx.font = `${size}px Silkscreen, monospace`;
    const w = Math.ceil(ctx.measureText(text).width);
    const y = (this.t >= BOSS_T0 ? 24 : 4) - (el < 150 ? Math.round((1 - el / 150) * 6) : 0);
    ctx.globalAlpha = Math.max(0, a);
    ctx.fillStyle = 'rgba(26,15,10,0.6)';
    ctx.fillRect(Math.round(W / 2 - w / 2 - 5), y - 2, w + 10, size + 6);
    canvasText(ctx, text, W / 2, y, { size, color: col });
    ctx.globalAlpha = 1;
  }

  // Derniers bonus ramassés (en haut à gauche)
  drawFeed(ctx, t) {
    let y = 26;
    for (const f of this.feed) {
      const el = t - f.at;
      if (el > 4000) continue;
      ctx.globalAlpha = Math.min(1, (4000 - el) / 500);
      const who = f.by === this.me ? 'TOI' : this.name(f.by).slice(0, 8).toUpperCase();
      const { R } = paint(ctx);
      R(5, y - 1, 10, 9, OUT);
      bonusIcon(R, 6, y, f.bonus);
      canvasText(ctx, `${who} : ${BONUSES[f.bonus]?.name || f.bonus}`, 18, y, { size: 8, color: this.color(f.by), align: 'left' });
      ctx.globalAlpha = 1;
      y += 11;
    }
  }

  // Tempête de sable : l'écran est couvert, seul un petit cercle autour du viseur reste visible.
  // Panne de lumière au saloon : tout est noir sauf une lueur autour du viseur ; chaque coup de feu éclaire la salle.
  drawBlackout(ctx, t, e) {
    const k = Math.max(0, Math.min(1, (t - e.t0) / 400, (e.t1 - t) / 500));
    const flash = Math.max(0, 1 - (this.now - this.lightFlash) / 140);
    const c = (this.darkCv ||= S.makeCanvas(W, H));
    const x = c.getContext('2d');
    x.globalCompositeOperation = 'source-over';
    x.clearRect(0, 0, W, H);
    x.fillStyle = `rgba(6,6,16,${0.9 * k * (1 - 0.75 * flash)})`;
    x.fillRect(0, 0, W, H);
    const mx = Math.round(this.mouse.in ? this.mouse.x : W / 2), my = Math.round(this.mouse.in ? this.mouse.y : H / 2);
    x.globalCompositeOperation = 'destination-out';
    S.disc(x, mx, my, 22, '#000');
    x.fillStyle = '#000';
    for (let dy = -32; dy <= 32; dy++) for (let dx = -32; dx <= 32; dx++) {
      const d = Math.hypot(dx, dy);
      if (d > 22 && d < 32 && ((dx + dy) & 1 || d < 26)) x.fillRect(mx + dx, my + dy, 1, 1);
    }
    ctx.drawImage(c, 0, 0);
  }

  drawSand(ctx, t) {
    const left = this.sandUntil - t, el = SAND_MS - left;
    const a = Math.max(0, Math.min(1, el / 300, left / 600));
    const c = (this.sandCv ||= S.makeCanvas(W, H));
    const x = c.getContext('2d');
    x.globalCompositeOperation = 'source-over';
    x.fillStyle = '#c8a060';
    x.fillRect(0, 0, W, H);
    const off = this.now * 0.3;
    for (let i = 0; i < 90; i++) {
      const yy = (i * 37) % H;
      const xx = (i * 91 + off * (1 + (i % 3) * 0.5)) % (W + 60);
      x.fillStyle = i % 3 ? '#e0c088' : '#a8803c';
      x.fillRect(Math.round(W + 30 - xx), yy, 14 + (i % 5) * 6, 1);
    }
    const mx = Math.round(this.mouse.in ? this.mouse.x : W / 2), my = Math.round(this.mouse.in ? this.mouse.y : H / 2);
    x.globalCompositeOperation = 'destination-out';
    S.disc(x, mx, my, 30, '#000');
    x.fillStyle = '#000';
    for (let dy = -42; dy <= 42; dy++) for (let dx = -42; dx <= 42; dx++) {
      const d = Math.hypot(dx, dy);
      if (d > 30 && d < 42 && ((dx + dy) & 1 || d < 35)) x.fillRect(mx + dx, my + dy, 1, 1);
    }
    ctx.globalAlpha = a;
    ctx.drawImage(c, 0, 0);
    ctx.globalAlpha = 1;
  }

  drawGun(ctx) {
    if (this.power === 'winchester') this.drawRifle(ctx);
    else if (this.power === 'akimbo') this.drawAkimbo(ctx);
    else this.drawGatling(ctx, this.power === 'rusty');
  }

  drawGatling(ctx, rusty) {
    const { R } = paint(ctx);
    const gx = Math.round(W / 2 + (this.mouse.x - W / 2) * 0.4), gy = H;
    const lean = Math.round((this.mouse.x - gx) * 0.12);
    const spin = this.firing ? Math.floor(this.now / (rusty ? 80 : 40)) % 3 : 0;
    const cols = rusty ? ['#4a2e1e', '#7a4a2a', '#9a6a3a', '#b8885a', '#7a4a2a'] : ['#3a3e44', '#6a6f78', '#9a9fa8', '#c9ced6', '#6a6f78'];
    const L = 40;
    const at = (y) => gx + Math.round((lean * y) / L);
    // 5 canons parallèles dont l'éclairage tourne quand on tire
    for (let y = 0; y < L; y++) {
      const cx = at(y);
      R(cx - 11, gy - 20 - y, 23, 1, OUT);
      for (let j = 0; j < 5; j++) R(cx - 10 + j * 4, gy - 20 - y, 4, 1, cols[(j + spin) % 5]);
      for (let j = 0; j < 5; j++) R(cx - 10 + j * 4, gy - 20 - y, 1, 1, OUT);
    }
    const brass = rusty ? '#8a6a2a' : '#e0b040', body = rusty ? '#5a3a24' : '#4a4f58', top = rusty ? '#7a5a3a' : '#8a8f98';
    for (const y of [10, 26, L - 2]) { const cx = at(y); R(cx - 13, gy - 22 - y, 27, 4, OUT); R(cx - 12, gy - 21 - y, 25, 2, brass); }
    R(gx - 22, gy - 22, 44, 22, OUT); R(gx - 21, gy - 21, 42, 21, body);
    R(gx - 21, gy - 21, 42, 3, top); R(gx - 21, gy - 10, 42, 2, brass);
    if (rusty) for (const [dx, dy] of [[-15, -17], [6, -6], [12, -18], [-4, -4]]) R(gx + dx, gy + dy, 3, 2, '#9a5a30'); // taches de rouille
    // manivelle
    const ang = this.firing ? this.now / (rusty ? 120 : 60) : 0;
    const hx = gx + 26 + Math.round(Math.cos(ang) * 5), hy = gy - 12 + Math.round(Math.sin(ang) * 5);
    R(gx + 21, gy - 14, 6, 4, OUT); R(gx + 22, gy - 13, 4, 2, top);
    R(hx - 2, hy - 2, 5, 5, OUT); R(hx - 1, hy - 1, 3, 3, '#7a4a24');
    if (this.now - this.gunAt < 50) S.drawFlash(ctx, at(L), gy - 24 - L, rusty ? 11 : 14, this.now / 30);
  }

  // Winchester : crosse, boîtier en laiton et son levier, long canon ; elle recule à chaque tir
  drawRifle(ctx) {
    const { R } = paint(ctx);
    const kick = this.now - this.gunAt < 90 ? 5 : 0;
    const gx = Math.round(W / 2 + 46 + (this.mouse.x - W / 2) * 0.35), gy = H + kick;
    const L = 70;
    const lean = Math.round((this.mouse.x - gx) * 0.2);
    const at = (y) => gx + Math.round((lean * y) / L);
    for (let y = 0; y < 20; y++) {
      const cx = at(y);
      R(cx - 7, gy - y, 15, 1, OUT); R(cx - 6, gy - y, 13, 1, y % 6 ? '#8a5428' : '#7a4a24'); R(cx - 6, gy - y, 3, 1, '#a86a34');
    }
    for (let y = 20; y < 33; y++) {
      const cx = at(y);
      R(cx - 6, gy - y, 13, 1, OUT); R(cx - 5, gy - y, 11, 1, '#c8a040'); R(cx - 5, gy - y, 3, 1, '#f0d070');
    }
    const lx = at(24) + 7, lever = this.now - this.gunAt < 200 ? 3 : 0; // le levier qu'on actionne
    R(lx, gy - 30 + lever, 7, 2, OUT); R(lx + 6, gy - 30 + lever, 2, 11, OUT); R(lx, gy - 21 + lever, 8, 2, OUT);
    for (let y = 33; y < L; y++) {
      const cx = at(y);
      R(cx - 4, gy - y, 9, 1, OUT); R(cx - 3, gy - y, 3, 1, '#6a6f78'); R(cx, gy - y, 3, 1, '#9aa0a8'); R(cx + 3, gy - y, 1, 1, '#3a3e44');
    }
    for (const y of [42, 60]) { const cx = at(y); R(cx - 4, gy - y - 1, 9, 2, '#c8a040'); }
    R(at(L) - 1, gy - L - 2, 3, 2, OUT);
    if (this.now - this.gunAt < 60) S.drawFlash(ctx, at(L), gy - L - 6, 13, this.now / 30);
  }

  // Deux colts, un dans chaque main : ils tirent ensemble et reculent à chaque clic
  drawAkimbo(ctx) {
    const { R } = paint(ctx);
    const kick = this.now - this.gunAt < 90 ? 5 : 0;
    for (const side of [-1, 1]) {
      const gx = Math.round(W / 2 + side * 78 + (this.mouse.x - W / 2) * 0.3), gy = H + kick;
      const L = 46;
      const lean = Math.round((this.mouse.x + side * 5 - gx) * 0.25);
      const at = (y) => gx + Math.round((lean * y) / L);
      for (let y = 0; y < 14; y++) { const cx = at(y); R(cx - 7, gy - y, 15, 1, OUT); R(cx - 6, gy - y, 13, 1, y < 5 ? '#7a2a1e' : '#eab78e'); } // manche et main
      for (let y = 14; y < 22; y++) { const cx = at(y); R(cx - 4, gy - y, 9, 1, OUT); R(cx - 3, gy - y, 7, 1, '#7a4a24'); R(cx - 3, gy - y, 2, 1, '#9a6a34'); }
      for (let y = 22; y < 31; y++) { const cx = at(y); R(cx - 6, gy - y, 13, 1, OUT); R(cx - 5, gy - y, 11, 1, y % 3 ? '#6a6f78' : '#9aa0a8'); }
      R(at(28) - side * 7 - 1, gy - 32, 3, 3, OUT); // chien
      for (let y = 31; y < L; y++) { const cx = at(y); R(cx - 3, gy - y, 7, 1, OUT); R(cx - 2, gy - y, 2, 1, '#9aa0a8'); R(cx, gy - y, 3, 1, '#6a6f78'); }
      if (this.now - this.gunAt < 60) S.drawFlash(ctx, at(L), gy - L - 5, 11, this.now / 30 + side);
    }
  }

  drawAmmo(ctx) {
    const gun = this.gun;
    if (this.power && this.t < this.powerUntil) {
      const k = (this.powerUntil - this.t) / this.powerMs;
      const name = BONUSES[this.power].name;
      const { R } = paint(ctx);
      R(7, H - 24, 10, 9, OUT);
      bonusIcon(R, 8, H - 23, this.power);
      canvasText(ctx, name, 20, H - 22, { size: 8, color: '#f8d070', align: 'left' });
      ctx.fillStyle = OUT; ctx.fillRect(7, H - 11, 82, 6);
      ctx.fillStyle = '#5a3a20'; ctx.fillRect(8, H - 10, 80, 4);
      ctx.fillStyle = gun ? '#f0705a' : '#f8d070'; ctx.fillRect(8, H - 10, Math.round(80 * k), 4);
    }
    if (gun) {
      // chargeur de l'arme : il ne se recharge pas, l'arme disparaît quand il est vide
      if (gun.mag) {
        const low = this.gunAmmo <= (gun.dual ? 4 : 5);
        canvasText(ctx, `${this.gunAmmo} BALLES`, W - 10, H - 18, { size: 8, color: low ? '#f0705a' : '#f8d070', align: 'right' });
      }
      if (gun.auto && this.t - (this.powerUntil - this.powerMs) < 4000) canvasText(ctx, 'CLIC MAINTENU', W - 10, H - 30, { size: 8, color: '#fdf6e0', align: 'right' });
      return;
    }
    if (this.behind) canvasText(ctx, 'RENFORTS', W - 10, H - 40, { size: 8, color: '#b8e070', align: 'right' });
    for (let i = 0; i < this.cap; i++) {
      const x = W - 12 - i * 8, y = H - 16;
      const full = i < this.ammo;
      ctx.fillStyle = OUT; ctx.fillRect(x - 1, y - 1, 6, 13);
      ctx.fillStyle = full ? '#e0b040' : '#4a3a2a'; ctx.fillRect(x, y + 3, 4, 8);
      ctx.fillStyle = full ? '#c8c0b8' : '#3a2e28'; ctx.fillRect(x, y, 4, 3);
    }
    if (this.reloadUntil) canvasText(ctx, 'RECHARGE...', W - 30, H - 28, { size: 8, color: '#f8d070' });
    else if (this.ammo === 0 && this.playing && Math.floor(this.now / 300) % 2) canvasText(ctx, 'CLIC DROIT : RECHARGER', W - 90, H - 28, { size: 8, color: '#f0705a' });
  }

  drawCrosshair(ctx) {
    const x = Math.round(this.mouse.x), y = Math.round(this.mouse.y);
    const col = this.color(this.me);
    const seg = (dx, dy, w, h) => {
      ctx.fillStyle = OUT; ctx.fillRect(x + dx + 1, y + dy + 1, w, h);
      ctx.fillStyle = col; ctx.fillRect(x + dx, y + dy, w, h);
    };
    // bonus actif : un arc doré autour du viseur montre le temps restant
    if (this.power && this.t < this.powerUntil) {
      const k = (this.powerUntil - this.t) / this.powerMs;
      const n = 48;
      ctx.fillStyle = this.gun ? '#f0705a' : '#f8d070';
      for (let i = 0; i < n * k; i++) {
        const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
        ctx.fillRect(Math.round(x + Math.cos(a) * 13), Math.round(y + Math.sin(a) * 13), 1, 1);
      }
    }
    ring(ctx, x + 1, y + 1, 6, 6, OUT);
    ring(ctx, x, y, 6, 6, col);
    seg(-10, 0, 6, 1); seg(5, 0, 6, 1); seg(0, -10, 1, 6); seg(0, 5, 1, 6);
    ctx.fillStyle = '#fdf6e0'; ctx.fillRect(x, y, 1, 1);
  }

  hudStats() {
    const gun = this.gun;
    const ammo = gun
      ? [BONUSES[this.power].name, gun.mag ? `${this.gunAmmo}` : `${Math.ceil((this.powerUntil - this.t) / 1000)}s`, 'salmon']
      : ['BALLES', `${this.ammo}/${this.cap}`, 'green'];
    const out = [['TIRS', this.shots || 0, 'cream'], ['ABATTUS', this.kills || 0, 'yellow'], ammo];
    const b = this.world && shooterEventAt(this.world.events || [], 'bounty', this.t);
    if (b) out.push(['PRIME X2', `${Math.ceil((b.t1 - this.t) / 1000)}s`, 'yellow']);
    return out;
  }
}
