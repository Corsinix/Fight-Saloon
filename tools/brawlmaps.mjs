// Vérifie les cartes de « La mêlée » (public/js/brawlmaps/*.js) et les affiche en entier.
//   node tools/brawlmaps.mjs            toutes les cartes, erreurs et statistiques
//   node tools/brawlmaps.mjs gemmes     un seul mode
//   node tools/brawlmaps.mjs gemmes --show   avec le dessin complet (symétrie appliquée)
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'js', 'brawlmaps');
const { BRAWL_MAPS, MAP_SYM, MAP_DIM, BRAWL_ENVS, expandMap } = await import(pathToFileURL(path.join(ROOT, 'index.js')).href);

const args = process.argv.slice(2);
const show = args.includes('--show');
const only = args.find((a) => !a.startsWith('--'));
const WALK = new Set(['.', ',', '*', 'S']);
const ALLOWED = new Set(['.', ',', '#', 'x', '*', '~', 'S', 'P']);
let errors = 0, total = 0;

for (const [mode, maps] of Object.entries(BRAWL_MAPS)) {
  if (only && mode !== only) continue;
  const sym = MAP_SYM[mode];
  const [W, H] = MAP_DIM[sym];
  const [sw, sh] = sym === 'quad' ? [16, 11] : [17, 19];
  const ids = new Set();
  const envCount = {};
  console.log(`\n=== ${mode} (${sym}, ${W}x${H}) : ${maps.length} cartes`);
  for (const m of maps) {
    total++;
    const errs = [], warns = [];
    if (!m.id || ids.has(m.id)) errs.push(`id manquant ou en double : ${m.id}`);
    ids.add(m.id);
    if (!BRAWL_ENVS[m.env]) errs.push(`environnement inconnu : ${m.env}`);
    envCount[m.env] = (envCount[m.env] || 0) + 1;
    if (!m.name) errs.push('nom manquant');
    if (!Array.isArray(m.rows) || m.rows.length !== sh) errs.push(`il faut ${sh} lignes (${m.rows?.length})`);
    (m.rows || []).forEach((r, y) => {
      if (r.length !== sw) errs.push(`ligne ${y} : ${r.length} caractères au lieu de ${sw}`);
      for (const c of r) if (!ALLOWED.has(c)) errs.push(`ligne ${y} : caractère interdit « ${c} »`);
    });
    if (errs.length) { report(m, errs, warns); continue; }
    const full = expandMap(mode, m);
    const R = full.rows;
    const at = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? null : R[y][x]);
    const spawns = [];
    let walk = 0;
    const count = {};
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const c = R[y][x];
      count[c] = (count[c] || 0) + 1;
      if (c === 'S') spawns.push([x, y]);
      if (WALK.has(c)) walk++;
    }
    if (spawns.length !== 6) errs.push(`${spawns.length} départs au lieu de 6 (après symétrie)`);
    if (sym === 'half') {
      const left = spawns.filter(([x]) => x < 16);
      if (left.length !== 3) errs.push(`l'équipe de gauche a ${left.length} départs au lieu de 3`);
      if (left.some(([x]) => x > 5)) warns.push('départ de gauche loin du bord (x > 5)');
    } else {
      for (let i = 0; i < spawns.length; i++) for (let j = i + 1; j < spawns.length; j++) {
        const d = Math.hypot(spawns[i][0] - spawns[j][0], spawns[i][1] - spawns[j][1]);
        if (d < 8) errs.push(`départs trop proches (${spawns[i]} / ${spawns[j]})`);
      }
    }
    for (const [x, y] of spawns) {
      const open = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => WALK.has(at(x + dx, y + dy))).length;
      if (open < 2) errs.push(`départ ${x},${y} enfermé`);
    }
    // tout le sol doit être relié (sans casser de caisse)
    const seen = new Set();
    if (spawns.length) {
      const q = [spawns[0]];
      seen.add(spawns[0].join());
      while (q.length) {
        const [x, y] = q.pop();
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, ny = y + dy, k = `${nx},${ny}`;
          if (!seen.has(k) && WALK.has(at(nx, ny))) { seen.add(k); q.push([nx, ny]); }
        }
      }
      if (seen.size !== walk) {
        const lost = [];
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (WALK.has(R[y][x]) && !seen.has(`${x},${y}`)) lost.push(`${x},${y}`);
        errs.push(`${walk - seen.size} cases de sol inaccessibles : ${lost.slice(0, 8).join(' ')}${lost.length > 8 ? '…' : ''}`);
      }
    }
    const cx = Math.floor(W / 2), cy = Math.floor(H / 2);
    if (mode === 'colline') {
      for (let y = cy - 2; y <= cy + 2; y++) for (let x = cx - 2; x <= cx + 2; x++) if (!['.', ','].includes(R[y][x])) { errs.push(`colline : case ${x},${y} pas libre (${R[y][x]})`); }
    }
    if (mode === 'gemmes') {
      for (let y = cy - 1; y <= cy + 1; y++) for (let x = cx - 1; x <= cx + 1; x++) if (!['.', ','].includes(R[y][x])) errs.push(`gemmes : case ${x},${y} du filon pas libre (${R[y][x]})`);
    }
    const P = count.P || 0;
    if (mode === 'survie' && (P < 6 || P > 14)) errs.push(`${P} coffres à poudre (il en faut 6 à 14)`);
    if (mode !== 'survie' && P) errs.push('coffres à poudre (P) réservés au mode chacun pour soi');
    const pc = (c) => Math.round(((count[c] || 0) * 100) / (W * H));
    const stats = `murs ${pc('#')}% caisses ${pc('x')}% buissons ${pc('*')}% eau ${pc('~')}%`;
    if (pc('#') + pc('x') < 8) warns.push('très peu d\'abris');
    if (pc('#') + pc('x') + pc('~') > 38) warns.push('carte très encombrée');
    if (pc('*') < 4) warns.push('peu de buissons');
    if (pc('*') > 26) warns.push('beaucoup de buissons');
    report(m, errs, warns, stats);
    if (show) console.log(R.map((r) => `   ${r}`).join('\n'));
  }
  console.log(`   environnements : ${Object.entries(envCount).map(([e, n]) => `${e} ${n}`).join(', ')}`);
}
console.log(`\n${total} cartes, ${errors} en erreur`);
process.exit(errors ? 1 : 0);

function report(m, errs, warns, stats = '') {
  if (errs.length) errors++;
  console.log(`${errs.length ? 'ERREUR' : 'ok    '} ${m.id} [${m.env}] ${m.name || ''} ${stats}`);
  for (const e of errs) console.log(`         ✗ ${e}`);
  for (const w of warns) console.log(`         ~ ${w}`);
}
