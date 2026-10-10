// Décors du mode histoire dans les mini-jeux « routes et arènes » (course, roulotte, mine, pinte, bagarre, lasso).
// Quand un épisode impose un décor (hooks.story.deco, voir story/decos/routes.js), la scène du mini-jeu charge ce
// module à la demande (import()) et dessine le lieu de l'histoire : l'hippodrome de Red Rock, la Grande Prairie,
// les gorges du canyon, la route de la mission, la galerie huit du Vieux Joe, Le Dernier Verre, l'arène…
// Hors histoire, rien de tout ça n'est chargé : les mini-jeux restent tels quels.
// Tout ce qui est fixe est peint une fois dans des canvas hors écran (avec les outils des décors du mode histoire,
// story/sets/kit*.js) ; par image, on ne fait que les recopier, plus quelques petites animations.
import * as S from './sprites.js';
import { canvasText } from './scene.js';
import { textW } from './uikit.js';
import { W, H } from './worlds.js';
import { skyDeco } from './env.js';
import { R, O, bands, rnd } from './story/sets/kit.js';
import { signboard } from './story/sets/kit-ville.js';
import { P, Pix, hex, ramp, fbm, vnoise, range, wall, sow, bush, cottonwood, boulder, juniper, tuft } from './story/sets/kit-nature.js';

const OUT = S.OUT;
const rd = Math.round;
const clamp01 = (k) => (k < 0 ? 0 : k > 1 ? 1 : k);
const hash = (n) => {
  let t = (n * 0x6d2b79f5) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

// ---------------------------------------------------------------- outils communs
// Les enseignes sont peintes une fois pour toutes : on attend d'abord la police pixel (et sa tranche des lettres
// accentuées), sinon la police de secours resterait figée dans les canvas.
async function fontsReady() {
  try { await document.fonts.load('8px Silkscreen', 'AZÉÈÀÇÙÎÔŒ’!$09'); } catch { /* police de secours */ }
}

// Ciel d'une ambiance (bandes tramées, soleil ou lune et étoiles) jusqu'à l'horizon, sur h lignes
export function skyCanvas(env, h, horizon, sunX = 0.74, sunY = 0.3) {
  const c = S.makeCanvas(W, h), g = c.getContext('2d');
  bands(g, 0, 0, W, Math.min(h, horizon + 4), env.sky || ['#d4ae7e', '#dcb98a', '#e3c697', '#ebd2a5', '#f0dcb0']);
  skyDeco(env, sunX, sunY)(g, 0, 0, W, horizon);
  return c;
}

// Le lointain d'un décor du mode histoire (story/sets/<id>.js) : ses calques « far », peints une fois.
// Ils sont recopiés à l'horizon du mini-jeu (décalage hz - horizon du décor) et défilent avec la progression.
async function setFar(id) {
  const def = (await import(`./story/sets/${id}.js`)).default;
  const w = Math.max(W, def.w || W);
  return { hz: def.horizon, layers: (def.far || []).map((f) => {
    const fw = rd(W + (w - W) * f.k);
    const c = S.makeCanvas(fw, H, true);
    f.draw.call(def, c.getContext('2d', { willReadFrequently: true }), fw);
    return c;
  }) };
}

// Calque peint au pixel (Pix des décors) : draw(Pp, w, h)
function painted(w, h, draw) {
  const c = S.makeCanvas(w, h, true);
  const g = c.getContext('2d', { willReadFrequently: true });
  const Pp = new Pix(g);
  draw(Pp, w, h, g);
  Pp.put();
  return c;
}

// Panorama : des calques larges qui défilent de leur bord gauche à leur bord droit pendant la partie (p de 0 à 1)
function panorama(layers) {
  return (ctx, p) => {
    for (const [c, y] of layers) ctx.drawImage(c, -rd((c.width - W) * clamp01(p)), y);
  };
}

// Enseigne peinte (planches à double filet) dans son propre canvas, avec ses deux poteaux s'il en faut
function board(text, { bg = '#5a3a22', fg = '#f8d070', frame = '#c8a050', posts = 0, h = 13, pad = 6 } = {}) {
  const w = textW(text) + pad * 2 + 2;
  const c = S.makeCanvas(w + 4, h + 3 + posts);
  const g = c.getContext('2d');
  if (posts) for (const x of [5, w - 4]) { R(g, x - 1, h, 4, posts + 1, OUT); R(g, x, h, 2, posts, '#5a3a22'); R(g, x, h, 1, posts, '#7a5232'); }
  signboard(g, (w + 4) / 2, 1, text, { bg, fg, frame, pad, h });
  return c;
}
const blitC = (ctx, c, cx, y) => ctx.drawImage(c, rd(cx - c.width / 2), rd(y));

// ---------------------------------------------------------------- la ville de Red Rock, au loin
// Adobe ocre aux poutres saillantes, fausses façades de planches, l'église, le château d'eau, l'arche « RED ROCK »
// (d'après story/sets/redrock.js), posés sur la ligne base d'un canvas transparent.
function redrockTown(g, x0, base, lit) {
  const win = lit ? '#f8d070' : '#2a2a30';
  const town = [[0, 22, 13, 'a'], [24, 30, 18, 'f'], [56, 20, 11, 'a'], [78, 26, 22, 'c'], [106, 34, 16, 'f'], [142, 22, 12, 'a'],
    [166, 28, 20, 'f'], [196, 16, 26, 'e'], [214, 30, 14, 'a'], [246, 18, 17, 'f']];
  for (const [dx, bw, bh, k] of town) {
    const x = x0 + dx;
    if (k === 'a') {
      O(g, x, base, [[0, -bh, bw, bh, '#c89670']]);
      R(g, x, base - bh, bw, 1, '#e0b48a'); R(g, x + bw - 3, base - bh, 3, bh, '#a8764e');
      for (let p = 3; p < bw - 2; p += 5) R(g, x + p, base - bh + 2, 2, 1, '#4a2a18');
      R(g, x + 4, base - 6, 3, 6, '#3a2018'); R(g, x + bw - 10, base - bh + 5, 3, 3, win);
    } else if (k === 'f') {
      O(g, x, base, [[0, -bh, bw, bh, '#8a5a3a'], [2, -bh - 4, bw - 4, 4, '#8a5a3a']]);
      for (let p = x + 2; p < x + bw; p += 3) R(g, p, base - bh - 3, 1, bh + 3, '#7a4e32');
      R(g, x + 2, base - bh - 4, bw - 4, 1, '#a87650');
      R(g, x - 1, base - 8, bw + 2, 2, '#5a3a24'); R(g, x + 1, base - 6, 1, 6, '#5a3a24'); R(g, x + bw - 2, base - 6, 1, 6, '#5a3a24');
      R(g, x + 4, base - bh + 3, 4, 3, win); R(g, x + bw - 8, base - bh + 3, 4, 3, win);
    } else if (k === 'c') {
      O(g, x, base, [[0, -bh, bw, bh, '#d8c0a0'], [bw / 2 - 4, -bh - 10, 8, 10, '#d8c0a0']]);
      R(g, x + bw / 2 - 1, base - bh - 15, 2, 5, '#5a3a24'); R(g, x + bw / 2 - 3, base - bh - 13, 6, 1, '#5a3a24');
      R(g, x + bw / 2 - 2, base - bh - 7, 4, 4, '#3a2a2a'); R(g, x + bw / 2 - 3, base - 8, 6, 8, '#4a2a18');
      R(g, x + bw - 4, base - bh, 4, bh, '#b89e80');
    } else {
      O(g, x, base, [[1, -bh + 9, 2, bh - 9, '#5a3a24'], [bw - 3, -bh + 9, 2, bh - 9, '#5a3a24'], [0, -bh, bw, 10, '#7a5232'], [-1, -bh - 2, bw + 2, 2, '#5a3a24']]);
      for (let p = x + 2; p < x + bw; p += 3) R(g, p, base - bh, 1, 10, '#6a4428');
      R(g, x, base - bh + 3, bw, 1, '#3a3a42');
    }
  }
  // l'arche de l'entrée de la ville
  const ax = x0 + 276;
  O(g, ax, base - 27, [[0, 0, 2, 27, '#5a3a22'], [60, 0, 2, 27, '#5a3a22'], [-2, 0, 66, 9, '#8a6038']]);
  R(g, ax - 2, base - 27, 66, 1, '#b08458');
  canvasText(g, 'RED ROCK', ax + 31, base - 26, { color: '#f0dca0', shadow: '' });
}

// Poteaux du télégraphe et leurs fils, le long d'une ligne (base), tous les pas px
function telegraph(g, w, base, step = 72, h = 26) {
  for (let x = 18; x < w; x += step) {
    O(g, x, base, [[0, -h, 2, h, '#5a3a24'], [-4, -h + 2, 10, 2, '#5a3a24']]);
    R(g, x, base - h - 2, 1, h, '#7a5232');
  }
  for (let x = 18; x < w - step; x += step) for (let k = 0; k < step; k++) R(g, x + 1 + k, base - h - 1 + rd(Math.sin((k / step) * Math.PI) * 3), 1, 1, '#2a2020');
}

// Petite vache du lointain (5 px de haut), robe au choix
function farCow(g, x, y, coat, dir = 1) {
  R(g, x - 1, y - 5, 9, 4, OUT); R(g, x + (dir > 0 ? 7 : -3), y - 6, 4, 3, OUT);
  R(g, x, y - 4, 7, 2, coat); R(g, x + (dir > 0 ? 8 : -2), y - 5, 2, 2, coat);
  R(g, x, y - 2, 1, 2, OUT); R(g, x + 5, y - 2, 1, 2, OUT);
  if (coat === '#e8dcc8') R(g, x + 2, y - 4, 2, 1, '#3a2c26');
}

// ---------------------------------------------------------------- la course
// deco.set : 'redrock' (l'hippodrome de Red Rock), 'prairie' (la Grande Prairie, arrivée au gué),
// 'gorges' (les gorges rouges du canyon, arrivée vers l'hacienda). Renvoie de quoi remplacer le lointain,
// la lisière et l'arrivée ; course.js et coursewild.js gardent leur dessin habituel pour tout le reste.
const COURSE_HZ = 97; // pied du lointain (l'herbe de la lisière commence à 96)

export async function courseDeco(deco, env) {
  await fontsReady();
  const lit = !!env.lights;
  const d = { set: deco.set, sky: skyCanvas(env, 110, COURSE_HZ, 0.75, 0.3) };
  if (deco.set === 'redrock') {
    // l'hippodrome de Red Rock : les buttes et les aiguilles de grès, la ville au bout de la ligne de chemin de fer
    const far = await setFar('redrock');
    const town = S.makeCanvas(820, 64);
    const tg = town.getContext('2d');
    telegraph(tg, 820, 62, 90, 22);
    redrockTown(tg, 120, 63, lit);
    d.far = panorama([...far.layers.map((c) => [c, COURSE_HZ - far.hz - 1]), [town, COURSE_HZ - 63]]);
    // enseignes des tribunes et panneaux le long de la lice (peintes une fois)
    d.signs = {
      start: board('HIPPODROME DE RED ROCK', { bg: '#7a1a14', fg: '#fdf6e0', frame: '#f8d070' }),
      finish: board('GRAND PRIX DE RED ROCK', { bg: '#2a2622', fg: '#f8d070', frame: '#c8a050' }),
    };
    const ads = ['LE DERNIER VERRE', 'RED ROCK MERCANTILE', 'BANQUE DE RED ROCK', 'GRAND PRIX 1878', 'L’ARÈNE : SAMEDI', 'RED ROCK EXPRESS'];
    d.ads = ads.map((t, i) => board(t, { bg: ['#eadcb0', '#2a3a4a', '#4a2a1a'][i % 3], fg: ['#7a1a14', '#f4ecd8', '#f8d070'][i % 3], frame: ['#8a5a34', '#c8a050', '#c8a050'][i % 3], posts: 9, h: 11, pad: 4 }));
    return d;
  }
  if (deco.set === 'gorges') {
    // les gorges rouges : le rebord du plateau et l'aiguille jumelle (story/sets/canyon.js), puis la grande paroi
    // proche, ses corniches, et les sentinelles d'El Diablo postées sur les crêtes
    const far = await setFar('canyon');
    const near = painted(W + 520, 100, (Pp, w) => {
      const top = (x) => 44 + rd(fbm(x / 60, 2, 61, 3) * 28) + (Math.sin(x / 47) > 0.6 ? 9 : 0) - (x % 260 < 34 ? 12 : 0);
      wall(Pp, { top, bot: () => 100, R: P.grès, lit: 5.8, band: 8, haze: 0.06, hcol: hex('#3a2430'), seed: 62, warp: 3 });
      // éboulis au pied de la paroi
      sow(Pp, { y0: 88, y1: 100, n: 60, seed: 63, make: (dd, s) => (s % 3 ? boulder(1 + rd(dd * 2), s, P.talus) : bush(1, s, P.sauge)) });
    });
    // les sentinelles : postes de guet sur la crête (x dans le calque proche), avec leur feu
    const posts = [];
    const ng = near.getContext('2d');
    for (const x of [90, 330, 560, 760]) {
      let y = 0;
      const img = ng.getImageData(x, 0, 1, 100).data;
      while (y < 99 && !img[y * 4 + 3]) y++;
      // un homme au fusil, un sombrero, debout sur le rebord
      R(ng, x - 2, y - 13, 6, 14, OUT); R(ng, x - 4, y - 14, 10, 2, OUT);
      R(ng, x - 1, y - 9, 4, 8, '#2a2226'); R(ng, x, y - 12, 2, 3, '#8a5a3a'); R(ng, x - 3, y - 13, 8, 1, '#1e1a1c');
      R(ng, x + 3, y - 15, 1, 8, '#3a3236'); // le fusil
      posts.push([x + 10, y]);
    }
    d.posts = posts;
    d.near = near;
    const layers = [...far.layers.map((c) => [c, COURSE_HZ - far.hz - 1])];
    const pan = panorama(layers);
    d.far = (ctx, p, now) => {
      pan(ctx, p);
      const x0 = -rd((near.width - W) * clamp01(p));
      ctx.drawImage(near, x0, COURSE_HZ - 100);
      // les feux des sentinelles vacillent
      for (const [x, y] of posts) {
        const sx = x0 + x, sy = COURSE_HZ - 100 + y;
        if (sx < -6 || sx > W + 6) continue;
        const f = Math.floor(now / 120 + x) % 3;
        R(ctx, sx - 2, sy - 1, 5, 2, '#3a2416');
        R(ctx, sx - 1, sy - 4 - f, 3, 3 + f, '#f0a040'); R(ctx, sx, sy - 3 - f, 1, 2, '#fff0a0');
      }
    };
    // la lisière d'éboulis rouges, la gorge au sable rouge
    d.pal = { edge: '#8a4a2e', edgeTop: '#a85a36', edgeDisc: ['#7a4a30', '#6a3a26'], edgeDash: '#5a2e1e',
      field: '#c07848', fieldLine: '#8a4a2e', fieldLine2: '#d08a58', path: '#d4a070', pathEdge: '#b88050', pathDot: '#9a6a44',
      tuft: '#7a5a34', flower: ['#f0d060', '#d8c8b8'], stem: '#6a6a3a', post: '#c8a070' };
    d.goal = "VERS L'HACIENDA";
    d.arrival = gorgeExit();
    return d;
  }
  // 'prairie' : la Grande Prairie au nord du ranch McCoy — la chaîne lointaine (les montagnes de la mine), les
  // collines d'herbe dorée, la ligne des peupliers de la rivière ; à l'arrivée, le gué
  const loin = ramp('6a6a8a 7a7896 8a86a0 9a94a8 aaa2ae bab0b4');
  const hills = ramp('6a5a2c 806c34 98823e ac9648 c0a856 d0ba68');
  const mtn = painted(W + 120, 100, (Pp) => {
    range(Pp, { base: 100, top: (x) => 66 - fbm(x / 50, 0.5, 71, 3) * 26 - Math.max(0, Math.sin(x / 37) * 8), R: loin, l0: 3, k: 3, seed: 71 });
  });
  const hill = painted(W + 360, 100, (Pp) => {
    range(Pp, { base: 100, top: (x) => 90 - fbm(x / 80, 1.5, 72, 2) * 14, R: hills, l0: 3.4, k: 4, seed: 72, haze: 0.15, hcol: hex('#d8c8a8') });
    sow(Pp, { y0: 93, y1: 100, n: 70, seed: 73, haze: 0.3, hcol: hex('#c8c0a8'), make: (dd, s) => (s % 4 ? cottonwood(6 + rd(dd * 6), s) : juniper(2, s)) });
  });
  d.far = panorama([[mtn, COURSE_HZ - 101], [hill, COURSE_HZ - 101]]);
  // le troupeau des McCoy, au loin derrière la clôture de la lisière
  d.cows = [];
  for (let k = 0; k < 40; k++) d.cows.push({ x: k * 260 + rd(hash(k + 90) * 140), y: 101 + rd(hash(k + 91) * 8), coat: ['#8a4a24', '#3a2c26', '#e8dcc8', '#a85a48'][k % 4], dir: hash(k + 92) < 0.5 ? 1 : -1 });
  d.lisiere = (ctx, cam) => {
    const mid = cam * 0.55;
    for (const c of d.cows) { const sx = rd(c.x - mid); if (sx > -12 && sx < W + 12) farCow(ctx, sx, c.y, c.coat, c.dir); }
    // la clôture du ranch McCoy, le long de la lisière
    const fc = cam * 0.7;
    for (let x = Math.floor(fc / 16) * 16; x < fc + W + 16; x += 16) {
      if (hash(Math.floor(x / 16) + 7) < 0.08) continue; // un poteau tombé
      const sx = rd(x - fc);
      R(ctx, sx - 1, 104, 4, 9, OUT); R(ctx, sx, 105, 2, 8, '#7a5232');
    }
    R(ctx, 0, 106, W, 1, '#8a6038'); R(ctx, 0, 110, W, 1, '#8a6038');
  };
  d.goal = "JUSQU'AU GUÉ";
  d.arrival = ford();
  return d;
}

// L'arrivée de la chevauchée dans la prairie : la rivière et son gué, les peupliers, le panneau « LE GUÉ »
function ford() {
  const c = painted(300, 70, (Pp) => {
    for (let y = 52; y < 64; y++) for (let x = 0; x < 300; x++) {
      const k = (y - 52) / 12;
      Pp.set(x, y, hex(k < 0.3 ? '#4a7a9a' : (x + y * 3) % 17 === 0 ? '#c8e0e0' : k < 0.7 ? '#6a9ab8' : '#3a6a8a'));
    }
    // le gué : galets pâles au travers de l'eau
    for (let x = 20; x < 70; x++) for (let y = 52; y < 64; y++) if (vnoise(x / 2, y / 2, 81) > 0.45) Pp.set(x, y, hex(vnoise(x, y, 82) > 0.5 ? '#c8c0a8' : '#9a9080'));
    sow(Pp, { x0: 90, x1: 300, y0: 48, y1: 54, n: 9, seed: 83, make: (dd, s) => cottonwood(20 + rd(dd * 12), s) });
    sow(Pp, { x0: 0, x1: 300, y0: 62, y1: 68, n: 30, seed: 84, make: (dd, s) => tuft(4 + rd(dd * 3), s, P.olive) });
  });
  const sign = board('LE GUÉ', { bg: '#eadcb0', fg: '#4a2a14', frame: '#8a5a34', posts: 14, h: 11, pad: 5 });
  return (ctx, x, base) => {
    ctx.drawImage(c, rd(x), base - 66);
    blitC(ctx, sign, x + 46, base - 30);
  };
}

// L'arrivée dans les gorges : deux piliers de grès, l'écriteau vers l'hacienda, un crâne de vache et le drapeau noir
function gorgeExit() {
  const c = painted(220, 90, (Pp) => {
    wall(Pp, { x0: 120, x1: 150, top: (x) => 10 + rd(Math.abs(x - 135) / 3), bot: () => 90, R: P.grès, lit: 5, band: 7, seed: 91 });
    wall(Pp, { x0: 176, x1: 220, top: (x) => 24 + rd(Math.abs(x - 198) / 4), bot: () => 90, R: P.grès, lit: 4.4, band: 7, seed: 92 });
    sow(Pp, { x0: 110, x1: 220, y0: 84, y1: 90, n: 14, seed: 93, make: (dd, s) => boulder(2 + rd(dd * 3), s, P.talus) });
  });
  const sign = board('HACIENDA DEL DIABLO', { bg: '#2a1a14', fg: '#e8d8b0', frame: '#7a1a14', posts: 16, h: 11, pad: 4 });
  return (ctx, x, base, now) => {
    ctx.drawImage(c, rd(x), base - 88);
    blitC(ctx, sign, x + 62, base - 33);
    // crâne de vache cloué au-dessus de l'écriteau
    const sx = rd(x + 62), sy = base - 40;
    R(ctx, sx - 5, sy - 2, 11, 6, OUT); R(ctx, sx - 4, sy - 1, 9, 2, '#e8e0c8'); R(ctx, sx - 2, sy + 1, 5, 3, '#e8e0c8');
    R(ctx, sx - 1, sy + 1, 1, 1, OUT); R(ctx, sx + 1, sy + 1, 1, 1, OUT); R(ctx, sx - 6, sy - 3, 2, 2, '#e8e0c8'); R(ctx, sx + 5, sy - 3, 2, 2, '#e8e0c8');
    // le drapeau noir d'El Diablo, qui claque au vent de l'orage
    const fx = rd(x + 100), f = Math.floor(now / 140) % 2;
    R(ctx, fx - 1, base - 62, 3, 62, OUT); R(ctx, fx, base - 61, 1, 61, '#8a7a6a');
    R(ctx, fx + 1, base - 61, 14, 9, OUT); R(ctx, fx + 2, base - 60 + f, 12, 7, '#1a1416');
    R(ctx, fx + 7, base - 58 + f, 2, 2, '#e8e0c8');
  };
}

// ---------------------------------------------------------------- la roulotte
// deco.set 'mission' : la roulotte blanche de Sœur Inès, de Red Rock à la Mission San Rosario, à l'aube.
// De côté : la sierra bleutée et les mesas pâles (story/sets/mission.js), la mission blanche qui se lève sur sa
// colline au bout de la route, les croix de bois du chemin et les panneaux ; de l'intérieur, la mission au bout de
// la piste (dessinée par wagon.js). deco.to / deco.from : noms du départ et de l'arrivée.
const WH = '#eadfc8', WHS = '#c8b8a0', TUILE = '#b4583a', BOIS = '#6a4428';

// La mission lointaine sur sa colline : façade à pignon chantourné, campanile et sa cloche, dôme, couvent bas
function farMission() {
  const c = S.makeCanvas(96, 48), g = c.getContext('2d');
  // la colline
  for (let x = 0; x < 96; x++) { const h = rd(10 * Math.sin((x / 95) * Math.PI) ** 0.7); R(g, x, 47 - h, 1, h + 1, x < 48 ? '#c8a888' : '#b8987a'); }
  // le couvent bas et son mur
  O(g, 50, 39, [[0, -7, 30, 7, WH], [-36, -4, 36, 4, WH]]);
  for (let x = 53; x < 78; x += 5) R(g, x, 34, 2, 3, '#8a7a6a');
  // le dôme
  O(g, 36, 31, [[0, -6, 12, 6, WH], [2, -8, 8, 2, WH], [4, -9, 4, 1, WH]]);
  R(g, 45, 23, 3, 8, WHS); R(g, 41, 19, 2, 3, BOIS);
  // la façade et son pignon à volutes
  O(g, 20, 39, [[0, -18, 18, 18, WH], [3, -21, 12, 3, WH], [6, -24, 6, 3, WH]]);
  R(g, 33, 21, 5, 18, WHS); R(g, 27, 31, 4, 8, '#5a3a22'); R(g, 28, 25, 2, 2, '#5a3a22');
  R(g, 28, 12, 1, 4, BOIS); R(g, 27, 13, 3, 1, BOIS); // la croix du pignon
  // le campanile et sa cloche
  O(g, 8, 39, [[0, -26, 10, 26, WH], [1, -30, 8, 4, WH]]);
  R(g, 11, 15, 4, 4, '#3a2a24'); R(g, 12, 16, 2, 3, '#c8a040'); R(g, 16, 13, 2, 26, WHS);
  R(g, 12, 6, 1, 3, BOIS); R(g, 11, 7, 3, 1, BOIS);
  return c;
}

// Croix de bois du bord du chemin (les pèlerins de San Rosario), avec un petit tas de pierres
function roadCross(g, x, base, h = 14) {
  O(g, x, base, [[0, -h, 2, h, '#7a5232'], [-3, -h + 3, 8, 2, '#7a5232']]);
  R(g, x, base - h, 1, h, '#9a6a3a');
  for (const [dx, s] of [[-3, 2], [2, 2], [-1, 3]]) R(g, x + dx, base - s, 3, s, '#a89a88');
}

export async function wagonDeco(deco, env) {
  await fontsReady();
  const far = await setFar('mission');
  const mission = farMission();
  const d = { set: deco.set, from: deco.from || 'RED ROCK', to: deco.to || 'SAN ROSARIO' };
  d.names = { 'DUSTY GULCH': d.from, 'RED ROCK': d.to };
  const pan = panorama(far.layers.map((c) => [c, 112 - far.hz]));
  // le lointain : la sierra, les mesas, puis la mission qui se lève à l'horizon pendant le voyage (parallaxe 0,12)
  d.far = (ctx, p, cam) => {
    pan(ctx, p);
    const x = rd(470 - cam * 0.12);
    if (x < W + 4 && x > -100) ctx.drawImage(mission, x, 112 - 46);
  };
  // les croix de bois et les panneaux du chemin de la mission, plantés au bord de la piste
  const cross = S.makeCanvas(14, 18);
  roadCross(cross.getContext('2d'), 6, 17);
  const sign = board(deco.to ? `MISSION ${d.to}` : 'MISSION SAN ROSARIO', { bg: '#eadcb0', fg: '#5a2a14', frame: '#8a5a34', posts: 12, h: 11, pad: 10 });
  // flèche peinte au bout de la planche (on va vers la droite)
  const sg = sign.getContext('2d'), ay = 6, ax = sign.width - 8;
  R(sg, ax - 4, ay, 5, 1, '#5a2a14'); R(sg, ax - 1, ay - 2, 1, 5, '#5a2a14'); R(sg, ax, ay - 1, 1, 3, '#5a2a14');
  d.road = (ctx, cam) => {
    const c = Math.floor(cam);
    for (let x = Math.floor((c - 40) / 230) * 230 + 115; x < c + W + 40; x += 230) {
      if (x < 600) continue; // pas dans la ville
      const sx = x - c;
      if (x % 1150 === 345) ctx.drawImage(sign, sx - sign.width / 2, 139 - sign.height);
      else ctx.drawImage(cross, sx - 6, 139 - 17);
    }
  };
  return d;
}

// ---------------------------------------------------------------- la mine
// deco.set 'joe' : la galerie huit de la Mine du Vieux Joe, la nuit où les hommes de Bart y descendent avec leur
// dynamite. Planches peintes clouées entre les étais (le numéro de la galerie, les avertissements du vieux Joe),
// « GALERIE 8 » sur les chapeaux des cadres vus de derrière, et dehors, à l'arrivée : le chevalement, l'enseigne
// de la mine et les caisses de dynamite que la bande a laissées à l'entrée.
export async function mineDeco(deco, env) {
  await fontsReady();
  const plank = (t, bg = '#4a3020', fg = '#eadcb0') => board(t, { bg, fg, frame: '#2a1a10', h: 11, pad: 4 });
  const d = { set: deco.set };
  d.signs = [plank('GALERIE 8'), plank('MINE DU VIEUX JOE'), plank('DANGER ! GRISOU', '#eadcb0', '#7a1a14'), plank('PAS TOUCHE ! - JOE'),
    plank('GALERIE 8'), plank('MES AÏEUX ! ÇA S’ÉBOULE'), plank('DYNAMITE - BART', '#7a1a14', '#f8d070')];
  d.beam = plank('GALERIE 8', '#5a3a22', '#f8d070');
  // dehors : peint par-dessus l'arrivée de mine.js (falaise et entrée à gauche, ligne d'arrivée au milieu)
  d.out = (o) => {
    const lit = !!env.lights;
    // le chevalement sur la falaise : deux jambes de bois en A, la poulie, le câble qui plonge dans le puits
    const hx = 64, hy = 66;
    for (const [x0, x1] of [[hx - 18, hx - 2], [hx + 18, hx + 2]]) for (let y = 0; y <= 40; y++) R(o, rd(x0 + ((x1 - x0) * y) / 40) - 1, hy - y, 3, 1, y % 10 === 0 ? '#3a2414' : '#6a4428');
    R(o, hx - 14, hy - 20, 28, 2, '#5a3a22'); R(o, hx - 9, hy - 32, 18, 2, '#5a3a22');
    S.disc(o, hx, hy - 42, 5, OUT); S.disc(o, hx, hy - 42, 4, '#8a8f98'); S.disc(o, hx, hy - 42, 1, '#3a3e44');
    R(o, hx + 4, hy - 42, 1, 44, '#2a2a30');
    // l'enseigne au-dessus de l'entrée
    const sign = board('MINE DU VIEUX JOE', { bg: '#3a2414', fg: '#f8d070', frame: '#8a5a34', h: 13, pad: 5 });
    o.drawImage(sign, rd(61 - sign.width / 2), 104);
    // une lanterne pendue au linteau, allumée la nuit
    R(o, 89, 126, 1, 4, '#2a2a30'); R(o, 87, 130, 5, 6, OUT); R(o, 88, 131, 3, 4, lit ? '#fff0a0' : '#c8a048');
    // les caisses de dynamite de la bande à Bart, empilées à l'entrée, et la mèche qui court sur le sol
    const crate = (x, base, s) => {
      R(o, x - 1, base - s - 1, s + 2, s + 2, OUT); R(o, x, base - s, s, s, '#a8783c'); R(o, x, base - s, s, 1, '#c8985a');
      R(o, x + 1, base - s + 3, s - 2, 5, '#a8302a'); canvasText(o, 'TNT', x + s / 2, base - s + 2, { color: '#fdf6e0', shadow: '' });
    };
    crate(2, 178, 18); crate(21, 178, 14); crate(8, 159, 14);
    for (let x = 36; x < 120; x++) R(o, x, 176 + rd(Math.sin(x / 9) * 1.5), 1, 1, '#2a2020');
  };
  return d;
}

// ---------------------------------------------------------------- la pinte
// deco.set : 'verre' (Le Dernier Verre, le saloon de Red Rock : son enseigne, « RED ROCK » au fronton de l'étagère,
// l'avis de recherche d'El Diablo qui « boit à l'œil ici ») ou 'pike' (le bureau du shérif Pike à Dusty Gulch :
// plaque, étoile de fer-blanc, El Diablo parmi les avis de recherche). Le Buckshot, lui, est une salle de room.js
// (deco.room 'buckshot'). Renvoie un calque transparent, peint une fois et teint à l'heure de la salle.
function wantedDiablo(g, x, y, w = 40, h = 46) {
  R(g, x - 1, y - 1, w + 2, h + 2, OUT); R(g, x, y, w, h, '#e0cc98'); R(g, x + w - 3, y, 3, 3, '#c8b07c');
  canvasText(g, 'WANTED', x + w / 2, y + 2, { color: '#5a2a14', shadow: '' });
  const cx = x + rd(w / 2), fy = y + 12;
  // le portrait : sombrero noir, cache-œil, moustache
  R(g, cx - 12, fy + 6, 24, 2, '#1e1a18'); R(g, cx - 6, fy, 12, 6, '#1e1a18'); R(g, cx - 5, fy + 1, 10, 1, '#7a1a14');
  R(g, cx - 5, fy + 8, 10, 10, '#b07850'); R(g, cx - 5, fy + 8, 10, 1, '#8a5a3a');
  R(g, cx - 4, fy + 10, 4, 3, '#1a1416'); R(g, cx - 5, fy + 9, 10, 1, '#1a1416'); R(g, cx + 2, fy + 11, 2, 1, '#2a1a10');
  R(g, cx - 4, fy + 15, 8, 2, '#2a1a10'); R(g, cx - 5, fy + 16, 1, 2, '#2a1a10'); R(g, cx + 4, fy + 16, 1, 2, '#2a1a10');
  if (h >= 46) R(g, cx - 7, fy + 18, 14, 4, '#3a3236');
  canvasText(g, '5000 $', x + w / 2, y + h - 10, { color: '#7a1a14', shadow: '' });
  R(g, cx, y + 1, 1, 1, '#3a3a40'); // le clou
}

export async function pinteDeco(deco, tint) {
  await fontsReady();
  const c = S.makeCanvas(W, H), g = c.getContext('2d');
  if (deco.set === 'verre') {
    const sign = board('LE DERNIER VERRE', { bg: '#2a1a14', fg: '#f8d070', frame: '#c8a050', h: 13, pad: 6 });
    g.drawImage(sign, rd(322 - sign.width / 2), 3);
    const rr = board('RED ROCK', { bg: '#7a1a14', fg: '#fdf6e0', frame: '#f8d070', h: 11, pad: 5 });
    g.drawImage(rr, rd(64 - rr.width / 2), 0);
    wantedDiablo(g, 243, 18);
  } else if (deco.set === 'buckshot') {
    // le Buckshot de Rosa : son enseigne (l'autre, sous le crâne de bœuf de room.js, est cachée par les cartes de la
    // pinte) et le portrait de la patronne dans son cadre doré, à la place de l'avis de recherche
    const sign = board('BUCKSHOT SALOON', { bg: '#8a2418', fg: '#f8d070', frame: '#c89838', h: 13, pad: 6 });
    g.drawImage(sign, rd(322 - sign.width / 2), 3);
    const x = 245, y = 19, w = 28, h = 36;
    R(g, x - 3, y - 3, w + 6, h + 6, OUT); R(g, x - 2, y - 2, w + 4, h + 4, '#c8a040'); R(g, x - 2, y - 2, w + 4, 1, '#f0d070'); R(g, x - 2, y + h + 1, w + 4, 1, '#8a6a20');
    R(g, x, y, w, h, '#3a2a3a'); R(g, x, y, w, 2, '#4a3a4a');
    const cx = x + 14;
    R(g, cx - 7, y + 6, 14, 16, '#1a1214'); R(g, cx - 8, y + 12, 2, 14, '#1a1214'); R(g, cx + 6, y + 12, 2, 14, '#1a1214'); // les cheveux noirs
    R(g, cx - 5, y + 9, 10, 11, '#d09a70'); R(g, cx - 5, y + 9, 10, 2, '#1a1214'); R(g, cx + 3, y + 11, 2, 9, '#b07a54');
    R(g, cx - 3, y + 13, 2, 1, '#2a1a10'); R(g, cx + 1, y + 13, 2, 1, '#2a1a10'); R(g, cx - 2, y + 17, 4, 1, '#9a2a2a');
    R(g, cx + 4, y + 7, 4, 4, '#c8302a'); R(g, cx + 5, y + 8, 2, 2, '#f06a5a'); // la fleur rouge
    R(g, cx - 2, y + 20, 4, 3, '#c08a64'); R(g, cx - 10, y + 23, 20, 13, '#9a1c1c'); R(g, cx - 10, y + 23, 20, 2, '#e8dcc8'); R(g, cx - 4, y + 25, 8, 1, '#e8dcc8');
    canvasText(g, 'ROSA', cx, y + h + 4, { color: '#f8d070', shadow: OUT });
  } else if (deco.set === 'pike') {
    const sign = board('BUREAU DU SHÉRIF', { bg: '#3a2a1e', fg: '#e8d8b0', frame: '#8a6a3a', h: 11, pad: 5 });
    g.drawImage(sign, rd(300 - sign.width / 2), 1);
    // l'étoile de fer-blanc peinte sur la pierre, et « DUSTY GULCH » en dessous
    const sx = 180, sy = 70;
    // (étoile à cinq branches pleine, tracée pixel par pixel : un point est dedans s'il est sous le contour en étoile)
    const inStar = (x, y, ro) => {
      const ang = Math.atan2(y, x) + Math.PI / 2, d = Math.hypot(x, y);
      const u = ((((ang / (Math.PI * 2 / 5)) % 1) + 1) % 1) * 2 - 1; // -1 … 1 d'une pointe à la suivante
      return d <= ro * (0.42 + 0.58 * Math.abs(u) ** 1.6) + 0.3;
    };
    for (let y = -11; y <= 11; y++) for (let x = -11; x <= 11; x++) {
      if (inStar(x, y, 10)) R(g, sx + x, sy + y, 1, 1, inStar(x, y, 9) ? (x + y < 0 ? '#f0ece2' : '#b8b4ac') : OUT);
    }
    S.disc(g, sx, sy, 3, '#c8c4bc'); R(g, sx - 1, sy - 1, 2, 2, '#f4f0e8');
    canvasText(g, 'DUSTY GULCH', sx, sy + 13, { color: '#e8dcc0', shadow: '#5a5048' });
    wantedDiablo(g, 330, 58, 40, 40);
  }
  return tint ? S.tintCanvas(c, tint) : c;
}

// ---------------------------------------------------------------- la bagarre
// deco.set 'arene' : l'arène de Red Rock, la nuit du grand combat. Au-dessus de la foule, le ciel étoilé et les
// buttes de Red Rock en ombres chinoises ; derrière les gradins, la cage de planches ; une guirlande de lanternes
// de papier, deux torches, et les ardoises des parieurs (El Diablo a parié contre vous). Le fond remplace le mur
// de bagarre.js ; la foule et le ring restent les siens.
export async function arenaDeco(deco, env) {
  await fontsReady();
  const far = await setFar('redrock');
  const wall = S.makeCanvas(W, H), g = wall.getContext('2d');
  // le ciel de la nuit, puis les buttes, teintes de nuit
  g.drawImage(skyCanvas(env, 70, 48, 0.86, 0.72), 0, 0);
  const night = env.tint || '#5462a8';
  for (const c of far.layers) g.drawImage(S.tintCanvas(c, S.mix(night, '#ffffff', 0.25)), -40, 48 - far.hz);
  // la cage de planches : des planches inégales, pointues, sombres, avec leurs traverses
  for (let x = 0; x < W; x += 7) {
    const top = 45 + ((x * 7) % 4) - (x % 21 === 0 ? 3 : 0);
    R(g, x, top, 7, 120 - top, OUT);
    R(g, x + 1, top + 1, 5, 120 - top, (x / 7) % 3 ? '#4a2e1c' : '#3e2616');
    R(g, x + 1, top + 1, 1, 120 - top, '#5e3c24'); R(g, x + 3, top - 1, 1, 2, OUT);
  }
  R(g, 0, 53, W, 3, '#2a1a10'); R(g, 0, 53, W, 1, '#5a3a22');
  // la guirlande de lanternes de papier, en chaînette d'un bout à l'autre
  const lamps = [];
  for (let x = 0; x < W; x++) {
    const y = rd(27 + 7 * Math.sin((x / W) * Math.PI));
    R(g, x, y, 1, 1, '#1a1210');
    if (x % 32 === 16) lamps.push([x, y]);
  }
  lamps.forEach(([x, y], i) => {
    const glow = g.createRadialGradient(x, y + 5, 0, x, y + 5, 22); // (une fois, dans le canvas du fond)
    glow.addColorStop(0, 'rgba(255,170,90,0.32)'); glow.addColorStop(1, 'rgba(255,170,90,0)');
    g.fillStyle = glow; g.fillRect(x - 22, y - 17, 44, 44);
    const col = ['#e04a2a', '#f8c048', '#e07a2a'][i % 3];
    R(g, x - 3, y + 1, 7, 8, OUT); R(g, x - 2, y + 2, 5, 6, col); R(g, x - 1, y + 3, 2, 3, '#fff0b0'); R(g, x - 2, y + 1, 5, 1, '#3a2a20');
  });
  // les ardoises des parieurs, sur leurs piquets devant les gradins (calque dessiné par-dessus la foule)
  const front = S.makeCanvas(W, H), fg = front.getContext('2d');
  const slate = (x, y, l1, l2) => {
    const g = fg;
    const w = Math.max(textW(l1), textW(l2)) + 10;
    R(g, x - 1, y - 1, w + 2, 24, OUT); R(g, x, y, w, 22, '#6a4428'); R(g, x + 2, y + 2, w - 4, 18, '#2a3030');
    canvasText(g, l1, x + w / 2, y + 3, { color: '#e8e4d8', shadow: '' });
    canvasText(g, l2, x + w / 2, y + 11, { color: '#f0d070', shadow: '' });
  };
  slate(30, 41, 'EL DIABLO', '500 $ CONTRE');
  slate(286, 41, 'LE BISON', '1 CONTRE 3');
  return {
    set: deco.set, wall, front,
    banner: 'ARÈNE DE RED ROCK', champ: 'LE GRAND COMBAT DE RED ROCK',
    // deux torches de part et d'autre, qui vacillent
    torches(ctx, now) {
      for (const [x, ph] of [[88, 0], [296, 3]]) {
        R(ctx, x - 1, 36, 3, 18, OUT); R(ctx, x, 37, 1, 17, '#6a4428');
        R(ctx, x - 3, 32, 7, 5, OUT); R(ctx, x - 2, 33, 5, 3, '#3a3438');
        const f = Math.floor(now / 90 + ph) % 3;
        R(ctx, x - 2, 27 - f, 5, 6 + f, '#e8501c'); R(ctx, x - 1, 25 - f, 3, 6, '#f89a2a'); R(ctx, x, 26 - f, 1, 4, '#fde870');
      }
    },
  };
}

// ---------------------------------------------------------------- le lasso
// deco.set : 'mccoy' (le ranch McCoy à midi : l'arche « RANCH McCOY », la grange rouge marquée du fer des McCoy,
// les enclos aux barrières ouvertes par Bart) ou 'redrock' (le désert de Red Rock : les buttes et les aiguilles de
// grès, la ville et sa voie ferrée au loin). Les obstacles et les bêtes restent ceux de lasso.js.
function mccoyGate() {
  const c = S.makeCanvas(96, 56), g = c.getContext('2d');
  const sign = board('RANCH McCOY', { bg: '#5a3a22', fg: '#f4e4b8', frame: '#8a6038', h: 11, pad: 5 });
  O(g, 10, 55, [[0, -46, 4, 46, '#6a4428'], [72, -46, 4, 46, '#6a4428'], [-4, -48, 84, 4, '#7a5232']]);
  R(g, 11, 9, 1, 46, '#8a5a34'); R(g, 83, 9, 1, 46, '#8a5a34'); R(g, 6, 7, 84, 1, '#9a6a3a');
  for (const x of [26, 64]) R(g, x, 11, 1, 5, '#3a3a40');
  g.drawImage(sign, rd(48 - sign.width / 2), 15);
  // le fer des McCoy (un M et un C entrelacés) brûlé sur la poutre, et un fer à cheval cloué au-dessus
  R(g, 44, 3, 8, 1, '#3a2414'); R(g, 44, 3, 1, 3, '#3a2414'); R(g, 51, 3, 1, 3, '#3a2414');
  return c;
}
function mccoyBarn() {
  const c = S.makeCanvas(76, 50), g = c.getContext('2d');
  O(g, 8, 49, [[0, -30, 60, 30, '#9a2a1e']]);
  for (let k = 0; k < 14; k++) R(g, 8 + 30 - 2 - k * 2, 19 - k, 4 + k * 4, 1, OUT); // le pignon
  for (let k = 0; k < 13; k++) R(g, 8 + 30 - 1 - k * 2, 20 - k, 2 + k * 4, 1, '#8a2418');
  for (let x = 10; x < 68; x += 4) R(g, x, 20, 1, 29, '#7a1e14');
  R(g, 4, 18, 68, 2, '#e8dcc8');
  // les portes à croix blanche, la lucarne à foin, le fer « McC » peint
  R(g, 27, 31, 22, 18, '#e8dcc8'); R(g, 29, 33, 18, 16, '#9a2a1e');
  for (let k = 0; k < 16; k++) { R(g, 29 + rd(k * 18 / 16), 33 + k, 1, 1, '#e8dcc8'); R(g, 46 - rd(k * 18 / 16), 33 + k, 1, 1, '#e8dcc8'); }
  R(g, 33, 10, 10, 8, '#e8dcc8'); R(g, 34, 11, 8, 6, '#3a2214'); R(g, 35, 14, 6, 3, '#d8b850');
  canvasText(g, 'McC', 18, 22, { color: '#f4e4b8', shadow: '' });
  return c;
}
function corral() {
  const c = S.makeCanvas(84, 24), g = c.getContext('2d');
  for (const x of [2, 20, 38, 70]) O(g, x, 23, [[0, -16, 3, 16, '#7a5232']]);
  for (const y of [9, 15]) { R(g, 2, y, 39, 2, '#a8703c'); R(g, 2, y + 2, 39, 1, '#5a3a22'); }
  // la barrière ouverte (rabattue de biais) et une lisse cassée par terre
  for (let k = 0; k < 22; k++) { R(g, 41 + k, 9 + rd(k * 0.35), 1, 2, '#a8703c'); R(g, 41 + k, 15 + rd(k * 0.35), 1, 2, '#a8703c'); }
  R(g, 64, 20, 14, 2, '#8a5a34'); R(g, 70, 9, 3, 2, '#a8703c');
  return c;
}

export async function lassoDeco(deco, env) {
  await fontsReady();
  const d = { set: deco.set };
  if (deco.set === 'redrock') {
    const far = await setFar('redrock');
    const town = S.makeCanvas(820, 64), tg = town.getContext('2d');
    telegraph(tg, 820, 62, 90, 22);
    redrockTown(tg, 300, 63, !!env.lights);
    d.far = panorama([...far.layers.map((c) => [c, 100 - far.hz - 1]), [town, 101 - 63]]);
    return d;
  }
  // le ranch McCoy : de grands repères qui défilent avec le sol (ts : instant où ils entrent par la droite)
  const gate = mccoyGate(), barn = mccoyBarn(), fence = corral();
  const items = [[-3000, 108, gate], [3500, 104, fence], [9000, 106, barn], [15000, 109, fence], [21000, 103, fence],
    [27000, 105, barn], [33000, 108, gate], [39500, 110, fence], [45500, 105, barn], [52000, 104, fence]];
  d.props = (ctx, tt, speed) => {
    for (const [ts, y, c] of items) {
      const x = rd(W + c.width - speed(y) * (tt - ts));
      if (x < -c.width || x > W + c.width) continue;
      ctx.drawImage(c, x - (c.width >> 1), y - c.height + 1);
    }
  };
  return d;
}
