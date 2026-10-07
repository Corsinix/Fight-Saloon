// Armes en main (vue subjective) : groupe « bowharpoon ». Voir registerViewModel / VMK dans ../fpsart.js.
// L'arc des Plaines (le fusil à harpon est dessiné dans fpsart.js : ce module renvoie null pour lui).
//
// Arc court à double courbure (bois d'arc / frêne doublé de tendon, ~1,1 m), poignée gainée de cuir, corde en tendon,
// bouts recourbés vers l'avant, bandes d'ocre rouge ; flèche à long empennage de plumes, cerclages peints, pointe de
// traite en fer. Tenue d'archer droitier : main gauche au poing de l'arc tendu à bout de bras, arc de taille réelle
// incliné de 20-25° (branche du haut vers la droite), branches qui sortent par le haut et le bas de l'écran ; flèche posée
// à gauche de l'arc sur le poing, encoche à droite et sous l'œil (on voit la flèche de côté et de dessus, elle file vers
// le viseur) ; main droite qui tient la corde sous l'encoche (index au-dessus, majeur et annulaire dessous).
// Canvas plein écran 384x216 (rendu par bwRender, copie de vmRender) : à dessiner en x = 0, en bas de l'écran.
import { VMK, registerViewModel } from '../fpsart.js';

const {
  vmScene, vmChain, vmT, vmS, vmRy, vmRz, vmP, vmInv, vmAlong, vmAdd, vmSub, vmK, vmDot, vmCross, vmLen, vmUnit, vmLerp,
  vmAim, vmMatRamp, vmMat, vmRgb, VM_F, lgSE, msToLocal, canvas, OUT, shade, mix,
} = VMK;

// Tirage pseudo-aléatoire reproductible (copie de rng de fpsart.js, non exporté)
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

// --- matières de l'arc
const BW_WOOD = vmMatRamp(['#2e1406', '#5a2c0e', '#8a4c1a', '#bc7a30', '#e6b066']); // bois d'arc (oranger des Osages)
const BW_SINEW = vmMatRamp(['#4a3a26', '#7a6446', '#a88e68', '#d0b890', '#eedcb4']); // dos de tendon, corde
const BW_OCHRE = vmMatRamp(['#3a0a06', '#68160c', '#962a16', '#c04424', '#e0704a']); // bandes peintes
const BW_WRAP = vmMatRamp(['#1e0e06', '#381a0c', '#56301a', '#764a2a', '#9a6a40']); // gaine de cuir de la poignée
const BW_WRAP2 = vmMatRamp(['#140904', '#28120a', '#3e2212', '#56361e', '#704c2e']);
const BW_SHAFT = vmMatRamp(['#3a2814', '#68502e', '#9a7c50', '#c4a676', '#e8d4a8']); // fût de cornouiller
const BW_FEATH = vmMatRamp(['#4a4644', '#87807a', '#bdb5aa', '#e2dbcf', '#fbf7ee']); // plumes blanches
const BW_FTIP = vmMatRamp(['#120e0c', '#221c18', '#36302a', '#4c443c', '#6c6258']); // bout sombre des plumes
const BW_BLACK = vmMatRamp(['#0a0808', '#161212', '#241e1c', '#342c28', '#4a403a']);
const BW_IRON = vmMatRamp(['#1a1c22', '#30343e', '#505664', '#7c8494', '#d0d8e6'], { spec: true });
const BW_RAG = vmMatRamp(['#1a1008', '#2e1e10', '#463018', '#5e4424', '#7a5a34']); // chiffon huilé (flèche de feu)
const BW_TUFT = vmMatRamp(['#3a0606', '#6a0c0a', '#a01812', '#cc2c1c', '#ee5a3a']); // touffe de laine rouge

// --- main articulée : copie de vmHand (fpsart.js) avec le poignet déplaçable. vmHand pose le poignet dans le
// prolongement du manche (prise de crosse) ; la main qui tire la corde est un poing qui « tire » : poignet derrière la
// paume (o.wrist, repère local de la main), cordes en travers des doigts. o.spread ouvre les doigts (décoché).
const BW_FINGERS = [
  { dy: 0, r: 0.86, len: [4.0, 2.4, 1.9] },
  { dy: -2.05, r: 0.9, len: [4.4, 2.8, 2.0] },
  { dy: -4.0, r: 0.86, len: [4.1, 2.6, 1.9] },
  { dy: -5.75, r: 0.74, len: [3.3, 1.9, 1.7] },
];
function bwHand(sc, o) {
  const side = o.side ?? 1, rx = o.rx ?? 1.4, rz = o.rz ?? 1.8, y0 = o.y0 ?? 0;
  const sk = o.skin || '#d19a6a';
  const skin = vmMat(sk), cloth = vmMat(o.cloth || '#7a2a1e');
  const nail = vmMatRamp([shade(sk, -0.3), shade(sk, -0.1), mix(sk, '#f0d8d0', 0.5), mix(sk, '#fff0ea', 0.7), '#fff8f4']);
  sc.push(vmS(side, 1, 1));
  const ring = (th, y, off) => [Math.cos(th) * (rx + off), y, Math.sin(th) * (rz + off)];
  BW_FINGERS.forEach((f, k) => {
    const y = y0 + f.dy, r = f.r * (o.scale ?? 1);
    const th0 = -0.35;
    const knuckle = ring(th0, y, r + 0.55);
    const joints = [knuckle];
    const curl = o.curl ?? 1;
    let th = th0 + 0.25, acc = 0;
    for (const L of f.len) {
      const prev = joints[joints.length - 1], target = acc + L;
      let p = prev;
      while (acc < target && th < 4.2) {
        th += 0.04;
        const q = vmLerp(ring(th, y, r * 1.05), vmAdd(prev, vmK(vmUnit(vmSub(ring(th, y, r), prev)), L)), 1 - curl);
        acc += vmLen(vmSub(q, p));
        p = q;
      }
      joints.push(p);
    }
    for (let j = 0; j < 3; j++) sc.caps(skin, joints[j], joints[j + 1], r * (1 - j * 0.06), r * (0.94 - j * 0.06));
    const tip = joints[3], dir = vmUnit(vmSub(joints[3], joints[2]));
    const outw = vmUnit([tip[0], 0, tip[2]]);
    sc.push(vmAlong(vmAdd(vmSub(tip, vmK(dir, 0.8)), vmK(outw, r * 0.55)), vmAdd(tip, vmK(outw, r * 0.55))));
    sc.ell(nail, r * 0.55, r * 0.3, 0.55);
    sc.pop();
  });
  // paume et dos de la main
  const yc = y0 - 2.9;
  for (const [th, ry] of [[-0.55, 4.3], [-1.15, 4.4], [-1.75, 4.0]]) {
    const c = ring(th, yc, 1.25);
    sc.push(vmChain(vmT(c[0], c[1], c[2]), vmRy(-th)));
    sc.ell(skin, 1.55, ry, 2.3, { same: th !== -0.55 });
    sc.pop();
  }
  // pouce : enroulé par-dessus l'index, ou vers une cible
  const base = ring(-1.9, y0 + 0.2, 1.3);
  let tj;
  if (Array.isArray(o.thumb)) {
    const tg = o.thumb.slice(); tg[0] *= side;
    const m1 = vmLerp(base, tg, 0.45);
    tj = [base, vmAdd(m1, [-0.3, 0.6, 0]), vmLerp(m1, tg, 0.5), tg];
  } else tj = [base, ring(-2.5, y0 + 0.9, 1.4), ring(-3.05, y0 + 0.5, 1.1), ring(-3.6, y0 - 0.4, 0.9)];
  sc.caps(skin, tj[0], tj[1], 1.15, 1.0);
  sc.caps(skin, tj[1], tj[2], 1.0, 0.92);
  sc.caps(skin, tj[2], tj[3], 0.92, 0.82);
  // poignet (dans le prolongement du manche, ou derrière la paume), avant-bras et manchette
  let wrist = ring(-1.2, y0 - 7.2, 0.9);
  if (o.wrist) { wrist = o.wrist.slice(); wrist[0] *= side; }
  const arm = o.arm ? [o.arm[0] * side, o.arm[1], o.arm[2]] : vmAdd(wrist, [6, -30, -20]);
  const dir = vmUnit(vmSub(arm, wrist));
  if (o.wrist) {
    // dos de la main jusqu'au poignet : masse qui relie la paume au bras
    const pc = ring(-1.15, yc + 0.4, 1.0);
    sc.caps(skin, pc, wrist, 2.3, 2.4, { same: true });
  }
  sc.caps(skin, vmAdd(wrist, vmK(dir, -1.5)), vmAdd(wrist, vmK(dir, 3.5)), 2.5, 2.7);
  sc.caps(cloth, vmAdd(wrist, vmK(dir, 3.2)), vmAdd(wrist, vmK(dir, 6.2)), 3.4, 3.6);
  sc.caps(cloth, vmAdd(wrist, vmK(dir, 6.4)), arm, 3.5, 4.4);
  sc.pop();
  return sc;
}
// Main sur un manche du repère courant, de b (auriculaire) à t (index) ; fwd : côté où passent les doigts ;
// arm / thumb / wrist donnés dans le repère courant (copie de vmGrip, avec le poignet)
function bwGrip(sc, b, t, o) {
  const up = vmUnit(vmSub(t, b));
  let fwd = o.fwd || [0, 0, 1];
  fwd = vmUnit(vmSub(fwd, vmK(up, vmDot(fwd, up))));
  const x = vmCross(up, fwd);
  const F = [x[0], up[0], fwd[0], t[0], x[1], up[1], fwd[1], t[1], x[2], up[2], fwd[2], t[2]];
  const inv = vmInv(F);
  const loc = (p) => (Array.isArray(p) ? vmP(inv, p) : p);
  sc.push(F);
  bwHand(sc, { ...o, thumb: loc(o.thumb), arm: o.arm && loc(o.arm), wrist: o.wrist && loc(o.wrist) });
  sc.pop();
}

// --- dimensions (cm, « arc de jeu ») : demi-longueur, demi-poignée, bande, allonge à fond, flèche
const BW = { H: 54, G: 6, B: 14, D: 38, A: 64, yc: -3 };

// Pièce balayée le long d'une courbe : sections super-ellipses de demi-largeur ha(u) selon side et hb(u) dans le plan
function bwSweep(sc, mat, pts, ha, hb, side, o = {}) {
  const N = o.n || 10, pw = o.p || 2.4, R = [], tris = [];
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const tg = vmUnit(vmSub(pts[Math.min(i + 1, n - 1)], pts[Math.max(i - 1, 0)]));
    const a = vmUnit(vmSub(side, vmK(tg, vmDot(side, tg)))), b = vmCross(tg, a);
    const u = i / (n - 1), A = typeof ha === 'function' ? ha(u) : ha, B = typeof hb === 'function' ? hb(u) : hb;
    const ring = [];
    for (let j = 0; j < N; j++) {
      const [ux, uy, nx, ny] = lgSE((j / N) * Math.PI * 2, pw);
      ring.push([vmAdd(pts[i], vmAdd(vmK(a, ux * A), vmK(b, uy * B))), vmUnit(vmAdd(vmK(a, nx / A), vmK(b, ny / B)))]);
    }
    R.push(ring);
  }
  for (let i = 0; i + 1 < n; i++) for (let j = 0; j < N; j++) {
    const k = (j + 1) % N, A = R[i], B = R[i + 1];
    tris.push([[A[j][0], A[k][0], B[k][0]], [A[j][1], A[k][1], B[k][1]]]);
    tris.push([[A[j][0], B[k][0], B[j][0]], [A[j][1], B[k][1], B[j][1]]]);
  }
  for (const [ri, d] of [[0, -1], [n - 1, 1]]) {
    const r = R[ri], c = pts[ri], nz = vmK(vmUnit(vmSub(pts[Math.min(n - 1, ri + 1)], pts[Math.max(0, ri - 1)])), d);
    for (let j = 0; j < N; j++) tris.push([[c, r[j][0], r[(j + 1) % N][0]], [nz, nz, nz]]);
  }
  return sc.emit(mat, tris, o.same);
}

// --- l'arc, dans son repère : x vers la droite de l'archer (côté opposé à la flèche), y le long de l'arc (branche du
// haut), z vers la cible ; origine = appui de la flèche (sur le poing). k : tension 0..1, string : corde ('rest', un
// point d'encoche [x, y, z], ou 'twang' : corde qui vibre)
// Ligne médiane : t ∈ [-1, 1] du bout bas au bout haut
function bwMid(t, k) {
  const a = Math.abs(t), s = Math.sign(t) || 1, { H, G, B, yc } = BW;
  const g = G / H;
  // les bouts reculent vers l'archer en bandant, la courbure de la branche se creuse ; le bout recourbé s'ouvre
  const tipBack = B + k * BW.D * 0.3;
  const l = Math.max(0, (a - g) / (1 - g));
  let z = -tipBack * (0.55 * l * l + 0.45 * l ** 3.2) * 1.06;
  // double courbure des Plaines : la branche part un peu vers l'avant au sortir de la poignée
  z += 1.4 * (1 - k * 0.6) * Math.sin(Math.PI * Math.min(1, l / 0.45)) * (l < 0.45 ? 1 : 0);
  // bout recourbé vers la cible (recurve), qui se déroule sous la tension
  const rc = Math.max(0, (l - 0.8) / 0.2);
  z += (3.4 - 1.6 * k) * rc * rc;
  // la branche raccourcit un peu quand elle plie
  if (a < g) return [1.3, yc + t * H, 0];
  return [1.3, yc + s * (G + (H - G) * l) * (1 - 0.07 * k * l * l), z];
}
// Bout de la corde (encoche du bout de branche)
const bwTip = (s, k) => bwMid(s * 0.985, k);

function bwBow(sc, k, string) {
  const side = [1, 0, 0];
  // branches : sections larges et plates (largeur selon x, épaisseur dans le plan), qui s'amincissent vers les bouts
  for (const s of [-1, 1]) {
    const pts = [];
    for (let i = 0; i <= 20; i++) pts.push(bwMid(s * (BW.G / BW.H + (1 - BW.G / BW.H) * (i / 20)), k));
    bwSweep(sc, BW_WOOD, pts, (u) => 1.55 - 0.85 * u, (u) => 0.8 - 0.36 * u, side, { n: 10, p: 2.8 });
    // dos de tendon (côté cible) : liseré clair
    bwSweep(sc, BW_SINEW, pts.map((p, i) => vmAdd(p, [0, 0, 0.62 - 0.3 * (i / 20)])), (u) => 1.4 - 0.78 * u, 0.22, side, { n: 8, p: 2.8, same: true });
    // bandes d'ocre peintes et ligatures de tendon près de la poignée et vers le bout
    for (const [u0, u1, m] of [[0.03, 0.09, BW_SINEW], [0.11, 0.14, BW_OCHRE], [0.7, 0.76, BW_OCHRE], [0.79, 0.81, BW_BLACK]]) {
      const seg = [];
      for (let i = 0; i <= 3; i++) seg.push(bwMid(s * (BW.G / BW.H + (1 - BW.G / BW.H) * (u0 + ((u1 - u0) * i) / 3)), k));
      const u = (u0 + u1) / 2;
      bwSweep(sc, m, seg, 1.62 - 0.85 * u + 0.08, 0.86 - 0.36 * u + 0.07, side, { n: 10, p: 2.8 });
    }
    // bout de branche : petit bouton d'encoche
    const tp = bwMid(s, k);
    sc.push(vmT(...tp)).ell(BW_SINEW, 0.75, 0.75, 0.75).pop();
  }
  // poignée gainée de cuir : bandes torsadées alternées
  const g0 = BW.yc - BW.G - 0.4, g1 = BW.yc + BW.G + 0.4;
  for (let i = 0; i < 9; i++) {
    const ya = g0 + ((g1 - g0) * i) / 9, yb = g0 + ((g1 - g0) * (i + 1)) / 9;
    bwSweep(sc, i % 2 ? BW_WRAP2 : BW_WRAP, [[1.3, ya, 0.05], [1.3, yb, 0.05]], 1.75, 1.15, side, { n: 12, p: 2.4, same: i > 0 });
  }
  // touffe de laine rouge et plume d'aigle nouées près du bout de la branche haute : elles pendent (bas de la caméra)
  const m = sc.top(), down = vmUnit([-m[4], -m[5], -m[6]]);
  const tf = vmAdd(bwMid(0.8, k), [0.9, 0, 0]);
  sc.push(vmT(...tf)).ell(BW_SINEW, 1.0, 0.7, 1.0).pop();
  for (const [dx, len] of [[-0.35, 3.4], [0.35, 2.8]]) {
    const a = vmAdd(tf, [0, dx, 0]), b = vmAdd(a, vmK(down, len));
    sc.caps(BW_TUFT, a, b, 0.5, 0.42);
  }
  const fa = vmAdd(tf, vmK(down, 1.2)), fb = vmAdd(fa, vmAdd(vmK(down, 6.5), [0, 0.8, 0]));
  sc.push(vmAlong(fa, fb));
  sc.ext(BW_FEATH, [[0, 0], [1.0, 0.65], [4.2, 0.95], [5.8, 0.5], [6.6, 0]], 0.12);
  sc.ext(BW_FTIP, [[4.2, 0.02], [5.8, 0.5], [6.6, 0], [4.6, -0.02]], 0.16);
  sc.pop();
  // corde de tendon
  const top = bwTip(1, k), bot = bwTip(-1, k), r = 0.24;
  if (Array.isArray(string)) {
    sc.caps(BW_SINEW, top, string, r, r);
    sc.caps(BW_SINEW, string, bot, r, r, { same: true });
  } else if (string === 'twang') {
    // corde qui vibre : deux positions fantômes de part et d'autre
    const mid = vmLerp(top, bot, 0.5);
    for (const d of [-1.1, 1.1]) {
      const m = vmAdd(mid, [d * 0.9, 0, d * 1.4]);
      sc.caps(BW_SINEW, top, m, r * 0.85, r * 0.85);
      sc.caps(BW_SINEW, m, bot, r * 0.85, r * 0.85, { same: true });
    }
  } else if (string === 'twang2') {
    const m = vmAdd(vmLerp(top, bot, 0.5), [0.5, 0, 0.7]);
    sc.caps(BW_SINEW, top, m, r, r);
    sc.caps(BW_SINEW, m, bot, r, r, { same: true });
  } else sc.caps(BW_SINEW, top, bot, r, r);
}

// --- la flèche, de l'encoche (z = 0) vers la pointe (+z) ; fire : chiffon enroulé derrière la pointe
function bwArrow(sc, o = {}) {
  const L = BW.A;
  sc.cyl(BW_SHAFT, 0.42, L - 3.2, { segs: 8 });
  // encoche (bouton sombre fendu)
  sc.push(vmT(0, 0, -0.6)).cyl(BW_BLACK, 0.4, 0.8, { segs: 8 }).pop();
  // cerclages peints : rouge, noir, rouge
  for (const [z, w, m] of [[11.6, 1.0, BW_OCHRE], [12.8, 0.4, BW_BLACK], [13.4, 0.7, BW_OCHRE]]) sc.push(vmT(0, 0, z)).cyl(m, 0.42, w, { segs: 8 }).pop();
  // empennage : trois plumes longues et basses, plume coq vers le haut (hors de l'arc)
  for (let i = 0; i < 3; i++) {
    const a = Math.PI / 2 + (i * Math.PI * 2) / 3;
    sc.push(vmRz(a));
    sc.push(vmChain(vmT(0.36, 0, 0), vmRz(Math.PI / 2)));
    // profil (z, h) : bout arrière haut, ligne qui descend vers l'avant
    sc.ext(BW_FEATH, [[1.2, 0], [10.6, 0], [10.0, 0.4], [6.0, 1.15], [2.4, 1.55], [1.4, 1.6]], 0.14);
    sc.ext(BW_FTIP, [[1.0, 0.02], [2.8, 0.02], [2.4, 1.6], [1.2, 1.65]], 0.16);
    sc.pop();
    sc.pop();
  }
  // ligatures de tendon aux deux bouts de l'empennage et sous la pointe
  for (const z of [0.6, 10.6]) sc.push(vmT(0, 0, z)).cyl(BW_SINEW, 0.44, 0.7, { segs: 8 }).pop();
  sc.push(vmT(0, 0, L - 3.6)).cyl(BW_SINEW, 0.46, 1.0, { segs: 8 }).pop();
  if (o.fire) sc.push(vmT(0, 0, L - 6.2)).ell(BW_RAG, 0.95, 0.95, 1.7).pop();
  // pointe de traite en fer : triangle plat posé à plat (on voit sa face), barbillons
  // la flèche file loin de l'œil : on tourne la pointe pour que sa face regarde le haut de la caméra (on la voit de dessus)
  const m = sc.top(), face = Math.atan2(m[5], m[4]);
  sc.push(vmChain(vmT(0, 0, L - 3.4), vmRz(face)));
  sc.ext(BW_IRON, [[-0.7, 0.42], [0.6, 1.9], [2.6, 1.6], [6.8, 0.0], [2.6, -1.6], [0.6, -1.9], [-0.7, -0.42]], 0.32);
  sc.pop();
  return [0, 0, L + 2.8];
}

// --- rendu plein écran : copie de vmRender (fpsart.js) pour un canvas de BW_CW x BW_CH posé en bas de l'écran 384x216
// (même focale VM_F, viseur en (192, BW_CH - 108)) : l'arc tenu à bout de bras dépasse la fenêtre 200x130 habituelle.
const BW_CW = 384, BW_CH = 216;
const bwProj = (p) => [192 + (VM_F * p[0]) / p[2], BW_CH - 108 - (VM_F * p[1]) / p[2]];
// Point caméra qui tombe en (cx, cy) du canvas à la profondeur z
const bwUn = (cx, cy, z) => [((cx - 192) * z) / VM_F, (-(cy - (BW_CH - 108)) * z) / VM_F, z];
const bwIn = (x, y) => x >= 0 && x < BW_CW && y >= 0 && y < BW_CH;
const BW_LIGHT = vmUnit([-0.55, 0.72, -0.45]);
const BW_BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
// Pinceau minimal (copie de pen : pixel, rectangle, polygone plein)
function bwPen(c) {
  const ctx = c.getContext('2d'), rd = Math.round;
  const R = (x, y, w, h, col) => { if (w <= 0 || h <= 0) return; ctx.fillStyle = col; ctx.fillRect(rd(x), rd(y), rd(w), rd(h)); };
  const P = (x, y, col) => R(x, y, 1, 1, col);
  const poly = (pts, col) => {
    const ys = pts.map((q) => q[1]);
    const y0 = Math.floor(Math.min(...ys)), y1 = Math.ceil(Math.max(...ys));
    for (let y = y0; y <= y1; y++) {
      const yc = y + 0.5, xs = [];
      for (let i = 0; i < pts.length; i++) {
        const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % pts.length];
        if ((ay <= yc && by > yc) || (by <= yc && ay > yc)) xs.push(ax + ((yc - ay) / (by - ay)) * (bx - ax));
      }
      xs.sort((a, b) => a - b);
      for (let i = 0; i + 1 < xs.length; i += 2) R(rd(xs[i]), y, rd(xs[i + 1]) - rd(xs[i]), 1, col);
    }
  };
  return { ctx, R, P, poly };
}
function bwRender(sc, fxs) {
  const W = BW_CW, H = BW_CH, N = W * H;
  const zb = new Float32Array(N).fill(1e9), pid = new Int32Array(N), lv = new Uint8Array(N), mats = new Array(N);
  for (const t of sc.tris) {
    const [a, b, c] = t.p;
    if (a[2] < 3 || b[2] < 3 || c[2] < 3) continue;
    const A = bwProj(a), B = bwProj(b), C = bwProj(c);
    const area = (B[0] - A[0]) * (C[1] - A[1]) - (B[1] - A[1]) * (C[0] - A[0]);
    if (Math.abs(area) < 1e-7) continue;
    const x0 = Math.max(0, Math.floor(Math.min(A[0], B[0], C[0]))), x1 = Math.min(W - 1, Math.ceil(Math.max(A[0], B[0], C[0])));
    const y0 = Math.max(0, Math.floor(Math.min(A[1], B[1], C[1]))), y1 = Math.min(H - 1, Math.ceil(Math.max(A[1], B[1], C[1])));
    const iza = 1 / a[2], izb = 1 / b[2], izc = 1 / c[2];
    const [na, nb, nc] = t.n;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const px = x + 0.5, py = y + 0.5;
      const w0 = ((B[0] - px) * (C[1] - py) - (B[1] - py) * (C[0] - px)) / area;
      const w1 = ((C[0] - px) * (A[1] - py) - (C[1] - py) * (A[0] - px)) / area;
      const w2 = 1 - w0 - w1;
      if (w0 < -1e-5 || w1 < -1e-5 || w2 < -1e-5) continue;
      const z = 1 / (w0 * iza + w1 * izb + w2 * izc), i = y * W + x;
      if (z >= zb[i]) continue;
      const k0 = w0 * iza * z, k1 = w1 * izb * z, k2 = w2 * izc * z;
      let n = vmUnit([k0 * na[0] + k1 * nb[0] + k2 * nc[0], k0 * na[1] + k1 * nb[1] + k2 * nc[1], k0 * na[2] + k1 * nb[2] + k2 * nc[2]]);
      const p = [k0 * a[0] + k1 * b[0] + k2 * c[0], k0 * a[1] + k1 * b[1] + k2 * c[1], z];
      const V = vmUnit(vmK(p, -1));
      if (vmDot(n, V) < 0) n = vmK(n, -1);
      const d = Math.max(0, vmDot(n, BW_LIGHT));
      const I = 0.2 + 0.8 * d + (BW_BAYER[(y & 3) * 4 + (x & 3)] - 7.5) * 0.003;
      let l = I < 0.34 ? 0 : I < 0.54 ? 1 : I < 0.76 ? 2 : 3;
      if (t.mat.spec && vmDot(n, vmUnit(vmAdd(BW_LIGHT, V))) ** 36 > 0.45) l = 4;
      zb[i] = z; pid[i] = t.id; lv[i] = l; mats[i] = t.mat;
    }
  }
  const cv = canvas(W, H), ctx = cv.getContext('2d');
  const img = ctx.createImageData(W, H), D = img.data;
  const out = vmRgb(OUT);
  const put = (i, rgb) => { D[i * 4] = rgb[0]; D[i * 4 + 1] = rgb[1]; D[i * 4 + 2] = rgb[2]; D[i * 4 + 3] = 255; };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (!mats[i]) {
      if ((x > 0 && mats[i - 1]) || (x < W - 1 && mats[i + 1]) || (y > 0 && mats[i - W]) || (y < H - 1 && mats[i + W])) put(i, out);
      continue;
    }
    let crease = false;
    for (const j of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, y > 0 ? i - W : -1, y < H - 1 ? i + W : -1]) {
      if (j < 0 || !mats[j]) continue;
      const dz = zb[i] - zb[j];
      if ((pid[j] !== pid[i] && dz > 0.25) || dz > 1.2 + zb[i] * 0.03) { crease = true; break; }
    }
    put(i, crease ? mats[i].line : mats[i].rgb[lv[i]]);
  }
  ctx.putImageData(img, 0, 0);
  const p = bwPen(cv);
  for (const fx of fxs) fx(p);
  // alpha tout ou rien
  const im2 = ctx.getImageData(0, 0, W, H), d2 = im2.data;
  for (let i = 3; i < d2.length; i += 4) d2[i] = d2[i] >= 128 ? 255 : 0;
  ctx.putImageData(im2, 0, 0);
  return cv;
}

// Flamme 2D au bout de la flèche : langues tremblantes, cœur clair, escarbilles (sz : échelle)
function bwFlame(p, x, y, seed, sz = 1) {
  const rand = rng(seed);
  const P = (px, py, col) => { if (bwIn(px, py)) p.P(Math.round(px), Math.round(py), col); };
  const cols = ['#a8200a', '#e05414', '#f89a26', '#ffd860', '#fff6c8'];
  for (let k = 0; k < cols.length; k++) {
    const s = (1 - k * 0.18) * sz, pts = [];
    const h = 16 * s, w = 5.4 * s;
    for (let i = 0; i <= 12; i++) {
      const a = (i / 12) * Math.PI * 2, c = Math.cos(a), sn = Math.sin(a);
      // goutte : ronde en bas, effilée en haut, langue qui penche
      const up = sn < 0 ? -sn : 0, lean = up * up * (2.4 + rand() * 1.2) * sz;
      const rr = sn < 0 ? w * (1 - up * 0.85) : w;
      pts.push([x + c * rr + lean, y + 2 - (sn < 0 ? up * h : -sn * w * 0.6)]);
    }
    p.poly(pts, cols[k]);
  }
  // langues secondaires et escarbilles
  for (let i = 0; i < 2; i++) {
    const ox = ((i ? 3 : -3) + rand() * 1.5) * sz, h = (5 + rand() * 4) * sz;
    p.poly([[x + ox - 1.5 * sz, y], [x + ox + 1.5 * sz, y], [x + ox + (1 + rand()) * sz, y - h]], i ? '#f89a26' : '#e05414');
  }
  for (let i = 0; i < 7; i++) P(x + (rand() * 2 - 1) * 6 * sz, y - (12 + rand() * 9) * sz, rand() < 0.5 ? '#ffd040' : '#ff8a20');
}

// --- poses : n = encoche de la flèche (main droite) en caméra (cm, x à droite, y en haut, z devant l'œil) : à droite et
// sous l'œil, la flèche est vue de côté et de dessus et file vers le viseur au loin (conv) ; cant : inclinaison de
// l'arc (rad depuis la verticale, branche du haut vers la droite) ; k : tension ; arrow : flèche encochée ('nocked') ou
// absente ; hand : main droite ('string' sur la corde, 'away' partie au carquois ou en arrière après le décoché,
// 'bring' qui apporte la flèche, posée en rh = (cx, cy, z) du canvas)
const BW_YAW = 0.08;
const BW_P = {
  idle: [{ n: [5.5, -10.5, 33], cant: 0.44, k: 0.48, arrow: 'nocked', hand: 'string' }],
  draw: [
    { n: [5, -9, 29], cant: 0.42, k: 0.68, arrow: 'nocked', hand: 'string' },
    { n: [4.5, -7, 21], cant: 0.4, k: 1, arrow: 'nocked', hand: 'string', fire: true },
  ],
  fire: [
    { n: [4.5, -7.5, 21], cant: 0.42, k: 0, arrow: 'none', twang: true, hand: 'away', kn: 1 },
    { n: [5, -9.5, 29], cant: 0.44, k: 0, arrow: 'none', hand: 'away', twang2: true, kn: 0.68 },
  ],
  reload: [
    { n: [7, -16, 44], cant: 0.56, k: 0, arrow: 'none', hand: 'away', kn: 0.35 },
    { n: [6.5, -13.5, 42], cant: 0.5, k: 0, arrow: 'bring', hand: 'bring', rh: [300, 196, 28], kn: 0.35 },
    { n: [6, -11.5, 37], cant: 0.45, k: 0.35, arrow: 'nocked', hand: 'string' },
  ],
};

function bwView(state, frame, skin, cloth) {
  const L = BW_P[state] || BW_P.idle, P = L[frame] || L[0];
  // TUNE (dev) : réglages de pose passés par globalThis.__TUNE.bow (comme les autres armes en main)
  const TU = (globalThis.__TUNE && globalThis.__TUNE.bow) || {};
  const Q = { ...P, ...(TU.all || {}), ...(TU[state + frame] || {}) };
  const sc = vmScene(), fxs = [];
  // l'appui de la flèche est devant l'encoche, à la distance de la tension (kn : tension de la pose quand la corde
  // est relâchée, pour garder l'arc à la même place)
  const conv = Q.conv || 700, N = Q.n, dir = vmUnit(vmSub([0, 0, conv], N));
  const restZ = bwTip(1, 0)[2];
  const O = vmAdd(N, vmK(dir, -restZ + (Q.kn ?? Q.k) * BW.D));
  // repère de la flèche (visée sur le viseur au loin), arc incliné autour d'elle
  const F = vmChain(vmAim(O[0], O[1], O[2], 0, conv), vmRz(-Q.cant));
  // toute la tenue pivote un peu vers la gauche autour de l'œil (comme dans les FPS : l'arc à gauche, la pointe sous le
  // viseur ; la flèche vise alors à BW_YAW près du viseur)
  const RY = vmRy(-(Q.yaw ?? BW_YAW));
  sc.push(RY);
  sc.push(F);
  const k = Q.k;
  // encoche : corde au repos, ou tirée de l'allonge
  const nz = restZ - k * BW.D;
  bwBow(sc, k, Q.twang ? 'twang' : Q.twang2 ? 'twang2' : k > 0 ? [1.3, 0, nz] : 'rest');
  let tip = null;
  if (Q.arrow === 'nocked') {
    sc.push(vmT(0, 0, nz));
    tip = vmP(sc.top(), bwArrow(sc, { fire: Q.fire }));
    sc.pop();
  }
  // main gauche : serre la poignée, dos de la main vers le haut, doigts qui passent devant ; avant-bras vers le bas
  const LK = 1.22;
  sc.push(vmChain(vmT(1.3, BW.yc, 0), vmS(LK, LK, LK), vmT(-1.3, -BW.yc, 0)));
  bwGrip(sc, [1.3, BW.yc - BW.G / LK + 0.6, 0.05], [1.3, BW.yc + BW.G / LK - 0.9, 0.05], {
    skin, cloth, side: -1, rx: 1.75 / LK, rz: 1.25 / LK, fwd: TU.lf || [-0.6, 0, 0.8], curl: 0.9,
    arm: vmAdd(vmK(vmSub(msToLocal(F, TU.al || [-18, -34, 8]), [1.3, BW.yc, 0]), 1 / LK), [1.3, BW.yc, 0]), wrist: TU.lw || [4.0, BW.yc - 1.0, -4.5],
  });
  sc.pop();
  // main droite sur la corde : poing qui tire, cordes en travers des doigts (index au-dessus de l'encoche)
  const armR = msToLocal(F, TU.ar || [24, -26, 5]);
  if (Q.hand === 'string') {
    const base = [0.4, 0.9, nz];
    bwGrip(sc, vmAdd(base, [0, -5.8, 0]), base, {
      skin, cloth, side: 1, rx: 0.42, rz: 0.42, fwd: TU.rf || [0, 0, 1], curl: 1, arm: armR,
      wrist: vmAdd(base, TU.rw || [2.5, -2.8, -6]),
    });
  }
  sc.pop();
  // main droite qui apporte une flèche tirée du carquois : la tient par l'encoche, pointe vers l'arc
  if (Q.hand === 'bring') {
    const H = bwUn(...Q.rh), T = vmP(F, [-4, 3, 40]);
    const d = vmUnit(vmSub(T, H));
    sc.push(vmAlong(vmAdd(H, vmK(d, -1.2)), T));
    bwArrow(sc);
    sc.stack.pop();
    sc.push(vmT(0, 0, 0));
    bwGrip(sc, vmAdd(H, vmK(d, -5.0)), vmAdd(H, vmK(d, 0.6)), { skin, cloth, side: 1, rx: 0.42, rz: 0.42, fwd: [0.4, 1, 0.2], curl: 1,
      arm: [26, -30, 6], wrist: vmAdd(H, [3.5, -3.5, -3]) });
    sc.stack.pop();
  }
  if (tip && Q.fire) fxs.push((p) => { const [x, y] = bwProj(tip); bwFlame(p, x, y - 1, 3, 1.25); });
  if (state === 'fire' && frame === 0) {
    fxs.push((p) => {
      // la flèche file vers le viseur : traînée en pointillé qui s'amenuise
      const RF = vmChain(RY, F), t0 = bwProj(vmP(RF, [0, 0, BW.A])), [X, Y] = bwProj(vmP(RF, [0, 0, 5000]));
      for (let i = 0; i < 16; i++) {
        const t = 0.1 + (i / 16) * 0.8, x = t0[0] + (X - t0[0]) * t, y = t0[1] + (Y - t0[1]) * t;
        if (bwIn(x, y) && i % 3 !== 2) p.P(Math.round(x), Math.round(y), i > 11 ? '#fff8e0' : '#c8bca4');
      }
    });
  }
  sc.pop();
  return bwRender(sc, fxs);
}

registerViewModel((id, state, frame, skin, cloth) => {
  if (id !== 'bow') return null;
  const f = Number.isFinite(frame) ? Math.max(0, Math.floor(frame)) : 0;
  const st = BW_P[state] ? state : 'idle';
  return bwView(st, Math.min(f, BW_P[st].length - 1), skin, cloth);
});
