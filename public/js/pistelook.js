// Allure des personnages de « La piste » : le petit bonhomme de la mêlée (charSprite) habillé de son armure
// (veste de cuir, cache-poussière, plastron d'acier) et l'arme qu'il tient, dessinée pour chaque arme de la piste.
// Même origine et même échelle que charSprite / weaponSprite : on les remplace un pour un (blit).
import * as S from './sprites.js';
import { outline } from './miniscene.js';
import { charSprite, weaponSprite, Q } from './brawlart.js';

// l'accessoire du corps (charSprite) selon l'arme : étuis pour le colt, carquois pour l'arc, rien pour les fusils
const BODY_KIT = { revolver: 'colts', arc: 'arc' };

// armures, en pixels fins depuis les pieds (comme charSprite : torse -21..-13, bras ±6..9, jambes -10..0)
const ARMOR_DRAW = {
  cuir: (P, back) => {
    const c = '#8a5a30', l = '#a87444', d = '#5a3418';
    if (back) { P(-6, -21, 12, 9, c); P(-6, -21, 12, 1, l); P(0, -20, 1, 7, d); return; }
    P(-6, -21, 4, 9, c); P(2, -21, 4, 9, c);
    P(-3, -21, 1, 9, l); P(2, -21, 1, 9, l); P(-6, -21, 1, 9, l);
    P(-5, -18, 1, 1, '#e0b040'); P(4, -18, 1, 1, '#e0b040'); // boutons de corne
    for (let k = -6; k < 6; k += 2) if (k < -2 || k > 1) P(k, -13, 1, 2, d); // franges
  },
  duster: (P, back) => {
    const c = '#b8a27a', l = '#d4c09a', d = '#8a7652', dd = '#6a5a3e';
    if (back) { P(-7, -21, 14, 20, c); P(-7, -21, 14, 1, l); P(0, -20, 1, 19, d); P(-7, -3, 14, 1, dd); return; }
    P(-6, -21, 4, 9, c); P(2, -21, 4, 9, c); // pans du haut, ouverts sur la chemise
    P(-9, -20, 3, 7, c); P(6, -20, 3, 7, c); P(-9, -20, 1, 7, l); P(8, -20, 1, 7, d); // manches
    P(-5, -22, 3, 2, d); P(2, -22, 3, 2, d); // col relevé
    P(-7, -12, 4, 10, c); P(3, -12, 4, 10, c); // pans longs, jusqu'aux bottes
    P(-7, -12, 1, 10, l); P(6, -12, 1, 10, d); P(-7, -3, 4, 1, dd); P(3, -3, 4, 1, dd);
    P(-3, -21, 1, 9, d); P(2, -21, 1, 9, d);
  },
  plastron: (P, back) => {
    const c = '#a8aeb8', l = '#dce0e8', d = '#6e747e';
    P(-10, -21, 4, 3, c); P(6, -21, 4, 3, c); P(-10, -21, 4, 1, l); P(6, -21, 4, 1, l); // épaulières
    P(-10, -18, 4, 1, d); P(6, -18, 4, 1, d);
    if (back) { P(-5, -20, 10, 8, d); P(-5, -20, 10, 1, c); return; }
    P(-5, -20, 10, 8, c); P(-5, -20, 10, 1, l); P(-5, -20, 1, 8, l); P(4, -20, 1, 8, d);
    P(-1, -19, 2, 7, l); // arête
    P(-4, -13, 8, 1, d);
    for (const [x, y] of [[-4, -18], [3, -18], [-4, -15], [3, -15]]) P(x, y, 1, 1, '#4a4f58'); // rivets
  },
};

const bodyCache = new Map();
// le corps habillé : look (lookOf), wId : arme (WEAPONS), aId : armure (ARMORS) ; back, frame comme charSprite
export function bodySprite(look, wId, aId, back = false, frame = 0) {
  const kit = BODY_KIT[wId] || 'piste';
  const base = charSprite(look, kit, back, frame);
  if (!ARMOR_DRAW[aId]) return base;
  const key = `${look.key}|${kit}|${aId}|${back ? 'b' : 'f'}|${frame}`;
  let c = bodyCache.get(key);
  if (c) return c;
  c = S.makeCanvas(base.width, base.height, true);
  const g = c.getContext('2d');
  g.drawImage(base, 0, 0);
  ARMOR_DRAW[aId]((x, y, w, h, col) => { g.fillStyle = col; g.fillRect(20 + x, 44 + y, w, h); }, back);
  outline(c);
  c.ox = base.ox; c.oy = base.oy;
  bodyCache.set(key, c);
  return c;
}
export const forgetBodies = () => { for (const c of bodyCache.values()) S.freeCanvas?.(c); bodyCache.clear(); gunCache.clear(); };

// ------------------------------------------------------------ armes tenues (pointées vers la droite, crosse à l'origine)
const GUN_DRAW = {
  // carabine à levier : laiton, tube magasin sous le canon, levier en boucle
  winchester: (P) => {
    P(-6, 0, 8, 4, '#7a4a24'); P(-6, 0, 8, 1, '#a8703c'); P(-6, 3, 3, 1, '#5a3418');
    P(2, -1, 6, 4, '#c0a040'); P(2, -1, 6, 1, '#f0d878');
    P(3, 3, 4, 1, '#3a3a40'); P(3, 3, 1, 3, '#3a3a40'); P(6, 3, 1, 3, '#3a3a40'); P(3, 5, 4, 1, '#3a3a40');
    P(8, -1, 15, 2, '#4a4a52'); P(8, -1, 15, 1, '#a0a0a8');
    P(8, 1, 12, 1, '#2e2e34'); P(8, 1, 6, 2, '#8a5a30');
    P(21, -2, 1, 1, '#c0a040');
  },
  // fusil de chasse à deux coups : court, deux canons superposés
  fusil: (P) => {
    P(-6, 0, 9, 4, '#6a4428'); P(-6, 0, 9, 1, '#8a5c38'); P(-6, 3, 4, 1, '#4a2e18');
    P(3, -2, 4, 5, '#5a5a62'); P(3, -2, 4, 1, '#9a9aa2');
    P(7, -2, 13, 2, '#5a5a62'); P(7, -2, 13, 1, '#b0b0b8');
    P(7, 0, 13, 2, '#3a3a40'); P(7, 1, 13, 1, '#2a2a2e');
    P(8, 2, 6, 2, '#8a5c38');
    P(19, -2, 1, 4, '#1a1a1e');
  },
  // Sharps : long canon lourd, hausse à vernier sur la crosse
  sharps: (P) => {
    P(-7, 0, 10, 4, '#5a3418'); P(-7, 0, 10, 1, '#7a4a24'); P(-7, 3, 4, 1, '#3a2010');
    P(3, -1, 6, 4, '#3a3a40'); P(3, -1, 6, 1, '#7a7a82');
    P(4, -4, 1, 3, '#2a2a2e'); P(3, -5, 3, 1, '#2a2a2e');
    P(9, -1, 22, 2, '#3e3e46'); P(9, -1, 22, 1, '#9a9aa2');
    P(9, 1, 9, 2, '#6a4428');
    P(30, -2, 1, 1, '#c8c8d0');
  },
};
const gunCache = new Map();
function gunBase(id) {
  const c = S.makeCanvas(48, 32, true), g = c.getContext('2d');
  GUN_DRAW[id]((x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x + 10, y + 16, w, h); });
  c.px = 10; c.py = 16;
  return c;
}
// l'arme d'une arme de la piste, tournée de l'angle a (32 crans, plus proche voisin), comme weaponSprite
export function gunSprite(wId, a) {
  if (!GUN_DRAW[wId]) return weaponSprite(wId === 'arc' ? 'arc' : wId === 'revolver' ? 'colts' : 'couteau', a);
  const steps = 32;
  const k = ((Math.round((a / (Math.PI * 2)) * steps) % steps) + steps) % steps;
  const key = `${wId}|${k}`;
  let c = gunCache.get(key);
  if (c) return c;
  const src = gunBase(wId);
  const sd = src.getContext('2d').getImageData(0, 0, src.width, src.height).data;
  const ang = (k / steps) * Math.PI * 2, flip = Math.cos(ang) < 0;
  const D = 72;
  c = S.makeCanvas(D, D, true);
  const g = c.getContext('2d'), img = g.createImageData(D, D);
  const ca = Math.cos(-ang), sa = Math.sin(-ang);
  for (let y = 0; y < D; y++) for (let x = 0; x < D; x++) {
    const dx = x - D / 2 + 0.5, dy = y - D / 2 + 0.5;
    const sx = Math.round(dx * ca - dy * sa + src.px - 0.5);
    let sy = dx * sa + dy * ca;
    if (flip) sy = -sy;
    sy = Math.round(sy + src.py - 0.5);
    if (sx < 0 || sy < 0 || sx >= src.width || sy >= src.height) continue;
    const i = (sy * src.width + sx) * 4, o = (y * D + x) * 4;
    if (!sd[i + 3]) continue;
    img.data[o] = sd[i]; img.data[o + 1] = sd[i + 1]; img.data[o + 2] = sd[i + 2]; img.data[o + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  outline(c);
  c.ox = D / 2 / Q; c.oy = D / 2 / Q;
  gunCache.set(key, c);
  return c;
}
