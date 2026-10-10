// Moteur du mode histoire : machine à états pure (pas de DOM, pas de réseau ; testée sous node par tools/storycheck.mjs).
// L'hôte la fait avancer (story/host.js) ; chaque client affiche l'attente en cours (story/scene.js).
//
// Données (data) : { campaign, scripts, episodes, jobs, cast } — voir story/data.js.
// Chaque lieu de la carte a un script : une liste d'étapes, compilée en programme linéaire (sauts) :
//   { talk: [[qui, texte, { mood, if, view }], …] } dialogue ; qui : id du casting, 'narr' (narrateur), 'chef' (l'hôte) ;
//                                                   view : 'lettre' (la réplique est lue sur une lettre, en gros plan)
//   { cut: 'id', once: true }                       cinématique (story/cuts.js) ; once : pas rejouée si déjà vue
//   { play: 'episode' }                             mini-jeu (story/episodes.js) ; son résultat s'affiche ensuite
//   { on: { win: […], 'lose,heros': […], else: […] } }   selon le résultat du dernier épisode
//   { if: C, then: […], else: […] }                 selon une condition (story/conds.js)
//   { …n'importe quelle étape…, if: C }             étape jouée seulement si C
//   { choice: 'question', who, key, opts: [{ id, label, if, then: […] }] }   embranchement (vote à plusieurs)
//   { set: { drapeau: valeur } }  { add: { dollars: 50 } }
//   { unlock: ['lieu'] }  { lock: ['lieu'] }       lieux de la carte
//   { goto: 'lieu' }                                enchaîne directement sur le script d'un autre lieu
//   { map: true }                                   retour à la carte (implicite en fin de script)
//   { act: 2 }                                      changement d'acte (carton titre)
//   { ending: 'id' | 'auto' }                       fin de l'aventure (auto : la première de campaign.endings qui passe)
//   { save: 'étiquette' }                           point de reprise (chapitre)
//   { music: 'story-tension' }                      playlist de fond
//   { board: true }                                 tableau des primes (story/jobs.js) du lieu
// Nouveau type d'étape : une entrée dans COMPILE (et dans RUN / NEXT s'il attend les joueurs).
import { test, alliesOf } from './conds.js';

export const STORY_V = 1; // version de la forme de l'état (sauvegardes : voir save.js)
const LEAVE = '_leave';

export const episodeOf = (data, id) => data.episodes[id] || data.jobs.find((j) => j.id === id) || null;

// ---------------------------------------------------------------- compilation
const COMPILE = {
  talk: (st, k) => k.emit({ op: 'talk', lines: st.talk }),
  cut: (st, k) => k.emit({ op: 'cut', id: st.cut, once: !!st.once }),
  play: (st, k) => k.emit({ op: 'play', ep: st.play }),
  set: (st, k) => k.emit({ op: 'set', set: st.set }),
  add: (st, k) => k.emit({ op: 'add', add: st.add }),
  unlock: (st, k) => k.emit({ op: 'unlock', nodes: [].concat(st.unlock) }),
  lock: (st, k) => k.emit({ op: 'lock', nodes: [].concat(st.lock) }),
  goto: (st, k) => k.emit({ op: 'goto', node: st.goto }),
  map: (st, k) => k.emit({ op: 'map' }),
  act: (st, k) => k.emit({ op: 'act', n: st.act }),
  ending: (st, k) => k.emit({ op: 'ending', id: st.ending }),
  save: (st, k) => k.emit({ op: 'save', label: st.save }),
  music: (st, k) => k.emit({ op: 'music', id: st.music }),
  board: (st, k) => k.emit({ op: 'board' }),
  on: (st, k) => {
    const sw = k.emit({ op: 'sw', cases: {}, def: -1 });
    const ends = [];
    for (const [labels, list] of Object.entries(st.on)) {
      if (labels === 'else') continue;
      for (const l of labels.split(',')) k.ops[sw].cases[l.trim()] = k.ops.length;
      k.block(list);
      ends.push(k.emit({ op: 'jmp', to: -1 }));
    }
    k.ops[sw].def = k.ops.length;
    k.block(st.on.else);
    for (const e of ends) k.ops[e].to = k.ops.length;
  },
  choice: (st, k) => {
    const c = k.emit({ op: 'choice', prompt: st.choice, who: st.who || null, key: st.key || null, opts: [] });
    const ends = [];
    for (const o of st.opts) {
      k.ops[c].opts.push({ id: o.id, label: o.label, if: o.if, to: k.ops.length });
      k.block(o.then);
      ends.push(k.emit({ op: 'jmp', to: -1 }));
    }
    for (const e of ends) k.ops[e].to = k.ops.length;
    k.ops[c].end = k.ops.length; // aucune option possible : on passe le choix
  },
};
const MAIN = Object.keys(COMPILE);

export function compileScript(steps, where = '?') {
  const ops = [];
  const k = {
    ops,
    emit: (op) => { ops.push(op); return ops.length - 1; },
    block: (list) => { for (const st of list || []) one(st); },
  };
  function one(st) {
    if ('then' in st) { // { if, then, else }
      const j = k.emit({ op: 'jz', cond: st.if, to: -1 });
      k.block(st.then);
      if (st.else) {
        const e = k.emit({ op: 'jmp', to: -1 });
        ops[j].to = ops.length;
        k.block(st.else);
        ops[e].to = ops.length;
      } else ops[j].to = ops.length;
      return;
    }
    if (st.if !== undefined) { // étape conditionnelle
      const { if: cond, ...rest } = st;
      const j = k.emit({ op: 'jz', cond, to: -1 });
      one(rest);
      ops[j].to = ops.length;
      return;
    }
    const key = MAIN.find((m) => m in st);
    if (!key) throw new Error(`${where} : étape inconnue ${JSON.stringify(st).slice(0, 80)}`);
    COMPILE[key](st, k);
  }
  k.block(steps);
  return ops;
}

const progCache = new WeakMap();
export function programs(data) {
  let p = progCache.get(data.scripts);
  if (!p) {
    p = {};
    for (const [id, steps] of Object.entries(data.scripts)) p[id] = compileScript(steps, id);
    progCache.set(data.scripts, p);
  }
  return p;
}

// ---------------------------------------------------------------- état
export function newRun(data, { bande = 'La Bande', seed = 1 } = {}) {
  const start = data.campaign.start;
  return {
    v: STORY_V, cid: data.campaign.id, cv: data.campaign.version,
    bande, seed,
    at: 'node', node: start, here: start, pc: 0, act: data.campaign.nodes[start]?.act || 1,
    flags: {}, vars: { dollars: 0 }, visited: { [start]: 1 }, done: {}, unlocked: [start],
    outcomes: {}, last: null, choices: {}, seen: {}, res: null, job: null,
    ending: null, ckpt: null, music: null, seq: 0, playMs: 0,
  };
}

const jobsAt = (s, data, env, node) => data.jobs.filter((j) => (j.where === '*' || [].concat(j.where).includes(node))
  && (!j.game || !env.has || env.has(j.game)) && (!j.once || s.outcomes[j.id] == null) && test(j.if, s, data, env));

// Lieux où l'on peut aller depuis la carte. Un lieu dont le jeu manque cède la place à son remplaçant (fallback).
export function availableNodes(s, data, env = {}) {
  const N = data.campaign.nodes;
  const out = [];
  for (const [id, n] of Object.entries(N)) {
    if (n.fallbackOnly) continue; // ne s'affiche qu'à la place d'un autre
    if ((n.act || 1) > s.act) continue;
    if (!s.unlocked.includes(id) && !(n.unlock && test(n.unlock, s, data, env))) continue;
    if (n.lockIf && test(n.lockIf, s, data, env)) continue;
    const ok = (x) => !x.requires || !env.has || x.requires.every((g) => env.has(g));
    let at = id;
    if (!ok(n)) {
      if (!n.fallback || !ok(N[n.fallback])) continue;
      at = n.fallback;
    }
    const node = N[at];
    if (s.done[at] && !node.repeat) continue;
    if (s.done[id] && !n.repeat) continue;
    if (!out.includes(at)) out.push(at);
  }
  return out;
}

function finishNode(s) {
  if (s.node) s.done[s.node] = true;
  s.at = 'map';
  s.node = null;
  s.pc = 0;
}

function enter(s, node) {
  s.at = 'node';
  s.node = node;
  s.pc = 0;
  s.here = node; // dernier lieu visité : le pion de la bande sur la carte
  s.last = null; // { on } ne lit que le résultat d'un épisode joué dans ce lieu
  s.visited[node] = (s.visited[node] || 0) + 1;
  if (!s.unlocked.includes(node)) s.unlocked.push(node);
}

const lineOk = (l, s, data, env) => !l[2]?.if || test(l[2].if, s, data, env);

// Attente en cours (exécute d'abord les étapes qui n'attendent personne). Idempotent une fois à l'attente.
function run(s, data, env, fx) {
  const P = programs(data);
  for (let guard = 0; guard < 5000; guard++) {
    if (s.at === 'end') return { kind: 'end', ending: s.ending };
    if (s.at === 'map') {
      const nodes = availableNodes(s, data, env);
      return { kind: 'map', nodes, stuck: !nodes.length };
    }
    const prog = P[data.campaign.nodes[s.node]?.script || s.node];
    const op = prog?.[s.pc];
    if (!op) { finishNode(s); continue; }
    switch (op.op) {
      case 'talk': {
        const lines = op.lines.filter((l) => lineOk(l, s, data, env)).map(([who, text, o]) => ({ who, text, mood: o?.mood || null, view: o?.view || null }));
        if (lines.length) return { kind: 'talk', lines };
        s.pc++;
        break;
      }
      case 'cut':
        if (op.once && s.seen[op.id]) { s.pc++; break; }
        return { kind: 'cut', id: op.id };
      case 'play': {
        if (s.res) return { kind: 'result', ...s.res };
        const ep = episodeOf(data, op.ep);
        if (!ep) throw new Error(`épisode inconnu : ${op.ep}`);
        if (ep.game && env.has && !env.has(ep.game)) { // jeu absent : résultat par défaut, la suite continue
          record(s, data, op.ep, ep.skip?.as || 'win', true);
          return { kind: 'result', ...s.res };
        }
        return { kind: 'play', ep: op.ep };
      }
      case 'choice': {
        const opts = op.opts.filter((o) => test(o.if, s, data, env)).map((o) => ({ id: o.id, label: o.label }));
        if (!opts.length) { s.pc = op.end ?? s.pc + 1; break; }
        return { kind: 'choice', prompt: op.prompt, who: op.who, opts };
      }
      case 'jmp': s.pc = op.to; break;
      case 'jz': s.pc = test(op.cond, s, data, env) ? s.pc + 1 : op.to; break;
      case 'sw': s.pc = op.cases[s.last] ?? op.def; break;
      case 'set': Object.assign(s.flags, op.set); s.pc++; break;
      case 'add':
        for (const [k, v] of Object.entries(op.add)) s.vars[k] = Math.max(0, (s.vars[k] || 0) + v);
        s.pc++;
        break;
      case 'unlock':
        for (const n of op.nodes) if (!s.unlocked.includes(n)) s.unlocked.push(n);
        s.pc++;
        break;
      case 'lock':
        s.unlocked = s.unlocked.filter((n) => !op.nodes.includes(n));
        for (const n of op.nodes) s.done[n] = true;
        s.pc++;
        break;
      case 'goto':
        if (s.node) s.done[s.node] = true;
        enter(s, op.node);
        fx.push({ arrive: op.node });
        break;
      case 'map': finishNode(s); break;
      case 'act':
        s.act = Math.max(s.act, op.n);
        return { kind: 'act', n: op.n };
      case 'ending': {
        const id = op.id === 'auto' ? pickEnding(s, data, env) : op.id;
        s.ending = id;
        return { kind: 'ending', id };
      }
      case 'save':
        s.ckpt = op.label;
        fx.push({ save: op.label });
        s.pc++;
        break;
      case 'music':
        s.music = op.id;
        fx.push({ music: op.id });
        s.pc++;
        break;
      case 'board': {
        if (s.job) {
          if (s.res) return { kind: 'result', ...s.res };
          return { kind: 'play', ep: s.job };
        }
        const jobs = jobsAt(s, data, env, s.node);
        if (!jobs.length) { s.pc++; break; }
        return {
          kind: 'choice', board: true, prompt: 'LE TABLEAU DES PRIMES', who: null,
          opts: [...jobs.map((j) => ({ id: j.id, label: j.title })), { id: LEAVE, label: 'Reprendre la route' }],
        };
      }
      default: throw new Error(`opération inconnue : ${op.op}`);
    }
  }
  throw new Error('mode histoire : boucle sans fin dans le script');
}

export function pickEnding(s, data, env) {
  for (const [id, e] of Object.entries(data.campaign.endings)) if (test(e.when, s, data, env)) return id;
  return Object.keys(data.campaign.endings).pop();
}

function record(s, data, epId, label, skipped = false) {
  const ep = episodeOf(data, epId);
  s.outcomes[epId] = label;
  s.last = label;
  s.res = { ep: epId, label, skipped };
  const fx = ep?.effects?.[label];
  if (fx?.set) Object.assign(s.flags, fx.set);
  if (fx?.add) for (const [k, v] of Object.entries(fx.add)) s.vars[k] = Math.max(0, (s.vars[k] || 0) + v);
  if (ep?.reward && label !== 'lose') for (const [k, v] of Object.entries(ep.reward.add || {})) s.vars[k] = Math.max(0, (s.vars[k] || 0) + v);
}

// Réponse des joueurs à l'attente en cours ; false si elle ne correspond pas (message en retard, doublon).
function apply(s, wait, input, data, env) {
  const P = programs(data);
  const op = s.at === 'node' ? P[data.campaign.nodes[s.node]?.script || s.node]?.[s.pc] : null;
  switch (input.type) {
    case 'next':
      if (wait.kind === 'talk') { s.pc++; return true; }
      if (wait.kind === 'cut') { s.seen[wait.id] = 1; s.pc++; return true; }
      if (wait.kind === 'act') { s.pc++; return true; }
      if (wait.kind === 'result') {
        s.res = null;
        if (op?.op === 'board') s.job = null; else s.pc++;
        return true;
      }
      if (wait.kind === 'ending') { s.at = 'end'; return true; }
      return false;
    case 'choose': {
      if (wait.kind !== 'choice' || !wait.opts.some((o) => o.id === input.id)) return false;
      if (wait.board) {
        if (input.id === LEAVE) s.pc++;
        else s.job = input.id;
        return true;
      }
      const o = op.opts.find((x) => x.id === input.id);
      if (op.key) s.choices[op.key] = input.id;
      s.pc = o.to;
      return true;
    }
    case 'travel':
      if (wait.kind !== 'map' || !wait.nodes.includes(input.node)) return false;
      enter(s, input.node);
      return true;
    case 'outcome':
      if (wait.kind !== 'play' || wait.ep !== input.ep) return false;
      record(s, data, input.ep, input.label);
      return true;
    default: return false;
  }
}

// Fait avancer l'aventure : input null = simple lecture de l'attente en cours (après un chargement).
// Renvoie { state, wait, fx, ok } ; state est une copie (l'ancienne reste intacte).
export function next(state, input, data, env = {}) {
  const s = structuredClone(state);
  const fx = [];
  let wait = run(s, data, env, fx);
  let ok = true;
  if (input) {
    ok = apply(s, wait, input, data, env);
    if (ok) {
      s.seq++;
      wait = run(s, data, env, fx);
    }
  }
  return { state: s, wait, fx, ok };
}

export const allies = alliesOf;
