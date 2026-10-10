// Point d'entrée du mode histoire côté joueur (chargé à la demande par main.js) : l'écran, les musiques,
// les sauvegardes (menu « Mode histoire »), et un hôte local pour le banc d'essai (story-test.html).
import { addSongs } from '../audio.js';
import { StoryScene } from './scene.js';
import { DATA } from './data.js';
import { newRun, next } from './engine.js';
import * as SAVE from './save.js';

export { StoryScene, DATA, SAVE };

// Les musiques inédites rejoignent celles du jeu (une fois)
let songs = null;
export function loadMusic() {
  songs ||= import('./music.js').then((M) => addSongs(M.SONGS, M.PLAYLISTS)).catch((e) => console.warn('musiques du mode histoire', e));
  return songs;
}
loadMusic();

// Nouvelle aventure dans un emplacement libre
export function newSlot(bande, party) {
  const state = newRun(DATA, { bande, seed: Date.now() % 1e9 });
  return SAVE.createSlot({ name: bande, state, party });
}

// Banc d'essai : l'aventure jouée dans la page, sans table ni réseau. Les épisodes se jouent pour de faux
// (touches W, L, H : gagné, perdu, exploit). node : commencer à ce lieu ; flags : drapeaux déjà vrais.
export function runLocal(canvas, { players, node = null, flags = [], map = false }) {
  const humans = players.map((p, i) => ({ key: `p${i}`, name: p.name, character: p.character, bot: false }));
  const env = { humans: humans.length, has: () => true };
  let state = newRun(DATA, { bande: 'Les Testeurs', seed: 1 });
  for (const f of flags) state.flags[f] = true;
  if (node && DATA.campaign.nodes[node]) {
    Object.assign(state, { at: 'node', node, here: node, pc: 0, act: DATA.campaign.nodes[node].act || 1 });
    if (!state.unlocked.includes(node)) state.unlocked.push(node);
  }
  if (map) { // directement sur la carte, les lieux du premier acte ouverts
    Object.assign(state, { at: 'map', node: null });
    for (const [id, n] of Object.entries(DATA.campaign.nodes)) if ((n.act || 1) === 1 && !state.unlocked.includes(id)) state.unlocked.push(id);
  }
  let res = next(state, null, DATA, env);
  const view = () => ({ seq: res.state.seq, wait: res.wait, ready: [], votes: {}, deadline: 0, chef: humans[0].name, snap: res.state });
  const go = (input) => {
    const r = next(res.state, input, DATA, env);
    if (!r.ok) return;
    res = r;
    scene.update(view());
  };
  const scene = new StoryScene(canvas, {
    me: 'p0',
    players: () => humans,
    isHost: () => true,
    music: () => {},
    menu: () => {},
    quit: () => location.reload(),
    test: (label) => go({ type: 'outcome', ep: res.wait.ep, label }),
    send: (m) => {
      const w = res.wait;
      if (m.t === 'storyReady' || m.t === 'storySkip') go({ type: 'next' });
      else if (m.t === 'storyVote') go(w.kind === 'map' ? { type: 'travel', node: m.id } : { type: 'choose', id: m.id });
    },
  });
  scene.update(view());
  return scene;
}
