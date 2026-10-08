// Joueurs d'une table, compactés pour le lien d'invitation : l'image de l'aperçu (invite/card.js) les dessine assis.
// Un joueur = 13 caractères d'apparence (un par partie puis par couleur, en base 36 ; « z » = inconnu),
// « * » si c'est un bot, puis son nom. Les joueurs sont séparés par des virgules (absentes des pseudos).
import { CHAR_PARTS, CHAR_COLORS } from './data.js';

const LOOK_LEN = CHAR_PARTS.length + CHAR_COLORS.length;

export function encodeLook(c = {}) {
  const parts = CHAR_PARTS.map((p) => p.options.findIndex(([id]) => id === c[p.key]));
  const colors = CHAR_COLORS.map((p) => (Number.isInteger(c[p.key]) ? c[p.key] : -1));
  return [...parts, ...colors].map((k) => (k >= 0 && k < 35 ? k.toString(36) : 'z')).join('');
}

export function decodeLook(s = '') {
  const c = {};
  CHAR_PARTS.forEach((p, i) => { const k = parseInt(s[i], 36); if (k < 35 && p.options[k]) c[p.key] = p.options[k][0]; });
  CHAR_COLORS.forEach((p, i) => { const k = parseInt(s[CHAR_PARTS.length + i], 36); if (k < 35 && k < p.colors.length) c[p.key] = k; });
  return c;
}

export const encodePlayers = (players) => players.slice(0, 6)
  .map((p) => `${encodeLook(p.character)}${p.bot ? '*' : ''}${String(p.name).replace(/,/g, ' ').slice(0, 20)}`).join(',');

export function decodePlayers(s = '') {
  return String(s).split(',').filter((e) => e.length > LOOK_LEN).slice(0, 6).map((e) => {
    const bot = e[LOOK_LEN] === '*';
    return { character: decodeLook(e.slice(0, LOOK_LEN)), bot, name: e.slice(LOOK_LEN + (bot ? 1 : 0)).slice(0, 20) };
  });
}
