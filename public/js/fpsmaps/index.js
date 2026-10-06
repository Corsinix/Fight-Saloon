// Les cartes du FPS en plus de la ville (fpsgame.js) : id -> générateur (seed) => { kit, spec }.
// Chaque carte a son fichier (générateur) et ses dessins (fpsart<Carte>.js, chargé par fps.js).
import { fortWorld } from './fort.js';
import { canyonWorld } from './canyon.js';
import { puebloWorld } from './pueblo.js';

export const EXTRA_MAPS = { fort: fortWorld, canyon: canyonWorld, pueblo: puebloWorld };
