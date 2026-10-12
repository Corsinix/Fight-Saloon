// Les habitants de « La ville », à l'écran : chaque habitant de la simulation (villesim.js) devient un petit personnage
// qui vit sa journée. Purement visuel (rien ici ne touche la World ni le lockstep : le hasard est libre).
//   - Une horloge du jour (24 h en 2 minutes à vitesse ×1, plus vite à ×2 et ×3) : on se lève, on part au travail par
//     les routes, on travaille (les fermiers dans leurs champs, les vachers dans la pâture, les bûcherons dans la forêt,
//     les autres à l'intérieur), on va au magasin, à l'église le dimanche, au saloon le soir, les enfants à l'école,
//     et chacun rentre dormir.
//   - Les trajets suivent les routes (parcours en largeur sur le réseau, gardés en cache), sinon on coupe à travers champs.
//   - Les personnages sont dessinés en pixels fins : chapeau, chemise à la couleur de la faction, quatre directions,
//     quatre images de marche ; les enfants sont plus petits.
import * as I from './isokit.js';
import * as K from './villekit.js';

const { hex, tone } = I;
const BD = K.BUILDINGS;
const HOUR_MS = 5000; // une heure du jour à vitesse ×1
const SPEED = 8; // cases par heure de jeu, en marchant
const MAX_PATHS = 40; // chemins calculés au plus par image
const DOW = ['LUNDI', 'MARDI', 'MERCREDI', 'JEUDI', 'VENDREDI', 'SAMEDI', 'DIMANCHE'];

export class Folk {
  constructor(world, me = 0) {
    this.hour = 7.5;
    this.dayN = 0;
    this.agents = new Map(); // id d'habitant -> agent
    this.paths = new Map(); // "de:à" -> chemin (cases)
    this.out = [];
    this.setWorld(world, me);
  }
  setWorld(world, me = this.me) {
    this.w = world;
    this.me = me;
    this.agents.clear();
    this.paths.clear();
    this.syncAt = 0;
  }
  get dow() { return DOW[this.dayN % 7]; }
  get sunday() { return this.dayN % 7 === 6; }

  // ---------------------------------------------------------- l'heure et les agents
  update(dt, speed, now) {
    const w = this.w;
    if (speed > 0) {
      this.hour += (dt * speed) / HOUR_MS;
      if (this.hour >= 24) { this.hour -= 24; this.dayN++; for (const a of this.agents.values()) a.plan = null; }
    }
    // une fois par seconde : de nouveaux habitants, des partis, les lieux de chacun (logement, travail, magasin…)
    if (now - this.syncAt > 1000) { this.syncAt = now; this.sync(); }
    let budget = MAX_PATHS;
    this.out.length = 0;
    const step = (dt * Math.max(speed, 0)) / HOUR_MS * SPEED;
    for (const a of this.agents.values()) {
      if (!a.plan) a.plan = this.plan(a);
      // où devrait-il être, à cette heure ?
      const goal = this.goal(a);
      if (goal && (goal.b !== a.goalB || goal.mode !== a.goalMode)) {
        if (budget <= 0) { if (a.path) this.out.push(a); continue; }
        budget--;
        a.goalB = goal.b; a.goalMode = goal.mode;
        const to = this.door(goal.b);
        const from = a.path ? a.path[Math.min(a.seg + 1, a.path.length - 1)] : a.at != null ? this.door(a.at) : null;
        if (to == null || from == null) { a.at = goal.b; a.path = null; continue; }
        a.path = this.route(from, to);
        a.seg = 0; a.t = 0; a.at = null;
      }
      if (a.path) {
        // marcher le long du chemin
        a.t += step;
        while (a.path && a.t >= 1) {
          a.t -= 1; a.seg++;
          if (a.seg >= a.path.length - 1) { a.at = a.goalB; a.path = null; a.t = 0; }
        }
        if (a.path) {
          const p0 = a.path[a.seg], p1 = a.path[a.seg + 1];
          a.fi = p0[0] + 0.5 + (p1[0] - p0[0]) * a.t;
          a.fj = p0[1] + 0.5 + (p1[1] - p0[1]) * a.t;
          a.dir = dirOf(p1[0] - p0[0], p1[1] - p0[1]);
          a.walk = true;
          this.out.push(a);
        }
        continue;
      }
      // arrivé : dans les champs (on y travaille, on s'y déplace) ou à l'intérieur (caché)
      if (a.goalMode === 'field' && a.at != null) {
        if (!a.spot || a.spotT <= 0) { a.spot = this.fieldSpot(a.at); a.spotT = 1 + Math.random() * 3; a.from = [a.fi ?? a.spot[0], a.fj ?? a.spot[1]]; a.k = 0; }
        a.spotT -= (dt * Math.max(speed, 0)) / HOUR_MS;
        if (a.spot) {
          a.k = Math.min(1, (a.k || 0) + step * 0.6);
          const [x0, y0] = a.from, [x1, y1] = a.spot;
          a.fi = x0 + (x1 - x0) * a.k; a.fj = y0 + (y1 - y0) * a.k;
          a.walk = a.k < 1;
          if (a.walk) a.dir = dirOf(x1 - x0, y1 - y0);
          this.out.push(a);
        }
      } else if (a.goalMode === 'yard' && a.at != null) {
        // les enfants jouent devant chez eux
        const d = this.door(a.at);
        if (d) { a.fi = d[0] + 0.5 + Math.sin(this.hour * 3 + a.id) * 0.4; a.fj = d[1] + 0.5 + Math.cos(this.hour * 2.3 + a.id) * 0.4; a.walk = true; a.dir = (a.id + Math.floor(this.hour * 2)) % 4; this.out.push(a); }
      }
    }
  }
  outside() { return this.out; }

  // les habitants de la World (on garde les agents de ceux qui restent)
  sync() {
    const w = this.w, seen = new Set();
    // les lieux utiles de chaque ville : magasins, églises, saloons, écoles
    this.places = w.towns.map((t) => ({ food: [], faith: [], fun: [], school: [] }));
    for (const b of w.B) {
      if (b.site || !this.places[b.p]) continue;
      const d = BD[b.t], P = this.places[b.p];
      if (d.svc?.need === 'nourriture') P.food.push(b);
      if (d.svc?.need === 'foi') P.faith.push(b);
      if (d.svc?.need === 'loisirs') P.fun.push(b);
      if (d.school) P.school.push(b);
    }
    for (const c of w.C) {
      seen.add(c.id);
      let a = this.agents.get(c.id);
      if (!a) {
        a = { id: c.id, plan: null, at: c.home >= 0 ? c.home : null, path: null, seg: 0, t: 0, fi: 0, fj: 0, dir: 0, walk: false, look: lookOf(c) };
        this.agents.set(c.id, a);
      }
      a.c = c;
      a.home = c.home >= 0 ? c.home : null;
      a.job = c.job >= 0 ? c.job : null;
    }
    for (const id of [...this.agents.keys()]) if (!seen.has(id)) this.agents.delete(id);
  }

  // l'emploi du temps d'un habitant pour la journée (avec un peu de fantaisie)
  plan(a) {
    const r = Math.random;
    return {
      wake: 5.5 + r() * 1.5, work: 6.8 + r() * 1.4, lunch: r() < 0.3 ? 12 + r() : null, off: 16 + r() * 2,
      out: r() < (this.sunday ? 0.7 : 0.45) ? 0.6 + r() * 1.6 : 0, bed: 20 + r() * 2.5, owl: r() < 0.08,
    };
  }
  nearest(list, from) {
    if (!list || !list.length || !from) return null;
    let best = null, bd = 1e9;
    for (const b of list) { const d = Math.abs(b.x - from.x) + Math.abs(b.y - from.y); if (d < bd) { bd = d; best = b; } }
    return best;
  }
  // où va-t-il, maintenant ? { b : bâtiment, mode : 'in' (dedans), 'field' (dehors, au travail), 'yard' (devant) }
  goal(a) {
    const h = this.hour, p = a.plan, c = a.c, w = this.w;
    if (!c) return null;
    const home = a.home != null ? w.byId.get(a.home) : null;
    const P = this.places?.[c.p];
    const atHome = home ? { b: home.id, mode: 'in' } : null;
    if (h < p.wake || h >= p.bed) return p.owl && h >= p.bed && h < 23.5 ? this.fun(a, P, home) || atHome : atHome;
    const kid = c.age < 16, old = c.age >= 65;
    if (kid) {
      if (h >= 8.5 && h < 15 && !this.sunday && P?.school.length) { const s = this.nearest(P.school, home); return { b: s.id, mode: 'in' }; }
      if (h >= 9 && h < 18) return home ? { b: home.id, mode: 'yard' } : null;
      return atHome;
    }
    if (this.sunday && h >= 9 && h < 11.5 && P?.faith.length) { const e = this.nearest(P.faith, home); return { b: e.id, mode: 'in' }; }
    const job = a.job != null ? w.byId.get(a.job) : null;
    if (job && !old && !this.sunday && h >= p.work && h < p.off) {
      if (p.lunch && h >= p.lunch && h < p.lunch + 0.8 && P?.food.length) { const f = this.nearest(P.food, job); return { b: f.id, mode: 'in' }; }
      return { b: job.id, mode: outdoorJob(job) ? 'field' : 'in' };
    }
    // le temps libre : les courses le matin, les loisirs le soir
    if (h >= 9 && h < 12 && (!job || old) && P?.food.length && (a.id % 3 === 0)) { const f = this.nearest(P.food, home); return { b: f.id, mode: 'in' }; }
    if (p.out && h >= p.off && h < p.off + p.out) return this.fun(a, P, home) || atHome;
    return atHome;
  }
  fun(a, P, home) {
    if (!P) return null;
    const list = P.fun.length ? P.fun : P.food;
    const b = this.nearest(list, home);
    return b ? { b: b.id, mode: 'in' } : null;
  }

  // la case devant la porte d'un bâtiment : une route qui le touche, sinon la case devant sa façade
  door(bid) {
    const b = this.w.byId.get(bid);
    if (!b) return null;
    if (b._door && b._doorDay === this.w.day) return b._door;
    const w = this.w;
    let best = null;
    w.edge(b, (i) => { if (!best && w.road[i]) best = [i % w.n, Math.floor(i / w.n)]; });
    if (!best) { const [bw, bd] = w.dimsOf(b); best = [b.x + (bw >> 1), Math.min(w.n - 1, b.y + bd)]; }
    b._door = best; b._doorDay = w.day;
    return best;
  }
  // un endroit des champs (ou de la pâture, de la coupe) d'une exploitation, où travailler un moment
  fieldSpot(bid) {
    const w = this.w, b = w.byId.get(bid);
    if (!b) return null;
    const [bw, bd] = w.dimsOf(b);
    const pr = BD[b.t].prod;
    const r = pr ? pr.r : 1;
    for (let tries = 0; tries < 12; tries++) {
      const i = b.x - r + Math.floor(Math.random() * (bw + 2 * r)), j = b.y - r + Math.floor(Math.random() * (bd + 2 * r));
      if (!w.inMap(i, j)) continue;
      const k = w.idx(i, j);
      if (w.fieldOf[k] === b.id || (pr?.res === 'bois' && w.wood[k] > 0) || (pr?.res === 'dep' && w.tileB[k] < 0)) return [i + 0.2 + Math.random() * 0.6, j + 0.2 + Math.random() * 0.6];
    }
    const d = this.door(bid);
    return d ? [d[0] + 0.5, d[1] + 0.5] : null;
  }

  // chemin par les routes (parcours en largeur), sinon en ligne brisée à travers champs
  route(from, to) {
    const key = from[0] + ',' + from[1] + ':' + to[0] + ',' + to[1];
    let p = this.paths.get(key);
    if (p) return p;
    const w = this.w, n = w.n;
    const a = from[1] * n + from[0], b = to[1] * n + to[0];
    p = null;
    if (w.road[a] && w.road[b]) {
      const prev = new Int32Array(n * n).fill(-1);
      prev[a] = a;
      const q = [a];
      for (let h = 0; h < q.length && h < 20000; h++) {
        const i = q[h];
        if (i === b) break;
        const x = i % n, y = (i - x) / n;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const X = x + dx, Y = y + dy;
          if (X < 0 || Y < 0 || X >= n || Y >= n) continue;
          const j = Y * n + X;
          if (prev[j] >= 0 || !w.road[j]) continue;
          prev[j] = i;
          q.push(j);
        }
      }
      if (prev[b] >= 0) {
        p = [];
        for (let i = b; ; i = prev[i]) { p.push([i % n, Math.floor(i / n)]); if (i === a) break; }
        p.reverse();
      }
    }
    if (!p) {
      p = [[from[0], from[1]]];
      let [x, y] = from;
      while (x !== to[0]) { x += Math.sign(to[0] - x); p.push([x, y]); }
      while (y !== to[1]) { y += Math.sign(to[1] - y); p.push([x, y]); }
    }
    if (p.length < 2) p.push(p[0]);
    if (this.paths.size > 3000) this.paths.delete(this.paths.keys().next().value);
    this.paths.set(key, p);
    return p;
  }

  // ---------------------------------------------------------- dessin
  draw(g, view, a, now) {
    const [wx, wy] = view.tileTop(a.fi, a.fj);
    const frames = personFrames(a.look);
    const f = frames[a.dir * 4 + (a.walk ? Math.floor(now / 140 + a.id) % 4 : 0)];
    const z = view.zoom, k = I.K;
    const [sx, sy] = view.toView(wx - f.width / k / 2, wy - f.height / k + 1);
    g.drawImage(f, sx, sy, Math.max(1, Math.round((f.width / k) * z)), Math.max(1, Math.round((f.height / k) * z)));
  }
}

// le métier se fait-il dehors ? (champs, pâtures, coupes, carrières)
function outdoorJob(b) {
  const pr = BD[b.t].prod;
  return !!pr && (K.CROPS[pr.res] || pr.res === 'paturage' || pr.res === 'bois' || b.t === 'carriere' || b.t === 'placer' || b.t === 'saline');
}
// direction à l'écran d'un pas sur la grille : 0 vers le bas à droite (+i), 1 vers le bas à gauche (+j),
// 2 vers le haut à gauche (-i), 3 vers le haut à droite (-j)
function dirOf(di, dj) { return di > 0 ? 0 : dj > 0 ? 1 : di < 0 ? 2 : 3; }

// l'allure d'un habitant : peau, chapeau, chemise (couleur de sa faction), pantalon ; enfant ou adulte
const SKINS = ['#f0c8a0', '#d8a078', '#a8704a', '#7a4a30'];
const HATS = ['#5a3a22', '#2a2222', '#c8a860', '#8a6a4a', '#e8e0d0'];
const PANTS = ['#3a3a4a', '#4a3a2a', '#2a3a4a', '#5a4a3a'];
function lookOf(c) {
  const h = (c.id * 2654435761) >>> 0;
  return { skin: SKINS[h % 4], hat: HATS[(h >>> 4) % 5], shirt: K.FACTIONS[c.fac]?.col || '#c2643e', pants: PANTS[(h >>> 8) % 4], kid: c.age < 16, dress: (h >>> 12) % 3 === 0 };
}
// les images d'un personnage (pixels fins) : 4 directions × 4 images de marche
const FRAMES = new Map();
function personFrames(L) {
  const key = `${L.skin}${L.hat}${L.shirt}${L.pants}${L.kid ? 'k' : ''}${L.dress ? 'd' : ''}`;
  let fr = FRAMES.get(key);
  if (fr) return fr;
  fr = [];
  const S0 = hex(L.skin), H = hex(L.hat), Sh = hex(L.shirt), P = hex(L.pants), B = hex('#2a1a10');
  const kid = L.kid, s = kid ? 0.72 : 1;
  for (let dir = 0; dir < 4; dir++) for (let f = 0; f < 4; f++) {
    const W = 9, Hh = Math.round(16 * s) + 2;
    const px = new I.Pix(W + 2, Hh + 2);
    const back = dir >= 2, left = dir === 1 || dir === 2;
    const set = (x, y, c) => px.set(1 + (left ? W - 1 - x : x), 1 + y, c);
    const y0 = 0;
    // chapeau à bords, tête, chemise, bras, jambes (qui alternent), bottes
    const hy = y0, top = Math.round(2 * s);
    if (!kid || L.hat !== '#e8e0d0') { for (let x = 1; x < 8; x++) set(x, hy + top + 1, tone(H, -0.15)); for (let x = 3; x < 6; x++) for (let y = hy; y <= hy + top; y++) set(x, y, x === 3 ? tone(H, 0.15) : H); }
    const headY = hy + top + 2;
    for (let x = 3; x < 6; x++) for (let y = headY; y < headY + Math.round(3 * s); y++) set(x, y, back ? tone(H, -0.3) : x === 5 ? tone(S0, -0.15) : S0);
    if (!back) set(4, headY + 1, hex('#2a1a10'));
    const bodyY = headY + Math.round(3 * s), bodyH = Math.round(5 * s);
    for (let x = 2; x < 7; x++) for (let y = bodyY; y < bodyY + bodyH; y++) set(x, y, x === 6 ? tone(Sh, -0.25) : y === bodyY ? tone(Sh, 0.15) : Sh);
    // les bras se balancent
    const swing = f === 1 ? 1 : f === 3 ? -1 : 0;
    for (let y = 0; y < Math.round(4 * s); y++) { set(1, bodyY + y + (swing > 0 ? 1 : 0), tone(Sh, -0.1)); set(7, bodyY + y + (swing < 0 ? 1 : 0), tone(Sh, -0.3)); }
    set(1, bodyY + Math.round(4 * s) + (swing > 0 ? 1 : 0), S0);
    const legY = bodyY + bodyH, legH = Math.round(5 * s);
    if (L.dress && !kid) for (let x = 2; x < 7; x++) for (let y = legY; y < legY + legH - 1; y++) set(x, y, x === 6 ? tone(Sh, -0.35) : tone(Sh, -0.12));
    else for (let y = 0; y < legH - 1; y++) {
      const a = f === 1 ? (y > 1 ? -1 : 0) : f === 3 ? (y > 1 ? 1 : 0) : 0;
      set(3 + a, legY + y, P); set(5 - a, legY + y, tone(P, -0.2));
    }
    const fy = legY + legH - 1;
    set(f === 1 ? 2 : 3, fy, B); set(f === 3 ? 6 : 5, fy, B);
    px.outline();
    fr.push(px.canvas());
  }
  FRAMES.set(key, fr);
  return fr;
}
