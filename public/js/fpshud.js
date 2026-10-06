// HUD du doom-like, dessiné en dernier par-dessus la vue 3D et l'arme en main, en pixels du jeu (384 × 216).
// Lisible d'un coup d'œil : vie et visage en bas à gauche, arme et munitions en bas à droite, emplacements
// d'armes au milieu du bas, événement en haut, tableau des tués en haut à droite. Le centre reste dégagé
// (viseur, marque de touche). Le chrono et les scores sont dans la barre DOM du haut (hudStats de fps.js).
// Tout vient de l'objet h, rempli par fps.js à chaque image. Seul souvenir gardé ici : quand l'arme a changé,
// pour n'afficher le panneau complet et la barre d'emplacements qu'un instant (ils cachaient l'arme en main).
import { canvasText } from './scene.js';
import { W, H } from './worlds.js';
import * as ART from './fpsart.js';

const GOLD = '#f8d070', CREAM = '#fdf6e0', SALMON = '#f0705a', INK = '#1a0f0a', DIM = '#8a7860', STEEL = '#9ab0c8', GREEN = '#b8e070';
const PANEL = 'rgba(26, 15, 10, 0.7)', EDGE = '#5a3a22';
const CX = W >> 1, CY = H >> 1;
const FEED_MS = 5000, HURT_MS = 900, HIT_MS = 260, PICK_MS = 1600, BIG_BANNER = 2800;

// ------------------------------------------------------------------ petits outils
const R = (ctx, x, y, w, h, col) => { ctx.fillStyle = col; ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };
const fade = (age, life, out = 400) => (age < 0 || age >= life ? 0 : Math.min(1, (life - age) / out));
const txt = (ctx, s, x, y, size = 8, color = CREAM, align = 'left') => canvasText(ctx, s, x, y, { size, color, align });

// Largeur approchée d'un texte en police pixel (pour caler les morceaux de couleurs différentes côte à côte).
let mctx = null;
const widths = new Map();
function tw(s, size = 8) {
  const key = `${size}|${s}`;
  let w = widths.get(key);
  if (w == null) {
    mctx ??= document.createElement('canvas').getContext('2d');
    mctx.font = `${size}px Silkscreen, monospace`;
    w = Math.round(mctx.measureText(s).width);
    if (widths.size > 400) widths.clear();
    if (document.fonts.check(mctx.font)) widths.set(key, w); // pas de cache tant que la police n'est pas là
  }
  return w;
}

// Cadre façon panneau du jeu : fond sombre, liseré bois.
function panel(ctx, x, y, w, h, edge = EDGE) {
  R(ctx, x, y, w, h, PANEL);
  ctx.strokeStyle = edge;
  ctx.lineWidth = 1;
  ctx.strokeRect(Math.round(x) + 0.5, Math.round(y) + 0.5, Math.round(w) - 1, Math.round(h) - 1);
}

// Jauge : fond, remplissage, repère blanc en haut pour le relief.
function bar(ctx, x, y, w, h, k, col, back = '#2a1a10') {
  R(ctx, x, y, w, h, back);
  const f = Math.round(w * Math.max(0, Math.min(1, k)));
  if (f > 0) { R(ctx, x, y, f, h, col); if (h > 2) R(ctx, x, y, f, 1, 'rgba(255,255,255,0.35)'); }
}

// Icônes en pixel art, mises en cache (une ligne par rangée, chaque lettre = une couleur de la palette).
const ICONS = {
  heart: { pal: { r: SALMON, d: '#8a2a20', w: '#ffd0c0' }, rows: ['.rr.rr.', 'rwrrrrr', 'rrrrrrd', '.rrrrd.', '..rrd..', '...d...'] },
  armor: { pal: { s: STEEL, d: '#4a5868', w: '#e0f0ff' }, rows: ['sssssss', 'swsssss', 'swssssd', 'sssssd.', '.sssd..', '..sd...'] },
  star: { pal: { g: GOLD, d: '#a07020' }, rows: ['...g...', '..ggg..', 'ggggggg', '.ggggd.', '.gd.gd.', 'gd...gd'] },
  inf: { pal: { c: CREAM }, rows: ['.cc...cc.', 'c..c.c..c', 'c...c...c', 'c..c.c..c', '.cc...cc.'] },
  bullet: { pal: { b: '#d8a048', g: GOLD, k: '#7a5020' }, rows: ['.g.', 'ggb', 'ggb', 'bbk', 'bbk', 'bbk', 'kkk'] },
  spent: { pal: { k: '#4a3828' }, rows: ['...', 'kkk', 'kkk', 'kkk', 'kkk', 'kkk', 'kkk'] },
  skull: { pal: { c: CREAM, k: INK }, rows: ['.ccccc.', 'ccccccc', 'ckcckcc', 'ccccccc', '.ccccc.', '.c.c.c.'] },
};

// Silhouettes des armes pour la barre d'emplacements (vues de profil, canon à droite), 18 × 7 px au plus.
// s/d acier clair/sombre, w/k bois clair/sombre, b laiton, c lame, r dynamite, f étincelle.
const WP = { s: '#c8d0d8', d: '#68707a', w: '#a8683a', k: '#5a3420', b: '#d8a048', c: '#eef2f4', g: GOLD, r: '#c83a2a', f: '#ffd860' };
const COLT = ['d.............', 'ssssssssssssss', 'sdddsss.......', '.wwsd.d.......', '.www.dd.......', 'www...........', 'ww............'];
const WINCH = ['wwww..............', 'wwwwwbbbbsssssssss', 'wwwwwbbbbwwwwwww..', 'ww...b..b.........', '.....bbbb.........'];
// deux revolvers décalés, celui de devant par-dessus
const twin = (rows, dx, dy) => {
  const h = rows.length + dy, w = rows[0].length + dx;
  return Array.from({ length: h }, (_, j) => Array.from({ length: w }, (_, i) => {
    const front = rows[j - dy]?.[i - dx];
    return front && front !== '.' ? front : rows[j]?.[i] || '.';
  }).join(''));
};
const WEAPON_ICONS = {
  bowie: ['............ccc..', 'wwwwwwdcccccccccc', 'wwwwwwdccccccccc.', '......d..........'],
  tomahawk: ['...........dd...', 'kwwwwwwwwwwdd...', '...........sss..', '...........ssss.', '..........sssss.'],
  saber: ['.g...............', 'wgccccccccccccc..', '.g.............cc', '.g...............'],
  colt: COLT,
  schofield: ['d...............', 'dddddddddddddddd', 'dsssddd.........', '.wwsd.d.........', '.www.dd.........', 'www.............', 'ww..............'],
  derringer: ['sssssss', 'sddss..', '.wws.d.', 'www.dd.', 'ww.....'],
  winchester: WINCH,
  pump: ['wwww..............', 'wwwwwddddsssssssss', 'wwwwwdddd.kkkkk...', 'ww....d...........'],
  sawed: ['www.........', 'wwwwddssssss', 'wwwwddssssss', 'ww...d......'],
  sharps: ['......dddddddd....', 'wwww...d....d.....', 'wwwwwssssssssssss.', 'wwwwwwwwwwwww.....', 'ww................'],
  gatling: ['......ssssssssssss', '.d..ddssssssssssss', 'ddd.ddssssssssssss', '.d..dd............', '....b.b...........', '...b...b..........'],
  akimbo: twin(COLT.slice(0, 5), 3, 2),
  goldwin: { rows: WINCH, pal: { ...WP, w: '#c89030', b: GOLD, s: '#ffe890' } },
  dynamite: ['........f', '.......k.', 'rrrrrrk..', 'rrrrrr...', 'kkkkkk...', 'rrrrrr...', 'rrrrrr...'],
};
for (const [id, v] of Object.entries(WEAPON_ICONS)) ICONS['w:' + id] = Array.isArray(v) ? { pal: WP, rows: v } : v;
const iconCache = new Map();
function icon(ctx, id, x, y, scale = 1) {
  const key = `${id}|${scale}`;
  let c = iconCache.get(key);
  if (!c) {
    const { pal, rows } = ICONS[id];
    c = document.createElement('canvas');
    c.width = Math.max(...rows.map((r) => r.length)) * scale;
    c.height = rows.length * scale;
    const g = c.getContext('2d');
    rows.forEach((row, j) => [...row].forEach((ch, i) => { if (pal[ch]) { g.fillStyle = pal[ch]; g.fillRect(i * scale, j * scale, scale, scale); } }));
    iconCache.set(key, c);
  }
  ctx.drawImage(c, Math.round(x), Math.round(y));
  return c.width;
}

// Calques plein écran calculés une fois : bords rouges (blessure, vie basse) et lunette de visée.
let vignette = null, scope = null;
function getVignette() {
  if (vignette) return vignette;
  vignette = document.createElement('canvas');
  vignette.width = W; vignette.height = H;
  const g = vignette.getContext('2d');
  const grad = g.createRadialGradient(CX, CY, H * 0.32, CX, CY, W * 0.62);
  grad.addColorStop(0, 'rgba(160, 20, 10, 0)');
  grad.addColorStop(1, 'rgba(160, 20, 10, 0.85)');
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
  return vignette;
}
function getScope() {
  if (scope) return scope;
  scope = document.createElement('canvas');
  scope.width = W; scope.height = H;
  const g = scope.getContext('2d');
  g.fillStyle = '#0a0604';
  g.fillRect(0, 0, W, H);
  g.globalCompositeOperation = 'destination-out';
  g.beginPath(); g.arc(CX, CY, 92, 0, Math.PI * 2); g.fill();
  g.globalCompositeOperation = 'source-over';
  g.strokeStyle = '#0a0604'; g.lineWidth = 3;
  g.beginPath(); g.arc(CX, CY, 92, 0, Math.PI * 2); g.stroke();
  g.fillStyle = 'rgba(10, 6, 4, 0.9)';
  g.fillRect(CX - 92, CY, 80, 1); g.fillRect(CX + 12, CY, 80, 1); // fils du réticule, ouverts au centre
  g.fillRect(CX, CY - 92, 1, 80); g.fillRect(CX, CY + 12, 1, 80);
  g.fillRect(CX - 1, CY + 24, 3, 68); // poteau du bas, plus épais
  return scope;
}

// ------------------------------------------------------------------ HUD
export function drawHud(ctx, h) {
  if (!h) return;
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  weather(ctx, h);
  if (h.zoom && !h.dead) ctx.drawImage(getScope(), 0, 0);
  hurt(ctx, h);
  // menu d'armurerie ouvert (fps.js le dessine par-dessus, sur presque toute l'image) : rien d'autre que le tableau
  if (h.menu) { seen.key = null; if (h.board) board(ctx, h); ctx.restore(); return; } // au départ, l'arme s'annonce
  track(h);
  if (!h.dead) {
    if (!h.zoom) crosshair(ctx, h);
    hitMarker(ctx, h);
    tempArc(ctx, h);
    pickup(ctx, h);
    prompt(ctx, h);
  }
  vitals(ctx, h);
  ammo(ctx, h);
  slots(ctx, h);
  feed(ctx, h);
  banner(ctx, h);
  if (h.dead) death(ctx, h);
  else if (h.lockHint) lockHint(ctx, h);
  if (h.board) board(ctx, h);
  ctx.restore();
}

// Pluie et poussière par-dessus la vue (le brouillard et la nuit sont faits par le rendu 3D). Pas d'état :
// les gouttes et les grains sont placés d'après l'heure, rien n'est alloué.
function weather(ctx, h) {
  const m = h.mods;
  if (!m) return;
  const t = h.now || 0;
  if (m.rain) {
    ctx.fillStyle = 'rgba(170, 190, 230, 0.35)';
    for (let i = 0; i < 46; i++) {
      const sp = 0.32 + (i % 5) * 0.05;
      const x = (i * 89 + t * 0.03) % (W + 20) - 10, y = (i * 47 + t * sp) % (H + 12) - 12;
      ctx.fillRect(x | 0, y | 0, 1, 6 + (i % 3) * 2);
    }
  }
  if (m.dust) {
    R(ctx, 0, 0, W, H, 'rgba(200, 150, 90, 0.12)');
    ctx.fillStyle = 'rgba(230, 190, 130, 0.5)';
    for (let i = 0; i < 40; i++) {
      const x = (i * 131 + t * (0.08 + (i % 4) * 0.03)) % W, y = (i * 61 + Math.sin(t * 0.002 + i) * 6 + H) % H;
      ctx.fillRect(x | 0, y | 0, 1 + (i % 2), 1);
    }
  }
}

// Viseur : quatre traits qui s'écartent avec la dispersion de l'arme, et un point au centre.
function crosshair(ctx, h) {
  if (h.weapon?.melee) { R(ctx, CX - 1, CY - 1, 2, 2, CREAM); return; }
  const g = 3 + Math.round(Math.min(18, h.spread || 0));
  const col = h.hit && h.hit.age < HIT_MS ? (h.hit.kill ? SALMON : GOLD) : CREAM;
  const tick = (x, y, w, hh) => { R(ctx, x - 1, y - 1, w + 2, hh + 2, 'rgba(26,15,10,0.6)'); R(ctx, x, y, w, hh, col); };
  tick(CX - g - 4, CY, 4, 1); tick(CX + g + 1, CY, 4, 1);
  tick(CX, CY - g - 4, 1, 4); tick(CX, CY + g + 1, 1, 4);
  R(ctx, CX, CY, 1, 1, col);
}

// Marque de touche : quatre éclats en X autour du viseur, rouges et plus grands quand le coup tue.
function hitMarker(ctx, h) {
  const hit = h.hit;
  if (!hit || hit.age >= HIT_MS) return;
  const a = fade(hit.age, HIT_MS, 160);
  const r0 = 5 + Math.round(hit.age / 60), len = hit.kill ? 5 : 3;
  ctx.globalAlpha = a;
  ctx.fillStyle = hit.kill ? SALMON : CREAM;
  for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    for (let k = 0; k < len; k++) ctx.fillRect(CX + sx * (r0 + k) - (sx < 0 ? 1 : 0), CY + sy * (r0 + k) - (sy < 0 ? 1 : 0), 2, 2);
  }
  ctx.globalAlpha = 1;
}

// Arme de caisse : un arc doré autour du viseur qui se vide (comme les bonus de la Fusillade).
function tempArc(ctx, h) {
  if (!h.temp || h.zoom) return;
  const k = Math.max(0, Math.min(1, h.temp.left));
  const n = 32, on = Math.ceil(n * k);
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
    R(ctx, CX + Math.cos(a) * 15 - 1, CY + Math.sin(a) * 15 - 1, 2, 2, i < on ? GOLD : 'rgba(26,15,10,0.45)');
  }
}

// Blessures : un arc rouge vers l'agresseur (0 = devant, + = à droite), et les bords de l'écran qui rougissent.
// Vie basse : les bords battent comme un cœur.
function hurt(ctx, h) {
  let flash = 0;
  for (const d of h.hurt || []) {
    if (d.age >= HURT_MS) continue;
    const a = fade(d.age, HURT_MS, 500);
    flash = Math.max(flash, a * (d.age < 150 ? 0.7 : 0.4));
    const c = d.ang - Math.PI / 2;
    ctx.globalAlpha = a;
    for (let k = -5; k <= 5; k++) {
      const q = c + k * 0.07, r = 44 - Math.abs(k) * 0.4;
      R(ctx, CX + Math.cos(q) * r - 2, CY + Math.sin(q) * r - 2, 4, 4, k === 0 ? '#ff4a30' : '#c0281c');
    }
  }
  const low = h.hp > 0 && h.maxHp ? h.hp / h.maxHp : 1;
  if (low <= 0.3 && !h.dead) flash = Math.max(flash, 0.35 + (0.3 - low) * 2 + 0.2 * Math.sin((h.now || 0) * 0.008));
  if (flash > 0) { ctx.globalAlpha = Math.min(1, flash); ctx.drawImage(getVignette(), 0, 0); }
  ctx.globalAlpha = 1;
}

// Bas à gauche : visage, vie, armure, protection de l'étoile ; la monture au-dessus.
function vitals(ctx, h) {
  const x = 4, y = H - 32, w = 116;
  const shield = h.shield > 0;
  panel(ctx, x, y, w, 30, shield ? GOLD : EDGE);
  const hp01 = h.maxHp ? Math.max(0, h.hp) / h.maxHp : 0;
  const face = typeof ART.hudFace === 'function' ? ART.hudFace(h.character, hp01, h.mood || (h.dead ? 'dead' : h.hurt?.some((d) => d.age < 300) ? 'hurt' : 'idle')) : null;
  if (face) ctx.drawImage(face, x + 3, y + 1, 24, 28);
  const lx = x + 31;
  const hpCol = hp01 <= 0.3 ? SALMON : hp01 <= 0.6 ? GOLD : CREAM;
  icon(ctx, 'heart', lx, y + 5);
  txt(ctx, String(Math.max(0, Math.ceil(h.hp))), lx + 10, y + 2, 16, hpCol);
  bar(ctx, lx, y + 19, w - 35, 4, hp01, hp01 <= 0.3 ? SALMON : GREEN);
  if (h.maxArmor) {
    const a01 = Math.max(0, h.armor || 0) / h.maxArmor;
    if (h.armor > 0) { icon(ctx, 'armor', x + w - 34, y + 5); txt(ctx, String(Math.ceil(h.armor)), x + w - 24, y + 5, 8, STEEL); }
    bar(ctx, lx, y + 24, w - 35, 3, a01, STEEL);
  }
  if (shield) {
    const blink = h.shield < 0.25 && Math.floor((h.now || 0) / 150) % 2;
    if (!blink) icon(ctx, 'star', x + w - 10, y - 4);
    bar(ctx, x, y - 3, w - 12, 2, h.shield, GOLD, 'rgba(26,15,10,0.6)');
  }
  if (h.mount) {
    const my = y - (shield ? 18 : 14);
    panel(ctx, x, my, 72, 12);
    txt(ctx, h.mount.kind === 'cart' ? 'CHARIOT' : 'CHEVAL', x + 4, my + 2, 8, GOLD);
    bar(ctx, x + 44, my + 4, 24, 4, h.mount.hp, h.mount.hp <= 0.3 ? SALMON : GREEN);
  }
}

// Bas à droite. Panneau complet (nom, balles une par une, recharge) juste après un changement d'arme, pendant
// une recharge, après un ramassage ou chargeur vide ; le reste du temps, un petit compteur dans le coin
// (au plus 60 × 16), pour dégager l'arme en main. L'équipement (dynamite…) juste au-dessus.
const SHOW_MS = 1500;
const seen = { key: null, wAt: -1e9 };
function track(h) {
  const now = h.now || 0;
  const key = h.temp?.id || h.weapon?.id || null;
  if (seen.wAt > now) seen.wAt = -1e9; // nouvelle partie : l'horloge est repartie de zéro
  if (key !== seen.key) { seen.key = key; seen.wAt = now; }
}
const fresh = (h, at) => (h.now || 0) - at < SHOW_MS;

function ammo(ctx, h) {
  const wp = h.weapon;
  if (!wp) return;
  const empty = !wp.melee && !wp.inf && wp.mag <= 0;
  const full = fresh(h, seen.wAt) || wp.reloading != null || empty || (h.pickup?.age ?? 1e9) < SHOW_MS;
  if (full) ammoFull(ctx, h, wp, empty);
  else ammoCompact(ctx, h, wp);
  equipTag(ctx, h, full);
}

function ammoFull(ctx, h, wp, empty) {
  const w = 116, x = W - 4 - w, y = H - 32;
  panel(ctx, x, y, w, 30, h.temp ? GOLD : EDGE);
  txt(ctx, (h.temp?.name || wp.name || '').toUpperCase(), x + 4, y + 3, 8, h.temp ? GOLD : CREAM);
  if (h.temp) bar(ctx, x + 2, y + 27, w - 4, 1, h.temp.left, GOLD, 'transparent');
  if (wp.melee) { txt(ctx, 'CORPS À CORPS', x + 4, y + 16, 8, DIM); return; }
  if (wp.reloading != null) {
    txt(ctx, 'RECHARGE', x + 4, y + 13, 8, GOLD);
    bar(ctx, x + 4, y + 21, 60, 3, wp.reloading, GOLD);
  } else if (wp.magMax && wp.magMax <= 12 && !wp.inf) {
    for (let i = 0; i < wp.magMax; i++) icon(ctx, i < wp.mag ? 'bullet' : 'spent', x + 4 + i * 5, y + 15);
  } else if (empty) txt(ctx, h.touch ? 'RECHARGER' : 'R : RECHARGER', x + 4, y + 15, 8, SALMON);
  // compteur : balles au chargeur en gros, réserve en petit
  const rx = x + w - 4;
  if (wp.inf) icon(ctx, 'inf', rx - 18, y + 14, 2);
  else {
    const res = String(Math.max(0, wp.reserve ?? 0));
    txt(ctx, `/${res}`, rx, y + 18, 8, wp.reserve > 0 ? DIM : SALMON, 'right');
    txt(ctx, String(Math.max(0, wp.mag)), rx - tw(`/${res}`) - 1, y + 12, 16, empty ? SALMON : wp.mag <= Math.ceil((wp.magMax || 6) / 4) ? GOLD : CREAM, 'right');
  }
}

const iconSize = (id) => { const r = ICONS[id].rows; return [Math.max(...r.map((l) => l.length)), r.length]; };

function ammoCompact(ctx, h, wp) {
  const edge = h.temp ? GOLD : EDGE;
  // arme blanche ou dynamite en main : sa silhouette (et le nombre de bâtons), rien d'autre
  if (wp.melee || wp.id === 'dynamite') {
    const id = 'w:' + wp.id;
    if (!ICONS[id]) return;
    const [iw, ih] = iconSize(id);
    const cnt = wp.id === 'dynamite' ? `X${Math.max(0, wp.mag)}` : '';
    const w = iw + (cnt ? tw(cnt) + 4 : 0) + 8, hh = 13;
    const x = W - 4 - w, y = H - 2 - hh;
    panel(ctx, x, y, w, hh, edge);
    icon(ctx, id, x + 4, y + ((hh - ih) >> 1));
    if (cnt) txt(ctx, cnt, W - 8, y + 4, 8, GOLD, 'right');
    return;
  }
  const res = `/${Math.max(0, wp.reserve ?? 0)}`, mag = String(Math.max(0, wp.mag));
  const w = (wp.inf ? 18 : tw(mag, 16) + tw(res) + 1) + 9;
  const x = W - 4 - w, y = H - 18;
  panel(ctx, x, y, w, 16, edge);
  const rx = W - 8;
  if (wp.inf) icon(ctx, 'inf', rx - 18, y + 3, 2);
  else {
    txt(ctx, res, rx, y + 7, 8, wp.reserve > 0 ? DIM : SALMON, 'right');
    txt(ctx, mag, rx - tw(res) - 1, y + 2, 16, wp.mag <= Math.ceil((wp.magMax || 6) / 4) ? GOLD : CREAM, 'right');
  }
  if (h.temp) bar(ctx, x + 2, y + 14, w - 4, 1, h.temp.left, GOLD, 'transparent');
}

// Équipement : avec son compte (dynamite x3), sans compte s'il n'en a pas ; caché quand il est épuisé.
// En petit : seulement s'il a une icône (la dynamite), et pas quand on l'a déjà en main.
function equipTag(ctx, h, full) {
  const eq = h.equip;
  if (!eq?.name || eq.count === 0) return;
  const key = h.touch ? '' : 'G ';
  if (full) {
    const label = `${key}${eq.name.toUpperCase()}${eq.count > 0 ? ` x${eq.count}` : ''}`;
    const ew = tw(label) + 8;
    panel(ctx, W - 4 - ew, H - 46, ew, 12);
    txt(ctx, label, W - 8, H - 44, 8, GOLD, 'right');
    return;
  }
  const id = 'w:' + eq.id;
  if (!(eq.count > 0) || !ICONS[id] || h.weapon?.id === eq.id) return;
  const [iw, ih] = iconSize(id);
  const cnt = `X${eq.count}`, kw = key ? tw('G') + 4 : 0;
  const w = kw + iw + tw(cnt) + 12, y = H - 32;
  panel(ctx, W - 4 - w, y, w, 12);
  if (key) txt(ctx, 'G', W - w, y + 3, 8, DIM);
  icon(ctx, id, W - w + kw, y + ((12 - ih) >> 1) + 1);
  txt(ctx, cnt, W - 8, y + 3, 8, GOLD, 'right');
}

// Bas au milieu : les cinq emplacements (1 corps à corps, 2 pistolet, 3 arme longue, 4 équipement, 5 caisse),
// le temps de choisir (1,5 s après un changement d'arme) ou tant que Tab est enfoncé.
function slots(ctx, h) {
  const list = h.slots;
  if (!list?.length || !(fresh(h, seen.wAt) || h.board)) return;
  // cases de 27 × 15 : le numéro en haut à gauche, la silhouette de l'arme calée en bas à droite.
  // Tient entre le panneau de vie (jusqu'à x = 120) et celui des munitions (depuis x = 264).
  const bw = 27, bh = 15, gap = 2, total = list.length * (bw + gap) - gap;
  let x = CX - (total >> 1);
  const y = H - bh - 2;
  for (const s of list) {
    const ic = s.has && s.id && ICONS['w:' + s.id] ? 'w:' + s.id : null;
    R(ctx, x, y, bw, bh, s.active ? 'rgba(120, 80, 30, 0.85)' : PANEL);
    ctx.strokeStyle = s.active ? GOLD : s.has ? EDGE : '#2a1a10';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, bw - 1, bh - 1);
    if (ic) {
      const rows = ICONS[ic].rows, iw = Math.max(...rows.map((r) => r.length)), ih = rows.length;
      if (!s.active) ctx.globalAlpha = 0.75;
      icon(ctx, ic, x + bw - 2 - iw, y + bh - 2 - ih);
      ctx.globalAlpha = 1;
    } else if (s.has) txt(ctx, (s.name || '?').slice(0, 2).toUpperCase(), x + bw - 3, y + 7, 8, CREAM, 'right'); // arme sans dessin
    txt(ctx, String(s.n), x + 2, y + 1, 8, s.active ? GOLD : s.has ? DIM : '#4a3828');
    x += bw + gap;
  }
}

// Haut à droite : qui a abattu qui, avec quelle arme. Les lignes où l'on figure sont sur fond doré.
function feed(ctx, h) {
  const list = (h.feed || []).filter((f) => f.age < FEED_MS).slice(-4);
  // sous le bandeau d'événement quand il y en a un : une longue ligne le recouvrait
  const b = h.banner;
  let y = b && b.k > 0 ? (b.age < BIG_BANNER || b.warn > 0 ? 60 : 20) : 4;
  const me = h.players?.find((p) => p.me)?.name;
  for (const f of list) {
    const a = fade(f.age, FEED_MS, 600);
    ctx.globalAlpha = a;
    // le texte pixel ne garde pas les espaces au bord : les trois morceaux sont calés à droite, avec un écart fixe
    const wpn = f.w ? f.w.toUpperCase() : '>';
    const A = (f.a || 'BANDIT').toUpperCase(), B = (f.b || '').toUpperCase();
    const gap = 5, wa = tw(A), ww = tw(wpn), wb = tw(B);
    const total = wa + ww + wb + gap * 2 + 8;
    const mine = me && (f.a === me || f.b === me);
    panel(ctx, W - 4 - total, y, total, 11, mine ? GOLD : EDGE);
    let x = W - 8;
    txt(ctx, B, x, y + 2, 8, f.bCol || CREAM, 'right');
    x -= wb + gap;
    txt(ctx, wpn, x, y + 2, 8, DIM, 'right');
    x -= ww + gap;
    txt(ctx, A, x, y + 2, 8, f.aCol || SALMON, 'right');
    y += 13;
  }
  ctx.globalAlpha = 1;
}

// Événement en cours (fpsevents.js) : gros titre au centre en haut pendant ~3 s, puis rappel compact
// avec le temps qui reste.
function banner(ctx, h) {
  const b = h.banner;
  if (!b || !(b.k > 0)) return;
  ctx.globalAlpha = Math.min(1, b.k);
  // avant le coup (le train arrive) : compte à rebours rouge qui clignote, à la place du temps restant
  const warn = b.warn > 0;
  const blink = warn && Math.floor((h.now || 0) / 180) % 2 === 0;
  const col = warn ? (blink ? '#ff4a30' : SALMON) : b.col || GOLD;
  // la consigne reste lisible pendant l'alerte (« DÉGAGEZ LES RAILS ! - 3S ») : c'est elle qui dit quoi faire
  const warnTxt = warn ? `${b.sub ? `${b.sub.toUpperCase()} - ` : 'DANS '}${Math.ceil(b.warn / 1000)}S` : '';
  if (b.age < BIG_BANNER || warn) {
    const name = b.name.toUpperCase(), sub = warn ? warnTxt : (b.sub || '').toUpperCase();
    // au plus 244 de large : le coin haut gauche (x 3..67, y 3..67) est à la mini-carte de fps.js
    const w = Math.min(244, Math.max(tw(name, 16), tw(sub)) + 16);
    panel(ctx, CX - w / 2, 26, w, sub ? 30 : 18, col);
    txt(ctx, name, CX, 29, 16, col, 'center');
    if (sub) txt(ctx, sub, CX, 45, 8, warn ? col : CREAM, 'center');
  } else {
    const name = b.name.toUpperCase();
    const sec = `${Math.ceil(b.left / 1000)}S`;
    const w = tw(name) + tw(sec) + 14;
    panel(ctx, CX - w / 2, 3, w, 14, col);
    txt(ctx, name, CX - w / 2 + 4, 5, 8, col);
    txt(ctx, sec, CX + w / 2 - 4, 5, 8, CREAM, 'right');
    bar(ctx, CX - w / 2 + 2, 14, w - 4, 1, b.left / Math.max(1, b.left + b.age), col, 'transparent');
  }
  ctx.globalAlpha = 1;
}

// Objet ramassé : petit texte doré qui monte sous le viseur et s'efface.
function pickup(ctx, h) {
  const p = h.pickup;
  if (!p || p.age >= PICK_MS) return;
  ctx.globalAlpha = fade(p.age, PICK_MS, 500);
  txt(ctx, p.text.toUpperCase(), CX, CY + 26 - Math.min(8, p.age / 60), 8, GOLD, 'center');
  ctx.globalAlpha = 1;
}

// Action possible (monter à cheval, ramasser…). Au doigt, la touche est remplacée par le bouton.
function prompt(ctx, h) {
  if (!h.prompt) return;
  const s = (h.touch ? h.prompt.replace(/^\S+\s*:\s*/, '') : h.prompt).toUpperCase();
  const w = tw(s) + 10;
  panel(ctx, CX - w / 2, CY + 38, w, 13, GOLD);
  txt(ctx, s, CX, CY + 41, 8, CREAM, 'center');
}

// Sur PC, la souris n'est pas encore capturée.
function lockHint(ctx, h) {
  const a = 0.75 + 0.25 * Math.sin((h.now || 0) * 0.006);
  ctx.globalAlpha = a;
  const s = 'CLIQUE DANS L\'IMAGE POUR VISER';
  const w = tw(s) + 12;
  panel(ctx, CX - w / 2, CY + 40, w, 24, GOLD);
  txt(ctx, s, CX, CY + 43, 8, GOLD, 'center');
  txt(ctx, 'ÉCHAP : LIBÉRER LA SOURIS', CX, CY + 53, 8, DIM, 'center');
  ctx.globalAlpha = 1;
}

// Abattu : écran assombri, qui t'a eu, et le retour.
function death(ctx, h) {
  const d = h.dead;
  R(ctx, 0, 0, W, H - 34, 'rgba(40, 6, 4, 0.55)');
  icon(ctx, 'skull', CX - 10, CY - 46, 3);
  txt(ctx, 'ABATTU', CX, CY - 22, 24, SALMON, 'center');
  if (d.by) {
    const pre = 'PAR ', who = d.by.toUpperCase();
    const w = tw(pre) + tw(who);
    txt(ctx, pre, CX - w / 2, CY + 2, 8, CREAM);
    txt(ctx, who, CX - w / 2 + tw(pre), CY + 2, 8, d.byColor || SALMON);
  }
  const sec = Math.ceil(Math.max(0, d.respawnIn) / 1000);
  txt(ctx, sec > 0 ? `RETOUR DANS ${sec}` : 'EN SELLE !', CX, CY + 16, 16, GOLD, 'center');
}

// Tab : tableau des scores, du premier au dernier.
function board(ctx, h) {
  const ps = [...(h.players || [])].sort((a, b) => b.score - a.score);
  if (!ps.length) return;
  const w = 232, rowH = 13, top = 30, ph = 22 + ps.length * rowH;
  const x = CX - w / 2;
  R(ctx, 0, 0, W, H, 'rgba(10, 6, 4, 0.35)');
  panel(ctx, x, top, w, ph, GOLD);
  const cols = { name: x + 22, score: x + w - 86, k: x + w - 46, d: x + w - 8 };
  txt(ctx, 'JOUEUR', cols.name, top + 5, 8, DIM);
  txt(ctx, 'PTS', cols.score, top + 5, 8, DIM, 'right');
  txt(ctx, 'TUÉS', cols.k, top + 5, 8, DIM, 'right');
  txt(ctx, 'MORTS', cols.d, top + 5, 8, DIM, 'right');
  ps.forEach((p, i) => {
    const y = top + 18 + i * rowH;
    if (p.me) R(ctx, x + 2, y - 2, w - 4, rowH - 1, 'rgba(248, 208, 112, 0.18)');
    txt(ctx, String(i + 1), x + 8, y, 8, i === 0 ? GOLD : CREAM);
    R(ctx, cols.name - 8, y + 1, 5, 5, p.color || CREAM);
    const name = `${(p.name || '???').toUpperCase()}${p.bot ? ' (BOT)' : ''}`;
    txt(ctx, name, cols.name, y, 8, p.alive === false ? DIM : CREAM);
    if (p.bounty) icon(ctx, 'star', cols.name + tw(name) + 3, y);
    txt(ctx, String(p.score ?? 0), cols.score, y, 8, GOLD, 'right');
    txt(ctx, String(p.k ?? 0), cols.k, y, 8, CREAM, 'right');
    txt(ctx, String(p.d ?? 0), cols.d, y, 8, CREAM, 'right');
  });
}
