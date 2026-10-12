// Banc d'essai de la simulation de « La ville », sans navigateur : des maires IA (villeai.js) jouent 30 ans sur
// plusieurs graines ; on vérifie les invariants, le déterminisme (lockstep) et la sauvegarde, et on affiche de quoi
// équilibrer le jeu.
//   node tools/villesim-check.mjs [--n=10] [--players=1] [--seed=123] [--years=30] [--quiet]
//   --players=1..4 : toutes les tailles de table de 1 à 4
// Code de sortie 1 si un invariant casse.
import { World } from '../public/js/villesim.js';
import { aiCommands } from '../public/js/villeai.js';
import { BUILDINGS, GOOD_IDS, dateOf } from '../public/js/villekit.js';

const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.split('=')[1] : d; };
const N = +arg('n', 10), YEARS = +arg('years', 30), QUIET = process.argv.includes('--quiet');
const pl = arg('players', '1');
const SIZES = pl.includes('..') ? (([a, b]) => Array.from({ length: b - a + 1 }, (_, i) => a + i))(pl.split('..').map(Number)) : [+pl];
const SEED0 = +arg('seed', 1000);

// la simulation ne doit jamais tirer au hasard hors de son générateur
Math.random = () => { throw new Error('Math.random appelé dans la simulation'); };

let fails = 0;
const fail = (msg) => { fails++; console.log('  ✗ ' + msg); };

function invariants(w, tag) {
  const homes = new Map(), jobs = new Map();
  for (const c of w.C) {
    for (const v of [c.hap, c.age, ...c.need]) if (!Number.isFinite(v)) return fail(`${tag} : NaN chez l'habitant ${c.id}`);
    if (c.home >= 0) homes.set(c.home, (homes.get(c.home) || 0) + 1);
    if (c.job >= 0) jobs.set(c.job, (jobs.get(c.job) || 0) + 1);
    if (c.home >= 0 && !w.byId.has(c.home)) return fail(`${tag} : logement fantôme`);
  }
  for (const [id, k] of homes) { const b = w.byId.get(id); if (b && k > w.hcap(b)) return fail(`${tag} : ${b.t} surpeuplé (${k})`); }
  for (const [id, k] of jobs) { const b = w.byId.get(id); if (b && k > BUILDINGS[b.t].jobs) return fail(`${tag} : ${b.t} trop d'employés (${k})`); }
  for (const t of w.towns) {
    if (!Number.isFinite(t.money)) return fail(`${tag} : trésor NaN`);
    for (const g of GOOD_IDS) if (!(t.goods[g] >= 0) || !Number.isInteger(t.goods[g])) return fail(`${tag} : stock ${g} = ${t.goods[g]}`);
  }
  for (let i = 0; i < w.depQ.length; i++) if (w.depQ[i] > 65535) return fail(`${tag} : gisement négatif`);
}

// une partie : renvoie le journal des commandes (pour la rejouer) et le résumé
function play(seed, players, years, log = null, check = null) {
  const ps = Array.from({ length: players }, (_, i) => ({ key: `b${i}`, name: `IA${i}`, bot: true }));
  const w = new World(seed, ps, 'rivalite');
  const journal = log || [];
  let li = 0;
  const end = years * 360;
  while (w.day < end && !w.result) {
    // les commandes de ce jour (rejouées) ou celles de l'IA (une fois par mois)
    if (log) { while (li < log.length && log[li][0] === w.day) { w.apply(log[li][1], log[li][2]); li++; } }
    else if (w.day % 30 === 0) {
      for (let p = 0; p < players; p++) for (const c of aiCommands(w, p)) { journal.push([w.day, p, c]); w.apply(p, c); }
    }
    w.step();
    w.ev.length = 0;
    if (check && w.day % 30 === 0) check(w);
  }
  return { w, journal };
}

const t0 = Date.now();
const rows = [];
for (const players of SIZES) {
  for (let k = 0; k < N; k++) {
    const seed = SEED0 + k * 7919 + players;
    const hashes = [];
    let y = 0;
    const { w, journal } = play(seed, players, YEARS, null, (w) => {
      hashes.push(w.hash());
      invariants(w, `graine ${seed}`);
      const { year } = dateOf(w.day);
      if (!QUIET && k === 0 && players === SIZES[0] && w.day % 360 === 0) {
        const t = w.towns[0];
        console.log(`  ${year}  pop ${String(t.stat.pop).padStart(4)}  $ ${String(Math.round(t.money)).padStart(7)}  bonheur ${String(t.stat.hap).padStart(3)}  nourris ${(t.stat.fed * 100).toFixed(0).padStart(3)} %  chômeurs ${String(t.stat.jobless).padStart(3)}  ère ${t.era}  bât. ${w.B.filter((b) => b.p === 0).length}  approb. ${t.ap.join('/')}  besoins ${[0, 1, 2, 3, 4, 5, 6, 7].map((k) => Math.round(w.C.reduce((s, c) => s + c.need[k], 0) / Math.max(1, w.C.length))).join('/')}`);
      }
      y++;
    });
    // déterminisme : la même partie rejouée depuis son journal donne les mêmes empreintes, mois après mois
    let m = 0, diverged = false;
    play(seed, players, YEARS, journal, (w2) => { if (!diverged && w2.hash() !== hashes[m]) { diverged = true; fail(`graine ${seed} : divergence au mois ${m}`); } m++; });
    // sauvegarde : à mi-partie, sérialiser puis recharger donne la même World, qui continue pareil
    const half = play(seed, players, Math.min(YEARS, 8), null).w;
    const copy = World.load(JSON.parse(JSON.stringify(half.serialize())));
    if (copy.hash() !== half.hash()) fail(`graine ${seed} : sauvegarde rechargée différente`);
    for (let d = 0; d < 360; d++) { half.step(); copy.step(); }
    if (copy.hash() !== half.hash()) fail(`graine ${seed} : la partie rechargée diverge`);
    const size = JSON.stringify(half.serialize()).length;
    const towns = w.towns.map((t) => ({ pop: t.stat.pop, money: Math.round(t.money), hap: t.stat.hap, lost: t.lost, era: t.era, score: w.score(t.p) }));
    rows.push({ seed, players, year: dateOf(w.day).year, towns, size, result: w.result });
  }
}
console.log('\ngraine  joueurs  fin    ' + 'pop/argent/bonheur/ère (perdu) par ville');
for (const r of rows) console.log(`${String(r.seed).padEnd(7)} ${String(r.players).padEnd(8)} ${r.year}   ` + r.towns.map((t) => `${t.pop}/${t.money}/${t.hap}/${t.era}${t.lost ? ` (${t.lost})` : ''}`).join('   ') + `   [${(r.size / 1024).toFixed(0)} Ko]`);
const all = rows.flatMap((r) => r.towns);
const alive = all.filter((t) => !t.lost).length;
console.log(`\nvilles en vie à la fin : ${alive}/${all.length} (${Math.round((alive * 100) / all.length)} %)`);
console.log(`population moyenne : ${Math.round(all.reduce((s, t) => s + t.pop, 0) / all.length)}`);
console.log(`durée : ${((Date.now() - t0) / 1000).toFixed(1)} s`);
if (alive * 100 < all.length * 70) fail('moins de 70 % des villes de l\'IA survivent : jeu trop dur (ou IA trop faible)');
console.log(fails ? `\n${fails} problème(s)` : '\nTout est bon.');
process.exit(fails ? 1 : 0);
