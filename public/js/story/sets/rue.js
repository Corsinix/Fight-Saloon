// La grand-rue de Dusty Gulch (860 px : la caméra la parcourt). D'après les photos de Tombstone, Bodie et Virginia City :
// fausses façades à corniche sur consoles, trottoir de planches couvert d'un auvent sur poteaux (balcons à balustres
// à l'étage de l'hôtel, du saloon et du barbier), vitrines à carreaux, fenêtres à guillotine, enseignes peintes.
// Échelle des acteurs (~70 px) : rez-de-chaussée de 60 px (porte 46 px + imposte), étage de 54 px.
// Repères des cinématiques (cuts.js) : sol des façades y 160 ; planchers des balcons y 100 (les tireurs de
// diablo-rue : hôtel x 92, saloon x 364, barbier x 806) ; bouteilles de gulch-brule sur la porte-fenêtre du saloon
// (302, 64), la fenêtre à barreaux du shérif (403, 136), la fenêtre de l'étage de l'épicerie (518, 88) ; portes du
// saloon x 302 (la bande y entre), du bureau du shérif x 432 (El Diablo y est enfermé).
import * as S from '../../sprites.js';
import { H } from '../../worlds.js';
import { bands, flames, smoke, halo, farMesas } from './kit.js';
import {
  OUT, R, rnd, hash, shadow, box, siding, brick, stone, cornice, sash, door, shopWindow, porch, balcony, boardwalk,
  steps, signboard, ghostText, hangSign, barrel, crate, sack, hitchRail, trough, horse, horseTail, wagon, barberPole,
  wallLamp, poster, telePole, wire, tuft,
} from './kit-ville.js';

const BASE = 160; // pied des façades, dessus du trottoir
const DECK = 7;   // profondeur du trottoir
const BAL = 100;  // bord de l'auvent = plancher des balcons
const sh = S.shade;
// les chevaux attachés (la queue bat dans anim) : [x, sol, dir, robe]
const HORSES = [[30, 180, 1, '#6a3a22'], [748, 180, -1, '#c8b8a0']];

// Fausse façade : mur de x à x + w, du haut top jusqu'au trottoir, contour sombre
function wall(g, x, w, top, fill) {
  R(g, x - 1, top - 1, w + 2, BASE - top + 1, OUT);
  fill(x, top, w, BASE - top);
}

// ---------------------------------------------------------------- les bâtiments
// Chacun pousse ses vitres dans wins (fenêtres éclairées la nuit) et ses lanternes dans lamps.
function hotel(g, wins, lamps) {
  const x = 6, w = 112, top = 26, trim = '#3e5236';
  wall(g, x, w, top, (a, b, c, d) => siding(g, a, b, c, d, '#8a6a48', 3, { paint: '#d4c094', peel: 0.55, stain: 1 }));
  cornice(g, x, top, w, '#d8c8a0');
  signboard(g, x + w / 2, top + 13, 'GRAND HÔTEL', { bg: trim, fg: '#f4e4b8', frame: '#d8c070' });
  ghostText(g, 'CHAMBRES', x + w / 2, top + 30, '#5a4a30', 0.5);
  for (const cx of [21, 62, 103]) wins.push(sash(g, x + cx - 7, 62, 14, 28, { shutters: trim, curtain: '#f0e8d8' }));
  // rez-de-chaussée : double porte vitrée, deux hautes fenêtres, un banc, des affiches
  wins.push(...door(g, x + 44, BASE, 24, 45, { double: true, glass: true, col: '#4a3420', transom: 6, blind: '#d8c8a0' }));
  for (const cx of [20, 92]) wins.push(sash(g, x + cx - 9, 113, 18, 36, { frame: '#e8dcc0', blind: '#e0d0a8' }));
  poster(g, x + 76, 118, 10, 13, '#e0cc98', false);
  porch(g, x - 4, x + w + 4, BAL, BASE, [x - 2, x + 54, x + w - 1], { col: '#5a4a32', post: '#d4c4a0' });
  balcony(g, x - 3, x + w + 3, BAL, { col: '#e0d4b0' });
  // le banc sous l'auvent
  box(g, x + 70, BASE - 9, 22, 3, '#7a5232'); box(g, x + 72, BASE - 6, 2, 6, '#5a3a22'); box(g, x + 88, BASE - 6, 2, 6, '#5a3a22');
  lamps.push([x + 54 + 6, BAL + 9]);
}

function bank(g, wins) {
  const x = 128, w = 92, top = 44, st = '#c4b494';
  wall(g, x, w, top, (a, b, c, d) => brick(g, a, b, c, d, '#9a4a30', '#b89a7a', 7));
  // pilastres et bandeau de pierre
  for (const px of [x, x + w - 7]) { stone(g, px, top + 10, 7, BASE - top - 10, st, px, 6); R(g, px + 6, top + 10, 1, BASE - top - 10, OUT); }
  stone(g, x, 100, w, 5, st, 3, 5); R(g, x, 105, w, 1, OUT); shadow(g, x + 7, 106, w - 14, 2, 0.3);
  cornice(g, x, top, w, st, { brackets: 9 });
  // le cartouche gravé
  box(g, x + 18, top + 14, w - 36, 13, sh(st, 0.08)); R(g, x + 19, top + 15, w - 38, 1, sh(st, 0.3));
  signboard(g, x + w / 2, top + 14, 'BANQUE', { bg: sh(st, 0.06), fg: '#4a3020', frame: sh(st, -0.25), h: 13 });
  // fenêtres de l'étage, cintrées ; en bas, fenêtres à barreaux et porte dans son encadrement de pierre
  for (const cx of [26, 66]) {
    const wx = x + cx - 7;
    wins.push(sash(g, wx, 76, 14, 20, { frame: '#e8dcc0', cap: false }));
    R(g, wx - 2, 72, 18, 4, OUT); R(g, wx - 1, 73, 16, 2, st); R(g, wx + 4, 71, 6, 2, st); R(g, wx + 4, 70, 6, 1, OUT); // l'arc et sa clé
  }
  for (const cx of [21, 71]) wins.push(sash(g, x + cx - 8, 114, 16, 34, { frame: '#e8dcc0', bars: '#2a2a30' }));
  stone(g, x + 31, 104, 30, BASE - 104, sh(st, -0.04), 9, 7); R(g, x + 30, 104, 32, 1, OUT);
  wins.push(...door(g, x + 35, BASE, 22, 44, { double: true, glass: true, col: '#3a2418', transom: 7, frame: '#d8c8a8' }));
  canvasLetters(g, '1872', x + w / 2, top + 30, '#5a4030');
  // deux marches de pierre
  for (let k = 0; k < 2; k++) { R(g, x + 28 - k * 3, BASE + 1 + k * 3, 36 + k * 6, 4, OUT); R(g, x + 29 - k * 3, BASE + 1 + k * 3, 34 + k * 6, 3, st); R(g, x + 29 - k * 3, BASE + 1 + k * 3, 34 + k * 6, 1, sh(st, 0.25)); }
}
// petit texte peint (date, numéro)
function canvasLetters(g, text, cx, y, col) { ghostText(g, text, cx, y, col, 0.8); }

function saloon(g, wins, lamps) {
  const x = 232, w = 140, top = 26, cream = '#e4d4a8', red = '#8a3426';
  const siding2 = (a, b, c, d) => siding(g, a, b, c, d, '#7a4a30', 11, { paint: red, peel: 0.4, stain: 1 });
  // la tour du fronton, plus haute au milieu
  wall(g, x + 36, w - 72, 12, siding2);
  wall(g, x, w, top, siding2);
  cornice(g, x + 36, 12, w - 72, cream, { brackets: 10 });
  R(g, x + w / 2 - 6, 6, 12, 6, OUT); R(g, x + w / 2 - 5, 7, 10, 5, cream); R(g, x + w / 2 - 2, 3, 4, 4, OUT); R(g, x + w / 2 - 1, 4, 2, 3, '#f8d070'); // l'épi
  cornice(g, x, top, 36, cream, { brackets: 10 }); cornice(g, x + w - 36, top, 36, cream, { brackets: 10 });
  signboard(g, x + w / 2, 33, 'BUCKSHOT SALOON', { bg: '#2a1810', fg: '#f8d070', frame: '#c8a050', h: 15, pad: 8 });
  for (const sx of [x + 14, x + w - 14]) { R(g, sx - 3, 34, 7, 7, OUT); S.disc(g, sx, 37, 2, '#c8a050'); } // rosaces
  // l'étage : quatre fenêtres à rideaux, une porte-fenêtre au milieu sur le balcon
  for (const cx of [14, 42, 98, 126]) wins.push(sash(g, x + cx - 7, 62, 14, 28, { frame: cream, curtain: '#e8d8c0' }));
  wins.push(...door(g, x + 62, BAL, 16, 34, { glass: true, col: '#4a2418', transom: 0, frame: cream }));
  R(g, x + 59, 60, 22, 3, OUT); R(g, x + 60, 61, 20, 1, cream);
  // le rez-de-chaussée : l'embrasure des portes battantes, deux vitrines à brise-bise
  const dx = x + w / 2 - 14;
  R(g, dx - 4, 104, 36, BASE - 104, OUT); R(g, dx - 3, 105, 34, BASE - 105, cream); R(g, dx - 3, 105, 34, 1, sh(cream, 0.25));
  R(g, dx, 108, 28, BASE - 108, '#24140c'); // la salle, au fond
  R(g, dx + 2, 110, 24, 6, '#3a2216'); for (let k = 0; k < 5; k++) R(g, dx + 4 + k * 5, 111, 2, 4, ['#4a7a3a', '#a8582a', '#c8a050', '#5a3a6a', '#3a6a2a'][k]); // les bouteilles du fond
  wins.push([dx, 108, 28, BASE - 108]);
  for (const [bx, s] of [[dx, 1], [dx + 15, -1]]) { // les battants
    R(g, bx - 1, 121, 15, 22, OUT); R(g, bx, 122, 13, 20, '#a8703c'); R(g, bx, 122, 13, 1, '#d09a58');
    for (let k = 1; k < 13; k += 3) R(g, bx + k, 125, 2, 13, '#7a4a24');
    R(g, bx + (s > 0 ? 0 : 12), 122, 1, 20, '#5a3418');
    for (let k = 0; k < 13; k++) R(g, bx + k, 121 - Math.round(Math.sin((k / 12) * Math.PI) * 2), 1, 1, OUT); // le haut chantourné
  }
  for (const sx of [x + 10, x + w - 48]) wins.push(shopWindow(g, sx, 157, 38, 44, { frame: cream, col: '#4a2418', cols: 3, rows: 2, goods: (gg, gx, gy, gw, gh) => { R(gg, gx, gy + gh - 12, gw, 12, '#e8dcc0'); for (let k = 0; k < gw; k += 3) R(gg, gx + k, gy + gh - 12, 1, 12, '#c8b898'); } }));
  porch(g, x - 4, x + w + 4, BAL, BASE, [x - 2, x + 38, x + w - 41, x + w - 1], { col: '#4a2a1a', post: cream });
  balcony(g, x - 3, x + w + 3, BAL, { col: cream });
  lamps.push([x + 38 + 6, BAL + 9], [x + w - 41 + 6, BAL + 9]);
}

function sheriff(g, wins, lamps) {
  const x = 384, w = 96, top = 62, st = '#b4a282';
  wall(g, x, w, top, (a, b, c, d) => stone(g, a, b, c, d, st, 21, 7));
  cornice(g, x, top, w, '#7a5a3a', { brackets: 11 });
  signboard(g, x + w / 2, top + 15, 'SHÉRIF', { bg: '#2a2622', fg: '#f8d070', frame: '#a08040' });
  for (const sx of [x + 18, x + w - 18]) { // l'étoile, deux fois
    const sy = top + 21;
    for (const [ax, ay, aw, ah] of [[-1, -4, 3, 9], [-4, -1, 9, 3], [-3, -3, 7, 7]]) R(g, sx + ax - 1, sy + ay - 1, aw + 2, ah + 2, OUT);
    for (const [ax, ay, aw, ah] of [[-1, -4, 3, 9], [-4, -1, 9, 3], [-3, -3, 7, 7]]) R(g, sx + ax, sy + ay, aw, ah, '#e0b040');
    R(g, sx, sy, 1, 1, '#a06a20'); R(g, sx - 2, sy - 2, 2, 1, '#f8e090');
  }
  // fenêtres à barreaux de la prison, porte bardée de fer
  for (const wx of [x + 8, x + w - 24]) wins.push(sash(g, wx, 116, 18, 30, { frame: '#8a7a62', bars: '#2a2a30', cap: false }));
  wins.push(...door(g, x + 38, BASE, 20, 46, { col: '#4a3a2a', transom: 6, frame: '#8a7a62' }));
  for (const yy of [118, 136]) R(g, x + 38, yy, 20, 2, '#3a3a42');
  // le tableau des avis de recherche
  poster(g, x + 62, 116, 7, 9); poster(g, x + 63, 128, 7, 9); poster(g, x + 30, 126, 6, 8);
  porch(g, x - 4, x + w + 4, BAL, BASE, [x - 2, x + w - 1], { col: '#5a3a24', post: '#8a6a44' });
  lamps.push([x + 30, BAL + 9]);
}

function store(g, wins) {
  const x = 492, w = 104, top = 36, wood = '#8e8070';
  wall(g, x, w, top, (a, b, c, d) => siding(g, a, b, c, d, wood, 31, { stain: 1.4 }));
  cornice(g, x, top, w, '#7a6a58', { brackets: 13 });
  // les lettres peintes à même les planches, délavées (comme le Boston Store de Bodie)
  ghostText(g, 'ÉPICERIE', x + w / 2, top + 12, '#2e2620', 0.5, 16);
  R(g, x + 10, top + 25, w - 20, 1, sh(wood, 0.2));
  ghostText(g, 'GRAINS · OUTILS', x + w / 2, top + 29, '#2e2620', 0.42);
  for (const cx of [26, 78]) wins.push(sash(g, x + cx - 7, 62, 14, 28, { frame: '#cfc4a8', blind: '#d8c8a0' }));
  // la devanture
  const goods = (gg, gx, gy, gw, gh) => { // conserves, bocaux, une selle
    for (let k = 0; k < gw - 2; k += 4) { R(gg, gx + 1 + k, gy + gh - 7, 3, 6, ['#a8302a', '#c8a050', '#4a7a3a', '#d8c8a0'][(k / 4) % 4]); }
    R(gg, gx + 2, gy + gh - 16, gw - 4, 1, '#6a4a2a');
    for (let k = 0; k < gw - 4; k += 6) R(gg, gx + 3 + k, gy + gh - 22, 4, 6, ['#6a8aa0', '#c8b088', '#8a5a34'][(k / 6) % 3]);
  };
  wins.push(shopWindow(g, x + 6, BASE - 1, 34, 46, { col: '#4a3a2a', frame: '#cfc4a8', goods, rows: 3 }));
  wins.push(shopWindow(g, x + w - 40, BASE - 1, 34, 46, { col: '#4a3a2a', frame: '#cfc4a8', goods, rows: 3 }));
  wins.push(...door(g, x + 42, BASE, 20, 46, { glass: true, col: '#4a3a2a', transom: 6, frame: '#cfc4a8', blind: '#d8c8a0' }));
  porch(g, x - 4, x + w + 4, BAL, BASE, [x - 2, x + w - 1], { col: '#5a4e40', post: '#9a8e7a' });
  hangSign(g, x + w / 2 + 34, BAL + 11, 'OUVERT', { bg: '#eadcb0', fg: '#7a1a14', frame: '#7a1a14' });
}

function post(g, wins, lamps) {
  const x = 664, w = 92, top = 50, blue = '#7a8a96';
  wall(g, x, w, top, (a, b, c, d) => siding(g, a, b, c, d, '#8a6a48', 41, { paint: blue, peel: 0.6, stain: 0.8 }));
  // un fronton triangulaire au-dessus de la corniche
  for (let k = 0; k < 10; k++) { R(g, x + w / 2 - 14 + k * 1.4 - 1, top - 10 + k - 1, 28 - k * 2.8 + 2, 2, OUT); }
  for (let k = 0; k < 10; k++) R(g, x + w / 2 - 14 + k * 1.4, top - 10 + k, 28 - k * 2.8, 1, k ? blue : '#e0dcd0');
  R(g, x + w / 2 - 1, top - 6, 3, 3, '#e0b040');
  cornice(g, x, top, w, '#e0dcd0', { brackets: 10 });
  signboard(g, x + w / 2, top + 14, 'POSTE', { bg: '#e8e0cc', fg: '#2a3a5a', frame: '#2a3a5a' });
  ghostText(g, 'TÉLÉGRAPHE', x + w / 2, top + 31, '#2a3440', 0.55);
  wins.push(sash(g, x + w / 2 - 7, 84, 14, 12, { frame: '#e0dcd0', panes: 3, cap: false }));
  wins.push(shopWindow(g, x + 6, BASE - 1, 28, 44, { col: '#3a4a5a', frame: '#e0dcd0', cols: 3 }));
  wins.push(shopWindow(g, x + w - 34, BASE - 1, 28, 44, { col: '#3a4a5a', frame: '#e0dcd0', cols: 3 }));
  wins.push(...door(g, x + 37, BASE, 18, 46, { glass: true, col: '#3a4a5a', transom: 6, frame: '#e0dcd0' }));
  box(g, x + 58, 128, 5, 7, '#2a3a5a'); R(g, x + 58, 130, 5, 1, '#e0b040'); // la boîte aux lettres
  porch(g, x - 4, x + w + 4, BAL, BASE, [x - 2, x + w / 2 - 1, x + w - 1], { col: '#4a5260', post: '#d8d4c8' });
  lamps.push([x + w / 2 + 5, BAL + 9]);
}

function barber(g, wins, lamps) {
  const x = 766, w = 90, top = 30, cream = '#e8e0cc', paint = '#9aa47e';
  wall(g, x, w, top, (a, b, c, d) => siding(g, a, b, c, d, '#8a6a48', 51, { paint, peel: 0.45, stain: 1 }));
  cornice(g, x, top, w, cream, { brackets: 10 });
  signboard(g, x + w / 2, top + 14, 'BARBIER', { bg: '#7a1a14', fg: '#f4e8d0', frame: '#e8e0cc' });
  ghostText(g, 'BAINS CHAUDS', x + w / 2, top + 31, '#3a4a2a', 0.5);
  for (const cx of [20, 70]) wins.push(sash(g, x + cx - 7, 62, 14, 28, { frame: cream, curtain: '#c8a0a0', shutters: '#5a6a4a' }));
  wins.push(shopWindow(g, x + 6, BASE - 1, 26, 44, { col: '#4a5a3a', frame: cream, cols: 2 }));
  wins.push(shopWindow(g, x + w - 26, BASE - 1, 22, 44, { col: '#4a5a3a', frame: cream, cols: 2 }));
  wins.push(...door(g, x + 38, BASE, 18, 46, { glass: true, col: '#4a5a3a', transom: 6, frame: cream, blind: '#e8d8c8' }));
  porch(g, x - 4, x + w + 4, BAL, BASE, [x - 2, x + w - 1], { col: '#4a5236', post: cream });
  balcony(g, x - 3, x + w + 3, BAL, { col: cream });
  lamps.push([x + 30, BAL + 9]);
}

// ---------------------------------------------------------------- calques
// Le plan intermédiaire (parallaxe 0,6) : l'arrière de la ville, plus pâle — toits à pignon, église et son clocher,
// éolienne, grange — vu au-dessus des bâtiments bas et dans les ruelles.
function backTown(g, w) {
  const hz = 132;
  const haze = (c) => S.mix(c, '#d8b894', 0.38);
  R(g, 0, hz, w, BASE - hz, haze('#a87a52'));
  const r = rnd(77);
  const house = (x, bw, bh, col, roof = true) => {
    const c = haze(col), top = BASE - 6 - bh;
    R(g, x - 1, top - 1, bw + 2, bh + 1, haze('#3a2618'));
    R(g, x, top, bw, bh, c);
    for (let yy = top + 4; yy < BASE - 6; yy += 4) R(g, x, yy, bw, 1, sh(c, -0.12));
    if (roof) for (let k = 0; k < Math.ceil(bw / 2); k++) R(g, x + k, top - Math.min(k, bw - k) * 0.5 - 1, Math.max(1, bw - k * 2), 1, haze('#5a3a2a'));
    for (let wx = x + 4; wx < x + bw - 5; wx += 10) { R(g, wx, top + 8, 4, 6, haze('#2a2430')); }
  };
  // église (clocher), éolienne, grange, maisons
  for (let x = -10; x < w; x += 34 + Math.floor(r() * 30)) house(x, 24 + Math.floor(r() * 18), 22 + Math.floor(r() * 18), ['#8a6a4a', '#9a7a58', '#7a5a42', '#a08a6a'][Math.floor(r() * 4)], r() < 0.7);
  const church = (x) => {
    const c = haze('#d8ccb0'), d = haze('#3a2618');
    R(g, x - 1, BASE - 61, 42, 56, d); R(g, x, BASE - 60, 40, 54, c);
    for (let k = 0; k < 21; k++) R(g, x + k, BASE - 60 - k * 0.6, 40 - k * 2, 1, haze('#6a4a3a'));
    R(g, x + 12, BASE - 124, 16, 66, d); R(g, x + 13, BASE - 123, 14, 64, c); // le clocher
    R(g, x + 11, BASE - 126, 18, 3, d); R(g, x + 16, BASE - 118, 8, 12, d); R(g, x + 19, BASE - 118, 2, 12, c); // l'abat-son
    for (let k = 0; k < 22; k++) { const hw = Math.max(1, Math.round(8 - k * 0.36)); R(g, x + 20 - hw, BASE - 127 - k, hw * 2, 1, k % 3 ? haze('#6a4a3a') : d); } // la flèche
    R(g, x + 19, BASE - 158, 2, 10, d); R(g, x + 16, BASE - 155, 8, 2, d); // la croix
    S.disc(g, x + 20, BASE - 96, 3, d); S.disc(g, x + 20, BASE - 96, 2, haze('#c8a050'));
    R(g, x + 17, BASE - 30, 6, 24, d); R(g, x + 6, BASE - 46, 5, 9, d); R(g, x + 29, BASE - 46, 5, 9, d);
  };
  const mill = (x) => {
    const d = haze('#3a2618');
    for (let k = 0; k < 70; k++) { R(g, x - 6 + Math.round(k * 0.06), BASE - 6 - k, 1, 1, d); R(g, x + 6 - Math.round(k * 0.06), BASE - 6 - k, 1, 1, d); }
    for (let k = 10; k < 70; k += 12) R(g, x - 5 + Math.round(k * 0.06), BASE - 6 - k, 11 - Math.round(k * 0.12), 1, d);
    S.disc(g, x, BASE - 80, 10, d); S.disc(g, x, BASE - 80, 8, haze('#a89878'));
    for (let a = 0; a < 16; a++) { const an = (a / 16) * Math.PI * 2; for (let k = 2; k < 9; k++) R(g, Math.round(x + Math.cos(an) * k), Math.round(BASE - 80 + Math.sin(an) * k), 1, 1, d); }
    R(g, x + 6, BASE - 81, 14, 2, d); R(g, x + 16, BASE - 86, 5, 9, d);
  };
  const barn = (x) => {
    const c = haze('#8a3a2a'), d = haze('#3a2618');
    R(g, x - 1, BASE - 47, 52, 42, d); R(g, x, BASE - 46, 50, 41, c);
    for (let k = 0; k < 14; k++) R(g, x - 3 + k * 2, BASE - 46 - k, 56 - k * 4, 1, haze('#5a2a20'));
    R(g, x + 18, BASE - 30, 14, 25, d); R(g, x + 21, BASE - 43, 8, 7, d);
  };
  church(300); mill(470); barn(560); mill(70);
  R(g, 0, BASE - 6, w, 6, haze('#8a6040'));
}

export default {
  w: 860, horizon: 130, ground: 186, outdoor: true,
  far: [
    { k: 0.3, draw: (g, w) => farMesas(g, w, 132, ['#b8826a', '#a06a54', '#c0907a'], 5) },
    { k: 0.6, draw: (g, w) => backTown(g, w) },
  ],
  back(g, w) {
    const wins = (this.wins = []), lamps = (this.lamps = []);
    // le château d'eau, dans la ruelle derrière l'épicerie
    const tx = 608;
    for (const lx of [tx + 4, tx + 20, tx + 38]) { R(g, lx - 1, 64, 5, BASE - 64, OUT); R(g, lx, 64, 3, BASE - 64, lx === tx + 20 ? '#4a2a18' : '#5a3a22'); }
    for (let yy = 76; yy < BASE - 6; yy += 16) for (let k = 0; k < 34; k++) R(g, tx + 6 + k, yy + Math.round((k * 12) / 34), 1, 1, '#4a2a18'), R(g, tx + 6 + k, yy + 12 - Math.round((k * 12) / 34), 1, 1, '#4a2a18');
    R(g, tx - 3, 27, 50, 39, OUT); battens(g, tx - 2, 28, 48, 37, '#8a5a38');
    for (const yy of [32, 46, 60]) { R(g, tx - 3, yy, 50, 2, '#3a3a42'); R(g, tx - 2, yy, 48, 1, '#6a6a72'); }
    for (let k = 0; k < 6; k++) R(g, tx - 4 + k * 2, 26 - k * 2, 52 - k * 4, 2, k ? '#5a3420' : OUT); // le toit conique
    R(g, tx + 44, 54, 10, 3, OUT); R(g, tx + 52, 54, 3, 12, OUT); // le bec verseur relevé
    // les bâtiments, de gauche à droite
    hotel(g, wins, lamps);
    bank(g, wins);
    saloon(g, wins, lamps);
    sheriff(g, wins, lamps);
    store(g, wins);
    post(g, wins, lamps);
    barber(g, wins, lamps);
    // le trottoir de planches, interrompu par la ruelle de l'épicerie
    boardwalk(g, 0, 600, BASE, 1, DECK);
    boardwalk(g, 660, w, BASE, 2, DECK);
    R(g, 600, BASE, 60, 11, '#8a5a3a'); R(g, 600, BASE, 60, 1, '#6a4428'); // le sol de la ruelle
    steps(g, 290, BASE, 24, DECK); steps(g, 420, BASE, 24, DECK); steps(g, 40, BASE, 22, DECK);
    for (const [lx, ly] of lamps) wallLamp(g, lx, ly);
    // la rue : terre battue, ornières, traces de sabots, cailloux, herbes sèches le long du trottoir
    const y0 = BASE + DECK + 5;
    bands(g, 0, y0, w, H - y0, ['#a8683e', '#b47246', '#bc7c4e', '#c48656', '#c88c5c']);
    const r = rnd(11);
    for (let i = 0; i < w * 0.9; i++) R(g, Math.floor(r() * w), y0 + 2 + Math.floor(r() * (H - y0 - 2)), r() < 0.3 ? 2 : 1, 1, r() < 0.5 ? '#d8a070' : '#8a4a2a');
    for (const [yy, ph] of [[184, 0], [188, 3], [203, 7], [207, 11]]) for (let x = 0; x < w; x += 2) {
      const k = hash(x + ph * 97);
      if (k < 0.8) R(g, x, yy + Math.round(Math.sin(x / 90 + ph) * 1.2), 2, 1, k < 0.4 ? '#8e5030' : '#9a5a36');
      if (k > 0.93) R(g, x, yy + 1, 2, 1, '#d4a070');
    }
    for (let i = 0; i < 60; i++) { const hx = Math.floor(r() * w), hy = 178 + Math.floor(r() * 34); R(g, hx, hy, 2, 1, '#8a4a2a'); R(g, hx, hy + 1, 1, 1, '#d09868'); } // sabots
    for (let i = 0; i < 12; i++) { const px = Math.floor(r() * w), py = 176 + Math.floor(r() * 36); R(g, px, py, 3, 2, '#9a8a7a'); R(g, px, py, 2, 1, '#c8b8a8'); }
    for (let x = 6; x < w; x += 30 + Math.floor(r() * 50)) tuft(g, x, y0 + 3, r() < 0.5 ? '#a89a5a' : '#8a8a4a');
    // les fils et poteaux du télégraphe, au bord de la rue
    const pts = [[124, 182], [604, 182], [760, 182]].map(([px, b]) => telePole(g, px, b, 176));
    for (let i = 0; i < pts.length - 1; i++) for (const k of [0, 3]) wire(g, pts[i][k][0], pts[i][k][1], pts[i + 1][k][0], pts[i + 1][k][1], 9 + k, '#4a3226');
    for (const k of [0, 3]) { wire(g, -4, pts[0][k][1] + 6, pts[0][k][0], pts[0][k][1], 3, '#4a3226'); wire(g, pts[2][k][0], pts[2][k][1], w + 4, pts[2][k][1] + 6, 3, '#4a3226'); }
    // barres d'attache, chevaux, abreuvoir, chariot, tonneaux, sacs, caisses
    hitchRail(g, 18, 182, 76);
    hitchRail(g, 676, 182, 76);
    hitchRail(g, 246, 182, 36);
    for (const [hx, hb, d, c] of HORSES) horse(g, hx, hb, d, c, d > 0 ? {} : { blanket: '#2a4a6a', saddle: '#6a3a1e' });
    trough(g, 330, 182, 34);
    wagon(g, 598, 180);
    barrel(g, 498, BASE + 2); barrel(g, 515, BASE + 2, '#7a4a24'); sack(g, 532, BASE + 2); sack(g, 541, BASE + 3, '#b8a078');
    crate(g, 572, BASE + 2, 18, '#a8783c', 'XX'); crate(g, 576, BASE - 16, 14);
    barrel(g, 222, BASE + 2, '#7a4a24', 20); // le tonneau d'eau entre la banque et le saloon
    barrel(g, 476, BASE + 3, '#8a5228', 20);
    crate(g, 360, 180, 14); barrel(g, 375, 182, '#7a4a24', 18);
    barberPole(g, 828, 112, 36);
  },
  lights() { return [...(this.wins || []), ...(this.lamps || []).map(([x, y]) => [x, y + 5, 18])]; },
  // les toits en feu (fx 'feu') : hors de la teinte, pour que les flammes restent vives la nuit
  light(ctx, t, fx) {
    if (fx.has('feu')) {
      for (const [x, y, w, s] of [[18, 26, 64, 1], [500, 36, 60, 2], [680, 50, 44, 3], [780, 30, 54, 4]]) {
        smoke(ctx, x + w / 2, y - 10, t + s * 700, { n: 9, life: 3600, rise: 0.03, drift: 0.01, r0: 5, grow: 0.007, col: '40,32,30', a: 0.6 });
        flames(ctx, x, y + 6, w, 26, t, s);
      }
    }
  },
  anim(ctx, t, fx) {
    for (const [hx, hb, d, c] of HORSES) horseTail(ctx, d > 0 ? hx + 2 : hx - 2, hb, d, c, t, hx);
    barberPole(ctx, 828, 112, 36, t);
    if (fx.has('fumee')) {
      for (let i = 0; i < 9; i++) {
        const x = ((i * 113 + t * 0.012) % 900) - 20, y = 150 + (i % 3) * 14;
        S.disc(ctx, Math.round(x), y, 12 + (i % 3) * 4, 'rgba(210,200,190,0.18)');
      }
    }
    if (fx.has('vent')) S.tumbleweed(ctx, Math.round(860 - ((t * 0.09) % 960)), Math.round(190 - Math.abs(Math.sin(t / 160)) * 7), t);
    // la ville sous la coupe d'El Diablo : ses bannières noir et rouge pendent des balcons et des auvents
    if (fx.has('regne')) {
      for (const [x, y, h] of [[34, 87, 32], [78, 87, 32], [262, 87, 34], [330, 87, 34], [426, 88, 28], [532, 102, 26], [800, 87, 32]]) {
        const sw = Math.round(Math.sin(t / 300 + x) * 1.2);
        R(ctx, x - 1, y - 1, 14, 2, OUT);
        for (let k = 0; k < h; k++) {
          const dx = Math.round((sw * k) / h);
          R(ctx, x + dx - 1, y + k, 14, 1, OUT);
          R(ctx, x + dx, y + k, 12, 1, k > h - 4 ? '#9a2a1c' : '#1e1416');
        }
        R(ctx, x + 4 + sw, y + 8, 4, 3, '#c0392b'); R(ctx, x + 5 + sw, y + 11, 2, 2, '#c0392b'); // le crâne
        R(ctx, x + 2 + sw, y + 6, 1, 2, '#c0392b'); R(ctx, x + 9 + sw, y + 6, 1, 2, '#c0392b');
      }
    }
  },
  glow(ctx, t, fx) {
    if (fx.has('feu')) for (const [x, y] of [[50, 20], [530, 30], [702, 44], [807, 24]]) halo(ctx, x, y, 60, '255,120,40', 1 + 0.2 * Math.sin(t / 90 + x));
  },
};

// planches verticales (château d'eau)
function battens(g, x, y, w, h, col) {
  R(g, x, y, w, h, col);
  for (let xx = x; xx < x + w; xx += 4) { R(g, xx, y, 1, h, sh(col, -0.28)); R(g, xx + 1, y, 1, h, sh(col, 0.1)); }
}
