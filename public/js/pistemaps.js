// Cartes de bataille de « La piste », pour la vue isométrique : des terrains plus grands (de 22 × 16 à 36 × 26 cases),
// de formes variées (le vide VOID découpe des îles, des bandes en diagonale, des L, des cuvettes, des plateaux), bâtis
// par thème à partir de gabarits et de briques (mesas, oasis, ranch, défilés, gués, fermes, champs, forêts, lacs gelés,
// galeries de mine, saloons, grand-rues, la hacienda d'El Diablo). Tout ici est sans navigateur (vérifié sous Node par
// tools/pistemaps-check.mjs) : même graine, même carte.
//
// Lexique des cases (pour le dessin ; la couche deco dit plus finement de quoi il s'agit, voir DECO) :
//   WALL    plein couvert, bloque passage et vue : rocher, mesa, falaise, gros arbre, sapin, mur, piano, escalier…
//   PILLAR  comme WALL mais fin : cactus, palmier, tronc, étai de mine, poteau, colonne, réverbère, statue
//   CRATE   demi-couvert : caisse, tonneau, carcasse de chariot, meule, wagonnet, souche, tronc couché, roche basse, tombe
//   SAND    demi-couvert : sacs de sable ; dans la neige, CONGÈRE (déco CONGERE)
//   WATER   on n'y passe pas, les balles si : mare, rivière boueuse, abreuvoir, fontaine, puits ; dans la neige, le lac
//           gelé est de la GLACE FINE (WATER déco GLACE : elle cède sous un homme) et le passage de glace épaisse est
//           du sol (FLOOR déco GLACE) : on y marche
//   FLOOR / PATH / RAIL : sols (PATH : piste, plancher usé, pavés ; RAIL : rails de mine)
import { rng } from './worlds.js';

export const CELL = { FLOOR: 0, PATH: 1, WALL: 2, CRATE: 3, BUSH: 4, WATER: 5, CHEST: 6, SAND: 7, VOID: 8, TABLE: 9, COUNTER: 10, RAIL: 11, FENCE: 12, PILLAR: 13 };
const { FLOOR, PATH, WALL, CRATE, BUSH, WATER, CHEST, SAND, VOID, TABLE, COUNTER, RAIL, FENCE, PILLAR } = CELL;
//               FL PA WA CR BU WA CH SA VO TA CO RA FE PI
const MOVE = [0, 0, 1, 1, 0, 1, 1, 1, 1, 1, 1, 0, 1, 1];
const SIGHT = [0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1];
const COVER = [0, 0, 2, 1, 0, 0, 1, 1, 0, 1, 2, 0, 1, 2];
// on n'y passe pas : murs, caisses, eau, tonneaux, sacs, vide, tables, comptoir, barrières, poteaux
export const blocksMove = (c) => MOVE[c] === 1;
// la vue n'est coupée que par les murs pleins et les poteaux (le comptoir, les tables, les barrières laissent voir)
export const blocksSight = (c) => SIGHT[c] === 1;
// 0 à découvert, 1 demi-couvert (caisse, tonneau, sacs, table, barrière), 2 plein couvert (mur, comptoir, poteau)
export const coverValue = (c) => COVER[c] || 0;

// Ce que représente une case, plus finement (map.deco, même index que map.cells ; 0 : rien de particulier)
const DECO_NAMES = [
  'AUCUN',
  // murs
  'ROCHER', 'MESA', 'FALAISE', 'ARBRE', 'SAPIN', 'MUR_BOIS', 'MUR_ADOBE', 'MUR_ROC', 'PIANO', 'ETAGERE', 'ESCALIER',
  'TOUR', 'PARAVENT', 'MOULIN', 'MAISON', 'CABANE', 'FENETRE', 'PORTE_CLOSE',
  // poteaux
  'CACTUS', 'PALMIER', 'POTEAU', 'ETAI', 'COLONNE', 'TRONC', 'STALAGMITE', 'REVERBERE', 'EPOUVANTAIL', 'STATUE',
  'ARBRE_MORT', 'POELE',
  // demi-couverts
  'CAISSE', 'TONNEAU', 'CHARIOT', 'MEULE', 'WAGONNET', 'SOUCHE', 'BILLE', 'ROCHE', 'TOMBE', 'BUCHES', 'POUDRE',
  'SACS', 'CONGERE', 'RAMPE', 'ATTACHE', 'ENCLOS',
  // eaux
  'MARE', 'RIVIERE', 'GLACE', 'ABREUVOIR', 'FONTAINE', 'PUITS', 'BOUE',
  // sols
  'PISTE', 'PLANCHER', 'ESTRADE', 'TAPIS', 'GUE', 'PONT', 'PORTE', 'PORTAIL', 'BRECHE', 'PAVE', 'FEU', 'USURE',
  // buissons
  'BLE', 'BROUSSAILLE', 'ROSEAUX', 'FOUGERE',
];
export const DECO = Object.freeze(Object.fromEntries(DECO_NAMES.map((n, i) => [n, i])));
const D = DECO;

// Les thèmes de combat (noms affichés)
export const THEMES = {
  desert: 'DÉSERT', canyon: 'CANYON', prairie: 'PRAIRIE', foret: 'FORÊT', neige: 'SIERRA ENNEIGÉE',
  mine: 'MINE', saloon: 'SALOON', ville: 'VILLE', hacienda: 'HACIENDA',
};
const REGIONS = ['desert', 'canyon', 'prairie', 'foret', 'neige'];

// ------------------------------------------------------------ outils
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const ri = (R, a, b) => a + Math.floor(R() * (b - a + 1));
const pick = (R, arr) => arr[Math.floor(R() * arr.length)];
function hash(...xs) {
  let h = 2166136261;
  for (const x of xs) {
    const s = String(x);
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    h = Math.imul(h ^ 0x2f, 16777619);
  }
  return h >>> 0;
}

// ------------------------------------------------------------ le thème d'un combat
// Chaque région a sa ronde de thèmes (le sien revient le plus souvent) ; la colonne avance d'un cran dans la ronde,
// si bien que deux colonnes de suite n'ont jamais le même thème (avec la même graine : passer celle de la partie).
// i : rang du lieu dans sa colonne (des lieux voisins changent de décor).
const SEQ = {
  desert: ['desert', 'ville', 'desert', 'canyon', 'saloon', 'desert', 'canyon', 'ville'],
  canyon: ['canyon', 'mine', 'canyon', 'ville', 'canyon', 'mine', 'ville'],
  prairie: ['prairie', 'ville', 'prairie', 'foret', 'saloon', 'prairie', 'ville', 'foret'],
  foret: ['foret', 'mine', 'foret', 'saloon', 'foret', 'mine', 'saloon'],
  neige: ['neige', 'mine', 'neige', 'saloon', 'neige', 'mine', 'saloon'],
};
const TAME = { saloon: 1, ville: 1, mine: 1 }; // pas de meute de coyotes en ville, au saloon ni dans une mine
export function themeFor(seed, region, col = 1, kind = 'combat', i = 0) {
  if (kind === 'repaire') return 'hacienda';
  const seq = SEQ[region] || SEQ.desert, n = seq.length;
  const off = hash(seed >>> 0, region) % n;
  const at = (c) => seq[(((off + c + i * 3) % n) + n) % n];
  const t = at(col);
  if (kind !== 'coyotes' || !TAME[t]) return t;
  const prev = at(col - 1);
  for (let k = 1; k < n; k++) {
    const u = seq[(((off + col + i * 3 + k) % n) + n) % n];
    if (!TAME[u] && u !== prev) return u;
  }
  return seq.find((u) => !TAME[u]) || region;
}

// ------------------------------------------------------------ la grille de travail
function newGrid(R, theme, region, col, kind) {
  const [w, h] = sizeFor(R, theme, kind, col);
  const n = w * h;
  return {
    w, h, n, R, theme, region, col, kind,
    c: new Uint8Array(n), d: new Uint8Array(n), res: new Uint8Array(n), // res : 1 départ, 2 piste, 3 à garder libre
    lights: [], pA: null, eA: null, boss: null, eZone: null, tpl: '', shape: 'plein', S: 1, floorDeco: 0,
  };
}
// Taille : petite escarmouche (coyotes) à grande carte (fin de partie) ; le repaire est grand
function sizeFor(R, theme, kind, col) {
  if (theme === 'hacienda') return [ri(R, 33, 36), ri(R, 25, 26)];
  let s = kind === 'coyotes' ? R() * 0.3 : kind === 'embuscade' ? 0.15 + R() * 0.45 : clamp((col - 1) * 0.08 + R() * 0.5, 0, 1);
  if (theme === 'saloon') s = 0.05 + s * 0.4;
  if (theme === 'mine') s = 0.4 + s * 0.6;
  if (theme === 'ville') s = 0.3 + s * 0.7;
  const w = Math.round(22 + s * 14);
  return [w, clamp(Math.round(w / (1.25 + R() * 0.2)), 16, 26)];
}
const IN = (g, x, y) => x >= 0 && y >= 0 && x < g.w && y < g.h;
const AT = (g, x, y) => (IN(g, x, y) ? g.c[y * g.w + x] : VOID);
function put(g, x, y, v, d = 0) { if (IN(g, x, y)) { const k = y * g.w + x; g.c[k] = v; g.d[k] = d; } }
// pose sur la carte, jamais dans le vide
function set(g, x, y, v, d = 0) {
  if (!IN(g, x, y)) return false;
  const k = y * g.w + x;
  if (g.c[k] === VOID) return false;
  g.c[k] = v; g.d[k] = d;
  return true;
}
const keep = (g, x, y) => { if (IN(g, x, y)) g.res[y * g.w + x] = 3; };
const isGround = (v) => v === FLOOR || v === PATH || v === RAIL;
const soft = (v) => isGround(v) || v === BUSH; // on peut y poser un gros décor
const obst = (v) => v !== VOID && MOVE[v] === 1;
const cnt = (g, base) => Math.max(0, Math.round(base * g.S * (0.75 + g.R() * 0.5)));
function reserve(g, p, r) {
  for (let y = Math.floor(p.y - r); y <= p.y + r; y++) for (let x = Math.floor(p.x - r); x <= p.x + r; x++) {
    if (IN(g, x, y) && Math.hypot(x - p.x, y - p.y) <= r && !g.res[y * g.w + x]) g.res[y * g.w + x] = 1;
  }
}
// l'axe des départs : t de 0 (bande) à 1 (ennemis), q la distance (signée) à la ligne qui les joint
function axisOf(g) {
  const dx = g.eA.x - g.pA.x, dy = g.eA.y - g.pA.y, L = Math.hypot(dx, dy) || 1;
  g.D = L; g.ax = dx / L; g.ay = dy / L;
}
const tOf = (g, x, y) => ((x - g.pA.x) * g.ax + (y - g.pA.y) * g.ay) / g.D;
const qOf = (g, x, y) => -(x - g.pA.x) * g.ay + (y - g.pA.y) * g.ax;
const ptF = (g, t, q) => ({ x: g.pA.x + g.ax * g.D * t - g.ay * q, y: g.pA.y + g.ay * g.D * t + g.ax * q });
const ptAt = (g, t, q) => { const p = ptF(g, t, q); return { x: Math.round(p.x), y: Math.round(p.y) }; };

// bruit de valeur lissé (pour les bords organiques)
function noise(R, w, h, sc) {
  const gw = Math.ceil(w / sc) + 2, gh = Math.ceil(h / sc) + 2, v = new Float32Array(gw * gh);
  for (let i = 0; i < v.length; i++) v[i] = R();
  return (x, y) => {
    const fx = clamp(x, 0, w) / sc, fy = clamp(y, 0, h) / sc, ix = Math.floor(fx), iy = Math.floor(fy);
    let tx = fx - ix, ty = fy - iy;
    tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty);
    const a = v[iy * gw + ix], b = v[iy * gw + ix + 1], c = v[(iy + 1) * gw + ix], d = v[(iy + 1) * gw + ix + 1];
    return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
  };
}

// ------------------------------------------------------------ gabarits : petits décors dessinés en ASCII
const LEG = { '.': FLOOR, ',': PATH, '#': WALL, x: CRATE, '*': BUSH, '~': WATER, P: CHEST, s: SAND, T: TABLE, C: COUNTER, '=': RAIL, f: FENCE, i: PILLAR };
function T(rows, deco = {}) {
  const out = [];
  rows.forEach((r, y) => [...r].forEach((ch, x) => { if (ch !== ' ') out.push([x, y, LEG[ch], deco[ch] || 0]); }));
  return out;
}
// les huit symétries d'un gabarit
function xf(fp, t) {
  return fp.map(([x, y, v, d]) => {
    let X = t & 1 ? -x : x, Y = t & 2 ? -y : y;
    if (t & 4) [X, Y] = [Y, X];
    return [X, Y, v, d];
  });
}
// Le gabarit tient-il en (ox, oy) ? Sur du sol, hors des réserves (soft2 : la piste peut être recouverte), et avec
// une marge de m cases sans autre obstacle autour (on garde des passages) ; edge : le vide et le bord sont permis.
// soft2 : 1 (ou true) permet la piste, 2 aussi la zone des départs (jamais les cases gardées)
function fits(g, fp, ox, oy, m = 1, edge = false, soft2 = false) {
  const w = g.w;
  for (const [x, y] of fp) {
    const X = ox + x, Y = oy + y;
    if (!IN(g, X, Y)) return false;
    const r = g.res[Y * w + X];
    if ((r && !((soft2 && r === 2) || (soft2 === 2 && r === 1))) || !isGround(g.c[Y * w + X])) return false;
  }
  if (!m) return true;
  for (const [x, y, v] of fp) {
    if (!MOVE[v]) continue;
    const X = ox + x, Y = oy + y;
    for (let dy = -m; dy <= m; dy++) for (let dx = -m; dx <= m; dx++) {
      if (!dx && !dy) continue;
      const XX = X + dx, YY = Y + dy;
      if (!IN(g, XX, YY)) { if (!edge) return false; continue; }
      if (fp.some(([a, b]) => a + ox === XX && b + oy === YY)) continue;
      const c = g.c[YY * w + XX];
      if (c === VOID ? !edge : MOVE[c]) return false;
    }
  }
  return true;
}
function stamp(g, fp, ox, oy) { for (const [x, y, v, d] of fp) set(g, ox + x, oy + y, v, d); }
// pose un gabarit (ou l'un d'une liste) au hasard : près d'un point, parmi des cases candidates, ou n'importe où
function place(g, fps, o = {}) {
  const R = g.R, { tries = 30, m = 1, edge = false, rot = true, near = null, rad = 3, cands = null, ok = null, soft2 = false } = o;
  const list = Array.isArray(fps[0][0]);
  for (let t = 0; t < tries; t++) {
    const fp0 = list ? pick(R, fps) : fps;
    const fp = rot ? xf(fp0, Math.floor(R() * 8)) : fp0;
    let x, y;
    if (near) { const a = R() * 6.2832, r = R() * rad; x = Math.round(near.x + Math.cos(a) * r); y = Math.round(near.y + Math.sin(a) * r); }
    else if (cands) { if (!cands.length) return null; const k = cands[Math.floor(R() * cands.length)]; x = k % g.w; y = (k - x) / g.w; }
    else { x = Math.floor(R() * g.w); y = Math.floor(R() * g.h); }
    if (ok && !ok(x, y)) continue;
    if (fits(g, fp, x, y, m, edge, soft2)) { stamp(g, fp, x, y); return { x, y }; }
  }
  return null;
}
function scatter(g, fps, n, o = {}) { let k = 0; for (let i = 0; i < n; i++) if (place(g, fps, o)) k++; return k; }
// une tache irrégulière (rocher, mare, buisson…) qui ne déborde ni sur les réserves ni sur les autres décors
function blob(g, cx, cy, rx, ry, v, d, jag = 0.25, on = soft) {
  const R = g.R, p1 = R() * 6.28, p2 = R() * 6.28;
  let n = 0;
  for (let y = Math.floor(cy - ry - 1); y <= Math.ceil(cy + ry + 1); y++) for (let x = Math.floor(cx - rx - 1); x <= Math.ceil(cx + rx + 1); x++) {
    if (!IN(g, x, y)) continue;
    const k = y * g.w + x;
    if (g.res[k] || !on(g.c[k])) continue;
    const dx = (x - cx) / rx, dy = (y - cy) / ry, a = Math.atan2(dy, dx);
    const lim = 1 + jag * (0.6 * Math.sin(a * 3 + p1) + 0.4 * Math.sin(a * 5 + p2));
    if (dx * dx + dy * dy > lim * lim) continue;
    g.c[k] = v; g.d[k] = d; n++;
  }
  return n;
}
// une case libre au hasard qui vérifie ok
function spotWhere(g, ok, tries = 40) {
  for (let t = 0; t < tries; t++) {
    const x = Math.floor(g.R() * g.w), y = Math.floor(g.R() * g.h), k = y * g.w + x;
    if (!g.res[k] && isGround(g.c[k]) && ok(x, y)) return { x, y };
  }
  return null;
}
const awayFromStarts = (g, r) => (x, y) => Math.hypot(x - g.pA.x, y - g.pA.y) > r && Math.hypot(x - g.eA.x, y - g.eA.y) > r;
const midBand = (g, a = 0.15, b = 0.85) => (x, y) => { const t = tOf(g, x, y); return t > a && t < b; };

// ------------------------------------------------------------ briques
const B = {
  cactus: T(['i'], { i: D.CACTUS }),
  palmier: T(['i'], { i: D.PALMIER }),
  arbreMort: T(['i'], { i: D.ARBRE_MORT }),
  chariot: [T(['xx'], { x: D.CHARIOT }), T(['xxx'], { x: D.CHARIOT }), T(['xx', ' x'], { x: D.CHARIOT })],
  roche: [T(['x'], { x: D.ROCHE }), T(['xx'], { x: D.ROCHE }), T(['x'], { x: D.ROCHE }), T(['xx', ' x'], { x: D.ROCHE })],
  rocher: [T(['#'], { '#': D.ROCHER }), T(['##'], { '#': D.ROCHER })],
  caisses: [T(['x'], { x: D.CAISSE }), T(['xx'], { x: D.CAISSE }), T(['x'], { x: D.TONNEAU }), T(['xx'], { x: D.TONNEAU }), T(['xP'], { x: D.CAISSE, P: D.POUDRE })],
  sacs: [T(['sss'], { s: D.SACS }), T(['ss'], { s: D.SACS }), T(['ss', ' s'], { s: D.SACS })],
  meule: [T(['x'], { x: D.MEULE }), T(['xx'], { x: D.MEULE })],
  barriere: [T(['fff'], { f: D.ENCLOS }), T(['ff'], { f: D.ENCLOS }), T(['fff', '  f'], { f: D.ENCLOS })],
  bille: [T(['xx'], { x: D.BILLE }), T(['xxx'], { x: D.BILLE })],
  souche: T(['x'], { x: D.SOUCHE }),
  arbre: T(['#'], { '#': D.ARBRE }),
  tronc: T(['i'], { i: D.TRONC }),
  sapin: T(['i'], { i: D.SAPIN }),
  grosSapin: T(['#'], { '#': D.SAPIN }),
  congere: [T(['ss'], { s: D.CONGERE }), T(['sss'], { s: D.CONGERE }), T(['ss', ' s'], { s: D.CONGERE })],
  tombe: T(['x'], { x: D.TOMBE }),
  puits: T(['~'], { '~': D.PUITS }),
  abreuvoir: T(['~~'], { '~': D.ABREUVOIR }),
  buches: [T(['x'], { x: D.BUCHES }), T(['xx'], { x: D.BUCHES })],
  poudre: [T(['P'], { P: D.POUDRE }), T(['PP'], { P: D.POUDRE })],
};
// les décors qui coupent la vue, posés entre les deux camps s'ils se voient trop au départ
const BLOCK = {
  desert: [T(['##', '##'], { '#': D.ROCHER }), T(['##'], { '#': D.ROCHER }), T(['##', ' #'], { '#': D.MESA }), T(['i i'], { i: D.CACTUS })],
  canyon: [T(['##', '##'], { '#': D.ROCHER }), T(['##'], { '#': D.ROCHER }), T(['###'], { '#': D.ROCHER })],
  prairie: [T(['##'], { '#': D.ARBRE }), T(['##', '#*'], { '#': D.ARBRE, '*': D.BROUSSAILLE }), T(['*#*'], { '#': D.ARBRE, '*': D.BROUSSAILLE }), T(['###'], { '#': D.CABANE })],
  foret: [T(['#'], { '#': D.ARBRE }), T(['##'], { '#': D.ARBRE }), T(['i'], { i: D.TRONC }), T(['#*'], { '#': D.ARBRE, '*': D.FOUGERE })],
  neige: [T(['i'], { i: D.SAPIN }), T(['#'], { '#': D.SAPIN }), T(['##'], { '#': D.ROCHER })],
  mine: [T(['#'], { '#': D.ROCHER }), T(['##'], { '#': D.ROCHER }), T(['i'], { i: D.ETAI })],
  saloon: [T(['###'], { '#': D.PARAVENT }), T(['##'], { '#': D.ETAGERE }), T(['i'], { i: D.POTEAU })],
  ville: [T(['##', '##'], { '#': D.CABANE }), T(['#'], { '#': D.CABANE }), T(['##'], { '#': D.CABANE })],
  hacienda: [T(['###'], { '#': D.MUR_ADOBE }), T(['##'], { '#': D.MUR_ADOBE }), T(['i'], { i: D.COLONNE })],
};
// les couverts posés devant chaque camp au départ
const KIT = {
  desert: [...B.chariot, ...B.roche, B.cactus, ...B.caisses],
  canyon: [...B.roche, ...B.chariot, ...B.caisses],
  prairie: [...B.meule, ...B.chariot, ...B.barriere, ...B.caisses],
  foret: [...B.bille, B.souche, ...B.roche, B.tronc],
  neige: [...B.congere, ...B.roche, B.sapin, ...B.bille],
  mine: [...B.caisses, T(['x'], { x: D.WAGONNET }), ...B.sacs],
  saloon: [T(['T'], {}), T(['TT'], {}), ...B.caisses],
  ville: [...B.caisses, ...B.chariot, ...B.sacs, T(['ff'], { f: D.ATTACHE })],
  hacienda: [...B.sacs, ...B.caisses, ...B.roche, B.cactus],
};

// ------------------------------------------------------------ formes (le vide autour)
function shapeMask(g, shape) {
  const { w, h, R } = g, m = new Uint8Array(w * h);
  const N = noise(R, w, h, 3.5 + R() * 2);
  const cx = (w - 1) / 2, cy = (h - 1) / 2;
  const sp = 2.6 + R() * 1.2, bw = 0.42 + R() * 0.12;
  const cut = R() < 0.5 ? 'tl' : 'br', cw = w * (0.32 + R() * 0.12), ch = h * (0.32 + R() * 0.12);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const n = N(x, y), dep = Math.min(x, y, w - 1 - x, h - 1 - y);
    let inside = true;
    if (shape === 'rect') inside = dep >= 2 || n > [0.6, 0.4][dep];
    else if (shape === 'plateau') inside = dep >= 3 || n > [0.7, 0.5, 0.3][dep];
    else if (shape === 'ile' || shape === 'cuvette') {
      const p = shape === 'ile' ? sp : 2.2, amp = shape === 'ile' ? 0.34 : 0.12;
      const u = Math.abs(x - cx) / (cx + 0.6), v = Math.abs(y - cy) / (cy + 0.6);
      inside = Math.pow(Math.pow(u, p) + Math.pow(v, p), 1 / p) < 1.0 - (n - 0.5) * amp;
    } else if (shape === 'diag') {
      const u = x / (w - 1), v = 1 - y / (h - 1);
      inside = Math.abs(u - v) < bw + (n - 0.5) * 0.22;
    } else if (shape === 'L') {
      const X = cut === 'tl' ? x : w - 1 - x, Y = cut === 'tl' ? y : h - 1 - y;
      const ex = cw + (n - 0.5) * 3, ey = ch + (n - 0.5) * 3, r = 3;
      let inCut = X < ex && Y < ey;
      if (inCut && X > ex - r && Y > ey - r) inCut = Math.hypot(X - (ex - r), Y - (ey - r)) < r;
      inside = !inCut && (dep >= 1 || n > 0.5);
    }
    m[y * w + x] = inside ? 1 : 0;
  }
  smooth(g, m);
  return m;
}
// lisse le bord : pas de dents ni d'échancrures d'une case, un seul morceau, pas de trou au milieu
function smooth(g, m) {
  const { w, h } = g;
  const nb = (x, y, self) => (IN(g, x, y) ? m[y * w + x] : self);
  for (let it = 0; it < 3; it++) {
    const m2 = m.slice();
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const s = m[y * w + x];
      let c = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dx || dy) c += nb(x + dx, y + dy, s);
      if (c >= 5) m2[y * w + x] = 1; else if (c <= 3) m2[y * w + x] = 0;
    }
    m.set(m2);
  }
  for (let it = 0; it < 6; it++) {
    let ch = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const k = y * w + x, s = m[k];
      const c4 = nb(x + 1, y, s) + nb(x - 1, y, s) + nb(x, y + 1, s) + nb(x, y - 1, s);
      if (s && c4 <= 1) { m[k] = 0; ch++; } else if (!s && c4 >= 3) { m[k] = 1; ch++; }
    }
    if (!ch) break;
  }
  // le plus grand morceau, et les trous refermés
  const lab = new Int32Array(w * h).fill(-1);
  let best = -1, bestN = 0, id = 0;
  for (let s = 0; s < w * h; s++) {
    if (!m[s] || lab[s] >= 0) continue;
    const q = [s]; lab[s] = id;
    for (let i = 0; i < q.length; i++) {
      const k = q[i], x = k % w, y = (k - x) / w;
      for (const kk of [x > 0 ? k - 1 : -1, x < w - 1 ? k + 1 : -1, y > 0 ? k - w : -1, y < h - 1 ? k + w : -1]) {
        if (kk >= 0 && m[kk] && lab[kk] < 0) { lab[kk] = id; q.push(kk); }
      }
    }
    if (q.length > bestN) { bestN = q.length; best = id; }
    id++;
  }
  for (let k = 0; k < w * h; k++) if (m[k] && lab[k] !== best) m[k] = 0;
  const out = new Uint8Array(w * h), q = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const k = y * w + x;
    if (!m[k] && (x === 0 || y === 0 || x === w - 1 || y === h - 1)) { out[k] = 1; q.push(k); }
  }
  for (let i = 0; i < q.length; i++) {
    const k = q[i], x = k % w, y = (k - x) / w;
    for (const kk of [x > 0 ? k - 1 : -1, x < w - 1 ? k + 1 : -1, y > 0 ? k - w : -1, y < h - 1 ? k + w : -1]) {
      if (kk >= 0 && !m[kk] && !out[kk]) { out[kk] = 1; q.push(kk); }
    }
  }
  for (let k = 0; k < w * h; k++) if (!m[k] && !out[k]) m[k] = 1;
}
// distance (en cases, 8 directions) au vide ou au bord
function depthOf(g, m) {
  const { w, h } = g, dep = new Uint8Array(w * h).fill(255), q0 = [], q1 = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const k = y * w + x;
    if (!m[k]) { dep[k] = 0; q0.push(k); } else if (x === 0 || y === 0 || x === w - 1 || y === h - 1) { dep[k] = 1; q1.push(k); }
  }
  const q = q0.concat(q1);
  for (let i = 0; i < q.length; i++) {
    const k = q[i], x = k % w, y = (k - x) / w, d = dep[k] + 1;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const X = x + dx, Y = y + dy;
      if (!IN(g, X, Y)) continue;
      const kk = Y * w + X;
      if (dep[kk] > d) { dep[kk] = d; q.push(kk); }
    }
  }
  return dep;
}
// les deux départs : aux deux bouts de la forme, le long d'un axe (diagonale bas-gauche → haut-droite, pente douce
// ou horizontal), assez loin l'un de l'autre
function findAnchors(g, m, dep, axes) {
  const { w, h } = g;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (m[y * w + x]) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const diag = Math.hypot(x1 - x0 + 1, y1 - y0 + 1), cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  for (const ax of axes) {
    let dx = 1, dy = 0;
    if (ax === 'diag') { dx = w; dy = -h; } else if (ax === 'pente') { dx = w; dy = -h * 0.5; }
    const L = Math.hypot(dx, dy); dx /= L; dy /= L;
    let smin = 1e9, smax = -1e9;
    for (let k = 0; k < w * h; k++) if (dep[k] >= 2) { const s = (k % w) * dx + Math.floor(k / w) * dy; smin = Math.min(smin, s); smax = Math.max(smax, s); }
    let P = null, E = null, bp = 1e9, be = 1e9;
    for (let k = 0; k < w * h; k++) {
      if (dep[k] < 2) continue;
      const x = k % w, y = (k - x) / w, s = x * dx + y * dy, perp = Math.abs(-(x - cx) * dy + (y - cy) * dx);
      if (s <= smin + 1.2 && perp < bp) { bp = perp; P = { x, y }; }
      if (s >= smax - 1.2 && perp < be) { be = perp; E = { x, y }; }
    }
    if (P && E && Math.hypot(E.x - P.x, E.y - P.y) >= 0.72 * diag) return [P, E];
  }
  return null;
}
// Prépare un terrain d'extérieur : la forme, les départs, leurs réserves
function outdoor(g, shapes, cliff = D.FALAISE, axes = null) {
  const R = g.R;
  for (let tries = 0; tries < 7; tries++) {
    const shape = tries < 5 ? pick(R, shapes) : 'plein';
    const m = shapeMask(g, shape);
    const dep = depthOf(g, m);
    const an = findAnchors(g, m, dep, axes || (R() < 0.55 ? ['diag', 'pente', 'horiz'] : ['horiz', 'pente', 'diag']));
    if (!an) continue;
    let inside = 0;
    for (let k = 0; k < g.n; k++) { g.c[k] = m[k] ? FLOOR : VOID; g.d[k] = 0; g.res[k] = 0; inside += m[k]; }
    g.shape = shape; g.S = inside / 660;
    [g.pA, g.eA] = an;
    axisOf(g);
    reserve(g, g.pA, 2.3); reserve(g, g.eA, 2.3);
    // un plateau : des falaises au bord du vide
    if (shape === 'plateau') {
      const N = noise(R, g.w, g.h, 3);
      for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) {
        const k = y * g.w + x;
        if (g.c[k] !== FLOOR || g.res[k] || dep[k] !== 1 || N(x, y) < 0.42) continue;
        g.c[k] = WALL; g.d[k] = cliff;
      }
    }
    return;
  }
}
// La piste (ou le sentier) : le chemin le plus commode d'un départ à l'autre, qui serpente un peu ; on n'y pose rien
function trail(g, d = D.PISTE, reserveIt = true) {
  const N = noise(g.R, g.w, g.h, 3);
  const goal = g.eA.y * g.w + g.eA.x;
  const path = dijkstra(g, [g.pA.y * g.w + g.pA.x], (k) => k === goal, (k) => {
    const v = g.c[k];
    if (v === VOID) return -1;
    return (MOVE[v] ? 40 : 1) + N(k % g.w, Math.floor(k / g.w)) * 5 + (v === BUSH ? 2 : 0);
  });
  if (!path) return;
  for (const k of path) {
    if (g.c[k] === FLOOR || g.c[k] === BUSH) { g.c[k] = PATH; g.d[k] = d; }
    if (reserveIt && !g.res[k] && g.c[k] === PATH) g.res[k] = 2;
  }
}
function dijkstra(g, srcs, goal, cost) {
  const dist = new Float64Array(g.n).fill(Infinity), prev = new Int32Array(g.n).fill(-1), H = [];
  const push = (d, k) => {
    H.push([d, k]);
    let i = H.length - 1;
    while (i > 0) { const p = (i - 1) >> 1; if (H[p][0] <= H[i][0]) break; [H[p], H[i]] = [H[i], H[p]]; i = p; }
  };
  const pop = () => {
    const top = H[0], last = H.pop();
    if (H.length) {
      H[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < H.length && H[l][0] < H[m][0]) m = l;
        if (r < H.length && H[r][0] < H[m][0]) m = r;
        if (m === i) break;
        [H[m], H[i]] = [H[i], H[m]]; i = m;
      }
    }
    return top;
  };
  for (const s of srcs) { dist[s] = 0; push(0, s); }
  while (H.length) {
    const [d0, k] = pop();
    if (d0 > dist[k]) continue;
    if (goal(k)) { const out = []; for (let c = k; c >= 0; c = prev[c]) out.unshift(c); return out; }
    const x = k % g.w, y = (k - x) / g.w;
    for (const kk of [x > 0 ? k - 1 : -1, x < g.w - 1 ? k + 1 : -1, y > 0 ? k - g.w : -1, y < g.h - 1 ? k + g.w : -1]) {
      if (kk < 0) continue;
      const c = cost(kk);
      if (c < 0) continue;
      const nd = d0 + c;
      if (nd < dist[kk]) { dist[kk] = nd; prev[kk] = k; push(nd, kk); }
    }
  }
  return null;
}

// ------------------------------------------------------------ briques plus grandes
function mesa(g, r, d = D.MESA, ok = null) {
  const R = g.R;
  const p = spotWhere(g, (x, y) => awayFromStarts(g, r + 3.2)(x, y) && (!ok || ok(x, y)));
  if (!p) return null;
  blob(g, p.x, p.y, r * (0.85 + R() * 0.4), r * (0.7 + R() * 0.35), WALL, d, 0.3);
  scatter(g, B.roche, ri(R, 1, 3), { near: p, rad: r + 2.5, tries: 12 });
  return p;
}
// Une rivière (boueuse, claire, ou gelée) en travers de l'axe, avec des gués (ou un pont) espacés
function river(g, t0, d, nf = 2, bridge = false, wd = 0) {
  const R = g.R, amp = 1 + R() * 1.8, fr = 0.14 + R() * 0.14, ph = R() * 6.28;
  wd = wd || (R() < 0.5 ? 2 : 3);
  const L = Math.hypot(g.w, g.h), centers = [];
  const r2 = (wd / 2) * (wd / 2) + 0.1;
  for (let s = -L; s <= L; s += 0.35) {
    const c = ptF(g, t0 + (amp * Math.sin(s * fr + ph)) / g.D, s);
    if (IN(g, Math.round(c.x), Math.round(c.y)) && AT(g, Math.round(c.x), Math.round(c.y)) !== VOID) centers.push({ s, ...c });
    for (let y = Math.floor(c.y - wd); y <= c.y + wd; y++) for (let x = Math.floor(c.x - wd); x <= c.x + wd; x++) {
      if (!IN(g, x, y) || (x + 0.5 - c.x) ** 2 + (y + 0.5 - c.y) ** 2 > r2) continue;
      const k = y * g.w + x;
      if (g.res[k] || !soft(g.c[k])) continue;
      g.c[k] = WATER; g.d[k] = d;
    }
  }
  if (!centers.length) return;
  // les gués, répartis le long du cours (et jamais bouchés ensuite)
  for (let i = 0; i < nf; i++) {
    const f = clamp((i + 0.5 + (R() - 0.5) * 0.4) / nf, 0.1, 0.9);
    const c = centers[Math.floor(f * (centers.length - 1))];
    const isBridge = bridge && i === 0;
    const rr = wd / 2 + 0.45;
    for (let y = Math.floor(c.y - rr - 1); y <= c.y + rr + 1; y++) for (let x = Math.floor(c.x - rr - 1); x <= c.x + rr + 1; x++) {
      if (!IN(g, x, y) || Math.hypot(x + 0.5 - c.x, y + 0.5 - c.y) > rr) continue;
      const k = y * g.w + x;
      if (g.c[k] === WATER) { g.c[k] = isBridge ? PATH : FLOOR; g.d[k] = isBridge ? D.PONT : D.GUE; }
      if (g.c[k] !== VOID && !MOVE[g.c[k]]) g.res[k] = 3;
    }
  }
}
// Les parois d'un défilé : la roche au-delà d'une demi-largeur de l'axe
function sideWalls(g, Hw, d, amp = 1.2) {
  const N = noise(g.R, g.w, g.h, 3), ph = g.R() * 6.28;
  for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) {
    const k = y * g.w + x;
    if (g.res[k] || !soft(g.c[k])) continue;
    const t = tOf(g, x, y), q = Math.abs(qOf(g, x, y));
    const lim = Hw + (N(x, y) - 0.5) * 2 * amp + Math.sin(t * 7 + ph) * 0.8;
    if (q > lim) { g.c[k] = WALL; g.d[k] = d; }
  }
}
// une butte, allongée le long de l'axe, au milieu du passage
function butte(g, t0, q0, ra, rq, d) {
  const R = g.R, p1 = R() * 6.28;
  for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) {
    const k = y * g.w + x;
    if (g.res[k] || !soft(g.c[k])) continue;
    const dt = ((tOf(g, x, y) - t0) * g.D) / ra, dq = (qOf(g, x, y) - q0) / rq;
    const a = Math.atan2(dq, dt);
    if (dt * dt + dq * dq < (1 + 0.18 * Math.sin(a * 3 + p1)) ** 2) { g.c[k] = WALL; g.d[k] = d; }
  }
}
// Une bâtisse : murs (déco d), plancher dedans, des portes (gardées libres) sur les côtés demandés ('n','s','e','w')
function building(g, x0, y0, bw, bh, { d = D.MUR_BOIS, floor = D.PLANCHER, doors = [], m = 1, solid = false, wide = 1, door = D.PORTE } = {}) {
  const x1 = x0 + bw - 1, y1 = y0 + bh - 1;
  for (let y = y0 - m; y <= y1 + m; y++) for (let x = x0 - m; x <= x1 + m; x++) {
    const inside = x >= x0 && x <= x1 && y >= y0 && y <= y1;
    if (inside) { if (!IN(g, x, y) || g.res[y * g.w + x] || !soft(g.c[y * g.w + x])) return false; }
    else if (obst(AT(g, x, y))) return false;
  }
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const edge = x === x0 || x === x1 || y === y0 || y === y1;
    put(g, x, y, edge || solid ? WALL : FLOOR, edge || solid ? d : floor);
  }
  const out = [];
  for (const s of doors) {
    const len = s === 'n' || s === 's' ? bw : bh, wd = Math.min(wide, len - 2);
    const off = ri(g.R, 1, len - 1 - wd);
    for (let i = 0; i < wd; i++) {
      const x = s === 'w' ? x0 : s === 'e' ? x1 : x0 + off + i, y = s === 'n' ? y0 : s === 's' ? y1 : y0 + off + i;
      const ox = s === 'w' ? -1 : s === 'e' ? 1 : 0, oy = s === 'n' ? -1 : s === 's' ? 1 : 0;
      if (solid) { put(g, x, y, WALL, D.PORTE_CLOSE); continue; }
      put(g, x, y, FLOOR, door);
      keep(g, x, y); keep(g, x + ox, y + oy); keep(g, x - ox, y - oy);
      out.push({ x, y, ox, oy });
    }
  }
  // un meuble dedans, s'il y a la place
  if (!solid && bw >= 5 && bh >= 5) place(g, [T(['x'], { x: D.CAISSE }), T(['T'], {}), T(['x'], { x: D.TONNEAU })], { cands: interiorCells(g, x0, y0, x1, y1), tries: 6 });
  return out;
}
function interiorCells(g, x0, y0, x1, y1) {
  const out = [];
  for (let y = y0 + 1; y < y1; y++) for (let x = x0 + 1; x < x1; x++) if (IN(g, x, y)) out.push(y * g.w + x);
  return out;
}
// essaie de poser une bâtisse quelque part où ok(x0, y0) le permet
function placeBuilding(g, bw, bh, opts, ok = () => true, tries = 40) {
  for (let t = 0; t < tries; t++) {
    const x0 = ri(g.R, 1, g.w - bw - 1), y0 = ri(g.R, 1, g.h - bh - 1);
    if (!ok(x0 + bw / 2, y0 + bh / 2)) continue;
    const doors = building(g, x0, y0, bw, bh, opts);
    if (doors) return { x0, y0, x1: x0 + bw - 1, y1: y0 + bh - 1, doors };
  }
  return null;
}
// un enclos de barrières (avec des ouvertures)
function fenceRect(g, x0, y0, fw, fh, d = D.ENCLOS, gaps = 2) {
  const per = [];
  for (let x = x0; x < x0 + fw; x++) { per.push([x, y0]); per.push([x, y0 + fh - 1]); }
  for (let y = y0 + 1; y < y0 + fh - 1; y++) { per.push([x0, y]); per.push([x0 + fw - 1, y]); }
  const holes = new Set();
  for (let i = 0; i < gaps; i++) {
    const c = per[Math.floor(g.R() * per.length)];
    for (const [x, y] of per) if (Math.abs(x - c[0]) + Math.abs(y - c[1]) <= 1) holes.add(x * 1000 + y);
  }
  const fp = per.filter(([x, y]) => !holes.has(x * 1000 + y)).map(([x, y]) => [x, y, FENCE, d]);
  if (!fits(g, fp, 0, 0, 1)) return false;
  stamp(g, fp, 0, 0);
  return true;
}
function bushes(g, d, n, rmax = 1.6) {
  const R = g.R;
  for (let i = 0; i < n; i++) {
    const p = spotWhere(g, (x, y) => g.c[y * g.w + x] === FLOOR, 12);
    if (p) blob(g, p.x, p.y, 0.6 + R() * rmax, 0.6 + R() * rmax * 0.8, BUSH, d, 0.35, (v) => v === FLOOR);
  }
}
// Couverts devant chaque camp : quelques décors à 3-5 cases du départ, du côté de l'adversaire
function staging(g, kit, n = 3, zoneE = null, kitP = null) {
  const R = g.R;
  for (const [A, Bp, zone, kk] of [[g.pA, g.eA, null, kitP || kit], [g.eA, g.pA, zoneE, kit]]) {
    const dir = Math.atan2(Bp.y - A.y, Bp.x - A.x);
    let k = 0;
    for (let t = 0; t < 80 && k < n; t++) {
      const a = dir + (R() - 0.5) * 3.0, r = 2.6 + R() * 2.2;
      const x = Math.round(A.x + Math.cos(a) * r), y = Math.round(A.y + Math.sin(a) * r);
      if (zone && !zone(x, y)) continue;
      const fp = xf(pick(R, kk), Math.floor(R() * 8));
      if (fits(g, fp, x, y, 1, false, true)) { stamp(g, fp, x, y); k++; }
    }
  }
}
function campfire(g, near, r = 4) {
  for (let t = 0; t < 30; t++) {
    const x = near.x + ri(g.R, -3, 3), y = near.y + ri(g.R, -3, 3);
    if (AT(g, x, y) === FLOOR && Math.hypot(x - near.x, y - near.y) >= 1.5) { g.d[y * g.w + x] = D.FEU; g.lights.push({ x, y, r }); return; }
  }
}

// ------------------------------------------------------------ thèmes d'extérieur
function genDesert(g) {
  const R = g.R;
  outdoor(g, ['plein', 'rect', 'rect', 'ile', 'diag', 'L', 'cuvette', 'plateau'], D.FALAISE);
  const tpl = g.tpl = pick(R, ['dunes', 'mesas', 'oasis', 'ranch', 'cimetiere']);
  const mid = midBand(g);
  if (tpl === 'mesas') { const n = cnt(g, 4.5); for (let i = 0; i < n; i++) mesa(g, 1.7 + R() * 1.5); }
  else { const n = cnt(g, 3); for (let i = 0; i < n; i++) mesa(g, 1.2 + R() * 1.1); }
  if (tpl === 'oasis') {
    const c = ptAt(g, 0.4 + R() * 0.2, ri(R, -3, 3));
    blob(g, c.x, c.y, 1.8 + R() * 1.4, 1.4 + R() * 1.0, WATER, D.MARE, 0.25);
    for (let y = c.y - 5; y <= c.y + 5; y++) for (let x = c.x - 6; x <= c.x + 6; x++) {
      if (AT(g, x, y) !== FLOOR || g.res[y * g.w + x]) continue;
      let near = false;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (AT(g, x + dx, y + dy) === WATER) near = true;
      if (near && R() < 0.5) set(g, x, y, BUSH, D.ROSEAUX);
    }
    scatter(g, B.palmier, ri(R, 2, 4), { near: c, rad: 5, tries: 20 });
  }
  if (tpl === 'ranch') {
    const sideQ = R() < 0.5 ? -1 : 1;
    const hb = placeBuilding(g, ri(R, 6, 7), 5, { d: D.MUR_ADOBE, floor: 0, doors: ['s', 'w'] }, (x, y) => mid(x, y) && qOf(g, x, y) * sideQ > 1);
    if (hb) for (let i = 0, n = ri(R, 2, 3); i < n; i++) { // le toit est tombé, les murs sont percés
      const x = ri(R, hb.x0 + 1, hb.x1 - 1), y = R() < 0.5 ? hb.y0 : hb.y1;
      if (g.c[y * g.w + x] === WALL) put(g, x, y, FLOOR, D.BRECHE);
    }
    for (let t = 0; t < 20; t++) {
      const fw = ri(R, 6, 8), fh = ri(R, 5, 6), x0 = ri(R, 1, g.w - fw - 1), y0 = ri(R, 1, g.h - fh - 1);
      if (mid(x0 + fw / 2, y0 + fh / 2) && qOf(g, x0 + fw / 2, y0 + fh / 2) * sideQ < 0 && fenceRect(g, x0, y0, fw, fh, D.ENCLOS, 2)) break;
    }
    place(g, B.puits, { ok: mid });
    scatter(g, B.abreuvoir, 2, { ok: mid });
  }
  if (tpl === 'cimetiere') {
    const c = ptAt(g, 0.45 + R() * 0.1, (R() < 0.5 ? -1 : 1) * ri(R, 2, 4));
    for (let r = 0; r < 3; r++) for (let k = 0; k < 4; k++) if (R() < 0.8) place(g, B.tombe, { near: { x: c.x - 3 + k * 2, y: c.y - 2 + r * 2 }, rad: 0, tries: 1 });
    place(g, B.arbreMort, { near: c, rad: 4 });
    placeBuilding(g, 5, 4, { d: D.MUR_ADOBE, floor: 0, doors: ['w', 'e'] }, (x, y) => mid(x, y) && Math.hypot(x - c.x, y - c.y) > 5);
  }
  trail(g);
  scatter(g, B.cactus, cnt(g, tpl === 'dunes' ? 20 : 13));
  scatter(g, B.roche, cnt(g, 9));
  scatter(g, B.rocher, cnt(g, tpl === 'dunes' ? 6 : 3), { ok: mid });
  scatter(g, B.chariot, cnt(g, tpl === 'cimetiere' ? 4 : 2.5), { ok: mid });
  scatter(g, B.caisses, cnt(g, 2.5), { ok: mid });
  bushes(g, D.BROUSSAILLE, cnt(g, 6));
  staging(g, KIT.desert);
}

function genCanyon(g) {
  const R = g.R;
  outdoor(g, ['plein', 'plein', 'rect', 'diag', 'L', 'plateau'], D.FALAISE);
  const tpl = g.tpl = pick(R, ['defile', 'gue', 'eboulis']);
  const mn = Math.min(g.w, g.h);
  const Hw = clamp(mn * (tpl === 'defile' ? 0.4 : 0.44), 6.5, 11);
  sideWalls(g, Hw, D.FALAISE);
  if (tpl === 'defile') {
    butte(g, 0.5, ri(R, -1, 1), g.D * (0.1 + R() * 0.06), Math.min(Hw * 0.32, 2.8), D.MESA);
    if (g.D > 24 && R() < 0.7) { const s = R() < 0.5 ? -1 : 1; butte(g, 0.27, s * Hw * 0.5, 2.2, 1.4, D.ROCHER); butte(g, 0.73, -s * Hw * 0.5, 2.2, 1.4, D.ROCHER); }
  }
  if (tpl === 'gue') {
    river(g, 0.45 + R() * 0.1, D.BOUE, R() < 0.5 ? 2 : 3);
    const n = cnt(g, 2.5); for (let i = 0; i < n; i++) mesa(g, 0.9 + R() * 0.8, D.ROCHER);
    bushes(g, D.ROSEAUX, cnt(g, 3), 1.2);
  }
  if (tpl === 'eboulis') { const n = cnt(g, 8); for (let i = 0; i < n; i++) mesa(g, 0.7 + R() * 1.0, D.ROCHER, midBand(g, 0.12, 0.88)); }
  // corniches : des roches basses en ligne au pied des parois
  for (let i = 0, n = cnt(g, 6); i < n; i++) {
    const along = Math.abs(g.ax) > Math.abs(g.ay) ? T(['xxx'], { x: D.ROCHE }) : T(['x', 'x', 'x'], { x: D.ROCHE });
    place(g, along, { rot: false, ok: (x, y) => { const q = Math.abs(qOf(g, x, y)); return q > Hw - 3.5 && q < Hw - 1 && midBand(g, 0.1, 0.9)(x, y); }, tries: 25 });
  }
  if (R() < 0.5) trail(g, D.PISTE);
  scatter(g, B.roche, cnt(g, 11), { ok: midBand(g, 0.1, 0.9) });
  scatter(g, B.rocher, cnt(g, 6), { ok: midBand(g) });
  scatter(g, B.chariot, cnt(g, 0.8), { ok: midBand(g) });
  bushes(g, D.BROUSSAILLE, cnt(g, 3), 1.2);
  staging(g, KIT.canyon);
}

// un champ : des rangs de blé (on y passe, on y est moins visible), un sillon tous les trois rangs
function field(g, x0, y0, fw, fh) {
  const rows = g.R() < 0.5;
  let n = 0;
  for (let y = y0; y < y0 + fh; y++) for (let x = x0; x < x0 + fw; x++) {
    if (!IN(g, x, y) || g.res[y * g.w + x] || g.c[y * g.w + x] !== FLOOR) continue;
    const i = rows ? y - y0 : x - x0;
    if (i % 3 !== 2) { set(g, x, y, BUSH, D.BLE); n++; }
  }
  return n;
}
function genPrairie(g) {
  const R = g.R;
  outdoor(g, ['plein', 'plein', 'rect', 'ile', 'L', 'cuvette'], D.ROCHER);
  const tpl = g.tpl = pick(R, ['ferme', 'champs', 'bosquets', 'convoi']);
  const mid = midBand(g);
  const side = R() < 0.5 ? -1 : 1;
  if (tpl === 'ferme') {
    placeBuilding(g, ri(R, 6, 7), ri(R, 4, 5), { d: D.MUR_BOIS, doors: ['s', 'n'] }, (x, y) => mid(x, y) && qOf(g, x, y) * side > 2);
    const barn = placeBuilding(g, ri(R, 7, 8), ri(R, 5, 6), { d: D.MUR_BOIS, doors: ['w', 'e'], wide: 2 }, (x, y) => mid(x, y) && qOf(g, x, y) * side < -1);
    if (barn) scatter(g, B.meule, 2, { cands: interiorCells(g, barn.x0, barn.y0, barn.x1, barn.y1), tries: 8 });
  }
  if (tpl === 'champs') {
    const c = spotWhere(g, (x, y) => mid(x, y) && Math.abs(qOf(g, x, y)) > 2);
    if (c) place(g, T(['##', '##'], { '#': D.MOULIN }), { near: c, rad: 2, rot: false });
  }
  if (tpl === 'convoi') { // un cercle de chariots (des tronçons de deux ou trois, des trous entre eux) autour d'un feu
    const c = ptAt(g, 0.5 + (R() - 0.5) * 0.1, side * ri(R, 1, 3)), r = ri(R, 4, 5), ry = r * 0.8;
    const ring = [];
    for (let a = 0; a < 6.283; a += 0.05) {
      const x = Math.round(c.x + Math.cos(a) * r), y = Math.round(c.y + Math.sin(a) * ry);
      if (!ring.length || ring[ring.length - 1].x !== x || ring[ring.length - 1].y !== y) if (!ring.some((p) => p.x === x && p.y === y)) ring.push({ x, y });
    }
    const off = ri(R, 0, 4);
    ring.forEach((p, i) => { if ((i + off) % 6 < 4 && AT(g, p.x, p.y) === FLOOR && !g.res[p.y * g.w + p.x]) set(g, p.x, p.y, CRATE, D.CHARIOT); });
    for (let y = c.y - r - 1; y <= c.y + r + 1; y++) for (let x = c.x - r - 1; x <= c.x + r + 1; x++) {
      if (IN(g, x, y) && ((x - c.x) / (r + 1.2)) ** 2 + ((y - c.y) / (ry + 1.2)) ** 2 <= 1 && !g.res[y * g.w + x] && g.c[y * g.w + x] === FLOOR) g.res[y * g.w + x] = 3;
    }
    if (AT(g, c.x, c.y) === FLOOR) { g.d[c.y * g.w + c.x] = D.FEU; if (g.fog) g.lights.push({ x: c.x, y: c.y, r: 5 }); }
    for (const [dx, dy] of [[2, 0], [-2, 1], [0, -2]]) if (R() < 0.7 && AT(g, c.x + dx, c.y + dy) === FLOOR) set(g, c.x + dx, c.y + dy, CRATE, pick(R, [D.CAISSE, D.TONNEAU]));
  }
  // des champs et des barrières
  const nf = tpl === 'champs' ? ri(R, 3, 4) : tpl === 'ferme' ? ri(R, 1, 2) : R() < 0.5 ? 1 : 0;
  for (let i = 0; i < nf; i++) {
    const fw = ri(R, 5, 8), fh = ri(R, 4, 6);
    const p = spotWhere(g, (x, y) => mid(x, y) && Math.abs(qOf(g, x, y)) > 1.5);
    if (!p) continue;
    if (field(g, p.x - (fw >> 1), p.y - (fh >> 1), fw, fh)) {
      place(g, T(['i'], { i: D.EPOUVANTAIL }), { near: p, rad: 2, tries: 6 });
      scatter(g, B.barriere, 2, { near: p, rad: Math.max(fw, fh) * 0.7, tries: 15 });
    }
  }
  if (tpl === 'bosquets' || R() < 0.4) { // la mare
    const p = spotWhere(g, (x, y) => mid(x, y) && awayFromStarts(g, 6)(x, y));
    if (p) blob(g, p.x, p.y, 1.2 + R() * 1.2, 1 + R() * 0.8, WATER, D.MARE);
  }
  // bosquets : des buissons et un ou deux arbres
  for (let i = 0, n = cnt(g, tpl === 'bosquets' ? 7 : 4); i < n; i++) {
    const p = spotWhere(g, (x, y) => mid(x, y) || awayFromStarts(g, 5)(x, y));
    if (!p) continue;
    blob(g, p.x, p.y, 1 + R() * 1.4, 0.9 + R() * 1.1, BUSH, D.BROUSSAILLE, 0.3, (v) => v === FLOOR);
    for (let k = 0, m = ri(R, 1, 2); k < m; k++) {
      const x = p.x + ri(R, -1, 1), y = p.y + ri(R, -1, 1);
      if (AT(g, x, y) === BUSH && !g.res[y * g.w + x]) set(g, x, y, WALL, D.ARBRE);
    }
  }
  trail(g);
  scatter(g, B.meule, cnt(g, 7), { ok: mid });
  scatter(g, B.chariot, cnt(g, tpl === 'convoi' ? 1 : 2.5), { ok: mid });
  scatter(g, B.barriere, cnt(g, tpl === 'champs' ? 6 : 5), { ok: mid });
  scatter(g, B.arbre, cnt(g, 6), { ok: mid });
  scatter(g, B.caisses, cnt(g, 2), { ok: mid });
  bushes(g, D.BROUSSAILLE, cnt(g, 4));
  staging(g, KIT.prairie);
}

// des arbres, espacés d'une case au moins (parfois en paire), hors des clairières
function trees(g, dens, avoid = null, pine = false) {
  const R = g.R;
  let inside = 0;
  for (let k = 0; k < g.n; k++) if (g.c[k] !== VOID) inside++;
  const n = Math.round(dens * inside);
  const big = pine ? B.grosSapin : B.arbre, thin = pine ? B.sapin : B.tronc;
  const pair = T(['##'], { '#': pine ? D.SAPIN : D.ARBRE });
  let placed = 0;
  for (let t = 0; t < n * 4 && placed < n; t++) {
    const x = Math.floor(R() * g.w), y = Math.floor(R() * g.h);
    if (avoid && avoid(x, y)) continue;
    const r = R(), fp = r < 0.12 ? xf(pair, Math.floor(R() * 8)) : r < 0.55 ? big : thin;
    if (fits(g, fp, x, y, 1)) { stamp(g, fp, x, y); placed += fp.length; }
  }
}
function genForet(g) {
  const R = g.R;
  outdoor(g, ['plein', 'rect', 'rect', 'ile', 'diag', 'L'], D.ROCHER);
  const sparse = g.region === 'prairie';
  const tpl = g.tpl = pick(R, sparse ? ['clairseme', 'clairiere'] : ['futaie', 'riviere', 'clairiere']);
  if (tpl === 'riviere') river(g, 0.42 + R() * 0.16, D.RIVIERE, 2, R() < 0.6);
  let clear = null;
  if (tpl === 'clairiere') {
    const c = ptAt(g, 0.5, ri(R, -2, 2)), r = Math.min(g.w, g.h) * (0.22 + R() * 0.06);
    clear = (x, y) => Math.hypot(x - c.x, y - c.y) < r;
    const cab = placeBuilding(g, 5, 4, { d: D.MUR_BOIS, doors: ['s', 'w'] }, (x, y) => Math.hypot(x - c.x, y - c.y) < r * 0.8 && Math.abs(qOf(g, x, y)) > 1.5, 30);
    scatter(g, B.buches, 2, { near: cab ? { x: cab.x1 + 2, y: cab.y0 + 1 } : c, rad: 2 });
    if (g.fog) campfire(g, c, 4);
  }
  trail(g, D.PISTE);
  const dens = { futaie: 0.13, riviere: 0.1, clairiere: 0.12, clairseme: 0.08 }[tpl];
  trees(g, dens, clear);
  bushes(g, D.FOUGERE, cnt(g, tpl === 'clairseme' ? 4 : 8), 1.8);
  scatter(g, B.bille, cnt(g, 4), { ok: midBand(g, 0.1, 0.9) });
  scatter(g, B.souche, cnt(g, 5));
  scatter(g, B.rocher, cnt(g, 3), { ok: midBand(g) });
  staging(g, KIT.foret);
}

function genNeige(g) {
  const R = g.R;
  outdoor(g, ['plein', 'rect', 'ile', 'cuvette', 'plateau', 'diag'], D.FALAISE);
  const tpl = g.tpl = pick(R, ['sapins', 'lac', 'col']);
  if (tpl === 'col') sideWalls(g, clamp(Math.min(g.w, g.h) * 0.42, 6.5, 11), D.ROCHER, 1.5);
  if (tpl === 'lac') { // le lac gelé : de la glace fine (on n'y passe pas), traversée par une langue de glace épaisse
    const c = ptAt(g, 0.45 + R() * 0.1, ri(R, -2, 2));
    blob(g, c.x, c.y, 2.8 + R() * 2.2, 2 + R() * 1.4, WATER, D.GLACE, 0.22);
    const q0 = ri(R, -1, 1);
    for (let t = 0; t <= 1; t += 0.01) {
      const p = ptAt(g, t, q0 + Math.sin(t * 9) * 1.2);
      if (AT(g, p.x, p.y) === WATER) { put(g, p.x, p.y, FLOOR, D.GLACE); g.res[p.y * g.w + p.x] = 3; }
    }
  }
  // bouquets de sapins
  for (let i = 0, n = cnt(g, tpl === 'sapins' ? 8 : 6); i < n; i++) {
    const c = spotWhere(g, awayFromStarts(g, 4));
    if (!c) continue;
    for (let k = 0, m = ri(R, 3, 6); k < m; k++) place(g, R() < 0.6 ? B.sapin : B.grosSapin, { near: c, rad: 2.5, tries: 4 });
  }
  trees(g, tpl === 'sapins' ? 0.06 : 0.04, null, true);
  for (let i = 0, n = cnt(g, 4); i < n; i++) mesa(g, 0.8 + R() * 0.9, D.ROCHER);
  if (R() < 0.35) {
    const cab = placeBuilding(g, 5, 4, { d: D.MUR_BOIS, doors: ['s'] }, (x, y) => midBand(g)(x, y) && Math.abs(qOf(g, x, y)) > 2, 30);
    if (cab) scatter(g, B.buches, 1, { near: { x: cab.x0 - 1, y: cab.y1 }, rad: 2 });
  }
  trail(g, D.PISTE);
  scatter(g, B.congere, cnt(g, 8), { ok: midBand(g, 0.1, 0.9) });
  scatter(g, B.roche, cnt(g, 6));
  scatter(g, B.arbreMort, cnt(g, 2));
  bushes(g, D.BROUSSAILLE, cnt(g, 2), 1);
  staging(g, KIT.neige);
}

// ------------------------------------------------------------ la mine (toujours dans le noir, sous le brouillard)
function genMine(g) {
  const { w, h, R } = g;
  g.c.fill(WALL); g.d.fill(D.MUR_ROC); g.S = (w * h) / 660;
  const diag = R() < 0.6;
  g.pA = diag ? { x: 3, y: h - 4 } : { x: 3, y: (h >> 1) + ri(R, -2, 2) };
  g.eA = diag ? { x: w - 4, y: 3 } : { x: w - 4, y: (h >> 1) + ri(R, -2, 2) };
  axisOf(g);
  const tpl = g.tpl = R() < 0.35 ? 'caverne' : 'galeries';
  const dig = (x, y) => { if (x >= 1 && y >= 1 && x < w - 1 && y < h - 1 && g.c[y * w + x] === WALL) put(g, x, y, FLOOR, 0); };
  const room = (r) => {
    for (let y = r.y - r.rh; y <= r.y + r.rh; y++) for (let x = r.x - r.rw; x <= r.x + r.rw; x++) {
      const dx = (x - r.x) / (r.rw + 0.5), dy = (y - r.y) / (r.rh + 0.5);
      if (r.round ? dx * dx + dy * dy <= 1.05 : !(Math.abs(x - r.x) === r.rw && Math.abs(y - r.y) === r.rh)) dig(x, y);
    }
  };
  const rooms = [{ x: g.pA.x, y: g.pA.y, rw: 3, rh: 2 }, { x: g.eA.x, y: g.eA.y, rw: 3, rh: 2 }];
  if (tpl === 'caverne') { // une grande caverne au milieu, faite de quelques poches qui se recoupent
    const cx = w / 2 + ri(R, -2, 2), cy = h / 2 + ri(R, -1, 1);
    for (let i = 0; i < 4; i++) {
      const bx = cx + (R() - 0.5) * w * 0.32, by = cy + (R() - 0.5) * h * 0.3, rx = 3 + R() * 2.5, ry = 2.2 + R() * 1.8, p1 = R() * 6.28;
      for (let y = Math.floor(by - ry - 1); y <= by + ry + 1; y++) for (let x = Math.floor(bx - rx - 1); x <= bx + rx + 1; x++) {
        const dx = (x - bx) / rx, dy = (y - by) / ry, a = Math.atan2(dy, dx);
        if (dx * dx + dy * dy < (1 + 0.2 * Math.sin(a * 4 + p1)) ** 2) dig(x, y);
      }
    }
    rooms.push({ x: Math.round(cx), y: Math.round(cy), rw: 1, rh: 1 });
    rooms.push({ x: Math.round(w * 0.3 + R() * 2), y: diag ? 3 : ri(R, 3, 4), rw: 2, rh: 1 }, { x: Math.round(w * 0.7 - R() * 2), y: diag ? h - 4 : h - 1 - ri(R, 3, 4), rw: 2, rh: 1 });
  } else { // des salles sur une grille, reliées par des galeries
    const gx = w >= 32 ? 4 : 3, gy = h >= 21 ? 3 : 2;
    for (let j = 0; j < gy; j++) for (let i = 0; i < gx; i++) {
      const x = Math.round(((i + 0.5) / gx) * w + (R() - 0.5) * (w / gx) * 0.5), y = Math.round(((j + 0.5) / gy) * h + (R() - 0.5) * (h / gy) * 0.4);
      if (rooms.some((r) => Math.hypot(r.x - x, r.y - y) < 6) || R() < 0.15) continue;
      rooms.push({ x: clamp(x, 3, w - 4), y: clamp(y, 3, h - 4), rw: ri(R, 2, 3), rh: ri(R, 1, 2), round: R() < 0.4 });
    }
  }
  for (const r of rooms) room(r);
  // les galeries : un arbre couvrant entre les salles, plus deux ou trois boucles (pour les flancs)
  const n = rooms.length, inT = new Uint8Array(n), edges = [];
  inT[0] = 1;
  const dd = (a, b) => Math.hypot(rooms[a].x - rooms[b].x, rooms[a].y - rooms[b].y);
  for (let c = 1; c < n; c++) {
    let best = null;
    for (let a = 0; a < n; a++) if (inT[a]) for (let b = 0; b < n; b++) if (!inT[b] && (!best || dd(a, b) < best[2])) best = [a, b, dd(a, b)];
    edges.push(best); inT[best[1]] = 1;
  }
  const extra = [];
  for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) if (!edges.some((e) => (e[0] === a && e[1] === b) || (e[0] === b && e[1] === a))) extra.push([a, b, dd(a, b)]);
  extra.sort((p, q) => p[2] - q[2]);
  edges.push(...extra.slice(0, ri(R, 3, 4)));
  const rails = [], lamps = [];
  for (const [a, b] of edges) {
    const A = rooms[a], Bq = rooms[b], wd = pick(R, [2, 3, 3, 4]), o = (wd - 1) >> 1;
    const hx = R() < 0.5, mx = hx ? Bq.x : A.x, my = hx ? A.y : Bq.y;
    const pts = [];
    const seg = (x0, y0, x1, y1) => {
      const L = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
      for (let i = 0; i <= L; i++) pts.push({ x: x0 + Math.sign(x1 - x0) * i, y: y0 + Math.sign(y1 - y0) * i });
    };
    seg(A.x, A.y, mx, my); seg(mx, my, Bq.x, Bq.y);
    for (const p of pts) for (let dy = 0; dy < wd; dy++) for (let dx = 0; dx < wd; dx++) dig(p.x + dx - o, p.y + dy - o);
    if (R() < 0.6) rails.push(...pts);
    pts.forEach((p, i) => { if (i % 7 === 3) lamps.push(p); });
  }
  if (!flank(g, g.pA, g.eA)) { // une galerie de roulage qui fait le tour
    const up = R() < 0.5, wy = up ? 2 : h - 3, wx = diag ? (up ? g.pA.x : g.eA.x) : Math.round(w / 2);
    const pts = [];
    const seg = (x0, y0, x1, y1) => { const L = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)); for (let i = 0; i <= L; i++) pts.push({ x: x0 + Math.sign(x1 - x0) * i, y: y0 + Math.sign(y1 - y0) * i }); };
    seg(g.pA.x, g.pA.y, g.pA.x, wy); seg(g.pA.x, wy, g.eA.x, wy); seg(g.eA.x, wy, g.eA.x, g.eA.y);
    if (diag) { pts.length = 0; seg(g.pA.x, g.pA.y, wx, up ? g.eA.y : g.pA.y); seg(wx, up ? g.eA.y : g.pA.y, g.eA.x, g.eA.y); }
    for (const p of pts) for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) dig(p.x + dx, p.y + dy);
    rails.push(...pts);
    pts.forEach((p, i) => { if (i % 7 === 3) lamps.push(p); });
  }
  for (const p of rails) if (AT(g, p.x, p.y) === FLOOR) put(g, p.x, p.y, RAIL, 0);
  reserve(g, g.pA, 1.6); reserve(g, g.eA, 1.6);
  // le mobilier : wagonnets sur les rails, caisses, tonneaux de poudre, étais, éboulis
  const floors = [], railCells = [];
  for (let k = 0; k < g.n; k++) { if (g.c[k] === FLOOR) floors.push(k); else if (g.c[k] === RAIL) railCells.push(k); }
  const all = floors.concat(railCells);
  scatter(g, T(['x'], { x: D.WAGONNET }), cnt(g, 5), { cands: railCells, tries: 15 });
  scatter(g, B.caisses, cnt(g, 16), { cands: all });
  scatter(g, B.poudre, cnt(g, 2.5), { cands: floors });
  scatter(g, T(['i'], { i: D.ETAI }), cnt(g, 9), { cands: floors });
  scatter(g, B.rocher, cnt(g, 6), { cands: floors });
  scatter(g, [T(['T'], {})], R() < 0.5 ? 1 : 0, { cands: floors });
  if (tpl === 'caverne') scatter(g, T(['i'], { i: D.STALAGMITE }), cnt(g, 4), { cands: floors });
  staging(g, KIT.mine);
  // des étais dans la roche, au bord des galeries (pour le dessin), puis le vide au-delà de la paroi
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const k = y * w + x;
    if (g.c[k] !== WALL || g.d[k] !== D.MUR_ROC || (x * 3 + y * 5) % 4) continue;
    if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => isGround(AT(g, x + dx, y + dy)))) { g.c[k] = PILLAR; g.d[k] = D.ETAI; }
  }
  roofVoid(g);
  // les lanternes : au milieu des salles et le long des galeries
  for (const r of rooms) lampAt(g, r.x, r.y, 4);
  for (const p of lamps) lampAt(g, p.x, p.y, 3);
}
// la roche qui ne touche à rien de creusé devient du vide (une paroi d'une case suffit à couper la vue)
function roofVoid(g) {
  const { w, h } = g, keepIt = new Uint8Array(g.n);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const v = g.c[y * w + x];
    if (v === WALL || v === PILLAR || v === VOID) continue;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (IN(g, x + dx, y + dy)) keepIt[(y + dy) * w + x + dx] = 1;
  }
  for (let k = 0; k < g.n; k++) if (!keepIt[k] && (g.c[k] === WALL || g.c[k] === PILLAR) && (g.d[k] === D.MUR_ROC || g.d[k] === D.ETAI)) { g.c[k] = VOID; g.d[k] = 0; }
}
function lampAt(g, x, y, r) {
  if (g.lights.some((l) => Math.hypot(l.x - x, l.y - y) < 4.5) || g.lights.length >= 18) return;
  for (let k = 0; k < 9; k++) {
    const X = x + (k % 3) - 1, Y = y + Math.floor(k / 3) - 1;
    if (IN(g, X, Y) && !MOVE[g.c[Y * g.w + X]]) { g.lights.push({ x: X, y: Y, r }); return; }
  }
}

// ------------------------------------------------------------ le saloon
function genSaloon(g) {
  const { w, h, R } = g;
  g.c.fill(VOID); g.floorDeco = D.PLANCHER;
  const street = R() < 0.6;
  const S = street ? ri(R, 5, 6) : 0;
  const by0 = street && R() < 0.5 ? ri(R, 1, 2) : 0, by1 = h - 1 - (street && R() < 0.5 ? ri(R, 1, 2) : 0);
  const bx0 = S, bx1 = w - 1;
  if (street) for (let y = 0; y < h; y++) for (let x = 0; x < S; x++) put(g, x, y, x === S - 1 ? FLOOR : PATH, x === S - 1 ? D.PLANCHER : D.PISTE);
  for (let y = by0; y <= by1; y++) for (let x = bx0; x <= bx1; x++) {
    const edge = x === bx0 || x === bx1 || y === by0 || y === by1;
    put(g, x, y, edge ? WALL : FLOOR, edge ? D.MUR_BOIS : D.PLANCHER);
  }
  let inside = 0;
  for (let k = 0; k < g.n; k++) if (g.c[k] !== VOID) inside++;
  g.S = inside / 660;
  const ix0 = bx0 + 1, ix1 = bx1 - 1, iy0 = by0 + 1, iy1 = by1 - 1, my = (iy0 + iy1) >> 1, iw = ix1 - ix0 + 1;
  const tpl = g.tpl = R() < 0.55 ? 'grand' : 'tripot';
  const door = (x, y) => { put(g, x, y, FLOOR, D.PORTE); keep(g, x, y); keep(g, x - 1, y); keep(g, x + 1, y); };
  // la façade : portes battantes (la grande et une petite), fenêtres
  if (street) {
    const top = R() < 0.5, dy = top ? ri(R, iy0 + 1, my - 2) : ri(R, my + 1, iy1 - 2);
    door(bx0, dy); door(bx0, dy + 1);
    const sy = top ? ri(R, Math.min(dy + 5, iy1 - 1), iy1 - 1) : ri(R, iy0 + 1, Math.max(iy0 + 1, dy - 4));
    door(bx0, sy);
    for (let y = iy0; y <= iy1; y++) if (g.c[y * w + bx0] === WALL && R() < 0.3) g.d[y * w + bx0] = D.FENETRE;
    g.pA = { x: 1, y: h - 3 };
  } else {
    put(g, bx0, my, WALL, D.PORTE_CLOSE);
    g.pA = { x: ix0 + 1, y: iy1 - 1 };
  }
  // le bar
  let barX = ix1 + 1, eA;
  if (tpl === 'grand') { // comptoir au fond, étagères derrière
    barX = ix1 - 3;
    for (let y = iy0 + 2; y <= iy1 - 2; y++) put(g, barX, y, COUNTER, 0);
    for (let y = iy0 + 2; y <= iy1 - 2; y++) g.d[y * w + bx1] = D.ETAGERE;
    eA = { x: ix1 - 1, y: iy0 + 1 };
    for (const y of [iy0, iy0 + 1, iy1 - 1, iy1]) { keep(g, barX, y); keep(g, barX - 1, y); }
  } else { // comptoir le long du mur du haut, et une arrière-salle en bas à droite
    const cx0 = ix0 + Math.round(iw * 0.45);
    for (let x = cx0; x <= ix1 - 2; x++) put(g, x, iy0 + 2, COUNTER, 0);
    for (let x = cx0; x <= ix1 - 2; x++) g.d[by0 * w + x] = D.ETAGERE;
    eA = { x: ix1 - 1, y: iy0 + 1 };
    const rx0 = ix1 - ri(R, 5, 6), ry0 = my + 2;
    if (iy1 - ry0 >= 3) {
      for (let x = rx0 - 1; x <= bx1; x++) put(g, x, ry0 - 1, WALL, D.MUR_BOIS);
      for (let y = ry0 - 1; y <= by1; y++) put(g, rx0 - 1, y, WALL, D.MUR_BOIS);
      for (let x = cx0 - 2; x <= cx0 - 1; x++) for (let y = iy0; y <= iy0 + 2; y++) keep(g, x, y);
      const d1 = ri(R, rx0 + 1, ix1 - 1);
      put(g, d1, ry0 - 1, FLOOR, D.PORTE); keep(g, d1, ry0 - 2); keep(g, d1, ry0); keep(g, d1, ry0 - 1);
      const d2 = ri(R, ry0, iy1);
      put(g, rx0 - 1, d2, FLOOR, D.PORTE); keep(g, rx0 - 2, d2); keep(g, rx0, d2); keep(g, rx0 - 1, d2);
      place(g, T(['TT', 'TT'], {}), { cands: interiorCells(g, rx0 - 1, ry0 - 1, bx1, by1), rot: false, tries: 10 });
      scatter(g, B.caisses, 2, { cands: interiorCells(g, rx0 - 1, ry0 - 1, bx1, by1), tries: 10 });
    }
  }
  g.eA = eA;
  axisOf(g);
  reserve(g, g.pA, 2); reserve(g, g.eA, 1.5);
  // les coulisses du comptoir restent libres
  if (tpl === 'grand') {
    for (let y = iy0; y <= iy1; y++) for (let x = barX + 1; x <= ix1; x++) if (!g.res[y * w + x]) g.res[y * w + x] = 3;
  } else {
    for (let x = ix0 + Math.round(iw * 0.45); x <= ix1; x++) for (let y = iy0; y <= iy0 + 1; y++) if (!g.res[y * w + x]) g.res[y * w + x] = 3;
  }
  // l'escalier de la galerie, le piano (sur l'estrade), le poêle
  const sx = tpl === 'grand' ? ix0 + Math.round(iw * 0.35) : ix0 + 2, sy = tpl === 'grand' ? iy1 : iy0;
  for (let i = 0; i < 4; i++) if (!g.res[sy * w + sx + i]) put(g, sx + i, sy, WALL, D.ESCALIER);
  const py = tpl === 'grand' ? iy0 : iy1;
  if (tpl === 'grand' && R() < 0.6) for (let y = iy0; y <= iy0 + 2; y++) for (let x = ix0; x <= ix0 + 4; x++) if (g.c[y * w + x] === FLOOR) g.d[y * w + x] = D.ESTRADE;
  for (let x = ix0 + 2; x <= ix0 + 3; x++) if (!g.res[py * w + x] && g.c[py * w + x] === FLOOR) put(g, x, py, WALL, D.PIANO);
  // les poteaux de la galerie
  const rowsY = tpl === 'grand' ? [iy0 + 3, iy1 - 3] : [my];
  const px1 = tpl === 'grand' ? barX - 3 : ix1 - 8;
  for (const y of rowsY) for (let x = ix0 + 3 + ri(R, 0, 1); x <= px1; x += 4) if (fits(g, T(['i']), x, y, 1)) put(g, x, y, PILLAR, D.POTEAU);
  if (R() < 0.5) place(g, T(['i'], { i: D.POELE }), { near: { x: Math.round((ix0 + barX) / 2), y: my }, rad: 2, tries: 10 });
  // les tables, en quinconce
  for (let y = iy0 + 2; y <= iy1 - 1; y += 3) for (let x = ix0 + 2 + ((y / 3) & 1); x <= (tpl === 'grand' ? barX - 2 : ix1 - 1); x += 3) {
    if (R() < 0.1) continue;
    const fp = R() < 0.3 ? T(['TT'], {}) : T(['T'], {});
    const X = x + ri(R, 0, 1) - 0, Y = y + ri(R, -1, 0);
    if (fits(g, fp, X, Y, 1)) stamp(g, fp, X, Y);
  }
  // tonneaux et caisses contre les murs
  const wallSpots = [];
  for (let y = iy0; y <= iy1; y++) for (let x = ix0; x <= ix1; x++) {
    const k = y * w + x;
    if (g.c[k] !== FLOOR || g.res[k]) continue;
    const walls = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => AT(g, x + dx, y + dy) === WALL).length;
    if (walls === 1) wallSpots.push(k);
  }
  scatter(g, [T(['x'], { x: D.TONNEAU }), T(['x'], { x: D.CAISSE })], cnt(g, 9), { cands: wallSpots, m: 0, tries: 20, ok: (x, y) => {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const v = AT(g, x + dx, y + dy); if ((dx || dy) && obst(v) && v !== WALL) return false; }
    return true;
  } });
  // la rue : barre d'attache, abreuvoir, tonneaux, un chariot, un réverbère
  if (street) {
    const inStreet = (x) => x < S - 1;
    scatter(g, T(['f', 'f'], { f: D.ATTACHE }), 1, { ok: (x) => x === S - 2, rot: false, edge: true });
    scatter(g, T(['~', '~'], { '~': D.ABREUVOIR }), 1, { ok: (x) => x === S - 2, rot: false, edge: true });
    scatter(g, [T(['x', 'x', 'x'], { x: D.CHARIOT }), T(['x', 'x'], { x: D.CHARIOT })], R() < 0.6 ? 1 : 0, { ok: inStreet, rot: false, edge: true });
    scatter(g, B.caisses, cnt(g, 2), { ok: inStreet, edge: true });
    const lp = place(g, T(['i'], { i: D.REVERBERE }), { ok: (x) => x === S - 2 || x === 0, edge: true });
    if (lp && g.fog) g.lights.push({ x: Math.min(lp.x + 1, S - 1), y: lp.y, r: 4 });
  }
  // l'usure du plancher, de la porte au comptoir
  const path = dijkstra(g, [g.pA.y * w + g.pA.x], (k) => k === g.eA.y * w + g.eA.x, (k) => (MOVE[g.c[k]] ? -1 : 1));
  if (path) for (const k of path) if (g.c[k] === FLOOR && g.d[k] === D.PLANCHER) { g.c[k] = PATH; g.d[k] = D.USURE; }
  // les lustres
  for (const fx of [0.3, 0.7]) lampAt(g, Math.round(ix0 + iw * fx), my, 5);
  g.inside = (x, y) => x > bx0 && x < bx1 && y > by0 && y < by1;
  staging(g, KIT.saloon, 2, null, street ? [...B.caisses, T(['ff'], { f: D.ATTACHE }), B.abreuvoir] : null);
}

// ------------------------------------------------------------ la ville
// Une rangée de façades le long d'une rue. dir : côté de la rue ('E' : la rue est à l'est des bâtisses) ;
// line : la ligne des façades ; de a à b le long de la rue ; depth : profondeur des bâtisses.
function rowOfBuildings(g, dir, line, a, b, depth) {
  const R = g.R, made = [];
  let pos = a + ri(R, 0, 1);
  while (pos + 3 <= b) {
    const len = Math.min(ri(R, 4, 6), b - pos + 1);
    if (len < 4) break;
    if (R() < 0.15) { pos += ri(R, 3, 5); continue; } // un terrain vague
    let x0, y0, bw, bh, front, back;
    if (dir === 'E') { x0 = line - depth + 1; y0 = pos; bw = depth; bh = len; front = 'e'; back = 'w'; }
    else if (dir === 'W') { x0 = line; y0 = pos; bw = depth; bh = len; front = 'w'; back = 'e'; }
    else if (dir === 'N') { x0 = pos; y0 = line; bw = len; bh = depth; front = 'n'; back = 's'; }
    else { x0 = pos; y0 = line - depth + 1; bw = len; bh = depth; front = 's'; back = 'n'; }
    const doors = building(g, x0, y0, bw, bh, { d: D.MUR_BOIS, doors: R() < 0.55 ? [front, back] : [front] });
    if (!doors) { pos += 1; continue; }
    made.push({ x0, y0, x1: x0 + bw - 1, y1: y0 + bh - 1 });
    // le trottoir de planches devant la façade
    for (let i = 0; i < len; i++) {
      const x = dir === 'E' ? line + 1 : dir === 'W' ? line - 1 : pos + i, y = dir === 'N' ? line - 1 : dir === 'S' ? line + 1 : pos + i;
      if (AT(g, x, y) === FLOOR) g.d[y * g.w + x] = D.PLANCHER;
    }
    pos += len + ri(R, 2, 3);
  }
  return made;
}
function genVille(g) {
  const { w, h, R } = g;
  const m = shapeMask(g, R() < 0.5 ? 'plein' : 'rect');
  let inside = 0;
  for (let k = 0; k < g.n; k++) { g.c[k] = m[k] ? FLOOR : VOID; inside += m[k]; }
  g.S = inside / 660; g.shape = 'rect';
  const tpl = g.tpl = h >= 19 && R() < 0.45 ? 'carrefour' : 'grandrue';
  const sw = w >= 31 ? 5 : 4, sx0 = Math.floor((w - sw) / 2) + ri(R, -1, 1), sx1 = sx0 + sw - 1;
  const street = (x0, y0, x1, y1) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (AT(g, x, y) !== VOID) put(g, x, y, PATH, D.PISTE); };
  street(sx0, 0, sx1, h - 1);
  const dW = clamp(sx0 - 1 - 5, 3, 6), dE = clamp(w - 2 - sx1 - 5, 3, 6);
  let sy0 = -1, sy1 = -1;
  if (tpl === 'carrefour') {
    const sh = h >= 22 ? 4 : 3;
    sy0 = Math.floor((h - sh) / 2) + ri(R, -1, 1); sy1 = sy0 + sh - 1;
    street(0, sy0, w - 1, sy1);
  }
  const an = findAnchors(g, m, depthOf(g, m), tpl === 'carrefour' ? ['diag', 'pente'] : ['horiz', 'pente', 'diag']) || [{ x: 1, y: h >> 1 }, { x: w - 2, y: h >> 1 }];
  [g.pA, g.eA] = an;
  for (const p of an) if (g.c[p.y * w + p.x] === VOID) put(g, p.x, p.y, FLOOR);
  axisOf(g);
  reserve(g, g.pA, 2.3); reserve(g, g.eA, 2.3);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (g.c[y * w + x] === PATH && !g.res[y * w + x]) g.res[y * w + x] = 2;
  const blocks = [];
  if (tpl === 'grandrue') {
    blocks.push(...rowOfBuildings(g, 'E', sx0 - 2, 1, h - 2, dW));
    blocks.push(...rowOfBuildings(g, 'W', sx1 + 2, 1, h - 2, dE));
  } else {
    const dH = clamp(sy0 - 1 - 4, 3, 5), dS = clamp(h - 2 - sy1 - 4, 3, 5);
    blocks.push(...rowOfBuildings(g, 'E', sx0 - 2, 1, sy0 - 2, dW), ...rowOfBuildings(g, 'E', sx0 - 2, sy1 + 2, h - 2, dW));
    blocks.push(...rowOfBuildings(g, 'W', sx1 + 2, 1, sy0 - 2, dE), ...rowOfBuildings(g, 'W', sx1 + 2, sy1 + 2, h - 2, dE));
    blocks.push(...rowOfBuildings(g, 'S', sy0 - 2, 1, sx0 - 3, dH), ...rowOfBuildings(g, 'S', sy0 - 2, sx1 + 3, w - 2, dH));
    blocks.push(...rowOfBuildings(g, 'N', sy1 + 2, 1, sx0 - 3, dS), ...rowOfBuildings(g, 'N', sy1 + 2, sx1 + 3, w - 2, dS));
    place(g, B.puits, { near: { x: (sx0 + sx1) >> 1, y: (sy0 + sy1) >> 1 }, rad: 1, soft2: true, tries: 6 });
  }
  // dans la rue : chariots, abreuvoirs, barres d'attache, tonneaux, sacs de sable
  const inStreet = (x, y) => (x >= sx0 && x <= sx1) || (y >= sy0 && y <= sy1);
  const o = { ok: inStreet, soft2: true };
  scatter(g, [T(['x', 'x', 'x'], { x: D.CHARIOT }), T(['x', 'x'], { x: D.CHARIOT })], cnt(g, 1.5), o);
  scatter(g, [B.abreuvoir, T(['ff'], { f: D.ATTACHE }), T(['fff'], { f: D.ATTACHE })], cnt(g, 3), o);
  scatter(g, B.caisses, cnt(g, 4), o);
  scatter(g, B.sacs, cnt(g, 1.5), o);
  // derrière les façades : barrières, cabanes, bûches, caisses, un château d'eau
  const back = (x, y) => !inStreet(x, y) && !blocks.some((b) => x >= b.x0 - 1 && x <= b.x1 + 1 && y >= b.y0 - 1 && y <= b.y1 + 1);
  if (R() < 0.6) place(g, T(['i i', '   ', 'i i'], { i: D.POTEAU }), { ok: back, rot: false, tries: 30 });
  scatter(g, B.barriere, cnt(g, 4), { ok: back });
  scatter(g, T(['#'], { '#': D.CABANE }), cnt(g, 2), { ok: back });
  scatter(g, [...B.caisses, ...B.buches], cnt(g, 4), { ok: back });
  scatter(g, B.chariot, cnt(g, 1), { ok: back });
  // des réverbères devant les façades, allumés la nuit
  if (g.fog) for (let y = 2; y < h; y += 6) { lampAt(g, sx0 - 1, y, 4); lampAt(g, sx1 + 1, y + 3, 4); }
  staging(g, KIT.ville);
}

// ------------------------------------------------------------ la hacienda d'El Diablo (le repaire)
function genHacienda(g) {
  const { w, h, R } = g;
  const cx0 = Math.round(w * 0.36), cx1 = w - 2, cy0 = 2, cy1 = h - 3, my = (cy0 + cy1) >> 1;
  // le désert devant, le bord grignoté du côté de la bande seulement
  const N = noise(R, w, h, 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dep = Math.min(x, y, h - 1 - y);
    put(g, x, y, x < cx0 - 2 && dep < 2 && N(x, y) < [0.55, 0.35][dep] ? VOID : FLOOR, 0);
  }
  const m = new Uint8Array(g.n);
  for (let k = 0; k < g.n; k++) m[k] = g.c[k] === FLOOR ? 1 : 0;
  smooth(g, m);
  for (let k = 0; k < g.n; k++) g.c[k] = m[k] ? FLOOR : VOID;
  for (let y = 0; y < h; y++) for (let x = cx1 + 1; x < w; x++) put(g, x, y, VOID, 0);
  for (let x = cx1 - 3; x <= cx1; x++) { put(g, x, 0, VOID, 0); put(g, x, h - 1, VOID, 0); }
  g.S = (w * h) / 660; g.tpl = 'hacienda'; g.shape = 'rect';
  // l'enceinte d'adobe et ses tours d'angle
  for (let y = cy0; y <= cy1; y++) for (let x = cx0; x <= cx1; x++) if (x === cx0 || x === cx1 || y === cy0 || y === cy1) put(g, x, y, WALL, D.MUR_ADOBE);
  for (const [tx, ty] of [[cx0 - 1, cy0 - 1], [cx1, cy0 - 1], [cx0 - 1, cy1], [cx1, cy1]]) for (let k = 0; k < 4; k++) put(g, tx + (k & 1), ty + (k >> 1), WALL, D.TOUR);
  // le portail, face à la bande, et une brèche au sud (on peut prendre la cour de flanc)
  for (let y = my - 1; y <= my + 1; y++) { put(g, cx0, y, FLOOR, D.PORTAIL); keep(g, cx0, y); keep(g, cx0 - 1, y); keep(g, cx0 + 1, y); }
  const bx = ri(R, cx0 + 3, cx0 + Math.round((cx1 - cx0) * 0.4));
  for (let x = bx; x <= bx + 1; x++) { put(g, x, cy1, FLOOR, D.BRECHE); keep(g, x, cy1); keep(g, x, cy1 + 1); keep(g, x, cy1 - 1); }
  if (R() < 0.5) { const nx = ri(R, cx0 + 3, cx1 - 8); put(g, nx, cy0, FLOOR, D.BRECHE); keep(g, nx, cy0); keep(g, nx, cy0 + 1); keep(g, nx, cy0 - 1); }
  // la maison du maître, au fond, et la place d'El Diablo devant sa porte, derrière des sacs de sable
  for (let y = my - 3; y <= my + 3; y++) for (let x = cx1 - 4; x < cx1; x++) put(g, x, y, WALL, x === cx1 - 4 && y === my ? D.PORTE_CLOSE : D.MAISON);
  g.boss = { x: cx1 - 7, y: my };
  for (let y = my - 1; y <= my + 1; y++) put(g, cx1 - 8, y, SAND, D.SACS);
  for (let y = my - 1; y <= my + 1; y++) for (let x = cx1 - 7; x <= cx1 - 5; x++) keep(g, x, y);
  // la fontaine au milieu de la cour (une statue au centre), et ses pavés
  const fx = Math.round((cx0 + cx1 - 4) / 2) - 1;
  for (let y = my - 2; y <= my + 2; y++) for (let x = fx - 2; x <= fx + 2; x++) if (g.c[y * w + x] === FLOOR) put(g, x, y, PATH, D.PAVE);
  for (let y = my - 1; y <= my + 1; y++) for (let x = fx - 1; x <= fx + 1; x++) put(g, x, y, x === fx && y === my ? PILLAR : WATER, x === fx && y === my ? D.STATUE : D.FONTAINE);
  // les arcades le long des murs nord et sud
  for (const y of [cy0 + 2, cy1 - 2]) for (let x = cx0 + 3; x <= cx1 - 7; x += 2) if (g.c[y * w + x] === FLOOR && !g.res[y * w + x]) put(g, x, y, PILLAR, D.COLONNE);
  g.eA = { x: cx1 - 2, y: cy0 + 2 };
  g.pA = { x: 2, y: h - 4 };
  axisOf(g);
  reserve(g, g.pA, 2.3); reserve(g, g.eA, 1.5);
  const court = (x, y) => x > cx0 && x < cx1 && y > cy0 && y < cy1 && !(x >= cx1 - 4 && y >= my - 3 && y <= my + 3);
  g.eZone = court;
  const cc = [];
  for (let y = cy0 + 1; y < cy1; y++) for (let x = cx0 + 1; x < cx1; x++) if (court(x, y)) cc.push(y * w + x);
  scatter(g, B.sacs, cnt(g, 5), { cands: cc });
  scatter(g, B.poudre, ri(R, 2, 3), { cands: cc });
  scatter(g, B.caisses, cnt(g, 6), { cands: cc });
  scatter(g, T(['xx'], { x: D.CHARIOT }), 1, { cands: cc });
  // dehors : la route du portail, des cactus, des rochers, des chariots abandonnés
  const outside = (x) => x < cx0 - 1;
  const road = dijkstra(g, [g.pA.y * w + g.pA.x], (k) => k === my * w + cx0, (k) => (MOVE[g.c[k]] ? -1 : 1 + N(k % w, Math.floor(k / w)) * 4));
  if (road) for (const k of road) if (g.c[k] === FLOOR) { g.c[k] = PATH; g.d[k] = D.PISTE; if (!g.res[k]) g.res[k] = 2; }
  scatter(g, B.cactus, cnt(g, 7), { ok: outside });
  scatter(g, B.roche, cnt(g, 6), { ok: outside });
  scatter(g, B.rocher, cnt(g, 2), { ok: outside });
  scatter(g, B.chariot, cnt(g, 1.2), { ok: outside });
  scatter(g, B.arbreMort, 1, { ok: outside });
  bushes(g, D.BROUSSAILLE, cnt(g, 3));
  staging(g, KIT.hacienda, 4, court);
  // des torches au portail et devant la maison
  g.lights.push({ x: cx0 - 1, y: my - 2, r: 4 }, { x: cx0 - 1, y: my + 2, r: 4 }, { x: cx1 - 5, y: my, r: 4 });
}

const GEN = { desert: genDesert, canyon: genCanyon, prairie: genPrairie, foret: genForet, neige: genNeige, mine: genMine, saloon: genSaloon, ville: genVille, hacienda: genHacienda };

// ------------------------------------------------------------ finitions : tout relier, les départs, la ligne de vue
function components(g) {
  const lab = new Int32Array(g.n).fill(-1), comps = [], w = g.w;
  for (let s = 0; s < g.n; s++) {
    if (lab[s] >= 0 || MOVE[g.c[s]]) continue;
    const id = comps.length, list = [s];
    lab[s] = id;
    for (let i = 0; i < list.length; i++) {
      const k = list[i], x = k % w, y = (k - x) / w;
      for (const kk of [x > 0 ? k - 1 : -1, x < w - 1 ? k + 1 : -1, y > 0 ? k - w : -1, y < g.h - 1 ? k + w : -1]) {
        if (kk >= 0 && lab[kk] < 0 && !MOVE[g.c[kk]]) { lab[kk] = id; list.push(kk); }
      }
    }
    comps.push(list);
  }
  return { lab, comps };
}
// ce que coûte de percer une case pour relier un recoin (on préfère ouvrir une caisse qu'un mur)
const CARVE_COST = [1, 1, 6, 3, 1, 5, 9, 3, -1, 3, 12, 1, 3, 7];
function carve(g, k) {
  const v = g.c[k], d = g.d[k];
  if (!MOVE[v] || v === VOID) return;
  if (v === WATER) { g.c[k] = FLOOR; g.d[k] = d === D.GLACE ? D.GLACE : D.GUE; } else if (v === WALL && (d === D.MUR_BOIS || d === D.MUR_ADOBE)) { g.c[k] = FLOOR; g.d[k] = D.BRECHE; } else { g.c[k] = FLOOR; g.d[k] = g.floorDeco; }
}
// Tout le sol doit se tenir : les petits recoins sont comblés, les autres reliés en perçant le moins possible
function connect(g) {
  const w = g.w, pk = g.pA.y * w + g.pA.x, ek = g.eA.y * w + g.eA.x;
  if (MOVE[g.c[pk]]) carve(g, pk);
  if (MOVE[g.c[ek]]) carve(g, ek);
  for (let pass = 0; pass < 60; pass++) {
    const { lab, comps } = components(g);
    if (comps.length <= 1) return;
    const main = lab[pk];
    let o = -1;
    for (let i = 0; i < comps.length; i++) if (i !== main && (o < 0 || comps[i].length < comps[o].length)) o = i;
    const list = comps[o];
    if (list.length <= 3 && lab[ek] !== o) {
      for (const k of list) {
        const x = k % w, y = (k - x) / w;
        let v = CRATE, d = D.CAISSE;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const c = AT(g, x + dx, y + dy); if (obst(c) && c !== WATER) { v = c; d = g.d[(y + dy) * w + x + dx]; break; } }
        g.c[k] = v; g.d[k] = d;
      }
      continue;
    }
    const path = dijkstra(g, list, (k) => lab[k] === main, (k) => CARVE_COST[g.c[k]]);
    if (!path) return;
    for (const k of path) carve(g, k);
  }
}
// cases de départ : les plus proches de l'ancre (à pied), espacées d'une case si possible, sans s'éparpiller
function spots(g, A, n, avoid, zone = null) {
  const w = g.w, dist = new Int16Array(g.n).fill(-1), q = [A.y * w + A.x];
  dist[q[0]] = 0;
  for (let i = 0; i < q.length && q.length < n * 12; i++) {
    const k = q[i], x = k % w, y = (k - x) / w;
    for (const kk of [x > 0 ? k - 1 : -1, x < w - 1 ? k + 1 : -1, y > 0 ? k - w : -1, y < g.h - 1 ? k + w : -1]) {
      if (kk >= 0 && dist[kk] < 0 && !MOVE[g.c[kk]]) { dist[kk] = dist[k] + 1; q.push(kk); }
    }
  }
  const out = [];
  const ok = (k) => !avoid.has(k) && !out.includes(k) && (!zone || zone(k % w, Math.floor(k / w)));
  const spaced = (k) => { const x = k % w, y = (k - x) / w; return !out.some((o) => Math.abs((o % w) - x) <= 1 && Math.abs(Math.floor(o / w) - y) <= 1); };
  for (const [maxD, sp, bush] of [[5, true, false], [5, false, false], [5, false, true], [7, true, true], [7, false, true], [99, false, true]]) {
    for (const k of q) {
      if (out.length >= n) break;
      if (dist[k] > maxD || !ok(k) || (!bush && g.c[k] === BUSH) || (sp && !spaced(k))) continue;
      out.push(k);
    }
  }
  return out.map((k) => ({ x: k % w, y: Math.floor(k / w) }));
}
function coverOf(g, tx, ty, fx, fy) {
  const dx = Math.sign(fx - tx), dy = Math.sign(fy - ty);
  let c = 0;
  if (dx) c = Math.max(c, COVER[AT(g, tx + dx, ty)] || 0);
  if (dy) c = Math.max(c, COVER[AT(g, tx, ty + dy)] || 0);
  return c;
}
// en embuscade, les ennemis sont plus près : à mi-chemin, à couvert si possible, jamais collés à la bande
function ambushSpots(g, p, e, n) {
  const R = g.R, w = g.w;
  const pc = centroid(p), ec = centroid(e), dx = ec.x - pc.x, dy = ec.y - pc.y, L2 = dx * dx + dy * dy || 1;
  const taken = new Set([...p, ...e].map((s) => s.y * w + s.x));
  if (g.boss) taken.add(g.boss.y * w + g.boss.x);
  const { lab } = components(g), main = lab[g.pA.y * w + g.pA.x];
  const cand = [];
  for (let k = 0; k < g.n; k++) {
    if (MOVE[g.c[k]] || taken.has(k) || lab[k] !== main) continue;
    const x = k % w, y = (k - x) / w, t = ((x - pc.x) * dx + (y - pc.y) * dy) / L2;
    if (t < 0.38 || t > 0.75) continue;
    if (p.some((s) => Math.hypot(s.x - x, s.y - y) < 6)) continue;
    const sc = coverOf(g, x, y, Math.round(pc.x), Math.round(pc.y)) * 2 + (g.c[k] === BUSH ? 1 : 0) + R() * 1.5 - Math.abs(t - 0.55) * 4;
    cand.push([sc, x, y]);
  }
  cand.sort((a, b) => b[0] - a[0]);
  const out = [];
  for (const [, x, y] of cand) {
    if (out.length >= n) break;
    if (out.some((o) => Math.abs(o.x - x) <= 1 && Math.abs(o.y - y) <= 1)) continue;
    out.push({ x, y });
  }
  for (const [, x, y] of cand) if (out.length < n && !out.some((o) => o.x === x && o.y === y)) out.push({ x, y });
  return out;
}
const centroid = (s) => ({ x: s.reduce((a, o) => a + o.x, 0) / (s.length || 1), y: s.reduce((a, o) => a + o.y, 0) / (s.length || 1) });
function deploy(g) {
  const w = g.w;
  const p = spots(g, g.pA, 8, new Set());
  const avoid = new Set(p.map((s) => s.y * w + s.x));
  if (g.boss) avoid.add(g.boss.y * w + g.boss.x);
  const e = spots(g, g.eA, 12, avoid, g.eZone);
  return { p, e, amb: ambushSpots(g, p, e, 12), boss: g.boss ? { ...g.boss } : null };
}
// ligne de vue (comme pistekit.sees : du centre de sa case vers le centre ou les coins de la cible)
function sees(g, ax, ay, bx, by) {
  if (ax === bx && ay === by) return true;
  for (const [ox, oy] of [[0, 0], [0.32, 0.32], [-0.32, 0.32], [0.32, -0.32], [-0.32, -0.32]]) {
    const x0 = ax + 0.5, y0 = ay + 0.5, x1 = bx + 0.5 + ox, y1 = by + 0.5 + oy, n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 4);
    let clear = true;
    for (let i = 1; i < n && clear; i++) {
      const x = Math.floor(x0 + ((x1 - x0) * i) / n), y = Math.floor(y0 + ((y1 - y0) * i) / n);
      if ((x === ax && y === ay) || (x === bx && y === by)) continue;
      if (SIGHT[IN(g, x, y) ? g.c[y * g.w + x] : WALL]) clear = false;
    }
    if (clear) return true;
  }
  return false;
}
function losPairs(g, p, e) {
  const out = [];
  for (const a of p.slice(0, 6)) for (const b of e.slice(0, 10)) if (sees(g, a.x, a.y, b.x, b.y)) out.push([a, b]);
  return out;
}
// s'ils se voient trop au départ : un décor qui coupe la vue, quelque part sur une des lignes de tir
function blockSight(g, pairs) {
  const R = g.R, kit = BLOCK[g.theme];
  for (let t = 0; t < 12; t++) {
    const [a, b] = pick(R, pairs), f = 0.3 + R() * 0.4;
    const x = Math.round(a.x + (b.x - a.x) * f), y = Math.round(a.y + (b.y - a.y) * f);
    if (g.eZone && !g.eZone(x, y) && g.theme === 'hacienda' && x > g.w * 0.36) continue;
    if (place(g, kit, { near: { x, y }, rad: 1.5, tries: 6, soft2: true, m: g.theme === 'saloon' && t > 5 ? 0 : 1 })) return true;
  }
  return false;
}
// part des départs sans aucun couvert à trois cases
function bareShare(g, s) {
  let bare = 0;
  for (const o of s) {
    let any = false;
    for (let dy = -3; dy <= 3 && !any; dy++) for (let dx = -3; dx <= 3; dx++) { const v = AT(g, o.x + dx, o.y + dy); if (v !== VOID && COVER[v]) { any = true; break; } }
    if (!any) bare++;
  }
  return bare / (s.length || 1);
}
function coverNear(g, s) {
  const seen = new Set();
  for (const o of s) for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
    const x = o.x + dx, y = o.y + dy;
    if (IN(g, x, y) && COVER[g.c[y * g.w + x]]) seen.add(y * g.w + x);
  }
  return seen.size;
}
// Des flancs : en bouchant le plus court chemin (et ses abords), on doit encore pouvoir passer ; on essaie plusieurs
// plus courts chemins (l'ordre des voisins change), il faut que chacun ait son détour
const ORDERS = [[[1, 0], [-1, 0], [0, 1], [0, -1]], [[-1, 0], [1, 0], [0, -1], [0, 1]], [[0, 1], [0, -1], [1, 0], [-1, 0]], [[0, -1], [0, 1], [-1, 0], [1, 0]]];
function flank(g, a, b) {
  const w = g.w, ka = a.y * w + a.x, kb = b.y * w + b.x;
  const bfs = (blocked, order) => {
    const prev = new Int32Array(g.n).fill(-2), q = [ka];
    prev[ka] = -1;
    for (let i = 0; i < q.length; i++) {
      const k = q[i];
      if (k === kb) break;
      const x = k % w, y = (k - x) / w;
      for (const [dx, dy] of order) {
        const X = x + dx, Y = y + dy, kk = Y * w + X;
        if (IN(g, X, Y) && prev[kk] === -2 && !MOVE[g.c[kk]] && !(blocked && blocked[kk])) { prev[kk] = k; q.push(kk); }
      }
    }
    return prev;
  };
  for (const order of ORDERS) {
    const prev = bfs(null, order);
    if (prev[kb] === -2) return false;
    const path = [];
    for (let k = kb; k >= 0; k = prev[k]) path.unshift(k);
    const blocked = new Uint8Array(g.n);
    for (let i = 4; i < path.length - 4; i++) {
      const k = path[i], x = k % w, y = (k - x) / w;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (IN(g, x + dx, y + dy)) blocked[(y + dy) * w + x + dx] = 1;
    }
    if (bfs(blocked, order)[kb] === -2) return false;
  }
  return true;
}
// Encombrement : les obstacles hors du vide, sans les murs d'enceinte (rochers, murs ou falaises reliés au bord)
export function clutterOf(m) {
  const { w, h, cells } = m, n = w * h, enc = new Uint8Array(n), q = [];
  const solid = (v) => v === WALL || v === PILLAR;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const k = y * w + x;
    if (!solid(cells[k])) continue;
    const edge = x === 0 || y === 0 || x === w - 1 || y === h - 1 || [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => cells[(y + dy) * w + x + dx] === VOID);
    if (edge) { enc[k] = 1; q.push(k); }
  }
  for (let i = 0; i < q.length; i++) {
    const k = q[i], x = k % w, y = (k - x) / w;
    for (const kk of [x > 0 ? k - 1 : -1, x < w - 1 ? k + 1 : -1, y > 0 ? k - w : -1, y < h - 1 ? k + w : -1]) {
      if (kk >= 0 && !enc[kk] && solid(cells[kk])) { enc[kk] = 1; q.push(kk); }
    }
  }
  let tot = 0, obs = 0, all = 0, allObs = 0;
  for (let k = 0; k < n; k++) {
    const v = cells[k];
    if (v === VOID) continue;
    all++; if (MOVE[v]) allObs++;
    if (enc[k]) continue;
    tot++; if (MOVE[v]) obs++;
  }
  return { inner: tot ? obs / tot : 0, raw: all ? allObs / all : 0 };
}
// les fourchettes d'encombrement visées, par thème
export const CLUTTER = {
  desert: [0.12, 0.3], canyon: [0.12, 0.3], prairie: [0.12, 0.3], foret: [0.14, 0.32], neige: [0.12, 0.3],
  mine: [0.1, 0.3], saloon: [0.12, 0.32], ville: [0.15, 0.36], hacienda: [0.12, 0.32],
};
function penalty(g, dep) {
  let pen = 0;
  if (dep.p.length < 6 || dep.e.length < 10 || dep.amb.length < 10) pen += 20;
  const pairs = losPairs(g, dep.p, dep.e).length / (Math.min(6, dep.p.length) * Math.min(10, dep.e.length) || 1);
  if (pairs > 0.25) pen += 2 + pairs * 6;
  if (coverNear(g, dep.p) < 5 || bareShare(g, dep.p) > 0.3) pen += 2;
  if (coverNear(g, dep.e) < 5 || bareShare(g, dep.e) > 0.3) pen += 2;
  if (dep.p.length && dep.e.length && !flank(g, dep.p[0], dep.e[0])) pen += 4;
  const { inner } = clutterOf({ w: g.w, h: g.h, cells: g.c });
  const [lo, hi] = CLUTTER[g.theme];
  if (inner < lo || inner > hi) pen += 1 + Math.abs(inner < lo ? lo - inner : inner - hi) * 20;
  let x0 = g.w, y0 = g.h, x1 = -1, y1 = -1;
  for (let k = 0; k < g.n; k++) if (g.c[k] !== VOID) { const x = k % g.w, y = (k - x) / g.w; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const pc = centroid(dep.p), ec = centroid(dep.e);
  const diag = Math.hypot(x1 - x0 + 1, y1 - y0 + 1);
  if (Math.hypot(ec.x - pc.x, ec.y - pc.y) < 0.62 * diag) pen += 6;
  if (dep.p.some((a) => dep.e.some((b) => Math.hypot(a.x - b.x, a.y - b.y) < 0.43 * diag))) pen += 4;
  return pen;
}
// Si la carte est trop dégagée, on ajoute des décors du thème au milieu jusqu'à l'encombrement visé
const FILL = {
  desert: [0.18, [B.cactus, ...B.roche, ...B.rocher, ...B.chariot, ...B.caisses]],
  canyon: [0.19, [...B.roche, ...B.rocher, T(['##', '# '], { '#': D.ROCHER })]],
  prairie: [0.18, [...B.meule, ...B.barriere, B.arbre, ...B.chariot]],
  foret: [0.2, [B.arbre, B.tronc, B.souche, ...B.bille, T(['##'], { '#': D.ARBRE })]],
  neige: [0.18, [B.sapin, B.grosSapin, ...B.congere, ...B.roche]],
  mine: [0.18, [...B.caisses, T(['i'], { i: D.ETAI }), ...B.rocher, T(['x'], { x: D.WAGONNET })]],
  saloon: [0.17, [T(['T'], {}), T(['TT'], {}), T(['x'], { x: D.TONNEAU })]],
  ville: [0.18, [...B.caisses, ...B.barriere, ...B.sacs]],
  hacienda: [0.17, [...B.sacs, ...B.caisses, B.cactus, ...B.roche]],
};
// cases praticables autour d'une case (ses huit voisines)
function openAround(g, x, y) {
  let n = 0;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && IN(g, x + dx, y + dy) && !MOVE[g.c[(y + dy) * g.w + x + dx]]) n++;
  return n;
}
function densify(g) {
  const [target, kit] = FILL[g.theme];
  const { inner } = clutterOf({ w: g.w, h: g.h, cells: g.c });
  let tot = 0;
  for (let k = 0; k < g.n; k++) if (g.c[k] !== VOID) tot++;
  let need = Math.round((target + (g.R() - 0.5) * 0.04 - inner) * tot * 0.85);
  const ok = (x, y) => { const t = tOf(g, x, y); return t > 0.12 && t < 0.88 && (!g.inside || g.inside(x, y)) && (!g.eZone || g.theme !== 'hacienda' || x < g.w * 0.34 || g.eZone(x, y)); };
  const cands = [];
  for (let k = 0; k < g.n; k++) if (isGround(g.c[k]) && !g.res[k]) cands.push(k);
  for (let t = 0; t < 120 && need > 0; t++) {
    const p = place(g, kit, { ok: g.theme === 'mine' ? (x, y) => ok(x, y) && openAround(g, x, y) >= 6 : ok, tries: 4, cands, m: g.theme === 'mine' && t % 2 ? 0 : 1, rot: true });
    if (p) need -= 1.5;
  }
}
// les dents d'une case au bord du vide (laissées par les rues, les falaises…) sont rabotées
function deteeth(g) {
  const w = g.w;
  for (let it = 0; it < 3; it++) {
    let ch = 0;
    for (let y = 0; y < g.h; y++) for (let x = 0; x < w; x++) {
      const k = y * w + x, v = g.c[k] === VOID;
      let same = 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) same += IN(g, x + dx, y + dy) ? (g.c[(y + dy) * w + x + dx] === VOID) === v : 1;
      if (same > 1) continue;
      if (v) { g.c[k] = FLOOR; g.d[k] = 0; ch++; } else if (!g.res[k]) { g.c[k] = VOID; g.d[k] = 0; ch++; }
    }
    if (!ch) break;
  }
}
function finish(g) {
  if (g.theme !== 'mine' && g.theme !== 'saloon') deteeth(g);
  densify(g);
  connect(g);
  let dep = deploy(g);
  for (let k = 0; k < 10; k++) {
    const pairs = losPairs(g, dep.p, dep.e);
    if (pairs.length <= 0.18 * Math.min(6, dep.p.length) * Math.min(10, dep.e.length)) break;
    if (!blockSight(g, pairs)) break;
    connect(g);
    dep = deploy(g);
  }
  if (coverTopUp(g, dep)) { connect(g); dep = deploy(g); }
  if (g.theme === 'mine' && dep.p.length && dep.e.length && !flank(g, dep.p[0], dep.e[0])) { mineBypass(g, dep.p[0], dep.e[0]); connect(g); dep = deploy(g); }
  g.dep = dep;
  g.pen = penalty(g, dep);
}
// des couverts près des départs qui n'en ont pas à trois cases
function coverTopUp(g, dep) {
  const w = g.w;
  let added = false;
  for (const [side, zone] of [[dep.p, null], [dep.e, g.eZone]]) {
    const kit = g.theme === 'saloon' ? [...B.caisses] : KIT[g.theme];
    for (const s of side) g.res[s.y * w + s.x] = 3;
    const bare = side.filter((s) => {
      for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) if (COVER[AT(g, s.x + dx, s.y + dy)] && AT(g, s.x + dx, s.y + dy) !== VOID) return false;
      return true;
    });
    if (coverNear(g, side) >= 6 && bare.length <= side.length * 0.25) continue;
    for (const s of bare.length ? bare : side.slice(0, 2)) {
      if (place(g, kit, { near: s, rad: 3, tries: 20, soft2: 2, ok: zone ? (x, y) => zone(x, y) : null })) added = true;
    }
  }
  return added;
}
// Mine : une galerie de roulage (2 de large, avec ses rails) qui contourne le plus court chemin entre les camps
function mineBypass(g, a, b) {
  const { w, h } = g;
  const dig = (x, y) => { if (x >= 1 && y >= 1 && x < w - 1 && y < h - 1 && MOVE[g.c[y * w + x]]) put(g, x, y, FLOOR, 0); };
  const routes = [[{ x: a.x, y: b.y }], [{ x: b.x, y: a.y }], [{ x: a.x, y: 2 }, { x: b.x, y: 2 }], [{ x: a.x, y: h - 3 }, { x: b.x, y: h - 3 }]];
  for (const way of routes) {
    const pts = [];
    let cur = a;
    for (const p of [...way, b]) {
      const L = Math.max(Math.abs(p.x - cur.x), Math.abs(p.y - cur.y));
      for (let i = 0; i <= L; i++) pts.push({ x: cur.x + Math.sign(p.x - cur.x) * i, y: cur.y + Math.sign(p.y - cur.y) * i });
      cur = p;
    }
    const keepC = g.c.slice(), keepD = g.d.slice();
    for (const p of pts) for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) dig(p.x + dx, p.y + dy);
    if (flank(g, a, b)) {
      for (const p of pts) if (AT(g, p.x, p.y) === FLOOR) put(g, p.x, p.y, RAIL, 0);
      pts.forEach((p, i) => { if (i % 7 === 3) lampAt(g, p.x, p.y, 3); });
      break;
    }
    g.c.set(keepC); g.d.set(keepD);
  }
  // la paroi autour des nouvelles galeries
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (g.c[y * w + x] !== VOID) continue;
    let near = false;
    for (let dy = -1; dy <= 1 && !near; dy++) for (let dx = -1; dx <= 1; dx++) { const v = AT(g, x + dx, y + dy); if (v !== VOID && v !== WALL && v !== PILLAR && IN(g, x + dx, y + dy)) { near = true; break; } }
    if (near) put(g, x, y, WALL, D.MUR_ROC);
  }
}

// ------------------------------------------------------------ noms, ciel, et la carte finale
const NAMES = {
  desert: { dunes: ['LES DUNES BRÛLANTES', 'LA PISTE DES OSSEMENTS'], mesas: ['LES MESAS', 'LA TABLE DU DIABLE'], oasis: ['L\'OASIS', 'LA SOURCE CACHÉE'], ranch: ['LE RANCH ABANDONNÉ', 'LE RANCH BRÛLÉ'], cimetiere: ['BOOT HILL', 'LE CIMETIÈRE'] },
  canyon: { defile: ['LE DÉFILÉ', 'LA GORGE DU SERPENT'], gue: ['LE GUÉ BOUEUX', 'LA RIVIÈRE ROUGE'], eboulis: ['L\'ÉBOULIS', 'LES ROCHES FENDUES'] },
  prairie: { ferme: ['LA FERME DES MILLER', 'LA FERME'], champs: ['LES CHAMPS DE BLÉ', 'LE MOULIN'], bosquets: ['LES BOSQUETS', 'LA GRANDE PRAIRIE'], convoi: ['LE CERCLE DE CHARIOTS'] },
  foret: { futaie: ['LES BOIS NOIRS', 'LA FUTAIE'], riviere: ['LA RIVIÈRE AUX TRUITES', 'LE GUÉ DES CASTORS'], clairiere: ['LA CLAIRIÈRE', 'LA CABANE DU TRAPPEUR'], clairseme: ['LE BOIS CLAIRSEMÉ'] },
  neige: { sapins: ['LA SAPINIÈRE', 'LES SAPINS NOIRS'], lac: ['LE LAC GELÉ'], col: ['LE COL ENNEIGÉ', 'LA PASSE DU LOUP'] },
  mine: { galeries: ['LA MINE DU VIEUX JOE', 'LE FILON PERDU', 'LES GALERIES'], caverne: ['LA GRANDE CAVERNE', 'LE PUITS DU DIABLE'] },
  saloon: { grand: ['LE GOLDEN NUGGET', 'LE CHEVAL BORGNE'], tripot: ['LE TRIPOT', 'LE DERNIER VERRE'] },
  ville: { grandrue: ['LA GRAND-RUE', 'MAIN STREET'], carrefour: ['LE CARREFOUR', 'LA PLACE DU MARCHÉ'] },
  hacienda: { hacienda: ['LA HACIENDA D\'EL DIABLO'] },
};
// ciel et brouillard : la mine toujours dans le noir ; dehors, une fois sur trois de nuit ou dans la tempête
function weather(R, theme) {
  if (theme === 'mine') return { fog: true, dark: true, sky: 'mine' };
  if (theme === 'saloon') { const night = R() < 0.12; return { fog: night, dark: false, sky: night ? 'nuit' : 'jour' }; }
  if (R() >= (theme === 'hacienda' ? 0.4 : 0.3)) return { fog: false, dark: false, sky: 'jour' };
  const alt = { desert: 'tempete', canyon: 'tempete', neige: 'blizzard', foret: 'brume', prairie: 'brume' }[theme];
  return { fog: true, dark: false, sky: alt && R() < 0.5 ? alt : 'nuit' };
}
const ENV = { desert: 'desert', canyon: 'canyon', prairie: 'prairie', foret: 'foret', neige: 'neige', mine: 'mine' };

// La carte d'un combat (voir le contrat : cells, base, deploy, lights…). En plus : deco (ce que représente chaque case,
// voir DECO), sky ('jour', 'nuit', 'tempete', 'blizzard', 'brume' ou 'mine'), layout (le gabarit : 'oasis', 'defile',
// 'tripot'…), shape (la forme : 'plein', 'rect', 'ile', 'diag', 'L', 'cuvette', 'plateau'), lair (le repaire).
// Le générateur essaie jusqu'à dix variantes de la graine et garde la meilleure (tools/pistemaps-check.mjs vérifie).
export function makeBattle(seed, { region = 'desert', col = 1, kind = 'combat', theme = null } = {}) {
  if (!REGIONS.includes(region)) region = 'desert';
  if (!theme || !GEN[theme]) theme = themeFor(seed, region, col, kind);
  const base = hash(seed >>> 0, theme, region, col, kind);
  const sky = weather(rng((base ^ 0x5eed1e55) >>> 0), theme);
  let best = null;
  for (let a = 0; a < 10; a++) {
    const R = rng((base + Math.imul(a + 1, 0x9e3779b1)) >>> 0);
    const g = newGrid(R, theme, region, col, kind);
    Object.assign(g, sky);
    GEN[theme](g);
    finish(g);
    if (!best || g.pen < best.pen) best = g;
    if (g.pen === 0) break;
  }
  const g = best, R = rng((base ^ 0x4a3e) >>> 0);
  if (g.fog && !g.lights.length && theme !== 'saloon') campfire(g, g.eA, 4);
  const names = NAMES[theme][g.tpl] || [THEMES[theme]];
  return {
    theme, env: ENV[theme] || (theme === 'hacienda' ? 'desert' : ENV[region] || 'desert'), name: pick(R, names), region, kind, col,
    w: g.w, h: g.h, cells: g.c, base: g.c.slice(), deco: g.d, fog: g.fog, dark: g.dark, sky: g.sky,
    deploy: g.dep, lights: g.lights, seed, lair: theme === 'hacienda', layout: g.tpl, shape: g.shape,
  };
}
