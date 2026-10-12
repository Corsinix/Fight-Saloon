// Sauvegardes à emplacements, pour n'importe quel jeu (sur le modèle de story/save.js, qui garde les siennes) :
//   const saves = makeSlots('ville', { max: 3, version: 1 });
//   saves.list()            -> [{ n, auto, empty } | { n, auto, meta, savedAt } | { n, auto, bad, why }]
//   saves.save(n, data, meta) ; saves.load(n) -> { ok, data, meta } | { ok: false, why }
//   saves.remove(n) ; saves.exportFile(n) (téléchargement .json) ; await saves.importFile(file, n)
// L'emplacement 0 est l'emplacement AUTO (sauvegarde automatique) ; 1 à max, les emplacements manuels.
// Clés : <prefix>:index (résumés pour le menu, sans relire les grosses sauvegardes) et <prefix>:slot:<n>.
// Une sauvegarde abîmée (JSON illisible, somme de contrôle fausse, autre version) n'empêche jamais le jeu de
// démarrer : elle est signalée (bad) et ne peut qu'être supprimée ou exportée. Stockage refusé (navigation privée) :
// on garde en mémoire le temps de la session (memoryOnly) ; stockage plein : une erreur claire.

function hash32(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(36);
}

export function makeSlots(prefix, { max = 3, version = 1 } = {}) {
  const IDX = `${prefix}:index`, SLOT = `${prefix}:slot:`;
  const mem = new Map();
  let memoryOnly = false;
  const store = {
    get(k) {
      if (memoryOnly) return mem.get(k) ?? null;
      try { return localStorage.getItem(k); } catch { memoryOnly = true; return mem.get(k) ?? null; }
    },
    set(k, v) {
      mem.set(k, v);
      if (memoryOnly) return;
      try { localStorage.setItem(k, v); } catch (e) {
        if (e?.name === 'QuotaExceededError') throw new Error('Sauvegarde impossible : le stockage du navigateur est plein.');
        memoryOnly = true;
      }
    },
    del(k) { mem.delete(k); try { localStorage.removeItem(k); } catch {} },
  };
  const readIndex = () => {
    try { const v = JSON.parse(store.get(IDX) || '{}'); return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; } catch { return {}; }
  };

  // vérifie une sauvegarde lue (du stockage ou d'un fichier)
  function check(raw) {
    let s;
    try { s = JSON.parse(raw); } catch { return { ok: false, why: 'illisible' }; }
    if (!s || typeof s !== 'object' || typeof s.data !== 'string') return { ok: false, why: 'forme inattendue' };
    if (s.prefix && s.prefix !== prefix) return { ok: false, why: 'sauvegarde d\'un autre jeu' };
    if (s.v !== version) return { ok: false, why: s.v > version ? 'version trop récente' : 'ancienne version' };
    if (s.sum !== hash32(s.data)) return { ok: false, why: 'somme de contrôle fausse' };
    try { return { ok: true, data: JSON.parse(s.data), meta: s.meta || {}, savedAt: s.savedAt || 0 }; } catch { return { ok: false, why: 'illisible' }; }
  }

  const api = {
    get memoryOnly() { return memoryOnly; },
    max,
    list() {
      const idx = readIndex();
      const out = [];
      for (let n = 0; n <= max; n++) {
        const e = idx[n];
        if (!e && !store.get(SLOT + n)) { out.push({ n, auto: n === 0, empty: true }); continue; }
        if (e && !e.bad) { out.push({ n, auto: n === 0, meta: e.meta || {}, savedAt: e.savedAt || 0 }); continue; }
        const r = check(store.get(SLOT + n) || '');
        out.push(r.ok ? { n, auto: n === 0, meta: r.meta, savedAt: r.savedAt } : { n, auto: n === 0, bad: true, why: r.why });
      }
      return out;
    },
    load(n) {
      const raw = store.get(SLOT + n);
      if (!raw) return { ok: false, why: 'emplacement vide' };
      return check(raw);
    },
    save(n, data, meta = {}) {
      const s = JSON.stringify(data);
      const savedAt = Date.now();
      store.set(SLOT + n, JSON.stringify({ prefix, v: version, n, savedAt, meta, sum: hash32(s), data: s }));
      const idx = readIndex();
      idx[n] = { meta, savedAt };
      store.set(IDX, JSON.stringify(idx));
      return savedAt;
    },
    remove(n) {
      store.del(SLOT + n);
      const idx = readIndex();
      delete idx[n];
      store.set(IDX, JSON.stringify(idx));
    },
    // télécharge l'emplacement n (même abîmé : on récupère ce qu'il y a)
    exportFile(n, name = `${prefix}-${n === 0 ? 'auto' : n}`) {
      const raw = store.get(SLOT + n);
      if (!raw) return false;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([raw], { type: 'application/json' }));
      a.download = `${name.replace(/[^\w-]+/g, '_')}.json`;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
      return true;
    },
    // importe un fichier dans l'emplacement n (vérifié avant d'écraser quoi que ce soit)
    async importFile(file, n) {
      const raw = await file.text();
      const r = check(raw);
      if (!r.ok) return r;
      api.save(n, r.data, r.meta);
      return r;
    },
    // ouvre le sélecteur de fichier du navigateur, puis importFile
    pickFile(n) {
      return new Promise((resolve) => {
        const inp = document.createElement('input');
        inp.type = 'file';
        inp.accept = '.json,application/json';
        inp.onchange = async () => resolve(inp.files[0] ? await api.importFile(inp.files[0], n) : { ok: false, why: 'aucun fichier' });
        inp.click();
      });
    },
  };
  return api;
}
