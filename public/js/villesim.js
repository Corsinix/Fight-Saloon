// Simulation de « La ville » : une carte partagée par 1 à 4 maires (World), chacun avec sa ville (town), ses
// bâtiments, ses habitants, son trésor, ses factions et ses édits. Aucun DOM : l'arbitre (villegame.js), chaque
// navigateur (ville.js) et l'outil d'équilibrage (tools/villesim-check.mjs) font tourner exactement la même chose.
//
// Lockstep : chaque navigateur a sa World, identique à celle de l'hôte. L'hôte n'envoie que des « tours » : jusqu'à
// quel jour avancer, et les commandes des joueurs à appliquer au passage (apply). Tout doit donc être déterministe :
// le hasard vient de this.rs (sauvegardé), on parcourt des tableaux dans l'ordre, on calcule en entiers ou avec
// + - × ÷ (jamais Math.random, Date, sin, exp…), et hash() permet de vérifier que deux World n'ont pas divergé.
//
// Un jour = un pas (step) : chantiers, incendies. Le gros du travail tombe une fois par mois (monthly) : emplois,
// logements, production, consommation, besoins, bonheur, argent, factions, commerce, migrations, événements, élections.
import * as K from './villekit.js';

const { TER, DEP, TIME, BUILDINGS: BD, GOODS, GOOD_IDS, FOOD_IDS, NEEDS, N, NEED_W, FACTIONS, F, EDICTS, EVENTS, ERAS, MODES_VILLE, clamp, rint, rpct, rrange } = K;
export const SAVE_V = 2; // 2 : grandes cartes à biomes
const NF = FACTIONS.length;
const DEMAND_EVERY = 18; // mois
const START = { money: 3000, settlers: 12, goods: { mais: 120, boeuf: 30, bois: 40 } };

// ------------------------------------------------------------ encodage compact (sauvegarde, instantanés)
export function rle(arr) {
  const out = [];
  for (let i = 0; i < arr.length;) {
    let j = i + 1;
    while (j < arr.length && arr[j] === arr[i]) j++;
    out.push(arr[i], j - i);
    i = j;
  }
  return out;
}
export function unrle(data, Ctor, len) {
  const a = new Ctor(len);
  let k = 0;
  for (let i = 0; i < data.length; i += 2) for (let r = 0; r < data[i + 1] && k < len; r++) a[k++] = data[i];
  return a;
}
// FNV-1a sur une suite d'entiers
function fnv(h, v) {
  v |= 0;
  for (let s = 0; s < 32; s += 8) { h ^= (v >>> s) & 255; h = Math.imul(h, 0x01000193); }
  return h;
}

// ------------------------------------------------------------ la carte partagée
export class World {
  // players : [{ key, name, bot }] ; mode : id de MODES_VILLE
  constructor(seed, players, mode = 'rivalite', fresh = true) {
    this.seed = seed >>> 0;
    this.players = players.map((p) => ({ key: p.key, name: p.name, bot: !!p.bot }));
    this.mode = MODES_VILLE[mode] ? mode : 'rivalite';
    this.map = K.worldgen(this.seed, this.players.length);
    const { n } = this.map, nn = n * n;
    this.n = n;
    this.day = 0;
    this.rs = { s: (this.seed ^ 0x9e3779b9) >>> 0 };
    this.nextId = 1;
    this.owner = new Int8Array(nn).fill(-1);
    this.road = new Uint8Array(nn);
    this.tileB = new Int32Array(nn).fill(-1);
    this.wood = Uint8Array.from(this.map.wood0);
    this.dep = Uint8Array.from(this.map.dep);
    this.depQ = Uint16Array.from(this.map.depQ);
    this.reveal = new Uint8Array(nn); // pétrole repéré : un bit par maire
    this.B = [];
    this.byId = new Map();
    this.C = [];
    this.nextC = 1;
    this.towns = [];
    this.price = Object.fromEntries(GOOD_IDS.map((g) => [g, 100])); // cours de chaque bien (en % du prix de base)
    this.contracts = [];
    this.offers = []; // échanges proposés entre maires
    this.mods = {}; // effets en cours sur toute la carte (krach…)
    this.next = { contract: 8 * 30, global: 10 * 30 };
    this.result = null; // fin de partie : { winners: [p], reason }
    this.ev = []; // pour l'interface (pas sauvegardé)
    this.dirty = true;
    this.waterAdd = new Uint8Array(nn);
    this.fieldOf = new Int32Array(nn).fill(-1);
    this.linked = new Uint8Array(nn);
    // seul, pas de territoire : toute la carte est à soi
    this.solo = this.players.length === 1;
    if (this.solo) this.owner.fill(0);
    if (fresh) this.players.forEach((p, i) => this.found(i));
  }

  // ---------------------------------------------------------- outils de carte
  idx(x, y) { return y * this.n + x; }
  inMap(x, y) { return x >= 0 && y >= 0 && x < this.n && y < this.n; }
  ter(i) { return this.map.ter[i]; }
  water(i) { if (this.dirty) this.refresh(); return Math.min(100, this.map.water0[i] + this.waterAdd[i]); }
  fert(crop, i) {
    const t = this.map.ter[i];
    if (t === TER.WATER || t === TER.MESA || t === TER.MOUNT || t === TER.MARSH) return 0;
    return K.fertility(crop, this.water(i), this.map.heat[i], this.map.soil[i]);
  }
  pasture(i) {
    const t = this.map.ter[i], w = this.water(i);
    if (t === TER.PRAIRIE) return clamp(45 + (w >> 1), 0, 100);
    if (t === TER.DESERT) return clamp(Math.round(w / 3), 0, 100);
    if (t === TER.FOREST) return 15;
    if (t === TER.MARSH) return 25;
    return 0;
  }
  // richesse d'une ressource sur une case (filtres de carte, choix de l'IA)
  resource(id, i, p = -1) {
    if (id === 'eau') return this.water(i);
    if (K.CROPS[id]) return this.fert(id, i);
    if (id === 'paturage') return this.pasture(i);
    if (id === 'bois') return this.wood[i];
    const d = DEP[id.toUpperCase()];
    if (d) {
      if (this.dep[i] !== d) return 0;
      if (d === DEP.PETROLE && (p < 0 || !(this.reveal[i] & (1 << p)))) return 0;
      return Math.min(100, Math.round(this.depQ[i] / 12));
    }
    return 0;
  }
  bAt(x, y) { if (!this.inMap(x, y)) return null; const id = this.tileB[this.idx(x, y)]; return id < 0 ? null : this.byId.get(id); }

  // ---------------------------------------------------------- fondation d'une ville
  found(p) {
    const [sx, sy] = this.map.starts[p];
    const town = {
      p, name: this.map.names[p], money: START.money, tax: 1, era: 1, edicts: {}, mods: {},
      goods: Object.fromEntries(GOOD_IDS.map((g) => [g, START.goods[g] || 0])),
      sell: Object.fromEntries(GOOD_IDS.map((g) => [g, 1])), // 1 : on vend le surplus, 0 : on garde
      ap: new Array(NF).fill(50), bonus: new Array(NF).fill(0), demands: [], nextDemand: 6 * 30, nextEvent: (4 + p) * 30,
      press: -1, speech: -1, fraud: 0, loan: 0, wageUp: 0,
      next: { coach: 3 * 30, train: 0, boat: 0, election: TIME.electionEvery * 30 },
      pending: [], // décisions en attente (événements, campagne) : { id, opt, until }
      exportsYear: 0, exportsTotal: 0, broke: 0, lost: null, winner: false, won: 0, mission: 0, ghost: false,
      stat: { pop: 0, hap: 50, fed: 1, jobless: 0, homeless: 0, crime: 0, inc: {}, out: {}, made: {}, eaten: 0 },
      hist: [], // un point par mois : [pop, argent, bonheur]
      contracts: [],
    };
    this.towns[p] = town;
    // la mairie, trois cabanes et un bout de grand-rue
    const place = (t, x, y) => { const b = this.addB(t, x, y, 0, p); b.site = 0; return b; };
    place('mairie', sx, sy);
    this.claim(p, sx + 1, sy + 1, BD.mairie.claim);
    for (let x = sx - 3; x <= sx + 5; x++) this.setRoad(x, sy + 2, 1, p, true);
    place('cabane', sx - 2, sy + 3);
    place('cabane', sx, sy + 3);
    place('cabane', sx + 2, sy + 3);
    place('magasin', sx + 3, sy);
    this.dirty = true;
    for (let k = 0; k < START.settlers; k++) this.newCitizen(p, rrange(this.rs, 18, 40));
    this.monthHousing(town);
    town.stat.pop = START.settlers;
    town.stat.hap = 50;
  }

  // ---------------------------------------------------------- bâtiments
  addB(t, x, y, rot, p) {
    const def = BD[t];
    const b = { id: this.nextId++, t, x, y, rot, p, site: def.days, on: 1, w: 0, ex: 0, eff: 0, fire: 0, note: '', lvl: 1 };
    this.B.push(b);
    this.byId.set(b.id, b);
    for (const [fx, fy] of K.footprint(def, x, y, rot)) {
      const i = this.idx(fx, fy);
      this.tileB[i] = b.id;
      if (this.map.ter[i] === TER.FOREST) this.wood[i] = 0; // on défriche
    }
    this.dirty = true;
    return b;
  }
  removeB(b) {
    const def = BD[b.t];
    for (const [fx, fy] of K.footprint(def, b.x, b.y, b.rot)) this.tileB[this.idx(fx, fy)] = -1;
    const k = this.B.indexOf(b);
    if (k >= 0) this.B.splice(k, 1);
    this.byId.delete(b.id);
    for (const c of this.C) {
      if (c.home === b.id) c.home = -1;
      if (c.job === b.id) c.job = -1;
    }
    this.dirty = true;
  }
  dimsOf(b) { return K.dims(BD[b.t], b.rot); }
  // distance (en cases) entre deux rectangles d'emprise, au carré, en demi-cases (entiers)
  dist2(ax, ay, aw, ad, bx, by, bw, bd) {
    const dx = (2 * ax + aw) - (2 * bx + bw), dy = (2 * ay + ad) - (2 * by + bd);
    return dx * dx + dy * dy;
  }
  // une case est-elle à moins de r cases (cercle) du bâtiment b ?
  near(b, x, y, r) {
    const [w, d] = this.dimsOf(b);
    const dx = (2 * x + 1) - (2 * b.x + w), dy = (2 * y + 1) - (2 * b.y + d);
    const R = 2 * r + Math.max(w, d) - 1;
    return dx * dx + dy * dy <= R * R;
  }
  townB(p, pred = () => true) { return this.B.filter((b) => b.p === p && pred(b)); }
  has(p, t, done = false) { return this.B.some((b) => b.p === p && b.t === t && (!done || !b.site)); }
  count(p, t, done = true) { let c = 0; for (const b of this.B) if (b.p === p && b.t === t && (!done || !b.site)) c++; return c; }

  // territoire : les cases libres dans le rayon r autour de (cx, cy) reviennent à p (premier arrivé, premier servi)
  claim(p, cx, cy, r) {
    for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) {
      if (!this.inMap(x, y)) continue;
      const dx = x - cx, dy = y - cy;
      if (dx * dx + dy * dy > r * r + r) continue;
      const i = this.idx(x, y);
      if (this.owner[i] < 0) this.owner[i] = p;
    }
  }
  claimB(b) {
    const def = BD[b.t], [w, d] = this.dimsOf(b);
    const r = def.claim || 1;
    this.claim(b.p, b.x + (w >> 1), b.y + (d >> 1), r + (def.claim ? 0 : Math.max(w, d) >> 1));
  }

  setRoad(x, y, kind, p, free = false) {
    const i = this.idx(x, y);
    this.road[i] = kind;
    if (free && this.owner[i] < 0) this.owner[i] = p;
    this.dirty = true;
  }

  // ---------------------------------------------------------- placement
  // { ok, err, cost } : peut-on poser t en (x, y) ? (la même règle pour l'aperçu de l'interface et pour apply)
  canPlace(p, t, x, y, rot = 0) {
    const def = BD[t], town = this.towns[p];
    if (!def || def.era > 4) return { ok: false, err: 'IMPOSSIBLE' };
    if (town.lost) return { ok: false, err: 'VOUS N\'ÊTES PLUS MAIRE' };
    if (def.era > town.era) return { ok: false, err: `DÉBLOQUÉ À L'ÈRE ${def.era}` };
    if (def.unique && this.has(p, t)) return { ok: false, err: 'UN SEUL PAR VILLE' };
    const fp = K.footprint(def, x, y, rot);
    let prairie = 0, depOk = false, waterOk = false;
    const wantDep = def.on?.startsWith('dep:') ? DEP[def.on.slice(4).toUpperCase()] : 0;
    for (const [fx, fy] of fp) {
      if (!this.inMap(fx, fy)) return { ok: false, err: 'HORS DE LA CARTE' };
      const i = this.idx(fx, fy), tr = this.map.ter[i];
      if (this.owner[i] !== p) return { ok: false, err: this.owner[i] < 0 ? 'HORS DE VOTRE TERRITOIRE' : 'TERRE D\'UN AUTRE MAIRE' };
      if (!K.buildableTer(tr)) return { ok: false, err: tr === TER.WATER ? 'DANS L\'EAU' : tr === TER.MARSH ? 'DANS LE MARAIS' : 'TERRAIN IMPRATICABLE' };
      if (this.tileB[i] >= 0) return { ok: false, err: 'LA PLACE EST PRISE' };
      if (this.road[i]) return { ok: false, err: 'SUR LA ROUTE' };
      if (this.map.rail[i]) return { ok: false, err: 'SUR LA VOIE FERRÉE' };
      if (tr === TER.PRAIRIE) prairie++;
      if (wantDep && this.dep[i] === wantDep && this.depQ[i] > 0 && (wantDep !== DEP.PETROLE || this.reveal[i] & (1 << p))) depOk = true;
      if (this.water(i) >= 70) waterOk = true;
    }
    const around = (test) => {
      const [w, d] = K.dims(def, rot);
      for (let yy = y - 1; yy <= y + d; yy++) for (let xx = x - 1; xx <= x + w; xx++) {
        if (!this.inMap(xx, yy) || (xx >= x && xx < x + w && yy >= y && yy < y + d)) continue;
        if ((xx === x - 1 || xx === x + w) && (yy === y - 1 || yy === y + d)) continue; // pas les coins
        if (test(this.idx(xx, yy))) return true;
      }
      return false;
    };
    switch (def.on) {
      case 'prairie': if (prairie * 2 < fp.length) return { ok: false, err: 'IL FAUT DE LA PRAIRIE' }; break;
      case 'riviere': if (!around((i) => this.map.ter[i] === TER.WATER)) return { ok: false, err: 'AU BORD DE LA RIVIÈRE' }; break;
      case 'pres_riviere': if (!fp.some(([fx, fy]) => this.map.dist[this.idx(fx, fy)] <= 3)) return { ok: false, err: 'À MOINS DE 3 CASES DE LA RIVIÈRE' }; break;
      case 'rail': if (!around((i) => this.map.rail[i])) return { ok: false, err: 'LE LONG DE LA VOIE FERRÉE' }; break;
      case 'eau70': if (!waterOk) return { ok: false, err: 'IL FAUT UNE EAU ABONDANTE' }; break;
      default: if (wantDep && !depOk) return { ok: false, err: `SUR UN FILON ${K.DEP_IDS[wantDep] === 'petrole' ? 'DE PÉTROLE REPÉRÉ' : 'D\'' + GOODS[K.DEP_IDS[wantDep]].name}` };
    }
    const cost = K.costOf(def);
    if (town.money < cost) return { ok: false, err: 'PAS ASSEZ D\'ARGENT', cost };
    return { ok: true, cost };
  }

  canUpgrade(p, b) {
    const def = BD[b.t], town = this.towns[p];
    if (!K.upgradable(def)) return { ok: false, err: 'NE S\'AMÉLIORE PAS' };
    if (b.lvl > 1) return { ok: false, err: 'DÉJÀ AMÉLIORÉ' };
    if (b.site) return { ok: false, err: 'ENCORE EN CHANTIER' };
    if (town.era < K.UPGRADE.era) return { ok: false, err: `À PARTIR DE L'ÈRE ${K.UPGRADE.era}` };
    const cost = K.upgradeCost(def);
    if (town.money < cost) return { ok: false, err: 'PAS ASSEZ D\'ARGENT', cost };
    return { ok: true, cost };
  }

  canRoad(p, x, y, kind) {
    if (!this.inMap(x, y)) return { ok: false, err: 'HORS DE LA CARTE' };
    const i = this.idx(x, y), tr = this.map.ter[i], town = this.towns[p];
    if (!K.ROADS[kind] || K.ROADS[kind].era > town.era) return { ok: false, err: 'PAS ENCORE DISPONIBLE' };
    if (this.owner[i] !== p) return { ok: false, err: 'HORS DE VOTRE TERRITOIRE' };
    if (tr === TER.MESA || tr === TER.MOUNT) return { ok: false, err: 'TERRAIN IMPRATICABLE' };
    if (this.tileB[i] >= 0) return { ok: false, err: 'LA PLACE EST PRISE' };
    if (this.road[i] >= kind) return { ok: false, err: 'DÉJÀ UNE ROUTE', same: true };
    const cost = tr === TER.WATER ? K.BRIDGE_COST : tr === TER.MARSH ? K.ROADS[kind].cost * 3 : K.ROADS[kind].cost;
    if (town.money < cost) return { ok: false, err: 'PAS ASSEZ D\'ARGENT', cost };
    return { ok: true, cost };
  }

  // ---------------------------------------------------------- commandes des joueurs (lockstep)
  // Toutes passent par ici, dans le même ordre sur chaque navigateur. Renvoie { ok, err }.
  apply(p, c) {
    const town = this.towns[p];
    if (!town || !c || typeof c !== 'object') return { ok: false };
    const r = this.applyCmd(p, town, c);
    if (r && !r.ok && r.err) this.ev.push({ t: 'err', p, text: r.err });
    return r || { ok: true };
  }

  applyCmd(p, town, c) {
    if (town.lost && !town.ghost) return { ok: false, err: 'VOUS N\'ÊTES PLUS MAIRE' };
    switch (c.c) {
      case 'build': {
        const x = c.x | 0, y = c.y | 0, rot = c.rot & 3; // quatre sens (l'emprise ne dépend que de la parité)
        const chk = this.canPlace(p, c.t, x, y, rot);
        if (!chk.ok) return chk;
        town.money -= chk.cost;
        const b = this.addB(c.t, x, y, rot, p);
        this.ev.push({ t: 'build', p, id: b.id });
        return { ok: true, id: b.id };
      }
      case 'road': {
        const kind = c.kind === 2 ? 2 : 1;
        let n = 0, err = null;
        for (const t of Array.isArray(c.tiles) ? c.tiles.slice(0, 200) : []) {
          const x = t[0] | 0, y = t[1] | 0;
          const chk = this.canRoad(p, x, y, kind);
          if (!chk.ok) { if (!chk.same) err = chk.err; continue; }
          town.money -= chk.cost;
          this.setRoad(x, y, kind, p);
          n++;
        }
        return n ? { ok: true } : { ok: false, err };
      }
      case 'demolish': {
        const x = c.x | 0, y = c.y | 0;
        if (!this.inMap(x, y)) return { ok: false };
        const b = this.bAt(x, y);
        if (b) {
          if (b.p !== p) return { ok: false, err: 'CE N\'EST PAS À VOUS' };
          if (b.t === 'mairie') return { ok: false, err: 'ON NE DÉMOLIT PAS LA MAIRIE' };
          const def = BD[b.t];
          town.money += Math.round(def.cost * (b.site ? 0.75 : 0.25));
          this.removeB(b);
          this.ev.push({ t: 'demolish', p, x, y });
          return { ok: true };
        }
        const i = this.idx(x, y);
        if (this.road[i] && this.owner[i] === p) { this.road[i] = 0; this.dirty = true; return { ok: true }; }
        return { ok: false };
      }
      case 'upgrade': {
        const b = this.byId.get(c.id | 0);
        if (!b || b.p !== p) return { ok: false };
        const chk = this.canUpgrade(p, b);
        if (!chk.ok) return chk;
        town.money -= chk.cost;
        b.lvl = 2;
        this.dirty = true;
        this.ev.push({ t: 'upgraded', p, id: b.id });
        return { ok: true };
      }
      case 'toggle': {
        const b = this.byId.get(c.id | 0);
        if (!b || b.p !== p) return { ok: false };
        b.on = b.on ? 0 : 1;
        return { ok: true };
      }
      case 'edict': return this.setEdict(p, town, String(c.id), !!c.on);
      case 'tax': town.tax = clamp(c.v | 0, 0, 2); return { ok: true };
      case 'sell': if (GOODS[c.g]) town.sell[c.g] = c.v ? 1 : 0; return { ok: true };
      case 'choose': return this.choose(p, town, c.id, c.opt | 0);
      case 'press': if (!this.has(p, 'journal', true)) return { ok: false, err: 'IL FAUT UN JOURNAL' }; town.press = clamp(c.fac | 0, -1, NF - 1); return { ok: true };
      case 'contract': {
        const ct = this.contracts.find((k) => k.id === (c.id | 0));
        if (!ct) return { ok: false, err: 'CONTRAT EXPIRÉ' };
        if (!this.has(p, 'telegraphe', true)) return { ok: false, err: 'IL FAUT UN TÉLÉGRAPHE' };
        if (!ct.takers.includes(p)) ct.takers.push(p);
        return { ok: true };
      }
      case 'offer': return this.offer(p, c);
      case 'answer': return this.answer(p, c.id | 0, !!c.yes);
      case 'gift': {
        const to = c.to | 0, v = Math.max(0, Math.min(town.money, c.money | 0));
        if (!this.towns[to] || to === p || !v) return { ok: false };
        town.money -= v;
        this.towns[to].money += v;
        this.ev.push({ t: 'msg', p: to, text: `${town.name} VOUS OFFRE ${v} $`, col: '#b8e070' });
        return { ok: true };
      }
      default: return { ok: false };
    }
  }

  setEdict(p, town, id, on) {
    const e = EDICTS[id];
    if (!e || e.tax) return { ok: false };
    if (!on) { delete town.edicts[id]; return { ok: true }; }
    if (town.edicts[id] != null) return { ok: false, err: 'DÉJÀ EN VIGUEUR' };
    if (e.needs && !this.has(p, e.needs, true)) return { ok: false, err: `IL FAUT : ${BD[e.needs].name}` };
    if (town.money < e.cost) return { ok: false, err: 'PAS ASSEZ D\'ARGENT' };
    town.money -= e.cost;
    if (e.once) {
      if (id === 'fete') town.mods.fete = this.day + 360;
      if (id === 'pret') { town.money += 3000; town.loan += 30; }
      if (id === 'bourrage') {
        town.fraud = 10;
        if (rpct(this.rs, 30)) {
          for (let f = 0; f < NF; f++) town.bonus[f] -= 10;
          this.ev.push({ t: 'msg', p, text: 'SCANDALE ! LE BOURRAGE DES URNES EST DANS TOUS LES JOURNAUX', col: '#f0705a' });
        }
      }
      if (id === 'appel') { delete town.mods.greve; delete town.mods.gang; this.addBonus(town, e.fac); }
      return { ok: true };
    }
    town.edicts[id] = this.day;
    return { ok: true };
  }
  addBonus(town, fac) { for (const k in fac) town.bonus[F[k]] += fac[k]; }

  // ---------------------------------------------------------- échanges entre maires
  offer(p, c) {
    const to = c.to | 0;
    if (!this.towns[to] || to === p || this.towns[to].lost) return { ok: false };
    const clean = (o) => {
      const r = {};
      for (const g of [...GOOD_IDS, 'money']) { const v = Math.max(0, Math.min(99999, (o?.[g] | 0))); if (v) r[g] = v; }
      return r;
    };
    const give = clean(c.give), want = clean(c.want);
    if (!Object.keys(give).length && !Object.keys(want).length) return { ok: false };
    if (this.offers.filter((o) => o.from === p).length >= 3) return { ok: false, err: 'TROP D\'OFFRES EN COURS' };
    const id = this.nextId++;
    this.offers.push({ id, from: p, to, give, want, until: this.day + 60 });
    this.ev.push({ t: 'offer', p: to, id });
    return { ok: true };
  }
  answer(p, id, yes) {
    const k = this.offers.findIndex((o) => o.id === id && o.to === p);
    if (k < 0) return { ok: false, err: 'OFFRE EXPIRÉE' };
    const o = this.offers[k];
    this.offers.splice(k, 1);
    if (!yes) { this.ev.push({ t: 'msg', p: o.from, text: `${this.towns[p].name} REFUSE VOTRE OFFRE`, col: '#f0705a' }); return { ok: true }; }
    const A = this.towns[o.from], Bt = this.towns[p];
    const enough = (t, set) => Object.entries(set).every(([g, v]) => (g === 'money' ? t.money : t.goods[g]) >= v);
    if (!enough(A, o.give) || !enough(Bt, o.want)) return { ok: false, err: 'L\'ÉCHANGE N\'EST PLUS POSSIBLE' };
    const move = (from, to, set) => { for (const [g, v] of Object.entries(set)) { if (g === 'money') { from.money -= v; to.money += v; } else { from.goods[g] -= v; to.goods[g] += v; } } };
    move(A, Bt, o.give);
    move(Bt, A, o.want);
    this.ev.push({ t: 'msg', p: o.from, text: `${Bt.name} ACCEPTE VOTRE OFFRE`, col: '#b8e070' });
    return { ok: true };
  }

  // ---------------------------------------------------------- décisions (événements, campagne)
  choose(p, town, id, opt) {
    const k = town.pending.findIndex((d) => d.id === id);
    if (k < 0) return { ok: false };
    const d = town.pending[k];
    town.pending.splice(k, 1);
    if (id === 'campagne') { town.speech = clamp(opt, 0, K.SPEECHES.length - 1); return { ok: true }; }
    this.resolveEvent(p, town, id, opt);
    return { ok: true, d };
  }

  // ---------------------------------------------------------- avancer d'un jour
  step() {
    if (this.result) return;
    this.day++;
    if (this.dirty) this.refresh();
    // chantiers
    for (const b of this.B) {
      if (b.site > 0 && --b.site === 0) {
        this.claimB(b);
        this.dirty = true;
        if (BD[b.t].reveal) this.revealOil(b);
        this.ev.push({ t: 'built', p: b.p, id: b.id });
      }
    }
    this.fires();
    if (this.day % 10 === 0) for (const t of this.towns) this.missions(t);
    if (this.day % TIME.month === 0) this.monthly();
  }

  revealOil(b) {
    const r = BD[b.t].reveal;
    for (let y = b.y - r; y <= b.y + r; y++) for (let x = b.x - r; x <= b.x + r; x++) {
      if (!this.inMap(x, y) || !this.near(b, x, y, r)) continue;
      this.reveal[this.idx(x, y)] |= 1 << b.p;
    }
  }

  // missions : une suite d'objectifs (villekit.js MISSIONS), chacun payé à sa réussite
  missions(town) {
    if (town.lost) return;
    const m = K.MISSIONS[town.mission || 0];
    if (!m || !this.missionMet(town, m)) return;
    town.money += m.reward;
    town.mission = (town.mission || 0) + 1;
    this.ev.push({ t: 'mission', p: town.p, text: m.text, reward: m.reward });
  }
  missionMet(town, m) {
    const p = town.p, st = town.stat;
    switch (m.test) {
      case 'has': return m.of.some((t) => this.has(p, t, true));
      case 'pop': return st.pop >= m.v;
      case 'hap': return st.hap >= m.v;
      case 'era': return town.era >= m.v;
      case 'exports': return town.exportsTotal >= m.v;
      case 'exportsYear': return town.exportsYear >= m.v;
      case 'elections': return (town.won || 0) >= m.v;
      case 'money': return town.money >= m.v;
      case 'upgrade': return this.B.some((b) => b.p === p && b.lvl > 1);
      case 'edict': return Object.keys(town.edicts).length > 0;
      default: return false;
    }
  }

  // incendies : un bâtiment brûle quelques jours, peut gagner ses voisins, puis s'éteint ou s'effondre
  fires() {
    let burning = false;
    for (const b of this.B) if (b.fire) { burning = true; break; }
    if (!burning) return;
    for (const b of [...this.B]) {
      if (!b.fire) continue;
      const prot = this.fireCover(b);
      b.fire--;
      if (rpct(this.rs, Math.max(0.5, 4 - prot / 4))) {
        // le feu gagne une maison voisine
        const [w, d] = this.dimsOf(b);
        const xx = b.x - 1 + rint(this.rs, w + 2), yy = b.y - 1 + rint(this.rs, d + 2);
        const v = this.bAt(xx, yy);
        if (v && !v.fire && v !== b) { v.fire = 15; this.ev.push({ t: 'fire', p: v.p, id: v.id }); }
      }
      if (prot && rpct(this.rs, prot)) b.fire = 0;
      if (b.fire === 0 && !prot && rpct(this.rs, 45)) {
        this.ev.push({ t: 'msg', p: b.p, text: `${BD[b.t].name} A BRÛLÉ`, col: '#f0705a' });
        if (b.t !== 'mairie') this.removeB(b);
      }
    }
  }
  fireCover(b) {
    let best = 0;
    for (const s of this.B) {
      const f = BD[s.t].fire;
      if (!f || s.site || s.p !== b.p || !s.on) continue;
      if (this.dist2(s.x, s.y, ...this.dimsOf(s), b.x, b.y, ...this.dimsOf(b)) <= 4 * f * f) best = Math.max(best, s.t === 'pompiers' ? 25 : 12);
    }
    return best;
  }

  // ---------------------------------------------------------- caches (recalculés après chaque changement)
  refresh() {
    this.dirty = false;
    const { n } = this, nn = n * n;
    // irrigation
    const wa = this.waterAdd;
    wa.fill(0);
    for (const b of this.B) {
      const wt0 = BD[b.t].water;
      if (!wt0 || b.site) continue;
      const wt = b.lvl > 1 ? { add: wt0.add + 15, r: wt0.r + 1 } : wt0;
      const [w, d] = this.dimsOf(b);
      const cx = b.x + (w >> 1), cy = b.y + (d >> 1);
      for (let y = cy - wt.r; y <= cy + wt.r; y++) for (let x = cx - wt.r; x <= cx + wt.r; x++) {
        if (!this.inMap(x, y)) continue;
        const dd = Math.max(Math.abs(x - cx), Math.abs(y - cy));
        if (dd > wt.r) continue;
        const i = this.idx(x, y);
        wa[i] = Math.min(60, wa[i] + Math.round((wt.add * (wt.r + 1 - dd)) / (wt.r + 1)));
      }
    }
    // routes reliées à chaque mairie (parcours en largeur sur les routes)
    const L = this.linked;
    L.fill(0);
    for (const b of this.B) {
      if (b.t !== 'mairie') continue;
      const q = [];
      this.edge(b, (i) => { if (this.road[i] && !L[i]) { L[i] = 1; q.push(i); } });
      for (let h = 0; h < q.length; h++) {
        const i = q[h], x = i % n, y = (i - x) / n;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const X = x + dx, Y = y + dy;
          if (X < 0 || Y < 0 || X >= n || Y >= n) continue;
          const j = Y * n + X;
          if (this.road[j] && !L[j]) { L[j] = 1; q.push(j); }
        }
      }
    }
    for (const b of this.B) {
      let ok = b.t === 'mairie';
      if (!ok) this.edge(b, (i) => { if (L[i]) ok = true; });
      b.link = ok ? 1 : 0;
    }
    // champs, pâtures et coupes : les meilleures cases libres autour de chaque exploitation (la plus ancienne d'abord)
    const fo = this.fieldOf;
    fo.fill(-1);
    for (const b of this.B) {
      const pr = BD[b.t].prod;
      if (!pr || b.site || !(K.CROPS[pr.res] || pr.res === 'paturage')) continue;
      const want = pr.r * 6;
      const cand = [];
      const [w, d] = this.dimsOf(b);
      for (let y = b.y - pr.r; y < b.y + d + pr.r; y++) for (let x = b.x - pr.r; x < b.x + w + pr.r; x++) {
        if (!this.inMap(x, y)) continue;
        const i = this.idx(x, y), t = this.map.ter[i];
        if (fo[i] >= 0 || this.tileB[i] >= 0 || this.road[i] || this.map.rail[i] || this.owner[i] !== b.p) continue;
        if (t !== TER.DESERT && t !== TER.PRAIRIE) continue;
        const v = pr.res === 'paturage' ? this.pasture(i) : K.fertility(pr.res, Math.min(100, this.map.water0[i] + wa[i]), this.map.heat[i], this.map.soil[i]);
        cand.push([v, i]);
      }
      cand.sort((a, c) => c[0] - a[0] || a[1] - c[1]);
      let sum = 0;
      for (let k = 0; k < Math.min(want, cand.length); k++) { fo[cand[k][1]] = b.id; sum += cand[k][0]; }
      b.soil = Math.round(sum / want); // rendement du sol (0-100), champs manquants comptés à zéro
    }
  }
  // cases bordant l'emprise de b (sans les coins)
  edge(b, fn) {
    const [w, d] = this.dimsOf(b);
    for (let x = b.x; x < b.x + w; x++) { if (this.inMap(x, b.y - 1)) fn(this.idx(x, b.y - 1)); if (this.inMap(x, b.y + d)) fn(this.idx(x, b.y + d)); }
    for (let y = b.y; y < b.y + d; y++) { if (this.inMap(b.x - 1, y)) fn(this.idx(b.x - 1, y)); if (this.inMap(b.x + w, y)) fn(this.idx(b.x + w, y)); }
  }

  // ---------------------------------------------------------- habitants
  newCitizen(p, age, home = -1) {
    const edu = age < 16 ? 0 : rpct(this.rs, 4) ? 2 : rpct(this.rs, 16) ? 1 : 0;
    const w = [20, 25, 15, 10, 20, edu ? 30 : 8];
    let tot = 0;
    for (const v of w) tot += v;
    let r = rint(this.rs, tot), fac = 0;
    while (r >= w[fac]) r -= w[fac++];
    const c = { id: this.nextC++, p, age, edu, fac, home, job: -1, hap: 50, sad: 0, need: new Array(NEEDS.length).fill(50) };
    this.C.push(c);
    return c;
  }
  pop(p) { let k = 0; for (const c of this.C) if (c.p === p) k++; return k; }

  // ---------------------------------------------------------- le mois
  monthly() {
    if (this.dirty) this.refresh();
    const m = Math.floor(this.day / TIME.month);
    const { year } = K.dateOf(this.day);
    // le marché : chaque cours dérive un peu et revient vers 100 %
    for (const g of GOOD_IDS) {
      let v = this.price[g];
      v += rint(this.rs, 9) - 4 + Math.sign(100 - v) * 2;
      this.price[g] = clamp(v, 40, 160);
    }
    if (this.mods.krach && this.day >= this.mods.krach) delete this.mods.krach;
    // les forêts repoussent (lentement)
    if (m % 3 === 0) for (let i = 0; i < this.wood.length; i++) if (this.wood[i] < this.map.wood0[i] && this.map.ter[i] === TER.FOREST && this.tileB[i] < 0) this.wood[i]++;
    for (const town of this.towns) if (!town.lost || town.ghost) this.monthTown(town, m, year);
    // contrats des compagnies
    this.contracts = this.contracts.filter((c) => c.until > this.day);
    if (this.day >= this.next.contract) {
      this.next.contract = this.day + rrange(this.rs, 6, 10) * 30;
      const pool = ['bois', 'boeuf', 'mais', 'ble', 'coton', 'tabac', 'whisky', 'or', 'argent', 'cuivre', 'charbon', 'planches', 'cuir', 'conserves'];
      const g = pool[rint(this.rs, pool.length)];
      const qty = rrange(this.rs, 4, 15) * 10;
      this.contracts.push({ id: this.nextId++, g, qty, pay: Math.round(qty * GOODS[g].price * 1.6), until: this.day + 12 * 30, takers: [] });
      this.ev.push({ t: 'contract', p: -1 });
    }
    this.offers = this.offers.filter((o) => o.until > this.day);
    // événements qui touchent toute la carte
    if (this.day >= this.next.global) {
      this.next.global = this.day + rrange(this.rs, 18, 36) * 30;
      const g = ['secheresse', 'sauterelles', 'krach', 'inondation'][rint(this.rs, 4)];
      for (const town of this.towns) if (!town.lost) this.raise(town, g);
    }
    this.checkEnd(year);
  }

  // un mois dans une ville
  monthTown(town, m, year) {
    const p = town.p;
    const st = town.stat;
    st.inc = {}; st.out = {}; st.made = {}; st.used = {};
    const earn = (k, v) => { v = Math.round(v); if (!v) return; town.money += v; st.inc[k] = (st.inc[k] || 0) + v; };
    const spend = (k, v) => { v = Math.round(v); if (!v) return; town.money -= v; st.out[k] = (st.out[k] || 0) + v; };
    // décisions en retard : le choix par défaut
    for (const d of [...town.pending]) if (d.until && this.day >= d.until) this.choose(p, town, d.id, d.opt || 0);
    for (const k in town.mods) if (typeof town.mods[k] === 'number' && town.mods[k] && this.day >= town.mods[k]) delete town.mods[k];

    this.monthHousing(town);
    this.monthJobs(town);
    const blds = this.townB(p, (b) => !b.site);
    // ---- production
    const prodMul = 100 - (town.edicts.journee != null ? 10 : 0) - (town.mods.quarantaine ? 30 : 0);
    const store = this.storeCap(p);
    let stock = 0;
    for (const g of GOOD_IDS) stock += town.goods[g];
    const add = (g, v) => {
      v = Math.max(0, Math.min(v, store - stock));
      town.goods[g] += v; stock += v; st.made[g] = (st.made[g] || 0) + v;
      return v;
    };
    const take = (g, v) => { v = Math.min(v, town.goods[g]); town.goods[g] -= v; stock -= v; st.used[g] = (st.used[g] || 0) + v; return v; };
    for (const b of blds) {
      const def = BD[b.t];
      b.note = '';
      if (!def.prod && !def.conv) { b.eff = this.staff(b); continue; }
      let eff = (this.staff(b) * prodMul) / 100;
      if (!b.link) { eff = Math.round(eff * 0.6); b.note = 'non_relie'; }
      if (!b.on) eff = 0;
      if (def.prod) {
        const pr = def.prod;
        let res = 100;
        if (K.CROPS[pr.res] || pr.res === 'paturage') {
          res = b.soil || 0;
          if (K.CROPS[pr.res] && town.mods.secheresse) res = Math.round(res * (town.mods.puits ? 0.75 : 0.5));
          if (K.CROPS[pr.res] && town.mods.sauterelles) res = Math.round(res * 0.4);
        }
        if (pr.res === 'dep') {
          if (town.mods.greve && b.t.startsWith('mine')) eff = 0;
          if (town.edicts.minieres != null) eff = Math.round(eff * 1.25);
        }
        let out = Math.round((pr.rate * this.mulOf(b) * eff * res) / 10000);
        if (pr.res === 'bois') out = this.cutWood(b, out);
        else if (pr.res === 'dep') { out = this.mine(b, out); if (!out && eff) b.note = 'epuise'; }
        if (out) out = add(pr.good, out);
        b.eff = Math.round((eff * res) / 100);
      } else {
        const cv = def.conv;
        const mul = this.mulOf(b);
        let k = (eff / 100) * mul;
        for (const g in cv.in) if (cv.in[g]) k = Math.min(k, town.goods[g] / cv.in[g]);
        if (k < eff / 100 && b.on) b.note = 'sans_matiere';
        for (const g in cv.in) take(g, Math.round(cv.in[g] * k));
        for (const g in cv.out) add(g, Math.round(cv.out[g] * k));
        b.eff = Math.round((k * 100) / mul);
      }
      if (st.made && stock >= store) b.note = b.note || 'plein';
    }
    // ---- services : qualité selon le personnel (et les biens consommés)
    for (const b of blds) {
      const def = BD[b.t];
      if (!def.svc) continue;
      let q = (this.svcOf(b).q * this.staff(b)) / 100;
      if (!b.link) q *= 0.6;
      if (!b.on) q = 0;
      if (def.uses) {
        let got = 0, want = 0;
        for (const g in def.uses) {
          want += def.uses[g];
          if ((g === 'whisky' || g === 'biere') && town.edicts.prohibition != null) continue;
          got += take(g, def.uses[g]);
        }
        q *= 0.7 + (0.5 * got) / want;
      }
      b.q = Math.round(q);
      b.served = 0;
    }
    // ---- nourriture
    const people = this.C.filter((c) => c.p === p);
    const popN = people.length;
    let need = popN, eaten = 0, kinds = 0;
    for (const g of FOOD_IDS) {
      if (!town.goods[g]) continue;
      kinds++;
    }
    // chacun mange une part par mois, prise sur les vivres dans l'ordre (le plus abondant d'abord)
    const foods = FOOD_IDS.filter((g) => town.goods[g] > 0).sort((a, b) => town.goods[b] - town.goods[a] || (a < b ? -1 : 1));
    for (const g of foods) {
      const v = Math.min(need, town.goods[g], Math.ceil(popN / Math.max(1, foods.length)) + (g === foods[0] ? popN : 0));
      take(g, v);
      need -= v; eaten += v;
      if (!need) break;
    }
    st.fed = popN ? eaten / popN : 1;
    st.eaten = eaten;
    // ---- besoins, en couverture par bâtiment de service
    this.coverage(town, people);
    const crime = this.crimeOf(town, people);
    st.crime = crime;
    let liberty = 70;
    if (town.edicts.couvrefeu != null) liberty -= 15;
    if (town.edicts.armes != null) liberty -= 10;
    if (town.edicts.prohibition != null) liberty -= 10;
    if (town.tax === 2) liberty -= 8;
    if (town.tax === 0) liberty += 5;
    liberty += Math.min(10, this.count(p, 'statue') * 2);
    let hapSum = 0, jobless = 0, homeless = 0, adults = 0;
    const fete = town.mods.fete ? 10 : 0;
    // ce qu'on attend d'un service absent : les pionniers s'en passent, les citadins de l'ère industrielle non
    const expect = [0, 38, 30, 24, 20][town.era];
    for (const c of people) {
      const nd = c.need;
      const home = c.home >= 0 ? this.byId.get(c.home) : null;
      const hq = home ? this.hq(home) : 0;
      nd[N.logement] = home ? clamp(hq + (home.val || 0) / 5, 0, 100) : 0;
      if (!home) homeless++;
      const fed = st.fed >= 1 ? 1 : st.fed;
      nd[N.nourriture] = Math.round(fed < 1 ? fed * 40 : c._cov[N.nourriture] ? 40 + c._cov[N.nourriture] * 0.5 + Math.min(3, kinds) * 5 : 25);
      if (c.age >= 16 && c.age < 65) {
        adults++;
        if (c.job >= 0) {
          const jb = this.byId.get(c.job);
          nd[N.travail] = clamp(55 + (jb ? BD[jb.t].wage * 3 + town.wageUp * 4 : 0) + (town.edicts.journee != null ? 15 : 0), 0, 100);
        } else { nd[N.travail] = 20; jobless++; }
      } else nd[N.travail] = 70;
      for (const k of [N.foi, N.sante, N.loisirs]) nd[k] = Math.round(c._cov[k] ? 25 + c._cov[k] * 0.75 : expect);
      nd[N.loi] = clamp(Math.round(c._cov[N.loi] ? 30 + c._cov[N.loi] * 0.7 : expect + 10) - (crime >> 1), 0, 100);
      if (town.edicts.couvrefeu != null) nd[N.loisirs] = Math.max(0, nd[N.loisirs] - 10);
      nd[N.liberte] = clamp(liberty, 0, 100);
      let s = 0;
      for (let k = 0; k < NEEDS.length; k++) s += nd[k] * NEEDS[k].w;
      c.hap = clamp(Math.round(s / NEED_W) + fete, 0, 100);
      c.sad = c.hap < 25 ? c.sad + 1 : 0;
      hapSum += c.hap;
    }
    st.pop = popN;
    st.hap = popN ? Math.round(hapSum / popN) : 0;
    st.jobless = jobless;
    st.adults = adults;
    st.homeless = homeless;
    // ---- argent
    const taxMul = [0.5, 1, 1.5][town.tax];
    for (const b of blds) {
      const def = BD[b.t];
      if (def.house) earn('loyers', b.occ * def.house.rent * taxMul);
      if (def.svc?.fee) earn('services', (b.served || 0) * def.svc.fee * taxMul);
      if (def.house && b.lvl > 1) earn('loyers', b.occ * taxMul); // un logement amélioré se loue plus cher
      spend('salaires', b.w * (def.wage + town.wageUp) + b.ex * def.wage * 3);
      if (def.upkeep) spend('entretien', def.upkeep);
    }
    for (const id in town.edicts) if (EDICTS[id].upkeep) spend('edits', EDICTS[id].upkeep);
    if (town.loan > 0) { spend('emprunt', 120); town.loan--; }
    if (this.has(p, 'banque', true) && town.money > 0) earn('banque', Math.min(250, town.money * 0.01));
    this.tourism(town, earn);
    this.trade(town, earn, spend, take);
    // ---- école
    for (const b of blds) {
      const sc = BD[b.t].school;
      if (!sc || !b.on) continue;
      let n = Math.round((sc.rate * this.staff(b)) / 100 * (town.edicts.instruction != null ? 1.5 : 1));
      for (const c of people) {
        if (n <= 0) break;
        if (c.edu < sc.level && c.edu >= sc.level - 1 && c.age >= 10 && c.age < 35) { c.edu = sc.level; n--; }
      }
    }
    // ---- vieillir, naître, mourir, partir
    this.lifecycle(town, people, m);
    // ---- factions, exigences, élections, ères
    this.factions(town, people);
    this.demands(town);
    this.election(town, year);
    this.eras(town, year);
    // ---- événements de la ville
    if (this.day >= town.nextEvent && !town.pending.some((d) => d.id !== 'campagne') && rpct(this.rs, 9)) {
      const pool = ['bandits', 'gang', 'filon', 'epidemie', 'incendie', 'greve', 'gouverneur', 'predicateur', 'vol_betail', 'ruee', 'rachat'];
      const ok = pool.filter((id) => this.eventOk(town, id));
      if (ok.length) this.raise(town, ok[rint(this.rs, ok.length)]);
    }
    // ---- faillite
    town.broke = town.money < -500 ? town.broke + 1 : 0;
    if (town.broke) this.ev.push({ t: 'msg', p: town.p, text: `CAISSE VIDE : FAILLITE DANS ${6 - town.broke} MOIS SI RIEN NE CHANGE`, col: '#f0705a' });
    town.hist.push([popN, Math.round(town.money), st.hap]);
    if (town.hist.length > 360) town.hist.shift();
    if (m % 12 === 11) town.exportsYear = 0;
  }

  // ---- niveau 2 (amélioré) : plus de place, plus de qualité, plus de rendement
  hcap(b) { const h = BD[b.t].house; return h ? h.cap + (b.lvl > 1 ? Math.ceil(h.cap / 2) : 0) : 0; }
  hq(b) { const h = BD[b.t].house; return h ? Math.min(100, h.q + (b.lvl > 1 ? 12 : 0)) : 0; }
  svcOf(b) { const s = BD[b.t].svc; return s && b.lvl > 1 ? K.svcUp(s) : s; }
  mulOf(b) { return b.lvl > 1 ? K.UPGRADE.rate : 1; }
  // part de l'effectif présent (0-100)
  staff(b) { const def = BD[b.t]; return def.jobs ? Math.round(((b.w + b.ex) * 100) / def.jobs) : 100; }
  storeCap(p) { let s = 0; for (const b of this.B) if (b.p === p && !b.site && BD[b.t].store) s += Math.round(BD[b.t].store * (b.lvl > 1 ? 1.5 : 1)); return s; }

  cutWood(b, want) {
    const r = BD[b.t].prod.r;
    let got = 0;
    for (let y = b.y - r; y <= b.y + r && got < want; y++) for (let x = b.x - r; x <= b.x + r && got < want; x++) {
      if (!this.inMap(x, y) || !this.near(b, x, y, r)) continue;
      const i = this.idx(x, y);
      if (this.wood[i] < 2 || this.owner[i] !== b.p) continue;
      const v = Math.min(4, this.wood[i] - 1, want - got);
      this.wood[i] -= v;
      got += v;
    }
    return got;
  }
  mine(b, want) {
    const def = BD[b.t], r = def.prod.r, d = DEP[def.on.slice(4).toUpperCase()];
    const [w, dd] = this.dimsOf(b);
    let got = 0;
    for (let y = b.y - r; y < b.y + dd + r && got < want; y++) for (let x = b.x - r; x < b.x + w + r && got < want; x++) {
      if (!this.inMap(x, y)) continue;
      const i = this.idx(x, y);
      if (this.dep[i] !== d || !this.depQ[i]) continue;
      if (this.owner[i] !== b.p && this.owner[i] >= 0) continue;
      const v = Math.min(this.depQ[i], want - got);
      this.depQ[i] -= v;
      if (!this.depQ[i]) this.dep[i] = 0;
      got += v;
    }
    return got;
  }

  // logement : chacun garde sa maison ; les sans-abri prennent la meilleure place libre ; quelques-uns déménagent
  monthHousing(town) {
    const p = town.p;
    const homes = this.townB(p, (b) => !b.site && BD[b.t].house).sort((a, b) => this.hq(b) - this.hq(a) || a.id - b.id);
    const occ = new Map(homes.map((h) => [h.id, 0]));
    const people = this.C.filter((c) => c.p === p);
    for (const c of people) {
      if (c.home >= 0 && occ.has(c.home) && occ.get(c.home) < this.hcap(this.byId.get(c.home))) occ.set(c.home, occ.get(c.home) + 1);
      else c.home = -1;
    }
    let moves = Math.max(2, people.length >> 4);
    for (const c of people) {
      const cur = c.home >= 0 ? this.hq(this.byId.get(c.home)) : -1;
      if (c.home >= 0 && moves <= 0) continue;
      for (const h of homes) {
        if (this.hq(h) <= cur) break;
        if (occ.get(h.id) < this.hcap(h)) {
          if (c.home >= 0) { occ.set(c.home, occ.get(c.home) - 1); moves--; }
          c.home = h.id;
          occ.set(h.id, occ.get(h.id) + 1);
          break;
        }
      }
    }
    for (const h of homes) { h.occ = occ.get(h.id); h.val = this.landValue(h.x, h.y); }
  }

  // emplois : on garde son poste ; les postes libres vont aux chômeurs (les plus instruits aux postes qualifiés) ;
  // un poste qualifié vacant est tenu par un « expert » venu de l'Est, payé trois fois plus (la moitié au plus)
  monthJobs(town) {
    const p = town.p;
    const work = this.townB(p, (b) => !b.site && BD[b.t].jobs).sort((a, b) => a.id - b.id);
    const slots = new Map(work.map((b) => [b.id, 0]));
    const people = [];
    for (const c of this.C) {
      if (c.p !== p) continue;
      if (c.age >= 16 && c.age < 65) people.push(c); else c.job = -1; // les enfants et les vieux ne travaillent pas
    }
    for (const c of people) {
      const b = c.job >= 0 ? this.byId.get(c.job) : null;
      if (b && slots.has(b.id) && b.on && slots.get(b.id) < BD[b.t].jobs && c.edu >= BD[b.t].edu) slots.set(b.id, slots.get(b.id) + 1);
      else c.job = -1;
    }
    const free = people.filter((c) => c.job < 0).sort((a, b) => b.edu - a.edu || a.id - b.id);
    // les postes qualifiés d'abord
    const order = [...work].filter((b) => b.on).sort((a, b) => BD[b.t].edu - BD[a.t].edu || a.id - b.id);
    for (const b of order) {
      const def = BD[b.t];
      for (let k = 0; k < free.length && slots.get(b.id) < def.jobs; k++) {
        const c = free[k];
        if (c.job >= 0 || c.edu < def.edu) continue;
        c.job = b.id;
        slots.set(b.id, slots.get(b.id) + 1);
      }
    }
    for (const b of work) {
      const def = BD[b.t];
      b.w = slots.get(b.id);
      b.ex = def.edu && b.on && town.money > 0 ? Math.max(0, Math.min(def.jobs - b.w, Math.ceil(def.jobs / 2) - b.w)) : 0;
    }
  }

  // couverture des besoins : chaque logement est servi par le meilleur bâtiment à portée qui a encore de la place
  coverage(town, people) {
    const p = town.p;
    const tram = this.has(p, 'tramway', true) ? 2 : 0;
    const svcs = this.townB(p, (b) => !b.site && BD[b.t].svc && b.q > 0);
    const homes = this.townB(p, (b) => !b.site && BD[b.t].house && b.occ);
    const left = new Map(svcs.map((s) => [s.id, this.svcOf(s).cap]));
    const cov = new Map(); // home id -> [qualité servie par besoin, nombre servi]
    for (const h of homes) cov.set(h.id, NEEDS.map(() => [0, 0]));
    for (const h of homes) {
      const [hw, hd] = this.dimsOf(h);
      for (let k = 0; k < NEEDS.length; k++) {
        const need = NEEDS[k].id;
        let best = null, bq = -1;
        for (const s of svcs) {
          const sd = this.svcOf(s);
          if (sd.need !== need || left.get(s.id) <= 0) continue;
          const r = sd.r + tram;
          if (this.dist2(s.x, s.y, ...this.dimsOf(s), h.x, h.y, hw, hd) > 4 * r * r) continue;
          if (s.q > bq) { bq = s.q; best = s; }
        }
        if (!best) continue;
        const n = Math.min(h.occ, left.get(best.id));
        left.set(best.id, left.get(best.id) - n);
        best.served = (best.served || 0) + n;
        cov.get(h.id)[k] = [bq, n];
      }
    }
    // chaque habitant d'un logement : servi s'il fait partie des n premiers
    const seen = new Map();
    for (const c of people) {
      c._cov = c._cov || new Array(NEEDS.length).fill(0);
      c._cov.fill(0);
      if (c.home < 0 || !cov.has(c.home)) continue;
      const rank = seen.get(c.home) || 0;
      seen.set(c.home, rank + 1);
      const cv = cov.get(c.home);
      for (let k = 0; k < NEEDS.length; k++) if (rank < cv[k][1]) c._cov[k] = cv[k][0];
    }
  }

  crimeOf(town, people) {
    const st = town.stat;
    const adults = Math.max(1, st.adults || people.length);
    let c = 8 + Math.round((st.jobless * 40) / adults) + Math.round((100 - st.hap) * 0.25);
    if (town.mods.gang) c += 25;
    if (town.edicts.prohibition != null) c += 10;
    c += Math.min(20, this.count(town.p, 'jeu') * 6);
    if (town.edicts.armes != null) c = Math.round(c * 0.7);
    if (town.edicts.couvrefeu != null) c = Math.round(c * 0.8);
    return clamp(c, 0, 100);
  }

  // valeur foncière d'une case : embellissements à proximité, eau, industries et mines bruyantes
  landValue(x, y) {
    let v = 25;
    for (const b of this.B) {
      if (b.site) continue;
      const def = BD[b.t];
      const [w, d] = this.dimsOf(b);
      const dd = this.dist2(b.x, b.y, w, d, x, y, 1, 1);
      if (def.beauty && dd <= 100) v += def.beauty * (dd <= 16 ? 6 : dd <= 49 ? 4 : 2);
      if ((def.conv || def.prod?.res === 'dep') && dd <= 36) v -= 8;
    }
    if (this.map.dist[this.idx(x, y)] <= 2) v += 8;
    return clamp(v, 0, 100);
  }

  // tourisme : les hôtels se remplissent selon les attractions (gare et ère 3 nécessaires)
  tourism(town, earn) {
    if (town.era < 3 || !this.has(town.p, 'gare', true)) return;
    let beds = 0, q = 0, attr = 0;
    for (const b of this.townB(town.p, (b) => !b.site && b.on)) {
      const def = BD[b.t];
      if (def.hotel) { const cap = Math.round(def.hotel.cap * (b.lvl > 1 ? 1.5 : 1)); beds += Math.round((cap * this.staff(b)) / 100); q += def.hotel.q * cap; }
      if (def.attraction) attr += Math.round((def.attraction * this.staff(b)) / 100);
      if (def.beauty) attr += def.beauty;
    }
    if (!beds) return;
    const tourists = Math.min(beds * 3, Math.round(attr * 1.5));
    town.stat.tourists = tourists;
    earn('tourisme', tourists * (4 + Math.round(q / Math.max(1, beds * 100) * 4)));
  }

  // ---------------------------------------------------------- commerce
  // Diligence (tous les 6 mois, 3 avec un dépôt), train (tous les 3 mois, 2 avec la concession) et bateau (4 mois) :
  // ils achètent le surplus (ce qui dépasse la réserve de vivres et les matières des ateliers) et amènent des immigrants.
  trade(town, earn, spend, take) {
    const p = town.p, nx = town.next;
    const arrivals = [];
    if (this.day >= nx.coach) {
      const depot = this.has(p, 'diligence', true);
      nx.coach = this.day + (depot ? 2 : 3) * 30;
      arrivals.push({ kind: 'coach', cap: depot ? 900 : 400, rate: depot ? 0.85 : 0.75, imm: depot ? 5 : 3 });
    }
    if (town.era >= 2 && this.has(p, 'gare', true)) {
      if (!nx.train) nx.train = this.day + 30;
      if (this.day >= nx.train) {
        nx.train = this.day + (town.edicts.concession != null ? 2 : 3) * 30;
        arrivals.push({ kind: 'train', cap: 100000, rate: 1, imm: 9, imports: true });
      }
    }
    if (this.has(p, 'quai', true)) {
      if (!nx.boat) nx.boat = this.day + 60;
      if (this.day >= nx.boat) { nx.boat = this.day + 4 * 30; arrivals.push({ kind: 'boat', cap: 400, rate: 0.9, imm: 5 }); }
    }
    // marcheurs : un ou deux colons à pied chaque mois
    this.immigrate(town, rint(this.rs, 3), 'foot');
    for (const a of arrivals) {
      const pop = Math.max(1, town.stat.pop);
      // réserve : 3 mois de vivres, et 2 mois de matières premières pour les ateliers
      const keep = Object.fromEntries(GOOD_IDS.map((g) => [g, 0]));
      for (const g of FOOD_IDS) keep[g] = Math.ceil((pop * 3) / Math.max(1, FOOD_IDS.length));
      for (const b of this.townB(p, (b) => !b.site)) {
        const def = BD[b.t];
        if (def.conv) for (const g in def.conv.in) keep[g] += def.conv.in[g] * 2;
        if (def.uses) for (const g in def.uses) keep[g] += def.uses[g] * 2;
      }
      let cap = a.cap, sold = 0;
      for (const g of GOOD_IDS) {
        if (!town.sell[g] || cap <= 0) continue;
        const q = Math.min(cap, town.goods[g] - keep[g]);
        if (q <= 0) continue;
        // un contrat accepté passe avant le marché
        let pay = 0, left = q;
        for (const ct of this.contracts) {
          if (ct.g !== g || !ct.takers.includes(p) || left < ct.qty) continue;
          left -= ct.qty;
          pay += ct.pay;
          this.contracts.splice(this.contracts.indexOf(ct), 1);
          this.ev.push({ t: 'msg', p, text: `CONTRAT REMPLI : ${ct.qty} ${GOODS[g].name} POUR ${ct.pay} $`, col: '#f8d070' });
          for (const o of this.towns) if (o.p !== p && ct.takers.includes(o.p)) this.ev.push({ t: 'msg', p: o.p, text: `${town.name} A RAFLÉ LE CONTRAT DE ${GOODS[g].name}`, col: '#f0705a' });
          break;
        }
        const krach = this.mods.krach ? 0.7 : 1;
        pay += left * GOODS[g].price * (this.price[g] / 100) * a.rate * krach;
        if ((g === 'boeuf' || g === 'chevaux') && town.edicts.betail != null) pay += q * 2;
        take(g, q);
        sold += pay;
        cap -= q;
        // saturation : vendre beaucoup fait baisser le cours (pour tout le monde)
        this.price[g] = Math.max(40, this.price[g] - Math.round((q * GOODS[g].price) / 120));
      }
      if (sold) { earn('exportations', sold); town.exportsYear += Math.round(sold); town.exportsTotal += Math.round(sold); }
      // le train rapporte des vivres quand il en manque (cher)
      let bought = 0;
      if (a.imports && town.stat.fed < 1) {
        const want = Math.max(0, pop * 2 - FOOD_IDS.reduce((s, g) => s + town.goods[g], 0));
        const cost = Math.round(want * GOODS.mais.price * 1.5);
        if (want > 0 && town.money > cost) { spend('importations', cost); town.goods.mais += want; bought = want; }
      }
      const imm = this.immigrate(town, a.imm, a.kind);
      this.ev.push({ t: 'arrive', p, kind: a.kind, sold: Math.round(sold), imm, bought });
    }
  }

  // attrait d'une ville (bonheur, logements et emplois libres) : règle le nombre d'immigrants, et où ils vont
  attract(town) {
    const st = town.stat;
    let free = 0;
    for (const b of this.townB(town.p, (b) => !b.site && BD[b.t].house)) free += this.hcap(b) - (b.occ || 0);
    let jobs = 0;
    // (les postes qualifiés ne comptent pas : les arrivants n'ont presque jamais d'instruction)
    for (const b of this.townB(town.p, (b) => !b.site && BD[b.t].jobs && !BD[b.t].edu && b.on)) jobs += BD[b.t].jobs - b.w;
    return { score: st.hap + Math.min(20, free * 2) + Math.min(20, jobs * 2), free, jobs };
  }
  immigrate(town, base, kind) {
    if (town.lost || town.mods.fermee) return 0;
    const a = this.attract(town);
    if (a.score < 40 && kind === 'foot') return 0;
    let n = Math.round((base * a.score) / 60);
    if (town.edicts.ruee != null) n = Math.round(n * 1.5);
    // on vient pour travailler : pas plus d'arrivants que de logements et de postes libres (à deux ou trois près)
    n = Math.min(n, a.free + (kind === 'foot' ? 0 : 2), a.jobs + (kind === 'foot' ? 1 : 0));
    for (let k = 0; k < n; k++) this.newCitizen(town.p, rrange(this.rs, 17, 42));
    return Math.max(0, n);
  }

  lifecycle(town, people, m) {
    const p = town.p;
    if (m % 12 === 0) for (const c of people) c.age++;
    const health = people.length ? people.reduce((s, c) => s + c.need[N.sante], 0) / people.length : 50;
    const dead = new Set();
    for (const c of people) {
      // naissances : dans un logement qui a de la place
      if (c.age >= 18 && c.age <= 40 && c.home >= 0) {
        const h = this.byId.get(c.home);
        if (h && h.occ < this.hcap(h) && rpct(this.rs, 0.35)) { this.newCitizen(p, 0, h.id); h.occ++; }
      }
      let die = c.age >= 55 ? (c.age - 50) * 0.08 : 0.02;
      if (health < 35) die *= 2;
      if (town.mods.epidemie) die += health < 50 ? 1.5 : 0.4;
      if (rpct(this.rs, die)) dead.add(c.id);
    }
    // les malheureux s'en vont : chez un voisin plus attirant (en multijoueur), sinon ils quittent la région
    const others = this.towns.filter((t) => t !== town && !t.lost);
    for (const c of people) {
      if (dead.has(c.id) || c.sad < 6) continue;
      let dest = null, best = this.attract(town).score + 10;
      for (const o of others) { const a = this.attract(o); if (a.free > 0 && a.score > best) { best = a.score; dest = o; } }
      if (dest) {
        c.p = dest.p; c.home = -1; c.job = -1; c.sad = 0;
        this.ev.push({ t: 'migrate', p, to: dest.p });
      } else dead.add(c.id);
    }
    if (dead.size) this.C = this.C.filter((c) => !dead.has(c.id));
  }

  // ---------------------------------------------------------- politique
  factions(town, people) {
    const p = town.p, st = town.stat;
    const sum = new Array(NF).fill(0), cnt = new Array(NF).fill(0);
    for (const c of people) { sum[c.fac] += c.hap; cnt[c.fac]++; }
    const fromB = new Array(NF).fill(0);
    for (const b of this.townB(p, (b) => !b.site)) {
      const fac = BD[b.t].fac;
      if (fac) for (const k in fac) fromB[F[k]] += fac[k];
    }
    for (let f = 0; f < NF; f++) {
      let ap = 50 + Math.round(((cnt[f] ? sum[f] / cnt[f] : st.hap) - 50) * 0.6) + clamp(fromB[f], -25, 25);
      for (const id in town.edicts) { const fac = EDICTS[id].fac; if (fac && fac[FACTIONS[f].id]) ap += fac[FACTIONS[f].id]; }
      if (town.tax === 2) ap -= 6;
      if (town.tax === 0) ap += FACTIONS[f].id === 'francs' ? 6 : FACTIONS[f].id === 'rail' ? -4 : 2;
      if (town.press === f) ap += 8;
      ap += town.bonus[f];
      switch (FACTIONS[f].id) {
        case 'rail': ap += Math.min(15, Math.round(town.exportsYear / 600)); break;
        case 'mineurs': ap += st.adults && st.jobless * 20 < st.adults ? 5 : -5; break;
        case 'pieux': ap -= Math.max(0, this.count(p, 'saloon') - Math.floor(st.pop / 30)) * 4; break;
        case 'francs': ap += Math.round((people.length ? people.reduce((s, c) => s + c.need[N.liberte], 0) / people.length : 60) - 60) >> 1; break;
        case 'notables': ap += Math.round(((people.length ? people.reduce((s, c) => s + c.need[N.loi], 0) / people.length : 40) - 40) / 3); break;
        case 'eleveurs': ap += Math.min(8, this.count(p, 'ranch') * 2); break;
      }
      town.ap[f] = clamp(ap, 0, 100);
      // les rancœurs et les faveurs s'estompent
      town.bonus[f] += town.bonus[f] > 0 ? -1 : town.bonus[f] < 0 ? 1 : 0;
    }
  }

  demands(town) {
    const p = town.p;
    for (const d of [...town.demands]) {
      const ok = this.demandMet(town, d);
      if (ok || this.day >= d.until) {
        town.demands.splice(town.demands.indexOf(d), 1);
        const f = F[d.fac];
        if (ok) { town.bonus[f] += 14; town.money += 200; this.ev.push({ t: 'demand', p, ok: true, fac: d.fac, text: d.text }); }
        else { town.bonus[f] -= 12; this.ev.push({ t: 'demand', p, ok: false, fac: d.fac, text: d.text }); }
      }
    }
    if (this.day >= town.nextDemand) {
      town.nextDemand = this.day + DEMAND_EVERY * 30;
      const facs = FACTIONS.map((f) => f.id).filter((f) => !town.demands.some((d) => d.fac === f));
      if (facs.length) {
        const fac = facs[rint(this.rs, facs.length)];
        const list = K.DEMANDS[fac], dm = list[rint(this.rs, list.length)];
        const d = { fac, id: dm.id, text: dm.text, until: this.day + dm.months * 30, base: this.demandBase(town, dm.id) };
        town.demands.push(d);
        this.ev.push({ t: 'demandNew', p, fac, text: dm.text });
      }
    }
  }
  demandBase(town, id) {
    if (id === 'ranchs') return this.count(town.p, 'ranch', false);
    if (id === 'eglise') return this.count(town.p, 'eglise', false) + this.count(town.p, 'mission', false);
    if (id === 'export') return town.exportsTotal;
    return 0;
  }
  demandMet(town, d) {
    const p = town.p, st = town.stat;
    switch (d.id) {
      case 'ranchs': return this.count(p, 'ranch') >= d.base + 2;
      case 'pas_taxe': return town.edicts.betail == null && this.day >= d.until - 30;
      case 'docteur': return this.has(p, 'docteur', true) || this.has(p, 'hopital', true);
      case 'chomage': return st.adults > 0 && st.jobless * 20 < st.adults;
      case 'eglise': return this.count(p, 'eglise') + this.count(p, 'mission') > d.base;
      case 'saloons': return this.count(p, 'saloon') * 30 <= Math.max(30, st.pop) && this.day >= d.until - 30;
      case 'export': return town.exportsTotal - d.base >= 3000;
      case 'gare': return this.has(p, 'gare', true);
      case 'pas_armes': return town.edicts.armes == null && this.day >= d.until - 30;
      case 'impots_bas': return town.tax <= 1 && this.day >= d.until - 30;
      case 'ecole': return this.has(p, 'ecole', true);
      case 'loi': {
        const ppl = this.C.filter((c) => c.p === p);
        return ppl.length > 0 && ppl.reduce((s, c) => s + c.need[N.loi], 0) / ppl.length > 50;
      }
      default: return false;
    }
  }

  // élections : tous les 4 ans ; on choisit son discours 6 mois avant ; chaque habitant vote selon son bonheur
  // et l'humeur de sa faction ; sous 50 %, le maire est battu
  election(town, year) {
    const p = town.p, nx = town.next;
    if (town.lost) return;
    if (this.day === nx.election - TIME.electionWarn * 30 && !town.pending.some((d) => d.id === 'campagne')) {
      town.pending.push({ id: 'campagne', opt: 0, until: nx.election - 30 });
      this.ev.push({ t: 'campaign', p });
    }
    if (this.day < nx.election) return;
    nx.election = this.day + TIME.electionEvery * 30;
    const share = this.voteShare(town);
    town.fraud = 0;
    town.speech = -1;
    const won = share >= 50;
    if (won) town.won = (town.won || 0) + 1;
    this.ev.push({ t: 'election', p, share, won, year });
    if (!won) this.lose(town, 'election');
  }
  voteShare(town) {
    const voters = this.C.filter((c) => c.p === town.p && c.age >= 18);
    if (!voters.length) return 50;
    const sp = town.speech >= 0 ? K.SPEECHES[town.speech] : null;
    // chacun vote pour le maire selon son soutien (bonheur et humeur de sa faction) : à 45, une chance sur deux
    let s = 0;
    for (const c of voters) {
      let v = (c.hap + town.ap[c.fac]) / 2;
      if (sp && FACTIONS[c.fac].id === sp.fac) v += 10;
      if (sp && FACTIONS[c.fac].id === sp.rival) v -= 5;
      s += clamp(50 + (v - 45) * 2.5, 5, 95);
    }
    return clamp(Math.round(s / voters.length) + town.fraud, 0, 100);
  }

  eras(town, year) {
    const nx = ERAS[town.era + 1];
    if (!nx) return;
    const pop = town.stat.pop;
    let ok = false;
    if (town.era === 1) ok = pop >= nx.pop || year >= nx.year;
    else if (town.era === 2) ok = pop >= nx.pop && this.has(town.p, 'banque', true);
    else if (town.era === 3) ok = year >= nx.year && pop >= nx.pop;
    if (ok) { town.era++; this.ev.push({ t: 'era', p: town.p, era: town.era }); }
  }

  lose(town, why) {
    if (town.lost) return;
    town.lost = why;
    // à plusieurs, la ville continue sans son maire : un bot la gère (ville fantôme)
    if (this.players.length > 1) town.ghost = true;
    this.ev.push({ t: 'lost', p: town.p, why });
  }

  // ---------------------------------------------------------- événements
  eventOk(town, id) {
    const p = town.p;
    switch (id) {
      case 'gang': return !town.mods.gang && town.stat.pop > 30;
      case 'greve': return this.townB(p, (b) => b.t.startsWith('mine') && !b.site).length > 0 && !town.mods.greve;
      case 'vol_betail': return this.has(p, 'ranch', true);
      case 'rachat': return this.has(p, 'gare', true);
      case 'incendie': return town.stat.pop > 15;
      case 'gouverneur': return town.era >= 2;
      default: return true;
    }
  }
  // une décision à prendre : en solo l'arbitre met le jeu en pause ; à plusieurs, le choix par défaut tombe au bout d'un mois
  raise(town, id) {
    if (town.lost && !town.ghost) return;
    town.nextEvent = this.day + rrange(this.rs, 4, 9) * 30;
    if (EVENTS[id].opts.length === 1) { this.resolveEvent(town.p, town, id, 0); this.ev.push({ t: 'event', p: town.p, id, auto: true }); return; }
    town.pending.push({ id, opt: 0, until: this.day + 30 });
    this.ev.push({ t: 'event', p: town.p, id });
  }
  resolveEvent(p, town, id, opt) {
    const say = (text, col = '#f8d070') => this.ev.push({ t: 'msg', p, text, col });
    const pay = (v) => { town.money -= v; };
    switch (id) {
      case 'bandits': {
        if (opt === 0) { pay(300); say('LES BANDITS REPARTENT AVEC 300 $'); break; }
        let def = 25;
        for (const b of this.townB(p, (b) => !b.site)) def += (BD[b.t].defense || 0) + (b.t === 'sherif' ? 15 : 0);
        if (rpct(this.rs, Math.min(90, def))) { say('LES BANDITS SONT REPOUSSÉS !', '#b8e070'); town.bonus[F.notables] += 5; town.bonus[F.francs] += 5; }
        else { const lost = Math.max(0, Math.round(town.money * 0.2)); pay(lost); say(`LES BANDITS ONT PILLÉ ${lost} $`, '#f0705a'); }
        break;
      }
      case 'gang': if (opt === 0) { pay(400); say('LES COLLINES SONT NETTOYÉES', '#b8e070'); } else town.mods.gang = this.day + 24 * 30; break;
      case 'secheresse': town.mods.secheresse = this.day + 6 * 30; if (opt === 0) town.bonus[F.pieux] += 6; else { pay(300); town.mods.puits = this.day + 6 * 30; } break;
      case 'filon': this.newVein(town); break;
      case 'epidemie': if (opt === 0) town.mods.quarantaine = this.day + 90; else town.mods.epidemie = this.day + 90; if (opt === 0) town.mods.epidemie = this.day + 30; break;
      case 'incendie': {
        const bl = this.townB(p, (b) => !b.site && b.t !== 'mairie');
        if (bl.length) { const b = bl[rint(this.rs, bl.length)]; b.fire = 15; this.ev.push({ t: 'fire', p, id: b.id }); }
        break;
      }
      case 'greve': if (opt === 0) { town.wageUp++; town.bonus[F.mineurs] += 10; } else { town.mods.greve = this.day + 90; town.bonus[F.rail] += 6; town.bonus[F.mineurs] -= 10; } break;
      case 'sauterelles': town.mods.sauterelles = this.day + (opt === 0 ? 30 : 90); break;
      case 'krach': this.mods.krach = this.day + 360; break;
      case 'gouverneur': if (opt === 0) { pay(500); town.money += 900; town.bonus[F.notables] += 10; } break;
      case 'inondation': {
        if (opt === 0) { pay(200); break; }
        for (const b of this.townB(p, (b) => !b.site && b.t !== 'mairie')) {
          if (this.map.dist[this.idx(b.x, b.y)] <= 1 && rpct(this.rs, 40)) { say(`${BD[b.t].name} EMPORTÉ PAR LA CRUE`, '#f0705a'); this.removeB(b); }
        }
        break;
      }
      case 'predicateur': if (opt === 0) { town.bonus[F.pieux] += 10; town.bonus[F.francs] -= 8; } else { town.bonus[F.pieux] -= 10; town.bonus[F.francs] += 8; } break;
      case 'vol_betail': if (opt === 0) { pay(150); town.bonus[F.eleveurs] += 4; } else { town.goods.boeuf = Math.round(town.goods.boeuf / 2); town.bonus[F.eleveurs] -= 10; } break;
      case 'ruee': if (opt === 0) { for (let k = 0; k < 12; k++) this.newCitizen(p, rrange(this.rs, 18, 35)); town.bonus[F.mineurs] += 5; } else town.mods.fermee = this.day + 90; break;
      case 'rachat': if (opt === 0) { town.money += 1500; town.bonus[F.rail] += 15; town.bonus[F.eleveurs] -= 15; } else town.bonus[F.eleveurs] += 10; break;
    }
  }
  // un nouveau filon d'or dans le territoire de la ville (ou juste à côté)
  newVein(town) {
    const [sx, sy] = this.map.starts[town.p];
    for (let tries = 0; tries < 200; tries++) {
      const x = sx + rint(this.rs, 21) - 10, y = sy + rint(this.rs, 21) - 10;
      if (!this.inMap(x, y)) continue;
      const i = this.idx(x, y);
      if (this.tileB[i] >= 0 || this.road[i] || this.map.rail[i] || !K.buildableTer(this.map.ter[i]) || this.dep[i]) continue;
      for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1], [-1, 0]]) {
        const X = x + dx, Y = y + dy;
        if (!this.inMap(X, Y)) continue;
        const j = this.idx(X, Y);
        if (this.tileB[j] < 0 && !this.road[j] && !this.map.rail[j] && K.buildableTer(this.map.ter[j])) { this.dep[j] = DEP.OR; this.depQ[j] = 400; }
      }
      this.ev.push({ t: 'vein', p: town.p, x, y });
      return;
    }
  }

  // ---------------------------------------------------------- fin de partie
  score(p) {
    const t = this.towns[p], st = t.stat;
    if (MODES_VILLE[this.mode].coop) return this.towns.reduce((s, o) => s + this.rawScore(o), 0);
    return this.rawScore(t);
  }
  rawScore(t) {
    const st = t.stat;
    const years = Math.floor(this.day / TIME.year);
    return Math.max(0, Math.round(st.pop * 10 + Math.min(20000, Math.max(0, t.money)) / 10 + st.hap * 5 + t.exportsTotal / 20 + (t.lost ? 0 : years * 20)));
  }
  checkEnd(year) {
    if (this.result) return;
    const md = MODES_VILLE[this.mode];
    for (const t of this.towns) {
      if (t.lost) continue;
      if (t.broke >= 6) this.lose(t, 'faillite');
      else if (t.stat.pop === 0 && this.day > 60) this.lose(t, 'vide');
    }
    const alive = this.towns.filter((t) => !t.lost);
    const order = () => this.towns.map((t) => t.p).sort((a, b) => (!!this.towns[a].lost - !!this.towns[b].lost) || this.score(b) - this.score(a) || a - b);
    if (!alive.length) { this.result = { winners: [], reason: 'tous', ranking: order() }; return; }
    if (md.coop) {
      const pop = this.towns.reduce((s, t) => s + (t.lost ? 0 : t.stat.pop), 0);
      if (pop >= md.pop) { this.result = { winners: alive.map((t) => t.p), reason: 'objectif', ranking: order() }; return; }
      if (year >= md.year) { this.result = { winners: [], reason: 'temps', ranking: order() }; return; }
    }
    if (md.money || (md.pop && !md.coop)) {
      const hit = alive.filter((t) => (md.money ? t.money >= md.money : t.stat.pop >= md.pop));
      if (hit.length) { hit.sort((a, b) => this.score(b.p) - this.score(a.p) || a.p - b.p); this.result = { winners: [hit[0].p], reason: 'objectif', ranking: order() }; return; }
    }
    if (year >= TIME.end) {
      const rk = order();
      const winners = this.players.length === 1 ? (alive.length ? [0] : []) : md.coop ? [] : [rk[0]].filter((p) => !this.towns[p].lost);
      this.result = { winners, reason: 'fin', ranking: rk };
      for (const t of alive) t.winner = winners.includes(t.p);
    }
    // seul et battu : c'est fini
    if (this.players.length === 1 && this.towns[0].lost) this.result = { winners: [], reason: this.towns[0].lost, ranking: [0] };
    // à plusieurs : quand tous les humains ont perdu
    if (this.players.length > 1 && this.players.some((pl) => !pl.bot) && this.players.every((pl, i) => pl.bot || this.towns[i].lost)) this.result = { winners: [], reason: 'tous', ranking: order() };
  }

  // ---------------------------------------------------------- empreinte (contrôle du lockstep)
  hash() {
    let h = 0x811c9dc5;
    h = fnv(h, this.day); h = fnv(h, this.rs.s); h = fnv(h, this.nextId); h = fnv(h, this.nextC);
    for (const b of this.B) { h = fnv(h, b.id); h = fnv(h, b.x * 4096 + b.y); h = fnv(h, b.site + b.lvl * 1000); h = fnv(h, b.w); h = fnv(h, b.fire); }
    for (const c of this.C) { h = fnv(h, c.id); h = fnv(h, c.home); h = fnv(h, c.job); h = fnv(h, c.hap); h = fnv(h, c.p); }
    for (const t of this.towns) {
      h = fnv(h, Math.round(t.money)); h = fnv(h, t.era);
      for (const g of GOOD_IDS) h = fnv(h, t.goods[g]);
      for (const a of t.ap) h = fnv(h, a);
    }
    for (const g of GOOD_IDS) h = fnv(h, this.price[g]);
    for (let i = 0; i < this.road.length; i += 7) { h = fnv(h, this.road[i] + this.owner[i] * 4); h = fnv(h, this.depQ[i]); }
    return h >>> 0;
  }

  // ---------------------------------------------------------- sauvegarde
  serialize() {
    const diff = (a, b) => { const out = []; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) out.push(i, a[i]); return out; };
    return {
      v: SAVE_V, seed: this.seed, players: this.players, mode: this.mode, day: this.day, rs: this.rs.s,
      nextId: this.nextId, nextC: this.nextC,
      owner: rle(this.owner), road: rle(this.road), reveal: rle(this.reveal),
      wood: diff(this.wood, this.map.wood0), dep: diff(this.dep, this.map.dep), depQ: diff(this.depQ, this.map.depQ),
      B: this.B.map((b) => [b.id, b.t, b.x, b.y, b.rot, b.p, b.site, b.on, b.w, b.ex, b.eff, b.fire, b.lvl]),
      C: this.C.map((c) => [c.id, c.p, c.age, c.edu, c.fac, c.home, c.job, c.hap, c.sad, ...c.need]),
      towns: this.towns.map((t) => ({ ...t, stat: { ...t.stat }, hist: t.hist })),
      price: this.price, contracts: this.contracts, offers: this.offers, mods: this.mods, next: this.next, result: this.result,
    };
  }
  static load(s) {
    if (!s || s.v !== SAVE_V) throw new Error('Sauvegarde d\'une autre version');
    const w = new World(s.seed, s.players, s.mode, false);
    const nn = w.n * w.n;
    w.day = s.day; w.rs = { s: s.rs >>> 0 }; w.nextId = s.nextId; w.nextC = s.nextC;
    w.owner = unrle(s.owner, Int8Array, nn); w.road = unrle(s.road, Uint8Array, nn); w.reveal = unrle(s.reveal, Uint8Array, nn);
    const undiff = (a, d) => { for (let i = 0; i < d.length; i += 2) a[d[i]] = d[i + 1]; };
    undiff(w.wood, s.wood); undiff(w.dep, s.dep); undiff(w.depQ, s.depQ);
    for (const r of s.B) {
      const [id, t, x, y, rot, p, site, on, wk, ex, eff, fire, lvl] = r;
      if (!BD[t]) continue;
      const b = { id, t, x, y, rot, p, site, on, w: wk, ex, eff, fire, lvl, note: '' };
      w.B.push(b); w.byId.set(id, b);
      for (const [fx, fy] of K.footprint(BD[t], x, y, rot)) w.tileB[w.idx(fx, fy)] = id;
    }
    w.C = s.C.map((r) => ({ id: r[0], p: r[1], age: r[2], edu: r[3], fac: r[4], home: r[5], job: r[6], hap: r[7], sad: r[8], need: r.slice(9) }));
    w.towns = s.towns.map((t) => ({ ...t, stat: { ...t.stat }, hist: [...t.hist] }));
    w.price = { ...s.price }; w.contracts = s.contracts; w.offers = s.offers; w.mods = s.mods; w.next = s.next; w.result = s.result;
    w.dirty = true;
    w.refresh();
    // les occupations des logements et la qualité des services se recalculent (pas sauvegardées)
    for (const t of w.towns) {
      const occ = new Map();
      for (const c of w.C) if (c.p === t.p && c.home >= 0) occ.set(c.home, (occ.get(c.home) || 0) + 1);
      for (const b of w.B) if (b.p === t.p && BD[b.t].house) b.occ = occ.get(b.id) || 0;
    }
    return w;
  }

  // ---------------------------------------------------------- pour l'interface
  // rendement attendu (0-100) d'un bâtiment posé là : sol, gisement, bois
  expected(p, t, x, y, rot = 0) {
    const def = BD[t], pr = def.prod;
    if (!pr) return null;
    const [w, d] = K.dims(def, rot);
    if (K.CROPS[pr.res] || pr.res === 'paturage') {
      const cand = [];
      for (let yy = y - pr.r; yy < y + d + pr.r; yy++) for (let xx = x - pr.r; xx < x + w + pr.r; xx++) {
        if (!this.inMap(xx, yy) || (xx >= x && xx < x + w && yy >= y && yy < y + d)) continue;
        const i = this.idx(xx, yy), tr = this.map.ter[i];
        if (this.fieldOf[i] >= 0 || this.tileB[i] >= 0 || this.road[i] || this.map.rail[i] || this.owner[i] !== p) continue;
        if (tr !== TER.DESERT && tr !== TER.PRAIRIE) continue;
        cand.push(pr.res === 'paturage' ? this.pasture(i) : this.fert(pr.res, i));
      }
      cand.sort((a, b) => b - a);
      const want = pr.r * 6;
      let s = 0;
      for (let k = 0; k < Math.min(want, cand.length); k++) s += cand[k];
      return Math.round(s / want);
    }
    if (pr.res === 'bois') {
      let s = 0;
      for (let yy = y - pr.r; yy <= y + pr.r; yy++) for (let xx = x - pr.r; xx <= x + pr.r; xx++) if (this.inMap(xx, yy)) s += this.wood[this.idx(xx, yy)];
      return clamp(Math.round(s / 15), 0, 100);
    }
    if (pr.res === 'dep') {
      const dd = DEP[def.on.slice(4).toUpperCase()];
      let s = 0;
      for (let yy = y - pr.r; yy < y + d + pr.r; yy++) for (let xx = x - pr.r; xx < x + w + pr.r; xx++) if (this.inMap(xx, yy) && this.dep[this.idx(xx, yy)] === dd) s += this.depQ[this.idx(xx, yy)];
      return clamp(Math.round(s / 30), 0, 100);
    }
    return 100;
  }

  // meilleure qualité d'un service (besoin) qui atteint la case, pour les filtres
  coverAt(p, need, x, y) {
    let best = 0;
    const tram = this.has(p, 'tramway', true) ? 2 : 0;
    for (const s of this.B) {
      const sd = this.svcOf(s);
      if (!sd || s.p !== p || s.site || sd.need !== need) continue;
      if (this.near(s, x, y, sd.r + tram)) best = Math.max(best, s.q ?? sd.q);
    }
    return best;
  }
}

// ------------------------------------------------------------ résumé d'une sauvegarde (menu des emplacements)
export function summary(w, p = 0) {
  const t = w.towns[p];
  const { year, month } = K.dateOf(w.day);
  return { name: t.name, year, month, pop: t.stat.pop, hap: t.stat.hap, money: Math.round(t.money), mode: w.mode, players: w.players.map((x) => x.name), over: !!w.result || !!t.lost };
}
