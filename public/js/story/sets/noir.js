// Fond noir (cartons, générique)
import { W, H } from '../../worlds.js';
import { R } from './kit.js';

export default { w: W, horizon: 0, ground: 186, outdoor: false, back(g) { R(g, 0, 0, W, H, '#0a0503'); } };
