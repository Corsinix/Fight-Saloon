// Maire IA de « La ville » : les bots, les villes fantômes (maire battu à plusieurs) et l'outil d'équilibrage
// (tools/villesim-check.mjs). Il ne fait que proposer des commandes, une fois par mois, à partir de l'état de la World :
// l'arbitre les fait passer dans le journal du lockstep comme celles des joueurs. Aucun hasard (tout se déduit de la
// World), donc les bots jouent pareil partout.
import * as K from './villekit.js';

const { BUILDINGS: BD, TER, FOOD_IDS } = K;

// Ce que l'IA veut construire, par ordre de priorité, selon l'état de sa ville. Renvoie des commandes { c, … }.
export function aiCommands(world, p, opts = {}) {
  const town = world.towns[p];
  if (!town || (town.lost && !town.ghost)) return [];
  const out = [];
  // décisions en attente : le premier choix (souvent le plus prudent), ou le discours de la faction la plus nombreuse
  for (const d of town.pending) {
    if (d.id === 'campagne') {
      const cnt = new Array(K.FACTIONS.length).fill(0);
      for (const c of world.C) if (c.p === p) cnt[c.fac]++;
      const best = cnt.indexOf(Math.max(...cnt));
      out.push({ c: 'choose', id: d.id, opt: K.SPEECHES.findIndex((s) => s.fac === K.FACTIONS[best].id) });
    } else out.push({ c: 'choose', id: d.id, opt: d.id === 'bandits' && town.money < 1500 ? 1 : 0 });
  }
  const st = town.stat;
  const pop = st.pop || world.pop(p);
  const cnt = (t) => world.count(p, t, false);
  let money = town.money;
  const reserve = opts.reserve ?? 250 + (town.stat.pop || 0) * 3;
  // logements libres, emplois libres
  let free = 0, jobs = 0;
  for (const b of world.B) {
    if (b.p !== p) continue;
    const def = BD[b.t];
    if (def.house) free += world.hcap(b) - (b.site ? 0 : b.occ || 0);
    if (def.jobs) jobs += def.jobs - (b.site ? 0 : b.w);
  }
  const food = FOOD_IDS.reduce((s, g) => s + town.goods[g], 0);
  let foodMade = 0;
  for (const g of FOOD_IDS) foodMade += st.made?.[g] || 0;
  const stock = K.GOOD_IDS.reduce((s, g) => s + town.goods[g], 0);
  const wants = [];
  const want = (t, why) => { if (BD[t].era <= town.era && !wants.includes(t)) wants.push(t); };
  const hungry = food < pop * 3 || foodMade < pop * 1.1;
  if (hungry) { want(cnt('ferme_mais') <= cnt('ranch') + 1 ? 'ferme_mais' : 'ranch'); want('potager'); }
  if (st.homeless > 0 || free < 4) want(money > 900 && town.era >= 2 ? 'brique' : money > 500 ? 'maison' : 'cabane');
  if (cnt('magasin') * 40 + cnt('marche') * 90 < pop) want(town.era >= 2 && money > 800 ? 'marche' : 'magasin');
  if (stock > world.storeCap(p) * 0.8) want('entrepot');
  if (pop >= 20 && cnt('eglise') * 50 + cnt('mission') * 90 < pop) want('eglise');
  if (pop >= 20 && cnt('docteur') * 30 + cnt('hopital') * 120 < pop) want(town.era >= 3 ? 'hopital' : 'docteur');
  if (pop >= 25 && cnt('saloon') * 25 + cnt('bal') * 40 < pop) want(town.era >= 2 && cnt('saloon') >= 2 ? 'bal' : 'saloon');
  if (pop >= 30 && cnt('sherif') * 60 + cnt('prison') * 120 < pop) want('sherif');
  if (town.era >= 2 && !cnt('gare')) want('gare');
  if (town.era >= 2 && pop >= 60 && !cnt('banque') && money > 1300) want('banque');
  if (town.era >= 2 && !cnt('ecole') && pop >= 50) want('ecole');
  if (pop >= 25 && !cnt('diligence')) want('diligence');
  // transformer le surplus : ce qui se vend mieux une fois travaillé
  if (town.goods.mais > pop * 4 && !cnt('distillerie')) want('distillerie');
  if (town.goods.bois > 150 && !cnt('scierie')) want('scierie');
  if (town.goods.ble > 120 && !cnt('moulin')) want('moulin');
  if (town.goods.or > 20 && !cnt('essai')) want('essai');
  if (town.goods.boeuf > pop * 2 && !cnt('tannerie')) want('tannerie');
  if (town.goods.coton > 80 && !cnt('filature')) want('filature');
  if (town.goods.tabac > 60 && !cnt('cigares')) want('cigares');
  // les ères : la banque ouvre l'ère 3, le tourisme et la culture la font payer
  if (town.era >= 2 && pop >= 50 && !cnt('banque') && money > 1100) wants.unshift('banque');
  if (town.era >= 2 && !cnt('telegraphe') && pop >= 70) want('telegraphe');
  if (town.era >= 3 && cnt('gare') && cnt('hotel') < 2) want('hotel');
  if (town.era >= 3 && cnt('hotel') && !cnt('wildwest')) want('wildwest');
  if (town.era >= 3 && pop >= 150 && !cnt('theatre')) want('theatre');
  if (town.era >= 3 && pop >= 120 && !cnt('tribunal') && cnt('sherif') >= 2) want('tribunal');
  // la caisse déborde : du prestige (décor, culture, instruction)
  if (money > 10000) for (const t of ['opera', 'universite', 'grand_hotel', 'place', 'fontaine', 'statue', 'parc', 'kiosque', 'villa', 'hopital']) if (cnt(t) < (t === 'parc' ? 4 : 2)) want(t);
  // du travail pour les chômeurs : mines sur les filons, bois, ranchs, champs, ateliers
  // (sans postes libres, plus personne ne vient : on en crée dès qu'il en manque)
  if (jobs < 4) {
    for (const t of ['mine_or', 'mine_argent', 'carriere', 'mine_cuivre', 'mine_charbon', 'bucheron', 'coton', 'tabac', 'ranch', 'ferme_ble', 'distillerie', 'scierie', 'moulin', 'tannerie', 'placer']) {
      if (BD[t].era > town.era) continue;
      if (BD[t].conv && !Object.keys(BD[t].conv.in).every((g) => town.goods[g] > BD[t].conv.in[g] * 3 || (st.made?.[g] || 0) > BD[t].conv.in[g])) continue;
      want(t);
      if (wants.length > 6) break;
    }
  }
  // au plus deux chantiers par mois, s'il reste de quoi les payer ; les cases déjà choisies ce mois-ci sont réservées
  let built = 0;
  const taken = new Set();
  const reserve2 = (t, s) => { for (const [x, y] of K.footprint(BD[t], s.x, s.y, s.rot)) taken.add(y * world.n + x); };
  // un bureau foncier de temps en temps seulement (il en faut un pour s'étendre, pas soixante-dix)
  const fonciers = cnt('foncier');
  const canFoncier = !world.solo && fonciers < 2 + Math.floor(pop / 50) && world.day - (town.aiFoncier || -1e9) >= 180;
  // comptes du mois dans le rouge et caisse maigre : seulement de quoi nourrir et employer
  const net = Object.values(st.inc || {}).reduce((s, v) => s + v, 0) - Object.values(st.out || {}).reduce((s, v) => s + v, 0);
  const tight = net < 0 && money < 3000;
  const vital = (t) => !!(BD[t].prod || BD[t].conv || t === 'gare' || t === 'diligence' || t === 'magasin');
  if (tight) {
    for (let k = wants.length - 1; k >= 0; k--) if (!vital(wants[k])) wants.splice(k, 1);
    // dans le rouge : on ferme ce qui ne rapporte rien (ateliers à l'arrêt, faute de matière)
    if (money < 0) for (const b of world.B) if (b.p === p && !b.site && b.on && BD[b.t].conv && b.eff < 20) out.push({ c: 'toggle', id: b.id });
    // en faillite proche : on ferme ce qui coûte sans être vital (culture, loisirs de luxe, hôtels vides)
    if (money < -200) {
      const luxe = world.B.filter((b) => b.p === p && !b.site && b.on && ['theatre', 'opera', 'bal', 'jeu', 'kiosque', 'grand_hotel', 'hotel', 'wildwest', 'universite', 'tramway'].includes(b.t)).sort((a, b) => BD[b.t].cost - BD[a.t].cost);
      if (luxe.length) out.push({ c: 'toggle', id: luxe[0].id });
    }
  }
  for (const t of wants) {
    if (built >= (opts.perMonth ?? (town.money > 8000 ? 5 : town.money > 3000 ? 3 : 2))) break;
    const def = BD[t];
    if (money - def.cost < reserve) continue;
    const spot = findSpot(world, p, t, false, hungry, taken);
    if (!spot) {
      // plus de place : un bureau foncier pour agrandir le territoire
      if (t !== 'foncier' && canFoncier && !taken.has(-1) && money - BD.foncier.cost > reserve) {
        const s2 = findSpot(world, p, 'foncier', t === 'gare' ? 'rail' : true, false, taken);
        if (s2) { out.push({ c: 'build', t: 'foncier', x: s2.x, y: s2.y, rot: 0 }); reserve2('foncier', s2); taken.add(-1); town.aiFoncier = world.day; money -= BD.foncier.cost; built++; }
      }
      continue;
    }
    out.push({ c: 'build', t, x: spot.x, y: spot.y, rot: spot.rot });
    reserve2(t, spot);
    money -= def.cost;
    const path = roadTo(world, p, t, spot).filter(([x, y]) => !taken.has(y * world.n + x));
    if (path.length) { out.push({ c: 'road', kind: 1, tiles: path }); for (const [x, y] of path) taken.add(y * world.n + x); money -= path.length * 5; }
    built++;
  }
  // une amélioration par mois (ère 2) : un logement plein, un service débordé, une exploitation qui tourne
  if (town.era >= K.UPGRADE.era && money > 1800) {
    for (const b of world.B) {
      if (b.p !== p || b.site || b.lvl > 1) continue;
      const def = BD[b.t];
      if (!K.upgradable(def) || K.upgradeCost(def) > money - 1200) continue;
      const full = (def.house && b.occ >= world.hcap(b)) || (def.svc && (b.served || 0) >= world.svcOf(b).cap) || ((def.prod || def.conv) && b.eff > 70);
      if (!full) continue;
      out.push({ c: 'upgrade', id: b.id });
      money -= K.upgradeCost(def);
      if (money < 8000) break;
    }
  }
  // le moral flanche avant une élection : une fête
  if (st.hap < 52 && money > 2500 && !town.mods.fete && town.next.election - world.day < 360) out.push({ c: 'edict', id: 'fete', on: true });
  // impôts : moyens ; bas si les factions grognent avant une élection
  const avgAp = town.ap.reduce((s, v) => s + v, 0) / town.ap.length;
  const wantTax = money < 500 && net < 0 ? 2 : avgAp < 40 ? 0 : money > 5000 && avgAp < 55 ? 0 : 1;
  if (wantTax !== town.tax) out.push({ c: 'tax', v: wantTax });
  return out;
}

// La meilleure place pour un bâtiment : près de la mairie, sur la meilleure ressource pour une exploitation.
// edge : pour un bureau foncier, au contraire, au bord du territoire.
export function findSpot(world, p, t, edge = false, hungry = false, taken = null) {
  const def = BD[t], n = world.n;
  const town = world.towns[p];
  const hall = world.B.find((b) => b.p === p && b.t === 'mairie');
  if (!hall) return null;
  const hx = hall.x + 1, hy = hall.y + 1;
  let best = null, bestS = -1e9;
  const R = 20;
  for (let y = Math.max(0, hy - R); y < Math.min(n, hy + R); y++) for (let x = Math.max(0, hx - R); x < Math.min(n, hx + R); x++) {
    if (world.owner[y * n + x] !== p) continue;
    for (const rot of def.w === def.d ? [(x + y) & 1 ? 0 : 3] : [0, 3]) { // façade vers le joueur
      const chk = world.canPlace(p, t, x, y, rot);
      if (!chk.ok) continue;
      if (taken && K.footprint(def, x, y, rot).some(([fx, fy]) => taken.has(fy * n + fx))) continue;
      const d = Math.abs(x - hx) + Math.abs(y - hy);
      let s = edge === 'rail' ? -Math.abs(y - world.map.railY) * 3 - d * 0.3 : edge ? d * 2 : -d;
      if (def.prod) {
        // une exploitation sans assez de champs (ou de bois, ou de filon) ne vaut pas son prix
        const e = world.expected(p, t, x, y, rot) ?? 0;
        if (e < (K.CROPS[def.prod.res] || def.prod.res === 'paturage' ? (t === 'potager' || hungry ? 25 : 40) : 15)) continue;
        s += e * 2;
      }
      if (def.house || def.svc) s -= nearRoad(world, x, y) ? 0 : 6;
      // les exploitations laissent de la place à leurs champs : pas collées au centre
      if (def.prod && (K.CROPS[def.prod.res] || def.prod.res === 'paturage') && d < 5) s -= 10;
      if (s > bestS) { bestS = s; best = { x, y, rot }; }
    }
  }
  return best;
}
function nearRoad(world, x, y) {
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, 1], [1, -1], [2, 0], [0, 2]]) {
    const X = x + dx, Y = y + dy;
    if (world.inMap(X, Y) && world.road[world.idx(X, Y)]) return true;
  }
  return false;
}

// Chemin de terre le plus court du bâtiment (pas encore posé) jusqu'au réseau relié à la mairie.
export function roadTo(world, p, t, spot) {
  const n = world.n, def = BD[t];
  const [w, d] = K.dims(def, spot.rot);
  const inFp = (x, y) => x >= spot.x && x < spot.x + w && y >= spot.y && y < spot.y + d;
  if (world.dirty) world.refresh();
  const prev = new Int32Array(n * n).fill(-2);
  const q = [];
  for (let x = spot.x; x < spot.x + w; x++) for (const y of [spot.y - 1, spot.y + d]) push(x, y, -1);
  for (let y = spot.y; y < spot.y + d; y++) for (const x of [spot.x - 1, spot.x + w]) push(x, y, -1);
  function push(x, y, from) {
    if (!world.inMap(x, y) || inFp(x, y)) return;
    const i = y * n + x;
    if (prev[i] !== -2) return;
    const tr = world.map.ter[i];
    if (world.owner[i] !== p || world.tileB[i] >= 0 || tr === TER.WATER || tr === TER.MESA || tr === TER.MOUNT) return;
    prev[i] = from;
    q.push(i);
  }
  for (let h = 0; h < q.length && h < 4000; h++) {
    const i = q[h];
    if (world.linked[i]) {
      const path = [];
      for (let j = i; j >= 0; j = prev[j]) if (!world.road[j]) path.push([j % n, Math.floor(j / n)]);
      return path.length > 14 ? [] : path;
    }
    const x = i % n, y = (i - x) / n;
    push(x + 1, y, i); push(x - 1, y, i); push(x, y + 1, i); push(x, y - 1, i);
  }
  return [];
}
