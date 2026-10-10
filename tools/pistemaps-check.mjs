// Vérifie les cartes de bataille de « La piste » (public/js/pistemaps.js) sur des centaines de graines par thème.
//   node tools/pistemaps-check.mjs                 tous les thèmes, 300 cartes chacun
//   node tools/pistemaps-check.mjs mine            un seul thème
//   node tools/pistemaps-check.mjs --n=1000        plus de graines
//   node tools/pistemaps-check.mjs saloon --show=3 avec le dessin de trois cartes (--amb : les places d'embuscade)
//   node tools/pistemaps-check.mjs --seed=1234 --show   une graine précise (--fails --show=5 : les cartes en erreur)
// Règles : sol d'un seul tenant, départs libres et assez nombreux, bande à gauche/en bas et ennemis à droite/en haut,
// assez loin (60 % de la diagonale), du couvert près des départs, pas (trop) de ligne de vue au départ, des flancs,
// un encombrement raisonnable, des bords de vide sans dents, mine dans le noir et sous le brouillard, saloon sans
// brouillard de jour, brouillard dehors une fois sur trois environ, même graine → même carte, moins de 30 ms par carte.
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'js');
const PM = await import(pathToFileURL(path.join(ROOT, 'pistemaps.js')).href);
const { CELL, blocksMove, blocksSight, coverValue, makeBattle, themeFor, THEMES, clutterOf, CLUTTER } = PM;

const args = process.argv.slice(2);
const opt = (k, d) => { const a = args.find((s) => s.startsWith(`--${k}`)); if (!a) return d; const v = a.split('=')[1]; return v === undefined ? true : v; };
const N = +opt('n', 300);
const SHOW = opt('show', 0) === true ? 2 : +opt('show', 0);
const AMB = !!opt('amb', false);
const FAILS = !!opt('fails', false);
const SEED = opt('seed', null);
const only = args.find((a) => !a.startsWith('--'));
const REGIONS = ['desert', 'canyon', 'prairie', 'foret', 'neige'];
const KINDS = ['combat', 'combat', 'combat', 'embuscade', 'coyotes'];
const CH = ['.', ',', '#', 'x', '*', '~', 'P', 's', ' ', 'T', 'C', '=', 'f', 'i'];
const OUTDOOR = new Set(['desert', 'canyon', 'prairie', 'foret', 'neige', 'ville', 'hacienda']);

let fails = 0;
const fail = (msg) => { fails++; console.log(`   ✗ ${msg}`); };

// ------------------------------------------------------------ cohérence des règles des cases
const C = CELL;
const expect = {
  move: [C.WALL, C.CRATE, C.WATER, C.CHEST, C.SAND, C.VOID, C.TABLE, C.COUNTER, C.FENCE, C.PILLAR],
  sight: [C.WALL, C.PILLAR],
  cover2: [C.WALL, C.COUNTER, C.PILLAR],
  cover1: [C.CRATE, C.CHEST, C.SAND, C.TABLE, C.FENCE],
};
for (let c = 0; c <= 13; c++) {
  if (blocksMove(c) !== expect.move.includes(c)) fail(`blocksMove(${c}) faux`);
  if (blocksSight(c) !== expect.sight.includes(c)) fail(`blocksSight(${c}) faux`);
  const cv = expect.cover2.includes(c) ? 2 : expect.cover1.includes(c) ? 1 : 0;
  if (coverValue(c) !== cv) fail(`coverValue(${c}) = ${coverValue(c)} au lieu de ${cv}`);
}

// ------------------------------------------------------------ le choix des thèmes
{
  const seen = {};
  let repeats = 0, pairs = 0;
  for (let s = 1; s <= 400; s++) for (const region of REGIONS) {
    let prev = null;
    for (let col = 1; col <= 9; col++) {
      const t = themeFor(s * 7919, region, col, 'combat');
      seen[region] = seen[region] || {};
      seen[region][t] = (seen[region][t] || 0) + 1;
      if (prev) { pairs++; if (prev === t) repeats++; }
      prev = t;
      const c = themeFor(s * 7919, region, col, 'coyotes');
      if (['saloon', 'ville', 'mine'].includes(c)) fail(`coyotes au ${c} (${region}, col ${col})`);
      if (!THEMES[t] || !THEMES[c]) fail(`thème inconnu ${t} / ${c}`);
    }
    if (themeFor(s, region, 10, 'repaire') !== 'hacienda') fail('le repaire n\'est pas la hacienda');
  }
  console.log('Thèmes par région (combats, colonnes 1 à 9) :');
  for (const [r, m] of Object.entries(seen)) console.log(`   ${r.padEnd(8)} ${Object.entries(m).sort((a, b) => b[1] - a[1]).map(([t, n]) => `${t} ${Math.round((n * 100) / 3600)}%`).join(', ')}`);
  console.log(`   même thème deux colonnes de suite : ${repeats}/${pairs}`);
  if (repeats) fail('thème répété d\'une colonne à la suivante');
}

// ------------------------------------------------------------ outils de vérification (indépendants du générateur)
const inMap = (m, x, y) => x >= 0 && y >= 0 && x < m.w && y < m.h;
const cellOf = (m, x, y) => (inMap(m, x, y) ? m.cells[y * m.w + x] : C.WALL);
function sees(m, ax, ay, bx, by) {
  if (ax === bx && ay === by) return true;
  for (const [ox, oy] of [[0, 0], [0.32, 0.32], [-0.32, 0.32], [0.32, -0.32], [-0.32, -0.32]]) {
    const x0 = ax + 0.5, y0 = ay + 0.5, x1 = bx + 0.5 + ox, y1 = by + 0.5 + oy, n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 4);
    let ok = true;
    for (let i = 1; i < n && ok; i++) {
      const x = Math.floor(x0 + ((x1 - x0) * i) / n), y = Math.floor(y0 + ((y1 - y0) * i) / n);
      if ((x === ax && y === ay) || (x === bx && y === by)) continue;
      if (blocksSight(cellOf(m, x, y))) ok = false;
    }
    if (ok) return true;
  }
  return false;
}
function bfs(m, from, blocked = null) {
  const dist = new Int32Array(m.w * m.h).fill(-1), prev = new Int32Array(m.w * m.h).fill(-1), q = [from.y * m.w + from.x];
  dist[q[0]] = 0;
  for (let i = 0; i < q.length; i++) {
    const k = q[i], x = k % m.w, y = (k - x) / m.w;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const X = x + dx, Y = y + dy, kk = Y * m.w + X;
      if (!inMap(m, X, Y) || dist[kk] >= 0 || blocksMove(m.cells[kk]) || (blocked && blocked[kk])) continue;
      dist[kk] = dist[k] + 1; prev[kk] = k; q.push(kk);
    }
  }
  return { dist, prev };
}
function check(m) {
  const errs = [], st = {};
  const { w, h, cells, deploy: dep } = m;
  if (!(w >= 20 && w <= 38 && h >= 14 && h <= 28)) errs.push(`taille ${w}×${h} hors des bornes`);
  if (cells.length !== w * h || m.base.length !== w * h) errs.push('tableaux de mauvaise taille');
  for (let k = 0; k < w * h; k++) if (cells[k] > 13) { errs.push(`code de case inconnu ${cells[k]}`); break; }
  if (!m.name || !THEMES[m.theme] || !m.env) errs.push('nom, thème ou env manquant');
  // départs
  const free = (s) => s && inMap(m, s.x, s.y) && !blocksMove(cells[s.y * w + s.x]);
  if (!dep || dep.p.length < 6 || dep.e.length < 10 || dep.amb.length < 10) errs.push(`départs trop peu nombreux (p ${dep?.p.length} e ${dep?.e.length} amb ${dep?.amb.length})`);
  const all = [...dep.p, ...dep.e, ...dep.amb, ...(dep.boss ? [dep.boss] : [])];
  if (!all.every(free)) errs.push('départ sur une case bloquée');
  const keys = new Set();
  for (const s of [...dep.p, ...dep.e, ...(dep.boss ? [dep.boss] : [])]) { const k = s.y * w + s.x; if (keys.has(k)) errs.push(`départ en double ${s.x},${s.y}`); keys.add(k); }
  for (const s of dep.amb) if (dep.p.some((o) => o.x === s.x && o.y === s.y)) errs.push('embuscade sur un départ de la bande');
  if (m.theme === 'hacienda' && !dep.boss) errs.push('pas de place pour El Diablo');
  // tout le sol se tient
  const { dist } = bfs(m, dep.p[0]);
  let walk = 0, reach = 0;
  for (let k = 0; k < w * h; k++) if (!blocksMove(cells[k])) { walk++; if (dist[k] >= 0) reach++; }
  if (reach !== walk) errs.push(`${walk - reach} cases de sol inaccessibles`);
  for (const s of all) if (dist[s.y * w + s.x] < 0) { errs.push(`départ ${s.x},${s.y} inaccessible`); break; }
  // côtés et distance
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let k = 0; k < w * h; k++) if (cells[k] !== C.VOID) { const x = k % w, y = (k - x) / w; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const diag = Math.hypot(x1 - x0 + 1, y1 - y0 + 1);
  const cen = (s) => ({ x: s.reduce((a, o) => a + o.x, 0) / s.length, y: s.reduce((a, o) => a + o.y, 0) / s.length });
  const pc = cen(dep.p), ec = cen(dep.e), side = (c) => c.x / w - c.y / h;
  if (side(pc) >= side(ec)) errs.push('la bande n\'est pas à gauche/en bas des ennemis');
  st.dist = Math.hypot(ec.x - pc.x, ec.y - pc.y) / diag;
  if (st.dist < 0.6) errs.push(`départs trop proches (${Math.round(st.dist * 100)} % de la diagonale)`);
  let minD = 1e9;
  for (const a of dep.p) for (const b of dep.e) minD = Math.min(minD, Math.hypot(a.x - b.x, a.y - b.y));
  if (minD < 0.4 * diag) errs.push(`un départ ennemi à ${minD.toFixed(1)} cases de la bande`);
  // couvert près des départs
  const coverNear = (s) => {
    const set = new Set(); let withCover = 0;
    for (const o of s) {
      let any = false;
      for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
        const x = o.x + dx, y = o.y + dy;
        if (inMap(m, x, y) && coverValue(cells[y * w + x])) { set.add(y * w + x); any = true; }
      }
      if (any) withCover++;
    }
    return [set.size, withCover / s.length];
  };
  const [cp, fp] = coverNear(dep.p), [ce, fe] = coverNear(dep.e);
  st.coverP = cp; st.coverE = ce;
  if (cp < 4 || fp < 0.6) errs.push(`peu de couvert près de la bande (${cp} cases, ${Math.round(fp * 100)} % des départs)`);
  if (ce < 4 || fe < 0.6) errs.push(`peu de couvert près des ennemis (${ce} cases, ${Math.round(fe * 100)} % des départs)`);
  // ligne de vue au départ
  let seen = 0, tot = 0;
  for (const a of dep.p.slice(0, 6)) for (const b of dep.e.slice(0, 10)) { tot++; if (sees(m, a.x, a.y, b.x, b.y)) seen++; }
  st.los = seen / tot;
  if (st.los > 0.5) errs.push(`les camps se voient au départ (${Math.round(st.los * 100)} % des paires)`);
  // des flancs : on bouche le plus court chemin (et ses abords) et on doit encore passer
  const a = dep.p[0], b = dep.e[0], kb = b.y * w + b.x;
  const r1 = bfs(m, a);
  const path = [];
  for (let k = kb; k >= 0; k = r1.prev[k]) path.unshift(k);
  const blocked = new Uint8Array(w * h);
  for (let i = 4; i < path.length - 4; i++) {
    const x = path[i] % w, y = Math.floor(path[i] / w);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (inMap(m, x + dx, y + dy)) blocked[(y + dy) * w + x + dx] = 1;
  }
  st.flank = bfs(m, a, blocked).dist[kb] >= 0;
  if (!st.flank) errs.push('un seul couloir entre les camps (pas de flanc)');
  // encombrement
  const cl = clutterOf(m);
  st.inner = cl.inner; st.raw = cl.raw;
  const [lo, hi] = CLUTTER[m.theme];
  if (cl.inner < lo - 0.02 || cl.inner > hi + 0.02) errs.push(`encombrement ${Math.round(cl.inner * 100)} % (visé ${lo * 100}-${hi * 100} %)`);
  if (cl.raw > (m.theme === 'mine' ? 0.55 : 0.5)) errs.push(`carte trop pleine (${Math.round(cl.raw * 100)} % d'obstacles)`);
  // bords du vide sans dents (dehors)
  if (OUTDOOR.has(m.theme)) {
    let teeth = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const v = cells[y * w + x] === C.VOID;
      const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => (inMap(m, x + dx, y + dy) ? cells[(y + dy) * w + x + dx] === C.VOID : v));
      const same = nb.filter((n) => n === v).length;
      if (same <= 1) teeth++;
    }
    st.teeth = teeth;
    if (teeth > 2) errs.push(`${teeth} dents au bord du vide`);
  }
  // brouillard, noir, lumières
  if (m.theme === 'mine' && (!m.fog || !m.dark || m.lights.length < 3)) errs.push('la mine doit être noire, sous le brouillard, avec des lanternes');
  if (m.theme === 'saloon' && m.fog && m.sky === 'jour') errs.push('brouillard au saloon en plein jour');
  for (const l of m.lights) if (!inMap(m, l.x, l.y) || !(l.r > 0)) { errs.push('lanterne hors de la carte'); break; }
  return { errs, st };
}

// ------------------------------------------------------------ dessin ASCII
function draw(m) {
  const over = new Map();
  if (AMB) for (const s of m.deploy.amb) over.set(s.y * m.w + s.x, 'a');
  for (const l of m.lights) over.set(l.y * m.w + l.x, 'o');
  for (const s of m.deploy.p) over.set(s.y * m.w + s.x, 'p');
  for (const s of m.deploy.e) over.set(s.y * m.w + s.x, 'e');
  if (m.deploy.boss) over.set(m.deploy.boss.y * m.w + m.deploy.boss.x, 'B');
  const rows = [];
  for (let y = 0; y < m.h; y++) {
    let r = '';
    for (let x = 0; x < m.w; x++) { const k = y * m.w + x; r += over.get(k) || CH[m.cells[k]]; }
    rows.push(`   |${r}|`);
  }
  return rows.join('\n');
}

// ------------------------------------------------------------ les thèmes, un par un
const THEME_LIST = Object.keys(THEMES).filter((t) => !only || t === only);
const fogOut = { n: 0, fog: 0 };
let worst = 0, worstAt = '';
const times = [];
for (const theme of THEME_LIST) {
  const agg = { n: 0, err: 0, los: 0, inner: 0, dist: 0, flank: 0, fog: 0, sizes: {}, layouts: {}, shapes: {}, msgs: {} };
  let shown = 0;
  const seeds = SEED != null ? [+SEED] : Array.from({ length: N }, (_, i) => (i + 1) * 104729 + theme.length * 7);
  for (const seed of seeds) {
    const region = theme === 'foret' && seed % 3 === 0 ? 'prairie' : REGIONS[seed % 5];
    const kind = theme === 'hacienda' ? 'repaire' : KINDS[seed % KINDS.length];
    const col = 1 + (seed % 9);
    const t0 = performance.now();
    const m = makeBattle(seed, { region, col, kind, theme });
    const dt = performance.now() - t0;
    times.push(dt); if (dt > worst) { worst = dt; worstAt = `${theme} ${seed}`; }
    // déterminisme
    if (agg.n < 40) {
      const m2 = makeBattle(seed, { region, col, kind, theme });
      if (m2.w !== m.w || m2.h !== m.h || m2.cells.some((v, i) => v !== m.cells[i]) || JSON.stringify(m2.deploy) !== JSON.stringify(m.deploy) || m2.name !== m.name) agg.msgs['carte différente pour la même graine'] = (agg.msgs['carte différente pour la même graine'] || 0) + 1;
    }
    if (m.theme !== theme) agg.msgs[`thème ${m.theme} au lieu de ${theme}`] = 1;
    const { errs, st } = check(m);
    agg.n++;
    if (errs.length) agg.err++;
    for (const e of errs) { const key = e.replace(/[0-9.,]+/g, '#'); agg.msgs[key] = (agg.msgs[key] || 0) + 1; }
    agg.los += st.los; agg.inner += st.inner; agg.dist += st.dist; agg.flank += st.flank ? 1 : 0; agg.fog += m.fog ? 1 : 0;
    const sz = `${m.w}×${m.h}`; agg.sizes[sz] = (agg.sizes[sz] || 0) + 1;
    agg.layouts[m.layout] = (agg.layouts[m.layout] || 0) + 1;
    agg.shapes[m.shape] = (agg.shapes[m.shape] || 0) + 1;
    if (OUTDOOR.has(theme)) { fogOut.n++; if (m.fog) fogOut.fog++; }
    if (shown < SHOW && (FAILS ? errs.length > 0 : SEED != null || seed % 3 === shown % 3)) {
      shown++;
      console.log(`\n   ${m.name} — ${theme}/${m.layout} (${m.shape}) ${m.w}×${m.h} graine ${seed} ${region} col ${col} ${kind}${m.fog ? ` brouillard (${m.sky})` : ''}${m.dark ? ' noir' : ''}`);
      console.log(`   vue ${Math.round(st.los * 100)} %, encombrement ${Math.round(st.inner * 100)} % (brut ${Math.round(st.raw * 100)} %), écart ${Math.round(st.dist * 100)} %, couvert p ${st.coverP} e ${st.coverE}${errs.length ? `\n   ✗ ${errs.join('\n   ✗ ')}` : ''}`);
      console.log(draw(m));
    }
  }
  const ws = Object.keys(agg.sizes).map((s) => s.split('×').map(Number));
  const area = ws.map(([a, b]) => a * b);
  console.log(`\n=== ${theme} : ${agg.n} cartes, ${agg.err} en erreur — tailles ${Math.min(...ws.map((s) => s[0]))}-${Math.max(...ws.map((s) => s[0]))} × ${Math.min(...ws.map((s) => s[1]))}-${Math.max(...ws.map((s) => s[1]))} (${Math.min(...area)}-${Math.max(...area)} cases)`);
  console.log(`   vue au départ ${Math.round((agg.los / agg.n) * 100)} % en moyenne, encombrement ${Math.round((agg.inner / agg.n) * 100)} %, écart ${Math.round((agg.dist / agg.n) * 100)} %, flancs ${Math.round((agg.flank / agg.n) * 100)} %, brouillard ${Math.round((agg.fog / agg.n) * 100)} %`);
  console.log(`   gabarits : ${Object.entries(agg.layouts).map(([k, v]) => `${k} ${v}`).join(', ')} ; formes : ${Object.entries(agg.shapes).map(([k, v]) => `${k} ${v}`).join(', ')}`);
  for (const [k, v] of Object.entries(agg.msgs)) console.log(`   ✗ ${v} × ${k}`);
  if (agg.err || Object.keys(agg.msgs).length) fails++;
}
times.sort((a, b) => a - b);
console.log(`\nTemps : moyenne ${(times.reduce((a, b) => a + b, 0) / times.length).toFixed(1)} ms, 99 % sous ${times[Math.floor(times.length * 0.99)].toFixed(1)} ms, pire ${worst.toFixed(1)} ms (${worstAt})`);
if (times[Math.floor(times.length * 0.99)] > 30) fail('génération trop lente (plus de 30 ms)');
if (!only && SEED == null) {
  const r = fogOut.fog / fogOut.n;
  console.log(`Brouillard dehors : ${Math.round(r * 100)} %`);
  if (r < 0.2 || r > 0.42) fail('le brouillard dehors devrait tomber une fois sur trois environ');
}
console.log(fails ? `\n${fails} problème(s)` : '\nTout est bon.');
process.exit(fails ? 1 : 0);
