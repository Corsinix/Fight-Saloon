// Armes en main (vue subjective) : groupe « heavy ». Voir registerViewModel / VMK dans ../fpsart.js.
// coehorn : mortier Coehorn (modèle américain de 24 livres, 1838-1841) porté à deux mains par les poignées de son bloc.
// (La canardière est dessinée dans fpsart.js : ce module renvoie null pour 'puntgun'.)
import { VMK, registerViewModel } from '../fpsart.js';

const {
  vmScene, vmRender, vmChain, vmT, vmS, vmRx, vmRy, vmP, vmAdd, vmProj, vmHold, vmGrip, vmMatRamp, vmFlash,
  MS_IRON, VM_BRASS, VM_DARK, VM_FUSE, VM_W, VM_F, msFlashR, msSag, msSparks, lgLoft, lgStrip,
} = VMK;

// Petit générateur pseudo-aléatoire déterministe (rng n'est pas exporté par fpsart.js)
function hvRng(seed) {
  let s = (seed * 2654435761) >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

// --- matières : bronze à canon (plus brun et plus mat que le laiton), chêne du bloc, fer forgé des ferrures
const HV_BRONZE = vmMatRamp(['#2a1a0c', '#58381a', '#8e622e', '#c4934c', '#f6dc9c'], { spec: true });
const HV_BRONZE_D = vmMatRamp(['#1e1208', '#422a12', '#6a4822', '#946834', '#c89c5c']); // bandeaux patinés
const HV_OAK = vmMatRamp(['#2a180a', '#4e3016', '#7a5028', '#a67640', '#cca066']);
const HV_PATINA = vmMatRamp(['#1c1810', '#2e2a1a', '#46442a', '#5e5e3c', '#7c7c54']); // vert-de-gris dans les creux
const HV_OAK_G = vmMatRamp(['#1c0e06', '#34200e', '#523418', '#704c26', '#8e6838']); // fil du bois, fentes

// ================================================================== mortier Coehorn
// Repère du mortier (cm, réduit d'environ moitié comme la Gatling, pour tenir dans les mains) : bloc de chêne posé à
// plat, dessus du bloc en y = 0, axe des tourillons selon x en (y = HV_TY, z = HV_TZ), avant du bloc vers +z.
// Le tube de bronze est incliné de HV_ELEV (le Coehorn tirait à 45° fixe) : bouche vers le haut-avant.
const HV_BED = { w: 18, h: 7.5, z0: -13, z1: 13 }; // bloc : largeur, hauteur, arrière et avant
const HV_TY = 2.4, HV_TZ = -4.5, HV_ELEV = Math.PI / 4;
// tube trapu (le vrai : 41 cm de long pour 14,8 cm de calibre) : longueur depuis les tourillons, rayons du corps et de l'âme
const HV_TUBE_L = 15.6, HV_R = 6.4, HV_BORE = 4.3;
// Profil du tube [z, rayon] : culasse en demi-sphère, renfort, volée légèrement conique, astragale, bourrelet de bouche
const HV_PROF = [
  [-5.8, 0.6], [-5.5, 2.6], [-4.7, 4.3], [-3.4, 5.5], [-1.8, 6.2], [0, HV_R], [4.8, 6.3], [5.2, 6.75], [6.3, 6.75],
  [6.7, 6.1], [12.0, 5.8], [12.4, 6.3], [13.0, 6.3], [13.4, 5.9], [14.0, 6.0], [14.5, 6.7], [HV_TUBE_L, 6.7],
];
// repère du tube (dans celui du mortier) : origine sur l'axe des tourillons, +z le long de l'âme
const HV_TUBE = vmChain(vmT(0, HV_TY, HV_TZ), vmRx(-HV_ELEV));
// poignées de fer : x (flanc), y, début et fin en z (deux de chaque côté, comme sur le vrai bloc)
// échelle du modèle (les mains, elles, restent à taille réelle)
const HV_K = 0.66;
const HV_HANDLE = { x: HV_BED.w / 2 + 2.4, y: -1.8, rear: [-11.0, -4.0], front: [4.0, 11.0] };

function hvCoehorn(sc, o = {}) {
  const B = HV_BED, hw = B.w / 2, cx = HV_R + 1.3; // cx : milieu des flasques
  sc.push(vmS(HV_K, HV_K, HV_K));
  // --- bloc de chêne : arêtes arrière chanfreinées (le chanfrein du haut prend la lumière)
  const ch = 1.7;
  sc.ext(HV_OAK, [[B.z0, -B.h + ch * 0.6], [B.z0 + ch * 0.6, -B.h], [B.z1, -B.h], [B.z1, 0], [B.z0 + ch, 0], [B.z0, -ch]], B.w);
  // flasques : deux joues qui montent sous les tourillons (le tube est pris entre elles) ; faces franches, sans pente,
  // pour que la trame de lumière ne fourmille pas
  for (const s of [-1, 1]) {
    sc.push(vmT(s * cx, (HV_TY + 0.4) / 2, HV_TZ)); sc.box(HV_OAK, 2.6, HV_TY + 0.4, 10.0); sc.pop();
    sc.push(vmT(s * cx, HV_TY + 0.4, HV_TZ - 5.0)); sc.box(HV_OAK_G, 2.62, 0.05, 0.25, { same: true }); sc.pop();
  }
  // veinage du dessus : filets sombres le long de z (cachés sous les flasques et le tube là où ils passent dessous)
  const rand = hvRng(7);
  for (const x of [-7.9, -6.2, -4.1, -1.6, 1.3, 3.8, 6.0, 8.0]) {
    const xx = x + (rand() - 0.5) * 0.4, za = B.z0 + 1.0 + rand() * 2, zb = B.z1 - 0.6 - rand() * 5;
    sc.push(vmT(xx, 0.02, (za + zb) / 2)); sc.box(HV_OAK_G, 0.2, 0.04, zb - za, { same: true }); sc.pop();
  }
  // face arrière (vers nous) : fil du bois de bout, cornière de fer rivée et têtes des boulons traversants
  for (const [y, w] of [[-3.0, B.w - 2.4], [-4.3, B.w - 5.0]]) {
    sc.push(vmT(0, y, B.z0 - 0.02)); sc.box(HV_OAK_G, w, 0.22, 0.04, { same: true }); sc.pop();
  }
  sc.push(vmT(0, -B.h + 1.2, B.z0 - 0.1)); sc.box(MS_IRON, B.w - 1.0, 1.3, 0.2); sc.pop();
  for (const x of [-hw + 1.4, -2.2, 2.2, hw - 1.4]) { sc.push(vmT(x, -B.h + 1.2, B.z0 - 0.22)); sc.ell(MS_IRON, 0.36, 0.36, 0.18); sc.pop(); }
  for (const x of [-cx, cx]) {
    sc.push(vmChain(vmT(x, -2.4, B.z0 - 0.05), vmRx(Math.PI))); sc.cyl(MS_IRON, 0.75, 0.3, { segs: 6 }); sc.pop();
    sc.push(vmT(x, -2.4, B.z0 - 0.36)); sc.ell(VM_BRASS, 0.22, 0.22, 0.1); sc.pop();
  }
  // bandes de fer qui ceinturent le bloc (dessus et flancs), avec leurs clous
  for (const z of [B.z0 + 1.5, B.z1 - 1.5]) {
    sc.push(vmT(0, 0.08, z)); sc.box(MS_IRON, B.w + 0.3, 0.16, 1.4); sc.pop();
    for (const s of [-1, 1]) { sc.push(vmT(s * (hw + 0.08), -B.h / 2, z)); sc.box(MS_IRON, 0.16, B.h, 1.4, { same: true }); sc.pop(); }
    for (const s of [-1, 1]) for (const xx of [hw - 1.0, HV_R - 0.5]) { sc.push(vmT(s * xx, 0.22, z)); sc.ell(MS_IRON, 0.34, 0.24, 0.34); sc.pop(); }
  }
  // --- poignées de transport : étriers de fer forgé, deux par flanc, sur platines rivées
  const H = HV_HANDLE;
  for (const s of [-1, 1]) for (const [za, zb] of [H.rear, H.front]) {
    const x0 = s * (hw + 0.1), x1 = s * H.x;
    sc.tube(MS_IRON, [[x0, H.y, za - 0.8], [x1, H.y, za], [x1, H.y, zb], [x0, H.y, zb + 0.8]], 0.45);
    for (const z of [za - 0.8, zb + 0.8]) { sc.push(vmT(x0 + s * 0.12, H.y, z)); sc.box(MS_IRON, 0.25, 2.2, 1.6); sc.pop(); }
  }
  // --- tube de bronze (repère du tube)
  sc.push(HV_TUBE);
  lgLoft(sc, HV_BRONZE, HV_PROF.map(([z, r]) => [z, 0, r, r]), { n: 24, p: 2 });
  // bandeaux patinés : renfort et astragale
  for (const [z, l, r] of [[5.2, 1.1, 6.82], [12.4, 0.6, 6.36]]) { sc.push(vmT(0, 0, z)); sc.cyl(HV_BRONZE_D, r, l, { segs: 24 }); sc.pop(); }
  // patine : coulures sombres et vert-de-gris sous les bandeaux, un liseré clair sur l'arête de la bouche
  const st = HV_PROF.map(([z, r]) => [z, 0, r, r]);
  for (const [z0, z1, a, w, m] of [[6.8, 8.2, 2.2, 0.07, HV_PATINA], [13.5, 14.2, 2.0, 0.08, HV_PATINA], [7.0, 10.6, 0.95, 0.035, HV_BRONZE_D],
    [6.8, 7.6, 3.5, 0.08, HV_PATINA], [1.5, 4.4, 2.75, 0.04, HV_BRONZE_D]]) {
    lgStrip(sc, m, st, z0, z1, (z) => a + Math.sin(z * 0.9) * 0.05, (z) => w * (0.4 + 0.6 * Math.sin(Math.PI * (z - z0) / (z1 - z0))), { p: 2 });
  }
  // bouche : l'âme noire
  sc.push(vmT(0, 0, HV_TUBE_L - 0.5)); sc.cyl(VM_DARK, HV_BORE, 0.55, { segs: 22 }); sc.pop();
  // lumière (évent) sur le dessus de la culasse, avec son étoupille de cuivre (friction primer) et son anneau
  const vy = HV_R - 0.1, vz = -1.6;
  sc.push(vmChain(vmT(0, vy, vz), vmRx(-Math.PI / 2))); sc.cyl(HV_BRONZE_D, 1.0, 0.5, { segs: 12 }); sc.pop();
  if (!o.fired) {
    sc.push(vmChain(vmT(0, vy, vz), vmRx(-Math.PI / 2))); sc.cyl(VM_BRASS, 0.26, 2.0, { segs: 6 }); sc.pop();
    sc.push(vmChain(vmT(0, vy + 2.0, vz), vmRy(Math.PI / 2))); sc.cyl(VM_BRASS, 0.32, 1.4, { segs: 6 }); sc.pop();
  }
  // tourillons (axe x) qui sortent sur les flancs, posés dans les flasques
  sc.push(vmChain(vmT(-(cx + 1.4), 0, 0), vmRy(Math.PI / 2))); sc.cyl(HV_BRONZE, 1.7, 2 * (cx + 1.4), { segs: 14 }); sc.pop();
  const vent = vmP(sc.top(), o.fired ? [0, vy + 0.4, vz] : [0, vy + 2.0, vz + 0.6]);
  const tm = sc.top(), muzzle = (d) => vmP(tm, [0, 0, HV_TUBE_L + d]);
  sc.pop();
  // sus-bandes de fer (cap squares) qui brident les tourillons sur les flasques, avec leurs clavettes
  for (const s of [-1, 1]) {
    sc.push(vmT(s * (cx + 0.2), HV_TY, HV_TZ));
    sc.tube(MS_IRON, [[0, 0.2, -2.6], [0, 1.6, -1.6], [0, 2.15, 0], [0, 1.6, 1.6], [0, 0.2, 2.6]], 0.42);
    for (const z of [-2.6, 2.6]) { sc.push(vmT(s * 0.9, 0.2, z)); sc.ell(MS_IRON, 0.55, 0.45, 0.55); sc.pop(); }
    sc.pop();
  }
  sc.pop();
  return { vent, muzzle };
}

// Tenue : bloc tenu à deux mains par ses poignées arrière, bouche vers le haut-avant, un peu tourné (flanc gauche vers
// nous, dans la lumière). x, y, z (repère incliné de vmHold), cabré (négatif : dessus du bloc vers nous), lacet
const HV_P = [2, -28, 54, -0.15, -0.22];
// mains : doigts par-dessus l'étrier (on les voit), paume dessous ; avant-bras qui sortent par le bas de l'écran
const HV_GF = { l: [0, 1, 0], r: [0, 1, 0] };
const HV_LH = { arm: [-26, -46, -26] }, HV_RH = { arm: [26, -46, -26] };

const hvProj = vmProj;
const hvIn = (x, y) => x >= 1 && x <= VM_W - 2 && y >= 1;

// Nuage de fumée de poudre noire : grosses boules grises cernées de sombre, éclairées en haut à gauche, bornées au canvas
function hvCloud(p, x, y, seed, size, n = 12) {
  const rand = hvRng(seed + 19);
  const puffs = [];
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (rand() - 0.5) * 2.6, d = Math.sqrt(rand()) * size;
    const r = size * (0.3 + rand() * 0.22) * (1 - 0.3 * d / size);
    let X = x + Math.cos(a) * d * 1.25, Y = y + Math.sin(a) * d * 0.75;
    Y = Math.max(r + 2, Y); X = Math.max(r + 2, Math.min(VM_W - r - 3, X));
    puffs.push([X, Y, r]);
  }
  // contour, ombre, corps, lumière, reflet
  for (const [X, Y, r] of puffs) p.disc(X, Y, r + 1, '#4a4440');
  for (const [X, Y, r] of puffs) p.disc(X, Y, r, '#8a827c');
  for (const [X, Y, r] of puffs) p.disc(X - r * 0.1, Y - r * 0.12, r * 0.82, '#b0a8a0');
  for (const [X, Y, r] of puffs) p.disc(X - r * 0.22, Y - r * 0.26, r * 0.56, '#d2ccc4');
  for (const [X, Y, r] of puffs) if (r > 3) p.disc(X - r * 0.34, Y - r * 0.4, r * 0.24, '#eeeae4');
}
// Bombe en 2D (fonte noire, reflet en haut à gauche, fusée de bois et sa mèche qui crache des étincelles)
function hvBomb2(p, x, y, r, seed) {
  p.disc(x, y, r + 1, '#0c0c10');
  p.disc(x, y, r, '#24262e');
  p.disc(x + r * 0.15, y + r * 0.18, r * 0.78, '#1a1b22');
  p.disc(x - r * 0.3, y - r * 0.32, r * 0.42, '#3a3e4a');
  if (r > 3) p.disc(x - r * 0.4, y - r * 0.45, r * 0.18, '#8a92a6');
  const fx = Math.round(x + r * 0.35), fy = Math.round(y - r * 0.9);
  if (r > 2.5) { p.R(fx - 1, fy - 1, 3, 2, '#6a4822'); p.P(fx - 1, fy - 1, '#c89c5c'); }
  if (hvIn(fx + 1, fy - 3)) msSparks(p, fx + 1, fy - 3, seed, r > 4 ? 0.55 : 0.35);
}

function hvCoehornView(state, frame, skin, cloth) {
  const sc = vmScene();
  const fire = state === 'fire';
  // recul : le mortier plonge vers le bas et vers nous, le bloc bascule un peu (les mains suivent)
  const kick = fire ? (frame === 0 ? 1 : 0.45) : 0;
  const hold = vmChain(vmHold(HV_P[0], HV_P[1] - 4.2 * kick, HV_P[2] - 2.0 * kick, 0.03 * kick), vmRy(HV_P[4]), vmRx(HV_P[3] + 0.06 * kick));
  sc.push(hold);
  const g = hvCoehorn(sc, { fired: fire });
  const K = HV_K, H = { x: HV_HANDLE.x * K, y: HV_HANDLE.y * K }, [za, zb] = HV_HANDLE.rear.map((z) => z * K);
  vmGrip(sc, [-H.x, H.y, za], [-H.x, H.y, zb], {
    skin, cloth, side: -1, rx: 0.75, rz: 0.75, fwd: HV_GF.l, curl: 0.7,
    thumb: [-H.x - 0.6, H.y + 1.5, zb + 1.6], arm: HV_LH.arm,
  });
  vmGrip(sc, [H.x, H.y, za], [H.x, H.y, zb], {
    skin, cloth, side: 1, rx: 0.75, rz: 0.75, fwd: HV_GF.r, curl: 0.7,
    thumb: [H.x + 0.6, H.y + 1.5, zb + 1.6], arm: HV_RH.arm,
  });
  // cordon de l'étoupille, noué à l'index droit : au repos il pend de la lumière ; au tir, arraché, il retombe avec
  // l'étoupille vide au bout
  const loc = (q) => { const m = hold, v = [q[0] - m[3], q[1] - m[7], q[2] - m[11]]; return [m[0] * v[0] + m[4] * v[1] + m[8] * v[2], m[1] * v[0] + m[5] * v[1] + m[9] * v[2], m[2] * v[0] + m[6] * v[1] + m[10] * v[2]]; };
  const hand = [H.x - 0.6, H.y + 1.2, zb - 0.8];
  let v = loc(g.vent);
  if (fire) v = vmAdd(hand, [-3.2 + frame * 0.8, 3.2 - frame * 2.6, 1.0]);
  sc.tube(VM_FUSE, msSag(v, hand, fire ? 1.0 : 2.6, 8, -0.4), 0.2);
  if (fire) { sc.push(vmT(v[0], v[1], v[2])); sc.ell(VM_BRASS, 0.3, 0.3, 0.9); sc.pop(); }
  sc.pop();
  if (fire) sc.fx((p) => {
    const M = g.muzzle(0), [mx, my] = hvProj(g.muzzle(1)), [vx, vy] = hvProj(g.vent);
    const rB = (VM_F * HV_BORE * K * 0.9) / M[2];
    // direction de la volée à l'écran (la bombe monte dans le ciel le long de ce trait)
    const [ux, uy] = hvProj(g.muzzle(12)), dl = Math.hypot(ux - mx, uy - my) || 1, dx = (ux - mx) / dl, dy = (uy - my) / dl;
    if (frame === 0) {
      // départ : fumée qui jaillit autour, gros éclair sur la bouche, la bombe déjà sortie juste au-dessus, gerbe à la lumière
      hvCloud(p, mx, my - 3, 5, 13, 8);
      vmFlash(p, mx, my - 2, msFlashR(mx, my - 2, 27), 4);
      const k = rB * 1.6;
      hvBomb2(p, mx + dx * k, my + dy * k, rB, 3);
      msSparks(p, vx, vy - 1, 4, 0.8);
    } else {
      // la bombe file haut dans le ciel (petite, traînée de fumée de sa mèche), gros nuage sur la bouche,
      // filet de fumée à la lumière
      const t = Math.max(10, (my - 9) / -Math.min(dy, -0.3)), bx = mx + dx * t, by = my + dy * t;
      for (let i = 1; i <= 7; i++) {
        const q = 0.35 + (i / 8) * 0.6;
        p.disc(mx + dx * t * q + Math.sin(i * 2.1) * 0.6, my + dy * t * q, 0.5 + q * 0.9, i % 2 ? '#d2ccc4' : '#b0a8a0');
      }
      hvBomb2(p, bx, by, 2.6, 9);
      hvCloud(p, mx, my - 6, 2, 21);
      for (let i = 0; i < 5; i++) p.disc(vx + Math.sin(i * 1.7) * 1.2, vy - 2 - i * 2.6, 1 + i * 0.45, i % 2 ? '#b0a8a0' : '#d2ccc4');
    }
  });
  return vmRender(sc);
}

registerViewModel((id, state, frame, skin, cloth) => {
  if (id !== 'coehorn') return null;
  // arme de caisse : pas de rechargement ; 'reload' (demandé par le préchauffage) et tout état inconnu → au repos
  const st = state === 'fire' ? 'fire' : 'idle';
  return hvCoehornView(st, st === 'fire' ? (frame ? 1 : 0) : 0, skin, cloth);
});
