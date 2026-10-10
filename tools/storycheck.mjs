// Validateur du mode histoire : références (lieux, épisodes, jeux, cinématiques, personnages, musiques),
// puis simulation de milliers d'aventures au hasard (résultats, choix, table de 1 à 6, jeux absents) :
// aucune ne doit rester bloquée, toutes les fins doivent être atteignables.
//   node tools/storycheck.mjs            rapport complet
//   node tools/storycheck.mjs --runs 20000
import { DATA } from '../public/js/story/data.js';
import { compileScript, newRun, next, episodeOf, availableNodes } from '../public/js/story/engine.js';
import { refsOf } from '../public/js/story/conds.js';
import { MODES } from '../public/js/worlds.js';

const args = process.argv.slice(2);
const RUNS = +(args[args.indexOf('--runs') + 1] || 0) || 5000;
const errors = [], warns = [];
const err = (m) => errors.push(m);
const warn = (m) => warns.push(m);

let CUTS = {}, PLAYLISTS = {};
try { ({ CUTS } = await import('../public/js/story/cuts.js')); } catch (e) { warn(`cuts.js non chargé (${e.message})`); }
try { ({ PLAYLISTS } = await import('../public/js/story/music.js')); } catch (e) { warn(`music.js non chargé (${e.message})`); }
const KNOWN_PLAYLISTS = new Set(['menu', 'game', ...Object.keys(MODES).map((m) => `mini-${m}`), ...Object.keys(PLAYLISTS || {})]);

const { campaign: C, episodes: E, jobs: J, cast: CAST, pools: POOLS, scripts: SC } = DATA;
const N = C.nodes;
const ENV_IDS = ['midi', 'aube', 'crepuscule', 'nuit', 'orage', 'poussiere', 'neige'];

// ---------------------------------------------------------------- références statiques
if (!N[C.start]) err(`start : lieu inconnu ${C.start}`);
for (const [id, a] of Object.entries(C.acts)) {
  if (a.cut && !CUTS[a.cut]) err(`acte ${id} : cinématique inconnue ${a.cut}`);
}
for (const [id, e] of Object.entries(C.endings)) {
  if (e.cut && !CUTS[e.cut]) err(`fin ${id} : cinématique inconnue ${e.cut}`);
  if (e.music && !KNOWN_PLAYLISTS.has(e.music)) warn(`fin ${id} : playlist inconnue ${e.music}`);
}
const checkCond = (c, where) => {
  if (c == null || typeof c === 'boolean') return;
  const r = refsOf(c);
  for (const ep of r.eps) if (!episodeOf(DATA, ep)) err(`${where} : épisode inconnu ${ep} (condition)`);
  for (const n of r.nodes) if (!N[n]) err(`${where} : lieu inconnu ${n} (condition)`);
};
for (const [id, n] of Object.entries(N)) {
  const w = `lieu ${id}`;
  if (!C.acts[n.act || 1]) err(`${w} : acte ${n.act} absent de campaign.acts`);
  if (!SC[n.script || id]) err(`${w} : script manquant (${n.script || id})`);
  if (n.fallback && !N[n.fallback]) err(`${w} : remplaçant inconnu ${n.fallback}`);
  for (const g of n.requires || []) if (!MODES[g]) err(`${w} : jeu inconnu ${g}`);
  if (!(n.x >= 8 && n.x <= 376 && n.y >= 20 && n.y <= 200)) warn(`${w} : position (${n.x}, ${n.y}) hors de la carte visible`);
  checkCond(n.unlock, w);
  checkCond(n.lockIf, w);
}
const near = Object.entries(N);
for (let i = 0; i < near.length; i++) for (let j = i + 1; j < near.length; j++) {
  const [a, na] = near[i], [b, nb] = near[j];
  if (Math.hypot(na.x - nb.x, na.y - nb.y) < 18 && na.act === nb.act && a !== nb.fallback && b !== na.fallback) warn(`lieux ${a} et ${b} trop proches sur la carte`);
}

const usedEps = new Set(), usedCuts = new Set(['generique']), usedGames = new Set(); // le générique suit chaque fin (scene.js)
const checkEp = (id, ep, w) => {
  if (!MODES[ep.game]) err(`${w} : jeu inconnu ${ep.game}`);
  else usedGames.add(ep.game);
  if (ep.env && !ENV_IDS.includes(ep.env)) err(`${w} : ambiance inconnue ${ep.env}`);
  for (const r of ep.rivals || []) {
    if (r.cast && !CAST[r.cast]) err(`${w} : rival inconnu ${r.cast}`);
    if (r.pool && !POOLS[r.pool]) err(`${w} : troupe inconnue ${r.pool}`);
  }
  const mode = ep.seats?.mode;
  if (mode && !['all', 'team', 'champion'].includes(mode)) err(`${w} : sièges inconnus ${mode}`);
  if (MODES[ep.game]?.max === 2 && mode !== 'champion') warn(`${w} : jeu à deux sans seats: { mode: 'champion' }`);
};
for (const [id, ep] of Object.entries(E)) checkEp(id, ep, `épisode ${id}`);
for (const j of J) {
  checkEp(j.id, j, `prime ${j.id}`);
  for (const wh of [].concat(j.where)) if (wh !== '*' && !N[wh]) err(`prime ${j.id} : lieu inconnu ${wh}`);
}

function walkSteps(steps, w) {
  for (const st of steps || []) {
    if ('talk' in st) for (const l of st.talk) {
      if (!Array.isArray(l) || typeof l[1] !== 'string') { err(`${w} : réplique mal formée ${JSON.stringify(l)}`); continue; }
      if (!['narr', 'chef'].includes(l[0]) && !CAST[l[0]]) err(`${w} : personnage inconnu « ${l[0]} »`);
      if (l[1].length > 170) warn(`${w} : réplique longue (${l[1].length} car.) : « ${l[1].slice(0, 40)}… »`);
      checkCond(l[2]?.if, w);
    }
    if ('play' in st) { usedEps.add(st.play); if (!episodeOf(DATA, st.play)) err(`${w} : épisode inconnu ${st.play}`); }
    if ('cut' in st) { usedCuts.add(st.cut); if (!CUTS[st.cut]) err(`${w} : cinématique inconnue ${st.cut}`); }
    if ('unlock' in st) for (const n of [].concat(st.unlock)) if (!N[n]) err(`${w} : unlock lieu inconnu ${n}`);
    if ('lock' in st) for (const n of [].concat(st.lock)) if (!N[n]) err(`${w} : lock lieu inconnu ${n}`);
    if ('goto' in st && !N[st.goto]) err(`${w} : goto lieu inconnu ${st.goto}`);
    if ('act' in st && !C.acts[st.act]) err(`${w} : acte inconnu ${st.act}`);
    if ('ending' in st && st.ending !== 'auto' && !C.endings[st.ending]) err(`${w} : fin inconnue ${st.ending}`);
    if ('music' in st && !KNOWN_PLAYLISTS.has(st.music)) warn(`${w} : playlist inconnue ${st.music}`);
    if ('if' in st) checkCond(st.if, w);
    if ('then' in st) { walkSteps(st.then, w); walkSteps(st.else, w); }
    if ('on' in st) for (const list of Object.values(st.on)) walkSteps(list, w);
    if ('choice' in st) for (const o of st.opts) { checkCond(o.if, w); walkSteps(o.then, w); }
  }
}
for (const [id, steps] of Object.entries(SC)) {
  try { compileScript(steps, id); } catch (e) { err(`script ${id} : ${e.message}`); }
  walkSteps(steps, `script ${id}`);
}
for (const id of Object.keys(E)) if (!usedEps.has(id)) warn(`épisode jamais joué : ${id}`);
for (const j of J) usedGames.add(j.game);
for (const id of Object.keys(CUTS)) if (!usedCuts.has(id) && !Object.values(C.acts).some((a) => a.cut === id) && !Object.values(C.endings).some((e) => e.cut === id)) warn(`cinématique jamais jouée : ${id}`);

// ---------------------------------------------------------------- sons : bruitages, signaux musicaux, voix
// (audio.js touche au navigateur à son chargement : on lit les noms dans son texte)
{
  const src = (await import('node:fs')).readFileSync(new URL('../public/js/audio.js', import.meta.url), 'utf8');
  const block = src.slice(src.indexOf('const SFX = {'), src.indexOf('\n};', src.indexOf('const SFX = {')));
  const SFX = new Set([...block.matchAll(/^ {2}([a-zA-Z0-9_]+)\(/gm)].map((m) => m[1]));
  const CUES = new Set(['aim', 'hit', 'death', 'blank', 'boss']);
  for (const [id, cut] of Object.entries(CUTS)) {
    (cut.beats || []).forEach((b, k) => {
      for (const s of [].concat(b.sfx || [])) if (!SFX.has(s)) err(`cinématique ${id}, temps ${k} : bruitage inconnu « ${s} »`);
      if (b.cue && !CUES.has(b.cue)) err(`cinématique ${id}, temps ${k} : signal musical inconnu « ${b.cue} »`);
      if (b.music && !KNOWN_PLAYLISTS.has(b.music)) warn(`cinématique ${id}, temps ${k} : playlist inconnue ${b.music}`);
      for (const who of [b.say?.[0], b.vo?.[0], ...[].concat(b.close || [])]) if (who && who !== 'narr' && !cut.actors?.[who]) err(`cinématique ${id}, temps ${k} : acteur inconnu « ${who} »`);
    });
    if (cut.music && !KNOWN_PLAYLISTS.has(cut.music)) warn(`cinématique ${id} : playlist inconnue ${cut.music}`);
    for (const [aid, a] of Object.entries(cut.actors || {})) if (a.cast && !CAST[a.cast]) err(`cinématique ${id} : acteur ${aid}, personnage inconnu ${a.cast}`);
  }
  for (const [id, c] of Object.entries(CAST)) if (c.voice && !SFX.has(c.voice)) err(`personnage ${id} : voix inconnue ${c.voice}`);
}

// ---------------------------------------------------------------- simulation
const R = (() => { let s = 12345; return () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648); })();
const pick = (a) => a[Math.floor(R() * a.length)];
const LABELS = ['win', 'lose', 'heros'];
const endings = {}, nodesSeen = new Set(), gamesPlayed = new Set();
let stuck = 0, loops = 0, maxSteps = 0, totalPlays = 0;
const stuckAt = {};
for (let r = 0; r < RUNS; r++) {
  const missing = new Set(R() < 0.3 ? ['piste'] : R() < 0.1 ? ['rts', 'bagarre'] : []);
  const env = { humans: 1 + Math.floor(R() * 6), has: (g) => !missing.has(g) };
  let state = newRun(DATA, { bande: 'Test', seed: r });
  let res = next(state, null, DATA, env);
  let steps = 0;
  for (; steps < 800; steps++) {
    const w = res.wait;
    state = res.state;
    if (state.node) nodesSeen.add(state.node);
    if (w.kind === 'end') { endings[w.ending] = (endings[w.ending] || 0) + 1; break; }
    let input;
    if (w.kind === 'map') {
      if (w.stuck) { stuck++; const k = Object.keys(state.done).sort().join(',').slice(-80); stuckAt[k] = (stuckAt[k] || 0) + 1; break; }
      input = { type: 'travel', node: pick(w.nodes) };
    } else if (w.kind === 'choice') input = { type: 'choose', id: pick(w.opts).id };
    else if (w.kind === 'play') {
      const ep = episodeOf(DATA, w.ep);
      gamesPlayed.add(ep.game);
      totalPlays++;
      input = { type: 'outcome', ep: w.ep, label: pick(LABELS) };
    } else input = { type: 'next' };
    res = next(state, input, DATA, env);
    if (!res.ok) { err(`simulation : entrée refusée ${JSON.stringify(input)} sur ${JSON.stringify(w).slice(0, 120)}`); break; }
  }
  if (steps >= 800) loops++;
  maxSteps = Math.max(maxSteps, steps);
}
for (const id of Object.keys(C.endings)) if (!endings[id]) err(`fin jamais atteinte : ${id}`);
for (const id of Object.keys(N)) if (!nodesSeen.has(id)) warn(`lieu jamais visité en simulation : ${id}`);
if (stuck) err(`${stuck} aventures bloquées sur la carte (aucun lieu disponible). Lieux finis : ${JSON.stringify(stuckAt).slice(0, 300)}`);
if (loops) err(`${loops} aventures sans fin (> 800 étapes)`);
const unused = Object.keys(MODES).filter((m) => !usedGames.has(m));

console.log(`Mode histoire « ${C.title} » v${C.version} : ${Object.keys(N).length} lieux, ${Object.keys(E).length} épisodes, ${J.length} primes, ${Object.keys(CUTS).length} cinématiques`);
console.log(`Simulation : ${RUNS} aventures, ${(totalPlays / RUNS).toFixed(1)} épisodes en moyenne, ${maxSteps} étapes au plus`);
console.log(`Fins : ${Object.entries(endings).map(([k, v]) => `${k} ${((v / RUNS) * 100).toFixed(1)} %`).join(', ')}`);
console.log(`Jeux joués en simulation : ${[...gamesPlayed].sort().join(', ')}`);
if (unused.length) console.log(`Jeux absents de l'histoire : ${unused.join(', ')}`);
for (const w of warns) console.log(`  attention : ${w}`);
for (const e of errors) console.log(`  ERREUR : ${e}`);
console.log(errors.length ? `${errors.length} erreur(s).` : 'OK.');
process.exit(errors.length ? 1 : 0);
