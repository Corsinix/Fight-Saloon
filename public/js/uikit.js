// Direction artistique commune des écrans dessinés sur le canvas (384 × 216) : couleurs, cadres, boîte de
// dialogue, boutons, transitions et courbes d'animation. Les écrans HTML suivent les mêmes couleurs (style.css, :root).
// Sans DOM hors canvas : utilisable par toutes les scènes (histoire, mini-jeux, cinématiques).
import { canvasText, textSprite } from './scene.js';
import { makeCanvas } from './sprites.js';
import { W, H } from './worlds.js';

// Couleurs de référence (les mêmes noms que les variables CSS de style.css)
export const TOK = {
  ink: '#1a0f0a', shadow: '#0a0503', cream: '#fdf6e0', sand: '#e3c697', parch: '#eadcb0', parchD: '#d8c490',
  gold: '#f8d070', rust: '#c2643e', rustD: '#8a3a24', wood: '#5a3a22', woodD: '#3a2414', woodL: '#8a5a34',
  muted: '#b89a78', red: '#9a2a1c', green: '#b8e070', salmon: '#f0907a', night: '#1e140c',
};

// ---------------------------------------------------------------- courbes
export const clamp01 = (k) => (k < 0 ? 0 : k > 1 ? 1 : k);
export const ease = {
  out3: (k) => 1 - (1 - clamp01(k)) ** 3,
  in3: (k) => clamp01(k) ** 3,
  inOut: (k) => { k = clamp01(k); return k * k * (3 - 2 * k); },
  backOut: (k) => { k = clamp01(k) - 1; return 1 + 2.2 * k * k * k + 1.2 * k * k; },
};
// 0 avant a, monte jusqu'à 1 entre a et b, reste à 1 jusqu'à c, redescend à 0 en d
export const prof = (el, a, b, c, d) => (el <= a || el >= d ? 0 : el < b ? ease.inOut((el - a) / (b - a)) : el <= c ? 1 : 1 - ease.inOut((el - c) / (d - c)));

// ---------------------------------------------------------------- texte
// Largeur d'un texte en pixels du jeu (police Silkscreen), sans créer de sprite : pour couper les lignes
// et dérouler la machine à écrire (un sprite par préfixe viderait le cache des textes).
let meas = null;
export function textW(str, size = 8) {
  meas ||= makeCanvas(4, 4).getContext('2d');
  meas.font = `${size}px Silkscreen, monospace`;
  return Math.ceil(meas.measureText(str).width);
}

// Coupe un texte en lignes d'au plus maxW pixels (mots entiers ; « \n » force une ligne)
export function wrap(text, maxW, size = 8) {
  const out = [];
  for (const para of String(text).split('\n')) {
    let line = '';
    for (const word of para.split(/[ \t]+/).filter(Boolean)) { // (l'espace insécable, avant « ! ? : ; », ne coupe pas)
      const t = line ? `${line} ${word}` : word;
      if (line && textW(t, size) > maxW) { out.push(line); line = word; } else line = t;
    }
    out.push(line);
  }
  return out;
}

// Texte révélé lettre à lettre : la ligne entière est un seul sprite, découpé à la largeur déjà écrite.
// L'avance du préfixe tombe pile sur la 1re colonne de la lettre suivante et couvre déjà l'ombre de la dernière
// (Silkscreen : 1 à 2 colonnes vides après chaque lettre) ; le sprite commence à la 1re encre : on ne mesure
// pas les espaces de tête.
export function revealText(ctx, str, x, y, n, { size = 8, color = TOK.cream, shadow = TOK.ink } = {}) {
  if (n <= 0) return;
  const s = textSprite(str, size, color, shadow);
  let lead = 0;
  while (str[lead] === ' ') lead++;
  const w = n >= str.length ? s.c.width : Math.min(s.c.width, n > lead ? textW(str.slice(lead, n), size) : 0);
  if (w > 0) ctx.drawImage(s.c, 0, 0, w, s.c.height, Math.round(x), Math.round(y) + s.dy, w, s.c.height);
}

// ---------------------------------------------------------------- cadres
// Panneau 9-tranches dessiné une fois par taille et par habillage, recopié ensuite.
//   wood : planches du saloon (cadres, menus)   parch : affiche/parchemin (règles, cartes)   ink : nuit (dialogues)
const SKINS = {
  wood: { edge: TOK.ink, rim: TOK.woodL, fill: TOK.wood, fillD: TOK.woodD, lines: true, nails: true },
  parch: { edge: TOK.ink, rim: '#f4ead0', fill: TOK.parch, fillD: TOK.parchD, lines: false, nails: true },
  ink: { edge: TOK.shadow, rim: '#5a3a22', fill: 'rgba(26,15,10,0.92)', fillD: 'rgba(10,5,3,0.92)', lines: false, nails: false },
};
const panelCache = new Map();
export function panel(ctx, x, y, w, h, skin = 'wood') {
  w = Math.round(w); h = Math.round(h);
  const key = `${skin}|${w}|${h}`;
  let c = panelCache.get(key);
  if (!c) {
    const S = SKINS[skin] || SKINS.wood;
    c = makeCanvas(w, h);
    const g = c.getContext('2d');
    g.fillStyle = S.edge; g.fillRect(0, 1, w, h - 2); g.fillRect(1, 0, w - 2, h);
    g.fillStyle = S.fill; g.fillRect(2, 2, w - 4, h - 4);
    g.fillStyle = S.fillD; g.fillRect(2, h - 4, w - 4, 2); g.fillRect(w - 4, 2, 2, h - 4);
    g.fillStyle = S.rim; g.fillRect(2, 2, w - 4, 1); g.fillRect(2, 2, 1, h - 4);
    if (S.lines) { g.fillStyle = TOK.woodD; for (let yy = 10; yy < h - 4; yy += 9) g.fillRect(3, yy, w - 7, 1); }
    if (S.nails && w > 24 && h > 20) {
      g.fillStyle = '#5a5a62';
      for (const [nx, ny] of [[4, 4], [w - 6, 4], [4, h - 6], [w - 6, h - 6]]) g.fillRect(nx, ny, 2, 2);
    }
    if (panelCache.size > 60) panelCache.clear();
    panelCache.set(key, c);
  }
  ctx.drawImage(c, Math.round(x), Math.round(y));
}

// Petite plaque de nom (au-dessus d'une boîte de dialogue, sur une carte…)
export function plate(ctx, text, x, y, col = TOK.gold, bg = TOK.ink) {
  const w = textW(text) + 8;
  ctx.fillStyle = bg;
  ctx.fillRect(Math.round(x), Math.round(y), w, 11);
  ctx.fillStyle = col;
  ctx.fillRect(Math.round(x), Math.round(y) + 10, w, 1);
  canvasText(ctx, text, Math.round(x) + 4, Math.round(y) + 2, { color: col, align: 'left' });
  return w;
}

// Boîte de dialogue : portrait (canvas) à gauche, plaque du nom, lignes déroulées jusqu'au caractère reveal.
// Renvoie le nombre total de caractères (pour savoir quand la réplique est entièrement écrite).
export function textBox(ctx, { x = 6, y = H - 62, w = W - 12, h = 56, name = '', color = TOK.gold, portrait = null, lines = [], reveal = Infinity, more = false, t = 0 }) {
  panel(ctx, x, y, w, h, 'ink');
  let tx = x + 8;
  if (portrait) {
    const pw = portrait.width, ph = portrait.height;
    const py = y + h - ph - 3;
    ctx.fillStyle = TOK.ink; ctx.fillRect(x + 4, py - 1, pw + 2, ph + 2);
    ctx.drawImage(portrait, x + 5, py);
    tx = x + pw + 12;
  }
  if (name) plate(ctx, name.toUpperCase(), tx - 2, y - 6, color);
  let left = reveal, total = 0;
  lines.forEach((l, i) => {
    revealText(ctx, l, tx, y + 10 + i * 11, Math.max(0, left), { color: TOK.cream });
    left -= l.length;
    total += l.length;
  });
  if (more && reveal >= total && Math.floor(t / 300) % 2 === 0) { // petite flèche : la suite
    ctx.fillStyle = TOK.gold;
    const ax = x + w - 12, ay = y + h - 9;
    ctx.fillRect(ax, ay, 5, 1); ctx.fillRect(ax + 1, ay + 1, 3, 1); ctx.fillRect(ax + 2, ay + 2, 1, 1);
  }
  return total;
}

// Bouton dessiné : state 'idle' | 'hover' | 'on' | 'off'. Renvoie son rectangle (pour les clics).
export function button(ctx, r, label, state = 'idle') {
  const { x, y, w, h } = r;
  const fill = state === 'off' ? '#4a3a2e' : state === 'on' ? TOK.rust : state === 'hover' ? '#d07448' : TOK.wood;
  ctx.fillStyle = TOK.ink; ctx.fillRect(x, y + 1, w, h - 1); ctx.fillRect(x + 1, y, w - 2, h + 1);
  ctx.fillStyle = fill; ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
  ctx.fillStyle = state === 'off' ? '#5a4a3e' : 'rgba(255,240,200,0.25)'; ctx.fillRect(x + 1, y + 1, w - 2, 1);
  ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(x + 1, y + h - 2, w - 2, 1);
  canvasText(ctx, label, x + w / 2, y + Math.round((h - 8) / 2), { color: state === 'off' ? TOK.muted : TOK.cream });
  return r;
}

// Pastilles de couleur (votes, joueurs prêts)
export function pips(ctx, x, y, cols, size = 4) {
  cols.forEach((c, i) => {
    ctx.fillStyle = TOK.ink; ctx.fillRect(x + i * (size + 2) - 1, y - 1, size + 2, size + 2);
    ctx.fillStyle = c; ctx.fillRect(x + i * (size + 2), y, size, size);
  });
}

// ---------------------------------------------------------------- transitions (k : 0 → rien, 1 → plein)
export function fade(ctx, k, col = '10,5,3') {
  if (k <= 0) return;
  ctx.fillStyle = `rgba(${col},${clamp01(k)})`;
  ctx.fillRect(0, 0, W, H);
}
// Fermeture en iris (cercle qui se referme sur cx, cy), à la façon des vieux films
export function iris(ctx, cx, cy, k, col = '#0a0503') {
  if (k <= 0) return;
  const r = (1 - clamp01(k)) * Math.hypot(W, H);
  ctx.save();
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.rect(0, 0, W, H);
  ctx.arc(cx, cy, Math.max(0, r), 0, Math.PI * 2, true);
  ctx.fill('evenodd');
  ctx.restore();
}
// Bandes noires du format cinéma (hauteur max bar)
export function letterbox(ctx, k, bar = 22) {
  const b = Math.round(bar * clamp01(k));
  if (!b) return;
  ctx.fillStyle = TOK.shadow;
  ctx.fillRect(0, 0, W, b);
  ctx.fillRect(0, H - b, W, b);
}
