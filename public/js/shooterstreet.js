// Fusillade : la grand-rue (façades, abris), dessinée une fois par partie, et les petits outils de dessin partagés par
// les autres décors de la fusillade (gare, abords, repaire). Même facture que la grand-rue du mode histoire
// (story/sets/rue.js, kit-ville.js) : bardages à la peinture écaillée, pierre, brique, corniches sur consoles, fenêtres
// à guillotine, vitrines, portes à panneaux, auvents, balcons à balustres, trottoir de planches, ombres portées ;
// mais à l'échelle de la fusillade (bustes de 48×56, portes de 56 px). Lumière en haut à gauche.
// La géométrie (fenêtres, portes, enseignes, toits : facade, belfry, signRect) est celle des emplacements des cibles
// (worlds.js) : le dessin la suit au pixel près. Le ciel reste transparent au-dessus des toits (shootersky.js derrière).
import * as S from './sprites.js';
import { canvasText } from './scene.js';
import { H, GROUND, STREET_W, facade, belfry, PROP_DIM, PROP_BASE } from './worlds.js';
import { bands, hash, sign as smallSign } from './story/sets/kit.js';
import {
  shadow, siding, battens, stone, boardwalk, steps, ghostText, poster, telePole, wire, tuft, waterTower, hitchRail,
  barrel, crate, sack, barberPole,
} from './story/sets/kit-ville.js';
import { Pix, P, range, wall as rockWall, pebbles, sow, hex, ramp, pick, css, vnoise, fbm, boulder, deadTree, bush } from './story/sets/kit-nature.js';
import { textW } from './uikit.js';

const OUT = S.OUT;
const sh = S.shade;
const G = GROUND, DECK = 7;
// rectangle plein, rectangle cerné (contexte en premier, comme les outils du mode histoire)
const R = (g, x, y, w, h, col) => { g.fillStyle = col; g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };
const bx = (g, x, y, w, h, col) => { R(g, x - 1, y - 1, w + 2, h + 2, OUT); R(g, x, y, w, h, col); };

// ------------------------------------------------------------ outils partagés (gare, abords, repaire)
export function paint(ctx) {
  const R = (x, y, w, h, col) => { ctx.fillStyle = col; ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };
  const box = (x, y, w, h, col) => { R(x - 1, y - 1, w + 2, h + 2, OUT); R(x, y, w, h, col); };
  return { R, box };
}

export function seeded(s) { return () => ((s = (s * 9301 + 49297) % 233280) / 233280); }

export function signRect(b, f) {
  const w = Math.min(b.w - 16, b.sign.length * 7 + 12);
  const y = f.roof === 'gable' ? f.top - 15 : f.up > 0 ? 98 : f.top + 5;
  return { x: Math.round(b.x + b.w / 2 - w / 2), y, w, h: 11 };
}

// vitre sombre : le haut dans l'ombre du linteau, reflets en biais
function glassFill(g, x, y, w, h, gl = '#28323e') {
  R(g, x, y, w, h, gl);
  R(g, x, y, w, 2, sh(gl, -0.35));
  for (let k = 0; k < h; k++) {
    const a = x + w - 3 - Math.floor(k * 0.7), b = a - 4;
    if (a > x && a < x + w && k % 12 < 6) R(g, a, y + k, 1, 1, sh(gl, 0.25));
    if (b > x && b < x + w && k % 17 < 3) R(g, b, y + k, 1, 1, sh(gl, 0.42));
  }
}
// rideaux noués et leur cantonnière
function drapes(g, x, y, w, h, c) {
  const cl = sh(c, 0.22), cd = sh(c, -0.32);
  for (let k = 3; k < h; k++) {
    const t = k / h, wv = t < 0.55 ? Math.round(6 - (t / 0.55) * 4) : Math.round(2 + ((t - 0.55) / 0.45) * 2);
    R(g, x, y + k, wv, 1, c); R(g, x + w - wv, y + k, wv, 1, c);
    R(g, x + wv - 1, y + k, 1, 1, cd); R(g, x + w - wv, y + k, 1, 1, cl);
  }
  R(g, x, y, w, 3, c); R(g, x, y, w, 1, cl); R(g, x, y + 3, w, 1, cd);
  for (let px = x + 1; px < x + w - 1; px += 4) R(g, px, y + 3, 2, 1, c);
  const ty = y + Math.round(h * 0.55);
  R(g, x, ty, 3, 1, '#e0b040'); R(g, x + w - 3, ty, 3, 1, '#e0b040');
}
// store à demi baissé
function blind(g, x, y, w, h, c) {
  const bh = Math.round(h * 0.32);
  R(g, x, y, w, bh, c);
  for (let yy = y + 2; yy < y + bh; yy += 3) R(g, x, yy, w, 1, sh(c, -0.1));
  R(g, x, y + bh, w, 1, sh(c, -0.4));
  R(g, x + (w >> 1) - 1, y + bh + 1, 2, 2, sh(c, -0.4));
}
// brise-bise (rideau de la moitié basse)
function cafe(g, x, y, w, h, c) {
  const ch = Math.round(h * 0.45), cy = y + h - ch;
  R(g, x, cy, w, ch, c);
  for (let px = x + 1; px < x + w; px += 3) R(g, px, cy + 1, 1, ch - 1, sh(c, -0.18));
  R(g, x, cy - 1, w, 1, '#c8a050');
}
// cadre de bois mouluré autour d'une ouverture : contour, chambranle éclairé en haut à gauche, feuillure sombre
function casing(g, x, y, w, h, trim, open = false) {
  const lt = sh(trim, 0.25), dk = sh(trim, -0.32);
  R(g, x - 4, y - 4, w + 8, h + (open ? 4 : 8), OUT);
  R(g, x - 3, y - 3, w + 6, h + (open ? 3 : 6), trim);
  R(g, x - 3, y - 3, w + 6, 1, lt); R(g, x - 3, y - 3, 1, h + (open ? 3 : 6), lt);
  R(g, x + w + 2, y - 2, 1, h + (open ? 2 : 5), dk);
  if (!open) R(g, x - 2, y + h + 2, w + 5, 1, dk);
  R(g, x - 1, y - 1, w + 2, h + (open ? 1 : 2), OUT);
}
// linteau mouluré (et fronton ou arc au-dessus) : bas en y - 4
function lintel(g, x, y, w, trim, cap) {
  const lt = sh(trim, 0.25), dk = sh(trim, -0.32), cx = x + w / 2;
  if (cap === 'ped') {
    const half0 = w / 2 + 6;
    for (let k = 0; k < 7; k++) {
      const hw = Math.round((half0 * (k + 1)) / 7);
      R(g, cx - hw - 1, y - 17 + k, hw * 2 + 2, 1, OUT);
      if (k) R(g, cx - hw + 1, y - 17 + k, hw * 2 - 2, 1, k === 1 ? lt : k > 4 ? sh(trim, -0.12) : trim);
    }
  } else if (cap === 'arch') {
    for (let i = -6; i < w + 6; i++) {
      const u = (i - w / 2 + 0.5) / (w / 2 + 6), a = Math.round(5 * Math.sqrt(Math.max(0, 1 - u * u)));
      R(g, x + i, y - 10 - a, 1, a + 1, OUT);
      if (a > 1) R(g, x + i, y - 9 - a, 1, a - 1, i < w / 2 ? lt : trim);
    }
    R(g, cx - 4, y - 17, 8, 9, OUT); R(g, cx - 3, y - 16, 6, 7, lt); R(g, cx + 1, y - 16, 2, 7, trim); // la clé
  }
  R(g, x - 6, y - 10, w + 12, 6, OUT);
  R(g, x - 5, y - 9, w + 10, 4, trim); R(g, x - 5, y - 9, w + 10, 1, lt); R(g, x - 5, y - 6, w + 10, 1, dk);
}
// appui de fenêtre et son ombre
function sill(g, x, y, w, trim) {
  R(g, x - 6, y, w + 12, 5, OUT);
  R(g, x - 5, y + 1, w + 10, 3, trim); R(g, x - 5, y + 1, w + 10, 1, sh(trim, 0.25)); R(g, x - 5, y + 3, w + 10, 1, sh(trim, -0.3));
  shadow(g, x - 4, y + 5, w + 8, 2, 0.28);
}

// Vitrail en ogive (église, chapelle) : losanges de verre coloré sertis de plomb
function stained(g, r, trim) {
  const { x, y, w, h } = r, a = Math.max(7, Math.round(w * 0.55)), cx = x + w / 2;
  const half = (yy, p) => {
    if (yy >= y) return w / 2 + p;
    const t = (y - yy) / (a + p);
    return t >= 1 ? -1 : (w / 2 + p) * Math.sqrt(1 - t);
  };
  for (const [p, col] of [[4, OUT], [3, trim], [1, OUT]]) {
    for (let yy = y - a - p; yy < y + h + p; yy++) {
      const hw = half(yy, p);
      if (hw > 0) R(g, Math.round(cx - hw), yy, Math.round(hw * 2), 1, col);
    }
  }
  R(g, Math.round(cx - w / 2 - 3), y - 4, 1, h + 7, sh(trim, 0.25));
  const cols = ['#3a5ea8', '#b8402a', '#d8a838', '#3a7a4a', '#7a4a9a'];
  for (let yy = y - a; yy < y + h; yy++) {
    const hw = half(yy, 0);
    if (hw <= 0) continue;
    for (let xx = Math.round(cx - hw); xx < Math.round(cx + hw); xx++) {
      const u = xx - x, v = yy - y + 40;
      const lead = (u + v) % 5 === 0 || (u - v + 200) % 5 === 0;
      let c = lead ? '#2a1a1a' : cols[(Math.floor((u + v) / 5) + Math.floor((u - v + 200) / 5)) % 5];
      if (!lead && u < w / 2 && yy < y + h / 3) c = sh(c, 0.18);
      R(g, xx, yy, 1, 1, c);
    }
  }
  R(g, x, y + Math.round(h / 2), w, 1, '#2a1a1a');
  sill(g, x, y + h + 3, w, trim);
}

// Fenêtre à guillotine dans le rectangle r (l'ouverture où surgit le bandit) : volets, linteau, chambranle, vitre,
// rideaux ou store, petits-bois, appui. o : { shutters, cap: 'flat' | 'ped' | 'arch' | false, curtain, blind, cafe,
// glass, sill, goods(g, x, y, w, h) } ; sans o, rideaux tirés au sort (rnd). glass : vitrail en ogive.
export function drawWindow(ctx, r, trim, rnd, glass = false, o = {}) {
  const g = ctx, { x, y, w, h } = r;
  if (glass) { stained(g, r, trim); return; }
  if (o.shutters) for (const sx of [x - 12, x + w + 4]) {
    R(g, sx - 1, y - 4, 10, h + 8, OUT);
    R(g, sx, y - 3, 8, h + 6, o.shutters);
    for (let yy = y - 1; yy < y + h + 2; yy += 3) R(g, sx + 1, yy, 6, 1, sh(o.shutters, -0.32));
    R(g, sx, y - 3, 1, h + 6, sh(o.shutters, 0.22));
    R(g, sx + 1, y + (h >> 1) - 1, 6, 2, sh(o.shutters, 0.08));
  }
  const cap = o.cap === undefined ? 'flat' : o.cap;
  if (cap) lintel(g, x, y, w, trim, cap);
  casing(g, x, y, w, h, trim);
  glassFill(g, x, y, w, h, o.glass);
  let cur = o.curtain, bl = o.blind;
  if (cur === undefined && bl === undefined && !o.cafe && !o.goods && rnd) {
    const k = rnd();
    cur = k < 0.5 ? ['#a8403a', '#c8a060', '#5a7a9a', '#e8dcc0'][Math.floor(rnd() * 4)] : null;
    bl = k > 0.72 ? '#d8c8a0' : null;
  }
  if (o.goods) o.goods(g, x, y, w, h);
  if (bl) blind(g, x, y, w, h, bl);
  if (o.cafe) cafe(g, x, y, w, h, o.cafe);
  const fr = sh(trim, -0.05);
  if (o.shop) { // vitrine : un meneau, une imposte
    R(g, x + (w >> 1), y, 1, h, fr);
    R(g, x, y + Math.round(h * 0.28), w, 1, fr); R(g, x, y + Math.round(h * 0.28) + 1, w, 1, sh(fr, -0.4));
  } else { // guillotine : deux châssis à deux carreaux
    const mid = y + Math.floor(h / 2);
    R(g, x, y, 1, h, fr); R(g, x + w - 1, y, 1, h, sh(fr, -0.2));
    R(g, x + (w >> 1), y, 1, h, fr);
    R(g, x, mid - 1, w, 2, fr); R(g, x, mid + 1, w, 1, sh(fr, -0.4));
  }
  if (cur) drapes(g, x + 1, y, w - 2, h, cur);
  if (o.sill !== false) sill(g, x, y + h + 3, w, trim);
}

// Porte dans le rectangle d (l'ouverture où surgit le bandit) : chambranle (cintré si arched), linteau, imposte vitrée,
// battants à panneaux ou vitrés, poignée. col : couleur du bois. o : { double, glass, blind, planks, transom, cap, open(g, x, y, w, h) }
export function drawDoor(ctx, d, trim, col, arched = false, o = {}) {
  const g = ctx, { x, y, w, h } = d;
  const lt = sh(trim, 0.25);
  if (arched) {
    const a = Math.max(6, Math.round(w * 0.32)), cx = x + w / 2;
    for (const [p, c] of [[4, OUT], [3, trim], [1, OUT], [0, '#1e1410']]) {
      for (let k = 0; k <= a + p; k++) {
        const t = k / (a + p), hw = (w / 2 + p) * Math.sqrt(1 - t * t);
        R(g, Math.round(cx - hw), y - 1 - k, Math.round(hw * 2), 1, c);
      }
    }
    for (let k = 1; k < 5; k++) { const an = (k / 5) * Math.PI; R(g, Math.round(cx - Math.cos(an) * (w / 2 - 2)), Math.round(y - 1 - Math.sin(an) * (a - 2)), 1, 1, trim); }
  } else if (o.cap !== false) lintel(g, x, y, w, trim, false);
  casing(g, x, y, w, h, trim, true);
  if (o.open) { o.open(g, x, y, w, h); return; }
  let ly = y;
  if (o.transom !== false && !arched && h >= 40) { // l'imposte vitrée
    glassFill(g, x, y, w, 7);
    for (let k = 1; k < 4; k++) R(g, x + Math.round((k * w) / 4), y, 1, 7, trim);
    R(g, x, y + 7, w, 2, trim); R(g, x, y + 7, w, 1, lt); R(g, x, y + 9, w, 1, OUT);
    ly = y + 10;
  }
  const lh = y + h - ly, n = o.double ? 2 : 1, lw = Math.floor((w - (n - 1)) / n);
  const recess = (px, py, pw, ph) => {
    R(g, px, py, pw, ph, sh(col, -0.16));
    R(g, px, py, pw, 1, sh(col, -0.42)); R(g, px, py, 1, ph, sh(col, -0.42));
    R(g, px, py + ph - 1, pw, 1, sh(col, 0.16)); R(g, px + pw - 1, py, 1, ph, sh(col, 0.16));
  };
  for (let i = 0; i < n; i++) {
    const lx = x + i * (lw + 1);
    if (i) R(g, lx - 1, ly, 1, lh, OUT);
    R(g, lx, ly, lw, lh, col); R(g, lx, ly, 1, lh, sh(col, 0.2)); R(g, lx + lw - 1, ly, 1, lh, sh(col, -0.35));
    if (o.planks) {
      for (let px = lx + 5; px < lx + lw - 2; px += 5) R(g, px, ly, 1, lh, sh(col, -0.32));
      for (const yy of [ly + 5, ly + lh - 9]) { R(g, lx, yy, lw, 3, '#34343c'); R(g, lx, yy, lw, 1, '#6a6a72'); for (let px = lx + 2; px < lx + lw; px += 6) R(g, px, yy + 1, 1, 1, '#9a9aa2'); }
      for (let k = 0; k < lh - 18; k++) R(g, lx + 2 + Math.round((k * (lw - 6)) / (lh - 18)), ly + lh - 10 - k, 2, 1, sh(col, -0.22)); // l'écharpe
    } else if (o.glass) {
      const gx = lx + 3, gy = ly + 3, gw = lw - 6, gh = Math.round(lh * 0.42);
      R(g, gx - 1, gy - 1, gw + 2, gh + 2, OUT);
      glassFill(g, gx, gy, gw, gh);
      if (o.blind) blind(g, gx, gy, gw, gh, o.blind);
      if (gw > 10) R(g, gx + (gw >> 1), gy, 1, gh, col);
      recess(lx + 3, gy + gh + 4, lw - 6, lh - gh - 10);
    } else {
      const ph = Math.floor((lh - 10) / 2), cols = lw >= 20 ? 2 : 1, pw = Math.floor((lw - 4 - cols * 2) / cols);
      for (let c = 0; c < cols; c++) for (const py of [ly + 3, ly + 6 + ph]) recess(lx + 3 + c * (pw + 2), py, pw, ph - (py === ly + 3 ? 2 : 0));
    }
  }
  const ky = y + Math.round(h * 0.56);
  if (o.double) { R(g, x + lw - 3, ky, 2, 2, '#e0b040'); R(g, x + lw + 2, ky, 2, 2, '#e0b040'); }
  else { R(g, x + w - 5, ky, 2, 2, '#e0b040'); R(g, x + w - 5, ky + 4, 1, 2, OUT); }
}

// Toit à pignon vu du dessus (gare, abords) : bardeaux en rangs, rive cernée ; R : celui de paint(ctx)
export function gable(R, b, f, col) {
  const { x, w, top } = f;
  for (let dy = 0; dy <= 22; dy++) {
    const hw = (w / 2 + 4) * (1 - dy / 24), x0 = x + w / 2 - hw, row = Math.floor(dy / 3);
    R(x0 - 1, top - dy, hw * 2 + 2, 1, OUT);
    R(x0, top - dy, hw * 2, 1, dy % 3 === 0 ? S.shade(col, -0.3) : S.shade(col, (row % 2 ? 0.05 : -0.03) + (dy % 3 === 2 ? 0.09 : 0)));
    if (dy % 3 === 1) for (let xx = x0 + 2 + (row % 2) * 3; xx < x0 + hw * 2 - 2; xx += 6) R(xx, top - dy, 1, 2, S.shade(col, -0.24));
    R(x0, top - dy, 2, 1, S.shade(col, 0.25)); R(x0 + hw * 2 - 2, top - dy, 2, 1, S.shade(col, -0.35));
  }
  R(x + w / 2 - 3, top - 24, 6, 3, OUT); R(x + w / 2 - 2, top - 23, 4, 1, S.shade(col, 0.2));
}

// ------------------------------------------------------------ la grand-rue
// Facture de chaque commerce : matière du mur (bardage peint, planches et couvre-joints, pierre), boiseries, volets,
// rideaux, linteaux, lettres peintes sur le fronton, vitrines (shop : étalage du commerce)
const WOOD = '#8a6a48';
const STYLE = {
  stable: { mat: 'battens', trim: '#e0d4b4', frame: '#5a3a22' },
  bank: { mat: 'stone', trim: '#e4d8bc', frame: '#4a3a2a', cap: 'arch', blind: '#d8c8a0', door: '#3a2418' },
  store: { mat: 'siding', peel: 0.35, trim: '#e8dcc0', frame: '#3a2a1e', ghost: 'GRAINS · OUTILS · TISSUS', shop: 'store', door: '#4a3a2a' },
  hotel: { mat: 'siding', peel: 0.45, trim: '#eadcb8', frame: '#3e5236', shutters: '#3e5236', curtain: '#f0e8d8', cap: 'ped', ghost: 'CHAMBRES · BAINS', door: '#4a3420' },
  sheriff: { mat: 'stone', trim: '#8a7a62', frame: '#2a2622', door: '#4a3a2a' },
  barber: { mat: 'siding', peel: 0.4, trim: '#f0e8d8', frame: '#7a1a14', ghost: 'BAINS CHAUDS · RASAGE', shop: 'barber', door: '#4a5a3a' },
  undertaker: { mat: 'siding', peel: 0.25, trim: '#c8c0b0', frame: '#1e1a1a', curtain: '#4a2a4a', ghost: 'CERCUEILS SUR MESURE', door: '#2a2224' },
  post: { mat: 'siding', peel: 0.5, trim: '#e8e4d8', frame: '#2a3a5a', blind: '#e0d0a8', ghost: 'POSTE · DILIGENCES', door: '#3a4a5a' },
  church: { mat: 'siding', peel: 0.12, trim: '#f4f0e4', frame: '#5a4a3a', door: '#6a3a22' },
  jail: { mat: 'stone', trim: '#6a6458', frame: '#2a2622', door: '#3a3a36' },
  gunsmith: { mat: 'siding', peel: 0.4, trim: '#d8d0b0', frame: '#2a2a2a', ghost: 'FUSILS · POUDRE · PLOMB', shop: 'gun', door: '#3a2a1e' },
  doctor: { mat: 'siding', peel: 0.3, trim: '#f0ece0', frame: '#3a4a5a', blind: '#e8dcc0', ghost: 'PHARMACIE', shop: 'doc', door: '#3a4048' },
  smithy: { mat: 'battens', trim: '#a89070', frame: '#2a2622' },
  theater: { mat: 'siding', peel: 0.25, trim: '#e8c878', frame: '#5a1a3a', curtain: '#a82a3a', ghost: 'CE SOIR', door: '#7a1a24' },
  laundry: { mat: 'siding', peel: 0.3, trim: '#f4f0e8', frame: '#3a5a6a', ghost: 'BLANCHISSAGE', shop: 'linen', door: '#4a6a7a' },
  saloon: { mat: 'siding', peel: 0.4, trim: '#e4d4a8', frame: '#2a1810', curtain: '#c8a050', door: '#4a2418' },
};

// mur : planches à clin peintes et écaillées, planches à couvre-joints ou pierre de taille
function wallFill(g, b, K, x, y, w, h, seed) {
  if (K.mat === 'battens') battens(g, x, y, w, h, b.col, seed, 8);
  else if (K.mat === 'stone') stone(g, x, y, w, h, b.col, seed, 8);
  else siding(g, x, y, w, h, WOOD, seed, { lap: 6, paint: b.col, peel: K.peel || 0, stain: 1 });
}

// corniche saillante sur consoles : chapeau autour de top (la ligne où se coupe le bandit du toit), frise de ch px
function crown(g, x, w, top, ch, col) {
  const lt = sh(col, 0.25), dk = sh(col, -0.35);
  shadow(g, x, top + ch, w, 3, 0.34);
  if (ch > 5) {
    R(g, x, top + 3, w, ch - 3, sh(col, -0.14)); R(g, x, top + ch - 1, w, 1, OUT);
    for (let px = x + 2; px < x + w - 2; px += 3) R(g, px, top + 4, 2, 2, sh(col, 0.06)); // denticules
    const n = Math.max(2, Math.round(w / 14));
    for (let k = 0; k <= n; k++) {
      const px = Math.round(x + 1 + (k * (w - 5)) / n);
      R(g, px - 1, top + 3, 5, ch - 1, OUT); R(g, px, top + 3, 3, ch - 2, col); R(g, px, top + 3, 1, ch - 2, lt); R(g, px, top + ch - 3, 3, 1, dk);
    }
  }
  R(g, x - 5, top - 3, w + 10, 7, OUT);
  R(g, x - 4, top - 2, w + 8, 5, col); R(g, x - 4, top - 2, w + 8, 1, lt); R(g, x - 4, top + 1, w + 8, 1, sh(col, -0.12)); R(g, x - 4, top + 2, w + 8, 1, dk);
}

// plaque d'enseigne (le nom du commerce est écrit par-dessus à chaque image) : cadre de bois cloué autour du rectangle
function plate(g, sr, frame) {
  const cream = '#ecdcac';
  R(g, sr.x - 3, sr.y - 3, sr.w + 6, sr.h + 6, OUT);
  R(g, sr.x - 2, sr.y - 2, sr.w + 4, sr.h + 4, frame);
  R(g, sr.x - 2, sr.y - 2, sr.w + 4, 1, sh(frame, 0.35)); R(g, sr.x - 2, sr.y - 2, 1, sr.h + 4, sh(frame, 0.2));
  R(g, sr.x, sr.y, sr.w, sr.h, cream);
  R(g, sr.x, sr.y, sr.w, 1, sh(cream, 0.12));
  for (const yy of [sr.y + 4, sr.y + 8]) R(g, sr.x, yy, sr.w, 1, sh(cream, -0.04));
  R(g, sr.x, sr.y + sr.h - 1, sr.w, 1, sh(cream, -0.16)); R(g, sr.x + sr.w - 1, sr.y, 1, sr.h, sh(cream, -0.12));
  for (const [px, py] of [[sr.x - 2, sr.y - 2], [sr.x + sr.w + 1, sr.y - 2], [sr.x - 2, sr.y + sr.h + 1], [sr.x + sr.w + 1, sr.y + sr.h + 1]]) R(g, px, py, 1, 1, '#e0b040');
  shadow(g, sr.x - 1, sr.y + sr.h + 3, sr.w + 4, 2, 0.3);
}

// pignon de face (écurie, forge, église, cabane) : triangle de bardage au-dessus de top, rive de bardeaux, planche de
// rive, bandeau au pied du pignon (les oiseaux s'y posent)
function gableEnd(g, x, w, top, gh, fill, roof, trim) {
  const cx = x + w / 2, half0 = w / 2 + 6, ox = Math.floor(x - 7), W2 = w + 15;
  const yAt = (xx) => top - gh * (1 - Math.abs(xx + 0.5 - cx) / half0);
  const tmp = S.makeCanvas(W2, gh + 2), t = tmp.getContext('2d');
  fill(t, 0, 0, W2, gh + 2);
  for (let i = 0; i < W2; i++) { const yy = Math.round(yAt(ox + i)) + 5 - (top - gh); t.clearRect(i, 0, 1, Math.max(0, yy)); }
  g.drawImage(tmp, ox, top - gh);
  S.freeCanvas(tmp);
  for (let xx = Math.round(cx - half0); xx < Math.round(cx + half0); xx++) {
    const yy = Math.round(yAt(xx)), left = xx < cx;
    R(g, xx, yy - 1, 1, 1, OUT);
    R(g, xx, yy, 1, 3, (xx >> 2) % 2 ? roof : sh(roof, -0.18)); // bouts de bardeaux
    R(g, xx, yy, 1, 1, sh(roof, 0.25));
    R(g, xx, yy + 3, 1, 1, OUT);
    R(g, xx, yy + 4, 1, 2, left ? sh(trim, 0.12) : sh(trim, -0.18)); // planche de rive
    R(g, xx, yy + 6, 1, 1, sh(trim, -0.45));
  }
  R(g, cx - 2, top - gh - 4, 4, 4, OUT); R(g, cx - 1, top - gh - 3, 2, 3, trim); // l'épi
}
// le bandeau au pied du pignon (après le mur)
function belt(g, x, w, top, trim) {
  R(g, x - 7, top - 4, w + 14, 6, OUT);
  R(g, x - 6, top - 3, w + 12, 4, trim); R(g, x - 6, top - 3, w + 12, 1, sh(trim, 0.28)); R(g, x - 6, top, w + 12, 1, sh(trim, -0.32));
  shadow(g, x, top + 2, w, 3, 0.3);
}

// étoile du shérif
function star(g, cx, cy, s = 1) {
  const pts = [[-1, -6, 3, 13], [-6, -1, 13, 3], [-4, -4, 9, 9], [-3, 3, 2, 3], [2, 3, 2, 3]].map(([a, b, c, d]) => [a * s, b * s, c * s, d * s]);
  for (const [ax, ay, aw, ah] of pts) R(g, cx + ax - 1, cy + ay - 1, aw + 2, ah + 2, OUT);
  for (const [ax, ay, aw, ah] of pts) R(g, cx + ax, cy + ay, aw, ah, '#e0b040');
  R(g, cx - 3 * s, cy - 3 * s, 3 * s, 2 * s, '#f8e090'); R(g, cx, cy, s, s, '#a06a20'); R(g, cx + 2 * s, cy + 2 * s, 2 * s, 2 * s, '#b8862a');
}
// cercueil debout, appuyé au mur
function coffin(g, cx, base, col = '#4a2c18') {
  for (let k = 0; k < 46; k++) {
    const yy = base - 46 + k, hw = k < 12 ? 4 + Math.round(k / 4) : 7 - Math.round((k - 12) / 12);
    R(g, cx - hw - 1, yy, hw * 2 + 2, 1, OUT);
    R(g, cx - hw, yy, hw * 2, 1, k === 0 ? sh(col, 0.2) : col);
    R(g, cx - hw, yy, 1, 1, sh(col, 0.2)); R(g, cx + hw - 1, yy, 1, 1, sh(col, -0.3));
  }
  R(g, cx - 7, base - 47, 14, 1, OUT);
  R(g, cx - 1, base - 38, 2, 11, '#c8b07c'); R(g, cx - 3, base - 35, 6, 2, '#c8b07c');
  shadow(g, cx + 6, base - 2, 6, 2, 0.3);
}
// banc de planches sous l'auvent
function bench(g, x, base, w = 24) {
  bx(g, x, base - 10, w, 3, '#7a5232'); R(g, x, base - 10, w, 1, '#9a7048');
  bx(g, x, base - 18, w, 3, '#7a5232'); R(g, x, base - 18, w, 1, '#9a7048');
  for (const px of [x + 2, x + w - 4]) { bx(g, px, base - 7, 2, 7, '#5a3a22'); bx(g, px, base - 15, 2, 5, '#5a3a22'); }
  shadow(g, x + 3, base - 1, w, 2, 0.3);
}

// les étalages des vitrines
const GOODS = {
  store(g, x, y, w, h) {
    R(g, x, y + h - 9, w, 1, '#6a4a2a');
    for (let k = 1; k < w - 2; k += 4) R(g, x + k, y + h - 8, 3, 7, ['#a8302a', '#c8a050', '#4a7a3a', '#d8c8a0'][(k >> 2) % 4]);
    R(g, x, y + h - 19, w, 1, '#6a4a2a');
    for (let k = 2; k < w - 4; k += 6) { R(g, x + k, y + h - 26, 4, 7, ['#6a8aa0', '#c8b088', '#8a5a34'][(k / 6 | 0) % 3]); R(g, x + k + 1, y + h - 27, 2, 1, '#3a3a42'); }
  },
  gun(g, x, y, w, h) {
    for (let k = 3; k < w - 3; k += 5) { R(g, x + k, y + 6, 1, h - 14, '#3a3a42'); R(g, x + k, y + h - 12, 2, 8, '#7a4a24'); R(g, x + k, y + 6, 1, 1, '#9aa0a8'); }
    R(g, x, y + h - 4, w, 4, '#5a3a22');
  },
  doc(g, x, y, w, h) {
    for (const [px, c] of [[0.22, '#c0302a'], [0.5, '#3a8a5a'], [0.78, '#3a5ea8']]) {
      const cx = Math.round(x + w * px);
      S.disc(g, cx, y + h - 8, 4, OUT); S.disc(g, cx, y + h - 8, 3, c); R(g, cx - 2, y + h - 10, 1, 2, sh(c, 0.5));
      R(g, cx - 1, y + h - 15, 2, 4, OUT); R(g, cx - 3, y + h - 3, 6, 2, OUT);
    }
  },
  barber(g, x, y, w, h) {
    R(g, x, y + h - 10, w, 1, '#6a4a2a');
    for (let k = 2; k < w - 2; k += 4) { R(g, x + k, y + h - 16 + (k % 3), 2, 6 - (k % 3), ['#3a8a6a', '#c8a050', '#a84a6a'][k % 3]); }
    R(g, x + 3, y + 6, w - 6, 10, '#6a7a88'); R(g, x + 3, y + 6, w - 6, 1, '#c8a050'); R(g, x + 5, y + 8, 3, 1, '#b8c8d0'); // le miroir
  },
  linen(g, x, y, w, h) {
    for (let k = 0; k < 3; k++) { const c = ['#f4ecd8', '#a8c8d8', '#e8d0d0'][k]; for (let j = 0; j < 3; j++) { R(g, x + 3 + k * 9, y + h - 6 - j * 4, 7, 3, c); R(g, x + 3 + k * 9, y + h - 4 - j * 4, 7, 1, sh(c, -0.25)); } }
  },
};

// intervalles libres du rez-de-chaussée (hors fenêtres et porte), pour poser affiches, bancs, tonneaux
function freeSpans(b, f) {
  const occ = [...f.windows.filter((wn) => !wn.up).map((wn) => [wn.x - 8, wn.x + wn.w + 8]), [f.door.x - 8, f.door.x + f.door.w + 8]].sort((a, c) => a[0] - c[0]);
  const spans = [];
  let x = b.x + 4;
  for (const [a, c] of occ) { if (a - x >= 10) spans.push([x, a]); x = Math.max(x, c); }
  if (b.x + b.w - 4 - x >= 10) spans.push([x, b.x + b.w - 4]);
  return spans;
}

function drawBuilding(g, b) {
  const f = facade(b), { x, w, top } = f, d = f.door;
  const K = STYLE[b.kind] || STYLE.store;
  const r = seeded(b.x * 13 + 7);
  const trim = K.trim, seed = b.x;
  const gab = f.roof === 'gable';
  const ups = f.windows.filter((wn) => wn.up), lows = f.windows.filter((wn) => !wn.up);
  const winTop = ups.length ? Math.min(...ups.map((wn) => wn.y)) : 116;
  const fill = (t, a, c, e, h) => wallFill(t, b, K, a, c, e, h, seed + 5);
  // le pignon, ou le fronton à gradins / cintré au-dessus de la corniche (dessinés avant : la corniche passe devant)
  if (gab) gableEnd(g, x, w, top, 24, fill, b.kind === 'church' ? '#5a4a5a' : '#5a3a26', trim);
  const fw = Math.round(w * 0.3), fx = Math.round(x + (w - fw) / 2);
  if (f.roof === 'step') {
    for (const [sx, sw, sy] of [[fx, fw, top - 11], [fx + 8, fw - 16, top - 19]]) {
      R(g, sx - 1, sy - 1, sw + 2, top - sy + 1, OUT); wallFill(g, b, K, sx, sy, sw, top - sy, seed + sy);
      R(g, sx - 3, sy - 2, sw + 6, 4, OUT); R(g, sx - 2, sy - 1, sw + 4, 2, trim); R(g, sx - 2, sy - 1, sw + 4, 1, sh(trim, 0.25));
      shadow(g, sx, sy + 2, sw, 2, 0.3);
    }
  } else if (f.roof === 'arch') {
    const ah = 16;
    for (let i = -3; i < fw + 3; i++) {
      const u = (i + 0.5 - fw / 2) / (fw / 2 + 3), a = Math.round(ah * Math.sqrt(Math.max(0, 1 - u * u)));
      R(g, fx + i, top - a - 1, 1, a + 1, OUT);
    }
    const tmp = S.makeCanvas(fw + 4, ah + 1), t = tmp.getContext('2d');
    wallFill(t, b, K, 0, 0, fw + 4, ah + 1, seed + 9);
    g.save(); g.beginPath();
    for (let i = -1; i < fw + 1; i++) {
      const u = (i + 0.5 - fw / 2) / (fw / 2 + 3), a = Math.round(ah * Math.sqrt(Math.max(0, 1 - u * u)));
      g.rect(fx + i, top - a + 2, 1, a);
    }
    g.clip(); g.drawImage(tmp, fx - 2, top - ah); g.restore(); S.freeCanvas(tmp);
    for (let i = -1; i < fw + 1; i++) { // la moulure de l'arc
      const u = (i + 0.5 - fw / 2) / (fw / 2 + 3), a = Math.round(ah * Math.sqrt(Math.max(0, 1 - u * u)));
      if (a > 0) R(g, fx + i, top - a, 1, 2, i < fw / 2 ? sh(trim, 0.2) : trim);
    }
    // la rosace (ou la date de la banque)
    if (b.kind === 'bank' || b.kind === 'theater') ghostText(g, b.kind === 'bank' ? '1872' : '★', x + w / 2, top - 11, '#4a3020', 0.75);
    else { const cx = Math.round(x + w / 2); S.disc(g, cx, top - 7, 4, OUT); S.disc(g, cx, top - 7, 3, trim); R(g, cx - 1, top - 8, 2, 2, '#e0b040'); }
  }
  // le mur
  R(g, x - 1, top - 1, w + 2, G - top + 1, OUT);
  fill(g, x, top, w, G - top);
  if (K.mat !== 'stone') for (const px of [x, x + w - 4]) { // planches d'angle
    R(g, px, top, 4, G - top, trim); R(g, px, top, 1, G - top, sh(trim, 0.25)); R(g, px + 3, top, 1, G - top, sh(trim, -0.35));
  } else { // chaînes d'angle et soubassement de pierre
    for (const px of [x, x + w - 9]) for (let yy = top + 4, k = 0; yy < G - 2; yy += 8, k++) {
      const qw = k % 2 ? 9 : 6, qx = px === x ? x : x + w - qw;
      R(g, qx, yy, qw, 7, sh(b.col, 0.14)); R(g, qx, yy, qw, 1, sh(b.col, 0.3)); R(g, qx, yy + 7, qw, 1, sh(b.col, -0.4));
    }
    R(g, x, G - 12, w, 12, sh(b.col, -0.12)); R(g, x, G - 12, w, 1, sh(b.col, 0.2)); R(g, x, G - 13, w, 1, OUT);
    for (let px = x + 5; px < x + w; px += 14) R(g, px, G - 11, 1, 11, sh(b.col, -0.4));
  }
  if (gab) belt(g, x, w, top, trim);
  if (b.kind === 'smithy') { stone(g, x, G - 30, w, 30, '#7a6e62', seed, 7); R(g, x, G - 31, w, 1, OUT); }
  if (b.kind === 'stable') { // bandes blanches en X sur le soubassement
    R(g, x, G - 34, w, 2, trim); R(g, x, G - 33, w, 1, sh(trim, -0.3));
  }
  // lettres peintes sur le fronton, délavées (si la place le permet)
  const ch = gab ? 0 : f.up > 0 ? Math.max(4, Math.min(11, winTop - 11 - top)) : 4;
  const capH = { ped: 17, arch: 17, flat: 10 }[K.cap || 'flat'];
  const cap = gab || f.up === 0 ? K.cap || 'flat' : winTop - capH >= top + ch + 1 ? K.cap || 'flat' : winTop - 10 >= top + ch + 1 ? 'flat' : false;
  const ghost = K.ghost && (textW(K.ghost) <= w - 20 ? K.ghost : K.ghost.split(' · ')[0]);
  if (ghost && f.up > 0 && !gab && b.kind !== 'saloon' && winTop - 12 - (top + ch) >= 12) ghostText(g, ghost, x + w / 2, top + ch + Math.round((winTop - 12 - top - ch - 8) / 2) + 1, sh(b.col, -0.6), 0.5);
  // l'étage
  const spacing = ups.length ? w / (ups.length + 1) : 0;
  for (const wn of ups) {
    const o = { cap, shutters: K.shutters && spacing >= 52 ? K.shutters : null, curtain: K.curtain, blind: K.blind };
    if (b.kind === 'stable') hayLoft(g, wn, trim, b.col);
    else drawWindow(g, wn, trim, r, b.kind === 'church', o);
  }
  // la porte (avant le bandeau de l'enseigne, qui recouvre le haut du chambranle)
  drawShopDoor(g, b, f, K);
  // le bandeau de l'étage (l'enseigne y est clouée)
  if (f.up > 0 && !gab) {
    const bc = sh(b.col, -0.42);
    R(g, x - 3, 95, w + 6, 15, OUT);
    R(g, x - 2, 96, w + 4, 13, bc); R(g, x - 2, 96, w + 4, 1, sh(bc, 0.35)); R(g, x - 2, 98, w + 4, 1, sh(bc, -0.25));
    R(g, x - 2, 106, w + 4, 1, sh(bc, 0.18)); R(g, x - 2, 108, w + 4, 1, sh(bc, -0.3));
    shadow(g, x, 110, w, 3, 0.36);
    for (const wn of ups) sill(g, wn.x, wn.y + wn.h + 1, wn.w, trim);
  }
  // le rez-de-chaussée : vitrines ou fenêtres
  for (const wn of lows) {
    const shop = K.shop && !b.bars;
    drawWindow(g, wn, trim, r, false, {
      cap: f.up > 0 && !gab ? false : 'flat', shop, goods: shop ? GOODS[K.shop] : null, sill: !shop,
      curtain: shop ? null : K.curtain, blind: shop ? null : K.blind || '#d8c8a0', cafe: b.kind === 'saloon' ? '#e8dcc0' : null,
    });
    if (shop) { // le soubassement à panneaux sous la vitrine
      const ky = wn.y + wn.h + 3, kh = G - 1 - ky;
      R(g, wn.x - 4, ky, wn.w + 8, kh + 1, OUT);
      R(g, wn.x - 3, ky + 1, wn.w + 6, kh - 1, trim); R(g, wn.x - 3, ky + 1, wn.w + 6, 1, sh(trim, 0.25));
      for (const px of [wn.x, wn.x + (wn.w >> 1) + 1]) { const pw = (wn.w >> 1) - 1; R(g, px, ky + 3, pw, kh - 6, sh(trim, -0.18)); R(g, px, ky + 3, pw, 1, sh(trim, -0.4)); R(g, px, ky + kh - 4, pw, 1, sh(trim, 0.15)); }
    }
  }
  // l'enseigne (sous la corniche pour une façade sans étage : après elle)
  if (b.sign && (gab || f.up > 0)) plate(g, signRect(b, f), K.frame);
  kindDetails(g, b, f, K, r);
  // la corniche (après l'étage : elle peut mordre sur le haut des chambranles)
  if (!gab) crown(g, x, w, top, ch, f.up > 0 ? trim : sh(trim, -0.1));
  if (b.sign && !gab && f.up === 0) plate(g, signRect(b, f), K.frame);
  // le clocher de l'église
  if (b.steeple) steeple(g, b, f, trim);
  // ombres de l'auvent ou du balcon sur la façade
  if (f.awning || f.balcony) {
    shadow(g, x, f.balcony ? 110 : 116, w, 7, 0.26);
    shadow(g, x, f.balcony ? 117 : 123, w, G - (f.balcony ? 117 : 123), 0.12);
  }
  // l'ombre du bâtiment dans la ruelle à droite
  shadow(g, x + w + 1, top + 8, 7, G - top - 8, 0.22);
}

// porte du commerce, selon son genre
function drawShopDoor(g, b, f, K) {
  const d = f.door, trim = K.trim, k = b.kind;
  if (k === 'smithy') {
    drawDoor(g, d, trim, '#3a2a20', false, { open: (gg, x, y, w, h) => forge(gg, x, y, w, h) });
  } else if (k === 'stable') {
    drawDoor(g, d, trim, '#5a3a22', false, { open: (gg, x, y, w, h) => barn(gg, x, y, w, h) });
    for (const [lx, s] of [[d.x - 29, 1], [d.x + d.w + 4, -1]]) { // les battants ouverts contre le mur, croisillons blancs
      R(g, lx - 1, d.y - 1, 27, d.h + 1, OUT); battens(g, lx, d.y, 25, d.h, sh(b.col, -0.08), lx, 6);
      for (const yy of [d.y, d.y + d.h - 4, d.y + (d.h >> 1) - 2]) R(g, lx, yy, 25, 4, trim);
      R(g, lx, d.y, 4, d.h, trim); R(g, lx + 21, d.y, 4, d.h, trim);
      for (let i = 0; i < (d.h >> 1) - 6; i++) for (const yy of [d.y + 4, d.y + (d.h >> 1) + 2]) { const t = i / ((d.h >> 1) - 7); R(g, lx + 4 + Math.round(t * 15), yy + i, 2, 1, trim); R(g, lx + 19 - Math.round(t * 15), yy + i, 2, 1, sh(trim, -0.15)); }
      shadow(g, s > 0 ? lx + 25 : lx - 2, d.y, 2, d.h, 0.3);
    }
  } else if (k === 'saloon') {
    drawDoor(g, d, trim, '#4a2418', false, { open: (gg, x, y, w, h) => saloonIn(gg, x, y, w, h) });
  } else if (k === 'church') {
    drawDoor(g, d, trim, K.door, true, { double: true });
  } else if (k === 'sheriff' || k === 'jail') {
    drawDoor(g, d, trim, K.door, false, { planks: true, transom: k === 'sheriff' });
  } else {
    const dbl = k === 'bank' || k === 'hotel' || k === 'theater';
    drawDoor(g, d, trim, K.door || sh(b.col, -0.4), false, { double: dbl, glass: k !== 'undertaker' && k !== 'theater', blind: K.blind || '#d8c8a0' });
  }
}
// l'atelier du forgeron, au fond de la grande porte : le foyer, le soufflet, les outils pendus
function forge(g, x, y, w, h) {
  R(g, x, y, w, h, '#1c120c');
  for (let k = 0; k < 6; k++) R(g, x, y + h - 6 + k, w, 1, sh('#3a2a20', -0.05 * k));
  R(g, x + 2, y + 2, w - 4, 1, '#2a1c14');
  for (let px = x + 6; px < x + w - 24; px += 7) { R(g, px, y + 10, 1, 8, '#4a4a52'); R(g, px - 1, y + 18, 3, 3, '#4a4a52'); } // outils pendus
  const fx = x + w - 22;
  R(g, fx - 1, y + 26, 20, h - 26, OUT); stone(g, fx, y + 27, 18, h - 27, '#5a4e46', x, 5);
  R(g, fx + 3, y + 33, 12, 7, '#2a1408'); R(g, fx + 4, y + 35, 10, 5, '#f87818'); R(g, fx + 6, y + 36, 6, 3, '#fff070'); R(g, fx + 8, y + 34, 2, 2, '#f8d070');
  R(g, fx + 4, y + 8, 10, 18, '#2a1e18'); R(g, fx + 6, y + 2, 6, 6, '#2a1e18'); // la hotte
  R(g, x + 6, y + h - 16, 14, 3, '#3a3a42'); R(g, x + 6, y + h - 16, 14, 1, '#7a7a82'); R(g, x + 10, y + h - 13, 6, 13, '#2a2a30'); // l'enclume
}
// l'intérieur de l'écurie : stalles, foin, lanterne
function barn(g, x, y, w, h) {
  R(g, x, y, w, h, '#1e140c');
  for (let px = x + 4; px < x + w; px += 14) { R(g, px, y + 22, 2, h - 22, '#3a2616'); R(g, px - 6, y + 30, 14, 2, '#3a2616'); }
  for (let k = 0; k < w; k += 2) R(g, x + k, y + h - 6 - ((k * 7) % 5), 2, 6 + ((k * 7) % 5), (k >> 1) % 3 ? '#b89038' : '#d8b048');
  R(g, x + w - 16, y + h - 20, 14, 12, OUT); R(g, x + w - 15, y + h - 19, 12, 10, '#c8a040'); R(g, x + w - 15, y + h - 19, 12, 1, '#e0c060'); R(g, x + w - 15, y + h - 14, 12, 1, '#8a6a20');
  R(g, x + 10, y + 6, 1, 6, '#3a3436'); R(g, x + 8, y + 12, 5, 6, '#3a3436'); R(g, x + 9, y + 13, 3, 3, '#a87a30');
}
// le saloon, derrière les portes battantes : la salle, le comptoir, les bouteilles
function saloonIn(g, x, y, w, h) {
  R(g, x, y, w, h, '#24140c');
  R(g, x + 2, y + 8, w - 4, 10, '#3a2216'); R(g, x + 2, y + 8, w - 4, 1, '#5a3420');
  for (let k = 0; k < (w - 6) / 4; k++) R(g, x + 4 + k * 4, y + 10 + (k % 2), 2, 6 - (k % 2), ['#4a7a3a', '#a8582a', '#c8a050', '#5a3a6a', '#3a6a2a'][k % 5]);
  R(g, x + 2, y + 22, w - 4, 1, '#5a3420');
  R(g, x, y + 42, w, h - 42, '#1a0e08'); R(g, x, y + 42, w, 1, '#4a2a18');
  R(g, x + 3, y + 30, 6, 6, '#f8d070'); R(g, x + 4, y + 31, 4, 4, '#fff4c0'); // la lampe du comptoir
}
// la porte du fenil : ouverte sur le foin, le palan au-dessus
function hayLoft(g, wn, trim, col) {
  casing(g, wn.x, wn.y, wn.w, wn.h, trim);
  R(g, wn.x, wn.y, wn.w, wn.h, '#1e140c');
  for (let k = 0; k < wn.w; k += 2) R(g, wn.x + k, wn.y + wn.h - 9 - ((k * 5) % 4), 2, 9 + ((k * 5) % 4), (k >> 1) % 3 ? '#c8a040' : '#e0c060');
  for (let k = 0; k < 6; k++) R(g, wn.x + 3 + k * 5, wn.y + wn.h - 12 - (k % 2) * 2, 1, 3, '#e8d080');
  sill(g, wn.x, wn.y + wn.h + 3, wn.w, trim);
  const cx = Math.round(wn.x + wn.w / 2);
  R(g, cx - 2, wn.y - 12, 4, 8, OUT); R(g, cx - 1, wn.y - 11, 2, 6, '#3a3a42'); // la poulie
  R(g, cx, wn.y - 4, 1, 14, '#c8b088'); R(g, cx - 2, wn.y + 10, 5, 3, '#4a4a52'); // la corde et le crochet
}

// le clocher : tour à bardage, abat-son (le bandit y surgit), cloche, flèche (la girouette est posée dessus)
function steeple(g, b, f, trim) {
  const rr = belfry(b), cx = Math.round(f.x + f.w / 2), ty = rr.y - 6;
  R(g, cx - 16, ty - 1, 32, f.top - ty + 1, OUT);
  siding(g, cx - 15, ty, 30, f.top - ty, WOOD, b.x + 3, { lap: 5, paint: b.col, peel: 0.1 });
  for (const px of [cx - 15, cx + 12]) { R(g, px, ty, 3, f.top - ty, trim); R(g, px, ty, 1, f.top - ty, sh(trim, 0.25)); }
  // la flèche
  for (let dy = 0; dy < 12; dy++) {
    const hw = Math.round(18 * (1 - dy / 12)), c = '#5a4a5a';
    R(g, cx - hw - 1, ty - dy - 1, hw * 2 + 2, 1, OUT);
    R(g, cx - hw, ty - dy, hw * 2, 1, dy % 3 === 0 ? sh(c, -0.25) : sh(c, (dy >> 1) % 2 ? 0.08 : 0));
    R(g, cx - hw, ty - dy, 2, 1, sh(c, 0.3));
  }
  R(g, cx - 18, ty - 1, 36, 3, OUT); R(g, cx - 17, ty, 34, 1, trim);
  // l'abat-son en arc, la cloche
  casing(g, rr.x, rr.y, rr.w, rr.h, trim);
  for (let k = 0; k < 4; k++) R(g, rr.x - 2 + k, rr.y - 5 + k, rr.w + 4 - k * 2, 1, k ? trim : OUT);
  R(g, rr.x, rr.y, rr.w, rr.h, '#1e1410');
  R(g, cx - 1, rr.y, 2, 3, '#3a3436');
  for (let k = 0; k < 9; k++) { const hw = 2 + Math.round(k * 0.55); R(g, cx - hw - 1, rr.y + 3 + k, hw * 2 + 2, 1, OUT); R(g, cx - hw, rr.y + 3 + k, hw * 2, 1, k < 2 ? '#e8c060' : k === 8 ? '#8a6420' : '#c8a040'); }
  R(g, cx - 4, rr.y + 5, 1, 5, '#f8e090');
  // l'oculus sous l'abat-son
  S.disc(g, cx, f.top - 8, 4, OUT); S.disc(g, cx, f.top - 8, 3, trim); R(g, cx - 1, f.top - 9, 2, 2, '#3a5ea8');
}

// détails propres à chaque commerce
function kindDetails(g, b, f, K, r) {
  const { x, w, top } = f, d = f.door, trim = K.trim;
  const spans = freeSpans(b, f);
  const wide = spans.filter(([a, c]) => c - a >= 18);
  switch (b.kind) {
    case 'bank': {
      R(g, d.x + d.w + 6, 124, 10, 7, OUT); R(g, d.x + d.w + 7, 125, 8, 5, '#c8a040'); R(g, d.x + d.w + 8, 127, 6, 1, '#7a5a20'); // la plaque de cuivre
      break;
    }
    case 'sheriff': {
      star(g, Math.round(x + w / 2), top + 30, 1);
      for (const [a, c] of wide.slice(0, 2)) { poster(g, Math.round((a + c) / 2) - 6, 120, 12, 15); if (c - a > 30) poster(g, Math.round((a + c) / 2) + 3, 138, 9, 11); }
      break;
    }
    case 'jail': {
      for (const [a, c] of wide.slice(0, 1)) poster(g, Math.round((a + c) / 2) - 6, 122, 12, 15);
      break;
    }
    case 'barber': {
      const px = Math.round(x + w * 0.47);
      R(g, px - 1, 112, 7, 3, OUT); R(g, px, 113, 5, 1, '#e0b040');
      barberPole(g, px, 116, 34);
      R(g, px - 1, 150, 7, 3, OUT); R(g, px, 151, 5, 1, '#e0b040');
      if (f.up === 0 && f.top < 84) ghostText(g, textW(K.ghost) <= w - 20 ? K.ghost : K.ghost.split(' · ')[0], x + w / 2, top + 22, sh(b.col, -0.6), 0.5);
      break;
    }
    case 'undertaker':
      for (const cx of [x + w * 0.86, x + w * 0.95]) if (cx - 8 > d.x + d.w + 6) coffin(g, Math.round(cx), G);
      R(g, d.x + d.w / 2 - 4, d.y + 12, 8, 8, OUT); R(g, d.x + d.w / 2 - 3, d.y + 13, 6, 6, '#1a1416'); R(g, d.x + d.w / 2 - 1, d.y + 19, 2, 6, '#1a1416'); // le crêpe
      break;
    case 'post':
      for (const [a, c] of wide.slice(0, 1)) {
        const mx = Math.round((a + c) / 2);
        bx(g, mx - 4, 126, 8, 10, '#2a3a5a'); R(g, mx - 4, 129, 8, 1, '#e0b040'); R(g, mx - 4, 126, 8, 1, '#4a5a7a'); // la boîte aux lettres
        poster(g, mx - 5, 140, 10, 12, '#e8e0c8', false);
      }
      break;
    case 'gunsmith': { // l'enseigne en forme de revolver, à une potence
      const gx = x + w - 2;
      R(g, gx - 1, 111, 18, 3, OUT); R(g, gx, 112, 16, 1, '#3a3436'); R(g, gx + 14, 113, 1, 4, '#3a3436');
      bx(g, gx + 2, 118, 22, 5, '#6a6f78'); R(g, gx + 2, 118, 22, 1, '#b0b8c0'); R(g, gx + 2, 122, 22, 1, '#4a4f58');
      bx(g, gx + 4, 123, 6, 9, '#7a4a24'); R(g, gx + 4, 123, 1, 9, '#9a6a3c'); bx(g, gx + 10, 116, 5, 3, '#6a6f78'); bx(g, gx + 11, 123, 3, 3, '#4a4f58');
      for (const [a, c] of wide.slice(0, 1)) { const mx = Math.round((a + c) / 2) - 7; barrel(g, mx, G, '#5a3a24', 18); R(g, mx + 3, G - 12, 7, 4, '#c0392b'); }
      break;
    }
    case 'doctor':
      if (d.x + d.w + 20 < x + w) { bx(g, d.x + d.w + 6, 120, 13, 13, '#f4ecd8'); R(g, d.x + d.w + 11, 122, 3, 9, '#c0392b'); R(g, d.x + d.w + 8, 125, 9, 3, '#c0392b'); }
      break;
    case 'theater': {
      // ampoules autour de la façade, affiches de part et d'autre de la porte
      for (let px = x + 6; px < x + w - 4; px += 7) { R(g, px - 1, top + ch0(f) + 1, 4, 4, OUT); R(g, px, top + ch0(f) + 2, 2, 2, '#f8e08a'); R(g, px, top + ch0(f) + 2, 1, 1, '#fffbe0'); }
      for (let py = top + 18; py < G - 6; py += 8) for (const px of [x + 1, x + w - 4]) { R(g, px - 1, py - 1, 4, 4, OUT); R(g, px, py, 2, 2, '#f8e08a'); }
      for (const px of [d.x - 20, d.x + d.w + 6]) {
        bx(g, px, 118, 14, 22, '#e8d4a0'); R(g, px + 2, 120, 10, 8, '#8a3a5a'); R(g, px + 4, 122, 6, 4, '#e0b040');
        R(g, px + 2, 131, 10, 1, '#5a3a20'); R(g, px + 2, 134, 8, 1, '#5a3a20'); R(g, px + 2, 137, 10, 1, '#5a3a20');
      }
      break;
    }
    case 'laundry':
      for (const [a, c] of wide.slice(0, 1)) { // la lessiveuse et la planche à laver
        const mx = Math.round((a + c) / 2) - 8;
        bx(g, mx, G - 10, 16, 10, '#8a8f98'); R(g, mx, G - 10, 16, 1, '#c8ccd4'); R(g, mx + 2, G - 11, 12, 1, '#a8c8d8');
        bx(g, mx + 12, G - 26, 7, 16, '#a87a48'); for (let k = 0; k < 6; k++) R(g, mx + 13, G - 22 + k * 2, 5, 1, '#c8ccd4');
      }
      break;
    case 'smithy': {
      bx(g, d.x - 26, 150, 18, 5, '#4a4f58'); R(g, d.x - 26, 150, 18, 1, '#9aa0a8'); bx(g, d.x - 21, 155, 8, 4, '#3a3e44'); bx(g, d.x - 24, 159, 14, 7, '#5a3a22'); // l'enclume sur son billot
      for (let k = 0; k < 3; k++) { const hx = d.x + d.w + 10 + k * 8; R(g, hx, 124, 5, 1, '#5a5a62'); R(g, hx, 124, 1, 5, '#5a5a62'); R(g, hx + 4, 124, 1, 5, '#5a5a62'); } // fers à cheval
      wheel(g, x + w - 18, G - 14, 12);
      break;
    }
    case 'stable':
      R(g, d.x + d.w / 2 - 6, f.top + 2, 12, 2, '#5a5a62'); // fer à cheval au-dessus du fenil
      break;
    case 'hotel':
    case 'store':
      for (const [a, c] of wide.slice(0, 2)) {
        const mx = Math.round((a + c) / 2);
        if (b.kind === 'hotel') { if (c - a >= 30) bench(g, mx - 12, G, 24); else poster(g, mx - 5, 122, 10, 13, '#e0cc98', false); }
        else { barrel(g, mx - 9, G, '#7a4a24', 18); if (c - a >= 34) { sack(g, mx + 5, G); crate(g, mx - 6, G - 18, 12); } }
      }
      break;
    case 'saloon': {
      // les grandes lettres peintes du fronton, les potences des lanternes (les lanternes sont des éléments du décor vivant)
      ghostText(g, 'BUCKSHOT', x + w / 2, top + 13, '#f4d890', 0.85, 16);
      for (const lx of [d.x - 10, d.x + d.w + 6]) { R(g, lx + 2, 109, 3, 2, OUT); R(g, lx + 3, 109, 1, 4, '#3a3436'); }
      for (const [a, c] of wide.slice(0, 2)) if (c - a >= 26) barrel(g, Math.round((a + c) / 2) - 7, G, '#7a4a24', 20);
      break;
    }
  }
}
const ch0 = (f) => (f.up > 0 ? Math.max(4, Math.min(11, Math.min(...f.windows.filter((wn) => wn.up).map((wn) => wn.y)) - 11 - f.top)) : 4) + 1;

// roue de charrette à rayons (cx, cy, rayon)
function wheel(g, cx, cy, r, wood = '#a87a48') {
  const ring = (rr, col) => { for (let a = 0; a < 72; a++) { const an = (a / 72) * Math.PI * 2; R(g, Math.round(cx + Math.cos(an) * rr), Math.round(cy + Math.sin(an) * rr), 1, 1, col); } };
  for (let a = 0; a < 12; a++) { const an = (a / 12) * Math.PI * 2; for (let k = 2; k < r - 1; k++) R(g, Math.round(cx + Math.cos(an) * k) - 1, Math.round(cy + Math.sin(an) * k) - 1, 3, 3, OUT); }
  for (let a = 0; a < 12; a++) { const an = (a / 12) * Math.PI * 2; for (let k = 2; k < r - 1; k++) R(g, Math.round(cx + Math.cos(an) * k), Math.round(cy + Math.sin(an) * k), 1, 1, a < 6 ? wood : sh(wood, 0.15)); }
  ring(r + 1, OUT); ring(r - 2, OUT); ring(r, '#4a4a52'); ring(r - 1, sh(wood, -0.2));
  for (let a = 40; a < 60; a++) { const an = (a / 72) * Math.PI * 2; R(g, Math.round(cx + Math.cos(an) * r), Math.round(cy + Math.sin(an) * r), 1, 1, '#8a8f98'); }
  S.disc(g, cx, cy, 3, OUT); S.disc(g, cx, cy, 2, '#3a3a42'); R(g, cx - 1, cy - 1, 1, 1, '#9aa0a8');
}

// ------------------------------------------------------------ premier plan des façades (devant les bandits)
function frontOf(g, b) {
  const f = facade(b), { x, w } = f, K = STYLE[b.kind] || STYLE.store;
  const rects = [...f.windows.filter((wn) => !wn.up), f.door];
  const clear = (px) => rects.every((rc) => px + 5 < rc.x - 2 || px - 1 > rc.x + rc.w + 2);
  const posts = [x - 3, x + w - 1];
  if (w >= 180) for (const k of [0.35, 0.65]) { const px = Math.round(x + w * k); if (clear(px)) posts.push(px); }
  if (f.balcony) {
    const col = K.trim, x0 = x - 3, x1 = x + w + 3;
    R(g, x0 - 1, 83, x1 - x0 + 2, 4, OUT); R(g, x0, 84, x1 - x0, 2, col); R(g, x0, 84, x1 - x0, 1, sh(col, 0.3));
    R(g, x0 - 1, 94, x1 - x0 + 2, 3, OUT); R(g, x0, 95, x1 - x0, 1, sh(col, -0.15));
    for (let px = x0 + 3; px < x1 - 3; px += 5) { R(g, px, 87, 3, 7, OUT); R(g, px + 1, 87, 1, 7, col); R(g, px + 1, 89, 1, 2, sh(col, 0.2)); }
    for (const px of posts) {
      R(g, px - 1, 79, 6, G + 6 - 79, OUT); R(g, px, 80, 4, G + 5 - 80, col); R(g, px, 80, 1, G + 5 - 80, sh(col, 0.25)); R(g, px + 3, 80, 1, G + 5 - 80, sh(col, -0.3));
      R(g, px - 1, 77, 6, 3, OUT); R(g, px, 78, 4, 1, sh(col, 0.2)); // le chapiteau
      for (const s of [-1, 1]) for (let k = 0; k < 6; k++) R(g, px + 1 + s * (3 + k), 110 + k, 2, 1, k === 5 ? OUT : sh(col, -0.1)); // jambes de force
    }
  } else if (f.awning) {
    const canvas = b.kind === 'store' || b.kind === 'barber' || b.kind === 'laundry';
    const x0 = x - 5, x1 = x + w + 5;
    if (canvas) { // toile rayée à festons
      const c1 = S.mix(b.col, '#f4ecd8', 0.72), c2 = sh(b.col, -0.2);
      R(g, x0 - 1, 108, x1 - x0 + 2, 6, OUT);
      for (let px = x0; px < x1; px += 6) {
        const c = ((px - x0) / 6) & 1 ? c2 : c1, pw = Math.min(6, x1 - px);
        R(g, px, 109, pw, 4, c); R(g, px, 109, pw, 1, sh(c, 0.2));
        R(g, px, 113, pw, 1, OUT); R(g, px + 1, 113, Math.max(0, pw - 2), 2, c); R(g, px + 1, 115, Math.max(0, pw - 2), 1, OUT);
      }
    } else { // toit d'auvent en planches, bouts de chevrons
      const col = sh(b.col, -0.45);
      R(g, x0 - 1, 108, x1 - x0 + 2, 9, OUT);
      R(g, x0, 109, x1 - x0, 7, col); R(g, x0, 109, x1 - x0, 1, sh(col, 0.35)); R(g, x0, 115, x1 - x0, 1, sh(col, -0.35));
      for (let px = x0 + 3; px < x1 - 2; px += 10) R(g, px, 111, 2, 3, sh(col, -0.3));
    }
    const pc = K.trim;
    for (const px of posts) {
      R(g, px - 1, 116, 6, G + 6 - 116, OUT); R(g, px, 116, 4, G + 5 - 116, pc); R(g, px, 116, 1, G + 5 - 116, sh(pc, 0.25)); R(g, px + 3, 116, 1, G + 5 - 116, sh(pc, -0.3));
      for (const s of [-1, 1]) for (let k = 0; k < 6; k++) R(g, px + 1 + s * (3 + k), 116 + k, 2, 1, k === 5 ? OUT : sh(pc, -0.1));
    }
  }
  if (b.bars) for (const wn of f.windows) { // barreaux de fer, traverse plate
    for (let px = wn.x + 3; px < wn.x + wn.w - 1; px += 5) { R(g, px - 1, wn.y, 3, wn.h, OUT); R(g, px, wn.y, 1, wn.h, '#7a808a'); }
    for (const py of [wn.y + 3, wn.y + wn.h - 5]) { R(g, wn.x, py - 1, wn.w, 4, OUT); R(g, wn.x, py, wn.w, 2, '#5a5f68'); R(g, wn.x, py, wn.w, 1, '#9aa0a8'); }
  }
  if (b.kind === 'laundry') { // le linge tendu devant les fenêtres de l'étage (les bandits passent derrière)
    const y = f.top + 7;
    for (let px = x + 4; px < x + w - 4; px++) R(g, px, y + Math.round(Math.sin(((px - x - 4) / (w - 8)) * Math.PI) * 3), 1, 1, '#4a3a30');
    const cols = ['#f4ecd8', '#c0392b', '#3a6ec0', '#e0b040', '#f4ecd8'];
    for (let k = 0, px = x + 10; px < x + w - 16; px += 18, k++) {
      const c = cols[k % cols.length], py = y + 1 + Math.round(Math.sin(((px + 5 - x - 4) / (w - 8)) * Math.PI) * 3);
      bx(g, px, py, 10, 9 + (k % 2) * 3, c); R(g, px - 2, py, 3, 4, c); R(g, px + 9, py, 3, 4, c);
      R(g, px, py, 10, 1, sh(c, 0.2)); R(g, px + 1, py + 3, 1, 5 + (k % 2) * 3, sh(c, -0.18));
      R(g, px + 1, py - 1, 1, 2, '#8a6a48'); R(g, px + 8, py - 1, 1, 2, '#8a6a48'); // les pinces
    }
  }
  if (b.kind === 'saloon') { // les portes battantes, au haut chantourné
    const d = f.door, hw = (d.w >> 1) - 2;
    for (const [lx, s] of [[d.x + 1, 1], [d.x + d.w - 1 - hw, -1]]) {
      R(g, lx - 1, d.y + 16, hw + 2, 26, OUT);
      R(g, lx, d.y + 17, hw, 24, '#a8703c'); R(g, lx, d.y + 17, hw, 1, '#d09a58');
      for (let k = 2; k < hw - 1; k += 3) R(g, lx + k, d.y + 21, 2, 16, '#7a4a24');
      R(g, s > 0 ? lx : lx + hw - 1, d.y + 17, 1, 24, '#5a3418');
      for (let k = 0; k < hw; k++) R(g, lx + k, d.y + 15 - Math.round(Math.sin((k / (hw - 1)) * Math.PI) * 3), 1, 2, OUT);
      for (let k = 0; k < hw; k++) R(g, lx + k, d.y + 16 - Math.round(Math.sin((k / (hw - 1)) * Math.PI) * 3), 1, 1, '#c88a48');
      R(g, s > 0 ? lx - 2 : lx + hw, d.y + 20, 2, 3, '#3a3436'); R(g, s > 0 ? lx - 2 : lx + hw, d.y + 34, 2, 3, '#3a3436');
    }
  }
}

// ------------------------------------------------------------ la mine abandonnée au bout de la rue
// La colline (crête à y 40 au milieu, où se poste un bandit), la galerie boisée (facade(b).door), la cabane du gardien
// (sa fenêtre : facade(b).windows[0]), l'enseigne sur ses poteaux (signRect), les rails qui sortent de la galerie.
const TERRE = ramp('3a2a22 4e3828 64462e 7a5636 90663e a47848 b68a56 c69c66 d4ae78');
const DEBLAI = ramp('5a5048 746a5c 8e8470 a89e86 c0b69c d4ccb4');
function mineEnd(g, b) {
  const f = facade(b), d = f.door, cx = b.x + b.w / 2;
  const x0 = b.x - 16, W2 = STREET_W - x0;
  const crest = (x) => {
    if (x < 2294) return 40 + Math.pow(Math.max(0, 2294 - x) / 44, 1.5) * 128 + (fbm(x / 9, 3, 61) - 0.5) * 6;
    if (x >= cx - 34 && x <= cx + 34) return 40;
    if (x < cx) return 40 + (fbm(x / 12, 1, 62) - 0.5) * 6 * Math.min(1, (cx - 34 - x) / 12);
    return 40 + (x - cx - 34) * 0.12 + (fbm(x / 14, 2, 63) - 0.5) * 7 * Math.min(1, (x - cx - 34) / 12);
  };
  const c = S.makeCanvas(W2, H), t = c.getContext('2d');
  const Pp = new Pix(t);
  range(Pp, { x0: 0, x1: W2, base: 176, top: (i) => Math.min(176, crest(i + x0)), R: TERRE, l0: 5.2, k: 7, seed: 61 });
  // le front de taille autour de la galerie : la roche à nu, en bancs
  const pc = d.x + d.w / 2;
  rockWall(Pp, { x0: Math.round(pc - 62 - x0), x1: Math.round(pc + 62 - x0), top: (i) => Math.max(crest(i + x0) + 6, 58 + ((i + x0 - pc) / 62) ** 2 * 96 + (vnoise((i + x0) / 5, 0, 66) - 0.5) * 6), bot: () => 176, R: P.granit, lit: 4.6, band: 8, seed: 67, warp: 3 });
  // le terril de déblais, clair, à droite de la galerie
  for (let i = 0; i < W2; i++) {
    const X = i + x0, tt = Math.abs(X - 2556) / 64;
    if (tt >= 1) continue;
    const top = Math.round(120 + 52 * tt ** 1.3 + (vnoise(X / 3, 1, 49) - 0.5) * 3);
    for (let y = top; y < 176; y++) Pp.set(i, y, pick(DEBLAI, (X < 2556 ? 3.4 : 2) + (vnoise(X / 1.5, y / 6, 50) - 0.5) * 2.4 + (y === top ? 1.2 : 0), i, y));
  }
  // affleurements, cailloux, touffes et buissons d'armoise, un arbre mort sur la crête
  for (const [X, s] of [[2300, 5], [2342, 3], [2470, 4], [2518, 3], [2560, 4]]) boulder(s, X, P.granit).blit(Pp, X - x0, Math.round(crest(X)) + 10 + s * 3);
  pebbles(Pp, { x0: 0, x1: W2, y0: 46, y1: 172, n: 260, R: TERRE, seed: 64, grass: 0.3 });
  sow(Pp, { x0: 0, x1: W2, y0: 50, y1: 150, n: 40, seed: 65, make: (dd, s, i, y) => (y > crest(i + x0) + 4 ? (s % 3 ? bush(2 + Math.round(dd * 2), s, P.sauge, hex('#2a1c14')) : null) : null) });
  deadTree(30, 7).blit(Pp, 2540 - x0, Math.round(crest(2540)) + 2);
  const cy = (i) => Math.round(Math.min(176, crest(i + x0)));
  for (let i = 0; i < W2; i++) { const y = cy(i); for (let yy = Math.min(y, cy(i - 1), cy(i + 1)) - 1; yy < y; yy++) Pp.set(i, yy, hex(OUT)); } // le contour de la crête
  Pp.put();
  g.drawImage(c, x0, 0);
  S.freeCanvas(c);
  // l'enseigne, sur deux poteaux plantés dans la pente
  const sr = signRect(b, f);
  for (const px of [sr.x + 10, sr.x + sr.w - 14]) { R(g, px - 1, sr.y + 4, 6, 22, OUT); R(g, px, sr.y + 5, 4, 20, '#6a4428'); R(g, px, sr.y + 5, 1, 20, '#8a6038'); }
  plate(g, sr, '#5a3a22');
  // la galerie : le noir, les cadres qui s'enfoncent, les rails qui convergent
  const gx0 = d.x, gx1 = d.x + d.w, gy0 = d.y - 9;
  for (let y = gy0; y < G; y++) for (let x = gx0; x < gx1; x += 2) {
    const k = Math.max(0, 1 - Math.hypot(x - (gx0 + gx1) / 2, (y - G + 6) * 1.3) / 40);
    R(g, x, y, 2, 1, S.mix('#0c0806', '#3a2616', k * 0.8));
  }
  for (const [ins, col] of [[6, '#3a2616'], [12, '#24170e'], [17, '#170e08']]) {
    const a = gx0 + ins, e = gx1 - ins, y0 = gy0 + Math.round(ins * 1.4), y1 = G - Math.round(ins * 0.5);
    R(g, a, y0, e - a, 3, col); R(g, a, y0, 3, y1 - y0, col); R(g, e - 3, y0, 3, y1 - y0, col);
  }
  for (let y = G - 18; y < G; y++) { const tt = (G - y) / 18; R(g, Math.round(gx0 + 12 + tt * 8), y, 1, 1, '#4a4e56'); R(g, Math.round(gx1 - 13 - tt * 8), y, 1, 1, '#4a4e56'); }
  // le boisage : montants, chapeau, planches de garnissage qui retiennent la terre
  for (const px of [gx0 - 10, gx1]) {
    R(g, px, gy0 - 1, 10, G - gy0 + 1, OUT); R(g, px + 1, gy0, 8, G - gy0, '#8a5a30');
    R(g, px + 1, gy0, 2, G - gy0, '#a87244'); R(g, px + 7, gy0, 2, G - gy0, '#5a3a1e');
    for (let y = gy0 + 6; y < G; y += 11) R(g, px + 3, y, 3, 1, '#6a4224');
  }
  R(g, gx0 - 17, gy0 - 11, d.w + 34, 11, OUT); R(g, gx0 - 16, gy0 - 10, d.w + 32, 9, '#7a4a26');
  R(g, gx0 - 16, gy0 - 10, d.w + 32, 1, '#a87244'); R(g, gx0 - 16, gy0 - 2, d.w + 32, 1, '#4a2c16');
  for (const px of [gx0 - 15, gx1 + 12]) { R(g, px, gy0 - 9, 3, 7, '#9a6a3c'); R(g, px + 1, gy0 - 7, 1, 3, '#5a3a1e'); } // le bois de bout
  for (let px = gx0 - 14; px < gx1 + 14; px += 7) { R(g, px - 1, gy0 - 25, 8, 15, OUT); R(g, px, gy0 - 24, 6, 13, '#6a4224'); R(g, px, gy0 - 24, 6, 1, '#8a5a30'); R(g, px + 5, gy0 - 24, 1, 13, '#3a2412'); }
  smallSign(g, (gx0 + gx1) / 2, gy0 - 22, 'DANGER', { bg: '#eadcb0', fg: '#7a1a14' });
  // la pioche et la pelle contre le montant de gauche
  R(g, gx0 - 22, G - 34, 2, 34, '#7a5232'); R(g, gx0 - 27, G - 36, 12, 3, OUT); R(g, gx0 - 26, G - 35, 10, 1, '#8a8f98');
  R(g, gx0 - 16, G - 30, 2, 24, '#8a6038'); bx(g, gx0 - 18, G - 8, 6, 7, '#6a6f78');
  // le sol de la mine (gravier)
  R(g, x0, G, W2, 6, '#7a6a5a'); for (let i = 0; i < W2; i += 3) R(g, x0 + i, G + (i % 5), 2, 1, i % 2 ? '#9a8a78' : '#5a4a3e');
  // les rails sortent de la galerie et descendent vers la rue (vus de face, ils s'écartent)
  const rx = (y, s) => Math.round((gx0 + gx1) / 2 + s * (8 + (y - G) * 0.42));
  for (let y = G; y < H; y += 5) { const a = rx(y, -1) - 4 - Math.round((y - G) * 0.08), e = rx(y, 1) + 4 + Math.round((y - G) * 0.08); R(g, a - 1, y - 1, e - a + 2, 4, OUT); R(g, a, y, e - a, 2, '#5a3a20'); R(g, a, y, e - a, 1, '#7a5432'); }
  for (let y = G; y < H; y++) for (const s of [-1, 1]) { const px = rx(y, s); R(g, px - 1, y, 3 + Math.floor((y - G) / 30), 1, OUT); R(g, px, y, 1 + Math.floor((y - G) / 30), 1, '#a8acb4'); }
  // le wagonnet rouillé, renversé à côté de la galerie
  const wx = gx1 + 16;
  R(g, wx - 1, G - 21, 32, 15, OUT); R(g, wx, G - 20, 30, 13, '#7a4a30'); R(g, wx, G - 20, 30, 1, '#a86a40'); R(g, wx, G - 9, 30, 1, '#5a3020');
  for (let k = 0; k < 8; k++) R(g, wx + 3 + ((k * 11) % 24), G - 18 + ((k * 7) % 8), 2, 1, '#9a5a30');
  for (const px of [wx + 6, wx + 24]) { S.disc(g, px, G - 4, 4, OUT); S.disc(g, px, G - 4, 3, '#3a3e46'); R(g, px, G - 4, 1, 1, '#9aa0a8'); }
  for (let k = 0; k < 7; k++) R(g, wx - 6 + k * 3, G - 2 - (k % 2), 3, 2, k % 2 ? '#6a6058' : '#8a8070'); // le minerai renversé
  // la cabane du gardien : rondins, pignon de planches, cheminée de tôle, sa fenêtre et sa porte
  const kx = b.x + 2, kw = 92, kt = 100;
  gableEnd(g, kx, kw, kt, 20, (tt, a, e, ww, hh) => battens(tt, a, e, ww, hh, '#7a5a3a', 71, 6), '#4a3a30', '#8a6a48');
  R(g, kx - 1, kt - 1, kw + 2, G - kt + 1, OUT);
  for (let y = kt; y < G; y += 5) {
    R(g, kx, y, kw, 5, '#7a5432'); R(g, kx, y, kw, 1, '#9a6e44'); R(g, kx, y + 3, kw, 1, '#5a3a22'); R(g, kx, y + 4, kw, 1, OUT);
    for (let i = 0; i < 4; i++) R(g, kx + ((y * 7 + i * 29) % (kw - 8)), y + 1 + (i % 2), 4, 1, '#6a4a2c');
    S.disc(g, kx, y + 2, 2, OUT); R(g, kx - 1, y + 1, 2, 2, '#a87c50'); S.disc(g, kx + kw, y + 2, 2, OUT); R(g, kx + kw - 1, y + 1, 2, 2, '#8a6038');
  }
  belt(g, kx, kw, kt, '#8a6a48');
  R(g, kx + kw - 22, kt - 30, 6, 24, OUT); R(g, kx + kw - 21, kt - 29, 4, 22, '#4a4a52'); R(g, kx + kw - 21, kt - 29, 1, 22, '#7a7a82'); R(g, kx + kw - 23, kt - 32, 8, 3, OUT);
  const wn = f.windows[0];
  drawWindow(g, wn, '#b89a70', null, false, { cap: false, curtain: '#9a5a3a' });
  const dd = { x: kx + 64, y: G - 44, w: 20, h: 44 };
  drawDoor(g, dd, '#9a7a50', '#5a3a22', false, { planks: true, transom: false, cap: false });
  bx(g, kx + 18, G - 6, 16, 6, '#6a4428'); R(g, kx + 18, G - 6, 16, 1, '#8a6038'); // le billot
  shadow(g, kx + kw + 3, kt, 5, G - kt, 0.25);
  // la palissade de planches entre la cabane et la galerie
  for (let px = kx + kw + 6; px < gx0 - 30; px += 6) { R(g, px - 1, G - 26, 6, 26, OUT); R(g, px, G - 25 + (px % 3), 4, 25 - (px % 3), '#7a6a58'); R(g, px, G - 25 + (px % 3), 1, 25 - (px % 3), '#9a8a74'); }
}

// ------------------------------------------------------------ abris du premier plan (sprites dessinés une fois)
const PROP_CACHE = new Map();
function propSprite(kind) {
  if (PROP_CACHE.has(kind)) return PROP_CACHE.get(kind);
  const dim = PROP_DIM[kind];
  if (!dim) return null;
  const [w, h] = dim, pad = 12;
  const c = S.makeCanvas(w + pad * 2 + 10, h + pad * 2), g = c.getContext('2d');
  const x = pad, base = pad + h, top = base - h;
  switch (kind) {
    case 'wagon': { // chariot bâché : bâche sur arceaux, caisse de planches, roues à rayons, timon
      for (let k = 0; k < 26; k++) R(g, x + 74 + k, base - 14 + Math.round(k * 0.4), 2, 2, k % 7 ? '#6a4428' : OUT);
      wheel(g, x + 22, base - 11, 10, '#7a5a38'); // les roues de l'autre côté
      const arc = (i) => Math.round(21 * Math.sin((Math.PI * i) / 70));
      for (let i = -1; i <= 71; i++) { const a = arc(Math.max(0, Math.min(70, i))); R(g, x + 8 + i, base - 28 - a - 1, 1, a + 2, OUT); }
      for (let i = 0; i < 70; i++) {
        const a = arc(i), y0 = base - 28 - a;
        const lit = i < 30 ? 0.06 : i > 54 ? -0.12 : 0;
        for (let y = y0; y < base - 28; y++) {
          const v = (y - y0) / Math.max(1, a);
          R(g, x + 8 + i, y, 1, 1, sh('#ece2c8', lit - (v > 0.75 ? 0.12 : 0) - ((i % 14) < 2 ? 0.14 : 0)));
        }
        if (i % 14 === 0) R(g, x + 8 + i, y0, 1, a, '#b8ac90'); // les arceaux
      }
      for (let i = 2; i < 69; i += 3) R(g, x + 8 + i, base - 29, 1, 1, '#a89c80'); // le liseré lacé
      for (let i = 0; i < 4; i++) { const a = arc(66 + i); R(g, x + 74 + i, base - 28 - a + 2, 1, a - 3, i % 2 ? '#3a2a1e' : '#5a4a3a'); } // l'ouverture froncée
      for (let i = 0; i < 4; i++) { const a = arc(3 + i); R(g, x + 11 + i, base - 28 - a + 3, 1, a - 4, i % 2 ? '#b8ac90' : '#d8ccb0'); }
      R(g, x + 1, base - 29, 84, 15, OUT); R(g, x + 2, base - 28, 82, 13, '#7a4a24');
      R(g, x + 2, base - 28, 82, 1, '#a8703c'); R(g, x + 2, base - 23, 82, 1, '#5a3418'); R(g, x + 2, base - 19, 82, 1, '#5a3418');
      for (let px = x + 12; px < x + 82; px += 18) R(g, px, base - 28, 2, 13, '#4a4f58');
      R(g, x + 6, base - 15, 74, 2, OUT); // l'essieu
      wheel(g, x + 16, base - 10, 10); wheel(g, x + 70, base - 10, 10);
      shadow(g, x + 4, base - 1, 84, 2, 0.32);
      break;
    }
    case 'fence': { // clôture de planches grises sur poteaux, une lisse haute où poser les bouteilles
      for (const px of [0, 30, 60, 87]) { R(g, x + px - 1, top - 1, 6, h + 1, OUT); R(g, x + px, top, 4, h, '#7a6a58'); R(g, x + px, top, 1, h, '#a89880'); R(g, x + px + 3, top, 1, h, '#5a4a3a'); }
      R(g, x - 3, top - 1, w + 4, 5, OUT); R(g, x - 2, top, w + 2, 3, '#9a8a72'); R(g, x - 2, top, w + 2, 1, '#c0b098'); R(g, x - 2, top + 2, w + 2, 1, '#6a5a48');
      R(g, x - 1, top + 9, w + 2, 5, OUT); R(g, x, top + 10, w, 3, '#8a7a64'); R(g, x, top + 10, w, 1, '#b0a088');
      for (let k = 0; k < 9; k++) R(g, x + 4 + k * 10, top + 1 + (k % 2), 4, 1, '#7a6a56'); // le grain
      R(g, x + 40, top + 14, 1, 6, OUT); for (let k = 0; k < 12; k++) R(g, x + 44 + k, top + 13 + Math.round(k * 0.5), 1, 2, k ? '#8a7a64' : OUT); // une planche tombée
      shadow(g, x + 4, base - 1, w, 2, 0.28);
      break;
    }
    case 'rock': { // rocher modelé, éclairé en haut à gauche
      const blob = [[14, 16, 13, 11], [28, 13, 14, 13], [37, 19, 8, 7]];
      for (const [cx, cy, rx, ry] of blob) for (let y = -ry - 1; y <= ry + 1; y++) for (let i = -rx - 1; i <= rx + 1; i++) if ((i * i) / ((rx + 1) * (rx + 1)) + (y * y) / ((ry + 1) * (ry + 1)) <= 1 && top + cy + y < base) R(g, x + cx + i, top + cy + y, 1, 1, OUT);
      const Rk = ramp('4a3a32 5e4a3e 74604e 8a7460 a08a72 b8a288 ccb89c');
      for (const [cx, cy, rx, ry] of blob) for (let y = -ry; y <= ry; y++) for (let i = -rx; i <= rx; i++) {
        const dd = (i * i) / (rx * rx) + (y * y) / (ry * ry);
        if (dd > 1 || top + cy + y >= base - 1) continue;
        const l = 6 * (0.62 - (i / rx) * 0.3 - (y / ry) * 0.32 - dd * 0.12) + (vnoise((x + cx + i) / 3, (cy + y) / 3, 5) - 0.5) * 1.4;
        R(g, x + cx + i, top + cy + y, 1, 1, css(pick(Rk, l, cx + i, cy + y)));
      }
      for (const [a, e, n] of [[18, 8, 7], [30, 14, 6]]) for (let k = 0; k < n; k++) R(g, x + a + (k % 3 === 1 ? 1 : 0), top + e + k, 1, 1, '#3a2c24'); // fissures
      shadow(g, x + 30, base - 2, 18, 2, 0.32);
      tuft(g, x - 2, base, '#9a8a4a'); tuft(g, x + 40, base, '#a89a5a');
      break;
    }
    case 'hay': { // botte de foin : brins, ficelles, dessus au soleil
      R(g, x - 1, top - 1, w + 2, h + 2, OUT);
      for (let i = 0; i < w; i++) for (let y = 0; y < h; y++) {
        const k = hash(i * 31 + y * 7 + 3);
        R(g, x + i, top + y, 1, 1, y < 3 ? (k < 0.5 ? '#f0d070' : '#e0c060') : i > w - 5 ? (k < 0.5 ? '#a88030' : '#b89038') : k < 0.3 ? '#c09838' : k < 0.75 ? '#d8b048' : '#e8c858');
      }
      for (let k = 0; k < 24; k++) R(g, x + Math.floor(hash(k + 90) * w), top + 3 + Math.floor(hash(k + 40) * (h - 4)), 1, 2 + Math.floor(hash(k) * 3), '#a88028');
      for (const px of [x + 9, x + w - 12]) { R(g, px, top, 2, h, '#7a5a28'); R(g, px, top, 1, h, '#9a7838'); }
      for (let k = 0; k < 6; k++) R(g, x - 1 + Math.floor(hash(k + 7) * (w + 2)), top - 2, 1, 2, '#d8b048'); // brins qui dépassent
      shadow(g, x + w, base - 2, 6, 2, 0.3);
      break;
    }
    case 'barrels': // deux tonneaux cerclés
      for (const px of [x, x + 18]) {
        R(g, px, top - 1, 16, h + 1, OUT); R(g, px - 1, top + 2, 18, h - 4, OUT);
        R(g, px, top, 16, h, '#8a5228'); R(g, px + 1, top, 14, 2, '#5a3418'); R(g, px + 2, top, 12, 1, '#a8703c');
        for (let k = 3; k < 16; k += 3) R(g, px + k, top + 2, 1, h - 2, '#74431f');
        R(g, px + 1, top + 2, 3, h - 3, '#a8703c'); R(g, px + 13, top + 2, 2, h - 3, '#5e3818');
        for (const yy of [top + 4, top + 13, top + h - 6]) { R(g, px - 1, yy, 18, 2, '#3a3a42'); R(g, px, yy, 16, 1, '#7a7a82'); }
        R(g, px + 7, top + 9, 2, 2, '#3a2010'); // la bonde
      }
      shadow(g, x + 34, base - 2, 6, 2, 0.3);
      break;
    case 'crates': // deux caisses empilées (le dessus au milieu, pour une bouteille)
      for (const [cx, cy, cw, chh, col] of [[x, top + 12, 32, 20, '#a8783c'], [x + 5, top, 22, 12, '#b88848']]) {
        R(g, cx - 1, cy - 1, cw + 2, chh + 2, OUT);
        R(g, cx, cy, cw, chh, col);
        for (const [a, e, f2, k] of [[cx, cy, cw, 2], [cx, cy + chh - 2, cw, 2]]) R(g, a, e, f2, k, sh(col, -0.25));
        R(g, cx, cy, 2, chh, sh(col, -0.25)); R(g, cx + cw - 2, cy, 2, chh, sh(col, -0.3)); R(g, cx, cy, cw, 1, sh(col, 0.25));
        for (let k = 2; k < cw - 2; k++) R(g, cx + k, cy + 2 + Math.round(((k - 2) * (chh - 5)) / (cw - 5)), 1, 1, sh(col, -0.38)); // l'écharpe
        for (let k = 5; k < chh - 2; k += 4) R(g, cx + 2, cy + k, cw - 4, 1, sh(col, -0.1));
      }
      R(g, x + 8, top + 18, 16, 8, '#c89858'); for (const [a, e] of [[10, 20], [14, 19], [18, 20]]) R(g, x + a, top + e, 3, 4, '#5a3418'); // la marque au fer
      shadow(g, x + 33, base - 2, 6, 2, 0.3);
      break;
    case 'trough': { // abreuvoir de planches, plein d'eau, sur pieds
      R(g, x - 1, top - 1, w + 2, h - 3, OUT);
      R(g, x, top, w, h - 4, '#6a4428'); R(g, x, top, w, 1, '#9a6a3c');
      for (let k = 0; k < 3; k++) R(g, x, top + 4 + k * 4, w, 1, '#4e321e');
      R(g, x + 2, top, w - 4, 2, '#4a7090'); R(g, x + 5, top, 8, 1, '#8ab0c8'); R(g, x + 22, top + 1, 5, 1, '#6a90b0');
      for (const px of [x + 3, x + w - 6]) { R(g, px - 1, base - 5, 5, 5, OUT); R(g, px, base - 4, 3, 4, '#5a3a22'); }
      R(g, x + 1, top + 1, 1, h - 6, '#8a5a34');
      shadow(g, x + 4, base - 1, w, 2, 0.3);
      break;
    }
  }
  const s = { c, ox: pad };
  PROP_CACHE.set(kind, s);
  return s;
}
export function drawProp(ctx, p) {
  const s = propSprite(p.kind);
  if (!s) return;
  ctx.drawImage(s.c, Math.round(p.x) - s.ox, PROP_BASE - PROP_DIM[p.kind][1] - s.ox);
}

// ------------------------------------------------------------ la rue entière
export function renderStreet(L) {
  const bg = S.makeCanvas(STREET_W, H);
  const front = S.makeCanvas(STREET_W, H);
  const g = bg.getContext('2d');
  const rnd = seeded(17 + (L.seed % 1000));
  const B = L.buildings, end = B[B.length - 1];
  const town0 = B[0].x - 6;
  // la rue : terre battue tramée, bord irrégulier hors de la ville, ornières, traces de sabots, cailloux, herbes
  const y0 = 174;
  bands(g, 0, y0, STREET_W, H - y0, ['#a8683e', '#b47246', '#bc7c4e', '#c48656', '#c88c5c']);
  for (let x = 0; x < STREET_W; x++) { const k = hash(x * 3 + 1); if (x < town0 || x > end.x + end.w + 6) R(g, x, y0 - 1 - Math.round(k * 2), 1, 1 + Math.round(k * 2), k < 0.5 ? '#a8683e' : '#b07040'); }
  for (let i = 0; i < STREET_W * 0.9; i++) R(g, Math.floor(rnd() * STREET_W), y0 + 4 + Math.floor(rnd() * (H - y0 - 4)), rnd() < 0.3 ? 2 : 1, 1, rnd() < 0.5 ? '#d8a070' : '#8a4a2a');
  for (const [yy, ph] of [[186, 0], [190, 3], [204, 7], [208, 11]]) for (let x = 0; x < STREET_W; x += 2) {
    const k = hash(x + ph * 97);
    if (k < 0.8) R(g, x, yy + Math.round(Math.sin(x / 90 + ph) * 1.2), 2, 1, k < 0.4 ? '#8e5030' : '#9a5a36');
    if (k > 0.93) R(g, x, yy + 1, 2, 1, '#d4a070');
  }
  for (let i = 0; i < 160; i++) { const hx = Math.floor(rnd() * STREET_W), hy = 180 + Math.floor(rnd() * 34); R(g, hx, hy, 2, 1, '#8a4a2a'); R(g, hx, hy + 1, 1, 1, '#d09868'); }
  for (let i = 0; i < 40; i++) { const px = Math.floor(rnd() * STREET_W), py = 178 + Math.floor(rnd() * 36); R(g, px, py, 3, 2, '#9a8a7a'); R(g, px, py, 2, 1, '#c8b8a8'); R(g, px + 3, py + 1, 1, 1, '#7a4a2a'); }
  for (let x = 6; x < STREET_W; x += 26 + Math.floor(rnd() * 50)) tuft(g, x, y0 + 8 + Math.floor(rnd() * 3), rnd() < 0.5 ? '#a89a5a' : '#8a8a4a');
  // les ruelles : sol à l'ombre, palissade du fond, bric-à-brac
  for (let i = 0; i < B.length - 1; i++) {
    const a = B[i].x + B[i].w, e = B[i + 1].x;
    if (e - a < 4) continue;
    R(g, a, 150, e - a, y0 - 150, '#8a5a3a');
    for (let k = 0; k < (e - a) * 2; k++) R(g, a + Math.floor(rnd() * (e - a)), 152 + Math.floor(rnd() * 20), 1, 1, rnd() < 0.5 ? '#9a6a46' : '#6a4228');
    if (L.tower == null || Math.abs((a + e) / 2 - L.tower) > 30) for (let px = a; px < e; px += 5) {
      const ph = Math.floor(hash(px) * 6);
      R(g, px, 132 + ph - 1, 5, 150 - 132 - ph + 1, OUT); R(g, px, 132 + ph, 4, 150 - 132 - ph, '#8a7a66'); R(g, px, 132 + ph, 1, 150 - 132 - ph, '#a89a84');
    }
    shadow(g, a, 128, Math.min(9, e - a), y0 - 128, 0.3);
    if (e - a >= 22 && rnd() < 0.6) { if (rnd() < 0.5) barrel(g, e - 18, 166, '#6a4428', 18); else { crate(g, e - 20, 166, 14); crate(g, e - 17, 152, 10, '#9a6a34'); } }
  }
  // le château d'eau dans la plus grande ruelle
  if (L.tower != null) waterTower(g, L.tower - 26, 44, 168);
  // les poteaux et les fils du télégraphe
  const hooks = L.poles.map((px) => telePole(g, px, 172, 142));
  for (let i = 1; i < hooks.length; i++) {
    const sag = Math.min(12, 3 + (L.poles[i] - L.poles[i - 1]) / 40);
    for (const k of [0, 3]) wire(g, hooks[i - 1][k][0], hooks[i - 1][k][1], hooks[i][k][0], hooks[i][k][1], sag + k, '#3a2a20');
  }
  // l'entrée de la ville : le panneau (le nom de la ville est écrit par-dessus, centré en x 226, y 117)
  for (const px of [196, 252]) { R(g, px - 1, 106, 6, 70, OUT); R(g, px, 107, 4, 68, '#6a4428'); R(g, px, 107, 1, 68, '#8a6038'); R(g, px + 3, 107, 1, 68, '#4a2c18'); }
  R(g, 183, 111, 86, 20, OUT); R(g, 184, 112, 84, 18, '#5a3a22'); R(g, 184, 112, 84, 1, '#8a6038');
  R(g, 186, 114, 80, 14, '#d8bc80');
  for (const yy of [118, 123]) R(g, 186, yy, 80, 1, '#c8aa70');
  R(g, 186, 114, 80, 1, '#ecd8a0'); R(g, 186, 127, 80, 1, '#b89a60');
  for (const [hx, hy] of [[189, 116], [262, 125], [258, 115]]) { R(g, hx, hy, 2, 2, '#2a1a10'); R(g, hx, hy + 2, 2, 1, '#e8d4a0'); } // impacts de balles
  for (const px of [208, 244]) R(g, px, 131, 1, 6, '#3a3436'); // la plaque pendue dessous
  bx(g, 202, 137, 48, 11, '#c8b07c'); R(g, 202, 137, 48, 1, '#e0c890');
  canvasText(g, 'POP. 312', 226, 139, { size: 8, color: '#5a3a20', shadow: '' });
  shadow(g, 200, 176, 60, 2, 0.3);
  for (const [px, s] of [[120, 3], [292, 2], [60, 2]]) { R(g, px - 1, 180 - s - 1, s * 3 + 2, s + 2, OUT); R(g, px, 180 - s, s * 3, s, '#9a8a7a'); R(g, px, 180 - s, s * 2, 1, '#c8b8a8'); }
  R(g, 140, 184, 7, 4, '#e8e0cc'); R(g, 139, 183, 2, 1, '#e8e0cc'); R(g, 146, 183, 2, 1, '#e8e0cc'); R(g, 141, 185, 1, 1, OUT); R(g, 144, 185, 1, 1, OUT); // un crâne
  // les bâtiments
  for (const b of B) {
    if (b.kind === 'mineEnd') mineEnd(g, b);
    else drawBuilding(g, b);
  }
  // le trottoir de planches (continu au passage des ruelles étroites), les marches devant les portes
  const town = B.filter((b) => b.kind !== 'mineEnd');
  let w0 = town[0].x - 4;
  for (let i = 0; i < town.length; i++) {
    const b = town[i], nx = town[i + 1];
    if (!nx || nx.x - (b.x + b.w) > 30) { boardwalk(g, w0, b.x + b.w + 4, G, w0, DECK); if (nx) w0 = nx.x - 4; }
  }
  for (const b of town) {
    const d = facade(b).door;
    steps(g, d.x - 2, G, d.w + 4, DECK);
  }
  // barres d'attache devant quelques fenêtres
  for (const b of town) for (const wn of facade(b).windows) if (!wn.up && hash(wn.x) < 0.35) hitchRail(g, wn.x - 6, 190, wn.w + 12);
  // le premier plan : abris, balcons, auvents, barreaux, linge, portes battantes
  const fx = front.getContext('2d');
  for (const b of town) frontOf(fx, b);
  for (const p of L.props) drawProp(fx, p);
  return { bg, front };
}
