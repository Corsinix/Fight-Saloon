// Décor de la Roulette : six lieux (saloon, cantina, wagon-bar du train, bureau du shérif, salon du bateau
// à aubes, grand hôtel), chacun
// avec ses éléments animés, et une ambiance (heure, météo) visible par les fenêtres et dans l'éclairage.
// Lieu et ambiance sont tirés de la graine de la partie : les deux joueurs voient la même chose.
import * as S from './sprites.js';
import { pickEnv, Ambience, desertOpts, skyDeco, haloSprite, ENVS } from './env.js';
import { rng } from './worlds.js';
import { sfx } from './audio.js';
import { canvasText } from './scene.js';
import { loadSets, drawSet } from './storyset.js';

const W = 384, H = 216;
const OUT = S.OUT;
const TAU = Math.PI * 2;

const hash = (n) => {
  let t = (n * 0x6d2b79f5) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const clamp01 = (k) => (k < 0 ? 0 : k > 1 ? 1 : k);
const smooth = (k) => { k = clamp01(k); return k * k * (3 - 2 * k); };

function paint(ctx) {
  const R = (x, y, w, h, col) => { ctx.fillStyle = col; ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };
  const box = (x, y, w, h, col) => { R(x - 1, y - 1, w + 2, h + 2, OUT); R(x, y, w, h, col); };
  return { R, box };
}
function seeded(s) { return () => ((s = (s * 9301 + 49297) % 233280) / 233280); }

// Éclairage intérieur selon l'ambiance (multiplication du décor du fond)
const ROOM_TINT = {
  aube: '#f4e4e4', crepuscule: '#f4d0b8', nuit: '#9c96c4', orage: '#b4b6c8', poussiere: '#f0e0c8', neige: '#e4e8f4',
};

// ------------------------------------------------------------ petits personnages et objets animés
function drawLamp(ctx, ax, ay, len, a) {
  const { R } = paint(ctx);
  const x = Math.round(ax + Math.sin(a) * len), y = Math.round(ay + Math.cos(a) * len);
  for (let k = 0; k <= len; k += 2) R(ax + Math.sin(a) * k, ay + Math.cos(a) * k, 1, 2, '#2a1810');
  R(x - 5, y - 1, 11, 5, OUT); R(x - 4, y, 9, 3, '#a06a20');
  R(x - 4, y + 3, 9, 10, OUT); R(x - 3, y + 3, 7, 9, '#a06a20');
  R(x - 2, y + 4, 5, 6, '#f8e08a'); R(x - 1, y + 5, 3, 3, '#fffbe0');
  R(x - 5, y + 12, 11, 3, OUT); R(x - 4, y + 12, 9, 2, '#a06a20');
  return { x, y: y + 7, glass: y };
}
// Verre allumé de la lampe, redessiné par-dessus le décor teinté : une flamme ne s'assombrit pas la nuit
function lampGlass(ctx, x, y) {
  ctx.fillStyle = '#f8e08a'; ctx.fillRect(x - 2, y + 4, 5, 6);
  ctx.fillStyle = '#fffbe0'; ctx.fillRect(x - 1, y + 5, 3, 3);
}

function drawFly(ctx, cx, cy, now, ph = 0) {
  const x = Math.round(cx + Math.sin(now / 170 + ph) * 22 + Math.sin(now / 53 + ph) * 5);
  const y = Math.round(cy + Math.cos(now / 230 + ph) * 12 + Math.sin(now / 41) * 2);
  ctx.fillStyle = '#1a0f0a'; ctx.fillRect(x, y, 1, 1);
  if (Math.floor(now / 40) % 2) { ctx.fillStyle = 'rgba(220,230,240,0.7)'; ctx.fillRect(x - 1, y - 1, 1, 1); ctx.fillRect(x + 1, y - 1, 1, 1); }
}

// Silhouette faite de rectangles [x, y, w, h, couleur], cernée de noir d'un seul tenant
// (on trace tous les contours d'abord, puis tous les remplissages)
function shape(R, parts) {
  for (const [x, y, w, h] of parts) R(x - 1, y - 1, w + 2, h + 2, OUT);
  for (const [x, y, w, h, c] of parts) R(x, y, w, h, c);
}

// Barman : crâne chauve et luisant, couronne de cheveux, moustache en guidon, nœud papillon, gilet,
// brassards rouges, tablier. Il fait les cent pas derrière le comptoir et essuie un verre.
const BAR = {
  skin: '#eab78e', skinD: '#c98e64', skinL: '#f8d8b8', cheek: '#e89a84',
  hair: '#7a6a5a', hairD: '#4a3e34', must: '#5a4434', mustL: '#7a604a',
  shirt: '#ece4d4', shirtD: '#c4b8a4', vest: '#3a2a38', vestL: '#5a4458', vestD: '#241820',
  bow: '#a02a24', bowL: '#d04a3a', bowD: S.shade('#a02a24', -0.3), garter: '#c0392b', gold: '#e0b040',
  apron: '#f8f2e4', apronD: '#d8ccb4',
};
function drawBartender(ctx, x, now, wiping) {
  const { R } = paint(ctx);
  const C = BAR;
  const step = wiping ? 0 : Math.floor(now / 160) % 2;
  const y0 = 62 - step, hy = 48 - step;
  // bras (derrière le corps) : pendants en marchant, pliés quand il essuie
  const arm = (ax, ay, len, garterY) => {
    shape(R, [[ax, ay, 4, len, C.shirt]]);
    R(ax, ay, 1, len, C.shirtD); R(ax + 3, ay, 1, len, C.shirtD);
    R(ax, garterY, 4, 2, C.garter); R(ax, garterY, 4, 1, C.bowL);
  };
  if (!wiping) {
    arm(x - 13, y0 + 2, 15, y0 + 5); arm(x + 9, y0 + 2, 15, y0 + 5);
    shape(R, [[x - 13, y0 + 17, 4, 4, C.skin], [x + 9, y0 + 17, 4, 4, C.skin]]);
    R(x - 13, y0 + 20, 4, 1, C.skinD); R(x + 9, y0 + 20, 4, 1, C.skinD);
  }
  // le corps : chemise, gilet ouvert en V, tablier
  shape(R, [[x - 9, y0 + 1, 18, 25, C.shirt], [x - 8, y0, 16, 1, C.shirt]]);
  for (let k = 0; k < 25; k++) {
    const v = Math.max(0, 4 - Math.floor(k / 2)); // le V du gilet se referme en descendant
    R(x - 9, y0 + 1 + k, 6 - v + 1, 1, C.vest);
    R(x + 3 + v - 1, y0 + 1 + k, 6 - v + 1, 1, C.vest);
  }
  R(x - 9, y0 + 1, 1, 24, C.vestL); R(x + 8, y0 + 1, 1, 24, C.vestD); // volume du gilet
  R(x - 3, y0 + 9, 1, 14, C.vestL); R(x + 2, y0 + 9, 1, 14, C.vestD);
  for (const by of [11, 15, 19]) R(x + 2, y0 + by, 1, 1, C.gold); // boutons
  R(x - 7, y0 + 13, 1, 1, C.gold); R(x - 6, y0 + 14, 2, 1, C.gold); R(x - 4, y0 + 14, 1, 1, C.gold); // chaîne de montre
  R(x - 7, y0 + 7, 3, 1, C.vestD); // poche
  R(x - 1, y0 + 4, 1, 6, C.shirtD); // patte de la chemise
  // nœud papillon
  shape(R, [[x - 4, y0 + 1, 3, 3, C.bow], [x + 1, y0 + 1, 3, 3, C.bow], [x - 1, y0 + 1, 2, 2, C.bowL]]);
  R(x - 4, y0 + 3, 3, 1, C.bowD); R(x + 1, y0 + 3, 3, 1, C.bowD);
  // tablier noué à la taille, avec ses plis
  R(x - 9, y0 + 15, 18, 1, C.apronD);
  R(x - 8, y0 + 16, 16, 10, C.apron);
  for (const fx of [-5, -1, 4]) R(x + fx, y0 + 17, 1, 9, C.apronD);
  R(x + 7, y0 + 16, 1, 10, C.apronD);
  // la tête
  shape(R, [[x - 6, hy + 1, 12, 12, C.skin], [x - 5, hy, 10, 1, C.skin], [x - 7, hy + 5, 1, 3, C.skin], [x + 6, hy + 5, 1, 3, C.skin], [x - 2, hy + 13, 4, 1, C.skinD]]);
  R(x - 3, hy + 1, 4, 1, C.skinL); R(x - 4, hy + 2, 2, 1, C.skinL); R(x - 1, hy + 2, 1, 1, '#ffffff'); // crâne qui brille
  R(x + 5, hy + 2, 1, 9, C.skinD); R(x - 4, hy + 12, 8, 1, C.skinD); // ombre du visage
  R(x - 7, hy + 6, 1, 1, C.skinD); R(x + 6, hy + 6, 1, 1, C.skinD); // oreilles
  // couronne de cheveux grisonnants, au-dessus des oreilles
  R(x - 6, hy + 3, 1, 3, C.hair); R(x + 5, hy + 3, 1, 3, C.hair); R(x - 6, hy + 2, 1, 1, C.hairD); R(x + 5, hy + 2, 1, 1, C.hairD);
  // sourcils broussailleux, yeux qui clignent
  R(x - 4, hy + 4, 2, 1, C.hair); R(x + 2, hy + 4, 2, 1, C.hair);
  if ((now % 3300) > 120) { R(x - 3, hy + 5, 1, 2, OUT); R(x + 2, hy + 5, 1, 2, OUT); }
  else { R(x - 4, hy + 6, 2, 1, C.skinD); R(x + 2, hy + 6, 2, 1, C.skinD); }
  // nez rond, joues rouges
  R(x - 1, hy + 6, 2, 3, C.skinD); R(x - 1, hy + 6, 1, 1, C.skinL);
  R(x - 5, hy + 8, 2, 1, C.cheek); R(x + 3, hy + 8, 2, 1, C.cheek);
  // moustache en guidon, pointes relevées
  R(x - 4, hy + 9, 8, 2, C.must); R(x - 3, hy + 9, 2, 1, C.mustL); R(x + 1, hy + 9, 2, 1, C.mustL);
  R(x - 6, hy + 8, 2, 2, C.must); R(x + 4, hy + 8, 2, 2, C.must); R(x - 7, hy + 7, 1, 2, C.must); R(x + 6, hy + 7, 1, 2, C.must);
  R(x - 1, hy + 11, 2, 1, C.skinD); // bouche
  if (wiping) {
    // il tient un verre vide par en dessous, à hauteur de poitrine, et frotte l'intérieur avec un chiffon
    const a = now / 160;
    const gx = x, gy = y0 + 6; // coin haut gauche du verre, devant le gilet sombre
    // bras gauche : coude au corps, l'avant-bras remonte sous le verre
    arm(x - 13, y0 + 2, 10, y0 + 5);
    shape(R, [[x - 12, y0 + 13, gx - x + 11, 3, C.shirt]]); R(x - 12, y0 + 15, gx - x + 11, 1, C.shirtD);
    // le verre (gobelet à whisky, épais, avec ses reflets)
    shape(R, [[gx, gy, 8, 9, '#7a9eae'], [gx + 1, gy + 9, 6, 1, '#7a9eae']]);
    R(gx + 1, gy + 1, 5, 7, '#9abccc'); R(gx + 1, gy + 1, 1, 7, '#e8f6fc'); R(gx + 3, gy + 2, 1, 3, '#c8e4f0'); R(gx + 6, gy + 1, 1, 7, '#5a7a88');
    R(gx, gy + 8, 8, 2, '#5a7a88'); R(gx + 1, gy + 8, 3, 1, '#c8e4f0'); // fond épais
    shape(R, [[gx - 1, gy + 9, 5, 3, C.skin]]); R(gx - 1, gy + 11, 5, 1, C.skinD); // main sous le verre
    // bras droit : la main tourne dans le verre avec le chiffon qui dépasse
    const cx = Math.round(gx + 4 + Math.cos(a) * 1.5), cy = Math.round(gy + 1 + Math.sin(a));
    arm(x + 9, y0 + 2, 6, y0 + 5);
    shape(R, [[cx + 2, cy - 1, x + 13 - cx - 2, 3, C.shirt]]); R(cx + 2, cy + 1, x + 13 - cx - 2, 1, C.shirtD);
    shape(R, [[cx - 3, cy - 3, 5, 4, '#f4ecd8'], [cx - 4 + Math.round(Math.cos(a) * 1.5), cy + 1, 2, 3, '#f4ecd8']]);
    R(cx - 3, cy - 3, 5, 1, '#d8ccb4');
    shape(R, [[cx, cy - 2, 3, 3, C.skin]]);
  }
}

// Chat noir qui se promène sur le comptoir (ou s'assoit et balance la queue)
const CAT = { fur: '#2a2428', furL: '#463e48', furD: '#18141a', ear: '#8a4a5a', eye: '#c8e040', nose: '#c87a8a', whisker: '#bab0a8' };
function drawCat(ctx, x, base, dir, now, sitting) {
  const { R } = paint(ctx);
  const C = CAT;
  const f = sitting ? 0 : Math.floor(now / 140) % 4;
  const X = (dx) => Math.round(x + dx * dir);
  // tout est décrit tourné vers la droite, puis retourné si le chat va vers la gauche
  const flip = ([dx, dy, w, h, c]) => [dir > 0 ? x + dx : x - dx - w + 1, base + dy, w, h, c];
  const P = (dx, dy, w, h, c) => R(...flip([dx, dy, w, h, c]));
  const blink = (now % 2900) < 140;
  if (sitting) {
    const sw = Math.sin(now / 300);
    const tail = [[-6, -2, 5, 2], [-9, -3, 3, 2], [-11, -5 + Math.round(sw), 2, 3], [-12, -8 + Math.round(sw * 2), 2, 3]];
    shape(R, [
      [-5, -9, 9, 9, C.fur], [-4, -10, 7, 1, C.fur], [-6, -6, 1, 6, C.fur], // dos rond
      [2, -12, 4, 6, C.fur], // poitrail
      [1, -17, 8, 6, C.fur], [2, -18, 6, 1, C.fur], [1, -20, 2, 3, C.fur], [7, -20, 2, 3, C.fur], // tête, oreilles
      [3, -2, 2, 2, C.fur], [6, -2, 2, 2, C.fur], // pattes avant
      ...tail.map(([a, b, w, h]) => [a, b, w, h, C.fur]),
    ].map(flip));
    P(-4, -9, 4, 1, C.furL); P(2, -18, 5, 1, C.furL); P(2, -19, 1, 1, C.ear); P(7, -19, 1, 1, C.ear);
    P(-5, -1, 8, 1, C.furD);
    if (!blink) { P(3, -15, 2, 2, C.eye); P(6, -15, 2, 2, C.eye); P(4, -15, 1, 2, OUT); P(7, -15, 1, 2, OUT); }
    else { P(3, -14, 2, 1, OUT); P(6, -14, 2, 1, OUT); }
    P(5, -13, 1, 1, C.nose);
    P(9, -13, 2, 1, C.whisker); P(9, -12, 2, 1, C.whisker); P(-1, -13, 2, 1, C.whisker);
    return X;
  }
  // en marche : le corps ondule un peu, les pattes alternent par paires en diagonale
  const bob = f % 2;
  const leg = (lx, ph) => { const up = (f + ph) % 4 === 0 ? 1 : 0; return [lx, -3, 2, 3 - up, C.fur]; };
  const tw = Math.round(Math.sin(now / 260) * 1.5);
  shape(R, [
    [-7, -8 + bob, 13, 5, C.fur], [-6, -9 + bob, 11, 1, C.fur], // corps
    [5, -12, 6, 6, C.fur], [6, -13, 4, 1, C.fur], [11, -10, 1, 3, C.fur], // tête, museau
    [5, -15, 2, 2, C.fur], [9, -15, 2, 2, C.fur], // oreilles
    leg(-6, 0), leg(-3, 2), leg(1, 2), leg(4, 0),
    [-9, -9 + bob, 2, 2, C.fur], [-10, -12, 2, 3, C.fur], [-10 + tw, -15, 2, 3, C.fur], [-9 + tw, -16, 2, 1, C.fur], // queue dressée
  ].map(flip));
  P(-5, -9 + bob, 9, 1, C.furL); P(6, -13, 3, 1, C.furL); // reflets sur le dos et la tête
  P(-6, -4 + bob, 11, 1, C.furD); // ventre dans l'ombre
  P(5, -14, 1, 1, C.ear); P(10, -14, 1, 1, C.ear);
  if (!blink) { P(8, -10, 2, 1, C.eye); P(9, -10, 1, 1, OUT); }
  else P(8, -10, 2, 1, OUT);
  P(11, -9, 1, 1, C.nose);
  P(12, -9, 2, 1, C.whisker); P(12, -7, 2, 1, C.whisker);
  return X;
}

// Bouteille posée sur une étagère (bas en sy, bord gauche en bx) : whisky carré, vin au long col,
// flasque ronde, cruche en grès ou fiole fine, en verre teinté avec reflet, étiquette et bouchon.
// Renvoie sa largeur.
const BOTTLES = ['whisky', 'wine', 'flask', 'jug', 'slim', 'wine', 'whisky'];
function drawBottle(R, bx, sy, kind, col, rnd) {
  const hi = S.shade(col, 0.45), lo = S.shade(col, -0.35);
  const cork = rnd() < 0.5 ? '#c8a070' : '#a83a2a';
  const label = rnd() < 0.7 ? ['#e8d8b0', '#f4ecd8', '#d8b878'][Math.floor(rnd() * 3)] : null;
  let parts, w, top, lab, glint = true;
  if (kind === 'whisky') {
    const h = 9 + Math.floor(rnd() * 3); w = 6;
    parts = [[0, -h, 6, h, col], [1, -h - 1, 4, 1, col], [2, -h - 4, 2, 3, col], [2, -h - 6, 2, 2, cork]];
    top = -h; lab = [0, -h + 3, 6, 4];
  } else if (kind === 'wine') {
    const h = 9 + Math.floor(rnd() * 3); w = 5;
    parts = [[0, -h, 5, h, col], [1, -h - 2, 3, 2, col], [2, -h - 7, 1, 5, col], [1, -h - 9, 3, 2, rnd() < 0.5 ? '#c0392b' : '#e0b040']];
    top = -h; lab = [0, -h + 4, 5, 3];
  } else if (kind === 'flask') {
    w = 7;
    parts = [[1, -8, 5, 8, col], [0, -7, 7, 6, col], [2, -11, 3, 3, col], [2, -13, 3, 2, cork]];
    top = -8; lab = null;
  } else if (kind === 'jug') {
    // cruche en grès, sans reflet de verre
    w = 8; glint = false;
    const gr = rnd() < 0.5 ? '#c8b088' : '#a87850';
    parts = [[1, -10, 6, 10, gr], [0, -8, 8, 6, gr], [2, -12, 4, 2, gr], [7, -9, 2, 1, gr], [8, -9, 1, 5, gr], [2, -14, 4, 2, '#7a4a28']];
    top = -10; lab = null;
  } else {
    const h = 13 + Math.floor(rnd() * 4); w = 4;
    parts = [[0, -h, 4, h, col], [1, -h - 4, 2, 4, col], [1, -h - 5, 2, 1, cork]];
    top = -h; lab = [0, -h + 5, 4, 3];
  }
  shape(R, parts.map(([x, y, pw, ph, c]) => [bx + x, sy + y, pw, ph, c]));
  if (kind === 'jug') R(bx + 1, sy - 10, 6, 3, '#6a4428'); // vernis brun du haut
  if (glint) {
    R(bx + 1, sy + top + 1, 1, -top - 2, hi); // reflet du verre
    R(bx + w - 1, sy + top + 1, 1, -top - 1, lo); // côté dans l'ombre
    if (kind !== 'flask') R(bx + 1, sy + top - 1, 1, 1, '#ffffff');
  } else R(bx + w - 2, sy - 9, 1, 8, S.shade('#c8b088', -0.3));
  if (lab && label) {
    R(bx + lab[0], sy + lab[1], lab[2], lab[3], label);
    R(bx + lab[0] + 1, sy + lab[1] + 1, lab[2] - 2, 1, '#7a3a1a'); // le nom
    if (lab[3] > 3) R(bx + lab[0] + 1, sy + lab[1] + 3, lab[2] - 3, 1, '#a88a5a');
  }
  return w;
}

// Mariachi en traje de charro, debout derrière la table (le bas des jambes est caché) :
// il joue de la guitare, de la trompette ou des maracas selon la partie.
// Renvoie le point d'où s'envolent les notes (null quand il ne joue pas).
const MARIACHI = ['guitar', 'trumpet', 'maracas'];
function drawMariachi(ctx, mx, now, kind = 'guitar') {
  ctx.save();
  ctx.translate(0, 8); // sous la seconde guirlande de papel picado
  const src = mariachiBody(ctx, mx, now, kind);
  ctx.restore();
  return src && { x: src.x, y: src.y + 8 };
}
function mariachiBody(ctx, mx, now, kind) {
  const { R } = paint(ctx);
  // forme pleine cernée de noir : lignes [y, x0, x1], x relatifs à mx
  const blob = (rows, col) => {
    for (const [y, x0, x1] of rows) R(mx + x0 - 1, y - 1, x1 - x0 + 3, 3, OUT);
    for (const [y, x0, x1] of rows) R(mx + x0, y, x1 - x0 + 1, 1, col);
  };
  const span = (y0, y1, x0, x1) => { const r = []; for (let y = y0; y <= y1; y++) r.push([y, x0, x1]); return r; };
  // membre épais (manche de veste) d'un point à l'autre, cerné
  const limb = (pts, w, col) => {
    for (const pass of [0, 1]) for (let i = 1; i < pts.length; i++) {
      const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
      const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
      for (let k = 0; k <= n; k++) {
        const x = mx + x0 + ((x1 - x0) * k) / n, y = y0 + ((y1 - y0) * k) / n;
        if (pass) R(x, y, w, w, col); else R(x - 1, y - 1, w + 2, w + 2, OUT);
      }
    }
  };
  const hand = (x, y) => { R(mx + x - 1, y - 1, 6, 5, OUT); R(mx + x, y, 4, 3, skin); R(mx + x, y + 2, 4, 1, skinD); R(mx + x - 1, y + 3, 6, 1, silver); };

  const skin = '#c98e5e', skinD = '#a06a3c', skinL = '#dfa874';
  const suit = '#26211f', suitL = '#3e3633', suitD = '#141010';
  const silver = '#dcdce4', silverD = '#8a8a98';
  const shirt = '#f4ecd8', red = '#c0392b', redD = '#8a2218', hair = '#1e1410';
  const felt = '#e8d4a0', feltD = '#bfa26a', feltL = '#f6e8c0', gold = '#d4a030';
  const brass = '#e0b040', brassL = '#f8e488', brassD = '#9a6e1c';

  const beat = Math.floor(now / 420);
  const b = beat % 2; // il marque le temps
  const blink = (now % 3100) < 130;
  const trumpetUp = kind !== 'trumpet' || (beat % 8) < 6; // la trompette souffle 6 temps, respire 2
  const puff = kind === 'trumpet' && trumpetUp;

  // pantalon (bas caché par la table) avec la botonadura d'argent sur les coutures
  blob(span(86, 127, -8, 7), suit);
  R(mx - 1, 96, 1, 32, suitD); R(mx - 8, 88, 2, 40, suitL);
  for (let y = 90; y < 128; y += 5) { R(mx - 7, y, 1, 2, silver); R(mx + 6, y, 1, 2, silver); R(mx - 7, y + 1, 1, 1, silverD); R(mx + 6, y + 1, 1, 1, silverD); }
  // ceinture et boucle
  blob(span(85 + b, 87 + b, -9, 8), '#5a3a20');
  R(mx - 9, 85 + b, 18, 1, '#7a5230');
  R(mx - 2, 84 + b, 5, 5, OUT); R(mx - 1, 85 + b, 3, 3, silver); R(mx, 86 + b, 1, 1, silverD);
  // veste courte (chaquetilla) : épaules, plastron ouvert sur la chemise, broderies d'argent
  blob([[65 + b, -7, 6], [66 + b, -9, 8], ...span(67 + b, 78 + b, -10, 9), ...span(79 + b, 83 + b, -9, 8)], suit);
  R(mx - 10, 67 + b, 2, 12, suitL); R(mx - 8, 66 + b, 5, 1, suitL); R(mx + 8, 68 + b, 2, 11, suitD);
  for (let k = 0; k < 9; k++) {
    const hw = 3 - Math.floor(k / 3), y = 65 + b + k;
    R(mx - hw, y, hw * 2, 1, shirt);
    if (k % 2 === 0) { R(mx - hw - 1, y, 1, 1, silver); R(mx + hw, y, 1, 1, silver); }
  }
  R(mx - 1, 68 + b, 2, 6, '#e0d6c0');
  // arabesques brodées sur la poitrine et l'ourlet
  for (const s of [-1, 1]) {
    const px = (dx) => (s < 0 ? mx + dx : mx - dx - 1);
    for (const [dx, dy] of [[-8, 70], [-7, 69], [-6, 70], [-6, 71], [-7, 72], [-8, 73], [-5, 73], [-4, 74], [-6, 76], [-7, 77], [-5, 77]]) R(px(dx), dy + b, 1, 1, silver);
  }
  for (let x = -8; x <= 7; x += 2) R(mx + x, 83 + b, 1, 1, silverD);
  // cou et moño (grand nœud rouge)
  R(mx - 2, 62 + b, 4, 3, skinD);
  blob([[64 + b, -6, -3], [65 + b, -6, 5], [66 + b, -6, -3], [64 + b, 2, 5], [66 + b, 2, 5]], red);
  R(mx - 6, 66 + b, 4, 1, redD); R(mx + 2, 66 + b, 4, 1, redD); R(mx - 1, 64 + b, 2, 3, redD); R(mx - 5, 64 + b, 1, 1, '#e05a48');

  // tête
  const cheek = puff ? 7 : 6;
  blob([[50 + b, -5, 4], ...span(51 + b, 54 + b, -6, 5), ...span(55 + b, 57 + b, -7, 6), ...span(58 + b, 60 + b, -cheek, cheek - 1), [61 + b, -5, 4], [62 + b, -4, 3]], skin);
  R(mx - 7, 56 + b, 1, 1, skinD); R(mx + 6, 56 + b, 1, 1, skinD);
  R(mx - 6, 51 + b, 1, 5, hair); R(mx + 5, 51 + b, 1, 5, hair); // favoris
  R(mx - 5, 52 + b, 10, 1, skinD); // ombre du bord du chapeau
  R(mx + 3, 57 + b, 2, 4, skinD); R(mx - 5, 57 + b, 1, 2, skinL);
  if (puff) { R(mx - 6, 58 + b, 2, 2, skinL); R(mx + 4, 58 + b, 2, 2, '#d89a68'); }
  R(mx - 4, 53 + b, 3, 1, hair); R(mx + 1, 53 + b, 3, 1, hair); // sourcils
  if (blink || puff) { R(mx - 4, 55 + b, 3, 1, OUT); R(mx + 1, 55 + b, 3, 1, OUT); } else {
    R(mx - 4, 55 + b, 3, 2, shirt); R(mx + 1, 55 + b, 3, 2, shirt);
    R(mx - 3, 55 + b, 2, 2, OUT); R(mx + 1, 55 + b, 2, 2, OUT);
  }
  R(mx - 1, 55 + b, 2, 3, skinL); R(mx - 1, 58 + b, 2, 1, skinD); // nez
  // grosse moustache
  R(mx - 4, 59 + b, 8, 2, hair); R(mx - 5, 60 + b, 1, 2, hair); R(mx + 4, 60 + b, 1, 2, hair); R(mx - 3, 59 + b, 2, 1, '#3a2a20');
  if (kind !== 'trumpet') {
    const sing = (now % 840) < 560;
    if (sing) { R(mx - 1, 61 + b, 3, 2, '#5a1a14'); R(mx, 62 + b, 1, 1, '#c0504a'); } else R(mx - 1, 61 + b, 3, 1, skinD);
  }

  // sombrero brodé : calotte pointue, large bord relevé aux extrémités
  blob([[33 + b, -2, 1], [34 + b, -3, 2], ...span(35 + b, 37 + b, -4, 3), ...span(38 + b, 42 + b, -5, 4), ...span(43 + b, 46 + b, -6, 5)], felt);
  R(mx - 4, 36 + b, 1, 9, feltL); R(mx - 3, 34 + b, 1, 3, feltL); R(mx + 3, 37 + b, 2, 9, feltD); R(mx - 1, 33 + b, 1, 5, feltD);
  R(mx - 6, 44 + b, 12, 2, gold); for (let x = -5; x < 6; x += 3) R(mx + x, 44 + b, 1, 1, red);
  for (const [dx, dy] of [[-3, 40], [-2, 39], [-1, 40], [0, 39], [1, 40], [2, 41], [-2, 42], [1, 42]]) R(mx + dx, dy + b, 1, 1, gold);
  blob([[44 + b, -19, -18], [45 + b, -19, -17], [46 + b, -14, 13], [44 + b, 17, 18], [45 + b, 16, 18], [47 + b, -17, 16], [48 + b, -19, 18], [49 + b, -19, 18], [50 + b, -16, 15]], felt);
  R(mx - 14, 46 + b, 28, 1, feltL); R(mx - 19, 49 + b, 38, 1, feltD); R(mx - 16, 50 + b, 32, 1, feltD);
  for (let x = -18; x <= 17; x += 3) R(mx + x, 48 + b, 2, 1, gold);
  R(mx - 19, 44 + b, 1, 2, gold); R(mx + 18, 44 + b, 1, 2, gold);

  // instrument et bras
  if (kind === 'guitar') {
    const strum = [0, 2, 1, -1][Math.floor(now / 110) % 4];
    const slide = [0, -2, -4, -2][Math.floor(now / 880) % 4];
    const neckY = (x) => 83 + b - (-6 - x) * 0.62;
    // manche et tête
    for (const pass of [0, 1]) for (let x = -6; x >= -27; x--) {
      const y = neckY(x);
      if (pass) { R(mx + x, y, 1, 3, '#5a3a20'); R(mx + x, y + 1, 1, 1, '#8a6a48'); if (x % 4 === 0) R(mx + x, y, 1, 1, '#e8d8b0'); } else R(mx + x - 1, y - 1, 3, 5, OUT);
    }
    blob([[65 + b, -31, -29], ...span(66 + b, 68 + b, -32, -27), [69 + b, -31, -28]], '#8a5a30');
    R(mx - 31, 67 + b, 3, 1, '#5a3a20');
    for (const [dx, dy] of [[-33, 66], [-33, 68], [-30, 64], [-28, 65]]) R(mx + dx, dy + b, 1, 1, silver);
    // caisse
    S.disc(ctx, mx + 4, 91 + b, 9, OUT); S.disc(ctx, mx - 3, 85 + b, 7, OUT);
    S.disc(ctx, mx + 4, 91 + b, 8, '#c8783c'); S.disc(ctx, mx - 3, 85 + b, 6, '#c8783c');
    S.disc(ctx, mx - 4, 84 + b, 4, '#dc9450'); S.disc(ctx, mx + 6, 93 + b, 5, '#b8692e');
    S.disc(ctx, mx, 88 + b, 3, gold); S.disc(ctx, mx, 88 + b, 2, '#2a1810');
    R(mx + 4, 93 + b, 5, 2, '#3a2214');
    for (let k = 0; k <= 10; k++) R(mx + 5 - k, 93 + b - k * 0.62, 1, 1, 'rgba(240,228,200,0.6)');
    // bras droit qui gratte, bras gauche sur le manche
    const hy = 87 + b + strum;
    limb([[8, 67 + b], [12, 79 + b], [7, hy]], 4, suit);
    hand(5, hy);
    const fx = -20 + slide;
    limb([[-11, 67 + b], [-16, 78 + b], [fx - 1, neckY(fx) + 1]], 4, suit);
    hand(fx - 1, Math.round(neckY(fx)));
    return { x: mx + 6, y: 80 + b };
  }
  if (kind === 'trumpet') {
    const ty = b + (trumpetUp ? 0 : 3);
    const press = trumpetUp ? Math.floor(now / 210) % 3 : -1;
    // bras derrière l'instrument, mains par-dessus
    limb([[8, 67 + b], [13, 77 + b], [7, 63 + ty]], 4, suit);
    limb([[-11, 67 + b], [-14, 77 + b], [1, 66 + ty]], 4, suit);
    // coulisse du bas, tube principal, pistons, pavillon
    blob(span(65 + ty, 66 + ty, 3, 13), brassD);
    blob(span(62 + ty, 64 + ty, 3, 3), brass); blob(span(62 + ty, 64 + ty, 13, 13), brass);
    blob(span(60 + ty, 61 + ty, 0, 19), brass);
    R(mx, 60 + ty, 20, 1, brassL);
    blob(span(58 + ty, 63 + ty, 6, 10), brass);
    R(mx + 6, 58 + ty, 1, 6, brassL); R(mx + 10, 58 + ty, 1, 6, brassD);
    for (let i = 0; i < 3; i++) { const py = 55 + ty + (i === press ? 1 : 0); R(mx + 5 + i * 2, py - 1, 3, 4, OUT); R(mx + 6 + i * 2, py, 1, 2, silver); }
    for (const pass of [0, 1]) for (let i = 0; i <= 6; i++) {
      const half = [1, 1, 1, 2, 3, 4, 5][i], x = mx + 19 + i, y0 = 60 + ty - half + 1, h = half * 2;
      if (pass) { R(x, y0, 1, h, i === 6 ? brassL : brass); R(x, y0 + h - 1, 1, 1, brassD); } else R(x - 1, y0 - 1, 3, h + 2, OUT);
    }
    R(mx - 1, 60 + ty, 2, 2, silver); // embouchure
    hand(6, 62 + ty);
    hand(0, 65 + ty);
    return trumpetUp ? { x: mx + 26, y: 56 + ty } : null;
  }
  // maracas secouées en alternance
  const shake = Math.floor(now / 130) % 2;
  for (const [s, up, col] of [[-1, shake, red], [1, 1 - shake, '#3aa858']]) {
    const hx = s < 0 ? -18 : 14, hy = 67 + b - up * 3;
    limb(s < 0 ? [[-11, 67 + b], [-18, 79 + b], [hx + 1, hy + 2]] : [[8, 67 + b], [15, 79 + b], [hx, hy + 2]], 4, suit);
    R(mx + hx, hy - 5, 3, 6, OUT); R(mx + hx + 1, hy - 4, 1, 5, '#7a4a24');
    S.disc(ctx, mx + hx + 1, hy - 8, 4, OUT); S.disc(ctx, mx + hx + 1, hy - 8, 3, col);
    R(mx + hx - 2, hy - 8, 7, 1, '#f8c838'); R(mx + hx - 1, hy - 10, 1, 1, '#ffffff'); R(mx + hx + 1, hy - 6, 3, 1, S.shade(col, -0.3));
    if (up) for (const [dx, dy] of [[-4, -10], [-4, -7], [6, -10], [6, -7]]) R(mx + hx + dx, hy + dy, 1, 1, shirt);
    hand(hx - 1, hy);
  }
  return { x: mx + 2, y: 46 + b };
}

// Note de musique qui s'envole
function note(ctx, x, y, col) {
  ctx.fillStyle = col;
  ctx.fillRect(x, y, 1, 5); ctx.fillRect(x - 2, y + 4, 3, 2); ctx.fillRect(x + 1, y, 2, 1); ctx.fillRect(x + 2, y + 1, 1, 1);
}

// Bougies des niches de la cantina (x de la mèche) et fanions de papel picado (couleur, ombre des découpes)
const CANDLES = [120, 249];
const PICADO = ['#e8508a', '#3aa858', '#f8c838', '#3a8ad8', '#f07830', '#9a5ad8'];
const PICADO_D = PICADO.map((c) => S.shade(c, -0.3));
function candleFlame(ctx, cx, i, now) {
  const { R } = paint(ctx);
  const f = hash(Math.floor(now / 90) + i * 77);
  const h = f < 0.3 ? 3 : 4;
  R(cx, 38 - h, 1, h, '#f8a030'); R(cx, 37, 1, 1, '#fff6c0'); if (f > 0.7) R(cx + 1, 36, 1, 1, '#f8d070');
}

function drawParrot(ctx, x, now) {
  const { R } = paint(ctx);
  R(x, 4, 1, 20, '#3a2a1a'); R(x - 7, 24, 15, 2, OUT); R(x - 6, 24, 13, 1, '#7a4a24');
  const bob = (now % 2600) < 200 ? 1 : 0;
  const flap = (now % 9000) < 700 && Math.floor(now / 90) % 2;
  R(x - 4, 13, 8, 11, OUT); R(x - 3, 14, 6, 9, '#3a9a3a'); R(x - 2, 20, 3, 6, '#3a6ec0');
  if (flap) { R(x - 8, 12, 5, 3, '#3a9a3a'); R(x + 3, 12, 5, 3, '#3a9a3a'); R(x - 9, 11, 2, 2, '#3a6ec0'); R(x + 7, 11, 2, 2, '#3a6ec0'); }
  R(x - 3, 8 + bob, 7, 7, OUT); R(x - 2, 9 + bob, 5, 5, '#c0392b'); R(x + 3, 10 + bob, 2, 3, '#e0b040');
  R(x, 10 + bob, 1, 1, OUT); R(x - 1, 9 + bob, 1, 1, '#f4ecd8');
}

// Prisonnier qui fait les cent pas dans sa cellule
// (arrêté contre les barreaux, il serre ceux de x = 76 et 92, de part et d'autre de son visage)
const PRISON_GRIP = [76, 92];
const PRISONER = { skin: 2, hat: 'none', hatColor: 0, hair: 'messy', hairColor: 1, eyes: 'tired', nose: 'broken', mouth: 'frown', beard: 'stubble', outfit: 'shirt', outfitColor: 5 };

// ------------------------------------------------------------ détails de décor
// Police de 5 pixels de haut pour les écriteaux (W fait 5 de large, le reste 3 ou 4)
const GLYPHS = {
  W: ['k...k', 'k...k', 'k.k.k', 'k.k.k', '.k.k.'], A: ['.k.', 'k.k', 'kkk', 'k.k', 'k.k'], N: ['k..k', 'kk.k', 'k.kk', 'k..k', 'k..k'],
  T: ['kkk', '.k.', '.k.', '.k.', '.k.'], E: ['kkk', 'k..', 'kk.', 'k..', 'kkk'], D: ['kk.', 'k.k', 'k.k', 'k.k', 'kk.'],
  $: ['.kk', 'kk.', '.k.', '.kk', 'kk.'], 0: ['kkk', 'k.k', 'k.k', 'k.k', 'kkk'], 1: ['.k.', 'kk.', '.k.', '.k.', 'kkk'],
  2: ['kk.', '..k', '.k.', 'k..', 'kkk'], 5: ['kkk', 'k..', 'kk.', '..k', 'kk.'],
};
function pixText(R, str, x, y, col) {
  for (const ch of str) {
    const g = GLYPHS[ch];
    if (!g) { x += 2; continue; }
    g.forEach((row, j) => [...row].forEach((c, i) => c === 'k' && R(x + i, y + j, 1, 1, col)));
    x += g[0].length + 1;
  }
}
const textW = (str) => [...str].reduce((w, ch) => w + (GLYPHS[ch] ? GLYPHS[ch][0].length + 1 : 2), -1);

// Avis de recherche (30 × 26) : papier taché au coin corné, clou, « WANTED », portrait au fusain, la prime
function wantedPoster(R, x, y, rnd, reward, mustache) {
  const w = 30, h = 26;
  R(x + 1, y + 1, w + 1, h + 1, 'rgba(0,0,0,0.25)');
  R(x - 1, y - 1, w + 2, h + 2, OUT);
  R(x, y, w, h, '#e4cc94');
  for (let k = 0; k < 30; k++) R(x + Math.floor(rnd() * (w - 2)), y + Math.floor(rnd() * h), 1 + Math.floor(rnd() * 3), 1, rnd() < 0.5 ? '#d4b880' : '#ecd8a8');
  for (let k = 0; k < 2; k++) { const sx = x + 3 + Math.floor(rnd() * 20), sy = y + 4 + Math.floor(rnd() * 16); R(sx, sy, 4, 2, 'rgba(140,100,50,0.2)'); R(sx + 1, sy - 1, 2, 4, 'rgba(140,100,50,0.2)'); }
  // coin corné en bas à droite
  for (let k = 0; k < 4; k++) { R(x + w - 4 + k, y + h - 4 + k, 4 - k, 1, '#c4a46a'); R(x + w - 4 + k, y + h - 4 + k, 1, 1, '#a88a50'); }
  pixText(R, 'WANTED', x + Math.round((w - textW('WANTED')) / 2), y + 3, '#3a2214');
  R(x + 3, y + 9, w - 6, 1, '#8a6a40');
  // portrait : chapeau, yeux, moustache ou barbe, en traits sombres
  const px = x + 9, py = y + 10;
  R(px, py + 1, 12, 9, '#f0dcb0'); R(px - 1, py, 14, 1, '#8a6a40'); R(px - 1, py + 10, 14, 1, '#8a6a40');
  R(px + 1, py + 3, 10, 1, '#4a3420'); R(px + 3, py + 1, 6, 2, '#4a3420');
  R(px + 3, py + 5, 2, 1, '#4a3420'); R(px + 7, py + 5, 2, 1, '#4a3420');
  if (mustache) { R(px + 3, py + 7, 6, 1, '#4a3420'); R(px + 2, py + 8, 1, 1, '#4a3420'); R(px + 9, py + 8, 1, 1, '#4a3420'); }
  else for (let k = 0; k < 4; k++) R(px + 3 + k * 2, py + 7 + (k % 2), 1, 2, '#6a5030');
  pixText(R, reward, x + Math.round((w - textW(reward)) / 2), y + 20, '#8a2a1a');
  // clou
  R(x + w / 2 - 1, y - 1, 3, 3, OUT); R(x + w / 2, y, 1, 1, '#b8bec6');
}

// Râtelier à fusils : fronton chantourné, barre à encoches, socle à logements, quatre armes différentes, chaîne et cadenas
function gunRack(bg, R, box, rx, ry) {
  const rw = 48, STEEL = '#9aa0a8', STEEL_D = '#4a4f58';
  box(rx, ry + 6, rw, 62, '#4a2a14');
  for (let x = rx + 6; x < rx + rw; x += 8) { R(x, ry + 6, 1, 62, '#3a2010'); R(x + 1, ry + 6, 1, 62, '#56321a'); }
  // fronton
  box(rx - 2, ry, rw + 4, 7, '#6a3e1e'); R(rx - 2, ry, rw + 4, 1, '#8a5a30'); R(rx - 2, ry + 6, rw + 4, 1, '#4a2a14');
  box(rx + 14, ry - 5, 20, 5, '#6a3e1e'); R(rx + 14, ry - 5, 20, 1, '#8a5a30');
  for (const dx of [6, 42]) { S.disc(bg, rx + dx, ry + 3, 2, '#4a2a14'); S.disc(bg, rx + dx, ry + 3, 1, '#8a5a30'); }
  S.disc(bg, rx + 24, ry - 1, 3, OUT); S.disc(bg, rx + 24, ry - 1, 2, '#e0b040'); R(rx + 23, ry - 2, 1, 1, '#f8e08a');
  // barre à encoches
  box(rx - 1, ry + 14, rw + 2, 4, '#7a4a24'); R(rx - 1, ry + 14, rw + 2, 1, '#a8703c');
  const guns = [
    { x: rx + 7, wood: ['#9a3e22', '#c4623a'], recv: '#c89a40', tube: true, lever: true },
    { x: rx + 18, wood: ['#8a5228', '#b07038'], recv: '#6e6478', dbl: true },
    { x: rx + 29, wood: ['#5a3420', '#7c4c30'], recv: '#5c626c', scope: true },
    { x: rx + 40, wood: ['#b88a48', '#dcb070'], recv: '#5c626c', tube: true, pump: true },
  ];
  const top = ry + 8, rec = ry + 38;
  for (const g of guns) {
    const x = g.x;
    // canon(s)
    if (g.dbl) { R(x - 2, top - 1, 5, rec - top + 2, OUT); R(x - 1, top, 3, rec - top, STEEL_D); R(x - 1, top, 1, rec - top, STEEL); R(x + 1, top, 1, rec - top, STEEL); }
    else { R(x - 1, top - 1, 3, rec - top + 2, OUT); R(x, top, 1, rec - top, STEEL); }
    if (g.tube) { R(x + 1, top + 8, 2, rec - top - 8, OUT); R(x + 1, top + 9, 1, rec - top - 9, '#6a707a'); }
    if (g.scope) { R(x - 3, top + 14, 3, 12, OUT); R(x - 2, top + 15, 1, 10, '#2a2e36'); R(x - 3, top + 14, 3, 1, '#7a808a'); }
    R(x - 2, ry + 16, 6, 1, OUT); // encoche de la barre
    if (g.pump) { box(x - 1, top + 16, 4, 9, g.wood[0]); for (let k = 0; k < 4; k++) R(x - 1, top + 17 + k * 2, 4, 1, g.wood[1]); }
    // boîte de culasse, levier ou pontet
    box(x - 1, rec, 4, 7, g.recv); R(x - 1, rec, 1, 7, S.shade(g.recv, 0.3));
    if (g.lever) { R(x + 3, rec + 4, 4, 1, OUT); R(x + 6, rec + 4, 1, 6, OUT); R(x + 3, rec + 9, 4, 1, OUT); }
    else { R(x + 3, rec + 4, 2, 1, OUT); R(x + 4, rec + 5, 1, 3, OUT); }
    // crosse : poignée étroite qui s'évase en descendant, plaque de couche noire
    for (let yy = rec + 7; yy < ry + 64; yy++) {
      const k = yy - rec - 7, w = 3 + Math.floor(k / 6), x0 = x - 1 + Math.floor(k / 9);
      R(x0 - 1, yy, w + 2, 1, OUT); R(x0, yy, w, 1, g.wood[0]); R(x0, yy, 1, 1, g.wood[1]);
    }
    R(x - 1, ry + 63, 7, 2, OUT);
  }
  // socle à logements (devant le bas des crosses)
  box(rx - 2, ry + 62, rw + 4, 7, '#7a4a24'); R(rx - 2, ry + 62, rw + 4, 1, '#a8703c');
  for (const g of guns) R(g.x - 1, ry + 63, 6, 1, '#3a2010');
  // chaîne passée devant les armes, et son cadenas
  for (let x = rx; x < rx + rw - 6; x += 3) { const dy = x % 6 < 3 ? 0 : 1; R(x - 1, ry + 33 + dy, 4, 3, OUT); R(x, ry + 34 + dy, 2, 1, '#8a909a'); }
  const lx = rx + rw - 7, ly = ry + 33;
  R(lx, ly - 3, 5, 1, OUT); R(lx, ly - 3, 1, 4, OUT); R(lx + 4, ly - 3, 1, 4, OUT);
  box(lx - 1, ly, 7, 6, '#c8a040'); R(lx - 1, ly, 7, 1, '#f0d070'); R(lx + 2, ly + 2, 1, 2, OUT);
}

// Ceinturon pendu à une patère : cartouchière, étui et crosse du revolver
function gunBelt(R, x, y) {
  R(x - 1, y - 1, 4, 4, OUT); R(x, y, 2, 2, '#a06a3a');
  for (let k = 0; k < 26; k++) {
    const dx = Math.round(Math.sin((k / 26) * Math.PI) * 8);
    R(x - dx - 2, y + 2 + k, 3, 1, OUT); R(x + dx + 1, y + 2 + k, 3, 1, OUT);
    R(x - dx - 1, y + 2 + k, 1, 1, '#7a4a24'); R(x + dx + 2, y + 2 + k, 1, 1, '#7a4a24');
  }
  for (let k = 4; k < 22; k += 3) { const dx = Math.round(Math.sin((k / 26) * Math.PI) * 8); R(x - dx - 1, y + 2 + k, 1, 2, '#e0b040'); }
  // étui avec le revolver
  R(x + 6, y + 18, 8, 14, OUT); R(x + 7, y + 19, 6, 12, '#6a3a1a'); R(x + 7, y + 19, 6, 1, '#8a5a30'); R(x + 8, y + 23, 4, 1, '#4a2410');
  R(x + 8, y + 13, 5, 6, OUT); R(x + 9, y + 14, 3, 4, '#3a2a20'); R(x + 9, y + 14, 1, 4, '#5a4a3a'); R(x + 11, y + 17, 3, 2, OUT);
}

// Tableau au cadre doré : draw(x, y, w, h) peint l'intérieur
function goldFrame(R, x, y, w, h, draw) {
  R(x - 3, y - 3, w + 6, h + 6, OUT); R(x - 2, y - 2, w + 4, h + 4, '#c8a040'); R(x - 2, y - 2, w + 4, 1, '#f0d070'); R(x - 2, y + h + 1, w + 4, 1, '#8a6a20');
  R(x - 1, y - 1, w + 2, h + 2, '#6a4a10');
  draw(x, y, w, h);
}

// Petite flamme de bougie (2 px de large) posée sur le haut d'une bougie en (x, y)
function candleTip(ctx, x, y, now, k) {
  const h = 2 + (hash(Math.floor(now / 110) * 7 + k) < 0.5 ? 1 : 0);
  ctx.fillStyle = '#f8b040'; ctx.fillRect(x, y - h, 2, h);
  ctx.fillStyle = '#fffbe0'; ctx.fillRect(x + (k % 2), y - h + 1, 1, h - 1);
}

// ------------------------------------------------------------ bateau à aubes : le fleuve vu des fenêtres
// La rive boisée et l'eau sont des bandes en cache (motif périodique recopié deux fois : un seul drawImage les
// fait glisser). Elles couvrent le bas des fenêtres, par-dessus le dehors : le ciel de l'ambiance reste visible.
const BANK_P = 160, WATER_P = 128, WHEEL_R = 40;
let RIVER = null;
function riverArt() {
  if (RIVER) return RIVER;
  const rnd = seeded(17);
  const bank = S.makeCanvas(BANK_P * 2, 16), b = bank.getContext('2d'), B = paint(b).R;
  const trees = Array.from({ length: 24 }, () => [Math.floor(rnd() * BANK_P), 3 + Math.floor(rnd() * 4)]);
  for (let j = -1; j <= 2; j++) {
    const o = j * BANK_P;
    for (const [x, r] of trees) S.disc(b, x + o, 12 - r, r, '#3e5a2c');
    for (const [x, r] of trees) S.disc(b, x + o - 1, 11 - r, r - 2, '#56763a');
    // cabane et ponton sur la berge
    B(70 + o, 7, 9, 5, '#d8ccae'); B(69 + o, 6, 11, 1, '#8a3a2a'); B(70 + o, 5, 9, 1, '#8a3a2a'); B(72 + o, 4, 5, 1, '#8a3a2a');
    B(73 + o, 9, 2, 3, '#3a2a1a'); B(76 + o, 2, 1, 3, '#5a4a3a'); B(66 + o, 12, 16, 1, '#6a4a2a');
  }
  B(0, 10, BANK_P * 2, 2, '#34502a');
  B(0, 12, BANK_P * 2, 2, '#8a7450');
  for (let x = 0; x < BANK_P * 2; x += 5) B(x + ((x * 7) % 3), 12, 2, 1, '#a08a60');
  B(0, 14, BANK_P * 2, 2, '#3e4c32'); // reflet sombre de la rive
  for (let x = 0; x < BANK_P * 2; x += 7) B(x, 15, 3, 1, '#58664a');
  const water = S.makeCanvas(WATER_P * 2, 16), wx = water.getContext('2d'), Wr = paint(wx).R;
  const bands = ['#76805e', '#687552', '#5a6848'];
  for (let y = 0; y < 16; y++) Wr(0, y, WATER_P * 2, 1, bands[y < 4 ? 0 : y < 9 ? 1 : 2]);
  for (const y of [4, 9]) for (let x = 0; x < WATER_P * 2; x += 2) Wr(x, y, 1, 1, bands[y < 9 ? 0 : 1]);
  for (let y = 0; y < 16; y++) {
    for (let k = 0; k < 3 + y / 4; k++) {
      const x = Math.floor(rnd() * WATER_P), len = 2 + Math.floor(y / 3) + Math.floor(rnd() * 3), col = rnd() < 0.6 ? '#a4ac84' : '#4a583c';
      for (const o of [-WATER_P, 0, WATER_P]) Wr(x + o, y, len, 1, col);
    }
  }
  // jante de la roue à aubes (invariante par rotation : dessinée une fois), deux cercles
  const c = WHEEL_R + 2, ring = S.makeCanvas(c * 2 + 1, c * 2 + 1), rx = ring.getContext('2d'), Rr = paint(rx).R;
  for (let y = 0; y <= c * 2; y++) for (let x = 0; x <= c * 2; x++) {
    const d = Math.hypot(x - c, y - c);
    if (d >= WHEEL_R - 5 && d <= WHEEL_R + 1) Rr(x, y, 1, 1, d > WHEEL_R || d < WHEEL_R - 4 ? OUT : d > WHEEL_R - 1.5 ? '#d8583a' : '#a8341f');
    else if (d >= 21 && d <= 24) Rr(x, y, 1, 1, d > 23 || d < 22 ? OUT : '#a0321e');
  }
  RIVER = { bank, water, ring, c };
  return RIVER;
}

// Le fleuve dans la fenêtre w (calque de la salle, sous les cadres) ; wheel : la roue à aubes tourne devant ;
// dark : ambiance de nuit
function riverView(ctx, w, i, now, wheel, dark) {
  const A = riverArt(), wy = w.y + 34;
  ctx.save();
  ctx.beginPath(); ctx.rect(w.x, w.y, w.w, w.h); ctx.clip();
  const slide = (c, P, sy, h, dy, speed, alpha = 1) => {
    const off = Math.floor((now * speed + i * 57) % P);
    ctx.globalAlpha = alpha;
    ctx.drawImage(c, 0, sy, c.width, h, w.x - off, dy, c.width, h);
  };
  slide(A.bank, BANK_P, 0, 16, w.y + 18, 0.005);
  slide(A.water, WATER_P, 0, 5, wy, 0.012); slide(A.water, WATER_P, 5, 5, wy + 5, 0.022); slide(A.water, WATER_P, 10, 6, wy + 10, 0.036);
  if (wheel) {
    const { R } = paint(ctx);
    const cx = w.x + w.w - 14, cy = w.y + w.h + 8, a = now / 700;
    for (let k = 0; k < 10; k++) {
      const co = Math.cos(a + (k * TAU) / 10), si = Math.sin(a + (k * TAU) / 10);
      for (let t = 8; t < WHEEL_R - 3; t += 2) R(cx + co * t, cy + si * t, 2, 2, '#7a2416');
    }
    ctx.drawImage(A.ring, cx - A.c, cy - A.c);
    // pales : planches radiales cernées de noir
    for (const pass of [0, 1]) for (let k = 0; k < 10; k++) {
      const co = Math.cos(a + (k * TAU) / 10), si = Math.sin(a + (k * TAU) / 10);
      for (let t = WHEEL_R - 8; t <= WHEEL_R + 3; t++) {
        if (pass) R(cx + co * t - 1, cy + si * t - 1, 2, 2, t > WHEEL_R ? '#8a6038' : '#6a4a2a');
        else R(cx + co * t - 2, cy + si * t - 2, 4, 4, OUT);
      }
    }
    // l'eau repasse devant le bas de la roue, écume et gerbes là où les pales sortent du fleuve
    slide(A.water, WATER_P, 4, 12, wy + 4, 0.036, 0.55);
    ctx.globalAlpha = 1;
    const fx = cx - Math.round(Math.sqrt(WHEEL_R * WHEEL_R - (cy - wy) ** 2));
    for (let k = 0; k < 7; k++) R(fx - 12 + ((k * 5 + Math.floor(now / 90)) % 20), wy + (k % 3), 3, 1, '#e8ecdc');
    for (let k = 0; k < 9; k++) {
      const ph = (now / 650 + k / 9) % 1;
      R(fx - ph * 16 - (k % 3) * 2, wy - Math.sin(ph * Math.PI) * (6 + (k % 4) * 2), 1, 1, '#f4f0e4');
    }
  }
  ctx.globalAlpha = 1;
  // la nuit, le fleuve s'assombrit plus que la salle éclairée
  if (dark) { ctx.fillStyle = 'rgba(12,16,44,0.45)'; ctx.fillRect(w.x, w.y + 18, w.w, w.h - 18); }
  ctx.restore();
}

// Lustre en laiton à deux lampes à pétrole, qui oscille doucement avec le roulis (cx : point d'attache)
const BOAT_LAMPS = [140, 244];
const boatSwing = (now, i) => Math.round(Math.sin(now / 1100 + i * 1.7) * 1.3);
function boatLamp(ctx, cx, dx) {
  const { R } = paint(ctx);
  for (let y = 9; y < 24; y += 2) R(cx + Math.round((dx * (y - 9)) / 15), y, 1, 1, '#8a6a20');
  const x = cx + dx;
  R(x - 11, 27, 23, 3, OUT); R(x - 10, 28, 21, 1, '#c8a040');
  R(x - 2, 23, 5, 8, OUT); R(x - 1, 24, 3, 6, '#c8a040'); R(x - 1, 24, 1, 6, '#f0d070');
  R(x - 1, 31, 3, 3, OUT); R(x, 31, 1, 2, '#a02a24');
  for (const ex of [x - 8, x + 8]) {
    R(ex - 3, 24, 7, 5, OUT); R(ex - 2, 25, 5, 3, '#c8a040'); R(ex - 2, 25, 5, 1, '#f0d070');
    R(ex - 2, 16, 5, 9, OUT); R(ex - 1, 17, 3, 7, '#f0e8d0');
    R(ex - 1, 19, 3, 5, '#f8e08a'); R(ex, 20, 1, 3, '#fffbe0');
  }
}
// flammes des deux lampes (redessinées après la teinte de l'ambiance)
function boatFlames(ctx, x, now, i) {
  for (const [k, ex] of [[0, x - 8], [1, x + 8]]) {
    const f = hash(Math.floor(now / 100) * 5 + i * 2 + k) < 0.4 ? 1 : 0;
    ctx.fillStyle = '#f8e08a'; ctx.fillRect(ex - 1, 19, 3, 5);
    ctx.fillStyle = '#fffbe0'; ctx.fillRect(ex, 20 + f, 1, 3 - f);
  }
}

// ------------------------------------------------------------ grand hôtel : lustre en cristal, champagne
// bougies : [x, haut] (lustre à deux étages, candélabre du piano)
const HOTEL_CANDLES = [[174, 18], [182, 18], [200, 18], [208, 18], [184, 10], [198, 10], [112, 64], [119, 64], [126, 64]];
// pampilles du lustre : [x, haut, longueur]
const HOTEL_DROPS = [[173, 26, 6], [179, 26, 8], [205, 26, 8], [211, 26, 6], [186, 29, 6], [198, 29, 6], [192, 34, 4], [184, 17, 4], [200, 17, 4]];
const COUPE_ROWS = [[4, 86], [3, 80], [2, 74], [1, 68]];
// le bouchon de la bouteille dans le seau à glace saute toutes les 11 s
const POP = 11000;

// ------------------------------------------------------------ les lieux
// windows : ouvertures sur l'extérieur ; lamps(now, room) : sources de lumière animées ; render() : décor fixe
// (bg = fond, mid = premier plan du décor) ; anim() : derrière le premier plan ; front() : devant ;
// lit() : flammes redessinées après la teinte de l'ambiance (une source de lumière ne s'assombrit pas la nuit).
const ROOMS = {
  saloon: {
    name: 'LE SALOON',
    windows: [{ x: 286, y: 20, w: 72, h: 58 }],
    render(bg, mid) {
      const { R, box } = paint(bg);
      const rnd = seeded(3);
      for (let x = 0; x < W; x += 16) {
        const col = (x / 16) % 2 ? '#6a4028' : '#5e3822';
        R(x, 0, 16, 140, col); R(x, 0, 1, 140, '#3a2214'); R(x + 1, 0, 1, 140, S.shade(col, 0.1));
        for (let k = 0; k < 2; k++) R(x + 4 + Math.floor(rnd() * 8), 10 + Math.floor(rnd() * 80), 2, 1, '#3a2214');
        for (let y = 0; y < 140; y += 3) if (rnd() < 0.15) R(x + 2 + Math.floor(rnd() * 13), y, 1, 2, S.shade(col, -0.12));
      }
      R(0, 92, W, 4, '#3a2214'); R(0, 92, W, 1, '#8a5a34'); R(0, 96, W, 44, '#4a2c18');
      for (let x = 6; x < W; x += 42) { R(x, 100, 34, 30, '#3e2414'); R(x + 1, 101, 32, 1, '#5e3a22'); }
      R(0, 0, W, 7, '#2a1810'); R(0, 7, W, 1, OUT); R(0, 5, W, 1, '#4a2c18');
      // le meuble du bar : cadre mouluré, miroir piqué avec ses reflets, deux étagères chargées
      box(10, 10, 108, 72, '#4a2a18');
      R(10, 10, 108, 2, '#6a3e22'); R(10, 10, 2, 72, '#5a3420'); R(116, 10, 2, 72, '#2e1a0e');
      for (let y = 13; y < 37; y++) R(13, y, 102, 1, S.mix('#5a6c74', '#8a9ca4', (y - 13) / 24));
      for (let k = 0; k < 14; k++) R(16 + k * 6 + (k % 3), 14 + ((k * 7) % 18), 2 - (k % 2), 1, '#a8b8bc'); // reflets en biais
      R(18, 16, 22, 1, '#b8c8cc'); R(20, 18, 14, 1, '#a0b0b4'); R(70, 26, 16, 1, '#a0b0b4');
      for (let k = 0; k < 18; k++) R(14 + Math.floor(rnd() * 98), 14 + Math.floor(rnd() * 22), 1, 1, '#4a5458'); // le tain piqué
      const bottleCols = ['#c07a2a', '#4a7a3a', '#7a3a1a', '#9ab8c8', '#d9a040', '#6a2a2a', '#3a5a2a', '#8a5a9a'];
      for (const sy of [38, 64]) {
        // fond d'étagère dans l'ombre
        if (sy === 64) { R(13, 41, 102, 23, '#3a2012'); R(13, 41, 102, 1, '#2a160c'); }
        for (let bx = 14; bx < 108;) {
          // de temps en temps, des verres retournés
          if (sy === 64 && rnd() < 0.18) {
            for (let g = 0; g < 2 && bx < 106; g++) { shape(R, [[bx, sy - 6, 4, 6, '#b8d0dc'], [bx - 1, sy - 1, 6, 1, '#b8d0dc']]); R(bx, sy - 6, 1, 5, '#e8f4f8'); bx += 7; }
            continue;
          }
          const col = bottleCols[Math.floor(rnd() * bottleCols.length)];
          bx += drawBottle(R, bx, sy, BOTTLES[Math.floor(rnd() * BOTTLES.length)], col, rnd) + 2 + Math.floor(rnd() * 3);
        }
        box(10, sy, 108, 3, '#7a4a28'); R(10, sy, 108, 1, '#a8703c'); R(10, sy + 2, 108, 1, '#5a3420');
        // consoles sous l'étagère
        for (const cx of [14, 112]) { R(cx - 1, sy + 3, 4, 5, OUT); R(cx, sy + 3, 2, 4, '#6a3e22'); }
      }
      // affiche WANTED
      box(246, 22, 26, 34, '#d8c088');
      R(249, 25, 20, 3, '#5a3a20'); R(253, 31, 12, 12, '#a88a5a'); R(255, 33, 8, 8, '#7a5a38'); R(256, 30, 6, 3, '#5a3a20');
      R(250, 46, 18, 2, '#5a3a20'); R(252, 50, 14, 1, '#7a5a38'); R(256, 52, 6, 1, '#c84a3a');
      // crâne de bœuf
      const bx = 184, by = 12;
      for (const [x, y, w, h] of [[bx, by, 16, 9], [bx + 3, by + 9, 10, 6], [bx - 10, by - 2, 10, 3], [bx + 16, by - 2, 10, 3], [bx - 12, by - 6, 3, 4], [bx + 25, by - 6, 3, 4]]) R(x - 1, y - 1, w + 2, h + 2, OUT);
      for (const [x, y, w, h] of [[bx, by, 16, 9], [bx + 3, by + 9, 10, 6], [bx - 10, by - 2, 10, 3], [bx + 16, by - 2, 10, 3], [bx - 12, by - 6, 3, 4], [bx + 25, by - 6, 3, 4]]) R(x, y, w, h, '#e8dcc0');
      R(bx + 3, by + 3, 3, 3, OUT); R(bx + 10, by + 3, 3, 3, OUT); R(bx + 6, by + 11, 1, 2, OUT); R(bx + 9, by + 11, 1, 2, OUT);
      // pianola (les touches bougent toutes seules)
      box(254, 94, 76, 34, '#3a2214'); R(252, 91, 80, 4, OUT); R(253, 92, 78, 2, '#5a3422');
      R(258, 98, 68, 12, '#2a1810'); box(280, 99, 24, 8, '#e8dcc0');
      R(262, 100, 12, 6, '#6a4a2a'); R(310, 100, 12, 6, '#6a4a2a');
      // horloge
      box(338, 94, 14, 34, '#6a3a1a'); S.disc(bg, 345, 102, 4, '#f0e0b0'); R(345, 99, 1, 3, OUT); R(345, 102, 2, 1, OUT);
      R(340, 109, 10, 16, '#2a1810');
      // fenêtre : le dehors est découpé
      bg.clearRect(286, 20, 72, 58);
      // premier plan : cadre de fenêtre, comptoir
      const M = paint(mid);
      M.R(281, 15, 82, 5, OUT); M.R(282, 16, 80, 3, '#4a2c18');
      M.R(281, 77, 82, 3, OUT); M.R(281, 15, 6, 66, OUT); M.R(282, 16, 4, 64, '#4a2c18'); M.R(357, 15, 6, 66, OUT); M.R(358, 16, 4, 64, '#4a2c18');
      M.R(320, 20, 2, 58, '#4a2c18'); M.R(286, 48, 72, 2, '#4a2c18');
      M.box(282, 80, 80, 4, '#7a4a28'); M.R(282, 80, 80, 1, '#a8703c');
      M.box(0, 84, 128, 4, '#a8703c'); M.R(0, 84, 128, 1, '#d09858');
      M.box(0, 88, 126, 40, '#5a3018');
      for (let x = 4; x < 120; x += 30) { M.box(x, 94, 24, 26, '#4a2810'); M.R(x + 1, 95, 22, 1, '#6a3a1a'); }
      M.R(0, 122, 126, 2, '#e0b040');
    },
    lamps(now) {
      return [140, 236].map((lx, i) => ({ lx, a: Math.sin(now / 1500 + i * 2) * 0.06, len: 12, r: 46 }));
    },
    anim(ctx, now, room) {
      const { R } = paint(ctx);
      // barman : va-et-vient avec des pauses pour essuyer un verre
      const T = now % 16000;
      const pos = T < 4000 ? smooth(T / 4000) : T < 8000 ? 1 : T < 12000 ? 1 - smooth((T - 8000) / 4000) : 0;
      drawBartender(ctx, Math.round(36 + pos * 54), now, (T > 4000 && T < 8000) || T > 12000);
      // pendule de l'horloge
      const a = Math.sin(now / 520) * 0.4;
      const px = Math.round(345 + Math.sin(a) * 10), py = Math.round(110 + Math.cos(a) * 10);
      for (let k = 0; k <= 10; k++) R(345 + Math.sin(a) * k, 110 + Math.cos(a) * k, 1, 1, '#c8a040');
      S.disc(ctx, px, py + 2, 2, '#e0b040');
      // pianola : touches enfoncées et rouleau perforé qui défile
      R(256, 112, 72, 6, OUT); R(257, 112, 70, 5, '#f4ecd8');
      const beat = Math.floor(now / 140);
      for (let k = 0; k < 23; k++) {
        if (hash(beat * 31 + k) < 0.13) R(257 + k * 3, 113, 2, 4, '#b8b098');
        if (k % 7 !== 2 && k % 7 !== 6) R(259 + k * 3, 112, 2, 3, OUT);
      }
      for (let i = 0; i < 9; i++) R(282 + ((i * 7) % 20), 100 + ((i * 3 + now * 0.006) % 6), 1, 1, '#5a3a20');
    },
    front(ctx, now) {
      // chat sur le comptoir
      const T = now % 30000;
      if (T < 7000) drawCat(ctx, Math.round(-14 + (84 * T) / 7000), 84, 1, now, false);
      else if (T < 13000) drawCat(ctx, 70, 84, 1, now, true);
      else if (T < 20000) drawCat(ctx, Math.round(70 - (84 * (T - 13000)) / 7000), 84, -1, now, false);
      // fumée de cigare sous le plafond (elle repart de la gauche hors champ : pas de bouffée qui surgit au bouclage)
      for (let b = 0; b < 3; b++) {
        const off = (now * 0.004 * (b + 1) + b * 140) % (W + 140) - 70;
        for (let k = 0; k < 5; k++) S.disc(ctx, Math.round(off + k * 14), 22 + b * 9 + Math.round(Math.sin(now / 900 + k) * 2), 6, 'rgba(230,220,200,0.05)');
      }
      drawFly(ctx, 330, 60, now);
    },
  },

  cantina: {
    name: 'LA CANTINA',
    windows: [{ x: 24, y: 20, w: 72, h: 66, arch: true }],
    render(bg, mid) {
      const { R, box } = paint(bg);
      const rnd = seeded(5);
      R(0, 0, W, 128, '#d8a878');
      for (let i = 0; i < 260; i++) R(rnd() * W, rnd() * 92, 2 + rnd() * 4, 1 + rnd() * 2, rnd() < 0.5 ? '#e4b888' : '#c89868');
      for (let i = 0; i < 6; i++) { let x = rnd() * W, y = 10 + rnd() * 60; for (let k = 0; k < 8; k++) { R(x, y, 1, 1, '#a87850'); x += rnd() < 0.5 ? 1 : 0; y += 1; } }
      // poutres (vigas)
      R(0, 0, W, 5, '#6a4024');
      for (let x = 20; x < W; x += 46) { S.disc(bg, x, 7, 5, OUT); S.disc(bg, x, 7, 4, '#7a4a24'); S.disc(bg, x, 7, 2, '#5a3418'); }
      // frise de carreaux peints
      R(0, 90, W, 3, '#a8503a');
      for (let x = 0; x < W; x += 12) for (let y = 93; y < 128; y += 12) {
        const alt = ((x + y) / 12) % 2;
        R(x, y, 12, 12, alt ? '#f0e8d8' : '#e8d8b8'); R(x, y, 12, 1, '#a89878'); R(x, y, 1, 12, '#a89878');
        R(x + 4, y + 4, 4, 4, alt ? '#3a6ec0' : '#e0b040'); R(x + 5, y + 2, 2, 8, alt ? '#3a6ec0' : '#c0392b'); R(x + 2, y + 5, 8, 2, alt ? '#3a6ec0' : '#c0392b');
      }
      // niches à bougie (la bougie tombe dans un creux entre deux fanions de la seconde guirlande)
      for (const nx of CANDLES.map((cx) => cx - 6)) { R(nx, 30, 14, 18, '#a87850'); R(nx + 1, 28, 12, 2, '#a87850'); R(nx + 3, 27, 8, 1, '#a87850'); R(nx + 1, 46, 12, 2, '#8a5a34'); }
      // guirlande de piments, sombrero au mur, étagère à jarres
      R(270, 6, 1, 8, '#5a3a20');
      for (let k = 0; k < 9; k++) { const y = 14 + k * 5; box(266 + (k % 2) * 4, y, 4, 5, '#c0392b'); R(267 + (k % 2) * 4, y, 1, 1, '#4a7a3a'); }
      box(346, 26, 24, 4, '#e8d4a0'); box(352, 18, 12, 9, '#e8d4a0'); R(352, 24, 12, 2, '#3a9a3a'); R(346, 28, 24, 1, '#c0392b');
      box(334, 68, 46, 3, '#7a4a24');
      for (const [x, h, c] of [[338, 12, '#b8603a'], [350, 16, '#c8783c'], [364, 10, '#a85030']]) { box(x, 68 - h, 10, h, c); R(x + 2, 68 - h, 6, 2, S.shade(c, -0.3)); R(x + 1, 66 - h / 2, 8, 1, '#f0e0c0'); }
      // fenêtre en arc : embrasure, puis découpe du dehors
      const w = ROOMS.cantina.windows[0], cx = w.x + w.w / 2, r = w.w / 2;
      for (let x = w.x - 6; x < w.x + w.w + 6; x++) {
        const d = x + 0.5 - cx, top = w.y + r - Math.sqrt(Math.max(0, (r + 6) ** 2 - d * d));
        R(x, top, 1, w.y + w.h + 2 - top, '#b88858');
      }
      for (let x = w.x; x < w.x + w.w; x++) {
        const d = x + 0.5 - cx, top = Math.round(w.y + r - Math.sqrt(Math.max(0, r * r - d * d)));
        bg.clearRect(x, top, 1, w.y + w.h - top);
      }
      const M = paint(mid);
      M.box(w.x - 8, w.y + w.h, w.w + 16, 4, '#8a5a34');
      // grille en fer forgé
      for (let x = w.x + 8; x < w.x + w.w; x += 10) {
        const d = x + 0.5 - cx, top = Math.round(w.y + r - Math.sqrt(Math.max(0, r * r - d * d)));
        M.R(x, top, 2, w.y + w.h - top, '#2a2622');
      }
      M.R(w.x, w.y + 40, w.w, 2, '#2a2622');
    },
    lamps() { return CANDLES.map((cx) => ({ x: cx + 1, y: 36, r: 26 })); },
    anim(ctx, now, room) {
      const { R } = paint(ctx);
      // bougies
      CANDLES.forEach((cx, i) => { R(cx - 1, 38, 3, 8, '#f4ecd8'); R(cx - 1, 38, 1, 8, '#d8d0c0'); candleFlame(ctx, cx, i, now); });
      const src = drawMariachi(ctx, 300, now, room?.band);
      // notes qui s'envolent de l'instrument (ou de sa bouche quand il chante)
      if (src) for (let i = 0; i < 3; i++) {
        const ph = ((now / 2200) + i / 3) % 1;
        ctx.globalAlpha = 1 - ph;
        note(ctx, Math.round(src.x + Math.sin(ph * 6 + i) * 6 + i * 6), Math.round(src.y - ph * 44), ['#f8d070', '#f4ecd8', '#e8508a'][i]);
        ctx.globalAlpha = 1;
      }
    },
    lit(ctx, now) { CANDLES.forEach((cx, i) => candleFlame(ctx, cx, i, now)); },
    front(ctx, now) {
      // guirlandes de papel picado qui ondulent
      const cols = PICADO, dark = PICADO_D;
      for (const [y0, sag, off] of [[8, 10, 0], [28, 8, 8]]) {
        const yAt = (x) => y0 + sag * (1 - ((x - 192) / 192) ** 2);
        ctx.fillStyle = '#5a3a20';
        for (let x = 0; x < W; x += 2) ctx.fillRect(x, Math.round(yAt(x)), 2, 1);
        for (let i = 0, x = 4 + off; x < W - 8; x += 16, i++) {
          const y = Math.round(yAt(x + 5)) + 1;
          const dx = Math.round(Math.sin(now / 320 + i * 1.3) * 1.2);
          const h = 11 - (Math.sin(now / 260 + i * 1.7) > 0.6 ? 2 : 0);
          const c = (i + off) % cols.length;
          ctx.fillStyle = cols[c]; ctx.fillRect(x + dx, y, 11, h);
          ctx.fillStyle = dark[c];
          ctx.fillRect(x + dx + 3, y + 3, 1, 1); ctx.fillRect(x + dx + 7, y + 3, 1, 1); ctx.fillRect(x + dx + 5, y + 5, 1, 2); ctx.fillRect(x + dx + 3, y + 7, 1, 1); ctx.fillRect(x + dx + 7, y + 7, 1, 1);
          for (let k = 0; k < 11; k += 2) ctx.fillRect(x + dx + k, y + h, 1, 1);
        }
      }
      // le perroquet sur son perchoir, devant la première guirlande (derrière, ses fanions le cachaient)
      drawParrot(ctx, 104, now);
      drawFly(ctx, 70, 60, now, 2);
    },
  },

  train: {
    name: 'LE WAGON-BAR DU TRAIN',
    windows: [{ x: 14, y: 30, w: 90, h: 50, train: true }, { x: 280, y: 30, w: 90, h: 50, train: true }],
    render(bg, mid) {
      const { R, box } = paint(bg);
      const rnd = seeded(7);
      // boiseries en acajou
      R(0, 0, W, 128, '#5a2418');
      for (let x = 0; x < W; x += 32) { R(x, 18, 1, 74, '#3a160e'); R(x + 1, 18, 1, 74, '#6a3020'); }
      for (let i = 0; i < 120; i++) R(rnd() * W, 18 + rnd() * 74, 3 + rnd() * 6, 1, '#4e2014');
      // plafond surélevé et ses petites vitres ambrées
      R(0, 0, W, 14, '#3a1a10'); R(0, 14, W, 2, '#c8a040'); R(0, 16, W, 2, '#2a120a');
      for (let x = 12; x < W; x += 40) { box(x, 3, 18, 7, '#d8a048'); R(x + 1, 4, 16, 2, '#f0c868'); R(x + 9, 3, 1, 7, '#3a1a10'); }
      // lambris et main courante en laiton
      R(0, 90, W, 3, '#c8a040'); R(0, 93, W, 35, '#4a1c12');
      for (let x = 6; x < W; x += 42) {
        box(x, 98, 34, 24, '#3e180e'); R(x + 1, 99, 32, 1, '#6a3020'); R(x + 1, 99, 1, 22, '#5a2618');
        box(x + 5, 102, 24, 16, '#4a1c12'); R(x + 5, 102, 24, 1, '#6a3020'); R(x + 5, 117, 24, 1, '#2a0e08');
        for (const [dx, dy] of [[2, 1], [31, 1], [2, 21], [31, 21]]) R(x + dx, 98 + dy, 1, 1, '#e0b040');
      }
      // porte-bagages
      for (const [x0, x1] of [[6, 112], [272, 378]]) { R(x0, 22, x1 - x0, 1, '#c8a040'); R(x0, 26, x1 - x0, 1, '#c8a040'); for (let x = x0; x < x1; x += 12) R(x, 22, 1, 5, '#a88030'); }
      // pilastres moulurés de part et d'autre des fenêtres, chapiteaux en laiton
      for (const x of [106, 272]) {
        box(x, 20, 6, 70, '#4a1c12'); R(x, 20, 1, 70, '#7a3424'); R(x + 5, 20, 1, 70, '#2a0e08');
        box(x - 1, 19, 8, 3, '#c8a040'); box(x - 1, 86, 8, 3, '#c8a040');
      }
      // tableaux : une locomotive dans la prairie, et la carte de la ligne
      goldFrame(R, 116, 46, 26, 20, (x, y, w, h) => {
        for (let j = 0; j < h; j++) R(x, y + j, w, 1, j < 12 ? S.mix('#e8a868', '#f8d8a0', j / 12) : S.mix('#8a9a4a', '#6a7a3a', (j - 12) / 8));
        S.disc(bg, x + 21, y + 4, 2, '#fff0c0');
        R(x + 2, y + 12, 22, 1, '#5a4a3a');
        R(x + 6, y + 7, 9, 4, '#2a2420'); R(x + 13, y + 5, 2, 2, '#2a2420'); R(x + 7, y + 6, 3, 1, '#2a2420'); R(x + 15, y + 9, 3, 2, '#2a2420');
        R(x + 7, y + 11, 2, 1, '#1a1410'); R(x + 11, y + 11, 2, 1, '#1a1410'); R(x + 17, y + 10, 1, 1, '#c03020');
        for (let k = 0; k < 4; k++) S.disc(bg, x + 13 - k * 3, y + 3 - (k > 1 ? 1 : 0), k > 1 ? 2 : 1, '#f4ecd8');
      });
      goldFrame(R, 244, 46, 24, 20, (x, y, w, h) => {
        R(x, y, w, h, '#e8d4a0');
        for (let k = 0; k < 10; k++) R(x + Math.floor(rnd() * (w - 2)), y + Math.floor(rnd() * h), 2, 1, '#d4bc88');
        const pts = [[2, 15], [7, 12], [10, 13], [14, 8], [18, 9], [21, 4]];
        for (let i = 0; i < pts.length - 1; i++) {
          const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
          for (let t = 0; t <= 1; t += 0.12) if (Math.round(t * 8) % 2) R(x + ax + (bx - ax) * t, y + ay + (by - ay) * t, 1, 1, '#3a2214');
        }
        for (const [px, py] of [pts[0], pts[3], pts[5]]) { R(x + px - 1, y + py - 1, 3, 3, OUT); R(x + px, y + py, 1, 1, '#c0392b'); }
        R(x + 2, y + 2, 7, 1, '#7a5a38'); R(x + 13, y + 16, 8, 1, '#7a5a38');
      });
      // rivets sur la bande dorée du plafond
      for (let x = 6; x < W; x += 12) R(x, 15, 1, 1, '#f8e08a');
      // médaillon au-dessus de l'adversaire
      S.disc(bg, 192, 30, 9, OUT); S.disc(bg, 192, 30, 8, '#c8a040'); S.disc(bg, 192, 30, 6, '#8a6a20');
      R(188, 28, 9, 4, '#c8a040'); R(190, 26, 5, 8, '#c8a040');
      // fenêtres aux coins arrondis
      for (const w of ROOMS.train.windows) {
        box(w.x - 5, w.y - 5, w.w + 10, w.h + 10, '#3a160e');
        bg.clearRect(w.x, w.y, w.w, w.h);
        for (const [cx, cy] of [[w.x, w.y], [w.x + w.w - 2, w.y], [w.x, w.y + w.h - 2], [w.x + w.w - 2, w.y + w.h - 2]]) R(cx, cy, 2, 2, '#3a160e');
      }
      const M = paint(mid);
      for (const w of ROOMS.train.windows) {
        M.box(w.x - 4, w.y + w.h + 2, w.w + 8, 3, '#c8a040');
        // rideaux de velours retenus par des embrasses
        for (const side of [0, 1]) {
          const x0 = side ? w.x + w.w - 6 : w.x - 8;
          for (let y = w.y - 6; y < w.y + w.h + 2; y++) {
            const u = (y - w.y + 6) / (w.h + 8);
            const ww = Math.round(14 - 9 * Math.sin(Math.min(1, u * 1.6) * Math.PI * 0.5) + (u > 0.6 ? (u - 0.6) * 12 : 0));
            const x = side ? x0 + 14 - ww : x0;
            M.R(x - 1, y, ww + 2, 1, OUT); M.R(x, y, ww, 1, (y % 4) ? '#8a1a1a' : '#6a1010');
          }
          M.box(side ? x0 + 6 : x0 + 2, w.y + 26, 6, 3, '#e0b040');
        }
        M.box(w.x - 8, w.y - 8, w.w + 16, 4, '#6a1010');
      }
    },
    lamps(now) {
      return [130, 254].map((lx, i) => ({ lx, a: Math.sin(now / 700 + i * 0.6) * 0.16, len: 6, top: 18, r: 40 }));
    },
    sway(now) { return Math.round(Math.sin(now / 260) * 0.7 + ((now % 1150) < 70 ? 1 : 0)); },
    anim(ctx, now) {
      const { box } = paint(ctx);
      // valises sur le porte-bagages, secouées aux joints des rails
      const jolt = (k) => ((now + k * 230) % 1150 < 80 ? -1 : 0);
      for (const [k, x, w, h, c] of [[0, 12, 22, 9, '#7a4a24'], [1, 40, 16, 12, '#3a5a6a'], [2, 64, 26, 8, '#8a3a2a'], [3, 286, 20, 10, '#5a5a3a'], [4, 316, 28, 9, '#7a4a24'], [5, 352, 16, 12, '#4a3a5a']]) {
        box(x, 22 - h + jolt(k), w, h, c);
        ctx.fillStyle = '#e0b040'; ctx.fillRect(x + Math.round(w / 2) - 1, 22 - h + jolt(k) + 1, 3, 1);
      }
    },
    front(ctx, now) { drawFly(ctx, 210, 70, now, 1); },
  },

  prison: {
    name: 'LE BUREAU DU SHÉRIF',
    windows: [{ x: 306, y: 18, w: 60, h: 42 }],
    render(bg, mid) {
      const { R, box } = paint(bg);
      const rnd = seeded(11);
      // murs en pierre : moellons ombrés par-dessous, piqués, quelques fissures, suie sous le plafond
      R(0, 0, W, 92, '#6a6458');
      for (let y = 0, row = 0; y < 92; y += 12, row++) {
        for (let x = -(row % 2) * 13; x < W;) {
          const w = 20 + Math.floor(rnd() * 10);
          const c = ['#9a9080', '#a49a88', '#8e8676', '#a89e8a', '#948a78'][Math.floor(rnd() * 5)];
          R(x + 1, y + 1, w - 1, 11, c); R(x + 1, y + 1, w - 1, 1, S.shade(c, 0.12)); R(x + 1, y + 1, 1, 10, S.shade(c, 0.06));
          R(x + 1, y + 11, w - 1, 1, S.shade(c, -0.14)); R(x + w - 1, y + 2, 1, 9, S.shade(c, -0.1));
          for (let k = 0; k < 3; k++) R(x + 2 + Math.floor(rnd() * (w - 4)), y + 3 + Math.floor(rnd() * 7), 1, 1, S.shade(c, -0.2));
          if (rnd() < 0.08) { let cx = x + 3 + Math.floor(rnd() * (w - 6)); for (let k = 0; k < 7; k++) { R(cx, y + 2 + k, 1, 1, '#5a5448'); cx += rnd() < 0.5 ? 1 : -1; } }
          if (rnd() < 0.06) R(x + 1, y + 10, 4 + Math.floor(rnd() * 5), 2, '#6a7a4a'); // mousse dans un joint
          x += w;
        }
      }
      for (let y = 0; y < 14; y++) R(0, y, W, 1, `rgba(26,16,8,${(0.42 * (1 - y / 14)).toFixed(3)})`);
      // poutre du plafond et ses corbeaux
      box(0, 0, W, 5, '#4a2c18'); R(0, 0, W, 1, '#6a4024');
      for (const x of [140, 300]) { box(x, 5, 8, 4, '#4a2c18'); R(x + 1, 9, 6, 1, OUT); }
      R(0, 92, W, 3, '#3a2214'); R(0, 95, W, 33, '#5a3a20');
      for (let x = 0; x < W; x += 12) R(x, 95, 1, 33, '#4a2c18');
      // cellule : mur du fond plus sombre, couchette
      R(0, 8, 118, 120, '#4a463e');
      for (let y = 8; y < 120; y += 10) for (let x = (y / 10) % 2 ? 0 : 11; x < 118; x += 22) R(x, y, 1, 10, '#3a3630');
      for (let y = 18; y < 120; y += 10) R(0, y, 118, 1, '#3a3630');
      box(6, 98, 60, 8, '#6a6a5a'); R(6, 98, 60, 2, '#8a8a7a'); R(10, 106, 3, 14, '#3a3630'); R(58, 106, 3, 14, '#3a3630');
      box(84, 108, 10, 10, '#6a5a3a'); R(84, 110, 10, 1, '#4a3a2a');
      // étoile du shérif
      const sx = 192, sy = 18;
      S.disc(bg, sx, sy, 7, OUT); S.disc(bg, sx, sy, 6, '#e0b040');
      for (const [dx, dy] of [[0, -8], [7, -3], [5, 7], [-5, 7], [-7, -3]]) { R(sx + dx - 1, sy + dy - 1, 3, 3, OUT); R(sx + dx, sy + dy, 1, 1, '#e0b040'); }
      S.disc(bg, sx, sy, 2, '#c09020');
      // râtelier à fusils, ceinturon pendu à côté
      gunRack(bg, R, box, 248, 20);
      gunBelt(R, 222, 28);
      // avis de recherche sous la fenêtre
      wantedPoster(R, 302, 65, rnd, '$500', true);
      wantedPoster(R, 338, 66, rnd, '$1200', false);
      // fenêtre à barreaux
      box(302, 14, 68, 50, '#4a463e');
      bg.clearRect(306, 18, 60, 42);
      const M = paint(mid);
      for (const x of [318, 330, 342, 354]) M.box(x, 18, 2, 42, '#3a3e44');
      M.box(302, 60, 68, 3, '#5a5a52');
      // barreaux de la cellule et porte
      for (let x = 4; x < 118; x += 8) { M.R(x - 1, 8, 4, 120, OUT); M.R(x, 8, 2, 120, '#4a4f58'); M.R(x, 8, 1, 120, '#7a808a'); }
      for (const y of [20, 100]) { M.R(0, y - 1, 120, 5, OUT); M.R(0, y, 120, 3, '#4a4f58'); }
      M.box(96, 58, 8, 10, '#3a3e44'); M.R(99, 62, 2, 3, OUT);
      M.R(118, 0, 3, 128, OUT); M.R(0, 7, 121, 2, OUT);
    },
    // (la lampe pend juste sous la poutre, dont le bas est à y = 5)
    lamps(now) { return [{ lx: 236, a: Math.sin(now / 1800) * 0.05, len: 12, top: 6, r: 46 }]; },
    anim(ctx, now) {
      // le prisonnier fait les cent pas, puis s'agrippe aux barreaux
      const T = now % 14000;
      const pos = T < 4000 ? smooth(T / 4000) : T < 7000 ? 1 : T < 11000 ? 1 - smooth((T - 7000) / 4000) : 0;
      const walking = (T < 4000) || (T > 7000 && T < 11000);
      const x = Math.round(8 + pos * 52), bob = walking && Math.floor(now / 180) % 2 ? 1 : 0;
      const spr = S.characterSprite(PRISONER, { blink: (now % 3700) < 120, t: now });
      ctx.drawImage(spr, x, 48 + bob);
      // avant-bras levés vers les barreaux (derrière eux : seules les mains passent devant, voir front)
      if (T > 4300 && T < 6800) for (const bx of PRISON_GRIP) { shape(paint(ctx).R, [[bx - 1, 81, 4, 9, '#d9c49a']]); ctx.fillStyle = '#b8a47a'; ctx.fillRect(bx + 2, 81, 1, 9); }
    },
    front(ctx, now) {
      const { R } = paint(ctx);
      // les mains du prisonnier serrent deux barreaux, de part et d'autre de son visage
      const T = now % 14000;
      if (T > 4300 && T < 6800) for (const bx of PRISON_GRIP) { shape(R, [[bx - 1, 78, 4, 4, '#d19a6a']]); R(bx - 1, 81, 4, 1, '#a87448'); R(bx, 78, 1, 3, '#a87448'); }
      // trousseau de clés qui se balance au clou, pendu à son anneau par un crochet
      const a = Math.sin(now / 900) * 0.3;
      const kx = Math.round(130 + Math.sin(a) * 9), ky = Math.round(47 + Math.cos(a) * 9);
      for (let k = 1; k <= 6; k++) R(130 + Math.sin(a) * k, 47 + Math.cos(a) * k, 1, 1, '#5a5448');
      R(129, 46, 3, 2, OUT);
      S.disc(ctx, kx, ky, 3, OUT); S.disc(ctx, kx, ky, 2, '#c8a040'); S.disc(ctx, kx, ky, 1, '#4a463e');
      for (const d of [-2, 2]) { R(kx + d, ky + 3, 1, 6, '#c8a040'); R(kx + d, ky + 8, 2, 1, '#c8a040'); }
      // un courant d'air soulève les coins des avis de recherche : le coin corné se replie plus grand
      for (const [i, px, py] of [[0, 302, 65], [1, 338, 66]]) {
        if (Math.sin(now / 240 + i * 2) <= 0.55) continue;
        for (let k = 0; k < 6; k++) { R(px + 24 + k, py + 20 + k, 6 - k, 1, '#c4a46a'); R(px + 24 + k, py + 20 + k, 1, 1, '#8a6a40'); }
        R(px + 25, py + 19, 5, 1, '#b8985c'); // ombre portée du rabat sur l'affiche
      }
      drawFly(ctx, 200, 48, now, 3);
    },
  },

  bateau: {
    name: 'LE BATEAU À AUBES',
    windows: [{ x: 16, y: 28, w: 88, h: 50 }, { x: 280, y: 28, w: 88, h: 50 }],
    render(bg, mid) {
      const { R, box } = paint(bg);
      const rnd = seeded(13);
      // cloisons en lattes peintes en blanc cassé
      R(0, 0, W, 128, '#e6dcc2');
      for (let x = 0; x < W; x += 6) { R(x, 12, 1, 76, '#cfc2a4'); R(x + 1, 12, 1, 76, '#f0e8d4'); }
      for (let i = 0; i < 40; i++) R(rnd() * W, 14 + rnd() * 72, 1, 2 + rnd() * 4, '#d8ccb0');
      // plafond à poutres, frise dorée, lambrequin découpé en arcades (la dentelle de bois des vapeurs)
      R(0, 0, W, 10, '#d8ccb0');
      for (let x = 0; x < W; x += 32) { R(x, 0, 4, 10, '#c4b494'); R(x, 0, 1, 10, '#a89878'); }
      R(0, 10, W, 2, '#c8a040'); R(0, 10, W, 1, '#f0d070');
      for (let x = 0; x < W; x++) {
        const u = ((((x - 16) % 32) + 32) % 32 - 16) / 16, bot = 15 + Math.round(7 * u * u);
        R(x, 12, 1, bot - 12, '#f4ecd8'); R(x, bot, 1, 1, '#c8a040'); R(x, bot + 1, 1, 1, '#a89060');
      }
      for (let x = 16; x < W; x += 32) {
        R(x - 7, 16, 2, 2, '#b8a888'); R(x + 6, 16, 2, 2, '#b8a888'); // jours ajourés
        R(x - 1, 22, 3, 4, OUT); R(x, 23, 1, 2, '#e0b040'); // pendeloques
      }
      // lambris d'acajou sous une main courante en laiton
      R(0, 88, W, 3, '#c8a040'); R(0, 88, W, 1, '#f0d070'); R(0, 91, W, 37, '#5a2418');
      for (let x = 4; x < W; x += 38) {
        box(x, 96, 30, 26, '#4a1c12'); R(x, 96, 30, 1, '#7a3424'); R(x, 96, 1, 26, '#6a2a1c');
        R(x + 4, 100, 22, 18, '#5a2418'); R(x + 4, 100, 22, 1, '#3a140c'); R(x + 4, 117, 22, 1, '#7a3424');
        for (const [dx, dy] of [[2, 2], [27, 2], [2, 23], [27, 23]]) R(x + dx, 96 + dy, 1, 1, '#e0b040');
      }
      // pilastres cannelés entre les fenêtres
      for (const x of [110, 266]) {
        box(x, 26, 8, 60, '#f0e8d4'); R(x + 2, 29, 1, 54, '#d0c4a8'); R(x + 5, 29, 1, 54, '#d0c4a8'); R(x + 7, 26, 1, 60, '#c8bca0');
        box(x - 1, 25, 10, 3, '#c8a040'); box(x - 1, 85, 10, 3, '#c8a040');
      }
      // barre du navire au-dessus de l'adversaire : poignées cernées, jante, moyeu en laiton
      const hx = 192, hy = 27, wood = '#8a5a34';
      const spokes = Array.from({ length: 8 }, (_, k) => [Math.cos((k * TAU) / 8 + 0.2), Math.sin((k * TAU) / 8 + 0.2)]);
      for (const [co, si] of spokes) for (let t = 9; t <= 13; t++) R(hx + co * t - 1, hy + si * t - 1, 4, 4, OUT);
      S.disc(bg, hx, hy, 9, OUT); S.disc(bg, hx, hy, 8, wood); S.disc(bg, hx, hy, 6, OUT); S.disc(bg, hx, hy, 5, '#e6dcc2');
      for (const [co, si] of spokes) for (let t = 1; t <= 13; t++) if (t < 6 || t > 8) R(hx + co * t, hy + si * t, 2, 2, t > 8 ? '#a8703c' : wood);
      S.disc(bg, hx, hy, 2, OUT); S.disc(bg, hx, hy, 1, '#e0b040');
      // bouée de sauvetage, rouge et blanche
      const bx = 128, by = 56;
      for (let y = -10; y <= 10; y++) for (let x = -10; x <= 10; x++) {
        const d = Math.hypot(x, y);
        if (d > 9.6 || d < 3.6) continue;
        const q = Math.floor(((Math.atan2(y, x) + TAU + Math.PI / 4) % TAU) / (Math.PI / 2)) % 2;
        R(bx + x, by + y, 1, 1, d > 8.6 || d < 4.6 ? OUT : q ? '#c83a2a' : '#f4ecd8');
      }
      R(bx - 1, by - 13, 3, 4, OUT); R(bx, by - 12, 1, 2, '#8a6a40');
      // tableau : un vapeur sur le fleuve
      goldFrame(R, 228, 46, 30, 18, (x, y, w, h) => {
        for (let j = 0; j < h; j++) R(x, y + j, w, 1, j < 12 ? S.mix('#e8b878', '#f8e0b0', j / 12) : S.mix('#7a8a6a', '#5a6a4a', (j - 12) / 6));
        R(x, y + 11, w, 1, '#4a5a34');
        R(x + 3, y + 12, 24, 2, '#f4ecd8'); R(x + 5, y + 14, 20, 1, '#a89878'); // coque
        R(x + 6, y + 9, 18, 3, '#e8dcc0'); for (let k = 0; k < 8; k++) R(x + 7 + k * 2, y + 10, 1, 1, '#7a6a5a'); // ponts
        R(x + 12, y + 6, 6, 3, '#f4ecd8'); R(x + 13, y + 7, 4, 1, '#5a6a7a'); // timonerie
        R(x + 8, y + 1, 1, 8, '#2a2420'); R(x + 21, y + 1, 1, 8, '#2a2420'); R(x + 7, y + 1, 3, 1, '#2a2420'); R(x + 20, y + 1, 3, 1, '#2a2420');
        for (let k = 0; k < 3; k++) { R(x + 4 - k * 2, y - k % 2, 3, 2, '#d8d0c0'); R(x + 17 - k * 2, y + (k % 2), 3, 2, '#d8d0c0'); }
        S.disc(bg, x + 15, y + 12, 2, '#a02a24'); // tambour de la roue
        R(x + 1, y + 16, 5, 1, '#9aa47c'); R(x + 20, y + 15, 6, 1, '#9aa47c');
      });
      // fenêtres : le dehors est découpé (le fleuve est dessiné par-dessus, dans anim)
      for (const w of ROOMS.bateau.windows) bg.clearRect(w.x, w.y, w.w, w.h);
      const M = paint(mid);
      for (const w of ROOMS.bateau.windows) {
        M.box(w.x - 4, w.y - 4, w.w + 8, 3, '#f0e8d4'); M.R(w.x - 4, w.y - 4, w.w + 8, 1, '#c8a040');
        M.box(w.x - 4, w.y - 1, 3, w.h + 2, '#f0e8d4'); M.box(w.x + w.w + 1, w.y - 1, 3, w.h + 2, '#f0e8d4');
        M.box(w.x - 6, w.y + w.h + 1, w.w + 12, 3, '#c8a040'); M.R(w.x - 6, w.y + w.h + 1, w.w + 12, 1, '#f0d070');
        M.box(w.x + w.w / 2 - 1, w.y, 2, w.h, '#f0e8d4'); M.box(w.x, w.y + 13, w.w, 2, '#f0e8d4');
      }
    },
    lamps(now) { return BOAT_LAMPS.map((cx, i) => ({ x: cx + boatSwing(now, i), y: 22, r: 42 })); },
    // roulis du vapeur : très lent, un pixel au plus
    sway(now) { return Math.round(Math.sin(now / 1500) * 1.2); },
    anim(ctx, now, room) {
      const dark = room?.env.id === 'nuit' || room?.env.id === 'orage';
      ROOMS.bateau.windows.forEach((w, i) => riverView(ctx, w, i, now, i === 1, dark));
      BOAT_LAMPS.forEach((cx, i) => boatLamp(ctx, cx, boatSwing(now, i)));
    },
    lit(ctx, now) { BOAT_LAMPS.forEach((cx, i) => boatFlames(ctx, cx + boatSwing(now, i), now, i)); },
    front(ctx, now) {
      // reflets de l'eau qui dansent au plafond
      ctx.fillStyle = 'rgba(255,250,225,0.22)';
      for (let k = 0; k < 9; k++) {
        const x = 18 + k * 44 + Math.sin(now / 700 + k) * 6, y = 2 + (k % 3) * 3 + Math.sin(now / 480 + k * 2);
        ctx.fillRect(Math.round(x), Math.round(y), 4 + Math.round(Math.sin(now / 300 + k) * 2), 1);
      }
    },
  },

  hotel: {
    name: 'LE GRAND HÔTEL',
    windows: [{ x: 30, y: 26, w: 52, h: 56 }],
    render(bg, mid) {
      const { R, box } = paint(bg);
      // papier peint damassé bordeaux
      R(0, 0, W, 128, '#5e1a22');
      for (let y = 16, row = 0; y < 88; y += 11, row++) for (let x = (row % 2) * 8 - 8; x < W; x += 16) {
        const cx = x + 8, cy = y + 5;
        R(cx, cy - 4, 1, 9, '#7a2a32'); R(cx - 1, cy - 2, 3, 5, '#7a2a32'); R(cx - 2, cy - 1, 5, 3, '#7a2a32'); R(cx - 3, cy, 7, 1, '#7a2a32');
        R(cx, cy, 1, 1, '#a8743a');
      }
      // plafond, corniche dorée à oves et denticules
      R(0, 0, W, 8, '#efe4c8'); for (let x = 0; x < W; x += 48) R(x, 0, 1, 8, '#d8c8a4');
      R(0, 8, W, 5, '#c8a040'); R(0, 8, W, 1, '#f0d070'); R(0, 12, W, 1, '#8a6a20');
      for (let x = 1; x < W; x += 4) { R(x, 10, 2, 2, '#8a6a20'); R(x, 10, 1, 1, '#f0d070'); }
      R(0, 13, W, 3, '#3a0e14'); for (let x = 0; x < W; x += 3) R(x, 13, 2, 2, '#e8dcc0');
      // cimaise dorée et lambris de noyer
      R(0, 88, W, 3, '#c8a040'); R(0, 88, W, 1, '#f0d070'); R(0, 91, W, 37, '#3a2216');
      for (let x = 4; x < W; x += 38) {
        box(x, 96, 30, 26, '#4a2c1c'); R(x, 96, 30, 1, '#6a4028');
        R(x + 3, 99, 24, 1, '#c8a040'); R(x + 3, 118, 24, 1, '#8a6a20'); R(x + 3, 99, 1, 20, '#c8a040'); R(x + 26, 99, 1, 20, '#8a6a20');
      }
      // portrait du propriétaire
      goldFrame(R, 106, 24, 28, 30, (x, y, w, h) => {
        for (let j = 0; j < h; j++) R(x, y + j, w, 1, S.mix('#3a4a34', '#1e2a1e', j / h));
        R(x + 6, y + 20, 16, 10, '#1a1a22'); R(x + 11, y + 19, 6, 4, '#f4ecd8'); R(x + 13, y + 20, 2, 5, '#9a2a1c');
        S.disc(bg, x + 14, y + 12, 5, '#e0b090'); R(x + 9, y + 6, 10, 3, '#3a2a1a'); R(x + 9, y + 9, 2, 4, '#3a2a1a');
        R(x + 11, y + 15, 7, 1, '#3a2a1a'); R(x + 12, y + 11, 1, 1, OUT); R(x + 16, y + 11, 1, 1, OUT);
      });
      // piano droit en laque noire et son candélabre
      box(96, 80, 46, 48, '#2a1a1e'); R(96, 80, 46, 2, '#4a3438'); R(96, 80, 1, 48, '#3e2a2e');
      R(100, 86, 38, 10, '#1e1216'); R(100, 86, 38, 1, '#c8a040');
      box(108, 85, 9, 9, '#f4ecd8'); box(119, 85, 9, 9, '#f4ecd8');
      for (let k = 0; k < 4; k++) { R(109, 87 + k * 2, 7, 1, '#8a8070'); R(120, 87 + k * 2, 7, 1, '#8a8070'); }
      R(98, 99, 42, 6, OUT); R(99, 100, 40, 4, '#f4ecd8');
      for (let k = 0; k < 13; k++) R(100 + k * 3, 100, 1, 4, '#c8bca8');
      for (let k = 0; k < 13; k++) if (k % 7 !== 2 && k % 7 !== 6) R(102 + k * 3, 100, 2, 2, OUT);
      R(100, 108, 38, 1, '#c8a040');
      box(118, 70, 3, 10, '#c8a040'); box(110, 70, 20, 1, '#c8a040'); box(114, 78, 12, 2, '#c8a040');
      // lustre en cristal : chaîne, couronnes, bobèches, pampilles et guirlande de perles
      const cx = 192;
      for (let y = 0; y < 14; y += 2) { R(cx - 1, y, 3, 2, OUT); R(cx, y, 1, 1, '#e0b040'); }
      box(cx - 1, 14, 3, 18, '#c8a040');
      box(cx - 9, 15, 19, 2, '#c8a040'); box(cx - 20, 24, 41, 2, '#c8a040'); R(cx - 20, 24, 41, 1, '#f0d070');
      box(cx - 7, 26, 15, 3, '#c8a040'); box(cx - 4, 29, 9, 2, '#c8a040'); box(cx - 1, 31, 3, 3, '#e0b040');
      for (let x = cx - 20; x <= cx + 20; x += 2) R(x, 27 + Math.round(5 * (1 - ((x - cx) / 20) ** 2)), 1, 1, '#c8e0ec');
      for (const [x, top, len] of HOTEL_DROPS) {
        for (let y = top; y < top + len; y += 2) R(x, y, 1, 1, '#d8ecf4');
        R(x - 1, top + len, 3, 3, OUT); R(x, top + len, 1, 2, '#a8d8f0');
      }
      // bougies (lustre et candélabre) : les flammes sont animées
      for (const [x, top] of HOTEL_CANDLES) { const h = top < 15 ? 5 : 6; R(x - 1, top - 1, 4, h + 2, OUT); R(x, top, 2, h, '#f4ecd8'); R(x + 1, top, 1, h, '#d8d0c0'); R(x - 1, top + h, 4, 1, '#c8a040'); }
      // miroir doré coiffé d'une coquille
      S.disc(bg, 274, 19, 7, OUT); S.disc(bg, 274, 19, 6, '#c8a040'); R(274, 13, 1, 6, '#8a6a20'); R(271, 15, 1, 4, '#8a6a20'); R(277, 15, 1, 4, '#8a6a20');
      goldFrame(R, 252, 22, 44, 52, (x, y, w, h) => {
        for (let j = 0; j < h; j++) R(x, y + j, w, 1, S.mix('#8a9aa2', '#c4d0d4', j / h));
        for (let j = 0; j < h; j++) { R(x + 4 + Math.floor(j * 0.5), y + j, 2, 1, '#d8e4e8'); R(x + 11 + Math.floor(j * 0.5), y + j, 1, 1, '#d0dce0'); }
        for (let k = 0; k < 6; k++) R(x + 2 + ((k * 17) % (w - 4)), y + h - 3 - ((k * 5) % 6), 2, 1, '#7a8a90'); // tain piqué
      });
      // étagère de bouteilles de champagne
      box(304, 50, 76, 3, '#4a2c1c'); R(304, 50, 76, 1, '#6a4028');
      for (const x of [308, 372]) { R(x - 1, 53, 4, 5, OUT); R(x, 53, 2, 4, '#4a2c1c'); }
      for (let k = 0; k < 6; k++) {
        const x = 308 + k * 12;
        shape(R, [[x, 40, 6, 10, '#1e3a22'], [x + 1, 38, 4, 2, '#1e3a22'], [x + 2, 33, 2, 5, '#d8b040']]);
        R(x + 1, 41, 1, 7, '#3a6a40'); R(x + 1, 44, 4, 3, '#f4ecd8'); R(x + 2, 45, 2, 1, '#c8a040'); R(x + 1, 38, 4, 1, '#d8b040');
      }
      // desserte : pyramide de coupes sur un plateau d'argent, seau à glace
      box(304, 87, 76, 3, '#6a4028'); R(304, 87, 76, 1, '#8a5a34');
      box(310, 85, 38, 2, '#c8ccd0');
      for (const [n, b] of COUPE_ROWS) for (let k = 0; k < n; k++) {
        const x = 329 - n * 4 + k * 8;
        shape(R, [[x, b - 6, 7, 2, '#c8dce4'], [x + 3, b - 4, 1, 3, '#c8dce4'], [x + 1, b - 1, 5, 1, '#c8dce4']]);
        R(x + 1, b - 6, 5, 1, '#f0d070');
      }
      shape(R, [[360, 62, 4, 14, '#1e3a22']]); R(360, 62, 4, 4, '#d8b040');
      shape(R, [[356, 76, 12, 10, '#b8c0c4'], [355, 75, 14, 2, '#d8e0e4']]);
      R(357, 77, 1, 8, '#e8f0f4'); R(366, 77, 1, 8, '#8a9094'); R(358, 73, 3, 2, '#e8f4f8'); R(364, 74, 2, 1, '#e8f4f8');
      // fenêtre
      const w = ROOMS.hotel.windows[0];
      box(w.x - 3, w.y - 3, w.w + 6, w.h + 6, '#e8dcc0');
      bg.clearRect(w.x, w.y, w.w, w.h);
      const M = paint(mid);
      M.box(w.x + w.w / 2 - 1, w.y, 2, w.h, '#e8dcc0'); M.box(w.x, w.y + 18, w.w, 2, '#e8dcc0'); M.box(w.x, w.y + 37, w.w, 2, '#e8dcc0');
      M.box(w.x - 6, w.y + w.h + 2, w.w + 12, 3, '#e8dcc0');
      // rideaux de velours rouge, retenus par des embrasses à glands
      M.box(12, 15, 88, 2, '#c8a040'); M.box(9, 14, 4, 4, '#e0b040'); M.box(99, 14, 4, 4, '#e0b040');
      for (const side of [0, 1]) {
        for (let y = 18; y < 128; y++) {
          const ww = y < 60 ? Math.round(18 - 11 * Math.sin((Math.min(1, (y - 18) / 42) * Math.PI) / 2)) : 7 + Math.round((y - 60) * 0.12);
          const x = side ? 96 - ww : 16;
          M.R(x - 1, y, ww + 2, 1, OUT); M.R(x, y, ww, 1, '#8a1a22');
          M.R(x + Math.round(ww * 0.15), y, 1, 1, '#b83440'); M.R(x + Math.round(ww * 0.4), y, 1, 1, '#5a0e14'); M.R(x + Math.round(ww * 0.75), y, 1, 1, '#5a0e14');
        }
        const tx = side ? 85 : 18;
        M.box(tx, 59, 9, 3, '#e0b040'); M.box(tx + 3, 62, 3, 6, '#c8a040');
      }
      // lambrequin festonné à franges dorées
      M.box(12, 17, 88, 5, '#8a1a22');
      for (let x = 12; x < 100; x++) {
        const u = ((x - 12) % 22) / 22, bot = 22 + Math.round(5 * Math.sin(Math.PI * u));
        M.R(x, 22, 1, bot - 22, '#8a1a22'); M.R(x, 22, 1, 1, '#b83440'); M.R(x, bot, 1, 1 + (x % 2), '#e0b040');
      }
    },
    lamps() { return [{ x: 192, y: 20, r: 58 }, { x: 120, y: 62, r: 26 }]; },
    anim(ctx, now) {
      const { R } = paint(ctx);
      HOTEL_CANDLES.forEach(([x, top], k) => candleTip(ctx, x, top, now, k));
      // les pampilles scintillent
      const f = Math.floor(now / 150);
      HOTEL_DROPS.forEach(([x, top, len], k) => {
        if (hash(f * 13 + k) < 0.14) { R(x, top + len - 1, 1, 3, '#ffffff'); R(x - 1, top + len, 3, 1, '#ffffff'); }
      });
      // le bouchon saute, la mousse déborde, puis la bouteille est de nouveau bouchée
      const T = now % POP;
      const cork = (x, y) => { R(x - 1, y - 1, 4, 5, OUT); R(x, y, 2, 3, '#c8a070'); R(x, y, 2, 1, '#e0c090'); };
      if (T < 900) cork(361 - T * 0.035, 59 - T * 0.12 + T * T * 0.00014);
      else if (T > 4000) cork(361, 59);
      if (T < 2400) {
        const k = 1 - T / 2400, h = Math.round(6 * k), d = Math.round(10 * (1 - k));
        R(360, 62 - h, 4, h, '#fdf6e0'); R(359, 62, 1, d, '#fdf6e0'); R(364, 62, 1, Math.round(d * 0.7), '#fdf6e0');
        if (T < 500) for (let j = 0; j < 5; j++) R(358 + j * 2 - (j % 2) * T * 0.01, 58 - T * 0.03 * (1 + j % 3), 1, 1, '#fdf6e0');
      }
    },
    lit(ctx, now) { HOTEL_CANDLES.forEach(([x, top], k) => candleTip(ctx, x, top, now, k)); },
    front(ctx, now) {
      // un éclat de lumière glisse en biais sur le miroir
      const T = now % 7000;
      if (T >= 900) return;
      const x0 = 252, y0 = 22, mw = 44, mh = 52, xg = x0 - 30 + (T / 900) * (mw + 40);
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      for (let j = 0; j < mh; j++) {
        const a = Math.max(x0, Math.round(xg + j * 0.5)), b = Math.min(x0 + mw, Math.round(xg + j * 0.5) + 4);
        if (b > a) ctx.fillRect(a, y0 + j, b - a, 1);
      }
    },
  },
};
const ROOM_IDS = Object.keys(ROOMS);
export const ROOM_NAMES = Object.fromEntries(ROOM_IDS.map((id) => [id, ROOMS[id].name]));
// Salle tirée de la graine, sans rien dessiner (même tirage que le constructeur de Room) : sert aux règles de la pinte.
// force : salle imposée par l'hôte (lobby).
export const roomIdFor = (seed, force = null) => (ROOMS[force] ? force : ROOM_IDS[Math.floor(rng((seed ^ 0x9e3779b9) >>> 0)() * ROOM_IDS.length)]);

// ------------------------------------------------------------ salles du mode histoire
// Jamais tirées au sort (ni proposées dans le lobby) : imposées par le décor d'un épisode (story/decos : deco.room).
// felt : couleur du tapis de la table (scene.js), backdrop(ctx, now, room) : décor en plein air dessiné derrière.
const FELT_RED = { '#2a4a30': '#4a1c1c', '#33583a': '#5a2422', '#3a6040': '#6a2c26', '#24402a': '#3e1616', '#1a2a1c': '#260c0c' };

// Brasero de fer forgé sur trépied (vasque en x, bord en y) : la flamme est animée à part (anim)
function brazier(R, x, y) {
  shape(R, [[x - 2, y + 6, 2, 34, '#3a3438'], [x + 10, y + 6, 2, 34, '#3a3438'], [x + 4, y + 8, 2, 30, '#2a2428']]);
  shape(R, [[x - 6, y, 22, 4, '#4a4248'], [x - 4, y + 4, 18, 3, '#3a3438']]);
  R(x - 6, y, 22, 1, '#7a6e74'); R(x - 4, y + 6, 18, 1, '#2a2428');
  for (let k = 0; k < 5; k++) R(x - 4 + k * 4, y + 1, 2, 2, '#c8501c'); // braises au bord de la vasque
}
function brazierFlame(ctx, x, y, now, ph) {
  const { R } = paint(ctx);
  for (let i = 0; i < 9; i++) {
    const k = hash(i * 13 + ph);
    const h = Math.round((8 + k * 9) * (0.6 + 0.4 * Math.abs(Math.sin(now / (110 + k * 70) + k * 7))) * (1 - Math.abs(i - 4) / 6));
    if (h < 2) continue;
    const fx = x - 4 + i * 2;
    R(fx, y - h, 2, h, '#e8501c');
    R(fx, y - Math.round(h * 0.66), 2, Math.round(h * 0.66), '#f89a2a');
    R(fx, y - Math.round(h * 0.33), 2, Math.round(h * 0.33), '#fde870');
  }
  // étincelles qui s'envolent
  for (let i = 0; i < 3; i++) {
    const age = (now + i * 430 + ph * 97) % 1300;
    R(x + 1 + Math.round(Math.sin(age / 160 + i) * 4), y - 14 - Math.round(age * 0.04), 1, 1, age < 800 ? '#fde870' : '#e8501c');
  }
}

const STORY_ROOMS = {
  // Le Buckshot Saloon de Rosa, à Dusty Gulch : le saloon, avec son enseigne sous le crâne de bœuf
  buckshot: {
    ...ROOMS.saloon,
    name: 'LE BUCKSHOT SALOON',
    render(bg, mid) {
      ROOMS.saloon.render(bg, mid);
      const { R, box } = paint(bg);
      // planche peinte en rouge, filets et lettres dorés, deux clous
      box(150, 30, 84, 13, '#8a2418');
      R(150, 30, 84, 1, '#b8402a'); R(150, 42, 84, 1, '#5a140c');
      R(152, 32, 80, 1, '#c89838'); R(152, 40, 80, 1, '#c89838');
      for (const nx of [153, 230]) { R(nx, 35, 2, 2, OUT); R(nx, 35, 1, 1, '#d8d0c0'); }
    },
    // le nom, redessiné à chaque image (canvasText : net dès que la police est chargée)
    anim(ctx, now, room) {
      ROOMS.saloon.anim(ctx, now, room);
      canvasText(ctx, 'BUCKSHOT', 192, 33, { color: '#f8d070', shadow: '#4a1008' });
    },
  },
  // La Bouche de l'Enfer : la table du Diable dressée au bord du cratère, entre deux braseros ; derrière, les
  // parois de basalte et la lueur du filon qui monte du gouffre (décor « bouche » du mode histoire)
  bouche: {
    name: 'LA BOUCHE DE L’ENFER',
    windows: [],
    felt: FELT_RED,
    backdrop(ctx, now, room) {
      if (!drawSet(ctx, 'bouche', 232, room.amb, now)) { ctx.fillStyle = '#2a1a1c'; ctx.fillRect(0, 0, W, H); }
    },
    render(bg) {
      const { R } = paint(bg);
      // aiguilles de basalte qui encadrent la table
      for (const [x0, dir] of [[0, 1], [W, -1]]) {
        for (let k = 0; k < 34; k++) {
          const x = x0 + dir * k - (dir < 0 ? 1 : 0);
          const top = Math.round(40 + k * k * 0.07 + Math.sin(k * 1.7) * 2);
          R(x, top, 1, 140 - top, OUT);
          if (k < 33) R(x, top + 1, 1, 139 - top, k < 3 ? '#2a2026' : (k + Math.floor(top / 5)) % 7 ? '#3a2e32' : '#4a3a3c');
        }
      }
      brazier(R, 46, 92);
      brazier(R, 328, 92);
    },
    lamps() { return [{ x: 51, y: 84, r: 44 }, { x: 333, y: 84, r: 44 }]; },
    anim(ctx, now) {
      brazierFlame(ctx, 51, 92, now, 1);
      brazierFlame(ctx, 333, 92, now, 2);
    },
    // les flammes, redessinées hors teinte (elles éclairent, l'ambiance ne les assombrit pas)
    lit(ctx, now) {
      brazierFlame(ctx, 51, 92, now, 1);
      brazierFlame(ctx, 333, 92, now, 2);
    },
  },
};
export const roomFelt = (room) => room?.def.felt || null;

// ------------------------------------------------------------ dehors
const OUTSIDE = new Map();
function cacheOutside(key, c) {
  if (OUTSIDE.size > 24) { for (const old of OUTSIDE.values()) S.freeCanvas(old); OUTSIDE.clear(); }
  OUTSIDE.set(key, c);
  return c;
}
function outsideArt(key, w, env) {
  const c = OUTSIDE.get(key);
  if (c) return c;
  const cv = S.makeCanvas(w.w, w.h);
  S.drawDesert(cv.getContext('2d'), 0, 0, w.w, w.h, desertOpts(env, { sunX: 0.7, sunY: 0.3 }));
  return cacheOutside(key, cv);
}

// Wagon-bar : le ciel (soleil, lune, étoiles) reste fixe et le paysage défile devant, sans le recouvrir.
// Ciel : mêmes bandes tramées que S.drawDesert, puis son décor.
const SKY_NOON = ['#d4ae7e', '#dcb98a', '#e3c697', '#ebd2a5', '#f0dcb0'];
function trainSky(key, w, env, horizon) {
  const c = OUTSIDE.get(key);
  if (c) return c;
  const cv = S.makeCanvas(w.w, horizon), x = cv.getContext('2d');
  const cols = env.sky || SKY_NOON, n = cols.length;
  for (let i = 0; i < n; i++) {
    const ya = Math.round((i * horizon) / n), yb = Math.round(((i + 1) * horizon) / n);
    x.fillStyle = cols[i]; x.fillRect(0, ya, w.w, yb - ya);
    if (i > 0) {
      x.fillStyle = cols[i - 1];
      for (let px = 0; px < w.w; px += 2) x.fillRect(px, ya, 1, 1);
      for (let px = 1; px < w.w; px += 4) x.fillRect(px, ya + 1, 1, 1);
    }
  }
  skyDeco(env, 0.75, 0.3)(x, 0, 0, w.w, horizon);
  return cacheOutside(key, cv);
}
// Paysage : mesas et sol de S.drawDesert, ciel rendu transparent (dessiné en magenta puis effacé, une fois),
// suivi de son reflet en miroir : la bande de 1024 px boucle sans raccord.
function trainLand(key, w, env) {
  const c = OUTSIDE.get(key);
  if (c) return c;
  const half = 512;
  const src = S.makeCanvas(half, w.h, true), sx = src.getContext('2d', { willReadFrequently: true });
  S.drawDesert(sx, 0, 0, half, w.h, { ...desertOpts(env), sky: ['#ff00ff'], skyDeco: () => {}, cacti: false });
  const img = sx.getImageData(0, 0, half, w.h), d = img.data;
  for (let i = 0; i < d.length; i += 4) if (d[i] > 250 && d[i + 1] < 5 && d[i + 2] > 250) d[i + 3] = 0;
  sx.putImageData(img, 0, 0);
  const cv = S.makeCanvas(half * 2, w.h), x = cv.getContext('2d');
  x.drawImage(src, 0, 0);
  x.setTransform(-1, 0, 0, 1, half * 2, 0);
  x.drawImage(src, 0, 0);
  x.setTransform(1, 0, 0, 1, 0, 0);
  S.freeCanvas(src);
  return cacheOutside(key, cv);
}
// Vitesse de défilement (px/ms) d'une ligne du paysage : les mesas au loin, puis le sol de plus en plus vite
// à mesure qu'il se rapproche (perspective : vitesse proportionnelle à la distance sous l'horizon)
const LAND_FAR = 0.012, LAND_NEAR = 0.14;
const landSpeed = (row, rows) => LAND_FAR + ((LAND_NEAR - LAND_FAR) * row) / Math.max(1, rows - 1);

// Virevoltant vu par la fenêtre, teint comme le paysage de l'ambiance (4 images en cache par teinte)
const TUMBLE = new Map();
function tumbleTinted(ctx, x, y, now, tint) {
  if (!tint) { S.tumbleweed(ctx, x, y, now); return; }
  const f = ((Math.floor(now / 120) % 4) + 4) % 4, key = tint + f;
  let c = TUMBLE.get(key);
  if (!c) {
    const raw = S.makeCanvas(13, 13);
    S.tumbleweed(raw.getContext('2d'), 6, 6, f * 120);
    c = S.tintCanvas(raw, tint);
    S.freeCanvas(raw);
    if (TUMBLE.size >= 24) { for (const old of TUMBLE.values()) S.freeCanvas(old); TUMBLE.clear(); }
    TUMBLE.set(key, c);
  }
  ctx.drawImage(c, Math.round(x) - 6, Math.round(y) - 6);
}

// Couleur multipliée par une teinte (comme S.tintCanvas), pour les détails du dehors dessinés à la main
function multiply(hex, tint) {
  if (!tint) return hex;
  const a = parseInt(hex.slice(1), 16), b = parseInt(tint.slice(1), 16);
  return '#' + [16, 8, 0].map((s) => Math.round((((a >> s) & 255) * ((b >> s) & 255)) / 255).toString(16).padStart(2, '0')).join('');
}

// Couleurs fixes de l'éclairage (pas de chaîne recomposée à chaque image)
const BEAM = { midi: 'rgba(255,236,190,0.05)', aube: 'rgba(255,210,210,0.05)', crepuscule: 'rgba(255,170,100,0.08)', poussiere: 'rgba(255,210,150,0.06)', neige: 'rgba(230,240,255,0.05)' };
const DAY_SKY = new Set(['midi', 'aube', 'crepuscule']);
// Halo d'une lampe (rayon r, tremblement d de -1 à 1 pixel, plus fort la nuit), gardé sous une clé numérique :
// haloSprite recompose sa clé (une chaîne) à chaque appel. Un halo libéré par le cache d'env.js est refait.
const HALOS = new Map();
function lampHalo(r, d, night) {
  const key = (r * 4 + d + 1) * 2 + (night ? 1 : 0);
  let h = HALOS.get(key);
  if (!h || !h.width) {
    const k = night ? 1.8 : 1;
    h = haloSprite([[r, 0.04], [r * 0.65, 0.05], [r * 0.35, 0.06]].map(([rr, a]) => [Math.round(rr) + d, a * k]), '255,170,70');
    HALOS.set(key, h);
  }
  return h;
}
const STAR_TRAIL = [0, 1, 2, 3, 4, 5].map((j) => `rgba(255,255,240,${(1 - j / 6).toFixed(3)})`);

export class Room {
  // deco : décor d'un épisode du mode histoire (hooks.story.deco : { room, env }), la même salle pour les deux joueurs
  constructor(seed, force = null, deco = null) {
    this.seed = seed;
    const R = rng((seed ^ 0x9e3779b9) >>> 0);
    const drawn = ROOM_IDS[Math.floor(R() * ROOM_IDS.length)];
    this.id = STORY_ROOMS[deco?.room] ? deco.room : ROOMS[force] ? force : drawn;
    this.def = ROOMS[this.id] || STORY_ROOMS[this.id];
    this.band = MARIACHI[Math.floor(R() * MARIACHI.length)];
    this.env = ENVS[deco?.env] ? { id: deco.env, ...ENVS[deco.env] } : pickEnv(seed, 'roulette');
    this.amb = new Ambience(this.env);
    this.tint = ROOM_TINT[this.env.id] || null;
    // buissons qui défilent derrière les vitres du train : teints comme le paysage de l'ambiance
    this.bushCols = ['#6a7a3a', '#8a6a4a', '#7a8a46'].map((c) => multiply(c, this.env.tint));
    this.art = Room.art(this.id);
    this.layer = S.makeCanvas(W, H);
    this.tinted = null;
    if (this.def.backdrop) loadSets().catch((e) => console.error(e));
  }

  static art(id) {
    Room.cache ||= new Map();
    let a = Room.cache.get(id);
    if (!a) {
      a = { bg: S.makeCanvas(W, H), mid: S.makeCanvas(W, H) };
      (ROOMS[id] || STORY_ROOMS[id]).render(a.bg.getContext('2d'), a.mid.getContext('2d'));
      Room.cache.set(id, a);
    }
    return a;
  }

  get name() { return this.def.name; }
  get label() { return `${this.def.name} - ${this.env.name}`; }
  sway(now) { return this.def.sway ? this.def.sway(now) : 0; }

  // Tout ce qui est derrière l'adversaire : dehors, décor teinté, éléments animés, lumières.
  drawBack(ctx, now) {
    const sway = this.sway(now);
    this.def.backdrop?.(ctx, now, this); // en plein air (mode histoire) : le décor de l'aventure derrière la salle
    this.def.windows.forEach((w, i) => {
      ctx.save();
      ctx.beginPath();
      ctx.rect(w.x, w.y + sway, w.w, w.h);
      ctx.clip();
      ctx.translate(0, sway);
      this.drawOutside(ctx, w, i, now);
      ctx.restore();
    });
    const L = this.layer, l = L.getContext('2d');
    l.setTransform(1, 0, 0, 1, 0, sway);
    l.clearRect(0, -2, W, H + 4);
    // quand le wagon descend, la première ligne du plafond s'étire sur le haut de l'écran (sinon : bande vide)
    if (sway > 0) l.drawImage(this.art.bg, 0, 0, W, 1, 0, -sway, W, sway);
    l.drawImage(this.art.bg, 0, 0);
    this.def.anim?.(l, now, this);
    const lamps = this.lampPos(l, now);
    l.drawImage(this.art.mid, 0, 0);
    this.def.front?.(l, now, this);
    l.setTransform(1, 0, 0, 1, 0, 0);
    const f = this.amb.flash(now);
    const tint = this.tint && f ? S.mix(this.tint, '#ffffff', 0.6 * f) : this.tint;
    if (tint) {
      this.tinted = S.tintCanvas(L, tint, this.tinted || S.makeCanvas(W, H));
      ctx.drawImage(this.tinted, 0, 0);
      // les flammes gardent leur éclat, quelle que soit l'ambiance
      ctx.save();
      ctx.translate(0, sway);
      for (const p of lamps) if (p.glass != null) lampGlass(ctx, p.x, p.glass);
      this.def.lit?.(ctx, now, this);
      ctx.restore();
    } else ctx.drawImage(L, 0, 0);
    // rayons de lumière par les fenêtres, puis halo des lampes (plus fort la nuit)
    const night = this.env.id === 'nuit' || this.env.id === 'orage';
    const beam = BEAM[this.env.id];
    ctx.globalCompositeOperation = 'lighter';
    if (beam && this.def.windows.length && !this.def.windows[0].train) {
      for (const w of this.def.windows) {
        ctx.fillStyle = beam;
        ctx.beginPath();
        ctx.moveTo(w.x, w.y + w.h); ctx.lineTo(w.x + w.w, w.y + w.h);
        const dx = w.x > W / 2 ? -70 : 70;
        ctx.lineTo(w.x + w.w + dx, 140); ctx.lineTo(w.x + dx, 140);
        ctx.closePath(); ctx.fill();
      }
    }
    for (const p of lamps) {
      const fl = Math.round(Math.sin(now / 90 + p.x) * 0.5 + Math.sin(now / 37) * 0.5);
      const h = lampHalo(p.r, fl, night);
      ctx.drawImage(h, Math.round(p.x) - h.r, Math.round(p.y + sway) - h.r);
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  // lampes suspendues (dessinées sur le calque) ou points lumineux fixes
  lampPos(l, now) {
    return this.def.lamps(now, this).map((p) => {
      if (p.lx == null) return p;
      const q = drawLamp(l, p.lx, p.top ?? 7, p.len, p.a);
      return { x: q.x, y: q.y, r: p.r, glass: q.glass };
    });
  }

  drawOutside(ctx, w, i, now) {
    const env = this.env;
    const horizon = w.y + Math.round(w.h * 0.6);
    if (w.train) {
      // le ciel reste fixe ; devant, le paysage défile : mesas au loin lentement, le sol de plus en plus vite
      // vers le bas (une ligne à la fois), buissons à la vitesse de leur ligne, poteaux télégraphiques au ras de la vitre
      const hz = horizon - w.y, rows = w.h - hz;
      ctx.drawImage(trainSky(`${env.id}s${w.w}x${w.h}`, w, env, hz), w.x, w.y);
      const land = trainLand(`${env.id}t${w.h}`, w, env), T = land.width;
      const strip = (y, h, speed) => {
        const off = Math.floor((now * speed + i * 200) % T);
        ctx.drawImage(land, 0, y, T, h, w.x - off, w.y + y, T, h);
        if (T - off < w.w) ctx.drawImage(land, 0, y, T, h, w.x - off + T, w.y + y, T, h);
      };
      strip(0, hz + 1, LAND_FAR);
      for (let r = 1; r < rows; r++) strip(hz + r, 1, landSpeed(r, rows));
      const { R } = paint(ctx);
      const [bushA, bushB, bushL] = this.bushCols;
      for (let k = 0; k < 14; k++) {
        const r = 6 + (k % 3) * 5, span = w.w + 40;
        const x = w.x + ((((k * 53) - now * landSpeed(r, rows)) % span) + span) % span - 20;
        const y = horizon + r;
        R(x, y, 4 + (k % 3) * 2, 2, k % 2 ? bushA : bushB); R(x + 1, y - 1, 2, 1, bushL);
      }
      const span = 150, px = ((-now * 0.32) % span + span) % span;
      for (let x = w.x + px - span; x < w.x + w.w + span; x += span) {
        R(x, w.y, 3, w.h, '#3a2214'); R(x - 5, w.y + 6, 13, 2, '#3a2214');
        for (let k = 3; k < span; k += 3) R(x + k, w.y + 7 + Math.sin((k / span) * Math.PI) * 6, 1, 1, '#2a1a10');
      }
      // panaches de fumée de la locomotive
      for (let k = 0; k < 3; k++) {
        const ph = ((now / 1700) + k / 3 + i * 0.5) % 1;
        ctx.globalAlpha = 0.55 * (1 - ph);
        S.disc(ctx, Math.round(w.x + w.w + 10 - ph * (w.w + 30)), Math.round(w.y + 4 + Math.sin(ph * 5 + k) * 2), Math.round(4 + ph * 6), '#f0ece4');
      }
      ctx.globalAlpha = 1;
    } else {
      ctx.drawImage(outsideArt(`${this.id}${env.id}${i}`, w, env), w.x, w.y);
      const { R } = paint(ctx);
      // nuages qui passent
      if (env.id !== 'nuit') {
        const col = env.id === 'orage' ? 'rgba(50,54,66,0.85)' : 'rgba(255,250,240,0.55)';
        for (let k = 0; k < 2; k++) {
          const cx = w.x + (((now * 0.003 + k * 47) % (w.w + 40)) - 20), cy = w.y + 7 + k * 8;
          for (const [dx, r] of [[0, 4], [5, 5], [10, 3]]) S.disc(ctx, Math.round(cx + dx), cy, r, col);
        }
      }
      if (DAY_SKY.has(env.id)) S.vulture(ctx, Math.round(w.x + w.w / 2 + Math.cos(now / 4000) * 18), Math.round(w.y + 12 + Math.sin(now / 3000) * 4), now);
      // virevoltant (teint comme le sol de l'ambiance)
      const tw = now % 15000;
      if (tw < 5000) tumbleTinted(ctx, w.x - 6 + ((w.w + 12) * tw) / 5000, horizon + 8 - Math.abs(Math.sin(now / 160)) * 4, now, env.tint);
      // cavalier au loin sur la crête
      const rd = (now + 7000) % 23000;
      if (rd < 7000) {
        const x = Math.round(w.x + w.w + 6 - ((w.w + 12) * rd) / 7000), y = horizon - 1;
        const leg = Math.floor(now / 120) % 2;
        const c = 'rgba(40,24,16,0.85)';
        R(x, y - 4, 7, 3, c); R(x - 2, y - 6, 3, 3, c); R(x + 2, y - 8, 2, 4, c); R(x + 2, y - 9, 3, 1, c);
        R(x + leg, y - 1, 1, 2, c); R(x + 5 - leg, y - 1, 1, 2, c);
      }
      // étoile filante
      if (env.stars && (now % 11000) < 500) {
        const k = (now % 11000) / 500;
        for (let j = 0; j < 6; j++) R(w.x + 10 + k * 40 - j * 2, w.y + 6 + k * 12 - j * 0.6, 1, 1, STAR_TRAIL[j]);
      }
    }
    // météo sur la vitre
    if (env.weather === 'rain') {
      ctx.fillStyle = 'rgba(200,210,240,0.6)';
      for (let k = 0; k < (w.train ? 26 : 16); k++) {
        const x = w.x + ((k * 13.7) % w.w), y = w.y + ((k * 23 + now * (w.train ? 0.05 : 0.09)) % w.h);
        if (w.train) for (let j = 0; j < 4; j++) ctx.fillRect(Math.round(x - j * 2), Math.round(y + j * 0.5), 1, 1);
        else ctx.fillRect(Math.round(x), Math.round(y), 1, 3);
      }
    } else if (env.weather === 'snow') {
      ctx.fillStyle = '#f4f6ff';
      for (let k = 0; k < 22; k++) {
        const x = w.x + ((((k * 19.3 + Math.sin(now / 700 + k) * 4 - (w.train ? now * 0.08 : 0)) % w.w) + w.w) % w.w);
        const y = w.y + ((k * 11 + now * 0.012) % w.h);
        ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
      }
    } else if (env.weather === 'dust') {
      ctx.fillStyle = 'rgba(214,162,104,0.35)'; ctx.fillRect(w.x, w.y, w.w, w.h);
      ctx.fillStyle = 'rgba(232,196,140,0.6)';
      for (let k = 0; k < 10; k++) ctx.fillRect(Math.round(w.x + w.w - ((k * 31 + now * 0.12) % (w.w + 20))), w.y + ((k * 7) % w.h), 8, 1);
    }
    const f = this.amb.flash(now);
    if (f) {
      ctx.globalAlpha = 0.8 * f; ctx.fillStyle = '#f0f0ff'; ctx.fillRect(w.x, w.y, w.w, w.h); ctx.globalAlpha = 1;
      this.amb.sky(ctx, now);
    }
  }

  // Par-dessus toute la scène : éclair qui illumine la pièce (et le tonnerre)
  drawOverlay(ctx, now) {
    if (this.amb.thunder(now)) sfx('thunder', 0.4);
    const f = this.amb.flash(now);
    if (f) { ctx.globalAlpha = 0.18 * f; ctx.fillStyle = '#e6ecff'; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
  }
}
