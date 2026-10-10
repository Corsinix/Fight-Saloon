// Un décor du mode histoire (story/sets/*.js : Boot Hill, la Bouche de l'Enfer…) dessiné en fond d'un mini-jeu, quand
// l'épisode le demande (hooks.story.deco). Les décors sont chargés à la demande (import()) : hors histoire, rien
// n'est chargé ni changé. En mode histoire, ils sont déjà en mémoire (le lecteur de cinématiques s'en sert).
import * as S from './sprites.js';
import { W, H } from './worlds.js';

let mod = null, loading = null;
export function loadSets() {
  if (mod) return Promise.resolve(mod);
  return (loading ||= import('./story/sets.js').then((m) => (mod = m), (e) => { loading = null; throw e; }));
}
export const setsReady = () => !!mod;

const NOFX = new Set();
const layers = [null, null], tinted = [null, null];
function layer(k) {
  const c = (layers[k] ||= S.makeCanvas(W, H)), g = c.getContext('2d');
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, W, H);
  g.imageSmoothingEnabled = false;
  return g;
}
function flush(ctx, k, col) {
  tinted[k] = S.tintCanvas(layers[k], col, tinted[k] || S.makeCanvas(W, H));
  ctx.drawImage(tinted[k], 0, 0);
}

// Le décor id vu depuis cam (x du bord gauche), remonté de -dy pixels si dy < 0, avec l'ambiance amb (Ambience de
// la scène) : ciel, lointain, fond et ses animations, lumières, puis les personnages du jeu (actors(g), dessinés sur
// le calque des acteurs, teinté un peu plus clair comme dans les cinématiques), les accessoires du décor
// (devant ceux dont la profondeur dépasse front), et les lueurs. Renvoie false si les décors ne sont pas chargés.
export function drawSet(ctx, id, cam, amb, now, { dy = 0, fx = NOFX, actors = null, front = H } = {}) {
  if (!mod) return false;
  const set = mod.getSet(id), def = set.def, env = amb.env;
  cam = Math.round(cam);
  if (def.outdoor) {
    ctx.drawImage(mod.skyFor(env, def.horizon), 0, dy);
    amb.sky(ctx, now);
  }
  const tint = def.outdoor ? env.tint : env.inside;
  const fk = tint ? amb.flash(now) : 0;
  const tcol = tint && (fk ? S.mix(tint, '#ffffff', 0.75 * fk) : tint);
  let g = tint ? layer(0) : ctx;
  for (const f of set.far) g.drawImage(f.c, -Math.round(cam * f.k), dy);
  g.drawImage(set.back, -cam, dy);
  g.save();
  g.translate(-cam, dy);
  def.anim?.call(def, g, now, fx, now, now);
  g.restore();
  if (tint) flush(ctx, 0, tcol);
  amb.tint = tint || null;
  ctx.save();
  ctx.translate(-cam, dy);
  for (const L of set.lights) {
    if (L.length === 4) amb.window(ctx, L[0], L[1], L[2], L[3]);
    else amb.glow(ctx, L[0], L[1], L[2]);
  }
  def.light?.call(def, ctx, now, fx, now);
  ctx.restore();
  // personnages et accessoires, sur le second calque
  g = tint ? layer(1) : ctx;
  const props = set.props.filter((p) => p.x - cam < W && p.x + p.c.width - cam > 0);
  const drawProps = (back) => {
    for (const p of props) if ((p.y + dy <= front) === back) g.drawImage(p.c, p.x - cam, p.top + dy);
  };
  drawProps(true);
  actors?.(g);
  drawProps(false);
  if (tint) flush(ctx, 1, S.mix(tcol, '#ffffff', 0.32));
  if (tint && env.haze) { ctx.fillStyle = env.haze; ctx.fillRect(0, 0, W, H); }
  ctx.save();
  ctx.translate(-cam, dy);
  def.glow?.call(def, ctx, now, fx, cam);
  ctx.restore();
  return true;
}
