// Mini-jeu « Défends la roulotte » : la roulotte fait route de Dusty Gulch à Red Rock, et une bande de
// hors-la-loi l'attaque en chemin. Le voyage se fait en quatre étapes : la prairie (vue de côté), le canyon
// (de l'intérieur de la roulotte : on surveille devant, ou on se retourne vers l'arrière), le campement
// (de côté) puis l'assaut de Black Bart (de l'intérieur).
// Ce fichier contient les règles partagées (le monde vient d'une graine, chaque navigateur le recalcule) et
// l'arbitre qui tourne chez l'hôte, avec la même interface que MiniGame (mini.js).
// Vue de côté : tout est compté par rapport à la roulotte, qui reste au même endroit de l'écran pendant que
// le décor défile. Vue de l'intérieur : chaque assaillant est à une distance d de la roulotte, devant (end = 1)
// ou derrière (end = -1), et à un écart lx du milieu de la piste.
import { MODES, COUNTDOWN, W, rng } from './worlds.js';

const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export const WAGON = {
  x: 160, base: 176, // la roulotte : centre à l'écran, sol
  half: 56, front: 104, // où s'arrêtent les pillards : contre la caisse à l'arrière, contre l'attelage à l'avant
  scroll: 0.03, // vitesse du voyage (px/ms) : le décor défile d'autant
  from: 'DUSTY GULCH', to: 'RED ROCK',
  hp: 50, ammo: 6, reload: 900,
  top: 140, bottom: 206, // pieds des assaillants
  atkEvery: 3000, // un pillard accroché au convoi frappe toutes les 3 s
  throwEvery: 3400, fly: 1100, // dynamite : un bâton toutes les 3,4 s, 1,1 s de vol
  dynDmg: 2, dynPts: 50,
  survive: 300, // tous les défenseurs, si la roulotte arrive à bon port
  rush: 0.12, // vue de l'intérieur : vitesse du sol (px/ms)
  turn: 280, // durée du demi-tour dans la roulotte
  bonusLife: 3800, // un bonus lâché flotte 3,8 s avant de disparaître
  buffMs: 9000, repair: 8, // durée des bonus personnels ; PV rendus par les planches
  combo: 5, // balles au but d'affilée pour monter d'un cran (x1,5, x2… jusqu'à x3)
  wipe: 450, // fondu au noir entre deux étapes, de chaque côté
};

// Les étapes du voyage. view : 'side' (de côté) ou 'in' (de l'intérieur de la roulotte).
export const STAGES = [
  { id: 'prairie', view: 'side', t0: 0, name: 'LA PRAIRIE' },
  { id: 'canyon', view: 'in', t0: 21000, name: 'LE CANYON', sub: 'ILS ARRIVENT DEVANT ET DERRIÈRE !' },
  { id: 'camp', view: 'side', t0: 42000, name: 'LE CAMPEMENT' },
  { id: 'bart', view: 'in', t0: 63000, name: 'LA BANDE À BLACK BART', sub: 'LES HOMMES D\'EL DIABLO : TIENS BON JUSQU\'À RED ROCK !' },
];
STAGES.forEach((s, i) => { s.i = i; s.t1 = STAGES[i + 1]?.t0 ?? MODES.wagon.duration; });
export function stageAt(t) {
  let s = STAGES[0];
  for (const x of STAGES) if (t >= x.t0) s = x;
  return s;
}

// pts : pour le coup fatal ; hit : pour chaque balle qui ne tue pas.
// Vue de côté — v : vitesse par rapport à la roulotte. Les piétons tendent des embuscades devant le convoi
// (run + défilement), les cavaliers et les dynamiteurs (à cheval) arrivent des deux côtés.
export const BANDITS = {
  walker: { name: 'Bandit', hp: 1, pts: 100, run: [0.012, 0.018], dmg: 1, box: [-6, -36, 14, 36], ahead: true },
  rider: { name: 'Cavalier', hp: 1, pts: 150, v: [0.05, 0.065], dmg: 1, box: [-18, -48, 40, 46] },
  brute: { name: 'Gros bras', hp: 3, pts: 250, hit: 25, run: [0.004, 0.008], dmg: 1, box: [-8, -40, 18, 40], ahead: true },
  dyn: { name: 'Dynamiteur', hp: 1, pts: 150, v: [0.04, 0.05], dmg: 0, box: [-18, -48, 40, 46], range: [96, 140] },
  // il saute de son cheval sur la bâche et la lacère
  climber: { name: 'Pillard', hp: 1, pts: 200, v: [0.055, 0.07], dmg: 1, every: 1800, box: [-18, -48, 40, 46], roofBox: [-6, -36, 14, 36] },
  // une mule chargée de dynamite lâchée sur le convoi : l'abattre fait tout sauter autour d'elle
  mule: { name: 'Mule à dynamite', hp: 1, pts: 150, run: [0.004, 0.007], dmg: 4, box: [-14, -30, 30, 30], ahead: true, blast: [60, 40] },
  // posté sur un rocher au loin, il se lève, vise et tire, puis se recache
  sniper: { name: 'Tireur embusqué', hp: 1, pts: 250, dmg: 1, every: 2600, box: [-6, -50, 14, 18] },
  // vue de l'intérieur
  chaser: { name: 'Cavalier', hp: 1, pts: 150, dmg: 1, every: 2600 },
  // le bandido zigzague d'un bord à l'autre de la piste, en avançant et reculant : dur à viser
  zigzag: { name: 'Bandido', hp: 1, pts: 200, dmg: 1, every: 2400 },
  // l'éclaireur coupe la piste au galop devant la roulotte et tire en passant
  crosser: { name: 'Éclaireur', hp: 1, pts: 200, dmg: 1 },
  thrower: { name: 'Dynamiteur', hp: 1, pts: 200, dmg: 0 },
  ambush: { name: 'Embuscade', hp: 1, pts: 200, dmg: 1, every: 2500 },
  barricade: { name: 'Barricade', hp: 1, pts: 200, dmg: 5 },
  boarder: { name: 'Abordage', hp: 2, pts: 250, hit: 25, dmg: 1, every: 1400 },
  boss: { name: 'Black Bart', hp: 8, pts: 1000, hit: 50, dmg: 2, every: 2800 },
};
export const BANDIT_LOOKS = 6;

// Bonus lâchés par les bandits dorés : le premier qui tire dessus le ramasse.
export const BONUS = {
  gold: { name: 'BARILLET D\'OR', desc: 'BALLES À VOLONTÉ', w: 3, buff: true },
  shotgun: { name: 'ESCOPETTE', desc: 'TIR GROUPÉ', w: 3, buff: true },
  x2: { name: 'PRIME DOUBLE', desc: 'POINTS x2', w: 2, buff: true },
  repair: { name: 'PLANCHES', desc: `ROULOTTE +${WAGON.repair}`, w: 2 },
  tnt: { name: 'CAISSE DE TNT', desc: 'TOUT SAUTE !', w: 1 },
};
const CARRIERS = new Set(['walker', 'rider', 'brute', 'dyn', 'climber', 'sniper', 'chaser', 'zigzag', 'crosser', 'thrower', 'ambush']);

// Les assaillants de la partie : même graine, mêmes bandits aux mêmes endroits, partout.
// Plus il y a de défenseurs, plus la bande est nombreuse (n = nombre de joueurs, jusqu'à 6).
// Au-delà de 4, elle grossit un peu plus vite : sinon chaque tireur aurait moins à faire qu'à 4.
export function wagonWorld(seed, n = 4) {
  const density = (n + 1) / 5 + Math.max(0, n - 4) * 0.05; // 0,4 seul ; 1 à 4 ; 1,25 à 5 ; 1,5 à 6
  const R = rng((seed ^ 0x2c1b3c6d) >>> 0);
  const between = (a, b) => a + R() * (b - a);
  const sign = () => (R() < 0.5 ? -1 : 1);
  const targets = [];
  const base = (kind, t0, st) => {
    const b = { id: 0, kind, view: st.view, stage: st.i, t0: Math.round(t0), t1: st.t1, hp: BANDITS[kind].hp, look: Math.floor(R() * BANDIT_LOOKS), bonus: null };
    targets.push(b);
    return b;
  };

  // de côté. from : -1 par la gauche (il rattrape le convoi), +1 par la droite (devant la roulotte)
  const side = (kind, t0, st, from) => {
    const k = BANDITS[kind];
    const b = base(kind, t0, st);
    if (kind === 'sniper') { // il ne bouge pas : c'est le décor qui l'emmène, de droite à gauche
      b.side = 1;
      b.y = Math.round(between(122, 134));
      b.x0 = W + 16; b.v = WAGON.scroll; b.stopX = -24;
      b.reach = b.gone = Math.round(t0 + (b.x0 - b.stopX) / WAGON.scroll);
      return b;
    }
    b.side = from ?? (k.ahead || R() < 0.5 ? 1 : -1);
    b.y = Math.round(between(WAGON.top, WAGON.bottom));
    b.v = k.run ? WAGON.scroll + between(k.run[0], k.run[1]) : between(k.v[0], k.v[1]);
    b.x0 = b.side < 0 ? -24 : W + 24;
    const stop = kind === 'dyn' ? between(k.range[0], k.range[1])
      : (b.side > 0 ? WAGON.front : WAGON.half) + (kind === 'rider' || kind === 'climber' ? 18 : 0) + R() * 6;
    b.stopX = Math.round(WAGON.x + b.side * stop);
    b.reach = Math.round(t0 + Math.abs(b.stopX - b.x0) / b.v);
    if (kind === 'rider' && R() < 0.4) b.wob = 1; // il zigzague en approchant
    if (kind === 'climber') b.roofX = Math.round(WAGON.x + b.side * between(6, 30));
    return b;
  };

  // de l'intérieur. end : 1 devant, -1 derrière
  const inside = (kind, t0, st, end) => {
    const b = base(kind, t0, st);
    b.end = end ?? (R() < 0.5 ? 1 : -1);
    b.ph = R() * 6.28;
    const sg = sign();
    if (kind === 'ambush') { // derrière un rocher au bord de la piste, devant : on arrive sur lui
      b.end = 1;
      b.lx = Math.round(sg * between(96, 170));
      b.d0 = Math.round(between(760, 920));
      b.reach = b.gone = Math.round(t0 + (b.d0 - IN.pass) / WAGON.rush);
    } else if (kind === 'barricade') { // en travers de la piste : il faut la faire sauter avant d'y arriver
      b.end = 1;
      b.lx = Math.round(between(-12, 12));
      b.d0 = 900;
      b.reach = Math.round(t0 + (b.d0 - IN.crash) / WAGON.rush);
    } else if (kind === 'crosser') { // il traverse la piste devant nous, de part en part
      b.end = 1;
      b.dir = sg;
      b.lx0 = -sg * 250;
      b.v = between(0.09, 0.12);
      b.d0 = Math.round(between(360, 600));
      b.reach = Math.round(t0 + 250 / b.v); // au milieu de la piste : il tire
      b.gone = Math.round(t0 + 500 / b.v);
    } else if (kind === 'boarder') { // il surgit par-dessus le hayon (ou le siège du cocher)
      b.lx = Math.round(b.end > 0 ? sg * between(86, 104) : sg * between(24, 80));
      b.reach = b.t0 + 400;
    } else { // cavaliers et dynamiteurs : ils galopent vers la roulotte en zigzaguant
      const boss = kind === 'boss';
      b.d0 = boss ? 900 : Math.round(between(950, 1150));
      b.dStop = kind === 'thrower' ? Math.round(between(200, 260)) : boss ? 150 : b.end > 0 ? Math.round(between(84, 110)) : Math.round(between(55, 85));
      b.lx0 = Math.round(sg * between(20, 120));
      b.lx = boss ? 0 : Math.round(b.end > 0 ? sg * between(84, 116) : sg * between(22, 92));
      b.reach = Math.round(t0 + (boss ? 4000 : between(3000, 4200)));
      b.amp = Math.round(between(12, 36)); // largeur de ses écarts
      if (kind === 'zigzag') {
        b.amp = Math.round(between(80, 120));
        b.per = Math.round(between(1100, 1600));
        b.lx0 = 0; b.lx = 0;
        b.dStop = b.end > 0 ? Math.round(between(100, 140)) : Math.round(between(70, 110));
      }
    }
    return b;
  };

  const gap = (lo, hi, p) => (between(lo, hi) * (1 - 0.3 * p)) / density;
  for (const st of STAGES) {
    const len = st.t1 - st.t0, at = (dt) => st.t0 + dt;
    if (st.id === 'prairie') {
      side('mule', at(9000), st, 1);
      for (const dt of [0, 220, 440]) side('rider', at(len - 6500 + dt), st, -1); // la charge
      for (let t = at(1500); t < st.t1 - 3000;) {
        const p = (t - st.t0) / len, r = R();
        let kind = 'walker';
        if (p > 0.25 && r < 0.1) kind = 'dyn';
        else if (p > 0.3 && r < 0.2) kind = 'brute';
        else if (p > 0.4 && r < 0.28) kind = 'climber';
        else if (r < 0.62) kind = 'rider';
        side(kind, t, st);
        if (p > 0.5 && R() < 0.3) side(R() < 0.5 ? 'walker' : 'rider', t + 250, st);
        t += gap(1300, 2000, p);
      }
    } else if (st.id === 'camp') {
      for (const dt of [1500, 8000, 14000]) side('sniper', at(dt), st);
      for (const dt of [5000, 12500]) side('mule', at(dt), st, 1);
      for (const [dt, k, f] of [[0, 'rider', -1], [200, 'rider', -1], [300, 'walker', 1], [500, 'climber', -1]]) side(k, at(len - 6000 + dt), st, f);
      for (let t = at(1200); t < st.t1 - 3000;) {
        const p = (t - st.t0) / len, r = R();
        let kind = 'walker';
        if (r < 0.12) kind = 'dyn';
        else if (r < 0.24) kind = 'brute';
        else if (r < 0.36) kind = 'climber';
        else if (r < 0.66) kind = 'rider';
        side(kind, t, st);
        if (R() < 0.25) side(R() < 0.5 ? 'walker' : 'rider', t + 250, st);
        t += gap(1300, 2000, p);
      }
    } else {
      const bart = st.id === 'bart';
      // première étape : une embuscade devant, puis le premier cavalier derrière, pour apprendre à se retourner
      if (!bart) { inside('ambush', at(1200), st); inside('chaser', at(5200), st, -1); inside('thrower', at(9500), st, -1); }
      for (const dt of bart ? [3000, 12500] : [4000, 11000]) inside('barricade', at(dt), st);
      if (bart) {
        const boss = inside('boss', at(4000), st, -1);
        boss.hp = Math.round(5 + 1.5 * n);
        inside('chaser', at(4600), st, -1); inside('chaser', at(5000), st, -1); // son escorte
      }
      for (let t = at(bart ? 1500 : 6500); t < st.t1 - 4000;) {
        const p = (t - st.t0) / len, r = R();
        if (r < 0.22) inside('chaser', t, st, R() < (bart ? 0.4 : 0.3) ? 1 : -1);
        else if (r < 0.36) inside(p > 0.15 ? 'zigzag' : 'chaser', t, st);
        else if (r < 0.52) inside('ambush', t, st);
        else if (r < 0.62) inside('crosser', t, st);
        else if (r < 0.72) inside('thrower', t, st, -1);
        else if (r < 0.86) inside('boarder', t, st);
        else inside('chaser', t, st);
        if (p > 0.4 && R() < 0.25) inside('chaser', t + 300, st);
        t += gap(1500, 2300, p);
      }
    }
  }
  // les bandits dorés : ils lâchent un bonus quand on les abat (au moins deux par étape)
  const bonusOf = () => {
    let r = R() * Object.values(BONUS).reduce((s, b) => s + b.w, 0);
    for (const [id, b] of Object.entries(BONUS)) if ((r -= b.w) < 0) return id;
    return 'gold';
  };
  for (const st of STAGES) {
    const pool = targets.filter((b) => b.stage === st.i && CARRIERS.has(b.kind) && b.t0 > st.t0 + 2500);
    for (const b of pool) if (R() < 0.15) b.bonus = bonusOf();
    for (let k = pool.filter((b) => b.bonus).length; k < 2 && pool.length; k++) {
      const free = pool.filter((b) => !b.bonus);
      if (free.length) free[Math.floor(R() * free.length)].bonus = bonusOf();
    }
  }
  targets.sort((a, b) => a.t0 - b.t0).forEach((b, i) => { b.id = i; });
  return { targets };
}

// ------------------------------------------------------------ vue de côté
// Position d'un assaillant (il s'arrête contre la roulotte, ou à portée de lancer pour le dynamiteur)
export function banditX(b, t) {
  const d = Math.min(Math.max(0, t - b.t0), b.reach - b.t0);
  return b.x0 - b.side * b.v * d;
}
// les cavaliers qui zigzaguent montent et descendent en approchant
export function banditY(b, t) {
  if (!b.wob || t >= b.reach) return b.y;
  return b.y + Math.round(Math.sin((t - b.t0) / 240 + b.id) * 11 * clamp((b.reach - t) / 600, 0, 1));
}
export const banditOn = (b, t) => t >= b.t0;

// le tireur embusqué : caché 1,1 s, debout 1,5 s (il tire en se recachant)
// Il est derrière un rocher haut de rock px ; debout, ses pieds sont à feet px au-dessus du sol (le rocher cache
// ses jambes), caché ils descendent de drop px : on ne le voit jamais que par-dessus le rocher.
export const SNIPE = { hide: 1100, period: 2600, rock: 32, feet: 12, drop: 18 };
export function sniperUp(b, t) {
  const e = t - b.t0;
  return e >= 0 && e % SNIPE.period >= SNIPE.hide;
}

// haut de la bâche au-dessus de x
export function roofY(x) {
  const i = clamp(x - (WAGON.x - 46), 0, 92);
  return WAGON.base - 32 - Math.round(36 * Math.sin((Math.PI * i) / 92) ** 0.55);
}
// le pillard saute de son cheval sur la bâche (0 : en selle, 1 : sur la bâche)
export const climbK = (b, t) => (b.kind === 'climber' && t >= b.reach ? clamp((t - b.reach) / 600, 0, 1) : 0);

// Pieds d'un assaillant vu de côté
export function anchor(b, t) {
  const k = climbK(b, t);
  if (k > 0) {
    const rx = b.roofX, ry = roofY(rx);
    return { x: b.stopX + (rx - b.stopX) * k, y: b.y - 30 + (ry - b.y + 30) * k - Math.sin(k * Math.PI) * 24 };
  }
  return { x: banditX(b, t), y: banditY(b, t) };
}

// Rectangle touchable (x, y, w, h), retourné quand il arrive par la droite ; null s'il est à couvert
export function banditBox(b, t) {
  const K = BANDITS[b.kind];
  if (b.kind === 'sniper' && !sniperUp(b, t)) return null;
  const a = anchor(b, t);
  const [x0, y0, w, h] = climbK(b, t) > 0 ? K.roofBox : K.box;
  return b.side < 0 ? { x: a.x + x0, y: a.y + y0, w, h } : { x: a.x - x0 - w, y: a.y + y0, w, h };
}

// ------------------------------------------------------------ vue de l'intérieur
// hz : horizon ; camH : hauteur de l'œil ; un objet à d px est réduit d'un facteur 1 / (1 + d / depth).
// crash : distance où la roulotte percute la barricade ; pass : un embusqué dépassé ne peut plus tirer.
export const IN = { hz: 92, camH: 108, depth: 80, far: 1300, trail: 44, crash: 90, pass: 40 };
// échelle des sprites pour l'échelle s de la projection : au loin, on triche un peu pour qu'ils restent lisibles
export const inK = (s) => Math.max(2 * s, 0.42);
export function inProj(lx, d, h = 0) {
  const s = 1 / (1 + Math.max(-40, d) / IN.depth);
  return { x: W / 2 + lx * s, y: IN.hz + (IN.camH - h) * s, s };
}

// embuscade : il se lève 1,5 s toutes les 2,5 s (le tir part à la fin) ; rise : 0 caché, 1 debout
export const AMB = { delay: 500, up: 1500, period: 2500 };
export function ambushRise(b, t) {
  const e = t - b.t0 - AMB.delay;
  if (e < 0) return 0;
  const ph = e % AMB.period;
  return ph < AMB.up ? clamp(ph / 150, 0, 1) * clamp((AMB.up - ph) / 150, 0, 1) : 0;
}

// Position (d, lx) et soulèvement (lift, en pixels du sprite) d'un assaillant vu de l'intérieur
export function inPos(b, t) {
  const e = Math.max(0, t - b.t0);
  switch (b.kind) {
    case 'ambush': case 'barricade': return { d: b.d0 - WAGON.rush * e, lx: b.lx, lift: 0 };
    case 'boarder': return { d: 8, lx: b.lx, lift: -56 + 50 * clamp(e / 400, 0, 1) };
    case 'crosser': return { d: b.d0 - WAGON.rush * e, lx: b.lx0 + b.dir * b.v * e, lift: 0, lean: b.dir };
    case 'zigzag': { // en dents de scie : il file d'un bord à l'autre, change de cap d'un coup, avance et recule
      const u = clamp(e / (b.reach - b.t0), 0, 1), k = 1 - (1 - u) ** 2;
      const ph = ((e / b.per + b.ph) % 1 + 1) % 1;
      const zig = b.amp * (ph < 0.5 ? 4 * ph - 1 : 3 - 4 * ph);
      return { d: b.d0 + (b.dStop - b.d0) * k + Math.sin(e / 650 + b.ph) * 40 * u, lx: zig * (0.5 + 0.5 * u), lift: 0, lean: ph < 0.5 ? 1 : -1 };
    }
    default: {
      const u = clamp(e / (b.reach - b.t0), 0, 1), k = 1 - (1 - u) ** 2; // il ralentit en arrivant
      const boss = b.kind === 'boss';
      const sway = Math.sin(e / (boss ? 520 : 640) + b.ph) * (boss ? 46 : b.amp ?? 18) * (0.4 + 0.6 * u);
      return { d: b.d0 + (b.dStop - b.d0) * k, lx: b.lx0 + (b.lx - b.lx0) * k + sway, lift: 0 };
    }
  }
}

// L'embusqué : son rocher est haut de rock px ; debout, le bas de son buste est à up px au-dessus du sol.
// On ne dessine de lui que ce qui dépasse du rocher.
export const AMB_ROCK = { rock: 30, up: 18 };
// Rectangle touchable en pixels du sprite, autour du point au sol (vue de l'intérieur)
export const IN_BOX = {
  chaser: [-12, -72, 24, 70], zigzag: [-12, -72, 24, 70], thrower: [-12, -72, 24, 70], boss: [-14, -86, 29, 84], // Black Bart : x1,2
  crosser: [-18, -48, 40, 46], ambush: [-13, -72, 26, 42], barricade: [-28, -30, 56, 30], boarder: [-16, -54, 32, 46],
};
// la tête : une balle en pleine tête fait 2 dégâts et rapporte x1,5
const IN_HEAD = {
  chaser: [-5, -74, 10, 16], zigzag: [-5, -74, 10, 16], thrower: [-5, -74, 10, 16], boss: [-6, -89, 12, 19],
  crosser: [-9, -47, 10, 14], ambush: [-9, -58, 18, 14], boarder: [-9, -40, 18, 14],
};
function inRect(b, t, table) {
  if (t < b.t0 || t >= b.t1 || !table[b.kind]) return null;
  if (b.gone != null && t >= b.gone) return null;
  if (b.kind === 'ambush' && ambushRise(b, t) < 0.6) return null;
  const p = inPos(b, t);
  if (p.d < 2 || p.d > IN.far) return null;
  const g = inProj(p.lx, p.d), k = inK(g.s);
  let [x0, y0, w, h] = table[b.kind];
  if (b.kind === 'crosser' && b.dir < 0) x0 = -x0 - w; // il galope vers la gauche : sprite retourné
  return { x: g.x + x0 * k, y: g.y + (y0 - p.lift) * k, w: w * k, h: h * k };
}
export const inBox = (b, t) => inRect(b, t, IN_BOX);

// Rectangle touchable, quelle que soit la vue ; face : 0 de côté, sinon le bout de la roulotte où il est
export const targetBox = (b, t) => (b.view === 'side' ? banditBox(b, t) : inBox(b, t));
// la tête, quelle que soit la vue (null : rien à viser)
const SIDE_HEAD = { walker: [-4, -37, 10, 12], brute: [-4, -43, 10, 12], rider: [-9, -47, 10, 14], dyn: [-9, -47, 10, 14], climber: [-9, -47, 10, 14], sniper: [-5, -48, 10, 12] };
export function headBox(b, t) {
  if (b.view !== 'side') return inRect(b, t, IN_HEAD);
  let r = SIDE_HEAD[b.kind];
  if (!r || (b.kind === 'sniper' && !sniperUp(b, t))) return null;
  if (climbK(b, t) > 0) r = SIDE_HEAD.walker;
  const a = anchor(b, t);
  const [x0, y0, w, h] = r;
  return b.side < 0 ? { x: a.x + x0, y: a.y + y0, w, h } : { x: a.x - x0 - w, y: a.y + y0, w, h };
}
export const faceOf = (b) => (b.view === 'side' ? 0 : b.end);

// Encore dans la partie (arrivé, pas dépassé, étape pas finie) ? — ne regarde pas s'il est mort
export function active(b, t) {
  if (t < b.t0 || t >= b.t1) return false;
  if (b.gone != null && t >= b.gone) return false;
  return true;
}

// ------------------------------------------------------------ dynamite
// Lancers d'un dynamiteur mort à deadAt (Infinity s'il est vivant)
export function dynThrows(b, deadAt = Infinity, until = MODES.wagon.duration) {
  if (b.kind !== 'dyn' && b.kind !== 'thrower') return [];
  const out = [];
  const end = Math.min(deadAt, until, b.t1 - WAGON.fly);
  for (let k = 0, at = b.reach + 500; at < end; k++, at += WAGON.throwEvery) out.push({ k, at });
  return out;
}

// Bâton de dynamite en vol : x, y à l'écran, u (0 : lancé, 1 : arrivé), s (échelle, vue de l'intérieur)
export function dynPos(b, k, at, t) {
  const u = clamp((t - at) / WAGON.fly, 0, 1);
  if (b.view === 'in') { // il vole vers nous et retombe dans la roulotte
    const p = inPos(b, at);
    const lx = p.lx * (1 - u) + (k % 2 ? 22 : -22) * u, d = p.d * (1 - u) + 10 * u;
    const g = inProj(lx, d, 92 * (1 - u) + Math.sin(u * Math.PI) * 120);
    return { x: g.x, y: g.y, u, s: g.s };
  }
  // parabole de la main du cavalier jusqu'à la bâche
  const fx = b.stopX + b.side * -4, fy = b.y - 46;
  const tx = WAGON.x + b.side * (12 + ((b.id * 7 + k * 13) % 24)), ty = WAGON.base - 34;
  return { x: fx + (tx - fx) * u, y: fy + (ty - fy) * u - Math.sin(u * Math.PI) * 46, u, s: 1 };
}

// ------------------------------------------------------------ bonus
// Où flotte le bonus lâché par b, abattu à `at` : { x, y, s } à l'écran, ou null s'il a disparu
export function bonusPos(b, at, t) {
  const e = t - at;
  if (!b.bonus || e < 0 || e > WAGON.bonusLife || t >= b.t1) return null;
  const rise = Math.min(e, 400) / 400, bob = Math.sin(e / 180) * 2;
  if (b.view === 'side') {
    const a = anchor(b, at);
    return { x: a.x - WAGON.scroll * e, y: a.y - 24 - rise * 14 + bob, s: 1 };
  }
  const p = inPos(b, at);
  const d = p.d - b.end * WAGON.rush * 0.5 * e;
  if (d < 12 || d > IN.far) return null;
  const g = inProj(p.lx, d, 40 + rise * 30);
  return { x: g.x, y: g.y + bob, s: g.s };
}

// ------------------------------------------------------------ coups portés à la roulotte
// { first, every, dmg } : le premier coup, puis un toutes les `every` ms (mule et barricade : un seul, à reach)
export function attackPlan(b) {
  const K = BANDITS[b.kind];
  switch (b.kind) {
    case 'walker': case 'rider': case 'brute': return { first: b.reach, every: WAGON.atkEvery, dmg: K.dmg };
    case 'climber': return { first: b.reach + 600, every: K.every, dmg: K.dmg };
    case 'sniper': return { first: b.t0 + SNIPE.period - 1, every: SNIPE.period, dmg: K.dmg };
    case 'ambush': return { first: b.t0 + AMB.delay + AMB.up - 1, every: AMB.period, dmg: K.dmg };
    case 'chaser': case 'zigzag': return { first: b.reach + 300, every: K.every, dmg: K.dmg };
    case 'crosser': return { first: b.reach, every: 1e9, dmg: K.dmg };
    case 'boss': return { first: b.reach + 500, every: K.every, dmg: K.dmg };
    case 'boarder': return { first: b.reach + 1300, every: K.every, dmg: K.dmg };
    default: return null;
  }
}
// le coup prévu à `at` part-il vraiment ? (le tireur doit être à l'écran, l'embusqué à portée)
export function strikes(b, at) {
  if (at >= b.t1) return false;
  if (b.kind === 'sniper') { const x = banditX(b, at); return x > 12 && x < W - 12; }
  if (b.kind === 'ambush' || b.kind === 'crosser') { const d = inPos(b, at).d; return d > IN.pass && d < 650; }
  return true;
}
// prochain coup après t (pour l'annoncer à l'écran : reflet du fusil, éclair)
export function nextStrike(b, t) {
  const p = attackPlan(b);
  if (!p) return Infinity;
  return t <= p.first ? p.first : p.first + Math.ceil((t - p.first) / p.every) * p.every;
}

// ------------------------------------------------------------ arbitre (navigateur de l'hôte)
export class WagonGame {
  constructor(players) {
    this.kind = 'wagon';
    this.seed = Math.floor(Math.random() * 2 ** 31);
    this.duration = MODES.wagon.duration;
    this.p = players.map((pl) => ({
      key: pl.key, name: pl.name, character: pl.character, bot: !!pl.bot,
      score: 0, left: false, stats: { throws: 0, catches: 0, hits: 0, hurt: 0 },
      streak: 0, x2: 0, buff: null,
      ai: pl.bot ? { next: rnd(800, 1600), aim: null } : null,
    }));
    this.world = wagonWorld(this.seed, players.length);
    this.hp = new Map(); // PV restants des assaillants touchés
    this.dead = new Map(); // id -> { by, at } (by = -1 : il a sauté ou percuté la roulotte)
    this.nextAtk = new Map(); // id -> prochain coup porté à la roulotte
    this.dyn = new Map(); // `${id}:${k}` -> 'shot' | 'boom'
    this.picked = new Map(); // bonus ramassés : id du porteur -> joueur
    this.wagonHp = WAGON.hp;
    this.result = null; // 'saved' | 'lost'
    this.phase = 'playing';
    this.winner = null;
    this.ranking = null;
    this.events = [];
    this.liveOut = [];
    this.startAt = 0;
  }

  get t() { return Date.now() - this.startAt; }

  start() {
    this.startAt = Date.now() + COUNTDOWN;
    this.push({ type: 'mgStart', kind: this.kind, seed: this.seed, countdown: COUNTDOWN, duration: this.duration });
    return this.flush();
  }

  flush() {
    const e = this.events;
    this.events = [];
    return e;
  }

  view(i) {
    return {
      kind: this.kind, me: i, phase: this.phase, winner: this.winner, ranking: this.ranking, wagonHp: this.wagonHp,
      players: this.p.map((p) => ({ key: p.key, name: p.name, character: p.character, score: p.score, left: p.left, bot: p.bot })),
    };
  }

  // État complet pour un joueur qui se reconnecte en cours de partie.
  syncView(i) {
    return {
      ...this.view(i), seed: this.seed, duration: this.duration, elapsed: this.t, result: this.result,
      dead: [...this.dead], hp: [...this.hp], dyn: [...this.dyn], picked: [...this.picked],
    };
  }

  push(ev) {
    ev.dur = 0;
    ev.states = this.p.map((_, i) => this.view(i));
    this.events.push(ev);
  }

  act(i, a) {
    if (this.phase !== 'playing') return { error: 'La partie est terminée.' };
    if (!a || typeof a !== 'object') return { error: 'Action invalide.' };
    const t = this.t;
    if (t < -300 || t > this.duration + 600 || this.p[i].left) return { events: [] };
    if (a.kind === 'miss') { this.p[i].streak = 0; return { events: [] }; }
    if (!Number.isInteger(a.id)) return { error: 'Action invalide.' };
    if (a.kind === 'pick') this.pick(i, a.id, t);
    else if (a.kind !== 'hit') return { error: 'Action invalide.' };
    else if (Number.isInteger(a.k)) this.hitDyn(i, a.id, a.k, t);
    else this.hit(i, a.id, t, undefined, !!a.head);
    return { events: this.flush() };
  }

  // multiplicateur de points : la série (x1,5 toutes les 5 balles au but, jusqu'à x3) et la prime double
  mult(i, t) {
    const p = this.p[i];
    return (1 + Math.min(4, Math.floor(p.streak / WAGON.combo)) * 0.5) * (p.x2 > t ? 2 : 1);
  }

  // why : undefined (une balle), 'chain' (mule qui saute), 'tnt' (caisse de TNT) ; head : en pleine tête
  hit(i, id, t, why, head = false) {
    const b = this.world.targets[id];
    if (!b || this.dead.has(id) || t < b.t0 - 200 || t > b.t1 + 300) return;
    const K = BANDITS[b.kind];
    const p = this.p[i];
    const hp = Math.max(0, (this.hp.get(id) ?? b.hp) - (why && b.kind !== 'boss' ? 99 : why === 'tnt' ? 3 : head ? 2 : 1));
    this.hp.set(id, hp);
    const kill = hp <= 0;
    if (!why) { p.streak++; p.stats.hits++; }
    const mult = this.mult(i, t);
    const pts = Math.round(((kill ? K.pts : K.hit || 0) * mult * (head ? 1.5 : 1)) / 5) * 5;
    if (kill) this.dead.set(id, { by: i, at: t });
    p.score += pts;
    this.push({ type: 'hit', id, by: i, pts, hp, kill, at: t, streak: p.streak, mult, why, head });
    if (kill && b.kind === 'mule') this.blast(i, b, t);
  }

  // la mule saute : tous les bandits autour d'elle avec
  blast(i, mule, t) {
    const a = anchor(mule, t);
    const [rx, ry] = BANDITS.mule.blast;
    this.push({ type: 'blast', id: mule.id, x: Math.round(a.x), y: Math.round(a.y) });
    for (const o of this.world.targets) {
      if (o.t0 > t) break;
      if (o.view !== 'side' || o.id === mule.id || this.dead.has(o.id) || !active(o, t)) continue;
      const c = anchor(o, t);
      if (Math.abs(c.x - a.x) < rx && Math.abs(c.y - a.y) < ry) this.hit(i, o.id, t, 'chain');
    }
  }

  hitDyn(i, id, k, t) {
    const b = this.world.targets[id];
    const key = `${id}:${k}`;
    if (!b || this.dyn.has(key)) return;
    const th = dynThrows(b, this.dead.get(id)?.at).find((x) => x.k === k);
    if (!th || t < th.at - 150 || t > th.at + WAGON.fly + 250) return;
    const p = this.p[i];
    this.dyn.set(key, 'shot');
    p.streak++;
    p.stats.catches++;
    const pts = Math.round((WAGON.dynPts * this.mult(i, t)) / 5) * 5;
    p.score += pts;
    this.push({ type: 'dynHit', id, k, by: i, pts, streak: p.streak });
  }

  pick(i, id, t) {
    const b = this.world.targets[id];
    const d = this.dead.get(id);
    if (!b || !b.bonus || !d || d.by < 0 || this.picked.has(id)) return;
    const e = t - d.at;
    if (e < -150 || e > WAGON.bonusLife + 400) return;
    const p = this.p[i];
    this.picked.set(id, i);
    const until = t + WAGON.buffMs;
    if (b.bonus === 'x2') p.x2 = until;
    if (BONUS[b.bonus].buff) p.buff = { type: b.bonus, until };
    if (b.bonus === 'repair') this.wagonHp = Math.min(WAGON.hp, this.wagonHp + WAGON.repair);
    this.push({ type: 'pick', id, by: i, bonus: b.bonus, until });
    if (b.bonus === 'tnt') { // tout ce qui attaque la roulotte à cette étape saute (Black Bart encaisse)
      const st = stageAt(t).i;
      for (const o of this.world.targets) {
        if (o.t0 > t) break;
        if (o.stage === st && !this.dead.has(o.id) && active(o, t)) this.hit(i, o.id, t, 'tnt');
      }
    }
  }

  damage(dmg, ev) {
    this.wagonHp = Math.max(0, this.wagonHp - dmg);
    this.push({ ...ev, dmg, wagonHp: this.wagonHp });
  }

  tick() {
    if (this.phase !== 'playing') return [];
    const t = this.t;
    if (t >= 0 && t < this.duration) {
      for (const b of this.world.targets) {
        if (b.t0 > t) break;
        if (t >= b.t1 || this.dead.has(b.id)) continue;
        this.threat(b, t);
      }
      // les bâtons déjà en l'air quand leur lanceur tombe explosent quand même
      for (const [id, d] of this.dead) this.sticks(this.world.targets[id], d.at, t);
      this.p.forEach((p, i) => { if (p.ai && !p.left) this.botThink(i, t); });
      if (this.wagonHp <= 0) this.finish('lost');
    }
    if (this.phase === 'playing' && t >= this.duration + 400) this.finish('saved');
    return this.flush();
  }

  sticks(b, deadAt, t) {
    for (const th of dynThrows(b, deadAt, t)) {
      const key = `${b.id}:${th.k}`;
      if (this.dyn.has(key) || t < th.at + WAGON.fly) continue;
      this.dyn.set(key, 'boom');
      this.damage(WAGON.dynDmg, { type: 'boom', id: b.id, k: th.k });
    }
  }

  threat(b, t) {
    if (b.kind === 'dyn' || b.kind === 'thrower') return this.sticks(b, Infinity, t);
    if (b.kind === 'mule' || b.kind === 'barricade') { // un seul coup, et elle disparaît
      if (t < b.reach) return;
      this.dead.set(b.id, { by: -1, at: t });
      this.damage(BANDITS[b.kind].dmg, { type: 'crash', id: b.id, at: t });
      return;
    }
    const plan = attackPlan(b);
    if (!plan) return;
    let next = this.nextAtk.get(b.id) ?? plan.first;
    while (next <= t) {
      if (strikes(b, next)) this.damage(plan.dmg, { type: 'atk', id: b.id });
      next += plan.every;
    }
    this.nextAtk.set(b.id, next);
  }

  finish(result) {
    this.phase = 'over';
    this.result = result;
    if (result === 'saved') for (const p of this.p) if (!p.left) p.score += WAGON.survive;
    const order = this.p.map((_, i) => i).sort((a, b) => (this.p[a].left - this.p[b].left) || (this.p[b].score - this.p[a].score));
    this.ranking = order;
    this.winner = order[0];
    const tie = order.length > 1 && this.p[order[1]].score === this.p[order[0]].score && !this.p[order[1]].left;
    this.push({ type: 'matchEnd', winner: this.winner, ranking: order, tie, result, bonus: result === 'saved' ? WAGON.survive : 0 });
  }

  leave(i) {
    if (this.phase !== 'playing' || !this.p[i]) return [];
    this.p[i].left = true;
    this.push({ type: 'left', who: i });
    return this.flush();
  }

  forfeit(i) {
    if (this.phase !== 'playing' || !this.p[i]) return [];
    this.p[i].left = true;
    this.finish(this.wagonHp > 0 ? 'saved' : 'lost');
    return this.flush();
  }

  // ------------------------------------------------------------ bots (mode solo)
  // Ils visent d'abord ce qui menace la roulotte : bâtons en l'air, pillards au contact, puis les plus proches.
  // Ils tentent aussi de rafler les bonus. f : le bout de la roulotte où ils regardent (0 : vue de côté).
  botThink(i, t) {
    const pl = this.p[i], b = pl.ai;
    const buff = pl.buff && pl.buff.until > t ? pl.buff.type : null;
    if (b.aim) {
      if (t < b.aim.at) return;
      const a = b.aim;
      b.aim = null;
      b.next = t + (buff === 'gold' ? rnd(280, 560) : rnd(650, 1300));
      this.liveOut.push({ key: pl.key, d: { c: [a.x, a.y], s: 1, f: a.f } });
      if (Math.random() < (buff === 'shotgun' ? 0.88 : 0.62)) {
        if (a.pick) this.pick(i, a.id, t);
        else if (a.k != null) this.hitDyn(i, a.id, a.k, t);
        else this.hit(i, a.id, t, undefined, Math.random() < 0.15);
      } else pl.streak = 0;
      return;
    }
    if (t < b.next) return;
    const cands = [];
    const look = t + 450;
    for (const tg of this.world.targets) {
      if (tg.t0 > t) break;
      const f = faceOf(tg);
      const dd = this.dead.get(tg.id);
      if (dd) {
        if (dd.by >= 0 && tg.bonus && !this.picked.has(tg.id) && Math.random() < 0.5) {
          const p = bonusPos(tg, dd.at, look);
          if (p) cands.push({ id: tg.id, pick: 1, x: p.x, y: p.y, w: 30, f });
        }
        continue;
      }
      if (!active(tg, t)) continue;
      for (const th of dynThrows(tg, Infinity, t)) {
        if (this.dyn.has(`${tg.id}:${th.k}`) || t > th.at + WAGON.fly - 400) continue;
        const p = dynPos(tg, th.k, th.at, look);
        cands.push({ id: tg.id, k: th.k, x: p.x, y: p.y, w: 0, f });
      }
      const box = targetBox(tg, look);
      if (!box) continue;
      const cx = box.x + box.w / 2;
      if (cx < 4 || cx > W - 4) continue;
      const near = tg.view === 'side' ? Math.abs(cx - WAGON.x) : inPos(tg, t).d / 3;
      cands.push({ id: tg.id, x: cx, y: box.y + box.h / 2, w: near + (t >= tg.reach ? -200 : 0) + (tg.kind === 'barricade' || tg.kind === 'mule' ? -150 : 0), f });
    }
    if (!cands.length) { b.next = t + 300; return; }
    cands.sort((a, c) => a.w - c.w);
    const a = Math.random() < 0.7 ? cands[0] : cands[Math.floor(Math.random() * cands.length)];
    b.aim = { ...a, x: Math.round(a.x + rnd(-5, 5)), y: Math.round(a.y + rnd(-5, 5)), at: t + rnd(320, 620) };
    this.liveOut.push({ key: pl.key, d: { c: [b.aim.x, b.aim.y], f: a.f } });
  }
}
