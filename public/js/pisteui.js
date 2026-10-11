// Kit d'interface de « La piste », façon Pathway : cadres sombres à liseré d'or fin, onglets de titre, infobulles
// (titre en Silkscreen, corps en texte fin), barres de PV et d'armure chiffrées, tuiles d'action à icône.
// La scène dessine en ×4 : les filets d'un demi-pixel du jeu restent nets. Le texte fin vient de pistetype.js.
import { W, H } from './worlds.js';
import { hd, hdW, hdWrap, hdFit, HD_LH } from './pistetype.js';
import { txt, textW, fitText, drawIcon } from './pisteart.js';
import { hasItemArt, drawItem } from './pisteicons.js';

export const UI = {
  bg: 'rgba(22,14,9,0.96)', bg2: '#2a1c12', bg3: '#36251a', edge: '#0a0604', line: '#6a4a26', lineHi: '#a8803e',
  gold: '#d8b050', goldHi: '#f8d070', cream: '#f2e6c8', dim: '#a8987c', faint: '#6e604e',
  red: '#e8604c', green: '#9ad060', blue: '#7ab0f0', steel: '#b8c0cc', orange: '#f0a040',
};

// ------------------------------------------------------------ casse : les phrases en majuscules redeviennent lisibles
// Les textes de l'interface sont écrits en capitales (la police Silkscreen n'a pas de minuscules) ; en texte fin,
// on les remet en casse de phrase, en gardant les noms propres et les sigles.
const PROPER = ['El Diablo', 'Dusty Gulch', 'Comanches', 'Jesse Cole', 'Doc Holloway', 'Big Martha', 'Révérend Cain', 'Tala',
  'Rosita Vargas', 'Silas Crow', "Sergent O'Malley", "O'Malley", 'Martha', 'Rosita', 'Silas', 'Jesse', 'Doc', 'Cain', 'Pinkerton'];
const KEEP = new Set(['PV', 'XP', 'KO', 'TAB', 'PA']);
const softCache = new Map();
export function soft(str) {
  str = String(str);
  if (softCache.has(str)) return softCache.get(str);
  // morceau par morceau (séparés par « - ») ; dans chacun, les mots en capitales passent en minuscules (sauf les
  // sigles), même au milieu d'un texte déjà en casse mixte (« FEU ROULANT (2 CRAN) : Touche… »)
  const parts = str.split(/\s+-\s+/).map((part) => {
    let p = part.replace(/[A-ZÀ-ÖØ-Þ'][A-ZÀ-ÖØ-Þ'’-]+|(?<![A-Za-zÀ-ÿ(])[A-ZÀ-Þ](?=\s)/g, (w) => (KEEP.has(w) ? w : w.toLowerCase()));
    p = p.replace(/(^|[.!?]\s+|«\s?)([a-zà-ÿ])/g, (m, a, b) => a + b.toUpperCase()); // début de phrase
    for (const n of PROPER) p = p.replace(new RegExp(`(^|[^a-zà-ÿ])${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![a-zà-ÿ])`, 'gi'), (m, a) => a + n);
    // les touches entre parenthèses : « (R) », « (V) »
    return p.replace(/\(([a-zé])\)/g, (m, k) => `(${k.toUpperCase()})`);
  });
  const s = parts.join('  ·  ');
  if (softCache.size > 600) softCache.clear();
  softCache.set(str, s);
  return s;
}

// ------------------------------------------------------------ cadres
// un cadre sombre à liseré d'or ; title : onglet de titre en haut à gauche ; accent : couleur du liseré
export function frame(ctx, x, y, w, h, { title = '', accent = UI.line, fill = UI.bg, titleCol = UI.goldHi } = {}) {
  ctx.fillStyle = UI.edge; ctx.fillRect(x - 0.5, y - 0.5, w + 1, h + 1);
  ctx.fillStyle = fill; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = accent;
  ctx.fillRect(x + 1, y + 1, w - 2, 0.5); ctx.fillRect(x + 1, y + h - 1.5, w - 2, 0.5);
  ctx.fillRect(x + 1, y + 1, 0.5, h - 2); ctx.fillRect(x + w - 1.5, y + 1, 0.5, h - 2);
  // les coins, en équerres claires
  ctx.fillStyle = UI.lineHi;
  for (const [cx, cy, sx, sy] of [[x + 1, y + 1, 1, 1], [x + w - 1.5, y + 1, -1, 1], [x + 1, y + h - 1.5, 1, -1], [x + w - 1.5, y + h - 1.5, -1, -1]]) {
    ctx.fillRect(sx > 0 ? cx : cx - 2.5, cy, 3, 0.5); ctx.fillRect(cx, sy > 0 ? cy : cy - 2.5, 0.5, 3);
  }
  if (title) {
    const tw = textW(title) + 10;
    ctx.fillStyle = UI.edge; ctx.fillRect(x + 5.5, y - 4.5, tw + 1, 10);
    ctx.fillStyle = UI.bg3; ctx.fillRect(x + 6, y - 4, tw, 9);
    ctx.fillStyle = accent; ctx.fillRect(x + 6, y - 4, tw, 0.5);
    txt(ctx, title, x + 11, y - 2, titleCol);
  }
}

// un filet de séparation
export function rule(ctx, x, y, w, col = UI.line) { ctx.fillStyle = col; ctx.fillRect(x, y, w, 0.5); }

// ------------------------------------------------------------ infobulles
// title (facultatif) en Silkscreen, body en texte fin (casse de phrase) ; ancrée près de (ax, ay), dans l'écran
// au-dessus (prefer 'up') ou à droite ('right') ; zone : { top, bottom } à ne pas dépasser
// ah : hauteur de l'élément survolé (au-dessus s'il y a la place, sinon juste dessous, sans le cacher)
export function tooltip(ctx, ax, ay, title, body, { maxW = 196, prefer = 'up', top = 2, bottom = H - 2, col = UI.cream, titleCol = UI.goldHi, lines: extra = [], right = null, ah = 12 } = {}) {
  const bodyLines = body ? hdWrap(soft(body), maxW - 10) : [];
  const tW = (title ? textW(title) : 0) + (right ? textW(right.text) + 10 : 0);
  const w = Math.min(maxW, Math.max(tW, ...bodyLines.map((l) => hdW(l)), ...extra.map(([l]) => hdW(l)), 30) + 10);
  const h = (title ? 11 : 3) + (bodyLines.length + extra.length) * HD_LH + 3;
  let x, y;
  if (prefer === 'right') { x = ax + 10; y = ay - h / 2; if (x + w > W - 2) x = ax - w - 10; }
  else if (prefer === 'left') { x = ax - w - 6; y = ay - h / 2; if (x < 2) x = ax + 6; }
  else { x = ax - w / 2; y = ay - h - 3; if (y < top) y = ay + ah + 3; }
  x = Math.max(2, Math.min(W - w - 2, x));
  y = Math.max(top, Math.min(bottom - h, y));
  frame(ctx, x, y, w, h, { accent: UI.lineHi });
  let cy = y + 3;
  // la valeur à droite du titre (chance de toucher…)
  if (right) txt(ctx, right.text, x + w - 5, cy, right.col || UI.goldHi, 'right');
  if (title) { txt(ctx, fitText(title, w - 8 - (right ? textW(right.text) + 8 : 0)), x + 5, cy, titleCol); cy += 11; }
  bodyLines.forEach((l) => { hd(ctx, l, x + 5, cy, col); cy += HD_LH; });
  extra.forEach(([l, c]) => { hd(ctx, l, x + 5, cy, c || col); cy += HD_LH; });
  return { x, y, w, h };
}

// une aide « TITRE : texte » coupée en deux
export function splitTip(tip) {
  const s = String(tip), i = s.indexOf(' : ');
  if (i > 0 && i < 34) return [s.slice(0, i), s.slice(i + 3)];
  return ['', s];
}

// ------------------------------------------------------------ barres
// barre de PV : verte, orange sous 50 %, rouge sous 30 % ; les chiffres en texte fin à droite
export function hpBar(ctx, x, y, w, hp, max, { h = 5, label = true } = {}) {
  const k = max ? Math.max(0, Math.min(1, hp / max)) : 0;
  const col = k > 0.5 ? '#78b848' : k > 0.3 ? '#e0a030' : '#d84a34';
  ctx.fillStyle = UI.edge; ctx.fillRect(x - 0.5, y - 0.5, w + 1, h + 1);
  ctx.fillStyle = '#2a120c'; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = col; ctx.fillRect(x, y, w * k, h);
  ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.fillRect(x, y, w * k, 1);
  // graduations tous les 10 PV
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  if (max > 10) for (let v = 10; v < max; v += 10) ctx.fillRect(x + (w * v) / max, y + h - 1.5, 0.5, 1.5);
  if (label) hd(ctx, `${hp}/${max}`, x + w - 1, y - 0.5, UI.cream, 'right');
}
// barre d'armure, fine et acier
export function armBar(ctx, x, y, w, arm, max) {
  ctx.fillStyle = UI.edge; ctx.fillRect(x - 0.5, y - 0.5, w + 1, 3);
  ctx.fillStyle = '#1e2026'; ctx.fillRect(x, y, w, 2);
  if (max) { ctx.fillStyle = UI.steel; ctx.fillRect(x, y, (w * arm) / max, 2); }
}

// ------------------------------------------------------------ tuiles d'action
// st : '' (prête), 'off' (impossible), 'on' (survolée), 'sel' (visée en cours) ; key : raccourci ; cost : cran
// une case de la barre d'action : un puits carré biseauté (l'icône détaillée), la touche en médaillon dans le coin,
// le coût en flammes de cran au-dessus, les utilisations restantes en bas à droite et le nom sous la case
export function actionTile(ctx, x, y, w, h, { icon, label, key = '', cost = 0, st = '', badge = '', haveCran = 99, now = 0 }) {
  const off = st === 'off', sel = st === 'sel', on = st === 'on';
  const s = h - 9, bx = Math.round(x + (w - s) / 2), by = y + 1;
  if (!label) {
    // case vide : un creux à peine marqué
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(bx, by, s, s);
    ctx.fillStyle = '#2a1e14'; ctx.fillRect(bx, by + s - 0.5, s, 0.5);
    return;
  }
  // l'ombre portée, le liseré sombre, le biseau (clair en haut à gauche, sombre en bas à droite)
  ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(bx + 0.5, by + 1, s, s);
  ctx.fillStyle = UI.edge; ctx.fillRect(bx - 0.5, by - 0.5, s + 1, s + 1);
  const pulse = sel ? 0.5 + 0.5 * Math.sin(now / 180) : 0;
  const hi = sel ? (pulse > 0.5 ? '#fff0b0' : UI.goldHi) : on ? '#f0d49a' : off ? '#4a3a2c' : '#a07c4c';
  const lo = sel ? '#8a6420' : on ? '#9a7444' : off ? '#2a2018' : '#5a3e24';
  ctx.fillStyle = lo; ctx.fillRect(bx, by, s, s);
  ctx.fillStyle = hi; ctx.fillRect(bx, by, s, 0.5); ctx.fillRect(bx, by, 0.5, s);
  ctx.fillStyle = sel ? '#5a3c12' : on ? '#46301e' : off ? '#16100b' : '#261a11';
  ctx.fillRect(bx + 1, by + 1, s - 2, s - 2);
  // le fond du puits : une lueur douce en haut, l'ombre en bas
  ctx.fillStyle = off ? 'rgba(255,230,180,0.02)' : 'rgba(255,226,170,0.07)'; ctx.fillRect(bx + 1, by + 1, s - 2, (s - 2) * 0.45);
  ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(bx + 1, by + s - 3.5, s - 2, 2.5);
  if (sel || on) { ctx.fillStyle = sel ? 'rgba(255,210,110,0.16)' : 'rgba(255,220,160,0.08)'; ctx.fillRect(bx + 1, by + 1, s - 2, s - 2); }
  // l'icône détaillée (grisée si l'action est impossible)
  if (icon) {
    const size = s - 5 + (on || sel ? 1 : 0);
    if (!(hasItemArt(icon) && drawItem(ctx, icon, bx + s / 2, by + s / 2 + 0.5, size, { off }))) {
      ctx.globalAlpha = off ? 0.4 : 1; drawIcon(ctx, icon, bx + s / 2, by + s / 2, null, 2); ctx.globalAlpha = 1;
    }
  }
  // la touche, en médaillon dans le coin haut gauche
  if (key) {
    const kw = Math.max(6, hdW(key) + 3);
    ctx.fillStyle = UI.edge; ctx.fillRect(bx - 1.5, by - 1.5, kw + 1, 8);
    ctx.fillStyle = off ? '#2a2018' : sel ? '#c89a3a' : '#e8d4a0'; ctx.fillRect(bx - 1, by - 1, kw, 7);
    hd(ctx, key, bx - 1 + kw / 2, by - 0.5, off ? '#7e705c' : '#2a1608', 'center', '');
  }
  // le coût : des flammes de cran au-dessus du coin droit (éteintes si le cran manque)
  for (let k = 0; k < cost; k++) {
    const fx = bx + s - 3 - k * 3.5, fy = by + 1.5, ok = k < haveCran && !off;
    ctx.fillStyle = UI.edge; ctx.fillRect(fx - 0.5, fy - 0.5, 3, 4);
    ctx.fillStyle = ok ? '#e0602a' : '#4a3020'; ctx.fillRect(fx, fy, 2, 3);
    ctx.fillStyle = ok ? '#ffd24a' : '#5a4030'; ctx.fillRect(fx + 0.5, fy + 1.5, 1, 1.5);
    if (ok) { ctx.fillStyle = '#fff4c0'; ctx.fillRect(fx + 0.5, fy, 1, 0.5); }
  }
  // les utilisations restantes
  if (badge) hd(ctx, badge, bx + s - 1, by + s - 7, off ? UI.faint : UI.goldHi, 'right');
  // le nom, sous la case
  hd(ctx, hdFit(label, w + 2), x + w / 2, by + s + 1.5, off ? '#7e705c' : sel ? UI.goldHi : on ? '#fff4d8' : UI.cream, 'center');
}

// une étiquette arrondie (états, talents)
export function pill(ctx, x, y, text, col = UI.cream, bg = UI.bg3) {
  const w = hdW(text) + 5;
  ctx.fillStyle = UI.edge; ctx.fillRect(x - 0.5, y - 0.5, w + 1, 8);
  ctx.fillStyle = bg; ctx.fillRect(x, y, w, 7);
  hd(ctx, text, x + 2.5, y + 1, col, 'left', '');
  return w;
}
