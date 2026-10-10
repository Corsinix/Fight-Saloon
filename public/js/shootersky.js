// Fusillade : le ciel et le lointain derrière la gare, les abords, la grand-rue et la poursuite, peints comme les décors
// du mode histoire (ciel en bandes tramées d'une ambiance, astre ; chaîne lointaine, buttes et sable du désert de
// story/sets/desert.js). Le ciel est dessiné tel quel ; le lointain passe par le calque teinté de l'ambiance.
import * as S from './sprites.js';
import { W, H } from './worlds.js';
import { skyDeco } from './env.js';
import { bands } from './story/sets/kit.js';
import desert from './story/sets/desert.js';

export const HORIZON = desert.horizon;
const SKY = ['#d4ae7e', '#dcb98a', '#e3c697', '#ebd2a5', '#f0dcb0']; // ciel de midi (comme story/sets.js)
const FAR_W = 720; // assez large pour la parallaxe de la grand-rue (0,12 × 2208 + 384)

// Ciel d'une ambiance (un par ambiance, gardé)
const skies = new Map();
export function skyCanvas(env) {
  const key = env.id || 'midi';
  let c = skies.get(key);
  if (c) return c;
  c = S.makeCanvas(W, H);
  const g = c.getContext('2d');
  bands(g, 0, 0, W, HORIZON + 4, env.sky || SKY);
  skyDeco(env, 0.3, 0.32)(g, 0, 0, W, HORIZON);
  skies.set(key, c);
  return c;
}

// Le lointain : chaîne mauve, buttes, saline et sable (dessiné une fois, sans teinte)
let far = null;
export function farCanvas() {
  if (far) return far;
  far = S.makeCanvas(FAR_W, H);
  const g = far.getContext('2d');
  for (const f of desert.far) {
    const c = S.makeCanvas(FAR_W, H);
    f.draw.call(desert, c.getContext('2d'), FAR_W);
    g.drawImage(c, 0, 0);
    S.freeCanvas(c);
  }
  const c = S.makeCanvas(FAR_W, H);
  desert.back.call(desert, c.getContext('2d'), FAR_W);
  g.drawImage(c, 0, 0);
  S.freeCanvas(c);
  return far;
}

// Ciel sur ctx, puis calque de l'ambiance ouvert avec le lointain décalé de x (parallaxe) : renvoie le calque
export function skyAndFar(ctx, amb, now, x) {
  ctx.drawImage(skyCanvas(amb.env), 0, 0);
  amb.sky(ctx, now);
  const w = amb.begin(ctx);
  w.drawImage(farCanvas(), Math.round(x), 0);
  return w;
}
