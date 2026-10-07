// Armes en main (vue subjective) : groupe « thrown ». Voir registerViewModel / VMK dans ../fpsart.js.
// Objets lancés ou posés avec G, à l'emplacement 4 comme la dynamite :
//   molotov : bouteille de whisky en verre teinté, whisky ambré, chiffon enfoncé dans le goulot (allumé en « lit »)
//   trap    : piège à loup à deux ressorts plats (type Newhouse), armé, mâchoires dentées ouvertes, palette, chaîne et anneau
// États : idle (1 image), lit (2 images : flamme du chiffon / piège qu'on s'apprête à poser), throw (1 image).
import { VMK, registerViewModel } from '../fpsart.js';

const {
  vmScene, vmRender, vmHold, vmChain, vmT, vmRx, vmRy, vmRz, vmP, vmAdd, vmSub, vmK, vmLen, vmUnit, vmLerp, vmProj,
  vmMatRamp, vmGrip, msStrap, msToLocal, msIn, msPuff, MS_TAU, clamp,
} = VMK;

// Tirage pseudo-aléatoire reproductible (recopié de fpsart.js, non exporté)
function rng(seed) {
  let s = (seed * 2654435761) >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- tour : profil [[y, r], ...] (y croissant) tourné autour de l'axe y, de l'angle a0 à a1.
// Normales lissées entre segments voisins peu coudés, arêtes franches ailleurs (fond, bague du goulot).
function thLatheTris(prof, segs = 16, a0 = 0, a1 = MS_TAU) {
  const out = [], ns = [];
  for (let i = 0; i + 1 < prof.length; i++) {
    const [y0, r0] = prof[i], [y1, r1] = prof[i + 1];
    const l = Math.hypot(y1 - y0, r1 - r0) || 1;
    ns.push([(y1 - y0) / l, -(r1 - r0) / l]); // (nr, ny)
  }
  const vn = (s, end) => {
    const a = ns[s], j = end ? s + 1 : s - 1, b = ns[j];
    if (!b || a[0] * b[0] + a[1] * b[1] < 0.8) return a;
    const l = Math.hypot(a[0] + b[0], a[1] + b[1]) || 1;
    return [(a[0] + b[0]) / l, (a[1] + b[1]) / l];
  };
  for (let s = 0; s < ns.length; s++) {
    const [y0, r0] = prof[s], [y1, r1] = prof[s + 1];
    if (y0 === y1 && r0 === r1) continue;
    const m0 = vn(s, false), m1 = vn(s, true);
    for (let k = 0; k < segs; k++) {
      const t0 = a0 + ((a1 - a0) * k) / segs, t1 = a0 + ((a1 - a0) * (k + 1)) / segs;
      const c0 = Math.cos(t0), s0 = Math.sin(t0), c1 = Math.cos(t1), s1 = Math.sin(t1);
      const p00 = [c0 * r0, y0, s0 * r0], p01 = [c1 * r0, y0, s1 * r0], p10 = [c0 * r1, y1, s0 * r1], p11 = [c1 * r1, y1, s1 * r1];
      const n00 = [c0 * m0[0], m0[1], s0 * m0[0]], n01 = [c1 * m0[0], m0[1], s1 * m0[0]];
      const n10 = [c0 * m1[0], m1[1], s0 * m1[0]], n11 = [c1 * m1[0], m1[1], s1 * m1[0]];
      out.push([[p00, p01, p11], [n00, n01, n11]], [[p00, p11, p10], [n00, n11, n10]]);
    }
  }
  return out;
}

// --- lumière chaude d'une flamme sur ce qui est déjà dessiné (main, bouteille), avant de peindre la flamme
function thWarm(ctx, x, y, R, k) {
  const W = ctx.canvas.width, H = ctx.canvas.height;
  const x0 = Math.max(0, Math.floor(x - R)), x1 = Math.min(W - 1, Math.ceil(x + R));
  const y0 = Math.max(0, Math.floor(y - R)), y1 = Math.min(H - 1, Math.ceil(y + R * 1.6));
  if (x1 < x0 || y1 < y0) return;
  const img = ctx.getImageData(x0, y0, x1 - x0 + 1, y1 - y0 + 1), d = img.data, w = x1 - x0 + 1;
  for (let py = y0; py <= y1; py++) for (let px = x0; px <= x1; px++) {
    const i = ((py - y0) * w + (px - x0)) * 4;
    if (!d[i + 3]) continue;
    // la lumière tombe d'en haut : portée allongée vers le bas
    const dd = Math.hypot(px - x, (py - y) / (py > y ? 1.6 : 1)) / R;
    if (dd >= 1) continue;
    const a = k * (1 - dd) ** 1.4;
    // tramage 2x2 pour garder des tons francs
    if (a < 0.08 + ((px + py * 3) & 3) * 0.02) continue;
    d[i] = Math.min(255, d[i] + d[i] * a * 0.95 + 18 * a);
    d[i + 1] = Math.min(255, d[i + 1] + d[i + 1] * a * 0.42 + 6 * a);
    d[i + 2] = Math.max(0, d[i + 2] - d[i + 2] * a * 0.22);
  }
  ctx.putImageData(img, x0, y0);
}

// --- flamme 2D : langues en goutte, du rouge sombre au cœur blanc ; f change la forme (2 images bien différentes)
const TH_FIRE = ['#6a1008', '#b8280c', '#f06a14', '#f8a828', '#ffe060', '#fff8d8'];
function thFlame(p, x, y, f, s = 1, lean = 0) {
  const rand = rng(41 + f * 17);
  const P = (px, py, col) => { if (msIn(px, py)) p.P(Math.round(px), Math.round(py), col); };
  // langues : [décalage x, hauteur, largeur, phase]
  const tongues = f === 0
    ? [[0, 21, 6.6, 0.3], [-3.6, 13, 4.2, 1.7], [3.8, 15, 4.4, 2.9], [0.8, 9, 3.4, 4.1]]
    : [[0.6, 18, 6.8, 2.2], [-3.0, 16, 4.4, 0.4], [4.2, 11, 3.8, 3.6], [-0.6, 24, 3.2, 5.0]];
  const shape = (t, k) => {
    const [ox, h0, w0, ph] = t, h = h0 * s * (0.55 + 0.45 * k), W = w0 * s * k;
    const bx = x + ox * s, by = y + 1.5 * s;
    const L = [], R = [];
    const N = 12;
    for (let j = 0; j <= N; j++) {
      const u = j / N;
      const hw = W * (1 - u) ** 1.25 * Math.sqrt(Math.min(1, u * 5 + 0.08));
      const cx = bx + lean * s * u * u * 6 + Math.sin(u * 6.5 + ph) * u * 2.2 * s;
      const cy = by - h * u;
      L.push([cx - hw, cy]); R.push([cx + hw, cy]);
    }
    return [...L, ...R.reverse()];
  };
  const ks = [1, 0.84, 0.68, 0.5, 0.33, 0.17];
  for (let l = 0; l < TH_FIRE.length; l++) {
    for (const t of tongues) {
      const pts = shape(t, ks[l]).map(([px, py]) => [clamp(px, 1, 198), Math.max(2, py)]);
      p.poly(pts, TH_FIRE[l]);
    }
  }
  // escarbilles qui montent
  for (let i = 0; i < 7; i++) {
    const ex = x + (rand() * 2 - 1) * 8 * s, ey = y - (14 + rand() * 16) * s;
    P(ex, ey, rand() < 0.5 ? '#ffd040' : '#ff8a20');
    if (rand() < 0.4) P(ex, ey - 1, '#fff6c0');
  }
}

// ================================================================== cocktail : bouteille de whisky + chiffon
// Repère : bouteille dressée selon +y, fond en y = 0 (cm). Verre teinté vert d'eau, whisky ambré jusqu'à TH_LIQ.
const TH_GLASS = vmMatRamp(['#1e362e', '#2e5246', '#467664', '#72a48e', '#e8fff4'], { spec: true, line: '#0c1a14' });
const TH_LIQ = vmMatRamp(['#4a1c06', '#7c3608', '#b05a10', '#d8861e', '#ffd27a'], { spec: true, line: '#2a0e02' });
const TH_MENISC = vmMatRamp(['#6a3a10', '#a8661c', '#d89a36', '#f4c862', '#fff0b8']);
const TH_SHINE = vmMatRamp(['#90b0a0', '#c4dccc', '#e8f6ee', '#f8fffa', '#ffffff']);
const TH_SHINE_A = vmMatRamp(['#a86828', '#d09040', '#ecb860', '#f8d890', '#fff4d8']);
const TH_RAG = vmMatRamp(['#3e3024', '#6a5840', '#9a8666', '#c4b290', '#e4d8bc'], { line: '#2a2018' });
const TH_RAG_WET = vmMatRamp(['#2e2218', '#4e3e2c', '#76624a', '#9a8668', '#bcaa8a'], { line: '#20180e' });
const TH_CHAR = vmMatRamp(['#120c08', '#201610', '#34241a', '#4a3426', '#6a4a30'], { line: '#0a0604' });
// profil du verre : fond, corps droit, épaule ronde, goulot, bague ; le whisky monte jusque dans l'épaule
const TH_LEVEL = 11.8, TH_LR = 2.36;
const TH_BODY = [[0, 0], [0, 2.25], [0.25, 2.55], [0.9, 2.62], [10.9, 2.62], [11.4, 2.52], [TH_LEVEL, TH_LR]];
const TH_TOP = [[TH_LEVEL, TH_LR], [12.4, 2.06], [13.0, 1.66], [13.6, 1.34], [14.2, 1.16], [17.6, 1.08],
  [17.6, 1.34], [17.8, 1.4], [18.7, 1.4], [18.9, 1.3], [18.9, 0.9]];
// renvoie le point (repère courant) d'où sort la flamme
function thBottle(sc, o = {}) {
  sc.emit(TH_LIQ, thLatheTris(TH_BODY, 18));
  sc.emit(TH_MENISC, thLatheTris([[TH_LEVEL - 0.25, TH_LR + 0.1], [TH_LEVEL + 0.12, TH_LR - 0.06]], 18), true);
  sc.emit(TH_GLASS, thLatheTris(TH_TOP, 18), true);
  // reflets : longue bande claire côté lumière (haut-gauche, vers l'œil), filet plus fin sur le bord droit
  const sh = o.shine ?? -2.2;
  sc.emit(TH_SHINE_A, thLatheTris([[1.4, 2.66], [5.2, 2.66]], 2, sh - 0.06, sh + 0.1), true);
  sc.emit(TH_SHINE_A, thLatheTris([[5.9, 2.66], [10.9, 2.66], [11.4, 2.56]], 2, sh - 0.06, sh + 0.1), true);
  sc.emit(TH_SHINE, thLatheTris([[12.0, 2.3], [12.4, 2.1], [13.0, 1.7]], 2, sh - 0.1, sh + 0.14), true);
  sc.emit(TH_SHINE, thLatheTris([[14.4, 1.2], [17.2, 1.12]], 1, sh - 0.05, sh + 0.2), true);
  sc.emit(TH_SHINE_A, thLatheTris([[2.2, 2.66], [10.4, 2.66]], 1, sh + 1.55, sh + 1.68), true);
  // chiffon : bouchon tassé dans le goulot, bourrelet sur la bague, pan qui pend sur le côté, mèche au sommet
  const lit = !!o.lit;
  sc.push(vmT(0, 18.0, 0)).cyl(TH_RAG_WET, 0.95, 1.5, { segs: 10 }).pop();
  sc.push(vmChain(vmT(0, 19.3, 0), vmRz(0.15))).ell(lit ? TH_RAG_WET : TH_RAG, 1.55, 0.95, 1.45, { segs: 10 }).pop();
  msStrap(sc, TH_RAG_WET, [[1.3, 19.5, -0.35], [1.75, 19.0, -0.5], [1.62, 17.5, -0.75], [1.5, 16.0, -0.95], [1.66, 14.9, -0.8]], 1.5, 0.22);
  msStrap(sc, TH_RAG, [[-0.9, 19.6, 0.6], [-1.6, 18.9, 0.95], [-1.62, 18.0, 1.1]], 1.2, 0.2);
  const tuft = lit ? TH_CHAR : TH_RAG;
  msStrap(sc, tuft, [[0, 19.8, 0], [-0.4, 20.8, 0.2], [-1.3, 21.2, 0.1], [-2.0, 20.6, -0.1]], 1.35, 0.26);
  msStrap(sc, tuft, [[0.3, 19.8, 0.1], [0.6, 20.9, 0.2], [0.5, 21.5, 0.1]], 1.0, 0.24);
  return [-0.3, 21.0, 0];
}
// Main droite qui serre le bas du corps de la bouteille
function thBottleGrip(sc, skin, cloth, o = {}) {
  vmGrip(sc, [0, 0.9, 0.1], [0, 6.6, 0.2], { skin, cloth, fwd: [-1, 0, -0.3], rx: 2.62, rz: 2.62, web: 0.4, curl: o.curl, arm: o.arm || [16, -20, -16] });
}
function thMolotovView(state, frame, skin, cloth) {
  const sc = vmScene();
  if (state === 'throw') {
    // lancer : le bras part en avant, main ouverte qui vient de lâcher ; la bouteille file au loin en tournoyant, la flamme traîne
    const H = vmChain(vmHold(5, -15, 40, -0.5), vmRx(0.6), vmRy(0.15));
    sc.push(H);
    thBottleGrip(sc, skin, cloth, { curl: 0.45, arm: msToLocal(H, [16, -50, 4]) });
    sc.pop();
    sc.push(vmChain(vmT(-9, 1, 120), vmRz(-1.2), vmRx(0.5), vmT(0, -9, 0)));
    const tip = vmP(sc.top(), thBottle(sc, { lit: true, shine: -2.6 }));
    sc.pop();
    sc.fx((p) => {
      const [hx, hy] = vmProj(vmP(H, [0, 9, 0])), [sx, sy] = vmProj(tip);
      // traînée de feu et de fumée de la main à la bouteille, en arc
      const rand = rng(53);
      for (let i = 1; i < 26; i++) {
        const t = i / 26, x = hx + (sx - hx) * t, y = hy + (sy - hy) * t - Math.sin(t * Math.PI) * 10;
        if (rand() < 0.75 && msIn(x, y)) p.P(Math.round(x), Math.round(y), t > 0.8 ? '#ffe070' : t > 0.5 ? '#f89028' : '#c84a14');
        if (rand() < 0.5 && msIn(x, y + 2)) p.P(Math.round(x + rand() * 2), Math.round(y + 2), t > 0.6 ? '#b8b0a8' : '#8a8078');
      }
      thFlame(p, sx, sy + 1, 1, 0.95, 1.6);
    });
    return vmRender(sc);
  }
  const lit = state === 'lit', f = lit ? frame % 2 : 0;
  const M = [7.5, -25.5, 47, -0.18, -0.25, 0.3, -0.3, -6.8];
  const H = vmChain(vmHold(M[0], M[1], M[2], M[3]), vmRy(M[4]), vmRz(M[5] + f * 0.015), vmRx(M[6] + f * 0.02), vmT(0, M[7], 0));
  sc.push(H);
  const top = thBottle(sc, { lit });
  thBottleGrip(sc, skin, cloth);
  const tip = vmP(sc.top(), top);
  sc.pop();
  sc.fx((p) => {
    const [x, y] = vmProj(tip);
    if (lit) {
      thWarm(p.ctx, x, y, 95, 1.0);
      thFlame(p, x, y, f, 1.5, -0.2);
      msPuff(p, x + 3 - f * 4, y - 36, 6 + f, 3);
    }
  });
  return vmRender(sc);
}

// ================================================================== piège à loup armé (deux ressorts plats)
// Repère : x le long du piège (ressorts aux deux bouts), y vers le haut, z en travers ; centre de la palette en 0.
const TH_IRON = vmMatRamp(['#141212', '#2a2624', '#46403a', '#6e665e', '#c0b8ae'], { spec: true, line: '#080606' });
const TH_SPRING = vmMatRamp(['#14100e', '#2a221e', '#463a32', '#6c5c50', '#c4b4a4'], { spec: true, line: '#0a0806' });
const TH_RUST = vmMatRamp(['#1e0c06', '#3e1c0c', '#622e14', '#8a4620', '#b06a3a'], { line: '#120604' });
const TH_TOOTH = vmMatRamp(['#1a1816', '#36302c', '#5a524c', '#8a8278', '#e0dad0'], { spec: true, line: '#0a0808' });
const TJ = { rx: 5.9, rz: 5.3, y: 0.45, h: 0.95, t: 0.42 }; // mâchoires ouvertes : demi-ellipses
const TS = { x0: 6.0, x1: 13.6 }; // ressorts : du montant au coude
function thJaw(sc, sgn) {
  const pts = [];
  for (let i = 0; i <= 14; i++) {
    const a = (i / 14) * Math.PI;
    pts.push([Math.cos(a) * TJ.rx, TJ.y, sgn * Math.sin(a) * TJ.rz]);
  }
  // la mâchoire : lame de fer posée sur chant (hauteur h), dents qui pointent vers le haut
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i], b = pts[i + 1], L = vmLen(vmSub(b, a));
    sc.push(vmChain(vmT(...vmLerp(a, b, 0.5)), vmRy(Math.atan2(b[0] - a[0], b[2] - a[2]))));
    sc.box(TH_IRON, TJ.t, TJ.h, L + 0.05, { same: i > 0 });
    sc.pop();
  }
  for (let i = 1; i < 10; i++) {
    const a = 0.26 + ((Math.PI - 0.52) * i) / 10;
    const c = [Math.cos(a) * TJ.rx, TJ.y + TJ.h / 2, sgn * Math.sin(a) * TJ.rz];
    const tg = vmUnit([-Math.sin(a) * TJ.rx, 0, sgn * Math.cos(a) * TJ.rz]);
    sc.push(vmChain(vmT(...c), vmRy(Math.atan2(tg[0], tg[2]))));
    sc.ext(TH_TOOTH, [[-0.5, -0.1], [0.5, -0.1], [0.06, 1.25]], TJ.t * 0.9);
    sc.pop();
  }
}
function thSpring(sc, sgn) {
  const X0 = sgn * TS.x0, X1 = sgn * TS.x1;
  // feuille du bas rivée sous le bout de la semelle, coude arrondi, feuille du haut serrée (piège armé) jusqu'à l'œil
  msStrap(sc, TH_SPRING, [[sgn * (TS.x0 - 1.6), -0.55, 0], [X1, -0.6, 0]], 1.35, 0.36);
  sc.push(vmChain(vmT(X1, -0.1, 0), vmRx(Math.PI / 2), vmT(0, 0, -0.68)));
  sc.cyl(TH_SPRING, 0.52, 1.36, { segs: 10, same: true });
  sc.pop();
  msStrap(sc, TH_SPRING, [[X1, 0.38, 0], [sgn * (TS.x0 + 2.6), 0.62, 0], [sgn * (TS.x0 + 0.9), 0.95, 0]], 1.25, 0.34);
  // œil : cadre carré qui enserre les bouts des mâchoires au montant
  for (const z of [-1.15, 1.15]) msStrap(sc, TH_SPRING, [[sgn * (TS.x0 - 0.9), 0.95, z], [sgn * (TS.x0 + 1.0), 0.95, z]], 0.32, 0.5);
  for (const x of [TS.x0 - 0.9, TS.x0 + 1.0]) msStrap(sc, TH_SPRING, [[sgn * x, 0.95, -1.3], [sgn * x, 0.95, 1.3]], 0.32, 0.5);
  // montant (poteau) de la semelle
  sc.push(vmT(X0, 0.2, 0)).box(TH_IRON, 0.7, 1.3, 1.1).pop();
  // rivet
  sc.push(vmChain(vmT(sgn * (TS.x0 - 0.9), -0.3, 0), vmRx(-Math.PI / 2))).cyl(TH_RUST, 0.32, 0.25, { segs: 8 }).pop();
}
// Le piège ; renvoie le point (repère courant) où pend la chaîne : l'émerillon sous la semelle
function thTrap(sc) {
  // semelle : barre le long du piège + bras en travers qui porte le chien
  sc.push(vmT(0, -0.2, 0)).box(TH_IRON, TS.x0 * 2 + 0.6, 0.45, 1.3).pop();
  sc.push(vmT(0, -0.2, -3.3)).box(TH_RUST, 1.2, 0.42, 6.8).pop();
  thJaw(sc, 1); thJaw(sc, -1);
  thSpring(sc, 1); thSpring(sc, -1);
  // palette (plaque ronde où la bête pose la patte), sur son pivot
  sc.push(vmT(0, 0.25, 0)).cyl(TH_IRON, 0.5, 0.5, { segs: 8 }).pop();
  sc.push(vmChain(vmT(0, 0.7, 0), vmRx(-Math.PI / 2))).cyl(TH_RUST, 2.4, 0.22, { segs: 18 }).pop();
  sc.push(vmChain(vmT(0, 0.93, 0), vmRx(-Math.PI / 2))).cyl(TH_IRON, 1.45, 0.08, { segs: 14 }).pop();
  // chien : barrette qui passe par-dessus la mâchoire et accroche l'encoche de la palette
  msStrap(sc, TH_IRON, [[0, 0.3, -TJ.rz - 1.4], [0, 1.55, -TJ.rz + 0.2], [0, 1.05, -2.2]], 0.75, 0.24);
  sc.push(vmT(0, 0.85, -2.35)).box(TH_IRON, 0.9, 0.5, 0.5).pop();
  // émerillon sous la semelle
  sc.push(vmChain(vmT(0.8, -0.45, 0), vmRx(Math.PI / 2))).cyl(TH_IRON, 0.45, 0.6, { segs: 8 }).pop();
  return [0.8, -1.0, 0];
}
// Repère posé en p dont l'axe +z suit dir
function thAlong(p, dir) {
  const u = vmUnit(Math.abs(dir[1]) < 0.9 ? [dir[2], 0, -dir[0]] : [1, 0, 0]);
  const v = [dir[1] * u[2] - dir[2] * u[1], dir[2] * u[0] - dir[0] * u[2], dir[0] * u[1] - dir[1] * u[0]];
  return [u[0], v[0], dir[0], p[0], u[1], v[1], dir[1], p[1], u[2], v[2], dir[2], p[2]];
}
// Chaîne (repère caméra) qui passe par les points pts : maillons ovales alternés ; anneau au bout si ring
function thChain(sc, pts, ring) {
  const L = 1.55;
  let p = pts[0], k = 0;
  for (let i = 0; i + 1 < pts.length; i++) {
    const dir = vmUnit(vmSub(pts[i + 1], pts[i]));
    const n = Math.max(1, Math.round(vmLen(vmSub(pts[i + 1], pts[i])) / L));
    for (let j = 0; j < n; j++, k++) {
      sc.push(vmChain(thAlong(p, dir), vmRz(k % 2 ? Math.PI / 2 : 0.3)));
      const o = [];
      for (let m = 0; m <= 8; m++) { const t = (m / 8) * MS_TAU; o.push([Math.cos(t) * 0.55, 0, 0.85 + Math.sin(t) * 1.05]); }
      sc.tube(TH_IRON, o, 0.17, { same: k > 0 });
      sc.pop();
      p = vmAdd(p, vmK(dir, L));
    }
  }
  if (ring) {
    const dir = vmUnit(vmSub(pts[pts.length - 1], pts[pts.length - 2]));
    sc.push(vmChain(thAlong(p, dir), vmRz(0.9)));
    const o = [];
    for (let m = 0; m <= 12; m++) { const t = (m / 12) * MS_TAU; o.push([Math.cos(t) * 1.7, 0, 1.75 + Math.sin(t) * 1.7]); }
    sc.tube(TH_IRON, o, 0.3);
    sc.pop();
  }
}
// Deux mains qui serrent les ressorts près des coudes
function thTrapHands(sc, H, skin, cloth, o = {}) {
  const c = o.curl;
  const fwd = [0, 0.3, -1];
  vmGrip(sc, [TS.x1 + 0.8, -0.1, 0], [TS.x1 - 4.9, -0.1, 0], { skin, cloth, fwd, rx: 0.95, rz: 0.75, web: 0.3, curl: c, arm: msToLocal(H, [11, -64, 50]) });
  vmGrip(sc, [-TS.x1 - 0.8, -0.1, 0], [-TS.x1 + 4.9, -0.1, 0], { skin, cloth, side: -1, fwd, rx: 0.95, rz: 0.75, web: 0.3, curl: c, arm: msToLocal(H, [-7, -64, 50]) });
}
function thTrapView(state, frame, skin, cloth) {
  const sc = vmScene();
  if (state === 'throw') {
    // posé : le piège repose à plat au sol devant soi (on est accroupi), les mains se retirent vers le bas de l'écran
    const G = [1.5, -19, 86, -0.5, 0.35];
    const H = vmChain(vmT(G[0], G[1], G[2]), vmRx(G[3]), vmRy(G[4]));
    sc.push(H);
    const sw = vmP(sc.top(), thTrap(sc));
    sc.pop();
    // chaîne couchée au sol, qui serpente vers soi
    const pts = [sw];
    for (let i = 1; i < 6; i++) pts.push(vmAdd(sw, [Math.sin(i * 0.9) * 1.6 - i * 0.5, -i * 0.5, -i * 2.2]));
    thChain(sc, pts, true);
    // mains qui viennent de lâcher : même prise que le repos, ouvertes, plus bas et plus près, qui se retirent
    const R = [3.5, -33, 52, -0.06, -0.1, -0.22];
    const HR = vmChain(vmHold(R[0], R[1], R[2], R[3]), vmRx(R[4]), vmRy(R[5]));
    sc.push(HR);
    thTrapHands(sc, HR, skin, cloth, { curl: 0.3 });
    sc.pop();
    return vmRender(sc);
  }
  const lit = state === 'lit', f = lit ? frame % 2 : 0;
  // repos : tenu armé devant soi, à deux mains ; « lit » : on s'apprête à le poser, il descend et bascule vers le sol (2 temps)
  const d = lit ? 0.45 + f * 0.4 : 0;
  const P = [2.4, -21.5, 60, -0.06, -0.45, -0.12];
  const H = vmChain(vmHold(P[0], P[1] - 7 * d, P[2] + 6 * d, P[3]), vmRx(P[4] + 0.2 * d), vmRy(P[5]));
  sc.push(H);
  const sw = vmP(sc.top(), thTrap(sc));
  thTrapHands(sc, H, skin, cloth, { curl: lit && f ? 0.85 : 1 });
  sc.pop();
  // chaîne qui pend sous le piège, un peu balancée
  const sway = f * 0.6;
  thChain(sc, [sw, vmAdd(sw, [0.6 + sway, -5, 0.6]), vmAdd(sw, [1.6 + sway * 2, -10, 1.0])], true);
  return vmRender(sc);
}

registerViewModel((id, state, frame, skin, cloth) => {
  const f = Number.isFinite(frame) ? Math.max(0, Math.floor(frame)) : 0;
  const st = state === 'lit' || state === 'throw' ? state : 'idle';
  if (id === 'molotov') return thMolotovView(st, st === 'lit' ? f % 2 : 0, skin, cloth);
  if (id === 'trap') return thTrapView(st, st === 'lit' ? f % 2 : 0, skin, cloth);
  return null;
});
