// Sauvegardes du mode histoire : dans le navigateur de l'hôte (localStorage), 5 emplacements.
//   bs-story:index        résumé des emplacements (affiches du menu), sans avoir à tout relire
//   bs-story:slot:<id>    { v, id, name, cid, cv, created, updated, playMs, state, checkpoints, sum }
//   bs-story:meta         ce qui vaut pour toutes les sauvegardes : fins découvertes
// Une sauvegarde abîmée (JSON illisible, somme de contrôle fausse, forme inattendue) n'empêche jamais le jeu de
// démarrer : elle est signalée (bad) et ne peut qu'être supprimée ou exportée. Stockage refusé (navigation privée,
// plein) : on garde en mémoire le temps de la session, et la sauvegarde le dit (memoryOnly).
import { STORY_V } from './engine.js';

export const MAX_SLOTS = 5;
const SAVE_V = 1;
const IDX = 'bs-story:index', SLOT = 'bs-story:slot:', META = 'bs-story:meta';
const MAX_CKPT = 8;

const mem = new Map();
export let memoryOnly = false;
const store = {
  get(k) {
    if (memoryOnly) return mem.get(k) ?? null;
    try { return localStorage.getItem(k); } catch { memoryOnly = true; return mem.get(k) ?? null; }
  },
  set(k, v) {
    mem.set(k, v);
    if (memoryOnly) return false;
    try { localStorage.setItem(k, v); return true; } catch (e) {
      if (e?.name === 'QuotaExceededError') throw new Error('Sauvegarde impossible : le stockage du navigateur est plein.');
      memoryOnly = true;
      return false;
    }
  },
  del(k) {
    mem.delete(k);
    try { localStorage.removeItem(k); } catch {}
  },
};

// somme de contrôle FNV-1a 32 bits de l'état (détecte une sauvegarde tronquée ou modifiée à la main)
function hash32(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(36);
}
const sumOf = (state) => hash32(JSON.stringify(state));

// Migrations de la forme des sauvegardes : MIGRATIONS[v](slot) -> slot en version v + 1
const MIGRATIONS = {};

const validState = (s) => s && typeof s === 'object' && typeof s.at === 'string' && s.flags && typeof s.flags === 'object'
  && Array.isArray(s.unlocked) && s.outcomes && s.visited && s.done && Number.isFinite(s.act);

function readIndex() {
  try {
    const v = JSON.parse(store.get(IDX) || '[]');
    return Array.isArray(v) ? v.filter((e) => e && typeof e.id === 'string') : [];
  } catch { return []; }
}
const writeIndex = (list) => store.set(IDX, JSON.stringify(list));

// Résumé affiché sur l'affiche d'un emplacement
export function summarize(slot, data) {
  const s = slot.state;
  const node = data?.campaign.nodes[s.here || s.node];
  return {
    id: slot.id, name: slot.name, cid: slot.cid, updated: slot.updated, playMs: slot.playMs || 0,
    act: s.act, place: node ? node.name : '', ending: s.ending || null, done: s.at === 'end',
    party: slot.party || [], dollars: s.vars?.dollars || 0,
    allies: (data?.campaign.allies || []).filter((f) => s.flags[f]),
    chapters: (slot.checkpoints || []).length,
  };
}

// Emplacements, du plus récent au plus ancien ; les abîmés gardent leur place avec bad: true
export function listSlots(data) {
  return readIndex().map((e) => {
    const r = loadSlot(e.id);
    return r.ok ? summarize(r.slot, data) : { id: e.id, name: e.name || 'Sauvegarde', bad: true, why: r.why, updated: e.updated || 0 };
  }).sort((a, b) => (b.updated || 0) - (a.updated || 0));
}

export function loadSlot(id) {
  const raw = store.get(SLOT + id);
  if (!raw) return { ok: false, why: 'introuvable' };
  let slot;
  try { slot = JSON.parse(raw); } catch { return { ok: false, why: 'illisible', raw }; }
  if (!slot || typeof slot !== 'object') return { ok: false, why: 'illisible', raw };
  while (slot.v < SAVE_V && MIGRATIONS[slot.v]) slot = MIGRATIONS[slot.v](slot);
  if (slot.v !== SAVE_V || !validState(slot.state)) return { ok: false, why: 'forme inattendue', raw };
  if (slot.sum !== sumOf(slot.state)) return { ok: false, why: 'somme de contrôle fausse', raw };
  if (slot.state.v !== STORY_V) return { ok: false, why: 'version de l’aventure trop récente', raw };
  return { ok: true, slot };
}

export function rawSlot(id) { return store.get(SLOT + id); }

function writeSlot(slot) {
  slot.sum = sumOf(slot.state);
  store.set(SLOT + slot.id, JSON.stringify(slot));
  const list = readIndex().filter((e) => e.id !== slot.id);
  list.push({ id: slot.id, name: slot.name, updated: slot.updated });
  writeIndex(list);
}

export function createSlot({ name, state, party = [] }) {
  if (readIndex().length >= MAX_SLOTS) throw new Error(`${MAX_SLOTS} sauvegardes au plus : supprimes-en une d’abord.`);
  const now = Date.now();
  const slot = {
    v: SAVE_V, id: now.toString(36) + Math.random().toString(36).slice(2, 6), name: String(name).slice(0, 24),
    cid: state.cid, cv: state.cv, created: now, updated: now, playMs: 0, party, state, checkpoints: [],
  };
  writeSlot(slot);
  return slot;
}

// Enregistre l'état ; label : point de reprise (chapitre) à garder aussi, ex. le début d'un acte
export function saveSlot(slot, state, { label = null, party = null, playMs = 0 } = {}) {
  slot.state = state;
  slot.updated = Date.now();
  slot.playMs = (slot.playMs || 0) + playMs;
  if (party) slot.party = [...new Set([...(slot.party || []), ...party])].slice(0, 8);
  if (label) {
    slot.checkpoints = (slot.checkpoints || []).filter((c) => c.label !== label);
    slot.checkpoints.push({ label, at: slot.updated, state });
    if (slot.checkpoints.length > MAX_CKPT) slot.checkpoints.shift();
  }
  writeSlot(slot);
  if (state.ending) addEnding(state.ending);
}

export function renameSlot(id, name) {
  const r = loadSlot(id);
  if (!r.ok) return false;
  r.slot.name = String(name).slice(0, 24);
  writeSlot(r.slot);
  return true;
}

export function deleteSlot(id) {
  store.del(SLOT + id);
  writeIndex(readIndex().filter((e) => e.id !== id));
}

// Reprendre à un chapitre : l'état du point de reprise remplace l'état courant (les chapitres restent)
export function rewindSlot(id, label) {
  const r = loadSlot(id);
  if (!r.ok) return null;
  const c = (r.slot.checkpoints || []).find((x) => x.label === label);
  if (!c) return null;
  r.slot.state = c.state;
  r.slot.updated = Date.now();
  writeSlot(r.slot);
  return r.slot;
}

export function readMeta() {
  try { const m = JSON.parse(store.get(META) || '{}'); return { endings: Array.isArray(m.endings) ? m.endings : [] }; } catch { return { endings: [] }; }
}
function addEnding(id) {
  const m = readMeta();
  if (m.endings.includes(id)) return;
  m.endings.push(id);
  try { store.set(META, JSON.stringify(m)); } catch {}
}
