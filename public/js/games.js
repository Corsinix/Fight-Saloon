// Arbitres des mini-jeux : un par mode (navigateur de l'hôte, ou banc d'essai mini-test.html).
// variant : variante imposée par l'hôte (voir variants.js), ou null (tirée de la graine).
import { MiniGame } from './mini.js';
import { FortGame } from './fortgame.js';
import { WagonGame } from './wagongame.js';
import { PinteGame } from './pintegame.js';
import { MineGame } from './minegame.js';
import { CourseGame } from './coursegame.js';
import { RtsGame } from './rtsgame.js';
import { FpsGame } from './fpsgame.js';

const GAMES = {
  fort: (players, v) => new FortGame(players, v),
  wagon: (players) => new WagonGame(players),
  pinte: (players, v) => new PinteGame(players, v),
  mine: (players) => new MineGame(players),
  course: (players, v) => new CourseGame(players, v),
  rts: (players, v) => new RtsGame(players, v),
  fps: (players) => new FpsGame(players, 'fps'),
  fpsdm: (players) => new FpsGame(players, 'fpsdm'),
};

export const makeGame = (mode, players, variant = null) => (GAMES[mode] ? GAMES[mode](players, variant) : new MiniGame(mode, players, variant));
