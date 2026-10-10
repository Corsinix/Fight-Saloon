// Visite du mode histoire, pour la relecture : des aventures complètes transcrites (dialogues, cinématiques, choix,
// épisodes et résultats, dans l'ordre où les joueurs les voient), et la couverture des scripts (répliques jamais vues).
//   node tools/storytour.mjs [dossier]      (par défaut : %TEMP%/storytour)
// Écrit : un fichier par aventure (tour-NN-<fin>-<joueurs>.txt) et couverture.txt.
// Aventures : toutes gagnées, toutes perdues, puis au hasard (graines fixes) jusqu'à couvrir les trois fins,
// seul et à plusieurs, avec et sans La piste.
import fs from 'node:fs';
import path from 'node:path';
import { DATA } from '../public/js/story/data.js';
import { newRun, next, episodeOf, programs } from '../public/js/story/engine.js';
import { CUTS } from '../public/js/story/cuts.js';

const out = process.argv[2] || path.join(process.env.TEMP || '/tmp', 'storytour');
fs.mkdirSync(out, { recursive: true });
for (const f of fs.readdirSync(out)) if (/^tour-|^couverture/.test(f)) fs.rmSync(path.join(out, f));

const P = programs(DATA);
const seen = new Set(); // ops atteintes : `${script}:${pc}`, et répliques : `${script}:${pc}:${ligne}`
const name = (who) => (who === 'narr' ? 'NARRATEUR' : who === 'chef' ? 'LE CHEF (hôte)' : (DATA.cast[who]?.short || who).toUpperCase());
const fill = (s, humans) => String(s).replace(/\{bande\}/g, 'Les Testeurs').replace(/\{chef\}/g, 'Django').replace(/\{n\}/g, String(humans));

function tour(strategy, seed, humans, hasPiste) {
  let s = (seed * 2654435761) >>> 0;
  const R = () => ((s = (s * 1103515245 + 12345) >>> 0) / 4294967296);
  const env = { humans, has: (g) => hasPiste || g !== 'piste' };
  let res = next(newRun(DATA, { bande: 'Les Testeurs', seed }), null, DATA, env);
  const lines = [];
  let lastNode = null;
  for (let step = 0; step < 900; step++) {
    const st = res.state, w = res.wait;
    if (st.at === 'node' && st.node !== lastNode) {
      lastNode = st.node;
      const n = DATA.campaign.nodes[st.node];
      lines.push('', `== [acte ${st.act}] ${n.name} (${st.node})  — dollars ${st.vars.dollars}, alliés : ${DATA.campaign.allies.filter((f) => st.flags[f]).join(', ') || 'aucun'}`);
    }
    if (st.at === 'node') {
      const sc = DATA.campaign.nodes[st.node]?.script || st.node;
      seen.add(`${sc}:${st.pc}`);
      if (w.kind === 'talk') {
        const op = P[sc][st.pc];
        op.lines.forEach((l, i) => { if (w.lines.some((x) => x.text === l[1] && x.who === l[0])) seen.add(`${sc}:${st.pc}:${i}`); });
      }
    }
    let input;
    switch (w.kind) {
      case 'end': lines.push('', `== FIN : ${DATA.campaign.endings[w.ending]?.title} (${w.ending})`); return { lines, ending: w.ending, state: st };
      case 'talk': for (const l of w.lines) lines.push(`${name(l.who)} : ${fill(l.text, humans)}`); input = { type: 'next' }; break;
      case 'cut': lines.push(`[cinématique ${w.id}]${CUTS[w.id] ? '' : ' (INCONNUE)'}`); input = { type: 'next' }; break;
      case 'act': lines.push(`[acte ${w.n} : ${DATA.campaign.acts[w.n]?.title} — ${DATA.campaign.acts[w.n]?.sub}]`); input = { type: 'next' }; break;
      case 'ending': lines.push(`[fin : ${w.id}, cinématique ${DATA.campaign.endings[w.id]?.cut}, puis générique]`); input = { type: 'next' }; break;
      case 'choice': {
        const pick = strategy === 'first' ? w.opts[0] : strategy === 'last' ? w.opts[w.opts.length - 1] : w.opts[Math.floor(R() * w.opts.length)];
        lines.push(`>> ${w.board ? 'TABLEAU DES PRIMES' : 'CHOIX'} « ${fill(w.prompt, humans)} » : ${w.opts.map((o) => `[${o.id}] ${fill(o.label, humans)}`).join(' | ')}  →  ${pick.id}`);
        input = { type: 'choose', id: pick.id };
        break;
      }
      case 'map': {
        if (w.stuck) { lines.push('!! BLOQUÉ SUR LA CARTE'); return { lines, ending: 'bloque', state: st }; }
        // on évite les lieux de passage déjà vus (sinon les visites tournent en rond)
        const fresh = w.nodes.filter((id) => !st.done[id]);
        const list = fresh.length && R() > 0.15 ? fresh : w.nodes; // parfois un retour dans un lieu de passage
        const pick = list[Math.floor(R() * list.length)];
        lines.push('', `>> CARTE : ${w.nodes.join(', ')}  →  ${pick}`);
        input = { type: 'travel', node: pick };
        break;
      }
      case 'play': {
        const ep = episodeOf(DATA, w.ep);
        const labels = Object.keys(ep.results || { win: 1, lose: 1 });
        const label = strategy === 'win' ? (labels.includes('heros') ? 'heros' : 'win') : strategy === 'lose' ? 'lose' : labels[Math.floor(R() * labels.length)];
        lines.push(`>> ÉPISODE ${w.ep} (${ep.game}${ep.variant ? `, ${ep.variant}` : ''}) « ${ep.title} » — ${ep.caption || ''}`);
        input = { type: 'outcome', ep: w.ep, label };
        break;
      }
      case 'result': {
        const ep = episodeOf(DATA, w.ep);
        lines.push(`   RÉSULTAT ${w.label}${w.skipped ? ' (jeu absent)' : ''} : ${fill(w.skipped ? ep.skip?.text : ep.results?.[w.label], humans) || '(pas de texte)'}`);
        input = { type: 'next' };
        break;
      }
      default: input = { type: 'next' };
    }
    res = next(st, input, DATA, env);
    if (!res.ok) { lines.push(`!! entrée refusée ${JSON.stringify(input)}`); return { lines, ending: 'erreur', state: st }; }
  }
  lines.push('!! trop d’étapes');
  return { lines, ending: 'boucle', state: res.state };
}

const runs = [];
const plan = [
  ['win', 1, 1, true], ['win', 2, 4, true], ['lose', 3, 1, true], ['lose', 4, 3, false],
  ['first', 5, 1, true], ['last', 6, 2, true],
];
for (const p of plan) runs.push({ p, ...tour(...p) });
// au hasard jusqu'à avoir chaque fin seul et à plusieurs
const want = new Set(Object.keys(DATA.campaign.endings).flatMap((e) => [`${e}|1`, `${e}|n`]));
for (let seed = 100; seed < 4000 && want.size; seed++) {
  const humans = seed % 2 ? 1 : 2 + (seed % 4);
  const r = tour('random', seed, humans, seed % 3 !== 0);
  const k = `${r.ending}|${humans === 1 ? 1 : 'n'}`;
  if (want.has(k)) { want.delete(k); runs.push({ p: ['random', seed, humans, seed % 3 !== 0], ...r }); }
}
// couverture : beaucoup d'aventures au hasard, sans transcription
for (let seed = 5000; seed < 9000; seed++) tour('random', seed, 1 + (seed % 6), seed % 4 !== 0);

runs.forEach((r, k) => {
  const [strat, seed, humans, piste] = r.p;
  const file = `tour-${String(k + 1).padStart(2, '0')}-${r.ending}-${humans}j.txt`;
  const head = `Aventure ${k + 1} : stratégie ${strat}, graine ${seed}, ${humans} joueur(s), La piste ${piste ? 'présente' : 'absente'} → fin ${r.ending}\n`
    + `Drapeaux à la fin : ${Object.keys(r.state.flags).filter((f) => r.state.flags[f]).join(', ')}\n`;
  fs.writeFileSync(path.join(out, file), head + r.lines.join('\n') + '\n');
});

// répliques et étapes jamais atteintes
const cov = [];
let nOps = 0, nLines = 0, missOps = 0, missLines = 0;
for (const [sc, prog] of Object.entries(P)) prog.forEach((op, pc) => {
  if (!['talk', 'cut', 'play', 'choice', 'act', 'ending', 'board'].includes(op.op)) return; // seulement ce que les joueurs voient
  nOps++;
  if (!seen.has(`${sc}:${pc}`)) { missOps++; cov.push(`${sc}#${pc} ${op.op}${op.op === 'talk' ? ` : ${op.lines.map((l) => `${l[0]} « ${l[1].slice(0, 60)} »`).join(' / ')}` : op.ep ? ` ${op.ep}` : op.id ? ` ${op.id}` : ''}`); return; }
  if (op.op === 'talk') op.lines.forEach((l, i) => {
    nLines++;
    if (!seen.has(`${sc}:${pc}:${i}`)) { missLines++; cov.push(`${sc}#${pc} réplique ${i} jamais dite : ${l[0]} « ${l[1].slice(0, 70)} »${l[2]?.if ? ` (si ${JSON.stringify(l[2].if)})` : ''}`); }
  });
});
fs.writeFileSync(path.join(out, 'couverture.txt'), `Étapes atteintes : ${nOps - missOps}/${nOps} ; répliques dites : ${nLines - missLines}/${nLines} (sur ${4000 + runs.length} aventures)\n\n${cov.join('\n')}\n`);
console.log(`${runs.length} aventures transcrites dans ${out} (fins : ${runs.map((r) => r.ending).join(', ')})`);
console.log(`Couverture : étapes ${nOps - missOps}/${nOps}, répliques ${nLines - missLines}/${nLines} — détail dans couverture.txt`);
