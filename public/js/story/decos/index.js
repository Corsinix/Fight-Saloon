// Décors des épisodes du mode histoire (un fichier par groupe de mini-jeux), réunis : épisode -> réglages de décor,
// envoyés aux joueurs avec l'épisode (host.js : meta.deco) et lus par la scène du mini-jeu (hooks.story.deco).
import { DECOS as VILLE } from './ville.js';
import { DECOS as ROUTES } from './routes.js';
import { DECOS as BATAILLES } from './batailles.js';

export const DECOS = { ...VILLE, ...ROUTES, ...BATAILLES };
