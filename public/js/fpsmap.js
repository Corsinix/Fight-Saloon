// Carte du mode « Règlement de comptes » (et « Mort ou vif ») : un radar rond en haut à gauche, centré sur le
// joueur, et la grande carte de la ville (touche M, ou un toucher sur le radar), nord en haut toutes les deux.
// Le fond est dessiné une fois depuis la grille, à 4 pixels par case (sols, planchers, rails et traverses, murs,
// murs bas, portes, décor) et copié tel quel, pixel pour pixel : pas de rotation ni d'agrandissement qui le
// rendraient flou ou crénelé. Seule la flèche du joueur tourne.
// Par-dessus : caisses, or, chevaux et wagonnets libres, dynamite, El Diablo et les bandits en vue (ou qui tirent).
// Les autres joueurs n'y figurent jamais : la carte sert à s'orienter et à trouver les objets, pas à traquer.
import { canvasText } from './scene.js';
import { makeCanvas } from './sprites.js';

export const K = 4; // pixels par case
export const RADAR = { x: 4, y: 4, w: 64, h: 64, r: 31 }; // cadre (pour le toucher) et rayon du disque

const FLOOR = {
  sand: '#d2aa76', dirt: '#b08458', grass: '#9aa058', boardwalk: '#a07048', saloonFloor: '#8a5a38', bankFloor: '#7a5a40',
  tiles: '#b06a48', flagstone: '#8a8a84', gravel: '#8c847a', railsX: '#7a6a5c', railsY: '#7a6a5c',
};
// couleur d'un mur plein vu du dessus, selon sa texture
const WALL = [
  [/^rock|^mine/, '#4e4038'], [/^logs/, '#6a4426'], [/^brick/, '#6e3426'], [/^adobe|^cantina/, '#9a7450'],
  [/^stone|^tomb|^chapel/, '#6a6a68'], [/^barn/, '#7a2a20'], [/^train|^freight|^loco/, '#3a3a40'], [/^cell/, '#3a3434'],
];
// murs bas : on les voit en couleur sur le sol
const LOW = [
  [/^fence/, '#6a4426', 'dots'], [/^hay/, '#d8b050'], [/^tnt/, '#c03020'], [/^crates/, '#9a6a3a'], [/^bar|^piano/, '#4e3020'],
  [/^stone/, '#8a8a84'],
];
// petits objets du décor : couleur et forme (s : carré 2x2, d : point, p : croix, c : rond, w : 3x2)
const DECO = {
  cactus: ['#4a8a3a', 'p'], deadtree: ['#5a4030', 'p'], barrel: ['#8a5a30', 's'], barrelTnt: ['#d03020', 's'], lamp: ['#f8d070', 'd'],
  tombstone: ['#b0b0ac', 'd'], cross: ['#c8c8c4', 'p'], coffin: ['#5a3a24', 'w'], trough: ['#5a7aa0', 'w'], hayBale: ['#d8b050', 's'],
  table: ['#6a4426', 's'], watertower: ['#6a4a30', 'c'], windmill: ['#e0d8c8', 'p'], wagonWreck: ['#7a5a3a', 'w'], wheel: ['#5a4030', 'd'],
  cow: ['#ece4d4', 's'], hitch: ['#6a4426', 'w'], orePile: ['#6a6058', 's'], headframe: ['#4a3a2a', 'c'], cannon: ['#2a2a2e', 'w'],
  flag: ['#c03030', 'd'], safe: ['#3a3a40', 's'], stove: ['#2a2a2e', 's'], bench: ['#6a4426', 'w'], pew: ['#6a4426', 'w'],
  altarCross: ['#e0c060', 'p'], gold: ['#f8d070', 's'], plant: ['#4a8a3a', 'd'], spittoon: ['#c0a040', 'd'],
};
const ZONE_LABEL = { boothill: 'BOOT HILL', ranch: 'RANCH', mine: 'MINE', fort: 'FORT' };
const ROOM_LABEL = { saloon: 'SALOON', cantina: 'CANTINA', sheriff: 'SHÉRIF', bank: 'BANQUE' };

const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const hash = (x, y) => { let k = Math.imul(x * 374761393 + y * 668265263, 0x27d4eb2d); k ^= k >>> 15; return (k >>> 0) / 4294967296; };
const pick = (rules, id) => rules.find(([re]) => re.test(id)) || null;

// Fond de carte (4 px par case) : sols (plus sombres sous un toit), planches, rails, murs avec leur contour, portes.
// w.radar : couleurs en plus pour les textures d'une autre carte que la ville (voir MAP_SPEC dans fpskit.js)
function baseMap(w) {
  const rd = w.radar || {};
  const FL = { ...FLOOR, ...rd.floor }, WL = [...(rd.wall || []), ...WALL], LW = [...(rd.low || []), ...LOW], DC = { ...DECO, ...rd.deco };
  const C = w.cells;
  const W = w.w * K, H = w.h * K;
  const c = makeCanvas(W, H, true);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(W, H);
  const d = img.data;
  const px = (x, y, col, k = 1) => { const o = (y * W + x) * 4; d[o] = col[0] * k; d[o + 1] = col[1] * k; d[o + 2] = col[2] * k; d[o + 3] = 255; };
  const wallOf = (i) => C.h[i] > 0 && C.b[i] < 0.9;
  const tall = (i) => i >= 0 && i < C.h.length && wallOf(i) && C.h[i] >= 0.9;
  // linteaux : une porte (au plus 3 cases de suite), ou une poutre au-dessus du passage (canal sur tréteaux, arcades,
  // auvents : plus de 3 cases d'affilée) qu'on dessine comme un trait sur le sol, dans le sens de la rangée
  const lin = (x, y) => x >= 0 && y >= 0 && x < w.w && y < w.h && C.b[y * w.w + x] > 0;
  const run = (x, y, dx, dy) => { let n = 1; for (let k = 1; lin(x + dx * k, y + dy * k); k++) n++; for (let k = 1; lin(x - dx * k, y - dy * k); k++) n++; return n; };
  for (let cy = 0; cy < w.h; cy++) for (let cx = 0; cx < w.w; cx++) {
    const i = cy * w.w + cx;
    const fl = w.flats[C.floor[i]];
    const base = hex(FL[fl] || '#b89070');
    const dim = C.ceil[i] ? 0.72 : 1;
    const tid = (w.tex[C.wall[i]] || [''])[0];
    for (let y = 0; y < K; y++) for (let x = 0; x < K; x++) {
      const X = cx * K + x, Y = cy * K + y;
      // le sol, légèrement grainé ; planches et carrelage dessinés
      let k = dim * (0.94 + hash(X, Y) * 0.1);
      if (fl === 'boardwalk' || fl === 'saloonFloor' || fl === 'bankFloor') k *= y === K - 1 ? 0.82 : 1;
      if (fl === 'tiles' || fl === 'flagstone') k *= (x === 0 || y === 0) ? 0.85 : 1;
      let col = base;
      if (fl === 'railsX' || fl === 'railsY') {
        const a = fl === 'railsX' ? x : y, b = fl === 'railsX' ? y : x;
        if (b === 1 || b === 2) col = [150, 150, 156]; // les deux rails
        else if (a % 2 === 0) col = [96, 64, 40]; // les traverses
      }
      if (tall(i)) {
        // mur plein : sa couleur, avec un contour sombre là où il touche le sol
        const r = pick(WL, tid);
        col = hex(r ? r[1] : '#3a2416');
        k = 0.9 + hash(X, Y) * 0.12;
        const edge = (x === 0 && cx > 0 && !tall(i - 1)) || (x === K - 1 && cx < w.w - 1 && !tall(i + 1))
          || (y === 0 && cy > 0 && !tall(i - w.w)) || (y === K - 1 && cy < w.h - 1 && !tall(i + w.w));
        if (edge) { col = [34, 20, 12]; k = 1; }
      } else if (wallOf(i)) {
        // mur bas (comptoir, barrière, foin, caisses) : on tire par-dessus
        const r = pick(LW, tid) || [null, '#7a5a3a'];
        if (r[2] === 'dots') { if ((x + y) % 2 === 0) { col = hex(r[1]); k = 1; } }
        else if (x > 0 && y > 0 && x < K - 1 && y < K - 1) { col = hex(r[1]); k = 1; } else { col = [60, 40, 26]; k = 1; }
      } else if (C.b[i] > 0) {
        const rh = run(cx, cy, 1, 0), rv = run(cx, cy, 0, 1);
        if (Math.max(rh, rv) > 3) {
          // poutre au-dessus du passage
          if ((rh >= rv ? y : x) === 1) { col = [74, 50, 30]; k = 1; }
        } else if (x === 1 || x === 2 || y === 1 || y === 2) { col = [232, 200, 140]; k = 1; } // porte : un seuil clair au milieu de la case
      }
      px(X, Y, col, k);
    }
  }
  ctx.putImageData(img, 0, 0);
  // le décor par-dessus
  for (const o of w.deco) {
    const s = DC[o.id];
    if (!s || o.hang || o.gone) continue;
    const x = Math.floor(o.x * K), y = Math.floor(o.y * K);
    ctx.fillStyle = s[0];
    if (s[1] === 'd') ctx.fillRect(x, y, 1, 1);
    else if (s[1] === 's') ctx.fillRect(x - 1, y - 1, 2, 2);
    else if (s[1] === 'w') ctx.fillRect(x - 1, y - 1, 3, 2);
    else if (s[1] === 'c') { ctx.fillRect(x - 1, y - 2, 3, 5); ctx.fillRect(x - 2, y - 1, 5, 3); }
    else { ctx.fillRect(x - 1, y, 3, 1); ctx.fillRect(x, y - 1, 1, 3); }
  }
  return c;
}

export class FpsMap {
  constructor(world) {
    this.w = world;
    this.base = baseMap(world);
    this.big = false;
  }

  toggle() { this.big = !this.big; }

  // le décor a changé (caisses soufflées, barils sautés, décor revenu) : fond redessiné
  refresh() { this.base = baseMap(this.w); }

  // Radar rond, nord en haut, copié pixel pour pixel autour du joueur.
  drawRadar(ctx, me, marks, now) {
    const { x: rx, y: ry, w: rw, r } = RADAR;
    const cx = rx + rw / 2, cy = ry + rw / 2;
    const ox = Math.round(me.x * K) - cx, oy = Math.round(me.y * K) - cy; // décalage carte -> écran
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.closePath();
    ctx.fillStyle = '#1a0f0a';
    ctx.fill();
    ctx.clip();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.base, ox + rx, oy + ry, rw, rw, rx, ry, rw, rw);
    for (const m of marks) this.mark(ctx, m.x * K - ox, m.y * K - oy, m, now);
    this.arrow(ctx, cx, cy, me.a);
    ctx.restore();
    // l'anneau, et le N en haut
    ctx.save();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#2a170c';
    ctx.beginPath(); ctx.arc(cx, cy, r + 1, 0, Math.PI * 2); ctx.stroke();
    ctx.lineWidth = 1;
    ctx.strokeStyle = '#b8803a';
    ctx.beginPath(); ctx.arc(cx, cy, r + 0.5, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
    ctx.fillStyle = '#2a170c';
    ctx.fillRect(cx - 4, ry - 3, 9, 8);
    canvasText(ctx, 'N', cx + 0.5, ry - 3, { color: '#f8d070' });
  }

  // Grande carte : toute la ville, pixel pour pixel, avec le nom des lieux.
  drawFull(ctx, me, marks, now, W, H) {
    const w = this.w;
    const mw = this.base.width, mh = this.base.height;
    const ox = Math.round((W - mw) / 2), oy = Math.max(12, Math.round((H - mh) / 2) + 5);
    ctx.save();
    ctx.fillStyle = 'rgba(26,15,10,0.88)';
    ctx.fillRect(ox - 3, oy - 12, mw + 6, mh + 15);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.base, ox, oy);
    canvasText(ctx, w.map === 'town' || !w.name ? 'CARTE DE LA VILLE' : `CARTE : ${w.name}`, W / 2, oy - 11, { color: '#f8d070' });
    // étiquettes : si deux noms se chevauchent (bâtiments voisins), le second monte ou descend d'une ligne
    const placed = [];
    const label = (text, x, y, col = '#fdf6e0') => {
      const tw = text.length * 5.5 + 4, lx = ox + x * K, ly = oy + y * K - 3;
      for (const dy of [0, -9, 9, -18, 18]) {
        const rr = [lx - tw / 2, ly + dy, tw, 9];
        if (placed.some((q) => rr[0] < q[0] + q[2] && q[0] < rr[0] + rr[2] && rr[1] < q[1] + q[3] && q[1] < rr[1] + rr[3])) continue;
        placed.push(rr);
        canvasText(ctx, text, lx, ly + dy, { color: col });
        return;
      }
    };
    for (const d of w.districts || []) label(ZONE_LABEL[d.zone] || '', (d.x0 + d.x1 + 1) / 2, (d.y0 + d.y1 + 1) / 2, '#e2d2a6');
    for (const l of w.labels || []) label(l.text, l.x, l.y, l.col || '#e2d2a6');
    for (const r of w.rooms || []) if (ROOM_LABEL[r.kind]) label(ROOM_LABEL[r.kind], (r.x0 + r.x1 + 1) / 2, (r.y0 + r.y1 + 1) / 2, '#f8d070');
    for (const m of marks) this.mark(ctx, ox + m.x * K, oy + m.y * K, m, now);
    this.arrow(ctx, ox + me.x * K, oy + me.y * K, me.a, true);
    ctx.restore();
  }

  // Le joueur : un triangle plein tourné vers son regard (pointe à 5 px, base de 5 px), cerné de sombre
  arrow(ctx, x, y, a, big = false) {
    const L = big ? 6 : 5, B = big ? 3 : 2.5;
    const dx = Math.cos(a), dy = Math.sin(a);
    const P = [[x + dx * L, y + dy * L], [x - dx * B - dy * B, y - dy * B + dx * B], [x - dx * B + dy * B, y - dy * B - dx * B]];
    const inside = (px, py) => {
      const s1 = (P[1][0] - P[0][0]) * (py - P[0][1]) - (P[1][1] - P[0][1]) * (px - P[0][0]);
      const s2 = (P[2][0] - P[1][0]) * (py - P[1][1]) - (P[2][1] - P[1][1]) * (px - P[1][0]);
      const s3 = (P[0][0] - P[2][0]) * (py - P[2][1]) - (P[0][1] - P[2][1]) * (px - P[2][0]);
      return (s1 >= 0 && s2 >= 0 && s3 >= 0) || (s1 <= 0 && s2 <= 0 && s3 <= 0);
    };
    const pts = [];
    for (let py = Math.floor(y) - 6; py <= Math.floor(y) + 6; py++) for (let px = Math.floor(x) - 6; px <= Math.floor(x) + 6; px++) if (inside(px + 0.5, py + 0.5)) pts.push([px, py]);
    ctx.fillStyle = '#1a0f0a';
    for (const [px, py] of pts) ctx.fillRect(px - 1, py - 1, 3, 3);
    ctx.fillStyle = '#fdf6e0';
    for (const [px, py] of pts) ctx.fillRect(px, py, 1, 1);
    ctx.fillStyle = '#f0705a'; // la pointe
    ctx.fillRect(Math.round(x + dx * (L - 1)) , Math.round(y + dy * (L - 1)), 1, 1);
  }

  mark(ctx, x, y, m, now) {
    x = Math.round(x); y = Math.round(y);
    const ink = (rx, ry, w, h) => { ctx.fillStyle = '#1a0f0a'; ctx.fillRect(x + rx - 1, y + ry - 1, w + 2, h + 2); };
    if (m.kind === 'crate') {
      // caisse : un carré doré cerclé, qui pulse doucement
      ink(-2, -2, 5, 5);
      ctx.fillStyle = Math.floor(now / 400) % 2 ? '#f8d070' : '#e0a840';
      ctx.fillRect(x - 2, y - 2, 5, 5);
      ctx.fillStyle = '#8a5a20';
      ctx.fillRect(x - 2, y, 5, 1);
    } else if (m.kind === 'gold') {
      ink(-1, -1, 3, 3);
      ctx.fillStyle = '#ffe890'; ctx.fillRect(x - 1, y - 1, 3, 3);
    } else if (m.kind === 'horse') {
      ink(-2, -1, 5, 3);
      ctx.fillStyle = '#b06a34'; ctx.fillRect(x - 2, y - 1, 5, 2); ctx.fillRect(x + 2, y - 2, 1, 1); ctx.fillRect(x - 2, y + 1, 1, 1); ctx.fillRect(x + 2, y + 1, 1, 1);
    } else if (m.kind === 'cart') {
      ink(-2, -1, 5, 3);
      ctx.fillStyle = '#a8b0bc'; ctx.fillRect(x - 2, y - 1, 5, 3); ctx.fillStyle = '#4a4f58'; ctx.fillRect(x - 1, y - 1, 3, 1);
    } else if (m.kind === 'dyn') {
      if (Math.floor(now / 120) % 2) return; // la mèche clignote
      ink(-1, -1, 3, 3);
      ctx.fillStyle = '#ff4020'; ctx.fillRect(x - 1, y - 1, 3, 3);
    } else if (m.kind === 'skull') {
      ink(-2, -2, 5, 5);
      ctx.fillStyle = '#f0405a'; ctx.fillRect(x - 2, y - 2, 5, 4); ctx.fillRect(x - 1, y + 2, 3, 1);
      ctx.fillStyle = '#1a0f0a'; ctx.fillRect(x - 1, y - 1, 1, 1); ctx.fillRect(x + 1, y - 1, 1, 1);
    } else {
      ink(-1, -1, 3, 3);
      ctx.fillStyle = m.col; ctx.fillRect(x - 1, y - 1, 3, 3);
    }
  }
}
