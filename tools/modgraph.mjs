// Poids du démarrage : parcourt les imports statiques depuis un module (main.js par défaut)
// et compte les modules et les octets chargés avant que la page puisse tourner.
// Les import() dynamiques (jeux chargés à la demande) sont listés à part.
//   node tools/modgraph.mjs [public/js/main.js] [--list]
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const list = args.includes('--list');
const entry = path.resolve(args.find((a) => !a.startsWith('--')) || 'public/js/main.js');
const STATIC = /(?:^|[;\n])\s*(?:import|export)\s*(?:[\w*{}\s,$]+?\s*from\s*)?['"]([^'"]+)['"]/g;
const DYNAMIC = /import\(\s*['"]([^'"]+)['"]\s*\)/g;

const seen = new Map(); // fichier -> octets
const remote = new Set();
const lazy = new Set();
function walk(file) {
  if (seen.has(file)) return;
  const src = fs.readFileSync(file, 'utf8');
  seen.set(file, Buffer.byteLength(src));
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  for (const [, spec] of code.matchAll(STATIC)) {
    if (/^https?:/.test(spec)) remote.add(spec);
    else walk(path.resolve(path.dirname(file), spec));
  }
  for (const [, spec] of code.matchAll(DYNAMIC)) {
    if (/^https?:/.test(spec)) remote.add(`${spec} (dynamique)`);
    else lazy.add(path.resolve(path.dirname(file), spec));
  }
}
walk(entry);

const kb = (n) => `${(n / 1024).toFixed(1)} Ko`;
const total = [...seen.values()].reduce((a, b) => a + b, 0);
const rel = (f) => path.relative(process.cwd(), f).replace(/\\/g, '/');
console.log(`démarrage depuis ${rel(entry)} : ${seen.size} modules, ${kb(total)}`);
if (list) for (const [f, n] of [...seen].sort((a, b) => b[1] - a[1])) console.log(`  ${kb(n).padStart(10)}  ${rel(f)}`);
for (const r of remote) console.log(`  + distant : ${r}`);
const later = [...lazy].filter((f) => !seen.has(f));
if (later.length) console.log(`chargés à la demande (import dynamique) : ${later.map(rel).join(', ')}`);
